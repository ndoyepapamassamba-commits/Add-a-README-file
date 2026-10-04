import type { DB } from './database';
import type {
  AgentEvent,
  ChangeRecord,
  PermissionMode,
  ProjectInfo,
  RunEventEnvelope,
  RunStatus,
  RunSummary,
  SessionSummary,
  AgentMode,
  RoleId,
} from '@shared/types';
import { redactForLogs } from '../security/redact';

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v == null ? '' : String(v));

export interface SessionSettings {
  autoApproveEdits?: boolean;
  grants?: string[];
  role?: RoleId;
}

export interface StoredMessage {
  id: number;
  runId: string | null;
  role: string;
  content: unknown;
  createdAt: number;
}

export interface ArtifactRecord {
  id: string;
  projectId: string;
  sessionId: string | null;
  runId: string | null;
  name: string;
  type: string;
  path: string;
  size: number;
  createdAt: number;
  meta: Record<string, unknown>;
}

export interface ToolCallRow {
  id: string;
  runId: string;
  sessionId: string;
  tool: string;
  args: string;
  status: string;
  summary: string | null;
  startedAt: number;
  durationMs: number | null;
}

/** Thin typed data-access layer over SQLite. */
export class Repo {
  constructor(private readonly db: DB) {}

  // ── projects ──────────────────────────────────────────────────────────
  upsertProject(p: { id: string; name: string; path: string }): void {
    this.db
      .prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, path=excluded.path')
      .run(p.id, p.name, p.path, Date.now());
  }
  getProjectRow(id: string): { id: string; name: string; path: string; createdAt: number } | undefined {
    const r = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row | undefined;
    return r ? { id: str(r.id), name: str(r.name), path: str(r.path), createdAt: num(r.created_at) } : undefined;
  }
  listProjectRows(): Omit<ProjectInfo, 'isGit'>[] {
    return (this.db.prepare('SELECT * FROM projects ORDER BY name').all() as Row[]).map((r) => ({
      id: str(r.id),
      name: str(r.name),
      path: str(r.path),
      createdAt: num(r.created_at),
    }));
  }
  deleteProjectRow(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  // ── sessions ──────────────────────────────────────────────────────────
  createSession(s: { id: string; projectId: string; title: string; model: string; permissionMode: PermissionMode }): SessionSummary {
    const now = Date.now();
    this.db
      .prepare('INSERT INTO sessions (id, project_id, title, created_at, updated_at, model, permission_mode) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(s.id, s.projectId, s.title, now, now, s.model, s.permissionMode);
    return this.getSession(s.id)!;
  }
  private mapSession(r: Row): SessionSummary {
    return {
      id: str(r.id),
      projectId: str(r.project_id),
      title: str(r.title),
      createdAt: num(r.created_at),
      updatedAt: num(r.updated_at),
      model: str(r.model),
      permissionMode: str(r.permission_mode) as PermissionMode,
      tokensIn: num(r.tokens_in),
      tokensOut: num(r.tokens_out),
      cost: num(r.cost),
    };
  }
  getSession(id: string): SessionSummary | undefined {
    const r = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Row | undefined;
    return r ? this.mapSession(r) : undefined;
  }
  listSessions(projectId?: string, limit = 200): SessionSummary[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?').all(projectId, limit)
      : this.db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?').all(limit);
    return (rows as Row[]).map((r) => this.mapSession(r));
  }
  updateSession(id: string, patch: Partial<{ title: string; model: string; permissionMode: PermissionMode }>): void {
    const s = this.getSession(id);
    if (!s) return;
    this.db
      .prepare('UPDATE sessions SET title = ?, model = ?, permission_mode = ?, updated_at = ? WHERE id = ?')
      .run(patch.title ?? s.title, patch.model ?? s.model, patch.permissionMode ?? s.permissionMode, Date.now(), id);
  }
  touchSession(id: string, usage?: { tokensIn: number; tokensOut: number; cost: number }): void {
    if (usage)
      this.db
        .prepare('UPDATE sessions SET updated_at = ?, tokens_in = tokens_in + ?, tokens_out = tokens_out + ?, cost = cost + ? WHERE id = ?')
        .run(Date.now(), usage.tokensIn, usage.tokensOut, usage.cost, id);
    else this.db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), id);
  }
  getSessionSettings(id: string): SessionSettings {
    const r = this.db.prepare('SELECT settings FROM sessions WHERE id = ?').get(id) as Row | undefined;
    try {
      return r ? (JSON.parse(str(r.settings)) as SessionSettings) : {};
    } catch {
      return {};
    }
  }
  setSessionSettings(id: string, settings: SessionSettings): void {
    this.db.prepare('UPDATE sessions SET settings = ? WHERE id = ?').run(JSON.stringify(settings), id);
  }
  deleteSession(id: string): void {
    const runIds = (this.db.prepare('SELECT id FROM runs WHERE session_id = ?').all(id) as Row[]).map((r) => str(r.id));
    this.db.exec('BEGIN');
    try {
      for (const runId of runIds) this.db.prepare('DELETE FROM run_events WHERE run_id = ?').run(runId);
      for (const t of ['messages', 'runs', 'tool_calls', 'changes']) this.db.prepare(`DELETE FROM ${t} WHERE session_id = ?`).run(id);
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  // ── messages (LLM transcript) ─────────────────────────────────────────
  addMessage(sessionId: string, runId: string | null, role: string, content: unknown): void {
    this.db
      .prepare('INSERT INTO messages (session_id, run_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(sessionId, runId, role, JSON.stringify(content), Date.now());
  }
  listMessages(sessionId: string): StoredMessage[] {
    return (this.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id').all(sessionId) as Row[]).map((r) => ({
      id: num(r.id),
      runId: r.run_id == null ? null : str(r.run_id),
      role: str(r.role),
      content: JSON.parse(str(r.content)) as unknown,
      createdAt: num(r.created_at),
    }));
  }
  replaceMessages(sessionId: string, messages: { runId: string | null; role: string; content: unknown }[]): void {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
      for (const m of messages) this.addMessage(sessionId, m.runId, m.role, m.content);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
  clearMessages(sessionId: string): void {
    this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
  }

  // ── runs ──────────────────────────────────────────────────────────────
  createRun(r: { id: string; sessionId: string; projectId: string; parentRunId: string | null; role: RoleId; title: string; model: string; mode: AgentMode }): void {
    this.db
      .prepare(
        'INSERT INTO runs (id, session_id, project_id, parent_run_id, role, title, status, model, mode, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(r.id, r.sessionId, r.projectId, r.parentRunId, r.role, r.title, 'queued', r.model, r.mode, Date.now());
  }
  private mapRun(r: Row): RunSummary {
    return {
      id: str(r.id),
      sessionId: str(r.session_id),
      projectId: str(r.project_id),
      parentRunId: r.parent_run_id == null ? null : str(r.parent_run_id),
      role: str(r.role) as RoleId,
      title: str(r.title),
      status: str(r.status) as RunStatus,
      model: str(r.model),
      mode: str(r.mode) as AgentMode,
      startedAt: num(r.started_at),
      finishedAt: r.finished_at == null ? null : num(r.finished_at),
      tokensIn: num(r.tokens_in),
      tokensOut: num(r.tokens_out),
      cost: num(r.cost),
      filesChanged: num(r.files_changed),
      error: r.error == null ? null : str(r.error),
    };
  }
  getRun(id: string): RunSummary | undefined {
    const r = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Row | undefined;
    return r ? this.mapRun(r) : undefined;
  }
  listRuns(opts: { sessionId?: string; limit?: number } = {}): RunSummary[] {
    const limit = opts.limit ?? 200;
    const rows = opts.sessionId
      ? this.db.prepare('SELECT * FROM runs WHERE session_id = ? ORDER BY started_at ASC LIMIT ?').all(opts.sessionId, limit)
      : this.db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?').all(limit);
    return (rows as Row[]).map((r) => this.mapRun(r));
  }
  updateRun(id: string, patch: Partial<{ status: RunStatus; model: string; error: string | null; finishedAt: number; title: string }>): void {
    const run = this.getRun(id);
    if (!run) return;
    this.db
      .prepare('UPDATE runs SET status = ?, model = ?, error = ?, finished_at = ?, title = ? WHERE id = ?')
      .run(
        patch.status ?? run.status,
        patch.model ?? run.model,
        patch.error === undefined ? run.error : patch.error,
        patch.finishedAt ?? run.finishedAt,
        patch.title ?? run.title,
        id,
      );
  }
  addRunUsage(id: string, u: { tokensIn: number; tokensOut: number; cost: number }): void {
    this.db.prepare('UPDATE runs SET tokens_in = tokens_in + ?, tokens_out = tokens_out + ?, cost = cost + ? WHERE id = ?').run(u.tokensIn, u.tokensOut, u.cost, id);
  }
  incrementFilesChanged(id: string): void {
    this.db.prepare('UPDATE runs SET files_changed = files_changed + 1 WHERE id = ?').run(id);
  }
  /** Marks runs left running by a previous process as failed. */
  failOrphanRuns(): number {
    const res = this.db
      .prepare("UPDATE runs SET status = 'failed', error = 'Server restarted during the run', finished_at = ? WHERE status IN ('queued','running','waiting_approval','waiting_plan')")
      .run(Date.now());
    return Number(res.changes);
  }

  // ── run events ────────────────────────────────────────────────────────
  addRunEvent(runId: string, seq: number, ts: number, event: AgentEvent): void {
    this.db.prepare('INSERT INTO run_events (run_id, seq, ts, type, data) VALUES (?, ?, ?, ?, ?)').run(runId, seq, ts, event.type, JSON.stringify(event));
  }
  listRunEvents(runId: string, afterSeq = -1): RunEventEnvelope[] {
    return (this.db.prepare('SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq').all(runId, afterSeq) as Row[]).map((r) => ({
      runId: str(r.run_id),
      seq: num(r.seq),
      ts: num(r.ts),
      event: JSON.parse(str(r.data)) as AgentEvent,
    }));
  }
  maxRunEventSeq(runId: string): number {
    const r = this.db.prepare('SELECT MAX(seq) AS m FROM run_events WHERE run_id = ?').get(runId) as Row | undefined;
    return r?.m == null ? -1 : num(r.m);
  }

  // ── tool calls (activity / observability) ─────────────────────────────
  startToolCall(t: { id: string; runId: string; sessionId: string; tool: string; args: unknown }): void {
    this.db
      .prepare('INSERT INTO tool_calls (id, run_id, session_id, tool, args, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(t.id, t.runId, t.sessionId, t.tool, JSON.stringify(t.args ?? {}).slice(0, 4000), 'running', Date.now());
  }
  finishToolCall(id: string, status: 'success' | 'error' | 'denied', summary: string, durationMs: number): void {
    this.db.prepare('UPDATE tool_calls SET status = ?, summary = ?, duration_ms = ? WHERE id = ?').run(status, summary.slice(0, 1000), durationMs, id);
  }
  listToolCalls(limit = 300, sessionId?: string): ToolCallRow[] {
    const rows = sessionId
      ? this.db.prepare('SELECT * FROM tool_calls WHERE session_id = ? ORDER BY started_at DESC LIMIT ?').all(sessionId, limit)
      : this.db.prepare('SELECT * FROM tool_calls ORDER BY started_at DESC LIMIT ?').all(limit);
    return (rows as Row[]).map((r) => ({
      id: str(r.id),
      runId: str(r.run_id),
      sessionId: str(r.session_id),
      tool: str(r.tool),
      args: str(r.args),
      status: str(r.status),
      summary: r.summary == null ? null : str(r.summary),
      startedAt: num(r.started_at),
      durationMs: r.duration_ms == null ? null : num(r.duration_ms),
    }));
  }

  // ── changes ───────────────────────────────────────────────────────────
  addChange(c: ChangeRecord): void {
    this.db
      .prepare('INSERT INTO changes (id, run_id, session_id, project_id, path, op, before, after, status, created_at, added, removed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(c.id, c.runId, c.sessionId, c.projectId, c.path, c.op, c.before, c.after, c.status, c.createdAt, c.added, c.removed);
  }
  private mapChange(r: Row): ChangeRecord {
    return {
      id: str(r.id),
      runId: r.run_id == null ? null : str(r.run_id),
      sessionId: r.session_id == null ? null : str(r.session_id),
      projectId: str(r.project_id),
      path: str(r.path),
      op: str(r.op) as ChangeRecord['op'],
      before: r.before == null ? null : str(r.before),
      after: r.after == null ? null : str(r.after),
      status: str(r.status) as ChangeRecord['status'],
      createdAt: num(r.created_at),
      added: num(r.added),
      removed: num(r.removed),
    };
  }
  getChange(id: string): ChangeRecord | undefined {
    const r = this.db.prepare('SELECT * FROM changes WHERE id = ?').get(id) as Row | undefined;
    return r ? this.mapChange(r) : undefined;
  }
  listChanges(opts: { sessionId?: string; projectId?: string; runId?: string }): ChangeRecord[] {
    let rows: unknown[];
    if (opts.runId) rows = this.db.prepare('SELECT * FROM changes WHERE run_id = ? ORDER BY created_at').all(opts.runId);
    else if (opts.sessionId) rows = this.db.prepare('SELECT * FROM changes WHERE session_id = ? ORDER BY created_at').all(opts.sessionId);
    else rows = this.db.prepare('SELECT * FROM changes WHERE project_id = ? ORDER BY created_at DESC LIMIT 500').all(opts.projectId ?? '');
    return (rows as Row[]).map((r) => this.mapChange(r));
  }
  setChangeStatus(id: string, status: ChangeRecord['status']): void {
    this.db.prepare('UPDATE changes SET status = ? WHERE id = ?').run(status, id);
  }

  // ── usage & costs ─────────────────────────────────────────────────────
  addUsage(u: { runId: string | null; sessionId: string | null; model: string; promptTokens: number; completionTokens: number; cost: number }): void {
    this.db
      .prepare('INSERT INTO usage (run_id, session_id, model, prompt_tokens, completion_tokens, cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(u.runId, u.sessionId, u.model, u.promptTokens, u.completionTokens, u.cost, Date.now());
  }
  usageSince(since: number): { promptTokens: number; completionTokens: number; cost: number; calls: number } {
    const r = this.db
      .prepare('SELECT COALESCE(SUM(prompt_tokens),0) p, COALESCE(SUM(completion_tokens),0) c, COALESCE(SUM(cost),0) cost, COUNT(*) n FROM usage WHERE created_at >= ?')
      .get(since) as Row;
    return { promptTokens: num(r.p), completionTokens: num(r.c), cost: num(r.cost), calls: num(r.n) };
  }
  usageByModel(since: number): { model: string; cost: number; promptTokens: number; completionTokens: number; calls: number }[] {
    return (
      this.db
        .prepare('SELECT model, SUM(cost) cost, SUM(prompt_tokens) p, SUM(completion_tokens) c, COUNT(*) n FROM usage WHERE created_at >= ? GROUP BY model ORDER BY cost DESC')
        .all(since) as Row[]
    ).map((r) => ({ model: str(r.model), cost: num(r.cost), promptTokens: num(r.p), completionTokens: num(r.c), calls: num(r.n) }));
  }
  usageByDay(since: number): { day: string; cost: number; tokens: number }[] {
    return (
      this.db
        .prepare(
          "SELECT strftime('%Y-%m-%d', created_at/1000, 'unixepoch', 'localtime') day, SUM(cost) cost, SUM(prompt_tokens+completion_tokens) t FROM usage WHERE created_at >= ? GROUP BY day ORDER BY day",
        )
        .all(since) as Row[]
    ).map((r) => ({ day: str(r.day), cost: num(r.cost), tokens: num(r.t) }));
  }

  // ── audit ─────────────────────────────────────────────────────────────
  audit(e: { actor: string; action: string; target?: string; decision?: string; details?: unknown }): void {
    const details = e.details === undefined ? null : redactForLogs(typeof e.details === 'string' ? e.details : JSON.stringify(e.details)).slice(0, 4000);
    this.db
      .prepare('INSERT INTO audit_log (ts, actor, action, target, decision, details) VALUES (?, ?, ?, ?, ?, ?)')
      .run(Date.now(), e.actor, e.action, e.target ? redactForLogs(e.target).slice(0, 500) : null, e.decision ?? null, details);
  }
  listAudit(limit = 300): { id: number; ts: number; actor: string; action: string; target: string | null; decision: string | null; details: string | null }[] {
    return (this.db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit) as Row[]).map((r) => ({
      id: num(r.id),
      ts: num(r.ts),
      actor: str(r.actor),
      action: str(r.action),
      target: r.target == null ? null : str(r.target),
      decision: r.decision == null ? null : str(r.decision),
      details: r.details == null ? null : str(r.details),
    }));
  }

  // ── artifacts ─────────────────────────────────────────────────────────
  addArtifact(a: ArtifactRecord): void {
    this.db
      .prepare('INSERT INTO artifacts (id, project_id, session_id, run_id, name, type, path, size, created_at, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(a.id, a.projectId, a.sessionId, a.runId, a.name, a.type, a.path, a.size, a.createdAt, JSON.stringify(a.meta));
  }
  private mapArtifact(r: Row): ArtifactRecord {
    return {
      id: str(r.id),
      projectId: str(r.project_id),
      sessionId: r.session_id == null ? null : str(r.session_id),
      runId: r.run_id == null ? null : str(r.run_id),
      name: str(r.name),
      type: str(r.type),
      path: str(r.path),
      size: num(r.size),
      createdAt: num(r.created_at),
      meta: JSON.parse(str(r.meta) || '{}') as Record<string, unknown>,
    };
  }
  getArtifact(id: string): ArtifactRecord | undefined {
    const r = this.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as Row | undefined;
    return r ? this.mapArtifact(r) : undefined;
  }
  listArtifacts(opts: { projectId?: string; sessionId?: string; limit?: number }): ArtifactRecord[] {
    const limit = opts.limit ?? 200;
    const rows = opts.sessionId
      ? this.db.prepare('SELECT * FROM artifacts WHERE session_id = ? ORDER BY created_at DESC LIMIT ?').all(opts.sessionId, limit)
      : this.db.prepare('SELECT * FROM artifacts WHERE project_id = ? ORDER BY created_at DESC LIMIT ?').all(opts.projectId ?? '', limit);
    return (rows as Row[]).map((r) => this.mapArtifact(r));
  }
  deleteArtifact(id: string): void {
    this.db.prepare('DELETE FROM artifacts WHERE id = ?').run(id);
  }

  // ── settings ──────────────────────────────────────────────────────────
  getSetting<T>(key: string, fallback: T): T {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Row | undefined;
    if (!r) return fallback;
    try {
      return JSON.parse(str(r.value)) as T;
    } catch {
      return fallback;
    }
  }
  setSetting(key: string, value: unknown): void {
    this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
  }
}
