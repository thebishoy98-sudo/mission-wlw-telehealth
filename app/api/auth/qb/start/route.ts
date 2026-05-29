/**
 * QuickBooks OAuth 2.0 - Step 1: Redirect to Intuit authorization page.
 * Visit /api/auth/qb/start to begin the flow.
 * REMOVE this route after obtaining your refresh token.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const clientId = process.env.QB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "QB_CLIENT_ID not set" }, { status: 500 });
  }

  const redirectUri =
    process.env.QB_REDIRECT_URI?.trim() ||
    `${req.nextUrl.origin}/api/auth/qb/callback`;
  const state = crypto.randomUUID();
  const includePaymentsScope = process.env.QB_OAUTH_INCLUDE_PAYMENTS === "true";
  const scope = [
    "com.intuit.quickbooks.accounting",
    includePaymentsScope ? "com.intuit.quickbooks.payment" : "",
  ].filter(Boolean).join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope,
    redirect_uri: redirectUri,
    state,
  });

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
  const response = NextResponse.redirect(authUrl);
  response.cookies.set("qb_oauth_state", state, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
