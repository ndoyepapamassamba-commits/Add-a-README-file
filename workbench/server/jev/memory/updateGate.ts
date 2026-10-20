/**
 * MISES À JOUR CONTRÔLÉES — what the application learns by itself (a lesson drawn from a correction, a skill it
 * wrote) is a PROPOSAL: it is analysed (security, stability, compatibility, design protection) and waits for the
 * user's validation. Nothing is applied automatically. Pure.
 */
import type { MemFact } from './semantic';

export interface GateCheck {
  id: 'security' | 'stability' | 'compatibility' | 'design';
  label: string;
  ok: boolean;
  note: string;
}
export interface UpdateProposal {
  id: string;
  kind: 'lesson';
  fact: MemFact;
  /** Why it was proposed (the correction it comes from). */
  origin: string;
  at: number;
  checks: GateCheck[];
  /** blocked: a security check failed, it can only be refused. */
  status: 'pending' | 'blocked';
}

/** Instructions an update must never carry (prompt injection, exfiltration, disabling protections). */
const DANGEROUS = /\b(ignore (all|previous|the) (rules|instructions)|ignore les (règles|instructions)|désactive(r)? (la )?(sécurité|protection|contrôle)|disable (security|safety|checks)|api[_ -]?key|mot de passe|password|token secret|envoie[rz]? .* (à|vers) https?:|send .* to https?:|exfiltr|rm -rf|delete all|supprime(r)? tous)\b/i;
const SECRET = /\b(sk-[a-z0-9]{12,}|tvly-[a-z0-9]{8,}|ghp_[a-z0-9]{20,}|AKIA[0-9A-Z]{16}|eyJ[a-zA-Z0-9_-]{20,}\.)/i;
/** Touches the application's own look (interface, theme, locked house charter) — protected, never automatic. */
const DESIGN = /\b(interface|l['’]?ui\b|thème de l['’]?app|couleurs? de l['’]?application|charte maison|design (de l['’]?app|verrouillé)|DESIGN_LOCK|style maison)/i;

export function assessUpdate(fact: MemFact, existing: MemFact[]): GateCheck[] {
  const t = fact.text;
  const dup = existing.find((e) => e.text.trim().toLowerCase() === t.trim().toLowerCase());
  return [
    {
      id: 'security',
      label: 'Sécurité',
      ok: !DANGEROUS.test(t) && !SECRET.test(t),
      note: SECRET.test(t) ? 'contient ce qui ressemble à une clé ou un jeton' : DANGEROUS.test(t) ? 'instruction dangereuse (contourner les règles, secrets, suppression, envoi externe)' : 'aucune instruction dangereuse ni secret',
    },
    {
      id: 'stability',
      label: 'Stabilité',
      ok: !dup && t.length <= 400,
      note: dup ? 'déjà connue (doublon)' : t.length > 400 ? 'trop longue pour une règle fiable' : 'règle courte, sans doublon',
    },
    {
      id: 'compatibility',
      label: 'Compatibilité',
      ok: t.trim().length >= 12 && Boolean(fact.tag),
      note: fact.tag ? `s'applique aux demandes de type « ${fact.tag} »` : 'type de demande inconnu',
    },
    {
      id: 'design',
      label: 'Protection du design',
      ok: !DESIGN.test(t),
      note: DESIGN.test(t) ? 'touche au design de l’application : protégé, à valider explicitement' : 'ne touche pas au design de l’application',
    },
  ];
}
export function propose(fact: MemFact, origin: string, existing: MemFact[], now = Date.now()): UpdateProposal {
  const checks = assessUpdate(fact, existing);
  return { id: `upd-${fact.id}`, kind: 'lesson', fact, origin: origin.slice(0, 240), at: now, checks, status: checks.find((c) => c.id === 'security')!.ok ? 'pending' : 'blocked' };
}
