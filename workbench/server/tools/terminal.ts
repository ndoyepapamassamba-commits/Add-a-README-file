import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { classifyCommand, commandGrantKey } from '../security/commandPolicy';
import { defineTool, ok, ToolError, type AnyTool } from './types';
import type { CommandResult } from '../services/processManager';

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, Math.floor(max * 0.3));
  const tail = text.slice(-Math.floor(max * 0.7));
  return `${head}\n…[${text.length - max} chars omitted]…\n${tail}`;
}

export function formatCommandResult(r: CommandResult, max = 24_000): string {
  const parts = [
    `$ ${r.command}`,
    `exit code: ${r.exitCode ?? 'n/a'} · status: ${r.status} · ${r.durationMs ?? 0} ms${r.ports.length ? ` · ports: ${r.ports.join(', ')}` : ''}`,
  ];
  if (r.stdout.trim()) parts.push(`--- stdout ---\n${clip(r.stdout.trimEnd(), max)}`);
  if (r.stderr.trim()) parts.push(`--- stderr ---\n${clip(r.stderr.trimEnd(), Math.floor(max / 2))}`);
  if (r.status === 'timeout')
    parts.push('The command timed out and was killed. Use background=true for servers/watchers.');
  return parts.join('\n');
}

export const terminalTools: AnyTool[] = [
  defineTool({
    name: 'terminal.execute',
    description:
      'Run a shell command (bash) in the project directory. Non-interactive (stdin closed, CI=1). Use background=true for long-running servers (returns after a few seconds with initial output; ports are detected). Secrets are not available in the environment.',
    schema: z.object({
      command: z.string().min(1).max(8000),
      cwd: z.string().default('').describe('Sub-directory relative to the project root'),
      timeout_sec: z.number().int().min(1).max(1800).optional(),
      background: z.boolean().default(false),
    }),
    readOnly: false,
    assess: (a) => {
      const c = classifyCommand(a.command);
      return { risk: 'execute', commandLevel: c.level, reasons: c.reasons };
    },
    label: (a) =>
      `${a.background ? 'Start' : 'Run'} ${a.command.length > 80 ? `${a.command.slice(0, 80)}…` : a.command}`,
    grantKey: (a) => `terminal:${commandGrantKey(a.command)}`,
    async preview(a) {
      const c = classifyCommand(a.command);
      return {
        kind: 'command',
        command: a.command,
        risk: `${c.level}${c.reasons.length ? ` — ${c.reasons.join(', ')}` : ''}`,
      };
    },
    async execute(a, ctx) {
      const cwd = ctx.services.workspace.resolve(ctx.projectId, a.cwd || '');
      const timeoutMs = (a.timeout_sec ?? ctx.services.settings.get().agent.toolTimeoutSec) * 1000;
      let result: CommandResult;
      if (a.background) {
        result = await ctx.services.processes.startBackground({
          projectId: ctx.projectId,
          cwd,
          command: a.command,
          origin: 'agent',
        });
      } else {
        const { id, done } = ctx.services.processes.run({
          projectId: ctx.projectId,
          cwd,
          command: a.command,
          origin: 'agent',
          timeoutMs,
        });
        const onAbort = () => ctx.services.processes.kill(id);
        ctx.signal.addEventListener('abort', onAbort, { once: true });
        try {
          result = await done;
        } finally {
          ctx.signal.removeEventListener('abort', onAbort);
        }
      }
      const failed = !a.background && result.exitCode !== 0;
      return {
        ok: !failed,
        summary: a.background
          ? `Started (pid ${result.id.slice(0, 8)})${result.ports.length ? ` on port ${result.ports.join(', ')}` : ''}`
          : `exit ${result.exitCode}${result.status === 'timeout' ? ' (timeout)' : ''} · ${result.durationMs} ms`,
        data: {
          processId: result.id,
          exitCode: result.exitCode,
          status: result.status,
          durationMs: result.durationMs,
          ports: result.ports,
          stdout: clip(result.stdout, 20_000),
          stderr: clip(result.stderr, 10_000),
        },
        forModel: `${a.background ? `Background process id: ${result.id}\n` : ''}${formatCommandResult(result)}`,
        error: failed ? `Command exited with code ${result.exitCode}` : undefined,
      };
    },
  }),

  defineTool({
    name: 'terminal.output',
    description:
      'Read the latest output of a background process started with terminal.execute(background=true).',
    schema: z.object({
      process_id: z.string().min(1),
      tail_chars: z.number().int().min(100).max(50_000).default(6000),
    }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Output of ${a.process_id.slice(0, 8)}`,
    async execute(a, ctx) {
      const out = ctx.services.processes.output(a.process_id);
      const info = ctx.services.processes.list().find((p) => p.id === a.process_id);
      if (!info) throw new ToolError('Unknown process id');
      const text = out
        ? `${out.stdout}\n${out.stderr}`.slice(-a.tail_chars)
        : '(process finished — no live output)';
      return ok(
        `${info.status}${info.ports.length ? ` · ports ${info.ports.join(', ')}` : ''}`,
        { status: info.status, ports: info.ports },
        {
          forModel: `status: ${info.status}, exit: ${info.exitCode ?? 'running'}, ports: ${info.ports.join(', ') || 'none'}\n${text}`,
        },
      );
    },
  }),

  defineTool({
    name: 'terminal.kill',
    description: 'Stop a background process.',
    schema: z.object({ process_id: z.string().min(1) }),
    readOnly: false,
    assess: () => ({ risk: 'execute', commandLevel: 'safe' }),
    label: (a) => `Stop ${a.process_id.slice(0, 8)}`,
    async execute(a, ctx) {
      if (!ctx.services.processes.kill(a.process_id)) throw new ToolError('Process not running');
      return ok('Stopped');
    },
  }),

  defineTool({
    name: 'code.run',
    description:
      'Execute a short JavaScript (Node) or Python snippet in the project directory and return its output. Good for quick computations and checks.',
    schema: z.object({
      language: z.enum(['javascript', 'python']),
      code: z.string().min(1).max(100_000),
      timeout_sec: z.number().int().min(1).max(300).default(60),
    }),
    readOnly: false,
    assess: () => ({ risk: 'execute', commandLevel: 'safe' }),
    label: (a) => `Run ${a.language} snippet (${a.code.split('\n').length} lines)`,
    grantKey: (a) => `code.run:${a.language}`,
    async preview(a) {
      return { kind: 'command', command: a.code, risk: `safe — ${a.language} snippet` };
    },
    async execute(a, ctx) {
      if (a.language === 'python' && !ctx.services.capabilities.python)
        throw new ToolError('python3 is not installed on the server');
      const dir = ctx.services.workspace.internalDir(ctx.projectId, 'tmp');
      const file = path.join(
        dir,
        `snippet-${randomUUID().slice(0, 8)}.${a.language === 'python' ? 'py' : 'mjs'}`,
      );
      fs.writeFileSync(file, a.code);
      try {
        const cmd = `${a.language === 'python' ? 'python3' : 'node'} ${JSON.stringify(file)}`;
        const { done } = ctx.services.processes.run({
          projectId: ctx.projectId,
          cwd: ctx.services.workspace.projectRoot(ctx.projectId),
          command: cmd,
          origin: 'agent',
          timeoutMs: a.timeout_sec * 1000,
        });
        const r = await done;
        return {
          ok: r.exitCode === 0,
          summary: `exit ${r.exitCode} · ${r.durationMs} ms`,
          data: { exitCode: r.exitCode, stdout: clip(r.stdout, 20_000), stderr: clip(r.stderr, 10_000) },
          forModel: formatCommandResult({ ...r, command: `${a.language} snippet` }),
          error: r.exitCode === 0 ? undefined : `exit code ${r.exitCode}`,
        };
      } finally {
        fs.rmSync(file, { force: true });
      }
    },
  }),
];
