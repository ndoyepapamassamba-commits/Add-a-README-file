// End-to-end flows of the Teranga Pro course (formation/, product pq_essentiel) against the same dev.ts servers as
// flow.mjs (which runs them). dev.ts serves the PUBLIC lorem fixture (supabase/functions/api/tests/fixtures/course/)
// and sells by default (PQ_SALES_OPEN=true). No real course content is ever used here.
//   S — demo-shim.js without the demo flag does strictly nothing (Node vm, every global access recorded)
//   M — sales closed (GET /config answered « open: false »): lead form, consent text, gratuit.html, sitemap, SEO
//   L — manual Wave: order → exact amount 24 999 FCFA → a round « 25 000F » notification unlocks nothing → the owner's
//       phone (/fake-phone) sends the exact amount → reader unlocked → sanitizer → xlsx/zip licence → quiz →
//       public attestation → printable attestation → receipt
//   N — Wave: fake Wave page « Payer » → reader unlocked
//   O — admin « Formation » card and « Par produit (30 jours) » table
//   P — demo mode (demo.html): the whole journey simulated in the browser, zero request to the API, then « Quitter »
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { strFromU8, unzipSync } from "fflate";
import { api, DEV_ADMIN_KEY, REPO } from "./lib/devserver.mjs";
import { assertNoHorizontalScroll, check, norm, phoneContext, saveDownload } from "./lib/harness.mjs";
import { libreOfficeOpens } from "./lib/office.mjs";

const ADMIN_AUTH = { headers: { authorization: `Bearer ${DEV_ADMIN_KEY}` } };
const NBSP = " ";
const FORMATION = path.join(REPO, "formation");
const SHIM = path.join(FORMATION, "js", "demo-shim.js");
const FREE_CSV = path.join(FORMATION, "gratuit", "exemple-impayes.csv");
const BUYER = { fullName: "Aïssatou N'Diaye-Bâ", phone: "+225 07 07 07 07 07", email: "aissatou@example.com" };
const PAGES = ["index.html", "gratuit.html", "lecture.html", "attestation.html", "recu.html", "cgv.html", "confidentialite.html", "demo.html"];
const PUBLIC_BASE = "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/formation/";

/** LEAD_CONSENT_TEXT as written in supabase/functions/api/lib/course_catalog.ts (concatenated string literals). */
function leadConsentText() {
  const src = fs.readFileSync(path.join(REPO, "supabase/functions/api/lib/course_catalog.ts"), "utf8");
  const decl = /export const LEAD_CONSENT_TEXT =([\s\S]*?);/.exec(src);
  if (!decl) throw new Error("LEAD_CONSENT_TEXT not found in course_catalog.ts");
  return [...decl[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`)).join("");
}

const fcfa = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)}${NBSP}FCFA`;
const orderRoute = (order) => `/orders/${order.id}?t=${encodeURIComponent(order.token)}`;
const readerPath = (id, token) => `/formation/lecture.html?o=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;

/* ------------------------------------------------------------------------------------------------------------ */
/* S — the shim does strictly nothing without the flag                                                          */
/* ------------------------------------------------------------------------------------------------------------ */

/** A stand-in for any browser object: every property is another stand-in, every call returns one. */
function anything() {
  const fn = function () {};
  return new Proxy(fn, {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => "" : anything()),
    apply: () => anything(),
    construct: () => anything(),
  });
}

/** Runs demo-shim.js in a fresh vm context whose `window` records every access. */
function runShim(storage) {
  const log = [];
  const session = new Proxy(storage, {
    get(target, key) {
      log.push(`sessionStorage.get ${String(key)}`);
      const v = target[key];
      return typeof v === "function" ? (...args) => {
        log.push(`sessionStorage.${String(key)}(${args.join(",")})`);
        return v.apply(target, args);
      } : v;
    },
    set(target, key, value) {
      log.push(`sessionStorage.set ${String(key)}`);
      target[key] = value;
      return true;
    },
  });
  const realFetch = () => Promise.resolve(null);
  const base = {
    sessionStorage: session,
    fetch: realFetch,
    document: anything(),
    location: { href: "http://localhost/formation/index.html", origin: "http://localhost", pathname: "/formation/index.html" },
  };
  const win = new Proxy(base, {
    get(target, key) {
      log.push(`get ${String(key)}`);
      return target[key];
    },
    set(target, key, value) {
      log.push(`set ${String(key)}`);
      target[key] = value;
      return true;
    },
    defineProperty(target, key, desc) {
      log.push(`define ${String(key)}`);
      return Reflect.defineProperty(target, key, desc);
    },
    deleteProperty(target, key) {
      log.push(`delete ${String(key)}`);
      return Reflect.deleteProperty(target, key);
    },
  });
  const sandbox = { window: win };
  const before = Object.keys(sandbox).sort().join(",");
  vm.runInNewContext(fs.readFileSync(SHIM, "utf8"), sandbox, { filename: "demo-shim.js" });
  return { log, globals: Object.keys(sandbox).sort().join(",") === before, fetchUnchanged: base.fetch === realFetch };
}

function shimUnit() {
  const absent = runShim({ getItem: () => null });
  check(
    absent.log.join(" | ") === "get sessionStorage | sessionStorage.get getItem | sessionStorage.getItem(tpro:demo)",
    `S: without the flag demo-shim.js only reads sessionStorage « tpro:demo » (${absent.log.join(" | ")})`,
  );
  check(absent.fetchUnchanged && absent.globals, "S: without the flag window.fetch is untouched and no global is created");
  const other = runShim({ getItem: () => "0" });
  check(other.fetchUnchanged && other.log.length === 3, "S: a flag other than « 1 » changes nothing either");
  const throwing = runShim({
    getItem: () => {
      throw new DOMException("blocked", "SecurityError");
    },
  });
  check(throwing.fetchUnchanged && throwing.log.length === 3, "S: blocked storage (private mode) changes nothing and throws nothing");
  const onFlag = runShim({ getItem: (k) => (k === "tpro:demo" ? "1" : null), setItem() {}, removeItem() {} });
  check(!onFlag.fetchUnchanged && onFlag.log.includes("set fetch"), "S: with « tpro:demo » = 1 the shim does replace window.fetch (the probe can see activity)");
}

/** In a page: the shim left no trace (native fetch, no banner, no class, nothing written to sessionStorage). */
async function assertShimIdle(page, label) {
  const state = await page.evaluate(() => ({
    nativeFetch: /\[native code\]/.test(Function.prototype.toString.call(window.fetch)),
    banner: !!document.getElementById("tpro-demo-banner"),
    demoClass: document.documentElement.classList.contains("is-demo"),
    session: (() => {
      try {
        return window.sessionStorage.length;
      } catch {
        return -1;
      }
    })(),
  }));
  check(state.nativeFetch && !state.banner && !state.demoClass && state.session === 0, `${label}: demo shim idle (native fetch, no banner, sessionStorage empty)`);
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Helpers                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------ */

async function fillBuyForm(page, buyer) {
  await page.fill("#buy-fullName", buyer.fullName);
  if (buyer.email) await page.fill("#buy-email", buyer.email);
  if (buyer.phone) await page.fill("#buy-phone", buyer.phone);
  await page.check("#buy-acceptCgv");
}

async function buy(page, buyer) {
  await fillBuyForm(page, buyer);
  const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/orders"));
  await page.click("#buy-submit");
  return (await created).json();
}

async function goSection(page, id) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, id);
  await page.waitForSelector(`#${id}:not([hidden])`);
}

async function answerQuiz(page, answers) {
  for (const [q, choice] of Object.entries(answers)) await page.check(`#quiz-${q}-${choice}`);
}

async function download(page, selector, out) {
  const event = page.waitForEvent("download", { timeout: 30_000 });
  await page.click(selector);
  return saveDownload(await event, out);
}

async function metaContent(page, selector) {
  return page.locator(selector).first().getAttribute("content");
}

/* ------------------------------------------------------------------------------------------------------------ */
/* M — sales closed, lead, free module, sitemap                                                                 */
/* ------------------------------------------------------------------------------------------------------------ */

async function closedAndFree(browser, server, { problems, shoot }) {
  const consent = leadConsentText();
  const context = await phoneContext(browser, problems, "M");
  const page = await context.newPage();
  await page.route("**/api/config", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.courses.pq_essentiel.open = false;
    return route.fulfill({ response: res, json: body });
  });
  await page.goto(`${server.site}/formation/index.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.documentElement.getAttribute("data-sales") === "closed");
  check(await page.locator('[data-when="closed"][data-lead]').isVisible() && await page.locator("#buy-form").isHidden(), "M: sales closed → « Ouverture prochaine » lead form shown, buy form hidden");
  check(norm(await page.locator("#tarif .status-soon").textContent()) === "Ouverture prochaine", "M: the price card says « Ouverture prochaine »");
  check(norm(await page.locator('label[for="lead-consent"]').innerText()) === norm(consent), "M: the consent label is LEAD_CONSENT_TEXT verbatim");
  await assertNoHorizontalScroll(page, "M index/closed");
  await assertShimIdle(page, "M index");

  await page.fill("#lead-email", "Prospect.Test@Example.com");
  await page.check("#lead-consent");
  const sent = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/api/leads"));
  await page.click('[data-lead-form] button[type="submit"]');
  const res = await sent;
  check(res.status() === 201 && (await res.json()).ok === true, "M: POST /api/leads → 201 { ok: true }");
  await page.waitForSelector("[data-lead-done]:not([hidden])");
  check(norm(await page.locator("[data-lead-done-title]").first().innerText()) === "Vous serez prévenu(e).", "M: the lead form is replaced by « Vous serez prévenu(e). »");
  await shoot(page, "M-index-closed", { fullPage: true });
  await context.close();

  // gratuit.html: the public free module, its dataset, the CTA and the lead form; SEO basics.
  const ctx2 = await phoneContext(browser, problems, "M gratuit");
  const free = await ctx2.newPage();
  await free.goto(`${server.site}/formation/gratuit.html`, { waitUntil: "networkidle" });
  check(norm(await free.locator("h1").innerText()) === "Calculer l'ancienneté des impayés avec Power Query" && await free.locator("h1").count() === 1, "M: gratuit.html has its single h1");
  const section = free.locator('section.module.module-free[data-module="0"]');
  check(await section.count() === 1 && (await section.innerText()).includes("La balance âgée des impayés"), "M: the free module fragment is inside the page (static HTML)");
  check(!(await free.content()).includes("Emplacement réservé"), "M: the lorem placeholder was replaced at integration");
  const layout = await free.evaluate(() => {
    const ids = ["m0-erreurs", "m0-faq", "m0-suite", "m0-sources"].filter((id) => document.getElementById(id));
    return {
      ids,
      inside: ids.every((id) => !!document.getElementById(id).closest(".wrap .module")),
      gutter: Math.round(document.getElementById(ids[0] ?? "m0-erreurs")?.getBoundingClientRect().left ?? -1),
      cta: !!document.querySelector(".wrap > .cta-band"),
      styledTh: getComputedStyle(document.querySelector("#m0-erreurs ~ .table-wrap th") ?? document.body).backgroundColor,
    };
  });
  check(layout.ids.length >= 1 && layout.inside && layout.gutter >= 16 && layout.cta, `M: the end of the free module stays in its column (${JSON.stringify(layout)})`);
  check(layout.styledTh !== "rgba(0, 0, 0, 0)", "M: the « Diagnostic rapide » table keeps the module table style");
  check(await free.locator('.callout-free-origin a[href="index.html#programme"]').count() === 1, "M: a bridge to the programme right after the download box");
  const csvLinks = await free.locator('a[href="gratuit/exemple-impayes.csv"]').count();
  check(csvLinks >= 2, `M: ${csvLinks} links to gratuit/exemple-impayes.csv`);
  const csv = await free.request.get(`${server.site}/formation/gratuit/exemple-impayes.csv`);
  check(csv.status() === 200 && Buffer.compare(await csv.body(), fs.readFileSync(FREE_CSV)) === 0, "M: the dataset is published where the page links it");
  check(await free.locator('.cta-band a[href="index.html"]').count() === 1, "M: CTA « Découvrir la formation complète » → index.html");
  check(await free.locator('[data-lead-form][data-source="formation-gratuit"]').count() === 1, "M: lead form with source formation-gratuit");
  check(norm(await free.locator('label[for="lead-consent"]').innerText()) === norm(consent), "M: gratuit.html shows the same consent text");
  const title = await free.title();
  const desc = await metaContent(free, 'meta[name="description"]');
  check(title.length <= 65 && desc.length >= 110 && desc.length <= 160, `M: title (${title.length}) and description (${desc.length}) lengths fit search results`);
  check(await free.locator('link[rel="canonical"]').getAttribute("href") === `${PUBLIC_BASE}gratuit.html`, "M: canonical URL of gratuit.html");
  const types = await free.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)["@type"]));
  check(types.join(",") === "Article,FAQPage", `M: JSON-LD Article + FAQPage (${types.join(", ")})`);
  check(await free.locator('meta[name="robots"]').count() === 0, "M: gratuit.html is indexable");
  await assertNoHorizontalScroll(free, "M gratuit");
  await assertShimIdle(free, "M gratuit");
  await shoot(free, "M-gratuit", { fullPage: true });

  const sitemap = await (await free.request.get(`${server.site}/formation/sitemap.xml`)).text();
  check(sitemap.includes(`<loc>${PUBLIC_BASE}</loc>`) && sitemap.includes(`<loc>${PUBLIC_BASE}gratuit.html</loc>`), "M: formation/sitemap.xml lists index and gratuit.html");
  check(!/lecture|recu|attestation|demo/.test(sitemap), "M: the sitemap leaves out the private and demo pages");
  await ctx2.close();
}

/* ------------------------------------------------------------------------------------------------------------ */
/* L — manual Wave transfer recognised by the owner's phone                                                     */
/* ------------------------------------------------------------------------------------------------------------ */

async function manualJourney(browser, server, { problems, shoot, out }) {
  const context = await phoneContext(browser, problems, "L");
  const page = await context.newPage();
  const shot = (name) => shoot(page, `L-${name}`, { fullPage: true });

  await page.goto(`${server.site}/formation/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector("#buy-form:not([hidden])");
  check(await page.locator('[data-when="open"]').first().isVisible(), "L: sales open → the buy form is shown");
  check(norm(await page.locator("#buy-submit").innerText()) === `Acheter la formation — ${norm(fcfa(25000))}`, "L: « Acheter la formation — 25 000 FCFA »");
  check(norm(await page.locator(".price-amount [data-course-price], [data-course-price]").first().innerText()) === norm(fcfa(25000)), "L: price « 25 000 FCFA »");
  await assertNoHorizontalScroll(page, "L index/open");
  await assertShimIdle(page, "L index");

  await page.click("#buy-submit");
  check((await page.locator("#buy-fullName-error").innerText()).length > 0 && (await page.locator("#buy-acceptCgv-error").innerText()).length > 0, "L: empty submit → field errors on the name and the CGV box");

  const created = await buy(page, BUYER);
  const order = created.order;
  check(order.product === "pq_essentiel" && order.amount === 25000 && /^TCV-/.test(order.id), `L: course order ${order.id} created at 25 000 FCFA`);
  await page.waitForSelector("#manual-panel");
  const exactText = norm(await page.locator("#m-amount").innerText());
  check(exactText === norm(fcfa(24999)), `L: the panel asks for exactly ${exactText} (first course order of this server)`);
  check(norm(await page.locator(".exact-line").innerText()).startsWith("Envoyez exactement"), "L: « Envoyez exactement … »");
  check(norm(await page.locator(".exact-why").innerText()).includes(`C'est votre montant personnel, ${norm(fcfa(1))} de moins que le prix (${norm(fcfa(25000))})`), "L: the panel says the exact amount is a little below the price");
  check(norm(await page.locator("#manual-after").innerText()).startsWith("Votre accès s'ouvre tout seul"), "L: a unique amount → « Votre accès s'ouvre tout seul »");
  check(norm(await page.locator(".pay-note").first().innerText()) === "Les frais de transfert Wave sont à votre charge.", "L: transfer fees at the buyer's charge");
  await assertNoHorizontalScroll(page, "L index/manual panel");
  await shot("manual-panel");
  const book = await page.evaluate(() => JSON.parse(localStorage.getItem("tpro:courses") || "[]"));
  check(book[0]?.id === order.id && book[0]?.token === order.token, "L: tpro:courses holds the order");

  // The owner's phone (MacroDroid, simulated by /fake-phone): first a round family transfer, then the exact amount.
  const ownerCtx = await phoneContext(browser, problems, "L phone");
  const phone = await ownerCtx.newPage();
  const sendNotification = async (text) => {
    if (text !== null) await phone.fill("#text", text);
    const res = phone.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/payments/notify");
    await phone.click("#send");
    return (await res).json();
  };
  await phone.goto(`${server.site}/fake-phone`);
  const round = await sendNotification("Vous avez reçu 25 000F de Maman. Nouveau solde : 80 000F");
  check(round.ok === true && round.matched === null, "L: a round « 25 000F » notification matches no order");
  check((await api(server, "GET", orderRoute(order))).body.order.status !== "paid", "L: …and the course stays locked");

  await page.click("#manual-paid-btn");
  await page.waitForURL(/\/formation\/lecture\.html\?o=/);
  await page.waitForFunction(() => document.querySelector("#rd-state h1")?.textContent === "Paiement en attente");
  check(true, "L: « J'ai envoyé l'argent » → lecture.html « Paiement en attente »");
  check(norm(await page.locator("#rd-state").innerText()).includes(`prix ${norm(fcfa(25000))}. Le montant exact à envoyer (un peu moins)`), "L: the waiting screen says the price, and that the exact amount is a little less");
  await shot("pending");

  await phone.reload();
  await phone.locator("#open li", { hasText: order.id }).getByRole("button", { name: "Remplir" }).click();
  check((await phone.inputValue("#text")).includes(`24${NBSP}999F`), "L: the phone fills the exact amount 24 999F");
  const exact = await sendNotification(null);
  check(exact.matched === order.id && exact.paid === true && exact.amount === 24999, `L: the exact notification unlocks ${order.id}`);
  await ownerCtx.close();

  await page.waitForSelector("#rd-layout:not([hidden])", { timeout: 20_000 });
  check(true, "L: the reader opens by itself once the payment is recognised");
  const content = norm(await page.locator("#content").innerText());
  check(content.includes("Module test 1 — Lorem ipsum"), "L: module 1 « Module test 1 — Lorem ipsum » is shown");
  check(norm(await page.locator("#rd-buyer").innerText()) === BUYER.fullName, "L: the buyer's name is in the header");
  const footer = norm(await page.locator("#rd-footer-licence").innerText());
  check(footer === `Licence personnelle — ${BUYER.fullName} — ${order.id}. Usage personnel uniquement.`, "L: the licence line is in the footer");
  await assertNoHorizontalScroll(page, "L lecture");
  const codes = await page.evaluate(() => ({
    pre: document.querySelectorAll("#m1 pre.m-code").length,
    buttons: document.querySelectorAll("#m1 .code-box > pre.m-code + .code-copy").length,
    title: document.querySelector("#m1 .table-title")?.textContent ?? "",
    nextIsBox: document.querySelector("#m1 .table-title")?.nextElementSibling?.classList.contains("table-wrap") ?? false,
    captionHidden: document.querySelector("#m1 .table-wrap caption")?.classList.contains("sr-only") ?? false,
  }));
  check(codes.pre > 0 && codes.buttons === codes.pre, `L: every M block has its « Copier le code » button (${codes.buttons}/${codes.pre})`);
  check(codes.title.length > 0 && codes.nextIsBox && codes.captionHidden, "L: the table title sits above its scrolling box (caption kept for screen readers)");
  await page.locator("#m1 .code-copy").first().click();
  await page.waitForFunction(() => document.querySelector("#m1 .code-copy")?.textContent !== "Copier le code", null, { timeout: 10_000 }).catch(() => {});
  const copied = norm(await page.locator("#m1 .code-copy").first().innerText());
  check(copied === "Copié ✓" || copied === "Sélectionnez le code", `L: « Copier le code » answers (${copied})`);
  await shot("reader");

  // Module 2 carries the inert sanitizer trap of the fixture.
  await goSection(page, "m2");
  await page.locator("#m2 p", { hasText: "gestionnaire d'événement" }).click();
  await page.locator("#m2 a", { hasText: "Lien test javascript" }).click();
  const trap = await page.evaluate(() => ({
    pwned: typeof window.__pwned,
    // The module fragments only (the reader's own quiz inputs are not course HTML).
    bad: [...document.querySelectorAll(".module-body")].flatMap((b) => [...b.querySelectorAll('[onclick], [style], script, img, a[href^="javascript:"]')]).map((n) => n.outerHTML.slice(0, 80)),
    bodies: document.querySelectorAll("#rd-sections .module-body").length,
  }));
  check(trap.bodies === 2 && trap.pwned === "undefined" && trap.bad.length === 0, `L: module 2 trap neutralised (no handler, style, script, img or javascript: link)${trap.bad.length ? ` — ${trap.bad.join(" | ")}` : ""}`);
  if (!page.url().includes("/formation/lecture.html")) await page.goBack();

  await goSection(page, "fichiers");
  const xlsx = await download(page, '#fichiers [data-file="module-1.xlsx"]', out);
  check(xlsx.name === "module-1.xlsx", "L: module-1.xlsx downloaded");
  const entries = unzipSync(new Uint8Array(xlsx.bytes));
  const shared = strFromU8(entries["xl/sharedStrings.xml"]);
  check(shared.includes(`Licence personnelle — Aïssatou N&apos;Diaye-Bâ — ${order.id}`), "L: xl/sharedStrings.xml carries « Licence personnelle — Aïssatou N&apos;Diaye-Bâ — TCV-… »");
  const allXml = Object.entries(entries).filter(([n]) => /^xl\/.+\.xml$/.test(n)).map(([, b]) => strFromU8(b)).join("");
  check(!allXml.includes("{{LICENCE}}"), "L: no {{LICENCE}} placeholder left in the workbook");
  const opened = libreOfficeOpens(path.join(out, xlsx.name), path.join(out, "libreoffice"));
  if (opened === null) console.log("# skip: LibreOffice (soffice) not installed, module-1.xlsx not opened");
  else check(opened, "L: LibreOffice opens the personalised workbook");
  const zip = await download(page, '#fichiers [data-file="donnees-module-1.zip"]', out);
  const zipEntries = unzipSync(new Uint8Array(zip.bytes));
  check(strFromU8(zipEntries["LICENCE.txt"]).includes(`Licence personnelle — ${BUYER.fullName} — ${order.id}`), "L: the data zip carries LICENCE.txt with the buyer's name");

  await goSection(page, "quiz");
  await answerQuiz(page, { q01: 0, q02: 1, q03: 0, q04: 0 });
  await page.click('#quiz-form button[type="submit"]');
  await page.waitForSelector("#quiz-result.is-fail");
  check(norm(await page.locator("#quiz-result").innerText()).startsWith(`Score : 50 %. Il faut au moins 70 %`), "L: 2/4 → « Score : 50 %. Il faut au moins 70 % … »");
  await answerQuiz(page, { q01: 0, q02: 1, q03: 2, q04: 3 });
  await page.check("#quiz-public");
  await page.click('#quiz-form button[type="submit"]');
  await page.waitForSelector("#quiz-result.is-pass");
  const code = norm(await page.locator("#quiz-code").innerText());
  check(/^[0-9a-f]{12}$/.test(code), `L: 4/4 → attestation code ${code}`);
  check(await page.locator("#quiz-public-link").getAttribute("href") === `attestation.html?c=${code}`, "L: link to the public verification page");
  const wa = await page.locator("[data-whatsapp-self]").first().getAttribute("href");
  check(wa.startsWith("https://wa.me/?text="), "L: « Envoyer ce lien sur mon WhatsApp » is a wa.me self-send link");
  await shot("quiz-passed");

  const verify = await context.newPage();
  await verify.goto(`${server.site}/formation/attestation.html?c=${code}`, { waitUntil: "networkidle" });
  await verify.waitForSelector(".verify-name");
  check(norm(await verify.locator(".verify-name").innerText()) === BUYER.fullName, "L: attestation.html?c= shows the holder's name");
  const pub = await api(server, "GET", `/attestations/${code}`);
  check(pub.status === 200 && pub.body.fullName === BUYER.fullName && !("orderId" in pub.body) && !("score" in pub.body), "L: GET /attestations/:code returns the name, course and date only");

  await verify.goto(`${server.site}/formation/attestation.html?o=${order.id}&t=${encodeURIComponent(order.token)}`, { waitUntil: "networkidle" });
  await verify.waitForSelector("#att-sheet:not([hidden])");
  check(norm(await verify.locator("#cert-name").innerText()) === BUYER.fullName && norm(await verify.locator("#cert-code").innerText()) === code, "L: the buyer's printable attestation shows the name and the code");
  await shoot(verify, "L-attestation");

  await verify.goto(`${server.site}/formation/recu.html?o=${order.id}&t=${encodeURIComponent(order.token)}`, { waitUntil: "networkidle" });
  await verify.waitForSelector("#rc-sheet:not([hidden])");
  check(norm(await verify.locator("#rc-paid").innerText()) === `Montant payé : ${norm(fcfa(24999))}`, "L: the receipt shows « Montant payé : 24 999 FCFA »");
  check(norm(await verify.locator("#rc-seller").innerText()) === "Vendeur : particulier — reçu de paiement, pas une facture", "L: the receipt carries the seller line");
  await shoot(verify, "L-recu");

  for (const p of ["lecture.html", "recu.html", "attestation.html"]) {
    await verify.goto(`${server.site}/formation/${p}`);
    const robots = await metaContent(verify, 'meta[name="robots"]');
    const referrer = await metaContent(verify, 'meta[name="referrer"]');
    check(robots === "noindex, nofollow" && referrer === "no-referrer", `L: ${p} is noindex and no-referrer`);
  }
  await context.close();
  return order;
}

/* ------------------------------------------------------------------------------------------------------------ */
/* N — Wave payment                                                                                             */
/* ------------------------------------------------------------------------------------------------------------ */

async function waveJourney(browser, server, { problems, shoot }) {
  const context = await phoneContext(browser, problems, "N");
  const page = await context.newPage();
  await page.goto(`${server.site}/formation/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector("#buy-form:not([hidden])");
  const { order } = await buy(page, { fullName: "Jean-Pierre Diop" });
  await page.waitForURL(/\/fake-wave\/pay\//);
  await page.getByRole("button", { name: "Payer", exact: true }).click();
  await page.waitForURL(/\/formation\/lecture\.html\?o=/);
  await page.waitForSelector("#rd-layout:not([hidden])", { timeout: 20_000 });
  check(norm(await page.locator("#rd-buyer").innerText()) === "Jean-Pierre Diop", `N: Wave « Payer » → lecture.html unlocked for ${order.id}`);
  const paid = await api(server, "GET", orderRoute(order));
  check(paid.body.order.status === "paid" && paid.body.order.paymentMethod === "wave" && paid.body.receipt.amount === 25000, "N: API reports the course paid by Wave (25 000 FCFA)");
  await shoot(page, "N-reader");
  await context.close();
}

/* ------------------------------------------------------------------------------------------------------------ */
/* O — admin                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------ */

async function adminCard(browser, server, { problems, shoot }) {
  const context = await phoneContext(browser, problems, "O");
  const admin = await context.newPage();
  await admin.goto(`${server.site}/admin.html#k=${DEV_ADMIN_KEY}`);
  await admin.waitForSelector("#course-card:not([hidden])");
  const facts = (await admin.locator("#course-facts strong").allInnerTexts()).map(norm);
  check(facts[0] === "Ventes ouvertes" && facts[1].startsWith("Contenu en ligne (version 0.0-test, 2 modules)"), `O: admin « Formation » card (${facts.join(" · ")})`);
  check(facts.some((f) => /^\d+ contact\(s\) en attente de l'ouverture$/.test(f)) && facts.some((f) => /^[1-9]\d* attestation\(s\)$/.test(f)), "O: leads and attestations are counted");
  const row = admin.locator('#funnel-body tr[data-product="pq_essentiel"]');
  check(await row.count() === 1 && norm(await row.locator("td").first().innerText()) === "Formation Power Query", "O: « Par produit (30 jours) » lists the course");
  const stats = (await api(server, "GET", "/admin/stats", ADMIN_AUTH)).body;
  check(stats.course.salesOpen === true && stats.stats.funnel.last30.some((r) => r.product === "pq_essentiel" && r.paid >= 1), "O: GET /admin/stats carries the course block and its funnel");
  await assertNoHorizontalScroll(admin, "O admin");
  await shoot(admin, `O-admin-${server.payment}`, { fullPage: true });
  await context.close();
}

/* ------------------------------------------------------------------------------------------------------------ */
/* P — demo mode                                                                                                */
/* ------------------------------------------------------------------------------------------------------------ */

async function demoJourney(browser, server, { problems, shoot, out }) {
  const context = await phoneContext(browser, problems, "P");
  const apiCalls = [];
  context.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/")) apiCalls.push(`${r.method()} ${u.pathname}`);
  });
  const page = await context.newPage();
  const shot = (name) => shoot(page, `P-${name}`, { fullPage: true });

  // Without the flag every formation page leaves the shim idle.
  for (const p of PAGES) {
    await page.goto(`${server.site}/formation/${p}`, { waitUntil: "networkidle" });
    await assertShimIdle(page, `P ${p} (no flag)`);
  }

  await page.goto(`${server.site}/formation/demo.html`, { waitUntil: "networkidle" });
  check(norm(await page.locator("#demo-lead").innerText()) === "Version de démonstration : le paiement est simulé, aucun argent n'est prélevé.", "P: demo.html explains « Version de démonstration : le paiement est simulé, aucun argent n'est prélevé. »");
  check(await metaContent(page, 'meta[name="robots"]') === "noindex, nofollow", "P: demo.html is noindex");
  await assertNoHorizontalScroll(page, "P demo.html");
  await shot("demo");
  apiCalls.length = 0;
  const startTop = await page.evaluate(() => document.getElementById("demo-start").getBoundingClientRect().top);
  check(startTop < 844, `P: « Commencer la démo » is on the first screen (top ${Math.round(startTop)} px)`);
  await page.click("#demo-start");
  await page.waitForURL(/\/formation\/index\.html#tarif$/);
  await page.waitForSelector("#tpro-demo-banner");
  const bannerText = norm(await page.locator("#tpro-demo-banner").innerText());
  check(bannerText === "MODE DÉMO Paiement simulé : n'envoyez rien, touchez « J'ai envoyé l'argent » Quitter la démo", `P: fixed banner with the next step of the page (${bannerText})`);
  const bar = await page.evaluate(() => ({
    h: document.getElementById("tpro-demo-banner").getBoundingClientRect().height,
    v: getComputedStyle(document.documentElement).getPropertyValue("--demo-bar-h").trim(),
  }));
  check(bar.v === `${Math.ceil(bar.h)}px`, `P: --demo-bar-h follows the banner height (${bar.v}, ${Math.round(bar.h)} px)`);
  check(await page.evaluate(() => sessionStorage.getItem("tpro:demo")) === "1", "P: « Commencer la démo » set sessionStorage tpro:demo = 1");
  await page.waitForSelector("#buy-form:not([hidden])");
  check(true, "P: the demo opens sales (mock GET /config)");

  // In the demo nothing goes over the network: the order is read back from « Mes formations ».
  await fillBuyForm(page, { fullName: "Moussa Démo" });
  await page.click("#buy-submit");
  await page.waitForSelector("#manual-panel");
  const created = { order: await page.evaluate(() => JSON.parse(localStorage.getItem("tpro:courses") || "[]")[0]) };
  check(/^DEMO-/.test(created.order.id) && created.order.token.length === 32, `P: simulated order ${created.order.id}`);
  check(norm(await page.locator("#m-amount").innerText()) === norm(fcfa(24987)), "P: manual panel « Envoyez exactement 24 987 FCFA »");
  check(await page.locator("#manual-whatsapp").count() === 0, "P: no WhatsApp message to the seller in the demo");
  await assertNoHorizontalScroll(page, "P index/manual panel");
  await shot("manual-panel");
  await page.click("#manual-paid-btn");
  await page.waitForURL(/\/formation\/lecture\.html\?o=DEMO-/);
  await page.waitForSelector("#rd-layout:not([hidden])", { timeout: 20_000 });
  check(true, "P: « J'ai envoyé l'argent » → the reader opens a few seconds later");
  check(await page.locator("#rd-toc li").count() === 8, "P: the reader lists 8 modules");
  check((await page.locator("#m1").innerText()).includes("La balance âgée des impayés") && await page.locator("#m1 pre.m-code").count() > 0, "P: module 1 is the free module (sample lesson)");
  await goSection(page, "m5");
  check(norm(await page.locator("#m5").innerText()).includes("Contenu réservé aux acheteurs — visible dans la vraie formation"), "P: modules 2–8 show « Contenu réservé aux acheteurs — visible dans la vraie formation »");
  check(norm(await page.locator("#m5").innerText()).includes("Dans la vraie formation : Jours de retard recalculés") && norm(await page.locator("#m5").innerText()).includes("7 exercices"), "P: a demo placeholder describes the real module (public programme line, exercise count)");
  check(await page.locator('#m1 a[href="gratuit/exemple-impayes.csv"]').count() >= 2, "P: the sample lesson keeps its links to the public data file");
  await assertNoHorizontalScroll(page, "P lecture");
  await shot("reader");

  // « Envoyer ce lien sur mon WhatsApp » would send a link that only works in this tab: explained, nothing opens.
  const pagesBefore = context.pages().length;
  await page.locator("[data-whatsapp-self]").first().dispatchEvent("click"); // it lives in the (closed) Sommaire drawer
  check(norm(await page.locator("#tpro-demo-banner .demo-hint").innerText()).startsWith("En démonstration, ce lien ne marcherait pas") && context.pages().length === pagesBefore, "P: the WhatsApp self-send link is explained in the demo, not opened");
  await goSection(page, "fichiers");
  const csv = await download(page, '#fichiers [data-file="exemple-impayes.csv"]', out);
  check(Buffer.compare(csv.bytes, fs.readFileSync(FREE_CSV)) === 0, "P: the download is the public exemple-impayes.csv");

  await goSection(page, "quiz");
  check(await page.locator("#quiz-form fieldset").count() === 3, "P: 3-question sample quiz");
  await answerQuiz(page, { q01: 0, q02: 1, q03: 0 });
  await page.click('#quiz-form button[type="submit"]');
  await page.waitForSelector("#quiz-result.is-fail");
  check(norm(await page.locator("#quiz-result").innerText()).startsWith("Score : 67 %"), "P: 2/3 → 67 %, not enough");
  await answerQuiz(page, { q01: 0, q02: 1, q03: 2 });
  await page.check("#quiz-public");
  await page.click('#quiz-form button[type="submit"]');
  await page.waitForSelector("#quiz-result.is-pass");
  const code = norm(await page.locator("#quiz-code").innerText());
  check(/^[0-9a-f]{12}$/.test(code), `P: 3/3 → simulated attestation code ${code}`);
  await page.click("#quiz-public-link");
  await page.waitForURL(/\/formation\/attestation\.html\?c=/);
  await page.waitForSelector(".verify-name");
  check(norm(await page.locator(".verify-name").innerText()) === "Moussa Démo", "P: the public verification page (same tab, demo kept) shows the name");
  const { id, token } = created.order;
  await page.goto(`${server.site}/formation/attestation.html?o=${id}&t=${encodeURIComponent(token)}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#att-sheet:not([hidden])");
  check(norm(await page.locator("#cert-name").innerText()) === "Moussa Démo", "P: printable attestation works in the demo");
  await page.goto(`${server.site}/formation/recu.html?o=${id}&t=${encodeURIComponent(token)}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#rc-sheet:not([hidden])");
  check(norm(await page.locator("#rc-paid").innerText()) === `Montant payé : ${norm(fcfa(24987))}` && norm(await page.locator("#rc-label").innerText()).includes("démonstration"), "P: receipt « 24 987 FCFA », labelled as a demonstration");
  await shot("recu");

  await page.goto(`${server.site}/formation/gratuit.html`, { waitUntil: "networkidle" });
  await page.fill("#lead-email", "demo@example.com");
  await page.check("#lead-consent");
  await page.click('[data-lead-form] button[type="submit"]');
  await page.waitForSelector("[data-lead-done]:not([hidden])");
  check(true, "P: the lead form is simulated");
  const tab = await page.evaluate(() => Object.keys(sessionStorage).sort());
  check(tab.includes("tpro:demo:ls:tpro:courses") && tab.includes("tpro:demo:ls:tpro:lead") && tab.includes("tpro:demo:state"), "P: the demo keeps its orders, progress and lead in the tab (sessionStorage)");
  check(apiCalls.length === 0, `P: zero request reached the API during the demo${apiCalls.length ? ` — ${apiCalls.join(", ")}` : ""}`);

  await page.click("#tpro-demo-quit");
  await page.waitForURL(/\/formation\/index\.html$/);
  await page.waitForLoadState("networkidle");
  const after = await page.evaluate(() => ({
    session: Object.keys(sessionStorage),
    local: Object.keys(localStorage).filter((k) => k.startsWith("tpro:")),
  }));
  check(after.session.length === 0, `P: « Quitter la démo » clears the flag and every demo entry of the tab (${after.session.join(", ") || "none left"})`);
  check(after.local.length === 0, `P: the phone's real localStorage was never written by the demo (no order, progress, quiz or lead)${after.local.length ? ` — ${after.local.join(", ")}` : ""}`);
  await assertShimIdle(page, "P index after « Quitter la démo »");
  check(apiCalls.includes("GET /api/config"), "P: after quitting, the page talks to the real API again");
  await context.close();
}

export async function courseFlows(browser, servers, ctx) {
  console.log("# S — demo-shim.js idle without the demo flag");
  shimUnit();
  console.log("# M — course sales closed: lead form, free module, sitemap");
  await closedAndFree(browser, servers.manual, ctx);
  console.log("# L — course, manual Wave transfer recognised by the owner's phone");
  await manualJourney(browser, servers.manual, ctx);
  console.log("# N — course, Wave payment");
  await waveJourney(browser, servers.wave, ctx);
  console.log("# O — admin « Formation » card");
  await adminCard(browser, servers.manual, ctx);
  console.log("# P — demo mode (demo.html), no request to the API");
  await demoJourney(browser, servers.manual, ctx);
}
