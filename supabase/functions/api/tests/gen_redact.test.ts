// Preview redaction: visible fields untouched, masked runs made only of "█" and spaces, and no word
// that exists only in a hidden field can be found anywhere in the redacted document.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import type { Document } from "../lib/types.ts";
import { generateDocument } from "../lib/generator/index.ts";
import { keepFirstWords, maskText, redactDocument } from "../lib/redact.ts";
import { randomInput } from "./gen_inputs.test.ts";

const NOW = new Date("2026-10-01T09:30:00Z");
const MASKED = /^[█ ]*$/;

const words = (s: string) => s.match(/\p{L}+/gu) ?? [];
const firstWords = (s: string, n: number) => s.split(/\s+/).filter(Boolean).slice(0, n).join(" ");
const restWords = (s: string, n: number) => s.split(/\s+/).filter(Boolean).slice(n).join(" ");

/** Splits a full document into the text a preview may show and the text it must hide. */
function partition(doc: Document): { visible: string[]; hidden: string[] } {
  const visible: string[] = [];
  const hidden: string[] = [];
  if (doc.cv) {
    const cv = doc.cv;
    visible.push(cv.fullName, cv.title, ...cv.contacts, firstWords(cv.profile, 8), ...cv.skills.slice(0, 3), ...cv.it);
    for (const e of cv.experiences) visible.push(e.title, e.company, e.place, e.period);
    for (const e of cv.education) visible.push(e.degree, e.school, e.year, e.detail);
    for (const l of cv.languages) visible.push(l.name, l.level);
    visible.push(...cv.interests);
    hidden.push(restWords(cv.profile, 8), ...cv.skills.slice(3), ...cv.experiences.flatMap((e) => e.bullets));
  }
  if (doc.lettre) {
    const l = doc.lettre;
    visible.push(...l.sender, ...l.recipient, l.placeDate, l.subject, l.salutation, l.closing, l.signature);
    visible.push(firstWords(l.paragraphs[0], 12));
    hidden.push(restWords(l.paragraphs[0], 12), ...l.paragraphs.slice(1));
  }
  return { visible, hidden };
}

function allStrings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(allStrings);
  if (v && typeof v === "object") return Object.values(v).flatMap(allStrings);
  return [];
}

Deno.test("redact mask format: one █ per letter, max 12 per word", () => {
  assertEquals(maskText("Bonjour à tous."), "███████ █ ████");
  assertEquals(maskText("anticonstitutionnellement"), "████████████");
  assertEquals(maskText("  l'équipe  —  2024 "), "███████ ████");
  assertEquals(maskText(""), "");
  assertEquals(keepFirstWords("un deux trois quatre", 2), "un deux █████ ██████");
  assertEquals(keepFirstWords("un deux", 8), "un deux");
});

Deno.test("redact keeps the visible fields and masks the rest (200 random documents)", () => {
  for (let i = 0; i < 200; i++) {
    const { input } = randomInput(1000 + i);
    const doc = generateDocument(input, "pack", { seed: `TCV-RED${i}`, now: NOW });
    const before = structuredClone(doc);
    const red = redactDocument(doc);
    assertEquals(doc, before, "redaction must not mutate its input");
    const cv = doc.cv!;
    const rcv = red.cv!;
    assertEquals(
      { ...rcv, profile: "", skills: [], experiences: [] },
      { ...cv, profile: "", skills: [], experiences: [] },
    );
    assert(rcv.profile.startsWith(firstWords(cv.profile, 8)), rcv.profile);
    assertMatch(rcv.profile.slice(firstWords(cv.profile, 8).length), MASKED);
    assertEquals(rcv.skills.slice(0, 3), cv.skills.slice(0, 3));
    for (const s of rcv.skills.slice(3)) assertMatch(s, MASKED);
    assertEquals(rcv.skills.length, cv.skills.length);
    rcv.experiences.forEach((e, j) => {
      const { bullets, ...rest } = cv.experiences[j];
      assertEquals({ ...e, bullets: [] }, { ...rest, bullets: [] });
      assertEquals(e.bullets.length, bullets.length);
      for (const b of e.bullets) assertMatch(b, MASKED);
    });

    const l = doc.lettre!;
    const rl = red.lettre!;
    assertEquals({ ...rl, paragraphs: [] }, { ...l, paragraphs: [] });
    assertEquals(rl.paragraphs.length, 4);
    assert(rl.paragraphs[0].startsWith(firstWords(l.paragraphs[0], 12)));
    assertMatch(rl.paragraphs[0].slice(firstWords(l.paragraphs[0], 12).length), MASKED);
    for (const p of rl.paragraphs.slice(1)) {
      assertMatch(p, MASKED);
      assert(p.length > 0);
    }
  }
});

Deno.test("redact leak test: no hidden-only word (≥ 4 letters) survives anywhere in the preview", () => {
  let hiddenWordsChecked = 0;
  for (let i = 0; i < 200; i++) {
    const { input, product } = randomInput(5000 + i);
    const doc = generateDocument(input, product, { seed: `TCV-LEAK${i}`, now: NOW });
    const { visible, hidden } = partition(doc);
    const visibleWords = new Set(visible.flatMap(words).map((w) => w.toLowerCase()));
    const hiddenOnly = new Set(
      hidden.flatMap(words).map((w) => w.toLowerCase()).filter((w) => w.length >= 4 && !visibleWords.has(w)),
    );
    const red = redactDocument(doc);
    const json = JSON.stringify(red);
    const redactedWords = new Set(allStrings(red).flatMap(words).map((w) => w.toLowerCase()));
    for (const w of hiddenOnly) {
      assert(!redactedWords.has(w), `seed ${i}: hidden word "${w}" leaked`);
      assert(!new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, "iu").test(json), `seed ${i}: "${w}" in redacted JSON`);
      hiddenWordsChecked++;
    }
  }
  assert(hiddenWordsChecked > 5000, `only ${hiddenWordsChecked} hidden words were checked`);
});

Deno.test("redact handles single-product documents", () => {
  const { input } = randomInput(42);
  const cvOnly = redactDocument(generateDocument(input, "cv", { seed: "R", now: NOW }));
  assertEquals(cvOnly.lettre, null);
  assert(cvOnly.cv);
  const lettreOnly = redactDocument(generateDocument(input, "lettre", { seed: "R", now: NOW }));
  assertEquals(lettreOnly.cv, null);
  assert(lettreOnly.lettre);
});
