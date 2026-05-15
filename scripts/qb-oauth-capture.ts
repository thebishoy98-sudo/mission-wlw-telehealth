import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: false,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Opening QB OAuth flow...");
  await page.goto("https://mission-wlw-dev.vercel.app/api/auth/qb/start");

  console.log("Waiting for you to authorize in the Intuit page...");

  // Wait for the callback page to load (it shows the tokens)
  await page.waitForURL("**/api/auth/qb/callback**", { timeout: 120000 });
  
  // Give the page a moment to render the tokens
  await page.waitForTimeout(2000);

  // Extract the tokens from the pre block
  const preText = await page.locator("pre").innerText().catch(() => "");
  const bodyText = await page.locator("body").innerText().catch(() => "");

  console.log("\n=== TOKENS CAPTURED ===");
  console.log(preText || bodyText);
  console.log("=======================\n");

  await browser.close();
})();
