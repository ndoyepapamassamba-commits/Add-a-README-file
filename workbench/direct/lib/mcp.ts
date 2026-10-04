// Remote MCP plugins (HTTP) called directly from the browser.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { McpServerDef } from './types';

export interface McpToolInfo {
  server: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
}

export interface McpLive {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
  tools: McpToolInfo[];
  instructions?: string;
  client?: Client;
}

/** Free hosted servers that accept browser (CORS) connections. */
export const MCP_PRESETS: McpServerDef[] = [
  {
    name: 'context7',
    url: 'https://mcp.context7.com/mcp',
    enabled: true,
    autoApprove: true,
    description: 'Documentation à jour des bibliothèques et frameworks (gratuit).',
  },
  {
    name: 'deepwiki',
    url: 'https://mcp.deepwiki.com/mcp',
    enabled: true,
    autoApprove: true,
    description: 'Questions sur n’importe quel dépôt GitHub public (gratuit).',
  },
];

const live = new Map<string, McpLive>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());
export const onMcpChange = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const mcpState = (name: string): McpLive => live.get(name) ?? { status: 'disconnected', tools: [] };

export async function connect(def: McpServerDef): Promise<McpLive> {
  const prev = live.get(def.name);
  if (prev?.status === 'connected') return prev;
  const st: McpLive = { status: 'connecting', tools: [] };
  live.set(def.name, st);
  changed();
  const opts =
    def.headers && Object.keys(def.headers).length ? { requestInit: { headers: def.headers } } : undefined;
  const attempt = async (sse: boolean) => {
    const client = new Client(
      { name: 'openrouter-workbench-direct', version: '1.0.0' },
      { capabilities: {} },
    );
    const url = new URL(def.url);
    await client.connect(
      sse ? new SSEClientTransport(url, opts) : new StreamableHTTPClientTransport(url, opts),
    );
    return client;
  };
  try {
    let client: Client;
    try {
      client = await attempt(false);
    } catch (err) {
      if (/\/sse\b/.test(def.url)) client = await attempt(true);
      else throw err;
    }
    const tools: McpToolInfo[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      for (const t of page.tools)
        tools.push({
          server: def.name,
          name: t.name,
          description: t.description ?? '',
          inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
          readOnly: t.annotations?.readOnlyHint === true,
        });
      cursor = page.nextCursor;
    } while (cursor && tools.length < 300);
    Object.assign(st, { status: 'connected', client, tools, instructions: client.getInstructions() });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    Object.assign(st, {
      status: 'error',
      error: /Failed to fetch|NetworkError|CORS/i.test(msg)
        ? `${msg} — le serveur refuse peut-être les appels depuis un navigateur (CORS).`
        : msg,
    });
  }
  changed();
  return st;
}

export async function disconnect(name: string): Promise<void> {
  await live
    .get(name)
    ?.client?.close()
    .catch(() => undefined);
  live.delete(name);
  changed();
}

export async function ensureConnected(defs: McpServerDef[], timeoutMs = 8000): Promise<void> {
  const todo = defs.filter((d) => d.enabled && mcpState(d.name).status !== 'connected');
  await Promise.race([
    Promise.all(todo.map((d) => connect(d))),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
}

export function connectedTools(defs: McpServerDef[]): McpToolInfo[] {
  return defs
    .filter((d) => d.enabled)
    .flatMap((d) => (mcpState(d.name).status === 'connected' ? mcpState(d.name).tools : []));
}

export async function callTool(
  server: string,
  tool: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const st = live.get(server);
  if (!st?.client) throw new Error(`Plugin « ${server} » non connecté`);
  return st.client.callTool({ name: tool, arguments: args }, undefined, { signal, timeout: 180_000 });
}
