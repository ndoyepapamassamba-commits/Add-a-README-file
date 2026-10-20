import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanTemplate } from '../../server/services/cleanTemplate';
import { identityOutside, inpaintBox, measureInk, planTransfer } from '../../server/services/cloneTransfer';
import type { DashSpec } from '../../server/services/dashClone';
import { cloneData, renderCloneSvg, transferTexts } from '../../server/services/dashRender';
import { decodePng } from '../helpers/png';

// The trap image of the user's report (« Create Excel Dashboard »): a thumbnail title outlined in red, a sidebar of
// menus, KPI cards with an icon and a sparkline, a header strip of label / figure pairs, a grouped bar chart, curves,
// concentric rings, two gauges, a « #1 » sticker and a « Go Down » button. The spec is what the pixel reading gave.
const FIX = path.resolve(__dirname, '../fixtures');
const { w, h, px } = decodePng(new Uint8Array(fs.readFileSync(path.join(FIX, 'dashboard-linco-trap.png'))));
const spec0 = JSON.parse(fs.readFileSync(path.join(FIX, 'dashboard-linco-trap.spec.json'), 'utf8')) as DashSpec;
const boxes = spec0.panels.map((p) => ({ x0: p.box.x * w, y0: p.box.y * h, x1: (p.box.x + p.box.w) * w, y1: (p.box.y + p.box.h) * h }));
const tpl = cleanTemplate(px, w, h, boxes, new Set());
const t = planTransfer({ px, w, h, spec: spec0, texts: tpl.texts, erased: tpl.erased, cleanBg: tpl.bg });
const cats = ['Nord', 'Sud', 'Est', 'Ouest', 'Centre'];
const rows = cats.flatMap((c, i) => [1, 2, 3, 4, 5, 6].map((m) => ({ mois: `2025-0${m}-15`, region: c, montant: 400 + ((i * 7 + m * 13) % 9) * 120, volume: 10 + ((i * 5 + m * 3) % 7) * 4 })));
const data = cloneData('Ventes par région', ['mois', 'region', 'montant', 'volume'], rows);
const px2 = (b: { x: number; y: number; w: number; h: number }) => ({ x0: Math.round(b.x * w), y0: Math.round(b.y * h), x1: Math.round((b.x + b.w) * w), y1: Math.round((b.y + b.h) * h) });

describe('« Corriger à 100 % » — transfer on the image', () => {
  it('corrects what the pixel reading got wrong: KPI cards, the header strip, the sidebar lists, the gauges', () => {
    const kinds = t.spec.panels.map((p) => p.kind);
    expect(kinds.filter((k) => k === 'kpi')).toHaveLength(4);
    expect(t.plan.kinds.some((k) => k.to === 'title' && k.why.includes('bandeau'))).toBe(true);
    expect(t.plan.kinds.some((k) => k.to === 'donut' && k.why.includes('anneau'))).toBe(true);
    // The two thumbnail decorations are removed, and their panel leaves the spec.
    expect(t.plan.overlays).toHaveLength(2);
    expect(t.spec.panels.length).toBe(spec0.panels.length - 1);
  });
  it('measures the rings: three concentric (radial bars) and two separate gauges, each with its track and colour', () => {
    const conc = t.plan.rings.find((r) => r.concentric)!;
    const sep = t.plan.rings.find((r) => !r.concentric)!;
    expect(conc.rings).toHaveLength(3);
    expect(sep.rings).toHaveLength(2);
    for (const r of [...conc.rings, ...sep.rings]) {
      expect(r.track).not.toBe(r.color);
      expect(r.thick * w).toBeGreaterThan(6);
    }
  });
  it('gives every text line a role: title with its red outline, 4 KPI figures + labels, label / figure pairs, list sections', () => {
    const roles = (r: string) => t.plan.lines.filter((l) => l.role === r);
    const title = roles('title')[0]!;
    expect(title.outline).toMatch(/^#E[0-9A-F]1/);
    expect(title.weight).toBe(800);
    expect(roles('kpiValue')).toHaveLength(4);
    expect(roles('kpiLabel')).toHaveLength(4);
    expect(roles('pairValue').length).toBeGreaterThanOrEqual(5);
    expect(roles('listHeader').length).toBeGreaterThanOrEqual(2);
    expect(roles('listItem').length).toBeGreaterThanOrEqual(6);
    // Sparkline waves, icons and curves are not text: no line sits on a KPI wave.
    expect(t.plan.lines.some((l) => l.box.y * h > 280 && l.box.y * h < 322 && l.box.x * w > 240 && l.box.x * w < 1380)).toBe(false);
  });
  it('keeps the image pixel for pixel outside the replaced zones, and erases the old words inside them', () => {
    expect(identityOutside(px, t.bg, w, h, t.plan.zones, 0)).toBeGreaterThanOrEqual(99.9);
    // No ink of the old sidebar items, header pairs, KPI labels is left on the transferred background.
    for (const l of t.plan.lines.filter((x) => ['listItem', 'kpiLabel', 'pairLabel', 'pairValue'].includes(x.role))) {
      const m = measureInk(t.bg, w, h, px2(l.box), 90);
      expect(m.box ? m.density * (m.box.x1 - m.box.x0) * (m.box.y1 - m.box.y0) : 0, `${l.role} ${JSON.stringify(px2(l.box))}`).toBeLessThan(12);
    }
    // The stickers are gone: the « #1 » block takes the sidebar's colour.
    const i = (720 * w + 60) * 4;
    expect(Math.abs(t.bg[i]! - 14) + Math.abs(t.bg[i + 1]! - 29) + Math.abs(t.bg[i + 2]! - 82)).toBeLessThan(40);
  });
  it('writes the user\'s words only — KPI figures in order, real list axes, computed extra figures; never a word of the image', () => {
    const spec: DashSpec = { ...t.spec, background: 'data:image/png;base64,AA==' };
    const texts = transferTexts(spec, data);
    const all = texts.map((x) => x.text).join(' | ');
    for (const old of ['Linco', 'Create Excel', 'Total sales', 'COGS', '91,002', 'Stores', 'Manager', 'Albany', 'mumin', 'Go Down', '#1']) expect(all).not.toContain(old);
    expect(texts.find((x) => x.line.role === 'title')!.text).toBe('Ventes par région');
    expect(texts.filter((x) => x.line.role === 'kpiValue').map((x) => x.text)).toEqual(data.kpis.slice(0, 4).map((k) => k.value));
    expect(texts.filter((x) => x.line.role === 'listItem').map((x) => x.text)).toContain('Nord');
    const svg = renderCloneSvg(spec, data, 1200);
    expect(svg).toContain('data-transfer="1"');
    expect(svg).toContain('stroke="#E');
    expect(svg).not.toContain('Linco');
  });
  it('inpaints a box from its own surroundings (a gradient stays a gradient)', () => {
    const W = 40;
    const H = 20;
    const img = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        img[i] = x * 6;
        img[i + 1] = 100;
        img[i + 2] = 200;
        img[i + 3] = 255;
      }
    for (let y = 8; y < 12; y++) for (let x = 10; x < 30; x++) img[(y * W + x) * 4 + 1] = 255;
    inpaintBox(img, W, H, { x0: 10, y0: 8, x1: 30, y1: 12 });
    expect(img[(10 * W + 20) * 4]).toBeGreaterThanOrEqual(118);
    expect(img[(10 * W + 20) * 4]).toBeLessThanOrEqual(122);
    expect(img[(10 * W + 20) * 4 + 1]).toBe(100);
  });
});
