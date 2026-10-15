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
const LOGO = {
  png: new Uint8Array(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEUlEQVR42mNkYPhfz0AEYBxVSAA8yQFhvh7bWAAAAABJRU5ErkJggg==',
      'base64',
    ),
  ),
  width: 4,
  height: 2,
};
const d = exampleDossier();
const balanced = (xml: string, tag: string) =>
  (xml.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length ===
  (xml.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;

describe('couleurs d’états tirées de la palette choisie', () => {
  it('chaque couleur d’état reste dans une famille de la palette (Onyx & Or, Bleu Ecobank)', () => {
    for (const id of ['onyx', 'comite'] as const) {
      const t = buildTheme(id);
      const states = cacStates(t.color, t.chartSeries);
      expect(states.length).toBeGreaterThanOrEqual(6);
      const hues = [t.color.blue, t.color.navy, t.color.gold, t.color.cyan, ...t.chartSeries];
      for (const s of states)
        expect(hues.some((h) => sameFamily(s, h) || tonalFamily(s, h) || s === h)).toBe(true);
    }
  });
  it('le design CAC garde la marine et l’accent de la palette, prend les neutres chauds du format et la police d’interface (allure application)', () => {
    const t = cacDesign(buildTheme('onyx'));
    expect(t.color.navy).toBe(buildTheme('onyx').color.navy);
    expect(t.color.text).toBe('17130C');
    expect(t.color.line).toBe('C7C4BD');
    expect(t.font.ui).toBe('Segoe UI');
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
    expect(s1).toMatch(
      /<pane xSplit="1" ySplit="\d+" topLeftCell="B\d+" activePane="bottomRight" state="frozen"\/>/,
    );
    const tabs = Object.keys(z)
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
      .map((k) => strFromU8(z[k]!).match(/tabColor rgb="FF(\w{6})"/)?.[1])
      .filter(Boolean);
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
      const doc = strFromU8(
        unzipSync(withTheme('onyx', () => dossierDocx(d, { logo: LOGO, skin })))['word/document.xml']!,
      );
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
    const slides = Object.keys(z)
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .map((k) => strFromU8(z[k]!));
    expect(slides.some((x) => x.includes('Fil d’Ariane'))).toBe(true);
    expect(slides.some((x) => x.includes('Filet supérieur'))).toBe(true);
    // KPI cards: a halo in the card's colour carrying a Fluent 3D emoji (picture + its relationship + one media file).
    expect(slides.some((x) => x.includes('name="Halo"'))).toBe(true);
    const rels = Object.keys(z)
      .filter((k) => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(k))
      .map((k) => strFromU8(z[k]!))
      .join('');
    const ids = [...new Set([...slides.join('').matchAll(/r:embed="(rIdE_[0-9a-f_]+)"/g)].map((m) => m[1]))];
    expect(ids.length).toBeGreaterThan(2);
    for (const id of ids) expect(rels).toContain(`Id="${id}"`);
    expect(Object.keys(z).filter((k) => /^ppt\/media\/emoji-/.test(k)).length).toBe(ids.length);
  });
});

import {
  DONUT,
  buttonEmoji,
  flatChart,
  flatFigure,
  ORDERED,
  shortFr,
  topicEmoji,
} from '../../server/services/dossier/cacSkin';
import { emojiRelId, emojiOfRelId, fluentPng } from '../../server/assets/fluentEmoji';
describe('v64 — exports « application » : émojis 3D, graphiques plats, cartes', () => {
  it('émoji du sujet (assurances 🛡️, IFRS 9 ⚖️, impayés 💸), « Jamais » n’est pas « mai »', () => {
    expect(buttonEmoji('Assurances')).toBe('🛡️');
    expect(buttonEmoji('IFRS 9 et BCEAO')).toBe('⚖️');
    expect(buttonEmoji('Impayés > 90 jours')).toBe('💸');
    expect(topicEmoji('zzz qqq')).toBeNull();
    expect(ORDERED.test('Jamais respecté')).toBe(false);
    expect(ORDERED.test('Échue > 180 j')).toBe(true);
  });
  it('pack Fluent 3D : PNG réel, identifiant de relation réversible', () => {
    const png = fluentPng('🛡️')!;
    expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
    expect(emojiOfRelId(emojiRelId('⚖️'))).toBe('⚖');
  });
  it('figure plate : 3D → plat, camembert > 5 parts → barres classées, catégories ordonnées gardent leur ordre', () => {
    const bars = flatFigure({
      kind: 'pie',
      title: 't',
      categories: ['a', 'b', 'c', 'd', 'e', 'f'],
      series: [{ name: 's', values: [1, 6, 3, 2, 5, 4] }],
    });
    expect(bars.kind).toBe('bar');
    expect(bars.categories).toEqual(['b', 'e', 'f', 'c', 'd', 'a']);
    expect(
      flatFigure({ kind: 'pie', title: 't', categories: ['a', 'b'], series: [{ name: 's', values: [1, 2] }] })
        .kind,
    ).toBe('doughnut');
    const ord = flatFigure({
      kind: 'col3d',
      title: 't',
      categories: ['< 90 j', '91-180 j', '> 2 ans'],
      series: [{ name: 's', values: [1, 9, 3] }],
    });
    expect(ord.kind).toBe('col');
    expect(ord.categories[0]).toBe('< 90 j');
    expect(shortFr(104_900_000_000)).toBe('104,9 Mds');
  });
  it('graphique plat : plus de 3D ni de dégradé ; anneau à zone de tracé fixe (total au centre)', () => {
    const bar3d =
      '<c:chart><c:view3D><c:rotX val="15"/></c:view3D><c:plotArea><c:layout/><c:bar3DChart><c:barDir val="bar"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>s</c:v></c:tx><c:spPr><a:gradFill><a:gsLst><a:gs pos="55000"><a:srgbClr val="112233"/></a:gs></a:gsLst></a:gradFill></c:spPr><c:invertIfNegative val="0"/><c:cat><c:strLit><c:pt idx="0"><c:v>Nord</c:v></c:pt></c:strLit></c:cat></c:ser><c:gapWidth val="70"/><c:shape val="box"/><c:axId val="111"/><c:axId val="222"/><c:axId val="0"/></c:bar3DChart></c:plotArea></c:chart>';
    const flat = flatChart(bar3d, { primary: 'AAAAAA', accent: 'BBBBBB' });
    expect(flat).not.toMatch(/view3D|bar3DChart|gradFill|shape val="box"|axId val="0"/);
    expect(flat).toContain('<c:barChart>');
    expect(flat).toContain('BBBBBB');
    const pie = flatChart(
      '<c:plotArea><c:layout/><c:pie3DChart><c:varyColors val="1"/></c:pie3DChart></c:plotArea>',
      { primary: 'A', accent: 'B' },
    );
    expect(pie).toContain('<c:holeSize val="62"/>');
    expect(pie).toContain(`<c:x val="${DONUT.x}"/>`);
  });
  it('classeur « application » : en-têtes de grille masqués, fond de page en style de colonne, émojis 3D dédupliqués', () => {
    const z = unzipSync(withTheme('comite', () => dossierXlsx(d, { data: exampleData(), skin: 'cac' })));
    const s1 = strFromU8(z['xl/worksheets/sheet1.xml']!);
    expect(s1).toContain('showRowColHeaders="0"');
    expect(s1).toMatch(/<col min="\d+" max="16384" width="9.140625" style="\d+"\/>/);
    const media = Object.keys(z).filter((k) => k.startsWith('xl/media/'));
    const pics = Object.keys(z)
      .filter((k) => /^xl\/drawings\/drawing\d+\.xml$/.test(k))
      .map((k) => (strFromU8(z[k]!).match(/name="Émoji /g) ?? []).length)
      .reduce((a, b) => a + b, 0);
    expect(pics).toBeGreaterThan(media.length * 2);
    expect(strFromU8(z['xl/drawings/drawing1.xml']!)).toContain('<xdr:oneCellAnchor>');
  });
});
