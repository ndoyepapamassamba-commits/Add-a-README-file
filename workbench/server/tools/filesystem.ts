import fsp from 'node:fs/promises';
import { z } from 'zod';
import { defineTool, ok, ToolError, type AnyTool } from './types';
import { isDataFile } from '../services/dataEngine';
import { extractDocumentText, isDocument, isImage, mimeFor } from '../services/documents';
import { isBinaryBuffer } from '../services/workspace';
import { redactSecrets } from '../security/redact';

const MAX_LINES = 2000;
const MAX_LINE_CHARS = 2000;

function numbered(
  content: string,
  offset: number,
  limit: number,
): { text: string; total: number; shown: [number, number] } {
  const lines = content.split('\n');
  const start = Math.max(0, offset - 1);
  const slice = lines.slice(start, start + limit);
  const width = String(start + slice.length).length;
  const text = slice
    .map(
      (l, i) =>
        `${String(start + i + 1).padStart(width, ' ')}\t${l.length > MAX_LINE_CHARS ? `${l.slice(0, MAX_LINE_CHARS)}…[line truncated]` : l}`,
    )
    .join('\n');
  return { text, total: lines.length, shown: [start + 1, start + slice.length] };
}

async function readForModel(
  ctx: Parameters<AnyTool['execute']>[1],
  rel: string,
  offset = 1,
  limit = MAX_LINES,
) {
  const ws = ctx.services.workspace;
  const abs = ws.resolve(ctx.projectId, rel);
  const st = await fsp.stat(abs).catch(() => {
    throw new ToolError(`File not found: ${rel}`);
  });
  if (st.isDirectory()) throw new ToolError(`${rel} is a directory — use filesystem.list`);
  if (isImage(rel)) {
    if (st.size > 8 * 1024 * 1024) throw new ToolError('Image too large to view (>8MB)');
    if (ctx.modelSupportsVision && !rel.endsWith('.svg')) {
      const data = await fsp.readFile(abs);
      ctx.pendingImages.push({
        dataUrl: `data:${mimeFor(rel)};base64,${data.toString('base64')}`,
        caption: `Image file ${rel}`,
      });
      return {
        text: `[image ${rel} (${st.size} bytes) attached to your next message for viewing]`,
        meta: { kind: 'image', size: st.size },
      };
    }
    return {
      text: `[image ${rel}, ${st.size} bytes — the current model has no vision; describe needs to the user or switch to a vision model]`,
      meta: { kind: 'image', size: st.size },
    };
  }
  if (isDocument(rel) && !rel.endsWith('.html') && !rel.endsWith('.htm')) {
    const doc = await extractDocumentText(abs);
    const n = numbered(redactSecrets(doc.text), offset, limit);
    return {
      text: `[${doc.kind.toUpperCase()} text extracted${doc.pages ? `, ${doc.pages} pages` : ''}]\n${n.text}`,
      meta: { kind: doc.kind, totalLines: n.total, shown: n.shown },
    };
  }
  if (isDataFile(rel) && /\.(xlsx|xls|xlsm|ods)$/i.test(rel)) {
    throw new ToolError(`${rel} is a spreadsheet — use data.inspect / data.query to analyse it`);
  }
  if (st.size > 5 * 1024 * 1024)
    throw new ToolError(
      `${rel} is ${st.size} bytes; read a range with offset/limit is not possible above 5MB — use filesystem.search`,
    );
  const buf = await fsp.readFile(abs);
  if (isBinaryBuffer(buf))
    return { text: `[binary file ${rel}, ${st.size} bytes]`, meta: { kind: 'binary', size: st.size } };
  const n = numbered(redactSecrets(buf.toString('utf8')), offset, limit);
  const more =
    n.shown[1] < n.total
      ? `\n…[${n.total - n.shown[1]} more lines — call again with offset=${n.shown[1] + 1}]`
      : '';
  return { text: n.text + more, meta: { kind: 'text', totalLines: n.total, shown: n.shown } };
}

const pathArg = z.string().min(1).describe('Path relative to the project root');

export const filesystemTools: AnyTool[] = [
  defineTool({
    name: 'filesystem.list',
    description:
      'List a directory (recursive up to depth). Ignores node_modules, .git, build output and .gitignore entries.',
    schema: z.object({
      path: z.string().default('').describe('Directory relative to project root ("" = root)'),
      depth: z.number().int().min(1).max(6).default(2),
    }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => `List ${a.path || '.'}`,
    async execute(a, ctx) {
      const tree = await ctx.services.workspace.tree(ctx.projectId, a.path, a.depth, 600);
      const lines: string[] = [];
      const walk = (entries: typeof tree, indent: string) => {
        for (const e of entries) {
          lines.push(`${indent}${e.name}${e.type === 'dir' ? '/' : ` (${e.size}b)`}`);
          if (e.children) walk(e.children, `${indent}  `);
        }
      };
      walk(tree, '');
      return ok(
        `${lines.length} entries`,
        { entries: lines.length },
        { forModel: lines.join('\n') || '(empty directory)' },
      );
    },
  }),

  defineTool({
    name: 'filesystem.read',
    description:
      'Read a file with line numbers (format: "<n>\\t<line>"; the prefix is NOT part of the file). Reads up to 2000 lines; use offset/limit for more. Also extracts text from PDF, DOCX, PPTX and shows images to vision models.',
    schema: z.object({
      path: pathArg,
      offset: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(MAX_LINES).default(MAX_LINES),
    }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Read ${a.path}${a.offset > 1 ? `:${a.offset}` : ''}`,
    async execute(a, ctx) {
      const r = await readForModel(ctx, a.path, a.offset, a.limit);
      const shown = (r.meta as { shown?: [number, number] }).shown;
      return ok(shown ? `${shown[1] - shown[0] + 1} lines` : String(r.meta.kind), r.meta, {
        forModel: r.text,
      });
    },
  }),

  defineTool({
    name: 'filesystem.read_many',
    description:
      'Read several files at once (each up to 400 lines). Use to load related files in a single step.',
    schema: z.object({ paths: z.array(z.string().min(1)).min(1).max(12) }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Read ${a.paths.length} files`,
    async execute(a, ctx) {
      const parts: string[] = [];
      let okCount = 0;
      for (const p of a.paths) {
        try {
          const r = await readForModel(ctx, p, 1, 400);
          parts.push(`===== ${p} =====\n${r.text}`);
          okCount++;
        } catch (err) {
          parts.push(`===== ${p} =====\n[error: ${(err as Error).message}]`);
        }
      }
      return ok(`${okCount}/${a.paths.length} files`, { files: a.paths }, { forModel: parts.join('\n\n') });
    },
  }),

  defineTool({
    name: 'filesystem.write',
    description:
      'Create or overwrite a file with the full content. Prefer filesystem.edit for changes to existing files.',
    schema: z.object({ path: pathArg, content: z.string() }),
    readOnly: false,
    assess: () => ({ risk: 'write' }),
    label: (a) => `Write ${a.path}`,
    grantKey: () => 'filesystem.write',
    async preview(a, ctx) {
      let before = '';
      try {
        before = await ctx.services.workspace.readText(ctx.projectId, a.path);
      } catch {
        /* new file */
      }
      return { kind: 'diff', path: a.path, before, after: a.content };
    },
    async execute(a, ctx) {
      const change = await ctx.services.workspace.writeFile(ctx.projectId, a.path, a.content, {
        runId: ctx.runId,
        sessionId: ctx.sessionId,
      });
      ctx.emit({
        type: 'file_changed',
        changeId: change.id,
        path: change.path,
        op: 'write',
        added: change.added,
        removed: change.removed,
      });
      return ok(
        `${change.before === null ? 'Created' : 'Wrote'} ${change.path} (+${change.added} −${change.removed})`,
        { changeId: change.id },
        {
          attachments: [
            {
              kind: 'diff',
              changeId: change.id,
              path: change.path,
              added: change.added,
              removed: change.removed,
            },
          ],
          forModel: `${change.before === null ? 'Created' : 'Overwrote'} ${change.path} (${a.content.split('\n').length} lines).`,
        },
      );
    },
  }),

  defineTool({
    name: 'filesystem.edit',
    description:
      'Replace an exact text fragment in a file. old_text must match exactly once (include enough surrounding lines) unless replace_all is true. Read the file first.',
    schema: z.object({
      path: pathArg,
      old_text: z.string().min(1),
      new_text: z.string(),
      replace_all: z.boolean().default(false),
    }),
    readOnly: false,
    assess: () => ({ risk: 'write' }),
    label: (a) => `Edit ${a.path}`,
    grantKey: () => 'filesystem.write',
    async preview(a, ctx) {
      const before = await ctx.services.workspace.readText(ctx.projectId, a.path);
      const after = a.replace_all
        ? before.split(a.old_text).join(a.new_text)
        : before.replace(a.old_text, () => a.new_text);
      return { kind: 'diff', path: a.path, before, after };
    },
    async execute(a, ctx) {
      const change = await ctx.services.workspace.editFile(
        ctx.projectId,
        a.path,
        [{ oldText: a.old_text, newText: a.new_text, replaceAll: a.replace_all }],
        { runId: ctx.runId, sessionId: ctx.sessionId },
      );
      ctx.emit({
        type: 'file_changed',
        changeId: change.id,
        path: change.path,
        op: 'edit',
        added: change.added,
        removed: change.removed,
      });
      return ok(
        `Edited ${change.path} (+${change.added} −${change.removed})`,
        { changeId: change.id },
        {
          attachments: [
            {
              kind: 'diff',
              changeId: change.id,
              path: change.path,
              added: change.added,
              removed: change.removed,
            },
          ],
          forModel: `Edited ${change.path}: +${change.added} −${change.removed} lines.`,
        },
      );
    },
  }),

  defineTool({
    name: 'filesystem.multi_edit',
    description:
      'Apply several exact replacements to ONE file atomically (all succeed or none). Same rules as filesystem.edit for each edit.',
    schema: z.object({
      path: pathArg,
      edits: z
        .array(
          z.object({
            old_text: z.string().min(1),
            new_text: z.string(),
            replace_all: z.boolean().default(false),
          }),
        )
        .min(1)
        .max(50),
    }),
    readOnly: false,
    assess: () => ({ risk: 'write' }),
    label: (a) => `Edit ${a.path} (${a.edits.length} changes)`,
    grantKey: () => 'filesystem.write',
    async preview(a, ctx) {
      const before = await ctx.services.workspace.readText(ctx.projectId, a.path);
      let after = before;
      for (const e of a.edits)
        after = e.replace_all
          ? after.split(e.old_text).join(e.new_text)
          : after.replace(e.old_text, () => e.new_text);
      return { kind: 'diff', path: a.path, before, after };
    },
    async execute(a, ctx) {
      const change = await ctx.services.workspace.editFile(
        ctx.projectId,
        a.path,
        a.edits.map((e) => ({ oldText: e.old_text, newText: e.new_text, replaceAll: e.replace_all })),
        { runId: ctx.runId, sessionId: ctx.sessionId },
      );
      ctx.emit({
        type: 'file_changed',
        changeId: change.id,
        path: change.path,
        op: 'edit',
        added: change.added,
        removed: change.removed,
      });
      return ok(
        `Edited ${change.path} (+${change.added} −${change.removed})`,
        { changeId: change.id },
        {
          attachments: [
            {
              kind: 'diff',
              changeId: change.id,
              path: change.path,
              added: change.added,
              removed: change.removed,
            },
          ],
          forModel: `Applied ${a.edits.length} edits to ${change.path}: +${change.added} −${change.removed} lines.`,
        },
      );
    },
  }),

  defineTool({
    name: 'filesystem.delete',
    description: 'Delete a file or directory (moved to the workbench trash, revertable by the user).',
    schema: z.object({ path: pathArg }),
    readOnly: false,
    assess: () => ({ risk: 'delete' }),
    label: (a) => `Delete ${a.path}`,
    async preview(a) {
      return { kind: 'text', text: `Supprimer ${a.path} (récupérable depuis le panneau Modifications)` };
    },
    async execute(a, ctx) {
      const change = await ctx.services.workspace.deletePath(ctx.projectId, a.path, {
        runId: ctx.runId,
        sessionId: ctx.sessionId,
      });
      ctx.emit({
        type: 'file_changed',
        changeId: change.id,
        path: change.path,
        op: 'delete',
        added: 0,
        removed: change.removed,
      });
      return ok(`Deleted ${change.path}`, { changeId: change.id });
    },
  }),

  defineTool({
    name: 'filesystem.move',
    description: 'Move or rename a file/directory inside the project.',
    schema: z.object({ from: pathArg, to: pathArg }),
    readOnly: false,
    assess: () => ({ risk: 'write' }),
    label: (a) => `Move ${a.from} → ${a.to}`,
    grantKey: () => 'filesystem.write',
    async execute(a, ctx) {
      const change = await ctx.services.workspace.movePath(ctx.projectId, a.from, a.to, {
        runId: ctx.runId,
        sessionId: ctx.sessionId,
      });
      ctx.emit({ type: 'file_changed', changeId: change.id, path: a.to, op: 'move', added: 0, removed: 0 });
      return ok(`Moved ${a.from} → ${a.to}`, { changeId: change.id });
    },
  }),

  defineTool({
    name: 'filesystem.search',
    description:
      'Search file contents (ripgrep). Literal by default; set regex=true for a regular expression. Returns path:line:text.',
    schema: z.object({
      pattern: z.string().min(1),
      regex: z.boolean().default(false),
      glob: z.string().optional().describe('Filter files, e.g. "*.ts" or "src/**"'),
      path: z.string().optional().describe('Sub-directory to search'),
      case_sensitive: z.boolean().default(false),
      max_results: z.number().int().min(1).max(500).default(80),
    }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Search "${a.pattern}"${a.glob ? ` in ${a.glob}` : ''}`,
    async execute(a, ctx) {
      const res = await ctx.services.index.grep(ctx.projectId, a.pattern, {
        regex: a.regex,
        glob: a.glob,
        path: a.path,
        caseSensitive: a.case_sensitive,
        maxResults: a.max_results,
      });
      const text = res.matches.map((m) => `${m.path}:${m.line}: ${redactSecrets(m.text)}`).join('\n');
      return ok(
        `${res.matches.length}${res.truncated ? '+' : ''} matches`,
        { count: res.matches.length },
        { forModel: text || 'No matches.' },
      );
    },
  }),

  defineTool({
    name: 'filesystem.glob',
    description: 'Find files by glob pattern, e.g. "**/*.tsx", "src/**/test*.ts".',
    schema: z.object({ pattern: z.string().min(1) }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Glob ${a.pattern}`,
    async execute(a, ctx) {
      const files = await ctx.services.index.glob(ctx.projectId, a.pattern);
      return ok(
        `${files.length} files`,
        { count: files.length },
        { forModel: files.join('\n') || 'No files match.' },
      );
    },
  }),
];
