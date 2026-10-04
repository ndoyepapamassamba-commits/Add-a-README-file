import { describe, expect, it } from 'vitest';
import { Shell, shellRisk, tokenize, type ShellFs } from '../../direct/lib/shellCore';

function memFs(init: Record<string, string>): ShellFs & { files: Record<string, string> } {
  const files = { ...init };
  return {
    files,
    list: () => Object.keys(files).sort(),
    read: (p) => files[p] ?? null,
    isBinary: (p) => p.endsWith('.xlsx'),
    size: (p) => (files[p] ?? '').length,
    write: (p, t) => void (files[p] = t),
    remove: (p) => {
      for (const k of Object.keys(files)) if (k === p || k.startsWith(`${p}/`)) delete files[k];
    },
    copy: (a, b) => void (files[b] = files[a]!),
  };
}

describe('embedded shell', () => {
  const fs = memFs({
    'data/ventes.csv': 'agence,montant\nDakar,10\nThies,5\nDakar,7\n',
    'notes/a.md': '# Titre\nbonjour Dakar\n',
    'notes/b.md': 'rien\n',
    'x.xlsx': 'bin',
  });
  const sh = new Shell({
    fs,
    run: async (lang, code) => ({ out: `${lang}:${code}`, ok: !code.includes('fail') }),
  });

  it('tokenizes quotes and operators', () => {
    expect(tokenize(`echo "a b" 'c|d' | grep x >> f && ls`).map((t) => t.v)).toEqual([
      'echo',
      'a b',
      'c|d',
      '|',
      'grep',
      'x',
      '>>',
      'f',
      '&&',
      'ls',
    ]);
  });
  it('navigates, lists, reads and pipes', async () => {
    expect((await sh.exec('ls')).out).toBe('data/  notes/  x.xlsx');
    expect((await sh.exec('cd notes && pwd')).out).toBe('/notes');
    expect((await sh.exec('cat a.md | grep -i dakar')).out).toBe('bonjour Dakar');
    expect((await sh.exec('cd ..')).cwd).toBe('');
    expect((await sh.exec('tail -n +1 data/ventes.csv | cut -d , -f 1 | sort | uniq -c')).out).toContain(
      '2 Dakar',
    );
    expect((await sh.exec('grep -c Dakar data/ventes.csv')).out).toBe('2');
    expect((await sh.exec('grep -rn Dakar notes')).out).toBe('notes/a.md:2:bonjour Dakar');
    expect((await sh.exec('ls notes/*.md')).out).toContain('notes/a.md');
    expect((await sh.exec('wc -l data/ventes.csv')).out).toBe('4');
    expect((await sh.exec('cat x.xlsx')).code).toBe(1);
  });
  it('redirects, copies, moves, removes', async () => {
    await sh.exec('echo bonjour > out/r.txt && echo encore >> out/r.txt');
    expect(fs.files['out/r.txt']).toBe('bonjour\nencore\n');
    await sh.exec('cp out/r.txt out/s.txt && mv out/s.txt out/t.txt');
    expect(fs.files['out/t.txt']).toBe('bonjour\nencore\n');
    expect(fs.files['out/s.txt']).toBeUndefined();
    expect((await sh.exec('rm out')).code).toBe(1); // directory needs -r
    await sh.exec('rm -r out');
    expect(Object.keys(fs.files).some((f) => f.startsWith('out/'))).toBe(false);
    expect((await sh.exec('sed s/Dakar/DKR/g notes/a.md')).out).toContain('bonjour DKR');
  });
  it('runs code through the sandbox and honours && / ||', async () => {
    expect((await sh.exec('node -e console.log(1)')).out).toMatch(/^javascript:[\s\S]*console\.log\(1\)$/);
    expect((await sh.exec('python -c fail || echo repli')).out).toContain('repli');
    expect((await sh.exec('python -c fail && echo jamais')).out).not.toContain('jamais');
    expect((await sh.exec('npm install')).code).toBe(127);
    expect((await sh.exec('python --version')).out).toMatch(/Python 3/);
    expect((await sh.exec('which node python git')).code).toBe(1);
    expect((await sh.exec('which grep')).out).toContain('intégré');
    // node scripts get a minimal require('fs') over the workspace
    expect(
      (await sh.exec("node -e \"const fs=require('fs'); console.log(fs.existsSync('x'))\"")).out,
    ).toContain('require = (m)');
    expect((await sh.exec('inconnue')).out).toContain('commande inconnue');
  });
  it('classifies risk for approvals', () => {
    expect(shellRisk('ls -la | grep x')).toBe('read');
    expect(shellRisk('echo a > f.txt')).toBe('write');
    expect(shellRisk('rm -r data')).toBe('delete');
    expect(shellRisk('python script.py')).toBe('execute');
    expect(shellRisk('curl https://x.y')).toBe('external');
  });
});
