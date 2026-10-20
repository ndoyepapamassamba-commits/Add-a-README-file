import { describe, expect, it } from 'vitest';
import {
  CapabilityRegistry,
  GitHubCapabilityAdapter,
  ListAdapter,
  LocalToolsAdapter,
  explainSelection,
  requirementsOf,
  selectCapabilities,
  type LocalToolLike,
} from '../../server/jev/fabric/registry';

const T = (name: string, readOnly = true, risk = 'read'): LocalToolLike => ({
  name,
  description: `outil ${name}`,
  risk,
  readOnly,
});
const TOOLS: LocalToolLike[] = [
  ...[
    'filesystem.list',
    'filesystem.read',
    'filesystem.search',
    'data.inspect',
    'data.query',
    'data.chart',
    'data.export',
    'code.run',
    'web.search',
    'wikipedia.search',
    'browser.open',
    'browser.click',
    'browser.snapshot',
    'image.generate',
    'diagram.render',
    'report.export',
    'plan.update',
    'weather.forecast',
  ].map((n) => T(n)),
  T('filesystem.write', false, 'write'),
  T('filesystem.delete', false, 'danger'),
  T('terminal.execute', false, 'danger'),
];

async function registry(extra?: (r: CapabilityRegistry) => void) {
  const r = new CapabilityRegistry();
  r.register(new LocalToolsAdapter('direct', () => TOOLS));
  extra?.(r);
  await r.refresh();
  return r;
}

describe('capability registry', () => {
  it('discovers capabilities dynamically: a new adapter appears without touching other code', async () => {
    const r = await registry();
    const before = r.size;
    expect(before).toBe(TOOLS.length);
    r.register(
      new ListAdapter('mcp:demo', 'MCP demo', () => [
        {
          id: 'mcp:demo:lookup',
          name: 'demo.lookup',
          type: 'mcp',
          description: 'recherche',
          tags: ['lookup', 'finance'],
          supportedTaskTypes: ['research'],
        },
      ]),
    );
    await r.refresh();
    expect(r.size).toBe(before + 1);
    expect(r.get('mcp:demo:lookup')!.type).toBe('mcp');
    r.unregister('mcp:demo');
    await r.refresh();
    expect(r.size).toBe(before);
  });

  it('every capability carries the specified fields; unknown statistics are null, not 0', async () => {
    const r = await registry();
    const c = r.byName('data.query')!;
    for (const k of [
      'id',
      'name',
      'type',
      'description',
      'provider',
      'version',
      'status',
      'permissions',
      'risk',
      'cost',
      'latency',
      'supportedTaskTypes',
      'requiredSkills',
      'inputSchema',
      'outputSchema',
      'reliability',
      'lastUsed',
      'successRate',
      'failureRate',
      'averageLatency',
      'averageCost',
      'securityPolicy',
      'provenance',
    ])
      expect(c).toHaveProperty(k);
    expect(c.successRate).toBeNull();
    expect(c.samples).toBe(0);
    expect(c.type).toBe('spreadsheet');
  });

  it('governance: destructive tools need approval, read tools do not', async () => {
    const r = await registry();
    expect(r.byName('filesystem.delete')!.approvalRequired).toBe(true);
    expect(r.byName('filesystem.delete')!.risk).toBe('destructive');
    expect(r.byName('terminal.execute')!.permissions).toContain('exec');
    expect(r.byName('filesystem.read')!.approvalRequired).toBe(false);
    expect(r.byName('web.search')!.networkAccess).toBe(true);
  });

  it('measured statistics overlay the registry', async () => {
    const r = await registry();
    r.setStats(
      new Map([
        [
          'data.query',
          {
            samples: 12,
            successRate: 0.92,
            failureRate: 0.08,
            averageLatency: 4200,
            averageCost: 0.003,
            lastUsed: 99,
            usedBy: ['IFRS9'],
          },
        ],
      ]),
    );
    const c = r.byName('data.query')!;
    expect(c.reliability).toBe(0.92);
    expect(c.samples).toBe(12);
    expect(c.usedBy).toEqual(['IFRS9']);
  });
});

describe('capability discovery and minimal toolset', () => {
  it('Excel IFRS9 anomalies: spreadsheet / reader / statistics in, browser / GitHub / image / terminal / web out', async () => {
    const r = await registry((x) =>
      x.register(new GitHubCapabilityAdapter({ json: async () => ({}), hasToken: () => false })),
    );
    const req = requirementsOf('data', 'Analyse ce fichier Excel et identifie les anomalies IFRS9', true);
    expect(req.needs).toEqual(expect.arrayContaining(['spreadsheet', 'filereader', 'statistics']));
    const sel = selectCapabilities(r, req, { max: 8 });
    const names = sel.selected.map((s) => s.cap.name);
    expect(names).toEqual(expect.arrayContaining(['data.query', 'data.inspect', 'filesystem.read']));
    for (const bad of [
      'browser.open',
      'browser.click',
      'github.search_repositories',
      'image.generate',
      'terminal.execute',
      'web.search',
      'weather.forecast',
    ])
      expect(names).not.toContain(bad);
    expect(sel.exposed).toBeLessThanOrEqual(8);
    expect(sel.examined).toBeGreaterThan(sel.exposed);
    expect(sel.rejected.find((x) => x.cap.name === 'browser.open')!.why).toContain('non requis');
    expect(explainSelection(sel).join(' ')).toMatch(/Jugé\(s\) inutile\(s\)/);
  });

  it('keeps the exposure small even with hundreds of capabilities', async () => {
    const r = await registry((x) =>
      x.register(
        new ListAdapter('bulk', 'bulk', () =>
          Array.from({ length: 400 }, (_, i) => ({
            id: `bulk:${i}`,
            name: `bulk.tool${i}`,
            type: 'tool' as const,
            description: 'x',
            tags: ['misc'],
            supportedTaskTypes: [] as string[],
          })),
        ),
      ),
    );
    expect(r.size).toBeGreaterThan(400);
    const sel = selectCapabilities(
      r,
      requirementsOf('data', 'calcule la moyenne du fichier ventes.csv', true),
      { max: 6 },
    );
    expect(sel.exposed).toBeLessThanOrEqual(6);
    expect(sel.examined).toBeGreaterThan(400);
  });

  it('respects the agent allowance, policy exclusions and the read-only guard', async () => {
    const r = await registry();
    const req = requirementsOf('code', 'écris une fonction et lance-la', false);
    const allowed = new Set(['filesystem.read', 'filesystem.write', 'code.run']);
    const sel = selectCapabilities(r, req, { allowed, excluded: new Set(['filesystem.write']) });
    expect(sel.selected.map((s) => s.cap.name).sort()).toEqual(['code.run', 'filesystem.read']);
    expect(sel.rejected.find((x) => x.cap.name === 'filesystem.write')!.why).toContain('politique apprise');
    const ro = selectCapabilities(r, requirementsOf('data', 'supprime le fichier a.csv', true), {
      readOnlyTask: true,
    });
    expect(ro.selected.map((s) => s.cap.name)).not.toContain('filesystem.delete');
  });

  it('meta tools are always exposed', async () => {
    const r = await registry();
    const sel = selectCapabilities(r, requirementsOf('chat', 'bonjour', false), {
      alwaysInclude: ['plan.update'],
    });
    expect(sel.selected.map((s) => s.cap.name)).toContain('plan.update');
  });
});

describe('GitHub capability adapter: honest status, no secret, no silent write', () => {
  const mk = (over: Partial<{ ok: boolean; token: boolean }> = {}) => {
    const calls: string[] = [];
    const a = new GitHubCapabilityAdapter({
      async json(p) {
        calls.push(p);
        if (over.ok === false) throw new Error('network down');
        return p === '/rate_limit' ? { resources: { core: { remaining: 58, limit: 60 } } } : { items: [] };
      },
      hasToken: () => Boolean(over.token),
    });
    return { a, calls };
  };
  it('UNAVAILABLE when the API is unreachable (never simulated as connected)', async () => {
    const { a } = mk({ ok: false });
    const h = await a.health();
    expect(h.status).toBe('UNAVAILABLE');
    expect(a.discover().every((d) => d.statusOverride!.status === 'UNAVAILABLE')).toBe(true);
  });
  it('PARTIAL without token: public reads work, code search and writes need a token', async () => {
    const { a } = mk();
    expect((await a.health()).status).toBe('PARTIAL');
    const st = Object.fromEntries(a.discover().map((d) => [d.id, d.statusOverride!.status]));
    expect(st['github:search_repositories']).toBe('PARTIAL');
    expect(st['github:search_code']).toBe('UNAVAILABLE');
    expect(st['github:create_pull_request']).toBe('UNAVAILABLE');
    const r = await a.execute('github:search_repositories', { query: 'ifrs9', limit: 3 });
    expect(r.ok).toBe(true);
    expect((await a.execute('github:search_code', { query: 'x' })).ok).toBe(false);
  });
  it('with a token: AVAILABLE; writes are only prepared, never executed silently', async () => {
    const { a, calls } = mk({ token: true });
    expect((await a.health()).status).toBe('AVAILABLE');
    const w = await a.execute('github:create_pull_request', { title: 't' });
    expect(w.pendingApproval).toBe(true);
    expect(calls.some((c) => c.includes('pulls') && c.includes('create'))).toBe(false);
    const approved = await a.execute('github:create_pull_request', { title: 't' }, { approved: true });
    expect(approved.ok).toBe(false);
    expect(approved.error).toContain('non connectée');
    expect(JSON.stringify(a.discover())).not.toMatch(/ghp_|bearer/i);
  });
  it('local destructive tools are prepared, not executed, without approval', async () => {
    const ad = new LocalToolsAdapter(
      'direct',
      () => TOOLS,
      async () => ({ ok: true, output: 'done' }),
    );
    const id = 'local:direct:filesystem.delete';
    expect((await ad.execute(id, { path: 'a' })).pendingApproval).toBe(true);
    expect((await ad.execute(id, { path: 'a' }, { approved: true })).ok).toBe(true);
  });
});
