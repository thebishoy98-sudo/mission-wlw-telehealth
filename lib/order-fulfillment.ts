/**
 * Shared refill fulfillment for subscription auto-billing.
 *
 * `createRefillOrder` creates a new unpaid order for a subscription cycle.
 * `fulfillChargedRefillOrder` runs the post-charge integration chain (record
 * payment -> QuickBooks accounting -> PracticeQ automation -> pharmacy dispatch
 * -> provider review). It mirrors the proven payment-link retry chain but is
 * tailored for refills: identity is reused from the patient's prior verified
 * orders, and patient SMS is owned by the subscription cron (not this helper).
 *
 * Provider review is created as a non-blocking acknowledgment record — the
 * provider can mark it reviewed, but dispatch is NOT gated on that action.
 */

import * as dbServer from "@/lib/db.server";
import * as quickbooks from "@/services/quickbooks";
import * as pharmacy from "@/services/pharmacy";
import { sendAdminNotification } from "@/services/admin-notifications";
import {
  queuePracticeQAutomationForOrder,
  wakePracticeQRemoteWorker,
} from "@/services/practiceq-automation-orchestration";
import { shouldBypassQuickBooksPayment } from "@/lib/payment-bypass";
import {
  canDispatchPharmacyAfterPayment,
  getPracticeQAutomationAfterPaymentDecision,
  isRealPharmacyEnabled,
} from "@/lib/payment-dispatch-safety";
import { resolveReusableCheckoutIdentity } from "@/lib/checkout-identity-reuse";
import { getIdentityGate } from "@/lib/identity";
import { normalizeOrderForPharmacyDispatch } from "@/lib/pharmacy-dispatch";
import { normalizeProduct } from "@/data/products";
import { logPhiDisclosure } from "@/lib/phi-audit";
import { generateId } from "@/lib/utils";
import type { Order, Patient, Product, Payment, Subscription } from "@/types";

let refillSequence = 0;
function newRefillOrderId(): string {
  // Matches the existing `order_<ms>` shape; suffix avoids same-ms collisions
  // when the cron creates several refill orders in one tick.
  refillSequence = (refillSequence + 1) % 1000;
  return `order_${Date.now()}${String(refillSequence).padStart(3, "0")}`;
}

/**
 * Create a new unpaid refill order for a subscription cycle. Status starts at
 * pending_review; it advances once charged + dispatched.
 */
export async function createRefillOrder(
  subscription: Subscription,
  patient: Patient,
  lastOrder: Order | null
): Promise<Order> {
  const now = new Date().toISOString();
  const order: Order = {
    id: newRefillOrderId(),
    patientId: patient.id,
    productId: subscription.productId,
    doseId: subscription.doseId,
    status: "pending_review",
    paymentStatus: "pending",
    pharmacyStatus: "draft",
    practiceQStatus: "pending",
    quickbooksStatus: "pending",
    practiceqClientId: lastOrder?.practiceqClientId,
    identityStatus: lastOrder?.identityStatus,
    isRefill: true,
    subscriptionId: subscription.id,
    createdAt: now,
    updatedAt: now,
  };
  await dbServer.orderDb.create(order);
  return order;
}

export type RefillFulfillmentResult = {
  orderId: string;
  chargeId: string;
  orderStatus: Order["status"];
  dispatched: boolean;
  warnings: string[];
};

/**
 * Run the integration chain for a refill order that has already been charged.
 */
export async function fulfillChargedRefillOrder(params: {
  order: Order;
  patient: Patient;
  product: Product;
  amount: number;
  chargeResult: { chargeId: string; status: string; cardLast4: string; cardBrand: string };
  subscription: Subscription;
}): Promise<RefillFulfillmentResult> {
  const { order, patient, product, amount, chargeResult, subscription } = params;
  const orderId = order.id;
  const now = new Date().toISOString();
  const warnings: string[] = [];
  const bypassQuickBooksPayment = shouldBypassQuickBooksPayment();

  // Record the successful payment.
  const existingPayment = await dbServer.paymentDb.getByOrder(orderId).catch(() => null);
  const paymentBase = {
    status: "completed" as const,
    amount,
    cardLast4: chargeResult.cardLast4,
    cardBrand: chargeResult.cardBrand,
    transactionId: chargeResult.chargeId,
    processedAt: now,
  };
  let paymentRecord: Payment;
  if (existingPayment) {
    await dbServer.paymentDb.update(existingPayment.id, paymentBase);
    paymentRecord = { ...existingPayment, ...paymentBase };
  } else {
    paymentRecord = {
      id: generateId(),
      orderId,
      patientId: patient.id,
      amount,
      currency: "USD",
      status: "completed",
      paymentMethod: "credit_card",
      cardLast4: chargeResult.cardLast4,
      cardBrand: chargeResult.cardBrand,
      transactionId: chargeResult.chargeId,
      createdAt: now,
      processedAt: now,
    };
    await dbServer.paymentDb.create(paymentRecord);
  }

  // Reuse identity from the subscription's source order or any verified order.
  const patientOrders = await dbServer.orderDb.getByPatient(patient.id).catch(() => []);
  const reusableIdentity = resolveReusableCheckoutIdentity({
    patientId: patient.id,
    currentOrderId: orderId,
    isReorder: true,
    reorderSourceOrderId: subscription.sourceOrderId ?? "",
    patientOrders,
  });
  const existingGate = getIdentityGate(order);
  const identityStatus = existingGate.canDispatch
    ? order.identityStatus!
    : reusableIdentity.reused
      ? reusableIdentity.identityStatus
      : (order.identityStatus ?? "missing");
  const dispatchGate = getIdentityGate({ identityStatus });

  const orderUpdates: Partial<Order> = {
    status: dispatchGate.canDispatch ? "approved" : "pending_review",
    paymentStatus: "completed",
    identityStatus,
    submittedAt: order.submittedAt ?? now,
  };
  await dbServer.orderDb.update(orderId, orderUpdates);
  let updatedOrder = { ...order, ...orderUpdates } as Order;

  await dbServer.integrationLogDb.create({
    id: generateId(),
    timestamp: now,
    integrationName: "quickbooks",
    action: "Subscription refill payment captured",
    orderId,
    patientId: patient.id,
    status: "success",
    details: { amount, transactionId: chargeResult.chargeId, source: "subscription", subscriptionId: subscription.id },
  }).catch(() => {});

  const patientName = [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim();
  sendAdminNotification("order_received", { orderId, patientId: patient.id, patientName }).catch(() => {});

  const productForIntegrations = normalizeProduct(product);

  // QuickBooks accounting (invoice + recorded payment).
  if (bypassQuickBooksPayment) {
    await dbServer.orderDb.update(orderId, { quickbooksStatus: "skipped" }).catch(() => {});
  } else {
    try {
      const qbCustomerId = await quickbooks.createCustomerRecord(patient);
      const invoiceId = await quickbooks.createInvoice(updatedOrder, paymentRecord, {
        patient,
        product: productForIntegrations,
        qbCustomerId,
      });
      await quickbooks.recordPayment(invoiceId, paymentRecord.amount, qbCustomerId);
      await dbServer.orderDb.update(orderId, { quickbooksStatus: "invoiced" }).catch(() => {});
    } catch (e) {
      warnings.push(`QuickBooks accounting: ${(e as Error).message}`);
      await dbServer.orderDb.update(orderId, { quickbooksStatus: "error" }).catch(() => {});
    }
  }

  // PracticeQ automation.
  const practiceQDecision = getPracticeQAutomationAfterPaymentDecision({
    identityCanDispatch: dispatchGate.canDispatch,
    checkoutIdentityReused: reusableIdentity.reused,
  });
  if (practiceQDecision === "skip_reorder") {
    updatedOrder = { ...updatedOrder, practiceQStatus: "skipped" };
    await dbServer.orderDb.update(orderId, { practiceQStatus: "skipped" }).catch(() => {});
  } else if (practiceQDecision === "defer_identity") {
    updatedOrder = { ...updatedOrder, practiceQStatus: "pending" };
    await dbServer.orderDb.update(orderId, { practiceQStatus: "pending" }).catch(() => {});
  } else {
    try {
      await queuePracticeQAutomationForOrder({ order: updatedOrder, patient, source: "payment_charge" });
      await wakePracticeQRemoteWorker().catch(() => {});
    } catch (e) {
      warnings.push(`PracticeQ automation: ${(e as Error).message}`);
      await dbServer.orderDb.update(orderId, { practiceQStatus: "error" }).catch(() => {});
    }
  }

  // Pharmacy dispatch when identity passes and payment was real.
  let dispatched = false;
  const pharmacyProvider = pharmacy.getPharmacyProvider();
  const canDispatchPharmacy = canDispatchPharmacyAfterPayment({
    identityCanDispatch: dispatchGate.canDispatch,
    paymentBypassed: bypassQuickBooksPayment,
    realPharmacyEnabled: isRealPharmacyEnabled(pharmacyProvider),
  });
  if (canDispatchPharmacy) {
    try {
      const dose = product.doses?.find((d) => d.id === order.doseId);
      const normalized = normalizeOrderForPharmacyDispatch(
        updatedOrder,
        productForIntegrations,
        [order.doseId, dose?.label, dose?.strength].filter((v): v is string => !!v)
      );
      if (!normalized.normalizedOrder) {
        throw new Error(`Invalid order data - ${normalized.reason ?? "missing product or dose"}`);
      }
      const pharmacyOrder = await pharmacy.createPharmacyOrder(normalized.normalizedOrder, {
        patient,
        product: productForIntegrations,
      });
      await dbServer.pharmacyOrderDb.create(pharmacyOrder).catch(() => {});
      await dbServer.orderDb.update(orderId, { status: "sent_to_pharmacy", pharmacyStatus: "submitted" }).catch(() => {});
      updatedOrder = { ...updatedOrder, status: "sent_to_pharmacy", pharmacyStatus: "submitted" };
      dispatched = true;
      logPhiDisclosure(patient.id, orderId, pharmacyProvider, "system-subscription");
    } catch (e) {
      warnings.push(`Pharmacy: ${(e as Error).message}`);
      await dbServer.orderDb.update(orderId, { status: "approved", pharmacyStatus: "error" }).catch(() => {});
    }
  }

  // Non-blocking provider acknowledgment record (does NOT gate dispatch).
  const existingReview = await dbServer.providerReviewDb.getByOrder(orderId).catch(() => null);
  if (!existingReview) {
    await dbServer.providerReviewDb.create({
      id: generateId(),
      orderId,
      patientId: patient.id,
      status: "approved",
      reviewedBy: "system-subscription",
      notes: "Auto-refill (subscription). Provider acknowledgment only — dispatch is not gated on review.",
      identityReviewRequired: false,
    }).catch(() => {});
  }

  return {
    orderId,
    chargeId: chargeResult.chargeId,
    orderStatus: updatedOrder.status,
    dispatched,
    warnings,
  };
}
