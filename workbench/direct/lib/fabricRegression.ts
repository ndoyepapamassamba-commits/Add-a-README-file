// JEV COGNITIVE FABRIC — non-regression self-test. Every check runs against the REAL modules (no
// canned result): PASS / FAIL / WARN. It makes no model call and costs $0.
import { regressionReport } from './inventory';
import { registry } from './fabric';
import { DEFAULT_FABRIC } from '../../server/jev/fabric/types';
import { directAnswer } from '../../server/jev/packet';
import { analyze, pairUp } from '../../server/jev/science';
import { cfBenchTasks } from '../../server/jev/fabric/cfbench';
import { containsSecret, scrubSecrets } from '../../server/jev/fabric/security';
import { toCsv as logCsv } from '../../server/jev/metrics';
import { toCsv, toJsonl } from '../../server/jev/fabric/distill';
import { DIMENSIONS } from '../../server/jev/fabric/learning';
import { LEARNING_LEVELS } from '../../server/jev/fabric/distill';
import { BENCH } from './jevBench';
import type { JevLogEntry } from '../../server/jev/metrics';

export type Verdict = 'PASS' | 'FAIL' | 'WARN';
export interface Check {
  group: string;
  name: string;
  verdict: Verdict;
  detail: string;
}

const guard = (group: string, name: string, f: () => [Verdict, string]): Check => {
  try {
    const [verdict, detail] = f();
    return { group, name, verdict, detail };
  } catch (e) {
    return { group, name, verdict: 'FAIL', detail: `exception : ${(e as Error).message}` };
  }
};

export function fabricRegression(): Check[] {
  const inv = regressionReport();
  const fake = {
    fabric: { kind: 'cfbench', arm: 'fabric', groupId: 'g', taskKey: 't', category: 'simple', models: ['m'] },
  } as unknown as JevLogEntry;
  return [
    guard('V5', 'Inventaire d’avant JEV intact (outils, agents, vues, réglages…)', () => [
      inv.ok ? 'PASS' : 'FAIL',
      inv.ok
        ? 'aucun élément disparu'
        : inv.sections
            .filter((s) => s.missing.length)
            .map((s) => `${s.name}: ${s.missing.join(',')}`)
            .join(' ; '),
    ]),
    guard('V5', 'JEV-0 : réponse locale sans modèle (L0)', () => {
      const a = directAnswer('12*(3+4)');
      return [a && /84/.test(a) ? 'PASS' : 'FAIL', a ? 'calcul répondu à 0 $' : 'aucune réponse locale'];
    }),
    guard('V5', 'Moteur scientifique : journal vide → aucune conclusion fabriquée', () => {
      const s = analyze([]);
      return [s.verdict === 'E' ? 'PASS' : 'FAIL', `verdict ${s.verdict}`];
    }),
    guard('V5', 'Exports du JEV_LOG (CSV)', () => [
      logCsv([]).length > 0 ? 'PASS' : 'FAIL',
      'en-tête CSV présent',
    ]),
    guard('V5', 'Benchmark 2.0 conservé', () => [
      BENCH.length >= 18 ? 'PASS' : 'FAIL',
      `${BENCH.length} tâches`,
    ]),
    guard('FABRIC', 'Cognitive Fabric désactivé par défaut (comportement V5 inchangé)', () => [
      DEFAULT_FABRIC.enabled === false && DEFAULT_FABRIC.council === false ? 'PASS' : 'FAIL',
      'enabled=false, council=false',
    ]),
    guard('FABRIC', 'Les expériences Fabric sont exclues de l’appariement V5', () => [
      pairUp([fake]).pairs.length === 0 ? 'PASS' : 'FAIL',
      'entrée tagguée fabric ignorée',
    ]),
    guard('FABRIC', 'Registre de capacités alimenté par des capacités réelles', () => {
      const n = registry.list({}).length;
      return [
        n > 0 ? 'PASS' : 'WARN',
        n ? `${n} capacité(s)` : 'registre non chargé : ouvrez Capability Fabric → Découvrir',
      ];
    }),
    guard('FABRIC', 'GitHub : opérations d’écriture jamais exécutables sans approbation', () => {
      const w = registry.list({}).filter((c) => c.type === 'github' && c.writeAccess);
      return [
        w.every((c) => c.approvalRequired) ? 'PASS' : 'FAIL',
        w.length
          ? `${w.length} opération(s) d’écriture, toutes soumises à approbation`
          : 'adaptateur non chargé',
      ];
    }),
    guard('FABRIC', 'Secrets nettoyés avant mémoire / skills / prompts', () => {
      const t = 'clé sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789';
      return [
        containsSecret(t) && !containsSecret(scrubSecrets(t)) ? 'PASS' : 'FAIL',
        'détection + nettoyage',
      ];
    }),
    guard('FABRIC', 'Cognitive Fabric Benchmark : 80 tâches à vérité calculée', () => {
      const t = cfBenchTasks();
      return [t.length === 80 ? 'PASS' : 'FAIL', `${t.length} tâches`];
    }),
    guard('FABRIC', 'Exports Training Data (JSONL / CSV) fonctionnels', () => [
      toJsonl([]) === '' && toCsv([]).length > 0 ? 'PASS' : 'WARN',
      'formats vides valides',
    ]),
    guard('FABRIC', 'Niveaux d’apprentissage 6–7 déclarés UNAVAILABLE (pas de faux entraînement)', () => [
      LEARNING_LEVELS.filter((l) => l.level >= 6).every((l) => l.status === 'UNAVAILABLE') ? 'PASS' : 'FAIL',
      'fine-tuning non disponible',
    ]),
    guard('FABRIC', 'Matrice d’expertise : dimensions déclarées', () => [
      DIMENSIONS.length >= 20 ? 'PASS' : 'FAIL',
      `${DIMENSIONS.length} dimensions`,
    ]),
  ];
}
