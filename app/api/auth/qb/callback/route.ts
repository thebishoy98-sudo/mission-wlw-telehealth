/**
 * QuickBooks OAuth 2.0 - Step 2: Exchange code for tokens.
 * Intuit redirects here after user authorizes.
 * REMOVE this route after obtaining your refresh token.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const error = searchParams.get("error");
  const state = searchParams.get("state");
  const expectedState = req.cookies.get("qb_oauth_state")?.value;

  const html = (body: string, status = 200) => {
    const response = new NextResponse(body, {
      status,
      headers: { "Content-Type": "text/html" },
    });
    response.cookies.delete("qb_oauth_state");
    return response;
  };

  if (error) {
    return html(
      `<pre style="font-family:monospace;padding:2rem">OAuth error: ${escapeHtml(error)}\n${escapeHtml(searchParams.get("error_description"))}</pre>`,
      400
    );
  }

  if (!state || !expectedState || state !== expectedState) {
    return html(
      `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:2rem;max-width:760px">
        <h1 style="font-size:24px;margin-bottom:12px">QuickBooks connection needs to be restarted</h1>
        <p style="line-height:1.6;color:#374151">
          This callback can only finish after starting from Mission WLW because it needs a temporary security cookie.
          Open the connect link below in this same browser, approve QuickBooks, and let Intuit redirect back automatically.
        </p>
        <p><a href="/api/auth/qb/start" style="color:#0f766e;font-weight:700">Restart QuickBooks connection</a></p>
      </div>`,
      400
    );
  }

  if (!code || !realmId) {
    return html(
      `<pre style="font-family:monospace;padding:2rem">Missing code or realmId in callback</pre>`,
      400
    );
  }

  const { QB_CLIENT_ID, QB_CLIENT_SECRET } = process.env;
  if (!QB_CLIENT_ID || !QB_CLIENT_SECRET) {
    return html(
      `<pre style="font-family:monospace;padding:2rem">QB_CLIENT_ID or QB_CLIENT_SECRET not set</pre>`,
      500
    );
  }

  const redirectUri =
    process.env.QB_REDIRECT_URI?.trim() ||
    `${req.nextUrl.origin}/api/auth/qb/callback`;
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
    return html(
      `<pre style="font-family:monospace;padding:2rem">Token exchange failed (${tokenRes.status}):\n${escapeHtml(text)}</pre>`,
      502
    );
  }

  const tokens = await tokenRes.json();

  const successHtml = `<!DOCTYPE html>
<html>
<head><title>QuickBooks OAuth Success</title></head>
<body style="font-family:monospace;padding:2rem;background:#f0fdf4;color:#14532d">
<h2>✅ QuickBooks Connected!</h2>
<p>Add these to your <strong>Vercel environment variables</strong>:</p>
<pre style="background:#fff;border:1px solid #86efac;padding:1.5rem;border-radius:8px;font-size:14px">
QB_REALM_ID=${escapeHtml(realmId)}
QB_REFRESH_TOKEN=${escapeHtml(tokens.refresh_token)}
USE_REAL_QUICKBOOKS=true
</pre>
<p style="color:#6b7280;font-size:13px">⚠️ The access token expires in 1 hour - the refresh token lasts 100 days and gets auto-renewed.</p>
<p style="color:#dc2626;font-size:13px">🔒 Treat the refresh token like a password. Do not send it in chat.</p>
</body>
</html>`;

  return html(successHtml);
}
