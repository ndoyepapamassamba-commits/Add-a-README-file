// JEV Tool / Skill / MCP selector: never expose 50 tools when 6 are needed.
// The pack holds the core read tools + the tools of the task type + the tools
// required by the active skills. A meta tool (tools.request) lets the model ask
// for another family, and a call to an allowed tool outside the pack adds it
// (JEV « ADD TOOL ») — the pack can grow, never block.
import type { TaskType } from '../llm/routing';

export type JevMode = 'eco' | 'balanced' | 'performance' | 'max';

export const TOOL_FAMILIES: Record<string, string[]> = {
  read: ['filesystem.list', 'filesystem.read', 'filesystem.search'],
  write: ['filesystem.write', 'filesystem.edit', 'filesystem.delete'],
  data: ['data.inspect', 'data.query', 'data.chart', 'data.export'],
  code: ['code.run', 'terminal.execute', 'project.impact', 'project.twin', 'regression.run'],
  web: ['web.search', 'wikipedia.search', 'papers.search'],
  browser: [
    'browser.open',
    'browser.snapshot',
    'browser.click',
    'browser.type',
    'browser.select',
    'browser.upload',
    'browser.scroll',
    'browser.back',
    'browser.console',
  ],
  deliver: ['report.export', 'artifact.create'],
  decide: ['decision.simulate', 'info.value', 'knowledge.query'],
  plan: ['plan.update'],
  memory: ['memory.doc', 'manual.add'],
  history: ['timemachine.list', 'timemachine.diff', 'timemachine.restore'],
  apex: ['apex.guide', 'apex.reference', 'apex.build_app', 'apex.qa'],
  finance: ['fx.rates', 'worldbank.indicator'],
  visual: ['diagram.render', 'image.generate', 'blender.scene'],
  geo: ['geo.search', 'weather.forecast', 'holidays.list', 'crypto.price'],
};

const BY_TYPE: Record<TaskType, string[]> = {
  chat: ['read'],
  writing: ['read', 'deliver', 'write'],
  data: ['read', 'data', 'deliver', 'decide', 'code', 'write'],
  code: ['read', 'write', 'code', 'deliver', 'plan', 'browser'],
  research: ['read', 'web', 'deliver'],
  browser: ['read', 'browser', 'code', 'write'],
  document: ['read', 'deliver', 'data', 'write'],
  review: ['read', 'code', 'deliver'],
  vision: ['read', 'deliver'],
};

const KEYWORD_FAMILIES: [RegExp, string][] = [
  [/\b(apex|dashboard|tableau de bord|cockpit|reporting|application html)\b/i, 'apex'],
  [/\b(taux de change|xof|fcfa|devise|inflation|pib|gdp|banque mondiale)\b/i, 'finance'],
  [/\b(diagramme|sch[ée]ma|image|logo|illustration|3d|blender|sc[èe]ne)\b/i, 'visual'],
  [/\b(m[ée]t[ée]o|jours? f[ée]ri[ée]s?|adresse|g[ée]ocod|crypto|bitcoin)\b/i, 'geo'],
  [/\b(restaure|annule|version pr[ée]c[ée]dente|time ?machine|rollback)\b/i, 'history'],
  [/\b(m[ée]morise|souviens|retiens|r[èe]gle|toujours|jamais)\b/i, 'memory'],
  [/\b(web|internet|recherche|sources?|actualit)\b/i, 'web'],
  [/\b(ex[ée]cute|lance|terminal|commande|node|python|script)\b/i, 'code'],
  [
    /\b(cr[ée]e|[ée]cris|enregistre|sauvegarde|modifie|g[ée]n[èe]re) (un|le|la|les|ce|des)? ?(fichier|document|rapport|note)/i,
    'write',
  ],
  [/\b(simul|sc[ée]nario|what if|si .* alors)\b/i, 'decide'],
];

export interface ToolPack {
  names: string[];
  families: string[];
  reasons: string[];
  /** Tools that would have been exposed without JEV. */
  baseline: number;
}

/**
 * Builds the tool pack. `available` = every tool the agent / mode allows (the
 * pack is always a subset of it, so permissions are unchanged).
 */
export function compileToolPack(o: {
  type: TaskType;
  text: string;
  available: string[];
  skillTools?: string[];
  mission?: boolean;
  mode: JevMode;
  mcpTools?: string[];
  team?: string[];
}): ToolPack {
  if (o.mode === 'max')
    return {
      names: [...o.available],
      families: ['all'],
      reasons: ['mode MAX : tous les outils'],
      baseline: o.available.length,
    };
  const fam = new Set<string>(BY_TYPE[o.type] ?? ['read']);
  const reasons = [`type ${o.type} → ${[...fam].join(', ')}`];
  for (const [rx, f] of KEYWORD_FAMILIES)
    if (rx.test(o.text) && !fam.has(f)) {
      fam.add(f);
      reasons.push(`mot-clé → ${f}`);
    }
  if (o.team?.includes('apex_studio')) fam.add('apex');
  if (o.mission || o.mode === 'performance') {
    fam.add('plan');
    fam.add('memory');
  }
  const names = new Set<string>();
  for (const f of fam) for (const t of TOOL_FAMILIES[f] ?? []) names.add(t);
  for (const t of o.skillTools ?? []) names.add(t);
  // Always: mission protocol, delegation, skills, the tool-request meta tool.
  for (const t of o.available)
    if (/^(mission\.|agent\.delegate$|skill\.|tools\.request$|plan\.propose$)/.test(t)) names.add(t);
  for (const t of o.mcpTools ?? []) names.add(t);
  const allowed = new Set(o.available);
  const out = [...names].filter((n) => allowed.has(n));
  return { names: out, families: [...fam], reasons, baseline: o.available.length };
}

/** Families the model can request through tools.request. */
export const REQUESTABLE = Object.keys(TOOL_FAMILIES);

/** Tokens taken by tool definitions (what is really sent with each call). */
export const toolDefTokens = (defs: unknown[]) => Math.ceil(JSON.stringify(defs).length / 3.8);
