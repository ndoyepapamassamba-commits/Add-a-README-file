import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import type { RunEventEnvelope } from '@shared/types';
import type { BrowserAction, BrowserState } from '../services/browserManager';
import type { ProcessInfo } from '../services/processManager';
import { tokenMatches } from './auth';
import type { AppContext } from './context';

const InputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('click'),
    x: z.number(),
    y: z.number(),
    button: z.enum(['left', 'right', 'middle']).optional(),
    double: z.boolean().optional(),
  }),
  z.object({ kind: z.literal('wheel'), x: z.number(), y: z.number(), dx: z.number(), dy: z.number() }),
  z.object({ kind: z.literal('key'), key: z.string().min(1).max(40) }),
  z.object({ kind: z.literal('type'), text: z.string().min(1).max(5000) }),
]);

const MessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string() }),
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('sub_run'), runId: z.string(), afterSeq: z.number().int().default(-1) }),
  z.object({ type: z.literal('unsub_run'), runId: z.string() }),
  z.object({ type: z.literal('sub_activity') }),
  z.object({ type: z.literal('sub_terminal') }),
  z.object({ type: z.literal('sub_browser'), key: z.string() }),
  z.object({ type: z.literal('unsub_browser'), key: z.string() }),
  z.object({ type: z.literal('browser_input'), key: z.string(), projectId: z.string(), input: InputSchema }),
]);

const ACTIVITY_TYPES = new Set([
  'run_started',
  'run_finished',
  'usage',
  'approval_required',
  'approval_resolved',
  'plan_proposed',
  'tool_result',
  'file_changed',
]);

/** One multiplexed WebSocket per client: run events, activity, terminal output, live browser. */
export function registerWebSocket(app: FastifyInstance, ctx: AppContext): void {
  const s = ctx.services;
  app.get('/api/ws', { websocket: true }, (socket: WebSocket) => {
    let authed = false;
    const cleanups = new Map<string, () => void>();
    const send = (msg: unknown, droppable = false) => {
      if (socket.readyState !== 1) return;
      if (droppable && socket.bufferedAmount > 4 * 1024 * 1024) return; // slow client: drop frames
      socket.send(JSON.stringify(msg));
    };
    const authTimer = setTimeout(() => {
      if (!authed) socket.close(4401, 'auth timeout');
    }, 10_000);

    socket.on('message', (raw: Buffer) => {
      let msg: z.infer<typeof MessageSchema>;
      try {
        msg = MessageSchema.parse(JSON.parse(raw.toString('utf8')));
      } catch {
        send({ type: 'error', message: 'invalid message' });
        return;
      }
      if (!authed) {
        if (msg.type === 'auth' && tokenMatches(ctx.authToken, msg.token)) {
          authed = true;
          clearTimeout(authTimer);
          send({ type: 'ready' });
        } else socket.close(4401, 'unauthorized');
        return;
      }
      switch (msg.type) {
        case 'ping':
          send({ type: 'pong' });
          break;
        case 'sub_run': {
          const k = `run:${msg.runId}`;
          cleanups.get(k)?.();
          const unsub = ctx.orchestrator.subscribe(msg.runId, msg.afterSeq, (env: RunEventEnvelope) =>
            send({ type: 'run_event', ...env }),
          );
          cleanups.set(k, unsub);
          break;
        }
        case 'unsub_run':
          cleanups.get(`run:${msg.runId}`)?.();
          cleanups.delete(`run:${msg.runId}`);
          break;
        case 'sub_activity': {
          if (cleanups.has('activity')) break;
          const l = (env: RunEventEnvelope) => {
            if (ACTIVITY_TYPES.has(env.event.type)) send({ type: 'activity', ...env });
          };
          ctx.orchestrator.on('event', l);
          cleanups.set('activity', () => ctx.orchestrator.off('event', l));
          break;
        }
        case 'sub_terminal': {
          if (cleanups.has('terminal')) break;
          const onOut = (e: { id: string; stream: string; text: string }) =>
            send({ type: 'terminal_output', ...e });
          const onProc = (p: ProcessInfo) => send({ type: 'terminal_process', process: p });
          s.processes.on('output', onOut);
          s.processes.on('process', onProc);
          cleanups.set('terminal', () => {
            s.processes.off('output', onOut);
            s.processes.off('process', onProc);
          });
          break;
        }
        case 'sub_browser': {
          const k = `browser:${msg.key}`;
          if (cleanups.has(k)) break;
          const key = msg.key;
          const onFrame = (fk: string, data: string) =>
            fk === key && send({ type: 'browser_frame', key, data }, true);
          const onState = (fk: string, st: BrowserState) =>
            fk === key && send({ type: 'browser_state', key, state: st });
          const onAction = (fk: string, a: BrowserAction) =>
            fk === key && send({ type: 'browser_action', key, action: a });
          s.browser.on('frame', onFrame);
          s.browser.on('state', onState);
          s.browser.on('action', onAction);
          void s.browser.subscribe(key);
          const last = s.browser.lastFrame(key);
          if (last) send({ type: 'browser_frame', key, data: last });
          cleanups.set(k, () => {
            s.browser.off('frame', onFrame);
            s.browser.off('state', onState);
            s.browser.off('action', onAction);
            void s.browser.unsubscribe(key);
          });
          break;
        }
        case 'unsub_browser':
          cleanups.get(`browser:${msg.key}`)?.();
          cleanups.delete(`browser:${msg.key}`);
          break;
        case 'browser_input': {
          const dl = path.join(s.workspace.projectRoot(msg.projectId), 'downloads');
          const i = msg.input;
          const p =
            i.kind === 'click'
              ? s.browser.click(msg.key, dl, { x: i.x, y: i.y, button: i.button, double: i.double }, 'user')
              : i.kind === 'wheel'
                ? s.browser.scroll(msg.key, dl, { deltaX: i.dx, deltaY: i.dy, x: i.x, y: i.y }, 'user')
                : i.kind === 'key'
                  ? s.browser.press(msg.key, dl, i.key, 'user')
                  : s.browser.type(msg.key, dl, {}, i.text, {}, 'user');
          p.catch((err: Error) => send({ type: 'error', message: err.message }));
          break;
        }
        case 'auth':
          break;
      }
    });
    socket.on('close', () => {
      clearTimeout(authTimer);
      for (const c of cleanups.values()) c();
      cleanups.clear();
    });
  });
}
