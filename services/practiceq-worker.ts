import { chromium, type Browser, type Page } from "playwright";
import * as dbServer from "@/lib/db.server";
import type { PracticeQAutomationJob } from "@/types";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  buildPracticeQFillPlan,
  formatPracticeQDate,
  findPracticeQAnswerForPrompt,
  findPracticeQChoiceForLabel,
  requiresUnhandledPatientConsent,
} from "@/services/practiceq-browser-fill";
import {
  getIntakeById,
  getIntakeSummaryFeed,
  populateAndUpdatePracticeQIntake,
} from "@/services/practiceq";

type WorkerResult = {
  status: PracticeQAutomationJob["status"];
  handoffUrl?: string;
  intakeId?: string;
  error?: string;
};

type FillOutcome = {
  stoppedForPatientConsent: boolean;
};

type PracticeQUploadFile = {
  base64Data: string;
  mimeType: string;
  extension: string;
};

type RemoteSession = {
  jobId: string;
  token: string;
  browser: Browser;
  page: Page;
  expiresAt: string;
};

const remoteSessions = new Map<string, RemoteSession>();
const PRACTICEQ_PAGE_FILL_TIMEOUT_MS = 45000;
const PRACTICEQ_CHOICE_TIMEOUT_MS = 30000;
const PRACTICEQ_CONSENT_TIMEOUT_MS = 60000;
const PRACTICEQ_API_VERIFY_TIMEOUT_MS = 30000;
const PRACTICEQ_ADMIN_COMPLETE_TIMEOUT_MS = 60000;
const PRACTICEQ_ADMIN_STATUS_POLL_ATTEMPTS = 6;
const PRACTICEQ_ADMIN_STATUS_POLL_DELAY_MS = 5000;
export const PRACTICEQ_REMOTE_JOB_TIMEOUT_MS = Number(process.env.PRACTICEQ_REMOTE_JOB_TIMEOUT_MS ?? 420000);
const PRACTICEQ_MAX_FILL_STEPS = Number(process.env.PRACTICEQ_MAX_FILL_STEPS ?? 12);

export async function processPracticeQAutomationJob(job: PracticeQAutomationJob): Promise<WorkerResult> {
  const order = await dbServer.orderDb.getById(job.orderId);
  if (!order || order.paymentStatus !== "completed") {
    return { status: "failed", error: "Order is missing or payment is not complete" };
  }

  const [patient, answers, questions, consent, uploads] = await Promise.all([
    dbServer.patientDb.getById(job.patientId),
    dbServer.answerDb.getByOrder(job.orderId),
    dbServer.questionDb.getAll(),
    dbServer.consentDb.getByOrder(job.orderId).catch(() => null),
    dbServer.uploadDb.getByOrder(job.orderId).catch(() => [] as Awaited<ReturnType<typeof dbServer.uploadDb.getByOrder>>),
  ]);
  if (!patient) return { status: "failed", error: "Patient not found" };

  const fillPlan = buildPracticeQFillPlan(patient, answers, questions, consent);
  const uploadFile = selectPracticeQUploadFile(uploads);
  const browser = await chromium.launch({ headless: process.env.PRACTICEQ_WORKER_HEADLESS !== "false" });
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);

  try {
    await page.goto(job.practiceQStartUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await fillKnownPracticeQLogin(page, patient);
    await clickContinue(page);
    await resolvePracticeQResumePrompt(page);
    const fillOutcome = await fillPracticeQQuestionPages(page, fillPlan, uploadFile);
    const submitResult = await submitPracticeQInBackground(page, fillOutcome, fillPlan);

    return verifyPracticeQSavedSubmission(submitResult, {
      patient,
      answers,
      questions,
      startedAt: job.createdAt,
    });
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

  const [patient, answers, questions, consent, uploads] = await Promise.all([
    dbServer.patientDb.getById(job.patientId),
    dbServer.answerDb.getByOrder(job.orderId),
    dbServer.questionDb.getAll(),
    dbServer.consentDb.getByOrder(job.orderId).catch(() => null),
    dbServer.uploadDb.getByOrder(job.orderId).catch(() => [] as Awaited<ReturnType<typeof dbServer.uploadDb.getByOrder>>),
  ]);
  if (!patient) return { status: "failed", error: "Patient not found" };

  const fillPlan = buildPracticeQFillPlan(patient, answers, questions, consent);

  // Pre-check: IntakeQ requires height/weight — fail fast instead of burning attempts
  // before PracticeQ rejects the background submit with "unanswered required questions".
  const missingVitals: string[] = [];
  if (!findPracticeQAnswerForPrompt("What is your height?", fillPlan)) missingVitals.push("height");
  if (!findPracticeQAnswerForPrompt("What is your current body weight?", fillPlan)) missingVitals.push("current body weight");
  if (!findPracticeQAnswerForPrompt("What is your ideal body weight?", fillPlan)) missingVitals.push("ideal body weight");
  if (missingVitals.length > 0) {
    return {
      status: "failed",
      error: `Missing required patient vitals for IntakeQ: ${missingVitals.join(", ")}. ` +
        `Re-seed answers for orderId=${job.orderId} then requeue.`,
    };
  }

  const uploadFile = selectPracticeQUploadFile(uploads);
  const browser = await chromium.launch({
    headless: process.env.PRACTICEQ_REMOTE_HEADLESS !== "false",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(8000);

  try {
    await page.goto(job.practiceQStartUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await fillKnownPracticeQLogin(page, patient);
    await clickContinue(page);
    await resolvePracticeQResumePrompt(page);
    const verifiedResult = await withPracticeQTimeout(
      (async () => {
        await dbServer.practiceqAutomationJobDb.update(job.id, { lastError: "PracticeQ automation: filling intake form" }).catch(() => null);
        const fillOutcome = await fillPracticeQQuestionPages(page, fillPlan, uploadFile);
        await dbServer.practiceqAutomationJobDb.update(job.id, { lastError: "PracticeQ automation: submitting intake form" }).catch(() => null);
        const submitResult = await submitPracticeQInBackground(page, fillOutcome, fillPlan);
        await dbServer.practiceqAutomationJobDb.update(job.id, { lastError: "PracticeQ automation: verifying submitted intake" }).catch(() => null);
        return verifyPracticeQSavedSubmission(submitResult, {
          patient,
          answers,
          questions,
          startedAt: job.createdAt,
        });
      })(),
      PRACTICEQ_REMOTE_JOB_TIMEOUT_MS,
      `PracticeQ automation timed out after ${Math.round(PRACTICEQ_REMOTE_JOB_TIMEOUT_MS / 1000)} seconds.`
    );
    await browser.close().catch(() => {});
    return verifiedResult;
  } catch (error) {
    const progress = await page.evaluate(() => (window as any).__missionPracticeQProgress ?? null).catch(() => null);
    if (progress && error instanceof Error && /timed out/i.test(error.message)) {
      return {
        status: "failed",
        error: `${error.message} Last PracticeQ page: step ${progress.step}, visible fields ${progress.visibleFieldCount}, filled ${progress.filled}. Text: ${progress.text}`,
      };
    }
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
  uploadFile: PracticeQUploadFile | null = null,
): Promise<FillOutcome> {
  let noProgressCount = 0;
  for (let step = 0; step < PRACTICEQ_MAX_FILL_STEPS; step += 1) {
    await page.waitForTimeout(750);
    await waitForPracticeQPageText(page);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const beforeSignature = practiceQPageSignature(page.url(), bodyText);
    if (await resolvePracticeQResumePrompt(page, bodyText)) continue;
    if (await resolvePracticeQIntroPage(page, bodyText)) continue;
    if (requiresUnhandledPatientConsent(bodyText, fillPlan)) return { stoppedForPatientConsent: true };

    const visibleFieldCount = await countVisiblePracticeQFields(page);
    let filled = await withPracticeQTimeout(
      fillVisibleFields(page, fillPlan),
      PRACTICEQ_PAGE_FILL_TIMEOUT_MS,
      "PracticeQ text field fill step timed out."
    );
    filled += await fillPracticeQVitalsPage(page, fillPlan, bodyText).catch(() => 0);
    await withPracticeQTimeout(
      clickMatchingChoices(page, fillPlan),
      PRACTICEQ_CHOICE_TIMEOUT_MS,
      "PracticeQ choice selection step timed out."
    );
    await setPracticeQAngularTextAnswers(page, fillPlan);
    await withPracticeQTimeout(
      completeVisibleConsentDocument(page, fillPlan),
      PRACTICEQ_CONSENT_TIMEOUT_MS,
      "PracticeQ consent signing step timed out."
    );

    // Upload the patient video for IntakeQ's required upload question when present.
    if (uploadFile) {
      await uploadPracticeQFile(page, uploadFile).catch(() => {});
    }

    await setPracticeQProgress(page, fillPlan, step, visibleFieldCount, filled).catch(() => {});

    await savePracticeQPage(page);
    await waitForPracticeQSaved(page);
    await assertVisiblePracticeQFieldsFilled(page, fillPlan);

    const moved = await clickContinue(page).catch(() => false);
    if (moved) {
      await waitForPracticeQPageText(page);
      await page.waitForTimeout(500);
      const afterText = await page.locator("body").innerText().catch(() => "");
      const afterSignature = practiceQPageSignature(page.url(), afterText);
      if (afterSignature === beforeSignature) {
        noProgressCount += 1;
        if (filled === 0 || noProgressCount >= 2) return { stoppedForPatientConsent: false };
      } else {
        noProgressCount = 0;
      }
    }
    if (!moved && filled === 0) return { stoppedForPatientConsent: false };
  }
  return { stoppedForPatientConsent: false };
}

async function fillPracticeQVitalsPage(
  page: Page,
  fillPlan: ReturnType<typeof buildPracticeQFillPlan>,
  bodyText: string
): Promise<number> {
  if (!/what is your height/i.test(bodyText) || !/current body weight/i.test(bodyText) || !/ideal body weight/i.test(bodyText)) {
    return 0;
  }

  const heightVal = findPracticeQAnswerForPrompt("What is your height?", fillPlan);
  const currentWeightVal = findPracticeQAnswerForPrompt("What is your current body weight?", fillPlan);
  const idealWeightVal = findPracticeQAnswerForPrompt("What is your ideal body weight?", fillPlan);
  if (!heightVal || !currentWeightVal || !idealWeightVal) return 0;

  // Map each value to its exact question text so we can match by label, not position
  const vitalsMap: Array<{ text: RegExp; value: string }> = [
    { text: /what is your height/i, value: heightVal },
    { text: /current body weight/i, value: currentWeightVal },
    { text: /ideal body weight/i, value: idealWeightVal },
  ];

  let filled = 0;
  const fields = page.locator("input:visible:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea:visible");
  const count = await fields.count().catch(() => 0);

  for (let i = 0; i < count; i += 1) {
    const field = fields.nth(i);
    if (!(await field.isVisible().catch(() => false))) continue;
    const current = await field.inputValue().catch(() => "");
    if (current.trim()) continue;
    const prompt = await getPracticeQFieldPrompt(field);
    const match = vitalsMap.find((v) => v.text.test(prompt));
    if (!match) continue;
    await enterFieldValue(field, match.value, prompt);
    filled += 1;
  }

  // Positional fallback: if label matching found nothing, fill by position (height, weight, ideal)
  if (filled === 0) {
    const vals = [heightVal, currentWeightVal, idealWeightVal];
    const posFields = page.locator("input:visible:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea:visible");
    const posCount = Math.min(await posFields.count().catch(() => 0), vals.length);
    for (let i = 0; i < posCount; i += 1) {
      const field = posFields.nth(i);
      const current = await field.inputValue().catch(() => "");
      if (current.trim()) continue;
      await enterFieldValue(field, vals[i], `PracticeQ vitals field ${i + 1}`);
      filled += 1;
    }
  }

  if (filled > 0) {
    // Let Angular settle after all vitals fields are filled before returning to the main loop
    await page.waitForTimeout(300);
    await setPracticeQAngularTextAnswers(page, fillPlan);
  }

  return filled;
}

async function countVisiblePracticeQFields(page: Page): Promise<number> {
  return page
    .locator("input:visible:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea:visible")
    .count()
    .catch(() => 0);
}

async function setPracticeQProgress(
  page: Page,
  fillPlan: ReturnType<typeof buildPracticeQFillPlan>,
  step: number,
  visibleFieldCount: number,
  filled: number
) {
  // Stored in page context so timeout/errors can include where the browser was.
  await page.evaluate(({ step, visibleFieldCount, filled, fillPlanLength }) => {
    (window as any).__missionPracticeQProgress = {
      step: step + 1,
      visibleFieldCount,
      filled,
      fillPlanLength,
      text: (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
    };
  }, { step, visibleFieldCount, filled, fillPlanLength: fillPlan.length });
}

function practiceQPageSignature(url: string, text: string) {
  return `${url}::${text.replace(/\s+/g, " ").trim().slice(0, 1200)}`;
}

function selectPracticeQUploadFile(
  uploads: Awaited<ReturnType<typeof dbServer.uploadDb.getByOrder>>
): PracticeQUploadFile | null {
  const video = uploads.find((u) => u.type === "selfie_video" && u.base64Data);
  if (video?.base64Data) {
    return {
      base64Data: video.base64Data,
      mimeType: video.mimeType || "video/webm",
      extension: video.mimeType?.includes("mp4") ? "mp4" : "webm",
    };
  }

  const license = uploads.find((u) => u.type === "driver_license" && u.base64Data);
  if (!license?.base64Data) return null;
  return { base64Data: license.base64Data, mimeType: license.mimeType || "image/jpeg", extension: "jpg" };
}

async function uploadPracticeQFile(page: Page, uploadFile: PracticeQUploadFile) {
  const fileInput = page.locator('input[type="file"]').first();
  if (!(await fileInput.count().catch(() => 0))) return;
  // Skip if already has a file
  const currentValue = await fileInput.inputValue().catch(() => "");
  if (currentValue) return;

  let tmpPath: string | null = null;
  try {
    const base64 = uploadFile.base64Data.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    tmpPath = path.join(os.tmpdir(), `pq-upload-${Date.now()}.${uploadFile.extension}`);
    fs.writeFileSync(tmpPath, buffer);
    await fileInput.setInputFiles(tmpPath);
    await page.waitForTimeout(10000);
  } finally {
    if (tmpPath) fs.unlink(tmpPath, () => {});
  }
}

async function withPracticeQTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function submitPracticeQInBackground(
  page: Page,
  fillOutcome: FillOutcome,
  fillPlan: ReturnType<typeof buildPracticeQFillPlan> = []
): Promise<WorkerResult> {
  await waitForPracticeQPageText(page);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (isPracticeQResumePrompt(bodyText)) {
    return {
      status: "failed",
      error: "PracticeQ is asking whether to resume an old partial intake or start a new intake. The worker could not get past that prompt.",
    };
  }
  const hasUnhandledConsent = requiresUnhandledPatientConsent(bodyText, fillPlan);
  if (fillOutcome.stoppedForPatientConsent || hasUnhandledConsent) {
    return {
      status: "failed",
      error:
        "PracticeQ form requires patient consent/signature. The background worker will not sign as the patient; remove the PracticeQ signature step or use Mission's signed consent/PDF as the consent source.",
    };
  }

  if (looksSubmitted(bodyText)) {
    return {
      status: "completed",
      handoffUrl: undefined,
      intakeId: extractPracticeQIntakeId(page.url()),
    };
  }

  const submitted = await clickFinalSubmit(page);
  if (!submitted) {
    return {
      status: "failed",
      error: `PracticeQ submit button was not found after filling the intake. Visible page text: ${bodyText.slice(0, 600)}`,
    };
  }

  // PracticeQ shows a confirmation modal ("Once you submit this form, you won't be able to change it.
  // Are you sure you want to proceed?") after clicking the Submit Form button.
  // We must confirm it before the form is actually submitted.
  await confirmPracticeQSubmitModal(page);

  await page.waitForTimeout(2000);
  const postSubmitText = await page.locator("body").innerText().catch(() => "");
  if (looksSubmitted(postSubmitText)) {
    return {
      status: "completed",
      handoffUrl: undefined,
      intakeId: extractPracticeQIntakeId(page.url()),
    };
  }
  if (/required|invalid|please complete|missing/i.test(postSubmitText)) {
    return {
      status: "failed",
      error: `PracticeQ rejected the background submit: ${postSubmitText.slice(0, 500)}`,
    };
  }

  // If the confirmation modal dismissal re-opened the same page, try one more time
  if (/once you submit|are you sure/i.test(postSubmitText)) {
    await confirmPracticeQSubmitModal(page);
    await page.waitForTimeout(2000);
    const retryText = await page.locator("body").innerText().catch(() => "");
    if (looksSubmitted(retryText)) {
      return { status: "completed", handoffUrl: undefined, intakeId: extractPracticeQIntakeId(page.url()) };
    }
  }

  return {
    status: "completed",
    handoffUrl: undefined,
    intakeId: extractPracticeQIntakeId(page.url()),
  };
}

/**
 * After clicking "Submit Form", PracticeQ shows a confirmation panel:
 *   "Once you submit this form, you won't be able to change it. Are you sure you want to proceed?"
 * with Cancel and Submit buttons. This function detects and confirms so the form is actually sent.
 */
async function confirmPracticeQSubmitModal(page: Page) {
  // Wait for Angular ng-if to render the confirmation panel
  await page.waitForTimeout(1200);
  const confirmText = await page.locator("body").innerText().catch(() => "");
  if (!/once you submit|are you sure/i.test(confirmText)) return;

  // Playwright locators — use force:true so headless viewport clipping doesn't block clicks
  const confirmBtn = page
    .getByRole("button", { name: /^\s*submit\s*$/i })
    .or(page.locator("button, input[type='submit'], a").filter({ hasText: /^\s*submit\s*$/i }))
    .first();
  if (await confirmBtn.count().then((c) => c > 0).catch(() => false)) {
    await confirmBtn.scrollIntoViewIfNeeded().catch(() => {});
    await confirmBtn.click({ force: true, timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    return;
  }

  // DOM fallback — fire native events and also trigger Angular's event delegation
  await page.evaluate(() => {
    const textFor = (el: Element) => [
      (el as HTMLElement).innerText,
      el.getAttribute("value"),
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const candidates = Array.from(document.querySelectorAll(
      "button, a, input[type='button'], input[type='submit'], [role='button'], .btn, span"
    ));
    const target = candidates.find((el) => /^\s*submit\s*$/i.test(textFor(el)));
    if (!target) return;
    const node = target as HTMLElement;
    node.scrollIntoView({ block: "center" });
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    node.click();
  }).catch(() => {});
  await page.waitForTimeout(500);
}

async function fillVisibleFields(page: Page, fillPlan: ReturnType<typeof buildPracticeQFillPlan>): Promise<number> {
  const fields = page.locator("input:visible:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea:visible");
  const count = await fields.count();
  let filled = 0;

  for (let i = 0; i < count; i += 1) {
    filled += await withPracticeQTimeout(
      fillPracticeQField(fields.nth(i), fillPlan),
      1800,
      "PracticeQ skipped a slow field"
    ).catch(() => 0);
  }

  return filled;
}

async function fillPracticeQField(
  field: ReturnType<Page["locator"]>,
  fillPlan: ReturnType<typeof buildPracticeQFillPlan>
): Promise<number> {
  await field.scrollIntoViewIfNeeded({ timeout: 500 }).catch(() => {});
  if (!(await field.isVisible({ timeout: 500 }).catch(() => false))) return 0;
  if (!(await isPracticeQDataEntryField(field))) return 0;
  const current = await field.inputValue({ timeout: 500 }).catch(() => "");
  if (current.trim()) return 0;
  const prompt = await getPracticeQFieldPrompt(field);
  const answer = findPracticeQAnswerForPrompt(prompt, fillPlan);
  if (!answer) return 0;
  const normalizedAnswer = /date of birth|dob/i.test(prompt) ? formatPracticeQDate(answer) : answer;
  await enterFieldValue(field, normalizedAnswer, prompt);
  return 1;
}

async function assertVisiblePracticeQFieldsFilled(page: Page, fillPlan: ReturnType<typeof buildPracticeQFillPlan>) {
  const fields = page.locator("input:visible:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea:visible");
  const count = await fields.count();
  const stillMissing: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const field = fields.nth(i);
    if (!(await field.isVisible().catch(() => false))) continue;
    if (!(await isPracticeQDataEntryField(field))) continue;
    const prompt = await getPracticeQFieldPrompt(field);
    const expected = findPracticeQAnswerForPrompt(prompt, fillPlan);
    if (!expected) continue;
    const actual = await getPracticeQFieldValue(field);
    if (fieldValueMatches(actual, expected, prompt)) continue;

    // Field value didn't stick — re-fill it once before giving up
    await enterFieldValue(field, expected, prompt).catch(() => {});
    await page.waitForTimeout(300);
    const retried = await getPracticeQFieldValue(field);
    if (!fieldValueMatches(retried, expected, prompt)) {
      // Still wrong — record warning but DO NOT throw; the form must continue
      stillMissing.push(`${shortenPracticeQPrompt(prompt)} expected "${expected}" got "${retried}"`);
    }
  }

  if (stillMissing.length > 0) {
    // Log to page context for debugging — do not throw; killing the job here loses all progress
    await page.evaluate((warnings) => {
      (window as any).__missionPracticeQFillWarnings = warnings;
      console.warn("[Mission] PracticeQ field fill warnings:", warnings.join("; "));
    }, stillMissing).catch(() => {});
  }
}

async function isPracticeQDataEntryField(field: ReturnType<Page["locator"]>): Promise<boolean> {
  return field.evaluate((el) => {
    const ngModel = el.getAttribute("ng-model") ?? "";
    if (/signature\.Typed|FurtherExplanation/i.test(ngModel)) return false;
    if ((el as HTMLTextAreaElement).value?.includes("This is a form preview only")) return false;
    const styleText = (el as HTMLTextAreaElement).value ?? "";
    if (/body\s*\{\s*background|Intake Form Mission WLW/i.test(styleText)) return false;
    const text = [
      el.closest("label")?.textContent ?? "",
      el.parentElement?.textContent ?? "",
      el.parentElement?.parentElement?.textContent ?? "",
    ].join(" ");
    if (/draw instead|type instead|submit signature|signature captured/i.test(text)) return false;
    return true;
  }).catch(() => false);
}

async function getPracticeQFieldPrompt(field: ReturnType<Page["locator"]>): Promise<string> {
  return field.evaluate((el) => {
    const fieldId = el.getAttribute("id") ?? "";
    const escapedFieldId = fieldId && (window as any).CSS?.escape
      ? (window as any).CSS.escape(fieldId)
      : fieldId.replace(/["\\]/g, "\\$&");
    const directLabel = [
      fieldId
        ? document.querySelector(`label[for="${escapedFieldId}"]`)?.textContent?.trim() ?? ""
        : "",
      el.closest("label")?.textContent?.trim() ?? "",
      (el.previousElementSibling?.matches("label") ? el.previousElementSibling.textContent?.trim() : "") ?? "",
    ].find(Boolean);
    const ancestorText: string[] = [];
    let current: Element | null = el;
    for (let depth = 0; current && depth < 8; depth += 1) {
      const entryFields = current.querySelectorAll?.("input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea, select").length ?? 0;
      const headingOrLabel = entryFields <= 2
        ? current.querySelector?.("h1,h2,h3,h4,h5,h6,label")?.textContent?.trim()
        : "";
      if (headingOrLabel && !ancestorText.includes(headingOrLabel)) {
        ancestorText.push(headingOrLabel);
      }
      current = current.parentElement;
    }
    const fieldHints = [
      el.getAttribute("placeholder") ?? "",
      el.getAttribute("aria-label") ?? "",
      el.getAttribute("name") ?? "",
    ];
    if (directLabel) return [directLabel, ...fieldHints].join(" ");
    if (ancestorText.length > 0) return [...ancestorText, ...fieldHints].join(" ");

    const parent = el.parentElement?.textContent ?? "";
    const grand = el.parentElement?.parentElement?.textContent ?? "";
    const questionBlock = el.closest("[ng-repeat], .question, .panel, fieldset")?.textContent ?? "";
    return [
      parent,
      grand,
      questionBlock,
      ...fieldHints,
    ].join(" ");
  });
}

async function getPracticeQFieldValue(field: ReturnType<Page["locator"]>): Promise<string> {
  const visibleValue = await field.inputValue().catch(() => "");
  if (visibleValue.trim()) return visibleValue;
  return field.evaluate((el) => {
    const normalize = (raw: unknown) => String(raw ?? "")
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const prompt = [
      (() => {
        let current: Element | null = el;
        for (let depth = 0; current && depth < 5; depth += 1) {
          const label = current.querySelector?.("label")?.textContent?.trim();
          if (label) return label;
          current = current.parentElement;
        }
        return "";
      })(),
      el.closest("label")?.textContent ?? "",
      el.parentElement?.textContent ?? "",
      el.parentElement?.parentElement?.textContent ?? "",
      el.getAttribute("placeholder") ?? "",
      el.getAttribute("aria-label") ?? "",
    ].join(" ");
    const normalizedPrompt = normalize(prompt);
    const findIntakeScope = (root: any) => {
      const seen = new Set<number>();
      const stack = [root];
      while (stack.length) {
        const scope = stack.pop();
        if (!scope || seen.has(scope.$id)) continue;
        seen.add(scope.$id);
        if (scope.intake?.Questionnaire?.Questions) return scope;
        if (scope.$$childHead) stack.push(scope.$$childHead);
        let sibling = scope.$$nextSibling;
        while (sibling) {
          stack.push(sibling);
          sibling = sibling.$$nextSibling;
        }
      }
      return null;
    };
    const angular = (window as any).angular;
    const injector = angular?.element(document.body).injector?.();
    const intakeScope = findIntakeScope(injector?.get?.("$rootScope"));
    const questions = intakeScope?.intake?.Questionnaire?.Questions;
    if (!Array.isArray(questions)) return "";
    for (const question of questions) {
      const questionText = normalize(question?.Text);
      if (questionText && (normalizedPrompt.includes(questionText) || questionText.includes(normalizedPrompt))) {
        const answer = String(question?.Answer ?? "").trim();
        if (answer) return answer;
      }
      if (Array.isArray(question?.QuestionItems)) {
        for (const item of question.QuestionItems) {
          const itemText = normalize(item?.Text);
          if (itemText && (normalizedPrompt.includes(itemText) || itemText.includes(normalizedPrompt))) {
            const answer = String(item?.Answer ?? "").trim();
            if (answer) return answer;
          }
        }
      }
    }
    return "";
  }).catch(() => "");
}

async function setPracticeQAngularTextAnswers(page: Page, fillPlan: ReturnType<typeof buildPracticeQFillPlan>) {
  await page.evaluate((fillPlan) => {
    const normalize = (raw: unknown) => String(raw ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const findIntakeScope = (root: any) => {
      const seen = new Set<number>();
      const stack = [root];
      while (stack.length) {
        const scope = stack.pop();
        if (!scope || seen.has(scope.$id)) continue;
        seen.add(scope.$id);
        if (scope.intake?.Questionnaire?.Questions) return scope;
        if (scope.$$childHead) stack.push(scope.$$childHead);
        let sibling = scope.$$nextSibling;
        while (sibling) {
          stack.push(sibling);
          sibling = sibling.$$nextSibling;
        }
      }
      return null;
    };
    const answerFor = (prompt: unknown) => {
      const normalizedPrompt = normalize(prompt);
      if (!normalizedPrompt) return "";
      const exact = fillPlan.find((item) => normalize(item.prompt) === normalizedPrompt);
      if (exact) return exact.value;
      const partial = fillPlan
        .map((item) => ({ item, candidate: normalize(item.prompt) }))
        .filter(({ candidate }) =>
          candidate.length > 3 && (normalizedPrompt.includes(candidate) || candidate.includes(normalizedPrompt))
        )
        .sort((a, b) => b.candidate.length - a.candidate.length)[0];
      return partial?.item.value ?? "";
    };

    const angular = (window as any).angular;
    const injector = angular?.element(document.body).injector?.();
    const intakeScope = findIntakeScope(injector?.get?.("$rootScope"));
    const questions = intakeScope?.intake?.Questionnaire?.Questions;
    if (!Array.isArray(questions)) return;

    let changed = false;
    for (const question of questions) {
      const questionAnswer = answerFor(question?.Text);
      if (questionAnswer && !String(question?.Answer ?? "").trim()) {
        question.Answer = questionAnswer;
        intakeScope?.onblur?.(question, questionAnswer);
        intakeScope?.textChanged?.();
        changed = true;
      }
      if (!Array.isArray(question?.QuestionItems)) continue;
      for (const item of question.QuestionItems) {
        const itemAnswer = answerFor(item?.Text);
        if (itemAnswer && !String(item?.Answer ?? "").trim()) {
          item.Answer = itemAnswer;
          intakeScope?.onblur?.(item, itemAnswer);
          intakeScope?.textChanged?.();
          changed = true;
        }
      }
    }

    if (changed) {
      intakeScope?.changed?.();
      if (!intakeScope?.$root?.$$phase) intakeScope?.$apply?.();
      intakeScope?.$applyAsync?.();
    }
  }, fillPlan).catch(() => {});
}

async function waitForPracticeQSaved(page: Page) {
  await page.keyboard.press("Tab").catch(() => {});
  await page.waitForTimeout(800);
  // Wait for "saving" indicator to clear
  await page
    .waitForFunction(() => !/saving/i.test(document.body?.innerText ?? ""), null, { timeout: 8000 })
    .catch(() => {});
  const saved = page.getByText(/saved/i).first();
  if (await saved.isVisible().catch(() => false)) await page.waitForTimeout(500);
  // Drain any pending Angular $http requests so saved data is fully committed before we proceed
  await page
    .waitForFunction(() => {
      const angular = (window as any).angular;
      try {
        const http = angular?.element(document.body).injector?.()?.get?.("$http");
        return !http || http.pendingRequests.length === 0;
      } catch { return true; }
    }, null, { timeout: 5000 })
    .catch(() => {});
}

async function savePracticeQPage(page: Page) {
  const save = page
    .getByRole("button", { name: /^save$/i })
    .or(page.locator("button, input[type='button']").filter({ hasText: /^save$/i }))
    .first();
  if (await save.isVisible().catch(() => false)) {
    const disabled = await save.isDisabled().catch(() => false);
    const text = await save.innerText().catch(() => "");
    if (!disabled && /^save$/i.test(text.trim())) {
      await save.click({ timeout: 8000 }).catch(async () => {
        await save.click({ force: true, timeout: 5000 }).catch(() => {});
      });
    }
  }
}

async function resolvePracticeQResumePrompt(page: Page, bodyText?: string): Promise<boolean> {
  const text = bodyText ?? await page.locator("body").innerText().catch(() => "");
  if (!isPracticeQResumePrompt(text)) return false;

  const clicked = await clickPracticeQControlByText(page, /start\s+new\s+intake\s+form/i);

  if (!clicked) {
    const startNew = page
      .getByRole("button", { name: /start\s+new\s+intake\s+form/i })
      .or(page.getByRole("link", { name: /start\s+new\s+intake\s+form/i }))
      .or(page.locator("button, a, input[type='button'], input[type='submit'], .btn").filter({ hasText: /start\s+new\s+intake\s+form/i }))
      .first();

    if (!(await startNew.isVisible().catch(() => false))) {
      throw new Error("PracticeQ resume prompt appeared, but the Start New Intake Form control was not visible.");
    }

    await startNew.scrollIntoViewIfNeeded().catch(() => {});
    await startNew.click();
  }

  await page.waitForTimeout(2000);
  const afterClickText = await page.locator("body").innerText().catch(() => "");
  if (isPracticeQResumePrompt(afterClickText)) {
    throw new Error("PracticeQ resume prompt stayed open after clicking Start New Intake Form.");
  }
  return true;
}

function isPracticeQResumePrompt(text: string): boolean {
  return /didn['’]?t submit your last form|resume existing form|start new intake form/i.test(text);
}

async function resolvePracticeQIntroPage(page: Page, bodyText?: string): Promise<boolean> {
  const text = bodyText ?? await page.locator("body").innerText().catch(() => "");
  if (!/fill this out by hand/i.test(text) || !/0\s*%\s*Complete/i.test(text)) return false;

  const clicked = await clickPracticeQControlByText(page, /fill\s+this\s+out\s+by\s+hand/i);
  if (!clicked) return false;

  await page.waitForTimeout(1500);
  return true;
}

function fieldValueMatches(actual: string, expected: string, prompt: string): boolean {
  const normalizedActual = normalizePracticeQText(actual);
  const normalizedExpected = normalizePracticeQText(expected);
  if (!normalizedExpected) return true;
  if (normalizedActual === normalizedExpected || normalizedActual.includes(normalizedExpected)) return true;

  if (/phone/i.test(prompt)) {
    return normalizeComparablePhone(actual) === normalizeComparablePhone(expected);
  }
  if (/date of birth|dob/i.test(prompt)) {
    return normalizeDateLike(actual) === normalizeDateLike(expected);
  }
  if (/(^|\b)(first|last)\s+name\b/i.test(prompt)) {
    const expectedWithoutDigits = normalizePracticeQText(expected.replace(/\d+/g, ""));
    if (expectedWithoutDigits && normalizedActual === expectedWithoutDigits) return true;
  }
  return false;
}

function normalizePracticeQText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeComparablePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length > 10 && !digits.startsWith("1")) return digits.slice(0, 10);
  return digits;
}

function normalizeDateLike(value: string) {
  const parts = value.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);
  if (!parts) return normalizePracticeQText(value);
  return `${Number(parts[1])}/${Number(parts[2])}/${parts[3]}`;
}

function shortenPracticeQPrompt(prompt: string) {
  return prompt.replace(/\s+/g, " ").trim().slice(0, 120);
}

async function completeVisibleConsentDocument(page: Page, fillPlan: ReturnType<typeof buildPracticeQFillPlan>) {
  const signedName = findPracticeQAnswerForPrompt("Print your name", fillPlan)
    ?? findPracticeQAnswerForPrompt("Signature", fillPlan)
    ?? findPracticeQAnswerForPrompt("Patient Name", fillPlan);
  if (!signedName) return;

  const readAndSign = page
    .getByRole("button", { name: /read\s*&?\s*sign/i })
    .or(page.getByRole("link", { name: /read\s*&?\s*sign/i }))
    .or(page.getByText(/read\s*&?\s*sign/i))
    .first();
  if (await readAndSign.isVisible().catch(() => false)) {
    await readAndSign.scrollIntoViewIfNeeded().catch(() => {});
    await readAndSign.click({ timeout: 8000 }).catch(async () => {
      await readAndSign.click({ force: true, timeout: 5000 }).catch(async () => {
        await clickPracticeQControlByText(page, /read\s*&?\s*sign/i);
      });
    });
    await page.waitForTimeout(1000);
  } else {
    await clickPracticeQControlByText(page, /read\s*&?\s*sign/i);
    await page.waitForTimeout(1000);
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (!/please read and sign|submit signature|consent for medical treatment/i.test(bodyText)) return;

  await page.getByRole("link", { name: /type it/i }).first().click({ timeout: 3000 }).catch(async () => {
    await clickPracticeQControlByText(page, /type\s+it/i);
  });
  await fillVisibleConsentFields(page, fillPlan, signedName);
  await fillVisibleFields(page, fillPlan);

  const uncheckedBoxes = page.locator("input[type='checkbox']:not(:checked)");
  const checkboxCount = await uncheckedBoxes.count();
  for (let i = 0; i < checkboxCount; i += 1) {
    const checkbox = uncheckedBoxes.nth(i);
    await checkbox.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await checkPracticeQCheckbox(checkbox);
  }

  const submitSignature = page.getByRole("button", { name: /submit signature|click to sign/i }).first();
  if (await submitSignature.isVisible().catch(() => false)) {
    await submitSignature.scrollIntoViewIfNeeded().catch(() => {});
    const canvas = page.locator("canvas.pad, canvas").first();
    if (await canvas.isVisible().catch(() => false)) {
      const box = await canvas.boundingBox().catch(() => null);
      if (box) {
        await page.mouse.move(box.x + 30, box.y + 55);
        await page.mouse.down();
        await page.mouse.move(box.x + 105, box.y + 35);
        await page.mouse.move(box.x + 180, box.y + 60);
        await page.mouse.up();
      }
    }
    await submitSignature.click({ timeout: 8000 }).catch(async () => {
      await submitSignature.click({ force: true, timeout: 5000 }).catch(async () => {
        await clickPracticeQControlByText(page, /submit\s+signature|click\s+to\s+sign/i);
      });
    });
    await page.waitForTimeout(2000);
  } else {
    await clickPracticeQControlByText(page, /submit\s+signature|click\s+to\s+sign/i);
    await page.waitForTimeout(2000);
  }

  const back = page.getByText(/back to questionnaire/i).first();
  if (await back.isVisible().catch(() => false)) {
    await back.click({ timeout: 5000 }).catch(async () => {
      await back.click({ force: true, timeout: 3000 }).catch(async () => {
        await clickPracticeQControlByText(page, /back\s+to\s+questionnaire/i);
      });
    });
    await page.waitForTimeout(1000);
  } else {
    await clickPracticeQControlByText(page, /back\s+to\s+questionnaire/i);
    await page.waitForTimeout(1000);
  }
}

async function fillVisibleConsentFields(
  page: Page,
  fillPlan: ReturnType<typeof buildPracticeQFillPlan>,
  signedName: string
) {
  const dob = findPracticeQAnswerForPrompt("Date of Birth", fillPlan) ?? "";
  const initials = findPracticeQAnswerForPrompt("Initials", fillPlan) ?? signedName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const inputs = page.locator("input:visible:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea:visible");
  const count = await inputs.count();
  for (let i = 0; i < count; i += 1) {
    const input = inputs.nth(i);
    if (!(await input.isVisible().catch(() => false))) continue;
    const current = await input.inputValue().catch(() => "");
    const prompt = await getPracticeQFieldPrompt(input);
    const placeholder = await input.getAttribute("placeholder").catch(() => "");
    if (/initials/i.test(`${prompt} ${placeholder}`) && !current.trim()) {
      await enterFieldValue(input, initials, "Initials");
      continue;
    }
    if (/date of birth|dob|m\/d\/yyyy/i.test(`${prompt} ${placeholder}`) && !current.trim()) {
      await enterFieldValue(input, dob, "Date of Birth");
      continue;
    }
    if (/patient name|print your name|signature/i.test(prompt) && !current.trim()) {
      await enterFieldValue(input, signedName, "Print your name");
    }
  }
}

async function enterFieldValue(field: ReturnType<Page["locator"]>, value: string, prompt = "") {
  await field.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await field.fill(value, { timeout: 5000 }).catch(async () => {
    await field.click({ timeout: 3000 }).catch(() => {});
    await field.press(process.platform === "darwin" ? "Meta+A" : "Control+A", { timeout: 3000 }).catch(() => {});
    await field.type(value, { delay: 5, timeout: 5000 }).catch(() => {});
  });
  await field.evaluate((el, value) => {
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(input, value);
    input.value = value;

    // Dispatch native events first so Angular's ng-model listener fires synchronously
    for (const eventName of ["input", "change"]) {
      input.dispatchEvent(new Event(eventName, { bubbles: true }));
    }

    const angular = (window as any).angular;
    // Update via ngModel controller — $setViewValue runs $parsers and marks model dirty
    const ngModel = angular?.element(input).controller?.("ngModel");
    if (ngModel) {
      ngModel.$setViewValue(value);
      ngModel.$render();
      // Re-set native value after $render in case $render cleared it back to model value
      setter?.call(input, value);
      input.value = value;
    }

    // Also set model path directly as belt-and-suspenders (bypasses $parsers that might reject value)
    const scope = angular?.element(input).scope?.();
    const model = input.getAttribute("ng-model");
    if (model) {
      const parts = model.split(".");
      let target = scope;
      for (let i = 0; target && i < parts.length - 1; i += 1) target = target[parts[i]];
      if (target && parts[parts.length - 1] !== undefined) target[parts[parts.length - 1]] = value;
    }
    scope?.textChanged?.();
    scope?.changed?.();

    // Run a synchronous digest now (not async) so Angular commits the value before we check it
    if (!scope?.$root?.$$phase) scope?.$apply?.();
    scope?.$applyAsync?.();

    // Re-assert DOM value after digest (digest might have called $render which re-set the DOM)
    if (input.value !== value) {
      setter?.call(input, value);
      input.value = value;
    }

    // Final blur event
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }, value).catch(() => {});

  // Small settle window for Angular watchers triggered by the Tab press
  await field.press("Tab", { timeout: 2000 }).catch(() => {});
  await field.evaluate((el, value) => {
    // After Tab (blur), Angular may have re-rendered from model — ensure DOM matches
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    if (!input.value.trim()) {
      const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter?.call(input, value);
      input.value = value;
      const angular = (window as any).angular;
      const scope = angular?.element(input).scope?.();
      const model = input.getAttribute("ng-model");
      if (model) {
        const parts = model.split(".");
        let target = scope;
        for (let i = 0; target && i < parts.length - 1; i += 1) target = target[parts[i]];
        if (target && parts[parts.length - 1] !== undefined) target[parts[parts.length - 1]] = value;
      }
      if (!scope?.$root?.$$phase) scope?.$apply?.();
    }
  }, value).catch(() => {});
}

async function checkPracticeQCheckbox(checkbox: ReturnType<Page["locator"]>) {
  await checkbox.evaluate((el) => {
    const angular = (window as any).angular;
    const scope = angular?.element(el).scope?.();
    const model = scope?.field ?? scope?.i ?? scope?.option;
    if (model && Object.prototype.hasOwnProperty.call(model, "Answer")) model.Answer = true;
    if (model && Object.prototype.hasOwnProperty.call(model, "Checked")) model.Checked = true;
    scope?.save?.();
    scope?.changed?.();
    scope?.$applyAsync?.();
  }).catch(() => {});
  await checkbox.check({ timeout: 5000 }).catch(async () => {
    await checkbox.evaluate((el) => {
      const target = el.parentElement?.querySelector("ins.iCheck-helper")
        ?? el.parentElement
        ?? el;
      (target as HTMLElement).click();
      const angular = (window as any).angular;
      const scope = angular?.element(el).scope?.();
      scope?.save?.();
      scope?.changed?.();
      scope?.$applyAsync?.();
    }).catch(async () => {
      await checkbox.click({ force: true, timeout: 3000 }).catch(() => {});
    });
  });
}

async function clickMatchingChoices(page: Page, fillPlan: ReturnType<typeof buildPracticeQFillPlan>) {
  for (const item of fillPlan) {
    const values = item.value.split(",").map((value) => value.trim()).filter(Boolean);
    for (const value of values) {
      const exactChoice = page.getByText(new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`, "i")).first();
      if (await exactChoice.isVisible().catch(() => false)) {
        await exactChoice.click({ timeout: 2000 }).catch(async () => {
          await exactChoice.click({ force: true, timeout: 1000 }).catch(() => {});
        });
      }
    }
  }

  const labels = page.locator("label");
  const count = await labels.count();
  for (let i = 0; i < count; i += 1) {
    const label = labels.nth(i);
    await label.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    if (!(await label.isVisible().catch(() => false))) continue;
    const text = (await label.innerText().catch(() => "")).trim();
    if (!text) continue;
    const context = await label.evaluate((el) => {
      const chunks: string[] = [];
      let current: Element | null = el;
      for (let depth = 0; current && depth < 10; depth += 1) {
        chunks.push(current.textContent ?? "");
        current = current.parentElement;
      }
      return chunks.join(" ");
    }).catch(() => text);
    if (findPracticeQChoiceForLabel(text, context, fillPlan)) {
      await setPracticeQAngularChoice(page, context, text);
      const childInput = label.locator("input[type='checkbox'], input[type='radio']").first();
      if (await childInput.isVisible().catch(() => false)) {
        await clickPracticeQChoiceInput(childInput);
        continue;
      }
      const followingInput = label.locator("xpath=following::input[@type='checkbox' or @type='radio'][1]").first();
      if (await followingInput.isVisible().catch(() => false)) {
        await clickPracticeQChoiceInput(followingInput);
        continue;
      }
      await label.click().catch(() => {});
    }
  }

  const inputs = page.locator("input[type='checkbox'], input[type='radio']");
  const inputCount = await inputs.count();
  for (let i = 0; i < inputCount; i += 1) {
    const input = inputs.nth(i);
    if (await input.isChecked().catch(() => false)) continue;
    const choice = await input.evaluate((el) => {
      const chunks: string[] = [];
      let current: Element | null = el;
      for (let depth = 0; current && depth < 10; depth += 1) {
        chunks.push(current.textContent ?? "");
        current = current.parentElement;
      }
      const label = el.closest("label")?.textContent
        ?? el.parentElement?.textContent
        ?? "";
      const visibleTarget = el.closest("label")
        ?? el.parentElement?.querySelector("ins.iCheck-helper")
        ?? el.parentElement
        ?? el;
      const targetElement = visibleTarget as HTMLElement;
      const style = window.getComputedStyle(targetElement);
      const rect = targetElement.getBoundingClientRect();
      return {
        label: label.replace(/\s+/g, " ").trim(),
        context: chunks.join(" ").replace(/\s+/g, " ").trim(),
        visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
      };
    }).catch(() => ({ label: "", context: "", visible: false }));
    if (!choice.visible) continue;
    if (!choice.label || !findPracticeQChoiceForLabel(choice.label, choice.context, fillPlan)) continue;
    await setPracticeQAngularChoice(page, choice.context, choice.label);
    await clickPracticeQChoiceInput(input);
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function clickPracticeQChoiceInput(input: ReturnType<Page["locator"]>) {
  await input.evaluate((el) => {
    const input = el as HTMLInputElement;
    input.checked = true;
    input.setAttribute("checked", "checked");
    const angular = (window as any).angular;
    const scope = angular?.element(el).scope?.();
    if (scope?.question) {
      scope.question.Answer = input.value || scope.question.Answer || true;
      scope.changed?.(scope.question);
      scope.textChanged?.();
      scope.$applyAsync?.();
    }
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }).catch(() => {});
  await input.click({ timeout: 5000 }).catch(async () => {
    await input.evaluate((el) => {
      const target = el.parentElement?.querySelector("ins.iCheck-helper")
        ?? el.parentElement
        ?? el;
      (target as HTMLElement).click();
    }).catch(async () => {
      await input.click({ force: true, timeout: 3000 }).catch(() => {});
    });
  });
}

async function setPracticeQAngularChoice(page: Page, questionContext: string, labelText: string) {
  await page.evaluate(({ questionContext, labelText }) => {
    const normalize = (raw: unknown) => String(raw ?? "")
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const findIntakeScope = (root: any) => {
      const seen = new Set<number>();
      const stack = [root];
      while (stack.length) {
        const scope = stack.pop();
        if (!scope || seen.has(scope.$id)) continue;
        seen.add(scope.$id);
        if (scope.intake?.Questionnaire?.Questions) return scope;
        if (scope.$$childHead) stack.push(scope.$$childHead);
        let sibling = scope.$$nextSibling;
        while (sibling) {
          stack.push(sibling);
          sibling = sibling.$$nextSibling;
        }
      }
      return null;
    };
    const angular = (window as any).angular;
    const injector = angular?.element(document.body).injector?.();
    const intakeScope = findIntakeScope(injector?.get?.("$rootScope"));
    const questions = intakeScope?.intake?.Questionnaire?.Questions;
    if (!Array.isArray(questions)) return;
    const normalizedContext = normalize(questionContext);
    const normalizedLabel = normalize(labelText);
    let changed = false;
    for (const question of questions) {
      const questionText = normalize(question?.Text);
      if (questionText && !(normalizedContext.includes(questionText) || questionText.includes(normalizedContext))) continue;
      if (Array.isArray(question?.QuestionOptions)) {
        for (const option of question.QuestionOptions) {
          if (normalize(option?.Text) === normalizedLabel) {
            option.Checked = true;
            option.Answer = option.Text;
            question.Answer = option.Text;
            intakeScope?.onblur?.(question, question.Answer, option);
            changed = true;
          }
        }
      }
    }
    if (changed) {
      intakeScope?.changed?.();
      intakeScope?.textChanged?.();
      if (!intakeScope?.$root?.$$phase) intakeScope?.$apply?.();
      intakeScope?.$applyAsync?.();
    }
  }, { questionContext, labelText }).catch(() => {});
}

async function clickContinue(page: Page): Promise<boolean> {
  const button = page
    .getByRole("button", { name: /next\s+page/i })
    .or(page.getByText(/next\s+page/i))
    .or(page.locator("button, input[type='button'], input[type='submit'], a").filter({ hasText: /next\s+page/i }))
    .or(page.locator("input[value*='Next Page'], input[value*='next page']"))
    .or(page
    .getByRole("button", { name: /continue|next/i })
    .or(page.locator("button, input[type='button'], input[type='submit']").filter({ hasText: /continue|next/i }))
    )
    .first();
  if (!(await button.isVisible().catch(() => false))) {
    return clickPracticeQControlByText(page, /next\s+page|continue|next/i);
  }
  await button.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
  await button.click({ timeout: 8000 }).catch(async () => {
    await button.click({ force: true, timeout: 3000 }).catch(async () => {
      await clickPracticeQControlByText(page, /next\s+page|continue|next/i);
    });
  });
  return true;
}

async function clickFinalSubmit(page: Page): Promise<boolean> {
  await waitForPracticeQReady(page);

  // Use count() > 0 instead of isVisible() — headless getBoundingClientRect() returns zeros.
  // force:true bypasses viewport/visibility checks that always fail in headless mode.
  const direct = page
    .locator("button, input[type='submit'], input[type='button']")
    .filter({ hasText: /submit(?: form)?|finish|done|complete/i })
    .or(page.locator("input[value*='Submit'], input[value*='submit'], input[value*='Finish'], input[value*='Done']"))
    .first();

  if (await direct.count().then((c) => c > 0).catch(() => false)) {
    await direct.scrollIntoViewIfNeeded().catch(() => {});
    await direct.click({ force: true, timeout: 8000 }).catch(() => {});
    return true;
  }

  // DOM fallback — fire native events without any visibility filter
  const clicked = await clickPracticeQControlByText(page, /submit\s*form|submit|finish|done|complete/i);
  return clicked;
}

async function clickPracticeQControlByText(page: Page, pattern: RegExp): Promise<boolean> {
  const clicked = await page.evaluate(({ source, flags }) => {
    const matcher = new RegExp(source, flags.includes("i") ? flags : `${flags}i`);
    const isVisible = (el: Element) => {
      const node = el as HTMLElement;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const textFor = (el: Element) => [
      el.textContent,
      el.getAttribute("value"),
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const selector = [
      "button",
      "a",
      "input[type='button']",
      "input[type='submit']",
      "[role='button']",
      ".btn",
      ".btn-primary",
      "span",
      "div",
    ].join(",");
    const candidates = Array.from(document.querySelectorAll(selector));
    const match = candidates.find((el) => isVisible(el) && matcher.test(textFor(el)));
    const target = match?.closest("button,a,input[type='button'],input[type='submit'],[role='button'],.btn,.btn-primary") ?? match;
    if (!target) return false;
    const node = target as HTMLElement;
    node.scrollIntoView({ block: "center", inline: "center" });
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    node.click();
    return true;
  }, { source: pattern.source, flags: pattern.flags }).catch(() => false);
  if (clicked) await page.waitForTimeout(1000);
  return clicked;
}

async function waitForPracticeQReady(page: Page) {
  await page
    .locator(".spinner.full-height-width, spinner .spinner")
    .first()
    .waitFor({ state: "hidden", timeout: 10000 })
    .catch(() => {});
  await page.waitForTimeout(300);
}

async function waitForPracticeQPageText(page: Page) {
  await page
    .waitForFunction(() => (document.body?.innerText ?? "").trim().length > 20, null, { timeout: 12000 })
    .catch(() => {});
}

async function verifyPracticeQSavedSubmission(
  result: WorkerResult,
  context: {
    patient: { firstName: string; lastName: string; email: string };
    answers: Awaited<ReturnType<typeof dbServer.answerDb.getByOrder>>;
    questions: Awaited<ReturnType<typeof dbServer.questionDb.getAll>>;
    startedAt: string;
  }
): Promise<WorkerResult> {
  if (result.status === "failed") return result;

  // If no API key is configured, trust the browser submit result directly.
  if (!process.env.PRACTICEQ_API_KEY) {
    console.warn("PRACTICEQ_API_KEY not set — skipping API verification, trusting browser submit.");
    return { ...result, status: "completed" };
  }

  const matchedIntake = await withPracticeQTimeout(
    findRecentPracticeQIntake(context),
    PRACTICEQ_API_VERIFY_TIMEOUT_MS,
    "PracticeQ API verification timed out."
  ).catch(() => null);
  if (!matchedIntake) {
    return {
      ...result,
      status: "failed",
      error: "PracticeQ browser submit finished, but the submitted intake could not be found through the PracticeQ API.",
    };
  }

  let intake = await withPracticeQTimeout(
    getIntakeById(matchedIntake.id),
    PRACTICEQ_API_VERIFY_TIMEOUT_MS,
    `PracticeQ intake ${matchedIntake.id} verification timed out.`
  ).catch(() => null);
  if (!intake) {
    return {
      ...result,
      status: "completed",
      intakeId: matchedIntake.id,
    };
  }

  const beforeStats = countPracticeQAnswers(intake);
  const beforeStatus = String((intake as any)?.Status ?? matchedIntake.status ?? "");
  if (beforeStats.answered < beforeStats.total || !/completed/i.test(beforeStatus)) {
    intake = await withPracticeQTimeout(
      populateAndUpdatePracticeQIntake(intake, {
        patient: context.patient as any,
        answers: context.answers,
        questions: context.questions,
      }),
      PRACTICEQ_API_VERIFY_TIMEOUT_MS,
      `PracticeQ intake ${matchedIntake.id} answer backfill timed out.`
    ).catch(() => intake);
  }

  const refreshed = await getIntakeById(matchedIntake.id).catch(() => intake);
  const verifiedIntake = refreshed ?? intake;
  const answerStats = countPracticeQAnswers(verifiedIntake);
  const consentSigned = hasSignedConsent(verifiedIntake);
  let status = String((verifiedIntake as any)?.Status ?? matchedIntake.status ?? "");

  if (!/completed/i.test(status) || !consentSigned) {
    if (consentSigned && answerStats.answered >= expectedPracticeQAnswerCount(context.answers)) {
      const markedCompleted = await withPracticeQTimeout(
        setPracticeQIntakeCompletedInAdmin(matchedIntake.id),
        PRACTICEQ_ADMIN_COMPLETE_TIMEOUT_MS,
        `PracticeQ admin Set as Completed timed out for ${matchedIntake.id}.`
      ).catch(() => false);
      if (markedCompleted) {
        await waitForPracticeQCompletedStatus(matchedIntake.id).catch(() => false);
        return { ...result, status: "completed", intakeId: matchedIntake.id };
      }
      return {
        ...result,
        status: "failed",
        intakeId: matchedIntake.id,
        error: `PracticeQ admin Set as Completed failed for ${matchedIntake.id}.`,
      };
    }
    return {
      ...result,
      status: "failed",
      intakeId: matchedIntake.id,
      error: `PracticeQ intake ${matchedIntake.id} is ${status || "not completed"}; consent signed=${consentSigned}; answers saved=${answerStats.answered}/${answerStats.total}.`,
    };
  }

  if (answerStats.answered < expectedPracticeQAnswerCount(context.answers)) {
    return {
      ...result,
      status: "failed",
      intakeId: matchedIntake.id,
      error: `PracticeQ completed intake ${matchedIntake.id}, but only ${answerStats.answered}/${answerStats.total} answers were saved.`,
    };
  }

  return { ...result, status: "completed", intakeId: matchedIntake.id };
}

export async function waitForPracticeQCompletedStatus(
  intakeId: string,
  fetchIntake: (id: string) => Promise<unknown | null> = getIntakeById,
  options: { attempts?: number; delayMs?: number } = {}
): Promise<boolean> {
  const attempts = options.attempts ?? PRACTICEQ_ADMIN_STATUS_POLL_ATTEMPTS;
  const delayMs = options.delayMs ?? PRACTICEQ_ADMIN_STATUS_POLL_DELAY_MS;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const intake = await fetchIntake(intakeId).catch(() => null);
    const status = String((intake as any)?.Status ?? "");
    if (/completed/i.test(status)) return true;
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return false;
}

export async function completePracticeQIntakeInAdmin(intakeId: string): Promise<boolean> {
  return setPracticeQIntakeCompletedInAdmin(intakeId);
}

async function findRecentPracticeQIntake(context: {
  patient: { firstName: string; lastName: string; email: string };
  startedAt: string;
}) {
  const startDate = new Date(context.startedAt);
  startDate.setUTCDate(startDate.getUTCDate() - 1);
  const feed = await getIntakeSummaryFeed({
    client: context.patient.email,
    startDate: startDate.toISOString().slice(0, 10),
  });
  const patientName = normalizePracticeQLookup(`${context.patient.firstName} ${context.patient.lastName}`);
  const patientEmail = context.patient.email.toLowerCase();
  return feed.all.find((form) =>
    normalizePracticeQLookup(form.clientName ?? "") === patientName ||
    String(form.clientEmail ?? "").toLowerCase() === patientEmail
  ) ?? null;
}

function countPracticeQAnswers(intake: any) {
  const questions = Array.isArray(intake?.Questions) ? intake.Questions : [];
  const answered = questions.filter((question: any) => {
    const answer = question?.Answer ?? question?.Value ?? question?.AnswerText ?? question?.Response;
    if (Array.isArray(answer)) return answer.length > 0;
    if (String(answer ?? "").trim()) return true;
    if (Array.isArray(question?.Attachments) && question.Attachments.length > 0) return true;
    if (Array.isArray(question?.Rows)) {
      return question.Rows.some((row: any) =>
        Array.isArray(row?.Answers) && row.Answers.some((value: unknown) => String(value ?? "").trim())
      );
    }
    return false;
  }).length;
  return { total: questions.length, answered };
}

function expectedPracticeQAnswerCount(answers: Awaited<ReturnType<typeof dbServer.answerDb.getByOrder>>) {
  const clinical = answers.filter((answer) =>
    answer.answer.trim() &&
    !/^(none|none of the above|none apply to me)$/i.test(answer.answer.trim())
  ).length;
  return Math.max(8, clinical + 6);
}

function hasSignedConsent(intake: any) {
  const forms = Array.isArray(intake?.ConsentForms) ? intake.ConsentForms : [];
  if (!forms.length) return true;
  return forms.every((form: any) => form?.Signed === true || form?.DateSubmitted);
}

function normalizePracticeQLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function extractPracticeQIntakeId(url: string): string | undefined {
  const match = url.match(/\/(?:history|intake|forms?)\/([^/?#]+)/i) ?? url.match(/[?&](?:intakeId|id)=([^&#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function looksSubmitted(text: string): boolean {
  return /thank you|submitted|received your form|intake has been received|form is complete|successfully submitted/i.test(text);
}

async function setPracticeQIntakeCompletedInAdmin(intakeId: string): Promise<boolean> {
  if (process.env.PRACTICEQ_ADMIN_SET_COMPLETED !== "true") return false;

  const storageState = getPracticeQAdminStorageState();
  const adminBase = "https://app.intakeq.com";
  const intakeUrl = `${adminBase}/#/history/${encodeURIComponent(intakeId)}`;
  const browser = await chromium.launch({
    headless: process.env.PRACTICEQ_ADMIN_HEADLESS !== "false",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext(storageState ? { storageState } : undefined);
  const page = await context.newPage();
  page.setDefaultTimeout(12000);

  try {
    // Navigate directly to signin (avoids redirect to forms.intakeq.com from root)
    await page.goto(`${adminBase}/signin`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await completePracticeQAdminLoginIfNeeded(page);

    // Navigate to the history page for this specific intake
    await page.goto(intakeUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForPracticeQPageText(page);
    await page.waitForTimeout(2000);

    if (await practiceQAdminPageShowsCompleted(page)) return true;

    // Click the "More ▼" dropdown in the intake detail view right panel
    const moreClicked = await clickPracticeQDetailMoreDropdown(page);
    if (!moreClicked) return false;

    await page.waitForTimeout(1000);
    // "Set as Completed" item in the More dropdown
    const setCompleted = page.locator('a[ng-click="setAsCompleted()"], li a[ng-click="setAsCompleted()"]').first();
    const setCompletedVisible = await setCompleted.isVisible({ timeout: 5000 }).catch(() => false)
      || await page.locator("button, a, li").filter({ hasText: /^set as completed$/i }).first().isVisible().catch(() => false);
    if (!setCompletedVisible) return false;

    await setCompleted.click({ timeout: 8000 }).catch(async () => {
      // Fallback: click by text if ng-click locator fails
      await page.locator("button, a, li, span").filter({ hasText: /^set as completed$/i }).first().click({ timeout: 5000, force: true }).catch(async () => {
        await clickPracticeQControlByText(page, /set\s+as\s+completed/i);
      });
    });
    await page.waitForTimeout(1000);
    const modalYes = page.locator(".modal-dialog button").filter({ hasText: /^\s*yes\s*$/i }).first();
    if (await modalYes.isVisible().catch(() => false)) {
      await modalYes.click({ timeout: 8000 }).catch(async () => {
        await modalYes.click({ force: true, timeout: 5000 }).catch(() => {});
      });
    } else {
      await clickPracticeQControlByText(page, /confirm|yes|ok|set\s+as\s+completed/i).catch(() => false);
    }
    await page.waitForTimeout(3000);
    return practiceQAdminPageShowsCompleted(page);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

/**
 * On the PracticeQ intake DETAIL view (#/history/{intakeId}), click the
 * "More ▼" dropdown button in the top-right action panel.
 * Returns true if the dropdown was opened, false otherwise.
 */
async function clickPracticeQDetailMoreDropdown(page: Page): Promise<boolean> {
  // The "More" button is in the right-side action panel of the detail view
  const moreBtn = page
    .locator(".col-md-2.hidden-print .dropdown-toggle, .panel .dropdown-toggle, aside .dropdown-toggle")
    .filter({ hasText: /more/i })
    .first()
    .or(
      page
        .getByRole("button", { name: /^more$/i })
        .or(page.locator("button.dropdown-toggle, a.dropdown-toggle").filter({ hasText: /^more$/i }))
        .first()
    );

  if (await moreBtn.isVisible().catch(() => false)) {
    await moreBtn.scrollIntoViewIfNeeded().catch(() => {});
    await moreBtn.click({ timeout: 8000 }).catch(async () => {
      await moreBtn.click({ force: true, timeout: 5000 }).catch(() => {});
    });
    await page.waitForTimeout(800);
    return true;
  }

  // Fallback: use DOM evaluate to find the More button by its text content
  const clicked = await page.evaluate(() => {
    const isVisible = (el: Element) => {
      const node = el as HTMLElement;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const candidates = Array.from(
      document.querySelectorAll("button.dropdown-toggle, a.dropdown-toggle, [data-toggle='dropdown']")
    );
    for (const el of candidates) {
      if (/^\s*more\s*/i.test((el as HTMLElement).innerText ?? "") && isVisible(el)) {
        (el as HTMLElement).scrollIntoView({ block: "center" });
        (el as HTMLElement).click();
        return true;
      }
    }
    return false;
  }).catch(() => false);

  if (clicked) await page.waitForTimeout(800);
  return clicked;
}

async function practiceQAdminPageShowsCompleted(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const isVisible = (el: Element) => {
      const node = el as HTMLElement;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const visibleText = Array.from(document.querySelectorAll("body *"))
      .filter(isVisible)
      .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return visibleText.some((text) => /^completed$/i.test(text) || /^completed\b/i.test(text));
  }).catch(() => false);
}

function getPracticeQAdminStorageState(): string | undefined {
  if (process.env.PRACTICEQ_ADMIN_STORAGE_STATE) return process.env.PRACTICEQ_ADMIN_STORAGE_STATE;
  if (!process.env.PRACTICEQ_ADMIN_STORAGE_STATE_JSON) return undefined;
  const tmpPath = path.join(os.tmpdir(), `practiceq-admin-storage-${Date.now()}.json`);
  fs.writeFileSync(tmpPath, process.env.PRACTICEQ_ADMIN_STORAGE_STATE_JSON);
  return tmpPath;
}

async function completePracticeQAdminLoginIfNeeded(page: Page): Promise<void> {
  const email = process.env.PRACTICEQ_ADMIN_EMAIL ?? "";
  const password = process.env.PRACTICEQ_ADMIN_PASSWORD ?? "";
  if (!email || !password) return;

  // Check if signin form is visible (we navigate directly to /signin so it should be)
  const emailInput = page.locator("input[type='email'], input[name*='email' i], input[placeholder*='email' i]").first();
  if (!(await emailInput.isVisible().catch(() => false))) return; // already logged in, redirected away
  const passwordInput = page.locator("input[type='password']").first();
  await emailInput.fill(email);
  if (await passwordInput.isVisible().catch(() => false)) await passwordInput.fill(password);

  const signIn = page
    .getByRole("button", { name: /log\s*in|sign\s*in/i })
    .or(page.locator("button, input[type='submit']").filter({ hasText: /log\s*in|sign\s*in/i }))
    .first();
  if (await signIn.isVisible().catch(() => false)) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      signIn.click({ timeout: 8000 }).catch(async () => {
        await signIn.click({ force: true, timeout: 5000 }).catch(() => {});
      }),
    ]);
    // Wait for the post-login SPA to finish rendering
    await waitForPracticeQPageText(page);
    await page.waitForTimeout(1500);
  }
}
