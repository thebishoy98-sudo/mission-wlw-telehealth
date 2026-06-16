type AnyPayload = Record<string, any>;

export type NormalizedLifeFileWebhook = {
  event: string;
  lifeFileOrderId: string;
  trackingNumber?: string;
  lifeFileError?: string;
  rawStatus?: string;
};

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

// Pharmacy status progression. A webhook must never move an order backward
// (e.g. a late/out-of-order "shipped" event arriving after FedEx tracking has
// already marked the order "delivered"). "error" is intentionally omitted — it
// is a terminal side-state, not part of the forward progression.
const PHARMACY_STATUS_RANK: Record<string, number> = {
  draft: 0,
  submitted: 1,
  received: 2,
  processing: 3,
  fulfilled: 4,
  shipped: 5,
  delivered: 6,
};

export function isStatusRegression(current: string | null | undefined, incoming: string): boolean {
  const currentRank = PHARMACY_STATUS_RANK[current ?? ""];
  const incomingRank = PHARMACY_STATUS_RANK[incoming];
  if (currentRank === undefined || incomingRank === undefined) return false;
  return incomingRank < currentRank;
}

export function mapLifeFileStatusToEvent(status: string) {
  const normalized = status.trim().toLowerCase().replace(/[\s_-]+/g, "");

  if (["received", "new", "accepted", "rxreceived", "orderreceived"].includes(normalized)) {
    return "order.received";
  }
  if (["processing", "filling", "inprocess", "inprogress", "filled"].includes(normalized)) {
    return "order.processing";
  }
  if (["shipped", "ship", "sent", "mailed"].includes(normalized)) {
    return "order.shipped";
  }
  if (["delivered", "complete", "completed"].includes(normalized)) {
    return "order.delivered";
  }
  if (["error", "failed", "rejected", "cancelled", "canceled", "void"].includes(normalized)) {
    return "order.error";
  }

  return "";
}

export function normalizeLifeFileWebhookPayload(
  payload: AnyPayload,
  queryOrderId = ""
): NormalizedLifeFileWebhook {
  const rawStatus = firstString(
    payload.status,
    payload.Status,
    payload.orderStatus,
    payload.order_status,
    payload.data?.status,
    payload.order?.status,
    payload.order?.general?.statusId
  );
  const event = firstString(payload.event, payload.Event, payload.type) || mapLifeFileStatusToEvent(rawStatus);
  const lifeFileOrderId = firstString(
    payload.orderId,
    payload.OrderId,
    payload.orderID,
    payload.lifeFileOrderId,
    payload.life_file_order_id,
    payload.lifefileOrderId,
    payload.lfOrderId,
    payload.data?.orderId,
    payload.data?.OrderId,
    payload.order?.id,
    payload.order?.orderId,
    queryOrderId
  );
  const trackingNumber = firstString(
    payload.trackingNumber,
    payload.tracking_number,
    payload.tracking,
    payload.data?.trackingNumber,
    payload.shipping?.trackingNumber,
    payload.shipping?.tracking_number
  );
  const lifeFileError = firstString(
    payload.error,
    payload.Error,
    payload.errorMessage,
    payload.message,
    payload.data?.error
  );

  return {
    event,
    lifeFileOrderId,
    trackingNumber: trackingNumber || undefined,
    lifeFileError: lifeFileError || undefined,
    rawStatus: rawStatus || undefined,
  };
}
