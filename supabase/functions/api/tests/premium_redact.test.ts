// CV Premium preview redaction: what sells the design stays visible (name, headline, contacts, key figures,
// domain and achievement titles, first tag per card, experience heads, education, skill bars, languages,
// qualities); the quote, details, other tags, bullets, personal lines and the profile after 8 words are
// masked runs, and no hidden-only word can be found anywhere in the preview.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import type { Document } from "../lib/types.ts";
import { generateDocument } from "../lib/generator/index.ts";
import { redactDocument } from "../lib/redact.ts";
import { validateOrderRequest } from "../lib/validate.ts";
import { premiumBody, randomPremiumInput } from "./fixtures/premium_inputs.ts";

const NOW = new Date("2026-10-18T09:30:00Z");
const MASKED = /^[█ ]*$/;
const RUNS = 200;

const words = (s: string) => s.match(/\p{L}+/gu) ?? [];
const firstWords = (s: string, n: number) => s.split(/\s+/).filter(Boolean).slice(0, n).join(" ");
const restWords = (s: string, n: number) => s.split(/\s+/).filter(Boolean).slice(n).join(" ");

function premiumDoc(i: number): Document {
  const res = validateOrderRequest(premiumBody(randomPremiumInput(i)));
  if (!res.ok) throw new Error(JSON.stringify(res.fields));
  return generateDocument(res.data, "premium", { seed: `TCV-PRED${i}`, now: NOW });
}

/** Splits a premium document into the text a preview may show and the text it must hide. */
function partition(doc: Document): { visible: string[]; hidden: string[] } {
  const cv = doc.cv!;
  const p = cv.premium!;
  const visible = [
    cv.fullName,
    cv.title,
    ...cv.contacts,
    firstWords(cv.profile, 8),
    ...cv.skills.slice(0, 3),
    ...cv.it,
    ...cv.interests,
    ...cv.experiences.flatMap((e) => [e.title, e.company, e.place, e.period]),
    ...cv.education.flatMap((e) => [e.degree, e.school, e.year, e.detail]),
    ...cv.languages.flatMap((l) => [l.name, l.level]),
    p.headline,
    ...p.keyFigures.flatMap((f) => [f.value, f.label]),
    ...p.domains.map((d) => d.title),
    ...p.achievements.flatMap((a) => [a.title, ...a.tags.slice(0, 1)]),
    ...p.skillLevels.flatMap((s) => [s.name, s.level]),
    ...p.qualities,
    p.accent,
  ];
  const hidden = [
    restWords(cv.profile, 8),
    ...cv.skills.slice(3),
    ...cv.experiences.flatMap((e) => e.bullets),
    p.quote,
    ...p.domains.map((d) => d.detail),
    ...p.achievements.flatMap((a) => [a.detail, ...a.tags.slice(1)]),
    ...p.personal,
  ];
  return { visible, hidden };
}

function allStrings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(allStrings);
  if (v && typeof v === "object") return Object.values(v).flatMap(allStrings);
  return [];
}

Deno.test(`premium redact: visible parts untouched, hidden parts masked (${RUNS} random documents)`, () => {
  for (let i = 0; i < RUNS; i++) {
    const doc = premiumDoc(i);
    const before = structuredClone(doc);
    const red = redactDocument(doc);
    assertEquals(doc, before, "redaction must not mutate its input");
    assertEquals(red.lettre, null);
    const p = doc.cv!.premium!;
    const r = red.cv!.premium!;
    assertEquals([r.headline, r.accent], [p.headline, p.accent]);
    assertEquals(r.keyFigures, p.keyFigures);
    assertEquals(r.skillLevels, p.skillLevels);
    assertEquals(r.qualities, p.qualities);
    assertMatch(r.quote, MASKED);
    assert(r.quote.length > 0, "the masked quote keeps its place in the layout");
    assertEquals(r.domains.length, p.domains.length);
    r.domains.forEach((d, j) => {
      assertEquals(d.title, p.domains[j].title);
      assertMatch(d.detail, MASKED);
    });
    assertEquals(r.achievements.length, p.achievements.length);
    r.achievements.forEach((a, j) => {
      const src = p.achievements[j];
      assertEquals(a.title, src.title);
      assertMatch(a.detail, MASKED);
      assertEquals(a.tags.length, src.tags.length);
      if (src.tags.length) assertEquals(a.tags[0], src.tags[0]);
      for (const t of a.tags.slice(1)) assertMatch(t, MASKED);
    });
    assertEquals(r.personal.length, p.personal.length);
    for (const l of r.personal) assertMatch(l, MASKED);
    // The regular CV part follows the regular rules.
    const cv = doc.cv!;
    const rcv = red.cv!;
    assert(rcv.profile.startsWith(firstWords(cv.profile, 8)));
    assertMatch(rcv.profile.slice(firstWords(cv.profile, 8).length), MASKED);
    for (const e of rcv.experiences) for (const b of e.bullets) assertMatch(b, MASKED);
    assertEquals(rcv.education, cv.education);
    assertEquals(rcv.contacts, cv.contacts);
  }
});

Deno.test("premium redact leak test: no hidden-only word (≥ 4 letters) survives anywhere in the preview", () => {
  let checked = 0;
  for (let i = 0; i < RUNS; i++) {
    const doc = premiumDoc(1000 + i);
    const { visible, hidden } = partition(doc);
    const visibleWords = new Set(visible.flatMap(words).map((w) => w.toLowerCase()));
    const hiddenOnly = new Set(
      hidden.flatMap(words).map((w) => w.toLowerCase()).filter((w) => w.length >= 4 && !visibleWords.has(w)),
    );
    const red = redactDocument(doc);
    // Every string value of the preview (object keys such as "place" or "title" are the schema, not content).
    const json = JSON.stringify(allStrings(red));
    const redactedWords = new Set(allStrings(red).flatMap(words).map((w) => w.toLowerCase()));
    for (const w of hiddenOnly) {
      assert(!redactedWords.has(w), `seed ${i}: hidden word "${w}" leaked`);
      assert(!new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, "iu").test(json), `seed ${i}: "${w}" in redacted JSON`);
      checked++;
    }
    // Digits of hidden details (amounts, rates) do not leak either: masks count letters and digits alike.
    for (const s of allStrings(red.cv!.premium!.achievements.map((a) => a.detail))) assert(!/\d/.test(s));
  }
  assert(checked > 3000, `only ${checked} hidden words were checked`);
});

Deno.test("premium redact: the other products keep their exact preview shape (no premium key)", () => {
  const res = validateOrderRequest(premiumBody(randomPremiumInput(3)));
  assert(res.ok);
  for (const product of ["cv", "pack"] as const) {
    const red = redactDocument(generateDocument(res.data, product, { seed: "R", now: NOW }));
    assert(red.cv && !("premium" in red.cv), product);
  }
});
