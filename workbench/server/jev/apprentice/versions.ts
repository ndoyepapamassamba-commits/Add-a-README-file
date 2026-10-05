// APPRENTICE VERSIONING: "Gemma-IFRS9-v1 → v2 → v3". Every new adaptation profile is benchmarked on its own runs;
// a regression rolls it back to the previous version.
import type { JevLogEntry } from '../metrics';
import { qualityOfEntry } from '../fabric/memory';

export interface ProfileVersion {
  id: string;
  model: string;
  family: string;
  n: number;
  /** Skills (name@version) the profile injects. */
  skills: string[];
  capsuleBudget: number;
  createdAt: number;
  status: 'candidate' | 'production' | 'rolled_back';
  benchmark: { n: number; success: number | null; quality: number | null; at: number } | null;
  note: string;
}
const short = (m: string) => (m.split('/').pop() ?? m).replace(/:free$/, '');
export const profileName = (model: string, family: string, n: number) =>
  `${short(model)}-${family.split(':').pop()}-v${n}`;
export const profileKey = (v: { model: string; family: string }) => `${v.model}|${v.family}`;

export function newProfileVersion(
  existing: ProfileVersion[],
  model: string,
  family: string,
  skills: string[],
  capsuleBudget: number,
  now = Date.now(),
): ProfileVersion {
  const prev = existing.filter((v) => v.model === model && v.family === family);
  const n = prev.length + 1;
  return {
    id: profileName(model, family, n),
    model,
    family,
    n,
    skills,
    capsuleBudget,
    createdAt: now,
    status: 'candidate',
    benchmark: null,
    note: n === 1 ? 'première adaptation' : `dérivée de v${n - 1}`,
  };
}

/** Benchmark of a version from its own recorded runs (tag.profileVersion). */
export function benchmarkOf(
  log: JevLogEntry[],
  v: ProfileVersion,
  now = Date.now(),
): NonNullable<ProfileVersion['benchmark']> {
  const es = log.filter((e) => e.apprentice?.profileVersion === v.id && e.success !== null);
  const q = es.map(qualityOfEntry).filter((x): x is number => x !== null);
  return {
    n: es.length,
    success: es.length ? es.filter((e) => e.success).length / es.length : null,
    quality: q.length ? q.reduce((a, b) => a + b, 0) / q.length : null,
    at: now,
  };
}

export interface VersionDecision {
  action: 'promote' | 'rollback' | 'keep_candidate';
  reason: string;
}
/** Promote when the new version is at least as good as the active one (tolerances), roll back on regression. */
export function decideVersion(
  prev: ProfileVersion | null,
  cur: ProfileVersion,
  o: { minN?: number; tolSuccess?: number; tolQuality?: number } = {},
): VersionDecision {
  const minN = o.minN ?? 5;
  const b = cur.benchmark;
  if (!b || b.n < minN)
    return { action: 'keep_candidate', reason: `INSUFFICIENT SAMPLE : n = ${b?.n ?? 0} < ${minN}` };
  if (b.success !== null && b.success < 0.8)
    return { action: 'rollback', reason: `réussite ${Math.round(b.success * 100)} % < 80 %` };
  const pb = prev?.benchmark;
  if (pb && pb.n >= minN) {
    if (b.success !== null && pb.success !== null && b.success < pb.success - (o.tolSuccess ?? 0.05))
      return {
        action: 'rollback',
        reason: `régression de réussite : ${Math.round(b.success * 100)} % < ${Math.round(pb.success * 100)} % (v${prev!.n})`,
      };
    if (b.quality !== null && pb.quality !== null && b.quality < pb.quality - (o.tolQuality ?? 3))
      return {
        action: 'rollback',
        reason: `régression de qualité : ${b.quality.toFixed(0)} < ${pb.quality.toFixed(0)} (v${prev!.n})`,
      };
  }
  return {
    action: 'promote',
    reason: pb
      ? `v${cur.n} ≥ v${prev!.n} sur ${b.n} missions`
      : `v${cur.n} validée sur ${b.n} missions (réussite ${Math.round((b.success ?? 0) * 100)} %)`,
  };
}
export const applyDecision = (v: ProfileVersion, d: VersionDecision): ProfileVersion => ({
  ...v,
  status: d.action === 'promote' ? 'production' : d.action === 'rollback' ? 'rolled_back' : 'candidate',
  note: d.reason,
});
/** The version used at runtime for a (model, family): the latest in production. */
export const activeVersion = (vs: ProfileVersion[], model: string, family: string) =>
  [...vs]
    .filter((v) => v.model === model && v.family === family && v.status === 'production')
    .sort((a, b) => b.n - a.n)[0] ?? null;
