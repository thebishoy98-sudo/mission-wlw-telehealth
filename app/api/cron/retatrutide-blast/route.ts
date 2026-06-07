/**
 * Cron: Retatrutide Launch Blast
 *
 * One-time marketing SMS to active patients NOT already on Retatrutide.
 * Idempotent — skips patients who already received the blast (logged).
 * Protected via CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db.server";
import * as spruceServer from "@/services/spruce.server";
import { getPublicBaseUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.POSTGRES_URL) return NextResponse.json({ skipped: "No POSTGRES_URL", results: [] });

  const baseUrl = getPublicBaseUrl(req);
  const results: { patientId: string; status: string }[] = [];

  try {
    const { rows } = await sql`
      SELECT DISTINCT ON (o.patient_id)
        o.patient_id,
        p.phone,
        p.first_name
      FROM orders o
      JOIN patients p ON o.patient_id = p.id
      WHERE o.status NOT IN ('cancelled', 'draft', 'refunded')
        AND o.product_id != 'product_retatrutide'
        AND p.phone IS NOT NULL
      ORDER BY o.patient_id, o.created_at DESC
    `;

    for (const row of rows) {
      // Idempotent: skip if already sent
      const { rows: already } = await sql`
        SELECT 1 FROM integration_logs
        WHERE action = 'SMS sent'
          AND patient_id = ${row.patient_id}
          AND details->>'templateKey' = 'retatrutide_launch'
        LIMIT 1
      `.catch(() => ({ rows: [] as unknown[] }));

      if (already.length > 0) {
        results.push({ patientId: row.patient_id, status: "skipped:already_sent" });
        continue;
      }

      try {
        const patient = { id: row.patient_id, phone: row.phone, firstName: row.first_name } as any;
        await spruceServer.sendMessage(patient, "retatrutide_launch", {
          patientName: row.first_name,
          ctaUrl: `${baseUrl}?ref=blast_reta`,
        });
        results.push({ patientId: row.patient_id, status: "sent" });
      } catch (err: any) {
        results.push({ patientId: row.patient_id, status: `error: ${err.message}` });
      }
    }

    return NextResponse.json({ processed: results.length, results, runAt: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const POST = GET;
