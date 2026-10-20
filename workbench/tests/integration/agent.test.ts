import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AgentEvent, PermissionMode, RunEventEnvelope } from '@shared/types';
import { buildApp } from '../../server/app';
import type { AppContext } from '../../server/http/context';
import type { FastifyInstance } from 'fastify';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';
import { tempEnv, waitFor } from '../helpers/env';

let app: FastifyInstance;
let ctx: AppContext;
let mock: MockOpenRouter;
let env: ReturnType<typeof tempEnv>;

beforeAll(async () => {
  mock = await startMockOpenRouter();
  env = tempEnv('agent', { OPENROUTER_BASE_URL: mock.url });
  const skill = path.join(env.root, 'skills', 'rapport-risque');
  fs.mkdirSync(skill, { recursive: true });
  fs.writeFileSync(
    path.join(skill, 'SKILL.md'),
    '---\nname: rapport-risque\ndescription: Rapports de risque. Se déclenche avec "rapport de risque", "IFRS9".\n---\nRÈGLE-SKILL-42 : toujours terminer par une section Recommandations.\n',
  );
  env.config.skillsDirs = [path.join(env.root, 'skills')];
  ({ app, ctx } = await buildApp(env.config, { logger: false }));
  ctx.services.settings.update({
    jev: { enabled: false },
    agent: { maxRetries: 0 },
    defaultModel: 'mock/smart-2',
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await mock.close();
  env.cleanup();
});
beforeEach(() => mock.reset());

function session(permissionMode: PermissionMode = 'normal') {
  return ctx.services.repo.createSession({
    id: randomUUID(),
    projectId: 'demo',
    title: 'Nouvelle session',
    model: 'mock/smart-2',
    permissionMode,
  });
}

/** Starts a run and collects its events until it finishes; `on` can react (approve, plan…). */
async function run(
  sessionId: string,
  text: string,
  extra: Record<string, unknown> = {},
  on?: (e: AgentEvent, runId: string) => void,
) {
  const r = await ctx.orchestrator.start({ sessionId, text, ...extra });
  const events: AgentEvent[] = [];
  let done!: () => void;
  const finished = new Promise<void>((res) => (done = res));
  const off = ctx.orchestrator.subscribe(r.id, 0, (env: RunEventEnvelope) => {
    events.push(env.event);
    on?.(env.event, r.id);
    if (env.event.type === 'run_finished') done();
  });
  await Promise.race([
    finished,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`run timed out: ${events.map((e) => e.type).join(',')}`)), 30_000),
    ),
  ]);
  off();
  const fin = events.find((e) => e.type === 'run_finished') as Extract<AgentEvent, { type: 'run_finished' }>;
  return { runId: r.id, events, status: fin.status, types: events.map((e) => e.type) };
}
const of = <T extends AgentEvent['type']>(events: AgentEvent[], type: T) =>
  events.filter((e) => e.type === type) as Extract<AgentEvent, { type: T }>[];
const file = (p: string) => path.join(env.config.workspaceRoot, 'demo', p);

describe('agent loop', () => {
  it('streams a plain answer and records real usage/cost', async () => {
    mock.push({
      text: 'Bonjour, je suis prêt.',
      usage: { prompt_tokens: 1200, completion_tokens: 30, cost: 0.004 },
    });
    const s = session();
    const r = await run(s.id, 'salut');
    expect(r.status).toBe('completed');
    expect(
      of(r.events, 'text_delta')
        .map((e) => e.text)
        .join(''),
    ).toBe('Bonjour, je suis prêt.');
    expect(of(r.events, 'usage')[0]).toMatchObject({ promptTokens: 1200, completionTokens: 30, cost: 0.004 });
    expect(ctx.services.repo.getSession(s.id)!.title).toBe('salut');
    // Stable system prompt first, dynamic project context in the user turn.
    const req = mock.requests[0]!;
    expect(req.model).toBe('mock/smart-2');
    expect((req.messages[0] as { role: string }).role).toBe('system');
    expect(JSON.stringify(req.messages[1])).toContain('salut');
    expect((req.tools ?? []).length).toBeGreaterThan(20);
  });

  it('asks before writing in NORMAL mode, then applies the approved edit', async () => {
    mock.push(
      { toolCalls: [{ name: 'filesystem.write', args: { path: 'notes/a.md', content: '# A\n' } }] },
      { text: 'Fichier créé.' },
    );
    const s = session('normal');
    const r = await run(s.id, 'crée notes/a.md', {}, (e) => {
      if (e.type === 'approval_required')
        ctx.orchestrator.resolveApproval(e.request.approvalId, { decision: 'approve' });
    });
    expect(r.status).toBe('completed');
    expect(r.types).toEqual(
      expect.arrayContaining(['approval_required', 'approval_resolved', 'tool_result', 'file_changed']),
    );
    expect(of(r.events, 'approval_required')[0]!.request.preview).toBeTruthy();
    expect(fs.readFileSync(file('notes/a.md'), 'utf8')).toBe('# A\n');
    // The tool result was sent back to the model with the matching call id.
    const toolMsg = (mock.requests[1]!.messages as { role: string; tool_call_id?: string }[]).find(
      (m) => m.role === 'tool',
    );
    expect(toolMsg?.tool_call_id).toMatch(/^call_0_/);
  });

  it('feeds a denial (with feedback) back to the model and does not write', async () => {
    mock.push(
      { toolCalls: [{ name: 'filesystem.write', args: { path: 'notes/b.md', content: 'x' } }] },
      { text: 'Compris.' },
    );
    const s = session('normal');
    const r = await run(s.id, 'crée b', {}, (e) => {
      if (e.type === 'approval_required')
        ctx.orchestrator.resolveApproval(e.request.approvalId, { decision: 'deny', note: 'pas maintenant' });
    });
    expect(r.status).toBe('completed');
    expect(fs.existsSync(file('notes/b.md'))).toBe(false);
    expect(JSON.stringify(mock.requests[1]!.messages)).toContain('pas maintenant');
  });

  it('blocks writes entirely in SAFE mode (tool not even offered)', async () => {
    mock.push(
      { toolCalls: [{ name: 'filesystem.write', args: { path: 'c.md', content: 'x' } }] },
      { text: 'Impossible en SAFE.' },
    );
    const s = session('safe');
    const r = await run(s.id, 'écris c.md');
    expect(r.status).toBe('completed');
    expect(fs.existsSync(file('c.md'))).toBe(false);
    const offered = (mock.requests[0]!.tools as { function: { name: string } }[]).map((t) => t.function.name);
    expect(offered).not.toContain('filesystem__write');
    expect(of(r.events, 'tool_result')[0]!.result.ok).toBe(false);
  });

  it('runs read-only terminal commands without asking and blocks dangerous ones', async () => {
    mock.push(
      { toolCalls: [{ name: 'terminal.execute', args: { command: 'echo hello-from-agent' } }] },
      { toolCalls: [{ name: 'terminal.execute', args: { command: 'sudo rm -rf /' } }] },
      { text: 'fini' },
    );
    const s = session('autonomous');
    const r = await run(s.id, 'lance echo');
    const results = of(r.events, 'tool_result');
    expect(results[0]!.result.ok).toBe(true);
    expect(JSON.stringify(mock.requests[1]!.messages)).toContain('hello-from-agent');
    expect(results[1]!.result.ok).toBe(false);
    expect(r.types).not.toContain('approval_required');
  });

  it('remembers "always allow" grants for the session', async () => {
    const s = session('normal');
    mock.push(
      { toolCalls: [{ name: 'terminal.execute', args: { command: 'npm --version' } }] },
      { text: 'ok' },
    );
    ctx.services.repo.setSessionSettings(s.id, { ...ctx.services.repo.getSessionSettings(s.id), grants: [] });
    mock.push(
      { toolCalls: [{ name: 'terminal.execute', args: { command: 'npx --version' } }] },
      { text: 'ok' },
    );
    let asked = 0;
    await run(s.id, 'version npm', {}, () => undefined);
    await run(s.id, 'npx 1', {}, (e) => {
      if (e.type === 'approval_required') {
        asked++;
        ctx.orchestrator.resolveApproval(e.request.approvalId, { decision: 'approve', remember: true });
      }
    });
    mock.push(
      { toolCalls: [{ name: 'terminal.execute', args: { command: 'npx --version' } }] },
      { text: 'ok' },
    );
    await run(s.id, 'npx 2', {}, (e) => {
      if (e.type === 'approval_required') asked++;
    });
    expect(asked).toBe(1);
    expect(ctx.services.repo.getSessionSettings(s.id).grants).toContain('terminal:npx --version');
  });

  it('PLAN mode: only read-only tools, waits for approval, executes the edited plan', async () => {
    mock.push(
      { toolCalls: [{ name: 'filesystem.write', args: { path: 'plan.txt', content: 'too early' } }] },
      {
        toolCalls: [
          { name: 'plan.propose', args: { summary: 'Créer le fichier', steps: ['Lire', 'Écrire'] } },
        ],
      },
      { toolCalls: [{ name: 'filesystem.write', args: { path: 'plan.txt', content: 'done' } }] },
      { text: 'Plan exécuté.' },
    );
    const s = session('autonomous');
    const r = await run(s.id, 'prépare plan.txt', { agentMode: 'plan' }, (e, runId) => {
      if (e.type === 'plan_proposed') {
        expect(fs.existsSync(file('plan.txt'))).toBe(false);
        ctx.orchestrator.resolvePlan(runId, 'approve', ['Lire', 'Écrire', 'Vérifier']);
      }
    });
    expect(r.status).toBe('completed');
    const planningTools = (mock.requests[0]!.tools as { function: { name: string } }[]).map(
      (t) => t.function.name,
    );
    expect(planningTools).toContain('plan__propose');
    expect(planningTools).not.toContain('filesystem__write');
    expect(of(r.events, 'plan_proposed')[0]!.steps.map((x) => x.title)).toEqual(['Lire', 'Écrire']);
    expect(of(r.events, 'plan_updated').at(-1)!.steps).toHaveLength(3);
    expect(JSON.stringify(mock.requests[2]!.messages)).toContain('3. Vérifier');
    expect(fs.readFileSync(file('plan.txt'), 'utf8')).toBe('done');
  });

  it('PLAN mode: cancelling the plan ends the run without changes', async () => {
    mock.push({ toolCalls: [{ name: 'plan.propose', args: { summary: 'x', steps: ['a'] } }] });
    const s = session('autonomous');
    const r = await run(s.id, 'plan', { agentMode: 'plan' }, (e, runId) => {
      if (e.type === 'plan_proposed') ctx.orchestrator.resolvePlan(runId, 'cancel');
    });
    expect(r.status).toBe('cancelled');
    expect(mock.requests).toHaveLength(1);
  });

  it('falls back to the next model when the provider fails', async () => {
    ctx.services.settings.update({ fallbackModel: 'mock/fast-1' });
    mock.push({ error: { status: 503, message: 'provider unavailable' } }, { text: 'réponse du secours' });
    const s = session();
    const r = await run(s.id, 'question');
    ctx.services.settings.update({ fallbackModel: '' });
    expect(r.status).toBe('completed');
    expect(mock.requests.map((q) => q.model)).toEqual(['mock/smart-2', 'mock/fast-1']);
    expect(of(r.events, 'model_fallback')[0]).toMatchObject({ from: 'mock/smart-2', to: 'mock/fast-1' });
    expect(ctx.services.repo.getRun(r.runId)!.model).toBe('mock/fast-1');
  });

  it('reports a clear error on 401 and on 402', async () => {
    mock.push({ error: { status: 401, message: 'No auth' } });
    const r = await run(session().id, 'q');
    expect(r.status).toBe('failed');
    expect(of(r.events, 'error')[0]!.message).toMatch(/OPENROUTER_API_KEY/);
    mock.push({ error: { status: 402, message: 'Insufficient credits' } });
    const r2 = await run(session().id, 'q');
    expect(of(r2.events, 'error')[0]!.message).toMatch(/Crédits OpenRouter insuffisants/);
  });

  it('enforces the per-task budget', async () => {
    ctx.services.settings.update({ budget: { perTask: 0.01 } });
    mock.fallback = () => ({
      toolCalls: [{ name: 'filesystem.list', args: { path: '.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 1, cost: 0.006 },
    });
    const r = await run(session('autonomous').id, 'boucle');
    ctx.services.settings.update({ budget: { perTask: 0 } });
    expect(r.status).toBe('failed');
    expect(of(r.events, 'error')[0]!.message).toMatch(/Budget par tâche/);
    expect(mock.requests).toHaveLength(2);
  });

  it('delegates to a sub-agent and forwards its activity', async () => {
    mock.push(
      { toolCalls: [{ name: 'agent.delegate', args: { role: 'reviewer', task: 'Relis notes/a.md' } }] },
      { text: 'RAS : le fichier est correct.' }, // sub-agent
      { text: 'Le relecteur confirme.' },
    );
    const r = await run(session('autonomous').id, 'fais relire');
    expect(r.status).toBe('completed');
    expect(of(r.events, 'subagent_started')[0]).toMatchObject({ role: 'reviewer' });
    expect(of(r.events, 'subagent_finished')[0]).toMatchObject({
      ok: true,
      summary: 'RAS : le fichier est correct.',
    });
    // The sub-agent got its own system prompt (reviewer role) and only the task.
    expect(JSON.stringify(mock.requests[1]!.messages)).toContain('Relis notes/a.md');
    expect(JSON.stringify(mock.requests[2]!.messages)).toContain('RAS : le fichier est correct.');
  });

  it('auto-activates matching skills and injects them as mandatory instructions', async () => {
    mock.push({ text: 'Rapport…\n\n## Recommandations' });
    const r = await run(session().id, 'Fais-moi un rapport de risque IFRS9');
    expect(of(r.events, 'skills_activated')[0]!.skills).toEqual([
      expect.objectContaining({ name: 'rapport-risque', reason: 'auto' }),
    ]);
    const system = (mock.requests[0]!.messages[0] as { content: unknown }).content;
    expect(JSON.stringify(system)).toContain('RÈGLE-SKILL-42');
    expect(JSON.stringify(system)).toContain('MANDATORY');
  });

  it('applies a custom agent profile (prompt, tool restrictions, pinned skills)', async () => {
    const agent = await ctx.services.skills.saveAgent({
      name: 'Lecteur',
      description: 'Lit seulement',
      prompt: 'CONSIGNE-AGENT-7',
      tools: ['Read', 'Grep'],
      skills: ['rapport-risque'],
    });
    mock.push(
      { toolCalls: [{ name: 'filesystem.write', args: { path: 'x.md', content: 'x' } }] },
      { text: 'Je ne peux pas écrire.' },
    );
    const r = await run(session('autonomous').id, 'écris x.md', { role: agent.id });
    const req = mock.requests[0]!;
    const offered = (req.tools as { function: { name: string } }[]).map((t) => t.function.name);
    expect(offered).toContain('filesystem__read');
    expect(offered).not.toContain('filesystem__write');
    expect(JSON.stringify(req.messages[0])).toContain('CONSIGNE-AGENT-7');
    expect(JSON.stringify(req.messages[0])).toContain('RÈGLE-SKILL-42');
    expect(of(r.events, 'tool_result')[0]!.result.ok).toBe(false);
    expect(fs.existsSync(file('x.md'))).toBe(false);
  });

  it('cancels a run waiting for approval', async () => {
    mock.push({ toolCalls: [{ name: 'filesystem.write', args: { path: 'cancel.md', content: 'x' } }] });
    const s = session('normal');
    const r = await run(s.id, 'écris', {}, (e, runId) => {
      if (e.type === 'approval_required') ctx.orchestrator.cancel(runId);
    });
    expect(r.status).toBe('cancelled');
    expect(fs.existsSync(file('cancel.md'))).toBe(false);
  });

  it('keeps conversation history across runs and replays events after a given seq', async () => {
    const s = session();
    mock.push({ text: 'premier' });
    const first = await run(s.id, 'un');
    mock.push({ text: 'second' });
    await run(s.id, 'deux');
    expect(JSON.stringify(mock.requests[1]!.messages)).toContain('premier');
    const replay: RunEventEnvelope[] = [];
    ctx.orchestrator.subscribe(first.runId, 3, (e) => replay.push(e))();
    expect(replay.length).toBeGreaterThan(0);
    expect(replay.every((e) => e.seq > 3)).toBe(true);
    expect(replay.at(-1)!.event.type).toBe('run_finished');
  });

  it('exposes runs over HTTP and WebSocket-free REST endpoints', async () => {
    const s = session();
    mock.push({ text: 'via http' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${s.id}/runs`,
      headers: { authorization: 'Bearer test-token-0123456789abcdef' },
      payload: { text: 'hello' },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().id as string;
    await waitFor(() => !ctx.orchestrator.isActive(runId));
    const ev = await app.inject({
      url: `/api/runs/${runId}/events`,
      headers: { authorization: 'Bearer test-token-0123456789abcdef' },
    });
    expect(ev.json().map((e: RunEventEnvelope) => e.event.type)).toContain('assistant_message');
  });
});

describe('mission mode', () => {
  it('runs correction rounds, an independent final review, and records the result in .ai/', async () => {
    mock.push(
      {
        toolCalls: [
          { name: 'mission.stage', args: { stage: 'analyse' } },
          { name: 'filesystem.write', args: { path: 'app/index.js', content: 'console.log(1)\n' } },
        ],
      },
      {
        toolCalls: [
          {
            name: 'mission.report',
            args: {
              status: 'FAILED',
              summary: 'build cassé',
              checks: [{ name: 'build', status: 'fail' }],
              issues: ['build'],
            },
          },
        ],
      },
      {
        toolCalls: [
          { name: 'filesystem.write', args: { path: 'app/index.js', content: 'console.log(2)\n' } },
        ],
      },
      {
        toolCalls: [
          {
            name: 'mission.report',
            args: {
              status: 'PASSED',
              summary: 'Application livrée',
              checks: [{ name: 'build', status: 'pass' }],
              deliverables: ['app/index.js'],
            },
          },
        ],
      },
      { text: 'VERDICT: APPROVED\nRien de bloquant.' }, // final reviewer (sub-agent)
    );
    const s = session('autonomous');
    const r = await run(s.id, 'Construis une petite application', { agentMode: 'mission' });
    expect(r.status).toBe('completed');
    const offered = (mock.requests[0]!.tools as { function: { name: string } }[]).map((t) => t.function.name);
    expect(offered).toEqual(expect.arrayContaining(['mission__report', 'mission__stage', 'memory__doc']));
    expect(JSON.stringify(mock.requests[0]!.messages[0])).toContain('MISSION MODE');
    const reports = of(r.events, 'mission_report');
    expect(reports.map((x) => x.report.status)).toEqual(['FAILED', 'PASSED']);
    expect(reports[1]!.review).toMatchObject({ approved: true });
    expect(of(r.events, 'mission_stage').map((x) => x.stage)).toEqual(
      expect.arrayContaining(['analyse', 'validation', 'delivery']),
    );
    expect(JSON.stringify(mock.requests[2]!.messages)).toContain('Correction round 2');
    const changelog = fs.readFileSync(file('.ai/CHANGELOG.md'), 'utf8');
    expect(changelog).toContain('PASSED — Construis une petite application');
    expect(fs.readFileSync(file('.ai/TESTS.md'), 'utf8')).toContain('[x] build');
    expect(fs.existsSync(file('.ai/PROJECT.md'))).toBe(true);
  });

  it('nudges the agent to continue when it stops without a report', async () => {
    mock.push(
      { text: 'Je pense avoir fini.' },
      {
        toolCalls: [{ name: 'mission.report', args: { status: 'PARTIAL', summary: 'partiel', checks: [] } }],
      },
      { text: 'suite' },
      {
        toolCalls: [{ name: 'mission.report', args: { status: 'PARTIAL', summary: 'partiel', checks: [] } }],
      },
      {
        toolCalls: [{ name: 'mission.report', args: { status: 'PARTIAL', summary: 'partiel', checks: [] } }],
      },
    );
    const r = await run(session('autonomous').id, 'Teste tout', { agentMode: 'mission' });
    expect(JSON.stringify(mock.requests[1]!.messages)).toContain('The mission is not finished');
    expect(of(r.events, 'mission_report').length).toBeGreaterThanOrEqual(1);
    expect(r.status).toBe('completed');
  });

  it('injects the project memory digest at the start of a session', async () => {
    fs.mkdirSync(file('.ai'), { recursive: true });
    fs.writeFileSync(file('.ai/PROJECT.md'), '# Demo\n\nÉTAT-ACTUEL-XYZ : v2 en cours.');
    mock.push({ text: 'ok' });
    await run(session().id, 'Où en est le projet ?');
    expect(JSON.stringify(mock.requests[0]!.messages[1])).toContain('ÉTAT-ACTUEL-XYZ');
    expect(JSON.stringify(mock.requests[0]!.messages[0])).toContain('Project memory (.ai/)');
  });
});

describe('APEX Studio (server)', () => {
  it('builds an offline house app, rejects bad code and runs the QA in Chromium', async () => {
    const { houseKit } = await import('../../server/tools/apex');
    if (!houseKit()) return; // house kit not installed on this machine
    const appJs =
      "'use strict';const KIT={org:'O',unit:'U',app:'A',footer:'F',docTitle:'T',docSubject:'S',keywords:'k'};function toast(m){}document.title='APEX srv';";
    mock.push(
      { toolCalls: [{ name: 'apex.build_app', args: { name: 'bad', app_js: 'function( {' } }] },
      { toolCalls: [{ name: 'apex.build_app', args: { name: 'demo', app_js: appJs } }] },
      { toolCalls: [{ name: 'apex.qa', args: { path: 'apps/demo.html' } }] },
      { text: 'Livré.' },
    );
    const r = await run(session('autonomous').id, 'Crée un dashboard comme l’APEX');
    expect(r.status).toBe('completed');
    const msgs = JSON.stringify(mock.requests.at(-1)!.messages);
    expect(msgs).toContain('KIT is not defined');
    expect(msgs).toContain('Syntax error');
    expect(msgs).toContain('QA PASSED');
    expect(msgs).toContain('APEX srv');
    const html = fs.readFileSync(file('apps/demo.html'), 'utf8');
    expect(html).toContain('g3LogoBadge');
    expect(html).not.toMatch(/\/\*@@[A-Z]+@@\*\//);
  }, 60_000);
});

describe('MASSAMBA Intelligence Engine (server)', () => {
  it('strategy + manual + evidence check on a data answer, then learning', async () => {
    fs.mkdirSync(file('data'), { recursive: true });
    fs.writeFileSync(file('data/ventes.csv'), 'agence,montant\nDakar,1250\nThies,430\n');
    mock.push(
      {
        toolCalls: [
          {
            name: 'data.query',
            args: { path: 'data/ventes.csv', query: { aggregations: [{ column: 'montant', fn: 'sum' }] } },
          },
        ],
      },
      { text: 'Total 1680, marge 98 765 432.' },
      { text: 'Total 1680 ; la marge ne peut pas être calculée.' },
    );
    const s = session('autonomous');
    const r = await run(
      s.id,
      'À partir de maintenant, cite toujours la source des chiffres. Donne le total des ventes de data/ventes.csv.',
    );
    expect(r.status).toBe('completed');
    const intel = of(r.events, 'intel');
    expect(intel.map((e) => e.title)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Stratégie/),
        'Manuel personnel : règle mémorisée',
        'Contrôle des preuves : chiffres sans source',
      ]),
    );
    expect(JSON.stringify(mock.requests[2]!.messages)).toContain('[EVIDENCE CHECK]');
    expect(JSON.stringify(mock.requests[2]!.messages[0])).toContain('cite toujours la source des chiffres');
    const ledger = ctx.services.brain.ledger.entries;
    expect(ledger.at(-1)).toMatchObject({ verdict: 'PASSED' });
    expect(ledger.at(-1)!.dna.type).toBe('data');
  });

  it('critical mission: red team blocks, correction round, judge approves', async () => {
    mock.push(
      {
        toolCalls: [
          {
            name: 'mission.report',
            args: {
              status: 'PASSED',
              summary: 'Note COMEX prête',
              checks: [{ name: 'total', status: 'pass' }],
            },
          },
        ],
      },
      { text: 'CONFIDENCE: 35%\nBLOCKING: provisions fausses' },
      {
        toolCalls: [
          {
            name: 'mission.report',
            args: {
              status: 'PASSED',
              summary: 'Note COMEX corrigée',
              checks: [{ name: 'total', status: 'pass' }],
            },
          },
        ],
      },
      { text: 'CONFIDENCE: 92%\nBLOCKING: none' },
      { text: 'VERDICT: APPROVED' },
    );
    const r = await run(session('autonomous').id, 'Prépare la note au COMEX sur les provisions IFRS9', {
      agentMode: 'mission',
    });
    expect(r.status).toBe('completed');
    const titles = of(r.events, 'intel').map((e) => e.title);
    expect(titles).toEqual(
      expect.arrayContaining(['Red team — confiance 35 %', 'Red team — confiance 92 %']),
    );
    expect(JSON.stringify(mock.requests[2]!.messages)).toContain('The red team found blocking problems');
    const reports = of(r.events, 'mission_report');
    expect(reports.at(-1)!.review?.approved).toBe(true);
  });
});
