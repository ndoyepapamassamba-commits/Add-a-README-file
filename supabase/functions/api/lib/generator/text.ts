// French text helpers for the document generator: elision, contractions, gender agreement,
// capitalisation, dates, bullets and sentence assembly. Pure functions, no I/O.
import type { Civility } from "../types.ts";

/** Gender-agreement picker: g("motivé", "motivée"). */
export type Gender = (m: string, f: string) => string;

export function genderOf(civility: Civility): Gender {
  return civility === "Mme" ? (_m, f) => f : (m, _f) => m;
}

// ---------------------------------------------------------------------------
// Elision and contractions
// ---------------------------------------------------------------------------

const VOWEL_RE = /^[aeiouàâäéèêëîïôöùûüæœ]/;

/**
 * Words starting with an aspirated "h" (no elision: "de haut niveau", "le héros").
 * Matched as prefixes, so "hiérarch" covers "hiérarchie" and "hiérarchique".
 */
const ASPIRATED_H_PREFIXES = [
  "hach", "hagard", "haie", "haill", "hain", "haïr", "hâl", "halet", "halte", "hamac", "hameau",
  "hamburg", "hampe", "hanche", "hand", "hangar", "hant", "happ", "haran", "haras", "harcel",
  "harcèl", "hard", "hareng", "hargn", "haricot", "harnais", "harpe", "harpon", "hasard", "hât",
  "hauss", "haut", "havre", "hennir", "hennis", "hernie", "hérisson", "hiérarch", "hiss", "hocher",
  "hockey", "hollandais", "homard", "hongr", "honte", "honteu", "hoquet", "horde", "hors", "hotte",
  "houblon", "houl", "houpp", "hourra", "housse", "hublot", "hue", "huée", "huer", "huit", "hurl",
  "hutte",
];
/** Aspirated-h words that must match exactly (their longer relatives have a mute h: "l'héroïne"). */
const ASPIRATED_H_EXACT = new Set(["hall", "halls", "halle", "halles", "héros", "héron", "hérons", "hêtre", "hêtres"]);

function firstWordLower(phrase: string): string {
  const m = /[\p{L}\p{N}]+/u.exec(phrase.trimStart());
  return m && m.index === 0 ? m[0].toLocaleLowerCase("fr") : "";
}

/** True when the phrase starts with a vowel sound: vowel, mute h, or "y" before a consonant ("Yves"). */
export function startsWithVowelSound(phrase: string): boolean {
  const w = firstWordLower(phrase);
  if (!w) return false;
  if (VOWEL_RE.test(w)) return true;
  if (w[0] === "y") return w.length > 1 && !VOWEL_RE.test(w.slice(1));
  if (w[0] === "h") {
    if (ASPIRATED_H_EXACT.has(w)) return false;
    return !ASPIRATED_H_PREFIXES.some((p) => w.startsWith(p));
  }
  return false;
}

/** Elidable particle + next words: elide("de", "assistant") → "d'assistant"; elide("que", "il") → "qu'il". */
export function elide(particle: "de" | "le" | "la" | "que" | "je" | "me" | "se" | "ne" | "te", next: string): string {
  const rest = next.trim();
  if (!rest) return particle;
  if (!startsWithVowelSound(rest)) return `${particle} ${rest}`;
  const head = particle === "que" ? "qu" : particle.slice(0, -1);
  return `${head}'${rest}`;
}

const ARTICLE_LE = /^le\s+/i;
const ARTICLE_LES = /^les\s+/i;
const ARTICLE_L = /^l['’]/i;

/** "de" + phrase with contractions and elision: "du commerce", "des Ciments du Sahel", "d'Orange", "de la Sonatel". */
export function de(phrase: string): string {
  const p = phrase.trim();
  if (ARTICLE_LES.test(p)) return `des ${p.replace(ARTICLE_LES, "")}`;
  if (ARTICLE_LE.test(p)) return `du ${p.replace(ARTICLE_LE, "")}`;
  if (ARTICLE_L.test(p)) return `de l'${p.replace(ARTICLE_L, "")}`;
  return elide("de", p);
}

/** "à" + phrase with contractions: "au commerce", "aux ventes", "à la Sonatel", "à l'ISM". */
export function a(phrase: string): string {
  const p = phrase.trim();
  if (ARTICLE_LES.test(p)) return `aux ${p.replace(ARTICLE_LES, "")}`;
  if (ARTICLE_LE.test(p)) return `au ${p.replace(ARTICLE_LE, "")}`;
  if (ARTICLE_L.test(p)) return `à l'${p.replace(ARTICLE_L, "")}`;
  return `à ${p}`;
}

/** "au sein de/d'/du/des" + company. */
export function auSeinDe(company: string): string {
  return `au sein ${de(company)}`;
}

/** "chez" + company (never elided). */
export function chez(company: string): string {
  return `chez ${company.trim()}`;
}

// ---------------------------------------------------------------------------
// Capitalisation
// ---------------------------------------------------------------------------

/** Words whose capitalisation is kept inside a sentence (brands, software, proper nouns). */
const KEEP_CASE = new Set([
  "access", "android", "archicad", "autocad", "canva", "ciel", "django", "dreamweaver", "excel", "facebook",
  "figma", "flutter", "free", "gmail", "google", "illustrator", "instagram", "internet explorer", "java",
  "laravel", "linux", "mac", "microsoft", "money", "odoo", "office", "orange", "outlook", "photoshop",
  "premiere", "python", "react", "revit", "saari", "sage", "sénégal", "senegal", "dakar", "tiktok",
  "twitter", "ubuntu", "wave", "windows", "word", "wordpress", "youtube", "état", "etat", "afrique",
  "expresso", "yas", "zoom", "teams", "kotlin", "swift", "angular", "vue", "node", "symfony",
]);

/** First letter uppercase, rest untouched. */
export function capitalize(s: string): string {
  const t = s.trimStart();
  if (!t) return "";
  const ch = t[0];
  return ch.toLocaleUpperCase("fr") + t.slice(1);
}

function isKeptWord(word: string): boolean {
  const letters = word.replace(/[^\p{L}]/gu, "");
  if (!letters) return true;
  if (KEEP_CASE.has(letters.toLocaleLowerCase("fr"))) return true;
  // Acronyms ("BTS", "RH", "G") and CamelCase ("PowerPoint", "LinkedIn") keep their case.
  if (letters === letters.toLocaleUpperCase("fr")) return true;
  return /\p{Ll}\p{Lu}/u.test(letters);
}

const FUNCTION_WORDS = new Set([
  "à", "a", "au", "aux", "d", "de", "des", "du", "en", "et", "l", "la", "le", "les", "ou", "par", "pour",
  "sur", "un", "une", "avec", "dans", "chez",
]);

/**
 * Text typed in a form, rewritten for use inside a sentence. Acronyms, CamelCase and known brands
 * keep their case. Title-Cased input ("Assistante De Direction") is lower-cased word by word;
 * ordinary input ("Livraison des clients à Thiès") only loses the capital of its first word, so
 * place and company names survive. Text typed entirely in capitals keeps only its short words.
 */
export function inSentence(s: string): string {
  const t = s.trim();
  const letters = t.replace(/[^\p{L}]/gu, "");
  const shouting = letters.length > 0 && letters === letters.toLocaleUpperCase("fr") && /\s/.test(t) &&
    /\p{L}{5,}/u.test(t);
  const contentWords = (t.match(/\p{L}{2,}/gu) ?? []).filter((w) => !FUNCTION_WORDS.has(w.toLocaleLowerCase("fr")));
  const titleCased = contentWords.length >= 2 && contentWords.every((w) => /^\p{Lu}/u.test(w));
  let first = true;
  return t.replace(/[\p{L}][\p{L}\p{N}'’-]*/gu, (word) => {
    const isFirst = first;
    first = false;
    return word.split(/(['’-])/).map((part) => {
      if (!part || /['’-]/.test(part)) return part;
      const lower = part.toLocaleLowerCase("fr");
      if (shouting) return part.length >= 5 && !KEEP_CASE.has(lower) ? lower : part;
      if (!isFirst && !titleCased && !FUNCTION_WORDS.has(lower)) return part;
      return isKeptWord(part) ? part : lower;
    }).join("");
  });
}

/** "mame diarra" → "Mame Diarra", "ABDOU-KARIM" → "Abdou-Karim", "n'deye" → "N'Deye". */
export function titleCaseName(s: string): string {
  const word = (w: string) => {
    const lower = w.toLocaleLowerCase("fr");
    const m = /^(\p{L})(['’])(\p{L})(.*)$/u.exec(lower);
    if (m) return m[1].toLocaleUpperCase("fr") + m[2] + m[3].toLocaleUpperCase("fr") + m[4];
    return capitalize(lower);
  };
  return collapse(s).split(" ").map((w) => w.split("-").map(word).join("-")).join(" ");
}

/** "Ndiaye" → "NDIAYE", "Sène" → "SÈNE". */
export function upperName(s: string): string {
  return collapse(s).toLocaleUpperCase("fr");
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export const FRENCH_MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

/** "1er octobre 2026", "18 octobre 2026" — UTC calendar day (Dakar is UTC+0). */
export function frenchDate(d: Date): string {
  const day = d.getUTCDate();
  return `${day === 1 ? "1er" : String(day)} ${FRENCH_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const MONTH_WORD_RE = new RegExp(`\\b(${FRENCH_MONTHS.join("|")}|fevrier|aout|decembre)\\b`, "giu");

/** Lower-cases French month names: "Janvier 2022" → "janvier 2022". */
export function lowerMonths(s: string): string {
  return s.replace(MONTH_WORD_RE, (m) => m.toLocaleLowerCase("fr"));
}

// ---------------------------------------------------------------------------
// Cleaning and assembly
// ---------------------------------------------------------------------------

/** Collapse whitespace runs (including newlines) to one space and trim. */
export function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Drop quote characters that are not balanced, so the output never shows a dangling quote. */
function balanceQuotes(s: string): string {
  let out = s;
  if ((out.match(/"/g) ?? []).length % 2 !== 0) out = out.replace(/"/g, "");
  if ((out.match(/«/g) ?? []).length !== (out.match(/»/g) ?? []).length) out = out.replace(/[«»]/g, "");
  if ((out.match(/“/g) ?? []).length !== (out.match(/”/g) ?? []).length) out = out.replace(/[“”]/g, "");
  return out;
}

/**
 * Typographic clean-up applied to every generated string: single spaces, no space before "," or ".",
 * no space inside parentheses, no empty "()", no doubled full stops.
 */
export function tidy(s: string): string {
  const t = balanceQuotes(s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ""))
    .replace(/,(?=[^\s\d])/g, ", ")
    .replace(/\(\s*\)/g, "")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+([,.])/g, "$1")
    .replace(/([!?…])\.+/g, "$1")
    .replace(/(^|[^.])\.\.(?!\.)/g, "$1.")
    .replace(/,+\s*\./g, ".")
    .replace(/,(\s*,)+/g, ",");
  return collapse(t);
}

const BULLET_MARKER_RE = /^(?:[-*•·▪◦●–—+>]+|\d{1,2}[.)]\s)\s*/;

/** "- saisie des factures." → "Saisie des factures". */
export function cleanBullet(s: string): string {
  let t = collapse(s);
  while (BULLET_MARKER_RE.test(t)) t = t.replace(BULLET_MARKER_RE, "").trim();
  t = tidy(t).replace(/[\s.;,:]+$/u, "").replace(/\.{3}$|…$/u, "").trim();
  return capitalize(t);
}

/** Split free-text missions on newlines, ";" and "•", then clean each line. */
export function splitMissions(text: string | undefined, max = 6): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n|;|•|·|▪|●/)
    .map(cleanBullet)
    .filter((b) => /[\p{L}\p{N}]/u.test(b))
    .slice(0, max);
}

/** Customer free text (motivation) turned into clean sentences ending with punctuation. */
export function cleanFreeText(s: string | undefined): string {
  if (!s) return "";
  const t = tidy(s.replace(/[\r\n]+/g, " "));
  if (!/[\p{L}\p{N}]/u.test(t)) return "";
  return ensureFinalStop(capitalize(t));
}

function ensureFinalStop(s: string): string {
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}

/** Join sentence fragments: drops empty parts, capitalises each sentence and ends it with a full stop. */
export function joinSentences(parts: Array<string | null | undefined | false>): string {
  return parts
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .map((p) => ensureFinalStop(capitalize(tidy(p))))
    .join(" ");
}

/** ["A"] → "A"; ["A", "B"] → "A et B"; ["A", "B", "C"] → "A, B et C". */
export function joinList(items: string[], conj = "et"): string {
  const xs = items.map((x) => x.trim()).filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} ${conj} ${xs[xs.length - 1]}`;
}

/** Case- and accent-insensitive key, used for de-duplication and label matching. */
export function foldKey(s: string): string {
  return collapse(s).normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
}
