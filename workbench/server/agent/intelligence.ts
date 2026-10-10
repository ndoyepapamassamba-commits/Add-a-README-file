// MASSAMBA INTELLIGENCE ENGINE (pure, shared by the server and the direct
// edition). Every capability here is wired into the real agent loop:
//   Task DNA → Strategy (+ evolution, failure memory, personal leaderboard)
//   → execution watched by the Shadow monitor → Evidence check (figures
//   without proof) → Adversarial challenge → Final judge → Learning (ledger).
// Also: intelligent compression, knowledge graph, digital twin, functional
// diff, decision simulator / counterfactuals, information value, personal
// operating manual, living regression suite and auto-benchmark scoring.
import { QUALITY_TIERS, type QualityTier, type TaskProfile, type TaskType } from '../llm/routing';
import type { MissionCheck, MissionReport, Verdict } from './mission';
import { methodOnly } from '../jev/memory/semantic';

// ════════════════════════════════════════════════════════════════════════
// 1. TASK DNA
// ════════════════════════════════════════════════════════════════════════

export type Criticality = 'low' | 'normal' | 'high' | 'critical';
export interface TaskDna {
  type: TaskType;
  complexity: number;
  criticality: Criticality;
  data: string[];
  outputs: string[];
  risks: string[];
  verification: string[];
  /** Normalised keywords (for similarity with past missions). */
  keywords: string[];
  /** Coarse class used to learn strategies: type:output:criticality. */
  cls: string;
}

const STOP = new Set(
  'le la les un une des de du et ou en au aux a à pour par sur dans avec ce cette ces mon ma mes ton ta tes son sa ses nos vos leur leurs qui que quoi dont est sont être fais fait faire moi toi il elle nous vous ils elles the a an of to in on for and or with is are be this that it as at by from please stp svp'.split(
    ' ',
  ),
);
export function keywords(text: string, max = 40): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].slice(0, max);
}

const OUT_RX: [string, RegExp][] = [
  ['app', /\b(application|app|dashboard|tableau de bord|cockpit|site|page web)\b/i],
  ['excel', /\b(excel|xlsx|classeur|tableur)\b/i],
  ['word', /\b(word|docx|rapport|note|compte.rendu)\b/i],
  ['powerpoint', /\b(powerpoint|pptx|pr[ée]sentation|slides?|diapo)/i],
  ['pdf', /\bpdf\b/i],
  ['mail', /\b(mail|e-mail|email|courriel|outlook)\b/i],
  ['chart', /\b(graphique|chart|courbe|visuali)/i],
  ['code', /\b(code|script|fonction|api|programme)\b/i],
  ['3d', /\b(3d|blender|sc[èe]ne|maquette 3d)\b/i],
];
const RISK_RX: [string, RegExp][] = [
  ['financial', /\b(provision|ifrs ?9|npl|cr[ée]dit|risque|bilan|budget|montant|xof|fcfa|€|\$)/i],
  [
    'regulatory',
    /\b(bceao|r[ée]glementaire|r[ée]gulateur|conformit|compliance|audit|b[âa]le|commission bancaire)/i,
  ],
  ['governance', /\b(comex|comit[ée]|conseil|direction g[ée]n[ée]rale|dg\b|board)/i],
  ['destructive', /\b(supprim|efface|delete|drop|reset|[ée]crase|remplace tout)/i],
  ['security', /\b(mot de passe|password|secret|cl[ée] api|token|s[ée]curit)/i],
  ['production', /\b(production|prod\b|d[ée]ploie|deploy|mise en ligne)/i],
  ['personal-data', /\b(client|nom|t[ée]l[ée]phone|adresse|donn[ée]es personnelles|rgpd)/i],
];

export function taskDna(text: string, attachments: string[], p: TaskProfile): TaskDna {
  const t = `${text} ${attachments.join(' ')}`;
  const data = [
    ...new Set(
      attachments
        .map((a) => /\.([a-z0-9]+)$/i.exec(a)?.[1]?.toLowerCase())
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const outputs = OUT_RX.filter(([, re]) => re.test(t)).map(([k]) => k);
  const risks = RISK_RX.filter(([, re]) => re.test(t)).map(([k]) => k);
  const criticality: Criticality =
    risks.includes('regulatory') || risks.includes('governance') || risks.includes('destructive')
      ? 'critical'
      : risks.includes('financial') || risks.includes('production') || risks.includes('security')
        ? 'high'
        : p.difficulty < 0.3
          ? 'low'
          : 'normal';
  const verification = [
    ...(p.type === 'code' || outputs.includes('code') || outputs.includes('app')
      ? ['execute', 'browser-test']
      : []),
    ...(p.type === 'data' || data.some((d) => /xls|csv|json/.test(d)) ? ['recompute-figures'] : []),
    ...(p.type === 'research' ? ['cross-check-sources'] : []),
    ...(outputs.some((o) => ['excel', 'word', 'powerpoint', 'pdf', 'mail'].includes(o))
      ? ['open-deliverables']
      : []),
    ...(criticality === 'critical' || criticality === 'high' ? ['adversarial-challenge'] : []),
  ];
  return {
    type: p.type,
    complexity: Math.round(p.difficulty * 100) / 100,
    criticality,
    data,
    outputs,
    risks,
    verification: [...new Set(verification)],
    keywords: keywords(t),
    cls: `${p.type}:${outputs[0] ?? 'answer'}:${criticality === 'critical' || criticality === 'high' ? 'hi' : 'lo'}`,
  };
}

/** 0..1 similarity between two missions (type, outputs, data, keywords). */
export function dnaSimilarity(a: TaskDna, b: TaskDna): number {
  const jac = (x: string[], y: string[]) => {
    if (!x.length && !y.length) return 1;
    const s = new Set(x);
    const inter = y.filter((v) => s.has(v)).length;
    return inter / (new Set([...x, ...y]).size || 1);
  };
  return (
    (a.type === b.type ? 0.3 : 0) +
    jac(a.outputs, b.outputs) * 0.2 +
    jac(a.data, b.data) * 0.1 +
    jac(a.keywords, b.keywords) * 0.3 +
    (a.criticality === b.criticality ? 0.1 : 0)
  );
}

// ════════════════════════════════════════════════════════════════════════
// 2. MISSION LEDGER (self-evolving memory) + FAILURE MEMORY
// ════════════════════════════════════════════════════════════════════════

export interface LedgerEntry {
  id: string;
  at: number;
  goal: string;
  dna: TaskDna;
  tier: QualityTier;
  model: string;
  team: string[];
  verdict: Verdict | 'ERROR';
  approved?: boolean;
  challenged?: number;
  cost: number;
  durationMs: number;
  steps: number;
  toolErrors: { tool: string; error: string }[];
  rounds: number;
  files: { read: string[]; written: string[] };
  checks: MissionCheck[];
  lessons: string[];
  // ── Mission telemetry (Intelligence Engine) ──
  session?: string;
  agent?: string;
  skills?: string[];
  mcp?: string[];
  tools?: string[];
  tokensIn?: number;
  tokensOut?: number;
  /** Model calls of the mission (all agents). */
  calls?: number;
  retries?: number;
  qa?: number;
  escalations?: number;
  /** The user corrected the result in the next message. */
  humanCorrection?: boolean;
  decision?: { chosen: string | null; tier: string; confidence: number; mode: string };
}
export interface Ledger {
  entries: LedgerEntry[];
}
export const emptyLedger = (): Ledger => ({ entries: [] });

export function recordEntry(l: Ledger, e: LedgerEntry, max = 400): Ledger {
  return { entries: [...l.entries.filter((x) => x.id !== e.id), e].slice(-max) };
}

const score = (v: LedgerEntry['verdict']) => (v === 'PASSED' ? 1 : v === 'PARTIAL' ? 0.5 : 0);

export function similarMissions(
  l: Ledger,
  dna: TaskDna,
  min = 0.45,
  n = 8,
): (LedgerEntry & { sim: number })[] {
  return l.entries
    .map((e) => ({ ...e, sim: dnaSimilarity(dna, e.dna) }))
    .filter((e) => e.sim >= min)
    .sort((a, b) => b.sim - a.sim || b.at - a.at)
    .slice(0, n);
}

/** Pitfalls learnt from failed / partial missions and tool errors of similar tasks. */
export function failureMemory(l: Ledger, dna: TaskDna, max = 6): string[] {
  const out: string[] = [];
  for (const e of similarMissions(l, dna, 0.4, 20)) {
    if (e.verdict !== 'PASSED')
      out.push(
        `A similar mission ("${e.goal.slice(0, 80)}") ended ${e.verdict} with ${e.model} (tier ${e.tier})${e.lessons.length ? `: ${e.lessons.slice(0, 2).join('; ')}` : ''}.`,
      );
    for (const te of e.toolErrors.slice(0, 2))
      out.push(`${te.tool} failed before: ${te.error.slice(0, 140)}`);
  }
  return [...new Set(out)].slice(0, max);
}

// ════════════════════════════════════════════════════════════════════════
// 3. STRATEGY ENGINE (+ strategy evolution)
// ════════════════════════════════════════════════════════════════════════

export interface Strategy {
  tier: QualityTier;
  tierReason: string;
  team: string[];
  verify: { qa: boolean; adversarial: boolean; judge: boolean; evidence: boolean };
  maxRounds: number;
  recovery: string[];
  parallel: string[];
  sequential: string[];
  pitfalls: string[];
  reuse: string[];
  similar: { goal: string; verdict: string; model: string; cost: number }[];
  explore: boolean;
}

const tierIdx = (t: QualityTier) => QUALITY_TIERS.indexOf(t);

/**
 * Decides HOW to solve the mission. Learns from the ledger: a cheaper tier
 * that keeps succeeding on this class of task is preferred (cost ↓); a tier
 * that keeps failing is escalated; sometimes (non-critical) a cheaper tier is
 * explored to discover savings.
 */
export function planStrategy(
  dna: TaskDna,
  p: TaskProfile,
  l: Ledger,
  opts: { mission: boolean; rand?: () => number } = { mission: false },
): Strategy {
  const rand = opts.rand ?? Math.random;
  let tier = p.tier;
  let tierReason = 'profil de la tâche';
  if (dna.criticality === 'critical' && tierIdx(tier) < tierIdx('quality')) {
    tier = 'quality';
    tierReason = 'enjeu critique : palier QUALITY minimum';
  }
  const sim = similarMissions(l, dna, 0.5, 30);
  const stats = new Map<QualityTier, { n: number; s: number; cost: number }>();
  for (const e of sim) {
    const x = stats.get(e.tier) ?? { n: 0, s: 0, cost: 0 };
    x.n++;
    x.s += score(e.verdict);
    x.cost += e.cost;
    stats.set(e.tier, x);
  }
  const rate = (t: QualityTier) => {
    const x = stats.get(t);
    return x ? (x.s + 1) / (x.n + 2) : null;
  };
  let explore = false;
  // Proven cheaper tier → use it (never below QUALITY when critical).
  const floor = dna.criticality === 'critical' ? tierIdx('quality') : 0;
  for (let i = floor; i < tierIdx(tier); i++) {
    const t = QUALITY_TIERS[i]!;
    const x = stats.get(t);
    if (x && x.n >= 2 && (rate(t) ?? 0) >= 0.75) {
      tier = t;
      tierReason = `appris : ${x.n} missions similaires réussies au palier ${t} (moins cher)`;
      break;
    }
  }
  // Failing tier → escalate.
  const cur = stats.get(tier);
  if (cur && cur.n >= 2 && (rate(tier) ?? 1) < 0.5 && tierIdx(tier) < QUALITY_TIERS.length - 1) {
    tier = QUALITY_TIERS[tierIdx(tier) + 1]!;
    tierReason = `appris : échecs répétés au palier inférieur → escalade ${tier}`;
  } else if (
    !stats.size &&
    dna.criticality !== 'critical' &&
    dna.criticality !== 'high' &&
    tierIdx(tier) > 0 &&
    rand() < 0.1
  ) {
    // Strategy evolution: try one tier cheaper now and then, the ledger decides later.
    tier = QUALITY_TIERS[tierIdx(tier) - 1]!;
    tierReason = 'exploration : essai d’un palier moins cher (apprentissage)';
    explore = true;
  }
  const hi = dna.criticality === 'critical' || dna.criticality === 'high';
  const team = [...p.team];
  if (hi && opts.mission && !team.includes('adversarial')) team.push('adversarial');
  if (dna.risks.includes('regulatory') && !team.includes('compliance'))
    team.splice(Math.max(0, team.length - 1), 0, 'compliance');
  if (dna.data.some((d) => /xls|csv/.test(d)) && dna.criticality !== 'low' && !team.includes('data_quality'))
    team.splice(1, 0, 'data_quality');
  const reuse = sim
    .filter((e) => e.verdict === 'PASSED')
    .slice(0, 3)
    .map(
      (e) =>
        `"${e.goal.slice(0, 90)}" succeeded with ${e.model} (team ${e.team.join(' → ') || 'solo'}, ${e.rounds} correction round(s), $${e.cost.toFixed(4)})${
          e.checks.length
            ? `; checks: ${e.checks
                .slice(0, 3)
                .map((c) => c.name)
                .join(', ')}`
            : ''
        }`,
    );
  return {
    tier,
    tierReason,
    team,
    verify: {
      qa: opts.mission || dna.verification.length > 0,
      adversarial: opts.mission && (hi || dna.verification.includes('recompute-figures')),
      judge: opts.mission,
      evidence: hi || dna.type === 'data' || dna.type === 'research' || dna.type === 'document',
    },
    maxRounds: hi ? 3 : 2,
    recovery: [
      'If a tool fails twice with the same arguments: change approach (another tool, smaller step, read the error) — never repeat it identically.',
      'If the model or a provider fails: the router falls back automatically on the next cheapest capable model.',
      'If data is missing or ambiguous: state the assumption, continue with the safest interpretation and flag it in the uncertainty map.',
      'If blocked after 3 attempts: deliver what is verified, mark the verdict PARTIAL and list exactly what remains.',
    ],
    parallel: [
      'independent reads (files, data profiles, documents) in the same step',
      'independent research queries',
    ],
    sequential: [
      'writes to the same file',
      'build → test → fix loops',
      'exports after the figures are verified',
    ],
    pitfalls: failureMemory(l, dna),
    reuse,
    similar: sim
      .slice(0, 5)
      .map((e) => ({ goal: e.goal.slice(0, 120), verdict: e.verdict, model: e.model, cost: e.cost })),
    explore,
  };
}

export function strategyPrompt(dna: TaskDna, s: Strategy): string {
  return [
    `# MASSAMBA STRATEGY (Task DNA → Strategy Engine)`,
    `Task DNA: type ${dna.type}, complexity ${Math.round(dna.complexity * 100)} %, criticality ${dna.criticality}${dna.risks.length ? `, risks: ${dna.risks.join(', ')}` : ''}${dna.outputs.length ? `, expected outputs: ${dna.outputs.join(', ')}` : ''}${dna.data.length ? `, data: ${dna.data.join(', ')}` : ''}.`,
    `Required verification: ${dna.verification.join(', ') || 'self-check'}.${s.verify.adversarial ? ' An adversarial red-team will try to refute your result before delivery.' : ''}${s.verify.evidence ? ' Every figure you state must come from a tool result (an evidence check flags unsupported numbers).' : ''}`,
    s.team.length ? `Team: ${s.team.join(' → ')} (delegate only when the specialisation adds quality).` : '',
    s.reuse.length
      ? `What worked before on similar missions (methods only — never their figures):\n${s.reuse.map((r) => `- ${methodOnly(r)}`).join('\n')}`
      : '',
    s.pitfalls.length
      ? `FAILURE MEMORY — avoid repeating:\n${s.pitfalls.map((r) => `- ${methodOnly(r)}`).join('\n')}`
      : '',
    `Recovery plan:\n${s.recovery.map((r) => `- ${r}`).join('\n')}`,
    `Parallelise: ${s.parallel.join('; ')}. Keep sequential: ${s.sequential.join('; ')}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ════════════════════════════════════════════════════════════════════════
// 4. SHADOW MONITOR (deterministic, free, real time)
// ════════════════════════════════════════════════════════════════════════

export interface ShadowAlert {
  kind:
    | 'repeat-failure'
    | 'stuck'
    | 'source-altered'
    | 'unverified-claim'
    | 'drift'
    | 'no-progress'
    | 'dependents'
    | 'regression';
  severity: 'info' | 'warn' | 'critical';
  message: string;
}
const VERIFY_TOOLS =
  /^(code\.run|terminal\.(execute|run)|apex\.qa|browser\.|data\.(query|inspect)|regression\.run|visualization|filesystem\.read)/;
const WRITE_TOOLS =
  /^(filesystem\.(write|edit|multi_edit|delete|move)|report\.export|data\.(export|transform)|apex\.build_app|artifact\.create|blender\.scene)/;

export class ShadowMonitor {
  private failures = new Map<string, number>();
  private consecutiveErrors = 0;
  private readStreak = 0;
  private verified = false;
  private wrote = false;
  private raised = new Set<string>();
  private pending: ShadowAlert[] = [];
  private goalWords: Set<string>;
  private offTopic = 0;
  /** 0 (on track) → 1 (drifted). */
  drift = 0;
  readonly written: string[] = [];
  readonly read: string[] = [];
  readonly toolErrors: { tool: string; error: string }[] = [];

  constructor(
    goal: string,
    private readonly opts: {
      writeTask: boolean;
      /** Files that other files depend on (digital twin): path → dependents. */
      dependents?: (path: string) => string[];
      /** Paths that have stored regression checks. */
      regressionPaths?: Set<string>;
    } = { writeTask: true },
  ) {
    this.goalWords = new Set(keywords(goal, 60));
  }

  private raise(a: ShadowAlert, key: string = a.kind) {
    if (this.raised.has(key)) return;
    this.raised.add(key);
    this.pending.push(a);
  }

  observeTool(name: string, args: Record<string, unknown>, ok: boolean, output: string): void {
    const sig = `${name}:${JSON.stringify(args).slice(0, 400)}`;
    const path =
      typeof args.path === 'string' ? args.path : typeof args.target === 'string' ? args.target : '';
    if (!ok) {
      this.consecutiveErrors++;
      this.toolErrors.push({ tool: name, error: output.slice(0, 300) });
      const n = (this.failures.get(sig) ?? 0) + 1;
      this.failures.set(sig, n);
      if (n >= 2)
        this.raise(
          {
            kind: 'repeat-failure',
            severity: 'warn',
            message: `${name} failed twice with the same arguments — change approach instead of repeating it (read the error: ${output.slice(0, 160)}).`,
          },
          `repeat:${sig}`,
        );
      if (this.consecutiveErrors >= 3)
        this.raise({
          kind: 'stuck',
          severity: 'warn',
          message:
            '3 tool errors in a row: apply the recovery plan (smaller step, other tool, or deliver PARTIAL with what is verified).',
        });
    } else this.consecutiveErrors = 0;
    if (VERIFY_TOOLS.test(name) && ok && !/^filesystem\.read/.test(name)) this.verified = true;
    if (WRITE_TOOLS.test(name)) {
      this.wrote = true;
      this.readStreak = 0;
      if (path) this.written.push(path);
      if (/^uploads\//.test(path) && /filesystem\.(write|edit|delete|move)/.test(name))
        this.raise(
          {
            kind: 'source-altered',
            severity: 'critical',
            message: `The user's source file ${path} is being modified. Never alter source data: write results to outputs/ instead (restore it if needed).`,
          },
          `src:${path}`,
        );
      const deps = path ? (this.opts.dependents?.(path) ?? []) : [];
      if (deps.length)
        this.raise(
          {
            kind: 'dependents',
            severity: 'info',
            message: `${path} is used by ${deps.slice(0, 6).join(', ')} — re-test them after this change.`,
          },
          `deps:${path}`,
        );
      if (path && this.opts.regressionPaths?.has(path))
        this.raise(
          {
            kind: 'regression',
            severity: 'info',
            message: `${path} has stored regression checks from earlier missions: run regression.run before delivering.`,
          },
          `reg:${path}`,
        );
    } else {
      if (path) this.read.push(path);
      this.readStreak++;
      if (this.opts.writeTask && this.readStreak >= 10)
        this.raise(
          {
            kind: 'no-progress',
            severity: 'info',
            message:
              '10 read-only actions in a row: you have enough context — start producing the deliverable.',
          },
          `np:${Math.floor(this.readStreak / 10)}`,
        );
    }
    // Drift: tool targets and arguments unrelated to the goal.
    const words = keywords(`${name} ${JSON.stringify(args).slice(0, 600)}`);
    const overlap = words.filter((w) => this.goalWords.has(w)).length;
    this.offTopic = overlap === 0 && words.length > 3 ? this.offTopic + 1 : 0;
    this.drift = Math.min(1, this.offTopic / 6);
    if (this.offTopic >= 6)
      this.raise({
        kind: 'drift',
        severity: 'warn',
        message:
          'The last actions seem unrelated to the original goal: re-read the request and refocus (implicit scope change?).',
      });
  }

  /** Called with the final answer: a claim of verification without any verification tool is flagged. */
  observeFinal(text: string): void {
    if (
      !this.verified &&
      /\b(test[ée]e?s?|v[ée]rifi[ée]e?s?|valid[ée]e?s?|tested|verified|fonctionne parfaitement|works)\b/i.test(
        text,
      )
    )
      this.raise({
        kind: 'unverified-claim',
        severity: 'warn',
        message:
          'The answer claims something was tested / verified, but no verification tool was run. Verify for real (code.run, terminal, browser, data.query) or remove the claim.',
      });
  }
  get didVerify(): boolean {
    return this.verified;
  }
  get didWrite(): boolean {
    return this.wrote;
  }
  /** New alerts since the last call. */
  take(): ShadowAlert[] {
    const a = this.pending;
    this.pending = [];
    return a;
  }
}

export function shadowMessage(alerts: ShadowAlert[]): string {
  return `[SHADOW AGENT — independent monitor]\n${alerts.map((a) => `- (${a.severity}) ${a.message}`).join('\n')}`;
}

// ════════════════════════════════════════════════════════════════════════
// 5. EVIDENCE & UNCERTAINTY
// ════════════════════════════════════════════════════════════════════════

const digits = (s: string) => s.replace(/[\s\u00a0\u202f]/g, '').replace(/,/g, '.');
/**
 * Figures of the answer that appear in no tool result (likely invented or
 * mis-copied). Ignores years, small integers, list numbers and dates.
 */
export function unsupportedNumbers(answer: string, evidence: string[], max = 12): string[] {
  const corpus = evidence.map(digits).join('\n');
  const corpusPlain = evidence.join('\n').replace(/[\s\u00a0\u202f]/g, '');
  const found = new Set<string>();
  const re =
    /(?<![\w.,/-])(\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(%|k|m|md|mds|millions?|milliards?)?(?![\w/-])/gi;
  for (const m of answer.matchAll(re)) {
    const raw = m[1]!;
    const n = Number(digits(raw));
    if (!Number.isFinite(n)) continue;
    if (Number.isInteger(n) && n < 100 && !m[2]) continue; // small counts, list items
    if (Number.isInteger(n) && n >= 1900 && n <= 2100 && !/\s/.test(raw)) continue; // years
    const d = digits(raw);
    const variants = [
      d,
      d.replace(/\.0+$/, ''),
      String(n),
      n.toFixed(2),
      n.toFixed(1),
      raw.replace(/[\s\u00a0\u202f]/g, ''),
    ];
    if (variants.some((v) => corpus.includes(v) || corpusPlain.includes(v))) continue;
    // Percentages may be computed from a ratio (0.125 ↔ 12.5 %).
    if (m[2] === '%' && (corpus.includes(String(n / 100)) || corpus.includes((n / 100).toFixed(3)))) continue;
    found.add(raw + (m[2] ? ` ${m[2]}` : ''));
    if (found.size >= max) break;
  }
  return [...found];
}

/** Share of the report's claims that cite a source and are not "unknown". */
export function evidenceScore(r: MissionReport): number {
  const ev = r.evidence ?? [];
  if (!ev.length) return 0;
  const w = { certain: 1, probable: 0.7, uncertain: 0.35, unknown: 0 };
  return (
    ev.reduce((s, e) => s + w[e.level] * (e.source && e.source !== 'non précisée' ? 1 : 0.3), 0) / ev.length
  );
}

// ════════════════════════════════════════════════════════════════════════
// 6. ADVERSARIAL ENGINE
// ════════════════════════════════════════════════════════════════════════

export const ADVERSARIAL_TASK = (
  goal: string,
  report: MissionReport,
  unsupported: string[],
) => `You are the RED TEAM of this mission. Your job is to try to prove the result is WRONG, INCOMPLETE or FRAGILE — with evidence, never by inventing defects.
Goal:
${goal.slice(0, 3000)}

Claimed result (${report.status}): ${report.summary.slice(0, 2500)}
Deliverables: ${report.deliverables.join(', ') || '(none listed)'}
${unsupported.length ? `Figures that appear in no tool result so far: ${unsupported.join(', ')}` : ''}

Do, with tools: recompute 2–3 key figures independently (data.query / code.run), open the deliverables, test edge cases / extreme parameters, check sources and the logic of the conclusions independently of the path that produced them.
Answer format:
CONFIDENCE: <0-100>%
BLOCKING: <one line per problem that changes the conclusion or breaks a deliverable> (omit if none)
MINOR: <one line per non-blocking weakness>
COUNTEREXAMPLES: <scenarios that would invert the conclusion, if any>`;

export function parseChallenge(text: string): {
  blocking: string[];
  minor: string[];
  confidence: number | null;
} {
  const lines = text.split('\n').map((l) => l.trim());
  const pick = (k: string) =>
    lines
      .filter((l) => new RegExp(`^[-*\\s]*${k}\\s*:`, 'i').test(l))
      .map((l) => l.replace(new RegExp(`^[-*\\s]*${k}\\s*:\\s*`, 'i'), ''))
      .filter((l) => l && !/^(none|aucun|n\/a|-)\.?$/i.test(l));
  const c = /CONFIDENCE\s*:\s*(\d{1,3})/i.exec(text);
  return {
    blocking: pick('BLOCKING'),
    minor: pick('MINOR'),
    confidence: c ? Math.min(100, Number(c[1])) : null,
  };
}

// ════════════════════════════════════════════════════════════════════════
// 7. INTELLIGENT COMPRESSION (+ resume summary)
// ════════════════════════════════════════════════════════════════════════

interface Msg {
  role: string;
  content?: unknown;
  tool_calls?: { function: { name: string; arguments: string } }[];
}
const textOf = (c: unknown): string =>
  typeof c === 'string'
    ? c
    : Array.isArray(c)
      ? c
          .map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text: string }).text) : ''))
          .join(' ')
      : '';

/** Structured summary of a long trajectory: facts, decisions, failures, files, state. */
export function compressTrajectory(msgs: Msg[], goal: string): string {
  const read = new Set<string>();
  const written = new Set<string>();
  const failed: string[] = [];
  const succeeded: string[] = [];
  const decisions: string[] = [];
  const facts: string[] = [];
  let lastAssistant = '';
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]!;
    if (m.role === 'assistant') {
      const t = textOf(m.content);
      if (t) lastAssistant = t;
      for (const s of t.split(/(?<=[.!?])\s+/))
        if (
          /\b(je vais|j'ai décidé|décid|choisi|I will|decided|chose|approach|approche)\b/i.test(s) &&
          s.length < 300
        )
          decisions.push(s.trim());
      for (const c of m.tool_calls ?? []) {
        const name = c.function.name.replace(/__/g, '.');
        let a: Record<string, unknown> = {};
        try {
          a = JSON.parse(c.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          /* ignore */
        }
        const p = typeof a.path === 'string' ? a.path : '';
        if (p) (WRITE_TOOLS.test(name) ? written : read).add(p);
        const res = msgs.slice(i + 1, i + 1 + (m.tool_calls?.length ?? 1)).find((x) => x.role === 'tool');
        const rt = textOf(res?.content);
        if (/^Error|Denied/.test(rt)) failed.push(`${name}${p ? ` ${p}` : ''}: ${rt.slice(0, 160)}`);
        else if (WRITE_TOOLS.test(name) || /code\.run|terminal|data\.query|apex\.qa/.test(name))
          succeeded.push(`${name}${p ? ` ${p}` : ''}`);
        if (/data\.(query|inspect)|code\.run/.test(name) && rt)
          facts.push(`${name}: ${rt.replace(/\s+/g, ' ').slice(0, 220)}`);
      }
    }
  }
  const cap = (a: string[], n: number) => [...new Set(a)].slice(-n);
  return [
    `[COMPRESSED CONTEXT — earlier steps of this task]`,
    `Goal: ${goal.slice(0, 600)}`,
    facts.length
      ? `Facts obtained:\n${cap(facts, 12)
          .map((x) => `- ${x}`)
          .join('\n')}`
      : '',
    decisions.length
      ? `Decisions:\n${cap(decisions, 8)
          .map((x) => `- ${x}`)
          .join('\n')}`
      : '',
    succeeded.length
      ? `Done successfully:\n${cap(succeeded, 15)
          .map((x) => `- ${x}`)
          .join('\n')}`
      : '',
    failed.length
      ? `Failed approaches (do not repeat):\n${cap(failed, 8)
          .map((x) => `- ${x}`)
          .join('\n')}`
      : '',
    read.size ? `Files read: ${cap([...read], 25).join(', ')}` : '',
    written.size ? `Files written: ${cap([...written], 25).join(', ')}` : '',
    lastAssistant ? `Current state (last message): ${lastAssistant.slice(0, 700)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ════════════════════════════════════════════════════════════════════════
// 8. KNOWLEDGE GRAPH
// ════════════════════════════════════════════════════════════════════════

export interface KNode {
  id: string;
  kind: 'mission' | 'file' | 'model' | 'agent' | 'decision';
  label: string;
}
export interface KEdge {
  from: string;
  to: string;
  rel: 'read' | 'wrote' | 'used-model' | 'used-agent' | 'decided' | 'mentions';
}
export interface KGraph {
  nodes: Map<string, KNode>;
  edges: KEdge[];
}

export function buildGraph(l: Ledger, decisionsMd = '', files: string[] = []): KGraph {
  const nodes = new Map<string, KNode>();
  const edges: KEdge[] = [];
  const add = (n: KNode) => (nodes.has(n.id) ? nodes.get(n.id)! : (nodes.set(n.id, n), n));
  for (const f of files) add({ id: `file:${f}`, kind: 'file', label: f });
  for (const e of l.entries) {
    const m = add({
      id: `mission:${e.id}`,
      kind: 'mission',
      label: `${new Date(e.at).toISOString().slice(0, 10)} ${e.verdict} — ${e.goal.slice(0, 100)}`,
    });
    add({ id: `model:${e.model}`, kind: 'model', label: e.model });
    edges.push({ from: m.id, to: `model:${e.model}`, rel: 'used-model' });
    for (const a of e.team) {
      add({ id: `agent:${a}`, kind: 'agent', label: a });
      edges.push({ from: m.id, to: `agent:${a}`, rel: 'used-agent' });
    }
    for (const f of e.files.read) {
      add({ id: `file:${f}`, kind: 'file', label: f });
      edges.push({ from: m.id, to: `file:${f}`, rel: 'read' });
    }
    for (const f of e.files.written) {
      add({ id: `file:${f}`, kind: 'file', label: f });
      edges.push({ from: m.id, to: `file:${f}`, rel: 'wrote' });
    }
  }
  decisionsMd
    .split('\n')
    .filter((l2) => /^\s*[-*#]/.test(l2) && l2.trim().length > 8)
    .forEach((line, i) => {
      const d = add({
        id: `decision:${i}`,
        kind: 'decision',
        label: line.replace(/^\s*[-*#]+\s*/, '').slice(0, 200),
      });
      for (const f of files)
        if (line.includes(f.split('/').pop()!)) edges.push({ from: d.id, to: `file:${f}`, rel: 'mentions' });
    });
  return { nodes, edges };
}

/** Finds nodes matching the query and explains their links (why / what / who). */
export function queryGraph(g: KGraph, q: string, max = 12): string {
  const words = keywords(q, 10);
  const hits = [...g.nodes.values()]
    .map((n) => ({
      n,
      s: words.filter((w) => n.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(w)).length,
    }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max);
  if (!hits.length) return 'Nothing in the knowledge graph matches this query yet.';
  return hits
    .map(({ n }) => {
      const out = g.edges.filter((e) => e.from === n.id).map((e) => `${e.rel} → ${g.nodes.get(e.to)?.label}`);
      const inn = g.edges.filter((e) => e.to === n.id).map((e) => `${g.nodes.get(e.from)?.label} —${e.rel}→`);
      return `● [${n.kind}] ${n.label}${out.length ? `\n  ${out.slice(0, 8).join('\n  ')}` : ''}${inn.length ? `\n  ${inn.slice(0, 8).join('\n  ')}` : ''}`;
    })
    .join('\n');
}

// ════════════════════════════════════════════════════════════════════════
// 9. DIGITAL TWIN + FUNCTIONAL DIFF
// ════════════════════════════════════════════════════════════════════════

export interface Twin {
  files: number;
  byKind: Record<string, number>;
  deps: Record<string, string[]>;
  dependents: Record<string, string[]>;
  symbols: Record<string, string[]>;
}
const kindOf = (p: string) =>
  /\.(html?)$/i.test(p)
    ? 'page'
    : /\.(m?[jt]sx?)$/i.test(p)
      ? 'code'
      : /\.py$/i.test(p)
        ? 'python'
        : /\.(csv|tsv|xlsx?|xlsm|xlsb|json)$/i.test(p)
          ? 'data'
          : /\.(md|docx?|pdf|pptx?)$/i.test(p)
            ? 'document'
            : /\.(png|jpe?g|svg|gif|webp)$/i.test(p)
              ? 'image'
              : 'other';

export function symbolsOf(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function|class|def)\s+([A-Za-z_$][\w$]*)/g,
  ))
    out.add(m[1]!);
  for (const m of text.matchAll(
    /(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function|[A-Za-z_$][\w$]*\s*=>)/g,
  ))
    out.add(m[1]!);
  return [...out];
}

/** Functional model of the workspace: components, dependencies, symbols. */
export function buildTwin(files: { path: string; text: string | null }[]): Twin {
  const paths = files.map((f) => f.path);
  const byName = new Map<string, string[]>();
  for (const p of paths) {
    const n = p.split('/').pop()!;
    byName.set(n, [...(byName.get(n) ?? []), p]);
  }
  const deps: Record<string, string[]> = {};
  const symbols: Record<string, string[]> = {};
  const byKind: Record<string, number> = {};
  for (const f of files) {
    const k = kindOf(f.path);
    byKind[k] = (byKind[k] ?? 0) + 1;
    if (!f.text || f.text.length > 2_000_000) continue;
    if (k === 'code' || k === 'python' || k === 'page') symbols[f.path] = symbolsOf(f.text).slice(0, 80);
    const refs = new Set<string>();
    for (const m of f.text.matchAll(
      /(?:import\s[^'"]*from\s*|import\s*\(|require\(|src=|href=|readFile\(|read_(?:csv|excel)\(|open\()\s*["'`]([^"'`]+)["'`]/g,
    ))
      refs.add(m[1]!);
    // Plain mentions of other workspace files by name (data files used by scripts / apps).
    for (const [n, ps] of byName)
      if (n.length > 4 && f.text.includes(n) && !ps.includes(f.path)) ps.forEach((p) => refs.add(p));
    const resolved = [...refs]
      .map((r) => {
        const clean = r.replace(/^\.\//, '').replace(/\?.*$/, '');
        const base = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : '';
        const cands = [
          clean,
          base + clean,
          `${base + clean}.ts`,
          `${base + clean}.js`,
          ...(byName.get(clean.split('/').pop()!) ?? []),
        ];
        return cands.find((c) => paths.includes(c));
      })
      .filter((x): x is string => Boolean(x) && x !== f.path);
    if (resolved.length) deps[f.path] = [...new Set(resolved)];
  }
  const dependents: Record<string, string[]> = {};
  for (const [from, tos] of Object.entries(deps))
    for (const t of tos) dependents[t] = [...(dependents[t] ?? []), from];
  return { files: files.length, byKind, deps, dependents, symbols };
}

export function twinSummary(t: Twin, max = 40): string {
  const kinds = Object.entries(t.byKind)
    .map(([k, n]) => `${k}: ${n}`)
    .join(', ');
  const hubs = Object.entries(t.dependents)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([p, d]) => `${p} ← ${d.length} (${d.slice(0, 4).join(', ')})`);
  const edges = Object.entries(t.deps)
    .slice(0, max)
    .map(([p, d]) => `${p} → ${d.join(', ')}`);
  return `Digital twin: ${t.files} files (${kinds}).\nMost depended-on: ${hubs.join(' · ') || 'none'}\nDependencies:\n${edges.join('\n') || '(none detected)'}`;
}

/** Transitive impact of changing a file (what must be re-tested). */
export function impactOf(t: Twin, path: string): string[] {
  const out = new Set<string>();
  const stack = [path];
  while (stack.length) {
    const p = stack.pop()!;
    for (const d of t.dependents[p] ?? [])
      if (!out.has(d)) {
        out.add(d);
        stack.push(d);
      }
  }
  return [...out];
}

export interface FileChange {
  path: string;
  status: 'added' | 'removed' | 'modified';
  linesAdded: number;
  linesRemoved: number;
  symbolsAdded: string[];
  symbolsRemoved: string[];
}
/** Line-level counts with a multiset comparison (fast, order-insensitive). */
function lineDelta(a: string, b: string): { added: number; removed: number } {
  const count = (s: string) => {
    const m = new Map<string, number>();
    for (const l of s.split('\n')) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  const A = count(a);
  const B = count(b);
  let added = 0;
  let removed = 0;
  for (const [l, n] of B) added += Math.max(0, n - (A.get(l) ?? 0));
  for (const [l, n] of A) removed += Math.max(0, n - (B.get(l) ?? 0));
  return { added, removed };
}

/** Technical changes → functional changes (functions, behaviours, impacts, tests to run). */
export function functionalDiff(
  before: Record<string, string | null>,
  after: Record<string, string | null>,
  twin?: Twin,
): { changes: FileChange[]; summary: string } {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changes: FileChange[] = [];
  for (const p of paths) {
    const a = before[p] ?? null;
    const b = after[p] ?? null;
    if (a === b) continue;
    const sa = a ? symbolsOf(a) : [];
    const sb = b ? symbolsOf(b) : [];
    const d = lineDelta(a ?? '', b ?? '');
    changes.push({
      path: p,
      status: a === null ? 'added' : b === null ? 'removed' : 'modified',
      linesAdded: d.added,
      linesRemoved: d.removed,
      symbolsAdded: sb.filter((s) => !sa.includes(s)),
      symbolsRemoved: sa.filter((s) => !sb.includes(s)),
    });
  }
  const impacted = twin
    ? [...new Set(changes.flatMap((c) => impactOf(twin, c.path)))].filter(
        (p) => !changes.some((c) => c.path === p),
      )
    : [];
  const lines = changes.map((c) => {
    const what =
      c.status === 'added'
        ? 'nouveau fichier'
        : c.status === 'removed'
          ? 'supprimé'
          : `+${c.linesAdded} / −${c.linesRemoved} lignes`;
    const sym = [
      c.symbolsAdded.length ? `fonctions ajoutées : ${c.symbolsAdded.slice(0, 8).join(', ')}` : '',
      c.symbolsRemoved.length ? `fonctions supprimées : ${c.symbolsRemoved.slice(0, 8).join(', ')}` : '',
    ].filter(Boolean);
    return `- ${c.path} (${kindOf(c.path)}) — ${what}${sym.length ? ` — ${sym.join(' ; ')}` : ''}`;
  });
  const risky = changes.filter((c) => c.symbolsRemoved.length || c.status === 'removed');
  return {
    changes,
    summary: [
      `${changes.length} fichier(s) touché(s) : ${changes.filter((c) => c.status === 'added').length} ajouté(s), ${changes.filter((c) => c.status === 'modified').length} modifié(s), ${changes.filter((c) => c.status === 'removed').length} supprimé(s).`,
      ...lines,
      impacted.length ? `Composants impactés (à re-tester) : ${impacted.join(', ')}` : '',
      risky.length
        ? `Risques : suppressions dans ${risky.map((c) => c.path).join(', ')} — vérifier les appelants.`
        : '',
      `Tests nécessaires : ${[...new Set(changes.map((c) => (kindOf(c.path) === 'page' ? `ouvrir ${c.path} dans le navigateur` : kindOf(c.path) === 'data' ? `relire ${c.path} (data.inspect)` : kindOf(c.path) === 'code' || kindOf(c.path) === 'python' ? `exécuter ${c.path}` : `relire ${c.path}`)))].slice(0, 10).join(' ; ') || 'aucun'}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

// ════════════════════════════════════════════════════════════════════════
// 10. DECISION SIMULATOR / COUNTERFACTUALS / INFORMATION VALUE
// ════════════════════════════════════════════════════════════════════════

/** Safe arithmetic evaluator: + − × ÷ ^, parentheses, variables, min/max/abs/sqrt/log/exp/round. */
export function evalFormula(expr: string, vars: Record<string, number>): number {
  const toks = expr.match(/\d+(?:\.\d+)?(?:e[+-]?\d+)?|[A-Za-z_]\w*|[-+*/^(),]/gi);
  if (!toks || toks.join('') !== expr.replace(/\s+/g, '')) throw new Error(`Formule invalide : ${expr}`);
  let i = 0;
  const fns: Record<string, (...a: number[]) => number> = {
    min: Math.min,
    max: Math.max,
    abs: Math.abs,
    sqrt: Math.sqrt,
    log: Math.log,
    exp: Math.exp,
    round: Math.round,
  };
  const peek = () => toks[i];
  const eat = (t?: string) => {
    const v = toks[i++];
    if (t && v !== t) throw new Error(`« ${t} » attendu dans ${expr}`);
    return v;
  };
  const prim = (): number => {
    const t = eat();
    if (t === undefined) throw new Error('Formule incomplète');
    if (t === '(') {
      const v = add();
      eat(')');
      return v;
    }
    if (t === '-') return -prim();
    if (t === '+') return prim();
    if (/^\d/.test(t)) return Number(t);
    if (fns[t] && peek() === '(') {
      eat('(');
      const args = [add()];
      while (peek() === ',') {
        eat(',');
        args.push(add());
      }
      eat(')');
      return fns[t]!(...args);
    }
    if (t in vars) return vars[t]!;
    throw new Error(`Variable inconnue : ${t}`);
  };
  const pow = (): number => {
    const b = prim();
    return peek() === '^' ? (eat(), b ** pow()) : b;
  };
  const mul = (): number => {
    let v = pow();
    while (peek() === '*' || peek() === '/') v = eat() === '*' ? v * pow() : v / pow();
    return v;
  };
  const add = (): number => {
    let v = mul();
    while (peek() === '+' || peek() === '-') v = eat() === '+' ? v + mul() : v - mul();
    return v;
  };
  const r = add();
  if (i !== toks.length) throw new Error(`Formule invalide près de « ${toks[i]} »`);
  return r;
}

export interface DecisionInput {
  /** Outcome formula using the variables, e.g. "revenue - cost - loss_rate*exposure". */
  formula: string;
  /** Higher is better (default) or lower is better. */
  goal?: 'max' | 'min';
  options: { name: string; vars: Record<string, number> }[];
  /** Multipliers applied to variables per scenario; defaults provided. */
  scenarios?: { name: string; shocks: Record<string, number>; probability?: number }[];
}

export function simulateDecision(d: DecisionInput): string {
  const scen = d.scenarios?.length
    ? d.scenarios
    : [
        { name: 'optimiste', shocks: {}, probability: 0.2 },
        { name: 'central', shocks: {}, probability: 0.5 },
        { name: 'stress', shocks: {}, probability: 0.25 },
        { name: 'échec', shocks: {}, probability: 0.05 },
      ];
  const better = (a: number, b: number) => (d.goal === 'min' ? a < b : a > b);
  const varsOf = (o: DecisionInput['options'][number], s: (typeof scen)[number]) =>
    Object.fromEntries(Object.entries(o.vars).map(([k, v]) => [k, v * (s.shocks[k] ?? 1)]));
  const table = d.options.map((o) => {
    const vals = scen.map((s) => evalFormula(d.formula, varsOf(o, s)));
    const pr = scen.map((s) => s.probability ?? 1 / scen.length);
    const tot = pr.reduce((a, b) => a + b, 0) || 1;
    const expected = vals.reduce((a, v, i) => a + v * pr[i]!, 0) / tot;
    const worst = d.goal === 'min' ? Math.max(...vals) : Math.min(...vals);
    return { o, vals, expected, worst };
  });
  const ranked = [...table].sort((a, b) => (better(a.expected, b.expected) ? -1 : 1));
  const best = ranked[0]!;
  const second = ranked[1];
  // Sensitivity + counterfactual: change of each variable of the best option that flips the ranking.
  const sens: string[] = [];
  const central = scen.find((s) => s.name === 'central') ?? scen[0]!;
  if (second) {
    const target = evalFormula(d.formula, varsOf(second.o, central));
    for (const k of Object.keys(best.o.vars)) {
      const base = varsOf(best.o, central);
      const at = (f: number) => evalFormula(d.formula, { ...base, [k]: base[k]! * f });
      const delta10 = at(1.1) - at(1);
      let flip: number | null = null;
      for (const f of [0.95, 0.9, 0.8, 0.7, 0.5, 0.25, 0, 1.05, 1.1, 1.2, 1.3, 1.5, 2, 3, 5]) {
        if (!better(at(f), target)) {
          flip = f;
          break;
        }
      }
      sens.push(
        `- ${k}: +10 % ⇒ résultat ${delta10 >= 0 ? '+' : ''}${delta10.toFixed(2)}${flip !== null ? ` · la décision s'inverse si ${k} est multiplié par ${flip} (${((flip - 1) * 100).toFixed(0)} %)` : ' · ne renverse pas la décision dans [0 ; ×5]'}`,
      );
    }
  }
  const fmt = (n: number) =>
    Math.abs(n) >= 1000
      ? Math.round(n)
          .toLocaleString('fr-FR')
          .replace(/[\u202f\u00a0]/g, ' ')
      : n.toFixed(2);
  return [
    `Formule : ${d.formula} (${d.goal === 'min' ? 'minimiser' : 'maximiser'})`,
    `| Option | ${scen.map((s) => s.name).join(' | ')} | Espérance | Pire cas |`,
    `|---|${scen.map(() => '---').join('|')}|---|---|`,
    ...table.map(
      (t) => `| ${t.o.name} | ${t.vals.map(fmt).join(' | ')} | ${fmt(t.expected)} | ${fmt(t.worst)} |`,
    ),
    '',
    `Meilleure option (espérance) : **${best.o.name}**${second ? ` devant ${second.o.name}` : ''}.`,
    sens.length
      ? `Variables critiques et contrefactuels (scénario ${central.name}) :\n${sens.join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface InfoItem {
  question: string;
  /** 0..1: how much the answer could change the decision. */
  impact: number;
  /** 0..1: how uncertain we currently are. */
  uncertainty: number;
  /** Cost to obtain it (minutes, $, any consistent unit). */
  cost: number;
}
/** Ranks what to find out first: expected value of information per unit of cost. */
export function rankInformation(items: InfoItem[]): string {
  const r = items
    .map((x) => ({
      ...x,
      value:
        (Math.min(1, Math.max(0, x.impact)) * Math.min(1, Math.max(0, x.uncertainty))) /
        Math.max(0.01, x.cost),
    }))
    .sort((a, b) => b.value - a.value);
  return r
    .map(
      (x, i) =>
        `${i + 1}. ${x.question} — valeur ${x.value.toFixed(3)} (impact ${x.impact}, incertitude ${x.uncertainty}, coût ${x.cost})${i === 0 ? ' ← à obtenir en premier' : ''}`,
    )
    .join('\n');
}

// ════════════════════════════════════════════════════════════════════════
// 11. PERSONAL OPERATING MANUAL
// ════════════════════════════════════════════════════════════════════════

export type ManualKind = 'standard' | 'preference' | 'method' | 'forbidden' | 'favorite';
export interface ManualRule {
  id: string;
  kind: ManualKind;
  rule: string;
  at: number;
  source: 'user' | 'agent' | 'auto';
}
/** Explicit, durable instructions in a user message ("toujours…", "jamais…", "je préfère…"). */
export function detectRules(text: string): { kind: ManualKind; rule: string }[] {
  const out: { kind: ManualKind; rule: string }[] = [];
  for (const raw of text.split(/(?<=[.!?\n])\s*/)) {
    const s = raw.trim();
    if (s.length < 12 || s.length > 300) continue;
    if (/^(à partir de maintenant|désormais|dorénavant|from now on|toujours|always)\b/i.test(s))
      out.push({ kind: 'standard', rule: s });
    else if (/^(ne (\w+ )?jamais|jamais|never|n'utilise (plus )?jamais|interdit)\b/i.test(s))
      out.push({ kind: 'forbidden', rule: s });
    else if (/^(je préfère|je veux toujours|i prefer|privilégie)\b/i.test(s))
      out.push({ kind: 'preference', rule: s });
  }
  return out.slice(0, 5);
}
export function manualPrompt(rules: ManualRule[]): string {
  if (!rules.length) return '';
  const g = (k: ManualKind, t: string) => {
    const r = rules.filter((x) => x.kind === k);
    return r.length
      ? `${t}:\n${r
          .slice(-20)
          .map((x) => `- ${x.rule}`)
          .join('\n')}`
      : '';
  };
  return [
    "# PERSONAL OPERATING MANUAL (the user's own rules — they override defaults)",
    g('standard', 'Standards'),
    g('preference', 'Preferences'),
    g('method', 'Preferred methods'),
    g('favorite', 'Favourite models / workflows'),
    g('forbidden', 'Forbidden'),
  ]
    .filter(Boolean)
    .join('\n');
}

// ════════════════════════════════════════════════════════════════════════
// 12. LIVING REGRESSION SUITE
// ════════════════════════════════════════════════════════════════════════

export interface RegressionCheck {
  name: string;
  command: string;
  expect?: string;
  files: string[];
  from: string;
}
/** Re-runnable checks of successful missions, keyed by the files they protect. */
export function regressionSuite(l: Ledger): RegressionCheck[] {
  const out: RegressionCheck[] = [];
  for (const e of l.entries)
    if (e.verdict === 'PASSED')
      for (const c of e.checks)
        if (c.command && c.status === 'pass')
          out.push({
            name: c.name,
            command: c.command,
            expect: c.expect,
            files: e.files.written,
            from: e.goal.slice(0, 80),
          });
  const seen = new Set<string>();
  return out.reverse().filter((c) => (seen.has(c.command) ? false : (seen.add(c.command), true)));
}

// ════════════════════════════════════════════════════════════════════════
// 13. AUTO-BENCHMARK (representative tasks with deterministic checkers)
// ════════════════════════════════════════════════════════════════════════

export interface BenchTask {
  id: string;
  type: TaskType;
  prompt: string;
  check: (answer: string) => boolean;
}
export const BENCH_TASKS: BenchTask[] = [
  {
    id: 'arith-table',
    type: 'data',
    prompt:
      'Encours par agence (XOF) : Dakar 1 250 000 000 ; Thiès 430 500 000 ; Saint-Louis 219 750 000. Donne uniquement le total exact, au format 1 900 250 000.',
    check: (a) => /1[\s\u00a0\u202f.]?900[\s\u00a0\u202f.]?250[\s\u00a0\u202f.]?000/.test(a),
  },
  {
    id: 'ratio',
    type: 'data',
    prompt:
      'Créances douteuses : 84 millions ; encours total : 1 200 millions. Ratio NPL en pourcentage avec une décimale ? Réponds uniquement le nombre suivi de %.',
    check: (a) => /\b7[.,]0\s*%/.test(a),
  },
  {
    id: 'json-extract',
    type: 'document',
    prompt:
      'Extrait en JSON strict {"client": string, "montant": number, "echeance": "AAAA-MM-JJ"} de : « Le client SOW Mamadou doit 2 500 000 F CFA au 15 mars 2026. » Réponds seulement le JSON.',
    check: (a) => {
      try {
        const j = JSON.parse(/\{[\s\S]*\}/.exec(a)?.[0] ?? '') as {
          client?: string;
          montant?: number;
          echeance?: string;
        };
        return /sow/i.test(j.client ?? '') && j.montant === 2500000 && j.echeance === '2026-03-15';
      } catch {
        return false;
      }
    },
  },
  {
    id: 'code-fn',
    type: 'code',
    prompt:
      'Écris uniquement une fonction JavaScript nommée formatXof(n) qui renvoie un entier avec des espaces comme séparateurs de milliers (ex. 2359078494 → "2 359 078 494"), sans texte autour, dans un bloc ```js.',
    check: (a) => {
      const code = /```(?:js|javascript)?\s*([\s\S]*?)```/.exec(a)?.[1] ?? a;
      try {
        const f = new Function(`${code}\nreturn formatXof;`)() as (n: number) => string;
        return f(2359078494).replace(/[\u202f\u00a0]/g, ' ') === '2 359 078 494' && f(999).trim() === '999';
      } catch {
        return false;
      }
    },
  },
  {
    id: 'reasoning',
    type: 'chat',
    prompt:
      'Un prêt de 12 000 000 est remboursé en 24 mensualités constantes sans intérêt. Après 9 mensualités, quel capital reste dû ? Réponds uniquement le nombre.',
    check: (a) => /7[\s\u00a0\u202f.]?500[\s\u00a0\u202f.]?000/.test(a),
  },
];

export interface BenchResult {
  model: string;
  at: number;
  passed: number;
  total: number;
  cost: number;
  ms: number;
  details: { id: string; ok: boolean }[];
}
/** Regression vs the previous run of the same model. */
export function benchRegression(prev: BenchResult | undefined, cur: BenchResult): string | null {
  if (!prev) return null;
  const lost = cur.details
    .filter((d) => !d.ok && prev.details.find((p) => p.id === d.id)?.ok)
    .map((d) => d.id);
  return lost.length ? `Régression : ${lost.join(', ')} réussissai(en)t au run précédent.` : null;
}

// ════════════════════════════════════════════════════════════════════════
// 14. COMMON DOCTRINE (all agents) — « Et toute autre tâche… »
// ════════════════════════════════════════════════════════════════════════

export const RELATED_TASKS_RULE = `# « And any other task I would not have thought of » (functional rule)
Before finishing, examine the context and list the related tasks needed for the goal to really succeed, classified:
- Indispensable — needed to reach the goal correctly → do it now (within the request's scope).
- Recommended — strongly improves quality, safety, reliability or maintainability → do it if cheap, otherwise propose it.
- Optional — useful but not needed → propose it in one line.
- Forbidden without authorisation — irreversible, sensitive, financial, legal or destructive → never do it; ask.
In mission mode, report them in mission.report.related.`;

export const ENGINE_DOCTRINE = `# MASSAMBA INTELLIGENCE DOCTRINE
- Plausible is not verified: every conclusion needs evidence from a tool result, a file or a cited source; say what you could not verify.
- Separate facts (certain), inferences (probable), assumptions (uncertain) and unknowns — the user must see which is which.
- Prefer the cheapest path that reaches the required quality: reuse what worked, avoid what failed, parallelise independent reads, keep writes sequential.
- Before changing something, consider what depends on it (impact) and re-test it afterwards.
- When a decision is involved, compare options under optimistic / central / stress / failure scenarios (decision.simulate) and name the variables that would flip it.
- When information is missing, obtain first what has the highest value for its cost (info.value).
${RELATED_TASKS_RULE}`;
