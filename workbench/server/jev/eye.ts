// L'ŒIL DE JEV (v64, 15/10/2026) — Jev 1.14 (TypeSafe, « Dreamer-ready ») lit les images : il ne les GÉNÈRE pas, il
// les JUGE. Questions typées sur une image : Noul (probabilité qu'un élément demandé soit visible — le principe de
// VQAScore, mais calibré et à 0,042 $ par million de jetons), Score (finition), Box (où est l'élément).
// Usages : (1) contrôle de fidélité du bac à sable (ce que la demande nomme est-il VU ?), (2) meilleure image parmi N
// variantes générées, (3) contrôle visuel d'un rendu d'export (logo, texte coupé). Mesuré le 15/10/2026 sur une scène
// synthétique : 6 questions, 1 487 jetons (≈ 0,00006 $), 439 ms ; maison 0,96 · église absente 0,02 · soleil bas 0,87.
import type { JevApiConfig } from './provider';

/** Jev 1.14 is the version that reads images and answers Box questions (docs.typesafe.ai/images, 15/10/2026). */
export const EYE_MODEL = 'jev-1.14.0';
export const EYE_HEADER = { 'TypeSafe-Danger-Zone-Images': 'true' } as const;
/** Size limits of an image (docs): 256–1568 px per side, 78 400–2 458 624 pixels. */
export const EYE_MIN_SIDE = 280;
export const EYE_MAX_SIDE = 1568;
/** Below this probability an element the request names is « not seen ». */
export const EYE_SEEN = 0.5;
const PRICE_PER_MTOK = 0.042;

export interface EyeElement {
  name: string;
  /** Where the request puts it (« à gauche », « au premier plan »), if it says so. */
  where?: string;
}
type Q =
  | { type: 'noul'; instructions: string }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'box'; instructions: string };

/** Fits an image into the API's limits (scale factor and target size). Never upscales a big image, upscales a tiny one. */
export function eyeSize(w: number, h: number): { w: number; h: number; scale: number } {
  const big = Math.max(w, h);
  let s = big > EYE_MAX_SIDE ? EYE_MAX_SIDE / big : 1;
  if (Math.min(w, h) * s < EYE_MIN_SIDE) s = EYE_MIN_SIDE / Math.min(w, h);
  return { w: Math.round(w * s), h: Math.round(h * s), scale: s };
}

/**
 * The questions on ONE image: one Noul per element the request names (with its place), one per circumstance (light,
 * moment, mood), the finish as a Score. Keys are short ids (`e0`, `c0`…): the model never sees them (docs).
 */
export function fidelityQuestions(
  elements: EyeElement[],
  circumstances: string[] = [],
  o: { boxes?: boolean } = {},
): Record<string, Q> {
  const q: Record<string, Q> = {};
  elements.slice(0, 16).forEach((e, i) => {
    q[`e${i}`] = {
      type: 'noul',
      instructions: `Does \`render\` clearly show ${e.name}${e.where ? ` (${e.where})` : ''}, recognisable at a glance?`,
    };
    if (o.boxes) q[`b${i}`] = { type: 'box', instructions: `${e.name} in \`render\`` };
  });
  circumstances
    .slice(0, 6)
    .forEach((c, i) => (q[`c${i}`] = { type: 'noul', instructions: `Does \`render\` convey this: ${c}?` }));
  q.finish = {
    type: 'score',
    instructions: 'How finished and visually polished does `render` look?',
    criteria: [
      'rough placeholder shapes',
      'simple flat drawing',
      'clean illustration',
      'polished, detailed, impressive artwork',
    ],
  };
  return q;
}

/** Request body: the image once, in the state, under a reference that cannot occur in the text. */
export function eyeBody(
  imageB64: string,
  format: 'png' | 'jpg',
  questions: Record<string, Q>,
  ref = `img-${Math.random().toString(36).slice(2, 12)}`,
): Record<string, unknown> {
  return {
    model: EYE_MODEL,
    state: { render: ref },
    assets: { [ref]: { type: 'image', format, data_base64: imageB64 } },
    questions,
  };
}

export interface EyeVerdict {
  /** Elements seen (p ≥ 0.5) and not seen, with their probability. */
  seen: { name: string; p: number }[];
  missing: { name: string; p: number }[];
  /** Circumstances not conveyed. */
  unmet: { text: string; p: number }[];
  /** Finish on 0–3 (Score), null if absent. */
  finish: number | null;
  /** Mean probability of the requested elements (the image's fidelity, VQAScore-like). */
  fidelity: number;
  boxes: Record<string, { top: number; bottom: number; left: number; right: number }>;
  tokens: number;
  costUsd: number;
}
type Ans = {
  noul?: number;
  score?: number;
  box?: { top: number; bottom: number; left: number; right: number };
};
/** Reads the answers against the questions asked. */
export function readEye(
  r: { answers?: Record<string, Ans>; usage?: { input_tokens?: number } },
  elements: EyeElement[],
  circumstances: string[] = [],
): EyeVerdict {
  const a = r.answers ?? {};
  const seen: EyeVerdict['seen'] = [];
  const missing: EyeVerdict['missing'] = [];
  const boxes: EyeVerdict['boxes'] = {};
  elements.slice(0, 16).forEach((e, i) => {
    const p = a[`e${i}`]?.noul;
    if (typeof p !== 'number') return;
    (p >= EYE_SEEN ? seen : missing).push({ name: e.name, p });
    const b = a[`b${i}`]?.box;
    if (b && p >= EYE_SEEN) boxes[e.name] = b;
  });
  const unmet = circumstances
    .slice(0, 6)
    .map((text, i) => ({ text, p: a[`c${i}`]?.noul ?? 1 }))
    .filter((x) => x.p < EYE_SEEN);
  const all = [...seen, ...missing];
  const tokens = r.usage?.input_tokens ?? 0;
  return {
    seen,
    missing,
    unmet,
    finish: typeof a.finish?.score === 'number' ? a.finish.score : null,
    fidelity: all.length ? all.reduce((s, x) => s + x.p, 0) / all.length : 1,
    boxes,
    tokens,
    costUsd: (tokens * PRICE_PER_MTOK) / 1e6,
  };
}

/** What the generator must fix, in French, for the sandbox's correction loop (only what Jev really did not see). */
export function eyeProblems(v: EyeVerdict): string[] {
  return [
    ...v.missing.map(
      (m) =>
        `l’œil de JEV ne voit pas « ${m.name} » (probabilité ${m.p.toFixed(2).replace('.', ',')}) : dessine-le plus grand, plus contrasté, reconnaissable au premier regard.`,
    ),
    ...v.unmet.map(
      (u) =>
        `l’œil de JEV ne retrouve pas « ${u.text} » (probabilité ${u.p.toFixed(2).replace('.', ',')}) : la lumière, l’heure ou l’ambiance doivent le montrer.`,
    ),
  ];
}

/**
 * BEST OF N: the variant whose requested elements are the most surely seen wins; the finish breaks near-ties
 * (0.05 per Score level). Returns the ranking (best first).
 */
export function rankVariants<T extends { id: string; verdict: EyeVerdict }>(variants: T[]): T[] {
  const val = (v: EyeVerdict) => v.fidelity - (0.25 * v.unmet.length) / 6 + 0.05 * (v.finish ?? 0);
  return [...variants].sort((x, y) => val(y.verdict) - val(x.verdict));
}

/** One call (direct endpoint or relay) with the images header; throws on HTTP error or timeout. */
export async function callEye(
  cfg: Pick<JevApiConfig, 'endpoint' | 'timeoutMs'>,
  key: string | null,
  body: Record<string, unknown>,
  fetchFn: (
    url: string,
    init: RequestInit,
  ) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>,
): Promise<{ raw: unknown; ms: number }> {
  const ac = new AbortController();
  const t0 = Date.now();
  // An image takes longer than text: at least 8 s.
  const timer = setTimeout(() => ac.abort(), Math.max(8000, cfg.timeoutMs));
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...EYE_HEADER };
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetchFn(cfg.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`JEV (images) ${res.status}`);
    return { raw: await res.json(), ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What the eye must see in a STUDIO scene image: each character by its look (the model does not know the troupe's
 * names), the setting; the moment and the light as circumstances.
 */
export function sceneEyeTargets(
  scene: { location?: string; time?: string; lighting?: string; characters?: string[] },
  sheets: { name: string; gender?: string; age?: string; clothing?: string }[],
): { elements: EyeElement[]; circumstances: string[] } {
  const short = (t = '', n = 70) => (t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t).trim();
  const elements: EyeElement[] = (scene.characters ?? []).slice(0, 5).map((n) => {
    const c = sheets.find((x) => x.name.toUpperCase() === n.toUpperCase());
    const who = [c?.gender, c?.age && `(${short(c.age, 20)})`].filter(Boolean).join(' ') || 'a person';
    return { name: c?.clothing ? `${who} wearing ${short(c.clothing)}` : who };
  });
  if (scene.location) elements.push({ name: `the setting: ${short(scene.location, 90)}` });
  const circumstances = [scene.time, scene.lighting].map((x) => short(x ?? '', 80)).filter(Boolean);
  return { elements, circumstances };
}
