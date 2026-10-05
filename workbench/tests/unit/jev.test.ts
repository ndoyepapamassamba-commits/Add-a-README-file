// JEV Cognitive Companion: JEV-0 packet, context / memory / style compilers,
// tool pack, QA + targeted correction, escalation + marginal gain, budgets and
// execution monitor, caches, ROI gate, JEV-1 API adapter (success, failure,
// timeout, malformed response), redaction, metrics.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModelInfo } from '@shared/types';
import { intelData, setIntelData, type IntelData } from '../../server/llm/modelIntel';
import { DEFAULT_AUTO_TIERS } from '../../server/services/settings';
import { DEFAULT_ENGINE } from '../../server/engine/decision';
import { JevCache, normalizeKey } from '../../server/jev/cache';
import { compileContext, selectMemory } from '../../server/jev/context';
import { ExecutionMonitor, budgetsFor, marginalGain, modeTier } from '../../server/jev/control';
import { directAnswer, jevPre, packetPrompt, type PreInput } from '../../server/jev/packet';
import { callJev1, maskSecret, redact, roiGate, DEFAULT_JEV_API } from '../../server/jev/provider';
import { qualityCheck, shouldCorrect, correctionPrompt } from '../../server/jev/qa';
import { detectCodingStyle, detectWritingStyle, outputSpec, styleContract } from '../../server/jev/style';
import { compileToolPack, toolDefTokens } from '../../server/jev/tools';
import { compare, kpi, modelProfiles, toCsv, type JevLogEntry } from '../../server/jev/metrics';

const entry = (intelligence: number, coding: number | null = null, agentic: number | null = null) => ({
  name: 't',
  intelligence,
  coding,
  agentic,
  effort: 'high',
  variants: { high: intelligence },
});
const INTEL: IntelData = {
  source: 'test',
  url: '',
  fetchedAt: new Date().toISOString(),
  models: {
    'anthropic/claude-opus-5.5-20260921': entry(57.6, 80, 60),
    'anthropic/claude-sonnet-5.5-20260928': entry(56, 78, 58),
    'openai/gpt-6-luna-20260922': entry(38.1, 60, 35),
    'xiaomi/mimo-v2.6-pro-20260921': entry(46.3, 66, 40),
  },
  ids: {},
};
const mp = (id: string, slug: string, i: number, o: number): ModelInfo => ({
  id,
  slug,
  name: id,
  provider: id.split('/')[0]!,
  created: 1,
  contextLength: 200_000,
  maxCompletionTokens: null,
  inputPrice: i,
  outputPrice: o,
  capabilities: { tools: true, reasoning: true, vision: true, structuredOutputs: false },
  efforts: [],
  defaultEffort: null,
  description: '',
});
const MODELS = [
  mp('anthropic/claude-opus-5.5', 'anthropic/claude-opus-5.5-20260921', 4, 20),
  mp('anthropic/claude-sonnet-5.5', 'anthropic/claude-sonnet-5.5-20260928', 2, 10),
  mp('openai/gpt-6-luna', 'openai/gpt-6-luna-20260922', 0.1, 0.5),
  mp('xiaomi/mimo-v2.6-pro', 'xiaomi/mimo-v2.6-pro-20260921', 0.435, 0.87),
];
const ALL_TOOLS = [
  'filesystem.list',
  'filesystem.read',
  'filesystem.search',
  'filesystem.write',
  'filesystem.edit',
  'filesystem.delete',
  'data.inspect',
  'data.query',
  'data.chart',
  'data.export',
  'code.run',
  'web.search',
  'artifact.create',
  'plan.update',
  'skill.use',
  'skill.read',
  'agent.delegate',
  'memory.doc',
  'report.export',
  'decision.simulate',
  'info.value',
  'knowledge.query',
  'project.twin',
  'project.impact',
  'regression.run',
  'manual.add',
  'timemachine.list',
  'timemachine.diff',
  'timemachine.restore',
  'terminal.execute',
  'browser.open',
  'browser.snapshot',
  'browser.click',
  'browser.type',
  'browser.select',
  'browser.upload',
  'browser.scroll',
  'browser.back',
  'browser.console',
  'apex.guide',
  'apex.reference',
  'apex.build_app',
  'apex.qa',
  'fx.rates',
  'worldbank.indicator',
  'diagram.render',
  'image.generate',
  'blender.scene',
  'tools.request',
];
const base = (o: Partial<PreInput> = {}): PreInput => ({
  taskId: 't1',
  text: 'Analyse ce fichier et donne le total des montants par agence',
  attachments: ['ventes.csv'],
  hasImages: false,
  mission: false,
  role: 'general',
  agentLabel: 'Orchestrateur',
  mode: 'balanced',
  models: MODELS,
  tiers: DEFAULT_AUTO_TIERS,
  health: {},
  board: {},
  bench: [],
  external: [],
  latency: {},
  engine: DEFAULT_ENGINE,
  budgetLeft: null,
  perTaskUsd: 1,
  maxSteps: 40,
  historyTokens: 0,
  availableTools: ALL_TOOLS,
  mcpConnected: [],
  mcpToolNames: [],
  files: [
    { path: 'uploads/ventes.csv', text: 'agence,montant\nDakar,10' },
    { path: 'notes/vacances.md', text: 'Liste de plages à visiter' },
  ],
  userTexts: ['Analyse ce fichier et donne le total des montants par agence'],
  manualRules: ['Toujours répondre en français'],
  ledger: { entries: [] },
  cache: new JevCache(),
  rand: () => 0.99,
  ...o,
});

let saved: IntelData;
beforeAll(() => {
  saved = intelData();
  setIntelData(INTEL);
});
afterAll(() => setIntelData(saved));

describe('JEV-0 Execution Packet', () => {
  it('is deterministic, fast, complete and compresses the decision space', () => {
    const cache = new JevCache();
    jevPre(base({ cache })); // warm-up (module JIT)
    const r = jevPre(base({ cache: new JevCache() }));
    expect(r.ms).toBeLessThan(80);
    const p = r.packet;
    for (const k of [
      'task_id',
      'intent',
      'task_type',
      'task_dna',
      'difficulty',
      'risk',
      'success_criteria',
      'reasoning_level',
      'tools_required',
      'skills_required',
      'selected_model',
      'fallback_model',
      'token_budget',
      'cost_budget',
      'max_steps',
      'max_retries',
      'qa_required',
      'escalation_policy',
      'stop_conditions',
      'output_contract',
    ])
      expect(p).toHaveProperty(k);
    expect(p.task_type).toBe('data');
    expect(p.selected_model).toBe('openai/gpt-6-luna');
    expect(p.decided_by).toBe('JEV-0');
    expect(r.toolPack.names.length).toBeLessThan(ALL_TOOLS.length / 2);
    expect(r.toolPack.names).toEqual(expect.arrayContaining(['data.query', 'data.inspect', 'tools.request']));
    expect(r.toolPack.names.every((n) => ALL_TOOLS.includes(n))).toBe(true);
    expect(p.context_required).toContain('uploads/ventes.csv');
    expect(p.context_required).not.toContain('notes/vacances.md');
    expect(p.memory_required.join()).toMatch(/français/);
    expect(r.compression.after.outils).toBeLessThan(r.compression.before.outils!);
    expect(packetPrompt(r)).toMatch(/<jev_packet/);
    // Same request again: the routing decision comes from the cache.
    expect(jevPre(base({ cache })).cacheHits).toBeGreaterThan(0);
  });
  it('JEV-1 refines the classification only when confident; modes move the tier (critical keeps QUALITY)', () => {
    const r = jevPre(
      base({
        text: 'Peux-tu regarder ça ?',
        attachments: [],
        jev1: {
          type: 'code',
          typeConfidence: 0.9,
          difficulty: 0.8,
          risk: 0.2,
          needsTools: 0.9,
          ambiguity: 0.1,
          model: 'jev',
          inputTokens: 400,
          costUsd: 0.00002,
          ms: 200,
        },
      }),
    );
    expect(r.packet.task_type).toBe('code');
    expect(r.packet.decided_by).toBe('JEV-1');
    expect(['quality', 'maximum']).toContain(r.profile.tier);
    expect(modeTier('balanced', 'eco', false)).toBe('cheap');
    expect(modeTier('cheap', 'eco', true)).toBe('quality');
    expect(modeTier('quality', 'max', false)).toBe('maximum');
    expect(jevPre(base({ mode: 'max' })).toolPack.names.length).toBe(ALL_TOOLS.length);
  });
  it('L0 direct answers need no model', () => {
    expect(directAnswer('combien font 12*7 ?')).toMatch(/84/);
    expect(directAnswer('calcule (1200+450)/2')).toMatch(/825/);
    expect(directAnswer('quelle heure est-il ?')).toMatch(/Il est/);
    expect(directAnswer('Analyse ce fichier')).toBeNull();
    expect(directAnswer('2026')).toBeNull();
  });
});

describe('context, memory and style compilers', () => {
  it('keeps HIGH + useful MEDIUM, drops LOW / IGNORE, measures compression', () => {
    const pack = compileContext(
      'total montants agence Dakar',
      [
        {
          id: 'a',
          kind: 'history',
          text: 'Le total des montants pour Dakar est demandé par agence',
          recency: 1,
        },
        { id: 'b', kind: 'history', text: 'Recette de cuisine : tarte aux pommes', recency: 0.1 },
        { id: 'c', kind: 'file', text: 'montants agence ventes', recency: 0.5 },
      ],
      1000,
    );
    expect(pack.kept.map((k) => k.id)).toContain('a');
    expect(pack.kept.map((k) => k.id)).not.toContain('b');
    expect(pack.compression).toBeGreaterThan(0);
    const mem = selectMemory(
      'rapport COMEX',
      [
        { id: 'r', text: 'Toujours en français', at: 1, importance: 1, kind: 'rule' },
        { id: 'l', text: 'Recette sans rapport', at: 2, importance: 0.1, kind: 'lesson' },
      ],
      200,
    );
    expect(mem.kept.map((k) => k.id)).toEqual(['r']);
  });
  it('detects project coding style and writing style → compact contract', () => {
    const cs = detectCodingStyle([
      {
        path: 'src/a.ts',
        text: "import { x } from 'react';\nexport const fooBar = () => {\n  const userName = 'a';\n  return userName;\n};\n",
      },
      {
        path: 'src/b.ts',
        text: "import { it } from 'vitest';\nexport function loadData() {\n  const itemCount = 'b';\n  return itemCount;\n}\n",
      },
    ]);
    expect(cs.indent).toBe('2 espaces');
    expect(cs.quotes).toBe('single');
    expect(cs.naming).toBe('camelCase');
    expect(cs.frameworks).toContain('React');
    expect(cs.tests).toContain('vitest');
    const ws = detectWritingStyle(['Pouvez-vous rédiger la note pour le comité ? Merci de faire court.']);
    expect(ws).toMatchObject({ language: 'fr', formality: 'vous', length: 'court' });
    const c = styleContract({ coding: cs, writing: ws, rules: ['jamais de jargon'] });
    expect(c.split('\n').length).toBeLessThanOrEqual(4);
    expect(c).toMatch(/camelCase/);
  });
});

describe('tool pack', () => {
  it('a subset of the allowed tools, per task type, with the meta tool; tool definitions shrink', () => {
    const chat = compileToolPack({ type: 'chat', text: 'bonjour', available: ALL_TOOLS, mode: 'balanced' });
    const code = compileToolPack({
      type: 'code',
      text: 'corrige le bug',
      available: ALL_TOOLS,
      mode: 'balanced',
    });
    expect(chat.names.length).toBeLessThan(code.names.length);
    expect(chat.names).toContain('tools.request');
    expect(code.names).toEqual(expect.arrayContaining(['filesystem.edit', 'code.run']));
    expect(
      compileToolPack({
        type: 'chat',
        text: 'convertis en XOF au taux de change du jour',
        available: ALL_TOOLS,
        mode: 'balanced',
      }).names,
    ).toContain('fx.rates');
    const defs = (n: string[]) =>
      n.map((x) => ({
        type: 'function',
        function: { name: x, description: 'x'.repeat(200), parameters: {} },
      }));
    expect(toolDefTokens(defs(chat.names))).toBeLessThan(toolDefTokens(defs(ALL_TOOLS)) / 4);
  });
});

describe('QA, targeted correction, escalation and budgets', () => {
  const q = (answer: string, text: string, extra: Partial<Parameters<typeof qualityCheck>[0]> = {}) =>
    qualityCheck({
      answer,
      spec: outputSpec(text),
      evidence: [text],
      usedTools: false,
      toolErrors: 0,
      toolCalls: 0,
      tokens: 1000,
      tokenBudget: 80_000,
      ...extra,
    });
  it('quality vector catches format, missing items, code syntax, secrets and unsupported figures', () => {
    expect(q('{"a": 1}', 'réponds en JSON').failures).toEqual([]);
    expect(q('voici : {a: 1', 'réponds en JSON').failures[0]!.kind).toBe('format');
    expect(q('Total 12', 'donne un tableau des ventes').failures.some((f) => f.kind === 'format')).toBe(true);
    expect(
      q('agence 10', 'donne les colonnes : agence, montant').failures.some((f) => f.kind === 'missing'),
    ).toBe(true);
    expect(q('```js\nfunction f( {\n```', 'écris une fonction').failures.some((f) => f.kind === 'code')).toBe(
      true,
    );
    expect(
      q('ta clé est sk-or-v1-abcdefabcdefabcdefabcdef', 'ma clé ?').failures.some((f) => f.kind === 'safety'),
    ).toBe(true);
    expect(
      q('Le total est 9 999 et 8 888', 'total ?', { usedTools: true, evidence: ['Dakar 10'] }).failures.some(
        (f) => f.kind === 'factual',
      ),
    ).toBe(true);
    const good = q('| a | b |\n|---|---|\n| 1 | 2 |', 'donne un tableau');
    expect(good.score).toBeGreaterThanOrEqual(90);
  });
  it('corrects only what failed, once, and only when it pays', () => {
    const bad = q('{a:', 'réponds en JSON');
    const d = shouldCorrect(bad, { mode: 'balanced', corrections: 0, budgetLeft: 1, estCost: 0.001 });
    expect(d.yes).toBe(true);
    expect(correctionPrompt(bad.failures)).toMatch(/Fix ONLY/);
    expect(shouldCorrect(bad, { mode: 'balanced', corrections: 1, budgetLeft: 1, estCost: 0.001 }).yes).toBe(
      false,
    );
    expect(
      shouldCorrect(bad, { mode: 'balanced', corrections: 0, budgetLeft: 0.0001, estCost: 0.001 }).yes,
    ).toBe(false);
    expect(
      shouldCorrect(q('ok', 'bonjour'), { mode: 'max', corrections: 0, budgetLeft: 1, estCost: 0 }).yes,
    ).toBe(false);
  });
  it('marginal gain: never a premium re-run at ≥ 95 %, escalate when the gain per $ is worth it', () => {
    expect(
      marginalGain({ qa: 96, target: 100, currentCost: 0.001, nextCost: 0.01, nextSuccess: 0.9 }).worth,
    ).toBe(false);
    expect(
      marginalGain({ qa: 40, target: 75, currentCost: 0.001, nextCost: 0.01, nextSuccess: 0.9 }).worth,
    ).toBe(true);
    expect(
      marginalGain({ qa: 72, target: 75, currentCost: 0.001, nextCost: 0.5, nextSuccess: 0.9 }).worth,
    ).toBe(false);
  });
  it('execution monitor: STOP on budget, COMPRESS near the limit, REMOVE_TOOL after 3 failures, loop detection', () => {
    const b = budgetsFor({
      mode: 'balanced',
      difficulty: 0.3,
      mission: false,
      perTaskUsd: 0.01,
      maxSteps: 40,
    });
    expect(
      budgetsFor({ mode: 'eco', difficulty: 0.3, mission: false, perTaskUsd: 1, maxSteps: 40 }).steps,
    ).toBeLessThan(b.steps);
    const m = new ExecutionMonitor(b);
    expect(
      m.step({ tokensIn: 100, tokensOut: 10, cost: 0.001, contextTokens: 100, contextLimit: 1000 }).action,
    ).toBe('CONTINUE');
    expect(
      m.step({ tokensIn: 100, tokensOut: 10, cost: 0.001, contextTokens: 800, contextLimit: 1000 }).action,
    ).toBe('COMPRESS');
    expect(
      m.step({ tokensIn: 100, tokensOut: 10, cost: 0.02, contextTokens: 100, contextLimit: 1000 }).action,
    ).toBe('STOP');
    const t = new ExecutionMonitor(b);
    t.tool('web.search', '{"q":1}', false);
    t.tool('web.search', '{"q":2}', false);
    expect(t.tool('web.search', '{"q":3}', false).action).toBe('REMOVE_TOOL');
    const l = new ExecutionMonitor(b);
    l.tool('data.query', '{}', true);
    l.tool('data.query', '{}', true);
    expect(l.tool('data.query', '{}', true).action).toBe('SWITCH_STRATEGY');
  });
});

describe('cache, ROI gate and the JEV-1 API adapter', () => {
  it('caches with TTL, version invalidation and statistics; near-identical keys match', () => {
    let now = 0;
    const c = new JevCache('v1', 10, () => now);
    expect(normalizeKey('Analyse ce fichier !')).toBe(normalizeKey('analyse   ce fichier'));
    c.set('routing', 'k', 1);
    expect(c.get('routing', 'k')).toBe(1);
    now = 11 * 60_000;
    expect(c.get('routing', 'k')).toBeUndefined(); // TTL 10 min
    c.set('task', 'k', 2);
    c.setVersion('v2');
    expect(c.get('task', 'k')).toBeUndefined();
    expect(c.hitRate()).toBeGreaterThan(0);
  });
  it('ROI gate: no remote call when JEV-0 is sure, when the value is below the cost or the daily budget is spent', () => {
    expect(
      roiGate({
        jev0Confidence: 0.9,
        missionCostEstimate: 0.5,
        callCost: 0.00002,
        mode: 'balanced',
        spentToday: 0,
        budgetDaily: 0.05,
      }).call,
    ).toBe(false);
    expect(
      roiGate({
        jev0Confidence: 0.4,
        missionCostEstimate: 0.5,
        callCost: 0.00002,
        mode: 'balanced',
        spentToday: 0,
        budgetDaily: 0.05,
      }).call,
    ).toBe(true);
    expect(
      roiGate({
        jev0Confidence: 0.4,
        missionCostEstimate: 0.00001,
        callCost: 0.00002,
        mode: 'balanced',
        spentToday: 0,
        budgetDaily: 0.05,
      }).call,
    ).toBe(false);
    expect(
      roiGate({
        jev0Confidence: 0.4,
        missionCostEstimate: 0.5,
        callCost: 0.00002,
        mode: 'balanced',
        spentToday: 0.05,
        budgetDaily: 0.05,
      }).call,
    ).toBe(false);
  });
  const ok =
    (body: unknown, status = 200) =>
    async () => ({
      ok: status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  it('JEV-1 success, API failure, malformed response and timeout (→ caller falls back to JEV-0)', async () => {
    const r = await callJev1(
      DEFAULT_JEV_API,
      'key',
      { request: 'x', attachments: [] },
      ok({
        model: 'jev-1.13.0',
        answers: {
          type: { choice: 'data', confidence: 0.97 },
          difficulty: { score: 1.5 },
          risk: { noul: 0.1 },
          needs_tools: { noul: 0.9 },
          ambiguity: { noul: 0.05 },
        },
        usage: { input_tokens: 420 },
      }),
    );
    expect(r).toMatchObject({ type: 'data', difficulty: 0.5, inputTokens: 420 });
    expect(r.costUsd).toBeCloseTo((420 * 0.042) / 1e6, 10);
    await expect(
      callJev1(DEFAULT_JEV_API, 'k', { request: 'x', attachments: [] }, ok({ error: 'down' }, 503)),
    ).rejects.toThrow(/503/);
    await expect(
      callJev1(DEFAULT_JEV_API, 'k', { request: 'x', attachments: [] }, ok({ nope: true })),
    ).rejects.toThrow(/mal formée/);
    const slow = (_u: string, i: { signal?: AbortSignal }) =>
      new Promise<never>((_, rej) =>
        i.signal?.addEventListener('abort', () =>
          rej(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        ),
      );
    await expect(
      callJev1({ ...DEFAULT_JEV_API, timeoutMs: 30 }, 'k', { request: 'x', attachments: [] }, slow as never),
    ).rejects.toThrow(/aborted/);
  });
  it('never shows or logs a key', () => {
    expect(maskSecret('ts_abcdefghijklmnop')).toBe('ts_a…nop');
    expect(redact('Authorization: Bearer sk-or-v1-abcdefabcdef1234 api_key=secret123')).not.toMatch(
      /abcdefabcdef1234|secret123/,
    );
  });
});

describe('metrics: KPIs, WITHOUT vs WITH JEV, model profiles', () => {
  const e = (
    jev: boolean,
    tokens: number,
    cost: number,
    success: boolean,
    extra: Partial<JevLogEntry> = {},
  ): JevLogEntry => ({
    id: Math.random().toString(36),
    at: Date.now(),
    session: 's',
    mission: 'm',
    task: 'data',
    mode: 'balanced',
    jev,
    level: 1,
    decisionBy: 'JEV-0',
    model: 'openai/gpt-6-luna',
    reason: '',
    tokensIn: tokens,
    tokensOut: 100,
    cost,
    jevCost: 0,
    latencyMs: 1000,
    decisionMs: 2,
    calls: 2,
    quality: success ? 90 : 40,
    success,
    retries: 0,
    escalations: 0,
    corrections: 0,
    cacheHits: 0,
    toolsOffered: jev ? 10 : 49,
    toolsBaseline: 49,
    toolTokens: jev ? 1500 : 7000,
    toolTokensBaseline: 7000,
    contextBefore: 9000,
    contextAfter: jev ? 3000 : 9000,
    checkpoints: [],
    ...extra,
  });
  it('measures real differences only', () => {
    const rows = compare([e(false, 20_000, 0.004, true)], [e(true, 8_000, 0.0016, true)]);
    const tok = rows.find((r) => r.metric === 'Tokens / mission')!;
    expect(tok.change).toBeCloseTo((8100 - 20100) / 20100, 5);
    const k = kpi([e(true, 8_000, 0.0016, true)]);
    expect(k.toolTokensSaved).toBe((7000 - 1500) * 2);
    expect(k.contextCompression).toBeCloseTo(2 / 3, 5);
    expect(compare([], []).every((r) => r.change === null)).toBe(true);
    expect(modelProfiles([e(true, 1, 0, true), e(true, 1, 0, true)])[0]!.strengths).toContain('data');
    expect(toCsv([e(true, 1, 0, true)]).split('\n').length).toBe(2);
  });
});
