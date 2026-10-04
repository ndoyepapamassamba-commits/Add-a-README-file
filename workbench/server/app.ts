import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { AgentOrchestrator } from './agent/orchestrator';
import type { AppConfig } from './config';
import { bearer, resolveAuthToken, tokenMatches } from './http/auth';
import type { AppContext } from './http/context';
import { artifactRoutes } from './http/routes/artifacts';
import { browserRoutes } from './http/routes/browser';
import { projectRoutes } from './http/routes/projects';
import { sessionRoutes } from './http/routes/sessions';
import { skillRoutes } from './http/routes/skills';
import { pluginRoutes } from './http/routes/plugins';
import { systemRoutes } from './http/routes/system';
import { registerWebSocket } from './http/ws';
import { PathError } from './security/paths';
import { redactForLogs } from './security/redact';
import { createServices, type Services } from './services/container';
import type { LLMProvider } from './llm/types';

export const VERSION = '1.0.0';

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
}

const ALLOWED_ORIGIN = /^(null|https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?)$/;

export async function buildApp(config: AppConfig, opts: { provider?: LLMProvider; services?: Services; logger?: boolean } = {}): Promise<BuiltApp> {
  const services = opts.services ?? createServices(config, { provider: opts.provider });
  const orchestrator = new AgentOrchestrator(services);
  const authToken = resolveAuthToken(config.authToken, path.join(config.dataDir, '.workbench-token'));
  const ctx: AppContext = { services, orchestrator, authToken, previewToken: randomBytes(16).toString('base64url'), version: VERSION };

  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: config.logLevel,
            redact: ['req.headers.authorization', 'req.headers.cookie', 'headers.authorization'],
            hooks: {
              logMethod(args, method) {
                method.apply(this, args.map((a) => (typeof a === 'string' ? redactForLogs(a) : a)) as Parameters<typeof method>);
              },
            },
          },
    bodyLimit: 20 * 1024 * 1024,
    trustProxy: false,
  });

  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGIN.test(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  });
  await app.register(rateLimit, { max: 1200, timeWindow: '1 minute', allowList: (req) => req.url === '/api/health' });
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024, files: 30 } });
  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });

  // Every /api route requires the bearer token, except the health probe and
  // the WebSocket (authenticated by its first message).
  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0]!;
    if (!url.startsWith('/api/') || url === '/api/health' || url === '/api/ws' || url === '/api/mcp/oauth/callback') return;
    if (req.method === 'OPTIONS') return;
    if (!tokenMatches(authToken, bearer(req.headers.authorization))) {
      return reply.code(401).send({ error: 'Unauthorized: missing or invalid access token' });
    }
  });
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    return payload;
  });

  app.setErrorHandler((error, req, reply) => {
    const err = error as Error & { statusCode?: number };
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') });
    }
    if (err instanceof PathError) return reply.code(err.code === 'PROTECTED' ? 403 : 400).send({ error: err.message });
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error({ err: { message: redactForLogs(err.message), stack: err.stack } }, 'request failed');
    return reply.code(status).send({ error: redactForLogs(status >= 500 ? `Erreur interne : ${err.message}` : err.message) });
  });

  app.get('/api/health', async () => ({ ok: true, version: VERSION }));
  systemRoutes(app, ctx);
  projectRoutes(app, ctx);
  sessionRoutes(app, ctx);
  skillRoutes(app, ctx);
  pluginRoutes(app, ctx);
  artifactRoutes(app, ctx);
  browserRoutes(app, ctx);
  registerWebSocket(app, ctx);

  // Monaco web workers, loaded on demand by the client (public code, CORS-enabled
  // so the HTML file also works when opened from disk).
  app.get('/web-assets/:file', async (req, reply) => {
    const file = (req.params as { file: string }).file;
    if (!/^[\w.-]+\.js$/.test(file)) return reply.code(404).send('Not found');
    const abs = path.join(config.webDist, 'assets', file);
    const alt = path.join(config.webDist, file);
    const target = fs.existsSync(abs) ? abs : fs.existsSync(alt) ? alt : null;
    if (!target) return reply.code(404).send('Not found');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.type('text/javascript; charset=utf-8').send(fs.createReadStream(target));
  });

  // The single-file web client.
  app.get('/', async (_req, reply) => {
    const index = path.join(config.webDist, 'index.html');
    if (!fs.existsSync(index)) {
      return reply.type('text/html; charset=utf-8').send('<h1>OpenRouter AI Workbench</h1><p>Interface non construite : lancez <code>npm run build</code> (ou <code>npm run dev</code> pour le mode développement sur le port 5173).</p>');
    }
    reply.header('Cache-Control', 'no-cache');
    return reply.type('text/html; charset=utf-8').send(fs.createReadStream(index));
  });

  app.addHook('onClose', async () => {
    services.processes.shutdown();
    await services.browser.shutdown();
    await services.mcp.shutdown();
  });

  return { app, ctx };
}
