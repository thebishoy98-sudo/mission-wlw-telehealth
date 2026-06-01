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
import { buildConsentCertificate } from "@/lib/consent";
import { dataUrlToFileParts } from "@/lib/data-url";
import { loadIdentityMedia } from "@/services/identity-storage";

type PacketOverrides = {
  patient?: Types.Patient | null;
  product?: Types.Product | null;
  answers?: Types.QuestionnaireAnswer[];
  questions?: Types.Question[];
  consent?: Types.ConsentRecord | null;
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

type PracticeQIntakeSummary = {
  Id?: string;
  ClientName?: string;
  ClientEmail?: string;
  ClientId?: number | string;
  Status?: string;
  DateCreated?: number | string | null;
  DateSubmitted?: number | string | null;
  QuestionnaireName?: string;
  QuestionnaireId?: string;
  PractitionerName?: string;
  ExternalClientId?: string;
  [key: string]: unknown;
};

type PracticeQFileUploadInput = {
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

type PracticeQFileUploadResult = {
  id: string;
  raw: PracticeQApiResponse | null;
};

type PracticeQFileSummary = {
  id: string;
  filename?: string;
  raw: Record<string, unknown>;
};


export const submitIntakePacket = async (
  order: Types.Order,
  overrides?: PacketOverrides
): Promise<Types.PracticeQPacket> => {
  const patient = overrides?.patient ?? db.patientDb.getById(order.patientId);
  const product = overrides?.product ?? db.productDb.getById(order.productId);
  const answers = overrides?.answers ?? await getAnswers(order.id);
  const questions = overrides?.questions ?? await getQuestions();
  const consent = overrides?.consent ?? await getConsent(order.id);
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

  try {
    const client = await savePracticeQClient(patient, order);
    const clientId = client.ClientId as string | number;

    // 1. Look for an intake the patient already completed (e.g. via the marketing site embed).
    //    Never send a second questionnaire email — the patient consented in IntakeQ already.
    const feed = await getIntakeSummaryFeed({ client: String(clientId) }).catch(() => null);
    const existingIntake =
      feed?.all.find((f) => f.externalClientId === order.id) ??
      feed?.completed[0] ??
      feed?.all[0] ??
      null;

    let resolvedIntakeId: string | undefined;
    let resolvedStatus: "submitted" | "completed" = "submitted";

    if (existingIntake) {
      // Patient already has an intake — link it; don't create another one.
      resolvedIntakeId = existingIntake.id;
      resolvedStatus = existingIntake.status?.toLowerCase() === "completed" ? "completed" : "submitted";
    } else if (serviceConfig.practiceq.questionnaireId) {
      // No existing intake: submit answers directly (POST /intakes) — no email to patient.
      const directPayload: Record<string, unknown> = {
        QuestionnaireId: serviceConfig.practiceq.questionnaireId,
        ClientId: clientId,
        ClientName: `${patient.firstName} ${patient.lastName}`,
        ClientEmail: patient.email,
        ClientPhone: patient.phone,
        ExternalClientId: order.id,
        Status: "Completed",
      };

      // Map our answers onto the questionnaire questions.
      const pqQuestions = await getPracticeQQuestionnaire().catch(() => null);
      if (pqQuestions && answers.length) {
        const answerById = new Map(answers.map((a) => [a.questionId, a.answer]));
        const answerByText = new Map(
          answers
            .map((a) => {
              const q = questions.find((q) => q.id === a.questionId);
              return q ? [normalizeQuestionText(q.text), a.answer] as const : null;
            })
            .filter((entry): entry is [string, string] => entry !== null && Boolean(entry[1]))
        );
        const profileAnswers = buildPracticeQProfileAnswers(patient);
        directPayload.Questions = pqQuestions.map((q) => ({
          Id: q.id,
          Text: q.text,
          Answer:
            answerById.get(q.id) ??
            findPracticeQAnswer(q.text, answerByText, profileAnswers) ??
            "",
        }));
      }

      const directRes = await fetch(`${pqBase()}/intakes`, {
        method: "POST",
        headers: pqHeaders(),
        body: JSON.stringify(directPayload),
      });
      const directResult = await parsePracticeQResponse(directRes) as PracticeQIntake | null;
      if (!directRes.ok) {
        const message = directResult ? JSON.stringify(directResult) : `HTTP ${directRes.status}`;
        throw new Error(`PracticeQ direct intake submit failed: ${message}`);
      }
      resolvedIntakeId = directResult?.Id ?? directResult?.id ?? directResult?.packetId;
      resolvedStatus = "completed";
    }

    const practiceQFiles = answers.length
      ? await uploadMissionIntakeFiles(clientId, order, patient, answers, questions, consent)
      : null;

    const saved = persistPacket({
      ...packet,
      id: resolvedIntakeId ?? packet.id,
      status: resolvedStatus,
      lastSyncAt: new Date().toISOString(),
      packetData: {
        ...packet.packetData,
        practiceQAnswerFile: practiceQFiles?.answerFile ?? undefined,
        practiceQPdfFile: practiceQFiles?.pdfFile ?? undefined,
      },
    });
    logPacketEvent("Intake packet submitted", saved, patient, product, {
      mode: "live",
      clientId,
      existingIntakeLinked: Boolean(existingIntake),
      intakeId: resolvedIntakeId,
      answersSubmitted: answers.length,
      answerFileId: practiceQFiles?.answerFile.fileId,
      pdfFileId: practiceQFiles?.pdfFile.fileId,
    });
    return saved;
  } catch (error) {
    const message = (error as Error).message;
    const failed = persistPacket({ ...packet, status: "error", lastError: message });
    logPacketEvent("PracticeQ intake submission failed", failed, patient, product, {
      mode: "live",
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

export function buildPracticeQClientFilesUrl(clientId: string | number): string {
  return buildPracticeQUrl(`#/client/${encodeURIComponent(String(clientId))}?tab=files`);
}

// ── PracticeQ questionnaire structure ─────────────────────────────────────────

type PracticeQRawQuestion = {
  Id?: string; id?: string;
  Text?: string; QuestionText?: string; Label?: string;
  Type?: string; QuestionType?: string;
  Required?: boolean; IsRequired?: boolean;
  DisplayOrder?: number; Order?: number;
  Options?: Array<string | { Text?: string; Value?: string; Label?: string }>;
};

function mapPracticeQType(rawType: string): Types.Question["type"] {
  const t = rawType.toLowerCase();
  if (t.includes("textarea") || t.includes("longtext") || t.includes("multiline") || t.includes("paragraph")) return "textarea";
  if (t.includes("radio") || t.includes("yesno") || t.includes("boolean") || t.includes("single")) return "radio";
  if (t.includes("check") || t.includes("multiple")) return "checkbox";
  if (t.includes("select") || t.includes("dropdown")) return "select";
  return "text";
}

function mapPracticeQOptions(raw: PracticeQRawQuestion["Options"]): string[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((o) => typeof o === "string" ? o : String(o.Text ?? o.Label ?? o.Value ?? "")).filter(Boolean);
}

function mapPracticeQQuestions(rawList: unknown[]): Types.Question[] {
  const out: Types.Question[] = [];
  rawList
    .filter((q): q is PracticeQRawQuestion => !!q && typeof q === "object")
    .forEach((q, idx) => {
      const id = String(q.Id ?? q.id ?? "");
      const text = String(q.Text ?? q.QuestionText ?? q.Label ?? "");
      if (!id || !text) return;
      const question: Types.Question = {
        id,
        text,
        type: mapPracticeQType(String(q.Type ?? q.QuestionType ?? "text")),
        required: Boolean(q.Required ?? q.IsRequired),
        displayOrder: Number(q.DisplayOrder ?? q.Order ?? idx),
        category: "screening",
      };
      const opts = mapPracticeQOptions(q.Options);
      if (opts) question.options = opts;
      out.push(question);
    });
  return out;
}

/** In-process cache — refreshed every 5 min to avoid hammering PracticeQ on every page load. */
let _pqQuestionnaireCache: { ts: number; questions: Types.Question[] } | null = null;
const PQ_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Returns PracticeQ question IDs for our local question IDs by pulling questions
 * from the most recent completed intake for this questionnaire.
 * IntakeQ's /questionnaires/{id} endpoint does not return questions (it returns HTML),
 * so we derive the structure from a real intake instead.
 * Returns null in mock mode or when credentials/questionnaire ID are absent.
 */
export async function getPracticeQQuestionnaire(): Promise<Types.Question[] | null> {
  if (serviceConfig.practiceq.useMock || !serviceConfig.practiceq.apiKey || !serviceConfig.practiceq.questionnaireId) {
    return null;
  }
  if (_pqQuestionnaireCache && Date.now() - _pqQuestionnaireCache.ts < PQ_CACHE_TTL_MS) {
    return _pqQuestionnaireCache.questions;
  }
  // Fetch the most recent intake for this questionnaire to get the question structure
  const summaryRes = await fetchPracticeQWithRetry(
    `${pqBase()}/intakes/summary?questionnaireId=${encodeURIComponent(serviceConfig.practiceq.questionnaireId)}&page=1`,
    { headers: pqHeaders() }
  );
  if (!summaryRes.ok) return null;
  const summaryData = await summaryRes.json().catch(() => null) as unknown[] | null;
  const latestIntakeId = Array.isArray(summaryData) && summaryData.length > 0
    ? (summaryData[0] as Record<string, unknown>)?.Id as string | undefined
    : undefined;
  if (!latestIntakeId) return null;

  const intakeRes = await fetchPracticeQWithRetry(`${pqBase()}/intakes/${encodeURIComponent(latestIntakeId)}`, { headers: pqHeaders() });
  if (!intakeRes.ok) return null;
  const intake = await intakeRes.json().catch(() => null) as Record<string, unknown> | null;
  const rawQuestions = Array.isArray(intake?.Questions) ? intake.Questions as unknown[] : [];
  const questions = mapPracticeQQuestions(rawQuestions);
  if (questions.length > 0) _pqQuestionnaireCache = { ts: Date.now(), questions };
  return questions.length > 0 ? questions : null;
}

export async function getIntakeById(intakeId: string): Promise<PracticeQIntake | null> {
  if (!serviceConfig.practiceq.apiKey) return null;
  const response = await fetchPracticeQWithRetry(`${pqBase()}/intakes/${encodeURIComponent(intakeId)}`, {
    headers: pqHeaders(),
  });
  if (!response.ok) return null;
  return parsePracticeQResponse(response) as Promise<PracticeQIntake | null>;
}

export async function getPracticeQFormDetail(intakeId: string): Promise<Types.PracticeQMirror> {
  const unavailable = (reason: string): Types.PracticeQMirror => ({
    available: false,
    reason,
    intakeId,
    answers: [],
    practiceQUrl: buildPracticeQUrl(`#/history/${intakeId}`),
  });

  if (!serviceConfig.practiceq.apiKey) {
    return unavailable("PRACTICEQ_API_KEY is not configured");
  }

  const intake = await getIntakeById(intakeId).catch(() => null);
  if (!intake) {
    return unavailable("PracticeQ intake could not be loaded");
  }

  return {
    available: true,
    intakeId: intake.Id ? String(intake.Id) : intakeId,
    clientId: intake.ClientId === undefined || intake.ClientId === null ? undefined : String(intake.ClientId),
    status: intake.Status,
    questionnaireName: intake.QuestionnaireName,
    submittedAt: normalizePracticeQDate(intake.DateSubmitted),
    clientName: firstString(intake.ClientName),
    clientEmail: firstString(intake.ClientEmail),
    practiceQUrl: buildPracticeQUrl(`#/history/${intake.Id ?? intakeId}`),
    answers: normalizePracticeQAnswers(intake),
  };
}

export async function getPracticeQMirrorForOrder(
  order: Types.Order,
  packet?: Types.PracticeQPacket | null,
  linkedIntakeId?: string
): Promise<Types.PracticeQMirror> {
  const clientId = order.practiceqClientId;
  // Locally generated packet rows often use the Mission order id as their id.
  // Prefer the actual IntakeQ/PracticeQ intake id recorded on the automation job
  // so chart rendering does not depend on a secondary summary-feed recovery.
  let intakeId = linkedIntakeId ?? (packet?.id && packet.id !== order.id ? packet.id : undefined);
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

  let [client, intake] = await Promise.all([
    clientId ? getClientById(clientId).catch(() => null) : Promise.resolve(null),
    intakeId ? getIntakeById(intakeId).catch(() => null) : Promise.resolve(null),
  ]);

  let answers = normalizePracticeQAnswers(intake);
  const shouldRecoverIntake = clientId && (!intake || answers.length === 0 || packet?.status === "error");
  if (shouldRecoverIntake) {
    const findMatch = (feed: Types.PracticeQFormFeed | null | undefined) =>
      feed?.all.find((form) => form.externalClientId === order.id) ??
      feed?.all.find((form) => form.clientId === String(clientId) && form.id !== intakeId);
    const filteredFeed = await getIntakeSummaryFeed({ client: String(clientId) }).catch(() => null);
    let matchedSummary = findMatch(filteredFeed);
    if (!matchedSummary) {
      const unfilteredFeed = await getIntakeSummaryFeed().catch(() => null);
      matchedSummary = findMatch(unfilteredFeed);
    }
    if (matchedSummary) {
      const recoveredIntake = await getIntakeById(matchedSummary.id).catch(() => null);
      const recoveredAnswers = normalizePracticeQAnswers(recoveredIntake);
      if (recoveredIntake && (recoveredAnswers.length > 0 || !intake)) {
        intakeId = matchedSummary.id;
        intake = recoveredIntake;
        answers = recoveredAnswers;
      }
    }
  }

  return {
    available: true,
    clientId: clientId ? String(clientId) : intake?.ClientId ? String(intake.ClientId) : undefined,
    intakeId: intake?.Id ? String(intake.Id) : intakeId,
    status: intake?.Status ?? packet?.status,
    questionnaireName: intake?.QuestionnaireName,
    submittedAt: normalizePracticeQDate(intake?.DateSubmitted) ?? packet?.submittedAt,
    clientName: client?.Name ?? ([client?.FirstName, client?.LastName].filter(Boolean).join(" ") || undefined),
    clientEmail: client?.Email,
    practiceQUrl: clientId
      ? buildPracticeQClientFilesUrl(clientId)
      : intakeId ? buildPracticeQUrl(`#/history/${intakeId}`) : undefined,
    answerFileId: packet?.packetData?.practiceQAnswerFile?.fileId,
    pdfFileId: packet?.packetData?.practiceQPdfFile?.fileId,
    answers: await mergePracticeQAnswersWithAnswerFile(answers, packet).catch(() => answers),
  };
}

export async function getIntakeSummaryFeed(options: {
  page?: number;
  client?: string;
  startDate?: string;
  endDate?: string;
  updatedSince?: string;
} = {}): Promise<Types.PracticeQFormFeed> {
  if (!serviceConfig.practiceq.apiKey) {
    return unavailableFormFeed("PRACTICEQ_API_KEY is not configured");
  }

  const params = new URLSearchParams();
  params.set("all", "true");
  params.set("page", String(Math.max(1, options.page ?? 1)));
  if (options.client?.trim()) params.set("client", options.client.trim());
  if (options.startDate?.trim()) params.set("startDate", options.startDate.trim());
  if (options.endDate?.trim()) params.set("endDate", options.endDate.trim());
  if (options.updatedSince?.trim()) params.set("updatedSince", options.updatedSince.trim());

  const response = await fetchPracticeQWithRetry(`${pqBase()}/intakes/summary?${params.toString()}`, {
    headers: pqHeaders(),
  });
  if (!response.ok) {
    return unavailableFormFeed(`PracticeQ summary request failed with HTTP ${response.status}`);
  }

  const raw = await parsePracticeQListResponse(response);
  const all = raw.map(normalizePracticeQSummary).filter((form): form is Types.PracticeQFormSummary => Boolean(form));
  all.sort((a, b) => formSortTime(b) - formSortTime(a));

  return {
    available: true,
    completed: all.filter((form) => form.status.toLowerCase() === "completed"),
    pending: all.filter((form) => form.status.toLowerCase() !== "completed"),
    all,
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
  const doseSelected =
    product.doses.find((d) => d.id === order.doseId)?.label ||
    "Unknown";
  return {
    id: generateId(),
    orderId: order.id,
    patientId: order.patientId,
    submittedAt: new Date().toISOString(),
    status: "submitted",
    lastSyncAt: new Date().toISOString(),
    packetData: {
      patientInfo: { id: patient.id },
      questionnaireAnswers: [],
      consentRecord: consent ? { id: consent.id, signedAt: consent.signedAt } : {},
      uploads: [],
      productRequested: product.name,
      doseSelected,
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

function unavailableFormFeed(reason: string): Types.PracticeQFormFeed {
  return {
    available: false,
    reason,
    completed: [],
    pending: [],
    all: [],
  };
}

function normalizePracticeQSummary(summary: PracticeQIntakeSummary): Types.PracticeQFormSummary | null {
  if (!summary?.Id) return null;
  return {
    id: String(summary.Id),
    clientName: summary.ClientName,
    clientEmail: summary.ClientEmail,
    clientId: summary.ClientId === undefined || summary.ClientId === null ? undefined : String(summary.ClientId),
    status: summary.Status ?? "Unknown",
    createdAt: normalizePracticeQDate(summary.DateCreated),
    submittedAt: normalizePracticeQDate(summary.DateSubmitted),
    questionnaireName: summary.QuestionnaireName,
    questionnaireId: summary.QuestionnaireId,
    practitionerName: summary.PractitionerName,
    externalClientId: summary.ExternalClientId,
    practiceQUrl: buildPracticeQUrl(`#/history/${summary.Id}`),
  };
}

function formSortTime(form: Types.PracticeQFormSummary): number {
  const value = form.submittedAt ?? form.createdAt;
  return value ? new Date(value).getTime() : 0;
}

function normalizePracticeQAnswers(intake: PracticeQIntake | null): Types.PracticeQMirrorAnswer[] {
  const questions = intake?.Questions ?? intake?.questions ?? [];
  if (!Array.isArray(questions)) return [];

  return questions
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      const question = firstString(entry.Text, entry.QuestionText, entry.Question, entry.Label, entry.Name);
      const answer = firstString(entry.Answer, entry.Value, entry.AnswerText, entry.Response) || formatPracticeQRows(entry.Rows);
      if (!question && !answer) return null;
      return {
        question: question || "Question",
        answer: answer || "",
      };
    })
    .filter((answer): answer is Types.PracticeQMirrorAnswer => Boolean(answer));
}

async function mergePracticeQAnswersWithAnswerFile(
  answers: Types.PracticeQMirrorAnswer[],
  packet?: Types.PracticeQPacket | null
) {
  const fileId = packet?.packetData?.practiceQAnswerFile?.fileId;
  if (!fileId) return answers;

  const file = await downloadPracticeQFile(fileId);
  const parsed = JSON.parse(file.body.toString("utf8")) as {
    answers?: Types.PracticeQMirrorAnswer[];
  };
  const fileAnswers = Array.isArray(parsed.answers) ? parsed.answers : [];
  if (!fileAnswers.length) return answers;

  const fileAnswerByQuestion = new Map(fileAnswers.map((answer) => [normalizeQuestionText(answer.question), answer.answer]));
  const seen = new Set<string>();
  const hasMeaningfulPracticeQAnswers = answers.some((answer) => answer.answer.trim());
  if (!hasMeaningfulPracticeQAnswers) return fileAnswers;

  const merged = answers.map((answer) => {
    const key = normalizeQuestionText(answer.question);
    seen.add(key);
    return answer.answer.trim()
      ? answer
      : { ...answer, answer: fileAnswerByQuestion.get(key) ?? answer.answer };
  });

  for (const answer of fileAnswers) {
    const key = normalizeQuestionText(answer.question);
    if (!seen.has(key)) merged.push(answer);
  }

  return merged;
}

async function uploadMissionIntakeFiles(
  clientId: string | number,
  order: Types.Order,
  patient: Types.Patient,
  answers: Types.QuestionnaireAnswer[],
  questions: Types.Question[],
  consent: Types.ConsentRecord | null
) {
  const normalizedAnswers = buildMissionIntakeAnswerRows(patient, answers, questions);
  if (!normalizedAnswers.length) return null;

  const jsonFilename = `mission-intake-answers-${order.id}.json`;
  const payload = {
    source: "Mission WLW",
    orderId: order.id,
    patientId: patient.id,
    submittedAt: new Date().toISOString(),
    consent: consent
      ? {
          signedName: consent.signedName,
          signedAt: consent.signedAt,
          acknowledgments: consent.acknowledgments,
          ipAddress: consent.ipAddress,
          userAgent: consent.userAgent,
          consentVersion: consent.consentVersion,
          certificate: buildConsentCertificate(consent, patient),
          consentText: consent.consentText,
        }
      : null,
    answers: normalizedAnswers,
  };
  const answerFile = await uploadPracticeQClientFile(clientId, {
    filename: jsonFilename,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload, null, 2), "utf8"),
  });
  const pdfFilename = `mission-intake-summary-${order.id}.pdf`;
  const pdfFile = await uploadPracticeQClientFile(clientId, {
    filename: pdfFilename,
    mimeType: "application/pdf",
    buffer: createMissionIntakePdf({
      order,
      patient,
      answers: normalizedAnswers,
      consent,
    }),
  });

  const uploadedAt = new Date().toISOString();
  return {
    answerFile: {
      fileId: answerFile.id,
      filename: jsonFilename,
      uploadedAt,
    },
    pdfFile: {
      fileId: pdfFile.id,
      filename: pdfFilename,
      uploadedAt,
    },
  };
}

export async function uploadMissionChartFiles(input: {
  clientId: string | number;
  order: Types.Order;
  patient: Types.Patient;
  answers: Types.QuestionnaireAnswer[];
  questions: Types.Question[];
  consent: Types.ConsentRecord | null;
  uploads: Types.Upload[];
}) {
  const intakeFiles = await uploadMissionIntakeFiles(
    input.clientId,
    input.order,
    input.patient,
    input.answers,
    input.questions,
    input.consent
  );
  const uploadedAt = new Date().toISOString();
  const identityFiles: NonNullable<Types.PracticeQPacket["packetData"]["practiceQIdentityFiles"]> = [];
  const sanitizedUploads = input.uploads.map((upload) => ({ ...upload, base64Data: "" }));

  for (const upload of input.uploads.filter((item) => item.type === "driver_license" || item.type === "selfie_video")) {
    try {
      const file = await practiceQFileFromUpload(upload);
      if (!file) continue;
      const uploaded = await uploadPracticeQClientFile(input.clientId, file);
      const storedUpload = await markIdentityUploadStoredInPracticeQ(upload, uploaded.id);
      const uploadIndex = sanitizedUploads.findIndex((item) => item.id === upload.id);
      if (uploadIndex >= 0) sanitizedUploads[uploadIndex] = storedUpload;
      identityFiles.push({
        fileId: uploaded.id,
        filename: file.filename,
        uploadedAt,
        type: upload.type,
      });
    } catch {
      // Identity evidence attachment should not block chart completion or pharmacy dispatch.
    }
  }

  return {
    answerFile: intakeFiles?.answerFile,
    pdfFile: intakeFiles?.pdfFile,
    identityFiles,
    uploads: sanitizedUploads,
  };
}

function filenameStem(filename: string) {
  return filename.replace(/\.[a-zA-Z0-9]+$/, "") || "identity-file";
}

async function practiceQFileFromUpload(upload: Types.Upload): Promise<PracticeQFileUploadInput | null> {
  if (upload.base64Data) {
    const parts = dataUrlToFileParts(upload.base64Data, filenameStem(upload.filename));
    return {
      filename: parts.filename,
      mimeType: parts.mimeType,
      buffer: parts.buffer,
    };
  }

  const media = await loadIdentityMedia(upload);
  if (!media) return null;
  return {
    filename: upload.filename,
    mimeType: media.contentType || upload.mimeType || "application/octet-stream",
    buffer: media.body,
  };
}

async function markIdentityUploadStoredInPracticeQ(upload: Types.Upload, fileId: string): Promise<Types.Upload> {
  const storedUpload = {
    ...upload,
    storageUrl: `practiceq://files/${fileId}`,
    storageKey: fileId,
    base64Data: "",
  };
  const serverDb = await getServerDb();
  await serverDb?.uploadDb.markStoredInPracticeQ(upload.id, fileId).catch(() => null);
  return storedUpload;
}

export function createMissionIntakePdf(input: {
  order: Types.Order;
  patient: Types.Patient;
  answers: Types.PracticeQMirrorAnswer[];
  consent: Types.ConsentRecord | null;
}) {
  const profileLabels = new Set([
    "First Name",
    "Last Name",
    "Date of Birth",
    "Phone Number",
    "Email",
    "Address (For Medication Shipment)",
    "City",
    "State",
    "Zip Code",
    "Gender",
  ]);
  const profileAnswers = input.answers.filter((answer) => profileLabels.has(answer.question));
  const clinicalAnswers = input.answers.filter((answer) => !profileLabels.has(answer.question));
  const patientName = [input.patient.firstName, input.patient.lastName].filter(Boolean).join(" ") || "Patient";
  const address = [
    input.patient.address?.street1,
    input.patient.address?.city,
    input.patient.address?.state,
    input.patient.address?.zipCode,
  ].filter(Boolean).join(", ");

  return buildStyledMissionIntakePdf({
    title: "Mission WLW Intake Summary",
    subtitle: "Completed clinical intake packet",
    metadata: [
      ["Patient", patientName],
      ["DOB", input.patient.dateOfBirth || "Not supplied"],
      ["Phone", input.patient.phone || "Not supplied"],
      ["Email", input.patient.email || "Not supplied"],
      ["Address", address || "Not supplied"],
      ["Order ID", input.order.id],
      ["Submitted", new Date().toLocaleString("en-US")],
      ["Status", input.order.status],
    ],
    profileAnswers,
    clinicalAnswers,
    consent: input.consent,
    patient: input.patient,
  });
}

function buildStyledMissionIntakePdf(input: {
  title: string;
  subtitle: string;
  metadata: Array<[string, string]>;
  profileAnswers: Types.PracticeQMirrorAnswer[];
  clinicalAnswers: Types.PracticeQMirrorAnswer[];
  consent: Types.ConsentRecord | null;
  patient: Types.Patient;
}) {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const bottomMargin = 54;
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = 0;

  const add = (op: string) => ops.push(op);
  const color = (hex: string) => {
    const normalized = hex.replace("#", "");
    const r = parseInt(normalized.slice(0, 2), 16) / 255;
    const g = parseInt(normalized.slice(2, 4), 16) / 255;
    const b = parseInt(normalized.slice(4, 6), 16) / 255;
    return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
  };
  const rect = (x: number, top: number, width: number, height: number, fill: string, stroke?: string) => {
    add(`q ${color(fill)} rg ${x} ${top - height} ${width} ${height} re f Q`);
    if (stroke) add(`q ${color(stroke)} RG 0.8 w ${x} ${top - height} ${width} ${height} re S Q`);
  };
  const text = (value: string, x: number, baseline: number, size = 10, font: "regular" | "bold" = "regular", fill = "#111827") => {
    const fontName = font === "bold" ? "F2" : "F1";
    add(`BT ${color(fill)} rg /${fontName} ${size} Tf 1 0 0 1 ${x} ${baseline} Tm (${escapePdfText(value)}) Tj ET`);
  };
  const wrappedLines = (value: string, width: number, size = 10) => wrapPdfLine(value || "No answer", Math.max(18, Math.floor(width / (size * 0.52))));
  const drawWrapped = (value: string, x: number, startY: number, width: number, size = 10, font: "regular" | "bold" = "regular", fill = "#374151") => {
    let nextY = startY;
    for (const line of wrappedLines(value, width, size)) {
      text(line, x, nextY, size, font, fill);
      nextY -= size + 4;
    }
    return nextY;
  };
  const startPage = () => {
    if (ops.length) pages.push(ops);
    ops = [];
    rect(0, pageHeight, pageWidth, 84, "#0f766e");
    text(input.title, margin, 742, 22, "bold", "#ffffff");
    text(input.subtitle, margin, 722, 10, "regular", "#ccfbf1");
    text("Confidential patient record", 438, 742, 10, "bold", "#ffffff");
    y = 682;
  };
  const ensureSpace = (height: number) => {
    if (y - height < bottomMargin) startPage();
  };
  const sectionTitle = (label: string) => {
    ensureSpace(42);
    text(label, margin, y, 14, "bold", "#0f172a");
    add(`q ${color("#14b8a6")} RG 1.4 w ${margin} ${y - 10} m ${margin + contentWidth} ${y - 10} l S Q`);
    y -= 30;
  };
  const infoCard = () => {
    ensureSpace(150);
    const cardTop = y + 14;
    const rowHeight = 22;
    const leftX = margin + 18;
    const rightX = margin + 284;
    const labelWidth = 72;
    rect(margin, cardTop, contentWidth, 142, "#f8fafc", "#dbeafe");
    text("Patient and Order Details", leftX, cardTop - 24, 13, "bold", "#0f172a");
    input.metadata.forEach(([label, value], index) => {
      const colX = index % 2 === 0 ? leftX : rightX;
      const rowY = cardTop - 50 - Math.floor(index / 2) * rowHeight;
      text(label, colX, rowY, 8, "bold", "#64748b");
      drawWrapped(value || "Not supplied", colX + labelWidth, rowY, 180, 9, "regular", "#1f2937");
    });
    y = cardTop - 162;
  };
  const answerCard = (answer: Types.PracticeQMirrorAnswer) => {
    const questionLines = wrappedLines(answer.question, contentWidth - 34, 10);
    const answerLines = wrappedLines(answer.answer || "No answer", contentWidth - 34, 10);
    const height = 28 + questionLines.length * 14 + answerLines.length * 14 + 18;
    ensureSpace(height + 10);
    const top = y + 8;
    rect(margin, top, contentWidth, height, "#ffffff", "#e5e7eb");
    let lineY = top - 24;
    questionLines.forEach((line) => {
      text(line, margin + 16, lineY, 10, "bold", "#0f766e");
      lineY -= 14;
    });
    lineY -= 4;
    answerLines.forEach((line) => {
      text(line, margin + 16, lineY, 10, "regular", "#374151");
      lineY -= 14;
    });
    y = top - height - 10;
  };
  const consentBlock = () => {
    sectionTitle("Consent Certificate");
    ensureSpace(96);
    rect(margin, y + 10, contentWidth, 82, "#f0fdfa", "#99f6e4");
    if (input.consent) {
      text("Signed", margin + 16, y - 12, 10, "bold", "#0f766e");
      drawWrapped(buildConsentCertificate(input.consent, input.patient), margin + 82, y - 12, contentWidth - 104, 10, "regular", "#1f2937");
      text("Version", margin + 16, y - 50, 9, "bold", "#0f766e");
      drawWrapped(input.consent.consentVersion ?? "1.0", margin + 82, y - 50, contentWidth - 104, 9, "regular", "#1f2937");
      y -= 108;
      sectionTitle("Consent Terms Accepted");
      for (const paragraph of input.consent.consentText.split(/\n{2,}/)) {
        const textValue = paragraph.trim();
        if (!textValue) continue;
        const lines = wrappedLines(textValue, contentWidth, 8);
        ensureSpace(lines.length * 12 + 10);
        y = drawWrapped(textValue, margin, y, contentWidth, 8, "regular", "#374151") - 6;
      }
    } else {
      text("No consent record supplied.", margin + 16, y - 12, 10, "regular", "#374151");
      y -= 78;
    }
  };

  startPage();
  infoCard();
  if (input.profileAnswers.length) {
    sectionTitle("Patient Profile");
    input.profileAnswers.forEach(answerCard);
  }
  sectionTitle("Clinical Intake Answers");
  if (input.clinicalAnswers.length) {
    input.clinicalAnswers.forEach(answerCard);
  } else {
    ensureSpace(40);
    text("No clinical answers were supplied.", margin, y, 10, "regular", "#64748b");
    y -= 24;
  }
  consentBlock();
  if (ops.length) pages.push(ops);

  pages.forEach((pageOps, index) => {
    pageOps.push(`BT ${color("#94a3b8")} rg /F1 8 Tf 1 0 0 1 ${margin} 28 Tm (Mission WLW) Tj ET`);
    pageOps.push(`BT ${color("#94a3b8")} rg /F1 8 Tf 1 0 0 1 520 28 Tm (Page ${index + 1} of ${pages.length}) Tj ET`);
  });

  const objects: string[] = [];
  const addObject = (content: string) => {
    objects.push(content);
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("__PAGES__");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds: number[] = [];

  for (const pageOps of pages) {
    const stream = pageOps.join("\n");
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(chunks.join(""), "utf8"));
    chunks.push(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(chunks.join(""), "utf8");
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  for (let i = 1; i < offsets.length; i++) {
    chunks.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(chunks.join(""), "utf8");
}

function wrapPdfLine(line: string, width: number) {
  if (!line) return [""];
  const chunks: string[] = [];
  let remaining = line;
  while (remaining.length > width) {
    const index = remaining.lastIndexOf(" ", width);
    const splitAt = index > 20 ? index : width;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  chunks.push(remaining);
  return chunks;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildMissionIntakeAnswerRows(
  patient: Types.Patient,
  answers: Types.QuestionnaireAnswer[],
  questions: Types.Question[]
): Types.PracticeQMirrorAnswer[] {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const profile = buildPracticeQProfileAnswers(patient);
  const rows: Types.PracticeQMirrorAnswer[] = Array.from(profile.entries()).map(([question, answer]) => ({
    question: titlePracticeQProfileQuestion(question),
    answer,
  }));

  for (const answer of answers) {
    const question = questionById.get(answer.questionId);
    if (!question || !answer.answer.trim()) continue;
    rows.push({ question: question.text, answer: answer.answer });
  }
  return rows;
}

function titlePracticeQProfileQuestion(question: string) {
  const titles: Record<string, string> = {
    "first name": "First Name",
    "last name": "Last Name",
    "date of birth": "Date of Birth",
    "phone number": "Phone Number",
    email: "Email",
    "address for medication shipment": "Address (For Medication Shipment)",
    city: "City",
    state: "State",
    "zip code": "Zip Code",
    gender: "Gender",
  };
  return titles[question] ?? question;
}

export async function populateAndUpdatePracticeQIntake(
  intake: PracticeQIntake | null,
  context: {
    patient: Types.Patient;
    answers: Types.QuestionnaireAnswer[];
    questions: Types.Question[];
  }
): Promise<PracticeQIntake | null> {
  if (!intake?.Id || context.answers.length === 0) return null;

  const fullIntake = Array.isArray(intake.Questions) || Array.isArray(intake.questions)
    ? intake
    : await getIntakeById(intake.Id).catch(() => null);
  const intakeQuestions = fullIntake?.Questions ?? fullIntake?.questions;
  if (!fullIntake || !Array.isArray(intakeQuestions)) return null;

  const changed = applyMissionAnswersToPracticeQQuestions(intakeQuestions, context);

  if (!changed) return null;

  const response = await fetchPracticeQWithRetry(`${pqBase()}/intakes`, {
    method: "POST",
    headers: pqHeaders(),
    body: JSON.stringify(fullIntake),
  });
  const result = await parsePracticeQResponse(response);
  if (!response.ok) {
    const message = result ? JSON.stringify(result) : `HTTP ${response.status}`;
    throw new Error(`PracticeQ intake answer update failed: ${message}`);
  }
  return (result as PracticeQIntake | null) ?? fullIntake;
}

export async function markPracticeQIntakeCompletedViaApi(
  intake: PracticeQIntake | null
): Promise<PracticeQIntake | null> {
  const intakeId = intake?.Id ?? intake?.id;
  if (!serviceConfig.practiceq.apiKey || !intake || !intakeId) return null;

  if (/completed/i.test(String(intake.Status ?? intake.status ?? ""))) return intake;

  const fullIntake = Array.isArray(intake.Questions) || Array.isArray(intake.questions)
    ? intake
    : await getIntakeById(String(intakeId)).catch(() => null);
  if (!fullIntake) return null;

  const payload: PracticeQIntake = {
    ...fullIntake,
    Id: fullIntake.Id ?? fullIntake.id ?? String(intakeId),
    Status: "Completed",
  };

  const response = await fetchPracticeQWithRetry(`${pqBase()}/intakes`, {
    method: "POST",
    headers: pqHeaders(),
    body: JSON.stringify(payload),
  });
  const result = await parsePracticeQResponse(response);
  if (!response.ok) {
    const message = result ? JSON.stringify(result) : `HTTP ${response.status}`;
    throw new Error(`PracticeQ intake status update failed: ${message}`);
  }
  return (result as PracticeQIntake | null) ?? payload;
}

export function applyMissionAnswersToPracticeQQuestions(
  intakeQuestions: unknown[],
  context: {
    patient: Types.Patient;
    answers: Types.QuestionnaireAnswer[];
    questions: Types.Question[];
  }
): boolean {
  // Build both an ID map and a text map so we can try exact-ID matching first.
  // When questions were sourced from PracticeQ (Option B), questionId == PracticeQ question Id
  // so we get a guaranteed 1:1 match with no fuzzy logic needed.
  const answerById = new Map<string, string>();
  const answerByText = new Map<string, string>();
  const questionById = new Map(context.questions.map((question) => [question.id, question]));
  for (const answer of context.answers) {
    if (answer.answer.trim()) {
      answerById.set(answer.questionId, answer.answer);
    }
    const question = questionById.get(answer.questionId);
    if (question?.text && answer.answer.trim()) {
      answerByText.set(normalizeQuestionText(question.text), answer.answer);
    }
  }

  const profileAnswers = buildPracticeQProfileAnswers(context.patient);
  let changed = false;
  for (const item of intakeQuestions) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    // 1. Exact PracticeQ question ID match (when questions were fetched from PracticeQ)
    const pqQuestionId = firstString(entry.Id, entry.id);
    const answer = (pqQuestionId ? answerById.get(pqQuestionId) : undefined)
      // 2. Fuzzy text match (fallback for locally-defined questions)
      ?? findPracticeQAnswer(
        firstString(entry.Text, entry.QuestionText, entry.Question, entry.Label, entry.Name),
        answerByText,
        profileAnswers
      );
    if (!answer) continue;
    entry.Answer = answer;
    changed = true;
  }
  return changed;
}

function buildPracticeQProfileAnswers(patient: Types.Patient) {
  const dob = patient.dateOfBirth ? new Date(`${patient.dateOfBirth}T00:00:00Z`) : null;
  const formattedDob = dob && !Number.isNaN(dob.getTime())
    ? `${dob.getUTCMonth() + 1}/${dob.getUTCDate()}/${dob.getUTCFullYear()}`
    : patient.dateOfBirth;
  return new Map<string, string>([
    ["first name", patient.firstName],
    ["last name", patient.lastName],
    ["date of birth", formattedDob],
    ["phone number", patient.phone],
    ["email", patient.email],
    ["address for medication shipment", patient.address.street1],
    ["city", patient.address.city],
    ["state", patient.address.state],
    ["zip code", patient.address.zipCode],
    ["gender", patient.gender],
  ].filter((entry): entry is [string, string] => Boolean(entry[1])));
}

function findPracticeQAnswer(
  practiceQQuestionText: string,
  missionAnswers: Map<string, string>,
  profileAnswers: Map<string, string>
) {
  const normalized = normalizeQuestionText(practiceQQuestionText);
  return profileAnswers.get(normalized) ??
    missionAnswers.get(normalized) ??
    findLooseAnswer(normalized, missionAnswers);
}

function findLooseAnswer(normalizedPracticeQText: string, answers: Map<string, string>) {
  for (const [question, answer] of answers) {
    if (question === normalizedPracticeQText) return answer;
    if (question.includes(normalizedPracticeQText) || normalizedPracticeQText.includes(question)) return answer;
  }
  return "";
}

function normalizeQuestionText(value: string) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatPracticeQRows(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return "";
      const entry = row as Record<string, unknown>;
      const label = firstString(entry.Text, entry.Label, entry.Name);
      const answers = Array.isArray(entry.Answers)
        ? entry.Answers.map((answer) => String(answer ?? "")).filter(Boolean).join(", ")
        : firstString(entry.Answer, entry.Value);
      if (!label && !answers) return "";
      return label ? `${label}: ${answers}` : answers;
    })
    .filter(Boolean)
    .join("; ");
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

async function parsePracticeQListResponse(response: Response): Promise<PracticeQIntakeSummary[]> {
  const text = await response.text();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed as PracticeQIntakeSummary[];
    if (parsed && typeof parsed === "object") {
      const object = parsed as Record<string, unknown>;
      const candidates = object.Intakes ?? object.intakes ?? object.Items ?? object.items;
      if (Array.isArray(candidates)) return candidates as PracticeQIntakeSummary[];
    }
    return [];
  } catch {
    return [];
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

async function getQuestions(): Promise<Types.Question[]> {
  const serverDb = await getServerDb();
  if (!serverDb) return db.questionDb.getAll();
  return serverDb.questionDb.getAll().catch(() => db.questionDb.getAll());
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

async function fetchPracticeQWithRetry(input: string, init?: RequestInit): Promise<Response> {
  const attempts = Math.max(1, Number(process.env.PRACTICEQ_API_RETRY_ATTEMPTS ?? 3));
  let response: Response | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await fetch(input, init);
    if (!shouldRetryPracticeQResponse(response) || attempt === attempts - 1) return response;
    await wait(retryDelayMs(response, attempt));
  }

  return response as Response;
}

function shouldRetryPracticeQResponse(response: Response) {
  return response.status === 429 || response.status >= 500;
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfter = response.headers?.get?.("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const dateMs = Date.parse(retryAfter);
    if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  }
  const base = Math.max(1, Number(process.env.PRACTICEQ_API_RETRY_DELAY_MS ?? 1000));
  return base * Math.max(1, attempt + 1);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pqAuthHeaders() {
  return {
    "X-Auth-Key": serviceConfig.practiceq.apiKey,
  };
}

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

/** Upload a file to a PracticeQ client chart through the Files API. */
export async function uploadPracticeQClientFile(
  clientId: string | number,
  file: PracticeQFileUploadInput
): Promise<PracticeQFileUploadResult> {
  if (!serviceConfig.practiceq.apiKey) {
    throw new Error("PRACTICEQ_API_KEY is required to upload files to PracticeQ");
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }), file.filename);

  const response = await fetch(`${pqBase()}/files/${encodeURIComponent(String(clientId))}`, {
    method: "POST",
    headers: pqAuthHeaders(),
    body: form,
  });
  const result = await parsePracticeQResponse(response);
  if (!response.ok) {
    const message = result ? JSON.stringify(result) : `HTTP ${response.status}`;
    throw new Error(`PracticeQ file upload failed: ${message}`);
  }

  let id = extractPracticeQFileId(result);
  if (!id) {
    const files = await listPracticeQClientFiles(clientId);
    id = files.find((item) => item.filename === file.filename)?.id ?? files[0]?.id ?? "";
  }
  if (!id) throw new Error("PracticeQ file upload did not return a file id");
  return { id, raw: result };
}

async function listPracticeQClientFiles(clientId: string | number): Promise<PracticeQFileSummary[]> {
  const response = await fetch(`${pqBase()}/files?clientId=${encodeURIComponent(String(clientId))}`, {
    headers: pqAuthHeaders(),
  });
  if (!response.ok) return [];
  const text = await response.text();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    const candidates =
      Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>).Files ??
            (parsed as Record<string, unknown>).files ??
            (parsed as Record<string, unknown>).Items ??
            (parsed as Record<string, unknown>).items ??
            (parsed as Record<string, unknown>).data
          : [];
    if (!Array.isArray(candidates)) return [];
    const normalized: PracticeQFileSummary[] = [];
    for (const item of candidates) {
        if (!item || typeof item !== "object") continue;
        const raw = item as Record<string, unknown>;
        const id = extractPracticeQFileId(raw);
        if (!id) continue;
        normalized.push({
          id,
          filename: firstString(raw.Name, raw.name, raw.FileName, raw.fileName, raw.Filename, raw.filename),
          raw,
        });
    }
    return normalized;
  } catch {
    return [];
  }
}

function extractPracticeQFileId(result: Record<string, unknown> | null | undefined) {
  const data = result?.data && typeof result.data === "object" ? result.data as Record<string, unknown> : null;
  const dataUpper = result?.Data && typeof result.Data === "object" ? result.Data as Record<string, unknown> : null;
  return firstString(
    result?.Id,
    result?.id,
    result?.FileId,
    result?.fileId,
    result?.FileID,
    result?.fileID,
    data?.Id,
    data?.id,
    data?.FileId,
    data?.fileId,
    data?.FileID,
    data?.fileID,
    dataUpper?.Id,
    dataUpper?.id,
    dataUpper?.FileId,
    dataUpper?.fileId,
    dataUpper?.FileID,
    dataUpper?.fileID
  );
}

/** Download a PracticeQ file by id. Callers are responsible for authorization. */
export async function downloadPracticeQFile(fileId: string): Promise<{ body: Buffer; contentType: string }> {
  if (!serviceConfig.practiceq.apiKey) {
    throw new Error("PRACTICEQ_API_KEY is required to download files from PracticeQ");
  }

  const response = await fetch(`${pqBase()}/files/${encodeURIComponent(fileId)}`, {
    headers: pqAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`PracticeQ file download failed: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    body: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}
