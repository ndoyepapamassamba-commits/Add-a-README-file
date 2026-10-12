/**
 * RENDU IMAGE PAR IMAGE EXACT — the film is no longer filmed « live » (MediaRecorder): every picture is computed at its
 * exact instant n / 30 s and encoded with that timestamp (WebCodecs, muxed by Mediabunny), the sound is mixed offline
 * on the same clock. Whatever the speed of the machine: 30 pictures per second, none dropped, the mouths exactly on the
 * voices (v50 measured live: 4.9 pictures/s and the picture 0.37 s ahead of the sound). MP4 H.264 + AAC when the
 * browser can (what TikTok prefers), otherwise WebM VP9 + Opus.
 */
import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type WrappedCanvas,
} from 'mediabunny';

export const EXACT_FPS = 30;

export interface ExactEncoder {
  readonly mime: string;
  readonly fps: number;
  /** Encodes the canvas as it is now, as the picture of `t` seconds. */
  frame(t: number): Promise<void>;
  /** The whole mixed sound track (from t = 0). */
  audio(buf: AudioBuffer): Promise<void>;
  finish(): Promise<Blob>;
  cancel(): Promise<void>;
}

/** Can this browser encode frame by frame (WebCodecs)? */
export const exactSupported = () => typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof OfflineAudioContext !== 'undefined';

/** The encoder of a film drawn on `canvas` (null when the browser cannot encode: the live recorder takes over). */
export async function openExactEncoder(canvas: HTMLCanvasElement, fps = EXACT_FPS): Promise<ExactEncoder | null> {
  if (!exactSupported()) return null;
  const { width, height } = canvas;
  const video = await getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8', 'av1'], { width, height }).catch(() => null);
  if (!video) return null;
  const mp4 = video === 'avc';
  const audio = await getFirstEncodableAudioCodec(mp4 ? ['aac', 'opus'] : ['opus', 'vorbis'], { numberOfChannels: 2, sampleRate: 48000 }).catch(() => null);
  if (!audio) return null;
  const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
  const vs = new CanvasSource(canvas, { codec: video, quality: QUALITY_HIGH, keyFrameInterval: 1 });
  const as = new AudioBufferSource({ codec: audio, quality: QUALITY_HIGH });
  output.addVideoTrack(vs, { frameRate: fps });
  output.addAudioTrack(as);
  await output.start();
  const mime = mp4 ? `video/mp4` : `video/webm`;
  return {
    mime,
    fps,
    frame: (t) => vs.add(t, 1 / fps),
    audio: (buf) => as.add(buf),
    async finish() {
      vs.close();
      as.close();
      await output.finalize();
      return new Blob([output.target.buffer!], { type: mime });
    },
    async cancel() {
      await output.cancel().catch(() => undefined);
    },
  };
}

/** Lets the page breathe between two pictures without timers (not slowed down in a hidden tab, unlike setTimeout). */
export const yieldToPage = () =>
  new Promise<void>((ok) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => ok();
    ch.port2.postMessage(0);
  });

/**
 * The pictures of a generated clip read in order, exactly (decoded, not played): `at(t)` gives the picture shown at
 * `t` seconds of the clip (its last picture past its end).
 */
export class ClipFrames {
  private it: AsyncGenerator<WrappedCanvas, void, unknown>;
  private cur: WrappedCanvas | null = null;
  private next: WrappedCanvas | null = null;
  private done = false;
  private constructor(
    private input: Input,
    sink: CanvasSink,
    readonly duration: number,
  ) {
    this.it = sink.canvases();
  }
  static async open(blob: Blob): Promise<ClipFrames | null> {
    try {
      const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) return null;
      return new ClipFrames(input, new CanvasSink(track), await input.computeDuration());
    } catch {
      return null;
    }
  }
  private async pull(): Promise<WrappedCanvas | null> {
    if (this.done) return null;
    const r = await this.it.next();
    if (r.done) {
      this.done = true;
      return null;
    }
    return r.value;
  }
  async at(t: number): Promise<(HTMLCanvasElement | OffscreenCanvas) | null> {
    if (!this.cur) this.cur = await this.pull();
    if (!this.next) this.next = await this.pull();
    while (this.next && this.next.timestamp <= t + 1e-4) {
      this.cur = this.next;
      this.next = await this.pull();
    }
    return this.cur?.canvas ?? null;
  }
  dispose() {
    void this.it.return(undefined);
    this.input.dispose();
  }
}
