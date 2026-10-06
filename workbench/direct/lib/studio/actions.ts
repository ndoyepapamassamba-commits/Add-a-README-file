// Studio actions (runtime): registry, story, character library + 2D redraw, scene images, voices. Every paid call goes
// through executeMedia (selection, budget gate, retries, fallback, storage, memory, JEV_LOG).
import { useStudio } from './store';
import { useStore } from '../store';
import { blobs, blobToDataUrl, base64ToBlob } from './blobs';
import { discover, generateImage, loadImagePrices, speak } from './net';
import { executeMedia, type MediaOutcome } from './exec';
import { runText } from './textModel';
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
export async function generateStory(projectId: string): Promise<StoryResult> {
  const bp = bpOf(projectId);
  patch(projectId, (b) => setStage(b, 'STORY', 'RUNNING'));
  const brief = {
    idea: bp.project.idea,
    durationSec: bp.duration,
    language: bp.language,
    platform: bp.platform,
    characters: bp.characters.map((c) => ({ name: c.name, role: c.role })),
    hints: hints(useStudio.getState().memory),
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
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const r = await runText({
      projectId,
      purpose: attempt ? 'story (correction JSON)' : 'story',
      messages,
      maxTokens: 6000,
      temperature: 0.9,
    });
    model = r.model;
    const p = parseStory(r.text, { durationSec: bp.duration, language: bp.language });
    if ('story' in p && p.scenes.length) parsed = p;
    else {
      issues.push(...p.issues.map((i) => i.message));
      messages = [
        ...messages,
        { role: 'assistant', content: r.text.slice(0, 2000) },
        {
          role: 'user',
          content:
            'Ta réponse n’est pas un JSON valide contenant des scènes. Renvoie UNIQUEMENT le JSON demandé.',
        },
      ];
    }
  }
  if (!parsed) {
    patch(projectId, (b) => setStage(b, 'STORY', 'FAILED'));
    return { parsed: null, issues, model };
  }
  const known = new Set(bp.characters.map((c) => c.name.toUpperCase()));
  const stubs: CharacterSheet[] = parsed.story.characters
    .filter((n) => !known.has(n))
    .map((name) => emptyCharacter(name));
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
            .map(emptyWorld),
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
  const n = Math.max(1, Math.min(16, o.variants ?? 1));
  for (let i = 0; i < n; i++) {
    const out = await generateOne({
      projectId,
      sceneId,
      compiled,
      references: refs,
      task: 'SCENE-IMAGE',
      mission: `image ${sceneId}`,
      aspect: bp.aspect,
      forceModel: o.forceModel,
      tags: [sceneId, `v${i + 1}`],
      regenerated: o.regenerate,
      trace: i === 0 ? trace : new Trace(),
    });
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
              status: 'GENERATED',
              model: useStudio.getState().assets[ids[0]!]?.model,
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
  const prof = bp.voices.find((v) => v.characterId.toUpperCase() === line.speaker.toUpperCase());
  const wantModel = o.forceModel ?? prof?.model;
  const wantVoice = o.voice ?? prof?.voice;
  const models = modelsWith(reg, 'speech', 'SPEECH').filter((m) => !wantModel || m.id === wantModel);
  const trace = new Trace();
  trace.stage('PRODUCTION_CLASSIFICATION', `voix ${line.speaker} · ${line.language}`);
  const cands = models
    .map((m) => {
      const voice = wantVoice && m.voices.includes(wantVoice) ? wantVoice : m.voices[0];
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
        speed: line.pace,
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
    },
  }));
  return { assetId: out.assetId!, seconds };
}
export type { Scene };
