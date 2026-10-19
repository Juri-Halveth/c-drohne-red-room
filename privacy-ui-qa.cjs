const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = 'http://127.0.0.1:8843/';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  try {
    for (const width of [375, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      let blockedExternalRequests = 0;
      await page.route('**/*', route => {
        if (route.request().url().startsWith(base)) return route.continue();
        blockedExternalRequests += 1;
        return route.abort();
      });
      await page.goto(`${base}privacy-demo.html`, { waitUntil: 'load' });
      assert.equal(await page.locator('#state').getAttribute('data-state'), 'HOLD');
      assert.equal(await page.locator('#approve').isDisabled(), true);
      assert.match(await page.locator('#receipt').innerText(), /NOT_GRANTED_BY_THIS_DEMO/);
      await page.locator('#correct').click();
      assert.equal(await page.locator('#state').getAttribute('data-state'), 'HUMAN_CORRECTED_RECORDED');
      assert.match(await page.locator('#receipt').innerText(), /"resultCode": "OBJECT_ONLY"/);
      await page.locator('#reset').click();
      await page.locator('#reject').click();
      assert.equal(await page.locator('#state').getAttribute('data-state'), 'HUMAN_REJECTED_RECORDED');
      await page.locator('#fixture').selectOption('flower-description');
      assert.equal(await page.locator('#approve').isEnabled(), true);
      await page.locator('#approve').click();
      assert.equal(await page.locator('#state').getAttribute('data-state'), 'HUMAN_APPROVED_RECORD_ONLY');
      assert.match(await page.locator('#canary-check').innerText(), /PASS/);
      const sizing = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(sizing.scroll <= sizing.client + 1, `${width}px: horizontal overflow ${JSON.stringify(sizing)}`);
      await page.screenshot({ path: `previews/privacy-demo-${width}.png`, fullPage: true });
      console.log(`privacy UI ${width}px: ${blockedExternalRequests} browser-environment external requests blocked; demo remained functional`);
      await page.close();
    }
    console.log('privacy UI QA: 375px and 1440px passed; HOLD, reject, correct, approve, receipt and canary checked with external requests blocked');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
