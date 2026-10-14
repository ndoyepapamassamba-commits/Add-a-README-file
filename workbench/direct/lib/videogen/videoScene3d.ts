// VIDÉO → SCÈNE 3D, côté navigateur : lecture de la vidéo (les images ne quittent jamais la machine), analyse de la
// profondeur image par image sous un budget de temps MESURÉ, aperçu temps réel, export MP4 image par image avec le
// son d'origine, export RGBD (couleur | profondeur côte à côte dans un seul MP4) et page HTML 3D autonome.
import * as THREE from 'three';
import { cameraState } from '../../../server/jev/videogen/imageMotion';
import { DepthTracker, depthAt, keyframeStride, outputSizeFor, quantize, toLuma, trackSize, type DepthTrack, type VideoSceneSpec } from '../../../server/jev/videogen/videoDepth';
import { frameDepth } from './depth';
import { decodeAudio, openMp4, type Encoded } from './encode';
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
  const [mw, mh] = trackSize(clip.width, clip.height, 518);
  const big = document.createElement('canvas');
  big.width = mw;
  big.height = mh;
  const bg = big.getContext('2d')!;
  const tracker = new DepthTracker(w, h);
  const frames: Uint8Array[] = [];
  let stride = 1;
  let keyframes = 0;
  let source = '';
  for (let i = 0; i < n; i++) {
    if (o.signal?.aborted) throw new Error('analyse interrompue');
    await seekTo(clip.el, i / fps + 0.001);
    sg.drawImage(clip.el, 0, 0, w, h);
    const luma = toLuma(sg.getImageData(0, 0, w, h).data, w, h);
    let fresh: Float32Array | null = null;
    if (i % stride === 0) {
      bg.drawImage(clip.el, 0, 0, mw, mh);
      const d = await frameDepth(big, small, w, h, { allowModel: o.allowModel, onStatus: o.onStatus });
      fresh = d.data;
      keyframes++;
      if (!source) source = d.source;
      else if (source !== d.source && !source.includes('+')) source = `${source} + ${d.source}`;
      if (i === 0) {
        // The first measured cost sets the key-frame rhythm that fits the budget.
        stride = keyframeStride(n, d.ms + 25, o.budgetMs ?? 45_000);
        o.onStatus?.(`profondeur ${d.source} : ${d.ms} ms par image clé → une image clé toutes les ${stride} image(s)`);
      }
    }
    frames.push(quantize(tracker.push(luma, fresh)));
    if (i % 3 === 0) {
      o.onProgress?.(i + 1, n);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  o.onProgress?.(n, n);
  return { frames, w, h, fps, source: source || 'heuristique', keyframes, stride, ms: Math.round(performance.now() - t0) };
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
  const sound = spec.audio ? await decodeAudio(clip.file) : null;
  const mp4 = await openMp4(sc.width, sc.height, fps, undefined, sound ? { buffer: sound, seconds: frames / fps } : null);
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
  const sound = o.audio !== false ? await decodeAudio(clip.file) : null;
  const mp4 = await openMp4(W * 2, H, fps, Math.round(W * 2 * H * fps * 0.16), sound ? { buffer: sound, seconds: frames / fps } : null);
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

const esc = (s: string) => s.replace(/<\/script/gi, '<\\/script');
function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

/** Self-contained HTML page: the RGBD video becomes a live 3D scene (drag to move the camera, wheel to dolly). */
export async function sceneToHtml(rgbd: Blob, meta: { title: string; aspect: number; dw: number; dh: number; spec: VideoSceneSpec }): Promise<string> {
  const src = await blobToDataUrl(rgbd);
  const map = { imports: { three: 'https://esm.sh/three@0.186.1' } };
  const title = (meta.title || 'Scène 3D vidéo').replace(/</g, '&lt;');
  const init = { aspect: meta.aspect, dw: meta.dw, dh: meta.dh, packed: true };
  const look = lookOf(meta.spec);
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — scène 3D</title>
<style>
:root{--bg:#07080c;--fg:#eef1f6;--mut:#9aa3b2;--acc:#f26b3a}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font-family:Inter,system-ui,sans-serif}
main{display:flex;flex-direction:column;align-items:center;gap:10px;padding:12px 16px;min-height:100%}
h1{font-size:17px;margin:0}p{margin:0;color:var(--mut);font-size:12.5px;text-align:center}
.stage{position:relative;width:min(100%, calc((100vh - 150px) * ${meta.aspect.toFixed(4)}));aspect-ratio:${meta.aspect.toFixed(4)};background:#000;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.55);touch-action:none;cursor:grab}
.stage canvas{width:100%;height:100%;display:block}
.bar{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
button{background:#161a26;color:var(--fg);border:1px solid #2a3142;border-radius:10px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer}
button.on{background:var(--acc);border-color:var(--acc);color:#fff}
video{display:none}
</style>
<script type="importmap">${JSON.stringify(map)}</script></head>
<body><main>
<h1>${title}</h1>
<div class="stage" id="stage"><canvas id="c"></canvas></div>
<div class="bar"><button id="play" class="on">❚❚ Pause</button><button id="snd">🔇 Son</button><button data-s="relief">Relief</button><button data-s="nuage">Nuage de points</button><button data-s="holo">Hologramme</button><button id="auto" class="on">Caméra auto</button></div>
<p id="msg">Glissez pour déplacer la caméra, molette ou pincement pour avancer. Pixels d’origine + une carte de profondeur par image (three.js, MIT).</p>
</main>
<video id="v" src="${src}" muted loop playsinline></video>
<script type="module">
import * as THREE from 'three';
const sceneRuntime = ${esc(sceneRuntime.toString())};
const INIT = ${JSON.stringify(init)}, LOOK = ${JSON.stringify(look)};
const v = document.getElementById('v'), cv = document.getElementById('c'), stage = document.getElementById('stage'), msg = document.getElementById('msg');
let rt = null, auto = true, drag = null, off = { x: 0, y: 0, z: 0 }, t0 = performance.now();
function size() { const r = stage.getBoundingClientRect(), k = Math.min(2, window.devicePixelRatio || 1); return [Math.max(2, Math.round(r.width * k)), Math.max(2, Math.round(r.height * k))]; }
function open() { if (rt) rt.dispose(); const [w, h] = size(); cv.width = w; cv.height = h; rt = sceneRuntime(THREE, cv, Object.assign({ width: w, height: h }, INIT)); }
function cam(t) { const a = auto ? Math.sin(t * 0.35) : 0, b = auto ? Math.cos(t * 0.27) : 0;
  return { ox: 0.03 * a + off.x, oy: 0.012 * b + off.y, zoom: 1.06, dolly: Math.max(-0.6, Math.min(0.9, off.z + (auto ? 0.15 + 0.15 * Math.sin(t * 0.2) : 0))), focus: 0.5, roll: auto ? 0.006 * a : 0 }; }
function frame() { if (v.readyState >= 2) rt.render(v, null, cam((performance.now() - t0) / 1000), LOOK, v.currentTime); requestAnimationFrame(frame); }
stage.onpointerdown = (e) => { drag = [e.clientX, e.clientY, off.x, off.y]; stage.setPointerCapture(e.pointerId); };
stage.onpointermove = (e) => { if (!drag) return; const r = stage.getBoundingClientRect(); off.x = drag[2] + (e.clientX - drag[0]) / r.width * 0.12; off.y = drag[3] + (e.clientY - drag[1]) / r.height * 0.08; };
stage.onpointerup = () => (drag = null);
stage.onwheel = (e) => { e.preventDefault(); off.z = Math.max(-0.6, Math.min(0.9, off.z - e.deltaY * 0.0012)); };
document.getElementById('play').onclick = (e) => { if (v.paused) { v.play(); e.target.textContent = '❚❚ Pause'; e.target.classList.add('on'); } else { v.pause(); e.target.textContent = '▶ Lire'; e.target.classList.remove('on'); } };
document.getElementById('snd').onclick = (e) => { v.muted = !v.muted; e.target.textContent = v.muted ? '🔇 Son' : '🔊 Son'; e.target.classList.toggle('on', !v.muted); if (v.paused) v.play(); };
document.getElementById('auto').onclick = (e) => { auto = !auto; e.target.classList.toggle('on', auto); };
for (const b of document.querySelectorAll('[data-s]')) { b.classList.toggle('on', b.dataset.s === LOOK.style); b.onclick = () => { LOOK.style = b.dataset.s; for (const x of document.querySelectorAll('[data-s]')) x.classList.toggle('on', x === b); }; }
window.addEventListener('resize', open);
open(); v.play().catch(() => (msg.textContent = 'Cliquez sur ▶ pour lancer la scène.')); requestAnimationFrame(frame);
window.__scene = { ready: () => v.readyState >= 2 && !!rt };
</script></body></html>`;
}
