// FILM AUTOPILOT runtime: one idea → a finished animated film, driven as an art director would. It reuses the studio
// engines (story, references, images, video, voices, music, subtitles, edit, 2.5D render) and keeps the Afrikatoon style
// DNA locked for every call. It never waits unless the user asked to validate each stage; a failed scene never stops the
// film (it is reported and can be regenerated from the single view).
import { useStudio } from './store';
import { analyzeFilm, inspectSceneClip } from './clipAnalyzer';
import { betterTake } from '../../../server/jev/studio/clipInspect';
import { lockShortSetting, lockedVideoPrompt } from '../../../server/jev/studio/continuity';
import { useStore } from '../store';
import { blobs } from './blobs';
import { loadRegistry, generateStory, generateSceneImage, generateLine, redrawCharacter, imageCandidates, rigScene, rigSceneLocal, generatePlate, judgeHumor } from './actions';
import { completeCharacterSheets, completeWorldSheets, addLocalMusic, compileSubtitles, buildEdit, generateSceneVideo, videoEnabled, runQA } from './actions2';
import { setStudioTextModel } from './textModel';
import { hfSpaceVideo, isCheapVideo, pollinationsModel, pollinationsVideo, POLLINATIONS_MODELS } from './cheapVideo';
import { renderPreview } from './preview';
import { modelsWith } from '../../../server/jev/studio/capabilities';
import { estimateSpeech, estimateVideo } from '../../../server/jev/studio/cost';
import {
  LOCAL_ANIMATION,
  costLabel,
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
import { CIRCUIT, CIRCUIT_PREFIX, CIRCUIT_TAIL_USD, circuitShort, circuitBudget, circuitModelId, circuitRate, isCircuit, pickCircuitModel, planCircuit } from '../../../server/jev/studio/circuit';
import { priorQuality } from '../../../server/jev/studio/director';
import type { Registry } from '../../../server/jev/studio/capabilities';
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

/** Circuit Grok model of this production (null when the circuit is off or no certain-price image → video model exists). */
export function circuitOf(reg: Registry, bp: Blueprint) {
  if (!S().settings.circuit) return null;
  return pickCircuitModel(modelsWith(reg, 'video'), bp.aspect, (m) => priorQuality('video', m.id, m.name));
}
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
  const plans = [
    planWriting(text, remaining, useStore.getState().settings.defaultModel !== 'auto' ? useStore.getState().settings.defaultModel : null),
    planImages(imgs.map((c) => c.model), (m) => est.get(m.id) ?? { usd: null, certain: false, formula: '' }, shape, mem, remaining),
    planAnimation(modelsWith(reg, 'video'), (m, sec) => estimateVideo(m, { duration: sec, mode: 'image' }), shape, mem, videoCap, { pollinations: Boolean(useStore.getState().settings.pollinationsKey), hf: Boolean(useStore.getState().settings.hfToken), pollinationsModels: POLLINATIONS_MODELS }),
    planVoices(modelsWith(reg, 'speech', 'SPEECH'), (m, chars) => estimateSpeech(m, chars), shape, mem, remaining),
  ];
  // CIRCUIT GROK: recommended animation when a certain-price image → video model exists — the video spends what the
  // other stages leave under the film's cap (0,30 $ / min), the remaining scenes stay with the free Marionnette.
  const r = circuitOf(reg, bp);
  const anim = plans[2]!;
  if (r) {
    const others = [plans[0]!, plans[1]!, plans[3]!].reduce((a, p) => a + (p.options.find((o) => o.id === p.recommended)?.stageUsd ?? 0), 0);
    const left = circuitBudget(bp.cap, spent(bp) + others, CIRCUIT.reserveUsd);
    const o = { id: `${CIRCUIT_PREFIX}${r.id}`, name: `Circuit Grok ${bp.cap.toFixed(2)} $ — ${r.name.replace(/^[^:]+:\s*/, '')} ${CIRCUIT.resolution} (plans clés) + Marionnette`, stageUsd: Math.round(left * 1000) / 1000, costLabel: costLabel(left), quality: priorQuality('video', r.id, r.name), qualitySource: 'a priori' as const, speed: 'Moyen' as const, afrikatoon: 9.3, score: 0, why: `vrai mouvement génératif (${r.usdPerS} $/s + ${r.usdPerClip} $ par plan, prix annoncé) sur l’accroche et la chute, plafond DUR ${bp.cap.toFixed(2)} $ pour tout le film, avec votre clé OpenRouter` };
    anim.options = [{ ...o, score: 10 }, ...anim.options];
    anim.recommended = o.id;
  }
  return plans;
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
const isLocalAnim = (a?: string) => a === LOCAL_ANIMATION;
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
      // DEGRÉ D'HUMOUR (grille calée sur les vidéos de référence) : sous 75 % (« très drôle »), jusqu'à DEUX réécritures
      // avec la correction du juge — et la version la plus drôle est gardée (une réécriture moins drôle est annulée).
      if (bpOf(projectId).mode !== 'ECO') {
        c.onStage('STORY', 'running', 'juge d’humour');
        let h = await judgeHumor(projectId);
        for (let round = 0; round < 2 && h && h.degree < 75 && h.fix; round++) {
          c.onStage('STORY', 'running', `humour ${h.degree} % (${h.label}) → réécriture ${round + 1} : ${h.fix.slice(0, 80)}`);
          const snap = bpOf(projectId);
          const keep = { title: snap.title, story: snap.story, scenes: snap.scenes, characters: snap.characters };
          const again = await generateStory(projectId, `${h.fix}${h.best ? ` — GARDE ce qui marche : ${h.best}` : ''}`);
          if (!again.parsed) break;
          const h2 = await judgeHumor(projectId);
          if (!h2 || h2.degree < h.degree) {
            S().patchProject(projectId, (b) => ({ ...b, ...keep }), 'réécriture moins drôle : version précédente gardée');
            c.onStage('STORY', 'running', `réécriture moins drôle (${h2?.degree ?? '—'} %) → version à ${h.degree} % gardée`);
            break;
          }
          h = h2;
          c.onStage('STORY', 'running', `humour après réécriture : ${h.degree} % (${h.label})`);
        }
        if (h && h.degree >= 75) c.onStage('STORY', 'running', `humour ${h.degree} % (${h.label})`);
      }
      // A short sketch keeps ONE set (v44: one scene drawn outdoors in an office sketch).
      const lock = lockShortSetting(bpOf(projectId).scenes, bpOf(projectId).duration);
      if (lock.changed.length) {
        S().patchProject(projectId, (b) => ({ ...b, scenes: lockShortSetting(b.scenes, b.duration).scenes }), `décor unique : ${lock.location}`);
        c.onStage('STORY', 'running', `décor unique « ${lock.location} » imposé à ${lock.changed.join(', ')}`);
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
      // Circuit Grok, short sketch: no character sheets — the budget goes to real motion on every shot.
      const shortGrok = S().settings.circuit && circuitShort(bpOf(projectId).duration) && !isLocalAnim(c.chosen.animation);
      c.onStage('IMAGES', 'running', shortGrok ? 'Circuit Grok court : budget réservé au mouvement' : 'références des personnages');
      await pool(shortGrok ? [] : bpOf(projectId).characters.filter((x) => !x.referenceAssetId).slice(0, 6), PARALLEL.images, async (ch) => {
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
      const reg = await loadRegistry().catch(() => null);
      const auto = !c.chosen.animation && reg ? circuitOf(reg, bpOf(projectId)) : null;
      const anim = c.chosen.animation ?? (auto ? `${CIRCUIT_PREFIX}${auto.id}` : LOCAL_ANIMATION);
      if (isCircuit(anim)) {
        // CIRCUIT GROK: real generative motion on the shots that carry the joke, HARD cap — the budget is recomputed
        // from the REAL spend before every clip; whatever does not fit stays with the free Marionnette.
        const m = reg ? modelsWith(reg, 'video').find((x) => x.id === circuitModelId(anim)) : undefined;
        const r = m ? circuitRate(m, bpOf(projectId).aspect) : null;
        if (!r || !reg) warn.push('Circuit Grok : modèle vidéo indisponible → Marionnette Afrikatoon');
        else {
          // The VOICES first (cheap, needed anyway): the clips then take the whole rest of the cap, and each clip lasts
          // what its lines last (not the story's estimate).
          c.onStage('ANIMATION', 'running', 'Circuit Grok : voix d’abord (durée exacte de chaque plan)');
          const lines0 = bpOf(projectId).scenes.flatMap((sc) => sc.dialogue.map((_, i) => ({ sc: sc.scene_id, i }))).filter((l) => !bpOf(projectId).audio.voices?.[`${l.sc}:${l.i}`]);
          await pool(lines0, PARALLEL.voices, async (l) => {
            check(c);
            await generateLine(projectId, l.sc, l.i, { forceModel: c.chosen.voice }).catch((e) => warn.push(`voix ${l.sc} : ${(e as Error).message.slice(0, 60)}`));
          });
          const later = CIRCUIT_TAIL_USD;
          const b0 = bpOf(projectId);
          const voiced = b0.scenes.map((sc) => {
            const secs = sc.dialogue.reduce((a, _, i) => a + (b0.audio.voices?.[`${sc.scene_id}:${i}`]?.seconds ?? 0), 0);
            return { ...sc, duration: secs ? Math.max(2, Math.ceil(secs + 0.5)) : Math.min(sc.duration, 3) };
          });
          const plan = planCircuit(voiced, r, circuitBudget(b0.cap, spent(b0), later, 1));
          c.onStage('ANIMATION', 'running', `Circuit Grok : ${plan.shots.length} plan(s), ${plan.seconds} s, ≤ ${plan.usd.toFixed(2)} $ (plafond ${b0.cap.toFixed(2)} $)`);
          if (!plan.shots.length) warn.push(`Circuit Grok : il reste ${(b0.cap - spent(b0)).toFixed(3)} $ après l’écriture, les images et les voix — pas assez pour un plan animé (${r.usdPerS} $/s) → Marionnette. Choisissez « 10 s · entièrement animé » ou un budget plus élevé.`);
          // Real price / announced price, learned on the clips already billed (v48: S01 billed 0.168 $ for 0.150 $
          // announced stopped the WHOLE circuit with 0.9 $ of budget left). The next clips are priced at the real rate
          // and go on as long as the HARD cap holds.
          let priceRatio = 1;
          for (const shot of plan.shots) {
            check(c);
            const b = bpOf(projectId);
            const expected = Math.round(shot.usd * priceRatio * 10000) / 10000;
            if (expected > circuitBudget(b.cap, spent(b), later, 1) + 1e-9) {
              warn.push(`${shot.sceneId} : plafond ${b.cap.toFixed(2)} $ atteint (dépense réelle ${spent(b).toFixed(3)} $, clip ≈ ${expected.toFixed(3)} $ au prix réel) → Marionnette`);
              continue;
            }
            c.onStage('ANIMATION', 'running', `Circuit Grok ${shot.sceneId} : ${shot.seconds} s (${shot.usd.toFixed(2)} $)`);
            const before = spent(b);
            await generateSceneVideo(projectId, shot.sceneId, { mode: 'image', duration: shot.seconds, resolution: CIRCUIT.resolution, forceModel: r.id, circuit: true }).catch((e) =>
              warn.push(`${shot.sceneId} : ${(e as Error).message.slice(0, 80)} → Marionnette`),
            );
            // Billed above the announced price → the rate is RECALIBRATED (the cap is checked with it before each
            // clip); only an absurd bill (more than twice the announced price) stops the circuit.
            const billed = spent(bpOf(projectId)) - before;
            if (billed > shot.usd * 2 + 0.001) {
              warn.push(`Circuit Grok arrêté : ${shot.sceneId} facturé ${billed.toFixed(3)} $ au lieu de ${shot.usd.toFixed(3)} $ annoncés (plus du double) → Marionnette pour la suite`);
              break;
            }
            if (billed > shot.usd * 1.02 + 0.0005) {
              priceRatio = Math.max(priceRatio, billed / shot.usd);
              c.onStage('ANIMATION', 'running', `${shot.sceneId} facturé ${billed.toFixed(3)} $ (annoncé ${shot.usd.toFixed(3)} $) : prix réel ×${priceRatio.toFixed(2)} appliqué aux clips suivants`);
            }
            // DEEP ANALYSIS of the clip (motion, frozen spans, flicker + vision judge: laugh, acting, mouth, anatomy).
            // A bad take is redone ONCE with the written correction — only if the later shots keep their budget.
            const expectedS = voiced.find((x) => x.scene_id === shot.sceneId)?.duration;
            const first = bpOf(projectId).scenes.find((x) => x.scene_id === shot.sceneId)?.videoAssetId;
            if (!first) continue;
            c.onStage('ANIMATION', 'running', `analyse du clip ${shot.sceneId} (mouvement, bouche, anatomie, rire)…`);
            const rep = await inspectSceneClip(projectId, shot.sceneId, { expectedS }).catch((e) => {
              warn.push(`${shot.sceneId} : analyse du clip impossible (${(e as Error).message.slice(0, 80)})`);
              return null;
            });
            if (!rep) continue;
            c.onStage('ANIMATION', 'running', `${shot.sceneId} : ${rep.score ?? '—'}/100${rep.reasons.length ? ` — ${rep.reasons.slice(0, 2).join(' ; ')}` : ' ✓'}`);
            if (rep.verdict !== 'retry') continue;
            const idx = plan.shots.indexOf(shot);
            const stillPlanned = plan.shots.slice(idx + 1).reduce((a, x) => a + x.usd * priceRatio, 0);
            const b2 = bpOf(projectId);
            if (circuitBudget(b2.cap, spent(b2), later, 1) - stillPlanned < shot.usd * priceRatio - 1e-9) {
              warn.push(`${shot.sceneId} : ${rep.reasons[0]} — reprise impossible sans priver les scènes suivantes (plafond ${b2.cap.toFixed(2)} $)`);
              continue;
            }
            c.onStage('ANIMATION', 'running', `reprise ${shot.sceneId} avec la correction : ${rep.fix.slice(0, 90)}`);
            const ok2 = await generateSceneVideo(projectId, shot.sceneId, { mode: 'image', duration: shot.seconds, resolution: CIRCUIT.resolution, forceModel: r.id, circuit: true, promptExtra: rep.fix })
              .then(() => true)
              .catch((e) => (warn.push(`${shot.sceneId} reprise : ${(e as Error).message.slice(0, 80)}`), false));
            const rep2 = ok2 ? await inspectSceneClip(projectId, shot.sceneId, { expectedS }).catch(() => null) : null;
            if (!rep2 || betterTake(rep, rep2) === 'a') {
              // The first take stays (never a blind replacement).
              S().patchProject(projectId, (b) => ({ ...b, scenes: b.scenes.map((x) => (x.scene_id === shot.sceneId ? { ...x, videoAssetId: first, clipReport: rep } : x)) }), `clip ${shot.sceneId} : 1re prise gardée`);
              c.onStage('ANIMATION', 'running', `${shot.sceneId} : 1re prise gardée (${rep.score}/100 contre ${rep2?.score ?? '—'})`);
            } else c.onStage('ANIMATION', 'running', `${shot.sceneId} : reprise gardée ${rep2.score}/100 (au lieu de ${rep.score})`);
          }
          if (plan.skipped.length) c.onStage('ANIMATION', 'running', `${plan.skipped.length} autre(s) scène(s) : Marionnette Afrikatoon (gratuit)`);
        }
      } else if (isCheapVideo(anim)) {
        // Cheap engines (Pollinations ≈ 0,01 $/s, free HF Space): the scene image becomes a real moving clip.
        for (const sc of bpOf(projectId).scenes.filter((s) => s.imageAssetId && !s.videoAssetId)) {
          check(c);
          c.onStage('ANIMATION', 'running', `animation ${sc.scene_id} (${pollinationsModel(anim)?.name.split(' (')[0] ?? 'Space HF gratuit'})`);
          try {
            const img = (await blobs.get(sc.imageAssetId!))!;
            const prompt = lockedVideoPrompt(sc, bpOf(projectId).characters).slice(0, 900);
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
    // NO SILENT LINE (v48: characters talking without sound): a line still without voice is retried once, then named.
    const silent = () => bpOf(projectId).scenes.flatMap((sc) => sc.dialogue.map((d, i) => ({ sc: sc.scene_id, i, who: d.speaker }))).filter((l) => !bpOf(projectId).audio.voices?.[`${l.sc}:${l.i}`]);
    if (silent().length) {
      c.onStage('MONTAGE', 'running', `${silent().length} réplique(s) sans voix → nouvel essai`);
      for (const l of silent()) await generateLine(projectId, l.sc, l.i, { forceModel: c.chosen.voice }).catch(() => undefined);
      const still = silent();
      if (still.length) warn.push(`réplique(s) MUETTE(S) — aucune voix n’a pu être générée : ${still.map((l) => `${l.sc} ${l.who}`).join(', ')}`);
    }
    c.onStage('MONTAGE', 'running', 'musique, sous-titres, montage');
    if (!bpOf(projectId).audio.music?.assetId) await addLocalMusic(projectId).catch(() => undefined);
    compileSubtitles(projectId);
    buildEdit(projectId);
    c.onStage('MONTAGE', 'running', 'rendu du film');
    const r = await renderPreview(bpOf(projectId), {
      width: 540,
      bilingual: Boolean(S().settings.bilingualCaptions),
      // The film is recorded in real time: a hidden tab pauses it (never 1 frame/s), the owner is told why.
      onPause: (p) => c.onStage('MONTAGE', 'running', p ? '⏸ rendu en pause : l’onglet est caché — revenez sur cet onglet pour continuer' : 'rendu du film (repris)'),
    });
    if (r.hiddenPauses) warn.push(`rendu mis en pause ${r.hiddenPauses} fois (onglet caché) — aucune image perdue`);
    // Final check of the FILE itself (what the owner will post): frozen passages and silent gaps, measured.
    c.onStage('MONTAGE', 'running', 'contrôle du film final (images figées, silences)');
    const fa = await analyzeFilm(r.blob, { fps: 6 }).catch(() => null);
    if (fa) {
      const frozenS = fa.frozen.reduce((a, f) => a + f.end - f.start, 0);
      if (frozenS >= 0.8) warn.push(`film final : ${frozenS.toFixed(1)} s d’image figée (${fa.frozen.map((f) => `${f.start.toFixed(1)}–${f.end.toFixed(1)} s`).slice(0, 4).join(', ')})`);
      if (fa.silences?.length) warn.push(`film final : silence de ${fa.silences.map((g) => `${(g.end - g.start).toFixed(1)} s à ${g.start.toFixed(1)} s`).slice(0, 3).join(', ')}`);
      c.onStage('MONTAGE', 'running', `film final mesuré : ${fa.score ?? '—'}/100 (mouvement), ${frozenS.toFixed(1)} s figées`);
    }
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
  const todo = bpOf(projectId).scenes.filter((s) => s.imageAssetId && !s.videoAssetId && (!s.rig || !s.plateAssetId || !s.maskAssetId));
  // CORPS ENTIER first: read in the browser, 0 $ (skeletons, cut-outs, background rebuilt). One scene at a time: the
  // models share one WebAssembly runtime.
  for (const sc of todo) {
    check(c);
    if (sc.maskAssetId) continue;
    c.onStage('ANIMATION', 'running', `corps entier ${sc.scene_id} : squelettes, détourage et décor (gratuit, dans le navigateur)`);
    const n = await rigSceneLocal(projectId, sc.scene_id);
    if (n > 0) rigged++;
  }
  await pool(todo, PARALLEL.rigs, async (sc) => {
    check(c);
    const cur = bpOf(projectId).scenes.find((x) => x.scene_id === sc.scene_id)!;
    if (!cur.rig) {
      c.onStage('ANIMATION', 'running', `marionnette ${sc.scene_id} : squelette des personnages`);
      rigged += (await rigScene(projectId, sc.scene_id)) > 0 ? 1 : 0;
    }
    // The clean plate (same shot without the characters): exact cut-out and true background when they move.
    if (!bpOf(projectId).scenes.find((x) => x.scene_id === sc.scene_id)?.plateAssetId) await generatePlate(projectId, sc.scene_id);
  });
  return rigged;
}
