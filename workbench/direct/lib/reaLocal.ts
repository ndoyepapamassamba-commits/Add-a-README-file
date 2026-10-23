/**
 * REA LOCAL (23/10/2026, « intègre le skill REA comme skills dans le workbench ») — the REA method (evidence id,
 * observed / inferred / unknown, no execution of the target) applied in the browser to a workspace file, for when the
 * local bridge is not running or when REA lacks an external provider (measured through the bridge on 23/10/2026:
 * inspect_wasm_artifact asks for WABT 1.0.42, inspect_sqlite_database for Node 24.15+). Formats read by their bytes:
 * ZIP family (Office, APK, JAR, IPA, wheel, VSIX, MCPB, CRX), gzip / tar (npm .tgz), WebAssembly (sections + the
 * engine's own imports / exports), SQLite (header + schema text), ELF, PE, Mach-O, PDF, images, JavaScript / JSON /
 * text (imports, exports, endpoints, environment names, masked secrets), and printable strings for anything else.
 */
import { gunzipSync, unzipSync } from 'fflate';

export type ReaMode = 'overview' | 'strings' | 'search';
export interface ReaLocalReport {
  evidenceId: string;
  sha256: string;
  format: string;
  observed: string[];
  inferred: string[];
  unknown: string[];
  text: string;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function sha256(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}
const n = (v: number) => v.toLocaleString('fr-FR');
const ascii = (b: Uint8Array, from: number, len: number) =>
  String.fromCharCode(...b.subarray(from, from + len));
const u16 = (b: Uint8Array, o: number, le = true) => new DataView(b.buffer, b.byteOffset).getUint16(o, le);
const u32 = (b: Uint8Array, o: number, le = true) => new DataView(b.buffer, b.byteOffset).getUint32(o, le);
const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);

/** Printable runs of at least `min` characters (ASCII + UTF-8 letters), the first `max`. */
export function printableStrings(b: Uint8Array, min = 6, max = 400): string[] {
  const out: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur.length >= min && out.length < max) out.push(cur);
    cur = '';
  };
  for (let i = 0; i < b.length && out.length < max; i++) {
    const c = b[i]!;
    if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c);
    else flush();
  }
  flush();
  return out;
}
const SECRET =
  /(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|hf_[A-Za-z0-9]{20,})/g;
const mask = (s: string) => `${s.slice(0, 6)}…[masqué]`;

function leb(b: Uint8Array, o: number): [number, number] {
  let r = 0;
  let shift = 0;
  let i = o;
  for (;;) {
    const x = b[i++]!;
    r |= (x & 0x7f) << shift;
    if (!(x & 0x80)) break;
    shift += 7;
  }
  return [r >>> 0, i];
}
const WASM_SECTIONS = [
  'custom',
  'type',
  'import',
  'function',
  'table',
  'memory',
  'global',
  'export',
  'start',
  'element',
  'code',
  'data',
  'datacount',
  'tag',
];

async function wasm(b: Uint8Array, r: Partial<ReaLocalReport>) {
  r.format = 'WebAssembly';
  r.observed!.push(`version binaire ${u32(b, 4)}`);
  let o = 8;
  const secs: string[] = [];
  while (o < b.length) {
    const id = b[o]!;
    const [size, next] = leb(b, o + 1);
    let label = WASM_SECTIONS[id] ?? `inconnue(${id})`;
    if (id === 0) {
      const [nl, p] = leb(b, next);
      label = `custom « ${new TextDecoder().decode(b.subarray(p, p + nl))} »`;
    }
    secs.push(`${label} ${n(size)} o`);
    o = next + size;
  }
  r.observed!.push(`sections : ${secs.join(', ')}`);
  try {
    const mod = await WebAssembly.compile(b as BufferSource);
    const imp = WebAssembly.Module.imports(mod);
    const exp = WebAssembly.Module.exports(mod);
    r.observed!.push(
      `imports (${imp.length}) : ${
        imp
          .slice(0, 60)
          .map((x) => `${x.module}.${x.name} (${x.kind})`)
          .join(', ') || 'aucun'
      }`,
    );
    r.observed!.push(
      `exports (${exp.length}) : ${
        exp
          .slice(0, 60)
          .map((x) => `${x.name} (${x.kind})`)
          .join(', ') || 'aucun'
      }`,
    );
    if (imp.some((x) => x.module === 'wasi_snapshot_preview1' || x.module === 'wasi_unstable'))
      r.inferred!.push('module WASI (compilé pour une interface système, par ex. Rust / C via wasi-sdk)');
    if (imp.some((x) => /^(env|wbg|__wbindgen)/.test(x.module) || x.name.startsWith('__wbindgen')))
      r.inferred!.push('glue JavaScript attendue (Emscripten env ou wasm-bindgen)');
  } catch (e) {
    r.unknown!.push(
      `le moteur WebAssembly du navigateur refuse de compiler le module : ${(e as Error).message}`,
    );
  }
}

function sqlite(b: Uint8Array, r: Partial<ReaLocalReport>) {
  r.format = 'SQLite 3';
  const page = u16(b, 16, false) === 1 ? 65536 : u16(b, 16, false);
  const enc = ['?', 'UTF-8', 'UTF-16le', 'UTF-16be'][u32(b, 56, false)] ?? '?';
  r.observed!.push(
    `taille de page ${n(page)} o, ${n(u32(b, 28, false))} page(s), encodage ${enc}, user_version ${u32(b, 60, false)}, schéma format ${u32(b, 44, false)}`,
  );
  const text = new TextDecoder('utf-8', { fatal: false }).decode(
    b.subarray(0, Math.min(b.length, 4_000_000)),
  );
  const ddl = [
    ...new Set(text.match(/CREATE (?:TABLE|INDEX|VIEW|TRIGGER|VIRTUAL TABLE)[^\0]{0,400}?\)/g) ?? []),
  ];
  r.observed!.push(
    ddl.length
      ? `schéma (texte de sqlite_master) :\n${ddl
          .slice(0, 40)
          .map((d) => `  ${d.replace(/\s+/g, ' ')}`)
          .join('\n')}`
      : 'aucune instruction CREATE lisible dans les premières pages',
  );
  if (b.length > page && u32(b, 28, false) * page !== b.length)
    r.unknown!.push(
      'taille du fichier ≠ nombre de pages × taille de page : journal WAL ou fichier en cours d’écriture',
    );
}

function zipFamily(b: Uint8Array, r: Partial<ReaLocalReport>, name: string) {
  let entries: Record<string, Uint8Array>;
  const start = starts(b, [0x43, 0x72, 0x32, 0x34]) ? b.indexOf(0x50, 16) : 0; // CRX: zip after its header
  try {
    entries = unzipSync(b.subarray(start), { filter: (f) => f.originalSize < 50_000_000 });
  } catch (e) {
    r.format = 'ZIP (illisible)';
    r.unknown!.push(`archive non décompressable : ${(e as Error).message}`);
    return;
  }
  const names = Object.keys(entries);
  const has = (re: RegExp) => names.some((x) => re.test(x));
  const kind = has(/^\[Content_Types\]\.xml$/)
    ? has(/^word\//)
      ? 'Word (.docx)'
      : has(/^xl\//)
        ? 'Excel (.xlsx)'
        : has(/^ppt\//)
          ? 'PowerPoint (.pptx)'
          : 'Office Open XML'
    : has(/^AndroidManifest\.xml$/)
      ? `Android (${has(/^classes\d*\.dex$/) ? 'APK avec DEX' : 'APK'})`
      : has(/^Payload\/[^/]+\.app\//)
        ? 'iOS (.ipa)'
        : has(/\.dist-info\/METADATA$/)
          ? 'roue Python (.whl)'
          : has(/^extension\.vsixmanifest$/)
            ? 'extension VS Code (.vsix)'
            : has(/^manifest\.json$/) && /\.mcpb$/i.test(name)
              ? 'extension MCP (.mcpb)'
              : has(/^META-INF\/MANIFEST\.MF$/)
                ? 'Java (.jar)'
                : start
                  ? 'extension Chrome (.crx)'
                  : 'ZIP';
  r.format = `ZIP — ${kind}`;
  const total = names.reduce((a, k) => a + entries[k]!.length, 0);
  r.observed!.push(`${names.length} entrée(s), ${n(total)} o décompressés`);
  r.observed!.push(
    `entrées : ${names
      .slice(0, 80)
      .map((k) => `${k} (${n(entries[k]!.length)} o)`)
      .join(', ')}${names.length > 80 ? ' …' : ''}`,
  );
  for (const meta of [
    'package.json',
    'manifest.json',
    'META-INF/MANIFEST.MF',
    'extension.vsixmanifest',
    'docProps/app.xml',
    'docProps/core.xml',
  ])
    if (entries[meta])
      r.observed!.push(`${meta} :\n${new TextDecoder().decode(entries[meta]!.subarray(0, 1500))}`);
  const dist = names.find((k) => /\.dist-info\/METADATA$/.test(k));
  if (dist) r.observed!.push(`${dist} :\n${new TextDecoder().decode(entries[dist]!.subarray(0, 1200))}`);
  if (has(/\.(so|dll|dylib)$/))
    r.inferred!.push(
      `bibliothèques natives embarquées : ${names
        .filter((k) => /\.(so|dll|dylib)$/.test(k))
        .slice(0, 12)
        .join(', ')}`,
    );
  if (has(/vbaProject\.bin$/)) r.inferred!.push('macros VBA présentes (vbaProject.bin)');
}

function tarList(b: Uint8Array): { name: string; size: number }[] {
  const out: { name: string; size: number }[] = [];
  let o = 0;
  while (o + 512 <= b.length && out.length < 2000) {
    const name = ascii(b, o, 100).replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(
      ascii(b, o + 124, 12)
        .replace(/\0.*$/, '')
        .trim() || '0',
      8,
    );
    out.push({ name, size });
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

function elf(b: Uint8Array, r: Partial<ReaLocalReport>) {
  const is64 = b[4] === 2;
  const le = b[5] === 1;
  const type = ['aucun', 'relogeable', 'exécutable', 'objet partagé / PIE', 'core'][u16(b, 16, le)] ?? '?';
  const MACH: Record<number, string> = {
    3: 'x86',
    40: 'ARM',
    62: 'x86-64',
    183: 'AArch64',
    243: 'RISC-V',
    8: 'MIPS',
    20: 'PowerPC',
  };
  r.format = `ELF ${is64 ? '64' : '32'} bits ${le ? 'little' : 'big'}-endian`;
  const entry = is64 ? Number(new DataView(b.buffer, b.byteOffset).getBigUint64(24, le)) : u32(b, 24, le);
  r.observed!.push(
    `type ${type}, machine ${MACH[u16(b, 18, le)] ?? u16(b, 18, le)}, OS/ABI ${b[7]}, point d’entrée 0x${entry.toString(16)}, ${u16(b, is64 ? 60 : 48, le)} section(s)`,
  );
  const interp = printableStrings(b.subarray(0, 4096), 8).find((s) =>
    /^\/lib.*ld-|\/system\/bin\/linker/.test(s),
  );
  if (interp) r.observed!.push(`interpréteur : ${interp}`);
  const libs = [...new Set(printableStrings(b, 4, 4000).filter((s) => /^lib[\w+.-]+\.so(\.\d+)*$/.test(s)))];
  if (libs.length) r.inferred!.push(`bibliothèques probablement liées : ${libs.slice(0, 30).join(', ')}`);
}
function pe(b: Uint8Array, r: Partial<ReaLocalReport>) {
  const off = u32(b, 0x3c);
  if (ascii(b, off, 4) !== 'PE\0\0') {
    r.format = 'MZ (DOS, sans en-tête PE)';
    return;
  }
  const MACH: Record<number, string> = { 0x14c: 'x86', 0x8664: 'x86-64', 0xaa64: 'ARM64', 0x1c0: 'ARM' };
  const nsec = u16(b, off + 6);
  const ts = u32(b, off + 8);
  const optSize = u16(b, off + 20);
  const chars = u16(b, off + 22);
  const magic = u16(b, off + 24);
  const sub = u16(b, off + 24 + 68);
  const SUB: Record<number, string> = { 2: 'graphique (GUI)', 3: 'console', 1: 'natif / pilote', 10: 'EFI' };
  r.format = `PE ${magic === 0x20b ? 'PE32+' : 'PE32'} (${chars & 0x2000 ? 'DLL' : 'exécutable'})`;
  const secs: string[] = [];
  for (let i = 0; i < nsec && i < 40; i++)
    secs.push(ascii(b, off + 24 + optSize + i * 40, 8).replace(/\0+$/, ''));
  r.observed!.push(
    `machine ${MACH[u16(b, off + 4)] ?? u16(b, off + 4).toString(16)}, horodatage ${new Date(ts * 1000).toISOString()}, sous-système ${SUB[sub] ?? sub}, sections : ${secs.join(', ')}`,
  );
  const dlls = [...new Set(printableStrings(b, 5, 6000).filter((s) => /^[\w.-]+\.dll$/i.test(s)))];
  if (dlls.length) r.inferred!.push(`DLL probablement importées : ${dlls.slice(0, 30).join(', ')}`);
  if (printableStrings(b, 8, 6000).some((s) => s.includes('mscoree.dll') || s.includes('_CorExeMain')))
    r.inferred!.push('assemblage .NET (CLR) : décompilation possible avec ILSpy / dnSpy');
}
function macho(b: Uint8Array, r: Partial<ReaLocalReport>) {
  if (starts(b, [0xca, 0xfe, 0xba, 0xbe])) {
    r.format = 'Mach-O universel (fat)';
    r.observed!.push(`${u32(b, 4, false)} architecture(s)`);
    return;
  }
  const le = b[0] === 0xcf || b[0] === 0xce;
  const CPU: Record<number, string> = { 7: 'x86', 0x01000007: 'x86-64', 12: 'ARM', 0x0100000c: 'ARM64' };
  const FT: Record<number, string> = { 1: 'objet', 2: 'exécutable', 6: 'dylib', 8: 'bundle' };
  r.format = `Mach-O ${b[0] === 0xcf || b[3] === 0xcf ? '64' : '32'} bits`;
  r.observed!.push(
    `CPU ${CPU[u32(b, 4, le)] ?? u32(b, 4, le)}, type ${FT[u32(b, 12, le)] ?? u32(b, 12, le)}, ${u32(b, 16, le)} commande(s) de chargement`,
  );
}
function pdf(b: Uint8Array, r: Partial<ReaLocalReport>) {
  const head = ascii(b, 0, 8);
  const t = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 8_000_000)));
  r.format = `PDF ${head.slice(5).trim()}`;
  const pages = (t.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  r.observed!.push(
    `${pages} page(s) déclarée(s)${/\/Encrypt\b/.test(t) ? ', CHIFFRÉ' : ''}${/\/JavaScript\b|\/JS\b/.test(t) ? ', contient du JavaScript' : ''}${/\/EmbeddedFile/.test(t) ? ', fichiers joints' : ''}`,
  );
  for (const k of ['Producer', 'Creator', 'Title', 'Author', 'CreationDate']) {
    const m = new RegExp(`/${k}\\s*\\(([^)]{1,120})\\)`).exec(t);
    if (m) r.observed!.push(`${k} : ${m[1]}`);
  }
}
function image(b: Uint8Array, r: Partial<ReaLocalReport>): boolean {
  if (starts(b, [0x89, 0x50, 0x4e, 0x47])) {
    r.format = 'PNG';
    r.observed!.push(
      `${u32(b, 16, false)} × ${u32(b, 20, false)} px, profondeur ${b[24]} bits, type couleur ${b[25]}`,
    );
    return true;
  }
  if (starts(b, [0xff, 0xd8, 0xff])) {
    r.format = 'JPEG';
    for (let o = 2; o < b.length - 9;) {
      if (b[o] !== 0xff) break;
      const m = b[o + 1]!;
      if (m >= 0xc0 && m <= 0xc3) {
        r.observed!.push(`${u16(b, o + 7, false)} × ${u16(b, o + 5, false)} px`);
        break;
      }
      o += 2 + u16(b, o + 2, false);
    }
    if (ascii(b, 6, 4) === 'Exif')
      r.observed!.push('métadonnées EXIF présentes (appareil, date, parfois position GPS)');
    return true;
  }
  if (ascii(b, 0, 4) === 'GIF8') {
    r.format = 'GIF';
    r.observed!.push(`${u16(b, 6)} × ${u16(b, 8)} px`);
    return true;
  }
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    r.format = 'WebP';
    return true;
  }
  return false;
}
function textual(t: string, name: string, r: Partial<ReaLocalReport>) {
  const lines = t.split('\n').length;
  if (/\.json$/i.test(name) || /^\s*[{[]/.test(t)) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      r.format = name.endsWith('package.json') ? 'manifeste npm (package.json)' : 'JSON';
      r.observed!.push(`clés de premier niveau : ${Object.keys(j).slice(0, 60).join(', ')}`);
      if (j.name || j.version)
        r.observed!.push(
          `nom ${String(j.name ?? '?')} version ${String(j.version ?? '?')}${j.license ? `, licence ${String(j.license)}` : ''}`,
        );
      for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'bin', 'scripts', 'exports'])
        if (j[k] && typeof j[k] === 'object')
          r.observed!.push(
            `${k} : ${Object.entries(j[k] as object)
              .slice(0, 40)
              .map(([a, v]) => `${a} ${typeof v === 'string' ? v : ''}`.trim())
              .join(', ')}`,
          );
      return;
    } catch {
      /* not JSON after all */
    }
  }
  const js =
    /\.(m?js|cjs|ts|tsx|jsx)$/i.test(name) ||
    /\b(function|const|import|export|require)\b/.test(t.slice(0, 5000));
  r.format = js ? 'JavaScript / TypeScript' : 'texte';
  r.observed!.push(
    `${n(lines)} ligne(s), ${n(t.length)} caractères${/sourceMappingURL=/.test(t) ? ', carte de sources référencée' : ''}${lines < 20 && t.length > 50_000 ? ', code minifié' : ''}`,
  );
  if (js) {
    const imports = [
      ...new Set(
        [...t.matchAll(/(?:import\s[^'"]*?from\s*|import\s*\(\s*|require\(\s*)['"]([^'"]{1,120})['"]/g)].map(
          (m) => m[1]!,
        ),
      ),
    ];
    if (imports.length)
      r.observed!.push(`modules importés (${imports.length}) : ${imports.slice(0, 50).join(', ')}`);
    const exportsList = [
      ...new Set(
        [
          ...t.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|let|var)\s+([\w$]+)/g),
        ].map((m) => m[1]!),
      ),
    ];
    if (exportsList.length) r.observed!.push(`exports : ${exportsList.slice(0, 50).join(', ')}`);
    const fns = (t.match(/\bfunction\b|=>/g) ?? []).length;
    r.observed!.push(`${n(fns)} fonction(s) repérée(s) (déclarations et flèches)`);
    const env = [
      ...new Set(
        [...t.matchAll(/process\.env\.([A-Z0-9_]{2,})|import\.meta\.env\.([A-Z0-9_]{2,})/g)].map(
          (m) => m[1] ?? m[2]!,
        ),
      ),
    ];
    if (env.length) r.observed!.push(`variables d’environnement lues : ${env.slice(0, 40).join(', ')}`);
  }
  const urls = [...new Set(t.match(/https?:\/\/[^\s'"`<>)]{4,200}/g) ?? [])];
  if (urls.length) r.observed!.push(`adresses (${urls.length}) : ${urls.slice(0, 40).join(', ')}`);
  const routes = [
    ...new Set([...t.matchAll(/['"`](\/(?:api|v\d|graphql|rest)[\w/{}:.-]*)['"`]/g)].map((m) => m[1]!)),
  ];
  if (routes.length) r.inferred!.push(`routes d’API probables : ${routes.slice(0, 40).join(', ')}`);
}

/** The REA method on one file, in the browser: evidence id, observed / inferred / unknown, nothing executed. */
export async function reaInspect(
  path: string,
  bytes: Uint8Array,
  mode: ReaMode = 'overview',
  pattern = '',
): Promise<ReaLocalReport> {
  const digest = await sha256(bytes);
  const r: Partial<ReaLocalReport> & { observed: string[]; inferred: string[]; unknown: string[] } = {
    observed: [],
    inferred: [],
    unknown: [],
    format: 'inconnu',
  };
  const name = path.split('/').pop() ?? path;
  if (mode === 'strings' || mode === 'search') {
    const all = printableStrings(bytes, 4, 20_000);
    let re: RegExp | null = null;
    if (mode === 'search') {
      try {
        re = new RegExp(pattern || '.', 'i');
      } catch {
        re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }
    }
    const hits = re ? all.filter((s) => re!.test(s)) : all;
    r.format = mode === 'search' ? `recherche « ${pattern} »` : 'chaînes imprimables';
    r.observed.push(
      `${hits.length} chaîne(s)${hits.length > 300 ? ' (300 premières)' : ''} :\n${hits
        .slice(0, 300)
        .map((s) => `  ${s.replace(SECRET, mask).slice(0, 200)}`)
        .join('\n')}`,
    );
  } else if (starts(bytes, [0x00, 0x61, 0x73, 0x6d])) await wasm(bytes, r);
  else if (ascii(bytes, 0, 16) === 'SQLite format 3\0') sqlite(bytes, r);
  else if (starts(bytes, [0x50, 0x4b, 0x03, 0x04]) || starts(bytes, [0x43, 0x72, 0x32, 0x34]))
    zipFamily(bytes, r, name);
  else if (starts(bytes, [0x1f, 0x8b])) {
    try {
      const raw = gunzipSync(bytes);
      if (ascii(raw, 257, 5) === 'ustar') {
        const list = tarList(raw);
        r.format = list.some((x) => x.name === 'package/package.json')
          ? 'tar.gz — paquet npm (.tgz)'
          : 'tar.gz';
        r.observed.push(
          `${list.length} entrée(s) : ${list
            .slice(0, 80)
            .map((x) => `${x.name} (${n(x.size)} o)`)
            .join(', ')}`,
        );
      } else {
        r.format = 'gzip';
        r.observed.push(`${n(raw.length)} o décompressés`);
        textual(new TextDecoder().decode(raw.subarray(0, 2_000_000)), name.replace(/\.gz$/i, ''), r);
      }
    } catch (e) {
      r.format = 'gzip (illisible)';
      r.unknown.push((e as Error).message);
    }
  } else if (starts(bytes, [0x7f, 0x45, 0x4c, 0x46])) elf(bytes, r);
  else if (starts(bytes, [0x4d, 0x5a])) pe(bytes, r);
  else if (
    [
      [0xfe, 0xed, 0xfa, 0xce],
      [0xfe, 0xed, 0xfa, 0xcf],
      [0xce, 0xfa, 0xed, 0xfe],
      [0xcf, 0xfa, 0xed, 0xfe],
      [0xca, 0xfe, 0xba, 0xbe],
    ].some((s) => starts(bytes, s))
  )
    macho(bytes, r);
  else if (ascii(bytes, 0, 5) === '%PDF-') pdf(bytes, r);
  else if (!image(bytes, r)) {
    const head = bytes.subarray(0, 8000);
    if (!head.includes(0)) textual(new TextDecoder().decode(bytes.subarray(0, 5_000_000)), name, r);
    else {
      r.format = 'binaire non reconnu';
      r.observed.push(
        `chaînes imprimables (40 premières) : ${printableStrings(bytes, 6, 40)
          .map((s) => s.slice(0, 80))
          .join(' · ')}`,
      );
    }
  }
  const secrets = [
    ...new Set(new TextDecoder('latin1').decode(bytes.subarray(0, 8_000_000)).match(SECRET) ?? []),
  ];
  if (secrets.length)
    r.inferred.push(
      `${secrets.length} secret(s) probable(s) en clair : ${secrets.slice(0, 5).map(mask).join(', ')} — à retirer et à renouveler`,
    );
  r.unknown.push(
    'analyse statique dans le navigateur, sans exécution : pour un démontage complet (graphe JS, décompilation, désassemblage, Frida) utilisez les outils REA du pont local (mcp.rea.*)',
  );
  const evidenceId = `ev_${await sha256(`${digest}:${mode}:${pattern}:rea-local-1`)}`;
  const text = [
    `REA local (navigateur) — preuve ${evidenceId}`,
    `Fichier : ${path} · ${n(bytes.length)} o · sha256 ${digest}`,
    `Format : ${r.format}`,
    '## Observé',
    ...r.observed.map((x) => `- ${x}`),
    ...(r.inferred.length ? ['## Déduit', ...r.inferred.map((x) => `- ${x}`)] : []),
    '## Inconnu / limites',
    ...r.unknown.map((x) => `- ${x}`),
  ].join('\n');
  return {
    evidenceId,
    sha256: digest,
    format: r.format ?? 'inconnu',
    observed: r.observed,
    inferred: r.inferred,
    unknown: r.unknown,
    text,
  };
}
