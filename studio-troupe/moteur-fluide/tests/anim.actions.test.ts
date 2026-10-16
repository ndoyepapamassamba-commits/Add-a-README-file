/**
 * Tests de la bibliothèque d'actions : catalogue couvert, retour au repos, amplitude lisible, continuité à 60 i/s,
 * anticipation, dépassement, chevauchement, déterminisme.
 */
import { describe, expect, it } from 'vitest';
import { fournisseurPose } from '../src/anim';
import { RECETTES, recette } from '../src/anim/actions';
import { ACTIONS_CATALOGUE, type ActionPlacee, type Pose } from '../src/timeline/types';
import { canauxPose, contexte, ecartPoses, projetTest, RIG_TEST } from './aides/scene';

const VERS_COUMBA = { personnage: 'coumba' } as const;

/** Action de test (cible et paramètres usuels). */
function actionTest(id: string, debut = 1): Omit<ActionPlacee, 'personnage'> {
  const a: Omit<ActionPlacee, 'personnage'> = { action: id, debut, cible: VERS_COUMBA };
  if (id === 'marcher') a.parametres = { vers: { u: 0.3, v: 0.95 } };
  if (id === 'prendre' || id === 'poser') a.cible = { point: { u: 0.48, v: 0.93 } };
  return a;
}

const base = projetTest([], [], 12);
const poseA = (p: ReturnType<typeof projetTest>, t: number): Pose => fournisseurPose(contexte(p, t));

describe('catalogue', () => {
  it('chaque action du catalogue a une recette', () => {
    for (const id of ACTIONS_CATALOGUE) expect(recette(id), id).not.toBeNull();
  });
  it('accepte les noms de la spécification en snake_case', () => {
    expect(recette('hausser_epaules')?.id).toBe('hausserEpaules');
    expect(recette('mains_ouvertes')?.id).toBe('mainsOuvertes');
    expect(recette('bras_croises')?.id).toBe('brasCroises');
    expect(recette('s_arreter')?.id).toBe('sArreter');
    expect(recette('se_tourner')?.id).toBe('seTourner');
    expect(recette('parler_gestes')?.id).toBe('parler');
    expect(recette('rire_flexion')?.id).toBe('rireFlexion');
    expect(recette('inconnue')).toBeNull();
  });
});

describe('retour au repos', () => {
  for (const id of Object.keys(RECETTES)) {
    it(`${id} rend la pose de repos après sa durée`, () => {
      const p = projetTest([actionTest(id)], [], 12);
      const r = RECETTES[id]!;
      const D = id === 'marcher' ? 1.6 : r.dureeDefaut;
      const t = 1 + D + 2.5;
      const e = ecartPoses(poseA(p, t), poseA(base, t));
      expect(e.rotation, e.pire).toBeLessThan(1e-3);
      expect(e.translation, e.pire).toBeLessThan(0.05);
      expect(e.echelle, e.pire).toBeLessThan(1e-4);
      // Et rien ne bouge avant l'action (au-delà de l'anticipation de 0,1 s).
      const avant = ecartPoses(poseA(p, 0.85), poseA(base, 0.85));
      expect(avant.rotation + avant.translation + avant.echelle).toBeLessThan(1e-9);
    });
  }
});

/** Écart maximal (rotation en degrés, translation en % de la taille, échelle) pendant l'action. */
function amplitude(id: string): { rot: number; tr: number; ech: number } {
  const p = projetTest([actionTest(id)], [], 12);
  let rot = 0;
  let tr = 0;
  let ech = 0;
  for (let t = 0.9; t < 5; t += 1 / 30) {
    const e = ecartPoses(poseA(p, t), poseA(base, t));
    rot = Math.max(rot, (e.rotation * 180) / Math.PI);
    tr = Math.max(tr, (100 * e.translation) / RIG_TEST.hauteurPx);
    ech = Math.max(ech, e.echelle);
  }
  return { rot, tr, ech };
}

describe('amplitude lisible sur téléphone', () => {
  const gestes: Record<string, number> = {
    pointer: 70,
    hausserEpaules: 35,
    mainsOuvertes: 40,
    brasCroises: 90,
    surprise: 45,
    colere: 30,
    gene: 100,
    rire: 80,
    rireFlexion: 80,
    recul: 80,
    flexion: 45,
    marcher: 30,
    sAsseoir: 20,
    prendre: 40,
    poser: 40,
  };
  for (const [id, min] of Object.entries(gestes)) {
    it(`${id} tourne un os d'au moins ${min}°`, () => {
      expect(amplitude(id).rot).toBeGreaterThan(min);
    });
  }
  it('hausserEpaules monte les épaules de plus de 4 % de la taille', () => {
    expect(amplitude('hausserEpaules').tr).toBeGreaterThan(4);
  });
  it('surprise fait sauter le corps (≥ 3 % de la taille) et l’étire (≥ 6 %)', () => {
    const a = amplitude('surprise');
    expect(a.tr).toBeGreaterThan(3);
    expect(a.ech).toBeGreaterThan(0.06);
  });
  it('seTourner écrase la silhouette à moins de 20 % de sa largeur', () => {
    expect(amplitude('seTourner').ech).toBeGreaterThan(0.8);
  });
  it('regarder et hocher déplacent la tête de plus de 1,4 % de la taille', () => {
    expect(amplitude('regarder').tr).toBeGreaterThan(1.4);
    expect(amplitude('hocher').tr).toBeGreaterThan(1.4);
  });
});

describe('continuité à 60 i/s', () => {
  // Bornes de vitesse (par seconde) : une discontinuité donnerait un saut fini sur un pas infinitésimal.
  const VMAX = { r: 40, t: 8000, s: 40 };
  for (const id of Object.keys(RECETTES)) {
    it(`${id} : aucun saut entre images, aucune valeur non finie`, () => {
      const p = projetTest([actionTest(id)], [], 12);
      let precedent: Record<string, number> | null = null;
      let pireImage = 0;
      for (let n = 50; n <= 300; n++) {
        const t = n / 60;
        const c = canauxPose(poseA(p, t));
        const c2 = canauxPose(poseA(p, t + 1e-4));
        for (const [k, v] of Object.entries(c)) {
          expect(Number.isFinite(v), k).toBe(true);
          const type = k.slice(k.lastIndexOf('.') + 1);
          const vmax = type === 'r' ? VMAX.r : type === 'tx' || type === 'ty' ? VMAX.t : VMAX.s;
          expect(Math.abs((c2[k] ?? 0) - v), `${k} à ${t.toFixed(3)} s`).toBeLessThan(vmax * 1e-4 * 1.5 + 1e-9);
          if (precedent && type === 'r') pireImage = Math.max(pireImage, Math.abs(v - (precedent[k] ?? 0)));
        }
        precedent = c;
      }
      // Aucune rotation de plus de 20° d'une image à la suivante (60 i/s).
      expect(pireImage).toBeLessThan((20 * Math.PI) / 180);
    });
  }
});

/** Série temporelle d'un canal de la pose. */
function serie(id: string, canal: string, debut: number, fin: number, pas = 1 / 120): Array<[number, number]> {
  const p = projetTest([actionTest(id)], [], 12);
  const r: Array<[number, number]> = [];
  for (let t = debut; t <= fin; t += pas) {
    const a = canauxPose(poseA(p, t))[canal] ?? 0;
    const b = canauxPose(poseA(base, t))[canal] ?? 0;
    r.push([t, a - b]);
  }
  return r;
}

describe('principes du jeu', () => {
  it('pointer : anticipation à l’envers, puis dépassement de la cible, puis tenue', () => {
    // Coumba est à droite de l'image : le bras G (côté image droit) pointe.
    const s = serie('pointer', 'brasG.r', 0.95, 2.2);
    const pic = s.reduce((m, x) => (Math.abs(x[1]) > Math.abs(m[1]) ? x : m));
    const signe = Math.sign(pic[1]);
    const anticipation = s.filter(([t]) => t < 1.2).reduce((m, x) => Math.min(m, signe * x[1]), 0);
    expect(anticipation).toBeLessThan(-0.05); // part à l'envers d'au moins 3°
    const tenue = s.find(([t]) => t > 1.85)![1];
    const depassement = (signe * pic[1] - signe * tenue) / Math.abs(tenue);
    expect(depassement).toBeGreaterThan(0.03);
    expect(depassement).toBeLessThan(0.35);
  });
  it('pointer : la main arrive après le bras (chevauchement)', () => {
    const moitie = (s: Array<[number, number]>): number => {
      const max = Math.max(...s.map(([, v]) => Math.abs(v)));
      return s.find(([t, v]) => t > 1.1 && Math.abs(v) > 0.5 * max)![0];
    };
    expect(moitie(serie('pointer', 'mainG.r', 0.95, 2.2))).toBeGreaterThan(moitie(serie('pointer', 'brasG.r', 0.95, 2.2)));
  });
  it('surprise : écrasement (anticipation) avant l’extension', () => {
    const s = serie('surprise', 'racine.sy', 0.95, 1.8);
    const min = Math.min(...s.filter(([t]) => t < 1.12).map(([, v]) => v));
    const max = Math.max(...s.map(([, v]) => v));
    expect(min).toBeLessThan(-0.02);
    expect(max).toBeGreaterThan(0.06);
    expect(s.find(([, v]) => v === min)![0]).toBeLessThan(s.find(([, v]) => v === max)![0]);
  });
  it('hausserEpaules : les épaules descendent un peu avant de monter', () => {
    const s = serie('hausserEpaules', 'epauleD.ty', 0.95, 2);
    const desc = Math.max(...s.filter(([t]) => t < 1.12).map(([, v]) => v)); // ty > 0 = vers le bas
    const mont = Math.min(...s.map(([, v]) => v));
    expect(desc).toBeGreaterThan(1);
    expect(mont).toBeLessThan(-40);
  });
});

describe('limites articulaires', () => {
  // Le rig de référence porte les mêmes limites que les rigs construits par `rig/` (coude et genou ne plient que
  // d'un côté) : les actions doivent y tenir, sinon le rig les écrase et le geste est perdu.
  for (const id of Object.keys(RECETTES)) {
    it(`${id} reste dans les limites des articulations (± 3°)`, () => {
      const p = projetTest([actionTest(id)], [], 12);
      const marge = (3 * Math.PI) / 180;
      for (let t = 0.9; t < 4.5; t += 1 / 30) {
        const pose = poseA(p, t);
        for (const o of RIG_TEST.squelette.os) {
          if (!o.limites) continue;
          const r = pose.os[o.nom]?.rotation ?? 0;
          expect(r, `${o.nom} à ${t.toFixed(2)} s`).toBeGreaterThanOrEqual(o.limites.min - marge);
          expect(r, `${o.nom} à ${t.toFixed(2)} s`).toBeLessThanOrEqual(o.limites.max + marge);
        }
      }
    });
  }
});

describe('déterminisme', () => {
  it('même pose quel que soit l’ordre d’évaluation', () => {
    const actions = ['pointer', 'surprise', 'rire', 'marcher'].map((id, i) => actionTest(id, 0.5 + i * 2));
    const instants = Array.from({ length: 120 }, (_, i) => i / 15);
    const avant = instants.map((t) => poseA(projetTest(actions, [], 12), t));
    const p = projetTest(actions, [], 12);
    const melange = [...instants].reverse().map((t) => [t, poseA(p, t)] as const);
    const parT = new Map(melange.map(([t, x]) => [t, x]));
    instants.forEach((t, i) => expect(JSON.stringify(parT.get(t))).toBe(JSON.stringify(avant[i])));
  });
  it('la pose est sérialisable en JSON sans perte', () => {
    const p = projetTest([actionTest('brasCroises')], [], 12);
    const pose = poseA(p, 2.2);
    expect(JSON.parse(JSON.stringify(pose))).toEqual(pose);
    expect(pose.ordreGroupes).toBeDefined();
  });
});
