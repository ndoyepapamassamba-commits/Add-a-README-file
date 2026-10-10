// Photo-faithful dashboard clone: geometry and colours measured on the pixels, rendered with the real data.
import { describe, expect, it } from 'vitest';
import { buildSpec, detectLayout, fidelityScore, parseBoxes, parseSom, readingOrder, refineBox, withVisionBoxes } from '../../server/services/dashClone';
import { cloneData, renderCloneHtml, renderCloneSvg } from '../../server/services/dashRender';

/** A synthetic dashboard: white page in a brown frame, navy-bordered panels glued together, blue sequential bars. */
function dashboard(w = 900, h = 600) {
  const px = new Uint8ClampedArray(w * h * 4);
  const set = (x: number, y: number, c: number[]) => px.set([...c, 255], (y * w + x) * 4);
  const fill = (x0: number, y0: number, x1: number, y1: number, c: number[]) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, c);
  };
  fill(0, 0, w, h, [111, 73, 59]); // frame
  fill(30, 30, w - 30, h - 30, [253, 253, 254]); // page
  // title text-ish strip
  fill(330, 40, 570, 60, [18, 54, 94]);
  const navy = [16, 53, 93];
  const panels = [
    [30, 80, 330, 330],
    [330, 80, w - 30, 330],
    [30, 330, 450, h - 30],
    [450, 330, w - 30, h - 30],
  ];
  for (const [x0, y0, x1, y1] of panels) {
    fill(x0!, y0!, x1!, y0! + 2, navy);
    fill(x0!, y1! - 2, x1!, y1!, navy);
    fill(x0!, y0!, x0! + 2, y1!, navy);
    fill(x1! - 2, y0!, x1!, y1!, navy);
  }
  // bars in panel 1 (dark → light), horizontal bars in panel 4
  const ramp = [[19, 59, 103], [43, 101, 166], [76, 147, 216], [178, 204, 228]];
  ramp.forEach((c, i) => fill(60 + i * 65, 300 - (4 - i) * 45, 100 + i * 65, 310, c));
  ramp.forEach((c, i) => fill(480, 370 + i * 45, 480 + (4 - i) * 90, 395 + i * 45, c));
  // a pie (disc) in panel 3
  for (let y = 380; y < 540; y++) for (let x = 160; x < 320; x++) if ((x - 240) ** 2 + (y - 460) ** 2 < 75 ** 2) set(x, y, x < 240 ? [43, 101, 166] : [178, 204, 228]);
  // a line in panel 2
  for (let x = 380; x < 840; x++) {
    const y = Math.round(200 + 40 * Math.sin(x / 60));
    fill(x, y, x + 1, y + 3, [19, 59, 103]);
  }
  return { px, w, h };
}

describe('dashboard clone — measured on the pixels', () => {
  const { px, w, h } = dashboard();
  const det = detectLayout(px, w, h);
  it('finds the frame, the title band and the 4 glued bordered panels, in reading order', () => {
    expect(det.frame).not.toBeNull();
    expect(det.panels).toHaveLength(4);
    expect(det.title).not.toBeNull();
    const b = det.panels.map((p) => [p.x0, p.y0, p.x1, p.y1]);
    expect(Math.abs(b[0]![0]! - 30)).toBeLessThan(8);
    expect(Math.abs(b[1]![0]! - 330)).toBeLessThan(8);
    expect(b[2]![1]!).toBeGreaterThan(320);
    expect(det.score).toBeGreaterThan(0.6);
  });
  it('styles are measured: navy borders, the exact blue ramp (sequential), the frame colour kept out of the series', () => {
    const spec = buildSpec(px, w, h, det, null);
    expect(spec.page).toBe('#FDFDFE');
    expect(spec.frame?.color).toBe('#6F493B');
    const p0 = spec.panels[0]!;
    expect(p0.border).toBe('#10355D');
    expect(p0.sequential).toBe(true);
    expect(p0.ramp[0]).toBe('#133B67');
    expect(p0.colors).toContain('#B2CCE4');
    expect(spec.panels.flatMap((p) => p.colors)).not.toContain('#6F493B');
  });
  it('the pixel classifier recognises bars, line, pie and horizontal bars', () => {
    const spec = buildSpec(px, w, h, det, null);
    expect(spec.panels.map((p) => p.kind)).toEqual(['bar', 'line', 'pie', 'hbar']);
  });
  it('the vision labels (numbered boxes) win; the reading order is rows then left to right', () => {
    const som = parseSom('{"panels":[{"id":2,"kind":"area"}],"font":"Calibri"}')!;
    const spec = buildSpec(px, w, h, det, som);
    expect(spec.panels[1]!.kind).toBe('area');
    expect(spec.font).toBe('Calibri');
    expect(readingOrder([{ x0: 400, y0: 12, x1: 500, y1: 50 }, { x0: 0, y0: 10, x1: 300, y1: 50 }, { x0: 0, y0: 80, x1: 90, y1: 99 }], 100).map((b) => b.x0)).toEqual([0, 400, 0]);
  });
  it('model boxes are snapped to the real edges', () => {
    const vb = parseBoxes('{"title":null,"panels":[{"box":[45,140,360,540],"kind":"bar"},{"box":[380,140,960,540],"kind":"line"}]}')!;
    const r = refineBox(px, w, h, vb.panels[0]!.box);
    expect(Math.abs(r.x0 - 30)).toBeLessThanOrEqual(4);
    expect(Math.abs(r.x1 - 330)).toBeLessThanOrEqual(4);
    const v = withVisionBoxes(px, w, h, det, vb);
    expect(v.det.panels).toHaveLength(2);
    expect(v.som.kinds[2]!.kind).toBe('line');
  });
});

describe('dashboard clone — rendering with the real data', () => {
  const { px, w, h } = dashboard();
  const spec = buildSpec(px, w, h, detectLayout(px, w, h), null);
  const rows = [
    { date: '2023-01-15', agence: 'Dakar', montant: 1250 },
    { date: '2023-02-15', agence: 'Thiès', montant: 430 },
    { date: '2023-03-15', agence: 'Dakar', montant: 300 },
  ];
  const d = cloneData('Ventes 2023', ['date', 'agence', 'montant'], rows);
  it('views come from the rows: grouped sums and a monthly trend; nothing invented', () => {
    expect(d.views.find((v) => v.title === 'montant par agence')!.values).toEqual([1550, 430]);
    expect(d.views.find((v) => v.ordered)!.categories).toHaveLength(3);
    expect(d.kpis[0]).toEqual({ label: 'Lignes', value: '3' });
  });
  it('the SVG keeps the aspect ratio, the frame, the exact colours and the real figures', () => {
    const svg = renderCloneSvg(spec, d, 1200);
    expect(svg).toContain('viewBox="0 0 1200 800"');
    expect(svg).toContain('#6F493B');
    expect(svg).toContain('#10355D');
    expect(svg).toContain('1 550');
    expect(svg).toContain('Ventes 2023');
    expect(renderCloneHtml(spec, d)).toContain('data-dash-clone');
  });
  it('fidelity: identical images score 100, very different ones score low', () => {
    const a = new Uint8ClampedArray(64 * 40 * 4).fill(200);
    const b = new Uint8ClampedArray(64 * 40 * 4).fill(20);
    expect(fidelityScore(a, a, 64, 40, '#FFFFFF')).toBe(100);
    expect(fidelityScore(a, b, 64, 40, '#FFFFFF')).toBeLessThan(30);
  });
});
