// Embedded terminal: the pure shell bound to the browser workspace, the code
// sandbox (node / python), the network (CORS) and the embedded browser.
import { DataCore, isDataFile, profileToText } from '../../server/services/dataCore';
import { browser } from './browser';
import { runCode } from './sandbox';
import { Shell, type ShellHost } from './shellCore';
import { useStore } from './store';
import { bytesOf, files, getFile, writeBytes, writeText } from './vfs';

const data = new DataCore();

export const host: ShellHost = {
  fs: {
    list: () => Object.keys(files()).sort(),
    read: (p) => {
      const f = getFile(p);
      return f && !f.binary ? f.data : null;
    },
    isBinary: (p) => Boolean(getFile(p)?.binary),
    size: (p) => getFile(p)?.size ?? getFile(p)?.data.length ?? 0,
    write: (p, t) => void writeText(p, t),
    remove: (p) => useStore.getState().deleteFile(p),
    copy: (a, b) => {
      const f = getFile(a);
      if (!f) throw new Error(`${a}: introuvable`);
      if (f.binary) writeBytes(b, bytesOf(f), f.mime);
      else writeText(b, f.data);
    },
  },
  async run(lang, code, paths) {
    const input: Record<string, string> = {};
    for (const p of paths) {
      const f = getFile(p);
      if (f && !f.binary && f.data.length < 5_000_000) input[f.path] = f.data;
    }
    const r = await runCode(lang, code, input, 120_000);
    const saved: string[] = [];
    for (const [p, t] of Object.entries(r.files ?? {})) {
      writeText(p, t);
      saved.push(p);
    }
    const out = [
      r.logs.join('\n'),
      r.result !== undefined && r.result !== 'undefined' ? r.result : '',
      r.error ? `Error: ${r.error}` : '',
      saved.length ? `(fichiers enregistrés : ${saved.join(', ')})` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return { out, ok: r.ok && !r.error };
  },
  async fetchText(url) {
    try {
      const r = await fetch(url);
      return await r.text();
    } catch {
      // Blocked by CORS: read the page through the reader service instead.
      const r = await fetch(`https://r.jina.ai/${url}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }
  },
  open(path) {
    void browser.open(path);
    useStore.getState().setView('browser');
  },
  async profile(path) {
    const f = getFile(path);
    if (!f || !isDataFile(path)) throw new Error(`${path} n'est pas un fichier de données`);
    const ds = data.parseBytes(path, bytesOf(f), null);
    return profileToText({ ...data.profile(ds), path });
  },
};

/** The user's terminal and the agent's terminal share the same workspace (separate cwd/history). */
export const userShell = new Shell(host);
export const agentShell = new Shell(host);
