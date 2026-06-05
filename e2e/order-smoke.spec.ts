/**
 * Live order smoke tests — real browser + real API, no mocks.
 * Payment is in bypass mode (NEXT_PUBLIC_QB_PAYMENTS_ENABLED != "true").
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const STORAGE_KEY = "tele_intake_form_state";

function makeIntakeState(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Smoke",
    lastName: "Patient",
    dateOfBirth: "1985-03-20",
    gender: "male",
    phone: "4075550199",
    email: `smoke-${Date.now()}@test.example.com`,
    address: { street1: "456 Smoke Ave", city: "Tampa", state: "FL", zipCode: "33601", country: "USA" },
    shippingAddress: { street1: "456 Smoke Ave", city: "Tampa", state: "FL", zipCode: "33601", country: "USA" },
    productId: "product_tirzepatide",
    doseId: "tirzepatide_20mg_8_week",
    questionnaireAnswers: {
      pq_height: "5'10\"",
      pq_current_weight: "225",
      pq_ideal_weight: "185",
      pq_conditions: "",
      pq_surgical_history: "None",
      pq_medication_allergies: "None",
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

test.describe("Order placement smoke tests", () => {
  test("tirzepatide 20mg order completes end-to-end (bypass payment)", async ({ page }) => {
    await seedIntakeAndGotoPayment(page);

    // Payment bypass notice must be visible
    await expect(
      page.getByText(/Payment collection is disabled|Payment.*disabled/i)
    ).toBeVisible({ timeout: 10_000 });

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

    await page.locator('input[placeholder="Discount code"]').fill("SUMMER50");
    await page.getByRole("button", { name: /apply/i }).click();

    // Code and discount must appear
    await expect(page.getByText(/SUMMER50/i)).toBeVisible();
    await expect(page.getByText(/\$50/i).first()).toBeVisible();

    // Total should be 349 - 50 = 299
    await expect(page.getByText(/\$299/i)).toBeVisible();

    await page.getByRole("button", { name: /submit order/i }).click();
    await expect(page).toHaveURL(/\/start\/confirmation/, { timeout: 20_000 });
  });

  test("invalid promo code shows error, does not change total", async ({ page }) => {
    await seedIntakeAndGotoPayment(page);

    await page.locator('input[placeholder="Discount code"]').fill("BADCODE");
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

test.describe("Landing page showcase smoke tests", () => {
  test("medication showcase: Retatrutide appears before Tirzepatide", async ({ page }) => {
    await page.goto(BASE);

    // Scroll to the dark medication showcase section
    await page.getByText("FIRST TO MARKET").scrollIntoViewIfNeeded();

    const reta = page.getByText("Retatrutide Injection").first();
    const tirz = page.getByText("Tirzepatide Injection").first();

    await expect(reta).toBeVisible({ timeout: 10_000 });
    await expect(tirz).toBeVisible({ timeout: 5_000 });

    const retaTop = await reta.evaluate((el) => el.getBoundingClientRect().top);
    const tirzTop = await tirz.evaluate((el) => el.getBoundingClientRect().top);
    expect(retaTop).toBeLessThanOrEqual(tirzTop);
  });

  test("pricing section: 20mg card shows Most Popular badge", async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      document.getElementById("pricing")?.scrollIntoView({ behavior: "instant" });
    });

    // The Most Popular badge should exist
    await expect(page.getByText("Most Popular").first()).toBeVisible({ timeout: 10_000 });

    // The highlighted dark card containing Most Popular should also mention 20mg
    const highlightedCard = page
      .locator("div")
      .filter({ hasText: /Most Popular/ })
      .filter({ hasText: /20mg/ })
      .first();
    await expect(highlightedCard).toBeVisible({ timeout: 5_000 });
  });
});
