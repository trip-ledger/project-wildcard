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

export function createInput() {
  const down = new Set();
  const state = {
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttleUp: false,
    throttleDown: false,
  };

  function onKeyDown(event) {
    if (HANDLED.has(event.code)) event.preventDefault();
    down.add(event.code);
  }

  function onKeyUp(event) {
    if (HANDLED.has(event.code)) event.preventDefault();
    down.delete(event.code);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => down.clear());

  return {
    state,
    update() {
      state.pitch = (down.has('KeyW') ? 1 : 0) - (down.has('KeyS') ? 1 : 0);
      state.roll = (down.has('KeyD') ? 1 : 0) - (down.has('KeyA') ? 1 : 0);
      state.yaw = (down.has('KeyQ') ? 1 : 0) - (down.has('KeyE') ? 1 : 0);
      state.throttleUp = down.has('ShiftLeft') || down.has('ShiftRight');
      state.throttleDown = down.has('ControlLeft') || down.has('ControlRight');
    },
  };
}
