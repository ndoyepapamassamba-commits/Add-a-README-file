// LE RÉALISATEUR côté app (bac à sable Studio 3D Pro) — prompt → consignes de jeu VALIDÉES pour le moteur Blender,
// 0 $ de vidéo. Même vocabulaire fermé que director.py (scripts/blenderfilm/direction-vocab.json) : un modèle texte
// gratuit (« :free » d'OpenRouter) propose, le code valide, le moteur joue. Pure : no DOM, no network.
import VOCAB from '../../../scripts/blenderfilm/direction-vocab.json';

export const CAMERA = ['punch', 'push', 'pull', 'drift', 'aucun'] as const;
export type Camera = (typeof CAMERA)[number];
export const GESTES = Object.keys(VOCAB.gestes);
export const POSES_STANDARD = Object.keys(VOCAB.poses);

export interface Beat {
  who: string;
  text: string;
  pose?: string;
  react?: Record<string, string>;
  move?: string;
}
export interface CastMember {
  id: string;
  name: string;
  enter?: number;
  /** The drawn poses of this actor's board (rig.json); the 5 standard ones when unknown. */
  poses?: string[];
}
export interface Story {
  title?: string;
  hook?: string;
  cast: CastMember[];
  beats: Beat[];
  punch?: { beat: number };
}
export interface Direction {
  pose?: string;
  geste: string;
  energie: number;
  camera: Camera;
  reactions: Record<string, string>;
  /** Where each field came from: measurable rules or the model. */
  source: 'regles' | 'modele' | 'mixte';
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The gesture tag a line calls for (longest whole-word cue of the vocabulary wins), 'aucun' otherwise. */
export function searchGesture(text: string): string {
  const t = fold(text);
  let best: [string, number] = ['aucun', 0];
  for (const [tag, g] of Object.entries(VOCAB.gestes)) {
    for (const w of (g as { mots?: string[] }).mots ?? []) {
      const w_ = fold(w);
      if (w_ && new RegExp(`(?<![a-z0-9])${esc(w_)}(?![a-z0-9])`).test(t) && w_.length > best[1]) best = [tag, w_.length];
    }
  }
  return best[0];
}

const POSE_GESTE: Record<string, string> = { rire: 'rire', haussement: 'haussement', accuse: 'pointe' };

/** RULES: measurable cues only — the same as director.py (cue words, punctuation, punchline, the story's pose). */
export function rulesDirection(beat: Beat, i: number, story: Story): Direction {
  const text = beat.text ?? '';
  let geste = searchGesture(text);
  if (geste === 'aucun') geste = POSE_GESTE[beat.pose ?? 'neutre'] ?? 'aucun';
  const bangs = (text.match(/!/g) ?? []).length + (text.match(/\?!/g) ?? []).length;
  if (geste === 'aucun' && (text.includes('?!') || bangs >= 2)) geste = 'dispute';
  const punch = story.punch?.beat === i;
  const energie = punch ? 0.9 : bangs >= 2 || text.includes('?!') ? 0.8 : bangs === 1 || (text === text.toUpperCase() && /[A-Z]/.test(text)) ? 0.7 : text.length > 90 ? 0.45 : 0.6;
  return { geste, energie, camera: (beat.move as Camera) ?? 'aucun', reactions: beat.react ?? {}, source: 'regles' };
}

export const presentAt = (story: Story, i: number): CastMember[] =>
  story.cast.filter((c) => c.enter === undefined || c.enter === null || c.enter <= i);

export const posesOf = (c: CastMember): string[] => (c.poses?.length ? c.poses : POSES_STANDARD);

/** The system prompt: the closed vocabulary, the troupe's drawn poses — nothing else exists for the engine. */
export function systemPrompt(story: Story): string {
  const gestes = Object.entries(VOCAB.gestes)
    .map(([k, g]) => `  - ${k} : ${(g as { desc: string }).desc}`)
    .join('\n');
  const poses = story.cast.map((c) => `  - ${c.name} : ${posesOf(c).join(', ')}`).join('\n');
  return (
    `Tu es le réalisateur d'un sketch TikTok dessiné en Côte d'Ivoire (humour de marché, de famille, de maquis ; style Afrikatoon). ` +
    `Titre : « ${story.title ?? ''} ». Accroche : « ${story.hook ?? ''} ».\n` +
    `Pour chaque réplique, tu choisis seulement dans ces listes (rien d'autre n'existe dans le moteur) :\nGESTES capturés :\n${gestes}\n` +
    `POSES dessinées par personnage :\n${poses}\n` +
    `ENERGIE : 0 = calme, 0,5 = normal, 1 = explosif (chute, cri). CAMERA : punch (zoom sec, chute ou révélation), push (avance), pull (recul), drift (glissement), aucun (laisser le montage choisir : le plus fréquent).\n` +
    `REACTIONS : la pose dessinée de chaque partenaire PRÉSENT qui entend la réplique (choc pour une surprise, accuse pour un reproche, rire pour une blague réussie, haussement pour l'indifférence, neutre sinon).\n` +
    `Réponds UNIQUEMENT par un TABLEAU JSON : un objet par réplique, dans l'ordre, avec pose, geste, energie, camera, reactions (clé = nom du personnage présent).`
  );
}

export function userPrompt(story: Story): string {
  return story.beats
    .map((b, i) => {
      const present = presentAt(story, i)
        .filter((c) => c.id !== b.who)
        .map((c) => c.name);
      const prev = i ? `Réplique précédente : ${story.beats[i - 1]!.who} — « ${story.beats[i - 1]!.text} »\n` : '';
      return `${prev}Réplique ${i + 1}/${story.beats.length}. Qui parle : ${b.who}. Présents : ${present.join(', ') || 'personne'}. Texte : « ${b.text} »`;
    })
    .join('\n\n');
}

/** The model's text → one object per beat (a JSON array, possibly wrapped in prose or a code fence); [] when unreadable. */
export function parseDirections(text: string): unknown[] {
  const m = /\[[\s\S]*\]/.exec(text ?? '');
  if (!m) return [];
  try {
    const arr: unknown = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Only what the engine can play survives (unknown values are dropped, never guessed); rules first, the model for the gaps. */
export function validateDirection(raw: unknown, beat: Beat, i: number, story: Story): Direction {
  const r = rulesDirection(beat, i, story);
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const who = story.cast.find((c) => c.id === beat.who);
  const present = presentAt(story, i).filter((c) => c.id !== beat.who);
  const out: Direction = { ...r, reactions: { ...r.reactions } };
  let fromModel = 0;
  if (typeof d.geste === 'string' && GESTES.includes(d.geste) && r.geste === 'aucun' && d.geste !== 'aucun') {
    out.geste = d.geste;
    fromModel++;
  }
  const e = Number(d.energie);
  if (Number.isFinite(e) && r.energie <= 0.6 && e > r.energie) {
    out.energie = Math.min(1, e);
    fromModel++;
  }
  if (typeof d.pose === 'string' && who && posesOf(who).includes(d.pose) && !beat.pose && d.pose !== 'rire') {
    out.pose = d.pose;
    fromModel++;
  }
  if (typeof d.camera === 'string' && (CAMERA as readonly string[]).includes(d.camera) && !beat.move && d.camera === 'punch' && story.punch?.beat === i) {
    out.camera = 'punch';
    fromModel++;
  }
  // A partner's reaction proposed by the model needs a TRIGGER in the line (a cry, the punchline, an
  // energetic line): measured on film 6, a 1,7B model put « accuse » on 15 lines of 18 — a pose ping-pong.
  const trigger = story.punch?.beat === i || /!/.test(beat.text ?? '') || r.energie >= 0.7; // a plain question is no reason
  const reactions = trigger && d.reactions && typeof d.reactions === 'object' ? (d.reactions as Record<string, unknown>) : {};
  for (const [name, pose] of Object.entries(reactions)) {
    const c = present.find((x) => x.name === name);
    if (c && typeof pose === 'string' && posesOf(c).includes(pose) && pose !== 'neutre' && !(c.id in out.reactions)) {
      out.reactions[c.id] = pose;
      fromModel++;
    }
  }
  out.source = fromModel ? 'mixte' : 'regles';
  return out;
}

/** The directed story the Blender engine reads (film.py → plan.py): the same beats with the direction fields. */
export function directStory(story: Story, raw: unknown[] = []): Story & { _director: { backend: string; date: string } } {
  const beats = story.beats.map((b, i) => {
    const d = validateDirection(raw[i], b, i, story);
    const nb: Beat & { geste: string; energie: number } = { ...b, geste: d.geste, energie: Math.round(d.energie * 100) / 100 };
    if (d.pose && !b.pose) nb.pose = d.pose;
    if (Object.keys(d.reactions).length) nb.react = d.reactions;
    if (d.camera !== 'aucun' && !b.move) nb.move = d.camera;
    return nb;
  });
  return { ...story, beats, _director: { backend: raw.length ? 'app:modele+regles' : 'app:regles', date: new Date().toISOString().slice(0, 10) } };
}

/** « QUI : texte » lines → a story (the sandbox's quick entry; ids are the lower-cased names). */
export function storyFromLines(text: string, title = ''): Story {
  const beats: Beat[] = [];
  const cast = new Map<string, CastMember>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([^:]{1,40}?)\s*:\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const name = m[1]!.trim().toUpperCase();
    const id = fold(name).replace(/[^a-z0-9]+/g, '-');
    if (!cast.has(id)) cast.set(id, { id, name });
    beats.push({ who: id, text: m[2]! });
  }
  return { title, cast: [...cast.values()], beats };
}

/** The free text models of a catalogue (OpenRouter « :free »: 50 requests/day without credits, 1 000 with 10 $ bought once). */
export const freeModels = <T extends { id: string }>(models: T[]): T[] => models.filter((m) => /:free$/.test(m.id));
