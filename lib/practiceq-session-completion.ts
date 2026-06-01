import type { Order } from "@/types";
import * as dbServer from "@/lib/db.server";
import { getIdentityGate } from "@/lib/identity";
import { normalizeOrderForPharmacyDispatch } from "@/lib/pharmacy-dispatch";
import { logPhiAccess, logPhiDisclosure } from "@/lib/phi-audit";
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

async function purgeMissionChartPhi(order: Order) {
  const [answersDeleted, consentDeleted, mediaBytesPurged] = await Promise.all([
    dbServer.answerDb.deleteByOrder(order.id).catch(() => 0),
    dbServer.consentDb.deleteByOrder(order.id).catch(() => 0),
    dbServer.uploadDb.purgeBase64ByOrder(order.id).catch(() => 0),
  ]);

  await dbServer.integrationLogDb.create({
    id: `log_phi_purge_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    integrationName: "practiceq",
    action: "Local chart PHI purged after PracticeQ attachment",
    orderId: order.id,
    patientId: order.patientId,
    status: "success",
    details: {
      answersDeleted,
      consentDeleted,
      mediaBytesPurged,
      sourceOfTruth: "practiceq",
    },
  }).catch(() => null);

  logPhiAccess({
    action: "delete",
    resource: "questionnaire_answer",
    resourceId: order.id,
    patientId: order.patientId,
    orderId: order.id,
    actor: "practiceq-remote-worker",
    outcome: "success",
  });
  logPhiAccess({
    action: "delete",
    resource: "consent_record",
    resourceId: order.id,
    patientId: order.patientId,
    orderId: order.id,
    actor: "practiceq-remote-worker",
    outcome: "success",
  });
  logPhiAccess({
    action: "delete",
    resource: "upload",
    resourceId: order.id,
    patientId: order.patientId,
    orderId: order.id,
    actor: "practiceq-remote-worker",
    outcome: "success",
  });
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

async function attachMissionChartFiles(order: Order, linkedClientId?: string) {
  const clientId = linkedClientId ?? order.practiceqClientId;
  if (!clientId) return false;

  const [patient, answers, questions, consent, uploads, packet] = await Promise.all([
    dbServer.patientDb.getById(order.patientId).catch(() => null),
    dbServer.answerDb.getByOrder(order.id).catch(() => []),
    dbServer.questionDb.getAll().catch(() => []),
    dbServer.consentDb.getByOrder(order.id).catch(() => null),
    dbServer.uploadDb.getByOrder(order.id).catch(() => []),
    dbServer.practiceqPacketDb.getByOrder(order.id).catch(() => null),
  ]);
  if (!patient) return false;

  const files = await practiceq.uploadMissionChartFiles({
    clientId,
    order,
    patient,
    answers,
    questions,
    consent,
    uploads,
  }).catch(() => null);
  if (!files) return false;

  const previousPacketData = packet?.packetData;
  const sanitizedUploads = files.uploads ?? uploads.map((upload) => ({ ...upload, base64Data: "" }));
  const packetPatch = {
    packetData: {
      patientInfo: { id: patient.id },
      questionnaireAnswers: [],
      consentRecord: consent ? { id: consent.id } : {},
      uploads: sanitizedUploads,
      productRequested: previousPacketData?.productRequested ?? order.productId,
      doseSelected: previousPacketData?.doseSelected ?? order.doseId,
      practiceQAnswerFile: files.answerFile ?? previousPacketData?.practiceQAnswerFile,
      practiceQPdfFile: files.pdfFile ?? previousPacketData?.practiceQPdfFile,
      practiceQIdentityFiles: files.identityFiles?.length
        ? files.identityFiles
        : previousPacketData?.practiceQIdentityFiles,
    },
    status: "completed" as const,
    lastSyncAt: new Date().toISOString(),
  } satisfies Partial<import("@/types").PracticeQPacket>;

  if (packet) {
    await dbServer.practiceqPacketDb.update(packet.id, packetPatch).catch(() => null);
  } else {
    await dbServer.practiceqPacketDb.create({
      id: order.id,
      orderId: order.id,
      patientId: order.patientId,
      submittedAt: new Date().toISOString(),
      status: "completed",
      packetData: {
        patientInfo: { id: patient.id },
        questionnaireAnswers: [],
        consentRecord: consent ? { id: consent.id } : {},
        uploads: sanitizedUploads,
        practiceQAnswerFile: files.answerFile,
        practiceQPdfFile: files.pdfFile,
        practiceQIdentityFiles: files.identityFiles,
        productRequested: order.productId,
        doseSelected: order.doseId,
      },
    }).catch(() => null);
  }

  if (files.answerFile && files.pdfFile) {
    await purgeMissionChartPhi(order);
  }
  return true;
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
  const linkedIntake = await linkLatestPracticeQIntake(jobId, dispatchOrder).catch(() => null);
  const dispatchAnswers = await dbServer.answerDb.getByOrder(dispatchOrder.id).catch(() => []);
  await attachMissionChartFiles(dispatchOrder, linkedIntake?.clientId).catch(() => null);

  if (!canTryPharmacyDispatch(dispatchOrder)) return { status: "waiting_for_identity" };

  const [patient, product, packet, existingPharmacyOrder] = await Promise.all([
    dbServer.patientDb.getById(dispatchOrder.patientId).catch(() => null),
    dbServer.productDb.getById(dispatchOrder.productId).catch(() => null),
    dbServer.practiceqPacketDb.getByOrder(dispatchOrder.id).catch(() => null),
    dbServer.pharmacyOrderDb.getByOrder(dispatchOrder.id).catch(() => null),
  ]);
  if (existingPharmacyOrder) return { status: "already_dispatched" };

  const packetDose = typeof packet?.packetData?.doseSelected === "string" ? packet.packetData.doseSelected : "";
  const normalized = normalizeOrderForPharmacyDispatch(dispatchOrder, product, [packetDose, ...answerHints(dispatchAnswers)]);
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
    const provider = pharmacy.getPharmacyProvider();
    await dbServer.integrationLogDb.create({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      integrationName: provider === "appsheet" ? "appsheet" : "lifefile",
      action: provider === "lifefile"
        ? "Pharmacy order submitted to LifeFile"
        : "Pharmacy order submitted",
      orderId: dispatchOrder.id,
      patientId: dispatchOrder.patientId,
      status: "success",
      details: {
        lifeFileOrderId: pharmacyOrder.lifeFileOrderId,
        provider,
        environment: process.env.LIFEFILE_ENVIRONMENT ?? "",
      },
    }).catch(() => null);
    await spruceServer.sendMessage(patient, "order_sent_to_pharmacy", { orderId: dispatchOrder.id }).catch(() => null);
    logPhiDisclosure(dispatchOrder.patientId, dispatchOrder.id, provider, "practiceq-remote-worker");
    return { status: "sent_to_pharmacy", pharmacyOrderId: pharmacyOrder.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await dbServer.orderDb.update(dispatchOrder.id, { pharmacyStatus: "error" }).catch(() => null);
    logPhiDisclosure(dispatchOrder.patientId, dispatchOrder.id, pharmacy.getPharmacyProvider(), "practiceq-remote-worker", "error", message);
    return { status: "pharmacy_error", error: message };
  }
}
