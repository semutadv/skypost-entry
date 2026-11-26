'use strict';
/* terrain-view.js: draws the sky and the land. The land is rendered with the
 * classic voxel-space march — for each screen column a ray walks outward
 * over the heightfield, painting vertical strips front-to-back behind a
 * per-column horizon buffer. It is the technique that made early nineties
 * flight sims feel three-dimensional, and it suits an archipelago: sea,
 * beaches, rice terraces and a volcano all fall out of the one heightfield.
 * Also owns the camera projection every other view module shares. */
window.SKYPOST = window.SKYPOST || {};

SKYPOST.FOV = 1.02; // radians, horizontal-ish field of view

/* Build the projection for one frame: converts world points to screen
 * points for a camera at cam {x, z, alt, heading, pitchVis, bankVis}. */
SKYPOST.makeProjection = function makeProjection(width, height, cam, world) {
  const focal = (width / 2) / Math.tan(SKYPOST.FOV / 2);
  const horizon = height * 0.46 + cam.pitchVis * height * 0.52;
  const shear = Math.tan(-cam.bankVis) * 0.5;
  const fwdX = Math.sin(cam.heading);
  const fwdZ = -Math.cos(cam.heading);
  const rightX = Math.cos(cam.heading);
  const rightZ = Math.sin(cam.heading);

  function project(x, z, alt) {
    const dx = world.wrappedDelta(x, cam.x);
    const dz = world.wrappedDelta(z, cam.z);
    const f = dx * fwdX + dz * fwdZ;
    if (f < 2.5) return null;
    const r = dx * rightX + dz * rightZ;
    const sx = width / 2 + (r * focal) / f;
    const sy = horizon + (sx - width / 2) * shear - ((alt - cam.alt) * focal) / f;
    return { sx, sy, scale: focal / f, dist: f, right: r };
  }

  return { focal, horizon, shear, fwdX, fwdZ, rightX, rightZ, project, width, height };
};

SKYPOST.createTerrainView = function createTerrainView(world) {
  const cfg = SKYPOST.config.world;
  const pal = SKYPOST.config.palette;

  function unpack(rgb) {
    return [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];
  }
  const horizonFog = unpack(parseInt(pal.skyHorizon.slice(1), 16));

  function drawSky(ctx, w, h, proj, cam, time) {
    const grad = ctx.createLinearGradient(0, 0, 0, h * 0.75);
    grad.addColorStop(0, pal.skyTop);
    grad.addColorStop(0.65, '#7fb2dd');
    grad.addColorStop(1, pal.skyHorizon);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // The sun rides at a fixed compass point; steer by it and it moves
    // across the windshield the way a real one does.
    const sunHeading = 2.35;
    let rel = sunHeading - cam.heading;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    if (Math.abs(rel) < 1.25) {
      const sx = w / 2 + Math.tan(rel) * proj.focal;
      const sy = proj.horizon - Math.tan(0.31) * proj.focal + (sx - w / 2) * proj.shear;
      const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 190);
      glow.addColorStop(0, 'rgba(255,243,196,0.95)');
      glow.addColorStop(0.18, 'rgba(255,240,190,0.55)');
      glow.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 200, sy - 200, 400, 400);
      ctx.fillStyle = pal.sunGlow;
      ctx.beginPath();
      ctx.arc(sx, sy, 21, 0, Math.PI * 2);
      ctx.fill();
    }

    void time; // the sky itself is still; the world clouds do the moving
  }

  /* The voxel march itself. yBuffer per column hides far strips behind
   * near ones, which is what makes valleys and ridge lines read. */
  function drawTerrain(ctx, w, h, proj, cam) {
    const step = cfg.columnStepPx;
    const maxDist = cfg.viewDistance;
    const camAlt = cam.alt;
    for (let sx = 0; sx < w; sx += step) {
      const ratio = (sx + step / 2 - w / 2) / proj.focal;
      const rayX = proj.fwdX + proj.rightX * ratio;
      const rayZ = proj.fwdZ + proj.rightZ * ratio;
      const colHorizon = proj.horizon + (sx + step / 2 - w / 2) * proj.shear;
      let yBuffer = h + 2;
      let d = 9;
      while (d < maxDist) {
        const wx = cam.x + rayX * d;
        const wz = cam.z + rayZ * d;
        const groundH = world.heightAt(wx, wz);
        const surfaceH = groundH < 0 ? 0 : groundH;
        const sy = colHorizon - ((surfaceH - camAlt) * proj.focal) / d;
        if (sy < yBuffer) {
          let r;
          let g;
          let b;
          if (groundH < 0) {
            // Water is coloured from depth directly, smooth — sampling the
            // jittered colour map here would ring like a fingerprint.
            const depth = Math.min(1, -groundH / 26);
            const shallow = [43, 147, 168];
            const deep = [18, 84, 112];
            const t = Math.pow(depth, 0.55);
            const shimmer = 1 + 0.02 * Math.sin(wx * 0.13 + wz * 0.09);
            r = (shallow[0] + (deep[0] - shallow[0]) * t) * shimmer;
            g = (shallow[1] + (deep[1] - shallow[1]) * t) * shimmer;
            b = (shallow[2] + (deep[2] - shallow[2]) * t) * shimmer;
          } else {
            const packed = world.colorAt(wx, wz);
            r = (packed >> 16) & 255;
            g = (packed >> 8) & 255;
            b = packed & 255;
          }
          // Aerial perspective: distance dissolves into the horizon haze.
          const fog = Math.pow(Math.min(1, d / maxDist), 1.4) * 0.78;
          r += (horizonFog[0] - r) * fog;
          g += (horizonFog[1] - g) * fog;
          b += (horizonFog[2] - b) * fog;
          ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
          const stripTop = Math.max(-40, sy);
          // Paint a hair past the buffer line so no seam can open between
          // neighbouring march steps.
          ctx.fillRect(sx, stripTop, step, yBuffer - stripTop + 3);
          yBuffer = sy;
          if (yBuffer < -40) break;
        }
        d += Math.max(7, d * 0.055);
      }
      // Anything the march never reached (looking up at the sky) is left
      // as sky; anything below the last strip is the nearest ground.
      if (yBuffer > -40 && yBuffer < h) {
        // The column bottom was already painted by the nearest strip.
      }
    }
  }

  return { drawSky, drawTerrain };
};
