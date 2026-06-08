import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db.server";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

async function ensurePartialIntakeTrackingSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS partial_intakes (
      id            TEXT PRIMARY KEY,
      phone         TEXT NOT NULL,
      email         TEXT,
      first_name    TEXT,
      product_id    TEXT,
      dose_id       TEXT,
      checkout_step TEXT,
      started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed     BOOLEAN NOT NULL DEFAULT false,
      completed_at  TIMESTAMPTZ,
      sms_1h_sent   BOOLEAN NOT NULL DEFAULT false,
      sms_24h_sent  BOOLEAN NOT NULL DEFAULT false,
      ref_code      TEXT
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_partial_intakes_phone ON partial_intakes(phone)`;
  await sql`ALTER TABLE partial_intakes ADD COLUMN IF NOT EXISTS product_id TEXT`;
  await sql`ALTER TABLE partial_intakes ADD COLUMN IF NOT EXISTS dose_id TEXT`;
  await sql`ALTER TABLE partial_intakes ADD COLUMN IF NOT EXISTS checkout_step TEXT`;
  await sql`ALTER TABLE partial_intakes ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  await sql`ALTER TABLE partial_intakes ADD COLUMN IF NOT EXISTS ref_code TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS idx_partial_intakes_completed_last_seen ON partial_intakes(completed, last_seen_at DESC)`;
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ checkouts: [] });
  }

  try {
    await ensurePartialIntakeTrackingSchema();

    const { rows } = await sql`
      SELECT
        id,
        phone,
        email,
        first_name,
        product_id,
        dose_id,
        checkout_step,
        started_at,
        last_seen_at,
        completed,
        completed_at,
        sms_1h_sent,
        sms_24h_sent,
        ref_code,
        EXTRACT(EPOCH FROM (COALESCE(last_seen_at, NOW()) - started_at))::INTEGER AS time_on_site_seconds
      FROM partial_intakes
      WHERE completed = false
      ORDER BY last_seen_at DESC
      LIMIT 200
    `;

    const checkouts = rows.map((row: any) => ({
      id: String(row.id),
      phone: row.phone ? String(row.phone) : "",
      email: row.email ? String(row.email) : "",
      firstName: row.first_name ? String(row.first_name) : "",
      productId: row.product_id ? String(row.product_id) : "",
      doseId: row.dose_id ? String(row.dose_id) : "",
      checkoutStep: row.checkout_step ? String(row.checkout_step) : "",
      startedAt: row.started_at,
      lastSeenAt: row.last_seen_at,
      completed: Boolean(row.completed),
      completedAt: row.completed_at,
      sms1hSent: Boolean(row.sms_1h_sent),
      sms24hSent: Boolean(row.sms_24h_sent),
      refCode: row.ref_code ? String(row.ref_code) : "",
      timeOnSiteSeconds: Number(row.time_on_site_seconds ?? 0),
    }));

    return NextResponse.json({ checkouts });
  } catch (error) {
    console.error("Admin abandoned checkouts load error:", error);
    return NextResponse.json({ error: "Abandoned checkouts load failed" }, { status: 500 });
  }
}

