import path from 'node:path';
import fsp from 'node:fs/promises';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { classifyCommand } from '../../security/commandPolicy';
import { redactSecrets } from '../../security/redact';
import { QuerySpecSchema, isDataFile } from '../../services/dataEngine';
import { extractDocumentText, isDocument, isImage, mimeFor } from '../../services/documents';
import { MEMORY_CATEGORIES } from '../../services/memory';
import { ChartSpecSchema, buildChart } from '../../services/vizEngine';
import { isBinaryBuffer } from '../../services/workspace';
import { sanitizeFilename, uniquePath } from '../../services/browserManager';
import type { AppContext } from '../context';
import { HttpError } from '../context';

const LANGUAGE_BY_EXT: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.md': 'markdown',
  '.py': 'python',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.xml': 'xml',
  '.svg': 'xml',
  '.sh': 'shell',
  '.sql': 'sql',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.php': 'php',
  '.rb': 'ruby',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'cpp',
  '.cs': 'csharp',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.dart': 'dart',
  '.vue': 'html',
  '.toml': 'ini',
  '.ini': 'ini',
  '.env.example': 'ini',
  '.dockerfile': 'dockerfile',
  '.txt': 'plaintext',
  '.csv': 'plaintext',
};

export function languageFor(p: string): string {
  const base = path.basename(p).toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  return LANGUAGE_BY_EXT[path.extname(base)] ?? 'plaintext';
}

function sendFile(reply: FastifyReply, data: Buffer, name: string, download: boolean) {
  reply.header('Content-Type', mimeFor(name));
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header(
    'Content-Security-Policy',
    "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
  );
  reply.header(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`,
  );
  return reply.send(data);
}

export function projectRoutes(app: FastifyInstance, ctx: AppContext): void {
  const s = ctx.services;
  const ws = s.workspace;
  const pid = (req: { params: unknown }) => (req.params as { id: string }).id;

  // ── projects ──────────────────────────────────────────────────────────
  app.get('/api/projects', async () => ws.listProjects());
  app.post('/api/projects', async (req) => {
    const b = z
      .object({ name: z.string().trim().min(1).max(80), gitInit: z.boolean().default(true) })
      .parse(req.body);
    const p = await ws.createProject(b.name, { gitInit: b.gitInit });
    s.repo.audit({ actor: 'user', action: 'project.create', target: p.id });
    return p;
  });
  app.post('/api/projects/clone', async (req) => {
    const b = z
      .object({ url: z.string().trim().min(8).max(500), name: z.string().trim().max(80).optional() })
      .parse(req.body);
    const p = await ws.cloneProject(b.url, b.name);
    s.repo.audit({ actor: 'user', action: 'project.clone', target: b.url });
    return p;
  });
  app.get('/api/projects/:id/analysis', async (req) =>
    s.index.analyze(pid(req), (req.query as { refresh?: string }).refresh === '1'),
  );

  // ── files ─────────────────────────────────────────────────────────────
  app.get('/api/projects/:id/files', async (req) => {
    const q = req.query as { path?: string; showIgnored?: string };
    return ws.listDir(pid(req), q.path ?? '', { showIgnored: q.showIgnored === '1' });
  });
  app.get('/api/projects/:id/all-files', async (req) => {
    const files = await ws.allFiles(pid(req), 20_000);
    return files;
  });
  app.get('/api/projects/:id/file', async (req) => {
    const p = z.object({ path: z.string().min(1) }).parse(req.query).path;
    const st = await ws.stat(pid(req), p);
    if (st.type === 'dir') throw new HttpError(400, 'Is a directory');
    const base = { path: p, size: st.size, mtime: st.mtime, language: languageFor(p) };
    if (isImage(p)) return { ...base, kind: 'image' as const };
    if (isDataFile(p) && /\.(xlsx|xls|xlsm|ods)$/i.test(p)) return { ...base, kind: 'spreadsheet' as const };
    if (isDocument(p) && !/\.html?$/i.test(p)) {
      const doc = await extractDocumentText(ws.resolve(pid(req), p)).catch(() => null);
      return {
        ...base,
        kind: 'document' as const,
        text: doc ? redactSecrets(doc.text).slice(0, 500_000) : '',
        pages: doc?.pages,
      };
    }
    if (st.size > 5 * 1024 * 1024) return { ...base, kind: 'large' as const };
    const buf = await ws.readRaw(pid(req), p);
    if (isBinaryBuffer(buf)) return { ...base, kind: 'binary' as const };
    return { ...base, kind: 'text' as const, content: buf.toString('utf8') };
  });
  app.get('/api/projects/:id/raw', async (req, reply) => {
    const q = z.object({ path: z.string().min(1), download: z.string().optional() }).parse(req.query);
    const data = await ws.readRaw(pid(req), q.path);
    return sendFile(reply, data, path.basename(q.path), q.download === '1');
  });
  app.put('/api/projects/:id/file', async (req) => {
    const b = z
      .object({ path: z.string().min(1), content: z.string(), expectedMtime: z.number().optional() })
      .parse(req.body);
    if (b.expectedMtime !== undefined && (await ws.exists(pid(req), b.path))) {
      const st = await ws.stat(pid(req), b.path);
      if (Math.abs(st.mtime - b.expectedMtime) > 1)
        throw new HttpError(
          409,
          'Le fichier a été modifié sur le disque depuis son ouverture (rechargez-le).',
        );
    }
    const change = await ws.writeFile(pid(req), b.path, b.content, {});
    s.index.invalidate(pid(req));
    const st = await ws.stat(pid(req), b.path);
    return { change, mtime: st.mtime };
  });
  app.post('/api/projects/:id/files/mkdir', async (req) => {
    const b = z.object({ path: z.string().min(1) }).parse(req.body);
    await ws.mkdir(pid(req), b.path);
    return { ok: true };
  });
  app.post('/api/projects/:id/files/move', async (req) => {
    const b = z.object({ from: z.string().min(1), to: z.string().min(1) }).parse(req.body);
    return ws.movePath(pid(req), b.from, b.to, {});
  });
  app.delete('/api/projects/:id/file', async (req) => {
    const p = z.object({ path: z.string().min(1) }).parse(req.query).path;
    const change = await ws.deletePath(pid(req), p, {});
    s.repo.audit({ actor: 'user', action: 'file.delete', target: p });
    return change;
  });
  app.post('/api/projects/:id/upload', async (req) => {
    const id = pid(req);
    const dir = ((req.query as { dir?: string }).dir ?? 'uploads').replace(/^[/\\]+/, '') || 'uploads';
    const saved: { path: string; size: number; kind: string }[] = [];
    for await (const part of req.files({ limits: { fileSize: 100 * 1024 * 1024, files: 30 } })) {
      const name = sanitizeFilename(part.filename || 'file');
      const absDir = ws.resolve(id, dir);
      await fsp.mkdir(absDir, { recursive: true });
      const target = uniquePath(path.join(absDir, name));
      const rel = path.relative(ws.projectRoot(id), target).split(path.sep).join('/');
      const buf = await part.toBuffer();
      await ws.writeBinary(id, rel, buf);
      saved.push({
        path: rel,
        size: buf.length,
        kind: isImage(rel) ? 'image' : isDataFile(rel) ? 'data' : isDocument(rel) ? 'document' : 'file',
      });
    }
    s.repo.audit({ actor: 'user', action: 'file.upload', target: id, details: saved.map((f) => f.path) });
    return saved;
  });
  app.post('/api/projects/:id/paste', async (req) => {
    const b = z
      .object({ text: z.string().min(1).max(5_000_000), name: z.string().max(100).optional() })
      .parse(req.body);
    const id = pid(req);
    const absDir = ws.resolve(id, 'uploads');
    await fsp.mkdir(absDir, { recursive: true });
    const target = uniquePath(
      path.join(
        absDir,
        sanitizeFilename(b.name ?? `texte-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`),
      ),
    );
    const rel = path.relative(ws.projectRoot(id), target).split(path.sep).join('/');
    await ws.writeBinary(id, rel, Buffer.from(b.text, 'utf8'));
    return { path: rel, size: b.text.length, kind: 'text' };
  });
  app.get('/api/projects/:id/search', async (req) => {
    const q = z
      .object({
        q: z.string().min(1),
        regex: z.string().optional(),
        glob: z.string().optional(),
        case: z.string().optional(),
      })
      .parse(req.query);
    return s.index.grep(pid(req), q.q, {
      regex: q.regex === '1',
      glob: q.glob,
      caseSensitive: q.case === '1',
      maxResults: 500,
    });
  });

  // ── changes ───────────────────────────────────────────────────────────
  app.get('/api/projects/:id/changes', async (req) => s.repo.listChanges({ projectId: pid(req) }));
  app.post('/api/changes/:id/accept', async (req) => ws.acceptChange((req.params as { id: string }).id));
  app.post('/api/changes/:id/revert', async (req) => {
    const c = await ws.revertChange((req.params as { id: string }).id);
    s.repo.audit({ actor: 'user', action: 'change.revert', target: c.path });
    return c;
  });

  // ── terminal (user commands) ──────────────────────────────────────────
  app.post('/api/projects/:id/terminal', async (req) => {
    const b = z
      .object({
        command: z.string().min(1).max(8000),
        cwd: z.string().default(''),
        confirmed: z.boolean().default(false),
        background: z.boolean().default(false),
        stdin: z.boolean().default(true),
      })
      .parse(req.body);
    const c = classifyCommand(b.command);
    if (c.level === 'blocked') {
      s.repo.audit({
        actor: 'user',
        action: 'terminal.blocked',
        target: b.command,
        decision: 'deny',
        details: c.reasons,
      });
      throw new HttpError(403, `Commande bloquée : ${c.reasons.join(', ')}`);
    }
    if (c.level === 'dangerous' && !b.confirmed)
      return { needsConfirmation: true, level: c.level, reasons: c.reasons };
    const cwd = ws.resolve(pid(req), b.cwd);
    s.repo.audit({ actor: 'user', action: 'terminal.run', target: b.command, decision: c.level });
    if (b.background) {
      const r = await s.processes.startBackground({
        projectId: pid(req),
        cwd,
        command: b.command,
        origin: 'user',
        settleMs: 300,
      });
      return { processId: r.id };
    }
    const { id } = s.processes.run({
      projectId: pid(req),
      cwd,
      command: b.command,
      origin: 'user',
      timeoutMs: 30 * 60_000,
      stdin: b.stdin,
    });
    return { processId: id };
  });
  app.get('/api/terminal', async () => s.processes.list());
  app.get(
    '/api/terminal/:pid/output',
    async (req) => s.processes.output((req.params as { pid: string }).pid) ?? { stdout: '', stderr: '' },
  );
  app.post('/api/terminal/:pid/kill', async (req) => ({
    ok: s.processes.kill((req.params as { pid: string }).pid),
  }));
  app.post('/api/terminal/:pid/stdin', async (req) => {
    const b = z.object({ data: z.string().max(100_000), end: z.boolean().default(false) }).parse(req.body);
    return { ok: s.processes.writeStdin((req.params as { pid: string }).pid, b.data, b.end) };
  });

  // ── git ───────────────────────────────────────────────────────────────
  const root = (req: { params: unknown }) => ws.projectRoot(pid(req));
  app.get('/api/projects/:id/git', async (req) => {
    const r = root(req);
    const [status, branches, log] = await Promise.all([s.git.status(r), s.git.branches(r), s.git.log(r, 40)]);
    return { status, branches, log };
  });
  app.get('/api/projects/:id/git/diff', async (req) => {
    const q = req.query as { path?: string; staged?: string };
    return { diff: redactSecrets(await s.git.diff(root(req), { path: q.path, staged: q.staged === '1' })) };
  });
  app.post('/api/projects/:id/git/init', async (req) => {
    await s.git.init(root(req));
    return { ok: true };
  });
  app.post('/api/projects/:id/git/commit', async (req) => {
    const b = z
      .object({ message: z.string().min(1).max(5000), files: z.array(z.string()).optional() })
      .parse(req.body);
    const r = await s.git.commit(root(req), b.message, b.files);
    s.repo.audit({ actor: 'user', action: 'git.commit', target: r.hash });
    return r;
  });
  app.post('/api/projects/:id/git/checkout', async (req) => {
    const b = z.object({ branch: z.string().min(1).max(200) }).parse(req.body);
    await s.git.checkout(root(req), b.branch);
    return { ok: true };
  });
  app.post('/api/projects/:id/git/branch', async (req) => {
    const b = z
      .object({ name: z.string().min(1).max(200), checkout: z.boolean().default(true) })
      .parse(req.body);
    await s.git.createBranch(root(req), b.name, b.checkout);
    return { ok: true };
  });

  // ── data intelligence ─────────────────────────────────────────────────
  const dataAbs = (req: { params: unknown }, p: string) => {
    if (!isDataFile(p))
      throw new HttpError(400, 'Format non pris en charge (csv, tsv, xlsx, xls, xlsm, ods, json, jsonl)');
    return ws.resolve(pid(req), p);
  };
  app.get('/api/projects/:id/data/files', async (req) => (await ws.allFiles(pid(req))).filter(isDataFile));
  app.get('/api/projects/:id/data/inspect', async (req) => {
    const q = z.object({ path: z.string().min(1), sheet: z.string().optional() }).parse(req.query);
    const ds = await s.data.load(dataAbs(req, q.path), q.sheet);
    return { ...s.data.profile(ds), path: q.path };
  });
  app.post('/api/projects/:id/data/query', async (req) => {
    const b = z
      .object({ path: z.string().min(1), sheet: z.string().optional(), query: QuerySpecSchema.default({}) })
      .parse(req.body);
    const ds = await s.data.load(dataAbs(req, b.path), b.sheet);
    return s.data.query(ds, { limit: 200, ...b.query });
  });
  app.post('/api/projects/:id/data/chart', async (req) => {
    const b = z
      .object({ spec: ChartSpecSchema, save: z.boolean().default(false), sessionId: z.string().optional() })
      .parse(req.body);
    const chart = await buildChart(s.data, dataAbs(req, b.spec.source.path), b.spec);
    if (b.save) {
      const art = await s.artifacts.create({
        projectId: pid(req),
        sessionId: b.sessionId ?? null,
        name: b.spec.title,
        type: 'chart',
        content: JSON.stringify(chart),
        meta: { chartType: b.spec.type, source: b.spec.source.path },
      });
      return { chart, artifactId: art.id };
    }
    return { chart };
  });
  app.post('/api/projects/:id/data/export', async (req, reply) => {
    const b = z
      .object({
        path: z.string().min(1),
        sheet: z.string().optional(),
        query: QuerySpecSchema.default({}),
        format: z.enum(['csv', 'xlsx', 'json']),
      })
      .parse(req.body);
    const ds = await s.data.load(dataAbs(req, b.path), b.sheet);
    const res = s.data.query(ds, { ...b.query, limit: b.query.limit ?? 1_000_000 });
    const buf = s.data.exportRows(res.columns, res.rows, b.format);
    return sendFile(reply, buf, `${path.basename(b.path, path.extname(b.path))}-export.${b.format}`, true);
  });

  // ── memory ────────────────────────────────────────────────────────────
  app.get('/api/projects/:id/memory', async (req) => ({
    facts: await s.memory.facts(pid(req)),
    context: await s.memory.contextMarkdown(pid(req)),
  }));
  app.post('/api/projects/:id/memory', async (req) => {
    const b = z
      .object({ category: z.enum(MEMORY_CATEGORIES), text: z.string().min(2).max(1000) })
      .parse(req.body);
    return s.memory.add(pid(req), b.category, b.text);
  });
  app.delete('/api/projects/:id/memory/:factId', async (req) => ({
    ok: await s.memory.remove(pid(req), (req.params as { factId: string }).factId),
  }));
  app.put('/api/projects/:id/context', async (req) => {
    const b = z.object({ content: z.string().max(200_000) }).parse(req.body);
    await ws.writeFile(pid(req), 'PROJECT_CONTEXT.md', b.content, {});
    return { ok: true };
  });
}
