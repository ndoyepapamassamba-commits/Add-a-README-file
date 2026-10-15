// COLUMN LEXICON (pure): the column a model or the owner MEANT, on any data file — « expo », « Provision », « Statut »,
// « encours », « client » — without ever guessing between two real columns. Order of trust:
//   exact name → forgiven name (case, accents, spaces) → learned alias of THIS file shape → business concepts
//   (French / English banking vocabulary of the APEX credit-risk skill: ACTE 7 headers, IFRS 9, BCEAO) → the file's
//   own dictionary sheet (« ColumnDescription »…).
// Two close candidates = AMBIGUOUS: the caller gets the short list (never a silent pick — a wrong column is a wrong figure).
import { normName, type Dataset } from './dataCore';
import codif from '../../../.claude/skills/apex-credit-risk/data/codification.json';

/** Concept → words (accents removed, lower case). Tokens in the same concept are the same thing to the reader. */
const CONCEPTS: Record<string, string[]> = {
  exposure: ['exposure', 'exposures', 'expo', 'exposition', 'expositions', 'ead', 'engagement', 'engagements', 'commitment', 'commitments'],
  outstanding: ['encours', 'outstanding', 'ototal', 'solde', 'balance', 'drawn', 'utilise', 'tire'],
  limit: ['limite', 'limit', 'ftotal', 'autorisation', 'autorisations', 'plafond', 'authorised', 'authorized', 'approved', 'octroye'],
  provision: ['provision', 'provisions', 'cprovisions', 'provisionnement', 'impairment', 'ecl', 'depreciation', 'depreciations', 'allowance', 'llp'],
  regulatory: ['regulatory', 'reglementaire', 'reglementaires', 'bceao', 'prudentiel', 'prudentielle'],
  ifrs: ['ifrs9', 'ifrs', 'ias39'],
  arrears: ['pdo', 'impaye', 'impayes', 'arrears', 'overdue', 'retard', 'retards', 'dpd', 'unpaid', 'past'],
  collateral: ['collateral', 'garantie', 'garanties', 'surete', 'suretes', 'security', 'securities', 'guarantee', 'nantissement', 'hypotheque'],
  status: ['status', 'statut', 'statuts', 'etat', 'state', 'situation'],
  performing: ['performing', 'np', 'npl', 'douteux', 'doubtful', 'sain', 'sains', 'defaut', 'default', 'nonperforming'],
  stage: ['stage', 'stages', 'stade', 'bucket'],
  classification: ['classification', 'classe', 'classes', 'class', 'categorie'],
  segment: ['segment', 'segments', 'seg', 'bseg'],
  client: ['client', 'clients', 'customer', 'customers', 'counterparty', 'contrepartie', 'contreparties', 'obligor', 'debiteur', 'debiteurs', 'borrower', 'emprunteur', 'tiers', 'relationship'],
  name: ['nom', 'name', 'libelle', 'label', 'designation', 'relationship', 'denomination'],
  group: ['groupe', 'group', 'grp', 'groupes', 'groups'],
  sector: ['secteur', 'secteurs', 'sector', 'sectors', 'industry', 'industrie', 'sic', 'activite', 'branche'],
  product: ['produit', 'produits', 'product', 'products', 'prod'],
  currency: ['devise', 'devises', 'currency', 'ccy', 'monnaie'],
  amount: ['montant', 'montants', 'amount', 'amounts', 'amt', 'valeur', 'value', 'mt'],
  country: ['pays', 'country', 'ctry', 'filiale', 'entite', 'entity'],
  region: ['region', 'regions', 'zone', 'zones', 'area'],
  date: ['date', 'dates', 'dt', 'jour'],
  maturity: ['maturite', 'maturity', 'echeance', 'echeances', 'expiry', 'expiration'],
  booking: ['booking', 'octroi', 'origination', 'disbursement', 'decaissement', 'ouverture'],
  reporting: ['reporting', 'arrete', 'closing', 'cloture'],
  officer: ['gestionnaire', 'gestionnaires', 'officer', 'officers', 'charge', 'rm', 'manager'],
  rate: ['taux', 'rate', 'rates'],
  interest: ['interet', 'interets', 'interest', 'interests'],
  accrual: ['accrual', 'accruals', 'courus', 'couru'],
  suspense: ['suspense', 'reserve', 'reserves', 'iis'],
  rating: ['note', 'notation', 'rating', 'ratings', 'grade', 'orr', 'frr', 'score', 'scoring', 'cotation'],
  contract: ['contrat', 'contrats', 'contract', 'contracts', 'account', 'accounts', 'compte', 'comptes', 'facility', 'facilities', 'facilite', 'dossier', 'pret', 'prets', 'loan', 'loans', 'ligne'],
  code: ['code', 'codes', 'id', 'identifiant', 'numero', 'num', 'ref', 'reference'],
  net: ['net', 'nette', 'nets', 'nettes'],
  gross: ['gross', 'brut', 'brute', 'bruts', 'brutes'],
  domicile: ['domicile', 'domiciliation', 'repayment'],
  program: ['programme', 'program', 'programmes', 'programs'],
  local: ['local', 'locale', 'locaux', 'lcy', 'xof', 'fcfa'],
};
/** Ties the APEX credit-risk skill settles (concept → the column it means in an ACTE 7 extract). */
const SKILL_PREFERS: [string, RegExp][] = [['outstanding', /including pdo/i], ['arrears', /pdo amount/i]];
const STOP = new Set(['in', 'of', 'the', 'de', 'du', 'des', 'la', 'le', 'les', 'en', 'par', 'per', 'a', 'au', 'aux', 'and', 'et', 'by', 'for', 'pour', 'total', 'totale', 'totaux', 'sum', 'somme', 'l', 'd', 'including', 'incl', 'avec', 'with']);
const CONCEPT_OF = new Map<string, string[]>();
for (const [c, words] of Object.entries(CONCEPTS)) for (const w of words) CONCEPT_OF.set(w, [...(CONCEPT_OF.get(w) ?? []), c]);

/** Words of a column name: camelCase split (netExposure), accents / punctuation / case forgiven, glue words dropped. */
export function tokensOf(s: string): string[] {
  return normName(String(s ?? '').replace(/([a-z])([A-Z])/g, '$1 $2'))
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}
const conceptsOf = (t: string) => CONCEPT_OF.get(t) ?? CONCEPT_OF.get(t.replace(/s$/, '')) ?? [];

/** How well a requested word is found in a column's words (1 = same word … 0 = absent). */
function wordScore(t: string, words: string[]): number {
  let best = 0;
  const ct = conceptsOf(t);
  for (const w of words) {
    if (w === t || w.replace(/s$/, '') === t.replace(/s$/, '')) return 1;
    if (ct.length && conceptsOf(w).some((c) => ct.includes(c))) best = Math.max(best, 0.85);
    else if (t.length >= 3 && w.startsWith(t)) best = Math.max(best, 0.75); // « expo » → exposure, « prov » → provisions
    else if (t.length >= 5 && w.includes(t)) best = Math.max(best, 0.7); // « provision » in « cprovisions »
    else if (w.length >= 4 && t.startsWith(w)) best = Math.max(best, 0.6);
  }
  return best;
}

export interface LexiconCtx {
  /** The file's own descriptions (column → text), from its dictionary sheet. */
  dict?: Record<string, string>;
  /** Learned aliases of this file shape: normName(asked) → real column. */
  aliases?: Record<string, string>;
}
export interface ColumnResolution {
  column: string | null;
  via: 'exact' | 'name' | 'alias' | 'lexicon' | 'dictionary' | null;
  /** Close candidates (ambiguous ask, or nearest columns when nothing matched). */
  candidates: string[];
  /** Several real columns fit equally: the caller must choose (never a silent pick). */
  ambiguous?: boolean;
}

/** The real column meant by `name`, or null with the candidates. */
export function resolveColumnSmart(columns: string[], name: string, ctx: LexiconCtx = {}): ColumnResolution {
  if (columns.includes(name)) return { column: name, via: 'exact', candidates: [] };
  const n = normName(name);
  const byName = columns.find((c) => normName(c) === n) ?? columns.find((c) => normName(c).replace(/ /g, '') === n.replace(/ /g, ''));
  if (byName) return { column: byName, via: 'name', candidates: [] };
  const al = ctx.aliases?.[n];
  if (al && columns.includes(al)) return { column: al, via: 'alias', candidates: [] };
  const want = tokensOf(name);
  if (!want.length) return { column: null, via: null, candidates: [] };
  const scored = columns
    .map((c) => {
      const words = tokensOf(c);
      const dictWords = ctx.dict?.[c] ? tokensOf(ctx.dict[c]!) : [];
      let sum = 0;
      let hit = 0;
      let fromDict = false;
      for (const t of want) {
        const a = wordScore(t, words);
        const b = dictWords.length ? 0.8 * wordScore(t, dictWords) : 0;
        if (b > a) fromDict = true;
        const s = Math.max(a, b);
        sum += s;
        if (s > 0) hit++;
      }
      // Every asked word must be found; a column with many extra words ranks a little lower (precision).
      const coverage = hit / want.length;
      const precision = words.length ? Math.min(1, hit / words.length) : 0;
      return { c, score: (sum / want.length) * coverage * coverage + 0.05 * precision, fromDict };
    })
    .filter((x) => x.score >= 0.55)
    .sort((a, b) => b.score - a.score);
  if (scored.length && (scored.length === 1 || scored[0]!.score - scored[1]!.score >= 0.1))
    return { column: scored[0]!.c, via: scored[0]!.fromDict ? 'dictionary' : 'lexicon', candidates: [] };
  // The credit-risk skill settles a few ties by itself (ACTE 7: « encours » = Ototal INCLUDING PDO, base of every ratio).
  if (scored.length > 1) {
    const top = scored.filter((x) => scored[0]!.score - x.score < 0.1);
    for (const [concept, re] of SKILL_PREFERS)
      if (want.some((t) => conceptsOf(t).includes(concept))) {
        const pick = top.filter((x) => re.test(x.c));
        if (pick.length === 1) return { column: pick[0]!.c, via: 'lexicon', candidates: [] };
      }
  }
  if (scored.length) return { column: null, via: null, ambiguous: true, candidates: scored.filter((x) => scored[0]!.score - x.score < 0.1).slice(0, 5).map((x) => x.c) };
  return { column: null, via: null, candidates: nearest(columns, name) };
}

/** Nearest columns by shared letter trigrams (a hint in the error, never a pick). */
function nearest(columns: string[], name: string): string[] {
  const tri = (s: string) => {
    const t = ` ${normName(s)} `;
    const out = new Set<string>();
    for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
    return out;
  };
  const a = tri(name);
  return columns
    .map((c) => {
      const b = tri(c);
      let inter = 0;
      for (const x of a) if (b.has(x)) inter++;
      return { c, s: inter / Math.max(1, Math.min(a.size, b.size)) };
    })
    .filter((x) => x.s >= 0.34)
    .sort((x, y) => y.s - x.s)
    .slice(0, 3)
    .map((x) => x.c);
}

export interface QueryResolution {
  query: Record<string, unknown>;
  /** Columns that could not be resolved (with candidates when ambiguous). */
  missing: { name: string; candidates: string[]; ambiguous: boolean }[];
  /** What was interpreted (asked → real), said to the model and the user. */
  mapped: { from: string; to: string; via: string }[];
}

const aggName = (a: { fn?: unknown; column?: unknown; as?: unknown }) => (a.as ? String(a.as) : `${String(a.fn)}_${String(a.column)}`);

/**
 * Rewrites a (coerced) query with the real column names. A sort key may name an AGGREGATION output (« expo_net »,
 * « sum_Net Exposure », « sum(Net Exposure) ») or its source column: it is pointed to that output.
 */
export function resolveQuery(q: Record<string, unknown>, columns: string[], ctx: LexiconCtx = {}): QueryResolution {
  const missing: QueryResolution['missing'] = [];
  const mapped: QueryResolution['mapped'] = [];
  const fix = (c: unknown): unknown => {
    if (typeof c !== 'string' || c === '*') return c;
    const r = resolveColumnSmart(columns, c, ctx);
    if (r.column) {
      if (r.via !== 'exact' && r.via !== 'name' && !mapped.some((m) => m.from === c)) mapped.push({ from: c, to: r.column, via: r.via! });
      return r.column;
    }
    if (!missing.some((m) => m.name === c)) missing.push({ name: c, candidates: r.candidates, ambiguous: !!r.ambiguous });
    return c;
  };
  const out: Record<string, unknown> = { ...q };
  for (const k of ['filters', 'groupBy', 'aggregations'])
    if (Array.isArray(q[k])) out[k] = (q[k] as Record<string, unknown>[]).map((x) => (x && typeof x === 'object' ? { ...x, column: fix(x.column) } : x));
  if (Array.isArray(q.select)) out.select = (q.select as unknown[]).map(fix);
  if (Array.isArray(q.sort)) {
    const aggs = (Array.isArray(out.aggregations) ? out.aggregations : []) as Record<string, unknown>[];
    const grouped = aggs.length > 0 || (Array.isArray(out.groupBy) && (out.groupBy as unknown[]).length > 0);
    const outputs = aggs.length ? aggs.map(aggName) : grouped ? ['count'] : [];
    out.sort = (q.sort as Record<string, unknown>[]).map((s) => {
      if (!s || typeof s !== 'object' || typeof s.column !== 'string') return s;
      const c = s.column;
      if (grouped) {
        const direct = outputs.find((o) => o === c) ?? outputs.find((o) => normName(o) === normName(c));
        if (direct) return { ...s, column: direct };
        // « sum_X » / « sum(X) » / « total X » / X itself → the aggregation computed on X.
        const m = /^\s*([a-z_]+?)[_\s(]+(.+?)\)?\s*$/i.exec(c);
        const fnAsked = m ? m[1]!.toLowerCase().replace(/^total$|^somme$/, 'sum').replace(/^mean$|^average$/, 'avg') : null;
        const src = m && fnAsked && ['sum', 'avg', 'count', 'min', 'max', 'median', 'count_distinct'].includes(fnAsked) ? m[2]! : c;
        const srcCol = src === '*' ? '*' : resolveColumnSmart(columns, src, ctx).column;
        const onSrc = aggs.filter((a) => a.column === srcCol && (!fnAsked || a.fn === fnAsked || src === c));
        if (onSrc.length === 1) return { ...s, column: aggName(onSrc[0]!) };
        const gb = ((out.groupBy ?? []) as Record<string, unknown>[]).map((g) => g.column);
        if (srcCol && gb.includes(srcCol)) return { ...s, column: srcCol };
        if (aggs.length === 1 && /^(count|n|nb|nombre|total|value|valeur|montant|amount)$/i.test(c)) return { ...s, column: aggName(aggs[0]!) };
      }
      return { ...s, column: fix(c) };
    });
  }
  return { query: out, missing, mapped };
}

/** The French message of a resolution failure: ambiguous asks list their candidates, unknown ones their nearest columns. */
export function missingText(missing: QueryResolution['missing']): string {
  return missing
    .map((m) =>
      m.ambiguous
        ? `« ${m.name} » est ambigu → choisir parmi : ${m.candidates.join(' | ')}`
        : `« ${m.name} » introuvable${m.candidates.length ? ` (proches : ${m.candidates.join(' | ')})` : ''}`,
    )
    .join(' ; ');
}

// ── the file's own dictionary sheet ─────────────────────────────────────────────────────────────────────────────────
/**
 * A dictionary sheet describes the columns of the data sheet (« ColumnDescription », « Dictionnaire »…): one of its
 * columns holds most of the data columns' names, another a text describing them. Returns column → description.
 */
export function dictionaryFrom(dict: Pick<Dataset, 'columns' | 'rows'>, dataColumns: string[]): Record<string, string> | null {
  if (dict.rows.length < 3 || dict.rows.length > 2000 || !dataColumns.length) return null;
  const wanted = new Map(dataColumns.map((c) => [normName(c), c]));
  let nameCol: string | null = null;
  let best = 0;
  for (const c of dict.columns) {
    const hits = dict.rows.filter((r) => typeof r[c] === 'string' && wanted.has(normName(r[c] as string))).length;
    if (hits > best) [best, nameCol] = [hits, c];
  }
  if (!nameCol || best < Math.max(3, Math.min(dataColumns.length, dict.rows.length) * 0.4)) return null;
  // The description = the text column with the longest texts (other than the names).
  const textCols = dict.columns
    .filter((c) => c !== nameCol)
    .map((c) => ({ c, len: dict.rows.reduce((s, r) => s + (typeof r[c] === 'string' ? (r[c] as string).length : 0), 0) }))
    .sort((a, b) => b.len - a.len);
  const descCol = textCols[0]?.len ? textCols[0].c : null;
  if (!descCol) return null;
  const out: Record<string, string> = {};
  for (const r of dict.rows) {
    const col = typeof r[nameCol] === 'string' ? wanted.get(normName(r[nameCol] as string)) : undefined;
    const d = r[descCol];
    if (col && typeof d === 'string' && d.trim()) out[col] = d.trim().slice(0, 240);
  }
  return Object.keys(out).length ? out : null;
}
/** Sheets worth testing as a dictionary first (by name), then the small ones. */
export const DICT_SHEET = /dictionar|dictionn|description|descr|glossa|definition|metadata|meta|champs|fields|columns?|colonnes|legend|l[ée]gende|lexique|mapping/i;

// ── the owner's codes (APEX codification referential) ───────────────────────────────────────────────────────────────
type Codif = Record<string, Record<string, string | string[]>>;
const CODES = codif as unknown as Codif;
/** The referential that labels a column's codes (Segment Code → segments, Product Code → products…), if any. */
function referentialOf(column: string): { ref: Record<string, string | string[]>; label: string } | null {
  const t = tokensOf(column).join(' ');
  if (/\bsegment\b/.test(t)) return { ref: CODES.seg ?? {}, label: 'segment' };
  if (/\bproduct\b|\bproduit\b/.test(t) && !/initial/.test(t)) return { ref: CODES.prod ?? {}, label: 'produit' };
  if (/\bsecurity code\b|\bgarantie\b/.test(t)) return { ref: CODES.sec ?? {}, label: 'garantie' };
  if (/\bsic\b/.test(t)) return { ref: CODES.sic ?? {}, label: 'secteur' };
  if (/\bcredit program\b|\bprogramme\b/.test(t)) return { ref: CODES.pp ?? {}, label: 'programme' };
  return null;
}
/** Label of a code in the referential of that column (« 8200 » → « Entreprises locales »), else null. */
export function codeLabel(column: string, code: unknown): string | null {
  const r = referentialOf(column);
  if (!r || code === null || code === undefined) return null;
  const v = r.ref[String(code).trim()];
  if (!v) return null;
  return (Array.isArray(v) ? v[0] : v)?.trim() || null;
}

// ── schema packet: what the agent knows of a data file before its first query ───────────────────────────────────────
export interface SchemaPacketInput {
  path: string;
  sheet: string | null;
  sheets: string[];
  rowCount: number;
  columns: { name: string; type: string; unique: number; missing: number; top?: { value: string; count: number }[]; codes?: { value: string; count: number }[]; sum?: number }[];
  dict?: Record<string, string> | null;
  dictSheet?: string | null;
  aliases?: Record<string, string>;
  /** Column → how many analyses of this file shape used it (learned in this browser). */
  usage?: Record<string, number>;
}
/**
 * The compact « portfolio card » given to the model with an attached data file: one line per column (type, codes with
 * their labels, the dictionary's description), the measures it should use, and the learned aliases. Read locally,
 * 0 token of exploration: the first query can be the right one.
 */
export function schemaPacket(p: SchemaPacketInput): string {
  const lines = [
    `PORTFOLIO CARD — ${p.path}${p.sheet ? ` · sheet "${p.sheet}"` : ''}${p.sheets.length > 1 ? ` (sheets: ${p.sheets.join(', ')})` : ''} · ${p.rowCount} rows · ${p.columns.length} columns${p.dictSheet ? ` · descriptions from sheet "${p.dictSheet}"` : ''}`,
    'Use these EXACT column names in data.query / data.export (business words are also understood: expo, encours, provision, statut, segment, client…).',
  ];
  const measures: string[] = [];
  for (const c of p.columns) {
    const bits = [c.type, `${c.unique} distinct`];
    if (c.missing) bits.push(`${c.missing} empty`);
    const codes = c.codes?.length ? c.codes : c.unique <= 40 ? c.top : undefined;
    if (codes?.length)
      bits.push(
        `values: ${codes
          .slice(0, 12)
          .map((t) => {
            const lbl = codeLabel(c.name, t.value);
            return `${t.value.slice(0, 24)}${lbl ? ` = ${lbl.slice(0, 40)}` : ''} (${t.count})`;
          })
          .join(', ')}`,
      );
    const d = p.dict?.[c.name];
    lines.push(`- ${c.name} — ${bits.join(' · ')}${d ? ` — « ${d.slice(0, 140)} »` : ''}`);
    if ((c.type === 'number' || c.type === 'integer') && c.unique > 40) measures.push(c.name);
  }
  if (measures.length) lines.push(`Measures (sum / avg): ${measures.slice(0, 16).join(' | ')}`);
  const used = Object.entries(p.usage ?? {}).filter(([c]) => p.columns.some((x) => x.name === c)).sort((a, b) => b[1] - a[1]);
  if (used.length) lines.push(`Most used in earlier analyses of this file shape: ${used.slice(0, 8).map(([c, n]) => `${c} (${n})`).join(' | ')}`);
  const al = Object.entries(p.aliases ?? {});
  if (al.length) lines.push(`Learned on this file shape: ${al.slice(0, 20).map(([a, c]) => `« ${a} » = ${c}`).join(' ; ')}`);
  return lines.join('\n');
}

/** Signature of a file SHAPE (its sorted column names): what is learned on one extract serves the next month's. */
export function shapeSignature(columns: string[]): string {
  return [...columns].map(normName).sort().join('|').slice(0, 400);
}
