'use strict';
/* audio.js: every sound in SKYPOST is synthesised with WebAudio — a puttering
 * engine whose pitch follows the throttle, a chime for a threaded ring, a
 * warning beeper, and small jingles for takeoff, landing and disaster. No
 * audio files, so the game stays fully offline. Sound starts only after the
 * first key or click, as browsers require. */
window.SKYPOST = window.SKYPOST || {};

SKYPOST.createAudio = function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let muted = false;
  let beepClock = 0;

  function ensureStarted() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    // The engine: two detuned oscillators through a low-pass, gain tied to
    // throttle by setEngine() each frame.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 28;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(g2);
    g2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();
    return true;
  }

  function setEngine(throttle, speedRatio, running) {
    if (!ctx || !engineOsc) return;
    const t = ctx.currentTime;
    const target = running ? 0.05 + throttle * 0.075 : 0;
    engineGain.gain.setTargetAtTime(target, t, 0.12);
    engineOsc.frequency.setTargetAtTime(48 + throttle * 66 + speedRatio * 22, t, 0.1);
    engineFilter.frequency.setTargetAtTime(240 + throttle * 620, t, 0.1);
  }

  function tone(freq, dur, type, vol, when, glideTo) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (when || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, freq) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq || 500;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  return {
    ensureStarted,
    setEngine,
    setMuted(value) {
      muted = value;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.03);
    },
    isMuted() {
      return muted;
    },
    /* Two-note chime, brighter when the pass was dead center. */
    ringChime(centerRatio) {
      const base = 660 + centerRatio * 220;
      tone(base, 0.16, 'sine', 0.22, 0);
      tone(base * 1.335, 0.22, 'sine', 0.2, 0.07);
      if (centerRatio > 0.8) tone(base * 2, 0.3, 'sine', 0.16, 0.14);
    },
    missedRing() {
      tone(220, 0.18, 'triangle', 0.14, 0, 160);
    },
    /* Stall / low-time warning: at most two beeps a second. */
    warningBeep(now) {
      if (now - beepClock < 0.5) return;
      beepClock = now;
      tone(880, 0.09, 'square', 0.07, 0);
    },
    touchdown() {
      noiseBurst(0.18, 0.25, 300);
      tone(196, 0.25, 'triangle', 0.18, 0.02);
      tone(294, 0.4, 'triangle', 0.16, 0.16);
      tone(392, 0.55, 'sine', 0.16, 0.3);
    },
    crash() {
      noiseBurst(0.7, 0.5, 220);
      tone(90, 0.7, 'sawtooth', 0.2, 0, 38);
    },
    splash() {
      noiseBurst(0.9, 0.4, 900);
      tone(300, 0.8, 'sine', 0.12, 0, 70);
    },
    click() {
      tone(1200, 0.05, 'sine', 0.1, 0);
    },
  };
};
