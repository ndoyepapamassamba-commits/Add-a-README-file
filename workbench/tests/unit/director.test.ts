import { describe, expect, it } from 'vitest';
import { LOCAL_ANIMATION, costLabel, planAnimation, planImages, planWriting, priorQuality, scoreOf, totalUsd } from '../../server/jev/studio/director';

const media = (id: string, kind: 'image' | 'video', caps: string[], latencyMs: number | null = null) =>
  ({ id, name: id, kind, created: 0, description: '', caps, voices: [], pricing: {}, latencyMs }) as never;
const shape = { scenes: 6, seconds: 48, dialogueChars: 600 };

describe('film model orchestrator', () => {
  it('ranks image models on quality, cost and Afrikatoon fidelity (reference images matter)', () => {
    const p = planImages(
      [media('openai/gpt-image-1', 'image', ['IMAGE_GENERATION', 'REFERENCE_IMAGES']), media('x/sdxl', 'image', ['IMAGE_GENERATION']), media('google/gemini-2.5-flash-image', 'image', ['IMAGE_GENERATION', 'REFERENCE_IMAGES'])],
      (m) => ({ usd: (m as { id: string }).id.includes('gpt') ? 0.04 : 0.01, certain: false, formula: '' }),
      shape,
    );
    expect(p.recommended).not.toBe('x/sdxl');
    expect(p.options[0]!.afrikatoon).toBeGreaterThan(p.options.find((o) => o.id === 'x/sdxl')!.afrikatoon);
    expect(p.options.find((o) => o.id === 'openai/gpt-image-1')!.stageUsd).toBeCloseTo(0.24, 5);
  });
  it('animation always offers the free 2.5D option and respects the budget', () => {
    const p = planAnimation([media('google/veo-3', 'video', ['IMAGE_TO_VIDEO'])], () => ({ usd: 2, certain: false, formula: '' }), shape, [], 1);
    expect(p.options.some((o) => o.id === LOCAL_ANIMATION)).toBe(true);
    expect(p.recommended).toBe(LOCAL_ANIMATION); // 6 × 2 $ does not fit a 1 $ budget
    const rich = planAnimation([media('google/veo-3', 'video', ['IMAGE_TO_VIDEO'])], () => ({ usd: 0.3, certain: false, formula: '' }), shape, [], 10);
    expect(rich.recommended).toBe('google/veo-3');
  });
  it('measured quality replaces the prior after 3 judged runs', () => {
    const mem = [1, 2, 3].map((i) => ({ id: String(i), at: i, projectId: 'p', kind: 'image', task: '', style: '', contract: '', risk: 'low', model: 'x/sdxl', success: true, quality: 95, cost: 0.01, latencyMs: 1000 })) as never;
    const p = planImages([media('x/sdxl', 'image', ['IMAGE_GENERATION'])], () => ({ usd: 0.01, certain: true, formula: '' }), shape, mem);
    expect(p.options[0]!.qualitySource).toBe('mesurée');
    expect(p.options[0]!.quality).toBe(9.5);
  });
  it('writing plan, labels, totals', () => {
    const w = planWriting([{ id: 'anthropic/claude-sonnet-4.5', name: 'Sonnet', inputPrice: 3, outputPrice: 15 }, { id: 'meta/llama-3-8b', name: 'Llama', inputPrice: 0.05, outputPrice: 0.1 }]);
    expect(w.options).toHaveLength(2);
    expect(priorQuality('video', 'google/veo-3')).toBeGreaterThan(priorQuality('video', 'x/unknown'));
    expect(costLabel(0)).toBe('Gratuit');
    expect(costLabel(null)).toBe('Non chiffré');
    expect(scoreOf({ quality: 9, afrikatoon: 9, stageUsd: 0, speed: 'Rapide' })).toBeGreaterThan(scoreOf({ quality: 9, afrikatoon: 9, stageUsd: 5, speed: 'Lent' }));
    expect(totalUsd([w], {})).toBeGreaterThan(0);
  });
});
