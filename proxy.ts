/**
 * Next.js Edge Middleware — HIPAA Security Controls
 *
 * Implements:
 *   HIPAA § 164.312(a)(1)  — Access control (admin/provider routes require auth token)
 *   HIPAA § 164.312(b)     — Audit controls (request logging headers for downstream)
 *   HIPAA § 164.308(a)(5)  — Login monitoring / brute-force protection (rate limiting)
 *   HIPAA § 164.312(e)(1)  — Transmission security (HTTPS enforced via HSTS header)
 *
 * Rate limits (in-memory via Edge runtime — replace with Redis/Upstash for multi-instance):
 *   /api/payments  — 5 req / 10 min per IP  (prevent card stuffing)
 *   /api/intake    — 10 req / 10 min per IP
 *   /api/*         — 100 req / min per IP    (general API)
 *   All others     — no limit
 */

import { NextRequest, NextResponse } from "next/server";

const STAFF_SESSION_COOKIE = "staff_session";
const STAFF_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

// ── Simple in-memory rate limiter (Edge-compatible) ───────────────────────────
// For production with multiple Vercel instances, swap this map for Upstash Redis:
//   https://github.com/upstash/ratelimit
type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }

  if (bucket.count >= max) {
    return false; // blocked
  }

  bucket.count++;
  return true; // allowed
}

// Clean up stale buckets every ~500 requests to avoid memory leak in long-running Edge instances
let cleanupCounter = 0;
function maybeCleanup() {
  if (++cleanupCounter % 500 !== 0) return;
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}

type StaffSessionRole = "admin" | "provider";

function sessionSecret() {
  return (
    process.env.STAFF_SESSION_SECRET ??
    process.env.ADMIN_SECRET ??
    ""
  );
}

async function hmacHex(payload: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index++) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return atob(padded);
}

export async function verifyStaffSessionCookieForProxy(
  token: string | undefined,
  requiredRole: StaffSessionRole
) {
  const secret = sessionSecret();
  if (!token || !secret) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = await hmacHex(payload, secret);
  if (!safeEqual(signature, expected)) return false;

  try {
    const session = JSON.parse(decodeBase64Url(payload)) as {
      role?: StaffSessionRole;
      email?: string;
      name?: string;
      issuedAt?: number;
    };
    if (session.role !== requiredRole) return false;
    if (!session.email || !session.name || !session.issuedAt) return false;
    if (Date.now() - session.issuedAt > STAFF_SESSION_MAX_AGE_MS) return false;
    return true;
  } catch {
    return false;
  }
}

// ── Admin route protection ───────────────────────────────────────────────────
async function checkAdminAuth(req: NextRequest): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;

  const provided = req.headers.get("x-admin-secret");
  if (provided === secret) return true;

  return verifyStaffSessionCookieForProxy(req.cookies.get(STAFF_SESSION_COOKIE)?.value, "admin");
}

// ── Main middleware ────────────────────────────────────────────────────────────
export async function proxy(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const path = req.nextUrl.pathname;

  maybeCleanup();

  // ── Rate limiting ──────────────────────────────────────────────────────────
  if (path.startsWith("/api/payments")) {
    if (!rateLimit(`${ip}:payments`, 5, 10 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many payment attempts. Please wait and try again." },
        { status: 429, headers: { "Retry-After": "600" } }
      );
    }
  } else if (path.startsWith("/api/intake")) {
    if (!rateLimit(`${ip}:intake`, 10, 10 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait and try again." },
        { status: 429, headers: { "Retry-After": "600" } }
      );
    }
  } else if (path === "/api/auth/session" && req.method === "GET") {
    // Session hydration is called on most pages and is read-only. Keep brute-force
    // throttling on login/OTP endpoints without breaking normal navigation.
  } else if (path.startsWith("/api/auth/")) {
    if (!rateLimit(`${ip}:auth`, 10, 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
  } else if (path.startsWith("/api/")) {
    if (!rateLimit(`${ip}:api`, 100, 60 * 1000)) {
      return NextResponse.json(
        { error: "Rate limit exceeded." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
  }

  // ── Admin dashboard protection ─────────────────────────────────────────────
  if (path.startsWith("/admin") && !(await checkAdminAuth(req))) {
    const loginUrl = new URL("/login/admin", req.url);
    loginUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(loginUrl);
  }

  // ── Provider dashboard protection ──────────────────────────────────────────
  if (path.startsWith("/provider")) {
    const token = req.cookies.get(STAFF_SESSION_COOKIE)?.value;
    const isProvider = await verifyStaffSessionCookieForProxy(token, "provider");
    const isAdmin = await verifyStaffSessionCookieForProxy(token, "admin");
    if (!isProvider && !isAdmin) {
      const loginUrl = new URL("/login/provider", req.url);
      loginUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── Add audit headers for downstream API routes ────────────────────────────
  // API routes can read x-client-ip and x-request-id for PHI audit logging.
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-client-ip", ip);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.delete("x-actor"); // strip any client-supplied actor header
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  // Echo request-id back to client for support tracing
  res.headers.set("X-Request-Id", requestId);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  if (req.nextUrl.protocol === "https:") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return res;
}

export const config = {
  matcher: [
    // Apply to all routes except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
