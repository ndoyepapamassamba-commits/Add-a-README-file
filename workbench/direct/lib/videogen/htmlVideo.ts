// VIDÉO 3D EN HTML — un plan de scène rendu par le réalisateur three.js (director.ts) :
//  · renderPlanVideo : MP4 image par image dans l'app (WebCodecs + mp4-muxer), cadence exacte, sans réseau ;
//  · planToHtml : une page HTML AUTONOME (three.js et mp4-muxer chargés depuis esm.sh) qui rejoue la même scène,
//    avec lecture, curseur de temps et export MP4 — la vidéo devient un document HTML partageable.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HUMAN_RIG, ANIMAL_RIG, bake } from '../../../server/jev/videogen/animate';
import { sceneSpec } from '../../../server/jev/videogen/assets';
import { FORMAT_SIZE, type ScenePlan } from '../../../server/jev/videogen/plan';
import { directorRuntime } from './director';
import { encodeMp4, type Encoded } from './encode';

export const ADDONS = { EffectComposer, RenderPass, GTAOPass, BokehPass, UnrealBloomPass, OutputPass, Sky, RoomEnvironment };
export type Quality = 'draft' | 'final';

export function sizeOf(plan: ScenePlan, quality: Quality): [number, number] {
  const [w, h] = FORMAT_SIZE[plan.format];
  return quality === 'final' ? [w, h] : [Math.round(w / 2 / 2) * 2, Math.round(h / 2 / 2) * 2];
}
export function directorData(plan: ScenePlan, fps: number) {
  return { plan, bake: bake(plan, fps), scene: sceneSpec(plan), rigs: { human: HUMAN_RIG, animal: ANIMAL_RIG } };
}

/** A live director on a plan (preview: render(i) gives the canvas of frame i). */
export function openDirector(plan: ScenePlan, o: { fps?: number; quality?: Quality } = {}) {
  const fps = o.fps ?? 30;
  const [width, height] = sizeOf(plan, o.quality ?? 'draft');
  return directorRuntime(THREE, ADDONS, directorData(plan, fps), { width, height, quality: o.quality ?? 'draft' });
}

/** The plan as a frame-exact MP4. */
export async function renderPlanVideo(plan: ScenePlan, o: { fps?: number; quality?: Quality; onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {}): Promise<Encoded> {
  const fps = o.fps ?? 30;
  const d = openDirector(plan, { fps, quality: o.quality });
  try {
    return await encodeMp4({ width: d.width, height: d.height, fps, frames: d.frames, draw: (i) => d.render(i), onProgress: o.onProgress, signal: o.signal });
  } finally {
    d.dispose();
  }
}

const esc = (s: string) => s.replace(/<\/script/gi, '<\\/script');
/** A standalone HTML page that plays — and exports to MP4 — the same scene in any modern browser. */
export function planToHtml(plan: ScenePlan, o: { fps?: number } = {}): string {
  const fps = o.fps ?? 30;
  const data = directorData(plan, fps);
  const [W, H] = FORMAT_SIZE[plan.format];
  const map = {
    imports: {
      three: 'https://esm.sh/three@0.186.1',
      'three/addons/': 'https://esm.sh/three@0.186.1/examples/jsm/',
      'mp4-muxer': 'https://esm.sh/mp4-muxer@5.2.2',
    },
  };
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${plan.title.replace(/</g, '&lt;')} — MASSAMBA Cinema (HTML)</title>
<style>
:root{--bg:#0b0d12;--fg:#eef1f6;--mut:#9aa3b2;--acc:#f26b3a}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font-family:Inter,system-ui,sans-serif}
main{display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;min-height:100%}
h1{font-size:18px;margin:0}p{margin:0;color:var(--mut);font-size:13px}
.stage{width:min(100%, calc((100vh - 170px) * ${W} / ${H}));aspect-ratio:${W}/${H};background:#000;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.stage canvas{width:100%;height:100%;display:block}
.bar{display:flex;gap:8px;align-items:center;width:min(100%,960px);flex-wrap:wrap}
button{background:#1b2030;color:var(--fg);border:1px solid #2a3142;border-radius:10px;padding:8px 14px;font:inherit;cursor:pointer}
button.acc{background:var(--acc);border-color:var(--acc);color:#fff;font-weight:600}
input[type=range]{flex:1;min-width:160px;accent-color:var(--acc)}
#t{font-variant-numeric:tabular-nums;color:var(--mut);font-size:12px;min-width:90px;text-align:right}
</style>
<script type="importmap">${JSON.stringify(map)}</script></head>
<body><main>
<h1>${plan.title.replace(/</g, '&lt;')}</h1><p>${plan.logline.replace(/</g, '&lt;').slice(0, 200)}</p>
<div class="stage" id="stage"></div>
<div class="bar"><button id="play" class="acc">▶ Lire</button><input id="scrub" type="range" min="0" value="0"><span id="t"></span>
<select id="q"><option value="draft">Aperçu (moitié)</option><option value="final">Final ${W}×${H}</option></select><button id="mp4">⬇ Exporter MP4</button></div>
<p id="msg">Vidéo 3D générée en HTML : chaque image est calculée à son instant exact (three.js, MIT).</p>
</main>
<script>window.DATA=${esc(JSON.stringify(data))};</script>
<script type="module">
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
const X = { EffectComposer, RenderPass, GTAOPass, BokehPass, UnrealBloomPass, OutputPass, Sky, RoomEnvironment };
const directorRuntime = ${esc(directorRuntime.toString())};
const D = window.DATA, FPS = D.bake.fps, N = D.bake.frames;
const stage = document.getElementById('stage'), scrub = document.getElementById('scrub'), tl = document.getElementById('t'), msg = document.getElementById('msg');
scrub.max = N - 1;
let q = 'draft', dir = null, frame = 0, playing = false, last = 0;
function open(quality) { if (dir) dir.dispose(); const w = quality === 'final' ? ${W} : ${Math.round(W / 4) * 2}, h = quality === 'final' ? ${H} : ${Math.round(H / 4) * 2};
  dir = directorRuntime(THREE, X, D, { width: w, height: h, quality }); stage.replaceChildren(dir.canvas); show(frame); }
function show(f) { frame = Math.max(0, Math.min(N - 1, f)); dir.render(frame); scrub.value = frame; tl.textContent = (frame / FPS).toFixed(2) + ' / ' + (N / FPS).toFixed(2) + ' s'; }
function loop(ts) { if (!playing) return; if (ts - last >= 1000 / FPS) { last = ts; show(frame + 1 >= N ? 0 : frame + 1); } requestAnimationFrame(loop); }
document.getElementById('play').onclick = (e) => { playing = !playing; e.target.textContent = playing ? '❚❚ Pause' : '▶ Lire'; if (playing) requestAnimationFrame(loop); };
scrub.oninput = () => show(Number(scrub.value));
document.getElementById('q').onchange = (e) => { q = e.target.value; open(q); };
document.getElementById('mp4').onclick = async () => {
  if (typeof VideoEncoder === 'undefined') { msg.textContent = 'Ce navigateur n’a pas WebCodecs : utilisez Chrome ou Edge récents.'; return; }
  playing = false; const W = dir.width, H = dir.height;
  const codecs = ['avc1.640033', 'avc1.640028', 'avc1.42001f'];
  let codec = null; for (const c of codecs) { try { if ((await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate: W * H * FPS * 0.12, framerate: FPS })).supported) { codec = c; break; } } catch {} }
  if (!codec) { msg.textContent = 'Encodeur H.264 indisponible dans ce navigateur.'; return; }
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: FPS }, fastStart: 'in-memory' });
  const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (msg.textContent = 'Erreur : ' + e.message) });
  enc.configure({ codec, width: W, height: H, bitrate: W * H * FPS * 0.12, framerate: FPS, avc: { format: 'avc' } });
  for (let i = 0; i < N; i++) { const c = dir.render(i); const vf = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) }); enc.encode(vf, { keyFrame: i % (FPS * 2) === 0 }); vf.close();
    while (enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4)); if (i % 10 === 0) { msg.textContent = 'Export MP4… ' + Math.round(i / N * 100) + ' %'; await new Promise((r) => setTimeout(r, 0)); } }
  await enc.flush(); muxer.finalize(); const url = URL.createObjectURL(new Blob([muxer.target.buffer], { type: 'video/mp4' }));
  const a = document.createElement('a'); a.href = url; a.download = ${JSON.stringify(`${plan.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase().slice(0, 40) || 'video'}.mp4`)}; a.click(); msg.textContent = 'MP4 exporté (' + N + ' images, ' + (N / FPS).toFixed(1) + ' s).'; show(frame);
};
open(q);
</script></body></html>`;
}
