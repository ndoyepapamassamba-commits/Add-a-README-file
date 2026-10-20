import { describe, expect, it } from 'vitest';
import {
  listProviderModels,
  parseRoute,
  priceFromCatalog,
  toAnthropic,
  universalChat,
} from '../../server/llm/universal';
import { KeyVault, type StoreLike } from '../../server/llm/keyVault';
import { Telemetry } from '../../server/llm/telemetry';

const memStore = (): StoreLike & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};
/** A streamed HTTP response from SSE lines. */
const stream = (lines: string[], headers: Record<string, string> = {}, status = 200) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const l of lines) c.enqueue(new TextEncoder().encode(`${l}\n\n`));
        c.close();
      },
    }),
    { status, headers },
  );
type Sent = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

describe('ROUTEUR UNIVERSEL', () => {
  it('reads « provider:model » routes and leaves OpenRouter ids alone', () => {
    expect(parseRoute('anthropic:claude-sonnet-4-5')).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
    });
    expect(parseRoute('ollama:llama3.2:3b')).toEqual({ provider: 'ollama', model: 'llama3.2:3b' });
    expect(parseRoute('anthropic/claude-sonnet-4.5')).toBeNull();
  });
  it('converts a tool conversation to the Anthropic format (system apart, tool_use / tool_result, merged turns)', () => {
    const r = toAnthropic([
      { role: 'system', content: 'Tu es un assistant 3D.' },
      { role: 'user', content: 'Crée un cube' },
      {
        role: 'assistant',
        content: 'Je lance.',
        tool_calls: [
          { id: 't1', type: 'function', function: { name: 'three.run', arguments: '{"code":"x"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 't1', content: 'ok' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'et ça ?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
        ],
      },
    ]);
    expect(r.system).toBe('Tu es un assistant 3D.');
    expect(r.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(r.messages[1]!.content[1]).toEqual({
      type: 'tool_use',
      id: 't1',
      name: 'three.run',
      input: { code: 'x' },
    });
    expect(r.messages[2]!.content[0]).toEqual({ type: 'tool_result', tool_use_id: 't1', content: 'ok' });
    expect(r.messages[2]!.content[2]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'QUJD' },
    });
  });
  it('Anthropic: streams text and a tool call, reports usage, TTFT and tokens/s, sends the browser-access header', async () => {
    let sent: Sent | null = null;
    let t = 0;
    const res = await universalChat(
      { provider: 'anthropic', model: 'claude-x' },
      {
        model: 'anthropic:claude-x',
        messages: [{ role: 'user', content: 'cube' }],
        tools: [
          {
            type: 'function',
            function: { name: 'three.run', description: 'run', parameters: { type: 'object' } },
          },
        ],
      },
      {
        key: 'sk-ant-test',
        now: () => (t += 100),
        fetch: async (url, init) => {
          sent = { url, headers: init.headers, body: JSON.parse(init.body!) };
          return stream(
            [
              'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":40}}}',
              'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
              'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Voici "}}',
              'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"le cube."}}',
              'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu1","name":"three.run"}}',
              'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"code\\":"}}',
              'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"a\\"}"}}',
              'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":20}}',
            ],
            { 'anthropic-ratelimit-requests-remaining': '49' },
          );
        },
      },
    );
    expect(sent!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(sent!.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(sent!.headers['x-api-key']).toBe('sk-ant-test');
    expect((sent!.body.tools as { input_schema: unknown }[])[0]!.input_schema).toEqual({ type: 'object' });
    expect(res.content).toBe('Voici le cube.');
    expect(res.toolCalls).toEqual([
      { id: 'tu1', type: 'function', function: { name: 'three.run', arguments: '{"code":"a"}' } },
    ]);
    expect(res.finishReason).toBe('tool_calls');
    expect(res.usage).toMatchObject({ promptTokens: 40, completionTokens: 20 });
    expect(res.metrics.ttftMs).toBe(100);
    expect(res.metrics.tokensPerS).toBeGreaterThan(0);
    expect(res.metrics.usageReported).toBe(true);
    expect(res.metrics.remainingRequests).toBe(49);
  });
  it('OpenAI-compatible (Groq, Ollama…): text + streamed tool call arguments + usage; local servers need no key', async () => {
    let sent: Sent | null = null;
    const res = await universalChat(
      { provider: 'ollama', model: 'llama3.2' },
      { model: 'ollama:llama3.2', messages: [{ role: 'user', content: 'x' }] },
      {
        key: '',
        fetch: async (url, init) => {
          sent = { url, headers: init.headers, body: JSON.parse(init.body!) };
          return stream([
            'data: {"choices":[{"delta":{"content":"Bon"}}]}',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"three.run","arguments":"{\\"co"}}]}}]}',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"de\\":1}"}}]},"finish_reason":"tool_calls"}]}',
            'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":7}}',
            'data: [DONE]',
          ]);
        },
      },
    );
    expect(sent!.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(sent!.headers.authorization).toBeUndefined();
    expect(sent!.body.stream_options).toEqual({ include_usage: true });
    expect(res.content).toBe('Bon');
    expect(res.toolCalls[0]!.function).toEqual({ name: 'three.run', arguments: '{"code":1}' });
    expect(res.usage.completionTokens).toBe(7);
  });
  it('a provider without usage in its stream: tokens are estimated and marked as such; HTTP errors are explicit', async () => {
    const res = await universalChat(
      { provider: 'mistral', model: 'm' },
      { model: 'mistral:m', messages: [{ role: 'user', content: 'x' }] },
      {
        key: 'k',
        fetch: async () => stream(['data: {"choices":[{"delta":{"content":"12345678"}}]}', 'data: [DONE]']),
      },
    );
    expect(res.metrics.usageReported).toBe(false);
    expect(res.usage.completionTokens).toBe(2);
    await expect(
      universalChat(
        { provider: 'openai', model: 'g' },
        { model: 'openai:g', messages: [] },
        { key: '', fetch: async () => stream([]) },
      ),
    ).rejects.toThrow(/Clé OpenAI absente/);
    await expect(
      universalChat(
        { provider: 'groq', model: 'g' },
        { model: 'groq:g', messages: [] },
        { key: 'k', fetch: async () => stream([], { 'retry-after': '7' }, 429) },
      ),
    ).rejects.toMatchObject({ status: 429, retryAfterS: 7 });
  });
  it('lists models and finds public prices only when the same model is in the catalogue', async () => {
    const ids = await listProviderModels('gemini', {
      key: 'k',
      fetch: async () =>
        new Response(
          JSON.stringify({ data: [{ id: 'models/gemini-2.5-flash' }, { id: 'models/gemini-2.5-pro' }] }),
        ),
    });
    expect(ids).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro']);
    const cat = [{ id: 'anthropic/claude-sonnet-4.5', inputPrice: 3, outputPrice: 15 }];
    expect(priceFromCatalog('anthropic', 'claude-sonnet-4-5-20250929', cat)).toMatchObject({
      input: 3,
      output: 15,
    });
    expect(priceFromCatalog('groq', 'llama-3.3-70b', cat)).toBeNull();
    expect(priceFromCatalog('ollama', 'llama3.2', cat)).toMatchObject({ input: 0, output: 0 });
  });
});

describe('COFFRE-FORT DE CLÉS', () => {
  it('stores only ciphertext; the right password opens it, a wrong one does not', async () => {
    const s = memStore();
    const v = new KeyVault(s, 1000);
    expect(await v.unlock('motdepasse-maitre')).toBe(true);
    await v.add('anthropic', 'sk-ant-SECRET-123456', 'perso');
    expect([...s.m.values()].join('')).not.toContain('SECRET');
    expect(v.list()[0]).toMatchObject({ provider: 'anthropic', masked: 'sk-ant…3456' });
    const v2 = new KeyVault(s, 1000);
    expect(await v2.unlock('mauvais-mot-de-passe')).toBe(false);
    expect(v2.unlocked).toBe(false);
    expect(await v2.unlock('motdepasse-maitre')).toBe(true);
    expect(v2.secret(v2.list()[0]!.id)).toBe('sk-ant-SECRET-123456');
    await expect(new KeyVault(memStore(), 1000).unlock('court')).rejects.toThrow(/8 caractères/);
  });
  it('rotates keys, rests a rate-limited key until its Retry-After, sets a refused key aside', async () => {
    let t = 1_000_000;
    const v = new KeyVault(memStore(), 1000, () => t);
    await v.unlock('motdepasse-maitre');
    const a = await v.add('groq', 'gsk_A');
    t++;
    const b = await v.add('groq', 'gsk_B');
    expect(v.pick('groq')!.id).toBe(a);
    t++;
    v.record(a, { tokensIn: 10, tokensOut: 5, costUsd: 0.001, remainingRequests: 99 });
    expect(v.pick('groq')!.id).toBe(b);
    v.fail(b, 429, 'rate limit', 30);
    expect(v.pick('groq')!.id).toBe(a);
    v.fail(a, 401, 'invalid key');
    expect(v.pick('groq')).toBeNull();
    t += 31_000;
    expect(v.pick('groq')!.id).toBe(b);
    expect(v.list().find((k) => k.id === a)!.usage).toMatchObject({
      calls: 1,
      tokensIn: 10,
      refused: true,
      remainingRequests: 99,
    });
    v.reset(a);
    expect(v.available('groq')).toBe(2);
  });
});

describe('TÉLÉMÉTRIE & COÛTS', () => {
  it('summarises cost, TTFT and tokens/s per model; unknown costs are counted apart, never as 0 $', () => {
    const tl = new Telemetry(memStore());
    const base = {
      provider: 'anthropic',
      model: 'claude-x',
      purpose: '3d',
      ok: true,
      tokensIn: 100,
      tokensOut: 50,
      totalMs: 900,
      costSource: 'calculated' as const,
    };
    tl.record({ ...base, at: Date.UTC(2026, 9, 1), costUsd: 0.01, ttftMs: 300, tokensPerS: 40 });
    tl.record({ ...base, at: Date.UTC(2026, 9, 1), costUsd: 0.02, ttftMs: 500, tokensPerS: 60 });
    tl.record({
      ...base,
      at: Date.UTC(2026, 9, 2),
      provider: 'groq',
      model: 'llama',
      costUsd: null,
      costSource: 'unknown',
      ttftMs: 80,
      tokensPerS: 400,
    });
    const m = tl.byModel();
    expect(m[0]).toMatchObject({ model: 'claude-x', calls: 2, costUsd: 0.03, ttftP50: 500, tpsMedian: 60 });
    expect(m[1]).toMatchObject({ model: 'llama', unknownCost: 1, costUsd: 0 });
    expect(tl.byDay()).toEqual([
      { day: '2026-10-01', costUsd: 0.03, calls: 2 },
      { day: '2026-10-02', costUsd: 0, calls: 1 },
    ]);
    expect(tl.totals()).toMatchObject({ calls: 3, costUsd: 0.03, unknownCost: 1, purposes: { '3d': 0.03 } });
  });
});
