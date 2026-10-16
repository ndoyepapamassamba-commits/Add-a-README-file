/**
 * Squelette d'un personnage : construction depuis une description simple (pivot et bout de chaque os, en px image),
 * tri parents d'abord, validation, relations de parenté (distance dans l'arbre, articulation commune) et squelette
 * humanoïde standard construit depuis des articulations nommées. Module pur (navigateur et Node).
 *
 * Conventions : celles de `timeline/types.ts` (repère image, y vers le bas, angle positif = sens horaire, G/D = côté
 * du personnage : de face, son bras gauche est à droite de l'image).
 */
import type { NomOsStandard, Os, Squelette, Vec2 } from '../timeline/types';

/** Description d'un os au repos (format des fichiers `rig.json` sources). */
export interface DescriptionOs {
  nom: string;
  parent: string | null;
  /** Articulation (px image). */
  pivot: Vec2;
  /** Extrémité au repos (px image) : donne la longueur et la direction. */
  bout: Vec2;
  /** Limites de la rotation locale ajoutée (rad). Doivent contenir 0 (le repos). */
  limites?: { min: number; max: number };
}

/** Index précalculé d'un squelette (mémoïsé par objet). */
export interface IndexSquelette {
  /** Nom → position dans `squelette.os`. */
  readonly index: ReadonlyMap<string, number>;
  /** Position du parent (−1 pour la racine). */
  readonly parents: Int32Array;
  /** Enfants de chaque os. */
  readonly enfants: readonly (readonly number[])[];
  /** Profondeur dans l'arbre (racine = 0). */
  readonly profondeur: Int32Array;
}

const CACHE_INDEX = new WeakMap<Squelette, IndexSquelette>();

/** Index du squelette (mémoïsé : le squelette est immuable après chargement). */
export function indexerSquelette(squelette: Squelette): IndexSquelette {
  const deja = CACHE_INDEX.get(squelette);
  if (deja) return deja;
  const n = squelette.os.length;
  const index = new Map<string, number>();
  squelette.os.forEach((o, i) => index.set(o.nom, i));
  const parents = new Int32Array(n).fill(-1);
  const enfants: number[][] = Array.from({ length: n }, () => []);
  const profondeur = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const p = squelette.os[i]!.parent;
    if (p !== null) {
      const ip = index.get(p);
      if (ip === undefined) throw new Error(`Squelette : parent inconnu « ${p} » pour l'os « ${squelette.os[i]!.nom} »`);
      if (ip >= i) throw new Error(`Squelette : l'os « ${squelette.os[i]!.nom} » précède son parent « ${p} » (tri parents d'abord requis)`);
      parents[i] = ip;
      enfants[ip]!.push(i);
      profondeur[i] = profondeur[ip]! + 1;
    }
  }
  const resultat: IndexSquelette = { index, parents, enfants, profondeur };
  CACHE_INDEX.set(squelette, resultat);
  return resultat;
}

/** Position d'un os par son nom (−1 s'il n'existe pas). */
export function positionOs(squelette: Squelette, nom: string): number {
  return indexerSquelette(squelette).index.get(nom) ?? -1;
}

/** Extrémité d'un os au repos (px image). */
export function boutOs(os: Os): Vec2 {
  return { x: os.pivot.x + Math.cos(os.angleRepos) * os.longueur, y: os.pivot.y + Math.sin(os.angleRepos) * os.longueur };
}

/** Vrai si `a` est un ancêtre strict de `b`. */
export function estAncetre(idx: IndexSquelette, a: number, b: number): boolean {
  let p = idx.parents[b]!;
  while (p >= 0) {
    if (p === a) return true;
    p = idx.parents[p]!;
  }
  return false;
}

/** Chemin dans l'arbre de `a` à `b` (positions d'os, extrémités comprises). */
export function cheminOs(idx: IndexSquelette, a: number, b: number): number[] {
  const montee = (x: number): number[] => {
    const r = [x];
    while (idx.parents[r[r.length - 1]!]! >= 0) r.push(idx.parents[r[r.length - 1]!]!);
    return r;
  };
  const ca = montee(a);
  const cb = montee(b);
  const ensembleB = new Set(cb);
  let commun = -1;
  for (const x of ca) {
    if (ensembleB.has(x)) {
      commun = x;
      break;
    }
  }
  if (commun < 0) return [];
  const gauche = ca.slice(0, ca.indexOf(commun) + 1);
  const droite = cb.slice(0, cb.indexOf(commun)).reverse();
  return [...gauche, ...droite];
}

/** Nombre d'arêtes entre deux os dans l'arbre (0 = même os, 1 = parent/enfant, 2 = frères ou grand-parent). */
export function distanceArborescente(idx: IndexSquelette, a: number, b: number): number {
  if (a === b) return 0;
  const c = cheminOs(idx, a, b);
  return c.length === 0 ? Number.POSITIVE_INFINITY : c.length - 1;
}

/**
 * Articulation qui relie deux os voisins dans l'arbre : pivot de l'os le plus profond du premier lien du chemin
 * (pour un parent et son enfant : le pivot de l'enfant ; pour deux frères : leur pivot le plus proche du parent commun).
 */
export function articulationEntre(squelette: Squelette, a: number, b: number): Vec2 | null {
  const idx = indexerSquelette(squelette);
  const c = cheminOs(idx, a, b);
  if (c.length < 2) return null;
  // Os du chemin dont le parent est aussi sur le chemin et qui est le plus haut (profondeur minimale).
  let meilleur = -1;
  for (let i = 0; i < c.length; i++) {
    const o = c[i]!;
    const p = idx.parents[o]!;
    if (p >= 0 && c.includes(p)) {
      if (meilleur < 0 || idx.profondeur[o]! < idx.profondeur[meilleur]!) meilleur = o;
    }
  }
  return meilleur >= 0 ? { ...squelette.os[meilleur]!.pivot } : null;
}

/** Erreurs de cohérence d'un squelette (liste vide = valide). Messages en français. */
export function validerSquelette(squelette: Squelette): string[] {
  const erreurs: string[] = [];
  const noms = new Set<string>();
  squelette.os.forEach((o, i) => {
    const ou = `squelette.os[${i}]`;
    if (!o.nom) erreurs.push(`${ou} : nom manquant`);
    if (noms.has(o.nom)) erreurs.push(`${ou} : nom en double « ${o.nom} »`);
    noms.add(o.nom);
    if (o.parent !== null && !noms.has(o.parent)) {
      erreurs.push(`${ou} (« ${o.nom} ») : parent « ${o.parent} » absent ou placé après l'enfant`);
    }
    if (!Number.isFinite(o.pivot.x) || !Number.isFinite(o.pivot.y)) erreurs.push(`${ou} : pivot non fini`);
    if (!(o.longueur > 0)) erreurs.push(`${ou} (« ${o.nom} ») : longueur nulle ou négative`);
    if (!Number.isFinite(o.angleRepos)) erreurs.push(`${ou} : angleRepos non fini`);
    if (o.limites && !(o.limites.min <= 0 && o.limites.max >= 0)) {
      erreurs.push(`${ou} (« ${o.nom} ») : les limites [${o.limites.min}, ${o.limites.max}] doivent contenir 0 (le repos)`);
    }
  });
  const racines = squelette.os.filter((o) => o.parent === null);
  if (racines.length !== 1) erreurs.push(`squelette : il faut exactement une racine (trouvé ${racines.length})`);
  else if (racines[0]!.nom !== squelette.racine) erreurs.push(`squelette.racine « ${squelette.racine} » ≠ os sans parent « ${racines[0]!.nom} »`);
  return erreurs;
}

/**
 * Construit un squelette depuis des descriptions d'os (dans n'importe quel ordre) : tri parents d'abord (ordre
 * stable), longueur et direction au repos. Lève une erreur en français si la description est incohérente.
 */
export function construireSquelette(descriptions: readonly DescriptionOs[]): Squelette {
  const parNom = new Map<string, DescriptionOs>();
  for (const d of descriptions) {
    if (parNom.has(d.nom)) throw new Error(`Squelette : os « ${d.nom} » décrit deux fois`);
    parNom.set(d.nom, d);
  }
  const tries: DescriptionOs[] = [];
  const places = new Set<string>();
  const enCours = new Set<string>();
  const placer = (d: DescriptionOs): void => {
    if (places.has(d.nom)) return;
    if (enCours.has(d.nom)) throw new Error(`Squelette : cycle de parenté autour de « ${d.nom} »`);
    enCours.add(d.nom);
    if (d.parent !== null) {
      const p = parNom.get(d.parent);
      if (!p) throw new Error(`Squelette : parent inconnu « ${d.parent} » pour « ${d.nom} »`);
      placer(p);
    }
    enCours.delete(d.nom);
    places.add(d.nom);
    tries.push(d);
  };
  for (const d of descriptions) placer(d);
  const os: Os[] = tries.map((d) => {
    const dx = d.bout.x - d.pivot.x;
    const dy = d.bout.y - d.pivot.y;
    const longueur = Math.hypot(dx, dy);
    const o: Os = { nom: d.nom, parent: d.parent, pivot: { x: d.pivot.x, y: d.pivot.y }, longueur, angleRepos: Math.atan2(dy, dx) };
    if (d.limites) o.limites = { min: d.limites.min, max: d.limites.max };
    return o;
  });
  const racines = os.filter((o) => o.parent === null);
  if (racines.length !== 1) throw new Error(`Squelette : il faut exactement une racine (trouvé ${racines.length})`);
  const squelette: Squelette = { os, racine: racines[0]!.nom };
  const erreurs = validerSquelette(squelette);
  if (erreurs.length) throw new Error(`Squelette invalide :\n  - ${erreurs.join('\n  - ')}`);
  return squelette;
}

/** Description inverse : os → description (pivot, bout). */
export function decrireSquelette(squelette: Squelette): DescriptionOs[] {
  return squelette.os.map((o) => {
    const d: DescriptionOs = { nom: o.nom, parent: o.parent, pivot: { ...o.pivot }, bout: boutOs(o) };
    if (o.limites) d.limites = { ...o.limites };
    return d;
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Squelette humanoïde standard
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Articulations nommées d'un humanoïde (px image), suffisantes pour bâtir les 18 os standard (sans `ventre` ni
 * `poitrine`, facultatifs). `claviculeG/D` (pivot des épaules) vaut par défaut un point entre la base du cou et
 * l'épaule.
 */
export interface ArticulationsHumanoide {
  /** Centre du bassin, entre les deux hanches (pivot de `bassin`, racine). */
  bassin: Vec2;
  /** Taille, bas du dos (pivot de `torse`, bout de `bassin`). */
  taille: Vec2;
  /** Base du cou (pivot de `cou`, bout de `torse`). */
  baseCou: Vec2;
  /** Haut du cou, sous la tête (pivot de `tete`). */
  baseTete: Vec2;
  /** Sommet du crâne (bout de `tete`). */
  sommetTete: Vec2;
  claviculeG?: Vec2;
  claviculeD?: Vec2;
  epauleG: Vec2;
  coudeG: Vec2;
  poignetG: Vec2;
  boutMainG: Vec2;
  epauleD: Vec2;
  coudeD: Vec2;
  poignetD: Vec2;
  boutMainD: Vec2;
  hancheG: Vec2;
  genouG: Vec2;
  chevilleG: Vec2;
  boutPiedG: Vec2;
  hancheD: Vec2;
  genouD: Vec2;
  chevilleD: Vec2;
  boutPiedD: Vec2;
}

/**
 * Limites par défaut (rad) pour un dessin DE FACE, côté gauche du personnage (à droite de l'image). Le côté droit
 * est le miroir (bornes opposées et échangées). Valeurs généreuses : ce sont des garde-fous, pas un jeu d'acteur.
 */
const LIMITES_GAUCHE: Partial<Record<NomOsStandard, { min: number; max: number }>> = {
  epauleG: { min: -0.45, max: 0.35 },
  brasG: { min: -3.1, max: 1.2 },
  avantBrasG: { min: -0.25, max: 2.7 },
  mainG: { min: -1.3, max: 1.3 },
  cuisseG: { min: -1.2, max: 0.9 },
  jambeG: { min: -0.35, max: 1.6 },
  piedG: { min: -0.7, max: 0.7 },
};
const LIMITES_CENTRE: Partial<Record<NomOsStandard, { min: number; max: number }>> = {
  bassin: { min: -0.6, max: 0.6 },
  torse: { min: -0.7, max: 0.7 },
  cou: { min: -0.6, max: 0.6 },
  tete: { min: -0.7, max: 0.7 },
};

/** Limites standard d'un os pour un dessin de face (miroir pour le côté D). */
export function limitesStandard(nom: string): { min: number; max: number } | undefined {
  const c = LIMITES_CENTRE[nom as NomOsStandard];
  if (c) return { ...c };
  const g = LIMITES_GAUCHE[nom as NomOsStandard];
  if (g) return { ...g };
  if (nom.endsWith('D')) {
    const miroir = LIMITES_GAUCHE[(nom.slice(0, -1) + 'G') as NomOsStandard];
    if (miroir) return { min: -miroir.max, max: -miroir.min };
  }
  return undefined;
}

/** Descriptions des 18 os standard depuis des articulations nommées (limites standard incluses). */
export function descriptionsHumanoide(a: ArticulationsHumanoide, avecLimites = true): DescriptionOs[] {
  const entre = (p: Vec2, q: Vec2, u: number): Vec2 => ({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u });
  const clavG = a.claviculeG ?? entre(a.baseCou, a.epauleG, 0.25);
  const clavD = a.claviculeD ?? entre(a.baseCou, a.epauleD, 0.25);
  const brut: Array<[string, string | null, Vec2, Vec2]> = [
    ['bassin', null, a.bassin, a.taille],
    ['torse', 'bassin', a.taille, a.baseCou],
    ['cou', 'torse', a.baseCou, a.baseTete],
    ['tete', 'cou', a.baseTete, a.sommetTete],
    ['epauleG', 'torse', clavG, a.epauleG],
    ['brasG', 'epauleG', a.epauleG, a.coudeG],
    ['avantBrasG', 'brasG', a.coudeG, a.poignetG],
    ['mainG', 'avantBrasG', a.poignetG, a.boutMainG],
    ['epauleD', 'torse', clavD, a.epauleD],
    ['brasD', 'epauleD', a.epauleD, a.coudeD],
    ['avantBrasD', 'brasD', a.coudeD, a.poignetD],
    ['mainD', 'avantBrasD', a.poignetD, a.boutMainD],
    ['cuisseG', 'bassin', a.hancheG, a.genouG],
    ['jambeG', 'cuisseG', a.genouG, a.chevilleG],
    ['piedG', 'jambeG', a.chevilleG, a.boutPiedG],
    ['cuisseD', 'bassin', a.hancheD, a.genouD],
    ['jambeD', 'cuisseD', a.genouD, a.chevilleD],
    ['piedD', 'jambeD', a.chevilleD, a.boutPiedD],
  ];
  return brut.map(([nom, parent, pivot, bout]) => {
    const d: DescriptionOs = { nom, parent, pivot: { ...pivot }, bout: { ...bout } };
    const l = avecLimites ? limitesStandard(nom) : undefined;
    if (l) d.limites = l;
    return d;
  });
}

/** Membre (groupe de dessin) d'un os : `tete`, `brasG`, `brasD`, `jambeG`, `jambeD` ou `corps`. */
export function membreDe(squelette: Squelette, i: number): string {
  const idx = indexerSquelette(squelette);
  let o = i;
  while (o >= 0) {
    const nom = squelette.os[o]!.nom;
    if (nom === 'tete') return 'tete';
    if (nom === 'brasG' || nom === 'brasD') return nom;
    if (nom === 'cuisseG') return 'jambeG';
    if (nom === 'cuisseD') return 'jambeD';
    o = idx.parents[o]!;
  }
  return 'corps';
}

/**
 * Ordre de dessin au repos des membres selon l'orientation du dessin.
 * De face : jambes < corps < tête < bras. De profil (regard vers la droite de l'image, donc côté DROIT du personnage
 * vers la caméra) : bras gauche (loin) derrière tout, jambe gauche, jambe droite, corps, tête, bras droit devant.
 */
export function ordreMembres(orientation: 1 | -1 | 0): Record<string, number> {
  if (orientation === 0) return { jambeD: 1, jambeG: 1, corps: 2, tete: 3, brasD: 4, brasG: 4 };
  const proche = orientation === 1 ? 'D' : 'G';
  const loin = orientation === 1 ? 'G' : 'D';
  return { [`bras${loin}`]: 0, [`jambe${loin}`]: 1, [`jambe${proche}`]: 2, corps: 3, tete: 4, [`bras${proche}`]: 5 };
}
