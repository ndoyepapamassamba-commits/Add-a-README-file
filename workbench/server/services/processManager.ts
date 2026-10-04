import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { redactSecrets, scrubbedEnv } from '../security/redact';

export interface ProcessInfo {
  id: string;
  projectId: string;
  command: string;
  origin: 'agent' | 'user';
  status: 'running' | 'exited' | 'killed' | 'timeout' | 'error';
  exitCode: number | null;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  background: boolean;
  ports: number[];
}

export interface CommandResult extends ProcessInfo {
  stdout: string;
  stderr: string;
  truncated: boolean;
}

interface Tracked {
  info: ProcessInfo;
  child: ChildProcess;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timer?: NodeJS.Timeout;
}

const MAX_CAPTURE = 400_000; // characters kept per stream (head + tail)
const MAX_BACKGROUND = 6;

function capture(current: string, chunk: string): { text: string; truncated: boolean } {
  const next = current + chunk;
  if (next.length <= MAX_CAPTURE) return { text: next, truncated: false };
  const head = next.slice(0, MAX_CAPTURE * 0.3);
  const tail = next.slice(-MAX_CAPTURE * 0.7);
  return { text: `${head}\n…[output truncated]…\n${tail}`, truncated: true };
}

/**
 * Runs shell commands for the terminal and the agent: scrubbed environment
 * (no secrets), project working directory, timeouts, process-group kill,
 * output caps, live output streaming and background processes (dev servers).
 */
export class ProcessManager extends EventEmitter {
  private procs = new Map<string, Tracked>();
  private history: ProcessInfo[] = [];

  run(opts: {
    projectId: string;
    cwd: string;
    command: string;
    origin: 'agent' | 'user';
    timeoutMs: number;
    background?: boolean;
    stdin?: boolean;
  }): { id: string; done: Promise<CommandResult> } {
    if (opts.background && [...this.procs.values()].filter((p) => p.info.background && p.info.status === 'running').length >= MAX_BACKGROUND) {
      throw new Error(`Too many background processes (max ${MAX_BACKGROUND}). Stop one first.`);
    }
    const id = randomUUID();
    const child = spawn('bash', ['-c', opts.command], {
      cwd: opts.cwd,
      detached: true,
      stdio: [opts.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      env: scrubbedEnv({
        CI: '1',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        TERM: 'dumb',
        PAGER: 'cat',
        GIT_PAGER: 'cat',
        GIT_TERMINAL_PROMPT: '0',
        npm_config_yes: 'true',
        npm_config_fund: 'false',
        npm_config_audit: 'false',
        PYTHONUNBUFFERED: '1',
      }),
    });
    const info: ProcessInfo = {
      id,
      projectId: opts.projectId,
      command: opts.command,
      origin: opts.origin,
      status: 'running',
      exitCode: null,
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null,
      background: Boolean(opts.background),
      ports: [],
    };
    const tracked: Tracked = { info, child, stdout: '', stderr: '', truncated: false };
    this.procs.set(id, tracked);
    this.emit('process', { ...info });

    const onData = (stream: 'stdout' | 'stderr') => (buf: Buffer) => {
      const text = redactSecrets(buf.toString('utf8'));
      const res = capture(tracked[stream], text);
      tracked[stream] = res.text;
      tracked.truncated ||= res.truncated;
      for (const m of text.matchAll(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::\]):(\d{2,5})/g)) {
        const port = Number(m[1]);
        if (!info.ports.includes(port)) {
          info.ports.push(port);
          this.emit('process', { ...info });
        }
      }
      this.emit('output', { id, stream, text });
    };
    child.stdout?.on('data', onData('stdout'));
    child.stderr?.on('data', onData('stderr'));

    if (!opts.background) {
      tracked.timer = setTimeout(() => {
        info.status = 'timeout';
        this.killTree(child);
      }, opts.timeoutMs);
    }

    const done = new Promise<CommandResult>((resolve) => {
      const finish = (code: number | null, error?: Error) => {
        if (tracked.timer) clearTimeout(tracked.timer);
        if (info.status === 'running') info.status = error ? 'error' : 'exited';
        info.exitCode = code;
        info.finishedAt = Date.now();
        info.durationMs = info.finishedAt - info.startedAt;
        if (error) tracked.stderr += `\n${error.message}`;
        this.procs.delete(id);
        this.history.unshift({ ...info });
        this.history = this.history.slice(0, 200);
        this.emit('process', { ...info });
        resolve({ ...info, stdout: tracked.stdout, stderr: tracked.stderr, truncated: tracked.truncated });
      };
      child.on('error', (err) => finish(-1, err));
      child.on('close', (code) => finish(code));
    });
    return { id, done };
  }

  /** Runs a background process and returns its first output after `settleMs`. */
  async startBackground(opts: { projectId: string; cwd: string; command: string; origin: 'agent' | 'user'; settleMs?: number }): Promise<CommandResult> {
    const { id, done } = this.run({ ...opts, timeoutMs: 0, background: true });
    const settled = await Promise.race([done, new Promise<null>((r) => setTimeout(() => r(null), opts.settleMs ?? 4000))]);
    if (settled) return settled;
    const t = this.procs.get(id)!;
    return { ...t.info, stdout: t.stdout, stderr: t.stderr, truncated: t.truncated };
  }

  private killTree(child: ChildProcess): void {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    setTimeout(() => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }, 2000).unref();
  }

  kill(id: string): boolean {
    const t = this.procs.get(id);
    if (!t) return false;
    t.info.status = 'killed';
    this.killTree(t.child);
    return true;
  }

  writeStdin(id: string, data: string, end = false): boolean {
    const t = this.procs.get(id);
    if (!t?.child.stdin || t.child.stdin.destroyed) return false;
    t.child.stdin.write(data);
    if (end) t.child.stdin.end();
    return true;
  }

  output(id: string): { stdout: string; stderr: string } | null {
    const t = this.procs.get(id);
    return t ? { stdout: t.stdout, stderr: t.stderr } : null;
  }

  list(): ProcessInfo[] {
    return [...[...this.procs.values()].map((t) => ({ ...t.info })), ...this.history];
  }

  /** Ports opened by processes this workbench started (used for previews). */
  knownPorts(): number[] {
    return [...this.procs.values()].flatMap((t) => t.info.ports);
  }

  shutdown(): void {
    for (const t of this.procs.values()) this.killTree(t.child);
  }
}
