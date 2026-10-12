/**
 * CONTINUITÉ D'UN SKETCH COURT — mesurée sur « Le chef invisible » (v44, circuit Grok) :
 *  - une scène dessinée dehors alors que tout le sketch se passe au bureau → un film ≤ 60 s garde UN décor (le décor
 *    dominant), sauf si l'histoire en impose plusieurs à part égale ;
 *  - des bras qui s'étirent / se déchirent dans les clips image → vidéo → le prompt d'animation verrouille l'identité
 *    de la première image et demande un jeu sobre (bouche, regard, un geste par réplique, caméra fixe).
 */
import type { CharacterSheet, Scene } from './types';

export const settingKey = (s: string) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(le|la|les|l|du|de|des|d|un|une|au|aux|dans|interieur|int|ext)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Short sketch → one set: every scene takes the dominant location (most frequent; tie → the first scene's). */
export function lockShortSetting(scenes: Scene[], durationS: number, maxS = 60): { scenes: Scene[]; location: string | null; changed: string[] } {
  if (durationS > maxS || scenes.length < 2) return { scenes, location: null, changed: [] };
  const count = new Map<string, { n: number; first: number; name: string }>();
  scenes.forEach((sc, i) => {
    const k = settingKey(sc.location);
    if (!k) return;
    const c = count.get(k) ?? { n: 0, first: i, name: sc.location };
    c.n++;
    count.set(k, c);
  });
  if (count.size < 2) return { scenes, location: null, changed: [] };
  const ranked = [...count.values()].sort((a, b) => b.n - a.n || a.first - b.first);
  // Two sets used equally often (a real « here then there » story): left as written.
  if (ranked[0]!.n === ranked[1]!.n && ranked[0]!.n > 1) return { scenes, location: null, changed: [] };
  const name = ranked[0]!.name;
  const key = settingKey(name);
  const changed = scenes.filter((sc) => settingKey(sc.location) !== key).map((sc) => sc.scene_id);
  return { scenes: scenes.map((sc) => (settingKey(sc.location) === key ? sc : { ...sc, location: name })), location: name, changed };
}

/** Image → video prompt: the motion of the beat, the first frame locked, deformation named as what to avoid. */
export function lockedVideoPrompt(sc: Pick<Scene, 'video_prompt' | 'action' | 'characters' | 'location'>, cast: Pick<CharacterSheet, 'name'>[] = []): string {
  const motion = (sc.video_prompt || sc.action || '').trim().replace(/\s+/g, ' ').slice(0, 700);
  const names = (sc.characters.length ? sc.characters : cast.map((c) => c.name)).join(', ');
  return [
    motion,
    `Keep the first frame exactly: same characters${names ? ` (${names})` : ''} with the same face, skin tone, hair, glasses, clothes and body proportions; same place (${sc.location || 'same set'}), same props, same framing.`,
    'Animate only natural acting: lips moving in sync with the speech, blinks, small head turns, one clear hand gesture per line, slight body sway; static camera or a very slow push-in.',
    'Avoid: morphing, melting or stretching arms, extra arms or hands, torn or flickering body parts, objects passing through bodies, new characters, a change of place, camera cuts, any text.',
  ].join(' ');
}
