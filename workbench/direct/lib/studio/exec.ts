// Single execution path of every paid media call: classification → capability filter → model selection (Cost Governor)
// → budget check → job → call with retries → fallback → asset → memory → JEV_LOG. A job already paid is never relaunched.
import { useStudio } from './store';
import { blobs } from './blobs';
import { Trace, logStudio } from './jevlog';
import type { Candidate, Estimate } from '../../../server/jev/studio/cost';
import { checkBudget, pickModel } from '../../../server/jev/studio/cost';
import { budgetTier, effectiveMode } from '../../../server/jev/studio/film';
import type { MediaModel } from '../../../server/jev/studio/capabilities';
import { StudioError, classifyError, withRetry } from '../../../server/jev/studio/errors';
import {
  newJob,
  startJob,
  completeJob,
  failJob,
  bumpRetry,
  markSubmitted,
  spentOf,
} from '../../../server/jev/studio/jobs';
import { championTable, comboKey, type ProdRecord } from '../../../server/jev/studio/memory';
import { spent as bpSpent } from '../../../server/jev/studio/blueprint';
import type {
  AssetKind,
  AssetMeta,
  AssetStatus,
  ErrorClass,
  MediaKind,
} from '../../../server/jev/studio/types';
import { useStore } from '../store';

/** Asked when a call would exceed the cap or its price is uncertain. The UI installs a modal; the default is window.confirm. */
let confirmFn: (msg: string) => Promise<boolean> = async (m) =>
  typeof window !== 'undefined' ? window.confirm(m) : false;
export const setConfirmHandler = (f: (msg: string) => Promise<boolean>) => {
  confirmFn = f;
};

export const askConfirm = (msg: string) => confirmFn(msg);

export class BudgetBlocked extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

/** Measured history of a model on a combination, for the selection (champion needs a validated sample). */
export function historyFor(
  r: Pick<ProdRecord, 'kind' | 'task' | 'style' | 'risk' | 'contract'>,
  model: string,
): Candidate['history'] {
  const recs = useStudio.getState().memory;
  const key = comboKey(r);
  const t = championTable(recs.filter((x) => comboKey(x) === key))[0];
  const row = t?.rows.find((x) => x.model === model);
  if (!row) return null;
  return {
    n: row.n,
    quality: row.quality?.value ?? null,
    successRate: row.success?.value ?? null,
    champion: t!.champion === model,
    confidence: row.confidence,
  };
}

export interface Attempt<R> {
  /** Calls the model; returns the result and the cost the provider reported (null = not reported). */
  call: (
    m: MediaModel,
    job: { id: string; onSubmitted: (remoteId: string, pollingUrl?: string) => void },
  ) => Promise<{ result: R; cost: number | null }>;
  /** Stores the result as a blob and returns the asset to register (or null when nothing to store). */
  store?: (
    result: R,
    m: MediaModel,
  ) => Promise<{
    blob: Blob;
    kind: AssetKind;
    mime: string;
    name: string;
    tags?: string[];
    status?: AssetStatus;
    prompt?: string;
  } | null>;
}
export interface MediaRequest<R> extends Attempt<R> {
  projectId: string;
  sceneId?: string;
  characterId?: string;
  kind: MediaKind;
  /** Free-form task family: 2D-REDRAW, CHARACTER-CONSISTENCY, FRENCH… */
  task: string;
  style: string;
  contract: string;
  risk?: 'low' | 'normal' | 'high';
  promptVersion: string;
  mission: string;
  candidates: { model: MediaModel; estimate: Estimate }[];
  /** Maximum number of different models tried. */
  maxModels?: number;
  /** The corrective regeneration of an earlier result. */
  regenerated?: boolean;
  /** Pre-selection trace notes (classification, discovery, prompt compilation) already measured by the caller. */
  trace?: Trace;
  confirmed?: boolean;
  /** Asset graph: ids of the assets this result is generated from. */
  parentIds?: string[];
}
export interface MediaOutcome<R> {
  result: R;
  model: string;
  jobId: string;
  cost: number | null;
  costCertain: boolean;
  fallbackUsed: boolean;
  retries: number;
  assetId?: string;
  explain: string[];
}

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Executes one production call with selection, budget gate, retries, fallback, storage, memory and JEV_LOG. */
export async function executeMedia<R>(req: MediaRequest<R>): Promise<MediaOutcome<R>> {
  const S = useStudio.getState();
  const bp = S.projects[req.projectId];
  if (!bp) throw new StudioError('UNKNOWN', 'projet introuvable');
  const trace = req.trace ?? new Trace();
  const risk = req.risk ?? 'normal';
  if (!req.candidates.length)
    throw new StudioError(
      'UNSUPPORTED_CAPABILITY',
      'Capability unavailable in current environment : aucun modèle découvert ne supporte cette configuration.',
    );
  const cands: Candidate[] = req.candidates.map((c) => ({
    model: c.model,
    estimate: c.estimate,
    history: historyFor(
      { kind: req.kind, task: req.task, style: req.style, risk, contract: req.contract },
      c.model.id,
    ),
  }));
  // Budget governor tiers: the nearer the cap, the cheaper the mode actually applied.
  const mode = effectiveMode(bp.mode, bpSpent(bp), bp.cap);
  const pick = pickModel(cands, mode);
  if (mode !== bp.mode)
    pick.explain.push(`PALIER BUDGET : ${bp.mode} → ${mode} (${budgetTier(bpSpent(bp), bp.cap).label})`);
  trace.stage('MODEL_SELECTION', pick.explain.join(' · '));
  const order = pick.order.slice(0, req.maxModels ?? 3);
  let lastErr: StudioError | null = null;
  for (const [idx, cand] of order.entries()) {
    const model = cand.model;
    const cur = useStudio.getState().projects[req.projectId]!;
    const decision = checkBudget(
      { mode: cur.mode, cap: cur.cap, spent: bpSpent(cur) },
      cand.estimate,
      req.confirmed,
    );
    if (!decision.allowed) {
      const ok = await confirmFn(`${decision.reason}\n\nModèle : ${model.id}\nAutoriser cet appel ?`);
      if (!ok) throw new BudgetBlocked(decision.reason);
    }
    const job = newJob({
      projectId: req.projectId,
      kind: req.kind,
      task: req.task,
      model: model.id,
      sceneId: req.sceneId,
      estimate: cand.estimate.usd,
      estimateCertain: cand.estimate.certain,
      fallbackOf: idx > 0 ? order[idx - 1]!.model.id : undefined,
      promptVersion: req.promptVersion,
    });
    useStudio.getState().setJobs((j) => [...j, job]);
    useStudio.getState().setJobs((j) => startJob(j, job.id));
    const t0 = performance.now();
    try {
      const { value, retries } = await withRetry(
        async (attempt) => {
          if (attempt > 0) useStudio.getState().setJobs((j) => bumpRetry(j, job.id));
          return req.call(model, {
            id: job.id,
            onSubmitted: (rid, url) =>
              useStudio.getState().setJobs((j) => markSubmitted(j, job.id, rid, url)),
          });
        },
        { retries: 2, baseMs: 1000 },
      );
      const latency = performance.now() - t0;
      trace.stage(
        'GENERATION',
        `${model.id} · ${Math.round(latency)} ms${retries ? ` · ${retries} relance(s)` : ''}`,
        { cost: value.cost ?? 0 },
      );
      let assetId: string | undefined;
      if (req.store) {
        const st = await req.store(value.result, model);
        if (st) {
          assetId = uid('asset');
          await blobs.put(assetId, st.blob);
          const meta: AssetMeta = {
            id: assetId,
            kind: st.kind,
            status: st.status ?? 'GENERATED_ASSET',
            projectId: req.projectId,
            sceneId: req.sceneId,
            characterId: req.characterId,
            model: model.id,
            prompt: st.prompt,
            createdAt: Date.now(),
            cost: value.cost,
            source: 'openrouter',
            tags: st.tags ?? [],
            parentIds: req.parentIds?.length ? req.parentIds : undefined,
            mime: st.mime,
            bytes: st.blob.size,
            name: st.name,
          };
          useStudio.getState().addAsset(meta);
        }
      }
      const certain = value.cost !== null || cand.estimate.certain;
      const cost = value.cost ?? cand.estimate.usd;
      useStudio.getState().setJobs((j) => completeJob(j, job.id, { cost: value.cost ?? null, assetId }));
      useStudio.getState().patchProject(req.projectId, (b) => ({
        ...b,
        assets: assetId ? [...b.assets, assetId] : b.assets,
        models: [...new Set([...b.models, model.id])],
        generationJobs: [...b.generationJobs, job.id],
        costs:
          cost === null
            ? b.costs
            : [
                ...b.costs,
                {
                  at: Date.now(),
                  jobId: job.id,
                  kind: req.kind,
                  model: model.id,
                  amount: cost,
                  certain,
                  note:
                    value.cost !== null ? 'coût réel (usage.cost)' : `estimation : ${cand.estimate.formula}`,
                },
              ],
      }));
      useStudio.getState().addMemory({
        id: uid('mem'),
        at: Date.now(),
        projectId: req.projectId,
        sceneId: req.sceneId,
        kind: req.kind,
        task: req.task,
        style: req.style,
        contract: req.contract,
        risk,
        model: model.id,
        success: true,
        quality: null,
        cost,
        latencyMs: latency,
        regenerated: Boolean(req.regenerated),
        fallback: idx > 0,
        prompt: req.promptVersion,
      });
      trace.stage(
        'FINALIZATION',
        `asset ${assetId ?? '—'} · coût ${cost === null ? 'non mesuré' : `${cost.toFixed(4)} $${certain ? '' : ' (estimé)'}`}`,
      );
      logStudio({
        tag: {
          project_id: req.projectId,
          scene_id: req.sceneId,
          job_id: job.id,
          media_type: req.kind,
          task_family: req.task,
          model: model.id,
          champion_or_challenger: cand.history?.champion ? 'champion' : cand.history ? 'challenger' : 'none',
          prompt_version: req.promptVersion,
          quality: null,
          success: true,
          latency,
          cost,
          fallback: idx > 0,
          retry: retries,
          correction: Boolean(req.regenerated),
          teacher: false,
          JEV_cost: 0,
          total_cost: cost,
        },
        mission: req.mission,
        trace,
        reason: pick.explain.join(' · '),
      });
      return {
        result: value.result,
        model: model.id,
        jobId: job.id,
        cost,
        costCertain: certain,
        fallbackUsed: idx > 0,
        retries,
        assetId,
        explain: pick.explain,
      };
    } catch (e) {
      const err =
        e instanceof StudioError
          ? e
          : (() => {
              const c = classifyError({ message: (e as Error).message, name: (e as Error).name });
              return new StudioError(c.cls, c.message, 0, c.transient);
            })();
      lastErr = err;
      const latency = performance.now() - t0;
      useStudio
        .getState()
        .setJobs((j) => failJob(j, job.id, { error: err.message, errorClass: err.cls as ErrorClass }));
      useStudio.getState().addMemory({
        id: uid('mem'),
        at: Date.now(),
        projectId: req.projectId,
        sceneId: req.sceneId,
        kind: req.kind,
        task: req.task,
        style: req.style,
        contract: req.contract,
        risk,
        model: model.id,
        success: false,
        quality: null,
        cost: null,
        latencyMs: latency,
        regenerated: Boolean(req.regenerated),
        fallback: idx > 0,
        errorClass: err.cls,
        prompt: req.promptVersion,
      });
      trace.stage(idx + 1 < order.length ? 'FALLBACK' : 'FINALIZATION', `${model.id} : ${err.cls}`);
      logStudio({
        tag: {
          project_id: req.projectId,
          scene_id: req.sceneId,
          job_id: job.id,
          media_type: req.kind,
          task_family: req.task,
          model: model.id,
          champion_or_challenger: 'none',
          prompt_version: req.promptVersion,
          quality: null,
          success: false,
          latency,
          cost: null,
          fallback: idx > 0,
          retry: 0,
          correction: false,
          teacher: false,
          JEV_cost: 0,
          total_cost: null,
        },
        mission: req.mission,
        trace,
        reason: pick.explain.join(' · '),
        failureNote: `${err.cls}: ${err.message.slice(0, 200)}`,
      });
      // Authentication and credit problems are not model problems: no point trying another model.
      if (err.cls === 'AUTH_ERROR' || err.cls === 'INSUFFICIENT_CREDITS') break;
      // A provider that already accepted (and bills) the job is never resubmitted elsewhere automatically.
      if (err.paid) break;
    }
  }
  throw lastErr ?? new StudioError('UNKNOWN', 'échec');
}
export { spentOf, useStore };
