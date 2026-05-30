import { chromium, type Locator, type Page } from "playwright";
import fs from "fs";
import os from "os";
import path from "path";

const START_URL = process.env.INTAKEQ_SMOKE_URL ?? "https://intakeq.com/new/yjvht0";
const OUT_DIR = path.join(process.cwd(), "output", "playwright", `live-intakeq-smoke-${Date.now()}`);

const testPatient = {
  name: `Mission Agent Smoke ${Date.now().toString().slice(-6)}`,
  firstName: "Mission",
  lastName: `Smoke${Date.now().toString().slice(-6)}`,
  email: `mission.intakeq.smoke+${Date.now()}@example.com`,
  phone: "4075550101",
  dob: "01/15/1990",
  gender: "Male",
  address: "123 Test Patient Ave",
  city: "Orlando",
  state: "FL",
  zip: "32801",
  height: "5 ft 10 in",
  currentWeight: "220",
  idealWeight: "180",
};

async function bodyText(page: Page) {
  return (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
}

function looksSubmitted(text: string) {
  return /thank you|submitted|received your form|intake has been received|form is complete|successfully submitted/i.test(text);
}

async function screenshot(page: Page, name: string) {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true }).catch(() => undefined);
  await fs.promises.writeFile(path.join(OUT_DIR, `${name}.txt`), await bodyText(page)).catch(() => undefined);
  await fs.promises.writeFile(path.join(OUT_DIR, `${name}.html`), await page.content()).catch(() => undefined);
}

async function visibleCount(locator: Locator) {
  const count = await locator.count().catch(() => 0);
  let visible = 0;
  for (let i = 0; i < count; i += 1) {
    if (await locator.nth(i).isVisible().catch(() => false)) visible += 1;
  }
  return visible;
}

async function promptForField(field: Locator) {
  return field.evaluate((el) => {
    const node = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const id = node.id ? `#${CSS.escape(node.id)}` : "";
    const label = id ? document.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent : "";
    const container = node.closest("[ng-repeat], .question, .panel, fieldset, .form-group, div");
    return [
      label,
      node.getAttribute("aria-label"),
      node.getAttribute("placeholder"),
      node.name,
      node.id,
      container?.textContent,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
  }).catch(() => "");
}

function answerForPrompt(prompt: string) {
  const p = prompt.toLowerCase();
  if (p.includes("first name")) return testPatient.firstName;
  if (p.includes("last name")) return testPatient.lastName;
  if (p.includes("full name") || /\bname\b/.test(p) || p.includes("signature") || p.includes("print")) return testPatient.name;
  if (p.includes("email")) return testPatient.email;
  if (p.includes("phone")) return testPatient.phone;
  if (p.includes("birth") || p.includes("dob")) return testPatient.dob;
  if (p.includes("gender") || p.includes("sex")) return testPatient.gender;
  if (p.includes("height")) return testPatient.height;
  if (p.includes("current") && p.includes("weight")) return testPatient.currentWeight;
  if (p.includes("ideal") && p.includes("weight")) return testPatient.idealWeight;
  if (p.includes("address")) return testPatient.address;
  if (p.includes("city")) return testPatient.city;
  if (p.includes("state")) return testPatient.state;
  if (p.includes("zip") || p.includes("postal")) return testPatient.zip;
  if (p.includes("allerg")) return "No known drug allergies";
  if (p.includes("surg")) return "None";
  if (p.includes("medication")) return "None";
  if (p.includes("purpose") || p.includes("visit")) return "Weight loss";
  if (p.includes("condition") || p.includes("history")) return "None";
  return "None";
}

async function fillVisibleFields(page: Page) {
  let filled = 0;
  const fields = page.locator("input:visible:not([type='hidden']):not([type='checkbox']):not([type='radio']):not([type='file']), textarea:visible");
  const count = await fields.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const field = fields.nth(i);
    if (!(await field.isVisible().catch(() => false))) continue;
    const value = await field.inputValue().catch(() => "");
    if (value.trim()) continue;
    const prompt = await promptForField(field);
    await field.fill(answerForPrompt(prompt)).catch(async () => {
      await field.click({ force: true }).catch(() => undefined);
      await page.keyboard.insertText(answerForPrompt(prompt)).catch(() => undefined);
    });
    filled += 1;
  }
  return filled;
}

async function forceSetInput(field: Locator, value: string) {
  await field.scrollIntoViewIfNeeded().catch(() => undefined);
  await field.click({ force: true }).catch(() => undefined);
  await field.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => undefined);
  await field.fill(value).catch(() => undefined);
  await field.evaluate((el, nextValue) => {
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }, value).catch(() => undefined);
  await field.press("Escape").catch(() => undefined);
  await field.press("Tab").catch(() => undefined);
}

async function selectSafeChoices(page: Page) {
  const clicked = await page.evaluate(() => {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const safe = /^(no|none|none of the above|none apply|not applicable|male|i consent|agree)$/i;
    const inputText = (input: HTMLInputElement) => {
      const label = input.closest("label")?.textContent ?? "";
      const parent = input.parentElement?.textContent ?? "";
      const next = input.nextSibling?.textContent ?? "";
      return normalize([label, parent, next, input.value].filter(Boolean).join(" "));
    };
    const labels = Array.from(document.querySelectorAll("label"));
    let count = 0;
    for (const label of labels) {
      const text = normalize(label.textContent ?? "");
      const input = label.querySelector("input") as HTMLInputElement | null;
      if (!input || input.checked || input.disabled) continue;
      if (safe.test(text) || text.includes("none") || text === "no") {
        label.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        count += 1;
      }
    }
    const checkboxes = Array.from(document.querySelectorAll("input[type='checkbox']")) as HTMLInputElement[];
    for (const checkbox of checkboxes) {
      if (checkbox.checked || checkbox.disabled) continue;
      const text = inputText(checkbox);
      if (text.includes("none apply to me") || text.includes("tirzepatide")) {
        checkbox.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        checkbox.click();
        count += 1;
      }
    }
    const radios = Array.from(document.querySelectorAll("input[type='radio']")) as HTMLInputElement[];
    const groups = new Set(radios.map((radio) => radio.name).filter(Boolean));
    for (const group of groups) {
      const groupRadios = radios.filter((radio) => radio.name === group);
      if (groupRadios.some((radio) => radio.checked)) continue;
      const candidate = groupRadios.find((radio) => /(no|none|male)/i.test(inputText(radio))) ?? groupRadios[0];
      candidate?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      candidate?.click();
      count += candidate ? 1 : 0;
    }
    return count;
  }).catch(() => 0);
  return clicked;
}

async function completeConsentIfVisible(page: Page) {
  const text = await bodyText(page);
  const onConsentDocument = /please read and sign|submit signature|patient or responsible party signature/i.test(text);
  const hasReadAndSignLink = /read\s*&?\s*sign/i.test(text);

  if (!onConsentDocument && hasReadAndSignLink) {
    await clickByText(page, /read\s*&?\s*sign/i);
    await page.waitForTimeout(1000);
  }

  const consentText = await bodyText(page);
  if (!/please read and sign|submit signature|consent for medical treatment/i.test(consentText)) return false;

  await clickByText(page, /type\s+it/i);
  await fillVisibleFields(page);

  const consentCheckboxes = page.locator("input[type='checkbox']:visible");
  const consentCheckboxCount = await consentCheckboxes.count().catch(() => 0);
  for (let i = 0; i < consentCheckboxCount; i += 1) {
    const checkbox = consentCheckboxes.nth(i);
    if (await checkbox.isChecked().catch(() => false)) continue;
    await checkbox.check({ force: true }).catch(async () => {
      await checkbox.evaluate((el) => {
        const input = el as HTMLInputElement;
        input.checked = true;
        input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }).catch(() => undefined);
    });
  }

  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input:not([type='hidden']), textarea")) as Array<
      HTMLInputElement | HTMLTextAreaElement
    >;
    for (const input of inputs) {
      if (input.type === "checkbox") {
        if (!(input as HTMLInputElement).checked) {
          input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          (input as HTMLInputElement).click();
        }
        continue;
      }
      if (input.value.trim()) continue;
      const text = [
        input.getAttribute("placeholder"),
        input.getAttribute("aria-label"),
        input.name,
        input.id,
        input.closest(".field, .form-group, div")?.textContent,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (text.includes("initial")) input.value = "MAS";
      else if (text.includes("birth") || text.includes("dob")) input.value = "01/15/1990";
      else if (text.includes("name") || text.includes("signature")) input.value = "Mission Agent Smoke";
      else input.value = "Mission Agent Smoke";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));
    }
  });

  const consentFields = page.locator("input:visible:not([type='hidden']):not([type='checkbox']):not([type='radio']):not([type='file']), textarea:visible");
  const consentFieldCount = await consentFields.count().catch(() => 0);
  for (let i = 0; i < consentFieldCount; i += 1) {
    const field = consentFields.nth(i);
    const prompt = await promptForField(field);
    const value = await field.inputValue().catch(() => "");
    if (/date of birth|dob|birth/i.test(prompt) || value.trim().toLowerCase() === "none") {
      await forceSetInput(field, testPatient.dob);
      continue;
    }
    if (/initial/i.test(prompt) && !value.trim()) {
      await forceSetInput(field, "MAS");
      continue;
    }
    if (/patient name|print your name|signature|name/i.test(prompt) && !value.trim()) {
      await forceSetInput(field, testPatient.name);
    }
  }

  await clickByText(page, /type\s+it/i);
  await page.waitForTimeout(500);
  const signatureFields = page.locator("input:visible:not([type='hidden']):not([type='checkbox']):not([type='radio']):not([type='file'])");
  const signatureFieldCount = await signatureFields.count().catch(() => 0);
  for (let i = Math.max(0, signatureFieldCount - 3); i < signatureFieldCount; i += 1) {
    const field = signatureFields.nth(i);
    const prompt = await promptForField(field);
    const value = await field.inputValue().catch(() => "");
    if (/print your name|signature|patient or responsible party/i.test(prompt) || value.includes(testPatient.name)) {
      await field.scrollIntoViewIfNeeded().catch(() => undefined);
      await field.click({ force: true }).catch(() => undefined);
      await field.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => undefined);
      await page.keyboard.type(`${testPatient.name} Signature`, { delay: 20 }).catch(async () => {
        await page.keyboard.insertText(`${testPatient.name} Signature`).catch(() => undefined);
      });
      await field.press("Tab").catch(() => undefined);
      break;
    }
  }
  await screenshot(page, `consent-before-submit-${Date.now()}`);

  await clickSubmitSignature(page);
  await page.waitForTimeout(3000);
  if (/submit signature/i.test(await bodyText(page))) {
    await clickSubmitSignature(page);
    await page.waitForTimeout(3000);
  }
  await screenshot(page, `consent-after-submit-${Date.now()}`);
  await clickByText(page, /back\s+to\s+questionnaire/i);
  await page.waitForTimeout(1000);
  return true;
}

async function uploadDummyFiles(page: Page) {
  const fileInputs = page.locator("input[type='file']");
  const count = await fileInputs.count().catch(() => 0);
  if (!count) return 0;
  const providedVideoPath = process.env.INTAKEQ_SMOKE_VIDEO_PATH;
  const filePath = providedVideoPath && fs.existsSync(providedVideoPath)
    ? providedVideoPath
    : path.join(os.tmpdir(), `intakeq-smoke-${Date.now()}.jpg`);
  if (!fs.existsSync(filePath)) {
    const jpeg1x1 = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2w==", "base64");
    fs.writeFileSync(filePath, jpeg1x1);
  }
  let uploaded = 0;
  for (let i = 0; i < count; i += 1) {
    await fileInputs.nth(i).setInputFiles(filePath).then(() => { uploaded += 1; }).catch(() => undefined);
  }
  return uploaded;
}

async function clickLeftOfText(page: Page, text: string | RegExp, ordinal = 0) {
  const locator = typeof text === "string" ? page.getByText(text, { exact: true }) : page.getByText(text);
  const count = await locator.count().catch(() => 0);
  const boxes: Array<{ index: number; x: number; y: number; width: number; height: number; area: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const candidate = locator.nth(i);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const box = await candidate.boundingBox().catch(() => null);
    if (!box) continue;
    boxes.push({ index: i, ...box, area: box.width * box.height });
  }
  const ordered = boxes.sort((a, b) => a.y - b.y || a.area - b.area);
  const picked = ordered[ordinal] ?? ordered.sort((a, b) => a.area - b.area)[0];
  if (!picked) return false;
  await page.mouse.click(Math.max(1, picked.x - 16), picked.y + picked.height / 2);
  await page.waitForTimeout(250);
  return true;
}

async function setExactPracticeQCheckboxes(page: Page, labels: string[], artifactName: string) {
  const script = `
(() => {
  const requestedLabels = ${JSON.stringify(labels)};
  const normalize = (value) => String(value ?? "")
    .toLowerCase()
    .replace(/\\([^)]*\\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
  const requested = new Set(requestedLabels.map(normalize));
  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const angular = window.angular;
  const output = [];
  const scheduleDigest = (scope) => {
    if (!scope) return;
    if (typeof scope.$applyAsync === "function") scope.$applyAsync();
  };

  for (const label of Array.from(document.querySelectorAll("label"))) {
    const labelText = normalize(label.textContent);
    if (!requested.has(labelText) || !isVisible(label)) continue;
    const input = label.querySelector("input[type='checkbox']");
    if (!input || input.disabled) continue;

    const scope = angular?.element?.(input)?.scope?.();
    const ngModel = angular?.element?.(input)?.controller?.("ngModel");
    const scopes = [];
    for (let current = scope, depth = 0; current && depth < 8; current = current.$parent, depth += 1) {
      scopes.push(current);
    }
    const optionScope = scopes.find((candidate) => normalize(candidate?.o?.Text) === labelText)
      ?? scopes.find((candidate) => candidate?.o);
    const questionScope = scopes.find((candidate) => candidate?.question)
      ?? optionScope?.$parent
      ?? scope;
    const question = questionScope?.question;

    if (ngModel?.$setViewValue) {
      ngModel.$setViewValue(true);
      if (typeof ngModel.$render === "function") ngModel.$render();
    }
    if (optionScope?.o) {
      optionScope.o.Checked = true;
      optionScope.o.Answer = optionScope.o.Text ?? label.textContent?.trim();
    }
    if (question) {
      question.isanswered = true;
      if (Array.isArray(question.QuestionOptions)) {
        for (const option of question.QuestionOptions) {
          if (normalize(option?.Text) === labelText) {
            option.Checked = true;
            option.Answer = option.Text;
          }
        }
        const selected = question.QuestionOptions
          .filter((option) => option?.Checked)
          .map((option) => option?.Text)
          .filter(Boolean);
        if (selected.length) question.Answer = selected.join(", ");
      }
      questionScope?.changed?.(question);
      questionScope?.onblur?.(question, question.Answer, optionScope?.o);
      questionScope?.textChanged?.();
    }

    input.checked = true;
    input.setAttribute("checked", "checked");
    for (const eventName of ["input", "change", "blur"]) {
      input.dispatchEvent(new Event(eventName, { bubbles: true }));
    }
    scheduleDigest(scope);
    scheduleDigest(optionScope);
    scheduleDigest(questionScope);

    output.push({
      label: label.textContent?.replace(/\\s+/g, " ").trim(),
      checked: input.checked,
      ngModel: ngModel?.$viewValue,
      optionChecked: optionScope?.o?.Checked,
      questionAnswered: question?.isanswered,
      questionAnswer: question?.Answer,
    });
  }

  return output;
})()
`;
  const results = await page.evaluate(script) as Array<Record<string, unknown>>;

  await fs.promises.writeFile(
    path.join(OUT_DIR, `${artifactName}.json`),
    JSON.stringify(results, null, 2),
  ).catch(() => undefined);
  return results;
}

async function fixKnownRequiredFields(page: Page) {
  const text = await bodyText(page);
  if (/first name.*last name.*date of birth.*phone number.*email.*address/i.test(text)) {
    const fields = page.locator("input:visible:not([type='hidden']):not([type='radio']):not([type='checkbox']):not([type='file'])");
    const values = [
      testPatient.firstName,
      testPatient.lastName,
      testPatient.dob,
      testPatient.phone,
      testPatient.email,
      testPatient.address,
      testPatient.city,
      testPatient.state,
      testPatient.zip,
    ];
    const count = Math.min(await fields.count().catch(() => 0), values.length);
    for (let i = 0; i < count; i += 1) {
      const field = fields.nth(i);
      const currentValue = await field.inputValue().catch(() => "");
      if (currentValue === values[i]) continue;
      await field.fill(values[i], { timeout: 3000 }).catch(() => undefined);
    }
    await page.getByText(/^Male$/).click({ force: true, timeout: 3000 }).catch(() => undefined);
    await page.locator("input[type='radio']").first().check({ force: true, timeout: 3000 }).catch(() => undefined);
  }

  await page.evaluate((patient) => {
    const setValue = (input: HTMLInputElement | HTMLTextAreaElement | null | undefined, value: string) => {
      if (!input) return false;
      if (input.value === value) return false;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    };

    const labels = Array.from(document.querySelectorAll("label, .control-label, div, span"));
    for (const label of labels) {
      const text = (label.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!text) continue;
      const container = label.closest(".form-group, .row, .field, [ng-repeat], div");
      const input = (container?.querySelector("input:not([type='hidden']):not([type='radio']):not([type='checkbox'])") ??
        label.parentElement?.querySelector("input:not([type='hidden']):not([type='radio']):not([type='checkbox'])")) as HTMLInputElement | null;
      if (text.includes("date of birth")) setValue(input, patient.dob);
      if (text === "first name") setValue(input, patient.firstName);
      if (text === "last name") setValue(input, patient.lastName);
      if (text.includes("phone number")) setValue(input, patient.phone);
      if (text === "email") setValue(input, patient.email);
      if (text.includes("address")) setValue(input, patient.address);
      if (text === "city") setValue(input, patient.city);
      if (text === "state") setValue(input, patient.state);
      if (text.includes("zip")) setValue(input, patient.zip);
    }

    const radios = Array.from(document.querySelectorAll("input[type='radio']")) as HTMLInputElement[];
    const maleRadio = radios.find((radio) => /male/i.test(radio.value) || /male/i.test(radio.closest("label")?.textContent ?? ""));
    if (maleRadio && !maleRadio.checked) {
      maleRadio.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      maleRadio.click();
    }
  }, testPatient).catch(() => undefined);

  const pageText = await bodyText(page);
  if (/select any that apply to you|any surgical history|allergies to medication|this intake form is for/i.test(pageText)) {
    const exactCheckboxResults = await setExactPracticeQCheckboxes(
      page,
      ["None apply to me", "Tirzepatide"],
      `checkbox-fix-${Date.now()}`,
    );
    console.log(`Exact checkbox updates: ${JSON.stringify(exactCheckboxResults)}`);
    await clickLeftOfText(page, "None apply to me");
    await clickLeftOfText(page, "Tirzepatide");
    const noCount = await page.getByText(/^No$/).count().catch(() => 0);
    for (let i = 0; i < noCount; i += 1) {
      await clickLeftOfText(page, /^No$/, i);
    }
  }
}

async function clickByText(page: Page, pattern: RegExp) {
  const candidates = page.locator("button, input[type='button'], input[type='submit'], a, [role='button']").filter({ hasText: pattern });
  if (await candidates.first().isVisible().catch(() => false)) {
    await candidates.first().click({ timeout: 8000 }).catch(async () => candidates.first().click({ force: true, timeout: 3000 }));
    return true;
  }
  const flags = pattern.flags.includes("i") ? pattern.flags : `${pattern.flags}i`;
  const script = `
(() => {
  const re = new RegExp(${JSON.stringify(pattern.source)}, ${JSON.stringify(flags)});
  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const textOf = (el) => [
    el.textContent,
    el.getAttribute("value"),
    el.getAttribute("aria-label"),
    el.getAttribute("title"),
  ].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
  const clickNode = (node) => {
    node.scrollIntoView({ block: "center", inline: "center" });
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    node.click();
    return true;
  };
  const actionable = Array.from(document.querySelectorAll("button,input[type='button'],input[type='submit'],a,[role='button']"));
  const direct = actionable.find((el) => isVisible(el) && re.test(textOf(el)));
  if (direct) return clickNode(direct);
  const containers = Array.from(document.querySelectorAll("span,div,label"));
  const container = containers.find((el) => isVisible(el) && re.test((el.textContent ?? "").replace(/\\s+/g, " ").trim()));
  const target = container?.closest("button,input[type='button'],input[type='submit'],a,[role='button']");
  if (!target || !isVisible(target)) return false;
  return clickNode(target);
})()
`;
  return page.evaluate(script).catch(() => false);
}

async function clickSubmitSignature(page: Page) {
  const exactSubmit = page.locator(
    "input[type='submit'][value*='Submit Signature'], input[type='button'][value*='Submit Signature'], button:has-text('Submit Signature'), a:has-text('Submit Signature'), button:has-text('Click to Sign'), a:has-text('Click to Sign')",
  );
  if (await exactSubmit.first().isVisible().catch(() => false)) {
    const button = exactSubmit.first();
    await button.scrollIntoViewIfNeeded().catch(() => undefined);
    await button.click({ force: true, timeout: 5000 }).catch(() => undefined);
    return true;
  }
  return page.evaluate(`
(() => {
  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const controls = Array.from(document.querySelectorAll("input,button,a"));
  const submit = controls.find((control) => {
    const text = [control.value, control.textContent, control.getAttribute("aria-label")].filter(Boolean).join(" ");
    return isVisible(control) && /submit signature|click to sign/i.test(text);
  });
  if (!submit) return false;
  submit.scrollIntoView({ block: "center", inline: "center" });
  submit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  submit.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  submit.click();
  return true;
})()
`).catch(() => false);
}

async function waitForSaveIdle(page: Page) {
  await page.waitForFunction(() => !/saving/i.test(document.body?.innerText ?? ""), null, { timeout: 15000 }).catch(() => undefined);
}

async function clickNextPage(page: Page) {
  await waitForSaveIdle(page);
  return (
    (await clickByText(page, /next\s+page/i)) ||
    (await clickByText(page, /^next$/i)) ||
    (await clickByText(page, /continue/i)) ||
    (await clickByText(page, /save/i))
  );
}

async function main() {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: process.env.INTAKEQ_SMOKE_HEADLESS !== "false" });
  const page = await browser.newPage({ viewport: { width: 1366, height: 950 } });
  page.setDefaultTimeout(12000);

  console.log(`Opening ${START_URL}`);
  console.log(`Synthetic patient: ${testPatient.name} <${testPatient.email}>`);
  await page.goto(START_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  await screenshot(page, "01-start");

  await page.locator("#Name").fill(testPatient.name).catch(() => undefined);
  await page.locator("#Email").fill(testPatient.email).catch(() => undefined);
  await clickByText(page, /continue|start|next|fill\s+this\s+out/i);
  await page.waitForTimeout(1500);

  for (let step = 1; step <= 30; step += 1) {
    const text = await bodyText(page);
    console.log(`Step ${step}: ${text.slice(0, 180)}`);
    await screenshot(page, `step-${String(step).padStart(2, "0")}`);
    if (looksSubmitted(text)) {
      console.log("Submitted state detected.");
      await browser.close();
      console.log(JSON.stringify({ ok: true, submitted: true, patient: testPatient, outputDir: OUT_DIR }, null, 2));
      return;
    }

    await clickByText(page, /start\s+new\s+intake|start\s+new|back\s+to\s+questionnaire/i);
    await clickByText(page, /^ok$/i);
    const completedConsent = await completeConsentIfVisible(page);
    const filled = await fillVisibleFields(page);
    await fixKnownRequiredFields(page);
    const choices = await selectSafeChoices(page);
    const uploads = await uploadDummyFiles(page);
    if (!completedConsent) await clickByText(page, /i\s+agree|agree|accept|save/i);
    const submitClicked = /submit|complete|finish/i.test(text) && await clickByText(page, /submit(?:\s+form)?|complete|finish|done/i);
    if (submitClicked) {
      await page.waitForTimeout(1200);
      await clickByText(page, /^submit$|yes|confirm|ok|proceed/i);
    } else {
      await clickNextPage(page);
    }

    console.log(`Step ${step} actions: filled=${filled}, choices=${choices}, uploads=${uploads}, url=${page.url()}`);
    await page.waitForTimeout(1800);
  }

  const finalText = await bodyText(page);
  await screenshot(page, "99-final-not-submitted");
  await browser.close();
  throw new Error(`Live IntakeQ smoke did not reach submitted state. Final text: ${finalText.slice(0, 800)}. Artifacts: ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
