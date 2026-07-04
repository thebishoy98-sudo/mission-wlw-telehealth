/**
 * Provider/admin view of active auto-refill subscriptions and their refill
 * orders. Read-only listing used by the Subscriptions tab so providers can
 * track refills and acknowledge them (acknowledgment is non-blocking — see
 * /api/provider/review action=acknowledge_refill).
 */

import { NextRequest, NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { requireProviderOrAdmin } from "@/lib/server-auth";
import { getStaffSessionFromRequest } from "@/lib/staff-session";
import * as spruceServer from "@/services/spruce.server";
import { createPaymentLinkToken, buildPaymentLinkUrl } from "@/lib/payment-link";
import { getPublicBaseUrl } from "@/lib/public-url";
import { advanceCycle, computeInitialCycle, DEFAULT_INTERVAL_DAYS, DEFAULT_LEAD_DAYS } from "@/lib/subscription";
import { createRefillOrder, fulfillChargedRefillOrder } from "@/lib/order-fulfillment";
import * as qbPayments from "@/services/quickbooks-payments";
import { getChargeAmount } from "@/lib/payment-amount";
import { calculateSupplementalCharge } from "@/lib/subscription-adjustment";
import { generateId, formatCurrency } from "@/lib/utils";
import type { Order, Subscription } from "@/types";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Admin/provider subscription management:
 *   { action: "cancel"|"pause"|"resume", subscriptionId }
 *   { action: "enroll", patientId }   — manually subscribe a patient. If they
 *       have a card on file we activate immediately; otherwise we text them a
 *       pay+save enrollment link (they enroll on payment).
 */
export async function POST(req: NextRequest) {
  const denied = requireProviderOrAdmin(req);
  if (denied) return denied;

  const session = getStaffSessionFromRequest(req);
  const actor = session?.name ?? session?.email ?? "staff";
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const now = new Date().toISOString();

  const logAction = (logAction: string, patientId: string, details: Record<string, unknown>) =>
    dbServer.integrationLogDb
      .create({
        id: generateId(), timestamp: now, integrationName: "system",
        action: logAction, patientId, status: "success", details: { actor, ...details },
      })
      .catch(() => {});

  try {
    if (["cancel", "pause", "resume", "reactivate", "skip"].includes(action)) {
      const sub = await dbServer.subscriptionDb.getById(String(body.subscriptionId ?? "")).catch(() => null);
      if (!sub) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

      const patient = await dbServer.patientDb.getById(sub.patientId).catch(() => null);
      const interval = sub.intervalDays || DEFAULT_INTERVAL_DAYS;
      const lead = sub.leadDays || DEFAULT_LEAD_DAYS;
      const fmtDate = (iso?: string | null) =>
        iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

      let update: Partial<Subscription> = {};
      if (action === "cancel") {
        update = { status: "cancelled", cancelledAt: now, cancelReason: `Cancelled by ${actor}` };
      } else if (action === "pause") {
        update = { status: "paused" };
      } else if (action === "resume") {
        update = { status: "active" };
      } else if (action === "reactivate") {
        // Restart a cancelled/paused sub on a fresh cycle from now.
        const cycle = computeInitialCycle(now, interval, lead);
        update = { status: "active", coversThrough: cycle.coversThrough, nextRunAt: cycle.nextRunAt };
      } else if (action === "skip") {
        // Skip this round: push the next charge (and coverage) out by one interval.
        const baseRun = sub.nextRunAt ? new Date(sub.nextRunAt).getTime() : Date.parse(now);
        const baseCovers = sub.coversThrough ? new Date(sub.coversThrough).getTime() : Date.parse(now);
        update = {
          nextRunAt: new Date(baseRun + interval * DAY_MS).toISOString(),
          coversThrough: new Date(baseCovers + interval * DAY_MS).toISOString(),
        };
      }

      const updated = await dbServer.subscriptionDb.update(sub.id, update);
      await logAction(`Subscription ${action} (admin)`, sub.patientId, { subscriptionId: sub.id });

      if (patient) {
        if (action === "cancel") {
          await spruceServer.sendMessage(patient, "subscription_cancelled", {}).catch(() => {});
        } else if (action === "reactivate") {
          await spruceServer.sendMessage(patient, "subscription_reactivated", { nextRunDate: fmtDate(updated?.nextRunAt) }).catch(() => {});
        } else if (action === "skip") {
          await spruceServer.sendMessage(patient, "subscription_skipped", { nextRunDate: fmtDate(updated?.nextRunAt) }).catch(() => {});
        }
      }

      return NextResponse.json({ success: true, subscription: updated });
    }

    if (action === "update_dose") {
      const sub = await dbServer.subscriptionDb.getById(String(body.subscriptionId ?? "")).catch(() => null);
      if (!sub) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
      const product = await dbServer.productDb.getById(sub.productId).catch(() => null);
      const requestedDoseId = String(body.doseId ?? "");
      const dose = product?.doses?.find((candidate) => candidate.id === requestedDoseId);
      if (!dose) return NextResponse.json({ error: "Selected dose is not valid for this product." }, { status: 400 });

      const updated = await dbServer.subscriptionDb.update(sub.id, { doseId: requestedDoseId });
      await logAction("Subscription dose updated before billing", sub.patientId, {
        subscriptionId: sub.id,
        previousDoseId: sub.doseId,
        doseId: requestedDoseId,
      });
      return NextResponse.json({ success: true, subscription: updated });
    }

    if (action === "charge_dose_adjustment") {
      const sub = await dbServer.subscriptionDb.getById(String(body.subscriptionId ?? "")).catch(() => null);
      if (!sub) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
      const [patient, product] = await Promise.all([
        dbServer.patientDb.getById(sub.patientId).catch(() => null),
        dbServer.productDb.getById(sub.productId).catch(() => null),
      ]);
      if (!patient || !product) return NextResponse.json({ error: "Patient or product not found" }, { status: 404 });
      if (!patient.qbCardId || !patient.recurringConsentAt) {
        return NextResponse.json({ error: "Patient does not have an authorized card on file." }, { status: 422 });
      }

      const requestedDoseId = String(body.doseId ?? "");
      const currentDose = product.doses?.find((dose) => dose.id === sub.doseId);
      const requestedDose = product.doses?.find((dose) => dose.id === requestedDoseId);
      if (!currentDose || !requestedDose) {
        return NextResponse.json({ error: "Current or selected dose is not valid for this product." }, { status: 400 });
      }
      const currentPrice = Number(currentDose.price ?? product.startingPrice);
      const requestedPrice = Number(requestedDose.price ?? product.startingPrice);
      const overrideProvided = body.overrideAmount !== undefined && String(body.overrideAmount).trim() !== "";
      const adjustment = calculateSupplementalCharge({
        previousCharge: currentPrice,
        newDosePrice: requestedPrice,
        overrideAmount: overrideProvided ? Number(body.overrideAmount) : undefined,
        overrideReason: typeof body.overrideReason === "string" ? body.overrideReason : undefined,
      });
      const amount = getChargeAmount(adjustment.amount);
      if (amount === null) return NextResponse.json({ error: "Could not determine the adjustment amount." }, { status: 422 });

      const previousOrder = sub.lastOrderId
        ? await dbServer.orderDb.getById(sub.lastOrderId).catch(() => null)
        : null;
      let order = await createRefillOrder({ ...sub, doseId: requestedDoseId }, patient, previousOrder);
      if (order.doseId !== requestedDoseId) {
        await dbServer.orderDb.update(order.id, { doseId: requestedDoseId }).catch(() => {});
        order = { ...order, doseId: requestedDoseId };
      }

      try {
        const chargeResult = await qbPayments.chargeStoredCard(order.id, patient.id, amount, {
          customerId: sub.qbCustomerId ?? "",
          cardId: patient.qbCardId,
          cardLast4: patient.cardLast4,
          cardBrand: patient.cardBrand,
          requestId: order.id,
        });
        const fulfillment = await fulfillChargedRefillOrder({
          order,
          patient,
          product,
          amount,
          chargeResult,
          subscription: { ...sub, doseId: requestedDoseId },
        });
        await dbServer.subscriptionDb.update(sub.id, {
          doseId: requestedDoseId,
          lastOrderId: order.id,
          lastChargedAt: now,
        });
        await spruceServer.sendMessage(patient, "subscription_charged", {
          orderId: order.id,
          patientName: patient.firstName,
          amount: formatCurrency(amount),
          cardLast4: patient.cardLast4 ?? "",
        }).catch(() => {});
        await logAction("Supplemental dose increase charged and dispatched", sub.patientId, {
          subscriptionId: sub.id,
          orderId: order.id,
          previousDoseId: sub.doseId,
          doseId: requestedDoseId,
          calculatedDifference: adjustment.calculatedDifference,
          amount,
          overrideReason: typeof body.overrideReason === "string" ? body.overrideReason.trim() : "",
          dispatched: fulfillment.dispatched,
        });
        return NextResponse.json({
          success: true,
          mode: "supplemental_charged",
          amount,
          calculatedDifference: adjustment.calculatedDifference,
          orderId: order.id,
          dispatched: fulfillment.dispatched,
          warnings: fulfillment.warnings,
        });
      } catch (error) {
        await dbServer.orderDb.update(order.id, { paymentStatus: "failed" }).catch(() => {});
        await logAction("Supplemental dose charge failed", sub.patientId, {
          subscriptionId: sub.id,
          orderId: order.id,
          error: (error as Error).message,
        });
        return NextResponse.json({ error: (error as Error).message }, { status: 402 });
      }
    }

    if (action === "send_refill") {
      const sub = await dbServer.subscriptionDb.getById(String(body.subscriptionId ?? "")).catch(() => null);
      if (!sub) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
      const [patient, product] = await Promise.all([
        dbServer.patientDb.getById(sub.patientId).catch(() => null),
        dbServer.productDb.getById(sub.productId).catch(() => null),
      ]);
      if (!patient || !product) return NextResponse.json({ error: "Patient or product not found" }, { status: 404 });

      const requestedDoseId = typeof body.doseId === "string" && body.doseId ? body.doseId : sub.doseId;
      const dose = product.doses?.find((d) => d.id === requestedDoseId);
      if (!dose) return NextResponse.json({ error: "Selected dose is not valid for this product." }, { status: 400 });
      const amount = getChargeAmount(dose.price ?? product.startingPrice);
      if (amount === null) return NextResponse.json({ error: "Could not determine the charge amount." }, { status: 422 });

      // Reuse the held refill order for this cycle, or create one.
      let order: Order | null = null;
      if (sub.lastOrderId) {
        const existing = await dbServer.orderDb.getById(sub.lastOrderId).catch(() => null);
        if (existing && existing.isRefill && existing.paymentStatus !== "completed") order = existing;
      }
      if (!order) {
        const orders = await dbServer.orderDb.getByPatient(patient.id).catch(() => []);
        order = await createRefillOrder(sub, patient, orders[0] ?? null);
      }
      // Apply a dose change from the review.
      if (order.doseId !== requestedDoseId) {
        await dbServer.orderDb.update(order.id, { doseId: requestedDoseId }).catch(() => {});
        order = { ...order, doseId: requestedDoseId };
      }

      const hasCardOnFile = Boolean(patient.qbCardId && patient.recurringConsentAt);
      if (hasCardOnFile) {
        let chargeResult;
        try {
          chargeResult = await qbPayments.chargeStoredCard(order.id, patient.id, amount, {
            customerId: sub.qbCustomerId ?? "",
            cardId: patient.qbCardId!,
            cardLast4: patient.cardLast4,
            cardBrand: patient.cardBrand,
          });
        } catch (err) {
          await dbServer.orderDb.update(order.id, { paymentStatus: "failed" }).catch(() => {});
          const { token } = createPaymentLinkToken(order.id);
          const payUrl = buildPaymentLinkUrl(getPublicBaseUrl(req), token);
          await spruceServer.sendMessage(patient, "subscription_payment_failed", {
            orderId: order.id, patientName: patient.firstName, payUrl,
          }).catch(() => {});
          await logAction("Refill charge failed on send — pay-link sent (admin)", sub.patientId, { subscriptionId: sub.id, error: (err as Error).message });
          return NextResponse.json({ error: (err as Error).message ?? "Charge failed; pay-link sent instead." }, { status: 402 });
        }
        const fulfillment = await fulfillChargedRefillOrder({ order, patient, product, amount, chargeResult, subscription: sub });
        const cycle = advanceCycle(sub.coversThrough, now, sub.intervalDays, sub.leadDays);
        await dbServer.subscriptionDb.update(sub.id, { ...cycle, doseId: requestedDoseId, lastOrderId: order.id, lastChargedAt: now });
        await spruceServer.sendMessage(patient, "subscription_charged", {
          orderId: order.id, patientName: patient.firstName, amount: formatCurrency(amount), cardLast4: patient.cardLast4 ?? "",
        }).catch(() => {});
        await logAction("Refill reviewed & sent (admin)", sub.patientId, { subscriptionId: sub.id, orderId: order.id, doseId: requestedDoseId, amount, dispatched: fulfillment.dispatched });
        return NextResponse.json({ success: true, mode: "charged", orderId: order.id, dispatched: fulfillment.dispatched, warnings: fulfillment.warnings });
      }

      // No saved card → text a pay-link; the pay page advances the cycle on payment.
      await dbServer.subscriptionDb.update(sub.id, { doseId: requestedDoseId }).catch(() => {});
      const { token } = createPaymentLinkToken(order.id);
      const payUrl = buildPaymentLinkUrl(getPublicBaseUrl(req), token);
      await spruceServer.sendMessage(patient, "subscription_pay_link", {
        orderId: order.id, patientName: patient.firstName, amount: formatCurrency(amount), payUrl,
      }).catch(() => {});
      await dbServer.subscriptionDb.update(sub.id, {
        lastOrderId: order.id,
        nextRunAt: new Date(Date.parse(now) + DAY_MS * 3).toISOString(),
      });
      await logAction("Refill reviewed — pay-link sent (admin, no card on file)", sub.patientId, { subscriptionId: sub.id, orderId: order.id, doseId: requestedDoseId });
      return NextResponse.json({ success: true, mode: "link_sent", orderId: order.id });
    }

    if (action === "schedule_charge_only") {
      const sub = await dbServer.subscriptionDb.getById(String(body.subscriptionId ?? "")).catch(() => null);
      if (!sub) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

      let overrideAmount: number | null = null;
      if (body.overrideAmount !== undefined && body.overrideAmount !== null && String(body.overrideAmount).trim() !== "") {
        overrideAmount = Number(body.overrideAmount);
        if (!Number.isFinite(overrideAmount) || overrideAmount <= 0) {
          return NextResponse.json({ error: "Override amount must be a positive number." }, { status: 400 });
        }
      }
      const note = typeof body.note === "string" ? body.note.trim() : "";
      let nextRunAt: string | undefined;
      if (typeof body.nextRunAt === "string" && body.nextRunAt.trim()) {
        const parsed = new Date(body.nextRunAt);
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json({ error: "Invalid charge date." }, { status: 400 });
        }
        nextRunAt = parsed.toISOString();
      }

      const updated = await dbServer.subscriptionDb.setNextChargeAdjustment(sub.id, {
        skipNextDispatch: true,
        nextChargeOverride: overrideAmount,
        nextChargeNote: note || null,
        nextRunAt,
      });
      await logAction("Subscription scheduled charge-only, no dispatch (admin)", sub.patientId, {
        subscriptionId: sub.id,
        overrideAmount,
        nextRunAt: nextRunAt ?? sub.nextRunAt,
        note,
      });
      return NextResponse.json({ success: true, subscription: updated });
    }

    if (action === "enroll") {
      const patientId = String(body.patientId ?? "").trim();
      const phone = String(body.phone ?? "").trim();
      let patient = patientId ? await dbServer.patientDb.getById(patientId).catch(() => null) : null;
      if (!patient && phone) {
        const normalized = spruceServer.normalizeSprucePhoneNumber(phone) ?? phone;
        patient = await dbServer.patientDb.getByPhone(normalized).catch(() => null);
      }
      if (!patient) return NextResponse.json({ error: "Patient not found for that ID/phone." }, { status: 404 });

      // Derive product/dose from the patient's most recent order.
      const orders = await dbServer.orderDb.getByPatient(patient.id).catch(() => []);
      const lastOrder = orders[0] ?? null;
      if (!lastOrder) {
        return NextResponse.json({ error: "Patient has no orders to base a subscription on." }, { status: 422 });
      }

      // Already actively subscribed for this product?
      const existing = await dbServer.subscriptionDb
        .getActiveByPatientProduct(patient.id, lastOrder.productId)
        .catch(() => null);
      if (existing) {
        return NextResponse.json({ success: true, alreadyActive: true, subscription: existing });
      }

      const hasCardOnFile = Boolean(patient.qbCardId && patient.recurringConsentAt);
      if (hasCardOnFile) {
        const cycle = computeInitialCycle(now, DEFAULT_INTERVAL_DAYS, DEFAULT_LEAD_DAYS);
        const sub: Subscription = {
          id: `sub_${Date.now()}${generateId().slice(0, 4)}`,
          patientId: patient.id,
          productId: lastOrder.productId,
          doseId: lastOrder.doseId,
          status: "active",
          intervalDays: DEFAULT_INTERVAL_DAYS,
          leadDays: DEFAULT_LEAD_DAYS,
          coversThrough: cycle.coversThrough,
          nextRunAt: cycle.nextRunAt,
          lastOrderId: lastOrder.id,
          sourceOrderId: lastOrder.id,
          createdAt: now,
          updatedAt: now,
        };
        await dbServer.subscriptionDb.create(sub);
        await logAction("Subscription enrolled by admin (card on file)", patient.id, { subscriptionId: sub.id });
        return NextResponse.json({ success: true, mode: "activated", subscription: sub });
      }

      // No card on file → create an unpaid refill order + text the pay+save link.
      const product = await dbServer.productDb.getById(lastOrder.productId).catch(() => null);
      const dose = product?.doses?.find((d) => d.id === lastOrder.doseId);
      const amount = getChargeAmount(dose?.price ?? product?.startingPrice);
      const order = await createRefillOrder(
        {
          id: "", patientId: patient.id, productId: lastOrder.productId, doseId: lastOrder.doseId,
          status: "active", intervalDays: DEFAULT_INTERVAL_DAYS, leadDays: DEFAULT_LEAD_DAYS,
          createdAt: now, updatedAt: now,
        } as Subscription,
        patient,
        lastOrder
      );
      const { token } = createPaymentLinkToken(order.id);
      const payUrl = buildPaymentLinkUrl(getPublicBaseUrl(req), token);
      await spruceServer
        .sendMessage(patient, "subscription_pay_link", {
          orderId: order.id,
          patientName: patient.firstName,
          amount: amount !== null ? formatCurrency(amount) : "",
          payUrl,
        })
        .catch(() => {});
      await logAction("Subscription enroll link sent by admin", patient.id, { orderId: order.id });
      return NextResponse.json({ success: true, mode: "link_sent", orderId: order.id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Subscription management error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const denied = requireProviderOrAdmin(req);
  if (denied) return denied;

  try {
    const nowIso = new Date().toISOString();
    const subscriptions = await dbServer.subscriptionDb.getAll().catch(() => []);
    const patientIds = Array.from(new Set(subscriptions.map((s) => s.patientId)));
    const productIds = Array.from(new Set(subscriptions.map((s) => s.productId)));
    const [patients, products] = await Promise.all([
      dbServer.patientDb.getByIds(patientIds).catch(() => []),
      dbServer.productDb.getAll().catch(() => []),
    ]);
    const patientMap = new Map(patients.map((p) => [p.id, p] as const));
    const productMap = new Map(products.map((p) => [p.id, p] as const));

    const rows = await Promise.all(
      subscriptions.map(async (sub) => {
        const patient = patientMap.get(sub.patientId);
        const product = productMap.get(sub.productId);
        const dose = product?.doses?.find((d) => d.id === sub.doseId);
        // Refill orders for this subscription, most recent first.
        const orders = (await dbServer.orderDb.getByPatient(sub.patientId).catch(() => []))
          .filter((o) => o.subscriptionId === sub.id || o.isRefill)
          .filter((o) => o.subscriptionId === sub.id)
          .slice(0, 12)
          .map((o) => ({
            id: o.id,
            status: o.status,
            paymentStatus: o.paymentStatus,
            pharmacyStatus: o.pharmacyStatus,
            createdAt: o.createdAt,
            acknowledgedAt: o.providerAcknowledgedAt ?? null,
            acknowledgedBy: o.providerAcknowledgedBy ?? null,
          }));
        // Due for the 7-week dose review when active and the run time has passed.
        const dueForReview = sub.status === "active" && !!sub.nextRunAt && sub.nextRunAt <= nowIso;
        return {
          id: sub.id,
          status: sub.status,
          patientId: sub.patientId,
          patientName: patient ? [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() : sub.patientId,
          productName: product?.name ?? sub.productId,
          doseId: sub.doseId,
          doseLabel: dose ? [dose.label, dose.strength].filter(Boolean).join(" — ") : sub.doseId,
              doses: (product?.doses ?? []).map((d) => ({
                id: d.id,
                label: [d.label, d.strength].filter(Boolean).join(" — "),
                price: Number(d.price ?? product?.startingPrice ?? 0),
              })),
          intervalDays: sub.intervalDays,
          coversThrough: sub.coversThrough ?? null,
          nextRunAt: sub.nextRunAt ?? null,
          lastChargedAt: sub.lastChargedAt ?? null,
          dueForReview,
          hasCardOnFile: Boolean(patient?.qbCardId && patient?.recurringConsentAt),
          cardLast4: patient?.cardLast4 ?? null,
          orders,
        };
      })
    );

    // Active first, then by soonest next run.
    rows.sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return String(a.nextRunAt ?? "9999").localeCompare(String(b.nextRunAt ?? "9999"));
    });

    return NextResponse.json({ subscriptions: rows });
  } catch (error) {
    console.error("Provider subscriptions load error:", error);
    return NextResponse.json({ error: "Subscriptions load failed" }, { status: 500 });
  }
}
