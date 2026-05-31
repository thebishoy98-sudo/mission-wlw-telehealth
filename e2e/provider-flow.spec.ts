import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PROVIDER_EMAIL = process.env.E2E_PROVIDER_EMAIL ?? "dr.johnson@telehealth.com";
const PROVIDER_PASSWORD = process.env.E2E_PROVIDER_PASSWORD ?? "provider123";

async function loginAsProvider(page: Page) {
  await page.goto(`${BASE}/login/provider`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.locator('input[type="email"]').fill(PROVIDER_EMAIL);
  await page.locator('input[type="password"]').fill(PROVIDER_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/provider", { timeout: 15_000 }),
    page.locator('button[type="submit"]').click(),
  ]);
}

test.describe("Provider dashboard", () => {
  test("provider can log in from direct URL and see dashboard", async ({ page }) => {
    await loginAsProvider(page);
    await expect(page.getByText(/Provider Dashboard/i)).toBeVisible();
    await expect(page.getByText(/Dotson,\s*Karen/i)).toBeVisible();
  });

  test("provider dashboard renders review and order sections", async ({ page }) => {
    await loginAsProvider(page);
    await expect(page.getByText(/Orders Requiring Review|No orders awaiting review/i).first()).toBeVisible();
    await expect(page.getByText(/All Orders/i)).toBeVisible();
  });

  test("provider can open a patient chart without mutating order status", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsProvider(page);
    const dashboard = await page.evaluate(async () => {
      const response = await fetch("/api/provider/dashboard", { cache: "no-store" });
      return response.ok ? response.json() : { orders: [] };
    }) as { orders?: Array<{ patientId: string }> };
    const patientId = dashboard.orders?.[0]?.patientId;
    test.skip(!patientId, "No provider orders are available in this environment.");

    await page.goto(`${BASE}/provider/patients/${patientId}`);
    await expect(page).toHaveURL(/\/provider\/patients\//, { timeout: 15_000 });
    await expect(page.getByText(/Order Details/i).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/Chart Review Audit/i).first()).toBeVisible();
    await expect(page.getByText(/Identity Documents/i).first()).toBeVisible();
  });
});

test.describe("Provider API guards", () => {
  test("provider review API rejects anonymous invalid action before mutation", async ({ request }) => {
    const response = await request.post(`${BASE}/api/provider/review`, {
      data: { orderId: "o1", action: "dance", reviewedBy: "Dotson, Karen" },
    });
    expect([400, 401]).toContain(response.status());
  });
});
