/**
 * CONTRAT PARTAGÉ DU MOTEUR FLUIDE
 * ================================
 *
 * Ce fichier est la référence commune de tous les modules (`noyau/`, `rig/`, `anim/`, `visage/`, `scene/`,
 * `timeline/`, `rendu/`, `export/`, `qa/`). Il ne contient que des types et quelques constantes.
 * Toute modification se discute : quatre modules sont écrits en parallèle contre ce contrat.
 *
 * Conventions (valables partout) :
 * - **Temps** en secondes (nombre réel). Une image `n` tombe à `t = n / fps`, sans accumulation.
 * - **Angles** en radians. Le repère écran a l'axe y vers le bas : un angle positif tourne dans le sens horaire à
 *   l'écran (même convention que PixiJS).
 * - **Repère image** d'un personnage : pixels de son image source, origine en haut à gauche, y vers le bas.
 * - **Repère monde** d'une scène : celui du décor, mis à l'échelle de sa hauteur. Origine en haut à gauche du décor,
 *   `y = 0` en haut, `y = 1` en bas du décor, `x ∈ [0, aspect]` avec `aspect = largeur / hauteur` du décor.
 *   Une unité monde = la hauteur du décor (repère uniforme : les rotations y restent exactes).
 * - **Repère décor normalisé** `{u, v}` (pour l'écriture des projets) : fractions de la largeur et de la hauteur du
 *   décor, comme `fit.cx` et `fit.floor` du manifeste. Conversion : `x = u·aspect`, `y = v`.
 * - **Gauche / droite** (`G` / `D`) : côté **du personnage** (son bras gauche apparaît à droite de l'image quand il
 *   fait face à la caméra).
 * - **Profondeur** : comme les cartes du kit, `0` = loin, `1` = proche.
 * - Tous les états (`Etat*`) sont **sérialisables en JSON** : objets simples, tableaux de nombres, pas de `Map`, pas
 *   de tableaux typés, pas de fonctions. Ils traversent `page.evaluate` de Playwright tels quels.
 * - Les fonctions qui produisent un état sont **pures** : même entrée → même sortie, sans état caché, quel que soit
 *   l'ordre des appels. L'aléa vient uniquement de `noyau/aleatoire` (hachages à graine).
 */

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 1. Géométrie de base
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Vecteur ou point 2D. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Matrice affine 2D, même disposition que PixiJS :
 * `x' = a·x + c·y + tx` ; `y' = b·x + d·y + ty`.
 */
export interface Mat2D {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

/** Transformation décomposée : échelle, puis rotation, puis translation (`T·R·S`). */
export interface Transform2D {
  /** Translation. */
  position: Vec2;
  /** Rotation en radians (sens horaire à l'écran). */
  rotation: number;
  /** Échelle par axe (1 = identité ; négatif = miroir). */
  echelle: Vec2;
}

/** Couleur RVB en [0, 1] (espace sRGB). */
export type Couleur = readonly [r: number, g: number, b: number];

/** Point exprimé en fractions du décor (voir l'en-tête). */
export interface PointDecor {
  /** Fraction de la largeur du décor (0 = bord gauche, 1 = bord droit). */
  u: number;
  /** Fraction de la hauteur du décor (0 = haut, 1 = bas ; peut dépasser 1 : pieds sous le cadre du décor). */
  v: number;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 2. Dynamique : ressorts, courbes, pistes
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Paramètres d'un ressort du second ordre `y + k1·y' + k2·y'' = x + k3·x'` (t3ssel8r), résolu **analytiquement**
 * dans `noyau/ressorts`.
 * - `f` : fréquence propre en Hz (vitesse de réaction ; t90 ≈ 0,62/f pour ζ = 1).
 * - `zeta` : amortissement ζ (< 1 : dépassement et rebond ; = 1 : critique ; > 1 : lent, sans dépassement).
 * - `r` : réponse initiale. `r < 0` : **anticipation** (part d'abord à l'envers) ; `r = 0` : départ doux ;
 *   `r > 1` : attaque sèche qui dépasse. Vitesse initiale après une marche Δ : `Δ·r·ζ·2πf`.
 */
export interface ParametresRessort {
  f: number;
  zeta: number;
  r?: number;
}

/** Noms des courbes d'accélération de `noyau/courbes` (fonctions de [0, 1] dans ℝ, f(0) = 0, f(1) = 1). */
export type NomEasing =
  | 'lineaire'
  | 'lisse' // smoothstep 3u²−2u³
  | 'tresLisse' // smootherstep 6u⁵−15u⁴+10u³
  | 'entreeQuad'
  | 'sortieQuad'
  | 'entreeSortieQuad'
  | 'entreeCubique'
  | 'sortieCubique'
  | 'entreeSortieCubique'
  | 'entreeQuart'
  | 'sortieQuart'
  | 'entreeSortieQuart'
  | 'entreeSinus'
  | 'sortieSinus'
  | 'entreeSortieSinus'
  | 'entreeExpo'
  | 'sortieExpo'
  | 'entreeSortieExpo'
  | 'entreeDos' // anticipation : recule avant de partir
  | 'sortieDos' // dépassement contrôlé
  | 'entreeSortieDos'
  | 'sortieElastique'
  | 'sortieRebond'
  | 'cssEase'
  | 'cssEntree'
  | 'cssSortie'
  | 'cssEntreeSortie';

/**
 * Mode d'interpolation d'un segment de piste à clés (entre la clé `k` et la clé `k+1`, porté par la clé `k`).
 * - `constant` : tenue de la valeur jusqu'à la clé suivante (marche).
 * - `lineaire` : droite.
 * - `lisse` : Hermite cubique avec tangentes de Catmull-Rom (C¹, passe par les clés, gère les écarts de temps
 *   irréguliers).
 * - `hermite` : Hermite cubique avec tangentes explicites (`vitesseSortie` de la clé k, `vitesseEntree` de la clé k+1).
 * - `bezier` : courbe de temps Bézier cubique `bezier: [x1, y1, x2, y2]` (comme `cubic-bezier` CSS).
 * - `easing` : courbe nommée `easing`.
 */
export type ModeInterpolation = 'constant' | 'lineaire' | 'lisse' | 'hermite' | 'bezier' | 'easing';

/** Une clé de piste (valeur générique `V` : nombre, `Vec2` ou angle). */
export interface Cle<V> {
  /** Instant de la clé (s). */
  t: number;
  /** Valeur à cet instant. */
  v: V;
  /** Interpolation du segment qui part de cette clé (défaut : celui de la piste). */
  interpolation?: ModeInterpolation;
  /** Pour `interpolation: 'easing'`. */
  easing?: NomEasing;
  /** Pour `interpolation: 'bezier'` : points de contrôle de la courbe de temps (x dans [0, 1]). */
  bezier?: readonly [number, number, number, number];
  /** Pour `interpolation: 'hermite'` : vitesse (unités/s) à l'arrivée sur cette clé. */
  vitesseEntree?: V;
  /** Pour `interpolation: 'hermite'` : vitesse (unités/s) au départ de cette clé. */
  vitesseSortie?: V;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 3. Squelette, pose et rig de personnage
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Noms d'os standard. Les recettes d'actions (`anim/`) visent ces noms ; un rig peut ajouter des os libres
 * (foulard1, ourlet2, boucle d'oreille…) mais doit nommer ainsi ceux qu'il possède.
 * Hiérarchie de référence : bassin → torse → cou → tete ; torse → epaule* → bras* → avantBras* → main* ;
 * bassin → cuisse* → jambe* → pied*. `ventre` et `poitrine` sont facultatifs (enfants de torse).
 */
export const NOMS_OS_STANDARD = [
  'bassin',
  'torse',
  'ventre',
  'poitrine',
  'cou',
  'tete',
  'epauleG',
  'brasG',
  'avantBrasG',
  'mainG',
  'epauleD',
  'brasD',
  'avantBrasD',
  'mainD',
  'cuisseG',
  'jambeG',
  'piedG',
  'cuisseD',
  'jambeD',
  'piedD',
] as const;

/** Nom d'os standard. */
export type NomOsStandard = (typeof NOMS_OS_STANDARD)[number];

/** Un os du squelette, décrit **au repos** dans le repère image. */
export interface Os {
  /** Identifiant unique dans le squelette (de préférence un `NomOsStandard`). */
  nom: string;
  /** Nom de l'os parent, `null` pour la racine. */
  parent: string | null;
  /** Articulation (point de rotation) au repos, en px image (coordonnées absolues). */
  pivot: Vec2;
  /** Longueur de l'os en px (du pivot vers l'extrémité), utile à l'IK et à l'étirement. */
  longueur: number;
  /** Direction absolue de l'os au repos (rad), du pivot vers l'extrémité. */
  angleRepos: number;
  /**
   * Limites de la rotation **locale ajoutée à la pose de repos** (rad) : la rotation de `Pose.os[nom].rotation`
   * est contrainte dans `[min, max]` (contrainte douce appliquée par `rig/`).
   */
  limites?: { min: number; max: number };
}

/** Squelette : liste d'os **triée parents d'abord** (ordre topologique), plus le nom de la racine. */
export interface Squelette {
  os: Os[];
  racine: string;
}

/**
 * Transformation **locale** d'un os, exprimée comme un **écart à la pose de repos** (l'identité = repos).
 * Appliquée autour du pivot de l'os, dans le repère de son parent : échelle, puis rotation, puis translation.
 */
export interface TransformOs {
  /** Rotation ajoutée (rad). */
  rotation: number;
  /** Translation ajoutée (px image, repère du parent). */
  translation: Vec2;
  /** Échelle (1, 1 = repos). Sert au squash & stretch par os. */
  echelle: Vec2;
}

/**
 * Transformation globale du personnage, appliquée après le skinning, **autour de l'ancrage au sol**
 * (`CharacterRig.ancrageSol`) : `p' = ancrage + decalage + R(rotation)·S(echelle, flip)·(p − ancrage)`.
 */
export interface PoseRacine {
  /** Décalage en px image (saut : y < 0 ; balancement du bassin…). */
  decalage: Vec2;
  /** Inclinaison du personnage entier autour des pieds (rad). */
  rotation: number;
  /** Squash & stretch global autour des pieds (conserver l'aire : x·y ≈ 1). */
  echelle: Vec2;
  /** Miroir horizontal (le personnage regarde de l'autre côté). */
  flip: boolean;
}

/** Pose complète d'un personnage à un instant (sortie de `anim/`, entrée de `rig/`). */
export interface Pose {
  /** Écarts au repos par os ; un os absent = repos (identité). */
  os: Record<string, TransformOs>;
  /** Transformation globale autour des pieds. */
  racine: PoseRacine;
  /**
   * Ordre de dessin forcé par groupe (nom de `GroupeDessin` → ordre), par exemple « bras D devant le ventre »
   * pendant un geste. Absent = ordre de repos du rig.
   */
  ordreGroupes?: Record<string, number>;
  /** Paramètres continus du rig (correctifs, formes clés), nom → valeur. Facultatif. */
  parametres?: Record<string, number>;
}

/**
 * Maillage d'un personnage (calculé à l'import par `outils/` ou `rig/`, immuable ensuite).
 * Tableaux plats de nombres (sérialisables) ; `rendu/` les convertit en tableaux typés.
 * `V` = nombre de sommets, `T` = nombre de triangles.
 */
export interface Maillage {
  /** 2V : positions au repos (px image). */
  positions: number[];
  /** 2V : coordonnées de texture dans [0, 1] (image unique : position / taille ; planches : atlas). */
  uvs: number[];
  /** 3T : indices de sommets, **triés par groupe de dessin** (voir `GroupeDessin`). */
  indices: number[];
  /** 4V : indices d'os (position dans `Squelette.os`), `-1` = pas d'influence. */
  influences: number[];
  /** 4V : poids correspondants, `Σ = 1` par sommet, chacun dans [0, 1]. */
  poids: number[];
  /** Indices des sommets du contour extérieur, dans l'ordre (contrôles qualité, ombres portées). */
  contour?: number[];
  /** 2V : centres de rotation optimisés pour le skinning CoR (`NaN` = sommet rigide, LBS exact). */
  centresRotation?: number[];
  /** V : étiquette de partie du sommet (index d'os d'origine), pour les correctifs et la QA. */
  partie?: number[];
}

/** Groupe de triangles dessiné d'un bloc, avec son ordre de dessin (sous-maillage : bras, jambes, tête…). */
export interface GroupeDessin {
  /** Nom unique (« corps », « brasG », « brasD », « tete »…). */
  nom: string;
  /** Premier triangle du groupe (index de triangle, pas de sommet : indices `3·premier … 3·(premier+nombre)−1`). */
  premierTriangle: number;
  /** Nombre de triangles du groupe. */
  nombreTriangles: number;
  /** Ordre de dessin au repos (plus grand = devant). Égalités départagées par l'ordre du tableau. */
  ordre: number;
  /** Os principal du groupe (informatif). */
  os?: string;
}

/** Ancrage d'un œil (px image, au repos). */
export interface AncreOeil {
  /** Centre de l'œil. */
  centre: Vec2;
  /** Demi-axes de l'ellipse de l'œil (rx, ry). */
  rayon: Vec2;
  /** Ligne de la paupière supérieure, du coin intérieur au coin extérieur. */
  paupiereHaute?: Vec2[];
  /** Ligne de la paupière inférieure, du coin intérieur au coin extérieur. */
  paupiereBasse?: Vec2[];
  /** Iris (pour le regard). */
  iris?: { centre: Vec2; rayon: number };
}

/** Ancrage de la bouche (px image, au repos). */
export interface AncreBouche {
  /** Centre de la bouche fermée. */
  centre: Vec2;
  /** Largeur coin à coin (px). */
  largeur: number;
  /** Hauteur des lèvres au repos (px). */
  hauteur: number;
  coinG: Vec2;
  coinD: Vec2;
  /** Ligne de la lèvre supérieure (contact), de coin à coin. */
  levreHaute: Vec2[];
  /** Ligne de la lèvre inférieure (contact), de coin à coin. */
  levreBasse: Vec2[];
  /** Pointe du menton (suit l'ouverture de la mâchoire). */
  menton?: Vec2;
  /** Couleur de l'intérieur de la bouche, prélevée sur la peinture. */
  interieur?: Couleur;
  /** Bouches dessinées par visème (planches de l'utilisateur) : chemin d'image par visème. Facultatif. */
  formesDessinees?: Partial<Record<Viseme, string>>;
}

/** Ancrage d'un sourcil : polyligne de l'intérieur vers l'extérieur (px image). */
export interface AncreSourcil {
  points: Vec2[];
}

/** Ancrages du visage pour `visage/` (px image, au repos). */
export interface AncresVisage {
  /** Os qui porte le visage (en général `tete`). */
  osTete: string;
  oeilG: AncreOeil;
  oeilD: AncreOeil;
  bouche: AncreBouche;
  sourcilG: AncreSourcil;
  sourcilD: AncreSourcil;
  /** Couleur de peau moyenne du visage (paupières, comblements). */
  couleurPeau?: Couleur;
}

/** Chaîne d'IK à deux os (bras → avant-bras, cuisse → jambe). */
export interface DefinitionIK {
  nom: string;
  /** Os supérieur et os inférieur. */
  os: readonly [string, string];
  /** Os porté au bout de la chaîne (main, pied), facultatif. */
  effecteur?: string;
  /** Sens de pliage (+1 / −1). */
  plier: 1 | -1;
  /** Douceur près de l'extension (0 à 0,1 ; 0,05 recommandé). */
  douceur?: number;
}

/** Chaîne secondaire (foulard, ourlet de boubou, boucles d'oreilles, ventre) pilotée par ressorts ou physique. */
export interface ChaineSecondaire {
  nom: string;
  /** Os de la chaîne, de l'attache vers l'extrémité. */
  os: string[];
  ressort: ParametresRessort;
  /** Gravité relative (0 = aucune). */
  gravite?: number;
}

/** Rig d'un personnage : image, maillage, squelette, poids, groupes de dessin, ancrages. Fichier `rig.json`. */
export interface CharacterRig {
  format: 'moteur-fluide/rig@1';
  /** Identifiant (référencé par `DeclarationPersonnage.rig`). */
  id: string;
  /** Nom lisible (« MODOU »…). */
  nom: string;
  /** Image source du personnage (détourée, alpha). Chemin lu sur place, jamais copié dans le dépôt. */
  image: { chemin: string; largeur: number; hauteur: number };
  /** Hauteur du personnage dans l'image (px), du sommet de la tête à la semelle. */
  hauteurPx: number;
  /** Point au sol entre les pieds (px image) : origine de `PoseRacine` et point de placement dans le monde. */
  ancrageSol: Vec2;
  /** Semelles gauche et droite au repos (px image) : verrouillage des pieds et QA de glissement. */
  pieds?: { gauche: Vec2; droit: Vec2 };
  /** Côté vers lequel regarde le dessin : 1 = vers la droite de l'image, −1 = vers la gauche, 0 = de face. */
  orientationDessin: 1 | -1 | 0;
  squelette: Squelette;
  maillage: Maillage;
  /** Groupes de dessin, couvrant tous les triangles. */
  groupes: GroupeDessin[];
  /** Ancrages du visage (`null` si le personnage n'a pas de visage animable). */
  visage: AncresVisage | null;
  ik?: DefinitionIK[];
  secondaire?: ChaineSecondaire[];
  /** Origine de l'image et licence (registre des ressources). */
  provenance?: { source: string; licence: string; empreinte?: string };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 4. Visage
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Visèmes français de la spécification, plus le repos. */
export const VISEMES = ['repos', 'MBP', 'A', 'E', 'I', 'O', 'U', 'FV', 'SZ', 'CHJ', 'LR', 'TDN', 'KG'] as const;

/** Visème : forme de bouche dominante. */
export type Viseme = (typeof VISEMES)[number];

/** État d'un sourcil. */
export interface EtatSourcil {
  /** Hauteur : −1 (abaissé) … 0 (repos) … 1 (levé au maximum). */
  hauteur: number;
  /** Froncement (rapprochement et abaissement de l'intérieur) : 0 … 1. */
  froncement: number;
  /** Inclinaison de l'intérieur : −1 (triste, intérieur levé) … 1 (colère, intérieur baissé). */
  inclinaison: number;
}

/** État du visage à un instant (sortie de `visage/`). Tous les champs sont continus, sauf `viseme`. */
export interface EtatVisage {
  /** Visème dominant (bouches dessinées, débogage, QA des fermetures). */
  viseme: Viseme;
  /** Ouverture de la mâchoire : 0 (fermée) … 1 (ouverture maximale). */
  ouvertureBouche: number;
  /** Étirement des lèvres : −1 (resserrées) … 0 (repos) … 1 (étirées). */
  largeur: number;
  /** Arrondi / protrusion des lèvres : 0 … 1. */
  arrondi: number;
  /** Visibilité des dents (F/V : dents sur la lèvre) : 0 … 1. */
  dents: number;
  /** Visibilité de la langue (L long) : 0 … 1. */
  langue: number;
  /** Coins de la bouche : −1 (moue) … 0 … 1 (sourire). */
  sourire: number;
  /** Paupière gauche : 0 (ouverte) … 1 (fermée). */
  paupiereG: number;
  /** Paupière droite : 0 (ouverte) … 1 (fermée). */
  paupiereD: number;
  /** Écarquillement (surprise) : 0 … 1. */
  ecarquillement: number;
  /** Direction du regard : décalage des iris en fraction du rayon de l'œil, dans [−1, 1]². */
  regard: Vec2;
  sourcilG: EtatSourcil;
  sourcilD: EtatSourcil;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 5. États d'une image (sortie de `evaluer`)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Ombre d'un personnage au sol (repère monde). */
export interface EtatOmbre {
  /** Opacité de l'ombre de contact (ellipse sous les pieds), 0 … 1. */
  opacite: number;
  /** Demi-largeur de l'ellipse (unités monde). */
  largeur: number;
  /** Rapport hauteur / largeur de l'ellipse (aplatissement par la perspective). */
  aplatissement: number;
  /** Cisaillement de l'ombre portée (direction de la lumière, monde par unité de hauteur) ; (0, 0) = pas d'ombre portée. */
  cisaillement: Vec2;
  /** Flou de l'ombre (px de sortie). */
  flou: number;
}

/** Ajustement de couleur d'un personnage pour l'accorder au décor : `c' = c·gain + decalage`, par canal. */
export interface Etalonnage {
  gain: Couleur;
  decalage: Couleur;
}

/** État d'un personnage à un instant. */
export interface EtatPersonnage {
  /** Identifiant (celui de `DeclarationPersonnage.id`). */
  id: string;
  /** Rig utilisé (`CharacterRig.id`). */
  rig: string;
  visible: boolean;
  /** Opacité globale (entrées en fondu), 0 … 1. */
  opacite: number;
  pose: Pose;
  visage: EtatVisage;
  /** Position monde de l'ancrage au sol (les pieds). */
  position: Vec2;
  /** Unités monde par px image (taille à l'écran ; dépend de la profondeur au sol). */
  echelle: number;
  /** Profondeur du sol sous les pieds (0 loin … 1 proche), pour l'occlusion par le décor. */
  profondeur: number;
  /** Ordre de dessin entre personnages (plus grand = devant). */
  ordre: number;
  ombre: EtatOmbre;
  etalonnage: Etalonnage;
  /** Flou de profondeur de champ (px de sortie), 0 = net. */
  flou: number;
}

/** État de la caméra (repère monde). */
export interface EtatCamera {
  /** Point du monde au centre de l'image (avant tremblement). */
  centre: Vec2;
  /** 1 = toute la hauteur du décor tient dans la hauteur de l'image ; 2 = la moitié (deux fois plus près). */
  zoom: number;
  /** Roulis (rad). */
  rotation: number;
  /** Tremblement ajouté (impacts, rires), séparé pour la QA. */
  tremble: { decalage: Vec2; rotation: number };
  /** Flou de bougé directionnel : déplacement apparent pendant l'obturation, en px de sortie (filé). */
  flouBouge: Vec2;
  /** Profondeur nette (0 … 1) pour la profondeur de champ ; `null` = tout net. */
  profondeurNette: number | null;
}

/** État du décor 2,5D. */
export interface EtatDecor {
  /** Identifiant du décor dans le kit. */
  id: string;
  /**
   * Parallaxe par la profondeur (« 3D Ken Burns ») : déplacement d'un point de profondeur `d` :
   * `p' = c + (p − c)·(1 + (d − dRef)·poussee) + (d − dRef)·decalage`.
   */
  parallaxe: {
    /** Translation (unités monde) appliquée à la profondeur 1 par rapport à `profondeurReference`. */
    decalage: Vec2;
    /** Poussée (dolly) : agrandissement relatif par unité de profondeur. */
    poussee: number;
    /** Profondeur qui ne bouge pas (en général celle du sujet). */
    profondeurReference: number;
  };
  /** Figurants vivants (respiration, balancement) ; `temps` permet de les figer pendant un gel. */
  figurants: { actifs: boolean; temps: number; amplitude: number };
  /** Ciel qui dérive : `decalage` = fraction de largeur parcourue (boucle), `temps` = phase. */
  ciel: { actif: boolean; decalage: number; temps: number };
  /** Lumières du décor (scintillement) : amplitude globale, 0 = éteint. */
  lumieres: { amplitude: number; temps: number };
}

/** Sous-titre affiché à un instant. */
export interface SousTitre {
  texte: string;
  personnage: string;
  /** Début et fin absolus (s). */
  debut: number;
  fin: number;
  /** Index du mot en cours (karaoké), facultatif. */
  motActif?: number;
}

/** Son en cours de lecture à un instant (informatif ; le mixage se fait depuis le projet). */
export interface EvenementSon {
  id: string;
  fichier: string;
  /** Début absolu (s). */
  debut: number;
  /** Position de lecture dans le fichier (s). */
  position: number;
  /** Gain linéaire. */
  volume: number;
  type: TypeSon;
}

/** Effets plein cadre. */
export interface EffetsImage {
  /** 0 … 1 (gel comique : désaturation partielle). */
  desaturation: number;
  /** 0 … 1. */
  vignette: number;
  /** Fondu au noir : 0 (image) … 1 (noir). */
  fondu: number;
  /** Flash blanc : 0 … 1. */
  flash: number;
}

/** État complet d'une image : tout ce qu'il faut pour la dessiner. Sortie de `evaluer(projet, t)`. */
export interface EtatImage {
  /** Instant évalué (s). */
  t: number;
  /** Temps du jeu des acteurs : égal à `t`, sauf pendant un gel (figé) ou un ralenti. */
  tJeu: number;
  /** Plan actif (`null` si le projet n'a aucun plan). */
  plan: { id: string; index: number; debut: number; fin: number } | null;
  camera: EtatCamera;
  decor: EtatDecor | null;
  /** Personnages visibles, **triés par ordre de dessin** (du fond vers l'avant). */
  personnages: EtatPersonnage[];
  sousTitres: SousTitre[];
  evenementsSon: EvenementSon[];
  effets: EffetsImage;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 6. Projet (fichier `*.projet.json`)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Identifiant de format des projets. */
export const FORMAT_PROJET = 'moteur-fluide/projet@1' as const;

/** Réglages de sortie. */
export interface ReglagesSortie {
  /** Largeur en px (défaut 1080). */
  largeur: number;
  /** Hauteur en px (défaut 1920). */
  hauteur: number;
  /** Nombre de sous-instants moyennés par image (flou de bougé exact) ; 1 = aucun. */
  sousImages: number;
  /** Ouverture de l'obturateur en fraction de la durée d'une image (0,5 = 180°). */
  obturateur: number;
  /** Graine globale de l'aléa. */
  graine: number;
  /** Couleur de fond (hors décor). */
  fond?: Couleur;
}

/** Groupes de canaux qui reçoivent une personnalité de ressort. */
export type GroupeRessort = 'corps' | 'tete' | 'bras' | 'jambes' | 'bouche' | 'regard' | 'sourcils' | 'secondaire';

/** Personnalité de mouvement d'un personnage (dérivée de la bible, réglable). */
export interface Personnalite {
  /** Gain d'exagération g (0,7 sobre … 1,4 cartoon ; défaut 1). */
  exageration?: number;
  /** Facteur de tempo (durées / tempo ; défaut 1). */
  tempo?: number;
  /** Ressorts par groupe de canaux (remplace les valeurs par défaut de `anim/`). */
  ressorts?: Partial<Record<GroupeRessort, ParametresRessort>>;
  /** Décalage de chevauchement par profondeur d'os dans la chaîne (s ; défaut ≈ 0,06). */
  chevauchement?: number;
}

/** Déclaration d'un personnage du projet. */
export interface DeclarationPersonnage {
  /** Identifiant dans le projet (« modou »). */
  id: string;
  /** Nom dans la bible de la troupe (« MODOU »). */
  nom: string;
  /** Rig à utiliser : `CharacterRig.id` (chargé par l'appelant dans `Ressources.rigs`). */
  rig: string;
  /** Taille réelle en mètres (bible `taille_m`), pour l'échelle dans le décor. */
  tailleM: number;
  personnalite?: Personnalite;
}

/** Tailles de plan (grammaire du sketch vertical). */
export type TaillePlan = 'ensemble' | 'large' | 'moyen' | 'americain' | 'rapproche' | 'gros' | 'tresGros';

/** Cadrage de départ d'un plan. */
export interface Cadrage {
  /** Taille de plan (défaut : `moyen`). */
  taille?: TaillePlan;
  /** Personnages à cadrer (le cadre les englobe selon `taille`). */
  sujets?: string[];
  /** Centre imposé (prioritaire sur `sujets`). */
  centre?: PointDecor;
  /** Zoom imposé (prioritaire sur `taille`). */
  zoom?: number;
}

/** Placement d'un personnage au début d'un plan. */
export interface PlacementPersonnage {
  personnage: string;
  /** Position horizontale des pieds (fraction de la largeur du décor). */
  u: number;
  /** Position verticale des pieds (fraction de la hauteur ; défaut : ligne de sol `fit.floor` du décor). */
  v?: number;
  /** Sens du regard : 1 = vers la droite de l'image, −1 = vers la gauche (défaut 1). */
  orientation?: 1 | -1;
  /** Ordre de dessin imposé (défaut : déduit de `v`, plus bas = devant). */
  ordre?: number;
  /** Facteur d'échelle supplémentaire (défaut 1). */
  echelle?: number;
}

/** Ambiance du décor pendant un plan. */
export interface AmbiancePlan {
  /** Figurants vivants (défaut vrai). */
  figurants?: boolean;
  /** Ciel qui dérive (défaut vrai). */
  ciel?: boolean;
  /** Intensité de la vie du décor, 0 … 1 (défaut 1). */
  vie?: number;
}

/** Un plan : intervalle de temps `[debut, fin[`, un décor, un cadrage, des personnages placés. */
export interface Plan {
  id: string;
  debut: number;
  fin: number;
  /** Identifiant du décor dans le manifeste du kit (`decors.json`). */
  decor: string;
  cadrage: Cadrage;
  personnages: PlacementPersonnage[];
  ambiance?: AmbiancePlan;
}

/**
 * Catalogue des actions réutilisables (recettes de `anim/` et `visage/`). Les identifiants inconnus sont acceptés
 * (extensions) mais signalés par la validation.
 */
export const ACTIONS_CATALOGUE = [
  'respirer',
  'attendre',
  'regarder',
  'hocher',
  'parler',
  'hausserEpaules',
  'pointer',
  'mainsOuvertes',
  'brasCroises',
  'surprise',
  'colere',
  'gene',
  'rire',
  'rireFlexion',
  'recul',
  'flexion',
  'marcher',
  'sArreter',
  'seTourner',
  'sAsseoir',
  'seLever',
  'prendre',
  'poser',
] as const;

/** Identifiant d'action (catalogue, ou extension libre). */
export type IdAction = (typeof ACTIONS_CATALOGUE)[number] | (string & {});

/** Cible d'un regard ou d'un geste : un personnage, un point du décor, ou la caméra. */
export type Cible = { personnage: string } | { point: PointDecor } | { camera: true };

/** Valeur de paramètre d'action. */
export type ValeurParametre = number | string | boolean | PointDecor;

/** Une action placée sur la timeline d'un personnage. */
export interface ActionPlacee {
  personnage: string;
  action: IdAction;
  /** Début (s, absolu). */
  debut: number;
  /** Durée (s) ; défaut : durée propre de la recette. Les actions « tenues » (bras croisés) durent jusqu'ici. */
  duree?: number;
  /** Intensité / gain d'exagération de cette action (défaut 1 ; 0 … 1,5). */
  intensite?: number;
  /** Facteur de tempo (défaut 1 ; 2 = deux fois plus vite). */
  tempo?: number;
  /** Cible (regard, pointage, rotation, marche). */
  cible?: Cible;
  /** Priorité (0 … 9) ; défaut : celle de la recette. */
  priorite?: number;
  /**
   * Paramètres propres à la recette. Conventions partagées :
   * - `marcher` : `vers` (PointDecor, destination des pieds) ;
   * - `seTourner` : `orientation` (1 | −1) ;
   * - `parler` : `replique` (id de la réplique, gestes calés sur la prosodie).
   */
  parametres?: Record<string, ValeurParametre>;
}

/** Phonème horodaté **relativement au début de la réplique** (s). */
export interface Phoneme {
  /** Symbole (API / espeak, ex. « a », « ʁ », « ɔ̃ », « sil »). */
  ph: string;
  debut: number;
  fin: number;
  /** Syllabe accentuée (prosodie). */
  accent?: boolean;
}

/** Mot horodaté relativement au début de la réplique (sous-titres). */
export interface Mot {
  texte: string;
  debut: number;
  fin: number;
}

/** Clé de visème manuelle (correction éditable, relative au début de la réplique). */
export interface CleViseme {
  t: number;
  viseme: Viseme;
  /** Clé verrouillée : conservée telle quelle quand la piste est régénérée. */
  verrouillee?: boolean;
}

/** Émotions de jeu reconnues par `visage/` et `anim/`. */
export type Emotion = 'neutre' | 'joie' | 'colere' | 'surprise' | 'peur' | 'tristesse' | 'gene' | 'mefiance' | 'malice';

/** Une réplique de dialogue. */
export interface Replique {
  id: string;
  personnage: string;
  /** Texte en français (sous-titres, alignement). */
  texte: string;
  /** Début absolu (s). */
  debut: number;
  /** Fin absolue (s) ; défaut : fin du dernier phonème, ou durée de l'audio. */
  fin?: number;
  /** Fichier audio (WAV) de la voix, lu sur place. */
  audio?: string;
  /** Gain linéaire de la voix (défaut 1). */
  volume?: number;
  phonemes?: Phoneme[];
  mots?: Mot[];
  /** Corrections manuelles de visèmes. */
  visemes?: CleViseme[];
  emotion?: Emotion;
  /** Destinataire de la réplique (regards, réactions). */
  destinataire?: string;
}

/** Mouvement de caméra (piste caméra). Les instants sont absolus (s). */
export type MouvementCamera =
  | {
      /** Recadrage progressif vers un nouveau cadrage. */
      type: 'recadrer';
      debut: number;
      duree: number;
      cadrage: Cadrage;
      easing?: NomEasing;
    }
  | {
      /** Panoramique / travelling latéral vers un point du décor. */
      type: 'panoramique';
      debut: number;
      duree: number;
      vers: PointDecor;
      easing?: NomEasing;
    }
  | {
      /** Punch-in comique sur un sujet (zoom sec avec léger dépassement). */
      type: 'punchIn';
      debut: number;
      duree: number;
      sujet: string;
      /** Facteur de zoom (défaut 1,4). */
      facteur?: number;
    }
  | {
      /** Panoramique filé (whip pan) vers un point, avec flou directionnel. */
      type: 'file';
      debut: number;
      duree: number;
      vers: PointDecor;
    }
  | {
      /** Tremblement d'impact ou de rire (décroissant). */
      type: 'tremblement';
      debut: number;
      duree: number;
      /** Amplitude (unités monde ; défaut 0,01). */
      amplitude?: number;
      /** Fréquence (Hz ; défaut 12). */
      frequence?: number;
    }
  | {
      /** Gel comique : le jeu des acteurs se fige (`tJeu` constant), la caméra peut continuer. */
      type: 'gel';
      debut: number;
      duree: number;
      /** Zoom ajouté pendant le gel (défaut 1,08). */
      zoom?: number;
      /** Désaturation pendant le gel (défaut 0,4). */
      desaturation?: number;
    }
  | {
      /** Ralenti : le jeu avance `facteur` fois plus vite (0,5 = deux fois plus lent). */
      type: 'ralenti';
      debut: number;
      duree: number;
      facteur: number;
    }
  | {
      /** Fondu au noir (sortie) ou depuis le noir (entrée). */
      type: 'fondu';
      debut: number;
      duree: number;
      sens: 'entree' | 'sortie';
    };

/** Types de sons. */
export type TypeSon = 'voix' | 'effet' | 'musique' | 'ambiance';

/** Son placé sur la timeline. */
export interface Son {
  id: string;
  /** Fichier audio, lu sur place. */
  fichier: string;
  /** Début absolu (s). */
  debut: number;
  /** Durée jouée (s) ; défaut : tout le fichier. */
  duree?: number;
  /** Gain linéaire (défaut 1). */
  volume?: number;
  type: TypeSon;
  /** Lecture en boucle (ambiances). */
  boucle?: boolean;
  /** Fondus d'entrée et de sortie (s). */
  fondu?: { entree?: number; sortie?: number };
}

/** Pistes du projet. */
export interface Pistes {
  actions: ActionPlacee[];
  dialogue: Replique[];
  camera: MouvementCamera[];
  sons: Son[];
}

/** Projet complet (format JSON `*.projet.json`). */
export interface Projet {
  format: typeof FORMAT_PROJET;
  titre: string;
  /** Cadence de rendu (i/s), explicite (30 ou 60). */
  fps: number;
  /** Durée totale (s). */
  duree: number;
  sortie: ReglagesSortie;
  personnages: DeclarationPersonnage[];
  /** Plans, sans chevauchement, triés par début. */
  plans: Plan[];
  pistes: Pistes;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 7. Ressources chargées et injection des modules dans `evaluer`
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Informations d'un décor du kit (manifeste `decors.json`), complétées par la taille des images. */
export interface InfoDecor {
  id: string;
  nom: string;
  /** Taille de la plaque en px (référence du repère monde : aspect = largeur / hauteur). */
  largeur: number;
  hauteur: number;
  /** Rapport largeur / hauteur (≈ 2). */
  aspect: number;
  /**
   * Ajustement fourni par le kit : `mH` = hauteur de scène en mètres au niveau de la ligne de sol ;
   * `floor` = ligne de sol (fraction de hauteur, ≈ 0,95) ; `cx` = centre d'intérêt horizontal (fraction de largeur).
   */
  fit: { mH: number; floor: number; cx: number; blur?: number };
  /**
   * Chemins des fichiers (lus sur place, jamais copiés) : peinture avec figurants, plaque sans figurants, profondeurs
   * (clair = proche), masques (rouge = figurants, vert = ciel), personnes (facultatif).
   */
  fichiers: {
    src: string;
    plate: string;
    depth: string;
    plateDepth: string;
    masks: string;
    people?: string;
  };
}

/** Ressources disponibles pendant l'évaluation (chargées **avant**, jamais pendant `evaluer`). */
export interface Ressources {
  /** Rigs par identifiant. */
  rigs: Record<string, CharacterRig>;
  /** Décors par identifiant. */
  decors: Record<string, InfoDecor>;
}

/** Contexte commun passé aux fournisseurs pour une image. */
export interface ContexteImage {
  readonly projet: Projet;
  /** Instant absolu (s). */
  readonly t: number;
  /** Temps du jeu (gel / ralenti appliqués). À utiliser pour tout ce qui « joue » (corps, visage, figurants). */
  readonly tJeu: number;
  /** Plan actif, ou `null` si le projet n'a pas de plan. */
  readonly plan: Plan | null;
  readonly indexPlan: number;
  /** `t − plan.debut` (0 sans plan). */
  readonly tPlan: number;
  /** Décor du plan actif (`null` s'il est absent des ressources). */
  readonly decor: InfoDecor | null;
  readonly ressources: Ressources;
}

/** Contexte d'un personnage présent dans le plan actif. */
export interface ContextePersonnage extends ContexteImage {
  readonly declaration: DeclarationPersonnage;
  readonly placement: PlacementPersonnage;
  /** Rig chargé (`null` s'il manque : les fournisseurs rendent alors un état neutre). */
  readonly rig: CharacterRig | null;
}

/** Placement d'un personnage dans le monde (sortie de `scene/`). */
export interface PlacementMonde {
  position: Vec2;
  echelle: number;
  profondeur: number;
  ordre: number;
  ombre: EtatOmbre;
  etalonnage: Etalonnage;
  flou: number;
  opacite: number;
  visible: boolean;
}

/** Fournit la pose d'un personnage (module `anim/`). */
export type FournisseurPose = (ctx: ContextePersonnage) => Pose;
/** Fournit l'état du visage (module `visage/`). */
export type FournisseurVisage = (ctx: ContextePersonnage) => EtatVisage;
/** Fournit le placement monde d'un personnage (module `scene/`). */
export type FournisseurPlacement = (ctx: ContextePersonnage) => PlacementMonde;
/** Fournit la caméra (module `scene/`), connaissant les personnages déjà évalués. */
export type FournisseurCamera = (ctx: ContexteImage, personnages: readonly EtatPersonnage[]) => EtatCamera;
/** Fournit l'état du décor (module `scene/`), connaissant la caméra. */
export type FournisseurDecor = (ctx: ContexteImage, camera: EtatCamera) => EtatDecor | null;
/** Fournit les sous-titres actifs. */
export type FournisseurSousTitres = (ctx: ContexteImage) => SousTitre[];
/** Fournit les sons en cours. */
export type FournisseurSons = (ctx: ContexteImage) => EvenementSon[];
/** Fournit les effets plein cadre. */
export type FournisseurEffets = (ctx: ContexteImage) => EffetsImage;

/** Les fournisseurs injectés dans `evaluer` (un par module). */
export interface Fournisseurs {
  pose: FournisseurPose;
  visage: FournisseurVisage;
  placement: FournisseurPlacement;
  camera: FournisseurCamera;
  decor: FournisseurDecor;
  sousTitres: FournisseurSousTitres;
  sons: FournisseurSons;
  effets: FournisseurEffets;
}

/** Un moteur prêt à évaluer : fournisseurs + ressources. */
export interface Moteur {
  readonly fournisseurs: Fournisseurs;
  readonly ressources: Ressources;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 8. Pont entre `export/` (Node + Playwright) et `rendu/` (page Chromium)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Options d'initialisation de la page de rendu. */
export interface OptionsPageRendu {
  largeur: number;
  hauteur: number;
  fond?: Couleur;
  ressources: Ressources;
  /**
   * Préfixe d'URL des images. La page charge un fichier de chemin `c` à l'URL
   * `urlRessources + '/' + encodeURIComponent(c)` ; `export/` sert ces URL (route Playwright ou serveur local)
   * en lisant les fichiers sur place.
   */
  urlRessources: string;
}

/** API exposée par la page de rendu sur `window.moteurFluide`. */
export interface ApiPageRendu {
  readonly version: string;
  /** Charge les textures et prépare la scène. */
  initialiser(options: OptionsPageRendu): Promise<void>;
  /**
   * Dessine une image de sortie : moyenne des sous-états fournis (flou de bougé exact). Un seul état = pas de flou.
   * Tous les sous-états appartiennent au même plan.
   */
  dessiner(sousEtats: EtatImage[]): Promise<void>;
  /** Renvoie l'image courante en data URL. */
  capturer(format: 'jpeg' | 'png', qualite?: number): Promise<string>;
}
