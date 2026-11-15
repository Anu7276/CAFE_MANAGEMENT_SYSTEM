import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Automatically computes Vite bundle hash and injects it into dist/sw.js
 * so new deployments automatically trigger the PWA update flow.
 */
function pwaVersionPlugin() {
  let bundleHash = '';
  return {
    name: 'pwa-version-plugin',
    generateBundle(_, bundle) {
      const hash = crypto.createHash('sha256');
      const fileKeys = Object.keys(bundle).sort();
      for (const key of fileKeys) {
        hash.update(key);
        if (bundle[key].code) {
          hash.update(bundle[key].code);
        }
      }
      bundleHash = hash.digest('hex').slice(0, 10);
    },
    closeBundle() {
      const swDistPath = path.resolve(__dirname, 'dist/sw.js');
      if (fs.existsSync(swDistPath)) {
        let swContent = fs.readFileSync(swDistPath, 'utf8');
        swContent = swContent.replace(/__SW_CACHE_VERSION__/g, bundleHash);
        fs.writeFileSync(swDistPath, swContent, 'utf8');
        console.log(`[PWA Plugin] Automatically stamped dist/sw.js cache version: emerald-build-${bundleHash}`);
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), pwaVersionPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});
