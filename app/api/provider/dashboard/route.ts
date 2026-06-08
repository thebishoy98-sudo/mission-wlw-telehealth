import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import type { Patient } from "@/types";
import { requireProviderOrAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type ProviderOrder = Awaited<ReturnType<typeof dbServer.orderDb.getAll>>[number];

function patientCompleteness(patient: Patient | null | undefined): number {
  if (!patient) return 0;
  return [
    patient.firstName,
    patient.lastName,
    patient.email,
    patient.phone,
    patient.dateOfBirth,
    patient.address?.street1,
    patient.address?.city,
    patient.address?.state,
    patient.address?.zipCode,
  ].filter((value) => String(value ?? "").trim()).length;
}

function mergePatientMap(patients: Array<Patient | null>) {
  const map = new Map<string, Patient>();
  for (const patient of patients) {
    if (!patient) continue;
    const existing = map.get(patient.id);
    if (!existing || patientCompleteness(patient) >= patientCompleteness(existing)) {
      map.set(patient.id, patient);
    }
  }
  return map;
}

async function loadDashboardPatientMap(orders: ProviderOrder[]) {
  const ids = orders.map((order) => order.patientId);
  const serverPatients = await dbServer.patientDb.getByIds(ids).catch(() => []);
  const patientMap = mergePatientMap(serverPatients);

  for (const id of ids) {
    if (!patientMap.has(id)) {
      const localPatient = db.patientDb.getById(id);
      if (localPatient) patientMap.set(id, localPatient);
    }
  }

  return patientMap;
}

export async function GET(req: NextRequest) {
  const denied = requireProviderOrAdmin(req);
  if (denied) return denied;

  try {
    const orders = await dbServer.orderDb.getAll().catch(() => db.orderDb.getAll());
    const reviews = await dbServer.providerReviewDb.getAll().catch(() => db.providerReviewDb.getAll());
    const products = await dbServer.productDb.getAll().catch(() => db.productDb.getAll());
    const patients = await loadDashboardPatientMap(orders);

    const now = new Date();
    const activeOrders = orders.filter((o) => o.status !== "draft" && o.status !== "cancelled");
    const orderPeriods = {
      today: activeOrders.filter((o) => new Date(o.createdAt) >= new Date(now.getFullYear(), now.getMonth(), now.getDate())).length,
      thisWeek: activeOrders.filter((o) => new Date(o.createdAt).getTime() >= now.getTime() - 7 * 24 * 60 * 60 * 1000).length,
      thisMonth: activeOrders.filter((o) => new Date(o.createdAt) >= new Date(now.getFullYear(), now.getMonth(), 1)).length,
      thisYear: activeOrders.filter((o) => new Date(o.createdAt) >= new Date(now.getFullYear(), 0, 1)).length,
    };

    // Average time-to-review: hours from order.createdAt to review.chartViewedAt
    const reviewedPairs = reviews
      .filter((r) => r.chartViewedAt)
      .map((r) => {
        const order = orders.find((o) => o.id === r.orderId);
        if (!order) return null;
        return (new Date(r.chartViewedAt!).getTime() - new Date(order.createdAt).getTime()) / 3_600_000;
      })
      .filter((h): h is number => h !== null && h >= 0);
    const avgReviewHours =
      reviewedPairs.length > 0
        ? Math.round((reviewedPairs.reduce((s, h) => s + h, 0) / reviewedPairs.length) * 10) / 10
        : null;

    return NextResponse.json({
      orders,
      patients: Array.from(patients.values()),
      products,
      reviews,
      orderPeriods,
      avgReviewHours,
    });
  } catch (error) {
    console.error("Provider dashboard load error:", error);
    return NextResponse.json({ error: "Provider dashboard load failed" }, { status: 500 });
  }
}
