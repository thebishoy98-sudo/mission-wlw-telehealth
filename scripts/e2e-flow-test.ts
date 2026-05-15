import { chromium } from "playwright";

const BASE = "https://mission-wlw-dev.vercel.app";

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: false, slowMo: 500 });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.log("\n🔍 Step 1: Health check");
  const health = await (await ctx.request.get(`${BASE}/api/health`)).json();
  console.log(JSON.stringify(health, null, 2));

  console.log("\n🛒 Step 2: Navigate to product selection");
  await page.goto(`${BASE}/products`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "C:/Repo/Tele/scripts/test-01-products.png" });
  console.log("✅ Products page loaded");

  // Click first product
  const firstProduct = page.locator("a[href*='/products/']").first();
  await firstProduct.click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "C:/Repo/Tele/scripts/test-02-product-detail.png" });
  console.log("✅ Product detail page:", page.url());

  // Click Get Started / Select dose
  const startBtn = page.locator("button, a").filter({ hasText: /get started|select|start/i }).first();
  if (await startBtn.isVisible()) {
    await startBtn.click();
    await page.waitForLoadState("networkidle");
  }
  await page.screenshot({ path: "C:/Repo/Tele/scripts/test-03-intake-start.png" });
  console.log("✅ Intake started:", page.url());

  console.log("\n📋 Step 3: Fill patient info");
  // Fill in basic fields if visible
  const fillIfVisible = async (selector: string, value: string) => {
    const el = page.locator(selector).first();
    if (await el.isVisible().catch(() => false)) {
      await el.fill(value);
    }
  };

  await fillIfVisible('input[name="firstName"], input[placeholder*="First"]', "Test");
  await fillIfVisible('input[name="lastName"], input[placeholder*="Last"]', "Patient");
  await fillIfVisible('input[name="email"], input[type="email"]', "test@example.com");
  await fillIfVisible('input[name="phone"], input[type="tel"]', "5551234567");
  await fillIfVisible('input[name="dateOfBirth"], input[placeholder*="Date"]', "1985-06-15");

  await page.screenshot({ path: "C:/Repo/Tele/scripts/test-04-patient-form.png" });
  console.log("✅ Patient form filled");

  console.log("\n💳 Step 4: Check payment page is reachable");
  await page.goto(`${BASE}/intake`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "C:/Repo/Tele/scripts/test-05-intake.png" });
  console.log("✅ Intake page:", page.url());

  console.log("\n🩺 Step 5: Check provider dashboard");
  await page.goto(`${BASE}/provider`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "C:/Repo/Tele/scripts/test-06-provider.png" });
  console.log("✅ Provider page:", page.url());

  console.log("\n⚙️  Step 6: Check admin dashboard");
  await page.goto(`${BASE}/admin`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "C:/Repo/Tele/scripts/test-07-admin.png" });
  console.log("✅ Admin page:", page.url());

  console.log("\n✅ All steps complete! Screenshots saved to scripts/test-*.png");
  console.log("\nService status:", health.integrations);

  await browser.close();
})();
