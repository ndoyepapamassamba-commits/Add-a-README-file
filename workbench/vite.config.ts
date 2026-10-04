import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

const apiTarget = `http://127.0.0.1:${process.env.PORT ?? 8787}`;

// The web client is built as ONE self-contained HTML file (dist/web/index.html,
// copied to dist/openrouter-workbench.html) that can be opened from disk and
// talks to the local agent server over HTTP.
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@web': fileURLToPath(new URL('./web', import.meta.url)),
    },
  },
  worker: { format: 'iife' },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 20000,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false, ws: true },
    },
  },
});
