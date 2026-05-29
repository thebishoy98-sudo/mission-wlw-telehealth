import type { Order } from "@/types";
import * as dbServer from "@/lib/db.server";
import { getIdentityGate } from "@/lib/identity";
import { normalizeOrderForPharmacyDispatch } from "@/lib/pharmacy-dispatch";
import { logPhiDisclosure } from "@/lib/phi-audit";
import * as pharmacy from "@/services/pharmacy";
import * as practiceq from "@/services/practiceq";
import * as spruceServer from "@/services/spruce.server";

type CompletionResult =
  | { status: "missing_job" | "missing_order" | "waiting_for_identity" | "already_dispatched" }
  | { status: "sent_to_pharmacy"; pharmacyOrderId: string }
  | { status: "pharmacy_error"; error: string };

function answerHints(answers: Awaited<ReturnType<typeof dbServer.answerDb.getByOrder>>): string[] {
  return answers.map((answer) => answer.answer).filter((answer) => answer.trim().length > 0);
}

function canTryPharmacyDispatch(order: Order): boolean {
  return getIdentityGate(order).canDispatch && (order.pharmacyStatus === "draft" || order.pharmacyStatus === "error");
}

async function linkLatestPracticeQIntake(jobId: string, order: Order) {
  const patient = await dbServer.patientDb.getById(order.patientId).catch(() => null);
  if (!patient?.email) return null;

  const feed = await practiceq.getIntakeSummaryFeed({ client: patient.email }).catch(() => null);
  const match = feed?.all.find((form) =>
    form.clientEmail?.toLowerCase() === patient.email.toLowerCase() ||
    form.clientName?.toLowerCase() === `${patient.firstName} ${patient.lastName}`.trim().toLowerCase()
  );
  if (!match) return null;

  await dbServer.practiceqAutomationJobDb.update(jobId, { intakeId: match.id }).catch(() => null);
  await dbServer.orderDb.update(order.id, {
    practiceqClientId: match.clientId,
    practiceQStatus: "completed",
  }).catch(() => null);

  return match;
}

export async function completePracticeQSession(jobId: string): Promise<CompletionResult> {
  const job = await dbServer.practiceqAutomationJobDb.update(jobId, { status: "completed" }).catch(() => null);
  if (!job) return { status: "missing_job" };

  const order = await dbServer.orderDb.getById(job.orderId).catch(() => null);
  if (!order) return { status: "missing_order" };

  const completedOrder = await dbServer.orderDb
    .update(order.id, { practiceQStatus: "completed" })
    .catch(() => null);
  const dispatchOrder = completedOrder ?? { ...order, practiceQStatus: "completed" as const };
  await linkLatestPracticeQIntake(jobId, dispatchOrder).catch(() => null);

  if (!canTryPharmacyDispatch(dispatchOrder)) return { status: "waiting_for_identity" };

  const [patient, product, answers, existingPharmacyOrder] = await Promise.all([
    dbServer.patientDb.getById(dispatchOrder.patientId).catch(() => null),
    dbServer.productDb.getById(dispatchOrder.productId).catch(() => null),
    dbServer.answerDb.getByOrder(dispatchOrder.id).catch(() => []),
    dbServer.pharmacyOrderDb.getByOrder(dispatchOrder.id).catch(() => null),
  ]);
  if (existingPharmacyOrder) return { status: "already_dispatched" };

  const normalized = normalizeOrderForPharmacyDispatch(dispatchOrder, product, answerHints(answers));
  if (!patient || !normalized.normalizedOrder) {
    const reason = !patient ? "missing patient" : normalized.reason ?? "missing pharmacy order data";
    await dbServer.orderDb.update(dispatchOrder.id, { pharmacyStatus: "error" }).catch(() => null);
    logPhiDisclosure(dispatchOrder.patientId, dispatchOrder.id, pharmacy.getPharmacyProvider(), "practiceq-remote-worker", "error", reason);
    return { status: "pharmacy_error", error: reason };
  }

  try {
    const pharmacyOrder = await pharmacy.createPharmacyOrder(normalized.normalizedOrder, { patient, product });
    await dbServer.pharmacyOrderDb.create(pharmacyOrder).catch(() => null);
    await dbServer.orderDb
      .update(dispatchOrder.id, {
        status: "sent_to_pharmacy",
        pharmacyStatus: "submitted",
      })
      .catch(() => null);
    await spruceServer.sendMessage(patient, "order_sent_to_pharmacy", { orderId: dispatchOrder.id }).catch(() => null);
    logPhiDisclosure(dispatchOrder.patientId, dispatchOrder.id, pharmacy.getPharmacyProvider(), "practiceq-remote-worker");
    return { status: "sent_to_pharmacy", pharmacyOrderId: pharmacyOrder.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await dbServer.orderDb.update(dispatchOrder.id, { pharmacyStatus: "error" }).catch(() => null);
    logPhiDisclosure(dispatchOrder.patientId, dispatchOrder.id, pharmacy.getPharmacyProvider(), "practiceq-remote-worker", "error", message);
    return { status: "pharmacy_error", error: message };
  }
}
