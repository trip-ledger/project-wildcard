import { headingDegrees } from './flight.js';
import { formatBest, formatTime } from './session.js';

function signedAngle(target, current) {
  const delta = target - current;
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

function formatDistance(meters, vertical) {
  const dist = meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
  if (Math.abs(vertical) < 40) return dist;
  const amount = `${Math.round(Math.abs(vertical))} m`;
  return vertical > 0 ? `${dist} · ${amount} up` : `${dist} · ${amount} down`;
}

export function createHud({ onFlyAgain, onToggleMute, onPause, onMainMenu }) {
  const root = document.createElement('div');
  root.id = 'hud';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Flight instruments');
  root.hidden = true;
  root.innerHTML = `
    <div class="readout"><span>IAS</span><strong id="hud-ias">0</strong><em>kt</em></div>
    <div class="readout"><span>ALT</span><strong id="hud-alt">0</strong><em>ft</em></div>
    <div class="readout"><span>HDG</span><strong id="hud-hdg">000</strong><em>°</em></div>
    <div class="throttle" title="Throttle"><div id="hud-thr"></div></div>
    <p class="hint">W/S pitch · A/D roll · Q/E yaw · Shift/Ctrl throttle · M mute · Esc pause</p>
  `;
  document.body.appendChild(root);

  const live = document.createElement('div');
  live.id = 'hud-live';
  live.className = 'sr-only';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);

  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'pause-btn';
  pauseBtn.type = 'button';
  pauseBtn.textContent = 'Pause';
  pauseBtn.setAttribute('aria-label', 'Pause');
  pauseBtn.setAttribute('aria-haspopup', 'dialog');
  pauseBtn.setAttribute('aria-controls', 'menu-root');
  pauseBtn.hidden = true;
  pauseBtn.addEventListener('click', () => {
    if (onPause) onPause();
  });
  document.body.appendChild(pauseBtn);

  const daily = document.createElement('div');
  daily.id = 'daily';
  daily.hidden = true;
  daily.setAttribute('role', 'group');
  daily.setAttribute('aria-label', 'Daily route');
  daily.innerHTML = `
    <div class="kicker">Daily rings</div>
    <div><span id="hud-date"></span> <span id="hud-seed"></span></div>
    <div>Best <strong id="hud-best">—</strong></div>
    <div>Gates <span id="hud-gates">0/0</span> · <span id="hud-time">0:00.0</span></div>
    <button id="mute" type="button" aria-pressed="false" aria-label="Mute sound">Mute</button>
  `;
  document.body.appendChild(daily);

  const cue = document.createElement('div');
  cue.id = 'gate-cue';
  cue.hidden = true;
  cue.setAttribute('role', 'group');
  cue.setAttribute('aria-label', 'Next ring');
  cue.innerHTML = `
    <div id="gate-arrow" aria-hidden="true"></div>
    <span id="hud-range">—</span>
  `;
  document.body.appendChild(cue);

  const crash = document.createElement('div');
  crash.id = 'crash-banner';
  crash.hidden = true;
  crash.setAttribute('role', 'status');
  crash.setAttribute('aria-live', 'assertive');
  document.body.appendChild(crash);

  const results = document.createElement('div');
  results.id = 'results';
  results.hidden = true;
  results.setAttribute('role', 'dialog');
  results.setAttribute('aria-modal', 'true');
  results.setAttribute('aria-labelledby', 'results-heading');
  results.innerHTML = `
    <div id="results-card">
      <h2 id="results-heading">Route complete</h2>
      <p id="results-date"></p>
      <dl>
        <div><dt>Time</dt><dd id="results-time"></dd></div>
        <div><dt>Gates</dt><dd id="results-gates"></dd></div>
        <div><dt>Smooth</dt><dd id="results-smooth"></dd></div>
        <div><dt>Score</dt><dd id="results-score"></dd></div>
        <div><dt>Today</dt><dd id="results-today"></dd></div>
        <div><dt>All-time</dt><dd id="results-all"></dd></div>
      </dl>
      <button id="fly-again" type="button">Fly again</button>
      <button id="results-menu" type="button">Main menu</button>
    </div>
  `;
  document.body.appendChild(results);

  const ias = root.querySelector('#hud-ias');
  const alt = root.querySelector('#hud-alt');
  const hdg = root.querySelector('#hud-hdg');
  const thr = root.querySelector('#hud-thr');
  const dateEl = daily.querySelector('#hud-date');
  const seedEl = daily.querySelector('#hud-seed');
  const bestEl = daily.querySelector('#hud-best');
  const gatesEl = daily.querySelector('#hud-gates');
  const timeEl = daily.querySelector('#hud-time');
  const mute = daily.querySelector('#mute');
  const arrow = cue.querySelector('#gate-arrow');
  const range = cue.querySelector('#hud-range');
  const flyAgain = results.querySelector('#fly-again');
  const resultsMenu = results.querySelector('#results-menu');

  const resultsTime = results.querySelector('#results-time');
  const resultsGates = results.querySelector('#results-gates');
  const resultsSmooth = results.querySelector('#results-smooth');
  const resultsScore = results.querySelector('#results-score');
  const resultsToday = results.querySelector('#results-today');
  const resultsAll = results.querySelector('#results-all');
  const resultsDate = results.querySelector('#results-date');

  mute.addEventListener('click', () => {
    if (onToggleMute) onToggleMute();
  });
  flyAgain.addEventListener('click', () => {
    if (onFlyAgain) onFlyAgain();
  });
  resultsMenu.addEventListener('click', () => {
    if (onMainMenu) onMainMenu();
  });

  results.addEventListener('keydown', (event) => {
    if (results.hidden) return;
    const items = [flyAgain, resultsMenu];
    if (event.key === 'Tab') {
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length;
      items[next < 0 ? 0 : next].focus();
    }
  });

  let shown = {};
  let chrome = false;
  let lastSpoken = 0;

  function setText(node, value) {
    const next = String(value);
    if (node.textContent !== next) node.textContent = next;
  }

  return {
    setMuted(muted) {
      mute.textContent = muted ? 'Unmute' : 'Mute';
      mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
      mute.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    },
    setChrome(next) {
      chrome = next === 'playing' || next === 'crashed';
      root.hidden = !chrome;
      daily.hidden = !chrome;
      pauseBtn.hidden = next !== 'playing';
      if (!chrome && !cue.hidden) cue.hidden = true;
    },
    showCrash(message) {
      crash.textContent = message;
      crash.hidden = false;
    },
    hideCrash() {
      crash.hidden = true;
      crash.textContent = '';
    },
    showResults(result) {
      setText(resultsDate, result.date);
      setText(resultsTime, formatTime(result.elapsed));
      setText(resultsGates, `${result.hits} / ${result.total}`);
      setText(resultsSmooth, `+${result.smooth}`);
      setText(resultsScore, String(result.score));
      setText(resultsToday, formatBest(result.bestToday));
      setText(resultsAll, formatBest(result.bestAll));
      results.hidden = false;
      flyAgain.focus();
    },
    hideResults() {
      results.hidden = true;
    },
    update(flight, view) {
      if (!chrome) return;
      const knots = Math.max(0, Math.round(flight.airspeed * 1.943844));
      const feet = Math.round(flight.position.y * 3.28084);
      const heading = Math.round(headingDegrees(flight.yaw)) % 360;
      setText(ias, knots);
      setText(alt, feet);
      setText(hdg, String(heading).padStart(3, '0'));
      thr.style.width = `${Math.round(flight.throttle * 100)}%`;

      setText(dateEl, view.date);
      setText(seedEl, view.seedHex);
      setText(bestEl, formatBest(view.bestToday));
      setText(gatesEl, `${view.hits}/${view.total}`);
      setText(timeEl, formatTime(view.elapsed));

      const now = performance.now();
      if (now - lastSpoken > 4000) {
        lastSpoken = now;
        const summary = `Airspeed ${knots} knots. Altitude ${feet} feet. Heading ${heading}. Gates ${view.hits} of ${view.total}.`;
        if (live.textContent !== summary) live.textContent = summary;
      }

      const gate = view.gate;
      if (!gate || view.finished) {
        if (!cue.hidden) cue.hidden = true;
        return;
      }
      if (cue.hidden) cue.hidden = false;
      const dx = gate.x - flight.position.x;
      const dy = gate.y - flight.position.y;
      const dz = gate.z - flight.position.z;
      const target = Math.atan2(dx, -dz);
      const current = -flight.yaw;
      const delta = signedAngle(target, current);
      const key = delta.toFixed(3);
      if (shown.arrow !== key) {
        shown.arrow = key;
        arrow.style.transform = `rotate(${delta}rad)`;
      }
      const distance = formatDistance(Math.hypot(dx, dy, dz), dy);
      setText(range, distance);
      cue.setAttribute('aria-label', `Next ring ${distance}`);
    },
  };
}
