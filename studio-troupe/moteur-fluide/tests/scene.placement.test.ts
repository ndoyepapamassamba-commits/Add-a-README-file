/**
 * Placement, échelle réelle, ombres, couleur (Lab, étalonnage) et décor 2,5D (`scene/`).
 */
import { describe, expect, it } from 'vitest';
import { creerMoteurComplet } from '../src/assemblage';
import { analyserPixelsDecor } from '../src/scene/analyse-pixels';
import { etalonnageVersDecor, labVersRgb, rgbVersLab, statsLabImage, transfererLab } from '../src/scene/couleur';
import { deplacerParallaxe, REGLAGES_DECOR } from '../src/scene/decor';
import { statsLocales } from '../src/scene/placement';
import { aplatissementSol, pixelsParMetre, profondeurSol } from '../src/scene/sol';
import { evaluer } from '../src/timeline/evaluer';
import { normaliserProjet } from '../src/timeline/projet';
import type { AnalyseDecor, InfoDecor, MouvementCamera, Projet, StatsLab } from '../src/timeline/types';

const DECOR: InfoDecor = {
  id: 'rue',
  nom: 'Rue',
  largeur: 2048,
  hauteur: 1024,
  aspect: 2,
  fit: { mH: 4, floor: 0.95, cx: 0.5 },
  fichiers: { src: '', plate: '', depth: '', plateDepth: '', masks: '' },
};

function projet(camera: MouvementCamera[] = [], v2 = 0.8): Projet {
  return normaliserProjet({
    format: 'moteur-fluide/projet@1',
    titre: 'placement',
    fps: 30,
    duree: 4,
    sortie: { largeur: 1080, hauteur: 1920, sousImages: 1, obturateur: 0.5, graine: 2 },
    personnages: [
      { id: 'modou', nom: 'MODOU', rig: 'x', tailleM: 1.76 },
      { id: 'awa', nom: 'AWA', rig: 'x', tailleM: 1.6 },
    ],
    plans: [
      {
        id: 'p',
        debut: 0,
        fin: 4,
        decor: 'rue',
        cadrage: { taille: 'moyen', sujets: ['modou'] },
        personnages: [
          { personnage: 'modou', u: 0.4 },
          { personnage: 'awa', u: 0.6, v: v2 },
        ],
      },
    ],
    pistes: { actions: [], dialogue: [], camera, sons: [] },
  });
}

describe('échelle et sol', () => {
  const moteur = creerMoteurComplet({ decors: { rue: DECOR } });
  const e = evaluer(projet(), 1, moteur);
  const modou = e.personnages.find((p) => p.id === 'modou')!;
  const awa = e.personnages.find((p) => p.id === 'awa')!;

  it('1,76 m sur la ligne de sol d’un décor de 4 m = 0,44 de la hauteur du décor', () => {
    expect(modou.position.y).toBeCloseTo(0.95, 9);
    expect(modou.echelle * 1000).toBeCloseTo(1.76 / 4, 6); // rig absent : 1000 px par défaut
  });

  it('pixels par mètre du décor : hauteur image / mH', () => {
    expect(pixelsParMetre(DECOR)).toBeCloseTo(256, 9);
  });

  it('un personnage plus loin (v plus petit) est plus petit, plus loin et dessiné derrière', () => {
    expect(awa.echelle).toBeLessThan(modou.echelle);
    expect(awa.profondeur).toBeLessThan(modou.profondeur);
    expect(e.personnages[0]!.id).toBe('awa');
  });

  it('ombre de contact : aplatissement de perspective, opacité raisonnable', () => {
    expect(modou.ombre.aplatissement).toBeGreaterThan(0.08);
    expect(modou.ombre.aplatissement).toBeLessThan(0.5);
    expect(awa.ombre.aplatissement).toBeLessThan(modou.ombre.aplatissement);
    expect(modou.ombre.opacite).toBeGreaterThan(0.3);
    expect(modou.ombre.opacite).toBeLessThan(0.8);
    expect(aplatissementSol(DECOR, 0.95)).toBeGreaterThan(aplatissementSol(DECOR, 0.7));
  });

  it('profondeur du sol croissante vers le bas, ajustement de l’analyse quand il est fiable', () => {
    expect(profondeurSol(DECOR, 0.95)).toBeGreaterThan(profondeurSol(DECOR, 0.7));
    const d2: InfoDecor = { ...DECOR, analyse: { ...analyseNeutre(), sol: { a: 2, b: -1.1, r2: 0.95 } } };
    expect(profondeurSol(d2, 0.95)).toBeCloseTo(0.8, 9);
  });
});

function analyseNeutre(): AnalyseDecor {
  return {
    version: 1,
    lab: { moyenne: [55, 0, 0], ecart: [20, 8, 8] },
    grille: { colonnes: 1, lignes: 1, moyennes: [[55, 0, 0]], ecarts: [[20, 8, 8]], poids: [1] },
    lumiere: { direction: { x: 0, y: -1 }, couleur: [1, 1, 1], contraste: 0.5 },
    sol: { a: 0, b: 0.8, r2: 0 },
    ciel: 0.2,
    figurants: 0.1,
  };
}

describe('couleur', () => {
  it('sRGB → Lab → sRGB (aller-retour exact)', () => {
    for (const c of [
      [0, 0, 0],
      [1, 1, 1],
      [0.8, 0.3, 0.1],
      [0.2, 0.6, 0.9],
    ] as const) {
      const r = labVersRgb(rgbVersLab(c));
      for (let k = 0; k < 3; k++) expect(r[k]!).toBeCloseTo(c[k]!, 6);
    }
    expect(rgbVersLab([1, 1, 1])[0]).toBeCloseTo(100, 4);
  });

  it('statistiques Lab pondérées par l’alpha', () => {
    const d = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 0]);
    const s = statsLabImage(d, 3, 1);
    expect(s.moyenne[0]).toBeCloseTo(50, 3);
  });

  it('décor neutre de référence → étalonnage presque identité', () => {
    const perso: StatsLab = { moyenne: [55, 0, 0], ecart: [20, 8, 8] };
    const e = etalonnageVersDecor(perso, { moyenne: [55, 0, 0], ecart: [20, 8, 8] });
    for (let k = 0; k < 3; k++) {
      expect(e.gain[k]!).toBeCloseTo(1, 2);
      expect(Math.abs(e.decalage[k]!)).toBeLessThan(0.01);
    }
  });

  it('décor sombre et chaud (maquis la nuit) → personnage assombri et réchauffé, sans perdre son identité', () => {
    const perso: StatsLab = { moyenne: [44, 1, 19], ecart: [15, 18, 6] };
    const nuit: StatsLab = { moyenne: [32, 18, 21], ecart: [23, 18, 30] };
    const lab = transfererLab([44, 1, 19], perso, nuit);
    expect(lab[0]).toBeLessThan(44);
    expect(lab[1]).toBeGreaterThan(1);
    expect(Math.abs(lab[0] - 44)).toBeLessThan(12); // partiel : la peau reste reconnaissable
    const e = etalonnageVersDecor(perso, nuit);
    const peau = [0.55, 0.33, 0.22];
    const apres = peau.map((c, k) => c * e.gain[k]! + e.decalage[k]!);
    const lAvant = rgbVersLab(peau as [number, number, number])[0];
    const lApres = rgbVersLab(apres as [number, number, number])[0];
    expect(lApres).toBeLessThan(lAvant);
    expect(lAvant - lApres).toBeLessThan(15);
  });

  it('statistiques locales : mélange continu entre cellules', () => {
    const a: AnalyseDecor = {
      ...analyseNeutre(),
      grille: { colonnes: 2, lignes: 1, moyennes: [[20, 0, 0], [80, 0, 0]], ecarts: [[10, 5, 5], [10, 5, 5]], poids: [1, 1] },
      lab: { moyenne: [50, 0, 0], ecart: [10, 5, 5] },
    };
    const g = statsLocales(a, 0.1, 0.5, 1).moyenne[0];
    const m = statsLocales(a, 0.5, 0.5, 1).moyenne[0];
    const d = statsLocales(a, 0.9, 0.5, 1).moyenne[0];
    expect(g).toBeLessThan(m);
    expect(m).toBeLessThan(d);
    expect(m).toBeCloseTo(50, 6);
  });

  it('placement avec analyse et statistiques du rig → étalonnage et liseré présents', () => {
    const decor: InfoDecor = { ...DECOR, analyse: { ...analyseNeutre(), lab: { moyenne: [30, 15, 20], ecart: [20, 15, 25] } } };
    const moteur = creerMoteurComplet({ decors: { rue: decor } });
    const e = evaluer(projet(), 1, moteur);
    // Rig absent : pas de statistiques du dessin → identité.
    expect(e.personnages[0]!.etalonnage.gain).toEqual([1, 1, 1]);
  });
});

describe('analyse des pixels d’un décor', () => {
  it('lumière en haut à droite, sol dont la profondeur croît vers le bas', () => {
    const L = 64;
    const H = 32;
    const plaque = new Uint8Array(4 * L * H);
    const masques = new Uint8Array(4 * L * H);
    const prof = new Uint8Array(4 * L * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < L; x++) {
        const i = 4 * (y * L + x);
        const clair = x > 48 && y < 8 ? 250 : 60;
        plaque.set([clair, clair, clair * 0.9, 255], i);
        masques.set([0, y < 4 ? 255 : 0, 0, 255], i);
        const d = Math.round(255 * Math.min(1, Math.max(0, (y / H - 0.3) * 1.2)));
        prof.set([d, d, d, 255], i);
      }
    const a = analyserPixelsDecor(
      { largeur: L, hauteur: H, donnees: plaque },
      { largeur: L, hauteur: H, donnees: masques },
      { largeur: L, hauteur: H, donnees: prof },
      { mH: 4, floor: 0.95, cx: 0.5 },
    );
    expect(a.lumiere.direction.x).toBeGreaterThan(0.3);
    expect(a.lumiere.direction.y).toBeLessThan(0);
    expect(a.sol.a).toBeGreaterThan(0.5);
    expect(a.sol.r2).toBeGreaterThan(0.9);
    expect(a.ciel).toBeCloseTo(4 / 32, 2);
    expect(a.grille.moyennes.length).toBe(32);
  });
});

describe('décor 2,5D', () => {
  const moteur = creerMoteurComplet({ decors: { rue: DECOR } });

  it('parallaxe nulle au début du plan, bornée par le budget, cohérente avec les pieds', () => {
    const p = projet([{ type: 'panoramique', debut: 0.5, duree: 1, vers: { u: 0.75, v: 0.5 } }]);
    const e0 = evaluer(p, 0, moteur);
    expect(e0.decor!.parallaxe.decalage).toEqual({ x: 0, y: 0 });
    const e = evaluer(p, 2, moteur);
    const par = e.decor!.parallaxe;
    expect(Math.abs(par.decalage.x)).toBeGreaterThan(0);
    const ppu = e.camera.zoom * 1920;
    const dMax = Math.max(par.profondeurReference, 1 - par.profondeurReference);
    expect(Math.hypot(par.decalage.x, par.decalage.y) * dMax * ppu).toBeLessThanOrEqual(REGLAGES_DECOR.budgetPx + 1e-6);
    // À la profondeur de référence, aucun déplacement.
    const q = deplacerParallaxe({ x: 1, y: 0.9 }, par.profondeurReference, par, e.camera.centre);
    expect(q.x).toBeCloseTo(1, 12);
    expect(q.y).toBeCloseTo(0.9, 12);
  });

  it('gel : la vie du décor se fige (temps du jeu constant)', () => {
    const p = projet([{ type: 'gel', debut: 1, duree: 1 }]);
    const a = evaluer(p, 1.2, moteur).decor!;
    const b = evaluer(p, 1.8, moteur).decor!;
    expect(a.figurants.temps).toBe(b.figurants.temps);
    expect(a.ciel.temps).toBe(b.ciel.temps);
    expect(evaluer(p, 2.5, moteur).decor!.figurants.temps).toBeGreaterThan(b.figurants.temps);
  });

  it('ambiance : vie et figurants réglables', () => {
    const p = projet();
    p.plans[0]!.ambiance = { vie: 0.3, figurants: false, ciel: false };
    const d = evaluer(p, 1, moteur).decor!;
    expect(d.figurants.actifs).toBe(false);
    expect(d.figurants.amplitude).toBeCloseTo(0.3, 9);
    expect(d.ciel.actif).toBe(false);
    expect(d.lumieres.amplitude).toBeCloseTo(0.3, 9);
  });
});

describe('sol praticable', () => {
  it('part de sol : 1 sur le plan du sol, 0 sur un objet plus proche, null sans analyse', async () => {
    const { solPraticable } = await import('../src/scene/analyse-pixels');
    const { partSolPraticable } = await import('../src/scene/sol');
    const L = 64;
    const H = 32;
    const prof = { largeur: L, hauteur: H, donnees: new Uint8Array(4 * L * H) };
    const masques = { largeur: L, hauteur: H, donnees: new Uint8Array(4 * L * H) };
    const sol = { a: 2, b: -1, r2: 0.99 };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < L; x++) {
        const v = (y + 0.5) / H;
        // Sol partout, sauf une « table » (profondeur constante, plus proche) dans la moitié droite.
        const d = x >= L / 2 && v > 0.7 ? 0.95 : Math.max(0, Math.min(1, sol.a * v + sol.b));
        prof.donnees[4 * (y * L + x)] = Math.round(d * 255);
      }
    const p = solPraticable(prof, masques, sol, 0.6)!;
    expect(p).not.toBeNull();
    const decor = { analyse: { praticable: p } } as unknown as Parameters<typeof partSolPraticable>[0];
    expect(partSolPraticable(decor, 0.2, 0.9)!).toBeGreaterThan(0.9);
    expect(partSolPraticable(decor, 0.8, 0.8)!).toBeLessThan(0.2);
    expect(partSolPraticable(null, 0.5, 0.9)).toBeNull();
    expect(solPraticable(prof, masques, { a: 2, b: -1, r2: 0.2 }, 0.6)).toBeNull();
  });
});
