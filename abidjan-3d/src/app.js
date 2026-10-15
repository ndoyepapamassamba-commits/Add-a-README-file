// Studio : prompt → plan de scène (HTML éditable) → aperçu 3D → vidéo MP4 ou image PNG.
// En mode ?render=1, expose window.__studio pour l'export en ligne de commande.
import { Studio, FPS } from './studio.js';
import { MOVES, interpretLocal, interpretWithClaude, makeCatalog, normalizePlan, describePlan } from './prompt.js';

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
const catalog = () => makeCatalog(meta, studio.uploads);

// Diaporama : plan automatique avec les 30 quartiers.
const SLIDE_MOVES = ['approche', 'orbite-droite', 'orbite-gauche', 'plongee'];
const autoPlan = (duration = 2.5) => normalizePlan({
  output: 'video', format: '9:16', relief: 0.15, intensity: 1, transition: 'fondu',
  shots: meta.tiles.map((t, i) => ({ image: `tile:${t.i}`, move: SLIDE_MOVES[i % 4], duration })),
}, catalog());

const state = {
  format: 'mosaic',         // rendu : 'mosaic' | 'plan'
  view: 'mosaic',           // bouton actif : 'mosaic' | 'slides' | 'plan'
  plan: autoPlan(),
  promptPlan: null,
  mode: params.get('mode') === 'original' ? 'original' : '3d',
  camera: params.get('camera') || 'respiration',
  relief: params.has('relief') ? +params.get('relief') : 0.2,
  slideDuration: params.has('duration') ? +params.get('duration') : 2.5,
  user: { yaw: 0, pitch: 0, zoom: 1 },
  pointer: { x: 0, y: 0 },
  autoPointer: false,
};

/** Applique un plan interprété : mosaïque ou montage. */
function applyPlan(plan) {
  if (plan.format === 'mosaique') {
    state.format = 'mosaic';
    state.camera = plan.camera;
    state.relief = plan.relief > 0 ? Math.max(plan.relief, 0.12) : 0;
  } else {
    state.format = 'plan';
    state.plan = plan;
  }
}

if (params.get('render') === '1') setupRenderMode();
else setupPlayer();

// ---------------------------------------------------------------- export CLI
function setupRenderMode() {
  let buf = null;
  window.__studio = {
    async prepare(opts) {
      Object.assign(state, { mode: opts.mode === 'original' ? 'original' : '3d', autoPointer: true });
      let output = 'video', understood = [];
      if (opts.prompt) {
        const r = interpretLocal(opts.prompt, catalog());
        applyPlan(r.plan);
        output = r.plan.output;
        understood = r.understood;
      } else if (opts.format === 'slides') {
        state.format = 'plan';
        state.plan = autoPlan(opts.slideDuration || 2.5);
        if (opts.relief != null) state.plan.relief = opts.relief;
      } else {
        state.format = 'mosaic';
        state.camera = opts.camera || 'respiration';
        state.relief = opts.relief ?? 0.2;
      }
      studio.resize(state);
      const { w, h } = studio.size;
      buf = new Uint8Array(w * h * 4);
      return { w, h, frames: studio.frameCount(state), still: studio.stillFrame(state), output, understood, format: state.format };
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
  let busy = false;
  let t = 0;
  let last = performance.now();
  let lastFile = null;
  const target = { x: 0, y: 0 };

  // ---- exemples de prompts
  const EXAMPLES = [
    'Vidéo TikTok de 12 s : travelling sur Cocody puis le Plateau, relief fort, titre « Bienvenue à Abidjan »',
    'Tous les villages au bord de la mer, rythme lent, format YouTube, fin « Abonne-toi »',
    '5 quartiers populaires au hasard, coupes sèches, 2 s par plan, avec les noms des quartiers',
    'Une affiche carrée du village d\'Assinie en plongée',
    'La mosaïque en vague',
  ];
  for (const ex of EXAMPLES) {
    const b = document.createElement('button');
    b.textContent = ex.length > 42 ? `${ex.slice(0, 40)}…` : ex;
    b.title = ex;
    b.onclick = () => { $('prompt').value = ex; runInterpretation(false); };
    $('examples').append(b);
  }

  // ---- liste des quartiers (aperçu rapide dans le diaporama)
  meta.tiles.forEach((tile) => {
    const b = document.createElement('button');
    b.textContent = tile.title;
    b.title = `${tile.title} — ${tile.subtitle}`;
    b.onclick = () => {
      if (state.view !== 'slides') setView('slides');
      const seg = studio.segments(state.plan).segs.find((x) => x.image === `tile:${tile.i}`);
      t = (seg?.start ?? 0) + 0.001;
      playing = true;
    };
    $('places').append(b);
  });

  const total = () => studio.frameCount(state) / FPS;
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  const seconds = (x) => x.toFixed(1).replace('.', ',');

  function syncUI() {
    const mosaic = state.format === 'mosaic';
    for (const [id, v] of [['fmtMosaic', 'mosaic'], ['fmtSlides', 'slides'], ['fmtPlan', 'plan']]) $(id).setAttribute('aria-pressed', String(state.view === v));
    $('fmtPlan').disabled = !state.promptPlan;
    $('fmtPlan').title = state.promptPlan ? '' : 'Interprétez d’abord un prompt';
    $('modeOriginal').setAttribute('aria-pressed', String(state.mode !== '3d'));
    $('mode3d').setAttribute('aria-pressed', String(state.mode === '3d'));
    $('cameraRow').hidden = !mosaic;
    $('durationRow').hidden = state.view !== 'slides';
    $('relief').value = mosaic ? state.relief : state.plan.relief;
    $('relief').disabled = state.mode !== '3d';
    $('camera').value = state.camera;
    $('camera').disabled = state.mode !== '3d';
    $('hint3d').textContent = !mosaic
      ? 'Chaque image est filmée en 3D (vignettes agrandies ×4 par IA). Glissez sur l’aperçu pour tourner la caméra.'
      : state.camera === 'souris'
        ? 'Survolez la planche : toutes les vignettes suivent la souris.'
        : 'Chaque vignette a sa propre caméra. Les légendes restent fixes, en pixels d’origine.';
    const { w, h } = studio.sizeFor(state);
    stage.style.setProperty('--ar', `${w} / ${h}`);
    stage.style.setProperty('--arn', String(w / h));
    stage.classList.toggle('grab', !mosaic && state.mode === '3d');
    $('scrub').max = studio.frameCount(state) - 1;
    const label = state.view === 'mosaic' ? 'Mosaïque' : state.view === 'slides' ? 'Diaporama' : 'Montage';
    $('badge').textContent = `${label} · ${state.mode === '3d' ? 'relief 3D' : 'original'}`;
    $('tag').textContent = `WebGL · ${mosaic ? '1672×942' : `${state.plan.format} · ${w}×${h}`}`;
  }

  function setView(view) {
    state.view = view;
    state.user = { yaw: 0, pitch: 0, zoom: 1 };
    t = 0;
    playing = true;
    if (view === 'mosaic') state.format = 'mosaic';
    else if (view === 'slides') { state.format = 'plan'; state.plan = autoPlan(state.slideDuration); }
    else if (state.promptPlan) applyPlan(state.promptPlan);
    syncUI();
  }

  $('fmtMosaic').onclick = () => setView('mosaic');
  $('fmtSlides').onclick = () => setView('slides');
  $('fmtPlan').onclick = () => setView('plan');
  $('modeOriginal').onclick = () => { state.mode = 'original'; syncUI(); };
  $('mode3d').onclick = () => { state.mode = '3d'; syncUI(); };
  $('camera').onchange = (e) => { state.camera = e.target.value; syncUI(); };
  $('duration').value = String(state.slideDuration);
  $('duration').onchange = (e) => { state.slideDuration = +e.target.value; setView('slides'); };
  $('relief').oninput = (e) => {
    if (state.format === 'mosaic') state.relief = +e.target.value;
    else state.plan.relief = +e.target.value;
  };
  $('play').onclick = () => { playing = !playing; if (playing && state.format === 'plan' && t >= total() - 1 / FPS) t = 0; };
  $('scrub').oninput = (e) => { playing = false; t = +e.target.value / FPS; };
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, button, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
  });

  // ---- souris : cible du pointeur (mosaïque) ou rotation de la caméra (montage)
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
    if (state.format !== 'plan' || state.mode !== '3d') return;
    drag = { x: e.clientX, y: e.clientY, yaw: state.user.yaw, pitch: state.user.pitch };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('grabbing');
  });
  const endDrag = () => { drag = null; stage.classList.remove('grabbing'); };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('dblclick', () => { state.user = { yaw: 0, pitch: 0, zoom: 1 }; });

  // ---- import d'images (bouton ou glisser-déposer)
  async function importFiles(files) {
    const images = [...files].filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type));
    if (!images.length) { setPromptStatus('Formats acceptés : PNG, JPEG, WebP.', 'err'); return; }
    for (const f of images) {
      try {
        studio.addUpload(await loadImage(URL.createObjectURL(f)), f.name);
      } catch {
        setPromptStatus(`Image illisible : ${f.name}`, 'err');
      }
    }
    const n = studio.uploads.length;
    $('uploadInfo').textContent = `${n} image${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''} : ${studio.uploads.map((u) => u.name).join(', ')}`;
    setPromptStatus('Utilisez-les avec « mes images » dans le prompt, ou choisissez-les dans un plan.', 'ok');
    if (state.promptPlan) renderEditor();
  }
  $('upload').onchange = (e) => importFiles(e.target.files);
  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drop'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drop'));
  stage.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('drop'); importFiles(e.dataTransfer.files); });

  // ---- interprétation du prompt (interprète intégré, ou Claude sur claude.ai)
  const sampleReady = window.claude?.use ? window.claude.use('sample').catch(() => null) : Promise.resolve(null);
  sampleReady.then((sample) => { if (sample) $('interpretClaude').hidden = false; });
  let claudeCtl = null;

  const showUnderstood = (lines) => $('understood').replaceChildren(...lines.map((u) => Object.assign(document.createElement('li'), { textContent: u })));

  async function runInterpretation(withClaude) {
    const prompt = $('prompt').value.trim();
    if (!prompt) { setPromptStatus('Écrivez d’abord un prompt, ou cliquez sur un exemple.', 'err'); $('prompt').focus(); return; }
    let result;
    if (withClaude) {
      const sample = await sampleReady;
      claudeCtl = new AbortController();
      $('stopClaude').hidden = false;
      $('interpretClaude').disabled = true;
      setPromptStatus('Claude lit le prompt…', 'thinking');
      try {
        result = await interpretWithClaude(sample, prompt, catalog(), { signal: claudeCtl.signal });
      } catch (err) {
        const code = err?.code;
        if (code === 'cancelled') setPromptStatus('Interprétation arrêtée.');
        else if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) {
          $('interpretClaude').hidden = true;
          setPromptStatus('Claude n’est pas disponible ici. L’interprète intégré reste disponible.', 'err');
        } else if (code === 'rate_limited') setPromptStatus('Trop de demandes à Claude pour l’instant. Réessayez dans un moment.', 'err');
        else if (code === 'invalid_json') setPromptStatus('La réponse de Claude n’était pas un plan lisible. Réessayez ou reformulez.', 'err');
        else setPromptStatus(`Claude n’a pas pu répondre (${code || 'erreur'}). Essayez « Interpréter ».`, 'err');
        return;
      } finally {
        $('stopClaude').hidden = true;
        $('interpretClaude').disabled = false;
      }
    } else {
      result = interpretLocal(prompt, catalog());
    }
    state.promptPlan = result.plan;
    showUnderstood(result.understood);
    setPromptStatus(result.plan.output === 'image'
      ? 'Plan prêt. Vérifiez-le, puis « Générer l’image ».'
      : 'Plan prêt : l’aperçu joue le montage. Ajustez-le, puis « Générer la vidéo ».', 'ok');
    renderEditor();
    setView('plan');
  }
  $('interpret').onclick = () => runInterpretation(false);
  $('interpretClaude').onclick = () => runInterpretation(true);
  $('stopClaude').onclick = () => claudeCtl?.abort();
  $('prompt').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runInterpretation(false); });

  // ---- éditeur du plan (HTML)
  const planSummary = (plan) => (plan.format === 'mosaique'
    ? 'Mosaïque : boucle de 8 s'
    : `${plan.shots.length} plan${plan.shots.length > 1 ? 's' : ''} · ${seconds(studio.segments(plan).total)} s`);

  function renderEditor() {
    const plan = state.promptPlan;
    $('planEditor').hidden = !plan;
    if (!plan) return;
    $('planFormat').value = plan.format;
    $('planTransition').value = plan.transition;
    $('planTitle').value = plan.title?.text || '';
    $('planEnd').value = plan.end?.text || '';
    const mosaic = plan.format === 'mosaique';
    for (const id of ['planTransition', 'planTitle', 'planEnd', 'addShot']) $(id).hidden = mosaic;
    const cat = catalog();
    const imageSelect = (selected) => {
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Image du plan');
      for (const [label, items] of [['Quartiers', cat.tiles], ['Mes images', cat.uploads]]) {
        if (!items.length) continue;
        const g = document.createElement('optgroup');
        g.label = label;
        for (const it of items) g.append(new Option(it.title, it.id, false, it.id === selected));
        sel.append(g);
      }
      return sel;
    };
    const btn = (label, title, fn) => Object.assign(document.createElement('button'), { textContent: label, title, onclick: fn });
    const list = $('shots');
    list.replaceChildren();
    if (!mosaic) plan.shots.forEach((shot, k) => {
      const li = document.createElement('li');
      const img = imageSelect(shot.image);
      img.onchange = () => { shot.image = img.value; refresh(); };
      const move = document.createElement('select');
      move.setAttribute('aria-label', 'Mouvement de caméra');
      for (const [key, m] of Object.entries(MOVES)) move.append(new Option(m.label, key, false, key === shot.move));
      move.onchange = () => { shot.move = move.value; refresh(); };
      const tools = document.createElement('div');
      tools.className = 'tools';
      const dur = Object.assign(document.createElement('input'), { type: 'number', min: 0.8, max: 12, step: 0.1, value: +shot.duration.toFixed(1), title: 'Durée (s)' });
      dur.style.width = '72px';
      dur.setAttribute('aria-label', 'Durée en secondes');
      dur.onchange = () => { shot.duration = Math.min(12, Math.max(0.8, +dur.value || 3)); refresh(); };
      const txt = Object.assign(document.createElement('input'), { type: 'text', value: shot.text, placeholder: 'Texte (facultatif)' });
      txt.setAttribute('aria-label', 'Texte affiché');
      txt.onchange = () => { shot.text = txt.value.slice(0, 80); refresh(); };
      tools.append(dur, txt,
        btn('↑', 'Monter', () => { if (k > 0) { [plan.shots[k - 1], plan.shots[k]] = [plan.shots[k], plan.shots[k - 1]]; refresh(true); } }),
        btn('↓', 'Descendre', () => { if (k < plan.shots.length - 1) { [plan.shots[k + 1], plan.shots[k]] = [plan.shots[k], plan.shots[k + 1]]; refresh(true); } }),
        btn('✕', 'Supprimer', () => { if (plan.shots.length > 1) { plan.shots.splice(k, 1); refresh(true); } }));
      li.append(img, move, tools);
      list.append(li);
    });
    $('planTotal').textContent = planSummary(plan);
    $('runVideo').classList.toggle('primary', plan.output === 'video');
    $('runImage').classList.toggle('primary', plan.output === 'image');
  }

  function refresh(rebuild = false) {
    state.promptPlan = normalizePlan(state.promptPlan, catalog());
    showUnderstood(describePlan(state.promptPlan, catalog()));
    if (state.view === 'plan') applyPlan(state.promptPlan);
    if (rebuild) renderEditor();
    else $('planTotal').textContent = planSummary(state.promptPlan);
    syncUI();
  }
  $('planFormat').onchange = (e) => { state.promptPlan.format = e.target.value; refresh(true); };
  $('planTransition').onchange = (e) => { state.promptPlan.transition = e.target.value; refresh(); };
  $('planTitle').onchange = (e) => { state.promptPlan.title = e.target.value.trim() ? { text: e.target.value.trim(), duration: 2.5 } : null; refresh(); };
  $('planEnd').onchange = (e) => { state.promptPlan.end = e.target.value.trim() ? { text: e.target.value.trim(), duration: 2.5 } : null; refresh(); };
  $('addShot').onclick = () => {
    const shots = state.promptPlan.shots;
    const used = new Set(shots.map((s) => s.image));
    const next = catalog().tiles.find((x) => !used.has(x.id)) || catalog().tiles[0];
    shots.push({ image: next.id, move: Object.keys(MOVES)[shots.length % 6], duration: shots.at(-1)?.duration || 3, text: '' });
    refresh(true);
  };
  $('runVideo').onclick = () => { setView('plan'); exportVideo(); };
  $('runImage').onclick = () => { setView('plan'); exportImage(); };

  // ---- boucle de rendu
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) playing = false;

  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!busy) {
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
      let currentTile = -1, currentShot = -1;
      if (state.format === 'plan') {
        const seg = studio.layersAt(state, frame / FPS).at(-1)?.seg;
        if (seg?.image?.startsWith('tile:')) currentTile = +seg.image.slice(5);
        if (seg?.kind === 'shot' && state.view === 'plan') currentShot = seg.index;
      }
      $('places').querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-current', String(i === currentTile)));
      $('shots').querySelectorAll('li').forEach((li, i) => li.classList.toggle('current', i === currentShot));
    }
    requestAnimationFrame(loop);
  }
  syncUI();
  requestAnimationFrame(loop);

  // ---- exports
  const lockUI = (on) => {
    for (const el of ['export', 'exportImage', 'runVideo', 'runImage', 'play', 'scrub', 'fmtMosaic', 'fmtSlides', 'fmtPlan', 'modeOriginal', 'mode3d', 'interpret']) $(el).disabled = on;
    if (!on) syncUI();
  };
  const fileName = (s, ext) => {
    const base = state.view === 'plan' ? 'montage' : s.format === 'mosaic' ? 'mosaique' : 'diaporama';
    return `abidjan-${base}-${s.mode === '3d' ? '3d' : 'original'}.${ext}`;
  };

  async function exportVideo() {
    if (busy) return;
    busy = true;
    lockUI(true);
    const progress = $('progress');
    progress.hidden = false;
    progress.value = 0;
    const s = { ...state, user: { ...state.user }, autoPointer: true };
    try {
      setStatus('Préparation de l’encodeur…');
      const MB = await import('../vendor/mediabunny.min.mjs');
      studio.resize(s);
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
      lastFile = { blob, name: fileName(s, 'mp4') };
      setStatus(`Vidéo prête : ${(blob.size / 1e6).toFixed(1)} Mo (${codec.toUpperCase()}, ${w}×${h}, ${seconds(n / FPS)} s).`, 'ok');
      $('save').hidden = false;
      await offerFile(lastFile.blob, lastFile.name);
    } catch (err) {
      console.error(err);
      setStatus(`Échec de l’export : ${err.message}`, 'err');
    } finally {
      busy = false;
      progress.hidden = true;
      lockUI(false);
      last = performance.now();
    }
  }

  async function exportImage() {
    if (busy) return;
    busy = true;
    lockUI(true);
    try {
      const s = { ...state, user: { ...state.user }, autoPointer: true };
      const frame = studio.stillFrame(s);
      await studio.prepare(s, frame);
      studio.render(s, frame);
      const { w, h } = studio.size;
      const blob = await new Promise((res) => studio.renderer.domElement.toBlob(res, 'image/png'));
      lastFile = { blob, name: fileName(s, 'png') };
      setStatus(`Image prête : ${w}×${h}, ${(blob.size / 1e6).toFixed(1)} Mo.`, 'ok');
      $('save').hidden = false;
      t = frame / FPS;
      playing = false;
      await offerFile(lastFile.blob, lastFile.name);
    } catch (err) {
      console.error(err);
      setStatus(`Échec de l’image : ${err.message}`, 'err');
    } finally {
      busy = false;
      lockUI(false);
      last = performance.now();
    }
  }

  $('export').onclick = exportVideo;
  $('exportImage').onclick = exportImage;
  $('save').onclick = () => lastFile && offerFile(lastFile.blob, lastFile.name);

  window.__player = { state, studio, get t() { return t; }, runInterpretation, importFiles };
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
      if (err?.code === 'declined') setStatus('Enregistrement annulé. Le bouton « Enregistrer le fichier » le propose à nouveau.');
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

function setPromptStatus(text, kind = '') {
  const el = $('promptStatus');
  el.textContent = text;
  el.className = `status ${kind}`;
}
