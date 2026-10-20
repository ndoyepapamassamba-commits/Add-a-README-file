import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    model TEXT NOT NULL, permission_mode TEXT NOT NULL,
    tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0,
    settings TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id, updated_at);
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, run_id TEXT,
    role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, project_id TEXT NOT NULL, parent_run_id TEXT,
    role TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, model TEXT NOT NULL, mode TEXT NOT NULL,
    started_at INTEGER NOT NULL, finished_at INTEGER,
    tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0,
    files_changed INTEGER NOT NULL DEFAULT 0, error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_id, started_at);
  CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
  CREATE TABLE IF NOT EXISTS run_events (
    run_id TEXT NOT NULL, seq INTEGER NOT NULL, ts INTEGER NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (run_id, seq)
  );
  CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL, session_id TEXT NOT NULL, tool TEXT NOT NULL, args TEXT NOT NULL,
    status TEXT NOT NULL, summary TEXT, started_at INTEGER NOT NULL, duration_ms INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_tool_calls_started ON tool_calls(started_at);
  CREATE TABLE IF NOT EXISTS changes (
    id TEXT PRIMARY KEY, run_id TEXT, session_id TEXT, project_id TEXT NOT NULL, path TEXT NOT NULL,
    op TEXT NOT NULL, before TEXT, after TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL,
    added INTEGER NOT NULL DEFAULT 0, removed INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_changes_session ON changes(session_id, created_at);
  CREATE TABLE IF NOT EXISTS usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, session_id TEXT, model TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL, completion_tokens INTEGER NOT NULL, cost REAL NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_usage_created ON usage(created_at);
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
    target TEXT, decision TEXT, details TEXT
  );
  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, session_id TEXT, run_id TEXT, name TEXT NOT NULL,
    type TEXT NOT NULL, path TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL, meta TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id, created_at);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
];

export type DB = DatabaseSync;

export function openDatabase(dataDir: string): DB {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'workbench.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  while (version < MIGRATIONS.length) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]!);
      version++;
      db.prepare('UPDATE schema_version SET version = ?').run(version);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return db;
}
