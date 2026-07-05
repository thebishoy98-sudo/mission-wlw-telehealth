/**
 * Cron dispatcher ("tick").
 *
 * A single Render cron runs this hourly. It calls the hourly job every run and
 * each daily job when its scheduled UTC hour matches — so we pay for ONE cron
 * service instead of ~10. (pharmacy-tracking stays separate because it needs
 * 15-minute granularity.)
 *
 * Protected via CRON_SECRET. `?hour=N` overrides the hour for manual testing.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPublicBaseUrl } from "@/lib/public-url";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Jobs that run on every hourly tick.
const HOURLY_JOBS = ["intake-abandonment"];

// Daily jobs keyed by the UTC hour they should run at.
const JOBS_BY_HOUR: Record<number, string[]> = {
  13: ["identity-reminders"],
  14: ["refill-reminders", "reorder-enroll-reminders", "weekly-checkins"],
  15: ["delivery-checkins"],
  16: ["winback"],
  17: ["dose-escalation"],
  18: ["retatrutide-blast"],
  19: ["subscription-billing"],
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forcedHour = req.nextUrl.searchParams.get("hour");
  const hour = forcedHour !== null && forcedHour !== "" ? Number(forcedHour) : new Date().getUTCHours();
  const jobs = Array.from(new Set([...HOURLY_JOBS, ...(JOBS_BY_HOUR[hour] ?? [])]));

  const base = getPublicBaseUrl(req);
  const results: { job: string; status: number | string }[] = [];

  for (const job of jobs) {
    try {
      const res = await fetch(`${base}/api/cron/${job}`, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
      });
      results.push({ job, status: res.status });
    } catch (err) {
      results.push({ job, status: `error: ${(err as Error).message}` });
    }
  }

  return NextResponse.json({ hour, ran: jobs, results, at: new Date().toISOString() });
}

// Allow POST for manual triggering.
export const POST = GET;
