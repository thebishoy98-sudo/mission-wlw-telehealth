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
  [key: string]: unknown;
};

type PracticeQIntake = PracticeQApiResponse & {
  Id?: string;
  ClientId?: number | string;
  Status?: string;
  QuestionnaireName?: string;
  DateSubmitted?: number | string;
  Questions?: unknown[];
  questions?: unknown[];
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

export function buildPracticeQUrl(path: string): string {
  const normalized = path.startsWith("/") || path.startsWith("#") ? path : `/${path}`;
  return `https://intakeq.com/${normalized}`;
}

export async function getIntakeById(intakeId: string): Promise<PracticeQIntake | null> {
  if (!serviceConfig.practiceq.apiKey) return null;
  const response = await fetch(`${pqBase()}/intakes/${encodeURIComponent(intakeId)}`, {
    headers: pqHeaders(),
  });
  if (!response.ok) return null;
  return parsePracticeQResponse(response) as Promise<PracticeQIntake | null>;
}

export async function getPracticeQMirrorForOrder(
  order: Types.Order,
  packet?: Types.PracticeQPacket | null
): Promise<Types.PracticeQMirror> {
  const clientId = order.practiceqClientId;
  const intakeId = packet?.id;
  const unavailable = (reason: string): Types.PracticeQMirror => ({
    available: false,
    reason,
    clientId: clientId ? String(clientId) : undefined,
    intakeId,
    answers: [],
  });

  if (!serviceConfig.practiceq.apiKey) {
    return unavailable("PRACTICEQ_API_KEY is not configured");
  }

  if (!clientId && !intakeId) {
    return unavailable("No PracticeQ client or intake id is linked to this order");
  }

  const [client, intake] = await Promise.all([
    clientId ? getClientById(clientId).catch(() => null) : Promise.resolve(null),
    intakeId ? getIntakeById(intakeId).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    available: true,
    clientId: clientId ? String(clientId) : intake?.ClientId ? String(intake.ClientId) : undefined,
    intakeId: intake?.Id ? String(intake.Id) : intakeId,
    status: intake?.Status ?? packet?.status,
    questionnaireName: intake?.QuestionnaireName,
    submittedAt: normalizePracticeQDate(intake?.DateSubmitted) ?? packet?.submittedAt,
    clientName: client?.Name ?? ([client?.FirstName, client?.LastName].filter(Boolean).join(" ") || undefined),
    clientEmail: client?.Email,
    practiceQUrl: intakeId ? buildPracticeQUrl(`#/history/${intakeId}`) : undefined,
    answers: normalizePracticeQAnswers(intake),
  };
}

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

function normalizePracticeQDate(value: unknown): string | undefined {
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string" && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return new Date(asNumber).toISOString();
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return undefined;
}

function normalizePracticeQAnswers(intake: PracticeQIntake | null): Types.PracticeQMirrorAnswer[] {
  const questions = intake?.Questions ?? intake?.questions ?? [];
  if (!Array.isArray(questions)) return [];

  return questions
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      const question = firstString(entry.Text, entry.QuestionText, entry.Question, entry.Label, entry.Name);
      const answer = firstString(entry.Answer, entry.Value, entry.AnswerText, entry.Response);
      if (!question && !answer) return null;
      return {
        question: question || "Question",
        answer: answer || "",
      };
    })
    .filter((answer): answer is Types.PracticeQMirrorAnswer => Boolean(answer));
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  }
  return "";
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

// ── PracticeQ Client API (Patient PHI store) ──────────────────────────────────

type PracticeQClient = {
  ClientId: number;
  Name?: string;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  Phone?: string;
  DateOfBirth?: number; // Unix ms
  Gender?: string;
  Address?: string;
  City?: string;
  StateShort?: string;
  PostalCode?: string;
  Country?: string;
};

function pqHeaders() {
  return {
    "X-Auth-Key": serviceConfig.practiceq.apiKey,
    "Content-Type": "application/json",
  };
}

const pqBase = () => serviceConfig.practiceq.baseUrl.replace(/\/$/, "");

/** Fetch a single PracticeQ client by their numeric ClientId */
export async function getClientById(clientId: string | number): Promise<PracticeQClient | null> {
  if (!serviceConfig.practiceq.apiKey) return null;
  const res = await fetch(`${pqBase()}/clients/${clientId}`, {
    headers: pqHeaders(),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

/** Find a PracticeQ client by email address */
export async function findClientByEmail(email: string): Promise<PracticeQClient | null> {
  if (!serviceConfig.practiceq.apiKey) return null;
  const res = await fetch(`${pqBase()}/clients?search=${encodeURIComponent(email)}`, {
    headers: pqHeaders(),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const clients: PracticeQClient[] = Array.isArray(data) ? data : (data?.Clients ?? data?.clients ?? []);
  return clients.find((c) => c.Email?.toLowerCase() === email.toLowerCase()) ?? null;
}

/** Create or reuse a PracticeQ client for this patient. Returns the PracticeQ ClientId as string. */
export async function createOrFindPracticeQClient(
  patient: Types.Patient,
  orderId: string
): Promise<string | null> {
  if (!serviceConfig.practiceq.apiKey) return null;

  // Try to find existing client by email first
  const existing = await findClientByEmail(patient.email).catch(() => null);
  if (existing?.ClientId) return String(existing.ClientId);

  // Create new client
  const result = await savePracticeQClient(patient, { id: orderId } as Types.Order).catch(() => null);
  return result?.ClientId ? String(result.ClientId) : null;
}

/** Map a PracticeQ client record to our Patient shape */
export function practiceQClientToPatient(client: PracticeQClient, fallbackId: string): Types.Patient {
  const name = (client.FirstName ?? client.Name ?? "").split(" ");
  const firstName = client.FirstName ?? name[0] ?? "";
  const lastName = client.LastName ?? name.slice(1).join(" ") ?? "";
  let dateOfBirth = "";
  if (client.DateOfBirth) {
    const d = new Date(client.DateOfBirth);
    dateOfBirth = d.toISOString().split("T")[0];
  }
  return {
    id: fallbackId,
    firstName,
    lastName,
    dateOfBirth,
    gender: (client.Gender?.toLowerCase() ?? "other") as any,
    phone: client.Phone ?? "",
    email: client.Email ?? "",
    address: {
      street1: client.Address ?? "",
      city: client.City ?? "",
      state: client.StateShort ?? "",
      zipCode: client.PostalCode ?? "",
      country: client.Country ?? "US",
    },
    shippingAddress: {
      street1: client.Address ?? "",
      city: client.City ?? "",
      state: client.StateShort ?? "",
      zipCode: client.PostalCode ?? "",
      country: client.Country ?? "US",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
