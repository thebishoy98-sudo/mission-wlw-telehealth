import type { Order, Patient } from "@/types";
import * as db from "@/lib/db";
import * as practiceq from "@/services/practiceq";

export function hasIntegrationPatientFields(patient: Patient | null | undefined): patient is Patient {
  return !!(
    patient?.id &&
    patient.firstName &&
    patient.lastName &&
    patient.dateOfBirth &&
    patient.phone &&
    patient.email &&
    patient.address?.street1 &&
    patient.address?.city &&
    patient.address?.state &&
    patient.address?.zipCode
  );
}

export function preferCompletePatientForIntegrations(
  resolvedPatient: Patient | null,
  submittedPatient: Patient | null
): Patient | null {
  if (hasIntegrationPatientFields(resolvedPatient)) return resolvedPatient;
  if (hasIntegrationPatientFields(submittedPatient)) return submittedPatient;
  return resolvedPatient ?? submittedPatient;
}

export async function resolvePatient(
  order: Pick<Order, "patientId" | "practiceqClientId">
): Promise<Patient | null> {
  if (order.practiceqClientId) {
    const client = await practiceq.getClientById(order.practiceqClientId).catch(() => null);
    if (client) return practiceq.practiceQClientToPatient(client, order.patientId);
  }

  try {
    const serverDb = await import("@/lib/db.server");
    const patient = await serverDb.patientDb.getById(order.patientId).catch(() => null);
    if (patient) return patient;
  } catch {
  }

  return db.patientDb.getById(order.patientId);
}

export async function resolvePatientByPracticeQId(
  practiceqClientId: string,
  fallbackPatientId: string
): Promise<Patient | null> {
  const client = await practiceq.getClientById(practiceqClientId).catch(() => null);
  if (client) return practiceq.practiceQClientToPatient(client, fallbackPatientId);
  return null;
}
