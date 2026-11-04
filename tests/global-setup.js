import fs from 'node:fs';

export default function globalSetup() {
  if (!fs.existsSync('dist/index.html')) {
    throw new Error('dist/index.html is missing. Run npm run build before npm run test:smoke.');
  }
}
