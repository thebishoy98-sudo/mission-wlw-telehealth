const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${process.env.GLP1_TEST_ORIGIN || 'http://localhost:3011'}/glp1?utm_source=qa&ref=partner&aff=affiliate`, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { level: 1 }).waitFor();
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error(`Overflow at ${width}`);
      const buttons = page.getByRole('link', { name: /start my assessment/i });
      if (await buttons.count() < 2) throw Error('Missing assessment buttons');
      for (const button of await buttons.all()) {
        if (await button.getAttribute('href') !== '/glp1/assessment?utm_source=qa&ref=partner&aff=affiliate') throw Error('Missing attribution');
      }
      if (await page.locator('footer').count() !== 1) throw Error('Duplicate footer');
      const faq = page.getByRole('button', { name: 'How do I know if I may qualify?' });
      await faq.click();
      if (await faq.getAttribute('aria-expanded') !== 'true') throw Error('FAQ failed to open');
      console.log(`PASS viewport ${width}: layout, assessment attribution, footer, FAQ`);
    }
    if (errors.length) throw Error(errors.join('; '));
    if (process.env.GLP1_SCREENSHOT) await page.screenshot({ path: process.env.GLP1_SCREENSHOT, fullPage: true });
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
