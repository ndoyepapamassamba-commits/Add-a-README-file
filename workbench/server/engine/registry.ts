// GitHub Intelligence Registry: lifecycle of discovered resources.
// DISCOVERED → REVIEWED → APPROVED → INSTALLED → ENABLED ⇄ DISABLED, REJECTED
// from anywhere. Nothing is installed because it exists: approval needs a
// security review, a score ≥ 60 (explicit confirmation between 60 and 74), and
// installation is a separate, user-triggered step. Every transition is logged
// and can be rolled back.
import { bandOf, securityReview, type RepoFacts, type SecurityReview } from './github';

export type ResourceStatus =
  'DISCOVERED' | 'REVIEWED' | 'APPROVED' | 'INSTALLED' | 'ENABLED' | 'DISABLED' | 'REJECTED';
export type ResourceType = 'mcp' | 'skill' | 'agent' | 'tool' | 'library';

export interface InstallPlan {
  /** skill-md: text instructions copied in (no code run); remote-mcp: HTTP MCP endpoint; stdio-mcp: local process (server edition). */
  kind: 'skill-md' | 'remote-mcp' | 'stdio-mcp' | 'none';
  target?: string;
  command?: string;
  note?: string;
}
export interface RegistryEvent {
  at: number;
  from: ResourceStatus | null;
  to: ResourceStatus;
  note: string;
  version?: string;
  security?: number;
}
export interface RegistryResource {
  id: string;
  name: string;
  type: ResourceType;
  capability: string[];
  github: string;
  version: string;
  license: string;
  cost: string;
  compatibility: 'direct' | 'server' | 'both' | 'none';
  status: ResourceStatus;
  facts: RepoFacts;
  review: SecurityReview | null;
  install: InstallPlan;
  history: RegistryEvent[];
}

export const STATUS_LABEL: Record<ResourceStatus, string> = {
  DISCOVERED: 'Découvert',
  REVIEWED: 'Revu',
  APPROVED: 'Approuvé',
  INSTALLED: 'Installé',
  ENABLED: 'Activé',
  DISABLED: 'Désactivé',
  REJECTED: 'Rejeté',
};

const ALLOWED: Record<ResourceStatus, ResourceStatus[]> = {
  DISCOVERED: ['REVIEWED', 'REJECTED'],
  REVIEWED: ['APPROVED', 'REJECTED', 'REVIEWED'],
  APPROVED: ['INSTALLED', 'REJECTED', 'REVIEWED'],
  INSTALLED: ['ENABLED', 'DISABLED', 'REJECTED'],
  ENABLED: ['DISABLED', 'REJECTED'],
  DISABLED: ['ENABLED', 'REJECTED'],
  REJECTED: ['DISCOVERED'],
};

export function guessType(f: RepoFacts): ResourceType {
  const t = `${f.fullName} ${f.description} ${(f.topics ?? []).join(' ')}`.toLowerCase();
  if (/\bmcp\b|model context protocol|mcp-server/.test(t)) return 'mcp';
  if (/skill/.test(t)) return 'skill';
  if (/agent/.test(t)) return 'agent';
  return 'library';
}

export function newResource(f: RepoFacts, capability: string[], now = Date.now()): RegistryResource {
  const type = guessType(f);
  return {
    id: f.fullName.toLowerCase(),
    name: f.fullName.split('/')[1]!,
    type,
    capability,
    github: `https://github.com/${f.fullName}`,
    version: f.latestRelease?.tag ?? f.pushedAt.slice(0, 10),
    license: f.license ?? 'aucune',
    cost: 'gratuit (open source)',
    compatibility: type === 'skill' ? 'both' : type === 'mcp' ? 'server' : 'none',
    status: 'DISCOVERED',
    facts: f,
    review: null,
    install: planInstall(f, type),
    history: [{ at: now, from: null, to: 'DISCOVERED', note: `découvert (${capability.join(', ')})` }],
  };
}

/** How the resource could be installed — never by running downloaded code in the browser. */
export function planInstall(f: RepoFacts, type: ResourceType): InstallPlan {
  if (type === 'skill')
    return {
      kind: 'skill-md',
      target: `https://raw.githubusercontent.com/${f.fullName}/${f.defaultBranch ?? 'main'}/SKILL.md`,
      note: 'Instructions texte copiées dans les Skills (aucun code exécuté), après contrôle anti-injection.',
    };
  if (type === 'mcp') {
    const pkg = f.packageJson?.name;
    const py = /name\s*=\s*"([^"]+)"/.exec(f.pyproject ?? '')?.[1];
    if (f.homepage && /\/(mcp|sse)(\/|$)/.test(f.homepage))
      return { kind: 'remote-mcp', target: f.homepage, note: 'Serveur MCP distant (HTTP).' };
    return {
      kind: 'stdio-mcp',
      command: pkg ? `npx -y ${pkg}` : py ? `uvx ${py}` : undefined,
      note: 'Processus local : installation possible uniquement dans l’édition serveur, après approbation.',
    };
  }
  return { kind: 'none', note: 'Bibliothèque : pas d’installation automatique.' };
}

export function review(r: RegistryResource, facts = r.facts, now = Date.now()): RegistryResource {
  const rv = securityReview(facts, now);
  const res: RegistryResource = {
    ...r,
    facts,
    review: rv,
    install: planInstall(facts, r.type),
    version: facts.latestRelease?.tag ?? facts.pushedAt.slice(0, 10),
    license: facts.license ?? 'aucune',
  };
  // A REJECT score stops the lifecycle immediately.
  const to: ResourceStatus = rv.band === 'REJECT' ? 'REJECTED' : 'REVIEWED';
  return log(
    res,
    to,
    `revue de sécurité : ${rv.score}/100 (${bandOf(rv.score)}${rv.depth === 'metadata' ? ', métadonnées' : ', scan profond'})`,
    now,
  );
}

function log(r: RegistryResource, to: ResourceStatus, note: string, now = Date.now()): RegistryResource {
  return {
    ...r,
    status: to,
    history: [
      ...r.history,
      { at: now, from: r.status, to, note, version: r.version, security: r.review?.score },
    ],
  };
}

export type TransitionResult = { ok: true; resource: RegistryResource } | { ok: false; error: string };

/** Applies a user transition, enforcing the security rules. */
export function transition(
  r: RegistryResource,
  to: ResourceStatus,
  opts: { confirm?: boolean; note?: string; edition?: 'direct' | 'server'; now?: number } = {},
): TransitionResult {
  if (!ALLOWED[r.status].includes(to))
    return { ok: false, error: `Transition interdite : ${STATUS_LABEL[r.status]} → ${STATUS_LABEL[to]}` };
  if (to === 'APPROVED') {
    if (!r.review) return { ok: false, error: 'Revue de sécurité requise avant approbation.' };
    if (r.review.suspicious) return { ok: false, error: 'Signaux suspects : approbation impossible.' };
    if (r.review.score < 60)
      return { ok: false, error: `Score de sécurité ${r.review.score}/100 < 60 : approbation refusée.` };
    if (r.review.score < 75 && !opts.confirm)
      return {
        ok: false,
        error: `Score ${r.review.score}/100 (revue requise) : confirmez explicitement après lecture des constats.`,
      };
  }
  if (to === 'INSTALLED') {
    if (r.install.kind === 'none')
      return { ok: false, error: 'Aucune méthode d’installation sûre pour ce type.' };
    if (r.install.kind === 'stdio-mcp' && opts.edition === 'direct')
      return {
        ok: false,
        error: `Serveur local : installez-le dans l’édition serveur${r.install.command ? ` (${r.install.command})` : ''}.`,
      };
  }
  return {
    ok: true,
    resource: log(r, to, opts.note ?? `${STATUS_LABEL[r.status]} → ${STATUS_LABEL[to]}`, opts.now),
  };
}

/** Undo the last transition (the previous state is restored, the rollback itself is logged). */
export function rollback(r: RegistryResource, now = Date.now()): TransitionResult {
  const last = [...r.history].reverse().find((h) => h.from !== null && h.to === r.status);
  if (!last || !last.from) return { ok: false, error: 'Rien à annuler.' };
  return {
    ok: true,
    resource: log(r, last.from, `rollback ${STATUS_LABEL[r.status]} → ${STATUS_LABEL[last.from]}`, now),
  };
}

/** Update check: new release / new commits since the version recorded at approval. */
export function updateAvailable(r: RegistryResource, fresh: RepoFacts): string | null {
  const v = fresh.latestRelease?.tag ?? fresh.pushedAt.slice(0, 10);
  return v !== r.version ? v : null;
}
