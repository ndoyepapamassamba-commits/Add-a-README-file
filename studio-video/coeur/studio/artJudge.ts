/**
 * ART DIRECTOR — the visual judge and the post-generation enhancement pass of every scene image.
 * A vision model scores the image on an art-direction rubric (faces and eyes, hands and anatomy, textures, lighting,
 * single-shot composition, Afrikatoon style, coherence with the characters, artefacts), then:
 *  - accept      : good enough, kept as is;
 *  - enhance     : composition and story are right, the finish is not (eyes, hands, textures, light, stray text) →
 *                  image-to-image pass WITH the image as reference: same shot, only the defects fixed;
 *  - regenerate  : wrong shot, wrong characters or off-style → drawn again with the judge's notes.
 * No score is invented: without a judge the image keeps quality = null. Pure (prompts, parsing, decision).
 */
export const ART_CRITERIA = [
  { id: 'face', label: 'Visages et yeux', fix: 'symmetric expressive eyes with clear catchlights and aligned pupils, clean facial features, readable expression' },
  { id: 'anatomy', label: 'Mains et anatomie', fix: 'correct hands with five fingers, natural limbs and proportions' },
  { id: 'detail', label: 'Textures et finesse', fix: 'refined skin, fabric and material textures, crisp edges, no blur, no smudges' },
  { id: 'lighting', label: 'Lumière', fix: 'cinematic soft key light with gentle rim light, coherent shadows' },
  { id: 'composition', label: 'Plan unique et cadrage', fix: 'one single shot filling the frame, clear subject, rule of thirds' },
  { id: 'style', label: 'Style Afrikatoon', fix: 'the project art style (warm saturated colours, stylised West-African characters, appealing proportions)' },
  { id: 'coherence', label: 'Cohérence personnages / décor', fix: 'the characters exactly as in their reference sheets, the scene location as described' },
  { id: 'artifacts', label: 'Artefacts', fix: 'no text, letters, watermark, logo, duplicated limbs or glitches' },
] as const;
export type ArtCriterion = (typeof ART_CRITERIA)[number]['id'];
export interface ArtJudgement {
  scores: Partial<Record<ArtCriterion, number>>;
  issues: { criterion: ArtCriterion; note: string }[];
  /** Mean of the scores given (0-10). */
  overall: number;
}
export type ArtVerdict = 'accept' | 'enhance' | 'regenerate';

export function judgePrompt(o: { style: string; characters: string; action: string }): string {
  return [
    'You are a strict animation art director. Judge this scene image for a funny Afrikatoon short (TikTok).',
    `Expected style: ${o.style}.`,
    `Expected characters (reference sheets): ${o.characters || '(not specified)'}.`,
    `Expected moment: ${o.action || '(not specified)'}.`,
    `Score each criterion from 0 to 10 (10 = film quality): ${ART_CRITERIA.map((c) => `"${c.id}" (${c.label})`).join(', ')}.`,
    'For every criterion under 7, give ONE short concrete fix.',
    'Answer ONLY JSON: {"scores":{"face":0-10,…},"issues":[{"criterion":"face","note":"left eye smaller than the right"}]}',
  ].join('\n');
}

const IDS = new Set<string>(ART_CRITERIA.map((c) => c.id));
export function parseJudgement(text: string): ArtJudgement | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { scores?: Record<string, unknown>; issues?: unknown[] };
    const scores: Partial<Record<ArtCriterion, number>> = {};
    for (const [k, v] of Object.entries(j.scores ?? {})) if (IDS.has(k) && typeof v === 'number' && Number.isFinite(v)) scores[k as ArtCriterion] = Math.max(0, Math.min(10, v));
    const vals = Object.values(scores) as number[];
    if (vals.length < 4) return null; // a judge that scored almost nothing did not judge
    const issues = (Array.isArray(j.issues) ? j.issues : [])
      .map((x) => x as { criterion?: unknown; note?: unknown })
      .filter((x) => typeof x.criterion === 'string' && IDS.has(x.criterion) && typeof x.note === 'string')
      .map((x) => ({ criterion: x.criterion as ArtCriterion, note: String(x.note).slice(0, 160) }))
      .slice(0, 8);
    return { scores, issues, overall: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 };
  } catch {
    return null;
  }
}

/** The structural criteria decide a redraw; the finish criteria an enhancement pass. */
const STRUCTURE: ArtCriterion[] = ['composition', 'coherence', 'style'];
export function artVerdict(j: ArtJudgement, o: { accept?: number } = {}): ArtVerdict {
  const accept = o.accept ?? 7.5;
  const low = (c: ArtCriterion, t: number) => (j.scores[c] ?? 10) < t;
  if (STRUCTURE.some((c) => low(c, 5))) return 'regenerate';
  if (j.overall >= accept && !Object.keys(j.scores).some((c) => low(c as ArtCriterion, 6))) return 'accept';
  return 'enhance';
}

/** Image-to-image instruction: SAME shot, only the defects fixed (the image is sent as the first reference). */
export function enhanceInstruction(j: ArtJudgement): string {
  const weak = ART_CRITERIA.filter((c) => (j.scores[c.id] ?? 10) < 7.5 && !STRUCTURE.includes(c.id));
  const notes = j.issues.filter((i) => !STRUCTURE.includes(i.criterion)).map((i) => i.note);
  return [
    'EDIT THE FIRST REFERENCE IMAGE — keep exactly the same composition, camera, characters, poses, outfits, background and colour palette.',
    `Only improve: ${(weak.length ? weak : ART_CRITERIA.filter((c) => c.id === 'face' || c.id === 'detail')).map((c) => c.fix).join('; ')}.`,
    notes.length ? `Fix precisely: ${notes.join('; ')}.` : '',
    'High-end animated film finish, sharp details, no new elements.',
  ]
    .filter(Boolean)
    .join('\n');
}
/** Notes appended to the scene prompt when the image is drawn again. */
export function regenerateHint(j: ArtJudgement): string {
  const notes = j.issues.map((i) => `${i.criterion}: ${i.note}`);
  const weak = ART_CRITERIA.filter((c) => (j.scores[c.id] ?? 10) < 6).map((c) => c.fix);
  return `ART DIRECTOR NOTES (previous attempt rejected): ${[...notes, ...weak].join('; ')}.`;
}
/** 0-100 quality for the storyboard card (only from a real judgement). */
export const artQuality = (j: ArtJudgement | null): number | null => (j ? Math.round(j.overall * 10) : null);
