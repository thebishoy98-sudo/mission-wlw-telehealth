import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { loadEnvConfig } from "@next/env";
import * as dbServer from "@/lib/db.server";
import { buildPracticeQFillPlan } from "@/services/practiceq-browser-fill";
import {
  fillKnownPracticeQLogin,
  fillPracticeQQuestionPages,
  submitPracticeQInBackground,
} from "@/services/practiceq-worker";

type PracticeQUploadFile = { base64Data: string; mimeType: string; extension: string };

const jobId = process.env.PRACTICEQ_DEBUG_JOB_ID ?? "95ccnip29tsmppquzqg";
const outDir = path.join(process.cwd(), "output", "playwright", `practiceq-debug-${jobId}`);

function loadLocalEnv(fileName: string) {
  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

async function saveEvidence(page: any, label: string) {
  await fs.promises.mkdir(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: true }).catch(() => {});
  const text = await page.locator("body").innerText().catch(() => "");
  await fs.promises.writeFile(path.join(outDir, `${label}.txt`), text);
  console.log(`${label}: ${page.url()}`);
  console.log(text.slice(0, 1200));
}

async function main() {
  loadLocalEnv(".env.production.local");
  loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

  const job = await dbServer.practiceqAutomationJobDb.update(jobId, {
    status: "running",
    attempts: 99,
    lockedAt: new Date().toISOString(),
  });
  if (!job) throw new Error(`Job not found: ${jobId}`);
  const order = await dbServer.orderDb.getById(job.orderId);
  if (!order) throw new Error(`Order not found: ${job.orderId}`);

  const [patient, answers, questions, consent, uploads] = await Promise.all([
    dbServer.patientDb.getById(job.patientId),
    dbServer.answerDb.getByOrder(job.orderId),
    dbServer.questionDb.getAll(),
    dbServer.consentDb.getByOrder(job.orderId).catch(() => null),
    dbServer.uploadDb.getByOrder(job.orderId).catch(() => []),
  ]);
  if (!patient) throw new Error(`Patient not found: ${job.patientId}`);

  const fillPlan = buildPracticeQFillPlan(patient, answers, questions, consent);

  // Prefer an injected local video file (PRACTICEQ_DEBUG_VIDEO_PATH) so we can test the
  // upload path even when the DB order has no uploaded file yet.
  let uploadFile: PracticeQUploadFile | null = null;
  const localVideoPath = process.env.PRACTICEQ_DEBUG_VIDEO_PATH;
  if (localVideoPath && fs.existsSync(localVideoPath)) {
    const ext = path.extname(localVideoPath).replace(".", "") || "mp4";
    const mimeType = ext === "webm" ? "video/webm" : "video/mp4";
    const base64Data = "data:" + mimeType + ";base64," + fs.readFileSync(localVideoPath).toString("base64");
    uploadFile = { base64Data, mimeType, extension: ext };
    console.log("Using local video:", localVideoPath, `(${Math.round(fs.statSync(localVideoPath).size / 1024)} KB)`);
  } else {
    const dbUpload = uploads.find((u) => u.type === "selfie_video" && u.base64Data)
      ?? uploads.find((u) => u.type === "driver_license" && u.base64Data);
    if (dbUpload?.base64Data) {
      const ext = dbUpload.mimeType?.includes("mp4") ? "mp4" : dbUpload.mimeType?.includes("webm") ? "webm" : "jpg";
      uploadFile = { base64Data: dbUpload.base64Data, mimeType: dbUpload.mimeType || "video/mp4", extension: ext };
      console.log("Using DB upload:", dbUpload.type);
    }
  }

  console.log("Debugging job", JSON.stringify({ jobId, orderId: job.orderId, patient: patient.email, answers: answers.length, fillPlan: fillPlan.length, hasUpload: !!uploadFile }));

  const browser = await chromium.launch({ headless: process.env.PRACTICEQ_DEBUG_HEADLESS === "true", slowMo: 80 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(8000);
  try {
    await page.goto(job.practiceQStartUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);
    await saveEvidence(page, "01-start");
    await fillKnownPracticeQLogin(page, patient);
    await saveEvidence(page, "02-login-filled");
    await page.getByRole("button", { name: /continue|next/i }).first().click().catch(async () => {
      await page.locator("button, input[type='button'], input[type='submit']").filter({ hasText: /continue|next/i }).first().click();
    });
    await page.waitForTimeout(2000);
    await saveEvidence(page, "03-after-login-continue");
    const outcome = await fillPracticeQQuestionPages(page, fillPlan, uploadFile);
    await saveEvidence(page, "04-after-fill-pages");
    const result = await submitPracticeQInBackground(page, outcome, fillPlan);
    console.log("Submit result:", JSON.stringify(result));
    await saveEvidence(page, "05-after-submit");
  } catch (error) {
    console.error("Debug failure:", error instanceof Error ? error.stack ?? error.message : error);
    await saveEvidence(page, "error");
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
