'use strict';
/* cockpit.js: the aircraft's own furniture — windshield frame, nose cowl,
 * the lit instrument panel, and every piece of text the pilot reads: the
 * compass tape, the digital HUD (altitude, speed, heading, always on show),
 * the clock, guidance to the next ring, banners and the title/end screens.
 * In chase view only the HUD layer is drawn; the panel belongs to cockpit. */
window.SKYPOST = window.SKYPOST || {};

SKYPOST.createCockpit = function createCockpit() {
  const FONT = 'ui-monospace, Menlo, Consolas, monospace';

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---- one round instrument: face, ticks, needle, label ---------------- */
  function gauge(ctx, x, y, r, opts) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#10151c';
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.strokeStyle = '#3a4552';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(140,180,220,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // ticks
    const a0 = opts.minAngle;
    const a1 = opts.maxAngle;
    ctx.strokeStyle = '#cfe3f5';
    ctx.fillStyle = '#cfe3f5';
    for (let i = 0; i <= opts.ticks; i++) {
      const a = a0 + ((a1 - a0) * i) / opts.ticks;
      const inner = r * 0.78;
      const outer = r * 0.9;
      ctx.lineWidth = i % opts.majorEvery === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(a) * inner, y - Math.cos(a) * inner);
      ctx.lineTo(x + Math.sin(a) * outer, y - Math.cos(a) * outer);
      ctx.stroke();
      if (opts.tickLabels && i % opts.majorEvery === 0) {
        const v = opts.min + ((opts.max - opts.min) * i) / opts.ticks;
        ctx.font = `bold ${Math.round(r * 0.24)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.round(v)), x + Math.sin(a) * r * 0.6, y - Math.cos(a) * r * 0.6);
      }
    }
    // red arc near the top of the range
    if (opts.redFrom !== undefined) {
      const ra = a0 + ((a1 - a0) * (opts.redFrom - opts.min)) / (opts.max - opts.min);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.84, -Math.PI / 2 + ra, -Math.PI / 2 + a1);
      ctx.strokeStyle = '#e5484d';
      ctx.lineWidth = r * 0.09;
      ctx.stroke();
    }
    // needle
    const frac = Math.max(0, Math.min(1, (opts.value - opts.min) / (opts.max - opts.min)));
    const na = a0 + (a1 - a0) * frac;
    ctx.strokeStyle = '#ffb703';
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.beginPath();
    ctx.moveTo(x - Math.sin(na) * r * 0.18, y + Math.cos(na) * r * 0.18);
    ctx.lineTo(x + Math.sin(na) * r * 0.74, y - Math.cos(na) * r * 0.74);
    ctx.stroke();
    ctx.fillStyle = '#d7dee8';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // label
    ctx.fillStyle = '#8fb6d9';
    ctx.font = `bold ${Math.round(r * 0.21)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.label, x, y + r * 0.52);
    ctx.restore();
  }

  /* ---- the artificial horizon: the heart of the panel ------------------- */
  function artificialHorizon(ctx, x, y, r, plane) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#10151c';
    ctx.fill();
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(-plane.bankVis);
    const pitchPx = plane.pitchVis * r * 1.5;
    // sky and ground
    ctx.fillStyle = '#3d7dc2';
    ctx.fillRect(-r * 1.5, -r * 1.5 + pitchPx, r * 3, r * 1.5);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-r * 1.5, pitchPx, r * 3, r * 1.5);
    ctx.fillStyle = '#f5f2e8';
    ctx.fillRect(-r * 1.5, pitchPx - 1.5, r * 3, 3);
    // pitch ladder
    ctx.strokeStyle = 'rgba(245,242,232,0.75)';
    ctx.fillStyle = 'rgba(245,242,232,0.85)';
    ctx.lineWidth = 1.5;
    ctx.font = `bold ${Math.round(r * 0.17)}px ${FONT}`;
    ctx.textAlign = 'center';
    for (const deg of [-20, -10, 10, 20]) {
      const ly = pitchPx - (deg / 30) * r * 1.5 * 0.5 * 2;
      const half = deg % 20 === 0 ? r * 0.34 : r * 0.22;
      ctx.beginPath();
      ctx.moveTo(-half, ly);
      ctx.lineTo(half, ly);
      ctx.stroke();
      ctx.fillText(String(Math.abs(deg)), -half - r * 0.14, ly);
      ctx.fillText(String(Math.abs(deg)), half + r * 0.14, ly);
    }
    ctx.restore();
    // fixed aircraft symbol + bezel
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#ffb703';
    ctx.lineWidth = Math.max(2.5, r * 0.07);
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, 0);
    ctx.lineTo(-r * 0.18, 0);
    ctx.lineTo(-r * 0.18, r * 0.14);
    ctx.moveTo(r * 0.55, 0);
    ctx.lineTo(r * 0.18, 0);
    ctx.lineTo(r * 0.18, r * 0.14);
    ctx.stroke();
    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#3a4552';
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.stroke();
    ctx.restore();
  }

  function lamp(ctx, x, y, w, h, text, on, colour) {
    roundRect(ctx, x, y, w, h, 4);
    ctx.fillStyle = on ? colour : 'rgba(70,50,50,0.5)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = on ? '#14100c' : 'rgba(200,190,180,0.4)';
    ctx.font = `bold ${Math.round(h * 0.52)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
  }

  /* ---- compass tape across the top -------------------------------------- */
  function compassTape(ctx, w, heading) {
    const tapeW = Math.min(430, w * 0.36);
    const x0 = w / 2 - tapeW / 2;
    const y = 14;
    const hgt = 34;
    roundRect(ctx, x0, y, tapeW, hgt, 6);
    ctx.fillStyle = 'rgba(10,16,24,0.72)';
    ctx.fill();
    ctx.save();
    roundRect(ctx, x0, y, tapeW, hgt, 6);
    ctx.clip();
    const deg = (heading * 180) / Math.PI;
    const pxPerDeg = 3.4;
    ctx.fillStyle = '#dcebf8';
    ctx.strokeStyle = '#dcebf8';
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    for (let d = -60; d <= 60; d += 5) {
      const world = ((Math.round((deg + d) / 5) * 5) % 360 + 360) % 360;
      const sx = w / 2 + (world - deg + (Math.abs(world - deg) > 180 ? (world - deg > 0 ? -360 : 360) : 0)) * pxPerDeg;
      if (sx < x0 || sx > x0 + tapeW) continue;
      const major = world % 30 === 0;
      ctx.beginPath();
      ctx.moveTo(sx, y + hgt);
      ctx.lineTo(sx, y + hgt - (major ? 12 : 7));
      ctx.stroke();
      if (major) {
        const label = world === 0 ? 'N' : world === 90 ? 'E' : world === 180 ? 'S' : world === 270 ? 'W' : String(world / 10).padStart(2, '0');
        ctx.fillText(label, sx, y + 11);
      }
    }
    ctx.restore();
    // lubber line + digital heading
    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 6, y + hgt);
    ctx.lineTo(w / 2 + 6, y + hgt);
    ctx.lineTo(w / 2, y + hgt + 8);
    ctx.closePath();
    ctx.fill();
    const hdg = String(Math.round(((deg % 360) + 360) % 360)).padStart(3, '0');
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillStyle = '#ffb703';
    ctx.textAlign = 'center';
    ctx.fillText(`${hdg}°`, w / 2, y + hgt + 24);
  }

  /* ---- the always-on digital HUD ----------------------------------------- */
  function hudCluster(ctx, w, h, flight, plane) {
    const kt = plane.speed * 1.944;
    const ft = Math.max(0, Math.round((plane.alt - SKYPOST.config.world.seaLevel) * 3.281));
    const lines = [
      `ALT ${String(ft).padStart(4, ' ')} FT`,
      `SPD ${String(Math.round(kt)).padStart(3, ' ')} KT`,
      `VSI ${plane.verticalSpeed >= 0 ? '+' : ''}${Math.round(plane.verticalSpeed * 196.85)} FPM`,
    ];
    ctx.font = `bold 16px ${FONT}`;
    const bw = 196;
    const bh = lines.length * 21 + 14;
    roundRect(ctx, 14, 14, bw, bh, 6);
    ctx.fillStyle = 'rgba(8,20,14,0.66)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(110,255,170,0.35)';
    ctx.stroke();
    ctx.fillStyle = '#7dffb0';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, 24, 22 + i * 21));

    // score block, top right
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(8,14,22,0.66)';
    roundRect(ctx, w - 214, 14, 200, 62, 6);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.font = `bold 21px ${FONT}`;
    ctx.fillText(String(flight.score).padStart(6, '0'), w - 26, 20);
    ctx.font = `bold 12.5px ${FONT}`;
    ctx.fillStyle = '#bcd6ee';
    ctx.fillText(`RINGS ${flight.ringsHit}/${flight.rings.length}   LEG ${flight.leg}`, w - 26, 48);
    if (flight.combo >= 2) {
      ctx.fillStyle = '#7bf1a8';
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText(`COMBO x${flight.combo}`, w - 26, 84);
    }

    // the clock: a draining bar under the compass
    if (flight.clockStarted && flight.state === 'flying') {
      const total = SKYPOST.config.course.startTimeSeconds;
      const frac = Math.max(0, flight.timeLeft / total);
      const bwTime = Math.min(430, w * 0.36);
      roundRect(ctx, w / 2 - bwTime / 2, 102, bwTime, 10, 5);
      ctx.fillStyle = 'rgba(10,16,24,0.6)';
      ctx.fill();
      roundRect(ctx, w / 2 - bwTime / 2, 102, bwTime * frac, 10, 5);
      ctx.fillStyle = flight.timeLeft < 20 ? '#e5484d' : '#4cc38a';
      ctx.fill();
      ctx.fillStyle = '#eaf4fc';
      ctx.font = `bold 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.ceil(flight.timeLeft)}s`, w / 2, 118);
    }
  }

  /* ---- guidance chevron toward the current target ------------------------- */
  function guidance(ctx, w, h, flight) {
    if (flight.state !== 'flying' && flight.state !== 'ready') return;
    const g = flight.guidance();
    const cx = w / 2;
    const cy = 138;
    const clamped = Math.max(-1.1, Math.min(1.1, g.relBearing));
    const ax = cx + clamped * w * 0.3;
    ctx.save();
    ctx.translate(ax, cy);
    ctx.rotate(clamped * 0.9);
    ctx.fillStyle = g.target.kind === 'ring' ? '#ffb703' : '#4cc38a';
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 7);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-8, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.font = `bold 14.5px ${FONT}`;
    ctx.textAlign = 'center';
    const distTxt = g.dist >= 1000 ? `${(g.dist / 1000).toFixed(1)} km` : `${Math.round(g.dist)} m`;
    const altTxt = g.altDiff > 12 ? `CLIMB ${Math.round(g.altDiff)} m`
      : g.altDiff < -12 ? `DESCEND ${Math.round(-g.altDiff)} m` : 'LEVEL';
    ctx.fillStyle = 'rgba(10,16,24,0.55)';
    const label = g.target.kind === 'ring'
      ? `RING ${g.target.index + 1} · ${distTxt} · ${altTxt}`
      : `FARSHORE STRIP · ${distTxt} · LAND TO DELIVER`;
    const tw = ctx.measureText(label).width + 22;
    roundRect(ctx, cx - tw / 2, cy + 14, tw, 24, 5);
    ctx.fill();
    ctx.fillStyle = '#eaf4fc';
    ctx.fillText(label, cx, cy + 19);
  }

  /* ---- the cockpit itself -------------------------------------------------- */
  function drawCockpit(ctx, w, h, flight, plane, time, stalling) {
    // windshield posts and header
    ctx.fillStyle = '#232a33';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w * 0.115, 0);
    ctx.lineTo(w * 0.032, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w, 0);
    ctx.lineTo(w * 0.885, 0);
    ctx.lineTo(w * 0.968, h);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(0, 0, w, h * 0.028);
    // centre post hint
    ctx.fillRect(w / 2 - 3, 0, 6, h * 0.1);

    // nose cowl: a low blue-grey hump with a red cheatline, and the prop
    // disc a translucent ellipse standing just in front of it.
    const cowlY = h * 0.79;
    ctx.fillStyle = '#31404f';
    ctx.beginPath();
    ctx.ellipse(w / 2, cowlY + h * 0.055, w * 0.155, h * 0.062, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8402a';
    ctx.beginPath();
    ctx.ellipse(w / 2, cowlY + h * 0.055, w * 0.155, h * 0.062, 0, Math.PI * 1.18, Math.PI * 1.82);
    ctx.lineTo(w / 2, cowlY + h * 0.055);
    ctx.closePath();
    ctx.fill();
    const propSpeed = plane.speed * 0.9 + plane.throttle * 6;
    ctx.save();
    ctx.translate(w / 2, cowlY - h * 0.012);
    ctx.fillStyle = 'rgba(35,32,28,0.16)';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.148, h * 0.052, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,28,26,0.4)';
    ctx.lineWidth = Math.max(2, h * 0.005);
    for (let b = 0; b < 2; b++) {
      const a = time * propSpeed + (b * Math.PI) / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * w * 0.148, Math.sin(a) * h * 0.052);
      ctx.stroke();
    }
    ctx.restore();

    // dashboard panel
    const panelY = h * 0.79;
    const grad = ctx.createLinearGradient(0, panelY, 0, h);
    grad.addColorStop(0, '#2b333e');
    grad.addColorStop(0.12, '#1b212a');
    grad.addColorStop(1, '#12161d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, panelY, w, h - panelY);
    ctx.fillStyle = 'rgba(150,190,230,0.16)';
    ctx.fillRect(0, panelY, w, 2);

    const cy = panelY + (h - panelY) * 0.54;
    const R = Math.min(h * 0.088, 66);
    artificialHorizon(ctx, w * 0.5, cy, R * 1.08, plane);
    gauge(ctx, w * 0.335, cy, R, {
      label: 'AIRSPEED KT', min: 0, max: 140, ticks: 14, majorEvery: 2,
      value: plane.speed * 1.944, minAngle: -2.35, maxAngle: 2.35, tickLabels: true, redFrom: 118,
    });
    gauge(ctx, w * 0.665, cy, R, {
      label: 'ALTIMETER FT', min: 0, max: 2000, ticks: 10, majorEvery: 5,
      value: Math.max(0, plane.alt * 3.281), minAngle: -2.35, maxAngle: 2.35, tickLabels: true,
    });
    gauge(ctx, w * 0.185, cy, R * 0.78, {
      label: 'FUEL %', min: 0, max: 100, ticks: 10, majorEvery: 5,
      value: plane.fuel, minAngle: -2.2, maxAngle: 2.2,
    });
    gauge(ctx, w * 0.815, cy, R * 0.78, {
      label: 'VSI FPM', min: -2000, max: 2000, ticks: 8, majorEvery: 2,
      value: plane.verticalSpeed * 196.85, minAngle: -2.2, maxAngle: 2.2,
    });

    // lamps + radio flavour on the right of the panel
    const lampW = 86;
    const lampH = 21;
    const lx = w * 0.9;
    lamp(ctx, lx, panelY + 16, lampW, lampH, 'STALL', stalling, '#e5484d');
    lamp(ctx, lx, panelY + 16 + (lampH + 7), lampW, lampH, 'LOW TIME',
      flight.state === 'flying' && flight.timeLeft < 20, '#ffb703');
    lamp(ctx, lx, panelY + 16 + (lampH + 7) * 2, lampW, lampH, 'GEAR DN',
      !plane.airborne, '#4cc38a');
    ctx.fillStyle = '#0d2417';
    roundRect(ctx, w * 0.028, panelY + 16, 168, 40, 4);
    ctx.fill();
    ctx.fillStyle = '#51ff8e';
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('SKYPOST 122.80', w * 0.028 + 10, panelY + 27);
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = 'rgba(81,255,142,0.6)';
    ctx.fillText(plane.airborne ? 'EN ROUTE · FARSHORE' : 'SKYPOST FIELD · GND', w * 0.028 + 10, panelY + 44);
  }

  /* ---- banners and full screens -------------------------------------------- */
  function banner(ctx, w, h, text, sub, alpha) {
    if (alpha <= 0 || !text) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.font = `bold ${Math.round(h * 0.052)}px ${FONT}`;
    const tw = ctx.measureText(text).width + 70;
    const bx = w / 2 - tw / 2;
    const by = h * 0.3;
    roundRect(ctx, bx, by, tw, h * 0.105, 10);
    ctx.fillStyle = 'rgba(10,16,24,0.78)';
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, by + h * 0.036);
    if (sub) {
      ctx.font = `bold ${Math.round(h * 0.021)}px ${FONT}`;
      ctx.fillStyle = '#dcebf8';
      ctx.fillText(sub, w / 2, by + h * 0.078);
    }
    ctx.restore();
  }

  function panelScreen(ctx, w, h, title, titleColour, lines, prompt) {
    ctx.fillStyle = 'rgba(6,10,16,0.62)';
    ctx.fillRect(0, 0, w, h);
    const pw = Math.min(620, w * 0.86);
    const ph = 118 + lines.length * 27 + 64;
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    roundRect(ctx, px, py, pw, ph, 14);
    ctx.fillStyle = 'rgba(13,20,30,0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,63,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = titleColour;
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillText(title, w / 2, py + 34);
    ctx.font = `16.5px ${FONT}`;
    ctx.fillStyle = '#dcebf8';
    lines.forEach((line, i) => ctx.fillText(line, w / 2, py + 92 + i * 27));
    ctx.fillStyle = '#ffd23f';
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillText(prompt, w / 2, py + ph - 30);
  }

  return {
    drawCockpit,
    compassTape,
    hudCluster,
    guidance,
    banner,
    panelScreen,
    roundRect,
    FONT,
  };
};
