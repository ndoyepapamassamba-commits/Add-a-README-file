// Copy-editing of typed input (lib/generator/polish.ts): casing of all-lower-case and ALL-CAPS text,
// missing accents, brands, acronyms, degree notations, lists typed in one box, register of free text.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import type { OrderInput } from "../lib/types.ts";
import { isGenericEmployer, polishInput, polishName, polishPhrase, polishRecipient } from "../lib/generator/polish.ts";
import { randomInput } from "./gen_inputs.test.ts";
import { PERSONAS } from "./gen_personas.test.ts";

function order(over: Partial<OrderInput> = {}, letter: Partial<NonNullable<OrderInput["letter"]>> = {}): OrderInput {
  return {
    identity: { civility: "Mme", firstName: "awa", lastName: "fall", phone: "771234567", city: "dakar" },
    target: { jobTitle: "comptable", kind: "emploi", sector: "comptabilite", level: "debutant" },
    education: [],
    experiences: [],
    skills: [],
    it: [],
    languages: [],
    interests: [],
    ...over,
    letter: { company: "orange", qualities: [], ...letter },
  };
}

Deno.test("polish names typed in lower case: Title-Case, function words, acronyms, accents", () => {
  assertEquals(polishName("cabinet ndiaye et freres"), "Cabinet Ndiaye et Frères");
  assertEquals(polishName("hopital regional de ziguinchor"), "Hôpital Régional de Ziguinchor");
  assertEquals(polishName("l'hopital principal"), "L'Hôpital Principal");
  assertEquals(polishName("hôtel de la plage"), "Hôtel de la Plage");
  assertEquals(polishName("keur massar"), "Keur Massar");
  assertEquals(polishName("saint-louis"), "Saint-Louis");
  assertEquals(polishName("parcelles assainies u15"), "Parcelles Assainies U15");
  assertEquals(polishName("ucad"), "UCAD");
  assertEquals(polishName("ism dakar"), "ISM Dakar");
  assertEquals(polishName("sgs securite"), "SGS Sécurité");
  assertEquals(polishName("croix rouge"), "Croix-Rouge");
  assertEquals(polishName("cite keur gorgui"), "Cité Keur Gorgui");
});

Deno.test("polish names typed in capitals; mixed case is the customer's choice and stays", () => {
  assertEquals(polishName("PORT AUTONOME DE DAKAR"), "Port Autonome de Dakar");
  assertEquals(polishName("MINISTERE DE LA SANTE"), "Ministère de la Santé");
  assertEquals(polishName("HLM GRAND YOFF"), "HLM Grand Yoff");
  assertEquals(polishName("SODAGRI"), "SODAGRI", "one word in capitals is an acronym");
  assertEquals(polishName("DAKAR", { place: true }), "Dakar", "but a place name");
  for (const kept of ["Cabinet Diallo & Associés", "Le Groupe Sonatel", "KPMG Sénégal", "CFAO Motors", "Terrou-Bi"]) {
    assertEquals(polishName(kept), kept);
  }
  assertEquals(polishName("Hotel Terrou-Bi"), "Hôtel Terrou-Bi", "accents are restored even in mixed case");
});

Deno.test("polish phrases: capitals typed by accident, accents, compounds, brands, acronyms", () => {
  assertEquals(polishPhrase("SECRETAIRE DE DIRECTION"), "secrétaire de direction");
  assertEquals(polishPhrase("GESTION DE L'AGENDA DU DIRECTEUR"), "gestion de l'agenda du directeur");
  assertEquals(polishPhrase("BTS SECRÉTARIAT BUREAUTIQUE"), "BTS secrétariat bureautique");
  assertEquals(polishPhrase("EXCEL"), "Excel");
  assertEquals(polishPhrase("SYSCOHADA"), "SYSCOHADA");
  assertEquals(polishPhrase("RH"), "RH");
  assertEquals(polishPhrase("electricien batiment"), "électricien bâtiment");
  assertEquals(polishPhrase("Electricien"), "Électricien");
  assertEquals(polishPhrase("aide soignante"), "aide-soignante");
  assertEquals(polishPhrase("diplome d'etat d'infirmier"), "diplôme d'État d'infirmier");
  assertEquals(polishPhrase("gestion des reservations"), "gestion des réservations");
  assertEquals(polishPhrase("soins d'hygiene"), "soins d'hygiène");
  assertEquals(polishPhrase("facebook"), "Facebook");
  assertEquals(polishPhrase("whatsapp"), "WhatsApp");
  assertEquals(polishPhrase("le site de l'anpej"), "le site de l'ANPEJ");
  assertEquals(polishPhrase("une amie infirmiere"), "une amie infirmière");
  assertEquals(polishPhrase("saisie sur word et excel"), "saisie sur Word et Excel");
  assertEquals(polishPhrase("chargé rh"), "chargé RH");
  assertEquals(polishPhrase("niveau 3eme"), "niveau 3e");
  assertEquals(polishPhrase("au senegal"), "au Sénégal");
  // Words whose unaccented spelling is another French word are never "corrected".
  for (const ambiguous of ["marche", "eleve", "cote", "a", "ou", "sage"]) {
    assertEquals(polishPhrase(ambiguous), ambiguous);
  }
  // Text typed with care is left alone.
  for (
    const kept of ["Mise en place d'un ERP (Sage X3)", "Assistante comptable", "Préparation des cours de la 6e à la 3e"]
  ) {
    assertEquals(polishPhrase(kept), kept);
  }
});

Deno.test("polish never rewrites a word typed with an accent (regression: diplômé / diplômés / Diplôme d'État)", () => {
  // The accent table keeps one accented form per unaccented key: applying it to a word that already has an
  // accent turned correct words into other words.
  for (const typed of [
    "Diplômé d'État",
    "Diplôme d'État",
    "Infirmier diplômé d'État",
    "Diplômée d'État de sage-femme",
    "les élèves diplômés",
    "Mentorat de jeunes diplômés",
    "Diplômés en gestion",
    "Agent de sécurité diplômé",
    "Électricité générale",
  ]) {
    assertEquals(polishPhrase(typed), typed, typed);
  }
  // A word with an accent stays as typed, even when another spelling exists in the table.
  assertEquals(polishPhrase("Déja deux ans"), "Déja deux ans");
  assertEquals(polishPhrase("DIPLÔMÉS EN GESTION"), "diplômés en gestion", "capitals lowered, accents kept");
  assertEquals(polishName("les élèves diplômés"), "Les Élèves Diplômés");
  assertEquals(polishName("Hôpital régional"), "Hôpital régional");
  assertEquals(polishRecipient("monsieur le directeur général"), "Monsieur le Directeur général");
  // Words typed with no accent at all are still restored.
  assertEquals(polishPhrase("diplome d'etat"), "diplôme d'État");
  assertEquals(polishPhrase("infirmiere diplomee d'etat"), "infirmière diplômée d'État");
  assertEquals(polishPhrase("jeunes diplomes"), "jeunes diplômes", "unaccented 'diplomes' is the noun");
  assertEquals(polishName("hopital regional"), "Hôpital Régional");
});

Deno.test("polish recipients: civility title capitalised, acronyms, accents", () => {
  assertEquals(polishRecipient("monsieur le directeur general"), "Monsieur le Directeur général");
  assertEquals(
    polishRecipient("MADAME LA DIRECTRICE DES RESSOURCES HUMAINES"),
    "Madame la Directrice des ressources humaines",
  );
  assertEquals(polishRecipient("a l'attention du drh"), "À l'attention du DRH");
  assertEquals(polishRecipient("Monsieur le Directeur des Soins"), "Monsieur le Directeur des Soins");
});

Deno.test("polish degrees: year typed in the degree box, series, licences, acronyms", () => {
  const edu = (degree: string, year?: string) => polishInput(order({ education: [{ degree, year }] })).education[0];
  assertEquals(edu("bac s2 2019"), { degree: "bac S2", year: "2019" });
  assertEquals(edu("bac s2 en 2019"), { degree: "bac S2", year: "2019" });
  assertEquals(edu("BTS comptabilité (2021)"), { degree: "BTS comptabilité", year: "2021" });
  assertEquals(edu("BTS 2019-2021"), { degree: "BTS", year: "2019-2021" });
  assertEquals(edu("Master 2 2019", "2021"), { degree: "Master 2 2019", year: "2021" }, "a typed year wins");
  assertEquals(edu("Licence 3"), { degree: "Licence 3" });
  assertEquals(edu("bfem"), { degree: "BFEM" });
  assertEquals(edu("BAC L"), { degree: "bac L" });
  assertEquals(edu("baccalaureat serie g"), { degree: "baccalauréat série G" });
  assertEquals(edu("permis b"), { degree: "permis B" });
  assertEquals(edu("cap cuisine"), { degree: "CAP cuisine" });
  assertEquals(edu("Capacité en droit"), { degree: "Capacité en droit" });
});

Deno.test("polish lists typed in one box are split; brackets and decimals are not", () => {
  const p = polishInput(order({
    skills: ["vente, prospection, negociation", "Gestion de la caisse (espèces, Wave)", "Tri de 1,5 tonne"],
    it: ["word, excel; powerpoint", "sage", "Messagerie (Gmail, Outlook)"],
  }));
  assertEquals(p.skills, [
    "vente",
    "prospection",
    "négociation",
    "Gestion de la caisse (espèces, Wave)",
    "Tri de 1,5 tonne",
  ]);
  assertEquals(p.it, ["Word", "Excel", "PowerPoint", "Sage", "Messagerie (Gmail, Outlook)"]);
});

Deno.test("polish languages, interests, qualities, motivation register, 'chargé de' agreement", () => {
  const p = polishInput(order(
    {
      target: { jobTitle: "charge de clientele", kind: "emploi", sector: "commerce", level: "junior" },
      languages: [{ name: "francais", level: "Courant" }, { name: "WOLOF", level: "Langue maternelle" }, {
        name: "serere",
        level: "Notions",
      }],
      interests: ["LECTURE", "theatre"],
    },
    {
      qualities: ["serieuse", "PONCTUALITE"],
      motivation: "je veux travailler dans un grand hotel\nj'ai envie d'apprendre",
    },
  ));
  assertEquals(p.target.jobTitle, "chargée de clientèle");
  assertEquals(p.languages.map((l) => l.name), ["Français", "Wolof", "Sérère"]);
  assertEquals(p.interests, ["lecture", "théâtre"]);
  assertEquals(p.letter!.qualities, ["sérieuse", "ponctualité"]);
  assertEquals(p.letter!.motivation, "je souhaite travailler dans un grand hôtel\nje souhaite apprendre");
  const m = order({
    target: { jobTitle: "Chargée de communication", kind: "emploi", sector: "communication", level: "junior" },
  });
  m.identity.civility = "M";
  assertEquals(polishInput(m).target.jobTitle, "Chargé de communication");
});

Deno.test("polish: generic employers are recognised, real business names are not", () => {
  for (
    const generic of [
      "Chantier privé",
      "chantier prive",
      "particulier",
      "Freelance",
      "à mon compte",
      "Boutique de quartier",
    ]
  ) {
    assert(isGenericEmployer(generic), generic);
  }
  for (
    const real of ["Atelier Couture Ndiaye", "Orange", "Boutique Sénégal Mode", "Garage Moderne", "Marché Sandaga"]
  ) {
    assert(!isGenericEmployer(real), real);
  }
  assertEquals(polishName("chantier prive"), "Chantier privé", "a generic employer is not Title-Cased");
});

/** Every string value of `v`, depth first (keys left out: a year moved out of the degree adds a key). */
function values(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(values);
  if (v && typeof v === "object") return Object.values(v).flatMap(values);
  return [];
}

/**
 * Letters and digits of the customer's facts, sorted: equal before and after polishing means no fact was
 * added or dropped (case, accents, spaces, hyphens and list separators aside). Two edits change letters on
 * purpose and are undone first: ordinals ("3eme" → "3e") and the register of free text ("je veux").
 */
function factLetters(o: OrderInput): string {
  const { motivation: _register, ...letter } = o.letter ?? { company: "", qualities: [] };
  const text = values([
    o.identity,
    o.target,
    o.education,
    o.experiences,
    o.skills,
    o.it,
    o.languages,
    o.interests,
    letter,
  ])
    .join(" ")
    .replace(/(\d)\s?(?:e|è|é)me\b/giu, "$1e");
  return [...text.normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase("fr")].sort().join("");
}

Deno.test("polish is pure, idempotent and keeps every fact (300 random orders + personas)", () => {
  const inputs = [...Array.from({ length: 300 }, (_, i) => randomInput(i).input), ...PERSONAS.map((p) => p.input)];
  for (const input of inputs) {
    const before = structuredClone(input);
    const once = polishInput(input);
    assertEquals(input, before, "polishInput must not modify its argument");
    assertEquals(polishInput(once), once, `not idempotent for ${JSON.stringify(input.target)}`);
    assertEquals(factLetters(once), factLetters(input), `letters changed for ${JSON.stringify(input.identity)}`);
  }
});
