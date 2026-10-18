// Deterministic French CV + lettre de motivation generator. Pure: same input and seed ⇒ same document.
// Facts come only from the customer's input; banks.ts only phrases them.
import type { CvDoc, Document, LettreDoc, OrderInput, Product, Sector } from "../types.ts";
import { formatSnMobile } from "../phone.ts";
import {
  CLOSINGS,
  type Ctx,
  DEFAULT_QUALITIES,
  DEFAULT_RECIPIENT,
  type DegreeFacts,
  type ExpFacts,
  LETTRE_BACKGROUND,
  LETTRE_BEGINNER,
  LETTRE_BEGINNER_INTEREST,
  LETTRE_CLOSE,
  LETTRE_DEGREE,
  LETTRE_EXPERIENCE,
  LETTRE_FIT,
  LETTRE_INTEREST,
  LETTRE_IT,
  LETTRE_MISSIONS,
  LETTRE_OPEN_ADVERT,
  LETTRE_OPEN_REFERRAL,
  LETTRE_OPEN_SPONTANEOUS,
  LETTRE_QUALITIES,
  LETTRE_QUALITIES_AFTER,
  LETTRE_SKILLS,
  NEUTRAL_GAIN,
  PROFILE_AIM,
  PROFILE_EXPERIENCE,
  PROFILE_INTRO,
  PROFILE_SKILLS,
  QUALITIES,
  QUALITY_ADJECTIVES,
  QUALITY_ALIASES,
  REPEAT_STEMS,
  SALUTATION,
  SECTOR_CONTEXT,
  SECTORS,
  type Variant,
} from "./banks.ts";
import {
  a,
  auSeinDe,
  capitalize,
  cleanFreeText,
  collapse,
  de,
  elide,
  foldKey,
  frenchDate,
  genderOf,
  inSentence,
  joinList,
  joinSentences,
  lowerMonths,
  splitMissions,
  takesArticle,
  tidy,
  titleCaseName,
  upperName,
  withArticle,
} from "./text.ts";
import { isGenericEmployer, polishInput } from "./polish.ts";

export function generateDocument(raw: OrderInput, product: Product, opts: { seed: string; now: Date }): Document {
  const picker = new Picker(opts.seed);
  const input = polishInput(raw);
  const facts = buildContext(input, opts.now);
  return {
    cv: product === "lettre" ? null : buildCv(input, facts, picker),
    lettre: product === "cv" ? null : buildLettre(input, facts, picker, opts.now),
  };
}

// ---------------------------------------------------------------------------
// Seeded choices
// ---------------------------------------------------------------------------

/** 32-bit FNV-1a hash of the UTF-16 code units of `s`. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG: uniform floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Each slot draws from its own stream, so adding a slot never changes the choices of the others. */
class Picker {
  constructor(private readonly seed: string) {}

  index(slot: string, n: number): number {
    return Math.floor(mulberry32(fnv1a(`${this.seed}|${slot}`))() * n);
  }

  shuffle<T>(slot: string, xs: readonly T[]): T[] {
    const out = [...xs];
    const rnd = mulberry32(fnv1a(`${this.seed}|${slot}`));
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

/**
 * Writes one document (CV or lettre): picks one variant per slot, preferring the variants that repeat
 * the fewest expressions already used in that document (REPEAT_STEMS plus job title and domain).
 */
class Composer {
  private readonly used: string[] = [];
  /** Expressions to avoid repeating, with their weight: the job title and domain weigh double. */
  private readonly stems: Array<[string, number]>;

  /**
   * @param extraStems document-specific expressions to avoid repeating (the job title)
   * @param planned text that will appear in the document whatever the choices (the latest employer)
   */
  constructor(
    private readonly picker: Picker,
    private readonly c: Ctx,
    extraStems: string[] = [],
    private readonly planned: string[] = [],
  ) {
    const weighted = (stems: string[], weight: number) => stems.map((stem): [string, number] => [stem, weight]);
    const extra = extraStems.map((stem) => stem.toLocaleLowerCase("fr")).filter((stem) => stem.length >= 4);
    this.stems = [...weighted(REPEAT_STEMS, 1), ...weighted(extra, 2)];
  }

  pick(slot: string, variants: Variant[]): string | null {
    const texts = variants.map((v) => v(this.c)).filter((t): t is string => typeof t === "string" && t !== "");
    return this.choose(slot, texts);
  }

  choose(slot: string, texts: string[]): string | null {
    if (texts.length === 0) return null;
    const usedText = [...this.planned, ...this.used].join(" ").toLocaleLowerCase("fr");
    const active = this.stems.filter(([stem]) => usedText.includes(stem));
    // Fewest repeated expressions wins; a repeat every candidate shares does not decide anything.
    const repeats = texts.map((t) => {
      const lower = t.toLocaleLowerCase("fr");
      return active.reduce((sum, [stem, weight]) => sum + (lower.includes(stem) ? weight : 0), 0);
    });
    const fewest = Math.min(...repeats);
    const pool = texts.filter((_, i) => repeats[i] === fewest);
    const chosen = pool[this.picker.index(slot, pool.length)];
    this.used.push(chosen);
    return chosen;
  }
}

// ---------------------------------------------------------------------------
// Facts → generation context
// ---------------------------------------------------------------------------

/** An end date meaning "still in this job": "aujourd'hui", "jusqu'à maintenant", "à ce jour", "toujours"… */
const CURRENT_RE = /aujourd|actuel|en cours|présent|present|now|maintenant|ce jour|toujours/i;
const ONGOING_DEGREE_RE = /\b(en cours|actuellement|en préparation)\b/i;

function yearOf(s: string | undefined): number {
  const years = (s ?? "").match(/\b(19|20)\d{2}\b/g);
  return years ? Math.max(...years.map(Number)) : -1;
}

/** Index of the item with the highest score; the earliest one on ties (CVs usually list newest first). */
function latestIndex<T>(items: T[], score: (t: T) => number): number {
  let best = 0;
  items.forEach((item, i) => {
    if (score(item) > score(items[best])) best = i;
  });
  return best;
}

// deno-fmt-ignore
const FEMININE_DEGREE_WORDS = new Set([
  "licence", "maitrise", "attestation", "formation", "certification", "capacite", "agregation", "specialisation",
  "classe", "terminale", "premiere", "seconde", "these", "habilitation", "ecole",
]);

function degreeArticle(name: string): "un" | "une" {
  const first = foldKey(name.split(/[\s'’-]/)[0] ?? "");
  if (/^l\d/.test(first)) return "une"; // "L3" = licence 3
  return FEMININE_DEGREE_WORDS.has(first) ? "une" : "un";
}

/** " à l'ISM", " au Lycée Blaise Diagne", " à l'Université Cheikh Anta Diop"; " (SUPDECO)" when unsure. */
function atSchool(school: string | undefined): string {
  const s = collapse(school ?? "");
  if (!s) return "";
  if (takesArticle(s)) return ` ${a(withArticle(s))}`;
  const first = s.split(/[\s'’-]/)[0];
  const isAcronym = first.length >= 2 && /^[\p{Lu}\d]+$/u.test(first);
  if (isAcronym && /^[AEIOU]/.test(first)) return ` à l'${s}`;
  return ` (${s})`;
}

/** Licences and certificates are qualifications, not an academic path. */
// deno-fmt-ignore
const CERTIFICATE_FIRST_WORDS = new Set([
  "permis", "attestation", "certificat", "certification", "habilitation", "carte",
]);
/** Secondary-school diplomas give general grounding, not trade knowledge ("Bac+2" is higher education). */
const SECONDARY_FIRST_WORDS = new Set(["bac", "baccalaureat", "bfem", "cfee", "brevet", "terminale"]);

function buildDegree(input: OrderInput, c: Pick<Ctx, "g">, nowYear: number): DegreeFacts | null {
  const { sector, jobTitle } = input.target;
  const list = input.education.filter((e) => collapse(e.degree ?? "") !== "");
  if (list.length === 0) return null;
  const isOngoing = (e: OrderInput["education"][number]) =>
    ONGOING_DEGREE_RE.test(`${e.degree} ${e.year ?? ""} ${e.detail ?? ""}`) || yearOf(e.year) > nowYear;
  const e = list[latestIndex(list, (x) => (isOngoing(x) ? 9999 : yearOf(x.year)))];

  const withoutOngoing = collapse(e.degree.replace(/\(?\s*\b(en cours|en préparation)\b\s*\)?/gi, " "));
  const raw = withoutOngoing.replace(/[\s.,;:–—-]+$/u, "");
  const name = inSentence(raw);
  if (!name) return null;
  const status: DegreeFacts["status"] = /^niveau\b/i.test(name) ? "level" : isOngoing(e) ? "ongoing" : "done";
  const article = degreeArticle(name);
  const at = atSchool(e.school);
  const yearText = lowerMonths(collapse(e.year ?? ""));
  const when = status === "done" && /^(\p{L}+\s)?\d{4}$/u.test(yearText) ? ` en ${yearText}` : "";
  const obtained = article === "une" ? "obtenue" : "obtenu";

  let obtainedWhere = "";
  if (status === "done") {
    if (at.startsWith(" (")) obtainedWhere = `${at}${when ? ` ${obtained}${when}` : ""}`;
    else if (at || when) obtainedWhere = ` ${obtained}${at}${when}`;
  }
  let lead: string;
  let leadFull: string;
  if (status === "done") {
    lead = `Titulaire ${elide("de", `${article} ${name}`)}`;
    leadFull = `${lead}${obtainedWhere}`;
  } else if (status === "ongoing") {
    lead = `Actuellement ${c.g("étudiant", "étudiante")} en ${name}`;
    leadFull = `${lead}${at}`;
  } else {
    lead = `Avec un ${name}`;
    leadFull = `${lead}${at}`;
  }
  const first = foldKey(name.split(/[\s+]/)[0] ?? "");
  const category: DegreeFacts["category"] = CERTIFICATE_FIRST_WORDS.has(first)
    ? "certificate"
    : SECONDARY_FIRST_WORDS.has(first) && !/\+\s*\d/.test(name)
    ? "secondary"
    : "higher";
  const linked = category !== "secondary" && relatesTo(name, sector, jobTitle);
  return { status, category, linked, name, article, lead, leadFull, where: `${at}${when}`, obtainedWhere };
}

const MAX_MISSION_WORDS = 10;

function buildExperience(input: OrderInput): ExpFacts | null {
  const list = input.experiences.filter((e) => collapse(e.title ?? "") !== "");
  if (list.length === 0) return null;
  const isCurrent = (e: OrderInput["experiences"][number]) => {
    const start = collapse(e.start ?? "");
    const end = collapse(e.end ?? "");
    return end ? CURRENT_RE.test(end) : start !== "";
  };
  const e = list[latestIndex(list, (x) => (isCurrent(x) ? 9999 : Math.max(yearOf(x.end), yearOf(x.start))))];

  const title = inSentence(collapse(e.title).replace(/[\s.,;:]+$/u, ""));
  const company = collapse(e.company ?? "");
  // "chez chantier privé" is not French: a generic employer stays on the CV but out of the sentences.
  const at = !company || isGenericEmployer(company)
    ? ""
    : takesArticle(company)
    ? ` ${auSeinDe(withArticle(company))}`
    : ` chez ${company}`;
  const start = lowerMonths(collapse(e.start ?? ""));
  const end = lowerMonths(collapse(e.end ?? ""));
  const current = isCurrent(e);
  let span = "";
  if (current) span = start ? ` depuis ${start}` : "";
  else if (start && end) span = start === end ? ` en ${start}` : ` de ${start} à ${end}`;
  else if (end) span = ` jusqu'en ${end}`;

  const missions = splitMissions(e.missions)
    .filter((m) => m.split(" ").length <= MAX_MISSION_WORDS && !/[.!?]/.test(m) && !/^(je|j['’]|nous)\b/i.test(m))
    .slice(0, 3)
    .map(inSentence);
  return { title, internship: /^stage\b/i.test(title), at, current, span, missions };
}

const REFERRAL_RE =
  /\b(ami|amie|amis|proche|proches|connaissance|parent|parents|frère|sœur|soeur|cousin|cousine|oncle|tante|collègue|voisin|voisine|entourage|famille)\b/i;
const PRESS_RE = /\b(journal|quotidien|magazine|hebdomadaire|presse|soleil|observateur)\b/i;
const LOWER_LEAD_RE = /^(Le|La|Les|L['’]|Un|Une|Des|Mon|Ma|Mes|Votre|Vos|Notre|Sur|Dans|Via|Par|Grâce)\b/;

function parseSource(raw: string | undefined): Ctx["source"] {
  let s = collapse(raw ?? "").replace(/[\s.,;:!]+$/u, "");
  if (!/\p{L}/u.test(s) || /bouche/i.test(s)) return null; // word of mouth reads best as an open application
  s = s.replace(LOWER_LEAD_RE, (w) => w.toLocaleLowerCase("fr"));
  s = s.replace(/^(par|via|grâce à|grâce au|grâce aux)\s+/i, "");
  if (REFERRAL_RE.test(s)) return { mode: "referral", text: de(s) };
  if (/^(sur|dans)\s/i.test(s)) return { mode: "media", text: s };
  return { mode: "media", text: PRESS_RE.test(s) ? `dans ${s}` : `sur ${s}` };
}

/** Folded stems showing that a degree or a job title belongs to a sector. */
// deno-fmt-ignore
const SECTOR_KEYWORDS: Record<Sector, string[]> = {
  commerce: ["commerc", "vente", "vend", "negoce", "marketing", "caiss", "magasin", "boutique", "rayon"],
  comptabilite: ["compta", "financ", "audit", "fiscal", "gestion", "factur", "tresor", "banque", "credit"],
  informatique: [
    "informati", "numerique", "reseau", "logiciel", "developp", "web", "data", "system", "programm", "telecom",
  ],
  sante: ["sante", "infirm", "soins", "soign", "medic", "sage-femme", "pharma", "laborant", "hopital", "clinique"],
  enseignement: [
    "enseign", "education", "pedagog", "professeur", "instituteur", "formateur", "repetiteur", "lettres",
  ],
  administration: [
    "administ", "secretari", "assistan", "bureautique", "accueil", "standard", "archiv", "ressources humaines",
  ],
  btp: [
    "batiment", "genie civil", "btp", "travaux publics", "construction", "macon", "electric", "plomb", "chantier",
    "menuis", "soud", "carrel", "topograph",
  ],
  hotellerie: [
    "hotel", "restaura", "cuisin", "tourisme", "serveu", "serveur", "barman", "reception", "hotesse", "patiss",
  ],
  logistique: [
    "logisti", "transport", "chauffeur", "livr", "magasinier", "cariste", "manutention", "permis", "conduite",
    "transit",
  ],
  communication: [
    "communic", "marketing", "journalis", "community", "graphi", "redact", "photo", "video", "audiovisuel",
  ],
  agriculture: ["agri", "agro", "elevage", "eleveur", "horticult", "maraich", "veterinai", "peche"],
  securite: ["securite", "gardiennage", "gardien", "vigile", "surveillance", "secour", "incendie"],
  autre: [],
};

/** True when `text` names the target sector or shares a significant word with the target job. */
function relatesTo(text: string, sector: Sector, jobTitle: string): boolean {
  const key = foldKey(text);
  if (SECTOR_KEYWORDS[sector].some((k) => key.includes(k))) return true;
  const stems = (s: string) => new Set((foldKey(s).match(/\p{L}{5,}/gu) ?? []).map((w) => w.slice(0, 5)));
  const jobStems = stems(jobTitle);
  return [...stems(text)].some((st) => jobStems.has(st));
}

/**
 * IT tools for a sentence where they appear in brackets: inner brackets dropped
 * ("Messagerie (Gmail, Outlook)" → "Messagerie"), duplicates and tools already cited as skills removed.
 */
function itForSentence(it: string[], citedSkills: string[]): string[] {
  const seen = new Set(citedSkills.map(foldKey));
  const out: string[] = [];
  for (const raw of it) {
    const tool = collapse(raw.replace(/\([^)]*\)/g, " ")).replace(/[()]/g, "");
    const key = foldKey(tool);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(tool);
  }
  return out.slice(0, 4);
}

function dedupeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of skills) {
    const s = capitalize(collapse(raw));
    const key = foldKey(s);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.slice(0, 12);
}

function buildContext(input: OrderInput, now: Date): Ctx {
  const g = genderOf(input.identity.civility);
  const { kind, sector, level } = input.target;
  const jobRaw = collapse(input.target.jobTitle);
  const job = inSentence(jobRaw);
  const isStageTitle = /^stage\b/i.test(job);
  const role = isStageTitle ? collapse(`stagiaire ${job.replace(/^stage\b/i, "")}`) : job;
  const posteNoun = /^poste\b/i.test(job) ? job : `poste ${de(role)}`;
  const stageNoun = isStageTitle
    ? job
    : /^stagiaire\b/i.test(job)
    ? collapse(`stage ${job.replace(/^stagiaire\b/i, "")}`)
    : `stage ${de(job)}`;
  const domain = sector === "autre"
    ? (isStageTitle || /^stagiaire\b/i.test(job) ? "ce domaine" : `le métier ${de(role)}`)
    : SECTORS[sector].domain;
  const exp = buildExperience(input);
  const degree = buildDegree(input, { g }, now.getUTCFullYear());
  const skills = dedupeSkills(input.skills);
  return {
    g,
    level,
    kind,
    sector,
    job,
    role,
    posteNoun,
    stageNoun,
    domain,
    field: degree?.linked && degree.category === "higher" ? "ce domaine" : domain,
    ...SECTOR_CONTEXT[sector],
    expGain: exp && relatesTo(exp.title, sector, jobRaw) ? SECTOR_CONTEXT[sector].gain : NEUTRAL_GAIN,
    degree,
    exp,
    expCount: input.experiences.length,
    hasJob: input.experiences.some((e) => collapse(e.title ?? "") !== "" && !/^stage|^stagiaire/i.test(e.title)),
    // A skill containing "et" reads best first: "hygiène et asepsie, soins de base et prise de constantes".
    skills: skills.slice(0, 3).map(inSentence).sort((x, y) => Number(/ et /.test(y)) - Number(/ et /.test(x))),
    it: itForSentence(input.it, skills.slice(0, 3)),
    // Validation requires a company for letters; the fallback only keeps sentences whole.
    company: collapse(input.letter?.company ?? "") ? withArticle(input.letter!.company) : "votre entreprise",
    source: parseSource(input.letter?.source),
  };
}

// ---------------------------------------------------------------------------
// CV
// ---------------------------------------------------------------------------

function fullNameOf(input: OrderInput): string {
  return `${titleCaseName(input.identity.firstName)} ${upperName(input.identity.lastName)}`;
}

function addressLine(input: OrderInput): string {
  const city = capitalize(collapse(input.identity.city));
  const address = collapse(input.identity.address ?? "");
  if (!address) return city;
  return foldKey(address).includes(foldKey(city)) ? address : `${address}, ${city}`;
}

/** "2022 – 2024", "Depuis 2023", "2024", "". */
export function formatPeriod(start: string | undefined, end: string | undefined): string {
  const s = lowerMonths(collapse(start ?? ""));
  const e = lowerMonths(collapse(end ?? ""));
  const endIsCurrent = e !== "" && CURRENT_RE.test(e);
  if (s && (!e || endIsCurrent)) return `Depuis ${s}`;
  if (s && e) return capitalize(s === e ? s : `${s} – ${e}`);
  if (endIsCurrent) return "En cours";
  return capitalize(s || e);
}

function buildProfile(c: Ctx, picker: Picker): string {
  // The aim must name the job, so it is chosen first; the other slots then avoid repeating it.
  const w = new Composer(picker, c, [c.role, c.domain], [c.exp?.at ?? ""]);
  const aim = w.pick("profile.aim", PROFILE_AIM[c.kind]);
  const asset = c.exp ? w.pick("profile.experience", PROFILE_EXPERIENCE) : w.pick("profile.skills", PROFILE_SKILLS);
  const intro = w.pick("profile.intro", PROFILE_INTRO[c.level]);
  return joinSentences([intro, asset, aim]);
}

function buildCv(input: OrderInput, c: Ctx, picker: Picker): CvDoc {
  const email = collapse(input.identity.email ?? "");
  return {
    fullName: fullNameOf(input),
    title: capitalize(collapse(input.target.jobTitle)),
    contacts: [formatSnMobile(input.identity.phone), email, addressLine(input)].filter(Boolean),
    profile: buildProfile(c, picker),
    experiences: input.experiences.map((e) => ({
      title: capitalize(collapse(e.title)),
      company: collapse(e.company ?? ""),
      place: collapse(e.place ?? ""),
      period: formatPeriod(e.start, e.end),
      bullets: splitMissions(e.missions),
    })),
    education: input.education.map((e) => ({
      degree: capitalize(collapse(e.degree)),
      school: collapse(e.school ?? ""),
      year: collapse(e.year ?? ""),
      detail: tidy(e.detail ?? ""),
    })),
    skills: dedupeSkills(input.skills),
    it: input.it.map(collapse).filter(Boolean),
    languages: input.languages
      .map((l) => ({ name: capitalize(collapse(l.name)), level: collapse(l.level) }))
      .filter((l) => l.name !== ""),
    interests: input.interests.map((i) => capitalize(collapse(i))).filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Lettre de motivation
// ---------------------------------------------------------------------------

const QUALITY_BY_KEY = new Map(QUALITIES.map((q) => [qualityKey(q.label), q]));

function qualityKey(s: string): string {
  return foldKey(s).replace(/’/g, "'");
}

/** Adjective endings ("souriante", "attentif") as opposed to noun endings ("curiosité", "patience"). */
const ADJECTIVE_END_RE = /(eux|euse|if|ive|ant|ante|ent|ente|é|ée|ible|able|ique|el|elle|ien|ienne)$/u;
const NOUN_END_RE = /(ment|té|tion|sion|ance|ence|isme|ude|ise|eur|esse|ship)$/u;

/** A typed quality that completes "Je suis …" ("patiente", "très souriante") rather than "preuve de …". */
function isAdjective(text: string): boolean {
  const words = text.split(" ");
  const last = words[words.length - 1].toLocaleLowerCase("fr");
  if (words.length > 2 || (words.length === 2 && !/^(très|vraiment|toujours)$/i.test(words[0]))) return false;
  return ADJECTIVE_END_RE.test(last) && !NOUN_END_RE.test(last);
}

/**
 * Known labels and typed adjectives become "Je suis …" phrases (adjectives agreed with the civility);
 * other typed qualities are nouns for "Je fais preuve de …". Topped up to two from the sector defaults.
 */
function resolveQualities(typed: string[], c: Ctx, picker: Picker): { phrases: string[]; others: string[] } {
  const labels: string[] = [];
  const adjectives: string[] = [];
  const others: string[] = [];
  const seen = new Set<string>();
  for (const raw of typed) {
    const text = collapse(raw).replace(/[\s.,;:!]+$/u, "");
    const key = qualityKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const label = QUALITY_BY_KEY.get(key)?.label ?? QUALITY_ALIASES[key];
    const pair = QUALITY_ADJECTIVES.get(key);
    if (label) {
      if (!labels.includes(label)) labels.push(label);
    } else if (pair) adjectives.push(c.g(pair[0], pair[1]));
    else if (isAdjective(inSentence(text))) adjectives.push(inSentence(text));
    else others.push(inSentence(text));
  }
  for (const label of picker.shuffle("qualities", DEFAULT_QUALITIES[c.sector])) {
    if (labels.length + adjectives.length + others.length >= 2) break;
    if (!labels.includes(label)) labels.push(label);
  }
  const phrases = [...labels.map((l) => QUALITY_BY_KEY.get(qualityKey(l))!.phrase(c.g)), ...adjectives].slice(0, 4);
  return { phrases, others: others.slice(0, Math.max(0, 4 - phrases.length)) };
}

/** "sens de l'écoute" → "un sens de l'écoute", so that "preuve d'un sens de l'écoute" reads well. */
function qualityNoun(q: string): string {
  if (/^(bonne|grande|réelle|excellente|vraie)\b/i.test(q)) return `une ${q}`;
  if (/^(sens|esprit|goût|bon|grand|réel|excellent|vrai)\b/i.test(q)) return `un ${q}`;
  return q;
}

function buildParagraphs(input: OrderInput, c: Ctx, picker: Picker): string[] {
  const motivation = cleanFreeText(input.letter?.motivation);
  const w = new Composer(picker, c, [c.role, c.domain], [motivation]);

  const openBank = c.source?.mode === "media"
    ? LETTRE_OPEN_ADVERT
    : c.source?.mode === "referral"
    ? LETTRE_OPEN_REFERRAL
    : LETTRE_OPEN_SPONTANEOUS;
  const p1 = joinSentences([w.pick("p1.open", openBank), w.pick("p1.fit", LETTRE_FIT[c.kind])]);

  const p2Parts: Array<string | null> = [];
  if (c.degree) p2Parts.push(w.pick("p2.degree", LETTRE_DEGREE));
  if (c.exp) {
    p2Parts.push(w.pick("p2.experience", LETTRE_EXPERIENCE));
    if (c.exp.missions.length > 0) p2Parts.push(w.pick("p2.missions", LETTRE_MISSIONS));
  }
  if (c.level === "debutant") {
    if (!c.degree && !c.exp) p2Parts.push(w.pick("p2.interest", LETTRE_BEGINNER_INTEREST));
    if (!c.exp || c.exp.internship) p2Parts.push(w.pick("p2.beginner", LETTRE_BEGINNER));
  } else if (!c.exp) {
    const first = w.pick("p2.background", LETTRE_BACKGROUND);
    p2Parts.push(first);
    // Without a degree either, a second background sentence keeps the paragraph substantial.
    if (!c.degree) p2Parts.push(w.pick("p2.background2", LETTRE_BACKGROUND.filter((v) => v(c) !== first)));
  }
  const p2 = joinSentences(p2Parts);

  const { phrases, others } = resolveQualities(input.letter?.qualities ?? [], c, picker);
  const skillsSentence = c.skills.length > 0
    ? w.pick("p3.skills", LETTRE_SKILLS)
    : c.it.length > 0 && w.pick("p3.it", LETTRE_IT);
  // "Je suis par ailleurs…" needs a sentence before it; without one the qualities open the paragraph.
  const qualityIntros = skillsSentence ? [...LETTRE_QUALITIES, ...LETTRE_QUALITIES_AFTER] : LETTRE_QUALITIES;
  const p3 = joinSentences([
    skillsSentence,
    phrases.length > 0 && w.choose("p3.qualities", qualityIntros.map((intro) => intro(joinList(phrases)))),
    others.length > 0 &&
    `Je fais ${phrases.length ? "également " : ""}preuve ${joinList(others.map(qualityNoun).map(de))}`,
    motivation,
    w.pick("p3.interest", LETTRE_INTEREST),
  ]);

  const p4 = joinSentences([w.pick("p4.close", LETTRE_CLOSE)]);
  return [p1, p2, p3, p4];
}

function buildLettre(input: OrderInput, c: Ctx, picker: Picker, now: Date): LettreDoc {
  const fullName = fullNameOf(input);
  const email = collapse(input.identity.email ?? "");
  const jobTitle = collapse(input.target.jobTitle);
  const subject = c.kind === "stage"
    ? `Objet : Demande de stage — ${capitalize(jobTitle)}`
    : c.kind === "alternance"
    ? `Objet : Candidature en alternance — ${capitalize(jobTitle)}`
    : `Objet : Candidature au ${c.posteNoun}`; // in-sentence case: "au poste d'assistante comptable", "de DAF"
  const letter = input.letter;
  return {
    sender: [fullName, addressLine(input), formatSnMobile(input.identity.phone), email].filter(Boolean),
    recipient: [
      capitalize(collapse(letter?.recipient ?? "")) || DEFAULT_RECIPIENT,
      collapse(letter?.company ?? ""),
      capitalize(collapse(letter?.companyCity ?? "")),
    ].filter(Boolean),
    placeDate: `${capitalize(collapse(input.identity.city))}, le ${frenchDate(now)}`,
    subject,
    salutation: SALUTATION,
    paragraphs: buildParagraphs(input, c, picker),
    closing: CLOSINGS[picker.index("closing", CLOSINGS.length)],
    signature: fullName,
  };
}
