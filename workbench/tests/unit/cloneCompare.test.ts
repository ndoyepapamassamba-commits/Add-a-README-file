import { describe, expect, it } from 'vitest';
import { compareClone, parseKindWord, sameFamily } from '../../server/services/cloneCompare';
import type { DashSpec, Panel } from '../../server/services/dashClone';

const W = 320;
const H = 200;
function image(bars: [number, number, number], title: [number, number, number] = [31, 41, 55]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4).fill(255);
  const set = (x: number, y: number, c: [number, number, number]) => {
    const o = (y * W + x) * 4;
    px[o] = c[0];
    px[o + 1] = c[1];
    px[o + 2] = c[2];
  };
  // Panel box 16..176 × 20..140 (white card on the white page): a title line at the top, three vertical bars.
  for (let x = 24; x < 110; x++) for (let y = 26; y < 34; y++) set(x, y, title);
  for (const [bx, top] of [[30, 70], [70, 50], [110, 90]] as const) for (let x = bx; x < bx + 28; x++) for (let y = top; y < 132; y++) set(x, y, bars);
  return px;
}
const panel: Panel = {
  box: { x: 16 / W, y: 20 / H, w: 160 / W, h: 120 / H },
  kind: 'bar',
  pixelKind: 'bar',
  tiles: 1,
  titleAlign: 'left',
  valueLabels: false,
  legend: 'none',
  fill: '#FFFFFF',
  border: null,
  borderWidth: 0,
  radius: 0,
  colors: ['#003DA5'],
  ramp: ['#003DA5'],
  text: '#1F2937',
  sequential: false,
  titleBox: { x: 24 / W, y: 26 / H, w: 86 / W, h: 8 / H },
  titleColor: '#1F2937',
};
const spec: DashSpec = { version: 1, aspect: W / H, outer: '#FFFFFF', frame: null, page: '#FFFFFF', pageBox: { x: 0, y: 0, w: 1, h: 1 }, title: null, panels: [panel], font: 'Segoe UI', palette: { primary: '#003DA5', accent: '#C8A951', dark: '#1F2937', series: ['#003DA5'] } };

describe('comparateur image ↔ reproduction', () => {
  const src = image([0, 61, 165]);
  it('an identical reproduction scores 100 on the four criteria, no unsure type, cold heat grid', () => {
    const r = compareClone(src, src, W, H, spec);
    expect(r.layout).toBeGreaterThanOrEqual(98);
    expect(r.colors).toBe(100);
    expect(r.charts).toBe(100);
    expect(r.titles).toBe(100);
    expect(r.overall).toBeGreaterThanOrEqual(99);
    expect(r.unsure).toEqual([]);
    expect(r.heat.cells.length).toBe(32 * 20);
    expect(Math.max(...r.heat.cells)).toBe(0);
    expect(r.panels[0]!.drawnKind).toBeTruthy(); // the renderer drew marks the classifier reads (informative only)
  });
  it('bars drawn in another colour: colours fall, the heat grid warms where the bars are; a missing title is seen', () => {
    const out = image([220, 38, 38], [255, 255, 255]);
    const r = compareClone(src, out, W, H, spec);
    expect(r.colors).toBe(0);
    expect(r.titles).toBe(0);
    expect(r.notes.join(' ')).toMatch(/couleurs|titre/);
    expect(Math.max(...r.heat.cells)).toBeGreaterThan(0.2);
  });
  it('vision label ≠ pixel reading → the type is « à confirmer »; same family is not a disagreement', () => {
    const r = compareClone(src, src, W, H, { ...spec, panels: [{ ...panel, kind: 'line', pixelKind: 'bar' }] });
    expect(r.charts).toBe(0);
    expect(r.unsure).toEqual([0]);
    expect(sameFamily('bar', 'hbar')).toBe(true);
    expect(sameFamily('pie', 'donut')).toBe(true);
    expect(sameFamily('bar', 'line')).toBe(false);
    expect(compareClone(src, src, W, H, { ...spec, panels: [{ ...panel, kind: 'hbar', pixelKind: 'bar' }] }).charts).toBe(100);
  });
  it('one-word answers of the zoom are parsed', () => {
    expect(parseKindWord('It is a bar chart.')).toBe('bar');
    expect(parseKindWord('hbar')).toBe('hbar');
    expect(parseKindWord('Donut (ring) chart')).toBe('donut');
    expect(parseKindWord('nothing useful')).toBeNull();
  });
});
