import { createTouchControls } from './touch.js';

const HANDLED = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function deadzone(value, threshold = 0.18) {
  const amount = Math.abs(value);
  if (amount < threshold) return 0;
  return Math.sign(value) * ((amount - threshold) / (1 - threshold));
}

function readGamepad() {
  const pads = navigator.getGamepads?.();
  if (!pads) return null;
  let pad = null;
  for (let i = 0; i < pads.length; i += 1) {
    if (pads[i]?.connected) {
      pad = pads[i];
      break;
    }
  }
  if (!pad) return null;

  const bumperYaw = (pad.buttons[5]?.pressed ? 1 : 0) - (pad.buttons[4]?.pressed ? 1 : 0);
  return {
    pitch: deadzone(-(pad.axes[1] || 0)),
    roll: deadzone(pad.axes[0] || 0),
    yaw: clamp(deadzone(pad.axes[2] || 0) + bumperYaw, -1, 1),
    throttleUp: (pad.buttons[7]?.value || 0) > 0.55,
    throttleDown: (pad.buttons[6]?.value || 0) > 0.55,
  };
}

export function createInput(getOptions = () => ({})) {
  const down = new Set();
  const touch = createTouchControls();
  let enabled = true;
  const state = {
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttleUp: false,
    throttleDown: false,
    throttleHold: null,
  };

  function onKeyDown(event) {
    if (!enabled) return;
    if (HANDLED.has(event.code)) event.preventDefault();
    down.add(event.code);
  }

  function onKeyUp(event) {
    if (HANDLED.has(event.code)) event.preventDefault();
    down.delete(event.code);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    down.clear();
    touch.reset();
  });

  return {
    state,
    setEnabled(next) {
      enabled = Boolean(next);
      if (enabled) return;
      down.clear();
      touch.reset();
      state.pitch = 0;
      state.roll = 0;
      state.yaw = 0;
      state.throttleUp = false;
      state.throttleDown = false;
      state.throttleHold = null;
    },
    update() {
      if (!enabled) {
        state.pitch = 0;
        state.roll = 0;
        state.yaw = 0;
        state.throttleUp = false;
        state.throttleDown = false;
        state.throttleHold = null;
        return;
      }
      let pitch = (down.has('KeyW') ? 1 : 0) - (down.has('KeyS') ? 1 : 0);
      let roll = (down.has('KeyD') ? 1 : 0) - (down.has('KeyA') ? 1 : 0);
      let yaw = (down.has('KeyQ') ? 1 : 0) - (down.has('KeyE') ? 1 : 0);
      let throttleUp = down.has('ShiftLeft') || down.has('ShiftRight');
      let throttleDown = down.has('ControlLeft') || down.has('ControlRight');

      pitch += touch.pitch;
      roll += touch.roll;

      const pad = readGamepad();
      if (pad) {
        pitch += pad.pitch;
        roll += pad.roll;
        yaw += pad.yaw;
        throttleUp = throttleUp || pad.throttleUp;
        throttleDown = throttleDown || pad.throttleDown;
      }

      state.pitch = clamp(pitch, -1, 1);
      state.roll = clamp(roll, -1, 1);
      state.yaw = clamp(yaw, -1, 1);
      state.throttleHold = touch.throttleHold;
      const sliderHeld = state.throttleHold != null;
      state.throttleUp = !sliderHeld && throttleUp && !throttleDown;
      state.throttleDown = !sliderHeld && throttleDown && !throttleUp;
      if (getOptions().invertPitch) state.pitch = -state.pitch;
    },
    syncThrottle(value) {
      touch.syncThrottle(value);
    },
  };
}
