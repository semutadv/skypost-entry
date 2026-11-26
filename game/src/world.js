'use strict';
/* world.js: bakes the archipelago into a heightfield plus a matching colour
 * map, then answers the two questions every other system asks — how high is
 * the ground here, and what colour is it. Islands are hand-placed cones over
 * a noise sea floor, so the mail route (home island, the volcano, the far
 * strip) always sits in the same, recognisable geography. */
window.SKYPOST = window.SKYPOST || {};

SKYPOST.buildWorld = function buildWorld(seed) {
  const cfg = SKYPOST.config.world;
  const res = cfg.heightRes;
  const size = cfg.sizeMeters;
  const cell = size / res;
  const heights = new Float32Array(res * res);
  const colors = new Uint32Array(res * res);
  const noise = SKYPOST.makeNoiseField(seed * 7 + 11, 64);
  const detail = SKYPOST.makeNoiseField(seed * 13 + 5, 128);
  const rng = SKYPOST.makeRng(seed * 31 + 3);

  /* Island layout: cx/cz in metres (x east, z south), r the shore radius,
   * peak the summit height. The volcano is the tall one to the north-east. */
  const islands = [
    { cx: 4200, cz: 11800, r: 2300, peak: 95, kind: 'home' },
    { cx: 10800, cz: 4200, r: 2700, peak: 430, kind: 'volcano' },
    { cx: 7700, cz: 8500, r: 1250, peak: 62, kind: 'isle' },
    { cx: 9300, cz: 10600, r: 950, peak: 48, kind: 'isle' },
    { cx: 5900, cz: 5900, r: 1050, peak: 58, kind: 'isle' },
    { cx: 13000, cz: 10600, r: 1650, peak: 78, kind: 'destination' },
    { cx: 2500, cz: 3500, r: 1100, peak: 52, kind: 'isle' },
    { cx: 14200, cz: 2400, r: 900, peak: 40, kind: 'isle' },
  ];
  const volcano = islands[1];

  /* Runways: flat strips carved into the home and destination islands.
   * heading is the takeoff direction (0 = north, clockwise). */
  const runways = [
    { cx: 4200, cz: 11800, heading: 0, length: 980, width: 46, altitude: 14, name: 'SKYPOST FIELD' },
    { cx: 13000, cz: 10600, heading: -0.5, length: 900, width: 46, altitude: 12, name: 'FARSHORE STRIP' },
  ];

  function wrappedDelta(a, b) {
    let d = a - b;
    if (d > size / 2) d -= size;
    if (d < -size / 2) d += size;
    return d;
  }

  function islandHeight(x, z) {
    let h = -26; // open-sea floor
    for (const isl of islands) {
      const dx = wrappedDelta(x, isl.cx);
      const dz = wrappedDelta(z, isl.cz);
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= isl.r) continue;
      const t = 1 - d / isl.r;
      let profile = t * t * (3 - 2 * t); // smoothstep cone
      let cone = isl.peak * Math.pow(profile, 1.25);
      if (isl.kind === 'volcano') {
        // A crater: dip the very summit back down.
        const crater = Math.exp(-(d * d) / (2 * 260 * 260));
        cone -= 120 * crater * Math.min(1, cone / 200);
      }
      h = Math.max(h, cone - 26 * (1 - profile));
    }
    return h;
  }

  /* Bake heights. */
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = (i + 0.5) * cell;
      const z = (j + 0.5) * cell;
      let h = islandHeight(x, z);
      if (h > -4) {
        // Rolling detail on land, kept gentle near the shore.
        const n = noise.fbm(x / size * 8, z / size * 8, 4) - 0.5;
        const landness = Math.min(1, Math.max(0, (h + 4) / 30));
        h += n * 34 * landness;
        h += (detail.sample(x / size * 32, z / size * 32) - 0.5) * 5 * landness;
      }
      heights[j * res + i] = h;
    }
  }

  /* Carve the runways flat (blend at the edges so there is no cliff). */
  function carveRunway(rw) {
    const sinH = Math.sin(rw.heading);
    const cosH = Math.cos(rw.heading);
    const reach = rw.length / 2 + 130;
    const wideReach = rw.width / 2 + 110;
    const i0 = Math.floor((rw.cx - reach - wideReach) / cell);
    const i1 = Math.ceil((rw.cx + reach + wideReach) / cell);
    const j0 = Math.floor((rw.cz - reach - wideReach) / cell);
    const j1 = Math.ceil((rw.cz + reach + wideReach) / cell);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * cell;
        const z = (j + 0.5) * cell;
        const dx = wrappedDelta(x, rw.cx);
        const dz = wrappedDelta(z, rw.cz);
        // Local frame: alongF = down-runway axis (forward is (sinH, -cosH)),
        // across = sideways.
        const alongF = dx * sinH + dz * (-cosH);
        const across = dx * cosH + dz * sinH;
        if (Math.abs(alongF) > reach || Math.abs(across) > wideReach) continue;
        const edge = Math.max(
          Math.abs(alongF) / reach,
          Math.abs(across) / wideReach
        );
        const blend = edge < 0.72 ? 1 : Math.max(0, 1 - (edge - 0.72) / 0.28);
        const ii = ((i % res) + res) % res;
        const jj = ((j % res) + res) % res;
        const idx = jj * res + ii;
        heights[idx] = heights[idx] * (1 - blend) + rw.altitude * blend;
      }
    }
  }
  for (const rw of runways) carveRunway(rw);

  /* Widen each carve into a proper airfield plateau: within a few hundred
   * metres of a strip the ground eases to the strip's altitude, so the
   * runway sits in a field and not at the bottom of a trench. */
  function plateauRunway(rw) {
    const full = 330;
    const reach = 820;
    const i0 = Math.floor((rw.cx - reach) / cell);
    const i1 = Math.ceil((rw.cx + reach) / cell);
    const j0 = Math.floor((rw.cz - reach) / cell);
    const j1 = Math.ceil((rw.cz + reach) / cell);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * cell;
        const z = (j + 0.5) * cell;
        const dx = wrappedDelta(x, rw.cx);
        const dz = wrappedDelta(z, rw.cz);
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d >= reach) continue;
        const t = d <= full ? 0 : (d - full) / (reach - full);
        const blend = 1 - t * t * (3 - 2 * t);
        const ii = ((i % res) + res) % res;
        const jj = ((j % res) + res) % res;
        const idx = jj * res + ii;
        heights[idx] = heights[idx] * (1 - blend) + rw.altitude * blend;
      }
    }
  }
  for (const rw of runways) plateauRunway(rw);

  function cellIndex(x, z) {
    const i = Math.floor((((x % size) + size) % size) / cell);
    const j = Math.floor((((z % size) + size) % size) / cell);
    return j * res + i;
  }

  function heightAt(x, z) {
    // Bilinear sample of the baked field, wrapping at the tile edges.
    const fx = ((((x % size) + size) % size) / cell) - 0.5;
    const fz = ((((z % size) + size) % size) / cell) - 0.5;
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fz);
    const tx = fx - i0;
    const tz = fz - j0;
    function at(i, j) {
      const ii = ((i % res) + res) % res;
      const jj = ((j % res) + res) % res;
      return heights[jj * res + ii];
    }
    const a = at(i0, j0);
    const b = at(i0 + 1, j0);
    const c = at(i0, j0 + 1);
    const d = at(i0 + 1, j0 + 1);
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  /* The surface a plane can touch: terrain, or the sea itself. */
  function groundAt(x, z) {
    return Math.max(cfg.seaLevel, heightAt(x, z));
  }

  function slopeAt(x, z) {
    const e = cell * 0.9;
    const dx = heightAt(x + e, z) - heightAt(x - e, z);
    const dz = heightAt(x, z + e) - heightAt(x, z - e);
    return Math.sqrt(dx * dx + dz * dz) / (2 * e);
  }

  function onRunway(x, z, rw) {
    const dx = wrappedDelta(x, rw.cx);
    const dz = wrappedDelta(z, rw.cz);
    const along = dx * Math.sin(rw.heading) + dz * (-Math.cos(rw.heading));
    const across = dx * Math.cos(rw.heading) + dz * Math.sin(rw.heading);
    return {
      on: Math.abs(along) <= rw.length / 2 && Math.abs(across) <= rw.width / 2,
      along,
      across,
    };
  }

  /* Bake colours, one per heightfield cell. */
  const pal = SKYPOST.config.palette;
  function hexRgb(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }
  const C = {};
  for (const k of Object.keys(pal)) C[k] = hexRgb(pal[k]);
  function pack(r, g, b) {
    return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
  }
  function mix(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const idx = j * res + i;
      const x = (i + 0.5) * cell;
      const z = (j + 0.5) * cell;
      const h = heights[idx];
      let rgb;
      if (h < 0.4) {
        const depth = Math.min(1, -h / 26);
        rgb = mix(C.shallowSea, C.deepSea, Math.pow(depth, 0.6));
        if (h > -2.2) rgb = mix(C.sand, rgb, 0.35); // pale shallows at the shore
      } else {
        // Is this cell part of a runway strip?
        let rwHit = null;
        for (const rw of runways) {
          const info = onRunway(x, z, rw);
          if (info.on) { rwHit = { rw, info }; break; }
        }
        if (rwHit) {
          const { along, across } = rwHit.info;
          const dash = Math.abs(across) < 1.6 && ((((along + 490) % 60) + 60) % 60) < 30;
          const edgeLine = Math.abs(Math.abs(across) - (rwHit.rw.width / 2 - 2.4)) < 1.4;
          const threshold = Math.abs(along) > rwHit.rw.length / 2 - 26 && Math.abs(across) < 9;
          rgb = dash || edgeLine || threshold ? C.runwayMark : C.runway;
        } else if (h < 3.2) {
          rgb = C.sand;
        } else {
          const slope = slopeAt(x, z);
          const dv = wrappedDelta(x, volcano.cx);
          const dw = wrappedDelta(z, volcano.cz);
          const volcanoDist = Math.sqrt(dv * dv + dw * dw);
          if (volcanoDist < volcano.r * 0.62 && h > 120) {
            rgb = h > 330 ? C.snow : mix(C.ash, C.rock, Math.min(1, (h - 120) / 160));
          } else if (slope > 0.85 || h > 250) {
            rgb = C.rock;
          } else if (slope > 0.5) {
            rgb = mix(C.grass, C.rock, (slope - 0.5) / 0.35);
          } else if (h < 46 && slope < 0.3) {
            // Rice-field patchwork on the flat lowlands.
            const cellId = SKYPOST.cellHash(Math.floor(x / 95), Math.floor(z / 95));
            if (cellId < 0.42) rgb = C.riceField;
            else if (cellId < 0.62) rgb = C.riceWater;
            else if (cellId < 0.82) rgb = C.grass;
            else rgb = C.forest;
          } else {
            const fn = detail.sample(x / size * 24, z / size * 24);
            rgb = fn < 0.45 ? C.grass : C.forest;
            if (h > 150) rgb = mix(rgb, C.rock, Math.min(1, (h - 150) / 120));
          }
        }
      }
      // A whisper of per-cell brightness jitter so flat areas still read
      // as ground and not as plastic, plus a fixed-sun hillshade so slopes
      // model themselves: faces turned to the sun brighten, faces turned
      // away fall into shade. Sea and runway paint stay unshaded.
      const jitter = 0.94 + SKYPOST.cellHash(i * 3 + 1, j * 5 + 2) * 0.12;
      let shade = 1;
      if (h >= 0.4) {
        const gx = heights[j * res + (((i + 1) % res))] - heights[j * res + (((i - 1 + res) % res))];
        const gz = heights[(((j + 1) % res)) * res + i] - heights[(((j - 1 + res) % res)) * res + i];
        shade = Math.max(0.68, Math.min(1.16, 1 + (-gx * 0.028 + gz * 0.02)));
      }
      const light = jitter * shade;
      colors[idx] = pack(
        Math.min(255, Math.round(rgb[0] * light)),
        Math.min(255, Math.round(rgb[1] * light)),
        Math.min(255, Math.round(rgb[2] * light))
      );
    }
  }

  function colorAt(x, z) {
    return colors[cellIndex(x, z)];
  }

  /* Scatter: trees on gentle green land, houses near the shore. Positions
   * are fixed at bake time so every frame draws the same world. */
  const trees = [];
  const houses = [];
  let guard = 0;
  while (trees.length < 420 && guard++ < 6000) {
    const x = rng() * size;
    const z = rng() * size;
    const h = heightAt(x, z);
    if (h > 6 && h < 190 && slopeAt(x, z) < 0.5) {
      if (runways.some((rw) => onRunway(x, z, rw).on)) continue;
      trees.push({ x, z, h, s: 0.8 + rng() * 0.7 });
    }
  }
  guard = 0;
  while (houses.length < 46 && guard++ < 6000) {
    const x = rng() * size;
    const z = rng() * size;
    const h = heightAt(x, z);
    if (h > 2 && h < 26 && slopeAt(x, z) < 0.35) {
      if (runways.some((rw) => onRunway(x, z, rw).on)) continue;
      houses.push({ x, z, h, rot: rng() * Math.PI, warm: rng() });
    }
  }

  return {
    heights,
    colors,
    islands,
    runways,
    volcano,
    trees,
    houses,
    heightAt,
    groundAt,
    slopeAt,
    colorAt,
    onRunway,
    wrappedDelta,
  };
};
