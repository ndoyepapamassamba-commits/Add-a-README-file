// Mission orchestration protocol and project memory (.ai/) — pure, shared by
// the server orchestrator and the direct (browser) edition.

export const MISSION_STAGES = [
  'analyse',
  'plan',
  'execution',
  'test',
  'review',
  'correction',
  'validation',
  'delivery',
] as const;
export type MissionStage = (typeof MISSION_STAGES)[number];
export const STAGE_LABEL: Record<MissionStage, string> = {
  analyse: 'Analyse',
  plan: 'Plan',
  execution: 'Exécution',
  test: 'Test',
  review: 'Review',
  correction: 'Correction',
  validation: 'Validation',
  delivery: 'Livraison',
};

export type Verdict = 'PASSED' | 'PARTIAL' | 'FAILED';

export interface MissionCheck {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  details?: string;
  /** Re-runnable check (terminal command) — kept in the living regression suite. */
  command?: string;
  /** Text the command output must contain. */
  expect?: string;
}

export type Certainty = 'certain' | 'probable' | 'uncertain' | 'unknown';
export interface EvidenceItem {
  claim: string;
  /** Tool result / file / URL that supports the claim. */
  source: string;
  level: Certainty;
}
export type RelatedPriority = 'indispensable' | 'recommended' | 'optional' | 'forbidden';
export interface RelatedTask {
  task: string;
  priority: RelatedPriority;
  done?: boolean;
}

export interface MissionReport {
  status: Verdict;
  summary: string;
  checks: MissionCheck[];
  issues: string[];
  deliverables: string[];
  /** Uncertainty map: key claims with their evidence and confidence. */
  evidence?: EvidenceItem[];
  /** « Et toute autre tâche… » — related tasks found during the mission. */
  related?: RelatedTask[];
}

export const MISSION_PROTOCOL = `# MISSION MODE (autonomous)
You own this mission end-to-end and work until the result is validated. Follow the pipeline and announce each stage with mission.stage:
ANALYSE → PLAN → EXECUTION → TEST → REVIEW → CORRECTION → VALIDATION → DELIVERY

Rules:
- ANALYSE: read the project memory (.ai/) and the relevant files/data before acting. State assumptions.
- PLAN: keep a concrete checklist with plan.update (one step in_progress at a time).
- EXECUTION: delegate to the right specialists with agent.delegate when it helps (architect, coder, data_analyst, researcher, browser, document_analyst, reporting, qa_engineer, security_reviewer).
- TEST: verify for real — run tests/builds/commands, re-read outputs, recompute figures, check the browser console. Never claim something works without evidence.
- REVIEW then CORRECTION: fix every failure found, then re-test (loop until green or truly blocked).
- Never modify a user's source data file: write results to new files (outputs/…).
- Keep the project memory current: update .ai/TODO.md, .ai/KNOWN_ISSUES.md, .ai/DECISIONS.md, .ai/MEMORY.md when relevant.
- DELIVERY: finish by calling mission.report with an honest verdict:
  PASSED = everything requested is done and verified; PARTIAL = some parts done/verified, others not; FAILED = not achieved.
  List each check you actually ran (pass/fail/skip) — give a terminal command + expected text when the check can be re-run (it joins the living regression suite) —, remaining issues, deliverables (file paths), the uncertainty map (evidence: each key figure / claim with its source and certainty) and the related tasks you identified (indispensable / recommended / optional / forbidden without authorisation).
Do not stop before mission.report. Do not ask the user questions unless you are truly blocked; make reasonable decisions and record them in .ai/DECISIONS.md.`;

export const FIX_EVERYTHING = `Mission « Répare tout » : trouve et corrige tous les problèmes du projet.
1. DÉTECTER : lis .ai/KNOWN_ISSUES.md, la structure du projet, lance les tests / le build / le lint s'ils existent, cherche les erreurs JavaScript, API, terminal, réseau, UI (console du navigateur sur l'aperçu), logique, performance et régressions.
2. DIAGNOSTIQUER chaque problème (cause racine, fichier:ligne).
3. CORRIGER de façon minimale et sûre.
4. TESTER puis RE-TESTER tout (aucune régression).
5. Mettre à jour .ai/KNOWN_ISSUES.md, .ai/TESTS.md, .ai/CHANGELOG.md, puis livrer avec mission.report.`;

export interface MissionTemplate {
  id: string;
  label: string;
  prompt: string;
  agent?: string;
}

export const MISSION_TEMPLATES: MissionTemplate[] = [
  { id: 'build', label: 'Construis une application', prompt: 'Construis cette application : ' },
  {
    id: 'analyse-file',
    label: 'Analyse ce fichier',
    prompt:
      'Analyse le fichier joint : qualité des données (manquants, doublons, anomalies), statistiques clés, tendances, 3 graphiques utiles et une synthèse claire. Livre un rapport (Markdown + Word).',
    agent: 'data_analyst',
  },
  { id: 'fix-all', label: 'Répare tout', prompt: FIX_EVERYTHING },
  {
    id: 'research',
    label: 'Recherche',
    prompt:
      'Recherche de façon approfondie, croise plusieurs sources récentes et livre une synthèse sourcée : ',
    agent: 'researcher',
  },
  {
    id: 'automate',
    label: 'Automatise une tâche',
    prompt:
      'Automatise cette tâche de bout en bout (script ou procédure réutilisable, testée, documentée) : ',
  },
  {
    id: 'test-all',
    label: 'Teste tout',
    prompt:
      'Teste tout le projet : lance les tests, le build, vérifie les fonctionnalités principales (y compris dans le navigateur si c’est une application web), liste précisément ce qui passe et ce qui échoue, corrige ce qui échoue et re-teste.',
    agent: 'qa_engineer',
  },
  {
    id: 'report',
    label: 'Prépare le rapport',
    prompt:
      'Prépare un rapport professionnel complet (synthèse, chiffres clés vérifiés, graphiques, recommandations) à partir des fichiers du projet, et exporte-le en Word, PDF et Markdown.',
    agent: 'reporting',
  },
];

export const FINAL_REVIEW_TASK = (
  goal: string,
  report: MissionReport,
) => `You are the FINAL REVIEWER of an autonomous mission. Check independently (read files, re-run what you can) whether the deliverables really satisfy the goal.

Goal:
${goal.slice(0, 4000)}

Agent's report (${report.status}):
${formatReport(report)}

Answer with a first line that is exactly "VERDICT: APPROVED" or "VERDICT: CHANGES_REQUIRED", then a short list of blocking problems (with file paths) if any. Be strict but fair: style nits are not blocking.`;

export function reviewApproved(text: string): boolean {
  const m = /VERDICT:\s*(APPROVED|CHANGES_REQUIRED)/i.exec(text);
  return m ? m[1]!.toUpperCase() === 'APPROVED' : !/CHANGES_REQUIRED|bloquant|blocking/i.test(text);
}

export function formatReport(r: MissionReport): string {
  const icon = (s: MissionCheck['status']) => (s === 'pass' ? '✅' : s === 'fail' ? '❌' : '⏭️');
  return [
    `**${r.status}** — ${r.summary}`,
    r.checks.length
      ? `\nTests :\n${r.checks.map((c) => `- ${icon(c.status)} ${c.name}${c.details ? ` — ${c.details}` : ''}`).join('\n')}`
      : '',
    r.issues.length ? `\nProblèmes restants :\n${r.issues.map((i) => `- ${i}`).join('\n')}` : '',
    r.deliverables.length ? `\nLivrables :\n${r.deliverables.map((d) => `- ${d}`).join('\n')}` : '',
    r.evidence?.length
      ? `\nCarte d'incertitude :\n${r.evidence.map((e) => `- ${CERTAINTY_ICON[e.level]} ${e.claim} — _${e.source}_`).join('\n')}`
      : '',
    r.related?.length
      ? `\nTâches connexes :\n${r.related.map((t) => `- ${t.done ? '☑' : '☐'} [${RELATED_LABEL[t.priority]}] ${t.task}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export const CERTAINTY_ICON: Record<Certainty, string> = {
  certain: '🟢 certain',
  probable: '🟡 probable',
  uncertain: '🟠 incertain',
  unknown: '⚪ inconnu',
};
export const RELATED_LABEL: Record<RelatedPriority, string> = {
  indispensable: 'Indispensable',
  recommended: 'Recommandée',
  optional: 'Optionnelle',
  forbidden: 'Interdite sans autorisation',
};

export function normalizeReport(raw: Record<string, unknown>): MissionReport {
  const st = String(raw.status ?? '').toUpperCase();
  const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);
  return {
    status: st === 'PASSED' || st === 'PARTIAL' ? st : 'FAILED',
    summary: String(raw.summary ?? '').slice(0, 4000),
    checks: (Array.isArray(raw.checks) ? raw.checks : []).slice(0, 60).map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      const s = String(o.status ?? '').toLowerCase();
      return {
        name: String(o.name ?? 'check').slice(0, 200),
        status: s === 'pass' || s === 'fail' ? s : 'skip',
        details: o.details ? String(o.details).slice(0, 400) : undefined,
        command: o.command ? String(o.command).slice(0, 500) : undefined,
        expect: o.expect ? String(o.expect).slice(0, 300) : undefined,
      };
    }),
    issues: arr(raw.issues).slice(0, 40),
    deliverables: arr(raw.deliverables).slice(0, 40),
    evidence: (Array.isArray(raw.evidence) ? raw.evidence : []).slice(0, 40).map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      const l = String(o.level ?? '').toLowerCase();
      return {
        claim: String(o.claim ?? '').slice(0, 300),
        source: String(o.source ?? 'non précisée').slice(0, 200),
        level: (['certain', 'probable', 'uncertain', 'unknown'].includes(l) ? l : 'uncertain') as Certainty,
      };
    }),
    related: (Array.isArray(raw.related) ? raw.related : []).slice(0, 30).map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      const p = String(o.priority ?? '').toLowerCase();
      return {
        task: String(o.task ?? '').slice(0, 300),
        priority: (['indispensable', 'recommended', 'optional', 'forbidden'].includes(p)
          ? p
          : 'optional') as RelatedPriority,
        done: Boolean(o.done),
      };
    }),
  };
}

/** JSON schema of the mission.report tool. */
export const MISSION_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['PASSED', 'PARTIAL', 'FAILED'] },
    summary: { type: 'string', description: 'What was achieved, in the user’s language' },
    checks: {
      type: 'array',
      description: 'Verifications actually performed',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          status: { type: 'string', enum: ['pass', 'fail', 'skip'] },
          details: { type: 'string' },
          command: { type: 'string', description: 'Optional terminal command that re-runs this check' },
          expect: { type: 'string', description: 'Text the command output must contain' },
        },
        required: ['name', 'status'],
      },
    },
    issues: { type: 'array', items: { type: 'string' }, description: 'Remaining problems' },
    deliverables: { type: 'array', items: { type: 'string' }, description: 'Files / artifacts produced' },
    evidence: {
      type: 'array',
      description:
        'Uncertainty map: each key claim / figure with its source (tool result, file, URL) and confidence',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          source: { type: 'string' },
          level: { type: 'string', enum: ['certain', 'probable', 'uncertain', 'unknown'] },
        },
        required: ['claim', 'source', 'level'],
      },
    },
    related: {
      type: 'array',
      description:
        'Related tasks you identified (indispensable ones must be done; forbidden = needs explicit authorisation)',
      items: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          priority: { type: 'string', enum: ['indispensable', 'recommended', 'optional', 'forbidden'] },
          done: { type: 'boolean' },
        },
        required: ['task', 'priority'],
      },
    },
  },
  required: ['status', 'summary', 'checks'],
};

// ── project memory (.ai/) ───────────────────────────────────────────────

export const AI_DOCS = [
  'PROJECT',
  'ARCHITECTURE',
  'REQUIREMENTS',
  'DECISIONS',
  'TODO',
  'KNOWN_ISSUES',
  'TESTS',
  'CHANGELOG',
  'MEMORY',
] as const;
export type AiDoc = (typeof AI_DOCS)[number];
export const aiDocPath = (d: AiDoc) => `.ai/${d}.md`;

const TEMPLATES: Record<AiDoc, (p: string) => string> = {
  PROJECT: (p) =>
    `# ${p}\n\n## Objectif\n_(à compléter)_\n\n## État actuel\n_(mis à jour par l’IA à chaque mission)_\n`,
  ARCHITECTURE: () => `# Architecture\n\n_(structure, composants, flux de données, technologies)_\n`,
  REQUIREMENTS: () => `# Exigences\n\n_(fonctionnalités attendues, contraintes, critères d’acceptation)_\n`,
  DECISIONS: () => `# Décisions\n\n_(date — décision — raison)_\n`,
  TODO: () => `# À faire\n\n- [ ] \n`,
  KNOWN_ISSUES: () => `# Problèmes connus\n\n_(aucun pour l’instant)_\n`,
  TESTS: () => `# Tests\n\n_(résultats des dernières vérifications)_\n`,
  CHANGELOG: () => `# Journal des modifications\n`,
  MEMORY: () => `# Mémoire\n\n_(faits durables utiles : préférences, conventions, chemins importants)_\n`,
};

export function aiDocTemplate(doc: AiDoc, projectName: string): string {
  return TEMPLATES[doc](projectName);
}

const isTemplate = (doc: AiDoc, text: string) =>
  text.trim() === aiDocTemplate(doc, '').trim() ||
  (/_\((à compléter|mis à jour par|structure, composants|fonctionnalités attendues|date — décision|aucun pour|résultats des|faits durables)/.test(
    text,
  ) &&
    text.length < 260);

/** Compact digest of the project memory injected when a session starts. */
export function memoryDigest(docs: Partial<Record<AiDoc, string>>, maxChars = 12_000): string {
  const order: [AiDoc, number][] = [
    ['PROJECT', 3000],
    ['TODO', 2500],
    ['KNOWN_ISSUES', 2000],
    ['MEMORY', 2000],
    ['DECISIONS', 1500],
    ['ARCHITECTURE', 2000],
    ['REQUIREMENTS', 1500],
    ['TESTS', 1200],
    ['CHANGELOG', 1500],
  ];
  const parts: string[] = [];
  for (const [d, max] of order) {
    const t = docs[d];
    if (!t || isTemplate(d, t)) continue;
    // Changelog / tests: most recent entries are at the end.
    const body =
      d === 'CHANGELOG' || d === 'TESTS' || d === 'DECISIONS'
        ? t.length > max
          ? `…${t.slice(-max)}`
          : t
        : t.length > max
          ? `${t.slice(0, max)}…`
          : t;
    parts.push(`<${aiDocPath(d)}>\n${body.trim()}\n</${aiDocPath(d)}>`);
  }
  const out = parts.join('\n\n');
  return out.length > maxChars ? `${out.slice(0, maxChars)}…` : out;
}

export function changelogEntry(
  goal: string,
  r: MissionReport,
  meta: { model?: string; cost?: number; date?: Date } = {},
): string {
  const d = (meta.date ?? new Date()).toISOString().slice(0, 16).replace('T', ' ');
  return `\n## ${d} — ${r.status} — ${goal.split('\n')[0]!.slice(0, 120)}\n${r.summary}\n${r.deliverables.length ? `Livrables : ${r.deliverables.join(', ')}\n` : ''}${meta.model ? `Modèle : ${meta.model}${meta.cost !== undefined ? ` · coût $${meta.cost.toFixed(4)}` : ''}\n` : ''}`;
}

export function testsEntry(r: MissionReport, date = new Date()): string {
  return `\n## ${date.toISOString().slice(0, 16).replace('T', ' ')} — ${r.status}\n${r.checks.map((c) => `- [${c.status === 'pass' ? 'x' : ' '}] ${c.name} (${c.status})${c.details ? ` — ${c.details}` : ''}`).join('\n') || '- aucun test exécuté'}\n`;
}

export const MEMORY_INSTRUCTIONS = `# Project memory (.ai/)
The folder .ai/ holds the long-term memory of this project: PROJECT.md (goal + current state), ARCHITECTURE.md, REQUIREMENTS.md, DECISIONS.md, TODO.md, KNOWN_ISSUES.md, TESTS.md, CHANGELOG.md, MEMORY.md.
Read them to understand where the project stands. After significant work, update them (memory.doc): current state in PROJECT.md, remaining work in TODO.md, open problems in KNOWN_ISSUES.md, durable facts in MEMORY.md, choices in DECISIONS.md. Keep them short and factual.`;
