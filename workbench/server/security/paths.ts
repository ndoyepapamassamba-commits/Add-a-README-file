import fs from 'node:fs';
import path from 'node:path';

export class PathError extends Error {
  constructor(
    message: string,
    public readonly code: 'OUTSIDE_ROOT' | 'PROTECTED' | 'INVALID',
  ) {
    super(message);
  }
}

const PROTECTED_BASENAMES = [
  /^\.env$/i,
  /^\.env\.(?!example$|sample$|template$).+/i,
  /\.(pem|key|p12|pfx|keystore|jks|ppk)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^\.netrc$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^\.git-credentials$/i,
  /^\.workbench-token$/i,
  /^credentials(\.json)?$/i,
  /^secrets?\.(json|ya?ml|toml)$/i,
];
const PROTECTED_SEGMENTS = new Set(['.ssh', '.aws', '.gnupg', '.git', '.docker', '.kube']);

/** True when a project-relative path points at a secret or VCS internals. */
export function isProtectedPath(relPath: string): boolean {
  const parts = relPath.split(/[\\/]+/).filter(Boolean);
  if (parts.some((p) => PROTECTED_SEGMENTS.has(p))) return true;
  const base = parts[parts.length - 1] ?? '';
  return PROTECTED_BASENAMES.some((re) => re.test(base));
}

function realpathOfExistingAncestor(p: string): string {
  let current = p;
  const rest: string[] = [];
  for (;;) {
    try {
      const real = fs.realpathSync(current);
      return path.join(real, ...rest.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return p;
      rest.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Resolves `relPath` inside `root`, rejecting traversal, absolute escapes and
 * symlinks that point outside the root.
 */
export function resolveInside(
  root: string,
  relPath: string,
  opts: { allowProtected?: boolean } = {},
): string {
  if (typeof relPath !== 'string' || relPath.includes('\0')) throw new PathError('Invalid path', 'INVALID');
  // Models sometimes send quoted or "." paths for the project root.
  const cleaned = relPath
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^\.\/?$/, '')
    .replace(/^[/\\]+/, '');
  const rootReal = fs.realpathSync(root);
  const target = path.resolve(rootReal, cleaned || '.');
  const real = realpathOfExistingAncestor(target);
  const rel = path.relative(rootReal, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PathError(`Path escapes the project: ${relPath}`, 'OUTSIDE_ROOT');
  }
  if (!opts.allowProtected && rel && isProtectedPath(rel)) {
    throw new PathError(`Access to protected file denied: ${relPath}`, 'PROTECTED');
  }
  return real;
}

export function toRelative(root: string, abs: string): string {
  return path.relative(fs.realpathSync(root), abs).split(path.sep).join('/');
}
