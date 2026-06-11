/**
 * Cron: FedEx Tracking Sync
 *
 * Polls FedEx directly for shipped pharmacy orders that have tracking numbers.
 * Sends one out-for-delivery text and one delivered text per order.
 */

import { NextRequest, NextResponse } from "next/server";
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

export async function GET(req: NextRequest) {
  const auth = isAuthorized(req);
  if (!auth.ok) return auth.response;

  const fedex = await runFedExTrackingSync();
  return NextResponse.json({ ...fedex, runAt: new Date().toISOString() });
}

export const POST = GET;
