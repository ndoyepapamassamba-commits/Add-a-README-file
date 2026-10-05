// JEV Profile Compilers: project coding style, writing style, user preferences
// and task style → one COMPACT STYLE CONTRACT (a few lines) instead of examples.
export interface CodingStyle {
  languages: string[];
  indent: string | null;
  quotes: 'single' | 'double' | null;
  semicolons: boolean | null;
  naming: 'camelCase' | 'snake_case' | 'mixed' | null;
  frameworks: string[];
  tests: string[];
  modules: 'esm' | 'cjs' | null;
  files: number;
}
export interface WritingStyle {
  language: 'fr' | 'en' | 'mixed';
  formality: 'vous' | 'tu' | 'neutre';
  length: 'court' | 'moyen' | 'détaillé';
  structure: 'listes' | 'prose';
}

const CODE_EXT = /\.(m?[jt]sx?|py|css|html?|json)$/i;

export function detectCodingStyle(files: { path: string; text: string }[]): CodingStyle {
  const code = files.filter((f) => CODE_EXT.test(f.path) && f.text.length < 400_000).slice(0, 60);
  const langs = new Set<string>();
  let two = 0;
  let four = 0;
  let tabs = 0;
  let sq = 0;
  let dq = 0;
  let semi = 0;
  let noSemi = 0;
  let camel = 0;
  let snake = 0;
  let esm = 0;
  let cjs = 0;
  const fw = new Set<string>();
  const tests = new Set<string>();
  for (const f of code) {
    const ext = f.path.split('.').pop()!.toLowerCase();
    langs.add(
      /tsx?$/.test(ext)
        ? 'TypeScript'
        : /jsx?|mjs$/.test(ext)
          ? 'JavaScript'
          : ext === 'py'
            ? 'Python'
            : ext.toUpperCase(),
    );
    // Indentation unit of the file = smallest indentation used.
    let minSp = 99;
    let tabbed = false;
    for (const line of f.text.split('\n').slice(0, 400)) {
      const ind = /^( +|\t+)\S/.exec(line)?.[1];
      if (ind?.startsWith('\t')) tabbed = true;
      else if (ind) minSp = Math.min(minSp, ind.length);
    }
    if (tabbed) tabs++;
    else if (minSp === 2) two++;
    else if (minSp === 4) four++;
    for (const line of f.text.split('\n').slice(0, 400)) {
      if (/^[^/#]*'[^'\n]*'/.test(line)) sq++;
      if (/^[^/#]*"[^"\n]*"/.test(line)) dq++;
      if (/[;]\s*$/.test(line)) semi++;
      else if (/[)\]'"\w]\s*$/.test(line) && /\b(const|let|return|import)\b/.test(line)) noSemi++;
      for (const m of line.matchAll(/\b(?:const|let|function|def|var)\s+([A-Za-z_]\w*)/g)) {
        if (/[a-z][A-Z]/.test(m[1]!)) camel++;
        else if (/_[a-z]/.test(m[1]!)) snake++;
      }
      if (/^\s*import .* from /.test(line) || /^\s*export /.test(line)) esm++;
      if (/require\(/.test(line) || /module\.exports/.test(line)) cjs++;
    }
    if (/from ['"]react['"]/.test(f.text)) fw.add('React');
    if (/from ['"]vue['"]/.test(f.text)) fw.add('Vue');
    if (/pandas/.test(f.text) && ext === 'py') fw.add('pandas');
    if (/fastify|express\(/.test(f.text)) fw.add(/fastify/.test(f.text) ? 'Fastify' : 'Express');
    if (/tailwind|className="[^"]*\b(flex|grid|px-\d)/.test(f.text)) fw.add('Tailwind');
    if (/from ['"]vitest['"]/.test(f.text)) tests.add('vitest');
    if (/from ['"]@playwright\/test['"]/.test(f.text)) tests.add('playwright');
    if (/\bdescribe\(|\bit\(/.test(f.text) && !tests.size) tests.add('jest-like');
    if (/^def test_|import pytest/m.test(f.text)) tests.add('pytest');
  }
  return {
    languages: [...langs],
    indent: tabs > two + four ? 'tabulations' : four > two ? '4 espaces' : two ? '2 espaces' : null,
    quotes: sq + dq < 3 ? null : sq >= dq ? 'single' : 'double',
    semicolons: semi + noSemi < 3 ? null : semi >= noSemi,
    naming:
      camel + snake < 3 ? null : camel > snake * 2 ? 'camelCase' : snake > camel * 2 ? 'snake_case' : 'mixed',
    frameworks: [...fw],
    tests: [...tests],
    modules: esm + cjs < 3 ? null : esm >= cjs ? 'esm' : 'cjs',
    files: code.length,
  };
}

export function detectWritingStyle(userTexts: string[]): WritingStyle {
  const t = userTexts.join('\n').slice(-6000);
  const fr = (t.match(/\b(le|la|les|des|une|est|pour|avec|dans)\b/gi) ?? []).length;
  const en = (t.match(/\b(the|and|with|for|this|that|is|are)\b/gi) ?? []).length;
  const vous = (t.match(/\b(vous|votre|vos)\b/gi) ?? []).length;
  const tu = (t.match(/\b(tu|ton|ta|tes|toi)\b/gi) ?? []).length;
  const avg = userTexts.length ? t.length / userTexts.length : 0;
  return {
    language: fr > en * 1.5 ? 'fr' : en > fr * 1.5 ? 'en' : 'mixed',
    formality: vous > tu ? 'vous' : tu > vous ? 'tu' : 'neutre',
    length: /\b(court|bref|concis|résume|short)\b/i.test(t) ? 'court' : avg > 600 ? 'détaillé' : 'moyen',
    structure: /^\s*[-*•]\s|\n\s*\d+\.\s/m.test(t) ? 'listes' : 'prose',
  };
}

/** Compact contract: only the lines that carry information. */
export function styleContract(o: {
  coding?: CodingStyle | null;
  writing?: WritingStyle | null;
  rules?: string[];
  task?: string[];
  output?: string;
}): string {
  const lines: string[] = [];
  const c = o.coding;
  if (c && c.files) {
    const parts = [
      c.languages.length && c.languages.join('/'),
      c.indent && `indent ${c.indent}`,
      c.quotes && `${c.quotes === 'single' ? "'single'" : '"double"'} quotes`,
      c.semicolons !== null && (c.semicolons ? 'semicolons' : 'no semicolons'),
      c.naming,
      c.modules,
      c.frameworks.length && c.frameworks.join(', '),
      c.tests.length && `tests: ${c.tests.join(', ')}`,
    ].filter(Boolean);
    if (parts.length) lines.push(`Code style (match the project): ${parts.join(' · ')}.`);
  }
  const w = o.writing;
  if (w)
    lines.push(
      `Writing: ${w.language === 'en' ? 'English' : w.language === 'fr' ? 'French' : 'the user’s language'}${w.formality === 'vous' ? ', vouvoiement' : w.formality === 'tu' ? ', tutoiement' : ''}, ${w.length === 'court' ? 'concise' : w.length === 'détaillé' ? 'detailed' : 'medium length'}, ${w.structure === 'listes' ? 'lists welcome' : 'prose'}.`,
    );
  if (o.rules?.length) lines.push(`User rules: ${o.rules.slice(0, 8).join(' | ')}`);
  if (o.task?.length) lines.push(`Task constraints: ${o.task.join(' | ')}`);
  if (o.output) lines.push(`Output contract: ${o.output}`);
  return lines.join('\n');
}

/** Explicit output requirements read from the request (used by the contract and by QA). */
export interface OutputSpec {
  format: 'json' | 'table' | 'code' | 'list' | 'text';
  language: 'fr' | 'en' | null;
  maxWords: number | null;
  mustMention: string[];
}
export function outputSpec(text: string): OutputSpec {
  const format = /\bjson\b/i.test(text)
    ? 'json'
    : /\b(tableau|table|markdown table)\b/i.test(text) && !/tableau de bord/i.test(text)
      ? 'table'
      : /\b(code|fonction|function|script)\b/i.test(text) &&
          /\b([ée]cris|write|g[ée]n[èe]re|donne)\b/i.test(text)
        ? 'code'
        : /\b(liste|list|points|étapes)\b/i.test(text)
          ? 'list'
          : 'text';
  const lang = /\b(en anglais|in english)\b/i.test(text)
    ? 'en'
    : /\b(en fran[çc]ais|in french)\b/i.test(text)
      ? 'fr'
      : null;
  const mw = /\b(\d{2,4})\s*mots\b|\bin (\d{2,4}) words\b|max(?:imum)?\s*(\d{2,4})\s*(?:mots|words)/i.exec(
    text,
  );
  const must = [...text.matchAll(/(?:colonnes?|champs?|columns?|fields?)\s*:?\s*([\wÀ-ÿ, ]{3,120})/gi)]
    .flatMap((m) => m[1]!.split(/,| et | and /))
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 40)
    .slice(0, 12);
  return { format, language: lang, maxWords: mw ? Number(mw[1] ?? mw[2] ?? mw[3]) : null, mustMention: must };
}

export function contractText(s: OutputSpec): string {
  return [
    s.format !== 'text' && `format ${s.format}`,
    s.language && `language ${s.language}`,
    s.maxWords && `≤ ${s.maxWords} words`,
    s.mustMention.length && `must include: ${s.mustMention.join(', ')}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
