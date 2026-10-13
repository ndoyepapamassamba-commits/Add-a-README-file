// ANALYSE POUSSÉE ET RAPIDE — LE BRIEF. Everything an analyst would compute before writing, computed locally (no model,
// 0 $, exact, a second): the main measure and what explains it, the top categories and the concentration of every
// useful dimension, the trend by period, the distribution bands, the anomalies and the data quality — each fact with
// its method. The narrative (findings, analysis, recommendations) is then written by the model FROM THE BRIEF ONLY;
// checkNarrative() lists every number of a narrative that is not in the brief (a figure to verify, never to keep as is).
// Pure: no DOM, no network, no store.
import { eta2, human, isRate, profileColumns } from './dashInsight';
import { toDate, toNumber, type Cell } from './dataCore';

export interface Fact {
  id: string;
  label: string;
  value: number;
  fmt: 'int' | 'num' | 'pct' | 'money';
  /** How the figure was computed (shown to the reader, never a guess). */
  method: string;
}
export interface DimTop {
  key: string;
  sum: number;
  count: number;
  share: number;
}
export interface DimFact {
  dim: string;
  label: string;
  categories: number;
  top: DimTop[];
  /** Share of the measure carried by the first 3 categories. */
  top3Share: number;
  /** Herfindahl index of the shares (1 = one category carries everything). */
  hhi: number;
  /** Categories needed to reach 50 % and 80 % of the measure. */
  n50: number;
  n80: number;
  /** Share of the measure's variance this dimension explains (η²). */
  eta2: number;
}
export interface TrendPoint {
  period: string;
  sum: number;
  count: number;
}
export interface TrendFact {
  col: string;
  label: string;
  by: 'month' | 'year';
  points: TrendPoint[];
  last: string;
  /** Last period vs the previous one, relative (null with one period). */
  delta: number | null;
  best: string;
  worst: string;
}
export interface Band {
  label: string;
  from: number;
  to: number;
  count: number;
  sum: number;
  share: number;
}
export interface QualityRow {
  col: string;
  type: 'nombre' | 'date' | 'texte' | 'vide';
  missingPct: number;
  distinct: number;
}
export interface RateFact {
  col: string;
  label: string;
  mean: number;
  min: number;
  max: number;
  /** Values outside 0..1 (or 0..100 when the column is written in percent points). */
  outOfRange: number;
}
export interface Brief {
  title: string;
  source: string;
  rows: number;
  columns: number;
  measure: string | null;
  measureLabel: string;
  entity: string | null;
  kpis: Fact[];
  dims: DimFact[];
  trend: TrendFact | null;
  bands: Band[];
  rates: RateFact[];
  anomalies: string[];
  quality: QualityRow[];
  /** Every number the brief states (for the narrative check). */
  numbers: number[];
}

type Row = Record<string, unknown>;
const ID_NAME = /\bid\b|identifiant|customer\s*(n|id)|client\s*(n|id|code)|compte|account|contrat|contract|r[ée]f[ée]rence|\bref\b|matricule|num[ée]ro|\bn°|code|isin|iban|swift/i;
const MONEY_NAME = /montant|amount|encours|outstanding|solde|balance|total|ca\b|chiffre|revenue|ventes|sales|provision|impay|pdo|ecl|exposure|exposition|cr[ée]ance|valeur|value|prix|price|co[uû]t|cost|xof|eur|usd/i;
const ENTITY_NAME = /client|customer|nom\b|name|relation|d[ée]biteur|tiers|soci[ée]t[ée]|raison sociale|contrepartie|counterparty|fournisseur|supplier|libell/i;
const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '';
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function numericShare(rows: Row[], col: string): { share: number; values: number[] } {
  const values: number[] = [];
  let n = 0;
  for (const r of rows) {
    const v = r[col];
    if (!filled(v)) continue;
    n++;
    const x = toNumber(v as Cell);
    if (x !== null && Number.isFinite(x)) values.push(x);
  }
  return { share: n ? values.length / n : 0, values };
}
function dateShare(rows: Row[], col: string): number {
  let n = 0;
  let d = 0;
  for (const r of rows) {
    const v = r[col];
    if (!filled(v)) continue;
    n++;
    if (typeof v === 'number' && Math.abs(v) < 20000) continue; // small numbers are not Excel dates
    if (toDate(v as Cell)) d++;
  }
  return n ? d / n : 0;
}
const quantile = (sorted: number[], q: number): number => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
};

/** Builds the brief of a table: the facts and their methods. `measure` / `dims` override the automatic choice. */
export function buildBrief(columns: string[], rows: Row[], o: { title?: string; source?: string; measure?: string; dims?: string[]; top?: number } = {}): Brief {
  const top = Math.max(3, Math.min(15, o.top ?? 8));
  const numbers = new Set<number>();
  const note = (v: number) => {
    if (Number.isFinite(v)) numbers.add(v);
    return v;
  };
  // 1. Columns by nature.
  const numCols: { col: string; values: number[] }[] = [];
  const dateCols: string[] = [];
  const textCols: string[] = [];
  const quality: QualityRow[] = [];
  for (const col of columns) {
    const miss = rows.filter((r) => !filled(r[col])).length;
    const distinct = new Set(rows.filter((r) => filled(r[col])).map((r) => String(r[col]).trim())).size;
    const ns = numericShare(rows, col);
    const ds = dateShare(rows, col);
    let type: QualityRow['type'] = 'texte';
    if (miss === rows.length) type = 'vide';
    else if (ds >= 0.6 && !/^\d+$/.test(String(rows.find((r) => filled(r[col]))?.[col] ?? ''))) type = 'date';
    else if (ns.share >= 0.8) type = 'nombre';
    quality.push({ col, type, missingPct: rows.length ? r4(miss / rows.length) : 0, distinct });
    if (type === 'date') dateCols.push(col);
    else if (type === 'nombre' && !ID_NAME.test(col) && distinct > 1) numCols.push({ col, values: ns.values });
    else if (type === 'texte') textCols.push(col);
  }
  // 2. The main measure: asked, else the money-like column with the largest total, else the largest total.
  const rateCols = numCols.filter((c) => isRate(c.col) || (c.values.every((v) => v >= 0 && v <= 1) && /%|taux|rate|ratio|part|share/i.test(c.col)));
  const measures = numCols.filter((c) => !rateCols.includes(c));
  const asked = o.measure ? measures.find((c) => c.col.toLowerCase() === o.measure!.toLowerCase()) : undefined;
  const main =
    asked ??
    [...measures].sort((a, b) => {
      const sa = Math.abs(a.values.reduce((x, y) => x + y, 0)) * (MONEY_NAME.test(a.col) ? 4 : 1);
      const sb = Math.abs(b.values.reduce((x, y) => x + y, 0)) * (MONEY_NAME.test(b.col) ? 4 : 1);
      return sb - sa;
    })[0];
  const measure = main?.col ?? null;
  const measureLabel = measure ? human(measure, 40) : 'lignes';
  const entity = textCols.find((c) => ENTITY_NAME.test(c)) ?? null;
  const kpis: Fact[] = [];
  const rowsN = note(rows.length);
  kpis.push({ id: 'rows', label: 'Lignes', value: rowsN, fmt: 'int', method: 'nombre de lignes du tableau' });
  if (entity) {
    const d = new Set(rows.filter((r) => filled(r[entity])).map((r) => String(r[entity]).trim())).size;
    kpis.push({ id: 'entities', label: `${human(entity)} distincts`, value: note(d), fmt: 'int', method: `valeurs distinctes de « ${entity} »` });
  }
  let sorted: number[] = [];
  if (main) {
    sorted = [...main.values].sort((a, b) => a - b);
    const sum = main.values.reduce((a, b) => a + b, 0);
    const mean = main.values.length ? sum / main.values.length : 0;
    const median = quantile(sorted, 0.5);
    kpis.push({ id: 'total', label: `Total ${measureLabel}`, value: note(r2(sum)), fmt: MONEY_NAME.test(measure!) ? 'money' : 'num', method: `SOMME(${measure}) sur ${main.values.length} valeurs` });
    kpis.push({ id: 'mean', label: `Moyenne ${measureLabel}`, value: note(r2(mean)), fmt: 'num', method: `MOYENNE(${measure})` });
    kpis.push({ id: 'median', label: `Médiane ${measureLabel}`, value: note(r2(median)), fmt: 'num', method: `MÉDIANE(${measure})` });
    const maxRow = rows.reduce<Row | null>((best, r) => {
      const v = toNumber(r[measure!] as Cell);
      return v !== null && (best === null || v > (toNumber(best[measure!] as Cell) ?? -Infinity)) ? r : best;
    }, null);
    kpis.push({ id: 'max', label: `Maximum ${measureLabel}${entity && maxRow ? ` (${String(maxRow[entity]).slice(0, 40)})` : ''}`, value: note(r2(sorted[sorted.length - 1] ?? 0)), fmt: 'num', method: `MAX(${measure})` });
    kpis.push({ id: 'min', label: `Minimum ${measureLabel}`, value: note(r2(sorted[0] ?? 0)), fmt: 'num', method: `MIN(${measure})` });
    const miss = rows.length - main.values.length;
    if (miss) kpis.push({ id: 'missing', label: `${measureLabel} manquant`, value: note(r4(miss / rows.length)), fmt: 'pct', method: `${miss} ligne(s) sans valeur / ${rows.length}` });
  }
  // 3. Dimensions: the ones that explain the measure (η²), balanced, readable — or the ones asked.
  const profiles = profileColumns(rows, textCols, measure);
  const chosen = o.dims?.length ? o.dims.filter((d) => textCols.includes(d)) : profiles.filter((p) => p.score >= 0.1 && p.distinct >= 2 && p.distinct <= 60 && !ENTITY_NAME.test(p.col)).slice(0, 4).map((p) => p.col);
  const dims: DimFact[] = [];
  const total = main ? main.values.reduce((a, b) => a + b, 0) : rows.length;
  for (const dim of [...chosen, ...(entity && !chosen.includes(entity) ? [entity] : [])]) {
    const g = new Map<string, { sum: number; count: number }>();
    for (const r of rows) {
      if (!filled(r[dim])) continue;
      const k = String(r[dim]).trim();
      const v = main ? toNumber(r[measure!] as Cell) : 1;
      const cur = g.get(k) ?? { sum: 0, count: 0 };
      cur.count++;
      cur.sum += v ?? 0;
      g.set(k, cur);
    }
    const all = [...g.entries()].map(([key, x]) => ({ key, sum: r2(x.sum), count: x.count, share: total ? r4(x.sum / total) : 0 })).sort((a, b) => b.sum - a.sum);
    if (all.length < 2) continue;
    const shares = all.map((x) => (total ? x.sum / total : 0));
    const hhi = r4(shares.reduce((a, s) => a + s * s, 0));
    let acc = 0;
    let n50 = 0;
    let n80 = 0;
    for (const s of shares) {
      acc += s;
      if (!n50 && acc >= 0.5) n50 = shares.indexOf(s) + 1;
      if (!n80 && acc >= 0.8) {
        n80 = shares.indexOf(s) + 1;
        break;
      }
    }
    const top3 = r4(shares.slice(0, 3).reduce((a, b) => a + b, 0));
    const d: DimFact = { dim, label: human(dim), categories: note(all.length), top: all.slice(0, dim === entity ? Math.max(top, 10) : top), top3Share: note(top3), hhi: note(hhi), n50: note(n50 || all.length), n80: note(n80 || all.length), eta2: r4(eta2(rows, dim, measure)) };
    for (const t of d.top) {
      note(t.sum);
      note(t.count);
      note(t.share);
    }
    dims.push(d);
  }
  // 4. Trend by month (or by year when the range is long) on the first date column.
  let trend: TrendFact | null = null;
  const dcol = dateCols[0];
  if (dcol) {
    const pts = new Map<string, { sum: number; count: number }>();
    const months = new Set<string>();
    for (const r of rows) {
      const d = toDate(r[dcol] as Cell);
      if (!d) continue;
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const by: 'month' | 'year' = months.size > 36 ? 'year' : 'month';
    for (const r of rows) {
      const d = toDate(r[dcol] as Cell);
      if (!d) continue;
      const k = by === 'year' ? String(d.getFullYear()) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const v = main ? (toNumber(r[measure!] as Cell) ?? 0) : 1;
      const cur = pts.get(k) ?? { sum: 0, count: 0 };
      cur.sum += v;
      cur.count++;
      pts.set(k, cur);
    }
    const points = [...pts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([period, x]) => ({ period, sum: note(r2(x.sum)), count: note(x.count) }));
    if (points.length >= 2) {
      const last = points[points.length - 1]!;
      const prev = points[points.length - 2]!;
      const delta = prev.sum ? note(r4((last.sum - prev.sum) / Math.abs(prev.sum))) : null;
      const best = [...points].sort((a, b) => b.sum - a.sum)[0]!;
      const worst = [...points].sort((a, b) => a.sum - b.sum)[0]!;
      trend = { col: dcol, label: human(dcol), by, points, last: last.period, delta, best: best.period, worst: worst.period };
    }
  }
  // 5. Distribution of the measure in five quantile bands.
  const bands: Band[] = [];
  if (main && sorted.length >= 10) {
    const edges = [0, 0.2, 0.4, 0.6, 0.8, 1].map((q) => quantile(sorted, q));
    for (let i = 0; i < 5; i++) {
      const from = edges[i]!;
      const to = edges[i + 1]!;
      const inBand = main.values.filter((v) => (i === 4 ? v >= from && v <= to : v >= from && v < to));
      const sum = inBand.reduce((a, b) => a + b, 0);
      bands.push({ label: `${i * 20}–${(i + 1) * 20} %`, from: note(r2(from)), to: note(r2(to)), count: note(inBand.length), sum: note(r2(sum)), share: note(total ? r4(sum / total) : 0) });
    }
  }
  // 6. Rates: mean, range, values out of range.
  const rates: RateFact[] = rateCols.map((c) => {
    const pts = c.values.some((v) => v > 1.5);
    const bad = c.values.filter((v) => v < 0 || v > (pts ? 100 : 1)).length;
    return { col: c.col, label: human(c.col), mean: note(r4(c.values.reduce((a, b) => a + b, 0) / Math.max(1, c.values.length))), min: note(r4(Math.min(...c.values))), max: note(r4(Math.max(...c.values))), outOfRange: note(bad) };
  });
  // 7. Anomalies, each with its count.
  const anomalies: string[] = [];
  if (main) {
    const neg = main.values.filter((v) => v < 0).length;
    const zeros = main.values.filter((v) => v === 0).length;
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const hi = q3 + 3 * iqr;
    const out = iqr > 0 ? main.values.filter((v) => v > hi).length : 0;
    if (neg) anomalies.push(`${note(neg)} valeur(s) négative(s) de ${measureLabel} (minimum ${note(r2(sorted[0]!))})`);
    if (zeros) anomalies.push(`${note(zeros)} valeur(s) à zéro de ${measureLabel}`);
    if (out) anomalies.push(`${note(out)} valeur(s) extrême(s) de ${measureLabel} au-delà de ${note(r2(hi))} (Q3 + 3 × IQR)`);
  }
  const seen = new Set<string>();
  let dup = 0;
  for (const r of rows) {
    const k = columns.map((c) => String(r[c] ?? '')).join('\u0001');
    if (seen.has(k)) dup++;
    else seen.add(k);
  }
  if (dup) anomalies.push(`${note(dup)} ligne(s) en double (toutes colonnes identiques)`);
  for (const q of quality) if (q.missingPct >= 0.2 && q.type !== 'vide') anomalies.push(`« ${q.col} » : ${note(Math.round(q.missingPct * 1000) / 10)} % de valeurs manquantes`);
  for (const rt of rates) if (rt.outOfRange) anomalies.push(`« ${rt.col} » : ${rt.outOfRange} taux hors bornes`);
  if (dcol) {
    const future = rows.filter((r) => {
      const d = toDate(r[dcol] as Cell);
      return d && d.getTime() > Date.now() + 366 * 86400e3;
    }).length;
    if (future) anomalies.push(`« ${dcol} » : ${note(future)} date(s) à plus d'un an dans le futur`);
  }
  if (dup) kpis.push({ id: 'dup', label: 'Lignes en double', value: dup, fmt: 'int', method: 'lignes identiques sur toutes les colonnes' });
  for (const q of quality) note(Math.round(q.missingPct * 1000) / 10);
  return { title: o.title ?? 'Analyse', source: o.source ?? '', rows: rows.length, columns: columns.length, measure, measureLabel, entity, kpis, dims, trend, bands, rates, anomalies, quality, numbers: [...numbers] };
}

// ── formatting (French) ───────────────────────────────────────────────────────────────────────────────────────────
const fmtInt = (v: number) => Math.round(v).toLocaleString('fr-FR');
const fmtNum = (v: number) => (Math.abs(v) >= 1000 ? fmtInt(v) : v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }));
const fmtPct = (v: number) => `${(v * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
export function fmtFact(f: Fact): string {
  return f.fmt === 'int' ? fmtInt(f.value) : f.fmt === 'pct' ? fmtPct(f.value) : fmtNum(f.value);
}

/** The brief as a French Markdown document (tables, one method per figure). */
export function briefToMarkdown(b: Brief): string {
  const L: string[] = [`# Brief d'analyse — ${b.title}`, '', `Source : ${b.source || '—'} · ${fmtInt(b.rows)} lignes × ${b.columns} colonnes · mesure principale : **${b.measureLabel}**${b.measure ? ` (« ${b.measure} »)` : ''}`, '', '## Chiffres clés', '', '| Indicateur | Valeur | Méthode |', '|---|---:|---|'];
  for (const k of b.kpis) L.push(`| ${k.label} | ${fmtFact(k)} | ${k.method} |`);
  for (const d of b.dims) {
    L.push('', `## ${d.label} — ${fmtInt(d.categories)} catégorie(s), top 3 = ${fmtPct(d.top3Share)}, HHI ${d.hhi.toLocaleString('fr-FR', { maximumFractionDigits: 3 })}, ${d.n50} catégorie(s) font 50 % et ${d.n80} font 80 %${d.eta2 ? `, explique ${fmtPct(d.eta2)} de la variance` : ''}`, '', `| ${d.label} | ${b.measureLabel} | Lignes | Part |`, '|---|---:|---:|---:|');
    for (const t of d.top) L.push(`| ${t.key.replace(/\|/g, '/')} | ${fmtNum(t.sum)} | ${fmtInt(t.count)} | ${fmtPct(t.share)} |`);
  }
  if (b.trend) {
    L.push('', `## Évolution par ${b.trend.by === 'month' ? 'mois' : 'année'} (${b.trend.label}) — dernier ${b.trend.last}${b.trend.delta !== null ? ` : ${b.trend.delta >= 0 ? '+' : ''}${fmtPct(b.trend.delta)} vs période précédente` : ''}, meilleur ${b.trend.best}, plus faible ${b.trend.worst}`, '', `| Période | ${b.measureLabel} | Lignes |`, '|---|---:|---:|');
    for (const p of b.trend.points) L.push(`| ${p.period} | ${fmtNum(p.sum)} | ${fmtInt(p.count)} |`);
  }
  if (b.bands.length) {
    L.push('', `## Distribution de ${b.measureLabel} (cinq tranches de même effectif théorique)`, '', '| Tranche | De | À | Lignes | Total | Part |', '|---|---:|---:|---:|---:|---:|');
    for (const x of b.bands) L.push(`| ${x.label} | ${fmtNum(x.from)} | ${fmtNum(x.to)} | ${fmtInt(x.count)} | ${fmtNum(x.sum)} | ${fmtPct(x.share)} |`);
  }
  if (b.rates.length) {
    L.push('', '## Taux', '', '| Colonne | Moyenne | Min | Max | Hors bornes |', '|---|---:|---:|---:|---:|');
    for (const r of b.rates) L.push(`| ${r.label} | ${fmtNum(r.mean)} | ${fmtNum(r.min)} | ${fmtNum(r.max)} | ${r.outOfRange} |`);
  }
  L.push('', '## Anomalies', '');
  if (b.anomalies.length) for (const a of b.anomalies) L.push(`- ${a}`);
  else L.push('- aucune anomalie détectée par les contrôles automatiques');
  L.push('', '## Qualité des colonnes', '', '| Colonne | Type | Manquants | Distincts |', '|---|---|---:|---:|');
  for (const q of b.quality) L.push(`| ${q.col} | ${q.type} | ${fmtPct(q.missingPct)} | ${fmtInt(q.distinct)} |`);
  L.push('', '> Tous les chiffres ci-dessus sont calculés sur les lignes du fichier ; le récit ne doit en citer aucun autre.');
  return L.join('\n');
}

// ── the narrative check ──────────────────────────────────────────────────────────────────────────────────────────
export interface FoundNumber {
  raw: string;
  /** The candidate values (an ambiguous « 1,234 » is both 1.234 and 1234). */
  values: number[];
}
const NUM_RE = /(?<![\w.,])(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d{1,3}(?:,\d{3})+|\d+)(?:[.,]\d+)?(?:\s?(%|Md|Mds|M|k|K))?(?![\w])/g;
/** The numbers quoted in a text, with their unit resolved (%, Md, M, k). */
export function extractNumbers(text: string): FoundNumber[] {
  // List markers, headings and years are not figures.
  const clean = text.replace(/^\s*(?:#+\s*)?\d+[.)]\s/gm, ' ').replace(/\b(19|20)\d{2}\b/g, ' ');
  const out: FoundNumber[] = [];
  for (const m of clean.matchAll(NUM_RE)) {
    const raw = m[0];
    const unit = m[1] ?? '';
    const body = raw.replace(/\s?(%|Mds|Md|M|k|K)$/, '');
    const values: number[] = [];
    const parse = (s: string) => Number(s);
    if (/^\d{1,3}(?:,\d{3})+$/.test(body)) {
      // « 1,234,567 » is English thousands; a single « 1,234 » may also be a French decimal.
      values.push(parse(body.replace(/,/g, '')));
      if ((body.match(/,/g) ?? []).length === 1) values.push(parse(body.replace(',', '.')));
    } else values.push(parse(body.replace(/[ \u00a0\u202f]/g, '').replace(',', '.')));
    const scaled: number[] = [];
    const r9 = (v: number) => Math.round(v * 1e9) / 1e9;
    for (const v of values) {
      if (!Number.isFinite(v)) continue;
      if (unit === '%') scaled.push(r9(v / 100), v);
      else if (/^Mds?$/.test(unit)) scaled.push(v * 1e9);
      else if (unit === 'M') scaled.push(v * 1e6);
      else if (/^k$/i.test(unit)) scaled.push(r9(v * 1e3));
      else scaled.push(v);
    }
    if (scaled.length) out.push({ raw, values: scaled });
  }
  return out;
}
/** Displayed precision of a quoted number (« 4,5 Md » → 5e7; « 42,7 % » → 0.0005). */
function precisionOf(raw: string): number {
  const unit = /(%|Mds?|M|k|K)$/.exec(raw.trim())?.[1] ?? '';
  const body = raw.replace(/\s?(%|Mds?|M|k|K)$/, '').replace(/[ \u00a0\u202f]/g, '');
  const dec = /[.,](\d+)$/.exec(body)?.[1]?.length ?? 0;
  const base = Math.pow(10, -dec) / 2;
  if (unit === '%') return base / 100;
  if (/^Mds?$/.test(unit)) return base * 1e9;
  if (unit === 'M') return base * 1e6;
  if (/^k$/i.test(unit)) return base * 1e3;
  return base;
}
/** Every number of the narrative that is not a number of the brief (within its displayed precision or 0,5 %). */
export function checkNarrative(text: string, brief: Pick<Brief, 'numbers'>): { checked: number; unknown: string[] } {
  const known = brief.numbers;
  const unknown: string[] = [];
  let checked = 0;
  for (const f of extractNumbers(text)) {
    const tol = precisionOf(f.raw);
    const plain = f.values.some((v) => Number.isInteger(v) && v >= 0 && v <= 12);
    if (plain) continue; // small counts (« 3 constats ») are not figures of the data
    checked++;
    const ok = f.values.some((v) => known.some((k) => Math.abs(k - v) <= Math.max(tol, Math.abs(k) * 0.005) + 1e-9));
    if (!ok) unknown.push(f.raw.trim());
  }
  return { checked, unknown: [...new Set(unknown)] };
}
