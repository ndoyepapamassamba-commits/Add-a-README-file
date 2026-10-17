// Production job queue — pure reducers (the runtime persists the array in IndexedDB under `vs.jobs`).
// A job that the provider already accepted (paid) is never resubmitted; on reopening, running video jobs are re-polled.
import type { ErrorClass, Job, JobStatus, MediaKind } from './types';

let seq = 0;
export const jobId = () => `job-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function newJob(o: {
  projectId: string;
  kind: MediaKind;
  task: string;
  model: string;
  sceneId?: string;
  estimate: number | null;
  estimateCertain: boolean;
  now?: number;
  fallbackOf?: string;
  promptVersion?: string;
}): Job {
  return {
    id: jobId(),
    projectId: o.projectId,
    sceneId: o.sceneId,
    kind: o.kind,
    task: o.task,
    model: o.model,
    status: 'QUEUED',
    createdAt: o.now ?? Date.now(),
    estimate: o.estimate,
    estimateCertain: o.estimateCertain,
    cost: null,
    retries: 0,
    paid: false,
    fallbackOf: o.fallbackOf,
    promptVersion: o.promptVersion,
  };
}
const patch = (jobs: Job[], id: string, f: (j: Job) => Job): Job[] =>
  jobs.map((j) => (j.id === id ? f(j) : j));
export const startJob = (jobs: Job[], id: string, now = Date.now()) =>
  patch(jobs, id, (j) => (j.status === 'QUEUED' ? { ...j, status: 'RUNNING', startedAt: now } : j));
/** The provider accepted the submission: from now on the job is billable and must never be resubmitted. */
export const markSubmitted = (jobs: Job[], id: string, remoteId: string, pollingUrl?: string) =>
  patch(jobs, id, (j) => ({ ...j, paid: true, remoteId, pollingUrl }));
export const completeJob = (
  jobs: Job[],
  id: string,
  o: { cost: number | null; assetId?: string; now?: number },
) =>
  patch(jobs, id, (j) => ({
    ...j,
    status: 'COMPLETED',
    endedAt: o.now ?? Date.now(),
    cost: o.cost,
    assetId: o.assetId,
  }));
export const failJob = (
  jobs: Job[],
  id: string,
  o: { error: string; errorClass: ErrorClass; now?: number },
) =>
  patch(jobs, id, (j) => ({
    ...j,
    status: 'FAILED',
    endedAt: o.now ?? Date.now(),
    error: o.error,
    errorClass: o.errorClass,
  }));
export const cancelJob = (jobs: Job[], id: string, now = Date.now()) =>
  patch(jobs, id, (j) => (j.status === 'COMPLETED' ? j : { ...j, status: 'CANCELLED', endedAt: now }));
export const bumpRetry = (jobs: Job[], id: string) =>
  patch(jobs, id, (j) => ({ ...j, retries: j.retries + 1 }));

/** May this failed job be relaunched automatically? Never when it was already paid, never for non-transient classes. */
export function canAutoRetry(j: Job): boolean {
  if (j.status !== 'FAILED' || j.paid) return false;
  return j.errorClass === 'RATE_LIMIT' || j.errorClass === 'SERVER_ERROR' || j.errorClass === 'TIMEOUT';
}
export interface Recovery {
  /** Video jobs to poll again (never resubmitted). */
  repoll: Job[];
  /** Jobs that were running but have no remote id: the submission outcome is unknown — marked FAILED, not resubmitted. */
  orphaned: Job[];
  jobs: Job[];
}
/** Called when the studio reopens: nothing is resubmitted. */
export function recoverJobs(jobs: Job[], now = Date.now()): Recovery {
  const running = jobs.filter((j) => j.status === 'RUNNING');
  const repoll = running.filter((j) => j.kind === 'video' && j.remoteId);
  const orphaned = running.filter((j) => !(j.kind === 'video' && j.remoteId));
  const ids = new Set(orphaned.map((j) => j.id));
  return {
    repoll,
    orphaned,
    jobs: jobs.map((j) =>
      ids.has(j.id)
        ? {
            ...j,
            status: 'FAILED' as JobStatus,
            endedAt: now,
            error: 'interrompu pendant la fermeture ; résultat inconnu, non relancé automatiquement',
            errorClass: 'UNKNOWN' as ErrorClass,
          }
        : j,
    ),
  };
}
export const spentOf = (jobs: Job[], projectId: string) =>
  jobs.filter((j) => j.projectId === projectId).reduce((a, j) => a + (j.cost ?? 0), 0);
export const stats = (jobs: Job[]) => ({
  total: jobs.length,
  queued: jobs.filter((j) => j.status === 'QUEUED').length,
  running: jobs.filter((j) => j.status === 'RUNNING').length,
  completed: jobs.filter((j) => j.status === 'COMPLETED').length,
  failed: jobs.filter((j) => j.status === 'FAILED').length,
  cancelled: jobs.filter((j) => j.status === 'CANCELLED').length,
});
