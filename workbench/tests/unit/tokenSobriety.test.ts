import { describe, expect, it } from 'vitest';
import { trimOldToolOutputs } from '../../direct/lib/agent';
import type { ChatMessage } from '../../server/llm/types';

describe('v48 — token sobriety at every step', () => {
  it('old tool outputs keep their head; the last 8 messages stay whole', () => {
    const big = 'Error: real traceback first\n' + 'x'.repeat(20_000);
    const msgs: ChatMessage[] = [{ role: 'system', content: 's' }, ...Array.from({ length: 12 }, (_, i) => ({ role: 'tool', tool_call_id: `t${i}`, content: big }) as ChatMessage)];
    const out = trimOldToolOutputs(msgs);
    const lens = out.map((m) => (typeof m.content === 'string' ? m.content.length : 0));
    expect(lens.slice(1, 5).every((l) => l < 1100)).toBe(true);
    expect(lens.slice(-8).every((l) => l === big.length)).toBe(true);
    expect(String(out[1]!.content)).toContain('Error: real traceback first');
    const before = JSON.stringify(msgs).length;
    expect(JSON.stringify(out).length).toBeLessThan(before * 0.75);
  });
});
