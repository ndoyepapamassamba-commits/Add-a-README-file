// Automatic inventory of the running application, compared with the baseline
// captured before the JEV integration (inventoryBaseline.json) → REGRESSION REPORT.
import baseline from './inventoryBaseline.json';
import { TOOLS } from './tools';
import { BUILTIN_PLUGINS } from './builtinPlugins';
import { BUILTIN_AGENTS, LEGACY_ROLES } from './roles';
import { MCP_PRESETS } from './mcp';
import { NAV_ITEMS } from './nav';
import { DEFAULT_SETTINGS, useStore } from './store';
import { SKILL_REGISTRY } from '../../server/engine/skills';

export type Inventory = Record<
  'tools' | 'pluginTools' | 'agents' | 'views' | 'mcpPresets' | 'engineSkills' | 'settings' | 'storeKeys',
  string[]
>;

export function inventory(): Inventory {
  return {
    tools: TOOLS.map((t) => t.name).sort(),
    pluginTools: BUILTIN_PLUGINS.flatMap((p) => p.tools.map((t) => t.name)).sort(),
    // Omnipotent is the only agent; the former agents stay as internal roles — nothing may disappear from the inventory.
    agents: [...BUILTIN_AGENTS, ...LEGACY_ROLES].map((a) => a.id).sort(),
    views: NAV_ITEMS.map((n) => n.id).sort(),
    mcpPresets: MCP_PRESETS.map((m) => m.name).sort(),
    engineSkills: SKILL_REGISTRY.map((s) => s.name).sort(),
    settings: Object.keys(DEFAULT_SETTINGS).sort(),
    storeKeys: Object.keys(useStore.getState()).sort(),
  };
}

export interface RegressionReport {
  capturedAt: string;
  ok: boolean;
  sections: { name: keyof Inventory; before: number; after: number; missing: string[]; added: string[] }[];
}

export function regressionReport(now: Inventory = inventory()): RegressionReport {
  const b = baseline as unknown as Inventory & { capturedAt: string };
  const sections = (Object.keys(now) as (keyof Inventory)[]).map((name) => {
    const before = new Set(b[name] ?? []);
    const after = new Set(now[name]);
    return {
      name,
      before: before.size,
      after: after.size,
      missing: [...before].filter((x) => !after.has(x)),
      added: [...after].filter((x) => !before.has(x)),
    };
  });
  return { capturedAt: b.capturedAt, ok: sections.every((s) => !s.missing.length), sections };
}
