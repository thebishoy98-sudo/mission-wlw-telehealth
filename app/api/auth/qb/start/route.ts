/**
 * QuickBooks OAuth 2.0 - Step 1: Redirect to Intuit authorization page.
 * Visit /api/auth/qb/start to begin the flow.
 * REMOVE this route after obtaining your refresh token.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const clientId = process.env.QB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "QB_CLIENT_ID not set" }, { status: 500 });
  }

  const redirectUri = `${req.nextUrl.origin}/api/auth/qb/callback`;
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting com.intuit.quickbooks.payment",
    redirect_uri: redirectUri,
    state,
  });

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}
