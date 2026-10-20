// Builds dist/massamba-python-pack.zip: Pyodide (CPython 3.12 compiled to
// WebAssembly) + numpy, pandas, openpyxl, xlrd, pypdf. Imported once in the
// direct edition (Plugins → Python hors-ligne), it makes `python` work with no
// network access (corporate networks often block the CDN). Files come from the
// official Pyodide CDN and PyPI; each file's SHA-256 is recorded in the manifest
// and checked again when the pack is imported.
//   npm run build:python-pack
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { PYODIDE_VERSION, type PythonPackManifest } from '../direct/lib/pythonPack';

const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const CORE = ['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
/** Pyodide-built packages (from the lock file), installed in this order. */
const PYODIDE_PKGS = ['six', 'python-dateutil', 'pytz', 'numpy', 'pandas', 'xlrd', 'packaging', 'micropip'];
/** Pure-Python wheels from PyPI (not in the Pyodide distribution). */
const PYPI = ['et-xmlfile', 'openpyxl', 'pypdf'];

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/massamba-python-pack.zip');
const sha = (b: Uint8Array) => crypto.createHash('sha256').update(b).digest('hex');
async function get(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

const zip = new JSZip();
const manifest: PythonPackManifest = {
  kind: 'massamba-python-pack',
  version: PYODIDE_VERSION,
  builtAt: new Date().toISOString(),
  core: CORE,
  wheels: [],
  sha256: {},
  sources: [],
};
for (const f of CORE) {
  const b = await get(CDN + f);
  zip.file(f, b);
  manifest.sha256[f] = sha(b);
}
manifest.sources.push(CDN);
const lock = JSON.parse(new TextDecoder().decode(await get(`${CDN}pyodide-lock.json`))) as {
  packages: Record<string, { file_name: string; sha256: string }>;
};
for (const n of PYODIDE_PKGS) {
  const p = lock.packages[n];
  if (!p) throw new Error(`package ${n} missing from pyodide-lock.json`);
  const b = await get(CDN + p.file_name);
  if (sha(b) !== p.sha256) throw new Error(`${p.file_name}: SHA-256 differs from pyodide-lock.json`);
  zip.file(p.file_name, b);
  manifest.wheels.push(p.file_name);
  manifest.sha256[p.file_name] = p.sha256;
}
for (const n of PYPI) {
  const meta = (await (await fetch(`https://pypi.org/pypi/${n}/json`)).json()) as {
    info: { version: string };
    releases: Record<string, { filename: string; url: string; digests: { sha256: string } }[]>;
  };
  const w = meta.releases[meta.info.version]!.find((u) => u.filename.endsWith('-none-any.whl'));
  if (!w) throw new Error(`${n}: no pure-Python wheel`);
  const b = await get(w.url);
  if (sha(b) !== w.digests.sha256) throw new Error(`${w.filename}: SHA-256 differs from PyPI`);
  zip.file(w.filename, b);
  manifest.wheels.push(w.filename);
  manifest.sha256[w.filename] = w.digests.sha256;
  manifest.sources.push(w.url);
}
zip.file('manifest.json', JSON.stringify(manifest, null, 2));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
console.log(`${out} — ${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${manifest.wheels.length} paquets`);
