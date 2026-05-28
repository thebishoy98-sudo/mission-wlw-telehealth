import { chromium, type Browser, type Page } from "playwright";
import * as dbServer from "@/lib/db.server";
import type { PracticeQAutomationJob } from "@/types";
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

type FillOutcome = {
  stoppedForPatientConsent: boolean;
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

  const [patient, answers, questions] = await Promise.all([
    dbServer.patientDb.getById(job.patientId),
    dbServer.answerDb.getByOrder(job.orderId),
    dbServer.questionDb.getAll(),
  ]);
  if (!patient) return { status: "failed", error: "Patient not found" };

  const fillPlan = buildPracticeQFillPlan(patient, answers, questions);
  const browser = await chromium.launch({ headless: process.env.PRACTICEQ_WORKER_HEADLESS !== "false" });
  const page = await browser.newPage();

  try {
    await page.goto(job.practiceQStartUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await fillKnownPracticeQLogin(page, patient);
    await clickContinue(page);
    const fillOutcome = await fillPracticeQQuestionPages(page, fillPlan);
    const submitResult = await submitPracticeQInBackground(page, fillOutcome);

    return submitResult;
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

  const [patient, answers, questions] = await Promise.all([
    dbServer.patientDb.getById(job.patientId),
    dbServer.answerDb.getByOrder(job.orderId),
    dbServer.questionDb.getAll(),
  ]);
  if (!patient) return { status: "failed", error: "Patient not found" };

  const fillPlan = buildPracticeQFillPlan(patient, answers, questions);
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
    const fillOutcome = await fillPracticeQQuestionPages(page, fillPlan);
    const submitResult = await submitPracticeQInBackground(page, fillOutcome);
    await browser.close().catch(() => {});
    return submitResult;
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

export async function fillPracticeQQuestionPages(page: Page, fillPlan: ReturnType<typeof buildPracticeQFillPlan>): Promise<FillOutcome> {
  for (let step = 0; step < 40; step += 1) {
    await page.waitForTimeout(750);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (shouldStopForPatientConsent(bodyText)) return { stoppedForPatientConsent: true };

    const filled = await fillVisibleFields(page, fillPlan);
    await clickMatchingChoices(page, fillPlan);

    const moved = await clickContinue(page).catch(() => false);
    if (!moved && filled === 0) return { stoppedForPatientConsent: false };
  }
  return { stoppedForPatientConsent: false };
}

export async function submitPracticeQInBackground(page: Page, fillOutcome: FillOutcome): Promise<WorkerResult> {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (fillOutcome.stoppedForPatientConsent || shouldStopForPatientConsent(bodyText)) {
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

  await page.waitForTimeout(1500);
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

  return {
    status: "completed",
    handoffUrl: undefined,
    intakeId: extractPracticeQIntakeId(page.url()),
  };
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

async function clickFinalSubmit(page: Page): Promise<boolean> {
  const direct = page
    .getByRole("button", { name: /submit|finish|done|complete/i })
    .or(page.getByText(/submit|finish|done|complete/i))
    .first();
  if (await direct.isVisible().catch(() => false)) {
    await direct.click();
    return true;
  }

  const candidates = page.locator("button, input[type='button'], input[type='submit'], a");
  const count = await candidates.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = candidates.nth(i);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const label = await candidate.evaluate((el) =>
      [
        el.textContent,
        el.getAttribute("value"),
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
      ].filter(Boolean).join(" ")
    ).catch(() => "");
    if (!/submit|finish|done|complete/i.test(label)) continue;
    await candidate.click();
    return true;
  }

  return false;
}

function extractPracticeQIntakeId(url: string): string | undefined {
  const match = url.match(/\/(?:history|intake|forms?)\/([^/?#]+)/i) ?? url.match(/[?&](?:intakeId|id)=([^&#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function looksSubmitted(text: string): boolean {
  return /thank you|submitted|received your form|form is complete|successfully submitted/i.test(text);
}
