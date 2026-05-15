import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sub = (process.env.OTODIAL_DIST_DIR || 'dist').replace(/\\/g, '/').replace(/^\/+/, '');
const dist = join(root, sub);

if (existsSync(dist)) {
  rmSync(dist, { recursive: true, force: true });
  console.log('[prebuild] removed', dist);
} else {
  console.log('[prebuild] no dir to remove:', dist);
}
