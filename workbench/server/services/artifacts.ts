import { printableHtml } from './officeCore';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { marked } from 'marked';
import type { Repo, ArtifactRecord } from '../db/repo';
import type { WorkspaceService } from './workspace';
import { NotFoundError, BadRequestError } from './workspace';
import { sanitizeFilename } from './browserManager';

export const ARTIFACT_TYPES = [
  'html',
  'css',
  'js',
  'json',
  'csv',
  'xlsx',
  'pdf',
  'md',
  'zip',
  'png',
  'jpg',
  'svg',
  'txt',
  'chart',
  'py',
  'ts',
  'xml',
  'yaml',
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

const EXT: Record<string, string> = { chart: 'json', md: 'md', jpg: 'jpg' };

/** Markdown → printable page in the house style (navy band, lime filets, navy table headers). */
export function markdownToHtml(md: string, title: string): string {
  return printableHtml(title, marked.parse(md, { async: false }) as string);
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** Artifacts are files produced by agents, stored under <project>/.workbench/artifacts. */
export class ArtifactService {
  constructor(
    private readonly repo: Repo,
    private readonly workspace: WorkspaceService,
    private readonly pdfRenderer: (html: string) => Promise<Buffer>,
  ) {}

  async create(opts: {
    projectId: string;
    sessionId?: string | null;
    runId?: string | null;
    name: string;
    type: ArtifactType;
    content: string | Buffer;
    meta?: Record<string, unknown>;
  }): Promise<ArtifactRecord> {
    const dir = this.workspace.internalDir(opts.projectId, 'artifacts');
    const id = randomUUID();
    const ext = EXT[opts.type] ?? opts.type;
    let base = sanitizeFilename(opts.name.replace(/\.[a-z0-9]+$/i, ''));
    if (!base) base = 'artifact';
    const file = path.join(dir, `${id.slice(0, 8)}-${base}.${ext}`);
    let data: Buffer;
    if (opts.type === 'pdf' && typeof opts.content === 'string') {
      // Markdown or HTML source rendered to PDF with the headless browser.
      const html = /^\s*<(!doctype|html)/i.test(opts.content)
        ? opts.content
        : markdownToHtml(opts.content, opts.name);
      data = await this.pdfRenderer(html);
    } else data = typeof opts.content === 'string' ? Buffer.from(opts.content, 'utf8') : opts.content;
    await fsp.writeFile(file, data);
    const rec: ArtifactRecord = {
      id,
      projectId: opts.projectId,
      sessionId: opts.sessionId ?? null,
      runId: opts.runId ?? null,
      name: `${base}.${ext}`,
      type: opts.type,
      path: path.relative(this.workspace.projectRoot(opts.projectId), file).split(path.sep).join('/'),
      size: data.length,
      createdAt: Date.now(),
      meta: opts.meta ?? {},
    };
    this.repo.addArtifact(rec);
    return rec;
  }

  async createZip(opts: {
    projectId: string;
    sessionId?: string | null;
    runId?: string | null;
    name: string;
    files: { path: string; content?: string; fromProject?: string }[];
  }): Promise<ArtifactRecord> {
    const entries: Record<string, Uint8Array> = {};
    for (const f of opts.files) {
      const name = f.path.replace(/^[/\\]+/, '').replace(/\.\.(\/|\\)/g, '');
      if (f.fromProject) {
        const abs = this.workspace.resolve(opts.projectId, f.fromProject);
        const st = await fsp.stat(abs);
        if (st.isDirectory()) {
          for (const rel of await this.workspace.allFiles(opts.projectId)) {
            if (rel.startsWith(`${f.fromProject.replace(/\/$/, '')}/`)) {
              entries[path.posix.join(name, rel.slice(f.fromProject.replace(/\/$/, '').length + 1))] =
                new Uint8Array(await fsp.readFile(this.workspace.resolve(opts.projectId, rel)));
            }
          }
        } else entries[name] = new Uint8Array(await fsp.readFile(abs));
      } else entries[name] = strToU8(f.content ?? '');
    }
    if (!Object.keys(entries).length) throw new BadRequestError('ZIP would be empty');
    return this.create({ ...opts, type: 'zip', content: Buffer.from(zipSync(entries, { level: 6 })) });
  }

  get(id: string): ArtifactRecord {
    const a = this.repo.getArtifact(id);
    if (!a) throw new NotFoundError('Artifact not found');
    return a;
  }

  absPath(a: ArtifactRecord): string {
    return path.join(this.workspace.projectRoot(a.projectId), a.path);
  }

  async read(id: string): Promise<{ record: ArtifactRecord; data: Buffer }> {
    const record = this.get(id);
    const abs = this.absPath(record);
    if (!fs.existsSync(abs)) throw new NotFoundError('Artifact file is missing');
    return { record, data: await fsp.readFile(abs) };
  }

  async saveToProject(id: string, destRel: string): Promise<string> {
    const { record, data } = await this.read(id);
    return this.workspace.writeBinary(record.projectId, destRel || record.name, data);
  }

  async remove(id: string): Promise<void> {
    const a = this.get(id);
    await fsp.rm(this.absPath(a), { force: true });
    this.repo.deleteArtifact(id);
  }
}
