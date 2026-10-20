import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { designGate, mapColours, retint, sameFamily } from '../../server/services/designGate';
import { buildTheme } from '../../server/services/houseDesign';
import { houseXlsx } from '../../server/services/houseStyle';
import { excelStrict } from '../../server/services/excelStrict';

// A synthetic table of amounts (no real data): the gate must find a table, band it, keep the palette and the font.
const COLS = ['Client', 'Segment', 'Encours XOF', 'Impayés XOF', 'Jours'];
const ROWS = Array.from({ length: 60 }, (_, i) => ({
  Client: `CLIENT ${i + 1}`,
  Segment: ['PME', 'GRANDE ENTREPRISE', 'PARTICULIER'][i % 3],
  'Encours XOF': ((i * 7919) % 9973) * 10_000 + 5_000,
  'Impayés XOF': i % 4 ? 0 : ((i * 31) % 97) * 1_000,
  Jours: i % 4 ? 0 : (i * 13) % 200,
}));

describe('PORTE DE DESIGN (designGate) — le livrable Excel respecte le design choisi avant livraison', () => {
  const design = buildTheme({ primary: '#7A3FA8', accent: '#F2C94C', dark: '#4A1D66' });
  const base = houseXlsx(COLS, ROWS, { title: 'Engagements', chart: 'bar' });
  const r = designGate(base, design)!;
  it('returns a score, the rules checked, and valid Open XML bytes', () => {
    expect(r).not.toBeNull();
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.checked.length).toBeGreaterThanOrEqual(3);
    expect(r.checked.join(' ')).toMatch(/palette/);
    expect(r.checked.join(' ')).toMatch(/police/);
    expect(r.checked.join(' ')).toMatch(/Maison 2/);
    const z = unzipSync(r.bytes);
    expect(z['xl/workbook.xml']).toBeDefined();
    expect(z['xl/styles.xml']).toBeDefined();
  });
  it('the old palette is gone from the style parts; the theme and its font are there', () => {
    const st = strFromU8(unzipSync(r.bytes)['xl/styles.xml']!);
    const house = buildTheme('house').color;
    const mine = new Set(Object.values(design.color).map((c) => c.replace('#', '').toUpperCase()));
    const hues = ['navy', 'blue', 'gold', 'cyan', 'sky'].map((k) => design.color[k as 'navy'].replace('#', ''));
    for (const k of ['navy', 'blue', 'gold'] as const) {
      const old = house[k].replace('#', '').toUpperCase();
      // An old colour of the same hue as the new theme (the two golds here) is a shade of the design, and stays.
      if (!mine.has(old) && !hues.some((h) => sameFamily(old, h))) expect(st).not.toContain(`rgb="FF${old}"`);
    }
    expect(st).not.toContain('rgb="FF001B4D"');
    expect(st).toContain(`rgb="FF${design.color.navy.replace('#', '').toUpperCase()}"`);
    expect(st).toContain(`<name val="${design.font.ui}"/>`);
  });
  it('tints and shades of the palette (the relief of the 3D charts) are kept, a foreign hue is replaced', () => {
    expect(sameFamily('A982C6', '7A3FA8')).toBe(true);
    expect(sameFamily('5C2F7E', '7A3FA8')).toBe(true);
    expect(sameFamily('1B5E3F', '7A3FA8')).toBe(false);
    // A pale surface colour never legitimises a whole hue (the old navy is not a tint of the line colour).
    expect(sameFamily('001B4D', 'DBE6F7')).toBe(false);
    const charts = Object.entries(unzipSync(r.bytes)).filter(([k]) => /^xl\/charts\/chart.*\.xml$/.test(k));
    expect(charts.length).toBeGreaterThan(0);
    const stops = charts.flatMap(([, v]) => [...strFromU8(v).matchAll(/<a:gs pos="\d+"><a:srgbClr val="([0-9A-F]{6})"/g)].map((m) => m[1]!));
    expect(new Set(stops).size).toBeGreaterThan(2);
  });
  it('is idempotent: a second pass changes nothing and keeps the score', () => {
    const again = designGate(r.bytes, design)!;
    expect(again.score).toBe(r.score);
    expect(again.fixed.filter((f) => /couleur|police/.test(f))).toEqual([]);
  });
  it('a foreign gradient is re-tinted onto the role colour with its relief, a design gradient is left alone', () => {
    const grad = (a: string, b: string, c: string) =>
      `<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="${a}"/></a:gs><a:gs pos="50000"><a:srgbClr val="${b}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${c}"/></a:gs></a:gsLst></a:gradFill>`;
    // The old house navy, lighter and darker: the relief of a chart made with the previous palette.
    const old = mapColours(grad('1F4A8C', '001B4D', '000F2B'), design, new Map());
    expect(old.n).toBe(3);
    const stops = [...old.xml.matchAll(/val="([0-9A-F]{6})"/g)].map((m) => m[1]!);
    expect(new Set(stops).size).toBe(3);
    for (const st of stops) expect(sameFamily(st, design.color.navy.replace('#', ''))).toBe(true);
    expect(retint('1F4A8C', '001B4D', '4A1D66') > retint('000F2B', '001B4D', '4A1D66')).toBe(true);
    // Tints of the theme primary: the design's own relief, untouched.
    const mine = mapColours(grad('A982C6', '7A3FA8', '5C2F7E'), design, new Map());
    expect(mine.n).toBe(0);
    // A fixed extra series colour (orange) keeps its relief too: its base is a design colour.
    const series = mapColours(grad('FBBF6E', 'F97316', 'B4500D'), design, new Map());
    expect(series.n).toBe(0);
  });
  it('the gated workbook passes the strict Open XML checks without a repair', () => {
    const z = unzipSync(r.bytes);
    const { fixes } = excelStrict(z);
    expect(fixes).toEqual([]);
  });
  it('refuses what is not a workbook', () => {
    expect(designGate(new Uint8Array([1, 2, 3]), design)).toBeNull();
  });
});
