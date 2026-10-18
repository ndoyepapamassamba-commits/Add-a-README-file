// Regression tests for the faults found by reading the CV and lettre of the "typed on a phone" personas
// (gen_personas.test.ts) as a Dakar recruiter and a French copy-editor. One test per class of fault,
// each checked over many seeds so that no variant of a phrase bank can bring the fault back.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import type { Document, OrderInput, Product } from "../lib/types.ts";
import { generateDocument } from "../lib/generator/index.ts";
import { DEFAULT_QUALITIES, NEUTRAL_GAIN, QUALITY_STEMS, SECTOR_CONTEXT } from "../lib/generator/banks.ts";
import { PERSONAS } from "./gen_personas.test.ts";

const NOW = new Date("2026-10-18T10:00:00Z");
const SEEDS = 40;

function persona(id: string): { input: OrderInput; product: Product } {
  const p = PERSONAS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown persona ${id}`);
  return { input: structuredClone(p.input), product: p.product };
}

function docs(input: OrderInput, product: Product = "pack", n = SEEDS): Document[] {
  return Array.from({ length: n }, (_, i) => generateDocument(input, product, { seed: `TCV-RV${i}`, now: NOW }));
}

function lettreText(d: Document): string {
  const l = d.lettre!;
  return [...l.sender, ...l.recipient, l.placeDate, l.subject, ...l.paragraphs].join("\n");
}

function cvText(d: Document): string {
  const cv = d.cv!;
  return [cv.title, ...cv.contacts, cv.profile, ...cv.experiences.flatMap((e) => [e.title, e.company, e.place])].join(
    "\n",
  );
}

Deno.test("review: qualities typed as adjectives are listed after « je suis », agreed, never « preuve de patiente »", () => {
  const { input } = persona("TCV-REVIEW04"); // Mme, qualities: patiente, serieuse, ponctuelle
  for (const d of docs(input, "lettre")) {
    const p3 = d.lettre!.paragraphs[2];
    assert(!/preuve (de|d')\s*(patiente|s[ée]rieuse)/.test(p3), p3);
    assertMatch(p3, /je suis [^.]*patiente[^.]*sérieuse/i, p3);
  }
  input.identity.civility = "M";
  input.letter!.qualities = ["patiente", "Souriant", "curiosité", "très calme"];
  for (const d of docs(input, "lettre", 10)) {
    const p3 = d.lettre!.paragraphs[2];
    assertMatch(p3, /je suis [^.]*patient\b[^.]*souriant\b/i, p3);
    assert(!/patiente|souriante/.test(p3), `masculine forms expected: ${p3}`);
    assert(p3.includes("très calme"), p3);
    assert(p3.includes("preuve de curiosité"), p3);
  }
});

Deno.test("review: « jusqu'a maintenant », « à ce jour », « toujours » mean a current job", () => {
  for (const end of ["jusqu'a maintenant", "à ce jour", "toujours", "Maintenant"]) {
    const { input } = persona("TCV-REVIEW04");
    input.experiences[0].end = end;
    for (const d of docs(input, "pack", 12)) {
      assertEquals(d.cv!.experiences[0].period, "Depuis 2021", end);
      const text = `${d.cv!.profile}\n${d.lettre!.paragraphs[1]}`;
      assert(
        !/ à jusqu|de 2021 à|jusqu'a|comprenaient|j'étais|J'y étais|j'ai exercé|J'ai notamment exercé/i.test(text),
        text,
      );
    }
  }
});

Deno.test("review: text typed in capitals reads in normal case; acronyms stay", () => {
  const { input } = persona("TCV-REVIEW14"); // SECRETAIRE DE DIRECTION, MINISTERE DE LA SANTE…
  for (const d of docs(input)) {
    const text = `${cvText(d)}\n${d.cv!.skills.join(", ")}\n${d.cv!.it.join(", ")}\n${lettreText(d)}`;
    const shouted = (text.match(/\p{Lu}{2,}/gu) ?? []).filter((w) => !["BTS", "ISEG", "HLM", "DIENG"].includes(w));
    assertEquals(shouted, [], text);
    assertEquals(d.cv!.title, "Secrétaire de direction");
    assertEquals(d.lettre!.subject, "Objet : Candidature au poste de secrétaire de direction");
    assertEquals(d.lettre!.placeDate, "Dakar, le 18 octobre 2026");
    assertEquals(d.cv!.contacts.at(-1), "HLM Grand Yoff, Dakar");
  }
});

Deno.test("review: text typed in lower case gets its capitals, accents, brands and acronyms back", () => {
  const r01 = docs(persona("TCV-REVIEW01").input); // comptable, dakar, bac s2 2019, cabinet ndiaye et freres
  for (const d of r01) {
    assertEquals(d.cv!.education[0], { degree: "Bac S2", school: "", year: "2019", detail: "" });
    assertEquals(d.cv!.it, ["Word", "Excel"]);
    assertEquals(d.lettre!.recipient[1], "Cabinet Ndiaye et Frères");
    assert(!/bac s2 2019|bac s2\b|\(word|cabinet ndiaye/.test(lettreText(d) + cvText(d)), lettreText(d));
  }
  for (const d of docs(persona("TCV-REVIEW02").input)) { // vendeuse, pikine, bfem, auchan, facebook
    const text = lettreText(d) + cvText(d);
    assert(!/\bbfem\b|d'auchan|\bauchan|sur facebook/.test(text), text);
    assert(/BFEM/.test(text) && /Auchan/.test(text), text);
  }
  for (const d of docs(persona("TCV-REVIEW09").input)) { // keur massar, niveau 3eme
    assertEquals(d.lettre!.placeDate, "Keur Massar, le 18 octobre 2026");
    assert(!/3eme|3ème/.test(lettreText(d) + cvText(d)));
  }
  for (const d of docs(persona("TCV-REVIEW04").input)) { // hopital regional de ziguinchor, aide soignante
    const text = lettreText(d) + cvText(d) + d.cv!.skills.join(" ");
    assert(text.includes("Hôpital Régional de Ziguinchor") && text.includes("aide-soignante"), text);
    assert(!/hopital|regional|aide soignante|hygiene|\becoute|infirmiere|croix rouge/i.test(text), text);
  }
});

Deno.test("review: a generic employer (« chantier privé ») stays on the CV but out of the sentences", () => {
  for (const id of ["TCV-REVIEW09", "TCV-REVIEW05"]) {
    const { input } = persona(id);
    for (const d of docs(input)) {
      const sentences = `${d.cv!.profile}\n${d.lettre!.paragraphs.join("\n")}`;
      assert(!/chantier priv/i.test(sentences), sentences);
      assert(d.cv!.experiences.some((e) => e.company === "Chantier privé"), JSON.stringify(d.cv!.experiences));
    }
  }
});

Deno.test("review: a beginner who already holds a job never asks for a « premier emploi »", () => {
  const { input } = persona("TCV-REVIEW09"); // debutant, gardien de nuit since 2023
  const variants = new Set<string>();
  for (const d of docs(input, "pack", 80)) {
    const text = `${d.cv!.profile}\n${d.lettre!.paragraphs.join("\n")}`;
    assert(!/premier emploi|premiers pas|démarrer ma carrière|Bien que débutant/.test(text), text);
    variants.add(d.cv!.profile.split(". ")[0]);
  }
  assert(variants.size >= 3, `only ${variants.size} profile openings for a beginner in a job`);
  // Without any job the beginner phrasing is still offered.
  const fresh = persona("TCV-REVIEW01").input;
  assert(docs(fresh, "cv", 80).some((d) => /premier emploi|premiers pas/.test(d.cv!.profile)));
});

Deno.test("review: « par ailleurs », « en outre », « de plus » never open a paragraph", () => {
  for (const id of ["TCV-REVIEW02", "TCV-REVIEW09", "TCV-REVIEW16"]) { // no skills, no IT: qualities open P3
    for (const d of docs(persona(id).input, "lettre", 60)) {
      const p3 = d.lettre!.paragraphs[2];
      assert(!/^(Je suis par ailleurs|Je suis en outre|De plus)/.test(p3), p3);
    }
  }
  // After a skills sentence the linking openers stay available.
  const linked = docs(persona("TCV-REVIEW05").input, "lettre", 60).map((d) => d.lettre!.paragraphs[2]);
  assert(linked.some((p) => /\. (Je suis par ailleurs|Je suis en outre|De plus, je suis)/.test(p)));
});

Deno.test("review: a list never chains two « et »: the last link becomes « ainsi que »", () => {
  for (const id of ["TCV-REVIEW12", "TCV-REVIEW13", "TCV-REVIEW14"]) {
    for (const d of docs(persona(id).input, "lettre", 30)) {
      const missions = d.lettre!.paragraphs[1].split(". ").find((s) => /missions/.test(s));
      if (!missions) continue;
      assert(!/ et [^,]+ et /.test(missions.split(":")[1] ?? ""), missions);
      assertMatch(missions, /, ainsi que /, missions);
    }
  }
  const input = persona("TCV-REVIEW11").input;
  input.experiences[0].missions = "Collecte et saisie des commandes\nAnimation du réseau";
  const p2 = docs(input, "lettre", 30).map((d) => d.lettre!.paragraphs[1]).find((p) =>
    p.includes("Collecte") || p.includes("collecte")
  );
  assert(p2 && /saisie des commandes ainsi qu'animation du réseau/.test(p2), p2);
});

Deno.test("review: experienced candidates are not written like beginners", () => {
  for (const id of ["TCV-REVIEW03", "TCV-REVIEW08", "TCV-REVIEW14"]) { // senior DAF, institutrice, secrétaire
    for (const d of docs(persona(id).input, persona(id).product, 60)) {
      const text = `${d.cv!.profile}\n${d.lettre?.paragraphs.join("\n") ?? ""}`;
      assert(!/correspond pleinement à ma formation/.test(text), text);
      assert(!/(me permet|m'a permis) de développer des compétences/.test(text), text);
      assert(!/(une expérience qui (me permet|m'a permis)|savoir-faire et) de développer/.test(text), text);
    }
  }
});

Deno.test("review: no expression is repeated inside the profile", () => {
  for (const p of PERSONAS) {
    if (!p.input.experiences.length) continue;
    for (const d of docs(p.input, "cv", 30)) {
      const profile = d.cv!.profile;
      assert((profile.match(/consolid/g) ?? []).length <= 1, profile);
      assert((profile.match(/le métier de/g) ?? []).length <= 1, profile);
    }
  }
});

Deno.test("review: sector « autre » never names the trade twice in one sentence", () => {
  const { input } = persona("TCV-REVIEW13"); // mécanicien auto, sector autre
  for (const level of ["debutant", "junior", "confirme", "senior"] as const) {
    input.target.level = level;
    const variants = [input, { ...input, education: [], experiences: [] }];
    for (const v of variants) {
      for (const d of docs(v, "pack", 30)) {
        for (const s of `${d.cv!.profile} ${d.lettre!.paragraphs.join(" ")}`.split(/(?<=\.) /)) {
          assert((s.match(/métier de mécanicien auto/g) ?? []).length <= 1, s);
        }
      }
    }
  }
});

Deno.test("review: a beginner does not speak of « notre métier »", () => {
  for (const id of ["TCV-REVIEW01", "TCV-REVIEW02"]) {
    for (const d of docs(persona(id).input, "lettre", 60)) assert(!/notre métier/.test(d.lettre!.paragraphs[2]));
  }
});

Deno.test("review: a sector's experience gain never restates one of its default qualities", () => {
  for (const [sector, defaults] of Object.entries(DEFAULT_QUALITIES)) {
    const gain = SECTOR_CONTEXT[sector as keyof typeof SECTOR_CONTEXT].gain;
    for (const label of defaults) assert(!QUALITY_STEMS[label].test(gain), `${sector}: "${gain}" restates ${label}`);
  }
  for (const label of Object.keys(QUALITY_STEMS)) assert(!QUALITY_STEMS[label].test(NEUTRAL_GAIN), label);
});

Deno.test("review: a default quality is not added when the letter already states it", () => {
  const { input } = persona("TCV-REVIEW16"); // administration, no degree, no experience, only "Discrétion" typed
  for (const d of docs(input, "lettre", 80)) {
    const [, p2, p3] = d.lettre!.paragraphs;
    for (const [label, stem] of Object.entries(QUALITY_STEMS)) {
      if (label === "Discrétion") continue; // typed by the customer: always kept
      assert(!(stem.test(p2) && stem.test(p3)), `${label} stated twice:\n${p2}\n${p3}`);
    }
    assert((p2.match(/travailler/g) ?? []).length <= 1, p2);
  }
});

Deno.test("review: proper nouns typed in a skill keep their capital inside a sentence", () => {
  const { input } = persona("TCV-REVIEW07"); // skills: Configuration réseau, Câblage, Cisco
  const p3s = docs(input, "lettre", 20).map((d) => d.lettre!.paragraphs[2]);
  assert(p3s.every((p) => !/\bcisco\b/.test(p)) && p3s.some((p) => p.includes("Cisco")), p3s.join("\n"));
});

Deno.test("review: an institution known by its acronym takes « l' »", () => {
  const { input } = persona("TCV-REVIEW12"); // stage at ISRA
  const text = docs(input, "pack", 20).map((d) => `${d.cv!.profile} ${d.lettre!.paragraphs[1]}`).join("\n");
  assert(text.includes("l'ISRA") && !/chez ISRA|de ISRA|d'ISRA/.test(text), text);
});

Deno.test("review: informal « je veux » in the motivation becomes « je souhaite »", () => {
  const { input } = persona("TCV-REVIEW10");
  for (const d of docs(input, "lettre", 5)) {
    assert(d.lettre!.paragraphs[2].includes("Je souhaite travailler dans un grand hôtel"), d.lettre!.paragraphs[2]);
    assert(!/je veux|hotel\b/i.test(d.lettre!.paragraphs[2]));
  }
});
