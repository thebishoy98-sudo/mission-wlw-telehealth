/**
 * Cron: Dose Escalation Nudge
 *
 * Runs daily. Finds patients ~40 days after shipment with no reorder.
 * Sends a gentle nudge suggesting they consider a higher dose next cycle.
 * Protected via CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db.server";
import * as spruceServer from "@/services/spruce.server";
import { getPublicBaseUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";
const DAY_MS = 24 * 60 * 60 * 1000;
function daysSince(iso: string) { return (Date.now() - new Date(iso).getTime()) / DAY_MS; }

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.POSTGRES_URL) return NextResponse.json({ skipped: "No POSTGRES_URL", results: [] });

  const baseUrl = getPublicBaseUrl(req);
  const results: { orderId: string; patientId: string; status: string }[] = [];

  try {
    const { rows } = await sql`
      SELECT
        o.id,
        o.patient_id,
        o.product_id,
        o.dose_id,
        po.shipped_at,
        p.phone,
        p.first_name
      FROM orders o
      JOIN patients p ON o.patient_id = p.id
      JOIN pharmacy_orders po ON po.order_id = o.id
      WHERE po.shipped_at IS NOT NULL
        AND po.shipped_at > NOW() - INTERVAL '45 days'
        AND po.shipped_at < NOW() - INTERVAL '38 days'
        AND o.status NOT IN ('cancelled', 'refunded')
        AND p.phone IS NOT NULL
      ORDER BY po.shipped_at ASC
    `;

    for (const row of rows) {
      // Skip if patient already has a newer order
      const { rows: reorders } = await sql`
        SELECT 1 FROM orders
        WHERE patient_id = ${row.patient_id}
          AND created_at > ${row.shipped_at}
          AND status NOT IN ('draft', 'cancelled')
        LIMIT 1
      `.catch(() => ({ rows: [] as unknown[] }));
      if (reorders.length > 0) {
        results.push({ orderId: row.id, patientId: row.patient_id, status: "skipped:reordered" });
        continue;
      }

      // Idempotent
      const { rows: already } = await sql`
        SELECT 1 FROM integration_logs
        WHERE action = 'SMS sent' AND order_id = ${row.id}
          AND details->>'templateKey' = 'dose_escalation_nudge'
        LIMIT 1
      `.catch(() => ({ rows: [] as unknown[] }));
      if (already.length > 0) { results.push({ orderId: row.id, patientId: row.patient_id, status: "skipped:already_sent" }); continue; }

      try {
        const patient = { id: row.patient_id, phone: row.phone, firstName: row.first_name } as any;
        await spruceServer.sendMessage(patient, "dose_escalation_nudge", {
          orderId: row.id,
          patientName: row.first_name,
          reorderUrl: `${baseUrl}/patient/reorder?patientId=${encodeURIComponent(row.patient_id)}`,
        });
        results.push({ orderId: row.id, patientId: row.patient_id, status: "sent" });
      } catch (err: any) {
        results.push({ orderId: row.id, patientId: row.patient_id, status: `error: ${err.message}` });
      }
    }

    return NextResponse.json({ processed: results.length, results, runAt: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const POST = GET;
