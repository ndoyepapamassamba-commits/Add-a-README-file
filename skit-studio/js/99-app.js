/* =====================================================================
   Skit Studio — 99-app.js
   Application : état, interface (Tailwind), préparation (voix, images,
   mixage), aperçu temps réel, export, lot et ZIP. Expose window.SkitApp
   pour les tests automatisés.
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio;
  const { Core, Script, Timeline, Audio, Voices, Assets, Animator, ImageGen, Painter, Encoder, Zip, Batch, AI } = NS;

  const $ = (id) => document.getElementById(id);
  const App = { state: null };
  root.SkitApp = App;

  /* ------------------------------ État ------------------------------ */
  const S = App.state = {
    project: Script.sampleProject(),
    settings: loadSettings(),
    timeline: { segments: [], total: 0 },
    measured: {}, envelopes: {}, visemes: {}, assetKeys: {}, imageUrls: {},
    audioMix: null, music: null, laugh: null,
    playing: false, t: 0, lastTick: 0, audioStartedAt: -1,
    variants: [], results: [], queue: null, abort: null, caps: null, dirty: { voices: true, images: true, mix: true }
  };

  function loadSettings() {
    try { return Object.assign({ llm: { provider: 'pollinations' }, pollinations: {}, openrouter: {}, image: {}, tts: {}, elevenlabs: {}, emojiStyle: 'fluent' }, JSON.parse(localStorage.getItem('skitstudio.settings') || '{}')); } catch (e) { return { llm: { provider: 'pollinations' }, pollinations: {}, openrouter: {}, image: {}, tts: {}, elevenlabs: {}, emojiStyle: 'fluent' }; }
  }
  function saveSettings() { try { localStorage.setItem('skitstudio.settings', JSON.stringify(S.settings)); } catch (e) {} }
  function saveProjectLocal() { try { localStorage.setItem('skitstudio.project', JSON.stringify(S.project)); } catch (e) {} }

  /* ------------------------------ Toasts ------------------------------ */
  function toast(msg, kind) { const d = document.createElement('div'); d.className = kind || ''; d.textContent = msg; $('toast').appendChild(d); setTimeout(() => d.remove(), kind === 'err' ? 9000 : 4500); if (kind === 'err') console.warn(msg); }
  App.toast = toast;

  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }

  /* ------------------------------ Timeline ------------------------------ */
  function rebuildTimeline() {
    S.project = Script.normalizeProject(S.project);
    S.timeline = Timeline.build(S.project, S.measured);
    // visèmes par réplique
    S.timeline.segments.forEach(seg => { if (seg.type === 'line') { const k = Timeline.lineKey(seg.sketch, seg.line); if (!S.visemes[k] || S.visemes[k].text !== seg.text) S.visemes[k] = { text: seg.text, vis: Animator.visemes(seg.text) }; } });
    S.t = Math.min(S.t, Math.max(0, S.timeline.total - 0.01));
    renderSegList(); updateTimeLabel();
  }
  App.rebuildTimeline = rebuildTimeline;

  function invalidate(what) { what.forEach(w => { S.dirty[w] = true; }); if (what.includes('mix')) { S.audioMix = null; } }

  /* ------------------------------ Ressources de rendu ------------------------------ */
  const res = {
    assetFor: (seg) => { const k = S.assetKeys[Timeline.lineKey(seg.sketch, seg.line)]; return k ? Animator.get(k) : null; },
    imageFor: (seg) => { const k = Timeline.lineKey(seg.sketch, seg.line); const u = S.imageUrls[k]; return u ? Assets.imageSync(u) : null; },
    envFor: (seg) => S.envelopes[Timeline.lineKey(seg.sketch, seg.line)] || null,
    visFor: (seg) => { const v = S.visemes[Timeline.lineKey(seg.sketch, seg.line)]; return v ? v.vis : Animator.visemes(seg.text); }
  };
  App.res = res;

  /* ------------------------------ Préparation ------------------------------ */
  function setProg(id, ratio) { $(id).style.width = Math.round(Core.clamp(ratio, 0, 1) * 100) + '%'; }

  App.prepareVoices = async function (project, onProgress, signal) {
    const r = await Voices.prepareProject(project, S.settings, onProgress, signal);
    Object.assign(S.measured, r.measured);
    Object.keys(r.measured).forEach(k => { const m = r.measured[k]; S.envelopes[k] = m.buffer ? Audio.lineEnvelope(m.buffer, project.fps) : null; });
    if (r.errors.length) toast(`Voix : ${r.errors.length} réplique(s) en repli (voix bip). ${r.errors[0].error}`, 'err');
    S.dirty.voices = false; S.dirty.mix = true;
    return r;
  };

  /** Prépare les images d'un projet : banque → génération → moteur d'animation. */
  App.prepareImages = async function (project, onProgress, signal) {
    Animator.options.parallax = project.visual.parallax !== false;
    Animator.options.depthAI = !!project.visual.depthAI;
    Animator.options.strength = project.visual.strength == null ? 1 : project.visual.strength;
    const plan = ImageGen.plan(project);
    const unique = plan.filter(p => !p.dup);
    let done = 0; const errors = [];
    // images explicites (importées) d'abord
    const explicit = [];
    project.sketches.forEach((sk, si) => sk.lines.forEach((ln, li) => { const key = ln.image || (ln.shot === 'close' ? sk.imageClose : sk.imageWide); if (key) explicit.push({ key, si, li, shot: ln.shot }); }));
    for (const e of explicit) {
      try { const entry = await ImageGen.bankGet(e.key); if (!entry) throw new Error('image importée absente de la banque : ' + e.key); await attachImage(e, entry, project); } catch (err) { errors.push(err.message); }
    }
    for (const item of unique) {
      if (signal && signal.aborted) throw new Error('Annulé');
      const eta = (project.visual.provider === 'pollinations' || (project.visual.provider === 'openrouter' && !(S.settings.openrouter || {}).apiKey)) ? ` · attente ≈ ${Math.ceil(ImageGen.nextAnonDelay() / 1000)} s` : '';
      if (onProgress) onProgress(done / Math.max(1, unique.length), `Image ${done + 1}/${unique.length} (${item.shot})${eta}`);
      try {
        const entry = await ImageGen.getOrGenerate(item, project, S.settings, signal);
        await attachImage(item, entry, project);
        plan.filter(p => p.key === item.key).forEach(p => { S.assetKeys[Timeline.lineKey(p.si, p.li)] = item.key; S.imageUrls[Timeline.lineKey(p.si, p.li)] = entry.url; });
      } catch (err) { if (/Annulé/.test(err.message)) throw err; errors.push(err.message); console.warn(err); }
      done++;
      if (onProgress) onProgress(done / Math.max(1, unique.length), `Image ${done}/${unique.length}`);
      renderImagePlan();
    }
    S.dirty.images = false;
    if (ImageGen.lastFallback) { toast(ImageGen.lastFallback); ImageGen.lastFallback = null; }
    return { plan, errors };
  };

  async function attachImage(item, entry, project) {
    const img = await Assets.loadImage(entry.url, 15000);
    if (!img) throw new Error('image illisible');
    S.imageUrls[Timeline.lineKey(item.si, item.li)] = entry.url;
    await Animator.prepare(item.key, img, { expectFaces: item.shot === 'wide' ? 2 : 1, blob: entry.blob });
    S.assetKeys[Timeline.lineKey(item.si, item.li)] = item.key;
  }

  App.prepareAll = async function (opts) {
    opts = opts || {};
    const project = S.project;
    S.abort = new AbortController();
    const prog = (ratio, msg) => { setProg('prepProg', ratio); $('prepStatus').textContent = msg || ''; };
    try {
      prog(0.02, 'Polices et emojis…');
      Assets.emojiStyle = S.settings.emojiStyle || 'fluent';
      await Assets.preloadProject(project);
      const tasks = [];
      if (S.dirty.voices || opts.force) tasks.push(App.prepareVoices(project, (r, m) => prog(0.05 + r * 0.45, m), S.abort.signal));
      if ((S.dirty.images || opts.force) && project.visual.provider !== 'none') tasks.push(App.prepareImages(project, (r, m) => { $('imgStatus').textContent = m; setProg('imgProg', r); }, S.abort.signal));
      else if (project.visual.provider === 'none') tasks.push(App.prepareImages(project, () => {}, S.abort.signal));
      await Promise.all(tasks);
      rebuildTimeline();
      prog(0.85, 'Mixage audio…');
      S.audioMix = await Audio.mix(project, S.timeline, { music: S.music, laugh: S.laugh });
      S.dirty.mix = false;
      prog(1, `Prêt · ${Core.fmtTime(S.timeline.total)} · ${S.timeline.segments.length} segments`);
      toast('Préparation terminée', 'ok');
    } catch (e) { prog(0, 'Erreur : ' + e.message); toast('Préparation : ' + e.message, 'err'); throw e; }
    finally { S.abort = null; }
  };

  /* ------------------------------ Aperçu ------------------------------ */
  const pv = $('preview'); const pctx = pv.getContext('2d', { alpha: false });
  function paintPreview() {
    const W = pv.width, H = pv.height;
    try { Painter.paint(pctx, W, H, S.project, S.timeline, S.t, res); } catch (e) { console.error(e); }
  }
  function loop(now) {
    if (S.playing) {
      const dt = Math.min(0.1, (now - S.lastTick) / 1000); S.lastTick = now;
      if (S.audioMix && $('chkAudio').checked && S.audioStartedAt >= 0) S.t = Audio.ctx().currentTime - S.audioStartedAt; else S.t += dt;
      if (S.t >= S.timeline.total) { S.t = 0; stop(); }
      $('scrub').value = Math.round(S.t / Math.max(0.01, S.timeline.total) * 1000);
      updateTimeLabel(); highlightSeg();
    }
    paintPreview();
    requestAnimationFrame(loop);
  }
  function play() {
    if (!S.timeline.total) return;
    S.playing = true; S.lastTick = performance.now(); $('btnPlay').textContent = '⏸️';
    if (S.audioMix && $('chkAudio').checked) { Audio.play(S.audioMix, S.t); S.audioStartedAt = Audio.ctx().currentTime - S.t; } else S.audioStartedAt = -1;
  }
  function stop() { S.playing = false; Audio.stop(); S.audioStartedAt = -1; $('btnPlay').textContent = '▶️'; }
  App.play = play; App.stop = stop; App.seek = (t) => { S.t = Core.clamp(t, 0, Math.max(0, S.timeline.total - 0.001)); if (S.playing) { stop(); play(); } updateTimeLabel(); highlightSeg(); };
  function updateTimeLabel() { $('timeLabel').textContent = `${Core.fmtTime(S.t)} / ${Core.fmtTime(S.timeline.total)}`; }

  function renderSegList() {
    const el = $('segList'); el.innerHTML = '';
    S.timeline.segments.forEach(seg => {
      const d = document.createElement('div'); d.className = 'seg px-2 py-1 rounded flex gap-2 items-center'; d.dataset.start = seg.start;
      const icon = { line: seg.punch ? '💥' : '💬', title: '🏷️', reaction: '😱', outro: '🎉' }[seg.type];
      const label = seg.type === 'line' ? `${seg.speaker}: ${Core.stripMarks(seg.text)}` : seg.type === 'title' ? `${seg.num}/${seg.count} ${seg.title}` : seg.type === 'reaction' ? 'Réaction ' + seg.emoji : 'Outro';
      d.innerHTML = `<span>${icon}</span><span class="mono text-slate-500">${Core.fmtTime(seg.start)}</span><span class="truncate flex-1">${escapeHtml(label)}</span><span class="text-slate-500">${seg.dur.toFixed(1)}s</span>`;
      d.addEventListener('click', () => App.seek(seg.start + 0.001));
      el.appendChild(d);
    });
  }
  function highlightSeg() { const seg = Timeline.at(S.timeline.segments, S.t); document.querySelectorAll('#segList .seg').forEach(d => d.classList.toggle('active', seg && Math.abs(+d.dataset.start - seg.start) < 1e-6)); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ------------------------------ Export ------------------------------ */
  App.renderProject = async function (project, prepared, onProgress, signal, opts) {
    opts = opts || {};
    const W = project.width, H = project.height, fps = project.fps;
    const timeline = prepared.timeline;
    const localRes = prepared.res;
    return Encoder.render({ W, H, fps, total: timeline.total, paint: (ctx, t) => Painter.paint(ctx, W, H, project, timeline, t, localRes), audioBuffer: prepared.audioMix, onProgress, signal, engine: opts.engine || $('engineSel').value, prefer: opts.prefer || $('codecSel').value });
  };

  App.exportCurrent = async function () {
    if (S.dirty.voices || S.dirty.images || S.dirty.mix || !S.audioMix) await App.prepareAll();
    stop();
    $('btnExport').disabled = true; $('btnCancelExport').disabled = false; $('exportResult').innerHTML = '';
    S.abort = new AbortController();
    const t0 = performance.now();
    try {
      const out = await App.renderProject(S.project, { timeline: S.timeline, res, audioMix: S.audioMix }, (r, m) => { setProg('exportProg', r); $('exportStatus').textContent = m; }, S.abort.signal);
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      const name = Core.slugify(S.project.title) + '.' + out.ext;
      S.results.push({ name, blob: out.blob });
      $('exportStatus').textContent = `Terminé en ${secs} s · ${out.engine} · ${out.codec} / ${out.audioCodec} · ${(out.blob.size / 1048576).toFixed(1)} Mo`;
      const url = URL.createObjectURL(out.blob);
      $('exportResult').innerHTML = `<div class="flex gap-3 items-center mt-2"><video src="${url}" controls class="w-40 rounded-lg bg-black"></video><a class="btn" download="${name}" href="${url}">⬇️ Télécharger ${name}</a></div>`;
      setProg('exportProg', 1); $('btnZip').disabled = false; toast('Export terminé', 'ok');
      return out;
    } catch (e) { $('exportStatus').textContent = 'Erreur : ' + e.message; toast('Export : ' + e.message, 'err'); throw e; }
    finally { $('btnExport').disabled = false; $('btnCancelExport').disabled = true; S.abort = null; }
  };

  /* ------------------------------ Lot ------------------------------ */
  function chipsValues(id) { return Array.from(document.querySelectorAll(`#${id} .chip.on`)).map(c => c.dataset.v); }

  App.makeVariants = async function () {
    const src = $('bankSource').value; const size = +$('bankSize').value || 20;
    let bank = S.project.sketches;
    if (src === 'generator') bank = Script.generateSketches(size, { seed: +$('batchSeed').value || 1 });
    else if (src === 'ai') { $('batchStatus').textContent = 'Écriture des sketches par IA…'; bank = await AI.generateSketches(S.settings, { count: Math.min(20, size), theme: $('aiTheme').value, nameA: S.project.characters[0].name, nameB: (S.project.characters[1] || S.project.characters[0]).name }); }
    if (!bank.length) { toast('Banque de sketches vide', 'err'); return []; }
    S.variants = Batch.makeVariants(S.project, bank, { count: +$('batchCount').value || 1, perVideo: +$('batchPer').value || 5, seed: +$('batchSeed').value || 1, themes: chipsValues('batchThemes'), emojiSets: chipsValues('batchEmoji') });
    renderVariantList(); $('btnRunBatch').disabled = !S.variants.length;
    $('batchStatus').textContent = `${S.variants.length} variante(s) prête(s) — ${bank.length} sketches en banque`;
    return S.variants;
  };

  function renderVariantList() {
    const el = $('variantList'); el.innerHTML = '';
    S.variants.forEach((p, i) => {
      const d = document.createElement('div'); d.className = 'card !p-2 flex gap-2 items-center'; d.id = 'var_' + i;
      d.innerHTML = `<span class="badge">${p.theme.id}</span><span class="flex-1 truncate">${escapeHtml(p.title)} — ${p.sketches.map(s => escapeHtml(s.title)).join(' · ')}</span><span class="status text-xs text-slate-400">en attente</span><span class="links"></span>`;
      el.appendChild(d);
    });
  }

  App.runBatch = async function () {
    if (!S.variants.length) await App.makeVariants();
    stop();
    const q = S.queue = new Batch.Queue();
    S.variants.forEach((p, i) => q.add({ name: Core.slugify(p.title) || ('video-' + (i + 1)), project: p, index: i }));
    $('btnRunBatch').disabled = true; $('btnCancelBatch').disabled = false;
    const total = q.jobs.length; let finished = 0;
    q.on('progress', (job, r, m) => { setProg('batchProg', (finished + r) / total); $('batchStatus').textContent = `Vidéo ${job.index + 1}/${total} · ${m}`; const st = document.querySelector(`#var_${job.index} .status`); if (st) st.textContent = m; });
    q.on('done', (job, out) => { finished++; const d = document.querySelector(`#var_${job.index}`); if (d) { d.querySelector('.status').textContent = `✅ ${(out.blob.size / 1048576).toFixed(1)} Mo`; const url = URL.createObjectURL(out.blob); d.querySelector('.links').innerHTML = `<a class="btn small" download="${job.name}.${out.ext}" href="${url}">⬇️</a>`; } S.results.push({ name: job.name + '.' + out.ext, blob: out.blob }); $('btnZip').disabled = false; });
    q.on('error', (job, e) => { finished++; const st = document.querySelector(`#var_${job.index} .status`); if (st) st.textContent = '❌ ' + e.message; });
    q.on('finish', () => { $('btnRunBatch').disabled = false; $('btnCancelBatch').disabled = true; $('batchStatus').textContent = `Lot terminé : ${S.results.length} fichier(s) disponibles`; toast('Lot terminé', 'ok'); });
    await q.run(async (job, progress, signal) => {
      const p = job.project;
      // caches partagés : voix (par texte), images (banque), moteur (par clé)
      const saveKeys = S.assetKeys, saveUrls = S.imageUrls, saveMeasured = S.measured, saveEnv = S.envelopes;
      S.assetKeys = {}; S.imageUrls = {}; S.measured = {}; S.envelopes = {};
      try {
        progress(0.02, 'voix…');
        const v = await Voices.prepareProject(p, S.settings, (r, m) => progress(0.02 + r * 0.2, m), signal);
        const envelopes = {}; Object.keys(v.measured).forEach(k => { envelopes[k] = v.measured[k].buffer ? Audio.lineEnvelope(v.measured[k].buffer, p.fps) : null; });
        progress(0.25, 'images…');
        await App.prepareImages(p, (r, m) => progress(0.25 + r * 0.35, m), signal);
        const timeline = Timeline.build(p, v.measured);
        const visemes = {}; timeline.segments.forEach(seg => { if (seg.type === 'line') visemes[Timeline.lineKey(seg.sketch, seg.line)] = Animator.visemes(seg.text); });
        await Assets.preloadProject(p);
        progress(0.62, 'mixage…');
        const audioMix = await Audio.mix(p, timeline, { music: S.music, laugh: S.laugh });
        const keys = S.assetKeys, urls = S.imageUrls;
        const localRes = { assetFor: (seg) => { const k = keys[Timeline.lineKey(seg.sketch, seg.line)]; return k ? Animator.get(k) : null; }, imageFor: (seg) => { const u = urls[Timeline.lineKey(seg.sketch, seg.line)]; return u ? Assets.imageSync(u) : null; }, envFor: (seg) => envelopes[Timeline.lineKey(seg.sketch, seg.line)] || null, visFor: (seg) => visemes[Timeline.lineKey(seg.sketch, seg.line)] };
        return await App.renderProject(p, { timeline, res: localRes, audioMix }, (r, m) => progress(0.65 + r * 0.35, m), signal);
      } finally { S.assetKeys = saveKeys; S.imageUrls = saveUrls; S.measured = saveMeasured; S.envelopes = saveEnv; }
    });
  };

  App.downloadZip = function () {
    if (!S.results.length) return;
    const entries = S.results.map(r => ({ name: r.name, data: null, blob: r.blob }));
    Promise.all(entries.map(async e => { e.data = new Uint8Array(await e.blob.arrayBuffer()); })).then(() => {
      const bytes = Zip.build(entries.map(e => ({ name: e.name, data: e.data })));
      download(new Blob([bytes], { type: 'application/zip' }), Core.slugify(S.project.title) + '-lot.zip');
    });
  };

  /* ------------------------------ UI : scripts ------------------------------ */
  function renderSketchList() {
    const el = $('sketchList'); el.innerHTML = '';
    const P = S.project;
    $('scriptStats').textContent = `${P.sketches.length} sketch(es) · ${P.sketches.reduce((a, s) => a + s.lines.length, 0)} répliques · ≈ ${Core.fmtTime(S.timeline.total)}`;
    P.sketches.forEach((sk, si) => {
      const d = document.createElement('div'); d.className = 'card space-y-2';
      d.innerHTML = `<div class="flex gap-2 items-center flex-wrap">
        <span class="badge">${si + 1}</span>
        <input class="inp !w-56 font-bold" data-si="${si}" data-f="title" value="${escapeHtml(sk.title)}">
        <input class="inp !w-16 text-center" data-si="${si}" data-f="emoji" value="${escapeHtml(sk.emoji)}">
        <select class="inp !w-32" data-si="${si}" data-f="scene">${Script.SCENES.map(s => `<option ${s === sk.scene ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <span class="ml-auto flex gap-1">
          <button class="btn ghost small" data-act="up" data-si="${si}">↑</button><button class="btn ghost small" data-act="down" data-si="${si}">↓</button>
          <button class="btn ghost small" data-act="addline" data-si="${si}">+ réplique</button>
          <button class="btn danger small" data-act="del" data-si="${si}">✕</button></span></div>
        <div class="space-y-1">${sk.lines.map((ln, li) => `<div class="line-row">
          <select class="inp" data-si="${si}" data-li="${li}" data-f="speaker">${P.characters.map(c => `<option value="${c.id}" ${c.id === ln.speaker ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select>
          <input class="inp" data-si="${si}" data-li="${li}" data-f="text" value="${escapeHtml(ln.text)}">
          <input class="inp text-center" data-si="${si}" data-li="${li}" data-f="emoji" value="${escapeHtml(ln.emoji)}">
          <select class="inp" data-si="${si}" data-li="${li}" data-f="shot"><option value="wide" ${ln.shot === 'wide' ? 'selected' : ''}>large</option><option value="close" ${ln.shot === 'close' ? 'selected' : ''}>gros plan</option></select>
          <select class="inp" data-si="${si}" data-li="${li}" data-f="emotion">${Script.EMOTIONS.map(e => `<option ${e === ln.emotion ? 'selected' : ''}>${e}</option>`).join('')}</select>
          <button class="text-slate-500 hover:text-red-400" data-act="delline" data-si="${si}" data-li="${li}">✕</button></div>`).join('')}</div>`;
      el.appendChild(d);
    });
  }
  $('sketchList').addEventListener('input', (e) => {
    const t = e.target; if (!t.dataset.f) return;
    const sk = S.project.sketches[+t.dataset.si]; if (!sk) return;
    if (t.dataset.li != null) { const ln = sk.lines[+t.dataset.li]; ln[t.dataset.f] = t.value; const k = Timeline.lineKey(+t.dataset.si, +t.dataset.li); if (t.dataset.f === 'text' || t.dataset.f === 'speaker') { delete S.measured[k]; delete S.envelopes[k]; invalidate(['voices', 'mix']); } if (t.dataset.f !== 'emoji') invalidate(['images']); }
    else { sk[t.dataset.f] = t.value; if (t.dataset.f === 'scene') invalidate(['images']); }
    rebuildTimeline(); saveProjectLocal();
  });
  $('sketchList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const si = +b.dataset.si, P = S.project; const act = b.dataset.act;
    if (act === 'del') P.sketches.splice(si, 1);
    else if (act === 'up' && si > 0) [P.sketches[si - 1], P.sketches[si]] = [P.sketches[si], P.sketches[si - 1]];
    else if (act === 'down' && si < P.sketches.length - 1) [P.sketches[si + 1], P.sketches[si]] = [P.sketches[si], P.sketches[si + 1]];
    else if (act === 'addline') P.sketches[si].lines.push({ speaker: P.sketches[si].lines.length % 2 ? 'B' : 'A', text: 'Nouvelle réplique', emoji: '😂', shot: 'close', emotion: 'smug' });
    else if (act === 'delline') P.sketches[si].lines.splice(+b.dataset.li, 1);
    S.measured = {}; S.envelopes = {}; S.assetKeys = {}; S.imageUrls = {}; invalidate(['voices', 'images', 'mix']);
    rebuildTimeline(); renderSketchList(); renderImagePlan(); saveProjectLocal();
  });

  App.addSketches = function (sketches, replace) {
    if (replace) S.project.sketches = [];
    S.project.sketches = S.project.sketches.concat(sketches);
    S.measured = {}; S.envelopes = {}; S.assetKeys = {}; S.imageUrls = {}; invalidate(['voices', 'images', 'mix']);
    rebuildTimeline(); renderSketchList(); renderImagePlan(); saveProjectLocal();
  };
  App.loadProject = function (obj) {
    S.project = Script.normalizeProject(obj);
    S.measured = {}; S.envelopes = {}; S.assetKeys = {}; S.imageUrls = {}; S.audioMix = null; invalidate(['voices', 'images', 'mix']);
    rebuildTimeline(); bindProjectToUI(); renderSketchList(); renderCharList(); renderImagePlan(); saveProjectLocal();
  };

  /* ------------------------------ UI : personnages ------------------------------ */
  function voiceOptions(c) {
    const p = c.voice.provider;
    if (p === 'piper') return Voices.PIPER_VOICES.map(v => `<option value="${v.id}" ${v.id === c.voice.voiceId ? 'selected' : ''}>${v.label}</option>`).join('');
    if (p === 'pollinations') { const m = Voices.POLLINATIONS_TTS.find(x => x.model === (S.settings.pollinations.ttsModel || 'openai/tts-1')) || Voices.POLLINATIONS_TTS[0]; return m.voices.map(v => `<option ${v === c.voice.voiceId ? 'selected' : ''}>${v}</option>`).join(''); }
    if (p === 'openai') return Voices.OPENAI_VOICES.map(v => `<option ${v === c.voice.voiceId ? 'selected' : ''}>${v}</option>`).join('');
    if (p === 'webspeech') return Voices.webSpeechVoices('fr').map(v => `<option value="${escapeHtml(v.name)}" ${v.name === c.voice.voiceId ? 'selected' : ''}>${escapeHtml(v.name)} (${v.lang})</option>`).join('') || '<option value="">(aucune voix)</option>';
    return `<option value="${escapeHtml(c.voice.voiceId || '')}">${escapeHtml(c.voice.voiceId || '—')}</option>`;
  }
  function renderCharList() {
    const el = $('charList'); el.innerHTML = '';
    S.project.characters.forEach((c, ci) => {
      const d = document.createElement('div'); d.className = 'card space-y-2';
      d.innerHTML = `<div class="flex gap-2 items-center"><span class="badge">${c.id}</span><input class="inp !w-40 font-bold" data-ci="${ci}" data-f="name" value="${escapeHtml(c.name)}"><input type="color" data-ci="${ci}" data-f="color" value="${c.color}"><button class="btn danger small ml-auto" data-act="delchar" data-ci="${ci}">✕</button></div>
        <div><label class="field">Apparence (pour les prompts d'images)</label><textarea class="inp !font-sans h-16" data-ci="${ci}" data-f="look">${escapeHtml(c.look)}</textarea></div>
        <div class="grid grid-cols-2 gap-2">
          <div><label class="field">Fournisseur de voix</label><select class="inp" data-ci="${ci}" data-f="voice.provider">${Voices.PROVIDERS.map(p => `<option value="${p.id}" ${p.id === c.voice.provider ? 'selected' : ''}>${p.label}</option>`).join('')}</select></div>
          <div><label class="field">Voix</label>${['elevenlabs', 'file', 'blip'].includes(c.voice.provider) ? `<input class="inp" data-ci="${ci}" data-f="voice.voiceId" value="${escapeHtml(c.voice.voiceId || '')}" placeholder="${c.voice.provider === 'elevenlabs' ? 'ID de voix ElevenLabs' : '—'}">` : `<select class="inp" data-ci="${ci}" data-f="voice.voiceId">${voiceOptions(c)}</select>`}</div>
          <div><label class="field">Vitesse <span>${c.voice.rate}</span></label><input type="range" min="0.6" max="1.6" step="0.05" data-ci="${ci}" data-f="voice.rate" value="${c.voice.rate}"></div>
          <div><label class="field">Hauteur <span>${c.voice.pitch}</span></label><input type="range" min="0.6" max="1.6" step="0.05" data-ci="${ci}" data-f="voice.pitch" value="${c.voice.pitch}"></div>
        </div>
        <div class="flex gap-2"><button class="btn ghost small" data-act="testvoice" data-ci="${ci}">🔊 Tester la voix</button><span class="text-xs text-slate-500 self-center" id="vstat_${ci}"></span></div>`;
      el.appendChild(d);
    });
  }
  $('charList').addEventListener('input', (e) => {
    const t = e.target; if (!t.dataset.f) return; const c = S.project.characters[+t.dataset.ci]; if (!c) return;
    const path = t.dataset.f.split('.'); let v = t.type === 'range' ? +t.value : t.value;
    if (path.length === 2) c[path[0]][path[1]] = v; else c[path[0]] = v;
    if (t.dataset.f.startsWith('voice')) { S.measured = {}; S.envelopes = {}; invalidate(['voices', 'mix']); if (t.dataset.f === 'voice.provider') { c.voice.voiceId = c.voice.provider === 'piper' ? (c.avatar.style === 'f' ? 'fr_FR-siwis-medium' : 'fr_FR-tom-medium') : c.voice.provider === 'pollinations' ? 'nova' : c.voice.provider === 'openai' ? 'alloy' : ''; renderCharList(); } }
    if (t.dataset.f === 'look') { S.assetKeys = {}; invalidate(['images']); renderImagePlan(); }
    if (t.dataset.f === 'name') { renderSketchList(); }
    const lab = t.previousElementSibling && t.previousElementSibling.querySelector('span'); if (lab && t.type === 'range') lab.textContent = t.value;
    saveProjectLocal();
  });
  $('charList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return; const ci = +b.dataset.ci; const c = S.project.characters[ci];
    if (b.dataset.act === 'delchar') { if (S.project.characters.length <= 1) return; S.project.characters.splice(ci, 1); S.project = Script.normalizeProject(S.project); renderCharList(); renderSketchList(); }
    if (b.dataset.act === 'testvoice') {
      const st = $('vstat_' + ci); st.textContent = 'synthèse…';
      try { const sample = (S.project.sketches[0] && S.project.sketches[0].lines.find(l => l.speaker === c.id)) || { text: 'Bonjour, je suis ' + c.name + ' et je teste ma voix !' };
        if (c.voice.provider === 'webspeech') { Voices.speakPreview(sample.text, c.voice, 'fr-FR'); st.textContent = 'lecture (aperçu navigateur)'; return; }
        const buf = await Voices.synthLine(sample, c, S.settings); if (buf) { Audio.play(buf, 0); st.textContent = buf.duration.toFixed(2) + ' s'; } }
      catch (err) { st.textContent = 'erreur : ' + err.message; toast(err.message, 'err'); }
    }
  });
  $('btnAddChar').addEventListener('click', () => { const n = S.project.characters.length; S.project.characters.push({ id: String.fromCharCode(65 + n), name: 'Perso ' + (n + 1), color: '#f472b6', look: 'personnage', voice: { provider: 'piper', voiceId: 'fr_FR-gilles-low', rate: 1, pitch: 1 }, avatar: { style: 'm' } }); S.project = Script.normalizeProject(S.project); renderCharList(); renderSketchList(); });

  /* ------------------------------ UI : images ------------------------------ */
  function renderImagePlan() {
    const el = $('imagePlan'); el.innerHTML = '';
    const plan = ImageGen.plan(S.project).filter(p => !p.dup);
    plan.forEach(item => {
      const d = document.createElement('div'); d.className = 'card !p-2 space-y-1 text-xs';
      const url = S.imageUrls[Timeline.lineKey(item.si, item.li)];
      const asset = S.assetKeys[Timeline.lineKey(item.si, item.li)] ? Animator.get(S.assetKeys[Timeline.lineKey(item.si, item.li)]) : null;
      d.innerHTML = `${url ? `<img class="thumb" src="${url}">` : '<div class="thumb grid place-items-center text-slate-600">en attente</div>'}
        <div class="flex gap-1 items-center"><span class="badge">${item.si + 1}.${item.li + 1} ${item.shot === 'wide' ? 'large' : 'gros plan'}</span>${asset ? `<span class="badge ok">${asset.faces.length} visage(s) · ${asset.faces[0].source === 'mediapipe' ? 'MediaPipe' : 'gabarit'}</span>` : ''}</div>
        <details><summary class="text-slate-400">prompt</summary><div class="text-slate-500 break-words">${escapeHtml(item.prompt)}</div></details>
        <div class="flex gap-1"><label class="btn ghost small cursor-pointer">📤 Importer<input type="file" accept="image/*" class="hidden" data-si="${item.si}" data-li="${item.li}" data-act="imgimport"></label><button class="btn ghost small" data-act="imgregen" data-key="${item.key}" data-si="${item.si}" data-li="${item.li}">🔁</button></div>`;
      el.appendChild(d);
    });
    ImageGen.bankList().then(list => { $('bankInfo').textContent = `${list.length} image(s) · ${(list.reduce((a, b) => a + b.size, 0) / 1048576).toFixed(1)} Mo`; });
  }
  $('imagePlan').addEventListener('change', async (e) => {
    const t = e.target; if (t.dataset.act !== 'imgimport' || !t.files[0]) return;
    const { key } = await ImageGen.importFile(t.files[0]);
    const ln = S.project.sketches[+t.dataset.si].lines[+t.dataset.li]; ln.image = key;
    invalidate(['images']); renderImagePlan(); toast('Image importée (sera utilisée pour cette réplique)', 'ok'); saveProjectLocal();
  });
  $('imagePlan').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act="imgregen"]'); if (!b) return;
    await ImageGen.bankDelete(b.dataset.key); const k = Timeline.lineKey(+b.dataset.si, +b.dataset.li); delete S.assetKeys[k]; delete S.imageUrls[k];
    S.project.visual.seed = (S.project.visual.seed || 1) + 1; $('visSeed').value = S.project.visual.seed; invalidate(['images']); renderImagePlan(); toast('Image retirée ; relancez la génération (nouvelle graine)');
  });
  $('btnPrepareImages').addEventListener('click', async () => {
    S.abort = new AbortController(); $('btnCancelImages').disabled = false;
    try { const r = await App.prepareImages(S.project, (ratio, m) => { setProg('imgProg', ratio); $('imgStatus').textContent = m; }, S.abort.signal); $('imgStatus').textContent = r.errors.length ? `Terminé avec ${r.errors.length} erreur(s) : ${r.errors[0]}` : 'Toutes les images sont prêtes'; if (r.errors.length) toast(r.errors[0], 'err'); }
    catch (e) { $('imgStatus').textContent = e.message; } finally { $('btnCancelImages').disabled = true; S.abort = null; renderImagePlan(); }
  });
  $('btnCancelImages').addEventListener('click', () => { if (S.abort) S.abort.abort(); });
  $('btnBankClear').addEventListener('click', async () => { if (!confirm('Vider la banque d\'images ?')) return; await ImageGen.bankClear(); Animator.clear(); S.assetKeys = {}; S.imageUrls = {}; invalidate(['images']); renderImagePlan(); });

  /* ------------------------------ UI : studio & liaisons ------------------------------ */
  function bind(id, get, set, ev) {
    const el = $(id); if (!el) return;
    el.addEventListener(ev || 'input', () => { set(el.type === 'checkbox' ? el.checked : el.type === 'range' || el.type === 'number' ? +el.value : el.value); const lab = $(id + 'Val'); if (lab) lab.textContent = el.value; saveProjectLocal(); });
    App._binders.push(() => { const v = get(); if (el.type === 'checkbox') el.checked = !!v; else el.value = v; const lab = $(id + 'Val'); if (lab) lab.textContent = el.value; });
  }
  App._binders = [];
  function bindProjectToUI() { App._binders.forEach(f => f()); }
  function setupBindings() {
    const P = () => S.project;
    bind('prjTitle', () => P().title, v => { P().title = v; });
    bind('themeSel', () => P().theme.id, v => { const t = Script.THEMES.find(x => x.id === v); if (t) Object.assign(P().theme, t); bindProjectToUI(); }, 'change');
    bind('bgColor', () => P().theme.bg, v => { P().theme.bg = v; P().theme.id = 'perso'; });
    bind('bg2Color', () => P().theme.bg2, v => { P().theme.bg2 = v; P().theme.id = 'perso'; });
    bind('accentColor', () => P().theme.accent, v => { P().theme.accent = v; P().theme.id = 'perso'; });
    bind('watermark', () => P().layout.watermark, v => { P().layout.watermark = v; });
    bind('resSel', () => P().width + 'x' + P().height, v => { const [w, h] = v.split('x').map(Number); P().width = w; P().height = h; }, 'change');
    bind('fpsSel', () => P().fps, v => { P().fps = +v; invalidate(['voices', 'mix']); S.envelopes = {}; }, 'change');
    bind('subMode', () => P().subtitles.mode, v => { P().subtitles.mode = v; }, 'change');
    bind('subSize', () => P().subtitles.size, v => { P().subtitles.size = v; });
    bind('subPos', () => P().subtitles.position, v => { P().subtitles.position = v; });
    bind('subHl', () => P().subtitles.highlight, v => { P().subtitles.highlight = v; }, 'change');
    bind('subUpper', () => P().subtitles.uppercase, v => { P().subtitles.uppercase = v; }, 'change');
    bind('subSpeaker', () => P().subtitles.speakerColors, v => { P().subtitles.speakerColors = v; }, 'change');
    bind('subEmoji', () => P().subtitles.emojiBadge, v => { P().subtitles.emojiBadge = v; }, 'change');
    bind('hookFirst', () => P().layout.hookFirst, v => { P().layout.hookFirst = v; rebuildTimeline(); invalidate(['mix']); }, 'change');
    bind('titleCards', () => P().layout.titleCards, v => { P().layout.titleCards = v; rebuildTimeline(); invalidate(['mix']); }, 'change');
    bind('reactionCards', () => P().layout.reactionCards, v => { P().layout.reactionCards = v; rebuildTimeline(); invalidate(['mix']); }, 'change');
    bind('titlePrefix', () => P().layout.titlePrefix, v => { P().layout.titlePrefix = v; });
    bind('outroEnabled', () => P().layout.outro.enabled, v => { P().layout.outro.enabled = v; rebuildTimeline(); invalidate(['mix']); }, 'change');
    bind('outroL1', () => P().layout.outro.line1, v => { P().layout.outro.line1 = v; rebuildTimeline(); });
    bind('outroL2', () => P().layout.outro.line2, v => { P().layout.outro.line2 = v; rebuildTimeline(); });
    bind('outroEmoji', () => P().layout.outro.emoji, v => { P().layout.outro.emoji = v; rebuildTimeline(); Assets.preloadEmojis([v]); });
    [['tReaction', 'reaction'], ['tTitle', 'title'], ['tMinLine', 'minLine'], ['tCloseMin', 'closeMin'], ['tPad', 'pad'], ['tOutro', 'outro']].forEach(([id, k]) => bind(id, () => P().timing[k], v => { P().timing[k] = v; rebuildTimeline(); invalidate(['mix']); }));
    bind('musicVol', () => P().audio.music.volume, v => { P().audio.music.volume = v; invalidate(['mix']); });
    bind('musicDuck', () => P().audio.music.duck, v => { P().audio.music.duck = v; invalidate(['mix']); });
    bind('sfxOn', () => P().audio.sfx.enabled, v => { P().audio.sfx.enabled = v; invalidate(['mix']); }, 'change');
    bind('laughOn', () => P().audio.laughOnPunchline, v => { P().audio.laughOnPunchline = v; invalidate(['mix']); }, 'change');
    bind('visStyle', () => P().visual.style, v => { P().visual.style = v; S.assetKeys = {}; S.imageUrls = {}; invalidate(['images']); renderImagePlan(); }, 'change');
    bind('visProvider', () => P().visual.provider, v => { P().visual.provider = v; S.assetKeys = {}; S.imageUrls = {}; invalidate(['images']); renderImagePlan(); }, 'change');
    bind('visSeed', () => P().visual.seed, v => { P().visual.seed = v; S.assetKeys = {}; S.imageUrls = {}; invalidate(['images']); renderImagePlan(); });
    bind('visExtra', () => P().visual.extra, v => { P().visual.extra = v; S.assetKeys = {}; S.imageUrls = {}; invalidate(['images']); renderImagePlan(); });
    bind('visCrop', () => P().visual.cropWatermark, v => { P().visual.cropWatermark = v; }, 'change');
    bind('visParallax', () => P().visual.parallax, v => { P().visual.parallax = v; Animator.options.parallax = v; }, 'change');
    bind('visDepthAI', () => P().visual.depthAI, v => { P().visual.depthAI = v; Animator.options.depthAI = v; Animator.clear(); invalidate(['images']); }, 'change');
    bind('visStrength', () => P().visual.strength, v => { P().visual.strength = v; Animator.options.strength = v; });
    bind('visFallback', () => P().visual.fallbackSketch, v => { P().visual.fallbackSketch = v; }, 'change');
    // réglages
    const SS = () => S.settings;
    const sb = (id, get, set) => { const el = $(id); el.addEventListener('input', () => { set(el.value); saveSettings(); }); el.value = get() || el.value; };
    sb('polKey', () => SS().pollinations.apiKey, v => { SS().pollinations.apiKey = v.trim(); });
    sb('orKey', () => SS().openrouter.apiKey, v => { SS().openrouter.apiKey = v.trim(); if (!SS().llm.apiKey) { SS().llm.apiKey = v.trim(); $('llmKey').value = v.trim(); } });
    sb('orImageModel', () => SS().openrouter.imageModel, v => { SS().openrouter.imageModel = v; });
    sb('polImageModel', () => SS().pollinations.imageModel, v => { SS().pollinations.imageModel = v.trim(); });
    sb('polTtsModel', () => SS().pollinations.ttsModel, v => { SS().pollinations.ttsModel = v.trim(); renderCharList(); });
    $('llmProvider').innerHTML = AI.PROVIDERS.map(p => `<option value="${p.id}">${p.label}</option>`).join('');
    sb('llmProvider', () => SS().llm.provider, v => { SS().llm.provider = v; $('llmBadge').textContent = AI.PROVIDERS.find(p => p.id === v).label; });
    sb('llmBase', () => SS().llm.baseUrl, v => { SS().llm.baseUrl = v.trim(); });
    sb('llmKey', () => SS().llm.apiKey, v => { SS().llm.apiKey = v.trim(); });
    sb('llmModel', () => SS().llm.model, v => { SS().llm.model = v.trim(); });
    sb('imgBase', () => SS().image.baseUrl, v => { SS().image.baseUrl = v.trim(); });
    sb('imgKey', () => SS().image.apiKey, v => { SS().image.apiKey = v.trim(); });
    sb('imgModel', () => SS().image.model, v => { SS().image.model = v.trim(); });
    sb('imgSize', () => SS().image.size, v => { SS().image.size = v.trim(); });
    sb('ttsBase', () => SS().tts.baseUrl, v => { SS().tts.baseUrl = v.trim(); });
    sb('ttsKey', () => SS().tts.apiKey, v => { SS().tts.apiKey = v.trim(); });
    sb('ttsModel', () => SS().tts.model, v => { SS().tts.model = v.trim(); });
    sb('elKey', () => SS().elevenlabs.apiKey, v => { SS().elevenlabs.apiKey = v.trim(); });
    $('emojiStyle').value = SS().emojiStyle || 'fluent';
    $('emojiStyle').addEventListener('change', () => { SS().emojiStyle = $('emojiStyle').value; Assets.emojiStyle = SS().emojiStyle; Assets.preloadEmojis(Assets.projectEmojis(S.project)); saveSettings(); });
    $('llmBadge').textContent = AI.PROVIDERS.find(p => p.id === SS().llm.provider).label;
  }

  /* ------------------------------ Diagnostic ------------------------------ */
  async function diagnose() {
    const caps = S.caps = await Encoder.capabilities(S.project.width, S.project.height, S.project.fps);
    const badge = (ok, label, warn) => `<span class="badge ${ok ? 'ok' : warn ? 'warn' : 'no'}">${label}</span>`;
    $('caps').innerHTML = badge(caps.webcodecs && caps.muxer, caps.webcodecs && caps.muxer ? 'WebCodecs MP4' : 'WebCodecs indisponible', true) + badge(caps.mediaRecorder, 'MediaRecorder') + badge(!!root.WebGLRenderingContext, 'WebGL') + badge(!!navigator.gpu, 'WebGPU', true) + badge(navigator.onLine, navigator.onLine ? 'en ligne' : 'hors ligne', true);
    $('capsReport').textContent = [
      `Navigateur : ${navigator.userAgent}`,
      `WebCodecs : ${caps.webcodecs ? 'oui' : 'non'} · mp4-muxer : ${caps.muxer ? 'oui' : 'non (CDN bloqué ?)'}`,
      `Codecs vidéo : ${caps.video.map(c => c.label).join(', ') || 'aucun'} · audio : ${caps.audio.map(c => c.label).join(', ') || 'aucun'}`,
      `MediaRecorder : ${caps.recorderTypes.join(' | ') || 'aucun'}`,
      `WebGL : ${root.WebGLRenderingContext ? 'oui' : 'non'} · WebGPU : ${navigator.gpu ? 'oui' : 'non'} · OfflineAudioContext : ${root.OfflineAudioContext ? 'oui' : 'non'} · IndexedDB : ${root.indexedDB ? 'oui' : 'non'}`,
      `MediaPipe : ${NS.FaceRig.available() ? 'chargé (' + NS.FaceRig.delegate + ')' : 'chargé à la première image'} · Piper : ${Voices.piperReady() ? 'chargé' : 'chargé à la première voix'}`,
      `Mémoire JS : ${performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' Mo' : 'n/d'}`
    ].join('\n');
    return caps;
  }
  App.diagnose = diagnose;

  /* ------------------------------ Initialisation ------------------------------ */
  function initChips(id, items, onDefault) {
    const el = $(id); el.innerHTML = items.map(it => `<span class="chip badge ${onDefault(it) ? 'on' : ''}" data-v="${it.v}">${it.label}</span>`).join('');
    el.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) c.classList.toggle('on'); });
  }

  function init() {
    // projet local
    try { const saved = localStorage.getItem('skitstudio.project'); if (saved) S.project = Script.normalizeProject(JSON.parse(saved)); } catch (e) {}
    $('themeSel').innerHTML = Script.THEMES.map(t => `<option value="${t.id}">${t.id}</option>`).join('') + '<option value="perso">perso</option>';
    $('visStyle').innerHTML = Object.keys(ImageGen.STYLES).map(k => `<option value="${k}">${ImageGen.STYLES[k].label}</option>`).join('');
    $('visProvider').innerHTML = ImageGen.PROVIDERS.map(p => `<option value="${p.id}">${p.label}</option>`).join('');
    initChips('genCats', Script.CATEGORIES.map(c => ({ v: c, label: c })), () => true);
    initChips('batchThemes', Script.THEMES.map(t => ({ v: t.id, label: t.id })), () => true);
    initChips('batchEmoji', Object.keys(Batch.EMOJI_SETS).map(k => ({ v: k, label: k + ' ' + Batch.EMOJI_SETS[k].slice(0, 3).join('') })), (it) => it.v === 'classique');
    setupBindings();
    Assets.emojiStyle = S.settings.emojiStyle || 'fluent';
    rebuildTimeline(); bindProjectToUI(); renderSketchList(); renderCharList(); renderImagePlan();
    Assets.preloadProject(S.project);
    diagnose();
    if (root.speechSynthesis) speechSynthesis.onvoiceschanged = () => {};
    // onglets
    document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b)); document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + b.dataset.tab)); }));
    // aperçu
    $('btnPlay').addEventListener('click', () => S.playing ? stop() : play());
    $('scrub').addEventListener('input', () => App.seek(+$('scrub').value / 1000 * S.timeline.total));
    $('btnPrepare').addEventListener('click', () => App.prepareAll({ force: true }).catch(() => {}));
    // scripts
    $('btnImport').addEventListener('click', () => { try { const r = Script.importAny($('importText').value); if (r.project && r.project.characters) { App.loadProject(Object.assign({}, r.project)); } else App.addSketches(Script.normalizeProject({ sketches: r.sketches }).sketches); toast(`${r.sketches.length} sketch(es) importé(s)`, 'ok'); } catch (e) { toast('Import : ' + e.message, 'err'); } });
    $('importFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; $('importText').value = await f.text(); $('btnImport').click(); });
    $('btnSample').addEventListener('click', () => { const p = Script.sampleProject(); p.characters = S.project.characters; p.visual = S.project.visual; App.loadProject(p); toast('Exemple chargé', 'ok'); });
    $('btnClearSketches').addEventListener('click', () => App.addSketches([], true));
    $('btnGenerate').addEventListener('click', () => { const cats = chipsValues('genCats'); App.addSketches(Script.generateSketches(+$('genCount').value || 5, { seed: +$('genSeed').value || 1, categories: cats })); $('genSeed').value = (+$('genSeed').value || 1) + 1; });
    $('btnAI').addEventListener('click', async () => { $('aiStatus').textContent = 'écriture… (Pollinations gratuit : jusqu\'à 30 s)'; $('btnAI').disabled = true; try { const sk = await AI.generateSketches(S.settings, { count: +$('aiCount').value || 5, theme: $('aiTheme').value, nameA: S.project.characters[0].name, nameB: (S.project.characters[1] || S.project.characters[0]).name }); App.addSketches(sk); $('aiStatus').textContent = `${sk.length} sketch(es) ajouté(s)`; } catch (e) { $('aiStatus').textContent = e.message; toast('IA : ' + e.message, 'err'); } finally { $('btnAI').disabled = false; } });
    $('btnExportJSON').addEventListener('click', () => download(new Blob([JSON.stringify({ sketches: S.project.sketches }, null, 2)], { type: 'application/json' }), 'sketches.json'));
    $('btnExportCSV').addEventListener('click', () => download(new Blob([Script.toCSV(S.project)], { type: 'text/csv' }), 'sketches.csv'));
    $('btnExportText').addEventListener('click', () => download(new Blob([Script.toText(S.project)], { type: 'text/plain' }), 'sketches.txt'));
    $('btnSaveProject').addEventListener('click', () => download(new Blob([JSON.stringify(S.project, null, 2)], { type: 'application/json' }), Core.slugify(S.project.title) + '.skit.json'));
    $('openProject').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { App.loadProject(JSON.parse(await f.text())); toast('Projet chargé', 'ok'); } catch (err) { toast('Projet : ' + err.message, 'err'); } });
    // audio fichiers
    $('musicFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; S.music = await Audio.fromFile(f); $('musicName').textContent = f.name + ' · ' + S.music.duration.toFixed(0) + ' s'; invalidate(['mix']); });
    $('laughFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; S.laugh = await Audio.fromFile(f); invalidate(['mix']); });
    // export & lot
    $('btnExport').addEventListener('click', () => App.exportCurrent().catch(() => {}));
    $('btnCancelExport').addEventListener('click', () => { if (S.abort) S.abort.abort(); });
    $('btnMakeVariants').addEventListener('click', () => App.makeVariants().catch(e => toast(e.message, 'err')));
    $('btnRunBatch').addEventListener('click', () => App.runBatch().catch(e => toast(e.message, 'err')));
    $('btnCancelBatch').addEventListener('click', () => { if (S.queue) S.queue.cancel(); });
    $('btnZip').addEventListener('click', App.downloadZip);
    $('btnExportVariants').addEventListener('click', () => download(new Blob([JSON.stringify(S.variants, null, 2)], { type: 'application/json' }), 'variantes.json'));
    $('btnDiag').addEventListener('click', diagnose);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
    requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
