/**
 * Cron: Post-Delivery Check-Ins + Referral Prompt
 *
 * Runs daily. Sends:
 *   - Day 14 after delivery: warmth + side-effect check
 *   - Day 28 after delivery: results prompt + refill nudge
 *   - Day 14 after delivery (same run): referral prompt
 *
 * Protected via CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db.server";
import * as spruceServer from "@/services/spruce.server";
import { getPublicBaseUrl } from "@/lib/public-url";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / DAY_MS;
}

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

  const results: { orderId: string; patientId: string; templateKey: string; status: string }[] = [];
  const baseUrl = getPublicBaseUrl(req);

  try {
    // Find delivered orders between 13-29 days ago
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
        AND po.delivered_at > NOW() - INTERVAL '29 days'
        AND po.delivered_at < NOW() - INTERVAL '13 days'
      ORDER BY po.delivered_at ASC
    `;

    for (const row of rows) {
      const days = daysSince(row.delivered_at);
      const reorderUrl = `${baseUrl}/patient/reorder?patientId=${encodeURIComponent(row.patient_id)}`;
      const referralUrl = `${baseUrl}?ref=${encodeURIComponent(row.patient_id)}`;
      const patient = {
        id: row.patient_id as string,
        firstName: row.first_name as string,
        lastName: row.last_name as string,
        phone: row.phone as string,
      } as any;

      const templatesToSend: string[] = [];
      if (days >= 13 && days < 15) {
        templatesToSend.push("delivery_checkin_day14", "referral_prompt");
      } else if (days >= 27 && days < 29) {
        templatesToSend.push("delivery_checkin_day28");
      }

      for (const templateKey of templatesToSend) {
        const { rows: alreadySent } = await sql`
          SELECT 1 FROM integration_logs
          WHERE action = 'SMS sent'
            AND order_id = ${row.id}
            AND details->>'templateKey' = ${templateKey}
          LIMIT 1
        `.catch(() => ({ rows: [] as any[] }));

        if (alreadySent.length > 0) continue;

        try {
          await spruceServer.sendMessage(patient, templateKey, {
            orderId: row.id,
            patientName: row.first_name,
            reorderUrl,
            referralUrl,
          });
          results.push({ orderId: row.id, patientId: row.patient_id, templateKey, status: "sent" });
        } catch (err: any) {
          results.push({ orderId: row.id, patientId: row.patient_id, templateKey, status: `error: ${err.message}` });
        }
      }
    }

    return NextResponse.json({ processed: results.length, results, runAt: new Date().toISOString() });
  } catch (err: any) {
    console.error("Cron delivery-checkins error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const POST = GET;
