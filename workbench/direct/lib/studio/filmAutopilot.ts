// FILM AUTOPILOT runtime: one idea → a finished animated film, driven as an art director would. It reuses the studio
// engines (story, references, images, video, voices, music, subtitles, edit, 2.5D render) and keeps the Afrikatoon style
// DNA locked for every call. It never waits unless the user asked to validate each stage; a failed scene never stops the
// film (it is reported and can be regenerated from the single view).
import { useStudio } from './store';
import { useStore } from '../store';
import { blobs } from './blobs';
import { loadRegistry, generateStory, generateSceneImage, generateLine, redrawCharacter, imageCandidates, rigScene, generatePlate, judgeHumor } from './actions';
import { completeCharacterSheets, completeWorldSheets, addLocalMusic, compileSubtitles, buildEdit, generateSceneVideo, videoEnabled, runQA } from './actions2';
import { setStudioTextModel } from './textModel';
import { hfSpaceVideo, isCheapVideo, pollinationsModel, pollinationsVideo, POLLINATIONS_MODELS } from './cheapVideo';
import { renderPreview } from './preview';
import { modelsWith } from '../../../server/jev/studio/capabilities';
import { estimateSpeech, estimateVideo } from '../../../server/jev/studio/cost';
import {
  LOCAL_ANIMATION,
  planAnimation,
  planImages,
  planVoices,
  planWriting,
  type DirStage,
  type FilmShape,
  type PipeStage,
  type StagePlan,
} from '../../../server/jev/studio/director';
import type { Blueprint } from '../../../server/jev/studio/types';
import { spent } from '../../../server/jev/studio/blueprint';

const S = () => useStudio.getState();
const bpOf = (id: string): Blueprint => S().projects[id]!;

export function filmShape(bp: Blueprint): FilmShape {
  const scenes = bp.scenes.length || Math.max(4, Math.round(bp.duration / 8));
  return {
    scenes,
    seconds: bp.scenes.reduce((a, s) => a + s.duration, 0) || bp.duration,
    dialogueChars: bp.scenes.reduce((a, s) => a + s.dialogue.reduce((b, l) => b + l.text.length, 0), 0) || scenes * 120,
  };
}

/** The model plan of the production: one recommendation per stage, alternatives ranked, all estimates labelled. */
/** Runs `fn` over the items with at most `n` at a time (production speed: images, rigs, plates, voices in parallel). */
export async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<unknown>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const x = items[i++]!;
      await fn(x);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}
/** Parallel jobs per stage (the providers' rate limits stay comfortable at this level). */
export const PARALLEL = { images: 3, rigs: 3, voices: 4 };

export async function buildPlans(projectId: string): Promise<StagePlan[]> {
  const bp = bpOf(projectId);
  const reg = await loadRegistry();
  const shape = filmShape(bp);
  const mem = S().memory;
  const remaining = Math.max(0, bp.cap - spent(bp));
  const imgs = await imageCandidates({ aspect: bp.aspect, references: 0 }).catch(() => []);
  const est = new Map(imgs.map((c) => [c.model.id, c.estimate]));
  const text = useStore
    .getState()
    .models.filter((m) => !m.capabilities.vision || m.capabilities.tools)
    .map((m) => ({ id: m.id, name: m.name, inputPrice: m.inputPrice, outputPrice: m.outputPrice }));
  const videoCap = videoEnabled() ? S().settings.videoBudget : remaining;
  return [
    planWriting(text, remaining, useStore.getState().settings.defaultModel !== 'auto' ? useStore.getState().settings.defaultModel : null),
    planImages(imgs.map((c) => c.model), (m) => est.get(m.id) ?? { usd: null, certain: false, formula: '' }, shape, mem, remaining),
    planAnimation(modelsWith(reg, 'video'), (m, sec) => estimateVideo(m, { duration: sec, mode: 'image' }), shape, mem, videoCap, { pollinations: Boolean(useStore.getState().settings.pollinationsKey), hf: Boolean(useStore.getState().settings.hfToken), pollinationsModels: POLLINATIONS_MODELS }),
    planVoices(modelsWith(reg, 'speech', 'SPEECH'), (m, chars) => estimateSpeech(m, chars), shape, mem, remaining),
  ];
}

export type StageState = 'idle' | 'running' | 'done' | 'warning' | 'waiting' | 'failed';
export interface FilmCtl {
  stop: boolean;
  /** Models picked for each stage (recommended by default). */
  chosen: Partial<Record<DirStage, string>>;
  /** Ask the user to validate each stage before the next one. */
  confirmEach: boolean;
  onStage: (s: PipeStage, st: StageState, note?: string) => void;
  /** Resolves when the user presses « Valider » for that stage. */
  validate: (s: PipeStage) => Promise<void>;
}
const STOP = 'Autopilot arrêté';
const check = (c: FilmCtl) => {
  if (c.stop) throw new Error(STOP);
};

export interface FilmResult {
  assetId: string;
  url: string;
  seconds: number;
  mime: string;
}

/** Runs the whole film. Every stage reports live; scene-level failures are kept as warnings. */
export async function runFilm(projectId: string, c: FilmCtl, from: PipeStage = 'STORY'): Promise<FilmResult | null> {
  const order: PipeStage[] = ['STORY', 'SCENES', 'IMAGES', 'ANIMATION', 'QA', 'MONTAGE'];
  const start = order.indexOf(from);
  const gate = async (s: PipeStage, warn: string[]) => {
    c.onStage(s, warn.length ? 'warning' : 'done', warn.slice(0, 3).join(' · ') || undefined);
    if (c.confirmEach && s !== 'MONTAGE') {
      c.onStage(s, 'waiting', 'en attente de votre validation');
      await c.validate(s);
      c.onStage(s, warn.length ? 'warning' : 'done');
    }
  };
  setStudioTextModel(c.chosen.writing ?? null);
  try {
    c.onStage('IDEA', 'done');
    // ── HISTOIRE: story, characters, worlds (one writing model, locked Afrikatoon DNA in every brief)
    if (start <= 0) {
      check(c);
      c.onStage('STORY', 'running', 'écriture de l’histoire');
      const r = await generateStory(projectId);
      if (!r.parsed) {
        c.onStage('STORY', 'failed', r.issues.slice(0, 2).join(' · ') || 'histoire non générée');
        return null;
      }
      // DEGRÉ D'HUMOUR (grille calée sur les vidéos de référence) : sous 65 %, une réécriture avec la correction du juge.
      if (bpOf(projectId).mode !== 'ECO') {
        c.onStage('STORY', 'running', 'juge d’humour');
        const h = await judgeHumor(projectId);
        if (h && h.degree < 65 && h.fix) {
          c.onStage('STORY', 'running', `humour ${h.degree} % (${h.label}) → réécriture : ${h.fix.slice(0, 80)}`);
          const again = await generateStory(projectId, h.fix);
          if (again.parsed) {
            const h2 = await judgeHumor(projectId);
            if (h2) c.onStage('STORY', 'running', `humour après réécriture : ${h2.degree} % (${h2.label})`);
          }
        } else if (h) c.onStage('STORY', 'running', `humour ${h.degree} % (${h.label})`);
      }
      c.onStage('STORY', 'running', 'personnages et décors');
      await completeCharacterSheets(projectId).catch(() => 0);
      await completeWorldSheets(projectId).catch(() => 0);
      await gate('STORY', r.issues);
    }
    // ── SCÈNES: découpage, dialogues, émotions, caméra (from the story), shown for review
    if (start <= 1) {
      check(c);
      c.onStage('SCENES', 'running', `${bpOf(projectId).scenes.length} scènes`);
      await gate('SCENES', []);
    }
    // ── IMAGES: character references first (continuity), then each scene with the chosen model
    if (start <= 2) {
      const warn: string[] = [];
      c.onStage('IMAGES', 'running', 'références des personnages');
      await pool(bpOf(projectId).characters.filter((x) => !x.referenceAssetId).slice(0, 6), PARALLEL.images, async (ch) => {
        check(c);
        await redrawCharacter(projectId, ch.id, ['neutral']).catch((e) => warn.push(`${ch.name} : ${(e as Error).message.slice(0, 80)}`));
      });
      const todo = bpOf(projectId).scenes.filter((sc) => !(sc.imageAssetId && (sc.status === 'APPROVED' || sc.status === 'GENERATED')));
      let done = 0;
      await pool(todo, PARALLEL.images, async (sc) => {
        check(c);
        await generateSceneImage(projectId, sc.scene_id, { forceModel: c.chosen.images }).catch((e) => warn.push(`${sc.scene_id} : ${(e as Error).message.slice(0, 80)}`));
        c.onStage('IMAGES', 'running', `images ${++done}/${todo.length}`);
      });
      // NO SCENE WITHOUT AN IMAGE: a failed scene is retried with the chosen model, then with any available model.
      for (const force of [c.chosen.images, undefined]) {
        const missing = bpOf(projectId).scenes.filter((sc) => !sc.imageAssetId);
        if (!missing.length) break;
        c.onStage('IMAGES', 'running', `rattrapage de ${missing.length} image(s) manquante(s)${force ? '' : ' (autre modèle)'}`);
        await pool(missing, PARALLEL.images, async (sc) => {
          check(c);
          await generateSceneImage(projectId, sc.scene_id, { ...(force ? { forceModel: force } : {}), regenerate: true }).catch((e) => warn.push(`${sc.scene_id} (rattrapage) : ${(e as Error).message.slice(0, 80)}`));
        });
      }
      const still = bpOf(projectId).scenes.filter((sc) => !sc.imageAssetId).map((sc) => sc.scene_id);
      if (still.length) warn.push(`image toujours manquante : ${still.join(', ')} (aucun modèle n’a répondu)`);
      await gate('IMAGES', warn);
    }
    // ── ANIMATION: image → video with the chosen model, or the free 2.5D animation at montage time
    if (start <= 3) {
      const warn: string[] = [];
      const anim = c.chosen.animation ?? LOCAL_ANIMATION;
      if (isCheapVideo(anim)) {
        // Cheap engines (Pollinations ≈ 0,01 $/s, free HF Space): the scene image becomes a real moving clip.
        for (const sc of bpOf(projectId).scenes.filter((s) => s.imageAssetId && !s.videoAssetId)) {
          check(c);
          c.onStage('ANIMATION', 'running', `animation ${sc.scene_id} (${pollinationsModel(anim)?.name.split(' (')[0] ?? 'Space HF gratuit'})`);
          try {
            const img = (await blobs.get(sc.imageAssetId!))!;
            const prompt = (sc.video_prompt || sc.action).slice(0, 900);
            const secs = Math.min(10, Math.max(3, Math.round(sc.duration)));
            const r = pollinationsModel(anim) ? await pollinationsVideo(img, prompt, secs, bpOf(projectId).aspect, undefined, anim) : await hfSpaceVideo(img, prompt, secs);
            const id = `asset-vid-${Date.now().toString(36)}-${sc.scene_id}`;
            await blobs.put(id, r.blob);
            S().addAsset({ id, kind: 'video', status: 'GENERATED_ASSET', projectId, sceneId: sc.scene_id, model: anim, createdAt: Date.now(), cost: r.usd, source: pollinationsModel(anim) ? `Pollinations · ${pollinationsModel(anim)!.name.split(' (')[0]}` : 'Hugging Face Space · Wan 2.2', tags: ['video', sc.scene_id], mime: r.blob.type || 'video/mp4', bytes: r.blob.size, name: `video-${sc.scene_id}` });
            S().patchProject(projectId, (b) => ({ ...b, assets: [...b.assets, id], scenes: b.scenes.map((s) => (s.scene_id === sc.scene_id ? { ...s, videoAssetId: id } : s)) }), `vidéo ${sc.scene_id} (${anim})`);
          } catch (e) {
            warn.push(`${sc.scene_id} : ${(e as Error).message.slice(0, 120)} → animation 2.5D`);
          }
        }
      } else if (anim !== LOCAL_ANIMATION && videoEnabled()) {
        for (const sc of bpOf(projectId).scenes.filter((s) => s.imageAssetId && !s.videoAssetId)) {
          check(c);
          c.onStage('ANIMATION', 'running', `animation ${sc.scene_id}`);
          await generateSceneVideo(projectId, sc.scene_id, { mode: 'image', duration: Math.min(10, Math.max(4, Math.round(sc.duration))), forceModel: anim }).catch((e) =>
            warn.push(`${sc.scene_id} : ${(e as Error).message.slice(0, 80)} → animation 2.5D`),
          );
        }
      } else if (anim !== LOCAL_ANIMATION) warn.push('animation vidéo non autorisée (budget vidéo à 0) → animation 2.5D gratuite');
      else c.onStage('ANIMATION', 'running', 'animation 2.5D (caméra, parallaxe, voix) au montage');
      // MARIONNETTE AFRIKATOON for every scene still without a clip: the characters are rigged (one vision read per
      // image) and move, blink and talk at montage time — free, no quota.
      const rigged = await rigAll(projectId, c);
      if (rigged) c.onStage('ANIMATION', 'running', `${rigged} scène(s) animée(s) par la Marionnette Afrikatoon`);
      await gate('ANIMATION', warn);
    }
    // ── CONTRÔLE QUALITÉ: rules + vision judge; the scenes the art director scored low are redrawn once (only
    // still images, never a paid video again), then the report is shown for validation.
    if (start <= 4) {
      check(c);
      const warn: string[] = [];
      c.onStage('QA', 'running', 'juge visuel et règles de continuité');
      const weak = bpOf(projectId).scenes.filter((s) => typeof s.quality === 'number' && s.quality < 60 && !s.videoAssetId);
      for (const sc of weak.slice(0, 4)) {
        check(c);
        c.onStage('QA', 'running', `reprise ${sc.scene_id} (qualité ${sc.quality}/100)`);
        await generateSceneImage(projectId, sc.scene_id, { forceModel: c.chosen.images, regenerate: true }).catch((e) => warn.push(`${sc.scene_id} : ${(e as Error).message.slice(0, 80)}`));
      }
      // A redrawn image lost its skeleton and plate: rig it again (otherwise the scene would not be animated).
      if (weak.length) await rigAll(projectId, c);
      const rep = await runQA(projectId).catch(() => null);
      if (rep) {
        const errs = rep.issues.filter((i) => i.severity === 'error');
        if (errs.length) warn.push(...errs.slice(0, 3).map((i) => i.message));
        c.onStage('QA', 'running', rep.total === null ? 'score non mesuré (aucun juge)' : `score ${rep.total}/100`);
      }
      await gate('QA', warn);
    }
    // ── MONTAGE CINÉMA: voices, music, subtitles, edit, render with the cinema finish
    check(c);
    const warn: string[] = [];
    c.onStage('MONTAGE', 'running', 'voix des personnages');
    const lines = bpOf(projectId).scenes.flatMap((sc) => sc.dialogue.map((_, i) => ({ sc: sc.scene_id, i }))).filter((l) => !bpOf(projectId).audio.voices?.[`${l.sc}:${l.i}`]);
    await pool(lines, PARALLEL.voices, async (l) => {
      check(c);
      await generateLine(projectId, l.sc, l.i, { forceModel: c.chosen.voice }).catch((e) => warn.push(`voix ${l.sc} : ${(e as Error).message.slice(0, 60)}`));
    });
    c.onStage('MONTAGE', 'running', 'musique, sous-titres, montage');
    if (!bpOf(projectId).audio.music?.assetId) await addLocalMusic(projectId).catch(() => undefined);
    compileSubtitles(projectId);
    buildEdit(projectId);
    c.onStage('MONTAGE', 'running', 'rendu du film');
    const r = await renderPreview(bpOf(projectId), { width: 540 });
    const assetId = `asset-film-${Date.now().toString(36)}`;
    await blobs.put(assetId, r.blob);
    S().addAsset({
      id: assetId,
      kind: 'video',
      status: 'FINAL_ASSET',
      projectId,
      createdAt: Date.now(),
      cost: 0,
      source: 'Film Autopilot (montage navigateur)',
      tags: ['final', 'film'],
      mime: r.mime,
      bytes: r.blob.size,
      name: `${(bpOf(projectId).title || 'film').replace(/[^\w\- ]+/g, '').slice(0, 40) || 'film'}.${r.mime.includes('mp4') ? 'mp4' : 'webm'}`,
    });
    S().patchProject(projectId, (b) => ({ ...b, assets: [...b.assets, assetId] }), 'film final rendu');
    c.onStage('MONTAGE', warn.length ? 'warning' : 'done', warn.slice(0, 3).join(' · ') || `${Math.round(r.seconds)} s`);
    return { assetId, url: URL.createObjectURL(r.blob), seconds: r.seconds, mime: r.mime };
  } catch (e) {
    if ((e as Error).message === STOP) return null;
    throw e;
  } finally {
    setStudioTextModel(null);
  }
}

/** Rigs every still scene without a clip (skeleton read by a vision model) and generates its clean plate — in parallel. */
async function rigAll(projectId: string, c: FilmCtl): Promise<number> {
  let rigged = 0;
  const todo = bpOf(projectId).scenes.filter((s) => s.imageAssetId && !s.videoAssetId && (!s.rig || !s.plateAssetId));
  await pool(todo, PARALLEL.rigs, async (sc) => {
    check(c);
    if (!sc.rig) {
      c.onStage('ANIMATION', 'running', `marionnette ${sc.scene_id} : squelette des personnages`);
      rigged += (await rigScene(projectId, sc.scene_id)) > 0 ? 1 : 0;
    }
    // The clean plate (same shot without the characters): exact cut-out and true background when they move.
    if (!bpOf(projectId).scenes.find((x) => x.scene_id === sc.scene_id)?.plateAssetId) await generatePlate(projectId, sc.scene_id);
  });
  return rigged;
}
