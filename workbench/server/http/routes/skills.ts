import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { HttpError } from '../context';

export function skillRoutes(app: FastifyInstance, ctx: AppContext): void {
  const s = ctx.services;

  app.get('/api/skills', async () => {
    const disabled = new Set(s.settings.get().skills.disabled);
    return (await s.skills.list()).map((k) => ({
      name: k.name,
      description: k.description,
      source: k.source,
      files: k.files,
      triggers: k.triggers,
      size: k.size,
      disabled: disabled.has(k.name),
    }));
  });
  app.post('/api/skills/rescan', async () => {
    await s.skills.scan(true);
    return { count: (await s.skills.list()).length, agents: (await s.skills.listAgents()).length };
  });
  app.post('/api/skills/match', async (req) => {
    const b = z.object({ text: z.string().min(1).max(20_000) }).parse(req.body);
    return s.skills.match(b.text, s.settings.get().skills.disabled);
  });
  app.post('/api/skills/import', async (req) => {
    const imported: string[] = [];
    for await (const part of req.files({ limits: { fileSize: 50 * 1024 * 1024, files: 20 } })) {
      imported.push(...(await s.skills.import(part.filename || 'skill.zip', await part.toBuffer())));
    }
    if (!imported.length) throw new HttpError(400, 'Aucun fichier reçu');
    s.repo.audit({ actor: 'user', action: 'skills.import', details: imported });
    return { imported };
  });
  app.get('/api/skills/:name', async (req) => {
    const name = (req.params as { name: string }).name;
    const skill = await s.skills.get(name);
    return {
      name: skill.name,
      description: skill.description,
      source: skill.source,
      files: skill.files,
      triggers: skill.triggers,
      body: await s.skills.body(name),
    };
  });
  app.get('/api/skills/:name/file', async (req) => {
    const name = (req.params as { name: string }).name;
    const p = z.object({ path: z.string().min(1) }).parse(req.query).path;
    return { path: p, content: await s.skills.readFile(name, p) };
  });
  app.delete('/api/skills/:name', async (req) => {
    const name = (req.params as { name: string }).name;
    await s.skills.remove(name);
    s.repo.audit({ actor: 'user', action: 'skills.delete', target: name });
    return { ok: true };
  });

  // ── custom agents ─────────────────────────────────────────────────────
  app.get('/api/agents/:id', async (req) => {
    const a = await s.skills.getAgent((req.params as { id: string }).id);
    if (!a) throw new HttpError(404, 'Agent introuvable');
    return a;
  });
  app.post('/api/agents', async (req) => {
    const b = z
      .object({
        id: z.string().max(80).optional(),
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().min(5).max(600),
        prompt: z.string().trim().min(10).max(60_000),
        tools: z.array(z.string()).max(80).optional(),
        model: z.string().max(200).optional(),
        effort: z.string().max(20).optional(),
        skills: z.array(z.string()).max(20).optional(),
      })
      .parse(req.body);
    const a = await s.skills.saveAgent(b);
    s.repo.audit({ actor: 'user', action: 'agents.save', target: a.id });
    return a;
  });
  app.delete('/api/agents/:id', async (req) => {
    const id = (req.params as { id: string }).id;
    await s.skills.deleteAgent(id);
    s.repo.audit({ actor: 'user', action: 'agents.delete', target: id });
    return { ok: true };
  });
}
