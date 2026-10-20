// JEV COGNITIVE OS — runtime: settings, per-mission planning (kernel), injection of ACTIVE engines only, trace for the JEV_LOG.
// OFF by default: with the master switch off the Workbench behaves exactly like V17. SHADOW computes and logs without changing
// the call. ACTIVE applies conditioning (contract, behaviour, protocol, guards) to the system prompt.
import { useStore } from './store';
import { CognitiveKernel, type KernelRun } from '../../server/jev/cognitive/kernel';
import { DEFAULT_COGNITIVE, type CognitiveSettings, type CognitiveTag, type EngineId } from '../../server/jev/cognitive/types';
import { failureProfile } from '../../server/jev/cognitive/fingerprint';
import { INITIAL_POLICIES, type PolicyRecord } from '../../server/jev/cognitive/policy';
import type { Part } from '../../server/jev/cognitive/tokens';
import type { ChatMessage } from '../../server/llm/types';
import { jevSettings } from './jev';
import { CognitiveCache, hashKey } from '../../server/jev/cognitive/cache';

/** Shadow answer cache: measures how often a request repeats under an UNCHANGED stamp (the share an L1 cache could have served). */
export const cognitiveCache = new CognitiveCache();

export const cognitiveSettings = (): CognitiveSettings => {
  const s = useStore.getState().fabric.cognitive?.settings ?? {};
  return { ...DEFAULT_COGNITIVE, ...s, engines: { ...DEFAULT_COGNITIVE.engines, ...s.engines } };
};
export function setCognitiveSettings(p: Partial<CognitiveSettings>) {
  const st = useStore.getState();
  const cur = cognitiveSettings();
  st.setFabric({ cognitive: { ...st.fabric.cognitive, settings: { ...cur, ...p, engines: { ...cur.engines, ...p.engines } } } });
}
export const cognitivePolicies = (): PolicyRecord[] => useStore.getState().fabric.cognitive?.policies ?? INITIAL_POLICIES;
export function setCognitivePolicies(p: PolicyRecord[]) {
  const st = useStore.getState();
  st.setFabric({ cognitive: { ...st.fabric.cognitive, policies: p } });
}

/** Per-run override (benchmark arms). */
export interface CognitiveRunOpts {
  enabled?: boolean;
  engines?: Partial<CognitiveSettings['engines']>;
  arm?: string;
}
/** Engines each CONDITIONING section belongs to. */
const SECTION_ENGINE: Record<string, EngineId> = { CONTRACT: 'conditioning', BEHAVIOR: 'conditioning', BUDGET: 'conditioning', PROTOCOL: 'protocols', GUARDS: 'guards', SKILLS: 'conditioning', MEMORY: 'conditioning' };

export interface CognitivePrep {
  run: KernelRun;
  settings: CognitiveSettings;
  applied: EngineId[];
  /** Text injected in the system prompt (only ACTIVE engines); '' when nothing is applied. */
  system: string;
  arm?: string;
}
const textOf = (m: ChatMessage): string =>
  typeof m.content === 'string' ? m.content : (m.content as { type: string; text?: string }[]).map((p) => (p.type === 'text' ? (p.text ?? '') : '')).join(' ');

export function prepareCognitive(i: {
  text: string;
  attachments: string[];
  hasImages: boolean;
  mission: boolean;
  history: ChatMessage[];
  historyTokens: number;
  hasTools: boolean;
  model: string;
  run?: CognitiveRunOpts | null;
  freeProven?: boolean;
}): CognitivePrep | null {
  const base = cognitiveSettings();
  const settings: CognitiveSettings = {
    ...base,
    enabled: i.run?.enabled ?? base.enabled,
    engines: { ...base.engines, ...(i.run?.engines ?? {}) },
  };
  if (!settings.enabled) return null;
  try {
    const parts: Part[] = i.history.slice(-24).map((m, k, a) => ({ id: `h${k}`, kind: 'history' as const, text: textOf(m).slice(0, 4000), turn: k - a.length + 24 }));
    const raw = parts.map((p) => p.text).join('\n').slice(-60_000);
    const kernel = new CognitiveKernel(settings);
    const log = useStore.getState().jevLog.slice(-300);
    const run = kernel.plan({
      text: i.text, attachments: i.attachments, hasImages: i.hasImages, mission: i.mission, historyTokens: i.historyTokens,
      mode: jevSettings().mode, hasTools: i.hasTools, rawContext: raw, parts, model: i.model, failureProfile: failureProfile(log), freeProven: i.freeProven,
    });
    if (settings.engines.cache !== 'off') {
      const stamp = { data: String(Object.keys(useStore.getState().files).length), policy: cognitivePolicies().find((p) => p.status === 'active')?.policy.version ?? 1, capabilities: String(useStore.getState().models.length), input: hashKey(i.text) };
      const g = cognitiveCache.get('L1', i.text, stamp);
      if (!g.hit) cognitiveCache.put('L1', i.text, 1, stamp);
    }
    const applied: EngineId[] = [];
    const keep = run.conditioning.parts.filter((p) => settings.engines[SECTION_ENGINE[p.key] ?? 'conditioning'] === 'active');
    for (const p of keep) {
      const e = SECTION_ENGINE[p.key] ?? 'conditioning';
      if (!applied.includes(e)) applied.push(e);
    }
    return { run, settings, applied, system: keep.map((p) => p.text).join('\n'), arm: i.run?.arm };
  } catch {
    // The Cognitive OS must never block the Workbench.
    return null;
  }
}
export function cognitiveTag(p: CognitivePrep, o: { stopWould?: { decision: string; reason: string } } = {}): CognitiveTag {
  return { ...new CognitiveKernel(p.settings).tag(p.run, { applied: p.applied, stop: o.stopWould }), arm: p.arm };
}
/** Conditioning text added to the system prompt (ACTIVE engines only). */
export const cognitivePromptText = (p: CognitivePrep | null): string => (p?.system ? `<cognitive_conditioning>\n${p.system}\n</cognitive_conditioning>` : '');
