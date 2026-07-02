import { cpSync, createReadStream, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8')
);

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const faceModelSource = resolve(rootDir, 'node_modules/@vladmandic/face-api/model');
const faceModelPublic = resolve(rootDir, 'public/face-api-model');

function faceApiModelPlugin() {
  return {
    name: 'face-api-model-static',
    configureServer(server) {
      server.middlewares.use('/face-api-model', (req, res, next) => {
        const rel = decodeURIComponent((req.url || '/').replace(/^\//, '').split('?')[0]);
        if (!rel || rel.includes('..')) {
          next();
          return;
        }
        const filePath = join(faceModelSource, rel);
        if (!existsSync(filePath)) {
          next();
          return;
        }
        if (rel.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
        else if (rel.endsWith('.bin')) res.setHeader('Content-Type', 'application/octet-stream');
        createReadStream(filePath).pipe(res);
      });
    },
    closeBundle() {
      try {
        cpSync(faceModelSource, faceModelPublic, { recursive: true });
        cpSync(faceModelPublic, resolve(rootDir, 'dist/face-api-model'), { recursive: true });
      } catch {
        // Models copy is best-effort; dev middleware still serves from node_modules.
      }
    },
  };
}

export default defineConfig({
  define: {
    __OTODIAL_WEB_VERSION__: JSON.stringify(pkg.version || '0.0.0'),
  },
  plugins: [react(), faceApiModelPlugin()],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  optimizeDeps: {
    include: [
      '@tensorflow/tfjs',
      '@tensorflow/tfjs-backend-webgl',
      '@vladmandic/face-api',
    ],
  },
});
