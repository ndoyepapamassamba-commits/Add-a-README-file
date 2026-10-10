/**
 * Which table of a workbook is THE data: a summary sheet (blocks side by side, TOTAL rows) is not.
 * Pure — used by the design reproduction, the 3D board and the house charts.
 */

/** A total / sub-total line (its own label says so) — never summed with the detail rows. */
const TOTAL = /^(sous[- ]?(total|totaux)\b.*|total( g[ée]n[ée]ral| global)?|grand[- ]total|totaux|ensemble|total\s*:)$/i;
/** Starts like a total (« TOTAL / MOYENNE », « Total (610 lignes) », « Sous-total top 10 »). */
const TOTAL_START = /^(sous[- ]?total|grand[- ]total|totaux|total)\b/i;
/** What may follow « TOTAL » on a total line — never a company name (« TOTAL SENEGAL SA » is a client). */
const TOTAL_WORDS = /\b(moyennes?|g[ée]n[ée]ral|globale?|portefeuille|lignes?|top|clients?|contrats?|encours|douteux|provisions?|xof|fcfa|eur|usd|des|du|de|la|le|les|et|ensemble|cumul[ée]?s?|annuel|mensuel|mois|ann[ée]es?|p[ée]riode|g[ée]n[ée]rale|feuille|tableau)\b/gi;
export function isTotalRow(r: Record<string, unknown>): boolean {
  const texts = Object.values(r).filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  if (texts.slice(0, 3).some((v) => TOTAL.test(v.trim()))) return true;
  // « TOTAL / MOYENNE », « Total (610 lignes) »: only total vocabulary after the keyword, and no other label on the row
  // (« 607 / 610 » is a figure, not a label).
  const labels = texts.filter((v) => /\p{L}{2,}/u.test(v));
  if (labels.length > 2) return false;
  return labels.some((v) => {
    const m = TOTAL_START.exec(v.trim());
    return !!m && !/\p{L}{2,}/u.test(v.trim().slice(m[0].length).replace(TOTAL_WORDS, ''));
  });
}
export const withoutTotals = <T extends Record<string, unknown>>(rows: T[]): T[] => rows.filter((r) => !isTotalRow(r));

export interface SheetTable {
  sheet: string;
  columns: string[];
  rows: Record<string, unknown>[];
}
/**
 * Detail-table score: many rows, real headers (no « col_3 », no « Douteux_2 » from blocks placed side by side), few
 * empty cells; a sheet NAMED like a summary (dashboard, synthèse, sommaire, analyse, contrôle) is ranked after.
 */
export function tableScore(t: SheetTable): number {
  const rows = withoutTotals(t.rows);
  if (!rows.length || t.columns.length < 2) return 0;
  const generated = t.columns.filter((c) => /^col_\d+$/i.test(c) || /_\d+$/.test(c)).length / t.columns.length;
  const sample = rows.slice(0, 200);
  const filled = sample.reduce((n, r) => n + t.columns.filter((c) => r[c] !== null && r[c] !== undefined && r[c] !== '').length, 0) / Math.max(1, sample.length * t.columns.length);
  const summaryName = /dashboard|tableau de bord|synth|sommaire|r[ée]sum|summary|analyse|contr[oô]le|m[ée]thodo|param|lisez|readme|sources?/i.test(t.sheet) ? 0.35 : 1;
  return rows.length * (1 - generated) ** 2 * (0.3 + 0.7 * filled) * summaryName;
}
export function pickTable(tables: SheetTable[]): SheetTable | null {
  let best: SheetTable | null = null;
  let score = 0;
  for (const t of tables) {
    const s = tableScore(t);
    if (s > score) {
      score = s;
      best = t;
    }
  }
  return best ? { ...best, rows: withoutTotals(best.rows) } : null;
}

/** Amount-like column names (money first). */
export const MONEY = /montant|solde|encours|total|chiffre|\bca\b|valeur|prix|xof|fcfa|eur|usd|amount|revenue|sales|ventes?|co[uû]t|budget|limite|impay|cr[ée]ance|marge|profit|provision|dotation|douteux|d[ée]pr[ée]ciation|exposition|perte|ecl|capital|int[ée]r[eê]t|garantie|besoin|compl[ée]ment/i;
/** Never a measure: codes, ranks, periods, stages. */
const NOT_MEASURE = /^(id|n°|no\b|num|code|stade|stage|ann[ée]e|year|mois|month|rang|rank|t[ée]l|phone|classe|segment)/i;
/** Identifier names: summed only if the name ALSO says it is an amount (« Montant client » is, « RELATED CUSTOMER » is not). */
const ID_NAME = /customer|client|compte|account|contrat|contract|r[ée]f[ée]rence|\bref\b|matricule|num[ée]ro|identifiant|\bid\b|code|siren|siret|ninea|gestionnaire|officer/i;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** The numeric columns that are real measures, money first, then by total size. */
export function rankMeasures(numCols: string[], rows: Record<string, unknown>[]): string[] {
  const sum = (c: string) => rows.reduce((a, r) => a + (isNumber(r[c]) ? Math.abs(r[c] as number) : 0), 0);
  const sums = new Map(numCols.map((c) => [c, sum(c)]));
  return numCols
    .filter((c) => !NOT_MEASURE.test(c.trim()) && !(ID_NAME.test(c) && !MONEY.test(c)))
    .sort((a, b) => (MONEY.test(b) ? 1 : 0) - (MONEY.test(a) ? 1 : 0) || sums.get(b)! - sums.get(a)!);
}
