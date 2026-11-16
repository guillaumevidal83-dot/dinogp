import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { canvasTex, pixelFill, tfbm, fbm, smooth, hex2rgb, lerpRGB, mulberry32 } from './util.js';
import { makeDino, makePtero, makeKart, makeDriver } from './models.js';

const S = window.Shared;
const TAU = Math.PI * 2;
const ROCK = { jungle: '#6f6a60', volcano: '#2b2625', canyon: '#a0603c', ice: '#a9b6c2', beach: '#8a8478' };
const BUSH = { jungle: ['#2f6b2a', '#3d7f31'], volcano: ['#4a2a22', '#5e362a'], canyon: ['#7a6a3a', '#8e7a42'], ice: ['#dfe9f1', '#b9cfdc'], beach: ['#3f8a3a', '#52a048'] };

/* ---------- géométries fusionnées avec couleurs par sommet ---------- */
function partsGeo(parts) {
  const gs = parts.map((p) => {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(p.pos || [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot || [0, 0, 0]), 'YXZ')),
      new THREE.Vector3(...(p.scale || [1, 1, 1]))
    );
    g.applyMatrix4(m);
    const c = new THREE.Color(p.color), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g;
  });
  return mergeGeometries(gs, false);
}
const hsh = (x, y, z, k) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k) * 43758.5453; return v - Math.floor(v) - 0.5; };
function jitterGeo(g, amt) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x + hsh(x, y, z, 1) * amt, y + hsh(x, y, z, 2) * amt, z + hsh(x, y, z, 3) * amt); }
  g.computeVertexNormals();
  return g;
}
const frond = (n, rad, y, len, w, pitch, colors, extra = 0) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + extra;
    out.push({ geo: new THREE.BoxGeometry(w, 0.06, len), pos: [Math.sin(a) * (rad + len / 2 * Math.cos(pitch)), y - Math.sin(pitch) * len * 0.35, Math.cos(a) * (rad + len / 2 * Math.cos(pitch))], rot: [pitch, a, 0], color: colors[i % colors.length] });
  }
  return out;
};

function decorGeo(type, mapId) {
  const rk = ROCK[mapId], bc = BUSH[mapId];
  switch (type) {
    case 'broad': return partsGeo([
      { geo: new THREE.CylinderGeometry(0.35, 0.6, 5.6, 7), pos: [0, 2.8, 0], color: '#5a4026' },
      { geo: new THREE.IcosahedronGeometry(2.7, 1), pos: [0, 6.7, 0], scale: [1, 0.85, 1], color: '#2f6b2a' },
      { geo: new THREE.IcosahedronGeometry(2.0, 1), pos: [1.7, 5.7, 0.8], color: '#3a7d30' },
      { geo: new THREE.IcosahedronGeometry(2.1, 1), pos: [-1.5, 6.0, -1.0], color: '#2a5e25' },
      { geo: new THREE.IcosahedronGeometry(1.8, 1), pos: [0.2, 8.4, 0.1], color: '#468a38' },
    ]);
    case 'cycad': return partsGeo([
      { geo: new THREE.CylinderGeometry(0.5, 0.65, 2.6, 7), pos: [0, 1.3, 0], color: '#4a3a2a' },
      ...frond(11, 0.2, 2.8, 3.6, 0.55, 0.45, ['#3f7d2c', '#357025', '#4a8a30']),
    ]);
    case 'fern': return partsGeo(frond(8, 0.1, 0.45, 2.3, 0.42, 0.85, ['#3c8a2e', '#2f7a28', '#4a9a35']));
    case 'palm': {
      const parts = [];
      for (let i = 0; i < 5; i++) parts.push({ geo: new THREE.CylinderGeometry(0.3 - i * 0.025, 0.34 - i * 0.025, 1.7, 8), pos: [i * i * 0.13, 0.85 + i * 1.55, 0], rot: [0, 0, -i * 0.075], color: i % 2 ? '#8a6d4a' : '#7c6140' });
      const cx = 16 * 0.13 * 0.98 + 0.1;
      for (const a of frond(10, 0, 0, 4.6, 0.55, 0.55, ['#2f8f3a', '#277d33', '#3aa044'])) { a.pos[0] += cx; a.pos[1] += 7.6; parts.push(a); }
      for (let i = 0; i < 3; i++) parts.push({ geo: new THREE.IcosahedronGeometry(0.28, 0), pos: [cx + Math.cos(i * 2) * 0.35, 7.2, Math.sin(i * 2) * 0.35], color: '#5a3d1e' });
      return partsGeo(parts);
    }
    case 'conifer': {
      const parts = [{ geo: new THREE.CylinderGeometry(0.3, 0.5, 2.2, 7), pos: [0, 1.1, 0], color: '#4a3524' }];
      [[3.0, 3.6, 3.2], [2.4, 3.2, 5.0], [1.8, 2.8, 6.8], [1.2, 2.4, 8.4]].forEach(([r, h, y], i) => {
        parts.push({ geo: new THREE.ConeGeometry(r, h, 9), pos: [0, y, 0], color: '#1f4d36' });
        parts.push({ geo: new THREE.ConeGeometry(r * 0.78, h * 0.5, 9), pos: [0, y + h * 0.28, 0], color: '#f1f7fb' });
      });
      return partsGeo(parts);
    }
    case 'crystal': return partsGeo([
      { geo: new THREE.ConeGeometry(0.8, 5.2, 5), pos: [0, 2.6, 0], color: '#9fe3ff' },
      { geo: new THREE.ConeGeometry(0.6, 3.6, 5), pos: [1.0, 1.7, 0.3], rot: [0.2, 0, -0.35], color: '#7fd0f5' },
      { geo: new THREE.ConeGeometry(0.55, 3.0, 5), pos: [-0.9, 1.4, -0.2], rot: [-0.2, 0, 0.4], color: '#b8ecff' },
      { geo: new THREE.ConeGeometry(0.45, 2.4, 5), pos: [0.1, 1.1, 0.9], rot: [0.5, 0, 0], color: '#8adbf7' },
    ]);
    case 'rock': return partsGeo([
      { geo: jitterGeo(new THREE.DodecahedronGeometry(1.7, 1), 0.7), pos: [0, 0.9, 0], scale: [1, 0.8, 1.1], color: rk },
      { geo: jitterGeo(new THREE.DodecahedronGeometry(1.0, 1), 0.4), pos: [1.5, 0.5, 0.6], color: rk },
    ]);
    case 'bush': return partsGeo([
      { geo: new THREE.IcosahedronGeometry(1.2, 1), pos: [0, 0.9, 0], scale: [1, 0.8, 1], color: bc[0] },
      { geo: new THREE.IcosahedronGeometry(0.9, 1), pos: [0.9, 0.7, 0.5], color: bc[1] },
      { geo: new THREE.IcosahedronGeometry(0.8, 1), pos: [-0.8, 0.6, -0.4], color: bc[0] },
    ]);
    case 'dead': return partsGeo([
      { geo: new THREE.CylinderGeometry(0.22, 0.45, 6.5, 6), pos: [0, 3.2, 0], color: '#241c18' },
      { geo: new THREE.CylinderGeometry(0.07, 0.16, 2.8, 5), pos: [0.9, 5.2, 0], rot: [0, 0, -0.9], color: '#241c18' },
      { geo: new THREE.CylinderGeometry(0.07, 0.15, 2.4, 5), pos: [-0.8, 4.3, 0.3], rot: [0.3, 0, 0.9], color: '#2c211b' },
      { geo: new THREE.CylinderGeometry(0.06, 0.12, 2.0, 5), pos: [0.2, 6.2, -0.7], rot: [-0.8, 0, 0.1], color: '#241c18' },
    ]);
    case 'spike': return partsGeo([
      { geo: new THREE.ConeGeometry(0.9, 7.5, 5), pos: [0, 3.7, 0], color: '#1d1722' },
      { geo: new THREE.ConeGeometry(0.6, 4.5, 5), pos: [1.0, 2.2, 0.3], rot: [0.1, 0, -0.3], color: '#2a2030' },
    ]);
    case 'dry': return partsGeo(Array.from({ length: 6 }, (_, i) => ({ geo: new THREE.ConeGeometry(0.14, 1.9, 4), pos: [Math.cos(i * 1.7) * 0.5, 0.9, Math.sin(i * 1.7) * 0.5], rot: [Math.sin(i * 1.7) * 0.4, 0, -Math.cos(i * 1.7) * 0.4], color: i % 2 ? '#8a6a3a' : '#a07c44' })));
    case 'mesa': {
      const g = new THREE.CylinderGeometry(20, 26, 50, 14, 12);
      const p = g.attributes.position, col = new Float32Array(p.count * 3);
      const bands = ['#7a3b24', '#a4552f', '#c27a45', '#b4623a', '#d9a066', '#9c4e2e', '#8a4228'].map((c) => new THREE.Color(c));
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const k = 1 + hsh(x, y * 0.3, z, 4) * 0.22;
        if (Math.abs(y) < 24.9) p.setXYZ(i, x * k, y, z * k);
        const c = bands[Math.floor(((y + 25) / 50) * 9) % bands.length];
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      g.translate(0, 25, 0);
      return g;
    }
  }
  return partsGeo([{ geo: new THREE.IcosahedronGeometry(1, 0), color: '#888888' }]);
}

/* ---------- textures ---------- */
function groundTexture(th) {
  const A = hex2rgb(th.gA), B = hex2rgb(th.gB), C = hex2rgb(th.gC);
  return canvasTex(512, 512, (g, w, h) => {
    pixelFill(g, w, h, (x, y) => {
      const n = tfbm(x / 64, y / 64, 8, 3, 4), m = tfbm(x / 16, y / 16, 32, 9, 2);
      let c = n < 0.5 ? lerpRGB(B, A, n * 2) : lerpRGB(A, C, (n - 0.5) * 2);
      const k = 0.88 + m * 0.24;
      return [c[0] * k, c[1] * k, c[2] * k];
    });
  });
}
function roadTexture(th, width) {
  const base = hex2rgb(th.roadCol);
  const W = 512, H = 1024;
  const tex = canvasTex(W, H, (g) => {
    const kind = th.road;
    pixelFill(g, W, H, (x, y) => {
      const n = tfbm(x / 16, y / 16, 32, 2, 3), f = tfbm(x / 4, y / 4, 128, 5, 2);
      const u = x / W;
      let wear = Math.exp(-Math.pow((u - 0.3) / 0.07, 2)) + Math.exp(-Math.pow((u - 0.7) / 0.07, 2));
      let k = 0.85 + n * 0.25 + (f - 0.5) * 0.18;
      if (kind === 'dirt') k = 0.8 + n * 0.45 + (f - 0.5) * 0.3 - wear * 0.22;
      else if (kind === 'snow') k = 0.92 + n * 0.1 - wear * 0.14;
      else k = 0.8 + n * 0.3 + (f - 0.5) * 0.25 - wear * 0.1;
      return [base[0] * k, base[1] * k, base[2] * k];
    });
    const pxu = H / (width * 2);
    if (kind === 'asphalt') {
      g.fillStyle = 'rgba(245,245,245,0.92)';
      g.fillRect(W * 0.035, 0, 9, H); g.fillRect(W * 0.965 - 9, 0, 9, H);
      g.fillStyle = 'rgba(255,205,60,0.92)';
      for (let i = 0; i < 4; i++) g.fillRect(W / 2 - 4, i * 256, 8, 128);
      const r = mulberry32(3); g.strokeStyle = 'rgba(20,20,20,0.3)'; g.lineWidth = 1.2;
      for (let i = 0; i < 14; i++) { g.beginPath(); let x = r() * W, y = r() * H; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += (r() - 0.2) * 40; g.lineTo(x, y); } g.stroke(); }
    } else if (kind === 'snow') {
      g.fillStyle = 'rgba(255,140,40,0.85)'; g.fillRect(W * 0.03, 0, 8, H); g.fillRect(W * 0.97 - 8, 0, 8, H);
      g.fillStyle = 'rgba(70,90,120,0.4)'; for (let i = 0; i < 4; i++) g.fillRect(W / 2 - 3, i * 256, 6, 128);
    } else {
      const r = mulberry32(8);
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,30,20' : '170,150,120'},${0.2 + r() * 0.3})`; g.beginPath(); g.arc(r() * W, r() * H, 1 + r() * 3.5, 0, TAU); g.fill(); }
    }
  }, { aniso: 8 });
  return tex;
}
function curbTexture(c) {
  return canvasTex(64, 64, (g, w, h) => { g.fillStyle = c[0]; g.fillRect(0, 0, w, h / 2); g.fillStyle = c[1]; g.fillRect(0, h / 2, w, h / 2); });
}
function lavaTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    pixelFill(g, w, h, (x, y) => {
      const n = tfbm(x / 32, y / 32, 8, 11, 4);
      const v = Math.pow(Math.abs(Math.sin(n * 9)), 0.35);
      return [255 * v, 90 * v + 10, 10 * v];
    });
  });
}
function waterNormal() {
  const sz = 256, hgt = new Float32Array(sz * sz);
  for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) hgt[y * sz + x] = tfbm(x / 32, y / 32, 8, 21, 4);
  return canvasTex(sz, sz, (g, w, h) => {
    pixelFill(g, w, h, (x, y) => {
      const dx = hgt[y * sz + ((x + 1) % sz)] - hgt[y * sz + ((x - 1 + sz) % sz)];
      const dy = hgt[((y + 1) % sz) * sz + x] - hgt[((y - 1 + sz) % sz) * sz + x];
      return [128 - dx * 400, 128 - dy * 400, 255];
    });
  }, { srgb: false });
}
function bannerTexture() {
  return canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, w, h);
    const s = 16;
    for (let y = 0; y < h; y += s) for (let x = 0; x < 3 * s * 2; x += s) { g.fillStyle = ((x / s + y / s) & 1) ? '#fff' : '#111'; g.fillRect(x, y, s, s); g.fillRect(w - x - s, y, s, s); }
    g.font = 'bold 76px "Trebuchet MS", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = '#3b1d00'; g.strokeText('🦖 DINO GRAND PRIX 🦕', w / 2, h / 2 + 4);
    g.fillStyle = '#ffc233'; g.fillText('🦖 DINO GRAND PRIX 🦕', w / 2, h / 2 + 4);
  }, { repeat: false });
}
function checkerTexture() {
  return canvasTex(128, 32, (g, w, h) => { const s = 16; for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { g.fillStyle = ((x / s + y / s) & 1) ? '#fff' : '#111'; g.fillRect(x, y, s, s); } });
}

/* ---------- Monde de course ---------- */
export function buildWorld(renderer, mapId, q) {
  const map = S.MAPS[mapId], th = map.theme, T = S.buildTrack(mapId);
  const scene = new THREE.Scene();
  const rnd = mulberry32(mapId.length * 997 + 13);
  const qf = [0.25, 0.5, 0.9][q];
  const world = { scene, T, map, th, q, anim: [], fx: null };

  /* ciel + environnement */
  const sun = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - (th.sunEl * Math.PI) / 180, (th.sunAz * Math.PI) / 180);
  const sky = new Sky();
  sky.scale.setScalar(10000);
  const u = sky.material.uniforms;
  u.turbidity.value = th.turb; u.rayleigh.value = th.ray; u.mieCoefficient.value = th.mie; u.mieDirectionalG.value = 0.86;
  u.sunPosition.value.copy(sun);
  const envScene = new THREE.Scene();
  envScene.add(sky);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(envScene);
  scene.environment = rt.texture;
  scene.add(sky);
  pm.dispose();
  scene.fog = new THREE.FogExp2(th.fog, th.fogD * 0.6);
  world.exposure = th.exp;

  /* lumières */
  const k = Math.max(0, Math.min(1, 1 - th.sunEl / 40));
  const dir = new THREE.DirectionalLight(new THREE.Color(1, 0.95 - 0.3 * k, 0.88 - 0.5 * k), 2.6 - 0.8 * k);
  scene.add(dir, dir.target);
  const hemi = new THREE.HemisphereLight(new THREE.Color(th.fog).lerp(new THREE.Color(0x9ec7ff), 0.4), new THREE.Color(th.gA), 0.45);
  scene.add(hemi);
  if (q > 0) {
    dir.castShadow = true;
    dir.shadow.mapSize.set(q === 2 ? 2048 : 1024, q === 2 ? 2048 : 1024);
    const sc = dir.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 420; sc.updateProjectionMatrix();
    dir.shadow.bias = -0.0004; dir.shadow.normalBias = 0.45;
  }
  world.sunDir = sun; world.dirLight = dir;

  /* champ de distance au circuit */
  const cell = 40, grid = new Map();
  for (let i = 0; i < T.N; i += 3) {
    const key = (Math.floor(T.x[i] / cell) + 200) * 1000 + (Math.floor(T.z[i] / cell) + 200);
    let a = grid.get(key); if (!a) { a = []; grid.set(key, a); } a.push(i);
  }
  const dist = (x, z) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let best = 1e9;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const a = grid.get((cx + dx + 200) * 1000 + (cz + dz + 200));
      if (!a) continue;
      for (let j = 0; j < a.length; j++) { const i = a[j], ex = x - T.x[i], ez = z - T.z[i], d = ex * ex + ez * ez; if (d < best) best = d; }
    }
    return best < 1e9 ? Math.sqrt(best) : 999;
  };
  const hillAmp = th.hill;
  const heightAt = (x, z) => {
    const d = dist(x, z) - T.halfW;
    const f = smooth(d, 24, 120);
    if (f <= 0) return 0;
    const n = fbm(x * 0.0021 + 7.3, z * 0.0021 - 3.1, 5, 5);
    let h = (n - 0.4) * 2.6 * hillAmp;
    if (h > 0) h *= 1 + h * 0.012;
    if (th.lake) h -= th.lake * 70 * smooth(x, 430, 720);
    return h * f;
  };
  world.heightAt = heightAt; world.dist = dist;

  /* terrain */
  const size = 4200, seg = q === 0 ? 150 : 230;
  const tg = new THREE.PlaneGeometry(size, size, seg, seg);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position, cols = new Float32Array(pos.count * 3);
  const A = hex2rgb(th.gA), B = hex2rgb(th.gB), C = hex2rgb(th.gC);
  const rockC = new THREE.Color(ROCK[mapId]), sandC = new THREE.Color(th.waterY > -2 ? '#d9c593' : '#6d604f');
  const hs = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) { const h = heightAt(pos.getX(i), pos.getZ(i)); hs[i] = h; pos.setY(i, h); }
  tg.computeVertexNormals();
  const nrm = tg.attributes.normal, tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), n = fbm(x * 0.012, z * 0.012, 9, 3);
    const c = n < 0.5 ? lerpRGB(B, A, n * 2) : lerpRGB(A, C, (n - 0.5) * 2);
    tmp.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
    const slope = 1 - nrm.getY(i);
    if (slope > 0.12) tmp.lerp(rockC, Math.min(1, (slope - 0.12) * 3.2));
    if (hs[i] < th.waterY + 1.4 && !th.lava) tmp.lerp(sandC, 0.85);
    if (hs[i] < th.waterY + 0.6 && th.lava) tmp.set('#1a1412');
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const gt = groundTexture(th);
  gt.repeat.set(size / 18, size / 18);
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: gt, vertexColors: true, roughness: 0.96, metalness: 0, bumpMap: gt, bumpScale: 1.2 }));
  terrain.receiveShadow = q > 0;
  scene.add(terrain);

  /* eau / lave */
  const wg = new THREE.PlaneGeometry(size, size);
  wg.rotateX(-Math.PI / 2);
  let waterMat;
  if (th.lava) {
    const lt = lavaTexture(); lt.repeat.set(60, 60);
    waterMat = new THREE.MeshStandardMaterial({ color: 0x220a02, emissive: 0xff5a14, emissiveMap: lt, emissiveIntensity: 1.5, roughness: 0.9 });
    world.lavaTex = lt;
  } else {
    const nm = waterNormal(); nm.repeat.set(220, 220);
    waterMat = new THREE.MeshStandardMaterial({ color: th.water, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.88, normalMap: nm, normalScale: new THREE.Vector2(0.6, 0.6) });
    world.waterNm = nm;
  }
  const water = new THREE.Mesh(wg, waterMat);
  water.position.y = th.waterY;
  scene.add(water);

  /* route */
  const ribbon = (latA, latB, y, vLen, mat) => {
    const n = T.N, P = new Float32Array((n + 1) * 6), UV = new Float32Array((n + 1) * 4), NR = new Float32Array((n + 1) * 6), idx = [];
    const tiles = Math.max(1, Math.round(T.L / vLen));
    for (let i = 0; i <= n; i++) {
      const kk = i % n, cx = T.x[kk], cz = T.z[kk], rx = T.rx[kk], rz = T.rz[kk], v = (i / n) * tiles;
      P.set([cx + rx * latA, y, cz + rz * latA, cx + rx * latB, y, cz + rz * latB], i * 6);
      UV.set([0, v, 1, v], i * 4); NR.set([0, 1, 0, 0, 1, 0], i * 6);
      if (i < n) { const a0 = i * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3; idx.push(a0, b0, a1, b0, b1, a1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); g.setAttribute('normal', new THREE.BufferAttribute(NR, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = q > 0;
    scene.add(m);
    return m;
  };
  const hw = T.halfW;
  const rt0 = roadTexture(th, map.width);
  ribbon(-hw, hw, 0.05, map.width * 2, new THREE.MeshStandardMaterial({ map: rt0, bumpMap: rt0, bumpScale: 0.6, roughness: th.road === 'asphalt' ? 0.85 : 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  // accotements
  const vt = groundTexture({ gA: th.gB, gB: th.gB, gC: th.gA });
  const vm = new THREE.MeshStandardMaterial({ map: vt, color: new THREE.Color(th.road === 'snow' ? '#dfe8ef' : '#b8a888'), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  ribbon(-hw - 9, -hw, 0.03, 18, vm); ribbon(hw, hw + 9, 0.03, 18, vm);
  // vibreurs
  const ct = curbTexture(th.curb);
  const cm = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  ribbon(-hw - 1.6, -hw, 0.08, 5, cm); ribbon(hw, hw + 1.6, 0.08, 5, cm);

  /* arche de départ */
  const arch = new THREE.Group();
  arch.position.set(T.x[0], 0, T.z[0]); arch.rotation.y = T.h[0];
  const pm1 = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.6, metalness: 0.4 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.8, 11, 1.8), pm1); p.position.set(s * (hw + 2), 5.5, 0); p.castShadow = true; arch.add(p);
    const st = new THREE.Mesh(new THREE.BoxGeometry(2.0, 11, 1.9), new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.6 })); st.scale.set(0.5, 1, 1.02); st.position.set(s * (hw + 2), 5.5, 0); arch.add(st);
  }
  const bt = bannerTexture();
  for (const s of [0, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 4, 4), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.7, emissive: 0xffffff, emissiveMap: bt, emissiveIntensity: 0.25 }));
    b.position.set(0, 9.2, s ? 0.2 : -0.2); b.rotation.y = s ? 0 : Math.PI; arch.add(b);
  }
  const ct2 = checkerTexture(); ct2.repeat.set(hw / 4, 1);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 2.4), new THREE.MeshStandardMaterial({ map: ct2, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  line.rotation.x = -Math.PI / 2; line.position.y = 0.09; arch.add(line);
  scene.add(arch);

  /* décor instancié */
  const addInst = (type, list, flat, shadow) => {
    if (!list.length) return;
    const geo = decorGeo(type, mapId);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: type === 'crystal' ? 0.25 : 0.92, metalness: type === 'crystal' ? 0.3 : 0, flatShading: !!flat, emissive: type === 'crystal' ? 0x2a6a88 : 0x000000, emissiveIntensity: 0.5 });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((it, i) => {
      qt.setFromAxisAngle(up, it.r); ps.set(it.x, it.y - 0.15, it.z); sc.set(it.s * it.sx, it.s, it.s * it.sx);
      m4.compose(ps, qt, sc); mesh.setMatrixAt(i, m4);
      const v = 0.78 + it.v * 0.4; col.setRGB(v * (1 + it.v * 0.06), v, v * (1 - it.v * 0.06)); mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = !!shadow && q === 2; mesh.receiveShadow = false; mesh.frustumCulled = false;
    scene.add(mesh);
  };
  const scatter = (type, count, minD, maxD, sMin, sMax) => {
    const list = [], target = Math.floor(count * qf);
    let tries = 0;
    while (list.length < target && tries < target * 8) {
      tries++;
      const i = rnd() * T.N, side = rnd() < 0.5 ? -1 : 1;
      const lat = side * (hw + minD + Math.pow(rnd(), 1.5) * (maxD - minD));
      const p = S.trackPos(T, i, lat);
      if (type === 'mesa' ? dist(p.x, p.z) < 70 : dist(p.x, p.z) - hw < minD - 1) continue;
      const y = heightAt(p.x, p.z);
      if (y < th.waterY + 0.5) continue;
      list.push({ x: p.x, y, z: p.z, r: rnd() * TAU, s: sMin + rnd() * (sMax - sMin), sx: 0.85 + rnd() * 0.3, v: rnd() });
    }
    addInst(type, list, type === 'rock' || type === 'mesa' || type === 'spike' || type === 'crystal', type === 'broad' || type === 'conifer' || type === 'palm' || type === 'mesa');
  };
  const sizes = { broad: [0.9, 1.7], cycad: [0.9, 1.6], fern: [0.9, 1.7], rock: [0.8, 2.6], bush: [0.9, 1.9], palm: [1.0, 1.6], conifer: [1.0, 1.8], crystal: [0.8, 2.2], dead: [0.8, 1.5], spike: [0.8, 2.0], dry: [0.9, 1.7], mesa: [0.7, 2.2] };
  for (const [type, count, mn, mx] of th.decor) { const s = sizes[type] || [1, 1.5]; scatter(type, count, mn, mx, s[0], s[1]); }
  // bordure visible de la piste (barrière naturelle)
  {
    const list = [];
    const step = q === 2 ? 2 : 3;
    for (let i = 0; i < T.N; i += step) for (const side of [-1, 1]) {
      const p = S.trackPos(T, i + rnd() * 1.5, side * (hw + 16 + rnd() * 2.5));
      list.push({ x: p.x, y: heightAt(p.x, p.z), z: p.z, r: rnd() * TAU, s: 1.5 + rnd() * 1.5, sx: 0.9 + rnd() * 0.3, v: rnd() });
    }
    addInst(th.edge, list, th.edge !== 'bush', false);
  }

  /* montagnes lointaines */
  {
    const mg = new THREE.IcosahedronGeometry(1, 4);
    const p = mg.attributes.position, col = new Float32Array(p.count * 3), base = new THREE.Color(th.mount), snow = new THREE.Color('#f4f8fb');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y < -0.05) { p.setXYZ(i, x, -0.05, z); }
      const r = 0.7 + fbm(x * 2.4 + 3, z * 2.4, 17, 4) * 0.7 + Math.abs(fbm(x * 5, z * 5, 3, 3) - 0.5) * 0.5;
      const h = Math.max(-0.05, y) * (0.6 + r * 0.9);
      p.setXYZ(i, x * r, h, z * r);
      const c = base.clone().multiplyScalar(0.75 + fbm(x * 6, z * 6, 31, 2) * 0.5);
      if (th.mountSnow ? h > 0.35 : h > 0.8) c.lerp(snow, th.mountSnow ? 0.9 : 0.5);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    mg.computeVertexNormals();
    const n = 20, mm = new THREE.InstancedMesh(mg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), n);
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.2, rad = 1050 + rnd() * 350, w = 260 + rnd() * 240, hgt = 200 + rnd() * 260;
      qt.setFromAxisAngle(up, rnd() * TAU); ps.set(Math.cos(a) * rad, -10, Math.sin(a) * rad); sc.set(w, hgt, w * (0.8 + rnd() * 0.4));
      m4.compose(ps, qt, sc); mm.setMatrixAt(i, m4);
    }
    mm.instanceMatrix.needsUpdate = true; mm.frustumCulled = false;
    scene.add(mm);
  }

  /* volcan central */
  if (th.volcano) {
    let R0 = 1e9;
    for (let i = 0; i < T.N; i++) R0 = Math.min(R0, Math.hypot(T.x[i], T.z[i]));
    const rb = Math.max(60, R0 - 70), hgt = rb * 1.05;
    const vg = new THREE.CylinderGeometry(rb * 0.16, rb, hgt, 40, 18, true);
    const p = vg.attributes.position, col = new Float32Array(p.count * 3), dark = new THREE.Color('#2a2220'), lav = new THREE.Color('#ff6a18');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      const k = 1 + (fbm(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + y * 0.02, 41, 4) - 0.5) * 0.35;
      p.setXYZ(i, x * k, y, z * k);
      const streak = Math.pow(Math.max(0, Math.sin(a * 7 + fbm(a * 3, y * 0.03, 8, 3) * 6)), 12) * smooth(y, -hgt * 0.2, hgt * 0.5);
      const c = dark.clone().multiplyScalar(0.7 + fbm(x * 0.05, z * 0.05, 4, 3) * 0.7).lerp(lav, Math.min(1, streak));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    vg.setAttribute('color', new THREE.BufferAttribute(col, 3)); vg.computeVertexNormals();
    const vol = new THREE.Mesh(vg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, emissive: 0x551a05, emissiveIntensity: 0.3 }));
    vol.position.set(0, hgt / 2 - 8, 0);
    scene.add(vol);
    const crater = new THREE.Mesh(new THREE.CircleGeometry(rb * 0.15, 24), new THREE.MeshBasicMaterial({ color: 0xff7a1c }));
    crater.rotation.x = -Math.PI / 2; crater.position.set(0, hgt - 8, 0); scene.add(crater);
    world.volcanoTop = new THREE.Vector3(0, hgt - 6, 0);
  }

  /* troupeau décoratif + ptérodactyles */
  {
    const nh = Math.max(1, Math.round(th.herd * (q === 0 ? 0.4 : 1)));
    world.herd = [];
    for (let i = 0; i < nh * 8 && world.herd.length < nh; i++) {
      const a = rnd() * TAU, r = rnd() * 500;
      const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r * 1.0;
      if (dist(x, z) - hw < 90) continue;
      const y = heightAt(x, z);
      if (y < th.waterY + 1.5) continue;
      const d = makeDino('brachio');
      d.root.position.set(x, y, z); d.root.rotation.y = rnd() * TAU; d.root.scale.setScalar(1.1 + rnd() * 0.4);
      scene.add(d.root); world.herd.push(d);
    }
    world.ptero = [];
    for (let i = 0; i < Math.round(th.ptero * (q === 0 ? 0.4 : 1)); i++) {
      const p = makePtero(); p.scale.setScalar(2.2);
      p.userData.c = [(rnd() - 0.5) * 700, (rnd() - 0.5) * 700]; p.userData.r = 90 + rnd() * 240; p.userData.a = rnd() * TAU; p.userData.sp = (0.12 + rnd() * 0.12) * (rnd() < 0.5 ? 1 : -1); p.userData.h = 60 + rnd() * 70;
      scene.add(p); world.ptero.push(p);
    }
  }

  let tt = 0, smokeAcc = 0;
  world.update = (dt, focus, hurry) => {
    tt += dt;
    if (focus) {
      dir.position.set(focus.x + sun.x * 150, sun.y * 150, focus.z + sun.z * 150);
      dir.target.position.set(focus.x, 0, focus.z);
      dir.target.updateMatrixWorld();
    }
    if (world.lavaTex) { world.lavaTex.offset.x += dt * 0.004; world.lavaTex.offset.y += dt * 0.006; }
    if (world.waterNm) { world.waterNm.offset.x += dt * 0.003; world.waterNm.offset.y += dt * 0.0045; }
    for (const h of world.herd) h.update(dt, 0, 0);
    for (const p of world.ptero) {
      const u = p.userData; u.a += u.sp * dt;
      const x = u.c[0] + Math.cos(u.a) * u.r, z = u.c[1] + Math.sin(u.a) * u.r;
      p.position.set(x, u.h + Math.sin(tt * 0.7 + u.r) * 4, z);
      p.rotation.y = Math.atan2(-Math.sin(u.a) * Math.sign(u.sp), Math.cos(u.a) * Math.sign(u.sp)) + Math.PI / 2 * 0;
      p.rotation.y = Math.atan2(Math.sign(u.sp) * -Math.sin(u.a), Math.sign(u.sp) * Math.cos(u.a));
      p.rotation.z = Math.sign(u.sp) * -0.25;
      u.flap(tt + u.r);
    }
    if (world.volcanoTop && world.fx) {
      smokeAcc += dt;
      while (smokeAcc > 0.25) { smokeAcc -= 0.25; world.fx.smoke(world.volcanoTop.x + (Math.random() - 0.5) * 20, world.volcanoTop.y, world.volcanoTop.z + (Math.random() - 0.5) * 20, true); }
    }
  };
  return world;
}

/* ---------- Salle d'exposition (menu) ---------- */
export function buildShowroom(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0c1a12');
  scene.fog = new THREE.Fog('#0c1a12', 25, 70);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  const floorTex = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    gr.addColorStop(0, '#2c4a35'); gr.addColorStop(0.5, '#15291d'); gr.addColorStop(1, '#0c1a12');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { repeat: false });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; floor.receiveShadow = true; scene.add(floor);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.9, 0.4, 56), new THREE.MeshStandardMaterial({ color: 0x23352a, roughness: 0.5, metalness: 0.4 }));
  plat.position.y = 0.2; plat.receiveShadow = true; scene.add(plat);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5.75, 0.07, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffb703 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.42; scene.add(ring);
  const key = new THREE.DirectionalLight(0xfff0d8, 2.6); key.position.set(6, 9, 7); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); const sc = key.shadow.camera; sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6fb8ff, 1.6); rim.position.set(-7, 4, -6); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x9ec7ff, 0x1c2a20, 0.5));
  // quelques fougères décoratives autour
  const slot = new THREE.Group(); slot.position.y = 0.4; scene.add(slot);
  const deco = new THREE.Group(); scene.add(deco);
  const rr = mulberry32(5);
  for (let i = 0; i < 14; i++) {
    const a = rr() * TAU, r = 11 + rr() * 14;
    const m = new THREE.Mesh(decorGeo(i % 3 === 0 ? 'cycad' : i % 3 === 1 ? 'fern' : 'broad', 'jungle'), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); m.scale.setScalar(1.2 + rr()); m.rotation.y = rr() * TAU; deco.add(m);
  }
  return { scene, slot };
}
export { makeKart, makeDriver };
