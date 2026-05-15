import { chromium } from "playwright";

async function clickInFrames(page: any, selector: string): Promise<boolean> {
  for (const frame of page.frames()) {
    const el = frame.locator(selector).first();
    const visible = await el.isVisible({ timeout: 500 }).catch(() => false);
    if (visible) {
      await el.click();
      console.log(`Clicked "${selector}" in frame: ${frame.url()}`);
      return true;
    }
  }
  return false;
}

async function getFrameText(page: any): Promise<string> {
  const parts: string[] = [];
  for (const frame of page.frames()) {
    const text = await frame.locator("body").innerText().catch(() => "");
    if (text.trim().length > 30) parts.push(`[${frame.url()}]\n${text}`);
  }
  return parts.join("\n---\n");
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page = await browser.newPage();

  // 1. Login
  console.log("Logging into Life File sandbox...");
  await page.goto("https://host100.lifefile.net/apitest/pharmacy", { waitUntil: "networkidle" });
  await page.fill('input[name*="user"], input[id*="user"], input[type="text"]', "sandbox11472-251");
  await page.fill('input[type="password"]', "iEdN8y^nb7fQJf&5h&6R");
  await page.keyboard.press("Enter");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "scripts/lf-01-loggedin.png" });
  console.log("Logged in. URL:", page.url());

  // 2. Click Order Management
  const foundNav = await clickInFrames(page, 'text=Order Management');
  if (!foundNav) console.log("Order Management not found — trying direct link click");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "scripts/lf-02-order-mgmt.png" });

  // 3. Try to Search / list all orders
  const foundSearch = await clickInFrames(page, 'input[value="Search"], button:has-text("Search"), input[type="submit"]');
  if (!foundSearch) console.log("No Search button found");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "scripts/lf-03-orders-list.png" });

  // 4. Print all frame text
  const allText = await getFrameText(page);
  const lines = allText.split("\n").filter(l => l.trim()).slice(0, 80);
  console.log("\n=== Portal content ===");
  lines.forEach(l => console.log(l));

  await browser.close();
  console.log("\nScreenshots: scripts/lf-0*.png");
})();
