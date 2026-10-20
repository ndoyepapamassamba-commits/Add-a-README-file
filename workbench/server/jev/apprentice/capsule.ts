// JEV KNOWLEDGE CAPSULE + MICRO-ADAPTATION. A capsule is the minimal, compressed context that adapts a free model to
// a mission at INFERENCE TIME: Task DNA, validated skills, successful examples, failure patterns, correction rules,
// tools, output contract and quality criteria. No weights are touched; no private chain-of-thought is stored.
import type { JevLogEntry } from '../metrics';
import { findSimilar, safeText, type CorrectiveStrategy, strategiesFor } from '../fabric/memory';
import { selectSkills, skillPrompt, type FabricSkill } from '../fabric/skills';
import { scrubSecrets } from '../fabric/security';
import type { TaskDNA } from './types';
import { CapsuleCache, cacheKey, hashOf } from './cache';

/** ≈ 4 characters per token (labelled ESTIMATED wherever shown). */
export const tokensOf = (s: string) => Math.ceil(s.length / 4);

export interface CapsuleSection {
  key: string;
  /** Lower = kept longer when the budget is tight. */
  priority: number;
  text: string;
  tokens: number;
}
export interface Capsule {
  text: string;
  sections: CapsuleSection[];
  dropped: string[];
  skills: string[];
  experiences: number;
  tokensAdded: number;
  tokensFull: number;
  /** 0–1 share of the uncompressed capsule removed (null when there was nothing to compress). */
  contextReduction: number | null;
  toolsExposed: number;
  /** Total adaptation time (ms, measured) = retrieval + compilation. */
  adaptationMs: number;
  retrievalMs: number;
  compilationMs: number;
  /** Tokens of the uncompressed capsule / of what was actually injected. */
  contextBefore: number;
  contextAfter: number;
  /** CACHE HIT / MISS of this capsule (undefined when no cache is used). */
  cacheHit?: boolean;
}

export interface CapsuleInput {
  log: JevLogEntry[];
  skills: FabricSkill[];
  strategies: CorrectiveStrategy[];
  dna: TaskDNA;
  text: string;
  tools: string[];
  /** Ablation switches (benchmark arms): JEV only / + skills / + skills + experience. */
  use: { skills: boolean; experience: boolean };
  budgetTokens: number;
  now?: () => number;
  /** Candidate skills allowed for this run (under test, e.g. learned from a Teacher after a failure). */
  allowCandidate?: Set<string>;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const sec = (key: string, priority: number, text: string): CapsuleSection => {
  const t = scrubSecrets(text);
  return { key, priority, text: t, tokens: tokensOf(t) };
};

export function compileCapsule(i: CapsuleInput): Capsule {
  const clock = i.now ?? (() => performance.now());
  const t0 = clock();
  let retrieval = 0;
  const timed = <T>(f: () => T): T => {
    const a = clock();
    const r = f();
    retrieval += clock() - a;
    return r;
  };
  const d = i.dna;
  const sections: CapsuleSection[] = [];
  sections.push(
    sec(
      'output_contract',
      1,
      `Contrat de sortie : ${d.expected_output}${d.structured_output_requirement ? ' — format exact demandé, aucune prose autour' : ''}. Réponds en ${d.language === 'en' ? 'anglais' : 'français'}.`,
    ),
  );
  sections.push(
    sec(
      'quality_criteria',
      2,
      `Critères de validation : ${d.success_criteria.join(' ; ')}. Seuil qualité ${Math.round(d.quality_threshold * 100)} %.`,
    ),
  );
  sections.push(
    sec(
      'task_dna',
      3,
      `ADN de tâche : ${d.task_family}, difficulté ${Math.round(d.difficulty * 100)} %, risque ${d.risk}${d.ambiguity > 0.5 ? ', consigne ambiguë : formule ton interprétation avant de répondre' : ''}.`,
    ),
  );

  const hints = timed(() => strategiesFor(i.strategies, { taskType: d.task_type, text: i.text }));
  const rules = [
    ...hints.promptHints,
    ...(hints.requireVerification ? ['Vérifie ton résultat avant de conclure.'] : []),
  ];
  if (i.use.experience && rules.length)
    sections.push(sec('correction_rules', 4, `Règles de correction apprises : ${rules.join(' ; ')}`));

  const picked = i.use.skills
    ? timed(() =>
        selectSkills(
          i.skills,
          { taskType: d.task_type, text: i.text },
          { max: 2, allowCandidate: i.allowCandidate },
        ),
      )
    : [];
  if (picked.length)
    sections.push(sec('validated_skills', 5, picked.map((p) => skillPrompt(p.version)).join('\n')));

  let experiences = 0;
  if (i.use.experience) {
    const seen = timed(() =>
      findSimilar(i.log, i.text, { taskType: d.task_type, k: 6, minSimilarity: 0.25 }),
    );
    const fails = seen.matches.filter((m) => m.exp.classes.includes('failure')).slice(0, 2);
    if (fails.length)
      sections.push(
        sec(
          'failure_patterns',
          6,
          `Pièges déjà rencontrés : ${fails.map((m) => `${m.exp.cause ?? 'échec'} — ${m.exp.solution ?? 'vérifie'}`).join(' ; ')}`,
        ),
      );
    const ok = seen.matches.filter((m) => m.exp.success && (m.exp.quality ?? 0) >= 80).slice(0, 2);
    experiences = ok.length + fails.length;
    if (ok.length) {
      const ex = ok.map((m) => {
        const run = i.log.find((e) => e.id === m.exp.id);
        return `- ${cut(run ? safeText(run) : m.exp.task, 110)} → validé (qualité ${m.exp.quality})${m.exp.tools.length ? `, outils : ${m.exp.tools.slice(0, 3).join(', ')}` : ''}`;
      });
      sections.push(sec('examples', 7, `Exemples validés :\n${ex.join('\n')}`));
    }
    if (seen.advice.length)
      sections.push(
        sec(
          'domain_knowledge',
          8,
          `Déjà observé : ${seen.advice
            .slice(0, 2)
            .map((a) => cut(a, 140))
            .join(' ; ')}`,
        ),
      );
  }
  if (i.tools.length)
    sections.push(sec('tools', 9, `Outils autorisés (uniquement) : ${i.tools.slice(0, 12).join(', ')}.`));

  // Compression: drop the least valuable sections until the capsule fits; never the contract / criteria.
  const full = sections.reduce((a, s) => a + s.tokens, 0);
  const kept = [...sections].sort((a, b) => a.priority - b.priority);
  let total = full;
  const dropped: string[] = [];
  for (let k = kept.length - 1; k >= 0 && total > i.budgetTokens; k--) {
    if (kept[k]!.priority <= 2) break;
    total -= kept[k]!.tokens;
    dropped.push(kept[k]!.key);
    kept.splice(k, 1);
  }
  const text = `<jev_capsule adapted="inference-time">\n${kept.map((s) => s.text).join('\n')}\n</jev_capsule>`;
  return {
    text,
    sections: kept,
    dropped,
    skills: picked.map((p) => `${p.version.name}@${p.version.version}`),
    experiences,
    tokensAdded: tokensOf(text),
    tokensFull: full + 12,
    contextReduction: dropped.length ? Math.max(0, 1 - total / full) : null,
    toolsExposed: i.tools.length,
    adaptationMs: Math.round((clock() - t0) * 10) / 10,
    retrievalMs: Math.round(retrieval * 10) / 10,
    compilationMs: Math.round((clock() - t0 - retrieval) * 10) / 10,
    contextBefore: full + 12,
    contextAfter: tokensOf(text),
  };
}

/** Compile through the cache: the key is family × model × profileVersion × skillHash × contextHash × toolHash. */
export function compileCached(
  i: CapsuleInput,
  c: { cache: CapsuleCache<Capsule>; model: string; profileVersion: string; cacheable?: boolean },
): Capsule {
  const clock = i.now ?? (() => performance.now());
  const t0 = clock();
  const d = i.dna;
  const picked = i.use.skills
    ? selectSkills(
        i.skills,
        { taskType: d.task_type, text: i.text },
        { max: 2, allowCandidate: i.allowCandidate },
      )
    : [];
  const skillHash = hashOf(picked.map((p) => `${p.version.name}@${p.version.version}`).join(','));
  // The retrieved experiences depend on the wording and on how many runs exist: re-retrieve every 5 new runs.
  const kw = [
    ...new Set(
      i.text
        .toLowerCase()
        .replace(/[^a-zà-ÿ0-9 ]+/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3),
    ),
  ]
    .sort()
    .slice(0, 12)
    .join(',');
  const contextHash = hashOf(
    `${kw}|${d.task_family}|${d.risk}|${Math.round(d.difficulty * 10)}|${i.use.skills}${i.use.experience}|${Math.floor(i.log.length / 5)}`,
  );
  const toolHash = hashOf(i.tools.join(','));
  const key = cacheKey({
    family: d.task_family,
    model: c.model,
    profileVersion: c.profileVersion,
    skillHash,
    contextHash,
    toolHash,
  });
  // A critical task that needs fresh data never reuses a cached capsule.
  const allowed = c.cacheable !== false && !d.freshness_requirement;
  const hit = allowed ? c.cache.get(key) : null;
  if (hit) {
    const lookup = Math.round((clock() - t0) * 10) / 10;
    return { ...hit, cacheHit: true, retrievalMs: lookup, compilationMs: 0, adaptationMs: lookup };
  }
  const cap = compileCapsule(i);
  const out = { ...cap, cacheHit: false, adaptationMs: Math.round((clock() - t0) * 10) / 10 };
  if (allowed) c.cache.set(key, out);
  return out;
}

/** Compression must never cost quality: compare runs with the compressed vs the full capsule. */
export function compressionVerdict(o: {
  compressedQuality: number | null;
  fullQuality: number | null;
  n: number;
  tolerance?: number;
}): 'KEEP' | 'ROLLBACK' | 'INSUFFICIENT SAMPLE' {
  if (o.n < 5 || o.compressedQuality === null || o.fullQuality === null) return 'INSUFFICIENT SAMPLE';
  return o.compressedQuality >= o.fullQuality - (o.tolerance ?? 2) ? 'KEEP' : 'ROLLBACK';
}

export interface AdaptationReport {
  adaptationMs: number;
  tokensAdded: number;
  skillsInjected: number;
  experiencesUsed: number;
  toolsExposed: number;
  contextReduction: number | null;
}
export const adaptationReport = (c: Capsule): AdaptationReport => ({
  adaptationMs: c.adaptationMs,
  tokensAdded: c.tokensAdded,
  skillsInjected: c.skills.length,
  experiencesUsed: c.experiences,
  toolsExposed: c.toolsExposed,
  contextReduction: c.contextReduction,
});
