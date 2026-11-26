'use strict';
/* input.js: gathers keyboard and mouse into one controls object the flight
 * model reads each frame. The mouse steers by offset from the screen centre
 * (like a stick); the arrow keys steer directly; both blend, keys winning
 * while held. Nothing here knows about the plane — it only reports intent. */
window.SKYPOST = window.SKYPOST || {};

SKYPOST.createInput = function createInput(canvas) {
  const keys = Object.create(null);
  const mouse = { x: 0.5, y: 0.5, active: false, down: false };
  const pressed = Object.create(null); // one-frame pulses (start, pause...)

  function pulse(code) {
    pressed[code] = true;
  }

  window.addEventListener('keydown', (ev) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(ev.code)) {
      ev.preventDefault();
    }
    if (!keys[ev.code]) pulse(ev.code);
    keys[ev.code] = true;
  });
  window.addEventListener('keyup', (ev) => {
    keys[ev.code] = false;
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    mouse.down = false;
  });

  function trackMouse(ev) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (ev.clientX - rect.left) / Math.max(1, rect.width);
    mouse.y = (ev.clientY - rect.top) / Math.max(1, rect.height);
    mouse.active = true;
  }
  canvas.addEventListener('mousemove', trackMouse);
  canvas.addEventListener('mousedown', (ev) => {
    trackMouse(ev);
    mouse.down = true;
    pulse('MouseDown');
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });
  canvas.addEventListener('touchstart', (ev) => {
    if (ev.touches.length) trackMouse(ev.touches[0]);
    mouse.down = true;
    pulse('MouseDown');
    ev.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (ev) => {
    if (ev.touches.length) trackMouse(ev.touches[0]);
    ev.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', () => {
    mouse.down = false;
  });

  /* Read-and-clear a one-frame pulse, e.g. takePulse('Enter'). */
  function takePulse(code) {
    const was = !!pressed[code];
    pressed[code] = false;
    return was;
  }

  /* The stick: pitch -1 (dive) .. +1 (climb), bank -1 (left) .. +1 (right). */
  function stick() {
    let pitch = 0;
    let bank = 0;
    if (keys.ArrowUp) pitch += 1;
    if (keys.ArrowDown) pitch -= 1;
    if (keys.ArrowLeft) bank -= 1;
    if (keys.ArrowRight) bank += 1;
    if (pitch === 0 && bank === 0 && mouse.active) {
      const dead = 0.06;
      const mx = (mouse.x - 0.5) * 2;
      const my = (0.5 - mouse.y) * 2;
      if (Math.abs(mx) > dead) bank = mx;
      if (Math.abs(my) > dead) pitch = my;
    }
    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      bank: Math.max(-1, Math.min(1, bank)),
    };
  }

  return {
    stick,
    takePulse,
    throttleDelta() {
      let d = 0;
      if (keys.KeyW) d += 1;
      if (keys.KeyS) d -= 1;
      return d;
    },
    boost() {
      return !!(keys.ShiftLeft || keys.ShiftRight || keys.Space);
    },
    key(code) {
      return !!keys[code];
    },
  };
};
