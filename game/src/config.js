'use strict';
/* SKYPOST — Archipelago Air Mail.
 * config.js: every tuning constant for the game lives here, grouped by the
 * system that reads it, so the rest of the code stays free of magic numbers. */
window.SKYPOST = window.SKYPOST || {};

SKYPOST.config = {
  // World: one square tile of ocean and islands, wrapped at the edges so a
  // flight can never reach the end of the world.
  world: {
    sizeMeters: 16000,          // the tile is 16 km x 16 km
    heightRes: 512,             // heightfield resolution (cells per side)
    seaLevel: 0,                // metres; terrain below this is under water
    maxTerrain: 430,            // the volcano peak, metres
    viewDistance: 5200,         // fog and terrain raycast far plane, metres
    columnStepPx: 2,            // terrain is drawn in vertical strips this wide
  },

  // The little mail plane. Speeds in metres/second, angles in radians.
  plane: {
    minThrottleSpeed: 34,       // full idle still keeps the prop turning
    maxThrottleSpeed: 96,       // full throttle, level flight
    boostSpeed: 118,            // with the boost key held (drinks fuel)
    stallSpeed: 30,             // below this the nose drops and the lamp lights
    rotateSpeed: 41,            // takeoff: enough speed to lift off the runway
    climbRate: 13,              // metres/second at a full pitch-up command
    sinkRate: 11,               // metres/second at a full pitch-down command
    turnRate: 0.62,             // radians/second of heading at full bank
    maxBank: 0.92,              // radians of wing bank at full deflection
    maxPitch: 0.42,             // radians of nose pitch at full deflection
    groundClearance: 2.2,       // the fuselage rides this far above the dirt
    startFuel: 100,             // percent
    fuelBurnPerSecond: 0.55,    // at cruise throttle
    boostBurnPerSecond: 2.4,
  },

  // A leg of the mail run: take off, thread the rings, land at the far strip.
  course: {
    startTimeSeconds: 150,
    ringTimeBonus: 8,           // seconds added per ring threaded
    ringScore: 100,             // base points per ring
    centerBonusMax: 200,        // extra points for a dead-center pass
    landingBaseScore: 500,
    firstLegRings: 8,
    maxLegRings: 14,
    ringRadius: 26,             // metres; generous, the fun is in the line
    ringTube: 3.2,              // visual thickness of the ring torus
  },

  // Colours of the world, picked once so every renderer agrees.
  palette: {
    skyTop: '#2e6db4',
    skyHorizon: '#cfe8f7',
    sunGlow: '#fff3c4',
    deepSea: '#155e7a',
    shallowSea: '#2b93a8',
    sand: '#e6d29a',
    grass: '#69a84f',
    riceField: '#8fbf5a',
    riceWater: '#7fb069',
    forest: '#3d7a37',
    rock: '#8a7f72',
    ash: '#6e6259',
    snow: '#f4f7f5',
    runway: '#4b4f52',
    runwayMark: '#f5f2e8',
  },
};
