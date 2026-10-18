// Seeded random CV Premium orders and the document invariants shared by the premium_* tests.
// Fixture module: it registers no test. Inputs are built on gen_inputs' realistic base data, then given a
// premium block typed the way senior customers type it on a phone (capitals, missing accents, quotes,
// numbers with spaces, duplicated tags, trailing full stops…).
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import type { Document, OrderInput, PremiumAccent, SkillLevel } from "../../lib/types.ts";
import { formatSnMobile } from "../../lib/phone.ts";
import { randomInput, rng } from "../gen_inputs.test.ts";

type R = () => number;
const one = <T>(r: R, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const maybe = <T>(r: R, x: T, p = 0.5): T | undefined => (r() < p ? x : undefined);
const pickSome = <T>(r: R, xs: readonly T[], max: number): T[] =>
  Array.from({ length: Math.floor(r() * (max + 1)) }, () => one(r, xs));

const HEADLINES = [
  "Directrice administrative et financière — banque et microfinance",
  "INGÉNIEUR RÉSEAUX ET TÉLÉCOMS SENIOR",
  "chef de projet suivi-évaluation, programmes de santé communautaire.",
  "Auditeur interne · Banque & assurance",
  "Responsable RH | paie, droit social et recrutement",
  "DAF",
  "Expert en conformité KYC / AML",
  "Coordinatrice de programmes ONG (nutrition, WASH)",
  "Analyste crédit et risques — PME et grandes entreprises",
  "responsable exploitation reseau mobile",
];
const PITCHES = [
  "je pilote depuis 2016 la production des états financiers et du reporting réglementaire d'une banque commerciale.",
  "Je conçois, déploie et exploite des réseaux d'accès radio et fibre pour plus de 2 millions d'abonnés. Je garantis la disponibilité du service, je pilote les prestataires et je forme les équipes de terrain. Mon objectif : un réseau fiable et des coûts maîtrisés.",
  "Spécialiste du suivi-évaluation, j'accompagne des programmes financés par des bailleurs internationaux, de la conception du cadre logique jusqu'au rapport final",
  "J'AI 12 ANS D'EXPÉRIENCE EN AUDIT INTERNE ET EN CONTRÔLE DES RISQUES",
  "« Gestionnaire rigoureux », je fais le lien entre la direction générale, les équipes et les partenaires.",
  "Je transforme des données brutes en décisions : tableaux de bord, contrôles automatiques et procédures documentées. Mes outils : Excel, Power BI et SQL.",
];
const QUOTES = [
  "« Une donnée fiable vaut mieux qu'un long rapport. »",
  '"le terrain d\'abord, le rapport ensuite"',
  "Je laisse toujours un processus plus simple que je ne l'ai trouvé",
  "Rigueur, écoute, résultats.",
  "Former mes équipes est ma meilleure réussite !",
];
const FIGURE_VALUES = [
  "15+",
  "16 359",
  "100 %",
  "7/7",
  "2,5 M",
  "+30 %",
  "12",
  "50k",
  "99,9 %",
  "1 200",
  "24/7",
  "+40",
  "3",
];
const FIGURE_LABELS = [
  "années d'expérience en banque",
  "AGENCES SUPERVISÉES",
  "collaborateurs encadrés.",
  "taux de disponibilité du réseau",
  "projets suivis pour des bailleurs internationaux",
  "pays couverts en Afrique de l'Ouest",
  "dossiers de crédit analysés par an",
  "de réduction des délais de clôture",
  "sites radio mis en service en 2023",
];
const DOMAINS: Array<{ title: string; detail: string }> = [
  { title: "Risque de crédit", detail: "classification BCEAO, provisions, suivi des impayés" },
  { title: "REPORTING RÉGLEMENTAIRE", detail: "états BCEAO, Commission bancaire, reporting groupe." },
  { title: "Réseaux d'accès", detail: "radio 4G, fibre optique, faisceaux hertziens" },
  { title: "Suivi-évaluation", detail: "cadre logique, indicateurs, enquêtes de terrain" },
  { title: "Gestion de projet", detail: "" },
  { title: "Conformité", detail: "KYC, lutte contre le blanchiment, sanctions" },
];
const ACHIEVEMENTS: Array<{ title: string; detail: string; tags: string[] }> = [
  {
    title: "Automatisation du reporting mensuel",
    detail: "passage d'un reporting manuel de 5 jours à un traitement automatisé en 1 jour, contrôles inclus.",
    tags: ["Excel", "power bi", "Power BI", "SQL"],
  },
  {
    title: "Déploiement de 120 sites 4G",
    detail: "pilotage des prestataires et recette des sites dans 3 régions",
    tags: ["4G", "Recette", "Prestataires"],
  },
  {
    title: "Évaluation finale d'un programme de santé",
    detail: "enquête auprès de 1 500 ménages, rapport remis aux bailleurs dans les délais",
    tags: ["KoboToolbox", "STATA"],
  },
  { title: "Mise en conformité IFRS 9", detail: "", tags: ["IFRS 9", "Provisions"] },
  {
    title: "RÉDUCTION DES IMPAYÉS",
    detail: "plan de recouvrement avec les agences : taux d'impayés ramené de 8 % à 4,5 %",
    tags: ["Recouvrement", "recouvrement", "Agences", "Comité de crédit"],
  },
  { title: "Création du service audit", detail: "recrutement et formation de 4 auditeurs", tags: [] },
];
const SKILL_NAMES = [
  "Excel",
  "excel",
  "Power BI",
  "SQL",
  "Analyse financière",
  "IFRS 9",
  "Gestion de projet",
  "Huawei U2020",
  "KoboToolbox",
  "Négociation",
  "SAP FI",
];
const SKILL_LEVELS: SkillLevel[] = ["Expert", "Avancé", "Bon", "Notions"];
const PREMIUM_QUALITIES = [
  "Rigueur",
  "rigueur",
  "Leadership",
  "Sens de l'écoute",
  "DISCRÉTION",
  "Esprit d'équipe",
  "Intégrité",
  "Résilience.",
];
const ACCENTS: PremiumAccent[] = ["marine", "bordeaux", "foret"];

/** A random premium order input (not yet validated: run it through validateOrderRequest first). */
export function randomPremiumInput(seed: number): OrderInput {
  const { input } = randomInput(seed);
  const r = rng(seed * 2246822519 + 13);
  const base: OrderInput = { ...input, letter: undefined };
  delete base.letter;
  // Premium is for experienced professionals: mostly confirmed or senior, but every level must work.
  base.target = { ...base.target, level: one(r, ["confirme", "senior", "senior", "confirme", "junior", "debutant"]) };
  if (base.education.length === 0 && base.experiences.length === 0) {
    base.experiences.push({ title: "Responsable administratif", company: "Kayor Services", start: "2015" });
  }
  base.premium = {
    headline: one(r, HEADLINES),
    pitch: maybe(r, one(r, PITCHES), 0.75),
    quote: maybe(r, one(r, QUOTES), 0.5),
    keyFigures: Array.from(
      { length: Math.floor(r() * 5) },
      () => ({ value: one(r, FIGURE_VALUES), label: one(r, FIGURE_LABELS) }),
    ),
    domains: Array.from({ length: Math.floor(r() * 4) }, () => ({ ...one(r, DOMAINS) })),
    achievements: Array.from({ length: Math.floor(r() * 7) }, () => {
      const a = one(r, ACHIEVEMENTS);
      return { ...a, tags: [...a.tags] };
    }),
    skillLevels: Array.from(
      { length: Math.floor(r() * 9) },
      () => ({ name: one(r, SKILL_NAMES), level: one(r, SKILL_LEVELS) }),
    ),
    qualities: pickSome(r, PREMIUM_QUALITIES, 6),
    personal: maybe(
      r,
      {
        age: maybe(r, one(r, ["41", "38 ans", "52"]), 0.7),
        situation: maybe(r, one(r, ["marié, 2 enfants", "Mariée", "célibataire"]), 0.7),
      },
      0.5,
    ),
    accent: one(r, ACCENTS),
  };
  return base;
}

/** The POST /orders body for a premium input. */
export function premiumBody(data: OrderInput | Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { product: "premium", template: "classique", data, website: "", ...extra };
}

// ---------------------------------------------------------------------------
// Document invariants (same rules as gen_generator.test.ts, extended to the premium block)
// ---------------------------------------------------------------------------

/** Every string of a document, with a path for error messages. */
export function docStrings(doc: unknown): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") out.push([path, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${i}`));
    else if (v && typeof v === "object") { for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`); }
  };
  walk(doc, "doc");
  return out;
}

const MISSING_ELISION =
  /(?<!\p{L})(de|que|je|le|la) (?:[aeiouéèêàâîôûœ]|y(?![aeiouéèêy])|h(?:ôt|ôp|yg|ydr|abit|ist|uman|orai|onn|éberg|ui))/iu;

/** Typographic invariants every generated string must satisfy. */
export function assertClean(doc: Document, ctx: string): void {
  for (const [path, s] of docStrings(doc)) {
    const where = `${ctx} ${path}: ${JSON.stringify(s)}`;
    assertEquals(s, s.trim(), `not trimmed — ${where}`);
    assert(!/\b(undefined|null|NaN)\b/.test(s), `undefined/null/NaN — ${where}`);
    assert(!/ {2}/.test(s), `double space — ${where}`);
    assert(!/\s[,.]/.test(s), `space before , or . — ${where}`);
    assert(!/\(\s*\)/.test(s), `empty () — ${where}`);
    assert(!/(?<!\.)\.\.(?!\.)|,,|,\./.test(s), `doubled punctuation — ${where}`);
    assertEquals((s.match(/"/g) ?? []).length % 2, 0, `unbalanced " — ${where}`);
    assertEquals((s.match(/«/g) ?? []).length, (s.match(/»/g) ?? []).length, `unbalanced « » — ${where}`);
    assertEquals((s.match(/\(/g) ?? []).length, (s.match(/\)/g) ?? []).length, `unbalanced () — ${where}`);
    assert(!/\n/.test(s), `newline — ${where}`);
    assert(!MISSING_ELISION.test(s), `missing elision — ${where}`);
    assert(!/(?<!\p{L})d' /u.test(s), `dangling elision — ${where}`);
  }
}

export const digitRuns = (s: string): string[] => s.match(/\d+/g) ?? [];

/** Digit runs of the output must exist in the input (the phone may be reformatted). */
export function assertNoInventedDigits(doc: Document, input: OrderInput, ctx: string): void {
  const allowed = new Set(digitRuns(`${JSON.stringify(input)} ${formatSnMobile(input.identity.phone)}`));
  for (const [path, s] of docStrings(doc)) {
    if (path.endsWith(".placeDate")) continue;
    for (const d of digitRuns(s)) {
      assert(allowed.has(d), `${ctx} ${path}: invented number ${d} in ${JSON.stringify(s)}`);
    }
  }
}

const BANK_PROPER_WORDS = new Set(["madame", "monsieur", "responsable", "ressources", "humaines"]);

/** Capitalised words that do not start a sentence must come from the input (no invented names). */
export function assertNoInventedNames(doc: Document, input: OrderInput, ctx: string): void {
  const known = new Set(
    (JSON.stringify(input).match(/\p{L}[\p{L}'’-]*/gu) ?? []).map((w) => w.toLocaleLowerCase("fr")),
  );
  for (const [path, s] of docStrings(doc)) {
    for (const sentence of s.split(/(?<=[.!?:;—|·])\s+/)) {
      for (const w of (sentence.match(/\p{L}[\p{L}'’-]*/gu) ?? []).slice(1)) {
        if (!/^\p{Lu}/u.test(w)) continue;
        const key = w.toLocaleLowerCase("fr");
        const bare = key.replace(/^\p{L}['’]/u, "");
        assert(
          known.has(key) || known.has(bare) || BANK_PROPER_WORDS.has(key),
          `${ctx} ${path}: "${w}" is not in the input — ${JSON.stringify(s)}`,
        );
      }
    }
  }
}
