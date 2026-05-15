import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8')
);

export default defineConfig({
  define: {
    __OTODIAL_WEB_VERSION__: JSON.stringify(pkg.version || '0.0.0'),
  },
  plugins: [react()],
  // Base path for production (same-origin behind Nginx at https://otodial.com/)
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router')) return 'router';
          if (id.includes('react-dom') || id.includes('/react/')) return 'react-core';
          if (id.includes('@telnyx')) return 'telnyx-webrtc';
          if (id.includes('recharts')) return 'recharts';
          if (id.includes('react-simple-maps')) return 'maps';
          if (id.includes('topojson')) return 'maps';
          if (id.includes('d3-')) return 'maps';
          if (id.includes('quill')) return 'quill-editor';
          if (id.includes('socket.io-client')) return 'socket-io';
          if (id.includes('framer-motion')) return 'framer-motion';
          if (id.includes('axios')) return 'axios';
          if (id.includes('lucide-react')) return 'icons';
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});

