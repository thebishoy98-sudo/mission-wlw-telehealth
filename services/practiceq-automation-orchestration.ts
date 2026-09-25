import { findEstablishedOrder } from "@/lib/established-patient";
import { getOrderDispatchGate } from "@/lib/order-gates";
import type { Order, Patient } from "@/types";
import * as db from "@/lib/db";
import * as dbServer from "@/lib/db.server";
import { shouldRetryPracticeQCompletionAfterIdentityApproval } from "@/lib/identity-approval";
import { completePracticeQSession } from "@/lib/practiceq-session-completion";
import { generateId } from "@/lib/utils";
import { createPracticeQAutomationJob } from "@/services/practiceq-automation";

type QueueSource = "payment_charge" | "identity_upload" | "identity_approval" | "identity_review";

export type PracticeQQueueResult =
  | { status: "skipped_existing_patient" }
  | { status: "queued"; jobId: string }
  | { status: "requeued"; jobId: string }
  | { status: "already_queued"; jobId: string }
  | { status: "skipped_active_patient_job"; jobId: string };

type PracticeQResumeResult =
  | Awaited<ReturnType<typeof completePracticeQSession>>
  | PracticeQQueueResult
  | { status: "not_ready" | "missing_patient" };

async function getActivePatientJob(patientId: string) {
  const store = dbServer.practiceqAutomationJobDb as typeof dbServer.practiceqAutomationJobDb & {
    getActiveByPatient?: (patientId: string) => Promise<Awaited<ReturnType<typeof dbServer.practiceqAutomationJobDb.getByOrder>>>;
  };
  if (store.getActiveByPatient) {
    return store.getActiveByPatient(patientId).catch(() => null);
  }
  return null;
}

export async function wakePracticeQRemoteWorker() {
  const remoteBase = process.env.PRACTICEQ_REMOTE_PUBLIC_URL;
  if (!remoteBase) return;
  const wakeUrl = new URL(process.env.PRACTICEQ_API_KEY ? "/wake" : "/health", remoteBase);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.PRACTICEQ_REMOTE_WAKE_TIMEOUT_MS ?? 90000)
  );
  try {
    await fetch(wakeUrl.toString(), {
      method: "GET",
      headers: process.env.PRACTICEQ_API_KEY
        ? { "x-practiceq-api-key": process.env.PRACTICEQ_API_KEY }
        : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function queuePracticeQAutomationForOrder({
  order,
  patient,
  source,
}: {
  order: Order;
  patient: Patient;
  source: QueueSource;
}): Promise<PracticeQQueueResult> {
  const prior = findEstablishedOrder(order, await dbServer.orderDb.getByPatient(order.patientId));
  if (prior) {
    await dbServer.orderDb.update(order.id, { practiceQStatus: "skipped" });
    await dbServer.integrationLogDb.create({
      id: generateId(), timestamp: new Date().toISOString(), integrationName: "practiceq",
      action: "PracticeQ skipped for established patient", orderId: order.id, patientId: order.patientId,
      status: "success", details: { source, priorOrderId: prior.id },
    });
    return { status: "skipped_existing_patient" };
  }

  const existingJob = await dbServer.practiceqAutomationJobDb.getByOrder(order.id).catch(() => null);

  if (existingJob) {
    if (existingJob.status === "failed") {
      await dbServer.practiceqAutomationJobDb.update(existingJob.id, {
        status: "queued",
        attempts: 0,
        lastError: undefined,
        lockedAt: undefined,
      }).catch(() => null);
      db.orderDb.update(order.id, { practiceQStatus: "pending" });
      await dbServer.orderDb.update(order.id, { practiceQStatus: "pending" }).catch(() => null);
      return { status: "requeued", jobId: existingJob.id };
    }
    return { status: "already_queued", jobId: existingJob.id };
  }

  const activePatientJob = await getActivePatientJob(patient.id);
  if (activePatientJob) {
    await dbServer.integrationLogDb.create({
      id: generateId(),
      timestamp: new Date().toISOString(),
      integrationName: "practiceq",
      action: "PracticeQ job skipped - patient already has an active job",
      orderId: order.id,
      patientId: patient.id,
      status: "success",
      details: { source, existingJobId: activePatientJob.id, existingJobStatus: activePatientJob.status },
    }).catch(() => null);
    return { status: "skipped_active_patient_job", jobId: activePatientJob.id };
  }

  const automationJob = createPracticeQAutomationJob(order, patient);
  await dbServer.practiceqAutomationJobDb.create(automationJob);
  db.practiceqAutomationJobDb.create(automationJob);
  db.orderDb.update(order.id, { practiceQStatus: "pending" });
  await dbServer.orderDb.update(order.id, { practiceQStatus: "pending" });
  return { status: "queued", jobId: automationJob.id };
}

export async function resumePracticeQAfterIdentityApproval({
  order,
  patient,
  source,
  wakeRemoteWorker = wakePracticeQRemoteWorker,
}: {
  order: Order;
  patient?: Patient | null;
  source: Exclude<QueueSource, "payment_charge">;
  wakeRemoteWorker?: () => Promise<void>;
}): Promise<PracticeQResumeResult> {
  // Only a paid, approved repeat order with all current review gates clear
  // can proceed without another PracticeQ intake.
  if (order.status === "approved" && order.paymentStatus === "completed" && getOrderDispatchGate(order).canDispatch) {
    const prior = findEstablishedOrder(order, await dbServer.orderDb.getByPatient(order.patientId));
    if (prior) {
      const existing = await dbServer.pharmacyOrderDb.getByOrder(order.id);
      if (existing && existing.status !== "error") return { status: "already_dispatched" };
      const resolvedPatient = patient ?? await dbServer.patientDb.getById(order.patientId);
      if (!resolvedPatient) return { status: "missing_patient" };
      const product = await dbServer.productDb.getById(order.productId);
      if (!product || !product.isActive || product.slug === "retatrutide" || !product.doses.some(d => d.id === order.doseId)) return { status: "not_ready" };
      const pharmacy = await import("@/services/pharmacy");
      const notifications = await import("@/services/order-notifications");
      await dbServer.orderDb.update(order.id, { practiceQStatus: "skipped" });
      const pharmacyOrder = await pharmacy.createPharmacyOrder(order, { patient: resolvedPatient, product });
      await dbServer.pharmacyOrderDb.create(pharmacyOrder);
      await dbServer.orderDb.update(order.id, { status: "sent_to_pharmacy", pharmacyStatus: "submitted" });
      await notifications.sendOrderSentToPharmacyMessage(resolvedPatient, order.id).catch(() => {});
      await dbServer.integrationLogDb.create({
        id: generateId(), timestamp: new Date().toISOString(), integrationName: "system",
        action: "Established patient dispatched without repeat PracticeQ", orderId: order.id, patientId: order.patientId,
        status: "success", details: { source, priorOrderId: prior.id, pharmacyOrderId: pharmacyOrder.lifeFileOrderId },
      });
      return { status: "skipped_existing_patient" };
    }
  }

  if (!shouldRetryPracticeQCompletionAfterIdentityApproval(order)) {
    return { status: "not_ready" };
  }

  const job = await dbServer.practiceqAutomationJobDb.getByOrder(order.id).catch(() => null);
  if (job && (job.status === "completed" || order.practiceQStatus === "completed" || job.intakeId)) {
    return completePracticeQSession(job.id);
  }

  const resolvedPatient =
    patient ?? (await dbServer.patientDb.getById(order.patientId).catch(() => null)) ?? db.patientDb.getById(order.patientId);
  if (!resolvedPatient) return { status: "missing_patient" };

  const queueResult = await queuePracticeQAutomationForOrder({
    order,
    patient: resolvedPatient,
    source,
  });
  await wakeRemoteWorker().catch(() => undefined);
  return queueResult;
}
