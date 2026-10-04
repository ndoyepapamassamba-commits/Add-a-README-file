import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createTwoFilesPatch } from 'diff';
import type { AgentEvent, RunEventEnvelope } from '@shared/types';
import { estimateTokens } from '../../agent/context';
import { ROLES } from '../../agent/roles';
import type { ChatMessage } from '../../llm/types';
import { selectModel } from '../../llm/router';
import { toolDefinitions } from '../../tools/registry';
import { markdownToHtml } from '../../services/artifacts';
import type { AppContext } from '../context';
import { HttpError } from '../context';

const RoleEnum = z.enum(['general', 'coder', 'researcher', 'browser', 'data_analyst', 'reviewer', 'tester']);
const EffortEnum = z.enum(['auto', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const ModeEnum = z.enum(['safe', 'normal', 'autonomous']);

export function sessionRoutes(app: FastifyInstance, ctx: AppContext): void {
  const s = ctx.services;
  const orch = ctx.orchestrator;
  const sid = (req: { params: unknown }) => (req.params as { id: string }).id;
  const mustSession = (id: string) => {
    const session = s.repo.getSession(id);
    if (!session) throw new HttpError(404, 'Session introuvable');
    return session;
  };

  app.get('/api/sessions', async (req) => {
    const q = req.query as { projectId?: string };
    return s.repo.listSessions(q.projectId).map((x) => ({ ...x, active: Boolean(orch.activeRunForSession(x.id)) }));
  });

  app.post('/api/sessions', async (req) => {
    const b = z
      .object({ projectId: z.string().min(1), title: z.string().max(200).optional(), model: z.string().optional(), permissionMode: ModeEnum.optional(), role: RoleEnum.optional() })
      .parse(req.body);
    s.workspace.getProject(b.projectId);
    const appSettings = s.settings.get();
    const session = s.repo.createSession({
      id: randomUUID(),
      projectId: b.projectId,
      title: b.title ?? 'Nouvelle session',
      model: b.model ?? appSettings.defaultModel,
      permissionMode: b.permissionMode ?? appSettings.defaultPermissionMode,
    });
    if (b.role) s.repo.setSessionSettings(session.id, { role: b.role });
    return session;
  });

  app.get('/api/sessions/:id', async (req) => {
    const session = mustSession(sid(req));
    const runs = s.repo.listRuns({ sessionId: session.id, limit: 2000 });
    const events: Record<string, RunEventEnvelope[]> = {};
    for (const r of runs) events[r.id] = s.repo.listRunEvents(r.id);
    return {
      session,
      settings: s.repo.getSessionSettings(session.id),
      runs,
      events,
      activeRunId: orch.activeRunForSession(session.id),
      changes: s.repo.listChanges({ sessionId: session.id }).map((c) => ({ ...c, before: undefined, after: undefined })),
      artifacts: s.repo.listArtifacts({ sessionId: session.id }),
    };
  });

  app.patch('/api/sessions/:id', async (req) => {
    const session = mustSession(sid(req));
    const b = z
      .object({
        title: z.string().min(1).max(200).optional(),
        model: z.string().min(1).optional(),
        permissionMode: ModeEnum.optional(),
        autoApproveEdits: z.boolean().optional(),
        role: RoleEnum.optional(),
        resetGrants: z.boolean().optional(),
      })
      .parse(req.body);
    s.repo.updateSession(session.id, { title: b.title, model: b.model, permissionMode: b.permissionMode });
    const settings = s.repo.getSessionSettings(session.id);
    if (b.autoApproveEdits !== undefined) settings.autoApproveEdits = b.autoApproveEdits;
    if (b.role) settings.role = b.role;
    if (b.resetGrants) settings.grants = [];
    s.repo.setSessionSettings(session.id, settings);
    if (b.permissionMode) s.repo.audit({ actor: 'user', action: 'session.permission_mode', target: session.id, decision: b.permissionMode });
    return { session: s.repo.getSession(session.id), settings };
  });

  app.delete('/api/sessions/:id', async (req) => {
    const id = sid(req);
    if (orch.activeRunForSession(id)) throw new HttpError(409, 'Arrêtez la tâche en cours avant de supprimer la session');
    s.repo.deleteSession(id);
    return { ok: true };
  });

  app.post('/api/sessions/:id/compact', async (req) => orch.compactSession(mustSession(sid(req)).id));
  app.post('/api/sessions/:id/review', async (req) => {
    const b = z.object({ model: z.string().optional(), focus: z.string().max(2000).optional() }).parse(req.body ?? {});
    return orch.review(mustSession(sid(req)).id, b);
  });

  // ── runs ──────────────────────────────────────────────────────────────
  app.post('/api/sessions/:id/runs', async (req) => {
    const session = mustSession(sid(req));
    const b = z
      .object({
        text: z.string().min(1).max(200_000),
        attachments: z.array(z.string()).max(30).default([]),
        model: z.string().optional(),
        effort: EffortEnum.default('auto'),
        role: RoleEnum.optional(),
        agentMode: z.enum(['chat', 'plan']).default('chat'),
        ui: z
          .object({
            openFile: z.string().optional(),
            selection: z.object({ text: z.string(), startLine: z.number(), endLine: z.number() }).optional(),
            dataset: z.string().optional(),
            browserUrl: z.string().optional(),
          })
          .optional(),
      })
      .parse(req.body);
    return orch.start({ sessionId: session.id, ...b });
  });

  app.get('/api/runs', async (req) => {
    const q = req.query as { limit?: string };
    return s.repo.listRuns({ limit: Math.min(Number(q.limit ?? 300), 2000) }).map((r) => ({ ...r, active: orch.isActive(r.id) }));
  });
  app.get('/api/runs/:id/events', async (req) => {
    const after = Number((req.query as { after?: string }).after ?? -1);
    return s.repo.listRunEvents(sid(req), after);
  });
  app.post('/api/runs/:id/cancel', async (req) => ({ ok: orch.cancel(sid(req)) }));
  app.post('/api/runs/:id/plan', async (req) => {
    const b = z.object({ decision: z.enum(['approve', 'cancel']), steps: z.array(z.string().min(1).max(300)).max(30).optional() }).parse(req.body);
    if (!orch.resolvePlan(sid(req), b.decision, b.steps)) throw new HttpError(409, 'Aucun plan en attente pour cette tâche');
    return { ok: true };
  });
  app.post('/api/approvals/:id', async (req) => {
    const b = z.object({ decision: z.enum(['approve', 'deny']), note: z.string().max(4000).optional(), remember: z.boolean().default(false) }).parse(req.body);
    if (!orch.resolveApproval(sid(req), b)) throw new HttpError(409, 'Demande déjà traitée ou expirée');
    return { ok: true };
  });

  // Cost estimate for the next request, from the provider's published prices.
  app.post('/api/estimate', async (req) => {
    const b = z.object({ sessionId: z.string(), text: z.string().default(''), model: z.string().optional(), role: RoleEnum.optional() }).parse(req.body);
    const session = mustSession(b.sessionId);
    const models = await s.catalog.list().catch(() => s.catalog.all);
    const role = b.role ?? s.repo.getSessionSettings(session.id).role ?? 'general';
    const sel = selectModel({
      requested: b.model ?? session.model,
      models,
      tiers: s.settings.get().autoTiers,
      signals: { text: b.text, hasImages: false, role, historyLength: 0 },
      fallbackDefault: 'openai/gpt-4o-mini',
    });
    const info = s.catalog.get(sel.model);
    const history = s.repo.listMessages(session.id).map((m) => m.content as ChatMessage);
    const toolTokens = Math.ceil(JSON.stringify(toolDefinitions(ROLES[role].tools)).length / 3.6);
    const promptTokens = estimateTokens(history) + toolTokens + 2500 + Math.ceil(b.text.length / 3.6);
    const outTokens = 1200;
    const perStep = info && info.inputPrice !== null && info.outputPrice !== null ? (promptTokens * info.inputPrice + outTokens * info.outputPrice) / 1_000_000 : null;
    return {
      model: sel.model,
      auto: sel.auto,
      reason: sel.reason,
      promptTokens,
      contextLength: info?.contextLength ?? null,
      inputPrice: info?.inputPrice ?? null,
      outputPrice: info?.outputPrice ?? null,
      perStep,
      // Agent tasks usually take several steps; prompt caching often lowers the real cost.
      typicalTask: perStep === null ? null : perStep * 5,
    };
  });

  // ── changes for a session ─────────────────────────────────────────────
  app.get('/api/sessions/:id/changes', async (req) => s.repo.listChanges({ sessionId: sid(req) }));
  app.get('/api/changes/:id', async (req) => {
    const c = s.repo.getChange(sid(req));
    if (!c) throw new HttpError(404, 'Modification introuvable');
    return c;
  });
  app.post('/api/sessions/:id/changes/accept-all', async (req) => {
    const changes = s.repo.listChanges({ sessionId: sid(req) }).filter((c) => c.status === 'applied');
    for (const c of changes) s.workspace.acceptChange(c.id);
    return { accepted: changes.length };
  });

  // ── export ────────────────────────────────────────────────────────────
  app.get('/api/sessions/:id/export', async (req, reply) => {
    const q = z
      .object({ format: z.enum(['md', 'json', 'pdf']).default('md'), include: z.string().default('conversation,trace,changes') })
      .parse(req.query);
    const session = mustSession(sid(req));
    const include = new Set(q.include.split(','));
    const runs = s.repo.listRuns({ sessionId: session.id, limit: 5000 });
    const events = Object.fromEntries(runs.map((r) => [r.id, s.repo.listRunEvents(r.id)]));
    const changes = s.repo.listChanges({ sessionId: session.id });
    const artifacts = s.repo.listArtifacts({ sessionId: session.id });
    const fileBase = `session-${session.title.replace(/[^\w-]+/g, '_').slice(0, 40) || session.id.slice(0, 8)}`;
    if (q.format === 'json') {
      reply.header('Content-Disposition', `attachment; filename="${fileBase}.json"`);
      return { session, runs, events: include.has('trace') || include.has('conversation') ? events : undefined, changes: include.has('changes') ? changes : undefined, artifacts };
    }
    const md: string[] = [
      `# ${session.title}`,
      '',
      `- Projet : ${session.projectId}`,
      `- Modèle : ${session.model} · Mode : ${session.permissionMode}`,
      `- Créée : ${new Date(session.createdAt).toLocaleString('fr-FR')} · Mise à jour : ${new Date(session.updatedAt).toLocaleString('fr-FR')}`,
      `- Tokens : ${session.tokensIn} entrée / ${session.tokensOut} sortie · Coût : $${session.cost.toFixed(4)}`,
      '',
    ];
    for (const r of runs.filter((x) => !x.parentRunId)) {
      const evs = (events[r.id] ?? []).map((e) => e.event as AgentEvent);
      const started = evs.find((e) => e.type === 'run_started');
      md.push(`## ${r.role === 'reviewer' ? '🔍 ' : ''}${r.title}`, '');
      if (include.has('conversation') && started?.type === 'run_started') md.push(`**Utilisateur :**`, '', started.userText, '');
      for (const e of evs) {
        if (e.type === 'assistant_message' && include.has('conversation') && !e.agentPath) md.push(`**Agent :**`, '', e.text, '');
        if (e.type === 'tool_result' && include.has('trace')) md.push(`- \`${e.tool}\` ${e.result.ok ? '✓' : '✗'} ${e.result.summary} _(${e.durationMs} ms)_`);
        if (e.type === 'plan_proposed' && include.has('trace')) md.push('', '**Plan proposé :**', ...e.steps.map((p, i) => `${i + 1}. ${p.title}`), '');
        if (e.type === 'error') md.push(`> ⚠️ ${e.message}`);
      }
      md.push('', `_Statut : ${r.status} · ${r.model} · ${r.tokensIn + r.tokensOut} tokens · $${r.cost.toFixed(4)}_`, '');
    }
    if (include.has('changes') && changes.length) {
      md.push('## Modifications de fichiers', '');
      for (const c of changes) {
        md.push(`### ${c.op} ${c.path} (${c.status}, +${c.added} −${c.removed})`, '');
        if (c.op !== 'move') md.push('```diff', createTwoFilesPatch(c.path, c.path, c.before ?? '', c.after ?? '', '', '', { context: 2 }).split('\n').slice(4).join('\n').slice(0, 30_000), '```', '');
      }
    }
    if (artifacts.length) md.push('## Artefacts', '', ...artifacts.map((a) => `- ${a.name} (${a.type}, ${a.size} octets)`), '');
    const text = md.join('\n');
    if (q.format === 'pdf') {
      const pdf = await s.browser.htmlToPdf(markdownToHtml(text, session.title));
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="${fileBase}.pdf"`);
      return reply.send(pdf);
    }
    reply.header('Content-Type', 'text/markdown; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${fileBase}.md"`);
    return text;
  });
}
