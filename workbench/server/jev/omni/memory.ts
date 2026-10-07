// OMNIPOTENT V4.1 — MEMORY GOVERNOR 2.0 (§61, §66, §76, §90, §98).
// Memory is a library, the mission is the contract. A remembered item is a CANDIDATE: it is scored against the current mission
// and only the minimal set that passes the threshold reaches the model. Foreign-domain memories are QUARANTINED, not merely
// unused. Writes are governed too: a generated statement never becomes canonical memory because it was generated.
import type { MissionCapsule } from './mission';
import { affinity, fileNames, topicKeys } from './text';

export type MemType =
  | 'USER_PREFERENCES'
  | 'PROJECT_FACTS'
  | 'VERIFIED_DECISIONS'
  | 'VERIFIED_REQUIREMENTS'
  | 'SUCCESS_STRATEGIES'
  | 'FAILURE_LESSONS'
  | 'CURRENT_MISSION'
  | 'MISSION_ARCHIVE'
  | 'FOREIGN_OR_UNRELATED';
export interface MemCandidate {
  id: string;
  type: MemType;
  text: string;
  /** 0-1 confidence that the statement is verified. */
  verified?: number;
  /** Epoch ms of the last verification / creation. */
  at?: number;
  /** Historical success of the strategy / lesson, 0-1. */
  success?: number;
  missionId?: string;
}
export type MemDecision = 'ALLOW' | 'OPTIONAL' | 'BLOCK' | 'QUARANTINE';
export interface MemScored extends MemCandidate {
  score: number;
  parts: { semantic: number; mission: number; artifact: number; verified: number; recency: number; success: number };
  decision: MemDecision;
  reason: string;
  domains: string[];
}

export const DOMAIN_RX: Record<string, RegExp> = {
  finance: /\b(ifrs ?9|npl|provision\w*|cr[ée]dit|bilan|encours|imp[ée]ay[ée]s?|taux|risque|xof|fcfa|banque|bceao|comex|audit financier)\b/i,
  regulatory: /\b(bceao|r[ée]glementaire|conformit[ée]|compliance|b[âa]le|commission bancaire)\b/i,
  code: /\b(code|bug|fonction|api|react|typescript|javascript|python|html|css|script|build|npm|compile|refactor|composant)\b/i,
  visual: /\b(photo|image|design|mise en page|layout|couleur\w*|police|logo|scroll|d[ée]fil\w*|visuel\w*|affichage|css)\b/i,
  data: /\b(excel|xlsx|csv|colonnes?|tableau|donn[ée]es|formule\w*|feuille|onglet)\b/i,
  document: /\b(word|docx|pdf|rapport|note|contrat|document)\b/i,
  mail: /\b(mail|e-?mail|courriel|outlook)\b/i,
  research: /\b(recherche|sources?|actualit[ée]|web|veille)\b/i,
  media: /\b(vid[ée]o|sc[èe]ne|storyboard|personnage|voix|musique|afrikatoon|tiktok|3d|2d)\b/i,
};
export const domainsOf = (t: string): string[] => Object.entries(DOMAIN_RX).filter(([, rx]) => rx.test(t)).map(([k]) => k);

const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const MEM_WEIGHTS = { semantic: 0.4, mission: 0.2, artifact: 0.15, verified: 0.1, recency: 0.05, success: 0.1 } as const;
export const MEM_THRESHOLDS = { block: 0.7, allow: 0.85 } as const;

/** A lexical proxy for embedding similarity: calibrated so that a clearly on-topic item reaches ~1. */
const SEM_GAIN = 2.5;

export function governMemory(cands: MemCandidate[], c: Pick<MissionCapsule, 'user_objective' | 'artifact_targets' | 'task_type'>, o: { now?: number; requested?: string[] } = {}) {
  const now = o.now ?? Date.now();
  const goal = topicKeys(`${c.user_objective} ${c.task_type.replace(/[:-]/g, ' ')}`);
  const goalDomains = new Set(domainsOf(`${c.user_objective} ${c.task_type}`));
  const goalFiles = new Set([...c.artifact_targets, ...fileNames(c.user_objective)]);
  const scored: MemScored[] = cands.map((m) => {
    const keys = topicKeys(m.text);
    const domains = domainsOf(m.text);
    const semantic = clamp(affinity(goal, keys) * SEM_GAIN);
    const shared = domains.some((d) => goalDomains.has(d));
    const mission = domains.length === 0 ? (semantic > 0 ? 0.5 : 0.2) : shared ? 1 : 0;
    const files = fileNames(m.text);
    const artifact = files.length ? (files.some((f) => goalFiles.has(f)) ? 1 : 0) : shared ? 0.4 : 0;
    const verified = clamp(m.verified ?? 0.4);
    const ageDays = m.at ? Math.max(0, (now - m.at) / 86_400_000) : 30;
    const recency = clamp(Math.pow(0.5, ageDays / 30));
    const success = clamp(m.success ?? 0.5);
    const score =
      MEM_WEIGHTS.semantic * semantic +
      MEM_WEIGHTS.mission * mission +
      MEM_WEIGHTS.artifact * artifact +
      MEM_WEIGHTS.verified * verified +
      MEM_WEIGHTS.recency * recency +
      MEM_WEIGHTS.success * success;
    let decision: MemDecision = score >= MEM_THRESHOLDS.allow ? 'ALLOW' : score >= MEM_THRESHOLDS.block ? 'OPTIONAL' : 'BLOCK';
    let reason = `score ${score.toFixed(2)}`;
    const foreign = domains.length > 0 && goalDomains.size > 0 && !shared && semantic === 0;
    if (m.type === 'MISSION_ARCHIVE') {
      decision = 'BLOCK';
      reason = 'archive de mission : jamais injectée automatiquement';
    } else if (m.type === 'FOREIGN_OR_UNRELATED' || foreign) {
      decision = 'QUARANTINE';
      reason = `sujet étranger (${domains.join('/')}) à la mission (${[...goalDomains].join('/') || 'générale'})`;
    } else if (o.requested?.includes(m.id)) {
      decision = 'ALLOW';
      reason = 'demandée explicitement par l’utilisateur';
    }
    return { ...m, score, parts: { semantic, mission, artifact, verified, recency, success }, decision, reason, domains };
  });
  const by = (d: MemDecision) => scored.filter((s) => s.decision === d);
  return {
    scored,
    allowed: by('ALLOW'),
    optional: by('OPTIONAL'),
    blocked: by('BLOCK'),
    quarantined: by('QUARANTINE'),
    stats: { candidates: scored.length, allowed: by('ALLOW').length, optional: by('OPTIONAL').length, blocked: by('BLOCK').length, quarantined: by('QUARANTINE').length },
  };
}

// ───────── project-memory digest (<.ai/FILE.md> blocks) ─────────
const DOC_TYPE: Record<string, { type: MemType; verified: number }> = {
  'PROJECT.md': { type: 'PROJECT_FACTS', verified: 0.8 },
  'ARCHITECTURE.md': { type: 'PROJECT_FACTS', verified: 0.8 },
  'REQUIREMENTS.md': { type: 'VERIFIED_REQUIREMENTS', verified: 1 },
  'DECISIONS.md': { type: 'VERIFIED_DECISIONS', verified: 1 },
  'MEMORY.md': { type: 'PROJECT_FACTS', verified: 0.6 },
  'TODO.md': { type: 'PROJECT_FACTS', verified: 0.7 },
  'KNOWN_ISSUES.md': { type: 'FAILURE_LESSONS', verified: 0.7 },
  'TESTS.md': { type: 'MISSION_ARCHIVE', verified: 0.7 },
  'CHANGELOG.md': { type: 'MISSION_ARCHIVE', verified: 0.7 },
};
/** Splits the digest the model would receive into governable paragraphs. */
export function digestCandidates(digest: string): (MemCandidate & { file: string })[] {
  const out: (MemCandidate & { file: string })[] = [];
  for (const m of digest.matchAll(/<(\.ai\/([\w.]+))>\n([\s\S]*?)\n<\/\1>/g)) {
    const file = m[2]!;
    const meta = DOC_TYPE[file] ?? { type: 'PROJECT_FACTS' as MemType, verified: 0.5 };
    const blocks = m[3]!.split(/\n{2,}|\n(?=#{1,3} )/).map((b) => b.trim()).filter((b) => b.length >= 12);
    blocks.forEach((b, i) => out.push({ id: `${file}#${i}`, file, type: meta.type, text: b, verified: meta.verified }));
  }
  return out;
}
/** Rebuilds a digest with ONLY the allowed (and, within the budget, optional) paragraphs. */
export function filterDigest(digest: string, c: Pick<MissionCapsule, 'user_objective' | 'artifact_targets' | 'task_type'>, o: { maxChars?: number; now?: number } = {}) {
  const cands = digestCandidates(digest);
  const g = governMemory(cands, c, { now: o.now });
  const keep = new Set([...g.allowed, ...g.optional].map((s) => s.id));
  const byFile = new Map<string, string[]>();
  let chars = 0;
  const max = o.maxChars ?? 3000;
  for (const s of [...g.allowed, ...g.optional].sort((a, b) => b.score - a.score)) {
    if (chars + s.text.length > max) continue;
    chars += s.text.length;
    const file = (s as MemScored & { file?: string }).file ?? (cands.find((x) => x.id === s.id) as { file: string }).file;
    byFile.set(file, [...(byFile.get(file) ?? []), s.text]);
  }
  const text = [...byFile].map(([f, ps]) => `<.ai/${f}>\n${ps.join('\n\n')}\n</.ai/${f}>`).join('\n\n');
  void keep;
  return { text, stats: g.stats, rawChars: digest.length, keptChars: text.length, quarantined: g.quarantined.map((q) => q.id) };
}

// ───────── memory write governor ─────────
export interface WriteCandidate {
  content: string;
  source: 'user' | 'tool-verified' | 'model' | 'test-result' | 'foreign-mission';
  /** The statement was checked against a tool result, a test or an explicit user confirmation. */
  verified: boolean;
  /** The user explicitly asked to remember it. */
  confirmedByUser?: boolean;
  stable?: boolean;
  reusable?: boolean;
  missionId?: string;
  currentMissionId?: string;
  /** The statement is a hypothesis / a plan that was abandoned / an unverified answer. */
  hypothesis?: boolean;
}
export type WriteDecision = { action: 'COMMIT'; reason: string } | { action: 'QUARANTINE'; reason: string } | { action: 'DISCARD'; reason: string };
export function governWrite(w: WriteCandidate): WriteDecision {
  if (w.source === 'foreign-mission' || (w.missionId && w.currentMissionId && w.missionId !== w.currentMissionId && !w.confirmedByUser))
    return { action: 'QUARANTINE', reason: 'issue d’une autre mission : jamais mémorisée comme vérité courante' };
  if (w.hypothesis) return { action: 'DISCARD', reason: 'hypothèse ou plan abandonné : interdit comme mémoire canonique' };
  if (w.confirmedByUser) return { action: 'COMMIT', reason: 'confirmée explicitement par l’utilisateur' };
  if (w.source === 'model' && !w.verified) return { action: 'DISCARD', reason: 'sortie de modèle non vérifiée : une génération n’est pas une mémoire' };
  if (w.verified && (w.stable || w.reusable)) return { action: 'COMMIT', reason: 'vérifiée, stable ou réutilisable' };
  if (w.verified) return { action: 'QUARANTINE', reason: 'vérifiée mais ni stable ni réutilisable : à revalider avant usage' };
  return { action: 'DISCARD', reason: 'ni vérifiée ni confirmée' };
}
/** Persisted record (§66.3). */
export interface MemoryRecord {
  memory_id: string;
  type: MemType;
  content: string;
  source: string;
  mission_id: string;
  confidence: number;
  verified: boolean;
  created_at: number;
  last_verified_at: number | null;
  supersedes: string[];
  expires_at: number | null;
}
