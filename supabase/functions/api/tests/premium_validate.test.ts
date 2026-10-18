// CV Premium form validation (validate.ts): required block, limits, enums, key-figure format, dotted field
// paths, blank items, letter ignored; and the unchanged behaviour of the other products.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { isKeyFigureValue, PREMIUM_ACCENTS, SKILL_LEVELS, validateOrderRequest } from "../lib/validate.ts";
import { orderData } from "./fixtures/backend_harness.ts";

/** A complete, valid premium form as the wizard posts it. */
function premiumData(premium: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...orderData("cv"),
    target: {
      jobTitle: "Directrice administrative et financière",
      kind: "emploi",
      sector: "comptabilite",
      level: "senior",
    },
    premium: {
      headline: "  Directrice   financière — banque et microfinance ",
      pitch: "Je pilote le reporting\nfinancier depuis 2016.",
      quote: "Une donnée fiable vaut mieux qu'un long rapport.",
      keyFigures: [{ value: "15+", label: "années en banque" }, { value: 16359, label: "dossiers revus" }],
      domains: [{ title: "Risque de crédit", detail: "Classification, provisions" }, { title: "Pilotage" }],
      achievements: [
        { title: "Automatisation du reporting", detail: "De 5 jours à 1 jour.", tags: ["Excel", " Power BI "] },
        { title: "Refonte des procédures" },
      ],
      skillLevels: [{ name: "Excel", level: "Expert" }, { name: "SQL", level: "Avancé" }],
      qualities: ["Rigueur", "Intégrité"],
      personal: { age: "41", situation: "Mariée, deux enfants" },
      accent: "bordeaux",
      ...premium,
    },
  };
}

function check(premium: Record<string, unknown>, data: Record<string, unknown> = {}) {
  return validateOrderRequest({
    product: "premium",
    template: "classique",
    data: { ...premiumData(premium), ...data },
  });
}

function fieldsOf(premium: Record<string, unknown>, data: Record<string, unknown> = {}): Record<string, string> {
  const res = check(premium, data);
  assert(!res.ok, "expected a validation error");
  return res.fields;
}

Deno.test("premium validation: a complete form is accepted, trimmed and normalised", () => {
  const res = check({});
  assert(res.ok, JSON.stringify(!res.ok && res.fields));
  assertEquals(res.product, "premium");
  assertEquals(res.data.premium, {
    headline: "Directrice financière — banque et microfinance",
    pitch: "Je pilote le reporting financier depuis 2016.",
    quote: "Une donnée fiable vaut mieux qu'un long rapport.",
    keyFigures: [{ value: "15+", label: "années en banque" }, { value: "16359", label: "dossiers revus" }],
    domains: [{ title: "Risque de crédit", detail: "Classification, provisions" }, { title: "Pilotage", detail: "" }],
    achievements: [
      { title: "Automatisation du reporting", detail: "De 5 jours à 1 jour.", tags: ["Excel", "Power BI"] },
      { title: "Refonte des procédures", detail: "", tags: [] },
    ],
    skillLevels: [{ name: "Excel", level: "Expert" }, { name: "SQL", level: "Avancé" }],
    qualities: ["Rigueur", "Intégrité"],
    personal: { age: "41", situation: "Mariée, deux enfants" },
    accent: "bordeaux",
  });
});

Deno.test("premium validation: only the headline is required; optional parts may be absent", () => {
  const res = validateOrderRequest({
    product: "premium",
    data: { ...orderData("cv"), premium: { headline: "Chef de projet" } },
  });
  assert(res.ok, JSON.stringify(!res.ok && res.fields));
  assertEquals(res.data.premium, {
    headline: "Chef de projet",
    keyFigures: [],
    domains: [],
    achievements: [],
    skillLevels: [],
    qualities: [],
    accent: "marine",
  });
});

Deno.test("premium validation: the premium block itself is required for product premium", () => {
  const data = orderData("cv");
  const missing = validateOrderRequest({ product: "premium", data });
  assert(!missing.ok);
  assertEquals(Object.keys(missing.fields), ["premium.headline"]);
  const wrongType = validateOrderRequest({ product: "premium", data: { ...data, premium: "oui" } });
  assert(!wrongType.ok);
  assertEquals(Object.keys(wrongType.fields), ["premium"]);
  assertEquals(Object.keys(fieldsOf({ headline: "   " })), ["premium.headline"]);
});

Deno.test("premium validation: the letter is ignored and the usual identity/target/one-of rules apply", () => {
  const res = check({}, { letter: { company: "Banque Kawral", qualities: ["Rigueur"] } });
  assert(res.ok);
  assertEquals(res.data.letter, undefined);
  const noLetter = check({}, { letter: undefined });
  assert(noLetter.ok, "premium does not need a letter");

  const empty = fieldsOf({}, { education: [], experiences: [] });
  assertEquals(empty.experiences, "Ajoutez au moins une formation ou une expérience.");
  const identity = fieldsOf({}, {
    identity: { civility: "Mme", firstName: "", lastName: "Faye", phone: "12", city: "" },
  });
  for (const k of ["identity.firstName", "identity.phone", "identity.city"]) assert(k in identity, k);
});

Deno.test("premium validation: limits of every field, with dotted paths", () => {
  const long = (n: number) => "a".repeat(n);
  const cases: Array<[Record<string, unknown>, string, string]> = [
    [{ headline: long(161) }, "premium.headline", "160 caractères maximum."],
    [{ pitch: long(501) }, "premium.pitch", "500 caractères maximum."],
    [{ quote: long(221) }, "premium.quote", "220 caractères maximum."],
    [
      { keyFigures: Array.from({ length: 5 }, () => ({ value: "1", label: "x" })) },
      "premium.keyFigures",
      "4 éléments maximum.",
    ],
    [{ keyFigures: [{ value: "1".repeat(13), label: "x" }] }, "premium.keyFigures.0.value", "12 caractères maximum."],
    [{ keyFigures: [{ value: "12", label: long(71) }] }, "premium.keyFigures.0.label", "70 caractères maximum."],
    [{ keyFigures: [{ value: "12" }] }, "premium.keyFigures.0.label", "Ce champ est obligatoire."],
    [{ keyFigures: [{ label: "années" }] }, "premium.keyFigures.0.value", "Ce champ est obligatoire."],
    [{ domains: Array.from({ length: 4 }, () => ({ title: "x" })) }, "premium.domains", "3 éléments maximum."],
    [{ domains: [{ title: long(41) }] }, "premium.domains.0.title", "40 caractères maximum."],
    [{ domains: [{ title: "x", detail: long(121) }] }, "premium.domains.0.detail", "120 caractères maximum."],
    [{ domains: [{ detail: "sans titre" }] }, "premium.domains.0.title", "Ce champ est obligatoire."],
    [
      { achievements: Array.from({ length: 7 }, () => ({ title: "x" })) },
      "premium.achievements",
      "6 éléments maximum.",
    ],
    [{ achievements: [{ title: long(71) }] }, "premium.achievements.0.title", "70 caractères maximum."],
    [
      { achievements: [{ title: "x", tags: ["a", "b", "c", "d", "e"] }] },
      "premium.achievements.0.tags",
      "4 éléments maximum.",
    ],
    [
      { achievements: [{ title: "x", tags: ["a", "b", long(31)] }] },
      "premium.achievements.0.tags.2",
      "30 caractères maximum.",
    ],
    [{ achievements: [{ title: "x", tags: "Excel" }] }, "premium.achievements.0.tags", "Liste invalide."],
    [{ achievements: [{ tags: ["Excel"] }] }, "premium.achievements.0.title", "Ce champ est obligatoire."],
    [
      { skillLevels: Array.from({ length: 9 }, () => ({ name: "x", level: "Bon" })) },
      "premium.skillLevels",
      "8 éléments maximum.",
    ],
    [{ skillLevels: [{ name: long(41), level: "Bon" }] }, "premium.skillLevels.0.name", "40 caractères maximum."],
    [{ skillLevels: [{ name: "Excel", level: "Moyen" }] }, "premium.skillLevels.0.level", "Valeur invalide."],
    [{ skillLevels: [{ name: "Excel" }] }, "premium.skillLevels.0.level", "Ce champ est obligatoire."],
    [{ qualities: Array.from({ length: 7 }, () => "x") }, "premium.qualities", "6 éléments maximum."],
    [{ qualities: [long(41)] }, "premium.qualities.0", "40 caractères maximum."],
    [{ personal: { age: long(31) } }, "premium.personal.age", "30 caractères maximum."],
    [{ personal: { situation: long(31) } }, "premium.personal.situation", "30 caractères maximum."],
    [{ personal: "41 ans" }, "premium.personal", "Valeur invalide."],
    [{ accent: "rouge" }, "premium.accent", "Valeur invalide."],
    [{ keyFigures: "15+" }, "premium.keyFigures", "Liste invalide."],
    [{ domains: ["Risque"] }, "premium.domains.0", "Valeur invalide."],
  ];
  for (const [premium, path, message] of cases) {
    const fields = fieldsOf(premium);
    assertEquals(fields[path], message, `${JSON.stringify(premium).slice(0, 80)} → ${JSON.stringify(fields)}`);
  }
  // The documented example path.
  const four = Array.from({ length: 4 }, (_, i) => ({ title: `Réalisation ${i}`, detail: i === 3 ? long(241) : "ok" }));
  assertEquals(fieldsOf({ achievements: four })["premium.achievements.3.detail"], "240 caractères maximum.");
});

Deno.test("premium validation: exact limits are accepted", () => {
  const res = check({
    headline: "h".repeat(160),
    pitch: "p".repeat(500),
    quote: "q".repeat(220),
    keyFigures: Array.from({ length: 4 }, () => ({ value: "9".repeat(12), label: "l".repeat(70) })),
    domains: Array.from({ length: 3 }, () => ({ title: "t".repeat(40), detail: "d".repeat(120) })),
    achievements: Array.from(
      { length: 6 },
      () => ({ title: "t".repeat(70), detail: "d".repeat(240), tags: Array(4).fill("g".repeat(30)) }),
    ),
    skillLevels: Array.from({ length: 8 }, (_, i) => ({ name: "n".repeat(40), level: SKILL_LEVELS[i % 4] })),
    qualities: Array(6).fill("q".repeat(40)),
    personal: { age: "a".repeat(30), situation: "s".repeat(30) },
  });
  assert(res.ok, JSON.stringify(!res.ok && res.fields));
});

Deno.test("premium validation: key figure values are figures, never words", () => {
  const good = [
    "15+",
    "16 359",
    "100 %",
    "100%",
    "7/7",
    "2,5 M",
    "+30 %",
    "50k",
    "50K",
    "24/7",
    "1 200",
    "99,9 %",
    "3",
    "+",
  ];
  const bad = ["quinze", "15 ans", "N/A", "abc", "—", "12 pays", "x2", "2,5 Mds", "Top 10", "1er", "10 €uros"];
  for (const v of good) assert(isKeyFigureValue(v), `${v} should be accepted`);
  for (const v of bad) assert(!isKeyFigureValue(v), `${v} should be refused`);
  const fields = fieldsOf({ keyFigures: [{ value: "15+", label: "ok" }, { value: "15 ans", label: "d'expérience" }] });
  assertEquals(Object.keys(fields), ["premium.keyFigures.1.value"]);
  assert(/chiffre/i.test(fields["premium.keyFigures.1.value"]));
});

Deno.test("premium validation: blank items are dropped, enums are the documented ones", () => {
  const res = check({
    keyFigures: [{ value: "", label: " " }, { value: "12", label: "agences" }],
    domains: [{ title: "", detail: "" }],
    achievements: [{ title: " ", detail: "", tags: ["", " "] }, { title: "Audit", tags: ["", "SQL"] }],
    skillLevels: [{ name: "", level: "" }],
    qualities: ["", "Rigueur"],
    personal: { age: " ", situation: "" },
    accent: "",
  });
  assert(res.ok, JSON.stringify(!res.ok && res.fields));
  const p = res.data.premium!;
  assertEquals(p.keyFigures, [{ value: "12", label: "agences" }]);
  assertEquals(p.domains, []);
  assertEquals(p.achievements, [{ title: "Audit", detail: "", tags: ["SQL"] }]);
  assertEquals(p.skillLevels, []);
  assertEquals(p.qualities, ["Rigueur"]);
  assertEquals(p.personal, undefined);
  assertEquals(p.accent, "marine", "no colour chosen → marine");
  assertEquals([...SKILL_LEVELS], ["Expert", "Avancé", "Bon", "Notions"]);
  assertEquals([...PREMIUM_ACCENTS], ["marine", "bordeaux", "foret"]);
});

Deno.test("premium validation: other products ignore premium data and keep their rules", () => {
  const data = { ...orderData("pack"), premium: { headline: "x".repeat(500), accent: "rouge" } };
  for (const product of ["cv", "lettre", "pack"]) {
    const res = validateOrderRequest({ product, data });
    assert(res.ok, `${product}: ${JSON.stringify(!res.ok && res.fields)}`);
    assertEquals(res.data.premium, undefined, product);
  }
  const noLetter = validateOrderRequest({ product: "pack", data: orderData("cv") });
  assert(!noLetter.ok);
  assertEquals(noLetter.fields["letter.company"], "Indiquez l'entreprise à qui vous écrivez.");
  const cvOnly = validateOrderRequest({ product: "cv", data: orderData("pack") });
  assert(cvOnly.ok);
  assertEquals(cvOnly.data.letter, undefined);
  const unknown = validateOrderRequest({ product: "deluxe", data: orderData("cv") });
  assert(!unknown.ok);
  assertEquals(unknown.fields.product, "Valeur invalide.");
});
