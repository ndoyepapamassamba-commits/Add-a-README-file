// Teranga Pro course catalogue and constants (SPEC_COURSE §1). Re-exported by course.ts; kept in a leaf module so
// course_files.ts and the stores can import them without pulling the HTTP handlers.
import type { CourseProduct, ReservedCourseProduct } from "./types.ts";
export { COURSE_PRODUCTS } from "./pricing.ts";

export const RESERVED_COURSE_PRODUCTS: readonly ReservedCourseProduct[] = ["pq_complet", "imf_kit"];
/** Every course id the database knows (sold or reserved): their paid orders follow the course retention. */
export const ALL_COURSE_IDS: readonly string[] = ["pq_essentiel", ...RESERVED_COURSE_PRODUCTS];

export const COURSE_CATALOG: Record<CourseProduct, {
  title: string;
  subtitle: string;
  edition: string;
  label: string;
  assetPrefix: string;
}> = {
  pq_essentiel: {
    title: "Power Query pour le reporting bancaire",
    subtitle: "Automatisez vos états mensuels sous Excel — édition UEMOA",
    edition: "Essentiel",
    label: "Formation «\u00a0Power Query pour le reporting bancaire\u00a0» — édition Essentiel",
    assetPrefix: "pq_essentiel/",
  },
};

export const COURSE_CGV_VERSION = "2026-10-21";
/** Paid course orders stay readable 24 months after payment (SQL: interval '730 days'). */
export const COURSE_RETENTION_DAYS = 730;
/** Lead contact fields are erased 12 months after sign-up (SQL: interval '365 days'). */
export const LEAD_RETENTION_DAYS = 365;
export const QUIZ_PASS_PERCENT = 70;
/** Per order, rate-limit window 86 400 s. */
export const QUIZ_ATTEMPTS_PER_DAY = 10;
/** Per order, rate-limit window 86 400 s. */
export const DOWNLOADS_PER_DAY = 30;
export const LEADS_PER_HOUR_PER_IP = 5;
export const LEADS_PER_DAY_GLOBAL = 2000;
export const ATTESTATION_LOOKUPS_PER_HOUR_PER_IP = 60;
export const RECEIPT_SELLER_TEXT = "Vendeur\u00a0: particulier — reçu de paiement, pas une facture";
export const ATTESTATION_KIND = "Attestation de suivi — non diplômante";
export const LEAD_CONSENT_TEXT =
  "J'accepte d'être prévenu(e) par e-mail ou WhatsApp de l'ouverture de la formation et de la publication de " +
  "nouveaux contenus gratuits. Mes coordonnées ne servent qu'à cela, ne sont jamais revendues et sont effacées au " +
  "plus tard 12 mois après mon inscription.";
// The front pages show LEAD_CONSENT_TEXT verbatim next to the checkbox: one line of the HTML source, straight
// apostrophes, no entity, no line break inside (a test greps formation/index.html and gratuit.html for it).
export const LICENCE_PLACEHOLDER = "{{LICENCE}}";

export function licenceLine(fullName: string, orderId: string): string {
  return `Licence personnelle — ${fullName} — ${orderId}`; // em dashes U+2014, plain spaces
}
