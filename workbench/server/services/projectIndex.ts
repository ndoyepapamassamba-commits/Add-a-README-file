import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { WorkspaceService } from './workspace';
import { isBinaryBuffer } from './workspace';
import { isProtectedPath } from '../security/paths';

export interface ProjectAnalysis {
  projectId: string;
  fileCount: number;
  totalBytes: number;
  languages: { language: string; files: number }[];
  frameworks: string[];
  packageManagers: string[];
  scripts: Record<string, string>;
  testFrameworks: string[];
  entryPoints: string[];
  notableFiles: string[];
  topLevel: string[];
  readmeExcerpt: string;
  analyzedAt: number;
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

const LANG: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript (React)', '.js': 'JavaScript', '.jsx': 'JavaScript (React)', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.py': 'Python', '.html': 'HTML', '.htm': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.json': 'JSON', '.md': 'Markdown', '.yml': 'YAML',
  '.yaml': 'YAML', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin', '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#', '.c': 'C',
  '.cpp': 'C++', '.h': 'C/C++ header', '.swift': 'Swift', '.dart': 'Dart', '.vue': 'Vue', '.svelte': 'Svelte', '.sql': 'SQL', '.sh': 'Shell',
  '.csv': 'CSV', '.xlsx': 'Excel', '.xls': 'Excel', '.xlsm': 'Excel', '.pdf': 'PDF', '.xml': 'XML', '.toml': 'TOML',
};

const FRAMEWORK_DEPS: [string, string][] = [
  ['next', 'Next.js'], ['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['@angular/core', 'Angular'], ['vite', 'Vite'],
  ['express', 'Express'], ['fastify', 'Fastify'], ['@nestjs/core', 'NestJS'], ['tailwindcss', 'Tailwind CSS'], ['electron', 'Electron'],
  ['react-native', 'React Native'], ['expo', 'Expo'], ['prisma', 'Prisma'], ['typeorm', 'TypeORM'], ['mongoose', 'Mongoose'],
  ['playwright', 'Playwright'], ['@playwright/test', 'Playwright Test'], ['puppeteer', 'Puppeteer'], ['three', 'Three.js'], ['d3', 'D3'],
  ['echarts', 'ECharts'], ['chart.js', 'Chart.js'], ['recharts', 'Recharts'], ['zod', 'Zod'], ['socket.io', 'Socket.IO'],
];
const TEST_DEPS: [string, string][] = [['vitest', 'Vitest'], ['jest', 'Jest'], ['mocha', 'Mocha'], ['@playwright/test', 'Playwright Test'], ['cypress', 'Cypress']];

let rgAvailable: boolean | null = null;
export function hasRipgrep(): boolean {
  if (rgAvailable === null) {
    try {
      rgAvailable = spawnSync('rg', ['--version'], { stdio: 'ignore' }).status === 0;
    } catch {
      rgAvailable = false;
    }
  }
  return rgAvailable;
}

function runRg(cwd: string, args: string[], limitBytes = 4_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('rg', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString('utf8');
      if (out.length > limitBytes) child.kill();
    });
    child.stderr.on('data', (d: Buffer) => (err += d.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 2 && !out) reject(new Error(err.trim() || 'ripgrep failed'));
      else resolve(out);
    });
  });
}

const RG_EXCLUDES = ['--glob', '!.git', '--glob', '!node_modules', '--glob', '!.workbench', '--glob', '!*.min.js', '--glob', '!*.map', '--glob', '!package-lock.json', '--glob', '!.env*'];

/** Project understanding: structure analysis, ripgrep search and relevance ranking. */
export class ProjectIndex {
  private cache = new Map<string, ProjectAnalysis>();

  constructor(private readonly workspace: WorkspaceService) {}

  async analyze(projectId: string, force = false): Promise<ProjectAnalysis> {
    const cached = this.cache.get(projectId);
    if (!force && cached && Date.now() - cached.analyzedAt < 60_000) return cached;
    const root = this.workspace.projectRoot(projectId);
    const files = await this.workspace.allFiles(projectId, 50_000);
    const langCount = new Map<string, number>();
    let totalBytes = 0;
    for (const f of files) {
      const lang = LANG[path.extname(f).toLowerCase()];
      if (lang) langCount.set(lang, (langCount.get(lang) ?? 0) + 1);
    }
    for (const f of files.slice(0, 5000)) {
      try {
        totalBytes += (await fsp.stat(path.join(root, f))).size;
      } catch {
        /* vanished */
      }
    }
    const frameworks = new Set<string>();
    const tests = new Set<string>();
    const packageManagers = new Set<string>();
    let scripts: Record<string, string> = {};
    const entryPoints: string[] = [];
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf8')) as { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; main?: string };
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const [dep, label] of FRAMEWORK_DEPS) if (deps[dep]) frameworks.add(label);
        for (const [dep, label] of TEST_DEPS) if (deps[dep]) tests.add(label);
        scripts = pkg.scripts ?? {};
        if (pkg.main) entryPoints.push(pkg.main);
      } catch {
        /* invalid package.json */
      }
      packageManagers.add(fs.existsSync(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(root, 'yarn.lock')) ? 'yarn' : 'npm');
    }
    if (fs.existsSync(path.join(root, 'requirements.txt')) || fs.existsSync(path.join(root, 'pyproject.toml'))) {
      packageManagers.add(fs.existsSync(path.join(root, 'pyproject.toml')) ? 'pip/pyproject' : 'pip');
      const req = [path.join(root, 'requirements.txt'), path.join(root, 'pyproject.toml')].filter((p) => fs.existsSync(p)).map((p) => fs.readFileSync(p, 'utf8')).join('\n');
      for (const [re, label] of [[/django/i, 'Django'], [/flask/i, 'Flask'], [/fastapi/i, 'FastAPI'], [/pandas/i, 'pandas'], [/pytest/i, 'pytest']] as const) {
        if (re.test(req)) (label === 'pytest' ? tests : frameworks).add(label);
      }
    }
    for (const candidate of ['index.html', 'src/main.tsx', 'src/main.ts', 'src/index.ts', 'src/index.js', 'src/App.tsx', 'app.py', 'main.py', 'server.js', 'index.js', 'main.go', 'src/main.rs']) {
      if (files.includes(candidate) && !entryPoints.includes(candidate)) entryPoints.push(candidate);
    }
    const notable = files.filter((f) => /^(README|PROJECT_CONTEXT|CLAUDE|AGENTS|CONTRIBUTING)\.md$|^(package\.json|tsconfig\.json|vite\.config\.\w+|next\.config\.\w+|Dockerfile|docker-compose\.ya?ml|pyproject\.toml|requirements\.txt|Makefile|\.env\.example)$/i.test(f));
    const readme = files.find((f) => /^readme\.md$/i.test(f));
    let readmeExcerpt = '';
    if (readme) readmeExcerpt = (await fsp.readFile(path.join(root, readme), 'utf8')).slice(0, 1500);
    const topLevel = (await this.workspace.listDir(projectId, '')).map((e) => (e.type === 'dir' ? `${e.name}/` : e.name));
    const analysis: ProjectAnalysis = {
      projectId,
      fileCount: files.length,
      totalBytes,
      languages: [...langCount.entries()].sort((a, b) => b[1] - a[1]).map(([language, n]) => ({ language, files: n })),
      frameworks: [...frameworks],
      packageManagers: [...packageManagers],
      scripts,
      testFrameworks: [...tests],
      entryPoints,
      notableFiles: notable,
      topLevel,
      readmeExcerpt,
      analyzedAt: Date.now(),
    };
    this.cache.set(projectId, analysis);
    return analysis;
  }

  invalidate(projectId: string): void {
    this.cache.delete(projectId);
  }

  async grep(projectId: string, pattern: string, opts: { regex?: boolean; caseSensitive?: boolean; glob?: string; path?: string; maxResults?: number; contextLines?: number } = {}): Promise<{ matches: GrepMatch[]; truncated: boolean }> {
    const root = this.workspace.projectRoot(projectId);
    const max = Math.min(opts.maxResults ?? 100, 1000);
    const searchPath = opts.path ? this.workspace.resolve(projectId, opts.path) : '.';
    if (hasRipgrep()) {
      const args = ['--json', '--max-columns', '400', '--max-filesize', '2M', ...RG_EXCLUDES];
      if (!opts.regex) args.push('--fixed-strings');
      if (!opts.caseSensitive) args.push('--smart-case');
      if (opts.glob) args.push('--glob', opts.glob);
      args.push('--', pattern, searchPath);
      const out = await runRg(root, args);
      const matches: GrepMatch[] = [];
      for (const line of out.split('\n')) {
        if (!line.startsWith('{"type":"match"')) continue;
        const m = JSON.parse(line) as { data: { path: { text: string }; line_number: number; lines: { text?: string } } };
        const rel = path.relative(root, path.resolve(root, m.data.path.text)).split(path.sep).join('/');
        if (isProtectedPath(rel)) continue;
        matches.push({ path: rel, line: m.data.line_number, text: (m.data.lines.text ?? '').replace(/\n$/, '').slice(0, 400) });
        if (matches.length >= max) return { matches, truncated: true };
      }
      return { matches, truncated: false };
    }
    // Fallback without ripgrep
    const re = opts.regex ? new RegExp(pattern, opts.caseSensitive ? '' : 'i') : null;
    const needle = opts.caseSensitive ? pattern : pattern.toLowerCase();
    const matches: GrepMatch[] = [];
    for (const rel of await this.workspace.allFiles(projectId)) {
      if (opts.path && !rel.startsWith(opts.path.replace(/^\.?\/?/, ''))) continue;
      if (isProtectedPath(rel)) continue;
      const buf = await fsp.readFile(path.join(root, rel)).catch(() => null);
      if (!buf || buf.length > 2_000_000 || isBinaryBuffer(buf)) continue;
      const lines = buf.toString('utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!;
        if (re ? re.test(l) : (opts.caseSensitive ? l : l.toLowerCase()).includes(needle)) {
          matches.push({ path: rel, line: i + 1, text: l.slice(0, 400) });
          if (matches.length >= max) return { matches, truncated: true };
        }
      }
    }
    return { matches, truncated: false };
  }

  async glob(projectId: string, pattern: string, limit = 500): Promise<string[]> {
    const root = this.workspace.projectRoot(projectId);
    if (hasRipgrep()) {
      const out = await runRg(root, ['--files', ...RG_EXCLUDES, '--glob', pattern]);
      return out.split('\n').filter(Boolean).map((p) => p.replace(/^\.\//, '')).filter((p) => !isProtectedPath(p)).sort().slice(0, limit);
    }
    const re = globToRegExp(pattern);
    return (await this.workspace.allFiles(projectId)).filter((f) => re.test(f)).slice(0, limit);
  }

  /** Ranks files likely relevant to a request (path + content keyword hits). */
  async relevantFiles(projectId: string, query: string, limit = 8): Promise<{ path: string; score: number }[]> {
    const terms = [...new Set((query.match(/[A-Za-z_][A-Za-z0-9_.-]{2,}/g) ?? []).map((t) => t.toLowerCase()))]
      .filter((t) => !STOP.has(t))
      .slice(0, 12);
    if (!terms.length) return [];
    const files = await this.workspace.allFiles(projectId, 20_000);
    const scores = new Map<string, number>();
    for (const f of files) {
      const lower = f.toLowerCase();
      let s = 0;
      for (const t of terms) if (lower.includes(t)) s += 5;
      if (s) scores.set(f, s);
    }
    if (hasRipgrep()) {
      try {
        const root = this.workspace.projectRoot(projectId);
        const args = ['--count-matches', '--ignore-case', '--max-filesize', '1M', ...RG_EXCLUDES];
        for (const t of terms) args.push('-e', t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const out = await runRg(root, [...args, '.'], 1_000_000);
        for (const line of out.split('\n')) {
          const idx = line.lastIndexOf(':');
          if (idx < 0) continue;
          const rel = line.slice(0, idx).replace(/^\.\//, '');
          const n = Number(line.slice(idx + 1));
          if (!isProtectedPath(rel)) scores.set(rel, (scores.get(rel) ?? 0) + Math.log2(1 + n) * 2);
        }
      } catch {
        /* best effort */
      }
    }
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([p, score]) => ({ path: p, score: Math.round(score * 10) / 10 }));
  }
}

const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'les', 'des', 'une', 'pour', 'dans', 'avec', 'est', 'sur', 'pas', 'qui', 'que', 'mon', 'ma', 'mes', 'fix', 'add', 'make', 'please', 'fais', 'corrige', 'ajoute', 'cette', 'ce', 'cet', 'moi', 'tout', 'code', 'file', 'fichier']);

export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(${glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`(^|/)${re}$`);
}
