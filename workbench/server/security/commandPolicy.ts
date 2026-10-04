// Classifies shell commands by risk before the terminal tool runs them.
// This is a policy layer, not a security boundary on its own: commands still
// run with the server's OS privileges (see README › Sécurité for isolation).

export type CommandLevel = 'readonly' | 'safe' | 'moderate' | 'dangerous' | 'blocked';

export interface CommandClassification {
  level: CommandLevel;
  reasons: string[];
}

const ORDER: CommandLevel[] = ['readonly', 'safe', 'moderate', 'dangerous', 'blocked'];
const max = (a: CommandLevel, b: CommandLevel): CommandLevel => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

const BLOCKED: [RegExp, string][] = [
  [/(^|[\s;&|(])(sudo|su|doas)(\s|$)/, 'privilege escalation'],
  [/\brm\s+(-[a-zA-Z]*\s+)*(\/|\/\*|~|~\/|\$HOME|\/home|\/root|\/etc|\/usr|\/var|\/bin|\/boot)(\s|$)/, 'deletes system or home directories'],
  [/\b(mkfs(\.\w+)?|fdisk|parted|wipefs)\b/, 'disk formatting'],
  [/\bdd\b[^|;&]*\bof=\/dev\//, 'raw disk write'],
  [/\b(shutdown|reboot|halt|poweroff)\b|\binit\s+[06]\b|systemctl\s+(poweroff|reboot|halt)/, 'power management'],
  [/:\s*\(\s*\)\s*\{[^}]*:\s*\|\s*:/, 'fork bomb'],
  [/\bch(mod|own)\s+(-[a-zA-Z]+\s+)*\S*\s+\/(\s|$)/, 'permission change on /'],
  [/\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/, 'pipes a download into a shell'],
  [/\b(curl|wget)\b[^|;&]*\|\s*(python3?|node|perl|ruby)\b/, 'pipes a download into an interpreter'],
  [/>\s*\/dev\/(sd|nvme|hd|xvd)/, 'writes to a block device'],
  [/\/etc\/(passwd|shadow|sudoers)/, 'touches system credentials'],
  [/\bnc\b[^;&|]*\s-[a-z]*e\b|\/dev\/tcp\//, 'reverse shell pattern'],
  [/(^|[\s/])(\.ssh\/|id_rsa|id_ed25519|\.aws\/credentials|\.git-credentials|\.netrc|\.workbench-token)/, 'reads credentials'],
  [/(^|[\s/'"])\.env(\.(?!example|sample|template)[\w.-]+)?(\s|$|['"])/, 'reads a .env secret file'],
  [/\b(printenv|export\s+-p)\b|(^|[;&|]\s*)env\s*($|[|;&>])/, 'dumps environment variables'],
  [/\bhistory\s+-c\b|\bcrontab\b|\biptables\b|\bmount\b|\bumount\b/, 'system administration'],
];

const READONLY = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'rg', 'pwd', 'echo', 'printf', 'which', 'type',
  'tree', 'du', 'df', 'file', 'stat', 'sort', 'uniq', 'cut', 'tr', 'jq', 'date', 'whoami', 'uname', 'basename',
  'dirname', 'realpath', 'readlink', 'diff', 'cmp', 'md5sum', 'sha256sum', 'less', 'more', 'column', 'nl', 'true',
  'false', 'test', '[', 'seq', 'hostname', 'id', 'ps', 'free', 'uptime', 'lsof',
]);
const SAFE = new Set([
  'node', 'python', 'python3', 'tsc', 'vite', 'vitest', 'jest', 'mocha', 'pytest', 'make', 'cargo', 'go', 'deno',
  'bun', 'mkdir', 'touch', 'cp', 'tee', 'sed', 'awk', 'xargs', 'tsx', 'ts-node', 'eslint', 'prettier', 'black',
  'ruff', 'mypy', 'zip', 'gzip', 'gunzip', 'sleep', 'cd', 'export', 'set', 'source', '.', 'time', 'timeout',
  'java', 'javac', 'mvn', 'gradle', 'dotnet', 'php', 'ruby', 'perl', 'sqlite3', 'ln',
]);
const MODERATE = new Set([
  'npx', 'curl', 'wget', 'mv', 'chmod', 'kill', 'pkill', 'killall', 'docker', 'podman', 'unzip', 'tar', 'pip',
  'pip3', 'uv', 'poetry', 'brew', 'apt', 'apt-get', 'yum', 'dnf', 'pnpx', 'bunx', 'ssh-keyscan', 'openssl',
]);
const DANGEROUS = new Set(['rm', 'rmdir', 'shred', 'truncate', 'chown', 'ssh', 'scp', 'rsync', 'sftp', 'ftp', 'dd']);

function splitSegments(command: string): string[] {
  // Split on control operators outside of quotes.
  const segments: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (quote) {
      if (c === quote) quote = null;
      current += c;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      current += c;
      continue;
    }
    if (c === ';' || c === '\n' || c === '|' || c === '&') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

function tokens(segment: string): string[] {
  return segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}

function classifySegment(segment: string): CommandClassification {
  const reasons: string[] = [];
  let words = tokens(segment);
  // Strip leading VAR=value assignments and wrappers.
  while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]!)) words = words.slice(1);
  while (words.length && ['nohup', 'nice', 'time', 'command', 'exec'].includes(words[0]!)) words = words.slice(1);
  if (words[0] === 'timeout' && words.length > 2) words = words.slice(2);
  const cmd = (words[0] ?? '').replace(/^.*\//, '');
  const sub = words[1] ?? '';
  const args = words.slice(1).join(' ');
  if (!cmd) return { level: 'readonly', reasons };

  let level: CommandLevel;
  if (cmd === 'git') {
    if (['status', 'log', 'diff', 'show', 'blame', 'remote', 'rev-parse', 'ls-files', 'describe', 'shortlog'].includes(sub)) level = 'readonly';
    else if (sub === 'branch' && (words.length === 2 || /^-(a|r|v|vv|-list)$/.test(words[2] ?? ''))) level = 'readonly';
    else if (sub === 'push') {
      level = 'dangerous';
      reasons.push('git push sends commits to a remote');
    } else if ((sub === 'reset' && /--hard/.test(args)) || sub === 'clean' || (sub === 'checkout' && /\s--\s|\s\.$/.test(` ${args}`))) {
      level = 'dangerous';
      reasons.push('discards local changes');
    } else if (['clone', 'pull', 'fetch', 'merge', 'rebase', 'cherry-pick', 'revert', 'tag'].includes(sub)) level = 'moderate';
    else level = 'safe';
  } else if (['npm', 'pnpm', 'yarn', 'bun'].includes(cmd)) {
    if (['install', 'i', 'add', 'ci', 'uninstall', 'remove', 'rm', 'update', 'upgrade', 'link', 'dlx', 'exec', 'x'].includes(sub)) {
      level = 'moderate';
      reasons.push('installs or removes dependencies');
    } else if (sub === 'publish' || sub === 'unpublish' || sub === 'deprecate') {
      level = 'dangerous';
      reasons.push('publishes to a registry');
    } else if (['ls', 'list', 'view', 'info', 'outdated', 'why', '--version', '-v'].includes(sub)) level = 'readonly';
    else level = 'safe';
  } else if (cmd === 'find') {
    level = /\s-(delete|exec|execdir|ok)\b/.test(` ${args}`) ? 'dangerous' : 'readonly';
    if (level === 'dangerous') reasons.push('find with -delete/-exec');
  } else if (cmd === 'sed') {
    level = /(^|\s)-i/.test(args) ? 'safe' : 'readonly';
  } else if (READONLY.has(cmd)) level = 'readonly';
  else if (SAFE.has(cmd)) level = 'safe';
  else if (MODERATE.has(cmd)) {
    level = 'moderate';
    reasons.push(`${cmd} can modify the system or use the network`);
  } else if (DANGEROUS.has(cmd)) {
    level = 'dangerous';
    reasons.push(`${cmd} can destroy data`);
  } else {
    level = 'moderate';
    reasons.push(`unknown command "${cmd}"`);
  }

  // Redirections
  const redirects = [...segment.matchAll(/(?:^|[^0-9&<>])>{1,2}\s*([^\s;&|]+)/g)].map((m) => m[1]!);
  for (const target of redirects) {
    if (target === '/dev/null' || target.startsWith('&')) continue;
    if (target.startsWith('/') || target.startsWith('~') || target.startsWith('..')) {
      level = max(level, 'dangerous');
      reasons.push(`writes outside the project (${target})`);
    } else level = max(level, 'safe');
  }
  return { level, reasons };
}

export function classifyCommand(command: string): CommandClassification {
  const reasons: string[] = [];
  for (const [re, why] of BLOCKED) {
    if (re.test(command)) return { level: 'blocked', reasons: [why] };
  }
  let level: CommandLevel = 'readonly';
  for (const seg of splitSegments(command)) {
    const c = classifySegment(seg);
    level = max(level, c.level);
    reasons.push(...c.reasons);
  }
  if (/\$\(|`/.test(command)) {
    level = max(level, 'moderate');
    reasons.push('command substitution');
  }
  return { level, reasons: [...new Set(reasons)] };
}

/** Key used for session "always allow" grants (e.g. "npm install"). */
export function commandGrantKey(command: string): string {
  const first = splitSegments(command)[0] ?? command;
  const words = tokens(first).filter((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w));
  return words.slice(0, 2).join(' ');
}
