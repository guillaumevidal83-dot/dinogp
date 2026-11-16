import * as THREE from 'three';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed + 1, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const sm = (t) => t * t * (3 - 2 * t);
export function vnoise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = sm(x - ix), fy = sm(y - iy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm(x, y, seed = 0, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i * 17); n += a; a *= 0.5; f *= 2; }
  return s / n;
}
// bruit périodique (textures sans couture)
function hashT(ix, iy, p, seed) { return hash2(((ix % p) + p) % p, ((iy % p) + p) % p, seed); }
function tnoise(x, y, p, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = sm(x - ix), fy = sm(y - iy);
  const a = hashT(ix, iy, p, seed), b = hashT(ix + 1, iy, p, seed), c = hashT(ix, iy + 1, p, seed), d = hashT(ix + 1, iy + 1, p, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function tfbm(x, y, p, seed = 0, oct = 4) {
  let s = 0, a = 0.5, n = 0, per = p, f = 1;
  for (let i = 0; i < oct; i++) { s += a * tnoise(x * f, y * f, per, seed + i * 31); n += a; a *= 0.5; f *= 2; per *= 2; }
  return s / n;
}
export const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;

export function hex2rgb(h) {
  const hx = new THREE.Color(h).getHex(THREE.SRGBColorSpace); // octets sRGB (pas linéaires)
  return [(hx >> 16) & 255, (hx >> 8) & 255, hx & 255];
}
export function lerpRGB(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

export function canvasTex(w, h, draw, opt = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (opt.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opt.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = opt.aniso || 4;
  return t;
}
// remplit une image pixel par pixel : fn(x,y) -> [r,g,b]
export function pixelFill(g, w, h, fn) {
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn(x, y), i = (y * w + x) * 4;
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

export function disposeScene(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => {
      for (const k in mm) { const v = mm[k]; if (v && v.isTexture) v.dispose(); }
      mm.dispose();
    });
  });
}
