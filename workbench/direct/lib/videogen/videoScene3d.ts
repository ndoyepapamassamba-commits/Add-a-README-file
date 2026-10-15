// VIDÉO → SCÈNE 3D, côté navigateur : lecture de la vidéo (les images ne quittent jamais la machine), analyse de la
// profondeur image par image sous un budget de temps MESURÉ, aperçu temps réel, export MP4 image par image avec le
// son d'origine, export RGBD (couleur | profondeur côte à côte dans un seul MP4) et page HTML 3D autonome.
import * as THREE from 'three';
import { cameraState } from '../../../server/jev/videogen/imageMotion';
import { DepthTracker, atlasLayout, dilateNear, depthAt, isCut, keyframeStride, outputSizeFor, placeBand, quantize, rowSharpness, sharpBand, toLuma, trackSize, type DepthTrack, type VideoSceneSpec } from '../../../server/jev/videogen/videoDepth';
import { extractAac, type AacTrack } from './audioCopy';
import { frameDepth } from './depth';
import { decodeAudio, openMp4, type AudioCopy, type AudioTrack, type Encoded } from './encode';
import { bytesB64, pageLibs } from './pageLibs';
import { buildScenePage, type SceneCamera } from './scenePage';
import { finishFrame, sceneRuntime, type SceneCam, type SceneLook } from './videoScene';

export interface VideoClip {
  file: Blob;
  name: string;
  url: string;
  el: HTMLVideoElement;
  duration: number;
  width: number;
  height: number;
}
/** Longest video handled (s) — the depth track stays in memory. */
export const MAX_SECONDS = 60;

export async function openClip(file: Blob, name = 'video'): Promise<VideoClip> {
  const url = URL.createObjectURL(file);
  const el = document.createElement('video');
  el.muted = true;
  el.playsInline = true;
  el.preload = 'auto';
  el.src = url;
  await new Promise<void>((res, rej) => {
    el.onloadeddata = () => res();
    el.onerror = () => rej(new Error('format vidéo non lu par ce navigateur (essayez MP4 H.264 ou WebM)'));
  });
  let duration = el.duration;
  if (!Number.isFinite(duration)) {
    // Recorded WebM without a duration: seek far to make the browser compute it.
    await seekTo(el, 1e7);
    duration = el.duration;
    await seekTo(el, 0);
  }
  return { file, name, url, el, duration: Math.min(MAX_SECONDS, duration || 0), width: el.videoWidth, height: el.videoHeight };
}
export function closeClip(c: VideoClip | null): void {
  if (!c) return;
  c.el.pause();
  c.el.removeAttribute('src');
  c.el.load();
  URL.revokeObjectURL(c.url);
}
/** Frame-exact seek (resolves when the frame at t is decoded and shown by the element). */
export function seekTo(el: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const target = Math.max(0, Number.isFinite(el.duration) ? Math.min(t, el.duration - 0.001) : t);
    if (Math.abs(el.currentTime - target) < 1e-4 && el.readyState >= 2) return res();
    const done = () => {
      el.removeEventListener('seeked', done);
      res();
    };
    el.addEventListener('seeked', done);
    el.currentTime = target;
  });
}

/** Depth for every analysed frame: the model on key frames (stride chosen from its measured cost and the budget),
 *  propagated by optical flow in between, aligned and fused through time. */
export async function analyseClip(
  clip: VideoClip,
  o: { fps?: number; budgetMs?: number; allowModel?: boolean; onStatus?: (s: string) => void; onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<DepthTrack> {
  const t0 = performance.now();
  const fps = o.fps ?? 15;
  const n = Math.max(1, Math.floor(clip.duration * fps));
  const [w, h] = trackSize(clip.width, clip.height, 288);
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sg = small.getContext('2d', { willReadFrequently: true })!;
  const grab = async (i: number) => {
    await seekTo(clip.el, i / fps + 0.001);
    sg.drawImage(clip.el, 0, 0, w, h);
    return toLuma(sg.getImageData(0, 0, w, h).data, w, h);
  };
  // A shot laid over its own blurred copy (vertical layout): depth is measured on the sharp band only.
  const rows = new Float32Array(h);
  for (let i = 0; i < Math.min(n, 6); i++) rowSharpness(await grab(Math.floor((i * n) / 6)), w, h, rows);
  const band = sharpBand(rows);
  const [y0, y1] = band ?? [0, h];
  const sy0 = Math.round((y0 * clip.height) / h);
  const sy1 = Math.round((y1 * clip.height) / h);
  // The model sees the band (or the frame) with its short side near 518 px; the small canvas holds the band at track width.
  const [mw, mh] = trackSize(clip.width, sy1 - sy0, 518);
  const big = document.createElement('canvas');
  big.width = mw;
  big.height = mh;
  const bg = big.getContext('2d')!;
  const bandC = document.createElement('canvas');
  bandC.width = w;
  bandC.height = y1 - y0;
  const bandG = bandC.getContext('2d', { willReadFrequently: true })!;
  const tracker = new DepthTracker(w, h);
  const frames: Uint8Array[] = [];
  const cuts: number[] = [];
  let stride = 1;
  let keyframes = 0;
  let source = '';
  let prev: Uint8Array | null = null;
  let sinceKey = 0;
  for (let i = 0; i < n; i++) {
    if (o.signal?.aborted) throw new Error('analyse interrompue');
    const luma = await grab(i);
    // A new shot: nothing is carried over, and its first frame is always measured.
    const cut = prev !== null && isCut(prev, luma);
    if (cut) {
      cuts.push(i);
      tracker.reset();
    }
    let fresh: Float32Array | null = null;
    if (i === 0 || cut || sinceKey >= stride) {
      bg.drawImage(clip.el, 0, sy0, clip.width, sy1 - sy0, 0, 0, mw, mh);
      bandG.drawImage(clip.el, 0, sy0, clip.width, sy1 - sy0, 0, 0, w, y1 - y0);
      const d = await frameDepth(big, bandC, w, y1 - y0, { allowModel: o.allowModel, onStatus: o.onStatus });
      fresh = placeBand(d.data, w, h, y0, y1, 0);
      keyframes++;
      sinceKey = 0;
      if (!source) source = d.source;
      else if (source !== d.source && !source.includes('+')) source = `${source} + ${d.source}`;
      if (i === 0) {
        // The measured inference time sets the key-frame rhythm that fits the budget.
        stride = keyframeStride(n, d.ms + 25, o.budgetMs ?? 45_000);
        o.onStatus?.(`profondeur ${d.source} : ${d.ms} ms par image clé → une image clé toutes les ${stride} image(s)${band ? ' · bande nette détectée' : ''}`);
      }
    }
    sinceKey++;
    frames.push(quantize(dilateNear(tracker.push(luma, fresh), w, h)));
    prev = luma;
    if (i % 3 === 0) {
      o.onProgress?.(i + 1, n);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  o.onProgress?.(n, n);
  return { frames, w, h, fps, source: source || 'heuristique', keyframes, stride, ms: Math.round(performance.now() - t0), band: band ?? undefined, cuts };
}

/** The sound to put in an exported MP4: the original AAC copied bit for bit when the file is an MP4, else re-encoded. */
async function soundOf(clip: VideoClip, seconds: number): Promise<AudioCopy | AudioTrack | null> {
  const aac = await aacOf(clip);
  if (aac) return { copy: aac, seconds };
  const pcm = await decodeAudio(clip.file);
  return pcm ? { buffer: pcm, seconds } : null;
}
const aacCache = new WeakMap<Blob, Promise<AacTrack | null>>();
function aacOf(clip: VideoClip): Promise<AacTrack | null> {
  let p = aacCache.get(clip.file);
  if (!p) {
    p = clip.file.arrayBuffer().then((b) => extractAac(b));
    aacCache.set(clip.file, p);
  }
  return p;
}

export function lookOf(spec: VideoSceneSpec): SceneLook {
  return { style: spec.style, relief: spec.relief, cut: spec.cut, fog: spec.effects.fog, relight: spec.effects.relight, dust: spec.effects.dust, snow: spec.effects.snow, rain: spec.effects.rain };
}
export function camAt(spec: VideoSceneSpec, k: number, drag?: { x: number; y: number }): SceneCam {
  const c = cameraState(spec.preset, k, spec.intensity);
  return { ...c, ox: c.ox + (drag?.x ?? 0), oy: c.oy + (drag?.y ?? 0) };
}

/** A live scene for the preview (renders into its own WebGL canvas). */
export function openScene(clip: VideoClip, track: DepthTrack, maxSide = 720) {
  const [W, H] = outputSizeFor(clip.width, clip.height, maxSide);
  const gl = document.createElement('canvas');
  gl.width = W;
  gl.height = H;
  const rt = sceneRuntime(THREE, gl, { width: W, height: H, aspect: clip.width / clip.height, dw: track.w, dh: track.h });
  const buf = new Uint8Array(track.w * track.h);
  return {
    gl,
    width: W,
    height: H,
    draw(t: number, cam: SceneCam, look: SceneLook) {
      depthAt(track, t, buf);
      rt.render(clip.el, buf, cam, look, t);
      return gl;
    },
    dispose: () => rt.dispose(),
  };
}

/** The 3D scene filmed by its camera, frame by frame, with the original sound. */
export async function renderSceneMp4(clip: VideoClip, track: DepthTrack, spec: VideoSceneSpec, o: { fps?: number; onProgress?: (d: number, t: number) => void; signal?: AbortSignal } = {}): Promise<Encoded> {
  const fps = o.fps ?? 30;
  const frames = Math.max(1, Math.floor(clip.duration * fps));
  const sc = openScene(clip, track, spec.quality);
  const out = document.createElement('canvas');
  const mp4 = await openMp4(sc.width, sc.height, fps, undefined, spec.audio ? await soundOf(clip, frames / fps) : null);
  if (!mp4) {
    sc.dispose();
    throw new Error('ce navigateur n’a pas d’encodeur vidéo WebCodecs (Chrome ou Edge récents)');
  }
  const look = lookOf(spec);
  try {
    for (let i = 0; i < frames; i++) {
      if (o.signal?.aborted) throw new Error('rendu interrompu');
      const t = i / fps;
      await seekTo(clip.el, t + 0.001);
      const gl = sc.draw(t, camAt(spec, frames > 1 ? i / (frames - 1) : 0), look);
      await mp4.push(finishFrame(out, gl, { title: spec.title, vignette: spec.effects.vignette, grain: spec.effects.grain, letterbox: spec.effects.letterbox }, t, i), i);
      if (i % 4 === 0) {
        o.onProgress?.(i + 1, frames);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    return await mp4.close();
  } finally {
    sc.dispose();
  }
}

/** RGBD video: the original frame on the left, its depth (grey, white = near) on the right, sound included. */
export async function renderRgbdMp4(clip: VideoClip, track: DepthTrack, o: { fps?: number; maxSide?: number; audio?: boolean; onProgress?: (d: number, t: number) => void } = {}): Promise<Encoded> {
  const fps = o.fps ?? 30;
  const frames = Math.max(1, Math.floor(clip.duration * fps));
  const [W, H] = outputSizeFor(clip.width, clip.height, o.maxSide ?? 1080);
  const packed = document.createElement('canvas');
  packed.width = W * 2;
  packed.height = H;
  const g = packed.getContext('2d')!;
  const dc = document.createElement('canvas');
  dc.width = track.w;
  dc.height = track.h;
  const dg = dc.getContext('2d')!;
  const img = dg.createImageData(track.w, track.h);
  const buf = new Uint8Array(track.w * track.h);
  const mp4 = await openMp4(W * 2, H, fps, Math.round(W * 2 * H * fps * 0.16), o.audio !== false ? await soundOf(clip, frames / fps) : null);
  if (!mp4) throw new Error('ce navigateur n’a pas d’encodeur vidéo WebCodecs (Chrome ou Edge récents)');
  g.imageSmoothingQuality = 'high';
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    await seekTo(clip.el, t + 0.001);
    g.drawImage(clip.el, 0, 0, W, H);
    depthAt(track, t, buf);
    for (let p = 0, q = 0; p < buf.length; p++, q += 4) {
      img.data[q] = img.data[q + 1] = img.data[q + 2] = buf[p]!;
      img.data[q + 3] = 255;
    }
    dg.putImageData(img, 0, 0);
    g.drawImage(dc, W, 0, W, H);
    await mp4.push(packed, i);
    if (i % 4 === 0) {
      o.onProgress?.(i + 1, frames);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return mp4.close();
}

/** Self-contained HTML page (one file, works offline): the ORIGINAL video untouched, one depth map per frame (lossless
 *  atlas), the original AAC sound, three.js and mp4-muxer embedded; MP4 export inside the page. */
export async function sceneToHtml(clip: VideoClip, track: DepthTrack, meta: { title: string; spec: VideoSceneSpec; camera?: SceneCamera }): Promise<string> {
  const L = atlasLayout(track.frames.length, track.w, track.h);
  const c = document.createElement('canvas');
  c.width = L.width;
  c.height = L.height;
  const g = c.getContext('2d')!;
  const img = g.createImageData(L.width, L.height);
  track.frames.forEach((f, k) => {
    const cx = (k % L.cols) * track.w;
    const cy = Math.floor(k / L.cols) * track.h;
    for (let y = 0; y < track.h; y++)
      for (let x = 0; x < track.w; x++) {
        const q = ((cy + y) * L.width + cx + x) * 4;
        img.data[q] = img.data[q + 1] = img.data[q + 2] = f[y * track.w + x]!;
        img.data[q + 3] = 255;
      }
  });
  g.putImageData(img, 0, 0);
  const png = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('atlas de profondeur'))), 'image/png'));
  const aac = await aacOf(clip);
  const mime = clip.file.type || (aac ? 'video/mp4' : 'video/webm');
  return buildScenePage({
    title: meta.title,
    video: { b64: bytesB64(new Uint8Array(await clip.file.arrayBuffer())), mime, width: clip.width, height: clip.height, duration: clip.duration, fps: 30, hasAudio: true },
    depth: { atlasB64: bytesB64(new Uint8Array(await png.arrayBuffer())), w: track.w, h: track.h, n: track.frames.length, fps: track.fps, cols: L.cols, cuts: track.cuts ?? [], band: track.band ?? null, source: track.source },
    audio: aac ? { codec: aac.codec, sampleRate: aac.sampleRate, channels: aac.channels, descB64: bytesB64(aac.description), dataB64: bytesB64(aac.data), table: aac.table } : null,
    libs: pageLibs(),
    look: lookOf(meta.spec),
    camera: meta.camera ?? (meta.spec.preset === 'travelling_avant' ? 'travelling' : meta.spec.preset === 'fixe_vivant' ? 'fixe' : 'orbite'),
  });
}

/** The same self-contained 3D page for a STILL IMAGE: its original file untouched, its depth map (≤ 512 px), a camera
 *  move of `seconds` (orbit, travelling or mouse), MP4 export inside the page. */
export async function imageSceneHtml(file: Blob, size: { width: number; height: number }, depth: { data: Float32Array; w: number; h: number; source: string }, o: { title: string; seconds: number; look: SceneLook; camera: SceneCamera }): Promise<string> {
  const [w, h] = trackSize(size.width, size.height, 512);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = depth.data[Math.min(depth.h - 1, Math.floor(((y + 0.5) * depth.h) / h)) * depth.w + Math.min(depth.w - 1, Math.floor(((x + 0.5) * depth.w) / w))] ?? 0;
      const q = (y * w + x) * 4;
      img.data[q] = img.data[q + 1] = img.data[q + 2] = Math.round(Math.min(1, Math.max(0, v)) * 255);
      img.data[q + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const png = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('carte de profondeur'))), 'image/png'));
  return buildScenePage({
    title: o.title,
    video: { b64: bytesB64(new Uint8Array(await file.arrayBuffer())), mime: file.type || 'image/jpeg', width: size.width, height: size.height, duration: o.seconds, fps: 30, hasAudio: false, kind: 'image' },
    depth: { atlasB64: bytesB64(new Uint8Array(await png.arrayBuffer())), w, h, n: 1, fps: 1, cols: 1, cuts: [], band: null, source: depth.source },
    audio: null,
    libs: pageLibs(),
    look: o.look,
    camera: o.camera,
  });
}
