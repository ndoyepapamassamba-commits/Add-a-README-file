/**
 * Morphologie d'un rig, vue par l'animation : os présents, sens de rotation « vers l'extérieur » ou « vers une
 * direction », longueurs des membres, groupes de dessin par os. Les recettes d'actions s'écrivent en termes
 * anatomiques (lever le bras, pencher le buste vers la cible) ; la morphologie les traduit en rotations signées
 * pour le dessin réel (de face, de profil, bras pendants ou écartés).
 *
 * Contient aussi `rigReference()`, un squelette standard aux proportions de MODOU (dessin de face), utile aux
 * tests, aux démonstrations et comme gabarit pour `rig/`.
 */
import type { CharacterRig, Os, Vec2 } from '../timeline/types';

/** Os vu par l'animation. */
export interface InfoOs {
  nom: string;
  parent: string | null;
  pivot: Vec2;
  /** Direction absolue au repos (rad). */
  angle: number;
  longueur: number;
  /** Limites de la rotation locale ajoutée (rad), si le rig en déclare. */
  limites?: { min: number; max: number };
}

/** Morphologie d'un rig. */
export interface Morphologie {
  /** Hauteur du personnage dans l'image (px) : unité des translations. */
  H: number;
  ancrage: Vec2;
  /** Sens du dessin : 1 = regarde vers la droite de l'image, −1 = vers la gauche, 0 = de face. */
  orientation: -1 | 0 | 1;
  os: ReadonlyMap<string, InfoOs>;
  /** Côté image (−1 = gauche, +1 = droite) de chaque côté du personnage (« extérieur » de ses membres). */
  cote: { G: 1 | -1; D: 1 | -1 };
  /** Groupes de dessin dont l'os principal est `nom`. */
  groupesParOs: ReadonlyMap<string, string[]>;
  /** Ordre de dessin au repos de chaque groupe. */
  ordreGroupes: ReadonlyMap<string, number>;
  /** Plus grand ordre de dessin du rig. */
  ordreMax: number;
}

/** Vrai si l'os existe dans le rig. */
export function aOs(m: Morphologie, nom: string): boolean {
  return m.os.has(nom);
}

/** Morphologie d'un rig chargé. */
export function morphologie(rig: CharacterRig): Morphologie {
  const os = new Map<string, InfoOs>();
  for (const o of rig.squelette.os) {
    const info: InfoOs = { nom: o.nom, parent: o.parent, pivot: { ...o.pivot }, angle: o.angleRepos, longueur: o.longueur };
    if (o.limites) info.limites = { ...o.limites };
    os.set(o.nom, info);
  }
  const H = rig.hauteurPx > 0 ? rig.hauteurPx : 1000;
  const coteDe = (c: 'G' | 'D'): 1 | -1 | 0 => {
    const g = os.get('bras' + 'G') ?? os.get('epauleG');
    const d = os.get('bras' + 'D') ?? os.get('epauleD');
    if (g && d && Math.abs(g.pivot.x - d.pivot.x) > 0.02 * H) {
      const droite = g.pivot.x > d.pivot.x ? 'G' : 'D';
      return c === droite ? 1 : -1;
    }
    const seul = os.get('bras' + c) ?? os.get('cuisse' + c);
    if (seul && Math.abs(seul.pivot.x - rig.ancrageSol.x) > 0.02 * H) return seul.pivot.x > rig.ancrageSol.x ? 1 : -1;
    return 0;
  };
  const orientation = rig.orientationDessin;
  let cG = coteDe('G');
  let cD = coteDe('D');
  if (cG === 0 || cD === 0) {
    // Profil (épaules confondues) : « l'extérieur » d'un membre est l'avant du personnage.
    const avant: 1 | -1 = orientation === -1 ? -1 : 1;
    cG = cG || (orientation === 0 ? 1 : avant);
    cD = cD || (orientation === 0 ? -1 : avant);
  }
  const groupesParOs = new Map<string, string[]>();
  const ordreGroupes = new Map<string, number>();
  let ordreMax = 0;
  for (const g of rig.groupes ?? []) {
    ordreGroupes.set(g.nom, g.ordre);
    ordreMax = Math.max(ordreMax, g.ordre);
    if (g.os) {
      const l = groupesParOs.get(g.os) ?? [];
      l.push(g.nom);
      groupesParOs.set(g.os, l);
    }
  }
  return {
    H,
    ancrage: { ...rig.ancrageSol },
    orientation,
    os,
    cote: { G: cG as 1 | -1, D: cD as 1 | -1 },
    groupesParOs,
    ordreGroupes,
    ordreMax,
  };
}

/**
 * Signe de la rotation qui amène l'extrémité de l'os vers la direction image `(dx, dy)` (y vers le bas).
 * Une rotation `+θ` déplace l'extrémité selon `(−sin a, cos a)` (a = angle de l'os au repos).
 */
export function signeVers(m: Morphologie, nom: string, dx: number, dy = 0, repli: 1 | -1 = 1): 1 | -1 {
  const o = m.os.get(nom);
  if (!o) return repli;
  const s = -Math.sin(o.angle) * dx + Math.cos(o.angle) * dy;
  if (Math.abs(s) < 1e-6) return repli;
  return s > 0 ? 1 : -1;
}

/** Signe de la rotation qui écarte un membre du côté `cote` vers l'extérieur et vers le haut (abduction). */
export function signeAbduction(m: Morphologie, nom: string, cote: 'G' | 'D'): 1 | -1 {
  const ext = m.cote[cote];
  return signeVers(m, nom, ext, -0.3, ext === 1 ? -1 : 1);
}

/** Limites articulaires d'un os du rig (rad), ou `null`. */
export function limitesOs(m: Morphologie, nom: string): { min: number; max: number } | null {
  return m.os.get(nom)?.limites ?? null;
}

/** Angle absolu au repos d'un os (rad), ou `repli`. */
export function angleRepos(m: Morphologie, nom: string, repli: number): number {
  return m.os.get(nom)?.angle ?? repli;
}

/** Longueur d'un os (px), ou `repli·H`. */
export function longueurOs(m: Morphologie, nom: string, repli: number): number {
  const o = m.os.get(nom);
  return o && o.longueur > 0 ? o.longueur : repli * m.H;
}

/** Pivot d'un os (px image), ou `repli` (en fractions de H depuis l'ancrage). */
export function pivotOs(m: Morphologie, nom: string, repli: Vec2): Vec2 {
  const o = m.os.get(nom);
  if (o) return o.pivot;
  return { x: m.ancrage.x + repli.x * m.H, y: m.ancrage.y + repli.y * m.H };
}

// ── Rig de référence ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Proportions de référence (dessin de face, d'après MODOU), en fractions de la hauteur : x depuis l'axe du corps
 * (négatif = gauche de l'image = côté DROIT du personnage), y depuis le sommet de la tête.
 * `[nom, parent, pivot x, pivot y, extrémité x, extrémité y]`.
 */
const PROPORTIONS: ReadonlyArray<readonly [string, string | null, number, number, number, number]> = [
  ['bassin', null, 0, 0.545, 0, 0.6],
  ['torse', 'bassin', 0, 0.52, 0, 0.27],
  ['ventre', 'torse', 0, 0.47, 0, 0.53],
  ['cou', 'torse', 0, 0.275, 0, 0.225],
  ['tete', 'cou', 0, 0.225, 0, 0.02],
  ['epauleD', 'torse', -0.015, 0.3, -0.054, 0.305],
  ['brasD', 'epauleD', -0.054, 0.305, -0.084, 0.443],
  ['avantBrasD', 'brasD', -0.084, 0.443, -0.106, 0.575],
  ['mainD', 'avantBrasD', -0.106, 0.575, -0.1, 0.65],
  ['epauleG', 'torse', 0.015, 0.3, 0.054, 0.305],
  ['brasG', 'epauleG', 0.054, 0.305, 0.084, 0.443],
  ['avantBrasG', 'brasG', 0.084, 0.443, 0.106, 0.575],
  ['mainG', 'avantBrasG', 0.106, 0.575, 0.1, 0.65],
  ['cuisseD', 'bassin', -0.038, 0.547, -0.051, 0.751],
  ['jambeD', 'cuisseD', -0.051, 0.751, -0.061, 0.935],
  ['piedD', 'jambeD', -0.061, 0.935, -0.085, 0.99],
  ['cuisseG', 'bassin', 0.038, 0.547, 0.051, 0.751],
  ['jambeG', 'cuisseG', 0.051, 0.751, 0.061, 0.935],
  ['piedG', 'jambeG', 0.061, 0.935, 0.085, 0.99],
];

/**
 * Limites articulaires de référence (degrés, rotation locale ajoutée au repos), pour le côté G (à droite de l'image
 * sur un dessin de face) ; le côté D est en miroir. Mêmes conventions que les rigs construits par `rig/` : le coude
 * et le genou ne plient que d'un côté (coude vers le corps, genou vers l'extérieur).
 */
const LIMITES_G: Readonly<Record<string, readonly [number, number]>> = {
  bassin: [-34, 34],
  torse: [-40, 40],
  ventre: [-20, 20],
  cou: [-34, 34],
  tete: [-40, 40],
  epaule: [-26, 20],
  bras: [-178, 69],
  avantBras: [-14, 155],
  main: [-74, 74],
  cuisse: [-69, 52],
  jambe: [-20, 92],
  pied: [-40, 40],
};

/** Limites de référence d'un os (rad), ou `undefined`. */
export function limitesReference(nom: string): { min: number; max: number } | undefined {
  const m = /^(epaule|bras|avantBras|main|cuisse|jambe|pied)([GD])$/.exec(nom);
  const base = m ? m[1]! : nom;
  const l = LIMITES_G[base];
  if (!l) return undefined;
  const k = Math.PI / 180;
  if (m && m[2] === 'D') return { min: -l[1] * k, max: -l[0] * k };
  return { min: l[0] * k, max: l[1] * k };
}

/**
 * Rig de référence (squelette standard complet avec limites articulaires, maillage vide, sans visage), de hauteur
 * `hauteurPx`, dessiné de face (`orientationDessin` réglable). Ancrage au sol au milieu des pieds.
 */
export function rigReference(hauteurPx = 1000, orientationDessin: -1 | 0 | 1 = 0, id = 'reference'): CharacterRig {
  const cx = hauteurPx * 0.3;
  const haut = hauteurPx * 0.05;
  const px = (x: number, y: number): Vec2 => ({ x: cx + x * hauteurPx, y: haut + y * hauteurPx });
  const os: Os[] = PROPORTIONS.map(([nom, parent, x0, y0, x1, y1]) => {
    const a = px(x0, y0);
    const b = px(x1, y1);
    const os: Os = {
      nom,
      parent,
      pivot: a,
      longueur: Math.hypot(b.x - a.x, b.y - a.y),
      angleRepos: Math.atan2(b.y - a.y, b.x - a.x),
    };
    const l = limitesReference(nom);
    if (l) os.limites = l;
    return os;
  });
  return {
    format: 'moteur-fluide/rig@1',
    id,
    nom: 'RÉFÉRENCE',
    image: { chemin: '', largeur: Math.round(hauteurPx * 0.6), hauteur: Math.round(hauteurPx * 1.1) },
    hauteurPx,
    ancrageSol: px(0, 1),
    pieds: { gauche: px(0.07, 1), droit: px(-0.07, 1) },
    orientationDessin,
    squelette: { os, racine: 'bassin' },
    maillage: { positions: [], uvs: [], indices: [], influences: [], poids: [] },
    groupes: [
      { nom: 'corps', premierTriangle: 0, nombreTriangles: 0, ordre: 2, os: 'torse' },
      { nom: 'tete', premierTriangle: 0, nombreTriangles: 0, ordre: 6, os: 'tete' },
      { nom: 'brasD', premierTriangle: 0, nombreTriangles: 0, ordre: 4, os: 'brasD' },
      { nom: 'avantBrasD', premierTriangle: 0, nombreTriangles: 0, ordre: 5, os: 'avantBrasD' },
      { nom: 'mainD', premierTriangle: 0, nombreTriangles: 0, ordre: 5, os: 'mainD' },
      { nom: 'brasG', premierTriangle: 0, nombreTriangles: 0, ordre: 4, os: 'brasG' },
      { nom: 'avantBrasG', premierTriangle: 0, nombreTriangles: 0, ordre: 5, os: 'avantBrasG' },
      { nom: 'mainG', premierTriangle: 0, nombreTriangles: 0, ordre: 5, os: 'mainG' },
    ],
    visage: null,
  };
}
