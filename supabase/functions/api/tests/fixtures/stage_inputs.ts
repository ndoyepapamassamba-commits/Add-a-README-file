// Seeded random Pack Stage orders shared by the stage_* tests (fixture: registers no test): unicode names,
// 1–5 companies, every internship type, optional fields present or not, reasons written the way students
// write them. stage_validation.test.ts checks that every form passes the real validator.
import type { OrderInput } from "../../lib/types.ts";
import { validateOrderRequest } from "../../lib/validate.ts";

type R = () => number;

/** xorshift32, independent of the generator's own PRNG. */
function rng(seed: number): R {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
const one = <T>(r: R, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const maybe = <T>(r: R, x: T, p = 0.5): T | undefined => (r() < p ? x : undefined);
const some = <T>(r: R, xs: readonly T[], max: number): T[] => {
  const n = Math.floor(r() * (max + 1));
  return [...new Set(Array.from({ length: n }, () => one(r, xs)))];
};

// deno-fmt-ignore
const FIRST_NAMES = [
  "Awa", "ndèye fatou", "MAME DIARRA", "abdou-karim", "El Hadji", "Aïssatou", "Cheikh Tidiane", "Yves", "Zoë",
  "Ñdiaga", "Héloïse", "Seynabou", "Ibrahîma", "Khadija", "n'deye", "Aïda", "Fatoumata Binta", "Ousmane", "Bénédicte",
];
// deno-fmt-ignore
const LAST_NAMES = ["Ndiaye", "DIOP", "fall", "N'Diaye", "Sène", "Bâ", "Ka", "Mbaye", "Guèye", "Diallo", "Sow", "Faye", "Thiaw", "Ngom"];
const PHONES = ["77 123 45 67", "+221 70 000 11 22", "00221781234567", "+33 6 12 34 56 78", "76 555 44 33"];
const CITIES = ["Dakar", "Thiès", "Saint-Louis", "Guédiawaye", "Ziguinchor", "Mbour", "keur massar", "Kaolack"];
// deno-fmt-ignore
const SCHOOLS = [
  "ISM", "Université Cheikh Anta Diop", "UCAD", "ISEP de Thiès", "SUPDECO Dakar", "CESAG", "École Supérieure Polytechnique",
  "Université Gaston Berger", "IAM", "Institut Supérieur d'Informatique", "Lycée technique Delafosse", "BEM Dakar",
];
const LEVELS = ["BTS", "DUT/ISEP", "Licence 1", "Licence 2", "Licence 3", "Licence pro", "Master 1", "Master 2", "Autre"];
// deno-fmt-ignore
const PROGRAMS = [
  "Comptabilité et gestion", "Informatique", "Marketing et communication", "Gestion des ressources humaines",
  "Hôtellerie et restauration", "Génie civil", "Banque-Finance", "Transport et logistique", "Licence en droit des affaires",
  "Agroalimentaire", "Réseaux et télécommunications", "Assistanat de direction", "MIAGE", "Sciences économiques",
];
const TYPES = ["academique", "fin_etudes", "vacances", "perfectionnement"] as const;
const STARTS = ["janvier 2027", "Juillet 2027", "1er juillet 2027", "15/01/2027", "Dès que possible", "octobre", "2027", "avril 2027"];
const ENDS = ["mars 2027", "31 août 2027", "septembre 2027", "fin juin", "2027", "juin 2027"];
const DURATIONS = ["3 mois", "deux mois", "6 semaines", "un mois", "d'une durée de 4 mois", "1 mois et demi", "selon vos besoins"];
// deno-fmt-ignore
const DEPARTMENTS = [
  "Comptabilité", "Service informatique", "Direction financière", "Ressources humaines", "Marketing", "RH",
  "Direction des systèmes d'information", "Restauration", "Logistique", "Audit", "Équipe commerciale", "Juridique",
];
// deno-fmt-ignore
const PROJECTS = [
  "Développement d'une application web de gestion de stock en PHP et MySQL",
  "Réalisation d'une étude de marché sur les jus locaux à Dakar.",
  "Membre du club informatique de l'université : animation d'ateliers d'initiation au code",
  "Bénévole à la Croix-Rouge sénégalaise pendant deux ans",
  "J'ai conçu avec trois camarades une maquette de pont en bois. Elle a supporté 40 kg lors du test.",
  "En groupe, nous avons organisé la journée portes ouvertes du département",
  "Tenue de la comptabilité d'une entreprise fictive sur Sage ; préparation des déclarations de TVA",
  "Mémoire de fin de cycle : la gestion de trésorerie dans les PME de Thiès",
  "Trésorière de l'amicale des étudiants de la filière",
  "CRÉATION D'UN SITE VITRINE POUR UNE BOUTIQUE DE QUARTIER",
];
const SKILLS = ["Saisie comptable", "SYSCOHADA", "Python", "Réseaux", "Accueil des clients", "Excel avancé", "Rédaction", "Négociation", "Gestion de projet"];
const IT = ["Word", "Excel", "PowerPoint", "Internet", "Canva", "Sage", "Messagerie (Gmail, Outlook)", "Linux"];
const QUALITIES = ["Rigueur", "Esprit d'équipe", "Ponctualité", "Autonomie", "Curiosité", "Dynamisme", "Sens de l'écoute", "Discrétion"];
// deno-fmt-ignore
const COMPANIES = [
  "Sonatel", "Orange Sénégal", "Cabinet Diallo Expertise", "Banque Atlantique", "Ecobank", "Groupe Sedima",
  "Hôtel Les Cocotiers", "Port Autonome de Dakar", "La Poste", "Wave Mobile Money", "SENELEC", "Agence Kër Com",
  "Les Ciments du Sahel", "Kirène", "Clinique Pasteur",
];
// Reasons as students type them (no gendered words: the gender test reads the whole letter).
// deno-fmt-ignore
const REASONS = [
  "votre cabinet accompagne de nombreuses PME et je souhaite apprendre la révision des comptes à vos côtés",
  "Parce que vous êtes une référence du numérique au Sénégal et que je veux voir comment travaille une grande équipe.",
  "pour découvrir le fonctionnement d'une banque de détail et le conseil à la clientèle",
  "Afin d'apprendre la gestion de projets d'infrastructure sur le terrain.",
  "J'utilise vos services tous les jours et j'aimerais comprendre comment ils sont construits!!!",
  "VOTRE ENTREPRISE FORME BEAUCOUP DE JEUNES ET JE VEUX EN FAIRE PARTIE",
  "car vos campagnes de communication sont très créatives et parlent aux jeunes",
  "On m'a parlé de la qualité de votre accueil et j'aimerais découvrir le travail en réception.",
  "Votre structure existe depuis 1998 et reste un acteur majeur du secteur à Ziguinchor.",
  "je souhaite travailler dans un environnement exigeant, au contact de professionnels reconnus...",
];
const RECIPIENTS = ["Madame la Directrice des Ressources Humaines", "Monsieur le Chef du service comptable", "madame la responsable des stages"];

/** A random but realistic Pack Stage form (`data`), as the wizard would send it. */
export function randomStageData(seed: number, opts: { companies?: number } = {}): Record<string, unknown> {
  const r = rng(seed * 2246822519 + 3);
  const level = one(r, LEVELS);
  const program = one(r, PROGRAMS);
  const school = one(r, SCHOOLS);
  const nCompanies = opts.companies ?? 1 + Math.floor(r() * 5);
  const projects = some(r, PROJECTS, 4);
  const education = r() < 0.7 ? [{ degree: `${level === "Autre" ? "" : `${level} `}${program}`, school, year: maybe(r, "En cours") }] : [];
  if (r() < 0.4) education.push({ degree: "Baccalauréat série G", school: "Lycée Delafosse", year: "2024" });
  const experiences = r() < 0.3
    ? [{ title: one(r, ["Stage en comptabilité", "Caissier", "Vendeuse", "Animateur de colonie"]), company: maybe(r, "Auchan Sénégal"), start: maybe(r, "2025"), end: maybe(r, "2025"), missions: maybe(r, "Accueil des clients\nEncaissement") }]
    : [];
  if (education.length === 0 && experiences.length === 0 && projects.length === 0) projects.push(PROJECTS[0]);
  const companies = Array.from({ length: nCompanies }, (_, i) => ({
    name: COMPANIES[(Math.floor(r() * COMPANIES.length) + i) % COMPANIES.length],
    city: maybe(r, one(r, ["Dakar", "Diamniadio", "Saly", "Thiès"]), 0.7),
    recipient: maybe(r, one(r, RECIPIENTS), 0.3),
    department: maybe(r, one(r, DEPARTMENTS), 0.4),
    reason: REASONS[(Math.floor(r() * REASONS.length) + i) % REASONS.length],
  }));
  return {
    identity: {
      civility: one(r, ["M", "Mme"] as const),
      firstName: one(r, FIRST_NAMES),
      lastName: one(r, LAST_NAMES),
      phone: one(r, PHONES),
      email: maybe(r, "etudiant.stage@gmail.com"),
      city: one(r, CITIES),
      address: maybe(r, "Parcelles Assainies U15", 0.3),
    },
    education,
    experiences,
    skills: some(r, SKILLS, 5),
    it: some(r, IT, 4),
    languages: [{ name: "Français", level: "Courant" }, { name: "Wolof", level: "Langue maternelle" }],
    interests: some(r, ["Lecture", "Football", "Musique"], 2),
    internship: {
      school,
      program,
      studyLevel: level,
      internshipType: one(r, TYPES),
      start: maybe(r, one(r, STARTS), 0.7),
      end: maybe(r, one(r, ENDS), 0.4),
      durationText: maybe(r, one(r, DURATIONS), 0.6),
      conventionProvided: r() < 0.6,
      department: maybe(r, one(r, DEPARTMENTS), 0.6),
      projects,
      qualities: some(r, QUALITIES, 4),
      channel: one(r, ["email", "whatsapp", "depot"] as const),
      companies,
    },
  };
}

/** The random form, validated (what the generator receives). */
export function randomStageInput(seed: number, opts: { companies?: number } = {}): OrderInput {
  const res = validateOrderRequest({ product: "stage", template: "classique", data: randomStageData(seed, opts) });
  if (!res.ok) throw new Error(`seed ${seed}: ${JSON.stringify(res.fields)}`);
  return res.data;
}
