import { NextResponse } from "next/server";

function readCookie(req: Request, name: string) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const rawValue = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!rawValue) return undefined;
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

function hasSecret(req: Request, cookieName: string, envName = "ADMIN_SECRET") {
  const secret = process.env[envName] ?? process.env.ADMIN_SECRET;
  if (!secret) return process.env.VERCEL_ENV !== "production";

  const provided =
    req.headers.get(envName === "PROVIDER_SECRET" ? "x-provider-secret" : "x-admin-secret") ??
    readCookie(req, cookieName) ??
    readCookie(req, "admin_secret");

  return provided === secret;
}

export function isAdminRequest(req: Request) {
  return hasSecret(req, "admin_secret");
}

export function isProviderRequest(req: Request) {
  return hasSecret(req, "provider_secret", "PROVIDER_SECRET");
}

export function requireAdmin(req: Request) {
  if (isAdminRequest(req)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function requireProvider(req: Request) {
  if (isProviderRequest(req) || isAdminRequest(req)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function requireProviderOrAdmin(req: Request) {
  return requireProvider(req);
}
