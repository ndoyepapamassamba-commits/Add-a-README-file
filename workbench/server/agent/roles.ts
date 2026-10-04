import type { RoleId } from '@shared/types';
import type { Tier } from '../llm/router';

export interface RoleProfile {
  id: RoleId;
  label: string;
  description: string;
  tier: Tier;
  tools: string[];
  prompt: string;
}

const FS_READ = ['filesystem.list', 'filesystem.read', 'filesystem.read_many', 'filesystem.search', 'filesystem.glob'];
const FS_WRITE = ['filesystem.write', 'filesystem.edit', 'filesystem.multi_edit', 'filesystem.delete', 'filesystem.move'];
const TERM = ['terminal.execute', 'terminal.output', 'terminal.kill', 'code.run'];
const BROWSER = ['browser.open', 'browser.navigate', 'browser.click', 'browser.type', 'browser.press', 'browser.scroll', 'browser.back', 'browser.forward', 'browser.reload', 'browser.screenshot', 'browser.extract', 'browser.console', 'browser.download'];
const BROWSER_READ = ['browser.open', 'browser.navigate', 'browser.scroll', 'browser.screenshot', 'browser.extract', 'browser.console'];
const WEB = ['web.search', 'web.fetch'];
const DATA = ['data.inspect', 'data.query', 'data.transform', 'visualization.create'];
const GIT_READ = ['git.status', 'git.diff', 'git.log'];
const MEMORY = ['memory.read', 'memory.add', 'memory.remove'];
const COMMON = ['plan.update', 'project.analyze', 'artifact.create'];

export const ROLES: Record<RoleId, RoleProfile> = {
  general: {
    id: 'general',
    label: 'Agent principal',
    description: "Orchestrateur polyvalent : code, terminal, navigateur, données. Peut déléguer à des sous-agents spécialisés.",
    tier: 'balanced',
    tools: [...FS_READ, ...FS_WRITE, ...TERM, ...BROWSER, ...WEB, ...DATA, ...GIT_READ, 'git.commit', ...MEMORY, ...COMMON, 'agent.delegate'],
    prompt: 'You are the lead engineering agent. Handle the task end-to-end yourself; delegate only well-scoped, independent sub-tasks (research, review, testing) when it clearly helps.',
  },
  coder: {
    id: 'coder',
    label: 'Codeur',
    description: 'Écrit, corrige et refactore du code ; lance builds et tests.',
    tier: 'balanced',
    tools: [...FS_READ, ...FS_WRITE, ...TERM, ...GIT_READ, ...MEMORY, ...COMMON, ...WEB, 'browser.open', 'browser.extract', 'browser.console', 'browser.screenshot'],
    prompt: 'You are a senior software engineer. Make minimal, correct, idiomatic changes that match the surrounding code. Always verify with the project build/tests when they exist.',
  },
  researcher: {
    id: 'researcher',
    label: 'Chercheur',
    description: 'Recherche web, lecture de documentation, synthèse sourcée.',
    tier: 'balanced',
    tools: [...WEB, ...BROWSER_READ, ...FS_READ, 'memory.read', ...COMMON],
    prompt: 'You are a meticulous researcher. Search, read primary sources, cross-check facts, and answer with citations (URLs). Distinguish facts from assumptions.',
  },
  browser: {
    id: 'browser',
    label: 'Agent navigateur',
    description: 'Pilote le navigateur : navigation, formulaires, extraction, captures, téléchargements.',
    tier: 'balanced',
    tools: [...BROWSER, ...WEB, ...FS_READ, ...COMMON],
    prompt:
      'You operate a real browser the user watches live. Work step by step: open, read the snapshot, act on element refs, verify the result after each action. Never enter credentials the user did not explicitly provide for this task. Stop and ask before purchases, irreversible submissions or anything with legal/financial effect.',
  },
  data_analyst: {
    id: 'data_analyst',
    label: 'Analyste de données',
    description: 'Analyse CSV/XLSX/JSON : profilage, anomalies, agrégations, graphiques, rapports.',
    tier: 'balanced',
    tools: [...DATA, ...FS_READ, ...FS_WRITE, 'code.run', 'terminal.execute', ...COMMON, 'memory.read', 'memory.add', 'web.search'],
    prompt:
      'You are a senior data analyst. Inspect before concluding, quantify everything from the actual data (never invent numbers), flag data-quality issues, and visualise key findings with visualization.create. Present clear KPIs and actionable insights.',
  },
  reviewer: {
    id: 'reviewer',
    label: 'Relecteur',
    description: 'Revue critique : bugs, régressions, sécurité, tests manquants. Ne modifie rien.',
    tier: 'reasoning',
    tools: [...FS_READ, ...GIT_READ, 'terminal.execute', 'project.analyze', 'memory.read', 'browser.console', 'plan.update'],
    prompt:
      'You are a demanding code reviewer. Do NOT modify files. Find real defects: correctness bugs, regressions, security issues (secrets, injection, path traversal, XSS), missing error handling and missing tests. Run the tests/build if available. Report findings ranked by severity with file:line and a concrete fix for each. If everything is fine, say so explicitly.',
  },
  tester: {
    id: 'tester',
    label: 'Testeur',
    description: 'Écrit et exécute des tests (unitaires, intégration, navigateur), rapporte les échecs.',
    tier: 'balanced',
    tools: [...FS_READ, ...FS_WRITE, ...TERM, ...BROWSER, ...GIT_READ, ...COMMON],
    prompt: 'You are a QA engineer. Write focused tests for the behaviour in question, run them, and report exact pass/fail results with output. Fix test code, not product code, unless asked.',
  },
};

export const ROLE_LIST = Object.values(ROLES);
