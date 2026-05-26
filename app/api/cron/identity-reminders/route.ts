/**
 * Cron: Identity Verification Reminders
 *
 * Runs daily (see vercel.json). Finds orders where:
 *   - payment is completed
 *   - identity not yet verified
 *   - pharmacy still draft (blocked)
 *   - submitted 1 or 2 days ago
 *
 * Sends a day-1 or day-2 SMS reminder via Spruce with the upload URL.
 * Stops after 2 days - admin follow-up required beyond that.
 *
 * Protected via CRON_SECRET env var (Vercel sets Authorization header automatically).
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import * as spruceServer from "@/services/spruce.server";
import { buildIdentityUploadUrl, createIdentityUploadToken } from "@/lib/identity";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / DAY_MS;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET && process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { orderId: string; patientId: string; day: number; status: string }[] = [];

  try {
    if (!process.env.POSTGRES_URL) {
      return NextResponse.json({ skipped: "No POSTGRES_URL configured", results: [] });
    }

    const { rows } = await sql`
      SELECT
        o.id,
        o.patient_id,
        o.submitted_at,
        o.identity_upload_token,
        p.phone,
        p.first_name,
        p.last_name
      FROM orders o
      JOIN patients p ON o.patient_id = p.id
      WHERE o.payment_status = 'completed'
        AND o.pharmacy_status = 'draft'
        AND COALESCE(o.identity_status, 'missing') NOT IN ('verified', 'manual_approved')
        AND o.submitted_at IS NOT NULL
        AND o.submitted_at < NOW() - INTERVAL '20 hours'
        AND o.submitted_at > NOW() - INTERVAL '72 hours'
      ORDER BY o.submitted_at ASC
    `;

    for (const row of rows) {
      const days = daysSince(row.submitted_at);
      const reminderDay = days < 2 ? 1 : 2;
      const templateKey = reminderDay === 1 ? "identity_reminder_day1" : "identity_reminder_day2";

      // Ensure the order has an upload token; generate + persist one if missing
      let uploadToken = row.identity_upload_token as string | null;
      if (!uploadToken) {
        uploadToken = createIdentityUploadToken(row.id);
        await sql`UPDATE orders SET identity_upload_token = ${uploadToken} WHERE id = ${row.id}`.catch(() => {});
      }
      const uploadUrl = buildIdentityUploadUrl(req.nextUrl.origin, uploadToken);

      const patient = {
        id: row.patient_id as string,
        firstName: row.first_name as string,
        lastName: row.last_name as string,
        phone: row.phone as string,
      } as any;

      try {
        await spruceServer.sendMessage(patient, templateKey, { orderId: row.id, uploadUrl });
        results.push({ orderId: row.id, patientId: row.patient_id, day: reminderDay, status: "sent" });
      } catch (err: any) {
        results.push({ orderId: row.id, patientId: row.patient_id, day: reminderDay, status: `error: ${err.message}` });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
      runAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Cron identity-reminders error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Allow POST too (for manual trigger from admin)
export const POST = GET;
