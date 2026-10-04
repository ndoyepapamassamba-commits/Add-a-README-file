import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { loadHouseKit } from './server/services/houseKitFs';

// The user's house kit (logo, 3D export kit, app shell) is read from their own
// skill folder at build time and embedded in the HTML — never committed.
function houseKit(): Plugin {
  const id = 'virtual:house-kit';
  return {
    name: 'massamba-house-kit',
    resolveId: (s) => (s === id ? `\0${id}` : null),
    load(s) {
      if (s !== `\0${id}`) return null;
      const kit = loadHouseKit();
      this.info(
        kit ? `kit maison intégré (${kit.source})` : 'kit maison absent : APEX Studio en mode générique',
      );
      return `export default ${JSON.stringify(kit)};`;
    },
  };
}

// "Direct" edition: one self-contained HTML file that talks to OpenRouter from
// the browser — no server, no install, no terminal.
export default defineConfig({
  root: 'direct',
  plugins: [houseKit(), react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
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
