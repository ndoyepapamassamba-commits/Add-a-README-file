// Bundles the server (TypeScript) into dist/server/index.js with esbuild.
// Runtime dependencies stay external and are resolved from node_modules.
import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  alias: { '@shared': './shared' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
console.log('server bundled → dist/server/index.js');
