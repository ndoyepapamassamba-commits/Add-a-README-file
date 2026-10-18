// Document generator: fuzz invariants, determinism, variety, no invented facts, gender agreement,
// elision and the CV / lettre layout rules from SPEC.md.
import { assert, assertEquals, assertMatch, assertNotEquals, assertThrows } from "jsr:@std/assert@1.0.13";
import type { Document, OrderInput, Product } from "../lib/types.ts";
import { formatSnMobile } from "../lib/phone.ts";
import { formatPeriod, generateDocument } from "../lib/generator/index.ts";
import {
  CLOSINGS,
  LETTRE_BEGINNER,
  LETTRE_BEGINNER_INTEREST,
  LETTRE_BACKGROUND,
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
  LETTRE_SKILLS,
  PROFILE_AIM,
  PROFILE_EXPERIENCE,
  PROFILE_INTRO,
  PROFILE_SKILLS,
  QUALITIES,
  SECTORS,
} from "../lib/generator/banks.ts";
import { validateOrderRequest } from "../lib/validate.ts";
import { randomInput } from "./gen_inputs.test.ts";

const NOW = new Date("2026-10-01T09:30:00Z");

/** Every string of a document, with a path for error messages. */
function strings(doc: Document): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") out.push([path, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${i}`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(doc, "doc");
  return out;
}

/** `w` as a whole word: no letter before it, and none after it when it ends with a letter. */
const word = (w: string, flags = "u") =>
  new RegExp(`(?<!\\p{L})${w}${/\p{L}$/u.test(w) ? "(?!\\p{L})" : ""}`, flags);

/** "de assistant", "que il", "le hôtel", "de hygiène": an elision is missing. */
const MISSING_ELISION =
  /(?<!\p{L})(de|que|je|le|la) (?:[aeiouéèêàâîôûœ]|y(?![aeiouéèêy])|h(?:ôt|ôp|yg|ydr|abit|ist|uman|orai|onn|éberg|ui))/iu;

/** Typographic invariants every generated string must satisfy. */
function assertClean(doc: Document, ctx: string) {
  for (const [path, s] of strings(doc)) {
    const where = `${ctx} ${path}: ${JSON.stringify(s)}`;
    assertEquals(s, s.trim(), `not trimmed — ${where}`);
    assert(!/\b(undefined|null|NaN)\b/.test(s), `undefined/null/NaN — ${where}`);
    assert(!/ {2}/.test(s), `double space — ${where}`);
    assert(!/\s[,.]/.test(s), `space before , or . — ${where}`);
    assert(!/\(\s*\)/.test(s), `empty () — ${where}`);
    assert(!/(?<!\.)\.\.(?!\.)|,,|,\./.test(s), `doubled punctuation — ${where}`);
    assertEquals((s.match(/"/g) ?? []).length % 2, 0, `unbalanced " — ${where}`);
    assertEquals((s.match(/«/g) ?? []).length, (s.match(/»/g) ?? []).length, `unbalanced « » — ${where}`);
    assertEquals((s.match(/\(/g) ?? []).length, (s.match(/\)/g) ?? []).length, `unbalanced () — ${where}`);
    assert(!/\n/.test(s), `newline — ${where}`);
    assert(!MISSING_ELISION.test(s), `missing elision — ${where}`);
    assert(!/(?<!\p{L})d' /u.test(s), `dangling elision — ${where}`);
  }
}

/** Digit runs of the output must exist in the input (the phone may be reformatted; placeDate is exempt). */
function assertNoInventedDigits(doc: Document, input: OrderInput, ctx: string) {
  const allowed = new Set(`${JSON.stringify(input)} ${formatSnMobile(input.identity.phone)}`.match(/\d+/g) ?? []);
  for (const [path, s] of strings(doc)) {
    if (path.endsWith(".placeDate")) continue;
    for (const d of s.match(/\d+/g) ?? []) assert(allowed.has(d), `${ctx} ${path}: invented number ${d} in ${JSON.stringify(s)}`);
  }
}

/** Capitalised words that do not start a sentence must come from the input (no invented names). */
const BANK_PROPER_WORDS = new Set(["madame", "monsieur", "responsable", "ressources", "humaines"]);
function assertNoInventedNames(doc: Document, input: OrderInput, ctx: string) {
  const known = new Set(
    (JSON.stringify(input).match(/\p{L}[\p{L}'’-]*/gu) ?? []).map((w) => w.toLocaleLowerCase("fr")),
  );
  for (const [path, s] of strings(doc)) {
    for (const sentence of s.split(/(?<=[.!?:;—])\s+/)) {
      for (const w of (sentence.match(/\p{L}[\p{L}'’-]*/gu) ?? []).slice(1)) {
        if (!/^\p{Lu}/u.test(w)) continue;
        const key = w.toLocaleLowerCase("fr");
        const bare = key.replace(/^\p{L}['’]/u, "");
        assert(
          known.has(key) || known.has(bare) || BANK_PROPER_WORDS.has(key),
          `${ctx} ${path}: "${w}" is not in the input — ${JSON.stringify(s)}`,
        );
      }
    }
  }
}

const sentenceCount = (s: string) => (s.match(/[.!?](?=\s|$)/g) ?? []).length;

Deno.test("gen fixtures: every random input is accepted by the real form validator", () => {
  for (let i = 0; i < 300; i++) {
    const { input, product } = randomInput(i);
    const res = validateOrderRequest({ product, template: "classique", data: input });
    assert(res.ok, `seed ${i}: ${JSON.stringify(!res.ok && res.fields)}`);
  }
});

Deno.test("gen test helpers detect the faults they look for", () => {
  assert(MISSING_ELISION.test("poste de assistant") && MISSING_ELISION.test("de hôtesse") && MISSING_ELISION.test("de Yves"));
  assert(!MISSING_ELISION.test("de Yacine") && !MISSING_ELISION.test("de haut niveau") && !MISSING_ELISION.test("d'hôtesse"));
  assert(word("motivé").test("je suis motivé, et") && !word("motivé").test("je suis motivée"));
  assert(word("Fort d'").test("Fort d'une") && !word("Fort d'").test("Forte d'une"));

  const { input } = randomInput(1);
  const doc = generateDocument(input, "pack", { seed: "H", now: NOW });
  const tampered = structuredClone(doc);
  tampered.lettre!.paragraphs[1] = "J'ai travaillé chez Totalenergies pendant des années.";
  assertThrows(() => assertNoInventedNames(tampered, input, "tampered"));
  tampered.lettre!.paragraphs[1] = "J'ai augmenté les ventes de 37 %.";
  assertThrows(() => assertNoInventedDigits(tampered, input, "tampered"));
  tampered.lettre!.paragraphs[1] = "Une phrase  avec un double espace.";
  assertThrows(() => assertClean(tampered, "tampered"));
});

Deno.test("gen fuzz: 240 random orders satisfy every invariant", () => {
  for (let i = 0; i < 240; i++) {
    const { input, product } = randomInput(i);
    const seed = `TCV-FUZZ${i}`;
    const now = new Date(NOW.getTime() + i * 86_400_000);
    const ctx = `seed ${i} (${product}, ${input.target.kind}/${input.target.level}/${input.target.sector})`;
    const doc = generateDocument(input, product, { seed, now });

    assertEquals(doc, generateDocument(structuredClone(input), product, { seed, now }), `${ctx}: not deterministic`);
    assertEquals(doc.cv === null, product === "lettre", `${ctx}: cv presence`);
    assertEquals(doc.lettre === null, product === "cv", `${ctx}: lettre presence`);
    assertClean(doc, ctx);
    assertNoInventedDigits(doc, input, ctx);
    assertNoInventedNames(doc, input, ctx);

    if (doc.cv) {
      const cv = doc.cv;
      assertMatch(cv.fullName, /^\p{Lu}[\p{L}'’ -]* [\p{Lu}'’ -]+$/u, ctx);
      assertEquals(cv.contacts[0], formatSnMobile(input.identity.phone), ctx);
      assertEquals(cv.experiences.length, input.experiences.length, ctx);
      assertEquals(cv.education.length, input.education.length, ctx);
      const n = sentenceCount(cv.profile);
      assert(n >= 2 && n <= 3, `${ctx}: profile has ${n} sentences: ${cv.profile}`);
      for (const e of cv.experiences) {
        assert(e.bullets.length <= 6, ctx);
        for (const b of e.bullets) {
          assert(b !== "" && !/\.$/.test(b), `${ctx}: bullet ${JSON.stringify(b)}`);
          assert(!/^\p{Ll}/u.test(b), `${ctx}: bullet not capitalised ${JSON.stringify(b)}`);
        }
      }
      assert(cv.skills.length <= 12, ctx);
      assertEquals(new Set(cv.skills.map((s) => s.toLowerCase())).size, cv.skills.length, `${ctx}: duplicate skills`);
    }
    if (doc.lettre) {
      const l = doc.lettre;
      assertEquals(l.paragraphs.length, 4, ctx);
      for (const p of l.paragraphs) assert(p.length > 40 && /[.!?]$/.test(p), `${ctx}: paragraph ${JSON.stringify(p)}`);
      assertEquals(l.salutation, "Madame, Monsieur,");
      assert(CLOSINGS.includes(l.closing), ctx);
      assertMatch(l.placeDate, /^\p{Lu}.*, le (1er|[12]?\d|3[01]) [a-zéû]+ \d{4}$/u, ctx);
      assertEquals(l.signature, l.sender[0], ctx);
      assertEquals(l.recipient[1], input.letter!.company, ctx);
    }
  }
});

Deno.test("gen determinism and variety across seeds", () => {
  const { input } = randomInput(3);
  input.letter!.source = "LinkedIn";
  const docs = Array.from({ length: 50 }, (_, i) => generateDocument(input, "pack", { seed: `TCV-VAR${i}`, now: NOW }));
  const p1 = docs.map((d) => d.lettre!.paragraphs[0]);
  const profiles = docs.map((d) => d.cv!.profile);
  const differentP1 = p1.filter((p) => p !== p1[0]).length;
  const differentProfiles = profiles.filter((p) => p !== profiles[0]).length;
  assert(differentP1 >= 15, `only ${differentP1}/49 seeds changed the first paragraph`);
  assert(differentProfiles >= 15, `only ${differentProfiles}/49 seeds changed the profile`);
  assert(new Set(p1).size >= 6, `only ${new Set(p1).size} distinct first paragraphs`);
  assertEquals(docs[7], generateDocument(input, "pack", { seed: "TCV-VAR7", now: NOW }));
});

Deno.test("gen banks: at least 3 variants per slot, 13 sectors, exact quality labels, no digits", () => {
  const slots: Record<string, unknown[]> = {
    LETTRE_OPEN_ADVERT, LETTRE_OPEN_REFERRAL, LETTRE_OPEN_SPONTANEOUS, LETTRE_DEGREE, LETTRE_EXPERIENCE,
    LETTRE_MISSIONS, LETTRE_BEGINNER, LETTRE_BEGINNER_INTEREST, LETTRE_BACKGROUND, LETTRE_SKILLS, LETTRE_IT,
    LETTRE_QUALITIES, LETTRE_INTEREST, LETTRE_CLOSE, PROFILE_EXPERIENCE, PROFILE_SKILLS, CLOSINGS,
  };
  for (const [k, v] of Object.entries(PROFILE_INTRO)) slots[`PROFILE_INTRO.${k}`] = v;
  for (const [k, v] of Object.entries(PROFILE_AIM)) slots[`PROFILE_AIM.${k}`] = v;
  for (const [k, v] of Object.entries(LETTRE_FIT)) slots[`LETTRE_FIT.${k}`] = v;
  for (const [name, variants] of Object.entries(slots)) assert(variants.length >= 3, `${name} has ${variants.length} variants`);

  assertEquals(Object.keys(SECTORS).length, 13);
  for (const [key, s] of Object.entries(SECTORS)) {
    assert(s.label && s.domain, key);
    assert(s.skills.length >= 8 && s.skills.length <= 12, `${key}: ${s.skills.length} skills`);
    assert(!/\d/.test(JSON.stringify(s)), `${key} contains a digit`);
  }
  assertEquals(QUALITIES.map((q) => q.label), [
    "Rigueur", "Sens de l'organisation", "Esprit d'équipe", "Ponctualité", "Sens du contact", "Autonomie",
    "Capacité d'adaptation", "Dynamisme", "Honnêteté", "Discrétion", "Créativité", "Résistance au stress",
  ]);
  const g = (m: string, _f: string) => m;
  const f = (_m: string, fem: string) => fem;
  for (const q of QUALITIES) {
    assert(!/\d|\bet\b/.test(q.phrase(g)), q.label);
    assert(q.phrase(f).length > 5, q.label);
  }
  assert(!CLOSINGS.some((c) => /\d/.test(c)));
});

// ---------------------------------------------------------------------------
// Gender agreement
// ---------------------------------------------------------------------------

const MASCULINE = [
  "motivé", "prêt", "convaincu", "intéressé", "désireux", "rigoureux", "ravi", "sérieux", "doté", "inscrit",
  "débutant", "expérimenté", "confirmé", "polyvalent", "opérationnel", "étudiant", "discret", "créatif",
  "résistant", "collaborateur", "compétent", "chargé", "passionné", "orienté", "prompt", "Fort d'",
  "Jeune professionnel", "un professionnel", "Professionnel",
];
const FEMININE = [
  "motivée", "prête", "convaincue", "intéressée", "désireuse", "rigoureuse", "ravie", "sérieuse", "dotée",
  "inscrite", "débutante", "expérimentée", "confirmée", "polyvalente", "opérationnelle", "étudiante", "discrète",
  "créative", "résistante", "collaboratrice", "compétente", "chargée", "passionnée", "orientée", "prompte",
  "Forte d'", "Jeune professionnelle", "une professionnelle", "Professionnelle",
];

function genderInputs(): OrderInput[] {
  const out: OrderInput[] = [];
  for (const kind of ["emploi", "stage", "alternance"] as const) {
    for (const level of ["debutant", "junior", "confirme", "senior"] as const) {
      for (const shape of ["degree", "ongoing", "experience", "internship", "nothing"] as const) {
        out.push({
          identity: { civility: "M", firstName: "Sokhna", lastName: "Diop", phone: "771234567", city: "Dakar" },
          target: { jobTitle: "Comptable", kind, sector: "comptabilite", level },
          education: shape === "degree"
            ? [{ degree: "BTS en comptabilité", school: "ISM", year: "2023" }]
            : shape === "ongoing"
            ? [{ degree: "Licence 3 en gestion", school: "UCAD", year: "En cours" }]
            : [],
          experiences: shape === "experience"
            ? [{ title: "Aide comptable", company: "Cabinet Sall", start: "2022", end: "2024", missions: "Saisie des pièces" }]
            : shape === "internship"
            ? [{ title: "Stage en comptabilité", company: "Cabinet Sall", start: "2024", end: "2024" }]
            : [],
          skills: ["Saisie comptable", "Facturation"],
          it: ["Excel"],
          languages: [],
          interests: [],
          letter: {
            company: "Orange",
            qualities: ["Rigueur", "Discrétion", "Créativité", "Résistance au stress"],
          },
        });
      }
    }
  }
  return out;
}

function docText(doc: Document): string {
  return strings(doc).map(([, s]) => s).join(" \n ");
}

Deno.test("gen gender agreement: Mme ⇒ feminine forms only, M ⇒ masculine forms only", () => {
  let femMotivee = 0;
  let mascMotive = 0;
  for (const base of genderInputs()) {
    for (let s = 0; s < 8; s++) {
      for (const civility of ["M", "Mme"] as const) {
        const input = structuredClone(base);
        input.identity.civility = civility;
        const text = docText(generateDocument(input, "pack", { seed: `G${s}`, now: NOW }));
        const forbidden = civility === "Mme" ? MASCULINE : FEMININE;
        for (const w of forbidden) assert(!word(w).test(text), `${civility} ${base.target.kind}/${base.target.level}: "${w}" in ${text}`);
        if (civility === "Mme" && word("motivée").test(text)) femMotivee++;
        if (civility === "M" && word("motivé").test(text)) mascMotive++;
      }
    }
  }
  assert(femMotivee > 20, `"motivée" appeared in only ${femMotivee} documents`);
  assert(mascMotive > 20, `"motivé" appeared in only ${mascMotive} documents`);
});

// ---------------------------------------------------------------------------
// Elision, contractions, facts
// ---------------------------------------------------------------------------

function baseInput(over: Partial<OrderInput["target"]> = {}, letter: Partial<NonNullable<OrderInput["letter"]>> = {}): OrderInput {
  return {
    identity: {
      civility: "Mme", firstName: "ndèye fatou", lastName: "faye", phone: "77 123 45 67", city: "Dakar",
      email: "ndeye.faye@gmail.com",
    },
    target: { jobTitle: "Assistante comptable", kind: "emploi", sector: "comptabilite", level: "junior", ...over },
    education: [{ degree: "BTS en Comptabilité", school: "ISM", year: "2023" }],
    experiences: [{
      title: "Aide comptable", company: "Cabinet Sall", place: "Dakar", start: "2023", end: "aujourd'hui",
      missions: "- saisie des factures.\n* Rapprochements bancaires;• Déclarations fiscales",
    }],
    skills: ["Saisie comptable", "SYSCOHADA", "excel", "Excel"],
    it: ["Word", "Excel"],
    languages: [{ name: "Wolof", level: "Langue maternelle" }],
    interests: ["Lecture"],
    letter: { company: "Orange", qualities: ["Rigueur"], ...letter },
  };
}

function allSeeds(input: OrderInput, product: Product = "pack", n = 40): string {
  return Array.from({ length: n }, (_, i) => docText(generateDocument(input, product, { seed: `E${i}`, now: NOW }))).join("\n");
}

Deno.test("gen elision: poste d'assistante, d'hôtesse, au sein d'Orange, du/des for articles", () => {
  const assistant = allSeeds(baseInput());
  assert(assistant.includes("poste d'assistante comptable"), "poste d'assistante");
  assert(assistant.includes("au sein d'Orange") || assistant.includes("par Orange") || assistant.includes("d'Orange"));
  assert(!/au sein de Orange|de Orange/.test(assistant));

  const hotesse = allSeeds(baseInput({ jobTitle: "Hôtesse d'accueil", sector: "hotellerie", kind: "stage" }));
  assert(hotesse.includes("Demande de stage — Hôtesse d'accueil"));
  assert(hotesse.includes("stage d'hôtesse d'accueil"));
  assert(!/de hôtesse/i.test(hotesse));

  const emploiHotesse = generateDocument(baseInput({ jobTitle: "Hôtesse d'accueil", sector: "hotellerie" }), "lettre", {
    seed: "X",
    now: NOW,
  });
  assertEquals(emploiHotesse.lettre!.subject, "Objet : Candidature au poste d'Hôtesse d'accueil");

  const groupe = allSeeds(baseInput({}, { company: "Le Groupe Sonatel" }));
  assert(groupe.includes("du Groupe Sonatel"));
  assert(!/de Le Groupe/.test(groupe));
  const ciments = allSeeds(baseInput({}, { company: "Les Ciments du Sahel" }));
  assert(ciments.includes("des Ciments du Sahel"));
  assert(!/de Les Ciments/.test(ciments));
});

Deno.test("gen sector 'autre' names the job instead of an unknown sector", () => {
  const text = allSeeds(baseInput({ jobTitle: "Chauffeur", sector: "autre", level: "confirme" }), "pack", 30);
  assert(text.includes("le métier de chauffeur"));
  assert(!text.includes("ce métier"));
});

Deno.test("gen degree already naming the sector is not repeated by the domain phrase", () => {
  const text = allSeeds(baseInput({ level: "debutant" }));
  assert(!/en comptabilité[^.]*, [^.]*dans la comptabilité et la finance/.test(text));
});

Deno.test("gen lettre: source phrasing, qualities, motivation", () => {
  const advert = allSeeds(baseInput({}, { source: "LinkedIn" }), "lettre", 20);
  assert(advert.includes("annonce parue sur LinkedIn"));
  const press = allSeeds(baseInput({}, { source: "le journal Le Soleil" }), "lettre", 20);
  assert(press.includes("annonce parue dans le journal Le Soleil"));
  const referral = allSeeds(baseInput({}, { source: "un ami" }), "lettre", 20);
  assert(referral.includes("d'un ami"));
  assert(!referral.includes("parue"));

  const known = generateDocument(baseInput({}, { qualities: ["Rigueur", "Ponctualité", "Leadership"] }), "lettre", {
    seed: "Q",
    now: NOW,
  }).lettre!.paragraphs[2];
  assert(known.includes("rigoureuse dans mon travail"), known);
  assert(known.includes("d'une grande ponctualité"), known);
  assert(known.includes("preuve de leadership"), known);

  const none = generateDocument(baseInput({}, { qualities: [] }), "lettre", { seed: "Q", now: NOW }).lettre!.paragraphs[2];
  const phrases = QUALITIES.map((q) => q.phrase((_m, f) => f)).filter((p) => none.includes(p));
  assert(phrases.length >= 2, `defaults not applied: ${none}`);

  const motivated = generateDocument(
    baseInput({}, { motivation: "  votre entreprise est une référence au Sénégal\n et je veux apprendre " }),
    "lettre",
    { seed: "M", now: NOW },
  ).lettre!.paragraphs[2];
  assert(motivated.includes("Votre entreprise est une référence au Sénégal et je veux apprendre."), motivated);
});

Deno.test("gen lettre layout: subject per kind, recipient, sender, date", () => {
  const make = (kind: OrderInput["target"]["kind"], letter = {}) =>
    generateDocument(baseInput({ kind }, letter), "lettre", { seed: "L", now: NOW }).lettre!;
  assertEquals(make("emploi").subject, "Objet : Candidature au poste d'Assistante comptable");
  assertEquals(make("stage").subject, "Objet : Demande de stage — Assistante comptable");
  assertEquals(make("alternance").subject, "Objet : Candidature en alternance — Assistante comptable");
  const l = make("emploi", { recipient: "Monsieur le Directeur Général", companyCity: "Diamniadio" });
  assertEquals(l.recipient, ["Monsieur le Directeur Général", "Orange", "Diamniadio"]);
  assertEquals(make("emploi").recipient, ["À l'attention du Responsable des Ressources Humaines", "Orange"]);
  assertEquals(l.sender, ["Ndèye Fatou FAYE", "Dakar", "+221 77 123 45 67", "ndeye.faye@gmail.com"]);
  assertEquals(l.placeDate, "Dakar, le 1er octobre 2026");
  assertEquals(l.salutation, "Madame, Monsieur,");
  assertEquals(l.signature, "Ndèye Fatou FAYE");
  assertEquals(
    generateDocument(baseInput(), "lettre", { seed: "L", now: new Date("2026-02-14T23:59:00Z") }).lettre!.placeDate,
    "Dakar, le 14 février 2026",
  );
});

Deno.test("gen lettre P2 uses the latest degree with its school and the latest experience", () => {
  const input = baseInput();
  input.education.push({ degree: "Baccalauréat série G", school: "Lycée Delafosse", year: "2020" });
  const text = allSeeds(input, "lettre", 30);
  assert(/BTS en comptabilité (obtenu )?à l'ISM/.test(text), "degree + school");
  assert(!text.includes("baccalauréat série G"), "older degree must not be chosen");
  assert(text.includes("aide comptable") && text.includes("au sein du Cabinet Sall"), "latest experience");
});

Deno.test("gen CV layout: name, contacts, period, bullets, skills, product selection", () => {
  const input = baseInput({ kind: "stage" });
  input.identity = { ...input.identity, firstName: "abdou-karim", lastName: "N'Diaye", address: "Sicap Liberté 6" };
  input.identity.civility = "M";
  const doc = generateDocument(input, "cv", { seed: "C", now: NOW });
  assertEquals(doc.lettre, null);
  const cv = doc.cv!;
  assertEquals(cv.fullName, "Abdou-Karim N'DIAYE");
  assertEquals(cv.title, "Assistante comptable");
  assertEquals(cv.contacts, ["+221 77 123 45 67", "ndeye.faye@gmail.com", "Sicap Liberté 6, Dakar"]);
  assertEquals(cv.experiences[0].period, "Depuis 2023");
  assertEquals(cv.experiences[0].bullets, ["Saisie des factures", "Rapprochements bancaires", "Déclarations fiscales"]);
  assertEquals(cv.skills, ["Saisie comptable", "SYSCOHADA", "Excel"]);
  assertEquals(generateDocument(input, "lettre", { seed: "C", now: NOW }).cv, null);
  const pack = generateDocument(input, "pack", { seed: "C", now: NOW });
  assert(pack.cv && pack.lettre);

  const many = baseInput();
  many.skills = Array.from({ length: 20 }, (_, i) => `Compétence ${String.fromCharCode(65 + i)}`);
  many.experiences[0].missions = Array.from({ length: 9 }, (_, i) => `Tâche ${String.fromCharCode(97 + i)}`).join("\n");
  const big = generateDocument(many, "cv", { seed: "C", now: NOW }).cv!;
  assertEquals(big.skills.length, 12);
  assertEquals(big.experiences[0].bullets.length, 6);
  many.experiences[0].missions = undefined;
  assertEquals(generateDocument(many, "cv", { seed: "C", now: NOW }).cv!.experiences[0].bullets, []);
});

Deno.test("gen period formatting", () => {
  assertEquals(formatPeriod("2022", "2024"), "2022 – 2024");
  assertEquals(formatPeriod("2023", ""), "Depuis 2023");
  assertEquals(formatPeriod("2023", undefined), "Depuis 2023");
  for (const end of ["aujourd'hui", "Actuellement", "en cours", "Présent", "now"]) {
    assertEquals(formatPeriod("2023", end), "Depuis 2023");
  }
  assertEquals(formatPeriod("", "2024"), "2024");
  assertEquals(formatPeriod("2024", "2024"), "2024");
  assertEquals(formatPeriod("", ""), "");
  assertEquals(formatPeriod("Janvier 2022", "Mars 2024"), "Janvier 2022 – mars 2024");
  assertEquals(formatPeriod("Septembre 2021", "aujourd'hui"), "Depuis septembre 2021");
});

Deno.test("gen never states an experience, school or year the customer did not type", () => {
  const input = baseInput({ level: "senior" });
  input.education = [];
  input.experiences = [];
  input.skills = [];
  input.it = [];
  const text = allSeeds(input, "pack", 30);
  assert(!/chez |\bobtenu|\bdepuis \d|\ben \d{4}/.test(text), text);
  assertNotEquals(text.length, 0);
});
