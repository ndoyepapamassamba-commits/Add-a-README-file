// Virtual workspace stored in the browser (IndexedDB): uploaded and generated files.
import { zipSync } from 'fflate';
import { isDocument, isImage, mimeFor, extractDocumentBytes } from '../../server/services/documentsCore';
import { extOf } from '../../server/services/dataCore';
import { useStore } from './store';
import type { VFile } from './types';

const TEXT_EXT = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.json',
  '.jsonl',
  '.ndjson',
  '.xml',
  '.yaml',
  '.yml',
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.py',
  '.java',
  '.kt',
  '.swift',
  '.go',
  '.rs',
  '.rb',
  '.php',
  '.sql',
  '.sh',
  '.bat',
  '.ps1',
  '.ini',
  '.toml',
  '.env.example',
  '.svg',
  '.c',
  '.h',
  '.cpp',
  '.cs',
  '.dart',
  '.vue',
  '.svelte',
  '.r',
  '.tex',
  '.log',
  '.rtf',
]);

export function normPath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') throw new Error(`Chemin invalide : ${p}`);
    parts.push(seg);
  }
  if (!parts.length) throw new Error('Chemin vide');
  return parts.join('/');
}

export function isTextPath(p: string): boolean {
  const ext = extOf(p);
  return TEXT_EXT.has(ext) || ext === '';
}

// ── CHAT-SCOPED MEMORY (hard isolation) ─────────────────────────────────────────────────────────────────────────
// Every chat owns its own workspace: files written during a chat (outputs, edits, `.ai/` memory) are stored under
// `@chat/<sessionId>/<path>` and the agent of that chat sees them at `<path>`. Another chat's files are NEVER listed,
// searched, read or written. A file of the shared workspace (Files view, legacy) is visible to a chat only when the chat
// attached it or the user named it in that chat; the shared `.ai/` memory is never visible inside a chat.
export const CHAT_PREFIX = '@chat/';
interface ChatScope {
  sid: string;
  /** Shared-workspace paths this chat may see (attachments, paths named by the user). */
  allow: Set<string>;
}
let scope: ChatScope | null = null;
export function setChatScope(sid: string | null, allow: Iterable<string> = []): void {
  scope = sid ? { sid, allow: new Set(allow) } : null;
}
export const chatScope = (): string | null => scope?.sid ?? null;
export const chatKey = (sid: string, p: string) => `${CHAT_PREFIX}${sid}/${p}`;
/** Session that owns a stored key (null for the shared workspace). */
export const ownerOf = (key: string): string | null =>
  key.startsWith(CHAT_PREFIX) ? key.slice(CHAT_PREFIX.length).split('/')[0]! : null;
/** Path as the owning chat sees it. */
export const chatPath = (key: string): string =>
  key.startsWith(CHAT_PREFIX) ? key.slice(CHAT_PREFIX.length).split('/').slice(1).join('/') : key;

const memo = new WeakMap<Record<string, VFile>, Map<string, Record<string, VFile>>>();
/** The workspace as one chat sees it (pure; null = the whole shared store, for the Files view). */
export function filesFor(sid: string | null, allow?: Set<string>): Record<string, VFile> {
  const all = useStore.getState().files;
  if (!sid) return all;
  const allowKey = allow ? [...allow].sort().join('|') : '';
  const mk = `${sid}#${allowKey}`;
  let m = memo.get(all);
  const hit = m?.get(mk);
  if (hit) return hit;
  const pre = `${CHAT_PREFIX}${sid}/`;
  const out: Record<string, VFile> = {};
  for (const [k, f] of Object.entries(all))
    if (!k.startsWith(CHAT_PREFIX) && !k.startsWith('.ai/') && allow?.has(k)) out[k] = f;
  // The chat's own files win over a shared file with the same path (copy-on-write).
  for (const [k, f] of Object.entries(all)) if (k.startsWith(pre)) out[k.slice(pre.length)] = { ...f, path: k.slice(pre.length) };
  if (!m) memo.set(all, (m = new Map()));
  m.set(mk, out);
  return out;
}
export const files = (): Record<string, VFile> => filesFor(scope?.sid ?? null, scope?.allow);
export const getFile = (p: string): VFile | undefined => files()[normPath(p)];
/** Storage key of a path written by the current chat. */
const storeKey = (p: string) => (scope ? chatKey(scope.sid, p) : p);
/** Delete a file or folder as the current chat sees it (own copy first; a shared file only if visible to the chat). */
export function removeFile(path: string): number {
  const p = normPath(path);
  const st = useStore.getState();
  const visible = Object.keys(files()).filter((k) => k === p || k.startsWith(`${p}/`));
  for (const k of visible) {
    const own = scope ? chatKey(scope.sid, k) : k;
    if (st.files[own]) useStore.getState().deleteFile(own);
    else if (st.files[k]) useStore.getState().deleteFile(k);
  }
  return visible.length;
}

export function bytesOf(f: VFile): Uint8Array {
  if (!f.binary) return new TextEncoder().encode(f.data);
  const bin = atob(f.data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function writeText(path: string, content: string): VFile {
  const p = normPath(path);
  useStore.getState().writeFile({ path: storeKey(p), data: content, binary: false, mime: mimeFor(p) });
  return files()[p]!;
}

export function writeBytes(path: string, bytes: Uint8Array, mime?: string): VFile {
  const p = normPath(path);
  if (isTextPath(p) && !isImage(p)) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (!text.includes('\u0000')) return writeText(p, text);
  }
  useStore.getState().writeFile({
    path: storeKey(p),
    data: toBase64(bytes),
    binary: true,
    mime: mime || mimeFor(p),
    size: bytes.length,
  });
  return files()[p]!;
}

/** Unique path for an upload (keeps existing files). */
export function uniquePath(path: string): string {
  const p = normPath(path);
  if (!files()[p]) return p;
  const ext = extOf(p);
  const base = ext ? p.slice(0, -ext.length) : p;
  for (let i = 2; ; i++) if (!files()[`${base}-${i}${ext}`]) return `${base}-${i}${ext}`;
}

export async function importBrowserFile(file: File, dir = 'uploads'): Promise<VFile> {
  const path = uniquePath(`${dir}/${file.name}`);
  return writeBytes(path, new Uint8Array(await file.arrayBuffer()), file.type);
}

/** Readable text of any workspace file (documents are extracted). */
export async function readAsText(path: string): Promise<{ text: string; kind: string }> {
  const f = getFile(path);
  if (!f) throw new Error(`Fichier introuvable : ${path}. Utilisez filesystem.list.`);
  if (!f.binary) return { text: f.data, kind: 'text' };
  if (isDocument(f.path)) {
    const doc = await extractDocumentBytes(f.path, bytesOf(f));
    return { text: doc.text, kind: doc.kind };
  }
  throw new Error(`${f.path} est un fichier binaire (${f.mime}). Pour un tableur, utilisez data.inspect.`);
}

export function dataUrl(f: VFile): string {
  return `data:${f.mime};base64,${f.binary ? f.data : toBase64(new TextEncoder().encode(f.data))}`;
}

export function download(name: string, data: Uint8Array | string, mime = 'application/octet-stream'): void {
  const blob = new Blob([typeof data === 'string' ? data : (data.slice().buffer as ArrayBuffer)], {
    type: mime,
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

export function downloadFile(f: VFile): void {
  download(f.path.split('/').pop()!, bytesOf(f), f.mime);
}

const WEB_REF = /^(https?:|mailto:|tel:|#|data:|blob:)/i;
/** True for a link that points at a local file (Windows path, file://, sandbox:, relative…), not the web. */
export const isLocalRef = (ref: string): boolean => Boolean(ref) && !WEB_REF.test(ref.trim());

/** Resolve a link / path written by the model to a file of the workspace (exact path, then unique-ish basename). */
export function findFileByRef(ref: string, sid?: string | null): VFile | undefined {
  const view = sid === undefined ? files() : filesFor(sid, sid ? sessionAllow(sid) : undefined);
  let r = ref.trim();
  try {
    r = decodeURIComponent(r);
  } catch {
    /* keep raw */
  }
  r = r
    .replace(/^(file:\/*|sandbox:\/*|computer:\/*)/i, '')
    .replace(/^[A-Za-z]:[\\/]/, '')
    .replace(/\\/g, '/');
  const all = Object.values(view);
  try {
    const exact = view[normPath(r)];
    if (exact) return exact;
  } catch {
    /* not a clean path */
  }
  const base = r.split('/').pop()!.toLowerCase();
  if (!base) return undefined;
  const hits = all.filter((f) => f.path.split('/').pop()!.toLowerCase() === base);
  return hits.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
}

const DELIVERABLE_EXT = /\.(xlsx?|docx?|pptx?|pdf|csv|zip|html?|json|md|txt|png|jpe?g|svg|eml|msg)$/i;
/** Workspace files an assistant message talks about (by name or path), to offer them as downloads. */
export function deliverablesIn(text: string, sid?: string | null): VFile[] {
  const low = text.toLowerCase();
  const view = sid === undefined ? files() : filesFor(sid, sid ? sessionAllow(sid) : undefined);
  return Object.values(view)
    .filter((f) => !f.path.startsWith('.ai/') && DELIVERABLE_EXT.test(f.path))
    .filter((f) => low.includes(f.path.split('/').pop()!.toLowerCase()))
    .slice(0, 12);
}

export function downloadZip(prefix = ''): void {
  const entries: Record<string, Uint8Array> = {};
  for (const f of Object.values(files()))
    if (!prefix || f.path.startsWith(prefix)) entries[f.path] = bytesOf(f);
  download(
    `${prefix.replace(/\/$/, '') || 'workspace'}.zip`,
    zipSync(entries, { level: 6 }),
    'application/zip',
  );
}

export function tree(): string {
  const all = Object.values(files()).sort((a, b) => a.path.localeCompare(b.path));
  if (!all.length) return '(espace de travail vide)';
  return all.map((f) => `${f.path}  (${f.size} o)`).join('\n');
}

/** Shared-workspace paths a chat may see: what it attached and what the user named in it (exact path). */
export function sessionAllow(sid: string): Set<string> {
  const st = useStore.getState();
  const sess = st.sessions.find((x) => x.id === sid);
  const allow = new Set<string>();
  if (!sess) return allow;
  const shared = Object.keys(st.files).filter((k) => !k.startsWith(CHAT_PREFIX) && !k.startsWith('.ai/'));
  for (const it of sess.items) {
    if (it.kind !== 'user') continue;
    for (const a of it.attachments ?? []) allow.add(normPath(a.path));
    const low = (it.text ?? '').toLowerCase();
    for (const k of shared) if (k.length > 3 && low.includes(k.toLowerCase())) allow.add(k);
  }
  return allow;
}
