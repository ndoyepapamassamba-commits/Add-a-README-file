// Pack Stage generator (product "stage"): a student CV, one lettre de demande de stage per company and a
// sending message (e-mail + WhatsApp). Pure and deterministic like generateDocument: facts come only from
// the student's input, stage_banks.ts only phrases them. The only company-specific content of a letter is
// the student's own `reason`, cleaned.
import type { CvDoc, Document, EnvoiDoc, LettreDoc, OrderInput, Sector } from "../types.ts";
import { formatSnMobile } from "../phone.ts";
import { CLOSINGS, type Ctx, expClause, SALUTATION, SECTOR_CONTEXT } from "./banks.ts";
import {
  addressLine,
  atSchool,
  buildContext,
  buildCv,
  fullNameOf,
  Picker,
  qualityNoun,
  resolveQualities,
  SECTOR_KEYWORDS,
} from "./index.ts";
import {
  type Dept,
  deptYour,
  ENVOI_ATTACHMENTS,
  ENVOI_AVAILABILITY,
  ENVOI_REQUEST,
  type LevelBucket,
  STAGE_DEFAULT_RECIPIENT,
  STAGE_NOUN,
  STAGE_P1_OPEN,
  STAGE_P1_PURPOSE,
  STAGE_P2_ASSOCIATIVE,
  STAGE_P2_BASES,
  STAGE_P2_IT,
  STAGE_P2_PROJECTS,
  STAGE_P2_QUALITIES,
  STAGE_P2_SKILLS,
  STAGE_P3_LEAD,
  STAGE_P4_AVAILABILITY,
  STAGE_P4_CONVENTION,
  STAGE_P4_INTERVIEW,
  STAGE_PROFILE_AIM,
  STAGE_PROFILE_ASSET,
  STAGE_PROFILE_INTRO,
  STAGE_REPEAT_STEMS,
  STAGE_SUBJECT_LABEL,
  type StageCtx,
  type StageVariant,
} from "./stage_banks.ts";
import {
  capitalize,
  cleanBullet,
  cleanFreeText,
  collapse,
  de,
  elide,
  foldKey,
  frenchDate,
  inSentence,
  joinList,
  joinSentences,
  lowerMonths,
  splitMissions,
  withArticle,
} from "./text.ts";

type Internship = NonNullable<OrderInput["internship"]>;
type Company = Internship["companies"][number];

/** WhatsApp messages stay short enough to read on a phone screen. */
export const WHATSAPP_MAX = 600;
/** At most this many project descriptions are quoted in a letter (the CV lists them all). */
const LETTER_PROJECTS = 2;

export function generateStageDocument(input: OrderInput, opts: { seed: string; now: Date }): Document {
  const internship = input.internship ?? emptyInternship(input);
  const sector = stageSector(input, internship);
  // The CV builder and the shared banks read `target`: a Pack Stage order is always an internship search.
  const stageInput: OrderInput = { ...input, target: { ...input.target, kind: "stage", sector } };
  const c = buildContext(stageInput, opts.now);
  const facts = stageFacts(stageInput, internship, c);
  const base = new Picker(opts.seed);
  return {
    cv: buildStageCv(stageInput, internship, c, facts, base),
    lettre: null,
    lettres: distinctLettres(stageInput, internship, c, facts, { ...opts, base }),
    envoi: buildEnvoi(stageInput, internship, facts, base),
  };
}

/** Rotation offsets tried for a letter whose phrasing would repeat an earlier letter of the order. */
const MAX_REDRAWS = 24;

/** One letter per company; a letter phrased exactly like an earlier one is re-drawn with another rotation. */
function distinctLettres(
  input: OrderInput,
  internship: Internship,
  c: Ctx,
  facts: StageFacts,
  opts: { seed: string; now: Date; base: Picker },
): LettreDoc[] {
  const seen = new Set<string>();
  return internship.companies.map((company, i) => {
    let letter = buildStageLettre(input, internship, c, facts, company, i, 0, opts);
    for (let redraw = 1; seen.has(letter.signature) && redraw <= MAX_REDRAWS; redraw++) {
      letter = buildStageLettre(input, internship, c, facts, company, i, redraw, opts);
    }
    seen.add(letter.signature);
    return letter.doc;
  });
}

/** Validation always provides `internship`; this only keeps the output whole if a caller does not. */
function emptyInternship(input: OrderInput): Internship {
  return {
    school: "",
    program: input.target.jobTitle,
    studyLevel: "",
    internshipType: "academique",
    conventionProvided: false,
    projects: [],
    qualities: [],
    channel: "email",
    companies: [],
  };
}

// ---------------------------------------------------------------------------
// Seeded writer: one variant per slot, rotated by letter index, avoiding repeated expressions
// ---------------------------------------------------------------------------

/** Stems match at the start of a word only ("formation" must not match "information"). */
const STEM_RES = STAGE_REPEAT_STEMS.map((stem) =>
  new RegExp(`(?<!\\p{L})${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u")
);

/**
 * Within a document, the variants repeating the fewest STAGE_REPEAT_STEMS already used form the pool;
 * letter `shift` of an order takes the pool entry one further than letter `shift - 1`, so the letters of
 * one order read differently.
 */
class StageWriter {
  private readonly used: string[];
  /** The choices made, slot by slot: two letters with the same signature read the same. */
  readonly signature: string[] = [];

  /** @param planned text that will appear in the document whatever the choices (reason, projects) */
  constructor(private readonly base: Picker, private readonly shift: number, planned: string[] = []) {
    this.used = [...planned];
  }

  pick(slot: string, variants: StageVariant[], c: StageCtx): string | null {
    const texts = variants.map((v) => v(c)).filter((t): t is string => typeof t === "string" && t !== "");
    return this.choose(slot, texts);
  }

  /**
   * @param probes what to score instead of `texts` (the wording without the student's quoted list), so a
   * word of that list does not count as a repeat of the variant's own wording
   */
  choose(slot: string, texts: string[], probes: string[] = texts): string | null {
    if (texts.length === 0) return null;
    const usedText = this.used.join(" ").toLocaleLowerCase("fr");
    const active = STEM_RES.filter((re) => re.test(usedText));
    const scores = probes.map((p) => {
      const lower = p.toLocaleLowerCase("fr");
      return active.filter((re) => re.test(lower)).length;
    });
    const fewest = Math.min(...scores);
    const pool = texts.filter((_, i) => scores[i] === fewest);
    // Same seed for every letter of the order, shifted by the letter index: neighbours differ.
    const chosen = pool[(this.base.index(slot, pool.length) + this.shift) % pool.length];
    this.used.push(chosen);
    this.signature.push(`${slot}=${texts.indexOf(chosen)}`);
    return chosen;
  }
}

// ---------------------------------------------------------------------------
// Facts → context
// ---------------------------------------------------------------------------

interface Project {
  associative: boolean;
  /** Typed as a full sentence ("J'ai conçu…") rather than a noun phrase ("Conception d'…"). */
  sentence: boolean;
  /** CV bullets: the text split into sentences. */
  bullets: string[];
  /** Letter form: in-sentence noun phrase, or the cleaned sentence(s). */
  inLetter: string;
}

interface StageFacts {
  ctx: StageCtx;
  projects: Project[];
  /** Diploma as a CV education line: "BTS Comptabilité et gestion". */
  diplomaLine: string;
}

/**
 * Pack Stage sector: the typed one, else the sector whose keywords best match the programme (counted
 * twice) and the departments sought.
 */
export function stageSector(input: OrderInput, internship: Internship): Sector {
  if (input.target.sector && input.target.sector !== "autre") return input.target.sector;
  const program = foldKey(internship.program);
  const departments = foldKey(
    [internship.department, ...internship.companies.map((co) => co.department)].filter(Boolean).join(" "),
  );
  let best: Sector = "autre";
  let bestScore = 0;
  for (const [sector, words] of Object.entries(SECTOR_KEYWORDS) as Array<[Sector, string[]]>) {
    const score = words.reduce(
      (sum, w) => sum + (program.includes(w) ? 2 * w.length : 0) + (departments.includes(w) ? w.length : 0),
      0,
    );
    if (score > bestScore) {
      best = sector;
      bestScore = score;
    }
  }
  return best;
}

/** Folded first words that make a programme name a diploma by itself ("Licence en informatique"). */
const DIPLOMA_WORD_RE = /^(licence|master|bts|dut|dts|bachelor|mba|diplome|cap|bep|bac|ingenieur|doctorat|l[123]|m[12])\b/;

/**
 * "BTS" + "Comptabilité et gestion" → "BTS Comptabilité et gestion"; "Autre" + "Comptabilité" →
 * "comptabilité"; a programme that already names its level is kept as typed. "DUT/ISEP" with an ISEP
 * school drops the level (the school says it), otherwise reads "DUT".
 */
export function diplomaOf(studyLevel: string, program: string, school: string): string {
  let level = collapse(studyLevel).replace(/[\s.,;:]+$/u, "");
  if (/^autres?$/i.test(level)) level = "";
  if (/^dut\s*\/\s*isep$/i.test(level)) level = /\bisep\b/i.test(school) ? "" : "DUT";
  const prog = collapse(program).replace(/[\s.,;:]+$/u, "");
  const progKey = foldKey(prog);
  if (!prog) return level ? capitalize(level) : "";
  if (DIPLOMA_WORD_RE.test(progKey)) return capitalize(prog);
  if (!level || progKey.includes(foldKey(level))) return inSentence(prog);
  return `${capitalize(level)} ${/^(en|de|d['’])\s?/i.test(prog) ? prog : capitalize(prog)}`;
}

export function bucketOf(studyLevel: string, program: string): LevelBucket {
  const k = foldKey(`${studyLevel} ${program}`);
  if (/\b(master|m1|m2|mba|ingenieur|dess|dea|doctorat)\b|bac\s*\+\s*[45]/.test(k)) return "master";
  if (/\b(licence|l)\s*[12]\b|\b(bts|dut|dts|isep|cap|bep|bt)\b|bac\s*\+\s*[12]/.test(k)) return "court";
  if (/\b(licence|l3|bachelor)\b|bac\s*\+\s*3/.test(k)) return "licence";
  return "autre";
}

// deno-fmt-ignore
const DEPT_HEADS: Record<string, "m" | "f"> = {
  service: "m", departement: "m", pole: "m", bureau: "m", secretariat: "m", cabinet: "m",
  direction: "f", cellule: "f", division: "f", agence: "f", unite: "f", equipe: "f", section: "f",
};
const PLURAL_DEPT_RE = /^(ressources|ventes|achats|finances|opérations|systèmes|relations|affaires|moyens)\b/i;

/** "Comptabilité" → "service comptabilité"; "Direction financière" → "direction financière" (feminine). */
export function deptOf(raw: string | undefined): Dept | null {
  const d = collapse(raw ?? "").replace(/[\s.,;:]+$/u, "");
  if (!/\p{L}/u.test(d)) return null;
  const noun = inSentence(d);
  const head = DEPT_HEADS[foldKey(noun.split(/[\s'’]/)[0] ?? "")];
  if (head) return { noun, fem: head === "f" };
  return { noun: PLURAL_DEPT_RE.test(noun) ? `service des ${noun}` : `service ${noun}`, fem: false };
}

const MONTH_RE = /^(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\b/i;
const DAY_RE = /^(1er|\d{1,2})(\s|[/.-]\d)/i;
const YEAR_RE = /^\d{4}$/;
const OPEN_START_RE = /^(dès|des\s|à\s+partir|a\s+partir|immédiatement|maintenant|au\s+plus\s+tôt)/i;

const cleanDate = (s: string | undefined) => inSentence(lowerMonths(collapse(s ?? "")).replace(/[\s.,;:]+$/u, ""));

function untilPhrase(e: string): string {
  if (DAY_RE.test(e)) return `jusqu'au ${e}`;
  if (MONTH_RE.test(e) || YEAR_RE.test(e)) return `jusqu'en ${e}`;
  return `jusqu'à ${e}`;
}

/** "à partir de janvier 2027", "de janvier à mars 2027", "du 6 janvier au 31 mars 2027", null. */
export function periodOf(start: string | undefined, end: string | undefined): string | null {
  let s = cleanDate(start);
  const e = cleanDate(end);
  if (!s && !e) return null;
  if (!s) return untilPhrase(e);
  if (OPEN_START_RE.test(s)) return e ? `${s}, ${untilPhrase(e)}` : s;
  if (!e) return DAY_RE.test(s) ? `à partir du ${s}` : `à partir ${elide("de", s)}`;
  if (foldKey(s) === foldKey(e)) return DAY_RE.test(s) ? `le ${s}` : MONTH_RE.test(s) || YEAR_RE.test(s) ? `en ${s}` : s;
  // "janvier 2027" … "mars 2027" → "de janvier à mars 2027".
  const ys = /^(.*\S)\s+(\d{4})$/.exec(s);
  const ye = /^(.*\S)\s+(\d{4})$/.exec(e);
  if (ys && ye && ys[2] === ye[2] && MONTH_RE.test(ys[1]) && MONTH_RE.test(ye[1])) s = ys[1];
  const from = DAY_RE.test(s) ? `du ${s}` : elide("de", s);
  return `${from} ${DAY_RE.test(e) ? `au ${e}` : `à ${e}`}`;
}

const UNIT_RE = /\b(mois|semaines?|jours?|ans?|années?|trimestres?|semestres?)\b/i;

/** Duration after the stage noun: " de 3 mois", " d'un mois", " (durée à définir)", "". */
export function lengthOf(raw: string | undefined): string {
  let d = collapse(raw ?? "").replace(/[\s.,;:]+$/u, "");
  d = d.replace(/^(?:d['’]une\s+durée\s+de|durée\s*(?:de|d['’]|:)?|pour|sur|de|d['’])\s*/i, "");
  if (!/[\p{L}\p{N}]/u.test(d)) return "";
  d = inSentence(d);
  return UNIT_RE.test(d) ? ` ${elide("de", d)}` : ` (durée ${d})`;
}

const ASSOCIATIVE_RE = /associ|club|benevol|amicale|scout/;
const SENTENCE_PROJECT_RE = /^(?:j['’]|je\b|nous\b|on\b)|^[^,]{1,40},\s*(?:j['’]|je\b|nous\b|on\b)/i;

/** A project quoted after a colon cannot hold another colon: "membre du club : ateliers" → "membre du club (ateliers)". */
function withoutColon(s: string): string {
  const m = /^(.+?)\s*:\s*(.+)$/.exec(s);
  if (!m) return s;
  if (/[()]/.test(s)) return s.replace(/\s*:\s*/g, ", ");
  return `${m[1]} (${m[2].replace(/\s*:\s*/g, ", ")})`;
}

/** Text typed entirely in capitals reads as shouting: it is lower-cased (then capitalised by the callers). */
function unshout(s: string): string {
  const letters = s.replace(/[^\p{L}]/gu, "");
  return letters.length > 10 && letters === letters.toLocaleUpperCase("fr") ? s.toLocaleLowerCase("fr") : s;
}

function projectFacts(projects: string[]): Project[] {
  const out: Project[] = [];
  for (const raw of projects) {
    const text = unshout(collapse(raw));
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const bullets = sentences.flatMap((s) => splitMissions(s)).slice(0, 6);
    if (bullets.length === 0) continue;
    const sentence = SENTENCE_PROJECT_RE.test(text);
    out.push({
      associative: ASSOCIATIVE_RE.test(foldKey(text)),
      sentence,
      bullets,
      inLetter: sentence
        ? cleanFreeText(sentences.slice(0, 2).join(" "))
        : withoutColon(inSentence(cleanBullet(sentences[0]))),
    });
  }
  return out;
}

function stageFacts(input: OrderInput, internship: Internship, c: Ctx): StageFacts {
  const school = collapse(internship.school);
  const diploma = diplomaOf(internship.studyLevel, internship.program, school);
  const projects = projectFacts(internship.projects);
  const ctx: StageCtx = {
    g: c.g,
    type: internship.internshipType,
    bucket: bucketOf(internship.studyLevel, internship.program),
    student: `${c.g("étudiant", "étudiante")} en ${diploma}`,
    diploma,
    at: atSchool(school),
    inField: "dans ce domaine",
    stageNoun: STAGE_NOUN[internship.internshipType],
    length: lengthOf(internship.durationText),
    period: periodOf(internship.start, internship.end),
    practice: SECTOR_CONTEXT[c.sector].practice,
    skills: c.skills,
    it: c.it,
    hasExperience: input.experiences.length > 0,
    hasAcademicProjects: projects.some((p) => !p.associative),
    hasAssociative: projects.some((p) => p.associative),
    dept: deptOf(internship.department),
    company: "",
    convention: internship.conventionProvided,
  };
  return { ctx, projects, diplomaLine: capitalize(diploma) };
}

// ---------------------------------------------------------------------------
// Student CV
// ---------------------------------------------------------------------------

/** True when an education line already names the current studies (shares a programme word or the level). */
function mentionsStudies(e: OrderInput["education"][number], internship: Internship): boolean {
  const key = foldKey(`${e.degree} ${e.school ?? ""}`);
  const words = (foldKey(internship.program).match(/\p{L}{4,}/gu) ?? [])
    .filter((w) => !/^(licence|master|diplome|formation)$/.test(w));
  const level = foldKey(internship.studyLevel);
  return words.some((w) => key.includes(w)) || (level.length >= 2 && !/^autres?$/.test(level) && key.includes(level));
}

function buildStageCv(input: OrderInput, internship: Internship, c: Ctx, facts: StageFacts, base: Picker): CvDoc {
  const cv = buildCv(input, c, base);
  const ctx = facts.ctx;
  const w = new StageWriter(base, 0);
  const profile = joinSentences([
    w.pick("cv.intro", STAGE_PROFILE_INTRO[ctx.bucket], ctx),
    w.pick("cv.asset", STAGE_PROFILE_ASSET, ctx),
    w.pick("cv.aim", STAGE_PROFILE_AIM, ctx),
  ]);
  const school = collapse(internship.school);
  const projects = facts.projects.map((p) => ({
    title: p.associative ? "Activité associative" : "Projet académique",
    // An association is not necessarily the school's: only academic projects are attached to it.
    company: p.associative ? "" : school,
    place: "",
    period: "",
    bullets: p.bullets,
  }));
  // The current studies come first when the education list does not mention them yet.
  const current = facts.diplomaLine && !input.education.some((e) => mentionsStudies(e, internship))
    ? [{ degree: facts.diplomaLine, school, year: "", detail: "" }]
    : [];
  return {
    ...cv,
    title: capitalize(ctx.student),
    profile,
    experiences: [...cv.experiences, ...projects],
    education: [...current, ...cv.education],
  };
}

// ---------------------------------------------------------------------------
// Lettre de demande de stage (one per company)
// ---------------------------------------------------------------------------

/**
 * The student's reason, cleaned: one or two sentences, capitalised, final stop, no shouting; an opening
 * "parce que / car / pour / afin de" becomes a whole sentence. Nothing is added about the company.
 */
export function cleanReason(raw: string): string {
  let t = unshout(collapse(raw).replace(/([!?])\1+/g, "$1").replace(/\.{4,}/g, "..."));
  // "parce que X et que Y" stays "parce que" (a "car" would not take the second "que").
  const lead = /^(parce\s+qu(?:e\s+|['’]\s*)|car\s+|afin\s+(?:de\s+|d['’]\s*)|pour\s+)(.+)$/i.exec(t);
  if (lead) t = `je m'adresse à vous ${lead[1].toLocaleLowerCase("fr")}${lead[2]}`;
  return cleanFreeText(t);
}

function projectSentences(quoted: Project[], w: StageWriter, c: StageCtx): string[] {
  // Items that hold a comma or an "et" are separated by semicolons so the list stays readable.
  const list = (items: string[]) => (items.some((x) => /,| et /.test(x)) ? items.join(" ; ") : joinList(items));
  const out: Array<string | null> = [];
  const academic = quoted.filter((p) => !p.associative && !p.sentence).map((p) => p.inLetter);
  const associative = quoted.filter((p) => p.associative && !p.sentence).map((p) => p.inLetter);
  if (academic.length) {
    out.push(w.choose(
      "p2.projects",
      STAGE_P2_PROJECTS.map((f) => f(list(academic), academic.length)),
      STAGE_P2_PROJECTS.map((f) => f("", academic.length)),
    ));
  }
  if (associative.length) {
    out.push(w.choose(
      "p2.associative",
      STAGE_P2_ASSOCIATIVE.map((f) => f(list(associative), c.g)),
      STAGE_P2_ASSOCIATIVE.map((f) => f("", c.g)),
    ));
  }
  out.push(...quoted.filter((p) => p.sentence).map((p) => p.inLetter));
  return out.filter((s): s is string => !!s);
}

function qualitiesSentence(list: string, last: boolean, w: StageWriter): string | null {
  const leads = STAGE_P2_QUALITIES.map((f) => [f(list, last), f("", last)]).filter(
    (pair): pair is [string, string] => pair[0] !== null,
  );
  return w.choose("p2.qualities", leads.map(([text]) => text), leads.map(([, probe]) => probe));
}

function experienceSentence(c: Ctx, w: StageWriter): string | null {
  if (!c.exp) return null;
  const opts = { span: true, notamment: false };
  return w.choose("p2.experience", [
    `Par ailleurs, ${expClause(c, 1, opts)}`,
    `Sur le plan professionnel, ${expClause(c, 0, opts)}`,
    `${capitalize(expClause(c, 1, opts))}, une expérience qui ${
      c.exp.current ? "me permet" : "m'a permis"
    } de développer ${c.expGain}`,
  ]);
}

function buildStageLettre(
  input: OrderInput,
  internship: Internship,
  c: Ctx,
  facts: StageFacts,
  company: Company,
  index: number,
  redraw: number,
  opts: { seed: string; now: Date; base: Picker },
): { doc: LettreDoc; signature: string } {
  const letterPicker = new Picker(`${opts.seed}:${index}`);
  const name = collapse(company.name);
  const ctx: StageCtx = {
    ...facts.ctx,
    company: name ? withArticle(name) : "votre structure",
    dept: deptOf(company.department ?? internship.department),
  };
  const reason = cleanReason(company.reason);
  const quoted = facts.projects.slice(0, LETTER_PROJECTS);
  // A redraw shifts the rotation by a step coprime with the pool sizes (2, 3, 4), so it reaches new choices.
  const w = new StageWriter(opts.base, index + redraw * 5, [reason, ...quoted.map((p) => p.inLetter)]);

  const p1 = joinSentences([
    w.pick("p1.open", STAGE_P1_OPEN[ctx.type], ctx),
    w.pick("p1.purpose", STAGE_P1_PURPOSE[ctx.type], ctx),
  ]);

  const { phrases, others } = resolveQualities(internship.qualities, c, letterPicker);
  const p2 = joinSentences([
    ctx.skills.length > 0
      ? w.pick("p2.skills", STAGE_P2_SKILLS, ctx)
      : ctx.it.length > 0
      ? w.pick("p2.it", STAGE_P2_IT, ctx)
      : !c.exp && facts.projects.length === 0 && w.pick("p2.bases", STAGE_P2_BASES, ctx),
    experienceSentence(c, w),
    ...projectSentences(quoted, w, ctx),
    phrases.length > 0 && qualitiesSentence(joinList(phrases), others.length === 0, w),
    others.length > 0 &&
    `Je fais ${phrases.length ? "également " : ""}preuve ${joinList(others.map(qualityNoun).map(de))}`,
  ]);

  const p3 = joinSentences([w.pick("p3.lead", STAGE_P3_LEAD, ctx), reason]);

  const p4 = joinSentences([
    w.pick("p4.availability", STAGE_P4_AVAILABILITY, ctx),
    w.pick("p4.convention", STAGE_P4_CONVENTION, ctx),
    w.pick("p4.interview", STAGE_P4_INTERVIEW, ctx),
  ]);

  const fullName = fullNameOf(input);
  const email = collapse(input.identity.email ?? "");
  const field = collapse(company.department ?? internship.department ?? internship.program);
  const doc: LettreDoc = {
    sender: [fullName, addressLine(input), formatSnMobile(input.identity.phone), email].filter(Boolean),
    recipient: [
      capitalize(collapse(company.recipient ?? "")) || STAGE_DEFAULT_RECIPIENT,
      name,
      capitalize(collapse(company.city ?? "")),
    ].filter(Boolean),
    placeDate: `${capitalize(collapse(input.identity.city))}, le ${frenchDate(opts.now)}`,
    subject: `Objet : Demande de stage ${STAGE_SUBJECT_LABEL[ctx.type]}${field ? ` — ${capitalize(field)}` : ""}`,
    salutation: SALUTATION,
    paragraphs: [p1, p2, p3, p4],
    closing: CLOSINGS[letterPicker.index("closing", CLOSINGS.length)],
    signature: fullName,
  };
  return { doc, signature: w.signature.join("|") };
}

// ---------------------------------------------------------------------------
// Sending message
// ---------------------------------------------------------------------------

/** "Service informatique" → "Informatique" (an e-mail subject names the field, not the unit). */
function subjectField(internship: Internship): string {
  const raw = collapse(internship.department ?? internship.program);
  const bare = raw.replace(/^(service|département|departement|pôle|pole)\s+(?:(?:des|du|de la|de l['’]|d['’]|de)\s*)?/i, "");
  return capitalize(bare || raw);
}

function whatsappMessage(ctx: StageCtx, fullName: string): string {
  const build = (keep: { at: boolean; period: boolean; dept: boolean; length: boolean; student: boolean }) => {
    const c: StageCtx = {
      ...ctx,
      at: keep.at ? ctx.at : "",
      period: keep.period ? ctx.period : null,
      dept: keep.dept ? ctx.dept : null,
      length: keep.length ? ctx.length : "",
    };
    return [
      "Bonjour Madame, Monsieur,",
      joinSentences([
        keep.student ? `Je m'appelle ${fullName}, ${c.student}${c.at}` : `Je m'appelle ${fullName}`,
        `Je souhaiterais effectuer un ${c.stageNoun}${c.length}${deptYour(c)}${c.period ? `, ${c.period}` : ""}`,
        "Je vous transmets ci-joint mon CV et ma lettre de motivation",
      ]),
      "Je reste disponible pour un entretien. Merci d'avance pour votre retour.",
    ].join("\n");
  };
  const all = { at: true, period: true, dept: true, length: true, student: true };
  const attempts = [
    all,
    { ...all, at: false },
    { ...all, at: false, dept: false },
    { ...all, at: false, dept: false, period: false },
    { at: false, period: false, dept: false, length: false, student: false },
  ];
  for (const keep of attempts) {
    const message = build(keep);
    if ([...message].length <= WHATSAPP_MAX) return message;
  }
  return [...build(attempts[attempts.length - 1])].slice(0, WHATSAPP_MAX).join("").trim();
}

function buildEnvoi(input: OrderInput, internship: Internship, facts: StageFacts, base: Picker): EnvoiDoc {
  // Generic: the same message fits every company of the order (no company name, no reason).
  const ctx: StageCtx = { ...facts.ctx, company: "", dept: deptOf(internship.department) };
  const w = new StageWriter(base, 0);
  const fullName = fullNameOf(input);
  const email = collapse(input.identity.email ?? "");
  const lines = [
    SALUTATION,
    joinSentences([w.pick("envoi.request", ENVOI_REQUEST, ctx)]),
    joinSentences([w.pick("envoi.attachments", ENVOI_ATTACHMENTS, ctx)]),
    joinSentences([w.pick("envoi.availability", ENVOI_AVAILABILITY, ctx)]),
    "Cordialement,",
    fullName,
    [formatSnMobile(input.identity.phone), email].filter(Boolean).join(" · "),
    "Pièces jointes : CV, lettre de motivation",
  ];
  return {
    emailSubject: `Candidature — Stage ${subjectField(internship)} — ${fullName}`,
    emailBody: lines.join("\n"),
    whatsapp: whatsappMessage(ctx, fullName),
  };
}
