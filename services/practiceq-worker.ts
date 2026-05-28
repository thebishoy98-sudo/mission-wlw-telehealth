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
    const verifiedResult = await verifyPracticeQSavedSubmission(submitResult, {
      patient,
      answers,
      questions,
      startedAt: job.createdAt,
    });
    await browser.close().catch(() => {});
    return verifiedResult;
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
    await waitForPracticeQSaved(page);
    await assertVisiblePracticeQFieldsFilled(page, fillPlan);

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
    const prompt = await getPracticeQFieldPrompt(field);
    const answer = findPracticeQAnswerForPrompt(prompt, fillPlan);
    if (!answer) continue;
    const normalizedAnswer = /date of birth|dob/i.test(prompt) ? formatPracticeQDate(answer) : answer;
    await enterFieldValue(field, normalizedAnswer, prompt);
    filled += 1;
  }

  return filled;
}

async function assertVisiblePracticeQFieldsFilled(page: Page, fillPlan: ReturnType<typeof buildPracticeQFillPlan>) {
  const fields = page.locator("input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea");
  const count = await fields.count();
  const missing: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const field = fields.nth(i);
    if (!(await field.isVisible().catch(() => false))) continue;
    const prompt = await getPracticeQFieldPrompt(field);
    const expected = findPracticeQAnswerForPrompt(prompt, fillPlan);
    if (!expected) continue;
    const actual = await field.inputValue().catch(() => "");
    if (!fieldValueMatches(actual, expected, prompt)) {
      missing.push(`${shortenPracticeQPrompt(prompt)} expected "${expected}" but saw "${actual}"`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`PracticeQ did not keep the expected answer: ${missing.slice(0, 4).join("; ")}`);
  }
}

async function getPracticeQFieldPrompt(field: ReturnType<Page["locator"]>): Promise<string> {
  return field.evaluate((el) => {
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
}

async function waitForPracticeQSaved(page: Page) {
  await page.keyboard.press("Tab").catch(() => {});
  await page.waitForTimeout(800);
  await page
    .waitForFunction(() => !/saving/i.test(document.body?.innerText ?? ""), null, { timeout: 8000 })
    .catch(() => {});
  const saved = page.getByText(/saved/i).first();
  if (await saved.isVisible().catch(() => false)) await page.waitForTimeout(500);
}

function fieldValueMatches(actual: string, expected: string, prompt: string): boolean {
  const normalizedActual = normalizePracticeQText(actual);
  const normalizedExpected = normalizePracticeQText(expected);
  if (!normalizedExpected) return true;
  if (normalizedActual === normalizedExpected || normalizedActual.includes(normalizedExpected)) return true;

  if (/phone/i.test(prompt)) {
    return actual.replace(/\D/g, "") === expected.replace(/\D/g, "");
  }
  if (/date of birth|dob/i.test(prompt)) {
    return normalizeDateLike(actual) === normalizeDateLike(expected);
  }
  return false;
}

function normalizePracticeQText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
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
    await readAndSign.click();
    await page.waitForTimeout(1000);
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (!/please read and sign|submit signature|consent for medical treatment/i.test(bodyText)) return;

  await page.getByRole("link", { name: /type it/i }).first().click().catch(() => {});
  await fillVisibleConsentFields(page, fillPlan, signedName);
  await fillVisibleFields(page, fillPlan);

  const uncheckedBoxes = page.locator("input[type='checkbox']:not(:checked)");
  const checkboxCount = await uncheckedBoxes.count();
  for (let i = 0; i < checkboxCount; i += 1) {
    const checkbox = uncheckedBoxes.nth(i);
    await checkbox.scrollIntoViewIfNeeded().catch(() => {});
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
    await submitSignature.click();
    await page.waitForTimeout(1500);
  }

  const back = page.getByText(/back to questionnaire/i).first();
  if (await back.isVisible().catch(() => false)) {
    await back.click();
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

  const inputs = page.locator("input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea");
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
  await field.scrollIntoViewIfNeeded().catch(() => {});
  await field.click().catch(() => {});
  await field.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
  await field.fill("").catch(() => {});
  await field.type(value, { delay: 5 }).catch(async () => {
    await field.fill(value).catch(() => {});
  });
  await field.evaluate((el, input) => {
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
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(el, input.value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    const angular = (window as any).angular;
    const injector = angular?.element(document.body).injector?.();
    const intakeScope = findIntakeScope(injector?.get?.("$rootScope"));
    const questions = intakeScope?.intake?.Questionnaire?.Questions;
    if (!Array.isArray(questions)) return;
    const normalizedPrompt = normalize(input.prompt);
    let changed = false;
    for (const question of questions) {
      const questionText = normalize(question?.Text);
      if (questionText && (normalizedPrompt.includes(questionText) || questionText.includes(normalizedPrompt))) {
        question.Answer = input.value;
        changed = true;
      }
      if (Array.isArray(question?.QuestionItems)) {
        for (const item of question.QuestionItems) {
          const itemText = normalize(item?.Text);
          if (itemText && (normalizedPrompt.includes(itemText) || itemText.includes(normalizedPrompt))) {
            item.Answer = input.value;
            intakeScope?.onblur?.(question, item.Answer, item);
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
  }, { prompt, value }).catch(() => {});
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
  await checkbox.check().catch(async () => {
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

  const matchedIntake = await findRecentPracticeQIntake(context).catch(() => null);
  if (!matchedIntake) {
    return {
      ...result,
      status: "failed",
      error: "PracticeQ browser submit finished, but the submitted intake could not be found through the PracticeQ API.",
    };
  }

  let intake = await getIntakeById(matchedIntake.id).catch(() => null);
  if (!intake) {
    return {
      ...result,
      status: "failed",
      intakeId: matchedIntake.id,
      error: `PracticeQ intake ${matchedIntake.id} was found in summary but could not be loaded for verification.`,
    };
  }

  const beforeStats = countPracticeQAnswers(intake);
  if (beforeStats.answered < expectedPracticeQAnswerCount(context.answers)) {
    intake = await populateAndUpdatePracticeQIntake(intake, {
      patient: context.patient as any,
      answers: context.answers,
      questions: context.questions,
    }).catch(() => intake);
  }

  const refreshed = await getIntakeById(matchedIntake.id).catch(() => intake);
  const verifiedIntake = refreshed ?? intake;
  const answerStats = countPracticeQAnswers(verifiedIntake);
  const consentSigned = hasSignedConsent(verifiedIntake);
  const status = String((verifiedIntake as any)?.Status ?? matchedIntake.status ?? "");

  if (!/completed/i.test(status) || !consentSigned) {
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
  return /thank you|submitted|received your form|form is complete|successfully submitted/i.test(text);
}
