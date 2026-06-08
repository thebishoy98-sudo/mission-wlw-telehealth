import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db.server";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id         TEXT PRIMARY KEY,
      code       TEXT NOT NULL UNIQUE,
      type       TEXT NOT NULL CHECK (type IN ('flat', 'percent')),
      amount     NUMERIC NOT NULL,
      active     BOOLEAN NOT NULL DEFAULT TRUE,
      max_uses   INT,
      uses       INT NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!process.env.POSTGRES_URL) return NextResponse.json({ codes: [] });
  try {
    await ensureTable();
    const { rows } = await sql`SELECT * FROM promo_codes ORDER BY created_at DESC`;
    return NextResponse.json({ codes: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!process.env.POSTGRES_URL) return NextResponse.json({ error: "No database" }, { status: 500 });
  try {
    await ensureTable();
    const { code, type, amount, maxUses, expiresAt } = await req.json();
    if (!code?.trim()) return NextResponse.json({ error: "Code is required" }, { status: 400 });
    if (!["flat", "percent"].includes(type)) return NextResponse.json({ error: "Type must be flat or percent" }, { status: 400 });
    if (!amount || Number(amount) <= 0) return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });

    const id = `promo_${Date.now()}`;
    const { rows } = await sql`
      INSERT INTO promo_codes (id, code, type, amount, max_uses, expires_at)
      VALUES (
        ${id},
        ${code.trim().toUpperCase()},
        ${type},
        ${Number(amount)},
        ${maxUses ? Number(maxUses) : null},
        ${expiresAt || null}
      )
      RETURNING *
    `;
    return NextResponse.json({ code: rows[0] }, { status: 201 });
  } catch (err: any) {
    if (err.message?.includes("unique")) return NextResponse.json({ error: "Code already exists" }, { status: 409 });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const { id, active } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await sql`UPDATE promo_codes SET active = ${active} WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await sql`DELETE FROM promo_codes WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
