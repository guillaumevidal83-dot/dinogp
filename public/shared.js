/* Dino Grand Prix — données et maths partagées (serveur + client) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Shared = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const fwd = (h) => [Math.sin(h), Math.cos(h)];
  const rgt = (h) => [-Math.cos(h), Math.sin(h)];
  const angDiff = (a, b) => {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };

  /* ---------- Personnages ---------- */
  // spd: vitesse max, acc: accélération, turn: maniabilité, boost: durée turbo
  const CHARS = [
    { id: 'rex', name: 'Rex', desc: 'Aventurier équilibré', spd: 1, acc: 1, turn: 1, boost: 1, mass: 1 },
    { id: 'luna', name: 'Luna', desc: 'Paléontologue — très maniable', spd: 0.98, acc: 1, turn: 1.1, boost: 1, mass: 0.9 },
    { id: 'fossil', name: 'Pr Fossile', desc: 'Savant — démarre fort', spd: 0.97, acc: 1.14, turn: 1.03, boost: 1, mass: 0.95 },
    { id: 'gorg', name: 'Gorg', desc: 'Homme des cavernes — costaud', spd: 1.02, acc: 0.96, turn: 0.95, boost: 1, mass: 1.3 },
    { id: 'raptora', name: 'Raptora', desc: 'Déguisée en raptor — rapide', spd: 1.05, acc: 0.93, turn: 1, boost: 1, mass: 0.85 },
    { id: 'mia', name: 'Mia', desc: 'La gamine — turbos plus longs', spd: 0.99, acc: 1.02, turn: 1.04, boost: 1.35, mass: 0.8 },
  ];

  /* ---------- Véhicules ---------- */
  const VEHS = [
    { id: 'jeep', name: 'Jeep Safari', desc: 'Polyvalente', max: 57, acc: 27, turn: 1.0, grip: 6.5, mass: 1.0, off: 0.55 },
    { id: 'buggy', name: 'Buggy Éclair', desc: 'Vitesse de pointe', max: 63, acc: 22, turn: 0.9, grip: 5.8, mass: 0.8, off: 0.5 },
    { id: 'monster', name: 'Monster Truck', desc: 'Lourd, passe partout', max: 53, acc: 21, turn: 0.82, grip: 6.2, mass: 1.7, off: 0.85 },
    { id: 'quad', name: 'Quad Raptor', desc: 'Agile et nerveux', max: 55, acc: 35, turn: 1.2, grip: 7.0, mass: 0.7, off: 0.6 },
    { id: 'stone', name: 'Pierrafeu Mobile', desc: 'Dérapages explosifs', max: 51, acc: 29, turn: 1.1, grip: 4.6, mass: 1.2, off: 0.62 },
  ];

  const COLORS = ['#d62828', '#f77f00', '#fcbf49', '#2a9d8f', '#1d70c8', '#6a4c93', '#e56b9f', '#f1f1f1', '#222831', '#7cb518'];

  /* ---------- Objets ---------- */
  const ITEMS = {
    rock: { name: 'Rocher', icon: '🪨', n: 1, desc: 'Lance un rocher droit devant' },
    dart: { name: 'Fléchettes', icon: '💉', n: 3, desc: '3 fléchettes tranquillisantes' },
    egg: { name: 'Œuf chercheur', icon: '🥚', n: 1, desc: 'Poursuit une cible' },
    bone: { name: 'Piège à os', icon: '🦴', n: 1, desc: 'Pose un piège sur la route : qui roule dessus tourne sur lui-même (dinos aussi)' },
    turbo: { name: 'Turbo', icon: '🔥', n: 1, desc: 'Gros coup d\'accélérateur' },
    shield: { name: 'Bouclier', icon: '🛡️', n: 1, desc: 'Bloque un coup' },
    meteor: { name: 'Météorite', icon: '☄️', n: 1, desc: 'Écrase le premier' },
  };

  /* ---------- Dinosaures ---------- */
  const DINOS = {
    trice: { name: 'Tricératops', r: 3.4, beh: 'cross', spd: 5.8 },
    stego: { name: 'Stégosaure', r: 3.3, beh: 'cross', spd: 4.6 },
    anky: { name: 'Ankylosaure', r: 3.0, beh: 'cross', spd: 4.2 },
    raptor: { name: 'Vélociraptor', r: 1.9, beh: 'patrol', spd: 24 },
    trex: { name: 'T-Rex', r: 4.5, beh: 'ambush', spd: 21 },
    mosa: { name: 'Mosasaure', r: 4.4, beh: 'cross', spd: 12 },
    plesio: { name: 'Plésiosaure', r: 3.6, beh: 'cross', spd: 6.2 },
    ichthy: { name: 'Ichtyosaure', r: 2.1, beh: 'patrol', spd: 26 },
    spino: { name: 'Spinosaure', r: 4.5, beh: 'ambush', spd: 21 },
  };

  /* ---------- Cartes ---------- */
  const MAPS = {
    jungle: {
      id: 'jungle', name: 'Jungle du Jurassique', desc: 'Piste de terre sous la canopée. Tricératops et raptors partout.',
      R: 320, sx: 1.18, sz: 0.88, harm: [[2, 0.17, 0.5], [3, 0.13, 1.9], [5, 0.075, 0.3], [8, 0.028, 1.0]], width: 26, grip: 1,
      dinos: [
        { k: 'trice', s: 0.09 }, { k: 'raptor', s: 0.2, L: 90 }, { k: 'stego', s: 0.31 }, { k: 'trex', s: 0.43, side: 1 },
        { k: 'raptor', s: 0.55, L: 100 }, { k: 'trice', s: 0.66 }, { k: 'anky', s: 0.77 }, { k: 'trex', s: 0.9, side: -1 },
      ],
      theme: {
        sunEl: 38, sunAz: 150, turb: 4, ray: 1.6, mie: 0.006, exp: 0.55,
        fog: 0x9bb8a0, fogD: 0.0016, gA: '#3f7a2c', gB: '#2c5a1e', gC: '#58903a', road: 'dirt', roadCol: '#7a5c3a',
        water: 0x2e7f86, waterY: -4, hill: 38, lake: 0.0, curb: ['#d9c9a0', '#6d5434'],
        decor: [['broad', 900, 12, 150], ['cycad', 400, 10, 120], ['fern', 900, 8, 90], ['rock', 120, 12, 160], ['bush', 400, 6, 70]],
        edge: 'bush', mount: 0x40634a, mountSnow: false, herd: 5, ptero: 4,
      },
    },
    volcano: {
      id: 'volcano', name: 'Vallée du Volcan', desc: 'Lave, cendres et virages serrés. Le T-Rex rôde.',
      R: 300, sx: 1.05, sz: 1.0, harm: [[3, 0.18, 0.2], [4, 0.11, 1.0], [7, 0.05, 2.0], [10, 0.017, 0.5]], width: 24, grip: 1,
      dinos: [
        { k: 'raptor', s: 0.07, L: 80 }, { k: 'trice', s: 0.16 }, { k: 'trex', s: 0.27, side: -1 }, { k: 'stego', s: 0.38 },
        { k: 'raptor', s: 0.5, L: 80 }, { k: 'anky', s: 0.6 }, { k: 'trex', s: 0.72, side: 1 }, { k: 'trice', s: 0.83 }, { k: 'raptor', s: 0.93, L: 70 },
      ],
      theme: {
        sunEl: 9, sunAz: 200, turb: 14, ray: 0.7, mie: 0.02, exp: 0.5,
        fog: 0x5a3a30, fogD: 0.0026, gA: '#3a2f2c', gB: '#241c1a', gC: '#4f3a30', road: 'asphalt', roadCol: '#2c2a2b',
        water: 0xff5a14, waterY: -3, hill: 55, lake: 0.0, lava: true, curb: ['#ff7a1a', '#241c1a'],
        decor: [['dead', 500, 12, 150], ['rock', 500, 10, 170], ['spike', 220, 14, 160], ['bush', 150, 8, 60]],
        edge: 'rock', mount: 0x2a2220, mountSnow: false, volcano: true, herd: 2, ptero: 6,
      },
    },
    canyon: {
      id: 'canyon', name: 'Canyon du Crétacé', desc: 'Mesas rouges, longues lignes droites et grands espaces.',
      R: 350, sx: 1.28, sz: 0.82, harm: [[2, 0.21, 1.2], [3, 0.11, 0.2], [6, 0.055, 1.0], [9, 0.02, 2.0]], width: 30, grip: 1,
      dinos: [
        { k: 'stego', s: 0.08 }, { k: 'raptor', s: 0.18, L: 110 }, { k: 'trex', s: 0.3, side: 1 }, { k: 'trice', s: 0.42 },
        { k: 'anky', s: 0.52 }, { k: 'raptor', s: 0.62, L: 110 }, { k: 'trice', s: 0.74 }, { k: 'trex', s: 0.86, side: -1 },
      ],
      theme: {
        sunEl: 14, sunAz: 235, turb: 9, ray: 1.1, mie: 0.012, exp: 0.55,
        fog: 0xe0b48c, fogD: 0.0013, gA: '#b6753f', gB: '#8e5530', gC: '#cf9455', road: 'asphalt', roadCol: '#5a504a',
        water: 0x3a8fa0, waterY: -6, hill: 30, lake: 0.0, curb: ['#f2e3c8', '#b5452b'],
        decor: [['mesa', 60, 80, 700], ['rock', 500, 10, 170], ['cycad', 160, 12, 120], ['dry', 400, 8, 90]],
        edge: 'rock', mount: 0x9a5a38, mountSnow: false, herd: 4, ptero: 5,
      },
    },
    ice: {
      id: 'ice', name: 'Toundra Glaciaire', desc: 'Neige et verglas : la route glisse ! Dinos à fourrure givrée.',
      R: 310, sx: 1.1, sz: 0.95, harm: [[1, 0.12, 0], [2, 0.14, 2.0], [4, 0.095, 0.5], [7, 0.038, 1.5]], width: 26, grip: 0.62,
      dinos: [
        { k: 'trice', s: 0.1 }, { k: 'raptor', s: 0.22, L: 90 }, { k: 'stego', s: 0.33 }, { k: 'trex', s: 0.45, side: -1 },
        { k: 'anky', s: 0.57 }, { k: 'raptor', s: 0.68, L: 90 }, { k: 'trice', s: 0.79 }, { k: 'trex', s: 0.91, side: 1 },
      ],
      theme: {
        sunEl: 20, sunAz: 120, turb: 2.2, ray: 2.4, mie: 0.004, exp: 0.62,
        fog: 0xcfe0ee, fogD: 0.0018, gA: '#e8f0f6', gB: '#c3d6e6', gC: '#f6fbff', road: 'snow', roadCol: '#9fb0be',
        water: 0x5fa3c8, waterY: -3, hill: 45, lake: 0.0, curb: ['#3fa6e0', '#ffffff'],
        decor: [['conifer', 900, 12, 150], ['crystal', 220, 14, 150], ['rock', 260, 10, 160], ['bush', 160, 8, 70]],
        edge: 'crystal', mount: 0xdde9f3, mountSnow: true, herd: 3, ptero: 3,
      },
    },
    beach: {
      id: 'beach', name: 'Côte des Fossiles', desc: 'Plage tropicale au lever du soleil. Piste rapide et fluide.',
      R: 335, sx: 0.92, sz: 1.2, harm: [[2, 0.15, 2.5], [3, 0.17, 0.7], [5, 0.075, 3.0], [8, 0.022, 1.0]], width: 28, grip: 0.92,
      dinos: [
        { k: 'raptor', s: 0.06, L: 90 }, { k: 'stego', s: 0.17 }, { k: 'trice', s: 0.28 }, { k: 'trex', s: 0.4, side: 1 },
        { k: 'anky', s: 0.5 }, { k: 'raptor', s: 0.6, L: 100 }, { k: 'trice', s: 0.72 }, { k: 'trex', s: 0.84, side: -1 }, { k: 'stego', s: 0.94 },
      ],
      theme: {
        sunEl: 8, sunAz: 70, turb: 6, ray: 1.8, mie: 0.01, exp: 0.55,
        fog: 0xf0c8a8, fogD: 0.0014, gA: '#d8c28a', gB: '#bba56c', gC: '#e8d8a4', road: 'asphalt', roadCol: '#4c4c52',
        water: 0x1f9bb0, waterY: -1.2, hill: 22, lake: 1.0, curb: ['#ffffff', '#e63946'],
        decor: [['palm', 600, 12, 150], ['rock', 260, 10, 160], ['bush', 400, 8, 80], ['cycad', 160, 12, 100]],
        edge: 'bush', mount: 0x587a6a, mountSnow: false, herd: 5, ptero: 6,
      },
    },
    lagoon: {
      id: 'lagoon', name: 'Lagon des Abysses', desc: 'Course en BATEAU sur l\'océan ! Mosasaures bondissants, plésiosaures et spinosaures.',
      R: 330, sx: 1.15, sz: 0.9, harm: [[2, 0.15, 1.0], [3, 0.14, 2.4], [5, 0.07, 0.8], [7, 0.028, 2.2]], width: 30, grip: 0.8, wall: 7,
      dinos: [
        { k: 'ichthy', s: 0.06, L: 80 }, { k: 'plesio', s: 0.16 }, { k: 'spino', s: 0.27, side: -1 }, { k: 'mosa', s: 0.37 },
        { k: 'ichthy', s: 0.49, L: 100 }, { k: 'spino', s: 0.6, side: 1 }, { k: 'mosa', s: 0.71 }, { k: 'plesio', s: 0.81 }, { k: 'mosa', s: 0.91 },
      ],
      theme: {
        sunEl: 26, sunAz: 100, turb: 3.2, ray: 1.4, mie: 0.006, exp: 0.55,
        fog: 0xa9d6e6, fogD: 0.0013, gA: '#dcc994', gB: '#c2b07a', gC: '#ecdca8', road: 'asphalt', roadCol: '#3c4650',
        water: 0x0b8fb0, waterY: -1.4, hill: 0, lake: 0, sea: true, curb: ['#ffffff', '#e63946'],
        decor: [], edge: null, mount: 0x3f6f64, mountK: 0.4, mountSnow: false, herd: 0, ptero: 6,
      },
    },
  };
  const MAP_IDS = Object.keys(MAPS);

  /* ---------- Circuit : spline fermée rééchantillonnée ---------- */
  const N = 720;
  const cache = {};

  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
  }

  function buildTrack(id) {
    if (cache[id]) return cache[id];
    const m = MAPS[id];
    const M = 48;
    const pts = [];
    for (let i = 0; i < M; i++) {
      const th = (i / M) * TAU;
      let r = 1;
      for (const h of m.harm) r += h[1] * Math.cos(h[0] * th + h[2]);
      r *= m.R;
      pts.push([Math.cos(th) * r * m.sx, Math.sin(th) * r * m.sz]);
    }
    const dense = [];
    const SUB = 24;
    for (let i = 0; i < M; i++) {
      const p0 = pts[(i - 1 + M) % M], p1 = pts[i], p2 = pts[(i + 1) % M], p3 = pts[(i + 2) % M];
      for (let j = 0; j < SUB; j++) dense.push(catmull(p0, p1, p2, p3, j / SUB));
    }
    const D = dense.length;
    const cum = new Float64Array(D + 1);
    for (let i = 0; i < D; i++) {
      const a = dense[i], b = dense[(i + 1) % D];
      cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const L = cum[D];
    const ds = L / N;
    const x = new Float32Array(N), z = new Float32Array(N);
    let seg = 0;
    for (let i = 0; i < N; i++) {
      const target = i * ds;
      while (seg < D - 1 && cum[seg + 1] < target) seg++;
      const a = dense[seg], b = dense[(seg + 1) % D];
      const f = (target - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      x[i] = a[0] + (b[0] - a[0]) * f;
      z[i] = a[1] + (b[1] - a[1]) * f;
    }
    const tx = new Float32Array(N), tz = new Float32Array(N), rx = new Float32Array(N), rz = new Float32Array(N);
    const h = new Float32Array(N), k = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      let dx = x[b] - x[a], dz = z[b] - z[a];
      const l = Math.hypot(dx, dz) || 1;
      tx[i] = dx / l; tz[i] = dz / l;
      rx[i] = -tz[i]; rz[i] = tx[i];
      h[i] = Math.atan2(tx[i], tz[i]);
    }
    for (let i = 0; i < N; i++) k[i] = Math.abs(angDiff(h[(i + 1) % N], h[i])) / ds;
    const T = { id, N, ds, L, halfW: m.width / 2, x, z, tx, tz, rx, rz, h, k };
    cache[id] = T;
    return T;
  }

  // index d'échantillon le plus proche (fenêtre autour de hint, sinon recherche globale)
  function nearest(T, px, pz, hint, win) {
    const n = T.N;
    let best = -1, bd = 1e18;
    if (hint >= 0) {
      for (let o = -win; o <= win; o++) {
        const i = (hint + o + n * 4) % n;
        const dx = px - T.x[i], dz = pz - T.z[i];
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      const lim = win * T.ds * 0.6;
      if (bd < lim * lim) return best;
    }
    bd = 1e18;
    for (let i = 0; i < n; i++) {
      const dx = px - T.x[i], dz = pz - T.z[i];
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // position monde pour (s: indice flottant, lat: décalage latéral vers la droite)
  function trackPos(T, s, lat) {
    const n = T.N;
    const sf = ((s % n) + n) % n;
    const i0 = Math.floor(sf), i1 = (i0 + 1) % n, f = sf - i0;
    const x = T.x[i0] + (T.x[i1] - T.x[i0]) * f, z = T.z[i0] + (T.z[i1] - T.z[i0]) * f;
    const rx = T.rx[i0] + (T.rx[i1] - T.rx[i0]) * f, rz = T.rz[i0] + (T.rz[i1] - T.rz[i0]) * f;
    const rl = Math.hypot(rx, rz) || 1;
    const tx = T.tx[i0] + (T.tx[i1] - T.tx[i0]) * f, tz = T.tz[i0] + (T.tz[i1] - T.tz[i0]) * f;
    return { x: x + (rx / rl) * lat, z: z + (rz / rl) * lat, h: Math.atan2(tx, tz), cx: x, cz: z, rx: rx / rl, rz: rz / rl };
  }

  // positions des caisses d'objets
  function boxLayout(T) {
    const rows = [0.05, 0.27, 0.49, 0.71, 0.9];
    const lats = [-T.halfW * 0.62, -T.halfW * 0.21, T.halfW * 0.21, T.halfW * 0.62];
    const out = [];
    rows.forEach((r, ri) => lats.forEach((l, li) => {
      const p = trackPos(T, r * T.N, l);
      out.push({ id: ri * 4 + li, x: p.x, z: p.z });
    }));
    return out;
  }

  // case de départ k (0 = pole)
  function gridSlot(T, k) {
    const row = Math.floor(k / 2), side = k % 2 === 0 ? -1 : 1;
    const dist = 9 + row * 8 + (k % 2) * 3;
    const s = T.N - dist / T.ds;
    const p = trackPos(T, s, side * T.halfW * 0.33);
    return { x: p.x, z: p.z, h: p.h, prog: -dist / T.ds, idx: Math.round(s) % T.N };
  }

  return { TAU, clamp, lerp, fwd, rgt, angDiff, CHARS, VEHS, COLORS, ITEMS, DINOS, MAPS, MAP_IDS, N, buildTrack, nearest, trackPos, boxLayout, gridSlot };
});
