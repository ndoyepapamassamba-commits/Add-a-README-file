/**
 * FORMAT VIRAL « À MOURIR DE RIRE » — measured on the most viewed videos of the reference TikTok account (0,8 to 2,8 M
 * views, 720×1280, 25 i/s, ≈ 65 s) and rebuilt by our own editor (no external engine):
 *  - a run of short sketches, each ONE wide 3D shot of 6 to 10 s (two characters arguing, big gestures);
 *  - between two sketches a ≈ 3 s « stupeur » insert: a shocked face on black, with a comic hit;
 *  - vertical frame: the landscape / square shot stays sharp in a band across the middle, the same shot blurred and
 *    enlarged fills the top and the bottom;
 *  - bilingual karaoke captions, 1 to 3 words at a time in a heavy condensed font with a black outline: the translation
 *    (English) above the band, keyword in cyan; the French line below it, keyword in yellow.
 * Same niche, other accounts measured (10/2026):
 *  - the most viewed clip of the niche (8,3 M views) is ONE 6 s sketch + a 2 s emoji reaction (8 s, it loops): the
 *    « court » preset; the reaction emoji follows the mood (shocked, laughing, wink, sunglasses);
 *  - caption variant: the keyword in a coloured BOX (lime / pink) instead of a coloured word;
 *  - 9:16 native shots: a cut every ≈ 5 s, wide → close-up on the reaction; series in episodes (« PARTIE 5 »).
 * Measures only (cuts, timing, layout); no image, sound or text of these accounts is copied or stored.
 */
export type ReactionKind = 'choc' | 'rire' | 'clin' | 'cool';
/** The two measured presets: « court » (one sketch + reaction, ≈ 8 s, loops) and « compilation » (≈ 65 s). */
export const VIRAL_PRESETS = {
  court: { scenes: 1, sceneSeconds: 6, reactionSeconds: 2 },
  compilation: { scenes: 7, sceneSeconds: 6, reactionSeconds: 3 },
} as const;
/** The reaction emoji of the insert, from the scene's emotion / beat. */
export function reactionFor(emotion = '', beat = ''): ReactionKind {
  const t = `${emotion} ${beat}`.toLowerCase();
  if (/rire|rigol|joie|drôle|drole|laugh|happy|fun/.test(t)) return 'rire';
  if (/malin|ruse|complice|clin|taquin|sly|wink|moqu/.test(t)) return 'clin';
  if (/fier|frime|cool|swag|sapé|sape|confiant|proud/.test(t)) return 'cool';
  return 'choc';
}
export const VIRAL_FORMAT = {
  sketchSeconds: [6, 10] as [number, number],
  shockSeconds: 1.6,
  captionWords: 3,
  topColor: '#2ad4ff',
  bottomColor: '#ffe14a',
  /** Keyword in a coloured box (variant measured on the most viewed account). */
  boxColors: ['#c6ff3d', '#ff4fd8'] as [string, string],
  font: '900 {px}px "Arial Black", Impact, "Helvetica Neue", system-ui, sans-serif',
};

/** Where the sharp shot sits in the output frame (« contain »), and whether blurred fill bands are needed. */
export function fitBand(iw: number, ih: number, W: number, H: number): { x: number; y: number; w: number; h: number; fill: boolean } {
  if (!iw || !ih) return { x: 0, y: 0, w: W, h: H, fill: false };
  const ri = iw / ih;
  const ro = W / H;
  // Close aspects (< 12 % apart): cover the whole frame, no bands.
  if (Math.abs(ri - ro) / ro < 0.12) return { x: 0, y: 0, w: W, h: H, fill: false };
  const s = Math.min(W / iw, H / ih);
  const w = iw * s;
  const h = ih * s;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h, fill: true };
}

/** Karaoke chunks of ≤ n words; the active chunk is the one holding the spoken word, its keyword is highlighted. */
export function captionChunk(words: string[], active: number, n = VIRAL_FORMAT.captionWords): { words: string[]; key: number } | null {
  if (!words.length || active < 0) return null;
  const i = Math.min(active, words.length - 1);
  const start = Math.floor(i / n) * n;
  const chunk = words.slice(start, start + n);
  // Keyword: the longest word of the chunk (ties → the last one), never a 1–2 letter word when another exists.
  let key = 0;
  chunk.forEach((w, k) => {
    if (w.replace(/[^\p{L}\p{N}]/gu, '').length >= chunk[key]!.replace(/[^\p{L}\p{N}]/gu, '').length) key = k;
  });
  return { words: chunk, key };
}

/** The same chunk index applied to the other language (proportional position), for the bilingual captions. */
export function parallelChunk(words: string[], progress: number, n = VIRAL_FORMAT.captionWords) {
  if (!words.length) return null;
  return captionChunk(words, Math.min(words.length - 1, Math.floor(Math.max(0, Math.min(0.999, progress)) * words.length)), n);
}

/**
 * Scenes after which the « stupeur » insert plays: after every punchline / twist, and between sketches when the film is
 * a compilation (one sketch per scene) — never after the last scene, never two in a row.
 */
export function shockAfter(scenes: { beat?: string; act?: string }[], compilation: boolean): boolean[] {
  return scenes.map((s, i) => {
    if (i === scenes.length - 1) return false;
    if (compilation) return true;
    const b = `${s.beat ?? ''} ${s.act ?? ''}`.toLowerCase();
    return /chute|twist|punch|révélation|revelation|retournement/.test(b);
  });
}

/**
 * Animation principles (the 12 of the big 3D studios, the ones a deformation rig can play): a gesture starts with an
 * ANTICIPATION (small move the other way), goes past its target (OVERSHOOT) and SETTLES; age = seconds since it began.
 */
export function gestureEnvelope(age: number): number {
  if (age < 0) return 0;
  if (age < 0.12) return -0.25 * Math.sin((Math.PI * age) / 0.12);
  const a = age - 0.12;
  return 1 - Math.exp(-a * 9) * Math.cos(a * 16);
}
