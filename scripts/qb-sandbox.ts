import { chromium } from "playwright";

(async () => {
  let browser;
  try {
    // Try to connect to existing Edge with remote debugging
    browser = await chromium.connectOverCDP("http://localhost:9222");
    console.log("Connected to existing Edge session");
  } catch {
    // Launch fresh browser
    browser = await chromium.launch({
      channel: "msedge",
      headless: false,
    });
    console.log("Launched new Edge window");
  }

  const context = browser.contexts()[0] ?? await browser.newContext();
  const page = context.pages()[0] ?? await context.newPage();

  await page.goto("https://developer.intuit.com/app/developer/dashboard");
  console.log("Navigate to the Sandbox tab and create a company");
  console.log("Waiting 5 minutes for you to complete the action...");

  // Wait for sandbox creation — look for sandbox company in the list
  await page.waitForTimeout(300000); // 5 min max
})();
