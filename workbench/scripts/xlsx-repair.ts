/**
 * Répare un classeur sorti d'une ancienne version (segments orphelins, tableau de bord perdu) et, si une feuille de
 * données est lisible, reconstruit le tableau de bord vivant dessus puis met toutes les feuilles au design Maison 2
 * (bande KPI + graphiques natifs avant l'en-tête, couleurs du thème).
 *
 *   npx tsx scripts/xlsx-repair.ts <entrée.xlsx> --out <réparé.xlsx> [--strip <sans-tableau.xlsx>]
 *        [--live <tableau-vivant.xlsx>] [--sheet <nom de feuille>] [--spec spec.json]
 *        [--theme <#primaire,#accent,#sombre>] [--maison <maison2.xlsx>]
 *
 * Sans spec.json, le design de test (tests/fixtures/dashSpec.ts) est utilisé, avec la palette du thème si donnée —
 * ce n'est pas le design choisi par l'utilisateur, seulement une démonstration que la chaîne fonctionne.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { excelStrict } from '../server/services/excelStrict';
import { addLiveDashboard, removeLiveDashboard } from '../server/services/liveDash';
import { cloneData, dashFit } from '../server/services/dashRender';
import { restyleWorkbook } from '../server/services/officeRestyle';
import { maisonBand } from '../server/services/maisonBand';
import { buildTheme } from '../server/services/houseDesign';
import { designQA } from '../server/services/designQA';
import { designGate } from '../server/services/designGate';
import type { DashSpec } from '../server/services/dashClone';

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!input || !opt('out')) {
  console.error('usage: xlsx-repair <entrée.xlsx> --out <réparé.xlsx> [--strip f] [--live f] [--sheet s] [--spec f] [--theme p,a,d] [--maison f]');
  process.exit(2);
}
const bytes = new Uint8Array(readFileSync(input));
const z = unzipSync(bytes);
const { fixes, warnings } = excelStrict(z);
console.log('corrections :', fixes.length ? fixes : ['aucune']);
if (warnings.length) console.log('avertissements :', warnings);
const repaired = zipSync(z, { level: 6 });
writeFileSync(opt('out')!, repaired);
console.log('écrit :', opt('out'), repaired.length, 'octets');

if (opt('strip')) {
  const stripped = removeLiveDashboard(bytes) ?? repaired;
  writeFileSync(opt('strip')!, stripped);
  console.log('écrit (sans tableau vivant) :', opt('strip'), stripped.length, 'octets');
}

const theme = opt('theme')?.split(',');
const custom = theme ? { primary: theme[0]!, accent: theme[1] ?? theme[0]!, dark: theme[2] ?? theme[0]! } : null;
let out: Uint8Array = repaired;
if (opt('live')) {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true, dense: true });
  const wanted = opt('sheet');
  // The data sheet: the one asked for; else a sheet named « Données » / « 7. Données » (the analysed rows), before
  // « Données filtrables » (the raw copy) and « 6. Qualité données » (a control table); ties go to the largest.
  const rowsOf = (s: string) => XLSX.utils.decode_range(wb.Sheets[s]!['!ref'] ?? 'A1').e.r;
  const exact = (s: string) => (/^(?:\d+\.\s*)?donn[ée]es$/i.test(s.trim()) ? 0 : 1);
  const name = wanted
    ? wb.SheetNames.find((s) => s.toLowerCase().includes(wanted.toLowerCase()))
    : wb.SheetNames.filter((s) => /donn/i.test(s)).sort((a, b) => exact(a) - exact(b) || rowsOf(b) - rowsOf(a))[0];
  if (!name) throw new Error(`feuille de données introuvable parmi ${wb.SheetNames.join(', ')}`);
  const ws = wb.Sheets[name]!;
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true, blankrows: false });
  const headerIdx = matrix.findIndex((r) => r.filter((c) => c !== null && c !== '').length >= Math.max(2, Math.ceil(r.length / 2)));
  const header = (matrix[headerIdx] ?? []).map((h, i) => (h === null || h === '' ? `Colonne ${i + 1}` : String(h)));
  const rows = matrix.slice(headerIdx + 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? null])));
  console.log('feuille', name, ':', header.length, 'colonnes,', rows.length, 'lignes');
  let spec: DashSpec = opt('spec') ? JSON.parse(readFileSync(opt('spec')!, 'utf8')) : (await import('../tests/fixtures/dashSpec')).SPEC;
  if (custom) spec = { ...spec, palette: { primary: custom.primary, accent: custom.accent, dark: custom.dark, series: [custom.primary, custom.accent] }, panels: spec.panels.map((p) => ({ ...p, colors: [custom.primary, custom.accent], ramp: [custom.dark, custom.accent], tileFills: p.tileFills ? [custom.primary, custom.accent, custom.dark, custom.primary] : p.tileFills })) };
  const cd = cloneData('Provisions', header, rows);
  console.log('dashFit :', dashFit(cd));
  const live = addLiveDashboard(repaired, spec, cd);
  if (!live) throw new Error('tableau de bord non construit');
  console.log('tableau vivant :', { kpis: live.kpis, charts: live.charts, filters: live.filters, links: live.links, tables: live.tables });
  out = live.bytes;
  writeFileSync(opt('live')!, out);
  console.log('écrit :', opt('live'), out.length, 'octets');
}
if (opt('maison')) {
  const design = buildTheme(custom ?? 'house');
  const skip = new Set(['Tableau de bord', 'Tableau de bord vivant', 'Données du tableau de bord', 'Données filtrables']);
  const rs = restyleWorkbook(out, { dark: `#${design.color.navy}`, primary: `#${design.color.blue}`, accent: `#${design.color.gold}`, font: design.font.ui }, skip);
  if (rs) {
    out = rs.bytes;
    console.log('Maison 2.0 (bandes, en-têtes, zébrures, police) :', rs.sheets);
  }
  const mb = maisonBand(out, design, skip);
  if (mb) {
    out = mb.bytes;
    console.log('bande KPI + graphiques avant en-tête :', mb.banded, '— graphiques déplacés', mb.moved, 'créés', mb.created);
  }
  const qa = designQA('x.xlsx', out);
  if (qa) {
    out = qa.data as Uint8Array;
    console.log('contrôle design :', qa.fixes, qa.warnings);
  }
  const gate = designGate(out, design, { skip });
  if (gate) {
    out = gate.bytes;
    console.log('porte de design :', gate.score, '/ 100 —', gate.fixed, gate.failed.length ? gate.failed : 'rien de bloquant');
  }
  // Safety net after every pass: text written as a formula, French formulas, missing _xlfn. prefixes.
  const zf = unzipSync(out);
  const fin = excelStrict(zf);
  if (fin.fixes.length) {
    out = zipSync(zf, { level: 6 });
    console.log('corrections finales :', fin.fixes);
  }
  const wbx = strFromU8(unzipSync(out)['xl/workbook.xml']!);
  console.log('feuilles :', [...wbx.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1]));
  writeFileSync(opt('maison')!, out);
  console.log('écrit :', opt('maison'), out.length, 'octets');
}
