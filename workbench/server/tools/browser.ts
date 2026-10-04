import path from 'node:path';
import { z } from 'zod';
import { defineTool, ok, type AnyTool, type ToolContext } from './types';
import type { PageSnapshot } from '../services/browserManager';

const downloads = (ctx: ToolContext) =>
  path.join(ctx.services.workspace.projectRoot(ctx.projectId), 'downloads');
const key = (ctx: ToolContext) => ctx.sessionId;

const target = {
  ref: z.number().int().min(1).optional().describe('Element ref from browser.extract (preferred)'),
  selector: z.string().optional().describe('CSS selector'),
  text: z.string().optional().describe('Visible text of the element'),
};

function formatSnapshot(s: PageSnapshot, includeText = true): string {
  const els = s.elements
    .map((e) => {
      const bits = [
        `[${e.ref}] <${e.tag}${e.type ? ` type=${e.type}` : ''}${e.role ? ` role=${e.role}` : ''}>`,
        e.text && `"${e.text}"`,
      ];
      if (e.placeholder) bits.push(`placeholder="${e.placeholder}"`);
      if (e.name) bits.push(`name=${e.name}`);
      if (e.value) bits.push(`value="${e.value}"`);
      if (e.href && e.tag === 'a') bits.push(`→ ${e.href.slice(0, 120)}`);
      return bits.filter(Boolean).join(' ');
    })
    .join('\n');
  return `URL: ${s.url}\nTitle: ${s.title}\n\n## Interactive elements (use ref)\n${els || '(none)'}${includeText ? `\n\n## Page text${s.truncated ? ' (truncated)' : ''}\n${s.text}` : ''}`;
}

async function afterAction(ctx: ToolContext, includeText: boolean): Promise<string> {
  try {
    const snap = await ctx.services.browser.snapshot(key(ctx), downloads(ctx), includeText ? 6000 : 0);
    return formatSnapshot(snap, includeText);
  } catch (err) {
    return `(could not snapshot page: ${(err as Error).message})`;
  }
}

async function screenshotAttachment(ctx: ToolContext, fullPage: boolean) {
  const png = await ctx.services.browser.screenshot(key(ctx), downloads(ctx), { fullPage });
  const state = await ctx.services.browser.state(key(ctx));
  const art = await ctx.services.artifacts.create({
    projectId: ctx.projectId,
    sessionId: ctx.sessionId,
    runId: ctx.runId,
    name: `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    type: 'png',
    content: png,
    meta: { url: state?.url, title: state?.title },
  });
  if (ctx.modelSupportsVision)
    ctx.pendingImages.push({
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
      caption: `Screenshot of ${state?.url ?? 'page'}`,
    });
  return { art, state };
}

export const browserTools: AnyTool[] = [
  defineTool({
    name: 'browser.open',
    description:
      'Open a URL in the controlled browser (visible live to the user) and return the page snapshot: interactive elements with refs + page text. Use for real interaction with websites; use web.search for plain information lookups.',
    schema: z.object({ url: z.string().min(1) }),
    readOnly: false,
    assess: () => ({ risk: 'network' }),
    label: (a) => `Open ${a.url}`,
    async execute(a, ctx) {
      const st = await ctx.services.browser.navigate(key(ctx), downloads(ctx), a.url);
      return ok(
        `${st.title || st.url}`,
        { url: st.url, title: st.title },
        { forModel: await afterAction(ctx, true) },
      );
    },
  }),
  defineTool({
    name: 'browser.navigate',
    description: 'Navigate the current tab to a URL.',
    schema: z.object({ url: z.string().min(1) }),
    readOnly: false,
    assess: () => ({ risk: 'network' }),
    label: (a) => `Navigate ${a.url}`,
    async execute(a, ctx) {
      const st = await ctx.services.browser.navigate(key(ctx), downloads(ctx), a.url);
      return ok(`${st.title || st.url}`, { url: st.url }, { forModel: await afterAction(ctx, true) });
    },
  }),
  defineTool({
    name: 'browser.click',
    description:
      'Click an element (by ref from the last snapshot, CSS selector, visible text, or x/y viewport coordinates).',
    schema: z.object({
      ...target,
      x: z.number().optional(),
      y: z.number().optional(),
      double: z.boolean().default(false),
    }),
    readOnly: false,
    assess: () => ({ risk: 'browser_interact' }),
    label: (a) => `Click ${a.ref !== undefined ? `[${a.ref}]` : (a.selector ?? a.text ?? `${a.x},${a.y}`)}`,
    grantKey: () => 'browser.interact',
    async execute(a, ctx) {
      const st = await ctx.services.browser.click(key(ctx), downloads(ctx), a);
      return ok(`→ ${st.url}`, { url: st.url }, { forModel: await afterAction(ctx, false) });
    },
  }),
  defineTool({
    name: 'browser.type',
    description:
      'Type text into an input (by ref/selector/text). clear=true replaces the content; submit=true presses Enter afterwards.',
    schema: z.object({
      ...target,
      value: z.string(),
      clear: z.boolean().default(true),
      submit: z.boolean().default(false),
    }),
    readOnly: false,
    assess: () => ({ risk: 'browser_interact' }),
    label: (a) => `Type into ${a.ref !== undefined ? `[${a.ref}]` : (a.selector ?? a.text ?? 'focus')}`,
    grantKey: () => 'browser.interact',
    async execute(a, ctx) {
      const st = await ctx.services.browser.type(key(ctx), downloads(ctx), a, a.value, {
        clear: a.clear,
        submit: a.submit,
      });
      return ok(
        `typed ${a.value.length} chars`,
        { url: st.url },
        { forModel: await afterAction(ctx, a.submit) },
      );
    },
  }),
  defineTool({
    name: 'browser.press',
    description: 'Press a key or chord, e.g. "Enter", "Escape", "Control+A", "ArrowDown".',
    schema: z.object({ keys: z.string().min(1) }),
    readOnly: false,
    assess: () => ({ risk: 'browser_interact' }),
    label: (a) => `Press ${a.keys}`,
    grantKey: () => 'browser.interact',
    async execute(a, ctx) {
      await ctx.services.browser.press(key(ctx), downloads(ctx), a.keys);
      return ok(`pressed ${a.keys}`, undefined, { forModel: await afterAction(ctx, false) });
    },
  }),
  defineTool({
    name: 'browser.scroll',
    description: 'Scroll the page (direction + amount in px) or scroll an element ref into view.',
    schema: z.object({
      direction: z.enum(['up', 'down', 'left', 'right']).default('down'),
      amount: z.number().int().min(50).max(10_000).default(700),
      ref: z.number().int().optional(),
    }),
    readOnly: false,
    assess: () => ({ risk: 'network' }),
    label: (a) => (a.ref !== undefined ? `Scroll to [${a.ref}]` : `Scroll ${a.direction}`),
    async execute(a, ctx) {
      await ctx.services.browser.scroll(key(ctx), downloads(ctx), a);
      return ok('scrolled', undefined, { forModel: await afterAction(ctx, true) });
    },
  }),
  ...(['back', 'forward', 'reload'] as const).map((action) =>
    defineTool({
      name: `browser.${action}`,
      description: action === 'reload' ? 'Reload the current page.' : `Go ${action} in history.`,
      schema: z.object({}),
      readOnly: false,
      assess: () => ({ risk: 'network' as const }),
      label: () => `${action[0]!.toUpperCase()}${action.slice(1)}`,
      async execute(_a: Record<string, never>, ctx: ToolContext) {
        const st = await ctx.services.browser.history(key(ctx), downloads(ctx), action);
        return ok(`→ ${st.url}`, { url: st.url }, { forModel: await afterAction(ctx, true) });
      },
    }),
  ),
  defineTool({
    name: 'browser.screenshot',
    description:
      'Capture a PNG screenshot of the current page (shown to the user; vision models also see it).',
    schema: z.object({ full_page: z.boolean().default(false) }),
    readOnly: false,
    assess: () => ({ risk: 'network' }),
    label: (a) => `Screenshot${a.full_page ? ' (full page)' : ''}`,
    async execute(a, ctx) {
      const { art, state } = await screenshotAttachment(ctx, a.full_page);
      return ok(
        `${state?.title ?? 'page'}`,
        { artifactId: art.id },
        {
          attachments: [{ kind: 'image', artifactId: art.id, name: art.name }],
          forModel: `Screenshot saved as artifact ${art.id} (${state?.url}).${ctx.modelSupportsVision ? ' The image is attached to your next message.' : ' (Current model has no vision; use browser.extract for content.)'}`,
        },
      );
    },
  }),
  defineTool({
    name: 'browser.extract',
    description:
      'Snapshot the current page: interactive elements with refs, links and visible text (up to max_chars).',
    schema: z.object({
      max_chars: z.number().int().min(500).max(60_000).default(12_000),
      include_links: z.boolean().default(false),
    }),
    readOnly: true,
    assess: () => ({ risk: 'network' }),
    label: () => 'Extract page',
    async execute(a, ctx) {
      const snap = await ctx.services.browser.snapshot(key(ctx), downloads(ctx), a.max_chars);
      let text = formatSnapshot(snap, true);
      if (a.include_links)
        text += `\n\n## Links\n${snap.links.map((l) => `- ${l.text || '(no text)'} → ${l.href}`).join('\n')}`;
      return ok(
        `${snap.elements.length} elements · ${snap.text.length} chars`,
        { url: snap.url, title: snap.title, elements: snap.elements.length },
        { forModel: text },
      );
    },
  }),
  defineTool({
    name: 'browser.console',
    description:
      'Return recent console messages, page errors and failed/HTTP-error network requests (for debugging web apps).',
    schema: z.object({ limit: z.number().int().min(1).max(200).default(50) }),
    readOnly: true,
    assess: () => ({ risk: 'read' }),
    label: () => 'Console & network',
    async execute(a, ctx) {
      const logs = ctx.services.browser.logs(key(ctx));
      const cons = logs.console
        .slice(-a.limit)
        .map((c) => `[${c.level}] ${c.text}${c.location ? ` (${c.location})` : ''}`);
      const net = logs.network
        .filter((n) => n.failure || (n.status ?? 0) >= 400)
        .slice(-a.limit)
        .map((n) => `${n.method} ${n.url} → ${n.failure ?? n.status}`);
      const errors = logs.console.filter((c) => c.level === 'error').length;
      return ok(
        `${errors} errors · ${net.length} failed requests`,
        { errors, failedRequests: net.length },
        {
          forModel: `## Console\n${cons.join('\n') || '(empty)'}\n\n## Failed requests\n${net.join('\n') || '(none)'}`,
        },
      );
    },
  }),
  defineTool({
    name: 'browser.download',
    description:
      'Download a file (by direct URL, or by clicking an element ref that triggers a download) into the project downloads/ folder.',
    schema: z.object({ url: z.string().optional(), ...target }),
    readOnly: false,
    assess: () => ({ risk: 'browser_interact' }),
    label: (a) => `Download ${a.url ?? `[${a.ref ?? a.selector ?? a.text}]`}`,
    grantKey: () => 'browser.interact',
    async execute(a, ctx) {
      const file = await ctx.services.browser.download(key(ctx), downloads(ctx), a);
      const rel = path
        .relative(ctx.services.workspace.projectRoot(ctx.projectId), file)
        .split(path.sep)
        .join('/');
      return ok(
        `Saved ${rel}`,
        { path: rel },
        { forModel: `Downloaded to ${rel}. Use filesystem.read / data.inspect to analyse it.` },
      );
    },
  }),
];
