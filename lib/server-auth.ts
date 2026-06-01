import { NextResponse } from "next/server";
import { getStaffSessionFromRequest } from "@/lib/staff-session";

function hasHeaderSecret(req: Request, envName = "ADMIN_SECRET") {
  const secret = process.env[envName] ?? process.env.ADMIN_SECRET;
  if (!secret) return process.env.VERCEL_ENV !== "production";

  const provided =
    envName === "PROVIDER_SECRET"
      ? req.headers?.get?.("x-provider-secret")
      : req.headers?.get?.("x-admin-secret");

  return provided === secret;
}

export function isAdminRequest(req: Request) {
  const session = getStaffSessionFromRequest(req);
  return session?.role === "admin" || hasHeaderSecret(req);
}

export function isProviderRequest(req: Request) {
  const session = getStaffSessionFromRequest(req);
  return session?.role === "provider" || hasHeaderSecret(req, "PROVIDER_SECRET");
}

export function requireAdmin(req: Request) {
  if (isAdminRequest(req)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function requireProvider(req: Request) {
  if (isProviderRequest(req) || isAdminRequest(req)) return null;
  return NextResponse.json({ error: "Provider authorization required" }, { status: 401 });
}

export function requireProviderOrAdmin(req: Request) {
  return requireProvider(req);
}
