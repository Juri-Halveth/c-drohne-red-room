const routes = {
  door: {
    label: 'A / ZUR OFFENEN TÜR',
    text: 'Du gehst direkt hinein. Auf dem Weg hörst du von rechts: „Gut. Die Tür war die ganze Zeit offen. Schau dir erst die Arbeit an — dann reden wir.“'
  },
  voice: {
    label: 'B / DEM RUF FOLGEN',
    text: 'Am Rand sitzt ein Erfinder, der am Modell mitarbeitet. Er sagt: „Ich zeige dir die Fragen und den Code. Im Raum liegt die Probe; die Tür ist offen.“'
  }
};

for (const button of document.querySelectorAll('[data-route]')) {
  button.addEventListener('click', () => {
    const route = routes[button.dataset.route];
    document.getElementById('route-label').textContent = route.label;
    document.getElementById('route-text').textContent = route.text;
    document.getElementById('route-reveal').hidden = false;
    document.querySelector('.entrance').classList.add('has-route');
    document.querySelectorAll('[data-route]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    document.getElementById('route-reveal').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest'});
    document.getElementById('route-text').focus({preventScroll:true});
  });
}
document.getElementById('enter-room').addEventListener('click', () => {
  const room = document.getElementById('room');
  room.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  room.focus({preventScroll:true});
});

// Fixed, invented inputs: this demonstrates grouping from declared metadata.
// It does not verify a real source, a route, or a physical observation.
const caseMessages = [
  {id:'A', origin:'A', copiedFrom:null, time:'2026-10-19T10:02:00+02:00', claim:'possibly_blocked'},
  {id:'B', origin:'A', copiedFrom:'A', time:'2026-10-19T10:04:00+02:00', claim:'possibly_blocked'},
  {id:'C', origin:'C', copiedFrom:null, time:'2026-10-18T10:00:00+02:00', claim:'free'}
];
const caseReferenceTime = Date.parse('2026-10-19T10:05:00+02:00');
const caseFreshnessWindowMs = 60 * 60 * 1000;
function parseCaseTime(value) {
  if (typeof value !== 'string') return NaN;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return NaN;
  const [, y, m, d, hh, mm, ss, zone] = parts;
  const year = Number(y), month = Number(m), day = Number(d), hour = Number(hh), minute = Number(mm), second = Number(ss);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] || hour > 23 || minute > 59 || second > 59) return NaN;
  if (zone !== 'Z') {
    const zoneHour = Number(zone.slice(1, 3)), zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 14 || zoneMinute > 59 || (zoneHour === 14 && zoneMinute !== 0)) return NaN;
  }
  return Date.parse(value);
}
function evaluateCase(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return {error:'Mindestens eine Meldung mit prüfbarer Struktur fehlt.',errorCode:'NO_MESSAGES'};
  if (messages.some(message => !message || typeof message !== 'object' || !Object.hasOwn(message,'copiedFrom') || !Object.hasOwn(message,'time') || typeof message.id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(message.id) || typeof message.origin !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(message.origin))) return {error:'ID, Ursprung, Vorstufe oder Zeitfeld ist ungültig.',errorCode:'INVALID_INPUT'};
  if (messages.some(message => !['possibly_blocked','free'].includes(message.claim))) return {error:'Ein nicht vereinbarter Aussagewert ist ungültig.',errorCode:'UNKNOWN_CLAIM'};
  const ids = new Set(messages.map(message => message.id));
  if (ids.size !== messages.length) return {error:'Eine Meldungs-ID kommt mehrfach vor.',errorCode:'DUPLICATE_ID'};
  const byId = new Map(messages.map(message => [message.id, message]));
  for (const message of messages) {
    if (message.copiedFrom !== null && (typeof message.copiedFrom !== 'string' || !byId.has(message.copiedFrom))) return {error:'Eine deklarierte Vorstufe fehlt.',errorCode:'MISSING_PARENT'};
    const visited = new Set([message.id]);
    let current = message;
    while (current.copiedFrom) {
      if (visited.has(current.copiedFrom)) return {error:'Die Weitergabekette enthält einen Kreis.',errorCode:'COPY_CYCLE'};
      visited.add(current.copiedFrom);
      current = byId.get(current.copiedFrom);
    }
  }
  const origins = new Set();
  const stale = [];
  const missingTime = [];
  const freshClaims = new Set();
  const freshOrigins = new Set();
  for (const message of messages) {
    if (message.copiedFrom && byId.get(message.copiedFrom).origin !== message.origin) return {error:'Die deklarierte Weitergabe widerspricht der Ursprungskennung.',errorCode:'ORIGIN_MISMATCH'};
    if (message.copiedFrom && byId.get(message.copiedFrom).claim !== message.claim) return {error:'Eine Weitergabe ändert die Aussage ihrer Vorstufe.',errorCode:'COPY_CONTENT_CHANGED'};
    origins.add(message.origin);
    const arrival = message.receivedAt === undefined || message.receivedAt === null ? null : parseCaseTime(message.receivedAt);
    if (arrival !== null && (!Number.isFinite(arrival) || arrival > caseReferenceTime)) return {error:'Eingangszeit und Ereigniszeit widersprechen sich.',errorCode:'INVALID_ARRIVAL'};
    if (message.time === null) {
      missingTime.push(message.id);
      continue;
    }
    const timestamp = parseCaseTime(message.time);
    if (!Number.isFinite(timestamp)) return {error:'Eine Erfassungszeit ist ungültig.',errorCode:'INVALID_TIME'};
    if (timestamp > caseReferenceTime) return {error:'Eine Erfassungszeit liegt nach der Referenzzeit.',errorCode:'FUTURE_TIME'};
    if (message.copiedFrom && byId.get(message.copiedFrom).time && timestamp < parseCaseTime(byId.get(message.copiedFrom).time)) return {error:'Eine Weitergabe liegt vor ihrer angegebenen Vorstufe.',errorCode:'COPY_TIME_BEFORE_SOURCE'};
    if (arrival !== null && arrival < timestamp) return {error:'Eingangszeit und Ereigniszeit widersprechen sich.',errorCode:'INVALID_ARRIVAL'};
    if (caseReferenceTime - timestamp > caseFreshnessWindowMs) stale.push(message.id);
    else if (message.copiedFrom === null) { freshClaims.add(message.claim); freshOrigins.add(message.origin); }
  }
  return {reports:messages.length, origins:origins.size, freshOrigins:freshOrigins.size, stale, missingTime, conflict:freshClaims.size>1};
}
const caseVariant = document.getElementById('case-variant');
const knownCaseVariants = new Set(['stale','missing','conflict','absent','reviewer','inconsistent','late','copy-change','root-undated']);
const evidenceFields = {
  origin:document.getElementById('case-origin-field'),
  time:document.getElementById('case-time-field'),
  open:document.getElementById('case-open-field'),
  human:document.getElementById('case-human-field')
};
function showEvidence(origin, time, open, human) {
  evidenceFields.origin.textContent = origin;
  evidenceFields.time.textContent = time;
  evidenceFields.open.textContent = open;
  evidenceFields.human.textContent = human;
}
const caseSteps = ['input','origin','time','human'].map(name => document.getElementById(`case-step-${name}`));
function showCaseSteps(steps) {
  steps.forEach(([label,state],index) => {
    caseSteps[index].textContent = `${String(index + 1).padStart(2,'0')} · ${label}`;
    caseSteps[index].dataset.state = state;
  });
}
caseVariant.addEventListener('change', () => {
  const labels = {
    stale:['C · VORTAG','Separater Ursprung · für die aktuelle Lage veraltet'],
    missing:['C · ZEIT UNBEKANNT','Separater Ursprung · Aktualität ungeklärt'],
    conflict:['C · 10:03','Separater Ursprung · aktuelle Gegenmeldung'],
    absent:['C · NICHT EINGETROFFEN','Keine dritte Meldung; mögliche Hilfe bleibt ungeprüft'],
    reviewer:['C · VORTAG','Prüfung durch zuständige Person derzeit nicht verfügbar'],
    inconsistent:['C · VORTAG','B nennt A als Vorstufe, aber einen anderen Ursprung'],
    late:['C · EREIGNIS 09:00','Erst 10:04 eingetroffen · Ereigniszeit bleibt alt'],
    'copy-change':['C · VORTAG','B nennt A als Kopiervorstufe, ändert aber den Inhalt'],
    'root-undated':['C · VORTAG','Separater Ursprung · für die aktuelle Lage veraltet']
  };
  if (!knownCaseVariants.has(caseVariant.value)) {
    document.getElementById('case-run').disabled = true;
    document.getElementById('case-output').textContent = 'Unbekannter Testfall. Bitte eine gültige Variante wählen.';
    document.getElementById('case-c-time').textContent = 'TESTFALL UNGÜLTIG';
    document.getElementById('case-a-time').textContent = 'A · NICHT GEPRÜFT';
    document.getElementById('case-a-context').textContent = 'Keine gültige Testauswahl.';
    document.getElementById('case-input-count').textContent = 'EINGABE / TESTFALL UNGÜLTIG';
    document.getElementById('case-c-article').hidden = true;
    document.getElementById('case-c-context').textContent = 'Keine Eingabe aus dem festen Testsatz ausgewählt.';
    document.getElementById('case-c-claim').textContent = 'Keine Auswertung.';
    document.getElementById('case-b-context').textContent = 'Keine Auswertung.';
    document.getElementById('case-b-claim').textContent = 'Keine Auswertung.';
    showEvidence('Nicht geprüft','Nicht geprüft','Nicht beobachtet','Gültigen Testfall auswählen');
    showCaseSteps([['Testfall ungültig','stop'],['Keine Herkunftsprüfung','idle'],['Keine Zeitprüfung','idle'],['Keine Entscheidung','hold']]);
    return;
  }
  document.getElementById('case-run').disabled = false;
  document.getElementById('case-c-time').textContent = labels[caseVariant.value][0];
  document.getElementById('case-a-time').textContent = caseVariant.value === 'root-undated' ? 'A · ZEIT UNBEKANNT' : 'A · 10:02';
  document.getElementById('case-a-context').textContent = caseVariant.value === 'root-undated' ? 'Ursprung A · Ereigniszeit fehlt' : 'Ursprung A · Beobachtung behauptet';
  document.getElementById('case-input-count').textContent = caseVariant.value === 'absent' ? 'EINGABE / 02 MELDUNGEN' : 'EINGABE / 03 MELDUNGEN';
  document.getElementById('case-c-article').hidden = caseVariant.value === 'absent';
  document.getElementById('case-c-context').textContent = labels[caseVariant.value][1];
  document.getElementById('case-c-claim').textContent = caseVariant.value === 'absent' ? 'Keine Aussage vorhanden.' : '„Hilfsweg frei.“';
  document.getElementById('case-b-context').textContent = caseVariant.value === 'inconsistent' ? 'Weitergabe von A behauptet · Ursprung B eingetragen' : caseVariant.value === 'copy-change' ? 'Kopie von A behauptet · Aussage verändert' : 'Weitergabe von A · keine neue Beobachtung';
  document.getElementById('case-b-claim').textContent = caseVariant.value === 'copy-change' ? '„Hilfsweg frei.“' : '„Hilfsweg möglicherweise versperrt.“';
  const output = document.getElementById('case-output');
  output.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = 'Prüfung noch nicht ausgeführt.';
  output.append(title);
  showEvidence('Noch nicht geprüft','Noch nicht geprüft','Nicht beobachtet','Zuständige Person prüft');
  showCaseSteps([['Meldungen lesen','idle'],['Kopie erkennen','idle'],['Zeitbezug prüfen','idle'],['Menschen entscheiden lassen','idle']]);
  document.getElementById('case-run').textContent = 'Herkunft und Zeit prüfen ↗';
});
document.getElementById('case-run').addEventListener('click', () => {
  const variant = caseVariant.value;
  if (!knownCaseVariants.has(variant)) return;
  const messages = caseMessages.map(message => ({...message}));
  if (variant === 'missing') messages[2].time = null;
  if (variant === 'conflict') messages[2].time = '2026-10-19T10:03:00+02:00';
  if (variant === 'absent') messages.pop();
  if (variant === 'inconsistent') messages[1].origin = 'B';
  if (variant === 'late') { messages[2].time = '2026-10-19T09:00:00+02:00'; messages[2].receivedAt = '2026-10-19T10:04:00+02:00'; }
  if (variant === 'copy-change') messages[1].claim = 'free';
  if (variant === 'root-undated') messages[0].time = null;
  const result = evaluateCase(messages);
  const output = document.getElementById('case-output');
  const title = document.createElement('strong');
  const detail = document.createElement('p');
  const next = document.createElement('p');
  if (result.error) {
    title.textContent = 'HOLD · Auswertung angehalten.';
    detail.textContent = result.error;
    next.textContent = 'Erst die Testdaten korrigieren; keine Entscheidung ableiten.';
    showEvidence(variant === 'copy-change' ? 'Kopie und Inhalt widersprechen sich' : 'Angaben widersprechen sich','Keine Freigabe der Zeitprüfung','Aktuelle Weglage unbekannt','HOLD · Daten prüfen lassen');
    showCaseSteps([[`${messages.length} Eingaben gelesen`,'done'],['Kopierangaben widersprüchlich','stop'],['Zeitprüfung angehalten','idle'],['HOLD · Datenkorrektur nötig','hold']]);
  } else {
    title.textContent = `${result.reports} Meldungen · ${result.origins} deklarierte Ursprünge`;
    if (variant === 'absent') detail.textContent = 'C ist nicht eingetroffen. A und B sind nur ein deklarierter Ursprung; eine hilfesuchende Person am Weg könnte durch eine falsche Entwarnung übersehen werden.';
    else if (variant === 'reviewer') detail.textContent = 'Die vorhandenen Meldungen genügen nicht für den aktuellen Zustand. Auch die zuständige menschliche Prüfung ist gerade nicht verfügbar.';
    else if (variant === 'late') detail.textContent = 'C ist zwar um 10:04 eingetroffen, berichtet aber über 09:00. Die frische Zustellung macht das ältere Ereignis nicht aktuell.';
    else if (result.missingTime.length) detail.textContent = `B ist als Weitergabe von A markiert. Meldung ${result.missingTime.join(', ')} hat keine gebundene Erfassungszeit.`;
    else if (result.conflict) detail.textContent = 'A und C haben verschiedene deklarierte Ursprünge und widersprüchliche aktuelle Aussagen.';
    else detail.textContent = `B ist als Weitergabe von A markiert. Meldung ${result.stale.join(', ')} liegt außerhalb des festgelegten einstündigen Zeitfensters.`;
    next.textContent = variant === 'reviewer' ? 'HOLD: aktuelle Weglage ungeklärt. Keine automatische Fortsetzung; menschliche Prüfung organisieren und erst dann neu bewerten.' : 'Ergebnis: aktuelle Weglage ungeklärt. Nächster Schritt: frische unabhängige Information und menschliche Prüfung.';
    const timeState = variant === 'missing' ? 'C: Ereigniszeit fehlt' : variant === 'root-undated' ? 'A: Ereigniszeit fehlt; B nur Kopie' : variant === 'conflict' ? 'A und C: aktuell, aber widersprüchlich' : variant === 'late' ? 'C: 09:00 beobachtet, 10:04 eingetroffen' : variant === 'absent' ? 'C: keine Meldung eingetroffen' : 'C: Beobachtung vom Vortag';
    showEvidence((variant === 'absent' ? 'A → B; nur ein deklarierter Ursprung' : 'A → B; C separat angegeben, nicht authentisiert') + ` · ${result.freshOrigins} ${result.freshOrigins === 1 ? 'unabhängiger Ursprung' : 'unabhängige Ursprünge'} mit aktueller Beobachtungszeit`, timeState, 'Aktuelle Weglage unbekannt', variant === 'reviewer' ? 'HOLD · zuständige Prüfung derzeit nicht verfügbar' : 'Frische Information und zuständige Prüfung ausstehend');
    const timeSummary = result.conflict ? 'Aktuelle Aussagen widersprechen sich' : result.missingTime.length ? `${result.missingTime.join(', ')} ohne Ereigniszeit` : result.stale.length ? 'C für jetzt veraltet' : 'Zeitangaben geprüft';
    showCaseSteps([[`${result.reports} Eingaben gelesen`,'done'],[`${result.origins} Ursprünge deklariert`,'done'],[timeSummary,result.conflict || result.missingTime.length ? 'hold' : 'done'],[variant === 'reviewer' ? 'HOLD · Person nicht verfügbar' : 'Weglage offen · Person prüft','hold']]);
  }
  output.replaceChildren(title, detail, next);
  document.getElementById('case-run').textContent = 'Prüfung erneut ausführen ↺';
});

// The correction model is a separate synthetic state machine. No browser
// capture, storage or network API is used by this component.
const correctionApi = typeof window === 'undefined' ? null : window.PrivacyState;
const correctionSelect = document.getElementById('correction-fixture');
const correctionButtons = {
  reject:document.getElementById('correction-reject'),
  correct:document.getElementById('correction-correct'),
  approve:document.getElementById('correction-approve'),
  reset:document.getElementById('correction-reset')
};
let correctionRecord;
const correctionLabels = {
  DRAWN_STROLLER_SHAPE:'Eine Kinderwagenform ist gezeichnet.',
  DRAWN_FLOWER_LIKE_SHAPE:'Eine blütenartige Form ist gezeichnet.',
  DRAWN_CROPPED_CURVE:'Beobachtet wird nur der obere Bogen; darunter sind zwei mögliche Ergänzungen gezeigt.',
  CHILD_PRESENT:'Vielleicht ist ein Kind darin — nicht beobachtet.',
  FLOWER_LIKE_SHAPE:'Eine blütenartige Form; keine eindeutige Art.',
  BOOMERANG_OR_HANDLE:'Bumerang oder Griff — beide Deutungen sind möglich.',
  INTERIOR_NOT_OBSERVED:'Das Innere ist nicht beobachtet.',
  IDENTITY_NOT_ESTABLISHED:'Die genaue Art ist nicht festgestellt.',
  CONTEXT_CROPPED_OUT:'Der restliche Kontext wurde abgeschnitten.'
};
function renderCorrection() {
  const record = correctionRecord;
  const held = record.state === correctionApi.PRIVACY_STATES.HOLD;
  const isStroller = record.fixtureId === 'stroller-false-alert';
  const isAmbiguous = record.fixtureId === 'cropped-ambiguous-shape';
  document.getElementById('correction-stroller-art').hidden = !isStroller;
  document.getElementById('correction-symbol').hidden = isStroller || isAmbiguous;
  document.getElementById('correction-stroller-art').style.display = isStroller ? 'block' : 'none';
  document.getElementById('correction-symbol').style.display = !isStroller && !isAmbiguous ? 'block' : 'none';
  document.getElementById('correction-ambiguity-art').hidden = !isAmbiguous;
  document.getElementById('correction-ambiguity-art').style.display = isAmbiguous ? 'block' : 'none';
  document.getElementById('correction-symbol').textContent = isAmbiguous ? '⌒' : '✿';
  document.getElementById('correction-observed').textContent = correctionLabels[record.observedCode];
  document.getElementById('correction-hypothesis').textContent = correctionLabels[record.hypothesisCode];
  document.getElementById('correction-gap').textContent = correctionLabels[record.evidenceGap];
  const state = document.getElementById('correction-state');
  state.dataset.state = record.state;
  state.textContent = held ? 'Prüfung offen' : record.state === correctionApi.PRIVACY_STATES.REJECTED ? 'Verdacht verworfen' : record.state === correctionApi.PRIVACY_STATES.CORRECTED ? (isAmbiguous ? 'Mehrdeutigkeit festgehalten' : 'Beschreibung korrigiert') : 'Beschreibung bestätigt';
  state.classList.toggle('done', !held);
  const messages = {
    HOLD:'Offen: keine Aussage über eine Person und keine Außenwirkung.',
    HUMAN_REJECTED_RECORDED:'Verdacht als unbelegt verworfen. Die ursprüngliche Vermutung bleibt im minimierten Prüfbeleg sichtbar.',
    HUMAN_CORRECTED_RECORDED:isAmbiguous ? 'Der Ausschnitt unterscheidet Bumerang und Griff nicht. Beide Deutungen bleiben offen. Keine automatische Außenhandlung.' : 'Korrigiert auf die sichtbare Objektform. Keine automatische Außenhandlung.',
    HUMAN_APPROVED_RECORD_ONLY:'Nur die begrenzte Formbeschreibung wurde intern bestätigt. Keine automatische Außenhandlung.'
  };
  document.getElementById('correction-result').textContent = messages[record.state];
  correctionButtons.reject.disabled = !held || isAmbiguous;
  correctionButtons.correct.disabled = !held;
  correctionButtons.approve.disabled = !held || isStroller || isAmbiguous;
  correctionButtons.correct.textContent = isAmbiguous ? 'Mehrdeutig lassen' : 'Auf Form korrigieren';
  document.getElementById('correction-note').textContent = isAmbiguous
    ? 'Bestätigen ist gesperrt: Der fehlende Kontext lässt zwei Deutungen offen.'
    : isStroller
    ? 'Bestätigen ist gesperrt: Aus einer Kinderwagenform folgt keine Aussage über eine Person.'
    : 'Bestätigen betrifft nur die Beschreibung dieser erfundenen Form.';
  document.getElementById('correction-receipt').textContent = JSON.stringify(correctionApi.createMinimizedReceipt(record), null, 2);
}
function resetCorrection() {
  let nextRecord;
  try {
    nextRecord = correctionApi.createSyntheticObservation(correctionSelect.value);
  } catch {
    correctionRecord = null;
    for (const id of ['correction-observed','correction-hypothesis','correction-gap','correction-note','correction-receipt']) document.getElementById(id).textContent = '';
    document.getElementById('correction-stroller-art').style.display = 'none';
    document.getElementById('correction-symbol').style.display = 'none';
    document.getElementById('correction-ambiguity-art').style.display = 'none';
    document.getElementById('correction-state').dataset.state = 'INVALID_FIXTURE';
    document.getElementById('correction-state').textContent = 'Testfall ungültig';
    document.getElementById('correction-result').textContent = 'Dieser Testfall gehört nicht zum festen lokalen Satz. Bitte einen gültigen Fall auswählen.';
    correctionButtons.reject.disabled = correctionButtons.correct.disabled = correctionButtons.approve.disabled = true;
    correctionButtons.reset.disabled = false;
    return;
  }
  correctionRecord = nextRecord;
  renderCorrection();
}
if (correctionApi) {
  correctionSelect.addEventListener('change', resetCorrection);
  correctionButtons.reset.addEventListener('click', resetCorrection);
  correctionButtons.reject.addEventListener('click', () => { correctionRecord = correctionApi.reviewSyntheticObservation(correctionRecord, {kind:'REJECT'}); renderCorrection(); });
  correctionButtons.correct.addEventListener('click', () => { correctionRecord = correctionApi.reviewSyntheticObservation(correctionRecord, {kind:'CORRECT',correctedCode:correctionRecord.fixtureId === 'cropped-ambiguous-shape' ? 'UNKNOWN' : 'OBJECT_ONLY'}); renderCorrection(); });
  correctionButtons.approve.addEventListener('click', () => { correctionRecord = correctionApi.reviewSyntheticObservation(correctionRecord, {kind:'APPROVE'}); renderCorrection(); });
  resetCorrection();
} else {
  document.getElementById('correction-result').textContent = 'Das lokale Korrekturmodul konnte nicht geladen werden.';
  Object.values(correctionButtons).forEach(button => { button.disabled = true; });
}

const objects = {
  flower: {code:'01 / 04',title:'Eine Blume.',observation:'In der gezeichneten Szene steht eine blütenartige Form.',hypothesis:'Blume ist eine mögliche Objektbeschreibung, keine Aussage über Gefahr oder Zweck.',question:'Welche Merkmale zeigt die Szene wirklich? Gibt es eine andere plausible Form?',next:'Beschreibung gegen die Zeichnung und eine zweite Lesart prüfen.',status:'REVIDIERBARE BESCHREIBUNG'},
  boomerang: {code:'02 / 04',title:'Ein Bumerang.',observation:'Eine gekrümmte Form ist als Testobjekt platziert.',hypothesis:'Das Label „Bumerang“ bleibt eine Deutung der Form.',question:'Könnte es ein anderes Objekt mit ähnlicher Silhouette sein?',next:'Andere Ansichten oder eine bewusst abweichende Testform vergleichen.',status:'GEGENHYPOTHESE OFFEN'},
  stroller: {code:'03 / 04',title:'Ein Kinderwagen.',observation:'Eine wagenartige Testform ist vorhanden. Über eine Person darin sagt das Bild nichts.',hypothesis:'Die Objekterkennung darf keine Identität oder Situation eines Menschen ergänzen.',question:'Würde die Darstellung Personen oder Kontextinformationen preisgeben?',next:'Vor einer Speicherung die Datenschutzabdeckung getrennt prüfen.',status:'DATENSCHUTZ-PRÜFUNG'},
  unknown: {code:'04 / 04',title:'Etwas Unbekanntes.',observation:'Die Testform passt zu keinem fest gebundenen Label.',hypothesis:'„Unbekannt“ ist ein zulässiges Ergebnis, kein automatisches Warnsignal.',question:'Welche zusätzliche, erlaubte Beobachtung könnte zwei Deutungen unterscheiden?',next:'Offen lassen und eine neue, zweckgebundene Gegenprobe planen.',status:'UNKNOWN BLEIBT OFFEN'}
};
const output = {code:document.getElementById('inspection-code'),title:document.getElementById('inspection-title'),observation:document.getElementById('inspection-observation'),hypothesis:document.getElementById('inspection-hypothesis'),question:document.getElementById('inspection-question'),next:document.getElementById('inspection-next'),status:document.getElementById('inspection-status')};
for (const button of document.querySelectorAll('[data-object]')) {
  button.addEventListener('click', () => {
    const item=objects[button.dataset.object];
    for(const key of Object.keys(output)) output[key].textContent=item[key];
    document.querySelectorAll('[data-object]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
  });
}

const witnessButton=document.getElementById('witness-button');
witnessButton.addEventListener('click',()=>{
  const visual=document.getElementById('witness-visual');
  const revealed=visual.classList.toggle('revealed');
  document.getElementById('witness-result').textContent=revealed?'3 Weitergaben · 1 deklarierter Ursprung':'3 Meldungen · Herkunft noch ungeklärt';
  witnessButton.textContent=revealed?'Ansicht zurücksetzen ↺':'Herkunft aufdecken ↗';
  witnessButton.setAttribute('aria-pressed',String(revealed));
});

const timeButton=document.getElementById('time-button');
timeButton.addEventListener('click',()=>{
  const later=timeButton.getAttribute('aria-pressed')!=='true';
  timeButton.setAttribute('aria-pressed',String(later));
  document.getElementById('time-label').textContent=later?'T₁ / SPÄTERE LAGE':'T₀ / EINGANGSMELDUNG';
  document.getElementById('time-head').textContent=later?'Der aktuelle Kontext ist offen.':'Ein Ereignis wurde gemeldet.';
  document.getElementById('time-copy').textContent=later?'Ein früherer Herkunftshinweis ist keine aktuelle Orts-, Personen- oder Folgenprüfung. Neue Beobachtung und zuständige menschliche Entscheidung sind getrennte Schritte.':'Quelle, Erfassungszeit und ursprünglicher Kontext müssen zuerst gebunden werden.';
  document.getElementById('time-state').textContent=later?'STATUS: REVALIDIEREN · KEINE AUTOMATISCHE FOLGE':'STATUS: MELDUNG · GEGENWART OFFEN';
  timeButton.textContent=later?'Zum Ausgangspunkt zurück ↺':'Späteren Zustand ansehen →';
});

const butterflies=[...document.querySelectorAll('.butterfly')];
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const positions=[{x:.26,y:.38,ax:.15,ay:.14,s:1.05},{x:.42,y:.29,ax:.13,ay:.20,s:.82},{x:.61,y:.48,ax:.17,ay:.13,s:.67},{x:.73,y:.32,ax:.12,ay:.16,s:.94},{x:.54,y:.68,ax:.14,ay:.10,s:.73}];
function render(t){
  const rect=document.getElementById('sim-world').getBoundingClientRect();
  positions.forEach((p,i)=>{const time=t*.00045*p.s+i*1.9;const x=(p.x+Math.sin(time)*p.ax)*rect.width;const y=(p.y+Math.sin(time*1.29+i)*p.ay)*rect.height;butterflies[i].style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${(Math.sin(time*1.3)*20).toFixed(1)}deg)`;});
  if(!reducedMotion.matches)requestAnimationFrame(render);
}
render(0);
reducedMotion.addEventListener('change',()=>{if(!reducedMotion.matches)requestAnimationFrame(render);});
