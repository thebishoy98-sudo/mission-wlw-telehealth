/**
 * Patient Resolver
 *
 * Patient PHI lives in PracticeQ (HIPAA-compliant, BAA-signed).
 * Our Postgres patients table is a minimal stub: id + practiceq_client_id only.
 *
 * This module resolves a full Patient record from PracticeQ first,
 * falling back to Postgres if PracticeQ is unavailable or not configured.
 */

import type { Patient, Order } from "@/types";
import * as practiceq from "@/services/practiceq";
import * as db from "@/lib/db";

/**
 * Resolve patient data for a given order.
 *
 * 1. If the order has a practiceqClientId → fetch from PracticeQ API
 * 2. Otherwise fall back to Postgres patientDb (legacy / dev mode)
 * 3. Otherwise fall back to localStorage db
 */
export async function resolvePatient(
  order: Pick<Order, "patientId" | "practiceqClientId">
): Promise<Patient | null> {
  // 1. PracticeQ is the source of truth
  if (order.practiceqClientId) {
    const client = await practiceq.getClientById(order.practiceqClientId).catch(() => null);
    if (client) {
      return practiceq.practiceQClientToPatient(client, order.patientId);
    }
  }

  // 2. Postgres fallback (dev / pre-migration orders)
  try {
    const serverDb = await import("@/lib/db.server");
    const patient = await serverDb.patientDb.getById(order.patientId).catch(() => null);
    if (patient) return patient;
  } catch {
    // db.server not available
  }

  // 3. localStorage fallback (browser / test)
  return db.patientDb.getById(order.patientId);
}

/**
 * Resolve patient by PracticeQ client ID directly.
 * Used when you have the ClientId but not a full order.
 */
export async function resolvePatientByPracticeQId(
  practiceqClientId: string,
  fallbackPatientId: string
): Promise<Patient | null> {
  const client = await practiceq.getClientById(practiceqClientId).catch(() => null);
  if (client) return practiceq.practiceQClientToPatient(client, fallbackPatientId);
  return null;
}
