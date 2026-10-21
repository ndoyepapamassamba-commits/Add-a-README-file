// Course order and lead validation (validate_course.ts), the catalogue constants, pricing and config of the course.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { COURSE_MSG, normalizeIntlPhone, validateCourseOrder, validateLead } from "../lib/validate_course.ts";
import { validateOrderRequest } from "../lib/validate.ts";
import { COURSE_PRODUCTS as PRICING_COURSES, isCourseProduct, isProduct, orderPrice, priceOf, PRODUCTS } from "../lib/pricing.ts";
import {
  ATTESTATION_KIND,
  COURSE_CATALOG,
  COURSE_PRODUCTS,
  LEAD_CONSENT_TEXT,
  licenceLine,
  RECEIPT_SELLER_TEXT,
  RESERVED_COURSE_PRODUCTS,
} from "../lib/course.ts";
import { envFrom, loadConfig } from "../lib/config.ts";
import { newRandomId } from "../lib/ids.ts";
import { orderBody } from "./fixtures/backend_harness.ts";

const NBSP = String.fromCharCode(0xa0);
const body = (buyer: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  product: "pq_essentiel",
  buyer,
  acceptCgv: true,
  ...over,
});

Deno.test("course validation: names with accents, apostrophes, hyphens and capitals are kept as typed", () => {
  for (const name of ["Aïssatou N'Diaye-Bâ", "Jean-Pierre Diop", "Ndèye Fatou DIOP", "Mame Diarra Bousso", "N’Deye Sall", "Dr. Awa Ba"]) {
    const v = validateCourseOrder(body({ fullName: name }));
    assert(v.ok, name);
    assertEquals(v.buyer, { fullName: name, acceptCgv: true }, name);
  }
  // Spaces are cleaned (trim, runs collapsed); decomposed accents are composed.
  const v = validateCourseOrder(body({ fullName: "  Awa \t  Ndiaye  " }));
  assert(v.ok && v.buyer.fullName === "Awa Ndiaye");
  const nfd = validateCourseOrder(body({ fullName: "Ndèye Diop" }));
  assert(nfd.ok && nfd.buyer.fullName === "Ndèye Diop");
});

Deno.test("course validation: invalid or missing names are refused with the field messages", () => {
  for (const bad of ["A", "x".repeat(81), "Awa2", "<b>Awa</b>", "Awa & Co", "-Awa", "'Awa", "Awa@Ndiaye", "A.", "A-"]) {
    const v = validateCourseOrder(body({ fullName: bad }));
    assert(!v.ok, bad);
    assertEquals(v.fields["buyer.fullName"], COURSE_MSG.nameInvalid, bad);
  }
  assert(validateCourseOrder(body({ fullName: "Ab" })).ok, "2 letters is the minimum");
  assert(validateCourseOrder(body({ fullName: "A".repeat(80) })).ok, "80 characters is the maximum");
  for (const missing of [undefined, null, "", "   "]) {
    const v = validateCourseOrder(body({ fullName: missing }));
    assert(!v.ok);
    assertEquals(v.fields["buyer.fullName"], COURSE_MSG.nameMissing);
  }
  const noBuyer = validateCourseOrder({ product: "pq_essentiel", acceptCgv: true });
  assert(!noBuyer.ok && noBuyer.fields["buyer.fullName"] === COURSE_MSG.nameMissing);
  const numeric = validateCourseOrder(body({ fullName: 42 }));
  assert(!numeric.ok && numeric.fields["buyer.fullName"] === COURSE_MSG.nameInvalid);
  assert(COURSE_MSG.nameMissing.includes(`nom${NBSP}:`), "French typography: NBSP before the colon");
});

Deno.test("course validation: acceptCgv must be the boolean true", () => {
  for (const bad of [undefined, false, "true", 1, null]) {
    const v = validateCourseOrder(body({ fullName: "Awa Ndiaye" }, { acceptCgv: bad }));
    assert(!v.ok, String(bad));
    assertEquals(v.fields, { acceptCgv: COURSE_MSG.cgv });
  }
});

Deno.test("course validation: optional e-mail (lower-cased, ≤ 80) and phone of any country", () => {
  const ok = validateCourseOrder(body({ fullName: "Awa Ndiaye", email: " Awa.Ndiaye@Example.COM ", phone: "+225 07 07 07 07 07" }));
  assert(ok.ok);
  assertEquals(ok.buyer, { fullName: "Awa Ndiaye", email: "awa.ndiaye@example.com", phone: "+2250707070707", acceptCgv: true });
  for (const email of ["awa@", "awa", "awa@example", "a b@example.com", `${"a".repeat(70)}@example.com`, 12]) {
    const v = validateCourseOrder(body({ fullName: "Awa Ndiaye", email }));
    assert(!v.ok, String(email));
    assertEquals(v.fields, { "buyer.email": COURSE_MSG.email });
  }
  for (const [phone, out] of [["+225 07 07 07 07 07", "+2250707070707"], ["00221 77 123 45 67", "+221771234567"], ["77 123 45 67", "771234567"], ["(+229) 97-12-34-56", "+22997123456"], ["0033.6.12.34.56.78", "+33612345678"]]) {
    const v = validateCourseOrder(body({ fullName: "Awa Ndiaye", phone }));
    assert(v.ok && v.buyer.phone === out, phone);
  }
  for (const phone of ["abc", "123", "+1234567", "1234567890123456", "77 123 45 6x", 771234567]) {
    const v = validateCourseOrder(body({ fullName: "Awa Ndiaye", phone }));
    assert(!v.ok, String(phone));
    assertEquals(v.fields, { "buyer.phone": COURSE_MSG.phone });
  }
  const blank = validateCourseOrder(body({ fullName: "Awa Ndiaye", email: "  ", phone: "" }));
  assert(blank.ok && !("email" in blank.buyer) && !("phone" in blank.buyer), "blank optional fields are dropped");
});

Deno.test("normalizeIntlPhone: separators removed, 00 → +, 8 to 15 digits, never the Senegal normaliser", () => {
  assertEquals(normalizeIntlPhone("+225 07 07 07 07 07"), "+2250707070707");
  assertEquals(normalizeIntlPhone("00221 77 123 45 67"), "+221771234567");
  assertEquals(normalizeIntlPhone("77 123 45 67"), "771234567", "kept as typed: no +221 added");
  assertEquals(normalizeIntlPhone("33 123 45 67"), "331234567", "a fixed line is fine (any country)");
  for (const bad of ["abc", "123", "", "++22177", "+", "1234567", "1234567890123456", null, 7]) {
    assertEquals(normalizeIntlPhone(bad), null, String(bad));
  }
});

Deno.test("course validation: every error is reported at once; the product must be a course", () => {
  const v = validateCourseOrder({ product: "pq_complet", buyer: { fullName: "A", email: "x", phone: "1" } });
  assert(!v.ok);
  assertEquals(v.fields, {
    product: "Valeur invalide.",
    "buyer.fullName": COURSE_MSG.nameInvalid,
    "buyer.email": COURSE_MSG.email,
    "buyer.phone": COURSE_MSG.phone,
    acceptCgv: COURSE_MSG.cgv,
  });
  assert(!validateCourseOrder(null).ok);
  assert(!validateCourseOrder([]).ok);
});

Deno.test("lead validation: one contact at least, consent true, source kept or « autre »", () => {
  assertEquals(validateLead({ email: "Awa@Example.com", consent: true, source: "formation-index" }), {
    ok: true,
    email: "awa@example.com",
    whatsapp: null,
    source: "formation-index",
  });
  assertEquals(validateLead({ whatsapp: "00221 77 123 45 67", consent: true, source: "formation-gratuit" }), {
    ok: true,
    email: null,
    whatsapp: "+221771234567",
    source: "formation-gratuit",
  });
  const both = validateLead({ email: "a@b.co", whatsapp: "+225 07 07 07 07 07", consent: true, source: "x" });
  assert(both.ok && both.email === "a@b.co" && both.whatsapp === "+2250707070707");
  const neither = validateLead({ consent: true, source: "formation-index" });
  assertEquals(neither, { ok: false, fields: { contact: COURSE_MSG.contact } });
  const blanks = validateLead({ email: " ", whatsapp: "", consent: true });
  assertEquals(blanks, { ok: false, fields: { contact: COURSE_MSG.contact } });
  for (const consent of [false, "true", undefined, 1]) {
    const v = validateLead({ email: "a@b.co", consent, source: "formation-index" });
    assertEquals(v, { ok: false, fields: { consent: COURSE_MSG.consent } }, String(consent));
  }
  assertEquals(validateLead({ email: "nope", consent: true }), { ok: false, fields: { email: COURSE_MSG.email } });
  assertEquals(validateLead({ whatsapp: "abc", consent: true }), { ok: false, fields: { whatsapp: COURSE_MSG.whatsapp } });
  for (const source of ["Formation Index", "a".repeat(41), "", 12, null, undefined, "x_y", "<script>"]) {
    const v = validateLead({ email: "a@b.co", consent: true, source });
    assert(v.ok && v.source === "autre", String(source));
  }
});

Deno.test("course catalogue: constants and French typography", () => {
  assertEquals(COURSE_PRODUCTS, ["pq_essentiel"]);
  assertEquals(PRICING_COURSES, ["pq_essentiel"], "re-exported by pricing.ts");
  assertEquals(RESERVED_COURSE_PRODUCTS, ["pq_complet", "imf_kit"]);
  const c = COURSE_CATALOG.pq_essentiel;
  assertEquals([c.title, c.edition, c.assetPrefix], ["Power Query pour le reporting bancaire", "Essentiel", "pq_essentiel/"]);
  assertEquals(c.label, `Formation «${NBSP}Power Query pour le reporting bancaire${NBSP}» — édition Essentiel`);
  assertEquals(RECEIPT_SELLER_TEXT, `Vendeur${NBSP}: particulier — reçu de paiement, pas une facture`);
  assertEquals(ATTESTATION_KIND, "Attestation de suivi — non diplômante");
  assertEquals(licenceLine("Awa Ndiaye", "TCV-7K2M9QXA"), "Licence personnelle — Awa Ndiaye — TCV-7K2M9QXA");
  assert(!LEAD_CONSENT_TEXT.includes("\n") && !LEAD_CONSENT_TEXT.includes("’") && !LEAD_CONSENT_TEXT.includes("&"));
  assertMatch(LEAD_CONSENT_TEXT, /^J'accepte d'être prévenu\(e\) .* 12 mois après mon inscription\.$/);
  for (const s of [c.label, c.title, c.subtitle, RECEIPT_SELLER_TEXT, ATTESTATION_KIND, LEAD_CONSENT_TEXT]) {
    assert(!/(\S)[:;!?]/.test(s.replace(/https?:\/\/\S+/g, "")), `NBSP before high punctuation: ${s}`);
    assert(!/ [:;!?»]|« /.test(s), `no plain space where an NBSP belongs: ${s}`);
  }
});

Deno.test("pricing: the course is not a document product; its price comes from coursePrices", () => {
  assertEquals(PRODUCTS, ["cv", "lettre", "pack", "stage", "premium"]);
  assert(isCourseProduct("pq_essentiel"));
  for (const v of ["pq_complet", "imf_kit", "cv", "", null, 1]) assert(!isCourseProduct(v), String(v));
  assert(!isProduct("pq_essentiel"));
  const config = loadConfig(envFrom({}));
  assertEquals(priceOf("pq_essentiel", config), 25000);
  assertEquals(orderPrice("pq_essentiel", {}, config), 25000);
  assertEquals(priceOf("cv", config), 1000);
  // The document path keeps refusing every course id (sold or reserved).
  for (const product of ["pq_essentiel", "pq_complet", "imf_kit"]) {
    const v = validateOrderRequest(orderBody("cv", { product }));
    assert(!v.ok && v.fields.product === "Valeur invalide.", product);
  }
});

Deno.test("config: PRICE_PQ_ESSENTIEL (default 25 000) and PQ_SALES_OPEN (default false) from env or tcv.settings", () => {
  const none = loadConfig(envFrom({}));
  assertEquals([none.coursePrices, none.pqSalesOpen], [{ pq_essentiel: 25000 }, false]);
  assertEquals(none.prices, { cv: 1000, lettre: 1000, pack: 1500, stage: 1500, premium: 5000 }, "document prices unchanged");
  assertEquals(loadConfig(envFrom({ PRICE_PQ_ESSENTIEL: "20000" })).coursePrices.pq_essentiel, 20000);
  assertEquals(loadConfig(envFrom({}), { PRICE_PQ_ESSENTIEL: "30000" }).coursePrices.pq_essentiel, 30000);
  assertEquals(loadConfig(envFrom({ PRICE_PQ_ESSENTIEL: "22000" }), { PRICE_PQ_ESSENTIEL: "30000" }).coursePrices.pq_essentiel, 22000);
  for (const bad of ["abc", "0", "-1", "25 000", "2.5"]) {
    assertEquals(loadConfig(envFrom({ PRICE_PQ_ESSENTIEL: bad })).coursePrices.pq_essentiel, 25000, bad);
  }
  for (const yes of ["true", "TRUE", "1", "yes", "oui", "On"]) assertEquals(loadConfig(envFrom({ PQ_SALES_OPEN: yes })).pqSalesOpen, true, yes);
  for (const no of ["false", "0", "no", "non", "off", "maybe", " "]) assertEquals(loadConfig(envFrom({ PQ_SALES_OPEN: no })).pqSalesOpen, false, no);
  assertEquals(loadConfig(envFrom({}), { PQ_SALES_OPEN: "true" }).pqSalesOpen, true, "opened from tcv.settings");
  assertEquals(loadConfig(envFrom({ PQ_SALES_OPEN: "false" }), { PQ_SALES_OPEN: "true" }).pqSalesOpen, false, "env wins");
});

Deno.test("ids: newRandomId = prefix + Crockford base32 characters", () => {
  assertMatch(newRandomId("LD-", 8), /^LD-[0-9A-HJKMNP-TV-Z]{8}$/);
  assertMatch(newRandomId("QA-", 10), /^QA-[0-9A-HJKMNP-TV-Z]{10}$/);
  const many = new Set(Array.from({ length: 200 }, () => newRandomId("LD-", 8)));
  assertEquals(many.size, 200);
});
