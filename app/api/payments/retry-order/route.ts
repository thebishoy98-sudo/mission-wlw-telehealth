/**
 * Payment retry for an existing order via a signed payment link.
 *
 * GET  ?token=...  -> order summary for the pay-only page (no PHI beyond
 *                     first name / product / amount).
 * POST {token,...} -> charge QuickBooks once against the SAME order.
 *
 * The order only becomes paid after a successful QuickBooks capture.
 * Failed attempts leave the order unpaid (failed payment rows and orders
 * without completed payments are already excluded from dashboard metrics).
 * Consent, questionnaire answers, and identity evidence from the original
 * checkout are reused - the patient only re-enters card details.
 */

import { NextRequest, NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { sql } from "@/lib/db.server";
import * as qbPayments from "@/services/quickbooks-payments";
import * as quickbooks from "@/services/quickbooks";
import * as pharmacy from "@/services/pharmacy";
import * as spruceServer from "@/services/spruce.server";
import { sendOrderSentToPharmacyMessage } from "@/services/order-notifications";
import { sendAdminNotification } from "@/services/admin-notifications";
import {
  queuePracticeQAutomationForOrder,
  wakePracticeQRemoteWorker,
} from "@/services/practiceq-automation-orchestration";
import { assessPaymentRetryEligibility, verifyPaymentLinkToken } from "@/lib/payment-link";
import { storeCardAndChargeStored, recordEnrollment } from "@/lib/subscription-enroll";
import { getChargeAmount } from "@/lib/payment-amount";
import { shouldBypassQuickBooksPayment } from "@/lib/payment-bypass";
import {
  canDispatchPharmacyAfterPayment,
  getPracticeQAutomationAfterPaymentDecision,
  isRealPharmacyEnabled,
} from "@/lib/payment-dispatch-safety";
import { resolveReusableCheckoutIdentity } from "@/lib/checkout-identity-reuse";
import { buildIdentityUploadUrl, createIdentityUploadToken, getIdentityGate } from "@/lib/identity";
import { normalizeOrderForPharmacyDispatch } from "@/lib/pharmacy-dispatch";
import { normalizeProduct } from "@/data/products";
import { getPublicBaseUrl } from "@/lib/public-url";
import { logPhiAccess, logPhiDisclosure, actorFromHeaders } from "@/lib/phi-audit";
import { generateId } from "@/lib/utils";
import type { Order, Payment } from "@/types";

const hasCanonicalDb = () => !!(process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL);

const TOKEN_ERRORS: Record<string, { error: string; status: number }> = {
  malformed: { error: "Invalid payment link.", status: 400 },
  bad_signature: { error: "Invalid payment link.", status: 403 },
  expired: { error: "This payment link has expired. Please contact support for a new one.", status: 410 },
};

async function loadRetryContext(token: string) {
  const verification = verifyPaymentLinkToken(token);
  if (!verification.valid) {
    const mapped = TOKEN_ERRORS[verification.reason] ?? TOKEN_ERRORS.malformed;
    return { failure: NextResponse.json({ error: mapped.error, reason: verification.reason }, { status: mapped.status }) } as const;
  }

  const order = await dbServer.orderDb.getById(verification.orderId).catch(() => null);
  if (!order) {
    return { failure: NextResponse.json({ error: "Order not found" }, { status: 404 }) } as const;
  }

  const [patient, product, payment] = await Promise.all([
    dbServer.patientDb.getById(order.patientId).catch(() => null),
    dbServer.productDb.getById(order.productId).catch(() => null),
    dbServer.paymentDb.getByOrder(order.id).catch(() => null),
  ]);

  const dose = product?.doses?.find((candidate) => candidate.id === order.doseId) ?? null;
  const amount = getChargeAmount(dose?.price ?? product?.startingPrice);
  return { order, patient, product, dose, payment, amount } as const;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const context = await loadRetryContext(token);
  if ("failure" in context) return context.failure;

  const { order, patient, product, dose, payment, amount } = context;
  const eligibility = assessPaymentRetryEligibility({ order, payment });

  return NextResponse.json({
    orderId: order.id,
    orderNumber: order.id.slice(-8),
    patientFirstName: patient?.firstName ?? "",
    cardholderName: [patient?.firstName, patient?.lastName].filter(Boolean).join(" "),
    productName: product?.name ?? "Treatment",
    doseLabel: dose ? [dose.label, dose.strength].filter(Boolean).join(" - ") : "",
    amount,
    eligible: eligibility.eligible,
    reason: eligibility.eligible ? undefined : eligibility.reason,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const context = await loadRetryContext(String(body.token ?? ""));
    if ("failure" in context) return context.failure;

    const { order, patient, product, dose, payment, amount } = context;
    const orderId = order.id;

    const eligibility = assessPaymentRetryEligibility({ order, payment });
    if (!eligibility.eligible) {
      const message = eligibility.reason === "already_paid"
        ? "This order has already been paid."
        : "A payment for this order is already in progress.";
      return NextResponse.json({ error: message, reason: eligibility.reason }, { status: 409 });
    }

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    if (!product || amount === null) {
      return NextResponse.json({ error: "Order amount could not be determined." }, { status: 422 });
    }

    // Atomic duplicate-charge lock: first concurrent retry wins, second gets 409.
    const previousStatus: Order["status"] = order.status;
    if (hasCanonicalDb()) {
      const lock = await sql`
        UPDATE orders SET status = 'processing'
        WHERE id = ${orderId} AND payment_status <> 'completed' AND status <> 'processing'
      `.catch(() => ({ rowCount: 0 }));
      if ((lock.rowCount ?? 0) === 0) {
        return NextResponse.json(
          { error: "A payment for this order is already in progress.", reason: "payment_in_progress" },
          { status: 409 }
        );
      }
    }

    const revertToUnpaid = async () => {
      await sql`
        UPDATE orders SET status = ${previousStatus}, payment_status = 'failed', updated_at = NOW()
        WHERE id = ${orderId} AND payment_status <> 'completed'
      `.catch(() => {});
    };

    const auditCtx = actorFromHeaders(req.headers);
    logPhiAccess({
      action: "payment", resource: "patient", resourceId: patient.id,
      patientId: patient.id, orderId,
      actor: auditCtx.actor, actorIp: auditCtx.actorIp, requestId: auditCtx.requestId,
      outcome: "success",
    });

    // Charge QuickBooks once (or simulate in bypass/test mode).
    const bypassQuickBooksPayment = shouldBypassQuickBooksPayment();
    // Opt-in recurring enrollment: save the card on file + auto-bill every cycle.
    const wantsEnroll =
      body.enrollSubscription === true &&
      body.recurringConsent === true &&
      !bypassQuickBooksPayment &&
      !!body.cardToken &&
      !!process.env.QB_CLIENT_ID;
    let chargeResult: { chargeId: string; status: string; cardLast4: string; cardBrand: string };
    let enrollmentCardInfo: { qbCustomerId: string; qbCardId: string; cardLast4: string; cardBrand: string } | null = null;
    if (bypassQuickBooksPayment) {
      chargeResult = {
        chargeId: `test_bypass_${generateId()}`,
        status: "CAPTURED",
        cardLast4: String(body.cardLast4 ?? "0000"),
        cardBrand: String(body.cardBrand ?? "test"),
      };
    } else if (wantsEnroll) {
      // Store-then-charge: keep a reusable card-on-file from one tokenization.
      try {
        const stored = await storeCardAndChargeStored({
          order,
          patient,
          amount,
          cardToken: String(body.cardToken),
          cardLast4: body.cardLast4,
          cardBrand: body.cardBrand,
        });
        chargeResult = stored.chargeResult;
        enrollmentCardInfo = {
          qbCustomerId: stored.qbCustomerId,
          qbCardId: stored.qbCardId,
          cardLast4: stored.cardLast4,
          cardBrand: stored.cardBrand,
        };
      } catch (err: any) {
        await revertToUnpaid();
        await dbServer.integrationLogDb.create({
          id: generateId(),
          timestamp: new Date().toISOString(),
          integrationName: "quickbooks",
          action: "Subscription enroll charge failed",
          orderId,
          patientId: patient.id,
          status: "error",
          details: { amount, source: "payment_link_enroll" },
          error: err.message ?? "Payment failed",
        }).catch(() => {});
        return NextResponse.json({ error: err.message ?? "Payment failed" }, { status: 402 });
      }
    } else {
      try {
        chargeResult = await qbPayments.chargeCard(orderId, patient.id, amount, {
          token: body.cardToken || undefined,
          cardNumber: body.cardNumber,
          expMonth: body.expMonth,
          expYear: body.expYear,
          cvc: body.cvc,
          cardName: body.cardName ?? `${patient.firstName} ${patient.lastName}`,
          cardLast4: body.cardLast4,
          cardBrand: body.cardBrand,
          billingAddress: patient.address,
        });
      } catch (err: any) {
        await revertToUnpaid();
        await dbServer.integrationLogDb.create({
          id: generateId(),
          timestamp: new Date().toISOString(),
          integrationName: "quickbooks",
          action: "Payment link retry charge failed",
          orderId,
          patientId: patient.id,
          status: "error",
          details: { amount, source: "payment_link" },
          error: err.message ?? "Payment failed",
        }).catch(() => {});
        return NextResponse.json({ error: err.message ?? "Payment failed" }, { status: 402 });
      }
    }

    // Record the successful payment on the SAME order: upgrade the existing
    // payment row when present (keeps one row per order), otherwise create one.
    const now = new Date().toISOString();
    const paymentUpdate = {
      status: "completed" as const,
      amount,
      cardLast4: chargeResult.cardLast4,
      cardBrand: chargeResult.cardBrand,
      transactionId: chargeResult.chargeId,
      processedAt: now,
    };
    let paymentRecord: Payment;
    if (payment) {
      await dbServer.paymentDb.update(payment.id, paymentUpdate);
      paymentRecord = { ...payment, ...paymentUpdate };
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

    // Reuse identity from this order or the patient's other verified orders.
    const patientOrders = await dbServer.orderDb.getByPatient(patient.id).catch(() => []);
    const reusableIdentity = resolveReusableCheckoutIdentity({
      patientId: patient.id,
      currentOrderId: orderId,
      isReorder: false,
      patientOrders,
    });
    const existingGate = getIdentityGate(order);
    const identityStatus = existingGate.canDispatch
      ? order.identityStatus!
      : reusableIdentity.reused
        ? reusableIdentity.identityStatus
        : (order.identityStatus ?? "missing");
    const dispatchGate = getIdentityGate({ identityStatus });
    const identityUploadToken = dispatchGate.canDispatch
      ? order.identityUploadToken
      : (order.identityUploadToken ?? createIdentityUploadToken(orderId));
    const identityUploadUrl = !dispatchGate.canDispatch && identityUploadToken
      ? buildIdentityUploadUrl(getPublicBaseUrl(req), identityUploadToken)
      : "";

    const orderUpdates: Partial<Order> = {
      status: dispatchGate.canDispatch ? "approved" : "pending_review",
      paymentStatus: "completed",
      identityStatus,
      identityReason: reusableIdentity.reused && !existingGate.canDispatch
        ? reusableIdentity.summary
        : order.identityReason,
      identityUploadToken,
      submittedAt: order.submittedAt ?? now,
    };
    await dbServer.orderDb.update(orderId, orderUpdates);
    let updatedOrder = { ...order, ...orderUpdates } as Order;
    const errors: string[] = [];

    await dbServer.integrationLogDb.create({
      id: generateId(),
      timestamp: now,
      integrationName: "quickbooks",
      action: "Payment collected via payment link",
      orderId,
      patientId: patient.id,
      status: "success",
      details: { amount, transactionId: chargeResult.chargeId, source: "payment_link" },
    }).catch(() => {});

    const patientName = [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim();
    sendAdminNotification("order_received", { orderId, patientId: patient.id, patientName }).catch(() => {});

    const productForIntegrations = normalizeProduct(product);

    // QuickBooks accounting sync (invoice + recorded payment).
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
        errors.push(`QuickBooks accounting: ${(e as Error).message}`);
        await dbServer.orderDb.update(orderId, { quickbooksStatus: "error" }).catch(() => {});
      }
    }

    // PracticeQ automation: queue, defer for identity, or skip for reused identity.
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
        errors.push(`PracticeQ automation: ${(e as Error).message}`);
        await dbServer.orderDb.update(orderId, { practiceQStatus: "error" }).catch(() => {});
      }
    }

    // Pharmacy dispatch only when identity passes and payment was real.
    const pharmacyProvider = pharmacy.getPharmacyProvider();
    const canDispatchPharmacy = canDispatchPharmacyAfterPayment({
      identityCanDispatch: dispatchGate.canDispatch,
      paymentBypassed: bypassQuickBooksPayment,
      realPharmacyEnabled: isRealPharmacyEnabled(pharmacyProvider),
    });
    if (canDispatchPharmacy) {
      try {
        const normalized = normalizeOrderForPharmacyDispatch(
          updatedOrder,
          productForIntegrations,
          [order.doseId, dose?.label, dose?.strength].filter((value): value is string => !!value)
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
        await sendOrderSentToPharmacyMessage(patient, orderId).catch(() => {});
        logPhiDisclosure(patient.id, orderId, pharmacyProvider, auditCtx.actor);
      } catch (e) {
        errors.push(`Pharmacy: ${(e as Error).message}`);
        await dbServer.orderDb.update(orderId, { status: "approved", pharmacyStatus: "error" }).catch(() => {});
      }
    }

    // Patient SMS: payment received, or identity upload reminder when blocked.
    try {
      await spruceServer.sendMessage(
        patient,
        dispatchGate.canDispatch ? "payment_received" : "identity_upload_reminder",
        { orderId, uploadUrl: identityUploadUrl }
      );
      logPhiDisclosure(patient.id, orderId, "spruce", auditCtx.actor);
    } catch (e) {
      errors.push(`Spruce SMS: ${(e as Error).message}`);
    }

    // Provider review record (only if the original checkout never created one).
    const existingReview = await dbServer.providerReviewDb.getByOrder(orderId).catch(() => null);
    if (!existingReview) {
      await dbServer.providerReviewDb.create({
        id: generateId(),
        orderId,
        patientId: patient.id,
        status: dispatchGate.canDispatch ? "approved" : "needs_more_info",
        reviewedAt: dispatchGate.canDispatch ? now : undefined,
        reviewedBy: dispatchGate.canDispatch ? "system-auto" : undefined,
        notes: dispatchGate.canDispatch
          ? "Auto-approved: payment link retry with verified identity"
          : `Payment collected via payment link. Pharmacy dispatch blocked until identity is approved. Upload link: ${identityUploadUrl}`,
        identityReviewRequired: !dispatchGate.canDispatch,
      }).catch(() => {});
    }

    // Enroll (or advance) the subscription now that the card is saved on file.
    let subscriptionId: string | undefined;
    if (enrollmentCardInfo) {
      try {
        const subscription = await recordEnrollment({
          order: updatedOrder,
          patient,
          product: productForIntegrations,
          qbCustomerId: enrollmentCardInfo.qbCustomerId,
          qbCardId: enrollmentCardInfo.qbCardId,
          cardLast4: enrollmentCardInfo.cardLast4,
          cardBrand: enrollmentCardInfo.cardBrand,
          nowIso: now,
        });
        subscriptionId = subscription.id;
      } catch (e) {
        errors.push(`Subscription enroll: ${(e as Error).message}`);
      }
    }

    return NextResponse.json({
      success: true,
      orderId,
      chargeId: chargeResult.chargeId,
      chargedAmount: amount,
      subscriptionId,
      enrolled: !!subscriptionId,
      identityStatus,
      orderStatus: canDispatchPharmacy && !errors.some((error) => error.startsWith("Pharmacy:"))
        ? "sent_to_pharmacy"
        : orderUpdates.status,
      identityUploadUrl: dispatchGate.canDispatch ? undefined : identityUploadUrl,
      warnings: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error("Payment link retry error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
