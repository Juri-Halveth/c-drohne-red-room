import * as THREE from 'three';
import { ANCHORS, VIEWS } from './nightlight-scene-data.js';

const stage = document.getElementById('scene-stage');
const canvas = document.getElementById('scene-canvas');
const fallback = document.getElementById('scene-fallback');
const buttons = [...document.querySelectorAll('.view-buttons button[data-view]')];
const title = document.getElementById('view-heading');
const description = document.getElementById('view-description');
const counter = document.getElementById('view-counter');
const status = document.getElementById('view-status');
const previous = document.getElementById('view-prev');
const next = document.getElementById('view-next');
const labels = [...stage.querySelectorAll('[data-anchor]')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const anchor = name => new THREE.Vector3(...ANCHORS[name]);
const VISIBLE_LABELS = {
  ort: new Set(['drone', 'question']),
  blick: new Set(['question']),
  herkunft: new Set(['reportA', 'reportB', 'reportC']),
  entscheidung: new Set(['review', 'question'])
};
let active = 0;

function selectView(index) {
  active = (index + VIEWS.length) % VIEWS.length;
  const view = VIEWS[active];
  buttons.forEach(button => {
    const selected = button.dataset.view === view.id;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('selected', selected);
  });
  title.textContent = view.heading;
  description.textContent = view.description;
  counter.textContent = `${view.number} / 04`;
  status.textContent = view.status;
  stage.dataset.view = view.id;
  if (drone) drone.visible = view.id === 'ort' || view.id === 'entscheidung';
  labels.forEach(label => label.classList.toggle('focused', label.dataset.anchor === view.focus));
  if (camera && reducedMotion.matches) snapCamera(view);
}

buttons.forEach((button, index) => button.addEventListener('click', () => selectView(index)));
previous.addEventListener('click', () => selectView(active - 1));
next.addEventListener('click', () => selectView(active + 1));
stage.addEventListener('keydown', event => {
  if (event.target instanceof HTMLButtonElement && event.key === 'ArrowRight') {
    event.preventDefault(); selectView(active + 1); buttons[active].focus();
  } else if (event.target instanceof HTMLButtonElement && event.key === 'ArrowLeft') {
    event.preventDefault(); selectView(active - 1); buttons[active].focus();
  }
});

let renderer, scene, camera, drone, rotors = [], aim;
const cameraTarget = new THREE.Vector3();

function snapCamera(view) {
  camera.position.set(...view.camera);
  cameraTarget.set(...view.lookAt);
  camera.lookAt(cameraTarget);
  updateLabels();
  renderer?.render(scene, camera);
}

function material(color, metalness = 0, roughness = 0.7, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
}

function box(parent, name, width, height, depth, x, y, z, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  mesh.name = name; mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}

function line(parent, start, end, color, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...start), new THREE.Vector3(...end)]);
  const object = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
  parent.add(object); return object;
}

function cylinderBetween(parent, name, start, end, radius, mat) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 12), mat);
  mesh.name = name;
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  parent.add(mesh); return mesh;
}

function marker(parent, name, position, color) {
  const group = new THREE.Group(); group.name = name; group.position.set(...position); parent.add(group);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.028, 8, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.86 }));
  ring.rotation.x = -Math.PI / 2; group.add(ring);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12), new THREE.MeshBasicMaterial({ color }));
  core.position.y = 0.13; group.add(core);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }));
  stem.position.y = 0.3; group.add(stem);
  return group;
}

function buildCity() {
  const ground = material(0x183443, 0.08, 0.95);
  const street = material(0x254553, 0.13, 0.83);
  const walk = material(0x43606a, 0.07, 0.86);
  const bright = new THREE.MeshBasicMaterial({ color: 0x6ed4dd });
  const warm = new THREE.MeshBasicMaterial({ color: 0xf6b765 });
  box(scene, 'terrain', 42, 0.12, 42, 0, -0.14, 0, ground);
  box(scene, 'Hilfsweg', 4.5, 0.08, 22, 0, -0.035, 0, street);
  for (const x of [-2.34, 2.34]) {
    box(scene, 'Wegkante', 0.11, 0.09, 22, x, 0.025, 0, bright);
    box(scene, 'Gehweg', 2.8, 0.11, 22, x < 0 ? -3.8 : 3.8, 0.015, 0, walk);
  }
  for (let z = -10; z <= 10; z += 1.6) box(scene, 'Wegmarkierung', 0.055, 0.014, 0.74, 0, 0.018, z, warm);
  for (let z = -9.6; z <= 9.6; z += 1.3) {
    const mat = z % 2 < 1 ? bright : warm;
    for (const x of [-5.36, 5.36]) box(scene, 'Pflasterkante', 0.09, 0.008, 0.44, x, 0.08, z, mat);
  }
  const facade = [material(0x24485b, 0.12, 0.72), material(0x193947, 0.1, 0.8), material(0x355467, 0.1, 0.75)];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z = -10 + i * 4.1;
      const h = 2.2 + ((i * 7 + (side + 1) * 3) % 4) * 0.65;
      const x = side * (9.2 + (i % 2) * 0.65);
      box(scene, 'Gebäude ' + side + '/' + i, 2.15, h, 2.45, x, h / 2, z, facade[(i + side + 3) % 3]);
      for (let row = 0; row < Math.floor(h / 0.9); row++) {
        const y = 0.75 + row * 0.86;
        const windowMat = (i + row) % 4 === 0 ? warm : bright;
        box(scene, 'Fenster', 0.032, 0.36, 0.36, x - side * 1.1, y, z - 0.5, windowMat);
        box(scene, 'Fenster', 0.032, 0.36, 0.36, x - side * 1.1, y, z + 0.5, windowMat);
      }
    }
  }
  for (const z of [-7, 2.5, 8.5]) {
    for (const side of [-1, 1]) {
      const x = side * 5.35;
      cylinderBetween(scene, 'Leuchte', [x, 0.2, z], [x, 3.0, z], 0.045, material(0xa1b2bd, 0.6, 0.35));
      box(scene, 'Leuchtenkopf', 0.36, 0.08, 0.36, x, 3.02, z, new THREE.MeshBasicMaterial({ color: 0xffdd9d }));
      const point = new THREE.PointLight(0xffc88b, 13, 7, 2); point.position.set(x, 2.9, z); scene.add(point);
    }
  }
  // A question is drawn as a translucent, partial footprint; no obstacle is asserted.
  const uncertainty = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.015, 64), new THREE.MeshBasicMaterial({ color: 0xf2a85f, transparent: true, opacity: 0.2, depthWrite: false }));
  uncertainty.position.copy(anchor('question')); scene.add(uncertainty);
  const questionRing = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.025, 6, 64), new THREE.MeshBasicMaterial({ color: 0xfbb472, transparent: true, opacity: 0.85 }));
  questionRing.rotation.x = -Math.PI / 2; questionRing.position.copy(anchor('question')).add(new THREE.Vector3(0, 0.05, 0)); scene.add(questionRing);
  marker(scene, 'Quelle A', ANCHORS.reportA, 0x65e6e1);
  marker(scene, 'Weitergabe B', ANCHORS.reportB, 0xf0b374);
  marker(scene, 'Alter Hinweis C', ANCHORS.reportC, 0x8c9ac9);
  marker(scene, 'Prüfstelle', ANCHORS.review, 0xe05e7b);
  const copyPath = new THREE.QuadraticBezierCurve3(anchor('reportA').add(new THREE.Vector3(0, 0.4, 0)), new THREE.Vector3(0, 1.2, 4), anchor('reportB').add(new THREE.Vector3(0, 0.4, 0)));
  const copy = new THREE.Line(new THREE.BufferGeometry().setFromPoints(copyPath.getPoints(36)), new THREE.LineDashedMaterial({ color: 0xf0b374, dashSize: 0.18, gapSize: 0.14, transparent: true, opacity: 0.88 }));
  copy.computeLineDistances(); copy.name = 'Weitergabe A nach B'; scene.add(copy);
  line(scene, [...ANCHORS.reportC], [...ANCHORS.review], 0x8c9ac9, 0.45);
}

function buildDrone() {
  drone = new THREE.Group(); drone.name = 'C-DROHNE / synthetisches Modell'; drone.position.copy(anchor('drone')); scene.add(drone);
  const body = material(0x9cd8df, 0.72, 0.28);
  const frame = material(0x122b38, 0.7, 0.34);
  const lens = material(0x080f1c, 0.65, 0.08, { emissive: 0x247e9a, emissiveIntensity: 0.35 });
  box(drone, 'Gehäuse', 0.9, 0.22, 0.58, 0, 0, 0, body);
  box(drone, 'Oberdeck', 0.55, 0.06, 0.36, 0, 0.14, 0, frame);
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    cylinderBetween(drone, 'Arm', [x * 0.32, 0, z * 0.18], [x * 0.78, 0.045, z * 0.58], 0.047, frame);
    const rotor = new THREE.Group(); rotor.position.set(x * 0.79, 0.1, z * 0.59); drone.add(rotor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.026, 8, 36), body); ring.rotation.x = -Math.PI / 2; rotor.add(ring);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 16), frame); rotor.add(hub);
    const blades = new THREE.Group(); rotor.add(blades);
    box(blades, 'Rotorblatt', 0.5, 0.012, 0.06, 0, 0.05, 0, body);
    box(blades, 'Rotorblatt', 0.06, 0.012, 0.5, 0, 0.05, 0, body);
    rotors.push(blades);
  }
  for (const x of [-0.28, 0.28]) cylinderBetween(drone, 'Landebein', [x, -0.07, 0.18], [x, -0.39, 0.34], 0.028, frame);
  const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), frame); gimbal.position.set(0, -0.22, 0.05); drone.add(gimbal);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 16), lens); glass.scale.set(1, 0.72, 0.52); glass.position.set(0, -0.26, 0.2); drone.add(glass);
  const sensor = new THREE.SpotLight(0x8feaf2, 30, 8, Math.PI / 7, 0.7, 2);
  sensor.position.set(0, -0.2, 0); sensor.target.position.set(-1.25, -3.45, -4.55); drone.add(sensor); drone.add(sensor.target);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.55, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x67e7ee, transparent: true, opacity: 0.065, side: THREE.DoubleSide, depthWrite: false }));
  cone.rotation.z = Math.PI; cone.position.set(-0.72, -1.78, -1.05); drone.add(cone);
}

function updateLabels() {
  if (!camera || !renderer) return;
  const width = stage.clientWidth, height = stage.clientHeight;
  for (const label of labels) {
    const point = anchor(label.dataset.anchor);
    if (label.dataset.anchor === 'drone') point.y += 0.75;
    else point.y += 0.82;
    point.project(camera);
    const visible = VISIBLE_LABELS[VIEWS[active].id].has(label.dataset.anchor)
      && point.z > -1 && point.z < 1 && Math.abs(point.x) < 0.96 && Math.abs(point.y) < 0.91;
    label.hidden = !visible;
    if (visible) {
      label.style.left = `${(point.x * 0.5 + 0.5) * width}px`;
      label.style.top = `${(-point.y * 0.5 + 0.5) * height}px`;
    }
  }
}

function init3D() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1e2a);
  scene.fog = new THREE.Fog(0x0a1e2a, 15, 40);
  scene.add(new THREE.HemisphereLight(0xb2eff0, 0x193743, 3.6));
  const sun = new THREE.DirectionalLight(0xffffff, 3.4); sun.position.set(-4, 10, 8); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x44d8ed, 2.2); rim.position.set(8, 8, -5); scene.add(rim);
  camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
  buildCity(); buildDrone();
  const resize = () => {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix(); updateLabels(); renderer.render(scene, camera);
  };
  new ResizeObserver(resize).observe(stage);
  snapCamera(VIEWS[active]); resize();
  stage.classList.add('webgl-ready'); fallback.hidden = true;
  let last = 0;
  function frame(time) {
    const dt = Math.min(0.05, (time - last) / 1000 || 0); last = time;
    if (!document.hidden) {
      const view = VIEWS[active];
      if (!reducedMotion.matches) {
        const desired = new THREE.Vector3(...view.camera);
        camera.position.lerp(desired, Math.min(1, dt * 3.7));
        cameraTarget.lerp(new THREE.Vector3(...view.lookAt), Math.min(1, dt * 3.7));
        camera.lookAt(cameraTarget);
        rotors.forEach((rotor, i) => { rotor.rotation.y += dt * (i % 2 ? -17 : 17); });
        drone.position.y = ANCHORS.drone[1] + Math.sin(time / 750) * 0.045;
      }
      updateLabels(); renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

selectView(0);
try { init3D(); } catch (error) {
  console.warn('3D-Ansicht nicht verfügbar; Text und Lageplan bleiben sichtbar.', error);
  canvas.hidden = true;
  fallback.hidden = false;
  stage.classList.add('webgl-unavailable');
}
