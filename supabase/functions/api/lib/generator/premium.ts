// CV Premium ("Prestige" two-page CV): the regular CV plus the `premium` block. Everything in the block
// is the customer's own text, copy-edited only (casing, accents, punctuation). The generator adds two
// things at most: one "aim" sentence from the banks after a one-sentence pitch, and a generic
// first-person approach sentence when the customer typed no quote. It never adds a figure, a name,
// an achievement or a tag, and it never reorders or drops a key figure or an achievement.
import type { CvDoc, Document, OrderInput } from "../types.ts";
import { type Ctx, PROFILE_AIM, type Variant } from "./banks.ts";
import { PERSONAL_LABELS, PREMIUM_AIM, PREMIUM_QUOTES } from "./banks_premium.ts";
import { polishPhrase } from "./polish.ts";
import { capitalize, cleanFreeText, collapse, foldKey, joinSentences, tidy } from "./text.ts";

type PremiumInput = NonNullable<OrderInput["premium"]>;
export type PremiumBlock = NonNullable<CvDoc["premium"]>;

/** The part of the generator's seeded picker this module needs (index.ts passes its Picker). */
export interface SlotPicker {
  index(slot: string, n: number): number;
}

/** A pitch of two sentences or more, or a profile that would exceed this length, stays alone. */
const MAX_PROFILE_CHARS = 650;
const MAX_PITCH_SENTENCES_FOR_AIM = 1;

// ---------------------------------------------------------------------------
// Copy-editing helpers (spelling and punctuation only)
// ---------------------------------------------------------------------------

/**
 * Text in capitals made only of short words or codes ("IFRS 9", "BCEAO", "KYC / AML", "SAP FI") is a list of
 * acronyms, not text typed with caps lock: senior profiles type many of them, and they keep their case.
 */
function isAcronymText(s: string): boolean {
  const words = s.match(/\p{L}+/gu) ?? [];
  return words.length > 0 && !/\p{Ll}/u.test(s) && words.every((w) => w.length <= 5);
}

/**
 * Short French words that polishPhrase keeps in capitals inside text typed with caps lock, because they
 * could be acronyms ("J'AI 12 ANS D'EXPÉRIENCE" → "J'AI 12 ANS d'expérience"). None of them is an acronym.
 */
// deno-fmt-ignore
const SHORT_WORDS = new Set([
  "a", "à", "ai", "an", "ans", "as", "au", "aux", "c", "ce", "ces", "cet", "d", "de", "des", "du", "en", "est", "et",
  "eu", "il", "ils", "j", "je", "l", "la", "le", "les", "lui", "m", "ma", "me", "mes", "moi", "mon", "n", "ne", "ni",
  "nos", "on", "ou", "où", "par", "peu", "qu", "que", "qui", "s", "sa", "se", "ses", "si", "son", "sur", "t", "ta",
  "te", "tes", "ton", "tu", "un", "une", "vos", "y",
]);

/** Text typed with caps lock: no lower-case letter and at least one run of four capitals. */
function isShouted(s: string): boolean {
  return !/\p{Ll}/u.test(s) && /\p{Lu}{4}/u.test(s);
}

const hasAccent = (w: string) => /\p{M}/u.test(w.normalize("NFD"));

/**
 * A word the customer typed with its accents keeps them (polish.ts now never touches such a word; this guard
 * stays so the premium block cannot regress if the shared corrector changes). Casing comes from `polished`.
 */
function keepTypedAccents(typed: string, polished: string): string {
  const typedWords = typed.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (typedWords.length !== (polished.match(/[\p{L}\p{N}]+/gu) ?? []).length) return polished;
  let i = 0;
  return polished.replace(/[\p{L}\p{N}]+/gu, (w) => {
    const t = typedWords[i++];
    if (t === w || !hasAccent(t) || foldKey(t) !== foldKey(w)) return w;
    const lower = t.toLocaleLowerCase("fr");
    if (w === w.toLocaleLowerCase("fr")) return lower;
    if (w.length > 1 && w === w.toLocaleUpperCase("fr")) return t.toLocaleUpperCase("fr");
    return capitalize(lower);
  });
}

/**
 * One line of customer text: casing typed by accident, missing accents, spaces and punctuation fixed.
 * `codes` = false for fields that never hold acronyms (personal lines): capitals are then always undone.
 */
function line(s: string | undefined, codes = true): string {
  const t = collapse(s ?? "");
  if (codes && isAcronymText(t)) return tidy(t);
  const polished = keepTypedAccents(t, polishPhrase(t));
  if (!isShouted(t)) return tidy(polished);
  return tidy(polished.replace(/\p{L}+/gu, (w) => {
    const lower = w.toLocaleLowerCase("fr");
    return SHORT_WORDS.has(lower) && w === w.toLocaleUpperCase("fr") ? lower : w;
  }));
}

/** Upper-cases the first letter only when the first word has no capital ("iOS", "eCommerce" stay). */
function capFirst(s: string): string {
  const first = s.split(/\s/)[0] ?? "";
  return /^\p{Ll}/u.test(first) && !/\p{Lu}/u.test(first) ? capitalize(s) : s;
}

/** A heading-like field (title, tag, skill, quality): no trailing punctuation. */
function label(s: string | undefined): string {
  return capFirst(line(s).replace(/[\s.;,:]+$/u, ""));
}

/** A key-figure legend reads after the number ("15+ années en banque"): its case is kept. */
function legend(s: string | undefined): string {
  return line(s).replace(/[\s.;,:]+$/u, "");
}

/** A sentence of customer text: capitalised, ending with punctuation; "" when nothing is left. */
function sentence(s: string | undefined): string {
  const t = line(s);
  return /[\p{L}\p{N}]/u.test(t) ? cleanFreeText(t) : "";
}

/** The customer's quote without the quotation marks the renderer adds itself. */
function quoteText(s: string | undefined): string {
  const bare = collapse(s ?? "").replace(/^[«"“„\s]+/u, "").replace(/[»"”\s]+$/u, "");
  return sentence(bare);
}

/** Case- and accent-insensitive de-duplication, keeping the first spelling. */
function unique(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = foldKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, max);
}

const sentenceCount = (s: string) => (s.match(/[.!?…](?=\s|$)/g) ?? []).length;

// ---------------------------------------------------------------------------
// Block
// ---------------------------------------------------------------------------

/** "Âge : 41 ans" ("41", "41 ANS" and "41 ans." alike), "Situation : Marié, deux enfants". */
function personalLines(p: PremiumInput["personal"]): string[] {
  const out: string[] = [];
  const age = collapse(p?.age ?? "");
  const years = /^(\d{1,3})\s*(?:ans?)?\.?$/iu.exec(age);
  if (/[\p{L}\p{N}]/u.test(age)) {
    out.push(`${PERSONAL_LABELS.age} : ${years ? `${years[1]} ans` : line(age, false).replace(/[\s.;,:]+$/u, "")}`);
  }
  const situation = capFirst(line(p?.situation, false).replace(/[\s.;,:]+$/u, ""));
  if (situation) out.push(`${PERSONAL_LABELS.situation} : ${situation}`);
  return out;
}

/** The customer's quote, or a generic approach sentence for their level (no fact in it). */
function premiumQuote(p: PremiumInput | undefined, c: Ctx, picker: SlotPicker): string {
  const typed = quoteText(p?.quote);
  if (typed) return typed;
  const bank = PREMIUM_QUOTES[c.level];
  return bank[picker.index("premium.quote", bank.length)];
}

/** Skill bars, de-duplicated by name (the first level typed wins), at most 8. */
function uniqueSkills(list: PremiumInput["skillLevels"]): PremiumBlock["skillLevels"] {
  const seen = new Set<string>();
  const out: PremiumBlock["skillLevels"] = [];
  for (const s of list) {
    const name = label(s.name);
    const key = foldKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, level: s.level });
  }
  return out.slice(0, 8);
}

export function buildPremiumBlock(p: PremiumInput | undefined, cv: CvDoc, c: Ctx, picker: SlotPicker): PremiumBlock {
  return {
    headline: label(p?.headline) || cv.title,
    quote: premiumQuote(p, c, picker),
    keyFigures: (p?.keyFigures ?? []).slice(0, 4).map((f) => ({ value: collapse(f.value), label: legend(f.label) })),
    domains: (p?.domains ?? []).slice(0, 3).map((d) => ({ title: label(d.title), detail: label(d.detail) })),
    achievements: (p?.achievements ?? []).slice(0, 6).map((a) => ({
      title: label(a.title),
      detail: sentence(a.detail),
      tags: unique((a.tags ?? []).map(label), 4),
    })),
    skillLevels: uniqueSkills(p?.skillLevels ?? []),
    qualities: unique((p?.qualities ?? []).map(label), 6),
    personal: personalLines(p?.personal),
    accent: p?.accent ?? "marine",
  };
}

/**
 * Profile paragraph: the customer's pitch, completed by one "aim" sentence (the job sought) when the pitch is
 * a single sentence; without a pitch, the regular CV profile (level × kind × sector banks + real data).
 * Experienced candidates looking for a job get the premium aim bank, everyone else the regular one.
 */
export function premiumProfile(cv: CvDoc, p: PremiumInput | undefined, c: Ctx, picker: SlotPicker): string {
  const pitch = sentence(p?.pitch);
  if (!pitch) return cv.profile;
  if (sentenceCount(pitch) > MAX_PITCH_SENTENCES_FOR_AIM) return pitch;
  const experienced = c.kind === "emploi" && (c.level === "confirme" || c.level === "senior");
  const bank: Variant[] = experienced ? PREMIUM_AIM : PROFILE_AIM[c.kind];
  const aims = bank.map((v) => v(c)).filter((t): t is string => typeof t === "string" && t !== "");
  if (aims.length === 0) return pitch;
  const withAim = joinSentences([pitch, aims[picker.index("premium.aim", aims.length)]]);
  return withAim.length <= MAX_PROFILE_CHARS ? withAim : pitch;
}

/** Product "premium": the regular CV (built by index.ts) with the premium profile and block; no letter. */
export function premiumDocument(cv: CvDoc, raw: OrderInput, c: Ctx, picker: SlotPicker): Document {
  const p = raw.premium;
  return {
    cv: { ...cv, profile: premiumProfile(cv, p, c, picker), premium: buildPremiumBlock(p, cv, c, picker) },
    lettre: null,
  };
}
