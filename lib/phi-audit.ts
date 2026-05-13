/**
 * PHI Audit Log — HIPAA § 164.312(b) Audit Controls
 *
 * Every access, modification, or disclosure of Protected Health Information (PHI)
 * MUST be logged via this module.  The log is immutable — records are INSERT-only.
 *
 * PHI fields in this system:
 *   patients: first_name, last_name, date_of_birth, gender, phone, email, address
 *   questionnaire_answers: answer (may contain medical history)
 *   uploads: driver_license, selfie (identity verification)
 *   consent_records: signed_name, ip_address
 *   ai_conversations: messages (may contain symptom descriptions)
 *
 * Required by HIPAA to retain audit logs for 6 years from creation or last effective date.
 */

import * as dbServer from "@/lib/db.server";
import * as db from "@/lib/db";

export type PhiAction =
  | "view"          // PHI was read/displayed
  | "create"        // New PHI record created
  | "update"        // PHI record modified
  | "delete"        // PHI record deleted (soft or hard)
  | "export"        // PHI exported / downloaded
  | "disclose"      // PHI sent to third party (pharmacy, PracticeQ, SMS)
  | "ai_process"    // PHI sent to AI for processing
  | "payment";      // PHI used in payment processing

export type PhiResource =
  | "patient"
  | "order"
  | "questionnaire_answer"
  | "consent_record"
  | "upload"
  | "provider_review"
  | "payment"
  | "pharmacy_order"
  | "sms_message"
  | "ai_conversation";

export interface PhiAuditEntry {
  id: string;
  timestamp: string;
  action: PhiAction;
  resource: PhiResource;
  resourceId: string;
  patientId?: string;
  orderId?: string;
  // Who performed the action
  actor: string;        // "patient", "provider:<id>", "admin:<id>", "system", "api"
  actorIp?: string;
  requestId?: string;
  // What third party received PHI (for disclosures)
  disclosedTo?: string; // "practiceq" | "lifefile" | "spruce" | "quickbooks" | "anthropic"
  outcome: "success" | "error";
  errorMessage?: string;
}

/**
 * Log a PHI access event.
 * This is fire-and-forget — failures are swallowed so they never block the main flow,
 * but errors are printed to console so they appear in Vercel logs.
 */
export function logPhiAccess(entry: Omit<PhiAuditEntry, "id" | "timestamp">): void {
  const fullEntry: PhiAuditEntry = {
    id: `phi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };

  // Write to localStorage (client-visible audit trail in demo)
  try {
    db.integrationLogDb.create({
      id: fullEntry.id,
      timestamp: fullEntry.timestamp,
      integrationName: "phi_audit" as any,
      action: `${fullEntry.action}:${fullEntry.resource}`,
      orderId: fullEntry.orderId,
      patientId: fullEntry.patientId,
      status: fullEntry.outcome,
      details: {
        actor: fullEntry.actor,
        actorIp: fullEntry.actorIp,
        requestId: fullEntry.requestId,
        resourceId: fullEntry.resourceId,
        disclosedTo: fullEntry.disclosedTo,
        errorMessage: fullEntry.errorMessage,
      },
    });
  } catch { /* non-blocking */ }

  // Write to Postgres (persistent, 6-year retention)
  dbServer.phiAuditDb?.create(fullEntry).catch((err: unknown) => {
    console.error("[PHI AUDIT] Failed to persist audit log:", err);
  });
}

/**
 * Log a PHI disclosure to a third-party integration.
 * Used whenever PHI leaves the system boundary (HIPAA § 164.314 — BA agreements).
 */
export function logPhiDisclosure(
  patientId: string,
  orderId: string,
  disclosedTo: PhiAuditEntry["disclosedTo"],
  actor: string = "system",
  outcome: "success" | "error" = "success",
  errorMessage?: string
): void {
  logPhiAccess({
    action: "disclose",
    resource: "patient",
    resourceId: patientId,
    patientId,
    orderId,
    actor,
    disclosedTo,
    outcome,
    errorMessage,
  });
}

/**
 * Extract actor info from Next.js request headers (set by middleware).
 */
export function actorFromHeaders(headers: Headers): { actor: string; actorIp?: string; requestId?: string } {
  return {
    actor: headers.get("x-actor") ?? "api",
    actorIp: headers.get("x-client-ip") ?? undefined,
    requestId: headers.get("x-request-id") ?? undefined,
  };
}
