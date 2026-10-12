// Contrôleur du BAC À SABLE 3D : une iframe isolée (sandbox="allow-scripts", origine opaque : aucun accès à l'app, à
// son stockage ni aux clés) qui contient three.js, cannon-es et le harnais. La page lui envoie du code, récupère le
// résultat (erreurs avec ligne, avertissements, statistiques), une capture PNG ou un .glb (compressible en Draco).
import threeCode from 'virtual:three-iife';
import cannonCode from 'virtual:cannon-iife';
import { harnessMain } from './harness';
import { dracoCompress } from './draco';

export interface RunError {
  kind: 'runtime' | 'console' | 'shader' | 'physics' | 'timeout';
  msg: string;
  line: number | null;
}
export interface RunResult {
  ok: boolean;
  errors: RunError[];
  warnings: string[];
  stats: { meshes: number; triangles: number; drawCalls: number; bodies: number; programs: number };
  ms: number;
}
const esc = (s: string) => s.replace(/<\/script/gi, '<\\/script');
const page = () =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#15171d;overflow:hidden}canvas{width:100%;height:100%;display:block}</style></head><body><canvas id="c"></canvas>` +
  `<script>${esc(threeCode)}</script><script>${esc(cannonCode)}</script><script>(${esc(harnessMain.toString())})();</script></body></html>`;

let seq = 0;
export class Lab3D {
  readonly frame: HTMLIFrameElement;
  private ready: Promise<void>;
  private waiting = new Map<string, (d: Record<string, unknown>) => void>();
  /** Live console of the sandbox (logs, warnings, errors as they happen). */
  onConsole?: (kind: 'log' | 'warn' | 'error', msg: string) => void;
  constructor(container: HTMLElement) {
    this.frame = document.createElement('iframe');
    this.frame.setAttribute('sandbox', 'allow-scripts');
    this.frame.title = 'Bac à sable 3D';
    this.frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
    let ok!: () => void;
    this.ready = new Promise((r) => (ok = r));
    const onMsg = (e: MessageEvent) => {
      if (e.source !== this.frame.contentWindow) return;
      const d = e.data as Record<string, unknown>;
      if (!d?.lab3d) return;
      if (d.type === 'ready') ok();
      else if (d.type === 'log' || d.type === 'warn') this.onConsole?.(d.type, String(d.msg));
      else if (d.type === 'error')
        this.onConsole?.('error', `${d.kind}${d.line ? ` (ligne ${d.line})` : ''} : ${d.msg}`);
      const id = d.id as string | undefined;
      if (id && this.waiting.has(id)) {
        this.waiting.get(id)!(d);
        this.waiting.delete(id);
      }
    };
    addEventListener('message', onMsg);
    this.dispose = () => {
      removeEventListener('message', onMsg);
      this.frame.remove();
    };
    this.frame.srcdoc = page();
    container.appendChild(this.frame);
  }
  dispose: () => void;
  private ask(
    op: string,
    extra: Record<string, unknown>,
    timeoutMs: number,
    transfer: Transferable[] = [],
  ): Promise<Record<string, unknown>> {
    const id = `l${++seq}`;
    return this.ready.then(
      () =>
        new Promise((resolve) => {
          const timer = setTimeout(() => {
            this.waiting.delete(id);
            resolve({ timeout: true });
          }, timeoutMs);
          this.waiting.set(id, (d) => {
            clearTimeout(timer);
            resolve(d);
          });
          this.frame.contentWindow!.postMessage({ lab3d: true, op, id, ...extra }, '*', transfer);
        }),
    );
  }
  /** Runs three.js code in the sandbox (the scene is reset first). */
  async run(code: string, timeoutMs = 15_000): Promise<RunResult> {
    const t0 = performance.now();
    const d = await this.ask('run', { code }, timeoutMs);
    const ms = Math.round(performance.now() - t0);
    if (d.timeout)
      return {
        ok: false,
        errors: [
          {
            kind: 'timeout',
            msg: `le code n'a pas fini en ${timeoutMs / 1000} s (boucle infinie ?)`,
            line: null,
          },
        ],
        warnings: [],
        stats: { meshes: 0, triangles: 0, drawCalls: 0, bodies: 0, programs: 0 },
        ms,
      };
    return {
      ok: Boolean(d.ok),
      errors: (d.errors as RunError[]) ?? [],
      warnings: (d.warnings as string[]) ?? [],
      stats: d.stats as RunResult['stats'],
      ms,
    };
  }
  /** The current scene as a .glb; with draco = true, compressed (KHR_draco_mesh_compression) when the encoder loads. */
  async exportGlb(
    draco = false,
  ): Promise<{ bytes: Uint8Array; draco: boolean; before: number } | { error: string }> {
    const d = await this.ask('export', {}, 30_000);
    if (d.timeout || d.error || !d.buf) return { error: String(d.error ?? 'export interrompu') };
    const raw = new Uint8Array(d.buf as ArrayBuffer);
    if (!draco) return { bytes: raw, draco: false, before: raw.byteLength };
    const c = await dracoCompress(raw);
    return c
      ? { bytes: c.bytes, draco: true, before: c.before }
      : { bytes: raw, draco: false, before: raw.byteLength };
  }
  /** Loads a .glb (Draco included) into the sandbox, e.g. to check a compressed export. */
  async loadGlb(bytes: Uint8Array): Promise<{ ok: boolean; error?: string }> {
    const buf = bytes.slice().buffer;
    const d = await this.ask('load', { buf }, 30_000, [buf]);
    return { ok: Boolean(d.ok), error: d.error as string | undefined };
  }
  async screenshot(): Promise<string | null> {
    const d = await this.ask('shot', {}, 5000);
    return (d.png as string) ?? null;
  }
}

/** A hidden sandbox for the agent and the auto-correction loop (created on demand, kept for the session). */
let hidden: Lab3D | null = null;
export function backgroundLab(): Lab3D {
  if (hidden) return hidden;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;height:400px;pointer-events:none';
  document.body.appendChild(host);
  hidden = new Lab3D(host);
  return hidden;
}
