// JEV SECURITY: data classification, provider policy check, secret scrubbing, plugin governance.
// A secret never enters a prompt, a skill, the memory, a log, a benchmark or the council.
import { redact } from '../provider';
import type { Capability, DataClass } from './types';

export const CLASS_ORDER: DataClass[] = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL'];
const rank = (c: DataClass) => CLASS_ORDER.indexOf(c);

const SECRET_PATTERNS: RegExp[] = [
  /\b(sk-or-v1-|sk-|ghp_|gho_|github_pat_|ts_|tsk_|xox[bp]-)[A-Za-z0-9_-]{8,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(api[_-]?key|secret|password|mot de passe|token)\s*[:=]\s*\S{6,}/i,
  /\bBearer\s+[A-Za-z0-9._-]{16,}/,
];
const SENSITIVE_PERSONAL: RegExp[] = [/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/, /\b(?:\d[ -]?){13,19}\b/];
const CONFIDENTIAL_WORDS =
  /\b(confidentiel|strictement confidentiel|secret|usage interne|ne pas diffuser|donn[ée]es clients?|dossier client|comit[ée] des risques|portefeuille (de )?clients?|solde|impay[ée]s?|d[ée]biteurs?)\b/i;

export const containsSecret = (text: string) => SECRET_PATTERNS.some((r) => r.test(text));
/** Removes secrets and credential-looking values (reuses the V5 redaction, adds key blocks). */
export const scrubSecrets = (text: string): string =>
  redact(text)
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      '[clé privée supprimée]',
    )
    .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}/g, 'Bearer ***');

export interface Classification {
  level: DataClass;
  reasons: string[];
}
/** Deterministic, conservative classification of a request. `samples` = beginnings of attached text files. */
export function classifyData(
  text: string,
  attachments: string[] = [],
  samples: string[] = [],
): Classification {
  const all = [text, ...samples].join('\n');
  const reasons: string[] = [];
  let level: DataClass = 'PUBLIC';
  const up = (l: DataClass, why: string) => {
    if (rank(l) > rank(level)) level = l;
    reasons.push(why);
  };
  if (attachments.length) up('INTERNAL', 'fichiers joints');
  if (CONFIDENTIAL_WORDS.test(all)) up('CONFIDENTIAL', 'vocabulaire de confidentialité / données clients');
  if (
    /\b(ifrs ?9|npl|pdo|provision|comit[ée] des risques|portefeuille)\b/i.test(all) &&
    attachments.some((a) => /\.(xlsx?|csv)$/i.test(a))
  )
    up('CONFIDENTIAL', 'données de risque de crédit dans un tableur');
  if (SENSITIVE_PERSONAL.some((r) => r.test(all)))
    up('HIGHLY_CONFIDENTIAL', 'numéro de compte / carte détecté');
  if (containsSecret(all)) up('HIGHLY_CONFIDENTIAL', 'secret / clé API détecté (ne sera pas transmis)');
  if (/\b(strictement confidentiel|secret professionnel|secret bancaire)\b/i.test(all))
    up('HIGHLY_CONFIDENTIAL', 'mention de confidentialité stricte');
  return { level, reasons: [...new Set(reasons)] };
}

export interface ProviderPolicy {
  provider: string;
  /** What the provider declares / what the user verified. 'unknown' = not documented (the default). */
  retention: 'none' | 'short' | 'long' | 'unknown';
  training: 'no' | 'yes' | 'unknown';
  region?: string;
  source: 'user' | 'unknown';
}
export const unknownPolicy = (provider: string): ProviderPolicy => ({
  provider,
  retention: 'unknown',
  training: 'unknown',
  source: 'unknown',
});

export interface ProviderCheck {
  action: 'allow' | 'warn' | 'block';
  reason: string;
}
/**
 * Whether data of this class may go to this provider. Unknown policy is never read as "safe":
 *  - PUBLIC: always; INTERNAL: unless the provider trains on data;
 *  - CONFIDENTIAL: needs « no training » declared (unknown → warn, training → block);
 *  - HIGHLY_CONFIDENTIAL: needs « no training » AND « no retention » declared; otherwise blocked.
 */
export function checkProvider(
  level: DataClass,
  p: ProviderPolicy,
  o: { free?: boolean } = {},
): ProviderCheck {
  const free = o.free ? ' (modèle gratuit : politique du fournisseur non garantie)' : '';
  if (level === 'PUBLIC') return { action: 'allow', reason: 'données publiques' };
  if (p.training === 'yes')
    return {
      action: level === 'INTERNAL' ? 'warn' : 'block',
      reason: `${p.provider} entraîne sur les données${free}`,
    };
  if (level === 'INTERNAL')
    return { action: 'allow', reason: 'données internes, aucun entraînement déclaré contraire' };
  if (level === 'CONFIDENTIAL') {
    if (p.training === 'no') return { action: 'allow', reason: `${p.provider} : pas d'entraînement déclaré` };
    return { action: 'warn', reason: `${p.provider} : politique de données non renseignée${free}` };
  }
  if (p.training === 'no' && p.retention === 'none')
    return { action: 'allow', reason: `${p.provider} : ni entraînement ni conservation déclarés` };
  return {
    action: 'block',
    reason: `données très confidentielles : ${p.provider} n'a pas de politique « sans entraînement ni conservation » déclarée${free}`,
  };
}

/** Plugin governance: what may run silently and what always asks. */
export function governanceReport(caps: Capability[]): {
  name: string;
  type: string;
  risk: string;
  approvalRequired: boolean;
  dataAccess: boolean;
  writeAccess: boolean;
  networkAccess: boolean;
  permissions: string;
  status: string;
}[] {
  return caps.map((c) => ({
    name: c.name,
    type: c.type,
    risk: c.risk,
    approvalRequired: c.approvalRequired,
    dataAccess: c.dataAccess,
    writeAccess: c.writeAccess,
    networkAccess: c.networkAccess,
    permissions: c.permissions.join(', '),
    status: c.status,
  }));
}
const DESTRUCTIVE =
  /\b(delete|push|merge|send|publish|restore|drop|remove)\b|\.delete|\.push|\.merge|\.send|\.publish|modify_external/i;
export const isDestructive = (name: string) => DESTRUCTIVE.test(name);
