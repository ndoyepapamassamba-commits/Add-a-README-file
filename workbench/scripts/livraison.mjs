// LIVRAISON — consignes de l'utilisateur (15/10/2026) : « tu livreras désormais l'app avec les paquets », puis
// « limiter la règle aux livrables modifiés seulement ».
// Assemble dist/livraison/MASSAMBA Workbench/ (le dossier complet : app, serveur MCP, LISEZ-MOI.txt) et
// dist/livraison/A ENVOYER/ : SEULEMENT les fichiers qui diffèrent de la dernière livraison envoyée (empreintes gardées
// dans .private/livraison-envoyee.json, ignoré par git). Contrôle bloquant : chaque fichier sous 30 Mio. Depuis le
// 16/10/2026 les paquets de décors (massamba-troupe-N.js) appartiennent à l'application Studio Vidéo (studio-video/).
//   node scripts/livraison.mjs            → prépare « A ENVOYER » (fichiers modifiés)
//   node scripts/livraison.mjs --complet  → « A ENVOYER » = tout le dossier (première fois, dossier perdu)
//   node scripts/livraison.mjs --envoyee  → enregistre la livraison qui vient d'être envoyée
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const STATE = path.join('.private', 'livraison-envoyee.json');
const SEND = path.join('dist', 'livraison', 'A ENVOYER');
const LIMIT = 30 * 1024 * 1024; // limite d'envoi d'un fichier
const WARN = 27 * 1024 * 1024; // marge : au-delà, prévoir de déplacer du contenu de l'app vers les paquets
const APP = 'massamba-workbench-direct.html';
const OUT = path.join('dist', 'livraison', 'MASSAMBA Workbench');

if (!fs.existsSync(path.join('dist', APP))) {
  console.error(`livraison : dist/${APP} absent — lancez d'abord la construction`);
  process.exit(1);
}
const packs = []; // les décors de la troupe sont livrés avec Studio Vidéo
// v63: the « massamba » MCP server (JEV's tools in Claude Desktop / Claude Code), when built.
const MCP = ['massamba-jev.mcpb', 'massamba-mcp.mjs'].filter((f) => fs.existsSync(path.join('dist', 'mcp', f)));
const files = [APP, ...packs, ...MCP];
const srcOf = (f) => (MCP.includes(f) ? path.join('dist', 'mcp', f) : path.join('dist', f));

const errors = [];

fs.rmSync(path.dirname(OUT), { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const rows = [];
for (const f of files) {
  const src = srcOf(f);
  const dst = path.join(OUT, f);
  try {
    fs.linkSync(src, dst); // no extra disk space
  } catch {
    fs.copyFileSync(src, dst);
  }
  const size = fs.statSync(src).size;
  const sha = createHash('sha256').update(fs.readFileSync(src)).digest('hex');
  rows.push({ f, size, sha });
  if (size > LIMIT) errors.push(`${f} : ${(size / 1048576).toFixed(1)} Mio dépasse la limite d'envoi de 30 Mio`);
  // The packs are split automatically under the limit; the app itself grows with each version.
  else if (f === APP && size > WARN) console.warn(`livraison : attention, l'app approche la limite (${(size / 1048576).toFixed(1)} Mio)`);
}

// The notice changes only when its text does (no date, no app fingerprint): it is sent again only then.
const notice = [
  'MASSAMBA WORKBENCH - DOSSIER A ENREGISTRER SUR LE BUREAU',
  '',
  'INSTALLATION (premiere fois)',
  '1. Sur le Bureau, creez un dossier nomme : MASSAMBA Workbench',
  `2. Enregistrez-y ${APP} et ce fichier, sans les renommer.`,
  `3. Double-cliquez sur ${APP} (Chrome ou Edge conseilles).`,
  '',
  'MISES A JOUR',
  'Une livraison ne contient que les fichiers modifies : remplacez seulement ceux-la dans le dossier.',
  '',
  'CHANGEMENT DU 16/10/2026 : LA VIDEO A SA PROPRE APPLICATION',
  'Film Autopilot, Video IA, Realisation, Studio 3D, le moteur de la troupe et le pont Blender sont',
  'maintenant dans MASSAMBA Studio Video (livre a part). Workbench garde le chat, les agents, les analyses,',
  'les exports, JEV, les outils et Prompt Studio (rubrique Outils).',
  '- Les fichiers massamba-troupe-1.js a massamba-troupe-4.js de ce dossier ne servent plus a Workbench :',
  '  deplacez-les dans le dossier MASSAMBA Studio Video.',
  '- Vos projets video sont repris automatiquement par Studio Video a son premier lancement.',
  '',
  ...(MCP.length
    ? [
        'JEV DANS CLAUDE (FACULTATIF) - SERVEUR MCP MASSAMBA',
        '- Claude Desktop : double-cliquez sur massamba-jev.mcpb (ou Reglages > Extensions > Installer).',
        '- Claude Code : claude mcp add massamba -- node "<chemin>/massamba-mcp.mjs"',
        '- Outils : recherche et lecture Internet gratuites, bibliotheque mondiale, taux BCE + F CFA,',
        '  fiches d entreprises, prepublications, analyse LOCALE de fichiers Excel et dossier comite.',
        '- Aucune cle. Les fichiers analyses restent sur l ordinateur.',
        '',
      ]
    : []),
].join('\r\n');
fs.writeFileSync(path.join(OUT, 'LISEZ-MOI.txt'), notice);
rows.push({ f: 'LISEZ-MOI.txt', size: Buffer.byteLength(notice), sha: createHash('sha256').update(notice).digest('hex') });

for (const r of rows) console.log(`livraison : ${r.f} ${(r.size / 1048576).toFixed(1)} Mio`);
if (errors.length) {
  console.error(`livraison REFUSÉE :\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

// What the user already has: the last delivery sent (fingerprints). Only what differs goes out.
let sent = {};
try {
  sent = JSON.parse(fs.readFileSync(STATE, 'utf8')).files ?? {};
} catch {
  /* nothing recorded yet: everything is new */
}
if (args.has('--envoyee')) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ at: new Date().toISOString(), files: Object.fromEntries(rows.map((r) => [r.f, r.sha])) }, null, 1));
  console.log(`livraison enregistrée comme envoyée (${rows.length} fichiers) → ${STATE}`);
  process.exit(0);
}
const toSend = args.has('--complet') ? rows : rows.filter((r) => sent[r.f] !== r.sha);
fs.rmSync(SEND, { recursive: true, force: true });
fs.mkdirSync(SEND, { recursive: true });
for (const r of toSend) {
  try {
    fs.linkSync(path.join(OUT, r.f), path.join(SEND, r.f));
  } catch {
    fs.copyFileSync(path.join(OUT, r.f), path.join(SEND, r.f));
  }
}
console.log(`livraison prête → ${OUT} (${rows.length} fichiers, chacun sous 30 Mio)`);
console.log(
  toSend.length
    ? `à envoyer (${toSend.length}) → ${SEND} : ${toSend.map((r) => r.f).join(', ')}${args.has('--complet') ? ' (dossier complet)' : ' — les autres fichiers du dossier de l’utilisateur restent valables'}`
    : 'à envoyer : rien, l’utilisateur a déjà ces fichiers',
);
