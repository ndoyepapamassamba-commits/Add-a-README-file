// Format « CAC » (15/10/2026) : la mise en page du classeur de référence de l'utilisateur, dans la palette et avec le logo
// choisis, pour le classeur, le rapport et le deck. Données synthétiques (dossier d'exemple de l'app).
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { cacDesign, cacStates } from '../../server/services/dossier/cacSkin';
import { dossierDocx } from '../../server/services/dossier/dossierDocx';
import { dossierPptx } from '../../server/services/dossier/dossierPptx';
import { dossierXlsx } from '../../server/services/dossier/dossierXlsx';
import { exampleData, exampleDossier } from '../../server/services/dossier/exemple';
import { paletteFidelity, sameFamily, tonalFamily } from '../../server/services/designGate';
import { activeDesign, buildTheme, withTheme } from '../../server/services/houseDesign';

// A 4×2 PNG (valid header: width/height read by the exporters).
const LOGO = { png: new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEUlEQVR42mNkYPhfz0AEYBxVSAA8yQFhvh7bWAAAAABJRU5ErkJggg==', 'base64')), width: 4, height: 2 };
const d = exampleDossier();
const balanced = (xml: string, tag: string) => (xml.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length === (xml.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;

describe('couleurs d’états tirées de la palette choisie', () => {
  it('chaque couleur d’état reste dans une famille de la palette (Onyx & Or, Bleu Ecobank)', () => {
    for (const id of ['onyx', 'comite'] as const) {
      const t = buildTheme(id);
      const states = cacStates(t.color, t.chartSeries);
      expect(states.length).toBeGreaterThanOrEqual(6);
      const hues = [t.color.blue, t.color.navy, t.color.gold, t.color.cyan, ...t.chartSeries];
      for (const s of states) expect(hues.some((h) => sameFamily(s, h) || tonalFamily(s, h) || s === h)).toBe(true);
    }
  });
  it('le design CAC garde la marine et l’accent de la palette, prend les neutres chauds du format et Calibri', () => {
    const t = cacDesign(buildTheme('onyx'));
    expect(t.color.navy).toBe(buildTheme('onyx').color.navy);
    expect(t.color.text).toBe('17130C');
    expect(t.color.line).toBe('C7C4BD');
    expect(t.font.ui).toBe('Calibri');
  });
});

describe('classeur au format CAC', () => {
  const bytes = withTheme('onyx', () => dossierXlsx(d, { data: exampleData(), logo: LOGO, skin: 'cac' }));
  const z = unzipSync(bytes);
  const wb = strFromU8(z['xl/workbook.xml']!);
  it('s’ouvre sur ACCUEIL, les chapitres s’appellent « 01 TITRE », le thème précédent est rétabli après', () => {
    expect(wb).toMatch(/<sheets><sheet name="ACCUEIL"/);
    expect(wb).toContain('name="01 ');
    expect(activeDesign().name).not.toContain('format CAC');
  });
  it('menu PAGES figé (colonne A + en-tête), une couleur d’onglet par feuille', () => {
    const s1 = strFromU8(z['xl/worksheets/sheet1.xml']!);
    expect(s1).toMatch(/<pane xSplit="1" ySplit="\d+" topLeftCell="B\d+" activePane="bottomRight" state="frozen"\/>/);
    const tabs = Object.keys(z).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).map((k) => strFromU8(z[k]!).match(/tabColor rgb="FF(\w{6})"/)?.[1]).filter(Boolean);
    expect(new Set(tabs).size).toBeGreaterThanOrEqual(5);
  });
  it('tuiles, menu et boutons « Voir » sont cliquables (liens internes) ; le dessin est bien formé', () => {
    const dr = strFromU8(z['xl/drawings/drawing1.xml']!);
    expect(dr).toContain('name="Tuile ');
    expect(dr).toContain('name="Page ');
    expect(dr).toContain('name="Médaillon"');
    expect(balanced(dr, 'xdr:twoCellAnchor')).toBe(true);
    const rels = strFromU8(z['xl/drawings/_rels/drawing1.xml.rels']!);
    expect((rels.match(/relationships\/hyperlink"/g) ?? []).length).toBeGreaterThanOrEqual(10);
    expect(rels).toContain('Target="#&apos;ACCUEIL&apos;!A1"');
  });
  it('fidèle à la palette choisie (≥ 90 %), le logo est embarqué', () => {
    expect(paletteFidelity(bytes, cacDesign(buildTheme('onyx')))!.share).toBeGreaterThanOrEqual(0.9);
    expect(Object.keys(z).some((k) => k.startsWith('xl/media/'))).toBe(true);
  });
  it('le format comité reste celui par défaut de la fonction (compatibilité)', () => {
    const c = unzipSync(dossierXlsx(d, { data: exampleData() }));
    expect(strFromU8(c['xl/workbook.xml']!)).toMatch(/<sheets><sheet name="⌂ COCKPIT"/);
  });
});

describe('rapport et deck au format CAC', () => {
  it('Word : fil d’Ariane, « Le message clé », logo bien formé (wp:inline fermé — défaut corrigé le 15/10/2026)', () => {
    for (const skin of ['cac', 'comite'] as const) {
      const doc = strFromU8(unzipSync(withTheme('onyx', () => dossierDocx(d, { logo: LOGO, skin })))['word/document.xml']!);
      expect(balanced(doc, 'wp:inline')).toBe(true);
      expect(balanced(doc, 'w:drawing')).toBe(true);
      if (skin === 'cac') {
        expect(doc).toContain('01  ·  RAPPORT');
        expect(doc).toContain('Le message clé');
      }
    }
  });
  it('PowerPoint : en-têtes à fil d’Ariane, cartes chiffrées à filet coloré', () => {
    const z = unzipSync(withTheme('comite', () => dossierPptx(d, { logo: LOGO, skin: 'cac' })));
    const slides = Object.keys(z).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).map((k) => strFromU8(z[k]!));
    expect(slides.some((x) => x.includes('Fil d’Ariane'))).toBe(true);
    expect(slides.some((x) => x.includes('Filet supérieur'))).toBe(true);
    expect(slides.some((x) => x.includes('Médaillon'))).toBe(true);
  });
});
