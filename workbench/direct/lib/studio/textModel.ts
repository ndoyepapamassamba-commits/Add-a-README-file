// Text tasks of the studio (story, dialogue, social, QA text) go through the Workbench's EXISTING routing and Apprentice:
// the validated free champion when there is one, otherwise the standard router's choice. No new router.
import { useStore } from '../store';
import { complete, loadCatalog } from '../llm';
import { analyzeTask, routeModel } from '../../../server/llm/routing';
import { DEFAULT_AUTO_TIERS } from '../../../server/services/settings';
import { championFor, apprenticeSettings } from '../apprentice';
import type { ChatMessage } from '../../../server/llm/types';
import { useStudio } from './store';
import { Trace, logStudio } from './jevlog';
import { classifyError, StudioError } from '../../../server/jev/studio/errors';
import { redactSecrets } from '../../../server/jev/studio/secrets';
import { estimateCost } from '../llm';

export interface TextRun {
  text: string;
  model: string;
  cost: number;
  tokensIn: number;
  tokensOut: number;
  explain: string;
}
export async function pickTextModel(
  text: string,
): Promise<{ model: string; fallbacks: string[]; why: string }> {
  const st = useStore.getState();
  let models = st.models;
  if (!models.length) models = await loadCatalog().catch(() => []);
  const profile = analyzeTask({ text });
  if (apprenticeSettings().enabled) {
    const c = championFor(text);
    if (c)
      return {
        model: c.model,
        fallbacks: [st.settings.fallbackModel],
        why: `champion Apprentice VALIDATED (${c.family})`,
      };
  }
  const routed = routeModel(models, DEFAULT_AUTO_TIERS, profile, st.health, st.board);
  if (routed)
    return { model: routed.model, fallbacks: routed.fallbacks, why: `routage standard : ${routed.reason}` };
  return {
    model: st.settings.defaultModel,
    fallbacks: [st.settings.fallbackModel],
    why: 'modèle par défaut des Réglages',
  };
}

/** One text completion, JEV-logged (media_type "text"), cost measured by the provider. */
export async function runText(o: {
  projectId: string;
  purpose: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<TextRun> {
  const trace = new Trace();
  const safe = o.messages.map((m) => ({
    ...m,
    content: typeof m.content === 'string' ? redactSecrets(m.content) : m.content,
  })) as ChatMessage[];
  const joined = safe.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
  trace.stage('PRODUCTION_CLASSIFICATION', `texte : ${o.purpose}`);
  const pick = await pickTextModel(joined.slice(0, 1500));
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
      },
      { models, fallbacks: pick.fallbacks.filter(Boolean), effort: 'auto' },
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
        teacher: false,
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
        teacher: false,
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
