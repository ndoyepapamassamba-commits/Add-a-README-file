import { runAgent } from './agent';
import { refreshCredits } from './credits';
import { uid, useStore } from './store';
import type { Attachment, Workflow } from './types';

export const BUILTIN_WORKFLOWS: Workflow[] = [
  {
    id: 'wf-data-report',
    name: 'Analyse de données complète',
    description: 'Import → qualité → analyse → risques → graphiques → rapport Excel / Word / PDF → QA',
    agent: 'data_analyst',
    builtin: true,
    createdAt: 0,
    steps: [
      'IMPORT DATA : inspecter chaque fichier de données joint (colonnes, types, volumétrie)',
      'DATA QUALITY : valeurs manquantes, doublons, anomalies, incohérences (sans modifier les fichiers sources)',
      'ANALYSIS : statistiques clés, tendances, répartitions, comparaisons',
      'RISK ANALYSIS : concentrations, valeurs extrêmes, dégradations, alertes',
      'GRAPHS : 3 à 5 graphiques pertinents (data.chart)',
      'REPORT : rapport structuré (synthèse, chiffres clés vérifiés, constats, recommandations)',
      'EXCEL : tableaux de synthèse exportés en .xlsx dans outputs/ (data.export)',
      'WORD : rapport exporté en .docx (report.export)',
      'PDF : version HTML imprimable du rapport (report.export html)',
      'QA : recalculer les chiffres clés, vérifier les livrables, verdict PASSED / PARTIAL / FAILED',
    ],
  },
  {
    id: 'wf-fix-all',
    name: 'Répare tout',
    description: 'Détecter → diagnostiquer → corriger → tester → re-tester',
    agent: 'general',
    builtin: true,
    createdAt: 0,
    steps: [
      'Lire .ai/KNOWN_ISSUES.md et la structure de l’espace de travail',
      'Exécuter / vérifier le code et les données, lister tous les problèmes (bugs, logique, performance, UI)',
      'Diagnostiquer la cause racine de chaque problème',
      'Corriger de façon minimale',
      'Re-tester tout, vérifier l’absence de régression',
      'Mettre à jour .ai/KNOWN_ISSUES.md, .ai/TESTS.md et livrer le rapport',
    ],
  },
  {
    id: 'wf-doc-synthesis',
    name: 'Synthèse de documents',
    description: 'PDF / Word / PowerPoint → points clés, chiffres, risques → note Word',
    agent: 'document_analyst',
    builtin: true,
    createdAt: 0,
    steps: [
      'Lire intégralement chaque document joint',
      'Extraire faits, chiffres, dates, obligations et risques avec références',
      'Signaler les incohérences entre documents',
      'Rédiger une note de synthèse et l’exporter en Word (report.export)',
      'Vérifier que chaque chiffre cité figure dans les sources',
    ],
  },
];

export function allWorkflows(custom: Workflow[]): Workflow[] {
  return [...BUILTIN_WORKFLOWS.filter((b) => !custom.some((c) => c.id === b.id)), ...custom];
}

/** Starts a workflow as an autonomous mission in a new session. */
export function runWorkflow(wf: Workflow, attachments: Attachment[] = [], extra = ''): string {
  const st = useStore.getState();
  const s = st.newSession();
  st.patchSession(s.id, { agent: wf.agent, title: `⚙ ${wf.name}`, mode: 'auto' });
  if (!wf.builtin)
    st.setWorkflows(st.workflows.map((w) => (w.id === wf.id ? { ...w, lastRunAt: Date.now() } : w)));
  const text = `Workflow « ${wf.name} » — exécute ces étapes dans l’ordre, en tenant la checklist à jour (plan.update) :\n${wf.steps.map((x, i) => `${i + 1}. ${x}`).join('\n')}${extra ? `\n\nPrécisions : ${extra}` : ''}`;
  void runAgent(s.id, text, attachments, { mode: 'mission' }).then(refreshCredits);
  return s.id;
}

export function newWorkflow(): Workflow {
  return { id: uid(), name: '', description: '', agent: 'general', steps: [], createdAt: Date.now() };
}
