/**
 * LA VIE DE TOUTE LA SCÈNE — one motion system for everything a picture contains (16/10: « il faut tout généraliser : le
 * mouvement de l'arrière-plan, des personnages de l'arrière-plan, des personnages en avant-plan, les objets, les
 * animaux, tout »). Nothing is animated « by hand »: every element found in a scene (scene parser classes, detector
 * instances, validated skeletons) gets a MOTION CLASS, and every class has ONE motion model, driven by the SAME wind and
 * the same clock, with amplitudes that shrink with depth and a fluidity cap (a calm frame moves its background by less
 * than half a pixel per frame, like the reference video 041701).
 *
 *  acteur      the puppet of the story (bodyMoves repertoire + directed body + guard)
 *  figurant    a person of the background: the SAME puppet and repertoire, at idle amplitude, with a deterministic
 *              schedule of small actions (look around, nod, shift weight, wave now and then, dance on a market)
 *              — it answers the story's strong beats (a shout, a laugh) and is staged where the camera sees it
 *  animal      breath, head turns, tail sway, ears; a bird pecks and bobs; a dog wags; cattle chew and swish
 *  vegetation  sway in the wind (gusts), stronger at the tips (the mask's weight)
 *  tissu       flutter (curtains, flags, awnings, umbrellas, washing): faster and wider than leaves, same wind
 *  nuage       drift with the wind; their shadows run on the ground and on the characters
 *  eau         ripples and glints; a boat bobs and rolls
 *  fumee/feu   rise and curl / flicker
 *  vehicule    parked: still; engine on: a faint idle shake
 *  suspendu    pendulum sway (lamps, signs, kites)
 *  pose        still objects (furniture, pots): only light and shadows change on them
 *  bati / sol  never move
 * Labels come from the detector (COCO names: MediaPipe ObjectDetector) or the scene parser (ADE20K names); a label
 * nobody knows is classed `pose` (still) — a mistake can only freeze something, never make a wall wave. Pure and
 * deterministic: the same element at the same time always gives the same motion (frame-exact rendering, any order).
 */
import { MOVES, type MoveCue, type MoveName } from './bodyMoves';

export type MotionClass = 'acteur' | 'figurant' | 'animal' | 'oiseau' | 'vegetation' | 'tissu' | 'nuage' | 'ciel' | 'eau' | 'bateau' | 'fumee' | 'feu' | 'vehicule' | 'suspendu' | 'pose' | 'bati' | 'sol';

/** Detector (COCO) and scene-parser (ADE20K) names → motion class. Unknown → 'pose'. */
const LABELS: [MotionClass, string[]][] = [
  ['figurant', ['person']],
  ['oiseau', ['bird', 'chicken', 'hen', 'rooster', 'duck', 'pigeon']],
  ['animal', ['animal', 'dog', 'cat', 'horse', 'sheep', 'cow', 'goat', 'elephant', 'bear', 'zebra', 'giraffe', 'donkey', 'camel', 'pig']],
  ['vegetation', ['tree', 'plant', 'palm', 'potted plant', 'grass', 'flower', 'bush', 'hedge']],
  ['tissu', ['curtain', 'flag', 'awning', 'umbrella', 'tent', 'canopy', 'banner', 'blind', 'clothes', 'towel', 'kite']],
  ['nuage', ['cloud']],
  ['ciel', ['sky']],
  ['eau', ['water', 'sea', 'river', 'lake', 'swimming pool', 'fountain', 'waterfall']],
  ['bateau', ['boat', 'ship']],
  ['fumee', ['smoke', 'steam']],
  ['feu', ['fire', 'fireplace', 'candle', 'torch']],
  ['vehicule', ['car', 'bus', 'truck', 'van', 'motorcycle', 'minibike', 'bicycle', 'train', 'airplane', 'taxi']],
  ['suspendu', ['lamp', 'chandelier', 'light', 'signboard', 'sconce']],
  ['bati', ['wall', 'building', 'house', 'roof', 'hut', 'door', 'window', 'windowpane', 'column', 'fence', 'railing', 'stairs', 'skyscraper', 'bridge', 'tower']],
  ['sol', ['floor', 'road', 'earth', 'ground', 'sand', 'sidewalk', 'path', 'field', 'dirt track', 'rug', 'rock', 'mountain']],
];
const LABEL_INDEX = new Map<string, MotionClass>(LABELS.flatMap(([c, ls]) => ls.map((l) => [l, c] as [string, MotionClass])));
export function classOf(label: string): MotionClass {
  return LABEL_INDEX.get(label.trim().toLowerCase()) ?? 'pose';
}

/**
 * Cross-check of a detector instance with the scene parser (pixel classes inside its box) and the pose detector: an
 * « umbrella » that sits on a roof is a roof (static); a « person » without a skeleton stays still rather than waving
 * a wrong limb; an « umbrella » with a body is a person. Returns the class that may be animated, or 'pose'.
 */
export function validateInstance(i: { label: string; parsed?: Record<string, number>; skeleton?: boolean }): MotionClass {
  const cls = classOf(i.label);
  const p = i.parsed ?? {};
  const share = (names: string[]) => names.reduce((s, n) => s + (p[n] ?? 0), 0);
  if (i.skeleton && share(['person']) > 0.15) return 'figurant';
  if (cls === 'figurant') return i.skeleton ? 'figurant' : 'pose';
  if (cls === 'tissu' && share(['house', 'building', 'roof', 'hut', 'wall']) > 0.35) return 'bati';
  if ((cls === 'animal' || cls === 'oiseau') && share(['animal', 'bird']) < 0.1 && share(['person']) > 0.4) return i.skeleton ? 'figurant' : 'pose';
  return cls;
}

/** THE wind of the scene: a slow gust envelope and a direction (+1 = towards the right of the picture). */
export interface Wind {
  dir: 1 | -1;
  strength: number;
}
export function gust(t: number, w: Wind = { dir: 1, strength: 1 }): number {
  return w.strength * (0.65 + 0.35 * Math.sin(t * 0.45) * Math.sin(t * 0.23 + 1.3));
}

/** Deterministic hash → [0, 1) of an element id (phases and schedules differ between elements, never between renders). */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}
const rnd = (seed: number, k: number) => { const x = Math.sin(seed * 9301 + k * 49297) * 233280; return x - Math.floor(x); };

/**
 * On-screen amplitude cap: pixels per metre at the element's depth (focal f in px), times the model's metres, capped so
 * that a background element never moves more than `maxPxPerFrame` between two frames at `fps`.
 */
export function screenAmplitude(metres: number, depthM: number, focalPx: number, o: { maxPxPerFrame?: number; fps?: number; freqHz?: number } = {}): number {
  const px = (metres * focalPx) / Math.max(0.5, depthM);
  const vmax = (o.maxPxPerFrame ?? 0.5) * (o.fps ?? 30);              // px / s allowed
  const speed = 2 * Math.PI * (o.freqHz ?? 0.5) * px;                  // peak speed of a sine of this amplitude
  return speed > vmax ? (px * vmax) / speed : px;
}

export interface ElementMotion {
  /** Picture-plane offset (metres at the element) for rigid sways, bobs, drifts. */
  dx: number;
  dy: number;
  /** Rotation (radians) about the element's anchor (pendulum, roll, tail). */
  rot: number;
  /** Uniform scale breath (1 = none). */
  scale: number;
  /** Flicker / glint brightness factor (1 = none). */
  light: number;
  /** For puppets (acteur / figurant): the repertoire movements to play now. */
  cues: MoveCue[];
  /** For animals: named sub-motions (head pitch, tail angle, peck depth), radians or metres. */
  parts: Record<string, number>;
}
const still = (): ElementMotion => ({ dx: 0, dy: 0, rot: 0, scale: 1, light: 1, cues: [], parts: {} });

/** The idle actions a background person picks from (all played by the rig: no drawing needed). */
export const FIGURANT_ACTIONS: MoveName[] = ['tournerTete', 'hocher', 'pencherTete', 'respirer', 'hausser', 'baisserTete', 'leverTete', 'danser', 'saluer', 'gratterTete', 'mainsHanches', 'rebondir'];

/** A strong beat of the story that the background SEES (a shout, the punchline, a laugh) and the move it answers with. */
export interface StoryBeat {
  t: number;
  move: MoveName;
  w?: number;
}

/**
 * Deterministic schedule of a figurant: every 3.5–8 s one action from its repertoire (busier on a market or a party);
 * breathing all the time. The background LISTENS to the story (16/10, director review): at each strong beat every
 * figurant answers with the beat's move after its own reaction time (0.15–0.6 s, so a crowd never moves in unison);
 * an idle action that would overlap a reaction is never started (no action is ever cut in the middle). Returns the
 * cues active at t.
 */
export function figurantCues(id: string, t: number, o: { busy?: number; actions?: MoveName[]; reactions?: StoryBeat[] } = {}): MoveCue[] {
  const seed = seedOf(id), acts = o.actions ?? FIGURANT_ACTIONS, busy = o.busy ?? 1;
  const cues: MoveCue[] = [{ name: 'respirer', u: ((t / 3.4 + seed) % 1 + 1) % 1, w: 0.8 }];
  const reacts = (o.reactions ?? []).map((b, i) => {
    const start = b.t + 0.15 + 0.45 * rnd(seed, 900 + i);
    return { ...b, start, end: start + MOVES[b.move].dur };
  });
  const r = reacts.find((x) => t >= x.start && t < x.end);
  if (r) {
    cues.push({ name: r.move, u: (t - r.start) / (r.end - r.start), w: r.w ?? 0.8 });
    return cues;
  }
  let start = rnd(seed, 0) * 3;
  for (let k = 0; start < t + 10 && k < 400; k++) {
    const name = acts[Math.floor(rnd(seed, k + 1) * acts.length)]!;
    const dur = MOVES[name].dur * (0.9 + 0.4 * rnd(seed, k + 101));
    const clash = reacts.some((x) => start < x.end && x.start < start + dur);
    if (!clash && t >= start && t < start + dur) cues.push({ name, u: (t - start) / dur, w: 0.55 + 0.25 * rnd(seed, k + 202) });
    start += dur + (3.5 + 4.5 * rnd(seed, k + 303)) / busy;
  }
  return cues;
}

/** Screen box [x0, y0, x1, y1] in pixels (y down). */
export type Box = [number, number, number, number];
export interface StageSpot {
  /** where the spot is on the painted picture (0..1) */
  u: number;
  v: number;
  /** distance from the camera, metres */
  depth: number;
}
export interface StageExtra {
  id: string;
  kind: 'personne' | 'animal';
  heightM: number;
  widthM: number;
  /** its painted spot (where the picture shows it); none for a figurant brought in from the troupe's own cast (clean
   *  cut-out of a character of the owner's galleries): it is placed in the field or absent from the film */
  painted?: StageSpot;
  /** depth to aim for when there is no painted spot (default: the farthest free spot behind the actors) */
  preferDepth?: number;
  /** height of the cut-out in its SOURCE pixels: on screen it may not be blown up past maxMagnify (a painted villager
   *  of 120 px pulled to the foreground becomes a blurred smudge next to sharp actors — director review 16/10) */
  sourcePx?: number;
  /** false for a body the cut-out does not show whole (seated, cut by an object or the picture's edge): it can only
   *  stay where the painting put it — moved, it would be half a person standing on the ground */
  movable?: boolean;
  /** real drawn extent around the feet, metres (left < 0 < right, top = height): when given, boxes use it */
  extent?: { left: number; right: number; top: number };
}
export interface StagePlacement {
  id: string;
  /** null: a cast figurant with no free spot (not in the film) */
  spot: StageSpot | null;
  moved: boolean;
  box: Box | null;
  reason: string;
}

/** Quality of a cut-out (RGBA pixels), measured on its pixels — the test that would have caught v4's villagers (a
 *  child whose head was cut flat by the detector's box, a seated woman cut flat at the waist, wedges of ground carried
 *  along): a side is CUT when the opaque silhouette runs along that edge of the image (outer 2 px band; a head apex or
 *  two feet touch it on a few pixels only). `ground` (optional) gives the colours of the set around the element: an
 *  opaque region touching the silhouette's border with one of those colours is a chunk of set carried along. */
export function cutoutQuality(rgba: ArrayLike<number>, w: number, h: number, o: { ground?: [number, number, number][]; tol?: number } = {}): { clipped: ('haut' | 'bas' | 'gauche' | 'droite')[]; chunk: number; straight: boolean; ok: boolean; reasons: string[] } {
  const A = (x: number, y: number) => rgba[(y * w + x) * 4 + 3]! >= 128;
  const band = (side: 'haut' | 'bas' | 'gauche' | 'droite') => {
    let n = 0;
    const len = side === 'haut' || side === 'bas' ? w : h;
    for (let k = 0; k < 2; k++) for (let i = 0; i < len; i++) {
      const [x, y] = side === 'haut' ? [i, k] : side === 'bas' ? [i, h - 1 - k] : side === 'gauche' ? [k, i] : [w - 1 - k, i];
      if (x >= 0 && y >= 0 && x < w && y < h && A(x, y)) n++;
    }
    return n / Math.max(1, 2 * len);
  };
  // the feet stand on the bottom edge (two feet ≈ 15–35 % of the width); a body cut at the waist runs along most of it
  const lim = { haut: 0.08, gauche: 0.08, droite: 0.08, bas: 0.45 } as const;
  const clipped = (['haut', 'bas', 'gauche', 'droite'] as const).filter((s) => band(s) > lim[s]);
  // a STRAIGHT CUT inside the picture (a neighbour's hand cut by the gallery's crop, a body cut by the detector's box
  // then padded): a matte's outline is soft (partly transparent pixels), a crop is a HARD step (opaque next to empty);
  // a hard step that stays on the very same column over ≥ 8 % of the height, or the same row over ≥ 30 % of the width
  // above the feet, is a cut — a drawn outline is never both hard and pixel-straight that long
  const al = (x: number, y: number) => rgba[(y * w + x) * 4 + 3]!;
  const hard = (x: number, y: number, x2: number, y2: number) => al(x, y) >= 240 && al(x2, y2) <= 10;
  let straight = 0;
  const vRun = Math.max(8, Math.round(0.08 * h)), hRun = Math.max(8, Math.round(0.3 * w));
  let ys = h, ye = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (A(x, y)) { ys = Math.min(ys, y); ye = Math.max(ye, y); }
  for (let x = 1; x < w && !straight; x++) {
    let rl = 0, rr = 0;
    for (let y = 0; y < h; y++) {
      rl = hard(x, y, x - 1, y) ? rl + 1 : 0;
      rr = hard(x - 1, y, x, y) ? rr + 1 : 0;
      if (rl >= vRun || rr >= vRun) { straight = 1; break; }
    }
  }
  const feetFrom = ye - 0.06 * (ye - ys);
  for (let y = 1; y < h && !straight; y++) {
    if (y >= feetFrom) break;
    let rt = 0, rb = 0;
    for (let x = 0; x < w; x++) {
      rt = hard(x, y, x, y - 1) ? rt + 1 : 0;
      rb = hard(x, y - 1, x, y) ? rb + 1 : 0;
      if (rt >= hRun || rb >= hRun) { straight = 1; break; }
    }
  }
  let chunk = 0;
  if (o.ground?.length) {
    const tol = (o.tol ?? 26) ** 2;
    let opaque = 0, near = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!A(x, y)) continue;
      opaque++;
      // only the silhouette's rim (a transparent pixel within 3 px): a chunk of ground hangs on the outline
      let rim = false;
      for (let dy = -3; dy <= 3 && !rim; dy++) for (let dx = -3; dx <= 3; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h || !A(xx, yy)) { rim = true; break; } }
      if (!rim) continue;
      const i = (y * w + x) * 4, r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
      if (o.ground.some(([R, G, B]) => (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2 <= tol)) near++;
    }
    chunk = near / Math.max(1, opaque);
  }
  const reasons = [...clipped.map((s) => `corps coupé net au bord ${s === 'haut' ? 'du haut' : s === 'bas' ? 'du bas' : s === 'gauche' ? 'gauche' : 'droit'}`), ...(straight ? ['coupe droite dans la silhouette (morceau coupé par un cadre)'] : []), ...(chunk > 0.06 ? [`morceaux de décor emportés (${Math.round(100 * chunk)} %)`] : [])];
  return { clipped, chunk, straight: !!straight, ok: reasons.length === 0, reasons };
}

/**
 * FIGURATION — a director places the background people where the camera SEES them (16/10, director review: the 9:16
 * frame keeps a third of a 2:1 painting, so every animated villager of the village stood outside the frame and the
 * visible background was empty). Generic rule, for any set and any shot list:
 *  - an extra whose painted spot is fully in the wide shot, readable and free stays there (the painting is right);
 *  - otherwise it is moved to a ground spot of the visible background: whole body in frame (margins), readable size,
 *    behind the actors (minDepth), never over an actor's HEAD nor in the corridor of their gazes (keepOut: no tangent,
 *    nothing competes with the faces), partly hidden by an actor's body at most (occluders: at least minVisible of it
 *    stays seen, as in any staging in depth); IN FRONT of the actors (closer than actorDepth: a hen in the foreground)
 *    nothing may cover any part of them; never over another extra; among the free spots the one closest to its
 *    painted depth (same scale relation to the set) and farthest from the centre of the action;
 *  - at most maxPersons people and maxAnimals animals in frame (a dialogue scene keeps a calm background);
 *  - no free spot → it stays painted where it was, and the reason is given;
 *  - (director review of v4, 16/10) a painted villager is moved only if its cut-out is CLEAN (cutoutQuality: no body
 *    cut flat by the crop, no chunk of ground carried along) and never blown up past maxMagnify of its source pixels;
 *    a figurant of the troupe's cast (clean, sharp, same style as the actors) has no painted spot: placed or absent.
 * `project` turns a spot and a body size into its screen box in the shot (null when behind the camera).
 */
export function stageFigurants(o: {
  frame: { w: number; h: number };
  extras: StageExtra[];
  spots: StageSpot[];
  /** the extra is passed too: a renderer can use its real drawn extent (an off-centre cut-out is not a centred box) */
  project: (s: StageSpot, heightM: number, widthM: number, e?: StageExtra) => Box | null;
  keepOut: Box[];
  occluders?: Box[];
  minVisible?: number;
  /** distance of the actors: a spot closer than this is IN FRONT of them and may not cover them at all */
  actorDepth?: number;
  /** what an element in front may never touch (default: occluders) — e.g. the union of the actors' bodies over the
   *  whole shot, gestures included, when occluders are typical (median) bodies */
  frontKeepOut?: Box[];
  minDepth: { personne: number; animal: number };
  minPx?: { personne: number; animal: number };
  margin?: number;
  maxPersons?: number;
  maxAnimals?: number;
  /** any other rule of the book the spot must obey (e.g. not cut by the edge of the OTHER shots); false = refused */
  allow?: (s: StageSpot, heightM: number, widthM: number, e?: StageExtra) => boolean;
  /** largest blow-up of a cut-out's source pixels on screen (rule figuration.resolution, default 1.35) */
  maxMagnify?: number;
}): StagePlacement[] {
  const { w, h } = o.frame, m = o.margin ?? 0.04, minPx = o.minPx ?? { personne: 48, animal: 18 };
  const caps = { personne: o.maxPersons ?? 4, animal: o.maxAnimals ?? 2 };
  const inFrame = (b: Box) => b[0] >= m * w && b[2] <= (1 - m) * w && b[1] >= m * h && b[3] <= (1 - 0.02) * h;
  const hits = (a: Box, b: Box, pad: number) => a[0] - pad < b[2] && b[0] - pad < a[2] && a[1] - pad < b[3] && b[1] - pad < a[3];
  const inter = (a: Box, b: Box) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const occ = o.occluders ?? [], minVis = o.minVisible ?? 0.65;
  const seen = (b: Box) => { const area = Math.max(1, (b[2] - b[0]) * (b[3] - b[1])); return 1 - Math.min(1, occ.reduce((s, k) => s + inter(b, k), 0) / area); };
  const taken: Box[] = [];
  const count = { personne: 0, animal: 0 };
  const centre = o.occluders?.length ? o.occluders : o.keepOut;
  const cx = centre.length ? centre.reduce((s, b) => s + (b[0] + b[2]) / 2, 0) / centre.length : w / 2;
  // why spots are refused, per extra (the placement says it: « aucune place : 900 hors cadre, 300 visage… »)
  let why: Record<string, number> = {};
  const no = (k: string) => { why[k] = (why[k] ?? 0) + 1; return null; };
  const free = (e: StageExtra, s: StageSpot): Box | null => {
    if (s.depth < o.minDepth[e.kind]) return no('trop près');
    const b = o.project(s, e.heightM, e.widthM, e);
    if (!b || !inFrame(b)) return no('hors cadre');
    if (b[3] - b[1] < minPx[e.kind]) return no('trop petit');
    if (e.sourcePx && (b[3] - b[1]) / e.sourcePx > (o.maxMagnify ?? 1.35)) return no('trop agrandi');
    if (o.keepOut.some((k) => hits(b, k, 6))) return no('visage ou regards');
    if (taken.some((k) => hits(b, k, 8))) return no('autre figurant');
    if (o.actorDepth !== undefined && s.depth < o.actorDepth) { if ((o.frontKeepOut ?? occ).some((k) => hits(b, k, 6))) return no('devant un acteur'); }
    else if (seen(b) < minVis) return no('trop caché');
    if (o.allow && !o.allow(s, e.heightM, e.widthM, e)) return no('autre plan');
    return b;
  };
  // people first (they are what the eye reads), the larger first; then animals
  const order = [...o.extras].sort((a, b) => (a.kind === b.kind ? b.heightM - a.heightM : a.kind === 'personne' ? -1 : 1));
  const out: StagePlacement[] = [];
  // painted extras first when they already stand well in the field (the painting is right), then the others
  for (const e of order) {
    const stays = e.painted ? 'reste à sa place peinte' : 'absent du film';
    if (count[e.kind] >= caps[e.kind]) { out.push({ id: e.id, spot: e.painted ?? null, moved: false, box: null, reason: `fond déjà assez peuplé : ${stays}` }); continue; }
    why = {};
    const here = e.painted ? free(e, e.painted) : null;
    if (here) { taken.push(here); count[e.kind]++; out.push({ id: e.id, spot: e.painted!, moved: false, box: here, reason: 'déjà dans le champ, à sa place peinte' }); continue; }
    if (e.movable === false) { out.push({ id: e.id, spot: e.painted ?? null, moved: false, box: null, reason: `découpe incomplète ou sale (corps coupé, morceaux de décor) : on ne la déplace pas : ${stays}` }); continue; }
    why = {};
    const aim = e.painted?.depth ?? e.preferDepth;
    let best: { s: StageSpot; b: Box; score: number } | null = null;
    for (const s of o.spots) {
      const b = free(e, s);
      if (!b) continue;
      const score = (aim ? -Math.abs(Math.log(s.depth / aim)) : 0.02 * s.depth) + 0.6 * (Math.abs((b[0] + b[2]) / 2 - cx) / w);
      if (!best || score > best.score) best = { s, b, score };
    }
    if (!best) {
      const top = Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ');
      out.push({ id: e.id, spot: e.painted ?? null, moved: false, box: null, reason: `aucune place libre dans le champ (${top || 'aucun sol'}) : ${stays}` });
      continue;
    }
    taken.push(best.b); count[e.kind]++;
    out.push({ id: e.id, spot: best.s, moved: true, box: best.b, reason: `placé dans le champ, à ${best.s.depth.toFixed(1)} m${e.painted ? ` (peint à ${e.painted.depth.toFixed(1)} m)` : ' (figurant de la troupe)'}` });
  }
  return out;
}

/** The motion of one element at time t (metres / radians at the element; the renderer converts with depth). */
export function motionOf(el: { id: string; cls: MotionClass; heightM?: number; label?: string }, t: number, wind: Wind = { dir: 1, strength: 1 }): ElementMotion {
  const m = still();
  const s = seedOf(el.id), g = gust(t, wind), H = el.heightM ?? 1;
  const ph = 2 * Math.PI * s;
  switch (el.cls) {
    case 'acteur':
      return m; // the story drives the actor (bodyMoves + puppetMotion)
    case 'figurant':
      m.cues = figurantCues(el.id, t);
      return m;
    case 'oiseau': {
      // a hen pecks (head down fast, up slower), bobs the head while walking, flicks the tail
      const cycle = 1.6 + 1.2 * s, u = ((t / cycle + s) % 1 + 1) % 1;
      const peck = u < 0.12 ? Math.sin((Math.PI * u) / 0.12) : 0;
      m.parts = { peck: 0.6 * peck, headBob: 0.04 * H * Math.sin(2 * Math.PI * 2.2 * t + ph), tail: 0.15 * Math.sin(2 * Math.PI * 0.7 * t + ph) };
      m.dy = -0.01 * H * Math.abs(Math.sin(2 * Math.PI * 1.1 * t + ph));
      return m;
    }
    case 'animal': {
      const dog = el.label === 'dog';
      m.scale = 1 + 0.012 * Math.sin(2 * Math.PI * 0.35 * t + ph);
      m.parts = { tail: (dog ? 0.45 : 0.2) * Math.sin(2 * Math.PI * (dog ? 3 : 0.5) * t + ph), head: 0.08 * Math.sin(2 * Math.PI * 0.12 * t + ph) * Math.sin(t * 0.37 + ph), ear: 0.1 * Math.max(0, Math.sin(2 * Math.PI * 0.21 * t + 3 * ph)) };
      return m;
    }
    case 'vegetation':
      m.dx = wind.dir * 0.02 * H * g * (0.6 + 0.4 * Math.sin(1.9 * t + ph));
      m.dy = 0.006 * H * Math.sin(2.6 * t + ph);
      return m;
    case 'tissu':
      m.dx = wind.dir * 0.015 * H * g * (0.5 + 0.5 * Math.sin(4.1 * t + ph));
      m.rot = 0.04 * g * Math.sin(3.3 * t + 2 * ph);
      return m;
    case 'nuage':
      m.dx = wind.dir * 0.6 * t; // metres of cloud travel (the renderer converts to its own drift)
      return m;
    case 'eau':
      m.light = 1 + 0.06 * Math.sin(1.7 * t + ph) * Math.sin(0.9 * t + 2 * ph);
      return m;
    case 'bateau':
      m.dy = 0.03 * H * Math.sin(2 * Math.PI * 0.25 * t + ph);
      m.rot = 0.03 * Math.sin(2 * Math.PI * 0.18 * t + ph);
      return m;
    case 'fumee':
      m.dy = -0.25 * ((t + 10 * s) % 4);
      m.dx = wind.dir * 0.1 * g * ((t + 10 * s) % 4);
      return m;
    case 'feu':
      m.light = 1 + 0.12 * Math.sin(17 * t + ph) * Math.sin(7.3 * t + 2 * ph);
      return m;
    case 'suspendu':
      m.rot = 0.05 * g * Math.sin(2 * Math.PI * 0.5 * t + ph);
      return m;
    case 'vehicule':
    case 'pose':
    case 'bati':
    case 'sol':
    case 'ciel':
    default:
      return m;
  }
}

/** One line per element: what moves, how, and why not when it stays still (shown in the director's report). */
export function sceneLifeReport(els: { id: string; label: string; cls: MotionClass }[]): { moving: number; still: number; lines: string[] } {
  const why: Partial<Record<MotionClass, string>> = {
    acteur: 'joue la scène (répertoire du corps, garde anatomique)', figurant: 'figurant : même marionnette, petites actions programmées',
    animal: 'respire, tourne la tête, remue la queue', oiseau: 'picore, hoche la tête, remue la queue', vegetation: 'ondule au vent',
    tissu: 'flotte au vent', nuage: 'dérive au vent, ombre au sol', eau: 'reflets', bateau: 'tangue', fumee: 'monte et s’enroule', feu: 'vacille',
    suspendu: 'se balance', vehicule: 'immobile (moteur coupé)', pose: 'immobile : lumière et ombres seulement', bati: 'immobile', sol: 'immobile', ciel: 'fond',
  };
  const movingCls = new Set<MotionClass>(['acteur', 'figurant', 'animal', 'oiseau', 'vegetation', 'tissu', 'nuage', 'eau', 'bateau', 'fumee', 'feu', 'suspendu']);
  const moving = els.filter((e) => movingCls.has(e.cls)).length;
  return { moving, still: els.length - moving, lines: els.map((e) => `${e.id} (${e.label}) → ${e.cls} : ${why[e.cls] ?? 'immobile'}`) };
}
