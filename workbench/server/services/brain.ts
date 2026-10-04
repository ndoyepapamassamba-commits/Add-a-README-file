// Persistent memory of the Intelligence Engine (server edition): mission
// ledger and personal operating manual, as JSON files in the data folder.
import fs from 'node:fs';
import path from 'node:path';
import type { LeaderboardMap } from '../llm/routing';
import {
  emptyLedger,
  recordEntry,
  type Ledger,
  type LedgerEntry,
  type ManualRule,
} from '../agent/intelligence';

export class Brain {
  ledger: Ledger = emptyLedger();
  manual: ManualRule[] = [];
  /** Personal leaderboard (missions won / lost per model and per task type). */
  board: LeaderboardMap = {};

  constructor(private readonly dir: string) {
    this.ledger = this.read<Ledger>('ledger.json') ?? emptyLedger();
    this.manual = this.read<ManualRule[]>('manual.json') ?? [];
    this.board = this.read<LeaderboardMap>('board.json') ?? {};
  }
  setBoard(b: LeaderboardMap): void {
    this.board = b;
    this.write('board.json', b);
  }
  private read<T>(file: string): T | null {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.dir, file), 'utf8')) as T;
    } catch {
      return null;
    }
  }
  private write(file: string, v: unknown): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = path.join(this.dir, `${file}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(v));
    fs.renameSync(tmp, path.join(this.dir, file));
  }
  record(e: LedgerEntry): void {
    this.ledger = recordEntry(this.ledger, e);
    this.write('ledger.json', this.ledger);
  }
  addRules(rules: Omit<ManualRule, 'id' | 'at'>[]): ManualRule[] {
    const added = rules
      .filter((r) => !this.manual.some((m) => m.rule === r.rule))
      .map((r) => ({ ...r, id: Math.random().toString(36).slice(2), at: Date.now() }));
    if (added.length) {
      this.manual = [...this.manual, ...added];
      this.write('manual.json', this.manual);
    }
    return added;
  }
  removeRule(id: string): void {
    this.manual = this.manual.filter((m) => m.id !== id);
    this.write('manual.json', this.manual);
  }
}
