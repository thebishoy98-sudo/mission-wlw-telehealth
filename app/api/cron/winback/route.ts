/**
 * Cron: Win-Back
 *
 * Runs daily. Finds patients who had an order delivered 70+ days ago
 * with no subsequent reorder. Sends one win-back SMS.
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

  try {
    // Delivered 70-90 days ago, no newer completed order
    const { rows } = await sql`
      SELECT
        o.id,
        o.patient_id,
        po.delivered_at,
        p.phone,
        p.first_name,
        p.last_name
      FROM orders o
      JOIN patients p ON o.patient_id = p.id
      JOIN pharmacy_orders po ON po.order_id = o.id
      WHERE po.delivered_at IS NOT NULL
        AND po.delivered_at < NOW() - INTERVAL '70 days'
        AND po.delivered_at > NOW() - INTERVAL '90 days'
        AND NOT EXISTS (
          SELECT 1 FROM orders newer
          WHERE newer.patient_id = o.patient_id
            AND newer.id <> o.id
            AND newer.created_at > o.created_at
            AND newer.payment_status = 'completed'
        )
      ORDER BY po.delivered_at ASC
    `;

    for (const row of rows) {
      const templateKey = "winback_day70";

      const { rows: alreadySent } = await sql`
        SELECT 1 FROM integration_logs
        WHERE action = 'SMS sent'
          AND order_id = ${row.id}
          AND details->>'templateKey' = ${templateKey}
        LIMIT 1
      `.catch(() => ({ rows: [] as any[] }));

      if (alreadySent.length > 0) continue;

      const reorderUrl = `${baseUrl}/patient/reorder?patientId=${encodeURIComponent(row.patient_id)}`;
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
    console.error("Cron winback error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const POST = GET;
