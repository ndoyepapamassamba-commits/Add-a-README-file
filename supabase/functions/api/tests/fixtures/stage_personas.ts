// The four Pack Stage personas of fixtures/samples_stage.md (fixture: registers no test), as the wizard
// sends them; personaInput() returns the validated form the generator receives.
import type { OrderInput } from "../../lib/types.ts";
import { validateOrderRequest } from "../../lib/validate.ts";

export interface Persona {
  id: string;
  label: string;
  /** What the wizard sends (`data`); the samples render the validated form of it. */
  data: Record<string, unknown>;
}

const LANGS = [{ name: "Français", level: "Courant" }, { name: "Wolof", level: "Langue maternelle" }];

export const STAGE_PERSONAS: Persona[] = [
  {
    id: "TCV-STAGE001",
    label: "BTS Comptabilité, stage de fin d'études, 1 entreprise",
    data: {
      identity: {
        civility: "Mme",
        firstName: "fatou",
        lastName: "Sarr",
        phone: "77 456 12 34",
        email: "fatou.sarr@gmail.com",
        city: "Dakar",
        address: "Grand Yoff",
      },
      education: [
        { degree: "BTS Comptabilité et gestion (en cours)", school: "ISM", year: "2027" },
        { degree: "Baccalauréat série G", school: "Lycée Maurice Delafosse", year: "2024" },
      ],
      experiences: [],
      skills: ["Saisie comptable", "SYSCOHADA", "Rapprochement bancaire", "Facturation"],
      it: ["Excel", "Word", "Sage Saari"],
      languages: [...LANGS, { name: "Anglais", level: "Intermédiaire" }],
      interests: ["Lecture", "Vie associative"],
      internship: {
        school: "ISM",
        program: "Comptabilité et gestion",
        studyLevel: "BTS",
        internshipType: "fin_etudes",
        start: "janvier 2027",
        durationText: "3 mois",
        conventionProvided: true,
        department: "Comptabilité",
        projects: ["Tenue complète de la comptabilité d'une entreprise fictive sur Sage, du journal au bilan"],
        qualities: ["Rigueur", "Discrétion", "Ponctualité"],
        channel: "email",
        companies: [{
          name: "Cabinet Diallo Expertise",
          city: "Dakar",
          reason:
            "votre cabinet accompagne de nombreuses PME et je souhaite apprendre la révision des comptes auprès de vos équipes",
        }],
      },
    },
  },
  {
    id: "TCV-STAGE002",
    label: "Licence 3 Informatique, stage académique, 3 entreprises",
    data: {
      identity: {
        civility: "M",
        firstName: "Moussa",
        lastName: "FALL",
        phone: "+221 76 321 54 98",
        email: "moussa.fall@ucad.edu.sn",
        city: "Dakar",
        address: "Parcelles Assainies U17",
      },
      education: [
        { degree: "Licence 3 Informatique", school: "Université Cheikh Anta Diop", year: "En cours" },
        { degree: "Baccalauréat série S2", school: "Lycée Seydou Nourou Tall", year: "2023" },
      ],
      experiences: [],
      skills: ["Développement web", "Bases de données", "Réseaux", "Python"],
      it: ["Linux", "Git", "VS Code"],
      languages: [...LANGS, { name: "Anglais", level: "Bon niveau" }],
      interests: ["Football", "Jeux d'échecs"],
      internship: {
        school: "Université Cheikh Anta Diop",
        program: "Informatique",
        studyLevel: "Licence 3",
        internshipType: "academique",
        start: "juillet 2027",
        end: "septembre 2027",
        durationText: "2 mois",
        conventionProvided: true,
        department: "Informatique",
        projects: [
          "Développement d'une application web de gestion de bibliothèque en PHP et MySQL",
          "Conception d'une base de données pour la gestion des notes d'un lycée",
          "Membre du club informatique de la faculté : animation d'ateliers d'initiation au code",
        ],
        qualities: ["Autonomie", "Esprit d'équipe", "Curiosité"],
        channel: "email",
        companies: [
          {
            name: "Sonatel",
            city: "Dakar",
            department: "Direction des systèmes d'information",
            reason:
              "Sonatel est une référence du numérique au Sénégal et je souhaite découvrir comment une grande DSI gère ses projets et son infrastructure.",
          },
          {
            name: "Wave Mobile Money",
            city: "Dakar",
            reason:
              "J'utilise Wave tous les jours et j'aimerais comprendre comment une application aussi simple est construite et maintenue.",
          },
          {
            name: "Orange Digital Center",
            city: "Dakar",
            recipient: "Madame la Responsable des stages",
            reason:
              "parce que vos formations au code m'ont beaucoup apporté et que je veux contribuer à mon tour à des projets concrets",
          },
        ],
      },
    },
  },
  {
    id: "TCV-STAGE003",
    label: "Master 1 Marketing, stage de perfectionnement, 2 entreprises",
    data: {
      identity: {
        civility: "Mme",
        firstName: "Aïssatou",
        lastName: "Ba",
        phone: "70 987 65 43",
        email: "aissatou.ba@gmail.com",
        city: "Dakar",
        address: "Mermoz",
      },
      education: [
        { degree: "Master 1 Marketing et communication", school: "SUPDECO Dakar", year: "En cours" },
        { degree: "Licence en Marketing", school: "SUPDECO Dakar", year: "2026" },
      ],
      experiences: [{
        title: "Stage en marketing",
        company: "Kirène",
        place: "Dakar",
        start: "juillet 2025",
        end: "septembre 2025",
        missions: "Animation des réseaux sociaux\nÉtude de satisfaction clients\nPréparation de supports promotionnels",
      }],
      skills: ["Marketing digital", "Études de marché", "Community management", "Rédaction de contenus"],
      it: ["Canva", "Excel", "Meta Business Suite"],
      languages: [...LANGS, { name: "Anglais", level: "Courant" }],
      interests: ["Photographie"],
      internship: {
        school: "SUPDECO Dakar",
        program: "Marketing et communication",
        studyLevel: "Master 1",
        internshipType: "perfectionnement",
        start: "Dès que possible",
        durationText: "6 mois",
        conventionProvided: false,
        department: "Marketing",
        projects: ["Étude de marché sur la consommation de jus locaux à Dakar, menée en groupe de cinq étudiants"],
        qualities: ["Créativité", "Sens du contact", "Dynamisme"],
        channel: "whatsapp",
        companies: [
          {
            name: "Groupe Sedima",
            city: "Dakar",
            reason:
              "Votre marque est très présente dans les foyers sénégalais et je veux apprendre à piloter une marque grand public.",
          },
          {
            name: "Agence Kër Com",
            city: "Dakar",
            department: "Communication digitale",
            reason:
              "J'admire les campagnes que vous réalisez pour des marques locales et je souhaite renforcer mes compétences en stratégie digitale.",
          },
        ],
      },
    },
  },
  {
    id: "TCV-STAGE004",
    label: "Étudiante ISEP en hôtellerie, stage de vacances, 2 entreprises",
    data: {
      identity: { civility: "Mme", firstName: "Ndèye Coumba", lastName: "Diop", phone: "78 111 22 33", city: "Thiès" },
      education: [
        { degree: "Hôtellerie et restauration, 1re année", school: "ISEP de Thiès", year: "2026" },
        { degree: "Baccalauréat série L2", school: "Lycée Malick Sy de Thiès", year: "2025" },
      ],
      experiences: [],
      skills: ["Accueil des clients", "Service en salle", "Hygiène alimentaire"],
      it: ["Word", "Internet"],
      languages: [{ name: "Wolof", level: "Langue maternelle" }, { name: "Français", level: "Courant" }, {
        name: "Anglais",
        level: "Notions",
      }],
      interests: ["Cuisine", "Danse"],
      internship: {
        school: "ISEP de Thiès",
        program: "Hôtellerie et restauration",
        studyLevel: "DUT/ISEP",
        internshipType: "vacances",
        start: "1er juillet 2027",
        end: "31 août 2027",
        conventionProvided: true,
        department: "Restauration",
        projects: [
          "Bénévole à l'association des étudiants de l'ISEP : organisation de la journée d'intégration",
          "Préparation d'un repas gastronomique pour 40 invités lors des travaux pratiques",
        ],
        qualities: ["Sens du contact", "Ponctualité"],
        channel: "depot",
        companies: [
          {
            name: "Hôtel Les Cocotiers",
            city: "Saly",
            reason:
              "Votre hôtel accueille beaucoup de clients pendant l'été et je veux apprendre le service en salle dans un établissement exigeant.",
          },
          {
            name: "Lamantin Beach Hôtel",
            city: "Saly",
            recipient: "Monsieur le Directeur",
            department: "Réception",
            reason:
              "On m'a parlé de la qualité de votre accueil et j'aimerais découvrir le travail en réception dans un grand hôtel de la Petite-Côte.",
          },
        ],
      },
    },
  },
];

/** The persona as validate.ts hands it to the generator. */
export function personaInput(p: Persona): OrderInput {
  const res = validateOrderRequest({ product: "stage", template: "classique", data: p.data });
  if (!res.ok) throw new Error(`${p.id}: ${JSON.stringify(res.fields)}`);
  return res.data;
}
