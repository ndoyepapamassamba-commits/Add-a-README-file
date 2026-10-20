import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AgentEvent } from '@shared/types';
import { buildApp } from '../../server/app';
import type { AppContext } from '../../server/http/context';
import { mcpToolName } from '../../server/tools/mcp';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';
import { tempEnv, waitFor } from '../helpers/env';

const FIXTURE = path.resolve(__dirname, '../fixtures/mcp-echo.mjs');
const auth = { authorization: 'Bearer test-token-0123456789abcdef' };
let app: FastifyInstance;
let ctx: AppContext;
let mock: MockOpenRouter;
let env: ReturnType<typeof tempEnv>;

beforeAll(async () => {
  mock = await startMockOpenRouter();
  env = tempEnv('mcp', { OPENROUTER_BASE_URL: mock.url });
  ({ app, ctx } = await buildApp(env.config, { logger: false }));
  ctx.services.settings.update({ jev: { enabled: false }, defaultModel: 'mock/smart-2' });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await mock.close();
  env.cleanup();
});

describe('MCP plugins (real stdio server)', () => {
  it('adds a server over HTTP, connects and lists its tools', async () => {
    const save = await app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: auth,
      payload: {
        name: 'echo',
        connect: false,
        config: {
          command: process.execPath,
          args: [FIXTURE],
          env: { FIXTURE_VAR: 'secret-fixture-value-123' },
        },
      },
    });
    expect(save.statusCode).toBe(200);
    const con = await app.inject({ method: 'POST', url: '/api/mcp/echo/connect', headers: auth });
    expect(con.statusCode).toBe(200);
    const list = await waitFor(async () => {
      const l = (
        (await app.inject({ url: '/api/mcp', headers: auth })).json() as {
          servers: {
            name: string;
            status: string;
            tools: { name: string; readOnly: boolean }[];
            instructions?: string;
            config: { env?: Record<string, string> };
          }[];
        }
      ).servers;
      return l.find((s) => s.name === 'echo' && s.status === 'connected');
    });
    expect(list.tools.map((t) => t.name).sort()).toEqual(['echo', 'env_check', 'fail', 'make_image']);
    expect(list.tools.find((t) => t.name === 'echo')!.readOnly).toBe(true);
    expect(list.instructions).toContain('Serveur de test');
    // Secrets configured for the server are never sent back to the UI.
    expect(list.config.env).toEqual({ FIXTURE_VAR: '••••' });
  });

  it('calls tools directly; server env is scrubbed of workbench secrets', async () => {
    const r = (await ctx.services.mcp.callTool('echo', 'echo', { text: 'salut' })) as {
      content: { text: string }[];
    };
    expect(r.content[0]!.text).toBe('echo: salut');
    const envCheck = (await ctx.services.mcp.callTool('echo', 'env_check', {})) as {
      content: { text: string }[];
    };
    // The configured value reaches the server; the redaction layer masks it in tool output.
    expect(envCheck.content[0]!.text).toBe('clean secret-fixture-value-123');
  });

  it('lets the agent use plugin tools automatically, with the right permission per tool', async () => {
    const s = ctx.services.repo.createSession({
      id: randomUUID(),
      projectId: 'demo',
      title: 'Nouvelle session',
      model: 'mock/smart-2',
      permissionMode: 'normal',
    });
    mock.push(
      { toolCalls: [{ name: mcpToolName('echo', 'echo'), args: { text: 'via agent' } }] },
      { toolCalls: [{ name: mcpToolName('echo', 'make_image'), args: {} }] },
      { toolCalls: [{ name: mcpToolName('echo', 'env_check'), args: {} }] },
      { text: 'Terminé avec le plugin.' },
    );
    const events: AgentEvent[] = [];
    const run = await ctx.orchestrator.start({ sessionId: s.id, text: 'utilise le plugin echo' });
    await new Promise<void>((resolve) => {
      ctx.orchestrator.subscribe(run.id, 0, (e) => {
        events.push(e.event);
        if (e.event.type === 'approval_required')
          ctx.orchestrator.resolveApproval(e.event.request.approvalId, { decision: 'approve' });
        if (e.event.type === 'run_finished') resolve();
      });
    });
    const offered = (mock.requests[0]!.tools as { function: { name: string; description: string } }[]).map(
      (t) => t.function.name,
    );
    expect(offered).toEqual(expect.arrayContaining(['mcp__echo__echo', 'mcp__echo__make_image']));
    // Plugin instructions reach the system prompt.
    expect(JSON.stringify(mock.requests[0]!.messages[0])).toContain('Serveur de test');
    const results = events.filter((e) => e.type === 'tool_result') as Extract<
      AgentEvent,
      { type: 'tool_result' }
    >[];
    expect(results.map((r) => r.result.ok)).toEqual([true, true, true]);
    // read-only tool → no approval; the others ("external") → approval in NORMAL mode.
    const approvals = events.filter((e) => e.type === 'approval_required') as Extract<
      AgentEvent,
      { type: 'approval_required' }
    >[];
    expect(approvals.map((a) => a.request.tool)).toEqual(['mcp.echo.make_image', 'mcp.echo.env_check']);
    expect(results[1]!.result.attachments?.[0]).toMatchObject({ kind: 'image' });
    expect(JSON.stringify(mock.requests[1]!.messages)).toContain('echo: via agent');
    // The secret env value is redacted before reaching the model.
    expect(JSON.stringify(mock.requests[3]!.messages)).not.toContain('secret-fixture-value-123');
  });

  it('honours auto-approve per server and reports tool errors', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/mcp/echo/auto-approve',
      headers: auth,
      payload: { autoApprove: true },
    });
    expect(ctx.services.mcp.isAutoApproved('echo', 'fail')).toBe(true);
    const r = (await ctx.services.mcp.callTool('echo', 'fail', {})) as { isError?: boolean };
    expect(r.isError).toBe(true);
  });

  it('disables and removes servers', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/mcp/echo/enabled',
      headers: auth,
      payload: { enabled: false },
    });
    expect(ctx.services.mcp.tools()).toEqual([]);
    await app.inject({ method: 'DELETE', url: '/api/mcp/echo', headers: auth });
    expect(ctx.services.mcp.list()).toEqual([]);
  });

  it('ships presets for Blender, Canva and free servers', async () => {
    const presets = (
      (await app.inject({ url: '/api/mcp', headers: auth })).json() as {
        presets: { id: string; free: boolean }[];
      }
    ).presets;
    expect(presets.map((p) => p.id)).toEqual(
      expect.arrayContaining(['blender', 'canva', 'context7', 'deepwiki', 'fetch']),
    );
    expect(presets.filter((p) => p.free).length).toBeGreaterThanOrEqual(6);
  });
});
