// Les savoirs du bac à sable (v64) : la bibliothèque `jev` EXACTEMENT telle qu'elle est servie aux pages (module chargé
// depuis sa source), vérifiée numériquement — normalisations quantiques, projection aller-retour, intégrateurs, marche.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { JEVLIB_SOURCE, jevlibUrl } from '../../coeur/sandbox/jevlib';
import { SANDBOX_CARDS, sandboxBlock, sandboxCards } from '../../coeur/sandbox/knowledge';
import { buildDocument, LIBRARIES, systemPrompt } from '../../coeur/realize/realize';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let jev: any;
beforeAll(async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jevlib-')), 'jev.mjs');
  fs.writeFileSync(f, JEVLIB_SOURCE);
  jev = await import(/* @vite-ignore */ pathToFileURL(f).href);
});
/** ∫ f over [a, b] (Simpson, n even). */
const simpson = (f: (x: number) => number, a: number, b: number, n = 4000) => {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
};

describe('v64 — bibliothèque jev : quantique (normalisations vérifiées)', () => {
  it('fonctions radiales de l’hydrogène normalisées : ∫ R² r² dr = 1 (1s, 2s, 2p, 3d, 4f)', () => {
    for (const [n, l] of [[1, 0], [2, 0], [2, 1], [3, 2], [4, 3]] as const) {
      const I = simpson((r) => jev.quantum.hydrogenRadial(n, l, r) ** 2 * r * r, 0, 60 * n, 20000);
      expect(I).toBeCloseTo(1, 3);
    }
    // Nœuds radiaux : n − l − 1 (2s en a un vers r = 2 a0).
    expect(jev.quantum.hydrogenRadial(2, 0, 2)).toBeCloseTo(0, 6);
  });
  it('harmoniques sphériques réelles normalisées sur la sphère (l ≤ 3)', () => {
    for (const [l, m] of [[0, 0], [1, 1], [2, 0], [2, -2], [3, 3], [3, 0]] as const) {
      const I = simpson((th) => simpson((ph) => jev.quantum.realY(l, m, th, ph) ** 2, 0, 2 * Math.PI, 200) * Math.sin(th), 0, Math.PI, 200);
      expect(I).toBeCloseTo(1, 3);
    }
  });
  it('oscillateur harmonique et puits infini normalisés ; énergies exactes', () => {
    for (const n of [0, 1, 3]) expect(simpson((x) => jev.quantum.oscillatorPsi(n, x) ** 2, -10, 10)).toBeCloseTo(1, 4);
    expect(simpson((x) => jev.quantum.boxPsi(2, x, 1) ** 2, 0, 1)).toBeCloseTo(1, 5);
    // Électron dans une boîte de 1 nm : E1 ≈ 0,376 eV.
    expect(jev.quantum.boxEnergy(1, 1e-9) / jev.quantum.eV).toBeCloseTo(0.376, 2);
    expect(jev.quantum.hydrogenEnergy(1)).toBeCloseTo(-13.6057, 3);
  });
  it('fentes de Young : maximum central 1, premier zéro à sin θ = λ / 2d ; effet tunnel entre 0 et 1, décroît avec la largeur', () => {
    expect(jev.quantum.doubleSlit(0, 500e-9, 2e-6, 0.5e-6)).toBeCloseTo(1, 9);
    expect(jev.quantum.doubleSlit(Math.asin(500e-9 / (2 * 2e-6)), 500e-9, 2e-6, 0.5e-6)).toBeCloseTo(0, 9);
    const t1 = jev.quantum.tunneling(5, 10, 0.1e-9), t2 = jev.quantum.tunneling(5, 10, 0.3e-9);
    expect(t1).toBeGreaterThan(0);
    expect(t1).toBeLessThan(1);
    expect(t2).toBeLessThan(t1);
    expect(simpson((x) => jev.quantum.wavePacket(x, 3), -40, 60)).toBeCloseTo(1, 4);
    expect(jev.quantum.sampleOrbital(2, 1, 0, 500).length).toBe(1500);
  });
});

describe('v64 — bibliothèque jev : projection 3D, mathématiques, physique', () => {
  const cam = { eye: [4, 3, 6], target: [0, 0, 0], up: [0, 1, 0], fov: 50, near: 0.1, far: 100, width: 1280, height: 720 };
  it('la cible se projette au centre ; projection puis rayon : le point retombe sur le rayon', () => {
    const c = jev.proj.project([0, 0, 0], cam);
    expect(c.x).toBeCloseTo(640, 6);
    expect(c.y).toBeCloseTo(360, 6);
    expect(c.visible).toBe(true);
    const p = [1.2, 0.7, -0.4];
    const s = jev.proj.project(p, cam);
    const ray = jev.proj.unproject(s.x, s.y, cam);
    const toP = jev.v3.norm(jev.v3.sub(p, ray.origin));
    expect(jev.v3.dot(toP, ray.dir)).toBeCloseTo(1, 9);
    expect(jev.proj.project([0, 0, 50], cam).visible).toBe(false); // derrière la caméra
    expect(jev.proj.fovFromFocal(50)).toBeCloseTo(26.99, 1); // 50 mm plein format : 27° vertical
    expect(jev.proj.focalFromFov(jev.proj.fovFromFocal(35))).toBeCloseTo(35, 9);
  });
  it('quaternions : slerp unitaire, rotation de 90° ; RK4 précis ; équation du 2nd degré', () => {
    const a = jev.quat.fromAxisAngle([0, 1, 0], 0), b = jev.quat.fromAxisAngle([0, 1, 0], Math.PI / 2);
    expect(Math.hypot(...jev.quat.slerp(a, b, 0.37))).toBeCloseTo(1, 12);
    const r = jev.quat.rotate(b, [1, 0, 0]);
    expect(r[0]).toBeCloseTo(0, 12);
    expect(r[2]).toBeCloseTo(-1, 12);
    let y = [1];
    for (let i = 0; i < 100; i++) y = jev.rk4((_t: number, v: number[]) => [v[0]!], y, i * 0.01, 0.01);
    expect(y[0]).toBeCloseTo(Math.E, 8);
    expect(jev.solveQuadratic(1, -3, 2)).toEqual([1, 2]);
    const n = jev.makeNoise(42);
    expect(n.noise3(1.5, 2.25, 0.5)).toBe(jev.makeNoise(42).noise3(1.5, 2.25, 0.5));
    expect(Math.abs(n.fbm(0.3, 0.7))).toBeLessThan(1);
  });
  it('physique : portée maximale à 45°, période du pendule, choc élastique, orbite de Kepler fermée', () => {
    expect(jev.physics.range(20, 45)).toBeCloseTo((20 * 20) / 9.80665, 9);
    expect(jev.physics.pendulumPeriod(1)).toBeCloseTo(2.0064, 3);
    const [v1, v2] = jev.physics.collide1D(1, 2, 1, 0);
    expect(v1).toBeCloseTo(0, 12);
    expect(v2).toBeCloseTo(2, 12);
    const p0 = jev.physics.keplerPosition(1, 0.3, 0), p1 = jev.physics.keplerPosition(1, 0.3, 2 * Math.PI);
    expect(p1[0]).toBeCloseTo(p0[0], 9);
    expect(p0[0]).toBeCloseTo(0.7, 9); // périhélie a(1 − e)
  });
});

describe('v64 — bibliothèque jev : mouvement humain (valeurs de manuel approchées)', () => {
  it('marche : hanche ≈ 30° au contact du talon, genou ≈ 60° en oscillation, cheville en flexion plantaire au décollement', () => {
    const g0 = jev.human.gait(0);
    expect(g0.hip).toBeCloseTo(30, 0);
    expect(g0.stance).toBe(true);
    let kneeMax = 0, kneeAt = 0, ankleMin = 0;
    for (let i = 0; i < 100; i++) {
      const g = jev.human.gait(i / 100);
      if (g.knee > kneeMax) [kneeMax, kneeAt] = [g.knee, i / 100];
      ankleMin = Math.min(ankleMin, g.ankle);
    }
    expect(kneeMax).toBeGreaterThan(55);
    expect(kneeMax).toBeLessThan(65);
    expect(kneeAt).toBeGreaterThan(0.6);
    expect(ankleMin).toBeLessThan(-15);
    expect(jev.human.gait(0.75).stance).toBe(false);
  });
  it('proportions : hanche ≈ cuisse + jambe + hauteur du pied ; foulée ≈ 1,4 m à 1,4 m/s pour 1,75 m', () => {
    const s = jev.human.segments(1.75);
    expect(s.thigh + s.shank + s.footHeight).toBeCloseTo(s.hipHeight, 1);
    expect(jev.human.strideLength(1.4, 1.75)).toBeCloseTo(1.42, 1);
  });
});

describe('v64 — JEV dirige le bac à sable', () => {
  it('fiches choisies selon la demande (quantique, mouvement…), caméra toujours pour la 3D ; sources et statut affichés', () => {
    const q = sandboxCards('Montre l’orbitale 3d de l’atome d’hydrogène en nuage de points', 'svg');
    expect(q[0]!.domain).toBe('quantique');
    const w = sandboxCards('Un homme marche dans un marché au coucher du soleil', '3d');
    expect(w.map((c) => c.domain)).toEqual(expect.arrayContaining(['mouvement', 'projection', 'lumière']));
    const block = sandboxBlock(w);
    expect(block).toContain('SAVOIRS DE JEV');
    expect(block).toContain('jev.human.gait');
    expect(block).toContain('valeurs de manuel approchées');
    expect(SANDBOX_CARDS.every((c) => c.sources.length > 0)).toBe(true);
  });
  it('la page réalisée importe « jev » par son nom (carte d’imports, data: autorisé par la politique de sécurité) ; Rapier proposé', () => {
    expect(LIBRARIES.find((l) => l.name === 'jev')?.url.startsWith('data:text/javascript;base64,')).toBe(true);
    expect(jevlibUrl().length).toBeGreaterThan(1000);
    const doc = buildDocument('<html><head></head><body></body></html>', {});
    expect(doc).toContain('"jev":"data:text/javascript;base64,');
    expect(doc).toMatch(/script-src[^;]*data:/);
    const sys = systemPrompt('3d', { ask: 'un pendule et une balle qui rebondit, physique réaliste' });
    expect(sys).toContain('import * as jev from "jev"');
    expect(sys).toContain('Physique classique juste');
    expect(sys).toContain('@dimforge/rapier3d-compat');
  });
});
