/**
 * Tests du mélange en couches : priorités, interruptions, protection, vie de base implicite, gestes de parole,
 * marche sans glissement, pieds au sol pendant les flexions, miroir du demi-tour, chaînes secondaires.
 */
import { describe, expect, it } from 'vitest';
import { compilerAnimation, fournisseurPose, rigReference } from '../src/anim';
import { consignesDepuisEvenements, courbe, evenementsPL, ponderePL, valeurPL } from '../src/anim/canaux';
import { hauteurMondePersonnage } from '../src/timeline/projection';
import { positionAuSol } from '../src/timeline/trajets';
import type { CharacterRig, Pose, Replique } from '../src/timeline/types';
import { extremiteOs, pointOs } from './aides/fk';
import { canauxPose, contexte, DECOR_TEST, projetTest, RIG_TEST } from './aides/scene';

const poseA = (p: ReturnType<typeof projetTest>, t: number, id = 'modou', rig?: CharacterRig): Pose =>
  fournisseurPose(contexte(p, t, id, rig ?? RIG_TEST));
const canal = (p: ReturnType<typeof projetTest>, t: number, c: string): number => canauxPose(poseA(p, t))[c] ?? 0;

describe('courbes linéaires par morceaux', () => {
  it('valeur, marches, pondération et conversion en consignes', () => {
    const c = courbe([
      [0, 0],
      [1, 2],
      [1, 5],
      [2, 5],
      [3, 0],
    ]);
    expect(valeurPL(c, -1)).toBe(0);
    expect(valeurPL(c, 0.5)).toBeCloseTo(1);
    expect(valeurPL(c, 1)).toBe(5);
    expect(valeurPL(c, 2.5)).toBeCloseTo(2.5);
    const w = ponderePL(c, (t) => (t < 1.5 ? 1 : t > 1.6 ? 0.5 : 1 - 5 * (t - 1.5)), [[1.5, 1.6]]);
    expect(valeurPL(w, 1.2)).toBeCloseTo(5);
    expect(valeurPL(w, 2)).toBeCloseTo(2.5);
    const { initiale, consignes } = consignesDepuisEvenements(evenementsPL(c));
    expect(initiale).toBe(0);
    expect(consignes[consignes.length - 1]!.v).toBeCloseTo(0);
  });
});

describe('priorités et interruptions', () => {
  it('un geste prioritaire efface le geste en cours sur la même zone, qui reprend ensuite', () => {
    const seul = projetTest([{ action: 'mainsOuvertes', debut: 1, duree: 4 }], [], 10);
    const interrompu = projetTest(
      [
        { action: 'mainsOuvertes', debut: 1, duree: 4 },
        { action: 'pointer', debut: 2, duree: 1.2, cible: { personnage: 'coumba' } },
      ],
      [],
      10,
    );
    const pointe = projetTest([{ action: 'pointer', debut: 2, duree: 1.2, cible: { personnage: 'coumba' } }], [], 10);
    // Pendant la tenue du pointage : le bras G est celui du pointage seul (mains ouvertes effacées).
    const t = 2.75;
    expect(canal(interrompu, t, 'brasG.r')).toBeCloseTo(canal(pointe, t, 'brasG.r'), 1);
    // Après le pointage, les mains ouvertes reprennent (tenue jusqu'à 5 s).
    expect(Math.abs(canal(interrompu, 4.3, 'avantBrasG.r') - canal(seul, 4.3, 'avantBrasG.r'))).toBeLessThan(0.05);
  });
  it('une action protégée (prise de surprise) n’est pas interrompue pendant sa protection', () => {
    const surprise = projetTest([{ action: 'surprise', debut: 1, cible: { personnage: 'coumba' } }], [], 10);
    const tentative = projetTest(
      [
        { action: 'surprise', debut: 1, cible: { personnage: 'coumba' } },
        { action: 'surprise', debut: 1.05, priorite: 9, cible: { personnage: 'coumba' } },
      ],
      [],
      10,
    );
    // La deuxième prise attend la fin de la protection de la première (≈ 0,25 s).
    const ecart = Math.abs(canal(tentative, 1.15, 'brasD.r') - canal(surprise, 1.15, 'brasD.r'));
    expect(ecart).toBeLessThan(0.03);
  });
  it('un geste plus faible arrivant pendant un geste fort reste atténué jusqu’à sa fin', () => {
    const fort = projetTest([{ action: 'brasCroises', debut: 1, duree: 3 }], [], 10);
    const mix = projetTest(
      [
        { action: 'brasCroises', debut: 1, duree: 3 },
        { action: 'parler', debut: 2, duree: 1, parametres: {} },
      ],
      [],
      10,
    );
    expect(Math.abs(canal(mix, 2.5, 'avantBrasD.r') - canal(fort, 2.5, 'avantBrasD.r'))).toBeLessThan(0.02);
  });
});

describe('vie de base', () => {
  it('respiration permanente : la poitrine se gonfle d’environ 2 % avec une période de 3,6 à 4,4 s', () => {
    const p = projetTest([], [], 30);
    const s: number[] = [];
    for (let t = 2; t < 22; t += 0.05) s.push(canal(p, t, 'torse.sy'));
    const ampl = Math.max(...s) - Math.min(...s);
    expect(ampl).toBeGreaterThan(0.012);
    expect(ampl).toBeLessThan(0.05);
    // Période par passages au-dessus de la moyenne.
    const moy = s.reduce((a, b) => a + b, 0) / s.length;
    const montees = s.map((v, i) => (i > 0 && s[i - 1]! < moy && v >= moy ? i : -1)).filter((i) => i >= 0);
    const periode = ((montees[montees.length - 1]! - montees[0]!) / (montees.length - 1)) * 0.05;
    expect(periode).toBeGreaterThan(3.4);
    expect(periode).toBeLessThan(4.6);
  });
  it('attente vivante : reports de poids réguliers, jamais figée', () => {
    const p = projetTest([], [], 30);
    const xs: number[] = [];
    for (let t = 1; t < 25; t += 0.1) xs.push(canal(p, t, 'racine.tx'));
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.015 * RIG_TEST.hauteurPx);
    const tete: number[] = [];
    for (let t = 1; t < 25; t += 0.1) tete.push(canal(p, t, 'tete.r'));
    expect(Math.max(...tete) - Math.min(...tete)).toBeGreaterThan((1.5 * Math.PI) / 180);
  });
  it('actions implicites : respiration, attente, gestes de parole, regards (locuteur et auditeur)', () => {
    const r: Replique = { id: 'r', personnage: 'modou', texte: 'Coumba, viens ici tout de suite !', debut: 1, destinataire: 'coumba' };
    const p = projetTest([], [r], 6);
    const modou = compilerAnimation(contexte(p, 1, 'modou'))!;
    const ids = modou.actions.filter((a) => a.implicite).map((a) => a.recette.id);
    expect(ids).toEqual(expect.arrayContaining(['respirer', 'attendre', 'parler', 'regarder']));
    const coumba = compilerAnimation(contexte(p, 1, 'coumba'))!;
    expect(coumba.actions.some((a) => a.implicite && a.recette.id === 'regarder')).toBe(true);
    // Le locuteur regarde son destinataire (à droite de l'image), l'auditeur le locuteur (à gauche).
    expect(modou.cibleRegard(2).x).toBeGreaterThan(0.5);
    expect(coumba.cibleRegard(2).x).toBeLessThan(-0.5);
  });
  it('gestes de parole calés sur les accents : battements de l’avant-bras autour des syllabes accentuées', () => {
    const r: Replique = {
      id: 'r',
      personnage: 'modou',
      texte: 'Coumba !',
      debut: 1,
      phonemes: [
        { ph: 'k', debut: 0, fin: 0.06 },
        { ph: 'u', debut: 0.06, fin: 0.16 },
        { ph: 'm', debut: 0.16, fin: 0.24 },
        { ph: 'b', debut: 0.24, fin: 0.3 },
        { ph: 'a', debut: 0.3, fin: 0.6, accent: true },
      ],
      destinataire: 'coumba',
    };
    const parle = projetTest([], [r], 5);
    const muet = projetTest([], [], 5);
    let max = 0;
    let tMax = 0;
    for (let t = 0.6; t < 2.5; t += 1 / 120) {
      const d = Math.abs(canal(parle, t, 'avantBrasG.r') - canal(muet, t, 'avantBrasG.r'));
      if (d > max) {
        max = d;
        tMax = t;
      }
    }
    expect(max).toBeGreaterThan((25 * Math.PI) / 180);
    expect(tMax).toBeGreaterThan(1.1);
    expect(tMax).toBeLessThan(2.2);
  });
});

describe('marche', () => {
  it('le pied d’appui ne glisse pas (< 12 % de la vitesse de marche)', () => {
    const p = projetTest([{ action: 'marcher', debut: 1, duree: 2.4, parametres: { vers: { u: 0.15, v: 0.95 } } }], [], 6);
    const plan = p.plans[0]!;
    const placement = plan.personnages[0]!;
    const hm = hauteurMondePersonnage(DECOR_TEST, 1.76, 0.95);
    const echelle = hm / RIG_TEST.hauteurPx;
    let glissement = 0;
    let parcours = 0;
    let prec: { pied: string; x: number; corps: number } | null = null;
    for (let t = 1.35; t < 3.05; t += 1 / 60) {
      const pose = poseA(p, t);
      const pos = positionAuSol(p, plan, placement, t, 0.95, 2);
      const pieds = ['piedG', 'piedD'].map((n) => ({ n, q: pointOs(RIG_TEST, pose, n, RIG_TEST.squelette.os.find((o) => o.nom === n)!.pivot) }));
      pieds.sort((a, b) => b.q.y - a.q.y);
      const appui = pieds[0]!;
      if (appui.q.y - pieds[1]!.q.y < 2) {
        prec = null;
        continue;
      }
      const x = pos.u * 2 + (appui.q.x - RIG_TEST.ancrageSol.x) * echelle;
      if (prec && prec.pied === appui.n) {
        glissement += Math.abs(x - prec.x);
        parcours += Math.abs(pos.u * 2 - prec.corps);
      }
      prec = { pied: appui.n, x, corps: pos.u * 2 };
    }
    expect(parcours).toBeGreaterThan(0.1);
    expect(glissement / parcours).toBeLessThan(0.12);
  });
  it('le bassin rebondit et les pieds levés passent au-dessus du sol', () => {
    const p = projetTest([{ action: 'marcher', debut: 1, duree: 2.4, parametres: { vers: { u: 0.15, v: 0.95 } } }], [], 6);
    const ty: number[] = [];
    let leveMax = 0;
    for (let t = 1.4; t < 3; t += 1 / 60) {
      const pose = poseA(p, t);
      ty.push(pose.racine.decalage.y);
      const yG = extremiteOs(RIG_TEST, pose, 'jambeG').y;
      const yD = extremiteOs(RIG_TEST, pose, 'jambeD').y;
      leveMax = Math.max(leveMax, Math.abs(yG - yD));
    }
    expect(Math.max(...ty) - Math.min(...ty)).toBeGreaterThan(0.008 * RIG_TEST.hauteurPx);
    expect(leveMax).toBeGreaterThan(0.03 * RIG_TEST.hauteurPx);
  });
});

describe('pieds au sol', () => {
  for (const id of ['flexion', 'rireFlexion', 'sAsseoir', 'seLever', 'recul']) {
    it(`${id} : les chevilles restent à moins de 1,5 % de la taille de leur hauteur de repos`, () => {
      const p = projetTest([{ action: id, debut: 1 }], [], 6);
      const repos = extremiteOs(RIG_TEST, poseA(projetTest([], [], 6), 0.5), 'jambeG').y;
      let ecart = 0;
      for (let t = 1; t < 4; t += 1 / 30) ecart = Math.max(ecart, Math.abs(extremiteOs(RIG_TEST, poseA(p, t), 'jambeG').y - repos));
      expect(ecart).toBeLessThan(0.015 * RIG_TEST.hauteurPx);
    });
  }
});

describe('pieds fixes pendant les reports de poids', () => {
  for (const [nom, actions] of [
    ['attente', []],
    ['recul', [{ action: 'recul', debut: 1, cible: { personnage: 'coumba' } }]],
    ['gêne', [{ action: 'gene', debut: 1, cible: { personnage: 'coumba' } }]],
    ['colère', [{ action: 'colere', debut: 1, cible: { personnage: 'coumba' } }]],
  ] as const) {
    // Les semelles restent au sol ; les chevilles (6,5 % au-dessus de l'ancrage) suivent seulement l'inclinaison
    // du corps entier autour des pieds (≤ 4° dans le recul).
    it(`${nom} : les chevilles glissent de moins de 0,8 % de la taille`, () => {
      const p = projetTest(actions as never, [], 25);
      const xs: Record<string, number[]> = { jambeG: [], jambeD: [] };
      for (let t = 0.5; t < 20; t += 1 / 15) {
        const pose = poseA(p, t);
        for (const n of ['jambeG', 'jambeD']) xs[n]!.push(extremiteOs(RIG_TEST, pose, n).x);
      }
      for (const n of ['jambeG', 'jambeD']) {
        const l = xs[n]!;
        expect(Math.max(...l) - Math.min(...l), n).toBeLessThan(0.008 * RIG_TEST.hauteurPx);
      }
    });
  }
});

describe('demi-tour', () => {
  it('le miroir bascule au milieu, au plus fort de l’écrasement', () => {
    const profil = rigReference(1000, 1, 'ref');
    const p = projetTest([{ action: 'seTourner', debut: 1, duree: 0.6 }], [], 4);
    const avant = poseA(p, 1.29, 'modou', profil);
    const apres = poseA(p, 1.31, 'modou', profil);
    expect(avant.racine.flip).toBe(false);
    expect(apres.racine.flip).toBe(true);
    expect(avant.racine.echelle.x).toBeLessThan(0.2);
    expect(apres.racine.echelle.x).toBeLessThan(0.2);
    expect(poseA(p, 2.5, 'modou', profil).racine.echelle.x).toBeCloseTo(1, 3);
  });
});

describe('secondaire', () => {
  it('une chaîne du rig traîne puis rebondit quand le porteur bouge, et revient au repos', () => {
    const rig = rigReference(1000, 0, 'ref');
    // Pan de tissu accroché au bassin : deux maillons pendants.
    const bassin = rig.squelette.os.find((o) => o.nom === 'bassin')!;
    rig.squelette.os.push(
      { nom: 'pan1', parent: 'bassin', pivot: { x: bassin.pivot.x + 30, y: bassin.pivot.y + 40 }, longueur: 80, angleRepos: Math.PI / 2 },
      { nom: 'pan2', parent: 'pan1', pivot: { x: bassin.pivot.x + 30, y: bassin.pivot.y + 120 }, longueur: 80, angleRepos: Math.PI / 2 },
    );
    rig.secondaire = [{ nom: 'pan', os: ['pan1', 'pan2'], ressort: { f: 1.6, zeta: 0.25 }, gravite: 0.6 }];
    const p = projetTest([{ action: 'surprise', debut: 1, cible: { personnage: 'coumba' } }], [], 8);
    let max = 0;
    for (let t = 1; t < 3; t += 1 / 30) max = Math.max(max, Math.abs(poseA(p, t, 'modou', rig).os['pan2']?.rotation ?? 0));
    expect(max).toBeGreaterThan(0.02);
    expect(Math.abs(poseA(p, 7.9, 'modou', rig).os['pan2']?.rotation ?? 0)).toBeLessThan(1e-3);
  });
});
