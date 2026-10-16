/**
 * Géométrie et traitements d'image du rendu (purs) : grille et parallaxe, cartes et flou, figurants, lumières,
 * remplissage push-pull, ellipses douces, mise en page des sous-titres.
 */
import { describe, expect, it } from 'vitest';
import { deplacerParallaxe } from '../src/scene/decor';
import { anneauxGaussiens } from '../src/rendu/formes';
import {
  carteAuxSommets,
  cellulesCouvertes,
  creerGrille,
  deplacementsFigurants,
  detecterFigurants,
  detecterLumieres,
  flouBoite,
  indicesGrille,
  intensiteHalo,
  projeterGrille,
  remplirPushPull,
  vieAuxSommets,
  type Carte,
} from '../src/rendu/geometrie';
import { decouperLignes } from '../src/rendu/miseEnPage';
import { matriceCamera } from '../src/timeline/projection';
import { cameraNeutre } from '../src/timeline/neutres';

describe('grille du décor', () => {
  const g = creerGrille(2, 16, 8, 0.03);
  it('taille, coordonnées de texture bornées, indices', () => {
    expect(g.nx).toBe(17);
    expect(g.ny).toBe(9);
    expect(Math.min(...g.uvs)).toBe(0);
    expect(Math.max(...g.uvs)).toBe(1);
    expect(g.repos[0]).toBeCloseTo(-0.06, 6);
    expect(indicesGrille(g).length).toBe(16 * 8 * 6);
    expect(indicesGrille(g, (i) => i < 4).length).toBe(4 * 8 * 6);
  });

  it('projection : même formule que la parallaxe du contrat, puis la caméra', () => {
    const cam = cameraNeutre({ x: 1, y: 0.5 }, 1.5);
    const m = matriceCamera(cam, 1080, 1920);
    const par = { decalage: { x: 0.01, y: -0.004 }, poussee: 0.05, profondeurReference: 0.6 };
    const prof = new Float32Array(g.nx * g.ny).map((_, k) => (k % 7) / 7);
    const sortie = new Float32Array(2 * g.nx * g.ny);
    projeterGrille(g.repos, prof, par, cam.centre, m, sortie);
    for (const k of [0, 40, 100, 152]) {
      const p = deplacerParallaxe({ x: g.repos[2 * k]!, y: g.repos[2 * k + 1]! }, prof[k]!, par, cam.centre);
      const x = m.a * p.x + m.c * p.y + m.tx;
      const y = m.b * p.x + m.d * p.y + m.ty;
      expect(sortie[2 * k]!).toBeCloseTo(x, 2);
      expect(sortie[2 * k + 1]!).toBeCloseTo(y, 2);
    }
  });
});

function carte(L: number, H: number, f: (x: number, y: number) => number): Carte {
  const v = new Float32Array(L * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) v[y * L + x] = f(x, y);
  return { largeur: L, hauteur: H, valeurs: v };
}

describe('cartes', () => {
  it('flou de boîte : constante conservée, masse à peu près conservée', () => {
    const c = flouBoite(carte(32, 16, () => 0.7), 2);
    expect(Math.max(...c.valeurs.map((v) => Math.abs(v - 0.7)))).toBeLessThan(1e-6);
    const pic = flouBoite(carte(33, 33, (x, y) => (x === 16 && y === 16 ? 1 : 0)), 2, 2);
    expect(pic.valeurs.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
    expect(pic.valeurs[16 * 33 + 16]!).toBeLessThan(0.2);
  });

  it('cellules couvertes par un masque, avec marge', () => {
    const g = creerGrille(2, 16, 8, 0);
    const m = carte(64, 32, (x, y) => (x > 30 && x < 34 && y > 14 && y < 18 ? 1 : 0));
    const couvre = cellulesCouvertes(m, g, 0.5, 0);
    let n = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 16; i++) if (couvre(i, j)) n++;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(4);
    const avecMarge = cellulesCouvertes(m, g, 0.5, 1);
    let n2 = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 16; i++) if (avecMarge(i, j)) n2++;
    expect(n2).toBeGreaterThan(n);
    expect(carteAuxSommets(m, g).length).toBe(17 * 9);
  });
});

describe('figurants', () => {
  // Deux personnes séparées et une foule fusionnée de quatre largeurs de personne.
  const H = 100;
  const L = 200;
  const masque = carte(L, H, (x, y) => {
    if (y < 66 || y > 91) return 0;
    if (x >= 10 && x < 20) return 1;
    if (x >= 30 && x < 40) return 1;
    if (x >= 80 && x < 124) return 1;
    return 0;
  });
  const fit = { mH: 6, floor: 0.95 };
  const { cellules, etiquettes } = detecterFigurants(masque, fit, 7);

  it('une cellule par personne, les masses fusionnées sont découpées', () => {
    expect(cellules.length).toBeGreaterThanOrEqual(5);
    expect(cellules.length).toBeLessThanOrEqual(8);
    for (const c of cellules) {
      expect(c.vPieds).toBeGreaterThan(c.vHaut);
      expect(c.periode).toBeGreaterThanOrEqual(2.8);
      expect(c.periode).toBeLessThanOrEqual(4.5);
    }
    expect(new Set(cellules.map((c) => c.phase.toFixed(3))).size).toBe(cellules.length);
    expect(etiquettes[70 * L + 15]!).toBeGreaterThanOrEqual(0);
    expect(etiquettes[10 * L + 15]!).toBe(-1);
    for (const c of cellules) expect(c.amplitude).toBeGreaterThan(0);
  });

  it('une masse bien plus haute qu’une personne (bus, façade) reste immobile', () => {
    const haut = carte(L, H, (x, y) => (x >= 50 && x < 70 && y >= 2 && y <= 92 ? 1 : 0));
    const r = detecterFigurants(haut, fit, 7);
    expect(r.cellules.length).toBeGreaterThan(0);
    for (const c of r.cellules) expect(c.amplitude).toBe(0);
  });

  it('mouvement subtil (≤ 2 % de la hauteur d’une personne), nul hors des personnes, nul sans amplitude', () => {
    const g = creerGrille(2, 64, 32, 0);
    const doux = flouBoite(masque, 1);
    const vie = vieAuxSommets(g, cellules, etiquettes, doux, L, H);
    const s = new Float32Array(2 * g.nx * g.ny);
    let max = 0;
    for (let t = 0; t < 6; t += 0.25) {
      deplacementsFigurants(g, vie, t, 1, s);
      for (let k = 0; k < g.nx * g.ny; k++) {
        const d = Math.hypot(s[2 * k]!, s[2 * k + 1]!);
        max = Math.max(max, d);
        if (vie.cellule[k]! < 0) expect(d).toBe(0);
      }
    }
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThan(0.02 * 0.4);
    deplacementsFigurants(g, vie, 1.3, 0, s);
    expect(Math.max(...s.map(Math.abs))).toBe(0);
  });
});

describe('lumières et remplissage', () => {
  it('taches de lumière : petites taches claires retenues, grandes zones claires rejetées', () => {
    const L = 64;
    const H = 32;
    const d = new Uint8Array(4 * L * H).fill(40);
    const poser = (x: number, y: number, c: number[]) => d.set([...c, 255], 4 * (y * L + x));
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) poser(x, y, [40, 40, 40]);
    for (const [cx, cy] of [
      [10, 5],
      [30, 8],
    ])
      for (let y = cy; y < cy + 2; y++) for (let x = cx; x < cx + 2; x++) poser(x, y, [255, 240, 200]);
    for (let y = 20; y < 32; y++) for (let x = 40; x < 64; x++) poser(x, y, [250, 250, 250]);
    const t = detecterLumieres(d, L, H, 3);
    expect(t.length).toBe(2);
    expect(t[0]!.couleur[0]).toBeCloseTo(1, 6);
    for (const x of t) {
      for (let s = 0; s < 5; s += 0.37) {
        const i = intensiteHalo(x, s);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThanOrEqual(1);
      }
    }
  });

  it('push-pull : pixels connus inchangés, inconnus remplis par leurs voisins', () => {
    const L = 16;
    const H = 8;
    const d = new Uint8Array(4 * L * H);
    const poids = new Float32Array(L * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < L; x++) {
        const i = y * L + x;
        if (x < 8) {
          d.set([200, 100, 50, 255], 4 * i);
          poids[i] = 1;
        }
      }
    const r = remplirPushPull(d, L, H, poids);
    expect(Array.from(r.slice(0, 3))).toEqual([200, 100, 50]);
    const loin = 4 * (4 * L + 15);
    expect(r[loin]).toBeGreaterThan(150);
    expect(r[loin + 3]).toBe(255);
  });
});

describe('ellipses douces', () => {
  it('alpha maximal au centre, nul au bord, rien quand alpha est nul', () => {
    const m = anneauxGaussiens([{ centre: { x: 10, y: 20 }, rx: 30, ry: 10, couleur: [0, 0, 0], alpha: 0.6 }]);
    expect(m.couleurs[3]).toBeCloseTo(0.6, 6);
    const n = m.positions.length / 2;
    expect(m.couleurs[4 * (n - 1) + 3]).toBeCloseTo(0, 6);
    expect(Math.max(...m.indices)).toBeLessThan(n);
    expect(anneauxGaussiens([{ centre: { x: 0, y: 0 }, rx: 5, ry: 5, couleur: [0, 0, 0], alpha: 0 }]).indices.length).toBe(0);
  });
});

describe('sous-titres', () => {
  it('une ligne si le texte tient, sinon deux lignes équilibrées', () => {
    expect(decouperLignes([100, 120], 20, 400)).toEqual([[0, 1]]);
    const l = decouperLignes([150, 150, 150, 150], 20, 400);
    expect(l).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(decouperLignes([], 10, 100)).toEqual([]);
    const trois = decouperLignes([300, 300, 300, 300, 300], 20, 400, 3);
    expect(trois.length).toBeGreaterThanOrEqual(3);
  });
});
