import { expect, test } from '@playwright/test';

const FRAME_STALL_MS = 500;

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function readHud(page) {
  return page.evaluate(() => {
    const throttle = document.querySelector('#hud-thr');
    return {
      alt: Number(document.querySelector('#hud-alt')?.textContent),
      hdg: Number(document.querySelector('#hud-hdg')?.textContent),
      thr: Number.parseFloat(throttle?.style.width || ''),
    };
  });
}

async function sampleFrames(page, count = 40) {
  return page.evaluate((frames) => new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    let seen = 0;
    function step(now) {
      if (seen > 0) deltas.push(now - last);
      last = now;
      seen += 1;
      if (seen <= frames) requestAnimationFrame(step);
      else {
        deltas.sort((a, b) => a - b);
        const mid = deltas[Math.floor(deltas.length / 2)] || 0;
        const p95 = deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * 0.95))] || 0;
        resolve({ medianMs: mid, p95Ms: p95, frames: deltas.length });
      }
    }
    requestAnimationFrame(step);
  }), count);
}

async function debugState(page) {
  return page.evaluate(() => window.__debug());
}

test('title screen, flight, HUD, and pause menu', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page).toHaveTitle('Untitled');
  await expect(page.locator('#menu-play')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();

  await page.locator('#menu-play').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#menu-root')).toBeHidden();
  await expect(page.locator('#touch-ui')).toBeHidden();
  await expect.poll(async () => (await readHud(page)).alt).toBeGreaterThan(100);

  const start = await readHud(page);
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  await page.keyboard.down('Shift');
  try {
    await expect.poll(async () => {
      const now = await readHud(page);
      return now.alt >= start.alt + 30 && now.hdg !== start.hdg && now.thr > start.thr;
    }, {
      timeout: 8000,
      message: `HUD did not move from ${JSON.stringify(start)}`,
    }).toBe(true);
  } finally {
    await page.keyboard.up('w');
    await page.keyboard.up('d');
    await page.keyboard.up('Shift');
  }

  await expect(page.locator('#crash-banner')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-resume')).toBeVisible();
  await expect(page.locator('#menu-status')).toHaveText('Paused');
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-root')).toBeHidden();
  await expect(page.locator('#pause-btn')).toBeVisible();
  await expect(page.locator('#hud-alt')).toBeVisible();

  const frames = await sampleFrames(page);
  const canvas = await page.evaluate(() => {
    const el = document.querySelector('canvas');
    return { width: el.width, height: el.height };
  });
  console.log(
    `[perf] median frame ${frames.medianMs.toFixed(1)} ms, p95 ${frames.p95Ms.toFixed(1)} ms, n=${frames.frames}, canvas ${canvas.width}x${canvas.height}`,
  );
  expect(frames.frames).toBeGreaterThan(20);
  expect(frames.medianMs).toBeGreaterThan(0);
  expect(frames.medianMs).toBeLessThan(FRAME_STALL_MS);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('touch controls render in a mobile viewport', async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#menu-play')).toBeVisible();
  await page.locator('#menu-play').click();
  await expect(page.locator('#stick')).toBeVisible();
  await expect(page.locator('#throttle-pad')).toBeVisible();

  const stick = await page.locator('#stick').boundingBox();
  const pad = await page.locator('#throttle-pad').boundingBox();
  expect(stick.width).toBeGreaterThan(80);
  expect(stick.x).toBeLessThan(40);
  expect(pad.height).toBeGreaterThan(80);
  expect(pad.x).toBeGreaterThan(250);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('ghost jet plays back and can be hidden', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?debug=1&date=2026-04-02');
  await page.locator('#menu-route').click();
  await expect(page.locator('#route-ghost')).toHaveText('None');
  await page.getByRole('button', { name: 'Back' }).click();

  const planted = await page.evaluate(() => window.__plantGhost({
    score: 8000,
    interval: 1,
    samples: [
      { x: 0, y: 320, z: 0, pitch: 0, yaw: 0, roll: 0 },
      { x: 0, y: 420, z: -200, pitch: 0.2, yaw: 0, roll: 0 },
      { x: 40, y: 480, z: -420, pitch: 0, yaw: -0.3, roll: 0.2 },
    ],
  }));
  expect(planted.wrote).toBe(true);
  expect(planted.samples).toBe(3);

  await page.locator('#menu-route').click();
  await expect(page.locator('#route-ghost')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('#menu-play').click();

  await expect.poll(async () => (await debugState(page)).ghost.y).toBeGreaterThan(400);
  const shown = await debugState(page);
  expect(shown.ghost.visible).toBe(true);
  expect(shown.ghost.score).toBe(8000);
  expect(shown.ghost.z).toBeLessThan(-80);

  await page.keyboard.press('Escape');
  await page.locator('#menu-settings').click();
  await expect(page.locator('#set-ghost')).toBeChecked();
  await page.locator('#set-ghost').uncheck();
  await expect.poll(async () => (await debugState(page)).ghost.visible).toBe(false);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('#menu-resume').click();
  expect((await debugState(page)).ghost.visible).toBe(false);
  expect((await debugState(page)).ghost.show).toBe(false);

  await page.reload();
  await page.locator('#menu-settings').click();
  await expect(page.locator('#set-ghost')).not.toBeChecked();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('#menu-route').click();
  await expect(page.locator('#route-ghost')).toHaveText('Hidden');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('#menu-play').click();
  await expect.poll(async () => (await debugState(page)).ghost.time).toBeGreaterThan(0.2);
  const hidden = await debugState(page);
  expect(hidden.ghost.visible).toBe(false);
  expect(hidden.ghost.samples).toBe(3);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a finished recording is the ghost on the next attempt', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?debug=1&date=2026-08-19');
  await page.locator('#menu-play').click();
  await expect.poll(async () => (await debugState(page)).ghost.recording).toBeGreaterThan(6);

  const saved = await page.evaluate(() => window.__commitGhost(6400));
  expect(saved.saved).toBe(true);
  expect(saved.score).toBe(6400);
  expect(saved.samples).toBeGreaterThan(6);

  await page.reload();
  await page.locator('#menu-route').click();
  await expect(page.locator('#route-ghost')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('#menu-play').click();
  await expect.poll(async () => (await debugState(page)).ghost.time).toBeGreaterThan(0.35);
  const ghost = await debugState(page);
  expect(ghost.ghost.visible).toBe(true);
  expect(ghost.ghost.score).toBe(6400);
  expect(ghost.ghost.samples).toBeGreaterThan(6);
  expect(ghost.ghost.z).toBeLessThan(-15);
  expect(errors, errors.join('\n')).toEqual([]);
});
