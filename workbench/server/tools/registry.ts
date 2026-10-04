import { z } from 'zod';
import type { ToolDefinition } from '../llm/types';
import { agentTools } from './agent';
import { browserTools } from './browser';
import { dataTools } from './data';
import { filesystemTools } from './filesystem';
import { projectTools } from './project';
import { terminalTools } from './terminal';
import type { AnyTool } from './types';
import { webTools } from './web';

export const ALL_TOOLS: AnyTool[] = [...filesystemTools, ...terminalTools, ...browserTools, ...webTools, ...dataTools, ...projectTools, ...agentTools];

const byName = new Map(ALL_TOOLS.map((t) => [t.name, t]));
/** OpenAI-style function names cannot contain dots. */
export const toLlmName = (name: string) => name.replace(/\./g, '__');
const byLlmName = new Map(ALL_TOOLS.map((t) => [toLlmName(t.name), t]));

export function getTool(name: string): AnyTool | undefined {
  return byName.get(name) ?? byLlmName.get(name) ?? byLlmName.get(name.replace(/\./g, '__'));
}

const schemaCache = new Map<string, Record<string, unknown>>();

export function jsonSchemaFor(tool: AnyTool): Record<string, unknown> {
  let s = schemaCache.get(tool.name);
  if (!s) {
    s = z.toJSONSchema(tool.schema, { target: 'draft-7', io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    delete s.$schema;
    schemaCache.set(tool.name, s);
  }
  return s;
}

export function toolDefinitions(names: string[]): ToolDefinition[] {
  return names
    .map((n) => byName.get(n))
    .filter((t): t is AnyTool => Boolean(t))
    .map((t) => ({ type: 'function', function: { name: toLlmName(t.name), description: t.description, parameters: jsonSchemaFor(t) } }));
}

export function toolCatalog(): { name: string; description: string; readOnly: boolean }[] {
  return ALL_TOOLS.map((t) => ({ name: t.name, description: t.description, readOnly: t.readOnly }));
}
