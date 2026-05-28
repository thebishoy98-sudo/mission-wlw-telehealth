import { NextRequest, NextResponse } from "next/server";

function hasSecret(req: NextRequest, cookieName: string, envName = "ADMIN_SECRET") {
  const secret = process.env[envName] ?? process.env.ADMIN_SECRET;
  if (!secret) return true; // no secret configured → open
  const header = req.headers.get("x-admin-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  const cookie = req.cookies.get(cookieName)?.value;
  return header === secret || cookie === secret;
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  if (hasSecret(req, "admin_secret", "ADMIN_SECRET")) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function requireProvider(req: NextRequest): NextResponse | null {
  if (hasSecret(req, "provider_secret", "PROVIDER_SECRET")) return null;
  if (hasSecret(req, "admin_secret", "ADMIN_SECRET")) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function isAdminRequest(req: NextRequest): boolean {
  return hasSecret(req, "admin_secret", "ADMIN_SECRET");
}

export function isProviderRequest(req: NextRequest): boolean {
  return hasSecret(req, "provider_secret", "PROVIDER_SECRET") || hasSecret(req, "admin_secret", "ADMIN_SECRET");
}
