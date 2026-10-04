import http from 'node:http';
import type { AddressInfo } from 'node:net';

/** One scripted assistant turn returned by the mock /chat/completions endpoint. */
export interface ScriptedTurn {
  text?: string;
  toolCalls?: { name: string; args: Record<string, unknown> }[];
  /** Return an HTTP error instead of a stream. */
  error?: { status: number; message: string };
  usage?: { prompt_tokens: number; completion_tokens: number; cost: number };
  finish?: string;
}

export interface MockOpenRouter {
  url: string;
  requests: { model: string; messages: unknown[]; tools?: unknown[]; body: Record<string, unknown> }[];
  push: (...turns: ScriptedTurn[]) => void;
  /** Drops queued turns and recorded requests. */
  reset: () => void;
  /** Called when the queue is empty (default: plain "ok" answer). */
  fallback: (body: Record<string, unknown>) => ScriptedTurn;
  close: () => Promise<void>;
}

export const MOCK_MODELS = [
  {
    id: 'mock/fast-1',
    name: 'Mock: Fast',
    created: 1_700_000_000,
    context_length: 128_000,
    architecture: { input_modalities: ['text'] },
    pricing: { prompt: '0.000001', completion: '0.000002' },
    top_provider: { context_length: 128_000, max_completion_tokens: 8192 },
    supported_parameters: ['tools', 'tool_choice', 'temperature'],
  },
  {
    id: 'mock/smart-2',
    name: 'Mock: Smart',
    created: 1_800_000_000,
    context_length: 200_000,
    architecture: { input_modalities: ['text', 'image'] },
    pricing: { prompt: '0.000003', completion: '0.000015' },
    top_provider: { context_length: 200_000, max_completion_tokens: 16_000 },
    supported_parameters: ['tools', 'tool_choice', 'reasoning'],
    reasoning: { supported_efforts: ['low', 'medium', 'high'], default_effort: 'medium' },
  },
];

/** A local HTTP server that speaks the OpenRouter API (SSE streaming, tool calls, usage). */
export async function startMockOpenRouter(): Promise<MockOpenRouter> {
  const queue: ScriptedTurn[] = [];
  const requests: MockOpenRouter['requests'] = [];
  const mock: MockOpenRouter = {
    url: '',
    requests,
    push: (...t) => queue.push(...t),
    reset: () => {
      queue.length = 0;
      requests.length = 0;
      mock.fallback = () => ({ text: 'ok' });
    },
    fallback: () => ({ text: 'ok' }),
    close: () => new Promise((r) => server.close(() => r())),
  };
  const server = http.createServer((req, res) => {
    const url = req.url ?? '';
    if (req.method === 'GET' && url.endsWith('/models')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: MOCK_MODELS }));
      return;
    }
    if (req.method === 'GET' && url.endsWith('/key')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          data: {
            label: 'sk-or-v1-mock...',
            limit: 10,
            limit_remaining: 9.5,
            usage: 0.5,
            is_free_tier: false,
          },
        }),
      );
      return;
    }
    if (req.method === 'GET' && url.endsWith('/credits')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: { total_credits: 20, total_usage: 1.25 } }));
      return;
    }
    if (req.method === 'POST' && url.endsWith('/chat/completions')) {
      let raw = '';
      req.on('data', (d: Buffer) => (raw += d.toString('utf8')));
      req.on('end', () => {
        const body = JSON.parse(raw) as Record<string, unknown>;
        requests.push({
          model: String(body.model),
          messages: body.messages as unknown[],
          tools: body.tools as unknown[] | undefined,
          body,
        });
        const turn = queue.shift() ?? mock.fallback(body);
        if (turn.error) {
          res.statusCode = turn.error.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: { message: turn.error.message, code: turn.error.status } }));
          return;
        }
        res.setHeader('Content-Type', 'text/event-stream');
        const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
        res.write(': OPENROUTER PROCESSING\n\n');
        if (turn.text) {
          // Stream the text in small chunks to exercise delta handling.
          for (const chunk of turn.text.match(/.{1,12}/gs) ?? [])
            send({ model: body.model, choices: [{ index: 0, delta: { content: chunk } }] });
        }
        (turn.toolCalls ?? []).forEach((tc, i) => {
          const args = JSON.stringify(tc.args);
          send({
            model: body.model,
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: i,
                      id: `call_${i}_${requests.length}`,
                      type: 'function',
                      function: { name: tc.name.replace(/\./g, '__'), arguments: '' },
                    },
                  ],
                },
              },
            ],
          });
          const half = Math.ceil(args.length / 2);
          send({
            model: body.model,
            choices: [
              {
                index: 0,
                delta: { tool_calls: [{ index: i, function: { arguments: args.slice(0, half) } }] },
              },
            ],
          });
          send({
            model: body.model,
            choices: [
              { index: 0, delta: { tool_calls: [{ index: i, function: { arguments: args.slice(half) } }] } },
            ],
          });
        });
        send({
          model: body.model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: turn.finish ?? (turn.toolCalls?.length ? 'tool_calls' : 'stop'),
            },
          ],
        });
        send({
          model: body.model,
          choices: [],
          usage: turn.usage ?? { prompt_tokens: 1000, completion_tokens: 50, cost: 0.0012 },
        });
        res.write('data: [DONE]\n\n');
        res.end();
      });
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  mock.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  return mock;
}
