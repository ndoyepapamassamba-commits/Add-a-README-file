#!/usr/bin/env node
// Inserts the free module fragment (public HTML produced by the content team) into formation/gratuit.html,
// between <!-- GRATUIT:DEBUT --> and <!-- GRATUIT:FIN --> (everything between the markers is replaced).
//   node scripts/insert-fragment.mjs formation/gratuit.html /path/to/gratuit-fragment.html
// Refuses a page without exactly one pair of markers, and a fragment carrying a script, an inline event handler
// or a style attribute (the page is static public HTML: nothing in it may run). Wide tables are wrapped in a
// scrollable .table-wrap box so they never scroll the page sideways on a phone.
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

/** Throws on anything that could run or restyle the page. */
export function checkFragment(fragment) {
  const problems = [];
  if (/<script/i.test(fragment)) problems.push("<script");
  if (/\son[a-z]+\s*=/i.test(fragment)) problems.push("attribut on…=");
  if (/\sstyle\s*=/i.test(fragment)) problems.push("attribut style=");
  if (/<style|<iframe|<object|<embed|<link|<meta|<form|<img/i.test(fragment)) problems.push("élément interdit");
  if (/javascript:/i.test(fragment)) problems.push("javascript:");
  if (fragment.includes(START) || fragment.includes(END)) problems.push("marqueurs GRATUIT dans le fragment");
  if (!/<section\s+class="module module-free"\s+data-module="0"\s*>/.test(fragment)) problems.push('racine <section class="module module-free" data-module="0"> absente');
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
