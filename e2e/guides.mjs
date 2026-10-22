// Free guides of the Teranga Pro course (formation/guides/), served by the same dev.ts server as the rest of
// formation/. flow.mjs runs them (scenario K), at 390 px wide:
//   every guide: HTTP 200, exactly one h1, its canonical URL, valid JSON-LD (Article whose mainEntityOfPage is the
//   canonical URL, FAQPage questions answered), title and description lengths, indexable, no console error, no
//   horizontal scroll, a link to ../index.html and to the « Guides gratuits » section, at least two other guides
//   linked, every local link and #anchor resolving (other guides, ../index.html#…, fichiers/…);
//   the example files are real workbooks / zip / CSV; index.html and gratuit.html list every guide in their
//   « Guides gratuits » section; formation/sitemap.xml lists every guide (lastmod 2026-10-22) and the IndexNow
//   payload of scripts/indexnow.mjs carries them.
import fs from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { buildPayload, FORMATION_KEY_LOCATION } from "../scripts/indexnow.mjs";
import { REPO } from "./lib/devserver.mjs";
import { assertNoHorizontalScroll, check, norm, phoneContext } from "./lib/harness.mjs";

const PUBLIC_BASE = "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/formation/";
const WIDE_PHONE = { width: 390, height: 844 };
const LASTMOD = "2026-10-22";
const EXPECTED = [
  "taux-de-degradation-du-portefeuille.html",
  "creances-en-souffrance-bceao.html",
  "portefeuille-a-risque-par30.html",
  "combiner-plusieurs-fichiers-excel-power-query.html",
  "comparer-deux-fichiers-excel-power-query.html",
  "recherchev-power-query.html",
];
/** Every published guide: each .html file of formation/guides/. */
const GUIDES = fs.readdirSync(path.join(REPO, "formation", "guides")).filter((f) => f.endsWith(".html")).sort();

const isExternal = (href) => /^(https?:|mailto:|tel:|data:)/i.test(href);

/** Resolves every local link of the page: the file answers 200 and its #anchor exists. Returns the broken ones. */
async function brokenLocalLinks(page, cache) {
  const hrefs = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")));
  const broken = [];
  for (const href of [...new Set(hrefs)].filter((h) => !isExternal(h))) {
    const [file, anchor] = href.split("#");
    if (!file) {
      if (anchor && !(await page.evaluate((id) => !!document.getElementById(id), anchor))) broken.push(href);
      continue;
    }
    const target = new URL(file, page.url()).href;
    if (!cache.has(target)) {
      const res = await page.request.get(target);
      cache.set(target, { status: res.status(), body: res.status() === 200 ? await res.body() : Buffer.alloc(0) });
    }
    const { status, body } = cache.get(target);
    if (status !== 200) broken.push(`${href} → HTTP ${status}`);
    else if (anchor && !body.toString("utf8").includes(`id="${anchor}"`)) broken.push(`${href} → no id="${anchor}"`);
  }
  return broken;
}

async function checkGuide(page, server, slug, { problems, cache }) {
  const label = `K ${slug.replace(/\.html$/, "")}`;
  const before = problems.length;
  const res = await page.goto(`${server.site}/formation/guides/${slug}`, { waitUntil: "networkidle" });
  check(res.status() === 200, `${label}: HTTP 200 on the dev server`);

  const h1 = norm(await page.locator("h1").first().innerText());
  check(await page.locator("h1").count() === 1 && h1.length >= 10, `${label}: exactly one h1 (« ${h1} »)`);
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  check(await page.locator('link[rel="canonical"]').count() === 1 && canonical === `${PUBLIC_BASE}guides/${slug}`, `${label}: canonical ${canonical}`);

  const blocks = await page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent));
  const parsed = blocks.map((text) => {
    try {
      return JSON.parse(text);
    } catch (err) {
      return { invalid: err.message };
    }
  });
  const types = parsed.map((j) => j["@type"] ?? `invalid (${j.invalid})`);
  check(parsed.length >= 1 && parsed.every((j) => !j.invalid && j["@context"] === "https://schema.org" && typeof j["@type"] === "string"), `${label}: valid JSON-LD (${types.join(", ")})`);
  const article = parsed.find((j) => j["@type"] === "Article");
  check(!!article && article.mainEntityOfPage === canonical && !!article.headline && article.isAccessibleForFree === true, `${label}: JSON-LD Article points at the canonical URL`);
  const faq = parsed.find((j) => j["@type"] === "FAQPage");
  if (faq) {
    const answered = faq.mainEntity?.every((q) => q.name && q.acceptedAnswer?.text);
    check(faq.mainEntity?.length >= 1 && answered, `${label}: JSON-LD FAQPage with ${faq.mainEntity?.length} answered questions`);
  }
  const title = await page.title();
  const desc = await page.locator('meta[name="description"]').getAttribute("content");
  check(title.length <= 65 && desc.length >= 110 && desc.length <= 160, `${label}: title (${title.length}) and description (${desc.length}) lengths fit search results`);
  check(await page.locator('meta[name="robots"]').count() === 0, `${label}: indexable (no robots meta)`);

  await assertNoHorizontalScroll(page, label);
  check(await page.locator('a[href="../index.html"]').count() >= 1, `${label}: links to ../index.html`);
  check(await page.locator('a[href="../index.html#guides"]').count() >= 1, `${label}: links to the « Guides gratuits » section`);
  const hrefs = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")));
  const others = new Set(hrefs.map((h) => h.split("#")[0]).filter((h) => h !== slug && GUIDES.includes(h)));
  check(others.size >= 2, `${label}: links ${others.size} other guides (${[...others].join(", ")})`);
  const broken = await brokenLocalLinks(page, cache);
  check(broken.length === 0, `${label}: every local link and anchor resolves${broken.length ? ` — broken: ${broken.join(" | ")}` : ""}`);
  check(/données[^.]{0,40}fictiv|exemple fictif|imaginaire/i.test(norm(await page.locator("main").innerText())), `${label}: says its example data is fictitious`);
  check(problems.length === before, `${label}: no console error${problems.length > before ? `: ${problems.slice(before).join(" | ")}` : ""}`);
  return hrefs.filter((h) => h.startsWith("fichiers/"));
}

/** The example files linked by the guides open as what they claim to be. */
function checkExampleFile(href, body) {
  if (href.endsWith(".xlsx")) {
    const parts = unzipSync(new Uint8Array(body));
    check(!!parts["xl/workbook.xml"] && !!parts["[Content_Types].xml"], `K ${href}: a real Excel workbook`);
  } else if (href.endsWith(".zip")) {
    const entries = unzipSync(new Uint8Array(body));
    const books = Object.keys(entries).filter((n) => n.endsWith(".xlsx"));
    const valid = books.every((n) => !!unzipSync(entries[n])["xl/workbook.xml"]);
    check(books.length >= 2 && valid, `K ${href}: a zip of ${books.length} valid workbooks`);
  } else if (href.endsWith(".csv")) {
    const lines = strFromU8(new Uint8Array(body)).replace(/^﻿/, "").trim().split(/\r?\n/);
    check(lines.length >= 3 && lines.every((l) => l.split(";").length === lines[0].split(";").length), `K ${href}: CSV of ${lines.length - 1} rows, same column count on every line`);
  } else {
    check(false, `K ${href}: unexpected example file type`);
  }
}

/** The « Guides gratuits » section of index.html or gratuit.html lists every guide. */
async function checkGuidesSection(page, server, file, shoot) {
  const label = `K ${file}`;
  await page.goto(`${server.site}/formation/${file}`, { waitUntil: "networkidle" });
  const section = page.locator("section#guides");
  check(await section.count() === 1 && norm(await section.locator("h2").first().innerText()) === "Guides gratuits", `${label}: one « Guides gratuits » section`);
  const linked = await section.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const missing = GUIDES.filter((g) => !linked.includes(`guides/${g}`));
  check(missing.length === 0 && linked.length === GUIDES.length, `${label}: the section links the ${GUIDES.length} guides${missing.length ? ` — missing ${missing.join(", ")}` : ""}`);
  check(await page.locator('footer a[href$="#guides"]').count() === 1, `${label}: footer link « Guides gratuits »`);
  await assertNoHorizontalScroll(page, label);
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: shoot(file) });
}

export async function guideFlows(browser, server, { problems, out }) {
  check(EXPECTED.every((g) => GUIDES.includes(g)), `K: formation/guides/ holds the ${EXPECTED.length} expected guides (${GUIDES.length} in all)`);
  const context = await phoneContext(browser, problems, "K", { viewport: WIDE_PHONE });
  const page = await context.newPage();
  const cache = new Map();
  const files = new Set();
  for (const slug of GUIDES) {
    for (const f of await checkGuide(page, server, slug, { problems, cache })) files.add(f);
    if (slug === GUIDES[0]) await page.screenshot({ path: path.join(out, "K-guide.png"), fullPage: true });
  }
  check(files.size >= 5, `K: ${files.size} example files linked by the guides`);
  for (const href of [...files].sort()) {
    const res = await page.request.get(`${server.site}/formation/guides/${href}`);
    check(res.status() === 200, `K ${href}: HTTP 200`);
    checkExampleFile(href, await res.body());
  }

  for (const file of ["index.html", "gratuit.html"]) {
    await checkGuidesSection(page, server, file, (f) => path.join(out, `K-${f.replace(".html", "")}-guides.png`));
  }

  const sitemap = await (await page.request.get(`${server.site}/formation/sitemap.xml`)).text();
  const entries = new Map([...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/url>/g)].map((m) => [m[1], m[2]]));
  const stale = GUIDES.filter((g) => entries.get(`${PUBLIC_BASE}guides/${g}`) !== LASTMOD);
  check(stale.length === 0, `K: formation/sitemap.xml lists every guide with lastmod ${LASTMOD}${stale.length ? ` — missing or stale: ${stale.join(", ")}` : ""}`);
  const payload = buildPayload(sitemap, FORMATION_KEY_LOCATION);
  check(GUIDES.every((g) => payload.urlList.includes(`${PUBLIC_BASE}guides/${g}`)), `K: the IndexNow payload (scripts/indexnow.mjs) carries the ${GUIDES.length} guides (${payload.urlList.length} URL)`);
  await context.close();
}
