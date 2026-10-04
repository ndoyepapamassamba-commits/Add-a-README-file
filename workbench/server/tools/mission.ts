import { marked } from 'marked';
import { emlFromHtml, houseMailHtml } from '../services/houseStyle';
import { z } from 'zod';
import {
  AI_DOCS,
  MISSION_STAGES,
  aiDocPath,
  aiDocTemplate,
  normalizeReport,
  type MissionReport,
  type MissionStage,
} from '../agent/mission';
import { markdownToHtml } from '../services/artifacts';
import { markdownToDocx, type DocxImage } from '../services/officeCore';
import { defineTool, ok, ToolError, type AnyTool, type ToolContext } from './types';

/** Callbacks installed by the orchestrator when a run is in mission mode. */
export interface MissionHooks {
  stage: (s: MissionStage, note?: string) => void;
  report: (r: MissionReport) => void;
}
const hooks = new WeakMap<ToolContext, MissionHooks>();
export const setMissionHooks = (ctx: ToolContext, h: MissionHooks) => hooks.set(ctx, h);

async function uniqueOutput(ctx: ToolContext, rel: string): Promise<string> {
  const ws = ctx.services.workspace;
  const exists = async (p: string) =>
    ws
      .readRaw(ctx.projectId, p)
      .then(() => true)
      .catch(() => false);
  if (!(await exists(rel))) return rel;
  const dot = rel.lastIndexOf('.');
  for (let i = 2; ; i++) {
    const cand = `${rel.slice(0, dot)}-${i}${rel.slice(dot)}`;
    if (!(await exists(cand))) return cand;
  }
}

export const missionTools: AnyTool[] = [
  defineTool({
    name: 'mission.stage',
    description:
      'MISSION MODE: announce the current pipeline stage (analyse, plan, execution, test, review, correction, validation, delivery). Shown live to the user.',
    schema: z.object({ stage: z.enum(MISSION_STAGES), note: z.string().max(300).optional() }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Étape : ${a.stage}`,
    async execute(a, ctx) {
      hooks.get(ctx)?.stage(a.stage, a.note);
      return ok(a.stage, undefined, { forModel: `Stage: ${a.stage}` });
    },
  }),
  defineTool({
    name: 'mission.report',
    description:
      'MISSION MODE: final report with an honest verdict (PASSED / PARTIAL / FAILED), the checks you actually ran, remaining issues and deliverables. Required to finish a mission.',
    schema: z.object({
      status: z.enum(['PASSED', 'PARTIAL', 'FAILED']),
      summary: z.string().min(1).max(4000),
      checks: z
        .array(
          z.object({
            name: z.string(),
            status: z.enum(['pass', 'fail', 'skip']),
            details: z.string().optional(),
          }),
        )
        .max(60),
      issues: z.array(z.string()).max(40).optional(),
      deliverables: z.array(z.string()).max(40).optional(),
    }),
    readOnly: false,
    assess: () => ({ risk: 'read' }),
    label: (a) => `Rapport de mission : ${a.status}`,
    async execute(a, ctx) {
      const h = hooks.get(ctx);
      if (!h) throw new ToolError('mission.report is only available in mission mode');
      const r = normalizeReport(a as unknown as Record<string, unknown>);
      h.report(r);
      return ok(r.status, r, { forModel: `Report recorded (${r.status}).` });
    },
  }),
  defineTool({
    name: 'memory.doc',
    description: `Update a project memory document in .ai/ (${AI_DOCS.join(', ')}). mode "replace" rewrites it, "append" adds at the end. Keep them concise and factual.`,
    schema: z.object({
      doc: z.enum(AI_DOCS),
      mode: z.enum(['replace', 'append']).default('append'),
      content: z.string().min(1).max(40_000),
    }),
    readOnly: false,
    assess: () => ({ risk: 'write_internal' }),
    label: (a) => `Mémoire .ai/${a.doc}.md (${a.mode})`,
    async execute(a, ctx) {
      const rel = aiDocPath(a.doc);
      const ws = ctx.services.workspace;
      let before: string;
      try {
        before = await ws.readText(ctx.projectId, rel);
      } catch {
        before = aiDocTemplate(a.doc, ws.getProject(ctx.projectId).name);
      }
      const next = a.mode === 'replace' ? a.content : `${before.trimEnd()}\n\n${a.content.trim()}\n`;
      await ws.writeFile(ctx.projectId, rel, next, { sessionId: ctx.sessionId, runId: ctx.runId });
      return ok(`${rel} mis à jour`, undefined, { forModel: `Updated ${rel}.` });
    },
  }),
  defineTool({
    name: 'report.export',
    description:
      'Export a Markdown report to deliverables in outputs/, always in the house style: docx (Word), pdf, html, eml (colour mail draft for Outlook + .mail.html), md. Give markdown content or a markdown file path. Never overwrites existing files.',
    schema: z.object({
      name: z.string().min(1).max(100).describe('Base file name without extension, e.g. "rapport-ventes"'),
      title: z.string().max(200).optional(),
      content: z.string().optional(),
      from_path: z.string().optional(),
      formats: z
        .array(z.enum(['docx', 'pdf', 'html', 'md', 'eml']))
        .min(1)
        .default(['docx', 'pdf']),
    }),
    readOnly: false,
    assess: () => ({ risk: 'write_internal' }),
    label: (a) => `Exporter ${a.name} (${a.formats.join(', ')})`,
    async execute(a, ctx) {
      const md =
        a.content ?? (a.from_path ? await ctx.services.workspace.readText(ctx.projectId, a.from_path) : null);
      if (!md) throw new ToolError('Provide content or from_path');
      const base = `outputs/${a.name.replace(/[^\w.-]+/g, '-').replace(/\.(md|docx|pdf|html)$/i, '')}`;
      const title = a.title ?? a.name;
      const ws = ctx.services.workspace;
      const written: string[] = [];
      // Images referenced as ![alt](path) are embedded in the Word file.
      const images = new Map<string, DocxImage>();
      for (const m of md.matchAll(/!\[[^\]]*\]\(([^)\s]+\.(png|jpe?g))\)/gi)) {
        try {
          images.set(m[1]!, {
            data: new Uint8Array(await ws.readRaw(ctx.projectId, m[1]!)),
            type: /png$/i.test(m[1]!) ? 'png' : 'jpeg',
          });
        } catch {
          /* missing image: a placeholder is written */
        }
      }
      for (const f of a.formats) {
        const rel = await uniqueOutput(ctx, `${base}.${f}`);
        if (f === 'md')
          await ws.writeFile(ctx.projectId, rel, md, { sessionId: ctx.sessionId, runId: ctx.runId });
        else if (f === 'html')
          await ws.writeFile(ctx.projectId, rel, markdownToHtml(md, title), {
            sessionId: ctx.sessionId,
            runId: ctx.runId,
          });
        else if (f === 'eml') {
          // Images become data: URIs, then cid: parts of the .eml (Outlook shows them in colour).
          let withImages = marked.parse(md, { async: false }) as string;
          for (const [src, img] of images)
            withImages = withImages
              .split(`src="${src}"`)
              .join(`src="data:image/${img.type};base64,${Buffer.from(img.data).toString('base64')}"`);
          const mail = houseMailHtml(title, withImages);
          await ws.writeBinary(ctx.projectId, rel, Buffer.from(emlFromHtml(title, mail)));
          const mh = await uniqueOutput(ctx, `${base}.mail.html`);
          await ws.writeBinary(ctx.projectId, mh, Buffer.from(mail));
          written.push(mh);
        } else if (f === 'docx')
          await ws.writeBinary(
            ctx.projectId,
            rel,
            Buffer.from(markdownToDocx(md, a.title, (src) => images.get(src) ?? null)),
          );
        else
          await ws.writeBinary(
            ctx.projectId,
            rel,
            await ctx.services.browser.htmlToPdf(markdownToHtml(md, title)),
          );
        written.push(rel);
      }
      return ok(written.join(', '), { files: written }, { forModel: `Exported: ${written.join(', ')}` });
    },
  }),
];
