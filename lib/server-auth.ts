import { NextRequest, NextResponse } from "next/server";

function hasSecret(req: NextRequest, cookieName: string, envName = "ADMIN_SECRET") {
  const secret = process.env[envName] ?? process.env.ADMIN_SECRET;
  if (!secret) return process.env.VERCEL_ENV !== "production";

  const provided =
    req.headers.get(envName === "PROVIDER_SECRET" ? "x-provider-secret" : "x-admin-secret") ??
    req.cookies.get(cookieName)?.value ??
    req.cookies.get("admin_secret")?.value;

  return provided === secret;
}

export function isAdminRequest(req: NextRequest) {
  return hasSecret(req, "admin_secret");
}

export function isProviderRequest(req: NextRequest) {
  return hasSecret(req, "provider_secret", "PROVIDER_SECRET");
}

function toNextRequest(req: NextRequest | Request): NextRequest {
  return req instanceof NextRequest ? req : new NextRequest(req);
}

export function requireAdmin(req: NextRequest | Request) {
  const nextReq = toNextRequest(req);
  if (isAdminRequest(nextReq)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function requireProvider(req: NextRequest | Request) {
  const nextReq = toNextRequest(req);
  if (isProviderRequest(nextReq) || isAdminRequest(nextReq)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function requireProviderOrAdmin(req: NextRequest | Request) {
  return requireProvider(req);
}
