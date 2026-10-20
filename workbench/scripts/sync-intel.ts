// Refreshes server/llm/intelSnapshot.json from OpenRouter (model catalog +
// the Artificial Analysis indices shown on each model page). Usage:
//   npm run sync:intel            (live)
//   npx tsx scripts/sync-intel.ts benchmarks.json models.json   (offline files)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INTEL_ENDPOINT, parseIntel } from '../server/llm/modelIntel';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server/llm/intelSnapshot.json');
const [benchFile, modelsFile] = process.argv.slice(2);
const load = async (file: string | undefined, url: string) =>
  file ? JSON.parse(fs.readFileSync(file, 'utf8')) : (await fetch(url)).json();

const bench = await load(benchFile, INTEL_ENDPOINT);
const catalog = await load(modelsFile, 'https://openrouter.ai/api/v1/models');
const d = parseIntel(bench, catalog.data ?? []);
fs.writeFileSync(out, `${JSON.stringify(d)}\n`);
console.log(
  `${Object.keys(d.models).length} models scored, ${Object.keys(d.ids).length} catalog ids mapped → ${out}`,
);
