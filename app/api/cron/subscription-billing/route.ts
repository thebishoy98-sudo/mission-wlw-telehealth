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
import { formatCurrency, generateId } from "@/lib/utils";
import type { Order } from "@/types";

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

      // ── One-off admin-scheduled charge-only adjustment (over-shipment) ────────
      // Explicitly authorized by an admin: charge the card on file, do NOT ship.
      if (suppressDispatch && hasCardOnFile && autocharge) {
        const order = await createRefillOrder(sub, patient, lastOrder);
        try {
          const chargeResult = await qbPayments.chargeStoredCard(order.id, patient.id, amount, {
            customerId: sub.qbCustomerId ?? "",
            cardId: patient.qbCardId!,
            cardLast4: patient.cardLast4,
            cardBrand: patient.cardBrand,
          });
          await fulfillChargedRefillOrder({
            order, patient, product, amount, chargeResult, subscription: sub, suppressDispatch: true,
          });
          const cycle = advanceCycle(sub.coversThrough, now, sub.intervalDays, sub.leadDays);
          await dbServer.subscriptionDb.update(sub.id, { ...cycle, lastOrderId: order.id, lastChargedAt: now });
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
          await dbServer.orderDb.update(order.id, { paymentStatus: "failed" }).catch(() => {});
          await logSubscriptionEvent(
            "Subscription charge-only failed", sub.id, order.id, patient.id, { amount }, "error", (chargeErr as Error).message
          );
          results.push({ subscriptionId: sub.id, action: "charge_only_failed", orderId: order.id });
        }
        continue;
      }

      // ── Normal refill → HOLD for dose review (no charge, no ship) ─────────────
      // At the 7-week mark we create (or reuse) a held refill and alert staff to
      // review the dose and send it. Nothing is charged/shipped until an admin
      // approves it from the Subscriptions tab.
      let reviewOrder: Order | null = null;
      if (sub.lastOrderId) {
        const existing = await dbServer.orderDb.getById(sub.lastOrderId).catch(() => null);
        if (existing && existing.isRefill && existing.paymentStatus !== "completed") {
          reviewOrder = existing;
        }
      }
      const isNewReview = !reviewOrder;
      if (!reviewOrder) reviewOrder = await createRefillOrder(sub, patient, lastOrder);

      await sendAdminNotification("subscription_review_needed", {
        orderId: reviewOrder.id,
        patientId: patient.id,
        patientName,
        reason: `${product.name}${dose ? ` ${dose.strength ?? dose.label}` : ""}${hasCardOnFile ? " — card on file" : " — no card (pay-link)"}.`,
      }).catch(() => {});
      // Nudge again in a few days until an admin reviews & sends it.
      await dbServer.subscriptionDb.update(sub.id, {
        nextRunAt: new Date(Date.parse(now) + DUNNING_RETRY_DAYS * DAY_MS).toISOString(),
        lastOrderId: reviewOrder.id,
      });
      await logSubscriptionEvent(
        isNewReview ? "Refill created, held for dose review" : "Refill review re-nudged",
        sub.id, reviewOrder.id, patient.id, { hasCardOnFile }
      );
      results.push({ subscriptionId: sub.id, action: isNewReview ? "review_created" : "review_nudged", orderId: reviewOrder.id });
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
