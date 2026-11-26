'use strict';
/* flight.js: the plane, the course and the rules of a mail leg. Owns the
 * simulation state — position, attitude, speed, fuel, the clock — and the
 * ring course strung between the two runways. It renders nothing; the view
 * modules read this state, and main.js feeds it control input. */
window.SKYPOST = window.SKYPOST || {};

SKYPOST.createFlight = function createFlight(world, seed) {
  const P = SKYPOST.config.plane;
  const C = SKYPOST.config.course;
  const home = world.runways[0];
  const dest = world.runways[1];

  const plane = {
    x: 0, z: 0, alt: 0,
    heading: 0, pitchVis: 0, bankVis: 0,
    speed: 0, throttle: 0, fuel: P.startFuel,
    airborne: false, verticalSpeed: 0, boostOn: false,
  };

  const flight = {
    plane,
    state: 'ready', // ready | flying | landed | crashed | ditched | timeout
    leg: 1,
    score: 0,
    rings: [],
    ringIndex: 0,
    ringsHit: 0,
    combo: 0,
    bestCombo: 0,
    timeLeft: C.startTimeSeconds,
    clockStarted: false,
    endReason: '',
    landingQuality: '',
    events: [],
  };

  function emit(type, data) {
    flight.events.push(Object.assign({ type }, data || {}));
  }

  function forwardOf(heading) {
    return { x: Math.sin(heading), z: -Math.cos(heading) };
  }

  /* Place the plane at the south end of a runway, facing along it. */
  function placeOnRunway(rw, atFarEnd) {
    const f = forwardOf(rw.heading);
    const along = atFarEnd ? rw.length / 2 - 60 : -rw.length / 2 + 90;
    plane.x = rw.cx + f.x * along;
    plane.z = rw.cz + f.z * along;
    plane.alt = rw.altitude + P.groundClearance;
    plane.heading = rw.heading;
    plane.speed = 0;
    plane.throttle = 0;
    plane.airborne = false;
    plane.verticalSpeed = 0;
    plane.pitchVis = 0;
    plane.bankVis = 0;
  }

  /* String a line of rings from the home strip to the far strip: a bezier
   * bowed around the volcano's west flank, with a sine weave across it so
   * the line is flown, not just followed. Altitudes are lifted above the
   * terrain wherever the ground reaches up. */
  function buildCourse(leg) {
    const rng = SKYPOST.makeRng(seed * 101 + leg * 7717);
    const count = Math.min(C.maxLegRings, C.firstLegRings + (leg - 1) * 2);
    const startF = forwardOf(home.heading);
    const start = {
      x: home.cx + startF.x * (home.length / 2 + 500),
      z: home.cz + startF.z * (home.length / 2 + 500),
    };
    const destF = forwardOf(dest.heading);
    const approach = {
      x: dest.cx - destF.x * (dest.length / 2 + 1500),
      z: dest.cz - destF.z * (dest.length / 2 + 1500),
    };
    const control = { x: 7300 + (rng() - 0.5) * 900, z: 6800 + (rng() - 0.5) * 900 };
    const weave = 620 + leg * 60;
    const phase = rng() * Math.PI * 2;
    const rings = [];
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      let x = a * start.x + b * control.x + c * approach.x;
      let z = a * start.z + b * control.z + c * approach.z;
      // Perpendicular weave across the line of travel.
      const tangent = {
        x: 2 * (1 - t) * (control.x - start.x) + 2 * t * (approach.x - control.x),
        z: 2 * (1 - t) * (control.z - start.z) + 2 * t * (approach.z - control.z),
      };
      const tl = Math.hypot(tangent.x, tangent.z) || 1;
      const off = Math.sin(t * Math.PI * 2.3 + phase) * weave * Math.sin(t * Math.PI);
      x += (-tangent.z / tl) * off;
      z += (tangent.x / tl) * off;
      let alt = 105 + Math.sin(t * Math.PI) * 150 + t * 30 + (leg - 1) * 12;
      const ground = world.heightAt(x, z);
      if (alt < ground + 55) alt = ground + 55 + rng() * 25;
      rings.push({ x, z, alt, passed: false, missed: false, prevSide: null });
    }
    // Ring headings: each ring faces the line toward the next point.
    for (let i = 0; i < rings.length; i++) {
      const next = rings[i + 1] || approach;
      rings[i].heading = Math.atan2(next.x - rings[i].x, -(next.z - rings[i].z));
    }
    flight.rings = rings;
    flight.ringIndex = 0;
    flight.ringsHit = 0;
  }

  flight.startLeg = function startLeg(leg) {
    flight.leg = leg;
    flight.state = 'ready';
    flight.timeLeft = C.startTimeSeconds;
    flight.clockStarted = false;
    flight.combo = 0;
    plane.fuel = P.startFuel;
    placeOnRunway(home, false);
    buildCourse(leg);
  };

  flight.currentTarget = function currentTarget() {
    if (flight.ringIndex < flight.rings.length) {
      const r = flight.rings[flight.ringIndex];
      return { kind: 'ring', x: r.x, z: r.z, alt: r.alt, index: flight.ringIndex };
    }
    return { kind: 'runway', x: dest.cx, z: dest.cz, alt: dest.altitude, index: -1 };
  };

  /* Bearing/distance/height guidance toward the current target, for the HUD. */
  flight.guidance = function guidance() {
    const t = flight.currentTarget();
    const dx = world.wrappedDelta(t.x, plane.x);
    const dz = world.wrappedDelta(t.z, plane.z);
    const dist = Math.hypot(dx, dz);
    const bearing = Math.atan2(dx, -dz);
    let rel = bearing - plane.heading;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    return { target: t, dist, relBearing: rel, altDiff: t.alt - plane.alt };
  };

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  flight.update = function update(dt, controls, elapsed) {
    if (flight.state === 'landed' || flight.state === 'crashed' ||
        flight.state === 'ditched' || flight.state === 'timeout') {
      plane.speed = Math.max(0, plane.speed - 22 * dt);
      return;
    }
    const stick = controls.stick();
    plane.throttle = Math.max(0, Math.min(1,
      plane.throttle + controls.throttleDelta() * dt * 0.55));
    plane.boostOn = controls.boost() && plane.fuel > 1 && plane.airborne;

    // --- speed: the engine pulls toward a throttle-set target ------------
    let target = P.minThrottleSpeed +
      plane.throttle * (P.maxThrottleSpeed - P.minThrottleSpeed);
    if (plane.boostOn) target = P.boostSpeed;
    if (plane.fuel <= 0) target = Math.min(target, 40);
    const accel = plane.airborne ? 11 : 13.5;
    plane.speed += Math.max(-accel * dt, Math.min(accel * dt, target - plane.speed));
    // Climbing trades speed, diving buys it back.
    plane.speed -= stick.pitch * (plane.airborne ? 5.5 : 0) * dt;
    plane.speed = Math.max(0, plane.speed);

    // --- attitude visuals ease toward the stick ---------------------------
    const bankTarget = stick.bank * P.maxBank;
    const pitchTarget = stick.pitch * P.maxPitch;
    plane.bankVis += (bankTarget - plane.bankVis) * Math.min(1, dt * 4.2);
    plane.pitchVis += (pitchTarget - plane.pitchVis) * Math.min(1, dt * 3.6);

    // --- heading follows bank --------------------------------------------
    const turnAuthority = Math.max(0.55, Math.min(1.25, 52 / Math.max(24, plane.speed)));
    plane.heading += Math.sin(plane.bankVis) * P.turnRate * turnAuthority * dt * 1.6;

    // --- wind on later legs: a slow breathing gust -------------------------
    if (flight.leg >= 2 && plane.airborne) {
      const gust = Math.sin(elapsed * 0.45 + flight.leg * 2.1) +
        Math.sin(elapsed * 1.13) * 0.5;
      plane.heading += gust * 0.014 * dt * 3;
      plane.alt += Math.sin(elapsed * 0.9 + 1.7) * 1.1 * dt;
    }

    const f = forwardOf(plane.heading);

    if (!plane.airborne) {
      // --- ground roll ----------------------------------------------------
      plane.x += f.x * plane.speed * dt;
      plane.z += f.z * plane.speed * dt;
      const ground = world.groundAt(plane.x, plane.z);
      plane.alt = ground + P.groundClearance;
      const onHome = world.onRunway(plane.x, plane.z, home).on;
      if (plane.speed >= P.rotateSpeed && stick.pitch > 0.25) {
        plane.airborne = true;
        flight.state = 'flying';
        flight.clockStarted = true;
        plane.verticalSpeed = 3.5;
        emit('takeoff');
      } else if (!onHome && plane.speed > 26) {
        flight.state = 'crashed';
        flight.endReason = 'Ran off the strip and broke the gear.';
        emit('crash', { kind: 'ground' });
      } else if (!onHome && plane.speed <= 26 && plane.speed > 2) {
        plane.speed = Math.max(0, plane.speed - 20 * dt); // rough grass drag
      }
      return;
    }

    // --- airborne ----------------------------------------------------------
    flight.timeLeft -= dt;
    if (flight.timeLeft <= 0) {
      flight.timeLeft = 0;
      flight.state = 'timeout';
      flight.endReason = 'Out of time — the mail flies tomorrow instead.';
      emit('timeout');
      return;
    }

    let climb = stick.pitch * P.climbRate *
      Math.max(0.35, Math.min(1.15, plane.speed / 68));
    const stalling = plane.speed < P.stallSpeed;
    if (stalling) {
      climb -= (P.stallSpeed - plane.speed) * 0.42;
      plane.pitchVis -= dt * 0.35; // the nose drops away
      emit('stall');
    }
    // A gentle ever-present sink the throttle must overcome.
    climb -= (1 - plane.throttle) * 2.6;
    plane.verticalSpeed += (climb - plane.verticalSpeed) * Math.min(1, dt * 2.6);
    plane.alt += plane.verticalSpeed * dt;
    plane.x += f.x * plane.speed * dt;
    plane.z += f.z * plane.speed * dt;
    // Wrap around the world tile.
    const size = SKYPOST.config.world.sizeMeters;
    plane.x = ((plane.x % size) + size) % size;
    plane.z = ((plane.z % size) + size) % size;

    // --- fuel ----------------------------------------------------------------
    const burn = plane.boostOn ? P.boostBurnPerSecond
      : P.fuelBurnPerSecond * (0.35 + plane.throttle);
    const hadFuel = plane.fuel > 0;
    plane.fuel = Math.max(0, plane.fuel - burn * dt);
    if (hadFuel && plane.fuel === 0) emit('fuelEmpty'); // once, on the transition

    // --- rings ---------------------------------------------------------------
    const ring = flight.rings[flight.ringIndex];
    if (ring) {
      const n = forwardOf(ring.heading);
      const relX = plane.x - ring.x;
      const relZ = plane.z - ring.z;
      const side = relX * n.x + relZ * n.z;
      if (ring.prevSide !== null && ring.prevSide < 0 && side >= 0) {
        const radial = Math.hypot(
          relX - n.x * side,
          relZ - n.z * side,
          plane.alt - ring.alt
        );
        if (radial <= C.ringRadius) {
          const centerRatio = 1 - radial / C.ringRadius;
          const gained = C.ringScore + Math.round(C.centerBonusMax * centerRatio);
          flight.score += gained;
          flight.timeLeft += C.ringTimeBonus;
          flight.combo += 1;
          flight.bestCombo = Math.max(flight.bestCombo, flight.combo);
          flight.ringsHit += 1;
          ring.passed = true;
          emit('ring', { centerRatio, gained, ringIndex: flight.ringIndex });
        } else {
          ring.missed = true;
          flight.combo = 0;
          emit('miss', { ringIndex: flight.ringIndex });
        }
        flight.ringIndex += 1;
      }
      ring.prevSide = side;
    }

    // --- ground contact -------------------------------------------------------
    const ground = world.groundAt(plane.x, plane.z);
    if (plane.alt <= ground + P.groundClearance) {
      plane.alt = ground + P.groundClearance;
      const destInfo = world.onRunway(plane.x, plane.z, dest);
      const homeInfo = world.onRunway(plane.x, plane.z, home);
      const overSea = world.heightAt(plane.x, plane.z) < 0.4;
      if (destInfo.on &&
          Math.abs(angleDiff(plane.heading, dest.heading)) < 0.42 &&
          plane.speed < 58 && plane.verticalSpeed > -6.5) {
        flight.state = 'landed';
        const gentle = Math.max(0, 1 + plane.verticalSpeed / 6.5);
        const aligned = Math.max(0, 1 - Math.abs(angleDiff(plane.heading, dest.heading)) / 0.42);
        const quality = (gentle + aligned) / 2;
        flight.landingQuality = quality > 0.8 ? 'Silky' : quality > 0.55 ? 'Firm' : 'Rough';
        const gained = Math.round(C.landingBaseScore * (0.4 + quality));
        flight.score += gained;
        emit('landed', { gained, quality });
      } else if (plane.speed < 58 && plane.verticalSpeed > -6.5 &&
          Math.hypot(world.wrappedDelta(plane.x, dest.cx), world.wrappedDelta(plane.z, dest.cz)) < 300 &&
          Math.abs(world.heightAt(plane.x, plane.z) - dest.altitude) < 7) {
        // Down on the flat airfield plateau but off the strip itself: the
        // mail still counts as delivered, at a rough-field discount. The
        // strip remains the skill shot that pays in full.
        flight.state = 'landed';
        flight.landingQuality = 'Rough field';
        const gained = Math.round(C.landingBaseScore * 0.3);
        flight.score += gained;
        emit('landed', { gained, quality: 0.3 });
      } else if (homeInfo.on && plane.speed < 58 && plane.verticalSpeed > -6.5 &&
          Math.abs(angleDiff(plane.heading, home.heading)) < 0.42) {
        // A touch-and-go back home: wheels down, roll out, go again.
        plane.airborne = false;
        flight.state = 'ready';
        emit('touchdownHome');
      } else if (overSea) {
        flight.state = 'ditched';
        flight.endReason = 'Down in the sea. The mail got wet.';
        emit('crash', { kind: 'sea' });
      } else {
        flight.state = 'crashed';
        flight.endReason = plane.verticalSpeed < -9
          ? 'Came down too hard — the airframe gave up.'
          : 'Put down off the strip, where no plane should be.';
        emit('crash', { kind: 'ground' });
      }
    }
  };

  flight.startLeg(1);
  return flight;
};
