/**
 * Signed payment retry links for existing orders.
 *
 * Lets admin send a patient a pay-only URL for an order whose checkout
 * failed, without redoing intake/questionnaire/identity. Tokens are
 * stateless HMAC-signed values: base64url(JSON{v, o, e}) + "." + signature.
 */

import crypto from "crypto";
import type { Order, Payment } from "@/types";

const TOKEN_VERSION = "v1";

export const DEFAULT_PAYMENT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type TokenEnv = { PAYMENT_LINK_SECRET?: string; ADMIN_SECRET?: string; [key: string]: string | undefined };

function getPaymentLinkSecret(env: TokenEnv) {
  const secret = env.PAYMENT_LINK_SECRET || env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("PAYMENT_LINK_SECRET or ADMIN_SECRET must be configured to issue payment links.");
  }
  return secret;
}

function sign(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createPaymentLinkToken(
  orderId: string,
  options: { ttlMs?: number; now?: number; env?: TokenEnv } = {}
) {
  const { ttlMs = DEFAULT_PAYMENT_LINK_TTL_MS, now = Date.now(), env = process.env } = options;
  const expiresAtMs = now + ttlMs;
  const payload = Buffer.from(JSON.stringify({ v: TOKEN_VERSION, o: orderId, e: expiresAtMs })).toString("base64url");
  const token = `${payload}.${sign(payload, getPaymentLinkSecret(env))}`;
  return { token, expiresAt: new Date(expiresAtMs).toISOString() };
}

export type PaymentLinkTokenVerification =
  | { valid: true; orderId: string; expiresAt: string }
  | { valid: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyPaymentLinkToken(
  token: string,
  options: { now?: number; env?: TokenEnv } = {}
): PaymentLinkTokenVerification {
  const { now = Date.now(), env = process.env } = options;
  const [payload, signature, ...rest] = String(token ?? "").split(".");
  if (!payload || !signature || rest.length) return { valid: false, reason: "malformed" };

  const expected = sign(payload, getPaymentLinkSecret(env));
  const provided = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length || !crypto.timingSafeEqual(provided, wanted)) {
    return { valid: false, reason: "bad_signature" };
  }

  let parsed: { v?: string; o?: string; e?: number };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (parsed.v !== TOKEN_VERSION || typeof parsed.o !== "string" || typeof parsed.e !== "number") {
    return { valid: false, reason: "malformed" };
  }
  if (parsed.e <= now) return { valid: false, reason: "expired" };

  return { valid: true, orderId: parsed.o, expiresAt: new Date(parsed.e).toISOString() };
}

export function buildPaymentLinkUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/pay/order/${encodeURIComponent(token)}`;
}

export type PaymentRetryEligibility =
  | { eligible: true }
  | { eligible: false; reason: "order_not_found" | "already_paid" | "payment_in_progress" };

/**
 * An order is retryable only while it has no successful payment: the order's
 * paymentStatus and any recorded payment row must both be non-completed.
 * Orders mid-charge ("processing") are treated as in-flight, not retryable.
 */
export function assessPaymentRetryEligibility({
  order,
  payment,
}: {
  order: Pick<Order, "paymentStatus" | "status"> | null | undefined;
  payment?: Pick<Payment, "status"> | null;
}): PaymentRetryEligibility {
  if (!order) return { eligible: false, reason: "order_not_found" };
  if (order.paymentStatus === "completed" || payment?.status === "completed") {
    return { eligible: false, reason: "already_paid" };
  }
  if (order.status === "processing") {
    return { eligible: false, reason: "payment_in_progress" };
  }
  return { eligible: true };
}
