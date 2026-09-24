/**
 * Cron: Subscription Billing (recurring 8-week auto-refill)
 *
 * Runs daily. For each active subscription whose billing window is due
 * (next_run_at <= now, i.e. ~7 days before the supply runs out):
 *   - Card on file + consent + autocharge enabled → charge the stored card,
 *     create + dispatch the refill order, advance the cycle, text the patient.
 *   - Otherwise → create (or reuse) an unpaid refill order and text a
 *     "pay + save your card" link; the pay page enrolls/advances on payment.
 *   - If a stored-card charge fails → fall back to the pay link (dunning).
 *
 * Auto-charge can be disabled with SUBSCRIPTION_AUTOCHARGE_ENABLED=false.
 * Protected via CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import * as spruceServer from "@/services/spruce.server";
import { sendAdminNotification } from "@/services/admin-notifications";
import * as qbPayments from "@/services/quickbooks-payments";
import { createRefillOrder, fulfillChargedRefillOrder } from "@/lib/order-fulfillment";
import { advanceCycle, isAutochargeEnabled } from "@/lib/subscription";
import { getChargeAmount } from "@/lib/payment-amount";
import { createPaymentLinkToken, buildPaymentLinkUrl } from "@/lib/payment-link";
import { getPublicBaseUrl } from "@/lib/public-url";
import { formatCurrency, generateId } from "@/lib/utils";
import type { Order } from "@/types";
import { calculateReferralPricing } from "@/lib/referral-pricing";
import { getReferralBalance, recordReferralCreditSpend } from "@/lib/referral-credit.server";

import { reserveSubscriptionAttempt } from "@/lib/subscription-billing-attempt";

const DAY_MS = 24 * 60 * 60 * 1000;
const DUNNING_RETRY_DAYS = 3;

function logSubscriptionEvent(
  action: string,
  subscriptionId: string,
  orderId: string | undefined,
  patientId: string,
  details: Record<string, unknown>,
  status: "success" | "error" = "success",
  error?: string
) {
  return dbServer.integrationLogDb
    .create({
      id: generateId(),
      timestamp: new Date().toISOString(),
      integrationName: "quickbooks",
      action,
      orderId,
      patientId,
      status,
      details: { source: "subscription", subscriptionId, ...details },
      error,
    })
    .catch(() => {});
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ skipped: "No POSTGRES_URL configured", results: [] });
  }

  const now = new Date().toISOString();
  const autocharge = isAutochargeEnabled();
  const due = await dbServer.subscriptionDb.listDue(now, 100);
  const results: Record<string, unknown>[] = [];

  for (const sub of due) {
    try {
      const [patient, product] = await Promise.all([
        dbServer.patientDb.getById(sub.patientId),
        dbServer.productDb.getById(sub.productId),
      ]);
      if (!patient || !product) {
        await logSubscriptionEvent("Subscription skipped (missing patient/product)", sub.id, undefined, sub.patientId, {}, "error");
        results.push({ subscriptionId: sub.id, action: "skipped_missing_refs" });
        continue;
      }

      if (product.slug === "retatrutide" || sub.productId === "product_retatrutide") {
        await dbServer.subscriptionDb.update(sub.id, { status: "paused" });
        results.push({ subscriptionId: sub.id, action: "paused_pending_treatment_change" });
        continue;
      }

      const dose = product.doses?.find((d) => d.id === sub.doseId);
      // A one-off adjustment (e.g. accidental over-shipment) can override the
      // charge amount and suppress dispatch for this run only.
      const suppressDispatch = !!sub.skipNextDispatch;
      const amount = getChargeAmount(sub.nextChargeOverride ?? dose?.price ?? product.startingPrice);
      if (amount === null) {
        await logSubscriptionEvent("Subscription skipped (no price)", sub.id, undefined, patient.id, { doseId: sub.doseId }, "error");
        results.push({ subscriptionId: sub.id, action: "skipped_no_price" });
        continue;
      }

      const patientOrders = await dbServer.orderDb.getByPatient(patient.id).catch(() => []);
      const lastOrder = patientOrders[0] ?? null;
      const hasCardOnFile = Boolean(patient.qbCardId && patient.recurringConsentAt);

      const patientName = [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim();
      let attemptCount = 0;
      if (hasCardOnFile && autocharge) {
        const reservation = await reserveSubscriptionAttempt(sub.id);
        if (!reservation.allowed) {
          if (reservation.exhausted) await dbServer.subscriptionDb.update(sub.id, { status: "paused" });
          results.push({ subscriptionId: sub.id, action: reservation.exhausted ? "paused_attempt_limit" : "skipped_already_claimed" });
          continue;
        }
        attemptCount = reservation.attempt;
      }


      // ── One-off admin-scheduled charge-only adjustment (over-shipment) ────────
      // Explicitly authorized by an admin: charge the card on file, do NOT ship.
      if (suppressDispatch && hasCardOnFile && autocharge) {
        const order = await createRefillOrder(sub, patient, lastOrder);
        let captured = false;
        try {
          if ((await dbServer.subscriptionDb.getById(sub.id))?.status !== "active") continue;
          const chargeResult = await qbPayments.chargeStoredCard(order.id, patient.id, amount, {
            customerId: sub.qbCustomerId ?? "",
            cardId: patient.qbCardId!,
            cardLast4: patient.cardLast4,
            cardBrand: patient.cardBrand,
          });
          captured = true;
          await fulfillChargedRefillOrder({
            order, patient, product, amount, chargeResult, subscription: sub, suppressDispatch: true,
          });
          const cycle = advanceCycle(sub.coversThrough, now, sub.intervalDays, sub.leadDays);
          await dbServer.subscriptionDb.update(sub.id, { ...cycle, lastOrderId: order.id, lastChargedAt: new Date().toISOString() });
          await dbServer.subscriptionDb.clearNextChargeAdjustment(sub.id);
          await spruceServer
            .sendMessage(patient, "subscription_charged_no_ship", {
              orderId: order.id,
              patientName: patient.firstName,
              amount: formatCurrency(amount),
              cardLast4: patient.cardLast4 ?? "",
              note: sub.nextChargeNote ?? "",
            })
            .catch(() => {});
          await sendAdminNotification("subscription_charge_alert", {
            orderId: order.id,
            patientId: patient.id,
            patientName,
            reason: `Charged ${formatCurrency(amount)} to card on file, no new shipment (over-shipment correction).${sub.nextChargeNote ? ` Note: ${sub.nextChargeNote}` : ""}`,
          }).catch(() => {});
          results.push({ subscriptionId: sub.id, action: "auto_charged_no_dispatch", orderId: order.id });
        } catch (chargeErr) {
          if (captured) {
            await dbServer.subscriptionDb.update(sub.id, { status: "paused", lastChargedAt: new Date().toISOString() });
            await logSubscriptionEvent("Captured payment needs reconciliation", sub.id, undefined, patient.id, {}, "error", (chargeErr as Error).message);
            results.push({ subscriptionId: sub.id, action: "paused_after_capture_error" });
            continue;
          }
          await dbServer.orderDb.update(order.id, { paymentStatus: "failed" }).catch(() => {});
          await logSubscriptionEvent(
            "Subscription charge-only failed", sub.id, order.id, patient.id, { amount, billingAttemptReserved: true, attemptCount }, "error", (chargeErr as Error).message
          );
          if (attemptCount >= 3) await dbServer.subscriptionDb.update(sub.id, { status: "paused" });
          results.push({ subscriptionId: sub.id, action: "charge_only_failed", orderId: order.id });
        }
        continue;
      }

      // ── Normal refill → charge and fulfill automatically at week seven ───────
      // Reuse a failed/unpaid refill on retry so both our order id and Intuit's
      // Request-Id stay stable and cannot create a duplicate charge.
      let reviewOrder: Order | null = null;
      if (sub.lastOrderId) {
        const existing = await dbServer.orderDb.getById(sub.lastOrderId).catch(() => null);
        if (existing && existing.isRefill && existing.paymentStatus !== "completed") {
          reviewOrder = existing;
        }
      }
      const isNewReview = !reviewOrder;
      if (!reviewOrder) reviewOrder = await createRefillOrder(sub, patient, lastOrder);
      const availableReferralCredit = await getReferralBalance(patient.id);
      const referralPricing = calculateReferralPricing({
        baseAmount: amount,
        availableCredit: availableReferralCredit,
      });
      const billingAmount = referralPricing.chargeAmount;

      if (hasCardOnFile && autocharge) {
        let captured = false;
        try {
          if ((await dbServer.subscriptionDb.getById(sub.id))?.status !== "active") continue;
          const chargeResult = await qbPayments.chargeStoredCard(reviewOrder.id, patient.id, billingAmount, {
            customerId: sub.qbCustomerId ?? "",
            cardId: patient.qbCardId!,
            cardLast4: patient.cardLast4,
            cardBrand: patient.cardBrand,
            requestId: reviewOrder.id,
          });
          captured = true;
          if (referralPricing.creditApplied > 0) {
            const spent = await recordReferralCreditSpend({
              patientId: patient.id,
              orderId: reviewOrder.id,
              amount: referralPricing.creditApplied,
            });
            if (!spent) throw new Error("Referral credit could not be recorded after payment capture.");
          }
          const fulfillment = await fulfillChargedRefillOrder({
            order: reviewOrder,
            patient,
            product,
            amount: billingAmount,
            chargeResult,
            subscription: sub,
          });
          const cycle = advanceCycle(sub.coversThrough, now, sub.intervalDays, sub.leadDays);
          await dbServer.subscriptionDb.update(sub.id, {
            ...cycle,
            lastOrderId: reviewOrder.id,
            lastChargedAt: new Date().toISOString(),
          });
          await spruceServer.sendMessage(patient, "subscription_charged", {
            orderId: reviewOrder.id,
            patientName: patient.firstName,
            amount: formatCurrency(billingAmount),
            cardLast4: patient.cardLast4 ?? "",
          }).catch(() => {});
          await logSubscriptionEvent(
            "Subscription auto-charge captured and refill fulfilled",
            sub.id,
            reviewOrder.id,
            patient.id,
            {
              amount: billingAmount,
              referralCreditApplied: referralPricing.creditApplied,
              dispatched: fulfillment.dispatched,
            }
          );
          results.push({
            subscriptionId: sub.id,
            action: "auto_charged",
            orderId: reviewOrder.id,
            dispatched: fulfillment.dispatched,
          });
        } catch (chargeErr) {
          if (captured) {
            await dbServer.subscriptionDb.update(sub.id, { status: "paused", lastChargedAt: new Date().toISOString() });
            await logSubscriptionEvent("Captured payment needs reconciliation", sub.id, undefined, patient.id, {}, "error", (chargeErr as Error).message);
            results.push({ subscriptionId: sub.id, action: "paused_after_capture_error" });
            continue;
          }
          const errorMessage = (chargeErr as Error).message;
          await dbServer.orderDb.update(reviewOrder.id, { paymentStatus: "failed" }).catch(() => {});
          const attemptsExhausted = attemptCount >= 3;
          const { token } = createPaymentLinkToken(reviewOrder.id);
          const payUrl = buildPaymentLinkUrl(getPublicBaseUrl(req), token);
          await spruceServer.sendMessage(patient, "subscription_payment_failed", {
            orderId: reviewOrder.id,
            patientName: patient.firstName,
            payUrl,
          }).catch(() => {});
          await sendAdminNotification("subscription_charge_alert", {
            orderId: reviewOrder.id,
            patientId: patient.id,
            patientName,
            reason: `Automatic week-seven charge failed: ${errorMessage}`,
          }).catch(() => {});
          await dbServer.subscriptionDb.update(sub.id, {
            // A declined card gets at most three automatic attempts. The
            // patient can still pay the link sent above or contact support.
            status: attemptsExhausted ? "paused" : "active",
            nextRunAt: new Date(Date.parse(now) + DUNNING_RETRY_DAYS * DAY_MS).toISOString(),
            lastOrderId: reviewOrder.id,
          });
          await logSubscriptionEvent(
            "Subscription auto-charge failed; pay-link sent",
            sub.id,
            reviewOrder.id,
            patient.id,
            { amount: billingAmount, referralCreditAvailable: availableReferralCredit, attemptCount, attemptsExhausted, billingAttemptReserved: true },
            "error",
            errorMessage
          );
          results.push({
            subscriptionId: sub.id,
            action: "charge_failed",
            orderId: reviewOrder.id,
          });
        }
        continue;
      }

      const { token } = createPaymentLinkToken(reviewOrder.id);
      const payUrl = buildPaymentLinkUrl(getPublicBaseUrl(req), token);
      await spruceServer.sendMessage(patient, "subscription_pay_link", {
        orderId: reviewOrder.id,
        patientName: patient.firstName,
        amount: formatCurrency(billingAmount),
        payUrl,
      }).catch(() => {});
      await sendAdminNotification("subscription_charge_alert", {
        orderId: reviewOrder.id,
        patientId: patient.id,
        patientName,
        reason: hasCardOnFile
          ? "Automatic subscription charging is disabled; a payment link was sent."
          : "No saved card is available; a payment link was sent.",
      }).catch(() => {});
      await dbServer.subscriptionDb.update(sub.id, {
        nextRunAt: new Date(Date.parse(now) + DUNNING_RETRY_DAYS * DAY_MS).toISOString(),
        lastOrderId: reviewOrder.id,
      });
      await logSubscriptionEvent(
        isNewReview ? "Subscription pay-link sent" : "Subscription pay-link re-sent",
        sub.id,
        reviewOrder.id,
        patient.id,
        { hasCardOnFile, autocharge, amount: billingAmount, referralCreditAvailable: availableReferralCredit }
      );
      results.push({
        subscriptionId: sub.id,
        action: isNewReview ? "pay_link_sent" : "pay_link_resent",
        orderId: reviewOrder.id,
      });
    } catch (err) {
      await logSubscriptionEvent(
        "Subscription billing error",
        sub.id,
        undefined,
        sub.patientId,
        {},
        "error",
        (err as Error).message
      );
      results.push({ subscriptionId: sub.id, action: "error", error: (err as Error).message });
    }
  }

  return NextResponse.json({ processed: results.length, autocharge, results, runAt: now });
}

export const POST = GET;
