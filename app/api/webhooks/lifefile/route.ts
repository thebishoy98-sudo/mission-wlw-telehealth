/**
 * Life File Pharmacy Webhook Handler
 *
 * Normalized endpoint:
 *   POST /api/webhooks/lifefile
 *   { "event": "order.shipped", "orderId": "24200716", "trackingNumber": "1Z..." }
 *
 * Raw Life File-compatible endpoint:
 *   PUT/POST /api/webhooks/lifefile/order/{orderId}/status
 *   { "status": "shipped" }
 */

import { NextRequest } from "next/server";
import { handleLifeFileWebhook } from "@/lib/lifefile-webhook-handler";

export async function POST(req: NextRequest) {
  return handleLifeFileWebhook(req);
}
