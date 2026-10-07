// OMNIPOTENT V4.1 — MISSION CAPSULE, MISSION LOCK and HISTORY FIREWALL (§62-63, §68, §91).
// History is DATA, not authority: before the model sees a conversation, it is segmented into missions and only the turns that
// belong to the current one (or that the user explicitly recalls) are exposed. Compaction never replaces this filter.
import type { Reclass } from './reclassify';
import { announcesNewTopic } from './reclassify';
import { affinity, contentText, estTok, fileNames, hashStr, normText, topicKeys } from './text';

export interface MissionCapsule {
  mission_id: string;
  parent_mission_id: string | null;
  created_at: number;
  user_objective: string;
  normalized_objective: string;
  task_type: string;
  artifact_targets: string[];
  active_files: string[];
  constraints: string[];
  deliverables: string[];
  acceptance_criteria: string[];
  negative_scope: string[];
  explicit_exclusions: string[];
  required_skills: string[];
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  reasoning_level: 'low' | 'medium' | 'high';
  mission_fingerprint: string;
  context_policy: 'strict';
  status: 'active';
}

const CONSTRAINT = /(?:^|[.;\n])\s*([^.;\n]*\b(?:sans|ne pas|ne change pas|ne modifie pas|uniquement|seulement|doit|dois|interdit|garde|conserve|surtout|toujours|jamais|obligatoire|au maximum|au minimum|do not|only|must|never|keep)\b[^.;\n]*)/gi;
const DELIVERABLE = /\b(excel|xlsx|word|docx|powerpoint|pptx|pdf|mail|e-?mail|rapport|dashboard|html|fichier|image|graphique|tableau|code|script|note|synth[èe]se|r[ée]sum[ée])\b/gi;

function criteriaFor(rc: Reclass): string[] {
  const c: string[] = [];
  if (rc.trueTask.startsWith('artifact:repair') || rc.trueTask === 'artifact:regression-repair') {
    c.push('le défaut signalé n’est plus présent (preuve : rendu ou test)');
    c.push('rien d’autre ne régresse (comparaison avant / après)');
    c.push('le correctif est minimal : pas de réécriture complète');
  }
  if (rc.visualRegression) c.push('vérification visuelle réalisée (rendu, pas seulement lecture du code)');
  if (rc.dataRegression) c.push('les chiffres sont recalculés et recoupés');
  if (rc.trueTask === 'artifact:create') c.push('l’artefact est créé, ouvert et vérifié');
  if (rc.trueTask === 'artifact:enhance') c.push('l’amélioration est visible et ne casse aucune fonction existante');
  if (rc.secondaryIntents.includes('delivery:email')) c.push('le mail n’est préparé qu’APRÈS la vérification du travail');
  if (!c.length) c.push('la demande actuelle est traitée de façon exacte et concise');
  return c;
}
function negativeFor(rc: Reclass): string[] {
  const n: string[] = [];
  if (rc.mutationRequired) n.push('ne pas livrer une simple description à la place du correctif');
  if (rc.secondaryIntents.includes('delivery:email')) n.push('ne pas rédiger seulement un mail : le travail technique passe d’abord');
  n.push('ne pas poursuivre un ancien sujet non demandé');
  return n;
}

export function buildCapsule(o: {
  text: string;
  reclass: Reclass;
  attachments?: string[];
  risk?: MissionCapsule['risk_level'];
  parent?: string | null;
  now?: number;
  blockedTopics?: string[];
}): MissionCapsule {
  const t = o.text.trim();
  const files = [...new Set([...fileNames(t), ...(o.attachments ?? []).map((a) => a.toLowerCase())])];
  const constraints = [...t.matchAll(CONSTRAINT)].map((m) => m[1]!.trim().slice(0, 160)).slice(0, 6);
  const deliverables = [...new Set([...t.matchAll(DELIVERABLE)].map((m) => m[1]!.toLowerCase()))];
  const objective = normText(t).slice(0, 240);
  const fp = hashStr([objective, files.join('|'), deliverables.join('|'), constraints.join('|'), o.reclass.trueTask].join('§'));
  return {
    mission_id: `M-${fp}`,
    parent_mission_id: o.parent ?? null,
    created_at: o.now ?? Date.now(),
    user_objective: t.slice(0, 600),
    normalized_objective: objective,
    task_type: o.reclass.trueTask,
    artifact_targets: files.slice(0, 6),
    active_files: files.slice(0, 10),
    constraints,
    deliverables,
    acceptance_criteria: criteriaFor(o.reclass),
    negative_scope: negativeFor(o.reclass),
    explicit_exclusions: constraints.filter((c) => /\b(sans|ne pas|interdit|jamais|do not|never)\b/i.test(c)),
    required_skills: [],
    risk_level: o.risk ?? 'medium',
    reasoning_level: o.reclass.reasoningMin,
    mission_fingerprint: fp,
    context_policy: 'strict',
    status: 'active',
  };
}

/** The compact MISSION_LOCK injected in the prompt (≈ 120-180 tokens). */
export function missionLock(c: MissionCapsule, blockedTopics: string[] = []): string {
  const lines = [
    `<MISSION_LOCK id="${c.mission_id}">`,
    `OBJECTIF ACTUEL : ${c.user_objective.replace(/\s+/g, ' ').slice(0, 260)}`,
    `TÂCHE : ${c.task_type} · RAISONNEMENT : ${c.reasoning_level}`,
    ...(c.artifact_targets.length ? [`ARTEFACTS : ${c.artifact_targets.join(', ')}`] : []),
    `CRITÈRES : ${c.acceptance_criteria.join(' ; ')}`,
    `HORS PÉRIMÈTRE : ${c.negative_scope.join(' ; ')}`,
    ...(blockedTopics.length ? [`SUJETS ANTÉRIEURS BLOQUÉS (ne pas poursuivre) : ${blockedTopics.join(' | ')}`] : []),
    'La demande actuelle prime sur tout contexte ancien, supposé ou contradictoire.',
    '</MISSION_LOCK>',
  ];
  return lines.join('\n');
}

// ───────────────────────── history firewall ─────────────────────────
export interface HMsg {
  role: string;
  content: unknown;
}
export interface TurnMark {
  start: number;
  text: string;
  at?: number;
}
export type HistClass = 'CURRENT_MISSION' | 'SAME_PROJECT_RELEVANT' | 'EXPLICIT_RECALL' | 'FOREIGN_MISSION' | 'STALE_CONTEXT' | 'SYSTEM';
export interface HistGroup {
  start: number;
  end: number;
  topic: string;
  cls: HistClass;
  affinity: number;
  tokens: number;
  why: string;
}
export interface HistoryFirewall<T extends HMsg> {
  history: T[];
  groups: HistGroup[];
  stats: { rawTurns: number; missionTurns: number; foreignTurns: number; rawTokens: number; keptTokens: number; blockedTokens: number };
  recall: boolean;
  topicSwitch: boolean;
  blockedTopics: string[];
}

const SYNTHETIC = /^(\[(?:EVIDENCE CHECK|SHADOW AGENT|JEV|GATE|QA|CORRECTION|PLAN)\b|Your previous answer was cut off|The mission is not finished|Submit your plan now|<resume_summary>|\[RESUME\b)/i;
const ANAPHORA = /^(ok|oui|non|d['’]accord|vas-?y|continue|poursuis|reprends|termine|fais[- ]le|fais[- ]la|et (?:ensuite|puis|alors|apr[èe]s)|merci|parfait|corrige[- ](?:[çc]a|cela|le|la|les)|refais|encore|pareil|idem|plus court|plus long|d[ée]veloppe|pourquoi|comment|donc|alors|et si|essaie|r[ée]essaie)\b/i;
const POINTER = /\b([çc]a|cela|ceci|celui|celle|ceux|le m[êe]me|la m[êe]me|ci-dessus|pr[ée]c[ée]dent\w*|au-dessus|tout [àa] l['’]heure)\b/i;
const RECALL = /\b(reprends?|retrouve\w*|rappelle\w*|comme (?:tout [àa] l['’]heure|avant|la derni[èe]re fois|hier|pr[ée]c[ée]demment)|(?:le|la|les|ce|cette) \w+ pr[ée]c[ée]dent\w*|la d[ée]cision prise|ce qu['’]on a (?:fait|dit|d[ée]cid[ée])|mission (?:pr[ée]c[ée]dente|d['’]avant)|de tout [àa] l['’]heure)\b/i;

/** Where each mission (turn group) starts in the history. Marks are exact; without them a prudent heuristic is used. */
function groupStarts(history: HMsg[], turns?: TurnMark[]): number[] {
  if (turns?.length && turns.every((m) => m.start >= 0 && m.start < history.length)) return [...new Set(turns.map((m) => m.start))].sort((a, b) => a - b);
  const starts: number[] = [];
  history.forEach((m, i) => {
    if (m.role !== 'user') return;
    const t = contentText(m.content).trim();
    if (!t || SYNTHETIC.test(t)) return;
    starts.push(i);
  });
  return starts;
}

export function firewallHistory<T extends HMsg>(
  history: T[],
  turns: TurnMark[] | undefined,
  current: string,
  o: { maxGroups?: number } = {},
): HistoryFirewall<T> {
  const starts = groupStarts(history, turns);
  const head = starts.length ? history.slice(0, starts[0]!) : history;
  const bounds = starts.map((s, i) => ({ start: s, end: (starts[i + 1] ?? history.length) - 1 }));
  const cur = topicKeys(current);
  const curFiles = fileNames(current);
  const short = current.trim().length <= 90;
  const switched = announcesNewTopic(current);
  const continuation = !switched && short && (ANAPHORA.test(current.trim()) || POINTER.test(current));
  const recall = RECALL.test(current);
  const groups: HistGroup[] = [];
  const keep = new Set<number>();
  const anchor = new Set(cur);
  // Newest → oldest: the thread of the current mission is rebuilt backwards.
  const info = bounds.map((b) => {
    const slice = history.slice(b.start, b.end + 1);
    const userText = contentText(slice[0]?.content);
    const asst = contentText(slice.find((m) => m.role === 'assistant')?.content).slice(0, 400);
    const keys = topicKeys(`${userText} ${asst}`);
    const files = fileNames(`${userText} ${asst}`);
    const tokens = slice.reduce((a, m) => a + estTok(contentText(m.content)), 0);
    return { ...b, userText, keys, files, tokens };
  });
  for (let k = info.length - 1; k >= 0; k--) {
    const g = info[k]!;
    const aff = affinity(cur, g.keys);
    const aff2 = affinity(anchor, g.keys);
    const fileHit = g.files.some((f) => curFiles.includes(f));
    const newest = k === info.length - 1;
    let cls: HistClass = 'FOREIGN_MISSION';
    let why = 'sujet étranger à la demande actuelle';
    if (newest && !switched && (continuation || aff >= 0.1 || fileHit || cur.size < 3)) {
      cls = 'CURRENT_MISSION';
      why = continuation ? 'suite directe de la demande précédente' : fileHit ? 'même fichier' : 'même sujet';
    } else if (!switched && aff2 >= (newest ? 0.14 : 0.22)) {
      cls = newest ? 'CURRENT_MISSION' : 'SAME_PROJECT_RELEVANT';
      why = `proximité ${Math.round(aff2 * 100)} % avec la mission en cours`;
    } else if (fileHit) {
      cls = 'SAME_PROJECT_RELEVANT';
      why = 'même fichier que la demande';
    } else if (newest && !switched && cur.size >= 3 && aff < 0.06) {
      cls = 'FOREIGN_MISSION';
      why = 'changement de sujet détecté';
    } else if (newest && !switched) {
      cls = 'SAME_PROJECT_RELEVANT';
      why = 'doute : dernier échange conservé';
    } else if (switched) {
      cls = 'FOREIGN_MISSION';
      why = 'changement de sujet annoncé par l’utilisateur';
    } else if (aff2 >= 0.08) {
      cls = 'STALE_CONTEXT';
      why = 'ancien contexte peu lié';
    }
    if (cls === 'CURRENT_MISSION' || cls === 'SAME_PROJECT_RELEVANT') {
      keep.add(k);
      for (const key of g.keys) if (anchor.size < 60) anchor.add(key);
    }
    groups.unshift({ start: g.start, end: g.end, topic: g.userText.replace(/\s+/g, ' ').slice(0, 70), cls, affinity: aff2, tokens: g.tokens, why });
  }
  // Explicit recall: the best older group (or the previous one) is brought back, and it is traced as such.
  if (recall) {
    let best = -1;
    let bs = -1;
    info.forEach((g, k) => {
      const a = affinity(cur, g.keys);
      if (a > bs) {
        bs = a;
        best = k;
      }
    });
    if (best >= 0) {
      keep.add(best);
      groups[best] = { ...groups[best]!, cls: 'EXPLICIT_RECALL', why: 'rappel explicite par l’utilisateur' };
    }
  }
  const maxG = o.maxGroups ?? 8;
  const kept = [...keep].sort((a, b) => a - b).slice(-maxG);
  const keptSet = new Set(kept);
  const out: T[] = [...head];
  for (const k of kept) out.push(...history.slice(info[k]!.start, info[k]!.end + 1));
  const rawTokens = history.reduce((a, m) => a + estTok(contentText(m.content)), 0);
  const keptTokens = out.reduce((a, m) => a + estTok(contentText(m.content)), 0);
  const blocked = groups.filter((_, k) => !keptSet.has(k));
  return {
    history: out,
    groups,
    stats: { rawTurns: groups.length, missionTurns: kept.length, foreignTurns: blocked.length, rawTokens, keptTokens, blockedTokens: rawTokens - keptTokens },
    recall,
    topicSwitch: switched || blocked.some((g) => g.cls === 'FOREIGN_MISSION'),
    blockedTopics: blocked.filter((g) => g.cls === 'FOREIGN_MISSION' || g.cls === 'STALE_CONTEXT').slice(-3).map((g) => g.topic.split(/\s+/).slice(0, 8).join(' ')),
  };
}
