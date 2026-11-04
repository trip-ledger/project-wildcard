import { creditsHtml } from './credits.js';
import { formatBest } from './session.js';
import { GAME_TITLE } from './title.js';

function focusables(scope) {
  return [...scope.querySelectorAll('button, a[href], input, select, textarea')].filter((el) => {
    if (el.disabled || el.hidden) return false;
    if (el.closest('[hidden]')) return false;
    return el.getClientRects().length > 0;
  });
}

function connectedPad() {
  const pads = navigator.getGamepads?.();
  if (!pads) return null;
  for (let i = 0; i < pads.length; i += 1) {
    if (pads[i]?.connected) return pads[i];
  }
  return null;
}

export function createMenu({ settings, getRoute, onPlay, onResume, onQuit }) {
  const root = document.createElement('div');
  root.id = 'menu-root';
  root.hidden = true;
  root.inert = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'menu-title');
  root.innerHTML = `
    <div class="menu-card">
      <section class="menu-panel" data-panel="root">
        <p class="menu-kicker" id="menu-kicker"></p>
        <h1 id="menu-title"></h1>
        <p id="menu-status" class="menu-status"></p>
        <div class="menu-actions" role="group" aria-label="Menu">
          <button type="button" id="menu-play">Play</button>
          <button type="button" id="menu-resume" hidden>Resume</button>
          <button type="button" id="menu-route">Today's Route</button>
          <button type="button" id="menu-controls">Controls</button>
          <button type="button" id="menu-settings">Settings</button>
          <button type="button" id="menu-about">About</button>
          <button type="button" id="menu-quit" hidden>Main menu</button>
        </div>
      </section>
      <section class="menu-panel" data-panel="route" hidden>
        <h2 id="route-heading" tabindex="-1">Today's Route</h2>
        <button type="button" class="menu-back" data-back>Back</button>
        <dl class="menu-stats">
          <div><dt>Date</dt><dd id="route-date"></dd></div>
          <div><dt>Seed</dt><dd id="route-seed"></dd></div>
          <div><dt>Gates</dt><dd id="route-gates"></dd></div>
          <div><dt>Best today</dt><dd id="route-today"></dd></div>
          <div><dt>All-time</dt><dd id="route-all"></dd></div>
        </dl>
        <p class="menu-copy">Fly the rings in order. The clock starts when the first ring is resolved. A ring scores 1,200. Missing one costs 500. Each second costs 20. A smooth flight adds up to 300. The same local date is the same course. This browser keeps today's best and an all-time best on this device.</p>
        <button type="button" id="route-play">Play today's route</button>
      </section>
      <section class="menu-panel" data-panel="controls" hidden>
        <h2 id="controls-heading" tabindex="-1">Controls</h2>
        <button type="button" class="menu-back" data-back>Back</button>
        <h3>Keyboard</h3>
        <ul class="menu-list">
          <li>W / S — pitch up / pitch down</li>
          <li>A / D — roll left / roll right</li>
          <li>Q / E — yaw left / yaw right</li>
          <li>Shift / Ctrl — throttle up / throttle down</li>
          <li>M — mute or unmute</li>
          <li>Esc or P — pause</li>
          <li>Tab, Shift+Tab, and arrow keys move through these menus. Enter or Space activates a button.</li>
        </ul>
        <h3>Gamepad</h3>
        <ul class="menu-list">
          <li>Left stick — pitch and roll</li>
          <li>Right stick and bumpers — yaw</li>
          <li>Triggers — throttle</li>
          <li>Start — pause, resume, or play</li>
          <li>In a menu, the D-pad or left stick moves, A activates, and B goes back</li>
        </ul>
        <h3>Touch</h3>
        <ul class="menu-list">
          <li>The left stick pitches and rolls.</li>
          <li>The right slider sets throttle.</li>
          <li>Pause, mute, and the menus are buttons.</li>
        </ul>
        <p class="menu-copy">Invert pitch, in Settings, swaps nose-up and nose-down for the keys, the stick, and the gamepad.</p>
      </section>
      <section class="menu-panel" data-panel="settings" hidden>
        <h2 id="settings-heading" tabindex="-1">Settings</h2>
        <button type="button" class="menu-back" data-back>Back</button>
        <div class="menu-fields">
          <label class="check"><input id="set-mute" type="checkbox"> Mute</label>
          <label class="range" for="set-volume">Volume <span id="set-volume-readout">70%</span></label>
          <input id="set-volume" type="range" min="0" max="100" step="1" value="70" aria-label="Volume" aria-valuemin="0" aria-valuemax="100" aria-valuenow="70" aria-valuetext="70 percent">
          <fieldset>
            <legend>Graphics quality</legend>
            <label class="check"><input type="radio" name="quality" value="low"> Low</label>
            <label class="check"><input type="radio" name="quality" value="medium"> Medium</label>
            <label class="check"><input type="radio" name="quality" value="high"> High</label>
          </fieldset>
          <p class="menu-copy" id="quality-hint">Low aims at phones. Medium and High aim at a desktop. If frames stay slow, the view drops pixel ratio, then shadows, then cloud density on its own.</p>
          <label class="check"><input id="set-invert" type="checkbox"> Invert pitch</label>
          <fieldset>
            <legend>Reduced motion</legend>
            <label class="check"><input type="radio" name="motion" value="system"> Match system</label>
            <label class="check"><input type="radio" name="motion" value="on"> On</label>
            <label class="check"><input type="radio" name="motion" value="off"> Off</label>
          </fieldset>
          <p class="menu-copy" id="motion-hint"></p>
        </div>
      </section>
      <section class="menu-panel" data-panel="about" hidden>
        <h2 id="about-heading" tabindex="-1">About</h2>
        <button type="button" class="menu-back" data-back>Back</button>
        <div class="credits" id="credits-body"></div>
      </section>
    </div>
  `;
  document.body.appendChild(root);

  const titleEl = root.querySelector('#menu-title');
  titleEl.textContent = GAME_TITLE;
  const kicker = root.querySelector('#menu-kicker');
  const status = root.querySelector('#menu-status');
  const panels = {
    root: root.querySelector('[data-panel="root"]'),
    route: root.querySelector('[data-panel="route"]'),
    controls: root.querySelector('[data-panel="controls"]'),
    settings: root.querySelector('[data-panel="settings"]'),
    about: root.querySelector('[data-panel="about"]'),
  };
  const playBtn = root.querySelector('#menu-play');
  const resumeBtn = root.querySelector('#menu-resume');
  const quitBtn = root.querySelector('#menu-quit');
  const routePlay = root.querySelector('#route-play');
  const creditsBody = root.querySelector('#credits-body');
  creditsBody.innerHTML = creditsHtml();

  const muteBox = root.querySelector('#set-mute');
  const volume = root.querySelector('#set-volume');
  const volumeReadout = root.querySelector('#set-volume-readout');
  const invertBox = root.querySelector('#set-invert');
  const motionHint = root.querySelector('#motion-hint');
  const qualityInputs = [...root.querySelectorAll('input[name="quality"]')];
  const motionInputs = [...root.querySelectorAll('input[name="motion"]')];

  let kind = 'title';
  let panel = 'root';
  let returnFocus = null;
  let prevPad = {
    start: false, back: false, confirm: false, up: false, down: false, left: false, right: false,
  };
  let lastNav = 0;

  function headingFor(name) {
    if (name === 'root') return titleEl;
    if (name === 'route') return root.querySelector('#route-heading');
    if (name === 'controls') return root.querySelector('#controls-heading');
    if (name === 'settings') return root.querySelector('#settings-heading');
    return root.querySelector('#about-heading');
  }

  function showPanel(name, { focusDefault = false } = {}) {
    panel = name;
    for (const key of Object.keys(panels)) panels[key].hidden = key !== name;
    const heading = headingFor(name);
    root.setAttribute('aria-labelledby', heading.id);
    if (name === 'route') fillRoute();
    if (name === 'settings') syncSettings();
    const target = focusDefault ? defaultButton() : heading;
    requestAnimationFrame(() => target?.focus());
  }

  function defaultButton() {
    if (kind === 'pause') return resumeBtn;
    return playBtn;
  }

  function applyKind() {
    const paused = kind === 'pause';
    playBtn.hidden = paused;
    resumeBtn.hidden = !paused;
    quitBtn.hidden = !paused;
    routePlay.hidden = paused;
    const route = getRoute();
    kicker.textContent = route?.date ? `Daily route · ${route.date}` : 'Daily route';
    status.textContent = paused
      ? 'Paused'
      : 'Hand-fly the jet through today’s rings.';
  }

  function fillRoute() {
    const route = getRoute();
    root.querySelector('#route-date').textContent = route.date;
    root.querySelector('#route-seed').textContent = route.seedHex;
    root.querySelector('#route-gates').textContent = String(route.gates);
    root.querySelector('#route-today').textContent = formatBest(route.bestToday);
    root.querySelector('#route-all').textContent = formatBest(route.bestAll);
    routePlay.hidden = kind !== 'title';
  }

  function syncSettings() {
    const snap = settings.snapshot();
    muteBox.checked = snap.muted;
    invertBox.checked = snap.invertPitch;
    if (document.activeElement !== volume) {
      const percent = Math.round(snap.volume * 100);
      volume.value = String(percent);
      paintVolume(percent);
    }
    for (const input of qualityInputs) input.checked = input.value === snap.quality;
    for (const input of motionInputs) input.checked = input.value === snap.reducedMotionChoice;
    motionHint.textContent = snap.reducedMotion
      ? 'Camera shake and glow are toned down.'
      : 'Camera shake and glow play in full.';
  }

  function paintVolume(percent) {
    volumeReadout.textContent = `${percent}%`;
    volume.setAttribute('aria-valuenow', String(percent));
    volume.setAttribute('aria-valuetext', `${percent} percent`);
  }

  function open(nextKind) {
    kind = nextKind;
    returnFocus = null;
    applyKind();
    root.hidden = false;
    root.inert = false;
    document.documentElement.classList.add('is-menu');
    showPanel('root', { focusDefault: true });
  }

  function hide() {
    root.hidden = true;
    root.inert = true;
    document.documentElement.classList.remove('is-menu');
  }

  function back() {
    if (panel !== 'root') {
      const backTo = returnFocus;
      returnFocus = null;
      showPanel('root');
      requestAnimationFrame(() => {
        if (backTo && root.contains(backTo) && !backTo.hidden) backTo.focus();
        else defaultButton().focus();
      });
      return;
    }
    if (kind === 'pause') onResume();
  }

  function openSub(name, opener) {
    returnFocus = opener || document.activeElement;
    showPanel(name);
  }

  playBtn.addEventListener('click', () => onPlay());
  resumeBtn.addEventListener('click', () => onResume());
  quitBtn.addEventListener('click', () => onQuit());
  routePlay.addEventListener('click', () => onPlay());
  root.querySelector('#menu-route').addEventListener('click', (event) => openSub('route', event.currentTarget));
  root.querySelector('#menu-controls').addEventListener('click', (event) => openSub('controls', event.currentTarget));
  root.querySelector('#menu-settings').addEventListener('click', (event) => openSub('settings', event.currentTarget));
  root.querySelector('#menu-about').addEventListener('click', (event) => openSub('about', event.currentTarget));
  for (const button of root.querySelectorAll('[data-back]')) {
    button.addEventListener('click', () => back());
  }

  muteBox.addEventListener('change', () => settings.setMuted(muteBox.checked));
  invertBox.addEventListener('change', () => settings.setInvertPitch(invertBox.checked));
  volume.addEventListener('input', () => {
    const percent = Number(volume.value);
    paintVolume(percent);
    settings.setVolume(percent / 100);
  });
  for (const input of qualityInputs) {
    input.addEventListener('change', () => {
      if (input.checked) settings.setQuality(input.value);
    });
  }
  for (const input of motionInputs) {
    input.addEventListener('change', () => {
      if (input.checked) settings.setReducedMotionChoice(input.value);
    });
  }

  settings.subscribe(() => {
    if (!root.hidden && panel === 'settings') syncSettings();
  });

  function moveFocus(delta) {
    const items = focusables(panels.root).filter((el) => el.tagName === 'BUTTON');
    if (!items.length) return;
    let index = items.indexOf(document.activeElement);
    if (index < 0) index = delta > 0 ? -1 : 0;
    items[(index + delta + items.length) % items.length].focus();
  }

  window.addEventListener('keydown', (event) => {
    if (root.hidden || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    back();
  }, true);

  root.addEventListener('mousedown', (event) => {
    if (event.target === root) event.preventDefault();
  });

  root.addEventListener('keydown', (event) => {
    if (root.hidden) return;
    const onRoot = panel === 'root';
    if (onRoot && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      moveFocus(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (onRoot && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      const items = focusables(panels.root).filter((el) => el.tagName === 'BUTTON');
      const target = event.key === 'Home' ? items[0] : items[items.length - 1];
      target?.focus();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables(root);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !root.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !root.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  });

  function readPad() {
    const pad = connectedPad();
    if (!pad) {
      return {
        start: false, back: false, confirm: false, up: false, down: false, left: false, right: false,
      };
    }
    const axisY = pad.axes?.[1] || 0;
    const axisX = pad.axes?.[0] || 0;
    return {
      start: Boolean(pad.buttons[9]?.pressed),
      back: Boolean(pad.buttons[1]?.pressed || pad.buttons[8]?.pressed),
      confirm: Boolean(pad.buttons[0]?.pressed),
      up: Boolean(pad.buttons[12]?.pressed) || axisY < -0.55,
      down: Boolean(pad.buttons[13]?.pressed) || axisY > 0.55,
      left: Boolean(pad.buttons[14]?.pressed) || axisX < -0.55,
      right: Boolean(pad.buttons[15]?.pressed) || axisX > 0.55,
    };
  }

  function poll() {
    const pad = readPad();
    const startEdge = pad.start && !prevPad.start;
    const backEdge = pad.back && !prevPad.back;
    const confirmEdge = pad.confirm && !prevPad.confirm;
    const leftEdge = pad.left && !prevPad.left;
    const rightEdge = pad.right && !prevPad.right;
    const nav = pad.up || pad.down;
    const previous = prevPad;
    prevPad = pad;

    if (root.hidden) return { startEdge };

    if (startEdge) {
      if (panel !== 'root') showPanel('root', { focusDefault: true });
      else if (kind === 'pause') onResume();
      else onPlay();
    } else if (backEdge) {
      back();
    } else if (panel === 'root' && nav) {
      const fresh = (pad.up && !previous.up) || (pad.down && !previous.down);
      const now = performance.now();
      if (fresh || now - lastNav > 240) {
        moveFocus(pad.down && !pad.up ? 1 : -1);
        lastNav = now;
      }
    } else if (confirmEdge) {
      const active = document.activeElement;
      if (active && root.contains(active)) active.click();
    } else if (document.activeElement === volume && (leftEdge || rightEdge)) {
      const next = Math.min(100, Math.max(0, Number(volume.value) + (rightEdge ? 5 : -5)));
      volume.value = String(next);
      paintVolume(next);
      settings.setVolume(next / 100);
    }
    return { startEdge: false };
  }

  return {
    showTitle() {
      open('title');
    },
    showPause() {
      open('pause');
    },
    hide,
    isOpen() {
      return !root.hidden;
    },
    poll,
  };
}
