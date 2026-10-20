// Agent Enhancement Engine: an agent is no longer "a prompt + fixed tools" but
// a loadout chosen per mission — compatible skills, available MCP servers,
// tools, recommended model + fallback and a QA strategy. Agent / model
// co-design: the best model depends on the agent's job (coding, research,
// data, browser…), never one "best model" for everything.
import type { ModelInfo } from '@shared/types';
import type { AutoTiers } from '../services/settings';
import { analyzeTask, type HealthMap, type LeaderboardMap } from '../llm/routing';
import { taskDna } from '../agent/intelligence';
import { MCP_CATALOG, mcpRegistry, type McpCategory, type McpEntry } from './capabilities';
import { decideRoute, type EngineSettings, type ScoredCandidate } from './decision';
import { SKILL_REGISTRY, selectSkills, type SkillSelection } from './skills';

/** Which MCP categories a skill can use. */
export const SKILL_MCP: Record<string, McpCategory[]> = {
  data_analysis: ['DATA', 'SQL'],
  excel_analysis: ['EXCEL'],
  statistical_analysis: ['DATA'],
  risk_analysis: ['FINANCE', 'DATA'],
  document_reporting: ['DOCUMENTS'],
  pdf_extraction: ['PDF', 'DOCUMENTS'],
  web_research: ['SEARCH', 'WEB', 'RESEARCH'],
  browser_automation: ['BROWSER'],
  code_generation: ['CODING'],
  testing: ['CODING'],
  security_audit: ['SECURITY'],
  visualization: ['VISUALIZATION'],
  long_document: ['DOCUMENTS'],
};

/** MCP entries that may be proposed: never one the registry flags « À ÉVITER » (archived, abandoned, risky). */
let safeCache: { at: number; list: McpEntry[] } | null = null;
export function safeMcp(): McpEntry[] {
  if (!safeCache || Date.now() - safeCache.at > 3_600_000) {
    const views = mcpRegistry();
    const rank = (id: string) => {
      const v = views.find((x) => x.id === id);
      return v?.status === 'RECOMMANDÉ'
        ? 0
        : v?.status === 'ACCEPTABLE'
          ? 1
          : v?.status === 'SERVICE HÉBERGÉ'
            ? 2
            : 3;
    };
    safeCache = {
      at: Date.now(),
      list: MCP_CATALOG.filter((e) => views.find((v) => v.id === e.id)?.status !== 'À ÉVITER').sort(
        (a, b) => rank(a.id) - rank(b.id),
      ),
    };
  }
  return safeCache.list;
}

export const QA_STRATEGY: Record<string, string> = {
  data: 'recalcul des totaux par deux méthodes + contrôle des chiffres sans preuve',
  code: 'exécution réelle, tests, suite de régression, revue de sécurité si critique',
  research: 'deux sources indépendantes par fait clé, dates et liens',
  browser: 'snapshot avant/après chaque action, vérification des téléchargements',
  document: 'citation de la page pour chaque élément extrait',
  review: 'constats classés par sévérité avec preuve',
  writing: 'relecture du ton et des chiffres cités',
  vision: 'transcription exacte, zones illisibles signalées',
  chat: 'réponse directe',
};

export interface Loadout {
  agent: string;
  agentWhy: string;
  team: string[];
  skills: string[];
  skillsWhy: string;
  incompatibleSkills: { name: string; reason: string }[];
  mcp: string[];
  mcpSuggested: string[];
  mcpWhy: string;
  tools: string[];
  qa: string;
}

export function buildLoadout(o: {
  agentId: string;
  agentLabel?: string;
  team: string[];
  type: string;
  selection: SkillSelection;
  /** Names of the MCP servers connected right now. */
  mcpConnected: string[];
  tools: string[];
}): Loadout {
  const cats = new Set(o.selection.selected.flatMap((m) => SKILL_MCP[m.skill.name] ?? []));
  const relevant = safeMcp().filter((e) => e.categories.some((c) => cats.has(c)));
  const connected = relevant.filter((e) =>
    o.mcpConnected.some((n) => n === e.preset || n === e.id || n === e.name),
  );
  const suggested = relevant.filter((e) => !connected.includes(e)).slice(0, 3);
  const skills = o.selection.selected.map((m) => m.skill.name);
  return {
    agent: o.agentId,
    agentWhy: `${o.agentLabel ?? o.agentId} dirige la mission${o.team.length ? ` ; spécialistes recommandés pour une tâche ${o.type} : ${o.team.join(' → ')}` : ' seul (tâche simple : pas de délégation, moins de coût)'}.`,
    team: o.team,
    skills,
    skillsWhy: skills.length
      ? o.selection.selected.map((m) => `${m.skill.name} (${m.why})`).join(' ; ')
      : 'aucun skill nécessaire',
    incompatibleSkills: o.selection.incompatible.map((i) => ({ name: i.skill.name, reason: i.reason })),
    mcp: connected.map((e) => e.name),
    mcpSuggested: suggested.map((e) => e.name),
    mcpWhy: connected.length
      ? `MCP connectés utiles : ${connected.map((e) => e.name).join(', ')}`
      : cats.size
        ? `aucun MCP connecté nécessaire : les outils natifs couvrent ${[...cats].join(', ')}${suggested.length ? ` (option : ${suggested.map((e) => e.name).join(', ')})` : ''}`
        : 'aucun MCP nécessaire',
    tools: o.tools,
    qa: QA_STRATEGY[o.type] ?? QA_STRATEGY.chat!,
  };
}

/** Agent × model co-design: best model + skill + MCP + toolchain per kind of work. */
export const CODESIGN_JOBS: {
  key: string;
  label: string;
  agent: string;
  text: string;
  attachments?: string[];
  mission?: boolean;
}[] = [
  {
    key: 'coding',
    label: 'CODE',
    agent: 'coder',
    text: 'Corrige ce bug et refactorise la fonction, avec tests',
    mission: true,
  },
  {
    key: 'research',
    label: 'RECHERCHE',
    agent: 'researcher',
    text: 'Recherche les sources récentes sur le web et compare-les',
  },
  {
    key: 'data',
    label: 'DONNÉES',
    agent: 'data_analyst',
    text: 'Analyse ce fichier Excel et calcule les totaux par agence',
    attachments: ['portefeuille.xlsx'],
  },
  {
    key: 'browser',
    label: 'NAVIGATEUR',
    agent: 'browser',
    text: 'Ouvre le site, clique et remplis le formulaire',
  },
  {
    key: 'documents',
    label: 'DOCUMENTS',
    agent: 'document_analyst',
    text: 'Extrais les clauses de ce contrat PDF',
    attachments: ['contrat.pdf'],
  },
  {
    key: 'reasoning',
    label: 'RAISONNEMENT',
    agent: 'architect',
    text: 'Stratégie complète et architecture de la solution, analyse des risques',
    mission: true,
  },
  {
    key: 'long',
    label: 'LONG CONTEXTE',
    agent: 'document_analyst',
    text: 'Lis l’intégralité de ces documents et synthétise',
    attachments: ['a.pdf', 'b.pdf', 'c.pdf'],
  },
  {
    key: 'agentic',
    label: 'AGENTIQUE',
    agent: 'general',
    text: 'Automatise ce processus de bout en bout dans le navigateur',
    mission: true,
  },
  { key: 'volume', label: 'GROS VOLUME PAS CHER', agent: 'reporting', text: 'traduis bonjour en anglais' },
  {
    key: 'critical',
    label: 'CRITIQUE',
    agent: 'data_analyst',
    text: 'Analyse IFRS9 du portefeuille pour le COMEX : provisions, NPL, stages',
    attachments: ['portefeuille.xlsb'],
    mission: true,
  },
];

export interface CodesignRow {
  key: string;
  label: string;
  agent: string;
  model: ScoredCandidate | null;
  fallback: ScoredCandidate | null;
  skills: string[];
  mcp: string[];
  tools: string[];
  qa: string;
}

export function codesign(
  models: ModelInfo[],
  tiers: AutoTiers,
  o: { health?: HealthMap; board?: LeaderboardMap; settings?: Partial<EngineSettings> } = {},
): CodesignRow[] {
  return CODESIGN_JOBS.map((j) => {
    const p = analyzeTask({ text: j.text, attachmentNames: j.attachments, mission: j.mission });
    const dna = taskDna(j.text, j.attachments ?? [], p);
    if (dna.criticality === 'critical' && p.tier !== 'maximum' && p.tier !== 'quality') p.tier = 'quality';
    const d = decideRoute({
      models,
      tiers,
      profile: p,
      dna,
      text: j.text,
      health: o.health,
      board: o.board,
      settings: o.settings,
      mission: j.mission,
    });
    const sel = selectSkills(j.text, j.attachments ?? [], {
      model: models.find((m) => m.id === d.chosen?.id),
    });
    const skills = sel.selected.map((m) => m.skill.name);
    const cats = new Set(skills.flatMap((s) => SKILL_MCP[s] ?? []));
    return {
      key: j.key,
      label: j.label,
      agent: j.agent,
      model: d.chosen,
      fallback: d.fallbacks[0] ?? null,
      skills,
      mcp: safeMcp()
        .filter((e) => e.categories.some((c) => cats.has(c)))
        .slice(0, 2)
        .map((e) => e.name),
      tools: [...new Set(sel.selected.flatMap((m) => m.skill.required_tools))].slice(0, 6),
      qa: QA_STRATEGY[p.type] ?? '',
    };
  });
}

export const SKILL_NAMES = SKILL_REGISTRY.map((s) => s.name);
