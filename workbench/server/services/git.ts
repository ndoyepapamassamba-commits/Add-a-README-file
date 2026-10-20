import fs from 'node:fs';
import path from 'node:path';
import { runGit } from './workspace';
import { BadRequestError } from './workspace';

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  files: { path: string; index: string; worktree: string; status: string }[];
}

export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

const IDENTITY = ['-c', 'user.name=OpenRouter Workbench', '-c', 'user.email=workbench@localhost'];

function describe(index: string, worktree: string): string {
  const code = index !== ' ' && index !== '?' ? index : worktree;
  return (
    (
      {
        M: 'modified',
        A: 'added',
        D: 'deleted',
        R: 'renamed',
        C: 'copied',
        U: 'conflict',
        '?': 'untracked',
        '!': 'ignored',
      } as Record<string, string>
    )[code] ?? 'changed'
  );
}

/** Git operations via the git CLI (argument arrays, never a shell). Push is intentionally not exposed. */
export class GitService {
  private async git(cwd: string, args: string[], timeout = 60_000) {
    const res = await runGit(cwd, args, timeout);
    if (res.code !== 0) throw new BadRequestError(res.stderr.trim() || `git ${args[0]} failed`);
    return res.stdout;
  }

  isRepo(cwd: string): boolean {
    return fs.existsSync(path.join(cwd, '.git'));
  }

  async init(cwd: string): Promise<void> {
    await this.git(cwd, ['init', '-q']);
  }

  async status(cwd: string): Promise<GitStatus> {
    if (!this.isRepo(cwd)) return { isRepo: false, branch: null, ahead: 0, behind: 0, files: [] };
    const out = await this.git(cwd, ['status', '--porcelain=v1', '-b', '-uall']);
    const lines = out.split('\n').filter(Boolean);
    let branch: string | null = null;
    let ahead = 0;
    let behind = 0;
    const files: GitStatus['files'] = [];
    for (const line of lines) {
      if (line.startsWith('## ')) {
        const head = line.slice(3);
        branch =
          head
            .replace(/^No commits yet on /, '')
            .split('...')[0]!
            .split(' ')[0] ?? null;
        ahead = Number(/ahead (\d+)/.exec(head)?.[1] ?? 0);
        behind = Number(/behind (\d+)/.exec(head)?.[1] ?? 0);
        continue;
      }
      const index = line[0] ?? ' ';
      const worktree = line[1] ?? ' ';
      let p = line.slice(3);
      if (p.includes(' -> ')) p = p.split(' -> ')[1]!;
      files.push({ path: p.replace(/^"|"$/g, ''), index, worktree, status: describe(index, worktree) });
    }
    return { isRepo: true, branch, ahead, behind, files };
  }

  async diff(cwd: string, opts: { path?: string; staged?: boolean } = {}): Promise<string> {
    if (!this.isRepo(cwd)) return '';
    const args = ['diff', '--no-color', '--no-ext-diff'];
    if (opts.staged) args.push('--staged');
    if (opts.path) args.push('--', opts.path);
    let out = await this.git(cwd, args);
    // Include untracked files as additions when diffing everything / a new file.
    if (!opts.staged) {
      const untracked = (
        await this.git(cwd, [
          'ls-files',
          '--others',
          '--exclude-standard',
          ...(opts.path ? ['--', opts.path] : []),
        ])
      )
        .split('\n')
        .filter(Boolean);
      for (const f of untracked.slice(0, 50)) {
        const res = await runGit(cwd, ['diff', '--no-color', '--no-index', '--', '/dev/null', f]);
        out += res.stdout;
      }
    }
    return out;
  }

  async log(cwd: string, limit = 50): Promise<GitCommit[]> {
    if (!this.isRepo(cwd)) return [];
    const res = await runGit(cwd, [
      'log',
      `-n${limit}`,
      '--date=iso',
      '--pretty=format:%H%x1f%an%x1f%ad%x1f%s',
    ]);
    if (res.code !== 0) return []; // no commits yet
    return res.stdout
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [hash = '', author = '', date = '', subject = ''] = l.split('\x1f');
        return { hash, author, date, subject };
      });
  }

  async branches(cwd: string): Promise<{ current: string | null; all: string[] }> {
    if (!this.isRepo(cwd)) return { current: null, all: [] };
    const all = (await this.git(cwd, ['branch', '--format=%(refname:short)'])).split('\n').filter(Boolean);
    const current = (await runGit(cwd, ['branch', '--show-current'])).stdout.trim() || null;
    return { current, all };
  }

  async commit(cwd: string, message: string, files?: string[]): Promise<{ hash: string; summary: string }> {
    if (!message.trim()) throw new BadRequestError('Commit message is required');
    if (files?.length) await this.git(cwd, ['add', '--', ...files]);
    else await this.git(cwd, ['add', '-A']);
    const hasName = (await runGit(cwd, ['config', 'user.name'])).stdout.trim();
    const out = await this.git(cwd, [...(hasName ? [] : IDENTITY), 'commit', '-m', message]);
    const hash = (await this.git(cwd, ['rev-parse', 'HEAD'])).trim();
    return { hash, summary: out.split('\n')[0] ?? '' };
  }

  async checkout(cwd: string, branch: string): Promise<void> {
    if (!/^[\w./-]+$/.test(branch)) throw new BadRequestError('Invalid branch name');
    await this.git(cwd, ['checkout', branch]);
  }

  async createBranch(cwd: string, name: string, checkout = true): Promise<void> {
    if (!/^[\w./-]+$/.test(name)) throw new BadRequestError('Invalid branch name');
    await this.git(cwd, checkout ? ['checkout', '-b', name] : ['branch', name]);
  }
}
