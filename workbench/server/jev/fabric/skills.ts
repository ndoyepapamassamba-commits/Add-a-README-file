// JEV SKILL FACTORY + SKILL REGISTRY (versioning) + SKILL TEST LAB decision.
// A single answer never becomes a skill: a candidate needs repetition, generalisation,
// a measured WITH vs WITHOUT test and no regression. All numbers come from real runs.
import { keywords } from '../live';
import { redact } from '../provider';
import type { JevLogEntry } from '../metrics';
import { SCIENCE, pairedStat, type PairedStat } from '../science';
import { configKeyOf, qualityOfEntry, safeText } from './memory';
import { hashText } from '../science';

export type SkillStatus = 'candidate' | 'validated' | 'deprecated' | 'failed';

export interface SkillBenchmark {
  /** Paired WITH vs WITHOUT results behind this version. */
  n: number;
  deltaSuccess: number | null;
  deltaQuality: number | null;
  /** (with − without) / without of the cost per successful mission; negative = cheaper. */
  deltaCostPerSuccess: number | null;
  at: number;
  /** Where the numbers come from (skill test lab, benchmark…). */
  source: string;
}

export interface SkillVersion {
  version: string;
  name: string;
  domain: string;
  taskTypes: string[];
  triggerConditions: string[];
  prerequisites: string[];
  procedure: string[];
  promptTemplate: string;
  toolRequirements: string[];
  expectedOutput: string;
  evaluationCriteria: string[];
  examples: { instruction: string; outcome: string }[];
  counterExamples: { instruction: string; problem: string }[];
  provenance: { experiences: string[]; models: string[]; teacher?: string; note: string };
  /** n / (n + 5) × success rate of the mined group; recomputed by tests. */
  confidence: number;
  successRate: number | null;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
  reason: string;
  /** Benchmark before / after this version (null until tested). */
  benchmark: SkillBenchmark | null;
  regressions: string[];
  status: SkillStatus;
}

export interface FabricSkill {
  id: string;
  name: string;
  domain: string;
  currentVersion: string;
  /** Version used at runtime (the last validated one), or null while only candidates exist. */
  activeVersion: string | null;
  versions: SkillVersion[];
  status: SkillStatus;
  /** Identity of the mined group (task type + toolset + trigger keywords): avoids duplicate candidates. */
  groupKey: string;
  createdAt: number;
  updatedAt: number;
}

export const SKILL_RULES = {
  minRepeats: 3,
  minSuccessRate: 0.8,
  minQuality: 70,
  minMissions: 2,
  maxExamples: 3,
} as const;

const VERB: Record<string, string> = {
  'filesystem.read': 'Lire les fichiers concernés',
  'filesystem.list': 'Lister le dossier pour repérer les fichiers',
  'filesystem.search': 'Rechercher dans les fichiers',
  'filesystem.write': 'Écrire le résultat dans un fichier',
  'filesystem.edit': 'Modifier le fichier existant',
  'data.inspect': 'Inspecter la structure des données (colonnes, types)',
  'data.query': 'Interroger les données pour obtenir les chiffres',
  'data.chart': 'Produire le graphique',
  'data.export': 'Exporter les résultats',
  'code.run': 'Exécuter le code pour vérifier le résultat',
  'terminal.execute': 'Exécuter la commande',
  'web.search': 'Chercher les sources sur le web',
  'browser.open': 'Ouvrir la page',
  'report.export': 'Exporter le rapport',
  'plan.update': 'Tenir le plan à jour',
};
const CRITERIA_BY_TYPE: Record<string, string[]> = {
  data: [
    'chaque chiffre provient d’un résultat d’outil',
    'le total recoupe le détail',
    'format de sortie respecté',
  ],
  code: ['le code s’exécute', 'le résultat demandé est donné', 'style du projet respecté'],
  research: ['sources citées', 'affirmations vérifiables'],
  document: ['informations extraites exactes', 'citation de l’endroit où elles se trouvent'],
  writing: ['ton et longueur demandés', 'éléments obligatoires présents'],
  browser: ['la page attendue a été atteinte', 'le résultat observé est rapporté'],
  chat: ['réponse directe et correcte'],
  review: ['problèmes concrets listés avec preuve'],
  vision: ['description fidèle'],
};

const slug = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);

export interface MineInput {
  log: JevLogEntry[];
  existing: FabricSkill[];
  now?: number;
  /** Overrides of SKILL_RULES (the distillation lab accepts 2 repetitions of a TEACHER, still tested before promotion). */
  rules?: Partial<Record<keyof typeof SKILL_RULES, number>>;
  /** Mark the provenance as distilled from this teacher model. */
  teacher?: string;
}
export interface MineReport {
  candidates: FabricSkill[];
  /** Groups seen but not mined, with the reason (transparency: why a single success is not a skill). */
  rejected: { key: string; reason: string }[];
}

/**
 * PATTERN DETECTION → GENERALISATION → CANDIDATE SKILL. Groups real runs by task type and toolset;
 * keeps a group only when it is repeated, spread over several different missions, successful and good.
 */
export function mineCandidates(i: MineInput): MineReport {
  const now = i.now ?? Date.now();
  const R = { ...SKILL_RULES, ...i.rules };
  const groups = new Map<string, JevLogEntry[]>();
  for (const e of i.log) {
    if (e.fabric?.kind === 'skilltest' || e.success === null) continue;
    const tools = [...new Set((e.toolsUsed ?? []).map((t) => t.split('.')[0]!))].sort().join('+') || '-';
    const k = `${e.task}|${tools}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const candidates: FabricSkill[] = [];
  const rejected: MineReport['rejected'] = [];
  for (const [key, es] of groups) {
    const wins = es.filter((e) => e.success && (qualityOfEntry(e) ?? 100) >= R.minQuality);
    const rate = es.filter((e) => e.success).length / es.length;
    const missions = new Set(es.map((e) => (e.instruction ?? e.mission).trim().toLowerCase().slice(0, 80)));
    if (wins.length < R.minRepeats) {
      rejected.push({
        key,
        reason: `${wins.length} réussite(s) de qualité < ${R.minRepeats} répétitions requises`,
      });
      continue;
    }
    if (missions.size < R.minMissions) {
      rejected.push({ key, reason: 'une seule mission répétée : pas de généralisation' });
      continue;
    }
    if (rate < R.minSuccessRate) {
      rejected.push({
        key,
        reason: `réussite du groupe ${(rate * 100).toFixed(0)} % < ${R.minSuccessRate * 100} %`,
      });
      continue;
    }
    // generalisation: terms present in most of the successful missions
    const kw = new Map<string, number>();
    for (const e of wins) for (const w of keywords(safeText(e))) kw.set(w, (kw.get(w) ?? 0) + 1);
    const triggers = [...kw]
      .filter(([, n]) => n >= Math.max(Math.min(2, R.minRepeats), Math.ceil(wins.length * 0.6)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([w]) => w);
    if (!triggers.length) {
      rejected.push({ key, reason: 'aucun terme commun : généralisation impossible' });
      continue;
    }
    const groupKey = `${key}|${triggers.slice(0, 4).join('+')}`;
    if (i.existing.some((s) => s.groupKey === groupKey)) continue;
    // ordered procedure: tools used by most successful runs, by mean position
    const pos = new Map<string, number[]>();
    for (const e of wins) (e.toolsUsed ?? []).forEach((t, idx) => pos.set(t, [...(pos.get(t) ?? []), idx]));
    const tools = [...pos]
      .filter(([, p]) => p.length >= Math.ceil(wins.length * 0.5))
      .map(([t, p]) => ({ t, at: p.reduce((a, b) => a + b, 0) / p.length }))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.t);
    const type = es[0]!.task;
    const crit = CRITERIA_BY_TYPE[type] ?? CRITERIA_BY_TYPE.chat!;
    const procedure = [
      ...tools.map((t, n) => `${n + 1}. ${VERB[t] ?? `Utiliser ${t}`}`),
      `${tools.length + 1}. Vérifier le résultat selon les critères ci-dessous avant de répondre`,
    ];
    const best = [...wins]
      .sort(
        (a, b) =>
          (qualityOfEntry(b) ?? 0) - (qualityOfEntry(a) ?? 0) ||
          (a.acct?.totalCost ?? a.cost) - (b.acct?.totalCost ?? b.cost),
      )
      .slice(0, R.maxExamples);
    const bad = es.filter((e) => e.success === false).slice(0, 2);
    const name = `${slug(type)}_${slug(triggers.slice(0, 2).join('_')) || 'GENERAL'}`;
    const conf = Math.round((wins.length / (wins.length + 5)) * rate * 100) / 100;
    const v: SkillVersion = {
      version: '1.0',
      name,
      domain: type,
      taskTypes: [type],
      triggerConditions: triggers,
      prerequisites: tools.length ? [`outils disponibles : ${tools.join(', ')}`] : [],
      procedure,
      promptTemplate: `[Skill ${name}] Pour une tâche « ${type} » portant sur : ${triggers.join(', ')}.\nProcédure :\n${procedure.join('\n')}\nCritères : ${crit.join(' ; ')}.`,
      toolRequirements: tools,
      expectedOutput: crit[crit.length - 1]!,
      evaluationCriteria: crit,
      examples: best.map((e) => ({
        instruction: redact(e.instruction ?? e.mission).slice(0, 200),
        outcome: `réussi, qualité ${qualityOfEntry(e) ?? 'NON MESURÉE'}, ${(e.acct?.totalCost ?? e.cost).toFixed(4)} $`,
      })),
      counterExamples: bad.map((e) => ({
        instruction: redact(e.instruction ?? e.mission).slice(0, 200),
        problem: e.failureNote ?? e.toolErrors?.[0] ?? 'échec du contrôle de réussite',
      })),
      provenance: {
        experiences: wins.map((e) => e.id).slice(0, 20),
        models: [...new Set(wins.map((e) => e.model))],
        ...(i.teacher ? { teacher: i.teacher } : {}),
        note: `extrait de ${wins.length} réussites sur ${es.length} missions (${missions.size} consignes distinctes), configuration ${configKeyOf(wins[0]!)}`,
      },
      confidence: conf,
      successRate: rate,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
      reason: 'création automatique par la Skill Factory (répétition + généralisation)',
      benchmark: null,
      regressions: [],
      status: 'candidate',
    };
    candidates.push({
      id: `skill-${hashText(groupKey)}`,
      name,
      domain: type,
      currentVersion: '1.0',
      activeVersion: null,
      versions: [v],
      status: 'candidate',
      groupKey,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { candidates, rejected };
}

// ───────────────────────── versioning ─────────────────────────

const bump = (v: string, major: boolean) => {
  const [a, b] = v.split('.').map(Number);
  return major ? `${(a ?? 1) + 1}.0` : `${a ?? 1}.${(b ?? 0) + 1}`;
};
const cur = (s: FabricSkill) => s.versions.find((v) => v.version === s.currentVersion)!;
export const versionOf = (s: FabricSkill, v: string) => s.versions.find((x) => x.version === v);

/** New version (history, provenance and reason kept); it starts as a candidate and must be tested again. */
export function addVersion(
  s: FabricSkill,
  patch: Partial<SkillVersion>,
  reason: string,
  o: { major?: boolean; now?: number } = {},
): FabricSkill {
  const now = o.now ?? Date.now();
  const base = cur(s);
  const version = bump(
    s.versions
      .map((v) => v.version)
      .sort(
        (a, b) =>
          Number(a.split('.')[0]) - Number(b.split('.')[0]) ||
          Number(a.split('.')[1]) - Number(b.split('.')[1]),
      )
      .at(-1)!,
    Boolean(o.major),
  );
  const nv: SkillVersion = {
    ...base,
    ...patch,
    version,
    reason,
    createdAt: now,
    updatedAt: now,
    benchmark: null,
    regressions: [],
    status: 'candidate',
    usageCount: 0,
  };
  return {
    ...s,
    versions: [...s.versions, nv],
    currentVersion: version,
    status: 'candidate',
    updatedAt: now,
  };
}
/** PROMOTE: only a version whose test passed. The previous active version is remembered for rollback. */
export function promote(s: FabricSkill, version: string, now = Date.now()): FabricSkill {
  const v = versionOf(s, version);
  if (!v) throw new Error(`version ${version} inconnue`);
  if (!v.benchmark) throw new Error('promotion refusée : la version n’a pas été testée (WITH vs WITHOUT)');
  return {
    ...s,
    versions: s.versions.map((x) =>
      x.version === version ? { ...x, status: 'validated' as const, updatedAt: now } : x,
    ),
    activeVersion: version,
    currentVersion: version,
    status: 'validated',
    updatedAt: now,
  };
}
/** ROLLBACK: back to the previous validated version (or no active version). */
export function rollback(s: FabricSkill, now = Date.now()): FabricSkill {
  const validated = s.versions.filter((v) => v.status === 'validated' && v.version !== s.activeVersion);
  const prev = validated.at(-1);
  return {
    ...s,
    versions: s.versions.map((v) =>
      v.version === s.activeVersion
        ? { ...v, status: 'deprecated' as const, regressions: [...v.regressions, 'retiré par rollback'] }
        : v,
    ),
    activeVersion: prev?.version ?? null,
    currentVersion: prev?.version ?? s.currentVersion,
    status: prev ? 'validated' : 'deprecated',
    updatedAt: now,
  };
}
export const deprecate = (s: FabricSkill, now = Date.now()): FabricSkill => ({
  ...s,
  status: 'deprecated',
  activeVersion: null,
  versions: s.versions.map((v) => ({ ...v, status: v.status === 'validated' ? 'deprecated' : v.status })),
  updatedAt: now,
});
export function clone(s: FabricSkill, name: string, now = Date.now()): FabricSkill {
  const v = {
    ...cur(s),
    version: '1.0',
    name,
    reason: `copie de ${s.name} v${s.currentVersion}`,
    createdAt: now,
    updatedAt: now,
    benchmark: null,
    regressions: [],
    status: 'candidate' as const,
    usageCount: 0,
  };
  return {
    id: `skill-${hashText(`${name}|${now}`)}`,
    name,
    domain: s.domain,
    currentVersion: '1.0',
    activeVersion: null,
    versions: [v],
    status: 'candidate',
    groupKey: `${s.groupKey}|clone:${name}`,
    createdAt: now,
    updatedAt: now,
  };
}
export function compareVersions(
  s: FabricSkill,
  a: string,
  b: string,
): { field: string; a: string; b: string }[] {
  const va = versionOf(s, a);
  const vb = versionOf(s, b);
  if (!va || !vb) return [];
  const f = (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x));
  const keys: (keyof SkillVersion)[] = [
    'triggerConditions',
    'procedure',
    'promptTemplate',
    'toolRequirements',
    'evaluationCriteria',
    'confidence',
    'successRate',
    'benchmark',
    'regressions',
    'status',
  ];
  return keys
    .filter((k) => f(va[k]) !== f(vb[k]))
    .map((k) => ({ field: String(k), a: f(va[k]), b: f(vb[k]) }));
}

// ───────────────────────── runtime selection (compact) ─────────────────────────

/** Skills worth injecting for a request: validated only, matching triggers, never more than `max`. */
export function selectSkills(
  skills: FabricSkill[],
  task: { taskType: string; text: string },
  o: { max?: number; skip?: Set<string>; allowCandidate?: Set<string> } = {},
): { skill: FabricSkill; version: SkillVersion; score: number }[] {
  const q = keywords(task.text);
  return skills
    .filter(
      (s) =>
        !o.skip?.has(s.name) &&
        (s.activeVersion !== null || o.allowCandidate?.has(s.id)) &&
        s.status !== 'deprecated',
    )
    .map((s) => {
      const v = versionOf(s, s.activeVersion ?? s.currentVersion)!;
      const hit = v.triggerConditions.filter((t) => q.has(t)).length;
      return { skill: s, version: v, score: v.taskTypes.includes(task.taskType) ? hit : 0 };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, o.max ?? 2);
}
/** Compact injection (≈ 150–250 tokens): procedure and criteria only — never the examples. */
export const skillPrompt = (v: SkillVersion): string =>
  `<fabric_skill name="${v.name}" v="${v.version}">\n${v.procedure.join('\n')}\nCritères : ${v.evaluationCriteria.join(' ; ')}.\n</fabric_skill>`;

// ───────────────────────── test lab: WITH vs WITHOUT ─────────────────────────

export interface SkillTestStats {
  pairs: number;
  success: PairedStat;
  quality: PairedStat;
  cost: PairedStat;
  costPerSuccessWith: number | null;
  costPerSuccessWithout: number | null;
  costPerSuccessChange: number | null;
  successWith: number | null;
  successWithout: number | null;
}
/** Pairs entries tagged skilltest arm with_skill / without_skill by group id and compares them. */
export function skillTestStats(log: JevLogEntry[], skillId: string, version: string): SkillTestStats {
  const es = log.filter(
    (e) =>
      e.fabric?.kind === 'skilltest' && e.fabric.skillId === skillId && e.fabric.skillVersion === version,
  );
  const groups = new Map<string, { w?: JevLogEntry; wo?: JevLogEntry }>();
  for (const e of es) {
    const g = groups.get(e.fabric!.groupId) ?? {};
    if (e.fabric!.arm === 'with_skill') g.w = e;
    else g.wo = e;
    groups.set(e.fabric!.groupId, g);
  }
  const ps = [...groups.values()].filter((g): g is { w: JevLogEntry; wo: JevLogEntry } =>
    Boolean(g.w && g.wo),
  );
  const cost = (e: JevLogEntry) => e.acct?.totalCost ?? e.cost + e.jevCost;
  const succ = (e: JevLogEntry) => (e.success === null ? null : e.success ? 1 : 0);
  const both = (f: (e: JevLogEntry) => number | null) =>
    ps.flatMap((p) => {
      const a = f(p.wo);
      const b = f(p.w);
      return a === null || b === null ? [] : [b - a];
    });
  const sum = (xs: JevLogEntry[], f: (e: JevLogEntry) => number) => xs.reduce((a, e) => a + f(e), 0);
  const w = ps.map((p) => p.w);
  const wo = ps.map((p) => p.wo);
  const okW = w.filter((e) => e.success).length;
  const okWo = wo.filter((e) => e.success).length;
  const cw = okW ? sum(w, cost) / okW : null;
  const cwo = okWo ? sum(wo, cost) / okWo : null;
  return {
    pairs: ps.length,
    success: pairedStat(both(succ)),
    quality: pairedStat(both(qualityOfEntry)),
    cost: pairedStat(both(cost)),
    costPerSuccessWith: cw,
    costPerSuccessWithout: cwo,
    costPerSuccessChange: cw !== null && cwo !== null && cwo > 0 ? (cw - cwo) / cwo : null,
    successWith: ps.length ? okW / ps.length : null,
    successWithout: ps.length ? okWo / ps.length : null,
  };
}

export type PromotionVerdict = 'promote' | 'keep_candidate' | 'fail';
export interface PromotionDecision {
  verdict: PromotionVerdict;
  reasons: string[];
  benchmark: SkillBenchmark | null;
}
/**
 * A skill is promoted only if it IMPROVES measured performance with no regression:
 * n ≥ minPairs, success not lower beyond tolerance, and quality up by ≥ 2 points or cost per
 * successful mission down by ≥ 5 %. A significant worsening fails it; otherwise it stays a candidate.
 */
export function promotionDecision(
  t: SkillTestStats,
  now = Date.now(),
  source = 'Skill Test Lab (paires WITH / WITHOUT)',
): PromotionDecision {
  const n = t.pairs;
  const bm: SkillBenchmark = {
    n,
    deltaSuccess: t.success.meanDelta,
    deltaQuality: t.quality.n ? t.quality.meanDelta : null,
    deltaCostPerSuccess: t.costPerSuccessChange,
    at: now,
    source,
  };
  if (n < SCIENCE.minPairs)
    return {
      verdict: 'keep_candidate',
      reasons: [`n = ${n} < ${SCIENCE.minPairs} paires : ÉCHANTILLON INSUFFISANT, aucune décision`],
      benchmark: n ? bm : null,
    };
  const reasons: string[] = [];
  const dS = t.success.meanDelta ?? 0;
  const dQ = t.quality.n >= 3 ? t.quality.meanDelta : null;
  const worse =
    dS < -SCIENCE.successTolerance ||
    (dQ !== null && dQ < -SCIENCE.qualityTolerance) ||
    (t.costPerSuccessChange !== null && t.costPerSuccessChange >= SCIENCE.neutralBand && dS <= 0);
  if (worse) {
    reasons.push(
      `détérioration mesurée : réussite ${(dS * 100).toFixed(0)} pts${dQ !== null ? `, qualité ${dQ.toFixed(1)} pts` : ''}${t.costPerSuccessChange !== null ? `, coût / réussie ${(t.costPerSuccessChange * 100).toFixed(0)} %` : ''}`,
    );
    return { verdict: 'fail', reasons, benchmark: bm };
  }
  const betterQ = dQ !== null && dQ >= 2;
  const cheaper = t.costPerSuccessChange !== null && t.costPerSuccessChange <= -SCIENCE.neutralBand;
  if (betterQ || cheaper || dS >= SCIENCE.successTolerance) {
    if (betterQ) reasons.push(`qualité +${dQ!.toFixed(1)} pts`);
    if (cheaper) reasons.push(`coût / réussie ${(t.costPerSuccessChange! * 100).toFixed(0)} %`);
    if (dS >= SCIENCE.successTolerance) reasons.push(`réussite +${(dS * 100).toFixed(0)} pts`);
    return {
      verdict: 'promote',
      reasons: [...reasons, 'aucune régression au-delà des tolérances'],
      benchmark: bm,
    };
  }
  return {
    verdict: 'keep_candidate',
    reasons: ['aucune amélioration mesurée au-delà du bruit : la skill reste candidate'],
    benchmark: bm,
  };
}
/** Applies a decision to a skill version (status and benchmark recorded; promotion is a separate, explicit step). */
export function recordTest(
  s: FabricSkill,
  version: string,
  d: PromotionDecision,
  now = Date.now(),
): FabricSkill {
  return {
    ...s,
    versions: s.versions.map((v) =>
      v.version === version
        ? {
            ...v,
            benchmark: d.benchmark,
            status: d.verdict === 'fail' ? 'failed' : v.status,
            regressions: d.verdict === 'fail' ? [...v.regressions, ...d.reasons] : v.regressions,
            updatedAt: now,
          }
        : v,
    ),
    status: d.verdict === 'fail' && s.currentVersion === version ? 'failed' : s.status,
    updatedAt: now,
  };
}
