// Embedded terminal (pure): a POSIX-like shell over the browser workspace.
// Pipes, redirections, && || ;, quotes, globs, ~35 commands, and node /
// python through the isolated sandbox. No real OS is reachable from here.

export interface ShellFs {
  list(): string[];
  read(path: string): string | null;
  isBinary(path: string): boolean;
  size(path: string): number;
  write(path: string, text: string): void;
  remove(path: string): void;
  copy(from: string, to: string): void;
}
export interface ShellHost {
  fs: ShellFs;
  run?: (
    lang: 'javascript' | 'python',
    code: string,
    files: string[],
  ) => Promise<{ out: string; ok: boolean }>;
  fetchText?: (url: string) => Promise<string>;
  open?: (path: string) => void;
  profile?: (path: string) => Promise<string>;
  now?: () => Date;
}
export interface ShellResult {
  out: string;
  code: number;
  cwd: string;
}

type Tok = { t: 'w'; v: string; q: boolean } | { t: 'op'; v: string };

export function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i]!;
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    const two = line.slice(i, i + 2);
    if (two === '&&' || two === '||' || two === '>>') {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if (c === '|' || c === ';' || c === '>' || c === '<') {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    let v = '';
    let quoted = false;
    while (i < line.length && !' \t|;><'.includes(line[i]!) && line.slice(i, i + 2) !== '&&') {
      const ch = line[i]!;
      if (ch === '"' || ch === "'") {
        quoted = true;
        const end = line.indexOf(ch, i + 1);
        if (end < 0) throw new Error(`guillemet ${ch} non fermé`);
        v += ch === '"' ? line.slice(i + 1, end).replace(/\\(["\\$`])/g, '$1') : line.slice(i + 1, end);
        i = end + 1;
      } else if (ch === '\\' && i + 1 < line.length) {
        v += line[i + 1];
        i += 2;
      } else {
        v += ch;
        i++;
      }
    }
    out.push({ t: 'w', v, q: quoted });
  }
  return out;
}

export function resolvePath(cwd: string, p: string): string {
  const parts = (p.startsWith('/') || p.startsWith('~') ? p.replace(/^~/, '') : `${cwd}/${p}`).split('/');
  const out: string[] = [];
  for (const s of parts) {
    if (!s || s === '.') continue;
    if (s === '..') out.pop();
    else out.push(s);
  }
  return out.join('/');
}

const globRe = (g: string) =>
  new RegExp(
    `^${g
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '(?:.*/)?')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')}$`,
  );

const HELP = `Commandes : ls [-la] · cd · pwd · tree · cat · head/tail [-n N] · wc [-l] · grep [-inrvc] · find [-name] · mkdir · touch · rm [-r] · mv · cp · echo · sort [-rnu] · uniq [-c] · cut -d -f · sed s/a/b/g · tr · jq-lite (json KEY) · date · history · clear · node FICHIER | node -e CODE · python FICHIER | python -c CODE · curl URL · open FICHIER · data FICHIER · du · env · help
Opérateurs : | > >> && || ; — jokers * ? ** — chemins relatifs à l'espace de travail.
Pas de vrai système d'exploitation ici : npm, git, pip et les programmes installés ne sont pas disponibles dans l'édition sans serveur.`;

export class Shell {
  cwd = '';
  history: string[] = [];
  private env: Record<string, string> = { HOME: '/', USER: 'massamba', SHELL: 'massamba-sh' };
  constructor(private readonly host: ShellHost) {}

  private exists(p: string): 'file' | 'dir' | null {
    if (p === '') return 'dir';
    const all = this.host.fs.list();
    if (all.includes(p)) return 'file';
    return all.some((f) => f.startsWith(`${p}/`)) ? 'dir' : null;
  }
  private children(dir: string): { name: string; dir: boolean; path: string }[] {
    const pre = dir ? `${dir}/` : '';
    const seen = new Map<string, boolean>();
    for (const f of this.host.fs.list()) {
      if (!f.startsWith(pre)) continue;
      const rest = f.slice(pre.length);
      const name = rest.split('/')[0]!;
      if (!name) continue;
      seen.set(name, (seen.get(name) ?? false) || rest.includes('/'));
    }
    return [...seen]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, d]) => ({ name, dir: d, path: pre + name }));
  }
  private expand(args: { v: string; q: boolean }[]): string[] {
    const out: string[] = [];
    for (const a of args) {
      const v = a.q ? a.v : a.v.replace(/\$(\w+|\?)/g, (_, k: string) => this.env[k] ?? '');
      if (!a.q && /[*?]/.test(v)) {
        const abs = resolvePath(this.cwd, v);
        const re = globRe(abs);
        const all = this.host.fs.list();
        const dirs = new Set(
          all.flatMap((f) =>
            f
              .split('/')
              .slice(0, -1)
              .map((_, i, s) => s.slice(0, i + 1).join('/')),
          ),
        );
        const hits = [...new Set([...all, ...dirs])].filter((f) => re.test(f)).sort();
        if (hits.length) {
          const pre = this.cwd ? `${this.cwd}/` : '';
          out.push(...hits.map((h) => (h.startsWith(pre) ? h.slice(pre.length) : `/${h}`)));
          continue;
        }
      }
      out.push(v);
    }
    return out;
  }
  private readFile(p: string): string {
    const abs = resolvePath(this.cwd, p);
    const kind = this.exists(abs);
    if (kind === 'dir') throw new Error(`${p}: est un dossier`);
    if (!kind) throw new Error(`${p}: fichier introuvable`);
    if (this.host.fs.isBinary(abs))
      throw new Error(`${p}: fichier binaire (utilisez data ${p} pour un tableur)`);
    return this.host.fs.read(abs) ?? '';
  }

  /** Runs one command line. */
  async exec(line: string): Promise<ShellResult> {
    const trimmed = line.trim();
    if (!trimmed) return { out: '', code: 0, cwd: this.cwd };
    this.history.push(trimmed);
    let toks: Tok[];
    try {
      toks = tokenize(trimmed);
    } catch (e) {
      return { out: `massamba-sh: ${(e as Error).message}`, code: 2, cwd: this.cwd };
    }
    // Split into a list of pipelines joined by && || ;
    const chain: { pipe: Tok[][]; join: string }[] = [];
    let cur: Tok[][] = [[]];
    for (const t of toks) {
      if (t.t === 'op' && (t.v === '&&' || t.v === '||' || t.v === ';')) {
        chain.push({ pipe: cur, join: t.v });
        cur = [[]];
      } else if (t.t === 'op' && t.v === '|') cur.push([]);
      else cur[cur.length - 1]!.push(t);
    }
    chain.push({ pipe: cur, join: ';' });
    const outs: string[] = [];
    let code = 0;
    let prevJoin = ';';
    for (const { pipe, join } of chain) {
      if ((prevJoin === '&&' && code !== 0) || (prevJoin === '||' && code === 0)) {
        prevJoin = join;
        continue;
      }
      const r = await this.pipeline(pipe);
      code = r.code;
      this.env['?'] = String(code);
      if (r.out) outs.push(r.out);
      prevJoin = join;
    }
    return { out: outs.join('\n'), code, cwd: this.cwd };
  }

  private async pipeline(stages: Tok[][]): Promise<{ out: string; code: number }> {
    let input: string | null = null;
    let code = 0;
    for (const st of stages) {
      const words: { v: string; q: boolean }[] = [];
      let redirect: { mode: '>' | '>>'; path: string } | null = null;
      let inFile: string | null = null;
      for (let i = 0; i < st.length; i++) {
        const t = st[i]!;
        if (t.t === 'op' && (t.v === '>' || t.v === '>>')) {
          const n = st[++i];
          if (!n || n.t !== 'w') return { out: 'massamba-sh: redirection sans fichier', code: 2 };
          redirect = { mode: t.v, path: n.v };
        } else if (t.t === 'op' && t.v === '<') {
          const n = st[++i];
          if (!n || n.t !== 'w') return { out: 'massamba-sh: < sans fichier', code: 2 };
          inFile = n.v;
        } else if (t.t === 'w') words.push(t);
      }
      const argv = this.expand(words);
      if (!argv.length) continue;
      let r: { out: string; code: number };
      try {
        if (inFile !== null) input = this.readFile(inFile);
        r = await this.command(argv[0]!, argv.slice(1), input);
      } catch (e) {
        r = { out: `${argv[0]}: ${(e as Error).message}`, code: 1 };
      }
      code = r.code;
      if (redirect) {
        const abs = resolvePath(this.cwd, redirect.path);
        if (this.exists(abs) === 'dir') return { out: `${redirect.path}: est un dossier`, code: 1 };
        const before =
          redirect.mode === '>>' && this.exists(abs) === 'file' ? (this.host.fs.read(abs) ?? '') : '';
        const text = r.out && !r.out.endsWith('\n') ? `${r.out}\n` : r.out;
        this.host.fs.write(abs, before + text);
        input = '';
      } else input = r.out;
    }
    return { out: input ?? '', code };
  }

  private async command(
    cmd: string,
    a: string[],
    stdin: string | null,
  ): Promise<{ out: string; code: number }> {
    const fs = this.host.fs;
    const flags = new Set(a.filter((x) => /^-[a-zA-Z]+$/.test(x)).flatMap((x) => [...x.slice(1)]));
    const args = a.filter((x) => !/^-[a-zA-Z]+$/.test(x));
    const ok = (out: string) => ({ out, code: 0 });
    const text = (files: string[]) =>
      files.length ? files.map((f) => this.readFile(f)).join('\n') : (stdin ?? '');
    const lines = (s: string) => (s.endsWith('\n') ? s.slice(0, -1) : s).split('\n');
    const numArg = (def: number) => {
      const i = a.indexOf('-n');
      const v = i >= 0 ? Number(a[i + 1]) : NaN;
      return { n: Number.isFinite(v) ? v : def, rest: i >= 0 ? args.filter((x) => x !== a[i + 1]) : args };
    };
    switch (cmd) {
      case 'help':
        return ok(HELP);
      case 'pwd':
        return ok(`/${this.cwd}`);
      case 'cd': {
        const t = resolvePath(this.cwd, args[0] ?? '/');
        if (this.exists(t) !== 'dir') return { out: `cd: ${args[0]}: dossier introuvable`, code: 1 };
        this.cwd = t;
        return ok('');
      }
      case 'ls': {
        const targets = args.length ? args : ['.'];
        const blocks: string[] = [];
        for (const t of targets) {
          const abs = resolvePath(this.cwd, t);
          const kind = this.exists(abs);
          if (!kind) return { out: `ls: ${t}: introuvable`, code: 1 };
          const items =
            kind === 'file'
              ? [{ name: t, dir: false, path: abs }]
              : this.children(abs).filter((c) => flags.has('a') || !c.name.startsWith('.'));
          const body = flags.has('l')
            ? items
                .map(
                  (c) =>
                    `${c.dir ? 'd' : '-'}  ${String(c.dir ? '' : fs.size(c.path)).padStart(9)}  ${c.name}${c.dir ? '/' : ''}`,
                )
                .join('\n')
            : items.map((c) => c.name + (c.dir ? '/' : '')).join('  ');
          blocks.push(targets.length > 1 ? `${t}:\n${body}` : body);
        }
        return ok(blocks.join('\n\n'));
      }
      case 'tree': {
        const root = resolvePath(this.cwd, args[0] ?? '.');
        const walk = (dir: string, pre: string): string[] =>
          this.children(dir).flatMap((c, i, arr) => {
            const last = i === arr.length - 1;
            const line = `${pre}${last ? '└── ' : '├── '}${c.name}${c.dir ? '/' : ''}`;
            return c.dir ? [line, ...walk(c.path, pre + (last ? '    ' : '│   '))] : [line];
          });
        return ok([`/${root}`, ...walk(root, '')].join('\n'));
      }
      case 'cat':
        return ok(text(args));
      case 'head':
      case 'tail': {
        const { n, rest } = numArg(10);
        const l = lines(text(rest));
        const fromStart = cmd === 'tail' && a[a.indexOf('-n') + 1]?.startsWith('+');
        return ok(
          (cmd === 'head' ? l.slice(0, n) : fromStart ? l.slice(Math.max(0, n - 1)) : l.slice(-n)).join('\n'),
        );
      }
      case 'wc': {
        const s = text(args);
        const l = s ? lines(s).length : 0;
        if (flags.has('l')) return ok(String(l));
        return ok(`${l} ${s.split(/\s+/).filter(Boolean).length} ${s.length}`);
      }
      case 'grep': {
        const [pat, ...files] = args;
        if (!pat) return { out: 'grep: motif manquant', code: 2 };
        const re = new RegExp(pat, flags.has('i') ? 'i' : '');
        const targets = flags.has('r')
          ? fs.list().filter((f) => f.startsWith(resolvePath(this.cwd, files[0] ?? '.')) && !fs.isBinary(f))
          : files.map((f) => resolvePath(this.cwd, f));
        const hits: string[] = [];
        let count = 0;
        const scan = (src: string, label: string | null) =>
          lines(src).forEach((l, i) => {
            if (re.test(l) !== flags.has('v')) {
              count++;
              hits.push(`${label ? `${label}:` : ''}${flags.has('n') ? `${i + 1}:` : ''}${l}`);
            }
          });
        if (targets.length)
          for (const f of targets)
            scan(this.readFile(`/${f}`), targets.length > 1 || flags.has('r') ? f : null);
        else scan(stdin ?? '', null);
        return { out: flags.has('c') ? String(count) : hits.join('\n'), code: count ? 0 : 1 };
      }
      case 'find': {
        const root = resolvePath(this.cwd, args[0] && !args[0].startsWith('-') ? args[0] : '.');
        const ni = a.indexOf('-name');
        const re = ni >= 0 && a[ni + 1] ? globRe(a[ni + 1]!) : null;
        const hits = fs
          .list()
          .filter((f) => !root || f === root || f.startsWith(`${root}/`))
          .filter((f) => !re || re.test(f.split('/').pop()!));
        return ok(hits.join('\n'));
      }
      case 'mkdir':
        for (const d of args) fs.write(`${resolvePath(this.cwd, d)}/.keep`, '');
        return ok('');
      case 'touch':
        for (const f of args) {
          const p = resolvePath(this.cwd, f);
          if (!this.exists(p)) fs.write(p, '');
        }
        return ok('');
      case 'rm': {
        for (const f of args) {
          const p = resolvePath(this.cwd, f);
          const kind = this.exists(p);
          if (!kind) {
            if (flags.has('f')) continue;
            return { out: `rm: ${f}: introuvable`, code: 1 };
          }
          if (kind === 'dir' && !flags.has('r'))
            return { out: `rm: ${f}: est un dossier (utilisez -r)`, code: 1 };
          if (!p) return { out: 'rm: refus de supprimer la racine', code: 1 };
          fs.remove(p);
        }
        return ok('');
      }
      case 'cp':
      case 'mv': {
        if (args.length < 2) return { out: `${cmd}: source et destination requises`, code: 2 };
        const dest = resolvePath(this.cwd, args[args.length - 1]!);
        const destDir = this.exists(dest) === 'dir' || args.length > 2;
        for (const s of args.slice(0, -1)) {
          const src = resolvePath(this.cwd, s);
          const kind = this.exists(src);
          if (!kind) return { out: `${cmd}: ${s}: introuvable`, code: 1 };
          const target = destDir ? `${dest ? `${dest}/` : ''}${src.split('/').pop()}` : dest;
          const pairs =
            kind === 'file'
              ? [[src, target]]
              : fs
                  .list()
                  .filter((f) => f.startsWith(`${src}/`))
                  .map((f) => [f, target + f.slice(src.length)]);
          for (const [from, to] of pairs) fs.copy(from!, to!);
          if (cmd === 'mv') fs.remove(src);
        }
        return ok('');
      }
      case 'echo':
        return ok(a.filter((x) => x !== '-n').join(' '));
      case 'sort': {
        let l = lines(text(args));
        l = flags.has('n')
          ? l.sort((x, y) => parseFloat(x) - parseFloat(y))
          : l.sort((x, y) => x.localeCompare(y, 'fr'));
        if (flags.has('r')) l.reverse();
        if (flags.has('u')) l = [...new Set(l)];
        return ok(l.join('\n'));
      }
      case 'uniq': {
        const out: [string, number][] = [];
        for (const l of lines(text(args))) {
          const last = out[out.length - 1];
          if (last && last[0] === l) last[1]++;
          else out.push([l, 1]);
        }
        return ok(out.map(([l, c]) => (flags.has('c') ? `${String(c).padStart(7)} ${l}` : l)).join('\n'));
      }
      case 'cut': {
        const di = a.indexOf('-d');
        const fi = a.indexOf('-f');
        const d = di >= 0 ? (a[di + 1] ?? '\t') : '\t';
        const fields = (fi >= 0 ? (a[fi + 1] ?? '1') : '1').split(',').map((x) => Number(x) - 1);
        const files = args.filter((x) => x !== a[di + 1] && x !== a[fi + 1]);
        return ok(
          lines(text(files))
            .map((l) => fields.map((f) => l.split(d)[f] ?? '').join(d))
            .join('\n'),
        );
      }
      case 'sed': {
        const [expr, ...files] = args;
        const m = /^s(.)(.*?)\1(.*?)\1([gi]*)$/.exec(expr ?? '');
        if (!m) return { out: 'sed: seule la forme s/motif/remplacement/[g] est prise en charge', code: 2 };
        const re = new RegExp(
          m[2]!,
          m[4]!.includes('i') ? `${m[4]!.includes('g') ? 'g' : ''}i` : m[4]!.includes('g') ? 'g' : '',
        );
        return ok(
          lines(text(files))
            .map((l) => l.replace(re, m[3]!))
            .join('\n'),
        );
      }
      case 'tr': {
        const [from, to] = args;
        if (from === undefined || to === undefined) return { out: 'tr: deux ensembles requis', code: 2 };
        return ok(
          [...(stdin ?? '')]
            .map((c) => (from.includes(c) ? (to[Math.min(from.indexOf(c), to.length - 1)] ?? '') : c))
            .join(''),
        );
      }
      case 'json': {
        const src = text(args.slice(1));
        let v: unknown = JSON.parse(src || 'null');
        for (const k of (args[0] ?? '').split('.').filter(Boolean))
          v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
        return ok(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
      }
      case 'date':
        return ok((this.host.now?.() ?? new Date()).toLocaleString('fr-FR'));
      case 'history':
        return ok(this.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join('\n'));
      case 'env':
        return ok(
          Object.entries(this.env)
            .map(([k, v]) => `${k}=${v}`)
            .join('\n'),
        );
      case 'du': {
        const root = resolvePath(this.cwd, args[0] ?? '.');
        const total = fs
          .list()
          .filter((f) => !root || f.startsWith(`${root}/`) || f === root)
          .reduce((s, f) => s + fs.size(f), 0);
        return ok(`${(total / 1024).toFixed(1)} Ko\t/${root}`);
      }
      case 'clear':
        return ok('\u001bc');
      case 'which':
        return args.length
          ? {
              out: args
                .map((x) => (SHELL_COMMANDS.includes(x) ? `/usr/bin/${x} (intégré)` : `${x}: introuvable`))
                .join('\n'),
              code: args.every((x) => SHELL_COMMANDS.includes(x)) ? 0 : 1,
            }
          : { out: 'which: nom de commande requis', code: 2 };
      case 'node':
      case 'js':
      case 'python':
      case 'python3': {
        if (a[0] === '--version' || a[0] === '-V' || a[0] === '-v')
          return ok(
            cmd.startsWith('python')
              ? 'Python 3.12 (Pyodide, bac à sable du navigateur)'
              : 'v22 (JavaScript du navigateur, bac à sable — API Node limitées : fs, path, process)',
          );
        if (!this.host.run) return { out: `${cmd}: exécution indisponible`, code: 127 };
        const lang = cmd.startsWith('python') ? 'python' : 'javascript';
        const inline = a[0] === '-e' || a[0] === '-c' || a[0] === '-p';
        const raw = inline ? a.slice(1).join(' ') : this.readFile(args[0] ?? '');
        // Node-style scripts: a minimal require('fs' | 'path') and process over the workspace.
        const code =
          lang === 'javascript' ? NODE_PRELUDE + (a[0] === '-p' ? `console.log(${raw})` : raw) : raw;
        if (!code) return { out: `${cmd}: fichier ou -e/-c CODE requis`, code: 2 };
        const r = await this.host.run(
          lang,
          code,
          fs.list().filter((f) => !fs.isBinary(f)),
        );
        return { out: r.out, code: r.ok ? 0 : 1 };
      }
      case 'curl':
      case 'wget': {
        if (!this.host.fetchText) return { out: `${cmd}: réseau indisponible`, code: 127 };
        const url = args.find((x) => /^https?:\/\//.test(x));
        if (!url) return { out: `${cmd}: URL http(s) requise`, code: 2 };
        const oi = a.indexOf('-o');
        const body = await this.host.fetchText(url);
        if (oi >= 0 && a[oi + 1]) {
          fs.write(resolvePath(this.cwd, a[oi + 1]!), body);
          return ok(`${body.length} caractères → ${a[oi + 1]}`);
        }
        return ok(body);
      }
      case 'open': {
        const p = resolvePath(this.cwd, args[0] ?? '');
        if (this.exists(p) !== 'file') return { out: `open: ${args[0]}: introuvable`, code: 1 };
        this.host.open?.(p);
        return ok(`ouvert dans le navigateur intégré : ${p}`);
      }
      case 'data': {
        if (!this.host.profile) return { out: 'data: indisponible', code: 127 };
        const p = resolvePath(this.cwd, args[0] ?? '');
        if (this.exists(p) !== 'file') return { out: `data: ${args[0]}: introuvable`, code: 1 };
        return ok(await this.host.profile(p));
      }
      case 'npm':
      case 'npx':
      case 'git':
      case 'pip':
      case 'sudo':
      case 'apt':
      case 'bash':
      case 'sh':
        return {
          out: `${cmd}: indisponible dans l'édition sans serveur (pas de vrai système). Utilisez l'édition serveur pour ${cmd}, ou node / python ici.`,
          code: 127,
        };
      default:
        return { out: `${cmd}: commande inconnue (tapez help)`, code: 127 };
    }
  }
}

export const SHELL_COMMANDS =
  'help pwd cd ls tree cat head tail wc grep find mkdir touch rm cp mv echo sort uniq cut sed tr json date history env du clear node js python python3 curl wget open data which'.split(
    ' ',
  );

/** Minimal Node APIs for scripts run with `node` (text files of the workspace). */
const NODE_PRELUDE = `const require = (m) => {
  const n = String(m).replace(/^node:/, '');
  if (n === 'fs' || n === 'fs/promises') {
    const fs = {
      readFileSync: (p) => readFile(String(p)),
      writeFileSync: (p, d) => writeFile(String(p), String(d)),
      appendFileSync: (p, d) => { let b = ''; try { b = readFile(String(p)); } catch (e) {} writeFile(String(p), b + String(d)); },
      existsSync: (p) => { try { readFile(String(p)); return true; } catch (e) { return false; } },
    };
    return n === 'fs' ? { ...fs, promises: { readFile: async (p) => fs.readFileSync(p), writeFile: async (p, d) => fs.writeFileSync(p, d) } } : { readFile: async (p) => fs.readFileSync(p), writeFile: async (p, d) => fs.writeFileSync(p, d) };
  }
  if (n === 'path') return { join: (...a) => a.join('/').replace(/\\/+/g, '/'), basename: (p) => String(p).split('/').pop(), dirname: (p) => String(p).split('/').slice(0, -1).join('/') || '.', extname: (p) => (/\\.[^./]+$/.exec(String(p)) || [''])[0] };
  throw new Error('module « ' + m + ' » indisponible dans le bac à sable du navigateur');
};
const process = { argv: [], env: {}, exit: () => {}, cwd: () => '/', platform: 'browser' };
`;

/** Risk of a command line for the permission system (agent use). */
export function shellRisk(line: string): 'read' | 'write' | 'delete' | 'execute' | 'external' {
  let toks: Tok[];
  try {
    toks = tokenize(line);
  } catch {
    return 'execute';
  }
  const cmds: string[] = [];
  let expectCmd = true;
  for (const t of toks) {
    if (t.t === 'op') {
      if (t.v === '>' || t.v === '>>') cmds.push('>');
      expectCmd = t.v !== '>' && t.v !== '>>' && t.v !== '<';
      continue;
    }
    if (expectCmd) cmds.push(t.v);
    expectCmd = false;
  }
  if (cmds.some((c) => c === 'rm' || c === 'mv')) return 'delete';
  if (cmds.some((c) => ['node', 'js', 'python', 'python3'].includes(c))) return 'execute';
  if (cmds.some((c) => c === 'curl' || c === 'wget')) return 'external';
  if (cmds.some((c) => ['>', 'mkdir', 'touch', 'cp', 'sed'].includes(c))) return 'write';
  return 'read';
}
