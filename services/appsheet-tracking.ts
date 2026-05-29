type AppSheetRow = Record<string, unknown>;

export type AppSheetTrackingUpdate = {
  source: "appsheet";
  event: "order.shipped";
  orderId: string;
  trackingNumber: string;
  appSheetTable: string;
  appSheetRowId?: string;
  rawStatus?: string;
  payload: AppSheetRow;
};

const config = () => ({
  appId: process.env.APPSHEET_ID ?? "",
  apiKey: process.env.APPSHEET_API_KEY ?? "",
  baseUrl: process.env.APPSHEET_BASE_URL ?? "https://www.appsheet.com",
  timezone: process.env.APPSHEET_TIMEZONE ?? "America/New_York",
  shipmentTable: process.env.APPSHEET_SHIPMENT_TABLE ?? "PharmacyShipment",
  pharmacyOrderTable: process.env.APPSHEET_PHARMACY_ORDER_TABLE ?? "PharmacyOrder",
});

export function isAppSheetTrackingConfigured() {
  const c = config();
  return Boolean(c.appId && c.apiKey);
}

export function extractAppSheetTrackingUpdates(rows: AppSheetRow[], table = "PharmacyShipment"): AppSheetTrackingUpdate[] {
  const seen = new Set<string>();
  const updates: AppSheetTrackingUpdate[] = [];

  for (const row of rows) {
    const orderId = firstText(row.OrderId, row.orderId, row["Pharmacy Order ID"], row.lifeFileOrderId);
    const trackingNumber = firstText(
      row.TrackingNumber,
      row.trackingNumber,
      row["Tracking Number"],
      row["Shipment Tracking Number"]
    );
    if (!orderId || !trackingNumber) continue;

    const key = `${orderId}:${trackingNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);

    updates.push({
      source: "appsheet",
      event: "order.shipped",
      orderId,
      trackingNumber,
      appSheetTable: table,
      appSheetRowId: firstText(row.ID, row.id),
      rawStatus: firstText(row.rxStatus, row.Status, row.status),
      payload: row,
    });
  }

  return updates;
}

export function dedupeAppSheetTrackingUpdates(updates: AppSheetTrackingUpdate[]): AppSheetTrackingUpdate[] {
  const seen = new Set<string>();
  const deduped: AppSheetTrackingUpdate[] = [];

  for (const update of updates) {
    const key = `${update.orderId}:${update.trackingNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(update);
  }

  return deduped;
}

export async function fetchAppSheetTrackingUpdates(): Promise<AppSheetTrackingUpdate[]> {
  const c = config();
  if (!isAppSheetTrackingConfigured()) {
    throw new Error("APPSHEET_ID and APPSHEET_API_KEY are not configured");
  }

  const [shipmentRows, orderRows] = await Promise.all([
    findRows(c.shipmentTable),
    findRows(c.pharmacyOrderTable),
  ]);

  return dedupeAppSheetTrackingUpdates([
    ...extractAppSheetTrackingUpdates(shipmentRows, c.shipmentTable),
    ...extractAppSheetTrackingUpdates(orderRows, c.pharmacyOrderTable),
  ]);
}

async function findRows(table: string): Promise<AppSheetRow[]> {
  const c = config();
  const url = `${c.baseUrl.replace(/\/$/, "")}/api/v2/apps/${encodeURIComponent(c.appId)}/tables/${encodeURIComponent(table)}/Action?applicationAccessKey=${encodeURIComponent(c.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Action: "Find",
      Properties: {
        Locale: "en-US",
        Timezone: c.timezone,
      },
      Rows: [],
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`AppSheet tracking API ${response.status}: ${JSON.stringify(body)}`);
  }
  if (Array.isArray(body)) return body.filter(isRow);
  if (Array.isArray(body.Rows)) return body.Rows.filter(isRow);
  return [];
}

function isRow(value: unknown): value is AppSheetRow {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text.toLowerCase() !== "null" && text.toLowerCase() !== "undefined") return text;
  }
  return "";
}
