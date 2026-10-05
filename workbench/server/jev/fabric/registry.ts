// JEV CAPABILITY REGISTRY + CapabilityAdapter + discovery / minimal-set selection.
//
// PLUS DE CAPACITÉS ≠ PLUS DE CONTEXTE: the registry may hold hundreds of capabilities
// (tools, plugins, MCP, models, skills, GitHub…), but the selector only exposes the few
// the mission needs. New capabilities appear by registering an adapter — no other code
// has to change.
import { TOOL_FAMILIES } from '../tools';
import type { CapRisk, CapStatus, Capability, CapabilityGovernance, CapabilityType } from './types';

export interface CapabilityDescriptor {
  id: string;
  name: string;
  type: CapabilityType;
  description: string;
  version?: string;
  risk?: CapRisk;
  tags?: string[];
  supportedTaskTypes?: string[];
  requiredSkills?: string[];
  inputSchema?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
  governance?: Partial<CapabilityGovernance>;
  cost?: number | null;
  latency?: number | null;
  securityPolicy?: string;
  statusOverride?: { status: CapStatus; detail?: string };
}

export interface AdapterHealth {
  status: CapStatus;
  detail: string;
  checkedAt: number;
}
export interface ExecResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  /** The adapter prepared an action and is waiting for an explicit approval (never executed silently). */
  pendingApproval?: boolean;
}

/** Universal adapter: plugins, connectors, MCP, APIs, local tools, GitHub, browser, files, data. */
export interface CapabilityAdapter {
  id: string;
  provider: string;
  discover(): Promise<CapabilityDescriptor[]> | CapabilityDescriptor[];
  describe(id: string): CapabilityDescriptor | null;
  health(): Promise<AdapterHealth> | AdapterHealth;
  permissions(id: string): CapabilityGovernance;
  execute(id: string, input: Record<string, unknown>, ctx?: { approved?: boolean }): Promise<ExecResult>;
  estimateCost(id: string, input?: Record<string, unknown>): number | null;
  estimateLatency(id: string, input?: Record<string, unknown>): number | null;
}

// ───────────────────────── tags & governance of the local tools ─────────────────────────

const FAMILY_TAGS: Record<string, string[]> = {
  read: ['files', 'filereader'],
  write: ['files', 'filewriter', 'write'],
  data: ['spreadsheet', 'data', 'statistics', 'analysis', 'excel', 'csv'],
  code: ['code', 'compute', 'statistics', 'script'],
  web: ['web', 'research', 'search'],
  browser: ['browser', 'web', 'ui'],
  deliver: ['document', 'report', 'export'],
  decide: ['decision', 'analysis', 'simulation'],
  plan: ['plan'],
  memory: ['memory', 'notes'],
  history: ['history', 'versions'],
  apex: ['apex', 'dashboard', 'app', 'report'],
  finance: ['finance', 'data', 'rates'],
  visual: ['image', 'visual', 'diagram'],
  geo: ['geo', 'weather', 'external'],
};
const FAMILY_TYPE: Record<string, CapabilityType> = {
  read: 'filesystem',
  write: 'filesystem',
  data: 'spreadsheet',
  code: 'code',
  web: 'web',
  browser: 'browser',
  deliver: 'document',
  decide: 'data',
  plan: 'tool',
  memory: 'memory',
  history: 'filesystem',
  apex: 'document',
  finance: 'data',
  visual: 'image',
  geo: 'web',
};
const TASKS_BY_FAMILY: Record<string, string[]> = {
  read: ['chat', 'writing', 'data', 'code', 'research', 'browser', 'document', 'review'],
  write: ['writing', 'code', 'document', 'data', 'browser'],
  data: ['data', 'document'],
  code: ['code', 'data', 'review', 'browser'],
  web: ['research'],
  browser: ['browser', 'code'],
  deliver: ['writing', 'data', 'document', 'research'],
  decide: ['data', 'research'],
  plan: ['code', 'research'],
  memory: ['chat', 'writing', 'code'],
  history: ['code', 'document'],
  apex: ['data', 'document', 'code'],
  finance: ['data', 'research'],
  visual: ['writing', 'document'],
  geo: ['research', 'chat'],
};

const toolFamily = (name: string): string | null => {
  for (const [f, names] of Object.entries(TOOL_FAMILIES)) if (names.includes(name)) return f;
  return null;
};

/** Governance of a local tool, from its name and declared risk (no tool is trusted by default). */
export function governanceOfTool(name: string, risk: string, readOnly: boolean): CapabilityGovernance {
  const fam = toolFamily(name);
  const destructive = /delete|restore|\.push|\.merge|\.send|\.publish/.test(name);
  const network =
    fam === 'web' || fam === 'browser' || fam === 'geo' || fam === 'finance' || fam === 'visual';
  const exec = name === 'terminal.execute' || name === 'code.run';
  return {
    permissions: [
      readOnly ? 'read' : 'write',
      ...(network ? ['network'] : []),
      ...(exec ? ['exec'] : []),
      ...(destructive ? ['delete'] : []),
    ],
    scope: network ? 'network' : fam === 'browser' ? 'browser' : 'workspace',
    approvalRequired: destructive || (risk !== 'read' && risk !== 'safe' && !readOnly),
    dataAccess: true,
    writeAccess: !readOnly,
    networkAccess: network,
  };
}
const riskOf = (risk: string, readOnly: boolean, name: string): CapRisk =>
  /delete|restore|\.push|\.merge|\.send|\.publish/.test(name)
    ? 'destructive'
    : risk === 'danger' || risk === 'high'
      ? 'high'
      : readOnly
        ? 'low'
        : 'medium';

// ───────────────────────── adapters ─────────────────────────

/** A minimal local tool description (what the direct edition's DirectTool exposes). */
export interface LocalToolLike {
  name: string;
  description: string;
  risk: string;
  readOnly: boolean;
  parameters?: Record<string, unknown>;
}

export class LocalToolsAdapter implements CapabilityAdapter {
  readonly id: string;
  constructor(
    readonly provider: string,
    private readonly tools: () => LocalToolLike[],
    private readonly run?: (name: string, input: Record<string, unknown>) => Promise<ExecResult>,
    private readonly kind: CapabilityType = 'tool',
  ) {
    this.id = `local:${provider}`;
  }
  discover(): CapabilityDescriptor[] {
    return this.tools().map((t) => {
      const fam = toolFamily(t.name);
      const gov = governanceOfTool(t.name, t.risk, t.readOnly);
      const tags = [...(fam ? (FAMILY_TAGS[fam] ?? []) : []), ...t.name.split('.')];
      return {
        id: `${this.id}:${t.name}`,
        name: t.name,
        type: this.kind === 'tool' && fam ? (FAMILY_TYPE[fam] ?? 'tool') : this.kind,
        description: t.description.slice(0, 240),
        risk: riskOf(t.risk, t.readOnly, t.name),
        tags,
        supportedTaskTypes: fam ? (TASKS_BY_FAMILY[fam] ?? []) : [],
        inputSchema: t.parameters ?? null,
        governance: gov,
        securityPolicy: gov.approvalRequired
          ? 'approbation explicite avant exécution'
          : 'lecture seule / sans effet externe',
      };
    });
  }
  describe(id: string): CapabilityDescriptor | null {
    return (this.discover() as CapabilityDescriptor[]).find((d) => d.id === id) ?? null;
  }
  health(): AdapterHealth {
    const n = this.tools().length;
    return {
      status: n ? 'AVAILABLE' : 'UNAVAILABLE',
      detail: `${n} outil(s) chargé(s)`,
      checkedAt: Date.now(),
    };
  }
  permissions(id: string): CapabilityGovernance {
    const d = this.describe(id);
    return (
      (d?.governance as CapabilityGovernance | undefined) ?? {
        permissions: [],
        scope: 'local',
        approvalRequired: true,
        dataAccess: false,
        writeAccess: false,
        networkAccess: false,
      }
    );
  }
  async execute(
    id: string,
    input: Record<string, unknown>,
    ctx?: { approved?: boolean },
  ): Promise<ExecResult> {
    const d = this.describe(id);
    if (!d) return { ok: false, error: 'capacité inconnue' };
    if (this.permissions(id).approvalRequired && !ctx?.approved)
      return { ok: true, pendingApproval: true, output: { prepared: { id, input } } };
    if (!this.run)
      return { ok: false, error: 'exécution déléguée à la boucle d’agent (aucun exécuteur direct)' };
    return this.run(d.name, input);
  }
  estimateCost(): number | null {
    return 0;
  }
  estimateLatency(): number | null {
    return null;
  }
}

/** Static list adapter (skills, evaluators, models, MCP tools…): the owner supplies descriptors. */
export class ListAdapter implements CapabilityAdapter {
  readonly id: string;
  constructor(
    id: string,
    readonly provider: string,
    private readonly list: () => CapabilityDescriptor[],
    private readonly healthFn?: () => AdapterHealth,
  ) {
    this.id = id;
  }
  discover() {
    return this.list();
  }
  describe(id: string) {
    return this.list().find((d) => d.id === id) ?? null;
  }
  health(): AdapterHealth {
    return (
      this.healthFn?.() ?? {
        status: this.list().length ? 'AVAILABLE' : 'UNAVAILABLE',
        detail: `${this.list().length} élément(s)`,
        checkedAt: Date.now(),
      }
    );
  }
  permissions(id: string): CapabilityGovernance {
    const g = this.describe(id)?.governance;
    return {
      permissions: g?.permissions ?? ['read'],
      scope: g?.scope ?? 'local',
      approvalRequired: g?.approvalRequired ?? false,
      dataAccess: g?.dataAccess ?? false,
      writeAccess: g?.writeAccess ?? false,
      networkAccess: g?.networkAccess ?? false,
    };
  }
  async execute(): Promise<ExecResult> {
    return { ok: false, error: 'exécution déléguée à la boucle d’agent' };
  }
  estimateCost(id: string) {
    return this.describe(id)?.cost ?? null;
  }
  estimateLatency(id: string) {
    return this.describe(id)?.latency ?? null;
  }
}

// ───────────────────────── GitHub capability adapter ─────────────────────────

export interface GithubHttpLike {
  /** GET a JSON API path (e.g. /search/repositories?q=…). Returns null on 404. */
  json(path: string): Promise<unknown>;
  hasToken(): boolean;
}

const GH_READ: CapabilityDescriptor[] = [
  {
    id: 'github:search_repositories',
    name: 'github.search_repositories',
    type: 'github',
    description: 'Recherche de dépôts publics (stars, langage, activité).',
    tags: ['github', 'search', 'repositories', 'libraries', 'solutions'],
    supportedTaskTypes: ['code', 'research'],
    risk: 'low',
  },
  {
    id: 'github:search_code',
    name: 'github.search_code',
    type: 'github',
    description: 'Recherche de code (nécessite un jeton GitHub).',
    tags: ['github', 'search', 'code', 'patterns', 'examples'],
    supportedTaskTypes: ['code'],
    risk: 'low',
  },
  {
    id: 'github:get_file',
    name: 'github.get_file',
    type: 'github',
    description: 'Lecture d’un fichier ou de la documentation d’un dépôt.',
    tags: ['github', 'files', 'documentation', 'readme'],
    supportedTaskTypes: ['code', 'research', 'document'],
    risk: 'low',
  },
  {
    id: 'github:list_issues',
    name: 'github.list_issues',
    type: 'github',
    description: 'Analyse des issues d’un dépôt.',
    tags: ['github', 'issues'],
    supportedTaskTypes: ['code', 'research'],
    risk: 'low',
  },
  {
    id: 'github:list_pulls',
    name: 'github.list_pulls',
    type: 'github',
    description: 'Analyse des pull requests d’un dépôt.',
    tags: ['github', 'pull-requests', 'review'],
    supportedTaskTypes: ['code', 'review'],
    risk: 'low',
  },
  {
    id: 'github:compare',
    name: 'github.compare',
    type: 'github',
    description: 'Comparaison de deux versions (tags / commits).',
    tags: ['github', 'compare', 'versions'],
    supportedTaskTypes: ['code', 'review'],
    risk: 'low',
  },
];
const GH_WRITE: CapabilityDescriptor[] = [
  {
    id: 'github:create_or_update_file',
    name: 'github.create_or_update_file',
    type: 'github',
    description:
      'Création / modification de fichier : préparée seulement, jamais exécutée sans approbation explicite.',
    tags: ['github', 'write'],
    supportedTaskTypes: ['code'],
    risk: 'destructive',
  },
  {
    id: 'github:create_pull_request',
    name: 'github.create_pull_request',
    type: 'github',
    description: 'Création de pull request : préparée seulement, jamais exécutée sans approbation explicite.',
    tags: ['github', 'write', 'pull-requests'],
    supportedTaskTypes: ['code'],
    risk: 'destructive',
  },
];

/**
 * GitHub capability layer. Status is real, from a live health check:
 *  CONNECTED (reported as AVAILABLE) = API reachable AND a token is present;
 *  PARTIAL = API reachable without token (public read-only, 60 req/h, no code search);
 *  UNAVAILABLE = API not reachable. Writes are never executed here: they are prepared and wait
 *  for an explicit approval, and need a token. The token never enters a prompt, a log or a trace.
 */
export class GitHubCapabilityAdapter implements CapabilityAdapter {
  readonly id = 'github';
  readonly provider = 'GitHub';
  private last: AdapterHealth | null = null;
  constructor(private readonly http: GithubHttpLike) {}
  discover(): CapabilityDescriptor[] {
    const st = this.last?.status ?? 'UNAVAILABLE';
    const detail = this.last?.detail ?? 'état non vérifié : lancez la vérification de santé';
    const hasToken = this.http.hasToken();
    return [...GH_READ, ...GH_WRITE].map((d) => {
      const write = GH_WRITE.includes(d);
      const needsToken = write || d.id === 'github:search_code';
      const status: CapStatus =
        st === 'UNAVAILABLE' ? 'UNAVAILABLE' : needsToken && !hasToken ? 'UNAVAILABLE' : st;
      return {
        ...d,
        governance: {
          permissions: write ? ['write', 'network', 'publish'] : ['read', 'network'],
          scope: 'external',
          approvalRequired: write,
          dataAccess: true,
          writeAccess: write,
          networkAccess: true,
        },
        securityPolicy: write
          ? 'préparation seule ; exécution après approbation explicite ; jamais de jeton dans le contexte'
          : 'lecture ; jeton jamais transmis au modèle',
        statusOverride: {
          status,
          detail: needsToken && !hasToken ? `${detail} — jeton GitHub requis` : detail,
        },
      };
    });
  }
  describe(id: string) {
    return this.discover().find((d) => d.id === id) ?? null;
  }
  async health(): Promise<AdapterHealth> {
    try {
      const r = (await this.http.json('/rate_limit')) as {
        resources?: { core?: { remaining: number; limit: number } };
      } | null;
      const core = r?.resources?.core;
      const hasToken = this.http.hasToken();
      this.last = {
        status: hasToken ? 'AVAILABLE' : 'PARTIAL',
        detail: `${hasToken ? 'CONNECTED (jeton présent)' : 'PARTIAL : lecture publique sans jeton'}${core ? ` · ${core.remaining}/${core.limit} requêtes restantes` : ''}`,
        checkedAt: Date.now(),
      };
    } catch (e) {
      this.last = {
        status: 'UNAVAILABLE',
        detail: `API injoignable : ${(e as Error).message.slice(0, 120)}`,
        checkedAt: Date.now(),
      };
    }
    return this.last;
  }
  permissions(id: string): CapabilityGovernance {
    return (
      (this.describe(id)?.governance as CapabilityGovernance | undefined) ?? {
        permissions: ['read'],
        scope: 'external',
        approvalRequired: false,
        dataAccess: true,
        writeAccess: false,
        networkAccess: true,
      }
    );
  }
  async execute(
    id: string,
    input: Record<string, unknown>,
    ctx?: { approved?: boolean },
  ): Promise<ExecResult> {
    const d = this.describe(id);
    if (!d) return { ok: false, error: 'capacité GitHub inconnue' };
    if (d.statusOverride?.status === 'UNAVAILABLE')
      return { ok: false, error: d.statusOverride.detail ?? 'indisponible' };
    const q = encodeURIComponent(String(input.query ?? ''));
    const repo = String(input.repo ?? '');
    try {
      switch (id) {
        case 'github:search_repositories':
          return {
            ok: true,
            output: await this.http.json(
              `/search/repositories?q=${q}&per_page=${Math.min(10, Number(input.limit) || 5)}`,
            ),
          };
        case 'github:search_code':
          return { ok: true, output: await this.http.json(`/search/code?q=${q}&per_page=5`) };
        case 'github:get_file':
          return {
            ok: true,
            output: await this.http.json(`/repos/${repo}/contents/${String(input.path ?? '')}`),
          };
        case 'github:list_issues':
          return { ok: true, output: await this.http.json(`/repos/${repo}/issues?per_page=10`) };
        case 'github:list_pulls':
          return { ok: true, output: await this.http.json(`/repos/${repo}/pulls?per_page=10`) };
        case 'github:compare':
          return {
            ok: true,
            output: await this.http.json(
              `/repos/${repo}/compare/${String(input.base ?? '')}...${String(input.head ?? '')}`,
            ),
          };
        default:
          // Writes: never executed silently.
          if (!ctx?.approved) return { ok: true, pendingApproval: true, output: { prepared: { id, input } } };
          return {
            ok: false,
            error: 'écriture GitHub non connectée dans cette édition : action préparée, non exécutée',
          };
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message.replace(/(token|bearer)\s+\S+/gi, '$1 ***') };
    }
  }
  estimateCost() {
    return 0;
  }
  estimateLatency() {
    return 600;
  }
}

// ───────────────────────── the registry ─────────────────────────

export interface CapStats {
  samples: number;
  successRate: number | null;
  failureRate: number | null;
  averageLatency: number | null;
  averageCost: number | null;
  lastUsed: number | null;
  usedBy: string[];
}

export class CapabilityRegistry {
  private adapters = new Map<string, CapabilityAdapter>();
  private caps = new Map<string, Capability>();
  private health = new Map<string, AdapterHealth>();
  private stats = new Map<string, CapStats>();

  register(a: CapabilityAdapter): void {
    this.adapters.set(a.id, a);
  }
  unregister(id: string): void {
    this.adapters.delete(id);
    for (const [k, c] of this.caps) if (c.provenance.startsWith(`${id}`)) this.caps.delete(k);
  }
  adaptersList(): CapabilityAdapter[] {
    return [...this.adapters.values()];
  }
  healthOf(id: string): AdapterHealth | undefined {
    return this.health.get(id);
  }
  /** Overlay of measured statistics (from the experience memory). */
  setStats(stats: Map<string, CapStats>): void {
    this.stats = stats;
    for (const [k, c] of this.caps) this.caps.set(k, this.withStats(c));
  }
  private withStats(c: Capability): Capability {
    const s = this.stats.get(c.name) ?? this.stats.get(c.id);
    if (!s || !s.samples)
      return { ...c, reliability: null, successRate: null, failureRate: null, samples: 0, usedBy: [] };
    return {
      ...c,
      samples: s.samples,
      successRate: s.successRate,
      failureRate: s.failureRate,
      reliability: s.successRate,
      averageLatency: s.averageLatency,
      averageCost: s.averageCost,
      latency: c.latency ?? s.averageLatency,
      lastUsed: s.lastUsed,
      usedBy: s.usedBy,
    };
  }
  /** Discovers every adapter (and checks its health): new capabilities appear without touching other code. */
  async refresh(checkHealth = true): Promise<void> {
    const next = new Map<string, Capability>();
    for (const a of this.adapters.values()) {
      let h: AdapterHealth | null = null;
      if (checkHealth) {
        try {
          h = await a.health();
        } catch (e) {
          h = {
            status: 'UNAVAILABLE',
            detail: `health() a échoué : ${(e as Error).message.slice(0, 100)}`,
            checkedAt: Date.now(),
          };
        }
        this.health.set(a.id, h);
      }
      const descs: CapabilityDescriptor[] = await Promise.resolve(a.discover()).catch(() => []);
      const hs = h ?? this.health.get(a.id);
      for (const d of descs) {
        const gov = a.permissions(d.id);
        const status: CapStatus = d.statusOverride?.status ?? hs?.status ?? 'AVAILABLE';
        next.set(
          d.id,
          this.withStats({
            id: d.id,
            name: d.name,
            type: d.type,
            description: d.description,
            provider: a.provider,
            version: d.version ?? '1',
            status,
            statusDetail: d.statusOverride?.detail ?? hs?.detail,
            risk: d.risk ?? 'low',
            cost: d.cost ?? a.estimateCost(d.id) ?? null,
            latency: d.latency ?? a.estimateLatency(d.id) ?? null,
            supportedTaskTypes: d.supportedTaskTypes ?? [],
            requiredSkills: d.requiredSkills ?? [],
            inputSchema: d.inputSchema ?? null,
            outputSchema: d.outputSchema ?? null,
            reliability: null,
            lastUsed: null,
            successRate: null,
            failureRate: null,
            averageLatency: null,
            averageCost: null,
            samples: 0,
            securityPolicy: d.securityPolicy ?? (gov.approvalRequired ? 'approbation requise' : 'standard'),
            provenance: `${a.id}`,
            tags: [...new Set((d.tags ?? []).map((t) => t.toLowerCase()))],
            usedBy: [],
            ...gov,
          }),
        );
      }
    }
    this.caps = next;
  }
  list(filter?: { types?: CapabilityType[]; status?: CapStatus[]; text?: string }): Capability[] {
    let out = [...this.caps.values()];
    if (filter?.types?.length) out = out.filter((c) => filter.types!.includes(c.type));
    if (filter?.status?.length) out = out.filter((c) => filter.status!.includes(c.status));
    if (filter?.text) {
      const t = filter.text.toLowerCase();
      out = out.filter((c) => `${c.name} ${c.description} ${c.tags.join(' ')}`.toLowerCase().includes(t));
    }
    return out;
  }
  get(id: string): Capability | undefined {
    return this.caps.get(id);
  }
  byName(name: string): Capability | undefined {
    return [...this.caps.values()].find((c) => c.name === name);
  }
  get size(): number {
    return this.caps.size;
  }
}

// ───────────────────────── requirements & selection ─────────────────────────

/** Capability needs implied by a request (deterministic, from the task type and the wording). */
const NEED_RULES: [RegExp, string[]][] = [
  [/\b(excel|xlsx?|classeur|tableur|feuille|csv)\b/i, ['spreadsheet', 'filereader', 'data', 'statistics']],
  [
    /\b(anomal|[ée]cart|statisti|moyenne|m[ée]diane|[ée]cart-type|corr[ée]lation|total|somme|taux|ratio|pourcentage)\b/i,
    ['statistics', 'data'],
  ],
  [/\b(ifrs ?9|provision|ecl|npl|cr[ée]dit|portefeuille)\b/i, ['data', 'statistics', 'evaluator']],
  [/\b(lis|lire|ouvre|fichier|dossier|document|contrat|pdf)\b/i, ['filereader']],
  [
    /\b(cr[ée]e|[ée]cris|enregistre|sauvegarde|modifie) (un |le |la |les )?(fichier|document|rapport|note)/i,
    ['filewriter'],
  ],
  [/\b(web|internet|recherche|sources?|actualit[ée]|derni[èe]res?)\b/i, ['web', 'research']],
  [/\b(navigateur|site|page web|clique|formulaire|url|http)\b/i, ['browser']],
  [/\b(github|d[ée]p[ôo]t|repo(sitory)?|pull request|issue|biblioth[èe]que open)\b/i, ['github']],
  [/\b(code|fonction|script|programme|algorithme|d[ée]bug|bug|refactor|test)\b/i, ['code', 'compute']],
  [/\b(ex[ée]cute|lance|terminal|commande|node|python)\b/i, ['code', 'terminal']],
  [/\b(image|logo|illustration|diagramme|sch[ée]ma|3d)\b/i, ['image', 'visual']],
  [/\b(rapport|export|word|powerpoint|pdf|dashboard|tableau de bord)\b/i, ['document', 'report', 'export']],
  [/\b(plan|[ée]tapes|feuille de route)\b/i, ['plan']],
  [/\b(m[ée]t[ée]o|jours? f[ée]ri[ée]s?|crypto|bitcoin)\b/i, ['geo']],
  [/\b(taux de change|devise|xof|fcfa|inflation|pib)\b/i, ['finance', 'rates']],
];
const TYPE_NEEDS: Record<string, string[]> = {
  chat: [],
  writing: ['document'],
  data: ['data', 'filereader'],
  code: ['code', 'filereader', 'filewriter'],
  research: ['web', 'research'],
  browser: ['browser'],
  document: ['filereader', 'document'],
  review: ['code', 'filereader'],
  vision: ['filereader'],
};

export interface Requirements {
  taskType: string;
  needs: string[];
  /** Tags that are explicitly NOT needed (listed for the explanation). */
  notNeeded: string[];
}
const ALL_AREAS = [
  'browser',
  'github',
  'image',
  'terminal',
  'web',
  'geo',
  'finance',
  'filewriter',
  'document',
];

export function requirementsOf(taskType: string, text: string, hasAttachments = false): Requirements {
  const needs = new Set<string>(TYPE_NEEDS[taskType] ?? []);
  for (const [rx, tags] of NEED_RULES) if (rx.test(text)) for (const t of tags) needs.add(t);
  if (hasAttachments) needs.add('filereader');
  const notNeeded = ALL_AREAS.filter((a) => !needs.has(a));
  return { taskType, needs: [...needs], notNeeded };
}

export interface Selection {
  requirements: Requirements;
  selected: { cap: Capability; score: number; why: string }[];
  rejected: { cap: Capability; why: string }[];
  /** Candidates examined / exposed — the context is never loaded with the whole registry. */
  examined: number;
  exposed: number;
}

export interface SelectOptions {
  /** Maximum capabilities exposed to the model. */
  max?: number;
  /** Types eligible for the toolset (models / skills are not tools). */
  types?: CapabilityType[];
  /** Capability names always kept (meta tools). */
  alwaysInclude?: string[];
  /** Names the V5 tool pack already allowed: selection stays a subset of what the agent may use. */
  allowed?: Set<string>;
  /** Names a policy found useless for this task type. */
  excluded?: Set<string>;
  readOnlyTask?: boolean;
  /** Minimum relevance for a capability to be exposed. */
  minScore?: number;
}

const NON_TOOL_TYPES: CapabilityType[] = ['model', 'skill', 'agent', 'evaluator'];

export function selectCapabilities(
  reg: CapabilityRegistry,
  req: Requirements,
  o: SelectOptions = {},
): Selection {
  const max = o.max ?? 8;
  const minScore = o.minScore ?? 1.5;
  const all = reg
    .list()
    .filter((c) => (o.types ? o.types.includes(c.type) : !NON_TOOL_TYPES.includes(c.type)));
  const needSet = new Set(req.needs);
  const scored = all.map((c) => {
    let score = 0;
    const hit = c.tags.filter((t) => needSet.has(t));
    score += hit.length * 1.6;
    if (c.supportedTaskTypes.includes(req.taskType)) score += 0.8;
    // measured reliability only when there is a sample; unknown = neutral
    if (c.samples >= 5 && c.successRate !== null) score += (c.successRate - 0.8) * 2;
    if (c.status === 'UNAVAILABLE' || c.status === 'SIMULATED_TEST_ONLY') score = -99;
    if (c.risk === 'destructive' && o.readOnlyTask) score -= 3;
    if (o.excluded?.has(c.name)) score = -99;
    if (o.allowed && !o.allowed.has(c.name)) score = -99;
    return { c, score, hit };
  });
  const keep = new Set(o.alwaysInclude ?? []);
  const ranked = scored
    .filter((x) => x.score >= minScore || keep.has(x.c.name))
    .sort((a, b) => b.score - a.score);
  const selected: Selection['selected'] = [];
  for (const x of ranked) {
    if (selected.length >= max && !keep.has(x.c.name)) continue;
    selected.push({
      cap: x.c,
      score: Math.round(x.score * 100) / 100,
      why:
        keep.has(x.c.name) && x.score < minScore
          ? 'outil méta toujours exposé'
          : `besoins couverts : ${x.hit.join(', ') || 'type de tâche'}`,
    });
  }
  const sel = new Set(selected.map((s) => s.cap.id));
  const rejected = scored
    .filter((x) => !sel.has(x.c.id))
    .map((x) => ({
      cap: x.c,
      why:
        x.c.status === 'UNAVAILABLE'
          ? `indisponible (${x.c.statusDetail ?? 'connecteur absent'})`
          : o.excluded?.has(x.c.name)
            ? 'jugé inutile pour ce type de tâche par une politique apprise'
            : o.allowed && !o.allowed.has(x.c.name)
              ? 'non autorisé pour cet agent / ce mode'
              : x.score < minScore
                ? `non requis (pertinence ${x.score.toFixed(1)} < ${minScore})`
                : 'au-delà du nombre maximal exposé',
    }));
  return { requirements: req, selected, rejected, examined: all.length, exposed: selected.length };
}

/** Explanation lines (needed / useless) for the trace. */
export function explainSelection(s: Selection): string[] {
  const names = (xs: { cap: Capability }[]) => xs.map((x) => x.cap.name);
  const usefulAreas = s.requirements.needs.join(', ') || 'aucun besoin spécifique (réponse directe)';
  const hiddenAreas = s.requirements.notNeeded.join(', ');
  return [
    `Besoins déduits : ${usefulAreas}.`,
    `${s.exposed} capacité(s) exposée(s) sur ${s.examined} examinée(s) : ${names(s.selected).slice(0, 12).join(', ') || 'aucune'}.`,
    hiddenAreas ? `Jugé(s) inutile(s) : ${hiddenAreas}.` : '',
  ].filter(Boolean);
}
