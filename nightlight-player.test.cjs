const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function boot({ failedBeforeScript = false, reduced = false } = {}) {
  const events = {}, documentEvents = {};
  let plays = 0, pauses = 0;
  const video = { error: failedBeforeScript ? {code: 4} : null, hidden: false,
    addEventListener(name, handler) { events[name] = handler; },
    play() { plays++; return Promise.resolve(); }, pause() { pauses++; } };
  const fallback = { hidden: true }, message = { hidden: true };
  const document = { hidden: false,
    getElementById(id) { return {'night-video': video, 'night-fallback': fallback, 'night-status': message}[id]; },
    addEventListener(name, handler) { documentEvents[name] = handler; } };
  const window = {matchMedia() {return {matches: reduced, addEventListener() {}};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'dist/nightlight-3d.js'), 'utf8'), {document, window}, {timeout: 1000});
  return {video, fallback, message, events, documentEvents, document, counts: () => ({plays, pauses})};
}
test('a media error predating deferred player initialization immediately shows the new poster', () => {
  const x = boot({failedBeforeScript: true});
  assert.equal(x.video.hidden, true);
  assert.equal(x.fallback.hidden, false);
  assert.equal(x.message.hidden, false);
  assert.equal(x.counts().plays, 0);
});
test('a later media error also shows the poster while a healthy load keeps it hidden', () => {
  const x = boot();
  assert.equal(x.video.hidden, false);
  assert.equal(x.fallback.hidden, true);
  assert.equal(x.message.hidden, true);
  assert.equal(x.counts().plays, 1);
  x.video.error = {code: 4}; x.events.error();
  assert.equal(x.video.hidden, true);
  assert.equal(x.fallback.hidden, false);
  assert.equal(x.message.hidden, false);
});
test('reduced motion suppresses autoplay and hiding the page pauses playback', () => {
  const x = boot({reduced: true});
  assert.equal(x.counts().plays, 0);
  x.document.hidden = true; x.documentEvents.visibilitychange();
  assert.equal(x.counts().pauses, 1);
});
