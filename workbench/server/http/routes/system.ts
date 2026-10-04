import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServerStatus } from '@shared/types';
import { ROLE_LIST } from '../../agent/roles';
import { refreshSecretValues } from '../../security/redact';
import { toolCatalog } from '../../tools/registry';
import type { AppContext } from '../context';
import { HttpError } from '../context';
import { previewTokenFor } from '../preview';

let keyStatusCache: { at: number; value: unknown } | null = null;

const startOf = (unit: 'day' | 'month') => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (unit === 'month') d.setDate(1);
  return d.getTime();
};

export function systemRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { services: s } = ctx;

  app.get('/api/status', async (): Promise<ServerStatus & { models: unknown; budget: unknown; jev: unknown; plugins: unknown }> => ({
    version: ctx.version,
    provider: { name: s.provider.name, keyConfigured: Boolean(process.env.OPENROUTER_API_KEY) },
    workspaceRoot: s.workspace.root,
    browser: { engine: s.browser.engine, available: s.browser.isAvailable() },
    python: s.capabilities.python,
    ripgrep: s.capabilities.ripgrep,
    previewPort: s.config.previewPort,
    models: s.catalog.status,
    budget: s.llm.budgetState(),
    jev: { keyConfigured: s.jev.keyConfigured, available: s.jev.available },
    plugins: s.mcp.list().map((p) => ({ name: p.name, status: p.status, tools: p.toolCount })),
  }));

  // Capability URLs for the isolated preview server.
  app.get('/api/preview-url', async (req) => {
    const q = z.object({ projectId: z.string().optional(), artifactId: z.string().optional(), path: z.string().optional() }).parse(req.query);
    const host = (req.headers.host ?? `127.0.0.1:${s.config.port}`).replace(/:\d+$/, '');
    const base = `http://${host}:${s.config.previewPort}`;
    if (q.artifactId) return { url: `${base}/a/${previewTokenFor(ctx.previewToken, `artifact:${q.artifactId}`)}/${q.artifactId}` };
    if (!q.projectId) throw new HttpError(400, 'projectId or artifactId required');
    s.workspace.getProject(q.projectId);
    const rel = (q.path ?? '').split('/').map(encodeURIComponent).join('/');
    return { url: `${base}/p/${previewTokenFor(ctx.previewToken, `project:${q.projectId}`)}/${q.projectId}/${rel}` };
  });

  app.get('/api/models', async (req) => {
    const refresh = (req.query as { refresh?: string }).refresh === '1';
    try {
      const models = await s.catalog.list(refresh);
      return { models, status: s.catalog.status };
    } catch (err) {
      throw new HttpError(502, `Impossible de récupérer les modèles OpenRouter : ${(err as Error).message}`);
    }
  });

  app.get('/api/provider/status', async (req) => {
    const force = (req.query as { force?: string }).force === '1';
    if (!force && keyStatusCache && Date.now() - keyStatusCache.at < 30_000) return keyStatusCache.value;
    const value = await s.provider.keyStatus();
    keyStatusCache = { at: Date.now(), value };
    return value;
  });

  app.get('/api/credits', async (req) => {
    const sessionId = (req.query as { sessionId?: string }).sessionId;
    const credits = await s.provider.credits();
    const session = sessionId ? s.repo.getSession(sessionId) : undefined;
    return {
      credits,
      today: s.repo.usageSince(startOf('day')),
      month: s.repo.usageSince(startOf('month')),
      todayByModel: s.repo.usageByModel(startOf('day')),
      session: session ? { cost: session.cost, tokensIn: session.tokensIn, tokensOut: session.tokensOut } : null,
      budget: s.llm.budgetState(),
    };
  });

  app.get('/api/usage', async () => ({
    today: s.repo.usageSince(startOf('day')),
    month: s.repo.usageSince(startOf('month')),
    byModel: s.repo.usageByModel(startOf('month')),
    byDay: s.repo.usageByDay(Date.now() - 30 * 86400_000),
    budget: s.llm.budgetState(),
  }));

  app.get('/api/settings', async () => s.settings.get());
  app.put('/api/settings', async (req) => {
    try {
      const next = s.settings.update(req.body);
      s.repo.audit({ actor: 'user', action: 'settings.update', details: req.body });
      return next;
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  });

  // Saves the OpenRouter key server-side (.env + process env). Never echoed back.
  app.post('/api/settings/provider-key', async (req) => {
    const { key } = z.object({ key: z.string().trim().min(10).max(300) }).parse(req.body);
    if (/\s/.test(key)) throw new HttpError(400, 'Invalid key format');
    const file = s.config.envFile;
    let env = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (/^OPENROUTER_API_KEY=.*$/m.test(env)) env = env.replace(/^OPENROUTER_API_KEY=.*$/m, `OPENROUTER_API_KEY=${key}`);
    else env = `${env.trimEnd()}${env ? '\n' : ''}OPENROUTER_API_KEY=${key}\n`;
    fs.writeFileSync(file, env, { mode: 0o600 });
    process.env.OPENROUTER_API_KEY = key;
    refreshSecretValues();
    keyStatusCache = null;
    s.repo.audit({ actor: 'user', action: 'provider.key.update', target: 'OPENROUTER_API_KEY' });
    return s.provider.keyStatus();
  });

  app.delete('/api/settings/provider-key', async () => {
    const file = s.config.envFile;
    if (fs.existsSync(file)) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^OPENROUTER_API_KEY=.*\n?/m, ''), { mode: 0o600 });
    delete process.env.OPENROUTER_API_KEY;
    refreshSecretValues();
    keyStatusCache = null;
    s.repo.audit({ actor: 'user', action: 'provider.key.delete', target: 'OPENROUTER_API_KEY' });
    return { ok: true };
  });

  app.get('/api/agents', async () => [
    ...ROLE_LIST.map((r) => ({ id: r.id, label: r.label, description: r.description, tier: r.tier, tools: r.tools, custom: false, source: 'builtin', editable: false, skills: [] as string[], model: null })),
    ...(await s.skills.listAgents()).map((a) => ({ id: a.id, label: a.name, description: a.description, tier: 'balanced', tools: a.tools ?? [], custom: true, source: a.source, editable: a.editable, skills: a.skills, model: a.model })),
  ]);
  app.get('/api/tools', async () => toolCatalog());

  app.get('/api/activity', async (req) => {
    const q = req.query as { sessionId?: string; limit?: string };
    return s.repo.listToolCalls(Math.min(Number(q.limit ?? 300), 2000), q.sessionId);
  });
  app.get('/api/audit', async (req) => s.repo.listAudit(Math.min(Number((req.query as { limit?: string }).limit ?? 300), 2000)));
}
