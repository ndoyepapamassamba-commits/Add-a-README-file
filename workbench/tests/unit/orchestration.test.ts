import { unzipSync, strFromU8 } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModelInfo } from '@shared/types';
import {
  analyzeTask,
  estimateTaskCost,
  recordHealth,
  reliability,
  routeModel,
  categorize,
  metricFor,
  rankByValue,
  recordOutcome,
  leaderboardBoost,
  taskMatrix,
} from '../../server/llm/routing';
import {
  effortOf,
  intelData,
  intelMax,
  intelligenceInfo,
  parseIntel,
  setIntelData,
  type IntelData,
} from '../../server/llm/modelIntel';
import { DEFAULT_AUTO_TIERS } from '../../server/services/settings';
import { diagnose, formatDiagnosis } from '../../server/tools/diagnose';
import { markdownToDocx } from '../../server/services/officeCore';
import {
  changelogEntry,
  formatReport,
  memoryDigest,
  normalizeReport,
  reviewApproved,
} from '../../server/agent/mission';

const m = (
  id: string,
  created: number,
  caps: Partial<ModelInfo['capabilities']> = {},
  price = 1,
): ModelInfo => ({
  id,
  name: id,
  provider: id.split('/')[0]!,
  created,
  contextLength: 200_000,
  maxCompletionTokens: null,
  inputPrice: price,
  outputPrice: price * 5,
  capabilities: { tools: true, reasoning: false, vision: false, structuredOutputs: false, ...caps },
  efforts: [],
  defaultEffort: null,
  description: '',
});
const MODELS = [
  m('anthropic/claude-haiku-4.5', 10, {}, 1),
  m('anthropic/claude-sonnet-4.5', 20, { vision: true }, 3),
  m('anthropic/claude-opus-4.5', 30, { reasoning: true }, 15),
  m('google/gemini-2.5-flash', 15, { vision: true }, 0.3),
  m('openai/gpt-5-mini', 16, {}, 0.25),
];

describe('task analysis & multi-model routing', () => {
  it('profiles difficulty, type and team', () => {
    expect(analyzeTask({ text: 'bonjour' }).tier).toBe('cheap');
    // High-stakes deliverables are never routed to the cheapest tier.
    const comex = analyzeTask({ text: 'Analyse le portefeuille IFRS9 et prépare le rapport COMEX' });
    expect(comex.tier).not.toBe('cheap');
    expect(comex.reasons).toContain('enjeu critique');
    const data = analyzeTask({ text: 'Analyse ce fichier', attachmentNames: ['ventes.xlsx'] });
    expect(data.type).toBe('data');
    const hard = analyzeTask({
      text: 'Construis une application complète de gestion de stock avec architecture propre, tests et sécurité',
      mission: true,
    });
    expect(['quality', 'maximum']).toContain(hard.tier);
    expect(hard.team).toEqual(
      expect.arrayContaining(['architect', 'coder', 'qa_engineer', 'final_reviewer']),
    );
  });
  it('routes to the tier family and builds a cross-provider fallback chain', () => {
    const cheap = routeModel(MODELS, DEFAULT_AUTO_TIERS, analyzeTask({ text: 'traduis bonjour' }))!;
    expect(cheap.model).toBe('anthropic/claude-haiku-4.5');
    expect(cheap.fallbacks.length).toBe(2);
    expect(cheap.fallbacks.some((f) => !f.startsWith('anthropic/'))).toBe(true);
    const max = routeModel(MODELS, DEFAULT_AUTO_TIERS, { ...analyzeTask({ text: 'x' }), tier: 'maximum' })!;
    expect(max.model).toBe('anthropic/claude-opus-4.5');
    const vis = routeModel(MODELS, DEFAULT_AUTO_TIERS, { ...analyzeTask({ text: 'x', hasImages: true }) })!;
    expect(MODELS.find((x) => x.id === vis.model)!.capabilities.vision).toBe(true);
    expect(cheap.estimate!.high).toBeGreaterThan(cheap.estimate!.low);
  });
  it('avoids a model that just failed', () => {
    let h = recordHealth({}, 'anthropic/claude-haiku-4.5', false);
    expect(reliability(h, 'anthropic/claude-haiku-4.5')).toBeLessThan(0.3);
    const r = routeModel(MODELS, DEFAULT_AUTO_TIERS, analyzeTask({ text: 'traduis bonjour' }), h)!;
    expect(r.model).not.toBe('anthropic/claude-haiku-4.5');
    h = recordHealth(h, 'anthropic/claude-haiku-4.5', true, Date.now() + 300_000);
    expect(reliability(h, 'anthropic/claude-haiku-4.5', Date.now() + 300_000)).toBeGreaterThan(0.4);
    expect(
      estimateTaskCost(MODELS[0], { difficulty: 0.5, contextTokens: 10_000 }, true)!.low,
    ).toBeGreaterThan(0);
  });
});

// Test scores injected through the same API as a live refresh (deterministic).
const entry = (intelligence: number, coding: number | null = null, agentic: number | null = null) => ({
  name: 'test',
  intelligence,
  coding,
  agentic,
  effort: 'high',
  variants: { high: intelligence },
});
const TEST_INTEL: IntelData = {
  source: 'test',
  url: '',
  fetchedAt: '2026-10-04T00:00:00Z',
  models: {
    'anthropic/claude-opus-5.5-20260921': { ...entry(57.6, 80, 60), name: 'Opus' },
    'anthropic/claude-sonnet-5.5-20260928': { ...entry(56, 78, 58), name: 'Sonnet' },
    'openai/gpt-5.6-sol-20260709': { ...entry(47, 77, 50), name: 'Sol' },
    'openai/gpt-6-luna-20260922': { ...entry(38.1, 60, 35), name: 'Luna6' },
    'xiaomi/mimo-v2.6-flash-20260921': { ...entry(37.9, 58, 30), name: 'MimoFlash' },
    'xiaomi/mimo-v2.6-pro-20260921': { ...entry(46.3, 66, 40), name: 'MimoPro' },
    'z-ai/glm-5.3-flash-20260826': { ...entry(41.8, 71.5, 50.9), name: 'GlmFlash' },
    'inclusionai/ling-3.0-flash-20260723': { ...entry(20.1, 50.6, 19.3), name: 'Ling' },
    'meta/muse-spark-1.3-contributor-20260901': { ...entry(46.6), name: 'Contrib' },
  },
  ids: {},
};
const mp = (
  id: string,
  slug: string,
  i: number,
  o: number,
  caps: Partial<ModelInfo['capabilities']> = {},
): ModelInfo => ({ ...m(id, 1, caps), slug, inputPrice: i, outputPrice: o });
const LIVE = [
  mp('anthropic/claude-opus-5.5', 'anthropic/claude-opus-5.5-20260921', 4, 20, { vision: true }),
  mp('anthropic/claude-sonnet-5.5', 'anthropic/claude-sonnet-5.5-20260928', 2, 10, { vision: true }),
  mp('openai/gpt-5.6-sol', 'openai/gpt-5.6-sol-20260709', 2, 10, { vision: true }),
  mp('openai/gpt-6-luna', 'openai/gpt-6-luna-20260922', 0.1, 0.5, { vision: true }),
  mp('openai/gpt-6-luna-pro', 'openai/gpt-6-luna-pro-20260922', 0.1, 0.5, { vision: true }),
  mp('xiaomi/mimo-v2.6-flash', 'xiaomi/mimo-v2.6-flash-20260921', 0.14, 0.28, { vision: true }),
  mp('xiaomi/mimo-v2.6-pro', 'xiaomi/mimo-v2.6-pro-20260921', 0.435, 0.87, { vision: true }),
  mp('z-ai/glm-5.3-flash', 'z-ai/glm-5.3-flash-20260826', 0.15, 0.5),
  mp('inclusionai/ling-3.0-flash', 'inclusionai/ling-3.0-flash-20260723', 0.02, 0.06),
  mp('meta/muse-spark-1.3-contributor', 'meta/muse-spark-1.3-contributor-20260901', 0.1, 0.2, {
    vision: true,
  }),
  mp('openai/gpt-6-luna:free', 'openai/gpt-6-luna-20260922', 0, 0),
];
const tierP = (tier: 'cheap' | 'balanced' | 'quality' | 'maximum', text = 'x') => ({
  ...analyzeTask({ text }),
  tier,
});

describe('value routing: cheapest model that is intelligent enough, provider-neutral', () => {
  let saved: IntelData;
  beforeAll(() => {
    saved = intelData();
    setIntelData(TEST_INTEL);
  });
  afterAll(() => {
    setIntelData(saved);
  });
  it('parses the OpenRouter benchmark payload (variants, effort, id mapping)', () => {
    const d = parseIntel(
      {
        data: [
          {
            aa_name: 'M (Non-reasoning)',
            permaslug: 'p/m-20260101',
            benchmark_data: {
              model_type: 'llm',
              evaluations: { artificial_analysis_intelligence_index: 10 },
            },
          },
          {
            aa_name: 'M (high)',
            permaslug: 'p/m-20260101',
            benchmark_data: {
              model_type: 'llm',
              evaluations: {
                artificial_analysis_intelligence_index: 30,
                artificial_analysis_coding_index: 50,
              },
            },
          },
          {
            aa_name: 'M (max)',
            permaslug: 'p/m-20260101',
            benchmark_data: {
              model_type: 'llm',
              evaluations: { artificial_analysis_intelligence_index: 34 },
            },
          },
          { aa_name: 'Img', permaslug: 'p/img', benchmark_data: { model_type: 'text-to-image' } },
        ],
      },
      [{ id: 'p/m', canonical_slug: 'p/m-20260101' }],
    );
    expect(d.models['p/m-20260101']).toMatchObject({ intelligence: 30, coding: 50, effort: 'high' });
    expect(d.models['p/m-20260101']!.variants).toEqual({ none: 10, high: 30, max: 34 });
    expect(d.ids['p/m']).toBe('p/m-20260101');
    expect(d.models['p/img']).toBeUndefined();
    expect(effortOf('Claude Opus 5 (Adaptive Reasoning, Xhigh Effort)')).toBe('xhigh');
  });
  it('matches ids, slugs and unmeasured twins (estimated)', () => {
    expect(intelligenceInfo('x', 'openai/gpt-6-luna-20260922')!.score).toBe(38.1);
    expect(intelligenceInfo('openai/gpt-6-luna')!.estimated).toBe(false); // undated slug
    const twin = intelligenceInfo('openai/gpt-6-luna-pro', 'openai/gpt-6-luna-pro-20260922')!;
    expect(twin.estimated).toBe(true);
    expect(twin.score).toBeLessThan(38.1);
    expect(intelligenceInfo('nobody/unknown-model-x')).toBeNull();
    expect(intelMax()).toBe(57.6);
  });
  it('never picks a dearer and less intelligent model; fallback = next of the list', () => {
    const cheap = routeModel(LIVE, DEFAULT_AUTO_TIERS, tierP('cheap'))!;
    expect(cheap.model).toBe('openai/gpt-6-luna');
    expect(cheap.fallbacks[0]).toBe('xiaomi/mimo-v2.6-flash');
    // Sonnet 5.5 and GPT-5.6 Sol cost the same: the smarter one (Sonnet) wins — on merit, not provider.
    const q = routeModel(LIVE, DEFAULT_AUTO_TIERS, tierP('quality'))!;
    expect(q.model).toBe('anthropic/claude-sonnet-5.5');
    const max = routeModel(LIVE, DEFAULT_AUTO_TIERS, tierP('maximum'))!;
    expect(max.model).toBe('anthropic/claude-sonnet-5.5');
    expect(max.fallbacks[0]).toBe('anthropic/claude-opus-5.5');
    for (const r of [cheap, q, max]) {
      expect([r.model, ...r.fallbacks].some((id) => /contributor|:free|luna-pro/.test(id))).toBe(false);
      const ranked = rankByValue(LIVE, tierP(r.tier));
      expect(r.fallbacks).toEqual(ranked.slice(1, 3).map((x) => x.m.id));
      for (let i = 1; i < ranked.length; i++)
        expect(ranked[i]!.price).toBeGreaterThanOrEqual(ranked[i - 1]!.price * 0.9);
      const first = ranked[0]!;
      expect(ranked.some((x) => x.price < first.price * 0.9 && x.score > first.score)).toBe(false);
    }
  });
  it('a Claude model loses when it is dearer and less intelligent', () => {
    setIntelData({
      ...TEST_INTEL,
      models: {
        ...TEST_INTEL.models,
        'openai/gpt-5.6-sol-20260709': { ...entry(57.6, 80, 60), name: 'Sol+' },
      },
    });
    const max = routeModel(LIVE, DEFAULT_AUTO_TIERS, tierP('maximum'))!;
    expect(max.model).toBe('openai/gpt-5.6-sol'); // same price as Sonnet, smarter, cheaper than Opus
    setIntelData(TEST_INTEL);
  });
  it('code tasks use the coding index with a floor of general intelligence', () => {
    const code = routeModel(LIVE, DEFAULT_AUTO_TIERS, tierP('balanced', 'corrige ce bug python'))!;
    expect(code.metric).toBe('coding');
    expect(code.model).not.toBe('inclusionai/ling-3.0-flash'); // coding 50 but intelligence 20
    expect(metricFor('browser')).toBe('agentic');
  });
  it('a failing model is skipped and the personal leaderboard nudges the ranking', () => {
    const h = recordHealth({}, 'openai/gpt-6-luna', false);
    const r = routeModel(LIVE, DEFAULT_AUTO_TIERS, tierP('cheap'), h)!;
    expect(r.model).not.toBe('openai/gpt-6-luna');
    let b = recordOutcome({}, 'xiaomi/mimo-v2.6-flash', true);
    b = recordOutcome(b, 'xiaomi/mimo-v2.6-flash', true);
    expect(leaderboardBoost(b, 'xiaomi/mimo-v2.6-flash')).toBeGreaterThan(1);
    expect(leaderboardBoost(recordOutcome({}, 'a/b', false), 'a/b')).toBeLessThan(0);
  });
  it('vision only gets vision models; categories and the task matrix are complete', () => {
    const v = routeModel(LIVE, DEFAULT_AUTO_TIERS, analyzeTask({ text: 'décris', hasImages: true }))!;
    expect(LIVE.find((x) => x.id === v.model)!.capabilities.vision).toBe(true);
    const cats = categorize(LIVE);
    expect(cats.map((c) => c.key)).toEqual([
      'cheap',
      'balanced',
      'quality',
      'maximum',
      'code',
      'agentic',
      'vision',
      'long',
      'value',
    ]);
    for (const c of cats) {
      if (c.key !== 'long') expect(c.best).not.toBeNull(); // test models have 200 k context
      if (c.backup) expect(c.backup.m.id).not.toBe(c.best!.m.id);
    }
    const tm = taskMatrix(LIVE, DEFAULT_AUTO_TIERS);
    expect(tm.length).toBeGreaterThan(8);
    expect(tm.every((t) => t.model)).toBe(true);
  });
});

describe('smart terminal diagnosis', () => {
  it('categorises failures and extracts locations', () => {
    const d = diagnose(
      "src/app.ts(12,5): error TS2322: Type 'string' is not assignable\nnpm ERR! code 2",
      2,
    )!;
    expect(d.category).toMatch(/TypeScript/);
    expect(d.locations).toContain('src/app.ts:12');
    expect(formatDiagnosis(d)).toContain('ERROR → ANALYSIS');
    expect(diagnose("Error: Cannot find module 'express'", 1)!.hints[0]).toMatch(/npm install/);
    expect(diagnose('ok', 0)).toBeNull();
  });
});

describe('office export', () => {
  it('converts Markdown to a valid .docx', () => {
    const bytes = markdownToDocx(
      '# Rapport\n\nTexte **gras** et `code`.\n\n- point 1\n- point 2\n\n| A | B |\n|---|---|\n| 1 | 2 |\n',
      'Titre',
    );
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(['[Content_Types].xml', 'word/document.xml', 'word/styles.xml']),
    );
    const doc = strFromU8(files['word/document.xml']!);
    expect(doc).toContain('Heading1');
    expect(doc).toContain('<w:tbl>');
    expect(doc).toContain('gras');
  });
  it('embeds referenced PNG charts in the .docx', () => {
    const png = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    const bytes = markdownToDocx(
      '# R\n\n![Encours](outputs/charts/encours.png)\n\n![Absent](nope.png)\n',
      undefined,
      (src) => (src === 'outputs/charts/encours.png' ? { data: png, type: 'png' } : null),
    );
    const files = unzipSync(bytes);
    expect(files['word/media/image1.png']).toBeTruthy();
    const doc = strFromU8(files['word/document.xml']!);
    expect(doc).toContain('<w:drawing>');
    expect(doc).toContain('[Image : Absent]');
    expect(strFromU8(files['word/_rels/document.xml.rels']!)).toContain('media/image1.png');
  });
});

describe('mission protocol', () => {
  it('normalises reports, formats them and parses review verdicts', () => {
    const r = normalizeReport({
      status: 'partial',
      summary: 'ok',
      checks: [
        { name: 'build', status: 'PASS' },
        { name: 'e2e', status: 'weird' },
      ],
      issues: ['x'],
    });
    expect(r.status).toBe('PARTIAL');
    expect(r.checks.map((c) => c.status)).toEqual(['pass', 'skip']);
    expect(formatReport(r)).toContain('✅ build');
    expect(reviewApproved('VERDICT: APPROVED\nRAS')).toBe(true);
    expect(reviewApproved('VERDICT: CHANGES_REQUIRED\n- bug')).toBe(false);
    expect(changelogEntry('Construis X', r, { model: 'm', cost: 0.01 })).toContain('PARTIAL — Construis X');
  });
  it('builds a memory digest that skips untouched templates', () => {
    const d = memoryDigest({
      PROJECT: '# Shop\n\nBoutique Wave.',
      TODO: '# À faire\n\n- [ ] \n',
      CHANGELOG: '# Journal\n## 2026 — PASSED — v1',
    });
    expect(d).toContain('Boutique Wave');
    expect(d).toContain('PASSED — v1');
  });
});
