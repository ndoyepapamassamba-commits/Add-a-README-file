// MISSION RESUME (pure): « continue », « vas-y », « poursuis » carry on THE SAME mission. v62 — in the ESN chat, the
// « continue » turn was read as a new, empty request: the context compiler kept nothing of « top 20 du segment code
// 8200 Local Corporate », the tool pack fell back to the chat set, and the agent started a provisions study instead.

const plain = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const LEAD = "(?:(?:ok|oui|bon|bien|parfait|d'accord|daccord|merci|allez|alors|stp|svp|go|yes|ok go)\\s+)*";
const VERB =
  "(?:continu\\w*|poursui\\w*|repren\\w*|reprise|termine\\w*|finis\\w*|acheve\\w*|la suite|suite|next|go on|keep going|carry on|resume|proceed|vas y|va y|go|on y va|fais le|fais la suite|encore|et apres|la suite stp)";
const TAIL =
  "(?:\\s+(?:stp|svp|s'il te plait|s'il vous plait|please|encore|jusqu'au bout|jusqu'a la fin|le travail|la mission|la tache|l'analyse|ce que tu faisais|ou tu t'es arrete|d'ou tu t'es arrete|la ou tu t'es arrete|maintenant|merci|alors|donc|ok))*";
const RE = new RegExp(`^${LEAD}${VERB}${TAIL}$`);

/** A message that only asks to carry on (no new request in it). */
export function isContinuation(text: string): boolean {
  const t = plain(text);
  return t.length > 0 && t.length <= 90 && RE.test(t);
}

/** The mission a continuation resumes: the last turn of the chat that was not itself a continuation. */
export function missionOf(turns: { text: string }[] | undefined): string | null {
  for (const t of [...(turns ?? [])].reverse()) if (t.text?.trim() && !isContinuation(t.text)) return t.text.trim();
  return null;
}

/** What the model receives for « continue »: the user's words + the mission they resume + what already exists for it. */
export function resumeText(text: string, mission: string, produced: string[] = []): string {
  const files = produced.slice(0, 20);
  return `${text.trim()}\n\n<mission_resumed>\nThe user asks to CONTINUE the mission of this chat, unchanged:\n« ${mission.slice(0, 1200)} »\nPick up where the previous turn stopped and deliver EXACTLY what that request asked (same subject, same scope, same deliverable). Do not start another analysis or change the subject.${
    files.length ? `\nAlready produced for it (reuse, do not redo): ${files.join(', ')}` : ''
  }\n</mission_resumed>`;
}
