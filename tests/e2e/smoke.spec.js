import { expect, test } from '@playwright/test';

const FRAME_STALL_MS = 500;
const FLIGHT_MS = 10_000;

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

function isPhone(testInfo) {
  return testInfo.project.name === 'mobile-chrome';
}

test('flight journey: start, fly, ring, pause, settings, ghost, results', async ({ page }, testInfo) => {
  const errors = trackErrors(page);
  const phone = isPhone(testInfo);
  if (testInfo.project.name === 'chromium' || testInfo.project.name === 'mobile-chrome') {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  }
  await page.goto('/?debug=1&date=2026-06-15');
  await expect(page).toHaveTitle('Virga');
  await expect(page.locator('#menu-title')).toHaveText('Virga');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Virga: hand-fly a small jet through a daily ring course at golden hour.',
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Virga');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'og.png');
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  const card = await page.request.get('/og.png');
  expect(card.ok()).toBeTruthy();
  const bytes = await card.body();
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
  await expect(page.locator('#menu-play')).toBeVisible();
  await expect(page.locator('#menu-play')).toBeFocused();
  await expect(page.locator('canvas')).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.locator('#menu-route')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#menu-controls')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#menu-settings')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#menu-about')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#menu-settings')).toBeFocused();

  await page.locator('#menu-about').click();
  await expect(page.locator('#about-lead')).toContainText('Virga');
  await expect(page.locator('#about-lead')).toContainText('AI bot team');
  await expect(page.locator('#about-lead')).toContainText('$0');
  await expect(page.locator('.credits')).toContainText('three.js');
  await expect(page.locator('.credits')).toContainText('og.png');
  await page.getByRole('button', { name: 'Back' }).click();

  const planted = await page.evaluate(() => window.__plantGhost({
    score: 8000,
    interval: 1,
    samples: [
      { x: 0, y: 320, z: 0, pitch: 0, yaw: 0, roll: 0 },
      { x: 0, y: 340, z: -400, pitch: 0.05, yaw: 0, roll: 0 },
      { x: 0, y: 360, z: -900, pitch: 0, yaw: 0, roll: 0 },
    ],
  }));
  expect(planted.wrote).toBe(true);

  await page.locator('#menu-play').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#menu-root')).toBeHidden();
  await expect.poll(async () => (await readHud(page)).alt).toBeGreaterThan(100);
  if (phone) {
    await expect(page.locator('#stick')).toBeVisible();
    await expect(page.locator('#throttle-pad')).toBeVisible();
  } else {
    await expect(page.locator('#touch-ui')).toBeHidden();
  }

  const started = Date.now();
  let lastFlight = null;
  await expect.poll(async () => {
    const state = await debugState(page);
    lastFlight = state.flight;
    return state.session.hits;
  }, {
    // Software GL on a shared runner can take well under real time, because
    // each step is capped at 50ms of flight. 15s of wall clock is not enough.
    timeout: 40_000,
    message: () => `the opening ring was not passed (${JSON.stringify(lastFlight)})`,
  }).toBeGreaterThan(0);
  expect((await debugState(page)).flight.crashed).toBe(false);
  expect((await debugState(page)).ghost.visible).toBe(true);

  if (phone) {
    const pad = await page.locator('#throttle-pad').boundingBox();
    expect(pad?.width).toBeGreaterThan(40);
    await page.touchscreen.tap(pad.x + pad.width / 2, pad.y + pad.height * 0.35);
  }

  const remain = FLIGHT_MS - (Date.now() - started);
  if (remain > 0) await page.waitForTimeout(remain);
  expect(Date.now() - started).toBeGreaterThanOrEqual(FLIGHT_MS - 250);
  expect((await debugState(page)).session.hits).toBeGreaterThan(0);
  expect((await debugState(page)).flight.crashed).toBe(false);

  const frames = await sampleFrames(page);
  console.log(
    `[perf] ${testInfo.project.name} median frame ${frames.medianMs.toFixed(1)} ms, p95 ${frames.p95Ms.toFixed(1)} ms, n=${frames.frames}`,
  );
  expect(frames.frames).toBeGreaterThan(20);
  expect(frames.medianMs).toBeGreaterThan(0);
  expect(frames.medianMs).toBeLessThan(FRAME_STALL_MS);

  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-resume')).toBeVisible();
  await expect(page.locator('#menu-status')).toHaveText('Paused');
  await page.locator('#menu-settings').click();
  await page.locator('#set-mute').check();
  await page.locator('input[name="motion"][value="on"]').check();
  await expect(page.locator('#motion-hint')).toHaveText('Camera shake and glow are toned down.');
  await expect(page.locator('#set-ghost')).toBeChecked();
  await page.locator('#set-ghost').uncheck();
  await expect.poll(async () => (await debugState(page)).ghost.visible).toBe(false);
  const settings = await page.evaluate(() => window.__debug().settings);
  expect(settings.muted).toBe(true);
  expect(settings.reducedMotion).toBe(true);
  expect(settings.showGhost).toBe(false);

  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('#menu-resume').click();
  await expect(page.locator('#menu-root')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#mute')).toHaveText('Unmute');
  expect((await debugState(page)).ghost.visible).toBe(false);

  const finished = await page.evaluate(() => window.__scriptedPass());
  expect(finished.finished).toBe(true);
  expect(finished.dialog).toBe(true);
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#results-heading')).toHaveText('Route complete');
  await expect(page.locator('#results-score')).not.toHaveText('');
  await expect(page.locator('#results-gates')).toContainText('/');
  await expect(page.locator('#fly-again')).toBeFocused();
  const share = page.locator('#share-result');
  await expect(share).toBeVisible();
  await expect(share).toHaveText('Share result');
  await share.click();
  await expect(page.locator('#share-status')).toHaveText('Copied');
  const summary = await share.getAttribute('data-summary');
  expect(summary).toContain('Virga — daily route 2026-06-15');
  expect(summary).toMatch(/Score \d+/);
  expect(summary).toContain('Gates');
  if (testInfo.project.name === 'chromium' || testInfo.project.name === 'mobile-chrome') {
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(summary);
  }

  await page.locator('#fly-again').click();
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#menu-quit').click();
  await expect(page.locator('#menu-play')).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('ghost jet plays back and can be hidden', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Recording details run on Chromium. Other browsers cover the ghost toggle in the flight journey.');
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

test('a finished recording is the ghost on the next attempt', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Recording details run on Chromium. Other browsers cover the ghost toggle in the flight journey.');
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
