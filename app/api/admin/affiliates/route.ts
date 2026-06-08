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
          pay.amount,
          pay.status AS pay_status
        FROM orders o
        LEFT JOIN patients pat ON pat.id = o.patient_id
        LEFT JOIN payments pay ON pay.order_id = o.id
        WHERE o.ref_code = ${code}
        ORDER BY o.created_at DESC
      `;
      return NextResponse.json({ orders: rows });
    }

    const { rows } = await sql`
      SELECT
        a.id,
        a.code,
        a.name,
        a.created_at,
        a.created_by,
        COUNT(DISTINCT pi.id) FILTER (WHERE pi.ref_code = a.code) AS clicks,
        COUNT(DISTINCT o.id) FILTER (WHERE o.ref_code = a.code AND o.status NOT IN ('draft','cancelled')) AS conversions,
        COALESCE(SUM(pay.amount) FILTER (WHERE o.ref_code = a.code AND pay.status = 'completed'), 0) AS revenue
      FROM affiliates a
      LEFT JOIN partial_intakes pi ON pi.ref_code = a.code
      LEFT JOIN orders o ON o.ref_code = a.code
      LEFT JOIN payments pay ON pay.order_id = o.id
      GROUP BY a.id, a.code, a.name, a.created_at, a.created_by
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
