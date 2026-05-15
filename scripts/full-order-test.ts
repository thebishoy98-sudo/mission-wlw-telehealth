/**
 * Full end-to-end order test — submits a complete patient order
 * through the dev site and verifies it reaches Life File sandbox.
 *
 * Run: npx ts-node --skip-project scripts/full-order-test.ts
 */
import { chromium } from "playwright";
type Page = Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>;

const BASE = "https://mission-wlw-dev.vercel.app";
const TS = Date.now();

async function fillInfoStep(page: Page) {
  console.log("Step 1: Filling patient info...");
  await page.goto(`${BASE}/start/info`, { waitUntil: "networkidle" });

  // Treatment + dosage
  await page.locator("select").nth(0).selectOption({ index: 1 });
  await page.locator("select").nth(1).selectOption({ index: 1 }).catch(() => {});

  // Personal info
  await page.fill('input[placeholder="Jane"]', "LifeFile");
  await page.fill('input[placeholder="Smith"]', "TestOrder");
  await page.fill('input[placeholder="jane@email.com"]', `lftest+${TS}@example.com`);
  await page.fill('input[placeholder="(555) 000-0000"]', "5551234567");
  await page.fill('input[type="date"]', "1985-03-15");
  await page.locator("select").filter({ hasText: /select|female|male/i }).last().selectOption("female").catch(() => {});

  // Address
  await page.fill('input[placeholder="123 Main St"]', "456 Test Ave");
  await page.locator("label", { hasText: "City" }).locator("xpath=..").locator("input").fill("Miami");
  await page.fill('input[placeholder="CA"]', "FL");
  await page.fill('input[placeholder="90210"]', "33101");

  await page.screenshot({ path: "scripts/order-step1-info.png" });
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/health|questionnaire|step2/, { timeout: 10000 });
  console.log("  → Info submitted. URL:", page.url());
}

async function fillHealthStep(page: Page) {
  console.log("Step 2: Filling health questionnaire...");
  await page.waitForLoadState("networkidle").catch(() => {});

  // Answer all radio questions with "No" (non-disqualifying)
  const radioLabels = await page.locator('label:has-text("No")').all();
  for (const label of radioLabels) {
    await label.click().catch(() => {});
  }

  await page.screenshot({ path: "scripts/order-step2-health.png" });
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/consent|step3|upload/, { timeout: 10000 });
  console.log("  → Health submitted. URL:", page.url());
}

async function fillConsentStep(page: Page) {
  console.log("Step 3: Filling consent...");
  await page.waitForLoadState("networkidle").catch(() => {});

  // Check all consent checkboxes
  const checkboxes = await page.locator('input[type="checkbox"]').all();
  for (const cb of checkboxes) {
    const checked = await cb.isChecked().catch(() => false);
    if (!checked) await cb.click().catch(() => {});
  }

  // Fill signature
  const sigInput = page.locator('input[placeholder*="name"], input[placeholder*="sign"], input[type="text"]').last();
  await sigInput.fill("LifeFile TestOrder").catch(() => {});

  await page.screenshot({ path: "scripts/order-step3-consent.png" });
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/upload|id|step4|payment/, { timeout: 10000 });
  console.log("  → Consent submitted. URL:", page.url());
}

async function fillUploadStep(page: Page) {
  console.log("Step 4: Upload step (skip/continue if optional)...");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: "scripts/order-step4-upload.png" });

  // Try skip button first, then submit
  const skipBtn = page.locator('button').filter({ hasText: /skip|continue|next/i }).first();
  const hasSkip = await skipBtn.isVisible({ timeout: 2000 }).catch(() => false);
  if (hasSkip) await skipBtn.click();
  else await page.locator('button[type="submit"]').click().catch(() => {});

  await page.waitForURL(/payment|step5|checkout/, { timeout: 10000 });
  console.log("  → Upload step done. URL:", page.url());
}

async function fillPaymentStep(page: Page) {
  console.log("Step 5: Filling payment...");
  await page.waitForLoadState("networkidle").catch(() => {});

  // Card number — placeholder "4242 4242 4242 4242"; use pressSequentially to fire React onChange
  const cardInput = page.locator('input[placeholder*="4242"]').first();
  await cardInput.click().catch(() => {});
  await cardInput.pressSequentially("4242424242424242", { delay: 30 }).catch(async () => {
    console.log("  ⚠ cardInput selector failed — trying nth(1) text input");
    const inp = page.locator('input[type="text"]').nth(1);
    await inp.click().catch(() => {});
    await inp.pressSequentially("4242424242424242", { delay: 30 }).catch(() => {});
  });

  // Expiry — placeholder "12/26"
  const expInput = page.locator('input[placeholder*="12/"]').first();
  await expInput.click().catch(() => {});
  await expInput.pressSequentially("1228", { delay: 30 }).catch(async () => {
    const inp = page.locator('input[type="text"]').nth(2);
    await inp.click().catch(() => {});
    await inp.pressSequentially("1228", { delay: 30 }).catch(() => {});
  });

  // CVV — placeholder "•••" (password type)
  const cvvInput = page.locator('input[type="password"]').first();
  await cvvInput.click().catch(() => {});
  await cvvInput.pressSequentially("123", { delay: 30 }).catch(() => {});

  await page.screenshot({ path: "scripts/order-step5-payment.png" });

  // Wait for Pay button to become enabled (card fields must be filled first)
  await page.waitForFunction(
    "(() => { const b = document.querySelector('button[type=\"submit\"]'); return b && !b.disabled; })()",
    { timeout: 10000 }
  ).catch(() => console.log("  ⚠ Pay button still disabled after 10s — attempting click anyway"));

  await page.screenshot({ path: "scripts/order-step5b-payment-ready.png" });

  // Intercept the charge API response to check for integration warnings
  const chargePromise = page.waitForResponse(
    (r) => r.url().includes("/api/payments/charge"),
    { timeout: 60000 }
  ).then(async (resp) => {
    const body = await resp.json().catch(() => ({}));
    console.log("  📡 Charge API response:", JSON.stringify(body, null, 2));
    return body;
  }).catch((e) => { console.log("  ⚠ Could not capture charge response:", e.message); });

  await page.locator('button[type="submit"]').click({ force: true });
  await chargePromise;
  await page.waitForURL(/done|success|confirm|status/, { timeout: 60000 });
  console.log("  → Payment submitted. URL:", page.url());
  await page.screenshot({ path: "scripts/order-step6-done.png" });
}

async function checkLifeFileSandbox() {
  console.log("\nChecking Life File sandbox for the order...");
  const browser2 = await chromium.launch({ headless: false, slowMo: 150 });
  const p = await browser2.newPage();

  await p.goto("https://host100.lifefile.net/apitest/pharmacy", { waitUntil: "networkidle" });
  await p.fill('input[type="text"]', "sandbox11472-251");
  await p.fill('input[type="password"]', "iEdN8y^nb7fQJf&5h&6R");
  await p.keyboard.press("Enter");
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(2000);

  // Click Order Management across frames
  for (const frame of p.frames()) {
    const link = frame.locator("text=Order Management").first();
    if (await link.isVisible({ timeout: 500 }).catch(() => false)) {
      await link.click();
      break;
    }
  }
  await p.waitForTimeout(2000);

  // Click Search in the order list frame
  for (const frame of p.frames()) {
    const search = frame.locator('input[value="Search"], button:has-text("Search")').first();
    if (await search.isVisible({ timeout: 500 }).catch(() => false)) {
      await search.click();
      break;
    }
  }
  await p.waitForTimeout(2000);
  await p.screenshot({ path: "scripts/lf-after-order.png" });

  // Print frame text
  for (const frame of p.frames()) {
    const text = await frame.locator("body").innerText().catch(() => "");
    if (text.includes("LifeFile") || text.includes("TestFirst") || text.includes("TestOrder") || text.includes("Tirzepatide") || text.length > 200) {
      const lines = text.split("\n").filter(l => l.trim()).slice(0, 40);
      console.log(`\n=== ${frame.url()} ===`);
      lines.forEach(l => console.log(l));
    }
  }

  await browser2.close();
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const page = await browser.newPage();

  try {
    await fillInfoStep(page);
    await fillHealthStep(page);
    await fillConsentStep(page);

    // Check if upload step exists
    if (page.url().includes("upload") || page.url().includes("id")) {
      await fillUploadStep(page);
    }

    await fillPaymentStep(page);
    console.log("\n✅ Full order flow completed!");
  } catch (err) {
    console.error("❌ Flow failed at:", page.url());
    console.error(err);
    await page.screenshot({ path: "scripts/order-error.png" });
  } finally {
    await browser.close();
  }

  await checkLifeFileSandbox();
  console.log("\nAll screenshots saved to scripts/order-*.png and scripts/lf-*.png");
})();
