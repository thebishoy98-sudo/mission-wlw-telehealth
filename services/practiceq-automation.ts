import type { Order, Patient, PracticeQAutomationJob } from "@/types";
import { generateId } from "@/lib/utils";
import { PRACTICEQ_HOSTED_INTAKE_URL } from "@/lib/practiceq-hosted-intake";

export function isPracticeQAutomationReady(order: Order): boolean {
  return order.paymentStatus === "completed";
}

export function buildPracticeQPatientStartUrl(patient: Patient): string {
  const url = new URL(PRACTICEQ_HOSTED_INTAKE_URL);
  const fullName = [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim();
  if (fullName) url.searchParams.set("Name", fullName);
  if (patient.email) {
    url.searchParams.set("Email", patient.email);
  } else if (patient.phone) {
    url.searchParams.set("Email", patient.phone);
  }
  return url.toString();
}

export function createPracticeQAutomationJob(order: Order, patient: Patient): PracticeQAutomationJob {
  if (!isPracticeQAutomationReady(order)) {
    throw new Error("PracticeQ automation can only be queued after payment is completed");
  }

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
  return {
    id: generateId(),
    orderId: order.id,
    patientId: patient.id,
    status: "queued",
    attempts: 0,
    practiceQStartUrl: buildPracticeQPatientStartUrl(patient),
    handoffToken: generateId(),
    handoffExpiresAt: expiresAt,
    createdAt: now,
    updatedAt: now,
  };
}
