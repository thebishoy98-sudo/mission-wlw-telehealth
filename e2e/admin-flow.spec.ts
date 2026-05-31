import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@telehealth.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin123";

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE}/login/admin`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/admin", { timeout: 15_000 }),
    page.locator('button[type="submit"]').click(),
  ]);
}

test.describe("Admin dashboard", () => {
  test("admin can log in from direct URL and see metrics", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByText(/Admin Dashboard/i)).toBeVisible();
    await expect(page.getByText(/Total Orders|Revenue|Pending Review/i).first()).toBeVisible();
  });

  test("admin orders page loads current order management UI", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/orders`);
    await expect(page.getByText(/Order Management/i)).toBeVisible();
    await expect(page.getByText(/PracticeQ/i).first()).toBeVisible();
    await expect(page.getByText(/Identity Evidence|Select an order/i).first()).toBeVisible();
  });

  test("admin products page loads active products", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/products`);
    await expect(page.getByText(/tirzepatide/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("admin CMS and notifications pages load", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/cms`);
    await expect(page.locator("h1, h2").filter({ hasText: /cms|content/i }).first()).toBeVisible();

    await page.goto(`${BASE}/admin/notifications`);
    await expect(page.getByText(/Notification Settings|admin phone/i).first()).toBeVisible();
  });
});

test.describe("Admin API edge cases", () => {
  test("health API endpoint returns ok", async ({ request }) => {
    const response = await request.get(`${BASE}/api/health`);
    expect(response.status()).toBe(200);
    await expect(response).toBeOK();
    const body = await response.json();
    expect(body.status).toBe("ok");
  });

  test("order API returns 404 for unknown id", async ({ request }) => {
    const response = await request.get(`${BASE}/api/orders/nonexistent-id`);
    expect(response.status()).toBe(404);
  });

  test("legacy intake submit API remains disabled", async ({ request }) => {
    const response = await request.post(`${BASE}/api/intake/submit`, {
      data: { orderId: "test" },
    });
    expect(response.status()).toBe(410);
  });
});
