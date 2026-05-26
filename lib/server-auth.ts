import { NextRequest, NextResponse } from "next/server";

export function isAdminRequest(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return process.env.VERCEL_ENV !== "production";

  const provided =
    req.headers.get("x-admin-secret") ??
    req.cookies.get("admin_secret")?.value;

  return provided === secret;
}

export function requireAdmin(req: NextRequest) {
  if (isAdminRequest(req)) return null;
  return NextResponse.json({ error: "Admin authorization required" }, { status: 401 });
}
