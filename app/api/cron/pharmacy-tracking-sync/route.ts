/**
 * Cron/manual bridge for the pharmacy Google Apps Script tracking receiver.
 *
 * The pharmacy posts tracking updates to a Google Apps Script URL. This route
 * asks that script for any available tracking payloads and reuses the normal
 * Life File webhook normalization/update path inside this app.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchTrackingScriptUpdates } from "@/services/pharmacy-tracking-script";
import { fetchAppSheetTrackingUpdates, isAppSheetTrackingConfigured } from "@/services/appsheet-tracking";
import { applyLifeFileWebhookPayload } from "@/lib/lifefile-webhook-handler";
import { runFedExTrackingSync } from "@/lib/fedex-tracking-sync";

function isAuthorized(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET) {
    return { ok: false, response: NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 }) };
  }
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true };
}

async function runTrackingSync(req: NextRequest) {
  const auth = isAuthorized(req);
  if (!auth.ok) return auth.response;

  try {
    const [scriptResult, appSheetResult] = await Promise.allSettled([
      fetchTrackingScriptUpdates(),
      isAppSheetTrackingConfigured() ? fetchAppSheetTrackingUpdates() : Promise.resolve([]),
    ]);
    if (scriptResult.status === "rejected" && appSheetResult.status === "rejected") {
      throw new Error(`${scriptResult.reason?.message ?? scriptResult.reason}; ${appSheetResult.reason?.message ?? appSheetResult.reason}`);
    }
    const updates = [
      ...(scriptResult.status === "fulfilled" ? scriptResult.value : []),
      ...(appSheetResult.status === "fulfilled" ? appSheetResult.value : []),
    ];
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

    const fedex = await runFedExTrackingSync();

    return NextResponse.json({
      processed: updates.length,
      sources: {
        trackingScript: scriptResult.status === "fulfilled" ? scriptResult.value.length : { error: scriptResult.reason?.message ?? String(scriptResult.reason) },
        appSheet: appSheetResult.status === "fulfilled" ? appSheetResult.value.length : { error: appSheetResult.reason?.message ?? String(appSheetResult.reason) },
        fedex,
      },
      results,
      runAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  return runTrackingSync(req);
}

export async function POST(req: NextRequest) {
  return runTrackingSync(req);
}

