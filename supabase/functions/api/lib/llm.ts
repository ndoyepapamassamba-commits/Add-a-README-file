// Optional LLM polish through OpenRouter. Rewrites only cv.profile, experience bullets and lettre
// paragraphs; any doubt (error, timeout, bad shape, length drift, new digits or new proper nouns)
// returns null so the caller keeps the deterministic draft. Never throws.
import type { Document, OrderInput, Product } from "./types.ts";
import { cleanBullet, tidy } from "./generator/text.ts";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_TIMEOUT_MS = 20_000;
const MIN_RATIO = 0.5;
const MAX_RATIO = 2;

export interface EnhancerOptions {
  apiKey: string;
  model: string;
  fetchFn?: typeof fetch;
  /** Request timeout; 20 s by default. */
  timeoutMs?: number;
}

export type Enhancer = (doc: Document, input: OrderInput, product: Product) => Promise<Document | null>;

/** The parts of a document the model may rewrite. */
interface Draft {
  profile?: string;
  bullets?: string[][];
  paragraphs?: string[];
}

export function makeEnhancer(opts: EnhancerOptions): Enhancer {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return async (doc, input, product) => {
    try {
      const draft = draftOf(doc, product);
      if (!draft) return null;
      const content = await complete(fetchFn, opts, timeoutMs, buildMessages(draft, input));
      if (content === null) return null;
      const rewritten = parseDraft(content, draft);
      if (!rewritten || !isFaithful(draft, rewritten, input)) return null;
      return merge(doc, rewritten);
    } catch {
      return null;
    }
  };
}

function draftOf(doc: Document, product: Product): Draft | null {
  // Pack Stage: the letters quote the student's own reasons per company; keep the deterministic draft.
  if (product === "stage") return null;
  const draft: Draft = {};
  if (doc.cv && product !== "lettre") {
    draft.profile = doc.cv.profile;
    draft.bullets = doc.cv.experiences.map((e) => [...e.bullets]);
  }
  if (doc.lettre && product !== "cv") draft.paragraphs = [...doc.lettre.paragraphs];
  return Object.keys(draft).length > 0 ? draft : null;
}

const SYSTEM_PROMPT = [
  "Tu es un consultant en recrutement sénégalais expérimenté. Tu relis un CV et une lettre de motivation",
  "rédigés en français pour le marché de l'emploi au Sénégal et tu en améliores le style.",
  "Règles absolues :",
  "1. N'ajoute AUCUN fait : aucun employeur, diplôme, école, date, chiffre, pourcentage, certification,",
  "réalisation, lieu ou responsabilité qui ne figure pas dans les données du candidat.",
  "2. N'écris aucun chiffre qui n'apparaît pas déjà dans les données.",
  "3. Respecte le genre du candidat pour tous les accords.",
  "4. Français professionnel, naturel et sobre ; vouvoiement du recruteur dans la lettre ; pas de formule creuse.",
  "5. Garde exactement la même structure : mêmes clés, même nombre d'éléments, longueur comparable",
  "(entre 0,7 et 1,5 fois l'original pour chaque élément).",
  "6. Les puces commencent par une majuscule et ne finissent pas par un point.",
  "7. La lettre garde ses 4 paragraphes : accroche et candidature, parcours, compétences et qualités,",
  "disponibilité pour un entretien. N'y mets ni formule d'appel ni formule de politesse finale.",
  'Réponds UNIQUEMENT avec un objet JSON de la même forme que "brouillon".',
].join(" ");

function buildMessages(draft: Draft, input: OrderInput): Array<{ role: string; content: string }> {
  // Data minimisation: no name, phone, e-mail or address is sent to the model.
  const facts = {
    genre: input.identity.civility === "Mme" ? "femme" : "homme",
    poste: input.target.jobTitle,
    type: input.target.kind,
    secteur: input.target.sector,
    niveau: input.target.level,
    formation: input.education,
    experiences: input.experiences,
    competences: input.skills,
    informatique: input.it,
    entreprise: input.letter?.company,
    qualites: input.letter?.qualities,
    motivation: input.letter?.motivation,
  };
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify({ donnees: facts, brouillon: draft }) },
  ];
}

async function complete(
  fetchFn: typeof fetch,
  opts: EnhancerOptions,
  timeoutMs: number,
  messages: Array<{ role: string; content: string }>,
): Promise<string | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });
  const request = (async () => {
    const res = await fetchFn(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${opts.apiKey}`,
        "content-type": "application/json",
        "x-title": "Teranga CV",
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
      signal: controller.signal,
    });
    const body = await res.text();
    if (!res.ok) return null;
    const content = JSON.parse(body)?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : null;
  })();
  try {
    // The race also covers a fetch implementation that ignores the abort signal.
    return await Promise.race([request, timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    request.catch(() => {});
  }
}

function parseDraft(content: string, draft: Draft): Draft | null {
  const json = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const out: Draft = {};
  if (draft.profile !== undefined) {
    if (typeof obj.profile !== "string") return null;
    out.profile = tidy(obj.profile);
  }
  if (draft.bullets !== undefined) {
    const bullets = obj.bullets;
    if (!Array.isArray(bullets) || bullets.length !== draft.bullets.length) return null;
    const cleaned: string[][] = [];
    for (let i = 0; i < bullets.length; i++) {
      const list = bullets[i];
      if (!Array.isArray(list) || list.length !== draft.bullets[i].length) return null;
      if (!list.every((b) => typeof b === "string")) return null;
      cleaned.push((list as string[]).map(cleanBullet));
    }
    out.bullets = cleaned;
  }
  if (draft.paragraphs !== undefined) {
    const paragraphs = obj.paragraphs;
    if (!Array.isArray(paragraphs) || paragraphs.length !== draft.paragraphs.length) return null;
    if (!paragraphs.every((p) => typeof p === "string")) return null;
    out.paragraphs = (paragraphs as string[]).map(tidy);
  }
  return out;
}

function lengthOk(before: string, after: string): boolean {
  if (after === "") return before === "";
  return after.length >= before.length * MIN_RATIO && after.length <= before.length * MAX_RATIO;
}

/** Proper nouns the model may use although the draft and data do not contain them. */
const ALLOWED_CAPITALISED = new Set(["madame", "monsieur", "sénégal"]);

/** Capitalised words that do not start a sentence: likely names of places, companies or schools. */
function properNouns(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?:;])\s+/)) {
    const words = sentence.match(/\p{L}[\p{L}'’-]*/gu) ?? [];
    for (const w of words.slice(1)) if (/^\p{Lu}/u.test(w)) out.push(w);
  }
  return out;
}

function wordsOf(text: string): Set<string> {
  return new Set((text.match(/\p{L}[\p{L}'’-]*/gu) ?? []).map((w) => w.toLocaleLowerCase("fr")));
}

/** Rejects rewrites that drift in length, add digits, or add proper nouns. */
function isFaithful(draft: Draft, out: Draft, input: OrderInput): boolean {
  const pairs: Array<[string, string]> = [];
  if (draft.profile !== undefined) pairs.push([draft.profile, out.profile!]);
  draft.bullets?.forEach((list, i) => pairs.push([list.join(" "), out.bullets![i].join(" ")]));
  draft.paragraphs?.forEach((p, i) => pairs.push([p, out.paragraphs![i]]));
  if (!pairs.every(([before, after]) => lengthOk(before, after))) return false;

  const inputText = JSON.stringify(input);
  const inputDigits = new Set(inputText.match(/\d+/g) ?? []);
  const known = wordsOf(`${inputText} ${JSON.stringify(draft)}`);
  for (const [, after] of pairs) {
    if (/\b(undefined|null|NaN)\b|█/.test(after)) return false;
    if ((after.match(/\d+/g) ?? []).some((d) => !inputDigits.has(d))) return false;
    for (const noun of properNouns(after)) {
      const key = noun.toLocaleLowerCase("fr");
      if (!known.has(key) && !ALLOWED_CAPITALISED.has(key)) return false;
    }
  }
  return true;
}

function merge(doc: Document, out: Draft): Document {
  const next: Document = structuredClone(doc);
  if (next.cv) {
    if (out.profile !== undefined) next.cv.profile = out.profile;
    if (out.bullets) next.cv.experiences.forEach((e, i) => (e.bullets = out.bullets![i]));
  }
  if (next.lettre && out.paragraphs) next.lettre.paragraphs = out.paragraphs;
  return next;
}
