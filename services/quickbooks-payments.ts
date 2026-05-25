/**
 * QuickBooks Payments Integration Service
 *
 * Uses the Intuit Payments API (v4) to tokenize and charge cards — same OAuth
 * token as the QuickBooks accounting API.
 *
 * Production setup:
 *   1. Enable QuickBooks Payments in your Intuit developer app
 *   2. OAuth scope must include: com.intuit.quickbooks.payment
 *   3. Set QB_* env vars (same credentials as QuickBooks accounting)
 *   4. For card tokenization client-side, include Intuit's qbpayments.js
 *
 * Intuit Payments API docs:
 *   https://developer.intuit.com/app/developer/qbpayments/docs/api/resources/all-entities/charges
 */

import * as db from "@/lib/db";
import { serviceConfig } from "@/lib/service-config";
import { generateId } from "@/lib/utils";
import { getQBAccessToken } from "@/lib/qb-oauth";

const PAYMENTS_BASE_URL =
  process.env.QB_PAYMENTS_BASE_URL ??
  (process.env.QB_REALM_ID === "9341457089968240"
    ? "https://sandbox.api.intuit.com/quickbooks/v4/payments"
    : "https://api.intuit.com/quickbooks/v4/payments");

interface QBChargeRequest {
  amount: string; // e.g. "299.00"
  currency: "USD";
  capture: boolean;
  token?: string;         // card token from qbpayments.js (preferred — no PCI scope)
  card?: {                // raw card — only for server-to-server, requires PCI compliance
    number: string;
    expMonth: string;
    expYear: string;
    cvc: string;
    name: string;
    address?: {
      streetAddress: string;
      city: string;
      region: string;
      country: string;
      postalCode: string;
    };
  };
  context?: {
    mobile: boolean;
    isEcommerce: boolean;
    reconnect: boolean;
  };
  customerIdRef?: string; // QB customer ID from accounting API
}

interface QBChargeResponse {
  id: string;
  status: "CAPTURED" | "DECLINED" | "REQUIRES_CAPTURE" | "VOIDED" | "REFUNDED";
  amount: string;
  currency: "USD";
  card?: {
    number: string; // masked, e.g. "xxxx xxxx xxxx 4242"
    name: string;
    expMonth: string;
    expYear: string;
    cardType: string; // "Visa", "Mastercard", etc.
    commercialCardCode?: string;
  };
  authCode?: string;
  errors?: Array<{ code: string; detail: string; message: string; moreInfo: string }>;
  created: string;
  updated: string;
}


/**
 * Charge a card using the QuickBooks Payments API.
 *
 * In production, pass a `token` obtained from qbpayments.js on the client
 * (avoids handling raw card data and PCI compliance scope).
 *
 * Mock mode: returns a simulated success response when QuickBooks is disabled
 * or QB_CLIENT_ID is not set.
 */
export async function chargeCard(
  orderId: string,
  patientId: string,
  amountDollars: number,
  paymentDetails: {
    token?: string;       // preferred: tokenized card from qbpayments.js
    cardNumber?: string;  // raw card (sandbox/server-to-server only)
    expMonth?: string;
    expYear?: string;
    cvc?: string;
    cardName?: string;
    cardLast4?: string;
    cardBrand?: string;
    customerIdRef?: string;
    billingAddress?: { street1: string; city: string; state: string; zipCode: string; country: string };
  }
): Promise<{ chargeId: string; status: string; cardLast4: string; cardBrand: string }> {
  const amountFormatted = amountDollars.toFixed(2);

  // ── Mock mode ──────────────────────────────────────────────────────────────
  if (serviceConfig.quickbooks.useMock || !process.env.QB_CLIENT_ID) {
    const mockChargeId = `qbp_mock_${generateId()}`;
    logPaymentEvent("QB Payments mock charge", orderId, patientId, {
      chargeId: mockChargeId, amount: amountDollars, mode: "mock",
    });
    return {
      chargeId: mockChargeId,
      status: "CAPTURED",
      cardLast4: paymentDetails.cardLast4 ?? "0000",
      cardBrand: paymentDetails.cardBrand ?? "unknown",
    };
  }

  // ── Real QB Payments API ───────────────────────────────────────────────────
  if (!paymentDetails.token && process.env.QB_ALLOW_RAW_CARD_CHARGES !== "true") {
    logPaymentEvent("QB Payments token missing", orderId, patientId, {
      amount: amountDollars,
      mode: "live",
    }, "error");
    throw new Error("QuickBooks Payments token is required in live mode. Configure Intuit client-side tokenization before taking production payments.");
  }

  const accessToken = await getQBAccessToken();
  const requestId = generateId(); // idempotency key

  const payload: QBChargeRequest = {
    amount: amountFormatted,
    currency: "USD",
    capture: true,
    context: { mobile: false, isEcommerce: true, reconnect: false },
    customerIdRef: paymentDetails.customerIdRef,
    ...(paymentDetails.token
      ? { token: paymentDetails.token }
      : paymentDetails.cardNumber
      ? {
          card: {
            number: paymentDetails.cardNumber,
            expMonth: paymentDetails.expMonth ?? "",
            expYear: paymentDetails.expYear ?? "",
            cvc: paymentDetails.cvc ?? "",
            name: paymentDetails.cardName ?? "",
            ...(paymentDetails.billingAddress
              ? {
                  address: {
                    streetAddress: paymentDetails.billingAddress.street1,
                    city: paymentDetails.billingAddress.city,
                    region: paymentDetails.billingAddress.state,
                    country: paymentDetails.billingAddress.country ?? "US",
                    postalCode: paymentDetails.billingAddress.zipCode,
                  },
                }
              : {}),
          },
        }
      : {}),
  };

  const res = await fetch(`${PAYMENTS_BASE_URL}/charges`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "Request-Id": requestId,
    },
    body: JSON.stringify(payload),
  });

  const charge: QBChargeResponse = await res.json();

  if (!res.ok || charge.errors?.length) {
    const errMsg = charge.errors?.map((e) => e.message).join("; ") ?? `HTTP ${res.status}`;
    logPaymentEvent("QB Payments charge failed", orderId, patientId, {
      error: errMsg, requestId,
    }, "error");
    throw new Error(`QuickBooks Payments charge failed: ${errMsg}`);
  }

  if (charge.status === "DECLINED") {
    logPaymentEvent("QB Payments card declined", orderId, patientId, {
      chargeId: charge.id, requestId,
    }, "error");
    throw new Error("Card was declined. Please check your card details and try again.");
  }

  logPaymentEvent("QB Payments charge captured", orderId, patientId, {
    chargeId: charge.id,
    amount: amountDollars,
    cardType: charge.card?.cardType ?? "unknown",
    authCode: charge.authCode,
  });

  return {
    chargeId: charge.id,
    status: charge.status,
    cardLast4: charge.card?.number?.slice(-4) ?? paymentDetails.cardLast4 ?? "0000",
    cardBrand: charge.card?.cardType ?? paymentDetails.cardBrand ?? "unknown",
  };
}

/**
 * Void (cancel) an uncaptured charge.
 */
export async function voidCharge(chargeId: string): Promise<void> {
  if (serviceConfig.quickbooks.useMock || !process.env.QB_CLIENT_ID) return; // mock mode

  const accessToken = await getQBAccessToken();
  await fetch(`${PAYMENTS_BASE_URL}/charges/${chargeId}/void`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Request-Id": generateId() },
  });
}

/**
 * Refund a captured charge (full or partial).
 */
export async function refundCharge(
  chargeId: string,
  amountDollarsRefund?: number
): Promise<void> {
  if (serviceConfig.quickbooks.useMock || !process.env.QB_CLIENT_ID) return; // mock mode

  const accessToken = await getQBAccessToken();
  const body = amountDollarsRefund
    ? JSON.stringify({ amount: amountDollarsRefund.toFixed(2), currency: "USD" })
    : undefined;

  await fetch(`${PAYMENTS_BASE_URL}/charges/${chargeId}/refunds`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "Request-Id": generateId(),
    },
    body,
  });
}

function logPaymentEvent(
  action: string,
  orderId: string,
  patientId: string,
  details: Record<string, unknown>,
  status: "success" | "error" = "success"
) {
  db.integrationLogDb.create({
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "quickbooks",
    action,
    orderId,
    patientId,
    status,
    details,
  });
}
