import type { AgentDef } from './types';

const READ = [
  'filesystem.list',
  'filesystem.read',
  'filesystem.search',
  'data.inspect',
  'data.query',
  'skill.use',
  'skill.read',
  'plan.update',
];
const WRITE = ['filesystem.write', 'filesystem.edit', 'filesystem.delete', 'artifact.create'];

/** Built-in agents (Claude Code style). Custom agents are added by the user. */
export const BUILTIN_AGENTS: AgentDef[] = [
  {
    id: 'general',
    name: 'Agent principal',
    description: 'Polyvalent : code, recherche, données, documents.',
    prompt:
      'You are the main agent. Pick the right tools, delegate to a specialist when it clearly helps, and deliver complete, verified results.',
    tools: null,
    model: null,
    effort: null,
    skills: [],
    builtin: true,
  },
  {
    id: 'coder',
    name: 'Codeur',
    description: 'Écrit, modifie et teste du code dans l’espace de travail.',
    prompt:
      'You are a senior software engineer. Read the relevant files before changing them, make focused edits with filesystem.edit, keep the existing style, and run code with code.run to verify when possible. Deliver working, complete code — never placeholders.',
    tools: [...READ, ...WRITE, 'code.run', 'web.search', 'agent.delegate'],
    model: null,
    effort: null,
    skills: [],
    builtin: true,
  },
  {
    id: 'researcher',
    name: 'Chercheur',
    description: 'Recherche sur le web et synthétise avec sources.',
    prompt:
      'You are a meticulous researcher. Search the web, cross-check several sources, and answer with a clear synthesis and cited links. Say when information is uncertain or dated.',
    tools: [...READ, 'web.search', 'artifact.create'],
    model: null,
    effort: null,
    skills: [],
    builtin: true,
  },
  {
    id: 'data_analyst',
    name: 'Analyste de données',
    description: 'Analyse CSV / Excel / JSON, graphiques, anomalies.',
    prompt:
      'You are a data analyst. Always start with data.inspect, then use data.query for exact figures and data.chart for visuals. Never invent numbers: every figure must come from a tool result. Point out data-quality issues and give actionable insights.',
    tools: [...READ, 'data.chart', 'code.run', 'artifact.create', 'filesystem.write'],
    model: null,
    effort: null,
    skills: [],
    builtin: true,
  },
  {
    id: 'writer',
    name: 'Rédacteur',
    description: 'Rapports, emails, notes, présentations en Markdown.',
    prompt:
      'You are a professional writer. Produce clear, well-structured documents adapted to the audience. Save long deliverables as files or artifacts so the user can download them.',
    tools: [...READ, 'filesystem.write', 'artifact.create', 'web.search'],
    model: null,
    effort: null,
    skills: [],
    builtin: true,
  },
  {
    id: 'reviewer',
    name: 'Relecteur',
    description: 'Relit le travail : bugs, risques, qualité (lecture seule).',
    prompt:
      'You are a demanding reviewer. Inspect the work (files, results) without modifying anything. Report concrete problems ranked by severity with exact locations and suggested fixes, then a short verdict.',
    tools: [...READ, 'code.run'],
    model: null,
    effort: 'high',
    skills: [],
    builtin: true,
  },
];

export function allAgents(custom: AgentDef[]): AgentDef[] {
  return [...BUILTIN_AGENTS, ...custom];
}

export function findAgent(id: string, custom: AgentDef[]): AgentDef {
  return allAgents(custom).find((a) => a.id === id) ?? BUILTIN_AGENTS[0]!;
}
