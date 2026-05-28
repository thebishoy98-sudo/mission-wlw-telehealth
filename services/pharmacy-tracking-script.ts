type TrackingScriptPayload = Record<string, unknown>;

type TrackingScriptResult =
  | { sent: true; status: number }
  | { skipped: string }
  | { error: string; status?: number };

const config = () => ({
  enabled: process.env.USE_PHARMACY_TRACKING_SCRIPT === "true",
  url: process.env.PHARMACY_TRACKING_SCRIPT_URL ?? "",
  username: process.env.PHARMACY_TRACKING_SCRIPT_USERNAME ?? "",
  password: process.env.PHARMACY_TRACKING_SCRIPT_PASSWORD ?? "",
});

export function isTrackingScriptConfigured() {
  const c = config();
  return Boolean(c.url && c.username && c.password);
}

export function buildTrackingScriptAuthHeader(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export function extractTrackingScriptUpdates(responseBody: unknown): TrackingScriptPayload[] {
  if (Array.isArray(responseBody)) return responseBody.filter(isPayloadObject);
  if (!isPayloadObject(responseBody)) return [];

  const body = responseBody as Record<string, unknown>;
  for (const key of ["updates", "data", "rows", "items", "trackingUpdates"]) {
    const value = body[key];
    if (Array.isArray(value)) return value.filter(isPayloadObject);
  }

  if (hasTrackingShape(body)) return [body];
  return [];
}

export async function forwardTrackingToScript(payload: TrackingScriptPayload): Promise<TrackingScriptResult> {
  const c = config();
  if (!c.enabled) return { skipped: "disabled" };
  if (!isTrackingScriptConfigured()) return { error: "PHARMACY_TRACKING_SCRIPT_* env vars are not configured" };

  const response = await fetch(c.url, {
    method: "POST",
    headers: {
      Authorization: buildTrackingScriptAuthHeader(c.username, c.password),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "mission-wlw",
      action: "tracking.forward",
      sentAt: new Date().toISOString(),
      payload,
    }),
  });

  if (!response.ok) {
    return { error: `Tracking script returned HTTP ${response.status}`, status: response.status };
  }
  return { sent: true, status: response.status };
}

export async function fetchTrackingScriptUpdates(): Promise<TrackingScriptPayload[]> {
  const c = config();
  if (!isTrackingScriptConfigured()) {
    throw new Error("PHARMACY_TRACKING_SCRIPT_* env vars are not configured");
  }

  const response = await fetch(c.url, {
    method: "POST",
    headers: {
      Authorization: buildTrackingScriptAuthHeader(c.username, c.password),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "mission-wlw",
      action: "tracking.sync",
      requestedAt: new Date().toISOString(),
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Tracking script returned HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }

  if (!text.trim()) return [];
  try {
    return extractTrackingScriptUpdates(JSON.parse(text));
  } catch {
    throw new Error("Tracking script did not return valid JSON");
  }
}

function isPayloadObject(value: unknown): value is TrackingScriptPayload {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasTrackingShape(body: Record<string, unknown>) {
  return Boolean(
    body.orderId ||
      body.OrderId ||
      body.lifeFileOrderId ||
      body.lifefileOrderId ||
      body.trackingNumber ||
      body.tracking_number ||
      body.status ||
      body.Status
  );
}
