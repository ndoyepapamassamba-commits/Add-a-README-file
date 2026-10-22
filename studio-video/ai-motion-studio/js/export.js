/* MASSAMBA AI MOTION STUDIO — export final et validation (22/10/2026).
 * Deux chemins, choisis selon ce que le navigateur sait RÉELLEMENT faire (vérifié avant de promettre) :
 *   1. MP4 image par image (WebCodecs VideoEncoder + AudioEncoder, multiplexeur mp4-muxer 5.2.2, licence MIT) :
 *      H.264 + AAC quand l'encodeur existe ; sinon VP9 + Opus dans le même MP4 (dit clairement).
 *      Rendu hors temps réel : chaque vidéo source est positionnée à l'image exacte avant le dessin (pas de saccade).
 *   2. WebM en temps réel (MediaRecorder, comme Motion Studio 2) quand WebCodecs manque.
 * Le son est mixé hors ligne (OfflineAudioContext) : musique (fondus), voix off, nappe synthétisée, pistes audio
 * importées et piste audio d'origine de chaque vidéo générée (volume, découpe, vitesse, fondu croisé des transitions).
 * Puis le fichier est VALIDÉ : dimensions, durée, codec, présence audio, lecture au début / milieu / fin. */
(function () {
  'use strict';
  var ST = function () { return window.MAMS.studio; };
  var SR = 48000;

  async function codecsDisponibles(l, h, fps, debit) {
    var r = { video: null, audio: null, chemin: null };
    if (typeof VideoEncoder === 'undefined' || typeof window.Mp4Muxer === 'undefined') return r;
    var vcands = [['avc', 'avc1.640028'], ['avc', 'avc1.4d0028'], ['avc', 'avc1.42001f'], ['vp9', 'vp09.00.10.08']];
    for (var i = 0; i < vcands.length; i++) {
      try { var s = await VideoEncoder.isConfigSupported({ codec: vcands[i][1], width: l, height: h, bitrate: debit, framerate: fps }); if (s && s.supported) { r.video = { muxer: vcands[i][0], codec: vcands[i][1] }; break; } } catch (e) { /* codec refusé */ }
    }
    if (typeof AudioEncoder !== 'undefined') {
      var acands = [['aac', 'mp4a.40.2'], ['opus', 'opus']];
      for (var j = 0; j < acands.length; j++) {
        try { var a = await AudioEncoder.isConfigSupported({ codec: acands[j][1], sampleRate: SR, numberOfChannels: 2, bitrate: 160000 }); if (a && a.supported) { r.audio = { muxer: acands[j][0], codec: acands[j][1] }; break; } } catch (e) { /* codec refusé */ }
      }
    }
    if (r.video) r.chemin = 'mp4';
    return r;
  }

  var cacheDecodage = new Map();
  async function decoder(blob, ac) {
    if (!blob) return null;
    if (cacheDecodage.has(blob)) return cacheDecodage.get(blob);
    var p = blob.arrayBuffer().then(function (ab) { return ac.decodeAudioData(ab); }).catch(function () { return null; });
    cacheDecodage.set(blob, p); return p;
  }

  /** mixage complet hors ligne → AudioBuffer stéréo 48 kHz (ou null s'il n'y a aucun son). */
  async function mixer(duree) {
    var st = ST(), S = st.S, n = Math.max(1, Math.ceil(duree * SR));
    var AC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!AC) return { buffer: null, sources: [] };
    var oc = new AC(2, n, SR), sources = [];
    var mus = st.musique(); if (mus.blob) {
      var bm = await decoder(mus.blob, oc);
      if (bm) {
        var s = oc.createBufferSource(); s.buffer = bm; s.loop = true; var g = oc.createGain(); var v = S.audio.vol;
        g.gain.setValueAtTime(S.audio.fadeIn > 0 ? 0 : v, 0); if (S.audio.fadeIn > 0) g.gain.linearRampToValueAtTime(v, Math.min(duree, S.audio.fadeIn));
        if (S.audio.fadeOut > 0) { g.gain.setValueAtTime(v, Math.max(0, duree - S.audio.fadeOut)); g.gain.linearRampToValueAtTime(0, duree); }
        s.connect(g); g.connect(oc.destination); s.start(0); s.stop(duree); sources.push('musique (importée)');
      }
    }
    var vx = st.voix(); if (vx.blob) { var bv = await decoder(vx.blob, oc); if (bv) { var sv = oc.createBufferSource(); sv.buffer = bv; var gv = oc.createGain(); gv.gain.value = S.audio.volVoice; sv.connect(gv); gv.connect(oc.destination); sv.start(0); sources.push('voix off (enregistrée)'); } }
    if (S.audio.gen && S.audio.gen !== 'none') { var nn = st.nappe(oc, oc.destination, S.audio.gen, S.audio.volGen); nn.osc.forEach(function (o) { o.start(0); o.stop(duree); }); sources.push('nappe (synthétisée localement)'); }
    for (var k = 0; k < S.audioTracks.length; k++) {
      var tr = S.audioTracks[k], m = st.media(tr.mid); if (!m || !m.blob || tr.start >= duree) continue;
      var ba = await decoder(m.blob, oc); if (!ba) continue;
      var sa = oc.createBufferSource(); sa.buffer = ba; var ga = oc.createGain(); ga.gain.value = tr.vol == null ? 0.8 : tr.vol; sa.connect(ga); ga.connect(oc.destination); sa.start(tr.start); sources.push(m.name + ' (' + st.libelleOrigine(m.origine) + ')');
    }
    var starts = st.starts();
    for (var i = 0; i < S.clips.length; i++) {
      var c = S.clips[i], mv = st.media(c.mid); if (!mv || mv.type !== 'video' || !mv.aAudio || c.muet || !mv.blob) continue;
      var bx = await decoder(mv.blob, oc); if (!bx) continue;
      var d = st.clipDur(c), vit = Number(c.speed) || 1, sx = oc.createBufferSource(); sx.buffer = bx; sx.playbackRate.value = vit;
      var gx = oc.createGain(), vol = c.vol == null ? 1 : c.vol, t0 = starts[i], tin = i > 0 ? st.transDur(S.clips[i - 1], i - 1) : 0, tout = st.transDur(c, i);
      gx.gain.setValueAtTime(tin > 0 ? 0 : vol, t0); if (tin > 0) gx.gain.linearRampToValueAtTime(vol, t0 + tin);
      if (tout > 0 && S.clips[i + 1]) { gx.gain.setValueAtTime(vol, t0 + d - tout); gx.gain.linearRampToValueAtTime(0, t0 + d); }
      sx.connect(gx); gx.connect(oc.destination); sx.start(t0, c.debutSource || 0, d * vit); sources.push('son de « ' + mv.name + ' » (' + st.libelleOrigine(mv.origine) + ')');
    }
    if (!sources.length) return { buffer: null, sources: sources };
    return { buffer: await oc.startRendering(), sources: sources };
  }

  function attendre(el, ev, ms) { return new Promise(function (res) { var f = function () { el.removeEventListener(ev, f); clearTimeout(t); res(true); }; var t = setTimeout(function () { el.removeEventListener(ev, f); res(false); }, ms); el.addEventListener(ev, f); }); }

  /** positionne chaque vidéo active sur l'image exacte de l'instant t (rendu hors temps réel). */
  async function caler(t) {
    var st = ST(), S = st.S; if (!S.clips.length) return;
    var a = st.actifs(t), liste = [a.i]; if (a.enTrans) liste.push(a.i + 1);
    for (var k = 0; k < liste.length; k++) {
      var c = S.clips[liste[k]], m = st.media(c.mid); if (!m || m.type !== 'video') continue;
      var cible = st.tempsSource(liste[k], t, a.st); if (Math.abs(m.el.currentTime - cible) < 0.001) continue;
      m.el.currentTime = cible; await attendre(m.el, 'seeked', 3000);
    }
  }

  async function exporterMp4(cfg, progres, signal) {
    var st = ST(), S = st.S, cv = st.canvas(), d = st.total(), fps = S.fps, n = Math.max(1, Math.round(d * fps));
    var l = cv.width, h = cv.height;
    var mix = await mixer(d); progres(0.02, 'Son mixé (' + (mix.sources.join(', ') || 'aucun son') + ')');
    var muxer = new window.Mp4Muxer.Muxer({ target: new window.Mp4Muxer.ArrayBufferTarget(), fastStart: 'in-memory', firstTimestampBehavior: 'offset',
      video: { codec: cfg.video.muxer, width: l, height: h, frameRate: fps },
      audio: mix.buffer && cfg.audio ? { codec: cfg.audio.muxer, numberOfChannels: 2, sampleRate: SR } : undefined });
    var erreur = null;
    var ve = new VideoEncoder({ output: function (ch, meta) { muxer.addVideoChunk(ch, meta); }, error: function (e) { erreur = e; } });
    ve.configure({ codec: cfg.video.codec, width: l, height: h, bitrate: S.bitrate, framerate: fps, latencyMode: 'quality' });
    S.media.forEach(function (m) { if (m.type === 'video' && m.el) { m.el.pause(); } });
    for (var i = 0; i < n; i++) {
      if (signal && signal.aborted) throw new Error('Export annulé.');
      if (erreur) throw erreur;
      var t = i / fps; await caler(t); st.render(t, true);
      var fr = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      ve.encode(fr, { keyFrame: i % (fps * 2) === 0 }); fr.close();
      if (ve.encodeQueueSize > 8) await new Promise(function (r) { ve.addEventListener('dequeue', r, { once: true }); });
      if (i % 5 === 0) progres(0.04 + 0.86 * i / n, 'Image ' + i + ' / ' + n);
    }
    await ve.flush(); ve.close(); if (erreur) throw erreur;
    if (mix.buffer && cfg.audio) {
      progres(0.92, 'Encodage du son (' + cfg.audio.codec + ')');
      var ae = new AudioEncoder({ output: function (ch, meta) { muxer.addAudioChunk(ch, meta); }, error: function (e) { erreur = e; } });
      ae.configure({ codec: cfg.audio.codec, sampleRate: SR, numberOfChannels: 2, bitrate: 160000 });
      var b = mix.buffer, L = b.getChannelData(0), R = b.getChannelData(1), bloc = 1024;
      for (var p = 0; p < b.length; p += bloc) {
        var k = Math.min(bloc, b.length - p), plan = new Float32Array(k * 2); plan.set(L.subarray(p, p + k), 0); plan.set(R.subarray(p, p + k), k);
        var ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: k, numberOfChannels: 2, timestamp: Math.round(p * 1e6 / SR), data: plan });
        ae.encode(ad); ad.close();
      }
      await ae.flush(); ae.close(); if (erreur) throw erreur;
    }
    muxer.finalize();
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', codecs: cfg.video.codec + (mix.buffer && cfg.audio ? ' + ' + cfg.audio.codec : ' (sans son)'), sources: mix.sources, aSon: !!(mix.buffer && cfg.audio) };
  }

  async function exporterWebm(progres, signal) {
    var st = ST(), S = st.S, cv = st.canvas(), d = st.total();
    if (!cv.captureStream || !window.MediaRecorder) throw new Error('Ni WebCodecs ni MediaRecorder dans ce navigateur : export impossible ici. Utilisez Chrome ou Edge récents.');
    var mix = await mixer(d);
    var mimes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'], mime = mimes.filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0] || '';
    var flux = cv.captureStream(S.fps), ac = null, src = null;
    if (mix.buffer) { ac = new (window.AudioContext || window.webkitAudioContext)(); var dest = ac.createMediaStreamDestination(); src = ac.createBufferSource(); src.buffer = mix.buffer; src.connect(dest); flux.addTrack(dest.stream.getAudioTracks()[0]); }
    var r = new MediaRecorder(flux, mime ? { mimeType: mime, videoBitsPerSecond: S.bitrate } : { videoBitsPerSecond: S.bitrate }), morceaux = [];
    r.ondataavailable = function (e) { if (e.data.size) morceaux.push(e.data); };
    var fin = new Promise(function (res) { r.onstop = res; });
    S.media.forEach(function (m) { if (m.type === 'video' && m.el) { m.el.muted = true; } });   // le son vient du mixage, pas des éléments
    r.start(200); if (src) src.start(); var t0 = performance.now();
    await new Promise(function (res) {
      (function pas() {
        var t = Math.min(d, (performance.now() - t0) / 1000); st.syncVideos(t, true); st.render(t, true); progres(t / d, 'Enregistrement en temps réel');
        if (t >= d || (signal && signal.aborted)) res(); else requestAnimationFrame(pas);
      })();
    });
    r.stop(); await fin; if (ac) ac.close(); st.syncVideos(0, false);
    S.media.forEach(function (m) { if (m.type === 'video' && m.el) { m.el.muted = false; } });
    if (signal && signal.aborted) throw new Error('Export annulé.');
    return { blob: new Blob(morceaux, { type: 'video/webm' }), ext: 'webm', codecs: mime || 'video/webm', sources: mix.sources, aSon: !!mix.buffer };
  }

  /** contrôle du fichier produit : dimensions, durée, codec, son, lecture au début / milieu / fin. */
  async function valider(blob, attendu) {
    var det = [], ok = true;
    function verifie(cond, txt) { det.push((cond ? '✔ ' : '✘ ') + txt); if (!cond) ok = false; }
    verifie(blob && blob.size > 1000, 'fichier non vide (' + (blob ? (blob.size / 1048576).toFixed(2) : 0) + ' Mo)');
    var v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = URL.createObjectURL(blob);
    var lu = await attendre(v, 'loadedmetadata', 8000);
    verifie(lu, 'le navigateur ouvre le fichier');
    if (lu) {
      if (!isFinite(v.duration)) { v.currentTime = 1e6; await attendre(v, 'timeupdate', 4000); }
      var duree = v.duration, tol = Math.max(0.25, 2 / (attendu.fps || 30));
      verifie(isFinite(duree) && Math.abs(duree - attendu.duree) <= tol, 'durée ' + (isFinite(duree) ? duree.toFixed(2) : '?') + ' s (attendue ' + attendu.duree.toFixed(2) + ' s)');
      verifie(v.videoWidth === attendu.largeur && v.videoHeight === attendu.hauteur, 'dimensions ' + v.videoWidth + '×' + v.videoHeight + ' (attendues ' + attendu.largeur + '×' + attendu.hauteur + ')');
      var points = [0, duree / 2, Math.max(0, duree - 0.1)], lisibles = 0;
      for (var i = 0; i < points.length; i++) { v.currentTime = points[i]; if (await attendre(v, 'seeked', 4000)) lisibles++; }
      verifie(lisibles === 3, 'lecture au début, au milieu et à la fin (' + lisibles + '/3)');
    }
    URL.revokeObjectURL(v.src);
    var octets = new Uint8Array(await blob.slice(0, Math.min(blob.size, 4 * 1024 * 1024)).arrayBuffer()), texte = '';
    for (var k = 0; k < octets.length; k++) texte += String.fromCharCode(octets[k]);
    if (attendu.ext === 'mp4') {
      var codec = /avc1/.test(texte) ? 'H.264 (avc1)' : /vp09/.test(texte) ? 'VP9 (vp09)' : 'inconnu';
      var acod = /mp4a/.test(texte) ? 'AAC (mp4a)' : /Opus/.test(texte) ? 'Opus' : 'aucun';
      verifie(codec !== 'inconnu', 'codec vidéo ' + codec);
      verifie(attendu.aSon ? acod !== 'aucun' : true, 'codec audio ' + acod + (attendu.aSon ? '' : ' (aucun son dans le montage)'));
    } else verifie(/webm/i.test(blob.type), 'conteneur WebM');
    if (attendu.aSon) {
      var AC = window.OfflineAudioContext || window.webkitOfflineAudioContext, son = false;
      try { var b = await new AC(1, 44100, 44100).decodeAudioData(await blob.arrayBuffer()); var dd = b.getChannelData(0), mx = 0; for (var j = 0; j < dd.length; j += 32) mx = Math.max(mx, Math.abs(dd[j])); son = mx > 1e-4; } catch (e) { son = false; }
      verifie(son, 'piste audio présente et non silencieuse');
    }
    return { ok: ok, details: det, resume: det.join(' · ') };
  }

  /** export complet : choix du chemin, rendu, validation, ajout aux résultats. */
  async function exporter(o) {
    o = o || {}; var st = ST(), S = st.S;
    if (!S.clips.length) throw new Error('Ajoutez au moins un plan au montage.');
    if (S.exporting) throw new Error('Un export est déjà en cours.');
    var progres = o.progres || function () {}, cv = st.canvas();
    var cfg = o.forcerWebm ? { chemin: null } : await codecsDisponibles(cv.width, cv.height, S.fps, S.bitrate);
    st.playing(false); S.exporting = true; var tSauve = S.time;
    try {
      var r = cfg.chemin === 'mp4' ? await exporterMp4(cfg, progres, o.signal) : await exporterWebm(progres, o.signal);
      progres(0.97, 'Validation du fichier');
      var rapport = await valider(r.blob, { duree: st.total(), largeur: cv.width, hauteur: cv.height, fps: S.fps, ext: r.ext, aSon: r.aSon });
      rapport.codecs = r.codecs; rapport.sources = r.sources;
      var nom = (o.nom || 'massamba-ai-motion') + '-' + Date.now() + '.' + r.ext;
      st.addResult(nom, r.blob, 'VIDÉO ' + r.ext.toUpperCase(), rapport);
      progres(1, rapport.ok ? 'Export validé' : 'Export à vérifier');
      return { nom: nom, blob: r.blob, rapport: rapport, chemin: cfg.chemin === 'mp4' ? 'MP4 image par image (' + r.codecs + ')' : 'WebM temps réel (' + r.codecs + ')' };
    } finally { S.exporting = false; S.time = tSauve; st.renderAll(); }
  }

  window.MAMS = window.MAMS || {};
  window.MAMS.exporteur = { exporter: exporter, valider: valider, mixer: mixer, codecsDisponibles: codecsDisponibles };
})();
