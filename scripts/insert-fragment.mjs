#!/usr/bin/env node
// Inserts the free module fragment (public HTML produced by the content team) into formation/gratuit.html,
// between <!-- GRATUIT:DEBUT --> and <!-- GRATUIT:FIN --> (everything between the markers is replaced).
//   node scripts/insert-fragment.mjs formation/gratuit.html /path/to/gratuit-fragment.html
// Refuses a page without exactly one pair of markers, a fragment carrying a script, an inline event handler or a
// style attribute (the page is static public HTML: nothing in it may run), and a fragment whose tags do not balance
// strictly (a </div> closing a <details> would push the rest of the page out of its column). Wide tables are wrapped
// in a scrollable .table-wrap box so they never scroll the page sideways on a phone.
import fs from "node:fs";

const START = "<!-- GRATUIT:DEBUT -->";
const END = "<!-- GRATUIT:FIN -->";

function fail(message) {
  console.error(`insert-fragment: ${message}`);
  process.exit(1);
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

const VOID_TAGS = new Set(["br", "hr", "img", "wbr", "input", "meta", "link", "col", "area", "base", "embed", "source", "track", "param"]);

/**
 * Strict tag balance, without the browser's implicit closing: every end tag must close the element opened last.
 * Returns the problems found ("line 263: </div> closes <details> (line 261)"), [] when balanced. Comments are skipped;
 * void and self-closing (SVG) elements open nothing.
 */
export function tagBalanceProblems(html) {
  const src = html.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
  const lineOf = (i) => src.slice(0, i).split("\n").length;
  const stack = [];
  const problems = [];
  for (const m of src.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g)) {
    const [, close, raw, , self] = m;
    const tag = raw.toLowerCase();
    if (!close) {
      if (!self && !VOID_TAGS.has(tag)) stack.push({ tag, line: lineOf(m.index) });
      continue;
    }
    const top = stack[stack.length - 1];
    if (top && top.tag === tag) {
      stack.pop();
      continue;
    }
    problems.push(`line ${lineOf(m.index)}: </${tag}> closes ${top ? `<${top.tag}> (line ${top.line})` : "nothing"}`);
    const at = stack.map((x) => x.tag).lastIndexOf(tag);
    if (at >= 0) stack.length = at;
  }
  for (const x of stack) problems.push(`<${x.tag}> (line ${x.line}) is never closed`);
  return problems;
}

/** Throws on anything that could run or restyle the page, or that would break its layout. */
export function checkFragment(fragment) {
  const problems = [];
  if (/<script/i.test(fragment)) problems.push("<script");
  if (/\son[a-z]+\s*=/i.test(fragment)) problems.push("attribut on…=");
  if (/\sstyle\s*=/i.test(fragment)) problems.push("attribut style=");
  if (/<style|<iframe|<object|<embed|<link|<meta|<form|<img/i.test(fragment)) problems.push("élément interdit");
  if (/javascript:/i.test(fragment)) problems.push("javascript:");
  if (fragment.includes(START) || fragment.includes(END)) problems.push("marqueurs GRATUIT dans le fragment");
  if (!/<section\s+class="module module-free"\s+data-module="0"\s*>/.test(fragment)) problems.push('racine <section class="module module-free" data-module="0"> absente');
  const unbalanced = tagBalanceProblems(fragment);
  if (unbalanced.length) problems.push(`balises mal fermées (${unbalanced.slice(0, 3).join(" ; ")})`);
  if (problems.length) throw new Error(`fragment refusé : ${problems.join(", ")}`);
}

export function wrapTables(fragment) {
  return fragment.replace(/<table class="data"[\s\S]*?<\/table>/g, (table) => {
    const caption = /<caption>([\s\S]*?)<\/caption>/.exec(table);
    const label = caption ? caption[1].replace(/<[^>]+>/g, "").replace(/"/g, "&quot;").trim() : "Tableau";
    return `<div class="table-wrap" role="region" tabindex="0" aria-label="${label}">${table}</div>`;
  });
}

export function insertFragment(page, fragment) {
  if (count(page, START) !== 1 || count(page, END) !== 1) throw new Error(`la page doit contenir une seule fois ${START} et ${END}`);
  const a = page.indexOf(START);
  const b = page.indexOf(END);
  if (b < a) throw new Error(`${END} se trouve avant ${START}`);
  checkFragment(fragment);
  return page.slice(0, a + START.length) + "\n" + wrapTables(fragment.trim()) + "\n" + page.slice(b);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [pagePath, fragmentPath] = process.argv.slice(2);
  if (!pagePath || !fragmentPath) fail("usage : node scripts/insert-fragment.mjs <page.html> <fragment.html>");
  let page, fragment;
  try {
    page = fs.readFileSync(pagePath, "utf8");
    fragment = fs.readFileSync(fragmentPath, "utf8").replace(/^﻿/, "");
  } catch (e) {
    fail(e.message);
  }
  try {
    fs.writeFileSync(pagePath, insertFragment(page, fragment));
  } catch (e) {
    fail(e.message);
  }
  console.log(`insert-fragment: ${fragmentPath} inséré dans ${pagePath} (${fragment.length} caractères).`);
}
