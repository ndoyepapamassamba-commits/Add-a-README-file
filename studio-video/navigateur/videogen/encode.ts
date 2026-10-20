// ENCODEUR MP4 IMAGE PAR IMAGE — WebCodecs (encodeur H.264 du navigateur) + mp4-muxer (MIT) : chaque image est
// dessinée puis encodée avec son horodatage exact, donc la vidéo a la durée et la cadence demandées, que la machine
// soit lente ou rapide (pas de capture en temps réel). Repli : VP9 dans le MP4, puis l'enregistreur du navigateur.
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { aacUntil, type AacTrack } from './audioCopy';

export interface EncodeJob {
  width: number;
  height: number;
  fps: number;
  frames: number;
  /** Draws frame i (0-based) and returns the canvas to encode. */
  draw: (i: number) => HTMLCanvasElement | OffscreenCanvas | Promise<HTMLCanvasElement | OffscreenCanvas>;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  bitrate?: number;
}
export interface Encoded {
  blob: Blob;
  mime: string;
  codec: string;
  width: number;
  height: number;
  frames: number;
  seconds: number;
  ms: number;
  /** Audio codec of the sound track, when there is one. */
  audio?: string;
}
/** A sound track to put in the MP4 (the first `seconds` of the buffer), re-encoded. */
export interface AudioTrack {
  buffer: AudioBuffer;
  seconds: number;
}
/** The original AAC samples, copied bit for bit (no re-encoding). */
export interface AudioCopy {
  copy: AacTrack;
  seconds: number;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

async function pickCodec(w: number, h: number, fps: number, bitrate: number): Promise<{ config: VideoEncoderConfig; muxCodec: 'avc' | 'vp9' } | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const candidates: [string, 'avc' | 'vp9'][] = [
    ['avc1.640033', 'avc'], // High 5.1 (up to 4K)
    ['avc1.640028', 'avc'], // High 4.0 (1080p)
    ['avc1.4d0028', 'avc'], // Main 4.0
    ['avc1.42001f', 'avc'], // Baseline 3.1
    ['vp09.00.40.08', 'vp9'],
  ];
  for (const [codec, muxCodec] of candidates) {
    const config: VideoEncoderConfig = { codec, width: w, height: h, bitrate, framerate: fps, ...(muxCodec === 'avc' ? { avc: { format: 'avc' } } : {}) };
    try {
      const s = await VideoEncoder.isConfigSupported(config);
      if (s.supported) return { config, muxCodec };
    } catch {
      /* next */
    }
  }
  return null;
}

/** A frame-exact MP4 being written: push images one by one (with their index), then close. */
export interface Mp4Stream {
  width: number;
  height: number;
  codec: string;
  push(src: CanvasImageSource, i: number): Promise<void>;
  close(): Promise<Encoded>;
}
async function pickAudio(buf: AudioBuffer): Promise<{ config: AudioEncoderConfig; mux: 'aac' | 'opus' } | null> {
  if (typeof AudioEncoder === 'undefined') return null;
  const ch = Math.min(2, buf.numberOfChannels);
  const tries: [string, 'aac' | 'opus'][] = [
    ['mp4a.40.2', 'aac'],
    ['opus', 'opus'],
  ];
  for (const [codec, mux] of tries) {
    const config: AudioEncoderConfig = { codec, sampleRate: buf.sampleRate, numberOfChannels: ch, bitrate: 128_000 };
    try {
      if ((await AudioEncoder.isConfigSupported(config)).supported) return { config, mux };
    } catch {
      /* next */
    }
  }
  return null;
}
/** Encodes the sound track into the muxer (all of it, before the pictures). */
async function encodeAudio(muxer: Muxer<ArrayBufferTarget>, track: AudioTrack, config: AudioEncoderConfig): Promise<void> {
  let failure: Error | null = null;
  const enc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (failure = e as Error) });
  enc.configure(config);
  const buf = track.buffer;
  const sr = buf.sampleRate;
  const ch = config.numberOfChannels;
  const total = Math.min(buf.length, Math.round(track.seconds * sr));
  const block = 4096;
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)));
  for (let off = 0; off < total; off += block) {
    if (failure) throw failure;
    const n = Math.min(block, total - off);
    const data = new Float32Array(n * ch);
    for (let c = 0; c < ch; c++) data.set(chans[c]!.subarray(off, off + n), c * n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round((off / sr) * 1e6), data });
    enc.encode(ad);
    ad.close();
  }
  await enc.flush();
  enc.close();
  if (failure) throw failure;
}
/** Writes the original AAC samples as they are (bit-exact sound). */
export function copyAac(muxer: Muxer<ArrayBufferTarget>, t: AacTrack, seconds: number): void {
  const n = aacUntil(t, seconds);
  let off = 0;
  for (let i = 0; i < n; i++) {
    const [size, ts, dur] = t.table[i]!;
    muxer.addAudioChunkRaw(t.data.subarray(off, off + size), 'key', ts, dur, i === 0 ? { decoderConfig: { codec: t.codec, sampleRate: t.sampleRate, numberOfChannels: t.channels, description: t.description } } : undefined);
    off += size;
  }
}
/** The sound of a video / audio file, decoded at 48 kHz (null when it has none or the browser cannot read it). */
export async function decodeAudio(file: Blob): Promise<AudioBuffer | null> {
  try {
    const ctx = new OfflineAudioContext(2, 48_000, 48_000);
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

/** Opens a streaming MP4 encoder (null when the browser has no WebCodecs encoder for these sizes). With `audio`, the
 *  sound track (AAC, else Opus) is written first, so the pictures pushed afterwards are in sync with it. */
export async function openMp4(w: number, h: number, fps: number, bitrate?: number, audio?: AudioTrack | AudioCopy | null): Promise<Mp4Stream | null> {
  const t0 = performance.now();
  const width = even(w);
  const height = even(h);
  const pick = await pickCodec(width, height, fps, bitrate ?? Math.round(width * height * fps * 0.12));
  if (!pick) return null;
  const copy = audio && 'copy' in audio ? audio : null;
  const enc = audio && 'buffer' in audio ? audio : null;
  const apick = enc ? await pickAudio(enc.buffer) : null;
  const audioOpt = copy
    ? { codec: 'aac' as const, numberOfChannels: copy.copy.channels, sampleRate: copy.copy.sampleRate }
    : apick
      ? { codec: apick.mux, numberOfChannels: apick.config.numberOfChannels, sampleRate: apick.config.sampleRate }
      : null;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: pick.muxCodec, width, height, frameRate: fps },
    ...(audioOpt ? { audio: audioOpt } : {}),
    fastStart: 'in-memory',
  });
  if (copy) copyAac(muxer, copy.copy, copy.seconds);
  else if (apick && enc) await encodeAudio(muxer, enc, apick.config);
  const audioLabel = copy ? `${copy.copy.codec} (copie exacte)` : apick?.config.codec;
  let failure: Error | null = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e as Error) });
  encoder.configure(pick.config);
  const step = 1_000_000 / fps;
  let frames = 0;
  // Sources of another size are drawn into a canvas of the encoder's size.
  const fit = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : null;
  return {
    width,
    height,
    codec: pick.config.codec,
    async push(src, i) {
      if (failure) throw failure;
      const sw = (src as { width: number }).width;
      const sh = (src as { height: number }).height;
      let img: CanvasImageSource = src;
      if ((sw !== width || sh !== height) && fit) {
        const g = fit.getContext('2d')!;
        g.drawImage(src, 0, 0, width, height);
        img = fit;
      }
      const frame = new VideoFrame(img, { timestamp: Math.round(i * step), duration: Math.round(step) });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      frames++;
      while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
    },
    async close() {
      await encoder.flush();
      encoder.close();
      if (failure) throw failure;
      muxer.finalize();
      const buf = (muxer.target as ArrayBufferTarget).buffer;
      return { blob: new Blob([buf], { type: 'video/mp4' }), mime: 'video/mp4', codec: pick.config.codec, width, height, frames, seconds: frames / fps, ms: Math.round(performance.now() - t0), audio: audioLabel };
    },
  };
}

/** Frame-exact MP4 of `frames` images drawn by `draw`. */
export async function encodeMp4(job: EncodeJob): Promise<Encoded> {
  const t0 = performance.now();
  const width = even(job.width);
  const height = even(job.height);
  const bitrate = job.bitrate ?? Math.round(width * height * job.fps * 0.12);
  const pick = await pickCodec(width, height, job.fps, bitrate);
  if (!pick) return recordFallback(job, t0);
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: pick.muxCodec, width, height, frameRate: job.fps }, fastStart: 'in-memory' });
  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (failure = e as Error),
  });
  encoder.configure(pick.config);
  const step = 1_000_000 / job.fps;
  for (let i = 0; i < job.frames; i++) {
    if (job.signal?.aborted) throw new Error('rendu interrompu');
    if (failure) throw failure;
    const canvas = await job.draw(i);
    const frame = new VideoFrame(canvas as CanvasImageSource, { timestamp: Math.round(i * step), duration: Math.round(step) });
    encoder.encode(frame, { keyFrame: i % (job.fps * 2) === 0 });
    frame.close();
    // Keep the encoder queue short (memory) and let the page breathe.
    while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
    if (i % 4 === 0) {
      job.onProgress?.(i + 1, job.frames);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  muxer.finalize();
  const buf = (muxer.target as ArrayBufferTarget).buffer;
  job.onProgress?.(job.frames, job.frames);
  return { blob: new Blob([buf], { type: 'video/mp4' }), mime: 'video/mp4', codec: pick.config.codec, width, height, frames: job.frames, seconds: job.frames / job.fps, ms: Math.round(performance.now() - t0) };
}

/** No WebCodecs: real-time recording of the canvas (MP4 where the browser records it, WebM otherwise). */
async function recordFallback(job: EncodeJob, t0: number): Promise<Encoded> {
  const first = await job.draw(0);
  if (!(first instanceof HTMLCanvasElement)) throw new Error('enregistrement impossible : ce navigateur n’a ni WebCodecs ni capture de canevas');
  const types = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mime = types.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('ce navigateur ne sait pas enregistrer de vidéo');
  const rec = new MediaRecorder(first.captureStream(job.fps), { mimeType: mime, videoBitsPerSecond: 10_000_000 });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(250);
  const start = performance.now();
  for (let i = 1; i < job.frames; i++) {
    if (job.signal?.aborted) break;
    const due = start + (i * 1000) / job.fps;
    await new Promise((r) => setTimeout(r, Math.max(0, due - performance.now())));
    await job.draw(i);
    job.onProgress?.(i + 1, job.frames);
  }
  rec.stop();
  await done;
  const type = mime.split(';')[0]!;
  return { blob: new Blob(parts, { type }), mime: type, codec: mime, width: first.width, height: first.height, frames: job.frames, seconds: job.frames / job.fps, ms: Math.round(performance.now() - t0) };
}
