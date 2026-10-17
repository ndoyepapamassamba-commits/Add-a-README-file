// PAGE HTML 3D AUTONOME (un seul fichier, hors ligne) — la vidéo d'origine embarquée telle quelle (aucun réencodage),
// une carte de profondeur par image (atlas PNG sans perte), le son AAC d'origine (échantillons copiés au bit près),
// three.js (MIT) et mp4-muxer (MIT) embarqués : on double-clique, la scène 3D se joue, la caméra se pilote à la souris
// et le bouton « Exporter en MP4 » rend chaque image à son instant exact (WebCodecs) avec le son d'origine copié.
// Fonction PURE (aucun accès au DOM ici) : l'app (navigateur) et l'outil en ligne de commande (Node) l'utilisent.
import { sceneRuntime, type SceneLook } from './videoScene';

export type SceneCamera = 'orbite' | 'travelling' | 'fixe';
export interface ScenePageInput {
  title: string;
  /** The source: a video, or a still image (then `duration` is the length of the camera move). */
  video: { b64: string; mime: string; width: number; height: number; duration: number; fps: number; hasAudio: boolean; kind?: 'video' | 'image' };
  depth: { atlasB64: string; w: number; h: number; n: number; fps: number; cols: number; cuts: number[]; band: [number, number] | null; source: string };
  /** Original AAC samples (copied as they are into the exported MP4); null → the sound is decoded and re-encoded. */
  audio: { codec: string; sampleRate: number; channels: number; descB64: string; dataB64: string; table: [number, number, number][] } | null;
  libs: { threeCoreB64: string; threeB64: string; muxerB64: string };
  /** Still image in layers: the set rebuilt behind the foreground (LaMa), its depth, masks (foreground, sky, water,
   *  vegetation) — the camera then sees the real set behind the people, and the set lives. */
  layers?: { plateB64: string; plateMime: string; plateDepthB64: string; pdw: number; pdh: number; masksB64: string; note: string } | null;
  look: SceneLook;
  camera: SceneCamera;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'video';

export function buildScenePage(i: ScenePageInput): string {
  const meta = {
    title: i.title,
    file: slug(i.title),
    video: { mime: i.video.mime, width: i.video.width, height: i.video.height, duration: i.video.duration, fps: i.video.fps, hasAudio: i.video.hasAudio, kind: i.video.kind ?? 'video' },
    depth: { w: i.depth.w, h: i.depth.h, n: i.depth.n, fps: i.depth.fps, cols: i.depth.cols, cuts: i.depth.cuts, band: i.depth.band, source: i.depth.source },
    audio: i.audio ? { codec: i.audio.codec, sampleRate: i.audio.sampleRate, channels: i.audio.channels, desc: i.audio.descB64, table: i.audio.table } : null,
    look: i.look,
    camera: i.camera,
    layers: i.layers ? { plateMime: i.layers.plateMime, pdw: i.layers.pdw, pdh: i.layers.pdh, note: i.layers.note } : null,
  };
  const ar = i.video.width / i.video.height;
  const runtime = sceneRuntime.toString().replace(/<\/script/gi, '<\\/script');
  const t = esc(i.title);
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t} — scène 3D</title>
<link rel="icon" href="data:,">
<style>
:root{--bg:#0d0f14;--panel:#161922;--panel2:#1e222d;--line:#2a2f3b;--text:#eef0f5;--muted:#9aa2b3;--accent:#f26b3a;--ok:#36c46c;--err:#ff6b6b;color-scheme:dark}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 16px;border-bottom:1px solid var(--line)}
header h1{font-size:17px;margin:0}.badge{font-size:12px;padding:3px 9px;border-radius:99px;background:rgba(54,196,108,.14);color:var(--ok);border:1px solid rgba(54,196,108,.35);white-space:nowrap}
main{display:grid;grid-template-columns:minmax(0,auto) 360px;gap:22px;padding:18px 16px;justify-content:center;align-items:start}
.stage{position:relative;height:min(calc(100vh - 110px),1100px);aspect-ratio:${ar.toFixed(5)};max-width:100%;border-radius:14px;overflow:hidden;background:#000;box-shadow:0 20px 60px rgba(0,0,0,.45);touch-action:none;cursor:grab}
.stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.stage .hint{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.25);border:0;color:#fff;font-size:64px;cursor:pointer}
.stage .hint[hidden]{display:none}.stage .tag{position:absolute;left:10px;top:10px;font-size:12px;padding:3px 8px;border-radius:8px;background:rgba(0,0,0,.55);pointer-events:none}
aside{display:flex;flex-direction:column;gap:14px;min-width:0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.card h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin:0 0 10px;font-weight:600}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.row+.row{margin-top:10px}.grow{flex:1}
button,select{font:inherit;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:8px 12px;cursor:pointer}
button:disabled{opacity:.45;cursor:not-allowed}button.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.seg{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:3px;width:100%}
.seg button{border:0;background:transparent;padding:7px 4px;border-radius:8px;font-size:13px}.seg button[aria-pressed=true]{background:#2e3342;box-shadow:inset 0 0 0 1px #3c4253}
input[type=range]{width:100%;accent-color:var(--accent)}.time{font-variant-numeric:tabular-nums;color:var(--muted);font-size:13px}
progress{width:100%;height:8px;accent-color:var(--accent)}.status{font-size:13px;color:var(--muted);min-height:1.4em}.status.ok{color:var(--ok)}.status.err{color:var(--err)}
.note{color:var(--muted);font-size:12.5px;margin:8px 0 0}a.dl{color:var(--accent);font-weight:600}
@media (max-width:900px){main{grid-template-columns:minmax(0,1fr)}.stage{height:auto;width:100%;max-width:480px;margin:0 auto}}
</style></head>
<body>
<header><h1>${t}</h1><span class="badge" id="badge">Chargement…</span></header>
<main>
  <div class="stage" id="stage"><canvas id="canvas" aria-label="Scène 3D WebGL"></canvas><span class="tag" id="tag">WebGL · three.js</span><button class="hint" id="hint" aria-label="Lire">▶</button></div>
  <aside>
    <section class="card"><h2>Lecture</h2>
      <div class="row"><button id="play" aria-label="Lire / pause">▶ Lire</button><button id="mute" aria-label="Son">🔇</button><span class="time grow" id="time"></span></div>
      <div class="row"><input type="range" id="scrub" min="0" value="0" step="1" aria-label="Position"></div>
    </section>
    <section class="card"><h2>Rendu</h2>
      <div class="seg" role="group" aria-label="Style"><button data-style="original">Original</button><button data-style="relief">Relief 3D</button><button data-style="nuage">Points</button><button data-style="holo">Holo</button></div>
      <div class="row"><span>Caméra</span><select id="camera" class="grow" aria-label="Caméra"><option value="orbite">Orbite</option><option value="travelling">Travelling avant</option><option value="fixe">Fixe (à la souris)</option></select></div>
      <div class="row"><span>Relief</span><input type="range" id="relief" min="0.05" max="1" step="0.05" class="grow" aria-label="Relief"></div>
      <div class="row" id="aliveRow" hidden><label><input type="checkbox" id="alive" checked> Décor vivant (ciel, eau, arbres)</label></div>
      <p class="note">Glissez sur l’image pour déplacer la caméra, molette pour avancer, double-clic pour recentrer.</p>
    </section>
    <section class="card"><h2>Export MP4</h2>
      <div class="row"><span>Qualité</span><select id="quality" class="grow" aria-label="Qualité"><option value="40000000">Maximale (≈ 40 Mb/s)</option><option value="20000000" selected>Haute (≈ 20 Mb/s)</option><option value="10000000">TikTok (≈ 10 Mb/s)</option></select></div>
      <div class="row"><button class="primary grow" id="export">Exporter en MP4</button></div>
      <div class="row"><progress id="progress" max="1" value="0" hidden></progress></div>
      <div class="row"><a class="dl" id="dl" hidden>Enregistrer le MP4</a></div>
      <div class="status" id="status">Chaque image est rendue à son instant exact (${i.video.width}×${i.video.height}, ${i.video.fps} i/s).</div>
      <p class="note">Fichier autonome : tout fonctionne hors ligne. Export : Chrome ou Edge sur ordinateur (WebCodecs).</p>
    </section>
    <p class="note">Profondeur : ${esc(i.depth.source)}${i.layers ? ` · ${esc(i.layers.note)}` : ''} · three.js (MIT) · mp4-muxer (MIT). ${i.video.kind === 'image' ? 'Pixels d’origine conservés.' : 'Pixels et son d’origine conservés.'}</p>
  </aside>
</main>
<script type="application/json" id="meta">${JSON.stringify(meta).replace(/</g, '\\u003c')}</script>
<script type="application/octet-stream" id="asset-video">${i.video.b64}</script>
<script type="application/octet-stream" id="asset-depth">${i.depth.atlasB64}</script>
<script type="application/octet-stream" id="asset-audio">${i.audio?.dataB64 ?? ''}</script>
<script type="application/octet-stream" id="asset-plate">${i.layers?.plateB64 ?? ''}</script>
<script type="application/octet-stream" id="asset-plate-depth">${i.layers?.plateDepthB64 ?? ''}</script>
<script type="application/octet-stream" id="asset-masks">${i.layers?.masksB64 ?? ''}</script>
<script type="application/octet-stream" id="lib-three-core">${i.libs.threeCoreB64}</script>
<script type="application/octet-stream" id="lib-three">${i.libs.threeB64}</script>
<script type="application/octet-stream" id="lib-muxer">${i.libs.muxerB64}</script>
<script>
var __name = function (f) { return f; };
const sceneRuntime = ${runtime};
(async () => {
  const $ = (id) => document.getElementById(id);
  const say = (t, c) => { const s = $('status'); s.textContent = t; s.className = 'status ' + (c || ''); };
  const bytes = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let k = 0; k < s.length; k++) u[k] = s.charCodeAt(k); return u; };
  const asset = (id) => bytes($(id).textContent.trim());
  const js = (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    const M = JSON.parse($('meta').textContent);
    const dec = new TextDecoder();
    const coreUrl = js(dec.decode(asset('lib-three-core')));
    const THREE = await import(js(dec.decode(asset('lib-three')).split("'./three.core.js'").join(JSON.stringify(coreUrl))));
    const MUX = await import(js(dec.decode(asset('lib-muxer'))));
    const V = M.video, D = M.depth;
    // The source: a video (its own clock) or a still image (a clock of ours, looping over the camera move).
    let media, now, paused, start, stop, seek, tick = () => {};
    if (V.kind === 'image') {
      const img = new Image();
      img.src = URL.createObjectURL(new Blob([asset('asset-video')], { type: V.mime }));
      await img.decode();
      media = img;
      let t = 0, run = false, last = 0;
      now = () => t; paused = () => !run;
      start = async () => { run = true; last = performance.now(); };
      stop = () => { run = false; };
      seek = async (x) => { t = Math.max(0, Math.min(V.duration, x)); };
      tick = (ts) => { if (run) { t += (ts - last) / 1000; last = ts; if (t >= V.duration) t = 0; } };
      $('mute').hidden = true;
    } else {
      const video = document.createElement('video');
      video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
      video.src = URL.createObjectURL(new Blob([asset('asset-video')], { type: V.mime }));
      await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = () => rej(new Error('ce navigateur ne lit pas cette vidéo (' + V.mime + ') : ouvrez la page dans Chrome ou Edge')); });
      media = video;
      now = () => video.currentTime; paused = () => video.paused;
      start = async () => { video.muted = false; $('mute').textContent = '🔊'; await video.play(); };
      stop = () => video.pause();
      seek = (t) => new Promise((res) => { const target = Math.max(0, Math.min(t, V.duration - 0.001)); if (Math.abs(video.currentTime - target) < 1e-4 && video.readyState >= 2) return res(); const done = () => { video.removeEventListener('seeked', done); res(); }; video.addEventListener('seeked', done); video.currentTime = target; });
      $('mute').onclick = () => { video.muted = !video.muted; $('mute').textContent = video.muted ? '🔇' : '🔊'; };
    }
    // Depth frames from the lossless atlas.
    const img = new Image();
    img.src = 'data:image/png;base64,' + $('asset-depth').textContent.trim();
    await img.decode();
    const ac = document.createElement('canvas'); ac.width = img.width; ac.height = img.height;
    const ag = ac.getContext('2d', { willReadFrequently: true }); ag.drawImage(img, 0, 0);
    const px = ag.getImageData(0, 0, ac.width, ac.height).data;
    const frames = [];
    for (let k = 0; k < D.n; k++) {
      const cx = (k % D.cols) * D.w, cy = Math.floor(k / D.cols) * D.h, f = new Uint8Array(D.w * D.h);
      for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) f[y * D.w + x] = px[((cy + y) * ac.width + cx + x) * 4];
      frames.push(f);
    }
    const cuts = new Set(D.cuts), dbuf = new Uint8Array(D.w * D.h);
    const depthAt = (t) => {
      const fr = Math.max(0, Math.min(D.n - 1, t * D.fps)), i0 = Math.floor(fr), i1 = Math.min(D.n - 1, i0 + 1);
      let k = fr - i0; if (cuts.has(i1)) k = k < 0.5 ? 0 : 1;
      const a = frames[i0], b = frames[i1];
      if (k >= 1) dbuf.set(b); else if (k < 1e-3 || i0 === i1) dbuf.set(a); else for (let p = 0; p < dbuf.length; p++) dbuf[p] = Math.round(a[p] * (1 - k) + b[p] * k);
      return dbuf;
    };
    const canvas = $('canvas'); canvas.width = V.width; canvas.height = V.height;
    const rt = sceneRuntime(THREE, canvas, { width: V.width, height: V.height, aspect: V.width / V.height, dw: D.w, dh: D.h });
    // Layers: the rebuilt set behind the foreground, its depth, the masks.
    if (M.layers) {
      const pic = async (id, mime) => { const im = new Image(); im.src = URL.createObjectURL(new Blob([asset(id)], { type: mime })); await im.decode(); return im; };
      const plate = await pic('asset-plate', M.layers.plateMime), masks = await pic('asset-masks', 'image/png'), pdi = await pic('asset-plate-depth', 'image/png');
      const dc = document.createElement('canvas'); dc.width = M.layers.pdw; dc.height = M.layers.pdh;
      const dg = dc.getContext('2d', { willReadFrequently: true }); dg.drawImage(pdi, 0, 0, dc.width, dc.height);
      const dp = dg.getImageData(0, 0, dc.width, dc.height).data, pd = new Uint8Array(dc.width * dc.height);
      for (let k = 0; k < pd.length; k++) pd[k] = dp[k * 4];
      rt.setLayers({ plate, plateDepth: pd, pdw: dc.width, pdh: dc.height, masks });
      $('aliveRow').hidden = false;
    }
    const look = Object.assign({ alive: true }, M.look);
    $('alive').onchange = (e) => { look.alive = e.target.checked; dirty = true; };
    let camMode = M.camera, drag = { x: 0, y: 0, z: 0 }, exporting = false, dirty = true;
    const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const cam = (t) => {
      const k = V.duration ? t / V.duration : 0; let c;
      if (camMode === 'orbite') { const a = Math.sin(k * Math.PI * 2); c = { ox: 0.035 * a, oy: 0.01 * Math.cos(k * Math.PI * 2), zoom: 1.08, dolly: 0.1, focus: 0.5, roll: 0.006 * a }; }
      else if (camMode === 'travelling') c = { ox: 0.012 * Math.sin(k * Math.PI), oy: -0.006 * ease(k), zoom: 1.05, dolly: 0.45 * ease(k), focus: 0.35, roll: 0 };
      else c = { ox: 0, oy: 0, zoom: 1.04, dolly: 0, focus: 0.5, roll: 0 };
      c.ox += drag.x; c.oy += drag.y; c.dolly = Math.max(-0.6, Math.min(0.95, (c.dolly || 0) + drag.z));
      return c;
    };
    const draw = (t) => rt.render(media, depthAt(t), cam(t), look, t);
    const n = Math.max(1, Math.round(V.duration * V.fps));
    const scrub = $('scrub'); scrub.max = String(n - 1);
    const fmt = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return String(m).padStart(2, '0') + ':' + r.toFixed(2).padStart(5, '0'); };
    const showTime = () => { const t = now(); $('time').textContent = fmt(t) + ' / ' + fmt(V.duration) + ' · image ' + Math.min(n - 1, Math.floor(t * V.fps + 1e-6)); if (!paused()) scrub.value = String(Math.floor(t * V.fps)); };
    const loop = (ts) => { tick(ts); if (!exporting && (dirty || !paused())) { draw(now()); showTime(); dirty = false; } requestAnimationFrame(loop); };
    const setStyle = (s) => { look.style = s; for (const b of document.querySelectorAll('[data-style]')) b.setAttribute('aria-pressed', String(b.dataset.style === s)); $('badge').textContent = s === 'original' ? 'Original · pixels d’origine' : M.layers && s === 'relief' ? 'Relief 3D · décor reconstruit derrière les personnages' : 'Relief 3D · une profondeur par image'; $('camera').disabled = $('relief').disabled = s === 'original'; dirty = true; };
    for (const b of document.querySelectorAll('[data-style]')) b.onclick = () => setStyle(b.dataset.style);
    $('camera').value = camMode; $('camera').onchange = (e) => { camMode = e.target.value; dirty = true; };
    $('relief').value = String(look.relief); $('relief').oninput = (e) => { look.relief = Number(e.target.value); dirty = true; };
    const toggle = async () => { if (paused()) { await start(); $('play').textContent = '❚❚ Pause'; $('hint').hidden = true; } else { stop(); $('play').textContent = '▶ Lire'; } dirty = true; };
    $('play').onclick = toggle; $('hint').onclick = toggle;
    scrub.oninput = async () => { stop(); $('play').textContent = '▶ Lire'; await seek((Number(scrub.value) + 0.25) / V.fps); dirty = true; };
    const stage = $('stage'); let grab = null;
    stage.onpointerdown = (e) => { if (e.target.id === 'hint') return; grab = [e.clientX, e.clientY, drag.x, drag.y]; stage.setPointerCapture(e.pointerId); };
    stage.onpointermove = (e) => { if (!grab) return; const r = stage.getBoundingClientRect(); drag.x = grab[2] + ((e.clientX - grab[0]) / r.width) * 0.12; drag.y = grab[3] + ((e.clientY - grab[1]) / r.height) * 0.08; dirty = true; };
    stage.onpointerup = () => (grab = null);
    stage.onwheel = (e) => { e.preventDefault(); drag.z = Math.max(-0.6, Math.min(0.9, drag.z - e.deltaY * 0.001)); dirty = true; };
    stage.ondblclick = () => { drag = { x: 0, y: 0, z: 0 }; dirty = true; };
    document.addEventListener('keydown', (e) => { if (e.code === 'Space' && !/INPUT|SELECT|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); toggle(); } });
    setStyle(look.style);
    requestAnimationFrame(loop);

    $('export').onclick = async () => {
      if (typeof VideoEncoder === 'undefined') return say('Ce navigateur n’a pas WebCodecs : ouvrez ce fichier dans Chrome ou Edge récent sur ordinateur.', 'err');
      exporting = true; stop(); $('play').textContent = '▶ Lire';
      for (const b of document.querySelectorAll('button,select,input')) b.disabled = true;
      const prog = $('progress'); prog.hidden = false; prog.value = 0; $('dl').hidden = true;
      const t0 = performance.now();
      try {
        const W = V.width, H = V.height, fps = V.fps, bitrate = Number($('quality').value);
        let cfg = null, vmux = 'avc';
        for (const [codec, m] of [['avc1.640033', 'avc'], ['avc1.640028', 'avc'], ['avc1.4d0028', 'avc'], ['avc1.42001f', 'avc'], ['vp09.00.40.08', 'vp9']]) {
          const c = { codec, width: W, height: H, bitrate, framerate: fps }; if (m === 'avc') c.avc = { format: 'avc' };
          try { if ((await VideoEncoder.isConfigSupported(c)).supported) { cfg = c; vmux = m; break; } } catch (e) {}
        }
        if (!cfg) throw new Error('aucun encodeur vidéo disponible dans ce navigateur');
        // Sound: the original AAC samples copied as they are; otherwise decoded and re-encoded.
        const A = M.audio; let aopt = null, pcm = null, acfg = null;
        if (A) aopt = { codec: 'aac', numberOfChannels: A.channels, sampleRate: A.sampleRate };
        else if (V.hasAudio && typeof AudioEncoder !== 'undefined') {
          try { pcm = await new OfflineAudioContext(2, 48000, 48000).decodeAudioData(asset('asset-video').buffer); } catch (e) { pcm = null; }
          if (pcm) for (const [codec, m] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) { const c = { codec, sampleRate: pcm.sampleRate, numberOfChannels: Math.min(2, pcm.numberOfChannels), bitrate: 160000 }; try { if ((await AudioEncoder.isConfigSupported(c)).supported) { acfg = c; aopt = { codec: m, numberOfChannels: c.numberOfChannels, sampleRate: c.sampleRate }; break; } } catch (e) {} }
        }
        const muxer = new MUX.Muxer({ target: new MUX.ArrayBufferTarget(), video: { codec: vmux, width: W, height: H, frameRate: fps }, ...(aopt ? { audio: aopt } : {}), fastStart: 'in-memory' });
        const end = (n / fps) * 1e6;
        if (A) {
          const data = asset('asset-audio'), desc = bytes(A.desc); let off = 0;
          A.table.forEach(([size, ts, dur], k) => { if (ts < end + 50000) muxer.addAudioChunkRaw(data.subarray(off, off + size), 'key', ts, dur, k === 0 ? { decoderConfig: { codec: A.codec, sampleRate: A.sampleRate, numberOfChannels: A.channels, description: desc } } : undefined); off += size; });
        } else if (acfg && pcm) {
          let afail = null; const ae = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (afail = e) }); ae.configure(acfg);
          const ch = acfg.numberOfChannels, total = Math.min(pcm.length, Math.round((n / fps) * pcm.sampleRate)), chans = []; for (let c = 0; c < ch; c++) chans.push(pcm.getChannelData(Math.min(c, pcm.numberOfChannels - 1)));
          for (let off = 0; off < total; off += 4096) { const m = Math.min(4096, total - off), d = new Float32Array(m * ch); for (let c = 0; c < ch; c++) d.set(chans[c].subarray(off, off + m), c * m); const ad = new AudioData({ format: 'f32-planar', sampleRate: pcm.sampleRate, numberOfFrames: m, numberOfChannels: ch, timestamp: Math.round((off / pcm.sampleRate) * 1e6), data: d }); ae.encode(ad); ad.close(); }
          await ae.flush(); ae.close(); if (afail) throw afail;
        }
        let fail = null;
        const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (fail = e) });
        enc.configure(cfg);
        for (let k = 0; k < n; k++) {
          if (fail) throw fail;
          await seek((k + 0.25) / fps);
          draw(k / fps);
          const vf = new VideoFrame(canvas, { timestamp: Math.round((k * 1e6) / fps), duration: Math.round(1e6 / fps) });
          enc.encode(vf, { keyFrame: k % (fps * 2) === 0 }); vf.close();
          while (enc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 2));
          if (k % 5 === 0) { prog.value = k / n; say('Rendu image par image… ' + Math.round((k / n) * 100) + ' % (' + k + '/' + n + ')'); await new Promise((r) => setTimeout(r, 0)); }
        }
        await enc.flush(); enc.close(); if (fail) throw fail;
        muxer.finalize();
        const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
        const a = $('dl'); a.href = URL.createObjectURL(blob); a.download = M.file + (look.style === 'original' ? '-original' : '-3d') + '.mp4'; a.hidden = false; a.click();
        prog.value = 1;
        say('MP4 prêt : ' + n + ' images ' + W + '×' + H + ', ' + cfg.codec + (A ? ', son d’origine copié tel quel' : aopt ? ', son ' + aopt.codec : ', sans son') + ' · ' + (blob.size / 1048576).toFixed(1) + ' Mo en ' + ((performance.now() - t0) / 1000).toFixed(0) + ' s.', 'ok');
        window.__export = { frames: n, bytes: blob.size, codec: cfg.codec, audio: A ? 'copy' : aopt ? aopt.codec : null };
      } catch (e) { say('Export : ' + e.message, 'err'); window.__export = { error: e.message }; }
      exporting = false; dirty = true;
      for (const b of document.querySelectorAll('button,select,input')) b.disabled = false;
      $('camera').disabled = $('relief').disabled = look.style === 'original';
    };
    say(V.kind === 'image' ? 'Prête : image ' + V.width + '×' + V.height + ' et sa carte de profondeur ; mouvement de caméra de ' + V.duration + ' s (' + n + ' images). Lancez la lecture ou exportez en MP4.' : 'Prête : ' + n + ' images, ' + D.n + ' cartes de profondeur' + (D.cuts.length ? ', ' + D.cuts.length + ' changement(s) de plan' : '') + '. Lancez la lecture ou exportez en MP4.');
    window.__scene = { ready: true, frames: n, depth: D.n };
  } catch (e) { say('Erreur : ' + e.message, 'err'); window.__scene = { error: e.message }; }
})();
</script></body></html>`;
}
