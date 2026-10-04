// Runs JavaScript or Python in an isolated iframe (opaque origin: no access to
// this page, its storage or the OpenRouter key). Python uses Pyodide (CDN).
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';

const RUNNER = `<!doctype html><meta charset="utf-8"><script>
const send = (m) => parent.postMessage(m, '*');
let py = null;
addEventListener('message', async (ev) => {
  const { id, lang, code, files } = ev.data || {};
  if (!id) return;
  const logs = [];
  const out = {};
  const fmt = (v) => typeof v === 'string' ? v : (() => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } })();
  const log = (...a) => logs.push(a.map(fmt).join(' '));
  try {
    let result;
    if (lang === 'python') {
      if (!py) {
        log('[chargement de Python (Pyodide)…]');
        await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '${PYODIDE}pyodide.js'; s.onload = res; s.onerror = () => rej(new Error('Pyodide indisponible (réseau bloqué ?)')); document.head.appendChild(s); });
        py = await loadPyodide({ indexURL: '${PYODIDE}' });
      }
      py.setStdout({ batched: (s) => logs.push(s) });
      py.setStderr({ batched: (s) => logs.push('[stderr] ' + s) });
      for (const [p, t] of Object.entries(files || {})) { const d = p.split('/').slice(0, -1).join('/'); if (d) py.FS.mkdirTree(d); py.FS.writeFile(p, t); }
      try { await py.loadPackagesFromImports(code); } catch (e) { log('[paquets] ' + e.message); }
      try { py.FS.mkdirTree('outputs'); } catch {}
      result = await py.runPythonAsync(code);
      for (const n of py.FS.readdir('outputs')) if (n !== '.' && n !== '..') { try { out['outputs/' + n] = py.FS.readFile('outputs/' + n, { encoding: 'utf8' }); } catch {} }
      if (result && result.toJs) result = result.toJs();
    } else {
      const console = { log, info: log, warn: (...a) => log('[warn]', ...a), error: (...a) => log('[error]', ...a), table: (t) => log(t) };
      const readFile = (p) => { if (!(p in (files || {}))) throw new Error('Fichier introuvable : ' + p); return files[p]; };
      const writeFile = (p, t) => { out[p] = String(t); };
      const fn = new Function('console', 'readFile', 'writeFile', 'files', '"use strict"; return (async () => {\\n' + code + '\\n})();');
      result = await fn(console, readFile, writeFile, Object.keys(files || {}));
    }
    send({ id, ok: true, logs, result: result === undefined ? undefined : fmt(result), files: out });
  } catch (e) {
    send({ id, ok: false, logs, error: (e && e.message) || String(e), files: out });
  }
});
send({ ready: true });
<\/script>`; // eslint-disable-line no-useless-escape -- keeps the inlined bundle's <script> tag intact

let frame: HTMLIFrameElement | null = null;
let ready: Promise<void> | null = null;

function ensure(): Promise<void> {
  if (frame && ready) return ready;
  frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.style.display = 'none';
  frame.srcdoc = RUNNER;
  ready = new Promise((resolve) => {
    const onMsg = (e: MessageEvent) => {
      if (e.source === frame?.contentWindow && (e.data as { ready?: boolean })?.ready) {
        removeEventListener('message', onMsg);
        resolve();
      }
    };
    addEventListener('message', onMsg);
  });
  document.body.appendChild(frame);
  return ready;
}

function reset(): void {
  frame?.remove();
  frame = null;
  ready = null;
}

export interface RunResult {
  ok: boolean;
  logs: string[];
  result?: string;
  error?: string;
  files: Record<string, string>;
}

export async function runCode(
  lang: 'javascript' | 'python',
  code: string,
  files: Record<string, string>,
  timeoutMs = 120_000,
  signal?: AbortSignal,
): Promise<RunResult> {
  await ensure();
  const id = Math.random().toString(36).slice(2);
  return new Promise<RunResult>((resolve) => {
    const done = (r: RunResult) => {
      clearTimeout(timer);
      removeEventListener('message', onMsg);
      resolve(r);
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data as RunResult & { id?: string };
      if (e.source === frame?.contentWindow && d?.id === id) done(d);
    };
    const kill = (why: string) => {
      reset();
      done({ ok: false, logs: [], error: why, files: {} });
    };
    const timer = setTimeout(
      () => kill(`Délai dépassé (${timeoutMs / 1000} s) : exécution arrêtée`),
      timeoutMs,
    );
    signal?.addEventListener('abort', () => kill('Annulé'));
    addEventListener('message', onMsg);
    frame!.contentWindow!.postMessage({ id, lang, code, files }, '*');
  });
}
