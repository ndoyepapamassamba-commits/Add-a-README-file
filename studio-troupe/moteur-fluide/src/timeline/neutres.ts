/**
 * États neutres (repos) : valeurs de départ et de repli de tous les états du contrat. Chaque appel renvoie un
 * objet neuf (aucun partage mutable entre images).
 */
import type {
  EffetsImage,
  EtatCamera,
  EtatDecor,
  EtatOmbre,
  EtatSourcil,
  EtatVisage,
  Etalonnage,
  Pose,
  PoseRacine,
  ReglagesSortie,
  TransformOs,
} from './types';

/** Transformation d'os identité (repos). */
export function transformOsNeutre(): TransformOs {
  return { rotation: 0, translation: { x: 0, y: 0 }, echelle: { x: 1, y: 1 } };
}

/** Racine au repos. */
export function racineNeutre(flip = false): PoseRacine {
  return { decalage: { x: 0, y: 0 }, rotation: 0, echelle: { x: 1, y: 1 }, flip };
}

/** Pose de repos (tous les os à l'identité). */
export function poseNeutre(flip = false): Pose {
  return { os: {}, racine: racineNeutre(flip) };
}

/** Sourcil au repos. */
export function sourcilNeutre(): EtatSourcil {
  return { hauteur: 0, froncement: 0, inclinaison: 0 };
}

/** Visage au repos : bouche fermée détendue, yeux ouverts, regard droit. */
export function visageNeutre(): EtatVisage {
  return {
    viseme: 'repos',
    ouvertureBouche: 0,
    largeur: 0,
    arrondi: 0,
    dents: 0,
    langue: 0,
    sourire: 0,
    paupiereG: 0,
    paupiereD: 0,
    ecarquillement: 0,
    regard: { x: 0, y: 0 },
    sourcilG: sourcilNeutre(),
    sourcilD: sourcilNeutre(),
  };
}

/** Ombre de contact discrète. */
export function ombreNeutre(largeur = 0.08): EtatOmbre {
  return { opacite: 0.35, largeur, aplatissement: 0.18, cisaillement: { x: 0, y: 0 }, flou: 6 };
}

/** Étalonnage identité. */
export function etalonnageNeutre(): Etalonnage {
  return { gain: [1, 1, 1], decalage: [0, 0, 0] };
}

/** Caméra centrée sur `centre`, sans mouvement. */
export function cameraNeutre(centre = { x: 0.5, y: 0.5 }, zoom = 1): EtatCamera {
  return {
    centre: { x: centre.x, y: centre.y },
    zoom,
    rotation: 0,
    tremble: { decalage: { x: 0, y: 0 }, rotation: 0 },
    flouBouge: { x: 0, y: 0 },
    profondeurNette: null,
  };
}

/** Décor immobile. */
export function decorNeutre(id: string, temps = 0): EtatDecor {
  return {
    id,
    parallaxe: { decalage: { x: 0, y: 0 }, poussee: 0, profondeurReference: 0.5 },
    figurants: { actifs: true, temps, amplitude: 1 },
    ciel: { actif: true, decalage: 0, temps },
    lumieres: { amplitude: 1, temps },
  };
}

/** Aucun effet plein cadre. */
export function effetsNeutres(): EffetsImage {
  return { desaturation: 0, vignette: 0, fondu: 0, flash: 0 };
}

/** Réglages de sortie par défaut : 1080×1920 (9:16), 4 sous-instants, obturateur 180°. */
export function sortieParDefaut(): ReglagesSortie {
  return { largeur: 1080, hauteur: 1920, sousImages: 4, obturateur: 0.5, graine: 1 };
}
