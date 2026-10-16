/**
 * Réalisateur caméra : cadrages du sketch vertical (9:16) et mouvements datés, en fonctions PURES du temps.
 *
 * - **Cadrage** par taille de plan (ensemble, large, moyen = en pied, américain, rapproché, gros plan, très gros plan),
 *   calculé sur la géométrie réelle des sujets (taille au sol, position des yeux) : yeux sur la ligne des 36 % de la
 *   hauteur (sous la barre du haut de TikTok, au-dessus de la bande des sous-titres), pieds à 88 % pour les plans en
 *   pied, marge de regard du côté où le sujet regarde. Le zoom est borné par le grossissement acceptable de l'image
 *   du personnage et par le décor (la fenêtre ne sort jamais du décor : bornes douces, sans à-coup).
 * - **Suivi** des sujets qui marchent par un ressort analytique (opérateur qui suit avec un léger retard et se pose,
 *   `noyau/ressorts`) : aucune intégration pas à pas.
 * - Mouvements de la piste caméra : `recadrer` et `panoramique` (courbe d'accélération), `punchIn` (zoom éclair
 *   autour du visage, réponse de ressort avec ≈ 3 % de dépassement), `file` (panoramique filé en smootherstep, flou
 *   directionnel = vitesse × obturateur ; une coupe au milieu d'un filé est raccordée en vitesse), `tremblement`
 *   (enveloppe décroissante × bruit simplex), `gel` (zoom 1 → 1,08 en 4 images). Caméra « à main levée » discrète
 *   (`cadrage.mainLevee`).
 *
 * Contrat : `fournisseurCamera(ctx, personnages) → EtatCamera`. Le plan est compilé une fois (mémoïsé par projet,
 * ressources et plan) ; l'évaluation à un instant ne dépend que de `t`.
 */
import { bruit1D, bruitFractal1D, graineDe } from '../noyau/aleatoire';
import { EASINGS, smootherstep, smoothstep } from '../noyau/courbes';
import { borner, DEG } from '../noyau/maths2d';
import { coefficientsRessort, creerCanalRessort, reponseIndicielle, type CanalRessort, type Consigne } from '../noyau/ressorts';
import { tempsDeJeu } from '../timeline/derives';
import { cameraNeutre } from '../timeline/neutres';
import type {
  Cadrage,
  ContexteImage,
  EtatCamera,
  EtatPersonnage,
  FournisseurCamera,
  InfoDecor,
  MouvementCamera,
  NomEasing,
  Plan,
  Projet,
  Ressources,
  TaillePlan,
  Vec2,
} from '../timeline/types';
import { ASPECT_DEFAUT, geometrieSujet, type GeometrieSujet } from './sol';

/** Hauteur du cadre occupée par le sujet le plus grand, en hauteurs de cadre, par taille de plan. */
export const COUVERTURE_PAR_TAILLE: Readonly<Record<TaillePlan, number>> = Object.freeze({
  ensemble: 0.32,
  large: 0.56,
  moyen: 0.8,
  americain: 1.18,
  rapproche: 1.85,
  gros: 2.7,
  tresGros: 4,
});

/** Composition (fractions de la hauteur de sortie) : ligne des yeux, ligne des pieds des plans en pied. */
export const COMPOSITION = Object.freeze({
  yeux: 0.36,
  yeuxTresGros: 0.42,
  pieds: 0.88,
  /** Marge de regard (fraction de la largeur du cadre) pour un sujet seul en plan serré. */
  margeRegard: 0.07,
  /** Marge latérale autour d'un groupe de sujets, en hauteurs du plus grand sujet. */
  margeGroupe: 0.22,
});

/** Zones sûres TikTok mesurées (px d'une sortie 1080×1920) : visages et sous-titres. */
export const ZONES_SURES = Object.freeze({
  visages: { xMin: 60, xMax: 860, yMin: 250, yMax: 1150 },
  sousTitres: { xMin: 100, xMax: 860, yMin: 1150, yMax: 1550 },
});

/** Réglages du réalisateur. */
export const REGLAGES_CAMERA = Object.freeze({
  /** Grossissement maximal de l'image d'un personnage (px écran / px image) avant de limiter le zoom. */
  grossissementMax: 3.2,
  /** Zoom maximal absolu. */
  zoomMax: 7,
  /** Ressort de suivi des sujets (opérateur). */
  suivi: { f: 0.85, zeta: 0.9 },
  /** Fréquence d'échantillonnage du suivi (Hz). */
  echantillonnage: 20,
  /** Dépassement du punch-in : amortissement ζ (0,75 ≈ 3 %). */
  zetaPunch: 0.75,
  /** Amplitude (px de sortie) et fréquences de la caméra à main levée pour `mainLevee = 1`. */
  mainLevee: { px: 7, roulisDeg: 0.35, frequence: 0.32 },
  /** Valeur par défaut de `cadrage.mainLevee`. */
  mainLeveeDefaut: 0.35,
  /** Largeur des bornes douces (unités monde). */
  douceurBornes: 0.03,
  /** Roulis maximal d'un tremblement d'amplitude 0,01 (rad). */
  roulisTremblement: 1.5 * DEG,
  /** Flou de bougé : seuil (px) sous lequel il est ignoré, seuil de plein effet. */
  flouSeuils: [1, 4] as const,
});

/** Cadre de caméra simple. */
export interface Cadre {
  centre: Vec2;
  zoom: number;
}

/** Contexte de sortie utile au cadrage. */
interface Sortie {
  largeur: number;
  hauteur: number;
  fps: number;
  obturateur: number;
}

/** Maximum doux C¹ : ≥ max(a, b), égal à max(a, b) loin de a = b (largeur `k`). */
export function maxDoux(a: number, b: number, k: number): number {
  return (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2;
}

/** Minimum doux C¹ : ≤ min(a, b). */
export function minDoux(a: number, b: number, k: number): number {
  return (a + b - Math.sqrt((a - b) * (a - b) + k * k)) / 2;
}

/** Borne douce dans [lo, hi] (milieu si l'intervalle est vide). */
export function bornerDoux(x: number, lo: number, hi: number, k: number): number {
  if (hi <= lo) return (lo + hi) / 2;
  const kk = Math.min(k, (hi - lo) / 2);
  // Les deux bornes douces se recouvrent quand l'intervalle est étroit : garde-fou strict (écart < 0,06·(hi − lo)).
  return Math.min(hi, Math.max(lo, minDoux(maxDoux(x, lo, kk), hi, kk)));
}

/** Garde la fenêtre de la caméra dans le décor (bornes douces sur le zoom et le centre). */
export function borneDansDecor(c: Cadre, aspect: number, sortie: Pick<Sortie, 'largeur' | 'hauteur'>, zoomMax: number): Cadre {
  const k = REGLAGES_CAMERA.douceurBornes;
  const lz = bornerDoux(Math.log(c.zoom), 0, Math.log(Math.max(1.0001, zoomMax)), 0.05);
  const zoom = Math.exp(lz);
  const w = sortie.largeur / sortie.hauteur / zoom;
  const h = 1 / zoom;
  return {
    zoom,
    centre: {
      x: w >= aspect ? aspect / 2 : bornerDoux(c.centre.x, w / 2, aspect - w / 2, k),
      y: h >= 1 ? 0.5 : bornerDoux(c.centre.y, h / 2, 1 - h / 2, k),
    },
  };
}

/** Taille de plan effective d'un cadrage. */
function tailleDe(c: Cadrage): TaillePlan {
  return c.taille ?? 'moyen';
}

/**
 * Cadre d'un cadrage sur des sujets (géométrie de repos), non borné au décor. Sans sujet : centre d'intérêt du
 * décor (`fit.cx`), mi-hauteur.
 */
export function cadrer(
  cadrage: Cadrage,
  sujets: readonly GeometrieSujet[],
  decor: InfoDecor | null,
  sortie: Pick<Sortie, 'largeur' | 'hauteur'>,
  zoomMax: number,
): Cadre {
  const aspect = decor?.aspect ?? ASPECT_DEFAUT;
  const ratio = sortie.largeur / sortie.hauteur;
  const taille = tailleDe(cadrage);
  let zoom: number;
  let centre: Vec2;
  if (sujets.length === 0) {
    zoom = cadrage.zoom ?? 1;
    centre = { x: (decor?.fit.cx ?? 0.5) * aspect, y: 0.5 };
  } else {
    const hMax = Math.max(...sujets.map((s) => s.hauteur));
    const xs = sujets.map((s) => s.yeux.x);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const zoomH = COUVERTURE_PAR_TAILLE[taille] / Math.max(1e-6, hMax);
    const largeurUtile = xMax - xMin + 2 * COMPOSITION.margeGroupe * hMax;
    const zoomL = sujets.length > 1 ? ratio / Math.max(1e-6, largeurUtile) : Infinity;
    zoom = cadrage.zoom ?? Math.min(zoomH, zoomL);
    zoom = Math.min(zoom, zoomMax);
    const hCadre = 1 / zoom;
    const wCadre = ratio / zoom;
    let x = (xMin + xMax) / 2;
    if (sujets.length === 1 && (taille === 'americain' || taille === 'rapproche' || taille === 'gros')) {
      x += sujets[0]!.orientation * COMPOSITION.margeRegard * wCadre;
    }
    const enPied = taille === 'ensemble' || taille === 'large' || taille === 'moyen';
    let y: number;
    if (enPied) {
      const pieds = Math.max(...sujets.map((s) => s.pieds.y));
      y = pieds - (COMPOSITION.pieds - 0.5) * hCadre;
    } else {
      const yeux = sujets.reduce((s, g) => s + g.yeux.y, 0) / sujets.length;
      const ligne = taille === 'tresGros' ? COMPOSITION.yeuxTresGros : COMPOSITION.yeux;
      y = yeux + (0.5 - ligne) * hCadre;
    }
    centre = { x, y };
  }
  if (cadrage.centre) centre = { x: cadrage.centre.u * aspect, y: cadrage.centre.v };
  return { centre, zoom };
}

/** Mélange de deux cadres : centre linéaire, zoom géométrique. */
export function melangerCadres(a: Cadre, b: Cadre, u: number): Cadre {
  return {
    centre: { x: a.centre.x + (b.centre.x - a.centre.x) * u, y: a.centre.y + (b.centre.y - a.centre.y) * u },
    zoom: a.zoom * Math.pow(b.zoom / a.zoom, u),
  };
}

/** Réponse indicielle normalisée (0 → 1) d'un ressort, nulle avant 0. */
function reponse(c: ReturnType<typeof coefficientsRessort>, tau: number): number {
  return tau <= 0 ? 0 : reponseIndicielle(c, tau)[0];
}

/** Piste de cadre suivie au ressort (un cadrage appliqué en continu aux sujets qui bougent). */
interface CadreSuivi {
  valeur(t: number): Cadre;
}

function creerCadreSuivi(echantillon: (t: number) => Cadre, debut: number, fin: number): CadreSuivi {
  const pas = 1 / REGLAGES_CAMERA.echantillonnage;
  const n = Math.max(1, Math.ceil((fin - debut) / pas));
  const instants: number[] = [];
  for (let i = 0; i <= n; i++) instants.push(debut + i * pas);
  const cadres = instants.map(echantillon);
  const c0 = cadres[0]!;
  const constant = cadres.every(
    (c) => Math.abs(c.centre.x - c0.centre.x) < 1e-9 && Math.abs(c.centre.y - c0.centre.y) < 1e-9 && Math.abs(c.zoom - c0.zoom) < 1e-9,
  );
  if (constant) return { valeur: () => ({ centre: { ...c0.centre }, zoom: c0.zoom }) };
  const canal = (lire: (c: Cadre) => number): CanalRessort => {
    const consignes: Consigne[] = [];
    for (let i = 1; i < cadres.length; i++) consignes.push({ t: instants[i - 1]!, v: lire(cadres[i]!), rampe: pas });
    return creerCanalRessort(lire(c0), consignes, REGLAGES_CAMERA.suivi);
  };
  const cx = canal((c) => c.centre.x);
  const cy = canal((c) => c.centre.y);
  const cz = canal((c) => Math.log(c.zoom));
  return { valeur: (t) => ({ centre: { x: cx.valeur(t), y: cy.valeur(t) }, zoom: Math.exp(cz.valeur(t)) }) };
}

/** Caméra compilée pour un plan. */
export interface CameraPlan {
  /** État complet de la caméra à l'instant `t`. */
  etat(t: number): EtatCamera;
  /** Cadre « posé » (cadrages, suivi, recadrages et panoramiques, sans punch-in, gel, filé ni tremblements). */
  base(t: number): Cadre;
  /** Cadre de base au début du plan (référence de la parallaxe). */
  readonly reference: Cadre;
  /** Déplacement total de chaque filé du plan (monde), par indice de mouvement dans la piste. */
  readonly deplacementsFiles: ReadonlyMap<number, Vec2>;
  /** Sujets du plan à un instant (géométrie de repos). */
  sujets(t: number, ids?: readonly string[]): GeometrieSujet[];
}

const CACHE = new WeakMap<Projet, WeakMap<Ressources, Map<number, CameraPlan>>>();

/** Caméra compilée du plan `index` (mémoïsée par projet et ressources). */
export function cameraDuPlan(projet: Projet, index: number, ressources: Ressources): CameraPlan | null {
  const plan = projet.plans[index];
  if (!plan) return null;
  let parRessources = CACHE.get(projet);
  if (!parRessources) {
    parRessources = new WeakMap();
    CACHE.set(projet, parRessources);
  }
  let parPlan = parRessources.get(ressources);
  if (!parPlan) {
    parPlan = new Map();
    parRessources.set(ressources, parPlan);
  }
  let cam = parPlan.get(index);
  if (!cam) {
    cam = compilerCamera(projet, index, ressources);
    parPlan.set(index, cam);
  }
  return cam;
}

function easingDe(nom: NomEasing | undefined, defaut: NomEasing): (u: number) => number {
  return EASINGS[nom ?? defaut] ?? EASINGS[defaut];
}

/**
 * Fin d'influence d'un mouvement ponctuel : début du mouvement de cadrage suivant (ou la fin du plan). Un `recadrer`
 * relâche le punch-in sur TOUTE sa durée (dézoom posé, sans à-coup de caméra) ; un panoramique ou un filé le relâche
 * en 0,6 s au plus (le mouvement lui-même porte l'énergie).
 */
export function releve(mouvements: ReadonlyArray<{ m: MouvementCamera; i?: number }>, k: number, finPlan: number): { debut: number; duree: number } {
  for (let j = k + 1; j < mouvements.length; j++) {
    const m = mouvements[j]!.m;
    if (m.type === 'recadrer' || m.type === 'panoramique' || m.type === 'file' || m.type === 'punchIn') {
      const duree = m.type === 'punchIn' || m.type === 'recadrer' ? m.duree : Math.min(m.duree, 0.6);
      return { debut: m.debut, duree: Math.max(0.05, duree) };
    }
  }
  return { debut: finPlan + 1e9, duree: 1 };
}

/** Compile la caméra d'un plan. */
export function compilerCamera(projet: Projet, index: number, ressources: Ressources): CameraPlan {
  const plan: Plan = projet.plans[index]!;
  const decor = ressources.decors[plan.decor] ?? null;
  const aspect = decor?.aspect ?? ASPECT_DEFAUT;
  const sortie: Sortie = {
    largeur: projet.sortie.largeur,
    hauteur: projet.sortie.hauteur,
    fps: projet.fps,
    obturateur: projet.sortie.obturateur,
  };
  const graine = graineDe('camera', projet.sortie.graine, plan.id);

  // ── Sujets ──
  const presents = plan.personnages
    .map((placement) => {
      const declaration = projet.personnages.find((d) => d.id === placement.personnage);
      if (!declaration) return null;
      const rig = ressources.rigs[declaration.rig] ?? null;
      return { placement, declaration, rig };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const sujets = (t: number, ids?: readonly string[]): GeometrieSujet[] => {
    const tJeu = tempsDeJeu(projet, t);
    return presents
      .filter((p) => !ids || ids.includes(p.declaration.id))
      .map((p) => geometrieSujet(projet, plan, p.placement, p.declaration.tailleM, p.rig, decor, tJeu));
  };
  // Zoom maximal : grossissement de l'image du plus petit sujet cadré.
  const zoomMaxPour = (ids: readonly string[] | undefined): number => {
    let z: number = REGLAGES_CAMERA.zoomMax;
    for (const p of presents) {
      if (ids && !ids.includes(p.declaration.id)) continue;
      const g = geometrieSujet(projet, plan, p.placement, p.declaration.tailleM, p.rig, decor, tempsDeJeu(projet, plan.debut));
      const hPx = p.rig?.hauteurPx;
      if (hPx && g.hauteur > 0) z = Math.min(z, (REGLAGES_CAMERA.grossissementMax * hPx) / (g.hauteur * sortie.hauteur));
    }
    return Math.max(1, z);
  };
  const idsDe = (c: Cadrage): readonly string[] | undefined => (c.sujets && c.sujets.length > 0 ? c.sujets : undefined);

  // ── Mouvements du plan (ceux qui commencent dans le plan) ──
  const mouvements = projet.pistes.camera
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.debut >= plan.debut && m.debut < plan.fin)
    .sort((a, b) => a.m.debut - b.m.debut || a.i - b.i);

  // ── Cadres suivis (cadrage initial + un par recadrage) ──
  const finSuivi = plan.fin + 0.5;
  const suiviDe = (c: Cadrage): CadreSuivi => {
    const ids = idsDe(c);
    const zmax = zoomMaxPour(ids);
    return creerCadreSuivi((t) => cadrer(c, sujets(t, ids), decor, sortie, zmax), plan.debut, finSuivi);
  };
  const suiviInitial = suiviDe(plan.cadrage);
  const suivisRecadrage = new Map<number, CadreSuivi>();
  for (const { m, i } of mouvements) if (m.type === 'recadrer') suivisRecadrage.set(i, suiviDe(m.cadrage));
  let zoomMaxPlan = zoomMaxPour(idsDe(plan.cadrage));
  for (const { m } of mouvements) if (m.type === 'recadrer') zoomMaxPlan = Math.max(zoomMaxPlan, zoomMaxPour(idsDe(m.cadrage)));

  /** Cadre de base : cadrage suivi, puis recadrages et panoramiques. */
  const base = (t: number): Cadre => {
    let c = suiviInitial.valeur(t);
    for (const { m, i } of mouvements) {
      if (m.debut > t) break;
      const u = m.duree > 0 ? borner((t - m.debut) / m.duree, 0, 1) : 1;
      if (m.type === 'recadrer') {
        const e = easingDe(m.easing, 'entreeSortieCubique')(u);
        c = melangerCadres(c, suivisRecadrage.get(i)!.valeur(t), e);
      } else if (m.type === 'panoramique') {
        const e = easingDe(m.easing, 'entreeSortieSinus')(u);
        c = melangerCadres(c, { centre: { x: m.vers.u * aspect, y: m.vers.v }, zoom: c.zoom }, e);
      }
    }
    return c;
  };

  // ── Punch-in : réponse de ressort, relâchée au mouvement de cadrage suivant ──
  const punchs = mouvements
    .map((x, k) => ({ ...x, k }))
    .filter((x): x is { m: Extract<MouvementCamera, { type: 'punchIn' }>; i: number; k: number } => x.m.type === 'punchIn')
    .map(({ m, k }) => {
      const zeta = REGLAGES_CAMERA.zetaPunch;
      // Pic du dépassement à ≈ 1,25 × la durée demandée.
      const wd = Math.PI / (1.25 * Math.max(0.04, m.duree));
      const f = wd / Math.sqrt(1 - zeta * zeta) / (2 * Math.PI);
      return { m, coef: coefficientsRessort({ f, zeta }), releve: releve(mouvements, k, plan.fin) };
    });

  const appliquerPunch = (c: Cadre, t: number): Cadre => {
    let r = c;
    for (const p of punchs) {
      if (p.m.debut > t) break;
      const montee = reponse(p.coef, t - p.m.debut);
      const descente = 1 - EASINGS.entreeSortieCubique(borner((t - p.releve.debut) / p.releve.duree, 0, 1));
      const a = montee * descente;
      if (a === 0) continue;
      const facteur = 1 + ((p.m.facteur ?? 1.4) - 1) * a;
      const s = sujets(t, [p.m.sujet])[0];
      const visage = s ? s.yeux : r.centre;
      const zoom = r.zoom * facteur;
      // Zoom éclair = changement de focale autour du visage : le visage reste fixe à l'écran, seul le cadre se
      // resserre (aucune translation brusque du cadre, aucune parallaxe).
      r = { zoom, centre: { x: visage.x + (r.centre.x - visage.x) / facteur, y: visage.y + (r.centre.y - visage.y) / facteur } };
    }
    return r;
  };

  // ── Gel : zoom sec, tenu, relâché à la fin ──
  const gels = mouvements.filter(({ m }) => m.type === 'gel').map(({ m }) => m as Extract<MouvementCamera, { type: 'gel' }>);
  const facteurGel = (t: number): number => {
    let f = 1;
    for (const g of gels) {
      const fin = g.debut + g.duree;
      if (t < g.debut || t >= fin + 0.2) continue;
      const m = smoothstep(g.debut, g.debut + 4 / sortie.fps, t) * (1 - smoothstep(fin, fin + 0.15, t));
      f *= 1 + ((g.zoom ?? 1.08) - 1) * m;
    }
    return f;
  };

  // ── Filés : déplacements accumulés (et filé entrant depuis le plan précédent) ──
  const files = mouvements.filter(({ m }) => m.type === 'file') as Array<{ m: Extract<MouvementCamera, { type: 'file' }>; i: number }>;
  const deplacementsFiles = new Map<number, Vec2>();
  const sansFile = (t: number): Cadre => {
    const c = appliquerPunch(base(t), t);
    return { centre: c.centre, zoom: c.zoom * facteurGel(t) };
  };
  {
    let cumul = { x: 0, y: 0 };
    for (const { m, i } of files) {
      const depart = sansFile(m.debut).centre;
      const D = { x: m.vers.u * aspect - (depart.x + cumul.x), y: m.vers.v - (depart.y + cumul.y) };
      deplacementsFiles.set(i, D);
      cumul = { x: cumul.x + D.x, y: cumul.y + D.y };
    }
  }
  // Filé commencé dans le plan précédent et encore en cours : on arrive de l'autre côté, à la même vitesse.
  const entrants: Array<{ m: Extract<MouvementCamera, { type: 'file' }>; D: Vec2 }> = [];
  if (index > 0) {
    projet.pistes.camera.forEach((m, i) => {
      if (m.type !== 'file' || m.debut >= plan.debut || m.debut + m.duree <= plan.debut) return;
      const precedent = projet.plans.findIndex((p) => m.debut >= p.debut && m.debut < p.fin);
      const camPrec = precedent >= 0 ? cameraDuPlan(projet, precedent, ressources) : null;
      const D = camPrec?.deplacementsFiles.get(i) ?? { x: 0.5, y: 0 };
      entrants.push({ m, D });
    });
  }
  const decalageFile = (t: number): Vec2 => {
    let x = 0;
    let y = 0;
    for (const { m, i } of files) {
      if (t < m.debut) break;
      const s = smootherstep(0, 1, m.duree > 0 ? (t - m.debut) / m.duree : 1);
      const D = deplacementsFiles.get(i)!;
      x += D.x * s;
      y += D.y * s;
    }
    for (const { m, D } of entrants) {
      const s = smootherstep(0, 1, m.duree > 0 ? (t - m.debut) / m.duree : 1);
      x -= D.x * (1 - s);
      y -= D.y * (1 - s);
    }
    return { x, y };
  };

  // ── Main levée : dérive lente, sous le seuil de la porte de rythme (avant les bornes du décor) ──
  const mainLevee = plan.cadrage.mainLevee ?? REGLAGES_CAMERA.mainLeveeDefaut;
  const ml = REGLAGES_CAMERA.mainLevee;

  // ── Exposition : raccord de clarté entre deux décors pendant un filé qui traverse une coupe ──
  const clarte = (d: InfoDecor | null | undefined): number | null => d?.analyse?.lab.moyenne[0] ?? null;
  const clarteIci = clarte(decor);
  const raccords: Array<{ debut: number; fin: number; rapport: number; sortant: boolean }> = [];
  if (clarteIci && clarteIci > 1) {
    for (const { m } of files) {
      const suivant = projet.plans[index + 1];
      if (!suivant || m.debut + m.duree <= plan.fin) continue;
      const c = clarte(ressources.decors[suivant.decor]);
      if (c && c > 1) raccords.push({ debut: m.debut, fin: plan.fin, rapport: c / clarteIci, sortant: true });
    }
    for (const { m } of entrants) {
      const precedent = projet.plans[index - 1];
      const c = clarte(precedent ? ressources.decors[precedent.decor] : null);
      if (c && c > 1) raccords.push({ debut: plan.debut, fin: m.debut + m.duree, rapport: c / clarteIci, sortant: false });
    }
  }
  const exposition = (t: number): number => {
    let g = 1;
    for (const r of raccords) {
      if (t < r.debut || t > r.fin) continue;
      const u = smoothstep(r.debut, r.fin, t);
      const w = r.sortant ? u : 1 - u;
      // Les deux côtés de la coupe se rejoignent à la moyenne géométrique des clartés.
      g *= Math.pow(Math.min(1.6, Math.max(0.6, r.rapport)), 0.5 * w);
    }
    return g;
  };

  /** Cadre final sans tremblement, borné au décor. */
  const cadreFinal = (t: number): Cadre => {
    const c = sansFile(t);
    const f = decalageFile(t);
    let x = c.centre.x + f.x;
    let y = c.centre.y + f.y;
    if (mainLevee > 0) {
      const a = (mainLevee * ml.px) / (c.zoom * sortie.hauteur);
      x += a * bruitFractal1D(ml.frequence * t, graine + 11, { octaves: 2 });
      y += 0.7 * a * bruitFractal1D(ml.frequence * 0.83 * t, graine + 23, { octaves: 2 });
    }
    // Les filés peuvent sortir des bornes « douces » du cadre posé : ils se bornent au décor seulement.
    return borneDansDecor({ centre: { x, y }, zoom: c.zoom }, aspect, sortie, Math.max(zoomMaxPlan * 1.8, 1.0001));
  };

  // ── Tremblements ──
  const tremblements = mouvements.filter(({ m }) => m.type === 'tremblement').map(({ m }) => m as Extract<MouvementCamera, { type: 'tremblement' }>);

  const etat = (t: number): EtatCamera => {
    const c = cadreFinal(t);
    const cam = cameraNeutre(c.centre, c.zoom);
    const ppu = c.zoom * sortie.hauteur;
    if (mainLevee > 0) cam.rotation += mainLevee * ml.roulisDeg * DEG * bruit1D(ml.frequence * 0.61 * t, graine + 37);
    // Tremblements : enveloppe T² décroissante.
    for (const m of tremblements) {
      const fin = m.debut + m.duree;
      if (t < m.debut || t >= fin) continue;
      const enveloppe = smoothstep(m.debut, m.debut + 0.025, t) * (1 - (t - m.debut) / m.duree);
      const T2 = enveloppe * enveloppe;
      const A = m.amplitude ?? 0.01;
      const f = m.frequence ?? 12;
      const g = graine + Math.round(m.debut * 1000);
      cam.tremble.decalage.x += A * T2 * bruit1D(f * t, g + 1);
      cam.tremble.decalage.y += A * T2 * bruit1D(f * t, g + 2);
      cam.tremble.rotation += REGLAGES_CAMERA.roulisTremblement * (A / 0.01) * T2 * bruit1D(f * t, g + 3);
    }
    // Flou de bougé : déplacement apparent du décor pendant l'obturation (différences centrées, sans tremblement).
    const dt = 1e-3;
    const a = cadreFinal(t - dt);
    const b = cadreFinal(t + dt);
    const vx = (b.centre.x - a.centre.x) / (2 * dt);
    const vy = (b.centre.y - a.centre.y) / (2 * dt);
    const ouverture = sortie.obturateur / sortie.fps;
    const fx = -vx * ppu * ouverture;
    const fy = -vy * ppu * ouverture;
    const n = Math.hypot(fx, fy);
    const [s0, s1] = REGLAGES_CAMERA.flouSeuils;
    const k = smoothstep(s0, s1, n);
    cam.flouBouge = { x: arrondir(fx * k), y: arrondir(fy * k) };
    cam.centre = { x: arrondir(cam.centre.x), y: arrondir(cam.centre.y) };
    cam.zoom = arrondir(cam.zoom);
    cam.rotation = arrondir(cam.rotation);
    cam.tremble.decalage = { x: arrondir(cam.tremble.decalage.x), y: arrondir(cam.tremble.decalage.y) };
    cam.tremble.rotation = arrondir(cam.tremble.rotation);
    const ex = exposition(t);
    if (ex !== 1) cam.exposition = arrondir(ex);
    return cam;
  };

  const reference = base(plan.debut);
  return { etat, base, reference, deplacementsFiles, sujets };
}

function arrondir(x: number): number {
  return Math.round(x * 1e9) / 1e9;
}

/** Caméra du plan actif. Sans plan : décor entier, centré. */
export const fournisseurCamera: FournisseurCamera = (ctx: ContexteImage, _personnages: readonly EtatPersonnage[]): EtatCamera => {
  const aspect = ctx.decor?.aspect ?? ASPECT_DEFAUT;
  if (!ctx.plan) return cameraNeutre({ x: aspect / 2, y: 0.5 }, 1);
  const cam = cameraDuPlan(ctx.projet, ctx.indexPlan, ctx.ressources);
  return cam ? cam.etat(ctx.t) : cameraNeutre({ x: aspect / 2, y: 0.5 }, 1);
};

/** Position à l'écran (px de sortie) d'un point monde, pour les contrôles de zones sûres. */
export function versEcran(cam: EtatCamera, p: Vec2, largeur: number, hauteur: number): Vec2 {
  const s = cam.zoom * hauteur;
  const cx = cam.centre.x + cam.tremble.decalage.x;
  const cy = cam.centre.y + cam.tremble.decalage.y;
  const r = -(cam.rotation + cam.tremble.rotation);
  const dx = p.x - cx;
  const dy = p.y - cy;
  return {
    x: largeur / 2 + s * (Math.cos(r) * dx - Math.sin(r) * dy),
    y: hauteur / 2 + s * (Math.sin(r) * dx + Math.cos(r) * dy),
  };
}
