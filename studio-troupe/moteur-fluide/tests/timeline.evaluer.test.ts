import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { creerMoteurComplet } from '../src/assemblage';
import { creerAleatoire } from '../src/noyau/aleatoire';
import { creerMoteur, etatsImage, evaluer, MOTEUR_NEUTRE, nombreImagesProjet } from '../src/timeline/evaluer';
import { finReplique, niveauFondu, tempsDeJeu } from '../src/timeline/derives';
import { poseNeutre } from '../src/timeline/neutres';
import { creerProjetVide, normaliserProjet, planA, validerProjet } from '../src/timeline/projet';
import { ecranVersMonde, matriceRacine, mondeVersEcran } from '../src/timeline/projection';
import { appliquer } from '../src/noyau/maths2d';
import type { CharacterRig, FournisseurPose, InfoDecor, Projet } from '../src/timeline/types';

function chargerExemple(): Projet {
  const brut = JSON.parse(readFileSync(new URL('../exemples/pilote.projet.json', import.meta.url), 'utf8'));
  const r = validerProjet(brut);
  if (!r.ok || !r.projet) throw new Error(r.erreurs.join('\n'));
  return r.projet;
}

function gelerProfond<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) gelerProfond(v);
    Object.freeze(o);
  }
  return o;
}

/** Décor factice (aucun fichier lu) : 2000×976, sol à 0,95, 2 m de scène. */
const DECOR_FACTICE: InfoDecor = {
  id: 'maquis',
  nom: 'Maquis (factice)',
  largeur: 2000,
  hauteur: 976,
  aspect: 2000 / 976,
  fit: { mH: 2.2, floor: 1, cx: 0.47 },
  fichiers: { src: 'x', plate: 'x', depth: 'x', plateDepth: 'x', masks: 'x' },
};

/** Rig minimal (un os, un triangle) dessiné vers la droite. */
const RIG_FACTICE: CharacterRig = {
  format: 'moteur-fluide/rig@1',
  id: 'modou',
  nom: 'MODOU (factice)',
  image: { chemin: 'x.png', largeur: 600, hauteur: 1200 },
  hauteurPx: 1100,
  ancrageSol: { x: 300, y: 1150 },
  orientationDessin: 1,
  squelette: { os: [{ nom: 'bassin', parent: null, pivot: { x: 300, y: 700 }, longueur: 100, angleRepos: -Math.PI / 2 }], racine: 'bassin' },
  maillage: { positions: [0, 0, 600, 0, 300, 1150], uvs: [0, 0, 1, 0, 0.5, 0.96], indices: [0, 1, 2], influences: [0, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1], poids: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] },
  groupes: [{ nom: 'corps', premierTriangle: 0, nombreTriangles: 1, ordre: 0 }],
  visage: null,
};

describe('validation du projet', () => {
  it("accepte l'exemple pilote et le normalise", () => {
    const p = chargerExemple();
    expect(p.plans.map((x) => x.id)).toEqual(['p1', 'p2']);
    expect(p.sortie.largeur).toBe(1080);
  });

  it('signale les erreurs en français avec le chemin fautif', () => {
    const r = validerProjet({
      format: 'autre',
      titre: 't',
      fps: 0,
      duree: 1,
      personnages: [{ id: 'a', nom: 'A', rig: 'a', tailleM: 1.7 }],
      plans: [
        { id: 'p', debut: 0, fin: 2, decor: 'd', cadrage: {}, personnages: [{ personnage: 'inconnu', u: 0.5 }] },
        { id: 'q', debut: 1, fin: 3, decor: 'd', cadrage: {}, personnages: [] },
      ],
      pistes: { actions: [{ personnage: 'a', action: 'danserLeCoupeDecale', debut: 0 }], dialogue: [], camera: [{ type: 'zoomFou', debut: 0, duree: 1 }], sons: [] },
    });
    expect(r.ok).toBe(false);
    const tout = r.erreurs.join('\n');
    expect(tout).toMatch(/format/);
    expect(tout).toMatch(/fps/);
    expect(tout).toMatch(/personnage inconnu « inconnu »/);
    expect(tout).toMatch(/se chevauchent/);
    expect(tout).toMatch(/mouvement inconnu « zoomFou »/);
    expect(r.avertissements.join('\n')).toMatch(/hors catalogue/);
  });

  it("normaliserProjet ne modifie pas l'original", () => {
    const p = creerProjetVide('vide');
    const avant = JSON.stringify(p);
    normaliserProjet(gelerProfond(p));
    expect(JSON.stringify(p)).toBe(avant);
  });
});

describe('evaluer : pureté et déterminisme', () => {
  const projet = gelerProfond(chargerExemple());
  const moteurs = [
    ['neutre', MOTEUR_NEUTRE],
    ['complet avec décor et rig factices', creerMoteurComplet({ decors: { maquis: DECOR_FACTICE }, rigs: { modou: RIG_FACTICE } })],
  ] as const;

  for (const [nom, moteur] of moteurs) {
    it(`même t deux fois → même état (${nom})`, () => {
      for (const t of [0, 0.5, 1.234, 3.5, 3.999, 4, 5.9]) {
        const a = evaluer(projet, t, moteur);
        const b = evaluer(projet, t, moteur);
        expect(b).toEqual(a);
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        expect(b).not.toBe(a); // pas d'objet partagé entre deux appels
      }
    });

    it(`ordre quelconque (avant, arrière, hasard) → mêmes états (${nom})`, () => {
      const n = nombreImagesProjet(projet);
      const instants = Array.from({ length: n }, (_, i) => i / projet.fps);
      const avant = instants.map((t) => JSON.stringify(evaluer(projet, t, moteur)));
      const arriere = [...instants].reverse().map((t) => JSON.stringify(evaluer(projet, t, moteur))).reverse();
      const alea = creerAleatoire(99);
      const ordre = instants.map((_, i) => i).sort(() => alea.suivant() - 0.5);
      const hasard = new Array<string>(n);
      for (const i of ordre) hasard[i] = JSON.stringify(evaluer(projet, instants[i]!, moteur));
      expect(arriere).toEqual(avant);
      expect(hasard).toEqual(avant);
    });

    it(`ne modifie jamais le projet (projet gelé) (${nom})`, () => {
      const avant = JSON.stringify(projet);
      for (let t = -1; t < 7; t += 0.37) evaluer(projet, t, moteur);
      expect(JSON.stringify(projet)).toBe(avant);
    });
  }

  it('refuse un instant non fini', () => {
    expect(() => evaluer(projet, Number.NaN)).toThrow(/instant invalide/);
  });
});

describe('evaluer : plans, temps du jeu, pistes', () => {
  const projet = chargerExemple();

  it('choisit le plan actif sur [debut, fin[ (coupe exacte)', () => {
    expect(evaluer(projet, 3.999).plan?.id).toBe('p1');
    expect(evaluer(projet, 4).plan?.id).toBe('p2');
    expect(evaluer(projet, -1).plan?.id).toBe('p1');
    expect(evaluer(projet, 99).plan?.id).toBe('p2');
    expect(planA(creerProjetVide('v'), 1)).toEqual({ plan: null, index: -1 });
    const vide = evaluer(creerProjetVide('v'), 1);
    expect(vide.plan).toBeNull();
    expect(vide.decor).toBeNull();
    expect(vide.personnages).toEqual([]);
  });

  it('les personnages du plan sont présents et triés par ordre de dessin', () => {
    const e = evaluer(projet, 1);
    expect(e.personnages.map((p) => p.id).sort()).toEqual(['coumba', 'modou']);
    for (let i = 1; i < e.personnages.length; i++) {
      expect(e.personnages[i]!.ordre).toBeGreaterThanOrEqual(e.personnages[i - 1]!.ordre);
    }
    expect(evaluer(projet, 4.5).personnages.map((p) => p.id)).toEqual(['coumba']);
  });

  it('gel : le temps du jeu se fige puis reprend avec le retard du gel', () => {
    expect(tempsDeJeu(projet, 3.4)).toBeCloseTo(3.4, 12);
    expect(tempsDeJeu(projet, 3.6)).toBeCloseTo(3.5, 12);
    expect(tempsDeJeu(projet, 3.99)).toBeCloseTo(3.5, 12);
    expect(tempsDeJeu(projet, 5)).toBeCloseTo(4.5, 12);
    const e = evaluer(projet, 3.7);
    expect(e.tJeu).toBeCloseTo(3.5, 12);
    expect(e.effets.desaturation).toBeGreaterThan(0.3);
  });

  it('fondus : noir avant l’entrée, image ensuite, noir à la fin', () => {
    expect(niveauFondu(projet, 0)).toBe(1);
    expect(niveauFondu(projet, 0.3)).toBe(0);
    expect(niveauFondu(projet, 3)).toBe(0);
    expect(niveauFondu(projet, 6)).toBe(1);
    expect(evaluer(projet, 2).effets.fondu).toBe(0);
  });

  it('sous-titres et fin des répliques', () => {
    const r1 = projet.pistes.dialogue[0]!;
    expect(finReplique(r1)).toBeCloseTo(0.5 + 0.52, 12);
    expect(evaluer(projet, 1.3).sousTitres.map((s) => s.texte)).toEqual(['Quoi encore ?']);
    expect(evaluer(projet, 1.6).sousTitres[0]?.motActif).toBe(1);
    expect(evaluer(projet, 3).sousTitres).toEqual([]);
  });

  it('sous-états de flou de bougé : jamais à travers une coupe', () => {
    const derniereImageP1 = Math.round(4 * projet.fps) - 1;
    const etats = etatsImage(projet, derniereImageP1);
    expect(etats.length).toBe(projet.sortie.sousImages);
    expect(etats[0]!.t).toBe(derniereImageP1 / projet.fps);
    for (const e of etats) expect(e.plan?.id).toBe('p1');
  });

  it('les fournisseurs injectés sont utilisés (injection de dépendances)', () => {
    const pose: FournisseurPose = (ctx) => {
      const p = poseNeutre();
      p.os.tete = { rotation: ctx.tJeu * 0.1, translation: { x: 0, y: 0 }, echelle: { x: 1, y: 1 } };
      return p;
    };
    const moteur = creerMoteur({ pose });
    const e = evaluer(projet, 2, moteur);
    expect(e.personnages[0]!.pose.os.tete!.rotation).toBeCloseTo(0.2, 12);
    // les autres fournisseurs restent neutres
    expect(e.personnages[0]!.visage.viseme).toBe('repos');
  });
});

describe('placement et repères (fournisseurs neutres)', () => {
  const projet = chargerExemple();
  const moteur = creerMoteur({}, { decors: { maquis: DECOR_FACTICE }, rigs: { modou: RIG_FACTICE } });

  it('pieds sur la ligne de sol et taille réelle via fit.mH', () => {
    const e = evaluer(projet, 1, moteur);
    const modou = e.personnages.find((p) => p.id === 'modou')!;
    expect(modou.position.y).toBeCloseTo(1, 12); // fit.floor
    expect(modou.position.x).toBeCloseTo(0.4 * DECOR_FACTICE.aspect, 12);
    expect(modou.echelle * RIG_FACTICE.hauteurPx).toBeCloseTo(1.76 / 2.2, 12); // tailleM / mH
  });

  it('miroir quand le personnage regarde à l’opposé du dessin', () => {
    const p = normaliserProjet(chargerExemple());
    const e1 = evaluer(p, 1, moteur);
    expect(e1.personnages.find((x) => x.id === 'modou')!.pose.racine.flip).toBe(false);
    const p2 = structuredClone(p);
    p2.plans[0]!.personnages[0]!.orientation = -1;
    const e2 = evaluer(p2, 1, moteur);
    expect(e2.personnages.find((x) => x.id === 'modou')!.pose.racine.flip).toBe(true);
  });

  it('caméra : le centre tombe au milieu de l’image, aller-retour monde ↔ écran', () => {
    const e = evaluer(projet, 1, moteur);
    const c = mondeVersEcran(e.camera, 1080, 1920, e.camera.centre);
    expect(c.x).toBeCloseTo(540, 9);
    expect(c.y).toBeCloseTo(960, 9);
    const m = ecranVersMonde(e.camera, 1080, 1920, { x: 100, y: 1700 });
    const r = mondeVersEcran(e.camera, 1080, 1920, m);
    expect(r.x).toBeCloseTo(100, 9);
    expect(r.y).toBeCloseTo(1700, 9);
    // la fenêtre reste dans le décor
    const gauche = ecranVersMonde(e.camera, 1080, 1920, { x: 0, y: 0 });
    const droite = ecranVersMonde(e.camera, 1080, 1920, { x: 1080, y: 1920 });
    expect(gauche.x).toBeGreaterThanOrEqual(-1e-9);
    expect(droite.x).toBeLessThanOrEqual(DECOR_FACTICE.aspect + 1e-9);
    expect(gauche.y).toBeGreaterThanOrEqual(-1e-9);
    expect(droite.y).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('matrice de racine : l’ancrage au sol ne bouge que du décalage', () => {
    const ancre = { x: 300, y: 1150 };
    const m = matriceRacine({ decalage: { x: 5, y: -40 }, rotation: 0.3, echelle: { x: 1.1, y: 0.9 }, flip: true }, ancre);
    const p = appliquer(m, ancre);
    expect(p.x).toBeCloseTo(305, 9);
    expect(p.y).toBeCloseTo(1110, 9);
  });
});
