/**
 * Patient self-service subscription view + cancel.
 *
 * GET  -> the logged-in patient's subscriptions (active/paused) with labels.
 * POST { action: "cancel", subscriptionId } -> cancel one of THEIR own subs.
 *
 * Authenticated by the patient session cookie (same as /api/patient/orders).
 */

import { NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { getPatientIdFromRequest } from "@/lib/patient-session";
import { canonicalProducts } from "@/data/products";
import { computeInitialCycle, DEFAULT_INTERVAL_DAYS, DEFAULT_LEAD_DAYS } from "@/lib/subscription";
import * as spruceServer from "@/services/spruce.server";
import { generateId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const patientId = getPatientIdFromRequest(req);
  if (!patientId) return NextResponse.json({ error: "Patient login required" }, { status: 401 });

  const subscriptions = await dbServer.subscriptionDb.getByPatient(patientId).catch(() => []);
  // Active/paused (manageable) + cancelled (offer reactivate). Skip nothing else.
  const visible = subscriptions.filter(
    (s) => s.status === "active" || s.status === "paused" || s.status === "cancelled"
  );

  const rows = await Promise.all(
    visible.map(async (sub) => {
      const product =
        (await dbServer.productDb.getById(sub.productId).catch(() => null)) ??
        canonicalProducts.find((p) => p.id === sub.productId) ??
        null;
      const dose = product?.doses?.find((d) => d.id === sub.doseId);
      return {
        id: sub.id,
        status: sub.status,
        productName: product?.name ?? "Treatment",
        doseLabel: dose ? [dose.label, dose.strength].filter(Boolean).join(" — ") : "",
        intervalWeeks: Math.round(sub.intervalDays / 7),
        nextRunAt: sub.nextRunAt ?? null,
        coversThrough: sub.coversThrough ?? null,
      };
    })
  );

  return NextResponse.json({ subscriptions: rows });
}

export async function POST(req: Request) {
  const patientId = getPatientIdFromRequest(req);
  if (!patientId) return NextResponse.json({ error: "Patient login required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const subscriptionId = String(body.subscriptionId ?? "");
  if (action !== "cancel" && action !== "reactivate") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const sub = await dbServer.subscriptionDb.getById(subscriptionId).catch(() => null);
  // Ownership check: a patient may only manage their own subscription.
  if (!sub || sub.patientId !== patientId) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const patient = await dbServer.patientDb.getById(patientId).catch(() => null);

  if (action === "cancel") {
    await dbServer.subscriptionDb.update(sub.id, {
      status: "cancelled",
      cancelledAt: now,
      cancelReason: "patient self-service cancel",
    });
    await dbServer.integrationLogDb
      .create({
        id: generateId(), timestamp: now, integrationName: "system",
        action: "Subscription cancelled by patient (portal)", patientId, status: "success",
        details: { subscriptionId: sub.id },
      })
      .catch(() => {});
    if (patient) {
      await spruceServer.sendMessage(patient, "subscription_cancelled", {}).catch(() => {});
    }
    return NextResponse.json({ success: true });
  }

  // reactivate — restart on a fresh cycle from now
  const cycle = computeInitialCycle(now, sub.intervalDays || DEFAULT_INTERVAL_DAYS, sub.leadDays || DEFAULT_LEAD_DAYS);
  const updated = await dbServer.subscriptionDb.update(sub.id, {
    status: "active",
    coversThrough: cycle.coversThrough,
    nextRunAt: cycle.nextRunAt,
  });
  await dbServer.integrationLogDb
    .create({
      id: generateId(), timestamp: now, integrationName: "system",
      action: "Subscription reactivated by patient (portal)", patientId, status: "success",
      details: { subscriptionId: sub.id },
    })
    .catch(() => {});
  if (patient) {
    const nextRunDate = updated?.nextRunAt
      ? new Date(updated.nextRunAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "";
    await spruceServer.sendMessage(patient, "subscription_reactivated", { nextRunDate }).catch(() => {});
  }
  return NextResponse.json({ success: true });
}
