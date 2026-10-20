/**
 * LIVRE DE RÈGLES DU RÉALISATEUR — les règles sont ÉCRITES D'AVANCE et vérifiées sur le plan du film AVANT le rendu
 * (16/10 : « tu es un supercalculateur, il faut anticiper les règles au lieu d'attendre les tests »). Le moteur génère
 * avec les mêmes seuils (placement des figurants, cadrage, rythme) ; ce livre prouve, sur le plan calculé, que rien n'a
 * échappé — cadre, regards, échelle, sol, ombres, montage, rythme mesuré sur la chaîne, comique, fluidité.
 *
 * Seuils et sources :
 *  - rythme : 6 vidéos « blague du jour » de la chaîne (blender/film/tone_reference.json) — tour de parole 0,26 s,
 *    silence avant la chute 0,31 s (p75 0,40 s), rire ≈ 4,7 s ;
 *  - montage : 12 TikTok de la chaîne (blender/film/tiktok_reference.json) — 8,4 à 23,2 plans par minute ;
 *  - comique : bible TIKTOK_BIBLE (tiktokComedy.ts) — chute ≤ 8 mots, le mot drôle en dernier, gros plan sur celui qui
 *    ment, plan à deux sur la chute, réaction de l'autre après chaque punch ;
 *  - cadre et regards : grammaire classique (règle des 180°, tiers, tangentes) ; figuration : stageFigurants ;
 *  - jeu comique (recherche du 16/10, research_notes/Style comique Afrikatoon Ladjagay Gbeze) : immobilité avant la chute
 *    (énergie de mouvement corrélée à moins de rire, r = −0,75 sur 90 spectacles), pose drôle tenue ≥ 8 images, au plus
 *    2 « prises » visibles (changement de dessin voulu en plein plan) par vidéo, coupes franches seulement.
 * Pur et déterministe : la page fournit le plan mesuré (boîtes à l'écran, répliques, plans, temps forts).
 */
export type Box = [number, number, number, number];

export interface PlanShot {
  t0: number;
  t1: number;
  /** PE plan d'ensemble / à deux, PA plan américain, PR plan rapproché, GP gros plan */
  size: string;
  subject: string;
  /** how many screen pixels one pixel of the painted set covers in this shot, and the defocus applied (blur px) */
  bgMagnify?: number;
  bgBlur?: number;
}
export interface PlanBody {
  id: string;
  /** peint = a villager painted in the set, never moved (part of the backdrop): checked for tangents, gazes, front */
  role: 'acteur' | 'figurant' | 'animal' | 'peint';
  box: Box;
  /** actors only: where the face is */
  head?: Box;
  depth: number;
  heightM: number;
  onGround: boolean;
  /** screen direction the drawing faces (+1 right, −1 left) */
  facing?: 1 | -1;
  /** cast shadow: ground direction (unit, x/z) and width ÷ height of the body */
  shadow?: { dir: [number, number]; widthRatio: number };
  /** actors: screen points of the hands (wrists and finger tips of the DEFORMED drawing) */
  hands?: [number, number][];
  /** actors: triangles of the deformed mesh folded over (orientation flipped vs the drawing) */
  folds?: number;
  /** actors: share of the outline's pixels carrying a green-screen fringe (green above both red and blue) */
  spill?: number;
  /** figurants: the cut-out — shown away from its painted place? clean? blow-up of its source pixels on screen */
  cutout?: { moved: boolean; clean: boolean; magnify: number; why?: string };
}
export interface PlanFrame {
  t: number;
  shot: number;
  bodies: PlanBody[];
}
export interface PlanLine {
  who: string;
  t0: number;
  t1: number;
  text: string;
  emotion: number;
  state: string;
  /** the punchline: when its punch phrase starts, and the silence just before it */
  punch?: { phrase: string; at: number; pauseBefore: number };
  /** silences inside the line (absolute seconds): a cut may fall in one of them */
  pauses?: [number, number][];
  /** a laugh (« Ha ha ha ! »), not a spoken line */
  laugh?: boolean;
}
export interface Plan {
  frame: { w: number; h: number };
  total: number;
  fixedCamera: boolean;
  shots: PlanShot[];
  frames: PlanFrame[];
  lines: PlanLine[];
  /** moments the background reacts to, with the move */
  beats: { t: number; move: string }[];
  /** drawing changes (a new drawing pops in); seen = the actor is in the frame at that instant */
  swaps: { who: string; t: number; seen?: boolean }[];
  /** largest movement of an actor's body (px per frame) during the stillness window just before the punch phrase */
  quietBeforePunch?: number;
  /** who lies / boasts (the target of the close-up) */
  liar?: string;
  /** top of the burnt-in subtitle band (px): actors stand above it in a wide shot, faces stay above it in a close one */
  subtitleTop?: number;
  /** every burnt-in text (subtitles, names, credit) with its screen box and when it shows */
  texts?: { id: string; t0: number; t1: number; box: Box }[];
  /** fade from black at the start (s): the first frame is the hook and the thumbnail, never a black picture */
  openingFade?: number;
}
export interface ChannelRef {
  turnGap: number;
  preBeat: number;
  preBeatP75: number;
  laugh: number;
  shotsPerMin: [number, number];
}
/** Measured on the channel (see header). */
export const CHANNEL: ChannelRef = { turnGap: 0.26, preBeat: 0.31, preBeatP75: 0.4, laugh: 4.73, shotsPerMin: [8.4, 23.2] };

export type Severity = 'bloquant' | 'avertissement';
export interface RuleDef {
  id: string;
  family: 'cadre' | 'regards' | 'échelle' | 'sol' | 'ombres' | 'montage' | 'rythme' | 'comique' | 'fluidité' | 'figuration' | 'image';
  rule: string;
  severity: Severity;
}
export interface Violation {
  rule: string;
  severity: Severity;
  at?: number;
  message: string;
}

/** Every rule, written before anything is rendered. */
export const RULES: RuleDef[] = [
  { id: 'cadre.acteurs-entiers', family: 'cadre', severity: 'bloquant', rule: 'dans un plan à deux, chaque acteur est entier dans le cadre (tête et pieds, marges 2–3 %)' },
  { id: 'cadre.pieds-tiers-bas', family: 'cadre', severity: 'avertissement', rule: 'plan à deux : les pieds des acteurs dans la moitié basse (50–88 % de la hauteur), pas une moitié de sol vide ni des acteurs qui flottent en haut' },
  { id: 'cadre.sous-titres', family: 'cadre', severity: 'bloquant', rule: 'les sous-titres ne couvrent jamais un acteur dans un plan large (acteurs au-dessus de la bande) ni un visage dans un plan serré' },
  { id: 'cadre.tangente-tete', family: 'cadre', severity: 'bloquant', rule: 'aucun figurant, animal ou objet ne touche le visage d’un acteur (pas de tangente, rien ne concurrence les visages)' },
  { id: 'cadre.regards-libres', family: 'cadre', severity: 'bloquant', rule: 'rien dans le couloir entre les deux visages qui se parlent' },
  { id: 'cadre.rien-devant', family: 'cadre', severity: 'bloquant', rule: 'rien de plus proche que les acteurs ne les recouvre' },
  { id: 'cadre.bord', family: 'cadre', severity: 'bloquant', rule: 'pas de morceau de figurant ou d’animal coupé au bord : entier (≥ 70 %) ou absent dans un plan large ; dans un plan serré, une partie coupée ne dépasse pas 5 % de l’image' },
  { id: 'cadre.fond-vivant', family: 'cadre', severity: 'avertissement', rule: 'chaque plan à deux montre au moins un figurant ou animal vivant, lisible (≥ 90 px) et vu aux deux tiers' },
  { id: 'regards.face-a-face', family: 'regards', severity: 'bloquant', rule: 'deux acteurs qui se parlent se font face (chaque dessin tourné vers l’autre)' },
  { id: 'regards.180', family: 'regards', severity: 'bloquant', rule: 'règle des 180° : chaque acteur garde son côté de l’écran d’un plan à l’autre' },
  { id: 'echelle.tailles', family: 'échelle', severity: 'bloquant', rule: 'adultes 1,45–1,95 m ; figurants entiers 1,1–2,0 m (proportion réelle au décor)' },
  { id: 'sol.pieds', family: 'sol', severity: 'bloquant', rule: 'tout ce qui marche a les pieds sur le sol praticable de la peinture' },
  { id: 'ombres.volume', family: 'ombres', severity: 'bloquant', rule: 'une ombre portée a l’épaisseur d’un corps (largeur ≥ 20 % de la taille), pas un trait' },
  { id: 'ombres.une-lumiere', family: 'ombres', severity: 'bloquant', rule: 'toutes les ombres partent dans la même direction (une seule lumière principale)' },
  { id: 'montage.cadence', family: 'montage', severity: 'avertissement', rule: 'plans par minute dans la plage mesurée de la chaîne (8,4–23,2)' },
  { id: 'montage.coupe-hors-mot', family: 'montage', severity: 'bloquant', rule: 'une coupe ne tombe jamais au milieu d’un mot : entre deux répliques, au début d’une réplique (±0,15 s) ou dans un silence de la voix' },
  { id: 'montage.saut-cache', family: 'montage', severity: 'avertissement', rule: 'un changement de dessin tombe sur une coupe ou hors champ ; au plus 1 changement visible par tranche de 6 s' },
  { id: 'comique.prises-max-2', family: 'comique', severity: 'avertissement', rule: 'au plus 2 « prises » (changement de dessin visible en plein plan) par vidéo' },
  { id: 'comique.tenue-8-images', family: 'comique', severity: 'bloquant', rule: 'chaque dessin tient au moins 8 images (0,27 s) avant d’être remplacé' },
  { id: 'comique.immobile-avant-chute', family: 'comique', severity: 'avertissement', rule: 'immobilité avant la chute : les corps bougent de moins de 1,5 px par image dans la demi-seconde qui précède la phrase de chute' },
  { id: 'rythme.accroche', family: 'rythme', severity: 'bloquant', rule: 'accroche : la 1re réplique commence avant 1,2 s et porte un conflit (! ou ?)' },
  { id: 'rythme.tour', family: 'rythme', severity: 'avertissement', rule: 'enchaînement serré : entre deux répliques, 0,26 s mesuré (toléré 0,1–0,6 s)' },
  { id: 'rythme.silence-chute', family: 'rythme', severity: 'bloquant', rule: 'silence avant la phrase de chute : 0,2–0,5 s (mesuré 0,31, p75 0,40)' },
  { id: 'rythme.rire', family: 'rythme', severity: 'avertissement', rule: 'après une chute forte, le rire tient 3,5–6 s (mesuré 4,7 s)' },
  { id: 'rythme.fin', family: 'rythme', severity: 'avertissement', rule: 'le film finit 0,8–3 s après la dernière réplique (réaction tenue, pas de coupure sèche)' },
  { id: 'comique.chute-courte', family: 'comique', severity: 'bloquant', rule: 'la phrase de chute tient en 8 mots au plus' },
  { id: 'comique.mot-final', family: 'comique', severity: 'bloquant', rule: 'le mot drôle en dernier : rien après la chute (pas de « hein », « quoi », « voilà »)' },
  { id: 'comique.escalade', family: 'comique', severity: 'avertissement', rule: 'escalade : la chute est la réplique la plus forte de la blague' },
  { id: 'comique.menteur-gros-plan', family: 'comique', severity: 'avertissement', rule: 'gros plan (PA ou plus serré) sur celui qui ment pendant son mensonge' },
  { id: 'comique.chute-a-deux', family: 'comique', severity: 'avertissement', rule: 'la réaction à la chute se voit à deux (plan d’ensemble) : l’autre est dans le cadre' },
  { id: 'comique.reaction', family: 'comique', severity: 'bloquant', rule: 'l’autre réagit (choc, rire) moins de 0,8 s après la chute' },
  { id: 'comique.fond-reagit', family: 'comique', severity: 'avertissement', rule: 'quand le fond est peuplé, il réagit à la chute (rire) et aux éclats (têtes tournées)' },
  { id: 'fluidite.camera-fixe', family: 'fluidité', severity: 'avertissement', rule: 'caméra immobile dans le plan (fluidité de la vidéo de référence) ; le mouvement passe par les coupes' },
  // revue image par image du film v4 (16/10, « tu n'as rien remarqué ? ») : ce que le livre ne mesurait pas encore
  { id: 'cadre.mains-entieres', family: 'cadre', severity: 'bloquant', rule: 'les mains d’un acteur restent dans le cadre (marge 1 %) : on ne coupe pas un geste au poignet' },
  { id: 'cadre.tetes-entieres', family: 'cadre', severity: 'bloquant', rule: 'la tête de tout acteur visible reste entière dans le cadre (revue du 16/10 : la tête de Modou coupée en haut dans le plan de Maman) — pas seulement celle du sujet du plan' },
  { id: 'cadre.taille-acteurs', family: 'cadre', severity: 'avertissement', rule: 'plan à deux : chaque acteur mesure au moins 30 % de la hauteur de l’image (visages lisibles sur un téléphone, pas une moitié d’image de sol vide)' },
  { id: 'figuration.decoupe-propre', family: 'figuration', severity: 'bloquant', rule: 'un figurant montré ailleurs qu’à sa place peinte a une découpe propre : corps entier (pas coupé net par la boîte du détecteur), sans morceau de décor emporté' },
  { id: 'figuration.resolution', family: 'figuration', severity: 'bloquant', rule: 'aucun figurant net agrandi à plus de 1,35 fois ses pixels d’origine (sinon tache floue à côté d’acteurs nets) ; dans un plan serré au fond flou, pas plus que le flou' },
  { id: 'image.lisere', family: 'image', severity: 'bloquant', rule: 'pas de liseré vert d’incrustation autour des acteurs (au plus 3 % du contour)' },
  { id: 'image.maillage', family: 'image', severity: 'bloquant', rule: 'aucun triangle du dessin déformé ne se replie (main pliée, pli en V, déchirure)' },
  { id: 'image.fond-agrandi', family: 'image', severity: 'bloquant', rule: 'dans un plan serré, un décor agrandi à plus de 1,6× est mis au flou (flou ≥ l’agrandissement, en px) : pas de pavés ni d’escaliers de pixels' },
  { id: 'montage.textes', family: 'montage', severity: 'bloquant', rule: 'deux textes incrustés ne se chevauchent jamais (générique, noms, sous-titres)' },
  { id: 'montage.premiere-image', family: 'montage', severity: 'bloquant', rule: 'la première image montre la scène (fondu d’ouverture ≤ 2 images) : c’est l’accroche et la miniature' },
];
const DEF = new Map(RULES.map((r) => [r.id, r]));

const inter = (a: Box, b: Box) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const area = (b: Box) => Math.max(1e-9, (b[2] - b[0]) * (b[3] - b[1]));
const cx = (b: Box) => (b[0] + b[2]) / 2;
const words = (s: string) => s.replace(/[!?.…,;:«»"]/g, ' ').split(/\s+/).filter(Boolean);
// plan large = ensemble, plan à deux, ou plan moyen EN PIED (format bande de la chaîne : on y voit les deux corps entiers —
// un figurant coupé au bord s'y voit comme dans un plan large, revue du 16/10)
const wide = (s: PlanShot) => s.size === 'PE' || s.size === 'PM' || s.subject === 'groupe';

/** cadre.bord, the same test for generation (stageFigurants veto) and for the check: in a wide shot an extra is whole
 *  (≥ 70 % inside) or absent; in a closer shot a part cut by the edge is allowed when it is small (≤ 5 % of the image),
 *  as background passers-by cut by a close-up's edge are in any film — never a big chunk of body at the border. */
export function edgeOk(b: Box, frame: { w: number; h: number }, wideShot: boolean): boolean {
  const inside = inter(b, [0, 0, frame.w, frame.h]), share = inside / area(b);
  if (share <= 0.02 || share >= 0.7) return true;
  return !wideShot && inside <= 0.05 * frame.w * frame.h;
}

/** Checks the whole plan against every rule. Returns the violations (empty = the film obeys the book). */
export function checkPlan(p: Plan, ref: ChannelRef = CHANNEL): Violation[] {
  const out: Violation[] = [];
  const v = (rule: string, message: string, at?: number) => out.push({ rule, severity: DEF.get(rule)!.severity, message, at });
  const { w, h } = p.frame;
  const actorsOf = (f: PlanFrame) => f.bodies.filter((b) => b.role === 'acteur');
  const sideOrder = new Map<string, string>();
  for (const f of p.frames) {
    // an element seen at ≤ 2 % (a few pixels at the edge) is not in the picture: it touches no face, hides nothing
    const shot = p.shots[f.shot]!, actors = actorsOf(f), allOthers = f.bodies.filter((b) => b.role !== 'acteur');
    const others = allOthers.filter((b) => inter(b.box, [0, 0, w, h]) / area(b.box) > 0.02);
    if (wide(shot)) {
      for (const a of actors) {
        if (a.box[0] < 0.02 * w || a.box[2] > 0.98 * w || a.box[1] < 0.03 * h || a.box[3] > 0.99 * h) v('cadre.acteurs-entiers', `${a.id} sort du cadre`, f.t);
        if (a.box[3] < 0.5 * h || a.box[3] > 0.88 * h) v('cadre.pieds-tiers-bas', `pieds de ${a.id} à ${Math.round((100 * a.box[3]) / h)} % de la hauteur`, f.t);
        if (p.subtitleTop !== undefined && a.box[3] > p.subtitleTop) v('cadre.sous-titres', `les sous-titres couvrent ${a.id} (pieds à ${Math.round(a.box[3])} px, bande à ${Math.round(p.subtitleTop)} px)`, f.t);
      }
      if (actors.length === 2) {
        const [A, B] = cx(actors[0]!.box) < cx(actors[1]!.box) ? [actors[0]!, actors[1]!] : [actors[1]!, actors[0]!];
        if (A.facing !== undefined && B.facing !== undefined && !(A.facing > 0 && B.facing < 0)) v('regards.face-a-face', `${A.id} et ${B.id} ne se font pas face`, f.t);
        if (A.head && B.head) {
          const corridor: Box = [A.head[2], Math.min(A.head[1], B.head[1]), B.head[0], Math.max(A.head[3], B.head[3])];
          for (const o of others) if (corridor[2] > corridor[0] && inter(o.box, corridor) > 0) v('cadre.regards-libres', `${o.id} dans le couloir des regards`, f.t);
        }
        const order = `${A.id}<${B.id}`, key = [A.id, B.id].sort().join('|');
        if (sideOrder.has(key) && sideOrder.get(key) !== order) v('regards.180', `${A.id} et ${B.id} changent de côté`, f.t);
        sideOrder.set(key, order);
      }
      const alive = others.filter((o) => (o.role === 'figurant' || o.role === 'animal') && o.box[3] - o.box[1] >= 90 && inter(o.box, [0, 0, w, h]) / area(o.box) >= 0.66);
      if (!alive.length) v('cadre.fond-vivant', 'aucun figurant ni animal lisible dans le plan à deux', f.t);
    }
    for (const a of actors) {
      if (!wide(shot) && a.head && p.subtitleTop !== undefined && inter(a.head, [0, 0, w, h]) > 0 && a.head[3] > p.subtitleTop) v('cadre.sous-titres', `les sous-titres couvrent le visage de ${a.id}`, f.t);
      if (a.head) for (const o of others) if (inter(o.box, a.head) > 0) v('cadre.tangente-tete', `${o.id} touche le visage de ${a.id}`, f.t);
      for (const o of others) if (o.depth < a.depth && inter(o.box, a.box) > 0) v('cadre.rien-devant', `${o.id} passe devant ${a.id}`, f.t);
      if (a.heightM < 1.45 || a.heightM > 1.95) v('echelle.tailles', `${a.id} mesure ${a.heightM.toFixed(2)} m`, f.t);
    }
    for (const o of allOthers) {
      const inside = inter(o.box, [0, 0, w, h]) / area(o.box);
      if (o.role === 'peint') continue; // the backdrop is framed by the painting itself; only what moves is staged
      if (!edgeOk(o.box, p.frame, wide(shot))) v('cadre.bord', `${o.id} coupé au bord (${Math.round(100 * inside)} % dans le cadre)`, f.t);
      if (o.role === 'figurant' && inside > 0 && (o.heightM < 1.1 || o.heightM > 2.0)) v('echelle.tailles', `figurant ${o.id} de ${o.heightM.toFixed(2)} m`, f.t);
    }
    for (const b of f.bodies) if (!b.onGround && inter(b.box, [0, 0, w, h]) > 0) v('sol.pieds', `${b.id} n’a pas les pieds sur le sol`, f.t);
    for (const a of actors) {
      const seenA = inter(a.box, [0, 0, w, h]) / area(a.box);
      if (seenA >= 0.3 && a.head && (a.head[1] < 0.005 * h || a.head[0] < 0.005 * w || a.head[2] > 0.995 * w)) v('cadre.tetes-entieres', `tête de ${a.id} coupée au bord (boîte ${a.head.map((q) => Math.round(q)).join(', ')})`, f.t);
      if (seenA >= 0.3) for (const [x, y] of a.hands ?? []) if (x < 0.01 * w || x > 0.99 * w || y < 0.01 * h || y > 0.995 * h) { v('cadre.mains-entieres', `main de ${a.id} coupée au bord (${Math.round(x)}, ${Math.round(y)})`, f.t); break; }
      if (wide(shot) && actors.length >= 2 && a.box[3] - a.box[1] < 0.3 * h) v('cadre.taille-acteurs', `${a.id} ne fait que ${Math.round((100 * (a.box[3] - a.box[1])) / h)} % de la hauteur`, f.t);
      if (seenA > 0.02 && (a.folds ?? 0) > 0) v('image.maillage', `${a.folds} triangle(s) replié(s) dans le dessin de ${a.id}`, f.t);
      if (seenA > 0.02 && (a.spill ?? 0) > 0.03) v('image.lisere', `liseré vert sur ${Math.round(100 * a.spill!)} % du contour de ${a.id}`, f.t);
    }
    for (const o of allOthers) {
      const c = o.cutout;
      if (!c || inter(o.box, [0, 0, w, h]) / area(o.box) <= 0.02) continue;
      if (c.moved && !c.clean) v('figuration.decoupe-propre', `${o.id} déplacé avec une découpe sale${c.why ? ` (${c.why})` : ''}`, f.t);
      // in a defocused close shot the figurant is out of focus with the set: allowed up to the blur (same as image.fond-agrandi)
      const tol = wide(shot) ? 1.35 : Math.max(1.35, shot.bgBlur ?? 0);
      if (c.magnify > tol) v('figuration.resolution', `${o.id} agrandi ${c.magnify.toFixed(2)}× ses pixels${wide(shot) ? '' : ` (flou du plan ${(shot.bgBlur ?? 0).toFixed(1)} px)`}`, f.t);
    }
    const shadows = f.bodies.filter((b) => b.shadow && inter(b.box, [0, 0, w, h]) > 0);
    for (const b of shadows) if (b.shadow!.widthRatio < 0.2) v('ombres.volume', `ombre de ${b.id} trop fine (${b.shadow!.widthRatio.toFixed(2)})`, f.t);
    for (const b of shadows) { const d = shadows[0]!.shadow!.dir, e = b.shadow!.dir; if (d[0] * e[0] + d[1] * e[1] < 0.99) v('ombres.une-lumiere', `ombre de ${b.id} dans une autre direction`, f.t); }
  }
  // ── image et textes ──
  for (const s of p.shots) if (!wide(s) && (s.bgMagnify ?? 0) > 1.6 && (s.bgBlur ?? 0) < s.bgMagnify!) v('image.fond-agrandi', `plan ${s.size} ${s.subject} : décor agrandi ${s.bgMagnify!.toFixed(1)}× sans flou suffisant (${(s.bgBlur ?? 0).toFixed(1)} px)`, s.t0);
  const T = p.texts ?? [];
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    const a = T[i]!, b = T[j]!;
    if (a.t0 < b.t1 && b.t0 < a.t1 && inter(a.box, b.box) > 0) v('montage.textes', `« ${a.id} » et « ${b.id} » se chevauchent à ${Math.max(a.t0, b.t0).toFixed(2)} s`, Math.max(a.t0, b.t0));
  }
  if ((p.openingFade ?? 0) > 2 / 30 + 1e-9) v('montage.premiere-image', `fondu au noir de ${p.openingFade!.toFixed(2)} s à l’ouverture : la première image est noire`, 0);
  // ── montage ──
  const cuts = p.shots.slice(1).map((s) => s.t0);
  const perMin = (p.shots.length / Math.max(1, p.total)) * 60;
  if (perMin < ref.shotsPerMin[0] || perMin > ref.shotsPerMin[1]) v('montage.cadence', `${perMin.toFixed(1)} plans par minute`);
  for (const c of cuts) {
    const inLine = p.lines.find((l) => c > l.t0 + 0.15 && c < l.t1 - 0.05);
    const inSilence = (l: PlanLine) => (l.pauses ?? []).some(([a, b]) => c >= a - 0.02 && c <= b + 0.02) || (!!l.punch && Math.abs(c - (l.punch.at - l.punch.pauseBefore / 2)) <= l.punch.pauseBefore / 2 + 0.02);
    if (inLine && !inSilence(inLine)) v('montage.coupe-hors-mot', `coupe à ${c.toFixed(2)} s au milieu de « ${inLine.text} »`, c);
  }
  const visible = p.swaps.filter((s) => s.seen !== false && !cuts.some((c) => Math.abs(c - s.t) <= 0.07)).map((s) => s.t).sort((a, b) => a - b);
  for (let i = 1; i < visible.length; i++) if (visible[i]! - visible[i - 1]! < 6) v('montage.saut-cache', `deux changements de dessin visibles en ${(visible[i]! - visible[i - 1]!).toFixed(1)} s`, visible[i]);
  if (visible.length > 2) v('comique.prises-max-2', `${visible.length} changements de dessin visibles en plein plan`);
  const byWho = new Map<string, number[]>();
  for (const s of p.swaps) byWho.set(s.who, [...(byWho.get(s.who) ?? []), s.t]);
  for (const [who, ts] of byWho) { ts.sort((a, b) => a - b); for (let i = 1; i < ts.length; i++) if (ts[i]! - ts[i - 1]! < 8 / 30 - 1e-9) v('comique.tenue-8-images', `${who} ne tient son dessin que ${Math.round((ts[i]! - ts[i - 1]!) * 30)} images`, ts[i]); }
  if (p.quietBeforePunch !== undefined && p.quietBeforePunch > 1.5) v('comique.immobile-avant-chute', `les corps bougent encore de ${p.quietBeforePunch.toFixed(1)} px par image juste avant la chute`);
  // ── rythme ──
  const L = [...p.lines].sort((a, b) => a.t0 - b.t0);
  if (L.length) {
    if (L[0]!.t0 > 1.2 || !/[!?]/.test(L[0]!.text)) v('rythme.accroche', `1re réplique à ${L[0]!.t0.toFixed(2)} s : « ${L[0]!.text} »`, L[0]!.t0);
    for (let i = 1; i < L.length; i++) {
      const gap = L[i]!.t0 - L[i - 1]!.t1;
      if (L[i]!.who !== L[i - 1]!.who && (gap < 0.1 || gap > 0.6)) v('rythme.tour', `silence de ${gap.toFixed(2)} s avant « ${L[i]!.text} » (mesuré ${ref.turnGap} s)`, L[i]!.t0);
    }
    const last = L[L.length - 1]!, tail = p.total - last.t1;
    if (tail < 0.8 || tail > 3) v('rythme.fin', `le film finit ${tail.toFixed(2)} s après la dernière réplique`);
  }
  const punch = L.find((l) => l.punch);
  if (punch) {
    const pb = punch.punch!;
    if (pb.pauseBefore < 0.2 || pb.pauseBefore > 0.5) v('rythme.silence-chute', `silence de ${pb.pauseBefore.toFixed(2)} s avant « ${pb.phrase} » (mesuré ${ref.preBeat}–${ref.preBeatP75} s)`, pb.at);
    if (words(pb.phrase).length > 8) v('comique.chute-courte', `chute de ${words(pb.phrase).length} mots : « ${pb.phrase} »`, pb.at);
    if (/\b(hein|quoi|voilà|donc)\s*[!?.…]*\s*$/i.test(punch.text)) v('comique.mot-final', `la chute finit par un mot vide : « ${punch.text} »`, punch.t1);
    if (L.some((l) => l !== punch && l.emotion > punch.emotion + 1e-9 && l.t0 < punch.t0)) v('comique.escalade', 'une réplique avant la chute est plus forte que la chute', punch.t0);
    const other = L.find((l) => l.t0 >= punch.t1 - 0.05 && l.who !== punch.who);
    const reacts = other && other.t0 - punch.t1 <= 0.8 && /rire|choc/.test(other.state);
    if (!reacts) v('comique.reaction', `pas de réaction de l’autre dans les 0,8 s après « ${pb.phrase} »`, punch.t1);
    if (other && other.state === 'rire') {
      // the laughing lasts from the reaction to the end of the laughs that follow it (or to the end of the film)
      let end = other.t1;
      for (const l of L) if (l.t0 >= other.t1 - 0.05 && l.who === other.who && l.laugh && l.t0 - end < 0.6) end = l.t1;
      const dur = end - other.t0 + (end === other.t1 ? Math.max(0, p.total - other.t1) : 0);
      if (dur < 3.5 || dur > 6.5) v('rythme.rire', `le rire tient ${dur.toFixed(1)} s (mesuré ${ref.laugh} s)`, other.t0);
    }
    const liar = p.liar ?? punch.who;
    const lie = L.filter((l) => l.who === liar && l.t0 <= punch.t0);
    const close = lie.some((l) => p.shots.some((s) => !wide(s) && s.subject === liar && s.t0 < l.t1 && s.t1 > l.t0));
    if (!close) v('comique.menteur-gros-plan', `pas de gros plan sur ${liar} pendant son mensonge`, punch.t0);
    const reactWin = p.shots.find((s) => s.t0 <= punch.t1 + 0.4 && s.t1 > punch.t1 + 0.4);
    if (!reactWin || !wide(reactWin)) v('comique.chute-a-deux', 'la réaction à la chute n’est pas vue à deux', punch.t1);
    const peopled = p.frames.some((f) => f.bodies.some((b) => (b.role === 'figurant' || b.role === 'animal') && inter(b.box, [0, 0, w, h]) / area(b.box) > 0.66));
    if (peopled && !p.beats.some((b) => b.move === 'rire' && b.t >= punch.t1 - 1 && b.t <= punch.t1 + 1.5)) v('comique.fond-reagit', 'le fond peuplé ne réagit pas à la chute', punch.t1);
  }
  if (!p.fixedCamera) v('fluidite.camera-fixe', 'caméra mobile dans le plan');
  return out;
}

/** One line per rule: ✓ or the violations, in the book's order (the report the director reads before rendering). */
export function rulesReport(p: Plan, ref: ChannelRef = CHANNEL): { ok: boolean; blocking: number; warnings: number; lines: string[] } {
  const vs = checkPlan(p, ref);
  const lines = RULES.map((r) => {
    const mine = vs.filter((x) => x.rule === r.id);
    if (!mine.length) return `✓ ${r.id} — ${r.rule}`;
    const uniq = [...new Set(mine.map((x) => x.message))];
    return `${r.severity === 'bloquant' ? '✗' : '!'} ${r.id} — ${uniq.slice(0, 3).join(' ; ')}${uniq.length > 3 ? ` (+${uniq.length - 3})` : ''}`;
  });
  const blocking = vs.filter((x) => x.severity === 'bloquant').length;
  return { ok: blocking === 0, blocking, warnings: vs.length - blocking, lines };
}
