import { describe, expect, it } from 'vitest';
import type { ModelInfo } from '@shared/types';
import { SSEParser, normalizeModel, resolveEffort } from '../../server/llm/openrouter';
import { classifyTask, pickFromTier, selectModel } from '../../server/llm/router';
import { applyPromptCaching } from '../../server/llm/service';
import { DEFAULT_AUTO_TIERS } from '../../server/services/settings';

const model = (id: string, created: number, caps: Partial<ModelInfo['capabilities']> = {}): ModelInfo => ({
  id,
  name: id,
  provider: id.split('/')[0]!,
  created,
  contextLength: 100_000,
  maxCompletionTokens: null,
  inputPrice: 1,
  outputPrice: 2,
  capabilities: { tools: true, reasoning: false, vision: false, structuredOutputs: false, ...caps },
  efforts: [],
  defaultEffort: null,
  description: '',
});

describe('SSE parser', () => {
  it('handles chunks split across lines and comments', () => {
    const p = new SSEParser();
    expect(p.push(': keep-alive\n\ndata: {"a":')).toEqual([]);
    expect(p.push('1}\n\ndata: [DONE]\n')).toEqual(['{"a":1}', '[DONE]']);
  });
});

describe('model normalisation', () => {
  it('converts per-token prices to per-million and reads capabilities', () => {
    const m = normalizeModel({
      id: 'anthropic/claude-x',
      name: 'Anthropic: Claude X',
      created: 1,
      context_length: 200_000,
      architecture: { input_modalities: ['text', 'image'] },
      pricing: { prompt: '0.000003', completion: '0.000015' },
      supported_parameters: ['tools', 'reasoning'],
      reasoning: { supported_efforts: ['high', 'medium', 'low'], default_effort: 'medium' },
    });
    expect(m.inputPrice).toBe(3);
    expect(m.outputPrice).toBe(15);
    expect(m.provider).toBe('anthropic');
    expect(m.capabilities).toMatchObject({ tools: true, vision: true, reasoning: true });
    expect(m.efforts).toEqual(['high', 'medium', 'low']);
  });
  it('treats negative router prices as unknown', () => {
    expect(
      normalizeModel({ id: 'openrouter/auto', pricing: { prompt: '-1', completion: '-1' } }).inputPrice,
    ).toBeNull();
  });
  it('resolves the closest supported effort', () => {
    expect(resolveEffort('max', ['low', 'medium', 'high'])).toBe('high');
    expect(resolveEffort('minimal', ['low', 'medium', 'high'])).toBe('low');
    expect(resolveEffort('medium', [])).toBeNull();
  });
});

describe('AUTO router', () => {
  const models = [
    model('anthropic/claude-haiku-4', 10),
    model('anthropic/claude-haiku-5', 20),
    model('anthropic/claude-sonnet-5', 30, { vision: true }),
    model('anthropic/claude-opus-5', 40, { reasoning: true }),
    model('anthropic/claude-sonnet-5:free', 50),
    model('x/no-tools', 60, { tools: false }),
  ];
  it('classifies tasks', () => {
    expect(
      classifyTask({ text: 'renomme cette variable', hasImages: false, role: 'general', historyLength: 0 })
        .tier,
    ).toBe('fast');
    expect(
      classifyTask({
        text: 'Construis-moi une application complète de gestion de stock avec authentification et tableau de bord',
        hasImages: false,
        role: 'general',
        historyLength: 0,
      }).tier,
    ).toBe('powerful');
    expect(classifyTask({ text: 'x', hasImages: true, role: 'general', historyLength: 0 }).tier).toBe(
      'vision',
    );
    expect(classifyTask({ text: 'x', hasImages: false, role: 'reviewer', historyLength: 0 }).tier).toBe(
      'reasoning',
    );
  });
  it('picks the newest model of the first matching family, skipping :free', () => {
    expect(pickFromTier(models, DEFAULT_AUTO_TIERS.fast)?.id).toBe('anthropic/claude-haiku-5');
    expect(pickFromTier(models, ['^anthropic/claude-sonnet'])?.id).toBe('anthropic/claude-sonnet-5');
  });
  it('honours an explicit model and a precomputed classification', () => {
    const base = {
      models,
      tiers: DEFAULT_AUTO_TIERS,
      signals: { text: 'hello', hasImages: false, role: 'general', historyLength: 0 },
      fallbackDefault: 'x',
    };
    expect(selectModel({ ...base, requested: 'foo/bar' })).toMatchObject({ model: 'foo/bar', auto: false });
    expect(
      selectModel({ ...base, requested: 'auto', classified: { tier: 'powerful', reason: 'jev' } }).model,
    ).toBe('anthropic/claude-opus-5');
  });
});

describe('prompt caching', () => {
  it('adds cache breakpoints for Anthropic only', () => {
    const msgs = [
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'hi' },
    ];
    const out = applyPromptCaching('anthropic/claude-x', msgs);
    expect(out[0]!.content).toEqual([
      { type: 'text', text: 'system prompt', cache_control: { type: 'ephemeral' } },
    ]);
    expect(Array.isArray(out[1]!.content)).toBe(true);
    expect(msgs[0]!.content).toBe('system prompt'); // input untouched
    expect(applyPromptCaching('openai/gpt-x', msgs)).toBe(msgs);
  });
});
