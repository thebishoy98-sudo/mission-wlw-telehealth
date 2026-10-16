const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const origin = process.env.GLP1_TEST_ORIGIN || 'http://localhost:3011';
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/glp1/assessment?utm_source=social&ref=partner`, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Start your candidate assessment' }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator('a[href^="/products"],a[href^="/peptides"],a[href^="/start/info"]').count(), 0);
      assert.equal(await page.locator('footer').count(), 1);
    }
    const requests = [];
    await page.route('**/api/intake/candidate', async route => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ status: requests.length === 1 ? 503 : 201, contentType: 'application/json', body: JSON.stringify(requests.length === 1 ? { error: 'Try again' } : { ok: true }) });
    });
    await page.getByRole('button', { name: 'Submit Assessment for Review' }).click();
    assert.equal(requests.length, 0, 'Incomplete form must not submit');
    await page.getByLabel('First name', { exact: true }).fill('Test');
    await page.getByLabel('Last name', { exact: true }).fill('Candidate');
    await page.getByLabel('Email', { exact: true }).fill('candidate@example.test');
    await page.getByLabel('Phone', { exact: true }).fill('2025550100');
    await page.getByLabel('State of residence').selectOption('NY');
    await page.getByLabel('Preferred contact method').selectOption('Email');
    await page.getByLabel('What would you like to explore?').selectOption('Understand my options');
    await page.getByLabel('Have you received professional weight-management support?').selectOption('No previous professional support');
    await page.getByRole('checkbox').nth(0).check();
    await page.getByRole('checkbox').nth(1).check();
    await page.getByRole('button', { name: 'Submit Assessment for Review' }).click();
    await page.getByRole('alert').filter({ hasText: 'Try again' }).waitFor();
    await page.getByRole('button', { name: 'Submit Assessment for Review' }).click();
    await page.getByRole('heading', { name: 'Your assessment has been received' }).waitFor();
    assert.equal(requests.length, 2);
    assert.equal(requests[0].id, requests[1].id, 'Retry must reuse request identity');
    assert.deepEqual(requests[1].attribution, { utm_source: 'social', ref: 'partner' });
    assert.equal(requests[1].consent, true);
    assert.equal(requests[1].adult, true);
    assert.equal(new URL(page.url()).pathname, '/glp1/assessment');
    assert.equal(await page.locator('a[href^="/start/info"]').count(), 0);
    const staff = await page.request.get(`${origin}/api/provider/candidates`);
    assert.equal(staff.status(), 401);
    console.log('PASS: responsive assessment, no storefront links, validation, recoverable error, idempotent retry, attribution, confirmation, protected inbox. SMS and submissions mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
