// STRATA and MATCHED TASK SETS. Two runs are comparable only when they share family, risk, output contract, difficulty
// band, tool profile, context level and language. Otherwise the comparison is NON_COMPARABLE and no superiority is
// ever concluded from it.
import type { JevLogEntry } from '../metrics';
import { familyOf } from './registry';
import type { Risk, TaskDNA } from './types';

export const contractOfText = (text: string, structured = false): string => {
  const t = text.toLowerCase();
  if (structured || /\bjson\b/.test(t)) return /\bjson\b/.test(t) ? 'structured_json' : 'structured';
  if (/\b(tableau|table|xlsx?|excel|csv|colonnes?)\b/.test(t)) return 'table';
  if (/\b(code|script|fonction|fonction|programme|python|javascript)\b/.test(t)) return 'code';
  if (/\b(liste|énumère|enumere)\b/.test(t)) return 'list';
  if (/\b(calcule|combien|total|somme|moyenne)\b/.test(t)) return 'number';
  return 'narrative';
};
export const riskOfText = (text: string): Risk =>
  /\b(bceao|r[ée]glementaire|conformit|comit[ée]|comex|supprim|efface|delete|drop)\b/i.test(text)
    ? 'critical'
    : /\b(production|financ|mot de passe|password|secret|s[ée]curit)\b/i.test(text)
      ? 'high'
      : 'normal';
export const diffBucket = (d: number | undefined): string =>
  d === undefined ? 'n/a' : d < 0.25 ? 'd1' : d < 0.5 ? 'd2' : d < 0.75 ? 'd3' : 'd4';
export const ctxBucket = (tokens: number): string =>
  tokens < 2000 ? 'ctx-s' : tokens < 10_000 ? 'ctx-m' : tokens < 30_000 ? 'ctx-l' : 'ctx-xl';
export const toolProfileOf = (tools: string[]): string =>
  [...new Set(tools.map((t) => t.split(/[._]/)[0]!))].sort().slice(0, 3).join('+') || 'none';
export const langOf = (text: string): string => {
  const fr = (text.match(/\b(le|la|les|des|une|est|pour|avec|dans|sont|quel|quelle|combien)\b/gi) ?? [])
    .length;
  const en = (text.match(/\b(the|and|with|for|this|that|is|are|what|how)\b/gi) ?? []).length;
  return fr + en < 2 ? 'other' : fr >= en ? 'fr' : 'en';
};

export interface Strata {
  family: string;
  risk: Risk;
  contract: string;
  difficulty: string;
  toolProfile: string;
  context: string;
  lang: string;
}
export const strataKey = (s: Strata): string =>
  [s.family, s.risk, s.contract, s.difficulty, s.toolProfile, s.context, s.lang].join('|');

/** Strata of a mission from its Task DNA (live). */
export const strataOfDna = (dna: TaskDNA, tools: string[], text: string): Strata => ({
  family: dna.task_family,
  risk: dna.risk,
  contract: dna.output_contract ?? contractOfText(text, dna.structured_output_requirement),
  difficulty: diffBucket(dna.difficulty),
  toolProfile: toolProfileOf(tools),
  context: ctxBucket(dna.context_size),
  lang: dna.language,
});

/** Strata of a logged run (tag first, then heuristics on the recorded text). */
export function strataOf(e: JevLogEntry): Strata {
  const a = e.apprentice;
  const text = e.instruction ?? e.mission;
  return {
    family: familyOf(e),
    risk: a?.risk ?? riskOfText(text),
    contract: a?.contract ?? contractOfText(text),
    difficulty: diffBucket(a?.difficulty ?? e.experiment?.difficulty),
    toolProfile: a?.toolProfile ?? toolProfileOf(e.toolsUsed ?? []),
    context: a?.contextBucket ?? ctxBucket(e.contextBefore),
    lang: a?.lang ?? langOf(text),
  };
}

export interface Matched {
  status: 'MATCHED' | 'NON_COMPARABLE';
  reasons: string[];
  /** Runs kept on each side (balanced inside every common stratum). */
  a: JevLogEntry[];
  b: JevLogEntry[];
  strata: number;
  /** Share of the smaller side that could be matched. */
  coverage: number;
}
/**
 * Balanced matching on strata: inside every stratum present on BOTH sides keep the same number of runs (the most recent
 * ones). If too little can be matched, the comparison is NON_COMPARABLE.
 */
export function matchStrata(
  a: JevLogEntry[],
  b: JevLogEntry[],
  o: { minCoverage?: number; minMatched?: number } = {},
): Matched {
  const key = (e: JevLogEntry) => strataKey(strataOf(e));
  const group = (xs: JevLogEntry[]) => {
    const m = new Map<string, JevLogEntry[]>();
    for (const e of [...xs].sort((x, y) => y.at - x.at)) m.set(key(e), [...(m.get(key(e)) ?? []), e]);
    return m;
  };
  const ga = group(a);
  const gb = group(b);
  const ka: JevLogEntry[] = [];
  const kb: JevLogEntry[] = [];
  let strata = 0;
  for (const [k, xs] of ga) {
    const ys = gb.get(k);
    if (!ys) continue;
    const m = Math.min(xs.length, ys.length);
    ka.push(...xs.slice(0, m));
    kb.push(...ys.slice(0, m));
    strata++;
  }
  const smaller = Math.min(a.length, b.length);
  const coverage = smaller ? ka.length / smaller : 0;
  const reasons: string[] = [];
  if (!strata)
    reasons.push(
      'aucune strate commune (famille, risque, contrat de sortie, difficulté, outils, contexte, langue)',
    );
  else if (coverage < (o.minCoverage ?? 0.5))
    reasons.push(
      `couverture ${(coverage * 100).toFixed(0)} % < ${((o.minCoverage ?? 0.5) * 100).toFixed(0)} % des missions de l'échantillon le plus petit`,
    );
  if (ka.length < (o.minMatched ?? 3))
    reasons.push(`${ka.length} paire(s) appariée(s) < ${o.minMatched ?? 3}`);
  return { status: reasons.length ? 'NON_COMPARABLE' : 'MATCHED', reasons, a: ka, b: kb, strata, coverage };
}

/** matchedTaskSet: benchmark tasks are comparable only when their Task DNA strata agree. */
export function matchedTaskSet<T extends { text: string; category?: string }>(
  tasks: T[],
  strataOfTask: (t: T) => Strata,
): { status: 'MATCHED' | 'NON_COMPARABLE'; reasons: string[]; tasks: T[] } {
  if (!tasks.length) return { status: 'NON_COMPARABLE', reasons: ['aucune tâche'], tasks: [] };
  const first = strataOfTask(tasks[0]!);
  const diffs = new Set<string>();
  for (const t of tasks) {
    const s = strataOfTask(t);
    if (s.risk !== first.risk) diffs.add('risque différent');
    if (s.contract !== first.contract) diffs.add('contrat de sortie différent');
    if (s.difficulty !== first.difficulty) diffs.add('niveau de difficulté différent');
    if (s.toolProfile !== first.toolProfile) diffs.add('profil d’outils différent');
    if (s.lang !== first.lang) diffs.add('langue différente');
    if (s.context !== first.context) diffs.add('niveau de contexte différent');
  }
  return diffs.size
    ? { status: 'NON_COMPARABLE', reasons: [...diffs], tasks }
    : { status: 'MATCHED', reasons: [], tasks };
}
