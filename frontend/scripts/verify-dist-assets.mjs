/**
 * Verifies dist/index.html references exist on disk (catches partial deploys / stale HTML).
 * Run from frontend/: node scripts/verify-dist-assets.mjs
 * Optional: OTODIAL_DIST_DIR=dist.next.123 (relative to frontend root)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sub = (process.env.OTODIAL_DIST_DIR || 'dist').replace(/\\/g, '/').replace(/^\/+/, '');
const distRoot = join(root, sub);
const indexPath = join(distRoot, 'index.html');

const FORBIDDEN = [
  'OTODIAL is still starting',
  'hard refresh',
  'Ctrl+Shift+R',
  'otodial-boot-splash',
];

if (!existsSync(indexPath)) {
  console.error('[verify-dist] missing', indexPath);
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');

for (const needle of FORBIDDEN) {
  if (html.includes(needle)) {
    console.error('[verify-dist] forbidden legacy string in index.html:', JSON.stringify(needle));
    process.exit(1);
  }
}

const refs = new Set();
const re = /(?:src|href)="(\/assets\/[^"]+)"/g;
let m;
while ((m = re.exec(html)) !== null) {
  refs.add(m[1]);
}

let failed = false;
for (const rel of refs) {
  const abs = join(distRoot, rel.replace(/^\//, ''));
  if (!existsSync(abs)) {
    console.error('[verify-dist] missing asset:', rel, '→', abs);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log('[verify-dist] OK', refs.size, 'asset(s) from', indexPath);
