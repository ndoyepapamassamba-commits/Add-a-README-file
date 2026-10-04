import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// "Direct" edition: one self-contained HTML file that talks to OpenRouter from
// the browser — no server, no install, no terminal.
export default defineConfig({
  root: 'direct',
  plugins: [react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: '../dist/direct',
    emptyOutDir: true,
    chunkSizeWarningLimit: 20000,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
  server: { port: 5174 },
});
