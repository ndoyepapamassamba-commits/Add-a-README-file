// FILM AUTOPILOT runtime: one idea → a finished animated film, driven as an art director would. It reuses the studio
// engines (story, references, images, video, voices, music, subtitles, edit, 2.5D render) and keeps the Afrikatoon style
// DNA locked for every call. It never waits unless the user asked to validate each stage; a failed scene never stops the
// film (it is reported and can be regenerated from the single view).
import { useStudio } from './store';
import { chooseKeyShots } from './keyShots';
import { analyzeFilm, inspectSceneClip } from './clipAnalyzer';
import { betterTake } from '../../coeur/studio/clipInspect';
import { lockShortSetting, lockedVideoPrompt } from '../../coeur/studio/continuity';
import { CRAFT, directorBeats, has, shotPlan, styleBible, visualTheme } from '../../coeur/studio/craftSkills';
import { craftSet } from './craftSet';
import { styleTag } from '../../coeur/studio/style';
import { useStore } from '@workbench/direct/lib/store';
import { blobs } from './blobs';
import { loadRegistry, generateDecor, generateStory, generateSceneImage, generateLine, redrawCharacter, imageCandidates, rigScene, rigSceneLocal, generatePlate, judgeHumor } from './actions';
import { completeCharacterSheets, completeWorldSheets, addLocalMusic, compileSubtitles, buildEdit, generateSceneVideo, videoEnabled, runQA } from './actions2';
import { setStudioTextModel, writingCatalog } from './textModel';
import { hfSpaceVideo, isCheapVideo, pollinationsModel, pollinationsVideo, POLLINATIONS_MODELS } from './cheapVideo';
import { renderPreview } from './preview';
import { applySheets, castActors, renderSceneStills, troupeReady, webglOk } from './actorsCast';
import { modelsWith } from '../../coeur/studio/capabilities';
import { estimateSpeech, estimateVideo } from '../../coeur/studio/cost';
import {
  LOCAL_ANIMATION,
  ACTORS_3D,
  costLabel,
  planAnimation,
  planImages,
  planVoices,
  planWriting,
  type DirStage,
  type FilmShape,
  type PipeStage,
  type StagePlan,
} from '../../coeur/studio/director';
import type { Blueprint } from '../../coeur/studio/types';
import { CIRCUIT, CIRCUIT_PREFIX, CIRCUIT_TAIL_USD, circuitShort, circuitBudget, circuitModelId, circuitRate, isCircuit, pickCircuitModel, planCircuit } from '../../coeur/studio/circuit';
import { priorQuality } from '../../coeur/studio/director';
import type { Registry } from '../../coeur/studio/capabilities';
import { addDecision, spent } from '../../coeur/studio/blueprint';
import { reglages } from '../reglages';

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
  const text = writingCatalog(useStore.getState().models.filter((m) => !m.capabilities.vision || m.capabilities.tools))
    .map((m) => ({ id: m.id, name: m.name, inputPrice: m.inputPrice, outputPrice: m.outputPrice }));
  const videoCap = videoEnabled() ? S().settings.videoBudget : remaining;
  const plans = [
    planWriting(text, remaining, useStore.getState().settings.defaultModel !== 'auto' ? useStore.getState().settings.defaultModel : null),
    planImages(imgs.map((c) => c.model), (m) => est.get(m.id) ?? { usd: null, certain: false, formula: '' }, shape, mem, remaining),
    planAnimation(modelsWith(reg, 'video'), (m, sec) => estimateVideo(m, { duration: sec, mode: 'image' }), shape, mem, videoCap, { pollinations: Boolean(reglages().pollinationsKey), hf: Boolean(reglages().hfToken), pollinationsModels: POLLINATIONS_MODELS }),
    planVoices(modelsWith(reg, 'speech', 'SPEECH'), (m, chars) => estimateSpeech(m, chars), shape, mem, remaining),
  ];
  // CIRCUIT GROK: recommended animation when a certain-price image → video model exists — the video spends what the
  // other stages leave under the film's cap (0,30 $ / min), the remaining scenes stay with the free Marionnette.
  const r = circuitOf(reg, bp);
  const anim = plans[2]!;
  if (r) {
    const others = [plans[0]!, plans[1]!, plans[3]!].reduce((a, p) => a + (p.options.find((o) => o.id === p.recommended)?.stageUsd ?? 0), 0);
    const left = circuitBudget(bp.cap, spent(bp) + others, CIRCUIT.reserveUsd);
    const o = { id: `${CIRCUIT_PREFIX}${r.id}`, name: `Circuit Grok ${bp.cap.toFixed(2)} $ — ${r.name.replace(/^[^:]+:\s*/, '')} ${r.resolution} (plans clés) + Marionnette`, stageUsd: Math.round(left * 1000) / 1000, costLabel: costLabel(left), quality: priorQuality('video', r.id, r.name), qualitySource: 'a priori' as const, speed: 'Moyen' as const, afrikatoon: 9.3, score: 0, why: `vrai mouvement génératif (${r.usdPerS} $/s + ${r.usdPerClip} $ par plan, prix annoncé) sur l’accroche et la chute, plafond DUR ${bp.cap.toFixed(2)} $ pour tout le film, avec votre clé OpenRouter` };
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
const isLocalAnim = (a?: string) => a === LOCAL_ANIMATION || a === ACTORS_3D;
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
      // CRAFT SKILLS (installed, enabled in the library): shooting plan per scene — ~5 s shots (video-storyboard),
      // 2–5 beats / one event / ≤ 15 s per clip (video-director), one visual theme and a style bible (cinema-skills).
      const craft = craftSet();
      const sceneWarn: string[] = [];
      if (has(craft, CRAFT.storyboard) || has(craft, CRAFT.director) || has(craft, CRAFT.cinema)) {
        const bp0 = bpOf(projectId);
        const theme = has(craft, CRAFT.storyboard) || has(craft, CRAFT.cinema) ? visualTheme(bp0.styleDNA) : undefined;
        let shots = 0;
        let cut = 0;
        S().patchProject(
          projectId,
          (b) => ({
            ...b,
            scenes: b.scenes.map((sc) => {
              const plan = has(craft, CRAFT.director) ? directorBeats(sc) : null;
              const sh = has(craft, CRAFT.storyboard) ? shotPlan(sc) : undefined;
              shots += sh?.length ?? 0;
              if (plan && plan.clips > 1) cut++;
              for (const w of plan?.warnings ?? []) sceneWarn.push(`${sc.scene_id} : ${w}`);
              return { ...sc, craft: { ...(sc.craft ?? {}), shots: sh, beats: plan?.beats, opening: plan?.opening, final: plan?.final, clips: plan?.clips, theme, warnings: plan?.warnings } };
            }),
          }),
          `plan de tournage (skills : ${[has(craft, CRAFT.storyboard) && 'video-storyboard', has(craft, CRAFT.director) && 'video-director', has(craft, CRAFT.cinema) && 'cinema-skills'].filter(Boolean).join(', ')})`,
        );
        if (has(craft, CRAFT.cinema)) S().patchProject(projectId, (b) => addDecision(b, 'SCENES', styleBible({ title: b.title, style: b.styleDNA, aspect: b.aspect, platform: b.platform, duration: b.duration })), 'bible de style');
        c.onStage('SCENES', 'running', `plan de tournage : ${shots} plan(s)${cut ? `, ${cut} scène(s) > 15 s à couper` : ''}${theme ? ' · thème visuel verrouillé' : ''}`);
      }
      await gate('SCENES', sceneWarn);
    }
    // ── IMAGES: character references first (continuity), then each scene with the chosen model
    if (start <= 2) {
      const warn: string[] = [];
      // Circuit Grok, short sketch: no character sheets — the budget goes to real motion on every shot.
      const shortGrok = S().settings.circuit && circuitShort(bpOf(projectId).duration) && !isLocalAnim(c.chosen.animation);
      // The owner's character sheets (library) are the references of their characters: never redrawn, always the same.
      const fromSheets = applySheets(projectId);
      if (fromSheets.length) c.onStage('IMAGES', 'running', `planches de personnages utilisées comme références : ${fromSheets.join(', ')}`);
      // CIRCUIT GROK ALLÉGÉ: when every character of the film has its drawn actor, the first picture of each scene is
      // drawn by the engine (the owner's troupe in the owner's set, 0 $) — no paid scene image, no redrawn sheet; Grok
      // then animates exactly these characters.
      // VOTRE TROUPE, 0 $: when every character of the film has its drawn actor, the engine draws the first picture of
      // each scene itself (the owner's troupe in the owner's set) — no paid scene image, no redrawn character.
      if (troupeReady(projectId) && webglOk()) {
        c.onStage('IMAGES', 'running', 'votre troupe dessine les images des scènes (0 $)');
        castActors(projectId);
        const drawn = await renderSceneStills(projectId, { width: 720 }).catch((e) => {
          warn.push(`images de départ du moteur : ${(e as Error).message.slice(0, 80)}`);
          return 0;
        });
        c.onStage('IMAGES', 'running', `${drawn} image(s) de départ rendue(s) par le moteur avec votre troupe (0 $)`);
      }
      c.onStage('IMAGES', 'running', shortGrok ? 'Circuit Grok court : budget réservé au mouvement' : 'références des personnages');
      const engineStills = bpOf(projectId).scenes.length > 0 && bpOf(projectId).scenes.every((sc) => sc.imageAssetId && sc.status === 'APPROVED');
      await pool(shortGrok || engineStills ? [] : bpOf(projectId).characters.filter((x) => !x.referenceAssetId).slice(0, 6), PARALLEL.images, async (ch) => {
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
      // ACTEURS 3D: each place of the film gets its ADAPTED set (vertical, empty, at the actors' scale), made once.
      if (S().settings.adaptedDecors && (c.chosen.animation === ACTORS_3D || S().settings.actors3d || troupeReady(projectId))) {
        const places = [...new Set(bpOf(projectId).scenes.map((sc) => sc.location))];
        for (const place of places) {
          check(c);
          c.onStage('IMAGES', 'running', `décor adapté : ${place}`);
          const id = await generateDecor(projectId, place, { forceModel: c.chosen.images }).catch((e) => {
            warn.push(`décor adapté « ${place} » : ${(e as Error).message.slice(0, 80)}`);
            return null;
          });
          if (!id) warn.push(`décor adapté « ${place} » non créé → votre image du lieu (complétée en miroir) ou le décor 3D`);
        }
      }
      await gate('IMAGES', warn);
    }
    // ── ANIMATION: image → video with the chosen model, or the free 2.5D animation at montage time
    if (start <= 3) {
      const warn: string[] = [];
      const reg = await loadRegistry().catch(() => null);
      const auto = !c.chosen.animation && reg ? circuitOf(reg, bpOf(projectId)) : null;
      const planned = c.chosen.animation ?? (auto ? `${CIRCUIT_PREFIX}${auto.id}` : S().settings.actors3d ? ACTORS_3D : LOCAL_ANIMATION);
      // The owner's troupe plays the WHOLE film for free (the engine end to end); Grok only on explicit request.
      const troupeFree = troupeReady(projectId) && webglOk() && !S().settings.grokKeyShots;
      const anim = troupeFree ? ACTORS_3D : planned;
      if (troupeFree && planned !== ACTORS_3D) c.onStage('ANIMATION', 'running', 'votre troupe joue tout le film (moteur, 0 $) — Grok non utilisé');
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
          // With the troupe, Grok only takes the KEY shots (the punchline, the twist): the drawn actors play the rest,
          // with their real lip-sync, at 0 $. With the native 3D actors the same split applies when « Grok sur les
          // plans clés » is on; otherwise Grok goes as far as the cap allows and the actors play what is left.
          const troupe = troupeReady(projectId) && webglOk();
          const theatre = troupe || (Boolean(S().settings.actors3d) && webglOk());
          const keyOnly = troupe || (theatre && Boolean(S().settings.grokKeyShots));
          // JEV judges which scenes deserve Grok (punchline, twist, climax) in one typed call; the beat heuristic is
          // the fallback — the choice is logged in the stage journal either way.
          const pick = keyOnly ? await chooseKeyShots(voiced, b0.title, 3) : null;
          if (pick) c.onStage('ANIMATION', 'running', `Plans clés — ${pick.note}`);
          const keyBeats = pick ? pick.scenes : voiced.filter((sc) => sc.beat === 'chute' || sc.beat === 'twist');
          const keyScenes = keyOnly ? (keyBeats.length ? keyBeats : voiced.slice(-1)) : voiced;
          if (theatre) castActors(projectId);
          const plan = planCircuit(keyScenes, r, circuitBudget(b0.cap, spent(b0), later, 1));
          if (keyOnly) c.onStage('ANIMATION', 'running', `Circuit Grok allégé : Grok sur ${keyScenes.length} plan(s) clé(s) (${keyScenes.map((x) => x.scene_id).join(', ')}), ${troupe ? 'votre troupe joue' : 'vos acteurs 3D jouent'} les ${voiced.length - keyScenes.length} autre(s) (lip-sync réel, 0 $)`);
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
            await generateSceneVideo(projectId, shot.sceneId, { mode: 'image', duration: shot.seconds, resolution: r.resolution, forceModel: r.id, circuit: true }).catch((e) =>
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
            const ok2 = await generateSceneVideo(projectId, shot.sceneId, { mode: 'image', duration: shot.seconds, resolution: r.resolution, forceModel: r.id, circuit: true, promptExtra: rep.fix })
              .then(() => true)
              .catch((e) => (warn.push(`${shot.sceneId} reprise : ${(e as Error).message.slice(0, 80)}`), false));
            const rep2 = ok2 ? await inspectSceneClip(projectId, shot.sceneId, { expectedS }).catch(() => null) : null;
            if (!rep2 || betterTake(rep, rep2) === 'a') {
              // The first take stays (never a blind replacement).
              S().patchProject(projectId, (b) => ({ ...b, scenes: b.scenes.map((x) => (x.scene_id === shot.sceneId ? { ...x, videoAssetId: first, clipReport: rep } : x)) }), `clip ${shot.sceneId} : 1re prise gardée`);
              c.onStage('ANIMATION', 'running', `${shot.sceneId} : 1re prise gardée (${rep.score}/100 contre ${rep2?.score ?? '—'})`);
            } else c.onStage('ANIMATION', 'running', `${shot.sceneId} : reprise gardée ${rep2.score}/100 (au lieu de ${rep.score})`);
          }
          if (plan.skipped.length) c.onStage('ANIMATION', 'running', `${plan.skipped.length} autre(s) scène(s) : ${troupe ? 'votre troupe' : S().settings.actors3d && webglOk() ? 'vos acteurs 3D' : 'Marionnette Afrikatoon'} (gratuit)`);
        }
      } else if (isCheapVideo(anim)) {
        // Cheap engines (Pollinations ≈ 0,01 $/s, free HF Space): the scene image becomes a real moving clip.
        for (const sc of bpOf(projectId).scenes.filter((s) => s.imageAssetId && !s.videoAssetId)) {
          check(c);
          c.onStage('ANIMATION', 'running', `animation ${sc.scene_id} (${pollinationsModel(anim)?.name.split(' (')[0] ?? 'Space HF gratuit'})`);
          try {
            const img = (await blobs.get(sc.imageAssetId!))!;
            const prompt = lockedVideoPrompt(sc, bpOf(projectId).characters, { craft: craftSet(), style: styleTag(bpOf(projectId).styleDNA) }).slice(0, 900);
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
      } else if (anim !== LOCAL_ANIMATION && anim !== ACTORS_3D && videoEnabled()) {
        for (const sc of bpOf(projectId).scenes.filter((s) => s.imageAssetId && !s.videoAssetId)) {
          check(c);
          c.onStage('ANIMATION', 'running', `animation ${sc.scene_id}`);
          await generateSceneVideo(projectId, sc.scene_id, { mode: 'image', duration: Math.min(10, Math.max(4, Math.round(sc.duration))), forceModel: anim }).catch((e) =>
            warn.push(`${sc.scene_id} : ${(e as Error).message.slice(0, 80)} → animation 2.5D`),
          );
        }
      } else if (anim !== LOCAL_ANIMATION && anim !== ACTORS_3D) warn.push('animation vidéo non autorisée (budget vidéo à 0) → animation 2.5D gratuite');
      else if (anim === LOCAL_ANIMATION) c.onStage('ANIMATION', 'running', 'animation 2.5D (caméra, parallaxe, voix) au montage');
      // ACTEURS 3D (option): every scene still without a clip is played by the reusable 3D actors at montage time —
      // casting from the library, 0 $, no rig needed. Without WebGL the Marionnette takes over.
      // The circuit with the troupe promised the troupe for the other scenes: the cast stays (v52: it was removed here
      // when the « acteurs 3D » option was off, and the other scenes fell to the Marionnette).
      const want3d = anim === ACTORS_3D || Boolean(S().settings.actors3d) || (isCircuit(anim) && troupeReady(projectId));
      const use3d = want3d && webglOk();
      if (want3d && !use3d) warn.push('Acteurs 3D : WebGL indisponible dans ce navigateur → Marionnette Afrikatoon');
      if (use3d) {
        const r = castActors(projectId);
        const n = bpOf(projectId).scenes.filter((s) => !s.videoAssetId).length;
        c.onStage('ANIMATION', 'running', `Acteurs 3D : ${Object.keys(r.cast).length} acteur(s)${r.reused.length ? ` dont ${r.reused.length} réutilisé(s) (${r.reused.slice(0, 3).join(', ')})` : ''}${r.added.length ? `, ${r.added.length} nouveau(x) dans la bibliothèque` : ''} — ${n} scène(s) à jouer en 3D`);
        // CIRCUIT GROK + ACTEURS 3D (v52: « the animation only looks at two videos, the rest is not processed »): Grok
        // took the key shots; every OTHER scene is rendered NOW by the engine into a real clip (30 i/s, 0 $) and
        // analysed like a generated one — the stage treats every scene, the montage only assembles clips.
        if (isCircuit(anim)) {
          const who = troupeReady(projectId) ? 'votre troupe' : 'vos acteurs 3D';
          if (n) {
            const made = await renderEngineClips(projectId, c, warn, who);
            c.onStage('ANIMATION', 'running', `${made} / ${n} scène(s) rendue(s) en clip par le moteur${made < n ? ` — ${n - made} jouée(s) au montage` : ''}`);
          }
          // PORTE A/B (J3): the paid key shots face the engine's free take of the same scene; the better clip stays.
          const ab = await abGate(projectId, c, warn, who);
          if (ab.compared) c.onStage('ANIMATION', 'running', `Porte A/B : ${ab.compared} plan(s) comparé(s), ${ab.engine} gagné(s) par le moteur (0 $), ${ab.compared - ab.engine} gardé(s) à Grok`);
        }
      } else {
        if (bpOf(projectId).actors3d) S().patchProject(projectId, (b) => ({ ...b, actors3d: undefined }), 'acteurs 3D retirés');
        // MARIONNETTE AFRIKATOON for every scene still without a clip: the characters are rigged (one vision read per
        // image) and move, blink and talk at montage time — free, no quota.
        const rigged = await rigAll(projectId, c);
        if (rigged) c.onStage('ANIMATION', 'running', `${rigged} scène(s) animée(s) par la Marionnette Afrikatoon`);
      }
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
      if (weak.length && !bpOf(projectId).actors3d) await rigAll(projectId, c);
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
      width: S().settings.renderWidth ?? 720,
      bilingual: Boolean(S().settings.bilingualCaptions),
      onNote: (m) => warn.push(m),
      // Exact render (default): every picture encoded at its instant, a hidden tab cannot freeze the film. Live recorder
      // (fallback): a hidden tab pauses it (never 1 frame/s), the owner is told why.
      onMode: (m) => c.onStage('MONTAGE', 'running', m.exact ? `rendu du film image par image (${m.fps} i/s) : un onglet caché ne fige aucune image` : 'rendu du film en temps réel : cacher l’onglet le met en pause'),
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

/**
 * ENGINE CLIPS: every scene still without a clip is rendered by the 3D theatre (the film's cast, the owner's sets,
 * the real voices) into its own clip, stored like a generated one, then measured (motion, frozen spans, lip-sync) and
 * judged while the film's cap allows it. A scene the theatre cannot play keeps no clip (it is played at montage time
 * by the fallback engines). Returns the number of clips made.
 */
/** One scene played by the 3D theatre into a real clip (30 i/s, 0 $), stored as an asset; null when the theatre cannot. */
async function renderEngineClipFor(projectId: string, sceneId: string, who: string, warn: string[], tag = 'moteur'): Promise<{ id: string; seconds: number } | null> {
  const b = bpOf(projectId);
  const scene = b.scenes.find((x) => x.scene_id === sceneId);
  if (!scene) return null;
  const width = Math.min(720, S().settings.renderWidth ?? 720);
  let dead = false;
  try {
    const r = await renderPreview({ ...b, scenes: [scene] }, {
      width,
      raw: true,
      actors3d: true,
      onNote: (m) => {
        if (/Acteurs 3D indisponibles/.test(m)) dead = true;
        warn.push(`${sceneId} : ${m}`);
      },
    });
    if (dead || r.seconds < 0.5) throw new Error('théâtre 3D indisponible');
    const id = `asset-vid-${Date.now().toString(36)}-${sceneId}${tag === 'moteur' ? '' : `-${tag}`}`;
    await blobs.put(id, r.blob);
    S().addAsset({ id, kind: 'video', status: 'GENERATED_ASSET', projectId, sceneId, model: ACTORS_3D, createdAt: Date.now(), cost: 0, source: `Moteur 3D (${who}) · ${r.fps ?? 30} i/s`, tags: ['video', 'moteur', tag, sceneId], mime: r.mime, bytes: r.blob.size, name: `video-${sceneId}${tag === 'moteur' ? '' : `-${tag}`}` });
    S().patchProject(projectId, (b2) => ({ ...b2, assets: [...b2.assets, id] }), `clip moteur ${sceneId}`);
    return { id, seconds: r.seconds };
  } catch (e) {
    warn.push(`${sceneId} : rendu moteur impossible (${(e as Error).message.slice(0, 80)}) → jouée au montage`);
    return null;
  }
}

/**
 * PORTE A/B (J3): for every key shot Grok animated, the engine plays the same scene for free; both clips go through
 * the same analysis and the better one is the scene's clip — the paid take is never thrown away (it stays in the
 * library, the journal says which won and why). Off with settings.abGate = false.
 */
async function abGate(projectId: string, c: FilmCtl, warn: string[], who: string): Promise<{ compared: number; engine: number }> {
  const out = { compared: 0, engine: 0 };
  if (S().settings.abGate === false || !bpOf(projectId).actors3d) return out;
  const paid = bpOf(projectId).scenes.filter((s) => {
    const a = s.videoAssetId ? S().assets[s.videoAssetId] : null;
    return Boolean(a && s.clipReport && a.model !== ACTORS_3D && !a.tags.includes('moteur'));
  });
  for (const sc of paid) {
    check(c);
    const grokId = sc.videoAssetId!;
    const grokRep = sc.clipReport!;
    c.onStage('ANIMATION', 'running', `Porte A/B ${sc.scene_id} : le moteur joue le même plan (0 $) face à Grok (${grokRep.score ?? '—'}/100)…`);
    const r = await renderEngineClipFor(projectId, sc.scene_id, who, warn, 'ab');
    if (!r) continue;
    out.compared++;
    // The candidate is scored exactly like the paid take (same analysis), then the scene points to the winner.
    S().patchProject(projectId, (b2) => ({ ...b2, scenes: b2.scenes.map((x) => (x.scene_id === sc.scene_id ? { ...x, videoAssetId: r.id } : x)) }), `porte A/B ${sc.scene_id} : candidat moteur`);
    const b3 = bpOf(projectId);
    const judge = b3.cap - spent(b3) - CIRCUIT_TAIL_USD > 0.01;
    const rep2 = await inspectSceneClip(projectId, sc.scene_id, { judge, expectedS: r.seconds }).catch(() => null);
    if (rep2 && betterTake(grokRep, rep2) === 'b') {
      out.engine++;
      c.onStage('ANIMATION', 'running', `Porte A/B ${sc.scene_id} : moteur gardé (${rep2.score ?? '—'}/100 contre Grok ${grokRep.score ?? '—'}) — le clip Grok reste dans la bibliothèque`);
    } else {
      S().patchProject(projectId, (b2) => ({ ...b2, scenes: b2.scenes.map((x) => (x.scene_id === sc.scene_id ? { ...x, videoAssetId: grokId, clipReport: grokRep } : x)) }), `porte A/B ${sc.scene_id} : Grok gardé`);
      c.onStage('ANIMATION', 'running', `Porte A/B ${sc.scene_id} : Grok gardé (${grokRep.score ?? '—'}/100 contre moteur ${rep2?.score ?? '—'})`);
    }
  }
  return out;
}

async function renderEngineClips(projectId: string, c: FilmCtl, warn: string[], who: string): Promise<number> {
  const todo = bpOf(projectId).scenes.filter((s) => !s.videoAssetId && (s.characters.length || s.dialogue.length));
  if (!todo.length || !bpOf(projectId).actors3d) return 0;
  let made = 0;
  for (const [i, sc] of todo.entries()) {
    check(c);
    const scene = bpOf(projectId).scenes.find((x) => x.scene_id === sc.scene_id);
    if (!scene || scene.videoAssetId) continue;
    c.onStage('ANIMATION', 'running', `${who} : ${sc.scene_id} (${i + 1}/${todo.length}) rendu par le moteur, 30 i/s, 0 $`);
    const r = await renderEngineClipFor(projectId, sc.scene_id, who, warn);
    if (!r) continue;
    {
      const id = r.id;
      S().patchProject(projectId, (b2) => ({ ...b2, scenes: b2.scenes.map((x) => (x.scene_id === sc.scene_id ? { ...x, videoAssetId: id } : x)) }), `clip moteur ${sc.scene_id}`);
      made++;
      // The same deep analysis as a generated clip; the vision judge only while the HARD cap keeps a margin for the QA.
      const b3 = bpOf(projectId);
      const judge = b3.cap - spent(b3) - CIRCUIT_TAIL_USD > 0.01;
      c.onStage('ANIMATION', 'running', `analyse du clip ${sc.scene_id} (mouvement, bouche${judge ? ', anatomie, rire' : ''})…`);
      const rep = await inspectSceneClip(projectId, sc.scene_id, { judge, expectedS: r.seconds }).catch(() => null);
      if (rep) c.onStage('ANIMATION', 'running', `${sc.scene_id} : ${rep.score ?? '—'}/100${rep.reasons.length ? ` — ${rep.reasons.slice(0, 2).join(' ; ')}` : ' ✓'} (moteur)`);
    }
  }
  return made;
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
