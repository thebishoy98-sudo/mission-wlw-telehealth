/**
 * Check Life File sandbox for recently submitted test orders.
 * Run: npx ts-node --skip-project scripts/check-lf-orders.ts
 */
import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page = await browser.newPage();

  console.log("Logging in...");
  await page.goto("https://host100.lifefile.net/apitest/pharmacy", { waitUntil: "networkidle" });
  await page.fill('input[type="text"]', "sandbox11472-251");
  await page.fill('input[type="password"]', "iEdN8y^nb7fQJf&5h&6R");
  await page.keyboard.press("Enter");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3000);

  // Navigate to Order Management
  for (const frame of page.frames()) {
    const link = frame.locator("text=Order Management").first();
    if (await link.isVisible({ timeout: 1000 }).catch(() => false)) {
      await link.click();
      console.log("Clicked Order Management in:", frame.url());
      break;
    }
  }
  await page.waitForTimeout(3000);

  // Fill patient name search and click Search
  for (const frame of page.frames()) {
    const url = frame.url();
    if (!url.includes("businessmgmntlist")) continue;
    console.log("Found order list frame:", url);

    // Fill patient name: "TestOrder"
    const patientInput = frame.locator('input').nth(10); // try different input indices
    // Actually look for the patient L,F input near "Patient" label
    const allInputs = await frame.locator('input[type="text"]').all();
    console.log(`Found ${allInputs.length} text inputs in frame`);

    // Search with date range 60 days — click Search
    const searchBtn = frame.locator('input[value="Search"]').first();
    if (await searchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchBtn.click();
      console.log("Clicked Search button");
    } else {
      // Try button with text "Search"
      const btn = frame.locator('button, input[type="submit"], input[type="button"]').filter({ hasText: /^Search$/ }).first();
      await btn.click().catch(() => {});
      console.log("Tried alternate Search button");
    }
    break;
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "scripts/lf-search-results.png" });

  // Also click Status A-251 tab to see all orders in that queue
  for (const frame of page.frames()) {
    const statusBtn = frame.locator('text=/Status A/').first();
    if (await statusBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await statusBtn.click();
      console.log("Clicked Status A tab");
      break;
    }
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "scripts/lf-status-a.png" });

  // Print all frame content
  for (const frame of page.frames()) {
    const text = await frame.locator("body").innerText().catch(() => "");
    if (text.trim().length > 100) {
      const lines = text.split("\n").filter(l => l.trim()).slice(0, 60);
      console.log(`\n=== ${frame.url()} ===`);
      lines.forEach(l => console.log(l));
    }
  }

  await browser.close();
  console.log("\nDone. Screenshots: scripts/lf-search-results.png, scripts/lf-status-a.png");
})();
