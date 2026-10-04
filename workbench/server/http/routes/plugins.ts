import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MCP_PRESETS, McpServerSchema } from '../../services/mcp';
import { JevQuestionSchema } from '../../services/jev';
import type { AppContext } from '../context';
import { HttpError } from '../context';

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:15px system-ui;background:#1d1c1a;color:#efede6;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>${title}</h2><p>${body}</p><p style="opacity:.6">Vous pouvez fermer cet onglet.</p></div><script>setTimeout(()=>window.close(),2500)</script>`;

export function pluginRoutes(app: FastifyInstance, ctx: AppContext): void {
  const s = ctx.services;
  const name = (req: { params: unknown }) => (req.params as { name: string }).name;

  // ── MCP plugins ───────────────────────────────────────────────────────
  app.get('/api/mcp', async () => ({ servers: s.mcp.list(), presets: MCP_PRESETS }));
  app.post('/api/mcp', async (req) => {
    const b = z.object({ name: z.string().min(1).max(40), config: McpServerSchema, connect: z.boolean().default(true) }).parse(req.body);
    await s.mcp.upsert(b.name, b.config);
    s.repo.audit({ actor: 'user', action: 'mcp.save', target: b.name, details: { command: b.config.command, url: b.config.url } });
    if (b.connect && b.config.enabled) await s.mcp.connect(b.name);
    return s.mcp.list().find((x) => x.name === b.name);
  });
  app.post('/api/mcp/preset/:id', async (req) => {
    const preset = MCP_PRESETS.find((p) => p.id === (req.params as { id: string }).id);
    if (!preset) throw new HttpError(404, 'Préréglage inconnu');
    const b = z.object({ env: z.record(z.string(), z.string()).optional(), headers: z.record(z.string(), z.string()).optional() }).parse(req.body ?? {});
    await s.mcp.upsert(preset.id, { ...preset.config, description: preset.description, env: b.env ?? preset.config.env, headers: b.headers ?? preset.config.headers });
    s.repo.audit({ actor: 'user', action: 'mcp.preset', target: preset.id });
    await s.mcp.connect(preset.id);
    return s.mcp.list().find((x) => x.name === preset.id);
  });
  app.post('/api/mcp/:name/connect', async (req) => {
    await s.mcp.connect(name(req));
    return s.mcp.list().find((x) => x.name === name(req));
  });
  app.post('/api/mcp/:name/disconnect', async (req) => {
    await s.mcp.disconnect(name(req));
    return { ok: true };
  });
  app.post('/api/mcp/:name/enabled', async (req) => {
    const b = z.object({ enabled: z.boolean() }).parse(req.body);
    await s.mcp.setEnabled(name(req), b.enabled);
    if (b.enabled) await s.mcp.connect(name(req));
    return s.mcp.list().find((x) => x.name === name(req));
  });
  app.post('/api/mcp/:name/auto-approve', async (req) => {
    const b = z.object({ autoApprove: z.union([z.boolean(), z.array(z.string())]) }).parse(req.body);
    const l = s.mcp.get(name(req));
    await s.mcp.upsert(name(req), { ...l.config, autoApprove: b.autoApprove });
    await s.mcp.connect(name(req));
    return s.mcp.list().find((x) => x.name === name(req));
  });
  app.delete('/api/mcp/:name', async (req) => {
    await s.mcp.remove(name(req));
    s.repo.audit({ actor: 'user', action: 'mcp.remove', target: name(req) });
    return { ok: true };
  });
  app.post('/api/mcp/:name/call', async (req) => {
    const b = z.object({ tool: z.string().min(1), args: z.record(z.string(), z.unknown()).default({}) }).parse(req.body);
    s.repo.audit({ actor: 'user', action: 'mcp.call', target: `${name(req)}.${b.tool}` });
    return s.mcp.callTool(name(req), b.tool, b.args);
  });
  // OAuth redirect target (opened by the user's browser, hence no bearer token).
  app.get('/api/mcp/oauth/callback', async (req, reply) => {
    const q = z.object({ server: z.string().min(1), code: z.string().min(1).optional(), error: z.string().optional() }).parse(req.query);
    reply.type('text/html; charset=utf-8');
    if (q.error || !q.code) return page('Autorisation refusée', `Le service a renvoyé : ${(q.error ?? 'aucun code').replace(/[<>&"]/g, '')}`);
    try {
      await s.mcp.finishAuth(q.server, q.code);
      s.repo.audit({ actor: 'user', action: 'mcp.oauth', target: q.server, decision: 'ok' });
      return page('Connexion réussie ✓', `Le plugin « ${q.server.replace(/[<>&"]/g, '')} » est autorisé.`);
    } catch (err) {
      return page('Échec de l’autorisation', (err as Error).message.replace(/[<>&"]/g, '').slice(0, 300));
    }
  });

  // ── Jev (TypeSafe) ────────────────────────────────────────────────────
  app.get('/api/jev/status', async (req) => ({ ...(await s.jev.check((req.query as { force?: string }).force === '1')), keyConfigured: s.jev.keyConfigured }));
  app.post('/api/jev/evaluate', async (req) => {
    const b = z.object({ state: z.unknown(), questions: z.record(z.string(), JevQuestionSchema), model: z.string().optional() }).parse(req.body);
    return s.jev.evaluate(b.state, b.questions, { model: b.model });
  });
}
