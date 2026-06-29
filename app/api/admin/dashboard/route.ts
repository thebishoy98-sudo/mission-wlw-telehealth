import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import type { Patient } from "@/types";
import { requireAdmin } from "@/lib/server-auth";
import { isPaidAdminOrder } from "@/lib/admin-order-visibility";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function getPagination(req: NextRequest) {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1") || 1);
  const requestedPageSize = Number(req.nextUrl.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize));
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const paidOnly = req.nextUrl.searchParams.get("paidOnly") === "true";
  return { page, pageSize, q, paidOnly };
}

function matchesSearch(order: dbServeredOrder, patient: dbServeredPatient | null, q: string) {
  if (!q) return true;
  const values = [
    order.id,
    order.status,
    order.paymentStatus,
    order.pharmacyStatus,
    order.quickbooksStatus,
    patient?.firstName,
    patient?.lastName,
    patient?.email,
    patient?.phone,
    patient ? `${patient.firstName} ${patient.lastName}` : "",
  ];
  return values.some((value) => String(value ?? "").toLowerCase().includes(q));
}

type dbServeredOrder = Awaited<ReturnType<typeof dbServer.orderDb.getAll>>[number];
type dbServeredPatient = NonNullable<Awaited<ReturnType<typeof dbServer.patientDb.getById>>>;

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

async function loadDashboardPatientMap(orders: dbServeredOrder[]) {
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

async function loadDashboardPayments(orders: dbServeredOrder[]) {
  const ids = orders.map((order) => order.id);
  const serverPayments = await dbServer.paymentDb.getByOrders(ids).catch(() => []);
  if (serverPayments.length) return serverPayments;
  return ids.map((id) => db.paymentDb.getByOrder(id)).filter(Boolean);
}

async function loadDashboardPharmacyOrders(orders: dbServeredOrder[]) {
  const ids = orders.map((order) => order.id);
  const serverPharmacyOrders = await dbServer.pharmacyOrderDb.getByOrders(ids).catch(() => []);
  if (serverPharmacyOrders.length) return serverPharmacyOrders;
  return ids.map((id) => db.pharmacyOrderDb.getByOrder(id)).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { page, pageSize, q, paidOnly } = getPagination(req);
    const orders = await dbServer.orderDb.getAll().catch(() => db.orderDb.getAll());
    const products = await dbServer.productDb.getAll().catch(() => db.productDb.getAll());
    const sortedAllOrders = [...orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const visibleOrders = paidOnly ? sortedAllOrders.filter(isPaidAdminOrder) : sortedAllOrders;
    const searchPatientMap = q ? await loadDashboardPatientMap(visibleOrders) : new Map<string, Patient>();
    const filteredOrders = q
      ? visibleOrders.filter((order) =>
          matchesSearch(order, searchPatientMap.get(order.patientId) ?? null, q)
        )
      : visibleOrders;
    const sortedOrders = filteredOrders;
    const total = sortedOrders.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const pagedOrders = sortedOrders.slice((safePage - 1) * pageSize, safePage * pageSize);
    const patientMap = q ? searchPatientMap : await loadDashboardPatientMap(pagedOrders);

    const payments = await loadDashboardPayments(pagedOrders);
    const pharmacyOrders = await loadDashboardPharmacyOrders(pagedOrders);

    return NextResponse.json({
      orders: pagedOrders,
      patients: Array.from(
        new Map(pagedOrders.map((order) => patientMap.get(order.patientId)).filter(Boolean).map((patient) => [patient!.id, patient!])).values()
      ),
      products,
      payments: payments.filter(Boolean),
      pharmacyOrders: pharmacyOrders.filter(Boolean),
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
        q,
      },
    });
  } catch (error) {
    console.error("Admin dashboard load error:", error);
    return NextResponse.json({ error: "Admin dashboard load failed" }, { status: 500 });
  }
}
