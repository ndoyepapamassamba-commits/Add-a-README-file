import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { mimeFor } from '../../services/documents';
import type { AppContext } from '../context';

export function artifactRoutes(app: FastifyInstance, ctx: AppContext): void {
  const s = ctx.services;
  const aid = (req: { params: unknown }) => (req.params as { id: string }).id;

  app.get('/api/projects/:id/artifacts', async (req) => {
    const q = req.query as { sessionId?: string };
    return q.sessionId ? s.repo.listArtifacts({ sessionId: q.sessionId }) : s.repo.listArtifacts({ projectId: aid(req) });
  });
  app.get('/api/artifacts/:id', async (req) => s.artifacts.get(aid(req)));
  app.get('/api/artifacts/:id/raw', async (req, reply) => {
    const { record, data } = await s.artifacts.read(aid(req));
    const download = (req.query as { download?: string }).download === '1';
    reply.header('Content-Type', record.type === 'chart' ? 'application/json; charset=utf-8' : mimeFor(record.name));
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Security-Policy', "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'");
    reply.header('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(record.name)}`);
    return reply.send(data);
  });
  app.post('/api/artifacts/:id/save', async (req) => {
    const b = z.object({ path: z.string().min(1).max(500) }).parse(req.body);
    const rel = await s.artifacts.saveToProject(aid(req), b.path);
    return { path: rel };
  });
  app.delete('/api/artifacts/:id', async (req) => {
    await s.artifacts.remove(aid(req));
    return { ok: true };
  });
  app.get('/api/artifacts/:id/text', async (req) => {
    const { record, data } = await s.artifacts.read(aid(req));
    if (['png', 'jpg', 'xlsx', 'zip', 'pdf'].includes(record.type)) return { text: null, ext: path.extname(record.name) };
    return { text: data.toString('utf8').slice(0, 2_000_000), ext: path.extname(record.name) };
  });
}
