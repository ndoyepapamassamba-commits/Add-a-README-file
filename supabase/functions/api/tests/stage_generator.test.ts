// Pack Stage generator: invariants fuzzed over seeded random student orders (unicode names, 1–5
// companies), determinism, letters that differ between companies, no invented digits or proper nouns,
// gender agreement, the reason kept as typed, and the French helpers (period, duration, department…).
import { assert, assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1.0.13";
import type { Document, OrderInput } from "../lib/types.ts";
import { formatSnMobile } from "../lib/phone.ts";
import { generateDocument } from "../lib/generator/index.ts";
import { CLOSINGS } from "../lib/generator/banks.ts";
import {
  bucketOf,
  cleanReason,
  deptOf,
  diplomaOf,
  lengthOf,
  periodOf,
  stageSector,
  WHATSAPP_MAX,
} from "../lib/generator/stage.ts";
import {
  ENVOI_ATTACHMENTS,
  ENVOI_AVAILABILITY,
  ENVOI_REQUEST,
  STAGE_DEFAULT_RECIPIENT,
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
  type StageCtx,
} from "../lib/generator/stage_banks.ts";
import { genderOf } from "../lib/generator/text.ts";
import { randomStageInput } from "./fixtures/stage_inputs.ts";

const NOW = new Date("2026-10-01T09:30:00Z");
/** Number of fuzzed orders (TCV_FUZZ=5000 for a longer run). */
const FUZZ = Number(Deno.env.get("TCV_FUZZ") ?? "240");

/** Every string of a document, with a path for error messages. */
function strings(doc: Document): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") out.push([path, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${i}`));
    else if (v && typeof v === "object") { for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`); }
  };
  walk(doc, "doc");
  return out;
}

/** Strings split into lines: the e-mail body and the WhatsApp message are the only multi-line texts. */
function lines(doc: Document): Array<[string, string]> {
  return strings(doc).flatMap(([path, s]) =>
    s.split("\n").map((line, i): [string, string] => [s.includes("\n") ? `${path}#${i}` : path, line])
  );
}

const MISSING_ELISION =
  /(?<!\p{L})(de|que|je|le|la) (?:[aeiouéèêàâîôûœ]|y(?![aeiouéèêy])|h(?:ôt|ôp|yg|ydr|abit|ist|uman|orai|onn|éberg|ui))/iu;

function assertClean(doc: Document, input: OrderInput, ctx: string) {
  for (const [path, s] of lines(doc)) {
    const where = `${ctx} ${path}: ${JSON.stringify(s)}`;
    assert(s.length > 0 || path.includes("#") === false, `empty line — ${where}`);
    assertEquals(s, s.trim(), `not trimmed — ${where}`);
    assert(!/\b(undefined|null|NaN)\b|\[object/.test(s), `undefined/null/NaN — ${where}`);
    assert(!/ {2}/.test(s), `double space — ${where}`);
    assert(!/\s[,.]/.test(s), `space before , or . — ${where}`);
    assert(!/\(\s*\)/.test(s), `empty () — ${where}`);
    assert(!/(?<!\.)\.\.(?!\.)|,,|,\.|\.,/.test(s), `doubled punctuation — ${where}`);
    assertEquals((s.match(/\(/g) ?? []).length, (s.match(/\)/g) ?? []).length, `unbalanced () — ${where}`);
    for (const sentence of s.split(/(?<=[.!?])\s+/)) {
      assert((sentence.match(/ : /g) ?? []).length <= 1, `two colons in one sentence — ${where}`);
    }
    assert(!MISSING_ELISION.test(s), `missing elision — ${where}`);
    assert(!/(?<!\p{L})d' /u.test(s), `dangling elision — ${where}`);
    assert(!/█/.test(s), `mask char in a full document — ${where}`);
  }
  // Typed text keeps its own words; the checks above apply to what the generator writes around it.
  void input;
}

/** Digit runs of the output must exist in the input (the phone may be reformatted; placeDate is exempt). */
function assertNoInventedDigits(doc: Document, input: OrderInput, ctx: string) {
  const allowed = new Set(`${JSON.stringify(input)} ${formatSnMobile(input.identity.phone)}`.match(/\d+/g) ?? []);
  for (const [path, s] of strings(doc)) {
    if (path.endsWith(".placeDate")) continue;
    for (const d of s.match(/\d+/g) ?? []) {
      assert(allowed.has(d), `${ctx} ${path}: invented number ${d} in ${JSON.stringify(s)}`);
    }
  }
}

/** Capitalised words that do not start a sentence must come from the input (no invented names). */
const BANK_PROPER_WORDS = new Set(["madame", "monsieur", "directeur", "ressources", "humaines", "cv"]);
function assertNoInventedNames(doc: Document, input: OrderInput, ctx: string) {
  const known = new Set(
    (JSON.stringify(input).match(/\p{L}[\p{L}'’-]*/gu) ?? []).map((w) => w.toLocaleLowerCase("fr")),
  );
  for (const [path, s] of lines(doc)) {
    for (const sentence of s.split(/(?<=[.!?:;—(])\s*/)) {
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
const lettersOf = (s: string) => (s.toLocaleLowerCase("fr").match(/\p{L}{3,}/gu) ?? []);

/** A letter without what is specific to its company, to compare the phrasing of two letters. */
function skeleton(doc: Document, input: OrderInput, i: number): string {
  const co = input.internship!.companies[i];
  let text = doc.lettres![i].paragraphs.join("\n");
  for (const part of [cleanReason(co.reason), co.name, co.department ?? ""].filter(Boolean)) {
    text = text.split(part).join("<X>");
  }
  return text.replace(/(au sein|auprès) [^,.]*/g, "$1 <X>").replace(/m'adresse [^.]*/g, "m'adresse <X>");
}

Deno.test(`stage fuzz: ${FUZZ} random student orders satisfy every invariant`, () => {
  let multi = 0;
  for (let i = 0; i < FUZZ; i++) {
    const input = randomStageInput(i);
    const internship = input.internship!;
    const seed = `TCV-STG${String(i).padStart(5, "0")}`;
    const now = new Date(NOW.getTime() + i * 86_400_000);
    const ctx = `seed ${i} (${internship.internshipType}, ${internship.studyLevel}, ${internship.companies.length} co.)`;
    const doc = generateDocument(input, "stage", { seed, now });

    assertEquals(doc, generateDocument(structuredClone(input), "stage", { seed, now }), `${ctx}: not deterministic`);
    assert(doc.cv, ctx);
    assertEquals(doc.lettre, null, ctx);
    assertEquals(doc.lettres!.length, internship.companies.length, ctx);
    assert(doc.envoi, ctx);
    assertClean(doc, input, ctx);
    assertNoInventedDigits(doc, input, ctx);
    assertNoInventedNames(doc, input, ctx);

    // Student CV.
    const cv = doc.cv!;
    assertMatch(cv.title, input.identity.civility === "Mme" ? /^Étudiante en \S/ : /^Étudiant en \S/, ctx);
    const n = sentenceCount(cv.profile);
    assert(n >= 2 && n <= 3, `${ctx}: profile has ${n} sentences: ${cv.profile}`);
    const typedProjects = internship.projects.filter((p) => /\p{L}/u.test(p));
    assertEquals(cv.experiences.length, input.experiences.length + typedProjects.length, ctx);
    for (const e of cv.experiences.slice(input.experiences.length)) {
      assert(["Projet académique", "Activité associative"].includes(e.title), `${ctx}: ${e.title}`);
      assertEquals(e.company, e.title === "Projet académique" ? internship.school : "", ctx);
      assert(e.bullets.length > 0 && e.bullets.every((b) => !/\.$/.test(b) && !/^\p{Ll}/u.test(b)), ctx);
    }
    assert(cv.education.length >= input.education.length && cv.education.length <= input.education.length + 1, ctx);
    assertEquals(cv.education.slice(cv.education.length - input.education.length).length, input.education.length);

    // One letter per company, in order.
    doc.lettres!.forEach((l, j) => {
      const co = internship.companies[j];
      const lctx = `${ctx} letter ${j}`;
      assertEquals(l.paragraphs.length, 4, lctx);
      for (const p of l.paragraphs) assert(p.length > 40 && /[.!?…]$/.test(p), `${lctx}: paragraph ${JSON.stringify(p)}`);
      assertEquals(l.salutation, "Madame, Monsieur,", lctx);
      assert(CLOSINGS.includes(l.closing), lctx);
      assertMatch(l.placeDate, /^\p{Lu}.*, le (1er|[12]?\d|3[01]) [a-zéû]+ \d{4}$/u, lctx);
      assertEquals(l.signature, l.sender[0], lctx);
      assertEquals(l.signature, cv.fullName, lctx);
      assertEquals(l.recipient[1], co.name, lctx);
      assertEquals(l.recipient[0].toLowerCase(), (co.recipient ?? STAGE_DEFAULT_RECIPIENT).toLowerCase(), lctx);
      assertMatch(l.subject, /^Objet : Demande de stage (académique|de fin d'études|de vacances|de perfectionnement) — \S/, lctx);
      // The reason, cleaned but kept: every word of it is in the third paragraph.
      const p3 = l.paragraphs[2].toLocaleLowerCase("fr");
      for (const w of lettersOf(co.reason)) assert(p3.includes(w), `${lctx}: reason word "${w}" missing from ${p3}`);
      // Convention mentioned only when the school provides it; never an attestation or a promise.
      assertEquals(/convention de stage/.test(l.paragraphs[3]), internship.conventionProvided, lctx);
      const body = l.paragraphs.join(" ");
      assert(!/attestation|garanti|je suis (sûr|certain)|vous m'accepterez|serai retenu/i.test(body), `${lctx}: ${body}`);
      assert(l.paragraphs[0].includes(co.name) || l.paragraphs[0].includes(co.name.replace(/^(le|la|les) /i, "")), lctx);
    });

    // Letters of one order read differently, beyond the company name and reason.
    const skeletons = doc.lettres!.map((_, j) => skeleton(doc, input, j));
    if (skeletons.length > 1) multi++;
    for (let a = 0; a < skeletons.length; a++) {
      for (let b = a + 1; b < skeletons.length; b++) {
        assertNotEquals(skeletons[a], skeletons[b], `${ctx}: letters ${a} and ${b} have the same phrasing`);
      }
    }

    // Sending message.
    const envoi = doc.envoi!;
    assert(envoi.emailSubject.startsWith("Candidature — Stage ") && envoi.emailSubject.endsWith(` — ${cv.fullName}`), ctx);
    const emailLines = envoi.emailBody.split("\n");
    assert(emailLines.length >= 4 && emailLines.length <= 8, `${ctx}: ${emailLines.length} lines`);
    assertEquals(emailLines[0], "Madame, Monsieur,");
    assertEquals(emailLines[emailLines.length - 1], "Pièces jointes : CV, lettre de motivation");
    assert(envoi.emailBody.includes(formatSnMobile(input.identity.phone)), ctx);
    assert([...envoi.whatsapp].length <= WHATSAPP_MAX, `${ctx}: whatsapp too long`);
    assert((envoi.whatsapp.match(/🙏/gu) ?? []).length <= 1, ctx);
    assert(envoi.whatsapp.includes(cv.fullName), ctx);
    for (const co of internship.companies) {
      assert(!envoi.emailBody.includes(cleanReason(co.reason)) && !envoi.whatsapp.includes(cleanReason(co.reason)), ctx);
    }
  }
  assert(multi > FUZZ / 2, `only ${multi} orders had several companies`);
});

Deno.test("stage gender agreement: Mme ⇒ feminine forms only, M ⇒ masculine forms only", () => {
  const masculine = /(?<!\p{L})(étudiant|motivé|investi|ravi|désireux|sérieux|prêt|convaincu|attaché|doté|rigoureux|discret|créatif)(?!\p{L})/iu;
  const feminine = /(?<!\p{L})(étudiante|motivée|investie|ravie|désireuse|sérieuse|prête|convaincue|attachée|dotée|rigoureuse|discrète|créative)(?!\p{L})/iu;
  for (let i = 0; i < Math.round(FUZZ / 2); i++) {
    for (const civility of ["M", "Mme"] as const) {
      const input = randomStageInput(i);
      input.identity.civility = civility;
      input.experiences = []; // experience titles are typed text ("Vendeuse")
      const doc = generateDocument(input, "stage", { seed: `G${i}`, now: NOW });
      const text = strings(doc).filter(([p]) => !/\.(education|experiences|skills|it|interests|languages)\./.test(p))
        .map(([, s]) => s).join("\n");
      const wrong = civility === "Mme" ? masculine.exec(text) : feminine.exec(text);
      assert(!wrong, `seed ${i} ${civility}: "${wrong?.[0]}" in ${text.slice(Math.max(0, (wrong?.index ?? 0) - 80), (wrong?.index ?? 0) + 80)}`);
    }
  }
});

Deno.test("stage letters: 2–5 companies always get letters with different phrasing", () => {
  for (let i = 0; i < Math.round(FUZZ / 2); i++) {
    const companies = 2 + (i % 4);
    const input = randomStageInput(1000 + i, { companies });
    // Same department and same reason everywhere: only the phrasing can differ.
    for (const co of input.internship!.companies) {
      co.department = "Comptabilité";
      co.reason = "Je souhaite apprendre auprès de professionnels reconnus.";
    }
    const doc = generateDocument(input, "stage", { seed: `TCV-DIFF${i}`, now: NOW });
    const skeletons = doc.lettres!.map((_, j) => skeleton(doc, input, j));
    assertEquals(new Set(skeletons).size, companies, `seed ${i}: ${companies} companies, ${new Set(skeletons).size} phrasings`);
  }
});

Deno.test("stage determinism and variety across seeds", () => {
  const input = randomStageInput(3, { companies: 1 });
  const docs = Array.from({ length: 40 }, (_, i) => generateDocument(input, "stage", { seed: `TCV-SV${i}`, now: NOW }));
  const p1 = new Set(docs.map((d) => d.lettres![0].paragraphs[0]));
  const profiles = new Set(docs.map((d) => d.cv!.profile));
  assert(p1.size >= 3, `only ${p1.size} distinct first paragraphs`);
  assert(profiles.size >= 4, `only ${profiles.size} distinct profiles`);
  assertEquals(docs[5], generateDocument(input, "stage", { seed: "TCV-SV5", now: NOW }));
});

Deno.test("stage banks: at least 3 variants per slot, no digits", () => {
  const slots: Record<string, unknown[]> = {
    STAGE_PROFILE_ASSET,
    STAGE_PROFILE_AIM,
    STAGE_P2_SKILLS,
    STAGE_P2_IT,
    STAGE_P2_BASES,
    STAGE_P2_PROJECTS,
    STAGE_P2_ASSOCIATIVE,
    STAGE_P2_QUALITIES,
    STAGE_P3_LEAD,
    STAGE_P4_AVAILABILITY,
    STAGE_P4_CONVENTION,
    STAGE_P4_INTERVIEW,
    ENVOI_REQUEST,
    ENVOI_ATTACHMENTS,
    ENVOI_AVAILABILITY,
  };
  for (const [k, v] of Object.entries(STAGE_PROFILE_INTRO)) slots[`STAGE_PROFILE_INTRO.${k}`] = v;
  for (const [k, v] of Object.entries(STAGE_P1_OPEN)) slots[`STAGE_P1_OPEN.${k}`] = v;
  for (const [k, v] of Object.entries(STAGE_P1_PURPOSE)) slots[`STAGE_P1_PURPOSE.${k}`] = v;
  for (const [name, variants] of Object.entries(slots)) assert(variants.length >= 3, `${name}: ${variants.length}`);
  // Every variant, written for digit-free facts, contains no digit.
  for (const civility of ["M", "Mme"] as const) {
    for (const type of ["academique", "fin_etudes", "vacances", "perfectionnement"] as const) {
      for (const flags of [true, false]) {
        const c: StageCtx = {
          g: genderOf(civility),
          type,
          bucket: "licence",
          student: "étudiante en Licence Gestion",
          diploma: "Licence Gestion",
          at: " à l'ISM",
          inField: "dans ce domaine",
          stageNoun: "stage académique",
          length: flags ? " de trois mois" : "",
          period: flags ? "à partir de janvier" : null,
          practice: "le fonctionnement d'un service comptable",
          skills: flags ? ["saisie comptable", "facturation"] : [],
          it: flags ? ["Excel"] : [],
          hasExperience: flags,
          hasAcademicProjects: flags,
          hasAssociative: !flags,
          dept: flags ? { noun: "service comptabilité", fem: false } : null,
          company: "Sonatel",
          convention: flags,
        };
        const texts = [
          ...Object.values(slots).flat().filter((v) => typeof v === "function" && v.length <= 1)
            .map((v) => (v as (c: StageCtx) => unknown)(c)),
          ...STAGE_P2_PROJECTS.map((f) => f("projet", flags ? 2 : 1)),
          ...STAGE_P2_ASSOCIATIVE.map((f) => f("club", c.g)),
          ...STAGE_P2_QUALITIES.map((f) => f("rigoureuse", flags)),
        ].filter((t): t is string => typeof t === "string");
        assert(texts.length > 40);
        for (const t of texts) assert(!/\d/.test(t), `digit in a bank variant: ${t}`);
      }
    }
  }
});

Deno.test("stage CV: projects become experiences, current studies are added once", () => {
  const input = randomStageInput(11, { companies: 1 });
  const internship = input.internship!;
  internship.school = "ISM";
  internship.studyLevel = "BTS";
  internship.program = "Comptabilité et gestion";
  internship.projects = [
    "Tenue de la comptabilité d'une entreprise fictive. Préparation du bilan.",
    "Membre du club de lecture de l'école",
  ];
  input.education = [];
  input.experiences = [];
  const cv = generateDocument(input, "stage", { seed: "CV1", now: NOW }).cv!;
  assertEquals(cv.education, [{ degree: "BTS Comptabilité et gestion", school: "ISM", year: "", detail: "" }]);
  assertEquals(cv.experiences, [
    {
      title: "Projet académique",
      company: "ISM",
      place: "",
      period: "",
      bullets: ["Tenue de la comptabilité d'une entreprise fictive", "Préparation du bilan"],
    },
    { title: "Activité associative", company: "", place: "", period: "", bullets: ["Membre du club de lecture de l'école"] },
  ]);
  input.education = [{ degree: "BTS en comptabilité (en cours)", school: "ISM" }];
  const again = generateDocument(input, "stage", { seed: "CV1", now: NOW }).cv!;
  assertEquals(again.education.length, 1, "the typed line already names the studies");
  assertEquals(again.title, input.identity.civility === "Mme" ? "Étudiante en BTS Comptabilité et gestion" : "Étudiant en BTS Comptabilité et gestion");
});

Deno.test("stage letter: recipient, subject, department, period and convention", () => {
  const input = randomStageInput(21, { companies: 2 });
  const internship = input.internship!;
  Object.assign(internship, {
    internshipType: "fin_etudes",
    start: "janvier 2027",
    end: "mars 2027",
    durationText: "3 mois",
    department: "Comptabilité",
    conventionProvided: false,
  });
  internship.companies = [
    { name: "Cabinet Diallo Expertise", city: "dakar", reason: "votre cabinet forme ses stagiaires avec exigence" },
    { name: "Sonatel", recipient: "madame la DRH", department: "Direction financière", reason: "parce que vous êtes une référence et que je veux apprendre" },
  ];
  const doc = generateDocument(input, "stage", { seed: "L1", now: NOW });
  const [a, b] = doc.lettres!;
  assertEquals(a.recipient, [STAGE_DEFAULT_RECIPIENT, "Cabinet Diallo Expertise", "Dakar"]);
  assertEquals(b.recipient, ["Madame la DRH", "Sonatel"]);
  assertEquals(a.subject, "Objet : Demande de stage de fin d'études — Comptabilité");
  assertEquals(b.subject, "Objet : Demande de stage de fin d'études — Direction financière");
  assert(a.paragraphs[0].includes("au sein du service comptabilité du Cabinet Diallo Expertise, de janvier à mars 2027"), a.paragraphs[0]);
  assert(a.paragraphs[0].includes("stage de fin d'études de 3 mois"), a.paragraphs[0]);
  assert(b.paragraphs[0].includes("au sein de la direction financière de Sonatel"), b.paragraphs[0]);
  assert(a.paragraphs[2].endsWith("Votre cabinet forme ses stagiaires avec exigence."), a.paragraphs[2]);
  assert(b.paragraphs[2].endsWith("Je m'adresse à vous parce que vous êtes une référence et que je veux apprendre."), b.paragraphs[2]);
  for (const l of doc.lettres!) assert(!/convention/.test(l.paragraphs.join(" ")));
  internship.conventionProvided = true;
  for (const l of generateDocument(input, "stage", { seed: "L1", now: NOW }).lettres!) {
    assertMatch(l.paragraphs[3], /convention de stage/);
  }
});

Deno.test("stage envoi: e-mail layout and a WhatsApp message under 600 characters even with long inputs", () => {
  const input = randomStageInput(31, { companies: 1 });
  input.identity.firstName = "Abdou-Karim Mouhamadou Moustapha Ibrahim";
  input.identity.lastName = "Ndiaye-Diop Sall-Ba Guèye Faye-Thiam Ka";
  input.identity.email = "abdou.karim@gmail.com";
  Object.assign(input.internship!, {
    school: "Université Cheikh Anta Diop de Dakar, Faculté des Sciences Économiques et de Gestion (FASEG)",
    program: "Gestion des ressources humaines et des organisations publiques et privées en Afrique de l'Ouest",
    studyLevel: "Master 2 professionnel en alternance",
    department: "Direction des ressources humaines et du développement des compétences et talents",
    start: "lundi 4 janvier 2027 au plus tard",
    end: "vendredi 30 avril 2027 au plus tard",
    durationText: "quatre mois environ, renouvelable",
  });
  const envoi = generateDocument(input, "stage", { seed: "E1", now: NOW }).envoi!;
  assert([...envoi.whatsapp].length <= WHATSAPP_MAX, `${[...envoi.whatsapp].length} characters`);
  assert(envoi.whatsapp.startsWith("Bonjour Madame, Monsieur,\nJe m'appelle Abdou-Karim"), envoi.whatsapp);
  const emailLines = envoi.emailBody.split("\n");
  assertEquals(emailLines.slice(-4), [
    "Cordialement,",
    "Abdou-Karim Mouhamadou Moustapha Ibrahim NDIAYE-DIOP SALL-BA GUÈYE FAYE-THIAM KA",
    `${formatSnMobile(input.identity.phone)} · abdou.karim@gmail.com`,
    "Pièces jointes : CV, lettre de motivation",
  ]);
  assertEquals(envoi.emailSubject.split(" — ")[1], "Stage Direction des ressources humaines et du développement des compétences et talents");
  const short = randomStageInput(32, { companies: 1 });
  short.internship!.department = "Service informatique";
  assertEquals(generateDocument(short, "stage", { seed: "E2", now: NOW }).envoi!.emailSubject.split(" — ")[1], "Stage Informatique");
});

Deno.test("stage helpers: diploma, level group, period, duration, department, sector, reason", () => {
  assertEquals(diplomaOf("BTS", "Comptabilité et gestion", "ISM"), "BTS Comptabilité et gestion");
  assertEquals(diplomaOf("licence 3", "informatique", "UCAD"), "Licence 3 Informatique");
  assertEquals(diplomaOf("Autre", "Comptabilité", ""), "comptabilité");
  assertEquals(diplomaOf("Licence 3", "Licence en droit des affaires", ""), "Licence en droit des affaires");
  assertEquals(diplomaOf("DUT/ISEP", "Hôtellerie et restauration", "ISEP de Thiès"), "hôtellerie et restauration");
  assertEquals(diplomaOf("DUT/ISEP", "Génie civil", "École Supérieure Polytechnique"), "DUT Génie civil");
  assertEquals(diplomaOf("Master 1", "en finance", ""), "Master 1 en finance");

  assertEquals(bucketOf("BTS", "Comptabilité"), "court");
  assertEquals(bucketOf("Licence 2", "Droit"), "court");
  assertEquals(bucketOf("Licence 3", "Informatique"), "licence");
  assertEquals(bucketOf("Licence pro", "Banque"), "licence");
  assertEquals(bucketOf("Master 2", "Finance"), "master");
  assertEquals(bucketOf("Autre", "Comptabilité"), "autre");

  assertEquals(periodOf("Janvier 2027", undefined), "à partir de janvier 2027");
  assertEquals(periodOf("avril 2027", undefined), "à partir d'avril 2027");
  assertEquals(periodOf("1er juillet 2027", "31 août 2027"), "du 1er juillet 2027 au 31 août 2027");
  assertEquals(periodOf("janvier 2027", "mars 2027"), "de janvier à mars 2027");
  assertEquals(periodOf("octobre 2026", "janvier 2027"), "d'octobre 2026 à janvier 2027");
  assertEquals(periodOf("Dès que possible", undefined), "dès que possible");
  assertEquals(periodOf("Dès que possible", "juin 2027"), "dès que possible, jusqu'en juin 2027");
  assertEquals(periodOf(undefined, "31 mars 2027"), "jusqu'au 31 mars 2027");
  assertEquals(periodOf(undefined, "fin juin"), "jusqu'à fin juin");
  assertEquals(periodOf(undefined, undefined), null);

  assertEquals(lengthOf("3 mois"), " de 3 mois");
  assertEquals(lengthOf("un mois"), " d'un mois");
  assertEquals(lengthOf("d'une durée de 4 mois"), " de 4 mois");
  assertEquals(lengthOf("huit semaines"), " de huit semaines");
  assertEquals(lengthOf("selon vos besoins"), " (durée selon vos besoins)");
  assertEquals(lengthOf(undefined), "");

  assertEquals(deptOf("Comptabilité"), { noun: "service comptabilité", fem: false });
  assertEquals(deptOf("Ressources Humaines"), { noun: "service des ressources humaines", fem: false });
  assertEquals(deptOf("RH"), { noun: "service RH", fem: false });
  assertEquals(deptOf("Direction financière"), { noun: "direction financière", fem: true });
  assertEquals(deptOf("Service informatique"), { noun: "service informatique", fem: false });
  assertEquals(deptOf("  "), null);

  const base = randomStageInput(5, { companies: 1 });
  const sectorOf = (program: string, department?: string) =>
    stageSector({ ...base, target: { ...base.target, sector: "autre" } }, { ...base.internship!, program, department, companies: [] });
  assertEquals(sectorOf("Comptabilité et gestion"), "comptabilite");
  assertEquals(sectorOf("Gestion des ressources humaines"), "administration");
  assertEquals(sectorOf("Hôtellerie et restauration"), "hotellerie");
  assertEquals(sectorOf("Philosophie"), "autre");
  assertEquals(stageSector({ ...base, target: { ...base.target, sector: "btp" } }, base.internship!), "btp");

  assertEquals(cleanReason("votre cabinet forme bien"), "Votre cabinet forme bien.");
  assertEquals(cleanReason("parce que vous formez bien et que j'aime ça"), "Je m'adresse à vous parce que vous formez bien et que j'aime ça.");
  assertEquals(cleanReason("car vous formez bien"), "Je m'adresse à vous car vous formez bien.");
  assertEquals(cleanReason("Pour apprendre le métier"), "Je m'adresse à vous pour apprendre le métier.");
  assertEquals(cleanReason("Afin d'apprendre le métier!!!"), "Je m'adresse à vous afin d'apprendre le métier!");
  assertEquals(cleanReason("VOTRE ENTREPRISE FORME LES JEUNES"), "Votre entreprise forme les jeunes.");
  assertEquals(cleanReason("  Vous êtes leader   au Sénégal .  "), "Vous êtes leader au Sénégal.");
});

Deno.test("stage generation does not change the other products", () => {
  const input = randomStageInput(2, { companies: 3 });
  const withLetter: OrderInput = { ...input, target: { ...input.target, kind: "emploi", sector: "comptabilite" }, letter: { company: "Orange", qualities: [] } };
  for (const product of ["cv", "lettre", "pack"] as const) {
    const doc = generateDocument(withLetter, product, { seed: "S", now: NOW });
    assertEquals(Object.keys(doc).sort(), ["cv", "lettre"], product);
    const { internship: _ignored, ...rest } = withLetter;
    assertEquals(doc, generateDocument(rest, product, { seed: "S", now: NOW }), `${product}: internship must be ignored`);
  }
});
