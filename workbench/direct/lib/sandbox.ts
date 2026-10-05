// Runs JavaScript or Python in an isolated iframe (opaque origin: no access to
// this page, its storage or the OpenRouter key). Workspace files are copied in
// (text as strings, binaries such as PDF / Excel as bytes); the sandbox can ask
// the page for the extracted text of a PDF / Word / PowerPoint file (readText).
// Python uses Pyodide: from the offline pack imported in this browser when there
// is one (no network needed), otherwise from the CDN (two mirrors).
import { PYODIDE_VERSION, getPythonPack } from './pythonPack';

export const PYODIDE_MIRRORS = [
  `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
  `https://fastly.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
];

const RUNNER = `<!doctype html><meta charset="utf-8"><script>
const send = (m) => parent.postMessage(m, '*');
const PACK_BASE = 'https://pyodide.massamba.invalid/';
const MIRRORS = ${JSON.stringify(PYODIDE_MIRRORS)};
let py = null;
let pack = null;
let rpcN = 0;
const rpcWait = new Map();
const rpc = (op, path) => new Promise((res, rej) => { const id = 'r' + (++rpcN); rpcWait.set(id, { res, rej }); send({ rpc: id, op, path }); });
const realFetch = fetch.bind(globalThis);
globalThis.fetch = (u, o) => {
  const s = String(u && u.url ? u.url : u);
  if (pack && s.startsWith(PACK_BASE)) {
    const n = decodeURIComponent(s.slice(PACK_BASE.length).split('?')[0]);
    const b = pack.files[n];
    if (!b) return Promise.resolve(new Response('absent du pack hors-ligne : ' + n, { status: 404 }));
    return Promise.resolve(new Response(b, { headers: { 'Content-Type': n.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' } }));
  }
  return realFetch(u, o);
};
const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
async function startPython(log) {
  if (pack) {
    log('[Python hors-ligne : pack ' + pack.manifest.version + ']');
    const txt = (n) => new TextDecoder().decode(pack.files[n]);
    (0, eval)(txt('pyodide.js'));
    (0, eval)(txt('pyodide.asm.js') + '\\n;globalThis._createPyodideModule = _createPyodideModule;');
    return loadPyodide({ indexURL: PACK_BASE });
  }
  let last = null;
  for (const base of MIRRORS) {
    try { log('[chargement de Python (Pyodide) depuis ' + new URL(base).host + '…]'); await loadScript(base + 'pyodide.js'); return await loadPyodide({ indexURL: base }); }
    catch (e) { last = e; }
  }
  throw new Error('PYTHON_UNAVAILABLE: Pyodide inaccessible (réseau ou CDN bloqué : ' + (last && last.message) + '). Importez le pack Python hors-ligne (Plugins → Python hors-ligne) ou utilisez JavaScript (code.run language=javascript / node), qui lit aussi les PDF, Excel et Word.');
}
const PY_PRELUDE = 'import js as _js\\nasync def read_text(path):\\n    """Extracted text of a workspace PDF / Word / PowerPoint / text file."""\\n    return str(await _js.readText(path))\\n';
const OPTIONAL = [['openpyxl', /openpyxl|read_excel|to_excel/], ['et_xmlfile', /openpyxl|read_excel|to_excel/], ['pypdf', /pypdf/], ['xlrd', /xlrd|read_excel/]];
addEventListener('message', async (ev) => {
  const d = ev.data || {};
  if (d.rpcReply) { const w = rpcWait.get(d.rpcReply); rpcWait.delete(d.rpcReply); if (w) d.ok ? w.res(d.data) : w.rej(new Error(d.error)); return; }
  if (d.pack) { pack = d.pack; send({ packReady: true }); return; }
  const { id, lang, code, files } = d;
  if (!id) return;
  const logs = [];
  const out = {};
  const fmt = (v) => typeof v === 'string' ? v : (() => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } })();
  const log = (...a) => logs.push(a.map(fmt).join(' '));
  const all = files || {};
  globalThis.readText = (p) => typeof all[p] === 'string' ? Promise.resolve(all[p]) : rpc('text', p);
  try {
    let result;
    if (lang === 'python') {
      if (!py) py = await startPython(log);
      py.setStdout({ batched: (s) => logs.push(s) });
      py.setStderr({ batched: (s) => logs.push('[stderr] ' + s) });
      py.FS.mkdirTree('/workspace'); py.FS.chdir('/workspace');
      for (const [p, t] of Object.entries(all)) { const dd = p.split('/').slice(0, -1).join('/'); if (dd) py.FS.mkdirTree('/workspace/' + dd); py.FS.writeFile('/workspace/' + p, t); }
      try { await py.loadPackagesFromImports(code); } catch (e) { log('[paquets] ' + e.message); }
      for (const [name, re] of OPTIONAL) {
        if (!re.test(code)) continue;
        try {
          if (pack) { const w = pack.manifest.wheels.find((f) => f.toLowerCase().startsWith(name.replace('-', '_') + '-')); if (w) await py.loadPackage(PACK_BASE + w); }
          else { await py.loadPackage('micropip'); await py.pyimport('micropip').install(name); }
        } catch (e) { log('[paquet ' + name + '] ' + e.message); }
      }
      try { py.FS.mkdirTree('/workspace/outputs'); } catch {}
      await py.runPythonAsync(PY_PRELUDE);
      result = await py.runPythonAsync(code);
      for (const n of py.FS.readdir('/workspace/outputs')) if (n !== '.' && n !== '..') {
        try { const b = py.FS.readFile('/workspace/outputs/' + n); try { out['outputs/' + n] = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { out['outputs/' + n] = b; } } catch {}
      }
      if (result && result.toJs) result = result.toJs();
    } else {
      const console = { log, info: log, warn: (...a) => log('[warn]', ...a), error: (...a) => log('[error]', ...a), table: (t) => log(t) };
      const readFile = (p) => { if (!(p in all)) throw new Error('Fichier introuvable : ' + p + ' (fichiers : ' + Object.keys(all).slice(0, 20).join(', ') + ')'); return all[p]; };
      const readBytes = (p) => { const v = readFile(p); return typeof v === 'string' ? new TextEncoder().encode(v) : v; };
      const writeFile = (p, t) => { out[p] = t instanceof Uint8Array ? t : t instanceof ArrayBuffer ? new Uint8Array(t) : String(t); };
      const fn = new Function('console', 'readFile', 'readBytes', 'readText', 'writeFile', 'files', '"use strict"; return (async () => {\\n' + code + '\\n})();');
      result = await fn(console, readFile, readBytes, globalThis.readText, writeFile, Object.keys(all));
    }
    send({ id, ok: true, logs, result: result === undefined ? undefined : fmt(result), files: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : e && e.message ? e.message : e && e.type ? 'événement ' + e.type + (e.target && e.target.src ? ' ' + e.target.src : '') : (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
    send({ id, ok: false, logs, error: msg + (e && e.stack ? '\\n' + String(e.stack).split('\\n').slice(1, 4).join('\\n') : ''), files: out });
  }
});
send({ ready: true });
<\/script>`; // eslint-disable-line no-useless-escape -- keeps the inlined bundle's <script> tag intact

let frame: HTMLIFrameElement | null = null;
let ready: Promise<void> | null = null;
let packSent = false;

function ensure(): Promise<void> {
  if (frame && ready) return ready;
  frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.style.display = 'none';
  frame.srcdoc = RUNNER;
  packSent = false;
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

/** Hands the offline Python pack to the sandbox once (copied, the stored pack stays intact). */
async function sendPack(): Promise<void> {
  if (packSent) return;
  const pack = await getPythonPack();
  packSent = true;
  if (!pack) return;
  await new Promise<void>((resolve) => {
    const onMsg = (e: MessageEvent) => {
      if (e.source === frame?.contentWindow && (e.data as { packReady?: boolean })?.packReady) {
        removeEventListener('message', onMsg);
        resolve();
      }
    };
    addEventListener('message', onMsg);
    frame!.contentWindow!.postMessage({ pack }, '*');
  });
}

export function resetSandbox(): void {
  frame?.remove();
  frame = null;
  ready = null;
  packSent = false;
}

export interface RunResult {
  ok: boolean;
  logs: string[];
  result?: string;
  error?: string;
  /** Files written by the code: text, or bytes for binary outputs. */
  files: Record<string, string | Uint8Array>;
}

export interface SandboxHost {
  /** Extracted text of a workspace file (PDF, Word, PowerPoint…), for readText(). */
  readText?: (path: string) => Promise<string>;
}

export async function runCode(
  lang: 'javascript' | 'python',
  code: string,
  files: Record<string, string | Uint8Array>,
  timeoutMs = 120_000,
  signal?: AbortSignal,
  host: SandboxHost = {},
): Promise<RunResult> {
  await ensure();
  if (lang === 'python') await sendPack();
  const id = Math.random().toString(36).slice(2);
  return new Promise<RunResult>((resolve) => {
    const done = (r: RunResult) => {
      clearTimeout(timer);
      removeEventListener('message', onMsg);
      resolve(r);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame?.contentWindow) return;
      const d = e.data as RunResult & { id?: string; rpc?: string; op?: string; path?: string };
      if (d?.rpc) {
        const reply = (m: Record<string, unknown>) =>
          frame?.contentWindow?.postMessage({ rpcReply: d.rpc, ...m }, '*');
        if (!host.readText) reply({ ok: false, error: 'readText indisponible' });
        else
          host
            .readText(String(d.path))
            .then((data) => reply({ ok: true, data }))
            .catch((err: unknown) => reply({ ok: false, error: (err as Error).message ?? String(err) }));
        return;
      }
      if (d?.id === id) done(d);
    };
    const kill = (why: string) => {
      resetSandbox();
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
