// Livrables d'essai au format CAC (dossier d'exemple, données synthétiques) dans une palette donnée :
// `npx tsx scripts/cac-sample.ts <dossier de sortie> [thème] [logo.png]` → cac-<thème>.xlsx / .docx / .pptx.
import fs from 'node:fs';
import path from 'node:path';
import { dossierDocx } from '../server/services/dossier/dossierDocx';
import { dossierPptx } from '../server/services/dossier/dossierPptx';
import { dossierXlsx } from '../server/services/dossier/dossierXlsx';
import { exampleData, exampleDossier } from '../server/services/dossier/exemple';
import { withTheme, type ThemeId } from '../server/services/houseDesign';

const [out, theme = 'comite', logoPath] = process.argv.slice(2) as [string, string?, string?];
const logo = logoPath
  ? (() => {
      const png = new Uint8Array(fs.readFileSync(logoPath));
      const dv = new DataView(png.buffer, png.byteOffset);
      return { png, width: dv.getUint32(16), height: dv.getUint32(20) };
    })()
  : null;
fs.mkdirSync(out, { recursive: true });
const d = exampleDossier();
withTheme(theme as ThemeId, () => {
  fs.writeFileSync(path.join(out, `cac-${theme}.xlsx`), dossierXlsx(d, { data: exampleData(), logo, skin: 'cac' }));
  fs.writeFileSync(path.join(out, `cac-${theme}.docx`), dossierDocx(d, { logo, skin: 'cac' }));
  fs.writeFileSync(path.join(out, `cac-${theme}.pptx`), dossierPptx(d, { logo, skin: 'cac' }));
});
console.log('→', out);
