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

export function createHud({ onFlyAgain, onToggleMute }) {
  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="readout"><span>IAS</span><strong id="hud-ias">0</strong><em>kt</em></div>
    <div class="readout"><span>ALT</span><strong id="hud-alt">0</strong><em>ft</em></div>
    <div class="readout"><span>HDG</span><strong id="hud-hdg">000</strong><em>°</em></div>
    <div class="throttle" title="Throttle"><div id="hud-thr"></div></div>
    <p class="hint">W/S pitch · A/D roll · Q/E yaw · Shift/Ctrl throttle · M mute</p>
  `;
  document.body.appendChild(root);

  const daily = document.createElement('div');
  daily.id = 'daily';
  daily.innerHTML = `
    <div class="kicker">Daily rings</div>
    <div><span id="hud-date"></span> <span id="hud-seed"></span></div>
    <div>Best <strong id="hud-best">—</strong></div>
    <div>Gates <span id="hud-gates">0/0</span> · <span id="hud-time">0:00.0</span></div>
    <button id="mute" type="button" aria-pressed="false">Mute</button>
  `;
  document.body.appendChild(daily);

  const cue = document.createElement('div');
  cue.id = 'gate-cue';
  cue.innerHTML = `
    <div id="gate-arrow"></div>
    <span id="hud-range">—</span>
  `;
  document.body.appendChild(cue);

  const results = document.createElement('div');
  results.id = 'results';
  results.hidden = true;
  results.setAttribute('role', 'dialog');
  results.setAttribute('aria-label', 'Route results');
  results.innerHTML = `
    <div id="results-card">
      <h2>Route complete</h2>
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

  let shown = {};

  function setText(node, value) {
    const next = String(value);
    if (node.textContent !== next) node.textContent = next;
  }

  return {
    setMuted(muted) {
      mute.textContent = muted ? 'Unmute' : 'Mute';
      mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
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
      setText(range, formatDistance(Math.hypot(dx, dy, dz), dy));
    },
  };
}
