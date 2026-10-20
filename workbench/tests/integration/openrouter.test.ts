import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OpenRouterProvider } from '../../server/llm/openrouter';
import { LLMError } from '../../server/llm/types';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';

let mock: MockOpenRouter;
let raw: http.Server;
let rawUrl = '';
let rawHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void = (_q, r) => r.end();

const provider = (baseUrl: string, idleTimeoutMs?: number) =>
  new OpenRouterProvider({
    baseUrl,
    appUrl: 'http://localhost',
    appName: 'test',
    getApiKey: () => 'sk-or-v1-test',
    idleTimeoutMs,
  });

beforeAll(async () => {
  mock = await startMockOpenRouter();
  raw = http.createServer((q, r) => rawHandler(q, r));
  await new Promise<void>((r) => raw.listen(0, '127.0.0.1', () => r()));
  rawUrl = `http://127.0.0.1:${(raw.address() as AddressInfo).port}/api/v1`;
});
afterAll(async () => {
  await mock.close();
  raw.closeAllConnections();
  await new Promise((r) => raw.close(r));
});

describe('OpenRouterProvider', () => {
  it('lists and normalises models', async () => {
    const models = await provider(mock.url).listModels();
    expect(models[1]).toMatchObject({
      id: 'mock/smart-2',
      inputPrice: 3,
      outputPrice: 15,
      contextLength: 200_000,
      capabilities: { vision: true, reasoning: true, tools: true },
    });
  });

  it('streams text and assembles tool calls split across chunks', async () => {
    mock.push({
      text: 'Je lis le fichier.',
      toolCalls: [
        { name: 'filesystem.read', args: { path: 'README.md' } },
        { name: 'git.status', args: {} },
      ],
    });
    const deltas: string[] = [];
    const res = await provider(mock.url).chat(
      { model: 'mock/fast-1', messages: [{ role: 'user', content: 'hi' }], tools: [] },
      { onText: (d) => deltas.push(d) },
    );
    expect(deltas.length).toBeGreaterThan(1);
    expect(res.content).toBe('Je lis le fichier.');
    expect(res.toolCalls.map((t) => [t.function.name, JSON.parse(t.function.arguments)])).toEqual([
      ['filesystem__read', { path: 'README.md' }],
      ['git__status', {}],
    ]);
    expect(res.finishReason).toBe('tool_calls');
    expect(res.usage).toMatchObject({ promptTokens: 1000, completionTokens: 50, cost: 0.0012 });
    // Request shape: streaming with real usage accounting.
    expect(mock.requests.at(-1)!.body).toMatchObject({ stream: true, usage: { include: true } });
  });

  it('sends the reasoning effort when requested', async () => {
    await provider(mock.url).chat({
      model: 'mock/smart-2',
      messages: [{ role: 'user', content: 'x' }],
      reasoningEffort: 'high',
    });
    expect(mock.requests.at(-1)!.body.reasoning).toEqual({ effort: 'high', exclude: false });
  });

  it('maps HTTP errors to retryable / non-retryable LLMErrors', async () => {
    mock.push(
      { error: { status: 429, message: 'Rate limited' } },
      { error: { status: 400, message: 'Bad request' } },
    );
    const p = provider(mock.url);
    const e1 = await p.chat({ model: 'm', messages: [] }).catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(LLMError);
    expect(e1).toMatchObject({ status: 429, retryable: true, message: 'Rate limited' });
    const e2 = await p.chat({ model: 'm', messages: [] }).catch((e: unknown) => e);
    expect(e2).toMatchObject({ status: 400, retryable: false });
  });

  it('surfaces an error sent in the middle of the stream', async () => {
    rawHandler = (_q, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'début…' } }] })}\n\n`);
      res.end(`data: ${JSON.stringify({ error: { message: 'upstream overloaded', code: 502 } })}\n\n`);
    };
    const deltas: string[] = [];
    const err = await provider(rawUrl)
      .chat({ model: 'm', messages: [] }, { onText: (d) => deltas.push(d) })
      .catch((e: unknown) => e);
    expect(deltas).toEqual(['début…']);
    expect(err).toMatchObject({ status: 502, retryable: true, message: 'upstream overloaded' });
  });

  it('aborts on cancellation and on an idle stream', async () => {
    rawHandler = (_q, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(': OPENROUTER PROCESSING\n\n'); // then hang
    };
    const ac = new AbortController();
    const pending = provider(rawUrl).chat({ model: 'm', messages: [], signal: ac.signal });
    setTimeout(() => ac.abort(new Error('stop')), 100);
    await expect(pending).rejects.toThrow();
    const idle = await provider(rawUrl, 300)
      .chat({ model: 'm', messages: [] })
      .catch((e: unknown) => e as Error);
    expect(String((idle as Error).message)).toMatch(/idle|abort/i);
  });

  it('reads key status and credits', async () => {
    const p = provider(mock.url);
    expect(await p.keyStatus()).toMatchObject({
      configured: true,
      connected: true,
      limit: 10,
      limitRemaining: 9.5,
    });
    expect(await p.credits()).toMatchObject({
      available: true,
      totalCredits: 20,
      totalUsage: 1.25,
      remaining: 18.75,
    });
    const down = provider('http://127.0.0.1:9/api/v1');
    expect(await down.keyStatus()).toMatchObject({ connected: false });
    expect((await down.credits()).available).toBe(false);
  });
});
