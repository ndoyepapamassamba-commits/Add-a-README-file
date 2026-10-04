// Real OpenRouter + Jev checks. Skipped unless OPENROUTER_LIVE=1 (npm run test:live).
// Uses the cheapest fast-tier model and tiny prompts: a run costs a fraction of a cent.
import { describe, expect, it } from 'vitest';
import { OpenRouterProvider } from '../../server/llm/openrouter';
import { pickFromTier } from '../../server/llm/router';
import { JevService } from '../../server/services/jev';
import { DEFAULT_AUTO_TIERS } from '../../server/services/settings';

const live = process.env.OPENROUTER_LIVE === '1';
const provider = new OpenRouterProvider({
  baseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  appUrl: 'http://localhost',
  appName: 'MASSAMBA Workbench (tests)',
  getApiKey: () => process.env.OPENROUTER_API_KEY || undefined,
});

describe.skipIf(!live)('live OpenRouter', () => {
  let model = '';

  it('loads the real catalog with prices and resolves the fast tier', async () => {
    const models = await provider.listModels();
    expect(models.length).toBeGreaterThan(50);
    const picked = pickFromTier(models, DEFAULT_AUTO_TIERS.fast, { tools: true });
    expect(picked).toBeTruthy();
    expect(picked!.inputPrice).toBeGreaterThan(0);
    model = picked!.id;
  });

  it('streams a completion and reports the real cost', async () => {
    const deltas: string[] = [];
    const r = await provider.chat(
      { model, messages: [{ role: 'user', content: 'Réponds uniquement par le mot : pong' }], maxTokens: 20 },
      { onText: (d) => deltas.push(d) },
    );
    expect(r.content.toLowerCase()).toContain('pong');
    expect(deltas.length).toBeGreaterThan(0);
    expect(r.usage.cost).toBeGreaterThan(0);
  });

  it('performs a tool call round-trip', async () => {
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'get_weather',
          description: 'Météo actuelle',
          parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
      },
    ];
    const r = await provider.chat({
      model,
      messages: [{ role: 'user', content: 'Quel temps fait-il à Dakar ? Utilise l’outil.' }],
      tools,
      toolChoice: 'required',
      maxTokens: 200,
    });
    expect(r.toolCalls[0]?.function.name).toBe('get_weather');
    expect(JSON.parse(r.toolCalls[0]!.function.arguments).city).toMatch(/dakar/i);
  });

  it('reads credits', async () => {
    const c = await provider.credits();
    expect(c.available).toBe(true);
    expect(c.totalCredits).not.toBeNull();
  });
});

describe.skipIf(!live)('live Jev (TypeSafe)', () => {
  it('answers a typed judgment', async () => {
    const jev = new JevService();
    const r = await jev.evaluate(
      { request: 'Corrige la faute de frappe dans le titre' },
      { simple: { type: 'noul', instructions: 'Is the `request` a small, quick task?' } },
    );
    expect((r.answers.simple as { noul: number }).noul).toBeGreaterThan(0.5);
  });
});
