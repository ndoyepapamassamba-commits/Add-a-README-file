// JEV LIVE CONTROL LOOP — the cognitive control plane DURING execution.
// The LLM thinks / creates / solves; this controller only decides / guides /
// controls between calls, from measured signals (tokens, cost, tool results,
// progress, repetition, drift). Pure and deterministic (JEV-0): it costs no
// tokens, and the runtime decides whether a remote JEV judgment is worth it.
//
// Adaptive checkpoints (not every step): first step, critical tool, budget
// threshold, error, stagnation, before a premium model, before a retry, before
// an escalation. Each checkpoint returns zero or more live decisions.
import type { Budgets } from './control';
import { estTokens } from './context';
import type { JevMode } from './tools';

export type LiveAction =
  | 'CONTINUE'
  | 'STOP'
  | 'COMPRESS'
  | 'REPLAN'
  | 'RETRY'
  | 'RETRY_TARGETED'
  | 'SWITCH_MODEL'
  | 'SWITCH_AGENT'
  | 'ADD_TOOL'
  | 'REMOVE_TOOL'
  | 'ADD_CONTEXT'
  | 'REMOVE_CONTEXT'
  | 'LOWER_REASONING'
  | 'RAISE_REASONING'
  | 'ESCALATE'
  | 'ASK_USER';

export type CheckpointKind =
  | 'first_step'
  | 'critical_tool'
  | 'budget_threshold'
  | 'error'
  | 'stagnation'
  | 'before_premium'
  | 'before_retry'
  | 'before_escalation'
  | 'drift'
  | 'final';

export interface LiveDecision {
  action: LiveAction;
  reason: string;
  tool?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high';
}
export interface LiveCheckpoint {
  kind: CheckpointKind;
  step: number;
  at: number;
  /** Time spent deciding (ms) — part of the JEV overhead. */
  ms: number;
  decisions: LiveDecision[];
}

export interface LadderModel {
  id: string;
  /** USD per million input tokens (0 = unknown). */
  inputPrice: number;
  pSuccess: number;
}

export interface MissionState {
  goal: string;
  status: 'running' | 'paused' | 'stopped' | 'done';
  step: number;
  model: string;
  strategy: string;
  effort: string;
  tokens: number;
  cost: number;
  elapsedMs: number;
  /** Dynamic token budget: stage index (B0, B1…) and its ceiling. */
  budgetStage: number;
  budgetTokens: number;
  budgetLeftTokens: number;
  costBudget: number | null;
  /** 0..1, estimated from new information per step (never a model claim). */
  progress: number;
  /** 0..1, share of recent activity unrelated to the goal. */
  drift: number;
  stagnation: number;
  quality: number | null;
  toolsOffered: string[];
  toolsUsed: string[];
  failures: string[];
  /** Short facts learnt during the run (tool results, files written) — used for handoffs. */
  facts: string[];
  lastDecision: string;
  /** Level actually used for live control (auto-downgraded to 0 when JEV costs more than it saves). */
  level: number;
  overheadMs: number;
  /** Tokens avoided by live decisions (pruned context, removed tool definitions). */
  savedTokens: number;
}

const STAGES = [0.5, 1, 1.6, 2.4];
const CORE_TOOL =
  /^(filesystem\.(list|read|search)|mission\.|agent\.delegate$|skill\.|tools\.request$|plan\.)/;
const CRITICAL_TOOL =
  /^(filesystem\.(write|edit|delete)|terminal\.execute|code\.run|browser\.(click|type|upload)|report\.export|apex\.build_app|timemachine\.restore)$/;
const STOP_WORDS = new Set(
  'les des une pour avec dans sur par est sont aux que qui quoi the and with for this that from your vous nous elle ils mais plus tout faire fais peux'.split(
    ' ',
  ),
);
export const keywords = (t: string) =>
  new Set(
    (
      t
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .match(/[a-z0-9_.]{4,}/g) ?? []
    ).filter((w) => !STOP_WORDS.has(w)),
  );

export interface LiveInit {
  goal: string;
  budgets: Budgets;
  mode: JevMode;
  model: string;
  strategy: string;
  effort: MissionState['effort'];
  /** Models cheaper → dearer (the routing ladder, current model included). */
  ladder: LadderModel[];
  critical: boolean;
  mission: boolean;
  difficulty: number;
  offered: string[];
  /** Tokens of one tool definition (avg), to value REMOVE_TOOL. */
  toolDefTokens: Record<string, number>;
  level: number;
  /** Stop the run when the token / time budget is exhausted (default: no — compress and continue; the cost budget always stops). */
  hardStops?: boolean;
  now?: () => number;
}

/** The live controller of one run. */
export class LiveController {
  readonly checkpoints: LiveCheckpoint[] = [];
  private s: MissionState;
  private goalKw: Set<string>;
  private seen = new Set<string>();
  private lastSigs: string[] = [];
  private toolStats = new Map<string, { ok: number; fail: number; calls: number }>();
  private cleanToolSteps = 0;
  private replans = 0;
  private lastOutputs: string[] = [];
  private stageProgress = 0;
  private expectedSteps: number;
  private now: () => number;
  private t0: number;
  private jevCostUsd = 0;
  private switched = 0;
  private consecFail = 0;
  private overNoted = false;
  private lastDowngrade = -99;
  private hist: { tokensIn: number; progress: number }[] = [];
  private lastDrift = -99;
  /** ECONOMIC_DRIFT events detected during the run (recorded in the JEV_LOG). */
  readonly driftEvents: string[] = [];

  constructor(private readonly o: LiveInit) {
    this.now = o.now ?? Date.now;
    this.t0 = this.now();
    this.goalKw = keywords(o.goal);
    this.expectedSteps = Math.max(2, Math.round((o.mission ? 8 : 3) * (0.6 + o.difficulty)));
    const b0 = Math.round(o.budgets.tokens * STAGES[0]!);
    this.s = {
      goal: o.goal.slice(0, 400),
      status: 'running',
      step: 0,
      model: o.model,
      strategy: o.strategy,
      effort: o.effort,
      tokens: 0,
      cost: 0,
      elapsedMs: 0,
      budgetStage: 0,
      budgetTokens: b0,
      budgetLeftTokens: b0,
      costBudget: o.budgets.costUsd,
      progress: 0,
      drift: 0,
      stagnation: 0,
      quality: null,
      toolsOffered: [...o.offered],
      toolsUsed: [],
      failures: [],
      facts: [],
      lastDecision: 'CONTINUE',
      level: o.level,
      overheadMs: 0,
      savedTokens: 0,
    };
  }

  state(): MissionState {
    return {
      ...this.s,
      elapsedMs: this.now() - this.t0,
      toolsOffered: [...this.s.toolsOffered],
      facts: [...this.s.facts],
    };
  }

  private mark(kind: CheckpointKind, t: number, decisions: LiveDecision[]): LiveCheckpoint | null {
    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t;
    this.s.overheadMs += ms;
    if (!decisions.length) return null;
    const cp = { kind, step: this.s.step, at: this.now(), ms, decisions };
    this.checkpoints.push(cp);
    this.s.lastDecision = decisions.map((d) => d.action).join(' + ');
    return cp;
  }
  private t() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  /** Records remote JEV spending (JEV-1 / JEV-3 judgments) for the overhead account. */
  addJevCost(usd: number, ms: number): void {
    this.jevCostUsd += usd;
    this.s.overheadMs += ms;
  }

  /** After each model call. */
  afterCall(o: {
    tokensIn: number;
    tokensOut: number;
    cost: number;
    content: string;
    toolCalls: { name: string; args: string }[];
    contextTokens: number;
    contextLimit: number;
    model: string;
  }): LiveCheckpoint | null {
    const t = this.t();
    const s = this.s;
    s.step++;
    s.model = o.model;
    s.tokens += o.tokensIn + o.tokensOut;
    s.cost += o.cost;
    s.budgetLeftTokens = Math.max(0, s.budgetTokens - s.tokens);
    // New information this step: unseen tool signatures + new answer content.
    let fresh = 0;
    for (const c of o.toolCalls) {
      const sig = `${c.name}:${c.args.slice(0, 160)}`;
      if (!this.seen.has(sig)) fresh++;
      this.seen.add(sig);
      this.lastSigs = [...this.lastSigs.slice(-7), sig];
    }
    const out = o.content.trim();
    const dup = out.length > 40 && this.lastOutputs.some((p) => similarity(p, out) > 0.9);
    if (out.length > 40 && !dup) fresh++;
    if (out) this.lastOutputs = [...this.lastOutputs.slice(-2), out];
    s.stagnation = fresh ? 0 : s.stagnation + 1;
    if (fresh) s.progress = Math.min(0.95, s.progress + 1 / this.expectedSteps);
    // Drift: recent activity vs goal keywords (only measurable with enough text).
    const recent = keywords(
      `${out.slice(0, 1500)} ${o.toolCalls.map((c) => `${c.name} ${c.args.slice(0, 200)}`).join(' ')}`,
    );
    if (this.goalKw.size >= 3 && recent.size >= 8) {
      const hit = [...recent].filter((w) => this.goalKw.has(w)).length;
      const d = hit === 0 ? 1 : Math.max(0, 1 - hit / Math.min(this.goalKw.size, 6));
      s.drift = Math.round((s.drift * 0.5 + d * 0.5) * 100) / 100;
    }

    const ds: LiveDecision[] = [];
    let kind: CheckpointKind = s.step === 1 ? 'first_step' : 'budget_threshold';
    // Hard stops.
    if (s.costBudget !== null && s.cost >= s.costBudget) {
      ds.push({ action: 'STOP', reason: `budget coût atteint ($${s.cost.toFixed(4)} / $${s.costBudget})` });
      return this.mark('budget_threshold', t, ds);
    }
    if (this.now() - this.t0 > this.o.budgets.timeMs && !this.o.hardStops) {
      if (!this.overNoted) {
        this.overNoted = true;
        ds.push({
          action: 'CONTINUE',
          reason: `budget temps indicatif dépassé (${Math.round(this.o.budgets.timeMs / 60000)} min) : poursuite (arrêt automatique désactivé)`,
        });
      }
    } else if (this.now() - this.t0 > this.o.budgets.timeMs) {
      ds.push({
        action: 'STOP',
        reason: `budget temps atteint (${Math.round(this.o.budgets.timeMs / 60000)} min)`,
      });
      return this.mark('budget_threshold', t, ds);
    }
    if (dup && !o.toolCalls.length) {
      ds.push({
        action: 'STOP',
        reason: 'réponse répétée à l’identique : gain marginal nul, arrêt anticipé',
      });
      return this.mark('final', t, ds);
    }
    // Dynamic token budget B0 → B1 → B2 → B3: extend only when progress justifies it.
    if (s.tokens >= s.budgetTokens) {
      const gained = s.progress - this.stageProgress;
      if (s.budgetStage < STAGES.length - 1 && (gained >= 0.15 || s.stagnation === 0)) {
        s.budgetStage++;
        s.budgetTokens = Math.round(this.o.budgets.tokens * STAGES[s.budgetStage]!);
        s.budgetLeftTokens = s.budgetTokens - s.tokens;
        this.stageProgress = s.progress;
        ds.push({
          action: 'CONTINUE',
          reason: `budget B${s.budgetStage - 1} atteint, progrès +${Math.round(gained * 100)} pts → B${s.budgetStage} = ${s.budgetTokens} tokens`,
        });
        if (o.contextTokens > o.contextLimit * 0.5)
          ds.push({ action: 'COMPRESS', reason: 'extension de budget : contexte compressé d’abord' });
      } else if (!this.o.hardStops) {
        // No automatic stop: compress and continue (stagnation still stops a real loop).
        s.budgetTokens = s.tokens + Math.round(this.o.budgets.tokens * 0.5);
        s.budgetLeftTokens = s.budgetTokens - s.tokens;
        this.stageProgress = s.progress;
        ds.push({
          action: 'COMPRESS',
          reason: `budget B${s.budgetStage} atteint (${s.tokens} tokens) : contexte compressé, poursuite (arrêt automatique désactivé)`,
        });
      } else {
        ds.push({
          action: 'STOP',
          reason:
            s.budgetStage >= STAGES.length - 1
              ? `budget final B${s.budgetStage} épuisé (${s.tokens} tokens)`
              : `budget B${s.budgetStage} épuisé sans progrès (+${Math.round(gained * 100)} pts) : extension refusée`,
        });
        return this.mark('budget_threshold', t, ds);
      }
    } else if (o.contextTokens > o.contextLimit * 0.7) {
      ds.push({ action: 'COMPRESS', reason: 'contexte > 70 % de la limite' });
    }
    // First step: reasoning level adequacy.
    if (s.step === 1 && this.o.mode !== 'max' && !this.o.critical) {
      if (this.o.difficulty < 0.35 && o.tokensOut > 3000 && !o.toolCalls.length && s.effort !== 'low') {
        s.effort = 'low';
        ds.push({
          action: 'LOWER_REASONING',
          effort: 'low',
          reason: `tâche simple (difficulté ${Math.round(this.o.difficulty * 100)} %) mais ${o.tokensOut} tokens de sortie : raisonnement abaissé`,
        });
      }
    }
    // Stagnation → REPLAN, then SWITCH_MODEL up (if worth it), then STOP.
    if (s.stagnation >= 3) {
      kind = 'stagnation';
      if (this.replans === 0) {
        this.replans++;
        s.stagnation = 0;
        ds.push({ action: 'REPLAN', reason: '3 étapes sans information nouvelle : changer d’approche' });
      } else {
        const up = this.nextUp();
        if (up && this.switched < 2) {
          ds.push({
            action: 'SWITCH_MODEL',
            model: up.id,
            reason: `stagnation persistante après replanification → ${up.id} (état de mission transmis, pas l’historique complet)`,
          });
          this.switched++;
          s.stagnation = 0;
        } else {
          ds.push({
            action: 'STOP',
            reason: 'stagnation persistante, aucun palier rentable : arrêt avec le meilleur résultat',
          });
          return this.mark('stagnation', t, ds);
        }
      }
    } else if (s.drift >= 0.85 && s.step >= 3) {
      kind = 'drift';
      ds.push({
        action: 'REPLAN',
        reason: `dérive ${Math.round(s.drift * 100)} % : activité récente sans lien avec l’objectif`,
      });
      s.drift = 0.5;
    }
    // ECONOMIC_DRIFT: more tokens per call (or more cost) without progress. `progress` is the run's own
    // information-gain indicator (new tool signatures / new answer content), NOT a quality measure.
    this.hist = [...this.hist.slice(-3), { tokensIn: o.tokensIn, progress: s.progress }];
    if (s.step >= 4 && s.step - this.lastDrift >= 3 && this.hist.length >= 4) {
      const h = this.hist;
      const growing =
        h[1]!.tokensIn > h[0]!.tokensIn && h[2]!.tokensIn > h[1]!.tokensIn && h[3]!.tokensIn > h[2]!.tokensIn;
      const growth = h[3]!.tokensIn / Math.max(1, h[0]!.tokensIn);
      const gain = h[3]!.progress - h[0]!.progress;
      const costDrift =
        s.costBudget !== null && s.cost >= 0.6 * s.costBudget && s.progress < 0.4 && s.stagnation >= 1;
      if ((growing && growth >= 1.3 && gain < 0.05) || costDrift) {
        this.lastDrift = s.step;
        const why = costDrift
          ? `coût $${s.cost.toFixed(4)} ≥ 60 % du budget $${s.costBudget} pour un progrès de ${Math.round(s.progress * 100)} %`
          : `entrée ×${growth.toFixed(1)} sur 3 appels pour un progrès de +${Math.round(gain * 100)} pts`;
        this.driftEvents.push(`étape ${s.step} : ${why}`);
        kind = 'drift';
        if (o.contextTokens > o.contextLimit * 0.4)
          ds.push({ action: 'COMPRESS', reason: `ECONOMIC_DRIFT (${why}) : contexte compressé` });
        else if (s.effort !== 'low' && this.o.mode !== 'max' && !this.o.critical) {
          s.effort = 'low';
          ds.push({
            action: 'LOWER_REASONING',
            effort: 'low',
            reason: `ECONOMIC_DRIFT (${why}) : raisonnement abaissé`,
          });
        } else ds.push({ action: 'REPLAN', reason: `ECONOMIC_DRIFT (${why}) : changer d’approche` });
        if (costDrift && !this.o.critical) {
          const down = this.nextDown();
          if (down && this.switched < 2) {
            this.switched++;
            ds.push({
              action: 'SWITCH_MODEL',
              model: down.id,
              reason: `ECONOMIC_DRIFT : modèle moins cher ${down.id}`,
            });
          }
        }
      }
    }
    // Dynamic model switch DOWN: mechanical, clean tool steps on a premium model.
    if (
      !this.o.critical &&
      (this.o.mode === 'eco' || this.o.mode === 'balanced') &&
      this.cleanToolSteps >= 3 &&
      this.switched < 2
    ) {
      const down = this.nextDown();
      if (down) {
        this.switched++;
        this.cleanToolSteps = 0;
        ds.push({
          action: 'SWITCH_MODEL',
          model: down.id,
          reason: `3 étapes outillées sans erreur : exécution mécanique → ${down.id} (moins cher)`,
        });
      }
    }
    // Tool ROI: offered for 3 calls, never used, not core → remove (definitions are re-sent every call).
    if (s.step >= 3 && this.o.mode !== 'max') {
      const unused = s.toolsOffered.filter((n) => !CORE_TOOL.test(n) && !this.toolStats.has(n));
      const drop = unused.slice(0, 12);
      if (drop.length >= 3) {
        const per = drop.reduce((a, n) => a + (this.o.toolDefTokens[n] ?? 60), 0);
        s.toolsOffered = s.toolsOffered.filter((n) => !drop.includes(n));
        for (const n of drop)
          ds.push({ action: 'REMOVE_TOOL', tool: n, reason: 'ROI nul : jamais appelé en 3 étapes' });
        ds.push({
          action: 'CONTINUE',
          reason: `${drop.length} définitions d’outils retirées (≈ ${per} tokens économisés par appel ; tools.request les rend)`,
        });
      }
    }
    return this.mark(kind, t, ds);
  }

  /** After each tool call. */
  afterTool(o: { name: string; args: string; ok: boolean; output: string }): LiveCheckpoint | null {
    const t = this.t();
    const s = this.s;
    const st = this.toolStats.get(o.name) ?? { ok: 0, fail: 0, calls: 0 };
    st.calls++;
    if (o.ok) st.ok++;
    else st.fail++;
    this.toolStats.set(o.name, st);
    if (!s.toolsUsed.includes(o.name)) s.toolsUsed.push(o.name);
    if (!s.toolsOffered.includes(o.name)) s.toolsOffered.push(o.name);
    const ds: LiveDecision[] = [];
    let kind: CheckpointKind = CRITICAL_TOOL.test(o.name) ? 'critical_tool' : 'error';
    if (o.ok) {
      this.consecFail = 0;
      this.cleanToolSteps++;
      const fact = factOf(o.name, o.args, o.output);
      if (fact && !s.facts.includes(fact)) s.facts = [...s.facts.slice(-11), fact];
      if (kind !== 'critical_tool') return this.mark(kind, t, ds);
      // Critical tool: verify that a write/exec really succeeded.
      if (/error|exception|traceback|ENOENT|permission denied/i.test(o.output.slice(0, 600)))
        ds.push({
          action: 'RETRY_TARGETED',
          tool: o.name,
          reason: `${o.name} a renvoyé une erreur dans sa sortie : corriger ce point seulement`,
        });
      return this.mark(kind, t, ds);
    }
    this.cleanToolSteps = 0;
    this.consecFail++;
    kind = 'error';
    s.failures = [...s.failures.slice(-7), `${o.name}: ${o.output.slice(0, 120)}`];
    if (st.fail >= 3) {
      s.toolsOffered = s.toolsOffered.filter((n) => n !== o.name);
      ds.push({
        action: 'REMOVE_TOOL',
        tool: o.name,
        reason: `${o.name} a échoué ${st.fail} fois : retiré, utilisez une alternative`,
      });
    } else if (this.consecFail >= 3) {
      this.consecFail = 0;
      if (s.effort !== 'high' && this.o.mode !== 'eco') {
        s.effort = 'high';
        ds.push({
          action: 'RAISE_REASONING',
          effort: 'high',
          reason: '3 erreurs consécutives : raisonnement relevé',
        });
      }
      ds.push({ action: 'REPLAN', reason: '3 erreurs d’outils consécutives : changez d’approche' });
    } else
      ds.push({
        action: 'RETRY_TARGETED',
        tool: o.name,
        reason: `échec de ${o.name} : corriger l’appel (arguments), pas toute la tâche`,
      });
    const sig = `${o.name}:${o.args.slice(0, 160)}`;
    if (this.lastSigs.filter((x) => x === sig).length >= 3)
      ds.push({ action: 'REPLAN', reason: `appel répété 3 fois à l’identique (${o.name}) : boucle évitée` });
    return this.mark(kind, t, ds);
  }

  /** Before moving to a dearer model (cascade escalation or switch up). */
  beforePremium(o: {
    model: string;
    quality: number | null;
    target: number;
    nextCost: number;
    nextSuccess: number;
  }): LiveCheckpoint {
    const t = this.t();
    const q = o.quality ?? 0;
    const gain = Math.max(0, (o.target - q) * o.nextSuccess);
    const perDollar = gain / Math.max(1e-6, o.nextCost);
    const worth = q < 95 && gain >= 5 && perDollar >= 50;
    const d: LiveDecision = worth
      ? {
          action: 'ESCALATE',
          model: o.model,
          reason: `gain attendu +${gain.toFixed(0)} pts pour ~$${o.nextCost.toFixed(4)} (${perDollar.toFixed(0)} pts/$)`,
        }
      : {
          action: 'STOP',
          reason:
            q >= 95
              ? `qualité ${q} % ≥ 95 % : pas de modèle premium`
              : `gain attendu +${gain.toFixed(0)} pts pour ~$${o.nextCost.toFixed(4)} : non rentable`,
        };
    return this.mark('before_premium', t, [d])!;
  }

  /** Before a retry / correction round. */
  beforeRetry(o: {
    quality: number | null;
    corrections: number;
    maxCorrections: number;
    blocking: number;
  }): LiveCheckpoint {
    const t = this.t();
    const d: LiveDecision =
      o.corrections >= o.maxCorrections
        ? { action: 'STOP', reason: `${o.corrections} correction(s) déjà faites : plafond atteint` }
        : o.blocking === 0
          ? { action: 'STOP', reason: 'aucun défaut bloquant : la retouche ne vaut pas son coût' }
          : {
              action: 'RETRY_TARGETED',
              reason: `${o.blocking} défaut(s) bloquant(s) : correction ciblée (pas de régénération)`,
            };
    return this.mark('before_retry', t, [d])!;
  }

  setQuality(q: number | null): void {
    this.s.quality = q;
    if (q !== null && q >= 75) this.s.progress = Math.max(this.s.progress, Math.min(1, q / 100));
  }
  setModel(id: string): void {
    this.s.model = id;
  }
  setEffort(e: MissionState['effort']): void {
    this.s.effort = e;
  }
  addSaved(tokens: number): void {
    this.s.savedTokens += Math.max(0, Math.round(tokens));
  }
  finish(status: MissionState['status']): MissionState {
    this.s.status = status;
    if (status === 'done') this.s.progress = 1;
    return this.state();
  }

  /**
   * JEV overhead: decision time and remote JEV cost vs what live control saved.
   * When JEV costs more than it saves (after a few steps), downgrade to JEV-0.
   */
  overhead(
    pricePerMTok: number,
    minRoi = 1,
  ): {
    pct: number | null;
    costUsd: number;
    savedUsd: number;
    roi: number | null;
    downgrade: boolean;
  } {
    const savedUsd = (this.s.savedTokens * pricePerMTok) / 1e6;
    const pct = this.s.cost > 0 ? this.jevCostUsd / this.s.cost : null;
    const roi = this.jevCostUsd > 0 ? savedUsd / this.jevCostUsd : null;
    // Step-wise AUTO-DOWNGRADE JEV-3 → JEV-2 → JEV-1 → JEV-0: one level at most every 2 steps, only when
    // what JEV saved (measured on this run) is below its own cost × minRoi (configurable).
    const downgrade =
      this.s.level > 0 &&
      this.s.step >= 3 &&
      this.s.step - this.lastDowngrade >= 2 &&
      this.jevCostUsd > 0 &&
      savedUsd < this.jevCostUsd * minRoi;
    if (downgrade) {
      const from = this.s.level;
      this.s.level = from - 1;
      this.lastDowngrade = this.s.step;
      this.checkpoints.push({
        kind: 'budget_threshold',
        step: this.s.step,
        at: this.now(),
        ms: 0,
        decisions: [
          {
            action: 'LOWER_REASONING',
            reason: `JEV coûte $${this.jevCostUsd.toFixed(6)} pour $${savedUsd.toFixed(6)} économisés (seuil ROI ${minRoi}) : AUTO-DOWNGRADE JEV-${from} → JEV-${from - 1}`,
          },
        ],
      });
    }
    return { pct, costUsd: this.jevCostUsd, savedUsd, roi, downgrade };
  }

  /** Tool ROI table (measured on this run). */
  toolRoi(): { name: string; calls: number; ok: number; fail: number; roi: number }[] {
    return [...this.toolStats].map(([name, v]) => ({
      name,
      ...v,
      roi: v.calls ? (v.ok - v.fail) / v.calls : 0,
    }));
  }

  private ladderIndex(): number {
    return this.o.ladder.findIndex((m) => m.id === this.s.model);
  }
  private nextUp(): LadderModel | null {
    const i = this.ladderIndex();
    const cur = this.o.ladder[i];
    return (
      this.o.ladder.find(
        (m, j) => j > i && m.id !== this.s.model && (!cur || m.inputPrice >= cur.inputPrice),
      ) ?? null
    );
  }
  private nextDown(): LadderModel | null {
    const i = this.ladderIndex();
    const cur = this.o.ladder[i];
    if (!cur || cur.inputPrice <= 0) return null;
    // Only meaningfully cheaper models with a decent success estimate.
    return (
      this.o.ladder
        .filter(
          (m) =>
            m.id !== cur.id && m.inputPrice > 0 && m.inputPrice <= cur.inputPrice / 3 && m.pSuccess >= 0.6,
        )
        .sort((a, b) => b.pSuccess - a.pSuccess)[0] ?? null
    );
  }

  /** Compact mission state handed to a new model (instead of the full history). */
  handoff(): string {
    return handoffOf(this.state());
  }
}

/** Compact mission state text (model switch, resume after an interruption). */
export function handoffOf(s: MissionState): string {
  return [
    '<jev_mission_state>',
    `goal: ${s.goal}`,
    `progress: ~${Math.round(s.progress * 100)} % after ${s.step} step(s); strategy ${s.strategy}`,
    s.facts.length ? `facts established:\n- ${s.facts.join('\n- ')}` : '',
    s.failures.length ? `failed attempts (do not repeat):\n- ${s.failures.slice(-4).join('\n- ')}` : '',
    `budget left: ${s.budgetLeftTokens} tokens${s.costBudget !== null ? `, $${Math.max(0, s.costBudget - s.cost).toFixed(4)}` : ''}`,
    'Continue from this state; do not redo completed work.',
    '</jev_mission_state>',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Short fact from a successful tool call (for the mission state). */
export function factOf(name: string, args: string, output: string): string | null {
  let a: Record<string, unknown> = {};
  try {
    a = JSON.parse(args || '{}') as Record<string, unknown>;
  } catch {
    /* raw */
  }
  const path = typeof a.path === 'string' ? a.path : typeof a.file === 'string' ? a.file : null;
  if (/^filesystem\.(write|edit)$/.test(name) && path) return `wrote ${path}`;
  if (name === 'filesystem.read' && path) return `read ${path}`;
  if (/^(code\.run|terminal\.execute)$/.test(name))
    return `ran ${name}: ${output.replace(/\s+/g, ' ').slice(0, 100)}`;
  if (/^(data\.query|data\.inspect)$/.test(name))
    return `${name}: ${output.replace(/\s+/g, ' ').slice(0, 100)}`;
  if (/^(web\.search|wikipedia\.search|papers\.search)$/.test(name) && typeof a.query === 'string')
    return `searched "${a.query.slice(0, 60)}"`;
  return null;
}

/** Jaccard similarity on word 3-grams (cheap near-duplicate detection). */
export function similarity(a: string, b: string): number {
  const grams = (t: string) => {
    const w = t.toLowerCase().split(/\s+/).filter(Boolean);
    const g = new Set<string>();
    for (let i = 0; i + 2 < w.length; i++) g.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
    return g;
  };
  const x = grams(a.slice(0, 4000));
  const y = grams(b.slice(0, 4000));
  if (!x.size || !y.size) return a.trim() === b.trim() ? 1 : 0;
  let inter = 0;
  for (const g of x) if (y.has(g)) inter++;
  return inter / (x.size + y.size - inter);
}

/**
 * Live context pruning (REMOVE_CONTEXT): tool outputs older than `keepLast`
 * tool messages and larger than `minTokens` are replaced by a short stub. The
 * tool_call ids are kept, so the conversation stays valid; the model can re-read.
 * Returns the tokens removed.
 */
export function pruneToolOutputs<T extends { role: string; content: unknown; name?: string }>(
  messages: T[],
  keepLast = 4,
  minTokens = 600,
): number {
  const toolIdx = messages.map((m, i) => (m.role === 'tool' ? i : -1)).filter((i) => i >= 0);
  const old = toolIdx.slice(0, Math.max(0, toolIdx.length - keepLast));
  let removed = 0;
  for (const i of old) {
    const m = messages[i]!;
    if (typeof m.content !== 'string' || m.content.startsWith('[JEV')) continue;
    const tk = estTokens(m.content);
    if (tk < minTokens) continue;
    const head = m.content.slice(0, 240).replace(/\s+/g, ' ');
    const stub = `[JEV: sortie ancienne élaguée (${tk} tokens). Début : ${head}… — relancez l’outil si le détail est nécessaire]`;
    removed += tk - estTokens(stub);
    // New object: the persisted conversation (same references) keeps the full output.
    messages[i] = { ...m, content: stub };
  }
  return removed;
}

/** Waste: tokens paid for that brought nothing (all inputs are measured token counts of the run). */
export interface WasteInput {
  /** Serialized tool-definition tokens sent (all calls), and those of tools never used in the run. */
  toolTokensSent: number;
  unusedToolTokens: number;
  /** Tokens of failed tool calls (arguments + error output). */
  failedToolTokens: number;
  /** Tokens of tool calls repeated identically (arguments + output). */
  repeatedToolTokens: number;
  /** Tokens of model calls whose answer was discarded (re-run after a correction / escalation). */
  discardedTokens: number;
  totalTokens: number;
}
/** WASTE RATE = useless tokens / total tokens. */
export function wasteRate(w: WasteInput): {
  wasted: number;
  rate: number | null;
  parts: Record<string, number>;
} {
  const parts = {
    'définitions d’outils inutilisés': Math.round(w.unusedToolTokens),
    'appels d’outils en échec': Math.round(w.failedToolTokens),
    'appels répétés': Math.round(w.repeatedToolTokens),
    'réponses jetées': Math.round(w.discardedTokens),
  };
  const wasted = Math.min(
    w.totalTokens,
    Object.values(parts).reduce((a, b) => a + b, 0),
  );
  return { wasted, rate: w.totalTokens > 0 ? wasted / w.totalTokens : null, parts };
}

/**
 * Avoidable waste reduction between a baseline and a JEV run set: 1 − waste_jev / waste_baseline
 * (waste per mission). Null when there is no measured baseline waste.
 */
export function wasteReduction(
  baselineWastePerMission: number | null,
  jevWastePerMission: number | null,
): number | null {
  if (baselineWastePerMission === null || jevWastePerMission === null || baselineWastePerMission <= 0)
    return null;
  return 1 - jevWastePerMission / baselineWastePerMission;
}

/**
 * COGNITIVE EFFICIENCY SCORE (0–100): quality per 1k tokens and per dollar,
 * normalised against the baseline of the same benchmark (100 = twice as
 * efficient as the baseline, 50 = same, 0 = no quality). Measured values only.
 */
export function efficiencyScore(o: {
  quality: number;
  tokens: number;
  cost: number;
  baseQuality: number;
  baseTokens: number;
  baseCost: number;
}): number | null {
  if (!o.tokens || !o.baseTokens || !o.baseQuality) return null;
  const qpt = o.quality / o.tokens / (o.baseQuality / o.baseTokens);
  const qpd = o.cost > 0 && o.baseCost > 0 ? o.quality / o.cost / (o.baseQuality / o.baseCost) : qpt;
  const ratio = Math.sqrt(qpt * qpd);
  return Math.round(Math.max(0, Math.min(100, 50 * ratio)));
}

/**
 * EXPECTED VALUE OF INFORMATION gate: a paid JEV call is made only when its expected benefit
 * (probability that it changes the decision × the cost the decision can avoid) exceeds its cost.
 * The inputs are projections (labelled as such in the trace), the decision is logged.
 */
export function eviGate(o: { pUseful: number; avoidableCostUsd: number; callCostUsd: number }): {
  call: boolean;
  expectedBenefit: number;
  reason: string;
} {
  const benefit = Math.max(0, o.pUseful) * Math.max(0, o.avoidableCostUsd);
  const call = benefit > o.callCostUsd;
  return {
    call,
    expectedBenefit: benefit,
    reason: `EVI (projetée) $${benefit.toFixed(6)} ${call ? '>' : '≤'} coût JEV $${o.callCostUsd.toFixed(6)} → ${call ? 'USE' : 'SKIP'}`,
  };
}
