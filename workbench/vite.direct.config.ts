import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import { loadHouseKit } from './server/services/houseKitFs';
import { packFileName, packText, splitDecors, type PackDecor } from './server/jev/videogen/troupePack';

// The user's house kit (logo, 3D export kit, app shell) is read from their own
// skill folder at build time and embedded in the HTML — never committed.
// three.js as one minified IIFE (global THREE), embedded in the 3D previews.
const threeVersion = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('./node_modules/three/package.json', import.meta.url)), 'utf8'),
  ) as { version: string }
).version;
function threeIife(): Plugin {
  const id = 'virtual:three-iife';
  return {
    name: 'massamba-three-iife',
    resolveId: (s) => (s === id ? `\0${id}` : null),
    async load(s) {
      if (s !== `\0${id}`) return null;
      const { build } = await import('esbuild');
      const r = await build({
        stdin: {
          contents:
            "export * from 'three'; export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'; export { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'; export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'; export { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'; export { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';",
          resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        },
        bundle: true,
        format: 'iife',
        globalName: 'THREE',
        minify: true,
        write: false,
        // DRACOLoader locates its decoders from import.meta.url at load time: in an IIFE that is empty and would abort
        // the whole bundle — the decoders of the SAME three.js version on jsDelivr are used instead.
        define: {
          'import.meta.url': JSON.stringify(
            `https://cdn.jsdelivr.net/npm/three@${threeVersion}/examples/jsm/loaders/DRACOLoader.js`,
          ),
        },
      });
      return `export default ${JSON.stringify(r.outputFiles[0]!.text)};`;
    },
  };
}

// cannon-es (MIT) as one minified IIFE (global CANNON): the physics of the 3D Studio sandbox.
function cannonIife(): Plugin {
  const id = 'virtual:cannon-iife';
  return {
    name: 'massamba-cannon-iife',
    resolveId: (s) => (s === id ? `\0${id}` : null),
    async load(s) {
      if (s !== `\0${id}`) return null;
      const { build } = await import('esbuild');
      const r = await build({
        stdin: {
          contents: "export * from 'cannon-es';",
          resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        },
        bundle: true,
        format: 'iife',
        globalName: 'CANNON',
        minify: true,
        write: false,
      });
      return `export default ${JSON.stringify(r.outputFiles[0]!.text)};`;
    },
  };
}

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

// The owner's troupe (character sheets, green galleries, empty sets — their own art) is read from the git-ignored
// .private/troupe folder at build time and embedded in the HTML, never committed (the repository is public).
// MASSAMBA_TROUPE_PACKS=1 (npm run build:direct:packs): the sets go to massamba-troupe-N.js files (< 30 MB each) next
// to the app instead of inside it — the full app is too big to be sent as one file.
function troupeKit(): Plugin {
  const id = 'virtual:troupe-kit';
  let packs: string[] = [];
  return {
    name: 'massamba-troupe-kit',
    writeBundle(o) {
      if (!packs.length || !o.dir) return;
      mkdirSync(o.dir, { recursive: true });
      packs.forEach((t, i) => writeFileSync(`${o.dir}/${packFileName(i + 1)}`, t));
      this.info(`décors rangés dans ${packs.length} paquet(s) : ${packs.map((t, i) => `${packFileName(i + 1)} ${(t.length / 1e6).toFixed(1)} Mo`).join(', ')}`);
    },
    resolveId: (s) => (s === id ? `\0${id}` : null),
    load(s) {
      if (s !== `\0${id}`) return null;
      const dir = fileURLToPath(new URL('./.private/troupe/', import.meta.url));
      let kit: unknown = null;
      if (existsSync(dir + 'manifest.json') && !process.env.MASSAMBA_NO_TROUPE) {
        const man = JSON.parse(readFileSync(dir + 'manifest.json', 'utf8')) as {
          planches?: { name: string; file: string; faces?: unknown[]; bodies?: unknown[] }[];
          galeries?: { file: string; names: string[]; faces?: unknown[]; bodies?: unknown[] }[];
          decors?: {
            name: string;
            file: string;
            hd?: string;
            depth?: string;
            people?: string;
            seg?: string;
            floor?: string;
            fit?: unknown;
            plate?: string;
            plateDepth?: string;
            masks?: string;
          }[];
        };
        const hash = createHash('sha256');
        const src = (f: string) => {
          const b = readFileSync(dir + f);
          hash.update(f).update(b);
          return `data:image/${/\.png$/i.test(f) ? 'png' : 'jpeg'};base64,${b.toString('base64')}`;
        };
        const planches = (man.planches ?? []).map((p) => ({
          name: p.name,
          src: src(p.file),
          faces: p.faces ?? [],
          bodies: p.bodies ?? [],
        }));
        const galeries = (man.galeries ?? []).map((g) => ({
          src: src(g.file),
          names: g.names,
          faces: g.faces ?? [],
          bodies: g.bodies ?? [],
        }));
        // The set enlarged ×4 (Swin2SR), its depth map (Depth Anything V2), its scene parse and walkable floor (UperNet
        // ADE20K — the « sol praticable » law) when scripts/troupe-enhance.py made them.
        const has = (f?: string) => !!f && existsSync(dir + f);
        // (The scene parse and floor maps stay in the private folder: the app does not read them.)
        const decors: PackDecor[] = (man.decors ?? []).map((d) => ({
          name: d.name,
          src: src(has(d.hd) ? d.hd! : d.file),
          ...(has(d.depth) ? { depth: src(d.depth!) } : {}),
          ...(has(d.people) ? { people: src(d.people!) } : {}),
          // Layers (scripts/troupe-plates.py): the set rebuilt behind its people (LaMa), its depth, the masks.
          ...(has(d.plate) && has(d.plateDepth) && has(d.masks) ? { plate: src(d.plate!), plateDepth: src(d.plateDepth!), masks: src(d.masks!) } : {}),
          ...(d.fit ? { fit: d.fit } : {}),
        }));
        hash.update(JSON.stringify(man));
        const version = hash.digest('hex').slice(0, 16);
        if (process.env.MASSAMBA_TROUPE_PACKS) {
          const groups = splitDecors(decors);
          packs = groups.map((g, i) => packText({ kind: 'massamba-troupe', version, part: i + 1, of: groups.length, decors: g }));
          kit = { version, planches, galeries, decors: [], packs: { version, count: groups.length, decors: decors.length } };
        } else kit = { version, planches, galeries, decors };
        this.info(
          `troupe intégrée : ${planches.length} planche(s), ${galeries.length} galerie(s), ${decors.length} décor(s)${packs.length ? ` (décors en ${packs.length} paquets à côté de l’app)` : ''}`,
        );
      } else this.info('troupe absente : aucun personnage embarqué');
      return `export default ${JSON.stringify(kit)};`;
    },
  };
}

// "Direct" edition: one self-contained HTML file that talks to OpenRouter from
// the browser — no server, no install, no terminal.
export default defineConfig({
  root: 'direct',
  plugins: [
    houseKit(),
    troupeKit(),
    threeIife(),
    cannonIife(),
    react(),
    tailwindcss(),
    viteSingleFile({ removeViteModuleLoader: true }),
  ],
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
