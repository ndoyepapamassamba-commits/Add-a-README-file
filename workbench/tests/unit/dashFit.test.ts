import { describe, expect, it } from 'vitest';
import { cloneData, dashFit } from '../../server/services/dashRender';
import { rankMeasures } from '../../server/services/tablePick';
import { FIT_ZOOM } from '../../server/services/liveDash';

describe('v48 — live dashboard only when the data deserves one (Analyse_LOGO_ET_COULEURS_ECOBANK.xlsx)', () => {
  const palette = [
    { RGB: 'rgb(0, 92, 131)', Pixels: 94708, 'Teinte H': 198, Famille: 'Bleu-cyan', 'Luminance rel.': 9.3 },
    { RGB: 'rgb(243, 253, 253)', Pixels: 14326, 'Teinte H': 180, Famille: 'Bleu-cyan', 'Luminance rel.': 96.4 },
    { RGB: 'rgb(126, 181, 92)', Pixels: 680, 'Teinte H': 97, Famille: 'Vert', 'Luminance rel.': 38.3 },
    { RGB: 'rgb(19, 95, 62)', Pixels: 455, 'Teinte H': 154, Famille: 'Vert', 'Luminance rel.': 8.7 },
    { RGB: 'rgb(177, 222, 107)', Pixels: 346, 'Teinte H': 83, Famille: 'Vert', 'Luminance rel.': 62.7 },
  ];
  it('a 5-colour palette gets NO dashboard in front of the real analysis', () => {
    const f = dashFit(cloneData('x', Object.keys(palette[0]!), palette));
    expect(f.ok).toBe(false);
    expect(f.why).toContain('5 ligne');
  });
  it('a hue, a luminance, a contrast are never summed as amounts', () => {
    expect(rankMeasures(['Pixels', 'Teinte H', 'Luminance rel.', 'Contraste / blanc'], palette)).toEqual(['Pixels']);
  });
  it('a real portfolio (60 rows, amounts, segments) gets its dashboard', () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ Client: `C${i}`, Segment: ['PME', 'GE', 'Particuliers'][i % 3], Encours: 1000 + i * 37, Stage: `Stage ${1 + (i % 3)}` }));
    expect(dashFit(cloneData('x', Object.keys(rows[0]!), rows)).ok).toBe(true);
  });
  it('the dashboard sheet opens zoomed to fit a laptop screen', () => {
    expect(FIT_ZOOM).toBeGreaterThanOrEqual(70);
    expect(FIT_ZOOM).toBeLessThan(100);
  });
});
