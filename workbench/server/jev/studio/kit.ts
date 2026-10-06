// Bridge with the local engine `afrikatoon-auto`: exports a JSON kit matching what `run.py` expects, plus the 2D assets.
// The studio does NOT replace that engine: it is its pre-production room.
import type { Blueprint, Scene } from './types';
import { makeZip, type ZipEntry } from './zip';
import { scanValue } from './secrets';

export interface AfrikaKit {
  title: string;
  concept: string;
  characters: string[];
  setting: string;
  theme: string;
  scenes: {
    act: string;
    beat: string;
    characters: string[];
    image_prompt: string;
    animation_prompt: string;
    dialogue: { speaker: string; text: string }[];
  }[];
  hook_text: string;
  caption: string;
  hashtags: string[];
  score: Record<string, number>;
}
const slug = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'production';

export function buildKit(bp: Blueprint, o: { caption?: string; hashtags?: string[] } = {}): AfrikaKit {
  const names = [...new Set(bp.characters.map((c) => c.name.toUpperCase()))];
  const scoreEntries = bp.qa ? Object.entries(bp.qa.scores).filter(([, v]) => typeof v === 'number') : [];
  return {
    title: bp.title,
    concept: bp.story?.concept || bp.story?.logline || bp.project.idea,
    characters: names,
    setting: bp.story?.setting || bp.worlds[0]?.name || '',
    theme: bp.story?.theme || '',
    scenes: bp.scenes.map((sc: Scene) => ({
      act: sc.act,
      beat: sc.beat,
      characters: sc.characters.map((c) => c.toUpperCase()),
      image_prompt: sc.visual_prompt,
      animation_prompt: sc.video_prompt || sc.action,
      dialogue: sc.dialogue.map((d) => ({ speaker: d.speaker.toUpperCase(), text: d.text })),
    })),
    hook_text: bp.story?.hook ?? '',
    caption: o.caption ?? '',
    hashtags: o.hashtags ?? [],
    // Only measured scores; none → empty object (never invented).
    score: Object.fromEntries(scoreEntries as [string, number][]),
  };
}
export function validateKit(k: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const o = (k ?? {}) as Record<string, unknown>;
  for (const f of ['title', 'concept', 'setting', 'theme', 'hook_text', 'caption'])
    if (typeof o[f] !== 'string') errors.push(`champ « ${f} » absent ou non textuel`);
  for (const f of ['characters', 'hashtags', 'scenes'])
    if (!Array.isArray(o[f])) errors.push(`champ « ${f} » absent ou non liste`);
  if (typeof o.score !== 'object' || o.score === null) errors.push('champ « score » absent');
  const names = new Set(((o.characters as unknown[]) ?? []).map(String));
  for (const n of names)
    if (n !== n.toUpperCase()) errors.push(`personnage « ${n} » doit être en MAJUSCULES`);
  ((o.scenes as Record<string, unknown>[]) ?? []).forEach((s, i) => {
    for (const f of ['act', 'beat', 'image_prompt', 'animation_prompt'])
      if (typeof s[f] !== 'string') errors.push(`scène ${i + 1} : « ${f} » manquant`);
    if (!Array.isArray(s.characters)) errors.push(`scène ${i + 1} : « characters » manquant`);
    else
      for (const c of s.characters as string[])
        if (!names.has(c)) errors.push(`scène ${i + 1} : personnage « ${c} » absent de la liste`);
    if (!Array.isArray(s.dialogue)) errors.push(`scène ${i + 1} : « dialogue » manquant`);
    else
      for (const d of s.dialogue as Record<string, unknown>[])
        if (typeof d.speaker !== 'string' || typeof d.text !== 'string')
          errors.push(`scène ${i + 1} : réplique invalide`);
  });
  const secrets = scanValue(k);
  if (secrets.length) errors.push('le kit contient un motif de secret : export bloqué');
  return { ok: errors.length === 0, errors };
}

export interface KitAsset {
  character: string;
  pose: string;
  bytes: Uint8Array;
  meta?: Record<string, unknown>;
}
export interface KitBackground {
  name: string;
  bytes: Uint8Array;
}
export const RUN_COMMAND = (path: string) =>
  `AFRIKATOON_2D_DIR=characters_2d_ia python run.py run --kit ${path} --mock 2d-hq --no-upload`;

/** The ZIP described in the spec: kits/<date>/<NN>-<slug>.json + assets/characters_2d_ia/<NAME>/<pose>.png + meta.json + LISEZMOI.txt */
export function buildKitZip(
  bp: Blueprint,
  o: {
    date?: string;
    index?: number;
    caption?: string;
    hashtags?: string[];
    assets?: KitAsset[];
    backgrounds?: KitBackground[];
  } = {},
): { zip: Uint8Array; kit: AfrikaKit; validation: { ok: boolean; errors: string[] }; path: string } {
  const date = o.date ?? new Date().toISOString().slice(0, 10);
  const kit = buildKit(bp, { caption: o.caption, hashtags: o.hashtags });
  const validation = validateKit(kit);
  const path = `kits/${date}/${String(o.index ?? 1).padStart(2, '0')}-${slug(bp.title)}.json`;
  const entries: ZipEntry[] = [{ path, data: JSON.stringify(kit, null, 2) }];
  const metas = new Map<string, Record<string, unknown>>();
  for (const a of o.assets ?? []) {
    const dir = `assets/characters_2d_ia/${a.character.toUpperCase()}`;
    entries.push({ path: `${dir}/${a.pose}.png`, data: a.bytes });
    metas.set(dir, {
      ...(metas.get(dir) ?? {}),
      ...(a.meta ?? {}),
      character: a.character.toUpperCase(),
      poses: [...new Set([...((metas.get(dir)?.poses as string[]) ?? []), a.pose])],
    });
  }
  for (const [dir, m] of metas) entries.push({ path: `${dir}/meta.json`, data: JSON.stringify(m, null, 2) });
  for (const b of o.backgrounds ?? [])
    entries.push({ path: `assets/backgrounds_2d_ia_${slug(b.name)}.png`, data: b.bytes });
  entries.push({
    path: 'LISEZMOI.txt',
    data: [
      'Kit exporté depuis MASSAMBA Workbench — AI Visual Studio (pré-production).',
      '',
      '1. Copiez le contenu de ce ZIP à la racine du dossier afrikatoon-auto/.',
      '2. Lancez :',
      `   ${RUN_COMMAND(path)}`,
      '',
      'Le rendu final (2D, lip-sync Rhubarb, voix, musique, sous-titres) se fait localement : coût 0 $.',
      'Reimportez ensuite la vidéo finale, caption.txt et la planche contact dans l’Asset Library (statut FINAL ASSET).',
      '',
      'Contenu IA : pensez à activer l’étiquette « contenu généré par IA » sur TikTok.',
    ].join('\n'),
  });
  return { zip: makeZip(entries), kit, validation, path };
}
