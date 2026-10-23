// PONT LOCAL MASSAMBA (23/10/2026, « rendre l'application comme un HARNESS complet », « intègre le skill REA ») :
// the browser Workbench cannot start a program; this small bridge, run on the user's PC, gives it two MCP servers over
// Streamable HTTP:
//   /rea   → REA (rea-agents, MIT): every REA tool, proxied to `rea mcp` over stdio (the same server .mcp.json declares);
//   /poste → the machine: bash, read_file, write_file, list_files, grep, system_info — confined to one folder.
// Built on the MCP SDK's own HTTP transport (REA evidence ev_05b57f74…, @modelcontextprotocol/sdk 1.32.0:
// webStandardStreamableHttp.js l. 78-80 allowedHosts / allowedOrigins / enableDnsRebindingProtection, l. 143-160 the
// checks, l. 174-176 one transport per request in stateless mode — here one per session).
// Security: listens on 127.0.0.1 only; Host checked (DNS rebinding); Origin must be a file:// page (null) or a loopback
// page; every request carries the pairing code (Authorization: Bearer …) printed at start; files are confined to the
// folder; in the app every call still goes through the permission rules, the hooks and the user's approval.
//   node massamba-pont.mjs [dossier] [--port 7821] [--code XXXX] [--sans-shell] [--rea "commande"]
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';

export const PONT_VERSION = '1.0.0';
const REA_PACKAGE = 'rea-agents@6.5.0';
const MAX_OUT = 200_000;

export interface PontOptions {
  root: string;
  port: number;
  code: string;
  shell: boolean;
  /** Command line that starts REA's MCP server (default: `rea mcp` when installed, else npx). */
  rea?: string;
  log?: (line: string) => void;
}

function argv(): PontOptions {
  const a = process.argv.slice(2);
  const opt = (name: string) => {
    const i = a.indexOf(name);
    return i >= 0 ? a.splice(i, 2)[1] : undefined;
  };
  const port = Number(opt('--port') ?? process.env.MASSAMBA_PONT_PORT ?? 7821);
  const code = opt('--code') ?? process.env.MASSAMBA_PONT_CODE ?? pairingCode();
  const rea = opt('--rea') ?? process.env.MASSAMBA_REA;
  const noShell = a.includes('--sans-shell');
  const root = path.resolve(a.find((x) => !x.startsWith('--')) ?? process.cwd());
  return { root, port, code, shell: !noShell, rea };
}
/** A pairing code kept between runs (~/.massamba-pont.json) so the app does not ask again. */
function pairingCode(): string {
  const f = path.join(os.homedir(), '.massamba-pont.json');
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8')) as { code?: string };
    if (j.code && /^[A-Z0-9-]{8,}$/.test(j.code)) return j.code;
  } catch {
    /* first run */
  }
  const hex = randomBytes(6).toString('hex').toUpperCase();
  const code = `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8)}`;
  try {
    fs.writeFileSync(f, JSON.stringify({ code }), { mode: 0o600 });
  } catch {
    /* read-only home: the code lives for this run only */
  }
  return code;
}

// ── the machine (/poste) ──────────────────────────────────────────────────────────────────────────────────────────
const clip = (s: string) =>
  s.length > MAX_OUT ? `${s.slice(0, MAX_OUT)}\n…[sortie tronquée à ${MAX_OUT} caractères]` : s;
function inside(root: string, p: string): string {
  const full = path.resolve(root, p || '.');
  if (full !== root && !full.startsWith(root + path.sep))
    throw new Error(`chemin hors du dossier autorisé (${root}) : ${p}`);
  return full;
}
const SKIP = new Set(['node_modules', '.git', '__pycache__', '.venv']);
function walk(root: string, max: number): string[] {
  const out: string[] = [];
  const go = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (out.length >= max) return;
      if (SKIP.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) go(p);
      else out.push(path.relative(root, p).split(path.sep).join('/'));
    }
  };
  go(root);
  return out;
}
/** Glob → RegExp: ** crosses folders, * stays in one, ? is one character (placeholders in the private-use area). */
const globRe = (g: string) =>
  new RegExp(
    `^${g
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '\uE001')
      .replace(/\*\*/g, '\uE000')
      .replace(/\*/g, '[^/]*')
      .replace(/\uE001/g, '(?:.*/)?')
      .replace(/\uE000/g, '.*')
      .replace(/\?/g, '.')}$`,
  );

function runShell(
  command: string,
  cwd: string,
  timeoutS: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const win = process.platform === 'win32';
    const child = win
      ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { cwd })
      : spawn('bash', ['-lc', command], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout = (stdout + d.toString()).slice(-MAX_OUT * 2)));
    child.stderr.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-MAX_OUT * 2)));
    const t = setTimeout(() => {
      child.kill('SIGKILL');
      stderr += `\n[arrêté après ${timeoutS} s]`;
    }, timeoutS * 1000);
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    child.on('error', (e) => {
      clearTimeout(t);
      resolve({ code: -1, stdout, stderr: `${stderr}${e.message}` });
    });
  });
}

const POSTE_TOOLS = (shell: boolean): Tool[] => [
  ...(shell
    ? [
        {
          name: 'bash',
          description:
            "Run a shell command on the user's computer (bash on Linux/macOS, PowerShell on Windows), in the bridge folder. Real tools: git, npm, python, node, rea… Returns exit code, stdout and stderr.",
          inputSchema: {
            type: 'object' as const,
            properties: {
              command: { type: 'string' },
              timeout_s: { type: 'number', description: 'default 120, max 600' },
            },
            required: ['command'],
          },
        },
      ]
    : []),
  {
    name: 'read_file',
    description: 'Read a text file of the bridge folder (offset / limit in lines).',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } },
      required: ['path'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'write_file',
    description:
      'Create or overwrite a file of the bridge folder (any format: text, or base64 for binaries).',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' }, base64: { type: 'boolean' } },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_files',
    description: 'List the files of the bridge folder matching a glob (default **/*).',
    inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, max: { type: 'number' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'grep',
    description: 'Search a regular expression in the text files of the bridge folder (optional glob).',
    inputSchema: {
      type: 'object',
      properties: { pattern: { type: 'string' }, glob: { type: 'string' }, max: { type: 'number' } },
      required: ['pattern'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'system_info',
    description: 'Operating system, Node version, bridge folder, REA availability.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
];

async function callPoste(
  o: PontOptions,
  name: string,
  a: Record<string, unknown>,
  rea: ReaProxy,
): Promise<string> {
  const S = (v: unknown) => (typeof v === 'string' ? v : '');
  switch (name) {
    case 'bash': {
      if (!o.shell) throw new Error('shell désactivé (--sans-shell)');
      const r = await runShell(S(a.command), o.root, Math.min(600, Math.max(1, Number(a.timeout_s) || 120)));
      return `exit ${r.code}\n--- stdout ---\n${clip(r.stdout)}\n--- stderr ---\n${clip(r.stderr)}`;
    }
    case 'read_file': {
      const buf = fs.readFileSync(inside(o.root, S(a.path)));
      if (buf.subarray(0, 8000).includes(0))
        return `binaire : ${buf.length} octets (utilisez bash pour l'inspecter, ou rea)`;
      const lines = buf.toString('utf8').split('\n');
      const from = Math.max(0, Number(a.offset) || 0);
      const n = Math.max(1, Number(a.limit) || 2000);
      return clip(
        lines
          .slice(from, from + n)
          .map((l, i) => `${from + i + 1}\t${l}`)
          .join('\n'),
      );
    }
    case 'write_file': {
      const p = inside(o.root, S(a.path));
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const data = a.base64 ? Buffer.from(S(a.content), 'base64') : Buffer.from(S(a.content), 'utf8');
      fs.writeFileSync(p, data);
      return `écrit : ${path.relative(o.root, p)} (${data.length} octets)`;
    }
    case 'list_files': {
      const re = globRe(S(a.pattern) || '**/*');
      const all = walk(o.root, 20_000).filter((f) => re.test(f));
      const max = Math.max(1, Number(a.max) || 500);
      return `${all.length} fichier(s)${all.length > max ? ` (${max} premiers)` : ''}\n${all.slice(0, max).join('\n')}`;
    }
    case 'grep': {
      let re: RegExp;
      try {
        re = new RegExp(S(a.pattern));
      } catch (e) {
        throw new Error(`expression invalide : ${(e as Error).message}`, { cause: e });
      }
      const g = S(a.glob) ? globRe(S(a.glob)) : null;
      const max = Math.max(1, Number(a.max) || 200);
      const hits: string[] = [];
      for (const f of walk(o.root, 20_000)) {
        if (hits.length >= max) break;
        if (g && !g.test(f)) continue;
        const buf = fs.readFileSync(path.join(o.root, f));
        if (buf.length > 5_000_000 || buf.subarray(0, 8000).includes(0)) continue;
        buf
          .toString('utf8')
          .split('\n')
          .forEach((l, i) => {
            if (hits.length < max && re.test(l)) hits.push(`${f}:${i + 1}: ${l.slice(0, 300)}`);
          });
      }
      return hits.length ? hits.join('\n') : 'aucune correspondance';
    }
    case 'system_info':
      return JSON.stringify(
        {
          os: `${os.type()} ${os.release()}`,
          platform: process.platform,
          arch: process.arch,
          node: process.versions.node,
          folder: o.root,
          shell: o.shell,
          rea: await rea.status(),
          pont: PONT_VERSION,
        },
        null,
        2,
      );
    default:
      throw new Error(`outil inconnu : ${name}`);
  }
}

const REA_FACADE: Tool[] = [
  {
    name: 'rea_inspect',
    description:
      'Reverse-engineer a file or folder of the bridge folder with REA, choosing the right analyser from its type (WASM, SQLite, JavaScript / Electron app or asar, archives and packages: zip, apk, jar, ipa, whl…, native binaries: exe, dll, so, dylib, Mach-O). Returns REA Evidence (observed facts, evidence ids, limitations).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path in the bridge folder (relative or absolute)' },
      },
      required: ['path'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'rea_list_tools',
    description:
      'List the 200+ REA tools (one line each), optionally filtered by a word (wasm, android, frida, sqlite, pcap, swift, electron…).',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'rea_tool_schema',
    description:
      'Arguments (JSON Schema) and full description of one REA tool, before calling it with rea_call.',
    inputSchema: { type: 'object', properties: { tool: { type: 'string' } }, required: ['tool'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'rea_call',
    description:
      'Call any REA tool by name with its arguments (paths relative to the bridge folder are accepted). Large Evidence is saved in .rea/ and an excerpt returned.',
    inputSchema: {
      type: 'object',
      properties: { tool: { type: 'string' }, arguments: { type: 'object' } },
      required: ['tool'],
    },
  },
];

// ── REA (/rea) ────────────────────────────────────────────────────────────────────────────────────────────────────
class ReaProxy {
  private client: Client | null = null;
  private starting: Promise<Client> | null = null;
  private tools: Tool[] = [];
  error = '';
  constructor(private o: PontOptions) {}
  private command(): { command: string; args: string[] } {
    if (this.o.rea) {
      const parts = this.o.rea.match(/"[^"]*"|\S+/g)!.map((p) => p.replace(/^"|"$/g, ''));
      return { command: parts[0]!, args: parts.slice(1) };
    }
    const which = process.platform === 'win32' ? 'where' : 'which';
    const hasRea = spawnSync(which, ['rea']).status === 0;
    return hasRea
      ? { command: 'rea', args: ['mcp'] }
      : { command: process.platform === 'win32' ? 'npx.cmd' : 'npx', args: ['-y', REA_PACKAGE, 'mcp'] };
  }
  async get(): Promise<Client> {
    if (this.client) return this.client;
    this.starting ??= (async () => {
      const { command, args } = this.command();
      const c = new Client({ name: 'massamba-pont', version: PONT_VERSION }, { capabilities: {} });
      await c.connect(new StdioClientTransport({ command, args, cwd: this.o.root, stderr: 'ignore' }));
      const t: Tool[] = [];
      let cursor: string | undefined;
      do {
        const page = await c.listTools(cursor ? { cursor } : undefined);
        t.push(...page.tools);
        cursor = page.nextCursor;
      } while (cursor);
      this.tools = t;
      this.client = c;
      this.error = '';
      return c;
    })().catch((e: Error) => {
      this.starting = null;
      this.error = `REA ne démarre pas (${e.message}). REA demande Node 22.19 ou plus : node --version ; installation : npm i -g ${REA_PACKAGE}`;
      throw new Error(this.error);
    });
    return this.starting;
  }
  /** REA's own catalogue is 207 tools and ~3 MB of schemas: the app sees four light tools instead (progressive
   *  disclosure), any REA tool stays one call away through rea_call. */
  async list(): Promise<Tool[]> {
    try {
      await this.get();
    } catch {
      return [
        {
          name: 'rea_status',
          description: `REA indisponible : ${this.error}`,
          inputSchema: { type: 'object', properties: {} },
        },
      ];
    }
    return REA_FACADE;
  }
  /** Relative paths are taken in the bridge folder; an absolute path outside it is refused. */
  private paths(args: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
      if (/(^|_)paths?$/.test(k) && typeof v === 'string') out[k] = inside(this.o.root, v);
      else if (/(^|_)paths$/.test(k) && Array.isArray(v))
        out[k] = v.map((x) => (typeof x === 'string' ? inside(this.o.root, x) : x));
      else out[k] = v;
    }
    return out;
  }
  /** Full evidence saved in <folder>/.rea/, a bounded excerpt returned to the model. */
  private keep(tool: string, r: { content?: { type: string; text?: string }[]; isError?: boolean }) {
    const text = (r.content ?? []).map((c) => c.text ?? '').join('\n');
    if (text.length <= 40_000) return { content: [{ type: 'text' as const, text }], isError: r.isError };
    const dir = path.join(this.o.root, '.rea');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${tool}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, text);
    const ids = [...new Set(text.match(/ev_[a-f0-9]{64}/g) ?? [])].slice(0, 3);
    return {
      content: [
        {
          type: 'text' as const,
          text: `${text.slice(0, 40_000)}\n…[preuve complète : ${(text.length / 1048576).toFixed(1)} Mio enregistrée dans ${path.relative(this.o.root, file)} — cherchez-y avec mcp.poste.grep${ids.length ? ` ; identifiants : ${ids.join(', ')}` : ''}]`,
        },
      ],
      isError: r.isError,
    };
  }
  async call(name: string, args: Record<string, unknown>) {
    if (name === 'rea_status')
      return { content: [{ type: 'text' as const, text: this.error || 'REA prêt.' }] };
    const c = await this.get();
    const raw = (tool: string, a: Record<string, unknown>) =>
      c.callTool({ name: tool, arguments: this.paths(a) }, undefined, { timeout: 15 * 60_000 }) as Promise<{
        content?: { type: string; text?: string }[];
        isError?: boolean;
      }>;
    if (name === 'rea_list_tools') {
      const q = String(args.query ?? '').toLowerCase();
      const rows = this.tools
        .filter((t) => !q || `${t.name} ${t.description ?? ''}`.toLowerCase().includes(q))
        .map((t) => `- ${t.name} : ${(t.description ?? '').split(/(?<=\.)\s/)[0]!.slice(0, 160)}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: `${rows.length} outil(s) REA${q ? ` pour « ${q} »` : ''}\n${rows.join('\n')}`,
          },
        ],
      };
    }
    if (name === 'rea_tool_schema') {
      const t = this.tools.find((x) => x.name === String(args.tool));
      if (!t) throw new Error(`outil REA inconnu : ${String(args.tool)} (voir rea_list_tools)`);
      return {
        content: [
          {
            type: 'text' as const,
            text: `${t.description ?? ''}\n\nArguments (JSON Schema) :\n${JSON.stringify(t.inputSchema)}`,
          },
        ],
      };
    }
    if (name === 'rea_call')
      return this.keep(
        String(args.tool),
        await raw(String(args.tool), (args.arguments ?? {}) as Record<string, unknown>),
      );
    if (name === 'rea_inspect') {
      const p = String(args.path ?? '');
      const full = inside(this.o.root, p);
      const ext = path.extname(full).toLowerCase();
      const isDir = fs.existsSync(full) && fs.statSync(full).isDirectory();
      let plan: [string, Record<string, unknown>][];
      if (ext === '.wasm') plan = [['inspect_wasm_artifact', { path: p, detail: 'summary' }]];
      else if (['.sqlite', '.sqlite3', '.db'].includes(ext))
        plan = [['inspect_sqlite_database', { path: p }]];
      else if (isDir || ['.asar', '.js', '.mjs', '.cjs'].includes(ext))
        plan = [
          [
            'analyze_javascript_application',
            { input_path: p, format: ext === '.asar' ? 'asar' : isDir ? 'directory' : 'auto' },
          ],
        ];
      else if (
        [
          '.zip',
          '.apk',
          '.aab',
          '.jar',
          '.ipa',
          '.xpi',
          '.crx',
          '.whl',
          '.nupkg',
          '.tgz',
          '.gz',
          '.tar',
          '.vsix',
          '.mcpb',
        ].includes(ext)
      )
        plan = [
          ['open_binary', { path: p }],
          ['inspect_artifact', { detail: 'summary' }],
        ];
      else plan = [['inspect_binary_layout', { path: p, detail: 'summary' }]];
      let last: Awaited<ReturnType<typeof raw>> = { content: [] };
      for (const [tool, a] of plan) last = await raw(tool, a);
      return this.keep(plan.at(-1)![0], last);
    }
    return this.keep(name, await raw(name, args));
  }
  async status(): Promise<string> {
    try {
      await this.get();
      return `prêt (${this.tools.length} outils)`;
    } catch {
      return this.error;
    }
  }
}

// ── HTTP: checks, CORS, sessions ──────────────────────────────────────────────────────────────────────────────────
function cors(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization, content-type, mcp-session-id, mcp-protocol-version, last-event-id, accept',
  );
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
  // Chrome's Private Network Access: a page opened from disk may call a loopback server only when it says yes.
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}
const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
export function checkRequest(
  req: http.IncomingMessage,
  o: PontOptions,
): { status: number; error: string } | null {
  const hosts = [`127.0.0.1:${o.port}`, `localhost:${o.port}`, `[::1]:${o.port}`];
  if (!hosts.includes(String(req.headers.host ?? '')))
    return { status: 403, error: 'hôte refusé (protection DNS rebinding)' };
  const origin = req.headers.origin;
  if (origin && origin !== 'null' && !LOOPBACK_ORIGIN.test(origin))
    return { status: 403, error: `origine refusée : ${origin}` };
  const auth = String(req.headers.authorization ?? '');
  const url = new URL(req.url ?? '/', 'http://x');
  if (auth !== `Bearer ${o.code}` && url.searchParams.get('code') !== o.code)
    return { status: 401, error: 'code d’appairage manquant ou faux' };
  return null;
}
async function body(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > 25 * 1024 * 1024) throw new Error('requête trop lourde');
    chunks.push(c as Buffer);
  }
  const t = Buffer.concat(chunks).toString('utf8');
  return t ? JSON.parse(t) : undefined;
}

export function startPont(o: PontOptions): Promise<http.Server> {
  const log =
    o.log ?? ((l: string) => process.stdout.write(`[${new Date().toLocaleTimeString('fr-FR')}] ${l}\n`));
  const rea = new ReaProxy(o);
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const makeServer = (kind: 'poste' | 'rea') => {
    const s = new Server(
      { name: kind === 'rea' ? 'rea' : 'poste', version: PONT_VERSION },
      {
        capabilities: { tools: {} },
        instructions:
          kind === 'rea'
            ? "REA (Reverse Engineer Anything, MIT) on the user's computer: inspect apps, packages, bundles, binaries, WASM, SQLite, network captures. Cite the evidence ids; separate observed / inferred / unknown."
            : `The user's computer through the MASSAMBA bridge, folder ${o.root}. Real shell and files: act carefully, stay in the folder, never print secrets.`,
      },
    );
    s.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: kind === 'rea' ? await rea.list() : POSTE_TOOLS(o.shell),
    }));
    s.setRequestHandler(CallToolRequestSchema, async (r) => {
      const name = r.params.name;
      const args = (r.params.arguments ?? {}) as Record<string, unknown>;
      log(`${kind}.${name} ${JSON.stringify(args).slice(0, 160)}`);
      try {
        if (kind === 'rea') return (await rea.call(name, args)) as never;
        return { content: [{ type: 'text', text: await callPoste(o, name, args, rea) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Erreur : ${(e as Error).message}` }], isError: true };
      }
    });
    return s;
  };
  const server = http.createServer(async (req, res) => {
    cors(req, res);
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    const bad = checkRequest(req, o);
    if (bad)
      return void res
        .writeHead(bad.status, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: bad.error }));
    const url = new URL(req.url ?? '/', 'http://x');
    const kind = /^\/rea(\/mcp)?\/?$/.test(url.pathname)
      ? 'rea'
      : /^\/poste(\/mcp)?\/?$/.test(url.pathname)
        ? 'poste'
        : null;
    try {
      if (url.pathname === '/statut')
        return void res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(
            JSON.stringify({
              pont: PONT_VERSION,
              dossier: o.root,
              shell: o.shell,
              node: process.versions.node,
              rea: rea.error || 'à la demande',
            }),
          );
      if (!kind) return void res.writeHead(404).end();
      const parsed = req.method === 'POST' ? await body(req) : undefined;
      const sid = String(req.headers['mcp-session-id'] ?? '');
      let t = sid ? sessions.get(`${kind}:${sid}`) : undefined;
      if (!t) {
        if (sid)
          return void res
            .writeHead(404, { 'content-type': 'application/json' })
            .end(JSON.stringify({ error: 'session inconnue' }));
        t = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => void sessions.set(`${kind}:${id}`, t!),
        });
        t.onclose = () => {
          if (t!.sessionId) sessions.delete(`${kind}:${t!.sessionId}`);
        };
        await makeServer(kind).connect(t);
      }
      await t.handleRequest(req, res, parsed);
    } catch (e) {
      if (!res.headersSent)
        res
          .writeHead(500, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: (e as Error).message }));
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(o.port, '127.0.0.1', () => resolve(server));
  });
}

export async function main(): Promise<void> {
  const o = argv();
  if (!fs.existsSync(o.root)) throw new Error(`dossier introuvable : ${o.root}`);
  await startPont(o);
  const line = '─'.repeat(64);
  process.stdout.write(
    `${[
      line,
      ` PONT LOCAL MASSAMBA ${PONT_VERSION} — REA et ce PC pour la Workbench`,
      line,
      ` Dossier autorisé : ${o.root}`,
      ` Adresse          : http://127.0.0.1:${o.port}  (cet ordinateur seulement)`,
      ` Code d'appairage : ${o.code}`,
      ` Shell            : ${o.shell ? 'activé (chaque commande passe par vos règles et votre accord dans la Workbench)' : 'désactivé'}`,
      ` Node             : ${process.versions.node}${Number(process.versions.node.split('.')[0]) < 22 ? '  (REA demande 22.19 ou plus)' : ''}`,
      line,
      ' Dans la Workbench : Réglages > Harness > Pont local, collez le code. Ctrl+C pour arrêter.',
      line,
    ].join('\n')}\n`,
  );
}
