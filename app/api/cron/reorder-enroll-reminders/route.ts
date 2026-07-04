/**
 * Cron: Reorder / Enroll Reminders (existing-patient backfill).
 *
 * Runs daily. Finds patients whose most recent PAID order is ~7 weeks (49 days)
 * old and who are NOT already on an active subscription, and texts them a reorder
 * link. Reordering runs them through checkout, which auto-enrolls them into the
 * recurring 8-week program — so this is how pre-existing customers get enrolled.
 *
 * Idempotent: a patient is texted at most once per 60 days (dedup via the SMS log).
 * Bounded to orders 49–180 days old and capped per run so first runs drain
 * gradually instead of blasting all history at once.
 *
 * Protected via CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db.server";
import * as spruceServer from "@/services/spruce.server";
import { getPublicBaseUrl } from "@/lib/public-url";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ skipped: "No POSTGRES_URL configured", results: [] });
  }

  const results: { orderId: string; patientId: string; status: string }[] = [];
  const baseUrl = getPublicBaseUrl(req);
  const templateKey = "reorder_enroll_invite";

  try {
    // Latest paid order per patient, ~7 weeks+ old, patient not already subscribed.
    const { rows } = await sql`
      SELECT DISTINCT ON (o.patient_id)
        o.id, o.patient_id, o.created_at, p.phone, p.first_name, p.last_name
      FROM orders o
      JOIN patients p ON o.patient_id = p.id
      WHERE o.payment_status = 'completed'
        AND o.created_at <= NOW() - INTERVAL '49 days'
        AND o.created_at >= NOW() - INTERVAL '180 days'
        AND p.phone IS NOT NULL AND p.phone <> ''
        AND NOT EXISTS (
          SELECT 1 FROM subscriptions s
          WHERE s.patient_id = o.patient_id AND s.status = 'active'
        )
      ORDER BY o.patient_id, o.created_at DESC
      LIMIT 200
    `;

    for (const row of rows) {
      // Skip if we already invited this patient in the last 60 days.
      const { rows: alreadySent } = await sql`
        SELECT 1 FROM integration_logs
        WHERE patient_id = ${row.patient_id}
          AND details->>'templateKey' = ${templateKey}
          AND timestamp > NOW() - INTERVAL '60 days'
        LIMIT 1
      `.catch(() => ({ rows: [] as any[] }));
      if (alreadySent.length > 0) continue;

      const reorderUrl = `${baseUrl}/patient/reorder?orderId=${encodeURIComponent(row.id)}`;
      const patient = {
        id: row.patient_id as string,
        firstName: row.first_name as string,
        lastName: row.last_name as string,
        phone: row.phone as string,
      } as any;

      try {
        await spruceServer.sendMessage(patient, templateKey, {
          orderId: row.id,
          patientName: row.first_name,
          reorderUrl,
        });
        results.push({ orderId: row.id, patientId: row.patient_id, status: "sent" });
      } catch (err: any) {
        results.push({ orderId: row.id, patientId: row.patient_id, status: `error: ${err.message}` });
      }
    }

    return NextResponse.json({ processed: results.length, results, runAt: new Date().toISOString() });
  } catch (err: any) {
    console.error("Cron reorder-enroll-reminders error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Allow POST too (for manual trigger from admin).
export const POST = GET;
