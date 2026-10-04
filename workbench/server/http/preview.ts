import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { tokenMatches } from './auth';
import type { AppContext } from './context';
import { mimeFor } from '../services/documents';
import { isProtectedPath, resolveInside } from '../security/paths';

/**
 * Preview server on a separate port = separate browser origin: generated web
 * apps and HTML artifacts run there, isolated from the workbench API and its
 * token (which lives in the main origin's storage). URLs carry a per-process
 * preview token so other local pages cannot enumerate project files.
 */
export function buildPreviewServer(ctx: AppContext): FastifyInstance {
  const app = Fastify({ logger: false });
  const s = ctx.services;

  app.get('/', async (_req, reply) => reply.type('text/plain').send('OpenRouter AI Workbench — preview server'));

  app.get('/p/:token/:projectId/*', async (req, reply) => {
    const { token, projectId } = req.params as { token: string; projectId: string };
    if (!tokenMatches(ctx.previewToken, token)) return reply.code(403).send('Forbidden');
    let rel = decodeURIComponent((req.params as { '*': string })['*'] ?? '');
    let root: string;
    try {
      root = s.workspace.projectRoot(projectId);
    } catch {
      return reply.code(404).send('Project not found');
    }
    if (isProtectedPath(rel) || rel.startsWith('.workbench/') || rel.startsWith('node_modules/.cache')) return reply.code(403).send('Forbidden');
    let abs: string;
    try {
      abs = resolveInside(root, rel || '.');
    } catch {
      return reply.code(403).send('Forbidden');
    }
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      const index = path.join(abs, 'index.html');
      if (!fs.existsSync(index)) {
        const entries = await fsp.readdir(abs, { withFileTypes: true });
        const list = entries
          .filter((e) => !e.name.startsWith('.') && !isProtectedPath(e.name))
          .map((e) => `<li><a href="${encodeURIComponent(e.name)}${e.isDirectory() ? '/' : ''}">${e.name}${e.isDirectory() ? '/' : ''}</a></li>`)
          .join('');
        return reply.type('text/html; charset=utf-8').send(`<!doctype html><meta charset="utf-8"><title>${rel || projectId}</title><ul style="font:14px system-ui">${list}</ul>`);
      }
      if (!req.url.endsWith('/') && rel) return reply.redirect(`${req.url}/`);
      abs = index;
      rel = path.join(rel, 'index.html');
    }
    if (!fs.existsSync(abs)) return reply.code(404).send('Not found');
    reply.header('Cache-Control', 'no-store');
    reply.type(mimeFor(abs));
    return reply.send(fs.createReadStream(abs));
  });

  app.get('/a/:token/:artifactId', async (req, reply) => {
    const { token, artifactId } = req.params as { token: string; artifactId: string };
    if (!tokenMatches(ctx.previewToken, token)) return reply.code(403).send('Forbidden');
    try {
      const { record, data } = await s.artifacts.read(artifactId);
      reply.header('Cache-Control', 'no-store');
      reply.type(record.type === 'chart' ? 'application/json' : mimeFor(record.name));
      return reply.send(data);
    } catch {
      return reply.code(404).send('Not found');
    }
  });

  return app;
}
