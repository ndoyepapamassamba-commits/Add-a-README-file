// Some free models stream one word per paragraph (v48: « Table\n\nau\n\nde\n\nbord ») and leak fake tool-call tags
// as text. Display only: the text is re-joined when MOST of its paragraphs are one or two words; real lists, code
// and normal prose are left untouched.
export function repairWordPerLine(text: string): string {
  if (!text || text.includes('```')) return text;
  const paras = text.split(/\n{2,}/);
  if (paras.length < 8) return text;
  const tiny = paras.filter((p) => p.trim().split(/\s+/).length <= 2 && !/^\s*([-*•]|\d+[.)]|#|\||>)/.test(p)).length;
  if (tiny / paras.length < 0.7) return text;
  // Joined word by word; a straight quote alone is glued to the word it opens or closes.
  let out = '';
  let open = false;
  let glueNext = false;
  for (const w of paras.map((p) => p.trim()).filter(Boolean)) {
    if (w === '"') {
      if (open) out += '"';
      else {
        out += `${out ? ' ' : ''}"`;
        glueNext = true;
      }
      open = !open;
      continue;
    }
    const startsQuote = w.startsWith('"') && !w.endsWith('"');
    out += glueNext || !out ? w : ` ${w}`;
    glueNext = false;
    if (startsQuote) open = true;
    else if (open && w.endsWith('"')) open = false;
  }
  return out
    .replace(/\s+([.,;:!?)»])/g, '$1')
    .replace(/([(«])\s+/g, '$1')
    .replace(/<\/?tool_call>|<function=[^>]*>/g, '')
    .trim();
}
