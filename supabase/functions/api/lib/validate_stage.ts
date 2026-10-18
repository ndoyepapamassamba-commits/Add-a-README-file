// Validation of the Pack Stage block (`data.internship`) and of the target of a "stage" order.
// Called by validateOrderRequest (validate.ts) for product "stage" only; same Collector, same dotted paths
// ("internship.companies.2.reason").
import type { InternshipType, Level, OrderInput, Sector, SendChannel } from "./types.ts";
import { type Collector, compact, eachItem, isObj, LEVELS, type Obj, SECTORS } from "./validate.ts";
import { STAGE_MAX_COMPANIES } from "./pricing.ts";

export const INTERNSHIP_TYPES: readonly InternshipType[] = ["academique", "fin_etudes", "vacances", "perfectionnement"];
export const SEND_CHANNELS: readonly SendChannel[] = ["email", "whatsapp", "depot"];
export const REASON_MIN = 20;
export const REASON_MAX = 300;

export const STAGE_MSG = {
  required: "Ce champ est obligatoire.",
  invalid: "Valeur invalide.",
  oneOf: "Ajoutez au moins une formation, un projet ou une expérience.",
  companies: "Ajoutez au moins une entreprise.",
  companyName: "Indiquez le nom de l'entreprise.",
  reason: "Expliquez en quelques mots pourquoi vous choisissez cette entreprise.",
  reasonMin: `${REASON_MIN} caractères minimum.`,
  convention: "Indiquez si votre établissement fournit la convention de stage.",
};

type Internship = NonNullable<OrderInput["internship"]>;

/** Accepts true/false and the usual form strings ("true", "oui", "non"…); null when absent or unreadable. */
function toBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (["true", "oui", "yes", "1", "on"].includes(s)) return true;
  if (["false", "non", "no", "0", "off"].includes(s)) return false;
  return null;
}

/** Optional enum: undefined when absent or blank, reported as invalid when present but unknown. */
function optionalEnum<T extends string>(c: Collector, src: Obj, key: string, path: string, allowed: readonly T[]): T | undefined {
  const raw = typeof src[key] === "string" ? (src[key] as string).trim() : src[key];
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (!(allowed as readonly unknown[]).includes(raw)) {
    c.fail(path, STAGE_MSG.invalid);
    return undefined;
  }
  return raw as T;
}

export function validateInternship(c: Collector, src: unknown): Internship | undefined {
  const p = "internship";
  if (!isObj(src)) {
    c.fail(p, src === undefined || src === null ? STAGE_MSG.required : STAGE_MSG.invalid);
    return undefined;
  }

  const companiesPath = `${p}.companies`;
  const companies = eachItem(c, c.list(src, "companies", companiesPath, STAGE_MAX_COMPANIES), companiesPath, (co, q) => {
    const name = c.text(co, "name", `${q}.name`, 100);
    if (name === undefined) c.fail(`${q}.name`, STAGE_MSG.companyName);
    const reason = c.text(co, "reason", `${q}.reason`, REASON_MAX);
    if (reason === undefined) c.fail(`${q}.reason`, STAGE_MSG.reason);
    else if (reason.length < REASON_MIN) c.fail(`${q}.reason`, STAGE_MSG.reasonMin);
    return compact({
      name: name ?? "",
      city: c.text(co, "city", `${q}.city`, 60),
      recipient: c.text(co, "recipient", `${q}.recipient`, 100),
      department: c.text(co, "department", `${q}.department`, 80),
      reason: reason ?? "",
    });
  });
  if (companies.length === 0) c.fail(companiesPath, STAGE_MSG.companies);

  const convention = toBoolean(src.conventionProvided);
  if (convention === null) c.fail(`${p}.conventionProvided`, STAGE_MSG.convention);

  return compact({
    school: c.required(src, "school", `${p}.school`, 100),
    program: c.required(src, "program", `${p}.program`, 100),
    studyLevel: c.required(src, "studyLevel", `${p}.studyLevel`, 40),
    internshipType: c.oneOf(src, "internshipType", `${p}.internshipType`, INTERNSHIP_TYPES),
    start: c.text(src, "start", `${p}.start`, 30),
    end: c.text(src, "end", `${p}.end`, 30),
    durationText: c.text(src, "durationText", `${p}.durationText`, 30),
    conventionProvided: convention ?? false,
    department: c.text(src, "department", `${p}.department`, 80),
    projects: c.strings(src, "projects", `${p}.projects`, 4, 200),
    qualities: c.strings(src, "qualities", `${p}.qualities`, 4, 40),
    channel: c.oneOf(src, "channel", `${p}.channel`, SEND_CHANNELS),
    companies,
  });
}

/**
 * Target of a "stage" order: `kind` is forced to "stage"; the wizard has no Objectif step, so the other
 * fields are optional (a typed value is still checked): jobTitle defaults to the department or the
 * programme, sector to "autre" (the generator infers it from the programme), level to "debutant".
 */
export function validateStageTarget(c: Collector, src: Obj, internship: Internship | undefined): OrderInput["target"] {
  const fallbackTitle = (internship?.department ?? internship?.program ?? "").slice(0, 80).trim();
  return {
    jobTitle: c.text(src, "jobTitle", "target.jobTitle", 80) ?? fallbackTitle,
    kind: "stage",
    sector: optionalEnum<Sector>(c, src, "sector", "target.sector", SECTORS) ?? "autre",
    level: optionalEnum<Level>(c, src, "level", "target.level", LEVELS) ?? "debutant",
  };
}
