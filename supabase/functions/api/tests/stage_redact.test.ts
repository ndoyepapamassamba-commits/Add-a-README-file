// Pack Stage preview redaction: cv as before, lettres[0] like a lettre, lettres[1..] with only the
// recipient block and subject readable, the sending message with only its e-mail subject readable — and no
// word of a hidden paragraph or of a company reason anywhere in the preview.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import type { Document } from "../lib/types.ts";
import { generateDocument } from "../lib/generator/index.ts";
import { redactDocument } from "../lib/redact.ts";
import { randomStageInput } from "./fixtures/stage_inputs.ts";
import { randomInput } from "./gen_inputs.test.ts";

const NOW = new Date("2026-10-01T09:30:00Z");
const MASKED = /^[█ ]+$/;

const words = (s: string) => s.match(/\p{L}+/gu) ?? [];
const firstWords = (s: string, n: number) => s.split(/\s+/).filter(Boolean).slice(0, n).join(" ");
const restWords = (s: string, n: number) => s.split(/\s+/).filter(Boolean).slice(n).join(" ");

function allStrings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(allStrings);
  if (v && typeof v === "object") return Object.values(v).flatMap(allStrings);
  return [];
}

/** Splits a Pack Stage document into the text a preview may show and the text it must hide. */
function partition(doc: Document): { visible: string[]; hidden: string[] } {
  const visible: string[] = [];
  const hidden: string[] = [];
  const cv = doc.cv!;
  visible.push(cv.fullName, cv.title, ...cv.contacts, firstWords(cv.profile, 8), ...cv.skills.slice(0, 3), ...cv.it);
  for (const e of cv.experiences) visible.push(e.title, e.company, e.place, e.period);
  for (const e of cv.education) visible.push(e.degree, e.school, e.year, e.detail);
  for (const l of cv.languages) visible.push(l.name, l.level);
  visible.push(...cv.interests);
  hidden.push(restWords(cv.profile, 8), ...cv.skills.slice(3), ...cv.experiences.flatMap((e) => e.bullets));
  doc.lettres!.forEach((l, i) => {
    visible.push(...l.sender, ...l.recipient, l.placeDate, l.subject, l.salutation, l.closing, l.signature);
    if (i === 0) {
      visible.push(firstWords(l.paragraphs[0], 12));
      hidden.push(restWords(l.paragraphs[0], 12), ...l.paragraphs.slice(1));
    } else {
      hidden.push(...l.paragraphs);
    }
  });
  visible.push(doc.envoi!.emailSubject);
  hidden.push(doc.envoi!.emailBody, doc.envoi!.whatsapp);
  return { visible, hidden };
}

Deno.test("stage redact: visible fields kept, every hidden paragraph and message fully masked (200 orders)", () => {
  for (let i = 0; i < 200; i++) {
    const input = randomStageInput(3000 + i);
    const doc = generateDocument(input, "stage", { seed: `TCV-SRED${i}`, now: NOW });
    const before = structuredClone(doc);
    const red = redactDocument(doc);
    assertEquals(doc, before, "redaction must not mutate its input");
    assertEquals(Object.keys(red).sort(), ["cv", "envoi", "lettre", "lettres"]);
    assertEquals(red.lettre, null);
    assertEquals(red.cv, redactDocument({ cv: doc.cv, lettre: null }).cv, "cv follows the existing rules");

    assertEquals(red.lettres!.length, doc.lettres!.length);
    red.lettres!.forEach((rl, j) => {
      const l = doc.lettres![j];
      assertEquals({ ...rl, paragraphs: [] }, { ...l, paragraphs: [] }, `seed ${i} letter ${j}: header and closing visible`);
      assertEquals(rl.paragraphs.length, 4);
      if (j === 0) {
        assert(rl.paragraphs[0].startsWith(firstWords(l.paragraphs[0], 12)), rl.paragraphs[0]);
        assertMatch(rl.paragraphs[0].slice(firstWords(l.paragraphs[0], 12).length).trim(), /^[█ ]*$/);
        for (const p of rl.paragraphs.slice(1)) assertMatch(p, MASKED);
      } else {
        for (const p of rl.paragraphs) assertMatch(p, MASKED, `seed ${i} letter ${j}: ${p}`);
      }
    });

    const e = doc.envoi!;
    assertEquals(red.envoi!.emailSubject, e.emailSubject);
    assertMatch(red.envoi!.emailBody, MASKED);
    assertMatch(red.envoi!.whatsapp, MASKED);
  }
});

Deno.test("stage redact leak test: no hidden-only word (≥ 4 letters), and no reason word, survives in the preview", () => {
  let hiddenWordsChecked = 0;
  let reasonWordsChecked = 0;
  for (let i = 0; i < 200; i++) {
    const input = randomStageInput(7000 + i);
    const doc = generateDocument(input, "stage", { seed: `TCV-SLEAK${i}`, now: NOW });
    const { visible, hidden } = partition(doc);
    const visibleWords = new Set(visible.flatMap(words).map((w) => w.toLowerCase()));
    const hiddenOnly = new Set(
      hidden.flatMap(words).map((w) => w.toLowerCase()).filter((w) => w.length >= 4 && !visibleWords.has(w)),
    );
    const red = redactDocument(doc);
    // Values only: the keys of the Document ("lettre", "lettres", "envoi") are not text.
    const json = allStrings(red).join("\n");
    const redactedWords = new Set(allStrings(red).flatMap(words).map((w) => w.toLowerCase()));
    for (const w of hiddenOnly) {
      assert(!redactedWords.has(w), `seed ${i}: hidden word "${w}" leaked`);
      assert(!new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, "iu").test(json), `seed ${i}: "${w}" in the redacted values`);
      hiddenWordsChecked++;
    }
    // The student's reasons are the most personal part: none of their words may show unless visible anyway.
    for (const co of input.internship!.companies) {
      for (const w of words(co.reason).map((x) => x.toLowerCase()).filter((x) => x.length >= 4 && !visibleWords.has(x))) {
        assert(!redactedWords.has(w), `seed ${i}: reason word "${w}" leaked`);
        reasonWordsChecked++;
      }
    }
  }
  assert(hiddenWordsChecked > 10000, `only ${hiddenWordsChecked} hidden words were checked`);
  assert(reasonWordsChecked > 1000, `only ${reasonWordsChecked} reason words were checked`);
});

Deno.test("stage redact: documents of the other products keep their exact shape", () => {
  for (let i = 0; i < 30; i++) {
    const { input, product } = randomInput(i);
    const red = redactDocument(generateDocument(input, product, { seed: `R${i}`, now: NOW }));
    assertEquals(Object.keys(red), ["cv", "lettre"], "no lettres/envoi keys for cv, lettre, pack");
  }
  const nullEnvoi = redactDocument({ cv: null, lettre: null, lettres: [], envoi: null });
  assertEquals(nullEnvoi, { cv: null, lettre: null, lettres: [], envoi: null });
});
