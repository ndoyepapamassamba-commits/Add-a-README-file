import { describe, expect, it } from 'vitest';
import { creerAleatoire } from '../src/noyau/aleatoire';
import { boutPose, calculerFK, limiterDoux, pointAttache } from '../src/rig/fk';
import { appliquerIK, distanceDouce, ikStandard, resoudreDeuxSegments } from '../src/rig/ik';
import {
  articulationEntre,
  construireSquelette,
  descriptionsHumanoide,
  distanceArborescente,
  indexerSquelette,
  membreDe,
  validerSquelette,
} from '../src/rig/squelette';
import type { Pose, TransformOs } from '../src/timeline/types';
import { ARTICULATIONS_FIGURE } from './rig.figure';

const squelette = construireSquelette(descriptionsHumanoide(ARTICULATIONS_FIGURE));
const idx = indexerSquelette(squelette);
const racine = { decalage: { x: 0, y: 0 }, rotation: 0, echelle: { x: 1, y: 1 }, flip: false };
const os = (rotation: number, echelle = { x: 1, y: 1 }, translation = { x: 0, y: 0 }): TransformOs => ({ rotation, translation, echelle });

describe('squelette', () => {
  it('construit les 18 os standard, parents d’abord, valides', () => {
    expect(squelette.os.length).toBe(18);
    expect(squelette.racine).toBe('bassin');
    expect(validerSquelette(squelette)).toEqual([]);
    for (let i = 0; i < squelette.os.length; i++) expect(idx.parents[i]!).toBeLessThan(i);
  });

  it('mesure les distances dans l’arbre et trouve les articulations', () => {
    const i = (n: string) => idx.index.get(n)!;
    expect(distanceArborescente(idx, i('brasG'), i('avantBrasG'))).toBe(1);
    expect(distanceArborescente(idx, i('brasG'), i('torse'))).toBe(2);
    expect(distanceArborescente(idx, i('mainG'), i('cuisseG'))).toBe(6);
    expect(articulationEntre(squelette, i('brasG'), i('avantBrasG'))).toEqual(ARTICULATIONS_FIGURE.coudeG);
    expect(membreDe(squelette, i('mainD'))).toBe('brasD');
    expect(membreDe(squelette, i('piedG'))).toBe('jambeG');
    expect(membreDe(squelette, i('epauleG'))).toBe('corps');
  });

  it('refuse un cycle ou un parent inconnu', () => {
    expect(() =>
      construireSquelette([
        { nom: 'a', parent: 'b', pivot: { x: 0, y: 0 }, bout: { x: 1, y: 0 } },
        { nom: 'b', parent: 'a', pivot: { x: 0, y: 0 }, bout: { x: 1, y: 0 } },
      ]),
    ).toThrow(/cycle/);
    expect(() => construireSquelette([{ nom: 'a', parent: 'z', pivot: { x: 0, y: 0 }, bout: { x: 1, y: 0 } }])).toThrow(/inconnu/);
  });
});

describe('cinématique directe', () => {
  it('donne l’identité au repos', () => {
    const e = calculerFK(squelette, { os: {}, racine });
    for (const m of e.peau) expect([m.a, m.b, m.c, m.d, m.tx, m.ty]).toEqual([1, 0, -0, 1, 0, 0].map((x, k) => (k === 2 ? m.c : x)));
    for (const m of e.peau) expect(Math.abs(m.c)).toBe(0);
  });

  it('fait tourner les enfants avec le parent, autour du bon pivot', () => {
    const pose: Pose = { os: { brasG: os(-Math.PI / 2) }, racine };
    const e = calculerFK(squelette, pose, { limites: false });
    const iB = idx.index.get('brasG')!;
    const iM = idx.index.get('mainG')!;
    // Le pivot de l'épaule ne bouge pas.
    expect(e.pivots[iB]!.x).toBeCloseTo(ARTICULATIONS_FIGURE.epauleG.x, 9);
    // Le poignet a tourné de −90° autour de l'épaule.
    const p = ARTICULATIONS_FIGURE.poignetG;
    const c = ARTICULATIONS_FIGURE.epauleG;
    const attendu = { x: c.x + (p.y - c.y), y: c.y - (p.x - c.x) };
    expect(e.pivots[iM]!.x).toBeCloseTo(attendu.x, 9);
    expect(e.pivots[iM]!.y).toBeCloseTo(attendu.y, 9);
  });

  it('étire un os le long de son axe sans déformer ses enfants', () => {
    const pose: Pose = { os: { avantBrasD: os(0, { x: 1.5, y: 1 }) }, racine };
    const e = calculerFK(squelette, pose);
    const iA = idx.index.get('avantBrasD')!;
    const iM = idx.index.get('mainD')!;
    const a = ARTICULATIONS_FIGURE;
    // Le poignet s'éloigne du coude de 50 %.
    const attendu = { x: a.coudeD.x + 1.5 * (a.poignetD.x - a.coudeD.x), y: a.coudeD.y + 1.5 * (a.poignetD.y - a.coudeD.y) };
    expect(e.pivots[iM]!.x).toBeCloseTo(attendu.x, 9);
    expect(e.pivots[iM]!.y).toBeCloseTo(attendu.y, 9);
    expect(boutPose(squelette, e, iA).x).toBeCloseTo(attendu.x, 9);
    // La main est seulement translatée : sa matrice linéaire reste l'identité.
    const m = e.peau[iM]!;
    expect(m.a).toBeCloseTo(1, 12);
    expect(m.d).toBeCloseTo(1, 12);
    expect(pointAttache(squelette, e, 'mainD', a.boutMainD).x).toBeCloseTo(attendu.x + (a.boutMainD.x - a.poignetD.x), 9);
  });

  it('applique les limites en contrainte douce et continue', () => {
    expect(limiterDoux(0.3, -1, 1)).toBe(0.3);
    expect(limiterDoux(5, -1, 1)).toBeLessThan(1.08 + 1e-12);
    expect(limiterDoux(5, -1, 1)).toBeGreaterThan(1.07);
    const h = 1e-6;
    expect((limiterDoux(1 + h, -1, 1) - limiterDoux(1 - h, -1, 1)) / (2 * h)).toBeCloseTo(1, 4);
    const e = calculerFK(squelette, { os: { tete: os(3) }, racine });
    expect(e.rotationsLocales[idx.index.get('tete')!]!).toBeLessThan(0.7 + 0.08 + 1e-9);
  });
});

describe('cinématique inverse à deux os', () => {
  it('atteint exactement les cibles atteignables (IK dure)', () => {
    const al = creerAleatoire(42);
    for (let k = 0; k < 500; k++) {
      const L1 = al.plage(20, 200);
      const L2 = al.plage(20, 200);
      const d = al.plage(Math.abs(L1 - L2) + 1, L1 + L2 - 1);
      const a = al.plage(-Math.PI, Math.PI);
      const r = { x: al.plage(-50, 50), y: al.plage(-50, 50) };
      const cible = { x: r.x + d * Math.cos(a), y: r.y + d * Math.sin(a) };
      const s = resoudreDeuxSegments(r, L1, L2, cible, al.suivant() < 0.5 ? 1 : -1);
      expect(s.ecart).toBeLessThan(1e-6);
      expect(Math.hypot(s.coude.x - r.x, s.coude.y - r.y)).toBeCloseTo(L1, 9);
    }
  });

  it('plie du côté demandé', () => {
    const r = { x: 0, y: 0 };
    const cible = { x: 0, y: 100 };
    const plus = resoudreDeuxSegments(r, 80, 80, cible, 1);
    const moins = resoudreDeuxSegments(r, 80, 80, cible, -1);
    // +1 : l'os inférieur tourne en sens horaire par rapport au supérieur.
    const rel = (s: typeof plus) => Math.atan2(Math.sin(s.angleBas - s.angleHaut), Math.cos(s.angleBas - s.angleHaut));
    expect(rel(plus)).toBeGreaterThan(0);
    expect(rel(moins)).toBeLessThan(0);
  });

  it('IK douce : continue près de l’extension, sans claquement', () => {
    const L = 300;
    let precedent = resoudreDeuxSegments({ x: 0, y: 0 }, 150, 150, { x: 240, y: 0 }, 1, 0.05).angleHaut;
    let sautMax = 0;
    for (let d = 240; d <= 360; d += 0.3) {
      const a = resoudreDeuxSegments({ x: 0, y: 0 }, 150, 150, { x: d, y: 0 }, 1, 0.05).angleHaut;
      sautMax = Math.max(sautMax, Math.abs(a - precedent));
      precedent = a;
    }
    expect((sautMax * 180) / Math.PI).toBeLessThan(0.5);
    expect(distanceDouce(310, L, 0.05)).toBeLessThan(L);
    expect(distanceDouce(310, L, 0.05)).toBeGreaterThan(0.95 * L);
    expect(distanceDouce(100, L, 0.05)).toBe(100);
  });

  it('amène la main du personnage sur la cible via la pose', () => {
    const defs = ikStandard(0, 0);
    const brasG = defs.find((d) => d.nom === 'brasG')!;
    const al = creerAleatoire(7);
    const a = ARTICULATIONS_FIGURE;
    const L1 = Math.hypot(a.coudeG.x - a.epauleG.x, a.coudeG.y - a.epauleG.y);
    const L2 = Math.hypot(a.poignetG.x - a.coudeG.x, a.poignetG.y - a.coudeG.y);
    let reussies = 0;
    for (let k = 0; k < 200; k++) {
      const d = al.plage(Math.abs(L1 - L2) + 5, L1 + L2 - 5);
      const ang = al.plage(-0.4, 2.2); // vers l'extérieur et le bas (dans les limites)
      const cible = { x: a.epauleG.x + d * Math.cos(ang), y: a.epauleG.y + d * Math.sin(ang) };
      const r = appliquerIK(squelette, { os: {}, racine }, brasG, cible, { limites: false });
      const e = calculerFK(squelette, r.pose, { limites: false });
      const main = e.pivots[idx.index.get('mainG')!]!;
      expect(Math.hypot(main.x - cible.x, main.y - cible.y)).toBeLessThan(1e-6);
      reussies++;
    }
    expect(reussies).toBe(200);
  });

  it('respecte la limite du coude et vise au mieux', () => {
    const brasD = ikStandard(0, 0).find((d) => d.nom === 'brasD')!;
    // Cible qui demanderait de plier le coude « à l'envers ».
    const a = ARTICULATIONS_FIGURE;
    const cible = { x: a.epauleD.x - 150, y: a.epauleD.y + 20 };
    const r = appliquerIK(squelette, { os: {}, racine }, brasD, cible);
    const lim = squelette.os[idx.index.get('avantBrasD')!]!.limites!;
    expect(r.pose.os['avantBrasD']!.rotation).toBeGreaterThanOrEqual(lim.min - 1e-9);
    expect(r.pose.os['avantBrasD']!.rotation).toBeLessThanOrEqual(lim.max + 1e-9);
  });

  it('mélange FK → IK sans modifier la pose d’entrée', () => {
    const brasG = ikStandard(0).find((d) => d.nom === 'brasG')!;
    const pose: Pose = { os: { brasG: os(0.1) }, racine };
    const copie = JSON.stringify(pose);
    const r0 = appliquerIK(squelette, pose, brasG, { x: 220, y: 200 }, { melange: 0 });
    expect(r0.pose.os['brasG']!.rotation).toBeCloseTo(0.1, 12);
    expect(JSON.stringify(pose)).toBe(copie);
  });
});
