/**
 * Pharmacy tracking webhook for partners that support Basic Auth only.
 *
 * Expected request:
 *   POST /api/webhooks/pharmacy/tracking
 *   Authorization: Basic base64(username:password)
 *   { "orderId": "LifeFileOrderId", "status": "shipped", "trackingNumber": "1Z..." }
 */

import { NextRequest, NextResponse } from "next/server";
import { applyLifeFileWebhookPayload } from "@/lib/lifefile-webhook-handler";
import { validateBasicAuth } from "@/lib/webhook-auth";

export async function POST(req: NextRequest) {
  const auth = validateBasicAuth({
    authorizationHeader: req.headers.get("authorization"),
    configuredUsername: process.env.PHARMACY_WEBHOOK_USERNAME,
    configuredPassword: process.env.PHARMACY_WEBHOOK_PASSWORD,
    serviceName: "Pharmacy tracking",
  });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const queryOrderId =
    req.nextUrl.searchParams.get("orderId") ??
    req.nextUrl.searchParams.get("lifeFileOrderId") ??
    "";

  return applyLifeFileWebhookPayload(payload, queryOrderId);
}
