// Animatic / preview render in the browser: canvas + WebAudio + MediaRecorder (WebM, or MP4 when supported).
// It renders a moving 2.5D animatic (camera moves, punch-in on the speaker, voice-driven bounce, cross-fades; real scene
// videos when generated) with the real voices, music, SFX and word-highlighted subtitles),
// not the final film. When the browser lacks a capability the caller shows « Capability unavailable in current environment ».
import { PuppetStage } from './puppetRender';
import { masksFromImage } from './bodyDetect';
import { gestureOf } from '../../../server/jev/studio/puppet';
import { wordViseme } from '../../../server/jev/studio/emotionLayer';
import { mouthShape } from '../../../server/jev/studio/actor/cast3d';
import { audioVisemes, mouthAt, type MouthFrame } from '../../../server/jev/studio/actor/audioVisemes';
import { ClipFrames, exactSupported, openExactEncoder, yieldToPage } from './exactRender';
import type { Theater3D } from './actors3d';
import { decorFor, extrasPool } from './actorsCast';
import { VIRAL_FORMAT, VIRAL_PRESETS, captionChunk, fitBand, parallelChunk, reactionFor, shockAfter, type ReactionKind } from '../../../server/jev/studio/viralFormat';
import { blobs } from './blobs';
import type { Blueprint, Scene } from '../../../server/jev/studio/types';
import { duckingPoints } from '../../../server/jev/studio/timeline';
import { dimensionOf } from '../../../server/jev/studio/style';
import { breathing, cameraAt, fadeIn, moveFor, rmsEnvelope, speakerSide, talkWarp, type Cam, type Move, type TalkWarp } from '../../../server/jev/studio/motion';
import {
  ASPECTS,
  SUBTITLE_STYLES,
  activeAt,
  captionWords,
  timeSubtitles,
  type SubLine,
  type SubtitleStyle,
} from '../../../server/jev/studio/subtitles';

/** Can this browser make the film (frame-by-frame encoder, or at least the live recorder)? */
export function previewSupport(): { ok: boolean; mime: string | null; reason?: string } {
  const live = recorderSupport();
  return live.ok || !exactSupported() ? live : { ok: true, mime: 'video/mp4' };
}
function recorderSupport(): { ok: boolean; mime: string | null; reason?: string } {
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
  /** Cinema finish (warm grade + soft vignette), on by default. */
  cinema?: boolean;
  /**
   * « À mourir de rire » viral format (on by default in 9:16): sharp shot in a band with a blurred fill, French
   * karaoke captions under the picture (keyword highlighted; English added only with `bilingual`) and a « stupeur » insert after each punchline.
   */
  viral?: boolean;
  /** English line under the French one (off by default). */
  bilingual?: boolean;
  /** Called when the render pauses (tab hidden) and resumes. */
  onPause?: (paused: boolean) => void;
  /** One sketch per scene: the « stupeur » insert plays between every scene. */
  compilation?: boolean;
  /** « court » preset: one sketch + the reaction at the end (≈ 8 s, made to loop). */
  short?: boolean;
  /** Caption keyword as a coloured word (default) or in a coloured box. */
  captionStyle?: 'word' | 'box';
  /** ACTEURS 3D: scenes without a clip are played by the film's 3D cast (bp.actors3d); false turns it off. */
  actors3d?: boolean;
  /** Notes of the render the owner should know (a .vrm that could not be read, WebGL missing…). */
  onNote?: (msg: string) => void;
  /** Exact render (every picture at its instant, encoded frame by frame) when the browser can; false = live recorder. */
  exact?: boolean;
}
type Rect = { x: number; y: number; w: number; h: number };
/** The cinema finish, prepared once: a soft vignette and a warm highlight grade (no frame is re-encoded twice). */
function cinemaGrade(W: number, H: number, ctx: CanvasRenderingContext2D): { vignette: CanvasGradient; warm: CanvasGradient; grain: CanvasPattern | null } {
  const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.38)');
  const warm = ctx.createLinearGradient(0, 0, 0, H);
  warm.addColorStop(0, 'rgba(255,190,120,0.06)');
  warm.addColorStop(1, 'rgba(40,20,80,0.08)');
  // FILM GRAIN: one fine grain over the whole picture (actors and set alike) — the layers read as ONE photograph.
  const n = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const ng = n.getContext('2d')!;
  const id = ng.createImageData(256, 256);
  let seed = 7;
  for (let i = 0; i < id.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = 128 + ((seed / 2147483647 - 0.5) * 2) * 90;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  ng.putImageData(id, 0, 0);
  return { vignette, warm, grain: ctx.createPattern(n, 'repeat') };
}
function cinemaFinish(ctx: CanvasRenderingContext2D, W: number, H: number, g: { vignette: CanvasGradient; warm: CanvasGradient; grain: CanvasPattern | null }, t = 0) {
  ctx.save();
  ctx.fillStyle = g.warm;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = g.vignette;
  ctx.fillRect(0, 0, W, H);
  if (g.grain) {
    // A new grain every picture (its offset moves with the film clock), scaled to the output (finer in HD).
    const k = Math.floor(t * 30);
    const ox = (k * 97) % 256;
    const oy = (k * 57) % 256;
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.07;
    ctx.translate(-ox, -oy);
    ctx.fillStyle = g.grain;
    ctx.fillRect(0, 0, W + 256, H + 256);
  }
  ctx.restore();
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function bitmapOf(id?: string): Promise<ImageBitmap | null> {
  if (!id) return null;
  const b = await blobs.get(id);
  return b ? createImageBitmap(b) : null;
}
const sizeOf = (img: CanvasImageSource & { width: number; height: number }) => [(img as HTMLVideoElement).videoWidth || img.width, (img as HTMLVideoElement).videoHeight || img.height] as const;
function coverIn(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, r: Rect, cam: Cam | number, alpha = 1, clip = false) {
  const c: Cam = typeof cam === 'number' ? { zoom: cam, dx: 0, dy: 0, rot: 0 } : cam;
  const [iw, ih] = sizeOf(img);
  if (!iw || !ih) return;
  const s = Math.max(r.w / iw, r.h / ih) * c.zoom;
  const w = iw * s;
  const h = ih * s;
  ctx.save();
  if (clip) {
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
  }
  ctx.globalAlpha = alpha;
  ctx.translate(r.x + r.w / 2 + c.dx * r.w, r.y + r.h / 2 + c.dy * r.h);
  ctx.rotate(c.rot);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}
function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, W: number, H: number, cam: Cam | number, alpha = 1) {
  coverIn(ctx, img, { x: 0, y: 0, w: W, h: H }, cam, alpha);
}
/**
 * Vertical framing of the viral format: a landscape / square shot stays whole and sharp in a band across the middle, the
 * same shot enlarged and blurred fills the top and the bottom (no black bars, nothing cropped). Returns the band.
 */
export function framed(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, W: number, H: number, cam: Cam, alpha: number, viral: boolean): Rect {
  const [iw, ih] = sizeOf(img);
  const b = viral ? fitBand(iw, ih, W, H) : { x: 0, y: 0, w: W, h: H, fill: false };
  if (!b.fill) {
    cover(ctx, img, W, H, cam, alpha);
    return { x: 0, y: 0, w: W, h: H };
  }
  ctx.save();
  ctx.filter = `blur(${Math.max(6, Math.round(W * 0.035))}px) brightness(0.82) saturate(1.1)`;
  cover(ctx, img, W, H, { zoom: 1.12 + (cam.zoom - 1) * 0.5, dx: cam.dx * 0.5, dy: cam.dy * 0.5, rot: 0 }, alpha);
  ctx.restore();
  coverIn(ctx, img, b, cam, alpha, true);
  return b;
}
/** The « stupeur » insert: our own vector shocked face popping in on black (overshoot, then a small tremble). */
export function shockFrame(ctx: CanvasRenderingContext2D, W: number, H: number, age: number, kind: ReactionKind = 'choc', live = false) {
  // Over the punchline's picture, darkened (the scene stays readable behind the reaction) — never a black screen. Over a
  // LIVING scene (the actors keep reacting under it) the shade is lighter and the emoji smaller: the faces stay readable.
  ctx.fillStyle = `rgba(0,0,0,${Math.min(live ? 0.18 : 0.55, age * 2.2)})`;
  ctx.fillRect(0, 0, W, H);
  const pop = age < 0.25 ? Math.sin((age / 0.25) * Math.PI * 0.5) * 1.15 : 1 + 0.15 * Math.exp(-(age - 0.25) * 8) * Math.cos((age - 0.25) * 18);
  // Over a living scene the emoji sits at the top of the picture, small, above the heads (v9 measured it on a face).
  const r = Math.min(W, H) * (live ? 0.1 : 0.3) * pop;
  const cx = W / 2 + Math.sin(age * 60) * W * 0.004;
  const cy = live ? H * 0.03 + Math.min(W, H) * 0.1 : H / 2;
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#ffe680');
  g.addColorStop(0.7, '#f7b928');
  g.addColorStop(1, '#d9861a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  const eye = (ex: number, ey: number, closed: boolean, sx: number) => {
    if (closed) {
      ctx.strokeStyle = '#3b2208';
      ctx.lineWidth = r * 0.07;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex, ey + r * 0.05, r * 0.15, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      return;
    }
    const big = kind === 'choc' ? 1 : 0.7;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(ex, ey, r * 0.24 * big, r * 0.28 * big, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5b3410';
    ctx.beginPath();
    ctx.arc(ex + sx * r * 0.02, ey + r * 0.03, r * 0.1 * big, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(ex + sx * r * 0.02, ey + r * 0.03, r * 0.05 * big, 0, Math.PI * 2);
    ctx.fill();
  };
  const ey = cy - r * 0.22;
  if (kind === 'cool') {
    // Sunglasses: two dark lenses and a bridge, tilted a little.
    ctx.save();
    ctx.translate(cx, ey);
    ctx.rotate(-0.08);
    ctx.fillStyle = '#111';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * r * 0.36, 0, r * 0.3, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(-r * 0.12, -r * 0.05, r * 0.24, r * 0.06);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.45, -r * 0.06, r * 0.08, r * 0.04, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else
    for (const sx of [-1, 1]) {
      const ex = cx + sx * r * 0.36;
      eye(ex, ey, kind === 'rire' || (kind === 'clin' && sx > 0), sx);
      if (kind === 'choc') {
        ctx.strokeStyle = '#5b3410';
        ctx.lineWidth = r * 0.07;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(ex, ey - r * 0.25, r * 0.22, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    }
  if (kind === 'choc') {
    ctx.fillStyle = '#5a0f12';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.38, r * 0.26, r * 0.32 * Math.min(1, 0.6 + age * 2), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0656b';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.56, r * 0.18, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'rire') {
    // Wide open laughing mouth + tears of joy bouncing.
    ctx.fillStyle = '#5a0f12';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy + r * 0.12);
    ctx.quadraticCurveTo(cx, cy + r * 0.95, cx + r * 0.5, cy + r * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - r * 0.4, cy + r * 0.12, r * 0.8, r * 0.1);
    ctx.fillStyle = '#5ec8ff';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + sx * r * 0.62, ey + r * 0.2 + Math.abs(Math.sin(age * 9)) * r * 0.1, r * 0.08, r * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Smirk (wink / cool): a lopsided smile, tongue out for the wink.
    ctx.strokeStyle = '#5a0f12';
    ctx.lineWidth = r * 0.08;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.35, cy + r * 0.4);
    ctx.quadraticCurveTo(cx + r * 0.05, cy + r * 0.62, cx + r * 0.42, cy + r * 0.28);
    ctx.stroke();
    if (kind === 'clin') {
      ctx.fillStyle = '#e0656b';
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.1, cy + r * 0.6, r * 0.11, r * 0.13, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
/** Bilingual karaoke captions: 1–3 words, heavy font, black outline; keyword in cyan (English) / yellow (French). */
export function drawChunk(ctx: CanvasRenderingContext2D, chunk: { words: string[]; key: number }, cx: number, cy: number, size: number, key: string, maxW: number, box?: string) {
  let px = size;
  ctx.font = VIRAL_FORMAT.font.replace('{px}', String(px));
  const text = chunk.words.join(' ').toUpperCase();
  while (ctx.measureText(text).width > maxW && px > 10) {
    px -= 2;
    ctx.font = VIRAL_FORMAT.font.replace('{px}', String(px));
  }
  const parts = chunk.words.map((w) => w.toUpperCase());
  const widths = parts.map((p, i) => ctx.measureText(p + (i < parts.length - 1 ? ' ' : '')).width);
  let x = cx - widths.reduce((a, b) => a + b, 0) / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  parts.forEach((p, i) => {
    const wordW = ctx.measureText(p).width;
    if (box && i === chunk.key) {
      // Keyword in a coloured box (dark text), the variant of the most viewed account.
      const pad = px * 0.14;
      ctx.fillStyle = box;
      ctx.beginPath();
      ctx.roundRect(x - pad, cy - px * 0.62, wordW + pad * 2, px * 1.2, px * 0.12);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillText(p, x, cy);
      x += widths[i]!;
      return;
    }
    ctx.lineWidth = px * 0.22;
    ctx.strokeStyle = '#000';
    ctx.strokeText(p, x, cy);
    ctx.fillStyle = i === chunk.key ? key : '#fff';
    ctx.fillText(p, x, cy);
    x += widths[i]!;
  });
}
/** The speaker's zone re-drawn stretched / nodding, blended in with a soft oval mask (no visible seams). */
let talkBuf: OffscreenCanvas | null = null;
function talkLayer(ctx: CanvasRenderingContext2D, W: number, H: number, w: TalkWarp, ox = 0, oy = 0): void {
  if (typeof OffscreenCanvas === 'undefined') return;
  const zx = Math.round(ox + w.zone.x * W);
  const zy = Math.round(oy + w.zone.y * H);
  const zw = Math.round(w.zone.w * W);
  const zh = Math.round(w.zone.h * H);
  if (zw < 8 || zh < 8) return;
  if (!talkBuf || talkBuf.width !== zw || talkBuf.height !== zh) talkBuf = new OffscreenCanvas(zw, zh);
  const g = talkBuf.getContext('2d');
  if (!g) return;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, zw, zh);
  // Copy the zone from the frame just drawn, transformed around its bottom centre.
  g.save();
  g.translate(zw / 2, zh);
  g.rotate(w.rot);
  g.scale(w.scaleX, w.scaleY);
  g.drawImage(ctx.canvas, zx, zy, zw, zh, -zw / 2, -zh + w.dy * H, zw, zh);
  g.restore();
  // Soft oval mask: the change fades out towards the zone's edges.
  g.globalCompositeOperation = 'destination-in';
  const grad = g.createRadialGradient(zw / 2, zh * 0.55, Math.min(zw, zh) * 0.18, zw / 2, zh * 0.55, Math.max(zw, zh) * 0.55);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, zw, zh);
  ctx.drawImage(talkBuf, zx, zy);
}
/**
 * A generated scene video, muted, DRIVEN by the film clock (not looped: v44 showed a clip shorter than its lines
 * freezing / jumping back to its first frame).
 */
async function videoOf(id?: string): Promise<HTMLVideoElement | null> {
  if (!id) return null;
  const b = await blobs.get(id);
  if (!b) return null;
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.loop = false;
  v.preload = 'auto';
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
): Promise<{ blob: Blob; mime: string; seconds: number; hiddenPauses?: number; fps?: number }> {
  const sup = recorderSupport();
  if (!sup.ok && !exactSupported()) throw new Error(sup.reason);
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
    const last = lines.filter((l) => l.sceneId === sc.scene_id).at(-1);
    // The VOICES set the pace (the story's duration is only an estimate): a scene lasts its lines + a short beat; a
    // scene without a line stays 3 s at most — never 10 s of a frozen picture.
    t += last ? Math.max(1.6, last.end - t + 0.5) : Math.min(sc.duration || 3, 3);
  }
  // « Stupeur » inserts after the punchlines (or between sketches): the timeline, the voices and the SFX shift after them.
  const viral = o.viral ?? bp.aspect === '9:16';
  const shock = viral ? shockAfter(bp.scenes, o.compilation ?? false) : bp.scenes.map(() => false);
  // One story = ONE reaction insert, after its punchline (the last one the beats name); never two in a row.
  if (!o.compilation) {
    const lastShock = shock.lastIndexOf(true);
    shock.forEach((_, i) => (shock[i] = i === lastShock));
  }
  // « court »: the reaction closes the sketch (after the last scene), the clip then loops on TikTok.
  if (viral && o.short && bp.scenes.length) shock[bp.scenes.length - 1] = true;
  const reactions = bp.scenes.map((s) => reactionFor(s.emotion, s.beat));
  const sceneEnd: number[] = bp.scenes.map((_, i) => sceneStart[i + 1] ?? t);
  const off: number[] = [];
  let acc = 0;
  bp.scenes.forEach((_, i) => {
    off.push(acc);
    if (shock[i]) acc += o.short && i === bp.scenes.length - 1 ? VIRAL_PRESETS.court.reactionSeconds : VIRAL_FORMAT.shockSeconds;
  });
  const shockAt: number[] = [];
  bp.scenes.forEach((_, i) => {
    sceneStart[i] = sceneStart[i]! + off[i]!;
    sceneEnd[i] = sceneEnd[i]! + off[i]!;
    if (shock[i]) shockAt.push(sceneEnd[i]!);
  });
  const sceneIdx = new Map(bp.scenes.map((s, i) => [s.scene_id, i]));
  for (const l of lines) {
    const d = off[sceneIdx.get(l.sceneId) ?? 0] ?? 0;
    if (!d) continue;
    l.start += d;
    l.end += d;
    for (const w of l.words) {
      w.start += d;
      w.end += d;
    }
  }
  const total = t + acc;
  const bitmaps = await Promise.all(bp.scenes.map((s) => bitmapOf(s.imageAssetId)));
  const videos = await Promise.all(bp.scenes.map((s) => videoOf(s.videoAssetId)));
  // Speed of each clip: a clip at least 75 % as long as its scene is stretched to fill it; shorter ones play at 1×.
  const clipRate = videos.map((v, k) => {
    const d = v && Number.isFinite(v.duration) ? v.duration : 0;
    const want = (bp.scenes[k]?.duration ?? 0) || d;
    return d && want > d ? (d / want >= 0.75 ? Math.round((d / want) * 100) / 100 : 1) : 1;
  });
  // Rigged scenes (no video clip) are animated by the puppet engine.
  const plates = await Promise.all(bp.scenes.map((s, k) => (bitmaps[k] && !videos[k] && s.rig?.characters.length ? bitmapOf(s.plateAssetId) : null)));
  // CORPS ENTIER: the exact cut-outs read in the browser (one grey slice per character), at the stage's size.
  const masks = await Promise.all(
    bp.scenes.map(async (s, k) => {
      const b = bitmaps[k];
      if (!b || videos[k] || !s.rig?.characters.length || !s.maskAssetId) return null;
      const m = await bitmapOf(s.maskAssetId);
      if (!m) return null;
      const { w, h } = PuppetStage.sizeFor(b);
      const out = masksFromImage(m, s.rig.characters.length, w, h);
      m.close();
      return out;
    }),
  );
  // ACTEURS 3D: one WebGL theatre for the film; every scene without a clip is played by the film's 3D cast.
  let theater: Theater3D | null = null;
  const cast3d = o.actors3d === false ? null : bp.actors3d?.cast;
  if (cast3d && bp.scenes.some((_, k) => !videos[k])) {
    try {
      const { Theater3D } = await import('./actors3d');
      const [aw3, ah3] = ASPECTS[bp.aspect] ?? ASPECTS['9:16']!;
      theater = new Theater3D(W, Math.round((W * ah3) / aw3));
      const failed = new Set<string>();
      for (const [k, sc] of bp.scenes.entries()) {
        if (videos[k]) continue;
        const mine = lines.filter((l) => l.sceneId === sc.scene_id);
        const cue = mine.map((l) => ({ speaker: l.speaker, start: l.start - sceneStart[k]!, end: l.end - sceneStart[k]!, text: l.text, gesture: sc.dialogue[l.index]?.gesture, emotion: sc.dialogue[l.index]?.emotion }));
        const names = sc.characters.length ? sc.characters : [...new Set(mine.map((l) => l.speaker))];
        const bd = decorFor(sc.location);
        const backdrop = bd ? await blobs.get(bd.assetId) : null;
        const backdropDepth = bd?.depthAssetId ? ((await blobs.get(bd.depthAssetId)) ?? null) : null;
        const backdropPeople = bd?.peopleAssetId ? ((await blobs.get(bd.peopleAssetId)) ?? null) : null;
        const r = await theater.addScene(k, { names, lines: cue, seconds: Math.max(1, sceneEnd[k]! - sceneStart[k]!), action: sc.action, location: sc.location, cast: cast3d, backdrop, ...(bd ? { backdropId: bd.assetId, backdropDepth, backdropPeople } : {}), extras: extrasPool(), ...(bd?.fit ? { backdropFit: bd.fit } : {}) }, (id) => blobs.get(id));
        r.vrmFailed.forEach((n) => failed.add(n));
      }
      if (failed.size) o.onNote?.(`modèle .vrm illisible pour ${[...failed].join(', ')} → acteur procédural`);
    } catch (e) {
      theater?.dispose();
      theater = null;
      o.onNote?.(`Acteurs 3D indisponibles (${(e as Error).message.slice(0, 80)}) → Marionnette / 2.5D`);
    }
  }
  const stages = bitmaps.map((b, k) => (b && !videos[k] && !theater?.has(k) && bp.scenes[k]!.rig?.characters.length ? new PuppetStage(b, bp.scenes[k]!.rig!, plates[k], masks[k]) : null));
  // One camera move per scene, chosen from its content, never the same twice in a row.
  const dim3d = dimensionOf(bp.styleDNA) === '3D';
  const moves: Move[] = [];
  bp.scenes.forEach((s, i) => moves.push(moveFor(s, i, moves[i - 1])));

  // Sounds decoded once; mixed live (recorder) or offline (exact render) on the film clock.
  const ac = new AudioContext();
  const decode = async (id?: string) => {
    const b = id ? await blobs.get(id) : undefined;
    if (!b) return null;
    try {
      return await ac.decodeAudioData(await b.arrayBuffer());
    } catch {
      return null;
    }
  };
  const music = await decode(bp.audio.music?.assetId);
  const voiceBufs: { buf: AudioBuffer; at: number; env: number[]; side: number; mouth: MouthFrame[] }[] = [];
  for (const [k, v] of Object.entries(bp.audio.voices ?? {})) {
    const [sid, i] = k.split(':');
    const line = lines.find((l) => l.sceneId === sid && l.index === Number(i));
    const buf = await decode(v.assetId);
    const sc = bp.scenes.find((x) => x.scene_id === sid);
    const speaker = sc?.dialogue[Number(i)]?.speaker ?? '';
    if (buf && line)
      voiceBufs.push({
        buf,
        at: line.start,
        env: rmsEnvelope(buf.getChannelData(0), buf.sampleRate),
        side: speakerSide(sc?.characters ?? [], speaker),
        // LIP-SYNC ON THE REAL VOICE: jaw from the loudness and the first formant, lips from the second (i / ou).
        mouth: audioVisemes(buf.getChannelData(0), buf.sampleRate),
      });
  }
  /** Who speaks at time t (punch-in towards them) and how loud (talking bounce). */
  const voiceAt = (now: number) => {
    for (const v of voiceBufs) {
      const rel = now - v.at;
      if (rel >= -0.15 && rel <= v.buf.duration + 0.25) {
        const k = Math.max(0, Math.floor(rel / 0.04));
        const punch = Math.min(1, Math.min(rel + 0.15, v.buf.duration + 0.25 - rel) / 0.3);
        return { punch, side: v.side, energy: v.env[Math.min(v.env.length - 1, k)] ?? 0, mouth: mouthAt(v.mouth, rel) };
      }
    }
    return { punch: 0, side: 0, energy: 0, mouth: null as MouthFrame | null };
  };
  let punchS = 0;
  let punchA = 0;
  // The camera side glides towards the speaker (held between lines): no jump when the speaker changes.
  let sideHeld = 0;
  let sideS = 0;
  let slowEnergy = 0;
  const sfx: { buf: AudioBuffer; at: number }[] = [];
  for (const e of bp.audio.sfx) {
    const buf = await decode(e.assetId);
    const si = bp.scenes.findIndex((s) => s.scene_id === e.sceneId);
    if (buf && si >= 0) sfx.push({ buf, at: sceneStart[si]! + 0.2 });
  }

  /** Every sound of the film (music ducked under the voices, voices, effects, the « stupeur » hit) from `t0` of `c`. */
  const mix = (c: BaseAudioContext, out: AudioNode, t0: number) => {
    const schedule = (buf: AudioBuffer, at: number, gain: number, loopTo?: number): GainNode => {
      const s = c.createBufferSource();
      const g = c.createGain();
      s.buffer = buf;
      g.gain.value = gain;
      if (loopTo) {
        s.loop = true;
        s.loopEnd = buf.duration;
      }
      s.connect(g).connect(out);
      s.start(t0 + at);
      if (loopTo) s.stop(t0 + loopTo);
      return g;
    };
    if (music) {
      // Music ducking under the voices (short attack, longer release).
      const g = schedule(music, 0, 0.16, total);
      const pts = duckingPoints(voiceBufs.map((v) => ({ start: v.at, end: v.at + v.buf.duration })));
      g.gain.setValueAtTime(pts[0]!.v, t0);
      for (const p of pts.slice(1)) g.gain.linearRampToValueAtTime(p.v, t0 + p.t);
    }
    for (const v of voiceBufs) schedule(v.buf, v.at, 1);
    for (const x of sfx) schedule(x.buf, x.at, 0.35);
    // The « stupeur » hit, synthesised (a falling « boing » + a soft thump), no sound file needed.
    for (const at of shockAt) {
      const t1 = t0 + at;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, t1);
      osc.frequency.exponentialRampToValueAtTime(140, t1 + 0.45);
      g.gain.setValueAtTime(0.0001, t1);
      g.gain.exponentialRampToValueAtTime(0.35, t1 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.6);
      osc.connect(g).connect(out);
      osc.start(t1);
      osc.stop(t1 + 0.65);
    }
  };
  // RENDU EXACT: every picture at its instant n/30 s, encoded with its timestamp (none dropped, sound in sync); the
  // generated clips are decoded picture by picture. The live recorder only when the browser cannot encode.
  const exact = o.exact === false ? null : await openExactEncoder(canvas).catch(() => null);
  if (!exact && !sup.ok) throw new Error(sup.reason);
  const clips = exact
    ? await Promise.all(
        bp.scenes.map(async (s, k) => {
          if (!videos[k] || !s.videoAssetId) return null;
          const b = await blobs.get(s.videoAssetId);
          return b ? ClipFrames.open(b) : null;
        }),
      )
    : [];
  const clipTime = (k: number, now: number) => {
    const vid = videos[k]!;
    const end = Number.isFinite(vid.duration) ? vid.duration - 0.05 : Infinity;
    return Math.min(Math.max(0, now - sceneStart[k]!) * clipRate[k]!, end);
  };
  /** The picture of a clip at `now` in the exact render (decoded; or the video element sought and waited for). */
  const clipPicture = async (k: number, now: number): Promise<(CanvasImageSource & { width: number; height: number }) | null> => {
    const t = clipTime(k, now);
    const cf = clips[k];
    if (cf) return cf.at(t);
    const vid = videos[k]!;
    if (!vid.paused) vid.pause();
    if (Math.abs(vid.currentTime - t) > 0.004) {
      const seeked = new Promise<void>((ok) => {
        vid.addEventListener('seeked', () => ok(), { once: true });
        setTimeout(ok, 1500);
      });
      vid.currentTime = t;
      await seeked;
    }
    return vid as unknown as HTMLVideoElement & { width: number; height: number };
  };
  const style = o.style ?? (bp.subtitles.style as SubtitleStyle);
  const grade = cinemaGrade(W, H, ctx);
  let shockStill: HTMLCanvasElement | null = null;
  /** Draws the picture of the film at `now` seconds. */
  const drawFrame = async (now: number) => {
    let si = 0;
    for (let i = 0; i < sceneStart.length; i++) if (now >= sceneStart[i]!) si = i;
    // The reaction insert: over the scene still LIVING when the theatre plays it (the speaker laughs, the other stays
    // shocked), else over the punchline's last picture frozen.
    const reacting = shock[si] && now >= sceneEnd[si]!;
    if (reacting && !theater?.has(si)) {
      // The punchline's last picture, frozen once, redrawn under the reaction every frame (no darkening build-up).
      if (!shockStill) {
        shockStill = document.createElement('canvas');
        shockStill.width = W;
        shockStill.height = H;
        shockStill.getContext('2d')!.drawImage(canvas, 0, 0);
      }
      ctx.drawImage(shockStill, 0, 0);
      shockFrame(ctx, W, H, now - sceneEnd[si]!, reactions[si]);
      return;
    }
    shockStill = null;
    const dur = sceneEnd[si]! - sceneStart[si]!;
    const f = Math.min(1, (now - sceneStart[si]!) / Math.max(0.1, dur));
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const va = voiceAt(now);
    const act = activeAt(lines, now);
    const dl = act ? bp.scenes[sceneIdx.get(act.line.sceneId) ?? si]?.dialogue[act.line.index] : undefined;
    const gesture = dl ? (gestureOf(dl.gesture) ?? gestureOf(dl.text)) : null;
    let band: Rect = { x: 0, y: 0, w: W, h: H };
    // Lip-sync on the word being said (subtitle timing) and voice accents (attack of the voice envelope).
    const vz = act ? wordViseme(act.line.words, now) : { key: 'rest' as const, open: 0 };
    slowEnergy += (va.energy - slowEnergy) * 0.08;
    const beat = Math.max(0, Math.min(1, (va.energy - slowEnergy) * 5));
    // Double smoothing = ease-in / ease-out of the punch-in (the camera starts gently, never with a jolt).
    punchA += (va.punch - punchA) * 0.12;
    punchS += (punchA - punchS) * 0.12;
    if (va.punch > 0) sideHeld = va.side;
    sideS += (sideHeld - sideS) * 0.08;
    const since = now - sceneStart[si]!;
    const a0 = fadeIn(since);
    const pics = new Map<number, (CanvasImageSource & { width: number; height: number }) | null>();
    if (exact) for (const k of a0 < 1 && si > 0 ? [si - 1, si] : [si]) if (videos[k]) pics.set(k, await clipPicture(k, now));
    const drawShot = (k: number, fr: number, alpha: number) => {
      const vid = videos[k];
      const img = bitmaps[k];
      const cam = cameraAt(moves[k]!, fr, { punch: k === si ? punchS : 0, side: sideS, energy: k === si ? va.energy : 0, t: now, dim3d });
      if (vid) {
        // The clip follows the film clock: slowed down a little when slightly short, then — past its end — its last
        // picture keeps living (breathing + the speaker talking) instead of freezing or jumping back to the start.
        const rate = clipRate[k]!;
        const target = Math.max(0, now - sceneStart[k]!) * rate;
        const end = Number.isFinite(vid.duration) ? vid.duration - 0.05 : Infinity;
        const vsrc = pics.get(k) ?? (vid as unknown as HTMLVideoElement & { width: number; height: number });
        if (target < end) {
          if (!exact) {
            if (vid.playbackRate !== rate) vid.playbackRate = rate;
            if (Math.abs(vid.currentTime - target) > 0.3) vid.currentTime = target;
            if (vid.paused) void vid.play().catch(() => undefined);
          }
          band = framed(ctx, vsrc, W, H, { zoom: 1 + (cam.zoom - 1) * 0.3, dx: cam.dx * 0.3, dy: cam.dy * 0.3, rot: 0 }, alpha, viral);
        } else {
          if (!exact) {
            if (!vid.paused) vid.pause();
            if (vid.currentTime < end - 0.2) vid.currentTime = Math.max(0, end);
          }
          const b = breathing(now + k);
          band = framed(ctx, vsrc, W, H, { ...cam, zoom: cam.zoom * b, dy: cam.dy - (b - 1) * 0.5 }, alpha, viral);
          if (k === si && va.energy > 0.04 && alpha >= 1) talkLayer(ctx, band.w, band.h, talkWarp(va.side, va.energy, now), band.x, band.y);
        }
      } else if (theater?.has(k)) {
        // ACTEURS 3D: the scene played by the cast (skeletal acting, voice-driven beats, lip-sync on the word).
        const c3 = theater.render(k, Math.max(0, now - sceneStart[k]!), {
          speaker: k === si && act ? act.line.speaker : null,
          text: k === si && act ? act.line.text : undefined,
          energy: k === si ? va.energy : 0,
          beat: k === si ? beat : 0,
          // The mouth follows the SOUND of the voice (audio visemes); the word timing only without a decoded voice.
          mouth: k === si && act && va.mouth ? { ...va.mouth } : mouthShape(k === si && act ? vz.key : 'rest', va.energy),
          gesture: k === si ? (gesture ?? dl?.gesture ?? null) : null,
          emotion: (k === si ? dl?.emotion : undefined) || bp.scenes[k]!.emotion,
          lineAge: act ? now - act.line.start : undefined,
        });
        band = framed(ctx, c3, W, H, { zoom: 1, dx: 0, dy: 0, rot: 0 }, alpha, viral);
      } else if (img && stages[k]) {
        // MARIONNETTE AFRIKATOON: the characters themselves move (head, body, arms), blink and talk with the voice.
        const st = stages[k]!;
        const frame = st.frame({
          t: now + k * 3.7,
          side: va.side,
          energy: k === si ? va.energy : 0,
          // The speaker keeps speaking for the whole line (not only while the voice is loud): no pose flicker.
          speaking: k === si && !!act,
          action: bp.scenes[k]!.action,
          emphasis: k === bp.scenes.length - 1 ? Math.max(0, 1 - Math.abs(fr - 0.85) * 8) : 0,
          gesture: k === si ? gesture : null,
          lineAge: act ? now - act.line.start : undefined,
          sceneAge: Math.max(0, now - sceneStart[k]!),
          emotion: (k === si ? dl?.emotion : undefined) || bp.scenes[k]!.emotion,
          viseme: k === si && act ? vz.open : undefined,
          visemeKey: k === si && act ? vz.key : undefined,
          beat: k === si ? beat : 0,
        });
        band = framed(ctx, frame as unknown as ImageBitmap, W, H, cam, alpha, viral);
      } else if (img) {
        // 2.5D life without a video model: the whole shot breathes, the speaker talks and nods.
        const b = breathing(now + k);
        band = framed(ctx, img, W, H, { ...cam, zoom: cam.zoom * b, dy: cam.dy - (b - 1) * 0.5 }, alpha, viral);
        if (k === si && va.energy > 0.04 && alpha >= 1) talkLayer(ctx, band.w, band.h, talkWarp(va.side, va.energy, now), band.x, band.y);
      }
      else if (alpha >= 1) placeholder(ctx, bp.scenes[k]!, W, H);
    };
    if (a0 < 1 && si > 0) drawShot(si - 1, 1, 1);
    drawShot(si, f, si > 0 ? a0 : 1);
    if (!exact) for (const [k, v] of videos.entries()) if (v && k !== si && k !== si - 1 && !v.paused) v.pause();
    if (o.cinema !== false) cinemaFinish(ctx, W, H, grade, now);
    const a = act;
    if (a && viral) {
      // French below the band (keyword yellow), English above it (keyword cyan), 1–3 words at a time.
      const fr = captionChunk(a.line.words.map((w) => w.text), a.wordIndex);
      const size = Math.round(W * 0.085);
      // Full-frame clip (Grok 9:16): captions in the lower band, under the faces — never across the heads.
      const full = band.y < H * 0.1;
      const below = !full && band.y + band.h < H * 0.9 ? band.y + band.h + Math.min(H - band.y - band.h, H * 0.16) * 0.45 : H * 0.84;
      if (fr) drawChunk(ctx, fr, W / 2, below, size, VIRAL_FORMAT.bottomColor, W * 0.9, o.captionStyle === 'box' ? VIRAL_FORMAT.boxColors[0] : undefined);
      const en = o.bilingual ? dl?.english?.trim() : '';
      if (en) {
        const prog = (now - a.line.start) / Math.max(0.1, a.line.end - a.line.start);
        const ch = parallelChunk(captionWords(en), prog);
        const above = full ? Math.min(H * 0.93, below + size * 1.25) : band.y - Math.min(band.y, H * 0.16) * 0.45;
        if (ch) drawChunk(ctx, ch, W / 2, above, size, VIRAL_FORMAT.topColor, W * 0.9, o.captionStyle === 'box' ? VIRAL_FORMAT.boxColors[1] : undefined);
      }
    } else if (a) drawSub(ctx, a.line, a.wordIndex, W, H, style);
    if (reacting) shockFrame(ctx, W, H, now - sceneEnd[si]!, reactions[si], true);
  };
  let hiddenPauses = 0;
  let film: { blob: Blob; mime: string };
  if (exact) {
    // The sound first (mixed offline on the film clock), then every picture at its exact instant.
    const SR = 48000;
    const off = new OfflineAudioContext({ numberOfChannels: 2, length: Math.max(1, Math.ceil(total * SR)), sampleRate: SR });
    mix(off, off.destination, 0);
    await exact.audio(await off.startRendering());
    for (let k = 0; ; k++) {
      const now = k / exact.fps;
      if (now >= total || o.signal?.aborted) break;
      await drawFrame(now);
      await exact.frame(now);
      o.onProgress?.(now / total, now);
      if (k % 3 === 0) await yieldToPage();
    }
    film = { blob: await exact.finish(), mime: exact.mime };
  } else {
    const dest = ac.createMediaStreamDestination();
    const stream = canvas.captureStream(30);
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    const rec = new MediaRecorder(stream, { mimeType: sup.mime!, videoBitsPerSecond: 1_500_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    await ac.resume();
    mix(ac, dest, ac.currentTime);
    rec.start(500);
    // THE FILM CLOCK IS THE AUDIO CLOCK. v44: a hidden tab throttled the loop to 1 frame/s for 11 s (scenes 3–4 « without
    // animation »). Now, while the tab is hidden, recording, audio and clips PAUSE together and resume when it is back.
    const a0 = ac.currentTime;
    const clock = () => ac.currentTime - a0;
    const holdWhileHidden = async () => {
      if (typeof document === 'undefined' || !document.hidden) return;
      hiddenPauses++;
      o.onPause?.(true);
      if (rec.state === 'recording') rec.pause();
      await ac.suspend();
      videos.forEach((v) => v && !v.paused && v.pause());
      await new Promise<void>((ok) => {
        const on = () => {
          if (!document.hidden) {
            document.removeEventListener('visibilitychange', on);
            ok();
          }
        };
        document.addEventListener('visibilitychange', on);
        o.signal?.addEventListener('abort', () => ok());
      });
      await ac.resume();
      if (rec.state === 'paused') rec.resume();
      o.onPause?.(false);
    };
    while (true) {
      await holdWhileHidden();
      const now = clock();
      if (now >= total || o.signal?.aborted) break;
      await drawFrame(now);
      o.onProgress?.(now / total, now);
      await wait(33);
    }
    rec.stop();
    await stopped;
    stream.getTracks().forEach((tr) => tr.stop());
    film = { blob: new Blob(chunks, { type: sup.mime! }), mime: sup.mime! };
  }
  await ac.close();
  theater?.dispose();
  bitmaps.forEach((b) => b?.close());
  plates.forEach((b) => b?.close());
  clips.forEach((c) => c?.dispose());
  videos.forEach((v) => {
    if (v) {
      v.pause();
      URL.revokeObjectURL(v.src);
    }
  });
  return { ...film, seconds: total, hiddenPauses, ...(exact ? { fps: exact.fps } : {}) };
}
