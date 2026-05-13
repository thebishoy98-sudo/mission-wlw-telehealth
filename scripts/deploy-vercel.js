/**
 * Vercel deployment assistant using Playwright.
 * Opens a VISIBLE browser. You handle login + clicking Import.
 * Script watches for progress and captures the final URL + IDs.
 *
 * Run: node scripts/deploy-vercel.js
 */

const { chromium } = require("playwright");

const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForUser(page, message, checkFn, timeoutMs = 300_000) {
  console.log(`\n>>> ${message}`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkFn(page).catch(() => false)) return true;
    await WAIT(1500);
  }
  return false;
}

(async () => {
  console.log("\n========================================");
  console.log("  Mission WLW — Vercel Deploy Assistant ");
  console.log("========================================\n");

  const browser = await chromium.launch({
    headless: false,
    slowMo: 300,
    args: ["--start-maximized", "--no-sandbox"],
  });

  const context = await browser.newContext({
    viewport: null,
    // Save session so re-runs don't need re-login
    storageState: undefined,
  });

  const page = await context.newPage();

  // ── 1. Open Vercel ─────────────────────────────────────────────────────────
  console.log("Step 1/5 — Opening vercel.com/new ...");
  await page.goto("https://vercel.com/new", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await WAIT(2000);

  // ── 2. Wait for login ──────────────────────────────────────────────────────
  const isLoggedIn = await waitForUser(
    page,
    "Log in with GitHub in the browser window. Waiting...",
    async (p) => {
      const url = p.url();
      return (
        !url.includes("vercel.com/login") &&
        !url.includes("vercel.com/signup") &&
        !url.includes("github.com/login") &&
        !url.includes("github.com/session")
      );
    },
    180_000
  );

  if (!isLoggedIn) {
    console.log("Timed out waiting for login. Please re-run the script.");
    await browser.close();
    process.exit(1);
  }
  console.log("✓ Login complete.\n");

  // Make sure we're on the new project page
  const curUrl = page.url();
  if (!curUrl.includes("/new")) {
    await page.goto("https://vercel.com/new", { waitUntil: "networkidle", timeout: 30_000 });
    await WAIT(2000);
  }

  // ── 3. Wait for user to click Import on mission-wlw-telehealth ─────────────
  console.log("Step 2/5 — Find 'mission-wlw-telehealth' in the list and click Import.\n");
  console.log(">>> Waiting for you to click Import...");

  const reachedConfig = await waitForUser(
    page,
    "Click Import next to mission-wlw-telehealth in the browser...",
    async (p) => {
      const url = p.url();
      // Vercel config page URL patterns
      return (
        url.includes("/import") ||
        url.includes("configure") ||
        (url.includes("vercel.com") &&
          !url.includes("/new") &&
          !url.includes("/login") &&
          !url.includes("github.com"))
      );
    },
    300_000
  );

  console.log(`Current URL: ${page.url()}`);
  console.log("✓ On configuration page.\n");
  await WAIT(2000);

  // ── 4. Click Deploy (if button exists) ─────────────────────────────────────
  console.log("Step 3/5 — Clicking Deploy...");

  // Try multiple selector patterns for the Deploy button
  const deploySelectors = [
    'button:has-text("Deploy")',
    'button[type="submit"]',
    '[data-testid="deploy-button"]',
    'button.deploy-button',
  ];

  let clicked = false;
  for (const sel of deploySelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      clicked = true;
      console.log(`✓ Clicked Deploy (selector: ${sel})\n`);
      break;
    }
  }

  if (!clicked) {
    console.log(">>> Could not auto-click Deploy.");
    console.log(">>> Please click the Deploy button in the browser.\n");
  }

  // ── 5. Wait for deployment to finish ───────────────────────────────────────
  console.log("Step 4/5 — Waiting for deployment to complete (~90s)...\n");

  let deployedUrl = null;

  await waitForUser(
    page,
    "Deployment in progress... watching for completion",
    async (p) => {
      const url = p.url();
      const body = await p.textContent("body").catch(() => "");
      const isDone =
        body.includes("Congratulations") ||
        body.includes("was successfully deployed") ||
        body.includes("Visit") ||
        url.includes("/deployments/");

      if (isDone) {
        // Try to grab the live URL
        const link = await p
          .locator('a[href*=".vercel.app"]')
          .first()
          .getAttribute("href")
          .catch(() => null);
        if (link) deployedUrl = link;
      }
      return isDone;
    },
    300_000
  );

  // ── 6. Capture results ─────────────────────────────────────────────────────
  console.log("\n========================================");
  console.log("  DEPLOYMENT COMPLETE!");
  console.log("========================================");
  if (deployedUrl) {
    console.log(`\n  Live URL : ${deployedUrl}`);
  } else {
    console.log(`\n  Dashboard: ${page.url()}`);
    console.log("  Check the browser for your live URL.");
  }
  console.log("========================================\n");

  // ── 7. Navigate to settings to grab IDs ───────────────────────────────────
  console.log("Step 5/5 — Opening project settings to capture IDs...\n");
  await WAIT(2000);

  // Click Settings link
  const settingsLink = page
    .locator('a[href*="/settings"]')
    .filter({ hasText: /settings/i })
    .first();

  if (await settingsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await settingsLink.click();
    await WAIT(2500);
  }

  // Try to read Project ID from settings page
  const pageText = await page.textContent("body").catch(() => "");
  const projIdMatch = pageText.match(/prj_[A-Za-z0-9]{20,}/);
  const orgIdMatch = pageText.match(/team_[A-Za-z0-9]{20,}/);

  console.log("========================================");
  console.log("  IDs (copy these for GitHub Secrets)");
  console.log("========================================");
  if (projIdMatch) console.log(`  Project ID : ${projIdMatch[0]}`);
  else console.log("  Project ID : (copy from Settings > General in browser)");
  if (orgIdMatch) console.log(`  Org/Team ID: ${orgIdMatch[0]}`);
  else console.log("  Org/Team ID: (copy from vercel.com/account in browser)");
  console.log("\n  Token      : create at vercel.com/account/tokens");
  console.log("========================================\n");

  console.log("Browser staying open for 10 minutes — copy the IDs, then close it.\n");
  console.log("Paste the 3 values back to Claude to finish GitHub Actions setup.\n");

  await WAIT(600_000); // keep open 10 min
  await browser.close();
})();
