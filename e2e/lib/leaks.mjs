// What the free preview must not reveal: the masked part of every field of the generated document.
import { norm } from "./harness.mjs";

const MASK = "█";

/** [fullString, previewString] for every string field, walking both documents in parallel. */
function pairs(full, preview, out = []) {
  if (typeof full === "string") out.push([full, typeof preview === "string" ? preview : ""]);
  else if (Array.isArray(full)) full.forEach((v, i) => pairs(v, Array.isArray(preview) ? preview[i] : undefined, out));
  else if (full && typeof full === "object") {
    for (const key of Object.keys(full)) pairs(full[key], preview?.[key], out);
  }
  return out;
}

/**
 * Sentences (and list items such as skills or bullets) of the full document that the preview masks and that
 * appear in no visible preview field. Each one is at least 12 characters, so a match cannot be a coincidence.
 */
export function hiddenFragments(fullDoc, previewDoc) {
  const visible = norm(pairs(previewDoc, previewDoc).map(([s]) => s).join(" | "));
  const fragments = new Set();
  for (const [full, preview] of pairs(fullDoc, previewDoc)) {
    if (!preview.includes(MASK)) continue;
    const shown = norm(preview.slice(0, preview.indexOf(MASK)));
    const whole = norm(full);
    const hidden = whole.startsWith(shown) ? whole.slice(shown.length) : whole;
    for (const piece of hidden.split(/(?<=[.!?;:])\s+/)) {
      const text = piece.replace(/^[\s,;:.]+/, "").trim();
      if (text.length >= 12 && !visible.includes(text)) fragments.add(text);
    }
  }
  return [...fragments];
}
