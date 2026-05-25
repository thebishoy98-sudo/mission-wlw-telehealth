import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

type ProviderOrder = Awaited<ReturnType<typeof dbServer.orderDb.getAll>>[number];
type ProviderPatient = NonNullable<Awaited<ReturnType<typeof dbServer.patientDb.getById>>>;

function getPagination(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const requestedPageSize = Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize));
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  return { page, pageSize, q };
}

function matchesSearch(order: ProviderOrder, patient: ProviderPatient | null, q: string) {
  if (!q) return true;
  const values = [
    order.id,
    order.status,
    order.paymentStatus,
    order.pharmacyStatus,
    patient?.firstName,
    patient?.lastName,
    patient?.email,
    patient?.phone,
    patient ? `${patient.firstName} ${patient.lastName}` : "",
  ];
  return values.some((value) => String(value ?? "").toLowerCase().includes(q));
}

export async function GET(req: Request) {
  try {
    const { page, pageSize, q } = getPagination(req);
    const orders = await dbServer.orderDb.getAll().catch(() => db.orderDb.getAll());
    const reviews = await dbServer.providerReviewDb.getAll().catch(() => db.providerReviewDb.getAll());
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

    return NextResponse.json({
      orders: pagedOrders,
      patients: Array.from(
        new Map(pagedOrders.map((order) => patientMap.get(order.patientId)).filter(Boolean).map((patient) => [patient!.id, patient!])).values()
      ),
      products,
      reviews,
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
        q,
      },
    });
  } catch (error) {
    console.error("Provider dashboard load error:", error);
    return NextResponse.json({ error: "Provider dashboard load failed" }, { status: 500 });
  }
}
