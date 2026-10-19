const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const assert = require('node:assert/strict');

const local = name => pathToFileURL(path.join(__dirname, 'dist', name)).href;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  try {
    for (const width of [320, 375, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      const errors = [];
      const external = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        if (route.request().url().startsWith('file:')) return route.continue();
        external.push(route.request().url());
        return route.abort();
      });
      await page.goto(local('index.html'), { waitUntil: 'load' });
      const cases = [
        ['stale', /liegt außerhalb/], ['missing', /keine gebundene Erfassungszeit/],
        ['conflict', /widersprüchliche aktuelle Aussagen/], ['absent', /C ist nicht eingetroffen/],
        ['reviewer', /HOLD/], ['inconsistent', /widerspricht der Ursprungskennung/],
        ['late', /frische Zustellung macht das ältere Ereignis nicht aktuell/],
        ['copy-change', /Weitergabe ändert die Aussage/],
        ['root-undated', /Meldung A hat keine gebundene Erfassungszeit/]
      ];
      for (const [variant, expected] of cases) {
        await page.locator('#case-variant').selectOption(variant);
        await page.locator('#case-run').click();
        assert.match(await page.locator('#case-output').innerText(), expected, variant);
      }
      await page.locator('#correction-correct').click();
      assert.equal(await page.locator('#correction-state').getAttribute('data-state'), 'HUMAN_CORRECTED_RECORDED');
      await page.locator('#correction-fixture').selectOption('flower-description');
      await page.locator('#correction-approve').click();
      assert.equal(await page.locator('#correction-state').getAttribute('data-state'), 'HUMAN_APPROVED_RECORD_ONLY');
      await page.locator('#correction-fixture').selectOption('cropped-ambiguous-shape');
      assert.equal(await page.locator('#correction-approve').isDisabled(), true);
      assert.equal(await page.locator('#correction-reject').isDisabled(), true);
      assert.equal(await page.locator('#correction-ambiguity-art').isVisible(), true);
      await page.locator('#correction-correct').click();
      assert.match(await page.locator('#correction-receipt').textContent(), /"resultCode": "UNKNOWN"/);
      await page.locator('#correction-fixture').evaluate(select => select.add(new Option('Ungültig', 'unknown-fixture')));
      await page.locator('#correction-fixture').selectOption('unknown-fixture');
      assert.equal(await page.locator('#correction-state').getAttribute('data-state'), 'INVALID_FIXTURE');
      assert.equal(await page.locator('#correction-receipt').textContent(), '');
      await page.locator('#correction-fixture').selectOption('stroller-false-alert');
      assert.equal(await page.locator('#correction-state').getAttribute('data-state'), 'HOLD');
      assert.deepEqual(errors, []);
      const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      assert.ok(dimensions.content <= dimensions.viewport + 1, `${width}px overflow: ${JSON.stringify(dimensions)}`);
      await page.goto(local('measurement-lab.html'), { waitUntil: 'load' });
      assert.match(await page.locator('main').innerText(), /14\/14/);
      assert.match(await page.locator('.gate').innerText(), /Lokale Testfälle bestanden/);
      const measurementWidth = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      assert.ok(measurementWidth.content <= measurementWidth.viewport + 1, `${width}px measurement overflow: ${JSON.stringify(measurementWidth)}`);
      await page.goto(local('privacy-demo.html'), { waitUntil: 'load' });
      assert.equal(await page.locator('#state').getAttribute('data-state'), 'HOLD');
      await page.locator('#reject').click();
      assert.equal(await page.locator('#state').getAttribute('data-state'), 'HUMAN_REJECTED_RECORDED');
      await page.locator('#fixture').selectOption('cropped-ambiguous-shape');
      assert.equal(await page.locator('#approve').isDisabled(), true);
      assert.equal(await page.locator('#reject').isDisabled(), true);
      assert.equal(await page.locator('#ambiguity-demo').isVisible(), true);
      await page.locator('#correct').click();
      assert.match(await page.locator('#receipt').innerText(), /"resultCode": "UNKNOWN"/);
      await page.locator('#fixture').evaluate(select => select.add(new Option('Ungültig', 'unknown-fixture')));
      await page.locator('#fixture').selectOption('unknown-fixture');
      assert.equal(await page.locator('#state').getAttribute('data-state'), 'INVALID_FIXTURE');
      assert.equal(await page.locator('#receipt').textContent(), '');
      await page.locator('#fixture').selectOption('stroller-false-alert');
      assert.equal(await page.locator('#state').getAttribute('data-state'), 'HOLD');
      assert.deepEqual(errors, []);
      await page.close();
      const noJs = await browser.newPage({ viewport: { width, height: 800 }, javaScriptEnabled: false });
      const noJsExternal = [];
      await noJs.route('**/*', route => {
        if (route.request().url().startsWith('file:')) return route.continue();
        noJsExternal.push(route.request().url());
        return route.abort();
      });
      await noJs.goto(local('privacy-demo.html'), { waitUntil: 'load' });
      assert.match(await noJs.locator('main').innerText(), /Ohne JavaScript: Eine Kinderwagenzeichnung/);
      assert.equal(await noJs.locator('.lab').isVisible(), false);
      await noJs.goto(local('measurement-lab.html'), { waitUntil: 'load' });
      assert.match(await noJs.locator('main').innerText(), /14\/14/);
      assert.match(await noJs.locator('main').innerText(), /Ohne JavaScript bleibt das aufgezeichnete Messergebnis lesbar/);
      assert.equal(await noJs.locator('.threshold').isVisible(), false);
      assert.deepEqual(noJsExternal, []);
      await noJs.close();
      console.log(`PASS ${width}px file:// offline: nine case variants, correction, measurement, privacy; blocked ${external.length} non-file requests`);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
