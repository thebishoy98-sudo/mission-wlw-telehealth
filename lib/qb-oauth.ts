/**
 * QuickBooks OAuth 2.0 token helper.
 * Shared by quickbooks.ts (accounting) and quickbooks-payments.ts.
 */

import { appSettingDb } from "@/lib/db.server";

const REFRESH_TOKEN_SETTING_KEY = "quickbooks_refresh_token";
const ACCESS_TOKEN_SKEW_MS = 60_000;

let cachedAccessToken: { token: string; expiresAt: number } | null = null;
let refreshInFlight: Promise<string> | null = null;

async function getStoredRefreshToken() {
  const stored = await appSettingDb.get<string>(REFRESH_TOKEN_SETTING_KEY).catch(() => null);
  return (typeof stored === "string" && stored.trim()) || process.env.QB_REFRESH_TOKEN;
}

async function saveStoredRefreshToken(refreshToken: string | undefined) {
  if (!refreshToken?.trim()) return;
  await appSettingDb.set(REFRESH_TOKEN_SETTING_KEY, refreshToken).catch(() => refreshToken);
}

async function refreshQBAccessToken(): Promise<string> {
  const { QB_CLIENT_ID, QB_CLIENT_SECRET } = process.env;
  const refreshToken = await getStoredRefreshToken();

  if (!QB_CLIENT_ID || !QB_CLIENT_SECRET || !refreshToken) {
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
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`QB OAuth token refresh failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  await saveStoredRefreshToken(data.refresh_token);
  const rawExpiresInSeconds = Number(data.expires_in ?? 3600);
  const expiresInSeconds = Number.isFinite(rawExpiresInSeconds) ? rawExpiresInSeconds : 3600;
  cachedAccessToken = {
    token: data.access_token as string,
    expiresAt: Date.now() + Math.max(60, expiresInSeconds) * 1000 - ACCESS_TOKEN_SKEW_MS,
  };
  return data.access_token as string;
}

export async function getQBAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.token;
  }

  if (!refreshInFlight) {
    refreshInFlight = refreshQBAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}
