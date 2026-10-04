import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { ModelInfo } from '@shared/types';
import {
  analyzeTask,
  estimateTaskCost,
  recordHealth,
  reliability,
  routeModel,
} from '../../server/llm/routing';
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
