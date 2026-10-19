import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {cases,compareResult} from './dist/measurement-core.mjs';
import {loadSiteEvaluator} from './measurement-runner.mjs';

const require=createRequire(import.meta.url);
const privacy=require('./dist/privacy-state.js');
const root=dirname(fileURLToPath(import.meta.url));
const evaluate=loadSiteEvaluator(readFileSync(join(root,'dist','app.js'),'utf8'));
const base=()=>structuredClone(cases.find(item=>item.id==='base').messages);
const changed=change=>{const messages=base();change(messages);return evaluate(messages)};
const expectError=(change,pattern)=>assert.match(changed(change).error,pattern);

test('Q01: Kann eine leere Meldungsliste als Lage gelten?',()=>assert.match(evaluate([]).error,/Mindestens eine Meldung/));
test('Q02: Können doppelte IDs zwei Zeugen vortäuschen?',()=>expectError(m=>{m[2].id='B'},/mehrfach/));
test('Q03: Darf eine Kopie ohne bekannte Vorstufe zählen?',()=>expectError(m=>{m[1].copiedFrom='Z'},/Vorstufe fehlt/));
test('Q04: Darf eine angebliche Kopie unbemerkt die Aussage ändern?',()=>expectError(m=>{m[1].claim='free'},/ändert die Aussage/));
test('Q05: Wird ein Kreis als scheinbare Herkunft angenommen?',()=>expectError(m=>{m[0].copiedFrom='B'},/Kreis/));
test('Q06: Kann eine Kopie ihren Ursprung wechseln?',()=>expectError(m=>{m[1].origin='B'},/Ursprungskennung/));
test('Q07: Wird ein unmögliches Kalenderdatum akzeptiert?',()=>expectError(m=>{m[2].time='2026-02-31T10:03:00+02:00'},/Erfassungszeit ist ungültig/));
test('Q08: Kann eine Meldung aus der Zukunft aktuell wirken?',()=>expectError(m=>{m[2].time='2026-10-19T11:00:00+02:00'},/nach der Referenzzeit/));
test('Q09: Kann eine Kopie vor ihrer Vorstufe entstehen?',()=>expectError(m=>{m[1].time='2026-10-19T10:01:00+02:00'},/vor ihrer angegebenen Vorstufe/));
test('Q10: Wird eine ungültige Eingangszeit trotz fehlender Ereigniszeit entdeckt?',()=>expectError(m=>{m[2].time=null;m[2].receivedAt='ungültig'},/Eingangszeit/));
test('Q11: Wird eine zukünftige Eingangszeit trotz fehlender Ereigniszeit entdeckt?',()=>expectError(m=>{m[2].time=null;m[2].receivedAt='2026-10-19T11:00:00+02:00'},/Eingangszeit/));
test('Q12: Zählt eine frische Kopie ohne datierten Ursprung als frischer unabhängiger Ursprung?',()=>{
  const result=changed(m=>{m[0].time=null});
  assert.equal(result.freshOrigins,0);
  assert.deepEqual(result.missingTime,['A']);
});
test('Q13: Wird eine ausgelassene Kopierangabe still zum Original?',()=>expectError(m=>{delete m[1].copiedFrom},/Vorstufe/));
test('Q14: Wird ein ausgelassenes Zeitfeld still als unbekannt normalisiert?',()=>expectError(m=>{delete m[2].time},/Zeitfeld/));
test('Q15: Bleiben zwei aktuelle Gegenmeldungen im Konflikt?',()=>{
  const result=changed(m=>{m[2].time='2026-10-19T10:03:00+02:00'});
  assert.equal(result.conflict,true);assert.equal(result.freshOrigins,2);
});
test('Q16: Wird eine fehlende dritte Meldung als fehlend gezählt?',()=>{
  const result=changed(m=>{m.pop()});assert.equal(result.reports,2);assert.equal(result.freshOrigins,1);
});
test('Q17: Macht eine neue Zustellung eine alte Beobachtung frisch?',()=>{
  const result=changed(m=>{m[2].time='2026-10-19T09:00:00+02:00';m[2].receivedAt='2026-10-19T10:04:00+02:00'});
  assert.deepEqual(result.stale,['C']);assert.equal(result.freshOrigins,1);
});
test('Q18: Kann die Kinderwagenform eine Person im Wagen bestätigen?',()=>{
  const record=privacy.createSyntheticObservation('stroller-false-alert');
  assert.throws(()=>privacy.reviewSyntheticObservation(record,{kind:'APPROVE'}));
});
test('Q19: Können bei einem Ausschnitt beide Möglichkeiten weggedrückt werden?',()=>{
  const record=privacy.createSyntheticObservation('cropped-ambiguous-shape');
  assert.throws(()=>privacy.reviewSyntheticObservation(record,{kind:'REJECT'}));
  assert.throws(()=>privacy.reviewSyntheticObservation(record,{kind:'APPROVE'}));
  assert.equal(privacy.reviewSyntheticObservation(record,{kind:'CORRECT',correctedCode:'UNKNOWN'}).resultCode,'UNKNOWN');
});
test('Q20: Enthält der Prüfbeleg Zeit und Version, aber keinen Canary?',()=>{
  const record=privacy.createSyntheticObservation('cropped-ambiguous-shape');
  const receipt=privacy.createMinimizedReceipt(record);
  assert.equal(receipt.eventTime,'2026-10-19T10:06:00+02:00');
  assert.equal(receipt.fixtureContractVersion,'2026-10-19.2');
  assert.equal(privacy.canaryOmittedFromSerialized(record,JSON.stringify(receipt)),true);
});
test('Q21: Lässt eine unbekannte Auswahl alte Ergebnisse stehen oder stürzt die Seite ab?',async()=>{
  const {chromium}=require('playwright');
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});
  try {
    const page=await browser.newPage({viewport:{width:375,height:812}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(pathToFileURL(join(root,'dist','index.html')).href);
    await page.locator('#case-variant').selectOption('conflict');
    await page.locator('#case-run').click();
    await page.locator('#case-variant').evaluate(select=>select.add(new Option('Unbekannt','invalid-case')));
    await page.locator('#case-variant').selectOption('invalid-case');
    assert.equal(await page.locator('#case-run').isDisabled(),true);
    assert.match(await page.locator('#case-output').innerText(),/Unbekannter Testfall/);
    assert.match(await page.locator('#case-origin-field').innerText(),/Nicht geprüft/);
    assert.equal(await page.locator('#case-c-article').isVisible(),false);
    await page.locator('#case-variant').selectOption('stale');
    assert.equal(await page.locator('#case-run').isEnabled(),true);
    assert.equal(await page.locator('#case-c-article').isVisible(),true);
    assert.deepEqual(errors,[]);
  } finally {await browser.close()}
});
test('Q22: Kann ein beliebiger Fehler die Messung künstlich bestehen?',()=>{
  assert.equal(compareResult({error:'irgendein Fehler'},{valid:false,reason:'MISSING_PARENT'}).pass,false);
  assert.equal(compareResult({error:'falscher Fehler',errorCode:'FUTURE_TIME'},{valid:false,reason:'MISSING_PARENT'}).pass,false);
});
test('Q23: Kann ein falscher Meldungszähler als gültiges Ergebnis bestehen?',()=>{
  const expected=cases.find(item=>item.id==='base').expected;
  assert.equal(compareResult({reports:99,origins:2,stale:['C'],missingTime:[],conflict:false},expected).pass,false);
});
test('Q24: Bringen 300 gemischte ungültige Angaben den Prüfer zum Absturz?',()=>{
  const ids=[null,'','A','B','!','Z'];
  const origins=[null,'A','B','Z'];
  const parents=[null,'A','B','Z',5,undefined];
  const times=[null,'','2026-10-19T10:01:00+02:00','2026-99-99T99:99:99+02:00',undefined];
  const claims=[null,'free','possibly_blocked','fremd'];
  for(let index=0;index<300;index++){
    const messages=base();
    messages[1]={...messages[1],id:ids[index%ids.length],origin:origins[Math.floor(index/ids.length)%origins.length],copiedFrom:parents[Math.floor(index/24)%parents.length],time:times[Math.floor(index/7)%times.length],claim:claims[Math.floor(index/11)%claims.length]};
    const result=evaluate(messages);
    assert.ok(result && typeof result==='object',`case ${index}`);
    assert.ok(result.error || (Number.isInteger(result.reports) && Array.isArray(result.stale) && Array.isArray(result.missingTime)),`case ${index}: structured result`);
  }
});
