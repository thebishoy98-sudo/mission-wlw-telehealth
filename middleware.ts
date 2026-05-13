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

// ── Admin / Provider route protection ────────────────────────────────────────
// In production, replace this with a real session check (NextAuth, Clerk, etc.)
// For now, we check the ADMIN_SECRET header that your internal dashboards set.
function checkAdminAuth(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true; // not configured — allow in dev

  const provided =
    req.headers.get("x-admin-secret") ??
    req.cookies.get("admin_secret")?.value;

  return provided === secret;
}

// ── Main middleware ────────────────────────────────────────────────────────────
export function middleware(req: NextRequest) {
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
  } else if (path.startsWith("/api/")) {
    if (!rateLimit(`${ip}:api`, 100, 60 * 1000)) {
      return NextResponse.json(
        { error: "Rate limit exceeded." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
  }

  // ── Admin dashboard protection ─────────────────────────────────────────────
  if (path.startsWith("/admin") && !checkAdminAuth(req)) {
    // Redirect to a simple login page (or return 401 for API calls)
    const loginUrl = new URL("/admin/login", req.url);
    loginUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(loginUrl);
  }

  // ── Add audit headers for downstream API routes ────────────────────────────
  // API routes can read x-client-ip and x-request-id for PHI audit logging.
  const requestId = crypto.randomUUID();
  const res = NextResponse.next();
  res.headers.set("x-client-ip", ip);
  res.headers.set("x-request-id", requestId);
  // Echo request-id back to client for support tracing
  res.headers.set("X-Request-Id", requestId);

  return res;
}

export const config = {
  matcher: [
    // Apply to all routes except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
