// Animatic / preview render in the browser: canvas + WebAudio + MediaRecorder (WebM, or MP4 when supported).
// It renders a moving 2.5D animatic (camera moves, punch-in on the speaker, voice-driven bounce, cross-fades; real scene
// videos when generated) with the real voices, music, SFX and word-highlighted subtitles),
// not the final film. When the browser lacks a capability the caller shows « Capability unavailable in current environment ».
import { blobs } from './blobs';
import type { Blueprint, Scene } from '../../../server/jev/studio/types';
import { duckingPoints } from '../../../server/jev/studio/timeline';
import { cameraAt, fadeIn, moveFor, rmsEnvelope, speakerSide, type Cam, type Move } from '../../../server/jev/studio/motion';
import {
  ASPECTS,
  SUBTITLE_STYLES,
  activeAt,
  timeSubtitles,
  type SubLine,
  type SubtitleStyle,
} from '../../../server/jev/studio/subtitles';

export function previewSupport(): { ok: boolean; mime: string | null; reason?: string } {
  if (
    typeof MediaRecorder === 'undefined' ||
    typeof HTMLCanvasElement === 'undefined' ||
    !('captureStream' in HTMLCanvasElement.prototype)
  )
    return {
      ok: false,
      mime: null,
      reason: 'Capability unavailable in current environment : MediaRecorder / canvas.captureStream absents.',
    };
  const mime =
    [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ].find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
  return mime
    ? { ok: true, mime }
    : {
        ok: false,
        mime: null,
        reason: 'Capability unavailable in current environment : aucun format vidéo supporté.',
      };
}
export interface PreviewOptions {
  /** Output width in px (height follows the aspect). Small by default: the render is real-time. */
  width?: number;
  style?: SubtitleStyle;
  onProgress?: (p: number, t: number) => void;
  signal?: AbortSignal;
  /** Per-scene duration override (e.g. the sum of measured voice durations). */
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function bitmapOf(id?: string): Promise<ImageBitmap | null> {
  if (!id) return null;
  const b = await blobs.get(id);
  return b ? createImageBitmap(b) : null;
}
function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, W: number, H: number, cam: Cam | number, alpha = 1) {
  const c: Cam = typeof cam === 'number' ? { zoom: cam, dx: 0, dy: 0, rot: 0 } : cam;
  const iw = (img as HTMLVideoElement).videoWidth || img.width;
  const ih = (img as HTMLVideoElement).videoHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(W / iw, H / ih) * c.zoom;
  const w = iw * s;
  const h = ih * s;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2 + c.dx * W, H / 2 + c.dy * H);
  ctx.rotate(c.rot);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}
/** A generated scene video (Video Factory), played muted in sync with the timeline. */
async function videoOf(id?: string): Promise<HTMLVideoElement | null> {
  if (!id) return null;
  const b = await blobs.get(id);
  if (!b) return null;
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.loop = true;
  v.src = URL.createObjectURL(b);
  try {
    await new Promise<void>((ok, ko) => {
      v.onloadeddata = () => ok();
      v.onerror = () => ko(new Error('video'));
      setTimeout(() => ok(), 4000);
    });
    return v.readyState >= 2 ? v : null;
  } catch {
    return null;
  }
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawSub(
  ctx: CanvasRenderingContext2D,
  line: SubLine,
  wi: number,
  W: number,
  H: number,
  style: SubtitleStyle,
) {
  const st = SUBTITLE_STYLES[style];
  const size = Math.round(H * st.size);
  ctx.font = `${st.weight} ${size}px ${st.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const words = line.words.map((w) => (st.upper ? w.text.toUpperCase() : w.text));
  const full = (line.emoji ? `${line.emoji} ` : '') + words.join(' ');
  const rows = wrap(ctx, full, W * 0.88);
  let idx = 0;
  const y0 = H * 0.78 - ((rows.length - 1) * size * 1.2) / 2;
  rows.forEach((row, r) => {
    const parts = row.split(' ');
    const widths = parts.map((p) => ctx.measureText(`${p} `).width);
    let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
    parts.forEach((p, k) => {
      const active = idx - (line.emoji ? 1 : 0) === wi;
      ctx.textAlign = 'left';
      ctx.lineWidth = size * 0.18;
      ctx.strokeStyle = st.stroke;
      ctx.strokeText(p, x, y0 + r * size * 1.2);
      ctx.fillStyle = active ? st.active : st.fill;
      ctx.fillText(p, x, y0 + r * size * 1.2);
      x += widths[k]!;
      idx++;
    });
  });
}
function placeholder(ctx: CanvasRenderingContext2D, sc: Scene, W: number, H: number) {
  ctx.fillStyle = '#20242c';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#cfd5e1';
  ctx.font = `600 ${Math.round(H * 0.03)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`${sc.scene_id} · image non générée`, W / 2, H * 0.4);
  ctx.font = `${Math.round(H * 0.024)}px system-ui, sans-serif`;
  wrap(ctx, sc.action, W * 0.8)
    .slice(0, 6)
    .forEach((l, i) => ctx.fillText(l, W / 2, H * 0.46 + i * H * 0.034));
}

/** Renders the animatic in real time. Resolves with the recorded file. */
export async function renderPreview(
  bp: Blueprint,
  o: PreviewOptions = {},
): Promise<{ blob: Blob; mime: string; seconds: number }> {
  const sup = previewSupport();
  if (!sup.ok) throw new Error(sup.reason);
  const [aw, ah] = ASPECTS[bp.aspect] ?? ASPECTS['9:16']!;
  const W = o.width ?? 360;
  const H = Math.round((W * ah) / aw);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const voiceSeconds: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(bp.audio.voices ?? {})) {
    const [sid, i] = k.split(':');
    (voiceSeconds[sid!] ??= [])[Number(i)] = v.seconds;
  }
  const lines = timeSubtitles(bp.scenes, { voiceSeconds });
  const sceneStart: number[] = [];
  let t = 0;
  for (const sc of bp.scenes) {
    sceneStart.push(t);
    const last = lines.filter((l) => l.start >= t && l.start < t + sc.duration + 10).at(-1);
    t += Math.max(sc.duration, last ? last.end - t + 0.4 : 0);
  }
  const total = t;
  const bitmaps = await Promise.all(bp.scenes.map((s) => bitmapOf(s.imageAssetId)));
  const videos = await Promise.all(bp.scenes.map((s) => videoOf(s.videoAssetId)));
  // One camera move per scene, chosen from its content, never the same twice in a row.
  const moves: Move[] = [];
  bp.scenes.forEach((s, i) => moves.push(moveFor(s, i, moves[i - 1])));

  // Audio graph → MediaStream
  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();
  const decode = async (id?: string) => {
    const b = id ? await blobs.get(id) : undefined;
    if (!b) return null;
    try {
      return await ac.decodeAudioData(await b.arrayBuffer());
    } catch {
      return null;
    }
  };
  const schedule = (buf: AudioBuffer, at: number, gain: number, loopTo?: number): GainNode => {
    const s = ac.createBufferSource();
    const g = ac.createGain();
    s.buffer = buf;
    g.gain.value = gain;
    if (loopTo) {
      s.loop = true;
      s.loopEnd = buf.duration;
    }
    s.connect(g).connect(dest);
    s.start(ac.currentTime + at);
    if (loopTo) s.stop(ac.currentTime + loopTo);
    return g;
  };
  const music = await decode(bp.audio.music?.assetId);
  const voiceBufs: { buf: AudioBuffer; at: number; env: number[]; side: number }[] = [];
  for (const [k, v] of Object.entries(bp.audio.voices ?? {})) {
    const [sid, i] = k.split(':');
    const line = lines.find((l) => l.sceneId === sid && l.index === Number(i));
    const buf = await decode(v.assetId);
    const sc = bp.scenes.find((x) => x.scene_id === sid);
    const speaker = sc?.dialogue[Number(i)]?.speaker ?? '';
    if (buf && line)
      voiceBufs.push({ buf, at: line.start, env: rmsEnvelope(buf.getChannelData(0), buf.sampleRate), side: speakerSide(sc?.characters ?? [], speaker) });
  }
  /** Who speaks at time t (punch-in towards them) and how loud (talking bounce). */
  const voiceAt = (now: number) => {
    for (const v of voiceBufs) {
      const rel = now - v.at;
      if (rel >= -0.15 && rel <= v.buf.duration + 0.25) {
        const k = Math.max(0, Math.floor(rel / 0.04));
        const punch = Math.min(1, Math.min(rel + 0.15, v.buf.duration + 0.25 - rel) / 0.3);
        return { punch, side: v.side, energy: v.env[Math.min(v.env.length - 1, k)] ?? 0 };
      }
    }
    return { punch: 0, side: 0, energy: 0 };
  };
  let punchS = 0;
  const sfx: { buf: AudioBuffer; at: number }[] = [];
  for (const e of bp.audio.sfx) {
    const buf = await decode(e.assetId);
    const si = bp.scenes.findIndex((s) => s.scene_id === e.sceneId);
    if (buf && si >= 0) sfx.push({ buf, at: sceneStart[si]! + 0.2 });
  }

  const stream = canvas.captureStream(30);
  dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  const rec = new MediaRecorder(stream, { mimeType: sup.mime!, videoBitsPerSecond: 1_500_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
  await ac.resume();
  if (music) {
    // Music ducking under the voices (short attack, longer release).
    const g = schedule(music, 0, 0.16, total);
    const pts = duckingPoints(voiceBufs.map((v) => ({ start: v.at, end: v.at + v.buf.duration })));
    g.gain.setValueAtTime(pts[0]!.v, ac.currentTime);
    for (const p of pts.slice(1)) g.gain.linearRampToValueAtTime(p.v, ac.currentTime + p.t);
  }
  for (const v of voiceBufs) schedule(v.buf, v.at, 1);
  for (const s of sfx) schedule(s.buf, s.at, 0.35);
  rec.start(500);
  const t0 = performance.now();
  const style = o.style ?? (bp.subtitles.style as SubtitleStyle);
  while (true) {
    const now = (performance.now() - t0) / 1000;
    if (now >= total || o.signal?.aborted) break;
    let si = 0;
    for (let i = 0; i < sceneStart.length; i++) if (now >= sceneStart[i]!) si = i;
    const sc = bp.scenes[si]!;
    const dur = (sceneStart[si + 1] ?? total) - sceneStart[si]!;
    const f = Math.min(1, (now - sceneStart[si]!) / Math.max(0.1, dur));
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const va = voiceAt(now);
    punchS += (va.punch - punchS) * 0.18;
    const drawShot = (k: number, fr: number, alpha: number) => {
      const vid = videos[k];
      const img = bitmaps[k];
      const cam = cameraAt(moves[k]!, fr, { punch: k === si ? punchS : 0, side: va.side, energy: k === si ? va.energy : 0, t: now });
      if (vid) {
        if (vid.paused) void vid.play().catch(() => undefined);
        // A real video clip already moves: only a gentle camera on top of it.
        cover(ctx, vid, W, H, { zoom: 1 + (cam.zoom - 1) * 0.3, dx: cam.dx * 0.3, dy: cam.dy * 0.3, rot: 0 }, alpha);
      } else if (img) cover(ctx, img, W, H, cam, alpha);
      else if (alpha >= 1) placeholder(ctx, bp.scenes[k]!, W, H);
    };
    const since = now - sceneStart[si]!;
    const a0 = fadeIn(since);
    if (a0 < 1 && si > 0) drawShot(si - 1, 1, 1);
    drawShot(si, f, si > 0 ? a0 : 1);
    for (const [k, v] of videos.entries()) if (v && k !== si && k !== si - 1 && !v.paused) v.pause();
    const a = activeAt(lines, now);
    if (a) drawSub(ctx, a.line, a.wordIndex, W, H, style);
    o.onProgress?.(now / total, now);
    await wait(33);
  }
  rec.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  await ac.close();
  bitmaps.forEach((b) => b?.close());
  videos.forEach((v) => {
    if (v) {
      v.pause();
      URL.revokeObjectURL(v.src);
    }
  });
  return { blob: new Blob(chunks, { type: sup.mime! }), mime: sup.mime!, seconds: total };
}
