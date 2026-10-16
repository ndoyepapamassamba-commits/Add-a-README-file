/**
 * Mesures de la porte qualité, calculées sur l'ÉTAT du moteur (pas seulement sur les pixels) : on connaît la pose
 * exacte de chaque os à chaque image, donc on mesure le mouvement réel des articulations.
 *
 * Unités : les positions sont exprimées en « hauteurs de personnage » (H) ; une vitesse en H/s ; un à-coup
 * (dérivée troisième) en H/s³. Les dérivées sont des différences finies à la cadence de sortie, jamais à travers une
 * coupe, une sortie de champ ou une bascule de gel.
 *
 * Fonctions pures : séries extraites d'une suite d'`EtatImage`, puis mesures par personnage, par caméra et pour la
 * synchro labiale. Les seuils et le verdict sont dans `porte.ts`.
 */
import { boutPose, calculerFK, pointAttache } from '../rig/fk';
import { matriceCamera, matriceImageVersMonde, matriceRacine, pixelsParUnite } from '../timeline/projection';
import type { CharacterRig, EtatImage, EtatVisage, Mat2D } from '../timeline/types';

const app = (m: Mat2D, x: number, y: number): [number, number] => [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty];

/** Hauteur image supposée d'un personnage sans rig chargé (px). */
const HAUTEUR_SANS_RIG = 1000;

/** Série d'un personnage sur une plage d'images consécutives. */
export interface SeriePersonnage {
  id: string;
  fps: number;
  /** Nombre d'images de la plage. */
  n: number;
  /** Index absolu de chaque image. */
  images: Int32Array;
  t: Float64Array;
  /** 1 si le personnage est dans l'état de l'image. */
  present: Uint8Array;
  /** 1 s'il est (au moins en partie) dans le cadre. */
  aLEcran: Uint8Array;
  /** 1 si le jeu est figé (gel voulu : `tJeu` constant). */
  gel: Uint8Array;
  /** Segment de continuité (−1 = absent) : change à chaque coupe ou réapparition. */
  segment: Int32Array;
  /** Nombre de points de contrôle (articulations : pivots et bouts d'os). */
  nbPoints: number;
  /** n × 2P : points de contrôle dans le monde. */
  monde: Float64Array;
  /**
   * n × P : 1 si le point est dans le cadre (marge de 2 %). Les mesures de mouvement ne comptent que ce que le
   * spectateur voit : des jambes hors champ en gros plan peuvent trembler sans que cela se voie.
   */
  visibles: Uint8Array;
  /** n × 2P : points de contrôle dans le repère du personnage (racine comprise), en H, depuis l'ancrage au sol. */
  corps: Float64Array;
  /** Hauteur du personnage dans le monde (unités monde), par image. */
  hauteur: Float64Array;
  /** n × 2 : position monde de l'ancrage au sol. */
  racine: Float64Array;
  /** n × 4 : semelles gauche et droite dans le monde (null si le rig ne les décrit pas). */
  pieds: Float64Array | null;
  /** n × 2 : 1 si la semelle (gauche, droite) est dans le cadre (un glissement hors champ ne se voit pas). */
  piedsALEcran: Uint8Array | null;
  /** Hauteur des semelles au-dessus de l'ancrage au repos (H). */
  piedsRepos: [number, number];
  /** Ligne de sol sous le personnage (y monde), par image. */
  sol: Float64Array;
  /** Pixels de sortie par unité monde, par image. */
  pxParUnite: Float64Array;
  /** 1 pendant un demi-tour (miroir qui bascule, échelle horizontale réduite) : glissement des pieds non mesuré. */
  retournement: Uint8Array;
  /** 1 si le miroir (`racine.flip`) bascule à cette image alors que l'échelle horizontale est pleine (|x| ≥ 0,85). */
  bascule: Uint8Array;
  /** n × B : rotations locales des os (rad). */
  rotations: Float64Array;
  nbOs: number;
  visage: {
    ouverture: Float64Array;
    /** Fermeture moyenne des paupières (0 ouvert … 1 fermé). */
    paupiere: Float64Array;
    /** Somme des variations des canaux du visage depuis l'image précédente. */
    activite: Float64Array;
  };
  /** Nombre de valeurs non finies rencontrées dans l'état. */
  nonFinis: number;
}

/** Série de la caméra. */
export interface SerieCamera {
  n: number;
  fps: number;
  images: Int32Array;
  t: Float64Array;
  segment: Int32Array;
  /** n × 2 : centre (sans tremblement). */
  centre: Float64Array;
  zoom: Float64Array;
  rotation: Float64Array;
  nonFinis: number;
}

/** Canaux continus du visage pris en compte pour l'activité. */
function canauxVisage(v: EtatVisage): number[] {
  return [
    v.ouvertureBouche,
    v.largeur,
    v.arrondi,
    v.sourire,
    v.paupiereG,
    v.paupiereD,
    v.ecarquillement,
    v.regard.x,
    v.regard.y,
    v.sourcilG.hauteur,
    v.sourcilG.froncement,
    v.sourcilG.inclinaison,
    v.sourcilD.hauteur,
    v.sourcilD.froncement,
    v.sourcilD.inclinaison,
  ];
}

/** Options d'extraction. */
export interface OptionsSeries {
  fps: number;
  rigs: Readonly<Record<string, CharacterRig>>;
  largeur: number;
  hauteur: number;
  /** Index absolu de chaque état (défaut : 0, 1, 2…). */
  images?: readonly number[];
}

/**
 * Extrait les séries (personnages et caméra) d'une suite d'états pris à la cadence de sortie (un état par image,
 * sans sous-images de flou).
 */
export function extraireSeries(etats: readonly EtatImage[], o: OptionsSeries): { personnages: SeriePersonnage[]; camera: SerieCamera } {
  const n = etats.length;
  const images = Int32Array.from(o.images ?? etats.map((_, k) => k));
  const t = Float64Array.from(etats.map((e) => e.t));
  const plans = etats.map((e) => e.plan?.id ?? null);

  // Caméra
  const cam: SerieCamera = {
    n,
    fps: o.fps,
    images,
    t,
    segment: new Int32Array(n),
    centre: new Float64Array(2 * n),
    zoom: new Float64Array(n),
    rotation: new Float64Array(n),
    nonFinis: 0,
  };
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const c = etats[k]!.camera;
    if (k > 0 && plans[k] !== plans[k - 1]) seg++;
    cam.segment[k] = seg;
    cam.centre[2 * k] = c.centre.x;
    cam.centre[2 * k + 1] = c.centre.y;
    cam.zoom[k] = c.zoom;
    cam.rotation[k] = c.rotation;
    for (const x of [c.centre.x, c.centre.y, c.zoom, c.rotation]) if (!Number.isFinite(x)) cam.nonFinis++;
  }

  // Personnages (ordre de première apparition)
  const ids: string[] = [];
  for (const e of etats) for (const p of e.personnages) if (!ids.includes(p.id)) ids.push(p.id);
  const series: SeriePersonnage[] = [];
  for (const id of ids) {
    const premier = etats.find((e) => e.personnages.some((p) => p.id === id))!.personnages.find((p) => p.id === id)!;
    const rig = o.rigs[premier.rig] ?? null;
    const nbOs = rig ? rig.squelette.os.length : 0;
    const P = Math.max(1, 2 * nbOs);
    const indexOs = new Map<string, number>(rig ? rig.squelette.os.map((x, i) => [x.nom, i]) : []);
    const avecPieds = !!rig?.pieds && indexOs.has('piedG') && indexOs.has('piedD');
    const s: SeriePersonnage = {
      id,
      fps: o.fps,
      n,
      images,
      t,
      present: new Uint8Array(n),
      aLEcran: new Uint8Array(n),
      gel: new Uint8Array(n),
      segment: new Int32Array(n).fill(-1),
      nbPoints: P,
      monde: new Float64Array(2 * P * n),
      visibles: new Uint8Array(P * n),
      corps: new Float64Array(2 * P * n),
      hauteur: new Float64Array(n),
      racine: new Float64Array(2 * n),
      pieds: avecPieds ? new Float64Array(4 * n) : null,
      piedsALEcran: avecPieds ? new Uint8Array(2 * n) : null,
      piedsRepos: [0, 0],
      sol: new Float64Array(n),
      pxParUnite: new Float64Array(n),
      retournement: new Uint8Array(n),
      bascule: new Uint8Array(n),
      rotations: new Float64Array(Math.max(1, nbOs) * n),
      nbOs,
      visage: { ouverture: new Float64Array(n), paupiere: new Float64Array(n), activite: new Float64Array(n) },
      nonFinis: 0,
    };
    if (rig?.pieds) {
      s.piedsRepos = [(rig.ancrageSol.y - rig.pieds.gauche.y) / rig.hauteurPx, (rig.ancrageSol.y - rig.pieds.droit.y) / rig.hauteurPx];
    }
    let segCourant = -1;
    let compteurSeg = -1;
    let precedentVisage: number[] | null = null;
    let precedentFlip: boolean | null = null;
    for (let k = 0; k < n; k++) {
      const e = etats[k]!;
      const ep = e.personnages.find((p) => p.id === id);
      if (!ep) {
        segCourant = -1;
        precedentVisage = null;
        precedentFlip = null;
        continue;
      }
      if (segCourant < 0 || plans[k] !== plans[k - 1]) {
        compteurSeg++;
        segCourant = compteurSeg;
        precedentVisage = null;
        precedentFlip = null;
      }
      s.present[k] = 1;
      s.segment[k] = segCourant;
      const hPx = rig ? rig.hauteurPx : HAUTEUR_SANS_RIG;
      const ancrage = rig ? rig.ancrageSol : { x: 0, y: 0 };
      s.hauteur[k] = ep.echelle * hPx;
      s.racine[2 * k] = ep.position.x;
      s.racine[2 * k + 1] = ep.position.y;
      s.sol[k] = ep.position.y;
      s.pxParUnite[k] = pixelsParUnite(e.camera, o.hauteur);
      const r = ep.pose.racine;
      const bascule = precedentFlip !== null && precedentFlip !== r.flip;
      s.retournement[k] = Math.abs(r.echelle.x) < 0.85 || bascule ? 1 : 0;
      s.bascule[k] = bascule && Math.abs(r.echelle.x) >= 0.85 ? 1 : 0;
      precedentFlip = r.flip;
      const Mr = matriceRacine(r, ancrage);
      const Mw = matriceImageVersMonde(ep.position, ep.echelle, ancrage);
      const Mc = matriceCamera(e.camera, o.largeur, o.hauteur);
      const base = 2 * P * k;
      let dansCadre = false;
      const ecrirePoint = (j: number, x: number, y: number): void => {
        const [cx, cy] = app(Mr, x, y);
        s.corps[base + 2 * j] = (cx - ancrage.x) / hPx;
        s.corps[base + 2 * j + 1] = (cy - ancrage.y) / hPx;
        const [wx, wy] = app(Mw, cx, cy);
        s.monde[base + 2 * j] = wx;
        s.monde[base + 2 * j + 1] = wy;
        if (!Number.isFinite(wx) || !Number.isFinite(wy)) s.nonFinis++;
        const [ex, ey] = app(Mc, wx, wy);
        const mx = 0.02 * o.largeur;
        const my = 0.02 * o.hauteur;
        if (ex >= -mx && ex <= o.largeur + mx && ey >= -my && ey <= o.hauteur + my) {
          dansCadre = true;
          s.visibles[P * k + j] = 1;
        }
      };
      if (rig && nbOs > 0) {
        const fk = calculerFK(rig.squelette, ep.pose);
        for (let i = 0; i < nbOs; i++) {
          const pv = fk.pivots[i]!;
          ecrirePoint(2 * i, pv.x, pv.y);
          const b = boutPose(rig.squelette, fk, i);
          ecrirePoint(2 * i + 1, b.x, b.y);
          s.rotations[nbOs * k + i] = fk.rotationsLocales[i]!;
        }
        if (avecPieds && s.pieds && rig.pieds) {
          const g = pointAttache(rig.squelette, fk, 'piedG', rig.pieds.gauche);
          const d = pointAttache(rig.squelette, fk, 'piedD', rig.pieds.droit);
          const [gx, gy] = app(Mr, g.x, g.y);
          const [dx, dy] = app(Mr, d.x, d.y);
          const [gwx, gwy] = app(Mw, gx, gy);
          const [dwx, dwy] = app(Mw, dx, dy);
          s.pieds.set([gwx, gwy, dwx, dwy], 4 * k);
          const dedans = (x: number, y: number): number => {
            const [ex, ey] = app(Mc, x, y);
            return ex >= 0 && ex <= o.largeur && ey >= 0 && ey <= o.hauteur ? 1 : 0;
          };
          s.piedsALEcran!.set([dedans(gwx, gwy), dedans(dwx, dwy)], 2 * k);
        }
      } else {
        ecrirePoint(0, ancrage.x, ancrage.y);
      }
      s.aLEcran[k] = dansCadre && ep.opacite > 0.05 ? 1 : 0;
      const v = ep.visage;
      s.visage.ouverture[k] = v.ouvertureBouche;
      s.visage.paupiere[k] = (v.paupiereG + v.paupiereD) / 2;
      const canaux = canauxVisage(v);
      for (const x of canaux) if (!Number.isFinite(x)) s.nonFinis++;
      if (precedentVisage) {
        let a = 0;
        for (let c = 0; c < canaux.length; c++) a += Math.abs(canaux[c]! - precedentVisage[c]!);
        s.visage.activite[k] = a;
      }
      precedentVisage = canaux;
    }
    // Gel voulu : le temps du jeu ne bouge pas d'une image à la voisine (même segment).
    for (let k = 0; k < n; k++) {
      if (!s.present[k]) continue;
      const fige = (j: number): boolean => j >= 0 && j < n && s.segment[j] === s.segment[k] && Math.abs(etats[j]!.tJeu - etats[k]!.tJeu) < 1e-9;
      s.gel[k] = fige(k - 1) || fige(k + 1) ? 1 : 0;
    }
    series.push(s);
  }
  return { personnages: series, camera: cam };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Statistiques
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Centile (interpolation linéaire) d'un tableau ; NaN si vide. */
export function centile(valeurs: ArrayLike<number>, p: number): number {
  const v = Array.from(valeurs).filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return Number.NaN;
  const x = (p / 100) * (v.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  return i + 1 < v.length ? v[i]! * (1 - f) + v[i + 1]! * f : v[i]!;
}

/** Moyenne ; NaN si vide. */
export function moyenne(v: ArrayLike<number>): number {
  let s = 0;
  let c = 0;
  for (let i = 0; i < v.length; i++) if (Number.isFinite(v[i]!)) {
    s += v[i]!;
    c++;
  }
  return c ? s / c : Number.NaN;
}

/** Corrélation de Pearson ; NaN si une série est constante. */
export function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return Number.NaN;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    sab += x * y;
    saa += x * x;
    sbb += y * y;
  }
  return saa > 1e-12 && sbb > 1e-12 ? sab / Math.sqrt(saa * sbb) : Number.NaN;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Mesures d'un personnage
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Réglages des mesures (pas des seuils de verdict). */
export interface ReglagesMesures {
  /** Vitesse d'un membre au-delà de laquelle le mouvement est « franc », lisible (H/s ; défaut 0,25). */
  vitesseFranche: number;
  /** Fenêtre de l'indice de tremblement (s ; défaut 0,5). */
  fenetreTremblement: number;
  /** Plancher de vitesse de l'indice de tremblement (H/s ; défaut 0,03) : en deçà, le mouvement est négligeable. */
  plancherTremblement: number;
  /** Hauteur d'un pied au-dessus du sol en deçà de laquelle il est posé (H ; défaut 0,02). */
  hauteurContact: number;
  /** Déplacement maximal (H) toléré pour qu'un personnage soit considéré comme figé (défaut 0,002). */
  toleranceImmobile: number;
  /** Variation cumulée maximale des canaux du visage pour un visage figé (défaut 0,02). */
  toleranceVisage: number;
  /** Vitesse de jeu moyenne (H/s, sur `fenetreMolle`) en deçà de laquelle un passage est « mou » (défaut 0,05). */
  vitesseMolle: number;
  /** Fenêtre de la moyenne glissante des passages mous (s ; défaut 2). */
  fenetreMolle: number;
  /** Saut de pose : déplacement d'une image ≥ ce minimum (H ; défaut 0,035)… */
  sautMinimum: number;
  /** … et ≥ ce rapport aux déplacements des images voisines (défaut 3). */
  sautRapport: number;
}

export const REGLAGES_MESURES: ReglagesMesures = {
  vitesseFranche: 0.25,
  fenetreTremblement: 0.5,
  plancherTremblement: 0.03,
  hauteurContact: 0.02,
  toleranceImmobile: 0.002,
  toleranceVisage: 0.02,
  vitesseMolle: 0.05,
  fenetreMolle: 2,
  sautMinimum: 0.035,
  sautRapport: 3,
};

/** Mesures d'un personnage. */
export interface MesuresPersonnage {
  id: string;
  imagesPresentes: number;
  /** Temps à l'écran (s), gel compris. */
  dureeALEcran: number;
  /** Temps à l'écran hors gel (s) : base des mesures de mouvement. */
  dureeJeu: number;
  /** Vitesse moyenne des articulations dans le repère du personnage (jeu d'acteur, H/s). */
  energieJeu: number;
  /** Vitesse moyenne des articulations dans le monde (marche comprise, H/s). */
  energieTotale: number;
  /** Part des images où au moins un membre va plus vite que `vitesseFranche`. */
  partMouvementFranc: number;
  /** Vitesse angulaire moyenne des os (rad/s). */
  vitesseAngulaire: number;
  /** Vitesse moyenne de l'ancrage au sol (H/s). */
  vitesseRacine: number;
  /** Vitesse maximale d'un point (H/s) : centile 99 et maximum. */
  vitesseMaxP99: number;
  vitesseMax: number;
  /** À-coups (dérivée troisième, H/s³). */
  jerkP50: number;
  jerkP95: number;
  jerkP99: number;
  /**
   * Indice de tremblement : ‖Δ³x‖ / ‖Δx‖ sur des fenêtres glissantes. Mouvement lisse à 1 Hz ≈ 0,04 ; ressort
   * vif à 4 Hz ≈ 0,7 ; bruit image par image ≈ 3.
   */
  tremblementP95: number;
  tremblementMax: number;
  /**
   * Plus long passage « mou » à l'écran (s) : la vitesse de jeu moyenne sur une fenêtre glissante reste sous
   * `vitesseMolle` (respiration seule, personnage qui attend sans jouer) ; et sa première image.
   */
  passageMouMax: number;
  passageMouDebut: number | null;
  /** Images (index absolus) où la pose saute. */
  sauts: number[];
  /** Parmi les sauts : demi-tours instantanés (miroir qui bascule d'un coup). */
  demiTours: number[];
  /** Glissement des pieds posés (px de sortie par image) et dérive cumulée par appui (H). */
  glissement: { appuis: number; imagesAppui: number; p95: number; max: number; derive: number } | null;
  /** Plus longue immobilité totale (corps et visage) à l'écran, hors gel (s), et sa première image. */
  immobiliteMax: number;
  immobiliteDebut: number | null;
  clignements: number;
  clignementsParMinute: number;
  nonFinis: number;
}

/**
 * Mesure le mouvement d'un personnage : vitesses de jeu (repère du personnage : le jeu d'acteur seul) et vitesses
 * monde (la marche comprise), à-coups, tremblement, sauts, glissement des pieds, immobilité, passages mous,
 * clignements.
 */
export function mesurerPersonnage(s: SeriePersonnage, reglages: Partial<ReglagesMesures> = {}): MesuresPersonnage {
  const R = { ...REGLAGES_MESURES, ...reglages };
  const { n, fps } = s;
  const P = s.nbPoints;
  const lie = (k: number, j: number): boolean => k >= 0 && j >= 0 && k < n && j < n && s.present[k] === 1 && s.present[j] === 1 && s.segment[k] === s.segment[j];
  // Hauteur de référence par segment (médiane) : les vitesses monde sont exprimées en H.
  const hRef = new Map<number, number>();
  {
    const parSeg = new Map<number, number[]>();
    for (let k = 0; k < n; k++) if (s.present[k]) {
      const l = parSeg.get(s.segment[k]!) ?? [];
      l.push(s.hauteur[k]!);
      parSeg.set(s.segment[k]!, l);
    }
    for (const [g, l] of parSeg) hRef.set(g, Math.max(1e-9, centile(l, 50)));
  }
  const H = (k: number): number => hRef.get(s.segment[k]!) ?? 1;
  const vu = (k: number, j: number): boolean => s.visibles[P * k + j] === 1;

  // Vitesses par image (différence arrière)
  const vJeu = new Float64Array(n).fill(Number.NaN);
  const vMonde = new Float64Array(n).fill(Number.NaN);
  const vMax = new Float64Array(n).fill(Number.NaN);
  const dMax = new Float64Array(n).fill(Number.NaN); // déplacement max d'un point en une image (H)
  const vAng = new Float64Array(n).fill(Number.NaN);
  const vRac = new Float64Array(n).fill(Number.NaN);
  for (let k = 1; k < n; k++) {
    if (!lie(k, k - 1)) continue;
    const h = H(k);
    let sc = 0;
    let sm = 0;
    let mx = 0;
    let vus = 0;
    for (let j = 0; j < P; j++) {
      if (!vu(k, j) || !vu(k - 1, j)) continue;
      vus++;
      const o = 2 * P * k + 2 * j;
      const q = o - 2 * P;
      const dcx = s.corps[o]! - s.corps[q]!;
      const dcy = s.corps[o + 1]! - s.corps[q + 1]!;
      sc += dcx * dcx + dcy * dcy;
      const dmx = (s.monde[o]! - s.monde[q]!) / h;
      const dmy = (s.monde[o + 1]! - s.monde[q + 1]!) / h;
      const d2 = dmx * dmx + dmy * dmy;
      sm += d2;
      if (d2 > mx) mx = d2;
    }
    if (vus === 0) continue;
    vJeu[k] = Math.sqrt(sc / vus) * fps;
    vMonde[k] = Math.sqrt(sm / vus) * fps;
    dMax[k] = Math.sqrt(mx);
    vMax[k] = dMax[k]! * fps;
    if (s.nbOs > 0) {
      let a = 0;
      for (let i = 0; i < s.nbOs; i++) a += Math.abs(s.rotations[s.nbOs * k + i]! - s.rotations[s.nbOs * (k - 1) + i]!);
      vAng[k] = (a / s.nbOs) * fps;
    }
    vRac[k] = (Math.hypot(s.racine[2 * k]! - s.racine[2 * k - 2]!, s.racine[2 * k + 1]! - s.racine[2 * k - 1]!) / h) * fps;
  }
  // Images « de jeu » : présentes, à l'écran, hors gel.
  const jeu = (k: number): boolean => s.present[k] === 1 && s.aLEcran[k] === 1 && s.gel[k] === 0;
  const garder = (v: Float64Array): number[] => {
    const r: number[] = [];
    for (let k = 0; k < n; k++) if (jeu(k) && Number.isFinite(v[k]!)) r.push(v[k]!);
    return r;
  };
  const vj = garder(vJeu);
  const vm = garder(vMonde);
  const vx = garder(vMax);

  // Passages mous : moyenne glissante centrée de la vitesse de jeu sur les images de jeu.
  let passageMouMax = 0;
  let passageMouDebut: number | null = null;
  {
    const demi = Math.max(1, Math.round((R.fenetreMolle * fps) / 2));
    let debutMou = -1;
    let compte = 0;
    const clore = (): void => {
      if (debutMou >= 0 && compte / fps > passageMouMax) {
        passageMouMax = compte / fps;
        passageMouDebut = s.images[debutMou]!;
      }
      debutMou = -1;
      compte = 0;
    };
    for (let k = 0; k < n; k++) {
      if (!jeu(k)) {
        if (!s.present[k] || !s.aLEcran[k]) clore();
        continue;
      }
      let somme = 0;
      let c = 0;
      for (let j = Math.max(0, k - demi); j <= Math.min(n - 1, k + demi); j++) {
        if (jeu(j) && Number.isFinite(vJeu[j]!) && s.segment[j] === s.segment[k]) {
          somme += vJeu[j]!;
          c++;
        }
      }
      if (c > 0 && somme / c < R.vitesseMolle) {
        if (debutMou < 0) debutMou = k;
        compte++;
      } else clore();
    }
    clore();
  }

  // À-coups et tremblement (fenêtres sans coupe ni bascule de gel)
  const jerk: number[] = [];
  const d3 = new Float64Array(n).fill(Number.NaN); // ‖Δ³‖ RMS par point (H)
  const d1 = new Float64Array(n).fill(Number.NaN); // ‖Δ‖ RMS par point (H)
  for (let k = 3; k < n; k++) {
    if (!(lie(k, k - 1) && lie(k - 1, k - 2) && lie(k - 2, k - 3))) continue;
    if (s.gel[k] || s.gel[k - 1] || s.gel[k - 2] || s.gel[k - 3]) continue;
    const h = H(k);
    let s3 = 0;
    let s1 = 0;
    let vus = 0;
    for (let j = 0; j < P; j++) {
      if (!(vu(k, j) && vu(k - 1, j) && vu(k - 2, j) && vu(k - 3, j))) continue;
      vus++;
      for (let c = 0; c < 2; c++) {
        const x0 = s.monde[2 * P * k + 2 * j + c]! / h;
        const x1 = s.monde[2 * P * (k - 1) + 2 * j + c]! / h;
        const x2 = s.monde[2 * P * (k - 2) + 2 * j + c]! / h;
        const x3 = s.monde[2 * P * (k - 3) + 2 * j + c]! / h;
        const t3 = x0 - 3 * x1 + 3 * x2 - x3;
        s3 += t3 * t3;
        s1 += (x0 - x1) * (x0 - x1);
      }
    }
    if (vus === 0) continue;
    d3[k] = Math.sqrt(s3 / vus);
    d1[k] = Math.sqrt(s1 / vus);
  }
  // Sauts de pose. Trois formes :
  // - marche : une image se déplace bien plus que ses voisines (téléportation, la pose reste ailleurs) ;
  // - pic : une seule image part et revient (aller puis retour opposés, voisins calmes).
  // - demi-tour instantané : le miroir (`racine.flip`) bascule d'une image à l'autre sans passer par une échelle
  //   horizontale réduite (le dessin « saute » de profil gauche à profil droit).
  // Une attaque sèche (vitesse qui démarre d'un coup, position continue) n'est rien de tout cela.
  const sauts: number[] = [];
  const demiTours: number[] = [];
  const deplacement = (k: number, j: number): [number, number] => {
    const o = 2 * P * k + 2 * j;
    return [(s.monde[o]! - s.monde[o - 2 * P]!) / H(k), (s.monde[o + 1]! - s.monde[o + 1 - 2 * P]!) / H(k)];
  };
  for (let k = 1; k < n; k++) {
    const d = dMax[k]!;
    if (!Number.isFinite(d) || d < R.sautMinimum || s.gel[k]) continue;
    const avant = Number.isFinite(dMax[k - 1]!) ? dMax[k - 1]! : 0;
    const apres = k + 1 < n && Number.isFinite(dMax[k + 1]!) ? dMax[k + 1]! : 0;
    if (d >= R.sautRapport * Math.max(avant, apres, 1e-6)) {
      sauts.push(s.images[k]!);
      if (s.bascule[k]) demiTours.push(s.images[k]!);
      continue;
    }
    if (k + 1 >= n || !lie(k + 1, k)) continue;
    const calme = (i: number): number => (i >= 1 && i < n && Number.isFinite(dMax[i]!) ? dMax[i]! : 0);
    for (let j = 0; j < P; j++) {
      if (!(vu(k - 1, j) && vu(k, j) && vu(k + 1, j))) continue;
      const [ax, ay] = deplacement(k, j);
      const [bx, by] = deplacement(k + 1, j);
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      if (la < R.sautMinimum || lb < 0.5 * la) continue;
      if (ax * bx + ay * by > -0.5 * la * lb) continue; // pas un aller-retour
      if (Math.max(calme(k - 1), calme(k + 2)) * R.sautRapport > la) continue;
      sauts.push(s.images[k]!);
      break;
    }
  }

  // Le tremblement mesure un défaut persistant : les fenêtres touchées par un saut isolé (déjà compté) l'ignorent.
  const prochesSauts = new Set<number>();
  for (const a of sauts) for (let d = -2; d <= 3; d++) prochesSauts.add(a + d);
  const presDunSaut = (k: number): boolean => prochesSauts.has(s.images[k]!);
  for (let k = 0; k < n; k++) if (Number.isFinite(d3[k]!) && jeu(k) && !presDunSaut(k)) jerk.push(d3[k]! * fps * fps * fps);
  const W = Math.max(4, Math.round(R.fenetreTremblement * fps));
  const plancher = R.plancherTremblement / fps;
  const indices: number[] = [];
  for (let k = W - 1; k < n; k++) {
    let a3 = 0;
    let a1 = 0;
    let c = 0;
    for (let j = k - W + 1; j <= k; j++) {
      if (!Number.isFinite(d3[j]!) || !jeu(j) || presDunSaut(j)) continue;
      a3 += d3[j]! * d3[j]!;
      a1 += d1[j]! * d1[j]!;
      c++;
    }
    if (c < W * 0.75) continue;
    indices.push(Math.sqrt(a3 / c) / Math.max(Math.sqrt(a1 / c), plancher));
  }

  // Glissement des pieds posés
  let glissement: MesuresPersonnage['glissement'] = null;
  if (s.pieds) {
    const pieds = s.pieds;
    const glis: number[] = [];
    let appuis = 0;
    let derive = 0;
    for (let c = 0; c < 2; c++) {
      let debutAppui = -1;
      const hauteurPied = (k: number): number => (s.sol[k]! - pieds[4 * k + 2 * c + 1]!) / H(k) - s.piedsRepos[c]!;
      for (let k = 0; k < n; k++) {
        const pose = s.present[k] === 1 && s.gel[k] === 0 && s.retournement[k] === 0 && hauteurPied(k) < R.hauteurContact;
        if (!pose) {
          debutAppui = -1;
          continue;
        }
        if (debutAppui >= 0 && lie(k, k - 1)) {
          // Appui qui continue : tout déplacement du pied est un glissement.
          const dx = pieds[4 * k + 2 * c]! - pieds[4 * (k - 1) + 2 * c]!;
          const dy = pieds[4 * k + 2 * c + 1]! - pieds[4 * (k - 1) + 2 * c + 1]!;
          // Un glissement hors champ ne se voit pas : seules les images où la semelle est dans le cadre comptent.
          if (s.piedsALEcran![2 * k + c]) {
            glis.push(Math.hypot(dx, dy) * s.pxParUnite[k]!);
            const ex = pieds[4 * k + 2 * c]! - pieds[4 * debutAppui + 2 * c]!;
            const ey = pieds[4 * k + 2 * c + 1]! - pieds[4 * debutAppui + 2 * c + 1]!;
            derive = Math.max(derive, Math.hypot(ex, ey) / H(k));
          }
        } else {
          debutAppui = k;
          appuis++;
        }
      }
    }
    glissement = { appuis, imagesAppui: glis.length, p95: glis.length ? centile(glis, 95) : 0, max: glis.length ? Math.max(...glis) : 0, derive };
  }

  // Immobilité totale (corps ET visage), à l'écran, hors gel
  let immobiliteMax = 0;
  let immobiliteDebut: number | null = null;
  {
    let k0 = -1;
    let activiteCumul = 0;
    const clore = (k1: number): void => {
      if (k0 < 0) return;
      let compte = 0;
      for (let k = k0; k <= k1; k++) if (jeu(k)) compte++;
      const duree = compte / fps;
      if (duree > immobiliteMax) {
        immobiliteMax = duree;
        immobiliteDebut = s.images[k0]!;
      }
    };
    for (let k = 0; k < n; k++) {
      if (!s.present[k]) {
        clore(k - 1);
        k0 = -1;
        continue;
      }
      if (k0 < 0 || !lie(k, k0)) {
        clore(k - 1);
        k0 = k;
        activiteCumul = 0;
        continue;
      }
      activiteCumul += s.visage.activite[k]!;
      let ecart = 0;
      const h = H(k);
      for (let j = 0; j < P && ecart <= R.toleranceImmobile; j++) {
        if (!vu(k, j) || !vu(k0, j)) continue;
        const o = 2 * P * k + 2 * j;
        const o0 = 2 * P * k0 + 2 * j;
        ecart = Math.max(ecart, Math.hypot(s.monde[o]! - s.monde[o0]!, s.monde[o + 1]! - s.monde[o0 + 1]!) / h);
      }
      if (ecart > R.toleranceImmobile || activiteCumul > R.toleranceVisage) {
        clore(k - 1);
        k0 = k;
        activiteCumul = 0;
      }
    }
    clore(n - 1);
  }

  // Clignements : paupières qui passent de < 0,3 à > 0,7.
  let clignements = 0;
  {
    let ouvert = true;
    for (let k = 0; k < n; k++) {
      if (!s.present[k]) continue;
      const p = s.visage.paupiere[k]!;
      if (ouvert && p > 0.7) {
        clignements++;
        ouvert = false;
      } else if (!ouvert && p < 0.3) ouvert = true;
    }
  }

  let presentes = 0;
  let aLEcran = 0;
  let enJeu = 0;
  for (let k = 0; k < n; k++) {
    if (s.present[k]) presentes++;
    if (s.present[k] && s.aLEcran[k]) aLEcran++;
    if (jeu(k)) enJeu++;
  }
  const dureeALEcran = aLEcran / fps;
  return {
    id: s.id,
    imagesPresentes: presentes,
    dureeALEcran,
    dureeJeu: enJeu / fps,
    energieJeu: moyenne(vj),
    energieTotale: moyenne(vm),
    partMouvementFranc: vx.length ? vx.filter((v) => v >= R.vitesseFranche).length / vx.length : 0,
    vitesseAngulaire: moyenne(garder(vAng)),
    vitesseRacine: moyenne(garder(vRac)),
    vitesseMaxP99: centile(vx, 99),
    vitesseMax: vx.length ? Math.max(...vx) : Number.NaN,
    jerkP50: centile(jerk, 50),
    jerkP95: centile(jerk, 95),
    jerkP99: centile(jerk, 99),
    tremblementP95: centile(indices, 95),
    tremblementMax: indices.length ? Math.max(...indices) : Number.NaN,
    passageMouMax,
    passageMouDebut,
    sauts,
    demiTours,
    glissement,
    immobiliteMax,
    immobiliteDebut,
    clignements,
    clignementsParMinute: dureeALEcran > 0 ? (clignements / dureeALEcran) * 60 : 0,
    nonFinis: s.nonFinis,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Synchro labiale
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Parole d'un personnage, en temps absolu. */
export interface ParolePersonnage {
  /** Intervalles de parole (répliques). */
  repliques: Array<{ debut: number; fin: number }>;
  /** Phonèmes horodatés (absolus). */
  phonemes: Array<{ debut: number; fin: number; ph: string }>;
  /** Enveloppe RMS de la voix, une valeur par image ABSOLUE (index = numéro d'image). */
  enveloppe?: Float64Array;
}

/** Mesures de synchro labiale d'un locuteur. */
export interface MesuresLevres {
  id: string;
  imagesParole: number;
  /** Ouverture moyenne et écart-type pendant la parole (la bouche doit bouger). */
  ouvertureMoyenne: number;
  ouvertureEcartType: number;
  /** Ouverture moyenne hors parole (informatif). */
  ouvertureHorsParole: number;
  /** M/B/P : phonèmes où la bouche se ferme (ouverture ≤ 0,12) au moins une image. */
  fermeturesMBP: { total: number; fermees: number };
  /** Corrélation ouverture ↔ énergie de la voix, au meilleur décalage (images ; > 0 = la bouche précède). */
  correlation: number | null;
  decalage: number | null;
}

const EST_MBP = /^(m|b|p)(ː)?$/i;

/** Mesure la synchro labiale d'un personnage. */
export function mesurerLevres(s: SeriePersonnage, parole: ParolePersonnage, decalageMax = 4): MesuresLevres {
  const { n, fps } = s;
  const enParole = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    if (!s.present[k] || !s.aLEcran[k]) continue;
    const t = s.t[k]!;
    if (parole.repliques.some((r) => t >= r.debut && t < r.fin)) enParole[k] = 1;
  }
  const o: number[] = [];
  const hors: number[] = [];
  for (let k = 0; k < n; k++) {
    if (!s.present[k]) continue;
    if (enParole[k]) o.push(s.visage.ouverture[k]!);
    else hors.push(s.visage.ouverture[k]!);
  }
  const m = moyenne(o);
  const et = o.length ? Math.sqrt(moyenne(o.map((x) => (x - m) * (x - m)))) : Number.NaN;
  // Fermetures M/B/P
  let total = 0;
  let fermees = 0;
  for (const ph of parole.phonemes) {
    if (!EST_MBP.test(ph.ph.trim())) continue;
    let min = Infinity;
    let vu = false;
    for (let k = 0; k < n; k++) {
      if (!s.present[k] || !s.aLEcran[k]) continue;
      const t = s.t[k]!;
      if (t >= ph.debut - 1 / fps && t <= ph.fin + 1 / fps) {
        vu = true;
        min = Math.min(min, s.visage.ouverture[k]!);
      }
    }
    if (!vu) continue;
    total++;
    if (min <= 0.12) fermees++;
  }
  // Corrélation avec l'énergie de la voix
  let correlationMax: number | null = null;
  let decalage: number | null = null;
  if (parole.enveloppe) {
    const env = parole.enveloppe;
    const niveau = (i: number): number => (i >= 0 && i < env.length ? Math.log10(1e-4 + env[i]!) : -4);
    for (let L = -decalageMax; L <= decalageMax; L++) {
      const a: number[] = [];
      const b: number[] = [];
      for (let k = 0; k < n; k++) {
        if (!enParole[k]) continue;
        a.push(s.visage.ouverture[k]!);
        b.push(niveau(s.images[k]! + L));
      }
      const r = correlation(a, b);
      if (Number.isFinite(r) && (correlationMax === null || r > correlationMax)) {
        correlationMax = r;
        decalage = L;
      }
    }
  }
  return {
    id: s.id,
    imagesParole: o.length,
    ouvertureMoyenne: m,
    ouvertureEcartType: et,
    ouvertureHorsParole: moyenne(hors),
    fermeturesMBP: { total, fermees },
    correlation: correlationMax,
    decalage,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Caméra
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Intervalle où un mouvement de caméra rapide est voulu. */
export interface ExclusionCamera {
  debut: number;
  fin: number;
  /** `deplacement` : vitesse du centre non limitée (filé) ; `zoom` : vitesse de zoom non limitée (punch-in). */
  type: 'deplacement' | 'zoom' | 'tout';
}

/** Mesures de la caméra. */
export interface MesuresCamera {
  /** Vitesse du centre en hauteurs d'écran par seconde (hors exclusions). */
  vitesseMax: number;
  vitesseP95: number;
  /** Vitesse de zoom |d ln(zoom)/dt| (1/s, hors exclusions). */
  zoomMax: number;
  /** Vitesse de roulis (rad/s). */
  rotationMax: number;
  /** Indice de tremblement du centre (hors tremblement voulu, qui est séparé dans l'état). */
  tremblementP95: number;
  /** Images où la caméra saute dans un plan. */
  sauts: number[];
  nonFinis: number;
}

/** Mesure la caméra. */
export function mesurerCamera(c: SerieCamera, exclusions: readonly ExclusionCamera[] = [], reglages: Partial<ReglagesMesures> = {}): MesuresCamera {
  const R = { ...REGLAGES_MESURES, ...reglages };
  const { n, fps } = c;
  const exclu = (k: number, type: 'deplacement' | 'zoom'): boolean =>
    exclusions.some((e) => (e.type === type || e.type === 'tout') && c.t[k]! >= e.debut - 0.1 && c.t[k]! <= e.fin + 0.1);
  const v: number[] = [];
  const z: number[] = [];
  const r: number[] = [];
  const d = new Float64Array(n).fill(Number.NaN);
  for (let k = 1; k < n; k++) {
    if (c.segment[k] !== c.segment[k - 1]) continue;
    const zm = (c.zoom[k]! + c.zoom[k - 1]!) / 2;
    const dep = Math.hypot(c.centre[2 * k]! - c.centre[2 * k - 2]!, c.centre[2 * k + 1]! - c.centre[2 * k - 1]!) * zm;
    d[k] = dep;
    if (!exclu(k, 'deplacement')) v.push(dep * fps);
    if (!exclu(k, 'zoom')) z.push(Math.abs(Math.log(c.zoom[k]! / c.zoom[k - 1]!)) * fps);
    r.push(Math.abs(c.rotation[k]! - c.rotation[k - 1]!) * fps);
  }
  const sauts: number[] = [];
  for (let k = 1; k < n; k++) {
    const x = d[k]!;
    if (!Number.isFinite(x) || x < 0.04 || exclu(k, 'deplacement')) continue;
    const a = Number.isFinite(d[k - 1]!) ? d[k - 1]! : 0;
    const b = k + 1 < n && Number.isFinite(d[k + 1]!) ? d[k + 1]! : 0;
    if (x >= R.sautRapport * Math.max(a, b, 1e-6)) sauts.push(c.images[k]!);
  }
  // Tremblement du centre (en hauteurs d'écran)
  const W = Math.max(4, Math.round(R.fenetreTremblement * fps));
  const plancher = 0.01 / fps;
  const d3 = new Float64Array(n).fill(Number.NaN);
  const d1 = new Float64Array(n).fill(Number.NaN);
  for (let k = 3; k < n; k++) {
    if (c.segment[k] !== c.segment[k - 3]) continue;
    let s3 = 0;
    let s1 = 0;
    for (let a = 0; a < 2; a++) {
      const x = (j: number): number => c.centre[2 * j + a]! * c.zoom[k]!;
      const t3 = x(k) - 3 * x(k - 1) + 3 * x(k - 2) - x(k - 3);
      s3 += t3 * t3;
      s1 += (x(k) - x(k - 1)) ** 2;
    }
    d3[k] = Math.sqrt(s3);
    d1[k] = Math.sqrt(s1);
  }
  const indices: number[] = [];
  for (let k = W - 1; k < n; k++) {
    let a3 = 0;
    let a1 = 0;
    let m = 0;
    for (let j = k - W + 1; j <= k; j++) {
      if (!Number.isFinite(d3[j]!) || exclu(j, 'deplacement') || exclu(j, 'zoom')) continue;
      a3 += d3[j]! ** 2;
      a1 += d1[j]! ** 2;
      m++;
    }
    if (m < W * 0.75) continue;
    indices.push(Math.sqrt(a3 / m) / Math.max(Math.sqrt(a1 / m), plancher));
  }
  return {
    vitesseMax: v.length ? Math.max(...v) : 0,
    vitesseP95: v.length ? centile(v, 95) : 0,
    zoomMax: z.length ? Math.max(...z) : 0,
    rotationMax: r.length ? Math.max(...r) : 0,
    tremblementP95: indices.length ? centile(indices, 95) : 0,
    sauts,
    nonFinis: c.nonFinis,
  };
}
