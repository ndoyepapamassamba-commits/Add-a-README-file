// DEMO — renders the synthetic committee dossier in a theme: node scripts via tsx scripts/dossier-demo.ts <outDir> [theme]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setActiveTheme, type ThemeId } from '../server/services/houseDesign';
import { exampleDossier } from '../server/services/dossier/exemple';
import { dossierPptx } from '../server/services/dossier/dossierPptx';
import { dossierDocx } from '../server/services/dossier/dossierDocx';
import { dossierXlsx } from '../server/services/dossier/dossierXlsx';
import { dossierHtml, dossierMailHtml } from '../server/services/dossier/dossierHtml';

const out = process.argv[2] ?? 'scratch/dossier';
const theme = (process.argv[3] ?? 'comite') as ThemeId;
mkdirSync(out, { recursive: true });
setActiveTheme(theme);
const d = exampleDossier();
const t0 = Date.now();
writeFileSync(join(out, `dossier-${theme}.pptx`), dossierPptx(d));
console.log(`pptx ok (${Date.now() - t0} ms) → ${out}/dossier-${theme}.pptx`);
const t1 = Date.now();
writeFileSync(join(out, `dossier-${theme}.docx`), dossierDocx(d));
console.log(`docx ok (${Date.now() - t1} ms) → ${out}/dossier-${theme}.docx`);
const t2 = Date.now();
writeFileSync(join(out, `dossier-${theme}.xlsx`), dossierXlsx(d));
console.log(`xlsx ok (${Date.now() - t2} ms) → ${out}/dossier-${theme}.xlsx`);
writeFileSync(join(out, `dossier-${theme}.html`), dossierHtml(d));
writeFileSync(join(out, `dossier-${theme}.mail.html`), dossierMailHtml(d));
console.log(`html + mail ok → ${out}/dossier-${theme}.html`);
