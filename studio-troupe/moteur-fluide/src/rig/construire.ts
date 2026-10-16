/**
 * Construction d'un `CharacterRig` complet depuis une description source (`rig.json` au format
 * `moteur-fluide/rig-source@1` : articulations, ancrages du visage, pieds) et l'image détourée en RGBA :
 * squelette → maillage adaptatif → poids en bandes → centres CoR → groupes de dessin. Module pur (aucun accès
 * disque : `charger.ts` s'occupe des fichiers dans Node).
 */
import type {
  AncresVisage,
  ChaineSecondaire,
  CharacterRig,
  DefinitionIK,
  Squelette,
  Vec2,
} from '../timeline/types';
import { distanceSignee, echantillonner } from './distance';
import { ikStandard } from './ik';
import { construireMaillage, couvertureMasque, masqueAlpha, type ImageRGBA, type OptionsMaillage, type StatsMaillage, type ZoneDensite } from './maillage';
import { calculerPoids, type OptionsPoids, type StatsPoids } from './poids';
import {
  boutOs,
  construireSquelette,
  descriptionsHumanoide,
  indexerSquelette,
  type ArticulationsHumanoide,
  type DescriptionOs,
} from './squelette';

/** Identifiant du format source. */
export const FORMAT_SOURCE_RIG = 'moteur-fluide/rig-source@1';

/** Description source d'un rig (fichier `rig.json` écrit à la main ou par un outil). */
export interface SourceRig {
  format: typeof FORMAT_SOURCE_RIG;
  id: string;
  nom: string;
  /** Image détourée (PNG RGBA), chemin relatif au fichier `rig.json` ou absolu. */
  image: string;
  /** 1 = regarde vers la droite de l'image, −1 = vers la gauche, 0 = de face. */
  orientationDessin: 1 | -1 | 0;
  /** Articulations nommées (squelette humanoïde standard de 18 os). */
  articulations?: ArticulationsHumanoide;
  /** Os supplémentaires ou squelette complet (si `articulations` est absent). */
  os?: DescriptionOs[];
  /** Limites par os (remplacent les limites standard). */
  limites?: Record<string, { min: number; max: number }>;
  /** Point au sol entre les pieds (défaut : milieu des semelles, ou bas du masque). */
  ancrageSol?: Vec2;
  /** Semelles au repos (défaut : sous les os des pieds, au bas du masque). */
  pieds?: { gauche: Vec2; droit: Vec2 };
  /** Hauteur du personnage (défaut : hauteur du masque). */
  hauteurPx?: number;
  /** Ancrages du visage (px image) ou `null`. */
  visage: AncresVisage | null;
  /** IK (défaut : bras et jambes standard). */
  ik?: DefinitionIK[];
  secondaire?: ChaineSecondaire[];
  /** Carte des parties : PNG dont le canal ROUGE vaut `index + 1` dans `os` (0 = aucune partie). */
  parties?: { image: string; os: string[] };
  /** Zones forcées (polygones px) par os, pour l'étiquetage automatique. */
  zones?: Record<string, Vec2[]>;
  /** Réglages du maillage. */
  maillage?: Omit<OptionsMaillage, 'zones'> & {
    /** Pas aux articulations, relatif au pas de base (défaut 0,5). */
    facteurArticulations?: number;
    /** Pas autour des yeux et de la bouche, relatif au pas de base (défaut 0,33). */
    facteurVisage?: number;
    /** Zones de densité supplémentaires. */
    zones?: ZoneDensite[];
  };
  /** Réglages des poids. */
  poids?: Pick<OptionsPoids, 'facteurBande' | 'bandeMin' | 'bandeMax' | 'poidsMin' | 'sigmaCor' | 'distancePontMax'>;
  provenance?: { source: string; licence: string; empreinte?: string };
}

/** Rapport de construction (mesures de contrôle). */
export interface RapportRig {
  maillage: StatsMaillage;
  poids: StatsPoids;
  /** Fraction des pixels du masque couverts par au moins un triangle. */
  couverture: number;
  /** Triangles dont le centroïde est hors du masque dilaté de 2 px (0 attendu). */
  trianglesDehors: number;
  pixelsMasque: number;
  dureeMs: number;
}

/** Erreurs de cohérence d'une description source (liste vide = valide). */
export function validerSourceRig(s: unknown): string[] {
  const e: string[] = [];
  if (!s || typeof s !== 'object') return ['rig source : objet JSON attendu'];
  const o = s as Partial<SourceRig>;
  if (o.format !== FORMAT_SOURCE_RIG) e.push(`format : « ${FORMAT_SOURCE_RIG} » attendu (trouvé « ${String(o.format)} »)`);
  if (!o.id || typeof o.id !== 'string') e.push('id : chaîne non vide attendue');
  if (!o.nom || typeof o.nom !== 'string') e.push('nom : chaîne non vide attendue');
  if (!o.image || typeof o.image !== 'string') e.push('image : chemin du PNG détouré attendu');
  if (![1, -1, 0].includes(o.orientationDessin as number)) e.push('orientationDessin : 1, −1 ou 0 attendu');
  if (!o.articulations && !(o.os && o.os.length)) e.push('squelette : « articulations » ou « os » requis');
  if (o.visage === undefined) e.push('visage : ancrages ou null attendus');
  if (o.parties && (!o.parties.image || !Array.isArray(o.parties.os))) e.push('parties : { image, os[] } attendu');
  return e;
}

/** Squelette d'une description source. */
export function squeletteDeSource(source: SourceRig): Squelette {
  const desc: DescriptionOs[] = source.articulations ? descriptionsHumanoide(source.articulations) : [];
  for (const d of source.os ?? []) {
    const i = desc.findIndex((x) => x.nom === d.nom);
    if (i >= 0) desc[i] = d;
    else desc.push(d);
  }
  for (const [nom, l] of Object.entries(source.limites ?? {})) {
    const d = desc.find((x) => x.nom === nom);
    if (d) d.limites = { ...l };
  }
  return construireSquelette(desc);
}

/** Zones de densité automatiques : articulations et visage. */
function zonesAutomatiques(
  squelette: Squelette,
  visage: AncresVisage | null,
  distance: Float32Array,
  largeur: number,
  hauteur: number,
  pasBase: number,
  facteurArt: number,
  facteurVisage: number,
): ZoneDensite[] {
  const zones: ZoneDensite[] = [];
  const idx = indexerSquelette(squelette);
  for (let i = 0; i < squelette.os.length; i++) {
    if (idx.parents[i]! < 0) continue;
    const p = squelette.os[i]!.pivot;
    const prof = Math.max(0, -echantillonner(distance, largeur, hauteur, p.x - 0.5, p.y - 0.5));
    const r = Math.min(40, Math.max(8, prof));
    zones.push({ centre: { ...p }, rayon: Math.max(3 * pasBase, 3.2 * r), pas: pasBase * facteurArt });
  }
  if (visage) {
    const pasV = Math.max(3, pasBase * facteurVisage);
    const b = visage.bouche;
    zones.push({ centre: { ...b.centre }, rayon: Math.max(4 * pasV, 1.5 * b.largeur), pas: pasV });
    if (b.menton) zones.push({ centre: { ...b.menton }, rayon: Math.max(4 * pasV, 0.8 * b.largeur), pas: pasV * 1.3 });
    for (const oeil of [visage.oeilG, visage.oeilD]) {
      zones.push({ centre: { ...oeil.centre }, rayon: Math.max(4 * pasV, 2.6 * Math.max(oeil.rayon.x, oeil.rayon.y)), pas: pasV });
    }
    for (const s of [visage.sourcilG, visage.sourcilD]) {
      if (!s.points.length) continue;
      const c = s.points.reduce((a, q) => ({ x: a.x + q.x / s.points.length, y: a.y + q.y / s.points.length }), { x: 0, y: 0 });
      zones.push({ centre: c, rayon: Math.max(4 * pasV, 30), pas: pasV * 1.3 });
    }
  }
  return zones;
}

/** Carte des parties (canal rouge = index + 1 dans `nomsOs`) → étiquettes par pixel (index d'os du squelette). */
export function etiquettesDeCarte(carte: ImageRGBA, nomsOs: readonly string[], squelette: Squelette): Int16Array {
  const idx = indexerSquelette(squelette);
  const table = nomsOs.map((nom) => {
    const j = idx.index.get(nom);
    if (j === undefined) throw new Error(`Carte des parties : os inconnu « ${nom} »`);
    return j;
  });
  const n = carte.largeur * carte.hauteur;
  const e = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const r = carte.donnees[4 * i]!;
    const a = carte.donnees[4 * i + 3]!;
    e[i] = r > 0 && a > 0 && r <= table.length ? table[r - 1]! : -1;
  }
  return e;
}

/** Construit le rig complet. `cheminImage` est recopié tel quel dans `rig.image.chemin`. */
export function construireRig(
  source: SourceRig,
  image: ImageRGBA,
  options: { cheminImage: string; parties?: ImageRGBA } = { cheminImage: '' },
): { rig: CharacterRig; rapport: RapportRig } {
  const debut = performance.now();
  const erreurs = validerSourceRig(source);
  if (erreurs.length) throw new Error(`Rig source invalide :\n  - ${erreurs.join('\n  - ')}`);
  const squelette = squeletteDeSource(source);
  const reglages = source.maillage ?? {};
  // Masque et champ de distance (pour la hauteur du masque et le rayon des articulations).
  const masque = masqueAlpha(image, reglages.seuilAlpha ?? 12);
  const pre = { masque, distance: distanceSignee(masque, image.largeur, image.hauteur), largeur: image.largeur, hauteur: image.hauteur };
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < pre.hauteur; y++) {
    for (let x = 0; x < pre.largeur; x++) {
      if (!pre.masque[y * pre.largeur + x]) continue;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
    }
  }
  if (yMax < yMin) throw new Error(`Rig « ${source.id} » : l'image est entièrement transparente`);
  const hauteurMasque = yMax - yMin + 1;
  const pasBase = reglages.pas ?? Math.max(6, hauteurMasque / 72);
  const zones = [
    ...zonesAutomatiques(
      squelette,
      source.visage,
      pre.distance,
      pre.largeur,
      pre.hauteur,
      pasBase,
      reglages.facteurArticulations ?? 0.5,
      reglages.facteurVisage ?? 0.33,
    ),
    ...(reglages.zones ?? []),
  ];
  const brut = construireMaillage(image, { ...reglages, pas: pasBase, zones });
  let etiquettesPixels: Int16Array | undefined;
  if (source.parties && options.parties) etiquettesPixels = etiquettesDeCarte(options.parties, source.parties.os, squelette);
  const pondere = calculerPoids(brut, squelette, {
    ...(source.poids ?? {}),
    ...(etiquettesPixels ? { etiquettesPixels } : {}),
    ...(source.zones ? { zones: source.zones } : {}),
    visage: source.visage,
    orientation: source.orientationDessin,
  });
  const n = pondere.positions.length / 2;
  const positions = Array.from(pondere.positions);
  const uvs = new Array<number>(2 * n);
  for (let v = 0; v < n; v++) {
    uvs[2 * v] = positions[2 * v]! / image.largeur;
    uvs[2 * v + 1] = positions[2 * v + 1]! / image.hauteur;
  }
  const idx = indexerSquelette(squelette);
  const bas = yMax + 1;
  const piedOs = (nom: string): Vec2 | null => {
    const i = idx.index.get(nom);
    if (i === undefined) return null;
    const o = squelette.os[i]!;
    const b = boutOs(o);
    return { x: (o.pivot.x + b.x) / 2, y: bas };
  };
  const pieds =
    source.pieds ??
    (() => {
      const g = piedOs('piedG');
      const d = piedOs('piedD');
      return g && d ? { gauche: g, droit: d } : undefined;
    })();
  const ancrageSol = source.ancrageSol ?? (pieds ? { x: (pieds.gauche.x + pieds.droit.x) / 2, y: (pieds.gauche.y + pieds.droit.y) / 2 } : { x: (xMin + xMax + 1) / 2, y: bas });
  const couverture = couvertureMasque(pondere.positions, pondere.triangles, brut.masque, brut.largeur, brut.hauteur, brut.distance, 2);
  const rig: CharacterRig = {
    format: 'moteur-fluide/rig@1',
    id: source.id,
    nom: source.nom,
    image: { chemin: options.cheminImage, largeur: image.largeur, hauteur: image.hauteur },
    hauteurPx: source.hauteurPx ?? hauteurMasque,
    ancrageSol,
    orientationDessin: source.orientationDessin,
    squelette,
    maillage: {
      positions,
      uvs,
      indices: Array.from(pondere.triangles),
      influences: Array.from(pondere.influences),
      poids: Array.from(pondere.poids),
      contour: pondere.boucles[0] ? [...pondere.boucles[0]] : [],
      centresRotation: Array.from(pondere.centres),
      partie: Array.from(pondere.etiquettes),
    },
    groupes: pondere.groupes,
    visage: source.visage,
    ik: source.ik ?? ikStandard(source.orientationDessin).filter((d) => d.os.every((o) => idx.index.has(o))),
  };
  if (pieds) rig.pieds = pieds;
  if (source.secondaire) rig.secondaire = source.secondaire;
  if (source.provenance) rig.provenance = source.provenance;
  return {
    rig,
    rapport: {
      maillage: brut.stats,
      poids: pondere.stats,
      couverture: couverture.couverture,
      trianglesDehors: couverture.trianglesDehors,
      pixelsMasque: couverture.pixelsMasque,
      dureeMs: performance.now() - debut,
    },
  };
}
