// Exécuteur du BAC À SABLE « Réalisation » : une iframe isolée (sandbox sans allow-same-origin → origine opaque : pas
// d'accès à l'app, à ses clés, à son stockage) dans laquelle la page du modèle s'exécute avec le moteur esm.sh. Le pont
// injecté renvoie les erreurs réelles et les mesures ; le verdict est rendu par le module pur (server/jev/realize).
import {
  VIDEO_TYPES,
  buildDocument,
  verdict,
  type RealizeError,
  type RealizeRun,
} from '../../../server/jev/realize/realize';
import { openMp4, type Mp4Stream } from '../videogen/encode';

export interface Video {
  blob: Blob;
  mime: string;
  width?: number;
  height?: number;
}

export class Realizer {
  readonly frame: HTMLIFrameElement;
  /** Live console of the page (logs, warnings, errors as they happen). */
  onConsole?: (level: string, msg: string) => void;
  private token = '';
  private errors: RealizeError[] = [];
  private warnings: string[] = [];
  private stats: (Omit<RealizeRun['stats'], 'libs'> & { loading?: boolean }) | null = null;
  private wake: (() => void) | null = null;
  private video: ((v: Video | { error: string }) => void) | null = null;
  private snap: ((v: { data: string; w: number; h: number } | { error: string }) => void) | null = null;
  private exact: ((b: ImageBitmap, i: number, n: number) => Promise<void>) | null = null;
  private exactDone: (() => Promise<void>) | null = null;
  /** Progress of a frame-exact render (frames done, total). */
  onFrames?: (done: number, total: number) => void;
  private readonly onMsg = (e: MessageEvent) => {
    if (e.source !== this.frame.contentWindow) return;
    const d = e.data as {
      t?: string;
      rz?: string;
      kind?: RealizeError['kind'];
      msg?: string;
      line?: number | null;
      level?: string;
    } & Record<string, number>;
    if (!d || d.t !== this.token) return;
    if (d.rz === 'err') {
      this.errors.push({ kind: d.kind ?? 'runtime', msg: String(d.msg ?? ''), line: d.line ?? null });
      this.onConsole?.('error', String(d.msg ?? ''));
    } else if (d.rz === 'console') {
      const msg = String(d.msg ?? '');
      if (d.level === 'error') this.errors.push({ kind: 'console', msg, line: null });
      else if (d.level === 'warn') this.warnings.push(msg);
      this.onConsole?.(d.level ?? 'log', msg);
    } else if (d.rz === 'frame' && this.exact) {
      const b = (d as unknown as { bitmap: ImageBitmap }).bitmap;
      void this.exact(b, Number(d.i), Number(d.n));
    } else if (d.rz === 'video-done' && this.exactDone) {
      void this.exactDone();
    } else if (d.rz === 'snap') {
      const v = d as unknown as { data?: string; w?: number; h?: number; error?: string };
      this.snap?.(v.data ? { data: v.data, w: v.w ?? 0, h: v.h ?? 0 } : { error: v.error ?? 'échec' });
      this.snap = null;
    } else if (d.rz === 'video') {
      const v = d as unknown as {
        blob?: Blob;
        mime?: string;
        width?: number;
        height?: number;
        error?: string;
      };
      this.video?.(
        v.blob
          ? { blob: v.blob, mime: v.mime ?? 'video/webm', width: v.width, height: v.height }
          : { error: v.error ?? 'échec' },
      );
      this.video = null;
    } else if (d.rz === 'stats') {
      const x = d as unknown as {
        canvas?: { w: number; h: number } | null;
        spec?: string | null;
        tagged?: { name: string; area: number; cx: number; cy: number }[];
        declared?: string[] | null;
      };
      this.stats = {
        elements: d.elements ?? 0,
        text: d.text ?? 0,
        canvases: d.canvases ?? 0,
        svgs: d.svgs ?? 0,
        ms: d.ms ?? 0,
        loading: Boolean(d.loading),
        // The fidelity measures (v62): largest canvas, the page's own spec, the tagged elements, the declared ones.
        canvas: x.canvas ?? null,
        spec: typeof x.spec === 'string' ? x.spec : null,
        tagged: Array.isArray(x.tagged) ? x.tagged.slice(0, 80) : [],
        declared: Array.isArray(x.declared) ? x.declared.map(String).slice(0, 80) : undefined,
      };
      this.wake?.();
    }
  };

  constructor(container: HTMLElement) {
    this.frame = document.createElement('iframe');
    // allow-downloads: a generated page may offer « Exporter » ; allow-pointer-lock: games. Never allow-same-origin.
    this.frame.setAttribute('sandbox', 'allow-scripts allow-downloads allow-pointer-lock');
    this.frame.setAttribute('allow', 'fullscreen');
    this.frame.title = 'Réalisation';
    this.frame.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#fff';
    this.frame.dataset.testid = 'realize-frame';
    container.appendChild(this.frame);
    addEventListener('message', this.onMsg);
  }

  /**
   * Runs a page; resolves with the verdict once measured (or after `timeoutMs`). When the only problems are network ones
   * (a library that did not arrive, a page that never finished loading), the page is run once more: the modules that did
   * arrive are cached by the browser, and a network hiccup is not sent to the model as a code error.
   */
  async run(
    html: string,
    o: { data?: unknown; meta?: unknown; timeoutMs?: number; retryNetwork?: boolean } = {},
  ): Promise<RealizeRun> {
    const first = await this.runOnce(html, o);
    const network =
      first.errors.length > 0 && first.errors.every((e) => e.kind === 'resource' || e.kind === 'timeout');
    if (!network || o.retryNetwork === false) return first;
    this.onConsole?.('warn', 'problème réseau au chargement des bibliothèques : nouvel essai');
    const second = await this.runOnce(html, o);
    return second.ok
      ? { ...second, warnings: [...second.warnings, 'réussi au 2e essai après un problème réseau'] }
      : second;
  }

  private async runOnce(
    html: string,
    o: { data?: unknown; meta?: unknown; timeoutMs?: number },
  ): Promise<RealizeRun> {
    this.token = Math.random().toString(36).slice(2);
    this.errors = [];
    this.warnings = [];
    this.stats = null;
    const started = performance.now();
    const measured = new Promise<void>((r) => (this.wake = r));
    this.frame.srcdoc = buildDocument(html, { data: o.data, meta: o.meta, token: this.token });
    // Libraries come from the CDN on first use: a generous delay (they are cached afterwards).
    const timeout = o.timeoutMs ?? 30_000;
    await Promise.race([measured, new Promise((r) => setTimeout(r, timeout))]);
    if (!this.stats) {
      // « load » never came (a module still loading, a blocking script): ask the page to measure itself as it stands.
      this.frame.contentWindow?.postMessage({ rz: 'measure' }, '*');
      await Promise.race([measured, new Promise((r) => setTimeout(r, 1500))]);
    }
    // Errors thrown right after the first frames are still collected.
    await new Promise((r) => setTimeout(r, 300));
    const v = verdict(this.errors, this.warnings, this.stats, html);
    v.stats.ms = Math.round(performance.now() - started);
    return v;
  }

  /** A JPEG (data URL) of the largest canvas as displayed now, for the eye of JEV; { error } without canvas or after 4 s. */
  snapshot(max = 1024): Promise<{ data: string; w: number; h: number } | { error: string }> {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.snap = null;
        resolve({ error: 'timeout' });
      }, 4000);
      this.snap = (v) => {
        clearTimeout(t);
        resolve(v);
      };
      this.frame.contentWindow?.postMessage({ rz: 'snap', max }, '*');
    });
  }
  /**
   * Films the largest canvas of the page (3D, games, animated charts) for `ms` milliseconds — inside the sandbox, no
   * permission needed. MP4 where the browser records it, WebM otherwise. { error: 'nocanvas' } for a page without canvas.
   */
  record(ms: number, fps = 30): Promise<Video | { error: string }> {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve({ error: 'délai dépassé' }), ms + 15_000);
      this.video = (v) => {
        clearTimeout(t);
        resolve(v);
      };
      this.frame.contentWindow?.postMessage({ rz: 'record', ms, fps }, '*');
    });
  }

  /**
   * Renders a VIDEO page from its start: the page is reloaded and filmed from the « load » event for `seconds` (the
   * page draws everything on its canvas, see the « video » rules). Resolves with the recorded file.
   */
  async renderVideo(
    html: string,
    seconds: number,
    o: { data?: unknown; meta?: unknown; fps?: number } = {},
  ): Promise<Video | { error: string }> {
    let r: Video | { error: string } | null = null;
    // Frame-exact first (virtual clock in the page + WebCodecs), real-time recording as the fallback.
    if (typeof VideoEncoder !== 'undefined') {
      r = await this.renderExact(html, seconds, o);
      if ('error' in r && r.error !== 'nocanvas') {
        this.onConsole?.(
          'warn',
          `rendu image par image impossible (${r.error}) : enregistrement en temps réel`,
        );
        r = null;
      }
    }
    r ??= await this.renderRealtime(html, seconds, o);
    // The preview comes back ALIVE (v62: after filming it stayed on the virtual clock, frozen on the last image).
    this.live(html, o);
    // An empty file is not a video (v62: « 0,0 Mo · 300×150 » was offered for download).
    if (!('error' in r) && ((r.width ?? 999) * (r.height ?? 999) < 320 * 200 || r.blob.size < 2_000))
      return {
        error: `vidéo vide (${r.width ?? '?'}×${r.height ?? '?'}, ${r.blob.size} octets) : la page ne dessine pas sa scène dans un canvas de la taille demandée`,
      };
    return r;
  }
  /** Reloads the page in normal (real-time, interactive) mode. */
  private live(html: string, o: { data?: unknown; meta?: unknown } = {}): void {
    this.token = Math.random().toString(36).slice(2);
    this.frame.srcdoc = buildDocument(html, { data: o.data, meta: o.meta, token: this.token });
  }

  /** The page runs on a virtual clock; each image is computed at its exact time, captured and encoded with its timestamp. */
  private renderExact(
    html: string,
    seconds: number,
    o: { data?: unknown; meta?: unknown; fps?: number },
  ): Promise<Video | { error: string }> {
    const fps = o.fps ?? 30;
    this.token = Math.random().toString(36).slice(2);
    this.errors = [];
    this.warnings = [];
    this.stats = null;
    const ms = Math.round(seconds * 1000);
    let stream: Mp4Stream | null = null;
    let opening: Promise<Mp4Stream | null> | null = null;
    return new Promise((resolve) => {
      let settled = false;
      const done = (v: Video | { error: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        this.exact = this.exactDone = null;
        this.video = null;
        resolve(v);
      };
      const t = setTimeout(() => done({ error: 'délai dépassé' }), ms * 20 + 60_000);
      this.video = (v) => done(v);
      this.exact = async (b, i, n) => {
        try {
          opening ??= openMp4(b.width, b.height, fps);
          stream ??= await opening;
          if (!stream) {
            b.close();
            return done({ error: 'encodeur MP4 indisponible' });
          }
          await stream.push(b, i);
          b.close();
          this.onFrames?.(i + 1, n);
          this.frame.contentWindow?.postMessage({ rz: 'next' }, '*');
        } catch (e) {
          done({ error: (e as Error).message });
        }
      };
      this.exactDone = async () => {
        if (!stream) return done({ error: 'aucune image reçue' });
        try {
          const r = await stream.close();
          done({ blob: r.blob, mime: r.mime, width: r.width, height: r.height });
        } catch (e) {
          done({ error: (e as Error).message });
        }
      };
      this.frame.srcdoc = buildDocument(html, {
        data: o.data,
        meta: o.meta,
        token: this.token,
        record: { ms, fps, exact: true },
      });
    });
  }

  private renderRealtime(
    html: string,
    seconds: number,
    o: { data?: unknown; meta?: unknown } = {},
  ): Promise<Video | { error: string }> {
    this.token = Math.random().toString(36).slice(2);
    this.errors = [];
    this.warnings = [];
    this.stats = null;
    const ms = Math.round(seconds * 1000);
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.video = null;
        resolve({ error: 'la vidéo n’a pas pu être enregistrée à temps (bibliothèques injoignables ?)' });
      }, ms + 45_000);
      this.video = (v) => {
        clearTimeout(t);
        resolve(v);
      };
      this.frame.srcdoc = buildDocument(html, {
        data: o.data,
        meta: o.meta,
        token: this.token,
        record: { ms, fps: 30 },
      });
    });
  }

  /**
   * Films the preview as displayed (DOM, SVG, CSS animations): the browser asks to share this tab, the capture is
   * cropped to the preview (Region Capture, Chrome / Edge) and recorded.
   */
  async recordScreen(ms: number): Promise<Video> {
    const md = navigator.mediaDevices as MediaDevices & { getDisplayMedia(o: unknown): Promise<MediaStream> };
    const stream = await md.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
    });
    const [track] = stream.getVideoTracks();
    const W = window as unknown as { CropTarget?: { fromElement(e: Element): Promise<unknown> } };
    const croppable = track as MediaStreamTrack & { cropTo?: (t: unknown) => Promise<void> };
    if (W.CropTarget && croppable.cropTo) await croppable.cropTo(await W.CropTarget.fromElement(this.frame));
    const mime = VIDEO_TYPES.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) {
      stream.getTracks().forEach((x) => x.stop());
      throw new Error('ce navigateur ne sait pas enregistrer de vidéo');
    }
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start(250);
    await new Promise((r) => setTimeout(r, ms));
    rec.stop();
    await done;
    stream.getTracks().forEach((x) => x.stop());
    return { blob: new Blob(parts, { type: mime.split(';')[0] }), mime };
  }

  /** Standalone file of the realization (opens anywhere: same engine, without the sandbox bridge). */
  static standalone(html: string, data?: unknown, meta?: unknown): string {
    return buildDocument(html, { bridge: '', data, meta });
  }

  dispose(): void {
    removeEventListener('message', this.onMsg);
    this.frame.remove();
  }
}
