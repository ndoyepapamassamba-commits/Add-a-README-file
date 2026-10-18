// Golden samples for the CV Premium: fixtures/samples_premium.md holds the full premium CV of three
// fictional senior personas (banque/finance, télécoms/IT, ONG/gestion de projets), the free preview a
// visitor sees, and a review written as a demanding Dakar recruiter. Persons and employers are invented.
// Regenerate after an intended change, then re-read and update the reviews:
//   TCV_WRITE_SAMPLES=1 deno test -A supabase/functions/api/tests/premium_samples.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import type { CvDoc, OrderInput } from "../lib/types.ts";
import { generateDocument } from "../lib/generator/index.ts";
import { redactDocument } from "../lib/redact.ts";
import { validateOrderRequest } from "../lib/validate.ts";
import { assertClean, assertNoInventedDigits, assertNoInventedNames } from "./fixtures/premium_inputs.ts";

const NOW = new Date("2026-10-18T10:00:00Z");
const SAMPLES_URL = new URL("./fixtures/samples_premium.md", import.meta.url);

interface Persona {
  id: string;
  label: string;
  input: OrderInput;
  /** Review as a demanding Dakar recruiter, written after reading the generated CV below. */
  review: string[];
}

export const PREMIUM_PERSONAS: Persona[] = [
  {
    id: "TCV-PREMIUM1",
    label: "Banque / finance — responsable du contrôle financier (fictive)",
    input: {
      identity: {
        civility: "Mme",
        firstName: "seynabou",
        lastName: "Kane",
        phone: "77 512 30 44",
        email: "seynabou.kane@example.com",
        city: "Dakar",
        address: "Sacré-Cœur 3",
      },
      target: {
        jobTitle: "Responsable contrôle financier et reporting",
        kind: "emploi",
        sector: "comptabilite",
        level: "senior",
      },
      education: [
        { degree: "Master Comptabilité, Contrôle, Audit (CCA)", school: "CESAG", year: "2008" },
        { degree: "Licence en sciences économiques", school: "UCAD", year: "2006" },
      ],
      experiences: [
        {
          title: "Responsable du contrôle financier",
          company: "Banque Kawral du Sénégal",
          place: "Dakar",
          start: "2017",
          end: "aujourd'hui",
          missions:
            "Supervision de la clôture mensuelle et des états réglementaires BCEAO\nPilotage du budget annuel et analyse des écarts par agence\nEncadrement d'une équipe de six contrôleurs\nInterlocutrice des commissaires aux comptes et de la Commission bancaire",
        },
        {
          title: "Contrôleuse de gestion",
          company: "Banque Kawral du Sénégal",
          place: "Dakar",
          start: "2012",
          end: "2017",
          missions:
            "Production du reporting mensuel de la direction générale\nSuivi des frais généraux et du produit net bancaire",
        },
        {
          title: "Auditrice senior",
          company: "Cabinet Ndimbal Audit & Conseil",
          place: "Dakar",
          start: "2008",
          end: "2012",
          missions:
            "Missions d'audit légal de banques et de sociétés d'assurance\nRevue du contrôle interne et rédaction des rapports",
        },
      ],
      skills: ["Contrôle de gestion", "Reporting réglementaire BCEAO", "SYSCOHADA révisé", "Audit interne"],
      it: ["Excel", "Power Query", "Power BI", "SAP"],
      languages: [
        { name: "Français", level: "Courant" },
        { name: "Wolof", level: "Langue maternelle" },
        { name: "Anglais", level: "Bon niveau" },
      ],
      interests: ["Lecture", "Mentorat de jeunes diplômés"],
      premium: {
        headline: "Contrôle financier, reporting réglementaire et pilotage de la performance",
        pitch:
          "Je pilote depuis 2017 la clôture mensuelle, le reporting réglementaire BCEAO et le contrôle budgétaire d'une banque de détail de 40 agences. J'ai structuré une équipe de six contrôleurs et automatisé les rapprochements les plus lourds.",
        keyFigures: [
          { value: "17+", label: "années en banque et en audit" },
          { value: "40", label: "agences suivies par le contrôle budgétaire" },
          { value: "4", label: "jours ouvrés pour clôturer, contre 9 en 2019" },
          { value: "0", label: "réserve des commissaires aux comptes depuis 2020" },
        ],
        domains: [
          { title: "Clôture et consolidation", detail: "Arrêtés mensuels, états BCEAO, rapprochements inter-agences" },
          { title: "Contrôle budgétaire", detail: "Budget des 40 agences, analyse des écarts, revues trimestrielles" },
          { title: "Conformité réglementaire", detail: "Ratios prudentiels, Commission bancaire, SYSCOHADA révisé" },
        ],
        achievements: [
          {
            title: "Clôture en 4 jours",
            detail:
              "Refonte du calendrier de clôture et contrôles automatisés sous Excel et Power Query : délai ramené de 9 à 4 jours ouvrés.",
            tags: ["Clôture", "Power Query", "Excel"],
          },
          {
            title: "Tableau de bord de la direction générale",
            detail:
              "Un tableau de bord mensuel unique (PNB, coût du risque, frais généraux) remplace 7 fichiers dispersés.",
            tags: ["Power BI", "PNB", "Coût du risque"],
          },
          {
            title: "Comptes certifiés sans réserve",
            detail:
              "Préparation des dossiers des commissaires aux comptes : aucune réserve sur les comptes depuis 2020.",
            tags: ["Audit externe", "SYSCOHADA"],
          },
          {
            title: "Formation des équipes d'agence",
            detail: "25 collaborateurs formés aux procédures de caisse et de rapprochement.",
            tags: ["Formation", "Procédures"],
          },
        ],
        skillLevels: [
          { name: "Excel", level: "Expert" },
          { name: "Power Query", level: "Expert" },
          { name: "Power BI", level: "Avancé" },
          { name: "SAP FI", level: "Avancé" },
          { name: "Normes IFRS", level: "Bon" },
          { name: "SQL", level: "Notions" },
        ],
        qualities: ["Rigueur", "Intégrité", "Sens de la pédagogie", "Discrétion"],
        personal: { age: "44", situation: "mariée, trois enfants" },
        accent: "marine",
      },
    },
    review: [
      "Ce qui convainc : l'accroche et les quatre chiffres clés disent le périmètre en cinq secondes (40 agences, clôture en 4 jours, 0 réserve des commissaires aux comptes). C'est ce qu'un DAF ou un DRH de banque cherche, et chaque chiffre vient de la candidate.",
      "Le profil reprend son résumé de deux phrases sans formule creuse ajoutée ; les réalisations sont concrètes et mesurées (9 → 4 jours, 7 fichiers → 1 tableau de bord). Parcours lisible et progressif : audit, contrôle de gestion, responsable.",
      "Citation : c'est la phrase générique de la banque (la candidate n'en a pas saisi). Elle est correcte mais impersonnelle ; le formulaire doit l'inviter à écrire la sienne.",
      "Défaut à corriger avant la vente (correcteur commun `polish.ts`, pas le module Premium) : « jeunes diplômés » devient « jeunes diplômes » dans les centres d'intérêt.",
      "Redondance : Excel, Power Query et Power BI apparaissent à la fois dans les barres de niveau et dans la ligne Informatique ; le rendu devrait masquer les outils déjà présents dans les barres.",
      "L'aperçu gratuit montre l'accroche, les chiffres, les titres des réalisations et le parcours : assez pour juger la qualité, sans livrer le contenu (détails, citation et puces masqués).",
      "Verdict : je convoque en entretien pour un poste de responsable du contrôle financier. Une fois la coquille corrigée, ce CV vaut largement 5 000 FCFA.",
    ],
  },
  {
    id: "TCV-PREMIUM2",
    label: "Télécoms / IT — ingénieur réseaux senior (fictif)",
    input: {
      identity: {
        civility: "M",
        firstName: "Ousmane",
        lastName: "THIAW",
        phone: "+221 76 230 18 90",
        email: "o.thiaw@example.com",
        city: "Thiès",
      },
      target: {
        jobTitle: "Ingénieur réseaux et télécoms senior",
        kind: "emploi",
        sector: "informatique",
        level: "senior",
      },
      education: [
        { degree: "Diplôme d'ingénieur de conception en télécommunications", school: "ESMT", year: "2011" },
        { degree: "Certification ITIL Foundation", year: "2018" },
      ],
      experiences: [
        {
          title: "Chef du service exploitation réseau d'accès",
          company: "Kayor Telecom Services",
          place: "Dakar",
          start: "2019",
          end: "Actuellement",
          missions:
            "- Supervision de l'exploitation des sites radio et fibre de la zone centre\n- Pilotage des prestataires de maintenance et suivi des pénalités\n- Analyse mensuelle des indicateurs de qualité de service\n- Encadrement de 12 ingénieurs et techniciens",
        },
        {
          title: "Ingénieur radio",
          company: "Kayor Telecom Services",
          place: "Thiès",
          start: "2014",
          end: "2019",
          missions: "Optimisation de la couverture 3G et 4G; audits de sites; paramétrage des nouvelles cellules",
        },
        {
          title: "Ingénieur déploiement fibre",
          company: "Sahel Fibre Opérations",
          place: "Dakar",
          start: "2011",
          end: "2014",
          missions: "Recette des liaisons fibre\nSuivi des chantiers de génie civil",
        },
      ],
      skills: ["Optimisation radio", "Supervision réseau", "Gestion des incidents", "Encadrement d'équipes"],
      it: ["Python", "Excel", "Linux", "MapInfo"],
      languages: [
        { name: "Français", level: "Courant" },
        { name: "Wolof", level: "Langue maternelle" },
        { name: "Anglais", level: "Courant" },
      ],
      interests: ["Football", "Électronique"],
      premium: {
        headline: "INGÉNIEUR RÉSEAUX MOBILES ET FIBRE — EXPLOITATION, DÉPLOIEMENT, QUALITÉ DE SERVICE",
        pitch:
          "J'exploite et je fais évoluer des réseaux d'accès radio et fibre à l'échelle nationale. Je pilote les prestataires de déploiement, je garantis la qualité de service et je forme les équipes de maintenance en région.",
        quote: "« Un réseau se juge la nuit d'une panne, pas le jour de l'inauguration »",
        keyFigures: [
          { value: "1 450", label: "sites radio sous ma supervision" },
          { value: "99,8 %", label: "de disponibilité réseau en 2025" },
          { value: "14", label: "régions couvertes" },
          { value: "30+", label: "techniciens formés" },
        ],
        domains: [
          { title: "Réseau d'accès radio", detail: "2G, 3G, 4G : paramétrage, optimisation, audits de couverture" },
          { title: "Fibre optique", detail: "backbone et FTTH : recette, supervision, plans de maintenance" },
          { title: "Exploitation et NOC", detail: "supervision 24/7, gestion des incidents, indicateurs de qualité" },
        ],
        achievements: [
          {
            title: "Déploiement 4G national",
            detail:
              "coordination de 3 prestataires pour la mise en service de 600 sites 4G en 18 mois, dans les délais contractuels",
            tags: ["4G", "Gestion de prestataires", "Recette"],
          },
          {
            title: "Moins de coupures de sites",
            detail:
              "plan de maintenance préventive des groupes électrogènes et des batteries : coupures de sites réduites de 35 %",
            tags: ["Énergie", "Maintenance préventive"],
          },
          {
            title: "Suivi des incidents partagé",
            detail: "tableau de bord commun au NOC et aux équipes terrain pour suivre chaque ticket jusqu'à sa clôture",
            tags: ["Python", "Grafana", "NOC"],
          },
        ],
        skillLevels: [
          { name: "Huawei U2020", level: "Expert" },
          { name: "Fibre optique (OTDR)", level: "Expert" },
          { name: "Ericsson ENM", level: "Avancé" },
          { name: "ITIL", level: "Avancé" },
          { name: "Gestion de projet", level: "Avancé" },
          { name: "python", level: "Bon" },
        ],
        qualities: ["Sang-froid", "Leadership terrain", "Esprit d'équipe", "rigueur"],
        accent: "bordeaux",
      },
    },
    review: [
      "Ce qui convainc : l'accroche tapée tout en majuscules est remise en casse normale sans perdre les sigles (NOC, FTTH, OTDR, ITIL, 4G). Les chiffres clés parlent à un opérateur : 1 450 sites, 99,8 % de disponibilité, 14 régions.",
      "La citation saisie entre guillemets est nettoyée (guillemets retirés, point final ajouté) et reste la sienne ; le profil de deux phrases n'est pas rallongé par une phrase d'objectif.",
      "Réalisations crédibles et chiffrées (600 sites en 18 mois, coupures réduites de 35 %) ; les missions de l'ingénieur radio, séparées par des « ; », deviennent trois puces propres.",
      "Défaut à corriger avant la vente (correcteur commun `polish.ts`) : « Diplôme d'ingénieur » devient « Diplômé d'ingénieur » dans la formation. Un recruteur le voit tout de suite.",
      "Formation affichée dans l'ordre saisi (2011 puis 2018) : un recruteur préfère le plus récent en premier ; le formulaire devrait le conseiller.",
      "En entretien, le candidat devra justifier le 99,8 % de disponibilité : c'est sa donnée, l'outil ne l'invente ni ne l'arrondit.",
      "Verdict : profil fort pour un poste de responsable exploitation chez un opérateur ou un intégrateur ; la présentation est au niveau d'un CV de cabinet.",
    ],
  },
  {
    id: "TCV-PREMIUM3",
    label: "ONG / gestion de projets — coordinatrice de programmes (fictive)",
    input: {
      identity: {
        civility: "Mme",
        firstName: "Coumba",
        lastName: "Dieng",
        phone: "78 640 22 15",
        email: "coumba.dieng@example.com",
        city: "Kaolack",
      },
      target: {
        jobTitle: "Coordinatrice de programmes",
        kind: "emploi",
        sector: "autre",
        level: "confirme",
      },
      education: [
        { degree: "Master en gestion des projets de développement", school: "Université Gaston Berger", year: "2014" },
        { degree: "Licence en sociologie", school: "Université Gaston Berger", year: "2012" },
      ],
      experiences: [
        {
          title: "Coordinatrice de programme nutrition",
          company: "ONG Ndimbal Santé",
          place: "Kaolack",
          start: "2020",
          end: "aujourd'hui",
          missions:
            "Coordination d'une équipe de 9 animateurs et de 60 relais communautaires\nPlanification annuelle et suivi budgétaire du programme\nRapports narratifs et financiers aux bailleurs\nRelations avec le district sanitaire et les communes",
        },
        {
          title: "Chargée de suivi-évaluation",
          company: "Association Niayes Développement",
          place: "Thiès",
          start: "2016",
          end: "2020",
          missions:
            "Conception des outils de collecte; formation des enquêteurs; analyse des données et rédaction des rapports trimestriels",
        },
        {
          title: "Assistante de projet",
          company: "ONG Ndimbal Santé",
          place: "Kaolack",
          start: "2014",
          end: "2016",
        },
      ],
      skills: [
        "Gestion de projet",
        "Suivi-évaluation",
        "Rédaction de rapports pour les bailleurs",
        "Animation communautaire",
      ],
      it: ["Excel", "KoboToolbox", "STATA", "Word"],
      languages: [
        { name: "Français", level: "Courant" },
        { name: "Wolof", level: "Langue maternelle" },
        { name: "Sérère", level: "Courant" },
        { name: "Anglais", level: "Intermédiaire" },
      ],
      interests: ["Bénévolat", "Lecture"],
      premium: {
        headline: "Gestion de projets de développement : suivi-évaluation, bailleurs et partenariats locaux",
        pitch:
          "je coordonne des programmes de santé et de nutrition communautaires, de la conception du cadre logique au rapport final aux bailleurs",
        quote: "Le terrain d'abord : un indicateur n'a de sens que s'il change la vie d'une famille",
        keyFigures: [
          { value: "8", label: "projets coordonnés ou suivis" },
          { value: "3,2 M", label: "d'euros de budgets gérés" },
          { value: "120", label: "villages d'intervention" },
        ],
        domains: [
          { title: "Suivi-évaluation", detail: "Cadres logiques, indicateurs, enquêtes de base et finales" },
          {
            title: "Gestion financière de projets",
            detail: "Budgets bailleurs, rapports financiers, audits de projet",
          },
          { title: "Partenariats", detail: "Services de l'État, collectivités locales, groupements de femmes" },
        ],
        achievements: [
          {
            title: "Programme nutrition dans 120 villages",
            detail:
              "Mise en place de 60 relais communautaires et d'un suivi mensuel de la malnutrition des enfants de moins de 5 ans.",
            tags: ["Nutrition", "Relais communautaires", "KoboToolbox"],
          },
          {
            title: "Enquête finale auprès de 1 800 ménages",
            detail:
              "Conception du questionnaire, formation des enquêteurs et analyse des données pour le rapport final.",
            tags: ["STATA", "KoboToolbox", "Enquête"],
          },
          {
            title: "Audit de projet sans réserve",
            detail: "Procédures d'achats et pièces justificatives conformes aux exigences du bailleur.",
            tags: ["Audit", "Achats"],
          },
          {
            title: "Pérennisation avec les communes",
            detail: "Signature de 4 conventions avec les communes pour la reprise des activités après le projet.",
            tags: ["Collectivités", "Pérennisation"],
          },
        ],
        skillLevels: [
          { name: "Suivi-évaluation", level: "Expert" },
          { name: "KoboToolbox", level: "Expert" },
          { name: "Gestion budgétaire", level: "Avancé" },
          { name: "Excel", level: "Avancé" },
          { name: "STATA", level: "Bon" },
        ],
        qualities: ["Écoute", "Sens de la négociation", "Rigueur", "Résilience"],
        personal: { situation: "célibataire" },
        accent: "foret",
      },
    },
    review: [
      "Ce qui convainc : le résumé d'une phrase, saisi sans majuscule, est remis en forme et complété par une seule phrase d'objectif qui reprend le poste visé, accordée au féminin (« prête », « coordinatrice de programmes »).",
      "La citation personnelle donne le ton « terrain » attendu en ONG ; les trois domaines (suivi-évaluation, gestion financière, partenariats) recoupent les critères habituels des offres de coordination.",
      "Chiffres clés sobres et vérifiables (8 projets, 120 villages). Pour une structure nationale, je conseillerais d'écrire aussi le budget en FCFA dans la légende (« 3,2 M d'euros » seul oblige à convertir).",
      "Le premier poste (assistante de projet, 2014 – 2016) n'a pas de missions : le CV reste propre, sans puce vide, mais une ou deux lignes le rendraient plus utile.",
      "La phrase d'objectif ajoutée (« Je suis prête à relever un nouveau défi… ») reste un peu convenue ; la candidate peut l'éviter en écrivant un résumé de deux phrases.",
      "Détail de finition : « Stata » dans la ligne Informatique (correcteur commun) mais « STATA » dans les barres et les étiquettes ; harmoniser serait plus soigné.",
      "Verdict : CV crédible pour un poste de coordination dans une ONG ou un projet financé par des bailleurs ; le format deux pages la distingue des CV Word habituels.",
    ],
  },
];

const BAR: Record<string, string> = {
  Expert: "██████████",
  "Avancé": "████████░░",
  Bon: "██████░░░░",
  Notions: "████░░░░░░",
};

function renderPremium(cv: CvDoc): string[] {
  const p = cv.premium!;
  const out = [
    `**${cv.fullName}** — ${p.headline}`,
    "",
    `*${cv.title}* · couleur \`${p.accent}\``,
    "",
    cv.contacts.join(" · "),
  ];
  if (p.keyFigures.length) {
    out.push("", "| " + p.keyFigures.map((f) => `**${f.value}**`).join(" | ") + " |");
    out.push("|" + p.keyFigures.map(() => "---").join("|") + "|");
    out.push("| " + p.keyFigures.map((f) => f.label).join(" | ") + " |");
  }
  out.push("", "**Profil**", "", `> *${p.quote}*`, "", cv.profile);
  if (p.domains.length) {
    out.push("");
    for (const d of p.domains) out.push(`- **${d.title}** — ${d.detail}`);
  }
  if (p.achievements.length) {
    out.push("", "**Réalisations**", "");
    for (const a of p.achievements) {
      out.push(
        `- **${a.title}**${a.detail ? ` — ${a.detail}` : ""}${a.tags.length ? ` \`${a.tags.join("` `")}\`` : ""}`,
      );
    }
  }
  if (cv.experiences.length) {
    out.push("", "**Parcours**");
    for (const e of cv.experiences) {
      out.push(
        "",
        `- ${e.period ? `${e.period} · ` : ""}**${e.title}** — ${[e.company, e.place].filter(Boolean).join(" · ")}`,
      );
      for (const b of e.bullets) out.push(`  - ${b}`);
    }
  }
  if (p.skillLevels.length) {
    out.push("", "**Outils & compétences**", "");
    for (const s of p.skillLevels) out.push(`- ${s.name} \`${BAR[s.level] ?? ""}\` ${s.level}`);
  }
  if (cv.skills.length || cv.it.length) {
    out.push("", `Compétences : ${cv.skills.join(", ")} · Informatique : ${cv.it.join(", ")}`);
  }
  if (cv.education.length) {
    out.push("", "**Formation**", "");
    for (const e of cv.education) out.push(`- ${[e.year, e.degree, e.school, e.detail].filter(Boolean).join(" — ")}`);
  }
  out.push("", "**Langues & savoir-être**", "");
  if (cv.languages.length) out.push(`- ${cv.languages.map((l) => `${l.name} (${l.level})`).join(", ")}`);
  if (p.qualities.length) out.push(`- Qualités : ${p.qualities.join(", ")}`);
  for (const l of p.personal) out.push(`- ${l}`);
  if (cv.interests.length) out.push(`- Centres d'intérêt : ${cv.interests.join(", ")}`);
  return out;
}

/** The free preview, as JSON of the premium block plus the masked profile: what a visitor sees before paying. */
function renderPreview(cv: CvDoc): string[] {
  const p = cv.premium!;
  return [
    "```",
    `Profil : ${cv.profile}`,
    `Citation : ${p.quote}`,
    ...p.domains.map((d) => `Domaine : ${d.title} — ${d.detail}`),
    ...p.achievements.map((a) => `Réalisation : ${a.title} — ${a.detail} [${a.tags.join(", ")}]`),
    ...cv.experiences.slice(0, 1).flatMap((e) => e.bullets.map((b) => `Puce : ${b}`)),
    ...p.personal.map((l) => `Personnel : ${l}`),
    "```",
  ];
}

export function renderPremiumSamples(): string {
  const out = [
    "# Teranga CV — exemples de CV Premium (5 000 FCFA)",
    "",
    "Rendu texte du générateur déterministe (sans réécriture IA) pour trois profils seniors **fictifs** :",
    "les personnes, les employeurs et les chiffres sont inventés pour l'exemple. Le rendu visuel « Prestige »",
    "(bandeau, photo, barres, deux pages A4) est fait par `cv/render.js` ; ce fichier montre le contenu.",
    "Fichier produit par `tests/premium_samples.test.ts` ; ne pas modifier à la main.",
    "",
  ];
  PREMIUM_PERSONAS.forEach((persona, i) => {
    const res = validateOrderRequest({ product: "premium", template: "classique", data: persona.input });
    if (!res.ok) throw new Error(`${persona.id}: ${JSON.stringify(res.fields)}`);
    const doc = generateDocument(res.data, "premium", { seed: persona.id, now: NOW });
    const preview = redactDocument(doc);
    out.push(`## ${i + 1}. ${persona.label}`, "", `Graine \`${persona.id}\`, produit \`premium\`.`, "");
    out.push("### CV Premium", "", ...renderPremium(doc.cv!), "");
    out.push("### Aperçu gratuit (parties masquées avant paiement)", "", ...renderPreview(preview.cv!), "");
    out.push("### Relecture d'un recruteur exigeant (Dakar)", "", ...persona.review.map((r) => `- ${r}`), "");
    out.push("---", "");
  });
  return out.join("\n");
}

Deno.test("premium samples: personas are valid, clean and invent nothing", () => {
  for (const persona of PREMIUM_PERSONAS) {
    const res = validateOrderRequest({ product: "premium", template: "classique", data: persona.input });
    assert(res.ok, `${persona.id}: ${JSON.stringify(!res.ok && res.fields)}`);
    const doc = generateDocument(res.data, "premium", { seed: persona.id, now: NOW });
    assertClean(doc, persona.id);
    assertNoInventedDigits(doc, res.data, persona.id);
    assertNoInventedNames(doc, res.data, persona.id);
    assert(persona.review.length >= 4, `${persona.id}: the recruiter review is missing`);
  }
});

Deno.test("premium samples: fixtures/samples_premium.md matches the generator output", async () => {
  const rendered = renderPremiumSamples();
  if (Deno.env.get("TCV_WRITE_SAMPLES") === "1") {
    await Deno.writeTextFile(SAMPLES_URL, rendered);
    return;
  }
  const current = await Deno.readTextFile(SAMPLES_URL).catch(() => "");
  assertEquals(current, rendered, "samples_premium.md is stale: run with TCV_WRITE_SAMPLES=1 and review the diff");
});
