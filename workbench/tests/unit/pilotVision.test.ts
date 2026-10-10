import { describe, expect, it } from 'vitest';
import { pilotAnchor } from '../../server/jev/omni/pilot';
import { bridgeKey, pickVisionModel, visionPrompt } from '../../server/jev/vision/bridge';

const m = (id: string, vision: boolean, inP: number | null, outP: number | null) =>
  ({ id, name: id, provider: id.split('/')[0], created: 0, contextLength: 32000, maxCompletionTokens: null, inputPrice: inP, outputPrice: outP, capabilities: { tools: true, reasoning: false, vision, structuredOutputs: false }, efforts: [], defaultEffort: null, description: '' }) as never;

describe('JEV vision bridge', () => {
  it('picks a free vision model first, a cheap paid one as safety net, never a text-only model', () => {
    const p = pickVisionModel([m('qwen/qwen3-flash', false, 0.05, 0.2), m('a/vl-free', true, 0, 0), m('b/vl-cheap', true, 0.1, 0.4), m('c/vl-dear', true, 3, 15)])!;
    expect(p.model).toBe('a/vl-free');
    expect(p.fallbacks[0]).toBe('b/vl-cheap');
    expect([p.model, ...p.fallbacks]).not.toContain('qwen/qwen3-flash');
  });
  it('no vision model in the catalogue → null (the chat says so instead of guessing)', () => {
    expect(pickVisionModel([m('x/text', false, 0, 0)])).toBeNull();
  });
  it('the prompt asks for verbatim OCR and forbids guessing; the cache key depends on image and question', () => {
    expect(visionPrompt('lis le total')).toMatch(/verbatim/);
    expect(visionPrompt('x')).toMatch(/illisible/);
    expect(bridgeKey('AAAA', 'q1')).not.toBe(bridgeKey('AAAA', 'q2'));
    expect(bridgeKey('AAAA', 'Q1 ')).toBe(bridgeKey('AAAA', 'q1'));
  });
});
describe('JEV pilot anchor', () => {
  it('restates the goal and pushes to deliver, then to verify, then to answer', () => {
    expect(pilotAnchor('Fais le rapport', ['filesystem.read'], 6, 20)).toMatch(/produce the deliverable/);
    expect(pilotAnchor('Fais le rapport', ['filesystem.write'], 12, 20)).toMatch(/verify the deliverable once/);
    expect(pilotAnchor('Fais le rapport', ['filesystem.write', 'code.run'], 18, 20)).toMatch(/finish now/);
    expect(pilotAnchor('Fais le rapport', [], 6, 20)).toContain('Fais le rapport');
  });
});

describe('vision candidates: a refusing model never blocks the design read', () => {
  const list = [m('free/eyes:free', true, 0, 0), m('google/gemini-2.5-flash-lite', true, 0.1, 0.4), m('z/other-vl', true, 0.05, 0.2), m('x/text', false, 0.01, 0.01), m('b/vl:batch', true, 0.01, 0.01)];
  it('reliable mode puts known-reliable cheap paid models first; cheap mode keeps free first; batch / text never', async () => {
    const { visionCandidates } = await import('../../server/jev/vision/bridge');
    expect(visionCandidates(list, null, new Set(), 'reliable')[0]).toBe('google/gemini-2.5-flash-lite');
    expect(visionCandidates(list, null, new Set(), 'cheap')[0]).toBe('free/eyes:free');
    expect(visionCandidates(list, null, new Set(), 'reliable')).not.toContain('x/text');
    expect(visionCandidates(list, null, new Set(), 'reliable')).not.toContain('b/vl:batch');
    expect(visionCandidates(list, null, new Set(['free/eyes:free']), 'cheap')).not.toContain('free/eyes:free');
    expect(visionCandidates(list, 'z/other-vl', new Set(), 'reliable')[0]).toBe('z/other-vl');
  });
  it('« only available on agentic harnesses », 403, 404 are permanent; 429 / 503 are not', async () => {
    const { permanentVisionError } = await import('../../server/jev/vision/bridge');
    expect(permanentVisionError(undefined, 'thinkingmachines/inkling-small:free is only available on agentic harnesses.')).toBe(true);
    expect(permanentVisionError(403, 'forbidden')).toBe(true);
    expect(permanentVisionError(404, 'No endpoints found')).toBe(true);
    expect(permanentVisionError(429, 'rate limited')).toBe(false);
    expect(permanentVisionError(503, 'overloaded')).toBe(false);
  });
  it('without any model, the colours of a design image are computed from its pixels', async () => {
    const { paletteFromPixels } = await import('../../server/services/imagePalette');
    const w = 60;
    const h = 40;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      const y = Math.floor(i / w);
      const c = y < 8 ? [194, 65, 12] : x > 45 && y > 20 ? [250, 204, 21] : y > 34 ? [28, 25, 23] : [255, 247, 237];
      px.set([...c, 255], i * 4);
    }
    const t = paletteFromPixels(px, w, h)!;
    expect(t.primary).toBe('#C2410C');
    expect(t.accent).toBe('#FACC15');
    expect(t.dark).toBe('#1C1917');
  });
});
