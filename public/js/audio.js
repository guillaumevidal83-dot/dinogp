// Sons synthétisés (aucun fichier audio)
export class Sfx {
  constructor() {
    this.ctx = null; this.on = true; this.music = true; this.engineOsc = null; this.step = 0; this.timer = null;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.6; this.master.connect(this.ctx.destination);
    this.sfxG = this.ctx.createGain(); this.sfxG.gain.value = 0.8; this.sfxG.connect(this.master);
    this.musG = this.ctx.createGain(); this.musG.gain.value = 0.22; this.musG.connect(this.master);
    // bruit blanc réutilisable
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  setOn(v) { this.on = v; if (this.master) this.master.gain.value = v ? 0.6 : 0; }
  setMusic(v) { this.music = v; if (!v) this.stopMusic(); }
  tone(f0, f1, dur, type = 'sine', vol = 0.3, delay = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxG); o.start(t); o.stop(t + dur + 0.05);
  }
  noiseBurst(dur, freq, vol = 0.3, type = 'lowpass', delay = 0, q = 0.7) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxG); s.start(t); s.stop(t + dur + 0.05);
  }
  play(name, vol = 1) {
    if (!this.ctx || !this.on) return;
    switch (name) {
      case 'count': this.tone(440, 440, 0.18, 'square', 0.18 * vol); break;
      case 'go': this.tone(880, 880, 0.5, 'square', 0.22 * vol); this.tone(1320, 1320, 0.5, 'triangle', 0.15 * vol); break;
      case 'pickup': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.12, 'triangle', 0.2 * vol, i * 0.06)); break;
      case 'throw': this.noiseBurst(0.3, 1800, 0.35 * vol, 'bandpass', 0, 1.5); this.tone(500, 160, 0.25, 'sawtooth', 0.12 * vol); break;
      case 'dart': this.tone(1400, 500, 0.15, 'square', 0.12 * vol); break;
      case 'hit': this.noiseBurst(0.35, 700, 0.5 * vol); this.tone(220, 50, 0.4, 'sawtooth', 0.3 * vol); break;
      case 'boom': this.noiseBurst(0.8, 420, 0.7 * vol); this.tone(120, 30, 0.7, 'sine', 0.5 * vol); break;
      case 'bonk': this.tone(300, 90, 0.3, 'square', 0.25 * vol); this.tone(900, 700, 0.12, 'triangle', 0.2 * vol, 0.05); break;
      case 'boost': this.noiseBurst(0.7, 1200, 0.35 * vol, 'highpass'); this.tone(200, 900, 0.5, 'sawtooth', 0.15 * vol); break;
      case 'shield': this.tone(600, 1200, 0.3, 'sine', 0.25 * vol); break;
      case 'pop': this.tone(1200, 200, 0.25, 'triangle', 0.3 * vol); break;
      case 'roar':
        this.tone(90, 45, 1.3, 'sawtooth', 0.4 * vol); this.tone(135, 60, 1.1, 'square', 0.15 * vol); this.noiseBurst(1.2, 500, 0.35 * vol, 'lowpass', 0, 2);
        break;
      case 'squeak': this.tone(900, 1800, 0.18, 'triangle', 0.15 * vol); break;
      case 'honk': this.tone(330, 330, 0.28, 'square', 0.18 * vol); this.tone(415, 415, 0.28, 'square', 0.18 * vol); break;
      case 'bump': this.noiseBurst(0.12, 300, 0.4 * vol); break;
      case 'lap': [660, 880, 1100].forEach((f, i) => this.tone(f, f, 0.15, 'triangle', 0.2 * vol, i * 0.08)); break;
      case 'win': [523, 659, 784, 1047, 784, 1047, 1318].forEach((f, i) => this.tone(f, f, 0.2, 'triangle', 0.22 * vol, i * 0.12)); break;
      case 'click': this.tone(700, 500, 0.06, 'square', 0.1 * vol); break;
    }
  }
  engine(ratio, boosting, on) {
    if (!this.ctx) return;
    if (!this.engineOsc) {
      const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master); o.start(); o2.start();
      this.engineOsc = { o, o2, f, g };
    }
    const e = this.engineOsc, t = this.ctx.currentTime;
    const fr = 55 + ratio * 150 + (boosting ? 40 : 0);
    e.o.frequency.setTargetAtTime(fr, t, 0.05); e.o2.frequency.setTargetAtTime(fr * 0.5, t, 0.05);
    e.f.frequency.setTargetAtTime(350 + ratio * 1400, t, 0.05);
    e.g.gain.setTargetAtTime(on && this.on ? 0.05 + ratio * 0.06 : 0, t, 0.08);
  }
  // petite boucle musicale tribale (percussions + basse pentatonique)
  startMusic() {
    if (!this.ctx || !this.music || this.timer) return;
    const notes = [110, 110, 131, 110, 147, 110, 131, 98];
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => {
      if (!this.ctx || !this.on) return;
      while (this.nextT < this.ctx.currentTime + 0.25) {
        this.musicStep(this.step, this.nextT, notes);
        this.nextT += 60 / 150 / 2; this.step = (this.step + 1) % 32;
      }
    }, 80);
  }
  stopMusic() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  musicStep(s, t, notes) {
    const c = this.ctx;
    const hit = (f, dur, vol, type) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f * 0.4), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.musG); o.start(t); o.stop(t + dur + 0.02);
    };
    if (s % 4 === 0) hit(140, 0.22, 0.9, 'sine');
    if (s % 8 === 6 || s % 16 === 3) hit(220, 0.12, 0.5, 'triangle');
    if (s % 2 === 1) hit(900, 0.05, 0.12, 'square');
    if (s % 2 === 0) { const f = notes[(s >> 1) % notes.length] * (s >= 16 ? 1.5 : 1); hit(f, 0.28, 0.5, 'sawtooth'); }
  }
}
