import { describe, expect, it } from 'vitest';
import { frontendDesignLint, isHtmlDocument, lintReport, lintSummary } from '../../server/services/frontendDesignLint';
import { diffReport, pixelDiff } from '../../server/services/visualDiff';

const GENERIC = `<!doctype html><html><head><style>
body{background:#F4F1EA;font-family:Inter,system-ui,sans-serif;color:#111}
.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.75rem}
.btn{background:#D97757;outline:none}
.card{border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1)} .card2{border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1)} .card3{border-radius:12px}
@keyframes up{from{opacity:0;transform:translateY(20px)}to{opacity:1}} .s1{animation:up 1s} .s2{animation:up 1s}
</style></head><body><h1>Un <span class="x">mot</span> en couleur</h1><p class="eyebrow">Services</p>
<p>A · B · C</p><p>MARCHÉ — fragment</p><a href="#">Voir plus →</a><p>01</p><p>02</p><p>03</p></body></html>`;
const CLEAN = `<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
:root{--ink:#1d2a3a;--paper:#fbf9f4;--accent:#2b7a78}
body{background:var(--paper);color:var(--ink);font-family:"Fraunces",serif;max-width:65ch}
h1{font-family:"Fraunces",serif}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (max-width:600px){body{padding:16px}}
@media (prefers-reduced-motion:reduce){*{animation:none;transition:none}}
.hero{transition:transform .3s}
</style></head><body><h1>La boulangerie du quartier</h1><p>Pain au levain.</p><a href="#">Commander le pain</a></body></html>`;

describe('frontend-design check (skill frontend-design)', () => {
  it('names the tells of a generated page and the quality-floor failures', () => {
    expect(isHtmlDocument('site/index.html', GENERIC)).toBe(true);
    expect(isHtmlDocument('notes.md', GENERIC)).toBe(false);
    const f = frontendDesignLint(GENERIC);
    const codes = f.map((x) => x.code);
    expect(codes.slice(0, 3)).toEqual(expect.arrayContaining(['viewport-absent', 'mouvement-reduit-absent', 'focus-invisible']));
    expect(codes).toEqual(
      expect.arrayContaining([
        'lang-absent',
        'palette-ia-creme-terracotta',
        'noir-teinte',
        'eyebrow-capitales',
        'points-medians',
        'libelle-tiret-cadratin',
        'fleche-boutons',
        'marqueurs-numerotes',
        'kit-cartes-saas',
        'mouvement-disperse',
        'typographie-par-defaut',
        'mot-accentue-titre',
      ]),
    );
    expect(f[0]!.level).toBe('bloquant');
    const report = lintReport(f);
    expect(report).toMatch(/Contrôle frontend-design .* 3 bloquante/);
    expect(lintSummary(f)).toMatch(/remarque\(s\), 3 bloquante/);
  });
  it('a deliberate page passes clean', () => {
    const f = frontendDesignLint(CLEAN);
    expect(f.map((x) => x.code)).toEqual([]);
    expect(lintReport(f)).toMatch(/aucun tic/);
    expect(lintSummary(f)).toBe('design ✓');
  });
});

describe('visual diff (skills visual-regression / frontend-visual-qa)', () => {
  const raster = (w: number, h: number, fill: (x: number, y: number) => number) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = fill(x, y);
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    return { width: w, height: h, data };
  };
  it('identical → identique; a small noise → stable; a moved block → changé with a located zone', () => {
    const a = raster(96, 96, () => 200);
    expect(pixelDiff(a, a).verdict).toBe('identique');
    const noise = raster(96, 96, (x, y) => (x === 3 && y === 3 ? 100 : 200));
    expect(pixelDiff(a, noise).verdict).toBe('stable');
    const moved = raster(96, 96, (x, y) => (x >= 48 && y >= 48 ? 20 : 200));
    const r = pixelDiff(a, moved);
    expect(r.verdict).toBe('changé');
    expect(r.changed).toBeCloseTo(0.25, 2);
    expect(r.boxes).toHaveLength(1);
    expect(r.boxes[0]!.x).toBe(48);
    expect(r.boxes[0]!.y).toBe(48);
    expect(r.diff[(50 * 96 + 50) * 4]).toBe(220);
    expect(diffReport(r, { before: 'a.png', after: 'b.png' })).toMatch(/CHANGÉ — 25.00 %/);
  });
  it('different sizes are compared on the common area and said so', () => {
    const a = raster(40, 40, () => 10);
    const b = raster(60, 30, () => 10);
    const r = pixelDiff(a, b);
    expect(r.sameSize).toBe(false);
    expect(r.total).toBe(40 * 30);
    expect(r.verdict).toBe('stable');
  });
});
