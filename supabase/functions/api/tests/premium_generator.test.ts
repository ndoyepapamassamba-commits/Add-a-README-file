// CV Premium generation: fuzzed invariants over validated random orders, no invented digits (every digit of
// a key figure or an achievement comes from that very item), the quote bank, the profile rules, and the
// guarantee that the premium CV is the regular CV plus the premium block.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import type { CvDoc, Document, OrderInput } from "../lib/types.ts";
import { generateDocument } from "../lib/generator/index.ts";
import { PREMIUM_AIM, PREMIUM_QUOTES } from "../lib/generator/banks_premium.ts";
import { foldKey } from "../lib/generator/text.ts";
import { validateOrderRequest } from "../lib/validate.ts";
import { randomInput } from "./gen_inputs.test.ts";
import {
  assertClean,
  assertNoInventedDigits,
  assertNoInventedNames,
  digitRuns,
  premiumBody,
  randomPremiumInput,
} from "./fixtures/premium_inputs.ts";

const NOW = new Date("2026-10-18T09:30:00Z");
const FUZZ_RUNS = 300;

/** A random premium order as validate.ts hands it to the generator. */
function validated(seed: number): OrderInput {
  const res = validateOrderRequest(premiumBody(randomPremiumInput(seed)));
  if (!res.ok) throw new Error(`seed ${seed}: ${JSON.stringify(res.fields)}`);
  assertEquals(res.product, "premium");
  return res.data;
}

const words = (s: string) => (foldKey(s).match(/\p{L}+/gu) ?? []);

Deno.test("premium fixtures: every random premium order passes the real validator", () => {
  for (let i = 0; i < FUZZ_RUNS; i++) validated(i);
});

Deno.test(`premium fuzz: ${FUZZ_RUNS} random premium orders satisfy every invariant`, () => {
  let withQuote = 0;
  let withPitch = 0;
  let figures = 0;
  let achievements = 0;
  for (let i = 0; i < FUZZ_RUNS; i++) {
    const input = validated(i);
    const p = input.premium!;
    const seed = `TCV-PREM${i}`;
    const ctx = `seed ${i} (${input.target.kind}/${input.target.level}/${input.target.sector})`;
    const doc = generateDocument(input, "premium", { seed, now: NOW });

    assertEquals(
      doc,
      generateDocument(structuredClone(input), "premium", { seed, now: NOW }),
      `${ctx}: not deterministic`,
    );
    assertEquals(doc.lettre, null, `${ctx}: premium has no letter`);
    assertClean(doc, ctx);
    assertNoInventedDigits(doc, input, ctx);
    assertNoInventedNames(doc, input, ctx);
    const cv = doc.cv!;
    const b = cv.premium!;
    assert(b, `${ctx}: premium block missing`);

    // Visible identity and design.
    assert(b.headline.length > 0, `${ctx}: empty headline`);
    assertEquals(b.accent, p.accent, ctx);

    // Key figures: same count and order; the value keeps exactly the digits typed; every digit of the
    // figure comes from that very figure of the input.
    assertEquals(b.keyFigures.length, p.keyFigures.length, `${ctx}: key figures dropped or added`);
    b.keyFigures.forEach((f, j) => {
      assertEquals(digitRuns(f.value), digitRuns(p.keyFigures[j].value), `${ctx}: figure ${j} value digits`);
      const typed = new Set(digitRuns(`${p.keyFigures[j].value} ${p.keyFigures[j].label}`));
      for (const d of digitRuns(`${f.value} ${f.label}`)) assert(typed.has(d), `${ctx}: figure ${j} invented ${d}`);
      assert(f.value !== "" && f.label !== "" && !/[.;,:]$/.test(f.label), `${ctx}: figure ${JSON.stringify(f)}`);
      figures++;
    });

    // Achievements: same count and order, every digit from that very achievement, tags unique (≤ 4).
    assertEquals(b.achievements.length, p.achievements.length, `${ctx}: achievements dropped or added`);
    b.achievements.forEach((a, j) => {
      const src = p.achievements[j];
      const typed = new Set(digitRuns(`${src.title} ${src.detail} ${src.tags.join(" ")}`));
      for (const d of digitRuns(`${a.title} ${a.detail} ${a.tags.join(" ")}`)) {
        assert(typed.has(d), `${ctx}: achievement ${j} invented ${d}`);
      }
      assert(a.title !== "" && !/[.;,:]$/.test(a.title), `${ctx}: achievement title ${JSON.stringify(a.title)}`);
      assert(
        a.detail === "" || /^\p{Lu}.*[.!?…]$/u.test(a.detail),
        `${ctx}: achievement detail ${JSON.stringify(a.detail)}`,
      );
      assert(a.tags.length <= 4, ctx);
      assertEquals(new Set(a.tags.map(foldKey)).size, a.tags.length, `${ctx}: duplicate tags ${a.tags}`);
      for (const t of a.tags) {
        assert(words(src.tags.join(" ")).join(" ").includes(words(t).join(" ")), `${ctx}: tag ${t}`);
      }
      achievements++;
    });

    // Domains, skills, qualities: the customer's own items, cleaned and de-duplicated.
    assertEquals(b.domains.length, p.domains.length, ctx);
    b.domains.forEach((d, j) => assertEquals(words(d.title), words(p.domains[j].title), `${ctx}: domain ${j}`));
    assert(b.skillLevels.length <= 8, ctx);
    assertEquals(
      new Set(b.skillLevels.map((s) => foldKey(s.name))).size,
      b.skillLevels.length,
      `${ctx}: duplicate skills`,
    );
    for (const s of b.skillLevels) {
      assert(["Expert", "Avancé", "Bon", "Notions"].includes(s.level), ctx);
      assert(p.skillLevels.some((x) => foldKey(x.name) === foldKey(s.name)), `${ctx}: skill ${s.name} not typed`);
    }
    assert(b.qualities.length <= 6, ctx);
    assertEquals(new Set(b.qualities.map(foldKey)).size, b.qualities.length, `${ctx}: duplicate qualities`);
    for (const q of b.qualities) assert(p.qualities.some((x) => words(x).join(" ") === words(q).join(" ")), ctx);

    // Personal lines only when typed, in the documented form.
    const expected = (p.personal?.age ? 1 : 0) + (p.personal?.situation ? 1 : 0);
    assertEquals(b.personal.length, expected, `${ctx}: personal ${JSON.stringify(b.personal)}`);
    for (const l of b.personal) assertMatch(l, /^(Âge|Situation) : \S/u, ctx);

    // Quote: the customer's own words, or a generic sentence of the bank for their level.
    if (p.quote) {
      withQuote++;
      assertEquals(words(b.quote), words(p.quote), `${ctx}: quote changed ${b.quote}`);
      assert(!/^[«"“]|[»"”]$/.test(b.quote), `${ctx}: quotation marks kept ${b.quote}`);
    } else {
      assert(PREMIUM_QUOTES[input.target.level].includes(b.quote), `${ctx}: quote not from the bank: ${b.quote}`);
    }
    assertMatch(b.quote, /^\p{Lu}.*[.!?…]$/u, ctx);

    // Profile: the pitch (plus at most one bank sentence), or the regular CV profile.
    const plain = generateDocument(input, "cv", { seed, now: NOW }).cv!;
    if (p.pitch) {
      withPitch++;
      assert(
        words(cv.profile).join(" ").startsWith(words(p.pitch).join(" ")),
        `${ctx}: profile must start with the pitch: ${cv.profile}`,
      );
      assert(cv.profile.length <= 650 || cv.profile.length <= p.pitch.length + 2, `${ctx}: profile too long`);
    } else {
      assertEquals(cv.profile, plain.profile, `${ctx}: profile without pitch`);
    }
    // The rest of the CV is exactly the regular CV builder's output.
    const { premium: _block, profile: _profile, ...rest } = cv;
    const { profile: _plainProfile, ...plainRest } = plain;
    assertEquals(rest, plainRest, `${ctx}: premium CV differs from the regular CV`);
  }
  assert(withQuote > 50 && withPitch > 100, `coverage: ${withQuote} quotes, ${withPitch} pitches`);
  assert(figures > 300 && achievements > 400, `coverage: ${figures} figures, ${achievements} achievements`);
});

Deno.test("premium quote bank: ≥ 6 first-person variants per level, no fact, no digit, no proper noun", () => {
  assertEquals(Object.keys(PREMIUM_QUOTES).sort(), ["confirme", "debutant", "junior", "senior"]);
  for (const [level, variants] of Object.entries(PREMIUM_QUOTES)) {
    assert(variants.length >= 6, `${level}: ${variants.length} variants`);
    assertEquals(new Set(variants).size, variants.length, `${level}: duplicate variants`);
    for (const q of variants) {
      assertMatch(q, /^\p{Lu}[^\p{Lu}]*[.!?]$/u, `${level}: one sentence, no proper noun — ${q}`);
      assert(!/\d/.test(q), `${level}: digit in ${q}`);
      assert(/(?<!\p{L})((je|mon|ma|mes|me|moi)(?!\p{L})|[jm]['’])/iu.test(q), `${level}: not first person — ${q}`);
      assert(!/ {2}|\s[,.]/.test(q), `${level}: typography — ${q}`);
      assert(q.length >= 40 && q.length <= 120, `${level}: length ${q.length} — ${q}`);
    }
  }
  // Facts the bank must never claim: employers, diplomas, years, titles, sectors.
  const all = Object.values(PREMIUM_QUOTES).flat().join(" ").toLowerCase();
  for (
    const fact of ["banque", "diplôm", "master", "ans d", "directeur", "directrice", "manager", "équipe de", "ong"]
  ) {
    assert(!new RegExp(`(?<!\\p{L})${fact}`, "u").test(all), `the quote bank mentions "${fact}"`);
  }
});

Deno.test("premium quote: generic quotes vary across seeds and stay deterministic", () => {
  const input = validated(7);
  delete input.premium!.quote;
  input.target.level = "senior";
  const quotes = Array.from(
    { length: 60 },
    (_, i) => generateDocument(input, "premium", { seed: `Q${i}`, now: NOW }).cv!.premium!.quote,
  );
  assert(new Set(quotes).size >= 5, `only ${new Set(quotes).size} distinct quotes`);
  assertEquals(quotes[3], generateDocument(input, "premium", { seed: "Q3", now: NOW }).cv!.premium!.quote);
});

Deno.test("premium profile: one-sentence pitch + one aim sentence; longer pitch alone; casing and accents fixed", () => {
  const input = validated(1);
  const p = input.premium!;
  p.pitch = "je pilote depuis 2016 le reporting financier d'une banque commerciale, en lien avec la direction generale";
  const short = generateDocument(input, "premium", { seed: "P1", now: NOW }).cv!.profile;
  assert(
    short.startsWith(
      "Je pilote depuis 2016 le reporting financier d'une banque commerciale, en lien avec la direction générale. ",
    ),
    short,
  );
  assertEquals((short.match(/[.!?](?=\s|$)/g) ?? []).length, 2, short);

  p.pitch = "Première phrase du résumé. Deuxième phrase du résumé.";
  assertEquals(generateDocument(input, "premium", { seed: "P1", now: NOW }).cv!.profile, p.pitch);
});

Deno.test("premium profile: experienced job seekers get the premium aim bank, with the job typed and gender agreement", () => {
  assert(PREMIUM_AIM.length >= 5);
  const input = validated(4);
  input.premium!.pitch = "Je coordonne des programmes de santé communautaire depuis dix ans";
  input.target = { jobTitle: "Coordinatrice de programmes", kind: "emploi", sector: "autre", level: "senior" };
  input.identity.civility = "Mme";
  const profiles = new Set<string>();
  for (let i = 0; i < 80; i++) {
    profiles.add(generateDocument(input, "premium", { seed: `AIM${i}`, now: NOW }).cv!.profile);
  }
  assert(profiles.size >= 4, `only ${profiles.size} distinct aims`);
  for (const profile of profiles) {
    const aim = profile.replace("Je coordonne des programmes de santé communautaire depuis dix ans. ", "");
    assert(aim !== profile && /coordinatrice de programmes/.test(aim), profile);
    assert(!/\d|\bprêt\b/.test(aim), `masculine or digit in ${aim}`);
  }
  // Junior candidates and internships keep the regular aim sentences.
  input.target.level = "junior";
  const junior = generateDocument(input, "premium", { seed: "AIM1", now: NOW }).cv!.profile;
  assert(!/organisation exigeante|structure ambitieuse|prochain défi|savoir-faire|nouveau défi/.test(junior), junior);
});

Deno.test("premium copy-editing never removes an accent the customer typed", () => {
  const input = validated(5);
  input.premium = {
    headline: "Diplômée en finance, mentor de jeunes diplômés",
    keyFigures: [{ value: "40", label: "jeunes diplômés accompagnés" }],
    domains: [{ title: "Mentorat", detail: "Diplôme, insertion, premier emploi" }],
    achievements: [{
      title: "Programme de mentorat",
      detail: "Suivi de jeunes diplômés vers l'emploi.",
      tags: ["Diplômés"],
    }],
    skillLevels: [],
    qualities: ["Élégance"],
    accent: "marine",
  };
  const b = generateDocument(input, "premium", { seed: "ACC", now: NOW }).cv!.premium!;
  assertEquals(b.headline, "Diplômée en finance, mentor de jeunes diplômés");
  assertEquals(b.keyFigures[0].label, "jeunes diplômés accompagnés");
  assertEquals(b.domains[0].detail, "Diplôme, insertion, premier emploi");
  assertEquals(b.achievements[0], {
    title: "Programme de mentorat",
    detail: "Suivi de jeunes diplômés vers l'emploi.",
    tags: ["Diplômés"],
  });
  // Personal lines typed in capitals are never taken for acronyms.
  input.premium.personal = { age: "41 ANS", situation: "MARIÉ" };
  assertEquals(
    generateDocument(input, "premium", { seed: "ACC", now: NOW }).cv!.premium!.personal,
    ["Âge : 41 ans", "Situation : Marié"],
  );
  // Text typed without accents still gets them back, and caps lock is still undone.
  input.premium.headline = "INGENIEUR RESEAUX ET TELECOMS";
  input.premium.achievements = [{ title: "Experience terrain", detail: "j'ai forme 30 techniciens", tags: [] }];
  const fixed = generateDocument(input, "premium", { seed: "ACC", now: NOW }).cv!.premium!;
  assertEquals(fixed.headline, "Ingénieur réseaux et télécoms");
  assertEquals(fixed.achievements[0].title, "Expérience terrain");
});

Deno.test("premium block: copy-editing keeps acronyms, figures and the customer's order", () => {
  const input = validated(2);
  input.premium = {
    headline: "AUDITRICE INTERNE SENIOR.",
    keyFigures: [{ value: "16 359", label: "Dossiers de crédit revus." }, {
      value: "100%",
      label: "des missions livrées",
    }],
    domains: [{ title: "IFRS 9", detail: "provisions, stages, PD" }],
    achievements: [{
      title: "Revue du portefeuille",
      detail: "1 200 dossiers revus en 6 semaines",
      tags: ["IFRS 9", "ifrs 9", "BCEAO", "power bi"],
    }],
    skillLevels: [{ name: "excel", level: "Expert" }, { name: "Excel", level: "Bon" }, {
      name: "SAP FI",
      level: "Avancé",
    }],
    qualities: ["Intégrité", "intégrité", "Rigueur"],
    personal: { age: "41", situation: "mariée, deux enfants" },
    accent: "foret",
  };
  const b = generateDocument(input, "premium", { seed: "B", now: NOW }).cv!.premium!;
  assertEquals(b.headline, "Auditrice interne senior");
  assertEquals(b.keyFigures, [{ value: "16 359", label: "Dossiers de crédit revus" }, {
    value: "100%",
    label: "des missions livrées",
  }]);
  assertEquals(b.domains, [{ title: "IFRS 9", detail: "Provisions, stages, PD" }]);
  assertEquals(b.achievements, [{
    title: "Revue du portefeuille",
    detail: "1 200 dossiers revus en 6 semaines.",
    tags: ["IFRS 9", "BCEAO", "Power BI"],
  }]);
  assertEquals(b.skillLevels, [{ name: "Excel", level: "Expert" }, { name: "SAP FI", level: "Avancé" }]);
  assertEquals(b.qualities, ["Intégrité", "Rigueur"]);
  assertEquals(b.personal, ["Âge : 41 ans", "Situation : Mariée, deux enfants"]);
  assertEquals(b.accent, "foret");
  assert(PREMIUM_QUOTES[input.target.level].includes(b.quote));
});

Deno.test("premium: empty optional lists give an empty block, never placeholders", () => {
  const input = validated(3);
  input.premium = {
    headline: "Chef de projet",
    keyFigures: [],
    domains: [],
    achievements: [],
    skillLevels: [],
    qualities: [],
    accent: "marine",
  };
  const doc = generateDocument(input, "premium", { seed: "E", now: NOW });
  const b = doc.cv!.premium!;
  assertEquals(
    { ...b, quote: "" },
    {
      headline: "Chef de projet",
      quote: "",
      keyFigures: [],
      domains: [],
      achievements: [],
      skillLevels: [],
      qualities: [],
      personal: [],
      accent: "marine",
    },
  );
});

Deno.test("premium does not change the other products: no premium block, same documents", () => {
  for (let i = 0; i < 60; i++) {
    const { input, product } = randomInput(i);
    const withPremiumData: OrderInput = { ...structuredClone(input), premium: validated(i).premium };
    const doc: Document = generateDocument(input, product, { seed: `O${i}`, now: NOW });
    assertEquals(
      generateDocument(withPremiumData, product, { seed: `O${i}`, now: NOW }),
      doc,
      `seed ${i}: premium data leaked into ${product}`,
    );
    if (doc.cv) assert(!("premium" in (doc.cv as CvDoc)), `seed ${i}: ${product} CV has a premium block`);
  }
});
