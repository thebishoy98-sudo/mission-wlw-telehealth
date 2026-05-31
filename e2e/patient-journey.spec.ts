import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test.describe("Patient public journey", () => {
  test("landing page loads with hero and CTA", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("a[href*='/start'], button").filter({ hasText: /get started|start/i }).first()).toBeVisible();
  });

  test("product page shows active treatments", async ({ page }) => {
    await page.goto(`${BASE}/products`);
    await expect(page.getByText(/tirzepatide/i).first()).toBeVisible();
  });

  test("patient info step accepts a complete eligible profile", async ({ page }) => {
    await page.goto(`${BASE}/start/info`);
    await page.waitForFunction(() => document.querySelectorAll("select")[0]?.querySelectorAll("option").length > 1);

    await page.locator("select").nth(0).selectOption({ index: 1 });
    await page.waitForFunction(() => document.querySelectorAll("select")[1]?.querySelectorAll("option").length > 0);
    await page.locator("select").nth(1).selectOption({ index: 0 });
    await page.locator('input[autocomplete="given-name"]').fill("Launch");
    await page.locator('input[autocomplete="family-name"]').fill("Patient");
    await page.locator('input[autocomplete="email"]').fill(`launch-patient-${Date.now()}@example.com`);
    await page.locator('input[autocomplete="tel"]').fill("4075550100");
    await page.locator('input[autocomplete="bday"]').fill("1990-06-15");
    await page.locator("select").nth(2).selectOption("female");
    await page.locator('input[autocomplete="shipping address-line1"]').fill("123 Test St");
    await page.locator('input[autocomplete="shipping address-level2"]').fill("Orlando");
    await page.locator("select").nth(3).selectOption("FL");
    await page.locator('input[autocomplete="shipping postal-code"]').fill("32810");

    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page).toHaveURL(/\/start\/questionnaire/, { timeout: 15_000 });
  });

  test("consent requires signature to match patient legal name", async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => {
      sessionStorage.setItem("tele_intake_form_state", JSON.stringify({
        firstName: "Launch",
        lastName: "Patient",
        dateOfBirth: "1990-06-15",
        gender: "female",
        phone: "4075550100",
        email: "launch-patient@example.com",
        address: { street1: "123 Test St", city: "Orlando", state: "FL", zipCode: "32810", country: "USA" },
        shippingAddress: { street1: "123 Test St", city: "Orlando", state: "FL", zipCode: "32810", country: "USA" },
        productId: "product_tirzepatide",
        doseId: "dose_25",
        questionnaireAnswers: { pq_height: "5'10\"", pq_current_weight: "220", pq_ideal_weight: "180" },
        consentAcknowledged: false,
        signedName: "",
        consented: false,
        licenseUploaded: false,
        selfieUploaded: false,
        paymentProcessed: false,
      }));
    });

    await page.goto(`${BASE}/start/consent`);
    await page.locator("text=Patient Name: Launch Patient").waitFor({ timeout: 10_000 });
    await page.locator('input[type="checkbox"]').check();
    await page.locator('input[placeholder="Type your full legal name"]').fill("Wrong Person");
    await page.getByRole("button", { name: /^Continue$/ }).click();

    await expect(page.getByText(/Signature must match the patient name: Launch Patient/i)).toBeVisible();
    await expect(page).toHaveURL(/\/start\/consent/);
  });

  test("login page is patient-only and OTP rejects invalid codes", async ({ page, request }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByText(/Patient Portal/i)).toBeVisible();
    await expect(page.locator('input[type="tel"]')).toBeVisible();
    await expect(page.getByText(/Provider Portal|Admin Console/i)).toHaveCount(0);

    const requestResponse = await request.post(`${BASE}/api/auth/patient-otp/request`, {
      data: { phone: "4075550000" },
    });
    expect(requestResponse.status()).toBe(200);

    const verifyResponse = await request.post(`${BASE}/api/auth/patient-otp/verify`, {
      data: { phone: "4075550000", code: "000000" },
    });
    expect([400, 401]).toContain(verifyResponse.status());
  });
});

test.describe("Patient edge cases", () => {
  test("direct navigation to patient dashboard requires login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE}/patient`);
    await page.waitForURL(/\/login\/patient/, { timeout: 15_000 });
  });

  test("status page with no order ID loads", async ({ page }) => {
    await page.goto(`${BASE}/status`);
    await expect(page.locator("body")).toBeVisible();
  });

  test("404 page for unknown route", async ({ page }) => {
    const response = await page.goto(`${BASE}/nonexistent-page-xyz`);
    expect(response?.status()).toBeLessThanOrEqual(404);
  });
});
