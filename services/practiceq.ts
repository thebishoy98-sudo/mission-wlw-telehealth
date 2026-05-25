/**
 * PracticeQ integration service.
 *
 * Mock mode keeps the existing local packet behavior for development/tests.
 * Live mode posts the intake packet to the configured PracticeQ endpoint and
 * fails clearly when credentials or API configuration are missing.
 */

import * as Types from "@/types";
import * as db from "@/lib/db";
import { serviceConfig } from "@/lib/service-config";
import { generateId } from "@/lib/utils";

type PacketOverrides = {
  patient?: Types.Patient | null;
  product?: Types.Product | null;
};

type PracticeQApiResponse = {
  Id?: string;
  Status?: string;
  ClientId?: number;
  id?: string;
  packetId?: string;
  status?: string;
  requestId?: string;
};

const normalizeEndpoint = () => {
  if (serviceConfig.practiceq.intakeEndpoint) return serviceConfig.practiceq.intakeEndpoint;
  return `${serviceConfig.practiceq.baseUrl.replace(/\/$/, "")}/intakes/send`;
};

export const submitIntakePacket = async (
  order: Types.Order,
  overrides?: PacketOverrides
): Promise<Types.PracticeQPacket> => {
  const patient = overrides?.patient ?? db.patientDb.getById(order.patientId);
  const product = overrides?.product ?? db.productDb.getById(order.productId);
  const answers = await getAnswers(order.id);
  const consent = await getConsent(order.id);
  const uploads = await getUploads(order.id);

  if (!patient || !product) {
    throw new Error("Patient or product not found");
  }

  const packet = buildPacket(order, patient, product, answers, consent, uploads);

  if (serviceConfig.practiceq.useMock) {
    const saved = persistPacket(packet);
    logPacketEvent("Intake packet submitted", saved, patient, product, {
      mode: "mock",
    });
    return saved;
  }

  if (!serviceConfig.practiceq.apiKey) {
    const failed = persistPacket({ ...packet, status: "error", lastError: "PRACTICEQ_API_KEY is not configured" });
    logPacketEvent("PracticeQ intake submission failed", failed, patient, product, {
      mode: "live",
      reason: "missing_api_key",
    }, "error", failed.lastError);
    throw new Error("PRACTICEQ_API_KEY is required when USE_REAL_PRACTICEQ=true");
  }

  const endpoint = normalizeEndpoint();
  try {
    const client = await savePracticeQClient(patient, order);
    if (!serviceConfig.practiceq.questionnaireId) {
      throw new Error("PRACTICEQ_QUESTIONNAIRE_ID is required to send an intake package in live PracticeQ mode");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-Auth-Key": serviceConfig.practiceq.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        QuestionnaireId: serviceConfig.practiceq.questionnaireId,
        ClientId: client.ClientId,
        ClientName: `${patient.firstName} ${patient.lastName}`,
        ClientEmail: patient.email,
        ClientPhone: patient.phone,
        ExternalClientId: order.id,
      }),
    });

    const result = await parsePracticeQResponse(response);
    if (!response.ok) {
      const message = result ? JSON.stringify(result) : `HTTP ${response.status}`;
      throw new Error(`PracticeQ API error: ${message}`);
    }

    const saved = persistPacket({
      ...packet,
      id: result?.Id ?? result?.packetId ?? result?.id ?? packet.id,
      status: result?.Status === "Completed" || result?.status === "completed" ? "completed" : "submitted",
      lastSyncAt: new Date().toISOString(),
    });
    logPacketEvent("Intake packet submitted", saved, patient, product, {
      mode: "live",
      endpoint,
      clientId: client.ClientId,
      requestId: result?.requestId,
    });
    return saved;
  } catch (error) {
    const message = (error as Error).message;
    const failed = persistPacket({ ...packet, status: "error", lastError: message });
    logPacketEvent("PracticeQ intake submission failed", failed, patient, product, {
      mode: "live",
      endpoint,
    }, "error", message);
    throw error;
  }
};

export const getPacketStatus = (
  orderId: string
): { status: string; lastSync: string; errors?: string } => {
  const packet = db.practiceqDb.getByOrder(orderId);

  if (!packet) {
    return {
      status: "not_found",
      lastSync: new Date().toISOString(),
      errors: "Packet not found",
    };
  }

  if (serviceConfig.practiceq.useMock && packet.status === "submitted") {
    setTimeout(() => {
      db.practiceqDb.update(packet.id, { status: "completed", lastSyncAt: new Date().toISOString() });
      updateServerPacket(packet.id, { status: "completed", lastSyncAt: new Date().toISOString() });
    }, 3000);
  }

  return {
    status: packet.status,
    lastSync: packet.lastSyncAt || new Date().toISOString(),
    errors: packet.lastError,
  };
};

export const simulateProviderReview = (orderId: string): void => {
  const packet = db.practiceqDb.getByOrder(orderId);
  if (packet) {
    const update = {
      status: "completed" as const,
      lastSyncAt: new Date().toISOString(),
    };
    db.practiceqDb.update(packet.id, update);
    updateServerPacket(packet.id, update);
  }
};

function buildPacket(
  order: Types.Order,
  patient: Types.Patient,
  product: Types.Product,
  answers: Types.QuestionnaireAnswer[],
  consent: Types.ConsentRecord | null,
  uploads: Types.Upload[]
): Types.PracticeQPacket {
  return {
    id: generateId(),
    orderId: order.id,
    patientId: order.patientId,
    submittedAt: new Date().toISOString(),
    status: "submitted",
    lastSyncAt: new Date().toISOString(),
    packetData: {
      patientInfo: patient,
      questionnaireAnswers: answers,
      consentRecord: consent || {},
      uploads,
      productRequested: product.name,
      doseSelected:
        product.doses.find((d) => d.id === order.doseId)?.label ||
        "Unknown",
    },
  };
}

function persistPacket(packet: Types.PracticeQPacket): Types.PracticeQPacket {
  const existing = db.practiceqDb.getAll().find((candidate) => candidate.id === packet.id);
  const saved = existing ? db.practiceqDb.update(packet.id, packet) ?? packet : db.practiceqDb.create(packet);
  persistServerPacket(saved);
  return saved;
}

async function parsePracticeQResponse(response: Response): Promise<PracticeQApiResponse | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as PracticeQApiResponse;
  } catch {
    return { status: text };
  }
}

async function savePracticeQClient(patient: Types.Patient, order: Types.Order): Promise<PracticeQApiResponse> {
  const response = await fetch(`${serviceConfig.practiceq.baseUrl.replace(/\/$/, "")}/clients`, {
    method: "POST",
    headers: {
      "X-Auth-Key": serviceConfig.practiceq.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      FirstName: patient.firstName,
      LastName: patient.lastName,
      Name: `${patient.firstName} ${patient.lastName}`,
      Email: patient.email,
      Phone: patient.phone,
      DateOfBirth: Date.parse(`${patient.dateOfBirth}T00:00:00Z`),
      Gender: patient.gender,
      StreetAddress: patient.address.street1,
      UnitNumber: patient.address.street2 ?? "",
      City: patient.address.city,
      StateShort: patient.address.state,
      PostalCode: patient.address.zipCode,
      Country: patient.address.country,
      ExternalClientId: order.id,
      AdditionalInformation: `Mission WLW order ${order.id}. Product ${order.productId}, dose ${order.doseId}.`,
    }),
  });
  const result = await parsePracticeQResponse(response);
  if (!response.ok) {
    const message = result ? JSON.stringify(result) : `HTTP ${response.status}`;
    throw new Error(`PracticeQ client sync failed: ${message}`);
  }
  return result ?? {};
}

function logPacketEvent(
  action: string,
  packet: Types.PracticeQPacket,
  patient: Types.Patient,
  product: Types.Product,
  details: Record<string, unknown>,
  status: "success" | "error" = "success",
  error?: string
) {
  const log = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    integrationName: "practiceq" as const,
    action,
    orderId: packet.orderId,
    patientId: packet.patientId,
    status,
    details: {
      packetId: packet.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      productName: product.name,
      ...details,
    },
    error,
  };
  db.integrationLogDb.create(log);
  persistServerLog(log);
}

const hasServerDb = () => !!(process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL);

async function getServerDb() {
  if (!hasServerDb()) return null;
  return import("@/lib/db.server");
}

async function getAnswers(orderId: string): Promise<Types.QuestionnaireAnswer[]> {
  const serverDb = await getServerDb();
  if (!serverDb) return db.answerDb.getByOrder(orderId);
  return serverDb.answerDb.getByOrder(orderId).catch(() => db.answerDb.getByOrder(orderId));
}

async function getConsent(orderId: string): Promise<Types.ConsentRecord | null> {
  const serverDb = await getServerDb();
  if (!serverDb) return db.consentDb.getByOrder(orderId);
  return serverDb.consentDb.getByOrder(orderId).catch(() => db.consentDb.getByOrder(orderId));
}

async function getUploads(orderId: string): Promise<Types.Upload[]> {
  const serverDb = await getServerDb();
  if (!serverDb) return db.uploadDb.getByOrder(orderId);
  return serverDb.uploadDb.getByOrder(orderId).catch(() => db.uploadDb.getByOrder(orderId));
}

function persistServerPacket(packet: Types.PracticeQPacket) {
  getServerDb()
    .then((serverDb) => serverDb?.practiceqPacketDb.create(packet))
    .catch(() => {});
}

function updateServerPacket(id: string, data: Partial<Types.PracticeQPacket>) {
  getServerDb()
    .then((serverDb) => serverDb?.practiceqPacketDb.update(id, data))
    .catch(() => {});
}

function persistServerLog(log: Types.IntegrationLog) {
  getServerDb()
    .then((serverDb) => serverDb?.integrationLogDb.create(log))
    .catch(() => {});
}
