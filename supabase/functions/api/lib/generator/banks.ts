// French phrase banks for the CV and the lettre de motivation, written for Senegal's job market.
// Every variant only *phrases* facts the customer typed (job, sector, level, degree, experience,
// skills, qualities). Never put a digit, an employer, a diploma or an achievement in this file.
import type { JobKind, Level, Sector } from "../types.ts";
import { de, enTantQue, type Gender, joinList } from "./text.ts";

// ---------------------------------------------------------------------------
// Generation context (built by index.ts from the customer's input)
// ---------------------------------------------------------------------------

export interface DegreeFacts {
  /** done = diploma obtained, ongoing = currently studying, level = "Niveau terminale". */
  status: "done" | "ongoing" | "level";
  /** higher: BTS, licence, master…; secondary: bac, BFEM; certificate: permis, attestation… */
  category: "higher" | "secondary" | "certificate";
  /** True when the degree names the target sector or job ("BTS en comptabilité" for a comptable). */
  linked: boolean;
  /** In-sentence name without article: "BTS en comptabilité", "niveau terminale". */
  name: string;
  article: "un" | "une";
  /** Opening participial phrase: "Titulaire d'un BTS en comptabilité", "Actuellement étudiante en licence 3". */
  lead: string;
  /** Lead completed with school/year: "Titulaire d'un BTS en comptabilité obtenu à l'ISM en 2023". */
  leadFull: string;
  /** School and year after the name: " à l'ISM en 2023", " (SUPDECO)", "". */
  where: string;
  /** Same with the participle for an obtained diploma: " obtenu à l'ISM en 2023", " (SUPDECO) obtenu en 2011". */
  obtainedWhere: string;
}

export interface ExpFacts {
  /** In-sentence job title: "caissière", "stage en comptabilité". */
  title: string;
  /** "stage" when the title names an internship ("Stage en comptabilité"). */
  internship: boolean;
  /** " chez Auchan Sénégal" or "". */
  at: string;
  current: boolean;
  /** " de 2022 à 2024", " depuis 2023", " en 2024", " jusqu'en 2024", "". */
  span: string;
  /** Up to 3 short missions, in-sentence form. */
  missions: string[];
}

export interface Ctx {
  g: Gender;
  level: Level;
  kind: JobKind;
  sector: Sector;
  /** In-sentence job title: "assistante comptable". */
  job: string;
  /** Person noun used after "en tant que": the job, or "stagiaire en …" for "Stage en …". */
  role: string;
  /** "poste d'assistante comptable". */
  posteNoun: string;
  /** "stage d'assistante comptable", "stage en comptabilité". */
  stageNoun: string;
  domain: string;
  /** The domain once a linked degree already named it ("ce domaine"), otherwise the same as `domain`. */
  field: string;
  practice: string;
  stake: string;
  gain: string;
  /** What the latest experience developed: `gain` when it is in the target trade, a neutral phrase otherwise. */
  expGain: string;
  org: string;
  degree: DegreeFacts | null;
  exp: ExpFacts | null;
  expCount: number;
  /** Up to 3 customer skills, in-sentence form. */
  skills: string[];
  /** Up to 4 IT tools as typed. */
  it: string[];
  /** Company as it reads in a sentence: "Orange", "le Cabinet Diallo", "La Poste" ("" for a CV). */
  company: string;
  source: { mode: "media" | "referral"; text: string } | null;
}

/** A sentence variant. Returns a falsy value when it does not apply to this context. */
export type Variant = (c: Ctx) => string | null | false | undefined;

// ---------------------------------------------------------------------------
// Sectors
// ---------------------------------------------------------------------------

/** `domain` reads after "dans" / "pour": "dans le commerce et la vente". */
export const SECTORS: Record<Sector, { label: string; domain: string; skills: string[] }> = {
  commerce: {
    label: "Commerce, vente",
    domain: "le commerce et la vente",
    skills: [
      "Accueil client", "Techniques de vente", "Encaissement", "Gestion des stocks", "Mise en rayon",
      "Prospection", "Négociation", "Fidélisation client", "Relation client", "Suivi des commandes",
    ],
  },
  comptabilite: {
    label: "Comptabilité, finance",
    domain: "la comptabilité et la finance",
    skills: [
      "Saisie comptable", "SYSCOHADA", "Rapprochement bancaire", "Facturation", "Déclarations fiscales",
      "Paie", "Suivi de trésorerie", "Gestion de caisse", "États financiers",
      "Suivi des comptes clients et fournisseurs",
    ],
  },
  informatique: {
    label: "Informatique, numérique",
    domain: "l'informatique et le numérique",
    skills: [
      "Maintenance informatique", "Réseaux", "Développement web", "Support utilisateurs", "Bases de données",
      "Installation de logiciels", "Sécurité informatique", "Gestion de parc", "Dépannage matériel",
      "Administration de systèmes",
    ],
  },
  sante: {
    label: "Santé, social",
    domain: "le domaine de la santé",
    skills: [
      "Soins de base", "Accueil des patients", "Hygiène et asepsie", "Suivi des dossiers patients",
      "Prise de constantes", "Écoute", "Gestion des urgences", "Éducation à la santé",
      "Respect du secret professionnel", "Accompagnement des familles",
    ],
  },
  enseignement: {
    label: "Enseignement, formation",
    domain: "l'enseignement et la formation",
    skills: [
      "Préparation de cours", "Gestion de classe", "Pédagogie", "Évaluation des élèves", "Soutien scolaire",
      "Animation de groupe", "Suivi individuel", "Communication avec les parents",
      "Élaboration de supports pédagogiques", "Remédiation",
    ],
  },
  administration: {
    label: "Administration, secrétariat",
    domain: "l'administration et le secrétariat",
    skills: [
      "Accueil physique et téléphonique", "Rédaction de courriers", "Classement et archivage",
      "Gestion d'agenda", "Saisie de documents", "Organisation de réunions", "Gestion du courrier",
      "Tenue de dossiers", "Suivi administratif", "Gestion des fournitures",
    ],
  },
  btp: {
    label: "BTP, construction",
    domain: "le bâtiment et les travaux publics",
    skills: [
      "Lecture de plans", "Maçonnerie", "Métré", "Suivi de chantier", "Électricité bâtiment", "Plomberie",
      "Règles de sécurité", "Coffrage", "Ferraillage", "Carrelage",
    ],
  },
  hotellerie: {
    label: "Hôtellerie, restauration",
    domain: "l'hôtellerie et la restauration",
    skills: [
      "Accueil des clients", "Service en salle", "Réservations", "Cuisine", "Hygiène alimentaire",
      "Room service", "Tenue de caisse", "Gestion des réclamations", "Mise en place de la salle",
      "Service au bar",
    ],
  },
  logistique: {
    label: "Transport, logistique",
    domain: "le transport et la logistique",
    skills: [
      "Réception des marchandises", "Gestion des stocks", "Préparation de commandes", "Inventaire",
      "Conduite de véhicule", "Planification des livraisons", "Suivi des expéditions",
      "Chargement et déchargement", "Entretien courant du véhicule", "Respect du Code de la route",
    ],
  },
  communication: {
    label: "Communication, marketing",
    domain: "la communication et le marketing",
    skills: [
      "Réseaux sociaux", "Rédaction web", "Création de visuels", "Organisation d'événements",
      "Relations presse", "Marketing digital", "Prise de parole", "Photographie", "Community management",
      "Montage vidéo",
    ],
  },
  agriculture: {
    label: "Agriculture, élevage",
    domain: "l'agriculture et l'élevage",
    skills: [
      "Techniques culturales", "Irrigation", "Élevage", "Conduite de tracteur", "Gestion d'exploitation",
      "Transformation de produits", "Pépinière", "Vente de produits agricoles", "Maraîchage",
      "Traitement phytosanitaire",
    ],
  },
  securite: {
    label: "Sécurité, gardiennage",
    domain: "la sécurité et le gardiennage",
    skills: [
      "Surveillance de site", "Contrôle d'accès", "Rondes", "Premiers secours", "Rédaction de rapports",
      "Prévention incendie", "Vidéosurveillance", "Gestion des conflits", "Gestion des alarmes",
      "Accueil et orientation des visiteurs",
    ],
  },
  autre: {
    label: "Autre secteur",
    // Replaced by "le métier de <poste>" in index.ts: an unknown sector is best named by the job.
    domain: "ce métier",
    skills: [
      "Travail en équipe", "Organisation", "Service client", "Rédaction", "Polyvalence", "Gestion du temps",
      "Accueil du public", "Outils bureautiques",
    ],
  },
};

/**
 * Sector colour for the letters. practice: what a trainee discovers ("découvrir concrètement …");
 * stake: two things that matter in the trade (plural verb: "… comptent"); gain: what experience
 * there develops ("m'a permis de développer …"); org: the employer in general ("au service d'une entreprise").
 */
/** What any experience develops, used when the latest job is outside the target trade. */
export const NEUTRAL_GAIN = "le sens des responsabilités et une réelle capacité d'adaptation";

export const SECTOR_CONTEXT: Record<Sector, { practice: string; stake: string; gain: string; org: string }> = {
  commerce: {
    practice: "les techniques de vente et la relation client",
    stake: "la qualité de l'accueil et la satisfaction de la clientèle",
    gain: "un vrai sens du service et de la négociation",
    org: "une entreprise",
  },
  comptabilite: {
    practice: "le fonctionnement d'un service comptable",
    stake: "la fiabilité des comptes et le respect des échéances",
    gain: "une grande rigueur dans le traitement des opérations",
    org: "une entreprise",
  },
  informatique: {
    practice: "les méthodes de travail d'une équipe technique",
    stake: "la fiabilité des systèmes et la satisfaction des utilisateurs",
    gain: "une bonne capacité d'analyse et de résolution de problèmes",
    org: "une entreprise",
  },
  sante: {
    practice: "la prise en charge des patients en milieu professionnel",
    stake: "la qualité des soins et le bien-être des patients",
    gain: "un sens aigu de l'écoute et de la prise en charge des patients",
    org: "un établissement de santé",
  },
  enseignement: {
    practice: "la conduite de classe et la pédagogie au quotidien",
    stake: "la réussite et l'épanouissement des élèves",
    gain: "de réelles aptitudes pédagogiques et un bon contact avec les élèves",
    org: "un établissement scolaire",
  },
  administration: {
    practice: "la gestion administrative au sein d'une organisation",
    stake: "la bonne tenue des dossiers et la fluidité du travail administratif",
    gain: "un sens aigu de l'organisation et de la confidentialité",
    org: "une structure",
  },
  btp: {
    practice: "le déroulement d'un chantier",
    stake: "la qualité des ouvrages et le respect des règles de sécurité",
    gain: "une bonne connaissance des réalités du chantier",
    org: "une entreprise",
  },
  hotellerie: {
    practice: "les standards de service d'un établissement hôtelier",
    stake: "la qualité du service et la satisfaction de la clientèle",
    gain: "le sens de l'accueil et du service client",
    org: "un établissement hôtelier",
  },
  logistique: {
    practice: "l'organisation des flux et des livraisons",
    stake: "le respect des délais et la sécurité des marchandises",
    gain: "le sens de l'organisation et du respect des délais",
    org: "une entreprise",
  },
  communication: {
    practice: "la conduite de projets de communication",
    stake: "la cohérence de l'image de marque et la qualité des contenus",
    gain: "une bonne sensibilité à l'image de marque et à la qualité des contenus",
    org: "une structure",
  },
  agriculture: {
    practice: "les techniques de production sur le terrain",
    stake: "la qualité de la production et la bonne gestion des ressources",
    gain: "une bonne connaissance des réalités du terrain",
    org: "une structure",
  },
  securite: {
    practice: "les procédures de sécurité sur site",
    stake: "la protection des personnes et la sécurité des biens",
    gain: "une grande vigilance et un sens aigu des responsabilités",
    org: "une structure",
  },
  autre: {
    practice: "les réalités du métier",
    stake: "la qualité du travail et le respect des engagements",
    gain: "le sens des responsabilités et du travail bien fait",
    org: "une structure",
  },
};

// ---------------------------------------------------------------------------
// Qualities
// ---------------------------------------------------------------------------

/** Each phrase completes "Je suis …" and contains no "et", so phrases can be listed "A, B et C". */
export const QUALITIES: Array<{ label: string; phrase: (g: Gender) => string }> = [
  { label: "Rigueur", phrase: (g) => `${g("rigoureux", "rigoureuse")} dans mon travail` },
  { label: "Sens de l'organisation", phrase: () => "méthodique dans l'organisation de mes tâches" },
  { label: "Esprit d'équipe", phrase: (g) => `très ${g("attaché", "attachée")} au travail en équipe` },
  { label: "Ponctualité", phrase: () => "d'une grande ponctualité" },
  { label: "Sens du contact", phrase: (g) => `${g("doté", "dotée")} d'un excellent sens du contact` },
  { label: "Autonomie", phrase: () => "autonome dans l'exécution de mes missions" },
  { label: "Capacité d'adaptation", phrase: (g) => `${g("prompt", "prompte")} à m'adapter aux situations nouvelles` },
  { label: "Dynamisme", phrase: () => "dynamique dans tout ce que j'entreprends" },
  { label: "Honnêteté", phrase: () => "d'une honnêteté irréprochable" },
  { label: "Discrétion", phrase: (g) => `${g("discret", "discrète")} dans le traitement des informations confidentielles` },
  { label: "Créativité", phrase: (g) => `${g("créatif", "créative")} dans la recherche de solutions` },
  { label: "Résistance au stress", phrase: (g) => `${g("résistant", "résistante")} au stress` },
];

/** Typed variants recognised as one of the QUALITIES (keys folded: lower-case, no accents). */
export const QUALITY_ALIASES: Record<string, string> = {
  "rigueur": "Rigueur", "rigoureux": "Rigueur", "rigoureuse": "Rigueur",
  "sens de l'organisation": "Sens de l'organisation", "organisation": "Sens de l'organisation",
  "organise": "Sens de l'organisation", "organisee": "Sens de l'organisation", "methodique": "Sens de l'organisation",
  "esprit d'equipe": "Esprit d'équipe", "travail en equipe": "Esprit d'équipe",
  "ponctualite": "Ponctualité", "ponctuel": "Ponctualité", "ponctuelle": "Ponctualité",
  "sens du contact": "Sens du contact", "contact": "Sens du contact",
  "autonomie": "Autonomie", "autonome": "Autonomie",
  "capacite d'adaptation": "Capacité d'adaptation", "adaptation": "Capacité d'adaptation",
  "adaptabilite": "Capacité d'adaptation", "adaptable": "Capacité d'adaptation",
  "dynamisme": "Dynamisme", "dynamique": "Dynamisme",
  "honnetete": "Honnêteté", "honnete": "Honnêteté",
  "discretion": "Discrétion", "discret": "Discrétion", "discrete": "Discrétion",
  "creativite": "Créativité", "creatif": "Créativité", "creative": "Créativité",
  "resistance au stress": "Résistance au stress", "resistant au stress": "Résistance au stress",
  "resistante au stress": "Résistance au stress", "gestion du stress": "Résistance au stress",
};

/** Qualities added when the customer chose fewer than two (soft skills typical of the trade). */
export const DEFAULT_QUALITIES: Record<Sector, string[]> = {
  commerce: ["Sens du contact", "Dynamisme", "Honnêteté"],
  comptabilite: ["Rigueur", "Discrétion", "Sens de l'organisation"],
  informatique: ["Autonomie", "Rigueur", "Capacité d'adaptation"],
  sante: ["Rigueur", "Résistance au stress", "Discrétion"],
  enseignement: ["Sens de l'organisation", "Capacité d'adaptation", "Dynamisme"],
  administration: ["Sens de l'organisation", "Discrétion", "Rigueur"],
  btp: ["Rigueur", "Esprit d'équipe", "Résistance au stress"],
  hotellerie: ["Sens du contact", "Ponctualité", "Résistance au stress"],
  logistique: ["Ponctualité", "Rigueur", "Honnêteté"],
  communication: ["Créativité", "Dynamisme", "Sens du contact"],
  agriculture: ["Dynamisme", "Capacité d'adaptation", "Esprit d'équipe"],
  securite: ["Ponctualité", "Honnêteté", "Discrétion"],
  autre: ["Rigueur", "Esprit d'équipe", "Dynamisme"],
};

// ---------------------------------------------------------------------------
// Shared phrasing helpers
// ---------------------------------------------------------------------------

const senior = (c: Ctx) => c.level === "confirme" || c.level === "senior";
const skillList = (c: Ctx) => joinList(c.skills);

/** What the candidate applies for, without article: "poste de comptable", "stage en comptabilité". */
export function wanted(c: Ctx): string {
  if (c.kind === "stage") return c.stageNoun;
  if (c.kind === "alternance") return `${c.posteNoun} en alternance`;
  return c.posteNoun;
}

/**
 * Latest experience as a clause starting with a lower-case verb.
 * style 0: "j'occupe depuis 2023 le poste de …"; style 1: "j'ai exercé en tant que …".
 */
export function expClause(c: Ctx, style: 0 | 1, opts: { span: boolean; notamment: boolean }): string {
  const e = c.exp!;
  const span = opts.span ? e.span : "";
  const nb = opts.notamment ? " notamment" : "";
  if (e.internship) {
    return e.current ? `j'effectue actuellement un ${e.title}${e.at}` : `j'ai${nb} effectué un ${e.title}${e.at}${span}`;
  }
  if (e.current) {
    const when = span || " actuellement";
    return style === 0 ? `j'occupe${when} le poste ${de(e.title)}${e.at}` : `j'exerce${when} ${enTantQue(e.title)}${e.at}`;
  }
  return style === 0
    ? `j'ai${nb} occupé le poste ${de(e.title)}${e.at}${span}`
    : `j'ai${nb} exercé ${enTantQue(e.title)}${e.at}${span}`;
}

/** "Mon expérience de caissière chez Auchan m'a permis de" / "Mon poste actuel de … me permet de". */
function expSubject(c: Ctx, span: boolean): { subject: string; verb: string } {
  const e = c.exp!;
  const s = span ? e.span : "";
  if (e.internship) {
    return e.current
      ? { subject: `Le ${e.title} que j'effectue actuellement${e.at}`, verb: "me permet" }
      : { subject: `Mon ${e.title}${e.at}${s}`, verb: "m'a permis" };
  }
  return e.current
    ? { subject: `Mon poste actuel ${de(e.title)}${e.at}`, verb: "me permet" }
    : { subject: `Mon expérience ${de(e.title)}${e.at}${s}`, verb: "m'a permis" };
}

// ---------------------------------------------------------------------------
// CV profile: intro (who) + asset (experience or skills) + aim (what is sought)
// ---------------------------------------------------------------------------

export const PROFILE_INTRO: Record<Level, Variant[]> = {
  debutant: [
    (c) => c.degree && `${c.degree.lead}, je suis ${c.g("motivé", "motivée")} à l'idée de faire mes premiers pas dans ${c.field}`,
    (c) => c.degree?.linked && `${c.degree.lead}, je souhaite mettre mes connaissances en pratique dans ${c.field}`,
    (c) =>
      c.degree &&
      `${c.degree.lead}, ${c.g("sérieux", "sérieuse")} et ${c.g("désireux", "désireuse")} d'apprendre, je nourris un vif intérêt pour ${c.field}`,
    (c) => !c.degree && `Jeune et ${c.g("motivé", "motivée")}, je souhaite faire mes premiers pas dans ${c.domain}`,
    (c) =>
      !c.degree &&
      `${c.g("Sérieux", "Sérieuse")} et ${c.g("désireux", "désireuse")} d'apprendre, je nourris un vif intérêt pour ${c.field}`,
    (c) => !c.degree && `${c.g("Motivé", "Motivée")} et volontaire, je souhaite démarrer ma carrière dans ${c.domain}`,
  ],
  junior: [
    (c) =>
      c.expCount > 0 &&
      `${c.g("Fort", "Forte")} d'une première expérience dans ${c.domain}, je suis ${c.g("un professionnel motivé", "une professionnelle motivée")} et ${c.g("rapidement opérationnel", "rapidement opérationnelle")}`,
    (c) => c.degree?.linked && `${c.degree.lead}, je dispose de bases solides dans ${c.field}`,
    (c) => `${c.g("Jeune professionnel", "Jeune professionnelle")} dynamique, je souhaite consolider mon parcours dans ${c.domain}`,
    (c) =>
      c.expCount > 0 &&
      `${c.expCount > 1 ? "Mes premières expériences" : "Ma première expérience"} dans ${c.domain} ${c.expCount > 1 ? "m'ont" : "m'a"} permis de développer rigueur et sens des responsabilités`,
    (c) => `${c.g("Professionnel motivé", "Professionnelle motivée")} en début de carrière, j'ai à cœur de progresser dans ${c.domain}`,
  ],
  confirme: [
    (c) => `${c.g("Professionnel confirmé", "Professionnelle confirmée")} dans ${c.domain}, je dispose d'une expérience solide et variée`,
    (c) => `${c.g("Fort", "Forte")} d'une solide expérience dans ${c.domain}, je maîtrise les exigences du métier ${de(c.role)}`,
    (c) =>
      c.expCount > 0 &&
      `${c.g("Expérimenté", "Expérimentée")} et ${c.g("polyvalent", "polyvalente")}, j'ai consolidé mes compétences au fil de mon parcours dans ${c.domain}`,
    (c) => c.degree && `${c.degree.lead}, j'ai développé au fil de mon parcours une réelle maîtrise du métier ${de(c.role)}`,
  ],
  senior: [
    (c) => `${c.g("Professionnel expérimenté", "Professionnelle expérimentée")}, je justifie d'un parcours riche dans ${c.domain}`,
    (c) => `Riche de nombreuses années d'expérience dans ${c.domain}, j'ai acquis une vision globale du métier ${de(c.role)}`,
    (c) => `${c.g("Fort", "Forte")} d'une longue expérience dans ${c.domain}, je sais conjuguer expertise métier et sens des responsabilités`,
    (c) => c.degree && `${c.degree.lead}, je cumule une longue expérience dans ${c.field}`,
  ],
};

export const PROFILE_EXPERIENCE: Variant[] = [
  (c) => c.exp && expClause(c, 0, { span: false, notamment: true }),
  (c) => c.exp && expClause(c, 1, { span: false, notamment: true }),
  (c) => {
    if (!c.exp) return null;
    const { subject, verb } = expSubject(c, false);
    return `${subject} ${verb} de développer ${c.skills.length ? `des compétences en ${skillList(c)}` : c.expGain}`;
  },
];

export const PROFILE_SKILLS: Variant[] = [
  (c) => c.skills.length > 0 && `Je dispose de compétences en ${skillList(c)}`,
  (c) => c.skills.length > 0 && `Mes points forts : ${skillList(c)}`,
  (c) => {
    if (!c.skills.length) return null;
    if (c.level !== "debutant") return `J'ai développé de solides compétences en ${skillList(c)}`;
    return c.degree
      ? `Ma formation m'a permis d'acquérir des compétences en ${skillList(c)}`
      : `J'ai acquis des compétences en ${skillList(c)}`;
  },
];

export const PROFILE_AIM: Record<JobKind, Variant[]> = {
  emploi: [
    (c) =>
      c.level === "debutant"
        ? `Je suis à la recherche d'un premier emploi ${enTantQue(c.role)}`
        : `Je suis à la recherche d'un ${c.posteNoun} au sein d'une structure où je pourrai m'investir pleinement`,
    (c) =>
      c.level === "debutant"
        ? `Je souhaite aujourd'hui mettre mon énergie et mes connaissances au service ${de(c.org)} ${enTantQue(c.role)}`
        : `Je souhaite aujourd'hui mettre mes compétences au service ${de(c.org)} ${enTantQue(c.role)}`,
    (c) => `Mon objectif : contribuer efficacement à la réussite ${de(c.org)} ${enTantQue(c.role)}`,
    (c) => senior(c) && `Je souhaite désormais mettre mon expertise au service d'une structure ambitieuse ${enTantQue(c.role)}`,
  ],
  stage: [
    (c) => `Je recherche aujourd'hui un ${c.stageNoun} afin de découvrir concrètement ${c.practice}`,
    (c) => `Je souhaite effectuer un ${c.stageNoun} pour compléter ma formation par une expérience de terrain`,
    (c) => `Mon objectif : obtenir un ${c.stageNoun} qui me permettra de progresser au sein d'une équipe professionnelle`,
  ],
  alternance: [
    (c) =>
      `Je recherche une entreprise d'accueil pour une alternance ${enTantQue(c.role)}, afin d'allier formation théorique et pratique professionnelle`,
    (c) => `Je souhaite intégrer une entreprise en alternance ${enTantQue(c.role)} pour consolider mes connaissances sur le terrain`,
    (c) => `Mon objectif : trouver une alternance ${enTantQue(c.role)} afin de me former au plus près des réalités du métier`,
  ],
};

// ---------------------------------------------------------------------------
// Lettre de motivation
// ---------------------------------------------------------------------------

/** P1, first sentence, when the customer saw an advert (`source.text` = "sur LinkedIn"). */
export const LETTRE_OPEN_ADVERT: Variant[] = [
  (c) =>
    `Suite à votre annonce parue ${c.source!.text}, j'ai l'honneur de vous soumettre ma candidature ${applyAdvert(c)} au sein ${de(c.company)}`,
  (c) =>
    `Ayant pris connaissance de votre annonce parue ${c.source!.text}, je me permets de vous adresser ma candidature ${applyAdvert(c)} au sein ${de(c.company)}`,
  (c) => `En réponse à votre annonce parue ${c.source!.text}, je vous propose ma candidature ${applyAdvert(c)} au sein ${de(c.company)}`,
  (c) =>
    `C'est avec un vif intérêt que j'ai découvert votre annonce parue ${c.source!.text} et que je vous adresse ma candidature ${applyAdvert(c)} au sein ${de(c.company)}`,
];

/** P1, first sentence, when someone recommended the company (`source.text` = "d'un ami"). */
export const LETTRE_OPEN_REFERRAL: Variant[] = [
  (c) => `Sur les conseils ${c.source!.text}, je me permets de vous adresser ma candidature ${applyOpen(c)} au sein ${de(c.company)}`,
  (c) => `Sur la recommandation ${c.source!.text}, j'ai l'honneur de vous soumettre ma candidature ${applyOpen(c)} au sein ${de(c.company)}`,
  (c) =>
    `C'est sur les conseils ${c.source!.text} que je vous adresse aujourd'hui ma candidature ${applyOpen(c)} au sein ${de(c.company)}`,
];

/** P1, first sentence, spontaneous application (no source given). */
export const LETTRE_OPEN_SPONTANEOUS: Variant[] = [
  (c) => `Vivement ${c.g("intéressé", "intéressée")} par ${c.company}, je me permets de vous adresser ma candidature spontanée ${applyOpen(c)}`,
  (c) => `J'ai l'honneur de solliciter de votre haute bienveillance un ${wanted(c)} au sein ${de(c.company)}`,
  (c) => `Par la présente, je vous adresse ma candidature spontanée ${applyOpen(c)} au sein ${de(c.company)}`,
  (c) => `${c.g("Désireux", "Désireuse")} de rejoindre ${c.company}, je vous soumets ma candidature spontanée ${applyOpen(c)}`,
];

/** "au poste de comptable" (advertised position). */
function applyAdvert(c: Ctx): string {
  return c.kind === "stage" ? `pour le ${c.stageNoun}` : `au ${wanted(c)}`;
}

/** "pour un poste de comptable" (open application). */
function applyOpen(c: Ctx): string {
  return `pour un ${wanted(c)}`;
}

/** P1, second sentence: why this application makes sense. */
export const LETTRE_FIT: Record<JobKind, Variant[]> = {
  emploi: [
    (c) =>
      c.degree?.linked
        ? "Ce poste correspond pleinement à ma formation ainsi qu'à mon projet professionnel"
        : "Ce poste correspond pleinement à mon projet professionnel et à mes aspirations",
    (c) => `Je suis ${c.g("convaincu", "convaincue")} de pouvoir contribuer efficacement au bon fonctionnement de votre structure`,
    () => "Rejoindre votre équipe représenterait pour moi une réelle opportunité de m'investir dans un environnement stimulant",
    (c) => senior(c) && `Mon parcours dans ${c.domain} me permettra d'être rapidement ${c.g("opérationnel", "opérationnelle")} à ce poste`,
  ],
  stage: [
    () => "Ce stage représente pour moi une étape essentielle de ma formation",
    () => "À travers ce stage, je souhaite confronter mes connaissances théoriques aux réalités du terrain",
    (c) => `Ce stage serait pour moi l'occasion idéale de découvrir concrètement ${c.practice}`,
  ],
  alternance: [
    () => "Cette alternance me permettrait de concilier formation théorique et expérience concrète en entreprise",
    () => "Ce mode de formation correspond parfaitement à ma volonté d'apprendre au contact de professionnels expérimentés",
    (c) => `Je suis ${c.g("convaincu", "convaincue")} que l'alternance est la meilleure voie pour maîtriser le métier ${de(c.role)}`,
  ],
};

/** P2: latest degree, certificate or school level. Only a linked degree is tied to the target domain. */
export const LETTRE_DEGREE: Variant[] = [
  (c) => {
    const d = c.degree;
    if (!d) return null;
    if (d.status === "level") return `${d.leadFull}, j'ai acquis de bonnes bases générales`;
    if (d.category === "certificate") {
      return `${d.leadFull}, je dispose d'une qualification ${d.linked ? `directement utile dans ${c.field}` : "complémentaire appréciable"}`;
    }
    if (d.category === "secondary") return `${d.leadFull}, j'ai acquis de bonnes bases générales et le goût de l'effort`;
    if (d.status === "ongoing") {
      return `${d.leadFull}, j'acquiers progressivement des bases solides${d.linked ? ` dans ${c.field}` : " et une méthode de travail rigoureuse"}`;
    }
    if (senior(c)) return `${d.leadFull}, j'ai ensuite consolidé ces acquis par une solide expérience de terrain`;
    return `${d.leadFull}, j'ai acquis des bases solides${d.linked ? ` dans ${c.field}` : " et une méthode de travail rigoureuse"}`;
  },
  (c) => {
    const d = c.degree;
    if (!d || d.status === "level") return null;
    if (d.category === "certificate") {
      return `J'ai obtenu ${d.article} ${d.name}${d.where}, une qualification ${d.linked ? `directement utile dans ${c.field}` : "que je saurai mettre à profit"}`;
    }
    if (d.category === "secondary") return `J'ai obtenu ${d.article} ${d.name}${d.where}, qui m'a ${c.g("doté", "dotée")} de solides bases générales`;
    const gained = d.linked ? `des connaissances solides dans ${c.field}` : "rigueur et méthode";
    return d.status === "done"
      ? `J'ai obtenu ${d.article} ${d.name}${d.where}, une formation qui m'a permis d'acquérir ${gained}`
      : `Je poursuis actuellement ${d.article} ${d.name}${d.where}, une formation qui me permet d'acquérir ${gained}`;
  },
  (c) => {
    const d = c.degree;
    if (!d) return null;
    if (d.status === "level") return `Mon parcours scolaire, mené jusqu'au ${d.name}${d.where}, m'a apporté de bonnes bases`;
    if (d.category === "certificate") {
      return `Je suis titulaire ${de(`${d.article} ${d.name}`)}${d.obtainedWhere}, un atout concret ${d.linked ? `pour exercer dans ${c.field}` : "dans l'exercice de mes fonctions"}`;
    }
    if (d.category === "secondary") {
      return `Mon parcours scolaire, sanctionné par ${d.article} ${d.name}${d.where}, m'a apporté de bonnes bases générales`;
    }
    if (d.status === "ongoing") {
      return `${c.g("Inscrit", "Inscrite")} en ${d.name}${d.where}, je consolide chaque jour mes ${d.linked ? `connaissances dans ${c.field}` : "acquis"}`;
    }
    const gained = d.linked ? `de solides connaissances dans ${c.field}` : "de solides capacités d'analyse et d'organisation";
    return `Ma formation, sanctionnée par ${d.article} ${d.name}${d.where}, m'a apporté ${gained}`;
  },
  (c) => {
    const d = c.degree;
    return d?.status === "level" && `J'ai suivi ma scolarité jusqu'au ${d.name}${d.where}, ce qui m'a permis d'acquérir de bonnes bases générales`;
  },
];

/** P2: latest experience. */
export const LETTRE_EXPERIENCE: Variant[] = [
  (c) => c.exp && `Sur le plan professionnel, ${expClause(c, 0, { span: true, notamment: false })}`,
  (c) =>
    c.exp &&
    `${expClause(c, 1, { span: true, notamment: false })}, une expérience qui ${c.exp.current ? "me permet" : "m'a permis"} de développer ${c.expGain}`,
  (c) => {
    if (!c.exp) return null;
    const { subject, verb } = expSubject(c, true);
    const use = senior(c) ? "mettre à profit mon savoir-faire" : "mettre en pratique mes connaissances";
    return `${subject} ${verb} de ${use} et de développer ${c.expGain}`;
  },
];

/** P2: missions of the latest experience, as the customer typed them. */
export const LETTRE_MISSIONS: Variant[] = [
  (c) =>
    !!c.exp?.missions.length &&
    `J'y ${c.exp.current ? "suis" : "étais"} notamment ${c.g("chargé", "chargée")} des missions suivantes : ${joinList(c.exp.missions)}`,
  (c) => !!c.exp?.missions.length && `Parmi mes principales missions : ${joinList(c.exp.missions)}`,
  (c) =>
    !!c.exp?.missions.length &&
    `Mes missions ${c.exp.current ? "comprennent" : "comprenaient"} notamment : ${joinList(c.exp.missions)}`,
];

/** P2: eagerness of a beginner. */
export const LETTRE_BEGINNER: Variant[] = [
  (c) =>
    `Bien que ${c.g("débutant", "débutante")}, je suis ${c.g("prêt", "prête")} à m'investir pleinement et à apprendre rapidement aux côtés de vos équipes`,
  () =>
    "Ce qui me manque encore en expérience, je le compense par une forte motivation, une grande capacité d'apprentissage et le goût du travail bien fait",
  (c) =>
    `Je suis ${c.g("désireux", "désireuse")} de mettre en pratique mes acquis et de progresser au contact de professionnels expérimentés`,
];

/** P2: beginner with neither degree nor experience typed: interest for the trade. */
export const LETTRE_BEGINNER_INTEREST: Variant[] = [
  (c) =>
    `${c.g("Passionné", "Passionnée")} par ${c.domain}, je souhaite aujourd'hui transformer cet intérêt en une véritable expérience professionnelle`,
  (c) => `Mon intérêt pour ${c.domain} m'a naturellement ${c.g("orienté", "orientée")} vers le métier ${de(c.role)}`,
  (c) => `J'ai choisi de m'orienter vers ${c.domain}, un domaine dans lequel je souhaite construire ma carrière`,
];

/** P2: experienced candidate who listed no degree and no experience (lettre-only orders). */
export const LETTRE_BACKGROUND: Variant[] = [
  (c) => {
    const lead = c.level === "senior" ? "longue" : c.level === "confirme" ? "solide" : "première";
    return `${c.g("Fort", "Forte")} d'une ${lead} expérience dans ${c.domain}, je connais les exigences du métier ${de(c.role)}`;
  },
  (c) => `Mon parcours dans ${c.domain} m'a permis de développer ${c.gain}`,
  (c) => `Au fil de mon parcours dans ${c.domain}, j'ai appris à travailler avec rigueur et à m'adapter aux exigences du terrain`,
  (c) => `Je suis ${c.g("habitué", "habituée")} à travailler en autonomie comme en équipe, dans le respect des consignes et des délais`,
];

/** IT tools in brackets: " (Word, Excel, Sage)". */
const itList = (c: Ctx) => `(${c.it.join(", ")})`;

/** P3: skills, each variant with its own way of adding the IT tools. */
export const LETTRE_SKILLS: Variant[] = [
  (c) =>
    c.skills.length > 0 &&
    `Je pourrai mettre à votre service mes compétences en ${skillList(c)}${
      c.it.length ? `, ainsi que ma maîtrise de l'outil informatique ${itList(c)}` : ""
    }`,
  (c) =>
    c.skills.length > 0 &&
    `Je dispose notamment de compétences en ${skillList(c)}${
      c.it.length ? `, et je suis à l'aise avec l'outil informatique ${itList(c)}` : ""
    }`,
  (c) =>
    c.skills.length > 0 &&
    `Vous trouverez en moi ${c.g("un collaborateur compétent", "une collaboratrice compétente")} en ${skillList(c)}${
      c.it.length ? `, à l'aise avec l'outil informatique ${itList(c)}` : ""
    }`,
  (c) =>
    c.skills.length > 0 && c.level !== "debutant" &&
    `Au fil de mon parcours, j'ai développé des compétences en ${skillList(c)}${
      c.it.length ? `, sans oublier la maîtrise de l'outil informatique ${itList(c)}` : ""
    }`,
  (c) =>
    c.skills.length > 0 && c.level === "debutant" && c.degree &&
    `Ma formation m'a permis d'acquérir des compétences en ${skillList(c)}${
      c.it.length ? `, ainsi qu'une bonne maîtrise de l'outil informatique ${itList(c)}` : ""
    }`,
];

/** P3: IT tools, when the customer listed no skills. */
export const LETTRE_IT: Variant[] = [
  (c) => `Je suis à l'aise avec l'outil informatique ${itList(c)}`,
  (c) => `Je maîtrise les outils informatiques courants ${itList(c)}`,
  (c) => `J'utilise au quotidien l'outil informatique ${itList(c)}`,
];

/** P3: lead-in for the list of quality phrases ("Je suis A, B et C"). */
export const LETTRE_QUALITIES: Array<(list: string) => string> = [
  (list) => `Sur le plan personnel, je suis ${list}`,
  (list) => `Sur le plan humain, je suis ${list}`,
  (list) => `Je suis par ailleurs ${list}`,
];

/** P3: interest for the company. */
export const LETTRE_INTEREST: Variant[] = [
  (c) => `Je sais combien ${c.stake} comptent dans notre métier, et c'est dans cet esprit que j'aborde cette candidature`,
  (c) =>
    `Rejoindre ${c.company} représenterait pour moi l'opportunité de contribuer à vos objectifs tout en poursuivant mon développement professionnel`,
  (c) => `C'est avec enthousiasme que je mettrais mon énergie au service ${de(c.company)}`,
  () => "Intégrer votre structure serait pour moi l'occasion de m'investir pleinement dans un environnement exigeant et formateur",
  (c) => `Je serais ${c.g("fier", "fière")} de mettre tout mon engagement au profit ${de(c.company)}`,
  (c) => `Je suis ${c.g("persuadé", "persuadée")} que mon engagement serait un véritable atout pour ${c.company}`,
  () => "Travailler aux côtés de vos équipes serait pour moi une source de motivation supplémentaire",
];

/** P4: availability and interview request. Each variant carries a gender mark. */
export const LETTRE_CLOSE: Variant[] = [
  (c) =>
    `${c.g("Motivé", "Motivée")} et disponible, je me tiens à votre entière disposition pour un entretien afin de vous présenter plus en détail mon parcours`,
  (c) =>
    `Je serais ${c.g("ravi", "ravie")} de vous rencontrer lors d'un entretien afin de vous démontrer ma motivation et ma capacité à m'intégrer rapidement à votre équipe`,
  (c) =>
    `${c.g("Convaincu", "Convaincue")} que mon profil peut répondre à vos attentes, je reste à votre disposition pour un entretien à la date qui vous conviendra`,
  (c) =>
    `Très ${c.g("motivé", "motivée")} à l'idée de rejoindre votre équipe, je souhaiterais vous rencontrer afin d'échanger sur ma candidature`,
];

export const CLOSINGS = [
  "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.",
  "Veuillez agréer, Madame, Monsieur, l'expression de mes sentiments respectueux.",
  "Je vous prie de recevoir, Madame, Monsieur, l'assurance de ma haute considération.",
  "Dans l'attente d'une suite favorable, veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées.",
];

export const DEFAULT_RECIPIENT = "À l'attention du Responsable des Ressources Humaines";
export const SALUTATION = "Madame, Monsieur,";

/**
 * Expressions that should not appear twice in the same document. When a slot's variant would repeat
 * one already used, another variant is preferred.
 */
export const REPEAT_STEMS = [
  "convaincu", "rejoindre", "opportunité", "occasion", "pleinement", "au service", "solide",
  "mettre en pratique", "mes connaissances en pratique", "sens des responsabilités", "travail bien fait",
  "concrètement", "motivé", "m'investir", "exigence", "vif intérêt", "environnement", "au contact",
  "aux côtés", "mon objectif", "compétences", "réelle", "permis de développer", "permet de développer",
  "j'ai l'honneur", "je me permets", "rapidement opérationnel", "par ailleurs", "au sein", "aujourd'hui",
  "mon parcours dans", "votre structure", "à l'aise", "ce domaine", "je souhaite",
];
