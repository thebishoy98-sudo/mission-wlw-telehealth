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
};

type PracticeQMirror = {
  available?: boolean;
  reason?: string;
  status?: string;
  intakeId?: string;
  answers?: Array<{ question: string; answer: string }>;
};

type OrderDetail = {
  order?: {
    status?: string;
    quickbooksStatus?: string;
    pharmacyStatus?: string;
    identityStatus?: string;
    identityReason?: string;
  };
  pharmacy?: {
    status?: string;
    lifeFileOrderId?: string;
    trackingNumber?: string;
  } | null;
  practiceq?: PracticeQMirror | null;
  diagnostics?: {
    integrationLogs?: Array<{
      integrationName?: string;
      action?: string;
      status?: string;
      error?: string;
      details?: Record<string, unknown>;
    }>;
  };
};

const BASE_URL = (process.env.E2E_BASE_URL ?? "https://mission-wlw-web.onrender.com").replace(/\/$/, "");
const HEADLESS = process.env.E2E_HEADLESS !== "false";
const ARTIFACT_ROOT =
  process.env.E2E_ARTIFACT_DIR ??
  path.join(os.tmpdir(), "mission-wlw-smoke", `customer-practiceq-${Date.now()}`);
const ID_IMAGE_PATH =
  process.env.E2E_ID_IMAGE_PATH ??
  "C:\\Users\\BishoyKamel\\Downloads\\WhatsApp Image 2026-05-28 at 8.19.09 AM.jpeg";
const ID_VIDEO_PATH =
  process.env.E2E_ID_VIDEO_PATH ??
  "C:\\Users\\BishoyKamel\\Downloads\\WhatsApp Video 2026-05-28 at 8.19.04 AM.mp4";
const ADMIN_SECRET = process.env.E2E_ADMIN_SECRET ?? "";

const expectedAnswers = {
  pq_height: `5'10"`,
  pq_current_weight: "220",
  pq_ideal_weight: "180",
};

const requiredPracticeQQuestionIds = Object.keys(expectedAnswers);

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.text();
  const json = body ? JSON.parse(body) : {};
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${body.slice(0, 500)}`);
  }
  return json as T;
}

async function poll<T>(
  label: string,
  fn: () => Promise<T | null>,
  timeoutMs: number,
  intervalMs: number
) {
  const started = Date.now();
  let lastError: unknown = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && /failed|required|unauthorized/i.test(error.message)) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const suffix = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`${label} did not complete within ${Math.round(timeoutMs / 1000)}s.${suffix}`);
}

function answerForQuestion(question: Question) {
  if (question.id === "pq_height") return expectedAnswers.pq_height;
  if (question.id === "pq_current_weight") return expectedAnswers.pq_current_weight;
  if (question.id === "pq_ideal_weight") return expectedAnswers.pq_ideal_weight;

  const disqualifying = String(question.disqualifying ?? "").toLowerCase();
  if (question.type === "checkbox") {
    return question.options?.find((option) => /none/i.test(option)) ?? question.options?.[0] ?? "None apply to me";
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
    await block
      .locator("label")
      .filter({ hasText: new RegExp(escapeRegex(option), "i") })
      .locator('input[type="checkbox"]')
      .first()
      .check();
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

async function saveScreenshot(page: Page, name: string) {
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  const file = path.join(ARTIFACT_ROOT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`Screenshot: ${file}`);
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

async function clearBrowserDraftState(page: Page) {
  await page.evaluate(() => {
    for (const store of [window.sessionStorage, window.localStorage]) {
      for (const key of Object.keys(store)) {
        if (key.startsWith("tele_")) store.removeItem(key);
      }
    }
  }).catch(() => undefined);
}

function requirePracticeQAnswers(practiceq: PracticeQMirror) {
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

  if (failures.length) {
    throw new Error(`PracticeQ mirror is missing expected answers: ${failures.join(", ")}`);
  }
}

async function main() {
  console.log(`Customer PracticeQ smoke starting against ${BASE_URL}`);
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  await fs.access(ID_IMAGE_PATH);
  await fs.access(ID_VIDEO_PATH);

  const [{ products }, { questions }] = await Promise.all([
    fetchJson<{ products: Product[] }>(`${BASE_URL}/api/products`),
    fetchJson<{ questions: Question[] }>(`${BASE_URL}/api/questions`),
  ]);

  const missingPracticeQQuestions = requiredPracticeQQuestionIds.filter(
    (id) => !questions.some((question) => question.id === id && question.required)
  );
  if (missingPracticeQQuestions.length) {
    throw new Error(`Live questionnaire is missing required PracticeQ questions: ${missingPracticeQQuestions.join(", ")}`);
  }

  const product = products.find((item) => item.slug === "tirzepatide") ?? products[0];
  const dose = product?.doses?.[0];
  if (!product || !dose) throw new Error("Live API did not return a usable product/dose.");

  const runId = Date.now().toString();
  const patient = {
    firstName: "Smoke",
    lastName: `PracticeQ${runId.slice(-6)}`,
    email: `practiceq-smoke-${runId}@missionwlw.com`,
    phone: `407555${runId.slice(-4).padStart(4, "0")}`,
    dateOfBirth: "1990-04-14",
    gender: "male",
    street1: "6319 Davisson Ave",
    city: "Orlando",
    state: "FL",
    zipCode: "32810",
  };

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 80 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const [licenseImageData, identityVideoData, selfieFrameData] = await Promise.all([
    fileDataUrl(ID_IMAGE_PATH, "image/jpeg"),
    fileDataUrl(ID_VIDEO_PATH, "video/mp4"),
    videoFrameDataUrl(context, ID_VIDEO_PATH).catch(async () => fileDataUrl(ID_IMAGE_PATH, "image/jpeg")),
  ]);

  let orderId = "";
  let patientId = "";

  page.on("response", (response) => {
    if (response.url().includes("/api/payments/charge")) {
      console.log(`Payment API response: ${response.status()}`);
    }
  });

  try {
    console.log("Step 1: customer info");
    await page.goto(`${BASE_URL}/start/info`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForFunction(() => document.querySelectorAll("select")[0]?.querySelectorAll("option").length > 1);

    await page.locator("select").nth(0).selectOption(product.id);
    await page.waitForFunction(() => document.querySelectorAll("select")[1]?.querySelectorAll("option").length >= 1);
    await page.locator("select").nth(1).selectOption(dose.id);
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

    console.log("Step 2: questionnaire");
    await page.waitForSelector("text=Health Questionnaire", { timeout: 30_000 });
    for (const question of [...questions].sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))) {
      if (question.required || question.id.startsWith("pq_")) {
        await fillQuestion(page, question);
      }
    }
    await waitForMissionQuestionnairePersistence(page);
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await page.waitForURL(/\/start\/consent/, { timeout: 30_000 });

    console.log("Step 3: consent");
    await page.locator('input[type="checkbox"]').check();
    await page.locator('input[placeholder="Type your full legal name"]').fill(`${patient.firstName} ${patient.lastName}`);
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await page.waitForURL(/\/start\/uploads/, { timeout: 30_000 });

    console.log("Step 4: seed identity upload media");
    await seedIdentityCapture(page, { licenseImageData, selfieFrameData, identityVideoData });
    await page.goto(`${BASE_URL}/start/payment`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/start\/payment/, { timeout: 30_000 });

    console.log("Step 5: submit order with QB bypass");
    const paymentDisabled = await page.getByText(/Payment disabled/i).isVisible({ timeout: 5_000 }).catch(() => false);
    if (!paymentDisabled) {
      await page.locator('input[placeholder*="4242"]').fill("4111111111111111");
      await page.locator('input[placeholder*="12/"]').fill("12/28");
      await page.locator('input[type="password"]').fill("123");
    }
    const chargeResponsePromise = page.waitForResponse((response) => response.url().includes("/api/payments/charge"), {
      timeout: 120_000,
    });
    const submitButtonName = paymentDisabled ? /Submit order/i : /Pay|Submit order/i;
    const submitButton = page.getByRole("button", { name: submitButtonName });
    await submitButton.waitFor({ state: "visible", timeout: 30_000 });
    await submitButton.click();
    const chargeResponse = await chargeResponsePromise;
    const chargeBody = await chargeResponse.json().catch(() => ({}));
    if (!chargeResponse.ok()) {
      throw new Error(`Payment failed: ${JSON.stringify(chargeBody)}`);
    }
    if (!String(chargeBody.chargeId ?? "").startsWith("test_bypass_")) {
      throw new Error(`QB bypass was not used: ${JSON.stringify(chargeBody)}`);
    }
    if (!(Number(chargeBody.chargedAmount) > 0)) {
      throw new Error(`Bypass response did not include a positive order amount: ${JSON.stringify(chargeBody)}`);
    }

    await page.waitForURL(/\/start\/confirmation/, { timeout: 60_000 });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await saveScreenshot(page, "confirmation");

    const browserState = await page.evaluate(() => {
      const raw = sessionStorage.getItem("tele_intake_form_state");
      return raw ? JSON.parse(raw) : {};
    });
    orderId = String(chargeBody.orderId ?? browserState.orderId ?? "");
    patientId = String(browserState.patientId ?? "");
    if (!orderId || !patientId) throw new Error(`Missing orderId/patientId after payment: ${JSON.stringify({ orderId, patientId })}`);
    console.log(`Order created: ${orderId}`);

    console.log("Step 6: poll PracticeQ automation");
    await poll(
      "PracticeQ automation",
      async () => {
        const status = await fetchJson<{ available?: boolean; status?: string; lastError?: string }>(
          `${BASE_URL}/api/clinical-consent/automation/${encodeURIComponent(orderId)}?patientId=${encodeURIComponent(patientId)}`
        );
        console.log(`PracticeQ status: ${status.available ? status.status : "not_available"}`);
        if (status.status === "completed") return status;
        if (status.status === "failed") throw new Error(`PracticeQ automation failed: ${status.lastError ?? "unknown error"}`);
        return null;
      },
      Number(process.env.E2E_PQ_TIMEOUT_MS ?? 12 * 60 * 1000),
      15_000
    );

    console.log("Step 7: verify order, bypass, and PracticeQ answers");
    const detail = await poll(
      "PracticeQ answer mirror and LifeFile sandbox dispatch",
      async () => {
        const headers = ADMIN_SECRET ? { "x-admin-secret": ADMIN_SECRET } : undefined;
        const payload = await fetchJson<OrderDetail>(
          `${BASE_URL}/api/orders/${encodeURIComponent(orderId)}?email=${encodeURIComponent(patient.email)}`,
          headers ? { headers } : undefined
        );
        const quickbooksStatus = payload.order?.quickbooksStatus;
        const orderStatus = payload.order?.status;
        const identityStatus = payload.order?.identityStatus;
        const pharmacyStatus = payload.order?.pharmacyStatus;
        const practiceq = payload.practiceq;
        const lifefileSuccess = payload.diagnostics?.integrationLogs?.some((log) =>
          log.integrationName === "lifefile" &&
          log.status === "success" &&
          /submitted to Life File/i.test(String(log.action ?? ""))
        );
        console.log(
          `Order poll: order=${orderStatus}, identity=${identityStatus}, qb=${quickbooksStatus}, pharmacy=${pharmacyStatus}/${payload.pharmacy?.status ?? "none"}, lf=${payload.pharmacy?.lifeFileOrderId ?? "none"}, pq=${practiceq?.status ?? practiceq?.reason ?? "missing"}`
        );
        if (quickbooksStatus !== "skipped") {
          throw new Error(`Expected QuickBooks status skipped, got ${quickbooksStatus}`);
        }
        if (!["verified", "manual_approved"].includes(String(identityStatus ?? ""))) {
          throw new Error(`Identity blocked pharmacy dispatch: ${identityStatus ?? "missing"} - ${payload.order?.identityReason ?? "no reason"}`);
        }
        if (pharmacyStatus === "error" || payload.pharmacy?.status === "error") {
          const lifefileError = payload.diagnostics?.integrationLogs?.find((log) => log.integrationName === "lifefile" && log.status === "error");
          throw new Error(`LifeFile sandbox dispatch failed: ${lifefileError?.error ?? "unknown error"}`);
        }
        if (orderStatus !== "sent_to_pharmacy" || pharmacyStatus !== "submitted" || payload.pharmacy?.status !== "submitted") {
          return null;
        }
        if (ADMIN_SECRET && !payload.pharmacy?.lifeFileOrderId) {
          return null;
        }
        if (ADMIN_SECRET && !lifefileSuccess) {
          return null;
        }
        if (!practiceq?.available || !/completed/i.test(String(practiceq.status ?? ""))) return null;
        requirePracticeQAnswers(practiceq);
        return payload;
      },
      Number(process.env.E2E_ORDER_TIMEOUT_MS ?? 5 * 60 * 1000),
      15_000
    );

    const practiceq = detail.practiceq as PracticeQMirror;
    console.log(
      JSON.stringify(
        {
          ok: true,
          orderId,
          patientEmail: patient.email,
          quickbooks: "bypassed",
          pharmacyStatus: detail.pharmacy?.status,
          lifeFileOrderId: detail.pharmacy?.lifeFileOrderId,
          practiceqStatus: practiceq.status,
          practiceqIntakeId: practiceq.intakeId,
          verifiedAnswers: expectedAnswers,
        },
        null,
        2
      )
    );
  } catch (error) {
    await saveScreenshot(page, "failure");
    throw error;
  } finally {
    await clearBrowserDraftState(page);
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
