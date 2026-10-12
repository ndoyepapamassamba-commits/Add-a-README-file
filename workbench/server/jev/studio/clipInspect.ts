/**
 * ANALYSE POUSSÉE D'UN CLIP (circuit Grok) — ce que l'œil reproche à « Le chef invisible » (v44), mesuré :
 *  - MOUVEMENT : différence moyenne entre images (gris 0–1, 12 i/s) et part de l'image qui bouge (grille 8×8).
 *    Étalonnage sur la vidéo v44 : scènes vivantes ≈ 0,019–0,024 / 42–55 % de l'image ; scène molle 0,010 / 17 % ;
 *    passage figé < 0,004.
 *  - IMAGE FIGÉE : plages où rien ne bouge (v44 : 5 s figées dans la scène du patron, clip plus court que les répliques).
 *  - SCINTILLEMENT / DÉCHIRURE : une zone qui change puis revient (B ≠ A, B ≠ C mais A ≈ C).
 *  - Ce que les pixels ne savent pas dire (bras qui s'étire, bouche qui ne parle pas, gag lisible, niveau de rire) :
 *    JUGE VISUEL sur 4–6 images clés + les répliques, notes 0–10 avec les défauts nommés.
 * Le verdict décide : garder, refaire UNE fois avec la correction écrite dans le prompt (sous le plafond DUR), ou
 * laisser la Marionnette prendre le relais. Rien n'est inventé : sans juge, les critères visuels restent « non mesurés ».
 */
export interface FrameSeries {
  w: number;
  h: number;
  fps: number;
  /** Grey levels 0–1, w×h each. */
  frames: Float32Array[];
}
export interface Span {
  start: number;
  end: number;
}
export interface ClipMeasures {
  seconds: number;
  motion: number;
  coverage: number;
  staticRatio: number;
  frozen: Span[];
  flicker: number;
  cuts: number[];
}
const GRID = 8;
const diff = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!);
  return s / a.length;
};
function blocks(a: Float32Array, b: Float32Array, w: number, h: number): Float32Array {
  const bw = Math.floor(w / GRID);
  const bh = Math.floor(h / GRID);
  const out = new Float32Array(GRID * GRID);
  for (let gy = 0; gy < GRID; gy++)
    for (let gx = 0; gx < GRID; gx++) {
      let s = 0;
      for (let y = gy * bh; y < (gy + 1) * bh; y++) for (let x = gx * bw; x < (gx + 1) * bw; x++) s += Math.abs(a[y * w + x]! - b[y * w + x]!);
      out[gy * GRID + gx] = s / (bw * bh);
    }
  return out;
}
export const MOTION = { still: 0.004, stillShare: 0.06, weak: 0.009, cover: 0.012, cut: 0.08, flicker: 0.03 } as const;

export function measureFrames(fs: FrameSeries, o: { minFrozenS?: number } = {}): ClipMeasures {
  const { frames, w, h, fps } = fs;
  const n = frames.length;
  const seconds = n / fps;
  if (n < 3) return { seconds, motion: 0, coverage: 0, staticRatio: 1, frozen: n ? [{ start: 0, end: seconds }] : [], flicker: 0, cuts: [] };
  const d: number[] = [];
  for (let i = 1; i < n; i++) d.push(diff(frames[i - 1]!, frames[i]!));
  // A CUT is a spike: far above the cut level AND well above its neighbours (lively acting is not a cut).
  // Baseline = median of the steps around (±8, the 2 nearest excluded: a crossfade spans 2–3 frames).
  const isCut = d.map((v, i) => {
    if (v <= MOTION.cut) return false;
    const around = d.filter((_, j) => Math.abs(j - i) > 2 && Math.abs(j - i) <= 8).sort((a, b) => a - b);
    const base = around.length ? around[Math.floor(around.length / 2)]! : 0;
    return v > 3 * Math.max(base, 0.005);
  });
  const cuts: number[] = [];
  // Per step: share of the 8×8 zones that move. « Still » = under 6 %, or only ONE row of zones moving (a caption
  // changing word), whatever its width.
  const moving: number[] = [];
  let cov = 0;
  let covN = 0;
  for (let i = 1; i < n; i++) {
    if (isCut[i - 1]) {
      cuts.push(i / fps);
      moving.push(1);
      continue;
    }
    const b = blocks(frames[i - 1]!, frames[i]!, w, h);
    const rows = new Set<number>();
    let k = 0;
    b.forEach((x, j) => {
      if (x > MOTION.cover) {
        k++;
        rows.add(Math.floor(j / GRID));
      }
    });
    const share = k / b.length;
    moving.push(rows.size <= 1 && share < 0.15 ? 0 : share);
    cov += share;
    covN++;
  }
  const inShot = d.filter((_, i) => !isCut[i]);
  const motion = inShot.length ? inShot.reduce((a, b) => a + b, 0) / inShot.length : 0;
  // Frozen spans: consecutive differences under the « still » threshold.
  const minS = o.minFrozenS ?? 0.6;
  const frozen: Span[] = [];
  let run = -1;
  moving.forEach((v, i) => {
    if (v < MOTION.stillShare) {
      if (run < 0) run = i;
    } else if (run >= 0) {
      if ((i - run) / fps >= minS) frozen.push({ start: run / fps, end: (i + 1) / fps });
      run = -1;
    }
  });
  if (run >= 0 && (moving.length - run) / fps >= minS) frozen.push({ start: run / fps, end: n / fps });
  // Flicker / tearing: B differs from both neighbours while A ≈ C, per block.
  let fl = 0;
  let flN = 0;
  for (let i = 1; i < n - 1; i++) {
    if (isCut[i - 1] || isCut[i]) continue;
    const ab = blocks(frames[i - 1]!, frames[i]!, w, h);
    const bc = blocks(frames[i]!, frames[i + 1]!, w, h);
    const ac = blocks(frames[i - 1]!, frames[i + 1]!, w, h);
    for (let k = 0; k < ab.length; k++) if (Math.min(ab[k]!, bc[k]!) - ac[k]! > MOTION.flicker) fl++;
    flN += ab.length;
  }
  return {
    seconds,
    motion: Math.round(motion * 10000) / 10000,
    coverage: covN ? Math.round((cov / covN) * 100) / 100 : 0,
    staticRatio: Math.round((moving.filter((v) => v < MOTION.stillShare).length / Math.max(1, moving.length)) * 100) / 100,
    frozen,
    flicker: flN ? Math.round((fl / flN) * 10000) / 10000 : 0,
    cuts,
  };
}

/** A whole film cut into its shots (by the hard cuts), each shot measured — for the « Analyser une vidéo » tool. */
export function segmentFilm(fs: FrameSeries, minShotS = 0.8): { start: number; end: number; m: ClipMeasures }[] {
  const all = measureFrames(fs);
  const edges = [0, ...all.cuts, all.seconds];
  const out: { start: number; end: number; m: ClipMeasures }[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i]!;
    const b = edges[i + 1]!;
    if (b - a < minShotS) continue;
    const frames = fs.frames.slice(Math.round(a * fs.fps), Math.round(b * fs.fps));
    out.push({ start: a, end: b, m: measureFrames({ ...fs, frames }) });
  }
  return out;
}

// ── JUGE VISUEL ──────────────────────────────────────────────────────────────────────────────────────────────────
export const CLIP_CRITERIA = [
  { id: 'rire', label: 'Niveau de rire', how: 'le gag se lit-il à l’image, est-il drôle pour un public ivoirien de TikTok (timing, réaction, exagération) ?' },
  { id: 'mouvement', label: 'Mouvements', how: 'les personnages jouent-ils vraiment (gestes amples, corps qui bouge) ou restent-ils figés ?' },
  { id: 'expressions', label: 'Expressions', how: 'visages expressifs et lisibles, émotion de la scène visible' },
  { id: 'bouche', label: 'Parole / bouche', how: 'la bouche de celui qui parle s’ouvre et se ferme ; les autres ne parlent pas en même temps' },
  { id: 'anatomie', label: 'Anatomie', how: '10 = aucun membre étiré, fondu, dédoublé ou déchiré, aucune main en trop ; 0 = déformation grave' },
  { id: 'coherence', label: 'Cohérence', how: 'mêmes personnages (visage, tenue, lunettes) et même décor d’une image à l’autre' },
] as const;
export type ClipCriterion = (typeof CLIP_CRITERIA)[number]['id'];
export interface ClipJudgement {
  scores: Record<ClipCriterion, number>;
  defects: string[];
  fix: string;
}
export function clipJudgePrompt(o: { action: string; location?: string; characters: string; lines: { speaker: string; text: string }[]; frames: number }): string {
  return [
    `Tu es directeur de l’animation d’une série humoristique Afrikatoon (TikTok, Côte d’Ivoire). Voici ${o.frames} images extraites dans l’ordre d’UN clip vidéo généré.`,
    `Action attendue : ${o.action}${o.location ? ` · Décor : ${o.location}` : ''}`,
    `Personnages : ${o.characters || '—'}`,
    `Répliques dites pendant le clip : ${o.lines.map((l) => `${l.speaker} : « ${l.text} »`).join(' / ') || '—'}`,
    'Note chaque critère de 0 à 10, sévèrement (5 = moyen) :',
    ...CLIP_CRITERIA.map((c) => `- ${c.id} : ${c.how}`),
    'Nomme précisément chaque défaut visible (ex. « bras du patron étiré jusqu’à l’épaule de Koffi », « Adjo ne bouge pas »). Puis écris en anglais une consigne de correction courte pour le modèle vidéo.',
    'Réponds UNIQUEMENT en JSON : {"rire":n,"mouvement":n,"expressions":n,"bouche":n,"anatomie":n,"coherence":n,"defects":["…"],"fix":"…"}',
  ].join('\n');
}
export function parseClipJudgement(text: string): ClipJudgement | null {
  const m = /\{[\s\S]*\}/.exec(text ?? '');
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const scores = {} as Record<ClipCriterion, number>;
    for (const c of CLIP_CRITERIA) {
      const v = Number(j[c.id]);
      if (!Number.isFinite(v)) return null;
      scores[c.id] = Math.max(0, Math.min(10, v));
    }
    return { scores, defects: Array.isArray(j.defects) ? j.defects.map(String).slice(0, 8) : [], fix: String(j.fix ?? '').slice(0, 400) };
  } catch {
    return null;
  }
}

// ── VERDICT ──────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ClipReport {
  measures: ClipMeasures;
  judge: ClipJudgement | null;
  /** 0–100; null when nothing could be measured. */
  score: number | null;
  verdict: 'ok' | 'retry';
  reasons: string[];
  /** Added to the video prompt for the one retry. */
  fix: string;
}
export function clipVerdict(m: ClipMeasures, j: ClipJudgement | null, o: { expectedS?: number } = {}): ClipReport {
  const reasons: string[] = [];
  const fix: string[] = [];
  const frozenS = m.frozen.reduce((a, s) => a + (s.end - s.start), 0);
  if (o.expectedS && m.seconds < o.expectedS - 0.5) reasons.push(`clip de ${m.seconds.toFixed(1)} s pour ${o.expectedS.toFixed(1)} s de répliques (le montage prolonge sans figer)`);
  if (frozenS >= 0.8) {
    reasons.push(`image figée ${frozenS.toFixed(1)} s`);
    fix.push('continuous motion from the first to the last frame, never a frozen pose');
  }
  if (m.motion < MOTION.weak || m.coverage < 0.2) {
    reasons.push(`manque d’animation (mouvement ${m.motion.toFixed(3)}, ${Math.round(m.coverage * 100)} % de l’image bouge)`);
    fix.push('lively exaggerated cartoon acting: big arm gestures, whole bodies move, heads turn, reactions');
  }
  if (m.flicker > 0.01) {
    reasons.push(`scintillement / déchirures (${(m.flicker * 100).toFixed(1)} % des zones)`);
    fix.push('stable clean lines, no flickering or tearing parts');
  }
  if (j) {
    const s = j.scores;
    if (s.anatomie <= 5) {
      reasons.push(`déformation (anatomie ${s.anatomie}/10)${j.defects.length ? ` : ${j.defects.slice(0, 2).join(' ; ')}` : ''}`);
      fix.push('correct anatomy: arms keep their length, two hands each, no stretching or melting');
    }
    if (s.bouche <= 4) {
      reasons.push(`bouches qui ne parlent pas (${s.bouche}/10)`);
      fix.push('the speaking character clearly opens and closes the mouth while talking');
    }
    if (s.mouvement <= 4 && !fix.some((f) => f.startsWith('lively'))) {
      reasons.push(`jeu trop raide (${s.mouvement}/10)`);
      fix.push('lively exaggerated cartoon acting: big arm gestures, whole bodies move, heads turn, reactions');
    }
    if (s.rire <= 4) {
      reasons.push(`gag peu lisible (rire ${s.rire}/10)`);
      fix.push('a clear comic reaction: wide eyes, jaw drop or big laugh at the punchline');
    }
    if (s.coherence <= 4) reasons.push(`personnages ou décor incohérents (${s.coherence}/10)`);
    if (j.fix) fix.push(j.fix);
  }
  const local = Math.min(1, m.motion / 0.02) * 0.5 + Math.min(1, m.coverage / 0.45) * 0.3 + (1 - Math.min(1, frozenS / Math.max(1, m.seconds))) * 0.2 - Math.min(0.3, m.flicker * 10);
  const visual = j ? (j.scores.rire * 1.5 + j.scores.mouvement + j.scores.expressions + j.scores.bouche + j.scores.anatomie * 1.5 + j.scores.coherence) / 7 / 10 : null;
  const score = Math.round(Math.max(0, Math.min(1, visual === null ? local : local * 0.4 + visual * 0.6)) * 100);
  const severe = reasons.some((r) => /figée|manque d’animation|déformation|ne parlent pas|scintillement/.test(r));
  return { measures: m, judge: j, score, verdict: severe ? 'retry' : 'ok', reasons, fix: [...new Set(fix)].join('; ') };
}

/** Of two takes of the same shot, the better one (score, then fewer reasons). */
export const betterTake = (a: ClipReport, b: ClipReport): 'a' | 'b' => ((b.score ?? 0) > (a.score ?? 0) + 2 || ((b.score ?? 0) >= (a.score ?? 0) && b.reasons.length < a.reasons.length) ? 'b' : 'a');

/** Loudness envelope → silent gaps longer than `minS` (a film whose voices stop for 2 s feels broken). */
export function silentGaps(env: number[], hopS: number, o: { floor?: number; minS?: number } = {}): Span[] {
  const floor = o.floor ?? 0.02;
  const minS = o.minS ?? 1.5;
  const out: Span[] = [];
  let run = -1;
  env.forEach((v, i) => {
    if (v < floor) {
      if (run < 0) run = i;
    } else if (run >= 0) {
      if ((i - run) * hopS >= minS) out.push({ start: run * hopS, end: i * hopS });
      run = -1;
    }
  });
  if (run >= 0 && (env.length - run) * hopS >= minS) out.push({ start: run * hopS, end: env.length * hopS });
  return out;
}
