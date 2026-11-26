'use strict';
/* main.js: boots SKYPOST, owns the screen state machine (title, play,
 * paused, leg over), feeds input to the flight model, picks the camera,
 * orders the render layers each frame, and turns flight events into sound,
 * banners and particles. It also implements the deterministic ?shot= states
 * the screenshots are taken from — same code path as play, frozen in time. */
window.SKYPOST = window.SKYPOST || {};

(function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(window.location.search);
  const seed = parseInt(params.get('seed') || '20261126', 10) || 20261126;
  const shot = params.get('shot');

  const world = SKYPOST.buildWorld(seed);
  const flight = SKYPOST.createFlight(world, seed);
  const terrainView = SKYPOST.createTerrainView(world);
  const objectsView = SKYPOST.createObjectsView(world, seed);
  const cockpit = SKYPOST.createCockpit();
  const input = SKYPOST.createInput(canvas);
  const audio = SKYPOST.createAudio();
  SKYPOST.audioRef = audio;

  let screen = shot ? 'play' : 'title'; // title | play | paused | over
  let cameraMode = 'cockpit'; // cockpit | chase
  let elapsed = 0;
  let scoreAtLegStart = 0;
  let bannerState = { text: '', sub: '', until: 0 };
  let fuelWarned = false;
  let lastFrame = performance.now();

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function showBanner(text, sub, seconds) {
    bannerState = { text, sub, until: elapsed + (seconds || 2.2) };
  }

  /* Position the plane for a screenshot state: a real game state, set up
   * through the same objects play uses, then held while the frame renders. */
  function setupShot(name) {
    const plane = flight.plane;
    if (name === 'takeoff') {
      const rw = world.runways[0];
      const f = { x: Math.sin(rw.heading), z: -Math.cos(rw.heading) };
      plane.x = rw.cx + f.x * 60;
      plane.z = rw.cz + f.z * 60;
      plane.alt = rw.altitude + SKYPOST.config.plane.groundClearance;
      plane.heading = rw.heading;
      plane.speed = 34;
      plane.throttle = 1;
      flight.state = 'ready';
      cameraMode = 'cockpit';
    } else if (name === 'approach') {
      const rw = world.runways[1];
      const f = { x: Math.sin(rw.heading), z: -Math.cos(rw.heading) };
      plane.x = rw.cx - f.x * 1350;
      plane.z = rw.cz - f.z * 1350;
      plane.alt = rw.altitude + 120;
      plane.heading = rw.heading;
      plane.speed = 55;
      plane.throttle = 0.45;
      plane.airborne = true;
      flight.state = 'flying';
      flight.clockStarted = true;
      flight.timeLeft = 64;
      flight.ringIndex = flight.rings.length;
      for (const r of flight.rings) r.passed = true;
      flight.ringsHit = flight.rings.length;
      flight.score = 1450;
      cameraMode = 'cockpit';
    } else {
      // 'chase' and 'cockpit': mid-course, lining up the second ring.
      const ring = flight.rings[1] || flight.rings[0];
      const back = { x: Math.sin(ring.heading), z: -Math.cos(ring.heading) };
      plane.x = ring.x - back.x * 620;
      plane.z = ring.z - back.z * 620;
      plane.alt = ring.alt + 6;
      plane.heading = ring.heading + 0.1;
      plane.bankVis = 0.24;
      plane.speed = 79;
      plane.throttle = 0.82;
      plane.airborne = true;
      flight.state = 'flying';
      flight.clockStarted = true;
      flight.timeLeft = 118;
      flight.ringIndex = 1;
      flight.rings[0].passed = true;
      flight.ringsHit = 1;
      flight.score = 240;
      cameraMode = name === 'chase' ? 'chase' : 'cockpit';
    }
  }
  if (shot) setupShot(shot);

  function cameraFor(plane) {
    if (cameraMode === 'chase') {
      const bx = Math.sin(plane.heading);
      const bz = -Math.cos(plane.heading);
      return {
        x: plane.x - bx * 30,
        z: plane.z - bz * 30,
        alt: plane.alt + 5.2,
        heading: plane.heading,
        pitchVis: -0.05 + plane.pitchVis * 0.3,
        bankVis: plane.bankVis * 0.45,
      };
    }
    return {
      x: plane.x,
      z: plane.z,
      alt: plane.alt + 1.7,
      heading: plane.heading,
      pitchVis: plane.pitchVis * 0.85,
      bankVis: plane.bankVis,
    };
  }

  function handleFlightEvents() {
    for (const ev of flight.events.splice(0)) {
      if (ev.type === 'takeoff') {
        showBanner('AIRBORNE!', 'Thread the gold rings — deliver at Farshore Strip', 2.6);
        audio.click();
      } else if (ev.type === 'ring') {
        const ring = flight.rings[ev.ringIndex];
        objectsView.ringBurst(ring.x, ring.z, ring.alt, ev.centerRatio);
        audio.ringChime(ev.centerRatio);
        showBanner(`RING +${ev.gained}`,
          ev.centerRatio > 0.75 ? 'Dead center!' : ev.centerRatio > 0.4 ? 'Clean pass' : 'Scraped through', 1.5);
        if (flight.ringIndex >= flight.rings.length) {
          setTimeout(() => showBanner('ALL RINGS DONE', 'Line up on Farshore Strip and land', 2.6), 1200);
        }
      } else if (ev.type === 'miss') {
        audio.missedRing();
        showBanner('RING MISSED', 'The combo is gone — press on', 1.4);
      } else if (ev.type === 'landed') {
        audio.touchdown();
        screen = 'over';
      } else if (ev.type === 'crash') {
        if (ev.kind === 'sea') audio.splash();
        else audio.crash();
        screen = 'over';
      } else if (ev.type === 'timeout') {
        screen = 'over';
      } else if (ev.type === 'fuelEmpty') {
        if (!fuelWarned) {
          fuelWarned = true;
          showBanner('TANK DRY', 'Glide for the nearest strip', 2.6);
        }
      } else if (ev.type === 'touchdownHome') {
        showBanner('TOUCH AND GO', 'Back at Skypost Field — throttle up and try the run again', 2.4);
      }
    }
  }

  function render(dt) {
    const w = canvas.width;
    const h = canvas.height;
    const plane = flight.plane;
    const cam = cameraFor(plane);
    const proj = SKYPOST.makeProjection(w, h, cam, world);
    proj.camX = cam.x;
    proj.camZ = cam.z;

    terrainView.drawSky(ctx, w, h, proj, cam, elapsed);
    terrainView.drawTerrain(ctx, w, h, proj, cam);
    objectsView.drawClouds(ctx, proj, cam);
    objectsView.drawBillboards(ctx, proj, cam);
    objectsView.drawVolcanoSmoke(ctx, proj, elapsed);
    objectsView.drawRings(ctx, proj, flight, elapsed);
    if (cameraMode === 'chase' && screen !== 'title') {
      objectsView.drawPlaneChase(ctx, proj, plane, elapsed);
    }
    objectsView.drawParticles(ctx, proj, shot ? 0 : dt);

    const stalling = plane.airborne && plane.speed < SKYPOST.config.plane.stallSpeed &&
      flight.state === 'flying';
    if (cameraMode === 'cockpit' && screen !== 'title') {
      cockpit.drawCockpit(ctx, w, h, flight, plane, elapsed, stalling);
    }
    cockpit.hudCluster(ctx, w, h, flight, plane);
    cockpit.compassTape(ctx, w, plane.heading);
    cockpit.guidance(ctx, w, h, flight);

    if (stalling && (screen === 'play')) audio.warningBeep(elapsed);
    if (flight.state === 'flying' && flight.timeLeft < 12 && flight.timeLeft > 0) {
      audio.warningBeep(elapsed);
    }

    // centre banner
    const alpha = Math.max(0, Math.min(1, (bannerState.until - elapsed) / 0.4));
    if (bannerState.text && elapsed < bannerState.until) {
      cockpit.banner(ctx, w, h, bannerState.text, bannerState.sub, alpha);
    }

    if (screen === 'title') {
      cockpit.panelScreen(ctx, w, h, 'SKYPOST', '#ffd23f', [
        'Archipelago Air Mail — the morning run',
        '',
        'Take off from Skypost Field, thread every gold ring,',
        'and put the mail down at Farshore Strip before the clock dies.',
        '',
        'ARROWS or MOUSE steer · W/S throttle · SHIFT boost',
        'C camera · P pause · M sound · R restart',
      ], 'PRESS ENTER TO FLY');
    } else if (screen === 'paused') {
      cockpit.panelScreen(ctx, w, h, 'PAUSED', '#dcebf8', [
        'The prop ticks over. The mail waits.',
      ], 'PRESS P TO RESUME');
    } else if (screen === 'over') {
      const landed = flight.state === 'landed';
      const title = landed ? 'MAIL DELIVERED' : flight.state === 'timeout' ? 'OUT OF TIME'
        : flight.state === 'ditched' ? 'DITCHED' : 'CRASHED';
      const colour = landed ? '#4cc38a' : '#e5484d';
      const lines = [];
      if (landed) lines.push(`A ${flight.landingQuality.toLowerCase()} landing at Farshore Strip. The island cheers.`);
      else if (flight.endReason) lines.push(flight.endReason);
      lines.push('');
      lines.push(`Rings threaded: ${flight.ringsHit} of ${flight.rings.length}   ·   Best combo: x${Math.max(1, flight.bestCombo)}`);
      lines.push(`SCORE  ${flight.score}`);
      cockpit.panelScreen(ctx, w, h, title, colour, lines,
        landed ? 'ENTER — NEXT LEG   ·   R — FLY THIS LEG AGAIN' : 'R — TRY THE LEG AGAIN');
    } else if (flight.state === 'ready' && !shot) {
      cockpit.banner(ctx, w, h, 'THROTTLE UP — W KEY',
        'Reach 80 KT, pull back (↑) and climb away', 1);
    }
  }

  function step(now) {
    requestAnimationFrame(step);
    let dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (shot) dt = 0; // frozen states for screenshots
    elapsed += dt;

    // global keys
    if (input.takePulse('KeyM')) {
      audio.ensureStarted();
      audio.setMuted(!audio.isMuted());
    }
    if (input.takePulse('KeyC') && !shot) {
      cameraMode = cameraMode === 'cockpit' ? 'chase' : 'cockpit';
      audio.click();
    }
    if (input.takePulse('KeyP') && (screen === 'play' || screen === 'paused')) {
      screen = screen === 'play' ? 'paused' : 'play';
    }
    if (screen === 'title' && (input.takePulse('Enter') || input.takePulse('MouseDown'))) {
      audio.ensureStarted();
      screen = 'play';
    } else if (screen === 'over') {
      if (flight.state === 'landed' && input.takePulse('Enter')) {
        scoreAtLegStart = flight.score;
        flight.startLeg(flight.leg + 1);
        fuelWarned = false;
        screen = 'play';
      } else if (input.takePulse('KeyR') || (flight.state !== 'landed' && input.takePulse('Enter'))) {
        flight.score = scoreAtLegStart;
        flight.startLeg(flight.leg);
        fuelWarned = false;
        screen = 'play';
      }
    }
    if (screen === 'play' && input.takePulse('KeyR') && !shot) {
      flight.score = scoreAtLegStart;
      flight.startLeg(flight.leg);
      fuelWarned = false;
    }
    if (input.key('Enter') || input.key('MouseDown')) audio.ensureStarted();

    if (screen === 'play' && !shot) {
      flight.update(dt, input, elapsed);
      handleFlightEvents();
    }
    audio.setEngine(flight.plane.throttle, flight.plane.speed / 118,
      screen === 'play' || screen === 'over');
    render(dt);
    if (shot && !window.__SHOT_READY) {
      window.__SHOT_READY = true;
    }
  }
  requestAnimationFrame(step);
})();
