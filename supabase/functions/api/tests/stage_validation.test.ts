// Pack Stage validation (internship rules, dotted field paths, forced target) and pricing (1 company vs
// 2–5 companies, PRICE_STAGE / PRICE_STAGE_MULTI from env or tcv.settings).
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import type { OrderInput } from "../lib/types.ts";
import { validateOrderRequest } from "../lib/validate.ts";
import { STAGE_MSG } from "../lib/validate_stage.ts";
import { needsCv, needsInternship, needsLetter, orderPrice, priceOf, PRODUCTS } from "../lib/pricing.ts";
import { envFrom, loadConfig } from "../lib/config.ts";
import { orderData } from "./fixtures/backend_harness.ts";
import { randomStageInput } from "./fixtures/stage_inputs.ts";

type Obj = Record<string, unknown>;

function company(i = 0, over: Obj = {}): Obj {
  return { name: `Entreprise ${i + 1}`, reason: "Je souhaite apprendre le métier auprès de vos équipes.", ...over };
}

function internship(over: Obj = {}): Obj {
  return {
    school: "ISM",
    program: "Comptabilité et gestion",
    studyLevel: "BTS",
    internshipType: "fin_etudes",
    conventionProvided: true,
    projects: [],
    qualities: ["Rigueur"],
    channel: "email",
    companies: [company()],
    ...over,
  };
}

/** A stage form as the wizard sends it: no Objectif step, so no `target`. */
function stageData(over: Obj = {}, intern: Obj = {}): Obj {
  const { target: _t, letter: _l, ...base } = orderData("cv");
  return { ...base, internship: internship(intern), ...over };
}

function validate(data: Obj, product = "stage") {
  return validateOrderRequest({ product, template: "classique", data });
}

function fieldsOf(data: Obj): Record<string, string> {
  const res = validate(data);
  assert(!res.ok, "expected a validation error");
  return res.fields;
}

function okData(data: Obj): OrderInput {
  const res = validate(data);
  assert(res.ok, JSON.stringify(!res.ok && res.fields));
  return res.data;
}

Deno.test("stage validation: a wizard form passes; target is forced to an internship with defaults", () => {
  const data = okData(stageData({ target: { kind: "emploi" }, letter: { company: "Ignorée" } }));
  assertEquals(data.target, { jobTitle: "Comptabilité et gestion", kind: "stage", sector: "autre", level: "debutant" });
  assertEquals(data.letter, undefined, "letter is ignored for the Pack Stage");
  assertEquals(data.internship, {
    school: "ISM",
    program: "Comptabilité et gestion",
    studyLevel: "BTS",
    internshipType: "fin_etudes",
    conventionProvided: true,
    projects: [],
    qualities: ["Rigueur"],
    channel: "email",
    companies: [{ name: "Entreprise 1", reason: "Je souhaite apprendre le métier auprès de vos équipes." }],
  });
  const typed = okData(stageData({ target: { jobTitle: "Assistant comptable", sector: "comptabilite", level: "junior" } }, {
    department: "Comptabilité",
  }));
  assertEquals(typed.target, { jobTitle: "Assistant comptable", kind: "stage", sector: "comptabilite", level: "junior" });
  assertEquals(okData(stageData({}, { department: "Audit" })).target.jobTitle, "Audit");
});

Deno.test("stage validation: optional fields are cleaned and kept, blanks dropped", () => {
  const data = okData(stageData({}, {
    school: "  Université   Cheikh Anta Diop ",
    start: " janvier 2027 ",
    end: "",
    durationText: "3 mois",
    department: " Direction  financière ",
    conventionProvided: "oui",
    projects: [" Application de gestion\u0007 de stock ", "", "  "],
    qualities: ["Rigueur", " Ponctualité "],
    companies: [
      company(0, { city: " Dakar ", recipient: "", department: "Audit", reason: "  Votre cabinet   forme bien ses stagiaires. " }),
      { name: "", city: "", reason: "" },
    ],
  }));
  const i = data.internship!;
  assertEquals(i.school, "Université Cheikh Anta Diop");
  assertEquals([i.start, i.end, i.durationText, i.department], ["janvier 2027", undefined, "3 mois", "Direction financière"]);
  assertEquals(i.conventionProvided, true);
  assertEquals(i.projects, ["Application de gestion de stock"]);
  assertEquals(i.qualities, ["Rigueur", "Ponctualité"]);
  assertEquals(i.companies, [{ name: "Entreprise 1", city: "Dakar", department: "Audit", reason: "Votre cabinet forme bien ses stagiaires." }]);
  assertEquals(okData(stageData({}, { conventionProvided: "non" })).internship!.conventionProvided, false);
  assertEquals(okData(stageData({}, { conventionProvided: false })).internship!.conventionProvided, false);
});

Deno.test("stage validation: required fields, enums and limits carry dotted paths", () => {
  const missing = fieldsOf(stageData({}, {
    school: "",
    program: " ",
    studyLevel: undefined,
    internshipType: "stage_ouvrier",
    conventionProvided: undefined,
    channel: "fax",
  }));
  assertEquals(missing["internship.school"], STAGE_MSG.required);
  assertEquals(missing["internship.program"], STAGE_MSG.required);
  assertEquals(missing["internship.studyLevel"], STAGE_MSG.required);
  assertEquals(missing["internship.internshipType"], STAGE_MSG.invalid);
  assertEquals(missing["internship.conventionProvided"], STAGE_MSG.convention);
  assertEquals(missing["internship.channel"], STAGE_MSG.invalid);

  const long = fieldsOf(stageData({}, {
    school: "s".repeat(101),
    program: "p".repeat(101),
    studyLevel: "l".repeat(41),
    start: "x".repeat(31),
    end: "x".repeat(31),
    durationText: "x".repeat(31),
    department: "d".repeat(81),
    projects: ["a".repeat(201)],
    qualities: ["q".repeat(41)],
  }));
  assertEquals(long["internship.school"], "100 caractères maximum.");
  assertEquals(long["internship.program"], "100 caractères maximum.");
  assertEquals(long["internship.studyLevel"], "40 caractères maximum.");
  assertEquals(long["internship.start"], "30 caractères maximum.");
  assertEquals(long["internship.end"], "30 caractères maximum.");
  assertEquals(long["internship.durationText"], "30 caractères maximum.");
  assertEquals(long["internship.department"], "80 caractères maximum.");
  assertEquals(long["internship.projects.0"], "200 caractères maximum.");
  assertEquals(long["internship.qualities.0"], "40 caractères maximum.");

  assertEquals(fieldsOf(stageData({}, { projects: ["a", "b", "c", "d", "e"] }))["internship.projects"], "4 éléments maximum.");
  assertEquals(fieldsOf(stageData({}, { qualities: ["a", "b", "c", "d", "e"] }))["internship.qualities"], "4 éléments maximum.");
  assertEquals(fieldsOf(stageData({ internship: undefined }))["internship"], STAGE_MSG.required);
  assertEquals(fieldsOf(stageData({ internship: "oui" }))["internship"], STAGE_MSG.invalid);
  assertEquals(fieldsOf(stageData({ target: { sector: "spatial" } }))["target.sector"], STAGE_MSG.invalid);
});

Deno.test("stage validation: 1 to 5 companies, name required, reason 20–300 characters", () => {
  assertEquals(fieldsOf(stageData({}, { companies: [] }))["internship.companies"], STAGE_MSG.companies);
  assertEquals(fieldsOf(stageData({}, { companies: [{ name: " ", reason: "" }] }))["internship.companies"], STAGE_MSG.companies);
  const six = Array.from({ length: 6 }, (_, i) => company(i));
  assertEquals(fieldsOf(stageData({}, { companies: six }))["internship.companies"], "5 éléments maximum.");
  assertEquals(okData(stageData({}, { companies: six.slice(0, 5) })).internship!.companies.length, 5);

  const bad = fieldsOf(stageData({}, {
    companies: [
      company(0),
      company(1, { name: "" }),
      company(2, { reason: "Trop court." }),
      company(3, { reason: "r".repeat(301), city: "c".repeat(61), recipient: "x".repeat(101), department: "d".repeat(81) }),
      company(4, { reason: undefined }),
    ],
  }));
  assertEquals(bad["internship.companies.1.name"], STAGE_MSG.companyName);
  assertEquals(bad["internship.companies.2.reason"], STAGE_MSG.reasonMin);
  assertEquals(bad["internship.companies.3.reason"], "300 caractères maximum.");
  assertEquals(bad["internship.companies.3.city"], "60 caractères maximum.");
  assertEquals(bad["internship.companies.3.recipient"], "100 caractères maximum.");
  assertEquals(bad["internship.companies.3.department"], "80 caractères maximum.");
  assertEquals(bad["internship.companies.4.reason"], STAGE_MSG.reason);
  assertEquals(bad["internship.companies.0.reason"], undefined);
  assertEquals(fieldsOf(stageData({}, { companies: ["Sonatel"] }))["internship.companies.0"], STAGE_MSG.invalid);
  // Exactly 20 and 300 characters are accepted.
  okData(stageData({}, { companies: [company(0, { reason: "a".repeat(20) }), company(1, { reason: "b".repeat(300) })] }));
});

Deno.test("stage validation: education, a project or an experience is enough", () => {
  const none = fieldsOf(stageData({ education: [], experiences: [] }, { projects: [] }));
  assertEquals(none.experiences, STAGE_MSG.oneOf);
  okData(stageData({ education: [], experiences: [] }, { projects: ["Application de gestion de stock"] }));
  okData(stageData({ experiences: [] }, { projects: [] }));
  okData(stageData({ education: [] }, { projects: [] }));
});

Deno.test("stage validation leaves the other products exactly as before", () => {
  const withInternship = { ...orderData("pack"), internship: internship() };
  for (const product of ["cv", "lettre", "pack"]) {
    const res = validate(withInternship, product);
    assert(res.ok, product);
    assertEquals(res.data.internship, undefined, `${product}: internship is ignored`);
    const plain = validate(orderData(product as "cv"), product);
    assert(plain.ok);
    assertEquals(res.data, plain.data, product);
  }
  const noLetter = validate({ ...orderData("pack"), letter: undefined }, "pack");
  assert(!noLetter.ok && noLetter.fields["letter.company"]);
  const cvTarget = validate({ ...orderData("cv"), target: undefined }, "cv");
  assert(!cvTarget.ok && cvTarget.fields["target.jobTitle"], "the strict target rules still apply to cv");
});

Deno.test("stage fixtures: 300 random Pack Stage forms pass the real validator", () => {
  const sizes = new Set<number>();
  for (let i = 0; i < 300; i++) {
    const input = randomStageInput(i);
    assertEquals(input.target.kind, "stage");
    sizes.add(input.internship!.companies.length);
  }
  assertEquals([...sizes].sort(), [1, 2, 3, 4, 5]);
  assertEquals(randomStageInput(7, { companies: 5 }).internship!.companies.length, 5);
});

Deno.test("pricing: Pack Stage is 1 500 for one company and 2 500 for 2 to 5; other prices unchanged", () => {
  const config = loadConfig(envFrom({}));
  const withCompanies = (n: number) => ({ internship: { companies: Array.from({ length: n }, () => ({})) } }) as Pick<OrderInput, "internship">;
  assertEquals(orderPrice("stage", withCompanies(1), config), 1500);
  for (const n of [2, 3, 4, 5]) assertEquals(orderPrice("stage", withCompanies(n), config), 2500);
  assertEquals(orderPrice("cv", withCompanies(3), config), 1000);
  assertEquals(orderPrice("lettre", {}, config), 1000);
  assertEquals(orderPrice("pack", withCompanies(5), config), 1500);
  assertEquals(priceOf("stage", config), 1500);
  assertEquals(PRODUCTS, ["cv", "lettre", "pack", "stage", "premium"]);
  assertEquals([needsCv("stage"), needsLetter("stage"), needsInternship("stage")], [true, false, true]);
  assertEquals([needsLetter("cv"), needsLetter("lettre"), needsLetter("pack"), needsInternship("pack")], [false, true, true, false]);
});

Deno.test("pricing: PRICE_STAGE / PRICE_STAGE_MULTI come from env or tcv.settings (env wins)", () => {
  const fromDb = loadConfig(envFrom({}), { PRICE_STAGE: "2000", PRICE_STAGE_MULTI: "3000" });
  assertEquals([fromDb.prices.stage, fromDb.stageMultiPrice], [2000, 3000]);
  const fromEnv = loadConfig(envFrom({ PRICE_STAGE: "1800", PRICE_STAGE_MULTI: " " }), { PRICE_STAGE: "2000", PRICE_STAGE_MULTI: "3000" });
  assertEquals([fromEnv.prices.stage, fromEnv.stageMultiPrice], [1800, 3000]);
  const invalid = loadConfig(envFrom({ PRICE_STAGE: "0", PRICE_STAGE_MULTI: "beaucoup" }));
  assertEquals([invalid.prices.stage, invalid.stageMultiPrice], [1500, 2500]);
  const others = loadConfig(envFrom({}), { PRICE_STAGE: "2000" });
  assertEquals([others.prices.cv, others.prices.lettre, others.prices.pack], [1000, 1000, 1500]);
});
