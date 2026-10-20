import { getConnection, wsUrl } from './api';

export type WsMessage = { type: string; [k: string]: unknown };
type Listener = (msg: WsMessage) => void;
export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed';

/**
 * Single multiplexed WebSocket with auto-reconnect. Subscriptions are
 * replayed after reconnection; run subscriptions resume from the last seq.
 */
class WsClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(s: WsStatus) => void>();
  private runs = new Map<string, number>();
  private browsers = new Map<string, number>();
  private activity = false;
  private terminal = false;
  private retry = 0;
  private pingTimer: number | undefined;
  private stopped = false;
  status: WsStatus = 'idle';

  private setStatus(s: WsStatus) {
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }

  connect(): void {
    this.stopped = false;
    if (this.socket && this.socket.readyState <= 1) return;
    const conn = getConnection();
    if (!conn) return;
    this.setStatus('connecting');
    const ws = new WebSocket(wsUrl());
    this.socket = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: conn.token }));
    ws.onmessage = (ev) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(String(ev.data)) as WsMessage;
      } catch {
        return;
      }
      if (msg.type === 'ready') {
        this.retry = 0;
        this.setStatus('open');
        this.resubscribe();
        window.clearInterval(this.pingTimer);
        this.pingTimer = window.setInterval(() => this.send({ type: 'ping' }), 25_000);
        return;
      }
      if (msg.type === 'run_event') {
        const runId = msg.runId as string;
        const seq = msg.seq as number;
        if ((this.runs.get(runId) ?? -1) < seq) this.runs.set(runId, seq);
      }
      for (const l of this.listeners) l(msg);
    };
    ws.onclose = () => {
      window.clearInterval(this.pingTimer);
      this.setStatus('closed');
      if (this.stopped) return;
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      window.setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  disconnect(): void {
    this.stopped = true;
    this.socket?.close();
    this.socket = null;
  }

  private resubscribe() {
    for (const [runId, seq] of this.runs) this.send({ type: 'sub_run', runId, afterSeq: seq });
    for (const key of this.browsers.keys()) this.send({ type: 'sub_browser', key });
    if (this.activity) this.send({ type: 'sub_activity' });
    if (this.terminal) this.send({ type: 'sub_terminal' });
  }

  send(msg: WsMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN && this.status === 'open')
      this.socket.send(JSON.stringify(msg));
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  onStatus(l: (s: WsStatus) => void): () => void {
    this.statusListeners.add(l);
    return () => this.statusListeners.delete(l);
  }

  subscribeRun(runId: string, afterSeq = -1): void {
    const prev = this.runs.get(runId);
    if (prev !== undefined && prev >= afterSeq) return;
    this.runs.set(runId, afterSeq);
    this.send({ type: 'sub_run', runId, afterSeq });
  }
  unsubscribeRun(runId: string): void {
    this.runs.delete(runId);
    this.send({ type: 'unsub_run', runId });
  }
  subscribeActivity(): void {
    this.activity = true;
    this.send({ type: 'sub_activity' });
  }
  subscribeTerminal(): void {
    this.terminal = true;
    this.send({ type: 'sub_terminal' });
  }
  subscribeBrowser(key: string): () => void {
    const n = (this.browsers.get(key) ?? 0) + 1;
    this.browsers.set(key, n);
    if (n === 1) this.send({ type: 'sub_browser', key });
    return () => {
      const m = (this.browsers.get(key) ?? 1) - 1;
      if (m <= 0) {
        this.browsers.delete(key);
        this.send({ type: 'unsub_browser', key });
      } else this.browsers.set(key, m);
    };
  }
}

export const ws = new WsClient();
