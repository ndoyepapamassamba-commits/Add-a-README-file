// JEV-0 — the deterministic Execution Packet compiler (no model call):
// intent → Task DNA → strategy → model route → context / memory → style →
// tools / skills / MCP → budgets → success criteria → output contract.
// The LLM receives a compact packet instead of having to work out
// "what should I do, with what, how far" by itself (reasoning compression).
import type { ModelInfo } from '@shared/types';
import type { AutoTiers } from '../services/settings';
import { localSkill } from './local';
import {
  analyzeTask,
  classificationConfidence,
  type HealthMap,
  type LeaderboardMap,
  type TaskProfile,
  type TaskType,
} from '../llm/routing';
import {
  evalFormula,
  planStrategy,
  similarMissions,
  taskDna,
  type BenchResult,
  type Ledger,
  type Strategy,
  type TaskDna,
} from '../agent/intelligence';
import { decideRoute, type EngineSettings, type RoutingDecision } from '../engine/decision';
import { selectSkills, type SkillSelection } from '../engine/skills';
import { buildLoadout, type Loadout } from '../engine/loadout';
import type { ExternalBenchmark } from '../engine/evidence';
import { JevCache, normalizeKey } from './cache';
import { compileContext, estTokens, selectMemory, type ContextItem, type ContextPack } from './context';
import { budgetsFor, levelOf, modeTier, type Budgets } from './control';
import {
  contractText,
  detectCodingStyle,
  detectWritingStyle,
  outputSpec,
  styleContract,
  type CodingStyle,
  type OutputSpec,
  type WritingStyle,
} from './style';
import { compileToolPack, type JevMode, type ToolPack } from './tools';
import type { Jev1Answer } from './provider';

export type AgentStrategy =
  | 'DIRECT ANSWER'
  | 'SINGLE MODEL'
  | 'MODEL + TOOL'
  | 'MULTI-STEP AGENT'
  | 'MULTI-AGENT'
  | 'CODER + TESTER'
  | 'RESEARCHER + REVIEWER'
  | 'ARCHITECT + CODER + QA';

/** The packet of the specification (field names kept as asked). */
export interface ExecutionPacket {
  task_id: string;
  intent: string;
  task_type: TaskType;
  task_dna: string;
  difficulty: number;
  risk: string;
  urgency: 'normal' | 'urgent';
  expected_output: string;
  success_criteria: string[];
  reasoning_level: 'low' | 'medium' | 'high';
  context_required: string[];
  context_excluded: number;
  memory_required: string[];
  style_profile: string;
  voice_profile: string;
  coding_style: string;
  tools_required: string[];
  skills_required: string[];
  mcp_required: string[];
  candidate_models: string[];
  selected_model: string | null;
  fallback_model: string | null;
  token_budget: number;
  cost_budget: number | null;
  max_steps: number;
  /** Same as max_steps (spec name). */
  step_budget: number;
  time_budget_ms: number;
  max_retries: number;
  qa_required: boolean;
  qa_threshold: number;
  escalation_policy: string;
  stop_conditions: string[];
  output_contract: string;
  agent_strategy: AgentStrategy;
  /** Execution strategy: single pass, tool loop, mission pipeline, live-controlled. */
  strategy: string;
  level: number;
  decided_by: 'JEV-0' | 'JEV-1' | 'JEV-2' | 'direct';
  confidence: number;
}

export interface PreInput {
  taskId: string;
  text: string;
  attachments: string[];
  hasImages: boolean;
  mission: boolean;
  role: string;
  agentLabel: string;
  mode: JevMode;
  models: ModelInfo[];
  tiers: AutoTiers;
  health: HealthMap;
  board: LeaderboardMap;
  bench: BenchResult[];
  external: ExternalBenchmark[];
  latency: Record<string, number>;
  engine: EngineSettings;
  budgetLeft: number | null;
  perTaskUsd: number;
  maxSteps: number;
  historyTokens: number;
  /** Tools the agent / mode allows (names). */
  availableTools: string[];
  mcpConnected: string[];
  mcpToolNames: string[];
  files: { path: string; text: string }[];
  userTexts: string[];
  manualRules: string[];
  ledger: Ledger;
  jev1?: Jev1Answer | null;
  preferredTier?: TaskProfile['tier'] | null;
  cache: JevCache;
  rand?: () => number;
}

export interface PreResult {
  packet: ExecutionPacket;
  profile: TaskProfile;
  dna: TaskDna;
  strategy: Strategy;
  decision: RoutingDecision;
  selection: SkillSelection;
  loadout: Loadout;
  toolPack: ToolPack;
  budgets: Budgets;
  spec: OutputSpec;
  coding: CodingStyle | null;
  writing: WritingStyle;
  memory: ContextPack;
  files: ContextPack;
  contract: string;
  /** Before / after of the decision space (reasoning compression). */
  compression: { before: Record<string, number>; after: Record<string, number> };
  cacheHits: number;
  ms: number;
}

const usable = (m: ModelInfo) => m.capabilities.tools && !/:(free|batch)$|-contributor\b/.test(m.id);

/** L0: requests answered with no model at all (pure arithmetic, today's date). */
export function directAnswer(text: string, now = new Date()): string | null {
  const t = text
    .trim()
    .replace(/[?？]$/, '')
    .trim();
  const m =
    /^(?:calcule[rz]?|combien (?:font|fait)|compute|what is|=)?\s*([\d\s+\-*/^().,]{3,80})\s*=?\s*$/i.exec(t);
  if (m && /\d\s*[+\-*/^]\s*[\d(]/.test(m[1]!)) {
    try {
      const expr = m[1]!.replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, '');
      const v = evalFormula(expr, {});
      if (Number.isFinite(v))
        return `${m[1]!.trim()} = **${Number(v.toPrecision(12)).toLocaleString('fr-FR')}**\n\n_Calculé par JEV-0 sans appel de modèle (0 $)._`;
    } catch {
      /* not a formula */
    }
  }
  if (
    /^(quelle (est la )?date|quel jour sommes-nous|on est quel jour|what('s| is) the date|today'?s date)/i.test(
      t,
    )
  )
    return `Nous sommes le **${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}**.\n\n_Répondu par JEV-0 sans appel de modèle (0 $)._`;
  if (/^(quelle heure|il est quelle heure|what time is it)/i.test(t))
    return `Il est **${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}** (heure de cet ordinateur).\n\n_Répondu par JEV-0 sans appel de modèle (0 $)._`;
  // Local skills: percentages, units, dates, loans, text stats, bases, JSON (exact, 0 $).
  return localSkill(text, now)?.answer ?? null;
}

function agentStrategy(p: TaskProfile, mission: boolean, needsTools: boolean): AgentStrategy {
  if (mission && p.team.includes('architect')) return 'ARCHITECT + CODER + QA';
  if (mission && p.team.length >= 3) return 'MULTI-AGENT';
  if (p.type === 'code' && p.difficulty >= 0.55) return 'CODER + TESTER';
  if (p.type === 'research' && p.difficulty >= 0.55) return 'RESEARCHER + REVIEWER';
  if (mission || p.difficulty >= 0.55) return 'MULTI-STEP AGENT';
  if (needsTools) return 'MODEL + TOOL';
  return 'SINGLE MODEL';
}

const CRITERIA: Record<TaskType, string[]> = {
  data: ['every figure comes from data.query / code.run output', 'totals re-checked a second way'],
  code: ['the code runs (code.run / terminal) without error', 'no placeholder, existing style kept'],
  research: ['at least two independent sources with links and dates'],
  browser: ['each action verified with a snapshot'],
  document: ['each extracted item cites its page / section'],
  review: ['each finding has evidence and a severity'],
  writing: ['tone and length fit the recipient'],
  vision: ['what is visible is described before interpreting'],
  chat: ['direct, correct answer'],
};

/** JEV-0: the full Execution Packet, deterministic and cached. */
export function jevPre(inp: PreInput): PreResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let cacheHits = 0;
  const profile = analyzeTask({
    text: inp.text,
    attachmentNames: inp.attachments,
    hasImages: inp.hasImages,
    role: inp.role,
    historyTokens: inp.historyTokens,
    mission: inp.mission,
  });
  let confidence = classificationConfidence(inp.text, inp.attachments);
  let decidedBy: ExecutionPacket['decided_by'] = 'JEV-0';
  // JEV-1 refines the classification when it was consulted and is confident.
  const j = inp.jev1;
  if (j) {
    if (j.typeConfidence >= 0.6 && j.type !== profile.type && confidence < 0.8) {
      profile.type = j.type;
      profile.reasons.push(`JEV-1 : type ${j.type} (${Math.round(j.typeConfidence * 100)} %)`);
      decidedBy = 'JEV-1';
    }
    if (j.difficulty >= 0.66 && (profile.tier === 'cheap' || profile.tier === 'balanced')) {
      profile.tier = 'quality';
      profile.reasons.push('JEV-1 : tâche experte');
      decidedBy = 'JEV-1';
    } else if (
      j.difficulty < 0.2 &&
      j.risk < 0.3 &&
      profile.tier === 'balanced' &&
      !/critique/.test(profile.reasons.join())
    ) {
      profile.tier = 'cheap';
      profile.reasons.push('JEV-1 : tâche triviale');
      decidedBy = 'JEV-1';
    }
    if (j.risk >= 0.7 && profile.tier === 'cheap') {
      profile.tier = 'balanced';
      profile.reasons.push('JEV-1 : enjeu élevé');
    }
    confidence = Math.max(confidence, j.typeConfidence);
  }
  const dna = taskDna(inp.text, inp.attachments, profile);
  const critical = dna.criticality === 'critical';
  const strategy = planStrategy(dna, profile, inp.ledger, { mission: inp.mission, rand: inp.rand });
  profile.tier = inp.preferredTier ?? modeTier(strategy.tier, inp.mode, critical);

  // Route (cached on the normalised request + mode + catalog size).
  const rk = normalizeKey(
    inp.text,
    inp.attachments,
    inp.mode,
    profile.tier,
    inp.models.length,
    inp.budgetLeft === null ? 'nb' : Math.round(inp.budgetLeft * 100),
  );
  const routed = inp.cache.memo('routing', rk, () =>
    decideRoute({
      models: inp.models,
      tiers: inp.tiers,
      profile,
      dna,
      text: inp.text,
      health: inp.health,
      board: inp.board,
      bench: inp.bench,
      external: inp.external,
      latency: inp.latency,
      settings: inp.engine,
      budgetLeft: inp.budgetLeft,
      mission: inp.mission,
    }),
  );
  if (routed.hit) cacheHits++;
  const decision = routed.value;
  const chosen = inp.models.find((m) => m.id === decision.chosen?.id) ?? null;

  const selection = selectSkills(inp.text, inp.attachments, { model: chosen, tools: inp.availableTools });
  const loadout = buildLoadout({
    agentId: inp.role,
    agentLabel: inp.agentLabel,
    team: strategy.team,
    type: profile.type,
    selection,
    mcpConnected: inp.mcpConnected,
    tools: inp.availableTools,
  });
  const mcpTools = inp.mcpToolNames.filter((n) =>
    loadout.mcp.some((s) => n.toLowerCase().includes(s.toLowerCase().split(' ')[0]!)),
  );
  const toolPack = compileToolPack({
    type: profile.type,
    text: inp.text,
    available: inp.availableTools,
    skillTools: selection.selected.flatMap((s) => s.skill.required_tools),
    mission: inp.mission,
    mode: inp.mode,
    mcpTools,
    team: strategy.team,
  });
  const budgets = budgetsFor({
    mode: inp.mode,
    difficulty: profile.difficulty,
    mission: inp.mission,
    perTaskUsd: inp.perTaskUsd,
    maxSteps: inp.maxSteps,
  });

  // Context: only the relevant workspace files are named to the model.
  const fileItems: ContextItem[] = inp.files.map((f, i) => ({
    id: f.path,
    kind: 'file',
    text: `${f.path}\n${f.text.slice(0, 3000)}`,
    recency: inp.files.length > 1 ? i / (inp.files.length - 1) : 1,
    importance: inp.attachments.some((a) => f.path.endsWith(a)) ? 1 : 0.2,
    pinned: inp.attachments.some((a) => f.path.endsWith(a)),
  }));
  const files = compileContext(inp.text, fileItems, Math.round(budgets.tokens * 0.15));
  // Memory: user rules (always) + lessons of similar missions (only when relevant).
  const sim = similarMissions(inp.ledger, dna, 0.45, 6);
  const memory = selectMemory(
    inp.text,
    [
      ...inp.manualRules.map((r, i) => ({
        id: `rule${i}`,
        text: r,
        at: Date.now(),
        importance: 1,
        kind: 'rule' as const,
      })),
      ...sim.flatMap((e) =>
        e.lessons.slice(0, 2).map((l, i) => ({
          id: `${e.id}-${i}`,
          text: `${e.goal.slice(0, 80)} → ${l}`,
          at: e.at,
          importance: e.verdict === 'PASSED' ? 0.4 : 0.8,
          kind: 'lesson' as const,
        })),
      ),
    ],
    600,
  );
  // Style profiles (coding style cached on the workspace signature).
  const sig = normalizeKey(
    inp.files.length,
    inp.files
      .slice(0, 40)
      .map((f) => `${f.path}:${f.text.length}`)
      .join(','),
  );
  const cs = inp.cache.memo('context', `style:${sig}`, () => detectCodingStyle(inp.files));
  if (cs.hit) cacheHits++;
  const coding = cs.value.files ? cs.value : null;
  const writing = detectWritingStyle(inp.userTexts);
  const spec = outputSpec(inp.text);
  const contract = styleContract({
    coding: profile.type === 'code' || profile.type === 'review' ? coding : null,
    writing,
    rules: memory.kept.filter((k) => k.kind === 'rule').map((k) => k.text),
    output: contractText(spec),
  });

  const reasoning =
    profile.difficulty >= 0.7 || critical ? 'high' : profile.difficulty >= 0.4 ? 'medium' : 'low';
  const needsTools = profile.type !== 'chat' && profile.type !== 'writing';
  const packet: ExecutionPacket = {
    task_id: inp.taskId,
    intent: inp.text.split('\n')[0]!.slice(0, 160),
    task_type: profile.type,
    task_dna: dna.cls,
    difficulty: Math.round(profile.difficulty * 100) / 100,
    risk: dna.risks.join(', ') || dna.criticality,
    urgency: /\b(urgent|asap|imm[ée]diat|tout de suite|vite)\b/i.test(inp.text) ? 'urgent' : 'normal',
    expected_output: dna.outputs.join(', ') || (spec.format === 'text' ? 'réponse' : spec.format),
    success_criteria: [
      ...(profile.type === 'code' && profile.difficulty < 0.4 && !inp.mission
        ? ['correct, minimal code; a trivial snippet needs no execution — answer directly']
        : CRITERIA[profile.type]),
      ...(spec.mustMention.length ? [`includes ${spec.mustMention.join(', ')}`] : []),
    ],
    reasoning_level: reasoning,
    context_required: files.kept.map((k) => k.id).slice(0, 12),
    context_excluded: files.dropped.length,
    memory_required: memory.kept.map((k) => k.text.slice(0, 120)),
    style_profile: `${writing.language}/${writing.formality}/${writing.length}`,
    voice_profile: writing.structure,
    coding_style: coding
      ? [coding.languages.join('/'), coding.indent, coding.quotes, coding.naming].filter(Boolean).join(' · ')
      : '—',
    tools_required: toolPack.names,
    skills_required: selection.selected.map((s) => s.skill.name),
    mcp_required: loadout.mcp,
    candidate_models: [decision.chosen?.id, ...decision.fallbacks.map((f) => f.id)].filter((x): x is string =>
      Boolean(x),
    ),
    selected_model: decision.chosen?.id ?? null,
    fallback_model: decision.fallbacks[0]?.id ?? null,
    token_budget: budgets.tokens,
    cost_budget: budgets.costUsd,
    max_steps: budgets.steps,
    step_budget: budgets.steps,
    time_budget_ms: budgets.timeMs,
    max_retries: budgets.retries,
    qa_required: true,
    qa_threshold: inp.engine.qaThreshold,
    escalation_policy: `cascade L${levelOf(decision.tier)} → ${decision.ladder.map((l) => `L${levelOf(l.tier)}`).join(' → ') || 'aucun palier supérieur'} si QA < ${inp.engine.qaThreshold} %, gain marginal vérifié`,
    stop_conditions: [
      `QA ≥ ${inp.engine.qaThreshold} %`,
      `coût ≥ ${budgets.costUsd === null ? '∞' : `$${budgets.costUsd}`}`,
      `${budgets.steps} étapes`,
      `${budgets.tokens} tokens`,
      'qualité ≥ 95 % : aucune relance premium',
    ],
    output_contract: contractText(spec) || 'free form',
    agent_strategy: agentStrategy(profile, inp.mission, needsTools),
    strategy: `${agentStrategy(profile, inp.mission, needsTools)} · JEV LIVE (checkpoints adaptatifs, budget dynamique B0→B3)`,
    level: levelOf(decision.tier, { multiAgent: inp.mission && strategy.team.length >= 3 }),
    decided_by: decidedBy,
    confidence: Math.round(confidence * 100) / 100,
  };
  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return {
    packet,
    profile,
    dna,
    strategy,
    decision,
    selection,
    loadout,
    toolPack,
    budgets,
    spec,
    coding,
    writing,
    memory,
    files,
    contract,
    compression: {
      before: {
        modèles: inp.models.filter(usable).length,
        outils: inp.availableTools.length,
        fichiers: inp.files.length,
        stratégies: 8,
        'niveaux de raisonnement': 5,
      },
      after: {
        modèles: packet.candidate_models.length,
        outils: toolPack.names.length,
        fichiers: files.kept.length,
        stratégies: 1,
        'niveaux de raisonnement': 1,
      },
    },
    cacheHits,
    ms,
  };
}

/** The packet as sent to the LLM: compact, no repetition of the system prompt. */
export function packetPrompt(r: PreResult): string {
  const p = r.packet;
  const lines = [
    `<jev_packet decided_by="${p.decided_by}" confidence="${p.confidence}">`,
    `task: ${p.task_type} · difficulty ${p.difficulty} · risk ${p.risk} · strategy ${p.agent_strategy} · reasoning ${p.reasoning_level}`,
    `success: ${p.success_criteria.join('; ')}`,
    p.context_required.length ? `relevant files: ${p.context_required.join(', ')}` : '',
    p.memory_required.length ? `remember: ${p.memory_required.join(' | ')}` : '',
    r.contract ? r.contract : '',
    `budget: ≤ ${p.max_steps} steps, ≤ ${p.token_budget} tokens${p.cost_budget !== null ? `, ≤ $${p.cost_budget}` : ''}; stop as soon as the success criteria are met.`,
    `tools: ${p.tools_required.length} selected for this task; call tools.request({family}) if you need another family.`,
    '</jev_packet>',
  ];
  return lines.filter(Boolean).join('\n');
}

export const promptTokens = estTokens;

/** "Why JEV chose this": short human explanation of the packet. */
export function explain(r: PreResult): string[] {
  const p = r.packet;
  return [
    `Décidé par ${p.decided_by} en ${r.ms.toFixed(1)} ms (confiance ${Math.round(p.confidence * 100)} %)${r.cacheHits ? `, ${r.cacheHits} décision(s) depuis le cache` : ''}.`,
    `Tâche ${p.task_type}, difficulté ${Math.round(p.difficulty * 100)} %, risque ${p.risk} → stratégie ${p.agent_strategy}, niveau L${p.level}.`,
    r.decision.why.model,
    `Outils : ${r.toolPack.names.length} sur ${r.toolPack.baseline} (${r.toolPack.reasons.join(' ; ')}).`,
    `Skills : ${p.skills_required.join(', ') || 'aucun'} · MCP : ${p.mcp_required.join(', ') || 'aucun'}.`,
    `Contexte : ${r.files.kept.length} fichier(s) retenu(s), ${r.files.dropped.length} écarté(s) ; mémoire : ${r.memory.kept.length} élément(s).`,
    `Budgets : ${p.token_budget} tokens, ${p.cost_budget === null ? 'coût libre' : `$${p.cost_budget}`}, ${p.max_steps} étapes, ${p.max_retries} retry.`,
  ];
}
