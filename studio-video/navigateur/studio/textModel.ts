// Text tasks of the studio (story, dialogue, social, QA text) go through the Workbench's EXISTING routing and Apprentice:
// the validated free champion when there is one, otherwise the standard router's choice. No new router.
import { useStore } from '@workbench/direct/lib/store';
import { complete, getKey, loadCatalog } from '@workbench/direct/lib/llm';
import { isAnonFree } from '@workbench/server/llm/freeRoute';
import { selectModel } from '@workbench/server/llm/router';
import { analyzeTask, routeModel } from '@workbench/server/llm/routing';
import { DEFAULT_AUTO_TIERS } from '@workbench/server/services/settings';
import { championFor, apprenticeSettings } from '@workbench/direct/lib/apprentice';
import type { ChatMessage } from '@workbench/server/llm/types';
import { useStudio } from './store';
import { Trace, logStudio } from './jevlog';
import { classifyError, StudioError } from '../../coeur/studio/errors';
import { redactSecrets } from '../../coeur/studio/secrets';
import { estimateCost } from '@workbench/direct/lib/llm';

/**
 * The models the film may be WRITTEN with. With an OpenRouter key: the OpenRouter catalogue (JSON mode, measured cost,
 * budget cap) — the keyless services (LLM7, Pollinations, the in-browser model) stay the automatic safety net of the
 * LLM client when OpenRouter fails. Without a key: everything, the keyless ones included.
 */
export function writingCatalog<T extends { id: string }>(models: T[]): T[] {
  if (!getKey()) return models;
  const keyed = models.filter((m) => !isAnonFree(m.id));
  return keyed.length ? keyed : models;
}

export interface TextRun {
  text: string;
  model: string;
  cost: number;
  tokensIn: number;
  tokensOut: number;
  explain: string;
  /** « stop », « length » (cut by the length limit)… as reported by the provider. */
  finishReason?: string;
}
/** Film Autopilot: the writing model chosen (or accepted) by the user for the production; null = automatic routing. */
let textOverride: string | null = null;
export const setStudioTextModel = (id: string | null) => {
  textOverride = id;
};
export async function pickTextModel(
  text: string,
  vision = false,
  teacher = false,
): Promise<{ model: string; fallbacks: string[]; why: string }> {
  return pickTextModelRaw(text, vision, teacher);
}

async function pickTextModelRaw(text: string, vision: boolean, teacher: boolean): Promise<{ model: string; fallbacks: string[]; why: string }> {
  const st = useStore.getState();
  if (textOverride && !vision && !teacher)
    return { model: textOverride, fallbacks: [st.settings.fallbackModel].filter(Boolean), why: 'modèle d’écriture choisi pour ce film' };
  let models = st.models;
  if (!models.length) models = await loadCatalog().catch(() => []);
  models = writingCatalog(models);
  const profile = analyzeTask({ text, hasImages: vision });
  if (!vision && !teacher && apprenticeSettings().enabled) {
    const c = championFor(text);
    if (c)
      return {
        model: c.model,
        fallbacks: [st.settings.fallbackModel],
        why: `champion Apprentice VALIDATED (${c.family})`,
      };
  }
  const routed = routeModel(
    models,
    DEFAULT_AUTO_TIERS,
    teacher ? { ...profile, tier: 'quality', difficulty: Math.max(profile.difficulty, 0.6) } : profile,
    st.health,
    st.board,
  );
  if (routed)
    return { model: routed.model, fallbacks: routed.fallbacks, why: `routage standard : ${routed.reason}` };
  // Same selection as the agent: the configured default (or, when it is « auto », the tier choice of the standard router).
  const sel = selectModel({
    requested: st.settings.defaultModel,
    models,
    tiers: DEFAULT_AUTO_TIERS,
    signals: { text, hasImages: vision, role: 'writer', historyLength: 0 },
    fallbackDefault: 'openai/gpt-4o-mini',
  });
  return {
    model: sel.model,
    fallbacks: [st.settings.fallbackModel].filter((m) => m && m !== sel.model),
    why: `sélection standard : ${sel.reason}`,
  };
}

/** One text completion, JEV-logged (media_type "text"), cost measured by the provider. */
export async function runText(o: {
  projectId: string;
  purpose: string;
  messages: ChatMessage[];
  /** The messages carry images: the model must accept vision. */
  vision?: boolean;
  /** Teacher call: a stronger model analyses a failure; the spend is a LEARNING INVESTMENT. */
  teacher?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** The answer must be ONE JSON object: JSON mode when the model supports it. */
  json?: boolean;
  /** Reasoning effort: « low » for structured writing (a reasoning model must not spend the length limit thinking). */
  effort?: 'low' | 'medium' | 'high' | 'auto';
  /** Imposed model (e.g. the judge's second attempt on another vision model); no router, no fallback. */
  model?: string;
}): Promise<TextRun> {
  const trace = new Trace();
  const safe = o.messages.map((m) => ({
    ...m,
    content: typeof m.content === 'string' ? redactSecrets(m.content) : m.content,
  })) as ChatMessage[];
  const joined = safe.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
  trace.stage('PRODUCTION_CLASSIFICATION', `texte : ${o.purpose}`);
  const pick = o.model ? { model: o.model, fallbacks: [] as string[], why: `modèle imposé : ${o.model}` } : await pickTextModel(joined.slice(0, 1500), o.vision, o.teacher);
  trace.stage('MODEL_SELECTION', pick.why);
  const models = useStore.getState().models;
  const t0 = performance.now();
  try {
    const r = await complete(
      {
        model: pick.model,
        messages: safe,
        maxTokens: o.maxTokens ?? 4000,
        temperature: o.temperature ?? 0.8,
        ...(o.json && models.find((m) => m.id === pick.model)?.capabilities.structuredOutputs ? { responseFormat: { type: 'json_object' } } : {}),
      },
      { models, fallbacks: pick.fallbacks.filter(Boolean), effort: o.effort ?? 'auto' },
    );
    const latency = performance.now() - t0;
    trace.stage('GENERATION', `${r.model} · ${Math.round(latency)} ms`, {
      tokens: r.usage.promptTokens + r.usage.completionTokens,
      cost: r.cost,
    });
    const info = models.find((m) => m.id === r.model);
    const cost = r.cost ?? estimateCost(info, r.usage.promptTokens, r.usage.completionTokens);
    useStudio.getState().patchProject(o.projectId, (b) => ({
      ...b,
      models: [...new Set([...b.models, r.model])],
      costs: [
        ...b.costs,
        {
          at: Date.now(),
          kind: 'text',
          model: r.model,
          amount: cost,
          certain: r.costSource === 'measured',
          note: o.purpose,
          learning: o.teacher || undefined,
        },
      ],
    }));
    logStudio({
      tag: {
        project_id: o.projectId,
        job_id: `text-${Date.now().toString(36)}`,
        media_type: 'text',
        task_family: o.purpose,
        model: r.model,
        champion_or_challenger: 'none',
        prompt_version: 'text',
        quality: null,
        success: true,
        latency,
        cost,
        fallback: r.model !== pick.model,
        retry: 0,
        correction: false,
        teacher: Boolean(o.teacher),
        JEV_cost: 0,
        total_cost: cost,
      },
      mission: o.purpose,
      trace,
      reason: pick.why,
      tokensIn: r.usage.promptTokens,
      tokensOut: r.usage.completionTokens,
    });
    return {
      text: r.content,
      model: r.model,
      cost,
      tokensIn: r.usage.promptTokens,
      tokensOut: r.usage.completionTokens,
      explain: pick.why,
      finishReason: (r as { finishReason?: string }).finishReason,
    };
  } catch (e) {
    const c = classifyError({ message: (e as Error).message, status: (e as { status?: number }).status });
    logStudio({
      tag: {
        project_id: o.projectId,
        job_id: `text-${Date.now().toString(36)}`,
        media_type: 'text',
        task_family: o.purpose,
        model: pick.model,
        champion_or_challenger: 'none',
        prompt_version: 'text',
        quality: null,
        success: false,
        latency: performance.now() - t0,
        cost: null,
        fallback: false,
        retry: 0,
        correction: false,
        teacher: Boolean(o.teacher),
        JEV_cost: 0,
        total_cost: null,
      },
      mission: o.purpose,
      trace,
      reason: pick.why,
      failureNote: `${c.cls}: ${c.message.slice(0, 160)}`,
    });
    throw new StudioError(c.cls, c.message, 0, c.transient);
  }
}
