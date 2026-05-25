import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function getPagination(req: NextRequest) {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1") || 1);
  const requestedPageSize = Number(req.nextUrl.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize));
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  return { page, pageSize, q };
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

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { page, pageSize, q } = getPagination(req);
    const orders = await dbServer.orderDb.getAll().catch(() => db.orderDb.getAll());
    const products = await dbServer.productDb.getAll().catch(() => db.productDb.getAll());

    const allPatients = await Promise.all(
      Array.from(new Set(orders.map((order) => order.patientId))).map(async (patientId) =>
        (await dbServer.patientDb.getById(patientId).catch(() => null)) ?? db.patientDb.getById(patientId)
      )
    );
    const patientMap = new Map(
      allPatients.filter(Boolean).map((patient) => [patient!.id, patient!])
    );

    const filteredOrders = orders.filter((order) =>
      matchesSearch(order, patientMap.get(order.patientId) ?? null, q)
    );
    const sortedOrders = [...filteredOrders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const total = sortedOrders.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const pagedOrders = sortedOrders.slice((safePage - 1) * pageSize, safePage * pageSize);

    const payments = await Promise.all(
      pagedOrders.map(async (order) =>
        (await dbServer.paymentDb.getByOrder(order.id).catch(() => null)) ?? db.paymentDb.getByOrder(order.id)
      )
    );

    const pharmacyOrders = await Promise.all(
      pagedOrders.map(async (order) =>
        (await dbServer.pharmacyOrderDb.getByOrder(order.id).catch(() => null)) ?? db.pharmacyOrderDb.getByOrder(order.id)
      )
    );

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
