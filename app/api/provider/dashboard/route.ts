import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import type { Patient, PracticeQMirror } from "@/types";
import { resolvePatient } from "@/lib/patient-resolver";
import { hydratePatientFromPracticeQ } from "@/lib/provider-chart";
import { getPracticeQMirrorForOrder } from "@/services/practiceq";
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

function answerValue(practiceq: PracticeQMirror | null | undefined, pattern: RegExp): string {
  const answer = practiceq?.answers.find((item) => pattern.test(item.question.toLowerCase()))?.answer?.trim() ?? "";
  return answer.toLowerCase() === "no answer" ? "" : answer;
}

async function resolveProviderPatient(order: ProviderOrder): Promise<Patient | null> {
  const patient =
    (await resolvePatient(order).catch(() => null)) ??
    (await dbServer.patientDb.getById(order.patientId).catch(() => null)) ??
    db.patientDb.getById(order.patientId);

  if (!patient || (patient.firstName && patient.lastName)) return patient;

  const packet = await dbServer.practiceqPacketDb.getByOrder(order.id).catch(() => null);
  const practiceq = await getPracticeQMirrorForOrder(order, packet).catch(() => null);
  if (!practiceq?.available) return patient;

  const hydrated = hydratePatientFromPracticeQ(patient, practiceq);
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
  const denied = requireProviderOrAdmin(req);
  if (denied) return denied;

  try {
    const orders = await dbServer.orderDb.getAll().catch(() => db.orderDb.getAll());
    const reviews = await dbServer.providerReviewDb.getAll().catch(() => db.providerReviewDb.getAll());
    const products = await dbServer.productDb.getAll().catch(() => db.productDb.getAll());
    const patients = mergePatientMap(await Promise.all(orders.map(resolveProviderPatient)));

    return NextResponse.json({
      orders,
      patients: Array.from(patients.values()),
      products,
      reviews,
    });
  } catch (error) {
    console.error("Provider dashboard load error:", error);
    return NextResponse.json({ error: "Provider dashboard load failed" }, { status: 500 });
  }
}
