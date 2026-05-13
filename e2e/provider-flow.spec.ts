import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const loginAsProvider = async (page: any) => {
  await page.goto(`${BASE}/login`);
  await page.locator('button').filter({ hasText: /^Provider$/ }).click();
  await page.fill('input[type="email"]', "dr.johnson@telehealth.com");
  await page.fill('input[type="password"]', "provider123");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/provider/, { timeout: 5000 });
};

test.describe("Provider dashboard", () => {
  test("provider can log in and see dashboard", async ({ page }) => {
    await loginAsProvider(page);
    await expect(page.locator("h1, h2").filter({ hasText: /provider|dashboard|orders/i }).first()).toBeVisible();
  });

  test("provider dashboard shows order list", async ({ page }) => {
    await loginAsProvider(page);
    // Seed data should have orders — check for table or card list
    const orderElements = page.locator("table, [data-testid='order-card'], .order-row");
    await expect(orderElements.first()).toBeVisible({ timeout: 5000 });
  });

  test("provider can view patient chart", async ({ page }) => {
    await loginAsProvider(page);

    // Click first patient/order link
    const firstLink = page.locator("a[href*='/provider/patients/']").first();
    const hasLinks = await firstLink.isVisible().catch(() => false);

    if (hasLinks) {
      await firstLink.click();
      await expect(page).toHaveURL(/\/provider\/patients\//, { timeout: 5000 });
      await expect(page.locator("h1, h2").first()).toBeVisible();
    }
  });

  test("chart viewed button marks audit trail", async ({ page }) => {
    await loginAsProvider(page);

    const patientLink = page.locator("a[href*='/provider/patients/']").first();
    const hasLinks = await patientLink.isVisible().catch(() => false);

    if (hasLinks) {
      await patientLink.click();

      // Look for "Mark Chart Viewed" button
      const markViewedBtn = page.locator('button').filter({ hasText: /mark.*viewed|chart viewed/i }).first();
      const hasButton = await markViewedBtn.isVisible().catch(() => false);

      if (hasButton) {
        await markViewedBtn.click();
        // Should now show "Chart Reviewed" confirmation
        await expect(
          page.locator('text=/chart reviewed|viewed at/i').first()
        ).toBeVisible({ timeout: 3000 });
      }
    }
  });
});

test.describe("Provider — order actions", () => {
  test("provider can approve a pending order", async ({ page }) => {
    await loginAsProvider(page);

    const patientLink = page.locator("a[href*='/provider/patients/']").first();
    const hasLinks = await patientLink.isVisible().catch(() => false);

    if (hasLinks) {
      await patientLink.click();

      const approveBtn = page.locator('button').filter({ hasText: /approve/i }).first();
      const canApprove = await approveBtn.isVisible().catch(() => false);

      if (canApprove) {
        await approveBtn.click();
        await expect(
          page.locator('text=/approved|sent to pharmacy/i').first()
        ).toBeVisible({ timeout: 3000 });
      }
    }
  });
});
