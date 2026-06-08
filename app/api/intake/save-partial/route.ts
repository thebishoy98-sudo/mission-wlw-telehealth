/**
 * POST /api/intake/save-partial
 *
 * Fire-and-forget: saves a partial intake record (phone + name) so the
 * intake-abandonment cron can send recovery SMS to patients who drop off.
 *
 * Also accepts { phone, completed: true } to suppress further messages.
 * Never returns an error to the caller — user flow must not be blocked.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db.server";
import { generateId } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { phone, email, firstName, completed, refCode } = body as {
      phone?: string;
      email?: string;
      firstName?: string;
      completed?: boolean;
      refCode?: string;
    };

    if (!phone) return NextResponse.json({ ok: true });
    if (!process.env.POSTGRES_URL) return NextResponse.json({ ok: true });

    if (completed) {
      await sql`
        UPDATE partial_intakes
        SET completed = true, completed_at = NOW()
        WHERE phone = ${phone} AND completed = false
      `.catch(() => {});
    } else {
      // Ensure ref_code column exists (idempotent)
      await sql`ALTER TABLE partial_intakes ADD COLUMN IF NOT EXISTS ref_code TEXT`.catch(() => {});
      // Upsert: reset counters if previous row is already completed (new attempt)
      await sql`
        INSERT INTO partial_intakes (id, phone, email, first_name, ref_code, started_at)
        VALUES (${generateId()}, ${phone}, ${email ?? null}, ${firstName ?? null}, ${refCode ?? null}, NOW())
        ON CONFLICT (phone) DO UPDATE SET
          email       = COALESCE(EXCLUDED.email, partial_intakes.email),
          first_name  = COALESCE(EXCLUDED.first_name, partial_intakes.first_name),
          ref_code    = COALESCE(EXCLUDED.ref_code, partial_intakes.ref_code),
          started_at  = CASE WHEN partial_intakes.completed THEN NOW() ELSE partial_intakes.started_at END,
          completed   = false,
          completed_at = NULL,
          sms_1h_sent  = CASE WHEN partial_intakes.completed THEN false ELSE partial_intakes.sms_1h_sent END,
          sms_24h_sent = CASE WHEN partial_intakes.completed THEN false ELSE partial_intakes.sms_24h_sent END
      `.catch(() => {});
    }
  } catch {
    // Intentionally swallow — never fail the user flow
  }

  return NextResponse.json({ ok: true });
}
