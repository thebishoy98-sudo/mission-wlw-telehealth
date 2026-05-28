import { chromium, type Browser, type Page } from "playwright";
import * as dbServer from "@/lib/db.server";
import type { PracticeQAutomationJob } from "@/types";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  buildPracticeQFillPlan,
  findPracticeQAnswerForPrompt,
  shouldStopForPatientConsent,
} from "@/services/practiceq-browser-fill";

type WorkerResult = {
  status: PracticeQAutomationJob["status"];
  handoffUrl?: string;
  intakeId?: string;
  error?: string;
};

type RemoteSession = {
  jobId: string;
  token: string;
  browser: Browser;
  page: Page;
  expiresAt: string;
};

const remoteSessions = new Map<string, RemoteSession>();

export async function processPracticeQAutomationJob(job: PracticeQAutomationJob): Promise<WorkerResult> {
  const order = await dbServer.orderDb.getById(job.orderId);
  if (!order || order.paymentStatus !== "completed") {
    return { status: "failed", error: "Order is missing or payment is not complete" };
  }

  const [patient, answers, questions, uploads] = await Promise.all([
    dbServer.patientDb.getById(job.patientId),
    dbServer.answerDb.getByOrder(job.orderId),
    dbServer.questionDb.getAll(),
    dbServer.uploadDb.getByOrder(job.orderId).catch(() => [] as Awaited<ReturnType<typeof dbServer.uploadDb.getByOrder>>),
  ]);
  if (!patient) return { status: "failed", error: "Patient not found" };

  const fillPlan = buildPracticeQFillPlan(patient, answers, questions);
  const licenseUpload = uploads.find((u) => u.type === "driver_license");

  const browser = await chromium.launch({ headless: process.env.PRACTICEQ_WORKER_HEADLESS !== "false" });
  const page = await browser.newPage();

  try {
    await page.goto(job.practiceQStartUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await fillKnownPracticeQLogin(page, patient);
    await clickContinue(page);
    await fillPracticeQQuestionPages(page, fillPlan, licenseUpload?.base64Data ?? null);

    return {
      status: "awaiting_patient_signature",
      handoffUrl: page.url(),
    };
  } catch (error) {
    return { status: "failed", error: (error as Error).message };
  } finally {
    if (process.env.PRACTICEQ_WORKER_KEEP_BROWSER_OPEN !== "true") {
      await browser.close();
    }
  }
}

export async function processQueuedPracticeQAutomationJobs(limit = 5): Promise<WorkerResult[]> {
  const jobs = await dbServer.practiceqAutomationJobDb.getQueued(limit);
  const results: WorkerResult[] = [];

  for (const job of jobs) {
    const running = {
      status: "running" as const,
      attempts: job.attempts + 1,
      lockedAt: new Date().toISOString(),
    };
    await dbServer.practiceqAutomationJobDb.update(job.id, running);

    const result = await processPracticeQAutomationJob({ ...job, ...running });
    await dbServer.practiceqAutomationJobDb.update(job.id, {
      status: result.status,
      handoffUrl: result.handoffUrl,
      intakeId: result.intakeId,
      lastError: result.error,
    });
    if (result.status === "failed") {
      await dbServer.orderDb.update(job.orderId, { practiceQStatus: "error" }).catch(() => {});
    }
    results.push(result);
  }

  return results;
}

export async function startPracticeQRemoteSession(
  job: PracticeQAutomationJob,
  publicBaseUrl: string
): Promise<WorkerResult> {
  const order = await dbServer.orderDb.getById(job.orderId);
  if (!order || order.paymentStatus !== "completed") {
    return { status: "failed", error: "Order is missing or payment is not complete" };
  }

  const [patient, answers, questions, uploads] = await Promise.all([
    dbServer.patientDb.getById(job.patientId),
    dbServer.answerDb.getByOrder(job.orderId),
    dbServer.questionDb.getAll(),
    dbServer.uploadDb.getByOrder(job.orderId).catch(() => [] as Awaited<ReturnType<typeof dbServer.uploadDb.getByOrder>>),
  ]);
  if (!patient) return { status: "failed", error: "Patient not found" };

  const fillPlan = buildPracticeQFillPlan(patient, answers, questions);
  const licenseUpload = uploads.find((u) => u.type === "driver_license");

  const browser = await chromium.launch({
    headless: process.env.PRACTICEQ_REMOTE_HEADLESS !== "false",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    await page.goto(job.practiceQStartUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await fillKnownPracticeQLogin(page, patient);
    await clickContinue(page);
    await fillPracticeQQuestionPages(page, fillPlan, licenseUpload?.base64Data ?? null);

    remoteSessions.set(job.id, {
      jobId: job.id,
      token: job.handoffToken,
      browser,
      page,
      expiresAt: job.handoffExpiresAt,
    });

    return {
      status: "awaiting_patient_signature",
      handoffUrl: `${publicBaseUrl.replace(/\/$/, "")}/session/${encodeURIComponent(job.id)}?token=${encodeURIComponent(job.handoffToken)}`,
    };
  } catch (error) {
    await browser.close().catch(() => {});
    return { status: "failed", error: (error as Error).message };
  }
}

export function getPracticeQRemoteSession(jobId: string, token: string): RemoteSession | null {
  const session = remoteSessions.get(jobId);
  if (!session || session.token !== token) return null;
  if (Date.parse(session.expiresAt) < Date.now()) {
    closePracticeQRemoteSession(jobId).catch(() => {});
    return null;
  }
  return session;
}

export async function closePracticeQRemoteSession(jobId: string): Promise<void> {
  const session = remoteSessions.get(jobId);
  if (!session) return;
  remoteSessions.delete(jobId);
  await session.browser.close().catch(() => {});
}

export async function fillKnownPracticeQLogin(page: Page, patient: { firstName: string; lastName: string; email: string; phone: string }) {
  const fullName = [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim();
  await page.locator("#Name").fill(fullName).catch(() => {});
  await page.locator("#Email").fill(patient.email || patient.phone).catch(() => {});
}

export async function fillPracticeQQuestionPages(
  page: Page,
  fillPlan: ReturnType<typeof buildPracticeQFillPlan>,
  licenseBase64: string | null = null,
) {
  let consentFilledOnce = false;

  for (let step = 0; step < 40; step += 1) {
    await page.waitForTimeout(750);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const url = page.url();

    // Consent page — fill text fields, then stop for patient signature
    if (shouldStopForPatientConsent(bodyText) || url.includes("/consent/")) {
      if (!consentFilledOnce) {
        consentFilledOnce = true;
        await fillConsentPageFields(page, fillPlan);
      }
      return; // stop — patient must sign manually via remote session
    }

    const filled = await fillVisibleFields(page, fillPlan);
    await clickMatchingChoices(page, fillPlan);

    // Upload identity document if there is a file input on this page
    if (licenseBase64) {
      await uploadIdentityDocument(page, licenseBase64);
    }

    const moved = await clickContinue(page).catch(() => false);
    if (!moved && filled === 0) return;
  }
}

// ── Consent page — fill text/checkbox fields, leave signature for patient ──

async function fillConsentPageFields(page: Page, fillPlan: ReturnType<typeof buildPracticeQFillPlan>) {
  const patient = fillPlan.find((f) => f.prompt === "Full Name");
  const dob     = fillPlan.find((f) => f.prompt === "Date of Birth");
  const fullName = patient?.value ?? "";
  const dobVal   = dob?.value ?? "";
  const initials = fullName.split(" ").map((w) => w[0]?.toUpperCase() ?? "").join("");

  // Patient Name field (#jvla)
  await page.locator("#jvla").fill(fullName).catch(() => {});
  // Date of Birth field (#1y3x)
  await page.locator("#1y3x").fill(dobVal).catch(() => {});
  // Telehealth consent checkbox
  const cb = page.locator('input[name="check_jm9u"]');
  if (await cb.isVisible({ timeout: 1500 }).catch(() => false) && !(await cb.isChecked())) {
    await cb.check();
  }
  // Initials fields (two inputs with placeholder="Initials")
  const initialInputs = page.locator('input[placeholder="Initials"]');
  const initialCount = await initialInputs.count();
  for (let i = 0; i < initialCount; i++) {
    await initialInputs.nth(i).fill(initials).catch(() => {});
  }
  // Print name / signature text field (#name)
  await page.locator("#name").fill(fullName).catch(() => {});

  // Also run generic fill for any other text fields on the consent page
  await fillVisibleFields(page, fillPlan);
}

// ── Identity document upload (question 10 file input) ────────────────────

async function uploadIdentityDocument(page: Page, base64Data: string) {
  const fileInput = page.locator('input[type="file"]').first();
  if (!(await fileInput.isVisible({ timeout: 1500 }).catch(() => false))) return;

  let tmpPath: string | null = null;
  try {
    // Decode base64 → temp JPEG file
    const buffer = Buffer.from(
      base64Data.replace(/^data:image\/[a-z]+;base64,/, ""),
      "base64",
    );
    tmpPath = path.join(os.tmpdir(), `pq-id-${Date.now()}.jpg`);
    fs.writeFileSync(tmpPath, buffer);
    await fileInput.setInputFiles(tmpPath);
  } catch {
    // Non-fatal — leave upload for manual completion
  } finally {
    if (tmpPath) fs.unlink(tmpPath, () => {});
  }
}

async function fillVisibleFields(page: Page, fillPlan: ReturnType<typeof buildPracticeQFillPlan>): Promise<number> {
  const fields = page.locator("input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea");
  const count = await fields.count();
  let filled = 0;

  for (let i = 0; i < count; i += 1) {
    const field = fields.nth(i);
    if (!(await field.isVisible().catch(() => false))) continue;
    const current = await field.inputValue().catch(() => "");
    if (current.trim()) continue;
    const prompt = await field.evaluate((el) => {
      const label = el.closest("label")?.textContent ?? "";
      const parent = el.parentElement?.textContent ?? "";
      const grand = el.parentElement?.parentElement?.textContent ?? "";
      return [label, parent, grand, el.getAttribute("placeholder") ?? "", el.getAttribute("aria-label") ?? ""].join(" ");
    });
    const answer = findPracticeQAnswerForPrompt(prompt, fillPlan);
    if (!answer) continue;
    await field.fill(answer).catch(() => {});
    filled += 1;
  }

  return filled;
}

async function clickMatchingChoices(page: Page, fillPlan: ReturnType<typeof buildPracticeQFillPlan>) {
  const labels = page.locator("label");
  const count = await labels.count();
  for (let i = 0; i < count; i += 1) {
    const label = labels.nth(i);
    const text = (await label.innerText().catch(() => "")).trim();
    if (!text || shouldStopForPatientConsent(text)) continue;
    const answer = findPracticeQAnswerForPrompt(text, fillPlan);
    if (!answer) continue;
    if (answer.toLowerCase() === text.toLowerCase() || text.toLowerCase().includes(answer.toLowerCase())) {
      await label.click().catch(() => {});
    }
  }
}

async function clickContinue(page: Page): Promise<boolean> {
  const button = page
    .getByRole("button", { name: /continue|next/i })
    .or(page.locator("button, input[type='button'], input[type='submit']").filter({ hasText: /continue|next/i }))
    .first();
  if (!(await button.isVisible().catch(() => false))) return false;
  await button.click();
  return true;
}
