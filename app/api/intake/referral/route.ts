/**
 * POST /api/intake/referral
 *
 * Creates (or returns an existing) patient referral affiliate link.
 * Called from the confirmation page after a successful order.
 * No auth required — validates name/orderId inputs, gracefully degrades if no DB.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db.server";
import { generateId } from "@/lib/utils";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);
}

export async function POST(req: NextRequest) {
  if (!process.env.POSTGRES_URL) return NextResponse.json({ link: null, code: null });

  try {
    const { firstName, lastName, orderId } = await req.json();
    if (!firstName && !lastName) return NextResponse.json({ link: null, code: null });

    const namePart = slugify(`${firstName ?? ""} ${lastName ?? ""}`.trim() || "friend");
    const suffix = (orderId ?? generateId()).slice(-5);
    const code = `ref-${namePart}-${suffix}`;
    const displayName = `${firstName ?? "Patient"} ${lastName ?? ""}`.trim();

    await sql`
      CREATE TABLE IF NOT EXISTS affiliates (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by TEXT NOT NULL DEFAULT 'admin'
      )
    `;
    await sql`
      INSERT INTO affiliates (id, code, name, created_by)
      VALUES (${generateId()}, ${code}, ${displayName + " (Referral)"}, 'patient-referral')
      ON CONFLICT (code) DO NOTHING
    `;

    const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
    return NextResponse.json({ code, link: `${baseUrl}?ref=${code}` });
  } catch {
    return NextResponse.json({ link: null, code: null });
  }
}
