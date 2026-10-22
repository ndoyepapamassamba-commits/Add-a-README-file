/* MASSAMBA AI MOTION STUDIO — moteur de montage (22/10/2026).
 * Reprise du moteur de MASSAMBA Motion Studio 2 (scène Canvas, mouvements de caméra, keyframes, transitions, textes
 * animés, étalonnage, grain, poussière, vignette, letterbox, nappe synthétisée, voix off, PNG, planche contact,
 * annuler/rétablir), avec ces changements documentés dans docs/AUDIT.md :
 *   - les clips peuvent être de VRAIES vidéos : lues depuis leur source (<video>), synchronisées au temps du montage,
 *     avec découpe (début dans la source), vitesse (playbackRate), volume et piste audio d'origine ;
 *   - timeline : déplacer (glisser), découper au curseur, dupliquer, supprimer, poignées de durée ; textes déplaçables ;
 *   - piste de sous-titres (import .srt/.vtt, export .srt, incrustation) ;
 *   - défauts corrigés : vitesse sans effet, animation « Cinétique » vide, forme d'onde aléatoire, musique et voix absentes
 *     de l'export, projet sauvé en vignettes 112 px, voix off jamais jouée en lecture, médias supprimés irréparables.
 * Toutes les fonctions se trouvent sous window.MAMS.studio. */
(function () {
  'use strict';
  var STUB = { addEventListener: function () {}, classList: { add: function () {}, remove: function () {}, toggle: function () {} }, style: {}, value: '', textContent: '', innerHTML: '', max: 0, disabled: false, getAttribute: function () { return null; }, querySelector: function () { return null; }, prepend: function () {}, focus: function () {} };
  var $ = function (s) { return document.querySelector(s) || STUB; };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var uid = function () { return Math.random().toString(36).slice(2, 9); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t % 1) * 100); return m + ':' + String(s).padStart(2, '0') + '.' + String(d).padStart(2, '0'); }
  function dl(b, n) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = n; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }

  var PRESETS = { auto: { l: 'Auto' }, fixe: { l: 'Fixe (aucun mouvement)', f: function () { return { s: 1 }; } },
    zoomIn: { l: 'Zoom avant', f: function (p, k) { return { s: 1 + 0.3 * k * p, ty: -0.02 * k * p }; } }, zoomOut: { l: 'Zoom arrière', f: function (p, k) { return { s: 1 + 0.3 * k * (1 - p) }; } },
    panRight: { l: 'Panoramique →', f: function (p, k) { return { s: 1.26, tx: (0.5 - p) * 0.52 * k }; } }, panLeft: { l: 'Panoramique ←', f: function (p, k) { return { s: 1.26, tx: (p - 0.5) * 0.52 * k }; } },
    tiltUp: { l: 'Travelling ↑', f: function (p, k) { return { s: 1.26, ty: (0.5 - p) * 0.4 * k }; } }, tiltDown: { l: 'Travelling ↓', f: function (p, k) { return { s: 1.26, ty: (p - 0.5) * 0.4 * k }; } },
    kenburns: { l: 'Ken Burns', f: function (p, k) { return { s: 1.06 + 0.34 * k * p, tx: (p - 0.5) * 0.18 * k, ty: (0.5 - p) * 0.14 * k }; } },
    orbit: { l: 'Orbite', r: 1, f: function (p, k) { var a = p * 6.283; return { s: 1.28, tx: Math.sin(a) * 0.11 * k, ty: Math.cos(a) * 0.07 * k - 0.07 * k, rot: Math.sin(a) * 0.03 * k }; } },
    drift: { l: 'Dérive calme', f: function (p, k) { return { s: 1.14 + 0.06 * k * p, tx: (0.5 - p) * 0.12 * k, ty: (p - 0.5) * 0.05 * k }; } },
    pulse: { l: 'Pulsation', r: 1, f: function (p, k) { return { s: 1.12 + 0.05 * k * Math.sin(p * 12.57) }; } },
    handheld: { l: 'Caméra épaule', r: 1, f: function (p, k) { return { s: 1.18, tx: Math.sin(p * 3.1) * 0.014 * k, ty: Math.cos(p * 2.3) * 0.014 * k, rot: Math.sin(p * 1.7) * 0.007 * k }; } },
    vertigo: { l: 'Vertige', f: function (p, k) { return { s: 1.06 + 0.4 * k * p, rot: 0.06 * k * p }; } },
    diagonal: { l: 'Diagonale', f: function (p, k) { return { s: 1.28, tx: (0.5 - p) * 0.3 * k, ty: (0.5 - p) * 0.22 * k }; } } };
  var TRANS = { none: { l: 'Coupe franche' }, fade: { l: 'Fondu enchaîné' }, dipBlack: { l: 'Fondu au noir' }, dipWhite: { l: 'Fondu au blanc' }, wipeL: { l: 'Volet ←' }, wipeR: { l: 'Volet →' }, slide: { l: 'Glissement' }, iris: { l: 'Iris' }, zoomBlur: { l: 'Zoom flou' }, whip: { l: 'Whip pan' } };
  var EASE = { linear: function (p) { return p; }, easeInOut: function (p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }, easeOut: function (p) { return 1 - Math.pow(1 - p, 3); }, easeIn: function (p) { return p * p * p; }, smooth: function (p) { return p * p * (3 - 2 * p); } };
  var GRADES = { none: '', cinema: 'contrast(1.1) saturate(1.06) brightness(.97)', chaud: 'sepia(.22) saturate(1.18) contrast(1.05) hue-rotate(-6deg)', froid: 'saturate(1.04) hue-rotate(14deg) brightness(1.03) contrast(1.06)', noir: 'grayscale(1) contrast(1.18)', vif: 'saturate(1.4) contrast(1.12)', delave: 'saturate(.78) contrast(.9) brightness(1.08)', nuit: 'brightness(.86) saturate(1.1) hue-rotate(18deg) contrast(1.12)' };
  var ASPECTS = { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [1080, 1080], '4:3': [1080, 810], '21:9': [1344, 576] };

  var S = { media: [], clips: [], texts: [], subs: [], audioTracks: [], sel: null, selText: null, selKf: -1, time: 0, playing: false, loop: true, zoom: 60,
    guides: { safe: 0, thirds: 0, center: 0 }, aspect: '16:9', quality: 1, fps: 30, bitrate: 12000000, grade: 'cinema', fit: 'cover', vignette: 0.35, grain: 0.08, dust: 0.4, bloom: 0, shake: 0, letter: 0,
    audio: { url: null, name: null, vol: 0.6, fadeIn: 0.5, fadeOut: 0.8, voiceUrl: null, volVoice: 0.9, gen: 'none', volGen: 0.18 }, subStyle: { size: 0.042, show: true }, exporting: false };
  var cv, ctx, bufA, bufB, gA, gB;
  var noise = null, vig = null, dust = [], hist = [], hi = -1, audioEl = null, voiceEl = null, genNodes = null, actx = null, streamDest = null, rec = null;
  var musicBlob = null, voiceBlob = null, ecouteurs = [];
  function avertir() { var a = arguments; ecouteurs.forEach(function (f) { try { f.apply(null, a); } catch (e) { /* écouteur fautif ignoré */ } }); }

  function status(t, b, e) { var p = $('#statusPill'); p.textContent = t; p.classList.toggle('busy', !!b); p.classList.toggle('err', !!e); }
  function media(id) { for (var i = 0; i < S.media.length; i++) if (S.media[i].id === id) return S.media[i]; return null; }
  function estVideo(c) { var m = media(c.mid); return !!(m && m.type === 'video'); }
  function longueurSource(c) { var m = media(c.mid); return m && m.type === 'video' ? Math.max(0.1, (m.duree || 0) - (c.debutSource || 0)) : Infinity; }
  function clipDur(c) {
    var d = clamp(Number(c.dur) || 4, 0.2, 60);
    if (estVideo(c)) d = Math.min(d, longueurSource(c) / (Number(c.speed) || 1));
    return d;
  }
  function transDur(c, i) { var t = TRANS[c.trans] ? c.trans : 'fade'; if (t === 'none') return 0; return clamp(c.transDur != null ? Number(c.transDur) : 0.5, 0, Math.min(clipDur(c), clipDur(S.clips[i + 1] || c)) * 0.45); }
  function starts() { var o = [], a = 0; for (var i = 0; i < S.clips.length; i++) { o.push(a); a += clipDur(S.clips[i]) - transDur(S.clips[i], i); } return o; }
  function total() {
    var fin = 0; if (S.clips.length) { var st = starts(), l = S.clips.length - 1; fin = st[l] + clipDur(S.clips[l]); }
    S.texts.forEach(function (o) { fin = Math.max(fin, o.start + o.dur); });
    return Math.max(0.5, fin || 1);
  }
  function source(m) { return m ? (m.type === 'video' ? m.el : m.img) : null; }
  function dims(m) { return m.type === 'video' ? [m.el.videoWidth || m.largeur || 16, m.el.videoHeight || m.hauteur || 9] : [m.img.width, m.img.height]; }
  function thumb(m) {
    if (!m) return '';
    if (!m._t) {
      try {
        var d = dims(m), c = document.createElement('canvas'), ar = d[0] / d[1]; c.width = 112; c.height = Math.max(1, Math.round(112 / ar));
        c.getContext('2d').drawImage(source(m), 0, 0, c.width, c.height); m._t = c.toDataURL('image/jpeg', 0.7);
      } catch (e) { m._t = ''; }
    }
    return m._t;
  }
  // dimensions paires : exigées par l'encodeur H.264 (×1,5 sur 4:3 donnait 1215 px, impair)
  function size() { var b = ASPECTS[S.aspect] || ASPECTS['16:9']; return [Math.round(b[0] * S.quality / 2) * 2, Math.round(b[1] * S.quality / 2) * 2]; }
  function applySize() {
    var d = size(); cv.width = bufA.width = bufB.width = d[0]; cv.height = bufA.height = bufB.height = d[1]; vig = null; dust = [];
    for (var i = 0; i < 70; i++) dust.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2.2, sp: 0.02 + Math.random() * 0.08, ph: Math.random() * 6.28 });
    $('#stageInfo').textContent = d[0] + ' × ' + d[1] + ' · ' + S.fps + ' i/s'; $('#ratioBadge').textContent = S.aspect.replace(':', ' : ');
  }
  function etatMontage() { return { clips: S.clips, texts: S.texts, subs: S.subs, audioTracks: S.audioTracks, fx: { grade: S.grade, fit: S.fit, vignette: S.vignette, grain: S.grain, dust: S.dust, bloom: S.bloom, shake: S.shake, letter: S.letter } }; }
  function snap() { hist = hist.slice(0, hi + 1); hist.push(JSON.stringify(etatMontage())); hi = hist.length - 1; if (hist.length > 80) { hist.shift(); hi--; } avertir('modifie'); }

  function nouveauClip(m, extra) {
    var c = { id: uid(), mid: m.id, type: m.type, dur: m.type === 'video' ? Math.max(0.2, m.duree || 4) : 4, preset: m.type === 'video' ? 'fixe' : 'auto', speed: 1, ease: 'easeInOut', int: 1,
      entry: m.type === 'video' ? 0 : 0.04, trans: 'fade', transDur: 0.5, kf: [], debutSource: 0, vol: 1, muet: false };
    for (var k in (extra || {})) c[k] = extra[k];
    return c;
  }
  /** ajoute un média ; enrichi : `info` = { type:'image'|'video', origine, blob, duree, aAudio, prompt, modele, tacheId, nature }. */
  function addMedia(name, srcEl, info, ajouterAuMontage) {
    info = info || {};
    var m = { id: info.id || uid(), name: name, type: info.type || 'image', origine: info.origine || 'importe', nature: info.nature || null, blob: info.blob || null,
      prompt: info.prompt || null, modele: info.modele || null, tacheId: info.tacheId || null, duree: info.duree || null, aAudio: !!info.aAudio, cree: Date.now() };
    if (m.type === 'video') { m.el = srcEl; m.largeur = srcEl.videoWidth; m.hauteur = srcEl.videoHeight; } else m.img = srcEl;
    S.media.push(m);
    if (ajouterAuMontage !== false) { S.clips.push(nouveauClip(m)); if (!S.sel) S.sel = S.clips[0].id; }
    snap(); renderAll(); status((m.type === 'video' ? 'Vidéos' : 'Images') + ' : ' + S.media.filter(function (x) { return x.type === m.type && !x.supprime; }).length);
    avertir('media', m);
    return m;
  }
  /** charge un Blob vidéo → élément <video> prêt (métadonnées lues : durée et dimensions RÉELLES). */
  function chargerVideo(blob) {
    return new Promise(function (res, rej) {
      var v = document.createElement('video'); v.preload = 'auto'; v.playsInline = true; v.muted = false; v.crossOrigin = 'anonymous';
      var fini = false;
      v.onloadedmetadata = function () {
        if (fini) return;
        if (!isFinite(v.duration)) { v.currentTime = 1e6; v.ontimeupdate = function () { v.ontimeupdate = null; v.currentTime = 0; fini = true; res(v); }; return; }
        fini = true; res(v);
      };
      v.onerror = function () { rej(new Error('Vidéo illisible par le navigateur.')); };
      v.src = URL.createObjectURL(blob);
    });
  }
  /** la vidéo contient-elle une piste audio ? (décodage réel, pas une supposition) */
  function aUnePisteAudio(blob) {
    try {
      var AC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!AC) return Promise.resolve(null);
      var oc = new AC(1, 44100, 44100);
      return blob.arrayBuffer().then(function (ab) { return oc.decodeAudioData(ab); }).then(function (buf) {
        var d = buf.getChannelData(0), max = 0; for (var i = 0; i < d.length; i += 64) max = Math.max(max, Math.abs(d[i]));
        return max > 1e-4;
      }, function () { return false; });
    } catch (e) { return Promise.resolve(null); }
  }
  async function ajouterVideo(blob, nom, info, ajouterAuMontage) {
    var v = await chargerVideo(blob);
    var aAudio = await aUnePisteAudio(blob);
    info = Object.assign({}, info || {}, { type: 'video', blob: blob, duree: v.duration, aAudio: !!aAudio });
    return addMedia(nom, v, info, ajouterAuMontage);
  }
  function chargerImage(blob) { return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('Image illisible.')); }; im.src = URL.createObjectURL(blob); }); }
  async function ajouterImage(blob, nom, info, ajouterAuMontage) { var im = await chargerImage(blob); return addMedia(nom, im, Object.assign({ blob: blob }, info || {}, { type: 'image' }), ajouterAuMontage); }

  function addFiles(fl) {
    var fs = [].slice.call(fl || []);
    var ok = fs.filter(function (f) { return /^(image|video|audio)\//.test(f.type); });
    if (!ok.length) { status('Aucun fichier valide (image, vidéo ou audio)', 0, 1); return; }
    ok.forEach(function (f) {
      if (/^image\//.test(f.type)) ajouterImage(f, f.name, { origine: 'importe' }).catch(function () { status('Image illisible', 0, 1); });
      else if (/^video\//.test(f.type)) ajouterVideo(f, f.name, { origine: 'importe' }).catch(function (e) { status(e.message, 0, 1); });
      else ajouterPisteAudio(f, f.name, 'importe');
    });
  }
  function demo() {
    [['#374151', '#22D3EE', 'Démo 1'], ['#111827', '#06B6D4', 'Démo 2'], ['#0F172A', '#85E7F6', 'Démo 3']].forEach(function (sp, i) {
      var c = document.createElement('canvas'); c.width = 1600; c.height = 900; var g = c.getContext('2d');
      var lg = g.createLinearGradient(0, 0, 1600, 900); lg.addColorStop(0, sp[0]); lg.addColorStop(1, sp[1]); g.fillStyle = lg; g.fillRect(0, 0, 1600, 900);
      for (var k = 0; k < 3; k++) { g.beginPath(); g.moveTo(0, 900); for (var x = 0; x <= 1600; x += 40) g.lineTo(x, 620 + k * 90 - Math.sin(x / 1600 * Math.PI * (1.4 + k) + k) * 110); g.lineTo(1600, 900); g.closePath(); g.fillStyle = 'rgba(11,18,32,' + (0.45 + k * 0.15) + ')'; g.fill(); }
      g.font = '700 84px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.92)'; g.fillText(sp[2], 80, 170);
      g.font = '600 34px system-ui, sans-serif'; g.fillText('Image de démonstration (pas une génération IA)', 80, 230);
      addMedia('demo-' + (i + 1) + '.png', c, { origine: 'demo', nature: 'demo' });
    });
  }

  // ------------------------------------------------------------------ rendu
  function kfAt(c, p) {
    var k = c.kf; if (!k || !k.length) return null; var arr = k.slice().sort(function (a, b) { return a.t - b.t; });
    if (p <= arr[0].t) return arr[0]; if (p >= arr[arr.length - 1].t) return arr[arr.length - 1];
    for (var i = 0; i < arr.length - 1; i++) {
      if (p >= arr[i].t && p <= arr[i + 1].t) {
        var u = EASE.smooth((p - arr[i].t) / ((arr[i + 1].t - arr[i].t) || 1)), A = arr[i], B = arr[i + 1];
        var o0 = A.o == null ? 1 : A.o, o1 = B.o == null ? 1 : B.o;
        return { s: A.s + (B.s - A.s) * u, x: (A.x || 0) + ((B.x || 0) - (A.x || 0)) * u, y: (A.y || 0) + ((B.y || 0) - (A.y || 0)) * u, r: (A.r || 0) + ((B.r || 0) - (A.r || 0)) * u, o: o0 + (o1 - o0) * u };
      }
    }
    return arr[0];
  }
  function transform(c, p) {
    var kf = kfAt(c, p); if (kf) return { s: kf.s || 1, tx: kf.x || 0, ty: kf.y || 0, rot: kf.r || 0, op: kf.o == null ? 1 : kf.o };
    var name = c.preset === 'auto' ? 'kenburns' : c.preset, pr = PRESETS[name] || PRESETS.kenburns, e = EASE[c.ease] || EASE.easeInOut;
    // vitesse (corrigée) : pour une image, elle accélère ou ralentit le mouvement de caméra ; pour une vidéo, c'est le playbackRate
    var pv = estVideo(c) ? p : clamp(p * (Number(c.speed) || 1), 0, 1);
    var pe = pr.r ? pv : e(pv), t = pr.f ? pr.f(pe, Number(c.int) || 1) || {} : {};
    return { s: (t.s || 1) + (Number(c.entry) || 0) * (1 - pe), tx: t.tx || 0, ty: t.ty || 0, rot: t.rot || 0, op: 1 };
  }
  function fitDraw(g, src, sw, sh, W, H, sc, tx, ty, rot, alpha, filter, mode) {
    if (!src || !sw || !sh) return; var ia = sw / sh, ca = W / H, dw, dh;
    if (mode === 'contain') { if (ia > ca) { dw = W; dh = W / ia; } else { dh = H; dw = H * ia; } } else { if (ia > ca) { dh = H; dw = H * ia; } else { dw = W; dh = W / ia; } }
    g.save(); g.globalAlpha = alpha == null ? 1 : alpha; if (filter) g.filter = filter; g.translate(W / 2 + (tx || 0) * W, H / 2 + (ty || 0) * H); if (rot) g.rotate(rot); g.scale(sc, sc);
    try { g.drawImage(src, -dw / 2, -dh / 2, dw, dh); } catch (e) { /* image vidéo pas encore prête */ }
    g.restore();
  }
  function drawClip(g, c, W, H, p, t, alpha) {
    var m = media(c.mid); if (!m) return; var src = source(m), d = dims(m);
    var tr = transform(c, p), gr = GRADES[c.grade || S.grade] || GRADES[S.grade] || '';
    var vivant = !estVideo(c) || c.preset !== 'fixe';
    var sc = tr.s + (vivant ? Math.sin(t * 0.9) * 0.003 : 0), tx = tr.tx + (vivant ? Math.sin(t * 0.72) * 0.003 : 0), ty = tr.ty + (vivant ? Math.cos(t * 0.53) * 0.003 : 0);
    if (S.fit === 'blur') fitDraw(g, src, d[0], d[1], W, H, 1.18, 0, 0, 0, alpha, 'blur(' + (W * 0.018) + 'px) brightness(.6)', 'cover');
    else if (S.fit === 'contain') fitDraw(g, src, d[0], d[1], W, H, 1, 0, 0, 0, alpha, 'blur(' + (W * 0.02) + 'px) brightness(.45)', 'cover');
    fitDraw(g, src, d[0], d[1], W, H, sc, tx, ty, tr.rot, (alpha == null ? 1 : alpha) * (tr.op == null ? 1 : tr.op), gr, S.fit === 'contain' ? 'contain' : 'cover');
  }
  function drawFxText(g, W, H, t) {
    S.texts.forEach(function (o) {
      if (t < o.start || t > o.start + o.dur) return;
      g.save(); g.globalAlpha = 1; g.textAlign = 'center';
      var fs = W * (o.size || 0.052), a = clamp((t - o.start) / 0.6, 0, 1) * clamp((o.start + o.dur - t) / 0.6, 0, 1), dy = 0, sc = 1, txt = o.text || '';
      if (o.anim === 'up') dy = (1 - a) * fs * 0.8; if (o.anim === 'down') dy = -(1 - a) * fs * 0.8; if (o.anim === 'scale') sc = 0.6 + 0.4 * a;
      if (o.anim === 'type') txt = txt.slice(0, Math.ceil(txt.length * clamp((t - o.start) / (o.dur * 0.6), 0, 1)));
      if (o.anim === 'blur') g.filter = 'blur(' + (8 * (1 - a)) + 'px)';
      if (o.anim === 'fade' || o.anim === 'blur') g.globalAlpha = a;
      var y = o.style === 'top' ? H * 0.16 : o.style === 'center' ? H * 0.5 : o.style === 'caption' ? H * 0.88 : H * 0.82;
      g.translate(W / 2, y + dy); g.scale(sc, sc); g.font = '700 ' + fs + 'px "Inter", system-ui, sans-serif'; g.fillStyle = o.color || '#fff'; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = W * 0.012;
      if (o.anim === 'kinetic') {
        // animation « Cinétique » (corrigée : la boucle d'origine était vide) — lettres qui tombent en place l'une après l'autre
        var w = g.measureText(txt).width, x = -w / 2, el = t - o.start;
        g.textAlign = 'left';
        for (var i = 0; i < txt.length; i++) {
          var ch = txt[i], cw = g.measureText(ch).width, q = clamp((el - i * 0.045) / 0.35, 0, 1), fin = clamp((o.start + o.dur - t) / 0.5, 0, 1);
          g.globalAlpha = q * fin; g.fillText(ch, x, -(1 - EASE.easeOut(q)) * fs * 0.9); x += cw;
        }
      } else g.fillText(txt, 0, 0);
      g.shadowBlur = 0; g.globalAlpha = o.anim === 'fade' || o.anim === 'blur' ? a : 1;
      if (o.sub) { g.textAlign = 'center'; g.font = '400 ' + (fs * 0.44) + 'px "Inter", system-ui, sans-serif'; g.fillStyle = 'rgba(236,254,255,.9)'; g.fillText(o.sub, 0, fs * 0.9); }
      g.restore();
    });
  }
  function drawSubs(g, W, H, t) {
    if (!S.subStyle.show) return;
    S.subs.forEach(function (s) {
      if (t < s.start || t > s.start + s.dur) return;
      var fs = W * (S.subStyle.size || 0.042), lignes = String(s.text || '').split('\n');
      g.save(); g.font = '600 ' + fs + 'px "Inter", system-ui, sans-serif'; g.textAlign = 'center';
      lignes.forEach(function (l, i) {
        var y = H * 0.9 - (lignes.length - 1 - i) * fs * 1.25, w = g.measureText(l).width;
        g.fillStyle = 'rgba(0,0,0,.62)'; g.fillRect(W / 2 - w / 2 - fs * 0.35, y - fs * 0.95, w + fs * 0.7, fs * 1.25);
        g.fillStyle = '#fff'; g.fillText(l, W / 2, y);
      });
      g.restore();
    });
  }
  function drawAtmos(g, W, H, t) {
    if (S.dust > 0.01) { g.save(); g.globalCompositeOperation = 'lighter'; dust.forEach(function (d) { var y = ((d.y - (t * d.sp) % 1) + 1) % 1, x = (d.x + Math.sin(t * 0.35 + d.ph) * 0.012 + 1) % 1; g.globalAlpha = S.dust * 0.5 * (0.35 + 0.65 * Math.abs(Math.sin(t * 1.1 + d.ph))); g.fillStyle = '#E0F7FF'; g.beginPath(); g.arc(x * W, y * H, d.r * (W / 1280) * 1.6, 0, 6.283); g.fill(); }); g.restore(); }
    if (S.bloom > 0.02) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = S.bloom * 0.35; g.filter = 'blur(' + (W * 0.02) + 'px) brightness(1.4)'; g.drawImage(cv, 0, 0); g.restore(); }
    if (S.grain > 0.005) {
      if (!noise) { noise = document.createElement('canvas'); noise.width = noise.height = 160; var n = noise.getContext('2d'), id = n.createImageData(160, 160); for (var i = 0; i < id.data.length; i += 4) { var v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = Math.random() * 90; } n.putImageData(id, 0, 0); }
      g.save(); g.globalAlpha = S.grain; g.globalCompositeOperation = 'overlay'; g.fillStyle = g.createPattern(noise, 'repeat'); g.translate(-((t * 997) % 160), -((t * 613) % 160)); g.fillRect(0, 0, W + 160, H + 160); g.restore();
    }
    if (S.vignette > 0.01) { if (!vig || vig.w !== W || vig.h !== H) { var rg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.78); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,.92)'); vig = { g: rg, w: W, h: H }; } g.save(); g.globalAlpha = S.vignette; g.fillStyle = vig.g; g.fillRect(0, 0, W, H); g.restore(); }
    if (S.letter > 0) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H * S.letter); g.fillRect(0, H - H * S.letter, W, H * S.letter); }
  }
  /** index du clip actif et, en transition, du suivant. */
  function actifs(t) {
    var st = starts(), i = -1;
    for (var j = 0; j < S.clips.length; j++) if (t >= st[j] && t < st[j] + clipDur(S.clips[j])) { i = j; break; }
    if (i < 0) i = S.clips.length - 1;
    var c = S.clips[i], nb = S.clips[i + 1], td = c ? transDur(c, i) : 0;
    var enTrans = !!(c && nb && td > 0 && t > st[i] + clipDur(c) - td);
    return { i: i, st: st, enTrans: enTrans };
  }
  /** temps dans la SOURCE vidéo du clip i à l'instant t du montage. */
  function tempsSource(i, t, st) {
    var c = S.clips[i]; st = st || starts();
    return clamp((c.debutSource || 0) + Math.max(0, t - st[i]) * (Number(c.speed) || 1), 0, Math.max(0, (media(c.mid) || {}).duree - 0.04 || 0));
  }
  function render(t, noGuides) {
    var W = cv.width, H = cv.height; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#04070C'; ctx.fillRect(0, 0, W, H);
    if (!S.clips.length) {
      ctx.fillStyle = '#22D3EE'; ctx.font = '800 ' + (W * 0.07) + 'px "Inter", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('MASSAMBA', W / 2, H / 2);
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '600 ' + (W * 0.024) + 'px "Inter", system-ui, sans-serif'; ctx.fillText('Générez une vidéo, importez des médias ou cliquez sur Démo', W / 2, H / 2 + H * 0.09);
      drawFxText(ctx, W, H, t); drawSubs(ctx, W, H, t); return;
    }
    var a = actifs(t), st = a.st, i = a.i, c = S.clips[i], p = clamp((t - st[i]) / clipDur(c), 0, 1), nb = S.clips[i + 1];
    if (a.enTrans) {
      var td = transDur(c, i), q = clamp((t - (st[i] + clipDur(c) - td)) / td, 0, 1);
      gA.setTransform(1, 0, 0, 1, 0, 0); gA.globalAlpha = 1; gA.clearRect(0, 0, W, H); drawClip(gA, c, W, H, p, t, 1); gB.clearRect(0, 0, W, H); drawClip(gB, nb, W, H, clamp((t - st[i + 1]) / clipDur(nb), 0, 1), t, 1);
      var ty = TRANS[c.trans] ? c.trans : 'fade';
      if (ty === 'fade' || ty === 'zoomBlur' || ty === 'whip') { ctx.globalAlpha = 1; ctx.drawImage(bufA, 0, 0); ctx.globalAlpha = q; if (ty === 'zoomBlur') ctx.filter = 'blur(' + (10 * q) + 'px)'; ctx.drawImage(bufB, ty === 'whip' ? q * W * 0.25 * (1 - q) : 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1; }
      else if (ty === 'wipeL' || ty === 'slide') { ctx.drawImage(bufA, 0, 0); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * q, H); ctx.clip(); ctx.drawImage(bufB, ty === 'slide' ? -W * (1 - q) : 0, 0); ctx.restore(); }
      else if (ty === 'wipeR') { ctx.drawImage(bufA, 0, 0); ctx.save(); ctx.beginPath(); ctx.rect(W * (1 - q), 0, W * q, H); ctx.clip(); ctx.drawImage(bufB, 0, 0); ctx.restore(); }
      else if (ty === 'iris') { ctx.drawImage(bufA, 0, 0); ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * q, 0, 6.283); ctx.clip(); ctx.drawImage(bufB, 0, 0); ctx.restore(); }
      else if (ty === 'dipBlack' || ty === 'dipWhite') { var bg = ty === 'dipBlack' ? '#000' : '#fff'; if (q < 0.5) { ctx.drawImage(bufA, 0, 0); ctx.globalAlpha = q * 2; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); } else { ctx.drawImage(bufB, 0, 0); ctx.globalAlpha = (1 - q) * 2; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); } ctx.globalAlpha = 1; }
      else { ctx.drawImage(bufA, 0, 0); ctx.globalAlpha = q; ctx.drawImage(bufB, 0, 0); ctx.globalAlpha = 1; }
    } else drawClip(ctx, c, W, H, p, t, 1);
    if (S.shake > 0.02) { ctx.save(); ctx.translate(Math.sin(t * 22) * S.shake * W * 0.004, Math.cos(t * 17) * S.shake * H * 0.004); }
    drawAtmos(ctx, W, H, t); drawFxText(ctx, W, H, t); drawSubs(ctx, W, H, t); if (S.shake > 0.02) ctx.restore();
    if (!noGuides) {
      var G = S.guides; ctx.save(); ctx.strokeStyle = 'rgba(34,211,238,.55)'; ctx.lineWidth = Math.max(1, W * 0.0015);
      if (G.safe) { ctx.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9); ctx.strokeRect(W * 0.1, H * 0.1, W * 0.8, H * 0.8); }
      if (G.thirds) for (var k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(W * k / 3, 0); ctx.lineTo(W * k / 3, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, H * k / 3); ctx.lineTo(W, H * k / 3); ctx.stroke(); }
      if (G.center) { ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ lecture des vraies vidéos (synchronisation)
  /** aligne chaque <video> du montage sur le temps courant : lecture/pause, position, vitesse, volume (fondu en transition). */
  function syncVideos(t, joue) {
    var a = S.clips.length ? actifs(t) : null, actifsIds = {};
    if (a) {
      var liste = [a.i]; if (a.enTrans) liste.push(a.i + 1);
      liste.forEach(function (i, k) {
        var c = S.clips[i], m = media(c.mid); if (!m || m.type !== 'video') return;
        actifsIds[m.id] = true; var v = m.el, cible = tempsSource(i, t, a.st);
        v.playbackRate = Number(c.speed) || 1;
        var q = 1; if (a.enTrans) { var td = transDur(S.clips[a.i], a.i); q = clamp((t - (a.st[a.i] + clipDur(S.clips[a.i]) - td)) / td, 0, 1); if (k === 0) q = 1 - q; }
        v.muted = !!c.muet; v.volume = clamp((c.vol == null ? 1 : c.vol) * q, 0, 1);
        if (Math.abs(v.currentTime - cible) > (joue ? 0.25 : 0.04)) { try { v.currentTime = cible; } catch (e) { /* pas encore prêt */ } }
        if (joue && v.paused) v.play().catch(function () {});
        if (!joue && !v.paused) v.pause();
      });
    }
    S.media.forEach(function (m) { if (m.type === 'video' && !actifsIds[m.id] && m.el && !m.el.paused) m.el.pause(); });
  }

  // ------------------------------------------------------------------ interface montage
  function renderAll() { renderTimeline(); renderMedia(); renderInspector(); sync(); avertir('rendu'); }
  function renderMedia() {
    var h = $('#mediaGrid'), vis = S.media.filter(function (m) { return !m.supprime; }); $('#mediaCount').textContent = vis.length;
    if (!vis.length) { h.innerHTML = ''; return; }
    h.innerHTML = vis.map(function (m) {
      var badge = m.type === 'video' ? (m.nature === 'demo' ? '<span class="mb demo">DÉMO</span>' : m.origine === 'genere-ia' ? '<span class="mb ia">IA</span>' : '<span class="mb">VIDÉO</span>') : (m.nature === 'demo' ? '<span class="mb demo">DÉMO</span>' : '');
      return '<div class="mitem" data-mid="' + m.id + '" style="background-image:url(' + JSON.stringify(thumb(m)) + ')" title="' + esc(m.name) + (m.duree ? ' · ' + m.duree.toFixed(1) + ' s' : '') + '">' + badge + '<button class="mx" data-del="' + m.id + '" title="Retirer de la médiathèque">×</button><span class="mn">' + esc(m.name) + '</span></div>';
    }).join('');
  }
  function renderTimeline() {
    var px = S.zoom, tot = Math.max(total() + 2, 10); $('#tlInner').style.width = (tot * px) + 'px';
    var tick = Math.max(1, Math.round(60 / px)), rh = '';
    for (var s = 0; s <= tot; s += tick) rh += '<div class="tick" style="left:' + (s * px) + 'px">' + s + 's</div>';
    $('#tlRuler').innerHTML = rh;
    var st = starts();
    $('#laneVideo').innerHTML = S.clips.map(function (c, i) {
      var m = media(c.mid), w = clipDur(c) * px, v = m && m.type === 'video';
      return '<div class="blk' + (v ? ' v' : '') + (c.id === S.sel ? ' sel' : '') + '" data-cid="' + c.id + '" style="left:' + (st[i] * px) + 'px;width:' + Math.max(28, w) + 'px"><span class="bt" style="background-image:url(' + JSON.stringify(thumb(m)) + ')"></span><span class="bn">' + (v ? '▶ ' : '') + esc(m ? m.name : '—') + '</span><span class="bd">' + clipDur(c).toFixed(1) + 's</span><span class="h l" data-resize="l"></span><span class="h r" data-resize="r"></span></div>';
    }).join('');
    $('#laneText').innerHTML = S.texts.map(function (o) { return '<div class="blk t' + (o.id === S.selText ? ' sel' : '') + '" data-tid="' + o.id + '" style="left:' + (o.start * px) + 'px;width:' + Math.max(24, o.dur * px) + 'px"><span class="bn">' + esc(o.text || 'texte') + '</span><span class="h l" data-resize="l"></span><span class="h r" data-resize="r"></span></div>'; }).join('');
    $('#laneSub').innerHTML = S.subs.map(function (o) { return '<div class="blk s" data-sid="' + o.id + '" style="left:' + (o.start * px) + 'px;width:' + Math.max(18, o.dur * px) + 'px" title="' + esc(o.text) + '"><span class="bn">' + esc(o.text) + '</span></div>'; }).join('');
    var a = '';
    if (audioEl) a += '<div class="blk a" style="left:0;width:' + Math.max(40, total() * px) + 'px"><canvas class="onde" data-onde="musique" width="600" height="26"></canvas><span class="an">♪ ' + esc(S.audio.name || 'musique') + ' · importé</span></div>';
    if (voiceEl) a += '<div class="blk a" style="left:0;top:26px;height:20px;width:' + Math.max(40, total() * px) + 'px"><span class="an">🎙 voix off · enregistrée</span></div>';
    S.audioTracks.forEach(function (tr, k) { var m = media(tr.mid); if (!m) return; a += '<div class="blk a x" data-aid="' + tr.id + '" style="left:' + (tr.start * px) + 'px;top:' + (2 + k * 10) + 'px;height:18px;width:' + Math.max(30, (m.duree || 2) * px) + 'px"><span class="an">♫ ' + esc(m.name) + ' · ' + esc(libelleOrigine(m.origine)) + '</span></div>'; });
    $('#laneAudio').innerHTML = a;
    dessinerOnde();
  }
  function libelleOrigine(o) { return { importe: 'importé', enregistre: 'enregistré', 'genere-local': 'généré localement', 'genere-ia': 'généré par IA', demo: 'démo' }[o] || o || ''; }
  var ondeCache = null;
  /** forme d'onde RÉELLE (pics du fichier décodé) — corrige la courbe aléatoire d'origine. */
  function dessinerOnde() {
    var c = document.querySelector('canvas[data-onde="musique"]'); if (!c || !musicBlob) return;
    var trace = function (pics) { var g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.fillStyle = '#22D3EE'; for (var x = 0; x < pics.length; x++) { var h = Math.max(1, pics[x] * (c.height - 2)); g.fillRect(x, (c.height - h) / 2, 1, h); } };
    if (ondeCache && ondeCache.blob === musicBlob) return trace(ondeCache.pics);
    var AC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!AC) return;
    musicBlob.arrayBuffer().then(function (ab) { return new AC(1, 44100, 44100).decodeAudioData(ab); }).then(function (buf) {
      var d = buf.getChannelData(0), n = c.width, pas = Math.max(1, Math.floor(d.length / n)), pics = [];
      for (var x = 0; x < n; x++) { var mx = 0; for (var k = x * pas; k < Math.min(d.length, (x + 1) * pas); k += 8) mx = Math.max(mx, Math.abs(d[k])); pics.push(mx); }
      ondeCache = { blob: musicBlob, pics: pics }; trace(pics);
    }).catch(function () {});
  }
  function clipSel() { return S.clips.filter(function (x) { return x.id === S.sel; })[0]; }
  function renderInspector() {
    var c = clipSel(), v = c && estVideo(c);
    $('#selPreset').value = c ? c.preset : 'auto'; $('#inpDur').value = c ? clipDur(c).toFixed(2) : 4; $('#inpSpeed').value = c ? c.speed : 1;
    $('#rngClipInt').value = c ? c.int : 1; $('#valClipInt').textContent = (c ? Number(c.int) : 1).toFixed(2); $('#selEase').value = c ? c.ease : 'easeInOut'; $('#inpEntry').value = c ? c.entry : 0.04;
    $('#selTrans').value = c ? c.trans : 'fade'; $('#rngTransDur').value = c ? c.transDur : 0.5; $('#valTransDur').textContent = (c ? Number(c.transDur) : 0.5).toFixed(2);
    $('#videoClipBox').style.display = v ? 'block' : 'none';
    if (v) { var m = media(c.mid); $('#inpTrimIn').value = (c.debutSource || 0).toFixed(2); $('#inpTrimIn').max = Math.max(0, (m.duree || 0) - 0.2); $('#rngClipVol').value = c.vol == null ? 1 : c.vol; $('#valClipVol').textContent = (c.vol == null ? 1 : c.vol).toFixed(2); $('#chkMute').checked = !!c.muet; $('#clipSrcInfo').textContent = 'Source : ' + (m.duree || 0).toFixed(2) + ' s · ' + (m.el.videoWidth || '?') + '×' + (m.el.videoHeight || '?') + ' · ' + (m.aAudio ? 'piste audio présente' : 'sans piste audio') + ' · ' + libelleOrigine(m.origine) + (m.nature === 'demo' ? ' (DÉMO)' : ''); }
    $('#kfbar').innerHTML = c ? c.kf.map(function (k, i) { return '<i data-kf="' + i + '" class="' + (i === S.selKf ? 'sel' : '') + '" style="left:' + (k.t * 100) + '%"></i>'; }).join('') : '';
    $('#kfList').innerHTML = c && c.kf.length ? c.kf.map(function (k, i) { return '<div class="kfrow' + (i === S.selKf ? ' sel' : '') + '" data-kfr="' + i + '">' + Math.round(k.t * 100) + '% · ×' + (k.s || 1).toFixed(2) + '<button data-kfd="' + i + '">✕</button></div>'; }).join('') : '<p class="empty">Aucun keyframe : le preset pilote le mouvement.</p>';
    $('#textList').innerHTML = S.texts.length ? S.texts.map(function (o) { return '<div class="kfrow' + (o.id === S.selText ? ' sel' : '') + '" data-txt="' + o.id + '">' + esc(o.text || '(vide)') + ' · ' + o.start.toFixed(1) + 's</div>'; }).join('') : '<p class="empty">Aucun calque de texte.</p>';
    var o = S.texts.filter(function (x) { return x.id === S.selText; })[0];
    if (o) { $('#inpTitle').value = o.text || ''; $('#inpSubtitle').value = o.sub || ''; $('#selTextStyle').value = o.style || 'lower'; $('#selTextAnim').value = o.anim || 'fade'; $('#inpTextSize').value = o.size; $('#inpTextColor').value = o.color || '#FFFFFF'; $('#inpTextStart').value = o.start; $('#inpTextDur').value = o.dur; }
    $('#projInfo').textContent = S.clips.length + ' plan(s) · ' + S.texts.length + ' texte(s) · ' + S.subs.length + ' sous-titre(s) · ' + fmt(total());
  }
  function sync() { var d = total(); $('#scrub').max = d; $('#scrub').value = Math.min(S.time, d); $('#tcur').textContent = fmt(S.time); $('#tdur').textContent = fmt(d); $('#playhead').style.left = (S.time * S.zoom) + 'px'; }

  var last = 0;
  function loop(now) {
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!S.exporting) {
      if (S.playing) {
        S.time += dt;
        if (S.time >= total()) { if (S.loop) { S.time = 0; if (audioEl) { audioEl.currentTime = 0; audioEl.play().catch(function () {}); } if (voiceEl) { voiceEl.currentTime = 0; voiceEl.play().catch(function () {}); } regen(); } else { S.time = total(); playing(false); } }
        sync();
      }
      syncVideos(S.time, S.playing); appliquerFonduMusique(); render(S.time);
    }
    requestAnimationFrame(loop);
  }
  function appliquerFonduMusique() {
    if (!audioEl) return; var t = S.time, d = total(), f = 1;
    if (S.audio.fadeIn > 0) f = Math.min(f, t / S.audio.fadeIn); if (S.audio.fadeOut > 0) f = Math.min(f, (d - t) / S.audio.fadeOut);
    audioEl.volume = clamp(S.audio.vol * clamp(f, 0, 1), 0, 1);
  }
  function playing(v) {
    S.playing = v; $('#btnPlay').textContent = v ? '❚❚' : '▶';
    if (v) { if (audioEl) { audioEl.currentTime = S.time % (audioEl.duration || 1e9); audioEl.play().catch(function () {}); } if (voiceEl) { voiceEl.currentTime = Math.min(S.time, voiceEl.duration || 0); voiceEl.play().catch(function () {}); } startGen(); }
    else { if (audioEl) audioEl.pause(); if (voiceEl) voiceEl.pause(); stopGen(); }
    syncVideos(S.time, v);
  }
  function regen() { stopGen(); if (S.audio.gen !== 'none') startGen(); }
  function ensureCtx() { if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; actx = new AC(); streamDest = actx.createMediaStreamDestination(); } if (actx.state === 'suspended') actx.resume(); return actx; }
  function nappe(ac, sortie, type, vol) {
    var out = ac.createGain(); out.gain.value = vol; out.connect(sortie); var nodes = { out: out, osc: [] };
    var base = type === 'epique' ? 110 : 220;
    for (var i = 0; i < (type === 'calme' ? 2 : 3); i++) {
      var o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      o.type = i ? 'sine' : 'triangle'; o.frequency.value = base * (1 + i * 0.5); g.gain.value = 0.12 / (i + 1); lfo.frequency.value = 0.06 + i * 0.03; lg.gain.value = 6;
      lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(out); nodes.osc.push(o, lfo);
    }
    return nodes;
  }
  function startGen() { ensureCtx(); if (!actx || S.audio.gen === 'none' || genNodes) return; genNodes = nappe(actx, actx.destination, S.audio.gen, S.audio.volGen); genNodes.out.connect(streamDest); genNodes.osc.forEach(function (o) { o.start(); }); }
  function stopGen() { if (genNodes) { try { genNodes.osc.forEach(function (o) { o.stop(); }); } catch (e) { /* déjà arrêté */ } genNodes = null; } }
  function addText(o) {
    var t = { id: uid(), text: o && o.text != null ? o.text : 'Votre titre', sub: (o && o.sub) || '', style: (o && o.style) || 'lower', anim: (o && o.anim) || 'fade', size: (o && o.size) || 0.052, color: (o && o.color) || '#FFFFFF', start: o && o.start != null ? o.start : Math.round(S.time * 10) / 10, dur: (o && o.dur) || 4 };
    S.texts.push(t); S.selText = t.id; snap(); renderAll(); return t;
  }
  function bindR(id, vid, key, dec, suf) { var e = $(id), o = $(vid); var u = function () { S[key] = parseFloat(e.value) || 0; if (o) o.textContent = S[key].toFixed(dec) + suf; }; e.addEventListener('input', u); u(); }

  // ------------------------------------------------------------------ opérations de montage
  function decouper() {
    var c = clipSel(); if (!c) { status('Sélectionnez un plan', 0, 1); return; }
    var st = starts(), i = S.clips.indexOf(c), local = S.time - st[i];
    if (local <= 0.2 || local >= clipDur(c) - 0.2) { status('Placez la tête de lecture à l’intérieur du plan', 0, 1); return; }
    var b = JSON.parse(JSON.stringify(c)); b.id = uid(); b.kf = [];
    if (estVideo(c)) b.debutSource = (c.debutSource || 0) + local * (Number(c.speed) || 1);
    b.dur = clipDur(c) - local; c.dur = local; b.trans = c.trans; c.trans = 'none';
    S.clips.splice(i + 1, 0, b); S.sel = b.id; snap(); renderAll(); status('Plan découpé au curseur');
  }
  function dupliquer() { var c = clipSel(); if (!c) return; var b = JSON.parse(JSON.stringify(c)); b.id = uid(); S.clips.splice(S.clips.indexOf(c) + 1, 0, b); S.sel = b.id; snap(); renderAll(); status('Plan dupliqué'); }
  function supprimerPlan() { if (!S.sel) return; S.clips = S.clips.filter(function (c) { return c.id !== S.sel; }); S.sel = S.clips[0] ? S.clips[0].id : null; snap(); renderAll(); }
  function deplacerPlan(id, versIndex) { var i = S.clips.findIndex(function (c) { return c.id === id; }); if (i < 0) return; var c = S.clips.splice(i, 1)[0]; S.clips.splice(clamp(versIndex, 0, S.clips.length), 0, c); snap(); renderAll(); }

  // glisser-déposer et poignées dans la timeline (absent du fichier d'origine : poignées visibles mais inactives)
  function brancherTimeline() {
    var drag = null;
    $('#tlLanes').addEventListener('pointerdown', function (e) {
      var blk = e.target.closest('.blk'); if (!blk || e.button !== 0) return;
      var poignee = e.target.getAttribute('data-resize'), cid = blk.getAttribute('data-cid'), tid = blk.getAttribute('data-tid');
      if (!cid && !tid) return;
      drag = { x0: e.clientX, cid: cid, tid: tid, poignee: poignee, bouge: false };
      if (cid) { var c = S.clips.filter(function (x) { return x.id === cid; })[0]; drag.dur0 = clipDur(c); drag.in0 = c.debutSource || 0; S.sel = cid; }
      if (tid) { var o = S.texts.filter(function (x) { return x.id === tid; })[0]; drag.start0 = o.start; drag.dur0 = o.dur; S.selText = tid; }
      blk.setPointerCapture && blk.setPointerCapture(e.pointerId);
    });
    window.addEventListener('pointermove', function (e) {
      if (!drag) return; var dx = (e.clientX - drag.x0) / S.zoom; if (Math.abs(e.clientX - drag.x0) > 3) drag.bouge = true; if (!drag.bouge) return;
      if (drag.cid) {
        var c = S.clips.filter(function (x) { return x.id === drag.cid; })[0]; if (!c) return;
        if (drag.poignee === 'r') c.dur = Math.max(0.3, drag.dur0 + dx);
        else if (drag.poignee === 'l') {
          if (estVideo(c)) { var d = clamp(dx, -drag.in0, drag.dur0 - 0.3); c.debutSource = drag.in0 + d * (Number(c.speed) || 1); c.dur = drag.dur0 - d; }
          else c.dur = Math.max(0.3, drag.dur0 - dx);
        } else { $('#tlInner').classList.add('deplace'); }
        renderTimeline(); sync();
      } else if (drag.tid) {
        var o = S.texts.filter(function (x) { return x.id === drag.tid; })[0]; if (!o) return;
        if (drag.poignee === 'r') o.dur = Math.max(0.5, drag.dur0 + dx);
        else if (drag.poignee === 'l') { var nd = clamp(dx, -drag.start0, drag.dur0 - 0.5); o.start = drag.start0 + nd; o.dur = drag.dur0 - nd; }
        else o.start = Math.max(0, drag.start0 + dx);
        renderTimeline(); sync();
      }
    });
    window.addEventListener('pointerup', function (e) {
      if (!drag) return; var d = drag; drag = null; $('#tlInner').classList.remove('deplace');
      if (!d.bouge) { if (d.cid) { S.sel = d.cid; S.selKf = -1; } renderAll(); return; }
      if (d.cid && !d.poignee) {
        // déplacement d'un plan : nouvel ordre selon la position du pointeur
        var r = $('#tlLanes').getBoundingClientRect(), x = (e.clientX - r.left + $('#tlLanes').scrollLeft) / S.zoom, st = starts(), idx = 0;
        for (var i = 0; i < S.clips.length; i++) if (S.clips[i].id !== d.cid && x > st[i] + clipDur(S.clips[i]) / 2) idx++;
        deplacerPlan(d.cid, idx); return;
      }
      snap(); renderAll();
    });
  }

  // ------------------------------------------------------------------ sous-titres
  function lireSousTitres(txt) {
    var blocs = String(txt).replace(/\r/g, '').split(/\n\n+/), res = [];
    var tps = function (s) { var m = /(\d+):(\d+):(\d+)[,.](\d+)|(\d+):(\d+)[,.](\d+)/.exec(s); if (!m) return null; return m[1] != null ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000 : (+m[5]) * 60 + (+m[6]) + (+m[7]) / 1000; };
    blocs.forEach(function (b) {
      var l = b.split('\n').filter(function (x) { return x.trim() && x.trim() !== 'WEBVTT'; }); var k = l.findIndex(function (x) { return /-->/.test(x); }); if (k < 0) return;
      var p = l[k].split('-->'), a = tps(p[0]), z = tps(p[1]); if (a == null || z == null || z <= a) return;
      res.push({ id: uid(), start: a, dur: z - a, text: l.slice(k + 1).join('\n') });
    });
    return res;
  }
  function versSrt() {
    var h = function (t) { var ms = Math.round(t * 1000), H = Math.floor(ms / 3600000), M = Math.floor(ms % 3600000 / 60000), Sx = Math.floor(ms % 60000 / 1000), R = ms % 1000; return String(H).padStart(2, '0') + ':' + String(M).padStart(2, '0') + ':' + String(Sx).padStart(2, '0') + ',' + String(R).padStart(3, '0'); };
    return S.subs.slice().sort(function (a, b) { return a.start - b.start; }).map(function (s, i) { return (i + 1) + '\n' + h(s.start) + ' --> ' + h(s.start + s.dur) + '\n' + s.text + '\n'; }).join('\n');
  }
  /** média audio restauré d'un projet (même identifiant, sans créer de piste). */
  function ajouterAudioMedia(blob, nom, info) {
    return new Promise(function (res) {
      var el = new Audio(URL.createObjectURL(blob));
      var fin = function () { var m = { id: (info && info.id) || uid(), name: nom, type: 'audio', origine: (info && info.origine) || 'importe', blob: blob, el: el, duree: el.duration || (info && info.duree) || 0, cree: Date.now() }; S.media.push(m); res(m); };
      el.onloadedmetadata = fin; el.onerror = fin;
    });
  }
  function ajouterPisteAudio(blob, nom, origine) {
    var el = new Audio(URL.createObjectURL(blob));
    el.onloadedmetadata = function () { var m = { id: uid(), name: nom, type: 'audio', origine: origine || 'importe', blob: blob, el: el, duree: el.duration, cree: Date.now() }; S.media.push(m); S.audioTracks.push({ id: uid(), mid: m.id, start: Math.round(S.time * 10) / 10, vol: 0.8 }); snap(); renderAll(); status('Piste audio ajoutée : ' + nom); };
    el.onerror = function () { status('Audio illisible', 0, 1); };
  }

  // ------------------------------------------------------------------ branchements (reprennent ceux de Motion Studio 2)
  function brancher() {
    var h = ''; for (var k in PRESETS) h += '<option value="' + k + '">' + PRESETS[k].l + '</option>'; $('#selPreset').innerHTML = h;
    var th = ''; for (var t in TRANS) th += '<option value="' + t + '">' + TRANS[t].l + '</option>'; $('#selTrans').innerHTML = th; $('#selTransDefault').innerHTML = th;
    $('#fileInput').addEventListener('change', function () { addFiles(this.files); this.value = ''; });
    var drop = $('#drop');
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer) addFiles(e.dataTransfer.files); });
    document.addEventListener('dragover', function (e) { e.preventDefault(); }); document.addEventListener('drop', function (e) { e.preventDefault(); });
    $('#btnDemo').addEventListener('click', function () { demo(); render(S.time); });
    document.querySelectorAll('.tab').forEach(function (b) { b.addEventListener('click', function () { document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('on'); }); document.querySelectorAll('.tabpane').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); document.querySelector('[data-pane="' + b.getAttribute('data-tab') + '"]').classList.add('on'); }); });
    document.querySelectorAll('.chip[data-guide]').forEach(function (ch) { ch.addEventListener('click', function () { var g = ch.getAttribute('data-guide'); S.guides[g] = S.guides[g] ? 0 : 1; ch.classList.toggle('on', !!S.guides[g]); render(S.time); }); });
    $('#mediaGrid').addEventListener('click', function (e) {
      var d = e.target.closest('[data-del]');
      if (d) { var id = d.getAttribute('data-del'), m = media(id); if (m) m.supprime = true; S.clips = S.clips.filter(function (c) { return c.mid !== id; }); if (!S.clips.some(function (c) { return c.id === S.sel; })) S.sel = S.clips[0] ? S.clips[0].id : null; snap(); renderAll(); render(S.time); status('Média retiré (Ctrl+Z pour le rétablir)'); return; }
      var it = e.target.closest('[data-mid]'); if (it) { var mm = media(it.getAttribute('data-mid')); if (mm) { S.clips.push(nouveauClip(mm)); S.sel = S.clips[S.clips.length - 1].id; snap(); renderAll(); } }
    });
    $('#tlRuler').addEventListener('click', function (e) { var r = this.getBoundingClientRect(); S.time = clamp((e.clientX - r.left) / S.zoom, 0, total()); sync(); syncVideos(S.time, S.playing); render(S.time); });
    $('#scrub').addEventListener('input', function () { S.time = parseFloat(this.value) || 0; sync(); syncVideos(S.time, S.playing); render(S.time); });
    $('#btnPlay').addEventListener('click', function () { playing(!S.playing); }); $('#btnLoop').addEventListener('click', function () { S.loop = !S.loop; this.classList.toggle('on', S.loop); });
    $('#btnPrev').addEventListener('click', function () { var st = starts(), t = 0; for (var i = 0; i < st.length; i++) if (st[i] < S.time - 0.05) t = st[i]; S.time = t; sync(); render(S.time); });
    $('#btnNext').addEventListener('click', function () { var st = starts(); for (var i = 0; i < st.length; i++) if (st[i] > S.time + 0.05) { S.time = st[i]; break; } sync(); render(S.time); });
    $('#tlZoom').addEventListener('input', function () { S.zoom = parseInt(this.value, 10); $('#tlZoomVal').textContent = S.zoom + ' px/s'; renderTimeline(); sync(); });
    $('#selPreset').addEventListener('change', function () { var c = clipSel(); if (c) { c.preset = this.value; snap(); render(S.time); } });
    $('#inpDur').addEventListener('change', function () { var c = clipSel(); if (c) { c.dur = clamp(parseFloat(this.value) || 4, 0.2, 60); snap(); renderAll(); render(S.time); } });
    $('#inpSpeed').addEventListener('change', function () { var c = clipSel(); if (c) { c.speed = clamp(parseFloat(this.value) || 1, 0.25, 3); snap(); renderAll(); render(S.time); } });
    $('#rngClipInt').addEventListener('input', function () { var c = clipSel(); $('#valClipInt').textContent = (parseFloat(this.value) || 0).toFixed(2); if (c) c.int = parseFloat(this.value) || 1; });
    $('#selEase').addEventListener('change', function () { var c = clipSel(); if (c) c.ease = this.value; });
    $('#inpEntry').addEventListener('change', function () { var c = clipSel(); if (c) c.entry = clamp(parseFloat(this.value) || 0, 0, 0.3); });
    $('#selTrans').addEventListener('change', function () { var c = clipSel(); if (c) { c.trans = this.value; snap(); renderTimeline(); render(S.time); } });
    $('#rngTransDur').addEventListener('input', function () { var c = clipSel(); $('#valTransDur').textContent = parseFloat(this.value).toFixed(2); if (c) c.transDur = parseFloat(this.value) || 0; renderTimeline(); });
    $('#inpTrimIn').addEventListener('change', function () { var c = clipSel(); if (c && estVideo(c)) { c.debutSource = clamp(parseFloat(this.value) || 0, 0, Math.max(0, media(c.mid).duree - 0.2)); snap(); renderAll(); } });
    $('#rngClipVol').addEventListener('input', function () { var c = clipSel(); $('#valClipVol').textContent = parseFloat(this.value).toFixed(2); if (c) c.vol = parseFloat(this.value); });
    $('#chkMute').addEventListener('change', function () { var c = clipSel(); if (c) { c.muet = this.checked; snap(); } });
    $('#btnSplit').addEventListener('click', decouper); $('#btnDup').addEventListener('click', dupliquer); $('#btnDelClip').addEventListener('click', supprimerPlan);
    $('#btnKfCap').addEventListener('click', function () { capKf(); });
    $('#kfbar').addEventListener('click', function (e) {
      var k = e.target.closest('[data-kf]'), c = clipSel();
      if (k && c) { S.selKf = parseInt(k.getAttribute('data-kf'), 10); var kk = c.kf[S.selKf]; if (kk) { $('#kfScale').value = kk.s || 1; $('#kfX').value = kk.x || 0; $('#kfY').value = kk.y || 0; $('#kfR').value = kk.r || 0; $('#kfO').value = kk.o == null ? 1 : kk.o; $('#kfScaleV').textContent = (kk.s || 1).toFixed(2); $('#kfXV').textContent = (kk.x || 0).toFixed(2); $('#kfYV').textContent = (kk.y || 0).toFixed(2); $('#kfRV').textContent = (kk.r || 0).toFixed(2); $('#kfOV').textContent = (kk.o == null ? 1 : kk.o).toFixed(2); $('#kfEditor').style.display = 'block'; } renderInspector(); }
    });
    [['kfScale', 'kfScaleV', 's'], ['kfX', 'kfXV', 'x'], ['kfY', 'kfYV', 'y'], ['kfR', 'kfRV', 'r'], ['kfO', 'kfOV', 'o']].forEach(function (p) {
      $('#' + p[0]).addEventListener('input', function () { var c = clipSel(); $('#' + p[1]).textContent = (parseFloat(this.value) || 0).toFixed(2); if (c && S.selKf >= 0 && c.kf[S.selKf]) c.kf[S.selKf][p[2]] = parseFloat(this.value) || 0; render(S.time); });
    });
    $('#kfList').addEventListener('click', function (e) { var d = e.target.closest('[data-kfd]'), c = clipSel(); if (d && c) { c.kf.splice(parseInt(d.getAttribute('data-kfd'), 10), 1); S.selKf = -1; snap(); renderAll(); } });
    $('#btnAddKf').addEventListener('click', capKf); $('#btnAddText').addEventListener('click', function () { addText(); }); $('#btnTextAdd').addEventListener('click', function () { addText(); });
    $('#btnTextApply').addEventListener('click', function () { var o = S.texts.filter(function (x) { return x.id === S.selText; })[0]; if (!o) { addText(); return; } o.text = $('#inpTitle').value; o.sub = $('#inpSubtitle').value; o.style = $('#selTextStyle').value; o.anim = $('#selTextAnim').value; o.size = parseFloat($('#inpTextSize').value) || 0.052; o.color = $('#inpTextColor').value || '#fff'; o.start = Math.max(0, parseFloat($('#inpTextStart').value) || 0); o.dur = Math.max(0.5, parseFloat($('#inpTextDur').value) || 4); snap(); renderAll(); render(S.time); });
    $('#btnTextDel').addEventListener('click', function () { S.texts = S.texts.filter(function (x) { return x.id !== S.selText; }); S.selText = null; snap(); renderAll(); render(S.time); });
    $('#textList').addEventListener('click', function (e) { var t = e.target.closest('[data-txt]'); if (t) { S.selText = t.getAttribute('data-txt'); renderInspector(); } });
    $('#selGrade').addEventListener('change', function () { S.grade = this.value; snap(); render(S.time); }); $('#selFit').addEventListener('change', function () { S.fit = this.value; snap(); render(S.time); });
    bindR('#rngVig', '#valVig', 'vignette', 2, ''); bindR('#rngGrain', '#valGrain', 'grain', 2, ''); bindR('#rngDust', '#valDust', 'dust', 2, ''); bindR('#rngBloom', '#valBloom', 'bloom', 2, ''); bindR('#rngShake', '#valShake', 'shake', 2, ''); bindR('#rngLetter', '#valLetter', 'letter', 2, '');
    $('#selTransDefault').addEventListener('change', function () { var v = this.value; S.clips.forEach(function (c) { c.trans = v; }); snap(); renderTimeline(); });
    $('#btnApplyAll').addEventListener('click', function () { var c = clipSel(); if (!c) return; S.clips.forEach(function (x) { if (!estVideo(x)) { x.preset = c.preset; x.ease = c.ease; x.int = c.int; } }); snap(); renderAll(); status('Preset appliqué aux plans image'); });
    $('#btnAutoPlan').addEventListener('click', function () { if (!S.clips.length) { status('Ajoutez des médias', 0, 1); return; } var pool = ['kenburns', 'zoomIn', 'panRight', 'orbit', 'drift', 'diagonal', 'tiltUp', 'zoomOut']; S.clips.forEach(function (c, i) { c.trans = 'fade'; c.transDur = 0.6; if (estVideo(c)) return; c.preset = pool[i % pool.length]; c.dur = clamp(3.5 + (i % 3) * 0.6, 3, 5.5); c.entry = 0.05; c.int = 1.1; }); snap(); renderAll(); status('Pilote auto appliqué'); });
    $('#btnReset').addEventListener('click', function () { if (!confirm('Réinitialiser le montage ?')) return; S.media.forEach(function (m) { m.supprime = true; }); S.clips = []; S.texts = []; S.subs = []; S.audioTracks = []; S.sel = null; S.selText = null; S.time = 0; playing(false); snap(); renderAll(); render(0); status('Montage réinitialisé'); });
    $('#btnUndo').addEventListener('click', undo); $('#btnRedo').addEventListener('click', redo);
    $('#audioFile').addEventListener('change', function () { var f = this.files && this.files[0]; if (!f) return; definirMusique(f, f.name); this.value = ''; });
    $('#audioTrackFile').addEventListener('change', function () { var f = this.files && this.files[0]; if (f) ajouterPisteAudio(f, f.name, 'importe'); this.value = ''; });
    $('#rngVol').addEventListener('input', function () { S.audio.vol = parseFloat(this.value); $('#valVol').textContent = S.audio.vol.toFixed(2); });
    $('#rngFadeIn').addEventListener('input', function () { S.audio.fadeIn = parseFloat(this.value) || 0; $('#valFadeIn').textContent = S.audio.fadeIn.toFixed(1); });
    $('#rngFadeOut').addEventListener('input', function () { S.audio.fadeOut = parseFloat(this.value) || 0; $('#valFadeOut').textContent = S.audio.fadeOut.toFixed(1); });
    $('#rngVoiceVol').addEventListener('input', function () { S.audio.volVoice = parseFloat(this.value); $('#valVoiceVol').textContent = S.audio.volVoice.toFixed(2); if (voiceEl) voiceEl.volume = S.audio.volVoice; });
    $('#selGen').addEventListener('change', function () { S.audio.gen = this.value; stopGen(); if (S.playing) startGen(); });
    $('#rngGenVol').addEventListener('input', function () { S.audio.volGen = parseFloat(this.value); $('#valGenVol').textContent = S.audio.volGen.toFixed(2); });
    $('#btnRec').addEventListener('click', function () {
      var btn = this; if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status('Micro non disponible', 0, 1); return; }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        var r = new MediaRecorder(s), ch = []; r.ondataavailable = function (e) { if (e.data.size) ch.push(e.data); };
        r.onstop = function () { definirVoix(new Blob(ch, { type: r.mimeType || 'audio/webm' })); $('#btnRecStop').disabled = true; $('#btnRec').disabled = false; s.getTracks().forEach(function (t) { t.stop(); }); };
        r.start(); rec = r; btn.disabled = true; $('#btnRecStop').disabled = false; status('Enregistrement…', 1);
      }).catch(function () { status('Micro refusé', 0, 1); });
    });
    $('#btnRecStop').addEventListener('click', function () { if (rec && rec.state !== 'inactive') rec.stop(); });
    $('#btnVoiceDel').addEventListener('click', function () { voiceEl = null; voiceBlob = null; S.audio.voiceUrl = null; snap(); renderTimeline(); });
    $('#subFile').addEventListener('change', function () { var f = this.files && this.files[0]; if (!f) return; f.text().then(function (t) { var l = lireSousTitres(t); S.subs = S.subs.concat(l); snap(); renderAll(); status(l.length + ' sous-titre(s) importé(s)'); }); this.value = ''; });
    $('#btnSubAdd').addEventListener('click', function () { var t = $('#inpSubText').value.trim(); if (!t) return; S.subs.push({ id: uid(), start: Math.round(S.time * 10) / 10, dur: Math.max(0.5, parseFloat($('#inpSubDur').value) || 2.5), text: t }); $('#inpSubText').value = ''; snap(); renderAll(); });
    $('#btnSubExport').addEventListener('click', function () { if (!S.subs.length) { status('Aucun sous-titre', 0, 1); return; } var b = new Blob([versSrt()], { type: 'text/plain' }); dl(b, 'sous-titres-' + Date.now() + '.srt'); });
    $('#chkSubs').addEventListener('change', function () { S.subStyle.show = this.checked; render(S.time); });
    $('#laneSub').addEventListener('dblclick', function (e) { var b = e.target.closest('[data-sid]'); if (!b) return; S.subs = S.subs.filter(function (s) { return s.id !== b.getAttribute('data-sid'); }); snap(); renderAll(); });
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (!document.body.classList.contains('vue-montage')) return;
      if (e.code === 'Space') { e.preventDefault(); playing(!S.playing); }
      if (e.code === 'ArrowRight') { S.time = clamp(S.time + 0.5, 0, total()); sync(); render(S.time); }
      if (e.code === 'ArrowLeft') { S.time = clamp(S.time - 0.5, 0, total()); sync(); render(S.time); }
      if (e.key === 'k' || e.key === 'K') capKf();
      if (e.key === 's' || e.key === 'S') { if (!e.ctrlKey && !e.metaKey) decouper(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); dupliquer(); }
      if (e.code === 'Delete' || e.code === 'Backspace') supprimerPlan();
    });
    $('#btnPng').addEventListener('click', exportPng); $('#btnPng2').addEventListener('click', exportPng);
    $('#btnSheet').addEventListener('click', planche);
    $('#selAspect').addEventListener('change', function () { S.aspect = this.value; applySize(); snap(); render(S.time); });
    $('#selQuality').addEventListener('change', function () { S.quality = parseFloat(this.value); applySize(); render(S.time); });
    $('#selFps').addEventListener('change', function () { S.fps = parseInt(this.value, 10); applySize(); });
    $('#selBitrate').addEventListener('change', function () { S.bitrate = parseInt(this.value, 10); });
    brancherTimeline();
  }
  function capKf() { var c = clipSel(); if (!c) { status('Sélectionnez un plan', 0, 1); return; } var st = starts(), i = S.clips.indexOf(c), p = clamp((S.time - st[i]) / clipDur(c), 0, 1), tr = transform(c, p); c.kf = c.kf.filter(function (k) { return Math.abs(k.t - p) > 0.02; }); c.kf.push({ t: p, s: tr.s || 1, x: tr.tx || 0, y: tr.ty || 0, r: tr.rot || 0, o: tr.op == null ? 1 : tr.op }); c.kf.sort(function (a, b) { return a.t - b.t; }); S.selKf = c.kf.length - 1; snap(); renderAll(); status('Keyframe capturé'); }
  function apply(s) { try { var d = JSON.parse(s); S.clips = d.clips; S.texts = d.texts; S.subs = d.subs || []; S.audioTracks = d.audioTracks || []; var f = d.fx || {}; for (var k in f) S[k] = f[k]; S.clips.forEach(function (c) { var m = media(c.mid); if (m) m.supprime = false; }); if (!S.clips.some(function (c) { return c.id === S.sel; })) S.sel = S.clips[0] ? S.clips[0].id : null; renderAll(); render(S.time); } catch (e) { /* historique illisible : ignoré */ } }
  function undo() { if (hi > 0) { hi--; apply(hist[hi]); status('Annulé'); avertir('modifie'); } }
  function redo() { if (hi < hist.length - 1) { hi++; apply(hist[hi]); status('Rétabli'); avertir('modifie'); } }
  function definirMusique(blob, nom) { musicBlob = blob; if (S.audio.url) URL.revokeObjectURL(S.audio.url); S.audio.url = URL.createObjectURL(blob); S.audio.name = nom; audioEl = new Audio(S.audio.url); audioEl.loop = true; audioEl.volume = S.audio.vol; renderTimeline(); status('Musique : ' + nom); avertir('modifie'); }
  function definirVoix(blob) { voiceBlob = blob; if (S.audio.voiceUrl) URL.revokeObjectURL(S.audio.voiceUrl); S.audio.voiceUrl = URL.createObjectURL(blob); voiceEl = new Audio(S.audio.voiceUrl); voiceEl.volume = S.audio.volVoice; renderTimeline(); status('Voix off enregistrée'); avertir('modifie'); }

  function addResult(name, blob, kind, rapport) {
    var a = document.createElement('a'); a.className = 'res'; a.href = URL.createObjectURL(blob); a.download = name;
    a.innerHTML = '<span class="rik">' + esc(kind) + '</span><span class="rnm">' + esc(name) + '</span><span class="rsz">' + (blob.size / 1048576).toFixed(2) + ' Mo</span>' + (rapport ? '<span class="rok ' + (rapport.ok ? 'ok' : 'ko') + '" title="' + esc(rapport.resume) + '">' + (rapport.ok ? '✔ validé' : '⚠ à vérifier') + '</span>' : '');
    var h = $('#results'), e = h.querySelector('.empty'); if (e) e.remove(); h.prepend(a); avertir('resultat', { nom: name, blob: blob, type: kind, rapport: rapport });
  }
  function exportPng() { if (!S.clips.length) { status('Aucun plan', 0, 1); return; } render(S.time, true); cv.toBlob(function (b) { if (!b) { status('PNG impossible', 0, 1); return; } var n = 'massamba-image-' + Date.now() + '.png'; addResult(n, b, 'IMAGE'); dl(b, n); status('Image exportée'); }, 'image/png'); }
  function planche() {
    if (!S.clips.length) { status('Aucun plan', 0, 1); return; }
    var cols = Math.min(3, S.clips.length), rows = Math.ceil(S.clips.length / cols), tw = 480, th = 270, c = document.createElement('canvas'); c.width = cols * tw + 20; c.height = rows * th + 20; var g = c.getContext('2d');
    g.fillStyle = '#0B0F16'; g.fillRect(0, 0, c.width, c.height);
    S.clips.forEach(function (cl, i) { var m = media(cl.mid); if (!m) return; var x = 10 + (i % cols) * tw, y = 10 + Math.floor(i / cols) * th; try { g.drawImage(source(m), x, y, tw - 10, th - 40); } catch (e) { /* source pas prête */ } g.fillStyle = '#22D3EE'; g.font = '700 16px system-ui, sans-serif'; g.fillText((i + 1) + '. ' + (m.type === 'video' ? 'vidéo' : cl.preset) + ' · ' + clipDur(cl).toFixed(1) + 's', x + 6, y + th - 18); });
    c.toBlob(function (b) { var n = 'massamba-planche-' + Date.now() + '.png'; addResult(n, b, 'PLANCHE'); dl(b, n); }, 'image/png');
  }

  /** initialise le moteur sur la page (une seule fois). */
  function init() {
    cv = $('#cv'); ctx = cv.getContext('2d'); bufA = document.createElement('canvas'); bufB = document.createElement('canvas'); gA = bufA.getContext('2d'); gB = bufB.getContext('2d');
    applySize(); brancher(); snap(); renderAll(); render(0); last = performance.now(); requestAnimationFrame(loop);
  }

  window.MAMS = window.MAMS || {};
  window.MAMS.studio = {
    S: S, init: init, render: render, total: total, starts: starts, clipDur: clipDur, transDur: transDur, actifs: actifs, tempsSource: tempsSource, media: media,
    presets: Object.keys(PRESETS), transitions: Object.keys(TRANS), PRESETS: PRESETS, TRANS: TRANS, GRADES: GRADES, ASPECTS: ASPECTS,
    addMedia: addMedia, ajouterVideo: ajouterVideo, ajouterImage: ajouterImage, chargerVideo: chargerVideo, chargerImage: chargerImage, aUnePisteAudio: aUnePisteAudio,
    nouveauClip: nouveauClip, addText: addText, exportPng: exportPng, planche: planche, decouper: decouper, dupliquer: dupliquer, supprimerPlan: supprimerPlan, deplacerPlan: deplacerPlan,
    renderAll: renderAll, snap: snap, undo: undo, redo: redo, playing: playing, syncVideos: syncVideos, status: status, applySize: applySize, size: size, addResult: addResult, dl: dl, fmt: fmt, esc: esc,
    lireSousTitres: lireSousTitres, versSrt: versSrt, definirMusique: definirMusique, definirVoix: definirVoix, ajouterPisteAudio: ajouterPisteAudio, ajouterAudioMedia: ajouterAudioMedia, nappe: nappe, demo: demo,
    oublierMusique: function () { audioEl = null; musicBlob = null; S.audio.url = null; S.audio.name = null; }, oublierVoix: function () { voiceEl = null; voiceBlob = null; S.audio.voiceUrl = null; },
    reinitHistorique: function () { hist = []; hi = -1; snap(); },
    musique: function () { return { blob: musicBlob, el: audioEl }; }, voix: function () { return { blob: voiceBlob, el: voiceEl }; },
    ecouter: function (f) { ecouteurs.push(f); }, canvas: function () { return cv; }, etatMontage: etatMontage, libelleOrigine: libelleOrigine, clamp: clamp, uid: uid
  };
})();
