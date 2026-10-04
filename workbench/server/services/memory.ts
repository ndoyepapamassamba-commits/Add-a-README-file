import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { WorkspaceService } from './workspace';

export const MEMORY_CATEGORIES = [
  'architecture',
  'convention',
  'important_file',
  'decision',
  'instruction',
  'known_error',
  'context',
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export interface MemoryFact {
  id: string;
  category: MemoryCategory;
  text: string;
  createdAt: number;
}

const FileSchema = z.object({
  facts: z.array(
    z.object({
      id: z.string(),
      category: z.enum(MEMORY_CATEGORIES),
      text: z.string(),
      createdAt: z.number(),
    }),
  ),
});

const START = '<!-- workbench:memory:start -->';
const END = '<!-- workbench:memory:end -->';
const TITLES: Record<MemoryCategory, string> = {
  architecture: 'Architecture',
  convention: 'Conventions',
  important_file: 'Fichiers importants',
  decision: 'Décisions',
  instruction: 'Instructions utilisateur',
  known_error: 'Erreurs connues',
  context: 'Contexte',
};

/**
 * Project memory: structured facts in .workbench/memory.json, mirrored into a
 * managed section of PROJECT_CONTEXT.md (user-written text outside the
 * markers is preserved).
 */
export class MemoryService {
  constructor(private readonly workspace: WorkspaceService) {}

  private file(projectId: string): string {
    return path.join(this.workspace.internalDir(projectId, ''), 'memory.json');
  }

  async facts(projectId: string): Promise<MemoryFact[]> {
    try {
      return FileSchema.parse(JSON.parse(await fsp.readFile(this.file(projectId), 'utf8'))).facts;
    } catch {
      return [];
    }
  }

  async contextMarkdown(projectId: string): Promise<string> {
    const p = path.join(this.workspace.projectRoot(projectId), 'PROJECT_CONTEXT.md');
    try {
      return await fsp.readFile(p, 'utf8');
    } catch {
      return '';
    }
  }

  async add(projectId: string, category: MemoryCategory, text: string): Promise<MemoryFact> {
    const facts = await this.facts(projectId);
    const existing = facts.find(
      (f) => f.category === category && f.text.trim().toLowerCase() === text.trim().toLowerCase(),
    );
    if (existing) return existing;
    const fact: MemoryFact = {
      id: randomUUID().slice(0, 8),
      category,
      text: text.trim().slice(0, 1000),
      createdAt: Date.now(),
    };
    facts.push(fact);
    await this.save(projectId, facts.slice(-300));
    return fact;
  }

  async remove(projectId: string, id: string): Promise<boolean> {
    const facts = await this.facts(projectId);
    const next = facts.filter((f) => f.id !== id);
    if (next.length === facts.length) return false;
    await this.save(projectId, next);
    return true;
  }

  private async save(projectId: string, facts: MemoryFact[]): Promise<void> {
    await fsp.writeFile(this.file(projectId), JSON.stringify({ facts }, null, 2));
    const mdPath = path.join(this.workspace.projectRoot(projectId), 'PROJECT_CONTEXT.md');
    let md = fs.existsSync(mdPath) ? await fsp.readFile(mdPath, 'utf8') : `# ${projectId}\n`;
    const sections = MEMORY_CATEGORIES.map((c) => {
      const items = facts.filter((f) => f.category === c);
      return items.length ? `### ${TITLES[c]}\n${items.map((f) => `- ${f.text}`).join('\n')}` : '';
    }).filter(Boolean);
    const block = `${START}\n## Mémoire du projet (gérée par l'agent)\n\n${sections.join('\n\n') || '_vide_'}\n${END}`;
    if (md.includes(START) && md.includes(END))
      md = md.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
    else md = `${md.trimEnd()}\n\n${block}\n`;
    await fsp.writeFile(mdPath, md);
  }
}
