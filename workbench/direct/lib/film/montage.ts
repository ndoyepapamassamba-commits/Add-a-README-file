// MONTAGE of the film circuit (23/10/2026), Mediabunny 1.61.3 (MPL-2.0, library used unmodified), two ways:
//  - RE-ENCODE (Chrome and Edge on Windows / macOS): every clip decoded, drawn into ONE canvas of the film's format
//    (cover when the ratio matches, contain otherwise), captions burnt in, H.264 + AAC (48 kHz stereo, resampled by
//    Mediabunny's AudioTransformOptions) in an MP4 whose moov box comes first; VP9 + Opus in WebM when the browser has
//    no H.264 encoder. Clips without sound get silence, so picture and voices never drift apart.
//  - COPY (a browser that cannot decode the clips, e.g. Chromium builds without H.264): the encoded packets are
//    joined as they are, timestamps shifted clip after clip (same codec and size required); captions come as .srt.
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny';
import type { Cue } from './circuit';

const RATE = 48_000;

export interface MontageResult {
  blob: Blob;
  durations: number[];
  duration: number;
  audio: boolean;
  mode: 'reencode' | 'copy';
  ext: 'mp4' | 'webm';
  /** Captions as SubRip text when they could not be burnt into the picture. */
  srt?: string;
}
interface Opts {
  width: number;
  height: number;
  captions?: (durations: number[]) => Cue[];
  onProgress?: (ratio: number, text: string) => void;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      out.push(line);
      line = w;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

function drawCaption(ctx: CanvasRenderingContext2D, W: number, H: number, text: string): void {
  const size = Math.round(Math.min(W, H) * 0.06);
  ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const lines = wrap(ctx, text, W * 0.84).slice(0, 3);
  const lh = size * 1.22;
  // lower third, above the band TikTok covers with its own buttons and caption
  let y = H * 0.74 - ((lines.length - 1) * lh) / 2;
  for (const l of lines) {
    ctx.lineWidth = Math.max(4, size * 0.2);
    ctx.strokeStyle = 'rgba(0,0,0,0.92)';
    ctx.strokeText(l, W / 2, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(l, W / 2, y);
    y += lh;
  }
}

const srtTime = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
export const toSrt = (cues: Cue[]) =>
  cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.texte}\n`).join('\n');

async function addSilence(src: AudioSampleSource, from: number, seconds: number): Promise<void> {
  if (seconds <= 0.005) return;
  const buf = new AudioBuffer({
    length: Math.max(1, Math.round(seconds * RATE)),
    numberOfChannels: 2,
    sampleRate: RATE,
  });
  for (const s of AudioSample.fromAudioBuffer(buf, from)) {
    await src.add(s);
    s.close();
  }
}

export async function montage(clips: Blob[], o: Opts): Promise<MontageResult> {
  const inputs = clips.map((b) => new Input({ source: new BlobSource(b), formats: ALL_FORMATS }));
  const videos = await Promise.all(inputs.map((i) => i.getPrimaryVideoTrack()));
  const audios = await Promise.all(inputs.map((i) => i.getPrimaryAudioTrack()));
  const missing = videos.findIndex((v) => !v);
  if (missing >= 0) throw new Error(`Le plan ${missing + 1} ne contient pas d’image vidéo lisible.`);
  const durations = await Promise.all(inputs.map((i) => i.computeDuration()));
  const decodable = (await Promise.all([...videos, ...audios].map((t) => (t ? t.canDecode() : true)))).every(
    Boolean,
  );
  const size = { width: o.width, height: o.height };
  const vcodec = (await canEncodeVideo('avc', size))
    ? 'avc'
    : (await canEncodeVideo('vp9', size))
      ? 'vp9'
      : null;
  if (decodable && vcodec) return reencode(videos as InputVideoTrack[], audios, durations, vcodec, o);
  return copy(videos as InputVideoTrack[], audios, durations, o);
}

async function reencode(
  videos: InputVideoTrack[],
  audios: (InputAudioTrack | null)[],
  durations: number[],
  vcodec: 'avc' | 'vp9',
  o: Opts,
): Promise<MontageResult> {
  const W = o.width;
  const H = o.height;
  const total = durations.reduce((a, b) => a + b, 0);
  const cues = o.captions?.(durations) ?? [];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const mp4 = vcodec === 'avc';
  const output = new Output({
    format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const video = new CanvasSource(canvas, { codec: vcodec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: 30 });
  let acodec: 'aac' | 'opus' | null = null;
  if (audios.some(Boolean)) {
    if (mp4 && (await canEncodeAudio('aac', { sampleRate: RATE, numberOfChannels: 2 }))) acodec = 'aac';
    else if (await canEncodeAudio('opus', { sampleRate: RATE, numberOfChannels: 2 })) acodec = 'opus';
  }
  const audio = acodec ? new AudioSampleSource({ codec: acodec, bitrate: QUALITY_HIGH }) : null;
  if (audio) output.addAudioTrack(audio);
  await output.start();

  // picture and sound advance side by side: the muxer interleaves the two tracks and waits for the slower one, so
  // feeding a whole clip of picture before its sound would block it (seen on the second plan)
  const offsets = durations.map((_, i) => durations.slice(0, i).reduce((a, b) => a + b, 0));
  const pictures = async () => {
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i]!;
      const d = durations[i]!;
      const t0 = offsets[i]!;
      const fit = Math.abs(v.displayWidth / v.displayHeight - W / H) / (W / H) < 0.08 ? 'cover' : 'contain';
      const first = await v.getFirstTimestamp();
      for await (const f of new CanvasSink(v, { width: W, height: H, fit, poolSize: 2 }).canvases()) {
        const t = f.timestamp - first;
        if (t >= d) break;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(f.canvas, 0, 0, W, H);
        const at = t0 + t;
        const cue = cues.find((c) => at >= c.start && at < c.end);
        if (cue) drawCaption(ctx, W, H, cue.texte);
        await video.add(at, Math.max(1 / 60, Math.min(f.duration || 1 / 30, d - t)));
        o.onProgress?.(at / total, `Plan ${i + 1} / ${videos.length}`);
      }
    }
  };
  const sound = async (src: AudioSampleSource) => {
    for (let i = 0; i < audios.length; i++) {
      const a = audios[i];
      const d = durations[i]!;
      const t0 = offsets[i]!;
      let end = t0;
      if (a && (a.numberOfChannels !== 2 || a.sampleRate !== RATE)) {
        // the encoder needs ONE audio format for the whole film ("Audio parameters must remain constant", seen with a
        // mono 44.1 kHz plan): this plan's sound is remixed to 48 kHz stereo by the browser's own resampler
        const af = await a.getFirstTimestamp();
        const parts: AudioBuffer[] = [];
        for await (const s of new AudioSampleSink(a).samples()) {
          const keep = s.timestamp - af < d;
          if (keep) parts.push(s.toAudioBuffer());
          s.close();
          if (!keep) break;
        }
        const n = parts.reduce((x, b) => x + b.length, 0);
        if (n) {
          const joined = new AudioBuffer({
            length: n,
            numberOfChannels: a.numberOfChannels,
            sampleRate: parts[0]!.sampleRate,
          });
          let at = 0;
          for (const b of parts) {
            for (let c = 0; c < b.numberOfChannels; c++) joined.copyToChannel(b.getChannelData(c), c, at);
            at += b.length;
          }
          const off = new OfflineAudioContext(
            2,
            Math.max(1, Math.ceil(Math.min(d, joined.duration) * RATE)),
            RATE,
          );
          const node = off.createBufferSource();
          node.buffer = joined;
          node.connect(off.destination);
          node.start();
          const out = await off.startRendering();
          for (const s of AudioSample.fromAudioBuffer(out, t0)) {
            await src.add(s);
            s.close();
          }
          end = t0 + out.duration;
        }
      } else if (a) {
        const af = await a.getFirstTimestamp();
        for await (const s of new AudioSampleSink(a).samples()) {
          const rel = s.timestamp - af;
          if (rel >= d || t0 + rel < end - 0.001) {
            s.close();
            if (rel >= d) break;
            continue;
          }
          s.setTimestamp(t0 + rel);
          end = s.timestamp + s.duration;
          await src.add(s);
          s.close();
        }
      }
      await addSilence(src, end, t0 + d - end);
    }
  };
  await Promise.all([pictures(), audio ? sound(audio) : Promise.resolve()]);
  o.onProgress?.(1, mp4 ? 'Écriture du MP4' : 'Écriture du WebM');
  await output.finalize();
  const buf = (output.target as BufferTarget).buffer;
  if (!buf) throw new Error('Montage vide.');
  return {
    blob: new Blob([buf], { type: mp4 ? 'video/mp4' : 'video/webm' }),
    durations,
    duration: total,
    audio: !!audio,
    mode: 'reencode',
    ext: mp4 ? 'mp4' : 'webm',
  };
}

async function copy(
  videos: InputVideoTrack[],
  audios: (InputAudioTrack | null)[],
  durations: number[],
  o: Opts,
): Promise<MontageResult> {
  const vc = videos[0]!.codec;
  const same = videos.every(
    (v) =>
      v.codec === vc && v.codedWidth === videos[0]!.codedWidth && v.codedHeight === videos[0]!.codedHeight,
  );
  const withSound = audios.filter((a): a is InputAudioTrack => !!a);
  const ac = withSound[0]?.codec ?? null;
  if (!vc || !same || withSound.some((a) => a.codec !== ac || a.sampleRate !== withSound[0]!.sampleRate))
    throw new Error(
      'Ce navigateur ne sait pas réencoder ces plans et ils n’ont pas tous le même format : ouvrez la Workbench dans Chrome ou Edge à jour, ou téléchargez les plans un par un.',
    );
  const total = durations.reduce((a, b) => a + b, 0);
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });
  const vsrc = new EncodedVideoPacketSource(vc);
  output.addVideoTrack(vsrc);
  const asrc = ac ? new EncodedAudioPacketSource(ac) : null;
  if (asrc) output.addAudioTrack(asrc);
  await output.start();
  const offsets = durations.map((_, i) => durations.slice(0, i).reduce((a, b) => a + b, 0));
  const pictures = async () => {
    let first = true;
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i]!;
      const base = await v.getFirstTimestamp();
      const cfg = await v.getDecoderConfig();
      for await (const pk of new EncodedPacketSink(v).packets()) {
        await vsrc.add(
          pk.clone({ timestamp: offsets[i]! + pk.timestamp - base }),
          first && cfg ? { decoderConfig: cfg } : undefined,
        );
        first = false;
      }
      o.onProgress?.((offsets[i]! + durations[i]!) / total, `Plan ${i + 1} / ${videos.length}`);
    }
  };
  const sound = async (src: EncodedAudioPacketSource) => {
    let first = true;
    for (let i = 0; i < audios.length; i++) {
      const a = audios[i];
      if (!a) continue;
      const ab = await a.getFirstTimestamp();
      const acfg = await a.getDecoderConfig();
      for await (const pk of new EncodedPacketSink(a).packets()) {
        if (pk.timestamp - ab >= durations[i]!) break;
        await src.add(
          pk.clone({ timestamp: offsets[i]! + pk.timestamp - ab }),
          first && acfg ? { decoderConfig: acfg } : undefined,
        );
        first = false;
      }
    }
  };
  await Promise.all([pictures(), asrc ? sound(asrc) : Promise.resolve()]);
  await output.finalize();
  const buf = (output.target as BufferTarget).buffer;
  if (!buf) throw new Error('Montage vide.');
  const cues = o.captions?.(durations) ?? [];
  return {
    blob: new Blob([buf], { type: 'video/mp4' }),
    durations,
    duration: total,
    audio: !!asrc,
    mode: 'copy',
    ext: 'mp4',
    srt: cues.length ? toSrt(cues) : undefined,
  };
}
