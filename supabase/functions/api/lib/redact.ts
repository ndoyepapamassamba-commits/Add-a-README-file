// STUB — replaced by the generator owner. Signature is final.
import type { Document } from "./types.ts";

const mask = (s: string) => s.split(/\s+/).filter(Boolean).map((w) => "█".repeat(Math.min(w.length, 12))).join(" ");

export function redactDocument(doc: Document): Document {
  const d: Document = structuredClone(doc);
  if (d.cv) {
    d.cv.profile = mask(d.cv.profile);
    d.cv.experiences = d.cv.experiences.map((e) => ({ ...e, bullets: e.bullets.map(mask) }));
  }
  if (d.lettre) d.lettre.paragraphs = d.lettre.paragraphs.map(mask);
  return d;
}
