/**
 * Porte qualité sur l'état : suites d'états synthétiques (personnage figé, jeu lisse, jeu bruité, saut de pose,
 * gel voulu, pied qui glisse, synchro labiale, caméra qui saute) → PASS / FAIL attendus.
 */
import { describe, expect, it } from 'vitest';
import { rigReference } from '../src/anim/corps';
import { creerAleatoire } from '../src/noyau/aleatoire';
import { centile, correlation, extraireSeries, mesurerCamera, mesurerLevres, mesurerPersonnage } from '../src/qa/metriques';
import { porteEtats } from '../src/qa/porte';
import { cameraNeutre, effetsNeutres, etalonnageNeutre, ombreNeutre, poseNeutre, visageNeutre } from '../src/timeline/neutres';
import type { CharacterRig, EtatCamera, EtatImage, EtatPersonnage, EtatVisage, Pose } from '../src/timeline/types';

const FPS = 30;
const L = 1080;
const H = 1920;

/** Rig de référence sans limites articulaires (les rotations synthétiques restent linéaires). */
function rigTest(): CharacterRig {
  const r = rigReference(1000, 0, 'ref');
  return { ...r, squelette: { ...r.squelette, os: r.squelette.os.map(({ limites: _l, ...o }) => o) } };
}
const RIG = rigTest();
const RIGS = { ref: RIG };
/** Personnage de 0,5 unité monde (960 px à zoom 1), pieds en (1, 0,9). */
const ECHELLE = 0.5 / RIG.hauteurPx;

interface Jeu {
  pose?: (t: number) => Pose;
  visage?: (t: number) => Partial<EtatVisage>;
  position?: (t: number) => { x: number; y: number };
  camera?: (t: number) => Partial<EtatCamera>;
  tJeu?: (t: number) => number;
  plan?: (t: number) => string;
}

function poseAvec(rot: Record<string, number>, racine: Partial<Pose['racine']> = {}): Pose {
  const p = poseNeutre();
  for (const [nom, r] of Object.entries(rot)) p.os[nom] = { rotation: r, translation: { x: 0, y: 0 }, echelle: { x: 1, y: 1 } };
  p.racine = { ...p.racine, ...racine };
  return p;
}

/** Clignement de 0,15 s toutes les 2,5 s. */
function clignement(t: number): number {
  const u = (t % 2.5) / 0.15;
  return u < 1 ? Math.sin(Math.PI * u) : 0;
}

function sequence(duree: number, jeu: Jeu): EtatImage[] {
  const etats: EtatImage[] = [];
  for (let n = 0; n < Math.round(duree * FPS); n++) {
    const t = n / FPS;
    const tj = jeu.tJeu ? jeu.tJeu(t) : t;
    const v = { ...visageNeutre(), paupiereG: clignement(tj), paupiereD: clignement(tj), ...(jeu.visage?.(tj) ?? {}) };
    const position = jeu.position?.(tj) ?? { x: 1, y: 0.9 };
    const perso: EtatPersonnage = {
      id: 'modou',
      rig: 'ref',
      visible: true,
      opacite: 1,
      pose: jeu.pose ? jeu.pose(tj) : poseNeutre(),
      visage: v,
      position,
      echelle: ECHELLE,
      profondeur: 0.8,
      ordre: 1,
      ombre: ombreNeutre(),
      etalonnage: etalonnageNeutre(),
      flou: 0,
    };
    const plan = jeu.plan?.(t) ?? 'p1';
    etats.push({
      t,
      tJeu: tj,
      plan: { id: plan, index: plan === 'p1' ? 0 : 1, debut: 0, fin: duree },
      camera: { ...cameraNeutre({ x: 1, y: 0.65 }, 1), ...(jeu.camera?.(t) ?? {}) },
      decor: null,
      personnages: [perso],
      sousTitres: [],
      evenementsSon: [],
      effets: effetsNeutres(),
    });
  }
  return etats;
}

/** Jeu d'acteur lisse et ample : bras qui balancent, tête qui hoche, torse qui respire. */
const jeuLisse = (t: number): Pose =>
  poseAvec({
    brasD: 0.7 * Math.sin(2 * Math.PI * 0.7 * t),
    brasG: -0.6 * Math.sin(2 * Math.PI * 0.55 * t + 1),
    avantBrasD: 0.4 * Math.sin(2 * Math.PI * 0.7 * t - 0.6),
    tete: 0.15 * Math.sin(2 * Math.PI * 0.9 * t),
    torse: 0.05 * Math.sin(2 * Math.PI * 0.3 * t),
  });

const porte = (etats: EtatImage[], extra: Parameters<typeof porteEtats>[1] extends infer C ? Partial<C> : never = {}) =>
  porteEtats(etats, { fps: FPS, largeur: L, hauteur: H, rigs: RIGS, ...extra });

const echecs = (r: ReturnType<typeof porte>): string[] => r.mesures.filter((m) => !m.ok && m.bloquant !== false).map((m) => m.nom);

describe('porte qualité — énergie de mouvement', () => {
  it('personnage figé : FAIL (énergie minimale, immobilité, passage mou)', () => {
    const r = porte(sequence(4, { visage: () => ({ paupiereG: 0, paupiereD: 0 }) }));
    expect(r.verdict).toBe('FAIL');
    const e = echecs(r);
    expect(e.some((n) => n.startsWith('énergie de jeu (minimum'))).toBe(true);
    expect(e).toContain('immobilité totale hors gel');
    expect(e).toContain('passage mou (respiration seule)');
    const p = (r.details!.personnages as ReturnType<typeof mesurerPersonnage>[])[0]!;
    expect(p.energieJeu).toBe(0);
    expect(p.immobiliteMax).toBeGreaterThan(3.9);
  });

  it('respiration seule : FAIL (mouvement trop faible, l’échec « trop lego »)', () => {
    const r = porte(sequence(6, { pose: (t) => poseAvec({ torse: 0.012 * Math.sin(2 * Math.PI * 0.25 * t), tete: 0.01 * Math.sin(2 * Math.PI * 0.2 * t) }) }));
    expect(r.verdict).toBe('FAIL');
    expect(echecs(r).some((n) => n.startsWith('énergie de jeu (minimum'))).toBe(true);
    expect(echecs(r)).toContain('part de mouvement franc');
  });

  it('jeu lisse et ample : PASS, tremblement faible, aucun saut', () => {
    const r = porte(sequence(6, { pose: jeuLisse }));
    expect(echecs(r)).toEqual([]);
    expect(r.verdict).toBe('PASS');
    const p = (r.details!.personnages as ReturnType<typeof mesurerPersonnage>[])[0]!;
    expect(p.energieJeu).toBeGreaterThan(0.1);
    expect(p.partMouvementFranc).toBeGreaterThan(0.3);
    expect(p.tremblementP95).toBeLessThan(0.5);
    expect(p.sauts).toEqual([]);
    expect(p.clignements).toBeGreaterThanOrEqual(2);
  });

  it('agitation extrême : FAIL (énergie maximale)', () => {
    const r = porte(sequence(4, { pose: (t) => poseAvec({ brasD: 2.5 * Math.sin(2 * Math.PI * 4 * t), brasG: 2.5 * Math.sin(2 * Math.PI * 4 * t + 2), torse: 0.6 * Math.sin(2 * Math.PI * 3 * t), cuisseD: 1.2 * Math.sin(2 * Math.PI * 4 * t) }) }));
    expect(echecs(r).some((n) => n.startsWith('énergie de jeu (maximum'))).toBe(true);
  });
});

describe('porte qualité — à-coups, tremblement, sauts', () => {
  it('jeu lisse + bruit image par image : FAIL (tremblement)', () => {
    const rnd = creerAleatoire(3);
    const bruit = new Map<number, number[]>();
    const r = porte(
      sequence(6, {
        pose: (t) => {
          const k = Math.round(t * FPS);
          if (!bruit.has(k)) bruit.set(k, [rnd.normal(0, 0.06), rnd.normal(0, 0.06), rnd.normal(0, 0.03)]);
          const [a, b, c] = bruit.get(k)!;
          const p = jeuLisse(t);
          p.os.brasD!.rotation += a!;
          p.os.brasG!.rotation += b!;
          p.os.tete!.rotation += c!;
          return p;
        },
      }),
    );
    expect(r.verdict).toBe('FAIL');
    expect(echecs(r)).toContain('tremblement (c95)');
    const p = (r.details!.personnages as ReturnType<typeof mesurerPersonnage>[])[0]!;
    expect(p.tremblementP95).toBeGreaterThan(1.3);
  });

  it('une image où le bras saute : saut de pose détecté à cette image', () => {
    const etats = sequence(4, { pose: (t) => (Math.round(t * FPS) === 50 ? poseAvec({ ...Object.fromEntries(Object.entries(jeuLisse(t).os).map(([k, v]) => [k, v.rotation])), brasD: 1.6 }) : jeuLisse(t)) });
    const r = porte(etats);
    const p = (r.details!.personnages as ReturnType<typeof mesurerPersonnage>[])[0]!;
    expect(p.sauts).toContain(50);
    expect(echecs(r)).toContain('sauts de pose');
  });

  it('demi-tour instantané (miroir qui bascule d’un coup) : saut signalé comme demi-tour ; demi-tour animé : rien', () => {
    const pose = (t: number, flip: boolean, ex = 1): Pose => {
      const p = jeuLisse(t);
      p.os.brasD!.rotation = 0.9; // pose asymétrique : le miroir se voit
      p.racine = { ...p.racine, flip, echelle: { x: ex, y: 1 } };
      return p;
    };
    const sec = porte(sequence(4, { pose: (t) => pose(t, t >= 2) }));
    const ps = (sec.details!.personnages as ReturnType<typeof mesurerPersonnage>[])[0]!;
    expect(ps.sauts).toContain(60);
    expect(ps.demiTours).toEqual([60]);
    // Demi-tour animé : l'échelle horizontale passe par 0 en 0,3 s, le miroir bascule au milieu.
    const anime = porte(
      sequence(4, {
        pose: (t) => {
          const u = Math.min(1, Math.max(0, (t - 1.85) / 0.3));
          const ex = Math.abs(Math.cos(Math.PI * u));
          return pose(t, u >= 0.5, Math.max(ex, 0.02));
        },
      }),
    );
    const pa = (anime.details!.personnages as ReturnType<typeof mesurerPersonnage>[])[0]!;
    expect(pa.demiTours).toEqual([]);
    expect(pa.sauts).toEqual([]);
  });

  it('attaque sèche d’un ressort (vitesse qui démarre d’un coup) : pas un saut', () => {
    // Le bras part à vitesse constante à t = 1 s (dérivée discontinue, position continue).
    const r = porte(sequence(4, { pose: (t) => poseAvec({ brasD: Math.min(1.2, Math.max(0, t - 1) * 3), brasG: 0.5 * Math.sin(2 * Math.PI * 0.6 * t), tete: 0.15 * Math.sin(2 * Math.PI * 0.8 * t) }) }));
    const p = (r.details!.personnages as ReturnType<typeof mesurerPersonnage>[])[0]!;
    expect(p.sauts).toEqual([]);
  });
});

describe('porte qualité — gel, coupe, pieds', () => {
  it('gel voulu de 2 s : l’immobilité n’est pas comptée', () => {
    const tJeu = (t: number): number => (t < 2 ? t : t < 4 ? 2 : t - 2);
    const r = porte(sequence(6, { pose: jeuLisse, tJeu }));
    const p = (r.details!.personnages as ReturnType<typeof mesurerPersonnage>[])[0]!;
    expect(p.immobiliteMax).toBeLessThan(0.2);
    expect(echecs(r)).toEqual([]);
  });

  it('même immobilité sans gel : FAIL', () => {
    const r = porte(sequence(6, { pose: (t) => jeuLisse(t < 2 ? t : t < 4 ? 2 : t - 2), visage: () => ({ paupiereG: 0, paupiereD: 0 }) }));
    expect(echecs(r)).toContain('immobilité totale hors gel');
  });

  it('une coupe ne crée ni saut ni à-coup', () => {
    const r = porte(sequence(4, { pose: (t) => (t < 2 ? jeuLisse(t) : jeuLisse(t + 7)), position: (t) => (t < 2 ? { x: 1, y: 0.9 } : { x: 1.3, y: 0.9 }), plan: (t) => (t < 2 ? 'p1' : 'p2') }));
    const p = (r.details!.personnages as ReturnType<typeof mesurerPersonnage>[])[0]!;
    expect(p.sauts).toEqual([]);
    expect(echecs(r)).toEqual([]);
  });

  it('pied posé qui glisse : FAIL ; pieds fixes : PASS', () => {
    // Le bassin et tout le corps glissent latéralement (décalage de racine) sans que les pieds se lèvent.
    const glisse = porte(sequence(4, { pose: (t) => ({ ...jeuLisse(t), racine: { ...jeuLisse(t).racine, decalage: { x: 120 * Math.sin(2 * Math.PI * 0.5 * t), y: 0 } } }) }));
    const pg = (glisse.details!.personnages as ReturnType<typeof mesurerPersonnage>[])[0]!;
    expect(pg.glissement!.p95).toBeGreaterThan(2);
    expect(echecs(glisse)).toContain('glissement des pieds posés (c95)');
    const fixe = porte(sequence(4, { pose: jeuLisse }));
    const pf = (fixe.details!.personnages as ReturnType<typeof mesurerPersonnage>[])[0]!;
    expect(pf.glissement!.imagesAppui).toBeGreaterThan(100);
    expect(pf.glissement!.p95).toBeLessThan(0.01);
  });
});

describe('porte qualité — synchro labiale', () => {
  const duree = 4;
  const repliques = [{ debut: 0.5, fin: 3.5 }];
  // Énergie de voix synthétique : syllabes à 4 Hz.
  const env = new Float64Array(duree * FPS + 10);
  for (let n = 0; n < env.length; n++) {
    const t = n / FPS;
    env[n] = t >= 0.5 && t < 3.5 ? 0.02 + 0.2 * Math.max(0, Math.sin(2 * Math.PI * 4 * (t - 0.5))) : 0;
  }
  const ouverture = (t: number): number => (t >= 0.5 && t < 3.5 ? 0.6 * Math.max(0, Math.sin(2 * Math.PI * 4 * (t - 0.5 + 1 / FPS))) : 0);

  it('bouche calée sur la voix : corrélation forte, décalage d’une image (la bouche précède)', () => {
    const etats = sequence(duree, { pose: jeuLisse, visage: (t) => ({ ouvertureBouche: ouverture(t) }) });
    const { personnages } = extraireSeries(etats, { fps: FPS, rigs: RIGS, largeur: L, hauteur: H });
    const l = mesurerLevres(personnages[0]!, { repliques, phonemes: [], enveloppe: env });
    expect(l.correlation!).toBeGreaterThan(0.8);
    expect(l.decalage).toBe(1);
    const r = porte(etats, { parole: { modou: { repliques, phonemes: [], enveloppe: env } } });
    expect(r.mesures.find((m) => m.nom.startsWith('synchro labiale'))!.ok).toBe(true);
  });

  it('bouche figée pendant la parole : FAIL', () => {
    const etats = sequence(duree, { pose: jeuLisse });
    const r = porte(etats, { parole: { modou: { repliques, phonemes: [], enveloppe: env } } });
    expect(echecs(r)).toContain('bouche active pendant la parole');
  });

  it('M/B/P : la bouche doit se fermer', () => {
    const phonemes = [
      { debut: 1.0, fin: 1.08, ph: 'm' },
      { debut: 2.0, fin: 2.08, ph: 'b' },
    ];
    const ouverte = sequence(duree, { pose: jeuLisse, visage: (t) => ({ ouvertureBouche: t >= 0.5 && t < 3.5 ? 0.4 + 0.2 * Math.sin(9 * t) : 0 }) });
    const r1 = porte(ouverte, { parole: { modou: { repliques, phonemes } } });
    expect(r1.mesures.find((m) => m.nom === 'fermetures M/B/P')!.valeur).toBe(0);
    const fermee = sequence(duree, {
      pose: jeuLisse,
      visage: (t) => ({ ouvertureBouche: phonemes.some((p) => t >= p.debut && t <= p.fin) ? 0.02 : t >= 0.5 && t < 3.5 ? 0.4 + 0.2 * Math.sin(9 * t) : 0 }),
    });
    const r2 = porte(fermee, { parole: { modou: { repliques, phonemes } } });
    expect(r2.mesures.find((m) => m.nom === 'fermetures M/B/P')!.ok).toBe(true);
  });
});

describe('porte qualité — caméra', () => {
  it('panoramique doux : PASS ; saut de cadre au milieu d’un plan : FAIL', () => {
    const doux = porte(sequence(4, { pose: jeuLisse, camera: (t) => ({ centre: { x: 1 + 0.05 * Math.sin(t), y: 0.65 } }) }));
    expect(echecs(doux)).toEqual([]);
    const saut = porte(sequence(4, { pose: jeuLisse, camera: (t) => ({ centre: { x: t < 2 ? 1 : 1.15, y: 0.65 } }) }));
    expect(echecs(saut)).toContain('caméra : sauts dans un plan');
    expect(echecs(saut)).toContain('caméra : vitesse du cadre');
  });

  it('filé voulu : vitesse non limitée dans son intervalle', () => {
    const etats = sequence(4, { pose: jeuLisse, camera: (t) => ({ centre: { x: 1 + 0.6 * Math.min(1, Math.max(0, (t - 2) / 0.2)), y: 0.65 } }) });
    const { camera } = extraireSeries(etats, { fps: FPS, rigs: RIGS, largeur: L, hauteur: H });
    expect(mesurerCamera(camera).vitesseMax).toBeGreaterThan(2);
    expect(mesurerCamera(camera, [{ debut: 2, fin: 2.2, type: 'deplacement' }]).vitesseMax).toBeLessThan(0.01);
  });
});

describe('statistiques', () => {
  it('centile, corrélation', () => {
    expect(centile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(centile([0, 10], 95)).toBeCloseTo(9.5);
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(correlation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
    expect(Number.isNaN(correlation([1, 1, 1], [1, 2, 3]))).toBe(true);
  });
});
