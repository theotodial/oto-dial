/**
 * Verifies dist/index.html references exist on disk (catches partial deploys / stale HTML).
 * Run from frontend/: node scripts/verify-dist-assets.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const indexPath = join(root, 'dist', 'index.html');

if (!existsSync(indexPath)) {
  console.error('[verify-dist] missing', indexPath);
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
const refs = new Set();
const re = /(?:src|href)="(\/assets\/[^"]+)"/g;
let m;
while ((m = re.exec(html)) !== null) {
  refs.add(m[1]);
}

let failed = false;
for (const rel of refs) {
  const abs = join(root, 'dist', rel.replace(/^\//, ''));
  if (!existsSync(abs)) {
    console.error('[verify-dist] missing asset:', rel, '→', abs);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log('[verify-dist] OK', refs.size, 'asset(s) from index.html');
