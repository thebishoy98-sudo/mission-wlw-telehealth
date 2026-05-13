import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const loginAsAdmin = async (page: any) => {
  await page.goto(`${BASE}/login`);
  await page.locator('button').filter({ hasText: /^Admin$/ }).click();
  await page.fill('input[type="email"]', "admin@telehealth.com");
  await page.fill('input[type="password"]', "admin123");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/admin/, { timeout: 5000 });
};

test.describe("Admin dashboard", () => {
  test("admin can log in and see metrics", async ({ page }) => {
    await loginAsAdmin(page);
    // Should see metrics cards
    await expect(page.locator("h1, h2, h3").filter({ hasText: /admin|dashboard|revenue|orders/i }).first()).toBeVisible();
  });

  test("admin orders page loads", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/orders`);
    await expect(page.locator("body")).toBeVisible();
    // Look for order list or table
    const content = page.locator("table, [class*='order'], h1").first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  test("admin products page loads", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/products`);
    await expect(page.locator("text=/tirzepatide/i").first()).toBeVisible({ timeout: 5000 });
  });

  test("admin CMS page loads", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/cms`);
    await expect(page.locator("h1, h2").filter({ hasText: /cms|content/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test("admin integrations page loads", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/integrations`);
    await expect(page.locator("body")).toBeVisible();
    // Integration log or system section
    const content = page.locator("h1, h2, table").first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Admin edge cases", () => {
  test("health API endpoint returns ok", async ({ request }) => {
    const response = await request.get(`${BASE}/api/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.integrations).toBeDefined();
  });

  test("order API returns 404 for unknown id", async ({ request }) => {
    const response = await request.get(`${BASE}/api/orders/nonexistent-id`);
    expect(response.status()).toBe(404);
  });

  test("intake submit API rejects missing fields", async ({ request }) => {
    const response = await request.post(`${BASE}/api/intake/submit`, {
      data: { orderId: "test" }, // missing other required fields
    });
    expect(response.status()).toBe(400);
  });

  test("provider review API rejects invalid action", async ({ request }) => {
    const response = await request.post(`${BASE}/api/provider/review`, {
      data: { orderId: "o1", action: "dance", reviewedBy: "dr.test" },
    });
    expect(response.status()).toBe(400);
  });
});
