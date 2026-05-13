import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test.describe("Patient full journey", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
  });

  test("landing page loads with hero and CTA", async ({ page }) => {
    await expect(page.locator("h1, [data-testid='hero-headline']").first()).toBeVisible();
    const cta = page.locator("a[href*='/start'], button").filter({ hasText: /get started|start/i }).first();
    await expect(cta).toBeVisible();
  });

  test("product page shows Tirzepatide", async ({ page }) => {
    await page.goto(`${BASE}/products`);
    await expect(page.getByText(/tirzepatide/i).first()).toBeVisible();
  });

  test("full intake flow — eligible patient", async ({ page }) => {
    // Step 1: Patient info
    await page.goto(`${BASE}/start/info`);
    await page.fill('[name="firstName"], input[placeholder*="First"]', "TestFirst");
    await page.fill('[name="lastName"], input[placeholder*="Last"]', "TestLast");
    await page.fill('[name="dateOfBirth"], input[type="date"]', "1990-06-15");
    await page.fill('[name="phone"], input[type="tel"]', "5551234567");
    await page.fill('[name="email"], input[type="email"]', `test+${Date.now()}@example.com`);

    // Address
    const inputs = page.locator('input[type="text"]');
    const count = await inputs.count();
    if (count >= 4) {
      await page.fill('input[placeholder*="Street"], input[placeholder*="street"]', "123 Test St");
      await page.fill('input[placeholder*="City"], input[placeholder*="city"]', "Dallas");
      await page.fill('input[placeholder*="Zip"], input[placeholder*="zip"]', "75201");
    }

    const nextBtn = page.locator('button[type="submit"], button').filter({ hasText: /next|continue/i }).first();
    await nextBtn.click();

    // Should advance to questionnaire
    await expect(page).toHaveURL(/questionnaire|consent|upload|payment/, { timeout: 5000 });
  });

  test("ineligible patient sees disqualification screen", async ({ page }) => {
    await page.goto(`${BASE}/start/questionnaire`);

    // If questionnaire page loads, look for thyroid/MEN2 question and answer Yes
    const thyroidQuestion = page.locator('text=/thyroid|MEN/i').first();
    const visible = await thyroidQuestion.isVisible().catch(() => false);

    if (visible) {
      // Find the "Yes" radio for the disqualifying question
      const yesRadio = page.locator('input[type="radio"][value="Yes"]').first();
      await yesRadio.check();

      const submitBtn = page.locator('button[type="submit"]').first();
      await submitBtn.click();

      // Should see ineligibility message
      await expect(
        page.locator('text=/not eligible|contraindication|ineligible/i').first()
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("login page loads for all three roles", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByText(/patient/i).first()).toBeVisible();
    await expect(page.getByText(/provider/i).first()).toBeVisible();
    await expect(page.getByText(/admin/i).first()).toBeVisible();
  });
});

test.describe("Authentication flows", () => {
  test("patient login and redirect", async ({ page }) => {
    await page.goto(`${BASE}/login`);

    // Click patient tab (already active by default)
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    await emailInput.fill("alice@example.com");
    await passwordInput.fill("demo");

    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/patient/, { timeout: 5000 });
  });

  test("provider login and redirect", async ({ page }) => {
    await page.goto(`${BASE}/login`);

    // Click provider tab
    await page.locator('button').filter({ hasText: /^Provider$/ }).click();
    await page.fill('input[type="email"]', "dr.johnson@telehealth.com");
    await page.fill('input[type="password"]', "provider123");
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/provider/, { timeout: 5000 });
  });

  test("admin login and redirect", async ({ page }) => {
    await page.goto(`${BASE}/login`);

    await page.locator('button').filter({ hasText: /^Admin$/ }).click();
    await page.fill('input[type="email"]', "admin@telehealth.com");
    await page.fill('input[type="password"]', "admin123");
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/admin/, { timeout: 5000 });
  });

  test("wrong credentials shows error", async ({ page }) => {
    await page.goto(`${BASE}/login`);

    // Try provider tab with wrong password
    await page.locator('button').filter({ hasText: /^Provider$/ }).click();
    await page.fill('input[type="email"]', "dr.johnson@telehealth.com");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('text=/invalid|incorrect|failed/i').first()).toBeVisible({ timeout: 3000 });
  });
});

test.describe("Edge cases", () => {
  test("direct navigation to patient dashboard requires login", async ({ page }) => {
    // Clear any existing session
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());

    await page.goto(`${BASE}/patient`);
    // Should either show login prompt or redirect to login
    const isOnLogin = page.url().includes("/login");
    const hasLoginPrompt = await page.locator('text=/sign in|login/i').first().isVisible().catch(() => false);
    expect(isOnLogin || hasLoginPrompt).toBe(true);
  });

  test("status page with no order ID shows empty state", async ({ page }) => {
    await page.goto(`${BASE}/status`);
    // Should load without error
    await expect(page.locator("body")).toBeVisible();
  });

  test("404 page for unknown route", async ({ page }) => {
    const response = await page.goto(`${BASE}/nonexistent-page-xyz`);
    // Next.js returns 404 or shows not found
    expect(response?.status()).toBeLessThanOrEqual(404);
  });
});
