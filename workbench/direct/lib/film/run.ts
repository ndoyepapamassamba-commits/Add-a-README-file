// Steps of the film circuit, each one paid call reserved in the HARD budget first: script (vision model looking at the
// scene), one image per plan (the scene image as reference, film ratio), every clip submitted at once (the plan image
// pinned as first frame), polled, downloaded and kept in IndexedDB the moment it exists: a closed tab or a reload never
// pays twice, the job ids are saved before the first poll and polling resumes on reopening.
import { kv } from '../db';
import { downloadClip, makeImage, pollClip, submitClip, writeScript, FilmApiError } from './api';
import {
  Budget,
  BudgetError,
  clipUsd,
  IMAGE_MODELS,
  imagePrompt,
  parseScript,
  planLayout,
  SCRIPT_MODELS,
  SCRIPT_USD,
  scriptPrompt,
  videoPrompt,
  type Script,
  type VideoModel,
} from './circuit';
import type { TroupeScene } from './troupe';

export type ShotStep =
  | 'attente'
  | 'image'
  | 'envoi'
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';
export interface ShotState {
  image?: string;
  imageCost?: number | null;
  job?: string;
  step: ShotStep;
  cost?: number | null;
  error?: string;
  /** IndexedDB key of the downloaded clip. */
  clip?: string;
  t0?: number;
  ms?: number;
}
export interface FilmSettings {
  idee: string;
  ton: string;
  videoModel: string;
  resolution: string;
  aspect: '9:16' | '16:9';
  imageModel: string;
  useImages: boolean;
  sound: boolean;
  captions: boolean;
  accent: string;
  cap: number;
}
export interface FilmProject {
  id: string;
  sceneId: string;
  settings: FilmSettings;
  script: Script | null;
  alertes: string[];
  scriptModel?: string;
  shots: ShotState[];
  /** Real money spent on this project (sum of settled costs), so the cap also holds across reloads. */
  spent: number;
  film?: {
    key: string;
    size: number;
    duration: number;
    audio: boolean;
    at: number;
    mode: 'reencode' | 'copy';
    ext: 'mp4' | 'webm';
    /** Captions as .srt when they could not be burnt in (montage by copy). */
    srt?: string;
    /** Plans in the film / plans in the script (a partial montage says so). */
    plans: number;
    of: number;
  };
}

export const DEFAULT_SETTINGS: FilmSettings = {
  idee: '',
  ton: 'comique, rythme TikTok, chute surprenante',
  videoModel: 'x-ai/grok-imagine-video-1.5',
  resolution: '720p',
  aspect: '9:16',
  imageModel: 'x-ai/grok-imagine-image-2.0',
  useImages: true,
  sound: true,
  captions: true,
  accent: 'an Ivorian French accent (Côte d’Ivoire)',
  cap: 10,
};

export const newProject = (sceneId: string, settings: FilmSettings = DEFAULT_SETTINGS): FilmProject => ({
  id: `film-${Date.now().toString(36)}`,
  sceneId,
  settings: { ...settings },
  script: null,
  alertes: [],
  shots: [],
  spent: 0,
});

export interface RunCtx {
  budget: Budget;
  signal: AbortSignal;
  /** Applies a change to one plan (state + persistence are the caller's). */
  shot: (i: number, patch: Partial<ShotState>) => void;
  /** Adds real money to the project. */
  paid: (usd: number) => void;
}

const pollMs = () => Number((globalThis as { __FILM_POLL_MS?: number }).__FILM_POLL_MS ?? 8000);
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Arrêté', 'AbortError'));
    });
  });

/** Script written while looking at the scene image. */
export async function stepScript(
  p: FilmProject,
  scene: TroupeScene,
  model: VideoModel | null,
  budget: Budget,
  signal: AbortSignal,
) {
  const layout = planLayout(model);
  const { system, user } = scriptPrompt(
    { id: scene.id, titre: scene.titre, acteurs: scene.acteurs },
    p.settings.idee,
    layout,
    p.settings.ton,
  );
  budget.hold('script', SCRIPT_USD);
  try {
    const r = await writeScript(SCRIPT_MODELS, system, user, scene.image, signal);
    budget.settle('script', r.cost);
    const { script, alertes } = parseScript(
      r.text,
      { id: scene.id, titre: scene.titre, acteurs: scene.acteurs },
      layout,
    );
    return { script, alertes, model: r.model, cost: r.cost ?? SCRIPT_USD };
  } catch (e) {
    budget.release('script');
    throw e;
  }
}

const imageUsd = (id: string) => IMAGE_MODELS.find((m) => m.id === id)?.usd ?? 0.08;

/** One image per plan, three at a time; a plan that already has its image is skipped. */
export async function stepImages(
  p: FilmProject,
  scene: TroupeScene,
  ctx: RunCtx,
  only?: number[],
): Promise<void> {
  const s = p.script!;
  const todo = s.plans.map((_, i) => i).filter((i) => (only ? only.includes(i) : !p.shots[i]?.image));
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const i = todo[next++]!;
      const id = `img-${i}-${Date.now()}`;
      ctx.budget.hold(id, imageUsd(p.settings.imageModel));
      ctx.shot(i, { step: 'image', error: undefined });
      try {
        const r = await makeImage(
          {
            model: p.settings.imageModel,
            prompt: imagePrompt(s, s.plans[i]!, p.settings.aspect),
            references: [scene.image],
            aspect: p.settings.aspect,
          },
          ctx.signal,
        );
        ctx.budget.settle(id, r.cost);
        ctx.paid(r.cost ?? imageUsd(p.settings.imageModel));
        ctx.shot(i, { image: r.dataUrl, imageCost: r.cost, step: 'attente' });
      } catch (e) {
        ctx.budget.release(id);
        ctx.shot(i, { step: 'attente', error: (e as Error).message });
        if (e instanceof FilmApiError && (e.status === 401 || e.status === 402)) throw e;
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

export const clipKey = (p: FilmProject, i: number) => `film.clip.${p.id}.${i}`;

/** Submits, follows and downloads one clip; resumes a job already submitted. */
async function shootOne(
  p: FilmProject,
  scene: TroupeScene,
  model: VideoModel,
  i: number,
  ctx: RunCtx,
): Promise<void> {
  const s = p.script!;
  const plan = s.plans[i]!;
  const st = p.shots[i] ?? { step: 'attente' };
  let job = st.job;
  let t0 = st.t0 ?? Date.now();
  const resId = `clip-${i}`;
  if (!job) {
    const start = p.settings.useImages ? st.image : scene.image;
    if (!start) {
      // never a clip without its pinned first frame: the troupe would no longer be guaranteed
      ctx.shot(i, {
        step: 'attente',
        error: 'Image du plan manquante : générez-la (étape 4) avant de tourner ce plan.',
      });
      return;
    }
    const sound = model.audio !== false && p.settings.sound;
    try {
      ctx.budget.hold(
        resId,
        clipUsd(model, p.settings.resolution, plan.duree, { audio: sound, startFrame: !!start }),
      );
    } catch (e) {
      ctx.shot(i, { step: 'attente', error: (e as Error).message });
      throw e;
    }
    t0 = Date.now();
    ctx.shot(i, { step: 'envoi', error: undefined, t0, cost: null });
    let tries = 0;
    for (;;) {
      try {
        job = (
          await submitClip(
            {
              model: model.id,
              prompt: videoPrompt(s, plan, { accent: p.settings.accent, sound }),
              duration: plan.duree,
              resolution: model.resolutions.includes(p.settings.resolution)
                ? p.settings.resolution
                : undefined,
              aspect: model.aspects.includes(p.settings.aspect) ? p.settings.aspect : undefined,
              firstFrame: start,
              audio: model.audio === true ? sound : undefined,
            },
            ctx.signal,
          )
        ).id;
        break;
      } catch (e) {
        if (e instanceof FilmApiError && e.status === 429 && tries++ < 4) {
          await sleep(4000 * tries, ctx.signal);
          continue;
        }
        ctx.budget.release(resId);
        ctx.shot(i, { step: 'failed', error: (e as Error).message });
        if (e instanceof FilmApiError && (e.status === 401 || e.status === 402)) throw e;
        return;
      }
    }
    // saved at once: a reload resumes this job instead of paying for a new one
    ctx.shot(i, { job, step: 'pending' });
  } else
    ctx.budget.carry(
      resId,
      clipUsd(model, p.settings.resolution, plan.duree, { audio: p.settings.sound, startFrame: true }),
    );
  const deadline = Date.now() + 25 * 60_000;
  for (;;) {
    let r;
    try {
      r = await pollClip(job!, ctx.signal);
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      if (Date.now() > deadline) {
        ctx.budget.release(resId);
        ctx.shot(i, { step: 'failed', error: (e as Error).message });
        return;
      }
      await sleep(pollMs(), ctx.signal);
      continue;
    }
    if (r.status === 'completed') {
      ctx.budget.settle(resId, r.cost);
      ctx.paid(
        r.cost ??
          clipUsd(model, p.settings.resolution, plan.duree, { audio: p.settings.sound, startFrame: true }),
      );
      const blob = await downloadClip(job!, ctx.signal);
      await kv.set(clipKey(p, i), blob);
      ctx.shot(i, { step: 'completed', cost: r.cost, clip: clipKey(p, i), ms: Date.now() - t0 });
      return;
    }
    if (r.status === 'failed' || r.status === 'cancelled' || r.status === 'expired') {
      if (r.cost) {
        ctx.budget.settle(resId, r.cost);
        ctx.paid(r.cost);
      } else ctx.budget.release(resId);
      ctx.shot(i, { step: r.status, error: r.error || `génération ${r.status}`, job: undefined });
      return;
    }
    ctx.shot(i, { step: r.status });
    if (Date.now() > deadline) {
      ctx.budget.release(resId);
      ctx.shot(i, {
        step: 'failed',
        error: 'Plus de 25 minutes sans réponse : tâche abandonnée (relancez ce plan).',
      });
      return;
    }
    await sleep(pollMs(), ctx.signal);
  }
}

/** All plans at once (the clips are made in parallel at OpenRouter); returns when every plan is settled. */
export async function stepShoot(
  p: FilmProject,
  scene: TroupeScene,
  model: VideoModel,
  ctx: RunCtx,
  only?: number[],
): Promise<void> {
  const todo = p
    .script!.plans.map((_, i) => i)
    .filter((i) => (only ? only.includes(i) : p.shots[i]?.step !== 'completed'));
  const errors: unknown[] = [];
  await Promise.all(todo.map((i) => shootOne(p, scene, model, i, ctx).catch((e) => errors.push(e))));
  const fatal = errors.find(
    (e) => e instanceof FilmApiError || e instanceof BudgetError || (e as Error).name === 'AbortError',
  );
  if (fatal) throw fatal;
}

/** Plans submitted before a reload, still being made at OpenRouter: followed again, never paid twice. */
export const pendingJobs = (p: FilmProject) =>
  p.shots.flatMap((s, i) => (s.job && /^(envoi|pending|in_progress)$/.test(s.step) ? [i] : []));
