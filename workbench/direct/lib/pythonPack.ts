// Offline Python pack (Pyodide + numpy / pandas / openpyxl / xlrd / pypdf).
// Imported once from a .zip (npm run build:python-pack), checked file by file
// against the SHA-256 of its manifest, then kept in this browser (IndexedDB) and
// handed to the code sandbox, so `python` works with the network blocked.
import JSZip from 'jszip';
import { kv } from './db';

export const PYODIDE_VERSION = '0.27.7';

export interface PythonPackManifest {
  kind: 'massamba-python-pack';
  version: string;
  builtAt: string;
  core: string[];
  /** Wheels installed in this order (Pyodide packages first, then PyPI wheels). */
  wheels: string[];
  sha256: Record<string, string>;
  sources: string[];
}
export interface PythonPack {
  manifest: PythonPackManifest;
  files: Record<string, ArrayBuffer>;
}

let cache: PythonPack | null | undefined;

async function sha256(b: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', b);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Reads and verifies a pack. Throws on any missing or altered file. */
export async function parsePythonPack(bytes: ArrayBuffer | Uint8Array): Promise<PythonPack> {
  const zip = await JSZip.loadAsync(bytes);
  const m = zip.file('manifest.json');
  if (!m) throw new Error('manifest.json absent : ce fichier n’est pas un pack Python MASSAMBA');
  const manifest = JSON.parse(await m.async('string')) as PythonPackManifest;
  if (manifest.kind !== 'massamba-python-pack') throw new Error('Pack Python invalide');
  const files: Record<string, ArrayBuffer> = {};
  for (const name of [...manifest.core, ...manifest.wheels]) {
    const f = zip.file(name);
    if (!f) throw new Error(`Fichier manquant dans le pack : ${name}`);
    const b = await f.async('arraybuffer');
    if (manifest.sha256[name] && (await sha256(b)) !== manifest.sha256[name])
      throw new Error(`Empreinte SHA-256 incorrecte : ${name} (pack altéré)`);
    files[name] = b;
  }
  return { manifest, files };
}

export async function importPythonPack(bytes: ArrayBuffer | Uint8Array): Promise<PythonPackManifest> {
  const pack = await parsePythonPack(bytes);
  await kv.set('pythonPack', pack);
  cache = pack;
  return pack.manifest;
}

export async function getPythonPack(): Promise<PythonPack | null> {
  if (cache !== undefined) return cache;
  cache = (await kv.get<PythonPack>('pythonPack').catch(() => undefined)) ?? null;
  return cache;
}

export async function removePythonPack(): Promise<void> {
  await kv.del('pythonPack');
  cache = null;
}
