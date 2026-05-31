import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type Product = {
  id: string;
  name: string;
  slug?: string;
  doses?: Array<{ id: string; label?: string; price?: number }>;
};

type Question = {
  id: string;
  text: string;
  required?: boolean;
};

type Patient = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
};

type Order = {
  id: string;
  patientId: string;
  status: string;
  paymentStatus: string;
  quickbooksStatus: string;
  practiceQStatus: string;
  pharmacyStatus: string;
  identityStatus?: string;
  createdAt: string;
};

type Upload = {
  id: string;
  type: string;
  filename: string;
  mimeType: string;
  fileSize?: number;
  storageUrl?: string;
  base64Data?: string;
};

type PracticeQMirror = {
  available?: boolean;
  status?: string;
  intakeId?: string;
  answerFileId?: string;
  pdfFileId?: string;
  answers?: Array<{ question: string; answer: string }>;
};

type OrderDetail = {
  order?: Order;
  patient?: Patient | null;
  practiceq?: PracticeQMirror | null;
  identity?: { status?: string; uploads?: Upload[] };
  consent?: {
    signedName?: string;
    signedAt?: string;
    ipAddress?: string;
    userAgent?: string;
    consentVersion?: string;
    consentText?: string;
  } | null;
  diagnostics?: {
    practiceqAutomation?: {
      status?: string;
      attempts?: number;
      lastError?: string;
      intakeId?: string;
    } | null;
  };
};

type DashboardData = {
  orders: Order[];
  patients: Patient[];
  products?: Product[];
  pagination?: { total?: number };
};

type ProviderDashboardData = {
  orders: Order[];
  patients: Patient[];
};

type StepStatus = "pass" | "fail" | "warn";
type StepResult = {
  name: string;
  status: StepStatus;
  detail?: string;
};

type OrderCandidate = {
  order: Order;
  patient?: Patient;
  detail: OrderDetail;
  strictChart: boolean;
};

const BASE_URL = (process.env.E2E_BASE_URL ?? "https://mission-wlw-web.onrender.com").replace(/\/$/, "");
const HEADLESS = process.env.E2E_HEADLESS !== "false";
const ARTIFACT_ROOT =
  process.env.E2E_ARTIFACT_DIR ??
  path.join(os.tmpdir(), "mission-wlw-smoke", `launch-readiness-${Date.now()}`);
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const PROVIDER_EMAIL = process.env.E2E_PROVIDER_EMAIL ?? "";
const PROVIDER_PASSWORD = process.env.E2E_PROVIDER_PASSWORD ?? "";
const ADMIN_SECRET = process.env.E2E_ADMIN_SECRET ?? "";
const TARGET_ORDER_ID = process.env.E2E_TARGET_ORDER_ID ?? "";
const SEARCH_QUERY = process.env.E2E_SEARCH_QUERY ?? "practiceq-smoke";
const REQUIRED_PQ_QUESTION_IDS = ["pq_height", "pq_current_weight", "pq_ideal_weight"];

const results: StepResult[] = [];
let browser: Browser | null = null;
let activePage: Page | null = null;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function redacted(value: string) {
  return value ? "[set]" : "[missing]";
}

function authHeaders() {
  assert(ADMIN_SECRET, "E2E_ADMIN_SECRET is required for privileged launch smoke checks.");
  return { "x-admin-secret": ADMIN_SECRET };
}

async function fetchText(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${body.slice(0, 700)}`);
  }
  return { response, body };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const { body } = await fetchText(url, init);
  return (body ? JSON.parse(body) : {}) as T;
}

async function fetchStatus(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.text().catch(() => "");
  return { response, body };
}

async function saveScreenshot(name: string) {
  if (!activePage) return;
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  const file = path.join(ARTIFACT_ROOT, `${name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.png`);
  try {
    await activePage.screenshot({ path: file, fullPage: true });
    console.log(`  artifact: ${file}`);
  } catch {
    // The scenario may already have closed its context.
  }
}

async function runStep(name: string, fn: () => Promise<void>) {
  const started = Date.now();
  try {
    await fn();
    const ms = Date.now() - started;
    results.push({ name, status: "pass", detail: `${ms}ms` });
    console.log(`PASS ${name} (${ms}ms)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "fail", detail: message });
    console.error(`FAIL ${name}: ${message}`);
    await saveScreenshot(name);
  }
}

function warn(name: string, detail: string) {
  results.push({ name, status: "warn", detail });
  console.warn(`WARN ${name}: ${detail}`);
}

async function newContext(viewport = { width: 1440, height: 1000 }) {
  assert(browser, "Browser was not started.");
  return browser.newContext({ viewport });
}

async function pageText(page: Page) {
  return page.locator("body").innerText({ timeout: 20_000 });
}

async function loginStaff(role: "admin" | "provider", email: string, password: string) {
  assert(email && password, `Missing ${role} email/password smoke env vars.`);
  const context = await newContext();
  const page = await context.newPage();
  activePage = page;
  await page.goto(`${BASE_URL}/login/${role}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.locator('button[type="submit"]').waitFor({ state: "visible", timeout: 20_000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === `/${role}`, { timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  return { context, page };
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => ({
    href: window.location.href,
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    text: document.body.innerText.slice(0, 500),
  }));
  assert(
    overflow.scrollWidth <= overflow.viewport + 2 && overflow.bodyWidth <= overflow.viewport + 2,
    `${label} has horizontal overflow: viewport=${overflow.viewport}, document=${overflow.scrollWidth}, body=${overflow.bodyWidth}`
  );
  assert(overflow.text.trim().length > 20, `${label} rendered blank or nearly blank content.`);
}

function nameForPatient(patient?: Patient) {
  return [patient?.firstName, patient?.lastName].filter(Boolean).join(" ").trim();
}

function selectCandidateOrder(
  dashboard: DashboardData,
  details: Array<{ order: Order; patient?: Patient; detail: OrderDetail }>,
  strictChart: boolean
): OrderCandidate {
  if (TARGET_ORDER_ID) {
    const target = details.find((item) => item.order.id === TARGET_ORDER_ID);
    assert(target, `Target order ${TARGET_ORDER_ID} was not found in admin dashboard results.`);
    return { ...target, strictChart: true };
  }

  const withFullChart = details.find((item) =>
    item.detail.consent &&
    (item.detail.identity?.uploads?.length ?? 0) >= 2 &&
    item.detail.practiceq?.available
  );
  if (withFullChart) return { ...withFullChart, strictChart };

  const withConsent = details.find((item) => item.detail.consent);
  if (withConsent) return { ...withConsent, strictChart };

  const newest = details[0];
  assert(newest, `No orders were available in admin dashboard; total=${dashboard.pagination?.total ?? 0}.`);
  return { ...newest, strictChart };
}

async function loadOrderCandidate() {
  const headers = authHeaders();
  const queries = TARGET_ORDER_ID ? [TARGET_ORDER_ID] : [SEARCH_QUERY, ""];
  for (const query of queries) {
    const params = new URLSearchParams({ page: "1", pageSize: "25" });
    if (query) params.set("q", query);
    const dashboard = await fetchJson<DashboardData>(`${BASE_URL}/api/admin/dashboard?${params.toString()}`, {
      headers,
    });
    const patientMap = new Map(dashboard.patients.map((patient) => [patient.id, patient]));
    const orders = [...dashboard.orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (!orders.length) continue;
    const details = await Promise.all(
      orders.slice(0, 8).map(async (order) => ({
        order,
        patient: patientMap.get(order.patientId),
        detail: await fetchJson<OrderDetail>(`${BASE_URL}/api/orders/${encodeURIComponent(order.id)}`, { headers }),
      }))
    );
    return selectCandidateOrder(dashboard, details, Boolean(query));
  }
  throw new Error(`No order candidate found. Search query=${SEARCH_QUERY || "(none)"}.`);
}

function requireOrWarn(strict: boolean, name: string, condition: unknown, message: string) {
  if (condition) return;
  if (strict) throw new Error(message);
  warn(name, message);
}

async function assertUploadDownload(upload: Upload) {
  if (upload.base64Data) {
    assert(upload.base64Data.startsWith("data:"), `${upload.filename} base64 data URL is malformed.`);
    assert(upload.base64Data.length > 1000, `${upload.filename} base64 data is unexpectedly small.`);
    return;
  }

  const { response, body } = await fetchStatus(`${BASE_URL}/api/provider/uploads/${encodeURIComponent(upload.id)}`, {
    headers: authHeaders(),
  });
  assert(response.ok, `${upload.filename} download returned ${response.status}: ${body.slice(0, 200)}`);
  const contentType = response.headers.get("content-type") ?? "";
  assert(contentType.includes(upload.mimeType.split("/")[0]), `${upload.filename} content-type ${contentType} does not match ${upload.mimeType}.`);
  assert(Number(response.headers.get("content-length") ?? upload.fileSize ?? 0) > 0 || body.length > 100, `${upload.filename} downloaded empty content.`);
}

async function smokeHealthCatalogAndGuards() {
  const [health, productsPayload, questionsPayload] = await Promise.all([
    fetchJson<{ status?: string }>(`${BASE_URL}/api/health`),
    fetchJson<{ products: Product[] }>(`${BASE_URL}/api/products`),
    fetchJson<{ questions: Question[] }>(`${BASE_URL}/api/questions`),
  ]);
  assert(health.status === "ok", `Health endpoint returned ${JSON.stringify(health)}`);
  assert(productsPayload.products.some((product) => product.doses?.length), "No product with a usable dose was returned.");
  const missing = REQUIRED_PQ_QUESTION_IDS.filter(
    (id) => !questionsPayload.questions.some((question) => question.id === id && question.required)
  );
  assert(!missing.length, `Required PracticeQ questions missing or not required: ${missing.join(", ")}`);

  const unauthorizedProvider = await fetchStatus(`${BASE_URL}/api/provider/dashboard`);
  assert(unauthorizedProvider.response.status === 401, `Provider dashboard should reject anonymous access, got ${unauthorizedProvider.response.status}.`);

  const missingOrder = await fetchStatus(`${BASE_URL}/api/orders/not-a-real-order-${Date.now()}`);
  assert(missingOrder.response.status === 404, `Unknown order should return 404, got ${missingOrder.response.status}.`);
}

async function smokeLoginRoutesAndOtp() {
  const context = await newContext({ width: 390, height: 844 });
  const page = await context.newPage();
  activePage = page;
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    const loginText = await pageText(page);
    assert(/Patient Portal/i.test(loginText), "/login did not render the patient portal.");
    assert(!/Provider Portal|Admin Console/i.test(loginText), "/login exposes staff portal copy.");
    assert(await page.locator('input[type="tel"]').count() === 1, "/login should use a patient phone field.");
    assert(await page.locator('input[type="email"]').count() === 0, "/login should not show staff email login.");

    await page.goto(`${BASE_URL}/patient`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/login\/patient/, { timeout: 20_000 });

    const otpRequest = await fetchStatus(`${BASE_URL}/api/auth/patient-otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "4075550000" }),
    });
    assert(otpRequest.response.ok, `Unknown patient OTP request should not leak account existence, got ${otpRequest.response.status}.`);

    const badOtp = await fetchStatus(`${BASE_URL}/api/auth/patient-otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "4075550000", code: "000000" }),
    });
    assert([400, 401].includes(badOtp.response.status), `Bad OTP should be rejected, got ${badOtp.response.status}.`);
  } finally {
    await context.close();
  }
}

async function smokeConsentSignatureValidation() {
  const context = await newContext();
  const page = await context.newPage();
  activePage = page;
  try {
    const intakeState = {
      firstName: "Launch",
      lastName: "Smoke",
      dateOfBirth: "1990-04-14",
      gender: "male",
      phone: "4075550111",
      email: "launch-smoke@missionwlw.com",
      address: {
        street1: "6319 Davisson Ave",
        city: "Orlando",
        state: "FL",
        zipCode: "32810",
        country: "USA",
      },
      shippingAddress: {
        street1: "6319 Davisson Ave",
        city: "Orlando",
        state: "FL",
        zipCode: "32810",
        country: "USA",
      },
      productId: "tirzepatide",
      doseId: "starter",
      questionnaireAnswers: {
        pq_height: "5'10\"",
        pq_current_weight: "220",
        pq_ideal_weight: "180",
      },
      consentAcknowledged: false,
      signedName: "",
      consented: false,
      licenseUploaded: false,
      selfieUploaded: false,
      paymentProcessed: false,
    };
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate((state) => {
      sessionStorage.setItem("tele_intake_form_state", JSON.stringify(state));
    }, intakeState);

    await page.goto(`${BASE_URL}/start/consent`, { waitUntil: "domcontentloaded" });
    await page.locator("text=Patient Name: Launch Smoke").waitFor({ timeout: 10_000 });
    await page.locator('input[type="checkbox"]').check();
    await page.locator('input[placeholder="Type your full legal name"]').fill("Wrong Person");
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await page.locator("text=/Signature must match the patient name:\\s*Launch Smoke/i").waitFor({ timeout: 10_000 });
    assert(/\/start\/consent/.test(page.url()), "Mismatched signature advanced past consent.");

    await page.locator('input[placeholder="Type your full legal name"]').fill("Launch Smoke");
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await page.waitForURL(/\/start\/uploads/, { timeout: 20_000 });
  } finally {
    await context.close();
  }
}

async function smokeStaffDashboards() {
  const provider = await loginStaff("provider", PROVIDER_EMAIL, PROVIDER_PASSWORD);
  activePage = provider.page;
  try {
    await provider.page.locator("text=Provider Dashboard").waitFor({ timeout: 30_000 });
    const text = await pageText(provider.page);
    assert(/Dotson,\s*Karen/i.test(text), "Provider navbar does not show Dotson, Karen.");
    assert(/Orders Requiring Review|No orders awaiting review/i.test(text), "Provider dashboard did not render order review area.");
  } finally {
    await provider.context.close();
  }

  const admin = await loginStaff("admin", ADMIN_EMAIL, ADMIN_PASSWORD);
  activePage = admin.page;
  try {
    await admin.page.locator("text=Admin Dashboard").waitFor({ timeout: 30_000 });
    const text = await pageText(admin.page);
    assert(/Total Orders|Recent Orders|Revenue/i.test(text), "Admin dashboard did not render operational metrics.");
    await admin.page.goto(`${BASE_URL}/admin/orders`, { waitUntil: "domcontentloaded" });
    await admin.page.locator("text=Order Management").waitFor({ timeout: 30_000 });
    await admin.page.locator("text=PracticeQ").first().waitFor({ timeout: 30_000 });
  } finally {
    await admin.context.close();
  }
}

async function smokeOrderChartSurfaces() {
  const candidate = await loadOrderCandidate();
  const patientName = nameForPatient(candidate.patient);
  console.log(
    `  candidate order: ${candidate.order.id} patient=${patientName || candidate.order.patientId} pq=${candidate.detail.practiceq?.status ?? "none"}`
  );

  assert(candidate.detail.order?.id || candidate.order.id, "Candidate order detail did not include an order.");
  requireOrWarn(candidate.strictChart, "Consent record", candidate.detail.consent, "Candidate order has no consent record visible to admin/provider.");
  requireOrWarn(candidate.strictChart, "Consent record", candidate.detail.consent?.signedName, "Consent record is missing signed name.");
  requireOrWarn(candidate.strictChart, "Consent record", candidate.detail.consent?.signedAt, "Consent record is missing signed timestamp.");
  requireOrWarn(candidate.strictChart, "Consent record", candidate.detail.consent?.ipAddress, "Consent record is missing IP address.");
  requireOrWarn(candidate.strictChart, "Consent record", candidate.detail.consent?.userAgent, "Consent record is missing user agent.");
  requireOrWarn(
    candidate.strictChart,
    "Consent record",
    candidate.detail.consent?.consentText?.includes("CONSENT FOR MEDICAL TREATMENT"),
    "Consent text is missing the medical treatment consent body."
  );

  if (!candidate.detail.practiceq?.available) {
    warn("PracticeQ chart mirror", `Candidate order ${candidate.order.id} has no available PracticeQ mirror.`);
  } else {
    const answers = candidate.detail.practiceq.answers ?? [];
    assert(answers.length > 0, "PracticeQ mirror is available but contains no answers.");
    assert(candidate.detail.practiceq.intakeId, "PracticeQ mirror is missing intake ID.");
  }

  const uploads = candidate.detail.identity?.uploads ?? [];
  if (uploads.length < 2) {
    warn("Identity attachments", `Candidate order ${candidate.order.id} has ${uploads.length} identity attachment(s).`);
  } else {
    for (const upload of uploads.slice(0, 2)) {
      await assertUploadDownload(upload);
    }
  }

  const provider = await loginStaff("provider", PROVIDER_EMAIL, PROVIDER_PASSWORD);
  activePage = provider.page;
  try {
    await provider.page.goto(`${BASE_URL}/provider/patients/${encodeURIComponent(candidate.order.patientId)}`, {
      waitUntil: "domcontentloaded",
    });
    await provider.page.locator("text=Order Details").waitFor({ timeout: 30_000 });
    const text = await pageText(provider.page);
    assert(/Chart Review Audit/i.test(text), "Provider chart is missing chart review audit.");
    assert(/Consent Certificate/i.test(text), "Provider chart is missing consent certificate.");
    if (candidate.detail.practiceq?.available) {
      assert(/Clinical Chart/i.test(text), "Provider chart is missing the PracticeQ clinical chart.");
    }
    assert(/Identity Documents/i.test(text), "Provider chart is missing identity documents section.");
  } finally {
    await provider.context.close();
  }

  const admin = await loginStaff("admin", ADMIN_EMAIL, ADMIN_PASSWORD);
  activePage = admin.page;
  try {
    await admin.page.goto(`${BASE_URL}/admin/orders`, { waitUntil: "domcontentloaded" });
    await admin.page.locator("text=Order Management").waitFor({ timeout: 30_000 });
    await admin.page.locator('input[placeholder*="order ID"]').fill(candidate.order.id);
    await Promise.all([
      admin.page.waitForResponse((response) => response.url().includes("/api/admin/dashboard") && response.ok(), { timeout: 30_000 }),
      admin.page.getByRole("button", { name: /^Search$/ }).click(),
    ]);
    await admin.page.locator(`text=${candidate.order.id.slice(-8)}`).first().waitFor({ timeout: 30_000 });
    await admin.page.locator(`text=${candidate.order.id.slice(-8)}`).first().click();
    await admin.page.locator("text=Consent Certificate").waitFor({ timeout: 30_000 });
    const text = await pageText(admin.page);
    assert(/Identity Evidence/i.test(text), "Admin order drawer is missing identity evidence.");
    assert(/PracticeQ/i.test(text), "Admin order drawer is missing PracticeQ details.");
  } finally {
    await admin.context.close();
  }
}

async function smokeMobileLayout() {
  const context = await newContext({ width: 390, height: 844 });
  const page = await context.newPage();
  activePage = page;
  try {
    for (const route of ["/", "/products", "/login", "/start/info", "/privacy", "/terms"]) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await assertNoHorizontalOverflow(page, route);
    }
  } finally {
    await context.close();
  }
}

async function smokeMigrationDisabledAndWake() {
  const migration = await fetchStatus(`${BASE_URL}/api/admin/db-migrate`, {
    method: "POST",
    headers: authHeaders(),
  });
  assert(migration.response.status === 403, `Migration API should be disabled in production, got ${migration.response.status}.`);

  const wake = await fetchStatus(`${BASE_URL}/api/practiceq/wake`, {
    method: "POST",
  });
  if (!wake.response.ok) {
    warn("PracticeQ wake", `/api/practiceq/wake returned ${wake.response.status}: ${wake.body.slice(0, 300)}`);
    return;
  }
  const payload = wake.body ? JSON.parse(wake.body) : {};
  if (!payload.ok) {
    warn("PracticeQ wake", `wake endpoint responded but did not confirm ok: ${wake.body.slice(0, 500)}`);
  }
}

async function main() {
  console.log(`Launch readiness smoke starting against ${BASE_URL}`);
  console.log(`Artifacts: ${ARTIFACT_ROOT}`);
  console.log(
    `Secrets: admin=${redacted(ADMIN_EMAIL)}/${redacted(ADMIN_PASSWORD)}, provider=${redacted(PROVIDER_EMAIL)}/${redacted(PROVIDER_PASSWORD)}, adminSecret=${redacted(ADMIN_SECRET)}`
  );
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 60 });

  try {
    await runStep("health, catalog, and API guards", smokeHealthCatalogAndGuards);
    await runStep("patient login route and OTP negatives", smokeLoginRoutesAndOtp);
    await runStep("consent signature validation", smokeConsentSignatureValidation);
    await runStep("staff dashboards and direct URLs", smokeStaffDashboards);
    await runStep("order chart, consent, PracticeQ, and media surfaces", smokeOrderChartSurfaces);
    await runStep("mobile public layout overflow", smokeMobileLayout);
    await runStep("production migration guard and PracticeQ wake", smokeMigrationDisabledAndWake);
  } finally {
    await browser.close().catch(() => undefined);
    browser = null;
  }

  const failed = results.filter((result) => result.status === "fail");
  const warnings = results.filter((result) => result.status === "warn");
  console.log(JSON.stringify({ baseUrl: BASE_URL, failed: failed.length, warnings: warnings.length, results }, null, 2));
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
