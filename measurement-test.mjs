import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cases,checklistBaseline,compareResult,evaluateAll} from './dist/measurement-core.mjs';
import {loadSiteEvaluator,runMeasurement} from './measurement-runner.mjs';
import {renderMeasurementHTML} from './measurement-render.mjs';

const candidate=loadSiteEvaluator(readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'));

test('fixture contract is fixed, synthetic and has a predeclared expectation',()=>{
  assert.equal(cases.length,14);
  assert.equal(new Set(cases.map(item=>item.id)).size,cases.length);
  for(const fixture of cases){
    assert.equal(fixture.kind,'SYNTHETIC');
    assert.equal(typeof fixture.expected.valid,'boolean');
    assert.ok(Array.isArray(fixture.messages));
  }
});

test('transparent checklist exposes the changed-copy gap on the fixed suite',()=>{
  for(const fixture of cases){
    const check=compareResult(checklistBaseline(structuredClone(fixture.messages)),fixture.expected);
    if(fixture.id==='copy_changes_claim') assert.equal(check.failure,'INVALID_ACCEPTED:COPY_CONTENT_CHANGED');
    else assert.equal(check.pass,true,`${fixture.id}: ${check.failure}`);
  }
});

test('candidate is loaded from actual current app.js and reproduces the three public UI variants',()=>{
  for(const id of ['base','missing_time','current_conflict']){
    const fixture=cases.find(item=>item.id===id);
    const check=compareResult(candidate(structuredClone(fixture.messages)),fixture.expected);
    assert.equal(check.pass,true,`${id}: ${check.failure}`);
  }
});

test('candidate rejects impossible calendar dates and a copy timestamp before its source',()=>{
  const base=structuredClone(cases.find(item=>item.id==='base').messages);
  base[2].time='2026-02-31T10:03:00+02:00';
  assert.match(candidate(base).error,/Erfassungszeit ist ungültig/);
  const early=structuredClone(cases.find(item=>item.id==='base').messages);
  early[1].time='2026-10-19T10:01:00+02:00';
  assert.match(candidate(early).error,/Weitergabe liegt vor ihrer angegebenen Vorstufe/);
  const emptyArrival=structuredClone(cases.find(item=>item.id==='base').messages);
  emptyArrival[2].receivedAt='';
  assert.match(candidate(emptyArrival).error,/Eingangszeit und Ereigniszeit widersprechen sich/);
});

test('evaluation retains failures and never upgrades a fixture to a real-world decision',()=>{
  const result=evaluateAll(candidate);
  assert.equal(result.rows.length,cases.length);
  assert.equal(result.metrics.candidateMatchesExpected,cases.length);
  assert.equal(result.metrics.checklistMatchesExpected,cases.length-1);
  assert.equal(result.metrics.candidateChecklistDisagreements,1);
  assert.equal(result.metrics.humanTaskTime,null);
  assert.equal(result.metrics.populationFairness,null);
  assert.equal(result.metrics.candidateGainOnFixedSuite,result.metrics.candidateMatchesExpected-result.metrics.checklistMatchesExpected);
  assert.equal(result.metrics.unknownRetainedByHarness,cases.length);
  assert.equal(result.gates.externalActionTested,false);
  assert.ok(result.rows.every(row=>row.interpretation==='CURRENT_REAL_WORLD_STATE_UNKNOWN'));
  assert.equal(result.gates.currentVerdict,result.metrics.candidateMatchesExpected===cases.length?'LOCAL_FIXTURE_PASS_ONLY':'REVISE');
});

test('paired descriptors vary while substantive message fields stay identical',()=>{
  for(const pairName of ['visibility','assistive_context']){
    const pair=cases.filter(item=>item.pair===pairName);
    assert.equal(pair.length,2);
    assert.notEqual(pair[0].visualDescriptor,pair[1].visualDescriptor);
    const substantive=item=>item.messages.map(({presentationTag,...message})=>message);
    assert.deepEqual(substantive(pair[0]),substantive(pair[1]));
    assert.notEqual(pair[0].messages[0].presentationTag,pair[1].messages[0].presentationTag);
    assert.deepEqual(candidate(structuredClone(pair[0].messages)),candidate(structuredClone(pair[1].messages)));
  }
});

test('standalone HTML and JSON are bound to current app.js bytes',()=>{
  const result=runMeasurement({write:false});
  assert.match(result.provenance.candidateSha256,/^[0-9a-f]{64}$/);
  const html=renderMeasurementHTML(result);
  assert.match(html,/Gegenprobe/);
  assert.match(html,/Kein Bildklassifikator/);
  assert.ok(html.includes(result.provenance.candidateSha256));
});
