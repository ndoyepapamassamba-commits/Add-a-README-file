/* =====================================================================
   Skit Studio — 55-facerig.js
   « Gréement » facial : détection des 478 repères MediaPipe (modèle embarqué
   via CDN, exécuté localement en WASM/GPU), sélection des points de contrôle,
   anneaux d'ancrage, triangulation de Delaunay (Bowyer-Watson) et maillage
   déformable. Les parties pures (Delaunay, maillage, repli gabarit) tournent
   aussi en Node pour les tests.
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};
  const Core = NS.Core || (typeof require !== 'undefined' ? require('./00-core.js') : null);

  const FaceRig = {};

  /* ---------------- Indices canoniques MediaPipe Face Mesh ---------------- */
  FaceRig.IDX = {
    OVAL: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
    LIPS_OUTER: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
    LIPS_INNER: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
    L_EYE_UP: [246, 161, 160, 159, 158, 157, 173], L_EYE_LO: [7, 163, 144, 145, 153, 154, 155], L_EYE_C: [33, 133],
    R_EYE_UP: [466, 388, 387, 386, 385, 384, 398], R_EYE_LO: [249, 390, 373, 374, 380, 381, 382], R_EYE_C: [263, 362],
    L_BROW: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46], R_BROW: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
    NOSE: [1, 2, 98, 327, 4, 5, 195, 197, 6, 168],
    CHEEKS: [50, 280, 101, 330, 36, 266, 205, 425, 187, 411, 192, 416, 123, 352, 116, 345],
    FOREHEAD: [151, 9, 8, 69, 299, 108, 337, 104, 333],
    CHIN: 152, NOSE_TIP: 1, UPPER_LIP_MID: 13, LOWER_LIP_MID: 14, L_MOUTH: 61, R_MOUTH: 291, L_EYE_OUT: 33, R_EYE_OUT: 263
  };
  // Jaw inférieure (de gauche à droite dans l'ovale) avec poids d'ouverture
  FaceRig.JAW_WEIGHTS = { 152: 1.0, 148: 0.95, 377: 0.95, 176: 0.85, 400: 0.85, 149: 0.7, 378: 0.7, 150: 0.5, 379: 0.5, 136: 0.3, 365: 0.3, 172: 0.15, 397: 0.15 };
  // Lèvre inférieure (extérieure puis intérieure)
  FaceRig.LOWER_LIP_OUTER = [146, 91, 181, 84, 17, 314, 405, 321, 375];
  FaceRig.LOWER_LIP_INNER = [95, 88, 178, 87, 14, 317, 402, 318, 324];
  FaceRig.UPPER_LIP_OUTER = [185, 40, 39, 37, 0, 267, 269, 270, 409];
  FaceRig.UPPER_LIP_INNER = [191, 80, 81, 82, 13, 312, 311, 310, 415];
  FaceRig.INNER_BROW = { L: [107, 55, 65], R: [336, 285, 295] };
  FaceRig.OUTER_BROW = { L: [70, 63, 46, 53], R: [300, 293, 276, 283] };

  FaceRig.CONTROL = (function () {
    const I = FaceRig.IDX; const set = new Set();
    [I.OVAL, I.LIPS_OUTER, I.LIPS_INNER, I.L_EYE_UP, I.L_EYE_LO, I.L_EYE_C, I.R_EYE_UP, I.R_EYE_LO, I.R_EYE_C, I.L_BROW, I.R_BROW, I.NOSE, I.CHEEKS, I.FOREHEAD].forEach(a => a.forEach(i => set.add(i)));
    return Array.from(set);
  })();

  /* ---------------- Delaunay (Bowyer–Watson), O(n²) suffisant (< 400 pts) ---------------- */
  FaceRig.delaunay = function (pts) {
    const n = pts.length; if (n < 3) return [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const d = Math.max(maxX - minX, maxY - minY) * 20 + 1, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    const P = pts.concat([[mx - d, my - d], [mx + d, my - d], [mx, my + d]]);
    const circ = (a, b, c) => {
      const ax = P[a][0], ay = P[a][1], bx = P[b][0], by = P[b][1], cx = P[c][0], cy = P[c][1];
      const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)); if (Math.abs(D) < 1e-12) return null;
      const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
      const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
      return { x: ux, y: uy, r2: (ax - ux) * (ax - ux) + (ay - uy) * (ay - uy) };
    };
    let tris = [{ v: [n, n + 1, n + 2], c: circ(n, n + 1, n + 2) }];
    for (let i = 0; i < n; i++) {
      const px = P[i][0], py = P[i][1];
      const bad = [], keep = [];
      for (const t of tris) { const c = t.c; if (c && (px - c.x) * (px - c.x) + (py - c.y) * (py - c.y) <= c.r2 * (1 + 1e-9)) bad.push(t); else keep.push(t); }
      const edges = new Map();
      for (const t of bad) for (let e = 0; e < 3; e++) { const a = t.v[e], b = t.v[(e + 1) % 3]; const k = a < b ? a + '_' + b : b + '_' + a; edges.set(k, (edges.get(k) || 0) + 1); }
      tris = keep;
      for (const [k, cnt] of edges) { if (cnt !== 1) continue; const [a, b] = k.split('_').map(Number); const c = circ(a, b, i); if (c) tris.push({ v: [a, b, i], c }); }
    }
    return tris.filter(t => t.v.every(v => v < n)).map(t => t.v);
  };

  /**
   * Construit le maillage d'une image : points de contrôle du visage + anneaux + bord.
   * @param faces  [{ pts:[[x,y]...478], bbox:{x,y,w,h} }] en pixels image
   * @param W,H    taille de l'image
   * @returns { points:[[x,y]], tris:[[a,b,c]], dyn:Uint8Array (1 = point mobile), faceOf:Int16Array, lmIndex:Int16Array, ring:Float32Array (facteur de suivi 0..1) }
   */
  FaceRig.buildMesh = function (faces, W, H) {
    const points = [], dyn = [], faceOf = [], lmIndex = [], ring = [];
    const add = (x, y, d, f, li, r) => { points.push([Core.clamp(x, 0, W), Core.clamp(y, 0, H)]); dyn.push(d); faceOf.push(f); lmIndex.push(li); ring.push(r); return points.length - 1; };
    faces.forEach((face, fi) => {
      FaceRig.CONTROL.forEach(li => { const p = face.pts[li]; add(p[0], p[1], 1, fi, li, 1); });
      const b = face.bbox, cx = b.x + b.w / 2, cy = b.y + b.h * 0.5;
      // anneau proche (cheveux/cou) : suit à 55 % ; anneau lointain : statique
      for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; add(cx + Math.cos(a) * b.w * 0.8, cy + Math.sin(a) * b.h * 0.78, 1, fi, -1, 0.55); }
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2 + 0.2; add(cx + Math.cos(a) * b.w * 1.25, cy + Math.sin(a) * b.h * 1.15, 0, fi, -1, 0); }
    });
    // bords de l'image
    const steps = 6;
    for (let i = 0; i <= steps; i++) { const u = i / steps; add(u * W, 0, 0, -1, -1, 0); add(u * W, H, 0, -1, -1, 0); if (i > 0 && i < steps) { add(0, u * H, 0, -1, -1, 0); add(W, u * H, 0, -1, -1, 0); } }
    // dé-duplication grossière (points confondus) pour la robustesse de Delaunay
    const seen = new Map(); const keep = [];
    points.forEach((p, i) => { const k = Math.round(p[0] * 2) + '_' + Math.round(p[1] * 2); if (!seen.has(k)) { seen.set(k, i); keep.push(i); } });
    const remap = new Map(keep.map((old, j) => [old, j]));
    const P = keep.map(i => points[i]);
    const tris = FaceRig.delaunay(P);
    const out = { points: P, tris, dyn: Uint8Array.from(keep.map(i => dyn[i])), faceOf: Int16Array.from(keep.map(i => faceOf[i])), lmIndex: Int16Array.from(keep.map(i => lmIndex[i])), ring: Float32Array.from(keep.map(i => ring[i])) };
    out.dynTris = tris.filter(t => t.some(v => out.dyn[v]));
    out.lookup = faces.map(() => new Map());
    out.faceOf.forEach((f, i) => { if (f >= 0 && out.lmIndex[i] >= 0) out.lookup[f].set(out.lmIndex[i], i); });
    void remap;
    return out;
  };

  /** Boîte englobante + métriques d'un visage à partir de 478 points. */
  FaceRig.metrics = function (pts) {
    const I = FaceRig.IDX;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    I.OVAL.forEach(i => { const p = pts[i]; if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; });
    const bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    const lm = pts[I.L_MOUTH], rm = pts[I.R_MOUTH];
    const mouthW = Math.hypot(rm[0] - lm[0], rm[1] - lm[1]);
    const mouthC = [(lm[0] + rm[0]) / 2, (pts[I.UPPER_LIP_MID][1] + pts[I.LOWER_LIP_MID][1]) / 2];
    const le = pts[I.L_EYE_OUT], re = pts[I.R_EYE_OUT];
    const eyeDist = Math.hypot(re[0] - le[0], re[1] - le[1]);
    const roll = Math.atan2(re[1] - le[1], re[0] - le[0]);
    const chin = pts[I.CHIN];
    const pivot = [(bbox.x + bbox.w / 2), chin[1] + bbox.h * 0.35];
    return { bbox, mouthW, mouthC, eyeDist, roll, pivot, center: [bbox.x + bbox.w / 2, bbox.y + bbox.h / 2] };
  };

  /* ---------------- Gabarit de repli (sans MediaPipe) ----------------
     Positions normalisées d'un visage de face (sous-ensemble utile), dans un
     repère où (0,0) = centre des yeux, 1 = distance inter-pupilles. */
  FaceRig.TEMPLATE = (function () {
    const T = {};
    const set = (i, x, y) => { T[i] = [x, y]; };
    // ovale
    const ov = FaceRig.IDX.OVAL; const n = ov.length;
    for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + k / n * Math.PI * 2; set(ov[k], Math.cos(a) * 1.05, 0.35 + Math.sin(a) * 1.35); }
    // yeux
    const eye = (cx, up, lo, c) => { up.forEach((i, k) => set(i, cx - 0.3 + k / (up.length - 1) * 0.6, -0.1)); lo.forEach((i, k) => set(i, cx - 0.3 + k / (lo.length - 1) * 0.6, 0.1)); set(c[0], cx - 0.36, 0); set(c[1], cx + 0.36, 0); };
    eye(-0.5, FaceRig.IDX.L_EYE_UP, FaceRig.IDX.L_EYE_LO, FaceRig.IDX.L_EYE_C); eye(0.5, FaceRig.IDX.R_EYE_UP, FaceRig.IDX.R_EYE_LO, FaceRig.IDX.R_EYE_C);
    FaceRig.IDX.L_BROW.forEach((i, k) => set(i, -0.95 + (k % 5) / 4 * 0.9, -0.42 - (k >= 5 ? 0.08 : 0)));
    FaceRig.IDX.R_BROW.forEach((i, k) => set(i, 0.95 - (k % 5) / 4 * 0.9, -0.42 - (k >= 5 ? 0.08 : 0)));
    FaceRig.IDX.NOSE.forEach((i, k) => set(i, (k % 2 ? 0.15 : -0.15) * (k < 4 ? 1 : 0.4), 0.2 + k * 0.08));
    FaceRig.IDX.CHEEKS.forEach((i, k) => set(i, (k % 2 ? 0.7 : -0.7) + (k > 7 ? 0.15 : 0), 0.45 + Math.floor(k / 2) * 0.12));
    FaceRig.IDX.FOREHEAD.forEach((i, k) => set(i, -0.6 + k / 8 * 1.2, -0.75));
    const lipRing = (ids, w, yTop, yBot) => { const m = ids.length; ids.forEach((i, k) => { const a = Math.PI + k / m * Math.PI * 2; set(i, Math.cos(a) * w, 1.0 + (Math.sin(a) > 0 ? yBot : yTop) * Math.abs(Math.sin(a))); }); };
    lipRing(FaceRig.IDX.LIPS_OUTER, 0.45, 0.12, 0.18); lipRing(FaceRig.IDX.LIPS_INNER, 0.33, 0.03, 0.05);
    return T;
  })();

  /**
   * Fabrique 478 points approximatifs depuis des ancres manuelles :
   * { leftEye:[x,y], rightEye:[x,y], mouth:[x,y] } (pixels).
   */
  FaceRig.fromAnchors = function (anchors) {
    const L = anchors.leftEye, R = anchors.rightEye, M = anchors.mouth;
    const cx = (L[0] + R[0]) / 2, cy = (L[1] + R[1]) / 2;
    const ipd = Math.hypot(R[0] - L[0], R[1] - L[1]) || 1;
    const roll = Math.atan2(R[1] - L[1], R[0] - L[0]);
    const my = ((M[1] - cy) * Math.cos(roll) - (M[0] - cx) * Math.sin(roll)) / ipd; // distance yeux→bouche normalisée
    const sy = my / 1.0; // le gabarit place la bouche à y = 1.0
    const pts = new Array(478);
    const cos = Math.cos(roll), sin = Math.sin(roll);
    for (let i = 0; i < 478; i++) {
      const t = FaceRig.TEMPLATE[i] || [0, 0.4];
      const x = t[0] * ipd, y = t[1] * ipd * sy;
      pts[i] = [cx + x * cos - y * sin, cy + x * sin + y * cos];
    }
    return pts;
  };

  /* ---------------- Détection MediaPipe (navigateur) ---------------- */
  let _mp = null, _landmarker = null, _loading = null;
  FaceRig.MP_VERSION = '1.2.2';
  FaceRig.available = () => !!_landmarker;
  FaceRig.load = function () {
    if (_landmarker) return Promise.resolve(_landmarker);
    if (_loading) return _loading;
    _loading = (async () => {
      const base = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${FaceRig.MP_VERSION}`;
      _mp = await import(base + '/vision_bundle.mjs');
      const vision = await _mp.FilesetResolver.forVisionTasks(base + '/wasm');
      const mk = (delegate) => _mp.FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task', delegate },
        runningMode: 'IMAGE', numFaces: 3, outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.35, minFacePresenceConfidence: 0.35
      });
      try { _landmarker = await mk('GPU'); FaceRig.delegate = 'GPU'; } catch (e) { _landmarker = await mk('CPU'); FaceRig.delegate = 'CPU'; }
      return _landmarker;
    })();
    _loading.catch(() => { _loading = null; });
    return _loading;
  };

  /**
   * Détecte les visages d'une image (HTMLImageElement/Canvas/ImageBitmap).
   * @returns [{ pts:[[x,y]×478], blend:{name:score}, ...metrics }] triés de gauche à droite
   */
  FaceRig.detect = async function (source) {
    const lm = await FaceRig.load();
    const W = source.naturalWidth || source.width, H = source.naturalHeight || source.height;
    // Dessin sur canvas (évite les problèmes d'origine WebGL) et limite la taille d'analyse
    const scale = Math.min(1, 1024 / Math.max(W, H));
    const cv = document.createElement('canvas'); cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
    cv.getContext('2d').drawImage(source, 0, 0, cv.width, cv.height);
    let res;
    try { res = lm.detect(cv); }
    catch (e) { if (FaceRig.delegate === 'GPU') { _landmarker = null; _loading = null; FaceRig.delegate = 'CPU'; const vision = await _mp.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${FaceRig.MP_VERSION}/wasm`); _landmarker = await _mp.FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task', delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 3, outputFaceBlendshapes: true }); res = _landmarker.detect(cv); } else throw e; }
    const faces = (res.faceLandmarks || []).map((lmk, k) => {
      const pts = lmk.map(p => [p.x * W, p.y * H]);
      const blend = {}; const cats = res.faceBlendshapes && res.faceBlendshapes[k] ? res.faceBlendshapes[k].categories : []; cats.forEach(c => { blend[c.categoryName] = c.score; });
      return Object.assign({ pts, blend, source: 'mediapipe' }, FaceRig.metrics(pts));
    });
    faces.sort((a, b) => a.center[0] - b.center[0]);
    return faces;
  };

  /** Visage de repli : gabarit centré dans le tiers supérieur de l'image (quand aucun visage n'est trouvé). */
  FaceRig.fallbackFace = function (W, H, slot) {
    const cx = slot === 'left' ? W * 0.3 : slot === 'right' ? W * 0.7 : W * 0.5;
    const ipd = slot ? W * 0.075 : W * 0.16;
    const cy = slot ? H * 0.36 : H * 0.42;
    const pts = FaceRig.fromAnchors({ leftEye: [cx - ipd / 2, cy], rightEye: [cx + ipd / 2, cy], mouth: [cx, cy + ipd * 1.0] });
    return Object.assign({ pts, blend: {}, source: 'template' }, FaceRig.metrics(pts));
  };

  NS.FaceRig = FaceRig;
  if (typeof module !== 'undefined' && module.exports) module.exports = FaceRig;
})(typeof window !== 'undefined' ? window : globalThis);
