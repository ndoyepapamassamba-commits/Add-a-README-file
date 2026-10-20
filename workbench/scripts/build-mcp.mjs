// SERVEUR MCP « massamba » (v63) : un seul fichier Node (dist/mcp/massamba-mcp.mjs) + l'extension Claude Desktop
// (dist/mcp/massamba-jev.mcpb : manifest.json + server/index.mjs, format MCPB — installation par double-clic, Claude
// Desktop fournit Node). Aucune clé, aucun compte.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { zipSync, strToU8 } from 'fflate';

const OUT = path.join('dist', 'mcp');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'massamba-mcp.mjs');
await build({
  entryPoints: ['server/mcp/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: file,
  minify: true,
  legalComments: 'inline',
  // CommonJS dependencies (xlsx, papaparse…) inside an ES module.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
const code = fs.readFileSync(file);

const TOOLS = [
  ['jev_recherche_web', 'Recherche web gratuite sans clé (Exa, Parallel, Tavily, Firecrawl).'],
  ['jev_lire_page', 'Lit 1 à 5 pages web ou PDF en entier.'],
  ['jev_bibliotheque', 'Bibliothèque mondiale JEV : 19 sources publiques, tous domaines.'],
  ['jev_taux_bce', 'Taux de référence BCE + franc CFA (parité fixe).'],
  ['jev_fiche_entite', 'Fiche Wikidata d’une banque, d’un groupe, d’une entreprise.'],
  ['jev_prepublications', 'Working papers SSRN / arXiv.'],
  ['jev_analyse_fichier', 'Analyse LOCALE d’un fichier Excel / CSV (rien n’est envoyé).'],
  ['jev_dossier_comite', 'Dossier comité Excel + Word + PowerPoint écrit à côté du fichier.'],
];
const manifest = {
  manifest_version: '0.2',
  name: 'massamba-jev',
  display_name: 'MASSAMBA — JEV',
  version: '63.0.0',
  description: 'Les outils de JEV (MASSAMBA Workbench) dans Claude : recherche et lecture Internet gratuites, bibliothèque mondiale, taux BCE + F CFA, fiches d’entreprises, prépublications, analyse locale de fichiers Excel et dossier comité — sans clé, données gardées sur l’ordinateur.',
  author: { name: 'MASSAMBA Workbench' },
  server: { type: 'node', entry_point: 'server/index.mjs', mcp_config: { command: 'node', args: ['${__dirname}/server/index.mjs'] } },
  tools: TOOLS.map(([name, description]) => ({ name, description })),
  compatibility: { platforms: ['win32', 'darwin', 'linux'], runtimes: { node: '>=18.0.0' } },
};
const mcpb = zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest, null, 2)), 'server/index.mjs': new Uint8Array(code) }, { level: 9 });
fs.writeFileSync(path.join(OUT, 'massamba-jev.mcpb'), mcpb);
console.log(`mcp : ${file} ${(code.length / 1048576).toFixed(1)} Mio · ${path.join(OUT, 'massamba-jev.mcpb')} ${(mcpb.length / 1048576).toFixed(1)} Mio`);
