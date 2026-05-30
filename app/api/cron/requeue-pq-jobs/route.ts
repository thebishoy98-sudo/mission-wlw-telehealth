/**
 * POST /api/cron/requeue-pq-jobs
 *
 * Resets all failed PracticeQ automation jobs (with no intake_id) back to
 * 'queued' so the remote worker picks them up on the next poll cycle.
 *
 * Protected by PRACTICEQ_API_KEY header (same key used for IntakeQ API).
 * This allows re-triggering from CI or a known-credential curl call.
 */

import { NextRequest, NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const provided = req.headers.get("x-practiceq-api-key") ?? "";
  const expected = process.env.PRACTICEQ_API_KEY ?? "";
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rows } = await dbServer.sql`
    UPDATE practiceq_automation_jobs
    SET status = 'queued',
        attempts = 0,
        last_error = NULL,
        locked_at = NULL,
        updated_at = NOW()
    WHERE status = 'failed'
      AND intake_id IS NULL
    RETURNING id, order_id
  `;

  return NextResponse.json({ requeued: rows.length, jobs: rows.map((r: any) => r.id) });
}
