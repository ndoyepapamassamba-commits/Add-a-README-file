// End-to-end flows of the two newer products against the same dev.ts servers as flow.mjs (which runs them):
//   G — Pack Stage, manual mode: student wizard with 3 companies, preview tabs, unique amount, the transfer
//       recognised by the owner's phone (dev page /fake-phone → POST /api/payments/notify), letters PDF of 3 pages.
//   H — CV Premium, Wave mode: wizard with a photo kept on the phone, masked Prestige preview, fake Wave payment,
//       PDF of at most 2 pages, Word and « CV web (.html) » downloads; manual mode asks 5 000 FCFA minus a unique offset.
import path from "node:path";
import { api, DEV_ADMIN_KEY, DEV_PHONE_HOOK_KEY } from "./lib/devserver.mjs";
import { assertNoHorizontalScroll, check, norm, phoneContext, saveDownload } from "./lib/harness.mjs";
import { hiddenFragments } from "./lib/leaks.mjs";
import { libreOfficePages, pdfPageCount } from "./lib/office.mjs";
import { next, stepSelector, tapChips } from "./lib/wizard.mjs";

const ADMIN_AUTH = { headers: { authorization: `Bearer ${DEV_ADMIN_KEY}` } };
const orderRoute = (order) => `/orders/${order.id}?t=${encodeURIComponent(order.token)}`;
const fcfa = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;

export const STUDENT = {
  civility: "M",
  firstName: "Mamadou Lamine",
  lastName: "Ba",
  fullName: "Mamadou Lamine BA",
  fileBase: "Mamadou-Lamine-BA",
  phone: "78 456 12 30",
  email: "mamadou.ba@gmail.com",
  city: "Thiès",
  school: "Institut supérieur de management (ISM)",
  program: "Comptabilité et gestion",
  studyLevel: "Licence 3",
  sector: "comptabilite",
  department: "Comptabilité",
  project: "Tenue complète des comptes d'une boutique fictive sur Excel, en groupe de quatre étudiants",
  skillChips: ["Saisie comptable", "SYSCOHADA"],
  companies: [
    { name: "Sonatel", city: "Dakar", reason: "Je souhaite découvrir la comptabilité d'un grand groupe et ses procédures de clôture mensuelle." },
    { name: "Cabinet Ndiaye Audit", city: "Thiès", reason: "Votre cabinet suit des PME de Thiès et je veux apprendre la tenue des comptes sur de vrais dossiers." },
    { name: "Wave Mobile Money", city: "Dakar", reason: "Je veux comprendre le contrôle des flux financiers dans une entreprise de paiement mobile." },
  ],
};

export const SENIOR = {
  civility: "Mme",
  firstName: "Aïssatou",
  lastName: "Sow",
  fullName: "Aïssatou SOW",
  fileBase: "Aissatou-SOW",
  phone: "76 234 56 78",
  email: "aissatou.sow@example.com",
  city: "Dakar",
  address: "Mermoz Pyrotechnie",
  jobTitle: "Responsable du contrôle financier",
  sector: "comptabilite",
  headline: "Contrôle financier, reporting réglementaire et pilotage de la performance",
  pitch: "Je pilote depuis 2016 la clôture mensuelle et le reporting d'une banque de détail de 30 agences.",
  quote: "Une clôture réussie se prépare dès le premier jour du mois.",
  figures: [["15+", "années en banque et en audit"], ["30", "agences suivies par le contrôle budgétaire"]],
  domain: ["Clôture et consolidation", "Arrêtés mensuels, états réglementaires, rapprochements"],
  achievement: ["Clôture en 4 jours", "Calendrier de clôture refondu et contrôles automatisés : délai ramené de 9 à 4 jours ouvrés.", "Power Query"],
  education: { degree: "Master Comptabilité, Contrôle, Audit", school: "CESAG", year: "2008" },
  experience: {
    title: "Responsable du contrôle financier",
    company: "Banque de l'Ouest",
    place: "Dakar",
    start: "2016",
    missions: ["Supervision de la clôture mensuelle et des états réglementaires", "Pilotage du budget annuel des agences", "Encadrement d'une équipe de cinq contrôleurs"],
  },
  skillChips: ["Saisie comptable", "SYSCOHADA"],
  level: ["Excel", "Expert"],
};

async function fillIdentity(page, p) {
  await page.click(`label:has(input[name="identity.civility"][value="${p.civility}"])`);
  await page.fill("#f-firstName", p.firstName);
  await page.fill("#f-lastName", p.lastName);
  await page.fill("#f-phone", p.phone);
  await page.fill("#f-email", p.email);
  await page.fill("#f-city", p.city);
  if (p.address) await page.fill("#f-address", p.address);
}

/** Clicks « Voir mon aperçu gratuit » and resolves with the POST /orders body once the preview is shown. */
async function submitWizard(page) {
  const label = await page.locator("#wz-next .btn-label").innerText();
  if (label !== "Voir mon aperçu gratuit") throw new Error(`last step button reads "${label}"`);
  const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/orders");
  await page.click("#wz-next");
  const res = await created;
  if (res.status() !== 201) throw new Error(`POST /orders answered ${res.status()}: ${await res.text()}`);
  await page.waitForSelector('[data-view="preview"]:not([hidden])');
  return res.json();
}

/** A real photo-like image (PNG screenshot of a gradient), as a customer's phone would provide. */
async function makePhoto(context) {
  const page = await context.newPage();
  await page.setContent('<div id="p" style="width:300px;height:400px;background:linear-gradient(135deg,#7a4b2a,#e8c39e 60%,#2b4a6b)"></div>');
  const png = await page.locator("#p").screenshot();
  await page.close();
  return png;
}

/** G — Pack Stage in manual mode, unlocked by the owner's phone. */
export async function stageManual(browser, server, { problems, shoot, out }) {
  const p = STUDENT;
  const context = await phoneContext(browser, problems, "G");
  const page = await context.newPage();
  const shot = (name) => shoot(page, `G-${name}`, { fullPage: true });

  await page.goto(`${server.site}/index.html`, { waitUntil: "networkidle" });
  check(norm(await page.locator("#stage").innerText()).includes("Pack Stage"), "G: the landing page shows the Pack Stage card");
  await page.click('#offres [data-start="stage"]');
  await page.waitForSelector(stepSelector("identite"));
  await fillIdentity(page, p);
  await next(page, "etudes");
  await page.fill("#f-school", p.school);
  await page.fill("#f-program", p.program);
  await page.selectOption("#f-studyLevel", p.studyLevel);
  await page.selectOption("#f-stage-sector", p.sector);
  await next(page, "stage");
  await page.click('#stage-type-options label:has(input[value="fin_etudes"])');
  await page.fill("#f-start", "janvier 2027");
  await page.fill("#f-durationText", "3 mois");
  await page.fill("#f-department", p.department);
  await page.click('label:has(input[name="internship.conventionProvided"][value="oui"])');
  await page.click('#stage-channel-options label:has(input[value="email"])');
  await shot("wizard-stage");
  await next(page, "formation");
  check((await page.inputValue("#f-education-0-degree")).includes(p.program), "G: « Formation » is prefilled from the « Études » step");
  await next(page, "experiences");
  await page.fill("#f-internship-projects-0", p.project);
  await next(page, "competences");
  await tapChips(page, "#chips-skills", p.skillChips);
  await next(page, "langues");
  await next(page, "entreprises");
  for (let i = 0; i < p.companies.length; i++) {
    if (i > 0) await page.click("#company-add");
    const c = p.companies[i];
    await page.fill(`#f-internship-companies-${i}-name`, c.name);
    await page.fill(`#f-internship-companies-${i}-city`, c.city);
    await page.fill(`#f-internship-companies-${i}-reason`, c.reason);
  }
  await page.waitForFunction(() => document.querySelector("#stage-price-amount").textContent.replace(/\s/g, " ").includes("2 500"));
  check(norm(await page.locator("#stage-price-count").innerText()) === "Prix pour 3 entreprises", "G: the live price counts 3 companies");
  await assertNoHorizontalScroll(page, "G index/entreprises");
  await shot("wizard-entreprises");

  const created = await submitWizard(page);
  const order = created.order;
  check(order.product === "stage" && order.amount === 2500 && order.status === "preview", `G: stage order ${order.id} created at 2 500 FCFA (3 companies)`);
  check(created.preview.lettres.length === 3 && created.preview.lettre === null && !!created.preview.envoi, "G: the preview holds 3 letters and the sending message");
  check(norm(await page.locator("#pv-product").innerText()) === "Pack Stage · 3 entreprises", "G: the preview names the product and the number of companies");
  const tabs = await page.locator("#pv-doc-tabs label").allInnerTexts();
  check(tabs.map(norm).join("|") === "CV|Lettre 1|Lettre 2|Lettre 3|Message d'envoi", `G: preview tabs ${tabs.map(norm).join(" · ")}`);
  check(await page.locator("#pv-docs .tcv-mask-w").count() > 20, "G: the preview is masked");
  await page.click('#pv-doc-tabs label:has(input[value="lettre-1"])');
  check(norm(await page.locator('#pv-docs .doc-frame[data-doc="lettre"]:not([hidden])').innerText()).includes(p.companies[1].name), "G: « Lettre 2 » is addressed to the second company");
  await assertNoHorizontalScroll(page, "G index/preview");
  await shot("preview");

  const checkoutRes = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/checkout"));
  await page.click("#pay-btn");
  const checkout = await (await checkoutRes).json();
  await page.waitForSelector("#manual-panel:not([hidden])");
  const exact = checkout.exactAmount;
  check(checkout.mode === "manual" && checkout.amount === 2500 && exact >= 2500 - 49 && exact < 2500, `G: manual checkout asks a unique amount (${exact} FCFA, catalogue 2 500)`);
  check(norm(await page.locator("#m-amount").innerText()) === fcfa(exact), `G: the panel says « Envoyez exactement ${fcfa(exact)} »`);
  check(norm(await page.locator("#m-fee").innerText()) === "Les frais de transfert Wave sont à votre charge.", "G: the panel says the Wave transfer fee is the customer's");
  check(checkout.autoUnlock === true && norm(await page.locator("#manual-after").innerText()).includes("tout seuls"), "G: the customer is told the documents unlock by themselves");
  await shot("manual-panel");
  await page.click("#manual-paid-btn");
  await page.waitForURL(/\/resultat\.html\?o=/);
  await page.waitForSelector("#st-wait:not([hidden])");
  check((await api(server, "GET", orderRoute(order))).body.order.status !== "paid", "G: nothing is unlocked before the transfer arrives");

  // The owner's phone (MacroDroid, simulated by dev.ts /fake-phone) forwards the Wave notification.
  const phoneContextOwner = await phoneContext(browser, problems, "G phone");
  const phone = await phoneContextOwner.newPage();
  await phone.goto(`${server.site}/fake-phone`);
  await phone.locator("#open li", { hasText: order.id }).getByRole("button", { name: "Remplir" }).click();
  check((await phone.inputValue("#text")).includes(`${String(exact).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}F`), "G: the simulated notification carries the exact amount (with a non-breaking space)");
  const notifyRes = phone.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/payments/notify");
  await phone.click("#send");
  const notified = await (await notifyRes).json();
  check(notified.ok === true && notified.matched === order.id && notified.amount === exact && notified.paid === true, `G: POST /api/payments/notify matched ${order.id} and unlocked it`);
  await phoneContextOwner.close();

  await page.waitForSelector("#st-ready:not([hidden])", { timeout: 20_000 });
  check(true, "G: resultat.html unlocked by itself after the notification");
  const stored = (await api(server, "GET", "/admin/stats", ADMIN_AUTH)).body;
  const row = stored.stats.recentOrders.find((o) => o.id === order.id);
  check(row?.status === "paid" && row.payment_method === "manual" && row.payment_detected_at, "G: admin lists the order paid (manual) with « Paiement détecté »");
  check(stored.health.phoneHook === true && typeof stored.health.lastPhoneNotificationAt === "string", "G: admin health shows the phone linked with the last notification time");
  const paid = await api(server, "GET", orderRoute(order));
  check(paid.body.order.status === "paid" && paid.body.document.lettres.length === 3, "G: the API serves the full document with 3 letters");

  const rsTabs = await page.locator("#rs-doc-tabs label").allInnerTexts();
  check(rsTabs.map(norm).join("|") === "CV|Lettre 1|Lettre 2|Lettre 3|Message d'envoi", "G: result tabs CV · Lettre 1…3 · Message d'envoi");
  check(await page.locator("#docs .tcv-mask").count() === 0, "G: no masked text left after payment");
  await assertNoHorizontalScroll(page, "G resultat");
  await shot("resultat");

  const cvPdfEvent = page.waitForEvent("download", { timeout: 60_000 });
  await page.locator('#docs [data-part="cv"] [data-act="pdf"]').click();
  const cvPdf = await saveDownload(await cvPdfEvent, out);
  check(cvPdf.name === `CV-${p.fileBase}.pdf` && pdfPageCount(cvPdf.bytes) === 1, `G: student CV PDF is one A4 page (${cvPdf.name})`);

  await page.click('#rs-doc-tabs label:has(input[value="lettre-0"])');
  const letters = page.locator('#docs [data-part="lettre-0"]');
  await letters.waitFor({ state: "visible" });
  check(norm(await letters.locator('[data-act="pdf-all"]').innerText()) === "Télécharger les 3 lettres (PDF)", "G: one button downloads the 3 letters");
  const pdfEvent = page.waitForEvent("download", { timeout: 90_000 });
  await letters.locator('[data-act="pdf-all"]').click();
  const pdf = await saveDownload(await pdfEvent, out);
  check(pdf.name === `Lettres-de-stage-${p.fileBase}.pdf`, `G: letters PDF download (${pdf.name})`);
  check(pdf.bytes.subarray(0, 5).toString() === "%PDF-" && pdfPageCount(pdf.bytes) === 3, `G: the letters PDF has 3 pages, one per company (got ${pdfPageCount(pdf.bytes)})`);

  const wordEvent = page.waitForEvent("download");
  await letters.locator('[data-act="word-all"]').click();
  const word = await saveDownload(await wordEvent, out);
  const html = word.bytes.toString("utf8");
  check(word.name === `Lettres-de-stage-${p.fileBase}.doc` && p.companies.every((c) => html.includes(c.name)), "G: one Word file holds the 3 letters");
  const loPages = libreOfficePages(path.join(out, word.name), path.join(out, "libreoffice"));
  if (loPages === null) console.log("# skip: LibreOffice (soffice) not installed, letters Word file not opened");
  else check(loPages === 3, `G: the letters Word file opens in LibreOffice as 3 A4 pages (got ${loPages})`);

  await page.click('#rs-doc-tabs label:has(input[value="envoi"])');
  await page.waitForSelector("#env-wa");
  const subject = await page.inputValue("#env-subject");
  const whatsapp = await page.inputValue("#env-wa");
  check(subject.startsWith("Candidature — Stage") && subject.includes(p.fullName), `G: e-mail subject « ${subject} »`);
  check(whatsapp.length > 80 && whatsapp.length <= 600, `G: WhatsApp message of ${whatsapp.length} characters (≤ 600)`);
  await shot("resultat-envoi");
  await context.close();
  return { ...order, paidAmount: exact };
}

/** H — CV Premium: Wave mode end to end, then the unique manual amount on the manual server. */
export async function premiumFlows(browser, servers, { problems, shoot, out }) {
  const p = SENIOR;
  const context = await phoneContext(browser, problems, "H", { fonts: true });
  const page = await context.newPage();
  const shot = (name) => shoot(page, `H-${name}`, { fullPage: true });
  const photo = await makePhoto(context);
  const server = servers.wave;

  await page.goto(`${server.site}/index.html`, { waitUntil: "networkidle" });
  check(norm(await page.locator("#premium").innerText()).includes("Exemple — personne fictive"), "H: the CV Premium card shows a sample labelled as fictional");
  await page.click('#premium [data-start="premium"]');
  await page.waitForSelector(stepSelector("identite"));
  await fillIdentity(page, p);
  await next(page, "objectif");
  await page.fill("#f-jobTitle", p.jobTitle);
  await page.click('#kind-options label:has(input[value="emploi"])');
  await page.selectOption("#f-sector", p.sector);
  await page.selectOption("#f-level", "senior");
  await next(page, "accroche");
  await page.fill("#f-p-headline", p.headline);
  await page.fill("#f-p-pitch", p.pitch);
  await page.fill("#f-p-quote", p.quote);
  for (let i = 0; i < p.figures.length; i++) {
    await page.fill(`#f-p-keyFigures-${i}-value`, p.figures[i][0]);
    await page.fill(`#f-p-keyFigures-${i}-label`, p.figures[i][1]);
  }
  await next(page, "formation");
  await page.fill("#f-education-0-degree", p.education.degree);
  await page.fill("#f-education-0-school", p.education.school);
  await page.fill("#f-education-0-year", p.education.year);
  await next(page, "experiences");
  await page.fill("#f-experiences-0-title", p.experience.title);
  await page.fill("#f-experiences-0-company", p.experience.company);
  await page.fill("#f-experiences-0-place", p.experience.place);
  await page.fill("#f-experiences-0-start", p.experience.start);
  await page.fill("#f-experiences-0-missions", p.experience.missions.join("\n"));
  await next(page, "domaines");
  await page.fill("#f-p-domains-0-title", p.domain[0]);
  await page.fill("#f-p-domains-0-detail", p.domain[1]);
  await page.fill("#f-p-achievements-0-title", p.achievement[0]);
  await page.fill("#f-p-achievements-0-detail", p.achievement[1]);
  await page.fill("#f-p-tag-0", p.achievement[2]);
  await page.press("#f-p-tag-0", "Enter");
  await next(page, "competences");
  await tapChips(page, "#chips-skills", p.skillChips);
  await next(page, "niveaux");
  await page.click("#pw-levels-add");
  await page.fill("#f-p-skillLevels-0-name", p.level[0]);
  await page.selectOption("#f-p-skillLevels-0-level", p.level[1]);
  await next(page, "langues");
  await next(page, "photo");
  await page.setInputFiles("#pw-photo-input", { name: "photo.png", mimeType: "image/png", buffer: photo });
  await page.waitForFunction(() => /Photo ajoutée/.test(document.querySelector("#pw-photo-status").textContent));
  check(norm(await page.locator("#pw-photo-status").innerText()).includes("Elle reste sur ce téléphone"), "H: the photo is resized and kept on the phone");
  await shot("wizard-photo");
  await next(page, "couleur");
  await page.click('label:has(input[name="premium.accent"][value="bordeaux"])');
  const photoUploads = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && (r.postData() ?? "").includes("data:image")) photoUploads.push(r.url());
  });
  const created = await submitWizard(page);
  const order = created.order;
  check(order.product === "premium" && order.amount === 5000 && order.status === "preview", `H: premium order ${order.id} created at 5 000 FCFA`);
  check(photoUploads.length === 0, "H: the photo was never sent to the server");
  check(created.preview.cv.premium.accent === "bordeaux" && created.preview.cv.premium.keyFigures[0].value === "15+", "H: the preview keeps the colour and the key figures typed");
  check(/^[█ ]+$/.test(created.preview.cv.premium.quote) && /^[█ ]+$/.test(created.preview.cv.premium.achievements[0].detail), "H: quote and achievement details are masked in the preview");
  check(await page.locator("#pv-docs .tcv-mask-w").count() > 10, "H: the Prestige preview shows masked text");
  check(await page.locator('#pv-docs img.pcv-img[src^="data:image/jpeg"]').count() === 1, "H: the preview shows the photo from this phone");
  check(norm(await page.locator("#pay-btn").innerText()) === "Payer 5 000 FCFA avec Wave", "H: pay button reads « Payer 5 000 FCFA avec Wave »");
  const previewText = norm(await page.locator("#pv-docs").innerText());
  await assertNoHorizontalScroll(page, "H index/preview");
  await shot("preview");

  await page.click("#pay-btn");
  await page.waitForURL(/\/fake-wave\/pay\//);
  check(norm(await page.locator("body").innerText()).includes("5000 FCFA"), "H: the Wave payment page asks 5 000 FCFA");
  await page.getByRole("button", { name: "Payer", exact: true }).click();
  await page.waitForURL(/\/resultat\.html\?o=/);
  await page.waitForSelector("#st-ready:not([hidden])");
  const paid = await api(server, "GET", orderRoute(order));
  check(paid.body.order.status === "paid" && paid.body.order.paymentMethod === "wave", "H: API reports the order paid by Wave");
  const fragments = hiddenFragments(paid.body.document, created.preview);
  check(fragments.length >= 5, `H: ${fragments.length} sentences were masked in the preview`);
  const leaked = fragments.filter((f) => previewText.includes(f));
  check(leaked.length === 0, `H: none of them was readable in the preview${leaked.length ? ` — leaked: ${leaked.join(" | ")}` : ""}`);
  const card = page.locator('#docs .doc-card[data-doc="premium"]');
  check(await card.count() === 1 && await page.locator("#docs .tcv-mask").count() === 0, "H: the full CV Premium is shown, nothing masked");
  check(await card.locator('img.pcv-img[src^="data:image/jpeg"]').count() === 1, "H: the paid CV shows the photo kept on this phone");
  check(norm(await card.innerText()).includes(p.quote), "H: the quote typed by the customer is shown after payment");
  await assertNoHorizontalScroll(page, "H resultat");
  await shot("resultat");

  const pdfEvent = page.waitForEvent("download", { timeout: 90_000 });
  await card.locator('[data-act="pdf"]').click();
  const pdf = await saveDownload(await pdfEvent, out);
  const pages = pdfPageCount(pdf.bytes);
  check(pdf.name.endsWith(".pdf") && pdf.name.includes("SOW") && pdf.bytes.subarray(0, 5).toString() === "%PDF-", `H: CV Premium PDF download (${pdf.name})`);
  check(pages >= 1 && pages <= 2, `H: the CV Premium PDF has at most 2 pages (got ${pages})`);

  const wordEvent = page.waitForEvent("download");
  await card.locator('[data-act="word"]').click();
  const word = await saveDownload(await wordEvent, out);
  const wordHtml = word.bytes.toString("utf8");
  check(word.name.endsWith(".doc") && wordHtml.includes("urn:schemas-microsoft-com:office:word") && wordHtml.includes(p.headline), `H: Word file with the headline (${word.name})`);

  const webEvent = page.waitForEvent("download");
  await card.locator('[data-act="html"]').click();
  const web = await saveDownload(await webEvent, out);
  const html = web.bytes.toString("utf8");
  check(web.name.endsWith(".html"), `H: « CV web (.html) » download (${web.name})`);
  check(html.startsWith("<!doctype html") || html.startsWith("<!DOCTYPE html"), "H: the CV web file is a standalone HTML document");
  check(/<meta name="robots" content="noindex/.test(html), "H: the CV web file asks search engines not to index it");
  check(html.includes("data:image/jpeg;base64,") && html.includes(p.quote) && html.includes(p.headline), "H: the CV web file embeds the photo and the full text");
  check(!/<script\b/i.test(html), "H: the CV web file runs no script");
  const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u));
  check(external.length === 0, `H: the CV web file loads nothing from other sites except optional Google Fonts${external.length ? ` — ${external.join(", ")}` : ""}`);
  await context.close();

  // Manual mode: the transfer amount is the 5 000 FCFA price minus a unique offset, recognised by the phone.
  const manual = servers.manual;
  const body = { product: "premium", template: "classique", website: "", data: premiumInput(p) };
  const createdManual = await api(manual, "POST", "/orders", { body });
  check(createdManual.status === 201 && createdManual.body.order.amount === 5000, `H manual: premium order ${createdManual.body.order?.id} created at 5 000 FCFA`);
  const m = createdManual.body.order;
  const ctx2 = await phoneContext(browser, problems, "H manual", { fonts: true });
  const page2 = await ctx2.newPage();
  await page2.goto(`${manual.site}/index.html?o=${m.id}&t=${encodeURIComponent(m.token)}`, { waitUntil: "networkidle" });
  await page2.waitForSelector('[data-view="preview"]:not([hidden])');
  const checkoutRes = page2.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/checkout"));
  await page2.click("#pay-btn");
  const checkout = await (await checkoutRes).json();
  await page2.waitForSelector("#manual-panel:not([hidden])");
  const offset = 5000 - checkout.exactAmount;
  check(checkout.amount === 5000 && offset >= 1 && offset <= 49, `H manual: the customer is asked 5 000 FCFA minus a unique offset (${checkout.exactAmount} FCFA)`);
  check(norm(await page2.locator("#m-amount").innerText()) === fcfa(checkout.exactAmount), `H manual: the panel shows ${fcfa(checkout.exactAmount)}`);
  await shoot(page2, "H-manual-panel", { fullPage: true });
  await ctx2.close();
  const text = `Vous avez reçu ${String(checkout.exactAmount).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}F de Aïssatou Sow (76 234 56 78). Nouveau solde : 125 300F`;
  const notified = await api(manual, "POST", `/payments/notify?k=${DEV_PHONE_HOOK_KEY}`, { body: { title: "Wave", text } });
  check(notified.body.matched === m.id && notified.body.paid === true, "H manual: the phone notification unlocks the premium order");
  const after = await api(manual, "GET", orderRoute(m));
  check(after.body.order.status === "paid" && !!after.body.document.cv.premium, "H manual: the full CV Premium is served");
  return { wave: order, manual: { ...m, paidAmount: checkout.exactAmount } };
}

/** The same senior profile as typed in the wizard, as an OrderInput (for the API-only manual order). */
function premiumInput(p) {
  return {
    identity: { civility: p.civility, firstName: p.firstName, lastName: p.lastName, phone: p.phone, email: p.email, city: p.city, address: p.address },
    target: { jobTitle: p.jobTitle, kind: "emploi", sector: p.sector, level: "senior" },
    education: [p.education],
    experiences: [{ ...p.experience, missions: p.experience.missions.join("\n") }],
    skills: p.skillChips,
    it: ["Excel"],
    languages: [{ name: "Français", level: "Courant" }],
    interests: [],
    premium: {
      headline: p.headline,
      pitch: p.pitch,
      quote: p.quote,
      keyFigures: p.figures.map(([value, label]) => ({ value, label })),
      domains: [{ title: p.domain[0], detail: p.domain[1] }],
      achievements: [{ title: p.achievement[0], detail: p.achievement[1], tags: [p.achievement[2]] }],
      skillLevels: [{ name: p.level[0], level: p.level[1] }],
      qualities: ["Rigueur"],
      accent: "foret",
    },
  };
}
