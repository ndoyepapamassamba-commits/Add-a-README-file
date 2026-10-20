// OMNIPOTENT V4.1 — OUTPUT DRIFT GUARD 2.0 (§69-70, §95-96).
// A second firewall AFTER the model: the answer is compared with the mission capsule. A fluent answer that does not solve the
// current mission is not a success. All measures are local, deterministic and free; a rejection triggers at most
// MAX_DRIFT_RETRIES clean retries (capsule + corrective instruction, never the contaminated transcript).
import type { MissionCapsule } from './mission';
import type { Reclass } from './reclassify';
import { affinity, fileNames, normText, topicKeys } from './text';

export const MAX_DRIFT_RETRIES = 2;
export interface DriftReport {
  objectiveCoverage: number;
  artifactAlignment: number | null;
  actionCompletion: number | null;
  foreignTopicRate: number;
  verdict: 'PASS' | 'REPAIR' | 'INCOMPLETE';
  reasons: string[];
}
const DESCRIPTIVE = /\b(il (?:semble|faudrait|faut)|vous pouvez|je vous (?:conseille|recommande|sugg[èe]re)|voici (?:comment|des pistes)|il est possible|on pourrait|une piste|suggestion)\b/i;
const DONE = /\b(corrig[ée]\w*|modifi[ée]\w*|restaur[ée]\w*|r[ée]par[ée]\w*|ajout[ée]\w*|remplac[ée]\w*|cr[ée][ée]\w*|mis [àa] jour|appliqu[ée]\w*|fichier (?:cr[ée]|mis)|v[ée]rifi[ée]\w*|test[ée]\w*|rendu|capture)\b/i;

/**
 * @param blockedKeys topic keywords of the blocked foreign turns (used to measure how much of the answer is about them)
 * @param toolsWrote  a write / edit / create tool really ran in this run (evidence of action, not words)
 */
export function driftGuard(o: {
  answer: string;
  capsule: Pick<MissionCapsule, 'user_objective' | 'artifact_targets' | 'task_type' | 'acceptance_criteria'>;
  reclass: Reclass;
  blockedKeys?: Set<string>;
  toolsWrote: boolean;
  toolsVerified: boolean;
  toolCalls: number;
}): DriftReport {
  const a = o.answer.trim();
  const aKeys = topicKeys(a, 80);
  const goal = topicKeys(o.capsule.user_objective);
  const objectiveCoverage = goal.size ? Math.min(1, affinity(goal, aKeys) * 1.6) : 1;
  const files = o.capsule.artifact_targets;
  const mentioned = files.length ? files.filter((f) => normText(a).includes(normText(f))).length / files.length : null;
  const artifactAlignment = files.length ? (o.toolsWrote || o.toolCalls > 0 ? Math.max(mentioned ?? 0, o.toolsWrote ? 1 : 0.7) : (mentioned ?? 0)) : null;
  let foreign = 0;
  if (o.blockedKeys?.size && aKeys.size) {
    // Words of the answer that belong to a blocked topic but not to the current objective.
    let n = 0;
    for (const k of aKeys) if (o.blockedKeys.has(k) && !goal.has(k)) n++;
    foreign = n / aKeys.size;
  }
  const mutation = o.reclass.mutationRequired;
  let actionCompletion: number | null = null;
  if (mutation) {
    actionCompletion = o.toolsWrote ? 1 : DONE.test(a) && !DESCRIPTIVE.test(a) ? 0.75 : DESCRIPTIVE.test(a) ? 0.3 : 0.5;
    if (o.reclass.verificationRequired && !o.toolsVerified && o.toolsWrote) actionCompletion = Math.min(actionCompletion, 0.8);
  }
  const reasons: string[] = [];
  let verdict: DriftReport['verdict'] = 'PASS';
  if (foreign > 0.15) {
    verdict = 'REPAIR';
    reasons.push(`${Math.round(foreign * 100)} % de la réponse porte sur un sujet antérieur bloqué`);
  }
  if (artifactAlignment !== null && artifactAlignment < 0.7 && mutation) {
    verdict = 'REPAIR';
    reasons.push('la réponse ne porte pas sur l’artefact demandé');
  }
  if (actionCompletion !== null && actionCompletion < 0.7) {
    verdict = verdict === 'PASS' ? 'INCOMPLETE' : verdict;
    reasons.push('réponse descriptive sans modification ni plan d’action vérifiable');
  }
  if (a.length > 40 && objectiveCoverage < 0.12 && goal.size >= 3) {
    verdict = 'REPAIR';
    reasons.push('la réponse ne traite presque rien de l’objectif actuel');
  }
  return { objectiveCoverage, artifactAlignment, actionCompletion, foreignTopicRate: foreign, verdict, reasons };
}

/** The retry packet: capsule + failure signature + corrective instruction — never the transcript (§96). */
export function retryPacket(c: MissionCapsule, d: DriftReport, attempt: number): string {
  return [
    `[OMNIPOTENT DRIFT GUARD — tentative ${attempt}/${MAX_DRIFT_RETRIES}]`,
    `Ta réponse précédente est REJETÉE : ${d.reasons.join(' ; ') || 'dérive détectée'}.`,
    `Mission à traiter UNIQUEMENT : ${c.user_objective.replace(/\s+/g, ' ').slice(0, 300)}`,
    c.artifact_targets.length ? `Artefacts : ${c.artifact_targets.join(', ')}` : '',
    `Critères : ${c.acceptance_criteria.join(' ; ')}`,
    'Réponds maintenant à CETTE demande, de façon exacte et concise. Ne mentionne pas les anciens sujets.',
  ]
    .filter(Boolean)
    .join('\n');
}
export const touches = (answer: string, files: string[]) => fileNames(answer).some((f) => files.includes(f));
