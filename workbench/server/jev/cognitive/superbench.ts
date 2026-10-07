// JEV COGNITIVE SUPER BENCHMARK — 200 deterministic tasks whose ground truth is COMPUTED by the generator (never typed), run in
// five arms. Nothing here is a result: the benchmark only runs when the user starts it; the analysis only reads real log entries.
// Categories that cannot be scored without a human or a judge (research, creative writing, vision, multimodal) are NOT faked:
// they are listed in NOT_DETERMINISTIC and excluded.
import type { JevLogEntry } from '../metrics';
import { describe, pairedStat, type PairedStat } from '../science';
import { qualityOfEntry } from '../fabric/memory';

export type SbCategory =
  | 'reasoning'
  | 'coding'
  | 'data'
  | 'structured'
  | 'planning'
  | 'longcontext'
  | 'shortcontext'
  | 'highrisk'
  | 'lowcost';
export const SB_CATEGORIES: SbCategory[] = [
  'reasoning',
  'coding',
  'data',
  'structured',
  'planning',
  'longcontext',
  'shortcontext',
  'highrisk',
  'lowcost',
];
export const SB_LABEL: Record<SbCategory, string> = {
  reasoning: 'raisonnement',
  coding: 'code (sortie calculée)',
  data: 'données',
  structured: 'sortie structurée',
  planning: 'planification',
  longcontext: 'contexte long',
  shortcontext: 'contexte court',
  highrisk: 'enjeu élevé (précision)',
  lowcost: 'faible coût (triviale)',
};
export const NOT_DETERMINISTIC: { id: string; reason: string }[] = [
  { id: 'research', reason: 'dépend du web et de sources changeantes : aucune vérité calculable' },
  { id: 'writing / creative', reason: 'qualité subjective : exige un juge ou un humain' },
  { id: 'vision / multimodal', reason: 'exige des images et un juge de vision' },
  { id: 'tool use', reason: 'couvert par la catégorie multi-tool du Cognitive Benchmark existant' },
];
export interface SbTask {
  key: string;
  category: SbCategory;
  text: string;
  /** Ground-truth check on the final answer. */
  check: (answer: string) => boolean;
  /** What the check looks for (shown in reports). */
  truth: string;
}
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)]!;
/** Matches the integer n with any thousands separator and not as part of a longer number. */
const hasInt = (ans: string, n: number): boolean => {
  const s = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '[\\s\\u00a0\\u202f.,]?');
  return new RegExp(`(?<![\\d])${n < 0 ? '-' : ''}${s}(?![\\d])`).test(ans);
};
const hasDec = (ans: string, n: number, d = 1) =>
  new RegExp(`(?<![\\d])${n.toFixed(d).replace('.', '[.,]')}(?!\\d)`).test(ans);
const NAMES = [
  'Awa',
  'Moussa',
  'Fatou',
  'Ibrahima',
  'Khady',
  'Cheikh',
  'Mariama',
  'Oumar',
  'Aminata',
  'Pape',
];

const gen: Record<SbCategory, (r: () => number, i: number) => Omit<SbTask, 'key' | 'category'>> = {
  reasoning: (r) => {
    const names = [...NAMES].sort(() => r() - 0.5).slice(0, 4);
    const [a, b, c, d] = names as [string, string, string, string];
    return {
      text: `${a} est plus grand(e) que ${b}. ${b} est plus grand(e) que ${c}. ${d} est plus petit(e) que ${c}. Qui est le/la plus petit(e) ? Réponds par le prénom.`,
      check: (x) =>
        new RegExp(`\\b${d}\\b`, 'i').test(x) && !new RegExp(`plus petit[^.]*\\b(${a}|${b})\\b`, 'i').test(x),
      truth: d,
    };
  },
  coding: (r) => {
    const n = int(r, 5, 12);
    const kind = int(r, 0, 2);
    if (kind === 0) {
      let s = 0;
      for (let k = 1; k <= n; k++) s += (2 * k - 1) ** 2;
      return {
        text: `Que renvoie une fonction qui additionne les carrés des ${n} premiers nombres impairs (1, 3, 5…) ? Donne le nombre.`,
        check: (x) => hasInt(x, s),
        truth: String(s),
      };
    }
    if (kind === 1) {
      const w = pick(r, ['cognitive', 'workbench', 'orchestration', 'intelligence', 'architecture']);
      const v = [...w].filter((c) => 'aeiouy'.includes(c)).length;
      return {
        text: `Combien de voyelles (a, e, i, o, u, y) contient le mot « ${w} » ? Donne le nombre.`,
        check: (x) => hasInt(x, v),
        truth: String(v),
      };
    }
    const f = [0, 1];
    for (let k = 2; k <= n + 8; k++) f.push(f[k - 1]! + f[k - 2]!);
    return {
      text: `Quel est le ${n + 8}ᵉ terme de la suite de Fibonacci si F(0)=0 et F(1)=1 ? Donne le nombre.`,
      check: (x) => hasInt(x, f[n + 8]!),
      truth: String(f[n + 8]),
    };
  },
  data: (r) => {
    const rows = Array.from({ length: 6 }, () => ({
      k: pick(r, ['Dakar', 'Thiès', 'Saint-Louis']),
      v: int(r, 10, 99) * 100,
    }));
    const g = pick(r, ['Dakar', 'Thiès', 'Saint-Louis']);
    const s = rows.filter((x) => x.k === g).reduce((a, x) => a + x.v, 0);
    const csv = rows.map((x) => `${x.k};${x.v}`).join('\n');
    return {
      text: `Voici un CSV (ville;montant) :\n${csv}\nQuel est le total des montants pour ${g} ? Donne le nombre (0 s'il n'y en a pas).`,
      check: (x) => hasInt(x, s),
      truth: String(s),
    };
  },
  structured: (r) => {
    const name = pick(r, NAMES);
    const age = int(r, 20, 60);
    const city = pick(r, ['Dakar', 'Thiès', 'Kaolack', 'Ziguinchor']);
    return {
      text: `Extrais les informations de la phrase suivante et réponds UNIQUEMENT par un JSON {"nom","age","ville"} : « ${name} a ${age} ans et vit à ${city}. »`,
      check: (x) => {
        try {
          const j = JSON.parse(x.slice(x.indexOf('{'), x.lastIndexOf('}') + 1));
          return (
            String(j.nom).toLowerCase() === name.toLowerCase() &&
            Number(j.age) === age &&
            String(j.ville).toLowerCase() === city.toLowerCase()
          );
        } catch {
          return false;
        }
      },
      truth: JSON.stringify({ nom: name, age, ville: city }),
    };
  },
  planning: (r) => {
    const t = ['A', 'B', 'C', 'D', 'E'];
    const order = [...t].sort(() => r() - 0.5);
    const rules: [string, string][] = order.slice(0, -1).map((x, i) => [x, order[i + 1]!]);
    const txt = rules.map(([a, b]) => `${a} avant ${b}`).join(' ; ');
    return {
      text: `Cinq tâches A, B, C, D, E. Contraintes : ${txt}. Donne l'ordre d'exécution complet, sous la forme A, B, C, D, E (dans le bon ordre).`,
      check: (x) => {
        const m = x.match(/\b[A-E]\b(?:\s*(?:,|→|->|puis|>)\s*\b[A-E]\b){4}/);
        return m ? m[0].replace(/[^A-E]/g, '') === order.join('') : false;
      },
      truth: order.join(', '),
    };
  },
  longcontext: (r) => {
    const code = `${pick(r, ['KORA', 'BAOBAB', 'TERANGA', 'SABAR'])}-${int(r, 100, 999)}`;
    const filler = Array.from(
      { length: 28 },
      (_, i) =>
        `Note ${i + 1} : le comité a examiné le dossier numéro ${int(r, 1000, 9999)} sans observation particulière.`,
    );
    filler.splice(int(r, 4, 24), 0, `Le code d'accès confidentiel du coffre est ${code}.`);
    return {
      text: `${filler.join('\n')}\n\nQuel est le code d'accès du coffre ? Donne uniquement le code.`,
      check: (x) => x.includes(code),
      truth: code,
    };
  },
  shortcontext: (r) => {
    const a = int(r, 12, 99);
    const b = int(r, 12, 99);
    return { text: `${a} × ${b} = ? Donne le nombre.`, check: (x) => hasInt(x, a * b), truth: String(a * b) };
  },
  highrisk: (r) => {
    const enc = int(r, 5, 12) * 1000;
    const imp = Math.round(enc * (int(r, 40, 140) / 1000));
    const ratio = (imp / enc) * 100;
    return {
      text: `Encours total ${enc} millions XOF, impayés ${imp} millions XOF. Quel est le taux d'impayés en pourcentage, avec exactement 1 décimale ? Donne uniquement le nombre.`,
      check: (x) => hasDec(x, ratio, 1),
      truth: ratio.toFixed(1),
    };
  },
  lowcost: (r) => {
    const items = [
      ['la capitale du Sénégal', /dakar/i],
      ['la capitale du Mali', /bamako/i],
      ['la capitale de la Côte d’Ivoire (administrative)', /yamoussoukro/i],
      ['la capitale du Niger', /niamey/i],
      ['la capitale du Burkina Faso', /ouagadougou/i],
    ] as const;
    const [q, rx] = pick(r, [...items]);
    return { text: `Quelle est ${q} ? Réponds en un mot.`, check: (x) => rx.test(x), truth: rx.source };
  },
};
/** 200 tasks: 22 per category (+2 extra on the first categories). Same seed → same tasks. */
export function superBenchTasks(seed = 20260614): SbTask[] {
  const r = rng(seed);
  const out: SbTask[] = [];
  SB_CATEGORIES.forEach((cat, ci) => {
    const n = ci < 2 ? 23 : 22;
    for (let i = 0; i < n; i++)
      out.push({
        key: `${cat.slice(0, 3)}${String(i + 1).padStart(2, '0')}`,
        category: cat,
        ...gen[cat](r, i),
      });
  });
  return out;
}

export type SbArm = 'alone' | 'jev' | 'jev+protocol' | 'jev+fabric' | 'full';
export const SB_ARMS: { id: SbArm; label: string; what: string }[] = [
  { id: 'alone', label: 'Modèle seul', what: 'JEV désactivé, Cognitive OS désactivé, Fabric désactivé' },
  {
    id: 'jev',
    label: 'JEV',
    what: 'JEV complet (pré-décision, contrôle live, QA), sans Cognitive OS ni Fabric',
  },
  {
    id: 'jev+protocol',
    label: 'JEV + protocole',
    what: 'JEV + diagnostic, protocole minimal, comportement, contrat de sortie, garde-fous (Cognitive OS actif)',
  },
  {
    id: 'jev+fabric',
    label: 'JEV + skills & mémoire',
    what: 'JEV + Cognitive Fabric (compétences validées et mémoire d’expérience). Les skills et la mémoire ne sont pas séparables aujourd’hui.',
  },
  { id: 'full', label: 'JEV complet', what: 'JEV + Fabric + Cognitive OS actif' },
];
export interface ArmRow {
  arm: SbArm;
  n: number;
  success: number | null;
  quality: number | null;
  tokens: number | null;
  cost: number | null;
  latencyMs: number | null;
  calls: number | null;
  retries: number | null;
  /** Paired difference vs « alone » on the same tasks (quality). */
  vsAlone: PairedStat | null;
}
const armOf = (e: JevLogEntry): SbArm | null =>
  e.fabric?.kind === 'cfbench' || e.bench?.startsWith('sb-')
    ? ((e.cognitive as { arm?: SbArm } | undefined)?.arm ?? null)
    : null;
const cost = (e: JevLogEntry) => e.acct?.totalCost ?? e.cost + e.jevCost;
const tok = (e: JevLogEntry) => e.acct?.totalTokens ?? e.tokensIn + e.tokensOut;
/** Real entries only (tagged by the benchmark runner). Empty log → empty table, never invented numbers. */
export function analyzeSuperBench(log: JevLogEntry[]): {
  rows: ArmRow[];
  byCategory: Record<string, Partial<Record<SbArm, number | null>>>;
  note: string;
} {
  const tagged = log.filter((e) => e.bench?.startsWith('sb-') && armOf(e));
  const rows: ArmRow[] = SB_ARMS.map(({ id }) => {
    const es = tagged.filter((e) => armOf(e) === id);
    const m = (xs: number[]) => describe(xs).mean;
    const alone = tagged.filter((e) => armOf(e) === 'alone');
    const diffs: number[] = [];
    if (id !== 'alone')
      for (const e of es) {
        const o = alone.find((x) => x.bench === e.bench && x.rep === e.rep);
        const a = qualityOfEntry(e);
        const b = o ? qualityOfEntry(o) : null;
        if (a !== null && b !== null) diffs.push(a - b);
      }
    return {
      arm: id,
      n: es.length,
      success: es.length ? es.filter((e) => e.success).length / es.length : null,
      quality: m(es.map(qualityOfEntry).filter((x): x is number => x !== null)),
      tokens: m(es.map(tok)),
      cost: m(es.map(cost)),
      latencyMs: m(es.map((e) => e.latencyMs)),
      calls: m(es.map((e) => e.calls)),
      retries: m(es.map((e) => e.retries)),
      vsAlone: id === 'alone' || !diffs.length ? null : pairedStat(diffs),
    };
  });
  const acc: Record<string, Partial<Record<SbArm, number[]>>> = {};
  for (const e of tagged) {
    const cat = e.fabric?.category ?? e.experiment?.category ?? 'n/a';
    const q = qualityOfEntry(e);
    if (q !== null) ((acc[cat] ??= {})[armOf(e)!] ??= []).push(q);
  }
  const byCategory: Record<string, Partial<Record<SbArm, number | null>>> = {};
  for (const [c, arms] of Object.entries(acc))
    for (const [a, xs] of Object.entries(arms)) (byCategory[c] ??= {})[a as SbArm] = describe(xs!).mean;
  return {
    rows,
    byCategory,
    note: tagged.length
      ? `${tagged.length} exécution(s) réelles`
      : 'INSUFFICIENT DATA : le benchmark n’a pas encore été lancé',
  };
}
