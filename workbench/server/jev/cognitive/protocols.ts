// JEV COGNITIVE OS — REASONING PROTOCOL ENGINE.
// A model should not always receive the same prompt. JEV picks the SMALLEST protocol that fits the problem (a few
// lines, not a wall of instructions) and can compose a new candidate protocol from the same atoms. A synthesized
// protocol is only a CANDIDATE: it must be benchmarked before it is trusted.
import type { CognitiveDiagnosis } from './diagnosis';

export type ProtocolId =
  | 'DIRECT'
  | 'DECOMPOSE'
  | 'COMPARE'
  | 'VERIFY'
  | 'CRITIQUE'
  | 'PLAN-THEN-SOLVE'
  | 'HYPOTHESIS-TEST'
  | 'MULTI-PASS'
  | 'SELF-CHECK'
  | 'CONSTRAINT-FIRST'
  | 'EVIDENCE-FIRST'
  | 'STRUCTURE-FIRST'
  | 'CODE-VERIFY'
  | 'DATA-VERIFY'
  | 'VISION-VERIFY'
  | 'COUNTEREXAMPLE'
  | 'RED-TEAM'
  | 'EXPERT-DEBATE'
  | 'SYNTHESIS'
  | 'MINIMAL-SUFFICIENT-REASONING';

export interface Protocol {
  id: string;
  label: string;
  /** The text really added to the model's instructions (empty = nothing added). */
  text: string;
  tokens: number;
  /** 'built-in' protocols are reviewed defaults; 'candidate' ones were synthesized and still need a benchmark. */
  status: 'built-in' | 'candidate' | 'validated';
  atoms?: string[];
}
const est = (s: string) => Math.ceil(s.length / 3.8);
const P = (id: ProtocolId, label: string, text: string): Protocol => ({
  id,
  label,
  text,
  tokens: est(text),
  status: 'built-in',
});

export const PROTOCOLS: Record<ProtocolId, Protocol> = {
  DIRECT: P('DIRECT', 'Réponse directe', ''),
  'MINIMAL-SUFFICIENT-REASONING': P(
    'MINIMAL-SUFFICIENT-REASONING',
    'Raisonnement minimal suffisant',
    'Raisonne juste assez pour répondre correctement ; pas de détour.',
  ),
  DECOMPOSE: P(
    'DECOMPOSE',
    'Décomposer',
    'Découpe le problème en sous-questions indépendantes, traite-les, puis assemble.',
  ),
  COMPARE: P(
    'COMPARE',
    'Comparer',
    'Compare les options sur les mêmes critères explicites, puis tranche et justifie.',
  ),
  VERIFY: P(
    'VERIFY',
    'Vérifier',
    'Avant de conclure, vérifie chaque affirmation clé ; signale ce qui n’est pas vérifié.',
  ),
  CRITIQUE: P(
    'CRITIQUE',
    'Critiquer',
    'Produis une réponse, puis critique-la une fois et corrige uniquement les défauts réels.',
  ),
  'PLAN-THEN-SOLVE': P(
    'PLAN-THEN-SOLVE',
    'Plan puis exécution',
    'Pose d’abord un plan court en étapes numérotées, puis exécute-le étape par étape.',
  ),
  'HYPOTHESIS-TEST': P(
    'HYPOTHESIS-TEST',
    'Hypothèse et test',
    'Formule l’hypothèse la plus probable, cherche ce qui la réfuterait, conclus selon le résultat.',
  ),
  'MULTI-PASS': P(
    'MULTI-PASS',
    'Plusieurs passes',
    'Fais une première passe complète, puis une seconde passe ciblée sur les points faibles.',
  ),
  'SELF-CHECK': P(
    'SELF-CHECK',
    'Auto-contrôle',
    'Relis ta réponse avec les contraintes de la demande ; corrige tout écart avant d’envoyer.',
  ),
  'CONSTRAINT-FIRST': P(
    'CONSTRAINT-FIRST',
    'Contraintes d’abord',
    'Liste d’abord les contraintes et hypothèses de la demande ; ne propose rien qui les viole.',
  ),
  'EVIDENCE-FIRST': P(
    'EVIDENCE-FIRST',
    'Preuves d’abord',
    'Rassemble d’abord les faits sourcés ; n’affirme rien sans source ou calcul.',
  ),
  'STRUCTURE-FIRST': P(
    'STRUCTURE-FIRST',
    'Structure d’abord',
    'Fixe la structure de la réponse (sections, ordre) avant de rédiger le contenu.',
  ),
  'CODE-VERIFY': P(
    'CODE-VERIFY',
    'Code vérifié',
    'Écris le code, exécute-le ou teste-le, corrige jusqu’à ce qu’il passe ; ne livre jamais du code non exécuté.',
  ),
  'DATA-VERIFY': P(
    'DATA-VERIFY',
    'Données vérifiées',
    'Calcule chaque chiffre avec un outil, puis recoupe les totaux d’une seconde manière.',
  ),
  'VISION-VERIFY': P(
    'VISION-VERIFY',
    'Vision vérifiée',
    'Décris d’abord ce qui est visible, puis interprète ; sépare observation et déduction.',
  ),
  COUNTEREXAMPLE: P(
    'COUNTEREXAMPLE',
    'Contre-exemple',
    'Cherche un contre-exemple à ta conclusion avant de la donner.',
  ),
  'RED-TEAM': P(
    'RED-TEAM',
    'Red team',
    'Adopte le point de vue d’un attaquant ou d’un contradicteur et liste les failles réelles.',
  ),
  'EXPERT-DEBATE': P(
    'EXPERT-DEBATE',
    'Débat d’experts',
    'Fais s’exprimer deux points de vue d’experts opposés, puis arbitre.',
  ),
  SYNTHESIS: P(
    'SYNTHESIS',
    'Synthèse',
    'Fusionne les éléments en une réponse unique, sans répétition, en gardant tout fait important.',
  ),
};

/** The atoms a synthesized protocol is built from (each is one line of an existing protocol). */
export const ATOMS: Record<string, string> = {
  constraints: PROTOCOLS['CONSTRAINT-FIRST'].text,
  plan: PROTOCOLS['PLAN-THEN-SOLVE'].text,
  evidence: PROTOCOLS['EVIDENCE-FIRST'].text,
  decompose: PROTOCOLS.DECOMPOSE.text,
  verify: PROTOCOLS.VERIFY.text,
  recompute: PROTOCOLS['DATA-VERIFY'].text,
  test: PROTOCOLS['CODE-VERIFY'].text,
  counter: PROTOCOLS.COUNTEREXAMPLE.text,
  selfcheck: PROTOCOLS['SELF-CHECK'].text,
  structure: PROTOCOLS['STRUCTURE-FIRST'].text,
};
/** Composes a NEW protocol from atoms. It is a candidate until a benchmark promotes it. */
export function synthesizeProtocol(atoms: string[]): Protocol | null {
  const valid = [...new Set(atoms)].filter((a) => ATOMS[a]);
  if (!valid.length) return null;
  const text = valid.map((a, i) => `${i + 1}. ${ATOMS[a]}`).join(' ');
  let h = 0;
  for (const ch of valid.join('+')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    id: `SYN-${h.toString(36)}`,
    label: `Synthétisé : ${valid.join(' + ')}`,
    text,
    tokens: est(text),
    status: 'candidate',
    atoms: valid,
  };
}

/** Hard ceiling of protocol tokens per problem: a protocol must stay proportional to the problem. */
export const protocolCeiling = (d: CognitiveDiagnosis): number =>
  d.trivial ? 0 : d.risk === 'high' ? 140 : d.difficulty >= 0.5 ? 80 : 40;

export interface ProtocolChoice {
  protocol: Protocol;
  /** Why this one (and why not a heavier one). */
  why: string[];
  ceiling: number;
}
/** Picks the smallest sufficient protocol; never exceeds the proportional ceiling. */
export function selectProtocol(d: CognitiveDiagnosis): ProtocolChoice {
  const ceiling = protocolCeiling(d);
  const why: string[] = [];
  if (d.trivial)
    return {
      protocol: PROTOCOLS.DIRECT,
      why: ['demande simple et sans risque : aucun protocole ajouté (0 token)'],
      ceiling,
    };
  const atoms: string[] = [];
  if (d.ambiguity >= 0.45) {
    atoms.push('constraints');
    why.push('ambiguïté élevée → contraintes d’abord');
  }
  if (d.cognitiveType === 'plan' || (d.reasoningNeed >= 0.6 && d.cognitiveType !== 'code')) {
    atoms.push('plan');
    why.push('raisonnement long → plan puis exécution');
  }
  if (d.cognitiveType === 'code') {
    atoms.push('test');
    why.push('code → exécution et test obligatoires');
  } else if (d.calcNeed && d.precisionNeed >= 0.5) {
    atoms.push('recompute');
    why.push('chiffres sensibles → recoupement par un second calcul');
  } else if (d.risk === 'high') {
    atoms.push('evidence', 'verify');
    why.push('enjeu élevé → preuves puis vérification');
  } else if (d.cognitiveType === 'verify') {
    atoms.push('verify');
    why.push('tâche de contrôle → vérification explicite');
  }
  if (d.cognitiveType === 'create') {
    atoms.push('structure');
    why.push('création → structure avant contenu');
  }
  if (!atoms.length) {
    return {
      protocol: PROTOCOLS['MINIMAL-SUFFICIENT-REASONING'],
      why: ['aucun besoin particulier : raisonnement minimal suffisant'],
      ceiling,
    };
  }
  // Trim atoms (last first) until the protocol fits its ceiling.
  let chosen = atoms;
  let p = synthesizeProtocol(chosen)!;
  while (p.tokens > ceiling && chosen.length > 1) {
    why.push(`atome « ${chosen.at(-1)} » retiré : le protocole dépassait ${ceiling} tokens`);
    chosen = chosen.slice(0, -1);
    p = synthesizeProtocol(chosen)!;
  }
  // A single atom equals a built-in protocol: use the reviewed one.
  const single =
    chosen.length === 1 ? Object.values(PROTOCOLS).find((x) => x.text === ATOMS[chosen[0]!]) : undefined;
  if (single) return { protocol: single, why, ceiling };
  return { protocol: p, why: [...why, 'protocole composé : statut CANDIDAT jusqu’à benchmark'], ceiling };
}
