/**
 * Cron/manual bridge for the pharmacy Google Apps Script tracking receiver.
 *
 * The pharmacy posts tracking updates to a Google Apps Script URL. This route
 * asks that script for any available tracking payloads and reuses the normal
 * Life File webhook normalization/update path inside this app.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchTrackingScriptUpdates } from "@/services/pharmacy-tracking-script";
import { applyLifeFileWebhookPayload } from "@/lib/lifefile-webhook-handler";

function isAuthorized(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET && process.env.VERCEL_ENV === "production") {
    return { ok: false, response: NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 }) };
  }
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = isAuthorized(req);
  if (!auth.ok) return auth.response;

  try {
    const updates = await fetchTrackingScriptUpdates();
    const results: { status: number; body: unknown }[] = [];

    for (const update of updates) {
      const response = await applyLifeFileWebhookPayload(update);
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      results.push({ status: response.status, body });
    }

    return NextResponse.json({
      processed: updates.length,
      results,
      runAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}

export const GET = POST;
