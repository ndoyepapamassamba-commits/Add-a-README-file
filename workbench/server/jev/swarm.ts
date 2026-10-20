// SOUS-AGENTS AUTOMATIQUES (v64, consigne du 15/10/2026 : « si la tâche est lourde, JEV peut créer automatiquement des
// sous-agents qui exécutent des tâches »). JEV mesure la CHARGE d'une demande (complexité de l'ADN de tâche, nombre de
// livrables, de fichiers joints, longueur, parties énumérées) ; au-delà du seuil, il prescrit au modèle de découper la
// demande en 2 à 4 sous-tâches indépendantes, confiées à des sous-agents (agent.delegate) qui tournent EN PARALLÈLE dans
// le même tour, puis de fusionner et de contrôler leurs résultats. Pur ; la boucle de l'agent l'injecte dans le contexte.

export interface SwarmPlan {
  heavy: boolean;
  /** 0–1. */
  score: number;
  /** Proposed sub-tasks (from the request's own enumeration or its deliverables). */
  parts: string[];
  reasons: string[];
}
export const SWARM_THRESHOLD = 0.55;

/** The parts a request enumerates itself (« 1. … 2. … », bullets, « ; »-separated asks). */
export function enumeratedParts(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /^(\d+[.)]|[-•*▸])\s+\S/.test(l))
    .map((l) => l.replace(/^(\d+[.)]|[-•*▸])\s+/, ''));
  if (lines.length >= 2) return lines.slice(0, 6);
  const semi = text.split(/\s*;\s*/).filter((x) => x.trim().split(/\s+/).length >= 4);
  return semi.length >= 3 ? semi.slice(0, 6) : [];
}

/** JEV's heaviness judgment of one request. */
export function swarmPlan(o: { text: string; attachments?: number; complexity?: number; outputs?: string[] }): SwarmPlan {
  const reasons: string[] = [];
  const parts = enumeratedParts(o.text);
  const outputs = o.outputs ?? [];
  let score = 0.45 * Math.min(1, Math.max(0, o.complexity ?? 0));
  if (o.complexity && o.complexity >= 0.6) reasons.push(`complexité ${Math.round(o.complexity * 100)} %`);
  if (outputs.length >= 2) {
    score += Math.min(0.25, 0.1 * outputs.length);
    reasons.push(`${outputs.length} livrables (${outputs.slice(0, 4).join(', ')})`);
  }
  if ((o.attachments ?? 0) >= 2) {
    score += Math.min(0.15, 0.05 * (o.attachments ?? 0));
    reasons.push(`${o.attachments} fichiers joints`);
  }
  if (parts.length >= 3) {
    score += 0.25;
    reasons.push(`${parts.length} parties énumérées`);
  }
  if (o.text.length > 1500) {
    score += 0.1;
    reasons.push('demande longue');
  }
  score = Math.min(1, score);
  const split = parts.length >= 2 ? parts : outputs.length >= 2 ? outputs.map((x) => `produire le livrable « ${x} »`) : [];
  return { heavy: score >= SWARM_THRESHOLD && split.length >= 2, score, parts: split.slice(0, 4), reasons };
}

/** The directive JEV gives the model for a heavy request (nothing for a light one). */
export function swarmBlock(p: SwarmPlan, roles: string[]): string {
  if (!p.heavy) return '';
  return [
    `<JEV_SWARM score="${p.score.toFixed(2)}">`,
    `This request is HEAVY (${p.reasons.join(' ; ')}). Do not do it alone, step by step: split it into ${p.parts.length} independent sub-tasks and call agent.delegate ONCE PER SUB-TASK IN THE SAME TURN — they run in parallel. Each task must be self-contained (inputs, files, expected output, quality bar).`,
    'Suggested split:',
    ...p.parts.map((x, i) => `${i + 1}. ${x}`),
    roles.length ? `Roles available: ${roles.slice(0, 12).join(', ')} (pick the closest specialist for each sub-task).` : '',
    'Then MERGE the sub-agents\' results, check they agree (figures, names, dates), fix contradictions, and deliver one answer.',
    '</JEV_SWARM>',
  ]
    .filter(Boolean)
    .join('\n');
}
