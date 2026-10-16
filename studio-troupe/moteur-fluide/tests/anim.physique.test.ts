/**
 * Tests du mouvement secondaire analytique : pendule comparé à une intégration RK4 fine de
 * `θ'' + 2ζω·θ' + ω²·θ = −X''/L`, réponse harmonique comparée au régime établi simulé, retard, impulsions, chaîne.
 */
import { describe, expect, it } from 'vitest';
import { compilerChaine, creerPendule, creerRetard, oscillationAmortie, reponseHarmonique } from '../src/anim/physique';
import { creerCanalRessort, type Consigne } from '../src/noyau/ressorts';

/** Déplacement de l'attache : rampes linéaires (accélérations impulsionnelles aux coins). */
const RAMPES: Consigne[] = [
  { t: 0.2, v: 40, rampe: 0.3 },
  { t: 0.9, v: -25, rampe: 0.25 },
  { t: 1.6, v: 0, rampe: 0.5 },
];

/** Intègre θ'' = −2ζωθ' − ω²θ − X''/L avec X linéaire par morceaux (impulsions de vitesse aux coins). */
function penduleRK4(f: number, zeta: number, L: number, tFin: number, h = 1e-5): Array<[number, number]> {
  const w = 2 * Math.PI * f;
  const X = creerCanalRessort(0, RAMPES, { f: 1, zeta: 1 });
  const vitesseX = (t: number): number => (X.consigne(t + 1e-7) - X.consigne(t - 1e-7)) / 2e-7;
  // Les sauts de vitesse de X donnent des sauts de θ' : Δθ' = −ΔX'/L.
  const coins: number[] = [];
  for (const c of RAMPES) coins.push(c.t, c.t + (c.rampe ?? 0));
  let th = 0;
  let om = 0;
  let t = 0;
  const r: Array<[number, number]> = [];
  let vx = vitesseX(0);
  const n = Math.round(tFin / h);
  for (let i = 0; i < n; i++) {
    const acc = (a: number, b: number): number => -2 * zeta * w * b - w * w * a;
    const k1a = om;
    const k1b = acc(th, om);
    const k2a = om + (h / 2) * k1b;
    const k2b = acc(th + (h / 2) * k1a, om + (h / 2) * k1b);
    const k3a = om + (h / 2) * k2b;
    const k3b = acc(th + (h / 2) * k2a, om + (h / 2) * k2b);
    const k4a = om + h * k3b;
    const k4b = acc(th + h * k3a, om + h * k3b);
    th += (h / 6) * (k1a + 2 * k2a + 2 * k3a + k4a);
    om += (h / 6) * (k1b + 2 * k2b + 2 * k3b + k4b);
    t += h;
    const nv = vitesseX(t);
    if (Math.abs(nv - vx) > 1e-6 && coins.some((c) => Math.abs(c - t) < h * 1.5)) {
      om += -(nv - vx) / L;
      vx = nv;
    }
    if (i % 1000 === 0) r.push([t, th]);
  }
  return r;
}

describe('pendule analytique', () => {
  it('égale l’intégration RK4 de l’équation du pendule (écart < 1 %)', () => {
    const f = 1.8;
    const zeta = 0.2;
    const L = 120;
    const ref = penduleRK4(f, zeta, L, 3);
    const p = creerPendule(RAMPES, L, { f, zeta });
    const amplitude = Math.max(...ref.map(([, v]) => Math.abs(v)));
    let ecart = 0;
    for (const [t, v] of ref) ecart = Math.max(ecart, Math.abs(p.angle(t) - -v));
    // Convention : angle positif (horaire) quand la masse traîne à gauche d'une attache partie à droite.
    expect(amplitude).toBeGreaterThan(0.01);
    expect(ecart / amplitude).toBeLessThan(0.01);
  });
  it('est nul au repos et après amortissement', () => {
    const p = creerPendule(RAMPES, 100, { f: 2, zeta: 0.3 });
    expect(p.angle(0)).toBe(0);
    expect(Math.abs(p.angle(20))).toBeLessThan(1e-9);
  });
});

describe('réponse harmonique', () => {
  it('gain 1 en basse fréquence, 1/(2ζ) à la résonance (r = 0), et accord avec la simulation', () => {
    expect(reponseHarmonique({ f: 2, zeta: 0.3 }, 0.001).gain).toBeCloseTo(1, 4);
    expect(reponseHarmonique({ f: 2, zeta: 0.3 }, 2).gain).toBeCloseTo(1 / 0.6, 4);
    // Régime établi d'une consigne sinusoïdale échantillonnée en rampes fines.
    const p = { f: 1.5, zeta: 0.4, r: 0.5 };
    const F = 1.1;
    const consignes: Consigne[] = [];
    for (let k = 1; k <= 1200; k++) consignes.push({ t: (k - 1) / 100, v: Math.sin((2 * Math.PI * F * k) / 100), rampe: 0.01 });
    const c = creerCanalRessort(0, consignes, p);
    const { gain, phase } = reponseHarmonique(p, F);
    for (const t of [9.03, 9.41, 10.77, 11.2]) {
      expect(c.valeur(t)).toBeCloseTo(gain * Math.sin(2 * Math.PI * F * t + phase), 2);
    }
  });
});

describe('retard et impulsions', () => {
  it('le suiveur souple traîne, rebondit, puis rejoint', () => {
    const r = creerRetard([{ t: 0.5, v: 1 }], { f: 4, zeta: 0.8 }, { f: 1.5, zeta: 0.25 });
    expect(r(0.4)).toBe(0);
    expect(r(0.6)).toBeLessThan(-0.05);
    const max = Math.max(...Array.from({ length: 300 }, (_, i) => r(0.5 + i / 100)));
    expect(max).toBeGreaterThan(0.1); // dépassement du suiveur
    expect(Math.abs(r(15))).toBeLessThan(1e-6);
  });
  it('oscillation amortie : nulle au départ, continue, décroissante', () => {
    const imp = [{ t: 1, amplitude: 1 }];
    expect(oscillationAmortie(1, imp, 3, 0.2)).toBe(0);
    expect(Math.abs(oscillationAmortie(1.0001, imp, 3, 0.2))).toBeLessThan(0.01);
    const a1 = Math.abs(oscillationAmortie(1.08, imp, 3, 0.2));
    const a2 = Math.abs(oscillationAmortie(1.08 + 1 / 2.94, imp, 3, 0.2));
    expect(a2).toBeLessThan(a1);
  });
});

describe('chaîne secondaire', () => {
  it('gravité pleine : le maillon finit vertical (compense la rotation du porteur)', () => {
    const ch = compilerChaine(
      { nom: 'pan', os: ['a', 'b'], ressort: { f: 1.5, zeta: 0.3 }, gravite: 1 },
      [80, 80],
      [{ t: 0.2, v: 0.3, rampe: 0.2 }],
      [],
      { f: 2, zeta: 0.6 },
    );
    const [a, b] = ch.rotations(20);
    expect(a).toBeCloseTo(-0.3, 4);
    expect(b).toBeCloseTo(0, 4);
  });
  it('raide (gravité nulle) : traîne pendant le mouvement, revient à 0', () => {
    const ch = compilerChaine(
      { nom: 'foulard', os: ['a', 'b', 'c'], ressort: { f: 2, zeta: 0.3 }, gravite: 0 },
      [50, 50, 50],
      [{ t: 0.2, v: 0.4 }],
      [{ t: 0.2, v: 30, rampe: 0.2 }],
      { f: 3, zeta: 0.6 },
    );
    const pendant = ch.rotations(0.35);
    expect(Math.abs(pendant[0]!)).toBeGreaterThan(0.02);
    for (const v of ch.rotations(30)) expect(Math.abs(v)).toBeLessThan(1e-6);
  });
});
