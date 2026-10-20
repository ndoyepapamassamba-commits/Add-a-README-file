// JEV COGNITIVE OS — SELF-AUDIT: JEV audits its own behaviour from the log. Every finding carries the measured figure it rests on;
// a question without enough data says INSUFFICIENT DATA rather than answering.
import type { JevLogEntry } from '../metrics';
import { qualityOfEntry } from '../fabric/memory';
import { mean } from '../apprentice/intervals';

export type AuditStatus = 'OK' | 'WARNING' | 'PROBLEM' | 'INSUFFICIENT DATA';
export interface AuditFinding {
  id: string;
  question: string;
  status: AuditStatus;
  evidence: string;
  suggestion?: string;
}
const MIN = 10;
export function selfAudit(log: JevLogEntry[]): AuditFinding[] {
  const es = log.filter((e) => !e.studio && !e.fabric);
  const out: AuditFinding[] = [];
  const add = (id: string, question: string, status: AuditStatus, evidence: string, suggestion?: string) =>
    out.push({ id, question, status, evidence, suggestion });
  const need = (id: string, q: string, n: number) => {
    if (n >= MIN) return false;
    add(id, q, 'INSUFFICIENT DATA', `${n} mission(s) exploitable(s) (minimum ${MIN})`);
    return true;
  };
  const waste = es.filter((e) => typeof e.wasteRate === 'number');
  if (!need('tokens', 'Ai-je utilisé trop de tokens ?', waste.length)) {
    const w = mean(waste.map((e) => e.wasteRate!))!;
    add(
      'tokens',
      'Ai-je utilisé trop de tokens ?',
      w > 0.25 ? 'PROBLEM' : w > 0.1 ? 'WARNING' : 'OK',
      `gaspillage mesuré moyen ${(w * 100).toFixed(1)} % des tokens`,
      w > 0.1 ? 'activer la compression sémantique du contexte' : undefined,
    );
  }
  if (!need('calls', 'Ai-je appelé trop de modèles ?', es.length)) {
    const c = mean(es.map((e) => e.calls))!;
    add(
      'calls',
      'Ai-je appelé trop de modèles ?',
      c > 8 ? 'WARNING' : 'OK',
      `${c.toFixed(1)} appel(s) de modèle par mission en moyenne`,
    );
  }
  const free = es.filter((e) => e.apprentice?.active);
  if (!need('premium', 'Ai-je utilisé un modèle trop puissant ?', free.length)) {
    const handed = free.filter((e) => (e.apprentice!.path.length ?? 1) > 1).length;
    add(
      'premium',
      'Ai-je utilisé un modèle trop puissant ?',
      handed / free.length > 0.5 ? 'WARNING' : 'OK',
      `${handed}/${free.length} mission(s) free-first ont dû passer à un autre modèle`,
      handed / free.length > 0.5
        ? 'améliorer le conditionnement des modèles gratuits avant d’escalader'
        : undefined,
    );
  }
  const ctx = es.filter((e) => e.contextBefore > 0);
  if (!need('context', 'Ai-je envoyé trop de contexte ?', ctx.length)) {
    const r = mean(ctx.map((e) => e.contextAfter / e.contextBefore))!;
    add(
      'context',
      'Ai-je envoyé trop de contexte ?',
      r > 0.85 ? 'WARNING' : 'OK',
      `le contexte envoyé représente ${(r * 100).toFixed(0)} % du contexte disponible`,
      r > 0.85 ? 'activer la capsule cognitive' : undefined,
    );
  }
  if (!need('corrections', 'Ai-je fait des corrections inutiles ?', es.length)) {
    const cor = es.filter((e) => e.corrections > 0);
    const useless = cor.filter((e) => e.success === false).length;
    add(
      'corrections',
      'Ai-je fait des corrections inutiles ?',
      cor.length && useless / cor.length > 0.5 ? 'WARNING' : 'OK',
      `${cor.length} mission(s) corrigée(s), dont ${useless} restées en échec`,
    );
  }
  const drift = es.filter((e) => (e.driftEvents?.length ?? 0) > 0);
  if (!need('stop', 'Ai-je pu arrêter plus tôt ?', es.length))
    add(
      'stop',
      'Ai-je pu arrêter plus tôt ?',
      drift.length / es.length > 0.2 ? 'WARNING' : 'OK',
      `${drift.length}/${es.length} mission(s) avec dérive économique détectée`,
      drift.length ? 'activer l’arrêt intelligent (Stop Intelligence)' : undefined,
    );
  const q = es.map(qualityOfEntry).filter((x): x is number => x !== null);
  if (!need('quality', 'La qualité est-elle mesurée ?', es.length))
    add(
      'quality',
      'La qualité est-elle mesurée ?',
      q.length / es.length < 0.5 ? 'WARNING' : 'OK',
      `${q.length}/${es.length} mission(s) avec qualité mesurée`,
      q.length / es.length < 0.5 ? 'sans mesure, aucune compétence ne peut être promue' : undefined,
    );
  const noCog = es.filter((e) => !(e as { cognitive?: unknown }).cognitive).length;
  add(
    'cognitive',
    'Le Cognitive OS a-t-il été utilisé ?',
    es.length ? (noCog === es.length ? 'INSUFFICIENT DATA' : 'OK') : 'INSUFFICIENT DATA',
    es.length ? `${es.length - noCog}/${es.length} mission(s) portent une trace cognitive` : 'aucune mission',
  );
  return out;
}
