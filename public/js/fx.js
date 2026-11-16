import * as THREE from 'three';

// Système de particules (un seul draw call par système)
export class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.p = [];
    for (let k = 0; k < max; k++) this.p.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, d: 0, s0: 1, s1: 1, c: [1, 1, 1, 1] });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.uniforms = { uScale: { value: 600 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute float aSize; attribute vec4 aColor; varying vec4 vC; uniform float uScale;\n' +
        'void main(){ vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/max(0.5,-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying vec4 vC; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.05,d); gl_FragColor=vec4(vC.rgb, vC.a*a); }',
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = geo;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, c, g = 0, d = 0) {
    const p = this.p[this.i];
    this.i = (this.i + 1) % this.max;
    p.life = life; p.max = life; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.s0 = s0; p.s1 = s1; p.c = c; p.g = g; p.d = d;
  }
  update(dt, scale) {
    this.uniforms.uScale.value = scale;
    const P = this.p;
    for (let k = 0; k < this.max; k++) {
      const p = P[k];
      if (p.life > 0) {
        p.life -= dt;
        const t = 1 - Math.max(0, p.life) / p.max;
        p.vy -= p.g * dt;
        const dr = Math.max(0, 1 - p.d * dt);
        p.vx *= dr; p.vz *= dr; p.vy *= dr;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        this.pos[k * 3] = p.x; this.pos[k * 3 + 1] = p.y; this.pos[k * 3 + 2] = p.z;
        this.size[k] = p.s0 + (p.s1 - p.s0) * t;
        const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
        this.col[k * 4] = p.c[0]; this.col[k * 4 + 1] = p.c[1]; this.col[k * 4 + 2] = p.c[2]; this.col[k * 4 + 3] = p.c[3] * Math.max(0, fade);
      } else this.size[k] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}

const rr = (a, b) => a + Math.random() * (b - a);

export class Fx {
  constructor(scene, quality) {
    const k = quality === 0 ? 0.5 : 1;
    this.soft = new Particles(scene, Math.floor(700 * k), false); // fumée, poussière
    this.glow = new Particles(scene, Math.floor(600 * k), true); // feu, étincelles
    this.q = quality;
  }
  update(dt, h, fov) {
    const scale = (h * 0.5) / Math.tan((fov * Math.PI) / 360);
    this.soft.update(dt, scale);
    this.glow.update(dt, scale);
  }
  dust(x, z, c) {
    this.soft.emit(x + rr(-0.5, 0.5), 0.3, z + rr(-0.5, 0.5), rr(-1.5, 1.5), rr(1, 2.4), rr(-1.5, 1.5), rr(0.6, 1.1), 0.8, 2.6, c || [0.7, 0.6, 0.45, 0.55], 0, 1.2);
  }
  smoke(x, y, z, big) {
    this.soft.emit(x, y, z, rr(-1, 1), rr(3, 6) * (big ? 1.8 : 1), rr(-1, 1), rr(1.5, 3), big ? 14 : 3, big ? 55 : 10, [0.25, 0.22, 0.22, big ? 0.5 : 0.35], 0, 0.3);
  }
  spark(x, y, z, c) {
    this.glow.emit(x, y, z, rr(-6, 6), rr(2, 7), rr(-6, 6), rr(0.25, 0.5), 0.35, 0.05, c || [1, 0.7, 0.2, 1], 12, 0.5);
  }
  flame(x, y, z, vx, vz, c) {
    this.glow.emit(x, y, z, vx + rr(-1, 1), rr(0, 1.5), vz + rr(-1, 1), rr(0.15, 0.35), 0.9, 0.1, c || [1, 0.55, 0.12, 0.9], 0, 0.5);
  }
  trail(x, y, z, c) {
    this.glow.emit(x, y, z, rr(-0.5, 0.5), rr(-0.5, 0.5), rr(-0.5, 0.5), 0.35, 0.9, 0.1, c, 0, 0);
  }
  boom(x, y, z, kind) {
    const n = this.q === 0 ? 14 : 30;
    const cols = { meteor: [1, 0.45, 0.1, 1], egg: [1, 0.85, 0.4, 1], rock: [0.9, 0.8, 0.6, 1], dart: [0.6, 1, 0.5, 1], bone: [0.95, 0.95, 0.85, 1], dino: [1, 0.9, 0.4, 1] };
    const c = cols[kind] || cols.rock;
    const R = kind === 'meteor' ? 2.2 : 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = rr(4, 16) * R;
      this.glow.emit(x, y + 0.8, z, Math.cos(a) * s, rr(3, 12) * R, Math.sin(a) * s, rr(0.4, 0.9), 1.6 * R, 0.1, c, 14, 0.8);
    }
    for (let i = 0; i < (kind === 'meteor' ? 24 : 8); i++) {
      const a = Math.random() * 6.283, s = rr(2, 9) * R;
      this.soft.emit(x, y + 0.5, z, Math.cos(a) * s, rr(1, 5), Math.sin(a) * s, rr(0.8, 1.8), 2 * R, 7 * R, [0.35, 0.3, 0.28, 0.6], 0, 1.5);
    }
  }
  stars(x, y, z) {
    for (let i = 0; i < 10; i++) this.glow.emit(x, y, z, rr(-4, 4), rr(2, 6), rr(-4, 4), rr(0.5, 0.9), 0.7, 0.1, [1, 0.95, 0.3, 1], 8, 0.5);
  }
  confetti(x, y, z) {
    for (let i = 0; i < 4; i++) {
      const c = [[1, 0.3, 0.3, 1], [0.3, 1, 0.4, 1], [0.4, 0.6, 1, 1], [1, 0.9, 0.2, 1]][(Math.random() * 4) | 0];
      this.glow.emit(x + rr(-6, 6), y + rr(8, 14), z + rr(-6, 6), rr(-2, 2), rr(-1, 1), rr(-2, 2), rr(2, 3), 0.5, 0.4, c, 2, 0.2);
    }
  }
}
