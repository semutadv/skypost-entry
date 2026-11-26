'use strict';
/* random.js: a seeded random generator and the value-noise field built on it.
 * Everything procedural in SKYPOST (islands, clouds, courses) draws from a
 * seeded source so a given seed always builds the same world — that is what
 * makes the screenshot states reproducible. */
window.SKYPOST = window.SKYPOST || {};

/* Mulberry32: tiny, fast, good enough for terrain and gameplay scatter. */
SKYPOST.makeRng = function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* A tileable value-noise field: random values on a lattice, smoothstep
 * interpolation between them, and the lattice wraps so the world tile can
 * repeat seamlessly at its borders. */
SKYPOST.makeNoiseField = function makeNoiseField(seed, latticeSize) {
  const rng = SKYPOST.makeRng(seed);
  const size = latticeSize;
  const values = new Float32Array(size * size);
  for (let i = 0; i < values.length; i++) values[i] = rng();

  function latticeAt(x, y) {
    const xi = ((x % size) + size) % size;
    const yi = ((y % size) + size) % size;
    return values[yi * size + xi];
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  /* Sample the field at continuous coordinates; returns 0..1. */
  function sample(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const a = latticeAt(x0, y0);
    const b = latticeAt(x0 + 1, y0);
    const c = latticeAt(x0, y0 + 1);
    const d = latticeAt(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  /* Fractal sum: a few octaves of the same field at rising frequency. */
  function fbm(x, y, octaves) {
    let total = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      total += amplitude * sample(x * frequency, y * frequency);
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return total / norm;
  }

  return { sample, fbm };
};

/* Deterministic 2D cell hash, used for the rice-field patchwork pattern:
 * the same world cell always grows the same crop colour. */
SKYPOST.cellHash = function cellHash(cx, cy) {
  let h = (cx * 374761393 + cy * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
