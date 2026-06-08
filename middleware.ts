import { NextRequest, NextResponse } from "next/server";

const COOKIE = "staff_session";
const MAX_AGE_MS = 8 * 60 * 60 * 1000;

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i >> 1] = parseInt(hex.slice(i, i + 2), 16);
  return arr;
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

async function getValidSession(token: string | undefined) {
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 1) return null;
  const payload = token.slice(0, lastDot);
  const sigHex = token.slice(lastDot + 1);
  const secret = process.env.STAFF_SESSION_SECRET ?? process.env.ADMIN_SECRET;
  if (!secret) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key, hexToBytes(sigHex).buffer as ArrayBuffer, new TextEncoder().encode(payload)
    );
    if (!valid) return null;
    const session = JSON.parse(b64urlDecode(payload)) as { role?: string; issuedAt?: number };
    if (!session.role || !session.issuedAt) return null;
    if (Date.now() - session.issuedAt > MAX_AGE_MS) return null;
    return session;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE)?.value;

  if (pathname.startsWith("/admin")) {
    const session = await getValidSession(token);
    if (!session || session.role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/login/admin";
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/provider")) {
    const session = await getValidSession(token);
    if (!session || (session.role !== "provider" && session.role !== "admin")) {
      const url = req.nextUrl.clone();
      url.pathname = "/login/provider";
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/provider/:path*"],
};
