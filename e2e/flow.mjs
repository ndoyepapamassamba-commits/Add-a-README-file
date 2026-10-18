// End-to-end flow of Teranga CV on a 360 px phone against the real API (supabase/functions/api/dev.ts:
// MemoryStore + FakeWave), started here as two child processes (DEV_PAYMENT=wave and DEV_PAYMENT=manual).
// Run: cd e2e && npm install && node flow.mjs      Screenshots and server logs go to $SHOTS_DIR (default: tmp).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { api, DEV_ADMIN_KEY, DEV_CRON_SECRET, startDevServer } from "./lib/devserver.mjs";
import {
  assertNoHorizontalScroll,
  check,
  launchBrowser,
  norm,
  passedCount,
  phoneContext,
  saveDownload,
  screenshotter,
} from "./lib/harness.mjs";
import { hiddenFragments } from "./lib/leaks.mjs";
import { libreOfficePages, pdfPageCount } from "./lib/office.mjs";
import { fillWizard, PERSONA } from "./lib/wizard.mjs";

const OUT = process.env.SHOTS_DIR || path.join(os.tmpdir(), "teranga-cv-e2e");
const shoot = screenshotter(OUT);
const problems = []; // console errors, page errors, unexpected external requests (scenario E)
const ADMIN_AUTH = { headers: { authorization: `Bearer ${DEV_ADMIN_KEY}` } };
// The owner guide (LANCEMENT-CV.md, section 7) names these status lights; the admin page must use the same words.
const GUIDE_HEALTH_LABELS = ["Wave", "Webhook", "Versement", "Mode manuel", "Téléphone relié (MacroDroid)", "IA", "Votre numéro Wave"];

/** Whole-page text, hidden parts included, minus the nodes matching `except`. */
const pageText = (page, except = null) =>
  page.evaluate((sel) => {
    const body = document.body.cloneNode(true);
    if (sel) body.querySelectorAll(sel).forEach((n) => n.remove());
    return body.textContent;
  }, except).then(norm);
const orderRoute = (order) => `/orders/${order.id}?t=${encodeURIComponent(order.token)}`;

async function kpiAmount(admin, title) {
  return admin.evaluate((t) => {
    const card = [...document.querySelectorAll("#kpis .kpi")].find((k) => k.querySelector("h3").textContent === t);
    return card ? Number(card.querySelector(".v").firstChild.textContent.replace(/\D/g, "")) : null;
  }, title);
}

async function openAdmin(browser, server, label) {
  const context = await phoneContext(browser, problems, label);
  const admin = await context.newPage();
  await admin.goto(`${server.site}/admin.html#k=${DEV_ADMIN_KEY}`);
  await admin.waitForSelector("#dash:not([hidden])");
  return { context, admin };
}

async function checkPreviewScreen(page, label, { amount, docs }) {
  const masked = await page.locator("#pv-docs .tcv-mask-w").count();
  check(masked > 20, `${label}: preview visible with ${masked} masked words`);
  check(await page.locator("#pv-docs .tcv-lock").count() >= 1, `${label}: preview carries the lock badge`);
  check(await page.locator("#pv-docs .tcv-page").count() === docs, `${label}: ${docs} document(s) rendered in the preview`);
  check(norm(await page.locator("#pay-btn").innerText()) === `Payer ${amount} FCFA avec Wave`, `${label}: pay button reads "Payer ${amount} FCFA avec Wave"`);
  await assertNoHorizontalScroll(page, `${label} index/preview`);
}

/** A — Wave mode, pack: whole wizard, leak-free preview, Moderne, pay on the fake Wave page, downloads, reload. */
async function wavePack(browser, server) {
  const context = await phoneContext(browser, problems, "A");
  const page = await context.newPage();
  const shot = (name) => shoot(page, `A-${name}`, { fullPage: true });

  await page.goto(`${server.site}/index.html`, { waitUntil: "networkidle" });
  await assertNoHorizontalScroll(page, "A index/landing");
  await shoot(page, "A-landing");
  const created = await fillWizard(page, server.site, "pack", shot);
  const order = created.order;
  check(order.product === "pack" && order.amount === 1500 && order.status === "preview", `A: pack order ${order.id} created at 1 500 FCFA`);
  await checkPreviewScreen(page, "A", { amount: "1 500", docs: 2 });
  await page.click("#pv-zoom");
  check(await page.locator("#pv-docs .doc-frame.is-zoomed").count() === 1, "A: « Agrandir l'aperçu » shows the CV at real size");
  await assertNoHorizontalScroll(page, "A index/preview zoomed");
  await page.click("#pv-zoom");
  await page.goBack();
  await page.waitForSelector('#wizard .step[data-step="lettre"]:not([hidden])');
  check(true, "A: Back from the preview returns to the last form step");
  await page.goForward();
  await page.waitForSelector('[data-view="preview"]:not([hidden])');

  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/template"));
  await page.click('#pv-templates label:has(input[value="moderne"])');
  check((await saved).status() === 200, "A: template Moderne saved on the order");
  check(await page.locator("#pv-docs .tcv-page.tpl-moderne").count() === 2, "A: both documents re-rendered with Moderne");
  await shot("preview-cv");
  await page.click('#pv-doc-tabs label:has(input[value="lettre"])');
  await shot("preview-lettre");
  await page.click('#pv-doc-tabs label:has(input[value="cv"])');
  // The wizard holds what the customer typed and the landing view a fictional sample: neither is generated text.
  const previewText = await pageText(page, "#view-wizard, #view-landing");

  await page.click("#pay-btn");
  await page.waitForURL(/\/fake-wave\/pay\//);
  await shot("fake-wave");
  await page.getByRole("button", { name: "Payer", exact: true }).click();
  await page.waitForURL(/\/resultat\.html\?o=/);
  await page.waitForSelector("#st-ready:not([hidden])");
  check(true, "A: Wave payment lands on resultat.html with the documents ready");

  const paid = await api(server, "GET", orderRoute(order));
  check(paid.status === 200 && paid.body.order.status === "paid" && paid.body.order.paymentMethod === "wave", "A: API reports the order paid by Wave");
  check(paid.body.order.template === "moderne", "A: the order kept the Moderne template");
  const fragments = hiddenFragments(paid.body.document, created.preview);
  check(fragments.length >= 10, `A: ${fragments.length} generated sentences/items are masked in the preview`);
  const leaked = fragments.filter((f) => previewText.includes(f));
  check(leaked.length === 0, `A: none of them appeared in the preview page text (outside the form and the landing sample)${leaked.length ? ` — leaked: ${leaked.join(" | ")}` : ""}`);

  const resultText = await pageText(page);
  const missing = fragments.filter((f) => !resultText.includes(f));
  check(missing.length === 0, `A: all of them are shown after payment${missing.length ? ` — missing: ${missing.join(" | ")}` : ""}`);
  check(await page.locator("#docs .tcv-mask").count() === 0, "A: no masked text left after payment");
  check(await page.locator("#docs .doc-card").count() === 2, "A: full CV and full lettre visible");
  check(resultText.includes(PERSONA.fullName), `A: unicode name rendered as "${PERSONA.fullName}"`);
  check(await page.locator('#rs-templates input[value="moderne"]').isChecked(), "A: result page opens on Moderne");
  await assertNoHorizontalScroll(page, "A resultat");
  await shot("resultat");

  for (const kind of ["cv", "lettre"]) {
    const prefix = kind === "cv" ? "CV" : "Lettre";
    const card = page.locator(`#docs .doc-card[data-doc="${kind}"]`);

    const pdfEvent = page.waitForEvent("download", { timeout: 60_000 });
    await card.locator('[data-act="pdf"]').click();
    const pdf = await saveDownload(await pdfEvent, OUT);
    check(pdf.name === `${prefix}-${PERSONA.fileBase}.pdf`, `A: ${kind} PDF download event (${pdf.name})`);
    check(pdf.bytes.subarray(0, 5).toString() === "%PDF-" && pdf.bytes.length > 20_000, `A: ${kind} PDF is a real PDF (${pdf.bytes.length} bytes)`);
    check(pdfPageCount(pdf.bytes) === 1, `A: ${kind} PDF is exactly one A4 page`);

    const wordEvent = page.waitForEvent("download");
    await card.locator('[data-act="word"]').click();
    const word = await saveDownload(await wordEvent, OUT);
    const html = word.bytes.toString("utf8");
    check(word.name === `${prefix}-${PERSONA.fileBase}.doc`, `A: ${kind} Word download event (${word.name})`);
    check(html.includes("urn:schemas-microsoft-com:office:word") && html.includes(PERSONA.fullName), `A: ${kind} Word file is Word HTML with the customer's name`);
    const loPages = libreOfficePages(path.join(OUT, word.name), path.join(OUT, "libreoffice"));
    if (loPages === null) console.log(`# skip: LibreOffice (soffice) not installed, ${kind} Word file not opened`);
    else check(loPages === 1, `A: ${kind} Word file opens in LibreOffice as one A4 page (got ${loPages})`);
  }

  await page.reload();
  await page.waitForSelector("#st-ready:not([hidden])");
  check(await page.locator("#docs .tcv-page.tpl-moderne").count() === 2, "A: after a reload both documents still render (Moderne)");
  check((await pageText(page)).includes(PERSONA.fullName), "A: after a reload the content is intact");
  await context.close();
  return order;
}

/** B — Wave mode, lettre: Annuler on the fake Wave page, retry banner, then paying again works. */
async function waveCancel(browser, server) {
  const context = await phoneContext(browser, problems, "B");
  const page = await context.newPage();
  const shot = (name) => shoot(page, `B-${name}`, { fullPage: true });

  const { order } = await fillWizard(page, server.site, "lettre", async () => {});
  check(order.product === "lettre" && order.amount === 1000, `B: lettre order ${order.id} created at 1 000 FCFA`);
  await checkPreviewScreen(page, "B", { amount: "1 000", docs: 1 });

  // On Android the Wave app can take over the payment link: this tab never leaves the preview (a 204 here).
  await page.route(/\/fake-wave\/pay\//, (route) => route.fulfill({ status: 204 }), { times: 1 });
  await page.click("#pay-btn");
  await page.waitForFunction(() => document.querySelector("#pay-status").textContent === "Ouverture de Wave…");
  check(await page.locator("#pay-btn").isDisabled(), "B: while Wave opens, the pay button is busy");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); // back from the Wave app
  await page.waitForSelector("#pay-return:not([hidden])");
  check(!(await page.locator("#pay-btn").isDisabled()), "B: back from the Wave app, the pay button works again");
  check(await page.getAttribute("#pay-return-link", "href") === `resultat.html?o=${order.id}&t=${encodeURIComponent(order.token)}`, "B: « Afficher mes documents » links to the order");

  await page.click("#pay-btn");
  await page.waitForURL(/\/fake-wave\/pay\//);
  const firstPayPage = page.url();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.waitForSelector("#pay-failed:not([hidden])");
  check(await page.locator('[data-view="preview"]').isVisible(), "B: Annuler brings the customer back to the preview");
  check(norm(await page.locator("#pay-failed h2").innerText()) === "Le paiement n'a pas été finalisé", "B: the retry banner is shown");
  check((await api(server, "GET", orderRoute(order))).body.order.status !== "paid", "B: the order is not paid");
  await assertNoHorizontalScroll(page, "B index/retry banner");
  await shot("retry-banner");

  await page.click("#pay-btn");
  await page.waitForURL(/\/fake-wave\/pay\//);
  check(page.url() !== firstPayPage, "B: paying again opens a fresh Wave payment page");
  await page.getByRole("button", { name: "Payer", exact: true }).click();
  await page.waitForURL(/\/resultat\.html\?o=/);
  await page.waitForSelector("#st-ready:not([hidden])");
  check(await page.locator("#docs .doc-card").count() === 1 && await page.locator('#docs .doc-card[data-doc="lettre"]').count() === 1, "B: second attempt paid — the lettre is shown");
  check((await api(server, "GET", orderRoute(order))).body.order.status === "paid", "B: API reports the order paid");
  await shot("resultat");
  await context.close();
  return order;
}

/** C — manual mode, cv: transfer instructions, "J'ai payé" + WhatsApp, pending page, admin unlock, document. */
async function manualCv(browser, server) {
  const context = await phoneContext(browser, problems, "C");
  const opened = [];
  await context.exposeBinding("__tcvRecordOpen", (_source, url) => {
    opened.push(url);
  });
  await context.addInitScript(() => {
    window.open = (url) => {
      window.__tcvRecordOpen(String(url));
      return null;
    };
  });
  const page = await context.newPage();
  const shot = (name) => shoot(page, `C-${name}`, { fullPage: true });

  const { order } = await fillWizard(page, server.site, "cv", async () => {});
  check(order.product === "cv" && order.amount === 1000, `C: cv order ${order.id} created at 1 000 FCFA`);
  await checkPreviewScreen(page, "C", { amount: "1 000", docs: 1 });

  const config = (await api(server, "GET", "/config")).body;
  check(config.payment.manual === true && config.payment.wave === false, "C: /config reports manual mode");
  await page.click("#pay-btn");
  await page.waitForSelector("#manual-panel:not([hidden])");
  check(norm(await page.locator("#m-number").innerText()) === "+221 77 000 00 00", "C: manual instructions show the formatted Wave number +221 77 000 00 00");
  check(norm(await page.locator("#m-amount").innerText()) === "999 FCFA", "C: manual instructions show the unique exact amount 999 FCFA");
  check(norm(await page.locator("#m-ref").innerText()) === order.id, "C: manual instructions show the order reference");
  check(await page.locator("#pay-btn").isHidden(), "C: the transfer instructions replace the Wave pay button");
  check(await page.inputValue("#payer-phone") === PERSONA.phone, "C: the payer number is prefilled with the phone typed in the form");
  await assertNoHorizontalScroll(page, "C index/manual instructions");
  await shot("manual-instructions");

  await page.fill("#payer-phone", "76 555 44 33");
  await page.click("#manual-whatsapp");
  for (let i = 0; i < 20 && opened.length === 0; i++) await sleep(100);
  check(opened.length === 1, "C: « Prévenir le vendeur » opened WhatsApp once");
  const wa = new URL(opened[0]);
  check(wa.origin === "https://wa.me" && wa.pathname === "/221770000000", `C: WhatsApp goes to the owner (${wa.origin}${wa.pathname})`);
  const message = wa.searchParams.get("text") ?? "";
  check(message.includes(order.id) && message.includes("76 555 44 33") && message.includes("999"), "C: the WhatsApp message contains the reference, the exact amount and the payer number");
  await page.click("#manual-paid-btn");
  await page.waitForURL(/\/resultat\.html\?o=/);
  check(opened.length === 1, "C: « J'ai envoyé l'argent » does not open WhatsApp by itself");

  await page.waitForSelector("#st-wait:not([hidden])");
  check(norm(await page.locator("#wait-title").innerText()) === "Paiement en cours de vérification", "C: resultat shows the pending state");
  check(await page.locator("#wait-preview .tcv-mask-w").count() > 10, "C: only the masked preview is visible while pending");
  await assertNoHorizontalScroll(page, "C resultat/pending");
  await shot("resultat-pending");

  const { context: ownerContext, admin } = await openAdmin(browser, server, "C admin");
  check(!admin.url().includes("k="), "C: admin key removed from the address bar");
  const apiOrder = (await api(server, "GET", "/admin/stats", ADMIN_AUTH)).body.stats.recentOrders.find((o) => o.id === order.id);
  check(apiOrder?.status === "awaiting_manual" && apiOrder.manual_payer_phone === "+221765554433", "C: admin API lists the order as awaiting_manual with the payer phone");
  const row = admin.locator("#orders-body tr", { hasText: order.id });
  check(norm(await row.locator(".badge").innerText()) === "En attente", "C: admin table shows the order « En attente »");
  const card = admin.locator("#unlock-list .unlock-card", { hasText: order.id });
  check((await card.innerText()).includes("+221 76 555 44 33"), "C: admin « Paiements à vérifier » card shows the payer number");
  await assertNoHorizontalScroll(admin, "C admin");
  await shoot(admin, "C-admin-before-unlock", { fullPage: true });

  admin.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: `Débloquer la commande ${order.id}` }).click();
  await admin.waitForFunction((id) => document.querySelector("#dash-status").textContent.includes(`${id} débloquée`), order.id);
  check(norm(await row.locator(".badge").innerText()) === "Payé" && await admin.locator("#to-unlock").isHidden(), "C: after « Débloquer » the order is « Payé »");
  await shoot(admin, "C-admin-after-unlock", { fullPage: true });
  await ownerContext.close();

  await page.waitForSelector("#st-ready:not([hidden])", { timeout: 15_000 });
  check(await page.locator("#docs .doc-card").count() === 1 && await page.locator("#docs .tcv-mask").count() === 0, "C: resultat becomes paid by itself and renders the full CV");
  check((await pageText(page)).includes(PERSONA.experience.missions[0]), "C: the CV shows the customer's missions");
  await assertNoHorizontalScroll(page, "C resultat/paid");
  await shot("resultat-paid");
  await context.close();
  return { ...order, paidAmount: 999 }; // the unique amount asked and recorded by « Débloquer »
}

/** D — admin revenue for today matches the paid orders; the nightly cron answers ok (and pays out in Wave mode). */
async function revenueAndCron(browser, server, paidOrders) {
  const label = `D ${server.payment}`;
  const revenue = paidOrders.reduce((sum, o) => sum + (o.paidAmount ?? o.amount), 0);
  const { context, admin } = await openAdmin(browser, server, label);
  const stats = (await api(server, "GET", "/admin/stats", ADMIN_AUTH)).body.stats;
  check(stats.today.paid === paidOrders.length && stats.today.revenue === revenue, `${label}: API today = ${paidOrders.length} paid, ${revenue} FCFA`);
  check(await kpiAmount(admin, "Aujourd'hui") === revenue, `${label}: admin card « Aujourd'hui » shows ${revenue} FCFA`);
  const healthLabels = await admin.locator("#health strong").allTextContents();
  check(healthLabels.join("|") === GUIDE_HEALTH_LABELS.join("|"), `${label}: admin health labels match LANCEMENT-CV.md (${healthLabels.join(", ")})`);
  const pendingBefore = server.payment === "wave" ? revenue : 0;
  check(await kpiAmount(admin, "À reverser ce soir") === pendingBefore, `${label}: « À reverser ce soir » shows ${pendingBefore} FCFA`);

  const refused = await api(server, "POST", "/cron/daily", { headers: { "x-cron-secret": "wrong" }, body: {} });
  check(refused.status === 401, `${label}: /cron/daily refuses a wrong x-cron-secret`);
  const daily = await api(server, "POST", "/cron/daily", { headers: { "x-cron-secret": DEV_CRON_SECRET }, body: {} });
  check(daily.status === 200 && daily.body.ok === true && daily.body.errors.length === 0, `${label}: POST /api/cron/daily with x-cron-secret dev-cron → ok`);

  if (server.payment === "wave") {
    const payout = daily.body.payout;
    check(payout?.status === "succeeded" && payout.amount > 0 && payout.amount < revenue, `${label}: tonight's payout sent (${payout?.amount} FCFA, fees deducted)`);
    await admin.click("#refresh");
    await admin.waitForFunction(() => document.querySelectorAll("#payouts-body .badge").length > 0);
    const first = norm(await admin.locator("#payouts-body tr").first().innerText());
    check(first.includes("Réussi") && first.includes(payout.amount.toLocaleString("fr-FR").replace(/\s/g, " ")), `${label}: admin « Versements » lists it as « Réussi »`);
    check(await kpiAmount(admin, "À reverser ce soir") === 0, `${label}: nothing left to pay out`);
  } else {
    check(daily.body.payout === null, `${label}: no payout without the Wave API`);
  }
  await assertNoHorizontalScroll(admin, `${label} admin`);
  await shoot(admin, `D-admin-${server.payment}`, { fullPage: true });
  await context.close();
}

/** F — manual mode, blocked storage (private browsing) and markup typed as a name: everything stays plain text. */
async function hostileAndPrivate(browser, server) {
  const context = await phoneContext(browser, problems, "F");
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    window.open = () => null; // « J'ai payé » opens WhatsApp: covered in C
  });
  const page = await context.newPage();
  const dialogs = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    return dialog.dismiss();
  });
  const hostile = { ...PERSONA, firstName: "<img src=x onerror=alert(1)>", lastName: '"><svg onload=alert(2)>', jobTitle: "Comptable <b>senior</b>" };
  const injected = (root) => page.locator(`${root} img, ${root} script, ${root} [onerror], ${root} [onload], ${root} b`).count();

  const { order } = await fillWizard(page, server.site, "cv", async () => {}, hostile);
  check(order.product === "cv", `F: with localStorage blocked the form still creates order ${order.id}`);
  check(await injected("#pv-docs") === 0 && (await pageText(page, "#view-wizard")).includes('"><SVG ONLOAD=ALERT(2)>'), "F: markup typed in the form is shown as text in the preview");

  await page.click("#pay-btn");
  await page.waitForSelector("#manual-panel:not([hidden])");
  await page.click("#manual-paid-btn");
  await page.waitForSelector("#st-wait:not([hidden])");
  const unlocked = await api(server, "POST", `/admin/orders/${order.id}/unlock`, { ...ADMIN_AUTH, body: {} });
  check(unlocked.status === 200 && unlocked.body.changed === true, "F: owner unlocks the order");
  await page.click("#check-now");
  await page.waitForSelector("#st-ready:not([hidden])");
  check(await injected("#docs") === 0 && (await pageText(page)).includes("Comptable <b>senior</b>"), "F: the paid CV shows the markup as text");

  const wordEvent = page.waitForEvent("download");
  await page.locator('#docs [data-act="word"]').click();
  const word = await saveDownload(await wordEvent, OUT);
  const html = word.bytes.toString("utf8");
  check(!/<(img|svg|script|b)\b/i.test(html) && html.includes("&lt;SVG ONLOAD=ALERT(2)&gt;"), `F: the Word file escapes the markup (${word.name})`);
  check(dialogs.length === 0, "F: no script ran (zero alert dialogs)");
  await assertNoHorizontalScroll(page, "F resultat");
  await context.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const started = await Promise.allSettled(
    ["wave", "manual"].map((payment) => startDevServer({ payment, logFile: path.join(OUT, `dev-${payment}.log`) })),
  );
  const servers = started.filter((s) => s.status === "fulfilled").map((s) => s.value);
  const failed = started.find((s) => s.status === "rejected");
  if (failed) {
    await Promise.all(servers.map((s) => s.stop()));
    throw failed.reason;
  }
  const [wave, manual] = servers;
  const browser = await launchBrowser();
  try {
    console.log(`# dev.ts wave ${wave.site} · manual ${manual.site} · output ${OUT}`);
    console.log("# A — Wave mode, pack");
    const a = await wavePack(browser, wave);
    console.log("# B — Wave mode, cancelled then paid");
    const b = await waveCancel(browser, wave);
    console.log("# C — manual mode, cv");
    const c = await manualCv(browser, manual);
    console.log("# D — revenue and nightly cron");
    await revenueAndCron(browser, wave, [a, b]);
    await revenueAndCron(browser, manual, [c]);
    console.log("# F — private browsing and markup typed in the form");
    await hostileAndPrivate(browser, manual);
    console.log("# E — console errors on every page");
    check(problems.length === 0, `E: zero console errors, page errors or unexpected requests${problems.length ? `:\n  ${problems.join("\n  ")}` : ""}`);
    console.log(`\nPASS — ${passedCount()} checks`);
  } catch (err) {
    const pages = browser.contexts().flatMap((c) => c.pages());
    await Promise.all(pages.map((p, i) => shoot(p, `FAIL-${i}`, { fullPage: true }).catch(() => {})));
    if (problems.length) console.error(`console problems so far:\n  ${problems.join("\n  ")}`);
    throw err;
  } finally {
    await browser.close();
    await Promise.all(servers.map((s) => s.stop()));
  }
}

main().catch((err) => {
  console.error(`\nFAIL — ${err.stack ?? err}`);
  process.exitCode = 1;
});
