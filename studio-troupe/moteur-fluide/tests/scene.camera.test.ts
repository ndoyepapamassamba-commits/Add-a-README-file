/**
 * Réalisateur caméra (`scene/camera`) : pureté, continuité, cadrages et zones sûres, fenêtre dans le décor,
 * punch-in (dépassement), filé (flou directionnel, raccord à la coupe), tremblement, gel, main levée.
 */
import { describe, expect, it } from 'vitest';
import { creerMoteurComplet } from '../src/assemblage';
import { cameraDuPlan, COMPOSITION, versEcran, ZONES_SURES } from '../src/scene/camera';
import { geometrieSujet } from '../src/scene/sol';
import { evaluer } from '../src/timeline/evaluer';
import { fenetreVisible } from '../src/timeline/projection';
import { normaliserProjet } from '../src/timeline/projet';
import type { Cadrage, EtatCamera, InfoDecor, MouvementCamera, Projet } from '../src/timeline/types';

const DECOR: InfoDecor = {
  id: 'rue',
  nom: 'Rue de test',
  largeur: 2048,
  hauteur: 1024,
  aspect: 2,
  fit: { mH: 4, floor: 0.95, cx: 0.5 },
  fichiers: { src: '', plate: '', depth: '', plateDepth: '', masks: '' },
};

function projet(cadrage: Cadrage, camera: MouvementCamera[] = [], plans2 = false): Projet {
  return normaliserProjet({
    format: 'moteur-fluide/projet@1',
    titre: 'camera',
    fps: 30,
    duree: plans2 ? 8 : 6,
    sortie: { largeur: 1080, hauteur: 1920, sousImages: 1, obturateur: 0.5, graine: 5 },
    personnages: [
      { id: 'modou', nom: 'MODOU', rig: 'aucun', tailleM: 1.76 },
      { id: 'coumba', nom: 'COUMBA', rig: 'aucun', tailleM: 1.7 },
    ],
    plans: [
      {
        id: 'p1',
        debut: 0,
        fin: plans2 ? 4 : 6,
        decor: 'rue',
        cadrage,
        personnages: [
          { personnage: 'modou', u: 0.42, orientation: 1 },
          { personnage: 'coumba', u: 0.58, orientation: -1 },
        ],
      },
      ...(plans2
        ? [
            {
              id: 'p2',
              debut: 4,
              fin: 8,
              decor: 'rue',
              cadrage: { taille: 'rapproche' as const, sujets: ['coumba'] },
              personnages: [{ personnage: 'coumba', u: 0.58, orientation: -1 as const }],
            },
          ]
        : []),
    ],
    pistes: {
      actions: [{ personnage: 'coumba', action: 'marcher', debut: 2, duree: 1.5, parametres: { vers: { u: 0.7, v: 0.95 } } }],
      dialogue: [],
      camera,
      sons: [],
    },
  });
}

const moteur = creerMoteurComplet({ decors: { rue: DECOR } });
const cam = (p: Projet, t: number): EtatCamera => evaluer(p, t, moteur).camera;

describe('caméra : pureté et continuité', () => {
  it('même instant → même caméra, dans n’importe quel ordre', () => {
    const p = projet({ taille: 'americain', sujets: ['modou', 'coumba'] }, [{ type: 'punchIn', debut: 1, duree: 0.2, sujet: 'coumba' }]);
    const a = [0.3, 1.1, 2.7, 1.05].map((t) => JSON.stringify(cam(p, t)));
    const b = [1.05, 2.7, 1.1, 0.3].map((t) => JSON.stringify(cam(p, t))).reverse();
    expect(a).toEqual(b);
  });

  it('aucun saut dans un plan (suivi d’un sujet qui marche, échantillonnage à 240 Hz)', () => {
    const p = projet({ taille: 'moyen', sujets: ['coumba'] });
    let prec = cam(p, 0);
    let sautMax = 0;
    for (let i = 1; i < 6 * 240; i++) {
      const c = cam(p, i / 240);
      const s = c.zoom * 1920;
      sautMax = Math.max(sautMax, Math.hypot(c.centre.x - prec.centre.x, c.centre.y - prec.centre.y) * s, Math.abs(Math.log(c.zoom / prec.zoom)) * 1000);
      prec = c;
    }
    expect(sautMax).toBeLessThan(4); // < 4 px de sortie par 1/240 s
  });

  it('le suivi rattrape le sujet après sa marche et se pose', () => {
    const p = projet({ taille: 'moyen', sujets: ['coumba'] });
    const avant = cam(p, 1.9).centre.x;
    const apres = cam(p, 5.9).centre.x;
    expect(apres - avant).toBeGreaterThan(0.2); // la caméra a suivi (u 0,58 → 0,7, soit 0,24 monde)
    const v1 = cam(p, 5.8).centre.x;
    expect(Math.abs(apres - v1)).toBeLessThan(1e-3);
  });
});

describe('caméra : cadrages', () => {
  it('fenêtre toujours dans le décor', () => {
    for (const taille of ['ensemble', 'large', 'moyen', 'americain', 'rapproche', 'gros', 'tresGros'] as const) {
      const p = projet({ taille, sujets: ['modou'] }, [{ type: 'file', debut: 3, duree: 0.25, vers: { u: 0.98, v: 0.5 } }]);
      for (let t = 0; t < 6; t += 0.1) {
        const c = cam(p, t);
        const f = fenetreVisible({ ...c, tremble: { decalage: { x: 0, y: 0 }, rotation: 0 } }, 1080, 1920);
        expect(f.min.x).toBeGreaterThanOrEqual(-1e-6);
        expect(f.min.y).toBeGreaterThanOrEqual(-1e-6);
        expect(f.max.x).toBeLessThanOrEqual(DECOR.aspect + 1e-6);
        expect(f.max.y).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });

  it('gros plan et rapproché : yeux dans la zone sûre des visages (TikTok)', () => {
    for (const taille of ['americain', 'rapproche', 'gros'] as const) {
      const p = projet({ taille, sujets: ['coumba'], mainLevee: 0 });
      const c = cam(p, 0.5);
      const plan = p.plans[0]!;
      const g = geometrieSujet(p, plan, plan.personnages[1]!, 1.7, null, DECOR, 0.5);
      const e = versEcran(c, g.yeux, 1080, 1920);
      expect(e.y).toBeGreaterThanOrEqual(ZONES_SURES.visages.yMin);
      expect(e.y).toBeLessThanOrEqual(ZONES_SURES.visages.yMax);
      expect(e.x).toBeGreaterThanOrEqual(ZONES_SURES.visages.xMin);
      expect(e.x).toBeLessThanOrEqual(ZONES_SURES.visages.xMax);
      expect(Math.abs(e.y - COMPOSITION.yeux * 1920)).toBeLessThan(40);
    }
  });

  it('plus la taille de plan est serrée, plus le zoom est fort', () => {
    const z = (['large', 'moyen', 'americain', 'rapproche', 'gros'] as const).map((taille) => cam(projet({ taille, sujets: ['coumba'] }), 0.5).zoom);
    for (let i = 1; i < z.length; i++) expect(z[i]!).toBeGreaterThan(z[i - 1]!);
  });

  it('plan en pied : les pieds restent dans le cadre', () => {
    const p = projet({ taille: 'moyen', sujets: ['modou', 'coumba'], mainLevee: 0 });
    const c = cam(p, 0.5);
    const pieds = versEcran(c, { x: 0.42 * 2, y: 0.95 }, 1080, 1920);
    expect(pieds.y).toBeLessThan(1920);
    expect(pieds.y).toBeGreaterThan(1500);
  });
});

describe('caméra : mouvements', () => {
  it('punch-in : zoom × facteur avec un léger dépassement, autour du visage', () => {
    const p = projet({ taille: 'americain', sujets: ['coumba'], mainLevee: 0 }, [{ type: 'punchIn', debut: 1, duree: 0.2, sujet: 'coumba', facteur: 1.4 }]);
    const z0 = cam(p, 0.99).zoom;
    let zMax = 0;
    for (let t = 1; t < 2; t += 1 / 240) zMax = Math.max(zMax, cam(p, t).zoom / z0);
    const zFin = cam(p, 3).zoom / z0;
    expect(zFin).toBeGreaterThan(1.37);
    expect(zFin).toBeLessThan(1.43);
    expect(zMax / zFin).toBeGreaterThan(1.005); // dépassement visible
    expect(zMax / zFin).toBeLessThan(1.06); // mais contenu (≈ 3 %)
    expect(cam(p, 1.3).zoom / z0).toBeGreaterThan(1.3); // atteint vite
  });

  it('filé : flou directionnel fort pendant le mouvement, nul avant et après, arrivée sur la cible', () => {
    const p = projet({ taille: 'americain', sujets: ['modou'], mainLevee: 0 }, [{ type: 'file', debut: 2, duree: 0.27, vers: { u: 0.8, v: 0.5 } }]);
    expect(Math.hypot(cam(p, 1.5).flouBouge.x, cam(p, 1.5).flouBouge.y)).toBe(0);
    const milieu = cam(p, 2.135);
    expect(Math.abs(milieu.flouBouge.x)).toBeGreaterThan(40);
    expect(Math.abs(milieu.flouBouge.y)).toBeLessThan(Math.abs(milieu.flouBouge.x));
    const fin = cam(p, 3);
    expect(Math.hypot(fin.flouBouge.x, fin.flouBouge.y)).toBe(0);
    const w = 1080 / 1920 / fin.zoom;
    expect(Math.abs(fin.centre.x - Math.min(0.8 * 2, 2 - w / 2))).toBeLessThan(0.02);
  });

  it('filé à travers une coupe : la vitesse se raccorde', () => {
    const p = projet({ taille: 'americain', sujets: ['modou'], mainLevee: 0 }, [{ type: 'file', debut: 3.85, duree: 0.3, vers: { u: 0.85, v: 0.5 } }], true);
    const a = cam(p, 3.99);
    const b = cam(p, 4.01);
    expect(Math.sign(a.flouBouge.x)).toBe(Math.sign(b.flouBouge.x));
    expect(Math.abs(b.flouBouge.x)).toBeGreaterThan(0.5 * Math.abs(a.flouBouge.x));
    expect(Math.abs(cam(p, 4.6).flouBouge.x)).toBe(0);
  });

  it('tremblement : décroissant, nul après', () => {
    const p = projet({ taille: 'moyen', mainLevee: 0 }, [{ type: 'tremblement', debut: 1, duree: 0.6, amplitude: 0.01 }]);
    let debut = 0;
    let fin = 0;
    for (let t = 1.01; t < 1.15; t += 0.005) debut = Math.max(debut, Math.abs(cam(p, t).tremble.decalage.x));
    for (let t = 1.45; t < 1.59; t += 0.005) fin = Math.max(fin, Math.abs(cam(p, t).tremble.decalage.x));
    expect(debut).toBeGreaterThan(0.002);
    expect(fin).toBeLessThan(debut / 3);
    expect(cam(p, 1.7).tremble.decalage.x).toBe(0);
  });

  it('gel : zoom 1,08 tenu', () => {
    const p = projet({ taille: 'moyen', zoom: 1.5, centre: { u: 0.5, v: 0.5 }, mainLevee: 0 }, [{ type: 'gel', debut: 2, duree: 1 }]);
    const z0 = cam(p, 1.9).zoom;
    expect(cam(p, 2.5).zoom / z0).toBeCloseTo(1.08, 2);
    expect(cam(p, 3.5).zoom / z0).toBeCloseTo(1, 3);
  });

  it('main levée : dérive de quelques pixels seulement', () => {
    const p = projet({ taille: 'americain', sujets: ['coumba'] });
    const p0 = projet({ taille: 'americain', sujets: ['coumba'], mainLevee: 0 });
    let ecart = 0;
    for (let t = 0; t < 1.9; t += 0.05) {
      const a = cam(p, t);
      const b = cam(p0, t);
      ecart = Math.max(ecart, Math.hypot(a.centre.x - b.centre.x, a.centre.y - b.centre.y) * a.zoom * 1920);
    }
    expect(ecart).toBeGreaterThan(0.3);
    expect(ecart).toBeLessThan(8);
  });

  it('la caméra compilée est mémoïsée par plan', () => {
    const p = projet({ taille: 'moyen' });
    expect(cameraDuPlan(p, 0, moteur.ressources)).toBe(cameraDuPlan(p, 0, moteur.ressources));
  });
});

describe('caméra : raccord de clarté au filé à travers une coupe', () => {
  it('l’exposition glisse vers la moyenne géométrique des deux décors à la coupe, puis revient à 1', () => {
    const analyse = (L: number): NonNullable<InfoDecor['analyse']> => ({
      version: 1,
      lab: { moyenne: [L, 0, 0], ecart: [20, 5, 5] },
      grille: { colonnes: 1, lignes: 1, moyennes: [[L, 0, 0]], ecarts: [[20, 5, 5]], poids: [1] },
      lumiere: { direction: { x: 0, y: -1 }, couleur: [1, 1, 1], contraste: 0.5 },
      sol: { a: 0, b: 0.8, r2: 0 },
      ciel: 0,
      figurants: 0,
    });
    const p = projet({ taille: 'americain', sujets: ['modou'], mainLevee: 0 }, [{ type: 'file', debut: 3.8, duree: 0.4, vers: { u: 0.85, v: 0.5 } }], true);
    p.plans[1]!.decor = 'sombre';
    const m = creerMoteurComplet({
      decors: { rue: { ...DECOR, analyse: analyse(60) }, sombre: { ...DECOR, id: 'sombre', analyse: analyse(40) } },
    });
    const ex = (t: number) => evaluer(p, t, m).camera.exposition ?? 1;
    expect(ex(3.5)).toBe(1);
    expect(ex(3.999)).toBeCloseTo(Math.sqrt(40 / 60), 2);
    expect(ex(4.001)).toBeCloseTo(Math.sqrt(60 / 40), 2);
    expect(ex(4.5)).toBe(1);
  });
});
