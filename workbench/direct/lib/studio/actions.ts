// Studio actions (runtime): registry, story, character library + 2D redraw, scene images, voices. Every paid call goes
// through executeMedia (selection, budget gate, retries, fallback, storage, memory, JEV_LOG).
import { decorPrompt, universeCharacter, universeSetOf } from '../../../server/jev/studio/actor/universe';
import {
  bibleFor,
  castBriefRich,
  namesIn,
  sheetFields,
} from '../../../server/jev/studio/actor/characterBible';
import { placeBrief } from '../../../server/jev/studio/world/livingWorld';
import { detectPanels, SINGLE_SHOT_RETRY } from '../../../server/jev/studio/panels';
import { parseRig, RIG_PROMPT } from '../../../server/jev/studio/puppet';
import {
  artQuality,
  artVerdict,
  enhanceInstruction,
  judgePrompt,
  parseJudgement,
  regenerateHint,
  type ArtJudgement,
} from '../../../server/jev/studio/artJudge';
import { castVoices, naturalSpeed, speakerKey } from '../../../server/jev/studio/motion';
import { useStudio } from './store';
import { useStore } from '../store';
import { craftSet } from './craftSet';
import { craftStoryRules } from '../../../server/jev/studio/craftSkills';
import { blobs, blobToDataUrl, base64ToBlob } from './blobs';
import { discover, generateImage, loadImagePrices, speak } from './net';
import { executeMedia, type MediaOutcome } from './exec';
import { runText } from './textModel';
import { humorPrompt, parseHumor, type HumorVerdict } from '../../../server/jev/studio/qualityRef';
import { Trace } from './jevlog';
import {
  fabricEntry,
  validateImageRequest,
  validateSpeechRequest,
  modelsWith,
  type MediaModel,
  type Registry,
} from '../../../server/jev/studio/capabilities';
import { estimateImage, estimateSpeech, type Estimate } from '../../../server/jev/studio/cost';
import { StudioError } from '../../../server/jev/studio/errors';
import {
  compileCharacter,
  compileScene,
  redrawInstruction,
  type Compiled,
} from '../../../server/jev/studio/genome';
import { dimensionOf, styleTag } from '../../../server/jev/studio/style';
import {
  parseScene,
  parseStory,
  explainNoJson,
  sceneMessages,
  storyMessages,
  type ParsedStory,
} from '../../../server/jev/studio/story';
import { setStage, addDecision } from '../../../server/jev/studio/blueprint';
import { contextPack } from '../../../server/jev/studio/qa';
import { hints } from '../../../server/jev/studio/memory';
import type { AssetMeta, Blueprint, CharacterSheet, Scene } from '../../../server/jev/studio/types';

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const bpOf = (id: string): Blueprint => {
  const b = useStudio.getState().projects[id];
  if (!b) throw new StudioError('UNKNOWN', 'projet introuvable');
  return b;
};
const patch = (id: string, f: (b: Blueprint) => Blueprint, note?: string) =>
  useStudio.getState().patchProject(id, f, note);

// ───────── registry ─────────
export const REGISTRY_TTL = 3_600_000;
export async function loadRegistry(force = false): Promise<Registry> {
  const S = useStudio.getState();
  if (!force && S.registry && Date.now() - S.registry.at < REGISTRY_TTL) return S.registry;
  S.setBusy('Découverte des capacités…');
  try {
    const reg = await discover(S.registry);
    if (!reg.sources.some((x) => x.ok))
      throw new StudioError(
        'SERVER_ERROR',
        `découverte impossible : ${reg.sources.map((x) => `${x.endpoint}: ${x.error ?? 'échec'}`).join(' ; ')}`,
        0,
        true,
      );
    useStudio.getState().setRegistry(reg);
    useStore.getState().setFabric({ media: fabricEntry(reg) });
    return reg;
  } finally {
    useStudio.getState().setBusy(null);
  }
}

// ───────── helpers: aspect / resolution / candidates ─────────
const ratioOf = (a: string) => {
  const [w, h] = a.split(':').map(Number);
  return w && h ? w / h : 1;
};
/** Nearest declared aspect ratio (exact when declared). Undefined when the model declares none. */
export function bestAspect(list: string[], wanted: string): { aspect?: string; exact: boolean } {
  if (!list.length) return { aspect: undefined, exact: false };
  if (list.includes(wanted)) return { aspect: wanted, exact: true };
  const w = ratioOf(wanted);
  return {
    aspect: [...list].sort((a, b) => Math.abs(ratioOf(a) - w) - Math.abs(ratioOf(b) - w))[0],
    exact: false,
  };
}
export const cheapestResolution = (list: string[]): string | undefined =>
  list.length ? (list.find((r) => /^1k$/i.test(r)) ?? list[0]) : undefined;

export interface ImageNeeds {
  aspect: string;
  references: number;
  forceModel?: string;
}
export async function imageCandidates(
  n: ImageNeeds,
): Promise<
  { model: MediaModel; estimate: Estimate; aspect?: string; resolution?: string; exact: boolean }[]
> {
  const reg = await loadRegistry();
  let models = modelsWith(reg, 'image', 'IMAGE_GENERATION');
  if (n.references > 0) models = models.filter((m) => m.caps.includes('REFERENCE_IMAGES'));
  if (n.forceModel) models = models.filter((m) => m.id === n.forceModel);
  const ok = models
    .map((m) => {
      const a = bestAspect(m.image!.aspectRatios, n.aspect);
      const resolution = cheapestResolution(m.image!.resolutions);
      const v = validateImageRequest(m, {
        aspect_ratio: a.aspect,
        resolution,
        n: 1,
        references: n.references,
      });
      return v.ok ? { m, ...a, resolution } : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  // Prices of image models live on their endpoints: loaded for the compatible candidates (cached in the registry).
  const priced = await Promise.all(ok.map(async (c) => ({ ...c, m: await loadImagePrices(c.m) })));
  if (priced.some((p, i) => p.m !== ok[i]!.m)) {
    const cur = useStudio.getState().registry!;
    const byId = new Map(priced.map((p) => [p.m.id, p.m]));
    useStudio.getState().setRegistry({
      ...cur,
      models: cur.models.map((m) => (m.kind === 'image' && byId.has(m.id) ? byId.get(m.id)! : m)),
    });
  }
  return priced.map((p) => ({
    model: p.m,
    estimate: estimateImage(p.m, { n: 1, resolution: p.resolution }),
    aspect: p.aspect,
    resolution: p.resolution,
    exact: p.exact,
  }));
}

// ───────── story ─────────
export interface StoryResult {
  parsed: ParsedStory | null;
  issues: string[];
  model?: string;
}
/** `notes`: what the humour judge asks to fix (rewrite pass). */
export async function generateStory(projectId: string, notes?: string): Promise<StoryResult> {
  const bp = bpOf(projectId);
  patch(projectId, (b) => setStage(b, 'STORY', 'RUNNING'));
  const brief = {
    idea: notes
      ? `${bp.project.idea}\n\nRÉÉCRIS POUR FAIRE PLUS RIRE (juge d’humour) : ${notes}`
      : bp.project.idea,
    durationSec: bp.duration,
    language: bp.language,
    platform: bp.platform,
    characters: bp.characters.map((c) => ({ name: c.name, role: c.role })),
    recurring: castBriefRich(),
    // The knowledge base: full sheets + relations of the universe characters named in the idea or already cast.
    bible: bibleFor([...namesIn(bp.project.idea), ...bp.characters.map((c) => c.name)]),
    world: placeBrief(bp.project.idea),
    hints: hints(useStudio.getState().memory),
    craft: craftStoryRules(craftSet()),
    aspect: bp.aspect,
    dimension: dimensionOf(bp.styleDNA),
    audience: bp.options?.audience,
    realism: bp.options?.realism,
    dialogue: bp.options?.dialogue,
    music: bp.options?.music,
    sfx: bp.options?.sfx,
  };
  let messages = storyMessages(brief);
  let parsed: ParsedStory | null = null;
  let model: string | undefined;
  const issues: string[] = [];
  // Reasoning models (v48: « GPT-6 Luna Pro ») could spend the length limit thinking and return a cut JSON, twice:
  // low effort + JSON mode + room to write, the cut answer repaired, and a third, COMPACT attempt.
  const base = messages;
  for (let attempt = 0; attempt < 3 && !parsed; attempt++) {
    const r = await runText({
      projectId,
      purpose: attempt ? 'story (correction JSON)' : 'story',
      messages,
      maxTokens: 12000,
      temperature: attempt ? 0.6 : 0.9,
      json: true,
      effort: 'low',
    });
    model = r.model;
    const p = parseStory(r.text, { durationSec: bp.duration, language: bp.language });
    if ('story' in p && p.scenes.length) parsed = p;
    else {
      const why = p.issues.some((i) => i.code === 'NO_JSON')
        ? explainNoJson(r.text, r.finishReason)
        : p.issues.map((i) => i.message).join(' ; ');
      issues.push(`essai ${attempt + 1} (${r.model}) : ${why}`);
      const cut = r.finishReason === 'length' || !r.text.trim();
      messages = [
        ...base,
        ...(r.text.trim() && !cut ? [{ role: 'assistant' as const, content: r.text.slice(0, 2000) }] : []),
        {
          role: 'user',
          content: cut
            ? 'Ta réponse précédente a été coupée (trop longue). Renvoie UNIQUEMENT le JSON demandé, COMPACT : textes courts (une phrase par champ), pas de champ vide inutile, pas de commentaire.'
            : 'Ta réponse n’est pas un JSON valide contenant des scènes. Renvoie UNIQUEMENT le JSON demandé, sans texte autour.',
        },
      ];
    }
  }
  if (!parsed) {
    patch(projectId, (b) => setStage(b, 'STORY', 'FAILED'));
    return { parsed: null, issues, model };
  }
  const known = new Set(bp.characters.map((c) => c.name.toUpperCase()));
  // A recurring character of the channel keeps ITS description (verbatim): same face and outfit in every film.
  const stubs: CharacterSheet[] = parsed.story.characters
    .filter((n) => !known.has(n))
    .map((name) => {
      const u = universeCharacter(name);
      const f = sheetFields(name);
      return u
        ? {
            ...emptyCharacter(name),
            role: u.role,
            gender: u.gender ?? '',
            age: u.age ?? '',
            body: u.body ?? '',
            hair: u.hair ?? '',
            clothing: u.visual,
            accessories: u.accessories ?? '',
            face: u.face ?? '',
            consistency: `${name}: ${u.visual}`,
            ...(f
              ? { personality: f.personality, gestures: f.gestures, speakingStyle: f.speakingStyle }
              : {}),
          }
        : emptyCharacter(name);
    });
  patch(
    projectId,
    (b) => {
      let nb: Blueprint = {
        ...b,
        title: parsed!.story.title,
        story: parsed!.story,
        scenes: parsed!.scenes,
        characters: [...b.characters, ...stubs],
        worlds: [
          ...b.worlds,
          ...[...new Set(parsed!.scenes.map((s) => s.location))]
            .filter((l) => !b.worlds.some((w) => w.name.toLowerCase() === l.toLowerCase()))
            .map((l) => {
              // A set of the channel keeps its description (the same décor from one film to the next).
              const u = universeSetOf(l);
              return u ? { ...emptyWorld(l), architecture: u.visual, background: u.visual } : emptyWorld(l);
            }),
        ],
        duration: Math.round(parsed!.scenes.reduce((a, s) => a + s.duration, 0)),
      };
      nb = setStage(
        nb,
        'STORY',
        parsed!.issues.some((i) => i.severity === 'error')
          ? 'WARNING'
          : parsed!.issues.length
            ? 'WARNING'
            : 'COMPLETED',
      );
      nb = setStage(nb, 'IDEA', 'COMPLETED');
      return addDecision(
        nb,
        'STORY',
        `histoire générée par ${model} : ${parsed!.scenes.length} scène(s), ${parsed!.issues.length} remarque(s)`,
      );
    },
    'histoire générée',
  );
  return { parsed, issues: parsed.issues.map((i) => i.message), model };
}
/** Story Lab « REGENERATE SCENE »: rewrites ONE scene; the other scenes, the story and the generated assets are untouched. */
export async function regenerateScene(
  projectId: string,
  sceneId: string,
  instruction?: string,
): Promise<{ ok: boolean; issues: string[]; model?: string }> {
  const bp = bpOf(projectId);
  const index = bp.scenes.findIndex((x) => x.scene_id === sceneId);
  if (index < 0) return { ok: false, issues: ['scène introuvable'] };
  const r = await runText({
    projectId,
    purpose: `scène ${sceneId} (régénération)`,
    messages: sceneMessages({
      idea: bp.project.idea,
      logline: bp.story?.logline ?? '',
      language: bp.language,
      scenes: bp.scenes,
      index,
      instruction,
      dialogue: bp.options?.dialogue,
      bible: bibleFor(bp.scenes[index]!.characters),
    }),
    maxTokens: 2500,
    temperature: 0.9,
  });
  const p = parseScene(r.text, bp.scenes[index]!);
  if (!('scene' in p)) return { ok: false, issues: p.issues.map((i) => i.message), model: r.model };
  patch(
    projectId,
    (b) => ({
      ...addDecision(b, 'STORY', `scène ${sceneId} régénérée par ${r.model}`),
      scenes: b.scenes.map((x) => (x.scene_id === sceneId ? p.scene : x)),
    }),
    `scène ${sceneId} régénérée`,
  );
  return { ok: true, issues: p.issues.map((i) => i.message), model: r.model };
}
export const emptyCharacter = (name: string): CharacterSheet => ({
  id: uid('char'),
  name: name.toUpperCase(),
  role: '',
  age: '',
  gender: '',
  ethnicity: '',
  skin: '',
  face: '',
  hair: '',
  body: '',
  height: '',
  clothing: '',
  shoes: '',
  accessories: '',
  voice: '',
  accent: '',
  personality: '',
  emotionalProfile: '',
  gestures: '',
  posture: '',
  walk: '',
  facialExpressions: '',
  speakingStyle: '',
  poses: {},
  consistency: '',
});
export const emptyWorld = (name: string) => ({
  id: uid('world'),
  name,
  architecture: '',
  palette: '',
  lighting: '',
  weather: '',
  time: '',
  textures: '',
  objects: '',
  background: '',
  cameraAngles: '',
  referenceAssetIds: [] as string[],
});

/** Consistency Profile: a compact textual descriptor built from the sheet (the owner may rewrite it). */
export const buildConsistency = (c: CharacterSheet): string =>
  [
    c.name,
    c.role,
    c.age && `${c.age} ans`,
    c.skin,
    c.face,
    c.hair,
    c.body,
    c.clothing,
    c.shoes,
    c.accessories,
  ]
    .filter(Boolean)
    .join(', ');

// ───────── character library import ─────────
export interface LibFile {
  path: string;
  file: File;
}
const IMG = /\.(png|jpe?g|webp)$/i;
const META_KEYS: Record<string, keyof CharacterSheet> = {
  role: 'role',
  age: 'age',
  gender: 'gender',
  skin: 'skin',
  face: 'face',
  hair: 'hair',
  body: 'body',
  clothing: 'clothing',
  outfit: 'clothing',
  accessories: 'accessories',
  personality: 'personality',
  voice: 'voice',
  accent: 'accent',
};
/** Imports `NOM/pose.png` (+ optional `meta.json`) folders. Existing sheets of the same NAME are enriched, never duplicated. */
export async function importCharacterLibrary(
  projectId: string,
  files: LibFile[],
): Promise<{ characters: number; images: number; skipped: number }> {
  const groups = new Map<string, { imgs: LibFile[]; meta?: LibFile }>();
  let skipped = 0;
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean);
    if (parts.length < 2) {
      skipped++;
      continue;
    }
    const dir = parts[parts.length - 2]!;
    const g = groups.get(dir) ?? { imgs: [] };
    if (IMG.test(parts.at(-1)!)) g.imgs.push(f);
    else if (/^meta\.json$/i.test(parts.at(-1)!)) g.meta = f;
    else skipped++;
    groups.set(dir, g);
  }
  let images = 0;
  let characters = 0;
  for (const [dir, g] of groups) {
    if (!g.imgs.length) continue;
    const name = dir.replace(/[_-]+/g, ' ').toUpperCase();
    let meta: Record<string, unknown> = {};
    if (g.meta) {
      try {
        meta = JSON.parse(await g.meta.file.text()) as Record<string, unknown>;
      } catch {
        /* unreadable meta.json: ignored */
      }
    }
    const poses: Record<string, string> = {};
    for (const im of g.imgs) {
      const pose = im.file.name.replace(/\.[^.]+$/, '').toLowerCase();
      const id = uid('asset');
      await blobs.put(id, im.file);
      const am: AssetMeta = {
        id,
        kind: 'character',
        status: 'SOURCE_REFERENCE',
        projectId,
        characterId: name,
        createdAt: Date.now(),
        cost: 0,
        source: 'bibliothèque locale (import)',
        tags: ['import', pose, name],
        mime: im.file.type || 'image/png',
        bytes: im.file.size,
        name: `${name}/${pose}`,
      };
      useStudio.getState().addAsset(am);
      poses[pose] = id;
      images++;
    }
    patch(
      projectId,
      (b) => {
        const ex = b.characters.find((c) => c.name === name);
        const base = ex ?? emptyCharacter(name);
        const enriched: CharacterSheet = { ...base };
        for (const [k, v] of Object.entries(meta)) {
          const key = META_KEYS[k.toLowerCase()];
          if (key && typeof v === 'string' && !enriched[key])
            (enriched as unknown as Record<string, unknown>)[key] = v;
        }
        enriched.poses = { ...enriched.poses, ...poses };
        enriched.consistency = enriched.consistency || buildConsistency(enriched);
        return {
          ...b,
          characters: ex
            ? b.characters.map((c) => (c.name === name ? enriched : c))
            : [...b.characters, enriched],
          assets: [...b.assets, ...Object.values(poses)],
        };
      },
      `import ${name}`,
    );
    characters++;
  }
  patch(projectId, (b) => setStage(b, 'CHARACTERS', 'NEEDS_REVIEW'));
  return { characters, images, skipped };
}
/** Recursively reads dropped files / folders (webkitGetAsEntry). */
export async function readDropped(dt: DataTransfer): Promise<LibFile[]> {
  const out: LibFile[] = [];
  type Entry = {
    isFile: boolean;
    isDirectory: boolean;
    name: string;
    fullPath: string;
    file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
    createReader?: () => { readEntries: (cb: (e: Entry[]) => void, err?: (e: unknown) => void) => void };
  };
  const walk = async (e: Entry): Promise<void> => {
    if (e.isFile) {
      const f = await new Promise<File>((ok, ko) => e.file!(ok, ko));
      out.push({ path: e.fullPath.replace(/^\//, ''), file: f });
    } else if (e.isDirectory) {
      const r = e.createReader!();
      for (;;) {
        const batch = await new Promise<Entry[]>((ok, ko) => r.readEntries(ok, ko));
        if (!batch.length) break;
        for (const c of batch) await walk(c);
      }
    }
  };
  const items = [...dt.items].map(
    (i) => (i as unknown as { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.() ?? null,
  );
  for (const e of items) if (e) await walk(e);
  return out;
}
export const filesFromInput = (list: FileList): LibFile[] =>
  [...list].map((f) => ({
    path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    file: f,
  }));

// ───────── image generation ─────────
/** True when the picture is a comic page (panels) rather than one shot. */
async function isMultiPanel(assetId: string): Promise<boolean> {
  try {
    const b = await blobs.get(assetId);
    if (!b || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') return false;
    const bmp = await createImageBitmap(b);
    const w = 270;
    const h = Math.max(1, Math.round((bmp.height / Math.max(1, bmp.width)) * w));
    const cv = new OffscreenCanvas(w, h);
    const g = cv.getContext('2d');
    if (!g) return false;
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return detectPanels(g.getImageData(0, 0, w, h).data, w, h).multiPanel;
  } catch {
    return false;
  }
}
const dataUrl = async (assetId: string) => {
  const b = await blobs.get(assetId);
  if (!b) throw new StudioError('UNKNOWN', `asset ${assetId} introuvable`);
  return blobToDataUrl(b);
};
export interface ImageJob {
  projectId: string;
  sceneId?: string;
  characterId?: string;
  compiled: Compiled;
  references: string[];
  task: string;
  mission: string;
  aspect: string;
  forceModel?: string;
  kind?: AssetMeta['kind'];
  tags?: string[];
  regenerated?: boolean;
  trace?: Trace;
  confirmed?: boolean;
}
/** Generates ONE image through the full pipeline. */
export async function generateOne(j: ImageJob): Promise<MediaOutcome<{ b64: string }>> {
  const bp = bpOf(j.projectId);
  const trace = j.trace ?? new Trace();
  trace.stage(
    'CAPABILITY_DISCOVERY',
    `registre ${useStudio.getState().registry ? 'en cache' : 'à construire'}`,
  );
  const cands = await imageCandidates({
    aspect: j.aspect,
    references: j.references.length,
    forceModel: j.forceModel,
  });
  trace.stage('CAPABILITY_DISCOVERY', `${cands.length} modèle(s) image compatible(s)`);
  const refs = await Promise.all(j.references.map(dataUrl));
  trace.stage('ASSET_RETRIEVAL', `${refs.length} référence(s)`);
  const byModel = new Map(cands.map((c) => [c.model.id, c]));
  return executeMedia<{ b64: string }>({
    projectId: j.projectId,
    sceneId: j.sceneId,
    characterId: j.characterId,
    kind: 'image',
    task: j.task,
    style: styleTag(bp.styleDNA),
    contract: j.aspect,
    promptVersion: j.compiled.version,
    mission: j.mission,
    candidates: cands.map((c) => ({ model: c.model, estimate: c.estimate })),
    trace,
    regenerated: j.regenerated,
    confirmed: j.confirmed,
    parentIds: j.references,
    call: async (m) => {
      const c = byModel.get(m.id)!;
      const r = await generateImage({
        model: m.id,
        prompt: j.compiled.text,
        aspect_ratio: c.aspect,
        resolution: c.resolution,
        n: 1,
        references: refs.length ? refs : undefined,
      });
      return { result: { b64: r.images[0]!.b64 }, cost: r.cost };
    },
    store: async (res, m) => ({
      blob: base64ToBlob(res.b64, 'image/png'),
      kind: j.kind ?? (j.sceneId ? 'scene' : 'image'),
      mime: 'image/png',
      name: `${j.task}-${m.id.split('/').pop()}`,
      tags: [j.task, ...(j.tags ?? [])],
      prompt: j.compiled.text,
    }),
  });
}

/** The plate prompt: the same picture, characters removed, everything else identical. */
export const PLATE_INSTRUCTION =
  'EDIT THE REFERENCE IMAGE: remove every character (people, animals) and what they hold; keep EXACTLY the same background, camera, framing, perspective, lighting, colours and style; rebuild the background where the characters were. Output the empty set only.';
/**
 * CLEAN PLATE: the scene's picture without its characters (image → image edit). With it the animation engine cuts the
 * characters out by difference (exact, whatever their colours) and reveals the true background when they move.
 */
export async function generatePlate(projectId: string, sceneId: string): Promise<string | null> {
  const bp = bpOf(projectId);
  const sc = bp.scenes.find((s) => s.scene_id === sceneId);
  if (!sc?.imageAssetId || bp.mode === 'ECO') return null;
  try {
    const out = await generateOne({
      projectId,
      sceneId,
      compiled: {
        ...compileScene(
          sc,
          {
            style: bp.styleDNA,
            characters: [],
            worlds: bp.worlds,
            previous: null,
            next: null,
            platform: bp.platform,
            aspect: bp.aspect,
          },
          'image',
          { maxChars: 1200 },
        ),
        version: 'plate-1',
        text: `${PLATE_INSTRUCTION}\nSet: ${sc.location}. Avoid: people, characters, animals, hands, faces.`,
      },
      references: [sc.imageAssetId],
      task: 'SCENE-IMAGE',
      mission: `plaque ${sceneId}`,
      aspect: bp.aspect,
      tags: [sceneId, 'plate'],
      trace: new Trace(),
    });
    if (!out.assetId) return null;
    patch(projectId, (b) => ({
      ...b,
      scenes: b.scenes.map((s) =>
        s.scene_id === sceneId && s.imageAssetId === sc.imageAssetId
          ? { ...s, plateAssetId: out.assetId }
          : s,
      ),
    }));
    return out.assetId;
  } catch {
    return null;
  }
}
/** Scale of a generated vertical set (eye-level camera, back of the place ~3 m away, floor in the lower fifth). */
export const VERTICAL_DECOR_FIT = { mH: 3.0, floor: 0.86, cx: 0.5 } as const;
/**
 * DÉCOR ADAPTÉ (paid, under the HARD cap of the film): an empty VERTICAL set for a place, made once with the chosen
 * image model (the owner's set picture of that place as the reference) and kept in the set library « <place> (vertical) »
 * for every film after. A picture too small to be a set (under 512 px) is not kept.
 */
export async function generateDecor(
  projectId: string,
  location: string,
  o: { forceModel?: string } = {},
): Promise<string | null> {
  const bp = bpOf(projectId);
  if (bp.mode === 'ECO') return null;
  const lib = useStudio.getState().decors;
  const probe = decorPrompt(location, false);
  const have = lib[`${probe.name.toLowerCase()} (vertical)`];
  if (have) return have.assetId;
  const ref = lib[probe.name.toLowerCase()]?.assetId;
  const { name, text } = decorPrompt(location, Boolean(ref));
  const sc = bp.scenes.find((x) => x.location === location) ?? bp.scenes[0];
  if (!sc) return null;
  const base = compileScene(
    sc,
    {
      style: bp.styleDNA,
      characters: [],
      worlds: bp.worlds,
      previous: null,
      next: null,
      platform: bp.platform,
      aspect: '9:16',
    },
    'image',
    { maxChars: 1200 },
  );
  const out = await generateOne({
    projectId,
    compiled: { ...base, version: 'decor-1', text },
    references: ref ? [ref] : [],
    task: 'SCENE-IMAGE',
    mission: `décor adapté ${name} (9:16)`,
    aspect: '9:16',
    tags: ['decor', name],
    ...(o.forceModel ? { forceModel: o.forceModel } : {}),
    trace: new Trace(),
  });
  if (!out.assetId) return null;
  const blob = await blobs.get(out.assetId);
  if (!blob) return null;
  const bmp = await createImageBitmap(blob).catch(() => null);
  const ok = !!bmp && bmp.height >= 512 && bmp.height > bmp.width;
  bmp?.close();
  if (!ok) return null;
  useStudio.getState().upsertDecor(`${name} (vertical)`, out.assetId, { ...VERTICAL_DECOR_FIT });
  return out.assetId;
}
/**
 * CORPS ENTIER, 0 $: the scene picture is read IN THE BROWSER (no key, no paid call): characters, full skeletons
 * (shoulders → ankles, eyes, mouth) and exact cut-outs (MediaPipe), then the background behind them is rebuilt (MI-GAN).
 * Returns the number of characters that got a full-body skeleton (0: models unavailable / nobody found).
 */
export async function rigSceneLocal(projectId: string, sceneId: string): Promise<number> {
  const sc = bpOf(projectId).scenes.find((s) => s.scene_id === sceneId);
  if (!sc?.imageAssetId) return 0;
  const blob = await blobs.get(sc.imageAssetId);
  if (!blob) return 0;
  try {
    const { readSceneFree } = await import('./sceneReader');
    const { masksToPng } = await import('./bodyDetect');
    const got = await readSceneFree(blob, sc.rig?.characters ?? [], !sc.plateAssetId);
    if (!got) return 0;
    const r = got.reading;
    const bodies = r.characters.filter((c) => c.body2d).length;
    const uidOf = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const maskId = uidOf('mask');
    await blobs.put(maskId, await masksToPng(r.masks, r.w, r.h));
    // The background behind the characters (when the app has no generated plate yet), rebuilt by MI-GAN.
    let plateId: string | undefined;
    if (got.plate) {
      const c = new OffscreenCanvas(r.w, r.h);
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(got.plate), r.w, r.h), 0, 0);
      plateId = uidOf('plate');
      await blobs.put(plateId, await c.convertToBlob({ type: 'image/png' }));
    }
    const rig = {
      characters: r.characters,
      by: sc.rig?.by ? `${sc.rig.by} + corps local` : 'corps local (navigateur)',
    };
    patch(projectId, (b) => ({
      ...b,
      scenes: b.scenes.map((s) =>
        s.scene_id === sceneId && s.imageAssetId === sc.imageAssetId
          ? { ...s, rig, maskAssetId: maskId, ...(plateId ? { plateAssetId: plateId } : {}) }
          : s,
      ),
    }));
    return bodies;
  } catch {
    return 0;
  }
}
/**
 * MARIONNETTE AFRIKATOON: a vision model rigs the scene image once (heads, eyes, mouths, bodies, arms) so the free
 * engine can move the characters themselves. Returns the number of characters rigged (0: nothing to rig / no model).
 */
export async function rigScene(projectId: string, sceneId: string): Promise<number> {
  const sc = bpOf(projectId).scenes.find((s) => s.scene_id === sceneId);
  if (!sc?.imageAssetId) return 0;
  try {
    const r = await runText({
      projectId,
      purpose: 'squelette d’animation (marionnette)',
      vision: true,
      maxTokens: 900,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: RIG_PROMPT },
            { type: 'image_url', image_url: { url: await dataUrl(sc.imageAssetId) } },
          ],
        },
      ],
    });
    const rig = parseRig(r.text, r.model);
    if (!rig) return 0;
    patch(projectId, (b) => ({
      ...b,
      scenes: b.scenes.map((s) => (s.scene_id === sceneId ? { ...s, rig } : s)),
    }));
    return rig.characters.length;
  } catch {
    return 0;
  }
}
/** The art director's judgement of one image (null: no vision model answered — nothing is invented). */
async function judgeArt(projectId: string, sc: Scene, assetId: string): Promise<ArtJudgement | null> {
  const bp = bpOf(projectId);
  try {
    const chars = bp.characters
      .filter((c) => sc.characters.map((x) => x.toUpperCase()).includes(c.name))
      .map((c) => `${c.name}: ${c.consistency}`)
      .join(' | ');
    const r = await runText({
      projectId,
      purpose: 'directeur artistique (juge image)',
      vision: true,
      maxTokens: 500,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: judgePrompt({
                style: `${dimensionOf(bp.styleDNA)} — ${bp.styleDNA.renderStyle}`,
                characters: chars,
                action: sc.action ?? '',
              }),
            },
            { type: 'image_url', image_url: { url: await dataUrl(assetId) } },
          ],
        },
      ],
    });
    return parseJudgement(r.text);
  } catch {
    return null;
  }
}
/**
 * One art-direction round: judge; « enhance » sends the image itself as the first reference with an edit instruction
 * (same shot, defects fixed); « regenerate » draws again with the judge's notes. The better judged image is kept.
 */
async function artPass(
  projectId: string,
  sc: Scene,
  job: ImageJob,
  out: MediaOutcome<{ b64: string }>,
  trace: Trace,
): Promise<{ out: MediaOutcome<{ b64: string }>; judgement: ArtJudgement | null }> {
  const first = await judgeArt(projectId, sc, out.assetId!);
  if (!first) {
    trace.stage(
      'QA',
      `directeur artistique : aucun modèle vision n'a répondu — image gardée, qualité non mesurée`,
    );
    return { out, judgement: null };
  }
  const verdict = artVerdict(first);
  trace.stage(
    'QA',
    `directeur artistique : ${first.overall}/10 → ${verdict === 'accept' ? 'acceptée' : verdict === 'enhance' ? 'passe d’amélioration (image → image)' : 'redessinée avec les notes'}`,
  );
  if (verdict === 'accept') return { out, judgement: first };
  const second =
    verdict === 'enhance'
      ? await generateOne({
          ...job,
          references: [out.assetId!, ...job.references].slice(0, 4),
          compiled: {
            ...job.compiled,
            text: `${enhanceInstruction(first)}

${job.compiled.text}`,
          },
          regenerated: true,
          tags: [...(job.tags ?? []), 'enhanced'],
          trace: new Trace(),
        })
      : await generateOne({
          ...job,
          compiled: {
            ...job.compiled,
            text: `${job.compiled.text}
${regenerateHint(first)}`,
          },
          regenerated: true,
          trace: new Trace(),
        });
  if (!second.assetId) return { out, judgement: first };
  const again = await judgeArt(projectId, sc, second.assetId);
  // Kept only if the judge finds it better (never a blind replacement).
  if (again && again.overall > first.overall) {
    trace.stage('QA', `directeur artistique : ${first.overall} → ${again.overall}/10, nouvelle image gardée`);
    return { out: second, judgement: again };
  }
  trace.stage(
    'QA',
    `directeur artistique : la reprise n'est pas meilleure (${again?.overall ?? 'non jugée'}), première image gardée`,
  );
  return { out, judgement: first };
}

/** Image of a scene: Style DNA + consistency profiles + world injected; references = redrawn character references. */
export async function generateSceneImage(
  projectId: string,
  sceneId: string,
  o: { variants?: number; forceModel?: string; regenerate?: boolean } = {},
): Promise<string[]> {
  const bp = bpOf(projectId);
  const sc = bp.scenes.find((s) => s.scene_id === sceneId);
  if (!sc) throw new StudioError('UNKNOWN', 'scène introuvable');
  const trace = new Trace();
  trace.stage(
    'PRODUCTION_CLASSIFICATION',
    `image de scène ${sceneId} (${bp.mode}, plafond ${bp.cap.toFixed(2)} $)`,
  );
  const idx = bp.scenes.indexOf(sc);
  const ctx = {
    style: bp.styleDNA,
    characters: bp.characters,
    worlds: bp.worlds,
    previous: bp.scenes[idx - 1] ?? null,
    next: bp.scenes[idx + 1] ?? null,
    platform: bp.platform,
    aspect: bp.aspect,
  };
  const compiled = compileScene(sc, ctx, 'image', { maxChars: 2400 });
  const pack = contextPack(bp, sceneId);
  trace.stage(
    'PROMPT_COMPILATION',
    `${compiled.version} · contexte compressé ${pack.tokensApprox} jetons (${pack.omittedChars} caractères non envoyés)`,
  );
  const refs = sc.characters
    .map((n) => bp.characters.find((c) => c.name === n.toUpperCase())?.referenceAssetId)
    .filter((x): x is string => Boolean(x))
    .slice(0, 4);
  const ids: string[] = [];
  const arts = new Map<string, ArtJudgement>();
  const n = Math.max(1, Math.min(16, o.variants ?? 1));
  for (let i = 0; i < n; i++) {
    const job = {
      projectId,
      sceneId,
      compiled,
      references: refs,
      task: 'SCENE-IMAGE' as const,
      mission: `image ${sceneId}`,
      aspect: bp.aspect,
      forceModel: o.forceModel,
      tags: [sceneId, `v${i + 1}`],
      regenerated: o.regenerate,
      trace: i === 0 ? trace : new Trace(),
    };
    let out = await generateOne(job);
    // A comic page (2-6 panels) instead of ONE shot makes the scene incoherent: drawn again once, strictly.
    if (out.assetId && (await isMultiPanel(out.assetId))) {
      trace.stage('QA', `image ${sceneId} : planche de BD détectée au lieu d'un plan unique — régénérée`);
      const again = await generateOne({
        ...job,
        compiled: { ...compiled, text: `${compiled.text}\n${SINGLE_SHOT_RETRY}` },
        regenerated: true,
        trace: new Trace(),
      });
      if (again.assetId && !(await isMultiPanel(again.assetId))) out = again;
    }
    // ART DIRECTOR: judge → accept / enhance (image-to-image on this image) / redraw with the notes. Not in ECO.
    if (out.assetId && bp.mode !== 'ECO') {
      const best = await artPass(projectId, sc, job, out, i === 0 ? trace : new Trace());
      out = best.out;
      if (best.judgement && i === 0) arts.set(sceneId, best.judgement);
    }
    if (out.assetId) ids.push(out.assetId);
  }
  if (ids.length)
    patch(projectId, (b) => ({
      ...b,
      scenes: b.scenes.map((s) =>
        s.scene_id === sceneId
          ? {
              ...s,
              imageAssetId: ids[0],
              // A new picture: its old plate and rig no longer match.
              plateAssetId: undefined,
              rig: undefined,
              status: 'GENERATED',
              model: useStudio.getState().assets[ids[0]!]?.model,
              // Measured by the art director only (null when no vision judge answered).
              quality: arts.has(sceneId) ? artQuality(arts.get(sceneId)!) : (s.quality ?? null),
            }
          : s,
      ),
      prompts: [
        ...b.prompts,
        {
          id: uid('prompt'),
          version: compiled.version,
          kind: 'image',
          text: compiled.text,
          model: useStudio.getState().assets[ids[0]!]?.model,
          at: Date.now(),
        },
      ].slice(-300),
    }));
  patch(projectId, (b) =>
    setStage(b, 'IMAGES', b.scenes.every((s) => s.imageAssetId) ? 'COMPLETED' : 'RUNNING'),
  );
  return ids;
}

/** 2D redraw of a character pose: ONE image per pose; the redrawn neutral pose then serves as the style reference. */
export async function redrawCharacter(
  projectId: string,
  characterId: string,
  poses: string[] = ['neutral'],
  o: { forceModel?: string } = {},
): Promise<string[]> {
  const out: string[] = [];
  for (const pose of poses) {
    const bp = bpOf(projectId);
    const ch = bp.characters.find((c) => c.id === characterId);
    if (!ch) throw new StudioError('UNKNOWN', 'personnage introuvable');
    const source = ch.poses[pose] ?? ch.poses.neutral ?? Object.values(ch.poses)[0];
    const refs = [
      ...(pose !== 'neutral' && ch.referenceAssetId ? [ch.referenceAssetId] : []),
      ...(source ? [source] : []),
    ];
    const compiled = compileCharacter(
      { ...ch, consistency: ch.consistency || buildConsistency(ch) },
      bp.styleDNA,
      pose,
      { maxChars: 2000 },
    );
    // With a source image: redraw THAT character. Without one: design the character from the written sheet only.
    const c2: Compiled = {
      ...compiled,
      text: source
        ? `${redrawInstruction(bp.styleDNA)} ${compiled.text}`
        : `Create a new ${dimensionOf(bp.styleDNA)} character design from this description, plain white background, no logo, no text. ${compiled.text}`,
    };
    const r = await generateOne({
      projectId,
      characterId: ch.name,
      compiled: c2,
      references: refs,
      task: `${dimensionOf(bp.styleDNA)}-REDRAW`,
      mission: `redessin ${dimensionOf(bp.styleDNA)} ${ch.name} / ${pose}`,
      aspect: '3:4',
      forceModel: o.forceModel,
      kind: 'character',
      tags: ['2d-redraw', pose, ch.name],
    });
    if (r.assetId) {
      out.push(r.assetId);
      patch(projectId, (b) => ({
        ...b,
        characters: b.characters.map((c) =>
          c.id === characterId
            ? {
                ...c,
                poses: { ...c.poses, [`${pose}-2d`]: r.assetId! },
                referenceAssetId: pose === 'neutral' ? r.assetId : c.referenceAssetId,
              }
            : c,
        ),
      }));
    }
  }
  patch(projectId, (b) => setStage(b, 'CHARACTERS', 'COMPLETED'));
  return out;
}

// ───────── voice ─────────
export const lineKey = (sceneId: string, i: number) => `${sceneId}:${i}`;
const audioSeconds = (blob: Blob): Promise<number> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      resolve(Number.isFinite(a.duration) ? a.duration : 0);
      URL.revokeObjectURL(url);
    };
    a.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(url);
    };
    a.src = url;
  });
/** Speaks one dialogue line with the voice profile of its speaker (model and voice chosen among the discovered ones). */
export async function generateLine(
  projectId: string,
  sceneId: string,
  index: number,
  o: { forceModel?: string; voice?: string } = {},
): Promise<{ assetId: string; seconds: number }> {
  const bp = bpOf(projectId);
  const sc = bp.scenes.find((s) => s.scene_id === sceneId);
  const line = sc?.dialogue[index];
  if (!sc || !line) throw new StudioError('UNKNOWN', 'réplique introuvable');
  const reg = await loadRegistry();
  const key = speakerKey(line.speaker);
  const prof = bp.voices.find((v) => speakerKey(v.characterId) === key);
  // ONE voice per character for the whole film: the first line spoken fixes model + voice (v48: voices changed).
  const lock = bp.audio.castLock?.[key];
  const wantModel = o.forceModel ?? prof?.model ?? lock?.model;
  const wantVoice =
    o.voice ?? prof?.voice ?? (lock && (!wantModel || lock.model === wantModel) ? lock.voice : undefined);
  const models = modelsWith(reg, 'speech', 'SPEECH').filter((m) => !wantModel || m.id === wantModel);
  const trace = new Trace();
  trace.stage('PRODUCTION_CLASSIFICATION', `voix ${line.speaker} · ${line.language}`);
  const cands = models
    .map((m) => {
      // VOICE CASTING: without a chosen voice, each character gets its own gender / age coherent voice (never the
      // same default voice for everybody).
      // Every speaker of the film is cast (also those without a sheet, e.g. « FRÈRE »), in a stable order, and the
      // voices already locked to someone else are never reused.
      const sheets = bp.characters.map((c) => ({
        id: c.id,
        name: c.name,
        gender: c.gender,
        age: c.age,
        voice: c.voice,
        role: c.role,
      }));
      const extra = [...new Set(bp.scenes.flatMap((x) => x.dialogue.map((d) => speakerKey(d.speaker))))]
        .filter((k) => k && !sheets.some((c) => speakerKey(c.name) === k))
        .map((k) => ({ id: k, name: k }));
      // Deterministic over the WHOLE cast (parallel lines of one speaker get the same voice); the lock then keeps it.
      const cast = castVoices([...sheets, ...extra], m.voices, line.language || 'fr');
      const voice =
        wantVoice && m.voices.includes(wantVoice)
          ? wantVoice
          : (cast[key] ?? cast[line.speaker.toUpperCase()] ?? m.voices[0]);
      return { m, voice, v: validateSpeechRequest(m, { voice }) };
    })
    .filter((c) => c.v.ok)
    .map((c) => ({ model: c.m, voice: c.voice, estimate: estimateSpeech(c.m, line.text.length) }));
  trace.stage('CAPABILITY_DISCOVERY', `${cands.length} modèle(s) de synthèse vocale`);
  const byId = new Map(cands.map((c) => [c.model.id, c]));
  const out = await executeMedia<{ blob: Blob }>({
    projectId,
    sceneId,
    kind: 'speech',
    task: `VOICE-${line.language.toUpperCase()}`,
    style: 'default',
    contract: 'mp3',
    promptVersion: 'speech-v1',
    mission: `voix ${sceneId}#${index}`,
    trace,
    candidates: cands.map((c) => ({ model: c.model, estimate: c.estimate })),
    call: async (m) => {
      const r = await speak({
        model: m.id,
        input: line.text,
        voice: byId.get(m.id)!.voice,
        speed: naturalSpeed(line.pace),
      });
      return { result: { blob: r.blob }, cost: null };
    },
    store: async (res, m) => ({
      blob: res.blob,
      kind: 'voice',
      mime: res.blob.type || 'audio/mpeg',
      name: `${line.speaker}-${sceneId}-${index}-${m.id.split('/').pop()}`,
      tags: [line.speaker, sceneId, line.language],
      prompt: line.text,
    }),
  });
  const seconds = await audioSeconds((await blobs.get(out.assetId!))!);
  patch(projectId, (b) => ({
    ...b,
    audio: {
      ...b.audio,
      voices: {
        ...(b.audio.voices ?? {}),
        [lineKey(sceneId, index)]: { assetId: out.assetId!, seconds, model: out.model },
      },
      // The first voice that really spoke for this character is kept for all its other lines.
      castLock:
        b.audio.castLock?.[key] || !byId.get(out.model)?.voice
          ? b.audio.castLock
          : { ...(b.audio.castLock ?? {}), [key]: { model: out.model, voice: byId.get(out.model)!.voice! } },
    },
  }));
  return { assetId: out.assetId!, seconds };
}
export type { Scene };

/** The scene script as the humour judge reads it (actions + lines with gestures). */
export function scriptText(bp: Blueprint): string {
  return bp.scenes
    .map((s, i) =>
      [
        `SCÈNE ${i + 1} (${s.beat}) — ${s.action}`,
        ...s.dialogue.map((d) => `${d.speaker}${d.gesture ? ` [${d.gesture}]` : ''} : ${d.text}`),
      ].join('\n'),
    )
    .join('\n\n');
}
/** DEGRÉ D'HUMOUR: the judge scores the script on the reference grid (null when no model answered — nothing invented). */
export async function judgeHumor(projectId: string): Promise<HumorVerdict | null> {
  const bp = bpOf(projectId);
  if (!bp.scenes.length) return null;
  try {
    const r = await runText({
      projectId,
      purpose: 'juge humour (grille de référence)',
      maxTokens: 600,
      temperature: 0,
      messages: [{ role: 'user', content: humorPrompt(scriptText(bp)) }],
    });
    const v = parseHumor(r.text);
    if (!v) return null;
    patch(projectId, (b) => ({
      ...b,
      qc: {
        ...(b.qc ?? { at: Date.now() }),
        humor: { ...v, model: r.model, at: Date.now() },
        at: Date.now(),
      },
    }));
    return v;
  } catch {
    return null;
  }
}

/**
 * The owner's OWN picture for a scene (their characters, their set): it replaces the generated image and is validated;
 * the old clip, skeleton and plate are dropped so the animation (Circuit Grok, Marionnette) starts from it.
 */
export async function useOwnSceneImage(projectId: string, sceneId: string, file: Blob): Promise<string> {
  const id = `asset-own-${Date.now().toString(36)}-${sceneId}`;
  await blobs.put(id, file);
  useStudio.getState().addAsset({
    id,
    kind: 'image',
    status: 'FINAL_ASSET',
    projectId,
    sceneId,
    model: 'import',
    createdAt: Date.now(),
    cost: 0,
    source: 'Votre image',
    tags: ['image', sceneId, 'import'],
    mime: file.type || 'image/png',
    bytes: file.size,
    name: `image-${sceneId}`,
  });
  patch(projectId, (b) => ({
    ...b,
    assets: [...b.assets, id],
    scenes: b.scenes.map((s) =>
      s.scene_id === sceneId
        ? {
            ...s,
            imageAssetId: id,
            status: 'APPROVED' as const,
            videoAssetId: undefined,
            rig: undefined,
            plateAssetId: undefined,
            maskAssetId: undefined,
            clipReport: undefined,
          }
        : s,
    ),
  }));
  return id;
}
