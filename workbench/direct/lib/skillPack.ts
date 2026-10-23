// THE SKILL PACK (23/10/2026, « lui donner tous les skills de cette discussion ») : every skill, slash command and
// agent of the agent environment travels next to the app in massamba-skills.js (and -2, -3… when it is split), built
// by scripts/skills_pack.mjs and never committed (the repository is public; some skills belong to the user's
// organisation). Loaded in the background after start-up with a script tag (works from a file opened on disk);
// installed once per pack version; the user then keeps, turns off or deletes each skill like any other.
import { importAgentFile } from './skills';
import {
  commandFromMarkdown,
  harnessOf,
  mergePackSkills,
  packSkillToDef,
  type CommandDef,
  type PackSkill,
} from './harness';
import { useStore } from './store';
import type { AgentDef } from './types';

export interface SkillPackPart {
  version: string;
  part: number;
  of: number;
  files: string[];
  skills: PackSkill[];
  commands: { name: string; source: string; md: string }[];
  agents: { name: string; source: string; md: string }[];
}
declare global {
  interface Window {
    MASSAMBA_SKILLS_PARTS?: SkillPackPart[];
  }
}
export const SKILL_PACK_FILE = 'massamba-skills.js';

const script = (src: string) =>
  new Promise<boolean>((resolve) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });

/** Loads every part of the pack; null when it is not next to the app. */
export async function loadSkillPack(): Promise<SkillPackPart[] | null> {
  if (!window.MASSAMBA_SKILLS_PARTS?.length && !(await script(SKILL_PACK_FILE))) return null;
  const first = window.MASSAMBA_SKILLS_PARTS?.[0];
  if (!first) return null;
  for (const f of first.files.slice(1))
    if (!window.MASSAMBA_SKILLS_PARTS!.some((p) => p.files[p.part - 1] === f)) await script(f);
  return [...window.MASSAMBA_SKILLS_PARTS!].sort((a, b) => a.part - b.part);
}

export interface PackInstall {
  version: string;
  skills: number;
  added: number;
  updated: number;
  commands: number;
  agents: number;
}
/** Installs a loaded pack into the store (skills merged, commands and agents added); null when already installed. */
export async function installSkillPack(parts: SkillPackPart[], force = false): Promise<PackInstall | null> {
  const st = useStore.getState();
  const h = harnessOf(st.settings.harness);
  const version = parts[0]?.version ?? '';
  if (!version || (!force && h.packVersion === version)) return null;
  const packSkills = parts.flatMap((p) => p.skills).map(packSkillToDef);
  const { skills, added, updated } = mergePackSkills(st.skills, packSkills);
  st.setSkills(skills);
  const commands: CommandDef[] = parts
    .flatMap((p) => p.commands)
    .map((c) =>
      commandFromMarkdown(c.md, c.name, c.source === 'plugin' ? `plugin ${c.name.split(':')[0]}` : c.source),
    );
  const keep = h.commands.filter((c) => !commands.some((n) => n.name === c.name));
  const agents: AgentDef[] = [];
  for (const a of parts.flatMap((p) => p.agents)) {
    try {
      const def = await importAgentFile(new File([a.md], `${a.name.split(':').pop()}.md`));
      agents.push({
        ...def,
        id: a.name.replace(/[^\w-]+/g, '-'),
        name: def.name.includes(':') ? def.name : a.name,
      });
    } catch {
      /* an agent file that does not parse is skipped, the others are installed */
    }
  }
  const have = new Set(st.agents.map((a) => a.id));
  if (agents.some((a) => !have.has(a.id)))
    st.setAgents([...st.agents, ...agents.filter((a) => !have.has(a.id))]);
  st.patchSettings({ harness: { ...h, commands: [...keep, ...commands], packVersion: version } });
  return {
    version,
    skills: packSkills.length,
    added,
    updated,
    commands: commands.length,
    agents: agents.length,
  };
}

/** Background start-up step: load and install the pack when it is there (silent when it is not). */
export async function autoInstallSkillPack(): Promise<PackInstall | null> {
  const parts = await loadSkillPack();
  if (!parts) return null;
  const r = await installSkillPack(parts);
  if (r && (r.added || r.updated))
    useStore
      .getState()
      .toast(
        'ok',
        `${r.skills} compétences de la session installées (${r.added} nouvelles), ${r.commands} commandes, ${r.agents} agents.`,
      );
  return r;
}
