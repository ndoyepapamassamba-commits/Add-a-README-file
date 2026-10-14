// Lecteur + export MP4 navigateur. En mode ?render=1, expose window.__studio pour l'export CLI.
import { Studio, FPS } from './studio.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const embedded = window.__ASSETS; // fichier HTML autonome (tools/build-standalone.mjs)

const loadImage = async (src) => {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  return img;
};

const meta = embedded?.meta ?? await (await fetch('assets/meta.json')).json();
const [sourceImage, depthImage] = await Promise.all([
  loadImage(embedded?.source ?? `assets/${meta.source.file}`),
  loadImage(embedded?.depth ?? 'assets/depth-atlas.png'),
]);
const studio = new Studio({
  canvas: $('canvas'), meta, sourceImage, depthImage,
  loadTile: (i) => loadImage(embedded?.tiles?.[i] ?? `assets/${meta.tiles[i].up.file}`),
});

const state = {
  format: params.get('format') === 'slides' ? 'slides' : 'mosaic',
  mode: params.get('mode') === 'original' ? 'original' : '3d',
  camera: params.get('camera') || 'respiration',
  relief: params.has('relief') ? +params.get('relief') : null,
  slideDuration: params.has('duration') ? +params.get('duration') : 2.5,
  user: { yaw: 0, pitch: 0, zoom: 1 },
  pointer: { x: 0, y: 0 },
  autoPointer: false,
};
const defaultRelief = (format) => (format === 'mosaic' ? 0.2 : 0.15);
if (state.relief == null) state.relief = defaultRelief(state.format);

if (params.get('render') === '1') setupRenderMode();
else setupPlayer();

// ---------------------------------------------------------------- export CLI
function setupRenderMode() {
  let buf = null;
  window.__studio = {
    async prepare(opts) {
      Object.assign(state, opts, { autoPointer: true });
      if (opts.relief == null) state.relief = defaultRelief(state.format);
      studio.setFormat(state.format);
      const { w, h } = studio.size;
      buf = new Uint8Array(w * h * 4);
      return { w, h, frames: studio.frameCount(state) };
    },
    async renderFrame(i) {
      // Export CLI : Chromium est lancé avec --expose-gc ; sans nettoyage forcé, les blocs envoyés
      // (8 Mo par frame) s'accumulent jusqu'à la limite mémoire et l'envoi échoue.
      if (i % 10 === 0) globalThis.gc?.();
      await studio.prepare(state, i);
      studio.render(state, i);
      studio.readPixels(buf);
      const body = new Blob([buf]);
      for (let attempt = 1; ; attempt++) { // jusqu'à 3 essais ; le serveur ignore les doublons
        try {
          const res = await fetch(`/__out/${i}`, { method: 'POST', body });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return;
        } catch (err) {
          if (attempt >= 3) throw new Error(`envoi frame ${i} : ${err.message}`);
        }
      }
    },
    // Mosaïque en mode Original : compare le rendu WebGL à l'image décodée par le navigateur.
    verifyOriginal() {
      const s = { ...state, format: 'mosaic', mode: 'original' };
      studio.render(s, 0);
      const { w, h } = studio.size;
      const out = studio.readPixels(new Uint8Array(w * h * 4));
      const c = document.createElement('canvas');
      c.width = meta.source.w;
      c.height = meta.source.h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(sourceImage, 0, 0);
      const ref = ctx.getImageData(0, 0, c.width, c.height).data;
      let diff = 0, max = 0;
      for (let y = 0; y < c.height; y++) {
        const o = (h - 1 - y) * w * 4, r = y * c.width * 4;
        for (let x = 0; x < c.width * 4; x += 4) {
          const d = Math.max(Math.abs(out[o + x] - ref[r + x]), Math.abs(out[o + x + 1] - ref[r + x + 1]), Math.abs(out[o + x + 2] - ref[r + x + 2]));
          if (d) { diff++; if (d > max) max = d; }
        }
      }
      return { pixels: c.width * c.height, diff, max };
    },
  };
  window.__studioReady = true;
}

// ---------------------------------------------------------------- lecteur
function setupPlayer() {
  const stage = $('stage');
  let playing = true;
  let exporting = false;
  let t = 0;
  let last = performance.now();
  let lastExport = null;
  const target = { x: 0, y: 0 };

  // Liste des quartiers : un clic ouvre la vignette dans le diaporama.
  meta.tiles.forEach((tile) => {
    const b = document.createElement('button');
    b.textContent = tile.title;
    b.title = `${tile.title} — ${tile.subtitle}`;
    b.onclick = () => {
      if (state.format !== 'slides') setFormat('slides');
      t = tile.i * state.slideDuration + 0.001;
      playing = true;
    };
    $('places').append(b);
  });

  const total = () => studio.frameCount(state) / FPS;
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;

  function syncUI() {
    const slides = state.format === 'slides';
    $('fmtMosaic').setAttribute('aria-pressed', String(!slides));
    $('fmtSlides').setAttribute('aria-pressed', String(slides));
    $('modeOriginal').setAttribute('aria-pressed', String(state.mode !== '3d'));
    $('mode3d').setAttribute('aria-pressed', String(state.mode === '3d'));
    $('cameraRow').hidden = slides;
    $('durationRow').hidden = !slides;
    $('relief').value = state.relief;
    $('relief').disabled = state.mode !== '3d';
    $('camera').disabled = state.mode !== '3d';
    $('hint3d').textContent = slides
      ? 'Chaque vignette est agrandie ×4 par IA (Real-ESRGAN) puis filmée en 3D. Glissez pour tourner la caméra.'
      : state.camera === 'souris'
        ? 'Survolez la planche : toutes les vignettes suivent la souris.'
        : 'Chaque vignette a sa propre caméra. Les légendes restent fixes, en pixels d\'origine.';
    const { w, h } = studio.size;
    stage.style.setProperty('--ar', `${w} / ${h}`);
    stage.style.setProperty('--arn', String(w / h));
    stage.classList.toggle('grab', slides && state.mode === '3d');
    $('scrub').max = studio.frameCount(state) - 1;
    const label = `${slides ? 'Diaporama 9:16' : 'Mosaïque'} · ${state.mode === '3d' ? 'relief 3D' : 'original'}`;
    $('badge').textContent = label;
    $('tag').textContent = state.mode === '3d' ? `WebGL · ${label}` : `WebGL · ${slides ? 'sans relief' : 'pixel exact'}`;
  }

  function setFormat(format) {
    state.format = format;
    state.relief = defaultRelief(format);
    state.user = { yaw: 0, pitch: 0, zoom: 1 };
    t = 0;
    studio.setFormat(format);
    syncUI();
  }

  $('fmtMosaic').onclick = () => setFormat('mosaic');
  $('fmtSlides').onclick = () => setFormat('slides');
  $('modeOriginal').onclick = () => { state.mode = 'original'; syncUI(); };
  $('mode3d').onclick = () => { state.mode = '3d'; syncUI(); };
  $('camera').value = state.camera;
  $('camera').onchange = (e) => { state.camera = e.target.value; syncUI(); };
  $('duration').value = String(state.slideDuration);
  $('duration').onchange = (e) => { state.slideDuration = +e.target.value; t = 0; syncUI(); };
  $('relief').oninput = (e) => { state.relief = +e.target.value; };
  $('play').onclick = () => { playing = !playing; if (playing && state.format === 'slides' && t >= total() - 1 / FPS) t = 0; };
  $('scrub').oninput = (e) => { playing = false; t = +e.target.value / FPS; };
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, button, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
  });

  // Souris : cible du pointeur (mosaïque) ou rotation de la caméra (diaporama).
  let drag = null;
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    target.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    target.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (drag) {
      const k = 1.2 / r.width;
      state.user.yaw = Math.max(-0.35, Math.min(0.35, drag.yaw - (e.clientX - drag.x) * k));
      state.user.pitch = Math.max(-0.2, Math.min(0.2, drag.pitch + (e.clientY - drag.y) * k));
    }
  });
  stage.addEventListener('pointerleave', () => { target.x = 0; target.y = 0; });
  stage.addEventListener('pointerdown', (e) => {
    if (state.format !== 'slides' || state.mode !== '3d') return;
    drag = { x: e.clientX, y: e.clientY, yaw: state.user.yaw, pitch: state.user.pitch };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('grabbing');
  });
  const endDrag = () => { drag = null; stage.classList.remove('grabbing'); };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('dblclick', () => { state.user = { yaw: 0, pitch: 0, zoom: 1 }; });

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) playing = false;

  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!exporting) {
      if (playing) {
        t += dt;
        if (state.format === 'mosaic') t %= total();
        else if (t >= total()) { t = total() - 1 / FPS; playing = false; }
      }
      state.pointer.x += (target.x - state.pointer.x) * Math.min(1, dt * 6);
      state.pointer.y += (target.y - state.pointer.y) * Math.min(1, dt * 6);
      const frame = Math.min(studio.frameCount(state) - 1, Math.floor(t * FPS));
      studio.prepare(state, frame);
      studio.render(state, frame);
      $('time').textContent = `${fmt(frame / FPS)} / ${fmt(total())}`;
      $('scrub').value = frame;
      $('play').textContent = playing ? '⏸ Pause' : '▶ Lire';
      const current = state.format === 'slides' ? studio.slideAt(frame / FPS, state).at(-1).i : -1;
      $('places').querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-current', String(i === current)));
    }
    requestAnimationFrame(loop);
  }
  syncUI();
  requestAnimationFrame(loop);

  // Export MP4 dans le navigateur : chaque frame est rendue puis encodée (WebCodecs via Mediabunny).
  $('save').onclick = () => lastExport && offerFile(lastExport.blob, lastExport.name);
  $('export').onclick = async () => {
    if (exporting) return;
    exporting = true;
    for (const el of ['export', 'play', 'scrub', 'fmtMosaic', 'fmtSlides', 'modeOriginal', 'mode3d']) $(el).disabled = true;
    const progress = $('progress');
    progress.hidden = false;
    progress.value = 0;
    const s = { ...state, user: { ...state.user }, autoPointer: true };
    try {
      setStatus('Préparation de l\'encodeur…');
      const MB = await import('../vendor/mediabunny.min.mjs');
      studio.setFormat(s.format);
      const { w, h } = studio.size;
      const bitrate = +$('quality').value;
      const codec = await MB.getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], { width: w, height: h, bitrate });
      if (!codec) throw new Error('aucun encodeur vidéo WebCodecs disponible (utilisez Chrome ou Edge récent, ou `npm run export`).');
      const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() });
      const source = new MB.CanvasSource(studio.renderer.domElement, { codec, bitrate });
      output.addVideoTrack(source, { frameRate: FPS });
      await output.start();
      const n = studio.frameCount(s);
      for (let i = 0; i < n; i++) {
        await studio.prepare(s, i);
        studio.render(s, i);
        await source.add(i / FPS, 1 / FPS);
        if (i % 10 === 0) {
          progress.value = i / n;
          setStatus(`Rendu et encodage ${codec.toUpperCase()}… ${Math.round((i / n) * 100)} %`);
        }
      }
      await output.finalize();
      const blob = new Blob([output.target.buffer], { type: 'video/mp4' });
      const name = `abidjan-${s.format === 'slides' ? 'diaporama' : 'mosaique'}-${s.mode === '3d' ? '3d' : 'original'}.mp4`;
      lastExport = { blob, name };
      setStatus(`Terminé : ${(blob.size / 1e6).toFixed(1)} Mo (${codec.toUpperCase()}, ${w}×${h}).`, 'ok');
      $('save').hidden = false;
      await offerFile(blob, name);
    } catch (err) {
      console.error(err);
      setStatus(`Échec de l'export : ${err.message}`, 'err');
    } finally {
      exporting = false;
      progress.hidden = true;
      for (const el of ['export', 'play', 'scrub', 'fmtMosaic', 'fmtSlides', 'modeOriginal', 'mode3d']) $(el).disabled = false;
      last = performance.now();
    }
  };

  window.__player = { state, studio, get t() { return t; } };
}

// Sur claude.ai (Artifact), le cadre bloque les téléchargements directs : on passe par la
// capacité « downloads » (le spectateur confirme). Ailleurs : lien de téléchargement classique.
const downloadsReady = window.claude?.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);

async function offerFile(blob, name) {
  const downloads = await downloadsReady;
  if (downloads) {
    try {
      await downloads.save({ filename: name, data: blob });
      setStatus(`Enregistré : ${name}`, 'ok');
    } catch (err) {
      if (err?.code === 'declined') setStatus('Enregistrement annulé. Le bouton « Enregistrer le MP4 » le propose à nouveau.');
      else if (err?.code === 'rate_limited') setStatus('Une confirmation est déjà ouverte. Réessayez dans un instant.', 'err');
      else setStatus(`Enregistrement impossible ici (${err?.code || err?.message}).`, 'err');
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function setStatus(text, kind = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `status ${kind}`;
}
