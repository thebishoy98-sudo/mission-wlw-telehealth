import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import type { Patient, PracticeQMirror } from "@/types";
import { resolvePatient } from "@/lib/patient-resolver";
import { hydratePatientFromPracticeQ } from "@/lib/provider-chart";
import { getPracticeQMirrorForOrder } from "@/services/practiceq";
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

function answerValue(practiceq: PracticeQMirror | null | undefined, pattern: RegExp): string {
  const answer = practiceq?.answers.find((item) => pattern.test(item.question.toLowerCase()))?.answer?.trim() ?? "";
  return answer.toLowerCase() === "no answer" ? "" : answer;
}

async function resolveAdminPatient(order: dbServeredOrder): Promise<Patient | null> {
  const patient =
    (await resolvePatient(order).catch(() => null)) ??
    (await dbServer.patientDb.getById(order.patientId).catch(() => null)) ??
    db.patientDb.getById(order.patientId);

  if (!patient || !order.practiceqClientId) return patient;

  const hasName = !!(patient.firstName && patient.lastName);
  if (hasName) return patient;

  const packet = await dbServer.practiceqPacketDb.getByOrder(order.id).catch(() => null);
  const practiceq = await getPracticeQMirrorForOrder(order, packet).catch(() => null);
  if (!practiceq?.available) return patient;

  const hydrated = hydratePatientFromPracticeQ(patient, practiceq);
  if (!practiceq.answers.length) return hydrated;

  const firstName = hydrated.firstName || answerValue(practiceq, /^first name\b/);
  const lastName = hydrated.lastName || answerValue(practiceq, /^last name\b/);
  const phone = hydrated.phone || answerValue(practiceq, /^phone/);
  const dateOfBirth = hydrated.dateOfBirth || answerValue(practiceq, /date of birth|dob/);
  const street1 = hydrated.address?.street1 || answerValue(practiceq, /address/);
  const city = hydrated.address?.city || answerValue(practiceq, /^city\b/);
  const state = hydrated.address?.state || answerValue(practiceq, /^state\b/);
  const zipCode = hydrated.address?.zipCode || answerValue(practiceq, /zip/);

  return {
    ...hydrated,
    firstName,
    lastName,
    phone,
    dateOfBirth,
    address: {
      ...hydrated.address,
      street1,
      city,
      state,
      zipCode,
      country: hydrated.address?.country || "US",
    },
    shippingAddress: {
      ...hydrated.shippingAddress,
      street1: hydrated.shippingAddress?.street1 || street1,
      city: hydrated.shippingAddress?.city || city,
      state: hydrated.shippingAddress?.state || state,
      zipCode: hydrated.shippingAddress?.zipCode || zipCode,
      country: hydrated.shippingAddress?.country || "US",
    },
  };
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { page, pageSize, q } = getPagination(req);
    const orders = await dbServer.orderDb.getAll().catch(() => db.orderDb.getAll());
    const products = await dbServer.productDb.getAll().catch(() => db.productDb.getAll());

    const allPatients = await Promise.all(
      orders.map(resolveAdminPatient)
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
