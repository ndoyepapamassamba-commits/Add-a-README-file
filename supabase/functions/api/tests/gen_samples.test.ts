// Golden samples: fixtures/samples.md holds the full rendered CV and lettre of nine personas, so a
// human can read what customers get and any change to the banks shows up in review.
// Regenerate after an intended change: TCV_WRITE_SAMPLES=1 deno test -A supabase/functions/api/tests/gen_samples.test.ts
import { assertEquals } from "jsr:@std/assert@1.0.13";
import type { CvDoc, Document, LettreDoc, OrderInput, Product } from "../lib/types.ts";
import { generateDocument } from "../lib/generator/index.ts";

const NOW = new Date("2026-10-01T10:00:00Z");
const SAMPLES_URL = new URL("./fixtures/samples.md", import.meta.url);

interface Persona {
  id: string;
  label: string;
  product: Product;
  input: OrderInput;
}

export const PERSONAS: Persona[] = [
  {
    id: "TCV-SAMPLE01",
    label: "Débutante en comptabilité qui cherche un stage",
    product: "pack",
    input: {
      identity: {
        civility: "Mme",
        firstName: "awa",
        lastName: "Ndiaye",
        phone: "77 123 45 67",
        email: "awa.ndiaye@gmail.com",
        city: "Dakar",
        address: "Sicap Liberté 6",
      },
      target: { jobTitle: "Assistante comptable", kind: "stage", sector: "comptabilite", level: "debutant" },
      education: [
        { degree: "Licence 3 en Comptabilité (en cours)", school: "ISM", year: "2026" },
        { degree: "Baccalauréat série G", school: "Lycée Delafosse", year: "2023", detail: "Mention Assez bien" },
      ],
      experiences: [],
      skills: ["Saisie comptable", "SYSCOHADA", "Facturation", "Rapprochement bancaire"],
      it: ["Word", "Excel", "Sage"],
      languages: [{ name: "Français", level: "Courant" }, { name: "Wolof", level: "Langue maternelle" }, {
        name: "Anglais",
        level: "Intermédiaire",
      }],
      interests: ["Lecture", "Bénévolat"],
      letter: {
        company: "Cabinet Diallo Expertise",
        source: "LinkedIn",
        qualities: ["Rigueur", "Discrétion", "Sens de l'organisation"],
        motivation: "je souhaite découvrir le métier aux côtés de professionnels exigeants",
      },
    },
  },
  {
    id: "TCV-SAMPLE02",
    label: "Chauffeur-livreur confirmé, candidature spontanée",
    product: "pack",
    input: {
      identity: { civility: "M", firstName: "moussa", lastName: "diop", phone: "+221 70 555 44 33", city: "Thiès" },
      target: { jobTitle: "Chauffeur-livreur", kind: "emploi", sector: "logistique", level: "confirme" },
      education: [{ degree: "Permis poids lourds (C)", school: "Auto-école Thiessoise", year: "2016" }],
      experiences: [
        {
          title: "Chauffeur-livreur",
          company: "Transports Rapides du Cap-Vert",
          place: "Dakar",
          start: "2019",
          end: "aujourd'hui",
          missions:
            "- Livraison des clients à Dakar et Thiès\n- Chargement et déchargement des marchandises;\n• Vérification des bons de livraison\n• Entretien courant du véhicule.",
        },
        { title: "Chauffeur", company: "Boulangerie Jaune", place: "Thiès", start: "2015", end: "2019" },
      ],
      skills: ["Conduite de véhicule", "Respect du Code de la route", "Planification des livraisons"],
      it: [],
      languages: [{ name: "Wolof", level: "Langue maternelle" }, { name: "Français", level: "Bon niveau" }],
      interests: ["Football"],
      letter: { company: "Sen Distribution", qualities: ["Ponctualité", "Honnêteté", "Patience"] },
    },
  },
  {
    id: "TCV-SAMPLE03",
    label: "Infirmière junior",
    product: "pack",
    input: {
      identity: {
        civility: "Mme",
        firstName: "Fatou",
        lastName: "Sarr",
        phone: "76 222 33 44",
        email: "fatou.sarr@yahoo.fr",
        city: "Dakar",
        address: "Parcelles Assainies U15",
      },
      target: { jobTitle: "Infirmière", kind: "emploi", sector: "sante", level: "junior" },
      education: [{ degree: "Diplôme d'État d'infirmier", school: "ENDSS", year: "2022" }],
      experiences: [{
        title: "Infirmière",
        company: "Clinique Al Amine",
        place: "Dakar",
        start: "2022",
        end: "2024",
        missions:
          "Soins aux patients hospitalisés\nPrise des constantes\nTenue des dossiers de soins\nAccueil des familles",
      }],
      skills: ["Soins de base", "Prise de constantes", "Hygiène et asepsie", "Gestion des urgences"],
      it: ["Word", "Internet"],
      languages: [{ name: "Français", level: "Courant" }, { name: "Wolof", level: "Langue maternelle" }, {
        name: "Sérère",
        level: "Courant",
      }],
      interests: ["Bénévolat", "Lecture"],
      letter: {
        company: "Hôpital Principal de Dakar",
        source: "Facebook",
        recipient: "Monsieur le Directeur des Soins",
        qualities: ["Rigueur", "Résistance au stress", "Sens du contact"],
      },
    },
  },
  {
    id: "TCV-SAMPLE04",
    label: "Développeur web junior",
    product: "pack",
    input: {
      identity: {
        civility: "M",
        firstName: "Ibrahima",
        lastName: "Fall",
        phone: "78 444 55 66",
        email: "ibrahima.fall.dev@gmail.com",
        city: "Dakar",
      },
      target: { jobTitle: "Développeur web", kind: "emploi", sector: "informatique", level: "junior" },
      education: [{ degree: "Licence professionnelle en Génie logiciel", school: "UCAD", year: "2024" }],
      experiences: [
        {
          title: "Stage en développement web",
          company: "Sen Digital",
          start: "Mars 2024",
          end: "Août 2024",
          missions: "Développement d'un site vitrine avec Laravel; intégration de maquettes Figma; corrections de bugs",
        },
      ],
      skills: ["HTML/CSS", "JavaScript", "PHP", "Laravel", "MySQL", "Git"],
      it: ["Windows", "Linux", "Figma"],
      languages: [{ name: "Français", level: "Courant" }, { name: "Anglais", level: "Bon niveau" }],
      interests: ["Jeux vidéo", "Football"],
      letter: {
        company: "Wave Mobile Money",
        source: "Senjob",
        qualities: ["Autonomie", "Créativité"],
        motivation: "J'utilise vos services chaque jour et j'aimerais contribuer à les améliorer.",
      },
    },
  },
  {
    id: "TCV-SAMPLE05",
    label: "Commerciale senior recommandée par une connaissance",
    product: "pack",
    input: {
      identity: {
        civility: "Mme",
        firstName: "MAME DIARRA",
        lastName: "Bâ",
        phone: "77 987 65 43",
        email: "mamediarra.ba@gmail.com",
        city: "Dakar",
        address: "Mermoz Pyrotechnie",
      },
      target: { jobTitle: "Responsable commerciale", kind: "emploi", sector: "commerce", level: "senior" },
      education: [{ degree: "Master 2 Marketing", school: "SUPDECO", year: "2011" }],
      experiences: [
        {
          title: "Responsable commerciale",
          company: "Groupe Baobab Distribution",
          start: "2016",
          end: "",
          missions:
            "Encadrement d'une équipe de commerciaux\nNégociation avec les grands comptes\nSuivi des objectifs de vente",
        },
        { title: "Commerciale terrain", company: "Laiterie du Fleuve", start: "2011", end: "2016" },
      ],
      skills: ["Négociation", "Management d'équipe", "Prospection", "Fidélisation client", "Négociation"],
      it: ["Excel", "PowerPoint"],
      languages: [{ name: "Français", level: "Courant" }, { name: "Wolof", level: "Langue maternelle" }, {
        name: "Anglais",
        level: "Courant",
      }],
      interests: ["Vie associative", "Voyages"],
      letter: {
        company: "Les Moulins Sentenac",
        source: "un ancien collègue",
        qualities: ["Dynamisme", "Sens du contact", "Résistance au stress", "Leadership"],
      },
    },
  },
  {
    id: "TCV-SAMPLE06",
    label: "Agent de sécurité confirmé, sans qualités choisies",
    product: "pack",
    input: {
      identity: { civility: "M", firstName: "abdou-karim", lastName: "Sow", phone: "70 111 22 33", city: "Guédiawaye" },
      target: { jobTitle: "Agent de sécurité", kind: "emploi", sector: "securite", level: "confirme" },
      education: [
        { degree: "Attestation de formation en secourisme", school: "Croix-Rouge sénégalaise", year: "2021" },
        { degree: "Niveau Terminale", school: "Lycée de Guédiawaye", year: "2012" },
      ],
      experiences: [{
        title: "Agent de sécurité",
        company: "Teranga Gardiennage",
        start: "2017",
        end: "2024",
        missions: "* Contrôle des accès\n* Rondes de jour et de nuit\n* Rédaction des rapports de poste",
      }],
      skills: ["Surveillance de site", "Contrôle d'accès", "Premiers secours"],
      it: [],
      languages: [{ name: "Wolof", level: "Langue maternelle" }, { name: "Français", level: "Bon niveau" }],
      interests: ["Arts martiaux"],
      letter: { company: "Banque de l'Habitat", companyCity: "Dakar", qualities: [] },
    },
  },
  {
    id: "TCV-SAMPLE07",
    label: "Serveuse débutante en hôtellerie",
    product: "pack",
    input: {
      identity: { civility: "Mme", firstName: "ndèye fatou", lastName: "faye", phone: "77 300 40 50", city: "Mbour" },
      target: { jobTitle: "Serveuse", kind: "emploi", sector: "hotellerie", level: "debutant" },
      education: [{ degree: "CAP Restauration", school: "Centre de formation professionnelle de Saly", year: "2025" }],
      experiences: [{
        title: "Stage en restauration",
        company: "Hôtel Le Lagon Bleu",
        place: "Saly",
        start: "Juin 2025",
        end: "Août 2025",
        missions: "Service en salle\nMise en place des tables\nAccueil des clients",
      }],
      skills: ["Service en salle", "Accueil des clients", "Hygiène alimentaire"],
      it: [],
      languages: [{ name: "Français", level: "Bon niveau" }, { name: "Wolof", level: "Langue maternelle" }, {
        name: "Anglais",
        level: "Notions",
      }],
      interests: ["Cuisine", "Danse"],
      letter: {
        company: "Royal Saly Hôtel",
        source: "le journal Le Soleil",
        qualities: ["Sens du contact", "Ponctualité"],
        motivation: "J'aime accueillir les gens et les mettre à l'aise",
      },
    },
  },
  {
    id: "TCV-SAMPLE08",
    label: "Enseignant de français confirmé",
    product: "pack",
    input: {
      identity: {
        civility: "M",
        firstName: "cheikh tidiane",
        lastName: "Mbaye",
        phone: "77 654 32 10",
        email: "ct.mbaye@gmail.com",
        city: "Thiès",
      },
      target: { jobTitle: "Professeur de français", kind: "emploi", sector: "enseignement", level: "confirme" },
      education: [{ degree: "Licence en Lettres modernes", school: "Université Cheikh Anta Diop", year: "2012" }],
      experiences: [
        {
          title: "Professeur de français",
          company: "Cours Privé Les Pionniers",
          start: "2015",
          end: "En cours",
          missions:
            "Préparation et animation des cours de la 6e à la 3e\nÉvaluation des élèves\nRencontres avec les parents",
        },
        { title: "Enseignant vacataire", company: "Collège Saint-Gabriel", start: "2012", end: "2015" },
      ],
      skills: ["Préparation de cours", "Gestion de classe", "Évaluation des élèves"],
      it: ["Word", "PowerPoint"],
      languages: [{ name: "Français", level: "Courant" }, { name: "Wolof", level: "Langue maternelle" }],
      interests: ["Lecture", "Théâtre"],
      letter: {
        company: "Groupe Scolaire Excellence",
        recipient: "Monsieur le Directeur",
        companyCity: "Thiès",
        source: "votre site internet",
        qualities: ["Sens de l'organisation", "Capacité d'adaptation", "Patience"],
      },
    },
  },
  {
    id: "TCV-SAMPLE09",
    label: "Étudiante en communication qui cherche une alternance (lettre seule)",
    product: "lettre",
    input: {
      identity: {
        civility: "Mme",
        firstName: "Aïssatou",
        lastName: "Diallo",
        phone: "+221 76 808 90 10",
        email: "aissatou.diallo@gmail.com",
        city: "Saint-Louis",
      },
      target: {
        jobTitle: "Assistante community manager",
        kind: "alternance",
        sector: "communication",
        level: "debutant",
      },
      education: [{ degree: "Licence 2 en Communication", school: "Université Gaston Berger", year: "En cours" }],
      experiences: [],
      skills: ["Réseaux sociaux", "Création de visuels"],
      it: ["Canva", "Photoshop"],
      languages: [],
      interests: [],
      letter: { company: "Agence Kër Com", qualities: ["Créativité", "Dynamisme", "Curiosité"] },
    },
  },
];

function renderCv(cv: CvDoc): string[] {
  const out = [`**${cv.fullName}** — ${cv.title}`, "", cv.contacts.join(" · "), "", "**Profil**", "", cv.profile];
  if (cv.experiences.length) {
    out.push("", "**Expériences professionnelles**");
    for (const e of cv.experiences) {
      const head = [e.title, e.company, e.place].filter(Boolean).join(" — ");
      out.push("", `- ${head}${e.period ? ` (${e.period})` : ""}`);
      for (const b of e.bullets) out.push(`  - ${b}`);
    }
  }
  if (cv.education.length) {
    out.push("", "**Formation**", "");
    for (const e of cv.education) out.push(`- ${[e.degree, e.school, e.year, e.detail].filter(Boolean).join(" — ")}`);
  }
  if (cv.skills.length) out.push("", `**Compétences** : ${cv.skills.join(", ")}`);
  if (cv.it.length) out.push("", `**Informatique** : ${cv.it.join(", ")}`);
  if (cv.languages.length) {
    out.push(
      "",
      `**Langues** : ${cv.languages.map((l) => `${l.name} (${l.level})`).join(", ")}`,
    );
  }
  if (cv.interests.length) out.push("", `**Centres d'intérêt** : ${cv.interests.join(", ")}`);
  return out;
}

function renderLettre(l: LettreDoc): string[] {
  return [
    ...l.sender.map((s) => `${s}  `),
    "",
    ...l.recipient.map((s) => `${s}  `),
    "",
    l.placeDate,
    "",
    `**${l.subject}**`,
    "",
    l.salutation,
    "",
    ...l.paragraphs.flatMap((p) => [p, ""]),
    l.closing,
    "",
    l.signature,
  ];
}

export function renderSamples(): string {
  const out = [
    "# Teranga CV — exemples de documents générés",
    "",
    "Rendu texte du générateur déterministe (sans réécriture IA) pour neuf profils fictifs.",
    "Fichier produit par `tests/gen_samples.test.ts` ; ne pas modifier à la main.",
    "",
  ];
  PERSONAS.forEach((p, i) => {
    const doc: Document = generateDocument(p.input, p.product, { seed: p.id, now: NOW });
    out.push(`## ${i + 1}. ${p.label}`, "", `Graine \`${p.id}\`, produit \`${p.product}\`.`, "");
    if (doc.cv) out.push("### CV", "", ...renderCv(doc.cv), "");
    if (doc.lettre) out.push("### Lettre de motivation", "", ...renderLettre(doc.lettre), "");
    out.push("---", "");
  });
  return out.join("\n");
}

Deno.test("gen samples: fixtures/samples.md matches the generator output", async () => {
  const rendered = renderSamples();
  if (Deno.env.get("TCV_WRITE_SAMPLES") === "1") {
    await Deno.writeTextFile(SAMPLES_URL, rendered);
    return;
  }
  const current = await Deno.readTextFile(SAMPLES_URL).catch(() => "");
  assertEquals(current, rendered, "samples.md is stale: run with TCV_WRITE_SAMPLES=1 and review the diff");
});
