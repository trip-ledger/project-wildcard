function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wantsTouchUi() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.matchMedia('(max-width: 820px)').matches;
  return coarse || narrow || (navigator.maxTouchPoints || 0) > 0;
}

export function createTouchControls() {
  const axes = {
    pitch: 0,
    roll: 0,
    throttleHold: null,
  };

  const root = document.createElement('div');
  root.id = 'touch-ui';
  root.innerHTML = `
    <div id="stick" role="group" aria-label="Pitch and roll stick">
      <div id="stick-knob"></div>
    </div>
    <div id="throttle-pad" role="slider" aria-label="Throttle" aria-valuemin="0" aria-valuemax="100" aria-valuenow="62">
      <div id="throttle-fill"></div>
      <div id="throttle-knob"></div>
      <span id="throttle-label">THR</span>
    </div>
  `;
  document.body.appendChild(root);

  const stick = root.querySelector('#stick');
  const stickKnob = root.querySelector('#stick-knob');
  const pad = root.querySelector('#throttle-pad');
  const fill = root.querySelector('#throttle-fill');
  const throttleKnob = root.querySelector('#throttle-knob');
  let stickPointer = null;
  let throttlePointer = null;
  let shownPercent = -1;

  function paintThrottle(value) {
    const percent = Math.round(clamp(value, 0, 1) * 100);
    if (percent === shownPercent) return;
    shownPercent = percent;
    fill.style.height = `${percent}%`;
    throttleKnob.style.top = `${100 - percent}%`;
    pad.setAttribute('aria-valuenow', String(percent));
  }

  function applyTouchMode() {
    const on = wantsTouchUi();
    root.classList.toggle('is-visible', on);
    document.documentElement.classList.toggle('touch-controls', on);
  }

  function stickFromEvent(event) {
    const rect = stick.getBoundingClientRect();
    const max = Math.min(rect.width, rect.height) * 0.32;
    if (max <= 0) return;
    let nx = (event.clientX - (rect.left + rect.width / 2)) / max;
    let ny = (event.clientY - (rect.top + rect.height / 2)) / max;
    const mag = Math.hypot(nx, ny);
    if (mag > 1) {
      nx /= mag;
      ny /= mag;
    }
    const limited = Math.min(mag, 1);
    if (limited < 0.12) {
      axes.roll = 0;
      axes.pitch = 0;
    } else {
      const scaled = (limited - 0.12) / 0.88;
      const inv = limited === 0 ? 0 : scaled / limited;
      axes.roll = nx * inv;
      axes.pitch = -ny * inv;
    }
    stickKnob.style.transform = `translate(calc(-50% + ${nx * max}px), calc(-50% + ${ny * max}px))`;
  }

  function resetStick() {
    stickPointer = null;
    axes.pitch = 0;
    axes.roll = 0;
    stickKnob.style.transform = 'translate(-50%, -50%)';
  }

  function holdFromEvent(event) {
    const rect = pad.getBoundingClientRect();
    if (rect.height <= 0) return;
    const next = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
    axes.throttleHold = next;
    paintThrottle(next);
  }

  stick.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    stickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    stickFromEvent(event);
  }, { passive: false });
  stick.addEventListener('pointermove', (event) => {
    if (event.pointerId !== stickPointer) return;
    event.preventDefault();
    stickFromEvent(event);
  }, { passive: false });
  stick.addEventListener('pointerup', (event) => {
    if (event.pointerId !== stickPointer) return;
    resetStick();
  });
  stick.addEventListener('pointercancel', (event) => {
    if (event.pointerId !== stickPointer) return;
    resetStick();
  });

  pad.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    throttlePointer = event.pointerId;
    pad.setPointerCapture(event.pointerId);
    holdFromEvent(event);
  }, { passive: false });
  pad.addEventListener('pointermove', (event) => {
    if (event.pointerId !== throttlePointer) return;
    event.preventDefault();
    holdFromEvent(event);
  }, { passive: false });
  function releaseThrottle(event) {
    if (event.pointerId !== throttlePointer) return;
    throttlePointer = null;
    axes.throttleHold = null;
  }
  pad.addEventListener('pointerup', releaseThrottle);
  pad.addEventListener('pointercancel', releaseThrottle);

  root.addEventListener('contextmenu', (event) => event.preventDefault());
  applyTouchMode();
  paintThrottle(0.62);
  window.addEventListener('resize', applyTouchMode);
  const coarseQuery = window.matchMedia('(pointer: coarse)');
  if (coarseQuery.addEventListener) coarseQuery.addEventListener('change', applyTouchMode);

  return {
    get pitch() {
      return axes.pitch;
    },
    get roll() {
      return axes.roll;
    },
    get throttleHold() {
      return axes.throttleHold;
    },
    reset() {
      resetStick();
      throttlePointer = null;
      axes.throttleHold = null;
    },
    syncThrottle(value) {
      if (axes.throttleHold != null) return;
      paintThrottle(value);
    },
  };
}
