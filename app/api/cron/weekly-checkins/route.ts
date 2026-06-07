/**
 * Cron: Weekly Treatment Check-Ins
 *
 * Runs daily. Sends wellness check texts at:
 *   - Week 2 (day 14 after order placed): "How are you feeling on your new medication?"
 *   - Week 4 (day 28): "You're almost halfway — any questions for your provider?"
 *   - Week 6 (day 42): "Nearing the end of your first cycle — ready to plan your refill?"
 *
 * Protected via CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db.server";
import * as spruceServer from "@/services/spruce.server";

export const dynamic = "force-dynamic";
const DAY_MS = 24 * 60 * 60 * 1000;
function daysSince(iso: string) { return (Date.now() - new Date(iso).getTime()) / DAY_MS; }

function getTemplateKey(days: number): string | null {
  if (days >= 13 && days < 15) return "weekly_checkin_week2";
  if (days >= 27 && days < 29) return "weekly_checkin_week4";
  if (days >= 41 && days < 43) return "weekly_checkin_week6";
  return null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.POSTGRES_URL) return NextResponse.json({ skipped: "No POSTGRES_URL", results: [] });

  const results: { orderId: string; templateKey: string; status: string }[] = [];

  try {
    const { rows } = await sql`
      SELECT
        o.id,
        o.patient_id,
        o.created_at,
        p.phone,
        p.first_name
      FROM orders o
      JOIN patients p ON o.patient_id = p.id
      WHERE o.created_at > NOW() - INTERVAL '43 days'
        AND o.created_at < NOW() - INTERVAL '12 days'
        AND o.status NOT IN ('cancelled', 'refunded', 'draft')
        AND o.payment_status = 'completed'
        AND p.phone IS NOT NULL
      ORDER BY o.created_at ASC
    `;

    for (const row of rows) {
      const days = daysSince(row.created_at);
      const templateKey = getTemplateKey(days);
      if (!templateKey) continue;

      const { rows: already } = await sql`
        SELECT 1 FROM integration_logs
        WHERE action = 'SMS sent' AND order_id = ${row.id}
          AND details->>'templateKey' = ${templateKey}
        LIMIT 1
      `.catch(() => ({ rows: [] as unknown[] }));
      if (already.length > 0) continue;

      try {
        const patient = { id: row.patient_id, phone: row.phone, firstName: row.first_name } as any;
        await spruceServer.sendMessage(patient, templateKey, {
          orderId: row.id,
          patientName: row.first_name,
        });
        results.push({ orderId: row.id, templateKey, status: "sent" });
      } catch (err: any) {
        results.push({ orderId: row.id, templateKey, status: `error: ${err.message}` });
      }
    }

    return NextResponse.json({ processed: results.length, results, runAt: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const POST = GET;
