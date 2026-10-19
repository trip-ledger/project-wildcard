import { headingDegrees } from './flight.js';

export function createHud() {
  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="readout"><span>IAS</span><strong id="hud-ias">0</strong><em>kt</em></div>
    <div class="readout"><span>ALT</span><strong id="hud-alt">0</strong><em>ft</em></div>
    <div class="readout"><span>HDG</span><strong id="hud-hdg">000</strong><em>°</em></div>
    <div class="throttle" title="Throttle"><div id="hud-thr"></div></div>
    <p class="hint">W/S pitch · A/D roll · Q/E yaw · Shift/Ctrl throttle</p>
  `;
  document.body.appendChild(root);

  const ias = root.querySelector('#hud-ias');
  const alt = root.querySelector('#hud-alt');
  const hdg = root.querySelector('#hud-hdg');
  const thr = root.querySelector('#hud-thr');

  return {
    update(flight) {
      const knots = Math.max(0, Math.round(flight.airspeed * 1.943844));
      const feet = Math.round(flight.position.y * 3.28084);
      const heading = Math.round(headingDegrees(flight.yaw)) % 360;
      ias.textContent = String(knots);
      alt.textContent = String(feet);
      hdg.textContent = String(heading).padStart(3, '0');
      thr.style.width = `${Math.round(flight.throttle * 100)}%`;
    },
  };
}
