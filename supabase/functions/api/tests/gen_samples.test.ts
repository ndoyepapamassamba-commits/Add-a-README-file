// Golden samples: fixtures/samples.md holds the full rendered CV and lettre of every persona of
// gen_personas.test.ts, so a human can read what customers get and any change to the banks shows up in review.
// Regenerate after an intended change: TCV_WRITE_SAMPLES=1 deno test -A supabase/functions/api/tests/gen_samples.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import type { CvDoc, Document, LettreDoc } from "../lib/types.ts";
import { generateDocument } from "../lib/generator/index.ts";
import { validateOrderRequest } from "../lib/validate.ts";
import { PERSONAS } from "./gen_personas.test.ts";

const NOW = new Date("2026-10-01T10:00:00Z");
const SAMPLES_URL = new URL("./fixtures/samples.md", import.meta.url);

function renderCv(cv: CvDoc): string[] {
  const out = [`**${cv.fullName}** — ${cv.title}`, "", cv.contacts.join(" · "), "", "**Profil**", "", cv.profile];
  if (cv.experiences.length) {
    out.push("", "**Expériences professionnelles**");
    for (const e of cv.experiences) {
      const head = [e.title, e.company, e.place].filter(Boolean).join(" — ");
      out.push("", `- ${head}${e.period ? ` (${e.period})` : ""}`);
      for (const b of e.bullets) out.push(`  - ${b}`);
    }
  }
  if (cv.education.length) {
    out.push("", "**Formation**", "");
    for (const e of cv.education) out.push(`- ${[e.degree, e.school, e.year, e.detail].filter(Boolean).join(" — ")}`);
  }
  if (cv.skills.length) out.push("", `**Compétences** : ${cv.skills.join(", ")}`);
  if (cv.it.length) out.push("", `**Informatique** : ${cv.it.join(", ")}`);
  if (cv.languages.length) {
    out.push(
      "",
      `**Langues** : ${cv.languages.map((l) => `${l.name} (${l.level})`).join(", ")}`,
    );
  }
  if (cv.interests.length) out.push("", `**Centres d'intérêt** : ${cv.interests.join(", ")}`);
  return out;
}

function renderLettre(l: LettreDoc): string[] {
  return [
    ...l.sender.map((s) => `${s}  `),
    "",
    ...l.recipient.map((s) => `${s}  `),
    "",
    l.placeDate,
    "",
    `**${l.subject}**`,
    "",
    l.salutation,
    "",
    ...l.paragraphs.flatMap((p) => [p, ""]),
    l.closing,
    "",
    l.signature,
  ];
}

export function renderSamples(): string {
  const out = [
    "# Teranga CV — exemples de documents générés",
    "",
    `Rendu texte du générateur déterministe (sans réécriture IA) pour ${PERSONAS.length} profils fictifs.`,
    "Les profils « REVIEW » sont saisis comme sur un téléphone : minuscules, MAJUSCULES, sans accents, une",
    "seule ligne, listes dans une seule case ; le générateur doit malgré tout produire un français soigné.",
    "Fichier produit par `tests/gen_samples.test.ts` ; ne pas modifier à la main.",
    "",
  ];
  PERSONAS.forEach((p, i) => {
    const doc: Document = generateDocument(p.input, p.product, { seed: p.id, now: NOW });
    out.push(`## ${i + 1}. ${p.label}`, "", `Graine \`${p.id}\`, produit \`${p.product}\`.`, "");
    if (doc.cv) out.push("### CV", "", ...renderCv(doc.cv), "");
    if (doc.lettre) out.push("### Lettre de motivation", "", ...renderLettre(doc.lettre), "");
    out.push("---", "");
  });
  return out.join("\n");
}

Deno.test("gen samples: every persona is a valid form submission", () => {
  for (const p of PERSONAS) {
    const res = validateOrderRequest({ product: p.product, template: "classique", data: p.input });
    assert(res.ok, `${p.id}: ${JSON.stringify(!res.ok && res.fields)}`);
  }
});

Deno.test("gen samples: fixtures/samples.md matches the generator output", async () => {
  const rendered = renderSamples();
  if (Deno.env.get("TCV_WRITE_SAMPLES") === "1") {
    await Deno.writeTextFile(SAMPLES_URL, rendered);
    return;
  }
  const current = await Deno.readTextFile(SAMPLES_URL).catch(() => "");
  assertEquals(current, rendered, "samples.md is stale: run with TCV_WRITE_SAMPLES=1 and review the diff");
});
