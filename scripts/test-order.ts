import { chromium } from "playwright";

const BASE = "https://mission-wlw-dev.vercel.app";

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: false, slowMo: 600 });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.log("🚀 Starting test order flow...");

  // Step 1: Go to products
  await page.goto(`${BASE}/products`);
  await page.waitForLoadState("networkidle");
  console.log("✅ Products page");

  // Click first product
  await page.locator("a[href*='/products/']").first().click();
  await page.waitForLoadState("networkidle");
  console.log("✅ Product page:", page.url());

  // Click Get Started / Select / any CTA
  const cta = page.locator("a[href*='/start'], button").filter({ hasText: /get started|select|start|order/i }).first();
  if (await cta.isVisible()) await cta.click();
  await page.waitForLoadState("networkidle");
  console.log("✅ After CTA:", page.url());

  // Fill patient info step
  const fill = async (sel: string, val: string) => {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) { await el.clear(); await el.fill(val); }
  };

  await fill('input[name="firstName"]', "John");
  await fill('input[name="lastName"]', "TestPatient");
  await fill('input[name="email"]', "john.test@example.com");
  await fill('input[name="phone"]', "5551234567");
  await fill('input[name="dateOfBirth"]', "1985-06-15");
  await fill('input[name="street1"]', "123 Main St");
  await fill('input[name="city"]', "Austin");
  await fill('input[name="state"]', "TX");
  await fill('input[name="zipCode"]', "78701");

  // Select gender if radio buttons present
  const maleRadio = page.locator('input[value="male"]').first();
  if (await maleRadio.isVisible().catch(() => false)) await maleRadio.check();

  await page.screenshot({ path: "C:/Repo/Tele/scripts/order-01-info.png" });
  console.log("✅ Patient info filled");

  // Click Next/Continue
  let nextBtn = page.locator("button[type='submit'], button").filter({ hasText: /next|continue|proceed/i }).first();
  if (await nextBtn.isVisible().catch(() => false)) {
    await nextBtn.click();
    await page.waitForLoadState("networkidle");
  }
  console.log("✅ After next:", page.url());
  await page.screenshot({ path: "C:/Repo/Tele/scripts/order-02-step2.png" });

  // Keep clicking next through questionnaire steps
  for (let i = 0; i < 8; i++) {
    nextBtn = page.locator("button[type='submit'], button").filter({ hasText: /next|continue|proceed/i }).first();
    if (await nextBtn.isVisible().catch(() => false)) {
      // Check any unchecked required checkboxes
      const checkboxes = page.locator('input[type="checkbox"][required]');
      const count = await checkboxes.count();
      for (let c = 0; c < count; c++) {
        if (!await checkboxes.nth(c).isChecked()) await checkboxes.nth(c).check();
      }
      await nextBtn.click();
      await page.waitForLoadState("networkidle");
      console.log(`✅ Step ${i + 2}:`, page.url());
    }
  }

  await page.screenshot({ path: "C:/Repo/Tele/scripts/order-03-payment.png" });

  // Fill payment if we're on payment page
  if (page.url().includes("payment") || page.url().includes("pay")) {
    await fill('input[name="cardNumber"], input[placeholder*="card"]', "4111111111111111");
    await fill('input[name="expiry"], input[placeholder*="MM"]', "12/27");
    await fill('input[name="cvv"], input[placeholder*="CVV"]', "123");
    await fill('input[name="cardName"], input[placeholder*="name"]', "John TestPatient");
    console.log("✅ Payment filled");
    await page.screenshot({ path: "C:/Repo/Tele/scripts/order-04-payment-filled.png" });

    const payBtn = page.locator("button").filter({ hasText: /pay|submit|complete/i }).first();
    if (await payBtn.isVisible()) {
      await payBtn.click();
      await page.waitForLoadState("networkidle");
      console.log("✅ Payment submitted:", page.url());
    }
  }

  await page.screenshot({ path: "C:/Repo/Tele/scripts/order-05-final.png" });
  console.log("\n🎉 Done! Check QuickBooks sandbox for new invoice from John TestPatient");
  console.log("Screenshots in scripts/order-*.png");

  // Keep browser open for 30s so you can see the result
  await page.waitForTimeout(30000);
  await browser.close();
})();
