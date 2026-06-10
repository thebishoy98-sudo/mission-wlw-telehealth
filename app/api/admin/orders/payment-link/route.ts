/**
 * Admin: create a signed payment retry link for an existing unpaid order.
 *
 * The link opens a pay-only page that charges QuickBooks against the SAME
 * order — no new order, no repeated intake/questionnaire/identity.
 * Refused for orders that already have a completed payment.
 */

import { NextRequest, NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { requireAdmin } from "@/lib/server-auth";
import { getPublicBaseUrl } from "@/lib/public-url";
import {
  assessPaymentRetryEligibility,
  buildPaymentLinkUrl,
  createPaymentLinkToken,
} from "@/lib/payment-link";
import { generateId } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const order = await dbServer.orderDb.getById(orderId).catch(() => null);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const payment = await dbServer.paymentDb.getByOrder(orderId).catch(() => null);
  const eligibility = assessPaymentRetryEligibility({ order, payment });
  if (!eligibility.eligible) {
    const message =
      eligibility.reason === "already_paid"
        ? "Order already has a completed payment - payment link refused."
        : "Order has a payment attempt in progress - payment link refused.";
    return NextResponse.json({ error: message, reason: eligibility.reason }, { status: 409 });
  }

  let link: { token: string; expiresAt: string };
  try {
    link = createPaymentLinkToken(orderId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }

  const url = buildPaymentLinkUrl(getPublicBaseUrl(req), link.token);

  await dbServer.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "system",
    action: "Payment link created for unpaid order",
    orderId,
    patientId: order.patientId,
    status: "success",
    details: { expiresAt: link.expiresAt, source: "admin_orders" },
  }).catch(() => {});

  return NextResponse.json({ url, token: link.token, expiresAt: link.expiresAt });
}
