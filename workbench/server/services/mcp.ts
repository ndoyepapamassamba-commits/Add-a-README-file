import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { z } from 'zod';
import { httpFetch } from '../llm/http';
import { registerSecret, scrubbedEnv } from '../security/redact';
import { BadRequestError, NotFoundError } from './workspace';

export const McpServerSchema = z.object({
  type: z.enum(['stdio', 'http', 'sse']).optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true),
  /** true = never ask before calling this server's tools; array = only these tools. */
  autoApprove: z.union([z.boolean(), z.array(z.string())]).optional(),
  description: z.string().optional(),
  preset: z.string().optional(),
});
export type McpServerConfig = z.infer<typeof McpServerSchema>;

export interface McpTool {
  server: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  destructive: boolean;
}

export type McpStatus = 'disabled' | 'disconnected' | 'connecting' | 'connected' | 'needs_auth' | 'error';

interface Live {
  config: McpServerConfig;
  status: McpStatus;
  error?: string;
  client?: Client;
  transport?: StreamableHTTPClientTransport | SSEClientTransport | StdioClientTransport;
  tools: McpTool[];
  instructions?: string;
  serverName?: string;
  authUrl?: string;
  connecting?: Promise<void>;
}

export interface McpPreset {
  id: string;
  name: string;
  category: 'Création' | 'Gratuit' | 'Productivité' | 'Développement';
  description: string;
  config: McpServerConfig;
  requires?: string;
  free: boolean;
}

/** Curated, verified presets. Hosted servers with OAuth open an authorisation page on first connect. */
export const MCP_PRESETS: McpPreset[] = [
  {
    id: 'blender',
    name: 'Blender',
    category: 'Création',
    description:
      'Pilote Blender (scènes 3D, objets, matériaux, rendu, assets Poly Haven/Sketchfab, scripts Python).',
    config: { command: 'uvx', args: ['blender-mcp'], enabled: true, preset: 'blender' },
    requires:
      "Blender ouvert avec l'add-on « Blender MCP » activé (addon.py du projet ahujasid/blender-mcp) et uv installé.",
    free: true,
  },
  {
    id: 'canva',
    name: 'Canva',
    category: 'Création',
    description:
      'Crée et modifie des designs Canva, recherche dans vos designs, exporte (compte Canva, autorisation OAuth).',
    config: { type: 'http', url: 'https://mcp.canva.com/mcp', enabled: true, preset: 'canva' },
    requires: 'Compte Canva : une page d’autorisation s’ouvre à la première connexion.',
    free: false,
  },
  {
    id: 'figma',
    name: 'Figma (Dev Mode local)',
    category: 'Création',
    description:
      "Lit les maquettes Figma sélectionnées (code, variables, captures) via l'application de bureau.",
    config: { type: 'http', url: 'http://127.0.0.1:3845/mcp', enabled: true, preset: 'figma' },
    requires: 'Application Figma de bureau, Dev Mode → « Enable desktop MCP server ».',
    free: false,
  },
  {
    id: 'context7',
    name: 'Context7 (docs à jour)',
    category: 'Gratuit',
    description:
      'Documentation officielle et exemples à jour de milliers de bibliothèques (évite le code obsolète).',
    config: { type: 'http', url: 'https://mcp.context7.com/mcp', enabled: true, preset: 'context7' },
    free: true,
  },
  {
    id: 'deepwiki',
    name: 'DeepWiki',
    category: 'Gratuit',
    description: 'Questions sur n’importe quel dépôt GitHub public (architecture, API, explications).',
    config: { type: 'http', url: 'https://mcp.deepwiki.com/mcp', enabled: true, preset: 'deepwiki' },
    free: true,
  },
  {
    id: 'fetch',
    name: 'Fetch',
    category: 'Gratuit',
    description: 'Récupère des pages web et les convertit en Markdown.',
    config: { command: 'uvx', args: ['mcp-server-fetch'], enabled: true, preset: 'fetch' },
    requires: 'uv (uvx)',
    free: true,
  },
  {
    id: 'time',
    name: 'Time',
    category: 'Gratuit',
    description: 'Heure courante et conversions de fuseaux horaires.',
    config: { command: 'uvx', args: ['mcp-server-time'], enabled: true, preset: 'time' },
    requires: 'uv (uvx)',
    free: true,
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo Search',
    category: 'Gratuit',
    description: 'Recherche web gratuite sans clé API.',
    config: { command: 'uvx', args: ['duckduckgo-mcp-server'], enabled: true, preset: 'duckduckgo' },
    requires: 'uv (uvx)',
    free: true,
  },
  {
    id: 'memory',
    name: 'Memory (graphe de connaissances)',
    category: 'Gratuit',
    description: 'Mémoire persistante sous forme de graphe (entités, relations, observations).',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
      enabled: true,
      preset: 'memory',
    },
    free: true,
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    category: 'Gratuit',
    description: 'Outil de réflexion structurée étape par étape pour les problèmes complexes.',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
      enabled: true,
      preset: 'sequential-thinking',
    },
    free: true,
  },
  {
    id: 'playwright',
    name: 'Playwright MCP',
    category: 'Développement',
    description: 'Automatisation navigateur par arbre d’accessibilité (complète le navigateur intégré).',
    config: {
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--headless'],
      enabled: true,
      preset: 'playwright',
    },
    free: true,
  },
  {
    id: 'git',
    name: 'Git (MCP)',
    category: 'Développement',
    description: 'Opérations git avancées (log, show, branches) sur un dépôt local.',
    config: { command: 'uvx', args: ['mcp-server-git'], enabled: true, preset: 'git' },
    requires: 'uv (uvx)',
    free: true,
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'Productivité',
    description: 'Recherche, lecture et création de pages et bases Notion (OAuth).',
    config: { type: 'http', url: 'https://mcp.notion.com/mcp', enabled: true, preset: 'notion' },
    free: false,
  },
  {
    id: 'linear',
    name: 'Linear',
    category: 'Productivité',
    description: 'Tickets, projets et cycles Linear (OAuth).',
    config: { type: 'http', url: 'https://mcp.linear.app/mcp', enabled: true, preset: 'linear' },
    free: false,
  },
];

const safeName = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);

/** OAuth (authorization code + PKCE, dynamic client registration) persisted per server. */
class FileOAuthProvider implements OAuthClientProvider {
  constructor(
    private readonly file: string,
    private readonly redirect: string,
    private readonly onRedirect: (url: URL) => void,
  ) {}
  private read(): { client?: OAuthClientInformationMixed; tokens?: OAuthTokens; verifier?: string } {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as {
        client?: OAuthClientInformationMixed;
        tokens?: OAuthTokens;
        verifier?: string;
      };
    } catch {
      return {};
    }
  }
  private write(patch: Record<string, unknown>): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ ...this.read(), ...patch }), { mode: 0o600 });
  }
  get redirectUrl(): string {
    return this.redirect;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'MASSAMBA Workbench',
      redirect_uris: [this.redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }
  clientInformation() {
    return this.read().client;
  }
  saveClientInformation(info: OAuthClientInformationMixed) {
    this.write({ client: info });
  }
  tokens() {
    const t = this.read().tokens;
    if (t?.access_token) registerSecret(t.access_token);
    return t;
  }
  saveTokens(tokens: OAuthTokens) {
    registerSecret(tokens.access_token);
    if (tokens.refresh_token) registerSecret(tokens.refresh_token);
    this.write({ tokens });
  }
  redirectToAuthorization(url: URL) {
    this.onRedirect(url);
  }
  saveCodeVerifier(v: string) {
    this.write({ verifier: v });
  }
  codeVerifier() {
    return this.read().verifier ?? '';
  }
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    const cur = this.read();
    if (scope === 'all') this.write({ client: undefined, tokens: undefined, verifier: undefined });
    else if (scope === 'tokens') this.write({ ...cur, tokens: undefined });
    else if (scope === 'client') this.write({ ...cur, client: undefined });
  }
}

/**
 * MCP client manager: Claude-Desktop-compatible config (data/mcp.json),
 * stdio / streamable HTTP / SSE transports, OAuth for hosted servers, tool
 * discovery and calls. Every enabled server's tools are exposed to agents.
 */
export class McpManager extends EventEmitter {
  private live = new Map<string, Live>();
  private readonly file: string;
  private readonly authDir: string;

  constructor(private readonly opts: { dataDir: string; callbackBase: () => string; cwd: string }) {
    super();
    this.file = path.join(opts.dataDir, 'mcp.json');
    this.authDir = path.join(opts.dataDir, 'mcp-auth');
    for (const [name, config] of Object.entries(this.readConfig()))
      this.live.set(name, { config, status: config.enabled ? 'disconnected' : 'disabled', tools: [] });
  }

  private readConfig(): Record<string, McpServerConfig> {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { mcpServers?: Record<string, unknown> };
      const out: Record<string, McpServerConfig> = {};
      for (const [name, cfg] of Object.entries(raw.mcpServers ?? {})) {
        const parsed = McpServerSchema.safeParse(cfg);
        if (parsed.success) {
          out[name] = parsed.data;
          for (const v of [
            ...Object.values(parsed.data.env ?? {}),
            ...Object.values(parsed.data.headers ?? {}),
          ])
            registerSecret(v);
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  private async persist(): Promise<void> {
    const mcpServers = Object.fromEntries([...this.live.entries()].map(([n, l]) => [n, l.config]));
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    await fsp.writeFile(this.file, JSON.stringify({ mcpServers }, null, 2), { mode: 0o600 });
  }

  list() {
    return [...this.live.entries()].map(([name, l]) => ({
      name,
      status: l.status,
      error: l.error,
      authUrl: l.status === 'needs_auth' ? l.authUrl : undefined,
      serverName: l.serverName,
      instructions: l.instructions?.slice(0, 2000),
      toolCount: l.tools.length,
      tools: l.tools.map((t) => ({
        name: t.name,
        description: t.description.slice(0, 300),
        readOnly: t.readOnly,
        destructive: t.destructive,
      })),
      config: {
        ...l.config,
        env: l.config.env ? Object.fromEntries(Object.keys(l.config.env).map((k) => [k, '••••'])) : undefined,
        headers: l.config.headers
          ? Object.fromEntries(Object.keys(l.config.headers).map((k) => [k, '••••']))
          : undefined,
      },
    }));
  }

  get(name: string): Live {
    const l = this.live.get(name);
    if (!l) throw new NotFoundError(`MCP server not found: ${name}`);
    return l;
  }

  async upsert(name: string, config: McpServerConfig, keepSecrets = true): Promise<void> {
    if (!/^[\w.-]{1,40}$/.test(name))
      throw new BadRequestError('Nom de serveur invalide (lettres, chiffres, - _ .)');
    if (!config.command && !config.url)
      throw new BadRequestError('Indiquez une commande (stdio) ou une URL (HTTP)');
    const prev = this.live.get(name);
    if (prev && keepSecrets) {
      // Masked values coming back from the UI keep their stored secret.
      for (const key of ['env', 'headers'] as const) {
        const next = config[key];
        if (next)
          for (const [k, v] of Object.entries(next))
            if (v === '••••' && prev.config[key]?.[k]) next[k] = prev.config[key]![k]!;
      }
    }
    for (const v of [...Object.values(config.env ?? {}), ...Object.values(config.headers ?? {})])
      registerSecret(v);
    await this.disconnect(name).catch(() => undefined);
    this.live.set(name, { config, status: config.enabled ? 'disconnected' : 'disabled', tools: [] });
    await this.persist();
    this.emit('change');
  }

  async remove(name: string): Promise<void> {
    await this.disconnect(name).catch(() => undefined);
    this.live.delete(name);
    await fsp.rm(path.join(this.authDir, `${safeName(name)}.json`), { force: true });
    await this.persist();
    this.emit('change');
  }

  async setEnabled(name: string, enabled: boolean): Promise<void> {
    const l = this.get(name);
    l.config.enabled = enabled;
    await this.persist();
    if (!enabled) {
      await this.disconnect(name);
      l.status = 'disabled';
    } else l.status = 'disconnected';
    this.emit('change');
  }

  async connect(name: string): Promise<void> {
    const l = this.get(name);
    if (!l.config.enabled) throw new BadRequestError('Serveur désactivé');
    if (l.connecting) return l.connecting;
    l.connecting = (async () => {
      l.status = 'connecting';
      l.error = undefined;
      this.emit('change');
      try {
        const client = new Client(
          { name: 'openrouter-ai-workbench', version: '1.0.0' },
          { capabilities: {} },
        );
        const cfg = l.config;
        const type = cfg.type ?? (cfg.url ? 'http' : 'stdio');
        if (type === 'stdio') {
          const transport = new StdioClientTransport({
            command: cfg.command!,
            args: cfg.args ?? [],
            env: { ...(scrubbedEnv() as Record<string, string>), ...(cfg.env ?? {}) },
            cwd: this.opts.cwd,
            stderr: 'pipe',
          });
          let stderr = '';
          transport.stderr?.on('data', (d: Buffer) => {
            stderr = (stderr + d.toString('utf8')).slice(-4000);
          });
          l.transport = transport;
          try {
            await withTimeout(
              client.connect(transport),
              120_000,
              'Délai dépassé au démarrage du serveur MCP',
            );
          } catch (err) {
            throw new Error(
              `${(err as Error).message}${stderr ? `\n${stderr.trim().split('\n').slice(-6).join('\n')}` : ''}`,
              { cause: err },
            );
          }
        } else {
          const url = new URL(cfg.url!);
          const provider = new FileOAuthProvider(
            path.join(this.authDir, `${safeName(name)}.json`),
            `${this.opts.callbackBase()}/api/mcp/oauth/callback?server=${encodeURIComponent(name)}`,
            (authUrl) => {
              l.authUrl = authUrl.toString();
            },
          );
          const fetchLike = ((input: string | URL, init?: RequestInit) =>
            httpFetch(String(input), init as Parameters<typeof httpFetch>[1])) as unknown as typeof fetch;
          const requestInit = cfg.headers ? { headers: cfg.headers } : undefined;
          const transport =
            type === 'sse'
              ? new SSEClientTransport(url, { authProvider: provider, requestInit, fetch: fetchLike })
              : new StreamableHTTPClientTransport(url, {
                  authProvider: provider,
                  requestInit,
                  fetch: fetchLike,
                });
          l.transport = transport;
          try {
            await withTimeout(client.connect(transport), 60_000, 'Délai dépassé');
          } catch (err) {
            if (l.authUrl || /unauthori[sz]ed|401/i.test((err as Error).message)) {
              l.status = 'needs_auth';
              l.error = l.authUrl ? 'Autorisation requise' : (err as Error).message;
              this.emit('change');
              return;
            }
            throw err;
          }
        }
        l.client = client;
        l.instructions = client.getInstructions();
        l.serverName = client.getServerVersion()?.name;
        const tools: McpTool[] = [];
        let cursor: string | undefined;
        do {
          const page = await client.listTools(cursor ? { cursor } : undefined);
          for (const t of page.tools) {
            tools.push({
              server: name,
              name: t.name,
              description: t.description ?? '',
              inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
              readOnly: t.annotations?.readOnlyHint === true,
              destructive: t.annotations?.destructiveHint === true,
            });
          }
          cursor = page.nextCursor;
        } while (cursor && tools.length < 500);
        l.tools = tools;
        l.status = 'connected';
        l.authUrl = undefined;
        client.onclose = () => {
          if (l.client === client) {
            l.client = undefined;
            l.status = l.config.enabled ? 'disconnected' : 'disabled';
            this.emit('change');
          }
        };
      } catch (err) {
        l.status = 'error';
        l.error = (err as Error).message.slice(0, 1500);
        await l.transport?.close().catch(() => undefined);
        l.transport = undefined;
      } finally {
        l.connecting = undefined;
        this.emit('change');
      }
    })();
    return l.connecting;
  }

  async finishAuth(name: string, code: string): Promise<void> {
    const l = this.get(name);
    const t = l.transport;
    if (!(t instanceof StreamableHTTPClientTransport) && !(t instanceof SSEClientTransport))
      throw new BadRequestError('No pending authorisation');
    await t.finishAuth(code);
    l.transport = undefined;
    l.authUrl = undefined;
    l.status = 'disconnected';
    await this.connect(name);
  }

  async disconnect(name: string): Promise<void> {
    const l = this.live.get(name);
    if (!l) return;
    const c = l.client;
    l.client = undefined;
    l.tools = [];
    await c?.close().catch(() => undefined);
    await l.transport?.close().catch(() => undefined);
    l.transport = undefined;
    if (l.status !== 'disabled') l.status = 'disconnected';
  }

  /** Connects enabled servers that are not connected yet (best effort, in parallel). */
  async ensureConnected(): Promise<void> {
    await Promise.all(
      [...this.live.entries()]
        .filter(([, l]) => l.config.enabled && l.status === 'disconnected')
        .map(([n]) => this.connect(n).catch(() => undefined)),
    );
  }

  tools(): McpTool[] {
    return [...this.live.values()].filter((l) => l.status === 'connected').flatMap((l) => l.tools);
  }

  connectedServers(): { name: string; instructions?: string; tools: number; description?: string }[] {
    return [...this.live.entries()]
      .filter(([, l]) => l.status === 'connected')
      .map(([name, l]) => ({
        name,
        instructions: l.instructions,
        tools: l.tools.length,
        description: l.config.description,
      }));
  }

  isAutoApproved(server: string, tool: string): boolean {
    const a = this.live.get(server)?.config.autoApprove;
    return a === true || (Array.isArray(a) && a.includes(tool));
  }

  async callTool(server: string, tool: string, args: Record<string, unknown>, signal?: AbortSignal) {
    const l = this.get(server);
    if (l.status !== 'connected' || !l.client) await this.connect(server);
    if (!l.client)
      throw new Error(
        `Serveur MCP « ${server} » non connecté (${l.status}${l.error ? ` : ${l.error}` : ''})`,
      );
    return l.client.callTool({ name: tool, arguments: args }, undefined, { signal, timeout: 300_000 });
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.live.keys()].map((n) => this.disconnect(n)));
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([
    p,
    new Promise<T>((_, reject) => (t = setTimeout(() => reject(new Error(message)), ms))),
  ]).finally(() => clearTimeout(t));
}
