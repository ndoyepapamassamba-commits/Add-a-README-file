/* =====================================================================
   Skit Studio — 60-animator.js
   MOTEUR D'ANIMATION MAISON : anime de vraies images (IA ou importées).
     • préparation d'une image : visages (MediaPipe) → maillage déformable,
       profondeur (synthétique ou IA) ; mise en cache par clé
     • pose par image/instant : mâchoire & visèmes pilotés par l'audio,
       clignements, sourcils/émotions, micro-mouvements de tête, écoute
     • rendu : déformation (57-warp), cavité buccale (dents, langue),
       parallaxe 2.5D + caméra (zoom, pan, coup de zoom, secousse)
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};
  const Core = NS.Core, FaceRig = NS.FaceRig, Warp = NS.Warp, Depth = NS.Depth, Assets = NS.Assets;

  const Animator = {};
  const cache = new Map(); // key → asset
  Animator.options = { parallax: true, depthAI: false, strength: 1 };

  /* ------------------------------------------------------------------
     Préparation d'une image
     ------------------------------------------------------------------ */
  /**
   * @param key      identifiant unique (url ou hash)
   * @param img      HTMLImageElement décodé
   * @param opts     { expectFaces: 1|2, blob?: Blob (pour la profondeur IA) }
   */
  Animator.prepare = async function (key, img, opts) {
    opts = opts || {};
    if (cache.has(key)) return cache.get(key);
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    let faces = [];
    try { faces = await FaceRig.detect(img); } catch (e) { console.warn('MediaPipe indisponible, gabarit de repli :', e.message); }
    // ne garder que les visages significatifs
    faces = faces.filter(f => f.bbox.w > W * 0.06).slice(0, 2);
    const expect = opts.expectFaces || 1;
    if (!faces.length) faces = expect === 2 ? [FaceRig.fallbackFace(W, H, 'left'), FaceRig.fallbackFace(W, H, 'right')] : [FaceRig.fallbackFace(W, H)];
    faces.sort((a, b) => a.center[0] - b.center[0]);
    const mesh = FaceRig.buildMesh(faces, W, H);
    const src = new Float32Array(mesh.points.length * 2);
    mesh.points.forEach((p, i) => { src[i * 2] = p[0]; src[i * 2 + 1] = p[1]; });
    // groupes de points par visage pour la pose
    const groups = faces.map((f, fi) => Animator._groups(mesh, fi));
    let depth = null;
    if (Animator.options.depthAI && opts.blob) { try { depth = await Depth.estimate(opts.blob); } catch (e) { console.warn('Profondeur IA indisponible :', e.message); } }
    if (!depth) depth = Depth.synthetic(W, H, faces);
    const warpCanvas = document.createElement('canvas'); warpCanvas.width = W; warpCanvas.height = H;
    const asset = { key, img, W, H, faces, mesh, src, dst: new Float32Array(src), groups, depth, warpCanvas, ready: true };
    cache.set(key, asset);
    return asset;
  };
  Animator.get = (key) => cache.get(key) || null;
  Animator.clear = () => cache.clear();

  Animator._groups = function (mesh, fi) {
    const L = mesh.lookup[fi]; const I = FaceRig.IDX;
    const idx = (arr) => arr.map(i => L.get(i)).filter(v => v != null);
    const pairs = (up, lo) => up.map((u, k) => [L.get(u), L.get(lo[k])]).filter(p => p[0] != null && p[1] != null);
    const jaw = []; Object.keys(FaceRig.JAW_WEIGHTS).forEach(k => { const i = L.get(+k); if (i != null) jaw.push([i, FaceRig.JAW_WEIGHTS[k]]); });
    return {
      all: [], jaw,
      lowerLipOuter: idx(FaceRig.LOWER_LIP_OUTER), lowerLipInner: idx(FaceRig.LOWER_LIP_INNER),
      upperLipOuter: idx(FaceRig.UPPER_LIP_OUTER), upperLipInner: idx(FaceRig.UPPER_LIP_INNER),
      lips: idx(I.LIPS_OUTER.concat(I.LIPS_INNER)), corners: idx([I.L_MOUTH, I.R_MOUTH]),
      lEye: pairs(I.L_EYE_UP, I.L_EYE_LO), rEye: pairs(I.R_EYE_UP, I.R_EYE_LO),
      lBrow: idx(I.L_BROW), rBrow: idx(I.R_BROW), lBrowIn: idx(FaceRig.INNER_BROW.L), rBrowIn: idx(FaceRig.INNER_BROW.R), lBrowOut: idx(FaceRig.OUTER_BROW.L), rBrowOut: idx(FaceRig.OUTER_BROW.R),
      cheeks: idx(I.CHEEKS), forehead: idx(I.FOREHEAD), innerLipsPoly: idx(I.LIPS_INNER), outerLipsPoly: idx(I.LIPS_OUTER)
    };
  };

  /* ------------------------------------------------------------------
     Émotions → cibles de pose
     ------------------------------------------------------------------ */
  Animator.EMOTION = {
    neutral: { browUp: 0, browIn: 0, eyeWide: 0, smile: 0.05, openBias: 0, squint: 0 },
    happy: { browUp: 0.15, browIn: -0.1, eyeWide: 0, smile: 0.9, openBias: 0.1, squint: 0.25 },
    angry: { browUp: -0.2, browIn: 0.9, eyeWide: 0.1, smile: -0.4, openBias: 0.15, squint: 0.3 },
    shocked: { browUp: 1, browIn: -0.1, eyeWide: 1, smile: -0.1, openBias: 0.45, squint: 0 },
    sad: { browUp: 0.35, browIn: 0.5, eyeWide: -0.2, smile: -0.6, openBias: 0, squint: 0.1 },
    smug: { browUp: 0.45, browIn: -0.4, eyeWide: -0.1, smile: 0.55, openBias: 0, squint: 0.4, asym: 1 },
    confused: { browUp: 0.5, browIn: 0.3, eyeWide: 0.2, smile: -0.15, openBias: 0.1, squint: 0.15, asym: -1 }
  };

  /* ------------------------------------------------------------------
     Visèmes à partir du texte (classe vocalique par syllabe)
     ------------------------------------------------------------------ */
  Animator.visemes = function (text) {
    const syl = Core.syllables(text);
    const words = Core.stripMarks(text).toLowerCase().split(/\s+/).filter(Boolean);
    const out = []; let wi = 0, prevWord = null;
    syl.forEach(s => {
      if (s.word !== prevWord) { prevWord = s.word; wi++; }
      const groups = s.word.match(/[aeiouyàâäéèêëîïôöùûüœ]+/g) || ['a'];
      const g = groups[Math.min(s.index, groups.length - 1)];
      let cls = 'A';
      if (/ou|u|o|ô|au|eau|on|om/.test(g)) cls = 'O'; else if (/i|y|é|è|ê|ë|e|ai|ei/.test(g)) cls = 'E';
      const closed = /^[mbp]/.test(s.word) && s.index === 0;
      out.push({ cls, open: cls === 'O' ? 0.8 : cls === 'E' ? 0.55 : 1, spread: cls === 'E' ? 0.7 : cls === 'O' ? -0.6 : 0.1, closed, weight: 1 + (s.count === 1 ? 0.3 : 0) });
    });
    void words;
    return out.length ? out : [{ cls: 'A', open: 1, spread: 0, closed: false, weight: 1 }];
  };

  /**
   * Amplitude de bouche à l'instant t (s depuis le début de la parole).
   * @param env     Float32Array enveloppe par image (fps) ou null
   * @param vis     visèmes
   * @param spoken  durée de parole (s)
   */
  Animator.mouthAt = function (t, env, fps, vis, spoken) {
    if (t < 0 || t > spoken + 0.1) return { jaw: 0, spread: 0 };
    const n = vis.length; const total = vis.reduce((a, v) => a + v.weight, 0);
    let acc = 0, k = 0, phase = 0;
    for (k = 0; k < n; k++) { const d = vis[k].weight / total * spoken; if (t < acc + d) { phase = (t - acc) / d; break; } acc += d; }
    if (k >= n) { k = n - 1; phase = 1; }
    const v = vis[k];
    let amp;
    if (env && env.length) {
      const f = Math.min(env.length - 1, Math.max(0, Math.floor(t * fps)));
      // lissage sur 3 images
      amp = (env[Math.max(0, f - 1)] + env[f] * 2 + env[Math.min(env.length - 1, f + 1)]) / 4;
      amp = Core.clamp(amp * 1.25, 0, 1);
    } else {
      amp = Math.sin(Math.PI * Core.clamp(phase, 0, 1)) * 0.85;
    }
    const closeDip = v.closed ? Core.clamp(1 - phase * 4, 0, 1) : 0; // lèvres fermées au début des m/b/p
    const jaw = Core.clamp(amp * v.open * (1 - closeDip), 0, 1);
    return { jaw, spread: v.spread * Core.clamp(amp * 1.5, 0, 1) };
  };

  /* ------------------------------------------------------------------
     Pose → positions de destination
     ------------------------------------------------------------------ */
  /**
   * state par visage : { jaw, spread, blink, emotion, intensity, head:{rot,dx,dy}, hit }
   */
  Animator.computeDst = function (asset, states) {
    const src = asset.src, dst = asset.dst; dst.set(src);
    const mesh = asset.mesh;
    asset.faces.forEach((face, fi) => {
      const st = states[fi]; if (!st) return;
      const g = asset.groups[fi]; const E = Animator.EMOTION[st.emotion] || Animator.EMOTION.neutral; const k = st.intensity == null ? 1 : st.intensity;
      const mW = face.mouthW, eD = face.eyeDist, mc = face.mouthC;
      const openPx = mW * (0.42 + 0.2 * E.openBias) * st.jaw;
      // --- mâchoire / lèvre inférieure
      g.jaw.forEach(([i, w]) => { dst[i * 2 + 1] += openPx * w * 0.9; });
      g.lowerLipOuter.forEach(i => { dst[i * 2 + 1] += openPx * 0.95; });
      g.lowerLipInner.forEach(i => { dst[i * 2 + 1] += openPx * 1.05; });
      g.upperLipOuter.forEach(i => { dst[i * 2 + 1] -= openPx * 0.12; });
      g.upperLipInner.forEach(i => { dst[i * 2 + 1] -= openPx * 0.18; });
      // --- étirement / sourire
      const smile = (E.smile * k * 0.5 + (st.smile || 0)) ; const spread = st.spread || 0;
      g.lips.forEach(i => { dst[i * 2] += (src[i * 2] - mc[0]) * (spread * 0.16 + smile * 0.08); });
      g.corners.forEach(i => { dst[i * 2 + 1] -= smile * mW * 0.09; dst[i * 2] += (src[i * 2] - mc[0]) * 0.06 * smile; });
      g.cheeks.forEach(i => { if (src[i * 2 + 1] > mc[1] - eD * 0.9) dst[i * 2 + 1] -= Math.max(0, smile) * eD * 0.04 + st.jaw * eD * 0.01; });
      // --- yeux : clignement + ouverture + plissement
      const lid = Core.clamp(st.blink || 0, 0, 1);
      const wide = (E.eyeWide * k + (st.hit || 0) * 0.4);
      [g.lEye, g.rEye].forEach(pairs => pairs.forEach(([u, l]) => {
        const uy = src[u * 2 + 1], ly = src[l * 2 + 1];
        let y = uy - wide * eD * 0.035 + E.squint * k * (ly - uy) * 0.35;
        y = y + (ly - y) * lid * 0.92;
        dst[u * 2 + 1] = y;
        dst[l * 2 + 1] = ly + E.squint * k * (uy - ly) * 0.15 - lid * (ly - uy) * 0.08;
      }));
      // --- sourcils
      const up = (E.browUp * k + (st.hit || 0) * 0.5) * eD * 0.07, inn = E.browIn * k * eD * 0.06;
      const asym = E.asym || 0;
      g.lBrow.forEach(i => { dst[i * 2 + 1] -= up * (1 + 0.5 * asym); });
      g.rBrow.forEach(i => { dst[i * 2 + 1] -= up * (1 - 0.5 * asym); });
      g.lBrowIn.forEach(i => { dst[i * 2 + 1] += inn; dst[i * 2] += inn * 0.3; });
      g.rBrowIn.forEach(i => { dst[i * 2 + 1] += inn; dst[i * 2] -= inn * 0.3; });
      g.lBrowOut.forEach(i => { dst[i * 2 + 1] -= inn * 0.25; });
      g.rBrowOut.forEach(i => { dst[i * 2 + 1] -= inn * 0.25; });
      // le front suit à moitié pour éviter tout retournement de triangle
      g.forehead.forEach(i => { dst[i * 2 + 1] -= up * 0.5; });
      // --- tête : rotation autour du pivot (cou) + translation, pondérée par l'anneau
      const h = st.head || { rot: 0, dx: 0, dy: 0 };
      const cs = Math.cos(h.rot), sn = Math.sin(h.rot), px = face.pivot[0], py = face.pivot[1];
      for (let i = 0; i < mesh.points.length; i++) {
        if (mesh.faceOf[i] !== fi || !mesh.dyn[i]) continue;
        const r = mesh.ring[i]; if (r <= 0) continue;
        const x = dst[i * 2] - px, y = dst[i * 2 + 1] - py;
        const rx = x * cs - y * sn + px + h.dx, ry = x * sn + y * cs + py + h.dy;
        dst[i * 2] = src[i * 2] + (rx - src[i * 2]) * r + (dst[i * 2] - src[i * 2]) * (1 - r);
        dst[i * 2 + 1] = src[i * 2 + 1] + (ry - src[i * 2 + 1]) * r + (dst[i * 2 + 1] - src[i * 2 + 1]) * (1 - r);
      }
    });
    return dst;
  };

  /* ------------------------------------------------------------------
     Cavité buccale (dents, langue) dessinée dans le polygone des lèvres internes
     ------------------------------------------------------------------ */
  Animator.drawMouthCavity = function (ctx, asset, fi, jaw) {
    if (jaw < 0.06) return;
    const g = asset.groups[fi], dst = asset.dst, face = asset.faces[fi];
    const poly = g.innerLipsPoly; if (poly.length < 6) return;
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    poly.forEach(i => { const x = dst[i * 2], y = dst[i * 2 + 1]; if (y < minY) minY = y; if (y > maxY) maxY = y; if (x < minX) minX = x; if (x > maxX) maxX = x; });
    const h = maxY - minY, w = maxX - minX; if (h < 2) return;
    const alpha = Core.clamp((jaw - 0.06) / 0.2, 0, 1);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.beginPath(); poly.forEach((i, k) => { const x = dst[i * 2], y = dst[i * 2 + 1]; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); ctx.clip();
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const rg = ctx.createRadialGradient(cx, cy + h * 0.3, h * 0.1, cx, cy, Math.max(w, h));
    rg.addColorStop(0, '#2a0a0a'); rg.addColorStop(0.7, '#4a1212'); rg.addColorStop(1, '#5c1a1a');
    ctx.fillStyle = rg; ctx.fillRect(minX - 2, minY - 2, w + 4, h + 4);
    // dents du haut
    const th = Math.min(h * 0.48, face.mouthW * 0.16);
    const tg = ctx.createLinearGradient(0, minY, 0, minY + th); tg.addColorStop(0, '#fffdf7'); tg.addColorStop(1, '#e8e2d6');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(minX, minY - 1); ctx.lineTo(maxX, minY - 1); ctx.quadraticCurveTo(maxX, minY + th, cx + w * 0.3, minY + th); ctx.lineTo(cx - w * 0.3, minY + th); ctx.quadraticCurveTo(minX, minY + th, minX, minY - 1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(120,100,90,.35)'; ctx.lineWidth = Math.max(0.6, w * 0.006);
    const nT = 6; for (let k = 1; k < nT; k++) { const x = minX + w * (0.12 + 0.76 * k / nT); ctx.beginPath(); ctx.moveTo(x, minY); ctx.lineTo(x, minY + th * 0.85); ctx.stroke(); }
    // langue
    if (jaw > 0.35) { ctx.globalAlpha = alpha * Core.clamp((jaw - 0.35) / 0.3, 0, 1); ctx.fillStyle = '#c84a5a'; ctx.beginPath(); ctx.ellipse(cx, maxY + h * 0.05, w * 0.32, h * 0.32, 0, Math.PI, 0); ctx.fill(); }
    ctx.restore();
  };

  /* ------------------------------------------------------------------
     Rendu d'un plan animé
     ------------------------------------------------------------------ */
  let _parallax = null, _parallaxKey = '';
  Animator.parallaxFor = function (W, H) {
    const key = W + 'x' + H;
    if (!_parallax || _parallaxKey !== key) { _parallax = new Warp.Parallax(W, H); _parallaxKey = key; }
    return _parallax.ok ? _parallax : null;
  };

  /**
   * Dessine un plan animé sur ctx (W×H).
   * @param shot { asset, states:[...], camera:{ zoom, pan:[x,y], off:[x,y], dzoom, strength }, shake:[dx,dy] }
   */
  Animator.renderShot = function (ctx, W, H, shot) {
    const asset = shot.asset;
    Animator.computeDst(asset, shot.states);
    const wc = asset.warpCanvas, wctx = wc.getContext('2d');
    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.drawImage(asset.img, 0, 0, asset.W, asset.H);
    Warp.drawMesh(wctx, asset.img, asset.src, asset.dst, asset.mesh.dynTris, 0.7);
    shot.states.forEach((st, fi) => { if (st && st.jaw > 0) Animator.drawMouthCavity(wctx, asset, fi, st.jaw); });
    const cam = shot.camera || {};
    ctx.save();
    if (shot.shake) ctx.translate(shot.shake[0], shot.shake[1]);
    const par = Animator.options.parallax ? Animator.parallaxFor(W, H) : null;
    if (par) {
      const out = par.render(wc, asset.depth, { zoom: cam.zoom || 1, pan: cam.pan || [0, 0], off: cam.off || [0, 0], strength: (cam.strength == null ? 1 : cam.strength) * Animator.options.strength, dzoom: cam.dzoom || 0 });
      ctx.drawImage(out, 0, 0, W, H);
    } else {
      Warp.drawCover(ctx, wc, W, H, { zoom: cam.zoom || 1, pan: cam.pan || [0, 0] });
    }
    ctx.restore();
  };

  /* ------------------------------------------------------------------
     Fabrique d'états par visage pour une réplique
     ------------------------------------------------------------------ */
  /**
   * @param ctx { t (s depuis début du segment), seg, asset, speakerFace (index), listenerEmotion, env, fps, vis, rng seed }
   */
  Animator.statesForLine = function (p) {
    const { t, seg, asset } = p;
    const states = [];
    const tSpeech = t - 0.05; // l'audio démarre 50 ms après la coupe
    const ease = Core.easeOutCubic(Core.clamp(t / 0.28, 0, 1));
    asset.faces.forEach((face, fi) => {
      const isSpeaker = fi === p.speakerFace;
      const seed = Core.hashString(asset.key + ':' + fi);
      // clignements : toutes les ~3,3 s avec variation déterministe
      const period = 2.6 + ((seed % 100) / 100) * 1.6; const ph = (t + (seed % 17) * 0.37) % period;
      const blink = ph < 0.16 ? Math.sin(ph / 0.16 * Math.PI) : 0;
      const sway = 0.012 * Math.sin(t * 1.4 + seed) + 0.008 * Math.sin(t * 2.3 + seed * 0.5);
      let st;
      if (isSpeaker) {
        const m = Animator.mouthAt(tSpeech, p.env, p.fps, p.vis, seg.spoken);
        const nod = m.jaw * 0.012 + 0.004 * Math.sin(t * 9);
        const hit = seg.punch ? Math.max(0, 1 - t / 0.45) : 0;
        st = { jaw: m.jaw, spread: m.spread, blink, emotion: seg.emotion, intensity: ease, hit: hit * ease,
          head: { rot: sway + (seg.punch ? 0.02 * (1 - ease) : 0), dx: face.eyeDist * (0.02 * Math.sin(t * 1.1 + seed)), dy: face.eyeDist * (nod * 2 - 0.01 * hit) } };
      } else {
        const reaction = p.listenerEmotion || 'neutral';
        st = { jaw: 0, spread: 0, blink, emotion: reaction, intensity: ease * 0.8, hit: 0,
          head: { rot: sway * 0.8, dx: face.eyeDist * 0.012 * Math.sin(t * 0.9 + seed), dy: face.eyeDist * 0.008 * Math.sin(t * 1.7 + seed) } };
      }
      states.push(st);
    });
    return states;
  };

  NS.Animator = Animator;
})(typeof window !== 'undefined' ? window : globalThis);
