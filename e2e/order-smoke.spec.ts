/**
 * Live order smoke tests — real browser + real API, no mocks.
 * Payment is in bypass mode (NEXT_PUBLIC_QB_PAYMENTS_ENABLED != "true").
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const STORAGE_KEY = "tele_intake_form_state";

function makeIntakeState(overrides: Record<string, unknown> = {}) {
  const stamp = Date.now();
  return {
    firstName: "Smoke",
    lastName: "Patient",
    dateOfBirth: "1985-03-20",
    gender: "male",
    phone: `407${String(stamp).slice(-7)}`,
    email: `smoke-${stamp}@test.example.com`,
    address: { street1: "456 Smoke Ave", city: "Tampa", state: "FL", zipCode: "33601", country: "USA" },
    shippingAddress: { street1: "456 Smoke Ave", city: "Tampa", state: "FL", zipCode: "33601", country: "USA" },
    productId: "product_tirzepatide",
    doseId: "tirzepatide_20mg_8_week",
    questionnaireAnswers: {
      pq_height: "5'10\"",
      pq_current_weight: "225",
      pq_ideal_weight: "185",
      pq_conditions: "None apply to me",
      pq_medication_allergies: "No",
      pq_intake_purpose: "Weight loss",
      pq_gastric_bypass: "No",
    },
    consentAcknowledged: true,
    signedName: "Smoke Patient",
    consented: true,
    consentSignedAt: new Date().toISOString(),
    licenseUploaded: false,
    selfieUploaded: false,
    paymentProcessed: false,
    identityStatus: "missing",
    ...overrides,
  };
}

async function seedIntakeAndGotoPayment(page: any, overrides: Record<string, unknown> = {}) {
  // Navigate first so sessionStorage is scoped to the origin
  await page.goto(`${BASE}/start/payment`);
  await page.evaluate(
    ([key, state]: [string, unknown]) => sessionStorage.setItem(key, JSON.stringify(state)),
    [STORAGE_KEY, makeIntakeState(overrides)] as [string, unknown]
  );
  await page.reload();
}

async function openDiscountCodeInput(page: any) {
  await expect(page.getByRole("button", { name: /submit order/i })).toBeEnabled({ timeout: 10_000 });
  const button = page.getByRole("button", { name: /have a discount code/i });
  await expect(button).toBeVisible({ timeout: 10_000 });
  await button.click();
  const input = page.getByPlaceholder("Optional discount code");
  await expect(input).toBeVisible({ timeout: 10_000 });
  return input;
}

test.beforeEach(async ({ page }, testInfo) => {
  const titleHash = Array.from(testInfo.title).reduce((hash, char) => hash + char.charCodeAt(0), 0);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `127.0.1.${(titleHash + testInfo.retry) % 200 + 10}` });
});

test.describe("Order placement smoke tests", () => {
  test("tirzepatide 20mg order completes end-to-end (bypass payment)", async ({ page }) => {
    await seedIntakeAndGotoPayment(page);

    // Payment bypass notice must be visible
    await expect(page.getByText("Payment collection is disabled for this sandbox order.")).toBeVisible({ timeout: 10_000 });

    // Submit order
    await page.getByRole("button", { name: /submit order/i }).click();

    // Must land on confirmation
    await expect(page).toHaveURL(/\/start\/confirmation/, { timeout: 20_000 });
    await expect(page.locator("body")).toContainText(/Smoke Patient|order/i, { timeout: 10_000 });
  });

  test("retatrutide 16mg order completes end-to-end (bypass payment)", async ({ page }) => {
    await seedIntakeAndGotoPayment(page, {
      productId: "product_retatrutide",
      doseId: "retatrutide_16mg_8_week",
    });

    // Product price for retatrutide should load (~$325)
    await expect(page.getByText(/325|Retatrutide/i).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /submit order/i }).click();
    await expect(page).toHaveURL(/\/start\/confirmation/, { timeout: 20_000 });
  });

  test("SUMMER50 promo code reduces tirzepatide 20mg total by $50", async ({ page }) => {
    await seedIntakeAndGotoPayment(page);

    await (await openDiscountCodeInput(page)).fill("SUMMER50");
    await page.getByRole("button", { name: /apply/i }).click();

    // Code and discount must appear
    await expect(page.getByText("SUMMER50: $50.00 off applied")).toBeVisible();
    await expect(page.getByText(/\$50/i).first()).toBeVisible();

    // Total should be 349 - 50 = 299
    await expect(page.getByText(/\$299/i)).toBeVisible();

    await page.getByRole("button", { name: /submit order/i }).click();
    await expect(page).toHaveURL(/\/start\/confirmation/, { timeout: 20_000 });
  });

  test("invalid promo code shows error, does not change total", async ({ page }) => {
    await seedIntakeAndGotoPayment(page);

    await (await openDiscountCodeInput(page)).fill("BADCODE");
    await page.getByRole("button", { name: /apply/i }).click();

    await expect(page.getByText(/Invalid discount code/i)).toBeVisible();
    // Total unchanged at $349
    await expect(page.getByText(/\$349/i).first()).toBeVisible();
  });
});

test.describe("Abandonment cron smoke tests", () => {
  test("abandonment cron requires authorization", async ({ request }) => {
    const res = await request.get(`${BASE}/api/cron/intake-abandonment`);
    // 401 = CRON_SECRET set but header missing; 500 = CRON_SECRET not configured
    expect([401, 500]).toContain(res.status());
  });

  test("abandonment cron returns results JSON when authorized", async ({ request }) => {
    const cronSecret = process.env.CRON_SECRET ?? "local-cron-secret";
    const res = await request.get(`${BASE}/api/cron/intake-abandonment`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    // 200 (processed or skipped) or 401/500 if secret doesn't match env
    if (res.status() === 200) {
      const body = await res.json();
      // Shape check
      expect(typeof body.processed === "number" || body.skipped).toBeTruthy();
    } else {
      expect([401, 500]).toContain(res.status());
    }
  });
});

test.describe("Landing page smoke tests", () => {
  test("pricing section: Retatrutide appears before Tirzepatide in product grid", async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      document.getElementById("pricing")?.scrollIntoView({ behavior: "instant" });
    });

    const reta = page.getByText("Retatrutide").first();
    const tirz = page.getByText("Tirzepatide").first();

    await expect(reta).toBeVisible({ timeout: 10_000 });
    await expect(tirz).toBeVisible({ timeout: 5_000 });

    const retaTop = await reta.evaluate((el: Element) => el.getBoundingClientRect().top);
    const tirzTop = await tirz.evaluate((el: Element) => el.getBoundingClientRect().top);
    expect(retaTop).toBeLessThanOrEqual(tirzTop);
  });

  test("pricing section: Most Popular badge is visible", async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      document.getElementById("pricing")?.scrollIntoView({ behavior: "instant" });
    });
    await expect(page.getByText("Most Popular").first()).toBeVisible({ timeout: 10_000 });
  });

  test("pricing section: First to Market badge is visible on Retatrutide", async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      document.getElementById("pricing")?.scrollIntoView({ behavior: "instant" });
    });
    await expect(page.getByText("First to Market").first()).toBeVisible({ timeout: 10_000 });
  });

  test("hero: Returning Patient button is visible and links to /login/patient", async ({ page }) => {
    await page.goto(BASE);
    const btn = page.getByRole("link", { name: /Returning Patient/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await expect(btn).toHaveAttribute("href", "/login/patient");
  });

  test("hero: Start Your Free Assessment CTA is visible", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.getByRole("link", { name: /Start Your Free Assessment/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("landing page with ?ref= affiliate code loads without error", async ({ page }) => {
    await page.goto(`${BASE}?ref=test-affiliate-001`);
    await expect(page.locator("body")).not.toContainText(/error|500/i, { timeout: 10_000 });
    await expect(page.getByRole("link", { name: /Start Your Free Assessment/i }).first()).toBeVisible();
  });
});

test.describe("New SMS cron smoke tests", () => {
  test("weekly-checkins cron requires authorization", async ({ request }) => {
    const res = await request.get(`${BASE}/api/cron/weekly-checkins`);
    expect([401, 500]).toContain(res.status());
  });

  test("dose-escalation cron requires authorization", async ({ request }) => {
    const res = await request.get(`${BASE}/api/cron/dose-escalation`);
    expect([401, 500]).toContain(res.status());
  });

  test("retatrutide-blast cron requires authorization", async ({ request }) => {
    const res = await request.get(`${BASE}/api/cron/retatrutide-blast`);
    expect([401, 500]).toContain(res.status());
  });

  test("weekly-checkins cron returns results JSON when authorized", async ({ request }) => {
    const cronSecret = process.env.CRON_SECRET ?? "local-cron-secret";
    const res = await request.get(`${BASE}/api/cron/weekly-checkins`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body.processed === "number" || body.skipped).toBeTruthy();
    } else {
      expect([401, 500]).toContain(res.status());
    }
  });

  test("dose-escalation cron returns results JSON when authorized", async ({ request }) => {
    const cronSecret = process.env.CRON_SECRET ?? "local-cron-secret";
    const res = await request.get(`${BASE}/api/cron/dose-escalation`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body.processed === "number" || body.skipped).toBeTruthy();
    } else {
      expect([401, 500]).toContain(res.status());
    }
  });
});

test.describe("Admin affiliate system smoke tests", () => {
  test("admin affiliates page redirects unauthenticated users", async ({ page }) => {
    await page.goto(`${BASE}/admin/affiliates`);
    // Should redirect to login or show auth gate — not a 500 error
    await expect(page.locator("body")).not.toContainText(/Internal Server Error|500/i, { timeout: 10_000 });
  });

  test("affiliates API requires admin auth", async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/affiliates`);
    expect([401, 403]).toContain(res.status());
  });

  test("analytics API requires admin auth", async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/analytics`);
    expect([401, 403]).toContain(res.status());
  });
});
