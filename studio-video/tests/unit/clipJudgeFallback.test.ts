import { describe, expect, it } from 'vitest';
import { parseClipJudgement, pickJudgeFallback, stripReasoning } from '../../coeur/studio/clipInspect';

const JSON_OK = '{"rire":6,"mouvement":7,"expressions":5,"bouche":4,"anatomie":8,"coherence":7,"defects":["bras étiré"],"fix":"keep arms rigid"}';

describe('visual judge — unreadable answers (the v56 film: 7 scenes « réponse illisible »)', () => {
  it('reads the JSON behind a reasoning preamble or a <think> block, and inside a code fence', () => {
    expect(parseClipJudgement(`We need answer JSON only. Need evaluate 6 images in order.\n${JSON_OK}`)!.scores.rire).toBe(6);
    expect(parseClipJudgement(`<think>let me look at the frames {not json}</think>\n\`\`\`json\n${JSON_OK}\n\`\`\``)!.scores.anatomie).toBe(8);
    expect(stripReasoning('<think>a</think>b')).toBe('b');
  });
  it('an empty or cut answer stays unreadable (no invented score)', () => {
    expect(parseClipJudgement('')).toBeNull();
    expect(parseClipJudgement('We need answer JSON only. Need evaluate 6 images in order. N')).toBeNull();
    expect(parseClipJudgement('{"rire": 6}')).toBeNull();
  });
  it('the second attempt goes to another vision model: structured outputs first, non-reasoning first, cheapest first', () => {
    const m = (id: string, vision: boolean, structuredOutputs: boolean, reasoning: boolean, price: number) => ({ id, capabilities: { vision, structuredOutputs, reasoning, tools: true }, inputPrice: price, outputPrice: price });
    const models = [m('deepseek/deepseek-v4.1-flash', true, false, true, 0.3), m('text-only', false, true, false, 0.1), m('google/gemini-2.5-flash', true, true, false, 0.4), m('openai/gpt-5-mini', true, true, false, 0.6), m('x/reasoner-vision', true, true, true, 0.2)];
    expect(pickJudgeFallback(models, 'deepseek/deepseek-v4.1-flash')).toBe('google/gemini-2.5-flash');
    expect(pickJudgeFallback(models, 'google/gemini-2.5-flash')).toBe('openai/gpt-5-mini');
    expect(pickJudgeFallback([m('only', true, false, true, 1)], 'only')).toBeNull();
  });
});
