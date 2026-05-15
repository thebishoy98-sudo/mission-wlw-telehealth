/**
 * QuickBooks OAuth 2.0 token helper.
 * Shared by quickbooks.ts (accounting) and quickbooks-payments.ts.
 */

export async function getQBAccessToken(): Promise<string> {
  const { QB_CLIENT_ID, QB_CLIENT_SECRET, QB_REFRESH_TOKEN } = process.env;

  if (!QB_CLIENT_ID || !QB_CLIENT_SECRET || !QB_REFRESH_TOKEN) {
    throw new Error(
      "QuickBooks OAuth credentials not configured (QB_CLIENT_ID, QB_CLIENT_SECRET, QB_REFRESH_TOKEN)"
    );
  }

  const credentials = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString("base64");

  const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: QB_REFRESH_TOKEN,
    }),
  });

  if (!res.ok) {
    throw new Error(`QB OAuth token refresh failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token as string;
}
