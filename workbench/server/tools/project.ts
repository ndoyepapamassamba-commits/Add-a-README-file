import { z } from 'zod';
import { MEMORY_CATEGORIES } from '../services/memory';
import { ARTIFACT_TYPES } from '../services/artifacts';
import { redactSecrets } from '../security/redact';
import { defineTool, ok, ToolError, type AnyTool } from './types';

export const projectTools: AnyTool[] = [
  defineTool({
    name: 'project.analyze',
    description: 'Analyse the project: languages, frameworks, package managers, scripts, test frameworks, entry points, notable files, top-level layout, README excerpt.',
    schema: z.object({ refresh: z.boolean().default(false) }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: () => 'Analyze project',
    async execute(a, ctx) {
      const r = await ctx.services.index.analyze(ctx.projectId, a.refresh);
      const text = [
        `Files: ${r.fileCount} (${(r.totalBytes / 1024).toFixed(0)} KB)`,
        `Languages: ${r.languages.map((l) => `${l.language} (${l.files})`).join(', ') || 'n/a'}`,
        `Frameworks: ${r.frameworks.join(', ') || 'none detected'}`,
        `Package managers: ${r.packageManagers.join(', ') || 'none'}`,
        `Tests: ${r.testFrameworks.join(', ') || 'none detected'}`,
        `Scripts: ${Object.entries(r.scripts).map(([k, v]) => `${k}=${v}`).join(' | ') || 'none'}`,
        `Entry points: ${r.entryPoints.join(', ') || 'unknown'}`,
        `Notable files: ${r.notableFiles.join(', ') || 'none'}`,
        `Top level: ${r.topLevel.join('  ')}`,
        r.readmeExcerpt ? `\nREADME excerpt:\n${r.readmeExcerpt}` : '',
      ].join('\n');
      return ok(`${r.fileCount} files · ${r.languages[0]?.language ?? 'n/a'}`, r, { forModel: text });
    },
  }),
  defineTool({
    name: 'git.status',
    description: 'Git status: current branch, ahead/behind, changed and untracked files.',
    schema: z.object({}),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: () => 'git status',
    async execute(_a, ctx) {
      const s = await ctx.services.git.status(ctx.services.workspace.projectRoot(ctx.projectId));
      if (!s.isRepo) return ok('not a git repository', s, { forModel: 'Not a git repository.' });
      return ok(`${s.branch} · ${s.files.length} changed`, s, { forModel: `Branch ${s.branch} (ahead ${s.ahead}, behind ${s.behind})\n${s.files.map((f) => `${f.status.padEnd(10)} ${f.path}`).join('\n') || 'Working tree clean.'}` });
    },
  }),
  defineTool({
    name: 'git.diff',
    description: 'Unified diff of working tree changes (or staged with staged=true), optionally for one path.',
    schema: z.object({ path: z.string().optional(), staged: z.boolean().default(false) }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => `git diff${a.path ? ` ${a.path}` : ''}`,
    async execute(a, ctx) {
      const d = redactSecrets(await ctx.services.git.diff(ctx.services.workspace.projectRoot(ctx.projectId), { path: a.path, staged: a.staged }));
      return ok(`${d.split('\n').length} lines`, { lines: d.split('\n').length }, { forModel: d.length > 40_000 ? `${d.slice(0, 40_000)}\n…[diff truncated]` : d || 'No changes.' });
    },
  }),
  defineTool({
    name: 'git.log',
    description: 'Recent commits (hash, author, date, subject).',
    schema: z.object({ limit: z.number().int().min(1).max(100).default(15) }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: () => 'git log',
    async execute(a, ctx) {
      const log = await ctx.services.git.log(ctx.services.workspace.projectRoot(ctx.projectId), a.limit);
      return ok(`${log.length} commits`, log, { forModel: log.map((c) => `${c.hash.slice(0, 8)} ${c.date.slice(0, 16)} ${c.author}: ${c.subject}`).join('\n') || 'No commits.' });
    },
  }),
  defineTool({
    name: 'git.commit',
    description: 'Stage files (all changes by default) and create a commit. Never pushes.',
    schema: z.object({ message: z.string().min(3).max(2000), files: z.array(z.string()).optional() }),
    readOnly: false,
    assess: () => ({ risk: 'vcs_write' }),
    label: (a) => `git commit "${a.message.split('\n')[0]!.slice(0, 60)}"`,
    async preview(a) {
      return { kind: 'text', text: `Commit : ${a.message}\nFichiers : ${a.files?.join(', ') ?? 'toutes les modifications'}` };
    },
    async execute(a, ctx) {
      const root = ctx.services.workspace.projectRoot(ctx.projectId);
      if (!ctx.services.git.isRepo(root)) throw new ToolError('Not a git repository');
      const r = await ctx.services.git.commit(root, a.message, a.files);
      return ok(`${r.hash.slice(0, 8)} ${a.message.split('\n')[0]}`, r);
    },
  }),
  defineTool({
    name: 'memory.read',
    description: 'Read the project memory (PROJECT_CONTEXT.md + structured facts).',
    schema: z.object({}),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: () => 'Read memory',
    async execute(_a, ctx) {
      const facts = await ctx.services.memory.facts(ctx.projectId);
      const md = await ctx.services.memory.contextMarkdown(ctx.projectId);
      return ok(`${facts.length} facts`, { facts }, { forModel: `${md || '(no PROJECT_CONTEXT.md)'}\n\nFacts:\n${facts.map((f) => `- [${f.id}] (${f.category}) ${f.text}`).join('\n') || '(none)'}` });
    },
  }),
  defineTool({
    name: 'memory.add',
    description:
      'Remember a durable project fact for future tasks (architecture, convention, important_file, decision, instruction, known_error, context). Keep it short and factual. Mirrored into PROJECT_CONTEXT.md.',
    schema: z.object({ category: z.enum(MEMORY_CATEGORIES), text: z.string().min(3).max(1000) }),
    readOnly: false,
    assess: () => ({ risk: 'write_internal' }),
    label: (a) => `Remember (${a.category})`,
    async execute(a, ctx) {
      const f = await ctx.services.memory.add(ctx.projectId, a.category, a.text);
      return ok(`Saved ${f.id}`, f);
    },
  }),
  defineTool({
    name: 'memory.remove',
    description: 'Forget a project memory fact by id.',
    schema: z.object({ id: z.string().min(1) }),
    readOnly: false,
    assess: () => ({ risk: 'write_internal' }),
    label: (a) => `Forget ${a.id}`,
    async execute(a, ctx) {
      if (!(await ctx.services.memory.remove(ctx.projectId, a.id))) throw new ToolError('Unknown fact id');
      return ok('Removed');
    },
  }),
  defineTool({
    name: 'artifact.create',
    description:
      'Produce a deliverable shown in the Artifacts panel (preview/download): html, css, js, json, csv, xlsx, pdf, md, zip, svg, txt… For pdf, give Markdown or HTML content (rendered by the browser). For csv/xlsx give columns+rows. For zip give files [{path, content} or {path, from_project}]. Use from_path to publish an existing project file.',
    schema: z.object({
      name: z.string().min(1).max(120),
      type: z.enum(ARTIFACT_TYPES),
      content: z.string().optional(),
      from_path: z.string().optional(),
      columns: z.array(z.string()).optional(),
      rows: z.array(z.record(z.string(), z.unknown())).optional(),
      files: z.array(z.object({ path: z.string(), content: z.string().optional(), from_project: z.string().optional() })).optional(),
    }),
    readOnly: false,
    assess: () => ({ risk: 'write_internal' }),
    label: (a) => `Artifact ${a.name}.${a.type}`,
    async execute(a, ctx) {
      const base = { projectId: ctx.projectId, sessionId: ctx.sessionId, runId: ctx.runId, name: a.name };
      let rec;
      if (a.type === 'zip') {
        if (!a.files?.length) throw new ToolError('zip needs files');
        rec = await ctx.services.artifacts.createZip({ ...base, files: a.files.map((f) => ({ path: f.path, content: f.content, fromProject: f.from_project })) });
      } else if ((a.type === 'csv' || a.type === 'xlsx') && a.rows) {
        const columns = a.columns ?? [...new Set(a.rows.flatMap((r) => Object.keys(r)))];
        rec = await ctx.services.artifacts.create({ ...base, type: a.type, content: ctx.services.data.exportRows(columns, a.rows, a.type) });
      } else if (a.from_path) {
        rec = await ctx.services.artifacts.create({ ...base, type: a.type, content: await ctx.services.workspace.readRaw(ctx.projectId, a.from_path) });
      } else if (a.content !== undefined) {
        rec = await ctx.services.artifacts.create({ ...base, type: a.type, content: a.content });
      } else throw new ToolError('Provide content, from_path, rows or files');
      return ok(`${rec.name} (${rec.size} bytes)`, { artifactId: rec.id }, {
        attachments: [{ kind: 'artifact', artifactId: rec.id, name: rec.name, type: rec.type }],
        forModel: `Artifact created: ${rec.name} (id ${rec.id}, ${rec.size} bytes). The user can preview and download it.`,
      });
    },
  }),
];
