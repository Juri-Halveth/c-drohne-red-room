const { PRIVACY_STATES, createSyntheticObservation, reviewSyntheticObservation, createMinimizedReceipt, canaryOmittedFromSerialized } = globalThis.PrivacyState;

const fixtureSelect = document.getElementById('fixture');
const buttons = {
  reject: document.getElementById('reject'),
  correct: document.getElementById('correct'),
  approve: document.getElementById('approve'),
  reset: document.getElementById('reset')
};
const labels = {
  DRAWN_STROLLER_SHAPE: 'Eine Kinderwagenform ist gezeichnet.',
  DRAWN_FLOWER_LIKE_SHAPE: 'Eine blütenartige Form ist gezeichnet.',
  DRAWN_CROPPED_CURVE: 'Beobachtet wird nur der obere Bogen; darunter sind zwei mögliche Ergänzungen gezeigt.',
  CHILD_PRESENT: 'Vielleicht ist ein Kind anwesend — nicht beobachtet.',
  FLOWER_LIKE_SHAPE: 'Blütenartige Form; keine eindeutige Identität.',
  BOOMERANG_OR_HANDLE: 'Bumerang oder Griff — beide Deutungen bleiben möglich.',
  INTERIOR_NOT_OBSERVED: 'Der Inhalt des Kinderwagens ist nicht sichtbar.',
  IDENTITY_NOT_ESTABLISHED: 'Die genaue Art ist nicht festgestellt.',
  CONTEXT_CROPPED_OUT: 'Das grobe Label entfernt den restlichen Bildkontext.'
};
const purposes = {
  DEMONSTRATE_FALSE_ALERT_REVIEW: 'Fehlalarm aus einer Objektform erkennen und intern korrigieren.',
  DEMONSTRATE_BOUNDED_OBJECT_DESCRIPTION: 'Eine begrenzte Formbeschreibung intern prüfen.',
  DEMONSTRATE_LABEL_INFORMATION_LOSS: 'Den Informationsverlust eines groben Labels sichtbar machen.'
};
let record;

function render() {
  const held = record.state === PRIVACY_STATES.HOLD;
  const falseAlert = record.fixtureId === 'stroller-false-alert';
  const ambiguous = record.fixtureId === 'cropped-ambiguous-shape';
  document.getElementById('drawing').textContent = falseAlert ? '◕' : '✿';
  document.getElementById('simple-drawing').style.display = ambiguous ? 'none' : 'block';
  document.getElementById('ambiguity-demo').hidden = !ambiguous;
  document.getElementById('ambiguity-demo').style.display = ambiguous ? 'block' : 'none';
  document.getElementById('observed').textContent = labels[record.observedCode];
  document.getElementById('hypothesis').textContent = labels[record.hypothesisCode];
  document.getElementById('gap').textContent = labels[record.evidenceGap];
  document.getElementById('purpose').textContent = purposes[record.purposeCode];
  const state = document.getElementById('state');
  state.dataset.state = record.state;
  state.textContent = held ? 'Prüfung offen' : record.state === PRIVACY_STATES.REJECTED ? 'Verdacht verworfen' : record.state === PRIVACY_STATES.CORRECTED ? (ambiguous ? 'Mehrdeutigkeit festgehalten' : 'Beschreibung korrigiert') : 'Beschreibung bestätigt';
  state.classList.toggle('done', !held);
  document.getElementById('result').textContent = held
    ? 'Offen: keine Aussage über eine Person und keine Außenwirkung.'
    : record.state === PRIVACY_STATES.REJECTED
      ? 'Der Verdacht wurde als unbelegt verworfen. Die ursprüngliche Hypothese bleibt im Prüfbeleg nachvollziehbar.'
      : record.state === PRIVACY_STATES.CORRECTED
        ? (ambiguous ? 'Der Ausschnitt unterscheidet Bumerang und Griff nicht. Beide Deutungen bleiben offen. Es folgt keine automatische Handlung.' : 'Korrigiert: Die Beobachtung trägt nur eine Objektform. Es folgt keine automatische Handlung.')
        : 'Die begrenzte Formbeschreibung wurde für dieses interne Beispiel bestätigt. Es folgt keine automatische Handlung.';
  buttons.reject.disabled = !held || ambiguous;
  buttons.correct.disabled = !held;
  buttons.approve.disabled = !held || falseAlert || ambiguous;
  buttons.correct.textContent = ambiguous ? 'Mehrdeutig lassen' : 'Auf Objektform korrigieren';
  document.getElementById('approval-note').textContent = ambiguous
    ? 'Bestätigen bleibt gesperrt: Der Bildausschnitt enthält zu wenig Kontext für eines der beiden Labels.'
    : falseAlert ? 'Bestätigen bleibt gesperrt: Eine Kinderwagenform belegt keine Person darin.'
    : 'Bestätigen betrifft nur die Formbeschreibung im synthetischen Datensatz.';
  const serialized = JSON.stringify(createMinimizedReceipt(record), null, 2);
  document.getElementById('receipt').textContent = serialized;
  document.getElementById('canary-check').textContent = canaryOmittedFromSerialized(record, serialized)
    ? 'Canary-Test: PASS für diesen synthetischen JSON-Pfad.'
    : 'Canary-Test: FAIL — Beleg nicht verwenden.';
}

function reset() {
  let nextRecord;
  try {
    nextRecord = createSyntheticObservation(fixtureSelect.value);
  } catch {
    record = null;
    for (const id of ['observed','hypothesis','gap','purpose','receipt','canary-check','approval-note']) document.getElementById(id).textContent = '';
    document.getElementById('simple-drawing').style.display = 'none';
    document.getElementById('ambiguity-demo').style.display = 'none';
    document.getElementById('state').dataset.state = 'INVALID_FIXTURE';
    document.getElementById('state').textContent = 'Testfall ungültig';
    document.getElementById('result').textContent = 'Dieser Testfall gehört nicht zum festen lokalen Satz. Bitte einen gültigen Fall auswählen.';
    buttons.reject.disabled = buttons.correct.disabled = buttons.approve.disabled = true;
    buttons.reset.disabled = false;
    return;
  }
  record = nextRecord;
  render();
}

fixtureSelect.addEventListener('change', reset);
buttons.reset.addEventListener('click', reset);
buttons.reject.addEventListener('click', () => { record = reviewSyntheticObservation(record, { kind: 'REJECT' }); render(); });
buttons.correct.addEventListener('click', () => { record = reviewSyntheticObservation(record, { kind: 'CORRECT', correctedCode: record.fixtureId === 'cropped-ambiguous-shape' ? 'UNKNOWN' : 'OBJECT_ONLY' }); render(); });
buttons.approve.addEventListener('click', () => { record = reviewSyntheticObservation(record, { kind: 'APPROVE' }); render(); });
reset();
