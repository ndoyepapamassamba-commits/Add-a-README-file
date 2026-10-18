// Validation and normalisation of the order form (POST /orders). Field errors use dotted paths.
import type { Civility, JobKind, LanguageLevel, Level, OrderInput, Product, Sector, Template } from "./types.ts";
import { DEFAULT_TEMPLATE, isProduct, isTemplate, needsCv, needsLetter } from "./pricing.ts";
import { normalizeSnMobile } from "./phone.ts";

export const CIVILITIES: readonly Civility[] = ["M", "Mme"];
export const JOB_KINDS: readonly JobKind[] = ["emploi", "stage", "alternance"];
export const LEVELS: readonly Level[] = ["debutant", "junior", "confirme", "senior"];
export const SECTORS: readonly Sector[] = [
  "commerce",
  "comptabilite",
  "informatique",
  "sante",
  "enseignement",
  "administration",
  "btp",
  "hotellerie",
  "logistique",
  "communication",
  "agriculture",
  "securite",
  "autre",
];
export const LANGUAGE_LEVELS: readonly LanguageLevel[] = [
  "Langue maternelle",
  "Courant",
  "Bon niveau",
  "Intermédiaire",
  "Notions",
];

export type ValidationResult =
  | { ok: true; product: Product; template: Template; data: OrderInput }
  | { ok: false; fields: Record<string, string> };

const MSG = {
  required: "Ce champ est obligatoire.",
  invalid: "Valeur invalide.",
  list: "Liste invalide.",
  email: "Adresse e-mail invalide.",
  phone: "Numéro de téléphone invalide.",
  max: (n: number) => `${n} caractères maximum.`,
  items: (n: number) => `${n} éléments maximum.`,
  oneOf: "Ajoutez au moins une formation ou une expérience.",
  company: "Indiquez l'entreprise à qui vous écrivez.",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FOREIGN_PHONE_RE = /^[+0-9 ]{8,20}$/;
// Control characters except "\n" (tab and CR are folded into spaces / newlines beforehand).
// deno-lint-ignore no-control-regex
const CONTROL_RE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/g;

/** Trim, collapse whitespace runs, strip control chars. Multiline keeps one "\n" between non-empty lines. */
export function cleanText(value: string, multiline = false): string {
  const unified = value.replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(CONTROL_RE, "");
  const collapse = (s: string) => s.replace(/[^\S\n]+/g, " ").trim();
  if (!multiline) return collapse(unified.replace(/\n/g, " "));
  return unified.split("\n").map(collapse).filter(Boolean).join("\n");
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Drops keys whose value is undefined so stored JSON stays tidy. */
function compact<T extends Obj>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

class Collector {
  fields: Record<string, string> = {};

  fail(path: string, message: string): void {
    if (!(path in this.fields)) this.fields[path] = message;
  }

  /** Optional string; returns undefined when absent/blank. Numbers are accepted and stringified. */
  text(src: Obj, key: string, path: string, max: number, multiline = false): string | undefined {
    const raw = src[key];
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw !== "string" && typeof raw !== "number") {
      this.fail(path, MSG.invalid);
      return undefined;
    }
    const s = cleanText(String(raw), multiline);
    if (!s) return undefined;
    if (s.length > max) {
      this.fail(path, MSG.max(max));
      return undefined;
    }
    return s;
  }

  required(src: Obj, key: string, path: string, max: number): string {
    const s = this.text(src, key, path, max);
    if (s === undefined) this.fail(path, MSG.required);
    return s ?? "";
  }

  oneOf<T extends string>(src: Obj, key: string, path: string, allowed: readonly T[]): T {
    const raw = typeof src[key] === "string" ? (src[key] as string).trim() : src[key];
    if (raw === undefined || raw === null || raw === "") {
      this.fail(path, MSG.required);
      return allowed[0];
    }
    if (!(allowed as readonly unknown[]).includes(raw)) {
      this.fail(path, MSG.invalid);
      return allowed[0];
    }
    return raw as T;
  }

  object(src: Obj, key: string): Obj {
    const v = src[key];
    if (v === undefined || v === null) return {};
    if (!isObj(v)) {
      this.fail(key, MSG.invalid);
      return {};
    }
    return v;
  }

  /** Array of raw items (undefined → []). Over-long lists are reported on the list path. */
  list(src: Obj, key: string, path: string, maxItems: number): unknown[] {
    const v = src[key];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) {
      this.fail(path, MSG.list);
      return [];
    }
    if (v.length > maxItems) {
      this.fail(path, MSG.items(maxItems));
      return [];
    }
    return v;
  }

  /** List of short strings; blank entries are dropped. */
  strings(src: Obj, key: string, path: string, maxItems: number, maxLen: number): string[] {
    const out: string[] = [];
    this.list(src, key, path, maxItems).forEach((item, i) => {
      const s = this.text({ v: item }, "v", `${path}.${i}`, maxLen);
      if (s !== undefined) out.push(s);
    });
    return out;
  }
}

function isBlankItem(item: Obj): boolean {
  return Object.values(item).every((v) => v === undefined || v === null || (typeof v === "string" && !cleanText(v)));
}

function validateIdentity(c: Collector, src: Obj): OrderInput["identity"] {
  const phonePath = "identity.phone";
  // Generous raw limit: separators are allowed before normalisation; the formats themselves are checked below.
  let phone = c.required(src, "phone", phonePath, 30);
  if (phone) {
    const sn = normalizeSnMobile(phone);
    if (sn) phone = sn;
    else if (!FOREIGN_PHONE_RE.test(phone)) c.fail(phonePath, MSG.phone);
  }
  const email = c.text(src, "email", "identity.email", 80);
  if (email !== undefined && !EMAIL_RE.test(email)) c.fail("identity.email", MSG.email);
  return compact({
    civility: c.oneOf(src, "civility", "identity.civility", CIVILITIES),
    firstName: c.required(src, "firstName", "identity.firstName", 40),
    lastName: c.required(src, "lastName", "identity.lastName", 40),
    phone,
    email,
    city: c.required(src, "city", "identity.city", 60),
    address: c.text(src, "address", "identity.address", 80),
  });
}

function validateTarget(c: Collector, src: Obj): OrderInput["target"] {
  return {
    jobTitle: c.required(src, "jobTitle", "target.jobTitle", 80),
    kind: c.oneOf(src, "kind", "target.kind", JOB_KINDS),
    sector: c.oneOf(src, "sector", "target.sector", SECTORS),
    level: c.oneOf(src, "level", "target.level", LEVELS),
  };
}

/** Runs `fn` on every non-blank object item of a list, reporting non-objects. */
function eachItem<T>(c: Collector, items: unknown[], path: string, fn: (item: Obj, p: string) => T): T[] {
  const out: T[] = [];
  items.forEach((item, i) => {
    const p = `${path}.${i}`;
    if (!isObj(item)) {
      c.fail(p, MSG.invalid);
      return;
    }
    if (!isBlankItem(item)) out.push(fn(item, p));
  });
  return out;
}

function validateLetter(c: Collector, src: unknown): OrderInput["letter"] {
  if (!isObj(src)) {
    c.fail("letter.company", src === undefined || src === null ? MSG.company : MSG.invalid);
    return undefined;
  }
  const company = c.text(src, "company", "letter.company", 100);
  if (company === undefined) c.fail("letter.company", MSG.company);
  return compact({
    company: company ?? "",
    recipient: c.text(src, "recipient", "letter.recipient", 100),
    companyCity: c.text(src, "companyCity", "letter.companyCity", 60),
    source: c.text(src, "source", "letter.source", 100),
    qualities: c.strings(src, "qualities", "letter.qualities", 4, 40),
    motivation: c.text(src, "motivation", "letter.motivation", 600, true),
  });
}

export function validateOrderRequest(body: unknown): ValidationResult {
  const c = new Collector();
  const root: Obj = isObj(body) ? body : {};

  let product: Product = "cv";
  if (isProduct(root.product)) product = root.product;
  else c.fail("product", root.product === undefined ? MSG.required : MSG.invalid);

  let template: Template = DEFAULT_TEMPLATE;
  if (isTemplate(root.template)) template = root.template;
  else if (root.template !== undefined && root.template !== null && root.template !== "") {
    c.fail("template", MSG.invalid);
  }

  if (!isObj(root.data)) {
    c.fail("data", MSG.required);
    return { ok: false, fields: c.fields };
  }
  const src = root.data;

  const identity = validateIdentity(c, c.object(src, "identity"));
  const target = validateTarget(c, c.object(src, "target"));

  const education = eachItem(c, c.list(src, "education", "education", 6), "education", (e, p) =>
    compact({
      degree: c.required(e, "degree", `${p}.degree`, 100),
      school: c.text(e, "school", `${p}.school`, 100),
      year: c.text(e, "year", `${p}.year`, 20),
      detail: c.text(e, "detail", `${p}.detail`, 100),
    }));

  const experiences = eachItem(c, c.list(src, "experiences", "experiences", 6), "experiences", (e, p) =>
    compact({
      title: c.required(e, "title", `${p}.title`, 80),
      company: c.text(e, "company", `${p}.company`, 80),
      place: c.text(e, "place", `${p}.place`, 60),
      start: c.text(e, "start", `${p}.start`, 20),
      end: c.text(e, "end", `${p}.end`, 20),
      missions: c.text(e, "missions", `${p}.missions`, 800, true),
    }));

  const languages = eachItem(c, c.list(src, "languages", "languages", 6), "languages", (l, p) => ({
    name: c.required(l, "name", `${p}.name`, 30),
    level: c.oneOf(l, "level", `${p}.level`, LANGUAGE_LEVELS),
  }));

  const data: OrderInput = {
    identity,
    target,
    education,
    experiences,
    skills: c.strings(src, "skills", "skills", 20, 60),
    it: c.strings(src, "it", "it", 15, 40),
    languages,
    interests: c.strings(src, "interests", "interests", 8, 40),
  };

  if (needsLetter(product)) data.letter = validateLetter(c, src.letter);
  // Reported on "experiences": the wizard checks it when leaving the experiences step, after both lists.
  if (needsCv(product) && education.length === 0 && experiences.length === 0) c.fail("experiences", MSG.oneOf);

  if (Object.keys(c.fields).length) return { ok: false, fields: c.fields };
  return { ok: true, product, template, data };
}

const RETURN_BASE_CHARS = /^[A-Za-z0-9._~\-\/:%]+$/;

/**
 * Checkout return base: absolute URL in canonical form (no query, fragment, credentials or dot segments),
 * https except http://localhost when a dev prefix allows it, starting with one of `prefixes`.
 * Returns it without trailing "/", or null when refused.
 */
export function normalizeReturnBase(value: unknown, prefixes: readonly string[]): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 300 || !RETURN_BASE_CHARS.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const localDev = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localDev) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  const base = raw.replace(/\/+$/, "");
  if ((url.origin + url.pathname).replace(/\/+$/, "") !== base) return null;
  const withSlash = base + "/";
  return prefixes.some((p) => withSlash.startsWith(p)) ? base : null;
}
