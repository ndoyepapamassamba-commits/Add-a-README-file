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

export const files = () => useStore.getState().files;
export const getFile = (p: string): VFile | undefined => files()[normPath(p)];

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
  useStore.getState().writeFile({ path: p, data: content, binary: false, mime: mimeFor(p) });
  return files()[p]!;
}

export function writeBytes(path: string, bytes: Uint8Array, mime?: string): VFile {
  const p = normPath(path);
  if (isTextPath(p) && !isImage(p)) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (!text.includes('\u0000')) return writeText(p, text);
  }
  useStore.getState().writeFile({
    path: p,
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
