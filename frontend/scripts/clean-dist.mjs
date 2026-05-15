import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

if (existsSync(dist)) {
  rmSync(dist, { recursive: true, force: true });
  console.log('[prebuild] removed', dist);
} else {
  console.log('[prebuild] no dist to remove');
}
