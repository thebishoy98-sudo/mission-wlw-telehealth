import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db.server";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
}

// GET /api/admin/affiliates — list all affiliates with click + conversion counts
// GET /api/admin/affiliates?code=xxx — list individual orders for one affiliate
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!process.env.POSTGRES_URL) return NextResponse.json({ affiliates: [] });

  const code = new URL(req.url).searchParams.get("code");

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS affiliates (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by TEXT NOT NULL DEFAULT 'admin'
      )
    `;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ref_code TEXT`.catch(() => {});
    // Ensure partial_intakes exists (may not have been migrated on this env yet)
    await sql`
      CREATE TABLE IF NOT EXISTS partial_intakes (
        id           TEXT PRIMARY KEY,
        phone        TEXT NOT NULL,
        email        TEXT,
        first_name   TEXT,
        started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed    BOOLEAN NOT NULL DEFAULT false,
        completed_at TIMESTAMPTZ,
        sms_1h_sent  BOOLEAN NOT NULL DEFAULT false,
        sms_24h_sent BOOLEAN NOT NULL DEFAULT false
      )
    `.catch(() => {});
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_partial_intakes_phone ON partial_intakes(phone)`.catch(() => {});
    await sql`ALTER TABLE partial_intakes ADD COLUMN IF NOT EXISTS ref_code TEXT`.catch(() => {});

    // Drill-down: orders for a single affiliate
    if (code) {
      const { rows } = await sql`
        SELECT
          o.id,
          o.status,
          o.payment_status,
          o.product_id,
          o.dose_id,
          o.created_at,
          pat.first_name,
          pat.last_name,
          pat.email,
          (SELECT pay.amount FROM payments pay WHERE pay.order_id = o.id
             ORDER BY (pay.status = 'completed') DESC, pay.created_at DESC LIMIT 1) AS amount,
          (SELECT pay.status FROM payments pay WHERE pay.order_id = o.id
             ORDER BY (pay.status = 'completed') DESC, pay.created_at DESC LIMIT 1) AS pay_status
        FROM orders o
        LEFT JOIN patients pat ON pat.id = o.patient_id
        WHERE o.ref_code = ${code}
        ORDER BY o.created_at DESC
      `;
      return NextResponse.json({ orders: rows });
    }

    // Compute each metric with an independent subquery. Joining clicks (partial_intakes),
    // orders, AND payments in one query fans out into a cartesian product, which
    // inflates SUM(revenue) by the number of clicks/orders (COUNT survives only
    // because of DISTINCT). Subqueries keep each metric correct.
    const { rows } = await sql`
      SELECT
        a.id,
        a.code,
        a.name,
        a.created_at,
        a.created_by,
        (SELECT COUNT(*) FROM partial_intakes pi WHERE pi.ref_code = a.code) AS clicks,
        (SELECT COUNT(*) FROM orders o
           WHERE o.ref_code = a.code AND o.status NOT IN ('draft','cancelled')) AS conversions,
        (SELECT COALESCE(SUM(pay.amount), 0)
           FROM payments pay
           JOIN orders o ON o.id = pay.order_id
           WHERE o.ref_code = a.code
             AND pay.status = 'completed'
             AND o.status NOT IN ('draft','cancelled')) AS revenue
      FROM affiliates a
      ORDER BY a.created_at DESC
    `;

    return NextResponse.json({ affiliates: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/admin/affiliates — create a new affiliate link
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!process.env.POSTGRES_URL) return NextResponse.json({ error: "No database" }, { status: 500 });

  try {
    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    await sql`
      CREATE TABLE IF NOT EXISTS affiliates (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by TEXT NOT NULL DEFAULT 'admin'
      )
    `;

    const id = `aff_${Date.now()}`;
    const base = slugify(name.trim());
    const code = `${base}-${id.slice(-4)}`;

    const { rows } = await sql`
      INSERT INTO affiliates (id, code, name)
      VALUES (${id}, ${code}, ${name.trim()})
      RETURNING *
    `;

    const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
    return NextResponse.json({
      affiliate: rows[0],
      link: `${baseUrl}?ref=${code}`,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/admin/affiliates?id=xxx
export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await sql`DELETE FROM affiliates WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
