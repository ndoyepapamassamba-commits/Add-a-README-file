// Skill Registry: method packs the engine can activate for a mission. A skill
// says what it is for (triggers, capabilities), what it needs (tools, model
// capabilities), what it costs and what it is allowed to touch. The engine
// decides per mission which skills apply, explains why, and refuses the ones
// that are incompatible with the chosen model or the available tools.
import type { ModelInfo } from '@shared/types';
import type { IntelMetric } from '../llm/modelIntel';
import type { QualityTier } from '../llm/routing';

export interface EngineSkill {
  name: string;
  description: string;
  capabilities: string[];
  /** Regular expressions (case-insensitive) on the mission text + attachment names. */
  triggers: string[];
  required_tools: string[];
  recommended_models: { metric: IntelMetric; tier: QualityTier };
  incompatible_models: ('no-vision' | 'no-tools' | 'short-context')[];
  cost_profile: 'faible' | 'moyen' | 'élevé';
  security_profile: 'lecture seule' | 'écrit dans l’espace de travail' | 'réseau' | 'exécute du code';
  source: string;
  version: string;
  license: string;
  /** Agents that use this skill (role ids). */
  agents: string[];
  /** Skills that should accompany this one. */
  companions?: string[];
  /** Method injected into the agent's instructions when the skill is active. */
  playbook: string;
}

const NATIVE = { source: 'MASSAMBA (natif)', version: '1.0', license: 'MIT' };

export const SKILL_REGISTRY: EngineSkill[] = [
  {
    ...NATIVE,
    name: 'data_analysis',
    description: 'Analyse de données tabulaires : profil, agrégats exacts, filtres, comparaisons.',
    capabilities: ['profilage', 'agrégation', 'filtres', 'jointures'],
    triggers: ['analy[sz]', 'donn[ée]es', 'tableau', 'kpi', 'total', 'somme', 'moyenne', 'r[ée]partition'],
    required_tools: ['data.inspect', 'data.query'],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    incompatible_models: ['no-tools'],
    cost_profile: 'faible',
    security_profile: 'lecture seule',
    agents: ['data_analyst', 'data_quality'],
    playbook:
      'Start with data.inspect (types, missing values, duplicates, units). Every figure comes from data.query — never estimate. Re-compute key totals a second way.',
  },
  {
    ...NATIVE,
    name: 'excel_analysis',
    description: 'Classeurs Excel (xlsx, xlsm, xlsb, csv) : feuilles, colonnes, formats, totaux de contrôle.',
    capabilities: ['lecture xlsx/xlsb/csv', 'feuilles multiples', 'contrôle de totaux'],
    triggers: ['excel', 'xlsx?\\b', 'xlsm', 'xlsb', 'csv', 'tableur', 'classeur', 'feuille'],
    required_tools: ['data.inspect', 'data.query', 'data.export'],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    incompatible_models: ['no-tools'],
    cost_profile: 'faible',
    security_profile: 'écrit dans l’espace de travail',
    agents: ['data_analyst', 'reporting'],
    companions: ['data_analysis'],
    playbook:
      'List the sheets and their row counts first; check header rows and merged cells; reconcile the sum of detail rows with any total row before using it. Exports go to outputs/ in house style (data.export).',
  },
  {
    ...NATIVE,
    name: 'statistical_analysis',
    description: 'Statistiques et anomalies : distributions, valeurs extrêmes, écarts, tendances.',
    capabilities: ['quantiles', 'z-score / IQR', 'tendances', 'corrélations'],
    triggers: [
      'anomal',
      'statisti',
      'outlier',
      'aberran',
      '[ée]cart',
      'tendance',
      'corr[ée]lation',
      'distribution',
      'd[ée]tect',
    ],
    required_tools: ['data.query', 'code.run'],
    recommended_models: { metric: 'intelligence', tier: 'quality' },
    incompatible_models: ['no-tools'],
    cost_profile: 'moyen',
    security_profile: 'exécute du code',
    agents: ['data_analyst', 'adversarial'],
    playbook:
      'Define the anomaly rule explicitly (IQR ×1.5, |z| > 3, rule-based thresholds), compute it with tools, list the flagged rows with their keys, and state how many rows each rule flags.',
  },
  {
    ...NATIVE,
    name: 'risk_analysis',
    description: 'Risque de crédit : IFRS 9 (stages, ECL), BCEAO, NPL, provisions, concentration.',
    capabilities: ['stages IFRS 9', 'NPL', 'provisions', 'concentration', 'migration'],
    triggers: [
      'ifrs ?9',
      'risque',
      '\\bnpl\\b',
      'provision',
      'bceao',
      '\\becl\\b',
      'cr[ée]ances? (douteuses|en souffrance)',
      'impay[ée]',
      'stage ?[123]',
      'd[ée]faut',
    ],
    required_tools: ['data.query', 'decision.simulate'],
    recommended_models: { metric: 'intelligence', tier: 'quality' },
    incompatible_models: ['no-tools'],
    cost_profile: 'moyen',
    security_profile: 'lecture seule',
    agents: ['data_analyst', 'compliance', 'adversarial'],
    companions: ['document_reporting', 'statistical_analysis'],
    playbook:
      'State the regulatory rule used (IFRS 9 stage criteria, BCEAO classification, days past due thresholds) before applying it; compute NPL ratio = NPL outstanding / total outstanding with tools; flag inconsistencies between stage and days past due; never round regulatory figures before the final presentation.',
  },
  {
    ...NATIVE,
    name: 'document_reporting',
    description: 'Livrables au style maison : rapport Word, PDF, Excel, mail Outlook (.eml).',
    capabilities: ['docx', 'pdf', 'xlsx stylé', 'eml'],
    triggers: [
      'rapport',
      'synth[èe]se',
      'note',
      'comex',
      'comit[ée]',
      'pr[ée]sentation',
      'mail',
      'livrable',
      'export',
    ],
    required_tools: ['report.export'],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    incompatible_models: [],
    cost_profile: 'faible',
    security_profile: 'écrit dans l’espace de travail',
    agents: ['reporting', 'apex_studio'],
    playbook:
      'Lead with the decision-relevant figures, then method and limits; every number must already exist in a tool result; export with report.export in house style (XOF # ##0, dd/mm/yyyy).',
  },
  {
    ...NATIVE,
    name: 'pdf_extraction',
    description: 'Extraction de texte et de tableaux depuis des PDF.',
    capabilities: ['texte PDF', 'pages', 'clauses'],
    triggers: ['pdf', 'extrai', 'clause', 'scann'],
    required_tools: ['filesystem.read'],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    incompatible_models: [],
    cost_profile: 'faible',
    security_profile: 'lecture seule',
    agents: ['document_analyst'],
    playbook:
      'Read the PDF with filesystem.read (page markers are kept); quote the page for every extracted element; for tables, rebuild them as CSV and check row counts.',
  },
  {
    ...NATIVE,
    name: 'ocr_vision',
    description: 'Lecture d’images, captures et documents scannés (modèle vision).',
    capabilities: ['images', 'captures', 'scans'],
    triggers: ['image', 'capture', 'photo', 'scann', 'ocr', 'screenshot'],
    required_tools: ['filesystem.read'],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    incompatible_models: ['no-vision'],
    cost_profile: 'moyen',
    security_profile: 'lecture seule',
    agents: ['document_analyst'],
    playbook:
      'Describe what is visible before interpreting; transcribe numbers exactly and mark unreadable parts as such.',
  },
  {
    ...NATIVE,
    name: 'web_research',
    description: 'Recherche web sourcée et comparaison de sources.',
    capabilities: ['recherche', 'sources', 'comparaison'],
    triggers: ['recherch', 'cherche', 'web', 'internet', 'actualit', 'sources?', 'veille', 'compare'],
    required_tools: ['web.search'],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    incompatible_models: ['no-tools'],
    cost_profile: 'moyen',
    security_profile: 'réseau',
    agents: ['researcher'],
    playbook:
      'Use at least two independent sources for any key fact, give the link and date of each, and say when sources disagree.',
  },
  {
    ...NATIVE,
    name: 'browser_automation',
    description: 'Pilotage du navigateur intégré : formulaires, clics, chargement de fichiers, exports.',
    capabilities: ['snapshot', 'clic', 'saisie', 'upload', 'téléchargements'],
    triggers: ['navigu', 'navigateur', 'browser', 'clique', 'formulaire', 'site', 'page web', 'teste l.?app'],
    required_tools: ['browser.open', 'browser.snapshot', 'browser.click'],
    recommended_models: { metric: 'agentic', tier: 'balanced' },
    incompatible_models: ['no-tools'],
    cost_profile: 'moyen',
    security_profile: 'réseau',
    agents: ['browser', 'qa_engineer'],
    playbook:
      'Take a snapshot before each action, act on refs from the latest snapshot only, and verify the effect (snapshot, downloads/) after each step.',
  },
  {
    ...NATIVE,
    name: 'code_generation',
    description: 'Écriture et correction de code, exécuté et vérifié.',
    capabilities: ['implémentation', 'refactor', 'débogage'],
    triggers: [
      'code',
      'bug',
      'fonction',
      'script',
      'typescript',
      'javascript',
      'python',
      'html',
      'css',
      'refactor',
      'd[ée]bogue',
      'application',
      'architecture',
      'impl[ée]ment',
      'd[ée]velopp',
    ],
    required_tools: ['filesystem.edit', 'code.run'],
    recommended_models: { metric: 'coding', tier: 'quality' },
    incompatible_models: ['no-tools'],
    cost_profile: 'moyen',
    security_profile: 'exécute du code',
    agents: ['coder', 'architect'],
    companions: ['testing'],
    playbook:
      'Read before editing, check dependents (project.impact), run what you wrote, and never leave placeholders.',
  },
  {
    ...NATIVE,
    name: 'testing',
    description: 'Tests et QA : exécution, cas limites, suite de régression.',
    capabilities: ['tests', 'régression', 'cas limites'],
    triggers: ['test', 'qa\\b', 'v[ée]rifie', 'valide', 'r[ée]gression'],
    required_tools: ['code.run', 'regression.run'],
    recommended_models: { metric: 'coding', tier: 'balanced' },
    incompatible_models: ['no-tools'],
    cost_profile: 'faible',
    security_profile: 'exécute du code',
    agents: ['qa_engineer', 'tester'],
    playbook:
      'Report each check as PASS / FAIL with the command and its output; test empty input, missing column and extreme values.',
  },
  {
    ...NATIVE,
    name: 'security_audit',
    description: 'Revue de sécurité : secrets, injections, permissions, dépendances.',
    capabilities: ['secrets', 'injections', 'XSS', 'permissions'],
    triggers: ['s[ée]curit', 'vuln[ée]rab', 'audit', 'secret', 'injection', 'xss', 'csrf'],
    required_tools: ['filesystem.search', 'filesystem.read'],
    recommended_models: { metric: 'coding', tier: 'quality' },
    incompatible_models: ['no-tools'],
    cost_profile: 'moyen',
    security_profile: 'lecture seule',
    agents: ['security_reviewer'],
    playbook:
      'Search for hard-coded secrets, unsanitised HTML, eval, unchecked inputs and broad permissions; rank findings by exploitability and give the fix.',
  },
  {
    ...NATIVE,
    name: 'apex_app',
    description: 'Application HTML offline au style maison (méthode APEX) avec exports.',
    capabilities: ['dashboard', 'exports Excel/Word/PPT/PDF/mail', 'QA navigateur'],
    triggers: ['apex', 'dashboard', 'tableau de bord', 'cockpit', 'application', '\\bapp\\b', 'reporting'],
    required_tools: ['apex.guide', 'apex.build_app', 'apex.qa'],
    recommended_models: { metric: 'coding', tier: 'quality' },
    incompatible_models: ['no-tools', 'short-context'],
    cost_profile: 'élevé',
    security_profile: 'écrit dans l’espace de travail',
    agents: ['apex_studio'],
    companions: ['testing'],
    playbook:
      'Follow apex.guide; assemble with apex.build_app; run apex.qa in the embedded browser with a real file and click every export.',
  },
  {
    ...NATIVE,
    name: 'financial_modeling',
    description: 'Scénarios et sensibilités : hypothèses, simulation, point de bascule.',
    capabilities: ['scénarios', 'sensibilité', 'point de bascule'],
    triggers: [
      'sc[ée]nario',
      'simul',
      'sensibilit',
      'what if',
      'hypoth[èe]se',
      'pr[ée]vision',
      'mod[eè]le financier',
      'budget',
    ],
    required_tools: ['decision.simulate'],
    recommended_models: { metric: 'intelligence', tier: 'quality' },
    incompatible_models: ['no-tools'],
    cost_profile: 'moyen',
    security_profile: 'lecture seule',
    agents: ['simulation', 'data_analyst'],
    playbook:
      'Write the formula explicitly, run decision.simulate over the uncertain variables, report the tipping point and which variable changes the conclusion.',
  },
  {
    ...NATIVE,
    name: 'data_quality',
    description: 'Qualité des données : complétude, doublons, cohérence, fraîcheur.',
    capabilities: ['complétude', 'unicité', 'cohérence'],
    triggers: ['qualit[ée] des donn', 'doublon', 'manquant', 'coh[ée]renc', 'nettoy', 'incoh[ée]ren'],
    required_tools: ['data.inspect', 'data.query'],
    recommended_models: { metric: 'intelligence', tier: 'cheap' },
    incompatible_models: ['no-tools'],
    cost_profile: 'faible',
    security_profile: 'lecture seule',
    agents: ['data_quality'],
    playbook:
      'Measure missing values, duplicate keys and out-of-range values per column before any analysis; report their impact on totals.',
  },
  {
    ...NATIVE,
    name: 'visualization',
    description: 'Graphiques et diagrammes lisibles.',
    capabilities: ['graphiques', 'diagrammes'],
    triggers: ['graphique', 'chart', 'courbe', 'histogramme', 'diagramme', 'visualis', 'camembert'],
    required_tools: ['data.chart'],
    recommended_models: { metric: 'intelligence', tier: 'cheap' },
    incompatible_models: [],
    cost_profile: 'faible',
    security_profile: 'lecture seule',
    agents: ['data_analyst', 'reporting'],
    playbook:
      'Pick the chart from the question (trend → line, comparison → bars, part of whole → stacked bars), label units and sources.',
  },
  {
    ...NATIVE,
    name: 'long_document',
    description: 'Documents très longs : lecture par sections, synthèse fidèle.',
    capabilities: ['long contexte', 'sections'],
    triggers: ['tout le document', 'int[ée]gralit', '\\d{3,} pages', 'gros fichier', 'long'],
    required_tools: ['filesystem.read'],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    incompatible_models: ['short-context'],
    cost_profile: 'élevé',
    security_profile: 'lecture seule',
    agents: ['document_analyst'],
    playbook:
      'Read section by section with offsets, keep a running outline with page references, and check coverage before concluding.',
  },
  {
    ...NATIVE,
    name: 'writing',
    description: 'Rédaction professionnelle : mails, notes, synthèses.',
    capabilities: ['ton', 'structure', 'concision'],
    triggers: ['r[ée]dige', '[ée]cris', 'mail', 'lettre', 'note', 'reformule', 'traduis'],
    required_tools: [],
    recommended_models: { metric: 'intelligence', tier: 'cheap' },
    incompatible_models: [],
    cost_profile: 'faible',
    security_profile: 'lecture seule',
    agents: ['reporting'],
    playbook: 'Lead with the purpose, keep one idea per paragraph, and adapt the tone to the recipient.',
  },
];

export interface SkillMatch {
  skill: EngineSkill;
  score: number;
  why: string;
}
export interface SkillSelection {
  selected: SkillMatch[];
  incompatible: { skill: EngineSkill; reason: string }[];
}

/** Why a skill cannot run with this model / these tools (null when compatible). */
export function incompatibility(
  s: EngineSkill,
  ctx: { model?: ModelInfo | null; tools?: string[] | null; contextNeeded?: number },
): string | null {
  const m = ctx.model;
  if (m) {
    if (s.incompatible_models.includes('no-vision') && !m.capabilities.vision)
      return `${m.id} ne lit pas les images`;
    if (s.incompatible_models.includes('no-tools') && !m.capabilities.tools)
      return `${m.id} ne sait pas appeler d’outils`;
    if (s.incompatible_models.includes('short-context') && m.contextLength && m.contextLength < 100_000)
      return `contexte de ${m.id} trop court (${Math.round(m.contextLength / 1000)} k)`;
  }
  if (ctx.tools) {
    const missing = s.required_tools.filter((t) => !ctx.tools!.includes(t));
    if (missing.length) return `outil(s) indisponible(s) : ${missing.join(', ')}`;
  }
  return null;
}

/** Decides which skills a mission needs (and which ones are refused). */
export function selectSkills(
  text: string,
  attachments: string[] = [],
  ctx: { model?: ModelInfo | null; tools?: string[] | null; max?: number } = {},
): SkillSelection {
  const hay = `${text} ${attachments.join(' ')}`;
  const ext = attachments.join(' ').toLowerCase();
  const scored: SkillMatch[] = [];
  for (const s of SKILL_REGISTRY) {
    const hits = s.triggers.filter((t) => new RegExp(t, 'i').test(hay));
    let score = hits.length;
    if (s.name === 'excel_analysis' && /\.(xlsx|xlsm|xlsb|xls|csv|ods)\b/.test(ext)) score += 2;
    if (s.name === 'pdf_extraction' && /\.pdf\b/.test(ext)) score += 2;
    if (s.name === 'ocr_vision' && /\.(png|jpe?g|webp|gif)\b/.test(ext)) score += 2;
    if (score > 0)
      scored.push({
        skill: s,
        score,
        why: `déclencheurs : ${hits.slice(0, 3).join(', ') || 'pièce jointe'}`,
      });
  }
  // Companions of a selected skill come along.
  for (const m of [...scored])
    for (const c of m.skill.companions ?? [])
      if (!scored.some((x) => x.skill.name === c)) {
        const s = SKILL_REGISTRY.find((x) => x.name === c);
        if (s) scored.push({ skill: s, score: 0.5, why: `accompagne ${m.skill.name}` });
      }
  scored.sort((a, b) => b.score - a.score);
  const selected: SkillMatch[] = [];
  const incompatible: SkillSelection['incompatible'] = [];
  for (const m of scored) {
    const why = incompatibility(m.skill, ctx);
    if (why) incompatible.push({ skill: m.skill, reason: why });
    else if (selected.length < (ctx.max ?? 5)) selected.push(m);
  }
  return { selected, incompatible };
}

/** Instructions block for the active skills (method, not marketing). */
export function skillsPrompt(sel: SkillMatch[]): string {
  if (!sel.length) return '';
  return `<engine_skills>\nThe Intelligence Engine activated these methods for this mission — follow them:\n${sel
    .map((m) => `- ${m.skill.name}: ${m.skill.playbook}`)
    .join('\n')}\n</engine_skills>`;
}
