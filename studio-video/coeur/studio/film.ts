// AI Film Studio — pure engines added on top of the existing studio: budget tiers, video quality gate, asset graph,
// production versions, production plan (JSON) and the cost ladder. No I/O, no network, nothing invented: every value
// comes from the blueprint, the job/asset records or a deterministic calculation.
import type { AssetMeta, Blueprint, BlueprintVersion, CostMode, Job } from './types';
import { spent } from './blueprint';
import type { Candidate } from './cost';
import { dimensionOf } from './style';

// ───────── budget governor tiers ─────────
export type BudgetTier = 'normal' | 'optimize' | 'cheap-first' | 'stop-premium' | 'hard-stop';
export interface TierInfo {
  tier: BudgetTier;
  ratio: number;
  label: string;
  effect: string;
}
/** <50 % normal · 50–80 % optimize · 80–95 % cheap-first · >95 % stop premium · 100 % hard stop. */
export function budgetTier(spentUsd: number, cap: number): TierInfo {
  const ratio = cap > 0 ? spentUsd / cap : spentUsd > 0 ? 1 : 0;
  if (ratio >= 1)
    return {
      tier: 'hard-stop',
      ratio,
      label: 'ARRÊT TOTAL',
      effect: 'plafond atteint : tout appel payant est bloqué sans confirmation',
    };
  if (ratio > 0.95)
    return {
      tier: 'stop-premium',
      ratio,
      label: 'PREMIUM STOPPÉ',
      effect: 'plus aucun modèle premium ; le moins cher uniquement',
    };
  if (ratio >= 0.8)
    return {
      tier: 'cheap-first',
      ratio,
      label: 'ÉCONOMIE',
      effect: 'le modèle capable le moins cher passe en premier',
    };
  if (ratio >= 0.5)
    return {
      tier: 'optimize',
      ratio,
      label: 'OPTIMISATION',
      effect: 'les modes QUALITY/PREMIUM redescendent à BALANCED',
    };
  return { tier: 'normal', ratio, label: 'NORMAL', effect: 'mode demandé appliqué' };
}
/** The cost mode actually applied once the tier is taken into account. */
export function effectiveMode(mode: CostMode, spentUsd: number, cap: number): CostMode {
  const t = budgetTier(spentUsd, cap).tier;
  if (t === 'cheap-first' || t === 'stop-premium' || t === 'hard-stop') return 'ECO';
  if (t === 'optimize' && (mode === 'QUALITY' || mode === 'PREMIUM')) return 'BALANCED';
  return mode;
}

// ───────── video quality gate ─────────
export type GateStatus = 'GENERATED' | 'VALIDATED' | 'NEEDS_REVIEW' | 'REJECTED';
export interface GateCheck {
  id: string;
  ok: boolean | null;
  detail: string;
}
export interface GateInput {
  /** The provider answered `completed`. */
  providerCompleted: boolean;
  bytes: number;
  mime: string;
  /** Measured on the real Blob in a <video> element (null = not measurable). */
  playable: boolean | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  expected?: { duration?: number; aspect?: string };
  /** Optional vision-judge scores 0-100 (paid call, opt-in). Absent = not evaluated. */
  judge?: {
    promptAdherence: number;
    character: number;
    sceneAdherence: number;
    motion: number;
    consistency: number;
  };
}
const aspectOf = (a: string): number | null => {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(a);
  return m ? Number(m[1]) / Number(m[2]) : null;
};
export function videoGate(i: GateInput): { status: GateStatus; checks: GateCheck[] } {
  const c: GateCheck[] = [];
  c.push({
    id: 'http',
    ok: i.providerCompleted,
    detail: i.providerCompleted ? 'le fournisseur a répondu « completed »' : 'job non terminé',
  });
  c.push({
    id: 'blob',
    ok: i.bytes > 0,
    detail: i.bytes > 0 ? `${(i.bytes / 1e6).toFixed(2)} Mo` : 'fichier vide ou absent',
  });
  c.push({ id: 'mime', ok: /^video\//i.test(i.mime), detail: i.mime || 'MIME inconnu' });
  c.push({
    id: 'playable',
    ok: i.playable,
    detail:
      i.playable === null
        ? 'lecture non testée'
        : i.playable
          ? 'le navigateur lit le fichier'
          : 'le navigateur ne peut pas lire ce fichier (codec ou fichier invalide)',
  });
  const hasDims = Boolean(i.width && i.height);
  c.push({
    id: 'resolution',
    ok: i.playable === null ? null : hasDims,
    detail: hasDims ? `${i.width}×${i.height}` : 'résolution illisible',
  });
  const wantDur = i.expected?.duration;
  if (i.duration === null) c.push({ id: 'duration', ok: null, detail: 'durée non mesurée' });
  else if (!(i.duration > 0)) c.push({ id: 'duration', ok: false, detail: 'durée nulle' });
  else if (wantDur) {
    const tol = Math.max(1, wantDur * 0.25);
    const ok = Math.abs(i.duration - wantDur) <= tol;
    c.push({
      id: 'duration',
      ok,
      detail: `${i.duration.toFixed(1)} s mesurées pour ${wantDur} s demandées (tolérance ±${tol.toFixed(1)} s)`,
    });
  } else c.push({ id: 'duration', ok: true, detail: `${i.duration.toFixed(1)} s` });
  const want = i.expected?.aspect ? aspectOf(i.expected.aspect) : null;
  if (want && hasDims) {
    const got = i.width! / i.height!;
    const ok = Math.abs(got - want) / want <= 0.05;
    c.push({ id: 'aspect', ok, detail: `${got.toFixed(3)} mesuré pour ${i.expected!.aspect} demandé` });
  } else c.push({ id: 'aspect', ok: null, detail: 'ratio non comparé' });
  if (i.judge) {
    for (const [k, v] of Object.entries(i.judge))
      c.push({ id: `judge.${k}`, ok: v >= 60, detail: `${v}/100 (juge vision, mesuré)` });
  } else
    c.push({
      id: 'judge',
      ok: null,
      detail: 'cohérence cognitive non évaluée (appel payant à lancer explicitement)',
    });
  const hard = ['http', 'blob', 'mime', 'playable'].some((k) => c.find((x) => x.id === k)?.ok === false);
  const res = c.find((x) => x.id === 'resolution')?.ok === false;
  const soft = ['duration', 'aspect'].some((k) => c.find((x) => x.id === k)?.ok === false);
  const judgeScores = i.judge ? Object.values(i.judge) : [];
  const judgeMin = judgeScores.length ? Math.min(...judgeScores) : null;
  let status: GateStatus;
  if (hard || res || (judgeMin !== null && judgeMin < 30)) status = 'REJECTED';
  else if (soft || (judgeMin !== null && judgeMin < 60)) status = 'NEEDS_REVIEW';
  else if (c.find((x) => x.id === 'playable')?.ok === true) status = 'VALIDATED';
  else status = 'GENERATED';
  return { status, checks: c };
}

// ───────── asset graph ─────────
export interface GraphNode {
  id: string;
  kind: string;
  label: string;
  sceneId?: string;
  characterId?: string;
  model?: string;
  cost: number | null;
  status: string;
  createdAt?: number;
  prompt?: string;
}
export interface GraphEdge {
  from: string;
  to: string;
  rel: string;
  /** 'recorded' = stored at generation time, 'derived' = deduced from the blueprint. */
  source: 'recorded' | 'derived';
}
export function assetGraph(bp: Blueprint, assets: Record<string, AssetMeta>) {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const add = (n: GraphNode) => nodes.set(n.id, n);
  const link = (from: string, to: string, rel: string, source: GraphEdge['source']) => {
    if (from !== to && !edges.some((e) => e.from === from && e.to === to))
      edges.push({ from, to, rel, source });
  };
  for (const c of bp.characters)
    add({ id: `char:${c.id}`, kind: 'CHARACTER', label: c.name, cost: null, status: 'DNA' });
  for (const id of bp.assets) {
    const a = assets[id];
    if (!a) continue;
    add({
      id,
      kind: a.kind.toUpperCase(),
      label: a.name,
      sceneId: a.sceneId,
      characterId: a.characterId,
      model: a.model,
      cost: a.cost,
      status: a.gate?.status ?? a.status,
      createdAt: a.createdAt,
      prompt: a.prompt,
    });
    for (const p of a.parentIds ?? []) link(p, id, 'généré à partir de', 'recorded');
  }
  for (const c of bp.characters) {
    const ref = c.referenceAssetId;
    if (ref && nodes.has(ref)) link(`char:${c.id}`, ref, 'référence', 'derived');
  }
  for (const sc of bp.scenes) {
    if (sc.imageAssetId && nodes.has(sc.imageAssetId)) {
      for (const n of sc.characters) {
        const ch = bp.characters.find((x) => x.name.toUpperCase() === n.toUpperCase());
        if (ch?.referenceAssetId && nodes.has(ch.referenceAssetId))
          link(ch.referenceAssetId, sc.imageAssetId, 'personnage dans la scène', 'derived');
      }
    }
    if (sc.videoAssetId && nodes.has(sc.videoAssetId) && sc.imageAssetId)
      link(sc.imageAssetId, sc.videoAssetId, 'image → vidéo', 'derived');
    for (const [k, v] of Object.entries(bp.audio.voices ?? {})) {
      if (k.startsWith(`${sc.scene_id}:`) && nodes.has(v.assetId))
        link(
          sc.videoAssetId ?? sc.imageAssetId ?? `scene:${sc.scene_id}`,
          v.assetId,
          'voix de la scène',
          'derived',
        );
    }
    for (const s of bp.audio.sfx)
      if (s.sceneId === sc.scene_id && s.assetId && nodes.has(s.assetId))
        link(
          sc.videoAssetId ?? sc.imageAssetId ?? `scene:${sc.scene_id}`,
          s.assetId,
          'bruitage de la scène',
          'derived',
        );
  }
  for (const e of edges)
    for (const id of [e.from, e.to])
      if (!nodes.has(id) && id.startsWith('scene:'))
        add({ id, kind: 'SCENE', label: id.slice(6), cost: null, status: 'DNA' });
  const chains = bp.scenes.map((sc) => {
    const parts: string[] = [];
    const first = bp.characters.find((c) =>
      sc.characters.some((n) => n.toUpperCase() === c.name.toUpperCase()),
    );
    if (first) parts.push(`PERSONNAGE ${first.name}`);
    if (first?.referenceAssetId) parts.push('RÉFÉRENCE');
    parts.push(sc.imageAssetId ? 'IMAGE' : 'image ✗');
    parts.push(sc.videoAssetId ? 'VIDÉO' : 'vidéo ✗');
    const voices = Object.keys(bp.audio.voices ?? {}).filter((k) => k.startsWith(`${sc.scene_id}:`)).length;
    parts.push(voices ? `VOIX ×${voices}` : 'voix ✗');
    const sfx = bp.audio.sfx.filter((s) => s.sceneId === sc.scene_id && s.assetId).length;
    parts.push(sfx ? `SFX ×${sfx}` : 'sfx ✗');
    parts.push(bp.timeline.clips.some((c) => c.sceneId === sc.scene_id) ? 'CLIP' : 'clip ✗');
    return { sceneId: sc.scene_id, parts };
  });
  return { nodes: [...nodes.values()], edges, chains };
}

// ───────── versions ─────────
export const MAX_VERSIONS = 10;
const strip = (bp: Blueprint): Omit<Blueprint, 'versions'> => {
  const { versions: _v, ...rest } = bp;
  void _v;
  return JSON.parse(JSON.stringify(rest)) as Omit<Blueprint, 'versions'>;
};
export function snapshotVersion(bp: Blueprint, label: string, now = Date.now()): Blueprint {
  const v: BlueprintVersion = {
    id: `v${(bp.versions?.length ?? 0) + 1}-${now.toString(36)}`,
    at: now,
    label: label || `Version ${(bp.versions?.length ?? 0) + 1}`,
    cost: spent(bp),
    quality: bp.qa?.total ?? null,
    scenes: bp.scenes.length,
    assets: bp.assets.length,
    models: bp.models,
    snapshot: strip(bp),
  };
  return { ...bp, versions: [...(bp.versions ?? []), v].slice(-MAX_VERSIONS) };
}
/** Restores the creative content; what was really spent / generated since (costs, assets, jobs, decisions) is KEPT. */
export function restoreVersion(bp: Blueprint, id: string, now = Date.now()): Blueprint | null {
  const v = bp.versions?.find((x) => x.id === id);
  if (!v) return null;
  const snap = JSON.parse(JSON.stringify(v.snapshot)) as Omit<Blueprint, 'versions'>;
  return {
    ...snap,
    versions: bp.versions,
    costs: bp.costs,
    assets: [...new Set([...bp.assets, ...snap.assets])],
    generationJobs: [...new Set([...bp.generationJobs, ...snap.generationJobs])],
    models: [...new Set([...bp.models, ...snap.models])],
    decisions: bp.decisions,
    project: { ...snap.project, updatedAt: now },
    revisions: [...bp.revisions, { at: now, note: `restauration de « ${v.label} »` }].slice(-200),
  };
}

// ───────── production plan (JSON) ─────────
export function productionPlan(bp: Blueprint) {
  return {
    production: {
      title: bp.title,
      genre: bp.story?.theme ?? '',
      duration: bp.duration,
      aspect_ratio: bp.aspect,
      target: bp.platform,
      dimension: dimensionOf(bp.styleDNA),
      language: bp.language,
    },
    story: bp.story,
    characters: bp.characters.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      consistency: c.consistency,
      referenceAssetId: c.referenceAssetId ?? null,
    })),
    locations: bp.worlds.map((w) => ({
      name: w.name,
      architecture: w.architecture,
      palette: w.palette,
      lighting: w.lighting,
    })),
    style: bp.styleDNA,
    scenes: bp.scenes.map((s) => ({
      id: s.scene_id,
      duration: s.duration,
      location: s.location,
      characters: s.characters,
      action: s.action,
      emotion: s.emotion,
      camera: s.camera,
      lighting: s.lighting,
      sound: s.sound,
      music: s.music,
      transition: s.transition,
      imageAssetId: s.imageAssetId ?? null,
      videoAssetId: s.videoAssetId ?? null,
      status: s.status,
    })),
    dialogues: bp.scenes.flatMap((s) =>
      s.dialogue.map((d, i) => ({
        scene: s.scene_id,
        index: i,
        speaker: d.speaker,
        text: d.text,
        language: d.language,
        emotion: d.emotion,
      })),
    ),
    voices: bp.voices,
    sound_design: bp.audio.sfx.map((x) => ({ scene: x.sceneId, type: x.label, assetId: x.assetId ?? null })),
    music: bp.audio.music ?? null,
    subtitles: { style: bp.subtitles.style, lines: bp.subtitles.lines.length },
    editing: { clips: bp.timeline.clips.length, aspect: bp.timeline.aspect },
    export: { stages: bp.stages },
  };
}

// ───────── cost ladder ─────────
export interface CostLadder {
  cheapestCapable: { model: string; usd: number | null } | null;
  bestValue: { model: string; usd: number; quality: number; qualityPerDollar: number } | null;
  bestValueWhy: string;
  champion: { model: string; usd: number | null } | null;
  premium: { model: string; usd: number | null } | null;
  premiumWhy: string;
}
/** CHEAPEST CAPABLE / BEST VALUE / CHAMPION / PREMIUM from real candidates. Best value needs measured quality (n ≥ 20). */
export function costLadder(cands: Candidate[]): CostLadder {
  const known = cands.filter((c) => c.estimate.usd !== null);
  const sorted = [...known].sort((a, b) => a.estimate.usd! - b.estimate.usd!);
  const pick = (c?: Candidate) => (c ? { model: c.model.id, usd: c.estimate.usd } : null);
  const measured = cands.filter(
    (c) =>
      c.history &&
      c.history.n >= 20 &&
      c.history.quality !== null &&
      c.estimate.usd !== null &&
      c.estimate.usd > 0,
  );
  const bv = [...measured].sort(
    (a, b) => b.history!.quality! / b.estimate.usd! - a.history!.quality! / a.estimate.usd!,
  )[0];
  return {
    cheapestCapable: pick(sorted[0]),
    bestValue: bv
      ? {
          model: bv.model.id,
          usd: bv.estimate.usd!,
          quality: bv.history!.quality!,
          qualityPerDollar: bv.history!.quality! / bv.estimate.usd!,
        }
      : null,
    bestValueWhy: bv
      ? 'qualité mesurée (n ≥ 20) ÷ prix estimé'
      : 'INSUFFICIENT DATA : aucune qualité mesurée sur n ≥ 20 générations',
    champion: pick(cands.find((c) => c.history?.champion)),
    premium: pick(sorted.at(-1)),
    premiumWhy: 'le plus cher annoncé : un indice de prix, pas une preuve de qualité',
  };
}
export const savedVsPremium = (actual: number | null, premium: number | null): number | null =>
  actual === null || premium === null ? null : Math.max(0, premium - actual);

/** Spend of video jobs of a project (real provider costs only). */
export const videoSpend = (jobs: Job[], projectId: string) =>
  jobs.filter((j) => j.projectId === projectId && j.kind === 'video').reduce((s, j) => s + (j.cost ?? 0), 0);

// ───────── diagnostics ─────────
export interface DiagItem {
  id: string;
  label: string;
  status: 'ok' | 'fail' | 'warn' | 'na';
  detail: string;
}
export const diagSummary = (items: DiagItem[]) => ({
  ok: items.filter((i) => i.status === 'ok').length,
  fail: items.filter((i) => i.status === 'fail').length,
  warn: items.filter((i) => i.status === 'warn').length,
  na: items.filter((i) => i.status === 'na').length,
});

// ───────── production presets (wizard) ─────────
export interface Preset {
  id: string;
  label: string;
  duration: number;
  aspect: string;
  platform: string;
  dialogue: boolean;
  note: string;
}
export const PRESETS: Preset[] = [
  {
    id: 'tiktok',
    label: 'TikTok',
    duration: 62,
    aspect: '9:16',
    platform: 'TikTok',
    dialogue: true,
    note: 'vertical, accroche en 1 s, plus de 60 s pour le Creator Rewards',
  },
  {
    id: 'reels',
    label: 'Reels',
    duration: 45,
    aspect: '9:16',
    platform: 'Instagram Reels',
    dialogue: true,
    note: 'vertical, rythme rapide',
  },
  {
    id: 'shorts',
    label: 'YouTube Shorts',
    duration: 55,
    aspect: '9:16',
    platform: 'YouTube Shorts',
    dialogue: true,
    note: 'vertical, moins de 60 s',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    duration: 180,
    aspect: '16:9',
    platform: 'YouTube',
    dialogue: true,
    note: 'horizontal, narration plus posée',
  },
  {
    id: 'ad',
    label: 'Publicité',
    duration: 30,
    aspect: '16:9',
    platform: 'Publicité',
    dialogue: true,
    note: 'message unique, appel à l’action',
  },
  {
    id: 'animation',
    label: 'Animation',
    duration: 90,
    aspect: '16:9',
    platform: 'YouTube',
    dialogue: true,
    note: 'court-métrage animé',
  },
  {
    id: 'sketch',
    label: 'Sketch',
    duration: 60,
    aspect: '9:16',
    platform: 'TikTok',
    dialogue: true,
    note: 'situation comique, chute courte',
  },
  {
    id: 'story',
    label: 'Storytelling',
    duration: 90,
    aspect: '9:16',
    platform: 'TikTok',
    dialogue: true,
    note: 'récit en trois temps',
  },
  {
    id: 'clip',
    label: 'Clip musical',
    duration: 120,
    aspect: '16:9',
    platform: 'YouTube',
    dialogue: false,
    note: 'musique au centre, peu ou pas de dialogue',
  },
  {
    id: 'doc',
    label: 'Documentaire',
    duration: 180,
    aspect: '16:9',
    platform: 'YouTube',
    dialogue: false,
    note: 'narration, plans d’ambiance',
  },
  {
    id: 'cinema',
    label: 'Cinematic',
    duration: 60,
    aspect: '21:9',
    platform: 'YouTube',
    dialogue: true,
    note: 'cadrage large, lumière travaillée',
  },
];
export const presetById = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0]!;

// ───────── pipeline → space (clickable pipeline) ─────────
export const STAGE_SPACE: Record<string, string> = {
  IDEA: 'control',
  STORY: 'story',
  CHARACTERS: 'character',
  WORLD: 'world',
  STYLE: 'style',
  STORYBOARD: 'scenes',
  IMAGES: 'images',
  VIDEO: 'video',
  DIALOGUE: 'dialogue',
  VOICE: 'voice',
  SOUND: 'sound',
  SUBTITLES: 'subtitles',
  EDIT: 'editor',
  QA: 'control',
  EXPORT: 'control',
};
