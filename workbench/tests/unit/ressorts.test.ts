import { describe, expect, it } from 'vitest';
import { canalEchantillonne, creerCanalRessort, reponseHarmonique, retardDeGroupe, ressortOs, type ParametresRessort } from '../../server/jev/studio/actor/ressorts';

// intégration numérique de référence (RK4, pas fin) de y'' + 2ζω·y' + ω²·y = ω²·(x + k3·x')
const integrer = (x: (t: number) => number, dx: (t: number) => number, p: ParametresRessort, y0: number, T: number, dt = 1e-4) => {
  const w = 2 * Math.PI * p.f, z = p.zeta, k3 = ((p.r ?? 0) * z) / w;
  const acc = (t: number, y: number, v: number) => w * w * (x(t) + k3 * dx(t) - y) - 2 * z * w * v;
  let y = y0, v = 0;
  const out: number[] = [];
  for (let t = 0; t < T - 1e-12; t += dt) {
    const a1 = acc(t, y, v), b1 = v;
    const a2 = acc(t + dt / 2, y + (dt / 2) * b1, v + (dt / 2) * a1), b2 = v + (dt / 2) * a1;
    const a3 = acc(t + dt / 2, y + (dt / 2) * b2, v + (dt / 2) * a2), b3 = v + (dt / 2) * a2;
    const a4 = acc(t + dt, y + dt * b3, v + dt * a3), b4 = v + dt * a3;
    y += (dt / 6) * (b1 + 2 * b2 + 2 * b3 + b4);
    v += (dt / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    out.push(y);
  }
  return out;
};

describe('ressorts analytiques (greffe du moteur fluide sur le moteur squelettique)', () => {
  it('a step overshoots by exp(−πζ/√(1−ζ²)) and settles on the target (follow-through, settle)', () => {
    const p = { f: 2, zeta: 0.5 };
    const c = creerCanalRessort(0, [{ t: 0, v: 1 }], p);
    let peak = 0;
    for (let t = 0; t < 2; t += 0.001) peak = Math.max(peak, c.valeur(t));
    expect(peak).toBeCloseTo(1 + Math.exp((-Math.PI * 0.5) / Math.sqrt(0.75)), 3);
    expect(c.valeur(5)).toBeCloseTo(1, 9);
    expect(c.vitesse(5)).toBeCloseTo(0, 9);
  });
  it('the closed form equals a fine numerical integration, for ramps, all three regimes and anticipation (r < 0)', () => {
    const cons = [{ t: 0.1, v: 0.8, rampe: 0.2 }, { t: 0.25, v: -0.4, rampe: 0.1 }, { t: 0.6, v: 0.3 }];
    // consigne et sa dérivée (rampes successives : la deuxième part de la valeur atteinte par la première)
    const ref = creerCanalRessort(0, cons, { f: 2, zeta: 0.5 });
    const x = (t: number) => ref.consigne(t), dx = (t: number) => (ref.consigne(t + 1e-7) - ref.consigne(t - 1e-7)) / 2e-7;
    for (const p of [{ f: 2, zeta: 0.5 }, { f: 3, zeta: 1 }, { f: 1.5, zeta: 1.6 }, { f: 2.6, zeta: 0.45, r: -1.2 }]) {
      const c = creerCanalRessort(0, cons, p);
      // la marche à 0,6 s a une dérivée infinie : on compare avant elle quand k3 ≠ 0
      const T = p.r ? 0.59 : 1.2, num = integrer(x, dx, p, 0, T);
      let worst = 0;
      for (let i = 999; i < num.length; i += 1000) worst = Math.max(worst, Math.abs(num[i]! - c.valeur((i + 1) * 1e-4)));
      expect(worst).toBeLessThan(2e-3);
    }
  });
  it('anticipation: with r < 0 the response first moves the WRONG way, then reaches the target', () => {
    const c = creerCanalRessort(0, [{ t: 0, v: 1, rampe: 0.15 }], { f: 2.6, zeta: 0.5, r: -1.5 });
    expect(c.valeur(0.03)).toBeLessThan(0);
    expect(c.valeur(4)).toBeCloseTo(1, 6);
  });
  it('a pure function of time: any instant, in any order, same value (parallel render, motion-blur sub-frames)', () => {
    const c = creerCanalRessort(0.2, [{ t: 0.3, v: 1, rampe: 0.1 }, { t: 1.1, v: -0.5, rampe: 0.3 }], { f: 2.4, zeta: 0.55 });
    const ts = [1.7, 0.2, 0.95, 1.31, 0.42];
    const a = ts.map((t) => c.valeur(t)), b = [...ts].reverse().map((t) => c.valeur(t)).reverse();
    expect(a).toEqual(b);
  });
  it('phase lead compensation keeps a sampled gesture on time; overlap delays the hand behind the arm', () => {
    const fps = 30, n = 6 * fps, f = 0.5;
    const s = Float64Array.from({ length: n }, (_, k) => Math.sin(2 * Math.PI * f * (k / fps)));
    const p = ressortOs('LeftArm')!;
    // retard mesuré par corrélation croisée (en images) entre l'échantillon brut et le canal filtré, sur 2–5 s
    const lag = (c: { valeur(t: number): number }) => {
      let best = 0, bv = -Infinity;
      for (let L = -10; L <= 10; L++) { let acc = 0; for (let k = 2 * fps; k < 5 * fps; k++) acc += s[k]! * c.valeur((k + L) / fps); if (acc > bv) { bv = acc; best = L; } }
      return best;
    };
    const raw = canalEchantillonne(s, fps, p, { compenser: false });
    const comp = canalEchantillonne(s, fps, p);
    // sans compensation : le ressort retarde le geste d'environ k1 − k3 (≈ 2 images à 2,6 Hz, ζ 0,5)
    expect(retardDeGroupe(p)).toBeGreaterThan(1.5 / fps);
    expect(lag(raw)).toBeGreaterThanOrEqual(1);
    expect(Math.abs(lag(comp))).toBeLessThanOrEqual(0); // compensé : à l'heure, à l'image près
    // chevauchement : main (profondeur 3) en retard de 3 × δ sur le bras (profondeur 1 → 1 × δ)
    const d = 0.04, hand = ressortOs('LeftHand')!;
    const ch = canalEchantillonne(s, fps, hand, { chevauchement: hand.profondeur * d }), ca = canalEchantillonne(s, fps, p, { chevauchement: p.profondeur * d });
    expect(lag(ch) - lag(ca)).toBeGreaterThanOrEqual(2);
    // gain proche de 1 aux fréquences du jeu (0,5 Hz) : le ressort ne mange pas le geste
    expect(reponseHarmonique(p, f).gain).toBeGreaterThan(0.95);
    // les jambes n'ont pas de ressort : les pieds restent plantés par l'IK
    expect(ressortOs('LeftLeg')).toBeNull();
  });
});
