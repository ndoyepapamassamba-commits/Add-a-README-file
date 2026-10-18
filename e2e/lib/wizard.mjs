// Fills the index.html order wizard the way a customer does on a phone: taps, chips, typed text.

export const PERSONA = {
  civility: "Mme",
  firstName: "Ndèye Fatou",
  lastName: "Diop",
  fullName: "Ndèye Fatou DIOP",
  fileBase: "Ndeye-Fatou-DIOP",
  phone: "77 123 45 67",
  email: "ndeye.diop@gmail.com",
  city: "Dakar",
  address: "Sicap Liberté 6",
  jobTitle: "Assistante comptable",
  sector: "comptabilite",
  level: "junior",
  education: { degree: "Licence professionnelle en comptabilité", school: "Université Cheikh Anta Diop", year: "2023" },
  experience: {
    title: "Assistante comptable",
    company: "Cabinet Diallo & Associés",
    place: "Dakar",
    start: "2023",
    missions: [
      "Saisie des pièces comptables et des factures fournisseurs",
      "Préparation des rapprochements bancaires mensuels",
      "Suivi des déclarations de TVA",
    ],
  },
  skillChips: ["Saisie comptable", "SYSCOHADA", "Facturation", "Rapprochement bancaire"],
  typedSkill: "Gestion des immobilisations",
  itChips: ["Word", "Excel"],
  interestChips: ["Lecture", "Bénévolat"],
  letter: {
    company: "Sonatel",
    companyCity: "Dakar",
    source: "Emploi Dakar",
    qualities: ["Rigueur", "Esprit d'équipe"],
    motivation: "Je souhaite rejoindre une entreprise qui accompagne la transformation numérique du Sénégal.",
  },
};

export const stepSelector = (step) => `#wizard .step[data-step="${step}"]:not([hidden])`;

export async function next(page, step) {
  await page.click("#wz-next");
  await page.waitForSelector(stepSelector(step));
}

const exactly = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

// Matched on text content: a pressed chip's CSS "✓" (::before) becomes part of its accessible name.
export async function tapChips(page, groupSelector, labels) {
  for (const name of labels) {
    const chip = page.locator(`${groupSelector} button.chip`).filter({ hasText: exactly(name) });
    await chip.click();
    if ((await chip.getAttribute("aria-pressed")) !== "true") throw new Error(`chip "${name}" did not toggle on`);
  }
}

/**
 * Opens the site, fills every step for `product` and submits. Resolves with the POST /orders response body
 * ({ order: { …, token }, preview }) once the preview screen is shown. `shot(name)` takes step screenshots.
 */
export async function fillWizard(page, site, product, shot, p = PERSONA) {
  await page.goto(`${site}/index.html`, { waitUntil: "networkidle" });
  if (product === "pack") {
    await page.click(".hero-cta [data-start]");
    await page.waitForSelector(stepSelector("offre"));
    await page.click('label:has(input[name="product"][value="pack"])');
    await next(page, "identite");
  } else {
    await page.click(`#offres [data-start="${product}"]`);
    await page.waitForSelector(stepSelector("identite"));
  }

  await page.click(`label:has(input[name="identity.civility"][value="${p.civility}"])`);
  await page.fill("#f-firstName", p.firstName);
  await page.fill("#f-lastName", p.lastName);
  await page.fill("#f-phone", p.phone);
  await page.fill("#f-email", p.email);
  await page.fill("#f-city", p.city);
  await page.fill("#f-address", p.address);
  await shot("wizard-identite");
  await next(page, "objectif");

  await page.fill("#f-jobTitle", p.jobTitle);
  await page.click('#kind-options label:has(input[value="emploi"])');
  await page.selectOption("#f-sector", p.sector);
  await page.selectOption("#f-level", p.level);
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
  await shot("wizard-experiences");
  await next(page, "competences");

  await tapChips(page, "#chips-skills", p.skillChips);
  await page.fill("#add-skill", p.typedSkill);
  await page.click('[data-add-for="add-skill"]');
  await tapChips(page, "#chips-it", p.itChips);
  await shot("wizard-competences");

  if (product !== "lettre") {
    await next(page, "langues");
    await page.selectOption("#f-lang-level-2", "Intermédiaire");
    await tapChips(page, "#chips-interests", p.interestChips);
  }
  if (product !== "cv") {
    await next(page, "lettre");
    await page.fill("#f-company", p.letter.company);
    await page.fill("#f-companyCity", p.letter.companyCity);
    await page.fill("#f-source", p.letter.source);
    await tapChips(page, "#chips-qualities", p.letter.qualities);
    await page.fill("#f-motivation", p.letter.motivation);
    await shot("wizard-lettre");
  }

  const label = await page.locator("#wz-next .btn-label").innerText();
  if (label !== "Voir mon aperçu gratuit") throw new Error(`last step button reads "${label}"`);
  const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/orders");
  await page.click("#wz-next");
  const res = await created;
  if (res.status() !== 201) throw new Error(`POST /orders answered ${res.status()}: ${await res.text()}`);
  await page.waitForSelector('[data-view="preview"]:not([hidden])');
  return res.json();
}
