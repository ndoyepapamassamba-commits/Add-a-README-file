/**
 * Réglages du corps : ressort de chaque os (os lourds lents, mains et tête vives), profondeur dans la chaîne
 * (chevauchement), zones de masquage des couches, personnalité de mouvement.
 *
 * Le ressort d'un canal = ressort du groupe (`GroupeRessort`, réglable par personnage) × facteur de l'os, avec un
 * amortissement plus faible aux extrémités : la main dépasse plus que l'épaule (follow-through) et part plus tard
 * (chevauchement), sans aucune simulation.
 */
import { borner } from '../noyau/maths2d';
import type { GroupeRessort, ParametresRessort, Personnalite } from '../timeline/types';
import { RACINE, VISAGE, type IndiceVisage } from './canaux';

/** Ressorts par défaut des groupes de canaux (f en Hz, ζ, r). */
export const RESSORTS_DEFAUT: Readonly<Record<GroupeRessort, ParametresRessort>> = Object.freeze({
  corps: { f: 1.9, zeta: 0.62, r: 0 },
  tete: { f: 2.8, zeta: 0.52, r: 0 },
  bras: { f: 2.6, zeta: 0.5, r: 0 },
  jambes: { f: 2.4, zeta: 0.68, r: 0 },
  bouche: { f: 9, zeta: 0.85, r: 0 },
  regard: { f: 6, zeta: 0.9, r: 0 },
  sourcils: { f: 4, zeta: 0.6, r: 0 },
  secondaire: { f: 1.5, zeta: 0.25, r: 0 },
});

/** Os sans suffixe de côté : `brasG` → `bras`. */
export function osDeBase(nom: string): string {
  return /^(epaule|bras|avantBras|main|cuisse|jambe|pied)[GD]$/.test(nom) ? nom.slice(0, -1) : nom;
}

/** Côté d'un os latéral (`G`, `D`), ou `null`. */
export function coteOs(nom: string): 'G' | 'D' | null {
  return /^(epaule|bras|avantBras|main|cuisse|jambe|pied)[GD]$/.test(nom) ? (nom.slice(-1) as 'G' | 'D') : null;
}

const GROUPE_BASE: Readonly<Record<string, GroupeRessort>> = {
  [RACINE]: 'corps',
  bassin: 'corps',
  torse: 'corps',
  ventre: 'secondaire',
  poitrine: 'corps',
  cou: 'tete',
  tete: 'tete',
  epaule: 'bras',
  bras: 'bras',
  avantBras: 'bras',
  main: 'bras',
  cuisse: 'jambes',
  jambe: 'jambes',
  pied: 'jambes',
};

/** Facteur de fréquence par os (relatif au groupe) : bassin lourd, main vive. */
const FACTEUR_F: Readonly<Record<string, number>> = {
  [RACINE]: 0.85,
  bassin: 0.85,
  torse: 1,
  poitrine: 1.05,
  ventre: 1,
  cou: 0.95,
  tete: 1,
  epaule: 0.95,
  bras: 1,
  avantBras: 1.12,
  main: 1.3,
  cuisse: 1,
  jambe: 1.05,
  pied: 1.15,
};

/** Écart d'amortissement par os : les extrémités dépassent davantage. */
const ECART_ZETA: Readonly<Record<string, number>> = {
  [RACINE]: 0.05,
  bassin: 0.05,
  tete: -0.02,
  avantBras: -0.05,
  main: -0.1,
  pied: -0.05,
};

/** Profondeur dans la chaîne depuis le centre du corps (chevauchement : départ retardé de `profondeur·δ`). */
const PROFONDEUR: Readonly<Record<string, number>> = {
  [RACINE]: 0,
  bassin: 0,
  torse: 1,
  ventre: 2,
  poitrine: 2,
  cou: 2,
  epaule: 2,
  tete: 3,
  bras: 3,
  avantBras: 4,
  main: 5,
  cuisse: 1,
  jambe: 2,
  pied: 3,
};

/** Profondeur d'un os (os libres : 3). */
export function profondeurOs(nom: string): number {
  if (nom === VISAGE) return 3;
  return PROFONDEUR[osDeBase(nom)] ?? 3;
}

/** Groupe de ressort d'un os (os libres : `secondaire`). */
export function groupeOs(nom: string): GroupeRessort {
  return GROUPE_BASE[osDeBase(nom)] ?? 'secondaire';
}

/** Groupe de ressort d'une indication de visage. */
export function groupeIndice(indice: IndiceVisage): GroupeRessort {
  if (indice.startsWith('sourcil')) return 'sourcils';
  if (indice === 'regardX' || indice === 'regardY') return 'regard';
  if (indice === 'ecarquillement' || indice === 'plisser' || indice === 'sansClignement') return 'sourcils';
  return 'bouche';
}

/** Modification de ressort propre à une courbe d'action. */
export interface ModifRessort {
  /** Multiplie la fréquence (prise sèche : 1,5 à 2). */
  facteurF?: number;
  /** Remplace l'amortissement. */
  zeta?: number;
  /** Ajoute à l'amortissement. */
  ecartZeta?: number;
  /** Remplace la réponse initiale r (r > 1 : attaque sèche). */
  r?: number;
}

/** Zones de masquage des couches (un geste « possède » des zones ; les couches plus faibles y sont atténuées). */
export const ZONES = ['racine', 'jambes', 'torse', 'tete', 'brasG', 'brasD', 'visage', 'regard', 'parole'] as const;
/** Zone de masquage. */
export type Zone = (typeof ZONES)[number];

/** Zone d'un os ou d'un pseudo-os. */
export function zoneOs(nom: string): Zone {
  if (nom === RACINE) return 'racine';
  if (nom === VISAGE) return 'visage';
  const base = osDeBase(nom);
  const cote = coteOs(nom);
  if (base === 'epaule' || base === 'bras' || base === 'avantBras' || base === 'main') return cote === 'G' ? 'brasG' : 'brasD';
  if (base === 'cuisse' || base === 'jambe' || base === 'pied' || base === 'bassin') return 'jambes';
  if (base === 'cou' || base === 'tete') return 'tete';
  return 'torse';
}

/** Personnalité complète (valeurs par défaut appliquées). */
export interface PersonnaliteResolue {
  exageration: number;
  tempo: number;
  ressorts: Record<GroupeRessort, ParametresRessort>;
  chevauchement: number;
}

/** Applique les valeurs par défaut d'une personnalité. */
export function resoudrePersonnalite(p: Personnalite | undefined): PersonnaliteResolue {
  const ressorts = { ...RESSORTS_DEFAUT } as Record<GroupeRessort, ParametresRessort>;
  for (const [g, r] of Object.entries(p?.ressorts ?? {}) as Array<[GroupeRessort, ParametresRessort | undefined]>) {
    if (r && Number.isFinite(r.f) && r.f > 0 && Number.isFinite(r.zeta) && r.zeta > 0) ressorts[g] = { ...r };
  }
  return {
    exageration: borner(p?.exageration ?? 1, 0.3, 2),
    tempo: borner(p?.tempo ?? 1, 0.25, 4),
    ressorts,
    chevauchement: borner(p?.chevauchement ?? 0.045, 0, 0.2),
  };
}

/** Ressort d'un canal : groupe × facteur d'os × tempo, puis modification de l'action. */
export function ressortCanal(
  nom: string,
  indice: IndiceVisage | null,
  perso: PersonnaliteResolue,
  tempo: number,
  modif?: ModifRessort,
): ParametresRessort {
  const groupe = indice ? groupeIndice(indice) : groupeOs(nom);
  const base = perso.ressorts[groupe];
  const cle = osDeBase(nom);
  const f = base.f * (indice ? 1 : (FACTEUR_F[cle] ?? 1)) * tempo * (modif?.facteurF ?? 1);
  let zeta = modif?.zeta ?? base.zeta + (indice ? 0 : (ECART_ZETA[cle] ?? 0));
  zeta += modif?.ecartZeta ?? 0;
  return {
    f: borner(f, 0.2, 40),
    zeta: borner(zeta, 0.12, 2),
    r: modif?.r ?? base.r ?? 0,
  };
}

/** Clé de regroupement de ressorts (canaux identiques et mêmes paramètres → un seul canal analytique). */
export function cleRessort(p: ParametresRessort): string {
  return `${p.f.toFixed(5)}|${p.zeta.toFixed(5)}|${(p.r ?? 0).toFixed(5)}`;
}
