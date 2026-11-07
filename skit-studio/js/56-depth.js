/* =====================================================================
   Skit Studio — 56-depth.js
   Cartes de profondeur pour la parallaxe 2.5D :
     - synthétique (instantanée) : déduite des visages détectés
     - IA (Depth Anything v2 small via Transformers.js, WebGPU/WASM), optionnelle
   Sortie : canvas niveaux de gris (blanc = proche).
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};
  const Core = NS.Core;

  const Depth = {};
  Depth.TF_VERSION = '4.3.2';
  Depth.MODEL = 'onnx-community/depth-anything-v2-small';
  let _pipe = null, _loading = null;
  Depth.device = null;

  /** Profondeur synthétique : visages + buste proches, fond lointain avec dégradé. */
  Depth.synthetic = function (W, H, faces) {
    const s = 0.25; const w = Math.max(32, Math.round(W * s)), h = Math.max(32, Math.round(H * s));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#262626'); g.addColorStop(1, '#5a5a5a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    (faces || []).forEach(f => {
      const b = f.bbox; const cx = (b.x + b.w / 2) * s, cy = (b.y + b.h / 2) * s, rx = b.w * 0.95 * s, ry = b.h * 0.9 * s;
      // buste
      const bg = ctx.createLinearGradient(0, cy, 0, h); bg.addColorStop(0, '#d8d8d8'); bg.addColorStop(1, '#b0b0b0');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(cx - rx * 1.1, cy + ry * 0.6); ctx.lineTo(cx + rx * 1.1, cy + ry * 0.6); ctx.lineTo(cx + rx * 2.6, h); ctx.lineTo(cx - rx * 2.6, h); ctx.closePath(); ctx.fill();
      // tête
      const rg = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.5, cx, cy, Math.max(rx, ry) * 1.5);
      rg.addColorStop(0, '#f4f4f4'); rg.addColorStop(0.6, '#e0e0e0'); rg.addColorStop(1, 'rgba(120,120,120,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.5, ry * 1.5, 0, 0, Math.PI * 2); ctx.fill();
    });
    // flou doux
    try { const out = document.createElement('canvas'); out.width = w; out.height = h; const o = out.getContext('2d'); o.filter = 'blur(' + Math.round(w * 0.03) + 'px)'; o.drawImage(cv, 0, 0); return out; } catch (e) { return cv; }
  };

  Depth.available = () => !!_pipe;
  Depth.load = function () {
    if (_pipe) return Promise.resolve(_pipe);
    if (_loading) return _loading;
    _loading = (async () => {
      const tf = await import(`https://cdn.jsdelivr.net/npm/@huggingface/transformers@${Depth.TF_VERSION}`);
      tf.env.allowLocalModels = false;
      Depth._tf = tf;
      try { _pipe = await tf.pipeline('depth-estimation', Depth.MODEL, { device: 'webgpu' }); Depth.device = 'webgpu'; }
      catch (e) { _pipe = await tf.pipeline('depth-estimation', Depth.MODEL, { device: 'wasm' }); Depth.device = 'wasm'; }
      return _pipe;
    })();
    _loading.catch(() => { _loading = null; });
    return _loading;
  };

  /** Profondeur IA depuis un Blob image ; renvoie un canvas (blanc = proche). */
  Depth.estimate = async function (blob) {
    const pipe = await Depth.load();
    const raw = await Depth._tf.RawImage.fromBlob(blob);
    const out = await pipe(raw);
    const d = out.depth; const cv = document.createElement('canvas'); cv.width = d.width; cv.height = d.height;
    const ctx = cv.getContext('2d'); const id = ctx.createImageData(d.width, d.height);
    for (let i = 0, j = 0; i < d.data.length; i++, j += 4) { const v = d.data[i]; id.data[j] = v; id.data[j + 1] = v; id.data[j + 2] = v; id.data[j + 3] = 255; }
    ctx.putImageData(id, 0, 0);
    return cv;
  };

  NS.Depth = Depth;
})(typeof window !== 'undefined' ? window : globalThis);
