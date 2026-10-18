// Seeded random OrderInputs for the generator, redaction and LLM tests, plus a check that they are
// realistic: each one passes the real form validator unchanged in substance.
import { assert } from "jsr:@std/assert@1.0.13";
import type { OrderInput, Product, Sector } from "../lib/types.ts";
import { validateOrderRequest } from "../lib/validate.ts";

/** Small independent PRNG so the fixtures do not depend on the generator's own. */
export function rng(seed: number): () => number {
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

type R = () => number;
const one = <T>(r: R, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const maybe = <T>(r: R, x: T, p = 0.5): T | undefined => (r() < p ? x : undefined);
const some = <T>(r: R, xs: readonly T[], max: number): T[] => {
  const n = Math.floor(r() * (max + 1));
  return Array.from({ length: n }, () => one(r, xs));
};

const FIRST_NAMES = [
  "Awa", "ndèye fatou", "MAME DIARRA", "abdou-karim", "El Hadji", "Aïssatou", "Cheikh Tidiane", "Yves",
  "Ousmane", "Héloïse", "Fatou Bintou", "Seynabou", "Ibrahima", "Khadija", "Pape Malick", "n'deye",
];
const LAST_NAMES = ["Ndiaye", "DIOP", "fall", "N'Diaye", "Sène", "Bâ", "Ka", "Mbaye", "Gueye", "Diallo", "Sow"];
const PHONES = ["77 123 45 67", "+221 70 000 11 22", "00221781234567", "+33 6 12 34 56 78", "76 555 44 33"];
const CITIES = ["Dakar", "Thiès", "Saint-Louis", "Guédiawaye", "Ziguinchor", "Mbour", "keur massar"];
const ADDRESSES = ["Sicap Liberté 6, Villa 12", "Parcelles Assainies U15", "Cité Keur Gorgui", "Dakar Plateau"];
const JOBS = [
  "Assistante comptable", "Comptable", "Hôtesse d'accueil", "Agent de sécurité", "Infirmière", "Développeur web",
  "Chauffeur-livreur", "Commerciale terrain", "Enseignant de français", "Électricien bâtiment",
  "Ingénieur agronome", "Serveuse", "Stage en comptabilité", "Stagiaire RH", "Community manager",
  "Assistant De Direction", "CAISSIÈRE PRINCIPALE", "Technicien en hygiène", "Responsable logistique",
  "Opérateur de saisie", "Yaourtier", "Hydraulicien",
];
const SECTORS: Sector[] = [
  "commerce", "comptabilite", "informatique", "sante", "enseignement", "administration", "btp", "hotellerie",
  "logistique", "communication", "agriculture", "securite", "autre",
];
const DEGREES: OrderInput["education"] = [
  { degree: "BTS en Comptabilité", school: "ISM", year: "2023" },
  { degree: "Licence 3 en Gestion (en cours)", school: "UCAD" },
  { degree: "Baccalauréat série G", school: "Lycée Delafosse", year: "2020" },
  { degree: "Master 2 Marketing", school: "SUPDECO", year: "2021", detail: "Mention Bien" },
  { degree: "Diplôme d'État d'infirmier", school: "ENDSS", year: "2019" },
  { degree: "Niveau Terminale" },
  { degree: "CAP Cuisine", school: "Centre de formation professionnelle de Thiès", year: "Juin 2018" },
  { degree: "DUT Génie civil", school: "École Supérieure Polytechnique", year: "2017" },
  { degree: "Attestation de formation en secourisme", school: "Croix-Rouge sénégalaise", year: "2022" },
  { degree: "Licence professionnelle en hôtellerie", school: "l'Institut Supérieur de Tourisme" },
  { degree: "Bac+2 Informatique", year: "2024-2025" },
  { degree: "Master 1 Finance", school: "Université Cheikh Anta Diop", year: "2027" },
];
const EXP_TITLES = [
  "Caissière", "Stage en comptabilité", "Agent de sécurité", "Chauffeur", "Vendeuse", "Assistant administratif",
  "Serveur", "Enseignant vacataire", "Développeur web freelance", "Aide-soignante", "Technicien réseau",
  "Hôtesse d'accueil",
];
const COMPANIES = [
  "Auchan Sénégal", "Orange", "La Poste", "Le Groupe Sonatel", "Les Ciments du Sahel", "l'Hôpital Principal",
  "Hôtel Terrou-Bi", "Kirène", "Cabinet Diop & Associés", "Ecobank", "Eiffage Sénégal", "Institut Pasteur de Dakar",
];
const DATES = ["2018", "2019", "2020", "2021", "2022", "Janvier 2023", "mars 2024", "", "aujourd'hui", "En cours", "Actuellement"];
const LONG_MISSIONS = Array.from(
  { length: 9 },
  (_, i) =>
    `- Mission ${i + 1} : accompagnement quotidien de l'équipe commerciale dans le suivi des dossiers clients, la préparation des tournées et la mise à jour des fichiers.`,
).join("\n").slice(0, 800);
const MISSIONS = [
  "- Saisie des factures\n- Rapprochements bancaires.",
  "Accueil des clients; encaissement; mise en rayon",
  "• Surveillance du site • Rondes de nuit • Rédaction des rapports.",
  "* Livraison des commandes à Dakar et Thiès\n* Entretien du véhicule",
  "1) Préparation des cours\n2) Évaluation des élèves\n3) Suivi des absences",
  "Gestion de la caisse (espèces et Wave)",
  "  -   accueil   physique et téléphonique  \n\n -  ",
  LONG_MISSIONS,
];
const SKILLS = [
  "Excel", "excel", "Gestion des stocks", "gestion des stocks", "Négociation", "Accueil client", "SYSCOHADA",
  "Permis B", "Travail en équipe", "Prise de parole en public", "Vente", "Service client", "Rédaction de rapports",
  "Saisie comptable", "Sens de l'écoute", "Hygiène et asepsie", "Montage vidéo", "Maçonnerie",
];
const IT = ["Word", "Excel", "PowerPoint", "Internet", "Canva", "Sage", "Messagerie (Gmail, Outlook)"];
const LANGUAGES: OrderInput["languages"] = [
  { name: "Français", level: "Courant" },
  { name: "Wolof", level: "Langue maternelle" },
  { name: "Anglais", level: "Intermédiaire" },
  { name: "pulaar", level: "Courant" },
];
const INTERESTS = ["Lecture", "Football", "Bénévolat", "Musique", "Vie associative"];
const LETTER_COMPANIES = [
  "Orange", "Auchan Sénégal", "Hôtel Terrou-Bi", "La Poste", "Le Groupe Sonatel", "Les Ciments du Sahel",
  "l'Hôpital Principal", "Wave Mobile Money", "Ecobank", "Institut Pasteur de Dakar", "Eiffage Sénégal", "Yoff Services",
];
const SOURCES = [
  "LinkedIn", "Facebook", "un ami", "le journal Le Soleil", "votre site internet", "Emploi Dakar", "Senjob",
  "bouche à oreille", "ma cousine", "Expat-Dakar",
];
const QUALITY_CHOICES = [
  "Rigueur", "Sens de l'organisation", "Esprit d'équipe", "Ponctualité", "Sens du contact", "Autonomie",
  "Capacité d'adaptation", "Dynamisme", "Honnêteté", "Discrétion", "Créativité", "Résistance au stress",
  "Patience", "Leadership", "rigoureux", "Sens de l'écoute",
];
const MOTIVATIONS = [
  "Je souhaite travailler dans une entreprise qui forme ses jeunes.",
  "votre entreprise est une référence au Sénégal",
  "J'aime le contact avec les clients et je veux apprendre",
  "Je veux contribuer à votre croissance\net apprendre chaque jour.",
];

/** A random but realistic order, as validate.ts would hand it to the generator. */
export function randomInput(seed: number): { input: OrderInput; product: Product } {
  const r = rng(seed * 2654435761 + 7);
  const product = one(r, ["cv", "lettre", "pack"] as const);
  const education = some(r, DEGREES, 3).map((d) => ({ ...d }));
  const experiences = Array.from({ length: Math.floor(r() * 4) }, () => ({
    title: one(r, EXP_TITLES),
    company: maybe(r, one(r, COMPANIES), 0.7),
    place: maybe(r, one(r, ["Dakar", "Thiès", "Rufisque"]), 0.4),
    start: maybe(r, one(r, DATES.filter((d) => d && !/aujourd|cours|actuel/i.test(d))), 0.7),
    end: maybe(r, one(r, DATES.filter(Boolean)), 0.6),
    missions: maybe(r, one(r, MISSIONS), 0.7),
  }));
  if (product !== "lettre" && education.length === 0 && experiences.length === 0) education.push({ ...DEGREES[0] });
  const input: OrderInput = {
    identity: {
      civility: one(r, ["M", "Mme"] as const),
      firstName: one(r, FIRST_NAMES),
      lastName: one(r, LAST_NAMES),
      phone: one(r, PHONES),
      email: maybe(r, one(r, ["awa@gmail.com", "contact.pro@yahoo.fr"])),
      city: one(r, CITIES),
      address: maybe(r, one(r, ADDRESSES), 0.4),
    },
    target: {
      jobTitle: one(r, JOBS),
      kind: one(r, ["emploi", "stage", "alternance"] as const),
      sector: one(r, SECTORS),
      level: one(r, ["debutant", "junior", "confirme", "senior"] as const),
    },
    education,
    experiences,
    skills: some(r, SKILLS, 15),
    it: [...new Set(some(r, IT, 5))],
    languages: [...new Map(some(r, LANGUAGES, 3).map((l) => [l.name, l])).values()],
    interests: [...new Set(some(r, INTERESTS, 4))],
    letter: {
      company: one(r, LETTER_COMPANIES),
      recipient: maybe(r, one(r, ["Monsieur le Directeur Général", "Madame la Directrice des Ressources Humaines"]), 0.3),
      companyCity: maybe(r, one(r, ["Dakar", "Diamniadio"]), 0.4),
      source: maybe(r, one(r, SOURCES), 0.6),
      qualities: [...new Set(some(r, QUALITY_CHOICES, 4))],
      motivation: maybe(r, one(r, MOTIVATIONS), 0.4),
    },
  };
  return { input, product };
}

Deno.test("gen fixtures: every random input is accepted by the real form validator", () => {
  for (let i = 0; i < 300; i++) {
    const { input, product } = randomInput(i);
    const res = validateOrderRequest({ product, template: "classique", data: input });
    assert(res.ok, `seed ${i}: ${JSON.stringify(!res.ok && res.fields)}`);
  }
});
