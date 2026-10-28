import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Current production chunk is about 613KB (three.js plus this game).
// 800KB leaves room for the game to grow and still fails a second copy of three.js.
const JS_BUDGET_BYTES = 800_000;

const assets = path.resolve('dist/assets');
if (!fs.existsSync(assets)) {
  console.error('dist/assets is missing. Run npm run build first.');
  process.exit(1);
}

const files = fs.readdirSync(assets).filter((name) => name.endsWith('.js')).sort();
if (files.length === 0) {
  console.error('No JavaScript files in dist/assets.');
  process.exit(1);
}

let total = 0;
let gzipTotal = 0;
for (const name of files) {
  const file = path.join(assets, name);
  const bytes = fs.readFileSync(file);
  const gzip = zlib.gzipSync(bytes).length;
  total += bytes.length;
  gzipTotal += gzip;
  console.log(`[perf] ${name} ${bytes.length} bytes, gzip ${gzip}`);
}

console.log(`[perf] js bundle ${total} bytes, gzip ${gzipTotal} (budget ${JS_BUDGET_BYTES})`);
if (total > JS_BUDGET_BYTES) {
  console.error(`JS bundle ${total} exceeds budget ${JS_BUDGET_BYTES}`);
  process.exit(1);
}
