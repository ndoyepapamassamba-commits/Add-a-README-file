import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Attachment } from '@shared/types';
import type { McpTool } from '../services/mcp';
import { redactSecrets } from '../security/redact';
import { defineTool, type AnyTool } from './types';

const clean = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, '_');

/** Public tool name for an MCP tool (LLM name = dots → "__", ≤ 64 chars). */
export function mcpToolName(server: string, tool: string): string {
  let name = `mcp.${clean(server)}.${clean(tool)}`;
  if (name.replace(/\./g, '__').length > 64) {
    const h = createHash('sha1').update(`${server}/${tool}`).digest('hex').slice(0, 6);
    name = `mcp.${clean(server).slice(0, 16)}.${clean(tool).slice(0, 34)}_${h}`;
  }
  return name;
}

interface McpContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
  name?: string;
  resource?: { uri?: string; text?: string; blob?: string; mimeType?: string };
}

/** Wraps a discovered MCP tool as an agent tool (permission-checked, results converted). */
export function mcpToolDef(t: McpTool, isAutoApproved: (server: string, tool: string) => boolean): AnyTool {
  return defineTool<Record<string, unknown>>({
    name: mcpToolName(t.server, t.name),
    description: `[Plugin ${t.server}] ${t.description || t.name}`.slice(0, 1024),
    schema: z.record(z.string(), z.unknown()),
    jsonSchema: t.inputSchema,
    readOnly: false,
    assess: () => {
      if (isAutoApproved(t.server, t.name)) return { risk: 'read' };
      if (t.readOnly && !t.destructive) return { risk: 'network', reasons: [`plugin ${t.server} (lecture)`] };
      return { risk: 'external', reasons: [`plugin ${t.server}${t.destructive ? ' — action destructive' : ''}`] };
    },
    label: (a) => {
      const first = Object.values(a ?? {}).find((v) => typeof v === 'string') as string | undefined;
      return `${t.server} › ${t.name}${first ? ` ${first.slice(0, 60)}` : ''}`;
    },
    grantKey: () => `mcp:${t.server}:${t.name}`,
    async preview(a) {
      return { kind: 'text', text: `Plugin ${t.server} › ${t.name}\n${JSON.stringify(a, null, 2).slice(0, 3000)}` };
    },
    async execute(a, ctx) {
      const res = (await ctx.services.mcp.callTool(t.server, t.name, a, ctx.signal)) as { content?: McpContent[]; isError?: boolean; structuredContent?: unknown; toolResult?: unknown };
      const parts: string[] = [];
      const attachments: Attachment[] = [];
      for (const c of res.content ?? []) {
        if (c.type === 'text' && c.text) parts.push(c.text);
        else if (c.type === 'image' && c.data) {
          const ext = c.mimeType?.includes('jpeg') ? 'jpg' : 'png';
          const art = await ctx.services.artifacts.create({ projectId: ctx.projectId, sessionId: ctx.sessionId, runId: ctx.runId, name: `${t.server}-${t.name}`, type: ext, content: Buffer.from(c.data, 'base64'), meta: { plugin: t.server } });
          attachments.push({ kind: 'image', artifactId: art.id, name: art.name });
          if (ctx.modelSupportsVision) ctx.pendingImages.push({ dataUrl: `data:${c.mimeType ?? 'image/png'};base64,${c.data}`, caption: `Image returned by ${t.server}.${t.name}` });
          parts.push(`[image returned${ctx.modelSupportsVision ? ' — attached to your next message' : ''}]`);
        } else if (c.type === 'resource' && c.resource) parts.push(c.resource.text ?? `[resource ${c.resource.uri ?? ''}${c.resource.blob ? ' (binary)' : ''}]`);
        else if (c.type === 'resource_link') parts.push(`[resource link ${c.name ?? ''} ${c.uri ?? ''}]`);
        else parts.push(`[${c.type} content]`);
      }
      if (res.structuredContent !== undefined && !parts.length) parts.push(JSON.stringify(res.structuredContent, null, 2));
      if (res.toolResult !== undefined && !parts.length) parts.push(JSON.stringify(res.toolResult, null, 2));
      const text = redactSecrets(parts.join('\n\n') || '(empty result)');
      return {
        ok: !res.isError,
        summary: res.isError ? 'erreur du plugin' : `${text.length} caractères${attachments.length ? ` · ${attachments.length} image(s)` : ''}`,
        data: { text: text.slice(0, 8000) },
        forModel: text,
        attachments,
        error: res.isError ? text.slice(0, 2000) : undefined,
      };
    },
  });
}
