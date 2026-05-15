/**
 * QuickBooks OAuth 2.0 — Step 2: Exchange code for tokens.
 * Intuit redirects here after user authorizes.
 * REMOVE this route after obtaining your refresh token.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const error = searchParams.get("error");

  if (error) {
    return new NextResponse(
      `<pre style="font-family:monospace;padding:2rem">OAuth error: ${error}\n${searchParams.get("error_description") ?? ""}</pre>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code || !realmId) {
    return new NextResponse(
      `<pre style="font-family:monospace;padding:2rem">Missing code or realmId in callback</pre>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const { QB_CLIENT_ID, QB_CLIENT_SECRET } = process.env;
  if (!QB_CLIENT_ID || !QB_CLIENT_SECRET) {
    return new NextResponse(
      `<pre style="font-family:monospace;padding:2rem">QB_CLIENT_ID or QB_CLIENT_SECRET not set</pre>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const redirectUri = `${req.nextUrl.origin}/api/auth/qb/callback`;
  const credentials = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString("base64");

  const tokenRes = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return new NextResponse(
      `<pre style="font-family:monospace;padding:2rem">Token exchange failed (${tokenRes.status}):\n${text}</pre>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const tokens = await tokenRes.json();

  const html = `<!DOCTYPE html>
<html>
<head><title>QuickBooks OAuth Success</title></head>
<body style="font-family:monospace;padding:2rem;background:#f0fdf4;color:#14532d">
<h2>✅ QuickBooks Connected!</h2>
<p>Add these to your <strong>.env.local</strong> and <strong>Vercel environment variables</strong>:</p>
<pre style="background:#fff;border:1px solid #86efac;padding:1.5rem;border-radius:8px;font-size:14px">
QB_REALM_ID=${realmId}
QB_REFRESH_TOKEN=${tokens.refresh_token}
QB_CLIENT_ID=${QB_CLIENT_ID}
QB_CLIENT_SECRET=${QB_CLIENT_SECRET}
USE_REAL_QUICKBOOKS=true
</pre>
<p style="color:#6b7280;font-size:13px">⚠️ The access token expires in 1 hour — the refresh token lasts 100 days and gets auto-renewed.</p>
<p style="color:#dc2626;font-size:13px">🔒 Delete /api/auth/qb/ routes after saving these values.</p>
</body>
</html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
