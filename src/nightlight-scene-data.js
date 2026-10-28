// Spatial anchors are authored coordinates in a synthetic scene (metres).
// They bind the visible markers across all camera views; they are not sensor data.
export const ANCHORS = Object.freeze({
  drone: Object.freeze([2.1, 3.45, 3.2]),
  question: Object.freeze([0, 0.08, -1.35]),
  reportA: Object.freeze([-3.9, 0.25, 1.7]),
  reportB: Object.freeze([4.3, 0.25, 2.2]),
  reportC: Object.freeze([3.9, 0.25, -5.8]),
  review: Object.freeze([-5.2, 0.25, -5.3])
});

export const VIEWS = Object.freeze([
  Object.freeze({
    id: 'ort', number: '01', name: 'Am Hilfsweg', subtitle: 'Was ist die Lage?',
    camera: [10, 8.2, 14], lookAt: [0, 0.7, -1],
    heading: 'Eine Meldung ist noch kein Lagebild.',
    description: 'Nach einem Unwetter heißt es, der Hilfsweg sei möglicherweise versperrt. Die markierte Stelle ist eine offene Frage in dieser erfundenen Szene – kein bestätigtes Hindernis.',
    focus: 'question', status: 'LAGE OFFEN'
  }),
  Object.freeze({
    id: 'blick', number: '02', name: 'Blick der Drohne', subtitle: 'Ein Ausschnitt bleibt begrenzt',
    camera: [2.1, 3.35, 3.2], lookAt: [0, 0.15, -1.35],
    heading: 'Der Blick zeigt einen Ausschnitt.',
    description: 'Die Kamera-Perspektive macht eine Stelle sichtbar. Sie beweist weder den Zustand des ganzen Wegs noch eine automatische Erkennung. Hier werden nur modellierte Objekte gezeigt.',
    focus: 'drone', status: 'AUSSCHNITT'
  }),
  Object.freeze({
    id: 'herkunft', number: '03', name: 'Herkunft der Meldungen', subtitle: 'Drei Meldungen, zwei Ursprünge',
    camera: [0.1, 17, 9], lookAt: [0, 0, -1.5],
    heading: 'B übernimmt A. C ist von gestern.',
    description: 'A meldet um 10:02 ein mögliches Hindernis. B leitet um 10:04 dieselbe Meldung weiter: keine zweite Beobachtung. C meldet „frei“, aber für den Vortag.',
    focus: 'reportA', status: '1 KOPIE · 1 ALTER HINWEIS'
  }),
  Object.freeze({
    id: 'entscheidung', number: '04', name: 'Menschliche Prüfung', subtitle: 'Nicht vorschnell schließen',
    camera: [-9, 8.8, 13], lookAt: [0, 0.8, -1.4],
    heading: 'Eine zuständige Person prüft neu.',
    description: 'Das Modell hält die aktuelle Weglage offen und zeigt, welche Information fehlt: eine frische, unabhängige Prüfung. Erst danach kann eine verantwortliche Person handeln.',
    focus: 'review', status: 'NÄCHSTER SCHRITT: PRÜFEN'
  })
]);
