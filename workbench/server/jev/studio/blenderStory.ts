/**
 * HISTOIRE DE L'APP → FILM BLENDER — la production écrite dans Film Autopilot (scènes, répliques, émotions) devient
 * l'histoire que le pipeline Blender tourne (scripts/blenderfilm) : distribution (taille et voix lues dans les fiches),
 * décor (décor peint du kit, sinon lieu vivant construit par Blender), répliques avec leur pose (l'émotion du
 * scénariste → la pose de la planche), réactions, chute et accroche. Pur, testé.
 */
import type { Blueprint } from './types';
import { profileOf } from './actor/characterBible';
import { universeSetOf } from './actor/universe';
import { placeOf } from './world/livingWorld';
import type { Pose } from './tiktokComedy';

/** The writer's emotion (any wording, FR/EN) → the pose of the sheet. */
export function poseOfEmotion(emotion: string, text = ''): Pose {
  const e = `${emotion} ${text}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/\b(rire|rit|laugh|joie|joy|amuse|hilar|moqu|ricane|fier)/.test(e)) return 'rire';
  if (/\b(choc|choque|shock|surpris|surprise|peur|fear|panique|stupeur|effroi|horrifi)/.test(e))
    return 'choc';
  if (/\b(colere|anger|angry|furieu|accus|enerv|indign|menac|crie|reproche)/.test(e)) return 'accuse';
  if (/\b(gene|embarras|hausse|shrug|indiffer|mauvaise foi|innocent|desinvolt|resign|ironi)/.test(e))
    return 'haussement';
  return 'neutre';
}
const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12) || 'x';

export interface BlenderStoryResult {
  story: Record<string, unknown> | null;
  /** Why it cannot be shot (characters not drawn yet, no line). */
  problems: string[];
  /** What was decided (shown to the user). */
  notes: string[];
}

/** The blueprint as a Blender film story. Only DRAWN characters can act (sheet or gallery figure). */
export function storyFromBlueprint(bp: Blueprint, o: { decors?: string[] } = {}): BlenderStoryResult {
  const problems: string[] = [];
  const notes: string[] = [];
  const lines = bp.scenes.flatMap((sc, si) => sc.dialogue.map((d) => ({ sc, si, d })));
  if (!lines.length) return { story: null, problems: ['aucune réplique à tourner'], notes };
  // Cast in order of first line.
  const order: string[] = [];
  for (const { d } of lines)
    if (!order.includes(d.speaker.toUpperCase())) order.push(d.speaker.toUpperCase());
  const cast = order.map((name, i) => {
    const p = profileOf(name);
    if (!p)
      problems.push(
        `${name} : pas de fiche dans l’univers (personnage inventé) — il ne peut pas être tourné dans Blender`,
      );
    else if (p.dessin !== 'planche' && p.dessin !== 'galerie')
      problems.push(`${name} : pas encore dessiné (${p.dessin}) — ajoutez sa planche fond vert à la troupe`);
    const n = order.length;
    const x = n === 1 ? 0 : n === 2 ? (i === 0 ? -0.42 : 0.42) : -0.5 + i * (1 / Math.max(1, n - 1));
    const first = lines.findIndex((l) => l.d.speaker.toUpperCase() === name);
    return {
      id: slug(name),
      name: p?.name ?? name,
      height: p?.taille ?? 1.7,
      x: Math.round(x * 100) / 100,
      voice: p?.voix.piper ?? 'siwis',
      ...(p?.voix.pitch ? { pitch: p.voix.pitch } : {}),
      ...(i >= 2 && first > 2 ? { enter: first } : {}),
    };
  });
  const idOf = new Map(order.map((n, i) => [n, cast[i]!.id]));
  // The set: the first scene's location → a painted set of the kit, else the living place Blender builds.
  const loc = bp.scenes[0]?.location ?? '';
  const set = universeSetOf(loc);
  const decor =
    set && (!o.decors || o.decors.includes(set.name)) ? set.name : (placeOf(loc)?.nom ?? (loc || 'Salon'));
  if (!set) notes.push(`lieu « ${loc} » sans décor peint : Blender construit et éclaire ce lieu (${decor})`);
  const beats = lines.map(({ d, sc }, i) => {
    const who = idOf.get(d.speaker.toUpperCase())!;
    const prev = lines[i - 1];
    const react: Record<string, Pose> = {};
    // The one spoken to reacts with the shock on a strong line (accusation, punchline).
    const pose = poseOfEmotion(d.emotion ?? sc.emotion ?? '', d.text);
    if (
      prev &&
      prev.d.speaker.toUpperCase() !== d.speaker.toUpperCase() &&
      (pose === 'accuse' || pose === 'rire')
    )
      react[idOf.get(prev.d.speaker.toUpperCase())!] = 'choc';
    return { who, pose, text: d.text.trim(), ...(Object.keys(react).length ? { react } : {}) };
  });
  // The punchline: the last line of the « chute » scene, else the last line but one (the tag after it).
  let punch = -1;
  lines.forEach((l, i) => {
    if (/chute|punch/i.test(l.sc.beat)) punch = i;
  });
  if (punch < 0) punch = Math.max(0, lines.length - 1);
  // The hook card: the first sentence of the writer's hook, WITH its punctuation (« Qui a mangé le poulet ? »), 7 words max.
  const first = (
    /^[^.!?…]*[.!?…]?/.exec((bp.story?.hook || bp.title || bp.story?.title || '').trim())?.[0] ?? ''
  ).trim();
  const words = first.split(/\s+/).filter(Boolean);
  const hook = words.length > 7 ? words.slice(0, 7).join(' ') : first;
  return {
    story: {
      title: bp.title || bp.story?.title || 'Film',
      hook,
      decor,
      place: loc,
      fps: 25,
      size: [576, 1024],
      music: bp.options?.music !== false,
      cast,
      beats,
      punch: { beat: punch, emoji: '😂' },
    },
    problems,
    notes,
  };
}
