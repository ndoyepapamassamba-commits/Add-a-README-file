// Lecteur + export MP4 navigateur. En mode ?render=1, expose window.__studio pour l'export CLI.
import {
  Compositor, loadDepth, makeVideoTexture, makeCanvasTexture, makeDataTexture,
  W, H, FPS, FRAMES, DURATION,
} from './compositor.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

const state = {
  mode: params.get('mode') === '3d' ? '3d' : 'original',
  camera: params.get('camera') || 'travelling',
  relief: params.has('relief') ? +params.get('relief') : 0.15,
  subtitles: params.get('subs') === '1',
  user: { yaw: 0, pitch: 0, zoom: 1 },
  frame: 0,
};

const depth = await loadDepth('./assets/');
const compositor = new Compositor({ canvas: $('canvas'), depthMeta: depth.meta, depthImage: depth.image });
const draw = () => compositor.render(state);

if (params.get('render') === '1') {
  setupRenderMode();
} else {
  setupPlayer();
}

// ---------------------------------------------------------------- export CLI
function setupRenderMode() {
  document.body.classList.add('render');
  const tex = makeDataTexture();
  compositor.setSource(tex);
  const out = new Uint8Array(W * H * 4);
  window.__studio = {
    has3D: compositor.has3D,
    compositor,
    texture: tex,
    async renderFrame(i, opts) {
      Object.assign(state, opts, { frame: i });
      const buf = await (await fetch(`/__frame/${i}`)).arrayBuffer();
      tex.image.data.set(new Uint8Array(buf));
      tex.needsUpdate = true;
      draw();
      compositor.readPixels(out);
      // Un Blob évite une copie lente côté navigateur (≈ 10× plus rapide qu'un Uint8Array).
      const res = await fetch(`/__out/${i}`, { method: 'POST', body: new Blob([out]) });
      if (!res.ok) throw new Error(`upload frame ${i}: ${res.status}`);
    },
  };
  window.__studioReady = true;
}

// ---------------------------------------------------------------- lecteur
function setupPlayer() {
  const video = $('video');
  const embedded = window.__ASSETS; // fichier HTML autonome (tools/build-standalone.mjs)
  if (embedded?.video) video.src = embedded.video;
  if (params.get('src')) video.src = params.get('src');
  const videoTex = makeVideoTexture(video);
  compositor.setSource(videoTex);
  const stage = $('stage');
  let exporting = false;
  let lastExport = null;
  $('save').onclick = () => lastExport && offerFile(lastExport.blob, lastExport.name);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  const syncUI = () => {
    $('time').textContent = `${fmt(state.frame / FPS)} / ${fmt(DURATION)} · frame ${state.frame}`;
    $('scrub').value = state.frame;
    const playing = !video.paused && !video.ended;
    $('play').textContent = playing ? '⏸ Pause' : '▶ Lire';
    $('playHint').hidden = playing || state.frame > 0;
  };
  const syncMode = () => {
    const is3D = state.mode === '3d';
    $('modeOriginal').setAttribute('aria-pressed', String(!is3D));
    $('mode3d').setAttribute('aria-pressed', String(is3D));
    $('opts3d').disabled = !is3D;
    stage.classList.toggle('grab', is3D);
    $('badge').textContent = is3D ? 'Mode relief 3D' : 'Mode original · pixel exact';
    $('tag').textContent = is3D ? `WebGL · relief 3D · caméra ${state.camera}` : 'WebGL · rendu pixel exact';
  };
  if (!compositor.has3D) {
    $('mode3d').disabled = true;
    $('mode3d').title = 'assets/depth-atlas.png introuvable';
    state.mode = 'original';
  }
  $('camera').value = state.camera;
  $('relief').value = state.relief;
  $('subs').checked = state.subtitles;
  syncMode();

  // Frame réellement affichée par la balise <video>.
  const frameFromTime = (t) => Math.min(FRAMES - 1, Math.max(0, Math.round(t * FPS - 0.25)));
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    const onFrame = (_now, meta) => {
      state.frame = frameFromTime(meta.mediaTime);
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  }
  const loop = () => {
    if (!exporting) {
      if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) state.frame = frameFromTime(video.currentTime);
      if (video.readyState >= 2) draw();
      syncUI();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const seek = (f) => {
    state.frame = f;
    video.currentTime = (f + 0.5) / FPS; // milieu de la frame : affichage exact de la frame f
  };
  const togglePlay = () => {
    if (exporting) return;
    if (video.paused || video.ended) {
      if (video.ended || state.frame >= FRAMES - 1) seek(0);
      video.play().catch((e) => setStatus(`Lecture impossible : ${e.message}`, 'err'));
    } else video.pause();
  };
  $('play').onclick = togglePlay;
  $('playHint').onclick = togglePlay;
  $('mute').onclick = () => { video.muted = !video.muted; $('mute').textContent = video.muted ? '🔇' : '🔊'; };
  $('scrub').oninput = (e) => { video.pause(); seek(+e.target.value); };
  $('ab').onchange = (e) => stage.classList.toggle('ab', e.target.checked);
  $('modeOriginal').onclick = () => { state.mode = 'original'; syncMode(); };
  $('mode3d').onclick = () => { state.mode = '3d'; syncMode(); };
  $('camera').onchange = (e) => { state.camera = e.target.value; state.user = { yaw: 0, pitch: 0, zoom: 1 }; syncMode(); };
  $('relief').oninput = (e) => { state.relief = +e.target.value; };
  $('subs').onchange = (e) => { state.subtitles = e.target.checked; };
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, button, textarea')) return; // comportement natif conservé
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') { video.pause(); seek(Math.min(FRAMES - 1, state.frame + 1)); }
    if (e.code === 'ArrowLeft') { video.pause(); seek(Math.max(0, state.frame - 1)); }
  });

  // Caméra interactive (mode 3D).
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (state.mode !== '3d' || e.target.closest('button')) return;
    drag = { x: e.clientX, y: e.clientY, yaw: state.user.yaw, pitch: state.user.pitch };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('grabbing');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = 1.2 / stage.clientWidth;
    state.user.yaw = clamp(drag.yaw - (e.clientX - drag.x) * k, -0.4, 0.4);
    state.user.pitch = clamp(drag.pitch + (e.clientY - drag.y) * k, -0.22, 0.22);
  });
  const endDrag = () => { drag = null; stage.classList.remove('grabbing'); };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('wheel', (e) => {
    if (state.mode !== '3d') return;
    e.preventDefault();
    state.user.zoom = clamp(state.user.zoom * Math.exp(e.deltaY * 0.001), 0.6, 1.15);
  }, { passive: false });
  stage.addEventListener('dblclick', () => { state.user = { yaw: 0, pitch: 0, zoom: 1 }; });

  // Export MP4 dans le navigateur : Mediabunny décode chaque frame source (WebCodecs),
  // Three.js la redessine, puis la frame est ré-encodée ; la piste audio est copiée sans perte.
  $('export').onclick = async () => {
    if (exporting) return;
    exporting = true;
    video.pause();
    for (const el of ['export', 'play', 'scrub', 'modeOriginal', 'mode3d']) $(el).disabled = true;
    const progress = $('progress');
    progress.hidden = false;
    progress.value = 0;
    const saved = { ...state, user: { ...state.user } };
    try {
      setStatus('Préparation de l\'encodeur…');
      const MB = await import('../vendor/mediabunny.min.mjs');
      const bitrate = +$('quality').value;
      const codec = await MB.getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], { width: W, height: H, bitrate });
      if (!codec) throw new Error('aucun encodeur vidéo WebCodecs disponible (utilisez Chrome/Edge récent ou `npm run export`).');
      const source = embedded?.videoBlob && !params.get('src')
        ? new MB.BlobSource(embedded.videoBlob)
        : new MB.UrlSource(video.currentSrc || video.src);
      const input = new MB.Input({ source, formats: MB.ALL_FORMATS });
      const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() });
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = W;
      srcCanvas.height = H;
      const srcCtx = srcCanvas.getContext('2d', { alpha: false });
      const srcTex = makeCanvasTexture(srcCanvas);
      compositor.setSource(srcTex);
      const conversion = await MB.Conversion.init({
        input,
        output,
        video: {
          codec,
          quality: new MB.Quality({ bitrate, bitrateMode: 'variable' }),
          forceTranscode: true,
          frameRate: FPS,
          processedWidth: W,
          processedHeight: H,
          process: (sample) => {
            sample.draw(srcCtx, 0, 0, W, H);
            srcTex.needsUpdate = true;
            compositor.render({ ...saved, frame: Math.round(sample.timestamp * FPS) });
            return compositor.renderer.domElement;
          },
        },
      });
      if (!conversion.isValid) {
        throw new Error(`conversion impossible : ${conversion.discardedTracks.map((d) => `${d.track.type} (${d.reason})`).join(', ')}`);
      }
      conversion.onProgress = (p) => {
        progress.value = p;
        setStatus(`Rendu et encodage ${codec.toUpperCase()}… ${Math.round(p * 100)} %`);
      };
      await conversion.execute();
      const blob = new Blob([output.target.buffer], { type: 'video/mp4' });
      const name = `ivrogne-${saved.mode === '3d' ? `3d-${saved.camera}` : 'original'}${saved.subtitles ? '-soustitres' : ''}.mp4`;
      lastExport = { blob, name };
      setStatus(`Terminé : ${(blob.size / 1e6).toFixed(1)} Mo (${codec.toUpperCase()}).`, 'ok');
      $('save').hidden = false;
      await offerFile(blob, name);
    } catch (err) {
      console.error(err);
      setStatus(`Échec de l'export : ${err.message}`, 'err');
    } finally {
      compositor.setSource(videoTex);
      exporting = false;
      progress.hidden = true;
      for (const el of ['export', 'play', 'scrub', 'modeOriginal']) $(el).disabled = false;
      $('mode3d').disabled = !compositor.has3D;
    }
  };

  window.__player = { state, compositor, video, draw };
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

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
