'use strict';
/* objects-view.js: everything in the world that is not terrain — the ring
 * course, clouds, trees and houses as billboards, volcano smoke, celebration
 * particles, and the plane itself when the camera rides behind it in chase
 * view. All of it is drawn through the shared projection from terrain-view. */
window.SKYPOST = window.SKYPOST || {};

SKYPOST.createObjectsView = function createObjectsView(world, seed) {
  const C = SKYPOST.config.course;
  const rng = SKYPOST.makeRng(seed * 17 + 23);

  /* Clouds live in the world at flying height, so they can be approached,
   * passed and flown through — not pasted on the sky. */
  const clouds = [];
  for (let i = 0; i < 120; i++) {
    clouds.push({
      x: rng() * SKYPOST.config.world.sizeMeters,
      z: rng() * SKYPOST.config.world.sizeMeters,
      alt: 430 + rng() * 420,
      size: 120 + rng() * 260,
      puffs: 4 + Math.floor(rng() * 4),
      seed: rng() * 1000,
    });
  }

  const particles = [];
  function spawnBurst(x, z, alt, colour, count, spread) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, z, alt,
        vx: (rng() - 0.5) * spread,
        vz: (rng() - 0.5) * spread,
        va: (rng() - 0.5) * spread * 0.5,
        life: 0.9 + rng() * 0.7,
        age: 0,
        colour,
        size: 1.6 + rng() * 2.6,
      });
    }
  }

  function drawParticles(ctx, proj, dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.alt += p.va * dt;
      const s = proj.project(p.x, p.z, p.alt);
      if (!s) continue;
      const alpha = 1 - p.age / p.life;
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = p.colour;
      const r = Math.max(1, p.size * s.scale * 0.14);
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawClouds(ctx, proj, cam) {
    const sorted = [];
    for (const cl of clouds) {
      const s = proj.project(cl.x, cl.z, cl.alt);
      if (s && s.dist > 380 && s.dist < 7000) sorted.push({ cl, s });
    }
    sorted.sort((a, b) => b.s.dist - a.s.dist);
    for (const { cl, s } of sorted) {
      const baseR = cl.size * s.scale * 0.5;
      if (baseR < 3) continue;
      const fade = Math.min(1, Math.max(0.25, 1600 / s.dist));
      for (let p = 0; p < cl.puffs; p++) {
        const px = s.sx + Math.sin(cl.seed + p * 2.4) * baseR * 0.58;
        const py = s.sy + Math.cos(cl.seed * 1.3 + p * 1.9) * baseR * 0.09;
        const pr = baseR * (0.42 + 0.2 * Math.sin(cl.seed + p * 3.1));
        const grad = ctx.createRadialGradient(px, py - pr * 0.3, pr * 0.15, px, py, pr);
        grad.addColorStop(0, `rgba(255,255,255,${0.5 * fade})`);
        grad.addColorStop(0.75, `rgba(244,248,252,${0.34 * fade})`);
        grad.addColorStop(1, 'rgba(240,246,252,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* One ring of the course. The active ring burns gold and pulses; rings
   * ahead wait in pale cyan; a threaded ring flashes green, a missed one
   * shows a brief red cross. */
  function drawRing(ctx, proj, ring, state, time) {
    const s = proj.project(ring.x, ring.z, ring.alt);
    if (!s) return;
    const nX = Math.sin(ring.heading);
    const nZ = -Math.cos(ring.heading);
    const dx = ring.x - proj.camX;
    const dz = ring.z - proj.camZ;
    const dl = Math.hypot(dx, dz) || 1;
    const facing = Math.abs((dx / dl) * nX + (dz / dl) * nZ);
    const rx = Math.max(2, C.ringRadius * s.scale * Math.max(0.24, facing));
    const ry = Math.max(2, C.ringRadius * s.scale);
    if (rx > proj.width * 1.6) return; // flying through it: too big to draw
    let stroke;
    let width;
    let glow = 0;
    if (state === 'active') {
      const pulse = 1 + Math.sin(time * 4.2) * 0.05;
      stroke = '#ffb703';
      width = Math.max(2, C.ringTube * s.scale) * pulse;
      glow = 16;
    } else if (state === 'passed') {
      stroke = 'rgba(74,222,128,0.75)';
      width = Math.max(1.5, C.ringTube * s.scale * 0.7);
    } else if (state === 'missed') {
      stroke = 'rgba(248,113,113,0.8)';
      width = Math.max(1.5, C.ringTube * s.scale * 0.7);
    } else {
      stroke = 'rgba(165,243,252,0.55)';
      width = Math.max(1.2, C.ringTube * s.scale * 0.55);
    }
    ctx.save();
    if (glow) {
      ctx.shadowColor = 'rgba(255,183,3,0.85)';
      ctx.shadowBlur = glow;
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.ellipse(s.sx, s.sy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (state === 'missed') {
      ctx.strokeStyle = 'rgba(248,113,113,0.85)';
      ctx.lineWidth = Math.max(2, width * 0.8);
      const k = Math.min(rx, ry) * 0.62;
      ctx.beginPath();
      ctx.moveTo(s.sx - k, s.sy - k);
      ctx.lineTo(s.sx + k, s.sy + k);
      ctx.moveTo(s.sx + k, s.sy - k);
      ctx.lineTo(s.sx - k, s.sy + k);
      ctx.stroke();
    }
    if (state === 'active') {
      // A little pennant above the ring so it can be spotted at distance.
      const bob = Math.sin(time * 2.4) * ry * 0.05;
      ctx.fillStyle = '#ffb703';
      ctx.beginPath();
      ctx.moveTo(s.sx, s.sy - ry - 4 + bob);
      ctx.lineTo(s.sx, s.sy - ry - 4 - Math.max(6, ry * 0.22) + bob);
      ctx.lineTo(s.sx + Math.max(8, rx * 0.3), s.sy - ry - 4 - Math.max(3, ry * 0.11) + bob);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawRings(ctx, proj, flight, time) {
    const order = flight.rings
      .map((ring, i) => ({ ring, i, s: proj.project(ring.x, ring.z, ring.alt) }))
      .filter((e) => e.s)
      .sort((a, b) => b.s.dist - a.s.dist);
    for (const { ring, i } of order) {
      const state = ring.passed ? 'passed'
        : ring.missed ? 'missed'
        : i === flight.ringIndex ? 'active' : 'waiting';
      drawRing(ctx, proj, ring, state, time);
    }
  }

  /* Trees and houses near the camera, far ones first. Simple shapes, but
   * they sell the height better than anything else in the scene. */
  function drawBillboards(ctx, proj, cam) {
    const items = [];
    for (const t of world.trees) {
      const s = proj.project(t.x, t.z, t.h);
      if (s && s.dist < 2400) items.push({ kind: 'tree', o: t, s });
    }
    for (const hs of world.houses) {
      const s = proj.project(hs.x, hs.z, hs.h);
      if (s && s.dist < 2400) items.push({ kind: 'house', o: hs, s });
    }
    items.sort((a, b) => b.s.dist - a.s.dist);
    for (const { kind, o, s } of items.slice(0, 260)) {
      if (kind === 'tree') {
        const hgt = 12 * o.s * s.scale;
        if (hgt < 2) continue;
        ctx.fillStyle = '#5b4632';
        ctx.fillRect(s.sx - hgt * 0.05, s.sy - hgt * 0.3, hgt * 0.1, hgt * 0.3);
        ctx.fillStyle = '#2f6b2f';
        ctx.beginPath();
        ctx.moveTo(s.sx, s.sy - hgt);
        ctx.lineTo(s.sx - hgt * 0.34, s.sy - hgt * 0.25);
        ctx.lineTo(s.sx + hgt * 0.34, s.sy - hgt * 0.25);
        ctx.closePath();
        ctx.fill();
      } else {
        const wdt = 13 * s.scale;
        const hgt = 7 * s.scale;
        if (wdt < 3) continue;
        ctx.fillStyle = o.warm > 0.5 ? '#e8dcc3' : '#d9e2e8';
        ctx.fillRect(s.sx - wdt / 2, s.sy - hgt, wdt, hgt);
        ctx.fillStyle = '#b3492e';
        ctx.beginPath();
        ctx.moveTo(s.sx - wdt * 0.62, s.sy - hgt);
        ctx.lineTo(s.sx, s.sy - hgt * 1.7);
        ctx.lineTo(s.sx + wdt * 0.62, s.sy - hgt);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /* A lazy smoke column over the volcano crater. */
  function drawVolcanoSmoke(ctx, proj, time) {
    const v = world.volcano;
    for (let i = 0; i < 7; i++) {
      const rise = ((time * 14 + i * 55) % 380);
      const drift = Math.sin(time * 0.4 + i) * 22 + rise * 0.24;
      const s = proj.project(v.cx + drift, v.cz + drift * 0.4, 415 + rise);
      if (!s) continue;
      const r = (26 + rise * 0.35) * s.scale;
      if (r < 2) continue;
      ctx.fillStyle = `rgba(226,222,218,${0.3 * (1 - rise / 420)})`;
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* The plane from behind, for chase view: cream fuselage, red trim, a
   * blurred prop disc, and navigation lights that blink the way real ones
   * do — red on the left wing, green on the right, white strobe astern. */
  function drawPlaneChase(ctx, proj, plane, time) {
    const s = proj.project(plane.x, plane.z, plane.alt);
    if (!s) return;
    const span = 11.4 * s.scale; // metres of wingspan to pixels
    if (span < 8) return;
    ctx.save();
    ctx.translate(s.sx, s.sy);
    ctx.rotate(-plane.bankVis * 0.82);
    const unit = span / 2;
    // The camera rides behind and above: the nose points away (up-screen),
    // the tail sits near the camera (down-screen), the body foreshortened.
    // Wings first, a broad red bar with a hint of dihedral.
    ctx.fillStyle = '#c8402a';
    ctx.beginPath();
    ctx.moveTo(-unit, -unit * 0.1);
    ctx.lineTo(-unit * 0.1, -unit * 0.02);
    ctx.lineTo(unit * 0.1, -unit * 0.02);
    ctx.lineTo(unit, -unit * 0.1);
    ctx.lineTo(unit * 0.92, unit * 0.04);
    ctx.lineTo(-unit * 0.92, unit * 0.04);
    ctx.closePath();
    ctx.fill();
    // Fuselage, nose to tail: a blunt rounded nose, a broad mid-body where
    // the wing joins, and a long taper to the tail.
    const bodyGrad = ctx.createLinearGradient(0, -unit * 0.55, 0, unit * 0.45);
    bodyGrad.addColorStop(0, '#efe3c8');
    bodyGrad.addColorStop(1, '#d9c9a3');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(0, -unit * 0.54);
    ctx.bezierCurveTo(unit * 0.1, -unit * 0.52, unit * 0.14, -unit * 0.28, unit * 0.15, 0);
    ctx.bezierCurveTo(unit * 0.15, unit * 0.22, unit * 0.07, unit * 0.4, 0, unit * 0.46);
    ctx.bezierCurveTo(-unit * 0.07, unit * 0.4, -unit * 0.15, unit * 0.22, -unit * 0.15, 0);
    ctx.bezierCurveTo(-unit * 0.14, -unit * 0.28, -unit * 0.1, -unit * 0.52, 0, -unit * 0.54);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,70,40,0.35)';
    ctx.lineWidth = Math.max(1, unit * 0.02);
    ctx.stroke();
    // Tailplane, near the camera.
    ctx.fillStyle = '#c8402a';
    ctx.beginPath();
    ctx.moveTo(-unit * 0.33, unit * 0.34);
    ctx.lineTo(unit * 0.33, unit * 0.34);
    ctx.lineTo(unit * 0.27, unit * 0.46);
    ctx.lineTo(-unit * 0.27, unit * 0.46);
    ctx.closePath();
    ctx.fill();
    // Fin: a blade rising from the tail toward the viewer-top.
    ctx.beginPath();
    ctx.moveTo(-unit * 0.05, unit * 0.44);
    ctx.lineTo(0, unit * 0.04);
    ctx.lineTo(unit * 0.05, unit * 0.44);
    ctx.closePath();
    ctx.fill();
    // Canopy, ahead of the wing.
    ctx.fillStyle = '#274b63';
    ctx.beginPath();
    ctx.ellipse(0, -unit * 0.17, unit * 0.07, unit * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,226,245,0.8)';
    ctx.beginPath();
    ctx.ellipse(-unit * 0.02, -unit * 0.21, unit * 0.028, unit * 0.06, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Propeller disc at the far nose, seen nearly edge-on.
    ctx.fillStyle = 'rgba(40,36,30,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, -unit * 0.56, unit * 0.17, unit * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    // Navigation lights: red left, green right, strobe on the fin.
    const strobe = (time % 1.1) < 0.07;
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(-unit * 0.96, -unit * 0.03, Math.max(1.6, unit * 0.045), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3dff7a';
    ctx.beginPath();
    ctx.arc(unit * 0.96, -unit * 0.03, Math.max(1.6, unit * 0.045), 0, Math.PI * 2);
    ctx.fill();
    if (strobe) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(0, unit * 0.03, Math.max(2, unit * 0.055), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // A soft shadow on the ground far below sells the altitude.
    if (plane.alt < 190) {
      const groundY = world.groundAt(plane.x, plane.z);
      const sh = proj.project(plane.x, plane.z, groundY + 0.5);
      if (sh) {
        const alpha = 0.3 * (1 - plane.alt / 200);
        ctx.fillStyle = `rgba(20,30,20,${alpha})`;
        ctx.beginPath();
        ctx.ellipse(sh.sx, sh.sy, span * 0.4, span * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return {
    drawClouds,
    drawRings,
    drawBillboards,
    drawVolcanoSmoke,
    drawPlaneChase,
    drawParticles,
    spawnBurst,
    ringBurst(x, z, alt, centerRatio) {
      spawnBurst(x, z, alt, centerRatio > 0.75 ? '#ffd23f' : '#7bf1a8', 26, 26);
    },
  };
};
