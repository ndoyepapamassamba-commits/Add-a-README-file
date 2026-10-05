// Per-session accounting of every paid call of a run (model, correction, tool,
// JEV). The agent loop, the tools and the JEV runtime all record here; the
// agent turns the list into the run's Accounting (server/jev/science.ts).
import type { CallRec } from '../../server/jev/science';

const runs = new Map<string, CallRec[]>();

export const acct = {
  reset(sessionId: string): void {
    runs.set(sessionId, []);
  },
  add(sessionId: string, rec: CallRec): void {
    const l = runs.get(sessionId);
    if (l) l.push(rec);
  },
  list(sessionId: string): CallRec[] {
    return runs.get(sessionId)?.slice() ?? [];
  },
  clear(sessionId: string): void {
    runs.delete(sessionId);
  },
};
