import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ANCHORS, VIEWS } from './src/nightlight-scene-data.js';

test('one synthetic source state has stable, finite, distinct anchors', () => {
  const names = Object.keys(ANCHORS);
  assert.deepEqual(names.sort(), ['drone', 'question', 'reportA', 'reportB', 'reportC', 'review'].sort());
  const positions = names.map(name => ANCHORS[name]);
  for (const point of positions) {
    assert.equal(point.length, 3);
    assert.ok(point.every(Number.isFinite));
  }
  assert.equal(new Set(positions.map(point => point.join(','))).size, positions.length);
});

test('four distinct cameras project the same source IDs without mutating the source', () => {
  assert.deepEqual(VIEWS.map(view => view.id), ['ort', 'blick', 'herkunft', 'entscheidung']);
  assert.equal(new Set(VIEWS.map(view => view.camera.join(','))).size, 4);
  const before = JSON.stringify(ANCHORS);
  const projections = new Map();
  for (const view of VIEWS) {
    assert.ok(Object.hasOwn(ANCHORS, view.focus));
    const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 100);
    camera.position.set(...view.camera);
    camera.lookAt(...view.lookAt);
    camera.updateMatrixWorld();
    const observed = new Map();
    for (const [id, coordinates] of Object.entries(ANCHORS)) {
      const point = new THREE.Vector3(...coordinates).project(camera);
      assert.ok([point.x, point.y, point.z].every(Number.isFinite), `${view.id} / ${id}`);
      observed.set(id, [point.x, point.y, point.z]);
    }
    assert.deepEqual([...observed.keys()].sort(), Object.keys(ANCHORS).sort());
    projections.set(view.id, observed);
  }
  assert.equal(JSON.stringify(ANCHORS), before);
  const question = [...projections.values()].map(view => view.get('question').map(n => n.toFixed(4)).join(','));
  assert.equal(new Set(question).size, 4);
});
