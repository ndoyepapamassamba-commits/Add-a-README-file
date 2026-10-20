import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/app';
import { buildPreviewServer, previewTokenFor } from '../../server/http/preview';
import type { AppContext } from '../../server/http/context';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';
import { tempEnv, waitFor } from '../helpers/env';

let app: FastifyInstance;
let ctx: AppContext;
let mock: MockOpenRouter;
let env: ReturnType<typeof tempEnv>;
const auth = { authorization: 'Bearer test-token-0123456789abcdef' };

beforeAll(async () => {
  mock = await startMockOpenRouter();
  env = tempEnv('api', { OPENROUTER_BASE_URL: mock.url });
  ({ app, ctx } = await buildApp(env.config, { logger: false }));
  ctx.services.settings.update({ jev: { enabled: false } });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await mock.close();
  env.cleanup();
});

const json = async (method: string, url: string, body?: unknown) => {
  const res = await app.inject({ method: method as 'GET', url, headers: auth, payload: body as object });
  return {
    status: res.statusCode,
    body: res.headers['content-type']?.includes('json') ? res.json() : res.body,
  };
};

describe('auth & system', () => {
  it('protects the API with the bearer token', async () => {
    expect((await app.inject({ url: '/api/health' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/projects' })).statusCode).toBe(401);
    expect(
      (await app.inject({ url: '/api/projects', headers: { authorization: 'Bearer wrong' } })).statusCode,
    ).toBe(401);
    expect((await json('GET', '/api/projects')).status).toBe(200);
  });
  it('serves the model catalog, key status and credits from OpenRouter', async () => {
    const models = await json('GET', '/api/models');
    expect(models.body.models.map((m: { id: string }) => m.id)).toEqual(['mock/fast-1', 'mock/smart-2']);
    const status = await json('GET', '/api/provider/status');
    expect(status.body).toMatchObject({ connected: true, limit: 10 });
    const credits = await json('GET', '/api/credits');
    expect(credits.body.credits).toMatchObject({
      available: true,
      totalCredits: 20,
      remaining: 18.75,
      keyLimitRemaining: 9.5,
    });
  });
  it('lists built-in agents and the tool catalog', async () => {
    const agents = await json('GET', '/api/agents');
    expect(agents.body.map((a: { id: string }) => a.id)).toEqual(
      expect.arrayContaining(['general', 'coder', 'reviewer', 'data_analyst']),
    );
    const tools = await json('GET', '/api/tools');
    expect(tools.body.length).toBeGreaterThan(40);
  });
  it('validates settings', async () => {
    expect((await json('PUT', '/api/settings', { temperature: 5 })).status).toBe(400);
    expect((await json('PUT', '/api/settings', { budget: { daily: 3 } })).body.budget.daily).toBe(3);
  });
});

describe('projects & files', () => {
  it('creates a project and edits files with revertable changes', async () => {
    const p = await json('POST', '/api/projects', { name: 'Mon Projet', gitInit: true });
    expect(p.body).toMatchObject({ id: 'mon-projet', isGit: true });
    expect(
      (await json('PUT', '/api/projects/mon-projet/file', { path: 'src/a.txt', content: 'v1\n' })).status,
    ).toBe(200);
    const read = await json('GET', '/api/projects/mon-projet/file?path=src/a.txt');
    expect(read.body).toMatchObject({ kind: 'text', content: 'v1\n' });
    const w2 = await json('PUT', '/api/projects/mon-projet/file', { path: 'src/a.txt', content: 'v2\n' });
    const rev = await json('POST', `/api/changes/${w2.body.change.id}/revert`);
    expect(rev.body.status).toBe('reverted');
    expect(fs.readFileSync(path.join(env.config.workspaceRoot, 'mon-projet/src/a.txt'), 'utf8')).toBe('v1\n');
    const del = await json('DELETE', '/api/projects/mon-projet/file?path=src/a.txt');
    expect(fs.existsSync(path.join(env.config.workspaceRoot, 'mon-projet/src/a.txt'))).toBe(false);
    await json('POST', `/api/changes/${del.body.id}/revert`);
    expect(fs.existsSync(path.join(env.config.workspaceRoot, 'mon-projet/src/a.txt'))).toBe(true);
  });
  it('blocks traversal and protected files', async () => {
    expect((await json('GET', '/api/projects/mon-projet/file?path=../../etc/passwd')).status).toBe(400);
    fs.writeFileSync(path.join(env.config.workspaceRoot, 'mon-projet/.env'), 'SECRET=1');
    expect((await json('GET', '/api/projects/mon-projet/file?path=.env')).status).toBe(403);
    expect((await json('PUT', '/api/projects/mon-projet/file', { path: '.env', content: 'x' })).status).toBe(
      400,
    );
  });
  it('accepts multipart uploads into uploads/', async () => {
    const boundary = '----wbtest';
    const payload = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="note.txt"\r\nContent-Type: text/plain\r\n\r\nbonjour\r\n--${boundary}--\r\n`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/mon-projet/upload',
      headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(res.json()).toEqual([{ path: 'uploads/note.txt', size: 7, kind: 'file' }]);
  });
  it('searches content and lists all files', async () => {
    const r = await json('GET', '/api/projects/mon-projet/search?q=v1');
    expect(r.body.matches[0]).toMatchObject({ path: 'src/a.txt', line: 1 });
    expect((await json('GET', '/api/projects/mon-projet/all-files')).body).toEqual(
      expect.arrayContaining(['src/a.txt', 'PROJECT_CONTEXT.md']),
    );
  });
});

describe('terminal', () => {
  it('runs commands with live output and blocks dangerous ones', async () => {
    const r = await json('POST', '/api/projects/mon-projet/terminal', { command: 'echo "hello $((6*7))"' });
    const info = await waitFor(() =>
      ctx.services.processes.list().find((p) => p.id === r.body.processId && p.status !== 'running'),
    );
    expect(info.exitCode).toBe(0);
    expect(
      (await json('POST', '/api/projects/mon-projet/terminal', { command: 'sudo rm -rf /' })).status,
    ).toBe(403);
    expect(
      (await json('POST', '/api/projects/mon-projet/terminal', { command: 'rm -rf build' })).body,
    ).toMatchObject({ needsConfirmation: true, level: 'dangerous' });
  });
  it('does not leak secrets into child processes', async () => {
    process.env.TEST_SECRET_TOKEN = 'leaky-secret-value-42';
    const { done } = ctx.services.processes.run({
      projectId: 'mon-projet',
      cwd: env.config.workspaceRoot,
      command: 'echo "[$TEST_SECRET_TOKEN]"',
      origin: 'agent',
      timeoutMs: 10_000,
    });
    const res = await done;
    expect(res.stdout.trim()).toBe('[]');
    delete process.env.TEST_SECRET_TOKEN;
  });
});

describe('git', () => {
  it('commits and reports status/log', async () => {
    const c = await json('POST', '/api/projects/mon-projet/git/commit', { message: 'initial' });
    expect(c.body.hash).toMatch(/^[0-9a-f]{40}$/);
    const g = await json('GET', '/api/projects/mon-projet/git');
    expect(g.body.log[0].subject).toBe('initial');
    expect(g.body.status.files).toEqual([]);
  });
});

describe('data intelligence', () => {
  it('inspects, queries and charts a CSV', async () => {
    await json('PUT', '/api/projects/mon-projet/file', {
      path: 'data/x.csv',
      content: 'mois,montant\n2026-01-01,10\n2026-02-01,30\n2026-02-15,5\n',
    });
    const prof = await json('GET', '/api/projects/mon-projet/data/inspect?path=data/x.csv');
    expect(prof.body).toMatchObject({ rowCount: 3, columnCount: 2 });
    const chart = await json('POST', '/api/projects/mon-projet/data/chart', {
      spec: {
        type: 'bar',
        title: 't',
        source: { path: 'data/x.csv' },
        x: { column: 'mois', bucket: 'month' },
        y: [{ column: 'montant', agg: 'sum' }],
      },
      save: true,
    });
    expect(chart.body.chart.series[0].data).toEqual([10, 35]);
    expect(chart.body.artifactId).toBeTruthy();
    const raw = await app.inject({ url: `/api/artifacts/${chart.body.artifactId}/raw`, headers: auth });
    expect(raw.headers['content-security-policy']).toContain('sandbox');
  });
});

describe('sessions & export', () => {
  it('creates sessions and exports markdown', async () => {
    const s = await json('POST', '/api/sessions', { projectId: 'mon-projet', permissionMode: 'safe' });
    expect(s.body.permissionMode).toBe('safe');
    const patched = await json('PATCH', `/api/sessions/${s.body.id}`, {
      skills: ['x'],
      autoApproveEdits: true,
      role: 'coder',
    });
    expect(patched.body.settings).toMatchObject({ skills: ['x'], autoApproveEdits: true, role: 'coder' });
    const exp = await app.inject({ url: `/api/sessions/${s.body.id}/export?format=md`, headers: auth });
    expect(exp.body).toContain('# Nouvelle session');
    const est = await json('POST', '/api/estimate', {
      sessionId: s.body.id,
      text: 'bonjour',
      model: 'mock/smart-2',
    });
    expect(est.body).toMatchObject({ model: 'mock/smart-2', inputPrice: 3, outputPrice: 15 });
    expect(est.body.perStep).toBeGreaterThan(0);
  });
});

describe('preview server', () => {
  it('requires a project-scoped capability token', async () => {
    const preview = buildPreviewServer(ctx);
    await json('PUT', '/api/projects/mon-projet/file', { path: 'index.html', content: '<h1>ok</h1>' });
    const good = previewTokenFor(ctx.previewToken, 'project:mon-projet');
    expect((await preview.inject({ url: `/p/${good}/mon-projet/index.html` })).body).toBe('<h1>ok</h1>');
    expect((await preview.inject({ url: `/p/${good}/mon-projet/` })).body).toBe('<h1>ok</h1>');
    expect((await preview.inject({ url: `/p/wrong/mon-projet/index.html` })).statusCode).toBe(403);
    expect((await preview.inject({ url: `/p/${good}/mon-projet/.env` })).statusCode).toBe(403);
    const other = previewTokenFor(ctx.previewToken, 'project:demo');
    expect((await preview.inject({ url: `/p/${other}/mon-projet/index.html` })).statusCode).toBe(403);
    const url = await json('GET', '/api/preview-url?projectId=mon-projet&path=index.html');
    expect(url.body.url).toContain(`/p/${good}/mon-projet/index.html`);
    await preview.close();
  });
});
