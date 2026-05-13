const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const outDir = path.join(__dirname, "..", "public", "screenshots");
  fs.mkdirSync(outDir, { recursive: true });

  const viewports = [
    { name: "mobile-375", width: 375, height: 812 },
    { name: "tablet-768", width: 768, height: 1024 },
  ];

  const BASE = "https://mission-wlw.vercel.app";
  const pages = [
    { name: "home", url: BASE },
    { name: "questionnaire", url: `${BASE}/start/questionnaire` },
    { name: "provider", url: `${BASE}/provider` },
  ];

  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    for (const pg of pages) {
      await page.goto(pg.url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const file = path.join(outDir, `${vp.name}-${pg.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`Saved: ${file}`);
    }
    await ctx.close();
  }

  await browser.close();
  console.log("Done.");
})();
