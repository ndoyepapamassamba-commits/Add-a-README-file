// FILM AUTOPILOT runtime: one idea → a finished animated film, driven as an art director would. It reuses the studio
// engines (story, references, images, video, voices, music, subtitles, edit, 2.5D render) and keeps the Afrikatoon style
// DNA locked for every call. It never waits unless the user asked to validate each stage; a failed scene never stops the
// film (it is reported and can be regenerated from the single view).
import { useStudio } from './store';
import { useStore } from '../store';
import { blobs } from './blobs';
import { loadRegistry, generateStory, generateSceneImage, generateLine, redrawCharacter, imageCandidates } from './actions';
import { completeCharacterSheets, completeWorldSheets, addLocalMusic, compileSubtitles, buildEdit, generateSceneVideo, videoEnabled } from './actions2';
import { setStudioTextModel } from './textModel';
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
    planAnimation(modelsWith(reg, 'video'), (m, sec) => estimateVideo(m, { duration: sec, mode: 'image' }), shape, mem, videoCap),
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
  const order: PipeStage[] = ['STORY', 'SCENES', 'IMAGES', 'ANIMATION', 'MONTAGE'];
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
      for (const ch of bpOf(projectId).characters.filter((x) => !x.referenceAssetId).slice(0, 6)) {
        check(c);
        await redrawCharacter(projectId, ch.id, ['neutral']).catch((e) => warn.push(`${ch.name} : ${(e as Error).message.slice(0, 80)}`));
      }
      for (const sc of bpOf(projectId).scenes) {
        check(c);
        if (sc.imageAssetId && (sc.status === 'APPROVED' || sc.status === 'GENERATED')) continue;
        c.onStage('IMAGES', 'running', `image ${sc.scene_id}`);
        await generateSceneImage(projectId, sc.scene_id, { forceModel: c.chosen.images }).catch((e) =>
          warn.push(`${sc.scene_id} : ${(e as Error).message.slice(0, 80)}`),
        );
      }
      await gate('IMAGES', warn);
    }
    // ── ANIMATION: image → video with the chosen model, or the free 2.5D animation at montage time
    if (start <= 3) {
      const warn: string[] = [];
      const anim = c.chosen.animation ?? LOCAL_ANIMATION;
      if (anim !== LOCAL_ANIMATION && videoEnabled()) {
        for (const sc of bpOf(projectId).scenes.filter((s) => s.imageAssetId && !s.videoAssetId)) {
          check(c);
          c.onStage('ANIMATION', 'running', `animation ${sc.scene_id}`);
          await generateSceneVideo(projectId, sc.scene_id, { mode: 'image', duration: Math.min(10, Math.max(4, Math.round(sc.duration))), forceModel: anim }).catch((e) =>
            warn.push(`${sc.scene_id} : ${(e as Error).message.slice(0, 80)} → animation 2.5D`),
          );
        }
      } else if (anim !== LOCAL_ANIMATION) warn.push('animation vidéo non autorisée (budget vidéo à 0) → animation 2.5D gratuite');
      else c.onStage('ANIMATION', 'running', 'animation 2.5D (caméra, parallaxe, voix) au montage');
      await gate('ANIMATION', warn);
    }
    // ── MONTAGE FINAL: voices, music, subtitles, edit, render
    check(c);
    const warn: string[] = [];
    c.onStage('MONTAGE', 'running', 'voix des personnages');
    for (const sc of bpOf(projectId).scenes)
      for (const [i] of sc.dialogue.entries()) {
        check(c);
        if (bpOf(projectId).audio.voices?.[`${sc.scene_id}:${i}`]) continue;
        await generateLine(projectId, sc.scene_id, i, { forceModel: c.chosen.voice }).catch((e) => warn.push(`voix ${sc.scene_id} : ${(e as Error).message.slice(0, 60)}`));
      }
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
