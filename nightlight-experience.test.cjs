const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const chromePath = process.env.CHROME_PATH || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : undefined);
const pageUrl = pathToFileURL(path.join(__dirname, 'dist/nachtlicht.html')).href;

test('four perspective controls preserve the intended story and fit a phone', {
  skip: chromePath && !fs.existsSync(chromePath) ? 'Chrome not installed' : false,
  timeout: 30000
}, async () => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pageUrl);
    const cases = [
      ['ort', 'LAGE OFFEN'],
      ['blick', 'AUSSCHNITT'],
      ['herkunft', '1 KOPIE · 1 ALTER HINWEIS'],
      ['entscheidung', 'NÄCHSTER SCHRITT: PRÜFEN']
    ];
    for (const [id, expected] of cases) {
      const button = page.locator(`.view-buttons button[data-view="${id}"]`);
      await button.click();
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#scene-stage').getAttribute('data-view'), id);
      assert.equal(await page.locator('#view-status').textContent(), expected);
    }
    await page.locator('.view-buttons button[data-view="herkunft"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#scene-stage').getAttribute('data-view'), 'entscheidung');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.view-buttons button[data-view="ort"]').click();
    assert.equal(await page.locator('#view-status').textContent(), 'LAGE OFFEN');
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.close();

    const noScript = await browser.newPage({ javaScriptEnabled: false });
    await noScript.goto(pageUrl);
    assert.match(await noScript.locator('noscript').textContent(), /A meldet um 10:02/);
    await noScript.close();

    const noWebGL = await browser.newPage();
    await noWebGL.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return original.call(this, type, ...rest);
      };
    });
    await noWebGL.goto(pageUrl);
    assert.match(await noWebGL.locator('#scene-stage').getAttribute('class'), /\bwebgl-unavailable\b/);
    assert.equal(await noWebGL.locator('#scene-fallback').isVisible(), true);
    await noWebGL.close();
  } finally {
    await browser.close();
  }
});
