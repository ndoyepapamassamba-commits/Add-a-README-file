import { describe, expect, it } from 'vitest';
import {
  coefficientsRessort,
  creerCanalRessort,
  creerCanalRessortAngle,
  creerCanalRessortVec2,
  decroissanceQuintique,
  reponseIndicielle,
  reponseRampe,
  type Consigne,
} from '../src/noyau/ressorts';
import { creerAleatoire } from '../src/noyau/aleatoire';
import type { ParametresRessort } from '../src/timeline/types';

/**
 * Référence numérique : intégration RK4 fine (pas 1e-4 s) de y'' = ω²(x + k3·x' − y) − 2ζω·y'.
 * Les marches de x produisent un saut de vitesse ω²·k3·Δ (impulsion de x') ; les rampes donnent x' = Δ/d.
 * Les instants des consignes sont alignés sur la grille pour que l'intégration soit exacte aux coupures.
 */
function reference(
  params: ParametresRessort,
  y0: number,
  consignes: Consigne[],
  tFin: number,
  dt = 1e-4,
): { t: number[]; y: number[] } {
  const c = coefficientsRessort(params);
  const w2 = c.omega * c.omega;
  const triees = [...consignes].sort((a, b) => a.t - b.t);
  const elems: Array<{ t: number; delta: number; d: number }> = [];
  let prec = y0;
  for (const k of triees) {
    elems.push({ t: k.t, delta: k.v - prec, d: k.rampe && k.rampe > 1e-6 ? k.rampe : 0 });
    prec = k.v;
  }
  // Les marches sont lues au milieu de l'intervalle d'intégration (pas au bord droit du dernier étage de RK4),
  // les rampes à l'instant exact : x est ainsi exact sur chaque intervalle.
  const x = (t: number, milieu: number) => {
    let v = y0;
    for (const e of elems) {
      if (e.d === 0) {
        if (milieu >= e.t) v += e.delta;
      } else if (t >= e.t) v += e.delta * Math.min(1, (t - e.t) / e.d);
    }
    return v;
  };
  const dx = (milieu: number) => {
    let v = 0;
    for (const e of elems) if (e.d > 0 && milieu >= e.t && milieu < e.t + e.d) v += e.delta / e.d;
    return v;
  };
  const t0 = Math.min(0, ...elems.map((e) => e.t)) - 0.01;
  const n = Math.round((tFin - t0) / dt);
  const ts: number[] = [];
  const ys: number[] = [];
  let y = y0;
  let v = 0;
  const acc = (t: number, yy: number, vv: number, xp: number, milieu: number) =>
    w2 * (x(t, milieu) + c.k3 * xp - yy) - 2 * c.zeta * c.omega * vv;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dt;
    // impulsions des marches qui tombent sur cet instant
    for (const e of elems) if (e.d === 0 && Math.abs(e.t - t) < dt / 2) v += w2 * c.k3 * e.delta;
    ts.push(t);
    ys.push(y);
    const m = t + dt / 2;
    const xp = dx(m);
    const k1y = v;
    const k1v = acc(t, y, v, xp, m);
    const k2y = v + (dt / 2) * k1v;
    const k2v = acc(t + dt / 2, y + (dt / 2) * k1y, k2y, xp, m);
    const k3y = v + (dt / 2) * k2v;
    const k3v = acc(t + dt / 2, y + (dt / 2) * k2y, k3y, xp, m);
    const k4y = v + dt * k3v;
    const k4v = acc(t + dt, y + dt * k3y, k4y, xp, m);
    y += (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
  }
  return { t: ts, y: ys };
}

const JEUX: Array<{ nom: string; p: ParametresRessort }> = [
  { nom: 'pseudo-périodique ζ=0,35', p: { f: 2, zeta: 0.35 } },
  { nom: 'pseudo-périodique ζ=0,6 anticipation r=−1,5', p: { f: 3, zeta: 0.6, r: -1.5 } },
  { nom: 'critique ζ=1', p: { f: 2, zeta: 1 } },
  { nom: 'quasi critique ζ=0,99995', p: { f: 2.5, zeta: 0.99995 } },
  { nom: 'apériodique ζ=1,4', p: { f: 2, zeta: 1.4 } },
  { nom: 'attaque sèche r=2', p: { f: 1.5, zeta: 0.4, r: 2 } },
  { nom: 'apériodique avec r=0,8', p: { f: 4, zeta: 2.2, r: 0.8 } },
];

const CONSIGNES: Consigne[] = [
  { t: 0.1, v: 1 },
  { t: 0.5, v: -0.4, rampe: 0.3 },
  { t: 0.9, v: 2 },
  { t: 1.0, v: 2.5, rampe: 0.2 },
  { t: 1.6, v: 0 },
];

describe('ressorts analytiques', () => {
  for (const { nom, p } of JEUX) {
    it(`égale l'intégration numérique fine (${nom}) à moins de 1e-3 (mesuré < 1e-10)`, () => {
      const canal = creerCanalRessort(0.25, CONSIGNES, p);
      const ref = reference(p, 0.25, CONSIGNES, 3.0);
      let ecartMax = 0;
      for (let i = 0; i < ref.t.length; i += 37) {
        ecartMax = Math.max(ecartMax, Math.abs(canal.valeur(ref.t[i]!) - ref.y[i]!));
      }
      expect(ecartMax).toBeLessThan(1e-3); // exigence du contrat
      expect(ecartMax).toBeLessThan(1e-7); // marge réelle : la forme fermée est exacte
    });
  }

  it('part au repos sur la valeur initiale et se stabilise sur la dernière consigne', () => {
    const canal = creerCanalRessort(3, [{ t: 1, v: 7 }], { f: 2, zeta: 0.5 });
    expect(canal.valeur(-5)).toBe(3);
    expect(canal.valeur(0.999)).toBe(3);
    expect(canal.valeur(1)).toBe(3);
    expect(Math.abs(canal.valeur(30) - 7)).toBeLessThan(1e-12);
    expect(Math.abs(canal.vitesse(30))).toBeLessThan(1e-9);
  });

  it('dépasse pour ζ < 1 et ne dépasse pas pour ζ ≥ 1 (r = 0)', () => {
    const sous = creerCanalRessort(0, [{ t: 0, v: 1 }], { f: 2, zeta: 0.4 });
    const crit = creerCanalRessort(0, [{ t: 0, v: 1 }], { f: 2, zeta: 1 });
    const sur = creerCanalRessort(0, [{ t: 0, v: 1 }], { f: 2, zeta: 1.6 });
    let maxSous = 0;
    let maxCrit = 0;
    let maxSur = 0;
    let precCrit = 0;
    let monotone = true;
    for (let t = 0; t < 4; t += 0.002) {
      maxSous = Math.max(maxSous, sous.valeur(t));
      const vc = crit.valeur(t);
      if (vc < precCrit - 1e-15) monotone = false;
      precCrit = vc;
      maxCrit = Math.max(maxCrit, vc);
      maxSur = Math.max(maxSur, sur.valeur(t));
    }
    // dépassement théorique exp(−πζ/√(1−ζ²)) pour ζ = 0,4 : 0,2538
    expect(maxSous - 1).toBeCloseTo(Math.exp((-Math.PI * 0.4) / Math.sqrt(1 - 0.16)), 3);
    expect(maxCrit).toBeLessThanOrEqual(1 + 1e-12);
    expect(maxSur).toBeLessThanOrEqual(1 + 1e-12);
    expect(monotone).toBe(true);
  });

  it("r < 0 donne de l'anticipation : la vitesse initiale vaut Δ·r·ζ·ω", () => {
    const p = { f: 3, zeta: 0.6, r: -1.5 };
    const canal = creerCanalRessort(0, [{ t: 0, v: 1 }], p);
    const omega = 2 * Math.PI * 3;
    expect(canal.vitesse(1e-9)).toBeCloseTo(-1.5 * 0.6 * omega, 4);
    let minimum = 0;
    for (let t = 0; t < 0.3; t += 0.001) minimum = Math.min(minimum, canal.valeur(t));
    expect(minimum).toBeLessThan(-0.1); // part d'abord à l'envers
  });

  it('valeur continue aux clés ; vitesse continue aux clés pour r = 0', () => {
    const p = { f: 2.2, zeta: 0.55 };
    const canal = creerCanalRessort(0, CONSIGNES, p);
    const eps = 1e-7;
    for (const k of CONSIGNES) {
      expect(Math.abs(canal.valeur(k.t + eps) - canal.valeur(k.t - eps))).toBeLessThan(1e-5);
      expect(Math.abs(canal.vitesse(k.t + eps) - canal.vitesse(k.t - eps))).toBeLessThan(1e-3);
      if (k.rampe) {
        const fin = k.t + k.rampe;
        expect(Math.abs(canal.vitesse(fin + eps) - canal.vitesse(fin - eps))).toBeLessThan(1e-3);
      }
    }
  });

  it('vitesse et accélération analytiques égales aux dérivées numériques', () => {
    const canal = creerCanalRessort(0.1, CONSIGNES, { f: 1.8, zeta: 0.45, r: 0.7 });
    const h = 1e-5;
    for (const t of [0.13, 0.44, 0.61, 0.95, 1.07, 1.33, 2.2]) {
      const dv = (canal.valeur(t + h) - canal.valeur(t - h)) / (2 * h);
      const da = (canal.vitesse(t + h) - canal.vitesse(t - h)) / (2 * h);
      expect(canal.vitesse(t)).toBeCloseTo(dv, 4);
      expect(canal.acceleration(t)).toBeCloseTo(da, 2);
    }
  });

  it('réponse à la rampe = intégrale de la réponse indicielle', () => {
    for (const { p } of JEUX) {
      const c = coefficientsRessort(p);
      const h = 1e-5;
      for (const tau of [0.05, 0.3, 0.9, 2.5]) {
        const dR = (reponseRampe(c, tau + h) - reponseRampe(c, tau - h)) / (2 * h);
        expect(dR).toBeCloseTo(reponseIndicielle(c, tau)[0], 6);
      }
    }
  });

  it("est déterministe et indépendant de l'ordre d'évaluation (scrub)", () => {
    const canal = creerCanalRessort(0, CONSIGNES, { f: 2, zeta: 0.3, r: -0.5 });
    const instants = Array.from({ length: 400 }, (_, i) => -0.2 + i * 0.01);
    const avant = instants.map((t) => canal.valeur(t));
    const arriere = [...instants].reverse().map((t) => canal.valeur(t)).reverse();
    const alea = creerAleatoire(42);
    const melange = instants.map((t, i) => ({ t, i })).sort(() => alea.suivant() - 0.5);
    const auHasard = new Array<number>(instants.length);
    for (const { t, i } of melange) auHasard[i] = canal.valeur(t);
    const autreCanal = creerCanalRessort(0, [...CONSIGNES].reverse(), { f: 2, zeta: 0.3, r: -0.5 });
    expect(arriere).toEqual(avant);
    expect(auHasard).toEqual(avant);
    expect(instants.map((t) => autreCanal.valeur(t))).toEqual(avant);
  });

  it('absorbe les consignes anciennes sans écart mesurable (somme exacte de référence)', () => {
    const p = { f: 3, zeta: 0.5 };
    const c = coefficientsRessort(p);
    const consignes: Consigne[] = Array.from({ length: 120 }, (_, i) => ({ t: i * 0.25, v: Math.sin(i) * 2 }));
    const canal = creerCanalRessort(0, consignes, p);
    for (const t of [3.3, 12.71, 29.9, 31.2, 40]) {
      let somme = 0;
      let prec = 0;
      for (const k of consignes) {
        const d = k.v - prec;
        prec = k.v;
        somme += d * reponseIndicielle(c, t - k.t)[0];
      }
      expect(Math.abs(canal.valeur(t) - somme)).toBeLessThan(1e-9);
    }
  });

  it("le canal d'angle prend le plus court chemin", () => {
    const deg = Math.PI / 180;
    const canal = creerCanalRessortAngle(170 * deg, [{ t: 0, v: -170 * deg }], { f: 2, zeta: 1 });
    expect(canal.valeur(10)).toBeCloseTo(190 * deg, 9);
    const enroule = creerCanalRessortAngle(170 * deg, [{ t: 0, v: -170 * deg }], { f: 2, zeta: 1 }, { enrouler: true });
    expect(enroule.valeur(10)).toBeCloseTo(-170 * deg, 9);
    for (let t = 0; t < 2; t += 0.01) expect(canal.valeur(t)).toBeGreaterThanOrEqual(170 * deg - 1e-12);
  });

  it('le canal Vec2 suit ses deux composantes', () => {
    const canal = creerCanalRessortVec2({ x: 0, y: 0 }, [{ t: 0, v: { x: 2, y: -1 } }], { f: 2, zeta: 0.7 });
    const scalaire = creerCanalRessort(0, [{ t: 0, v: 2 }], { f: 2, zeta: 0.7 });
    expect(canal.valeur(0.3).x).toBe(scalaire.valeur(0.3));
    expect(canal.valeur(0.3).y).toBeCloseTo(-scalaire.valeur(0.3) / 2, 12);
  });

  it('refuse des paramètres invalides', () => {
    expect(() => creerCanalRessort(0, [], { f: 0, zeta: 1 })).toThrow(/fréquence/);
    expect(() => creerCanalRessort(0, [], { f: 1, zeta: -1 })).toThrow(/amortissement/);
  });
});

describe('décroissance quintique (inertialisation)', () => {
  it('respecte les conditions aux bords et ne dépasse jamais zéro', () => {
    const alea = creerAleatoire(7);
    for (let essai = 0; essai < 2000; essai++) {
      const x0 = alea.plage(-1.5, 1.5);
      const v0 = alea.plage(-20, 20);
      const d = alea.plage(0.1, 0.6);
      expect(decroissanceQuintique(x0, v0, d, 0)).toBe(x0);
      expect(decroissanceQuintique(x0, v0, d, d)).toBe(0);
      for (let k = 1; k < 50; k++) {
        const y = decroissanceQuintique(x0, v0, d, (d * k) / 50);
        expect(y * Math.sign(x0)).toBeGreaterThanOrEqual(-1e-12 * Math.abs(x0));
      }
    }
  });

  it('atteint zéro avec vitesse nulle (C¹) à la fin', () => {
    const d = 0.3;
    const h = 1e-6;
    const v = (decroissanceQuintique(1, -2, d, d - h) - decroissanceQuintique(1, -2, d, d - 2 * h)) / h;
    expect(Math.abs(v)).toBeLessThan(1e-4);
    const v0 = (decroissanceQuintique(1, -2, d, 2 * h) - decroissanceQuintique(1, -2, d, h)) / h;
    expect(v0).toBeCloseTo(-2, 3);
  });
});
