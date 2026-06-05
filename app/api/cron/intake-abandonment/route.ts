/**
 * Cron: Intake Abandonment Recovery
 *
 * Runs every hour. Sends two recovery SMS to patients who started the
 * intake form but never completed payment:
 *   - 1-hour window:  sms_1h_sent=false, started_at 1–48h ago
 *   - 24-hour window: sms_24h_sent=false, started_at 24–72h ago
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

  const results: { phone: string; templateKey: string; status: string }[] = [];
  const baseUrl = getPublicBaseUrl(req);
  const ctaUrl = `${baseUrl}/start/info`;

  try {
    // 1-hour abandonment
    const { rows: hour1Rows } = await sql`
      SELECT id, phone, first_name FROM partial_intakes
      WHERE completed = false
        AND sms_1h_sent = false
        AND started_at < NOW() - INTERVAL '1 hour'
        AND started_at > NOW() - INTERVAL '48 hours'
    `.catch(() => ({ rows: [] as any[] }));

    for (const row of hour1Rows) {
      const patient = { id: row.id, firstName: row.first_name ?? "", lastName: "", phone: row.phone } as any;
      try {
        await spruceServer.sendMessage(patient, "intake_abandonment_1h", {
          firstName: row.first_name ?? "there",
          ctaUrl,
        });
        await sql`UPDATE partial_intakes SET sms_1h_sent = true WHERE id = ${row.id}`.catch(() => {});
        results.push({ phone: row.phone, templateKey: "intake_abandonment_1h", status: "sent" });
      } catch (err: any) {
        results.push({ phone: row.phone, templateKey: "intake_abandonment_1h", status: `error: ${err.message}` });
      }
    }

    // 24-hour abandonment
    const { rows: hour24Rows } = await sql`
      SELECT id, phone, first_name FROM partial_intakes
      WHERE completed = false
        AND sms_24h_sent = false
        AND started_at < NOW() - INTERVAL '24 hours'
        AND started_at > NOW() - INTERVAL '72 hours'
    `.catch(() => ({ rows: [] as any[] }));

    for (const row of hour24Rows) {
      const patient = { id: row.id, firstName: row.first_name ?? "", lastName: "", phone: row.phone } as any;
      try {
        await spruceServer.sendMessage(patient, "intake_abandonment_24h", {
          firstName: row.first_name ?? "there",
          ctaUrl,
        });
        await sql`UPDATE partial_intakes SET sms_24h_sent = true WHERE id = ${row.id}`.catch(() => {});
        results.push({ phone: row.phone, templateKey: "intake_abandonment_24h", status: "sent" });
      } catch (err: any) {
        results.push({ phone: row.phone, templateKey: "intake_abandonment_24h", status: `error: ${err.message}` });
      }
    }

    return NextResponse.json({ processed: results.length, results, runAt: new Date().toISOString() });
  } catch (err: any) {
    console.error("Cron intake-abandonment error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const POST = GET;
