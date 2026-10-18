// French phrase banks for the Pack Stage: student CV profile, lettre de demande de stage and sending
// message. Like banks.ts, every variant only *phrases* facts the student typed (school, programme, level,
// internship type, period, department, skills, projects, qualities, reasons). Never put a digit, a
// company fact, a promise of acceptance or an achievement in this file.
import type { InternshipType } from "../types.ts";
import { a, auSeinDe, capitalize, de, elide, type Gender, joinList } from "./text.ts";

/** Study level groups: short programmes (BTS, DUT, ISEP, L1–L2), licence (L3, pro), master, other. */
export type LevelBucket = "court" | "licence" | "master" | "autre";

/** A department as it reads in a sentence: "service comptabilité", "direction financière". */
export interface Dept {
  noun: string;
  fem: boolean;
}

export interface StageCtx {
  g: Gender;
  type: InternshipType;
  bucket: LevelBucket;
  /** "étudiante en BTS Comptabilité et gestion" (no school). */
  student: string;
  /** "BTS Comptabilité et gestion", or the in-sentence programme when no level applies. */
  diploma: string;
  /** School after the diploma: " à l'ISM", " (CESAG)", "". */
  at: string;
  /** "dans ce domaine" (the diploma already names the field). */
  inField: string;
  /** "stage de fin d'études". */
  stageNoun: string;
  /** Duration after the stage noun: " de 3 mois", "". */
  length: string;
  /** "à partir de janvier 2027", "de juillet à septembre 2027", or null. */
  period: string | null;
  /** Sector colour: "le fonctionnement d'un service comptable". */
  practice: string;
  /** Up to 3 skills, in-sentence form. */
  skills: string[];
  /** Up to 4 IT tools. */
  it: string[];
  hasExperience: boolean;
  hasAcademicProjects: boolean;
  hasAssociative: boolean;
  /** Target department for this letter (company's own, else the general one), or null. */
  dept: Dept | null;
  /** Company as it reads in a sentence: "Sonatel", "le Cabinet Diallo" ("" outside letters). */
  company: string;
  convention: boolean;
}

/** A sentence variant; a falsy value means it does not apply to this context. */
export type StageVariant = (c: StageCtx) => string | null | false | undefined;

export const STAGE_NOUN: Record<InternshipType, string> = {
  academique: "stage académique",
  fin_etudes: "stage de fin d'études",
  vacances: "stage de vacances",
  perfectionnement: "stage de perfectionnement",
};

/** "Objet : Demande de stage {label} — …". */
export const STAGE_SUBJECT_LABEL: Record<InternshipType, string> = {
  academique: "académique",
  fin_etudes: "de fin d'études",
  vacances: "de vacances",
  perfectionnement: "de perfectionnement",
};

export const STAGE_DEFAULT_RECIPIENT = "Monsieur le Directeur des Ressources Humaines";

// ---------------------------------------------------------------------------
// Shared phrasing helpers
// ---------------------------------------------------------------------------

const cap = capitalize;
const skillList = (c: StageCtx) => joinList(c.skills);
const itList = (c: StageCtx) => `(${c.it.join(", ")})`;

/** "le service comptabilité", "la direction financière", "l'équipe commerciale". */
export function deptDefinite(d: Dept): string {
  return elide(d.fem ? "la" : "le", d.noun);
}

/** ", à partir de janvier 2027" or "". */
const periodTail = (c: StageCtx) => (c.period ? `, ${c.period}` : "");

/** "au sein du service comptabilité de Sonatel" / "au sein de Sonatel". */
export function within(c: StageCtx): string {
  return c.dept ? `au sein ${de(deptDefinite(c.dept))} ${de(c.company)}` : auSeinDe(c.company);
}

/** Generic (no company): " au sein d'un service comptabilité" or "". */
const deptIndefinite = (c: StageCtx) => (c.dept ? ` au sein ${c.dept.fem ? "d'une" : "d'un"} ${c.dept.noun}` : "");

/** Generic (no company): " au sein de votre service comptabilité" or "". */
export const deptYour = (c: StageCtx) => (c.dept ? ` au sein de votre ${c.dept.noun}` : "");

/** "un stage de fin d'études de 3 mois au sein du service comptabilité de Sonatel, à partir de janvier 2027". */
const request = (c: StageCtx, article = "un") => `${article} ${c.stageNoun}${c.length} ${within(c)}${periodTail(c)}`;

// ---------------------------------------------------------------------------
// CV profile: intro (who) + asset (skills or projects) + aim (the internship sought)
// ---------------------------------------------------------------------------

export const STAGE_PROFILE_INTRO: Record<LevelBucket, StageVariant[]> = {
  court: [
    (c) => `${cap(c.student)}${c.at}, je suis ${c.g("motivé", "motivée")} à l'idée de mettre mes connaissances en pratique en entreprise`,
    (c) => `${cap(c.student)}${c.at}, j'acquiers des bases solides ${c.inField} que je souhaite confronter au terrain`,
    (c) => `${c.g("Sérieux", "Sérieuse")} et ${c.g("désireux", "désireuse")} d'apprendre, je suis ${c.student}${c.at}`,
  ],
  licence: [
    (c) => `${cap(c.student)}${c.at}, je dispose de bases solides ${c.inField}`,
    (c) => `${cap(c.student)}${c.at}, je souhaite mettre mes connaissances au service d'une équipe professionnelle`,
    (c) => `${c.g("Motivé", "Motivée")} et ${c.g("désireux", "désireuse")} d'apprendre, je suis ${c.student}${c.at}`,
  ],
  master: [
    (c) => `${cap(c.student)}${c.at}, j'ai acquis une solide formation ${c.inField}`,
    (c) => `${cap(c.student)}${c.at}, je souhaite approfondir mes connaissances au contact de professionnels`,
    (c) => `${c.g("Motivé", "Motivée")} et ${c.g("investi", "investie")} dans ma formation, je suis ${c.student}${c.at}`,
  ],
  autre: [
    (c) => `${cap(c.student)}${c.at}, je suis ${c.g("motivé", "motivée")} à l'idée de mettre mes connaissances en pratique en entreprise`,
    (c) => `${cap(c.student)}${c.at}, je souhaite mettre mes connaissances au service d'une équipe professionnelle`,
    (c) => `${c.g("Sérieux", "Sérieuse")} et ${c.g("désireux", "désireuse")} d'apprendre, je suis ${c.student}${c.at}`,
  ],
};

export const STAGE_PROFILE_ASSET: StageVariant[] = [
  (c) => c.skills.length > 0 && `Je dispose de compétences en ${skillList(c)}`,
  (c) => c.skills.length > 0 && `Ma formation m'a permis d'acquérir des compétences en ${skillList(c)}`,
  (c) => c.skills.length > 0 && `Mes points forts : ${skillList(c)}`,
  (c) => !c.skills.length && c.hasAcademicProjects && "J'ai complété ma formation par des projets académiques concrets",
  (c) =>
    !c.skills.length && c.hasAcademicProjects &&
    "Mes projets académiques m'ont permis de passer de la théorie à la pratique",
  (c) =>
    !c.skills.length && c.hasAcademicProjects &&
    "J'ai eu l'occasion de mettre mes acquis en pratique à travers des projets académiques",
  (c) =>
    !c.skills.length && !c.hasAcademicProjects && c.hasAssociative &&
    `Je me suis également ${c.g("investi", "investie")} dans la vie associative`,
  (c) => !c.skills.length && !c.hasAcademicProjects && c.it.length > 0 && `Je maîtrise les outils informatiques courants ${itList(c)}`,
];

/** "découvrir concrètement {practice}", unless the department clause already said "service" / "au sein". */
const discover = (c: StageCtx) =>
  !(c.dept && /\b(service|au sein)\b/.test(c.practice)) && `afin de découvrir concrètement ${c.practice}`;

const PROFILE_PURPOSE: Record<InternshipType, Array<(c: StageCtx) => string | false>> = {
  academique: [
    discover,
    () => "pour compléter ma formation par une expérience de terrain",
    () => "pour confronter mes acquis aux réalités du monde professionnel",
  ],
  fin_etudes: [
    () => "pour mettre en pratique l'ensemble de mes acquis avant mon entrée dans la vie professionnelle",
    discover,
    () => "pour achever ma formation au contact de professionnels",
  ],
  vacances: [
    () => "pour découvrir le monde de l'entreprise",
    discover,
    () => "pour mettre ce temps à profit et gagner en expérience pratique",
  ],
  perfectionnement: [
    () => "afin d'approfondir mes compétences sur le terrain",
    () => "pour consolider mes acquis au contact de professionnels expérimentés",
    () => "afin de gagner en autonomie et en efficacité",
  ],
};

const AIM_LEADS = ["Je recherche un", "Je souhaite effectuer un", "Mon objectif : un"];

/** Aim sentence: the internship sought (3 leads) with one purpose clause matching its type (3 each). */
export const STAGE_PROFILE_AIM: StageVariant[] = AIM_LEADS.flatMap((lead) =>
  [0, 1, 2].map((i) => (c: StageCtx) => {
    // The period clause opens with a comma, so it needs a closing one before the purpose.
    const sought = `${c.stageNoun}${c.length}${deptIndefinite(c)}${periodTail(c)}${c.period ? "," : ""}`;
    const purpose = PROFILE_PURPOSE[c.type][i](c);
    return purpose && `${lead} ${sought} ${purpose}`;
  })
);

// ---------------------------------------------------------------------------
// Lettre de demande de stage
// ---------------------------------------------------------------------------

/** P1, first sentence: who I am and the request (type, duration, department, company, period). */
export const STAGE_P1_OPEN: Record<InternshipType, StageVariant[]> = {
  academique: [
    (c) => `Actuellement ${c.student}${c.at}, je sollicite ${request(c)}`,
    (c) => `${cap(c.student)}${c.at}, j'ai l'honneur de solliciter ${request(c)}`,
    (c) => `Dans le cadre de ma formation en ${c.diploma}${c.at}, je me permets de solliciter ${request(c)}`,
    (c) => `Je suis ${c.student}${c.at} et je souhaite effectuer ${request(c)}`,
  ],
  fin_etudes: [
    (c) => `Au terme de ma formation en ${c.diploma}${c.at}, je sollicite ${request(c)}`,
    (c) => `${cap(c.student)}${c.at}, j'ai l'honneur de solliciter ${request(c)}`,
    (c) => `Actuellement ${c.student}${c.at}, je me permets de vous adresser ma demande de ${request(c, "").trim()}`,
    (c) => `Je suis ${c.student}${c.at} et je souhaite effectuer mon ${request(c, "").trim()}`,
  ],
  vacances: [
    (c) =>
      `${cap(c.student)}${c.at}, je souhaite mettre à profit mes vacances pour effectuer un stage${c.length} ${within(c)}${
        periodTail(c)
      }`,
    (c) => `${cap(c.student)}${c.at}, j'ai l'honneur de solliciter ${request(c)}`,
    (c) => `Actuellement ${c.student}${c.at}, je me permets de solliciter ${request(c)}`,
  ],
  perfectionnement: [
    (c) => `${cap(c.student)}${c.at}, je sollicite ${request(c)}`,
    (c) => `${cap(c.student)}${c.at}, j'ai l'honneur de solliciter ${request(c)}`,
    (c) =>
      `${c.g("Désireux", "Désireuse")} d'approfondir ma formation en ${c.diploma}${c.at}, je me permets de solliciter ${
        request(c)
      }`,
  ],
};

/** P1, second sentence: what this internship brings, by type. */
export const STAGE_P1_PURPOSE: Record<InternshipType, StageVariant[]> = {
  academique: [
    () => "Ce stage me permettrait de confronter les connaissances acquises en cours aux réalités du monde professionnel",
    (c) => `Il s'agit pour moi d'une occasion précieuse de découvrir concrètement ${c.practice}`,
    () => "Cette expérience compléterait utilement ma formation théorique par une immersion en entreprise",
    () => "Une telle expérience me permettrait de donner un sens concret aux notions étudiées en cours",
  ],
  fin_etudes: [
    () => "Ce stage représente pour moi l'étape qui conclut ma formation et prépare mon entrée dans la vie professionnelle",
    () => "À travers ce stage, je souhaite mettre en pratique l'ensemble des connaissances acquises au cours de ma formation",
    (c) => `Cette expérience me permettrait de découvrir concrètement ${c.practice} avant mon entrée dans la vie active`,
    () => "Il s'agit pour moi d'une étape décisive pour aborder sereinement le monde du travail",
  ],
  vacances: [
    () => "Je souhaite profiter de cette période pour découvrir le monde de l'entreprise et gagner en expérience pratique",
    (c) => `Ce stage serait pour moi l'occasion de découvrir concrètement ${c.practice}`,
    (c) =>
      c.hasExperience
        ? "Ce serait pour moi une occasion précieuse de mettre en pratique ce que j'apprends en cours"
        : "Cette première immersion en entreprise compléterait utilement ma formation",
    (c) =>
      `Je suis ${
        c.g("convaincu", "convaincue")
      } que cette expérience m'aidera à mieux comprendre les attentes du monde professionnel`,
  ],
  perfectionnement: [
    () => "Ce stage me permettrait d'approfondir mes connaissances et de gagner en autonomie sur le terrain",
    () => "Mon objectif est de consolider mes acquis au contact de professionnels expérimentés",
    () => "Je souhaite ainsi renforcer mes compétences pratiques et me préparer au mieux aux exigences du métier",
    () => "Une telle expérience me permettrait de gagner en maîtrise et en assurance dans mon futur métier",
  ],
};

/** P2: skills, each variant with its own way of adding the IT tools. */
export const STAGE_P2_SKILLS: StageVariant[] = [
  (c) =>
    c.skills.length > 0 &&
    `Ma formation m'a permis d'acquérir des compétences en ${skillList(c)}${
      c.it.length ? `, ainsi qu'une bonne maîtrise de l'outil informatique ${itList(c)}` : ""
    }`,
  (c) =>
    c.skills.length > 0 &&
    `Au fil de mes études, j'ai développé des compétences en ${skillList(c)}${
      c.it.length ? `, et je suis à l'aise avec l'outil informatique ${itList(c)}` : ""
    }`,
  (c) =>
    c.skills.length > 0 &&
    `Je dispose notamment de compétences en ${skillList(c)}${
      c.it.length ? `, sans oublier la maîtrise de l'outil informatique ${itList(c)}` : ""
    }`,
  (c) =>
    c.skills.length > 0 &&
    `Je mettrais volontiers à votre service mes compétences en ${skillList(c)}${
      c.it.length ? `, ainsi que ma maîtrise de l'outil informatique ${itList(c)}` : ""
    }`,
];

/** P2: IT tools, when the student listed no skills. */
export const STAGE_P2_IT: StageVariant[] = [
  (c) => c.it.length > 0 && `Je maîtrise les outils informatiques courants ${itList(c)}`,
  (c) => c.it.length > 0 && `Je suis à l'aise avec l'outil informatique ${itList(c)}`,
  (c) => c.it.length > 0 && `J'utilise avec aisance l'outil informatique ${itList(c)}`,
];

/** P2: neither skills nor IT tools typed. */
export const STAGE_P2_BASES: StageVariant[] = [
  () => "Ma formation m'a apporté des bases solides que je souhaite aujourd'hui mettre en pratique",
  () => "Mes cours m'ont permis d'acquérir des bases théoriques solides que je souhaite consolider en entreprise",
  () => "J'ai acquis au fil de ma formation des bases solides que je souhaite confronter au terrain",
];

/** P2: academic projects, `list` = the student's own descriptions (in-sentence), `n` = how many. */
export const STAGE_P2_PROJECTS: Array<(list: string, n: number) => string> = [
  (list, n) => `J'ai notamment mené ${n > 1 ? "les projets académiques suivants" : "un projet académique"} : ${list}`,
  (list, n) => `Au cours de ma formation, j'ai pris part ${n > 1 ? "aux projets suivants" : "au projet suivant"} : ${list}`,
  (list, n) => `Sur le plan pratique, j'ai travaillé sur ${n > 1 ? "plusieurs projets académiques" : "un projet académique"} : ${list}`,
  (list, n) => `Mon parcours comprend aussi ${n > 1 ? "plusieurs projets académiques" : "un projet académique"} : ${list}`,
];

/** P2: associative activities, `list` = the student's own descriptions (in-sentence). */
export const STAGE_P2_ASSOCIATIVE: Array<(list: string, g: Gender) => string> = [
  (list, g) => `En dehors des cours, je me suis ${g("investi", "investie")} dans la vie associative : ${list}`,
  (list) => `J'ai également une expérience de la vie associative : ${list}`,
  (list) => `Mon engagement associatif complète ce parcours : ${list}`,
];

/** P2: lead-in for the list of quality phrases ("je suis A, B et C"); `last` = no sentence follows. */
export const STAGE_P2_QUALITIES: Array<(list: string, last: boolean) => string | null> = [
  (list) => `Sur le plan personnel, je suis ${list}`,
  (list) => `Sur le plan humain, je suis ${list}`,
  (list) => `Je suis par ailleurs ${list}`,
  (list) => `Sur un plan plus personnel, je suis ${list}`,
  (list, last) => last ? `Enfin, je suis ${list}` : null,
];

/** P3: lead-in before the student's own reason (no claim about the company). */
export const STAGE_P3_LEAD: StageVariant[] = [
  (c) => `Mon choix de postuler auprès ${de(c.company)} est mûrement réfléchi`,
  (c) => `Ma démarche auprès ${de(c.company)} ne doit rien au hasard`,
  (c) => `C'est en toute connaissance de cause que je m'adresse ${a(c.company)}`,
  (c) => `Je souhaite tout particulièrement effectuer ce stage ${auSeinDe(c.company)}`,
];

/** P4: practical arrangements (the dates themselves are already in P1). */
export const STAGE_P4_AVAILABILITY: StageVariant[] = [
  (c) =>
    c.period
      ? "Je reste disponible pour convenir avec vous des modalités pratiques de ce stage"
      : "Je reste disponible pour convenir avec vous des dates et des modalités de ce stage",
  (c) =>
    c.period
      ? `Je me tiens ${c.g("prêt", "prête")} à convenir avec vous des modalités pratiques de ce stage`
      : "Nous pourrons convenir ensemble des dates qui conviendront le mieux à votre service",
  (c) =>
    c.period
      ? "Je suis à votre écoute pour organiser ce stage dans les meilleures conditions"
      : "Je suis à votre écoute pour fixer avec vous les dates de ce stage",
];

/** P4: only when the school provides the convention de stage. */
export const STAGE_P4_CONVENTION: StageVariant[] = [
  (c) => c.convention && "Mon établissement fournira la convention de stage",
  (c) => c.convention && "Une convention de stage sera établie par mon établissement",
  (c) => c.convention && "La convention de stage sera fournie par mon établissement de formation",
];

/** P4: interview request. */
export const STAGE_P4_INTERVIEW: StageVariant[] = [
  () => "Je me tiens à votre entière disposition pour un entretien à la date qui vous conviendra",
  (c) =>
    `Je serais ${
      c.g("ravi", "ravie")
    } de vous rencontrer lors d'un entretien afin de vous exposer plus en détail ma motivation`,
  () => "Je souhaiterais vivement vous rencontrer afin d'échanger sur ma candidature",
  (c) =>
    `${c.g("Motivé", "Motivée")} à l'idée d'apprendre à vos côtés, je reste à votre disposition pour un entretien`,
];

// ---------------------------------------------------------------------------
// Sending message (e-mail + WhatsApp), generic: it fits every company of the order
// ---------------------------------------------------------------------------

const requestGeneric = (c: StageCtx) => `un ${c.stageNoun}${c.length}${deptYour(c)}${periodTail(c)}`;

export const ENVOI_REQUEST: StageVariant[] = [
  (c) => `${cap(c.student)}${c.at}, je vous adresse ma candidature pour ${requestGeneric(c)}`,
  (c) => `${cap(c.student)}${c.at}, je souhaite effectuer ${requestGeneric(c)}`,
  (c) => `Actuellement ${c.student}${c.at}, je sollicite ${requestGeneric(c)}`,
];

export const ENVOI_ATTACHMENTS: StageVariant[] = [
  () => "Vous trouverez ci-joint mon CV et ma lettre de motivation",
  () => "Je joins à ce message mon CV et ma lettre de motivation",
  () => "Mon CV et ma lettre de motivation sont joints à ce message",
];

export const ENVOI_AVAILABILITY: StageVariant[] = [
  () => "Je reste à votre disposition pour un entretien à votre convenance",
  (c) => `Je serais ${c.g("ravi", "ravie")} d'échanger avec vous lors d'un entretien`,
  () => "Je me tiens à votre disposition pour toute information complémentaire ou pour un entretien",
];

/**
 * Expressions that should not appear twice in one letter (or profile): for each slot the writer prefers
 * the variants repeating the fewest of them.
 */
// deno-fmt-ignore
export const STAGE_REPEAT_STEMS = [
  "plan ", "solliciter", "sollicite", "je me permets", "j'ai l'honneur", "au sein", "concrètement",
  "occasion", "précieuse", "mettre en pratique", "mettre à profit", "bases solides", "compétences", "formation",
  "à vos côtés", "au contact", "disposition", "disponible", "m'adresse", "souhaite", "je suis", "entretien",
  "expérience", "approfondir", "consolider", "utilement", "réalités", "terrain", "ce stage", "notamment",
  "également", "volontiers", "à l'aise", "professionnel", "je me tiens", "je reste", "mené", "pratique",
  "travaillé", "réalis", "par ailleurs", "service",
];
