/**
 * CALQUE ÉMOTIONS & VISÈMES — two public references of animation / psychology adapted to the puppet engine:
 *  - BODY: the bodily expression of emotions measured by Wallbott (1998, « Bodily expression of emotion ») and the basic
 *    emotions of Ekman: anger = upper body forward, arms raised / stretched, fast movements; joy = arms up, head up,
 *    bouncing; sadness = collapsed upper body, head down, slow; fear = backward, shrinking, trembling; surprise = head back,
 *    arms up, a jolt; shame = head bent down; pride = head up, chest out; contempt = head tilted back / aside.
 *    Each emotion is an OFFSET layered on the pose (lean, head, arms, tempo, tremble, squash).
 *  - MOUTH: the Preston Blair mouth chart (the classic viseme set of 2D animation: A/I, E, O, U, M-B-P, F-V, L, rest)
 *    read from the line's letters, so the jaw follows what is SAID, not only the voice level.
 */
export interface EmotionBody {
  /** Lean towards the other (+) / back (−), radians. */
  lean: number;
  /** Head tilt (radians, sign = towards the other) and head drop (fraction of head height, + = down). */
  headTilt: number;
  headDrop: number;
  /** Added arm raise (radians, + = up). */
  arms: number;
  /** Speed of the idle motion (1 = normal) and tremble amplitude (fraction of the width). */
  tempo: number;
  tremble: number;
  /** Vertical squash (−: shrinks, +: stands tall) and bounce (fraction of the height). */
  squash: number;
  bounce: number;
}
const E = (lean: number, headTilt: number, headDrop: number, arms: number, tempo: number, tremble: number, squash: number, bounce: number): EmotionBody => ({ lean, headTilt, headDrop, arms, tempo, tremble, squash, bounce });
export const EMOTION_BODY: Record<string, EmotionBody> = {
  colère: E(0.03, 0.02, -0.01, 0.12, 1.5, 0.002, 0.02, 0),
  joie: E(0, -0.02, -0.03, 0.18, 1.3, 0, 0.02, 0.012),
  tristesse: E(-0.01, 0.03, 0.06, -0.08, 0.6, 0, -0.04, 0),
  peur: E(-0.03, 0.02, 0.02, 0.1, 1.4, 0.003, -0.04, 0),
  surprise: E(-0.02, -0.03, -0.04, 0.2, 1.2, 0, 0.04, 0.006),
  honte: E(-0.005, 0.04, 0.07, -0.05, 0.7, 0, -0.03, 0),
  fierté: E(-0.01, -0.03, -0.04, 0.04, 0.9, 0, 0.04, 0),
  mépris: E(-0.015, -0.05, -0.02, 0, 0.8, 0, 0.01, 0),
  dégoût: E(-0.025, 0.04, 0, 0.05, 0.9, 0, -0.01, 0),
  neutre: E(0, 0, 0, 0, 1, 0, 0, 0),
};
const KEYS: [RegExp, keyof typeof EMOTION_BODY][] = [
  [/col[èe]re|f[âa]ch|furieu|énerv|enerv|rage|angry|anger|mad/i, 'colère'],
  [/joie|heureu|content|rire|rigol|ravi|joy|happy|excit|euphor/i, 'joie'],
  [/trist|pleur|chagrin|déprim|deprim|sad|cry/i, 'tristesse'],
  [/peur|effray|terrifi|panique|craint|fear|scared|afraid/i, 'peur'],
  [/surpri|stupeur|choc|étonn|etonn|shock|amaz|wow/i, 'surprise'],
  [/honte|gên|gen[ée]|embarras|shame|ashamed|embarrass/i, 'honte'],
  [/fier|fierté|frime|confian|proud|pride|swag/i, 'fierté'],
  [/mépris|mepris|dédain|dedain|moqu|sarcas|contempt|smug/i, 'mépris'],
  [/dégo[uû]t|degout|beurk|écœur|ecoeur|disgust/i, 'dégoût'],
];
export const emotionOf = (text: string | undefined): keyof typeof EMOTION_BODY => KEYS.find(([re]) => re.test(text ?? ''))?.[1] ?? 'neutre';

/** Preston Blair visemes: how open the jaw is for each mouth shape (0 closed … 1 wide open). */
export const VISEMES: Record<string, number> = { AI: 1, E: 0.6, O: 0.75, U: 0.45, MBP: 0, FV: 0.15, L: 0.5, WQ: 0.35, etc: 0.4, rest: 0.08 };
/** The viseme of one letter (French / English spelling, good enough for a cartoon). */
export function visemeOf(ch: string): keyof typeof VISEMES {
  const c = ch.toLowerCase();
  if ('aàâáiîïíy'.includes(c)) return 'AI';
  if ('eéèêë'.includes(c)) return 'E';
  if ('oôó'.includes(c)) return 'O';
  if ('uùûü'.includes(c)) return 'U';
  if ('mbp'.includes(c)) return 'MBP';
  if ('fv'.includes(c)) return 'FV';
  if (c === 'l') return 'L';
  if ('wq'.includes(c)) return 'WQ';
  if (/[a-z]/.test(c)) return 'etc';
  return 'rest';
}
/** Jaw opening for the line at progress 0..1 (letters spread evenly over the line, smoothed between neighbours). */
export function visemeAt(text: string, progress: number): number {
  const letters = [...text].filter((c) => /[\p{L}\s]/u.test(c));
  if (!letters.length) return 0;
  const f = Math.max(0, Math.min(0.9999, progress)) * letters.length;
  const i = Math.floor(f);
  const a = VISEMES[visemeOf(letters[i]!)]!;
  const b = VISEMES[visemeOf(letters[Math.min(letters.length - 1, i + 1)]!)]!;
  const t = f - i;
  return a + (b - a) * t * t * (3 - 2 * t);
}
