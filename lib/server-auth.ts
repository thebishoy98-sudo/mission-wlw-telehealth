import { NextRequest, NextResponse } from "next/server";

type AuthRequest = Pick<Request, "headers"> & {
  cookies?: {
    get(name: string): { value?: string } | undefined;
  };
};

function cookieValue(req: AuthRequest, name: string) {
  const nextCookie = req.cookies?.get(name)?.value;
  if (nextCookie) return nextCookie;

  const header = req.headers.get("cookie") ?? "";
  return header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function isAdminRequest(req: AuthRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return process.env.VERCEL_ENV !== "production";

  const provided =
    req.headers.get("x-admin-secret") ??
    cookieValue(req, "admin_secret");

  return provided === secret;
}

export function isProviderRequest(req: AuthRequest) {
  const secret = process.env.PROVIDER_SECRET ?? process.env.ADMIN_SECRET;
  if (!secret) return process.env.VERCEL_ENV !== "production";

  const provided =
    req.headers.get("x-provider-secret") ??
    cookieValue(req, "provider_secret");

  return provided === secret;
}

export function requireAdmin(req: NextRequest) {
  if (isAdminRequest(req)) return null;
  return NextResponse.json({ error: "Admin authorization required" }, { status: 401 });
}

export function requireProviderOrAdmin(req: AuthRequest) {
  if (isProviderRequest(req) || isAdminRequest(req)) return null;
  return NextResponse.json({ error: "Provider authorization required" }, { status: 401 });
}
