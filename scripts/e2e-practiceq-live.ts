import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { loadEnvConfig } from "@next/env";
import * as dbServer from "@/lib/db.server";

const BASE_URL = process.env.E2E_BASE_URL ?? "https://mission-wlw.vercel.app";
const STORAGE_KEY = "tele_intake_form_state";
const ID_IMAGE_PATH =
  process.env.E2E_ID_IMAGE_PATH ??
  "C:\\Users\\BishoyKamel\\Downloads\\WhatsApp Image 2026-05-28 at 8.19.09 AM.jpeg";
const ID_VIDEO_PATH =
  process.env.E2E_ID_VIDEO_PATH ??
  "C:\\Users\\BishoyKamel\\Downloads\\WhatsApp Video 2026-05-28 at 8.19.04 AM.mp4";

loadLocalEnv(".env.production.local");
loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

function loadLocalEnv(fileName: string) {
  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function dataUrl(filePath: string, mimeType: string) {
  const body = fs.readFileSync(filePath).toString("base64");
  return `data:${mimeType};base64,${body}`;
}

async function videoFrameDataUrl(page: Page, videoSrc: string) {
  await page.setContent(`<video id="v" muted playsinline preload="auto"></video>`);
  await page.evaluate((src) => {
    const video = document.querySelector("video") as HTMLVideoElement;
    video.src = src;
    video.load();
  }, videoSrc);
  return page.evaluate(async () => {
    const video = document.querySelector("video") as HTMLVideoElement;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("video metadata timed out")), 15000);
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
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json() as Promise<T>;
}

function answerForQuestion(question: any) {
  const text = `${question.id} ${question.text}`.toLowerCase();
  if (text.includes("height")) return "5'10\"";
  if (text.includes("current") && text.includes("weight")) return "220";
  if (text.includes("ideal") && text.includes("weight")) return "180";
  if (text.includes("surgical")) return "None";
  if (text.includes("allerg")) return "No known drug allergies";
  if (text.includes("purpose")) return "Weight loss";
  if (question.type === "checkbox") {
    const options = question.options ?? [];
    return options.find((option: string) => /none/i.test(option)) ?? "None apply to me";
  }
  if (question.type === "radio") {
    const options = question.options ?? [];
    const disqualifying = String(question.disqualifying ?? "").toLowerCase();
    return options.find((option: string) => !disqualifying.includes(option.toLowerCase())) ?? options[0] ?? "No";
  }
  return "None";
}

async function poll<T>(label: string, fn: () => Promise<T | null>, timeoutMs: number, intervalMs = 5000) {
  const started = Date.now();
  let last: T | null = null;
  while (Date.now() - started < timeoutMs) {
    last = await fn();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`${label} did not complete in ${Math.round(timeoutMs / 1000)}s. Last: ${JSON.stringify(last)}`);
}

async function main() {
  console.log("Starting live PracticeQ E2E:", BASE_URL);
  if (!fs.existsSync(ID_IMAGE_PATH)) throw new Error(`Missing ID image: ${ID_IMAGE_PATH}`);
  if (!fs.existsSync(ID_VIDEO_PATH)) throw new Error(`Missing ID video: ${ID_VIDEO_PATH}`);
  if (!process.env.POSTGRES_URL && !process.env.POSTGRES_URL_NON_POOLING) {
    throw new Error("POSTGRES_URL or POSTGRES_URL_NON_POOLING is required for DB polling.");
  }

  console.log("Fetching products/questions...");
  const [{ products }, { questions }] = await Promise.all([
    fetchJson<{ products: any[] }>(`${BASE_URL}/api/products`),
    fetchJson<{ questions: any[] }>(`${BASE_URL}/api/questions`),
  ]);
  const product = products.find((item) => item.slug === "tirzepatide") ?? products[0];
  if (!product) throw new Error("No product returned from production API.");
  const dose = product.doses?.[0];
  if (!dose) throw new Error(`Product ${product.id} has no dose options.`);

  const timestamp = Date.now();
  const patient = {
    firstName: "Bishoy",
    lastName: `PracticeQ${timestamp.toString().slice(-5)}`,
    dateOfBirth: "1998-04-14",
    gender: "male",
    phone: "4075550198",
    email: `thebishoy98@gmail.com`,
    address: {
      street1: "6319 Davisson Ave",
      city: "Orlando",
      state: "FL",
      zipCode: "32810",
      country: "USA",
    },
  };
  const questionnaireAnswers = Object.fromEntries(
    questions
      .filter((question) => question.required || question.id?.startsWith("pq_"))
      .map((question) => [question.id, answerForQuestion(question)])
  );

  console.log("Launching browser and preparing identity media...");
  const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "false" ? true : false, slowMo: 60 });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const videoData = dataUrl(ID_VIDEO_PATH, "video/mp4");
  console.log("Extracting selfie frame from video...");
  const licenseImageData = dataUrl(ID_IMAGE_PATH, "image/jpeg");
  const selfieFrameData = await videoFrameDataUrl(page, pathToFileURL(ID_VIDEO_PATH).toString()).catch((error) => {
    console.log("Video frame extraction failed, using ID image as fallback frame:", error.message);
    return licenseImageData;
  });
  console.log("Identity media ready.");

  console.log("Opening payment page and injecting intake state...");
  await page.goto(`${BASE_URL}/start/payment`, { waitUntil: "networkidle" });
  // Seed product into localStorage so the payment page can read its price
  await page.evaluate(
    ({ productsKey, productRow }) => localStorage.setItem(productsKey, JSON.stringify([productRow])),
    { productsKey: "tele_products", productRow: product }
  );

  await page.evaluate(
    ({ key, state }) => sessionStorage.setItem(key, JSON.stringify(state)),
    {
      key: STORAGE_KEY,
      state: {
        ...patient,
        shippingAddress: patient.address,
        productId: product.id,
        doseId: dose.id,
        questionnaireAnswers,
        consentAcknowledged: true,
        signedName: `${patient.firstName} ${patient.lastName}`,
        consented: true,
        licenseUploaded: true,
        selfieUploaded: true,
        licenseImageData,
        selfieFrameData,
        identityVideoData: videoData,
        paymentProcessed: false,
      },
    }
  );
  await page.reload({ waitUntil: "networkidle" });

  console.log("Filling payment fields...");
  await page.locator('input[placeholder*="4242"]').fill("4111111111111111", { timeout: 15000 });
  await page.locator('input[placeholder*="12/"]').fill("12/28", { timeout: 15000 });
  await page.locator('input[type="password"]').fill("123", { timeout: 15000 });
  await page.waitForFunction(
    "(() => { const b = document.querySelector('button[type=\"submit\"]'); return b && !b.disabled; })()",
    { timeout: 15000 }
  );
  // Debug: log what's in storage
  const storageDebug = await page.evaluate(() => ({
    products: localStorage.getItem("tele_products"),
    intake: sessionStorage.getItem("tele_intake_form_state"),
  }));
  const storedProducts = storageDebug.products ? JSON.parse(storageDebug.products) : null;
  const storedIntake = storageDebug.intake ? JSON.parse(storageDebug.intake) : null;
  console.log("localStorage tele_products:", storedProducts ? `${storedProducts.length} products, first id=${storedProducts[0]?.id}` : "null");
  console.log("sessionStorage intake productId:", storedIntake?.productId, "doseId:", storedIntake?.doseId);
  if (storedProducts?.[0]) {
    const matchedDose = storedProducts[0].doses?.find((d: any) => d.id === storedIntake?.doseId);
    console.log("Matched dose:", matchedDose ? `price=${matchedDose.price}` : "NOT FOUND");
  }

  await fs.promises.mkdir("output/playwright", { recursive: true });
  await page.screenshot({ path: "output/playwright/e2e-before-submit.png", fullPage: true });
  console.log("Screenshot saved: output/playwright/e2e-before-submit.png");

  // Log all API responses to diagnose what happens after click
  page.on("response", (response) => {
    if (response.url().includes("/api/") || response.url().includes("payments")) {
      console.log("API response:", response.status(), response.url());
    }
  });
  page.on("requestfailed", (req) => {
    console.log("Request failed:", req.url(), req.failure()?.errorText);
  });

  const chargeResponsePromise = page.waitForResponse((response) => response.url().includes("/api/payments/charge"), {
    timeout: 90000,
  });
  console.log("Submitting payment...");
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "output/playwright/e2e-after-click.png", fullPage: true });
  console.log("Screenshot saved: output/playwright/e2e-after-click.png");
  const chargeResponse = await chargeResponsePromise;
  const chargeBody = await chargeResponse.json().catch(() => ({}));
  console.log("Charge status:", chargeResponse.status(), JSON.stringify(chargeBody));
  if (!chargeResponse.ok()) throw new Error(`Charge failed: ${JSON.stringify(chargeBody)}`);

  await page.waitForURL(/confirmation/, { timeout: 60000 }).catch(() => {});
  await fs.promises.mkdir("output/playwright", { recursive: true });
  await page.screenshot({ path: "output/playwright/practiceq-live-confirmation.png", fullPage: true });
  await browser.close();

  console.log("Polling production DB for patient/order/job...");
  const patientRow = await poll("patient row", () => dbServer.patientDb.getByEmail(patient.email), 60000, 3000);
  const order = await poll(
    "order row",
    async () => {
      const rows = await dbServer.orderDb.getAll();
      return rows.find((row) => row.patientId === patientRow.id) ?? null;
    },
    60000,
    3000
  );
  console.log("Order:", JSON.stringify({
    id: order.id,
    patientId: order.patientId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    identityStatus: order.identityStatus,
    practiceQStatus: order.practiceQStatus,
    pharmacyStatus: order.pharmacyStatus,
  }));

  const job = await poll("PracticeQ job queued", () => dbServer.practiceqAutomationJobDb.getByOrder(order.id), 90000, 3000);
  console.log("PracticeQ job queued:", JSON.stringify({ id: job.id, status: job.status, handoffUrl: job.handoffUrl }));

  const completedJob = await poll(
    "PracticeQ job completion",
    async () => {
      const row = await dbServer.practiceqAutomationJobDb.getByOrder(order.id);
      if (!row) return null;
      console.log("PracticeQ poll:", JSON.stringify({
        status: row.status,
        intakeId: row.intakeId,
        lastError: row.lastError,
        handoffUrl: row.handoffUrl,
      }));
      return row.status === "completed" || row.status === "failed" ? row : null;
    },
    8 * 60 * 1000,
    10000
  );
  if (completedJob.status !== "completed") {
    throw new Error(`PracticeQ failed: ${completedJob.lastError ?? "unknown error"}`);
  }

  const completedOrder = await dbServer.orderDb.getById(order.id);
  const pharmacyOrder = await poll(
    "LifeFile sandbox dispatch",
    () => dbServer.pharmacyOrderDb.getByOrder(order.id),
    2 * 60 * 1000,
    5000
  );
  console.log("Final order:", JSON.stringify({
    id: completedOrder?.id,
    status: completedOrder?.status,
    identityStatus: completedOrder?.identityStatus,
    practiceQStatus: completedOrder?.practiceQStatus,
    pharmacyStatus: completedOrder?.pharmacyStatus,
  }));
  console.log("Pharmacy order:", JSON.stringify({
    id: pharmacyOrder.id,
    lifeFileOrderId: pharmacyOrder.lifeFileOrderId,
    status: pharmacyOrder.status,
    lastError: pharmacyOrder.lastError,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
