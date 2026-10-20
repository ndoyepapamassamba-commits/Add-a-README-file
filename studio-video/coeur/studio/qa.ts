// ProductionQA, ContinuityEngine and targeted self-repair — rule-based checks that need no model, plus the structure that
// receives an (optional) vision judge. A score exists ONLY when something measured it: no judge → null, never a default.
import type { Blueprint, CharacterSheet, QAReport, Scene } from './types';
import { wordCount } from './story';
import { scanSecrets } from './secrets';

export type IssueCode =
  | 'UNKNOWN_CHARACTER'
  | 'UNKNOWN_LOCATION'
  | 'SPEAKER_NOT_IN_SCENE'
  | 'TIME_JUMP'
  | 'MISSING_PROMPT'
  | 'LONG_LINE'
  | 'DURATION_SHORT'
  | 'WRONG_ASPECT'
  | 'BRAND_LOGO'
  | 'SENSITIVE_CONTENT'
  | 'SECRET_IN_PROMPT'
  | 'NO_IMAGE'
  | 'FACE_DRIFT'
  | 'VOICE_INCONSISTENT'
  | 'CONTINUITY_BREAK'
  | 'BAD_CAMERA'
  | 'SUBTITLE_DESYNC'
  | 'LIPSYNC'
  | 'NO_HOOK';

/** Real brands that must never appear in a prompt (heuristic, extendable — a human review stays necessary). */
const BRANDS =
  /\b(nike|adidas|puma|coca[- ]?cola|pepsi|fanta|orange\s*money|wave\b|apple|iphone|samsung|google|facebook|instagram|tiktok|youtube|netflix|disney|marvel|pixar|mcdonald|kfc|gucci|louis vuitton|mercedes|toyota|bmw|ecobank|nestl[ée]|maggi|bic\b|lacoste|ferrari|real madrid|barcelona|psg)\b/i;
/** Mockery of groups — heuristic patterns; ambiguous cases need human review. */
const SENSITIVE =
  /(sale\s+(noir|arabe|juif|blanc|n[eè]gre)|n[eè]gre|bougnoul|youpin|mongol(ien)?|handicap[ée]s?\s+(stupide|idiot)|les\s+(noirs|arabes|juifs|musulmans|chr[ée]tiens)\s+(sont|font))/i;
const NIGHT = /(nuit|night|soir|evening|minuit)/i;
const DAY = /(jour|day|matin|morning|midi|noon|après-midi|afternoon)/i;

export interface Issue {
  code: IssueCode;
  severity: 'info' | 'warn' | 'error';
  sceneId?: string;
  message: string;
}
const eq = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

/** Structural continuity checks (character, location, time, dialogue ↔ presence). */
export function continuityCheck(bp: Pick<Blueprint, 'characters' | 'worlds' | 'scenes'>): Issue[] {
  const out: Issue[] = [];
  const known = (n: string) => bp.characters.some((c) => eq(c.name, n));
  bp.scenes.forEach((sc, i) => {
    for (const c of sc.characters)
      if (!known(c))
        out.push({
          code: 'UNKNOWN_CHARACTER',
          severity: 'error',
          sceneId: sc.scene_id,
          message: `personnage « ${c} » absent de la bible`,
        });
    if (bp.worlds.length && !bp.worlds.some((w) => eq(w.name, sc.location)))
      out.push({
        code: 'UNKNOWN_LOCATION',
        severity: 'warn',
        sceneId: sc.scene_id,
        message: `lieu « ${sc.location} » absent de la bible des décors`,
      });
    for (const d of sc.dialogue)
      if (d.speaker !== 'NARRATEUR' && !sc.characters.some((c) => eq(c, d.speaker)))
        out.push({
          code: 'SPEAKER_NOT_IN_SCENE',
          severity: 'warn',
          sceneId: sc.scene_id,
          message: `${d.speaker} parle mais n’est pas dans la scène`,
        });
    const prev = bp.scenes[i - 1];
    if (
      prev &&
      eq(prev.location, sc.location) &&
      ((NIGHT.test(prev.time) && DAY.test(sc.time)) || (DAY.test(prev.time) && NIGHT.test(sc.time))) &&
      sc.transition.toLowerCase() === 'cut'
    )
      out.push({
        code: 'TIME_JUMP',
        severity: 'warn',
        sceneId: sc.scene_id,
        message: `${prev.time} → ${sc.time} dans le même lieu sans transition`,
      });
  });
  return out;
}

/** Format, duration, dialogue length, prompts, brand logos, sensitive content, secrets. */
export function ruleCheck(bp: Blueprint): Issue[] {
  const out: Issue[] = [...continuityCheck(bp)];
  const social = /tiktok|reels|shorts/i.test(bp.platform);
  if (social && bp.aspect !== '9:16')
    out.push({
      code: 'WRONG_ASPECT',
      severity: 'error',
      message: `format ${bp.aspect} pour ${bp.platform} (9:16 attendu)`,
    });
  const total = bp.scenes.reduce((a, s) => a + s.duration, 0);
  if (/tiktok/i.test(bp.platform) && total <= 60)
    out.push({
      code: 'DURATION_SHORT',
      severity: 'warn',
      message: `durée ${total}s ≤ 60s : hors programme Creator Rewards`,
    });
  if (bp.story && !bp.story.hook) out.push({ code: 'NO_HOOK', severity: 'warn', message: 'aucune accroche' });
  for (const sc of bp.scenes) {
    if (!sc.visual_prompt.trim())
      out.push({
        code: 'MISSING_PROMPT',
        severity: 'warn',
        sceneId: sc.scene_id,
        message: 'visual_prompt vide',
      });
    if (!sc.imageAssetId)
      out.push({ code: 'NO_IMAGE', severity: 'info', sceneId: sc.scene_id, message: 'aucune image générée' });
    for (const d of sc.dialogue)
      if (wordCount(d.text) > 12)
        out.push({
          code: 'LONG_LINE',
          severity: 'warn',
          sceneId: sc.scene_id,
          message: `réplique de ${wordCount(d.text)} mots`,
        });
    const all = [sc.visual_prompt, sc.video_prompt, sc.action, ...sc.dialogue.map((d) => d.text)].join(' ');
    if (BRANDS.test(all))
      out.push({
        code: 'BRAND_LOGO',
        severity: 'error',
        sceneId: sc.scene_id,
        message: `marque réelle détectée (« ${all.match(BRANDS)![0]} »)`,
      });
    if (SENSITIVE.test(all))
      out.push({
        code: 'SENSITIVE_CONTENT',
        severity: 'error',
        sceneId: sc.scene_id,
        message: 'contenu moqueur envers un groupe : à revoir',
      });
    if (scanSecrets(all).length)
      out.push({
        code: 'SECRET_IN_PROMPT',
        severity: 'error',
        sceneId: sc.scene_id,
        message: 'motif de secret dans un prompt',
      });
  }
  for (const c of bp.characters)
    if (BRANDS.test(`${c.clothing} ${c.accessories}`))
      out.push({ code: 'BRAND_LOGO', severity: 'error', message: `${c.name} : marque réelle dans la tenue` });
  return out;
}

export interface JudgeScores {
  visual?: number | null;
  audio?: number | null;
  consistency?: number | null;
  /** Identity of the judge and its confidence — mandatory when any visual score is given. */
  judge?: string;
  confidence?: string;
}
/**
 * Builds the QA report. VISUAL / AUDIO / CONSISTENCY come from an external judge ONLY; NARRATIVE, TECHNICAL and SOCIAL come
 * from rule checks. Anything not measured stays null, and TOTAL is null unless at least one score exists.
 */
export function buildQAReport(bp: Blueprint, judge: JudgeScores = {}, now = Date.now()): QAReport {
  const issues = ruleCheck(bp);
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warns = issues.filter((i) => i.severity === 'warn').length;
  const has = bp.scenes.length > 0;
  const narrative = has
    ? Math.max(
        0,
        100 -
          12 *
            issues.filter((i) =>
              ['LONG_LINE', 'NO_HOOK', 'SPEAKER_NOT_IN_SCENE', 'UNKNOWN_CHARACTER'].includes(i.code),
            ).length,
      )
    : null;
  const technical = has
    ? Math.max(
        0,
        100 -
          25 *
            issues.filter((i) => ['WRONG_ASPECT', 'MISSING_PROMPT', 'SECRET_IN_PROMPT'].includes(i.code))
              .length -
          5 * warns,
      )
    : null;
  const social = has
    ? Math.max(
        0,
        100 -
          30 * issues.filter((i) => ['BRAND_LOGO', 'SENSITIVE_CONTENT'].includes(i.code)).length -
          (issues.some((i) => i.code === 'DURATION_SHORT') ? 15 : 0),
      )
    : null;
  const judged = judge.judge && judge.confidence;
  const scores = {
    visual: judged ? (judge.visual ?? null) : null,
    narrative,
    audio: judged ? (judge.audio ?? null) : null,
    consistency: judged ? (judge.consistency ?? null) : null,
    technical,
    social,
  };
  const vals = Object.values(scores).filter((v): v is number => typeof v === 'number');
  void errors;
  return {
    at: now,
    scores,
    total: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
    judge: judged ? judge.judge! : null,
    judgeConfidence: judged ? judge.confidence! : null,
    issues,
  };
}

// ───────── compressed context (never the whole project) ─────────

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
export interface SceneContextPack {
  text: string;
  tokensApprox: number;
  /** Characters of the full project that were NOT sent. */
  omittedChars: number;
}
export function contextPack(
  bp: Pick<Blueprint, 'story' | 'styleDNA' | 'characters' | 'worlds' | 'scenes'>,
  sceneId: string,
  budgetChars = 1800,
): SceneContextPack {
  const i = bp.scenes.findIndex((s) => s.scene_id === sceneId);
  const sc = bp.scenes[i];
  if (!sc) return { text: '', tokensApprox: 0, omittedChars: 0 };
  const prev = bp.scenes[i - 1];
  const next = bp.scenes[i + 1];
  const chars = bp.characters.filter((c) => sc.characters.some((n) => eq(n, c.name)));
  const world = bp.worlds.find((w) => eq(w.name, sc.location));
  const lines = [
    bp.story ? `HISTOIRE : ${clip(bp.story.logline || bp.story.synopsis, 220)}` : '',
    `STYLE : ${clip(bp.styleDNA.renderStyle, 140)}`,
    ...chars.map((c) => `PERSONNAGE ${c.name} : ${clip(c.consistency || `${c.clothing}, ${c.hair}`, 200)}`),
    world ? `DÉCOR ${world.name} : ${clip(`${world.architecture}, ${world.palette}`, 160)}` : '',
    prev
      ? `SCÈNE PRÉCÉDENTE (${prev.scene_id}) : ${clip(prev.action, 140)} — lieu ${prev.location}, ${prev.time}`
      : '',
    `SCÈNE COURANTE (${sc.scene_id}) : ${clip(sc.action, 220)} — ${sc.location}, ${sc.time}, émotion ${sc.emotion}`,
    next ? `INTENTION SUIVANTE (${next.scene_id}) : ${clip(next.action, 100)}` : '',
  ].filter(Boolean);
  let text = lines.join('\n');
  if (text.length > budgetChars) text = clip(text, budgetChars);
  const full = JSON.stringify({ s: bp.story, c: bp.characters, w: bp.worlds, sc: bp.scenes }).length;
  return { text, tokensApprox: Math.ceil(text.length / 4), omittedChars: Math.max(0, full - text.length) };
}

// ───────── targeted repair ─────────

export interface Repair {
  action:
    | 'REGENERATE_CHARACTER_REFERENCE'
    | 'REGENERATE_VOICE'
    | 'INJECT_PREVIOUS_STATE'
    | 'RECOMPILE_PROMPT'
    | 'RECOMPUTE_SUBTITLES'
    | 'SWITCH_SPEECH_VIDEO_CHAIN'
    | 'CROP_RATIO';
  label: string;
}
export const REPAIRS: Partial<Record<IssueCode, Repair>> = {
  FACE_DRIFT: { action: 'REGENERATE_CHARACTER_REFERENCE', label: 'régénérer la référence du personnage' },
  VOICE_INCONSISTENT: { action: 'REGENERATE_VOICE', label: 'régénérer la voix' },
  CONTINUITY_BREAK: { action: 'INJECT_PREVIOUS_STATE', label: 'injecter l’état de la scène précédente' },
  TIME_JUMP: { action: 'INJECT_PREVIOUS_STATE', label: 'injecter l’état de la scène précédente' },
  BAD_CAMERA: { action: 'RECOMPILE_PROMPT', label: 'recompiler le prompt (caméra)' },
  MISSING_PROMPT: { action: 'RECOMPILE_PROMPT', label: 'recompiler le prompt' },
  SUBTITLE_DESYNC: { action: 'RECOMPUTE_SUBTITLES', label: 'recalculer le timing des sous-titres' },
  LIPSYNC: { action: 'SWITCH_SPEECH_VIDEO_CHAIN', label: 'autre chaîne parole/vidéo, ou moteur 2D local' },
  WRONG_ASPECT: { action: 'CROP_RATIO', label: 'recadrage au bon ratio' },
};
export interface RepairPlan {
  issue: Issue;
  repair: Repair | null;
}
/** One targeted correction per issue — never a blind regeneration. Issues without a repair are left to a human. */
export function planRepairs(issues: Issue[]): RepairPlan[] {
  return issues
    .filter((i) => i.severity !== 'info')
    .map((issue) => ({ issue, repair: REPAIRS[issue.code] ?? null }));
}
export type { CharacterSheet, Scene };
