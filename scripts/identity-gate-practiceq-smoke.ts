import { chromium, type BrowserContext, type Locator, type Page } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Product = {
  id: string;
  name: string;
  slug?: string;
  doses?: Array<{ id: string; label?: string; price?: number }>;
};

type Question = {
  id: string;
  text: string;
  type: "text" | "textarea" | "radio" | "checkbox" | "select";
  required?: boolean;
  options?: string[];
  disqualifying?: string;
  displayOrder?: number;
};

type PracticeQMirror = {
  available?: boolean;
  reason?: string;
  status?: string;
  intakeId?: string;
  clientId?: string;
  clientEmail?: string;
  clientName?: string;
  answers?: Array<{ question: string; answer: string }>;
};

type PracticeQFormSummary = {
  id: string;
  clientName?: string;
  clientEmail?: string;
  clientId?: string;
  status: string;
  createdAt?: string;
  submittedAt?: string;
};

type PracticeQFormFeed = {
  available?: boolean;
  reason?: string;
  completed?: PracticeQFormSummary[];
  pending?: PracticeQFormSummary[];
  all?: PracticeQFormSummary[];
};

type PracticeQRawIntake = {
  Id?: string;
  Status?: string;
  Questions?: Array<Record<string, unknown>>;
};

type OrderDetail = {
  order?: {
    id?: string;
    patientId?: string;
    status?: string;
    paymentStatus?: string;
    quickbooksStatus?: string;
    practiceQStatus?: string;
    pharmacyStatus?: string;
    identityStatus?: string;
    identityReason?: string;
  };
  patient?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
  pharmacy?: {
    status?: string;
    lifeFileOrderId?: string;
  } | null;
  practiceq?: PracticeQMirror | null;
  diagnostics?: {
    practiceqAutomation?: {
      status?: string;
      attempts?: number;
      intakeId?: string;
      lastError?: string;
      updatedAt?: string;
    } | null;
  };
};

type PracticeQAutomationSmokeStatus = {
  available?: boolean;
  status?: string;
  lastError?: string;
};

type ScenarioKind = "skip_manual_approval" | "skip_late_upload" | "regular_with_id";

type PatientInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  street1: string;
  city: string;
  state: string;
  zipCode: string;
};

type CheckoutResult = {
  orderId: string;
  patientId: string;
  patient: PatientInput;
  chargeId: string;
  identityStatus?: string;
  practiceQAutomationStatus?: string;
};

const BASE_URL = (process.env.E2E_BASE_URL ?? "https://mission-wlw-web.onrender.com").replace(/\/$/, "");
const HEADLESS = process.env.E2E_HEADLESS !== "false";
const ADMIN_SECRET = process.env.E2E_ADMIN_SECRET ?? "";
const PRACTICEQ_API_KEY = process.env.E2E_PRACTICEQ_API_KEY ?? process.env.PRACTICEQ_API_KEY ?? "";
const PRACTICEQ_BASE_URL = (process.env.E2E_PRACTICEQ_BASE_URL ?? "https://intakeq.com/api/v1").replace(/\/$/, "");
const ARTIFACT_ROOT =
  process.env.E2E_ARTIFACT_DIR ??
  path.join(os.tmpdir(), "mission-wlw-smoke", `identity-gate-practiceq-${Date.now()}`);
const ID_IMAGE_PATH =
  process.env.E2E_ID_IMAGE_PATH ??
  "C:\\Users\\BishoyKamel\\Downloads\\WhatsApp Image 2026-05-28 at 8.19.09 AM.jpeg";
const ID_VIDEO_PATH =
  process.env.E2E_ID_VIDEO_PATH ??
  "C:\\Users\\BishoyKamel\\Downloads\\WhatsApp Video 2026-05-28 at 8.19.04 AM.mp4";

const expectedAnswers = {
  pq_height: `5'10"`,
  pq_current_weight: "220",
  pq_ideal_weight: "180",
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function adminHeaders() {
  assert(ADMIN_SECRET, "E2E_ADMIN_SECRET is required for privileged smoke checks.");
  return { "x-admin-secret": ADMIN_SECRET };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.text();
  const json = body ? JSON.parse(body) : {};
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${body.slice(0, 700)}`);
  }
  return json as T;
}

async function fetchStatus(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.text().catch(() => "");
  return { response, body };
}

async function poll<T>(
  label: string,
  fn: () => Promise<T | null>,
  timeoutMs = Number(process.env.E2E_PQ_TIMEOUT_MS ?? 15 * 60 * 1000),
  intervalMs = 15_000
) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`${label} did not complete within ${Math.round(timeoutMs / 1000)}s.${last ? ` Last: ${last}` : ""}`);
}

async function fileDataUrl(filePath: string, mimeType: string) {
  const body = await fs.readFile(filePath);
  return `data:${mimeType};base64,${body.toString("base64")}`;
}

async function videoFrameDataUrl(context: BrowserContext, videoPath: string) {
  const page = await context.newPage();
  try {
    await page.setContent(`<video id="v" muted playsinline preload="auto"></video>`);
    await page.evaluate((src) => {
      const video = document.querySelector("video") as HTMLVideoElement;
      video.src = src;
      video.load();
    }, pathToFileURL(videoPath).toString());
    return await page.evaluate(async () => {
      const video = document.querySelector("video") as HTMLVideoElement;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("video metadata timed out")), 15_000);
        video.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("video failed to load"));
        };
      });
      video.currentTime = Math.min(1, Math.max(0, (video.duration || 2) / 2));
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        setTimeout(resolve, 2500);
      });
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.82);
    });
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function saveScreenshot(page: Page, name: string) {
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  const file = path.join(ARTIFACT_ROOT, `${name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
  console.log(`  screenshot: ${file}`);
}

async function clearBrowserDraftState(page: Page) {
  await page.evaluate(() => {
    for (const store of [window.sessionStorage, window.localStorage]) {
      for (const key of Object.keys(store)) {
        if (key.startsWith("tele_")) store.removeItem(key);
      }
    }
  }).catch(() => undefined);
}

function answerForQuestion(question: Question) {
  if (question.id === "pq_height") return expectedAnswers.pq_height;
  if (question.id === "pq_current_weight") return expectedAnswers.pq_current_weight;
  if (question.id === "pq_ideal_weight") return expectedAnswers.pq_ideal_weight;

  const disqualifying = String(question.disqualifying ?? "").toLowerCase();
  if (question.type === "checkbox") {
    return question.options?.find((option) => /none/i.test(option)) ?? "None apply to me";
  }
  if (question.type === "radio" || question.type === "select") {
    if (question.options?.includes("Weight loss")) return "Weight loss";
    if (question.options?.includes("No")) return "No";
    return question.options?.find((option) => !disqualifying.includes(option.toLowerCase())) ?? question.options?.[0] ?? "No";
  }
  if (/surgical/i.test(question.text)) return "None";
  if (/allerg/i.test(question.text)) return "No known drug allergies";
  if (/purpose/i.test(question.text)) return "Weight loss";
  return "None";
}

async function questionBlock(page: Page, question: Question): Promise<Locator> {
  const label = page.locator("label").filter({ hasText: question.text }).first();
  await label.waitFor({ state: "visible", timeout: 30_000 });
  return label.locator('xpath=ancestor::div[contains(@class,"border-b")][1]');
}

async function fillQuestion(page: Page, question: Question) {
  const block = await questionBlock(page, question);
  const answer = answerForQuestion(question);

  if (question.id === "pq_height") {
    await block.locator("select").nth(0).selectOption("5");
    await block.locator("select").nth(1).selectOption("10");
    return;
  }

  if (question.id === "pq_current_weight" || question.id === "pq_ideal_weight") {
    await block.locator('input[type="number"]').fill(answer);
    return;
  }

  if (question.type === "textarea") {
    await block.locator("textarea").fill(answer);
    return;
  }

  if (question.type === "text") {
    await block.locator("input").first().fill(answer);
    return;
  }

  if (question.type === "checkbox") {
    const option = answer;
    const checkbox = block
      .locator("label")
      .filter({ hasText: new RegExp(escapeRegex(option), "i") })
      .locator('input[type="checkbox"]')
      .first();
    if (await checkbox.count()) {
      await checkbox.check();
    }
    return;
  }

  if (question.type === "radio") {
    await block
      .locator("label")
      .filter({ hasText: new RegExp(`^\\s*${escapeRegex(answer)}\\s*$`, "i") })
      .locator('input[type="radio"]')
      .first()
      .check();
    return;
  }

  if (question.type === "select") {
    await block.locator("select").first().selectOption({ label: answer });
  }
}

async function waitForMissionQuestionnairePersistence(page: Page) {
  await page.waitForFunction((expected) => {
    const raw = sessionStorage.getItem("tele_intake_form_state");
    if (!raw) return false;
    const answers = JSON.parse(raw).questionnaireAnswers ?? {};
    return answers.pq_height === expected.pq_height &&
      answers.pq_current_weight === expected.pq_current_weight &&
      answers.pq_ideal_weight === expected.pq_ideal_weight;
  }, expectedAnswers, { timeout: 30_000 });
}

async function seedIdentityCapture(page: Page, identity: {
  licenseImageData: string;
  selfieFrameData: string;
  identityVideoData: string;
}) {
  await page.evaluate((payload) => {
    const key = "tele_intake_form_state";
    const current = JSON.parse(sessionStorage.getItem(key) || "{}");
    sessionStorage.setItem(key, JSON.stringify({
      ...current,
      licenseUploaded: true,
      selfieUploaded: true,
      licenseImageData: payload.licenseImageData,
      selfieFrameData: payload.selfieFrameData,
      identityVideoData: payload.identityVideoData,
    }));
  }, identity);
}

function requirePracticeQAnswers(practiceq: PracticeQMirror) {
  const failures = missingPracticeQAnswers(practiceq);
  if (failures.length) throw new Error(`PracticeQ mirror is missing expected answers: ${failures.join(", ")}`);
}

function missingPracticeQAnswers(practiceq: PracticeQMirror) {
  const answers = practiceq.answers ?? [];
  const read = (pattern: RegExp) =>
    answers.find((entry) => pattern.test(`${entry.question} ${entry.answer}`))?.answer ?? "";

  const height = read(/height/i);
  const currentWeight = read(/current.*body.*weight|body.*weight/i);
  const idealWeight = read(/ideal.*body.*weight/i);

  const failures: string[] = [];
  if (!/5/.test(height) || !/10/.test(height)) failures.push(`height=${JSON.stringify(height)}`);
  if (!/220/.test(currentWeight)) failures.push(`current body weight=${JSON.stringify(currentWeight)}`);
  if (!/180/.test(idealWeight)) failures.push(`ideal body weight=${JSON.stringify(idealWeight)}`);
  return failures;
}

async function fetchPracticeQRawIntake(intakeId: string, label: string): Promise<PracticeQRawIntake> {
  assert(PRACTICEQ_API_KEY, "E2E_PRACTICEQ_API_KEY or PRACTICEQ_API_KEY is required for raw PracticeQ chart verification.");
  const url = `${PRACTICEQ_BASE_URL}/intakes/${encodeURIComponent(intakeId)}`;
  let last = "";
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "X-Auth-Key": PRACTICEQ_API_KEY,
        "Content-Type": "application/json",
      },
    });
    const body = await response.text().catch(() => "");
    if (response.ok) return (body ? JSON.parse(body) : {}) as PracticeQRawIntake;

    last = `${response.status}: ${body.slice(0, 500)}`;
    if (![404, 408, 429, 500, 502, 503, 504].includes(response.status) || attempt === 8) break;
    const waitMs = response.status === 429 ? 30_000 : 12_000;
    console.log(`  ${label}: raw PracticeQ GET ${response.status}, retrying in ${Math.round(waitMs / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new Error(`${label}: raw PracticeQ intake ${intakeId} could not be fetched: ${last}`);
}

async function assertRawPracticeQChartAnswers(intakeId: string | undefined, kind: ScenarioKind) {
  assert(intakeId, `${kind} did not expose a PracticeQ intake ID for raw chart verification.`);
  const intake = await fetchPracticeQRawIntake(intakeId, kind);
  const missing = missingRawPracticeQChartAnswers(intake);
  if (missing.length) throw new Error(`${kind} raw PracticeQ chart is missing expected answers: ${missing.join("; ")}`);
  console.log(`  ${kind}: raw PracticeQ chart answers verified for intake=${intakeId}`);
}

function missingRawPracticeQChartAnswers(intake: PracticeQRawIntake) {
  const checks = [
    { label: "height", question: "What is your height?", expected: `5'10"` },
    { label: "current body weight", question: "What is your current body weight?", expected: "220" },
    { label: "ideal body weight", question: "What is your ideal body weight?", expected: "180" },
    { label: "conditions", question: "Select any that apply to you?", expected: "None apply to me" },
    { label: "surgical history", question: "Any surgical history?", expected: "No" },
    { label: "medication allergies", question: "Any Allergies to medication?", expected: "No" },
    { label: "intake purpose", question: "This intake form is for....", expected: "Tirzepatide" },
  ];

  return checks.flatMap((check) => {
    const question = findRawPracticeQQuestion(intake, check.question);
    if (!question) return [`${check.label}=<question not found>`];
    const actual = readRawPracticeQQuestionAnswer(question);
    return rawPracticeQAnswerMatches(actual, check.expected)
      ? []
      : [`${check.label}=${JSON.stringify(actual || "<blank>")} expected ${JSON.stringify(check.expected)}`];
  });
}

function findRawPracticeQQuestion(intake: PracticeQRawIntake, questionText: string) {
  const expected = normalizeRawPracticeQText(questionText);
  return (intake.Questions ?? []).find((question) => {
    const actual = normalizeRawPracticeQText(String(question.Text ?? question.QuestionText ?? question.Question ?? question.Label ?? ""));
    if (!actual) return false;
    return actual === expected || actual.includes(expected) || expected.includes(actual);
  });
}

function readRawPracticeQQuestionAnswer(question: Record<string, unknown>) {
  const values: string[] = [];
  for (const key of ["Answer", "Value", "AnswerText", "Response"]) {
    const value = question[key];
    if (Array.isArray(value)) {
      values.push(...value.map((item) => String(item ?? "").trim()).filter(Boolean));
    } else if (String(value ?? "").trim()) {
      values.push(String(value).trim());
    }
  }
  const options = question.QuestionOptions;
  if (Array.isArray(options)) {
    values.push(
      ...options
        .filter((option) =>
          Boolean(option?.Checked) ||
          Boolean(option?.Selected) ||
          Boolean(option?.IsSelected) ||
          String(option?.Answer ?? "").trim().length > 0
        )
        .map((option) => String(option?.Text ?? option?.Label ?? option?.Value ?? option?.Answer ?? "").trim())
        .filter(Boolean)
    );
  }
  const rows = question.Rows;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (Array.isArray(row?.Answers)) {
        values.push(...row.Answers.map((value: unknown) => String(value ?? "").trim()).filter(Boolean));
      }
    }
  }
  return [...new Set(values)].join(", ");
}

function rawPracticeQAnswerMatches(actual: string, expected: string) {
  const normalizedActual = normalizeRawPracticeQText(actual);
  const normalizedExpected = normalizeRawPracticeQText(expected);
  if (!normalizedExpected) return true;
  if (!normalizedActual) return false;
  if (normalizedActual === normalizedExpected || normalizedActual.includes(normalizedExpected)) return true;
  if (normalizedExpected === "tirzepatide") return normalizedActual.includes("tirzepatide");
  if (normalizedExpected === "none apply to me") return normalizedActual.includes("none");
  if (normalizedExpected === "no") return normalizedActual === "no";

  const expectedNumbers = normalizedExpected.match(/\d+/g) ?? ([] as string[]);
  if (expectedNumbers.length >= 2) {
    const actualNumbers = normalizedActual.match(/\d+/g) ?? ([] as string[]);
    return expectedNumbers.every((number) => actualNumbers.includes(number));
  }
  return false;
}

function normalizeRawPracticeQText(value: string) {
  return value.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function uniquePatient(kind: ScenarioKind, runId: string, index: number): PatientInput {
  const suffix = `${runId.slice(-6)}${index}`;
  return {
    firstName: "Smoke",
    lastName:
      kind === "skip_manual_approval"
        ? `Manual${suffix}`
        : kind === "skip_late_upload"
          ? `LateUpload${suffix}`
          : `Regular${suffix}`,
    email: `smoke-${kind.replace(/_/g, "-")}-${runId}-${index}@missionwlw.com`,
    phone: `407555${String(Number(runId.slice(-4)) + index).slice(-4).padStart(4, "0")}`,
    dateOfBirth: "1990-04-14",
    gender: "male",
    street1: "6319 Davisson Ave",
    city: "Orlando",
    state: "FL",
    zipCode: "32810",
  };
}

async function createCheckoutOrder({
  page,
  product,
  doseId,
  questions,
  patient,
  identity,
  withIdentity,
  kind,
}: {
  page: Page;
  product: Product;
  doseId: string;
  questions: Question[];
  patient: PatientInput;
  identity: { licenseImageData: string; selfieFrameData: string; identityVideoData: string };
  withIdentity: boolean;
  kind: ScenarioKind;
}): Promise<CheckoutResult> {
  await page.goto(`${BASE_URL}/start/info`, { waitUntil: "domcontentloaded" });
  await clearBrowserDraftState(page);
  await page.goto(`${BASE_URL}/start/info`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForFunction(() => document.querySelectorAll("select")[0]?.querySelectorAll("option").length > 1);

  await page.locator("select").nth(0).selectOption(product.id);
  await page.waitForFunction(() => document.querySelectorAll("select")[1]?.querySelectorAll("option").length >= 1);
  await page.locator("select").nth(1).selectOption(doseId);
  await page.locator('input[autocomplete="given-name"]').fill(patient.firstName);
  await page.locator('input[autocomplete="family-name"]').fill(patient.lastName);
  await page.locator('input[autocomplete="email"]').fill(patient.email);
  await page.locator('input[autocomplete="tel"]').fill(patient.phone);
  await page.locator('input[autocomplete="bday"]').fill(patient.dateOfBirth);
  await page.locator("select").nth(2).selectOption(patient.gender);
  await page.locator('input[autocomplete="shipping address-line1"]').fill(patient.street1);
  await page.locator('input[autocomplete="shipping address-level2"]').fill(patient.city);
  await page.locator("select").nth(3).selectOption(patient.state);
  await page.locator('input[autocomplete="shipping postal-code"]').fill(patient.zipCode);
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await page.waitForURL(/\/start\/questionnaire/, { timeout: 30_000 });

  for (const question of [...questions].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))) {
    if (question.required || question.id.startsWith("pq_")) {
      await fillQuestion(page, question);
    }
  }
  await waitForMissionQuestionnairePersistence(page);
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await page.waitForURL(/\/start\/consent/, { timeout: 30_000 });

  await page.locator('input[type="checkbox"]').check();
  await page.locator('input[placeholder="Type your full legal name"]').fill(`${patient.firstName} ${patient.lastName}`);
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await page.waitForURL(/\/start\/uploads/, { timeout: 30_000 });

  if (withIdentity) {
    await seedIdentityCapture(page, identity);
    await page.goto(`${BASE_URL}/start/payment`, { waitUntil: "domcontentloaded" });
  } else {
    await page.getByRole("button", { name: /Skip for Now/i }).click();
  }
  await page.waitForURL(/\/start\/payment/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);

  const paymentDisabled = await page.getByText(/Payment disabled/i).isVisible({ timeout: 10_000 }).catch(() => false);
  if (!paymentDisabled) {
    await page.locator('input[placeholder*="4242"]').fill("4111111111111111");
    await page.locator('input[placeholder*="12/"]').fill("12/28");
    await page.locator('input[type="password"]').fill("123");
  }

  const chargeResponsePromise = page.waitForResponse((response) => response.url().includes("/api/payments/charge"), {
    timeout: 120_000,
  });
  await page.getByRole("button", { name: paymentDisabled ? /Submit order/i : /Pay|Submit order/i }).click();
  const chargeResponse = await chargeResponsePromise;
  const chargeBody = await chargeResponse.json().catch(() => ({}));
  if (!chargeResponse.ok()) throw new Error(`${kind} payment failed: ${JSON.stringify(chargeBody)}`);
  assert(String(chargeBody.chargeId ?? "").startsWith("test_bypass_"), `${kind} did not use payment bypass.`);

  await page.waitForURL(/\/start\/confirmation/, { timeout: 60_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await saveScreenshot(page, `${kind}-confirmation`);

  const browserState = await page.evaluate(() => {
    const raw = sessionStorage.getItem("tele_intake_form_state");
    return raw ? JSON.parse(raw) : {};
  });
  const orderId = String(chargeBody.orderId ?? browserState.orderId ?? "");
  const patientId = String(browserState.patientId ?? "");
  assert(orderId && patientId, `${kind} missing orderId/patientId after payment.`);
  return {
    orderId,
    patientId,
    patient,
    chargeId: String(chargeBody.chargeId),
    identityStatus: String(chargeBody.identityStatus ?? ""),
    practiceQAutomationStatus: String(chargeBody.practiceQAutomationStatus ?? ""),
  };
}

async function getOrderDetail(orderId: string): Promise<OrderDetail> {
  return fetchJson<OrderDetail>(`${BASE_URL}/api/orders/${encodeURIComponent(orderId)}`, {
    headers: adminHeaders(),
  });
}

async function getPracticeQForms(client: string): Promise<PracticeQFormFeed> {
  return fetchJson<PracticeQFormFeed>(`${BASE_URL}/api/practiceq/forms?client=${encodeURIComponent(client)}`, {
    headers: adminHeaders(),
  });
}

async function pollPracticeQForms(client: string, label: string) {
  return poll(
    label,
    async () => {
      const feed = await getPracticeQForms(client).catch((error) => ({
        available: false,
        reason: error instanceof Error ? error.message : String(error),
        all: [],
        completed: [],
        pending: [],
      }));
      if (!feed.available && /429|too many|rate/i.test(feed.reason ?? "")) {
        console.log(`  ${label}: PracticeQ feed rate-limited, retrying`);
        return null;
      }
      return feed;
    },
    Number(process.env.E2E_PQ_FEED_TIMEOUT_MS ?? 5 * 60 * 1000),
    20_000
  );
}

function exactFormMatches(feed: PracticeQFormFeed, patient: PatientInput, detail?: OrderDetail) {
  const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
  const email = patient.email.toLowerCase();
  const clientId = detail?.practiceq?.clientId;
  const intakeId = detail?.practiceq?.intakeId;
  return (feed.all ?? []).filter((form) => {
    const formEmail = form.clientEmail?.toLowerCase();
    const formName = form.clientName?.toLowerCase();
    return (
      form.id === intakeId ||
      (clientId && form.clientId === clientId) ||
      formEmail === email ||
      formName === fullName
    );
  });
}

async function assertNoPracticeQBeforeIdentity(result: CheckoutResult) {
  const detail = await getOrderDetail(result.orderId);
  assert(detail.order?.identityStatus === "missing", `${result.orderId} identity should be missing before approval/upload.`);
  assert(!detail.diagnostics?.practiceqAutomation, `${result.orderId} already has a PracticeQ job before identity approval.`);
  assert(!detail.practiceq?.available, `${result.orderId} already has a PracticeQ mirror before identity approval.`);
  const feed = await getPracticeQForms(result.patient.email);
  if (feed.available) {
    const matches = exactFormMatches(feed, result.patient, detail);
    assert(matches.length === 0, `${result.orderId} created PracticeQ form(s) before identity approval: ${matches.map((m) => m.id).join(", ")}`);
  }
}

async function wakePracticeQ() {
  await fetchStatus(`${BASE_URL}/api/practiceq/wake`, { method: "POST" }).catch(() => null);
}

async function pollPracticeQDone(result: CheckoutResult, kind: ScenarioKind) {
  await wakePracticeQ();
  return poll(
    `${kind} PracticeQ completion`,
    async () => {
      const [detail, automation] = await Promise.all([
        getOrderDetail(result.orderId),
        fetchJson<PracticeQAutomationSmokeStatus>(
          `${BASE_URL}/api/clinical-consent/automation/${encodeURIComponent(result.orderId)}?patientId=${encodeURIComponent(result.patientId)}`
        ).catch((): PracticeQAutomationSmokeStatus => ({ available: false })),
      ]);
      const job = detail.diagnostics?.practiceqAutomation;
      console.log(
        `  ${kind}: identity=${detail.order?.identityStatus ?? "?"} job=${job?.status ?? automation.status ?? "none"} attempts=${job?.attempts ?? 0} pq=${detail.practiceq?.status ?? detail.practiceq?.reason ?? "none"} pharmacy=${detail.order?.pharmacyStatus ?? "?"}/${detail.pharmacy?.status ?? "none"}`
      );

      if (job?.status === "failed" || automation.status === "failed") {
        throw new Error(`${kind} PracticeQ failed: ${job?.lastError ?? automation.lastError ?? "unknown error"}`);
      }

      const practiceq = detail.practiceq;
      if (!practiceq?.available || !/completed/i.test(String(practiceq.status ?? ""))) return null;
      const missingAnswers = missingPracticeQAnswers(practiceq);
      if (missingAnswers.length) {
        console.log(`  ${kind}: waiting for PracticeQ answer mirror (${missingAnswers.join(", ")})`);
        return null;
      }
      if (detail.order?.pharmacyStatus !== "submitted" || detail.pharmacy?.status !== "submitted") return null;
      if (!detail.pharmacy?.lifeFileOrderId) return null;
      return detail;
    },
    Number(process.env.E2E_PQ_TIMEOUT_MS ?? 15 * 60 * 1000),
    15_000
  );
}

async function assertSinglePracticeQEntry(result: CheckoutResult, detail: OrderDetail, kind: ScenarioKind) {
  const feeds: PracticeQFormFeed[] = [await pollPracticeQForms(result.patient.email, `${kind} PracticeQ feed by email`)];
  if (detail.practiceq?.clientId) {
    feeds.push(await pollPracticeQForms(detail.practiceq.clientId, `${kind} PracticeQ feed by client`));
  }
  const byId = new Map<string, PracticeQFormSummary>();
  for (const feed of feeds) {
    assert(feed.available, `${kind} PracticeQ feed unavailable: ${feed.reason ?? "unknown"}`);
    for (const form of exactFormMatches(feed, result.patient, detail)) byId.set(form.id, form);
  }
  const matches = [...byId.values()];
  assert(matches.length === 1, `${kind} expected exactly one PracticeQ form, found ${matches.length}: ${matches.map((m) => `${m.id}:${m.status}`).join(", ")}`);
  assert(matches[0].status.toLowerCase() === "completed", `${kind} PracticeQ form is not completed: ${matches[0].id}:${matches[0].status}`);
  const pending = matches.filter((form) => form.status.toLowerCase() !== "completed");
  assert(pending.length === 0, `${kind} has pending duplicate PracticeQ form(s): ${pending.map((m) => m.id).join(", ")}`);
}

async function manualApprove(result: CheckoutResult) {
  const response = await fetchJson<{ success?: boolean; identityStatus?: string; practiceQCompletion?: { status?: string } }>(
    `${BASE_URL}/api/identity/approve`,
    {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: result.orderId,
        reviewedBy: "identity-gate-smoke",
        notes: "Smoke test manual approval after skipped ID.",
      }),
    }
  );
  assert(response.success, `manual approval did not succeed: ${JSON.stringify(response)}`);
  assert(response.identityStatus === "manual_approved", `manual approval status mismatch: ${JSON.stringify(response)}`);
  assert(
    ["queued", "requeued", "already_queued"].includes(String(response.practiceQCompletion?.status ?? "")),
    `manual approval did not queue PracticeQ: ${JSON.stringify(response)}`
  );
}

async function lateUpload(result: CheckoutResult, identity: {
  licenseImageData: string;
  selfieFrameData: string;
  identityVideoData: string;
}) {
  const resend = await fetchJson<{ uploadUrl?: string; success?: boolean }>(`${BASE_URL}/api/identity/resend`, {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: result.orderId }),
  });
  assert(resend.success && resend.uploadUrl, `identity resend failed: ${JSON.stringify(resend)}`);
  const token = new URL(resend.uploadUrl).pathname.split("/").pop() ?? "";
  assert(token, `identity resend returned upload URL without token: ${resend.uploadUrl}`);

  const upload = await fetchJson<{ success?: boolean; identityStatus?: string; practiceQCompletion?: { status?: string } }>(
    `${BASE_URL}/api/identity/upload`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        idImageData: identity.licenseImageData,
        selfieFrameData: identity.selfieFrameData,
        identityVideoData: identity.identityVideoData,
      }),
    }
  );
  assert(upload.success, `identity upload failed: ${JSON.stringify(upload)}`);
  assert(upload.identityStatus === "verified", `identity upload did not auto-verify in sandbox: ${JSON.stringify(upload)}`);
  assert(
    ["queued", "requeued", "already_queued"].includes(String(upload.practiceQCompletion?.status ?? "")),
    `identity upload did not queue PracticeQ: ${JSON.stringify(upload)}`
  );
}

async function cleanupSmokeData(label: string) {
  const response = await fetchStatus(`${BASE_URL}/api/admin/cleanup-smoke-data`, {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "delete-smoke-test-data" }),
  });
  if (!response.response.ok) {
    console.warn(`WARN ${label} cleanup failed: ${response.response.status} ${response.body.slice(0, 300)}`);
    return;
  }
  console.log(`  ${label} cleanup: ${response.body}`);
}

async function runScenario({
  kind,
  page,
  product,
  doseId,
  questions,
  identity,
  patient,
}: {
  kind: ScenarioKind;
  page: Page;
  product: Product;
  doseId: string;
  questions: Question[];
  identity: { licenseImageData: string; selfieFrameData: string; identityVideoData: string };
  patient: PatientInput;
}) {
  console.log(`SCENARIO ${kind}: start ${patient.email}`);
  const result = await createCheckoutOrder({
    page,
    product,
    doseId,
    questions,
    patient,
    identity,
    withIdentity: kind === "regular_with_id",
    kind,
  });

  console.log(
    `  created order=${result.orderId} patient=${result.patientId} identity=${result.identityStatus} pqDecision=${result.practiceQAutomationStatus} charge=${result.chargeId}`
  );

  if (kind === "regular_with_id") {
    assert(result.identityStatus === "verified", `${kind} did not verify identity at checkout.`);
    assert(result.practiceQAutomationStatus === "queued", `${kind} did not queue PracticeQ at checkout.`);
  } else {
    assert(result.identityStatus === "missing", `${kind} should be missing identity immediately after checkout.`);
    assert(result.practiceQAutomationStatus === "deferred", `${kind} should defer PracticeQ immediately after checkout.`);
    await assertNoPracticeQBeforeIdentity(result);
  }

  if (kind === "skip_manual_approval") await manualApprove(result);
  if (kind === "skip_late_upload") await lateUpload(result, identity);

  const detail = await pollPracticeQDone(result, kind);
  await assertSinglePracticeQEntry(result, detail, kind);
  await assertRawPracticeQChartAnswers(detail.practiceq?.intakeId, kind);
  console.log(
    `SCENARIO ${kind}: PASS order=${result.orderId} intake=${detail.practiceq?.intakeId} client=${detail.practiceq?.clientId} lifefile=${detail.pharmacy?.lifeFileOrderId}`
  );
  return {
    kind,
    orderId: result.orderId,
    patientId: result.patientId,
    email: result.patient.email,
    intakeId: detail.practiceq?.intakeId,
    clientId: detail.practiceq?.clientId,
    lifeFileOrderId: detail.pharmacy?.lifeFileOrderId,
  };
}

async function main() {
  assert(ADMIN_SECRET, "Set E2E_ADMIN_SECRET before running this smoke.");
  assert(PRACTICEQ_API_KEY, "Set E2E_PRACTICEQ_API_KEY before running this smoke so raw PracticeQ chart fields are verified.");
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  await fs.access(ID_IMAGE_PATH);
  await fs.access(ID_VIDEO_PATH);

  console.log(`Identity gate PracticeQ smoke starting against ${BASE_URL}`);
  console.log(`Artifacts: ${ARTIFACT_ROOT}`);

  await cleanupSmokeData("pre-run");

  const [{ products }, { questions }] = await Promise.all([
    fetchJson<{ products: Product[] }>(`${BASE_URL}/api/products`),
    fetchJson<{ questions: Question[] }>(`${BASE_URL}/api/questions`),
  ]);
  const product = products.find((item) => item.slug === "tirzepatide") ?? products[0];
  const dose = product?.doses?.[0];
  assert(product && dose, "Live API did not return a usable product/dose.");
  for (const id of Object.keys(expectedAnswers)) {
    assert(questions.some((question) => question.id === id && question.required), `Live questionnaire missing required ${id}.`);
  }

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 80 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const [licenseImageData, identityVideoData, selfieFrameData] = await Promise.all([
    fileDataUrl(ID_IMAGE_PATH, "image/jpeg"),
    fileDataUrl(ID_VIDEO_PATH, "video/mp4"),
    videoFrameDataUrl(context, ID_VIDEO_PATH).catch(async () => fileDataUrl(ID_IMAGE_PATH, "image/jpeg")),
  ]);
  const identity = { licenseImageData, selfieFrameData, identityVideoData };

  const runId = Date.now().toString();
  const scenarios: ScenarioKind[] = ["skip_manual_approval", "skip_late_upload", "regular_with_id"];
  const results = [];
  let allPassed = false;
  try {
    for (let i = 0; i < scenarios.length; i += 1) {
      await clearBrowserDraftState(page);
      results.push(await runScenario({
        kind: scenarios[i],
        page,
        product,
        doseId: dose.id,
        questions,
        identity,
        patient: uniquePatient(scenarios[i], runId, i + 1),
      }));
    }
    allPassed = true;
  } catch (error) {
    await saveScreenshot(page, "failure");
    throw error;
  } finally {
    await clearBrowserDraftState(page);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    if (allPassed && process.env.E2E_KEEP_SMOKE_DATA !== "true") {
      await cleanupSmokeData("post-run");
    } else if (!allPassed) {
      console.log("Smoke failed; leaving local smoke rows in Render for debugging.");
    }
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
