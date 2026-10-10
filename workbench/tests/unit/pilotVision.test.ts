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
