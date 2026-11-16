'use strict';
/* Dino Grand Prix — serveur HTTP + WebSocket (aucune dépendance npm) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = require('./public/shared.js');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  try {
    let url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/healthz') { res.writeHead(200); return res.end('ok'); }
    if (url === '/') url = '/index.html';
    const file = path.normalize(path.join(PUB, url));
    if (!file.startsWith(PUB)) { res.writeHead(403); return res.end('403'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  } catch (e) { res.writeHead(400); res.end('400'); }
});

/* ===================== WebSocket minimal (RFC 6455) ===================== */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
class WS {
  constructor(socket, onMsg, onClose) {
    this.s = socket; this.buf = Buffer.alloc(0); this.alive = true; this.closed = false;
    this.frag = []; this.onMsg = onMsg; this.onClose = onClose;
    socket.setNoDelay(true);
    socket.on('data', (d) => this.onData(d));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
  }
  finish() { if (this.closed) return; this.closed = true; try { this.s.destroy(); } catch (e) {} this.onClose(); }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    if (this.buf.length > 1 << 20) return this.finish();
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = !!(b[0] & 0x80), op = b[0] & 0x0f, masked = !!(b[1] & 0x80);
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > 65536) return this.finish();
      let mask = null;
      if (masked) { if (b.length < off + 4) return; mask = b.subarray(off, off + 4); off += 4; }
      if (b.length < off + len) return;
      const payload = Buffer.from(b.subarray(off, off + len));
      if (mask) for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + len);
      if (op === 8) { this.sendRaw(8, Buffer.alloc(0)); return this.finish(); }
      if (op === 9) { this.sendRaw(10, payload); continue; }
      if (op === 10) { this.alive = true; continue; }
      if (op === 0 || op === 1 || op === 2) {
        if (op !== 0) this.frag = [];
        this.frag.push(payload);
        if (fin) { const m = Buffer.concat(this.frag).toString('utf8'); this.frag = []; try { this.onMsg(m); } catch (e) { console.error('msg error', e); } }
      }
    }
  }
  sendRaw(op, payload) {
    if (this.closed) return;
    const l = payload.length;
    let head;
    if (l < 126) head = Buffer.from([0x80 | op, l]);
    else if (l < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(l, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(l), 2); }
    try { this.s.write(Buffer.concat([head, payload])); } catch (e) { this.finish(); }
  }
  send(str) {
    if (this.closed || this.s.writableLength > 1 << 20) return;
    this.sendRaw(1, Buffer.from(str));
  }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const acc = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  newClient(socket);
});

/* ===================== Jeu ===================== */
const MAXP = 8;
const TICK = 1 / 30;
const rooms = new Map();
let nextId = 1, nextBot = 1000, nextProj = 1;
const BOT_NAMES = ['Rexy', 'Dino-Max', 'Ptérry', 'Diplo', 'Allo Al', 'Stégo Steve', 'Véloci', 'Tricky', 'Bronto Bob', 'Spino'];
const clamp = S.clamp;
const rnd = (a, b) => a + Math.random() * (b - a);
const r2 = (v) => Math.round(v * 100) / 100;

function sanitize(s, n) { return String(s == null ? '' : s).replace(/[<>&"'`\\]/g, '').trim().slice(0, n); }
function genCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
    if (!rooms.has(c)) return c;
  }
}

function newClient(socket) {
  const p = {
    id: nextId++, name: 'Pilote', ch: 0, veh: 0, col: 0, room: null, bot: false,
    x: 0, z: 0, h: 0, v: 0, fl: 0, st: 0, prog: 0, idx: 0, lap: 0, item: null, itemN: 0,
    shieldUntil: 0, invulnUntil: 0, boostUntil: 0, finished: false, finishT: 0, place: 1, ready: false, nextFire: 0,
  };
  p.ws = new WS(socket, (m) => onMessage(p, m), () => onClose(p));
  p.send = (o) => p.ws.send(JSON.stringify(o));
  p.hb = setInterval(() => {
    if (!p.ws.alive) { p.ws.finish(); return; }
    p.ws.alive = false; p.ws.sendRaw(9, Buffer.alloc(0));
  }, 20000);
  p.send({ t: 'hi', id: p.id });
}

function onClose(p) {
  clearInterval(p.hb);
  leaveRoom(p);
}

function roomInfo(room) {
  return {
    t: 'room', code: room.code, host: room.hostId, map: room.map, laps: room.laps, bots: room.bots, dinos: room.dinos, items: room.items,
    pub: room.pub, state: room.state,
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, ch: p.ch, veh: p.veh, col: p.col })),
  };
}
function sendRoomInfo(room) { const m = JSON.stringify(roomInfo(room)); for (const p of room.players.values()) p.ws.send(m); }
function bcast(room, o) { const m = JSON.stringify(o); for (const p of room.players.values()) p.ws.send(m); }

function leaveRoom(p) {
  const room = p.room;
  if (!room) return;
  room.players.delete(p.id);
  p.room = null;
  if (room.racers) { const r = room.racers.find((x) => x === p); if (r) r.left = true; }
  if (room.players.size === 0) { rooms.delete(room.code); return; }
  if (room.hostId === p.id) room.hostId = room.players.values().next().value.id;
  sendRoomInfo(room);
}

function onMessage(p, raw) {
  if (raw.length > 4000) return;
  let m;
  try { m = JSON.parse(raw); } catch (e) { return; }
  const room = p.room;
  switch (m.t) {
    case 'hello':
      p.name = sanitize(m.name, 14) || 'Pilote';
      applyProfile(p, m);
      break;
    case 'prof':
      applyProfile(p, m);
      if (room && room.state === 'lobby') sendRoomInfo(room);
      break;
    case 'ping': p.send({ t: 'pong', c: m.c }); break;
    case 'list': {
      const list = [];
      for (const r of rooms.values()) if (r.pub && r.state === 'lobby' && r.players.size < MAXP) {
        list.push({ code: r.code, host: (r.players.get(r.hostId) || {}).name, map: r.map, n: r.players.size, laps: r.laps });
      }
      p.send({ t: 'rooms', rooms: list });
      break;
    }
    case 'create': {
      if (room) leaveRoom(p);
      const r = makeRoom(p);
      if (S.MAPS[m.map]) r.map = m.map;
      r.pub = !!m.pub;
      r.bots = clamp(m.bots | 0, 0, MAXP - 1);
      if (m.solo) { r.pub = false; r.bots = clamp(m.bots | 0, 1, MAXP - 1); }
      sendRoomInfo(r);
      if (m.solo) startLoading(r);
      break;
    }
    case 'join': {
      const code = sanitize(m.code, 4).toUpperCase();
      const r = rooms.get(code);
      if (!r) return p.send({ t: 'err', msg: 'Salon introuvable.' });
      if (r.state !== 'lobby') return p.send({ t: 'err', msg: 'Course déjà en cours dans ce salon.' });
      if (r.players.size >= MAXP) return p.send({ t: 'err', msg: 'Salon complet.' });
      if (room) leaveRoom(p);
      r.players.set(p.id, p); p.room = r;
      r.bots = Math.min(r.bots, MAXP - r.players.size);
      sendRoomInfo(r);
      break;
    }
    case 'leave': leaveRoom(p); p.send({ t: 'left' }); break;
    case 'cfg': {
      if (!room || room.hostId !== p.id || room.state !== 'lobby') return;
      if (S.MAPS[m.map]) room.map = m.map;
      if (m.laps != null) room.laps = clamp(m.laps | 0, 1, 9);
      if (m.bots != null) room.bots = clamp(m.bots | 0, 0, MAXP - room.players.size);
      if (m.dinos != null) room.dinos = !!m.dinos;
      if (m.items != null) room.items = !!m.items;
      if (m.pub != null) room.pub = !!m.pub;
      sendRoomInfo(room);
      break;
    }
    case 'start':
      if (!room || room.hostId !== p.id || room.state !== 'lobby') return;
      if (room.players.size + room.bots < 2) return p.send({ t: 'err', msg: 'Ajoute au moins un adversaire (joueur ou bot).' });
      startLoading(room);
      break;
    case 'ready':
      p.ready = true;
      break;
    case 's': {
      if (!room || !room.racers || (room.state !== 'racing' && room.state !== 'countdown')) return;
      if (!(isFinite(m.x) && isFinite(m.z) && isFinite(m.h) && isFinite(m.v))) return;
      p.x = m.x; p.z = m.z; p.h = m.h; p.v = m.v; p.fl = (m.f | 0) & 15; p.st = clamp(+m.st || 0, -1, 1);
      const T = room.T;
      const i = S.nearest(T, p.x, p.z, p.idx, 40);
      let d = i - p.idx;
      if (d > T.N / 2) d -= T.N; if (d < -T.N / 2) d += T.N;
      p.prog += d; p.idx = i;
      break;
    }
    case 'use': if (room && room.state === 'racing') useItem(room, p, !!m.back, Date.now()); break;
    case 'honk': if (room) bcast(room, { t: 'ev', e: 'honk', id: p.id }); break;
  }
}

function applyProfile(p, m) {
  if (m.ch != null) p.ch = clamp(m.ch | 0, 0, S.CHARS.length - 1);
  if (m.veh != null) p.veh = clamp(m.veh | 0, 0, S.VEHS.length - 1);
  if (m.col != null) p.col = clamp(m.col | 0, 0, S.COLORS.length - 1);
  if (m.name != null && m.t === 'prof') p.name = sanitize(m.name, 14) || p.name;
}

function makeRoom(host) {
  const room = {
    code: genCode(), hostId: host.id, map: 'jungle', laps: 3, bots: 3, dinos: true, items: true, pub: true,
    state: 'lobby', players: new Map(), racers: null,
  };
  room.players.set(host.id, host); host.room = room;
  rooms.set(room.code, room);
  return room;
}

/* ---------- Démarrage de course ---------- */
function startLoading(room) {
  const T = S.buildTrack(room.map);
  room.T = T;
  const humans = [...room.players.values()];
  const nb = Math.min(room.bots, MAXP - humans.length);
  const racers = humans.slice();
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < nb; i++) {
    racers.push({
      id: nextBot++, name: names[i % names.length], bot: true, ch: (Math.random() * S.CHARS.length) | 0, veh: (Math.random() * S.VEHS.length) | 0,
      col: (Math.random() * S.COLORS.length) | 0, x: 0, z: 0, h: 0, v: 0, fl: 0, st: 0, prog: 0, idx: 0, lap: 0, item: null, itemN: 0,
      shieldUntil: 0, invulnUntil: 0, boostUntil: 0, spinUntil: 0, finished: false, finishT: 0, place: 1, nextFire: 0,
      s: 0, lat: 0, latT: 0, seed: Math.random() * 100, skill: rnd(0.9, 1.0), useAt: 0,
    });
  }
  // ordre de grille aléatoire
  racers.sort(() => Math.random() - 0.5);
  racers.forEach((r, k) => {
    const g = S.gridSlot(T, k);
    r.x = g.x; r.z = g.z; r.h = g.h; r.v = 0; r.fl = 0; r.prog = g.prog; r.idx = g.idx; r.lap = 0;
    r.item = null; r.itemN = 0; r.shieldUntil = 0; r.invulnUntil = 0; r.boostUntil = 0; r.finished = false; r.finishT = 0; r.place = k + 1;
    r.ready = r.bot; r.grid = k; r.left = false; r.spinUntil = 0;
    if (r.bot) { r.s = g.idx + (g.prog - Math.floor(g.prog)); r.s = ((S.N + g.prog) % S.N + S.N) % S.N; r.lat = (k % 2 === 0 ? -1 : 1) * T.halfW * 0.33; r.latT = r.lat; }
  });
  room.racers = racers;
  room.boxes = S.boxLayout(T).map((b) => ({ ...b, on: true, back: 0 }));
  room.dinoList = room.dinos ? makeDinos(room) : [];
  room.proj = [];
  room.later = [];
  room.state = 'loading';
  room.loadDeadline = Date.now() + 25000;
  room.tick = 0;
  const base = {
    t: 'load', map: room.map, laps: room.laps, items: room.items,
    racers: racers.map((r) => ({ id: r.id, name: r.name, ch: r.ch, veh: r.veh, col: r.col, bot: !!r.bot, grid: r.grid, x: r2(r.x), z: r2(r.z), h: r2(r.h) })),
    dinos: room.dinoList.map((d) => ({ id: d.id, k: d.k })),
    boxes: room.items ? room.boxes.map((b) => ({ id: b.id, x: r2(b.x), z: r2(b.z) })) : [],
  };
  for (const p of humans) p.send(Object.assign({ you: p.id }, base));
  sendRoomInfo(room);
}

function makeDinos(room) {
  const T = room.T, map = S.MAPS[room.map];
  return map.dinos.map((d, i) => {
    const def = S.DINOS[d.k];
    const o = {
      id: i, k: d.k, r: def.r, beh: def.beh, spd: def.spd, s: d.s * T.N, lat: 0, dir: 1, state: 'idle', wait: 0, stunUntil: 0,
      x: 0, z: 0, h: 0, anim: 0, side: d.side || 1, s0: d.s * T.N, L: (d.L || 90) / T.ds, t: Math.random() * 10,
    };
    if (def.beh === 'cross') { o.lat = -(T.halfW + 4); o.dir = 1; o.wait = rnd(0, 3); o.lat = rnd(-T.halfW - 3, T.halfW + 3); o.dir = Math.random() < 0.5 ? -1 : 1; }
    if (def.beh === 'patrol') { o.dir = -1; o.lat = 0; }
    if (def.beh === 'ambush') { o.lat = o.side * (T.halfW + 8); }
    const p = S.trackPos(T, o.s, o.lat);
    o.x = p.x; o.z = p.z;
    const side = def.beh === 'ambush' ? -o.side : o.dir;
    o.h = Math.atan2(p.rx * side, p.rz * side);
    return o;
  });
}

/* ---------- Boucle ---------- */
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const room of rooms.values()) {
    try { updateRoom(room, now, dt); } catch (e) { console.error('room error', e); }
  }
}, 1000 * TICK);

function updateRoom(room, now, dt) {
  if (room.state === 'lobby') return;
  const humans = [...room.players.values()];
  if (room.state === 'loading') {
    if (humans.every((p) => p.ready) || now > room.loadDeadline) {
      room.state = 'countdown'; room.cdStep = 4; room.cdAt = now + 800;
      bcast(room, { t: 'cd', n: 4 }); // « préparez-vous »
    }
    return;
  }
  if (room.state === 'countdown') {
    if (now >= room.cdAt) {
      room.cdStep--;
      if (room.cdStep > 0) { bcast(room, { t: 'cd', n: room.cdStep }); room.cdAt = now + 1000; }
      else { room.state = 'racing'; room.t0 = now; bcast(room, { t: 'go' }); }
    }
    return;
  }
  if (room.state !== 'racing') return;
  const T = room.T;
  room.tick++;
  const elapsed = (now - room.t0) / 1000;

  // bots
  for (const b of room.racers) if (b.bot) updateBot(room, b, now, dt);
  // dinos
  for (const d of room.dinoList) updateDino(room, d, now, dt);
  // caisses
  if (room.items) {
    for (const b of room.boxes) {
      if (!b.on && now > b.back) { b.on = true; bcast(room, { t: 'ev', e: 'box', i: b.id, on: 1 }); }
      if (!b.on) continue;
      for (const r of room.racers) {
        if (r.left || r.item || r.finished) continue;
        const dx = r.x - b.x, dz = r.z - b.z;
        if (dx * dx + dz * dz < 3.6 * 3.6) {
          b.on = false; b.back = now + 4500;
          bcast(room, { t: 'ev', e: 'box', i: b.id, on: 0 });
          giveItem(room, r, now);
          break;
        }
      }
    }
  }
  // projectiles
  updateProj(room, now, dt);
  // événements différés
  for (let i = room.later.length - 1; i >= 0; i--) if (now >= room.later[i].at) { const f = room.later[i].fn; room.later.splice(i, 1); f(); }
  // collisions dinos <-> karts
  for (const r of room.racers) {
    if (r.left) continue;
    for (const d of room.dinoList) {
      if (now < d.stunUntil) continue;
      const dx = r.x - d.x, dz = r.z - d.z, rr = d.r + 1.5;
      if (dx * dx + dz * dz < rr * rr) hitKart(room, r, 'dino', null, now, d.x, d.z);
    }
    // pièges (os) gérés dans updateProj
  }
  // classement
  for (const r of room.racers) {
    r.lap = Math.floor(r.prog / T.N) + 1;
    if (!r.finished && r.prog >= room.laps * T.N) {
      r.finished = true; r.finishT = elapsed; r.lap = room.laps;
      bcast(room, { t: 'ev', e: 'fin', id: r.id, time: r2(elapsed) });
    }
  }
  const order = room.racers.filter((r) => !r.left).sort((a, b) => {
    if (a.finished && b.finished) return a.finishT - b.finishT;
    if (a.finished) return -1; if (b.finished) return 1;
    return b.prog - a.prog;
  });
  order.forEach((r, i) => (r.place = i + 1));
  // snapshot
  if (room.tick % 2 === 0) {
    const snap = {
      t: 'snap', e: r2(elapsed),
      r: room.racers.filter((r) => !r.left).map((r) => [r.id, r2(r.x), r2(r.z), r2(r.h), r2(r.v), r.fl | (r.shieldUntil > now ? 16 : 0) | (r.invulnUntil > now ? 32 : 0), r2(r.st), Math.min(room.laps, Math.max(1, r.lap)), r.place, r.finished ? 1 : 0]),
      d: room.dinoList.map((d) => [d.id, r2(d.x), r2(d.z), r2(d.h), now < d.stunUntil ? 3 : d.anim]),
      p: room.proj.map((p) => [p.id, p.type, r2(p.x), r2(p.z), r2(p.h)]),
    };
    bcast(room, snap);
  }
  // fin de course
  const hum = room.racers.filter((r) => !r.bot && !r.left);
  const allDone = hum.length === 0 || hum.every((r) => r.finished);
  if (allDone && !room.endAt) room.endAt = now + 3500;
  if (!room.endAt && hum.some((r) => r.finished)) {
    if (!room.firstFin) room.firstFin = now;
    if (now - room.firstFin > 45000) room.endAt = now;
  }
  if (elapsed > 900) room.endAt = now;
  if (room.endAt && now >= room.endAt) endRace(room, elapsed);
}

function endRace(room, elapsed) {
  const list = room.racers.filter((r) => !r.left).sort((a, b) => {
    if (a.finished && b.finished) return a.finishT - b.finishT;
    if (a.finished) return -1; if (b.finished) return 1;
    return b.prog - a.prog;
  }).map((r, i) => ({ id: r.id, name: r.name, ch: r.ch, veh: r.veh, col: r.col, bot: !!r.bot, place: i + 1, time: r.finished ? r2(r.finishT) : null }));
  bcast(room, { t: 'results', list });
  room.state = 'lobby'; room.racers = null; room.endAt = 0; room.firstFin = 0; room.proj = []; room.later = [];
  for (const p of room.players.values()) { p.ready = false; p.item = null; p.itemN = 0; }
  sendRoomInfo(room);
}

/* ---------- Objets ---------- */
function pickItem(room, rank, n) {
  const r = n > 1 ? (rank - 1) / (n - 1) : 0;
  const L = (a, b) => a + (b - a) * r;
  const W = { rock: L(26, 10), dart: L(14, 11), egg: L(5, 24), bone: L(24, 6), turbo: L(10, 22), shield: L(18, 6), meteor: r > 0.45 && n > 2 ? L(0, 22) * ((r - 0.45) / 0.55) : 0 };
  let tot = 0; for (const k in W) tot += W[k];
  let x = Math.random() * tot;
  for (const k in W) { x -= W[k]; if (x <= 0) return k; }
  return 'rock';
}
function giveItem(room, r, now) {
  const n = room.racers.filter((x) => !x.left).length;
  r.item = pickItem(room, r.place, n);
  r.itemN = S.ITEMS[r.item].n;
  r.useAt = now + rnd(1500, 4500);
  if (!r.bot) r.send({ t: 'item', item: r.item, n: r.itemN });
}
function syncItem(r) { if (!r.bot) r.send({ t: 'item', item: r.item, n: r.itemN }); }

function spawnProj(room, type, r, back, extra) {
  const dir = r.h + (back ? Math.PI : 0);
  const off = back ? -2.8 : 3.0;
  const f = S.fwd(r.h);
  const sp = { rock: 82, dart: 105, egg: 64, bone: 0 }[type];
  const p = Object.assign({
    id: nextProj++, type, owner: r.id, x: r.x + f[0] * off, z: r.z + f[1] * off, h: dir, sp, life: type === 'bone' ? 45 : type === 'egg' ? 5 : 2.6,
    r: { rock: 1.5, dart: 1.0, egg: 1.5, bone: 1.8 }[type], born: Date.now(), target: null,
  }, extra || {});
  room.proj.push(p);
}

function useItem(room, r, back, now) {
  if (!r.item || r.finished) return;
  const it = r.item;
  if ((it === 'dart') && now < r.nextFire) return;
  switch (it) {
    case 'rock': spawnProj(room, 'rock', r, back); r.itemN--; bcast(room, { t: 'ev', e: 'throw', id: r.id, k: 'rock' }); break;
    case 'dart': spawnProj(room, 'dart', r, back); r.itemN--; r.nextFire = now + 260; bcast(room, { t: 'ev', e: 'throw', id: r.id, k: 'dart' }); break;
    case 'egg': spawnProj(room, 'egg', r, back); r.itemN--; bcast(room, { t: 'ev', e: 'throw', id: r.id, k: 'egg' }); break;
    case 'bone': spawnProj(room, 'bone', r, true, { sp: 0 }); r.itemN--; bcast(room, { t: 'ev', e: 'throw', id: r.id, k: 'bone' }); break;
    case 'turbo': {
      const dur = 1.8 * S.CHARS[r.ch].boost;
      r.boostUntil = now + dur * 1000; r.itemN--;
      if (r.bot) { /* géré dans updateBot */ } else r.send({ t: 'boost', dur });
      bcast(room, { t: 'ev', e: 'throw', id: r.id, k: 'turbo' });
      break;
    }
    case 'shield': r.shieldUntil = now + 9000; r.itemN--; bcast(room, { t: 'ev', e: 'throw', id: r.id, k: 'shield' }); break;
    case 'meteor': {
      let tgt = room.racers.find((x) => !x.left && x.place === 1 && x !== r) || room.racers.find((x) => x !== r && !x.left);
      r.itemN--;
      if (tgt) {
        const px = tgt.x + Math.sin(tgt.h) * tgt.v * 1.5, pz = tgt.z + Math.cos(tgt.h) * tgt.v * 1.5;
        bcast(room, { t: 'ev', e: 'meteor', x: r2(px), z: r2(pz), delay: 1.5, by: r.id });
        room.later.push({ at: now + 1500, fn: () => explode(room, 'meteor', px, pz, 9.5, r, Date.now()) });
      }
      break;
    }
  }
  if (r.itemN <= 0) { r.item = null; r.itemN = 0; }
  syncItem(r);
}

const STUN = { rock: 4.2, dart: 7.5, egg: 5.5, bone: 4.5, meteor: 8 };
const SPIN = { rock: 1.3, dart: 0.9, egg: 1.8, bone: 1.3, meteor: 2.3, dino: 1.2 };

function stunDino(room, d, kind, now) {
  d.stunUntil = now + STUN[kind] * 1000;
  bcast(room, { t: 'ev', e: 'stun', id: d.id });
}

function hitKart(room, v, kind, attacker, now, fx, fz) {
  if (v.left || now < v.invulnUntil || v.finished && kind === 'dino') return false;
  if (now < v.shieldUntil) {
    v.shieldUntil = 0; v.invulnUntil = now + 700;
    bcast(room, { t: 'ev', e: 'shield', id: v.id });
    return false;
  }
  const dur = SPIN[kind];
  v.invulnUntil = now + dur * 1000 + 1500;
  const dx = v.x - fx, dz = v.z - fz, l = Math.hypot(dx, dz) || 1;
  if (v.bot) { v.spinUntil = now + dur * 1000; }
  else v.send({ t: 'hit', k: kind, dur, dx: r2(dx / l), dz: r2(dz / l) });
  bcast(room, { t: 'ev', e: 'hit', id: v.id, k: kind, by: attacker ? attacker.id : 0 });
  return true;
}

function explode(room, kind, x, z, rad, owner, now) {
  bcast(room, { t: 'ev', e: 'boom', k: kind, x: r2(x), z: r2(z) });
  for (const r of room.racers) {
    if (r.left) continue;
    if (kind === 'meteor' && r === owner) continue;
    const dx = r.x - x, dz = r.z - z;
    if (dx * dx + dz * dz < rad * rad) hitKart(room, r, kind === 'meteor' ? 'meteor' : kind, owner, now, x, z);
  }
  for (const d of room.dinoList) {
    const dx = d.x - x, dz = d.z - z, rr = rad + d.r;
    if (dx * dx + dz * dz < rr * rr) stunDino(room, d, kind, now);
  }
}

function updateProj(room, now, dt) {
  const T = room.T;
  for (let i = room.proj.length - 1; i >= 0; i--) {
    const p = room.proj[i];
    p.life -= dt;
    let dead = p.life <= 0;
    const age = (now - p.born) / 1000;
    if (p.type !== 'bone') {
      if (p.type === 'egg') {
        // poursuite
        let tgt = p.target;
        if (tgt && (tgt.left || (tgt.stunUntil && now < tgt.stunUntil))) tgt = null;
        if (!tgt && age > 0.25) {
          let best = 1e9;
          const f = S.fwd(p.h);
          const cand = room.racers.filter((r) => !r.left && r.id !== p.owner).concat(room.dinoList.filter((d) => now >= d.stunUntil));
          for (const c of cand) {
            const dx = c.x - p.x, dz = c.z - p.z, d2 = dx * dx + dz * dz;
            if (d2 > 90 * 90) continue;
            const dot = (dx * f[0] + dz * f[1]) / Math.sqrt(d2 || 1);
            if (dot < 0.2) continue;
            if (d2 < best) { best = d2; tgt = c; }
          }
          p.target = tgt;
        }
        if (tgt) {
          const want = Math.atan2(tgt.x - p.x, tgt.z - p.z);
          const df = S.angDiff(want, p.h);
          p.h += clamp(df, -3.2 * dt, 3.2 * dt);
        }
      }
      p.x += Math.sin(p.h) * p.sp * dt; p.z += Math.cos(p.h) * p.sp * dt;
    }
    if (!dead) {
      // karts
      for (const r of room.racers) {
        if (r.left) continue;
        if (r.id === p.owner && age < (p.type === 'bone' ? 1.2 : 0.4)) continue;
        const dx = r.x - p.x, dz = r.z - p.z, rr = p.r + 1.5;
        if (dx * dx + dz * dz < rr * rr) {
          const owner = room.racers.find((o) => o.id === p.owner);
          if (p.type === 'egg') explode(room, 'egg', p.x, p.z, 5, owner, now);
          else {
            hitKart(room, r, p.type, owner, now, p.x, p.z);
            bcast(room, { t: 'ev', e: 'boom', k: p.type, x: r2(p.x), z: r2(p.z) });
          }
          dead = true; break;
        }
      }
    }
    if (!dead && p.type !== 'bone') {
      for (const d of room.dinoList) {
        if (now < d.stunUntil) continue;
        const dx = d.x - p.x, dz = d.z - p.z, rr = d.r + p.r;
        if (dx * dx + dz * dz < rr * rr) {
          const owner = room.racers.find((o) => o.id === p.owner);
          if (p.type === 'egg') explode(room, 'egg', p.x, p.z, 5, owner, now);
          else { stunDino(room, d, p.type, now); bcast(room, { t: 'ev', e: 'boom', k: p.type, x: r2(p.x), z: r2(p.z) }); }
          dead = true; break;
        }
      }
    } else if (!dead && p.type === 'bone') {
      for (const d of room.dinoList) {
        if (now < d.stunUntil) continue;
        const dx = d.x - p.x, dz = d.z - p.z, rr = d.r + 1.5;
        if (dx * dx + dz * dz < rr * rr) { stunDino(room, d, 'bone', now); bcast(room, { t: 'ev', e: 'boom', k: 'bone', x: r2(p.x), z: r2(p.z) }); dead = true; break; }
      }
    }
    if (!dead && p.type !== 'bone') {
      // sortie de piste : disparaît loin du bord
      const idx = S.nearest(T, p.x, p.z, p.hint != null ? p.hint : -1, 30);
      p.hint = idx;
      const lat = Math.abs((p.x - T.x[idx]) * T.rx[idx] + (p.z - T.z[idx]) * T.rz[idx]);
      if (lat > T.halfW + 22) dead = true;
    }
    if (dead) room.proj.splice(i, 1);
  }
}

/* ---------- Dinosaures ---------- */
function updateDino(room, d, now, dt) {
  const T = room.T;
  const old = { x: d.x, z: d.z };
  d.t += dt;
  if (now < d.stunUntil) { d.anim = 3; return; }
  d.anim = 0;
  const A = T.halfW + 4;
  if (d.beh === 'cross') {
    if (d.wait > 0) { d.wait -= dt; d.anim = 0; }
    else {
      d.lat += d.dir * d.spd * dt; d.anim = 1;
      if (d.lat > A) { d.lat = A; d.dir = -1; d.wait = rnd(1.5, 3.5); }
      if (d.lat < -A) { d.lat = -A; d.dir = 1; d.wait = rnd(1.5, 3.5); }
    }
  } else if (d.beh === 'patrol') {
    d.s += d.dir * (d.spd / T.ds) * dt;
    if (d.s > d.s0 + d.L) { d.s = d.s0 + d.L; d.dir = -1; }
    if (d.s < d.s0 - d.L) { d.s = d.s0 - d.L; d.dir = 1; }
    d.lat = Math.sin(d.t * 1.6 + d.id) * (T.halfW - 5);
    d.anim = 2;
  } else if (d.beh === 'ambush') {
    const edge = T.halfW + 8;
    if (d.state === 'idle') {
      for (const r of room.racers) {
        if (r.left || r.finished) continue;
        let ahead = d.s - r.idx; // échantillons restants avant d'arriver au T-Rex
        ahead = ((ahead % T.N) + T.N) % T.N;
        const dist = ahead * T.ds, eta = dist / Math.max(r.v, 6);
        if (dist < 130 && eta < 1.45 && eta > 0.6 && r.v > 6) { d.state = 'charge'; bcast(room, { t: 'ev', e: 'roar', id: d.id }); break; }
      }
    } else if (d.state === 'charge') {
      d.lat -= d.side * d.spd * dt; d.anim = 2;
      if (Math.abs(d.lat) >= edge && Math.sign(d.lat) === -d.side) { d.lat = -d.side * edge; d.state = 'rest'; d.wait = 4.5; }
    } else if (d.state === 'rest') {
      d.anim = 0; d.wait -= dt;
      if (d.wait <= 0) { d.side = -d.side; d.state = 'idle'; }
    }
  }
  const p = S.trackPos(T, d.s, d.lat);
  d.x = p.x; d.z = p.z;
  const mx = d.x - old.x, mz = d.z - old.z;
  if (mx * mx + mz * mz > 1e-5) {
    const want = Math.atan2(mx, mz);
    d.h += clamp(S.angDiff(want, d.h), -6 * dt, 6 * dt);
  } else if (d.beh === 'ambush' && d.state === 'idle') {
    const want = Math.atan2(p.rx * -d.side, p.rz * -d.side);
    d.h += clamp(S.angDiff(want, d.h), -2 * dt, 2 * dt);
  }
}

/* ---------- Bots ---------- */
function updateBot(room, b, now, dt) {
  const T = room.T, veh = S.VEHS[b.veh], ch = S.CHARS[b.ch];
  const idxF = ((b.s % T.N) + T.N) % T.N;
  // vitesse maximale selon courbure à venir
  let kmax = 0;
  for (let j = 0; j < 14; j++) kmax = Math.max(kmax, T.k[(Math.floor(idxF) + j) % T.N]);
  const vcorner = kmax > 1e-4 ? Math.sqrt(46 / kmax) : 999;
  let maxv = veh.max * ch.spd * b.skill * 0.93;
  // élastique : aide les bots en retard, freine ceux qui sont très en avance
  const humans = room.racers.filter((r) => !r.bot && !r.left);
  if (humans.length) {
    const lead = Math.max(...humans.map((h) => h.prog));
    const diff = (lead - b.prog) * T.ds; // mètres de retard
    if (diff > 60) maxv *= 1 + Math.min(0.08, diff / 2500);
    if (diff < -80) maxv *= 1 - Math.min(0.1, -diff / 1800);
  }
  if (now < b.boostUntil) maxv *= 1.3;
  let target = Math.min(maxv, vcorner * 1.0);
  // esquive des dinos
  let latT = Math.sin(now / 1000 * 0.35 + b.seed) * T.halfW * 0.4;
  for (const d of room.dinoList) {
    if (now < d.stunUntil) continue;
    let ahead = d.s - idxF; ahead = ((ahead % T.N) + T.N) % T.N;
    // pour ambush/cross, d.s est fixe
    const distA = ahead * T.ds;
    if (distA < 40 && distA > 0) {
      const margin = d.r + 3.5;
      if (Math.abs(d.lat - b.lat) < margin + 2) {
        const dir = b.lat >= d.lat ? 1 : -1;
        latT = clamp(d.lat + dir * (margin + 2), -T.halfW + 2.5, T.halfW - 2.5);
        if (distA < 18) target *= 0.7;
        if (d.beh === 'cross' && Math.abs(d.lat) < T.halfW && distA < 14) target *= 0.55;
      }
    }
  }
  latT = clamp(latT, -T.halfW + 2.5, T.halfW - 2.5);
  const spinning = now < b.spinUntil;
  if (spinning) b.v *= Math.pow(0.04, dt);
  else if (b.v < target) b.v = Math.min(target, b.v + veh.acc * ch.acc * 0.9 * dt);
  else b.v = Math.max(target, b.v - 38 * dt);
  const dl = latT - b.lat;
  b.lat += clamp(dl, -9 * dt, 9 * dt);
  b.s += (b.v * dt) / T.ds;
  b.prog += (b.v * dt) / T.ds;
  const p = S.trackPos(T, b.s, b.lat);
  b.x = p.x; b.z = p.z;
  const hh = p.h + clamp(dl * 0.02, -0.3, 0.3);
  b.h = hh; b.idx = Math.floor(idxF) % T.N;
  b.st = clamp(-dl * 0.1, -1, 1);
  b.fl = (spinning ? 4 : 0) | (now < b.boostUntil ? 2 : 0);
  if (b.finished) { b.v = Math.max(0, b.v - 5 * dt); }
  // objets
  if (b.item && now > b.useAt) {
    const f = S.fwd(b.h);
    let useNow = false, back = false;
    if (b.item === 'turbo' || b.item === 'shield' || b.item === 'meteor') useNow = true;
    else if (b.item === 'bone') { useNow = room.racers.some((r) => r !== b && !r.left && Math.hypot(r.x - b.x, r.z - b.z) < 30 && (r.x - b.x) * f[0] + (r.z - b.z) * f[1] < 0); }
    else {
      const cands = room.racers.filter((r) => r !== b && !r.left).concat(room.dinoList.filter((d) => now >= d.stunUntil));
      for (const c of cands) {
        const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz);
        const dot = (dx * f[0] + dz * f[1]) / (d || 1);
        const cross = Math.abs(dx * f[1] - dz * f[0]);
        if (d < 55 && ((dot > 0.8 && cross < 6) || (b.item === 'egg' && dot > 0.3))) { useNow = true; break; }
        if (d < 30 && dot < -0.8 && cross < 5) { useNow = true; back = true; break; }
      }
    }
    if (useNow) { useItem(room, b, back, now); b.useAt = now + rnd(400, 900); }
    else b.useAt = now + 300;
  }
}

server.listen(PORT, () => console.log('Dino Grand Prix en ligne sur le port ' + PORT));
