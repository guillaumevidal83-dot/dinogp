import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex, mulberry32 } from './util.js';

const TAU = Math.PI * 2;
const matCache = new Map();
export function std(color, rough = 0.7, metal = 0, extra) {
  const key = color + '|' + rough + '|' + metal + (extra ? JSON.stringify(extra) : '');
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra || {})); matCache.set(key, m); }
  return m;
}
const paintCache = new Map();
function paint(color) {
  let m = paintCache.get(color);
  if (!m) { m = new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }); paintCache.set(color, m); }
  return m;
}
const glass = () => std('#9fc8e8', 0.05, 0.1, { transparent: true, opacity: 0.35 });
const glow = (c) => new THREE.MeshBasicMaterial({ color: c });

function box(mat, w, h, d, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true;
  if (parent) parent.add(m);
  return m;
}
function cyl(mat, rt, rb, h, x = 0, y = 0, z = 0, parent, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z); m.castShadow = true;
  if (parent) parent.add(m);
  return m;
}
const sphG = new THREE.SphereGeometry(1, 22, 16);
function ell(mat, sx, sy, sz, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(sphG, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true;
  if (parent) parent.add(m);
  return m;
}
function coneM(mat, r, h, x, y, z, rx = 0, ry = 0, rz = 0, parent, seg = 8) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true;
  if (parent) parent.add(m);
  return m;
}
function limb(a, b, r, mat, parent) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, len, 8), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  parent.add(m);
  return m;
}

/* ===================== Roues ===================== */
const wheelGeoCache = new Map();
function wheelGeo(r, w, tread) {
  const key = r + '|' + w + '|' + tread;
  let g = wheelGeoCache.get(key);
  if (g) return g;
  const parts = [];
  const t = new THREE.CylinderGeometry(r, r, w, 28);
  t.rotateZ(Math.PI / 2);
  parts.push(t);
  if (tread) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const b = new THREE.BoxGeometry(w * 0.95, r * 0.14, r * 0.2);
      b.rotateX(a);
      b.translate(0, Math.cos(a) * r, Math.sin(a) * r);
      parts.push(b);
    }
  }
  g = mergeGeometries(parts, false);
  wheelGeoCache.set(key, g);
  return g;
}
function makeWheel(r, w, opt = {}) {
  const pivot = new THREE.Group(), spin = new THREE.Group();
  pivot.add(spin);
  const tire = new THREE.Mesh(wheelGeo(r, w, opt.tread !== false), std(opt.tire || '#17181b', 0.95));
  tire.castShadow = true;
  spin.add(tire);
  const rim = cyl(std(opt.rim || '#c9ccd1', 0.3, 0.9), r * 0.58, r * 0.58, w * 1.03, 0, 0, 0, spin, 18);
  rim.rotation.z = Math.PI / 2;
  const hub = cyl(std('#3b3f46', 0.4, 0.8), r * 0.22, r * 0.22, w * 1.1, 0, 0, 0, spin, 10);
  hub.rotation.z = Math.PI / 2;
  // quelques rayons pour voir la rotation
  for (let i = 0; i < 5; i++) {
    const s = box(std(opt.rim || '#c9ccd1', 0.3, 0.9), w * 0.5, r * 0.9, r * 0.1, 0, 0, 0, spin);
    s.rotation.x = (i / 5) * Math.PI;
    s.castShadow = false;
  }
  return { pivot, spin, r };
}

/* ===================== Karts ===================== */

/* ===================== Bateaux (carte marine) ===================== */
function makeBoat(vehIdx, color) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const P = paint(color), dk = std('#23262b', 0.6, 0.4), chrome = std('#d4d7dc', 0.2, 1), white = std('#f4f6f8', 0.45, 0.1), wood = std('#8a5a32', 0.85);
  const props = [];
  const out = { root, body, wheels: [], props, seat: new THREE.Vector3(0, 0.88, -0.4), exhaust: new THREE.Vector3(0, 0.9, -2.6), len: 5.2, wheelOnWheel: null };
  const outboard = (x, z, s = 1) => {
    box(dk, 0.55 * s, 0.7 * s, 0.6 * s, x, 0.95, z, body);
    cyl(dk, 0.09 * s, 0.09 * s, 1.2 * s, x, 0.25, z - 0.12, body, 8);
    const g = new THREE.Group(); g.position.set(x, -0.3, z - 0.3); body.add(g);
    for (let i = 0; i < 3; i++) { const b = box(chrome, 0.05, 0.55 * s, 0.05, 0, 0, 0, g); b.rotation.z = (i * TAU) / 3; }
    props.push(g);
  };
  switch (vehIdx) {
    case 0: { // Canot safari
      ell(P, 1.2, 0.62, 2.6, 0, 0.33, 0, body);
      box(white, 1.95, 0.1, 3.9, 0, 0.8, -0.1, body);
      box(dk, 1.0, 0.35, 0.7, 0, 1.0, -0.95, body);
      const ws = box(glass(), 1.8, 0.7, 0.05, 0, 1.25, 1.0, body); ws.rotation.x = -0.3; ws.castShadow = false;
      box(P, 0.1, 0.6, 1.4, 0.95, 1.1, -0.2, body); box(P, 0.1, 0.6, 1.4, -0.95, 1.1, -0.2, body);
      box(P, 2.0, 0.1, 1.5, 0, 1.45, -0.3, body); // auvent
      outboard(0, -2.65);
      out.seat.set(0, 0.86, -0.4); out.len = 5.4;
      break;
    }
    case 1: { // Hors-bord éclair
      ell(P, 0.95, 0.5, 3.3, 0, 0.3, 0, body);
      coneM(P, 0.85, 2.0, 0, 0.32, 3.7, Math.PI / 2, 0, 0, body, 10).scale.set(1, 1, 0.55);
      box(white, 0.5, 0.05, 5.2, 0, 0.8, 0.3, body);
      box(dk, 1.3, 0.1, 1.6, 0, 0.74, -0.7, body);
      const ws = box(glass(), 1.4, 0.55, 0.05, 0, 1.1, 0.85, body); ws.rotation.x = -0.45; ws.castShadow = false;
      box(P, 0.08, 1.0, 1.1, 0, 1.2, -2.7, body); // aileron
      outboard(0.45, -3.4, 0.9); outboard(-0.45, -3.4, 0.9);
      out.seat.set(0, 0.8, -0.6); out.exhaust.set(0, 0.9, -3.8); out.len = 7.2;
      break;
    }
    case 2: { // Catamaran monster
      for (const s of [-1, 1]) { cyl(P, 0.62, 0.62, 5.2, s * 1.35, 0.42, 0, body, 14).rotation.x = Math.PI / 2; coneM(P, 0.62, 1.2, s * 1.35, 0.42, 3.3, Math.PI / 2, 0, 0, body, 14); }
      box(dk, 3.7, 0.22, 4.3, 0, 1.05, -0.2, body);
      box(wood, 3.3, 0.06, 3.9, 0, 1.2, -0.2, body);
      for (const s of [-1, 1]) { box(chrome, 0.12, 1.5, 0.12, s * 1.4, 1.95, 0.9, body); box(chrome, 0.12, 1.5, 0.12, s * 1.4, 1.95, -1.4, body); }
      box(chrome, 2.9, 0.12, 0.12, 0, 2.7, 0.9, body); box(chrome, 2.9, 0.12, 0.12, 0, 2.7, -1.4, body);
      outboard(1.0, -2.55, 1.2); outboard(-1.0, -2.55, 1.2);
      out.seat.set(0, 1.2, -0.3); out.exhaust.set(0, 1.2, -2.9); out.len = 6.4;
      break;
    }
    case 3: { // Jet-ski
      ell(P, 0.72, 0.42, 2.2, 0, 0.35, 0, body);
      coneM(P, 0.62, 1.4, 0, 0.45, 2.5, Math.PI / 2, 0, 0, body, 10).scale.set(1, 1, 0.5);
      box(white, 0.5, 0.06, 2.8, 0, 0.78, 0, body);
      box(dk, 0.55, 0.3, 1.3, 0, 0.88, -0.75, body);
      box(dk, 0.9, 0.08, 0.1, 0, 1.2, 0.85, body); cyl(dk, 0.05, 0.05, 0.45, 0, 1.0, 0.85, body, 6);
      const ws = box(glass(), 0.8, 0.45, 0.05, 0, 1.2, 1.3, body); ws.rotation.x = -0.5; ws.castShadow = false;
      cyl(chrome, 0.2, 0.26, 0.5, 0, 0.45, -2.35, body, 10).rotation.x = Math.PI / 2;
      out.seat.set(0, 0.92, -0.55); out.exhaust.set(0, 0.5, -2.7); out.len = 4.6;
      break;
    }
    default: { // Pirogue de pierre
      const stone = std('#8c7b66', 0.95);
      ell(stone, 1.25, 0.58, 2.6, 0, 0.32, 0, body);
      ell(wood, 1.05, 0.14, 2.3, 0, 0.8, 0, body);
      const rr = mulberry32(9);
      for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 + rr() * 0.12, 0), stone); m.position.set((rr() < 0.5 ? -1 : 1) * 1.05, 0.55 + rr() * 0.1, -1.8 + i * 0.6); m.castShadow = true; body.add(m); }
      coneM(P, 0.4, 1.6, 0, 1.0, 2.7, -0.6, 0, 0, body, 6); // proue sculptée
      box(P, 0.9, 0.55, 0.12, 0, 1.2, 2.3, body);
      for (const s of [-1, 1]) { cyl(wood, 0.05, 0.05, 2.6, s * 1.2, 1.1, -0.3, body, 6).rotation.z = s * 0.7; box(wood, 0.5, 0.05, 0.9, s * 2.2, 0.35, -0.3, body); }
      out.seat.set(0, 0.84, -0.3); out.exhaust.set(0, 0.9, -2.5); out.len = 5.4;
    }
  }
  const sh = new THREE.Mesh(new THREE.SphereGeometry(3.6, 20, 14), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  sh.position.y = 1.3; sh.visible = false; root.add(sh);
  out.shield = sh;
  return out;
}

export function makeKart(vehIdx, color, asBoat) {
  if (asBoat) return makeBoat(vehIdx, color);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const P = paint(color);
  const dk = std('#23262b', 0.6, 0.4), chrome = std('#d4d7dc', 0.2, 1);
  const wheels = [];
  const addWheel = (r, w, x, y, z, front, opt) => {
    const wh = makeWheel(r, w, opt);
    wh.pivot.position.set(x, y, z);
    if (x < 0) wh.spin.scale.x = -1; // reste cohérent
    root.add(wh.pivot);
    wheels.push({ pivot: wh.pivot, spin: wh.spin, front, r, side: Math.sign(x) });
    return wh;
  };
  const lamp = (x, y, z) => { const l = ell(glow('#fff4c2'), 0.16, 0.16, 0.1, x, y, z, body); l.castShadow = false; };
  const out = { root, body, wheels, seat: new THREE.Vector3(0, 1.3, -0.3), exhaust: new THREE.Vector3(0, 0.7, -2.2), len: 4.2, wheelOnWheel: null };

  switch (vehIdx) {
    case 0: { // Jeep Safari
      box(dk, 2.1, 0.45, 4.2, 0, 0.75, 0, body);
      box(P, 2.2, 0.6, 3.3, 0, 1.15, -0.2, body);
      box(P, 2.0, 0.42, 1.4, 0, 1.0, 1.6, body);
      box(P, 0.12, 0.5, 1.3, 1.05, 1.5, -0.3, body); box(P, 0.12, 0.5, 1.3, -1.05, 1.5, -0.3, body);
      const ws = box(glass(), 1.9, 0.75, 0.05, 0, 1.85, 0.75, body); ws.rotation.x = -0.25; ws.castShadow = false;
      box(dk, 2.0, 0.07, 0.08, 0, 2.22, 0.88, body).rotation.x = -0.25;
      for (const s of [-1, 1]) { cyl(chrome, 0.05, 0.05, 1.5, s * 0.95, 2.0, -1.2, body, 8); }
      cyl(chrome, 0.05, 0.05, 1.9, 0, 2.75, -1.2, body, 8).rotation.z = Math.PI / 2;
      box(std('#2e2a26', 0.9), 0.7, 0.2, 0.7, 0, 1.3, -0.45, body); box(std('#2e2a26', 0.9), 0.7, 0.8, 0.15, 0, 1.75, -0.85, body);
      box(dk, 2.3, 0.28, 0.35, 0, 0.65, 2.25, body); box(dk, 2.3, 0.28, 0.35, 0, 0.65, -2.2, body);
      lamp(0.7, 1.1, 2.3); lamp(-0.7, 1.1, 2.3);
      const sp = makeWheel(0.55, 0.4, {}); sp.pivot.position.set(0, 1.4, -2.3); sp.pivot.rotation.y = Math.PI / 2; body.add(sp.pivot);
      [[1.2, 1.35], [-1.2, 1.35], [1.2, -1.35], [-1.2, -1.35]].forEach(([x, z], i) => addWheel(0.62, 0.5, x, 0.62, z, z > 0));
      out.seat.set(0, 1.35, -0.35); out.len = 4.6;
      break;
    }
    case 1: { // Buggy Éclair
      box(P, 1.6, 0.22, 3.4, 0, 0.7, 0, body);
      box(P, 1.3, 0.45, 1.3, 0, 0.95, 1.7, body).rotation.x = 0.15;
      box(dk, 1.3, 0.9, 1.0, 0, 1.2, -1.5, body);
      for (const s of [-1, 1]) cyl(chrome, 0.07, 0.07, 3.0, s * 0.85, 1.05, 0.2, body, 8).rotation.x = Math.PI / 2;
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 8, 18, Math.PI), chrome);
      hoop.position.set(0, 0.9, -0.5); hoop.rotation.y = Math.PI / 2; hoop.castShadow = true; body.add(hoop);
      for (const s of [-1, 1]) { cyl(chrome, 0.05, 0.05, 1.0, s * 0.45, 1.4, -2.0, body, 8).rotation.z = 0; cyl(chrome, 0.06, 0.06, 1.4, s * 0.35, 0.95, -2.5, body, 8).rotation.x = Math.PI / 2; }
      box(P, 2.2, 0.08, 0.6, 0, 2.05, -2.35, body);
      box(dk, 0.08, 0.7, 0.3, 0.6, 1.7, -2.3, body); box(dk, 0.08, 0.7, 0.3, -0.6, 1.7, -2.3, body);
      box(std('#2e2a26', 0.9), 0.6, 0.15, 0.6, 0, 0.95, -0.4, body); box(std('#2e2a26', 0.9), 0.6, 0.6, 0.12, 0, 1.25, -0.75, body);
      lamp(0.4, 1.0, 2.3); lamp(-0.4, 1.0, 2.3);
      addWheel(0.8, 0.75, 1.35, 0.8, -1.4, false); addWheel(0.8, 0.75, -1.35, 0.8, -1.4, false);
      addWheel(0.55, 0.4, 1.1, 0.55, 1.6, true); addWheel(0.55, 0.4, -1.1, 0.55, 1.6, true);
      out.seat.set(0, 1.05, -0.35); out.exhaust.set(0, 1.0, -2.3); out.len = 4.6;
      break;
    }
    case 2: { // Monster Truck
      box(dk, 1.6, 0.4, 4.4, 0, 1.55, 0, body);
      box(P, 2.3, 0.9, 4.4, 0, 2.15, 0, body);
      box(P, 2.1, 0.5, 1.5, 0, 2.75, 1.6, body);
      const cab = box(glass(), 2.0, 1.0, 1.8, 0, 3.15, -0.5, body); cab.castShadow = false;
      for (const x of [-1, 1]) for (const z of [-1.4, 0.4]) box(dk, 0.1, 1.05, 0.1, x * 1.0, 3.15, z, body);
      box(P, 2.1, 0.12, 2.0, 0, 3.7, -0.5, body);
      for (let i = -1.5; i <= 1.5; i += 1) { const l = ell(glow('#fff4c2'), 0.14, 0.14, 0.14, i * 0.5, 3.85, 0.4, body); l.castShadow = false; }
      box(dk, 2.4, 0.5, 0.25, 0, 1.9, 2.35, body); box(dk, 2.4, 0.4, 0.25, 0, 1.9, -2.3, body);
      for (const s of [-1, 1]) cyl(chrome, 0.12, 0.12, 1.4, s * 0.6, 3.1, -1.7, body, 8);
      lamp(0.75, 2.4, 2.25); lamp(-0.75, 2.4, 2.25);
      box(std('#2e2a26', 0.9), 0.8, 0.2, 0.8, 0, 2.62, -0.5, body);
      [[1.55, 1.75], [-1.55, 1.75], [1.55, -1.7], [-1.55, -1.7]].forEach(([x, z]) => addWheel(1.15, 0.95, x, 1.15, z, z > 0));
      out.seat.set(0, 2.8, -0.55); out.exhaust.set(0.6, 2.9, -2.4); out.len = 5.0;
      break;
    }
    case 3: { // Quad Raptor
      box(P, 0.9, 0.55, 2.0, 0, 1.0, 0, body);
      box(P, 0.7, 0.4, 1.0, 0, 1.0, 1.4, body).rotation.x = 0.2;
      for (const s of [-1, 1]) { box(P, 0.55, 0.12, 1.2, s * 1.0, 1.25, 1.2, body); box(P, 0.55, 0.12, 1.2, s * 1.0, 1.25, -1.2, body); }
      box(dk, 1.4, 0.15, 1.0, 0, 1.35, -1.5, body);
      box(std('#2e2a26', 0.9), 0.65, 0.22, 1.1, 0, 1.45, -0.5, body);
      cyl(chrome, 0.045, 0.045, 1.4, 0, 1.75, 0.85, body, 8).rotation.z = Math.PI / 2;
      cyl(dk, 0.05, 0.05, 0.6, 0, 1.5, 0.85, body, 8);
      lamp(0.25, 1.3, 2.0); lamp(-0.25, 1.3, 2.0);
      box(dk, 0.9, 0.2, 0.2, 0, 0.7, 1.9, body);
      [[1.0, 1.25], [-1.0, 1.25], [1.0, -1.25], [-1.0, -1.25]].forEach(([x, z]) => addWheel(0.62, 0.6, x, 0.62, z, z > 0));
      out.seat.set(0, 1.6, -0.4); out.exhaust.set(0.4, 0.9, -1.8); out.len = 4.0;
      break;
    }
    default: { // Pierrafeu Mobile
      const stone = std(color, 0.95, 0, { flatShading: true });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.8, 3.7, 3, 2, 4), stone);
      const pa = slab.geometry.attributes.position;
      const hs = (x, y, z, k) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k) * 43758.5453; return v - Math.floor(v) - 0.5; };
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); pa.setXYZ(i, x + hs(x, y, z, 1) * 0.2, y + hs(x, y, z, 2) * 0.16, z + hs(x, y, z, 3) * 0.2); }
      slab.geometry.computeVertexNormals(); slab.position.set(0, 1.0, 0); slab.castShadow = true; body.add(slab);
      const wood = std('#6b4a2b', 0.95);
      const logF = cyl(wood, 0.22, 0.22, 2.6, 0, 1.0, 2.0, body, 10); logF.rotation.z = Math.PI / 2;
      const logB = cyl(wood, 0.22, 0.22, 2.6, 0, 1.0, -2.0, body, 10); logB.rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) { cyl(wood, 0.18, 0.18, 3.8, s * 1.2, 1.35, 0, body, 10).rotation.x = Math.PI / 2; }
      for (const s of [-1, 1]) { ell(std('#e9e4d4', 0.7), 0.22, 0.22, 0.22, s * 1.4, 1.0, 2.0, body); ell(std('#e9e4d4', 0.7), 0.22, 0.22, 0.22, s * 1.4, 1.0, -2.0, body); }
      const bone = cyl(std('#e9e4d4', 0.7), 0.12, 0.12, 1.8, 0, 1.55, 2.1, body, 8); bone.rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) { ell(std('#e9e4d4', 0.7), 0.2, 0.2, 0.2, s * 0.9, 1.55, 2.1, body); }
      box(std('#4b3a28', 0.95), 0.7, 0.18, 0.8, 0, 1.5, -0.4, body);
      const stoneW = { tire: '#8d867a', rim: '#6e675c', tread: false };
      [[1.3, 1.35], [-1.3, 1.35], [1.3, -1.35], [-1.3, -1.35]].forEach(([x, z]) => addWheel(0.78, 0.55, x, 0.78, z, z > 0, stoneW));
      out.seat.set(0, 1.45, -0.4); out.exhaust.set(0, 1.0, -2.3); out.len = 4.4;
    }
  }
  // bulle de bouclier
  const sh = new THREE.Mesh(new THREE.SphereGeometry(3.3, 20, 14), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  sh.position.y = 1.5; sh.visible = false; root.add(sh);
  out.shield = sh;
  return out;
}

export function animateKart(k, dt, v, steer) {
  if (k.props) for (const p of k.props) p.rotation.z += dt * (14 + Math.abs(v) * 0.9);
  for (const w of k.wheels) {
    w.spin.rotation.x += (v * dt) / w.r;
    if (w.front) w.pivot.rotation.y = -steer * 0.5;
  }
  if (k.driver) {
    const d = k.driver.userData;
    if (d.wheel) d.wheel.rotation.z = -steer * 1.3;
    k.driver.rotation.z = -steer * 0.08;
  }
}

/* ===================== Pilotes ===================== */
const LOOK = [
  { skin: '#e0b08a', shirt: '#c9a15a', pants: '#4a3b2b', hat: 'fedora', hatC: '#6b4a2b', hair: '#3a2a1a' },
  { skin: '#f2c6a0', shirt: '#2a9d8f', pants: '#2b3a55', hat: 'pony', hair: '#7a3a1a', glasses: true },
  { skin: '#e8b894', shirt: '#f2f2f2', pants: '#555', hat: 'white', hair: '#f0f0f0', glasses: true, bow: true },
  { skin: '#c98d62', shirt: '#b5651d', pants: '#6b4a2b', hat: 'wild', hair: '#4a2f1a', beard: true },
  { skin: '#d9a67c', shirt: '#4d9a3a', pants: '#2b3a2b', hat: 'raptor', hair: '#222' },
  { skin: '#f0c09a', shirt: '#ffd23f', pants: '#3a6ea5', hat: 'helmet', hatC: '#ff69b4', hair: '#222' },
];

export function makeDriver(ch) {
  const L = LOOK[ch % LOOK.length];
  const g = new THREE.Group();
  const skin = std(L.skin, 0.7), shirt = std(L.shirt, 0.85), hair = std(L.hair, 0.9);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.42, 6, 12), shirt);
  torso.position.set(0, 0.62, -0.02); torso.castShadow = true; g.add(torso);
  const headG = new THREE.Group(); headG.position.set(0, 1.2, 0.02); g.add(headG);
  ell(skin, 0.27, 0.29, 0.27, 0, 0, 0, headG);
  for (const s of [-1, 1]) { const e = ell(std('#111', 0.3), 0.04, 0.05, 0.03, s * 0.1, 0.05, 0.25, headG); e.castShadow = false; }
  ell(skin, 0.05, 0.05, 0.05, 0, -0.02, 0.28, headG);
  if (L.glasses) for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 14), std('#222', 0.4)); t.position.set(s * 0.1, 0.06, 0.26); headG.add(t); }
  switch (L.hat) {
    case 'fedora': cyl(std(L.hatC, 0.9), 0.43, 0.43, 0.04, 0, 0.2, 0, headG, 18); cyl(std(L.hatC, 0.9), 0.23, 0.26, 0.24, 0, 0.32, 0, headG, 16); cyl(std('#2b1d10', 0.9), 0.265, 0.265, 0.06, 0, 0.25, 0, headG, 16); break;
    case 'pony': ell(hair, 0.3, 0.26, 0.3, 0, 0.1, -0.03, headG); ell(hair, 0.12, 0.12, 0.12, 0, 0.1, -0.33, headG); ell(hair, 0.08, 0.28, 0.08, 0, -0.1, -0.4, headG); break;
    case 'white': for (const [x, y, z] of [[0, 0.22, 0], [-0.25, 0.05, 0], [0.25, 0.05, 0], [0, 0.1, -0.2], [-0.15, 0.2, 0.05], [0.15, 0.2, 0.05]]) ell(hair, 0.14, 0.14, 0.14, x, y, z, headG); break;
    case 'wild': ell(hair, 0.32, 0.27, 0.32, 0, 0.1, -0.03, headG); for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; coneM(hair, 0.07, 0.25, Math.cos(a) * 0.22, 0.28, Math.sin(a) * 0.22, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6, headG, 5); } ell(hair, 0.2, 0.18, 0.15, 0, -0.18, 0.15, headG); { const b = cyl(std('#efe9d6', 0.7), 0.025, 0.025, 0.3, 0.2, 0.3, 0, headG, 6); b.rotation.z = 0.6; } break;
    case 'raptor': { const gm = std('#4d9a3a', 0.6); ell(gm, 0.32, 0.3, 0.33, 0, 0.07, -0.02, headG); coneM(gm, 0.07, 0.3, 0.12, 0.35, 0.1, 0, 0, -0.4, headG, 6); coneM(gm, 0.07, 0.3, -0.12, 0.35, 0.1, 0, 0, 0.4, headG, 6); for (const s of [-1, 1]) { ell(glow('#ffd23f'), 0.05, 0.05, 0.03, s * 0.12, 0.22, 0.28, headG); } for (let i = -2; i <= 2; i++) coneM(std('#fff', 0.5), 0.025, 0.07, i * 0.05, 0.12, 0.31, Math.PI / 2, 0, 0, headG, 4); break; }
    case 'helmet': { const hm = paint(L.hatC); const h = new THREE.Mesh(new THREE.SphereGeometry(0.33, 18, 12, 0, TAU, 0, Math.PI * 0.62), hm); h.position.set(0, 0.0, -0.01); h.castShadow = true; headG.add(h); box(std('#111', 0.2, 0.5), 0.46, 0.1, 0.1, 0, 0.1, 0.27, headG); box(std('#ffffff', 0.5), 0.07, 0.04, 0.6, 0, 0.32, 0, headG); break; }
  }
  if (L.beard) ell(hair, 0.2, 0.15, 0.12, 0, -0.17, 0.2, headG);
  if (L.bow) { box(std('#b00020', 0.6), 0.16, 0.08, 0.05, 0, 0.95, 0.3, g); }
  // volant
  const wp = new THREE.Group(); wp.position.set(0, 0.85, 0.5); wp.rotation.x = -0.95; g.add(wp);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 20), std('#1d1d1d', 0.6)); wp.add(wheel);
  box(std('#1d1d1d', 0.6), 0.36, 0.04, 0.03, 0, 0, 0, wheel);
  g.userData.wheel = wheel;
  // bras et jambes
  const sl = new THREE.Vector3(0.34, 0.85, 0.0), sr = new THREE.Vector3(-0.34, 0.85, 0.0);
  limb(sl, new THREE.Vector3(0.2, 0.9, 0.48), 0.07, shirt, g); limb(sr, new THREE.Vector3(-0.2, 0.9, 0.48), 0.07, shirt, g);
  const pants = std(L.pants, 0.9);
  for (const s of [-1, 1]) { limb(new THREE.Vector3(s * 0.15, 0.25, 0), new THREE.Vector3(s * 0.17, 0.4, 0.55), 0.1, pants, g); limb(new THREE.Vector3(s * 0.17, 0.4, 0.55), new THREE.Vector3(s * 0.17, 0.05, 0.75), 0.08, pants, g); }
  return g;
}

export function makeNameTag(name, color = '#ffffff') {
  const tex = canvasTex(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = 'bold 34px "Trebuchet MS", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(name, w / 2, h / 2 + 2);
    g.fillStyle = color; g.fillText(name, w / 2, h / 2 + 2);
  }, { repeat: false });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(4.2, 1.05, 1);
  sp.renderOrder = 8;
  return sp;
}

/* ===================== Objets ===================== */
export function makeProjMesh(type) {
  const g = new THREE.Group();
  if (type === 'rock') {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 1), std('#7d746a', 1, 0, { flatShading: true }));
    m.castShadow = true; m.scale.set(1, 0.85, 1.1); g.add(m); g.userData.spin = 6;
    g.userData.mesh = m;
  } else if (type === 'dart') {
    cyl(std('#ffd23f', 0.4, 0.3), 0.1, 0.1, 1.4, 0, 0, 0, g, 8).rotation.x = Math.PI / 2;
    coneM(std('#d62828', 0.4), 0.14, 0.5, 0, 0, 0.95, Math.PI / 2, 0, 0, g, 8);
    for (let i = 0; i < 3; i++) { const f = box(std('#2a9d8f', 0.5), 0.02, 0.32, 0.4, 0, 0, -0.6, g); f.rotation.z = (i / 3) * Math.PI; }
    const gl = ell(glow('#7cff6a'), 0.12, 0.12, 0.12, 0, 0, 1.25, g); gl.castShadow = false;
  } else if (type === 'egg') {
    const tex = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#f4ecd0'; c.fillRect(0, 0, w, h);
      const r = mulberry32(5);
      for (let i = 0; i < 22; i++) { c.fillStyle = `rgba(${90 + r() * 40},${120 + r() * 40},60,0.85)`; c.beginPath(); c.arc(r() * w, r() * h, 4 + r() * 8, 0, TAU); c.fill(); }
    });
    const e = new THREE.Mesh(sphG, std('#ffffff', 0.5, 0, { map: tex, emissive: '#ffcc55', emissiveIntensity: 0.45 }));
    e.scale.set(0.9, 1.15, 0.9); e.castShadow = true; g.add(e);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffcc66, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(4, 4, 1); g.add(halo); g.userData.spin = 4;
  } else if (type === 'bone') {
    const bm = std('#efe8d2', 0.7);
    const b1 = cyl(bm, 0.14, 0.14, 2.2, 0, 0.35, 0, g, 8); b1.rotation.z = Math.PI / 2; b1.rotation.y = 0.5;
    const b2 = cyl(bm, 0.14, 0.14, 2.2, 0, 0.35, 0, g, 8); b2.rotation.z = Math.PI / 2; b2.rotation.y = -0.5;
    for (const a of [0.5, -0.5]) for (const s of [-1, 1]) for (const k of [-0.1, 0.1]) ell(bm, 0.22, 0.22, 0.22, Math.cos(a) * s * 1.1, 0.35, -Math.sin(a) * s * 1.1 + k, g);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 3.0, 32), new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; g.add(ring); g.userData.ring = ring;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.18, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.07; g.add(disc);
    const skull = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, (c, w, h) => {
      c.font = '88px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#d62828'; c.beginPath(); c.moveTo(w / 2, 6); c.lineTo(w - 6, h - 12); c.lineTo(6, h - 12); c.closePath(); c.fill();
      c.fillStyle = '#fff'; c.fillText('☠', w / 2, h / 2 + 14);
    }, { repeat: false }), transparent: true, depthWrite: false }));
    skull.scale.set(2.6, 2.6, 1); skull.position.y = 3.4; g.add(skull); g.userData.skull = skull;
    g.children.forEach((c) => { if (c.isMesh && c.geometry.type === 'CylinderGeometry' || (c.isMesh && c.geometry.type === 'SphereGeometry')) { c.position.x *= 1.6; c.position.z *= 1.6; c.scale.multiplyScalar(1.6); } });
  } else if (type === 'meteor') {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 2), std('#331a0c', 0.9, 0, { emissive: '#ff5a10', emissiveIntensity: 1.6, flatShading: true }));
    g.add(m); g.userData.spin = 3;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff7a22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(16, 16, 1); g.add(halo);
  }
  return g;
}

let _glow = null;
export function glowTex() {
  if (_glow) return _glow;
  _glow = canvasTex(64, 64, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  }, { repeat: false });
  return _glow;
}

export function makeItemBox() {
  const g = new THREE.Group();
  const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshPhysicalMaterial({ color: 0xffb703, transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.1, clearcoat: 1, emissive: 0xff8800, emissiveIntensity: 0.35 }));
  g.add(cube);
  const q = canvasTex(64, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.font = 'bold 54px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#fff'; c.shadowColor = '#000'; c.shadowBlur = 6; c.fillText('?', w / 2, h / 2 + 3);
  }, { repeat: false });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: q, transparent: true, depthWrite: false }));
  sp.scale.set(1.4, 1.4, 1); g.add(sp);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffcc44, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(5, 5, 1); g.add(halo);
  g.userData.cube = cube;
  return g;
}

/* ===================== Dinosaures ===================== */
const SKINS = {
  trex: ['#5d6b34', '#38441f', '#7d8a4a', 22],
  trice: ['#847a68', '#5b5446', '#a79d88', 26],
  stego: ['#6b8040', '#44552a', '#92a85c', 24],
  anky: ['#a58a62', '#6e5a3d', '#c8ad82', 22],
  raptor: ['#b9602a', '#3a2314', '#e08a4a', 14],
  brachio: ['#6f8c8a', '#4a6563', '#9bb5b2', 30],
  mosa: ['#4f7476', '#2a4547', '#86aaa6', 20],
  ichthy: ['#6d8aa0', '#3a5468', '#b0c8d8', 26],
  plesio: ['#8c7c5a', '#5a4d36', '#bba982', 22],
  spino: ['#4b6e56', '#2a4235', '#86a272', 20],
};
const skinMats = new Map();
function skinMat(kind, stripes) {
  const key = kind + (stripes ? 's' : '');
  let m = skinMats.get(key);
  if (m) return m;
  const [base, dark, light, size] = SKINS[kind];
  const tex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = mulberry32(kind.length * 31 + 3);
    const step = size * 0.6;
    for (let y = -step; y < h + step; y += step * 0.8) for (let x = -step; x < w + step; x += step) {
      const ox = ((Math.round(y / (step * 0.8)) & 1) ? step / 2 : 0);
      g.fillStyle = r() < 0.5 ? dark : light; g.globalAlpha = 0.18 + r() * 0.22;
      g.beginPath(); g.ellipse(x + ox, y, step * 0.5, step * 0.4, 0, 0, TAU); g.fill();
      g.globalAlpha = 0.35; g.strokeStyle = dark; g.lineWidth = 1.2; g.stroke();
    }
    g.globalAlpha = 1;
    if (stripes) { g.fillStyle = dark; for (let i = 0; i < 6; i++) { g.globalAlpha = 0.55; g.fillRect(0, i * (h / 6) + 8, w, 14); } g.globalAlpha = 1; }
  });
  tex.repeat.set(2, 2);
  m = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 1.4, roughness: 0.85, metalness: 0 });
  skinMats.set(key, m);
  return m;
}

function legRig(parent, mat, x, y, z, up, lo, th, footMat, toes) {
  const hip = new THREE.Group(); hip.position.set(x, y, z); parent.add(hip);
  ell(mat, th, up * 0.62, th * 1.05, 0, -up * 0.42, 0, hip);
  const knee = new THREE.Group(); knee.position.set(0, -up, 0); hip.add(knee);
  cyl(mat, th * 0.6, th * 0.38, lo, 0, -lo / 2, 0, knee, 10);
  const foot = new THREE.Group(); foot.position.set(0, -lo, 0); knee.add(foot);
  ell(footMat, th * 0.85, th * 0.3, th * 1.5, 0, 0.1, th * 0.75, foot);
  for (let i = 0; i < toes; i++) { const a = (i - (toes - 1) / 2) * 0.5; coneM(std('#e9e2cf', 0.6), th * 0.16, th * 0.55, Math.sin(a) * th * 1.1, 0.05, th * 1.9, Math.PI / 2, 0, -a, foot, 5); }
  return { hip, knee };
}
function tailChain(parent, mat, n, r0, len, x, y, z, rEnd = 0.12) {
  const segs = [];
  let p = parent, pz = z, py = y;
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(); g.position.set(i === 0 ? x : 0, i === 0 ? py : 0, i === 0 ? pz : -len);
    p.add(g);
    const r = r0 * (1 - (i / n) * (1 - rEnd));
    ell(mat, r, r * 0.9, len * 0.62, 0, 0, -len * 0.45, g);
    segs.push(g); p = g;
  }
  return segs;
}
function stars(parent, y) {
  const g = new THREE.Group(); g.position.y = y; g.visible = false; parent.add(g);
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), new THREE.MeshBasicMaterial({ color: 0xffe14d })); m.userData.a = (i / 4) * TAU; g.add(m); }
  return g;
}

export function makeDino(kind) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const skin = skinMat(kind, kind === 'raptor');
  const belly = std('#cdbf93', 0.9);
  const legs = [], tails = [];
  let head = null, jaw = null, topY = 6, base = 0, necks = null;
  const fl = [], aq = kind === 'mosa' || kind === 'ichthy' || kind === 'plesio';
  const white = std('#efe8d6', 0.5);

  if (kind === 'trex') {
    base = 3.0; body.position.y = base; topY = 7.2;
    ell(skin, 1.55, 1.75, 3.0, 0, 0.35, 0, body);
    ell(belly, 1.2, 1.2, 2.5, 0, -0.35, 0.2, body);
    ell(skin, 0.95, 1.1, 1.8, 0, 1.7, 2.3, body).rotation.x = -0.45;
    head = new THREE.Group(); head.position.set(0, 2.85, 3.7); body.add(head);
    ell(skin, 1.0, 0.9, 1.55, 0, 0, 0.5, head);
    ell(skin, 0.75, 0.6, 1.2, 0, -0.18, 1.7, head);
    jaw = new THREE.Group(); jaw.position.set(0, -0.55, 0.3); head.add(jaw);
    ell(belly, 0.7, 0.28, 1.6, 0, 0, 0.95, jaw);
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) { coneM(white, 0.07, 0.3, s * 0.55, 0.2, 0.5 + i * 0.28, Math.PI, 0, 0, jaw, 5); coneM(white, 0.08, 0.34, s * 0.6, -0.5, 0.5 + i * 0.3, 0, 0, 0, head, 5); }
    for (const s of [-1, 1]) { const e = ell(glow('#ffc400'), 0.15, 0.15, 0.1, s * 0.84, 0.38, 0.9, head); e.castShadow = false; ell(std('#111'), 0.07, 0.1, 0.05, s * 0.88, 0.38, 0.95, head); ell(skin, 0.3, 0.14, 0.4, s * 0.8, 0.6, 0.9, head); }
    for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * 1.0, 1.0, 2.5); body.add(a); cyl(skin, 0.14, 0.1, 1.1, 0, -0.5, 0.2, a, 6).rotation.x = -0.4; coneM(white, 0.05, 0.25, s * 0.08, -1.0, 0.45, 0.6, 0, 0, a, 4); legs.push({ arm: a }); }
    for (const s of [-1, 1]) legs.push(legRig(body, skin, s * 1.25, -0.3, -0.3, 1.5, 1.45, 0.8, skin, 3));
    tails.push(...tailChain(body, skin, 7, 1.15, 1.4, 0, 0.1, -2.6));
  } else if (kind === 'trice') {
    base = 1.7; body.position.y = base; topY = 5.0;
    ell(skin, 1.7, 1.55, 3.1, 0, 0.9, 0, body);
    ell(belly, 1.3, 1.0, 2.6, 0, 0.3, 0.1, body);
    head = new THREE.Group(); head.position.set(0, 1.0, 3.3); body.add(head);
    ell(skin, 0.95, 0.9, 1.5, 0, 0, 0.6, head);
    coneM(std('#d9cfae', 0.6), 0.45, 0.9, 0, -0.15, 2.05, Math.PI / 2, 0, 0, head, 8);
    const frill = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.25, 24), std('#a0522d', 0.8, 0, { map: skin.map, bumpMap: skin.map, bumpScale: 1.2 }));
    frill.rotation.x = Math.PI / 2 - 0.45; frill.position.set(0, 0.85, -0.5); frill.scale.set(1, 1, 0.85); frill.castShadow = true; head.add(frill);
    for (let i = 0; i < 12; i++) { const a = -0.2 + (i / 11) * (Math.PI + 0.4); coneM(white, 0.16, 0.5, Math.cos(a) * 2.1, 0.85 + Math.sin(a) * 1.7, -0.8, 0, 0, 0, head, 5); }
    for (const s of [-1, 1]) { coneM(std('#efe8d6', 0.5), 0.2, 2.0, s * 0.65, 0.85, 1.55, Math.PI / 2 - 0.25, 0, 0, head, 7); const e = ell(glow('#ffe08a'), 0.12, 0.12, 0.09, s * 0.88, 0.25, 1.0, head); e.castShadow = false; ell(std('#111'), 0.06, 0.08, 0.05, s * 0.92, 0.25, 1.03, head); }
    coneM(std('#efe8d6', 0.5), 0.16, 0.7, 0, 0.4, 2.0, Math.PI / 2 - 0.5, 0, 0, head, 6);
    for (const [x, z] of [[1.15, 1.9], [-1.15, 1.9], [1.15, -1.9], [-1.15, -1.9]]) legs.push(legRig(body, skin, x, 0.4, z, 1.0, 0.7, 0.55, skin, 3));
    tails.push(...tailChain(body, skin, 5, 0.95, 1.3, 0, 0.9, -2.9));
  } else if (kind === 'stego') {
    base = 1.9; body.position.y = base; topY = 5.6;
    ell(skin, 1.4, 1.5, 3.3, 0, 1.1, 0, body).rotation.x = 0.1;
    ell(belly, 1.1, 0.9, 2.8, 0, 0.35, 0.2, body);
    head = new THREE.Group(); head.position.set(0, 0.3, 4.0); body.add(head);
    ell(skin, 0.45, 0.45, 0.95, 0, 0, 0.3, head); coneM(std('#d9cfae', 0.6), 0.2, 0.45, 0, -0.1, 1.2, Math.PI / 2, 0, 0, head, 6);
    for (const s of [-1, 1]) { const e = ell(glow('#ffe08a'), 0.08, 0.08, 0.06, s * 0.4, 0.15, 0.55, head); e.castShadow = false; }
    ell(skin, 0.5, 0.55, 1.4, 0, 0.7, 3.0, body).rotation.x = 0.5;
    const plateM = std('#d9602a', 0.7, 0, { map: skin.map, bumpMap: skin.map });
    for (let i = 0; i < 9; i++) { const z = 2.5 - i * 0.65; const sz = 0.9 + Math.sin((i / 8) * Math.PI) * 0.9; const side = i % 2 ? 0.3 : -0.3; coneM(plateM, 0.55, sz * 1.6, side, 2.5 + Math.sin((i / 8) * Math.PI) * 0.35 - (i > 6 ? (i - 6) * 0.15 : 0), z, 0, Math.PI / 4, 0, body, 4).scale.set(0.35, 1, 1); }
    for (const [x, z, up] of [[1.0, 2.0, 1.1], [-1.0, 2.0, 1.1], [1.0, -2.0, 1.4], [-1.0, -2.0, 1.4]]) legs.push(legRig(body, skin, x, 0.5, z, up * 0.9, up * 0.9, 0.5, skin, 3));
    tails.push(...tailChain(body, skin, 5, 0.85, 1.2, 0, 1.0, -3.2));
    for (const s of [-1, 1]) { coneM(white, 0.14, 1.1, s * 0.35, 0.3, -1.0, -0.5, 0, s * 0.5, tails[3], 5); coneM(white, 0.14, 1.0, s * 0.3, 0.2, -1.5, -0.3, 0, s * 0.6, tails[4], 5); }
  } else if (kind === 'anky') {
    base = 1.2; body.position.y = base; topY = 3.6;
    ell(skin, 2.0, 1.1, 3.0, 0, 0.9, 0, body);
    const armor = std('#7a6648', 0.85, 0, { map: skin.map, bumpMap: skin.map, bumpScale: 2 });
    const rnd = mulberry32(11);
    for (let i = 0; i < 42; i++) { const a = rnd() * TAU, u = rnd(); const x = Math.cos(a) * 1.9 * Math.sqrt(u), z = Math.sin(a) * 2.8 * Math.sqrt(u); ell(armor, 0.34, 0.22, 0.34, x, 1.75 - (x * x) * 0.1, z, body); }
    for (let i = 0; i < 10; i++) { const side = i % 2 ? 1 : -1; coneM(white, 0.15, 0.6, side * 2.0, 1.1, 2.2 - Math.floor(i / 2) * 1.0, 0, 0, side * -1.2, body, 5); }
    head = new THREE.Group(); head.position.set(0, 0.7, 3.2); body.add(head);
    ell(skin, 0.95, 0.6, 1.0, 0, 0, 0.3, head); for (const s of [-1, 1]) { coneM(armor, 0.2, 0.6, s * 0.8, 0.2, -0.1, 0, 0, s * -1.2, head, 5); const e = ell(glow('#ffe08a'), 0.1, 0.1, 0.08, s * 0.7, 0.15, 0.75, head); e.castShadow = false; }
    for (const [x, z] of [[1.5, 1.8], [-1.5, 1.8], [1.5, -1.8], [-1.5, -1.8]]) legs.push(legRig(body, skin, x, 0.2, z, 0.6, 0.45, 0.6, skin, 3));
    const t = tailChain(body, skin, 5, 0.9, 1.2, 0, 0.7, -2.8); tails.push(...t);
    ell(armor, 1.25, 0.75, 1.0, 0, 0, -1.2, t[4]);
  } else if (kind === 'raptor') {
    base = 1.65; body.position.y = base; topY = 3.8;
    body.rotation.x = 0.0;
    ell(skin, 0.62, 0.72, 1.55, 0, 0.1, 0, body);
    ell(belly, 0.45, 0.5, 1.2, 0, -0.15, 0.1, body);
    ell(skin, 0.38, 0.4, 0.9, 0, 0.75, 1.3, body).rotation.x = -0.7;
    head = new THREE.Group(); head.position.set(0, 1.25, 1.8); body.add(head);
    ell(skin, 0.4, 0.38, 0.75, 0, 0, 0.3, head); ell(skin, 0.28, 0.24, 0.65, 0, -0.07, 0.95, head);
    jaw = new THREE.Group(); jaw.position.set(0, -0.25, 0.25); head.add(jaw); ell(belly, 0.24, 0.1, 0.8, 0, 0, 0.5, jaw);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) coneM(white, 0.04, 0.16, s * 0.2, -0.25, 0.8 + i * 0.12, 0, 0, 0, head, 4);
    for (const s of [-1, 1]) { const e = ell(glow('#ffb300'), 0.08, 0.08, 0.06, s * 0.36, 0.1, 0.6, head); e.castShadow = false; }
    const crest = std('#2fa6a0', 0.6);
    for (let i = 0; i < 5; i++) coneM(crest, 0.08, 0.5 - i * 0.04, 0, 0.45, 0.1 - i * 0.2, -0.6, 0, 0, head, 4);
    for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * 0.55, 0.5, 0.9); body.add(a); cyl(skin, 0.07, 0.05, 0.7, 0, -0.3, 0.2, a, 6).rotation.x = -0.6; for (let k = 0; k < 4; k++) coneM(crest, 0.05, 0.6, s * 0.1, -0.1 - k * 0.1, -0.2 - k * 0.15, 0, 0, s * 1.2, a, 4); legs.push({ arm: a }); }
    for (const s of [-1, 1]) legs.push(legRig(body, skin, s * 0.5, -0.1, -0.3, 0.95, 0.85, 0.38, skin, 3));
    tails.push(...tailChain(body, skin, 7, 0.5, 0.95, 0, 0.1, -1.5, 0.15));
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) coneM(crest, 0.05, 0.5, s * 0.12, 0.05, -0.1, 0, 0, 0, tails[i + 1], 4).rotation.z = s * 1.2;
  } else if (kind === 'mosa') {
    base = 0.9; body.position.y = base; topY = 4.2;
    ell(skin, 1.5, 1.35, 3.7, 0, 0, 0, body);
    ell(belly, 1.2, 0.9, 3.2, 0, -0.5, 0.2, body);
    for (let i = 0; i < 7; i++) coneM(std('#2f4c4e', 0.7), 0.16, 0.55, 0, 1.25 - i * 0.04, 2.2 - i * 0.7, 0, 0, 0, body, 4);
    head = new THREE.Group(); head.position.set(0, 0.35, 4.3); body.add(head);
    ell(skin, 1.0, 0.8, 1.5, 0, 0, 0.3, head); ell(skin, 0.7, 0.5, 1.6, 0, -0.12, 1.7, head);
    jaw = new THREE.Group(); jaw.position.set(0, -0.5, 0.3); head.add(jaw);
    ell(belly, 0.62, 0.22, 1.7, 0, 0, 1.1, jaw);
    for (let i = 0; i < 8; i++) for (const s of [-1, 1]) { coneM(white, 0.06, 0.28, s * 0.5, 0.2, 0.7 + i * 0.28, Math.PI, 0, 0, jaw, 4); coneM(white, 0.07, 0.3, s * 0.58, -0.42, 0.6 + i * 0.3, 0, 0, 0, head, 4); }
    for (const s of [-1, 1]) { const e = ell(glow('#ffd23f'), 0.15, 0.15, 0.1, s * 0.85, 0.3, 0.8, head); e.castShadow = false; ell(std('#111'), 0.07, 0.1, 0.05, s * 0.9, 0.3, 0.85, head); }
    for (const [x, z, s] of [[1.2, 2.4, 1], [-1.2, 2.4, -1], [1.1, -1.2, 1], [-1.1, -1.2, -1]]) { const g = new THREE.Group(); g.position.set(x, -0.6, z); body.add(g); ell(skin, 0.2, 0.08, 1.2, s * 0.8, 0, -0.4, g); fl.push({ g, s, ph: z }); }
    tails.push(...tailChain(body, skin, 9, 1.25, 1.6, 0, 0, -3.3, 0.12));
    const last = tails[tails.length - 1];
    coneM(skin, 0.3, 2.6, 0, 0.8, -1.3, -2.6, 0, 0, last, 6); coneM(skin, 0.25, 1.7, 0, -0.5, -1.3, 2.6, 0, 0, last, 6);
  } else if (kind === 'ichthy') {
    base = 0.7; body.position.y = base; topY = 3.2;
    ell(skin, 0.95, 0.9, 2.7, 0, 0, 0, body); ell(belly, 0.75, 0.6, 2.4, 0, -0.35, 0.1, body);
    head = new THREE.Group(); head.position.set(0, 0.05, 2.6); body.add(head);
    ell(skin, 0.7, 0.65, 1.0, 0, 0, 0.2, head);
    coneM(std('#b9c6d0', 0.5), 0.26, 2.4, 0, -0.05, 1.7, Math.PI / 2, 0, 0, head, 8);
    for (const s of [-1, 1]) { ell(glow('#fff1b0'), 0.2, 0.2, 0.12, s * 0.62, 0.22, 0.5, head).castShadow = false; ell(std('#111'), 0.11, 0.11, 0.06, s * 0.66, 0.22, 0.55, head); }
    coneM(skin, 0.28, 1.5, 0, 1.15, -0.2, -0.5, 0, 0, body, 4).scale.set(0.35, 1, 1);
    for (const [x, z, s] of [[0.85, 1.3, 1], [-0.85, 1.3, -1]]) { const g = new THREE.Group(); g.position.set(x, -0.5, z); body.add(g); ell(skin, 0.14, 0.06, 0.9, s * 0.5, 0, -0.3, g); fl.push({ g, s, ph: z }); }
    tails.push(...tailChain(body, skin, 6, 0.8, 1.3, 0, 0, -2.6, 0.14));
    const last = tails[tails.length - 1];
    coneM(skin, 0.2, 1.8, 0, 0.7, -0.9, -2.5, 0, 0, last, 5); coneM(skin, 0.2, 1.8, 0, -0.7, -0.9, 2.5, 0, 0, last, 5);
  } else if (kind === 'plesio') {
    base = 0.9; body.position.y = base; topY = 6.0;
    ell(skin, 2.0, 1.2, 3.0, 0, 0, 0, body); ell(belly, 1.6, 0.8, 2.6, 0, -0.5, 0.1, body);
    for (const [x, z, s] of [[1.7, 1.6, 1], [-1.7, 1.6, -1], [1.7, -1.5, 1], [-1.7, -1.5, -1]]) { const g = new THREE.Group(); g.position.set(x, -0.5, z); body.add(g); ell(skin, 0.7, 0.1, 1.9, s * 0.9, 0, -0.5, g); fl.push({ g, s, ph: z }); }
    necks = []; let p = body;
    for (let i = 0; i < 8; i++) { const g = new THREE.Group(); g.position.set(0, i === 0 ? 0.5 : 0.25, i === 0 ? 2.5 : 0.95); g.userData.b = i < 4 ? -0.3 : 0.32; g.rotation.x = g.userData.b; p.add(g); ell(skin, 0.55 - i * 0.035, 0.5 - i * 0.03, 0.75, 0, 0, 0.1, g); necks.push(g); p = g; }
    head = new THREE.Group(); head.position.set(0, 0.1, 0.9); p.add(head);
    ell(skin, 0.42, 0.34, 0.75, 0, 0, 0.2, head); ell(skin, 0.28, 0.2, 0.55, 0, -0.06, 0.8, head);
    for (const s of [-1, 1]) { ell(glow('#ffe08a'), 0.08, 0.08, 0.06, s * 0.34, 0.14, 0.4, head).castShadow = false; }
    tails.push(...tailChain(body, skin, 4, 0.9, 1.0, 0, 0, -2.8, 0.2));
  } else if (kind === 'spino') {
    base = 3.0; body.position.y = base; topY = 7.4;
    ell(skin, 1.35, 1.55, 3.3, 0, 0.35, 0, body); ell(belly, 1.05, 1.1, 2.7, 0, -0.35, 0.2, body);
    ell(skin, 0.85, 1.0, 1.8, 0, 1.45, 2.4, body).rotation.x = -0.4;
    const sailM = std('#c24a2c', 0.7, 0, { side: THREE.DoubleSide });
    for (let i = 0; i < 11; i++) { const h = 0.6 + 3.2 * Math.sin(Math.PI * (i + 0.6) / 11.6); box(sailM, 0.08, h, 0.5, 0, 1.6 + h / 2, 2.3 - i * 0.52, body); cyl(std('#7a2a18', 0.6), 0.05, 0.05, h, 0, 1.6 + h / 2, 2.3 - i * 0.52 + 0.22, body, 5); }
    head = new THREE.Group(); head.position.set(0, 2.55, 3.9); body.add(head);
    ell(skin, 0.8, 0.72, 1.15, 0, 0, 0.25, head); ell(skin, 0.5, 0.42, 1.9, 0, -0.12, 1.7, head);
    coneM(std('#c24a2c', 0.6), 0.09, 0.8, 0, 0.62, 0.35, 0, 0, 0, head, 4);
    jaw = new THREE.Group(); jaw.position.set(0, -0.45, 0.3); head.add(jaw); ell(belly, 0.44, 0.17, 1.7, 0, 0, 1.0, jaw);
    for (let i = 0; i < 8; i++) for (const s of [-1, 1]) { coneM(white, 0.05, 0.22, s * 0.35, 0.15, 0.6 + i * 0.26, Math.PI, 0, 0, jaw, 4); coneM(white, 0.05, 0.22, s * 0.4, -0.36, 0.6 + i * 0.27, 0, 0, 0, head, 4); }
    for (const s of [-1, 1]) { ell(glow('#ffb300'), 0.12, 0.12, 0.08, s * 0.72, 0.28, 0.7, head).castShadow = false; }
    for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * 1.0, 0.8, 2.4); body.add(a); cyl(skin, 0.2, 0.13, 1.4, 0, -0.6, 0.3, a, 6).rotation.x = -0.5; for (let k = -1; k <= 1; k++) coneM(white, 0.05, 0.4, k * 0.12, -1.2, 0.8, 0.6, 0, 0, a, 4); legs.push({ arm: a }); }
    for (const s of [-1, 1]) legs.push(legRig(body, skin, s * 1.2, -0.3, -0.3, 1.5, 1.45, 0.75, skin, 3));
    tails.push(...tailChain(body, skin, 8, 1.0, 1.3, 0, 0.2, -2.7, 0.12));
  } else { // brachio (décor)
    base = 5.6; body.position.y = base; topY = 16;
    ell(skin, 3.2, 3.0, 6.5, 0, 0.5, 0, body);
    for (const [x, z] of [[2.2, 3.2], [-2.2, 3.2], [2.2, -3.2], [-2.2, -3.2]]) cyl(skin, 0.95, 0.9, 5.6, x, -2.8 + 0.0, z, body, 10).position.y = -2.7;
    necks = [];
    let p = body; for (let i = 0; i < 6; i++) { const g = new THREE.Group(); g.position.set(0, i === 0 ? 1.6 : 1.7, i === 0 ? 5.2 : 0.7); p.add(g); ell(skin, 1.15 - i * 0.1, 1.2, 1.35, 0, 0.7, 0, g); necks.push(g); p = g; }
    head = new THREE.Group(); head.position.set(0, 1.6, 1.0); p.add(head); ell(skin, 0.7, 0.6, 1.2, 0, 0, 0.4, head);
    tails.push(...tailChain(body, skin, 7, 2.2, 2.2, 0, 0.2, -6.0, 0.08));
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const starG = stars(root, topY + 1.2);
  let phase = Math.random() * 10, tt = Math.random() * 10;

  let lastLift = 0;
  function update(dt, anim, wobble, lift = 0) {
    tt += dt;
    const run = anim === 2, walk = anim === 1 || run, stunned = anim === 3;
    const rate = stunned ? 0 : run ? (kind === 'raptor' ? 14 : 9) : walk ? (kind === 'brachio' ? 2 : 4.2) : 0;
    phase += dt * rate;
    const A = run ? 0.85 : walk ? 0.5 : 0;
    legs.forEach((l, i) => {
      if (l.arm) { l.arm.rotation.x = Math.sin(tt * 3 + i) * 0.1 + (stunned ? 0.4 : 0); return; }
      const off = kind === 'trex' || kind === 'raptor' ? (i % 2) * Math.PI : ((i % 2) + (i >> 1 & 1)) * Math.PI;
      const sw = Math.sin(phase + off);
      l.hip.rotation.x = stunned ? 0.1 : sw * A;
      l.knee.rotation.x = stunned ? 0 : Math.max(0, Math.sin(phase + off + 1.3)) * A * 0.9;
    });
    if (aq) {
      const sw = stunned ? 0.4 : walk ? 5.5 : 2;
      tails.forEach((s, i) => { s.rotation.y = Math.sin(tt * sw - i * 0.6) * (stunned ? 0.03 : 0.12 + i * 0.03); s.rotation.x = 0; });
      fl.forEach((f) => { f.g.rotation.z = f.s * (0.3 + Math.sin(tt * (walk ? 6 : 2.2) + f.ph) * 0.35); f.g.rotation.x = Math.cos(tt * (walk ? 6 : 2.2) + f.ph) * 0.25; });
      const dl = dt > 0 ? (lift - lastLift) / dt : 0; lastLift = lift;
      body.position.y = base + Math.sin(tt * 1.6) * 0.12;
      body.rotation.x = stunned ? 0 : -Math.max(-0.7, Math.min(0.7, dl * 0.16));
      body.rotation.z = stunned ? Math.PI * 0.88 : 0;
      if (necks) necks.forEach((n, i) => { n.rotation.x = n.userData.b + Math.sin(tt * 1.3 - i * 0.5) * (stunned ? 0.02 : 0.1); });
      if (head) { head.rotation.x = stunned ? 0.3 : Math.sin(tt * 1.2) * 0.05; head.rotation.y = stunned ? Math.sin(tt * 2) * 0.3 : 0; }
      if (jaw) jaw.rotation.x = wobble > 0 ? 0.6 + Math.sin(tt * 30) * 0.12 : stunned ? 0.3 : 0.05 + Math.max(0, Math.sin(tt * 0.9)) * 0.06;
      starG.visible = stunned;
      if (stunned) starG.children.forEach((s) => { s.userData.a += dt * 5; s.position.set(Math.cos(s.userData.a) * 1.6, Math.sin(s.userData.a * 2) * 0.2, Math.sin(s.userData.a) * 1.6); s.rotation.y += dt * 6; });
      return;
    }
    tails.forEach((s, i) => { s.rotation.y = Math.sin(tt * (run ? 6 : 1.6) - i * 0.55) * (stunned ? 0.04 : 0.1 + i * 0.015); s.rotation.x = stunned ? 0.04 : Math.sin(tt * 1.3 - i * 0.4) * 0.02; });
    body.position.y = base + (walk ? Math.abs(Math.sin(phase)) * 0.18 * (run ? 1.6 : 1) : Math.sin(tt * 1.8) * 0.04);
    body.rotation.z = stunned ? Math.sin(tt * 5) * 0.09 : 0;
    body.rotation.x = kind === 'raptor' && run ? 0.12 : 0;
    if (head) { head.rotation.x = stunned ? 0.45 + Math.sin(tt * 4) * 0.08 : Math.sin(tt * 1.2) * 0.04; head.rotation.y = stunned ? Math.sin(tt * 2.2) * 0.4 : (walk ? 0 : Math.sin(tt * 0.6) * 0.25); }
    if (jaw) jaw.rotation.x = wobble > 0 ? 0.55 + Math.sin(tt * 30) * 0.12 : stunned ? 0.3 : 0.05 + Math.max(0, Math.sin(tt * 0.9)) * 0.06;
    if (necks) necks.forEach((n, i) => { n.rotation.x = -0.08 + Math.sin(tt * 0.7 + i * 0.4) * 0.05; });
    starG.visible = stunned;
    if (stunned) starG.children.forEach((s) => { s.userData.a += dt * 5; s.position.set(Math.cos(s.userData.a) * 1.6, Math.sin(s.userData.a * 2) * 0.2, Math.sin(s.userData.a) * 1.6); s.rotation.y += dt * 6; });
  }
  return { root, update, kind };
}

export function makePtero() {
  const g = new THREE.Group();
  const skin = std('#8a6d5a', 0.8), mem = std('#b08968', 0.9, 0, { side: THREE.DoubleSide });
  ell(skin, 0.35, 0.3, 1.0, 0, 0, 0, g);
  ell(skin, 0.18, 0.16, 0.8, 0, 0.05, 1.2, g);
  coneM(skin, 0.07, 1.0, 0, 0.2, 2.0, Math.PI / 2, 0, 0, g, 4);
  coneM(skin, 0.08, 0.9, 0, 0.25, 0.7, -0.4, 0, 0, g, 4);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); g.add(w);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.8, s * 4.2, 0, 0.1, 0, 0, -0.9, s * 4.2, 0, 0.1, s * 5.2, 0, -0.8, 0, 0, -0.9], 3));
    geo.computeVertexNormals();
    w.add(new THREE.Mesh(geo, mem));
    wings.push({ w, s });
  }
  g.userData.flap = (t) => wings.forEach(({ w, s }) => { w.rotation.z = s * Math.sin(t * 5) * 0.55; });
  return g;
}
