import * as THREE from 'three';
import { buildWorld, buildShowroom } from './world.js';
import * as M from './models.js';
import { Fx } from './fx.js';
import { Sfx } from './audio.js';
import { disposeScene } from './util.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const S = window.Shared;
const $ = (id) => document.getElementById(id);
const clamp = S.clamp, TAU = S.TAU;
const sfx = new Sfx();
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;

/* ===================== Rendu ===================== */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 12000);
let Q = 1;
const saved = JSON.parse(localStorage.getItem('dgp_prof') || '{}');
const G = {
  mode: 'menu', id: 0, name: saved.name || '', ch: saved.ch | 0, veh: saved.veh | 0, col: saved.col | 0,
  q: saved.q || 'auto', sound: saved.sound !== false, music: saved.music !== false, auto: saved.auto !== false, room: null,
};
function saveProf() { localStorage.setItem('dgp_prof', JSON.stringify({ name: G.name, ch: G.ch, veh: G.veh, col: G.col, q: G.q, sound: G.sound, music: G.music, auto: G.auto })); }
function resolveQ() { Q = G.q === 'auto' ? (isTouch ? 1 : 2) : +G.q; return Q; }
function resize() {
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(Q === 0 ? 1 : Q === 1 ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applyViewOffset();
}
function applyViewOffset() {
  // dans les menus, décale la vue pour que le kart reste visible à côté des panneaux
  if (G.mode === 'menu' || G.mode === 'lobby') {
    const portrait = innerHeight > innerWidth;
    if (portrait) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.2, innerWidth, innerHeight);
    else camera.clearViewOffset();
  } else camera.clearViewOffset();
}
window.addEventListener('resize', resize);
resolveQ(); renderer.shadowMap.enabled = Q > 0; resize();

/* ===================== Réseau ===================== */
const net = { ws: null, open: false, queue: [], retry: 0 };
function send(o) { if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(o)); }
function setStatus(t) { const s = $('status'); if (t) { s.textContent = t; s.classList.remove('hide'); } else s.classList.add('hide'); }
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(proto + '://' + location.host);
  net.ws = ws;
  ws.onopen = () => {
    net.open = true; setStatus(null);
    send({ t: 'hello', name: G.name || 'Pilote', ch: G.ch, veh: G.veh, col: G.col });
    send({ t: 'list' });
    const code = new URLSearchParams(location.search).get('room');
    if (code && !net.joined) { net.joined = true; G.name = G.name || 'Pilote'; send({ t: 'join', code }); history.replaceState(null, '', location.pathname); }
  };
  ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch (err) { console.error(err); showErr(err); } };
  ws.onclose = () => {
    net.open = false;
    setStatus('Connexion perdue… reconnexion');
    if (R) leaveRace(true);
    if (G.mode === 'lobby') { G.room = null; setMode('menu'); }
    setTimeout(connect, 1500);
  };
}
function showErr(e) { const d = $('err'); d.classList.remove('hide'); d.textContent = 'Erreur : ' + (e && (e.stack || e.message) || e); }
setInterval(() => { if (net.open) send({ t: 'ping', c: Date.now() }); }, 15000);

/* ===================== Interface : garage ===================== */
const CH_ICONS = ['🤠', '👩‍🔬', '👴', '🧔', '🦖', '👧'];
const VEH_ICONS = ['🚙', '🏎️', '🛻', '🏍️', '🪨'];

/* ===== Miniatures fidèles : rendues depuis les vrais modèles 3D ===== */
let thumbEnv = null;
function renderThumb(obj, dir, fov = 28, size = 112) {
  const sc = new THREE.Scene();
  if (!thumbEnv) { const pm = new THREE.PMREMGenerator(renderer); thumbEnv = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
  sc.environment = thumbEnv;
  const key = new THREE.DirectionalLight(0xfff2dc, 2.2); key.position.set(4, 7, 6); sc.add(key);
  sc.add(new THREE.HemisphereLight(0xbfd8ff, 0x2a3a2a, 0.7));
  sc.add(obj);
  const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() * 0.5;
  const cam = new THREE.PerspectiveCamera(fov, 1, 0.1, 300);
  cam.position.copy(c).addScaledVector(dir.clone().normalize(), r / Math.sin((fov * Math.PI) / 360) * 1.02);
  cam.lookAt(c);
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const oc = new THREE.Color(); renderer.getClearColor(oc); const oa = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam);
  const px = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  renderer.setRenderTarget(null); renderer.setClearColor(oc, oa); rt.dispose();
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), id = g.createImageData(size, size);
  for (let y = 0; y < size; y++) id.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  g.putImageData(id, 0, 0);
  disposeScene(obj);
  return cv.toDataURL('image/png');
}
function makeThumbs() {
  const th = { ch: [], veh: [], boat: [] };
  try {
    for (let i = 0; i < S.CHARS.length; i++) {
      const d = M.makeDriver(i); d.scale.setScalar(1);
      const g = new THREE.Group(); g.add(d);
      // gros plan sur la tête et le buste
      const head = new THREE.Group(); head.add(g);
      const box = new THREE.Box3(); box.setFromObject(d);
      th.ch.push(renderThumb(g, new THREE.Vector3(0.35, 0.18, 1), 24));
    }
    for (let i = 0; i < S.VEHS.length; i++) {
      const k = M.makeKart(i, S.COLORS[0]);
      th.veh.push(renderThumb(k.root, new THREE.Vector3(1, 0.55, 1.1), 30));
      th.boat.push(renderThumb(M.makeKart(i, S.COLORS[0], true).root, new THREE.Vector3(1, 0.55, 1.1), 30, 80));
    }
  } catch (e) { console.warn('miniatures', e); return null; }
  return th;
}

function buildGarage() {
  const TH = makeThumbs();
  $('inName').value = G.name;
  const chars = $('chars'), vehs = $('vehs'), cols = $('cols');
  S.CHARS.forEach((c, i) => {
    const b = document.createElement('button'); b.className = 'opt'; b.innerHTML = (TH ? '<img class="ic" alt="" src="' + TH.ch[i] + '">' : '<span class="ic">' + CH_ICONS[i] + '</span>') + c.name;
    b.onclick = () => { G.ch = i; garageChanged(); }; chars.appendChild(b);
  });
  S.VEHS.forEach((v, i) => {
    const b = document.createElement('button'); b.className = 'opt'; b.innerHTML = (TH ? '<span class="icw"><img class="ic" alt="" src="' + TH.veh[i] + '"><img class="bt" alt="" title="' + v.boat + '" src="' + TH.boat[i] + '"></span>' : '<span class="ic">' + VEH_ICONS[i] + '</span>') + v.name.split(' ')[0];
    b.onclick = () => { G.veh = i; garageChanged(); }; vehs.appendChild(b);
  });
  S.COLORS.forEach((c, i) => {
    const b = document.createElement('button'); b.className = 'sw'; b.style.background = c;
    b.onclick = () => { G.col = i; garageChanged(); }; cols.appendChild(b);
  });
  garageChanged(true);
}
function garageChanged(first) {
  [...$('chars').children].forEach((b, i) => b.classList.toggle('sel', i === G.ch));
  [...$('vehs').children].forEach((b, i) => b.classList.toggle('sel', i === G.veh));
  [...$('cols').children].forEach((b, i) => b.classList.toggle('sel', i === G.col));
  const c = S.CHARS[G.ch], v = S.VEHS[G.veh];
  $('charDesc').textContent = c.name + ' — ' + c.desc;
  const bar = (n, val) => '<div class="stat"><span>' + n + '</span><div class="bar"><i style="width:' + Math.round(clamp(val, 0.05, 1) * 100) + '%"></i></div></div>';
  $('stats').innerHTML = '<div class="muted" style="margin-top:4px"><b>' + v.name + '</b> — ' + v.desc + '</div>' +
    bar('Vitesse', (v.max * c.spd - 45) / 25) + bar('Accélération', (v.acc * c.acc - 18) / 20) + bar('Maniabilité', (v.turn * c.turn - 0.6) / 0.7) + bar('Poids', (v.mass * c.mass - 0.5) / 1.6);
  if (!first) { saveProf(); send({ t: 'prof', ch: G.ch, veh: G.veh, col: G.col }); }
  rebuildShowKart();
}

/* ===================== Salle d'exposition ===================== */
let show = null, showKart = null, showT = 0;
function ensureShow() { if (!show) show = buildShowroom(renderer); }
function rebuildShowKart() {
  if (!show) return;
  if (showKart) { show.slot.remove(showKart.root); disposeScene(showKart.root); }
  showKart = M.makeKart(G.veh, S.COLORS[G.col]);
  attachDriver(showKart, G.ch);
  show.slot.add(showKart.root);
  show.slot.scale.setScalar(G.veh === 2 ? 1.05 : 1.35);
}
function attachDriver(k, ch) { const d = M.makeDriver(ch); d.position.copy(k.seat); k.body.add(d); k.driver = d; }
function showFrame(dt) {
  ensureShow();
  if (!showKart) rebuildShowKart();
  showT += dt;
  show.slot.rotation.y += dt * 0.5;
  M.animateKart(showKart, dt * 3, 4, Math.sin(showT * 0.8) * 0.5);
  const a = showT * 0.12;
  camera.position.set(Math.cos(a) * 3 + 8.5, 4.2, 10.5 + Math.sin(a) * 2);
  camera.lookAt(0, 1.7, 0);
  camera.fov = 45; camera.updateProjectionMatrix();
  renderer.toneMappingExposure = 0.9;
  renderer.render(show.scene, camera);
}

/* ===================== Écrans ===================== */
function setMode(m) {
  G.mode = m;
  const menu = m === 'menu', lobby = m === 'lobby';
  $('ui').classList.toggle('hide', !(menu || lobby));
  $('mobPlay').style.visibility = menu ? '' : 'hidden';
  $('scr-menu').classList.toggle('hide', !menu);
  $('scr-lobby').classList.toggle('hide', !lobby);
  $('hud').classList.toggle('hide', m !== 'race' && m !== 'results');
  $('touch').classList.toggle('hide', !(m === 'race' && isTouch));
  $('loading').classList.toggle('hide', m !== 'loading');
  $('results').classList.toggle('hide', m !== 'results');
  applyViewOffset();
  if (menu || lobby) { sfx.engine(0, false, false); }
}

function renderRooms(list) {
  const el = $('roomList');
  if (!list.length) { el.textContent = 'Aucun salon public pour le moment.'; return; }
  el.innerHTML = '';
  list.forEach((r) => {
    const d = document.createElement('div'); d.className = 'room';
    d.innerHTML = '<span><b>' + r.code + '</b> • ' + (S.MAPS[r.map] ? S.MAPS[r.map].name : r.map) + '<br><span class="muted">' + (r.host || '?') + ' • ' + r.n + ' joueur(s) • ' + r.laps + ' tours</span></span>';
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Rejoindre'; b.onclick = () => { sfx.init(); send({ t: 'join', code: r.code }); };
    d.appendChild(b); el.appendChild(d);
  });
}

function renderLobby(r) {
  G.room = r;
  const host = r.host === G.id;
  $('roomCode').textContent = r.code;
  const pl = $('lobPlayers'); pl.innerHTML = '';
  r.players.forEach((p) => {
    const d = document.createElement('div'); d.className = 'pl';
    d.innerHTML = '<i style="background:' + S.COLORS[p.col] + '"></i><span>' + CH_ICONS[p.ch] + ' ' + p.name + (p.id === r.host ? ' 👑' : '') + (p.id === G.id ? ' (toi)' : '') + '</span><span class="muted" style="margin-left:auto">' + S.VEHS[p.veh].name + '</span>';
    pl.appendChild(d);
  });
  if (r.bots > 0) { const d = document.createElement('div'); d.className = 'pl'; d.innerHTML = '<span>🤖 ' + r.bots + ' bot(s)</span>'; pl.appendChild(d); }
  const mc = $('mapCards');
  if (!mc.children.length) {
    S.MAP_IDS.forEach((id) => {
      const m = S.MAPS[id], b = document.createElement('button'); b.className = 'map'; b.dataset.id = id;
      b.innerHTML = '<b>' + m.name + '</b>' + m.desc; b.onclick = () => send({ t: 'cfg', map: id }); mc.appendChild(b);
    });
  }
  [...mc.children].forEach((b) => { b.classList.toggle('sel', b.dataset.id === r.map); b.disabled = !host; });
  const sb = $('selBots'); const maxB = 8 - r.players.length;
  sb.innerHTML = ''; for (let i = 0; i <= maxB; i++) { const o = document.createElement('option'); o.value = i; o.textContent = i; sb.appendChild(o); }
  sb.value = Math.min(r.bots, maxB);
  $('selLaps').value = String(r.laps);
  $('chkDinos').checked = r.dinos; $('chkItems').checked = r.items; $('chkPub').checked = r.pub;
  ['selBots', 'selLaps', 'chkDinos', 'chkItems', 'chkPub', 'btnStart'].forEach((id) => { $(id).disabled = !host; });
  $('lobHint').textContent = host ? 'Tu es l\'hôte : choisis le circuit et lance la course quand tout le monde est prêt.' : 'En attente de l\'hôte…';
}

/* ===================== Messages réseau ===================== */
function onMsg(m) {
  switch (m.t) {
    case 'hi': G.id = m.id; break;
    case 'rooms': renderRooms(m.rooms); break;
    case 'err': alert(m.msg); break;
    case 'room':
      if (G.mode === 'menu') { setMode('lobby'); }
      if (G.mode === 'lobby' || G.mode === 'results' || G.mode === 'loading') renderLobby(m);
      else G.room = m;
      break;
    case 'left': G.room = null; if (G.mode === 'lobby') setMode('menu'); send({ t: 'list' }); break;
    case 'load': startRace(m); break;
    case 'cd': if (R) onCountdown(m.n); break;
    case 'go': if (R) onGo(); break;
    case 'snap': if (R) onSnap(m); break;
    case 'ev': if (R) onEvent(m); break;
    case 'hit': if (R) onHit(m); break;
    case 'item': if (R) onItem(m); break;
    case 'boost': if (R) addBoost(m.dur, 1.0, true); break;
    case 'results': if (R) showResults(m); break;
  }
}

/* ===================== Entrées ===================== */
const keys = {};
const ctl = { steer: 0, gas: 0, brake: 0, drift: false };
const touch = { steer: 0, steerOn: false, brake: false, drift: false };
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (keys[e.code]) return;
  keys[e.code] = true;
  if (G.mode !== 'race' || !R) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (['KeyE', 'Enter', 'KeyF', 'ShiftRight'].includes(e.code)) useItem();
  if (e.code === 'KeyR') resetKart();
  if (e.code === 'KeyH') honk();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function readCtl() {
  const k = keys;
  let steer = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA || k.KeyQ ? 1 : 0);
  if (touch.steerOn) steer = touch.steer;
  const brake = !!(k.ArrowDown || k.KeyS || touch.brake);
  let gas = !!(k.ArrowUp || k.KeyW || k.KeyZ);
  if (isTouch && G.auto && !brake) gas = true;
  ctl.steer = steer; ctl.gas = gas ? 1 : 0; ctl.brake = brake ? 1 : 0; ctl.drift = !!(k.Space || k.ShiftLeft || touch.drift);
}
// tactile
(function initTouch() {
  const area = $('tSteer'), stick = $('tStick'), knob = stick.firstElementChild;
  let pid = null, ox = 0, oy = 0;
  area.addEventListener('pointerdown', (e) => { pid = e.pointerId; area.setPointerCapture(pid); ox = e.clientX; oy = e.clientY; stick.style.display = 'block'; stick.style.left = ox - 55 + 'px'; stick.style.top = oy - 55 + 'px'; touch.steerOn = true; touch.steer = 0; e.preventDefault(); });
  area.addEventListener('pointermove', (e) => { if (e.pointerId !== pid) return; const dx = clamp((e.clientX - ox) / 55, -1, 1); touch.steer = Math.abs(dx) < 0.08 ? 0 : dx; knob.style.transform = 'translate(' + dx * 40 + 'px,0)'; });
  const end = (e) => { if (e.pointerId !== pid) return; pid = null; touch.steerOn = false; touch.steer = 0; stick.style.display = 'none'; knob.style.transform = ''; };
  area.addEventListener('pointerup', end); area.addEventListener('pointercancel', end);
  const hold = (id, key) => { const el = $(id); el.addEventListener('pointerdown', (e) => { touch[key] = true; el.classList.add('on'); el.setPointerCapture(e.pointerId); e.preventDefault(); }); const up = () => { touch[key] = false; el.classList.remove('on'); }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); };
  hold('bBrake', 'brake'); hold('bDrift', 'drift');
  $('bItem').addEventListener('pointerdown', (e) => { useItem(); e.preventDefault(); });
  $('bReset').addEventListener('pointerdown', (e) => { resetKart(); e.preventDefault(); });
})();

/* ===================== Partie ===================== */
let R = null; // état de la course
let P = null; // kart local
const SPEEDS = { rock: 82, dart: 105, egg: 64, bone: 0 };

function startRace(L) {
  setMode('loading');
  $('loadTitle').textContent = S.MAPS[L.map].name;
  $('loadSub').textContent = 'Préparation du circuit…';
  sfx.init();
  setTimeout(() => {
    try { buildRace(L); } catch (e) { console.error(e); showErr(e); send({ t: 'leave' }); setMode('menu'); }
  }, 60);
}

function buildRace(L) {
  resolveQ();
  renderer.shadowMap.enabled = Q > 0;
  const world = buildWorld(renderer, L.map, Q);
  renderer.toneMappingExposure = world.exposure;
  const scene = world.scene;
  const fx = new Fx(scene, Q);
  world.fx = fx;
  R = {
    world, scene, fx, T: world.T, map: S.MAPS[L.map], laps: L.laps, items: L.items, racers: new Map(), dinos: new Map(), proj: new Map(), boxes: new Map(),
    boat: !!S.MAPS[L.map].theme.sea, sy: S.MAPS[L.map].theme.sea ? S.MAPS[L.map].theme.waterY : 0,
    go: false, cd: -1, t: 0, sendT: 0, place: 1, lap: 0, n: L.racers.length, shake: 0, meteors: [], msgT: 0, finished: false, wrong: 0, lastRank: 0, camH: 0, camInit: false,
    itemShow: { item: null, n: 0, at: 0 }, spinFx: 0, flags: 0, lapShown: 0, minimap: null, startedAt: 0,
  };
  for (const r of L.racers) {
    const kart = M.makeKart(r.veh, S.COLORS[r.col], R.boat);
    attachDriver(kart, r.ch);
    kart.root.position.set(r.x, R.sy, r.z); kart.root.rotation.y = r.h;
    scene.add(kart.root);
    const o = { id: r.id, name: r.name, ch: r.ch, veh: r.veh, col: r.col, bot: r.bot, kart, buf: [], place: r.grid + 1, lap: 1, fin: 0, flags: 0, x: r.x, z: r.z, h: r.h, v: 0, st: 0, me: r.id === L.you };
    if (!o.me) { const tag = M.makeNameTag(r.name + (r.bot ? ' 🤖' : '')); tag.position.set(0, 3.9, 0); kart.root.add(tag); }
    R.racers.set(r.id, o);
    if (o.me) {
      R.me = o;
      P = { x: r.x, z: r.z, h: r.h, sp: 0, vx: 0, vz: 0, steer: 0, drift: 0, charge: 0, boostT: 0, boostPow: 1, spinT: 0, spinDur: 1, flatT: 0, idx: S.nearest(R.T, r.x, r.z, -1, 0), lat: 0, off: false, bump: 0, hop: 0, camLat: 0, lastBump: 0 };
    }
  }
  for (const d of L.dinos) {
    const mdl = M.makeDino(d.k);
    scene.add(mdl.root);
    R.dinos.set(d.id, { id: d.id, k: d.k, model: mdl, buf: [], anim: 0, h: 0, x: 0, z: 0, init: false, roar: 0 });
  }
  for (const b of L.boxes) {
    const bx = M.makeItemBox(); bx.position.set(b.x, 1.9 + R.sy, b.z); scene.add(bx);
    R.boxes.set(b.id, { id: b.id, mesh: bx, on: true, x: b.x, z: b.z, scale: 1 });
  }
  buildMinimap();
  buildRankUI();
  $('hItem').style.visibility = R.items ? 'visible' : 'hidden';
  updateItemUI();
  $('btnSnd').textContent = G.sound ? '🔊' : '🔇';
  setMode('race');
  $('loadSub').textContent = 'En attente des autres pilotes…';
  R.ready = true;
  setMsg('', 0);
  send({ t: 'ready' });
  if (G.music) sfx.startMusic();
}

function leaveRace(silent) {
  if (!R) return;
  sfx.engine(0, false, false); sfx.stopMusic();
  disposeScene(R.scene);
  R.scene.clear();
  renderer.renderLists.dispose();
  R = null; P = null;
  $('feed').innerHTML = '';
}

/* ---------- Événements de course ---------- */
function setMsg(t, kind) {
  const el = $('msg');
  el.textContent = t;
  el.className = 'hb';
  void el.offsetWidth;
  el.className = 'hb' + (kind === 1 ? ' s' : '') + (t ? ' anim' : '');
  el.style.display = t ? 'block' : 'none';
  if (R) R.msgT = t ? 2.2 : 0;
}
function onCountdown(n) {
  R.cd = n;
  if (n === 4) { setMsg('Prêt ?', 1); sfx.play('count'); }
  else { setMsg(String(n)); sfx.play('count'); }
}
function onGo() {
  R.go = true; R.startedAt = performance.now();
  setMsg('GO !'); sfx.play('go');
}
function addFeed(html) {
  const f = $('feed'); const d = document.createElement('div'); d.innerHTML = html; f.appendChild(d);
  setTimeout(() => d.remove(), 4600);
  while (f.children.length > 4) f.firstChild.remove();
}
function racerName(id) { const r = R.racers.get(id); return r ? r.name : '?'; }
const KIND_ICON = { rock: '🪨', dart: '💉', egg: '🥚', bone: '🦴', meteor: '☄️', dino: '🦖' };
function near(x, z, range = 140) { if (!P) return 1; const d = Math.hypot(x - P.x, z - P.z); return clamp(1 - d / range, 0, 1); }
function racerPos(id) {
  const r = R.racers.get(id); if (!r) return null;
  if (r.me) return { x: P.x, z: P.z };
  return { x: r.kart.root.position.x, z: r.kart.root.position.z };
}

function onEvent(m) {
  switch (m.e) {
    case 'box': { const b = R.boxes.get(m.i); if (b) { b.on = !!m.on; b.mesh.visible = b.on; if (!b.on) { R.fx.spark(b.x, 2, b.z, [1, 0.8, 0.3, 1]); R.fx.spark(b.x, 2, b.z, [1, 0.8, 0.3, 1]); sfx.play('pickup', near(b.x, b.z, 40) * 0.5); } } break; }
    case 'throw': {
      const p = racerPos(m.id); const v = p ? near(p.x, p.z) : 0.5;
      if (m.k === 'dart') sfx.play('dart', v); else if (m.k === 'turbo') sfx.play('boost', v * 0.6); else if (m.k === 'shield') sfx.play('shield', v); else sfx.play('throw', v);
      if (m.k === 'turbo' && p) { for (let i = 0; i < 10; i++) R.fx.flame(p.x, 1, p.z, 0, 0); }
      break;
    }
    case 'hit': {
      const p = racerPos(m.id); if (!p) break;
      R.fx.stars(p.x, 3, p.z); sfx.play('hit', near(p.x, p.z));
      addFeed((m.by && R.racers.has(m.by) ? racerName(m.by) + ' ' : '') + (KIND_ICON[m.k] || '💥') + ' ➜ <b>' + racerName(m.id) + '</b>');
      if (m.id === R.me.id) R.shake = Math.max(R.shake, 0.6);
      break;
    }
    case 'boom': {
      R.fx.boom(m.x, 0, m.z, m.k);
      sfx.play(m.k === 'meteor' ? 'boom' : 'hit', near(m.x, m.z, m.k === 'meteor' ? 300 : 120));
      if (m.k === 'meteor') { R.shake = Math.max(R.shake, 1.0 * near(m.x, m.z, 300)); R.meteors = R.meteors.filter((mt) => { if (Math.hypot(mt.x - m.x, mt.z - m.z) < 5) { R.scene.remove(mt.grp); disposeScene(mt.grp); return false; } return true; }); }
      break;
    }
    case 'stun': {
      const d = R.dinos.get(m.id); if (!d) break;
      R.fx.stars(d.x, 4, d.z); sfx.play('bonk', near(d.x, d.z, 160));
      addFeed('💫 ' + S.DINOS[d.k].name + ' étourdi !');
      break;
    }
    case 'roar': {
      const d = R.dinos.get(m.id); if (!d) break;
      d.roar = 1.4; const n = near(d.x, d.z, 220);
      sfx.play('roar', n); R.shake = Math.max(R.shake, 0.5 * n);
      if (n > 0.35) setMsg('⚠ ' + S.DINOS[d.k].name.toUpperCase() + ' !', 1);
      break;
    }
    case 'meteor': {
      const grp = new THREE.Group();
      const mesh = M.makeProjMesh('meteor'); grp.add(mesh);
      const ring = new THREE.Mesh(new THREE.RingGeometry(6, 9.5, 36), new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(m.x, 0.2, m.z); R.scene.add(ring);
      grp.add(ring); // supprimé avec le groupe
      ring.position.set(m.x, 0.2, m.z);
      R.scene.add(grp);
      R.meteors.push({ grp, mesh, ring, x: m.x, z: m.z, t: 0, delay: m.delay });
      sfx.play('roar', 0.3);
      addFeed('☄️ <b>' + racerName(m.by) + '</b> invoque une météorite !');
      break;
    }
    case 'shield': { const p = racerPos(m.id); if (p) { sfx.play('pop', near(p.x, p.z)); R.fx.stars(p.x, 2, p.z); } break; }
    case 'fin': {
      const r = R.racers.get(m.id);
      if (r) addFeed('🏁 <b>' + r.name + '</b> termine !');
      if (m.id === R.me.id) { R.finished = true; setMsg('Terminé !', 1); sfx.play('win'); }
      break;
    }
    case 'honk': { const p = racerPos(m.id); if (p) sfx.play('honk', near(p.x, p.z, 160)); break; }
  }
}

function onHit(m) {
  if (!P) return;
  P.spinT = m.dur; P.spinDur = m.dur;
  if (m.k === 'meteor') P.flatT = m.dur;
  const f = m.k === 'dino' ? 20 : 9;
  P.vx += m.dx * f; P.vz += m.dz * f;
  P.drift = 0; P.charge = 0;
  R.shake = Math.max(R.shake, m.k === 'meteor' ? 1 : 0.7);
  if (navigator.vibrate) navigator.vibrate(m.k === 'meteor' ? 200 : 90);
}
function onItem(m) {
  const had = R.itemShow.item;
  R.itemShow = { item: m.item || null, n: m.n | 0, at: performance.now() + (m.item && !had ? 1100 : 0) };
  if (m.item && !had) { addFeed('<b>' + S.ITEMS[m.item].icon + ' ' + S.ITEMS[m.item].name + '</b> — ' + S.ITEMS[m.item].desc); sfx.play('pickup', 0.8); const hi = $('hItem'); hi.classList.remove('pop'); void hi.offsetWidth; hi.classList.add('pop'); }
  updateItemUI();
}
function updateItemUI() {
  const it = R.itemShow;
  if (!it.item) { $('itemIcon').textContent = '·'; $('itemCount').textContent = ''; return; }
  const rolling = performance.now() < it.at;
  if (rolling) { const ks = Object.keys(S.ITEMS); $('itemIcon').textContent = S.ITEMS[ks[(Math.random() * ks.length) | 0]].icon; $('itemCount').textContent = ''; }
  else { $('itemIcon').textContent = S.ITEMS[it.item].icon; $('itemCount').textContent = it.n > 1 ? '×' + it.n : ''; }
}
function useItem() {
  if (!R || !R.go || !R.itemShow.item || performance.now() < R.itemShow.at) return;
  send({ t: 'use', back: !!(keys.ArrowDown || keys.KeyS || touch.brake) });
}
function honk() { send({ t: 'honk' }); }
function resetKart() {
  if (!P || !R.go) return;
  const T = R.T, i = P.idx;
  P.x = T.x[i]; P.z = T.z[i]; P.h = T.h[i]; P.sp = 0; P.vx = 0; P.vz = 0; P.drift = 0; P.spinT = 0; P.boostT = 0;
}
function addBoost(dur, pow, fromItem) {
  if (!P) return;
  P.boostT = Math.max(P.boostT, dur); P.boostPow = Math.max(P.boostT > dur ? P.boostPow : 0, pow);
  sfx.play('boost', 0.8);
  if (fromItem) { P.sp = Math.max(P.sp, 30); }
  R.shake = Math.max(R.shake, 0.25);
}

/* ---------- Snapshots ---------- */
function onSnap(m) {
  const now = performance.now();
  let n = 0;
  for (const e of m.r) {
    const r = R.racers.get(e[0]); if (!r) continue;
    n++;
    r.place = e[8]; r.lap = e[7]; r.fin = e[9];
    if (r.me) {
      R.place = e[8]; R.flags = e[5];
      if (e[7] > R.lapShown) { if (R.lapShown > 0) { sfx.play('lap'); setMsg(e[7] === R.laps ? 'Dernier tour !' : 'Tour ' + e[7], 1); } R.lapShown = e[7]; }
      continue;
    }
    r.buf.push({ t: now, x: e[1], z: e[2], h: e[3], v: e[4], f: e[5], st: e[6] });
    if (r.buf.length > 12) r.buf.shift();
  }
  R.n = n || R.n;
  for (const e of m.d) {
    const d = R.dinos.get(e[0]); if (!d) continue;
    d.buf.push({ t: now, x: e[1], z: e[2], h: e[3], a: e[4] });
    if (d.buf.length > 10) d.buf.shift();
  }
  const seen = new Set();
  for (const e of m.p) {
    seen.add(e[0]);
    let p = R.proj.get(e[0]);
    if (!p) { const mesh = M.makeProjMesh(e[1]); R.scene.add(mesh); p = { mesh, type: e[1], id: e[0] }; R.proj.set(e[0], p); if (e[1] === 'bone') sfx.play('squeak', near(e[2], e[3], 80) * 0.6); }
    p.x = e[2]; p.z = e[3]; p.h = e[4]; p.t = now;
  }
  for (const [id, p] of R.proj) if (!seen.has(id)) { R.scene.remove(p.mesh); disposeScene(p.mesh); R.proj.delete(id); }
}
function sampleBuf(buf, t) {
  const n = buf.length;
  if (!n) return null;
  if (t <= buf[0].t) return buf[0];
  for (let i = n - 1; i > 0; i--) {
    if (buf[i - 1].t <= t) {
      const a = buf[i - 1], b = buf[i];
      if (t >= b.t) return b;
      const k = (t - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, h: a.h + S.angDiff(b.h, a.h) * k, v: a.v + (b.v - a.v) * k, f: b.f, st: a.st + (b.st - a.st) * k, a: b.a };
    }
  }
  return buf[n - 1];
}

/* ===================== Physique du kart local ===================== */
function stepPhysics(dt) {
  const T = R.T, me = R.me, veh = S.VEHS[me.veh], ch = S.CHARS[me.ch], hw = T.halfW;
  const go = R.go;
  const c = ctl;
  const spinning = P.spinT > 0;
  const idx = S.nearest(T, P.x, P.z, P.idx, 30);
  P.idx = idx;
  const lat = (P.x - T.x[idx]) * T.rx[idx] + (P.z - T.z[idx]) * T.rz[idx];
  P.lat = lat;
  const off = Math.abs(lat) > hw + 0.8;
  P.off = off;
  const maxBase = veh.max * ch.spd;
  const boosting = P.boostT > 0;
  const cap = maxBase * (off ? veh.off : 1) * (boosting ? 1 + 0.38 * P.boostPow : 1);
  const gas = go && !spinning ? c.gas : 0, brake = go && !spinning ? c.brake : 0;
  // vitesse
  if (spinning) P.sp *= Math.pow(0.03, dt);
  else {
    if (gas > 0 && !(brake > 0 && P.sp > 1)) {
      const acc = veh.acc * ch.acc * (boosting ? 2.6 : 1) * (P.sp < 0 ? 3 : 1);
      if (P.sp < cap) P.sp = Math.min(cap, P.sp + acc * dt); else P.sp = Math.max(cap, P.sp - 26 * dt);
    } else {
      const fr = off ? 16 : 7;
      if (P.sp > 0) P.sp = Math.max(0, P.sp - fr * dt); else P.sp = Math.min(0, P.sp + fr * dt);
      if (off && P.sp > cap) P.sp = Math.max(cap, P.sp - 26 * dt);
    }
    if (brake > 0) { if (P.sp > 0.5) P.sp = Math.max(0, P.sp - 60 * dt); else P.sp = Math.max(-16, P.sp - 24 * dt); }
  }
  // direction
  P.steer += (c.steer - P.steer) * Math.min(1, dt * 11);
  if (c.drift && !P.drift && Math.abs(P.steer) > 0.3 && P.sp > 20 && !spinning && go) { P.drift = Math.sign(P.steer); P.charge = 0; P.hop = 0.25; sfx.play('squeak', 0.6); }
  if (P.drift && (!c.drift || P.sp < 14 || spinning)) {
    if (P.charge > 1.9) addBoost(1.5 * ch.boost, 1.1, false); else if (P.charge > 0.95) addBoost(0.75 * ch.boost, 0.8, false);
    P.drift = 0; P.charge = 0;
  }
  if (P.drift) P.charge += dt * (P.steer * P.drift > 0.3 ? 1.25 : 0.7);
  const turn = 1.75 * veh.turn * ch.turn * (1 - 0.4 * clamp(Math.abs(P.sp) / maxBase, 0, 1.2));
  let sp01 = clamp(P.sp / 8, -1, 1);
  if (gas > 0 && Math.abs(sp01) < 0.4) sp01 = 0.4;
  if (!spinning) {
    const sx = P.drift ? P.drift * clamp(1 + 0.6 * P.steer * P.drift, 0.45, 1.6) : P.steer;
    P.h -= sx * turn * dt * sp01;
  } else P.h += dt * 0; // le visuel tourne séparément
  // vitesse vectorielle avec dérapage
  const f = S.fwd(P.h);
  const g = (P.drift ? 2.1 : veh.grip * R.map.grip * (off ? 0.8 : 1)) * (spinning ? 0.5 : 1);
  const k = 1 - Math.exp(-g * dt);
  P.vx += (f[0] * P.sp - P.vx) * k; P.vz += (f[1] * P.sp - P.vz) * k;
  P.x += P.vx * dt; P.z += P.vz * dt;
  // murs naturels
  const L = hw + (R.map.wall || 15);
  const lat2 = (P.x - T.x[idx]) * T.rx[idx] + (P.z - T.z[idx]) * T.rz[idx];
  if (Math.abs(lat2) > L) {
    const s = Math.sign(lat2), over = Math.abs(lat2) - L;
    P.x -= T.rx[idx] * s * over; P.z -= T.rz[idx] * s * over;
    const vl = P.vx * T.rx[idx] + P.vz * T.rz[idx], outward = vl * s;
    if (outward > 0) {
      P.vx -= T.rx[idx] * vl * 1.25; P.vz -= T.rz[idx] * vl * 1.25;
      const headOn = Math.max(0, (f[0] * T.rx[idx] + f[1] * T.rz[idx]) * s);
      P.sp *= 1 - Math.min(0.9, headOn * 4 * dt);
      if (outward > 9 && performance.now() - P.lastBump > 300) { P.lastBump = performance.now(); P.sp *= 0.75; sfx.play('bump', 0.7); R.shake = Math.max(R.shake, 0.3); for (let i = 0; i < 6; i++) R.fx.spark(P.x, 1, P.z); }
    }
  }
  // collisions entre karts
  for (const r of R.racers.values()) {
    if (r.me) continue;
    const rp = r.kart.root.position, dx = P.x - rp.x, dz = P.z - rp.z, d2 = dx * dx + dz * dz, rr = 3.3;
    if (d2 < rr * rr && d2 > 1e-4) {
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = rr - d;
      const ms = S.VEHS[r.veh].mass * S.CHARS[r.ch].mass, mm = veh.mass * ch.mass, share = ms / (ms + mm);
      P.x += nx * pen * share; P.z += nz * pen * share;
      P.vx += nx * pen * 6 * share; P.vz += nz * pen * 6 * share;
      P.sp *= 1 - 0.05 * share;
      if (performance.now() - P.lastBump > 250) { P.lastBump = performance.now(); sfx.play('bump', 0.5); R.fx.spark(P.x - nx, 1, P.z - nz); }
    }
  }
  if (P.boostT > 0) P.boostT -= dt;
  if (P.spinT > 0) { P.spinT -= dt; if (P.spinT <= 0) P.flatT = 0; }
  if (P.hop > 0) P.hop -= dt;
  // anti-blocage
  if (go && gas > 0 && Math.hypot(P.vx, P.vz) < 3 && !spinning) P.stuck = (P.stuck || 0) + dt; else P.stuck = 0;
  if (P.stuck > 3.5) { P.stuck = 0; resetKart(); }
  // mauvais sens
  const dot = f[0] * T.tx[idx] + f[1] * T.tz[idx];
  if (dot < -0.3 && Math.hypot(P.vx, P.vz) > 6 && go) R.wrong += dt; else R.wrong = Math.max(0, R.wrong - dt * 2);
}

/* ===================== Boucle de course ===================== */
function raceFrame(dt, now) {
  if (!R) return;
  const T = R.T, world = R.world;
  R.t += dt;
  readCtl();
  if (R.go || R.cd >= 0) {
    // pas de physique complète avant le GO : le kart reste sur la grille
  }
  const steps = Math.min(4, Math.max(1, Math.round(dt * 60)));
  for (let i = 0; i < steps; i++) stepPhysics(dt / steps);
  const me = R.me, veh = S.VEHS[me.veh], ch = S.CHARS[me.ch];
  const speed = Math.hypot(P.vx, P.vz);
  // envoi
  R.sendT += dt;
  if (R.sendT >= 0.05) {
    R.sendT = 0;
    const fl = (P.drift ? 1 : 0) | (P.boostT > 0 ? 2 : 0) | (P.spinT > 0 ? 4 : 0) | (P.off ? 8 : 0);
    send({ t: 's', x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, h: Math.round(P.h * 1000) / 1000, v: Math.round(P.sp * 10) / 10, f: fl, st: Math.round(P.steer * 10) / 10 });
  }
  // kart local
  const k = me.kart, root = k.root;
  root.position.set(P.x, R.sy + (R.boat ? Math.sin(R.t * 2.3) * 0.07 - 0.12 : 0), P.z); root.rotation.y = P.h;
  let spinYaw = 0;
  if (P.spinT > 0) spinYaw = (1 - P.spinT / P.spinDur) * TAU * 2.5;
  k.body.rotation.y = spinYaw - P.drift * 0.32;
  k.body.rotation.z = -P.steer * 0.05 * clamp(speed / 40, 0, 1) - P.drift * 0.07;
  k.body.rotation.x = clamp((P.sp - speed) * 0.01, -0.05, 0.05);
  k.body.position.y = (P.hop > 0 ? Math.sin((P.hop / 0.25) * Math.PI) * 0.4 : 0) + (speed > 5 ? Math.sin(R.t * 40) * 0.015 * (P.off ? 4 : 1) : 0);
  k.body.scale.y = P.flatT > 0 ? 0.45 : 1;
  k.shield.visible = !!(R.flags & 16);
  root.visible = !(R.flags & 32) || Math.floor(now / 90) % 2 === 0;
  M.animateKart(k, dt, P.sp, P.steer);
  // karts distants
  const rt = now - 115;
  for (const r of R.racers.values()) {
    if (r.me) continue;
    const s = sampleBuf(r.buf, rt);
    if (!s) continue;
    const kr = r.kart, rr = kr.root;
    rr.position.set(s.x, R.sy + (R.boat ? Math.sin(R.t * 2.3 + r.id) * 0.07 - 0.12 : 0), s.z); rr.rotation.y = s.h;
    const f = s.f | 0;
    kr.body.rotation.y = (f & 4 ? (now / 1000 * 11) % TAU : 0) - (f & 1 ? 0.25 * Math.sign(s.st || 0.01) : 0);
    kr.body.rotation.z = -s.st * 0.05;
    kr.body.scale.y = 1;
    kr.shield.visible = !!(f & 16);
    rr.visible = !(f & 32) || Math.floor(now / 90) % 2 === 0;
    M.animateKart(kr, dt, s.v, s.st);
    r.v = s.v; r.flags = f; r.x = s.x; r.z = s.z; r.h = s.h;
    emitKartFx(kr, s.x, s.z, s.h, f, Math.abs(s.v), s.st, S.VEHS[r.veh]);
  }
  // fx du kart local
  const lf = (P.drift ? 1 : 0) | (P.boostT > 0 ? 2 : 0) | (P.off ? 8 : 0);
  emitKartFx(k, P.x, P.z, P.h, lf, speed, P.steer, veh, P.charge);
  // dinosaures
  for (const d of R.dinos.values()) {
    const s = sampleBuf(d.buf, rt);
    if (!s) { d.model.root.visible = false; continue; }
    d.model.root.visible = true;
    d.x = s.x; d.z = s.z;
    let dy = 0, lift = 0;
    if (R.world.th.sea) {
      const wy = R.world.th.waterY, k = d.k;
      if (k === 'mosa' || k === 'plesio' || k === 'ichthy') {
        // nage dans l'eau et bondit comme un dauphin quand il se déplace
        const sa = Math.round(s.a), moving = sa === 1 || sa === 2;
        const f = k === 'ichthy' ? 3.4 : k === 'mosa' ? 2.1 : 1.3, amp = k === 'ichthy' ? 3.4 : k === 'mosa' ? 3.0 : 1.2;
        const ph = Math.sin(now / 1000 * f + d.id * 1.7);
        lift = moving ? Math.pow(Math.max(0, ph), 1.5) : 0;
        dy = wy + 0.3 + lift * amp;
      } else dy = Math.max(-2.2, Math.min(0, R.world.heightAt(s.x, s.z)));
    }
    d.model.root.position.set(s.x, dy, s.z);
    d.model.root.rotation.y = s.h;
    if (d.roar > 0) d.roar -= dt;
    d.model.update(dt, Math.round(s.a), d.roar, lift);
  }
  // projectiles
  for (const p of R.proj.values()) {
    const age = Math.min(0.12, (now - p.t) / 1000), sp = SPEEDS[p.type] || 0;
    p.mesh.position.set(p.x + Math.sin(p.h) * sp * age, (p.type === 'bone' ? 0 : 1.3) + R.sy, p.z + Math.cos(p.h) * sp * age);
    p.mesh.rotation.y = p.h;
    if (p.mesh.userData.spin) { p.mesh.rotation.x += dt * p.mesh.userData.spin; }
    if (p.type === 'rock') p.mesh.rotation.z += dt * 6;
    if (p.type === 'egg') { R.fx.trail(p.mesh.position.x, 1.3 + R.sy, p.mesh.position.z, [1, 0.8, 0.3, 0.8]); p.mesh.rotation.x = 0; }
    if (p.type === 'dart') R.fx.trail(p.mesh.position.x, 1.3 + R.sy, p.mesh.position.z, [0.5, 1, 0.4, 0.7]);
    if (p.type === 'bone') { const ring = p.mesh.userData.ring; if (ring) ring.material.opacity = 0.35 + Math.sin(now / 160) * 0.2; const sk = p.mesh.userData.skull; if (sk) sk.position.y = 3.4 + Math.sin(now / 260) * 0.35; }
  }
  // météorites
  for (let i = R.meteors.length - 1; i >= 0; i--) {
    const mt = R.meteors[i]; mt.t += dt;
    const k2 = clamp(mt.t / mt.delay, 0, 1);
    mt.mesh.position.set(mt.x - (1 - k2) * 90, 0.5 + (1 - k2) * (1 - k2) * 260, mt.z - (1 - k2) * 60);
    mt.ring.scale.setScalar(1.3 - 0.4 * k2 + Math.sin(mt.t * 18) * 0.05);
    if (k2 < 1) R.fx.flame(mt.mesh.position.x, mt.mesh.position.y, mt.mesh.position.z, 0, 0, [1, 0.5, 0.1, 0.9]);
    if (mt.t > mt.delay + 0.8) { R.scene.remove(mt.grp); disposeScene(mt.grp); R.meteors.splice(i, 1); }
  }
  // caisses d'objets
  for (const b of R.boxes.values()) {
    b.mesh.rotation.y += dt * 1.8; b.mesh.position.y = 1.9 + R.sy + Math.sin(R.t * 2 + b.id) * 0.25;
    if (b.mesh.userData.cube) b.mesh.userData.cube.rotation.x = R.t * 0.9;
  }
  world.update(dt, { x: P.x, z: P.z });
  // caméra
  updateCamera(dt, speed, now);
  R.fx.update(dt, renderer.domElement.height, camera.fov);
  // son
  const ratio = clamp(speed / (veh.max * ch.spd * 1.1), 0, 1.2);
  sfx.engine(ratio, P.boostT > 0, R.go && G.mode === 'race');
  // HUD
  updateHud(speed, now);
  renderer.render(R.scene, camera);
}

function emitKartFx(kart, x, z, h, f, speed, steer, veh, charge) {
  const s = Math.sin(h), c = Math.cos(h);
  const wx = (lx, lz) => x + lx * c + lz * s, wz = (lx, lz) => z - lx * s + lz * c;
  const hl = (kart.len || 4.2) / 2;
  if (R.boat) {
    if (speed > 6) {
      const n = speed > 40 ? 2 : 1;
      for (let i = 0; i < n; i++) for (const sx of [-1, 1]) R.fx.spray(wx(sx * 0.9, -hl * 0.55), R.sy + 0.1, wz(sx * 0.9, -hl * 0.55), -s * speed * 0.12 + sx * c * 3, -c * speed * 0.12 - sx * s * 3);
      if (Math.random() < 0.6) R.fx.spray(wx(0, hl * 0.9), R.sy + 0.15, wz(0, hl * 0.9), s * speed * 0.05, c * speed * 0.05, [0.95, 0.98, 1, 0.5]);
    }
  } else if ((f & 8) && speed > 8 && Math.random() < 0.7) {
    const soil = R.map.theme.road === 'snow' ? [0.95, 0.97, 1, 0.6] : R.map.theme.gA === '#b6753f' ? [0.8, 0.55, 0.35, 0.55] : [0.62, 0.55, 0.42, 0.55];
    for (const sx of [-1, 1]) R.fx.dust(wx(sx * 1.1, -hl * 0.6), wz(sx * 1.1, -hl * 0.6), soil);
  }
  if (f & 1) {
    const col = charge > 1.9 ? [1, 0.45, 0.1, 1] : charge > 0.95 ? [0.3, 0.7, 1, 1] : [1, 0.95, 0.7, 1];
    for (const sx of [-1, 1]) if (Math.random() < 0.8) R.fx.spark(wx(sx * 1.0, -hl * 0.6), 0.3, wz(sx * 1.0, -hl * 0.6), col);
    if (Math.random() < 0.4) R.fx.dust(wx(0, -hl * 0.7), wz(0, -hl * 0.7), [0.9, 0.9, 0.9, 0.35]);
  }
  if (f & 2) {
    const ex = kart.exhaust;
    const px = wx(ex.x, ex.z), pz = wz(ex.x, ex.z), bx = -s * 9, bz = -c * 9;
    R.fx.flame(px, ex.y, pz, bx, bz); R.fx.flame(px, ex.y, pz, bx, bz, [1, 0.85, 0.3, 0.9]);
    if (Math.random() < 0.4) R.fx.flame(px, ex.y, pz, bx, bz, [0.4, 0.6, 1, 0.8]);
  }
}

function updateCamera(dt, speed, now) {
  const veh = S.VEHS[R.me.veh];
  const aim = P.h + (P.drift ? P.drift * -0.0 : 0) + (-P.steer * 0.0);
  if (!R.camInit) { R.camH = aim; R.camInit = true; }
  const lag = P.drift ? 3.2 : 6.5;
  R.camH += S.angDiff(aim, R.camH) * Math.min(1, dt * lag);
  const dist = (veh.id === 'monster' ? 11.5 : 9.2) + clamp(speed / 60, 0, 1) * 1.5, height = veh.id === 'monster' ? 5.6 : 4.2;
  const sx = Math.sin(R.camH), sz = Math.cos(R.camH);
  R.shake *= Math.exp(-dt * 4.5);
  const sh = R.shake;
  camera.position.set(P.x - sx * dist + (Math.random() - 0.5) * sh * 0.7, height + R.sy + (Math.random() - 0.5) * sh * 0.6, P.z - sz * dist + (Math.random() - 0.5) * sh * 0.7);
  const f = S.fwd(P.h);
  camera.lookAt(P.x + f[0] * 6, 1.8 + R.sy, P.z + f[1] * 6);
  const targetFov = 62 + clamp(speed / 45, 0, 1.1) * 14 + (P.boostT > 0 ? 9 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

/* ===================== HUD ===================== */
let lastRankUpdate = 0;
function updateHud(speed, now) {
  $('hSpeed').firstChild.nodeValue = String(Math.round(speed * 3.2));
  const pl = $('hPlace'); const ps = R.place + '<small>/' + R.n + '</small>';
  if (pl.dataset.v !== ps) { pl.innerHTML = ps; pl.dataset.v = ps; }
  $('hLapB').textContent = 'Tour ' + Math.max(1, Math.min(R.laps, R.lapShown || 1)) + '/' + R.laps;
  if (R.itemShow.item && now < R.itemShow.at) updateItemUI(); else if (R.itemShow.item && !R.itemShow.done) { R.itemShow.done = true; updateItemUI(); sfx.play('click', 0.5); }
  if (R.msgT > 0) { R.msgT -= 1 / 60; if (R.msgT <= 0) { $('msg').style.display = 'none'; } }
  if (R.wrong > 1.2 && !R.finished) { const m = $('msg'); if (m.textContent !== '⛔ MAUVAIS SENS') { m.textContent = '⛔ MAUVAIS SENS'; m.className = 'hb s'; m.style.display = 'block'; } R.msgT = 0.4; }
  drawMinimap();
  if (now - lastRankUpdate > 300) { lastRankUpdate = now; updateRank(); }
}
function buildRankUI() { $('rank').innerHTML = ''; }
function updateRank() {
  const list = [...R.racers.values()].sort((a, b) => a.place - b.place);
  const el = $('rank');
  el.innerHTML = list.map((r) => '<div class="' + (r.me ? 'me' : '') + '"><b>' + r.place + '</b><i style="background:' + S.COLORS[r.col] + '"></i>' + r.name + (r.fin ? ' 🏁' : '') + '</div>').join('');
}
function buildMinimap() {
  const T = R.T, cv = document.createElement('canvas'); cv.width = cv.height = 148;
  const g = cv.getContext('2d');
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (let i = 0; i < T.N; i++) { minx = Math.min(minx, T.x[i]); maxx = Math.max(maxx, T.x[i]); minz = Math.min(minz, T.z[i]); maxz = Math.max(maxz, T.z[i]); }
  const sc = 126 / Math.max(maxx - minx, maxz - minz), ox = 74 - ((minx + maxx) / 2) * sc, oz = 74 + ((minz + maxz) / 2) * sc;
  g.lineJoin = 'round'; g.lineCap = 'round';
  const path = () => { g.beginPath(); for (let i = 0; i <= T.N; i++) { const k = i % T.N, x = T.x[k] * sc + ox, y = oz - T.z[k] * sc; if (i) g.lineTo(x, y); else g.moveTo(x, y); } };
  g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 9; path(); g.stroke();
  g.strokeStyle = '#d9dde0'; g.lineWidth = 5.5; path(); g.stroke();
  g.fillStyle = '#fff'; g.fillRect(T.x[0] * sc + ox - 5, oz - T.z[0] * sc - 1.5, 10, 3);
  R.minimap = { cv, sc, ox, oz };
}
function drawMinimap() {
  const mm = R.minimap, g = $('mini').getContext('2d');
  g.clearRect(0, 0, 148, 148);
  g.drawImage(mm.cv, 0, 0);
  const pt = (x, z) => [x * mm.sc + mm.ox, mm.oz - z * mm.sc];
  for (const d of R.dinos.values()) { if (!d.buf.length) continue; const [x, y] = pt(d.x, d.z); g.fillStyle = d.buf[d.buf.length - 1].a === 3 ? '#ffe14d' : '#ff3b30'; g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill(); }
  for (const r of R.racers.values()) {
    if (r.me) continue;
    const [x, y] = pt(r.kart.root.position.x, r.kart.root.position.z);
    g.fillStyle = S.COLORS[r.col]; g.strokeStyle = '#000'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 3.6, 0, TAU); g.fill(); g.stroke();
  }
  const [x, y] = pt(P.x, P.z);
  g.fillStyle = S.COLORS[R.me.col]; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); g.stroke();
}

/* ===================== Résultats ===================== */
function fmt(t) { if (t == null) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }
function showResults(m) {
  const el = $('resList'); el.innerHTML = '';
  const medal = ['🥇', '🥈', '🥉'];
  m.list.forEach((r) => {
    const d = document.createElement('div'); d.className = 'res' + (r.id === G.id ? ' me' : '');
    d.innerHTML = '<b>' + (medal[r.place - 1] || r.place) + '</b><span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + S.COLORS[r.col] + ';margin-right:6px"></i>' + CH_ICONS[r.ch] + ' ' + r.name + (r.bot ? ' 🤖' : '') + '</span><span class="muted">' + fmt(r.time) + '</span>';
    el.appendChild(d);
  });
  sfx.engine(0, false, false);
  const mine = m.list.find((r) => r.id === G.id);
  if (mine && mine.place === 1) sfx.play('win');
  setMode('results');
}

/* ===================== Branchements UI ===================== */
function bindUI() {
  $('inName').addEventListener('input', (e) => { G.name = e.target.value.slice(0, 14); saveProf(); });
  $('inName').addEventListener('change', () => { send({ t: 'prof', name: G.name || 'Pilote' }); });
  $('btnSolo2').onclick = () => $('btnSolo').onclick();
  $('btnSolo').onclick = () => { sfx.init(); sfx.play('click'); send({ t: 'hello', name: G.name || 'Pilote', ch: G.ch, veh: G.veh, col: G.col }); send({ t: 'create', solo: 1, bots: +$('soloBots').value, map: S.MAP_IDS[(Math.random() * S.MAP_IDS.length) | 0] }); };
  $('btnCreate').onclick = () => { sfx.init(); sfx.play('click'); send({ t: 'hello', name: G.name || 'Pilote', ch: G.ch, veh: G.veh, col: G.col }); send({ t: 'create', pub: true, bots: 2 }); };
  $('btnJoin').onclick = () => { const c = $('inCode').value.trim().toUpperCase(); if (c.length === 4) { sfx.init(); send({ t: 'hello', name: G.name || 'Pilote', ch: G.ch, veh: G.veh, col: G.col }); send({ t: 'join', code: c }); } };
  $('btnRefresh').onclick = () => send({ t: 'list' });
  $('btnLeave').onclick = () => { send({ t: 'leave' }); };
  $('btnStart').onclick = () => { sfx.init(); send({ t: 'start' }); };
  $('btnInvite').onclick = async () => {
    const url = location.origin + '/?room=' + (G.room ? G.room.code : '');
    const text = 'Viens faire une course de dinos avec moi ! ' + url;
    try { if (navigator.share) await navigator.share({ title: 'Dino Grand Prix', text, url }); else { await navigator.clipboard.writeText(url); $('btnInvite').textContent = '✅ Lien copié !'; setTimeout(() => ($('btnInvite').textContent = '🔗 Inviter des amis'), 2000); } } catch (e) { prompt('Copie ce lien :', url); }
  };
  const cfg = () => send({ t: 'cfg', laps: +$('selLaps').value, bots: +$('selBots').value, dinos: $('chkDinos').checked, items: $('chkItems').checked, pub: $('chkPub').checked });
  ['selLaps', 'selBots', 'chkDinos', 'chkItems', 'chkPub'].forEach((id) => $(id).addEventListener('change', cfg));
  $('selQ').value = G.q; $('selQ').onchange = (e) => { G.q = e.target.value; saveProf(); };
  $('chkSound').checked = G.sound; $('chkSound').onchange = (e) => { G.sound = e.target.checked; sfx.init(); sfx.setOn(G.sound); saveProf(); };
  $('chkMusic').checked = G.music; $('chkMusic').onchange = (e) => { G.music = e.target.checked; sfx.init(); sfx.setMusic(G.music); saveProf(); };
  $('chkAuto').checked = G.auto; $('chkAuto').onchange = (e) => { G.auto = e.target.checked; saveProf(); };
  $('btnBack').onclick = () => { leaveRace(); setMode(G.room ? 'lobby' : 'menu'); if (G.room) renderLobby(G.room); };
  $('btnQuit').onclick = () => { if (confirm('Quitter la course ?')) { send({ t: 'leave' }); leaveRace(); setMode('menu'); G.room = null; send({ t: 'list' }); } };
  $('btnSnd').onclick = () => { G.sound = !G.sound; sfx.init(); sfx.setOn(G.sound); $('btnSnd').textContent = G.sound ? '🔊' : '🔇'; $('chkSound').checked = G.sound; saveProf(); };
  document.addEventListener('pointerdown', () => { sfx.init(); sfx.setOn(G.sound); }, { once: true });
}

/* ===================== Démarrage ===================== */
buildGarage();
bindUI();
setMode('menu');
connect();
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try {
    if (R && R.ready && (G.mode === 'race' || G.mode === 'results' || G.mode === 'loading')) raceFrame(dt, now);
    else if (!R) showFrame(dt);
  } catch (e) { console.error(e); if (!frame.err) { frame.err = true; showErr(e); } }
}
requestAnimationFrame(frame);
