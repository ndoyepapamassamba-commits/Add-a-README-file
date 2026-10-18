// STUB — replaced by the generator owner. Signature is final.
import type { Document, OrderInput, Product } from "../types.ts";

export function generateDocument(input: OrderInput, product: Product, opts: { seed: string; now: Date }): Document {
  const fullName = `${input.identity.firstName} ${input.identity.lastName.toUpperCase()}`;
  const cv = product === "lettre" ? null : {
    fullName,
    title: input.target.jobTitle,
    contacts: [input.identity.phone, input.identity.city],
    profile: `Profil motivé pour le poste de ${input.target.jobTitle}.`,
    experiences: input.experiences.map((e) => ({
      title: e.title, company: e.company ?? "", place: e.place ?? "", period: "",
      bullets: (e.missions ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    })),
    education: input.education.map((e) => ({ degree: e.degree, school: e.school ?? "", year: e.year ?? "", detail: e.detail ?? "" })),
    skills: input.skills, it: input.it, languages: input.languages, interests: input.interests,
  };
  const lettre = product === "cv" ? null : {
    sender: [fullName, input.identity.city], recipient: [input.letter?.company ?? ""],
    placeDate: `${input.identity.city}, le ${opts.now.toISOString().slice(0, 10)}`,
    subject: `Objet : Candidature au poste de ${input.target.jobTitle}`,
    salutation: "Madame, Monsieur,",
    paragraphs: ["Paragraphe un de la lettre de motivation.", "Paragraphe deux.", "Paragraphe trois.", "Paragraphe quatre."],
    closing: "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.",
    signature: fullName,
  };
  return { cv, lettre };
}
