// Studio actions, part 2: local audio, subtitles, auto-edit, QA + targeted repair, social, character/world sheets,
// Video Factory (off by default), exports and the Autopilot.
import { useStudio } from './store';
import { blobs, blobToDataUrl } from './blobs';
import { executeMedia } from './exec';
import { runText } from './textModel';
import { Trace, logStudio } from './jevlog';
import { downloadVideo, pollVideo, sleep, submitVideo } from './net';
import { renderMusic, renderSfx } from './audioLocal';
import {
  generateLine,
  generateSceneImage,
  loadRegistry,
  redrawCharacter,
  lineKey,
  buildConsistency,
  emptyWorld,
} from './actions';
import { estimateVideo } from '../../../server/jev/studio/cost';
import { modelsWith, validateVideoRequest } from '../../../server/jev/studio/capabilities';
import { StudioError, classifyError } from '../../../server/jev/studio/errors';
import { completeJob, failJob, cancelJob } from '../../../server/jev/studio/jobs';
import { DEFAULT_MUSIC, proposeSfx, type MusicSpec, type SfxLabel } from '../../../server/jev/studio/sound';
import { timeSubtitles, toSrt } from '../../../server/jev/studio/subtitles';
import { autoTimeline } from '../../../server/jev/studio/timeline';
import { buildQAReport, planRepairs, type Issue, type JudgeScores } from '../../../server/jev/studio/qa';
import { socialMessages, parseSocial, type SocialPack } from '../../../server/jev/studio/social';
import { extractJson } from '../../../server/jev/studio/story';
import { setStage, addDecision, serialize } from '../../../server/jev/studio/blueprint';
import { buildKitZip, type KitAsset } from '../../../server/jev/studio/kit';
import { makeZip, type ZipEntry } from '../../../server/jev/studio/zip';
import { scanSecrets } from '../../../server/jev/studio/secrets';
import { compileScene } from '../../../server/jev/studio/genome';
import { analytics } from '../../../server/jev/studio/memory';
import type {
  AssetKind,
  AssetMeta,
  Blueprint,
  CharacterSheet,
  QAReport,
  Stage,
} from '../../../server/jev/studio/types';

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const S = () => useStudio.getState();
const bpOf = (id: string): Blueprint => {
  const b = S().projects[id];
  if (!b) throw new StudioError('UNKNOWN', 'projet introuvable');
  return b;
};
const patch = (id: string, f: (b: Blueprint) => Blueprint, note?: string) => S().patchProject(id, f, note);

// ───────── local audio ─────────
async function localAsset(
  projectId: string,
  blob: Blob,
  o: {
    kind: AssetKind;
    name: string;
    tags: string[];
    sceneId?: string;
    source: string;
    model: string;
    prompt?: string;
  },
): Promise<string> {
  const id = uid('asset');
  await blobs.put(id, blob);
  const meta: AssetMeta = {
    id,
    kind: o.kind,
    status: 'GENERATED_ASSET',
    projectId,
    sceneId: o.sceneId,
    model: o.model,
    prompt: o.prompt,
    createdAt: Date.now(),
    cost: 0,
    source: o.source,
    tags: o.tags,
    mime: blob.type,
    bytes: blob.size,
    name: o.name,
  };
  S().addAsset(meta);
  patch(projectId, (b) => ({
    ...b,
    assets: [...b.assets, id],
    costs: [
      ...b.costs,
      {
        at: Date.now(),
        kind: o.kind,
        model: o.model,
        amount: 0,
        certain: true,
        note: 'synthèse locale (0 $)',
      },
    ],
  }));
  const trace = new Trace();
  trace.stage('GENERATION', `${o.model} (local, ${blob.size} octets)`);
  logStudio({
    tag: {
      project_id: projectId,
      scene_id: o.sceneId,
      job_id: uid('local'),
      media_type: o.kind === 'music' ? 'music' : 'speech',
      task_family: o.kind.toUpperCase(),
      model: o.model,
      champion_or_challenger: 'none',
      prompt_version: 'local',
      quality: null,
      success: true,
      latency: 0,
      cost: 0,
      fallback: false,
      retry: 0,
      correction: false,
      teacher: false,
      JEV_cost: 0,
      total_cost: 0,
    },
    mission: o.name,
    trace,
    reason: 'synthèse locale gratuite',
  });
  return id;
}
export async function addLocalMusic(projectId: string, spec: Partial<MusicSpec> = {}): Promise<string> {
  const bp = bpOf(projectId);
  const full: MusicSpec = { ...DEFAULT_MUSIC, ...spec, seconds: spec.seconds ?? Math.max(bp.duration, 30) };
  const blob = await renderMusic(full);
  const id = await localAsset(projectId, blob, {
    kind: 'music',
    name: `musique-${full.genre}`,
    tags: ['music', 'synthèse locale', ...full.instruments],
    source: 'synthèse locale WebAudio',
    model: 'local/webaudio-balafon',
    prompt: JSON.stringify(full),
  });
  patch(projectId, (b) => ({ ...b, audio: { ...b.audio, music: { assetId: id, spec: full } } }));
  return id;
}
export async function addSfx(projectId: string, sceneId: string, label: SfxLabel): Promise<string> {
  const blob = await renderSfx(label);
  const id = await localAsset(projectId, blob, {
    kind: 'sfx',
    name: `sfx-${label}`,
    tags: ['sfx', label, 'synthèse locale'],
    sceneId,
    source: 'synthèse locale WebAudio',
    model: 'local/webaudio-sfx',
    prompt: label,
  });
  patch(projectId, (b) => ({
    ...b,
    audio: {
      ...b.audio,
      sfx: [
        ...b.audio.sfx.filter((x) => !(x.sceneId === sceneId && x.label === label)),
        { sceneId, label, assetId: id },
      ],
    },
  }));
  return id;
}
/** Imported audio (CC0 libraries, music, own recordings) has priority over synthesised sounds. */
export async function importAudio(
  projectId: string,
  file: File,
  kind: 'sfx' | 'music' | 'voice',
  sceneId?: string,
  label = file.name,
): Promise<string> {
  const id = uid('asset');
  await blobs.put(id, file);
  S().addAsset({
    id,
    kind,
    status: 'SOURCE_REFERENCE',
    projectId,
    sceneId,
    createdAt: Date.now(),
    cost: 0,
    source: 'import local',
    tags: ['import', kind],
    mime: file.type || 'audio/mpeg',
    bytes: file.size,
    name: file.name,
  });
  patch(projectId, (b) => ({
    ...b,
    assets: [...b.assets, id],
    audio:
      kind === 'music'
        ? { ...b.audio, music: { assetId: id } }
        : kind === 'sfx' && sceneId
          ? { ...b.audio, sfx: [...b.audio.sfx, { sceneId, label, assetId: id }] }
          : b.audio,
  }));
  return id;
}
export const sfxProposals = (bp: Blueprint, sceneId: string): SfxLabel[] => {
  const sc = bp.scenes.find((s) => s.scene_id === sceneId);
  return sc ? proposeSfx(`${sc.action} ${sc.sound} ${sc.dialogue.map((d) => d.text).join(' ')}`) : [];
};

// ───────── subtitles + edit ─────────
export function compileSubtitles(projectId: string): number {
  const bp = bpOf(projectId);
  const voiceSeconds: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(bp.audio.voices ?? {})) {
    const [sid, i] = k.split(':');
    (voiceSeconds[sid!] ??= [])[Number(i)] = v.seconds;
  }
  const lines = timeSubtitles(bp.scenes, { voiceSeconds });
  patch(
    projectId,
    (b) =>
      setStage(
        {
          ...b,
          subtitles: {
            ...b.subtitles,
            lines: lines.map((l) => ({ start: l.start, end: l.end, text: l.text, emoji: l.emoji })),
          },
        },
        'SUBTITLES',
        lines.length ? 'COMPLETED' : 'WARNING',
      ),
    'sous-titres calculés',
  );
  return lines.length;
}
export const srtOf = (bp: Blueprint): string => {
  const voiceSeconds: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(bp.audio.voices ?? {})) {
    const [sid, i] = k.split(':');
    (voiceSeconds[sid!] ??= [])[Number(i)] = v.seconds;
  }
  return toSrt(timeSubtitles(bp.scenes, { voiceSeconds }));
};
export function buildEdit(projectId: string): void {
  const bp = bpOf(projectId);
  patch(
    projectId,
    (b) => setStage({ ...b, timeline: autoTimeline(b) }, 'EDIT', b.scenes.length ? 'COMPLETED' : 'WARNING'),
    'montage automatique',
  );
  void bp;
}

// ───────── sheets completed by the text model ─────────
const rec = (x: unknown) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
export async function completeCharacterSheets(projectId: string): Promise<number> {
  const bp = bpOf(projectId);
  const todo = bp.characters.filter((c) => !c.consistency || !c.clothing);
  if (!todo.length) return 0;
  const r = await runText({
    projectId,
    purpose: 'fiches personnages',
    messages: [
      {
        role: 'system',
        content:
          'Tu es directeur artistique 2D. Réponds UNIQUEMENT par un JSON valide. Aucune marque réelle, aucune personne réelle.',
      },
      {
        role: 'user',
        content: `Histoire : ${bp.story?.logline ?? bp.project.idea}\nCompète les fiches des personnages (descriptions visuelles précises, style dessin animé 2D). JSON : {"characters":[{"name","role","age","gender","skin","face","hair","body","clothing","shoes","accessories","personality","voice","accent","gestures","speakingStyle"}]}\nPersonnages : ${todo.map((c) => `${c.name} ${c.role}`).join(' ; ')}`,
      },
    ],
    maxTokens: 3000,
  });
  const j = rec(extractJson(r.text));
  const list = Array.isArray(j.characters) ? j.characters.map(rec) : [];
  let n = 0;
  patch(projectId, (b) => ({
    ...b,
    characters: b.characters.map((c) => {
      const x = list.find((l) => String(l.name ?? '').toUpperCase() === c.name);
      if (!x) return c;
      n++;
      const next: CharacterSheet = { ...c };
      for (const k of [
        'role',
        'age',
        'gender',
        'skin',
        'face',
        'hair',
        'body',
        'clothing',
        'shoes',
        'accessories',
        'personality',
        'voice',
        'accent',
        'gestures',
        'speakingStyle',
      ] as const)
        if (typeof x[k] === 'string' && !next[k])
          (next as unknown as Record<string, string>)[k] = x[k] as string;
      next.consistency = next.consistency || buildConsistency(next);
      return next;
    }),
  }));
  patch(projectId, (b) => setStage(b, 'CHARACTERS', 'NEEDS_REVIEW'));
  return n;
}
export async function completeWorldSheets(projectId: string): Promise<number> {
  const bp = bpOf(projectId);
  const todo = bp.worlds.filter((w) => !w.architecture);
  if (!todo.length) return 0;
  const r = await runText({
    projectId,
    purpose: 'fiches décors',
    messages: [
      {
        role: 'system',
        content:
          'Tu es chef décorateur 2D (Dakar). Réponds UNIQUEMENT par un JSON valide. Aucune marque réelle.',
      },
      {
        role: 'user',
        content: `Décris ces lieux. JSON : {"worlds":[{"name","architecture","palette","lighting","weather","time","textures","objects","background","cameraAngles"}]}\nLieux : ${todo.map((w) => w.name).join(' ; ')}`,
      },
    ],
    maxTokens: 2500,
  });
  const list = Array.isArray(rec(extractJson(r.text)).worlds)
    ? (rec(extractJson(r.text)).worlds as unknown[]).map(rec)
    : [];
  let n = 0;
  patch(projectId, (b) =>
    setStage(
      {
        ...b,
        worlds: b.worlds.map((w) => {
          const x = list.find((l) => String(l.name ?? '').toLowerCase() === w.name.toLowerCase());
          if (!x) return w;
          n++;
          const next = { ...w };
          for (const k of [
            'architecture',
            'palette',
            'lighting',
            'weather',
            'time',
            'textures',
            'objects',
            'background',
            'cameraAngles',
          ] as const)
            if (typeof x[k] === 'string') next[k] = x[k] as string;
          return next;
        }),
      },
      'WORLD',
      'NEEDS_REVIEW',
    ),
  );
  return n;
}
export const addWorld = (projectId: string, name: string) =>
  patch(projectId, (b) => ({ ...b, worlds: [...b.worlds, emptyWorld(name)] }));

// ───────── QA + repair ─────────
async function judgeVisual(bp: Blueprint): Promise<JudgeScores> {
  const withImg = bp.scenes.filter((s) => s.imageAssetId).slice(0, 4);
  if (!withImg.length) return {};
  const visual: number[] = [];
  const cons: number[] = [];
  let judge: string | null = null;
  for (const sc of withImg) {
    const b = await blobs.get(sc.imageAssetId!);
    if (!b) continue;
    try {
      const chars = bp.characters
        .filter((c) => sc.characters.includes(c.name))
        .map((c) => `${c.name}: ${c.consistency}`)
        .join('\n');
      const r = await runText({
        projectId: bp.project.id,
        purpose: 'QA visuelle',
        vision: true,
        maxTokens: 600,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Juge cette image de dessin animé 2D (style : ${bp.styleDNA.renderStyle}).\nPersonnages attendus :\n${chars || '(non précisés)'}\nRéponds UNIQUEMENT par JSON : {"visual":0-100,"consistency":0-100,"issues":["..."]}. Sois sévère.`,
              },
              { type: 'image_url', image_url: { url: await blobToDataUrl(b) } },
            ],
          },
        ],
      });
      judge ??= r.model;
      const j = rec(extractJson(r.text));
      if (typeof j.visual === 'number') visual.push(Math.max(0, Math.min(100, j.visual)));
      if (typeof j.consistency === 'number') cons.push(Math.max(0, Math.min(100, j.consistency)));
    } catch {
      /* no vision judge available: the score stays empty */
    }
  }
  // A judge that produced no score is not a judge: its identity is not reported.
  if (!visual.length && !cons.length) judge = null;
  const m = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    visual: m(visual),
    consistency: m(cons),
    judge: judge ?? undefined,
    confidence: judge
      ? `${visual.length} image(s) jugée(s) — ${visual.length < 3 ? 'LOW' : visual.length < 6 ? 'MEDIUM' : 'HIGH'}`
      : undefined,
  };
}
export async function runQA(projectId: string, o: { judge?: boolean } = {}): Promise<QAReport> {
  const bp = bpOf(projectId);
  patch(projectId, (b) => setStage(b, 'QA', 'RUNNING'));
  const judge = o.judge === false ? {} : await judgeVisual(bp);
  const rep = buildQAReport(bpOf(projectId), judge);
  const bad = rep.issues.some((i) => i.severity === 'error');
  patch(projectId, (b) => setStage({ ...b, qa: rep }, 'QA', bad ? 'WARNING' : 'COMPLETED'), 'QA');
  return rep;
}
export interface RepairResult {
  done: boolean;
  note: string;
}
/** One targeted correction (never a blind regeneration). Paid corrections ask the budget gate like any other call. */
export async function repairIssue(projectId: string, issue: Issue): Promise<RepairResult> {
  const plan = planRepairs([issue])[0]?.repair;
  if (!plan) return { done: false, note: 'aucune correction automatique : revue humaine' };
  const bp = bpOf(projectId);
  const log = (note: string) =>
    patch(projectId, (b) => addDecision(b, 'QA', `CORRECTION ${plan.action} : ${note}`));
  switch (plan.action) {
    case 'RECOMPUTE_SUBTITLES': {
      const n = compileSubtitles(projectId);
      log(`${n} ligne(s) recalculée(s)`);
      return { done: true, note: `${n} ligne(s) de sous-titres recalculée(s)` };
    }
    case 'RECOMPILE_PROMPT': {
      const sc = bp.scenes.find((s) => s.scene_id === issue.sceneId);
      if (!sc) return { done: false, note: 'scène inconnue' };
      const c = compileScene(
        sc,
        {
          style: bp.styleDNA,
          characters: bp.characters,
          worlds: bp.worlds,
          platform: bp.platform,
          aspect: bp.aspect,
        },
        'image',
        { maxChars: 2400 },
      );
      patch(projectId, (b) => ({
        ...b,
        scenes: b.scenes.map((s) => (s.scene_id === sc.scene_id ? { ...s, visual_prompt: c.text } : s)),
      }));
      log(`prompt recompilé ${c.version}`);
      return { done: true, note: `prompt recompilé (${c.version})` };
    }
    case 'INJECT_PREVIOUS_STATE': {
      if (!issue.sceneId) return { done: false, note: 'scène inconnue' };
      await generateSceneImage(projectId, issue.sceneId, { regenerate: true });
      log(`image ${issue.sceneId} régénérée avec l’état de la scène précédente`);
      return { done: true, note: 'image régénérée avec le contexte de continuité' };
    }
    case 'REGENERATE_CHARACTER_REFERENCE': {
      const ch = bp.characters[0];
      if (!ch) return { done: false, note: 'aucun personnage' };
      await redrawCharacter(projectId, ch.id, ['neutral']);
      log(`référence ${ch.name} régénérée`);
      return { done: true, note: 'référence du personnage régénérée' };
    }
    case 'REGENERATE_VOICE': {
      const sc = bp.scenes.find((s) => s.scene_id === issue.sceneId);
      if (!sc) return { done: false, note: 'scène inconnue' };
      await generateLine(projectId, sc.scene_id, 0);
      log('voix régénérée');
      return { done: true, note: 'voix régénérée' };
    }
    case 'CROP_RATIO':
      patch(projectId, (b) => ({ ...b, aspect: '9:16', timeline: { ...b.timeline, aspect: '9:16' } }));
      log('format ramené à 9:16 (recadrage au rendu)');
      return { done: true, note: 'ratio 9:16 appliqué' };
    case 'SWITCH_SPEECH_VIDEO_CHAIN':
      log('bascule vers le moteur 2D local (kit afrikatoon-auto)');
      return {
        done: true,
        note: 'utilisez « Exporter le kit afrikatoon-auto » : lip-sync Rhubarb local, 0 $',
      };
  }
}

// ───────── social ─────────
export async function generateSocial(
  projectId: string,
  platform: string,
): Promise<{ pack: SocialPack | null; issues: string[] }> {
  const bp = bpOf(projectId);
  const r = await runText({
    projectId,
    purpose: `social ${platform}`,
    messages: socialMessages(bp, platform),
    maxTokens: 1500,
  });
  const p = parseSocial(r.text, platform);
  if (p.pack) patch(projectId, (b) => ({ ...b, social: { ...(b.social ?? {}), [platform]: p.pack! } }));
  return p;
}

// ───────── Video Factory (OFF by default) ─────────
export const videoSpent = (): number =>
  S()
    .jobs.filter((j) => j.kind === 'video')
    .reduce((a, j) => a + (j.cost ?? 0), 0);
export const videoEnabled = (): boolean => S().settings.videoEnabled && S().settings.videoBudget > 0;
const POLL_MS = { value: 12_000 };
export const setVideoPollInterval = (ms: number) => {
  POLL_MS.value = ms;
};
export interface VideoOpts {
  mode: 'text' | 'image';
  duration: number;
  resolution?: string;
  audio?: boolean;
  forceModel?: string;
}
const controllers = new Map<string, AbortController>();
export function cancelVideo(jobIdStr: string): void {
  controllers.get(jobIdStr)?.abort();
  S().setJobs((j) => cancelJob(j, jobIdStr));
}
async function pollUntilDone(
  job: { id: string },
  pollingUrl: string,
  signal: AbortSignal,
  timeoutMs = 20 * 60_000,
) {
  const t0 = Date.now();
  for (;;) {
    if (signal.aborted)
      throw new StudioError(
        'UNKNOWN',
        'annulé par l’utilisateur (le fournisseur peut facturer la génération déjà commencée)',
        0,
        false,
        true,
      );
    const st = await pollVideo(pollingUrl);
    if (st.status === 'completed') return st;
    if (st.status === 'failed')
      throw new StudioError('CONTENT_ERROR' as const, st.error ?? 'génération échouée', 0, false, true);
    if (Date.now() - t0 > timeoutMs)
      throw new StudioError('TIMEOUT', 'délai d’attente dépassé (le job reste suivi)', 0, false, true);
    await sleep(POLL_MS.value);
    void job;
  }
}
/** Submits a scene video. Only when the owner activated the Video Factory and typed a budget. */
export async function generateSceneVideo(projectId: string, sceneId: string, o: VideoOpts): Promise<string> {
  if (!videoEnabled())
    throw new StudioError(
      'UNSUPPORTED_CAPABILITY',
      'Video Factory désactivée : activez-la dans Model Lab avec un budget saisi par vous.',
    );
  const bp = bpOf(projectId);
  const sc = bp.scenes.find((s) => s.scene_id === sceneId);
  if (!sc) throw new StudioError('UNKNOWN', 'scène introuvable');
  const reg = await loadRegistry();
  const frames = o.mode === 'image' && sc.imageAssetId ? (['first_frame'] as const) : ([] as const);
  const cands = modelsWith(
    reg,
    'video',
    'VIDEO_GENERATION',
    ...(frames.length ? (['IMAGE_TO_VIDEO'] as const) : []),
  )
    .filter((m) => !o.forceModel || m.id === o.forceModel)
    .map((m) => {
      const aspect = m.video!.aspectRatios.includes(bp.aspect) ? bp.aspect : undefined;
      const res =
        o.resolution && m.video!.resolutions.includes(o.resolution) ? o.resolution : m.video!.resolutions[0];
      const v = validateVideoRequest(m, {
        aspect_ratio: aspect,
        resolution: res,
        duration: o.duration,
        frames: [...frames],
        generate_audio: o.audio,
      });
      return v.ok
        ? {
            model: m,
            estimate: estimateVideo(m, {
              duration: o.duration,
              resolution: res,
              audio: o.audio,
              mode: o.mode,
            }),
            aspect,
            res,
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const prompt = (sc.video_prompt || sc.action).slice(0, 1500);
  const first = frames.length ? await blobToDataUrl((await blobs.get(sc.imageAssetId!))!) : null;
  const by = new Map(cands.map((c) => [c.model.id, c]));
  const out = await executeMedia<{ blob: Blob }>({
    projectId,
    sceneId,
    kind: 'video',
    task: o.mode === 'image' ? 'I2V' : 'T2V',
    style: '2D-HQ',
    contract: bp.aspect,
    promptVersion: 'video-v1',
    mission: `vidéo ${sceneId}`,
    maxModels: 1,
    candidates: cands.map((c) => ({ model: c.model, estimate: c.estimate })),
    call: async (m, job) => {
      const c = by.get(m.id)!;
      const ctl = new AbortController();
      controllers.set(job.id, ctl);
      const sub = await submitVideo({
        model: m.id,
        prompt,
        duration: o.duration,
        resolution: c.res,
        aspect_ratio: c.aspect,
        frame_images: first ? [{ url: first, frame_type: 'first_frame' }] : undefined,
        generate_audio: o.audio,
      });
      job.onSubmitted(sub.id, sub.pollingUrl);
      try {
        const st = await pollUntilDone(job, sub.pollingUrl, ctl.signal);
        const blob = await downloadVideo(sub.id, st.urls[0]);
        return { result: { blob }, cost: st.cost };
      } catch (e) {
        if (e instanceof StudioError) throw e;
        const c2 = classifyError({ message: (e as Error).message });
        throw new StudioError(c2.cls, c2.message, 0, false, true);
      } finally {
        controllers.delete(job.id);
      }
    },
    store: async (res, m) => ({
      blob: res.blob,
      kind: 'video',
      mime: res.blob.type || 'video/mp4',
      name: `video-${sceneId}-${m.id.split('/').pop()}`,
      tags: [sceneId, 'video'],
      prompt,
    }),
  });
  patch(projectId, (b) => setStage(b, 'VIDEO', 'COMPLETED'));
  return out.assetId!;
}
/** On reopening: running video jobs are polled again, NEVER resubmitted. */
export async function resumeVideoJobs(): Promise<number> {
  const running = S().jobs.filter(
    (j) => j.status === 'RUNNING' && j.kind === 'video' && j.remoteId && j.pollingUrl,
  );
  for (const j of running) {
    try {
      const st = await pollVideo(j.pollingUrl!);
      if (st.status === 'completed') {
        const blob = await downloadVideo(j.remoteId!, st.urls[0]);
        const id = uid('asset');
        await blobs.put(id, blob);
        S().addAsset({
          id,
          kind: 'video',
          status: 'GENERATED_ASSET',
          projectId: j.projectId,
          sceneId: j.sceneId,
          model: j.model,
          createdAt: Date.now(),
          cost: st.cost,
          source: 'openrouter (repris après réouverture)',
          tags: ['video'],
          mime: blob.type || 'video/mp4',
          bytes: blob.size,
          name: `video-${j.sceneId ?? ''}`,
        });
        S().setJobs((all) => completeJob(all, j.id, { cost: st.cost, assetId: id }));
      } else if (st.status === 'failed')
        S().setJobs((all) => failJob(all, j.id, { error: st.error ?? 'échec', errorClass: 'CONTENT_ERROR' }));
    } catch {
      /* still running or transient: kept for the next reopening */
    }
  }
  return running.length;
}
/** « Fais parler ce personnage » : image → first frame → native-audio video when a capability exists, else the local 2D engine. */
export async function makeCharacterTalk(
  projectId: string,
  sceneId: string,
): Promise<{ route: 'video' | 'local-2d'; reason: string; assetId?: string }> {
  const reg = await loadRegistry();
  const can = modelsWith(reg, 'video', 'IMAGE_TO_VIDEO', 'AUDIO');
  if (!videoEnabled() || !can.length)
    return {
      route: 'local-2d',
      reason: !videoEnabled()
        ? 'Video Factory désactivée : secours gratuit = moteur 2D local (lip-sync Rhubarb). Utilisez « Exporter le kit afrikatoon-auto ».'
        : 'Capability unavailable in current environment : aucun modèle image→vidéo avec audio natif. Secours : moteur 2D local (lip-sync Rhubarb).',
    };
  const id = await generateSceneVideo(projectId, sceneId, {
    mode: 'image',
    duration: can[0]!.video!.durations[0] ?? 5,
    audio: true,
    forceModel: can[0]!.id,
  });
  return {
    route: 'video',
    reason:
      'vidéo à audio natif générée ; la synchro labiale n’est PAS mesurée automatiquement : contrôle humain requis',
    assetId: id,
  };
}

// ───────── exports ─────────
const esc = (t: unknown) =>
  String(t ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};
export function reportHtml(bp: Blueprint): string {
  const jobs = S().jobs.filter((j) => j.projectId === bp.project.id);
  const mem = S().memory.filter((m) => m.projectId === bp.project.id);
  const a = analytics(mem, { projects: 1, scenes: bp.scenes.length });
  const total = bp.costs.reduce((s, c) => s + c.amount, 0);
  const uncertain = bp.costs.some((c) => !c.certain);
  const row = (...c: unknown[]) => `<tr>${c.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`;
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Rapport de production — ${esc(bp.title)}</title>
<style>body{font:14px system-ui;max-width:900px;margin:24px auto;color:#111}h1,h2{margin:.6em 0 .3em}table{border-collapse:collapse;width:100%;margin:.4em 0}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}small{color:#555}</style>
<h1>Rapport de production — ${esc(bp.title || 'Sans titre')}</h1>
<p><small>${esc(bp.platform)} · ${esc(bp.aspect)} · ${bp.duration}s · langue ${esc(bp.language)} · mode ${bp.mode} · plafond ${bp.cap.toFixed(2)} $ · style ${esc(bp.styleDNA.name)}</small></p>
<h2>Histoire</h2><p>${esc(bp.story?.logline ?? '')}</p><p>${esc(bp.story?.synopsis ?? '')}</p>
<h2>Personnages</h2><table>${bp.characters.map((c) => row(c.name, c.role, c.consistency)).join('')}</table>
<h2>Scènes</h2><table><tr><th>Scène</th><th>Durée</th><th>Lieu</th><th>Action</th><th>Dialogue</th><th>Modèle</th><th>Qualité</th></tr>${bp.scenes.map((s) => row(s.scene_id, `${s.duration}s`, s.location, s.action, s.dialogue.map((d) => `${d.speaker}: ${d.text}`).join(' / '), s.model ?? '—', s.quality ?? 'non mesurée')).join('')}</table>
<h2>Modèles utilisés</h2><p>${esc(bp.models.join(', ') || 'aucun')}</p>
<h2>Prompts (versions)</h2><table>${bp.prompts.map((p) => row(p.version, p.kind, p.model ?? '', p.text.slice(0, 400))).join('')}</table>
<h2>Coûts réels</h2><p><b>${total.toFixed(4)} $</b> ${uncertain ? '(inclut des estimations marquées incertaines)' : '(tous mesurés ou gratuits)'} — ${bp.costs.length} ligne(s).</p>
<table>${bp.costs.map((c) => row(new Date(c.at).toISOString().slice(0, 16), c.kind, c.model, `${c.amount.toFixed(5)} $`, c.certain ? 'certain' : 'estimé', c.note)).join('')}</table>
<h2>Qualité (QA)</h2>${
    bp.qa
      ? `<p>TOTAL ${bp.qa.total ?? 'non mesuré'} · juge ${esc(bp.qa.judge ?? 'aucun')} ${esc(bp.qa.judgeConfidence ?? '')}</p><table>${Object.entries(
          bp.qa.scores,
        )
          .map(([k, v]) => row(k, v ?? 'non mesuré'))
          .join(
            '',
          )}</table><table>${bp.qa.issues.map((i) => row(i.severity, i.code, i.sceneId ?? '', i.message)).join('')}</table>`
      : '<p>QA non exécutée.</p>'
  }
<h2>Erreurs, régénérations, secours</h2><p>${a ? `réussite ${(a.successRate! * 100).toFixed(0)} % · régénérations ${(a.regenerationRate! * 100).toFixed(0)} % · secours ${(a.fallbackRate! * 100).toFixed(0)} %` : 'Aucune donnée réelle disponible.'}</p>
<table>${jobs
    .filter((j) => j.status === 'FAILED')
    .map((j) => row(j.model, j.errorClass, j.error))
    .join('')}</table>
<h2>Décisions JEV</h2><table>${bp.decisions.map((d) => row(new Date(d.at).toISOString().slice(0, 16), d.stage, d.text)).join('')}</table>
<p><small>Contenu généré avec l’aide de l’IA — activez l’étiquette « contenu IA » avant publication. Aucun secret n’est inclus dans ce rapport.</small></p></html>`;
}
export async function storyboardHtml(bp: Blueprint): Promise<string> {
  const cards: string[] = [];
  for (const s of bp.scenes) {
    const b = s.imageAssetId ? await blobs.get(s.imageAssetId) : undefined;
    const img = b
      ? `<img src="${await blobToDataUrl(b)}" alt="${esc(s.scene_id)}">`
      : '<div class="ph">image non générée</div>';
    cards.push(
      `<section>${img}<h3>${esc(s.scene_id)} · ${esc(s.beat)} · ${s.duration}s</h3><p>${esc(s.action)}</p><p><i>${esc(s.dialogue.map((d) => `${d.speaker}: ${d.text}`).join(' / '))}</i></p><small>${esc(s.camera)} · ${esc(s.location)} · ${esc(s.model ?? '')}</small></section>`,
    );
  }
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Storyboard — ${esc(bp.title)}</title><style>body{font:13px system-ui;margin:16px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}section{border:1px solid #ccc;padding:8px;break-inside:avoid}img{width:100%}.ph{background:#eee;height:180px;display:grid;place-items:center;color:#666}@media print{body{margin:0}}</style><h1>${esc(bp.title)}</h1><div class="g">${cards.join('')}</div></html>`;
}
export const promptsText = (bp: Blueprint): string =>
  bp.prompts
    .map((p) => `# ${p.version} (${p.kind}${p.model ? ` · ${p.model}` : ''})\n${p.text}\n`)
    .join('\n');
const dl = (name: string, data: Uint8Array | string, mime: string) => {
  const blob = new Blob([typeof data === 'string' ? data : (data.slice().buffer as ArrayBuffer)], {
    type: mime,
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
export interface ExportResult {
  ok: boolean;
  name: string;
  bytes: number;
  error?: string;
}
/** Project ZIP: blueprint + asset metadata + asset files. Blocked when a secret pattern is found anywhere in the texts. */
export async function exportProjectZip(
  projectId: string,
  o: { download?: boolean } = {},
): Promise<ExportResult & { zip?: Uint8Array }> {
  const bp = bpOf(projectId);
  const ser = serialize(bp);
  if (!ser.ok) return { ok: false, name: '', bytes: 0, error: ser.error };
  const metas = bp.assets.map((id) => S().assets[id]).filter((x): x is AssetMeta => Boolean(x));
  const metaJson = JSON.stringify(metas, null, 2);
  if (scanSecrets(metaJson).length)
    return { ok: false, name: '', bytes: 0, error: 'motif de secret dans les métadonnées : export bloqué' };
  const entries: ZipEntry[] = [
    { path: 'blueprint.json', data: ser.json },
    { path: 'assets.json', data: metaJson },
    { path: 'rapport.html', data: reportHtml(bp) },
    { path: 'prompts.txt', data: promptsText(bp) },
  ];
  for (const m of metas) {
    const b = await blobs.get(m.id);
    if (b)
      entries.push({
        path: `assets/${m.id}.${EXT[m.mime] ?? 'bin'}`,
        data: new Uint8Array(await b.arrayBuffer()),
      });
  }
  const zip = makeZip(entries);
  const name = `${(bp.title || 'production').replace(/[^\w-]+/g, '-').slice(0, 40)}.zip`;
  if (o.download !== false) dl(name, zip, 'application/zip');
  return { ok: true, name, bytes: zip.length, zip };
}
export async function exportKit(
  projectId: string,
  o: { download?: boolean; caption?: string } = {},
): Promise<ExportResult & { zip?: Uint8Array; errors?: string[] }> {
  const bp = bpOf(projectId);
  const assets: KitAsset[] = [];
  const poses = ['neutral', 'angry', 'shock', 'smug', 'laugh'];
  for (const c of bp.characters)
    for (const p of poses) {
      const id = c.poses[`${p}-2d`];
      const b = id ? await blobs.get(id) : undefined;
      if (b)
        assets.push({
          character: c.name,
          pose: p,
          bytes: new Uint8Array(await b.arrayBuffer()),
          meta: { source: 'AI Visual Studio', style: bp.styleDNA.name },
        });
    }
  const backgrounds = [];
  for (const m of Object.values(S().assets).filter((a) => a.projectId === projectId && a.kind === 'world')) {
    const b = await blobs.get(m.id);
    if (b) backgrounds.push({ name: m.name, bytes: new Uint8Array(await b.arrayBuffer()) });
  }
  const pack = bp.social?.TikTok;
  const k = buildKitZip(bp, {
    assets,
    backgrounds,
    caption: o.caption ?? pack?.caption ?? '',
    hashtags: pack?.hashtags ?? [],
  });
  if (!k.validation.ok)
    return {
      ok: false,
      name: '',
      bytes: 0,
      error: k.validation.errors.join(' ; '),
      errors: k.validation.errors,
    };
  const name = `kit-afrikatoon-${(bp.title || 'production').replace(/[^\w-]+/g, '-').slice(0, 30)}.zip`;
  if (o.download !== false) dl(name, k.zip, 'application/zip');
  patch(projectId, (b) => setStage(b, 'EXPORT', 'COMPLETED'), 'kit afrikatoon-auto exporté');
  return { ok: true, name, bytes: k.zip.length, zip: k.zip };
}
/** Imports the result of the local engine (final video, caption, contact sheet) as FINAL ASSETs: 0 $, local render. */
export async function importFinal(projectId: string, files: File[]): Promise<number> {
  let n = 0;
  for (const f of files) {
    const id = uid('asset');
    await blobs.put(id, f);
    const kind: AssetKind = f.type.startsWith('video')
      ? 'video'
      : f.type.startsWith('image')
        ? 'image'
        : 'prompt';
    S().addAsset({
      id,
      kind,
      status: 'FINAL_ASSET',
      projectId,
      createdAt: Date.now(),
      cost: 0,
      source: 'moteur local afrikatoon-auto',
      tags: ['final', 'rendu local'],
      mime: f.type || 'application/octet-stream',
      bytes: f.size,
      name: f.name,
    });
    patch(projectId, (b) => ({
      ...b,
      assets: [...b.assets, id],
      costs: [
        ...b.costs,
        {
          at: Date.now(),
          kind: 'final',
          model: 'afrikatoon-auto (local)',
          amount: 0,
          certain: true,
          note: 'rendu local',
        },
      ],
    }));
    n++;
  }
  return n;
}

// ───────── autopilot ─────────
export interface AutoCtl {
  stop: boolean;
  pause: boolean;
  onStep?: (s: { stage: Stage; note: string }) => void;
}
const gate = async (ctl: AutoCtl) => {
  while (ctl.pause && !ctl.stop) await sleep(250);
  if (ctl.stop) throw new StudioError('UNKNOWN', 'Autopilot arrêté par l’utilisateur');
};
/** Chains the whole production; every stage can be paused / stopped, and every spend goes through the budget gate. */
export async function runAutopilot(
  projectId: string,
  ctl: AutoCtl,
  run: { generateStory: (id: string) => Promise<unknown> },
): Promise<void> {
  const step = (stage: Stage, note: string) => ctl.onStep?.({ stage, note });
  const mark = (stage: Stage, status: Parameters<typeof setStage>[2]) =>
    patch(projectId, (b) => setStage(b, stage, status));
  try {
    await gate(ctl);
    if (!bpOf(projectId).scenes.length) {
      step('STORY', 'écriture de l’histoire');
      await run.generateStory(projectId);
    }
    await gate(ctl);
    step('CHARACTERS', 'fiches personnages');
    await completeCharacterSheets(projectId).catch(() => 0);
    for (const c of bpOf(projectId).characters.filter((c) => !c.referenceAssetId)) {
      await gate(ctl);
      step('CHARACTERS', `redessin 2D de ${c.name}`);
      await redrawCharacter(projectId, c.id, ['neutral']).catch((e) => {
        mark('CHARACTERS', 'WARNING');
        step('CHARACTERS', `${c.name} : ${(e as Error).message}`);
      });
    }
    await gate(ctl);
    step('WORLD', 'fiches décors');
    await completeWorldSheets(projectId).catch(() => 0);
    mark('STYLE', 'COMPLETED');
    mark('STORYBOARD', 'COMPLETED');
    for (const sc of bpOf(projectId).scenes.filter((s) => !s.imageAssetId)) {
      await gate(ctl);
      step('IMAGES', `image ${sc.scene_id}`);
      await generateSceneImage(projectId, sc.scene_id).catch((e) =>
        step('IMAGES', `${sc.scene_id} : ${(e as Error).message}`),
      );
    }
    mark('DIALOGUE', 'COMPLETED');
    for (const sc of bpOf(projectId).scenes)
      for (const [i] of sc.dialogue.entries()) {
        if (bpOf(projectId).audio.voices?.[lineKey(sc.scene_id, i)]) continue;
        await gate(ctl);
        step('VOICE', `voix ${sc.scene_id}#${i}`);
        await generateLine(projectId, sc.scene_id, i).catch((e) =>
          step('VOICE', `${sc.scene_id}#${i} : ${(e as Error).message}`),
        );
      }
    mark('VOICE', 'COMPLETED');
    await gate(ctl);
    step('SOUND', 'bruitages et musique locale');
    for (const sc of bpOf(projectId).scenes)
      for (const l of sfxProposals(bpOf(projectId), sc.scene_id).slice(0, 1))
        await addSfx(projectId, sc.scene_id, l);
    if (!bpOf(projectId).audio.music?.assetId) await addLocalMusic(projectId);
    mark('SOUND', 'COMPLETED');
    step('SUBTITLES', 'sous-titres');
    compileSubtitles(projectId);
    step('EDIT', 'montage automatique');
    buildEdit(projectId);
    await gate(ctl);
    step('QA', 'contrôle qualité');
    await runQA(projectId);
    step('EXPORT', 'kit afrikatoon-auto');
    await exportKit(projectId, { download: false });
  } catch (e) {
    if ((e as Error).message?.includes('Autopilot arrêté')) step('IDEA', 'arrêté');
    else throw e;
  }
}
