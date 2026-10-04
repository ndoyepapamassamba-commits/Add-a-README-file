import fsp from 'node:fs/promises';
import path from 'node:path';
import type { AgentMode, PermissionMode } from '@shared/types';
import type { ChatMessage, ContentPart } from '../llm/types';
import { MODE_DESCRIPTIONS } from '../security/permissions';
import { redactSecrets } from '../security/redact';
import type { Services } from '../services/container';
import { extractDocumentText, isDocument, isImage, mimeFor } from '../services/documents';
import { isDataFile } from '../services/dataEngine';
import { isBinaryBuffer } from '../services/workspace';
import { profileToText } from '../tools/data';
import type { RoleProfile } from './roles';

export interface UiContext {
  openFile?: string;
  selection?: { text: string; startLine: number; endLine: number };
  dataset?: string;
  browserUrl?: string;
}

/**
 * System prompt: deliberately stable across runs of a session (role + mode +
 * project memory) so providers can cache it. Per-request context goes into
 * the user message instead.
 */
export function buildSystemPrompt(opts: {
  role: RoleProfile;
  permissionMode: PermissionMode;
  projectName: string;
  contextMd: string;
  python: boolean;
  maxRetries: number;
  toolNames: string[];
  skillsCatalog?: { name: string; description: string }[];
  activeSkills?: { name: string; body: string; files: string[] }[];
  customAgents?: { id: string; description: string }[];
  plugins?: { name: string; instructions?: string; tools: number; description?: string }[];
  jev?: boolean;
}): string {
  const has = (t: string) => opts.toolNames.includes(t);
  const lines = [
    `${opts.role.prompt}`,
    `You work inside "OpenRouter AI Workbench" on the project "${opts.projectName}". All tool paths are relative to the project root.`,
    '',
    '# Environment',
    `- OS: Linux, shell: bash${opts.python ? ', python3 available' : ''}, Node.js available.`,
    `- Permission mode: ${MODE_DESCRIPTIONS[opts.permissionMode]}`,
    '- Some tool calls pause for user approval. If the user denies one, do not retry it identically: adapt or ask.',
    '- Secrets (.env, keys, tokens) are deliberately inaccessible and redacted. Never try to read, print or exfiltrate them.',
    '',
    '# How to work',
    '- Understand before acting: locate code with filesystem.search / filesystem.glob, read the relevant files, then change them. Never edit a file you have not read in this task.',
    '- Batch independent read-only tool calls in the same step — they run in parallel. Prefer filesystem.read_many over many single reads.',
  ];
  if (has('plan.update'))
    lines.push(
      '- For any task with 3 or more steps, keep a live checklist with plan.update (exactly one step in_progress; mark steps done immediately).',
    );
  if (has('filesystem.edit'))
    lines.push(
      '- Modify files with filesystem.edit / filesystem.multi_edit (exact text). Use filesystem.write only for new files or complete rewrites. Keep changes minimal and consistent with the existing style.',
    );
  if (has('terminal.execute'))
    lines.push(
      `- Verify your work: run the project's build/tests/linters when they exist. If something fails, read the error, fix the root cause and re-run — up to ${opts.maxRetries + 2} attempts — before reporting. Never claim success without evidence.`,
      '- Long-running servers/watchers: terminal.execute with background=true, then terminal.output to read logs.',
    );
  if (has('browser.open'))
    lines.push(
      '- Web UIs: start the app, open it with browser.open, check browser.console for errors and take a browser.screenshot to confirm the result. Interact using element refs from snapshots.',
    );
  if (has('web.search'))
    lines.push(
      '- Use web.search / web.fetch for information lookup; use browser.* only to interact with websites.',
    );
  if (has('data.inspect'))
    lines.push(
      '- Data files (CSV/XLSX/JSON): data.inspect first, then data.query; chart with visualization.create. Every number you report must come from the data.',
    );
  if (has('memory.add'))
    lines.push(
      '- Record durable project knowledge (architecture, conventions, decisions, known errors, user instructions) with memory.add — sparingly, only what will help future tasks.',
    );
  if (has('artifact.create'))
    lines.push(
      '- Deliver reports, exports and generated documents with artifact.create so the user can preview/download them.',
    );
  if (has('agent.delegate'))
    lines.push(
      '- agent.delegate runs a specialised sub-agent with fresh context. Give it a complete, self-contained brief.',
    );
  lines.push(
    '- Destructive or irreversible actions (deleting data, git history rewrites, publishing, pushing) require an explicit user request.',
    '',
    '# Answer style',
    "- Reply in the user's language. Be concise and concrete; use Markdown (code blocks, short lists).",
    '- Final answer: what was done, files changed, verification performed and its result, remaining issues or next steps.',
  );
  if (opts.jev) {
    lines.push(
      '- jev.judge (TypeSafe Jev) gives fast calibrated typed judgments (yes/no probability, choice among options, score on a scale). Prefer it over free-form reasoning when you must classify, triage, verify claims against evidence or score many items consistently; keep calculations and exact rules in code.',
    );
  }
  if (opts.plugins?.length) {
    lines.push(
      '',
      '# Plugins (MCP servers connected)',
      "Use the matching mcp__<server>__<tool> tools whenever the user asks for something these applications do (e.g. 3D work in Blender, designs in Canva). Respect each plugin's instructions below.",
    );
    for (const p of opts.plugins) {
      lines.push(`## ${p.name} (${p.tools} tools)${p.description ? ` — ${p.description}` : ''}`);
      if (p.instructions) lines.push(p.instructions.slice(0, 2500));
    }
  }
  if (opts.customAgents?.length) {
    lines.push(
      '',
      '# Custom agents available for agent.delegate',
      ...opts.customAgents.slice(0, 40).map((a) => `- ${a.id}: ${a.description.slice(0, 200)}`),
    );
  }
  if (opts.skillsCatalog?.length && has('skill.use')) {
    lines.push(
      '',
      '# Skills',
      'Skills are expert playbooks written by the user. If a request matches a skill description below and that skill is not already active, call skill.use(name) FIRST, then follow it strictly.',
      ...opts.skillsCatalog.slice(0, 80).map((k) => `- ${k.name}: ${k.description.slice(0, 260)}`),
    );
  }
  if (opts.contextMd.trim())
    lines.push('', '# Project memory (PROJECT_CONTEXT.md)', redactSecrets(opts.contextMd.slice(0, 12_000)));
  if (opts.activeSkills?.length) {
    lines.push(
      '',
      '# ACTIVE SKILLS — MANDATORY',
      'The skills below are active for this request. You MUST follow their instructions exactly: workflow, questions to ask, output structure, tone, language and constraints. They take precedence over your default behaviour and the general style rules above. Only safety rules and the permission system override them.',
    );
    for (const sk of opts.activeSkills) {
      lines.push(
        `<skill name="${sk.name}">`,
        sk.body.slice(0, 30_000),
        sk.files.length ? `\nBundled files (read with skill.read): ${sk.files.slice(0, 60).join(', ')}` : '',
        '</skill>',
      );
    }
  }
  return lines.join('\n');
}

export const PLAN_MODE_INSTRUCTIONS = [
  '# PLAN MODE',
  'You are in planning mode. Inspect the project with read-only tools as needed, then call plan.propose with a short summary and concrete, verifiable steps.',
  'Do NOT modify files or run modifying commands before the plan is approved.',
].join('\n');

/** Builds the user turn: request + per-request context + attachments. */
export async function buildUserContent(opts: {
  services: Services;
  projectId: string;
  text: string;
  attachments: string[];
  ui?: UiContext;
  vision: boolean;
  isFirstRun: boolean;
  agentMode: AgentMode;
}): Promise<{ content: string | ContentPart[]; attachmentNotes: string[] }> {
  const { services, projectId } = opts;
  const blocks: string[] = [];
  const images: ContentPart[] = [];
  const notes: string[] = [];

  if (opts.isFirstRun) {
    try {
      const a = await services.index.analyze(projectId);
      blocks.push(
        `<project_overview>\nfiles: ${a.fileCount}; languages: ${
          a.languages
            .slice(0, 6)
            .map((l) => l.language)
            .join(', ') || 'n/a'
        }; frameworks: ${a.frameworks.join(', ') || 'none'}; scripts: ${Object.keys(a.scripts).join(', ') || 'none'}; tests: ${a.testFrameworks.join(', ') || 'none'}\ntop level: ${a.topLevel.slice(0, 40).join('  ')}\n</project_overview>`,
      );
    } catch {
      /* empty project */
    }
  }
  try {
    const rel = await services.index.relevantFiles(projectId, opts.text, 8);
    if (rel.length)
      blocks.push(
        `<possibly_relevant_files>\n${rel.map((r) => r.path).join('\n')}\n</possibly_relevant_files>`,
      );
  } catch {
    /* best effort */
  }
  const ui = opts.ui;
  if (ui?.openFile) {
    let sel = '';
    if (ui.selection?.text)
      sel = `\nselected lines ${ui.selection.startLine}-${ui.selection.endLine}:\n\`\`\`\n${redactSecrets(ui.selection.text.slice(0, 20_000))}\n\`\`\``;
    blocks.push(`<editor_context>\nopen file: ${ui.openFile}${sel}\n</editor_context>`);
  }
  if (ui?.dataset) blocks.push(`<active_dataset>${ui.dataset}</active_dataset>`);
  if (ui?.browserUrl) blocks.push(`<browser_page>${ui.browserUrl}</browser_page>`);

  for (const rel of opts.attachments.slice(0, 20)) {
    let abs: string;
    try {
      abs = services.workspace.resolve(projectId, rel);
    } catch (err) {
      notes.push(`${rel}: ${(err as Error).message}`);
      continue;
    }
    try {
      const st = await fsp.stat(abs);
      if (isImage(rel) && !rel.endsWith('.svg')) {
        if (opts.vision && st.size <= 8 * 1024 * 1024) {
          const data = await fsp.readFile(abs);
          images.push({
            type: 'image_url',
            image_url: { url: `data:${mimeFor(rel)};base64,${data.toString('base64')}` },
          });
          blocks.push(`<attachment path="${rel}" kind="image">(image attached below)</attachment>`);
        } else {
          blocks.push(
            `<attachment path="${rel}" kind="image">The selected model cannot see images (no vision). Tell the user to pick a vision model if the image matters.</attachment>`,
          );
          notes.push(`${rel}: modèle sans vision`);
        }
      } else if (isDataFile(rel)) {
        const ds = await services.data.load(abs);
        const prof = services.data.profile(ds);
        blocks.push(
          `<attachment path="${rel}" kind="data">\n${profileToText({ ...prof, path: rel })}\n</attachment>`,
        );
      } else if (isDocument(rel)) {
        const doc = await extractDocumentText(abs);
        const text = redactSecrets(doc.text);
        blocks.push(
          `<attachment path="${rel}" kind="${doc.kind}"${doc.pages ? ` pages="${doc.pages}"` : ''}>\n${text.slice(0, 40_000)}${text.length > 40_000 ? '\n…[truncated — use filesystem.read with offset for more]' : ''}\n</attachment>`,
        );
      } else if (st.size <= 400_000) {
        const buf = await fsp.readFile(abs);
        if (isBinaryBuffer(buf)) blocks.push(`<attachment path="${rel}" kind="binary" size="${st.size}"/>`);
        else
          blocks.push(
            `<attachment path="${rel}" kind="text">\n${redactSecrets(buf.toString('utf8')).slice(0, 40_000)}\n</attachment>`,
          );
      } else
        blocks.push(
          `<attachment path="${rel}" kind="file" size="${st.size}">Large file — read it with tools if needed.</attachment>`,
        );
    } catch (err) {
      blocks.push(`<attachment path="${rel}" error="${(err as Error).message.replace(/"/g, "'")}"/>`);
    }
  }

  const contextText = blocks.length ? `${blocks.join('\n')}\n\n` : '';
  const text = `${contextText}${opts.text}`;
  if (!images.length) return { content: text, attachmentNotes: notes };
  return { content: [{ type: 'text', text }, ...images], attachmentNotes: notes };
}

// ── history management ───────────────────────────────────────────────
export function estimateTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') chars += m.content.length;
    else if (Array.isArray(m.content))
      for (const p of m.content) chars += p.type === 'text' ? p.text.length : 3000;
    if (m.tool_calls) chars += JSON.stringify(m.tool_calls).length;
  }
  return Math.ceil(chars / 3.6);
}

/** Ensures every assistant tool call has a matching tool result (e.g. after a crash). */
export function repairHistory(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    out.push(m);
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const answered = new Set<string>();
      let j = i + 1;
      while (j < messages.length && messages[j]!.role === 'tool') {
        answered.add(messages[j]!.tool_call_id ?? '');
        out.push(messages[j]!);
        j++;
      }
      for (const tc of m.tool_calls) {
        if (!answered.has(tc.id))
          out.push({ role: 'tool', tool_call_id: tc.id, content: 'Tool call interrupted (no result).' });
      }
      i = j - 1;
    }
  }
  return out;
}

/** Shrinks old tool outputs first (cheap, keeps the conversation structure). */
export function elideOldToolOutputs(
  messages: ChatMessage[],
  keepLast = 8,
  maxChars = 400,
): { messages: ChatMessage[]; elided: number } {
  const toolIdx = messages.map((m, i) => (m.role === 'tool' ? i : -1)).filter((i) => i >= 0);
  const toElide = new Set(toolIdx.slice(0, Math.max(0, toolIdx.length - keepLast)));
  let elided = 0;
  const out = messages.map((m, i) => {
    if (!toElide.has(i) || typeof m.content !== 'string' || m.content.length <= maxChars) return m;
    elided++;
    return { ...m, content: `${m.content.slice(0, maxChars)}\n…[older tool output elided to save context]` };
  });
  return { messages: out, elided };
}

/** Index where a "turn" (user message) starts, so we never split tool-call pairs. */
export function turnBoundaries(messages: ChatMessage[]): number[] {
  return messages.map((m, i) => (m.role === 'user' ? i : -1)).filter((i) => i >= 0);
}

export function transcriptForSummary(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const c =
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map((p) => (p.type === 'text' ? p.text : '[image]')).join(' ')
            : '';
      const calls = m.tool_calls
        ?.map((t) => `${t.function.name}(${t.function.arguments.slice(0, 200)})`)
        .join(', ');
      return `[${m.role}] ${c.slice(0, 2000)}${calls ? ` {calls: ${calls}}` : ''}`;
    })
    .join('\n')
    .slice(0, 120_000);
}

export function basenameList(paths: string[]): string {
  return paths.map((p) => path.basename(p)).join(', ');
}
