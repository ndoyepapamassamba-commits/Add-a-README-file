// Golden samples for the Pack Stage: fixtures/samples_stage.md holds the full rendered student CV, every
// letter and the sending message of four student personas, so a human can read what customers get.
// Regenerate after an intended change:
//   TCV_WRITE_SAMPLES=1 deno test -A supabase/functions/api/tests/stage_samples.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import type { CvDoc, Document, EnvoiDoc, LettreDoc } from "../lib/types.ts";
import { generateDocument } from "../lib/generator/index.ts";
import { personaInput, STAGE_PERSONAS } from "./fixtures/stage_personas.ts";

const NOW = new Date("2026-10-01T10:00:00Z");
const SAMPLES_URL = new URL("./fixtures/samples_stage.md", import.meta.url);

function renderCv(cv: CvDoc): string[] {
  const out = [`**${cv.fullName}** — ${cv.title}`, "", cv.contacts.join(" · "), "", "**Profil**", "", cv.profile];
  if (cv.education.length) {
    out.push("", "**Formation**", "");
    for (const e of cv.education) out.push(`- ${[e.degree, e.school, e.year, e.detail].filter(Boolean).join(" — ")}`);
  }
  if (cv.experiences.length) {
    out.push("", "**Expériences, projets académiques et activités**");
    for (const e of cv.experiences) {
      const head = [e.title, e.company, e.place].filter(Boolean).join(" — ");
      out.push("", `- ${head}${e.period ? ` (${e.period})` : ""}`);
      for (const b of e.bullets) out.push(`  - ${b}`);
    }
  }
  if (cv.skills.length) out.push("", `**Compétences** : ${cv.skills.join(", ")}`);
  if (cv.it.length) out.push("", `**Informatique** : ${cv.it.join(", ")}`);
  if (cv.languages.length) out.push("", `**Langues** : ${cv.languages.map((l) => `${l.name} (${l.level})`).join(", ")}`);
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

function renderEnvoi(e: EnvoiDoc): string[] {
  return [
    `**Objet de l'e-mail** : ${e.emailSubject}`,
    "",
    "**E-mail**",
    "",
    "```text",
    e.emailBody,
    "```",
    "",
    `**WhatsApp** (${[...e.whatsapp].length} caractères)`,
    "",
    "```text",
    e.whatsapp,
    "```",
  ];
}

export function renderStageSamples(): string {
  const out = [
    "# Teranga CV — Pack Stage : exemples de documents générés",
    "",
    "Rendu texte du générateur déterministe (sans réécriture IA) pour quatre profils d'étudiants fictifs :",
    "CV étudiant, une lettre de demande de stage par entreprise, message d'envoi (e-mail et WhatsApp).",
    "Fichier produit par `tests/stage_samples.test.ts` ; ne pas modifier à la main.",
    "",
  ];
  STAGE_PERSONAS.forEach((p, i) => {
    const doc: Document = generateDocument(personaInput(p), "stage", { seed: p.id, now: NOW });
    out.push(`## ${i + 1}. ${p.label}`, "", `Graine \`${p.id}\`, produit \`stage\`.`, "");
    out.push("### CV", "", ...renderCv(doc.cv!), "");
    doc.lettres!.forEach((l, j) => out.push(`### Lettre ${j + 1}`, "", ...renderLettre(l), ""));
    out.push("### Message d'envoi", "", ...renderEnvoi(doc.envoi!), "", "---", "");
  });
  return out.join("\n");
}

Deno.test("stage samples: every persona passes the real validator", () => {
  for (const p of STAGE_PERSONAS) {
    const input = personaInput(p);
    assertEquals(input.target.kind, "stage");
    assert(input.internship!.companies.length >= 1);
  }
});

Deno.test("stage samples: fixtures/samples_stage.md matches the generator output", async () => {
  const rendered = renderStageSamples();
  if (Deno.env.get("TCV_WRITE_SAMPLES") === "1") {
    await Deno.writeTextFile(SAMPLES_URL, rendered);
    return;
  }
  const current = await Deno.readTextFile(SAMPLES_URL).catch(() => "");
  assertEquals(current, rendered, "samples_stage.md is stale: run with TCV_WRITE_SAMPLES=1 and review the diff");
});
