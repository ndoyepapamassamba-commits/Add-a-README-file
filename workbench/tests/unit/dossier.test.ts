import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { checkDepth, dossierNumbers, fmtMoney, normalizeDossier } from '../../server/services/dossier/dossier';
import { dossierDocx } from '../../server/services/dossier/dossierDocx';
import { dossierFromMarkdown } from '../../server/services/dossier/dossierFromMarkdown';
import { dossierHtml, dossierMailHtml, figureSvg } from '../../server/services/dossier/dossierHtml';
import { dossierPptx } from '../../server/services/dossier/dossierPptx';
import { dossierXlsx } from '../../server/services/dossier/dossierXlsx';
import { exampleDossier } from '../../server/services/dossier/exemple';
import { THEMES, withTheme } from '../../server/services/houseDesign';

const parts = (b: Uint8Array) => Object.keys(unzipSync(b));
const read = (b: Uint8Array, p: string) => strFromU8(unzipSync(b)[p]!);

describe('Le dossier — modèle, normalisation, profondeur', () => {
  it('numbers and bounds whatever the model hands over; a thin dossier is reported, never silently repaired', () => {
    const d = normalizeDossier({ title: 'T', thesis: 'Court.', kpis: [{ label: 'A', num: 1234567 }, { label: 'B', value: '3 %' }], chapters: [{ title: 'Un', constats: ['x'], recommendations: [{ title: 'r', owner: 'moi' }, { action: 'faire' }] }, { title: 'Deux', recommandations: [{ title: 's', priority: 'p3' }] }], decisions: ['d1', { text: 'd2' }], sources: [{ title: 'S', axis: 'r2' }] });
    expect(d.kpis.map((k) => k.code)).toEqual(['K01', 'K02']);
    expect(d.kpis[0]!.value).toBe('1,2 M');
    expect(d.chapters.flatMap((c) => c.recommandations.map((r) => r.ref))).toEqual(['R-01', 'R-02', 'R-03']);
    expect(d.chapters[1]!.recommandations[0]!.priority).toBe('P3');
    expect(d.chapters[0]!.recommandations[0]!.priority).toBe('P1');
    expect(d.decisions.map((x) => x.code)).toEqual(['D1', 'D2']);
    expect(d.sources[0]!.id).toBe('R2-01');
    const issues = checkDepth(d);
    expect(issues.some((i) => i.where === 'thèse')).toBe(true);
    expect(issues.some((i) => i.where === 'chapitres')).toBe(true);
    expect(checkDepth(exampleDossier())).toEqual([]);
    expect(fmtMoney(104.9e9)).toBe('104,9 Mds');
    expect(fmtMoney(469e6)).toBe('469 M');
    expect(dossierNumbers(exampleDossier())).toContain('104,9');
  });
});

describe('Les livrables du dossier — deck, rapport, classeur, page, mail (même grammaire, tout thème)', () => {
  const d = exampleDossier();
  it('deck: a slide per screen, native 3D charts, timed notes on every slide, the logo badge or the organisation plate', () => {
    const b = dossierPptx(d);
    const p = parts(b);
    const slides = p.filter((x) => /^ppt\/slides\/slide\d+\.xml$/.test(x));
    expect(slides.length).toBeGreaterThanOrEqual(12);
    expect(p.filter((x) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(x)).length).toBe(slides.length);
    const charts = p.filter((x) => /^ppt\/charts\//.test(x));
    expect(charts.length).toBeGreaterThanOrEqual(8);
    expect(read(b, charts[0]!)).toContain('bar3DChart');
    expect(read(b, 'ppt/notesSlides/notesSlide1.xml')).toMatch(/\[0:00 → \d+:\d\d/);
    const s3 = read(b, 'ppt/slides/slide3.xml');
    expect(s3).toContain('K01 · Clients signalés');
    expect(s3).toContain('Lecture — ');
    expect(read(b, 'ppt/slides/slide1.xml')).toContain('Banque Exemple');
    const last = read(b, `ppt/slides/slide${slides.length - 1}.xml`);
    expect(last.includes('Pour') || read(b, `ppt/slides/slide${slides.length - 2}.xml`).includes('Pour')).toBe(true);
  });
  it('report: cover, native TOC, chapters with the six blocks, action plan, annexes A–E, header / footer with page fields', () => {
    const b = dossierDocx(d);
    const x = read(b, 'word/document.xml');
    expect(x).toContain('TOC \\o "1-1"');
    expect(x).toContain('Constat chiffré');
    expect(x).toContain('Cadre réglementaire et recherche');
    expect(x).toContain('Cas emblématiques');
    expect(x).toContain('Annexe E — Bibliographie');
    expect(x).toContain('R-01');
    expect(parts(b).filter((p) => p.startsWith('word/charts/')).length).toBe(8);
    expect(read(b, 'word/footer1.xml')).toContain('NUMPAGES');
    expect(read(b, 'word/header1.xml')).toContain('CONFIDENTIEL');
  });
  it('workbook: one sheet per view, charts linked to cells on several sheets, validations, live KPI formulas, schema-ordered fonts', () => {
    const b = dossierXlsx(d);
    const p = parts(b);
    const wb = read(b, 'xl/workbook.xml');
    for (const name of ['COCKPIT', 'PLAN D&apos;ACTIONS', 'DÉCISIONS', 'HYPOTHÈSES', 'PARAMÈTRES', 'QUALITÉ', 'SOURCES', 'GLOSSAIRE', 'DATA_KPI']) expect(wb.replace(/'/g, '&apos;')).toContain(name);
    expect(p.filter((x) => /^xl\/drawings\/drawing\d+\.xml$/.test(x)).length).toBeGreaterThanOrEqual(5);
    expect(p.filter((x) => /^xl\/charts\/chart\d+\.xml$/.test(x)).length).toBeGreaterThanOrEqual(10);
    expect(read(b, 'xl/worksheets/sheet1.xml')).toMatch(/DATA_KPI(&apos;|')!\$C\$2/);
    const plan = p.find((x) => /^xl\/worksheets\/sheet\d+\.xml$/.test(x) && read(b, x).includes('dataValidations'))!;
    expect(plan).toBeDefined();
    const sheet = read(b, plan);
    expect(sheet.indexOf('<dataValidations')).toBeLessThan(sheet.indexOf('<ignoredErrors') < 0 ? Infinity : sheet.indexOf('<ignoredErrors'));
    const fonts = read(b, 'xl/styles.xml').match(/<font>(.*?)<\/font>/g)!;
    expect(fonts.every((f) => !/<color[^>]*\/><b\/>|<name[^>]*\/><b\/>|<sz[^>]*\/><b\/>/.test(f))).toBe(true);
    expect(read(b, 'xl/styles.xml')).not.toMatch(/rgb="[0-9A-F]{6}"/);
  });
  it('page and mail: inline SVG figures, the ten tiles, the decisions; the mail stays table-only', () => {
    const h = dossierHtml(d);
    expect(h).toContain('<svg');
    expect(h.match(/class="kpi"/g)!.length).toBeGreaterThanOrEqual(14);
    expect(h).toContain('☐ Pour');
    const m = dossierMailHtml(d);
    expect(m).not.toContain('<script');
    expect(m).toContain('role="presentation"');
    expect(figureSvg({ kind: 'doughnut', title: 'x', categories: ['a', 'b'], series: [{ name: 's', values: [3, 1] }] })).toContain('75 %');
  });
  it('every theme renders the same deck with its own colours (comité, extraordinaire, maison, générées)', () => {
    const navyOf = (t: keyof typeof THEMES) => withTheme(t, () => read(dossierPptx(d), 'ppt/slides/slide1.xml'));
    expect(navyOf('comite')).toContain('00415E');
    expect(navyOf('extraordinaire')).toContain('14102E');
    expect(navyOf('house')).toContain('001B4D');
    expect(THEMES.comite.series![1]).toBe('8CC63F');
  });
});

describe('Markdown → dossier (tout rapport de l’agent prend la grammaire du comité)', () => {
  it('headings become chapters, bullets findings, owners / deadlines recommendations, the annex sections their registers', () => {
    const md = `# Ventes T3\n\nLe trimestre recule de 4 % ; deux agences portent 60 % du repli.\n\n## Messages clés\n- Repli de 4 %\n- Deux agences\n\n## 1. Agences\n- Dakar : −9 %\n- Thiès : −2 %\n\nLa baisse vient des volumes.\n\n### Recommandations\n- R-01 · P1 · Plan de relance Dakar — Responsable : DR Dakar ; Échéance : 30/11/2026 ; Indicateur : +5 %\n\n| Réf. | Action | Responsable | Échéance |\n|---|---|---|---|\n| R-02 | Revue des prix | Marketing | 15/12/2026 |\n\n## Décisions\n- Valider le plan Dakar\n\n## Hypothèses\n- H01 — Période : T3 2026 calendaire.\n\n## Glossaire\n- Repli : baisse d'un trimestre sur l'autre.\n\n## Sources\n- Rapport BCEAO 2025 — la conjoncture régionale ralentit (https://www.bceao.int)\n`;
    const d = dossierFromMarkdown(md, { org: 'Org', unit: 'Unité' });
    expect(d.title).toBe('Ventes T3');
    expect(d.thesis).toContain('recule de 4');
    expect(d.messages).toEqual(['Repli de 4 %', 'Deux agences']);
    expect(d.chapters).toHaveLength(1);
    expect(d.chapters[0]!.constats).toEqual(['Dakar : −9 %', 'Thiès : −2 %']);
    expect(d.chapters[0]!.analyse).toEqual(['La baisse vient des volumes.']);
    expect(d.chapters[0]!.recommandations.map((r) => [r.ref, r.priority, r.owner, r.due])).toEqual([
      ['R-01', 'P1', 'DR Dakar', '30/11/2026'],
      ['R-02', 'P2', 'Marketing', '15/12/2026'],
    ]);
    expect(d.decisions[0]).toEqual({ code: 'D1', text: 'Valider le plan Dakar' });
    expect(d.hypotheses[0]).toMatchObject({ code: 'H01', title: 'Période' });
    expect(d.glossary[0]!.term).toBe('Repli');
    expect(d.sources[0]).toMatchObject({ id: 'R1-01', url: 'https://www.bceao.int' });
    expect(checkDepth(d).length).toBeGreaterThan(0); // thin by construction: the rules say so
    expect(parts(dossierDocx(d)).length).toBeGreaterThan(5);
  });
});
