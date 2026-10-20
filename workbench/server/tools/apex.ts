import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { apexGuide, assembleApp, lintApp, referencePart, type HouseKit } from '../services/apexCore';
import { loadHouseKit } from '../services/houseKitFs';
import { defineTool, ok, ToolError, type AnyTool } from './types';

let cached: { kit: HouseKit | null; at: number } | null = null;
/** The user's house kit, re-read at most every minute (picks up skill updates). */
export function houseKit(): HouseKit | null {
  if (!cached || Date.now() - cached.at > 60_000) cached = { kit: loadHouseKit(), at: Date.now() };
  return cached.kit;
}
const need = () => {
  const k = houseKit();
  if (!k) throw new ToolError('House kit not installed (see apex.guide).');
  return k;
};

function nodeCheck(js: string): string | null {
  const f = path.join(os.tmpdir(), `apex-${process.pid}-${Date.now()}.js`);
  fs.writeFileSync(f, js);
  try {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8', timeout: 20_000 });
    return r.status === 0 ? null : (r.stderr || 'syntax error').replaceAll(f, 'app.js').slice(0, 2000);
  } finally {
    fs.rmSync(f, { force: true });
  }
}

export const apexTools: AnyTool[] = [
  defineTool({
    name: 'apex.guide',
    description:
      'APEX method + house export style + the house kit API (shell ids, 3D visuals, Excel/Word/PowerPoint/mail functions). Read it FIRST before building any business application, dashboard or reporting app.',
    schema: z.object({}),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: () => 'APEX guide',
    async execute() {
      const k = houseKit();
      return ok(k ? 'method + house kit' : 'method (house kit missing)', undefined, {
        forModel: apexGuide(k),
      });
    },
  }),
  defineTool({
    name: 'apex.reference',
    description:
      'Read the complete reference application of the house method (part 1..N), or a domain reference document (doc).',
    schema: z.object({ part: z.number().int().min(1).optional(), doc: z.string().optional() }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => (a.doc ? `Reference ${a.doc}` : `Reference app, part ${a.part ?? 1}`),
    async execute(a) {
      const k = need();
      if (a.doc) {
        const d = k.domain[a.doc];
        if (!d) throw new ToolError(`Unknown document. Available: ${Object.keys(k.domain).join(', ')}`);
        return ok(`reference ${a.doc}`, undefined, { forModel: d });
      }
      const r = referencePart(k, a.part ?? 1);
      return ok(`part ${a.part ?? 1}/${r.parts}`, undefined, {
        forModel: `[part ${a.part ?? 1} of ${r.parts}]\n${r.text}`,
      });
    },
  }),
  defineTool({
    name: 'apex.build_app',
    description:
      'Assemble a single-file OFFLINE application in the house method (house shell + vendor libraries + logo + 3D export kit + YOUR application script). Give app_js or from_path. Writes apps/<name>.html after a node --check. Then run apex.qa.',
    schema: z.object({
      name: z.string().min(1),
      app_js: z.string().optional(),
      from_path: z.string().optional(),
    }),
    readOnly: false,
    assess: () => ({ risk: 'write' }),
    label: (a) => `Build app ${a.name}.html`,
    grantKey: () => 'filesystem.write',
    async execute(a, ctx) {
      const k = need();
      const js = a.from_path
        ? await ctx.services.workspace.readText(ctx.projectId, a.from_path)
        : (a.app_js ?? '');
      if (!js.trim()) throw new ToolError('app_js (or from_path) is empty.');
      const issues = lintApp(js);
      const syn = nodeCheck(js);
      if (syn) issues.unshift(`Syntax error: ${syn}`);
      if (issues.length) throw new ToolError(`App rejected:\n- ${issues.join('\n- ')}`);
      const base = a.name.replace(/[^\w.-]+/g, '-').replace(/\.html?$/i, '') || 'application';
      if (!a.from_path)
        await ctx.services.workspace.writeBinary(ctx.projectId, `apps/${base}.app.js`, Buffer.from(js));
      const html = assembleApp(k, js);
      const rel = await ctx.services.workspace.writeBinary(
        ctx.projectId,
        `apps/${base}.html`,
        Buffer.from(html),
      );
      return ok(
        `${rel} (${Math.round(html.length / 1024)} KB)`,
        { path: rel },
        {
          forModel: `Built ${rel} (${html.length} bytes, fully offline). Now call apex.qa {path:"${rel}"}.`,
        },
      );
    },
  }),
  defineTool({
    name: 'apex.qa',
    description:
      'Open a generated HTML application offline in Chromium for a few seconds and report page errors and loaded kit libraries.',
    schema: z.object({ path: z.string().min(1) }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: (a) => `QA ${a.path}`,
    async execute(a, ctx) {
      const html = await ctx.services.workspace.readText(ctx.projectId, a.path);
      const r = await ctx.services.browser.qaHtml(html);
      const missing = Object.entries(r.globals)
        .filter(([, t]) => t === 'undefined')
        .map(([n]) => n);
      const verdict = r.errors.length ? 'FAILED' : missing.length ? 'PARTIAL' : 'PASSED';
      return ok(`${verdict} — ${r.errors.length} error(s)`, r, {
        forModel: `QA ${verdict} for ${a.path} — title "${r.title}"\nPage errors: ${r.errors.join(' | ') || 'none'}\nGlobals: ${JSON.stringify(r.globals)}${missing.length ? `\nMissing: ${missing.join(', ')}` : ''}\nNot verified automatically: loading a real file and clicking each export.`,
      });
    },
  }),
];
