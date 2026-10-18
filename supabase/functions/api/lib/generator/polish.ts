// Copy-editing of what customers type on a phone, applied once before any phrasing: casing of text typed
// all in lower case or ALL IN CAPITALS, missing accents on common words, brand names, acronyms, degree
// notations ("bac s2 2019"), and lists typed in a single box ("vente, prospection"). Spelling only:
// polishing never adds, removes or reorders a fact. Text typed with deliberate mixed case keeps its case.
import type { Civility, OrderInput } from "../types.ts";
import { capitalize, collapse, genderOf, lowerMonths } from "./text.ts";

// ---------------------------------------------------------------------------
// Dictionaries
// ---------------------------------------------------------------------------

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");

/**
 * Accented spellings restored when a customer typed the word without accents. Only words whose
 * unaccented form is not itself a French word ("marche", "eleve", "cote" are deliberately absent).
 */
// deno-fmt-ignore
const ACCENTED = `
  électricien électricienne électricité électrique électriques électronique électrotechnique électromécanique
  électromécanicien mécanicien mécanicienne mécanique bâtiment bâtiments maçon maçonnerie hôtesse hôtesses hôtel
  hôtels hôtellerie hôtelier hôtelière réceptionniste réception caissière cuisinière pâtissier pâtissière pâtisserie
  ménagère infirmière sécurité sûreté secrétaire secrétariat ingénieur ingénieure génie téléconseiller
  téléconseillère télécommunications télécoms téléphonie téléphone téléphonique développeur développeuse
  développement contrôleur contrôleuse contrôle contrôles gérant gérante commerçant commerçante opérateur
  opératrice employé employée guichetière comptabilité trésorerie trésorier trésorière fiscalité négociation
  négociateur médecin médical médicale médicaux santé hôpital hôpitaux préparateur préparatrice éducateur
  éducatrice éducation élémentaire collège lycée université faculté école écoles études étudiant étudiante
  diplôme diplômes diplômée maîtrise supérieur supérieure spécialité spécialisé spécialisée spécialisation
  expérience expériences compétence compétences qualité qualités réseau réseaux système systèmes données numérique
  dépannage câble câbles câblage véhicule véhicules matériel matériels matériaux béton métallique tôlerie hygiène
  écoute équipe équipes réunion réunions rédaction rédacteur rédactrice événementiel événement événements régional
  régionale général générale générales frères associés société sociétés ministère région département préfecture
  privé privée privés privées coopérative crédit épargne élevage maraîchage théâtre cinéma bénévolat activités
  randonnée découverte français française sénégalais sénégalaise série deuxième troisième quatrième cinquième
  année années débutant débutante déjà très après réalisation réparation réparations réservation réservations opération opérations
  procédure procédures géographie économie économique économiste mathématiques littéraire énergie énergétique
  électrification vidéo vidéos créativité honnêteté ponctualité sérieux sérieuse présentation prévention élèves
  stratégie stratégique médiation métier métiers agréé agréée caméra carrière géomètre dédouanement déclarant
  entrepôt expédition expéditions référent crèche puériculture puéricultrice esthétique esthéticienne couturière
  décoration création édition communauté référencement rôle être méthodique créatif créative réactif réactive
  persévérant persévérante agréable énergique discrète dévoué dévouée accès sénégal thiès guédiawaye kédougou
  sédhiou mbacké kébémer linguère vélingara médina liberté sérère soninké baccalauréat clientèle
`;
const ACCENT_BY_KEY = buildAccentMap(ACCENTED);

/** Folded spelling → accented word; a folded spelling shared by two words would be ambiguous and throws. */
function buildAccentMap(list: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const word of list.split(/\s+/).filter(Boolean)) {
    const key = fold(word);
    if (map.has(key) && map.get(key) !== word) throw new Error(`ambiguous accent entry: ${word} / ${map.get(key)}`);
    map.set(key, word);
  }
  return map;
}

/** Words that are other French words without accents ("cite", "marche") but not inside a proper name. */
const NAME_ACCENTS = new Map([["cite", "cité"], ["marche", "marché"], ["cote", "côte"]]);

/** Place names restored with their capital wherever they appear in free text. */
// deno-fmt-ignore
const PROPER_NOUNS = new Set([
  "sénégal", "dakar", "thiès", "saint-louis", "ziguinchor", "kaolack", "touba", "mbour", "rufisque", "pikine",
  "guédiawaye", "kédougou", "tambacounda", "kolda", "louga", "fatick", "diourbel", "matam", "sédhiou", "kaffrine",
  "afrique", "france",
]);

/** Acronyms restored in capitals when typed in lower case (none of them is also a French word). */
// deno-fmt-ignore
const ACRONYMS = new Set([
  "BTS", "BFEM", "CFEE", "CEPE", "BEP", "BEPC", "DUT", "DEUG", "DESS", "DEA", "MBA", "DSCG", "DESCF", "DECF", "DTS",
  "RH", "DRH", "DAF", "QHSE", "HSE", "SYSCOHADA", "OHADA", "TVA", "UCAD", "UGB", "UASZ", "UADB", "UIDT", "USSEIN",
  "UNCHK", "ISM", "ESP", "ENSA", "ENEA", "CESAG", "ISEG", "IAM", "BEM", "SUPDECO", "ENDSS", "IPG", "ISI", "ESMT",
  "EPT", "CFPT", "CRFPE", "ISEP", "FASTEF", "FASEG", "FLSH", "ESEA", "ENA", "CEM", "ISRA", "ANPEJ", "IPRES", "CSS",
  "SONATEL", "SENELEC", "SDE", "ONAS", "ICS", "SGBS", "CBAO", "BICIS", "BHS", "CNCAS", "LONASE", "AIBD", "APIX",
  "ASER", "ARTP", "CDP", "OMS", "ONG", "PME", "SARL", "SUARL", "BTP", "HLM", "VDN", "TIC", "NTIC", "GPS", "ERP",
  "CRM", "SIG", "QGIS", "SQL", "HTML", "PHP", "SAP", "UNICEF", "USAID", "PNUD", "FAO", "BCEAO", "BOAD", "IFAN",
  "UNESCO", "ASECNA", "CFAO", "CE1", "CE2", "CM1", "CM2", "CP",
]);

/** Brands and tools written with their usual casing ("whatsapp" → "WhatsApp"). */
// deno-fmt-ignore
const BRANDS: Record<string, string> = Object.fromEntries([
  "Word", "Excel", "PowerPoint", "Outlook", "Gmail", "Canva", "Photoshop", "Illustrator", "InDesign",
  "CapCut", "Lightroom", "Odoo", "QuickBooks", "AutoCAD", "ArchiCAD", "Revit", "SketchUp", "WordPress", "Facebook",
  "Instagram", "LinkedIn", "WhatsApp", "TikTok", "Twitter", "YouTube", "Snapchat", "Google", "Windows", "Linux",
  "Ubuntu", "Android", "iOS", "Python", "Java", "JavaScript", "MySQL", "Git", "GitHub", "Cisco", "Oracle", "Senjob",
  "Expat-Dakar", "Wave",
].map((b) => [b.toLocaleLowerCase("fr"), b]));

/** Tool names that are also ordinary words ("sage", "ciel", "site internet"): recognised in the IT list only. */
// deno-fmt-ignore
const IT_ONLY_BRANDS: Record<string, string> = Object.fromEntries([
  "Sage", "Ciel", "Access", "Publisher", "Office", "Zoom", "Teams", "Internet",
].map((b) => [b.toLocaleLowerCase("fr"), b]));

/** Multi-word spellings fixed before word-level corrections (hyphens of compound nouns, names). */
const COMPOUNDS: Array<[RegExp, string]> = [
  [/\baide[\s-]+soignant(e?s?)\b/giu, "aide-soignant$1"],
  [/\bsage[\s-]+femmes?\b/giu, "sage-femme"],
  [/\bchauffeur[\s-]+livreur(s?)\b/giu, "chauffeur-livreur$1"],
  [/\bcroix[\s-]+rouge\b/giu, "Croix-Rouge"],
  [/\bd['’]etat\b/giu, "d'État"],
  [/\bjusqu['’]a\b/giu, "jusqu'à"],
  [/^a\s+l['’]attention\b/iu, "À l'attention"],
  [/\ba\s+l['’]ecoute\b/giu, "à l'écoute"],
  [/\bexpat[\s-]+dakar\b/giu, "Expat-Dakar"],
  [/\bemploi[\s-]+dakar\b/giu, "Emploi Dakar"],
  [/\borange\s+money\b/giu, "Orange Money"],
  [/\bfree\s+money\b/giu, "Free Money"],
  [/\bpower\s*bi\b/giu, "Power BI"],
  [/\bpack\s+office\b/giu, "Pack Office"],
];

// deno-fmt-ignore
const FUNCTION_WORDS = new Set([
  "à", "a", "au", "aux", "d", "de", "des", "du", "en", "et", "l", "la", "le", "les", "ou", "par", "pour", "sur", "un",
  "une", "avec", "dans", "chez",
]);

/** Short capitalised words that are ordinary words, not acronyms, in text typed in capitals. */
// deno-fmt-ignore
const COMMON_SHORT = new Set([
  "bac", "vie", "art", "rue", "lot", "mer", "eau", "air", "bel", "sud", "est", "cap", "bon", "ile", "île", "cité",
  "cite", "sac", "rôle", "son", "ses", "mon", "mes", "ton", "nos", "vos", "leur", "aide", "chef", "agent",
]);

const VOWEL_RE = /[aeiouyàâäéèêëîïôöùûü]/i;

// ---------------------------------------------------------------------------
// Word-level corrections
// ---------------------------------------------------------------------------

/** Applies `fn` to every word of `s` (hyphen and apostrophe parts separately) and keeps the rest intact. */
function mapWords(s: string, fn: (word: string) => string): string {
  return s.replace(/[\p{L}\p{N}]+/gu, (w) => fn(w));
}

/** Same casing pattern as `model` (lower, Capitalised or UPPER) applied to `word`. */
function caseLike(model: string, word: string): string {
  if (model === model.toLocaleLowerCase("fr")) return word;
  if (model.length > 1 && model === model.toLocaleUpperCase("fr")) return word.toLocaleUpperCase("fr");
  return capitalize(word);
}

function hasLower(s: string): boolean {
  return /\p{Ll}/u.test(s);
}
function hasUpper(s: string): boolean {
  return /\p{Lu}/u.test(s);
}

/** Accents, acronyms, brands and place names for one word typed without accents. */
function fixWord(w: string, brands: Record<string, string>): string {
  const lower = w.toLocaleLowerCase("fr");
  const upper = w.toLocaleUpperCase("fr");
  if (brands[lower] && w === lower) return brands[lower];
  if (ACRONYMS.has(upper) && w === lower) return upper;
  const accented = w === lower || w === capitalize(lower) ? ACCENT_BY_KEY.get(fold(w)) : undefined;
  const out = accented ? caseLike(w, accented) : w;
  return PROPER_NOUNS.has(out) ? capitalize(out) : out;
}

/** "3eme", "3ème" → "3e"; "1ere" → "1re". */
function fixOrdinals(s: string): string {
  return s.replace(/\b(\d{1,2})\s?(?:e|è|é)me\b/giu, "$1e").replace(/\b1\s?(?:e|è)re\b/giu, "1re");
}

/** Text typed in capitals: true when it holds at least one capitalised word that is not a known acronym. */
function isShouting(s: string): boolean {
  if (hasLower(s)) return false;
  const words = s.match(/\p{L}+/gu) ?? [];
  return words.some((w) => w.length >= 4 && !ACRONYMS.has(w) && VOWEL_RE.test(w));
}

/** A capitalised word that should stay in capitals inside text typed in capitals. */
function keepsCapitals(w: string): boolean {
  const lower = w.toLocaleLowerCase("fr");
  if (/\d/.test(w)) return true; // "S2", "U15", "CM2"
  if (ACRONYMS.has(w)) return true;
  if (FUNCTION_WORDS.has(lower) || COMMON_SHORT.has(lower) || ACCENT_BY_KEY.has(fold(w))) return false;
  return w.length <= 3 || !VOWEL_RE.test(w);
}

/** "SECRETAIRE DE DIRECTION" → "secretaire de direction"; acronyms ("BTS", "RH", "HLM") stay. */
function lowerShouting(s: string): string {
  return mapWords(s, (w) => (keepsCapitals(w) ? w : w.toLocaleLowerCase("fr")));
}

function applyCompounds(s: string): string {
  return COMPOUNDS.reduce((t, [re, to]) => t.replace(re, to), s);
}

/**
 * A common phrase (job title, degree, skill, mission, interest, quality, motivation): capitals typed by
 * accident are lowered, then accents, acronyms and brands are restored word by word.
 */
export function polishPhrase(raw: string, brands: Record<string, string> = BRANDS): string {
  let t = collapse(raw);
  if (!t) return t;
  if (isShouting(t)) t = lowerShouting(t);
  t = applyCompounds(t);
  t = mapWords(t, (w) => fixWord(w, brands));
  return fixOrdinals(t);
}

/** Multi-line text (missions): each line polished on its own, line breaks kept. */
function polishLines(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return raw.split("\n").map((line) => polishPhrase(line)).join("\n");
}

/** Generic employers typed as common nouns ("chantier privé", "particulier"): never a company name. */
const GENERIC_EMPLOYER_RE =
  /^(?:chez\s+)?(?:un\s+|une\s+|des\s+)?(?:particuliers?|familles?|domicile|freelance|free-lance|ind[ée]pendante?|[àa]\s+mon\s+compte|auto-entrepreneur|projet\s+personnel|chantiers?|divers|diverses|plusieurs\s+\p{L}+|boutique|commerce|atelier|march[ée])(?:\s+\p{Ll}[\p{Ll}'’-]*)*$/iu;

/** True for an employer typed as a common noun phrase ("Chantier privé", "particulier", "freelance"). */
export function isGenericEmployer(company: string): boolean {
  const t = collapse(company);
  if (!GENERIC_EMPLOYER_RE.test(t)) return false;
  // Every word after the first is lower case: "Atelier Couture Ndiaye" is a real business name.
  return t.split(" ").slice(1).every((w) => !hasUpper(w));
}

const polishPlace = (raw: string) => polishName(raw, { place: true });

/**
 * A proper name (company, school, city, address): typed all in lower case or all in capitals, it is
 * Title-Cased with function words in lower case and acronyms in capitals ("port autonome de dakar" →
 * "Port Autonome de Dakar", "HLM GRAND YOFF" → "HLM Grand Yoff"). A single word in capitals ("SODAGRI")
 * is taken for an acronym. Names typed with mixed case only get their missing accents.
 */
export function polishName(raw: string, opts: { place?: boolean } = {}): string {
  const t = applyCompounds(collapse(raw));
  if (!t) return t;
  const lowerOnly = !hasUpper(t);
  // One word in capitals is an acronym for a company ("SODAGRI") but a name for a place ("DAKAR").
  const shouting = !hasLower(t) && (/\s/.test(t) || opts.place === true) && isShouting(t);
  if (lowerOnly && isGenericEmployer(t)) return capitalize(polishPhrase(t));
  if (!lowerOnly && !shouting) return mapWords(t, (w) => fixWord(w, BRANDS));
  return t.replace(/[\p{L}\p{N}]+/gu, (w, offset: number) => {
    const lower = w.toLocaleLowerCase("fr");
    const before = t.slice(0, offset);
    const atStart = before.trim() === "";
    const elided = /^[ld]$/.test(lower) && /^['’]/.test(t.slice(offset + w.length));
    if (shouting ? keepsCapitals(w) : ACRONYMS.has(w.toLocaleUpperCase("fr"))) return w.toLocaleUpperCase("fr");
    if (lowerOnly && !VOWEL_RE.test(w) && /^\p{L}{2,5}$/u.test(w)) return w.toLocaleUpperCase("fr"); // "sgs"
    if (!atStart && (elided || (FUNCTION_WORDS.has(lower) && !/-$/.test(before)))) return lower;
    const key = fold(w);
    return capitalize(ACCENT_BY_KEY.get(key) ?? NAME_ACCENTS.get(key) ?? lower);
  });
}

/** "monsieur le directeur general" → "Monsieur le Directeur général"; "a l'attention du drh" → "À l'attention du DRH". */
export function polishRecipient(raw: string): string {
  const t = collapse(raw);
  if (!t || (hasUpper(t) && hasLower(t))) return polishPhrase(t);
  const lowered = polishPhrase(t.toLocaleLowerCase("fr"));
  return capitalize(lowered).replace(
    /^(Monsieur le|Madame la|Monsieur|Madame)\s+(\p{L})/u,
    (_m, head: string, ch: string) => `${head} ${ch.toLocaleUpperCase("fr")}`,
  );
}

/** "Chargé de clientèle" agreed with the civility when the title opens with "charge(e) de". */
function agreeChargeDe(title: string, civility: Civility): string {
  const g = genderOf(civility);
  return title.replace(
    /^(c)harg(?:é|e)e?(?=\s+(?:de|d['’]|du|des)\b)/iu,
    (_m, c: string) => `${c}${g("hargé", "hargée")}`,
  );
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/** Splits a list item typed with commas or semicolons ("vente, prospection") outside brackets. */
function splitTypedList(items: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    let depth = 0;
    let current = "";
    for (let i = 0; i < item.length; i++) {
      const ch = item[i];
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      const isComma = ch === "," && !(/\d/.test(item[i - 1] ?? "") && /\d/.test(item[i + 1] ?? ""));
      if (depth === 0 && (ch === ";" || isComma)) {
        out.push(current);
        current = "";
      } else current += ch;
    }
    out.push(current);
  }
  return out.map(collapse).filter(Boolean);
}

const YEAR_SPAN = String.raw`(?:19|20)\d{2}(?:\s*[-–/]\s*(?:19|20)\d{2})?`;
const TRAILING_YEAR_RE = new RegExp(
  String.raw`^(.*?\p{L}.*?)[\s,–—-]*(?:\(\s*)?(?:(?:obtenue?\s+)?en\s+)?(${YEAR_SPAN})\s*\)?$`,
  "iu",
);

/** "bac s2" → "bac S2", "permis b" → "permis B", "cap cuisine" → "CAP cuisine", "BAC" → "bac". */
function polishDegreeName(raw: string): string {
  return polishPhrase(raw)
    .replace(/^cap\b/iu, "CAP")
    .replace(/\bBAC\b/gu, "bac")
    .replace(
      /\b(bac(?:calaur[ée]at)?|série|serie)(\s+)(s[1-6]|l['’]?\d?|g|t\d?|f\d?|e|m)\b/giu,
      (_m, word: string, sp: string, serie: string) => `${word}${sp}${serie.toLocaleUpperCase("fr")}`,
    )
    .replace(/\bserie\b/giu, (m) => caseLike(m, "série"))
    .replace(
      /\b(permis)(\s+)([a-e]\d?)\b/giu,
      (_m, word: string, sp: string, cat: string) => `${word}${sp}${cat.toUpperCase()}`,
    );
}

function polishEducation(e: OrderInput["education"][number]): OrderInput["education"][number] {
  let degree = collapse(e.degree ?? "");
  let year = e.year === undefined ? undefined : lowerMonths(collapse(e.year));
  // A year typed in the degree box ("bac s2 2019") belongs in the year column.
  const m = year ? null : TRAILING_YEAR_RE.exec(degree);
  if (m && /\p{L}{2,}/u.test(m[1])) {
    degree = m[1];
    year = m[2].replace(/\s+/g, "");
  }
  return compactObj({
    degree: polishDegreeName(degree) || e.degree,
    school: e.school === undefined ? undefined : polishName(e.school),
    year,
    detail: e.detail === undefined ? undefined : polishPhrase(e.detail),
  });
}

function polishIt(items: string[]): string[] {
  const brands = { ...BRANDS, ...IT_ONLY_BRANDS };
  return splitTypedList(items).map((tool) => capitalize(polishPhrase(tool, brands)));
}

/** Language names typed in lower case or capitals: "francais" → "Français", "WOLOF" → "Wolof". */
function polishLanguage(name: string): string {
  const t = collapse(name);
  const raw = !hasUpper(t) || !hasLower(t);
  return capitalize(polishPhrase(raw ? t.toLocaleLowerCase("fr") : t));
}

/** Customer free text: also lifts informal "je veux" to the register of a cover letter. */
function polishMotivation(raw: string): string {
  return polishLines(raw)!
    .replace(/\b(j|J)e veux\b/gu, "$1e souhaite")
    .replace(/\b(j|J)e voudrais\b/gu, "$1e souhaiterais")
    .replace(/\b(j|J)['’]ai envie de\b/gu, "$1e souhaite")
    .replace(/\b(j|J)['’]ai envie d['’]/gu, "$1e souhaite ");
}

function compactObj<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

const opt = <T>(v: string | undefined, fn: (s: string) => T): T | undefined => (v === undefined ? undefined : fn(v));

/** The customer's input, copy-edited (see module comment). Pure: the argument is not modified. */
export function polishInput(input: OrderInput): OrderInput {
  const civility = input.identity.civility;
  const title = (s: string) => agreeChargeDe(polishPhrase(s), civility);
  return {
    identity: compactObj({
      ...input.identity,
      city: polishPlace(input.identity.city),
      address: opt(input.identity.address, polishPlace),
    }),
    target: { ...input.target, jobTitle: title(input.target.jobTitle) },
    education: input.education.map(polishEducation),
    experiences: input.experiences.map((e) =>
      compactObj({
        title: title(e.title),
        company: opt(e.company, polishName),
        place: opt(e.place, polishPlace),
        start: e.start,
        end: e.end,
        missions: polishLines(e.missions),
      })
    ),
    skills: splitTypedList(input.skills).map((s) => polishPhrase(s)),
    it: polishIt(input.it),
    languages: input.languages.map((l) => ({ ...l, name: polishLanguage(l.name) })),
    interests: input.interests.map((i) => polishPhrase(i)),
    letter: input.letter && compactObj({
      company: polishName(input.letter.company),
      recipient: opt(input.letter.recipient, polishRecipient),
      companyCity: opt(input.letter.companyCity, polishPlace),
      source: opt(input.letter.source, (s) => polishPhrase(s)),
      qualities: (input.letter.qualities ?? []).map((q) => polishPhrase(q)),
      motivation: opt(input.letter.motivation, polishMotivation),
    }),
  };
}
