// Validation of the course order form (POST /orders, product pq_essentiel) and of the lead form (POST /leads).
// Field errors use dotted paths, like validate.ts. Customer-facing strings use French typography (NBSP U+00A0).
import type { CourseBuyer, CourseProduct } from "./types.ts";
import { isCourseProduct } from "./pricing.ts";
import { cleanText, Collector, isObj } from "./validate.ts";
import type { Obj } from "./validate.ts";

const NBSP = "\u00a0";

export const COURSE_MSG = {
  invalid: "Valeur invalide.",
  nameMissing: `Indiquez votre prénom et votre nom${NBSP}: ils figurent sur vos fichiers et votre attestation.`,
  nameInvalid: "Lettres, espaces, apostrophes et tirets uniquement (80 caractères au plus).",
  email: "Adresse e-mail invalide.",
  phone: "Numéro invalide (8 à 15 chiffres, indicatif du pays accepté).",
  cgv: "Cochez la case pour accepter les conditions générales de vente.",
  whatsapp: "Numéro WhatsApp invalide (8 à 15 chiffres, indicatif du pays accepté).",
  contact: "Indiquez un e-mail ou un numéro WhatsApp.",
  consent: "Cochez la case pour accepter d'être prévenu(e).",
} as const;

export const FULL_NAME_MIN = 2;
export const FULL_NAME_MAX = 80;
export const COURSE_EMAIL_MAX = 80;
const FULL_NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}'’ .-]*$/u;
const LETTER_RE = /\p{L}/gu;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INTL_PHONE_RE = /^\+?\d{8,15}$/;
const SOURCE_RE = /^[a-z0-9-]{1,40}$/;

/**
 * Any country's number, as typed after cleanup: separators (spaces, ".", "-", "(", ")") removed, a leading "00"
 * becomes "+", then 8 to 15 digits with an optional "+". "+225 07 07 07 07 07" → "+2250707070707",
 * "00221 77 123 45 67" → "+221771234567", "77 123 45 67" → "771234567"; anything else → null.
 * Deliberately NOT normalizeSnMobile: buyers of the course live in every UEMOA country.
 */
export function normalizeIntlPhone(s: unknown): string | null {
  if (typeof s !== "string") return null;
  let compact = cleanText(s).replace(/[\s.\-()]/g, "");
  if (compact.startsWith("00")) compact = "+" + compact.slice(2);
  return INTL_PHONE_RE.test(compact) ? compact : null;
}

/** Raw optional string: undefined when absent or blank after cleanText, null when not a string (invalid). */
function optionalText(src: Obj, key: string): string | undefined | null {
  const raw = src[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") return null;
  const s = cleanText(raw);
  return s ? s : undefined;
}

/** Optional e-mail, lower-cased. Reports `path` and returns undefined when invalid. */
function optionalEmail(c: Collector, src: Obj, key: string, path: string): string | undefined {
  const s = optionalText(src, key);
  if (s === undefined) return undefined;
  if (s === null || s.length > COURSE_EMAIL_MAX || !EMAIL_RE.test(s)) {
    c.fail(path, COURSE_MSG.email);
    return undefined;
  }
  return s.toLowerCase();
}

/** Optional international phone. Reports `path` with `message` and returns undefined when invalid. */
function optionalPhone(c: Collector, src: Obj, key: string, path: string, message: string): string | undefined {
  const raw = src[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string" && !cleanText(raw)) return undefined;
  const phone = normalizeIntlPhone(raw);
  if (phone === null) {
    c.fail(path, message);
    return undefined;
  }
  return phone;
}

export type CourseOrderValidation =
  | { ok: true; product: CourseProduct; buyer: Omit<CourseBuyer, "acceptedAt" | "cgvVersion"> }
  | { ok: false; fields: Record<string, string> };

/** POST /orders body of a course: { product, buyer: { fullName, email?, phone? }, acceptCgv: true }. */
export function validateCourseOrder(body: unknown): CourseOrderValidation {
  const c = new Collector();
  const root: Obj = isObj(body) ? body : {};
  const product = root.product;
  if (!isCourseProduct(product)) c.fail("product", COURSE_MSG.invalid);

  const src: Obj = isObj(root.buyer) ? root.buyer : {};
  const name = optionalText(src, "fullName");
  let fullName = "";
  if (name === undefined) c.fail("buyer.fullName", COURSE_MSG.nameMissing);
  else if (
    name === null || name.length < FULL_NAME_MIN || name.length > FULL_NAME_MAX || !FULL_NAME_RE.test(name) ||
    (name.match(LETTER_RE) ?? []).length < 2
  ) {
    c.fail("buyer.fullName", COURSE_MSG.nameInvalid);
  } else fullName = name;

  const email = optionalEmail(c, src, "email", "buyer.email");
  const phone = optionalPhone(c, src, "phone", "buyer.phone", COURSE_MSG.phone);
  if (root.acceptCgv !== true) c.fail("acceptCgv", COURSE_MSG.cgv);

  if (Object.keys(c.fields).length || !isCourseProduct(product)) return { ok: false, fields: c.fields };
  const buyer: Omit<CourseBuyer, "acceptedAt" | "cgvVersion"> = { fullName, acceptCgv: true };
  if (email !== undefined) buyer.email = email;
  if (phone !== undefined) buyer.phone = phone;
  return { ok: true, product, buyer };
}

export type LeadValidation =
  | { ok: true; email: string | null; whatsapp: string | null; source: string }
  | { ok: false; fields: Record<string, string> };

/** POST /leads body: { email? | whatsapp?, consent: true, source }. An unknown source becomes "autre". */
export function validateLead(body: unknown): LeadValidation {
  const c = new Collector();
  const root: Obj = isObj(body) ? body : {};
  const emailGiven = optionalText(root, "email") !== undefined;
  const whatsappGiven = !(root.whatsapp === undefined || root.whatsapp === null ||
    (typeof root.whatsapp === "string" && !cleanText(root.whatsapp)));
  const email = optionalEmail(c, root, "email", "email");
  const whatsapp = optionalPhone(c, root, "whatsapp", "whatsapp", COURSE_MSG.whatsapp);
  if (!emailGiven && !whatsappGiven) c.fail("contact", COURSE_MSG.contact);
  if (root.consent !== true) c.fail("consent", COURSE_MSG.consent);
  const source = typeof root.source === "string" && SOURCE_RE.test(root.source) ? root.source : "autre";
  if (Object.keys(c.fields).length) return { ok: false, fields: c.fields };
  return { ok: true, email: email ?? null, whatsapp: whatsapp ?? null, source };
}
