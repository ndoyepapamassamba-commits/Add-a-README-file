// Embedded terminal: the pure shell bound to the browser workspace, the code
// sandbox (node / python), the network (CORS) and the embedded browser.
import { DataCore, isDataFile, profileToText } from '../../server/services/dataCore';
import { browser } from './browser';
import { runInWorkspace } from './run';
import { getPythonPack } from './pythonPack';
import { PYODIDE_MIRRORS } from './sandbox';
import { Shell, type ShellHost } from './shellCore';
import { useStore } from './store';
import { bytesOf, files, getFile, removeFile, writeBytes, writeText } from './vfs';

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
    remove: (p) => void removeFile(p),
    copy: (a, b) => {
      const f = getFile(a);
      if (!f) throw new Error(`${a}: introuvable`);
      if (f.binary) writeBytes(b, bytesOf(f), f.mime);
      else writeText(b, f.data);
    },
  },
  async run(lang, code, paths) {
    const r = await runInWorkspace(lang, code, paths);
    const out = [
      r.logs.join('\n'),
      r.result !== undefined && r.result !== 'undefined' ? r.result : '',
      r.error ? `Error: ${r.error}` : '',
      r.saved.length ? `(fichiers enregistrés : ${r.saved.join(', ')})` : '',
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
  async doctor() {
    const pack = await getPythonPack();
    const probe = async (url: string) => {
      try {
        await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(6000) });
        return true;
      } catch {
        return false;
      }
    };
    const cdn = await Promise.all(PYODIDE_MIRRORS.map((u) => probe(`${u}pyodide.js`)));
    const net = await probe('https://openrouter.ai/api/v1/models');
    const nBin = Object.values(files()).filter((f) => f.binary).length;
    return [
      `node    : OK — JavaScript du navigateur (bac à sable), fs texte + binaire, Buffer, readText() pour PDF / Word (${Object.keys(files()).length} fichiers, dont ${nBin} binaires)`,
      `python  : ${pack ? `OK hors-ligne — pack ${pack.manifest.version} (${pack.manifest.wheels.map((w) => w.split('-')[0]).join(', ')})` : cdn.some(Boolean) ? 'OK en ligne — Pyodide via CDN (premier lancement ≈ 15 s)' : 'INDISPONIBLE — CDN bloqué et aucun pack hors-ligne : Plugins → Python hors-ligne, ou utilisez node'}`,
      ...PYODIDE_MIRRORS.map((u, i) => `  CDN ${new URL(u).host} : ${cdn[i] ? 'joignable' : 'bloqué'}`),
      `réseau  : OpenRouter ${net ? 'joignable' : 'injoignable'}`,
      'système : pas de vrai OS dans cette édition (npm, git, pip, bash → édition serveur)',
    ].join('\n');
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
