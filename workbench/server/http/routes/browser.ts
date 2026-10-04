import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';

export function browserRoutes(app: FastifyInstance, ctx: AppContext): void {
  const s = ctx.services;
  const key = (req: { params: unknown }) => (req.params as { key: string }).key;
  const dl = (projectId: string) => path.join(s.workspace.projectRoot(projectId), 'downloads');

  app.get('/api/browser/:key/state', async (req) => ({
    state: await s.browser.state(key(req)),
    logs: s.browser.logs(key(req)),
    available: s.browser.isAvailable(),
    engine: s.browser.engine,
  }));

  app.post('/api/browser/:key/navigate', async (req) => {
    const b = z.object({ projectId: z.string().min(1), url: z.string().min(1).max(4000) }).parse(req.body);
    return s.browser.navigate(key(req), dl(b.projectId), b.url, 'user');
  });

  app.post('/api/browser/:key/action', async (req) => {
    const b = z
      .object({
        projectId: z.string().min(1),
        action: z.enum(['back', 'forward', 'reload', 'screenshot', 'extract']),
        fullPage: z.boolean().optional(),
      })
      .parse(req.body);
    const k = key(req);
    if (b.action === 'screenshot') {
      const png = await s.browser.screenshot(k, dl(b.projectId), { fullPage: b.fullPage }, 'user');
      const st = await s.browser.state(k);
      const art = await s.artifacts.create({ projectId: b.projectId, sessionId: k, name: `capture-${new Date().toISOString().replace(/[:.]/g, '-')}`, type: 'png', content: png, meta: { url: st?.url } });
      return { artifactId: art.id };
    }
    if (b.action === 'extract') return s.browser.snapshot(k, dl(b.projectId), 30_000, 'user');
    return s.browser.history(k, dl(b.projectId), b.action, 'user');
  });

  app.post('/api/browser/:key/close', async (req) => {
    await s.browser.close(key(req));
    return { ok: true };
  });
}
