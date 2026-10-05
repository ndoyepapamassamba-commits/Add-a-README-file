// Runs code over the workspace in the sandbox (shared by code.run and the
// terminal's node / python): text files as strings, binaries (PDF, Excel, Word,
// images…) as bytes, extracted text on demand (readText), outputs saved back.
import { runCode, type RunResult } from './sandbox';
import { bytesOf, files, getFile, normPath, readAsText, writeBytes, writeText } from './vfs';

const MAX_TOTAL = 80_000_000;

export interface WorkspaceRun extends RunResult {
  saved: string[];
}

export async function runInWorkspace(
  lang: 'javascript' | 'python',
  code: string,
  paths: string[] = Object.keys(files()),
  signal?: AbortSignal,
  timeoutMs = 120_000,
): Promise<WorkspaceRun> {
  const input: Record<string, string | Uint8Array> = {};
  let total = 0;
  for (const p of paths) {
    const f = getFile(p);
    if (!f) continue;
    const v = f.binary ? bytesOf(f) : f.data;
    const n = typeof v === 'string' ? v.length : v.byteLength;
    if (total + n > MAX_TOTAL) continue;
    total += n;
    input[f.path] = v;
  }
  const r = await runCode(lang, code, input, timeoutMs, signal, {
    readText: async (p) => {
      if (!getFile(p)) throw new Error(`Fichier introuvable : ${p}`);
      return (await readAsText(p)).text;
    },
  });
  const saved: string[] = [];
  for (const [p, v] of Object.entries(r.files ?? {})) {
    try {
      if (typeof v === 'string') writeText(p, v);
      else writeBytes(p, v);
      saved.push(normPath(p));
    } catch {
      /* invalid path */
    }
  }
  return { ...r, saved };
}
