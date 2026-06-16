/**
 * Provider/admin view of active auto-refill subscriptions and their refill
 * orders. Read-only listing used by the Subscriptions tab so providers can
 * track refills and acknowledge them (acknowledgment is non-blocking — see
 * /api/provider/review action=acknowledge_refill).
 */

import { NextRequest, NextResponse } from "next/server";
import * as dbServer from "@/lib/db.server";
import { requireProviderOrAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireProviderOrAdmin(req);
  if (denied) return denied;

  try {
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
        return {
          id: sub.id,
          status: sub.status,
          patientId: sub.patientId,
          patientName: patient ? [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() : sub.patientId,
          productName: product?.name ?? sub.productId,
          doseLabel: dose ? [dose.label, dose.strength].filter(Boolean).join(" — ") : sub.doseId,
          intervalDays: sub.intervalDays,
          coversThrough: sub.coversThrough ?? null,
          nextRunAt: sub.nextRunAt ?? null,
          lastChargedAt: sub.lastChargedAt ?? null,
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
