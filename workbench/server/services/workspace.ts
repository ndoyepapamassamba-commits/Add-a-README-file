import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { diffLines } from 'diff';
import ignore, { type Ignore } from 'ignore';
import type { ChangeRecord, FileEntry, ProjectInfo } from '@shared/types';
import type { Repo } from '../db/repo';
import { isProtectedPath, resolveInside, toRelative } from '../security/paths';
import { containsRedaction } from '../security/redact';

export class NotFoundError extends Error {
  readonly statusCode = 404;
}
export class ConflictError extends Error {
  readonly statusCode = 409;
}
export class BadRequestError extends Error {
  readonly statusCode = 400;
}

const DEFAULT_IGNORES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
  'coverage',
  '.workbench',
  '.DS_Store',
];
const MAX_TEXT_BYTES = 5 * 1024 * 1024;

export interface ChangeContext {
  runId?: string | null;
  sessionId?: string | null;
}

export function countLineDiff(
  before: string | null,
  after: string | null,
): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const part of diffLines(before ?? '', after ?? '')) {
    if (part.added) added += part.count ?? 0;
    if (part.removed) removed += part.count ?? 0;
  }
  return { added, removed };
}

export function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project'
  );
}

export function isBinaryBuffer(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** Projects are sub-directories of WORKSPACE_ROOT. All paths are project-relative. */
export class WorkspaceService {
  private ignoreCache = new Map<string, { mtime: number; ig: Ignore }>();

  constructor(
    readonly root: string,
    private readonly repo: Repo,
  ) {
    fs.mkdirSync(root, { recursive: true });
    this.syncProjects();
  }

  // ── projects ──────────────────────────────────────────────────────────
  syncProjects(): void {
    const dirs = fs
      .readdirSync(this.root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'));
    const known = new Map(this.repo.listProjectRows().map((p) => [p.path, p]));
    for (const d of dirs) {
      const abs = path.join(this.root, d.name);
      if (!known.has(abs)) this.repo.upsertProject({ id: slugify(d.name), name: d.name, path: abs });
      known.delete(abs);
    }
    for (const stale of known.values()) this.repo.deleteProjectRow(stale.id);
  }

  listProjects(): ProjectInfo[] {
    this.syncProjects();
    return this.repo
      .listProjectRows()
      .map((p) => ({ ...p, isGit: fs.existsSync(path.join(p.path, '.git')) }));
  }

  getProject(id: string): ProjectInfo {
    let p = this.repo.getProjectRow(id);
    if (!p || !fs.existsSync(p.path)) {
      this.syncProjects();
      p = this.repo.getProjectRow(id);
    }
    if (!p || !fs.existsSync(p.path)) throw new NotFoundError(`Project not found: ${id}`);
    return { ...p, isGit: fs.existsSync(path.join(p.path, '.git')) };
  }

  async createProject(name: string, opts: { gitInit?: boolean } = {}): Promise<ProjectInfo> {
    const dirName = slugify(name);
    const abs = path.join(this.root, dirName);
    if (fs.existsSync(abs)) throw new ConflictError(`A project named "${dirName}" already exists`);
    await fsp.mkdir(abs, { recursive: true });
    await fsp.writeFile(
      path.join(abs, 'PROJECT_CONTEXT.md'),
      `# ${name}\n\nContexte du projet (lu par l'agent à chaque tâche). Décrivez ici l'objectif, l'architecture et les conventions.\n`,
    );
    if (opts.gitInit) await runGit(abs, ['init', '-q']);
    this.repo.upsertProject({ id: dirName, name: dirName, path: abs });
    return this.getProject(dirName);
  }

  async cloneProject(url: string, name?: string): Promise<ProjectInfo> {
    if (!/^(https:\/\/|git@)[\w.@:/~-]+$/.test(url))
      throw new BadRequestError('Only https:// or git@ URLs are accepted');
    const dirName = slugify(
      name ||
        url
          .split('/')
          .pop()
          ?.replace(/\.git$/, '') ||
        'repo',
    );
    const abs = path.join(this.root, dirName);
    if (fs.existsSync(abs)) throw new ConflictError(`A project named "${dirName}" already exists`);
    const res = await runGit(this.root, ['clone', '--depth', '50', url, dirName], 300_000);
    if (res.code !== 0) throw new BadRequestError(`git clone failed: ${res.stderr.slice(-800)}`);
    this.repo.upsertProject({ id: dirName, name: dirName, path: abs });
    return this.getProject(dirName);
  }

  projectRoot(projectId: string): string {
    return this.getProject(projectId).path;
  }

  resolve(projectId: string, rel: string, opts: { allowProtected?: boolean } = {}): string {
    return resolveInside(this.projectRoot(projectId), rel, opts);
  }

  // ── listing ───────────────────────────────────────────────────────────
  private ignorer(root: string): Ignore {
    const gi = path.join(root, '.gitignore');
    let mtime = 0;
    try {
      mtime = fs.statSync(gi).mtimeMs;
    } catch {
      /* none */
    }
    const cached = this.ignoreCache.get(root);
    if (cached && cached.mtime === mtime) return cached.ig;
    const ig = ignore().add(DEFAULT_IGNORES);
    if (mtime) {
      try {
        ig.add(fs.readFileSync(gi, 'utf8'));
      } catch {
        /* unreadable */
      }
    }
    this.ignoreCache.set(root, { mtime, ig });
    return ig;
  }

  async listDir(projectId: string, rel = '', opts: { showIgnored?: boolean } = {}): Promise<FileEntry[]> {
    const root = this.projectRoot(projectId);
    const abs = resolveInside(root, rel, { allowProtected: true });
    const ig = this.ignorer(root);
    const entries = await fsp.readdir(abs, { withFileTypes: true });
    const out: FileEntry[] = [];
    for (const e of entries) {
      const childRel = toRelative(root, path.join(abs, e.name));
      const isDir = e.isDirectory();
      if (!opts.showIgnored && ig.ignores(isDir ? `${childRel}/` : childRel)) continue;
      let size: number;
      let mtime: number;
      try {
        const st = await fsp.stat(path.join(abs, e.name));
        size = st.size;
        mtime = st.mtimeMs;
      } catch {
        continue; // broken symlink
      }
      out.push({ name: e.name, path: childRel, type: isDir ? 'dir' : 'file', size, mtime });
    }
    return out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  }

  /** Recursive tree (bounded), used by the agent and the context engine. */
  async tree(projectId: string, rel = '', maxDepth = 3, maxEntries = 400): Promise<FileEntry[]> {
    let count = 0;
    const walk = async (dir: string, depth: number): Promise<FileEntry[]> => {
      const entries = await this.listDir(projectId, dir);
      const out: FileEntry[] = [];
      for (const e of entries) {
        if (count++ >= maxEntries) break;
        if (e.type === 'dir' && depth < maxDepth) out.push({ ...e, children: await walk(e.path, depth + 1) });
        else out.push(e);
      }
      return out;
    };
    return walk(rel, 1);
  }

  /** All non-ignored files (paths), bounded. */
  async allFiles(projectId: string, limit = 20_000): Promise<string[]> {
    const root = this.projectRoot(projectId);
    const ig = this.ignorer(root);
    const out: string[] = [];
    const walk = async (abs: string) => {
      if (out.length >= limit) return;
      let entries: fs.Dirent[];
      try {
        entries = await fsp.readdir(abs, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const childAbs = path.join(abs, e.name);
        const rel = toRelative(root, childAbs);
        if (ig.ignores(e.isDirectory() ? `${rel}/` : rel)) continue;
        if (e.isDirectory()) await walk(childAbs);
        else if (e.isFile()) out.push(rel);
        if (out.length >= limit) return;
      }
    };
    await walk(root);
    return out;
  }

  // ── reading ───────────────────────────────────────────────────────────
  async stat(projectId: string, rel: string): Promise<{ size: number; mtime: number; type: 'file' | 'dir' }> {
    const abs = this.resolve(projectId, rel);
    const st = await fsp.stat(abs).catch(() => {
      throw new NotFoundError(`Not found: ${rel}`);
    });
    return { size: st.size, mtime: st.mtimeMs, type: st.isDirectory() ? 'dir' : 'file' };
  }

  async readRaw(projectId: string, rel: string): Promise<Buffer> {
    const abs = this.resolve(projectId, rel);
    return fsp.readFile(abs).catch(() => {
      throw new NotFoundError(`File not found: ${rel}`);
    });
  }

  async readText(projectId: string, rel: string): Promise<string> {
    const abs = this.resolve(projectId, rel);
    const st = await fsp.stat(abs).catch(() => {
      throw new NotFoundError(`File not found: ${rel}`);
    });
    if (st.isDirectory()) throw new BadRequestError(`${rel} is a directory`);
    if (st.size > MAX_TEXT_BYTES)
      throw new BadRequestError(`${rel} is too large to edit as text (${st.size} bytes)`);
    const buf = await fsp.readFile(abs);
    if (isBinaryBuffer(buf)) throw new BadRequestError(`${rel} is a binary file`);
    return buf.toString('utf8');
  }

  async exists(projectId: string, rel: string): Promise<boolean> {
    try {
      await fsp.access(this.resolve(projectId, rel, { allowProtected: true }));
      return true;
    } catch {
      return false;
    }
  }

  // ── writing (every mutation is recorded as a revertable change) ───────
  private assertWritable(rel: string): void {
    const norm = rel.replace(/^[/\\]+/, '');
    if (norm === '.workbench' || norm.startsWith('.workbench/'))
      throw new BadRequestError('.workbench/ is managed by the workbench');
    if (isProtectedPath(norm)) throw new BadRequestError(`Protected path: ${rel}`);
  }

  private record(
    projectId: string,
    rel: string,
    op: ChangeRecord['op'],
    before: string | null,
    after: string | null,
    ctx: ChangeContext,
  ): ChangeRecord {
    const { added, removed } = op === 'move' ? { added: 0, removed: 0 } : countLineDiff(before, after);
    const change: ChangeRecord = {
      id: randomUUID(),
      runId: ctx.runId ?? null,
      sessionId: ctx.sessionId ?? null,
      projectId,
      path: rel,
      op,
      before,
      after,
      status: 'applied',
      createdAt: Date.now(),
      added,
      removed,
    };
    this.repo.addChange(change);
    if (ctx.runId) this.repo.incrementFilesChanged(ctx.runId);
    return change;
  }

  async writeFile(
    projectId: string,
    rel: string,
    content: string,
    ctx: ChangeContext = {},
  ): Promise<ChangeRecord> {
    this.assertWritable(rel);
    const abs = this.resolve(projectId, rel);
    let before: string | null = null;
    try {
      before = await this.readText(projectId, rel);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
    if (before !== null && containsRedaction(content) && !containsRedaction(before)) {
      throw new BadRequestError(
        'Refusing to write: content contains redaction placeholders ([REDACTED]). Use filesystem.edit for targeted changes.',
      );
    }
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, content, 'utf8');
    return this.record(
      projectId,
      toRelative(this.projectRoot(projectId), abs),
      'write',
      before,
      content,
      ctx,
    );
  }

  async writeBinary(projectId: string, rel: string, data: Buffer): Promise<string> {
    this.assertWritable(rel);
    const abs = this.resolve(projectId, rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, data);
    return toRelative(this.projectRoot(projectId), abs);
  }

  /** Exact string replacements, applied atomically (all or nothing). */
  async editFile(
    projectId: string,
    rel: string,
    edits: { oldText: string; newText: string; replaceAll?: boolean }[],
    ctx: ChangeContext = {},
  ): Promise<ChangeRecord> {
    this.assertWritable(rel);
    const before = await this.readText(projectId, rel);
    let content = before;
    edits.forEach((e, i) => {
      if (!e.oldText) throw new BadRequestError(`Edit #${i + 1}: oldText is empty`);
      if (containsRedaction(e.newText) && !containsRedaction(e.oldText))
        throw new BadRequestError(`Edit #${i + 1}: newText contains a redaction placeholder`);
      const count = content.split(e.oldText).length - 1;
      if (count === 0)
        throw new BadRequestError(
          `Edit #${i + 1}: oldText not found in ${rel}. Re-read the file and copy the exact text (including whitespace).`,
        );
      if (count > 1 && !e.replaceAll)
        throw new BadRequestError(
          `Edit #${i + 1}: oldText matches ${count} times in ${rel}. Add surrounding context to make it unique or set replaceAll.`,
        );
      content = e.replaceAll
        ? content.split(e.oldText).join(e.newText)
        : content.replace(e.oldText, () => e.newText);
    });
    if (content === before) throw new BadRequestError('Edits produce no change');
    await fsp.writeFile(this.resolve(projectId, rel), content, 'utf8');
    return this.record(projectId, rel.replace(/^[/\\]+/, ''), 'edit', before, content, ctx);
  }

  /** Deletes go to .workbench/trash so they can be reverted. */
  async deletePath(projectId: string, rel: string, ctx: ChangeContext = {}): Promise<ChangeRecord> {
    this.assertWritable(rel);
    const root = this.projectRoot(projectId);
    const abs = this.resolve(projectId, rel);
    const st = await fsp.stat(abs).catch(() => {
      throw new NotFoundError(`Not found: ${rel}`);
    });
    if (abs === fs.realpathSync(root)) throw new BadRequestError('Cannot delete the project root');
    let before: string | null = null;
    if (st.isFile() && st.size <= MAX_TEXT_BYTES) {
      const buf = await fsp.readFile(abs);
      if (!isBinaryBuffer(buf)) before = buf.toString('utf8');
    }
    const trashRel = `.workbench/trash/${Date.now()}-${randomUUID().slice(0, 8)}/${path.basename(abs)}`;
    const trashAbs = path.join(root, trashRel);
    await fsp.mkdir(path.dirname(trashAbs), { recursive: true });
    await fsp.rename(abs, trashAbs);
    const change = this.record(projectId, toRelative(root, abs), 'delete', before, null, ctx);
    // Sidecar file links the trashed entry to its change, so revert works after a restart.
    await fsp.writeFile(`${trashAbs}.__origin`, JSON.stringify({ changeId: change.id, path: change.path }));
    this.trashIndex.set(change.id, trashAbs);
    return change;
  }
  private trashIndex = new Map<string, string>();

  async movePath(
    projectId: string,
    from: string,
    to: string,
    ctx: ChangeContext = {},
  ): Promise<ChangeRecord> {
    this.assertWritable(from);
    this.assertWritable(to);
    const src = this.resolve(projectId, from);
    const dst = this.resolve(projectId, to);
    if (!fs.existsSync(src)) throw new NotFoundError(`Not found: ${from}`);
    if (fs.existsSync(dst)) throw new ConflictError(`Destination exists: ${to}`);
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.rename(src, dst);
    const root = this.projectRoot(projectId);
    return this.record(
      projectId,
      toRelative(root, src),
      'move',
      toRelative(root, src),
      toRelative(root, dst),
      ctx,
    );
  }

  async mkdir(projectId: string, rel: string): Promise<void> {
    this.assertWritable(rel);
    await fsp.mkdir(this.resolve(projectId, rel), { recursive: true });
  }

  // ── review: accept / revert ───────────────────────────────────────────
  acceptChange(changeId: string): ChangeRecord {
    const c = this.repo.getChange(changeId);
    if (!c) throw new NotFoundError('Change not found');
    this.repo.setChangeStatus(changeId, 'accepted');
    return { ...c, status: 'accepted' };
  }

  async revertChange(changeId: string): Promise<ChangeRecord> {
    const c = this.repo.getChange(changeId);
    if (!c) throw new NotFoundError('Change not found');
    if (c.status === 'reverted') return c;
    const root = this.projectRoot(c.projectId);
    if (c.op === 'write' || c.op === 'edit') {
      const abs = this.resolve(c.projectId, c.path);
      if (c.before === null) await fsp.rm(abs, { force: true });
      else await fsp.writeFile(abs, c.before, 'utf8');
    } else if (c.op === 'move') {
      const src = this.resolve(c.projectId, c.after ?? '');
      const dst = this.resolve(c.projectId, c.before ?? '');
      if (fs.existsSync(dst)) throw new ConflictError(`Cannot revert move: ${c.before} exists again`);
      await fsp.mkdir(path.dirname(dst), { recursive: true });
      await fsp.rename(src, dst);
    } else if (c.op === 'delete') {
      const trashAbs = this.trashIndex.get(c.id) ?? (await this.findTrash(root, c.id));
      const dst = this.resolve(c.projectId, c.path);
      if (trashAbs && fs.existsSync(trashAbs)) {
        if (fs.existsSync(dst)) throw new ConflictError(`Cannot restore: ${c.path} exists`);
        await fsp.mkdir(path.dirname(dst), { recursive: true });
        await fsp.rename(trashAbs, dst);
        await fsp.rm(`${trashAbs}.__origin`, { force: true });
      } else if (c.before !== null) {
        await fsp.writeFile(dst, c.before, 'utf8');
      } else throw new ConflictError('Deleted content is no longer available in the trash');
    }
    this.repo.setChangeStatus(changeId, 'reverted');
    return { ...c, status: 'reverted' };
  }

  private async findTrash(root: string, changeId: string): Promise<string | null> {
    const trashDir = path.join(root, '.workbench', 'trash');
    let dirs: string[];
    try {
      dirs = await fsp.readdir(trashDir);
    } catch {
      return null;
    }
    for (const d of dirs) {
      for (const f of await fsp.readdir(path.join(trashDir, d))) {
        if (!f.endsWith('.__origin')) continue;
        try {
          const meta = JSON.parse(await fsp.readFile(path.join(trashDir, d, f), 'utf8')) as {
            changeId: string;
          };
          if (meta.changeId === changeId) return path.join(trashDir, d, f.replace(/\.__origin$/, ''));
        } catch {
          /* ignore */
        }
      }
    }
    return null;
  }

  internalDir(projectId: string, sub: string): string {
    const dir = path.join(this.projectRoot(projectId), '.workbench', sub);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
}

export function runGit(
  cwd: string,
  args: string[],
  timeoutMs = 60_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', PAGER: 'cat', LC_ALL: 'C' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length < 5_000_000) stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < 200_000) stderr += d.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}
