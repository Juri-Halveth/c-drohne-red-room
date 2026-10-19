(function (global) {
// C-DROHNE: deterministic, synthetic-only review state machine.
// No camera, storage, network, device or decision-effect API is used here.

const PRIVACY_STATES = Object.freeze({
  HOLD: 'HOLD',
  REJECTED: 'HUMAN_REJECTED_RECORDED',
  CORRECTED: 'HUMAN_CORRECTED_RECORDED',
  APPROVED: 'HUMAN_APPROVED_RECORD_ONLY'
});

const PRIVATE_CANARY = 'SYNTHETIC_CANARY_Q43_MUST_NOT_EXPORT_7c2f';
const ownedRecords = new WeakMap();

const FIXTURES = Object.freeze({
  'stroller-false-alert': Object.freeze({
    fixtureId: 'stroller-false-alert',
    observedCode: 'DRAWN_STROLLER_SHAPE',
    hypothesisCode: 'CHILD_PRESENT',
    evidenceGap: 'INTERIOR_NOT_OBSERVED',
    purposeCode: 'DEMONSTRATE_FALSE_ALERT_REVIEW',
    eventTime: '2026-10-19T10:02:00+02:00',
    allowedCorrections: Object.freeze(['OBJECT_ONLY', 'UNKNOWN']),
    approvalAllowed: false
  }),
  'flower-description': Object.freeze({
    fixtureId: 'flower-description',
    observedCode: 'DRAWN_FLOWER_LIKE_SHAPE',
    hypothesisCode: 'FLOWER_LIKE_SHAPE',
    evidenceGap: 'IDENTITY_NOT_ESTABLISHED',
    purposeCode: 'DEMONSTRATE_BOUNDED_OBJECT_DESCRIPTION',
    eventTime: '2026-10-19T10:04:00+02:00',
    allowedCorrections: Object.freeze(['OBJECT_ONLY', 'UNKNOWN']),
    approvalAllowed: true
  }),
  'cropped-ambiguous-shape': Object.freeze({
    fixtureId: 'cropped-ambiguous-shape',
    observedCode: 'DRAWN_CROPPED_CURVE',
    hypothesisCode: 'BOOMERANG_OR_HANDLE',
    evidenceGap: 'CONTEXT_CROPPED_OUT',
    purposeCode: 'DEMONSTRATE_LABEL_INFORMATION_LOSS',
    eventTime: '2026-10-19T10:06:00+02:00',
    allowedCorrections: Object.freeze(['UNKNOWN']),
    rejectionAllowed: false,
    approvalAllowed: false
  })
});

function requireCondition(condition, message) {
  if (!condition) throw new TypeError(message);
}

function exactKeys(value, keys) {
  requireCondition(value && Object.getPrototypeOf(value) === Object.prototype, 'plain decision required');
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  requireCondition(actual.length === expected.length && actual.every((key, index) => key === expected[index]), 'decision has missing or extra fields');
}

function freezeRecord(value) {
  Object.freeze(value.transition);
  const record = Object.freeze(value);
  ownedRecords.set(record, PRIVATE_CANARY);
  return record;
}

function requireOwned(record) {
  requireCondition(record && typeof record === 'object' && ownedRecords.get(record) === PRIVATE_CANARY, 'record must come from this synthetic module');
  return record;
}

function listSyntheticFixtures() {
  return Object.freeze(Object.keys(FIXTURES));
}

function createSyntheticObservation(fixtureId) {
  requireCondition(typeof fixtureId === 'string' && Object.hasOwn(FIXTURES, fixtureId), 'unknown synthetic fixture');
  const fixture = FIXTURES[fixtureId];
  return freezeRecord({
    schemaVersion: '1.0.0',
    fixtureContractVersion: '2026-10-19.2',
    sourceClass: 'SYNTHETIC_FIXTURE_ONLY',
    fixtureId,
    observedCode: fixture.observedCode,
    hypothesisCode: fixture.hypothesisCode,
    evidenceGap: fixture.evidenceGap,
    purposeCode: fixture.purposeCode,
    consentState: 'NO_REAL_PERSON_DATA_IN_FIXTURE',
    realCaptureAuthority: 'NOT_GRANTED_BY_THIS_DEMO',
    eventTime: fixture.eventTime,
    state: PRIVACY_STATES.HOLD,
    resultCode: 'UNRESOLVED',
    decisionCode: 'NONE',
    revision: 0,
    externalEffect: 'NONE',
    transition: { from: 'CREATED', to: PRIVACY_STATES.HOLD, kind: 'INITIAL_SYNTHETIC_OBSERVATION' }
  });
}

function reviewSyntheticObservation(record, decision) {
  requireOwned(record);
  requireCondition(record.state === PRIVACY_STATES.HOLD, 'only a held record can be reviewed');
  requireCondition(decision && typeof decision.kind === 'string', 'decision kind required');
  const fixture = FIXTURES[record.fixtureId];
  let state;
  let resultCode;
  if (decision.kind === 'REJECT') {
    exactKeys(decision, ['kind']);
    requireCondition(fixture.rejectionAllowed !== false, 'ambiguous alternatives must remain open');
    state = PRIVACY_STATES.REJECTED;
    resultCode = 'UNSUPPORTED_HYPOTHESIS';
  } else if (decision.kind === 'CORRECT') {
    exactKeys(decision, ['kind', 'correctedCode']);
    requireCondition(fixture.allowedCorrections.includes(decision.correctedCode), 'correction outside bounded vocabulary');
    state = PRIVACY_STATES.CORRECTED;
    resultCode = decision.correctedCode;
  } else if (decision.kind === 'APPROVE') {
    exactKeys(decision, ['kind']);
    requireCondition(fixture.approvalAllowed, 'this unsupported person inference cannot be approved');
    state = PRIVACY_STATES.APPROVED;
    resultCode = record.hypothesisCode;
  } else {
    throw new TypeError('unknown review decision');
  }
  return freezeRecord({
    ...record,
    state,
    resultCode,
    decisionCode: decision.kind,
    revision: record.revision + 1,
    externalEffect: 'NONE',
    transition: { from: PRIVACY_STATES.HOLD, to: state, kind: 'DECLARED_HUMAN_UI_REVIEW' }
  });
}

// The receipt is a new allowlisted object. It contains no image, name, location,
// free text or private canary; it does not write a file or send a message.
function createMinimizedReceipt(record) {
  requireOwned(record);
  const receipt = Object.freeze({
    schemaVersion: record.schemaVersion,
    fixtureContractVersion: record.fixtureContractVersion,
    sourceClass: record.sourceClass,
    fixtureId: record.fixtureId,
    observedCode: record.observedCode,
    originalHypothesisCode: record.hypothesisCode,
    evidenceGap: record.evidenceGap,
    purposeCode: record.purposeCode,
    eventTime: record.eventTime,
    consentState: record.consentState,
    realCaptureAuthority: record.realCaptureAuthority,
    state: record.state,
    resultCode: record.resultCode,
    decisionCode: record.decisionCode,
    revision: record.revision,
    reviewProvenance: record.revision ? 'DECLARED_UI_INPUT_NOT_AUTHENTICATED_PERSON' : 'NONE',
    externalEffect: 'NONE',
    rawFramePersisted: false
  });
  requireCondition(canaryOmittedFromSerialized(record, JSON.stringify(receipt)), 'synthetic canary escaped');
  return receipt;
}

function canaryOmittedFromSerialized(record, serialized) {
  requireOwned(record);
  requireCondition(typeof serialized === 'string', 'serialized receipt required');
  return !serialized.includes(ownedRecords.get(record));
}

const api = Object.freeze({ PRIVACY_STATES, listSyntheticFixtures, createSyntheticObservation, reviewSyntheticObservation, createMinimizedReceipt, canaryOmittedFromSerialized });
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.PrivacyState = api;
})(globalThis);
