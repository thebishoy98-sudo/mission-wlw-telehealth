/**
 * Subscription enrollment for the pay page.
 *
 * When a patient pays through a "pay + save card" link and authorizes recurring
 * billing, we (1) store their card on file with QuickBooks and charge that
 * stored card, and (2) create or advance their subscription. This is the opt-in
 * path for both existing customers (via the link we text them) and new ones.
 */

import * as dbServer from "@/lib/db.server";
import * as quickbooks from "@/services/quickbooks";
import * as qbPayments from "@/services/quickbooks-payments";
import { computeInitialCycle, advanceCycle, DEFAULT_INTERVAL_DAYS, DEFAULT_LEAD_DAYS } from "@/lib/subscription";
import { generateId } from "@/lib/utils";
import type { Order, Patient, Product, Subscription } from "@/types";

/**
 * Ensure a QB customer, store the card from a single-use token, then charge the
 * stored card. Using store-then-charge keeps a reusable card-on-file from one
 * tokenization. Returns the charge result plus the stored-card metadata.
 */
export async function storeCardAndChargeStored(params: {
  order: Order;
  patient: Patient;
  amount: number;
  cardToken: string;
  cardLast4?: string;
  cardBrand?: string;
}): Promise<{
  chargeResult: { chargeId: string; status: string; cardLast4: string; cardBrand: string };
  qbCustomerId: string;
  qbCardId: string;
  cardLast4: string;
  cardBrand: string;
}> {
  const { order, patient, amount, cardToken } = params;
  const qbCustomerId = await quickbooks.createCustomerRecord(patient);
  const stored = await qbPayments.storeCardOnFile(qbCustomerId, cardToken, {
    cardLast4: params.cardLast4,
    cardBrand: params.cardBrand,
  });
  const chargeResult = await qbPayments.chargeStoredCard(order.id, patient.id, amount, {
    customerId: qbCustomerId,
    cardId: stored.cardId,
    cardLast4: stored.cardLast4,
    cardBrand: stored.cardBrand,
  });
  return {
    chargeResult,
    qbCustomerId,
    qbCardId: stored.cardId,
    cardLast4: stored.cardLast4,
    cardBrand: stored.cardBrand,
  };
}

/**
 * Persist card-on-file + recurring consent on the patient and create or advance
 * the subscription. Idempotent per (patient, product): an existing active
 * subscription (or the one this order belongs to) is advanced to a fresh cycle.
 */
export async function recordEnrollment(params: {
  order: Order;
  patient: Patient;
  product: Product;
  qbCustomerId: string;
  qbCardId: string;
  cardLast4: string;
  cardBrand: string;
  nowIso?: string;
}): Promise<Subscription> {
  const { order, patient, product, qbCustomerId, qbCardId, cardLast4, cardBrand } = params;
  const now = params.nowIso ?? new Date().toISOString();

  await dbServer.patientDb
    .update(patient.id, { qbCardId, cardLast4, cardBrand, recurringConsentAt: now })
    .catch(() => {});

  // Find the subscription this order belongs to, or any active one for the product.
  let subscription: Subscription | null = null;
  if (order.subscriptionId) {
    subscription = await dbServer.subscriptionDb.getById(order.subscriptionId).catch(() => null);
  }
  if (!subscription) {
    subscription = await dbServer.subscriptionDb
      .getActiveByPatientProduct(patient.id, order.productId)
      .catch(() => null);
  }

  if (subscription) {
    // Advance the existing subscription to a fresh cycle from this payment.
    const cycle = advanceCycle(undefined, now, subscription.intervalDays, subscription.leadDays);
    const updated = await dbServer.subscriptionDb.update(subscription.id, {
      status: "active",
      doseId: order.doseId,
      ...cycle,
      lastOrderId: order.id,
      lastChargedAt: now,
      qbCustomerId,
    });
    if (!order.subscriptionId) {
      await dbServer.orderDb.update(order.id, { subscriptionId: subscription.id, isRefill: true }).catch(() => {});
    }
    return updated ?? subscription;
  }

  // Create a new subscription anchored to this payment.
  const cycle = computeInitialCycle(now, DEFAULT_INTERVAL_DAYS, DEFAULT_LEAD_DAYS);
  const newSub: Subscription = {
    id: `sub_${Date.now()}${generateId().slice(0, 4)}`,
    patientId: patient.id,
    productId: order.productId,
    doseId: order.doseId,
    status: "active",
    intervalDays: DEFAULT_INTERVAL_DAYS,
    leadDays: DEFAULT_LEAD_DAYS,
    coversThrough: cycle.coversThrough,
    nextRunAt: cycle.nextRunAt,
    lastOrderId: order.id,
    lastChargedAt: now,
    sourceOrderId: order.id,
    qbCustomerId,
    createdAt: now,
    updatedAt: now,
  };
  await dbServer.subscriptionDb.create(newSub);
  await dbServer.orderDb.update(order.id, { subscriptionId: newSub.id }).catch(() => {});
  return newSub;
}
