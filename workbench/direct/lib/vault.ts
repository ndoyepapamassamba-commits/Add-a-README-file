// EXPERIENCE VAULT + CHAT ARCHIVE.
// The vault keeps what the user judged WELL written / WELL executed (answer + its files). It is reused as experience: the
// closest entry to a new request is shown to the model as a reference (excerpt only, ~150 tokens), and vault.open copies
// its files into the current chat. Archiving hides chats from the list without deleting anything; an archive can be
// exported (chats + their own files) and re-imported.
import { useStore } from './store';
import { CHAT_PREFIX, chatPath, deliverablesIn, download, ownerOf } from './vfs';
import { recall, type MemFact } from '../../server/jev/memory/semantic';
import type { Session, VaultEntry } from './types';

const uid = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const MAX_FILE = 3_000_000;

export function saveToVault(sessionId: string, itemId: string, tags: string[] = []): VaultEntry | null {
  const st = useStore.getState();
  const sess = st.sessions.find((s) => s.id === sessionId);
  if (!sess) return null;
  const idx = sess.items.findIndex((i) => i.id === itemId);
  const item = sess.items[idx];
  if (!item || item.kind !== 'assistant') return null;
  const req = [...sess.items.slice(0, idx)].reverse().find((i) => i.kind === 'user');
  const request = req && req.kind === 'user' ? req.text : sess.title;
  const files = deliverablesIn(item.text, sessionId)
    .filter((f) => f.data.length <= MAX_FILE)
    .slice(0, 8)
    .map((f) => ({ path: f.path, data: f.data, binary: f.binary, mime: f.mime }));
  const entry: VaultEntry = {
    id: uid(),
    at: Date.now(),
    title: request.replace(/\s+/g, ' ').slice(0, 90),
    request,
    text: item.text,
    files,
    tags,
    source: itemId,
  };
  st.setVault([...st.vault, entry].slice(-500));
  return entry;
}

const asFact = (v: VaultEntry): MemFact => ({ id: v.id, text: `${v.title} ${v.tags.join(' ')} ${v.files.map((f) => f.path).join(' ')}`, kind: 'fact', at: v.at });
/** The closest vault entry to a request (strict threshold: only a real match is worth its tokens). */
export function vaultRecall(text: string): VaultEntry | null {
  const v = useStore.getState().vault;
  if (!v.length) return null;
  const hit = recall(v.map(asFact), text, { k: 1, min: 0.42 })[0];
  return hit ? (v.find((x) => x.id === hit.fact.id) ?? null) : null;
}
export function vaultBlock(e: VaultEntry): string {
  return `<EXPERIENCE id="${e.id}">\nA past deliverable the user validated for a similar request (« ${e.title} »). Reuse its approach and quality bar; call vault.open with this id to copy its files (${e.files.map((f) => f.path).join(', ') || 'none'}) into this chat if useful.\nExcerpt: ${e.text.replace(/\s+/g, ' ').slice(0, 500)}\n</EXPERIENCE>`;
}

// ── Archive ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export function setArchived(ids: string[], archived: boolean): void {
  const st = useStore.getState();
  for (const id of ids) st.patchSession(id, { archived });
}
interface ArchiveFile {
  format: 'massamba-archive';
  version: 1;
  exportedAt: number;
  sessions: Session[];
  files: Record<string, { data: string; binary: boolean; mime: string }>;
}
/** Download selected chats with their own files (never the API key, never another chat's files). */
export function exportArchive(ids: string[]): void {
  const st = useStore.getState();
  const set = new Set(ids);
  const sessions = st.sessions.filter((s) => set.has(s.id));
  const files: ArchiveFile['files'] = {};
  for (const [k, f] of Object.entries(st.files)) {
    const o = ownerOf(k);
    if (o && set.has(o)) files[k] = { data: f.data, binary: f.binary, mime: f.mime };
  }
  const a: ArchiveFile = { format: 'massamba-archive', version: 1, exportedAt: Date.now(), sessions, files };
  download(`archive-chats-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(a), 'application/json');
}
export function importArchive(json: string): number {
  const a = JSON.parse(json) as ArchiveFile;
  if (a.format !== 'massamba-archive' || !Array.isArray(a.sessions)) throw new Error('Fichier d’archive invalide');
  const st = useStore.getState();
  const have = new Set(st.sessions.map((s) => s.id));
  const fresh = a.sessions.filter((s) => !have.has(s.id)).map((s) => ({ ...s, archived: s.archived ?? true }));
  st.addSessions(fresh);
  for (const [k, f] of Object.entries(a.files ?? {}))
    if (k.startsWith(CHAT_PREFIX) && !st.files[k]) st.writeFile({ path: k, data: f.data, binary: f.binary, mime: f.mime });
  return fresh.length;
}
export const filesOfChat = (sid: string) =>
  Object.keys(useStore.getState().files)
    .filter((k) => ownerOf(k) === sid)
    .map(chatPath);
