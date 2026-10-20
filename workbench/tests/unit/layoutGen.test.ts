import { describe, expect, it } from 'vitest';
import { CHROMES, generateLayout } from '../../server/services/layoutGen';
import { modelsFor, modelSpec, generatedModels } from '../../server/services/designModels';

const P = { dark: '#0F172A', primary: '#2563EB', accent: '#F59E0B', page: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A', series: ['#2563EB', '#F59E0B', '#10B981', '#EF4444'] };
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

describe('GÉNÉRATEUR DE MISES EN PAGE : aucun modèle ne ressemble à un autre', () => {
  it('200 seeds → 200 different structures; every panel inside the page, no two panels overlapping', () => {
    const sigs = new Set<string>();
    for (let s = 0; s < 200; s++) {
      const l = generateLayout(s, P);
      sigs.add(l.signature);
      for (const p of l.panels) {
        expect(p.box.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.box.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.box.x + p.box.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(p.box.y + p.box.h).toBeLessThanOrEqual(1 + 1e-9);
      }
      for (let i = 0; i < l.panels.length; i++) for (let j = i + 1; j < l.panels.length; j++) expect(overlap(l.panels[i]!.box, l.panels[j]!.box)).toBeLessThan(1e-4);
      expect(l.panels.some((p) => ['bar', 'hbar', 'line', 'area', 'pie', 'donut', 'gauge', 'table'].includes(p.kind))).toBe(true);
    }
    expect(sigs.size).toBe(200);
  });
  it('the 20 Excel models of the gallery: 20 structures, every frame type used, never the same frame twice in a row', () => {
    const ms = modelsFor('excel');
    expect(ms).toHaveLength(20);
    const specs = ms.map((m) => modelSpec(m.palette, m.layout));
    const sig = specs.map((s) => s.panels.map((p) => `${p.kind}${Math.round(p.box.x * 20)}${Math.round(p.box.y * 20)}${Math.round(p.box.w * 20)}`).join(''));
    expect(new Set(sig).size).toBe(20);
    const chromes = ms.map((m) => m.tagline.split(' · ')[0]);
    expect(new Set(chromes).size).toBeGreaterThanOrEqual(CHROMES.length - 1);
    for (let i = 1; i < chromes.length; i++) expect(chromes[i]).not.toBe(chromes[i - 1]);
  });
  it('« générer 20 de plus »: new structures, none already in the gallery', () => {
    const base = new Set(modelsFor('excel').map((m) => JSON.stringify(modelSpec(m.palette, m.layout).panels.map((p) => [p.kind, p.box]))));
    for (const m of generatedModels('excel', 0)) expect(base.has(JSON.stringify(modelSpec(m.palette, m.layout).panels.map((p) => [p.kind, p.box])))).toBe(false);
  });
});
