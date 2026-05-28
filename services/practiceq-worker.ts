import { chromium, type Browser, type Page } from "playwright";
import * as dbServer from "@/lib/db.server";
import type { PracticeQAutomationJob } from "@/types";
import {
  buildPracticeQFillPlan,
  formatPracticeQDate,
  findPracticeQAnswerForPrompt,
  findPracticeQChoiceForLabel,
  requiresUnhandledPatientConsent,
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

  const [patient, answers, questions, consent] = await Promise.all([
    dbServer.patientDb.getById(job.patientId),
    dbServer.answerDb.getByOrder(job.orderId),
    dbServer.questionDb.getAll(),
    dbServer.consentDb.getByOrder(job.orderId).catch(() => null),
  ]);
  if (!patient) return { status: "failed", error: "Patient not found" };

  const fillPlan = buildPracticeQFillPlan(patient, answers, questions, consent);
  const browser = await chromium.launch({ headless: process.env.PRACTICEQ_WORKER_HEADLESS !== "false" });
  const page = await browser.newPage();

  try {
    await page.goto(job.practiceQStartUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await fillKnownPracticeQLogin(page, patient);
    await clickContinue(page);
    const fillOutcome = await fillPracticeQQuestionPages(page, fillPlan);
    const submitResult = await submitPracticeQInBackground(page, fillOutcome, fillPlan);

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

  const [patient, answers, questions, consent] = await Promise.all([
    dbServer.patientDb.getById(job.patientId),
    dbServer.answerDb.getByOrder(job.orderId),
    dbServer.questionDb.getAll(),
    dbServer.consentDb.getByOrder(job.orderId).catch(() => null),
  ]);
  if (!patient) return { status: "failed", error: "Patient not found" };

  const fillPlan = buildPracticeQFillPlan(patient, answers, questions, consent);
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
    const submitResult = await submitPracticeQInBackground(page, fillOutcome, fillPlan);
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
    if (requiresUnhandledPatientConsent(bodyText, fillPlan)) return { stoppedForPatientConsent: true };

    const filled = await fillVisibleFields(page, fillPlan);
    await clickMatchingChoices(page, fillPlan);
    await completeVisibleConsentDocument(page, fillPlan);

    const moved = await clickContinue(page).catch(() => false);
    if (!moved && filled === 0) return { stoppedForPatientConsent: false };
  }
  return { stoppedForPatientConsent: false };
}

export async function submitPracticeQInBackground(
  page: Page,
  fillOutcome: FillOutcome,
  fillPlan: ReturnType<typeof buildPracticeQFillPlan> = []
): Promise<WorkerResult> {
  const bodyText = await page.locator("body").innerText().catch(() => "");
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
    await field.scrollIntoViewIfNeeded().catch(() => {});
    if (!(await field.isVisible().catch(() => false))) continue;
    const current = await field.inputValue().catch(() => "");
    if (current.trim()) continue;
    const prompt = await field.evaluate((el) => {
      const label = el.closest("label")?.textContent ?? "";
      const parent = el.parentElement?.textContent ?? "";
      const grand = el.parentElement?.parentElement?.textContent ?? "";
      const questionBlock = el.closest("[ng-repeat], .question, .panel, fieldset")?.textContent ?? "";
      return [
        label,
        parent,
        grand,
        questionBlock,
        el.getAttribute("placeholder") ?? "",
        el.getAttribute("aria-label") ?? "",
      ].join(" ");
    });
    const answer = findPracticeQAnswerForPrompt(prompt, fillPlan);
    if (!answer) continue;
    const normalizedAnswer = /date of birth|dob/i.test(prompt) ? formatPracticeQDate(answer) : answer;
    await enterFieldValue(field, normalizedAnswer);
    filled += 1;
  }

  return filled;
}

async function completeVisibleConsentDocument(page: Page, fillPlan: ReturnType<typeof buildPracticeQFillPlan>) {
  const signedName = findPracticeQAnswerForPrompt("Print your name", fillPlan)
    ?? findPracticeQAnswerForPrompt("Signature", fillPlan)
    ?? findPracticeQAnswerForPrompt("Patient Name", fillPlan);
  if (!signedName) return;

  const readAndSign = page.getByRole("button", { name: /read\s*&?\s*sign/i }).first();
  if (await readAndSign.isVisible().catch(() => false)) {
    await readAndSign.scrollIntoViewIfNeeded().catch(() => {});
    await readAndSign.click();
    await page.waitForTimeout(1000);
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (!/please read and sign|submit signature|consent for medical treatment/i.test(bodyText)) return;

  await page.getByRole("link", { name: /type it/i }).first().click().catch(() => {});
  await fillVisibleFields(page, fillPlan);

  const uncheckedBoxes = page.locator("input[type='checkbox']:not(:checked)");
  const checkboxCount = await uncheckedBoxes.count();
  for (let i = 0; i < checkboxCount; i += 1) {
    const checkbox = uncheckedBoxes.nth(i);
    await checkbox.scrollIntoViewIfNeeded().catch(() => {});
    if (await checkbox.isVisible().catch(() => false)) {
      await checkPracticeQCheckbox(checkbox);
    }
  }

  const submitSignature = page.getByRole("button", { name: /submit signature|click to sign/i }).first();
  if (await submitSignature.isVisible().catch(() => false)) {
    await submitSignature.scrollIntoViewIfNeeded().catch(() => {});
    await submitSignature.click();
    await page.waitForTimeout(1500);
  }

  const back = page.getByText(/back to questionnaire/i).first();
  if (await back.isVisible().catch(() => false)) {
    await back.click();
    await page.waitForTimeout(1000);
  }
}

async function enterFieldValue(field: ReturnType<Page["locator"]>, value: string) {
  await field.scrollIntoViewIfNeeded().catch(() => {});
  await field.click().catch(() => {});
  await field.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
  await field.fill("").catch(() => {});
  await field.type(value, { delay: 5 }).catch(async () => {
    await field.fill(value).catch(() => {});
  });
  await field.evaluate((el) => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }).catch(() => {});
}

async function checkPracticeQCheckbox(checkbox: ReturnType<Page["locator"]>) {
  await checkbox.check().catch(async () => {
    await checkbox.evaluate((el) => {
      const target = el.parentElement?.querySelector("ins.iCheck-helper")
        ?? el.parentElement
        ?? el;
      (target as HTMLElement).click();
    }).catch(async () => {
      await checkbox.click({ force: true }).catch(() => {});
    });
  });
}

async function clickMatchingChoices(page: Page, fillPlan: ReturnType<typeof buildPracticeQFillPlan>) {
  const labels = page.locator("label");
  const count = await labels.count();
  for (let i = 0; i < count; i += 1) {
    const label = labels.nth(i);
    await label.scrollIntoViewIfNeeded().catch(() => {});
    if (!(await label.isVisible().catch(() => false))) continue;
    const text = (await label.innerText().catch(() => "")).trim();
    if (!text) continue;
    const context = await label.evaluate((el) => {
      const chunks: string[] = [];
      let current: Element | null = el;
      for (let depth = 0; current && depth < 6; depth += 1) {
        chunks.push(current.textContent ?? "");
        current = current.parentElement;
      }
      return chunks.join(" ");
    }).catch(() => text);
    if (findPracticeQChoiceForLabel(text, context, fillPlan)) {
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
}

async function clickPracticeQChoiceInput(input: ReturnType<Page["locator"]>) {
  await input.click().catch(async () => {
    await input.evaluate((el) => {
      const target = el.parentElement?.querySelector("ins.iCheck-helper")
        ?? el.parentElement
        ?? el;
      (target as HTMLElement).click();
    }).catch(async () => {
      await input.click({ force: true }).catch(() => {});
    });
  });
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
    .getByRole("button", { name: /submit(?: form)?|finish|done|complete/i })
    .or(page.locator("input[type='submit'], input[type='button'], button").filter({ hasText: /submit(?: form)?|finish|done|complete/i }))
    .or(page.locator("input[value*='Submit'], input[value*='submit']"))
    .or(page.getByText(/submit form|submit|finish|done|complete/i))
    .first();
  if (await direct.isVisible().catch(() => false)) {
    await direct.scrollIntoViewIfNeeded().catch(() => {});
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

  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("button, input[type='button'], input[type='submit'], a"));
    const target = candidates.find((el) => /submit\s*form|submit|finish|done|complete/i.test([
      el.textContent,
      el.getAttribute("value"),
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ].filter(Boolean).join(" "))) as HTMLElement | undefined;
    target?.click();
    return Boolean(target);
  }).catch(() => false);
  if (clicked) return true;

  return false;
}

function extractPracticeQIntakeId(url: string): string | undefined {
  const match = url.match(/\/(?:history|intake|forms?)\/([^/?#]+)/i) ?? url.match(/[?&](?:intakeId|id)=([^&#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function looksSubmitted(text: string): boolean {
  return /thank you|submitted|received your form|form is complete|successfully submitted/i.test(text);
}
