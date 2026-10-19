#!/usr/bin/env node
/* Local, dependency-free Chromium QA. This tests DOM, layout and keyboard
 * mechanics; it does not stand in for NVDA, VoiceOver or a human usability test.
 * Run: node accessibility-qa.cjs [--inject-css]
 * --inject-css previews dist/accessibility.css after each page load, before
 * checking layout/focus. The production HTML must link that CSS separately.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const root = __dirname;
const dist = path.join(root, 'dist');
const injectCss = process.argv.includes('--inject-css');
const chrome = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find(fs.existsSync);
if (!chrome) throw new Error('Set CHROME_PATH to a local Chromium/Edge executable');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function rgb(s) {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(s);
  return match ? { values: match.slice(1, 4).map(Number), alpha: match[4] === undefined ? 1 : Number(match[4]) } : null;
}
function luminance(values) {
  const [r, g, b] = values.map(v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(foreground, background) {
  const fg = rgb(foreground), bg = rgb(background);
  if (!fg || !bg || fg.alpha !== 1 || bg.alpha !== 1) return null;
  const a = luminance(fg.values), b = luminance(bg.values);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (!data.id) {
        if (/exceptionThrown|consoleAPICalled|loadingFailed/.test(data.method || '')) this.events.push(data);
        return;
      }
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      clearTimeout(pending.timer);
      data.error ? pending.reject(new Error(`${pending.method}: ${data.error.message}`)) : pending.resolve(data.result);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
      this.pending.set(id, { resolve, reject, method, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.socket.close(); }
}

async function waitFor(predicate, label, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await sleep(80);
  }
  throw new Error(`Timeout waiting for ${label}`);
}
async function page(cdp, filename, width = 1280, height = 800) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const targetUrl = pathToFileURL(path.join(dist, filename)).href;
  await cdp.send('Page.navigate', { url: targetUrl });
  await waitFor(() => cdp.eval(`document.location.href === ${JSON.stringify(targetUrl)} && document.readyState === 'complete'`), `${filename} load`);
  await cdp.send('Page.bringToFront');
  if (injectCss) {
    await cdp.eval(`(() => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.id = 'qa-accessibility-css';
      link.href = ${JSON.stringify(pathToFileURL(path.join(dist, 'accessibility.css')).href)};
      document.head.append(link);
    })()`);
    await waitFor(() => cdp.eval(`Boolean(document.getElementById('qa-accessibility-css')?.sheet)`),
      'accessibility.css load');
  }
}
async function key(cdp, keyName, code) {
  const virtualKey = keyName === 'Tab' ? 9 : 13;
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: keyName, code,
    windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey });
  if (keyName === 'Enter') await cdp.send('Input.dispatchKeyEvent', { type: 'char', key: keyName, code,
    text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code,
    windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey });
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cdro-accessibility-'));
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${tempRoot}`, 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });
  let cdp;
  try {
    const activePort = await waitFor(() => {
      const file = path.join(tempRoot, 'DevToolsActivePort');
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/)[0] : null;
    }, 'Chrome DevTools port');
    const targets = await (await fetch(`http://127.0.0.1:${activePort}/json/list`)).json();
    const target = targets.find(item => item.type === 'page');
    if (!target) throw new Error('No Chrome page target');
    cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Navigation integrity: never fetch external destinations as a side effect.
    for (const filename of ['index.html', 'audit-72.html', 'leseraum.html', 'rechte.html']) {
      await page(cdp, filename);
      const structure = await cdp.eval(`(() => {
        const ids=[...document.querySelectorAll('[id]')].map(x=>x.id);
        const duplicateIds=ids.filter((id,index)=>ids.indexOf(id)!==index);
        const unnamed=[...document.querySelectorAll('a,button,input,select,textarea,summary')]
          .filter(el=>!el.hidden && getComputedStyle(el).display!=='none')
          .filter(el=>!(el.getAttribute('aria-label') || el.textContent.trim() || el.labels?.length || el.getAttribute('title')))
          .map(el=>el.outerHTML.slice(0,100));
        const images=[...document.querySelectorAll('img,[role="img"]')]
          .filter(el=>!(el.getAttribute('alt') || el.getAttribute('aria-label')))
          .map(el=>el.outerHTML.slice(0,100));
        return {h1:document.querySelectorAll('h1').length,main:document.querySelectorAll('main').length,
          duplicateIds,unnamed,images};
      })()`);
      check(`${filename} structure and names`, structure.h1 === 1 && structure.main === 1 &&
        structure.duplicateIds.length === 0 && structure.unnamed.length === 0 && structure.images.length === 0,
        JSON.stringify(structure));
      const links = await cdp.eval(`Array.from(document.querySelectorAll('a[href]'), a => ({ href:a.getAttribute('href'), text:a.textContent.trim() }))`);
      const broken = [];
      const html = fs.readFileSync(path.join(dist, filename), 'utf8');
      for (const link of links) {
        if (/^(?:https?:|mailto:|tel:)/i.test(link.href)) continue;
        const [relative, fragment] = link.href.split('#', 2);
        const targetFile = path.resolve(dist, relative || filename);
        if (!targetFile.startsWith(path.resolve(dist) + path.sep)) { broken.push(`${link.href}: outside dist`); continue; }
        if (!fs.existsSync(targetFile)) { broken.push(`${link.href}: missing file`); continue; }
        if (fragment && path.extname(targetFile).toLowerCase() === '.html') {
          const targetHtml = targetFile === path.join(dist, filename) ? html : fs.readFileSync(targetFile, 'utf8');
          if (!new RegExp(`\\bid=["']${fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(targetHtml)) broken.push(`${link.href}: missing fragment`);
        }
      }
      check(`${filename} local link targets`, broken.length === 0, broken.slice(0, 5).join('; ') || `${links.length} links checked`);
    }

    await page(cdp, 'index.html');
    const mainAx = (await cdp.send('Accessibility.getFullAXTree')).nodes;
    const mainNames = mainAx.filter(node => !node.ignored).map(node => node.name?.value || '');
    const mainWanted = ['Direkt zur Tür', 'Dem Ruf folgen', 'Herkunft und Zeit prüfen', 'Blume prüfen', 'Kinderwagen prüfen'];
    check('main controls in Chromium accessibility tree', mainWanted.every(name => mainNames.some(value => value.includes(name))),
      mainWanted.filter(name => !mainNames.some(value => value.includes(name))).join(', ') || `${mainAx.length} AX nodes`);
    await page(cdp, 'audit-72.html');
    const auditAx = (await cdp.send('Accessibility.getFullAXTree')).nodes;
    const auditNames = auditAx.filter(node => !node.ignored).map(node => node.name?.value || '');
    const auditWanted = ['Frage oder Befund suchen', 'Offen', 'Themengruppen'];
    check('audit controls in Chromium accessibility tree', auditWanted.every(name => auditNames.some(value => value.includes(name))),
      auditWanted.filter(name => !auditNames.some(value => value.includes(name))).join(', ') || `${auditAx.length} AX nodes`);

    // Reflow covers the main, audit, reading and rights surfaces at 320 CSS px.
    for (const filename of ['index.html', 'audit-72.html', 'leseraum.html', 'rechte.html']) {
      for (const width of [320, 375, 720]) {
        await page(cdp, filename, width, 667);
        const layout = await cdp.eval(`(() => {
          const title = document.querySelector('h1');
          const nav = document.querySelector('header nav');
          const tr = title?.getBoundingClientRect();
          const nr = nav?.getBoundingClientRect();
          const items = [...(nav?.querySelectorAll('a') || [])].map(a => a.getBoundingClientRect());
          return { viewport:innerWidth, scroll:document.documentElement.scrollWidth,
            title:tr && {left:tr.left,right:tr.right,width:tr.width,scroll:title.scrollWidth},
            nav:nr && {top:nr.top,bottom:nr.bottom},
            navLinksVisible:items.every(r => r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1) };
        })()`);
        check(`${filename} ${width}px reflow`, layout.scroll <= width + 1 && layout.navLinksVisible && layout.title.right <= width + 1 && layout.title.scroll <= layout.title.width + 1,
          `scroll=${layout.scroll}, title=${Math.round(layout.title.scroll)}/${Math.round(layout.title.width)}, nav=${layout.navLinksVisible}`);
      }
    }

    await page(cdp, 'index.html', 375, 800);
    await key(cdp, 'Tab', 'Tab');
    const skipFocus = await cdp.eval(`({className:document.activeElement.className,
      outline:getComputedStyle(document.activeElement).outlineWidth})`);
    check('keyboard skip-link focus ring', skipFocus.className === 'skip' && parseFloat(skipFocus.outline) >= 2,
      JSON.stringify(skipFocus));
    await key(cdp, 'Tab', 'Tab');
    const brandFocus = await cdp.eval(`({className:document.activeElement.className,
      outline:getComputedStyle(document.activeElement).outlineWidth})`);
    check('keyboard brand focus ring', brandFocus.className === 'brand' && parseFloat(brandFocus.outline) >= 2,
      JSON.stringify(brandFocus));
    await cdp.eval(`document.querySelector('[data-route="door"]').focus()`);
    await key(cdp, 'Enter', 'Enter');
    const route = await cdp.eval(`({shown:!document.getElementById('route-reveal').hidden,
      focus:document.activeElement.id, text:document.getElementById('route-text').textContent.trim(),
      next:document.getElementById('enter-room').textContent.trim()})`);
    check('keyboard route activation and focus', route.shown && route.focus === 'route-text' && route.text.length > 0, JSON.stringify(route));
    await cdp.eval(`document.getElementById('enter-room').focus()`);
    await key(cdp, 'Enter', 'Enter');
    check('keyboard main-entry focus', await cdp.eval(`document.activeElement.id === 'room'`), 'target #room');
    await cdp.eval(`document.querySelector('[data-object="stroller"]').focus()`);
    await key(cdp, 'Enter', 'Enter');
    const object = await cdp.eval(`({pressed:document.querySelector('[data-object="stroller"]').getAttribute('aria-pressed'),
      title:document.getElementById('inspection-title').textContent,
      live:document.querySelector('.inspection').getAttribute('aria-live')})`);
    check('keyboard object sheet', object.pressed === 'true' && /Kinderwagen/.test(object.title) && object.live === 'polite', JSON.stringify(object));
    await cdp.eval(`document.getElementById('case-run').focus()`);
    await key(cdp, 'Enter', 'Enter');
    const caseResult = await cdp.eval(`({text:document.getElementById('case-output').textContent,
      role:document.getElementById('case-output').getAttribute('role')})`);
    check('keyboard case result', /aktuelle Weglage ungeklärt/i.test(caseResult.text) && caseResult.role === 'status', caseResult.role);

    await page(cdp, 'index.html', 320, 667);
    const initialHero = await cdp.eval(`(() => {
      const bar=document.querySelector('.topbar').getBoundingClientRect();
      const intro=document.querySelector('.entrance-content .eyebrow').getBoundingClientRect();
      const direct=document.querySelector('.hero-case-link').getBoundingClientRect();
      return {barBottom:bar.bottom,introTop:intro.top,directBottom:direct.bottom};
    })()`);
    check('320px first-view entry remains reachable', initialHero.introTop >= initialHero.barBottom && initialHero.directBottom <= 667,
      JSON.stringify(initialHero));
    await cdp.eval(`document.querySelector('[data-route="voice"]').focus()`);
    await key(cdp, 'Enter', 'Enter');
    const revealedLayout = await cdp.eval(`(() => {const r=document.getElementById('route-reveal').getBoundingClientRect();
      return {width:innerWidth,scroll:document.documentElement.scrollWidth,left:r.left,right:r.right,focus:document.activeElement.id};})()`);
    check('320px expanded route reflow', revealedLayout.scroll <= 321 && revealedLayout.left >= -1 &&
      revealedLayout.right <= 321 && revealedLayout.focus === 'route-text', JSON.stringify(revealedLayout));

    await page(cdp, 'audit-72.html', 375, 800);
    await cdp.eval(`document.querySelector('[data-filter="OFFEN"]').focus()`);
    await key(cdp, 'Enter', 'Enter');
    const filtered = await cdp.eval(`({pressed:document.querySelector('[data-filter="OFFEN"]').getAttribute('aria-pressed'),
      visible:[...document.querySelectorAll('.audit-card')].filter(x=>!x.hidden).length,
      wrong:[...document.querySelectorAll('.audit-card')].some(x=>!x.hidden && x.dataset.status!=='OFFEN'),
      count:document.getElementById('audit-count').textContent})`);
    check('keyboard audit filter', filtered.pressed === 'true' && filtered.visible > 0 && !filtered.wrong && /von 72/.test(filtered.count), JSON.stringify(filtered));

    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await page(cdp, 'index.html', 375, 800);
    const before = await cdp.eval(`({media:matchMedia('(prefers-reduced-motion: reduce)').matches,
      wing:getComputedStyle(document.querySelector('.butterfly'),'::before').animationName,
      transform:document.querySelector('.butterfly').style.transform})`);
    await sleep(180);
    const afterTransform = await cdp.eval(`document.querySelector('.butterfly').style.transform`);
    check('reduced motion stops decorative animation', before.media && before.wing === 'none' && before.transform === afterTransform, JSON.stringify(before));
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });

    await page(cdp, 'index.html');
    const colors = await cdp.eval(`[...[
      ['.case-input article small','.case-input'],['.inspection dt','.inspection'],
      ['.case-input article b','.case-input']
    ]].map(([fg,bg])=>({fg,bg,color:getComputedStyle(document.querySelector(fg)).color,
      background:getComputedStyle(document.querySelector(bg)).backgroundColor}))`);
    await page(cdp, 'audit-72.html');
    colors.push(...await cdp.eval(`[...[
      ['.audit-answer p','.audit-card'],['.audit-meta','.audit-card'],
      ['.audit-state','.audit-card'],
      ['.audit-card[data-status="OFFEN"] .audit-state','.audit-card[data-status="OFFEN"]'],
      ['.audit-card[data-status="TEILWEISE"] .audit-state','.audit-card[data-status="TEILWEISE"]']
    ]].map(([fg,bg])=>({fg,bg,color:getComputedStyle(document.querySelector(fg)).color,
      background:getComputedStyle(document.querySelector(bg)).backgroundColor}))`));
    for (const item of colors) {
      const measured = ratio(item.color, item.background);
      check(`opaque contrast ${item.fg}`, measured !== null && measured >= 4.5,
        `${item.color} on ${item.background} = ${measured?.toFixed(2) ?? 'unknown'}:1`);
    }

    // JS-off: the main information and all audit cards should remain reachable.
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
    await page(cdp, 'index.html', 375, 800);
    const staticMain = await cdp.eval(`({caseText:document.querySelector('.case-input')?.textContent || '',
      alternative:document.querySelector('.static-alternative')?.textContent || '',
      links:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href')),
      hiddenChoice:getComputedStyle(document.querySelector('.choice-row')).display})`);
    check('no-JS main preserves information', /Hilfsweg/.test(staticMain.caseText) && /Kinderwagen/.test(staticMain.alternative) && staticMain.links.includes('leseraum.html') && staticMain.hiddenChoice === 'none',
      `case=${staticMain.caseText.length} chars, alternative=${staticMain.alternative.length} chars`);
    await page(cdp, 'audit-72.html', 375, 800);
    const staticAudit = await cdp.eval(`({cards:document.querySelectorAll('.audit-card').length,
      visible:[...document.querySelectorAll('.audit-card')].filter(x=>getComputedStyle(x).display!=='none').length,
      controls:getComputedStyle(document.querySelector('.audit-filters')).display,
      scriptingNone:matchMedia('(scripting: none)').matches})`);
    check('no-JS audit preserves 72 answers', staticAudit.cards === 72 && staticAudit.visible === 72,
      JSON.stringify(staticAudit));
    check('no-JS audit hides inert filters', staticAudit.controls === 'none', JSON.stringify(staticAudit));
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });

    console.log(`SUMMARY ${checks.filter(c => c.pass).length}/${checks.length} checks passed${injectCss ? ' with candidate CSS injected' : ' on current HTML/CSS'}`);
    if (checks.some(c => !c.pass)) process.exitCode = 1;
  } finally {
    if (cdp) {
      try { await cdp.send('Browser.close'); } catch {}
      cdp.close();
    }
    child.kill();
    // The only recursive cleanup target is the unique directory made above.
    const tempBase = path.resolve(os.tmpdir()) + path.sep;
    if (path.resolve(tempRoot).startsWith(tempBase) && path.basename(tempRoot).startsWith('cdro-accessibility-')) {
      try { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch {}
    }
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
