import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { chromium } from '@playwright/test';

const PORT = 4183;
const DATE = '2026-06-15';
const WIDTH = 1280;
const HEIGHT = 720;
const OUT = path.resolve('captures');
const ARTIFACTS = '/opt/cursor/artifacts/captures';

const swiftshader = [
  '--disable-gpu',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`));
    });
  });
}

function waitForPort(port, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, '127.0.0.1');
      socket.on('connect', () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) reject(new Error(`preview did not open port ${port}`));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

async function prep(page) {
  await page.addInitScript(() => {
    localStorage.setItem('untitled-settings', JSON.stringify({
      muted: true,
      volume: 0,
      quality: 'medium',
      reducedMotion: 'off',
      showGhost: false,
    }));
  });
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file });
  console.log(`[capture] ${name}`);
  return file;
}

function which(command) {
  return new Promise((resolve) => {
    const child = spawn('which', [command], { stdio: 'ignore' });
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function trimVideo(raw, loadMs) {
  const webm = path.join(OUT, 'demo.webm');
  const skip = Math.max(0, (loadMs - 400) / 1000);
  if (await which('ffmpeg')) {
    await run('ffmpeg', [
      '-y',
      '-ss', skip.toFixed(2),
      '-i', raw,
      '-t', '60',
      '-an',
      '-c', 'copy',
      webm,
    ]);
    fs.rmSync(raw, { force: true });
    return webm;
  }
  fs.renameSync(raw, webm);
  return webm;
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  await run('npm', ['run', 'build']);

  const preview = spawn('npx', [
    'vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort',
  ], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const previewLog = [];
  const echo = (chunk) => {
    const text = chunk.toString();
    previewLog.push(text);
    process.stdout.write(text);
  };
  preview.stdout.on('data', echo);
  preview.stderr.on('data', echo);

  try {
    await waitForPort(PORT, 30_000);
    if (preview.exitCode != null) {
      throw new Error(`preview stopped before it was ready\n${previewLog.join('')}`);
    }
    const browser = await chromium.launch({ args: swiftshader });
    const origin = `http://127.0.0.1:${PORT}`;

    const stills = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
    });
    const menu = await stills.newPage();
    await prep(menu);
    await menu.goto(`${origin}/?date=${DATE}`);
    await menu.waitForSelector('#menu-title');
    await menu.waitForTimeout(600);
    await shot(menu, '01-title.png');
    await menu.locator('#menu-about').click();
    await menu.waitForSelector('#about-lead');
    await shot(menu, '02-about.png');
    await stills.close();

    const filming = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } },
    });
    const page = await filming.newPage();
    await prep(page);
    const started = Date.now();
    await page.goto(`${origin}/?play=1&autopilot=1&date=${DATE}`);
    await page.waitForSelector('#hud', { timeout: 60_000 });
    const loadMs = Date.now() - started;
    console.log(`[capture] flight visible after ${loadMs} ms`);
    await page.waitForTimeout(2000);
    await shot(page, '03-airborne.png');

    await page.waitForFunction(() => {
      const text = document.querySelector('#hud-gates')?.textContent || '0/0';
      return Number(text.split('/')[0]) >= 1;
    }, null, { timeout: 25_000 }).catch(() => console.log('[capture] opening ring not seen yet'));
    await shot(page, '04-ring.png');

    await page.waitForFunction(() => {
      const text = document.querySelector('#hud-gates')?.textContent || '0/0';
      return Number(text.split('/')[0]) >= 3;
    }, null, { timeout: 40_000 }).catch(() => console.log('[capture] mid-route rings not seen yet'));
    await shot(page, '05-route.png');

    const finished = await page.waitForSelector('#results', { state: 'visible', timeout: 70_000 })
      .then(() => true)
      .catch(() => false);
    if (finished) {
      await page.waitForTimeout(1200);
      await shot(page, '06-results.png');
      await page.waitForTimeout(2200);
    } else {
      await shot(page, '06-flight.png');
      console.log('[capture] route did not finish inside the recording window');
    }
    const gates = finished
      ? await page.locator('#results-gates').textContent()
      : await page.locator('#hud-gates').textContent().catch(() => '');
    const score = finished ? await page.locator('#results-score').textContent() : '';
    console.log(`[capture] gates ${gates || 'n/a'} score ${score || 'n/a'}`);

    const video = page.video();
    await page.close();
    await filming.close();
    const raw = await video.path();
    await browser.close();
    const webm = await trimVideo(raw, loadMs);
    const stat = fs.statSync(webm);
    console.log(`[capture] ${webm} ${stat.size} bytes`);

    fs.mkdirSync(ARTIFACTS, { recursive: true });
    for (const name of fs.readdirSync(OUT)) {
      fs.copyFileSync(path.join(OUT, name), path.join(ARTIFACTS, name));
      console.log(`[capture] artifact ${path.join(ARTIFACTS, name)}`);
    }
  } finally {
    try {
      process.kill(-preview.pid, 'SIGTERM');
    } catch {
      preview.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
