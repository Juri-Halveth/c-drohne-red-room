import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  PRIVACY_STATES,
  listSyntheticFixtures,
  createSyntheticObservation,
  reviewSyntheticObservation,
  createMinimizedReceipt,
  canaryOmittedFromSerialized
} = require('./privacy-state.js');

test('a stroller drawing starts held and does not claim that a child was observed', () => {
  const record = createSyntheticObservation('stroller-false-alert');
  assert.equal(record.state, PRIVACY_STATES.HOLD);
  assert.equal(record.observedCode, 'DRAWN_STROLLER_SHAPE');
  assert.equal(record.hypothesisCode, 'CHILD_PRESENT');
  assert.equal(record.evidenceGap, 'INTERIOR_NOT_OBSERVED');
  assert.equal(record.resultCode, 'UNRESOLVED');
  assert.equal(record.purposeCode, 'DEMONSTRATE_FALSE_ALERT_REVIEW');
  assert.equal(record.consentState, 'NO_REAL_PERSON_DATA_IN_FIXTURE');
  assert.equal(record.realCaptureAuthority, 'NOT_GRANTED_BY_THIS_DEMO');
  assert.equal(record.externalEffect, 'NONE');
  assert.equal(createMinimizedReceipt(record).reviewProvenance, 'NONE');
});

test('rejecting a false alert records a human UI decision without outside effect', () => {
  const held = createSyntheticObservation('stroller-false-alert');
  const rejected = reviewSyntheticObservation(held, { kind: 'REJECT' });
  assert.equal(held.state, PRIVACY_STATES.HOLD);
  assert.equal(rejected.state, PRIVACY_STATES.REJECTED);
  assert.equal(rejected.resultCode, 'UNSUPPORTED_HYPOTHESIS');
  assert.equal(rejected.transition.from, PRIVACY_STATES.HOLD);
  assert.equal(rejected.externalEffect, 'NONE');
  assert.equal(createMinimizedReceipt(rejected).reviewProvenance, 'DECLARED_UI_INPUT_NOT_AUTHENTICATED_PERSON');
  assert.throws(() => reviewSyntheticObservation(rejected, { kind: 'APPROVE' }), /only a held record/u);
});

test('correction replaces the claim with a bounded object-only result', () => {
  const corrected = reviewSyntheticObservation(createSyntheticObservation('stroller-false-alert'), {
    kind: 'CORRECT', correctedCode: 'OBJECT_ONLY'
  });
  assert.equal(corrected.state, PRIVACY_STATES.CORRECTED);
  assert.equal(corrected.resultCode, 'OBJECT_ONLY');
  assert.equal(corrected.hypothesisCode, 'CHILD_PRESENT'); // original is retained for review
  assert.equal(createMinimizedReceipt(corrected).resultCode, 'OBJECT_ONLY');
});

test('approval is record-only and forbidden for an unsupported person inference', () => {
  assert.throws(() => reviewSyntheticObservation(createSyntheticObservation('stroller-false-alert'), { kind: 'APPROVE' }), /cannot be approved/u);
  const approved = reviewSyntheticObservation(createSyntheticObservation('flower-description'), { kind: 'APPROVE' });
  assert.equal(approved.state, PRIVACY_STATES.APPROVED);
  assert.equal(approved.resultCode, 'FLOWER_LIKE_SHAPE');
  assert.equal(approved.externalEffect, 'NONE');
  assert.equal(createMinimizedReceipt(approved).externalEffect, 'NONE');
});

test('cropped context keeps two readings open and records UNKNOWN', () => {
  const held = createSyntheticObservation('cropped-ambiguous-shape');
  assert.equal(held.evidenceGap, 'CONTEXT_CROPPED_OUT');
  assert.equal(held.hypothesisCode, 'BOOMERANG_OR_HANDLE');
  assert.throws(() => reviewSyntheticObservation(held, { kind: 'APPROVE' }), /cannot be approved/u);
  assert.throws(() => reviewSyntheticObservation(held, { kind: 'REJECT' }), /alternatives must remain open/u);
  assert.throws(() => reviewSyntheticObservation(held, { kind: 'CORRECT', correctedCode: 'OBJECT_ONLY' }), /bounded vocabulary/u);
  const open = reviewSyntheticObservation(held, { kind: 'CORRECT', correctedCode: 'UNKNOWN' });
  assert.equal(open.state, PRIVACY_STATES.CORRECTED);
  assert.equal(createMinimizedReceipt(open).resultCode, 'UNKNOWN');
  assert.equal(createMinimizedReceipt(open).eventTime, '2026-10-19T10:06:00+02:00');
  assert.equal(createMinimizedReceipt(open).fixtureContractVersion, '2026-10-19.2');
});

test('only fixed synthetic fixtures and bounded decisions enter the module', () => {
  assert.deepEqual(listSyntheticFixtures(), ['stroller-false-alert', 'flower-description', 'cropped-ambiguous-shape']);
  assert.throws(() => createSyntheticObservation('real-camera'), /unknown synthetic fixture/u);
  const held = createSyntheticObservation('stroller-false-alert');
  assert.throws(() => reviewSyntheticObservation(held, { kind: 'CORRECT', correctedCode: 'NAMED_CHILD' }), /bounded vocabulary/u);
  assert.throws(() => reviewSyntheticObservation(held, { kind: 'REJECT', note: 'a private name' }), /extra fields/u);
  assert.throws(() => createMinimizedReceipt({ ...held }), /must come from this synthetic module/u);
});

test('allowlisted receipt omits synthetic canary and detects a contaminated export', () => {
  const held = createSyntheticObservation('stroller-false-alert');
  const receipt = createMinimizedReceipt(held);
  const serialized = JSON.stringify(receipt);
  assert.equal(canaryOmittedFromSerialized(held, serialized), true);
  assert.equal(serialized.includes('rgba'), false);
  assert.equal(serialized.includes('privateCanary'), false);
  assert.equal(canaryOmittedFromSerialized(held, serialized + 'SYNTHETIC_CANARY_Q43_MUST_NOT_EXPORT_7c2f'), false);
});

test('state operations make no network request', () => {
  let calls = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = () => { calls += 1; throw new Error('network call forbidden'); };
  try {
    const receipt = createMinimizedReceipt(reviewSyntheticObservation(createSyntheticObservation('flower-description'), { kind: 'REJECT' }));
    assert.equal(receipt.externalEffect, 'NONE');
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previous;
  }
});
