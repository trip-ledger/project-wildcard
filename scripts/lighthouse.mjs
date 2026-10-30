import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import lighthouse, { desktopConfig } from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const port = 4173;
const origin = `http://127.0.0.1:${port}`;
const url = `${origin}/?date=2026-06-15`;
const chromeFlags = [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
];

function findPlaywrightChrome() {
  const root = path.join(homedir(), '.cache', 'ms-playwright');
  if (!existsSync(root)) return '';
  const stacks = [];
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith('chromium-')) continue;
    const candidate = path.join(root, entry, 'chrome-linux64', 'chrome');
    if (existsSync(candidate)) stacks.push(candidate);
  }
  return stacks.sort().at(-1) || '';
}

function resolveChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const candidate of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (existsSync(candidate)) return candidate;
  }
  const playwright = findPlaywrightChrome();
  if (playwright) return playwright;
  throw new Error('No Chrome binary found. Set CHROME_PATH or install Google Chrome.');
}

async function previewUp() {
  try {
    const response = await fetch(origin, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForPreview(child) {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (child.exitCode != null) throw new Error(`vite preview exited ${child.exitCode}`);
    if (await previewUp()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('vite preview did not start on port 4173');
}

function scoreRow(label, result) {
  const categories = result.lhr.categories;
  const audits = result.lhr.audits;
  const read = (id) => Math.round(categories[id].score * 100);
  const metric = (id) => audits[id].displayValue || '';
  return {
    label,
    performance: read('performance'),
    accessibility: read('accessibility'),
    bestPractices: read('best-practices'),
    fcp: metric('first-contentful-paint'),
    lcp: metric('largest-contentful-paint'),
    tbt: metric('total-blocking-time'),
    cls: metric('cumulative-layout-shift'),
    si: metric('speed-index'),
  };
}

async function runOnce(chrome, label, config) {
  const result = await lighthouse(url, {
    port: chrome.port,
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices'],
    output: 'json',
  }, config);
  if (!result) throw new Error(`Lighthouse returned no result for ${label}`);
  return scoreRow(label, result);
}

if (!existsSync('dist/index.html')) {
  console.error('dist/index.html is missing. Run npm run build first.');
  process.exit(1);
}

let preview = null;
if (!(await previewUp())) {
  preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port)], {
    stdio: 'inherit',
  });
  await waitForPreview(preview);
}

const chrome = await chromeLauncher.launch({
  chromePath: resolveChrome(),
  chromeFlags,
});

try {
  const desktop = await runOnce(chrome, 'desktop', desktopConfig);
  const mobile = await runOnce(chrome, 'mobile', undefined);
  const rows = [desktop, mobile];
  console.log('');
  console.log('| Form | Performance | Accessibility | Best Practices | FCP | LCP | TBT | CLS | SI |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const row of rows) {
    console.log(`| ${row.label} | ${row.performance} | ${row.accessibility} | ${row.bestPractices} | ${row.fcp} | ${row.lcp} | ${row.tbt} | ${row.cls} | ${row.si} |`);
  }
  console.log('');
  console.log('Software WebGL via SwiftShader. Scores are one lab run each, so a point or two of movement is normal.');
  const low = rows.filter((row) => row.performance < 85 || row.accessibility < 85 || row.bestPractices < 85);
  if (low.length) {
    console.log(`Under 85: ${low.map((row) => `${row.label} (performance ${row.performance}, accessibility ${row.accessibility}, best practices ${row.bestPractices})`).join('; ')}`);
  }
} finally {
  await chrome.kill();
  if (preview) preview.kill('SIGTERM');
}
