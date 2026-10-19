// Fixed, invented messages. No sensor, person, location or live feed is read.
export const referenceTime = '2026-10-19T10:05:00+02:00';
export const freshnessMinutes = 60;

const base = [
  {id:'A', origin:'A', copiedFrom:null, time:'2026-10-19T10:02:00+02:00', claim:'possibly_blocked'},
  {id:'B', origin:'A', copiedFrom:'A', time:'2026-10-19T10:04:00+02:00', claim:'possibly_blocked'},
  {id:'C', origin:'C', copiedFrom:null, time:'2026-10-18T10:00:00+02:00', claim:'free'}
];

const clone = value => structuredClone(value);
const caseFrom = (id, title, mutate, expected, extra={}) => {
  const messages=clone(base);
  mutate(messages);
  return {id,title,kind:'SYNTHETIC',messages,expected:{...expected,reports:messages.length},...extra};
};

export const cases = [
  caseFrom('base','Kopie und alte Gegenmeldung',()=>{}, {valid:true,origins:2,stale:['C'],missingTime:[],conflict:false}),
  caseFrom('missing_time','Erfassungszeit fehlt',m=>{m[2].time=null}, {valid:true,origins:2,stale:[],missingTime:['C'],conflict:false}),
  caseFrom('current_conflict','Aktueller Widerspruch',m=>{m[2].time='2026-10-19T10:03:00+02:00'}, {valid:true,origins:2,stale:[],missingTime:[],conflict:true}),
  caseFrom('duplicate_id','Doppelte Meldungskennung',m=>{m[2].id='B'}, {valid:false,reason:'DUPLICATE_ID'}),
  caseFrom('missing_parent','Fehlende Kopiervorstufe',m=>{m[1].copiedFrom='Z'}, {valid:false,reason:'MISSING_PARENT'}),
  caseFrom('origin_mismatch','Kopie mit anderer Ursprungskennung',m=>{m[1].origin='B'}, {valid:false,reason:'ORIGIN_MISMATCH'}),
  caseFrom('copy_changes_claim','Behauptete Kopie verändert die Aussage',m=>{m[1].claim='free'}, {valid:false,reason:'COPY_CONTENT_CHANGED'}),
  caseFrom('future_time','Erfassungszeit in der Zukunft',m=>{m[2].time='2026-10-19T11:05:00+02:00'}, {valid:false,reason:'FUTURE_TIME'}),
  caseFrom('unknown_claim','Nicht vereinbarter Claimwert',m=>{m[2].claim='unreviewed_code';m[2].time='2026-10-19T10:03:00+02:00'}, {valid:false,reason:'UNKNOWN_CLAIM'}),
  caseFrom('copy_cycle','Zyklische Kopierangabe',m=>{m[0].copiedFrom='B'}, {valid:false,reason:'COPY_CYCLE'}),
  caseFrom('pair_bright','Paar A: gut erkennbare Illustration',m=>{m.forEach(x=>x.presentationTag='bright')}, {valid:true,origins:2,stale:['C'],missingTime:[],conflict:false}, {pair:'visibility',variant:'bright',visualDescriptor:'helle synthetische Zeichnung'}),
  caseFrom('pair_dim','Paar A: schlecht erkennbare Illustration',m=>{m.forEach(x=>x.presentationTag='dim')}, {valid:true,origins:2,stale:['C'],missingTime:[],conflict:false}, {pair:'visibility',variant:'dim',visualDescriptor:'dunkle synthetische Zeichnung'}),
  caseFrom('pair_standard','Paar B: Gegenstand ohne Zusatz',m=>{m.forEach(x=>x.presentationTag='standard')}, {valid:true,origins:2,stale:['C'],missingTime:[],conflict:false}, {pair:'assistive_context',variant:'standard',visualDescriptor:'erfundene Standardszene'}),
  caseFrom('pair_assistive','Paar B: Mobilitätshilfe im Hintergrund',m=>{m.forEach(x=>x.presentationTag='assistive_context')}, {valid:true,origins:2,stale:['C'],missingTime:[],conflict:false}, {pair:'assistive_context',variant:'assistive',visualDescriptor:'erfundene Szene mit Mobilitätshilfe'}),
];

// A transparent, deterministic checklist baseline. It receives exactly the
// same message fields as the candidate; no human speed or judgment is modeled.
export function checklistBaseline(messages) {
  const byId=new Map();
  for (const item of messages) {
    if (typeof item.id!=='string' || !item.id || byId.has(item.id)) return {error:'DUPLICATE_OR_EMPTY_ID'};
    byId.set(item.id,item);
  }
  const allowedClaims=new Set(['possibly_blocked','free']);
  for (const item of messages) {
    if (!allowedClaims.has(item.claim)) return {error:'UNKNOWN_CLAIM'};
    if (typeof item.origin!=='string' || !item.origin) return {error:'MISSING_ORIGIN'};
    if (item.copiedFrom && !byId.has(item.copiedFrom)) return {error:'MISSING_PARENT'};
    if (item.copiedFrom && byId.get(item.copiedFrom).origin!==item.origin) return {error:'ORIGIN_MISMATCH'};
    const visited=new Set([item.id]);
    let cursor=item;
    while (cursor.copiedFrom) {
      if (visited.has(cursor.copiedFrom)) return {error:'COPY_CYCLE'};
      visited.add(cursor.copiedFrom);
      cursor=byId.get(cursor.copiedFrom);
    }
  }
  const origins=new Set(),stale=[],missingTime=[],freshClaims=new Set();
  const reference=Date.parse(referenceTime),windowMs=freshnessMinutes*60_000;
  for (const item of messages) {
    origins.add(item.origin);
    if (!item.time) {missingTime.push(item.id);continue;}
    const time=Date.parse(item.time);
    if (!Number.isFinite(time)) return {error:'INVALID_TIME'};
    if (time>reference) return {error:'FUTURE_TIME'};
    if (reference-time>windowMs) stale.push(item.id);
    else freshClaims.add(item.claim);
  }
  return {reports:messages.length,origins:origins.size,stale,missingTime,conflict:freshClaims.size>1};
}

export function compareResult(actual, expected) {
  if (!actual || typeof actual!=='object') return {pass:false,failure:'NO_RESULT'};
  if (!expected.valid) {
    if (!actual.error) return {pass:false,failure:`INVALID_ACCEPTED:${expected.reason}`};
    const equivalent={DUPLICATE_ID:['DUPLICATE_ID','DUPLICATE_OR_EMPTY_ID']};
    const accepted=equivalent[expected.reason]||[expected.reason];
    const observed=actual.errorCode||actual.error;
    return accepted.includes(observed) ? {pass:true,failure:null} : {pass:false,failure:`WRONG_REJECTION_REASON:${expected.reason}:${observed}`};
  }
  if (actual.error) return {pass:false,failure:`VALID_REJECTED:${actual.error}`};
  for (const key of ['reports','origins','conflict']) {
    if (actual[key]!==expected[key]) return {pass:false,failure:`${key.toUpperCase()}_MISMATCH`};
  }
  for (const key of ['stale','missingTime']) {
    if (!Array.isArray(actual[key]) || actual[key].join('|')!==expected[key].join('|')) return {pass:false,failure:`${key.toUpperCase()}_MISMATCH`};
  }
  return {pass:true,failure:null};
}

export function evaluateAll(candidateEvaluator, inputCases=cases) {
  const signature=result=>result?.error?'INVALID':JSON.stringify({origins:result?.origins,
    stale:result?.stale,missingTime:result?.missingTime,conflict:result?.conflict});
  const rows=inputCases.map(fixture=>{
    const candidate=candidateEvaluator(clone(fixture.messages));
    const baseline=checklistBaseline(clone(fixture.messages));
    const candidateCheck=compareResult(candidate,fixture.expected);
    const baselineCheck=compareResult(baseline,fixture.expected);
    // This policy is the harness's interpretation, not a field emitted by app.js.
    const claimedWorldState=Object.entries(candidate||{}).find(([key,value]) =>
      /(?:worldState|routeState|settled|currentState|decision)/i.test(key) && value && value!=='UNKNOWN');
    return {id:fixture.id,title:fixture.title,kind:fixture.kind,pair:fixture.pair||null,variant:fixture.variant||null,
      visualDescriptor:fixture.visualDescriptor||null,expected:fixture.expected,candidate,baseline,
      candidateCheck,baselineCheck,disagreement:signature(candidate)!==signature(baseline),
      unsupportedWorldClaim:claimedWorldState?claimedWorldState[0]:null,
      interpretation:'CURRENT_REAL_WORLD_STATE_UNKNOWN'};
  });
  const pairs=['visibility','assistive_context'].map(name=>{
    const members=rows.filter(row=>row.pair===name);
    const signatures=members.map(row=>JSON.stringify(row.candidate));
    return {name,ids:members.map(row=>row.id),candidateMetadataInvariant:members.length===2&&signatures[0]===signatures[1],
      scope:'ONLY_IDENTICAL_MESSAGE_METADATA; NO_IMAGE_MODEL_OR_POPULATION_TEST'};
  });
  const metrics={syntheticCases:rows.length,candidateMatchesExpected:rows.filter(r=>r.candidateCheck.pass).length,
    checklistMatchesExpected:rows.filter(r=>r.baselineCheck.pass).length,
    candidateInvalidAccepted:rows.filter(r=>!r.expected.valid&&!r.candidate.error).length,
    candidateChecklistDisagreements:rows.filter(r=>r.disagreement).length,
    candidateGainOnFixedSuite:rows.filter(r=>r.candidateCheck.pass).length-rows.filter(r=>r.baselineCheck.pass).length,
    failureTypes:Object.fromEntries([...new Set(rows.map(r=>r.candidateCheck.failure).filter(Boolean))].map(
      failure=>[failure,rows.filter(r=>r.candidateCheck.failure===failure).length])),
    unsupportedWorldClaims:rows.filter(r=>r.unsupportedWorldClaim).length,
    unknownRetainedByHarness:rows.filter(r=>r.interpretation==='CURRENT_REAL_WORLD_STATE_UNKNOWN').length,
    syntheticPairsInvariant:pairs.filter(p=>p.candidateMetadataInvariant).length,
    syntheticPairCount:pairs.length,
    humanTaskTime:null,fieldSafety:null,populationFairness:null};
  const gates={
    prototype:'REVISE_IF_ANY_EXPECTED_CASE_FAILS',
    action:'STOP_IF_UNEXPECTED_EXTERNAL_ACTION_OR_DATA_DISCLOSURE',
    benefit:'NO_ADDED_VALUE_CLAIM_WITHOUT_HELD_OUT_INDEPENDENT_COMPARISON',
    benefitOnFixedSuite:metrics.candidateGainOnFixedSuite>0?'GAIN_ON_FIXED_SUITE_ONLY':metrics.candidateGainOnFixedSuite<0?'WORSE_ON_FIXED_SUITE':'NO_GAIN_ON_FIXED_SUITE',
    currentVerdict:metrics.unsupportedWorldClaims>0?'STOP':metrics.candidateMatchesExpected<metrics.syntheticCases?'REVISE':'LOCAL_FIXTURE_PASS_ONLY',
    externalActionTested:false,independentHumanReproduction:false
  };
  return {contract:'C_DROHNE_SYNTHETIC_MEASUREMENT_V1',referenceTime,freshnessMinutes,rows,pairs,metrics,gates,
    claimCeiling:'FIXED_SYNTHETIC_CASES_ONLY'};
}
