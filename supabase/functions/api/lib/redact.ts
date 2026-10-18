// Preview redaction: keeps the parts of a document that sell it and masks the rest with "█" runs.
// A masked run contains only MASK_CHAR and spaces, so no hidden word can leak into the preview.
import { type CvDoc, type Document, type EnvoiDoc, type LettreDoc, MASK_CHAR } from "./types.ts";

const MAX_RUN = 12;
const PROFILE_VISIBLE_WORDS = 8;
const FIRST_PARAGRAPH_VISIBLE_WORDS = 12;
const VISIBLE_SKILLS = 3;

/** One "█" per letter or digit of each word (max 12), words separated by one space. */
export function maskText(text: string): string {
  return text
    .split(/\s+/)
    .map((word) => {
      const n = [...word].filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length;
      return n > 0 ? MASK_CHAR.repeat(Math.min(n, MAX_RUN)) : "";
    })
    .filter(Boolean)
    .join(" ");
}

/** Keeps the first `n` words of `text` and masks the remainder. */
export function keepFirstWords(text: string, n: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= n) return words.join(" ");
  const masked = maskText(words.slice(n).join(" "));
  const visible = words.slice(0, n).join(" ");
  return masked ? `${visible} ${masked}` : visible;
}

function redactCv(cv: CvDoc): CvDoc {
  return {
    fullName: cv.fullName,
    title: cv.title,
    contacts: [...cv.contacts],
    profile: keepFirstWords(cv.profile, PROFILE_VISIBLE_WORDS),
    experiences: cv.experiences.map((e) => ({
      title: e.title,
      company: e.company,
      place: e.place,
      period: e.period,
      bullets: e.bullets.map(maskText),
    })),
    education: cv.education.map((e) => ({ ...e })),
    skills: cv.skills.map((s, i) => (i < VISIBLE_SKILLS ? s : maskText(s))),
    it: [...cv.it],
    languages: cv.languages.map((l) => ({ ...l })),
    interests: [...cv.interests],
  };
}

function redactLettre(l: LettreDoc): LettreDoc {
  return {
    sender: [...l.sender],
    recipient: [...l.recipient],
    placeDate: l.placeDate,
    subject: l.subject,
    salutation: l.salutation,
    paragraphs: l.paragraphs.map((p, i) => (i === 0 ? keepFirstWords(p, FIRST_PARAGRAPH_VISIBLE_WORDS) : maskText(p))),
    closing: l.closing,
    signature: l.signature,
  };
}

/** Pack Stage letters after the first: recipient and subject stay visible, every paragraph is masked. */
function redactOtherLettre(l: LettreDoc): LettreDoc {
  return { ...redactLettre(l), paragraphs: l.paragraphs.map(maskText) };
}

/** Pack Stage sending message: only the e-mail subject stays visible. */
function redactEnvoi(e: EnvoiDoc): EnvoiDoc {
  return { emailSubject: e.emailSubject, emailBody: maskText(e.emailBody), whatsapp: maskText(e.whatsapp) };
}

/** Same shape as `doc`; hidden text replaced by masked runs (see SPEC "redactDocument"). */
export function redactDocument(doc: Document): Document {
  const out: Document = {
    cv: doc.cv ? redactCv(doc.cv) : null,
    lettre: doc.lettre ? redactLettre(doc.lettre) : null,
  };
  if (doc.lettres) out.lettres = doc.lettres.map((l, i) => (i === 0 ? redactLettre(l) : redactOtherLettre(l)));
  if (doc.envoi !== undefined) out.envoi = doc.envoi ? redactEnvoi(doc.envoi) : null;
  return out;
}
