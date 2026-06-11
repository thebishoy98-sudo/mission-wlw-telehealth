export type FedExPackageStatusKind = "delivered" | "out_for_delivery" | "in_transit" | "unknown";

export type FedExPackageStatus = {
  kind: FedExPackageStatusKind;
  code?: string;
  description?: string;
  raw?: unknown;
};

const DELIVERED_CODES = new Set(["DL", "DELIVERED"]);
const OUT_FOR_DELIVERY_CODES = new Set(["OD", "OUT_FOR_DELIVERY"]);

const config = () => ({
  baseUrl: (process.env.FEDEX_API_BASE_URL ?? "https://apis.fedex.com").replace(/\/$/, ""),
  clientId: process.env.FEDEX_CLIENT_ID ?? "",
  clientSecret: process.env.FEDEX_CLIENT_SECRET ?? "",
});

export function isFedExTrackingConfigured() {
  const c = config();
  return Boolean(c.clientId && c.clientSecret);
}

export function isDeliveredFedExStatus(status: FedExPackageStatus) {
  return status.kind === "delivered";
}

export function isOutForDeliveryFedExStatus(status: FedExPackageStatus) {
  return status.kind === "out_for_delivery";
}

export function extractFedExPackageStatus(payload: unknown): FedExPackageStatus {
  const trackResult = firstTrackResult(payload);
  const latestStatus = readObject(trackResult?.latestStatusDetail);
  const code = firstText(latestStatus?.code, latestStatus?.derivedCode).toUpperCase();
  const description = firstText(
    latestStatus?.statusByLocale,
    latestStatus?.description,
    latestStatus?.scanLocation,
    trackResult?.derivedStatus
  );
  const normalizedDescription = description.toLowerCase();

  if (DELIVERED_CODES.has(code) || /\bdelivered\b/.test(normalizedDescription)) {
    return { kind: "delivered", code, description, raw: trackResult };
  }

  if (
    OUT_FOR_DELIVERY_CODES.has(code) ||
    normalizedDescription.includes("out for delivery") ||
    normalizedDescription.includes("vehicle for delivery")
  ) {
    return { kind: "out_for_delivery", code, description, raw: trackResult };
  }

  if (code || description) {
    return { kind: "in_transit", code, description, raw: trackResult };
  }

  return { kind: "unknown", raw: payload };
}

export async function fetchFedExTrackingStatus(trackingNumber: string): Promise<FedExPackageStatus> {
  const token = await fetchFedExAccessToken();
  const c = config();
  const response = await fetch(`${c.baseUrl}/track/v1/trackingnumbers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      includeDetailedScans: true,
      trackingInfo: [
        {
          trackingNumberInfo: {
            trackingNumber,
          },
        },
      ],
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`FedEx Track API ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }

  return extractFedExPackageStatus(body);
}

async function fetchFedExAccessToken(): Promise<string> {
  const c = config();
  if (!c.clientId || !c.clientSecret) {
    throw new Error("FEDEX_CLIENT_ID and FEDEX_CLIENT_SECRET are required");
  }

  const response = await fetch(`${c.baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: c.clientId,
      client_secret: c.clientSecret,
    }).toString(),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`FedEx OAuth ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }

  return String(body.access_token);
}

function firstTrackResult(payload: unknown): Record<string, unknown> | null {
  const root = readObject(payload);
  const output = readObject(root?.output);
  const completeTrackResults = readArray(output?.completeTrackResults);
  for (const complete of completeTrackResults) {
    const completeObject = readObject(complete);
    const trackResults = readArray(completeObject?.trackResults);
    for (const result of trackResults) {
      const resultObject = readObject(result);
      if (resultObject) return resultObject;
    }
  }
  return null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text.toLowerCase() !== "null" && text.toLowerCase() !== "undefined") return text;
  }
  return "";
}
