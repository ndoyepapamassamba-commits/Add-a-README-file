import type { RoleId } from '@shared/types';
import type { Tier } from '../llm/router';
import { mapAgentTools } from '../services/skillsCore';
import type { SkillRegistry } from '../services/skills';

export interface RoleProfile {
  id: RoleId;
  label: string;
  description: string;
  tier: Tier;
  tools: string[];
  prompt: string;
}

const FS_READ = [
  'filesystem.list',
  'filesystem.read',
  'filesystem.read_many',
  'filesystem.search',
  'filesystem.glob',
];
const FS_WRITE = [
  'filesystem.write',
  'filesystem.edit',
  'filesystem.multi_edit',
  'filesystem.delete',
  'filesystem.move',
];
const TERM = ['terminal.execute', 'terminal.output', 'terminal.kill', 'code.run'];
const BROWSER = [
  'browser.open',
  'browser.navigate',
  'browser.click',
  'browser.type',
  'browser.press',
  'browser.scroll',
  'browser.back',
  'browser.forward',
  'browser.reload',
  'browser.screenshot',
  'browser.extract',
  'browser.console',
  'browser.download',
];
const BROWSER_READ = [
  'browser.open',
  'browser.navigate',
  'browser.scroll',
  'browser.screenshot',
  'browser.extract',
  'browser.console',
];
const WEB = ['web.search', 'web.fetch'];
const DATA = ['data.inspect', 'data.query', 'data.transform', 'visualization.create'];
const APEX = ['apex.guide', 'apex.reference', 'apex.build_app', 'apex.qa'];
const INTEL = ['decision.simulate', 'info.value', 'knowledge.query', 'manual.add'];
const GIT_READ = ['git.status', 'git.diff', 'git.log'];
const MEMORY = ['memory.read', 'memory.add', 'memory.remove', 'memory.doc'];
const SKILLS = ['skill.use', 'skill.read'];
const COMMON = [
  'plan.update',
  'project.analyze',
  'artifact.create',
  'report.export',
  'jev.judge',
  ...SKILLS,
  ...INTEL,
];

export const ROLES: Record<string, RoleProfile> = {
  general: {
    id: 'general',
    label: 'Agent principal',
    description:
      'Orchestrateur polyvalent : code, terminal, navigateur, données. Peut déléguer à des sous-agents spécialisés.',
    tier: 'balanced',
    tools: [
      ...FS_READ,
      ...FS_WRITE,
      ...TERM,
      ...BROWSER,
      ...WEB,
      ...DATA,
      ...APEX,
      ...GIT_READ,
      'git.commit',
      ...MEMORY,
      ...COMMON,
      'agent.delegate',
    ],
    prompt: `You are the ORCHESTRATOR / MISSION DIRECTOR of MASSAMBA — the best senior engineer, analyst and project director in one. You reach top-tier quality with the cheapest sufficient means.
Method (always): 1. UNDERSTAND the real goal, implicit requirements and success criteria (the Strategy block gives the Task DNA). 2. PLAN with a live checklist; build the recovery plan before executing; parallelise independent reads, keep writes sequential. 3. DECIDE WHO: do simple things yourself; delegate (agent.delegate) only well-scoped sub-tasks where a specialist adds quality, with a complete self-contained brief; arbitrate conflicts on evidence. 4. EXECUTE with tools, never from memory; check impact before changing shared code. 5. VERIFY for real (build/tests, re-computation, browser), then challenge your own result. Plausible ≠ verified. 6. CONTROL budget, steps and permissions; detect drift; escalate only risky or truly blocking points. 7. DELIVER what was done, the evidence, what remains uncertain, the files — and record important decisions in the project memory.`,
  },
  coder: {
    id: 'coder',
    label: 'Codeur',
    description: 'Écrit, corrige et refactore du code ; lance builds et tests.',
    tier: 'balanced',
    tools: [
      ...FS_READ,
      ...FS_WRITE,
      ...TERM,
      ...GIT_READ,
      ...MEMORY,
      ...COMMON,
      ...WEB,
      'browser.open',
      'browser.extract',
      'browser.console',
      'browser.screenshot',
    ],
    prompt:
      'You are a senior software engineer. Make minimal, correct, idiomatic changes that match the surrounding code. Always verify with the project build/tests when they exist.',
  },
  researcher: {
    id: 'researcher',
    label: 'Chercheur',
    description: 'Recherche web, lecture de documentation, synthèse sourcée.',
    tier: 'balanced',
    tools: [...WEB, ...BROWSER_READ, ...FS_READ, 'memory.read', ...COMMON],
    prompt:
      'You are a meticulous researcher. Search, read primary sources, cross-check facts, and answer with citations (URLs). Distinguish facts from assumptions.',
  },
  apex_studio: {
    id: 'apex_studio',
    label: 'APEX Studio',
    description:
      'Applications HTML offline « comme l’APEX » : chargement Excel, dashboard premium, exports Excel / PowerPoint / Word / PDF / mail couleur au style maison.',
    tier: 'powerful',
    tools: [...APEX, ...DATA, ...FS_READ, ...FS_WRITE, 'code.run', 'terminal.execute', ...MEMORY, ...COMMON],
    prompt:
      "You build business applications with the APEX method, for any subject. Workflow: (1) apex.guide, then apex.reference (read the whole reference app, part by part) and the domain references that apply; (2) data.inspect the user's real file to learn its columns — never invent data; (3) write the application script exactly in the reference style: const KIT, toast, tolerant header detection, normalisations, aggregates, a hero specific to the subject, KPI cards, filters applied to views and exports, a written reading, local memory of previous loads, and EVERY export of the house chain (Excel with 3D visuals, PowerPoint, Word, colour mail .eml/.html/rich copy, printable PDF); (4) apex.build_app; (5) apex.qa — fix and rebuild until PASSED; (6) deliver: what the app does, how to use it, what was verified and what the user must still test with a real file. Plain reports still use report.export / data.transform (house style is automatic).",
  },
  adversarial: {
    id: 'adversarial',
    label: 'Red Team',
    description:
      'Cherche activement à réfuter le résultat : recalculs, contre-exemples, scénarios extrêmes, sources.',
    tier: 'powerful',
    tools: [...FS_READ, ...DATA, 'code.run', 'terminal.execute', ...WEB, ...BROWSER_READ, ...COMMON],
    prompt:
      'You are the ADVERSARIAL AGENT / RED TEAM. Try to prove the result is wrong, incomplete or fragile — with evidence, never by inventing defects. Recalculate key figures independently, test counterexamples and extreme parameters, compare sources, check the logic independently of the path that produced it, open the deliverables. Answer: CONFIDENCE: <0-100>% / BLOCKING: … / MINOR: … / COUNTEREXAMPLES: …',
  },
  shadow: {
    id: 'shadow',
    label: 'Shadow Agent',
    description: 'Observateur indépendant : hypothèses fragiles, oublis, dérives. Ne modifie rien.',
    tier: 'balanced',
    tools: [...FS_READ, ...GIT_READ, 'memory.read', ...COMMON],
    prompt:
      'You are the SHADOW AGENT (a deterministic monitor already watches every action; you are called for a deep review). Do NOT modify anything. Review fragile assumptions, omissions, drift from the goal (score 0–100), implicit scope changes, tools misused, a failing strategy being repeated, regression risks. Emit only high-value alerts with a recommended action.',
  },
  compliance: {
    id: 'compliance',
    label: 'Compliance / Policy',
    description:
      'Contrôle les livrables contre un référentiel de règles (BCEAO, IFRS 9, politiques internes…).',
    tier: 'powerful',
    tools: [...FS_READ, ...DATA, ...WEB, ...COMMON],
    prompt:
      'You are the COMPLIANCE / POLICY AGENT. Check the deliverables against the reference rules (regulation such as BCEAO / IFRS 9, internal policies, the Personal Operating Manual, the house style). For each rule: compliant / non-compliant / not verifiable, with exact evidence and the correction needed. Never declare compliance on assumptions.',
  },
  simulation: {
    id: 'simulation',
    label: 'Simulation',
    description: 'Scénarios, stress tests, simulations de décision et contrefactuels.',
    tier: 'powerful',
    tools: [...FS_READ, ...DATA, 'code.run', ...COMMON],
    prompt:
      'You are the SIMULATION AGENT. Build scenarios (optimistic / central / stress / failure), stress tests and decision simulations from real figures (decision.simulate, code.run with pandas / numpy). State every assumption and its source, show sensitivities, and say which conclusion is robust and which is fragile.',
  },
  data_quality: {
    id: 'data_quality',
    label: 'Data Quality',
    description: 'Fiabilité et traçabilité des données : complétude, cohérence, doublons, rapprochements.',
    tier: 'balanced',
    tools: [...FS_READ, ...DATA, 'code.run', ...COMMON],
    prompt:
      'You are the DATA QUALITY AGENT. Focus on reliability and traceability of data: completeness, types, units, duplicates, outliers, referential consistency, reconciliation of totals, freshness. Quantify each issue (rows, amounts at stake), propose cleaning rules, never alter the source file.',
  },
  performance: {
    id: 'performance',
    label: 'Performance',
    description: 'Temps de chargement, mémoire, rendu, appels réseau, coût et latence.',
    tier: 'balanced',
    tools: [...FS_READ, ...TERM, ...BROWSER_READ, ...COMMON],
    prompt:
      'You are the PERFORMANCE AGENT. Measure before optimising (timers, profiles, browser console, bundle sizes, network calls, LLM cost and latency), find the bottlenecks, propose the cheapest effective fixes and measure again to prove the gain.',
  },
  product_ux: {
    id: 'product_ux',
    label: 'Product / UX',
    description: 'Parcours, accessibilité, cohérence visuelle, friction.',
    tier: 'balanced',
    tools: [...FS_READ, ...BROWSER_READ, ...COMMON],
    prompt:
      'You are the PRODUCT / UX AGENT. Evaluate user journeys, accessibility, visual consistency with the house style, mobile layout, friction and wording; try the app like a first-time user in the browser. Give prioritised, concrete improvements (what, where, why, effort).',
  },
  cost_optimizer: {
    id: 'cost_optimizer',
    label: 'Cost Optimizer',
    description: 'Réduit le coût sans baisser la qualité cible.',
    tier: 'fast',
    tools: [...FS_READ, ...COMMON],
    prompt:
      'You are the COST OPTIMIZER. Reduce cost without lowering the target quality: cheapest capable model per sub-task, fewer steps, shorter contexts, deterministic tools for calculations. Quantify savings and the risk on quality.',
  },
  knowledge_curator: {
    id: 'knowledge_curator',
    label: 'Knowledge Curator',
    description: 'Nettoie, déduplique et structure la mémoire projet et le graphe de connaissances.',
    tier: 'fast',
    tools: [...FS_READ, ...FS_WRITE, ...MEMORY, ...COMMON],
    prompt:
      'You are the KNOWLEDGE CURATOR. Keep the project memory (.ai/) and knowledge graph clean: deduplicate, merge, date entries, link decisions to files and missions, archive obsolete items. Never delete information still referenced.',
  },
  workflow_designer: {
    id: 'workflow_designer',
    label: 'Workflow Designer',
    description: 'Transforme les procédures répétitives en workflows réutilisables et testés.',
    tier: 'balanced',
    tools: [...FS_READ, ...FS_WRITE, ...TERM, ...COMMON],
    prompt:
      'You are the WORKFLOW DESIGNER. Turn a repetitive procedure into a reusable workflow (inputs, steps, checks, outputs, failure handling), as a script when deterministic; test it once on real inputs and document how to run it.',
  },
  release_manager: {
    id: 'release_manager',
    label: 'Release Manager',
    description: 'Versions, changelog, tests de release, plan de retour arrière.',
    tier: 'balanced',
    tools: [...FS_READ, ...TERM, ...GIT_READ, ...MEMORY, ...COMMON],
    prompt:
      'You are the RELEASE MANAGER. Prepare a release: functional changes in plain language (git diff), changelog, release checklist with the tests run and their results, known issues, rollback plan. Block the release if a critical check fails.',
  },
  observability: {
    id: 'observability',
    label: 'Observability',
    description: 'Logs, traces, métriques, incidents : causes racines.',
    tier: 'powerful',
    tools: [...FS_READ, ...TERM, 'browser.console', ...COMMON],
    prompt:
      'You are the OBSERVABILITY AGENT. Analyse logs, console errors, traces, metrics and incidents; build a timeline, correlate events, find the root cause with evidence, and propose the fix plus the monitoring that would have detected it earlier.',
  },
  browser: {
    id: 'browser',
    label: 'Browser Agent',
    description: 'Pilote le navigateur : navigation, formulaires, extraction, captures, téléchargements.',
    tier: 'balanced',
    tools: [...BROWSER, ...WEB, ...FS_READ, ...COMMON],
    prompt:
      'You operate a real browser the user watches live. Work in explicit cycles — ACTION → OBSERVATION (read the returned snapshot, console errors, failed requests) → DECISION → RESULT — and verify the result after each action. Never enter credentials the user did not explicitly provide for this task. Stop and ask before purchases, irreversible submissions or anything with legal/financial effect.',
  },
  data_analyst: {
    id: 'data_analyst',
    label: 'Analyste de données',
    description: 'Analyse CSV/XLSX/JSON : profilage, anomalies, agrégations, graphiques, rapports.',
    tier: 'balanced',
    tools: [
      ...DATA,
      ...APEX,
      ...FS_READ,
      ...FS_WRITE,
      'code.run',
      'terminal.execute',
      ...COMMON,
      'memory.read',
      'memory.add',
      'web.search',
    ],
    prompt:
      'You are a senior data analyst. Inspect before concluding, quantify everything from the actual data (never invent numbers), flag data-quality issues, and visualise key findings with visualization.create. Present clear KPIs and actionable insights.',
  },
  reviewer: {
    id: 'reviewer',
    label: 'Relecteur',
    description: 'Revue critique : bugs, régressions, sécurité, tests manquants. Ne modifie rien.',
    tier: 'reasoning',
    tools: [
      ...FS_READ,
      ...GIT_READ,
      'terminal.execute',
      'project.analyze',
      'memory.read',
      'browser.console',
      'plan.update',
      ...SKILLS,
    ],
    prompt:
      'You are a demanding code reviewer. Do NOT modify files. Find real defects: correctness bugs, regressions, security issues (secrets, injection, path traversal, XSS), missing error handling and missing tests. Run the tests/build if available. Report findings ranked by severity with file:line and a concrete fix for each. If everything is fine, say so explicitly.',
  },
  tester: {
    id: 'tester',
    label: 'Testeur',
    description: 'Écrit et exécute des tests (unitaires, intégration, navigateur), rapporte les échecs.',
    tier: 'balanced',
    tools: [...FS_READ, ...FS_WRITE, ...TERM, ...BROWSER, ...GIT_READ, ...COMMON],
    prompt:
      'You are a QA engineer. Write focused tests for the behaviour in question, run them, and report exact pass/fail results with output. Fix test code, not product code, unless asked.',
  },
  architect: {
    id: 'architect',
    label: 'Architect',
    description:
      'Conçoit la solution : structure, choix techniques, découpage en étapes, risques. Documente dans .ai/.',
    tier: 'reasoning',
    tools: [...FS_READ, ...GIT_READ, ...WEB, 'memory.read', 'memory.doc', 'terminal.execute', ...COMMON],
    prompt:
      'You are a software architect. Understand the existing system before proposing anything. Produce a concrete, minimal design: components, data flow, files to create/modify, interfaces, risks and a step-by-step implementation plan with verification for each step. Record key decisions in .ai/DECISIONS.md and the design in .ai/ARCHITECTURE.md (memory.doc). Do not write product code.',
  },
  qa_engineer: {
    id: 'qa_engineer',
    label: 'QA Engineer',
    description:
      'Vérifie pour de vrai : tests, build, navigateur, régressions ; rend un verdict PASSED / PARTIAL / FAILED.',
    tier: 'balanced',
    tools: [
      ...FS_READ,
      ...FS_WRITE,
      ...TERM,
      ...BROWSER,
      ...GIT_READ,
      'memory.read',
      'memory.doc',
      ...COMMON,
    ],
    prompt:
      'You are a QA engineer. Verify behaviour with real evidence: run the test suite, build, linters, exercise the app in the browser (check console errors and failed requests), and look for regressions in previously working features. Report each check with PASS/FAIL and the exact output, record the results in .ai/TESTS.md, and end with a verdict: PASSED, PARTIAL or FAILED. Fix tests only when the test itself is wrong.',
  },
  security_reviewer: {
    id: 'security_reviewer',
    label: 'Security Reviewer',
    description:
      'Audit de sécurité : secrets, injections, XSS, chemins, dépendances, permissions. Ne modifie rien.',
    tier: 'reasoning',
    tools: [
      ...FS_READ,
      ...GIT_READ,
      'terminal.execute',
      'project.analyze',
      'memory.read',
      'plan.update',
      ...SKILLS,
    ],
    prompt:
      'You are an application security reviewer. Do NOT modify files. Look for exposed secrets, injection (SQL, command, template), XSS, path traversal, SSRF, insecure CORS/auth, unsafe deserialization, vulnerable dependencies (npm audit when available) and missing input validation. Report findings by severity (critical/high/medium/low) with file:line, impact and a concrete fix.',
  },
  document_analyst: {
    id: 'document_analyst',
    label: 'Document Analyst',
    description:
      'Lit et analyse PDF, Word, PowerPoint, Excel : extraction, synthèse, points clés, incohérences.',
    tier: 'balanced',
    tools: [...FS_READ, ...DATA, 'web.search', 'memory.read', ...COMMON],
    prompt:
      'You are a document analyst. Read the documents fully (filesystem.read extracts PDF/Word/PowerPoint text; data.inspect for spreadsheets). Extract facts, figures, obligations, dates and risks with exact references (page/section). Flag inconsistencies between documents. Never invent content that is not in the sources.',
  },
  reporting: {
    id: 'reporting',
    label: 'Reporting Agent',
    description:
      'Produit des livrables professionnels : rapports, synthèses, tableaux, Word / PDF / Excel / Markdown.',
    tier: 'balanced',
    tools: [...FS_READ, ...FS_WRITE, ...DATA, 'web.search', 'memory.read', ...COMMON],
    prompt:
      'You are a reporting specialist. Turn verified results into clear, well-structured deliverables for decision makers: executive summary, key figures (only from tool results), charts (visualization.create), findings, recommendations. Write the report in Markdown, then export it with report.export (docx, pdf, html). Name files explicitly and list them at the end.',
  },
  final_reviewer: {
    id: 'final_reviewer',
    label: 'Final Reviewer',
    description: 'Contrôle final indépendant avant livraison : le résultat répond-il vraiment à la demande ?',
    tier: 'reasoning',
    tools: [
      ...FS_READ,
      ...GIT_READ,
      'terminal.execute',
      'browser.open',
      'browser.extract',
      'browser.console',
      'browser.screenshot',
      'data.inspect',
      'data.query',
      'memory.read',
      'plan.update',
      ...SKILLS,
    ],
    prompt:
      'You are the final reviewer. Do NOT modify files. Independently check that the deliverables satisfy the original request: re-run key checks, open outputs, recompute important figures. Start your answer with "VERDICT: APPROVED" or "VERDICT: CHANGES_REQUIRED", then list blocking problems only (with file paths).',
  },
};

export const ROLE_LIST = Object.values(ROLES);

export interface ResolvedRole extends RoleProfile {
  custom: boolean;
  /** Raw tool list of a custom agent (null = unrestricted), used for plugin tools. */
  toolPatterns: string[] | null;
  model: string | null;
  effort: string | null;
  skills: string[];
}

const CLAUDE_MODEL_ALIASES: Record<string, Tier> = { haiku: 'fast', sonnet: 'balanced', opus: 'powerful' };

/** Model preference of a custom agent: an OpenRouter id, or a Claude alias mapped to an AUTO tier. */
export function agentModelPreference(model: string | null): { id?: string; tier?: Tier } {
  if (!model || model === 'inherit' || model === 'auto') return {};
  if (model.includes('/')) return { id: model };
  const tier = CLAUDE_MODEL_ALIASES[model.toLowerCase()];
  return tier ? { tier } : {};
}

/** Built-in role or custom agent (markdown file) → executable profile. */
export async function resolveRole(
  id: RoleId,
  registry: SkillRegistry,
  knownTools: Set<string>,
): Promise<ResolvedRole> {
  const builtin = ROLES[id];
  if (builtin)
    return {
      ...builtin,
      custom: false,
      toolPatterns: builtin.id === 'reviewer' ? [] : null,
      model: null,
      effort: null,
      skills: [],
    };
  const agent = await registry.getAgent(id);
  if (!agent)
    return { ...ROLES.general!, custom: false, toolPatterns: null, model: null, effort: null, skills: [] };
  const base = ROLES.general!.tools.filter((t) => t !== 'agent.delegate');
  const tools = agent.tools?.length ? mapAgentTools(agent.tools, knownTools) : base;
  return {
    id: agent.id,
    label: agent.name,
    description: agent.description,
    tier: agentModelPreference(agent.model).tier ?? 'balanced',
    tools: [...new Set([...tools, 'plan.update', ...SKILLS])],
    prompt: `You are the custom agent "${agent.name}". The instructions below define your role, method and output format. Follow them strictly for every answer.\n\n<agent_instructions>\n${agent.prompt}\n</agent_instructions>`,
    custom: true,
    toolPatterns: agent.tools?.length ? agent.tools : null,
    model: agent.model,
    effort: agent.effort,
    skills: agent.skills,
  };
}
