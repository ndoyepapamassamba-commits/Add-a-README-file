// OMNIPOTENT V4.1 — runtime governor. Applies the pure engines to a real run:
//   BEFORE the model  → reclassification, mission capsule + lock, history firewall, memory governor, tool firewall, fast lane;
//   AFTER the model   → output drift guard (clean retry, at most twice).
// Every barrier is reported HARD only because it really filters what the model receives (never a claim of physical isolation).
import { useStore } from './store';
import type { ChatMessage } from '../../server/llm/types';
import { reclassify, type Reclass } from '../../server/jev/omni/reclassify';
import { ALTERATION, buildCapsule, firewallHistory, missionLock, type HistoryFirewall, type MissionCapsule } from '../../server/jev/omni/mission';
import { laneOf, type LanePolicy } from '../../server/jev/omni/lane';
import { filterDigest } from '../../server/jev/omni/memory';
import { toolFirewall, type ToolFirewallResult } from '../../server/jev/omni/toolfw';
import { driftGuard, retryPacket, MAX_DRIFT_RETRIES, type DriftReport } from '../../server/jev/omni/drift';
import { DEFAULT_OMNI, OMNI_VERSION, enforcementOf, traceLines, type OmniSettings, type OmniTag } from '../../server/jev/omni/trace';
import { topicKeys } from '../../server/jev/omni/text';
import { contentText } from '../../server/jev/omni/text';

export const omniSettings = (): OmniSettings => ({ ...DEFAULT_OMNI, ...(useStore.getState().settings.omni ?? {}) });
export const setOmniSettings = (p: Partial<OmniSettings>) =>
  useStore.getState().patchSettings({ omni: { ...useStore.getState().settings.omni, ...p } });

export interface OmniPrep {
  settings: OmniSettings;
  reclass: Reclass;
  capsule: MissionCapsule;
  fw: HistoryFirewall<ChatMessage>;
  /** Keywords of the blocked topics (for the drift guard). */
  blockedKeys: Set<string>;
  lane?: LanePolicy;
  lock: string;
  tools?: ToolFirewallResult;
  memory?: { candidates: number; allowed: number; optional: number; blocked: number; quarantined: number; rawChars: number; keptChars: number };
  driftRetries: number;
  lastDrift?: DriftReport;
  avoidedReasks: number;
  initialDna: string;
  /** Pinned note: the request alters the last delivery of this chat. */
  delivery: string;
  /** One line per hidden earlier request of this chat (memory stays in the chat, at ~0 cost). */
  chatIndex: string;
}

/** Phase 1 (before JEV pre): reclassify, capsule, history firewall. */
export function beginOmni(i: {
  text: string;
  attachments: { name: string; image: boolean }[];
  hasImages: boolean;
  history: ChatMessage[];
  turns?: { start: number; text: string }[];
  initialType: string;
  initialDna: string;
  /** Files delivered by the last run of THIS chat, and where that mission starts in the history. */
  lastDelivery?: { start: number; paths: string[]; request: string; at: number };
}): OmniPrep | null {
  const s = omniSettings();
  if (!s.enabled) return null;
  try {
    const reclass = reclassify({ text: i.text, initial: i.initialType, attachments: i.attachments, hasImages: i.hasImages });
    // « Change le titre » after a delivery = an alteration of THAT version (unless the user names another target).
    const ld = i.lastDelivery;
    const namesOther = ld ? /\.\w{2,5}\b/.test(i.text) && !ld.paths.some((p) => i.text.toLowerCase().includes(p.split('/').pop()!.toLowerCase())) : false;
    const alteration = Boolean(ld && ld.paths.length && ALTERATION.test(i.text) && !namesOther);
    const fw0 = firewallHistory(i.history, i.turns, i.text, alteration ? { pinStart: ld!.start } : {});
    // Firewall switched off: the model sees the raw history again (the V18 behaviour), the analysis stays for the trace.
    const fw = s.historyFirewall ? fw0 : { ...fw0, history: i.history };
    const capsule = buildCapsule({ text: i.text, reclass, attachments: i.attachments.map((a) => a.name), blockedTopics: fw.blockedTopics });
    const blockedKeys = new Set<string>();
    for (const g of fw.groups) if (g.cls === 'FOREIGN_MISSION' || g.cls === 'STALE_CONTEXT') for (const k of topicKeys(g.topic)) blockedKeys.add(k);
    // Words of the blocked turns that are NOT in the current objective are the contamination to watch for.
    return {
      settings: s,
      delivery: alteration
        ? `<LAST_DELIVERY>\nCette demande MODIFIE la dernière version livrée dans ce chat (demande d'origine : « ${ld!.request.slice(0, 160)} »).\nFichiers livrés : ${ld!.paths.join(', ')}.\nLis ces fichiers, applique UNIQUEMENT le changement demandé, garde tout le reste identique, et réécris-les au même chemin. Ne repars pas de zéro.\n</LAST_DELIVERY>`
        : '',
      chatIndex: (() => {
        const hidden = fw.groups.filter((g) => g.cls === 'FOREIGN_MISSION' || g.cls === 'STALE_CONTEXT');
        return hidden.length
          ? `<CHAT_INDEX>\nEarlier requests of THIS chat (hidden to save tokens; the user can ask to come back to one): ${hidden.slice(-8).map((g, n) => `${n + 1}) ${g.topic}`).join(' · ')}\n</CHAT_INDEX>`
          : '';
      })(),
      reclass,
      capsule,
      fw,
      blockedKeys,
      lock: '',
      driftRetries: 0,
      avoidedReasks: 0,
      initialDna: i.initialDna,
    };
  } catch {
    // The governor must never block the Workbench: fall back to the V18 behaviour.
    return null;
  }
}
/** Phase 2 (after JEV pre): lane (proportional effort), mission lock. */
export function laneOmni(o: OmniPrep, i: { text: string; attachments: number; difficulty: number; critical: boolean; mission: boolean; needsTools: boolean; historyTokens: number }) {
  o.lane = laneOf({ ...i, reclass: o.reclass });
  const needsLock = o.lane.lane === 'standard' || o.lane.lane === 'complex' || o.lane.lane === 'critical' || o.fw.blockedTopics.length > 0 || o.reclass.mutationRequired;
  o.lock = needsLock ? missionLock(o.capsule, o.fw.blockedTopics) : '';
  return o.lane;
}
/** HARD tool filter: returns the names that stay exposed (the model can still ask for more with tools.request). */
export function filterTools(o: OmniPrep, names: string[], text: string, attachments: number): string[] {
  if (!o.settings.toolFirewall || !o.lane) return names;
  o.tools = toolFirewall({ names, lane: o.lane, reclass: o.reclass, text, attachments });
  return o.tools.allowed;
}
/** HARD memory filter on the project-memory digest the model would receive. */
export function filterMemory(o: OmniPrep, digest: string): string {
  if (!o.settings.memoryGovernor || !digest) return digest;
  const f = filterDigest(digest, o.capsule);
  o.memory = { ...f.stats, candidates: f.stats.candidates, rawChars: f.rawChars, keptChars: f.keptChars };
  return f.text;
}
export const omniContextCeiling = (o: OmniPrep | null, current: number): number => (o?.settings.ceilings && o.lane ? Math.min(current, o.lane.contextCeiling) : current);

/** After the final answer: PASS, or a corrective packet for a CLEAN retry (capsule + failure signature, never the transcript). */
export function checkDrift(o: OmniPrep, a: { answer: string; toolsWrote: boolean; toolsVerified: boolean; toolCalls: number }): { retry: string | null; report: DriftReport } {
  const report = driftGuard({ capsule: o.capsule, reclass: o.reclass, blockedKeys: o.blockedKeys, ...a });
  o.lastDrift = report;
  if (!o.settings.driftGuard || report.verdict === 'PASS' || o.driftRetries >= MAX_DRIFT_RETRIES) return { retry: null, report };
  // A fast-laned trivial answer is only re-asked for FOREIGN contamination (cheap and clear), never for style or length.
  if (o.lane?.lane === 'trivial' && report.foreignTopicRate <= 0.15) return { retry: null, report };
  o.driftRetries++;
  return { retry: retryPacket(o.capsule, report, o.driftRetries), report };
}

export function omniTag(o: OmniPrep, extra: { finalDna?: string; steps?: { used: number; cap: number | null } } = {}): OmniTag {
  const lane = o.lane ?? laneOf({ text: o.capsule.user_objective, attachments: 0, reclass: o.reclass, difficulty: 0.3, critical: false, mission: false, needsTools: false, historyTokens: 0 });
  const enforcement = enforcementOf(o.settings, o.fw as never, lane);
  return {
    missionId: o.capsule.mission_id,
    fingerprint: o.capsule.mission_fingerprint,
    initialDna: o.initialDna,
    finalDna: extra.finalDna ?? o.reclass.trueTask,
    reclassified: o.reclass.reclassified,
    lane: lane.lane,
    verification: lane.verification,
    enforcement,
    history: { raw: o.fw.stats.rawTurns, mission: o.fw.stats.missionTurns, foreign: o.fw.stats.foreignTurns, rawTokens: o.fw.stats.rawTokens, keptTokens: o.fw.stats.keptTokens },
    memory: o.memory ?? { candidates: 0, allowed: 0, optional: 0, blocked: 0, quarantined: 0, rawChars: 0, keptChars: 0 },
    tools: { available: o.tools?.available ?? 0, exposed: o.tools?.allowed.length ?? 0, blocked: o.tools?.blocked.length ?? 0 },
    contextCeiling: lane.contextCeiling,
    steps: extra.steps,
    drift: o.lastDrift ? { objective: o.lastDrift.objectiveCoverage, artifact: o.lastDrift.artifactAlignment, action: o.lastDrift.actionCompletion, foreign: o.lastDrift.foreignTopicRate, retries: o.driftRetries, verdict: o.lastDrift.verdict } : undefined,
    avoidedReasks: o.avoidedReasks,
    version: OMNI_VERSION,
  };
}
export { traceLines, contentText };
