/* =====================================================================
   Skit Studio — 57-warp.js
   1) Déformation d'image par maillage triangulaire (affine par triangle,
      Canvas 2D, découpe élargie anti-coutures).
   2) Parallaxe 2.5D en WebGL : déplacement des pixels selon la carte de
      profondeur + zoom/pan « Ken Burns » ; repli Canvas 2D sans WebGL.
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};
  const Warp = {};

  /** Matrice affine M (a,b,c,d,e,f) telle que M·src_i = dst_i pour 3 points. */
  Warp.affine = function (s0, s1, s2, d0, d1, d2) {
    const x0 = s0[0], y0 = s0[1], x1 = s1[0], y1 = s1[1], x2 = s2[0], y2 = s2[1];
    const det = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
    if (Math.abs(det) < 1e-9) return null;
    const a = (d0[0] * (y1 - y2) + d1[0] * (y2 - y0) + d2[0] * (y0 - y1)) / det;
    const c = (d0[0] * (x2 - x1) + d1[0] * (x0 - x2) + d2[0] * (x1 - x0)) / det;
    const e = (d0[0] * (x1 * y2 - x2 * y1) + d1[0] * (x2 * y0 - x0 * y2) + d2[0] * (x0 * y1 - x1 * y0)) / det;
    const b = (d0[1] * (y1 - y2) + d1[1] * (y2 - y0) + d2[1] * (y0 - y1)) / det;
    const d = (d0[1] * (x2 - x1) + d1[1] * (x0 - x2) + d2[1] * (x1 - x0)) / det;
    const f = (d0[1] * (x1 * y2 - x2 * y1) + d1[1] * (x2 * y0 - x0 * y2) + d2[1] * (x0 * y1 - x1 * y0)) / det;
    return [a, b, c, d, e, f];
  };

  /**
   * Dessine les triangles `tris` de `img` déformés de src → dst sur ctx (repère image).
   * src/dst : Float32Array plates [x0,y0,x1,y1,...]. pad : élargissement de la découpe (px).
   */
  Warp.drawMesh = function (ctx, img, src, dst, tris, pad) {
    pad = pad == null ? 0.7 : pad;
    for (let k = 0; k < tris.length; k++) {
      const t = tris[k]; const i0 = t[0] * 2, i1 = t[1] * 2, i2 = t[2] * 2;
      const s0 = [src[i0], src[i0 + 1]], s1 = [src[i1], src[i1 + 1]], s2 = [src[i2], src[i2 + 1]];
      const d0 = [dst[i0], dst[i0 + 1]], d1 = [dst[i1], dst[i1 + 1]], d2 = [dst[i2], dst[i2 + 1]];
      // triangle inchangé → déjà présent dans l'image de base
      if (s0[0] === d0[0] && s0[1] === d0[1] && s1[0] === d1[0] && s1[1] === d1[1] && s2[0] === d2[0] && s2[1] === d2[1]) continue;
      const M = Warp.affine(s0, s1, s2, d0, d1, d2); if (!M) continue;
      const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
      const ex = (p) => { const dx = p[0] - cx, dy = p[1] - cy; const l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * pad, p[1] + dy / l * pad]; };
      const e0 = ex(d0), e1 = ex(d1), e2 = ex(d2);
      const sx = Math.max(0, Math.floor(Math.min(s0[0], s1[0], s2[0]) - 2)), sy = Math.max(0, Math.floor(Math.min(s0[1], s1[1], s2[1]) - 2));
      const sw = Math.min(img.width - sx, Math.ceil(Math.max(s0[0], s1[0], s2[0]) + 2) - sx), sh = Math.min(img.height - sy, Math.ceil(Math.max(s0[1], s1[1], s2[1]) + 2) - sy);
      if (sw <= 0 || sh <= 0) continue;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]); ctx.closePath(); ctx.clip();
      ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
      ctx.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
      ctx.restore();
    }
  };

  /* ------------------------------ Parallaxe WebGL ------------------------------ */
  const VS = 'attribute vec2 p; varying vec2 v; void main(){ v = p*0.5+0.5; v.y = 1.0 - v.y; gl_Position = vec4(p,0.,1.); }';
  const FS = [
    'precision mediump float; varying vec2 v; uniform sampler2D img; uniform sampler2D dep;',
    'uniform vec2 cover; uniform vec2 pan; uniform float zoom; uniform vec2 off; uniform float strength; uniform float dzoom; uniform float hasDepth;',
    'void main(){',
    '  vec2 c = vec2(0.5) + pan;',
    '  vec2 uv = (v - 0.5) * cover / zoom + c;', // recadrage "cover" + zoom caméra autour du centre déplacé
    '  float d = hasDepth > 0.5 ? texture2D(dep, uv).r : 0.5;',
    '  float z = (d - 0.5);',
    '  uv = (uv - c) * (1.0 - z * dzoom) + c + z * off * strength;',
    '  uv = clamp(uv, vec2(0.002), vec2(0.998));',
    '  gl_FragColor = texture2D(img, uv);',
    '}'
  ].join('\n');

  /**
   * Rendu parallaxe. new Warp.Parallax(W, H) → .render(sourceCanvas, depthCanvas|null, params) → canvas interne.
   * params : { zoom (≥1), pan:[x,y] (fraction, 0 = centré), off:[x,y] (déplacement parallaxe, fraction), strength (0..0.08), dzoom (0..0.1) }
   */
  Warp.Parallax = class {
    constructor(W, H) {
      this.W = W; this.H = H; this.ok = false;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; this.canvas = cv;
      const gl = cv.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false }) || cv.getContext('experimental-webgl');
      if (!gl) return;
      this.gl = gl;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      try {
        const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        gl.useProgram(prog); this.prog = prog;
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        this.u = {}; ['img', 'dep', 'cover', 'pan', 'zoom', 'off', 'strength', 'dzoom', 'hasDepth'].forEach(n => { this.u[n] = gl.getUniformLocation(prog, n); });
        const mkTex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t; };
        this.texImg = mkTex(0); this.texDep = mkTex(1);
        gl.uniform1i(this.u.img, 0); gl.uniform1i(this.u.dep, 1);
        gl.viewport(0, 0, W, H);
        this.ok = true; this._depKey = null;
      } catch (e) { this.ok = false; this.error = e.message; }
    }
    render(source, depth, p) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texImg); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      if (depth && this._depKey !== depth) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texDep); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, depth); this._depKey = depth; }
      // recadrage cover : fraction de la texture visible dans chaque axe
      const sa = source.width / source.height, da = this.W / this.H;
      const cover = sa > da ? [da / sa, 1] : [1, sa / da];
      gl.uniform2f(this.u.cover, cover[0], cover[1]);
      gl.uniform2f(this.u.pan, p.pan ? p.pan[0] : 0, p.pan ? p.pan[1] : 0);
      gl.uniform1f(this.u.zoom, p.zoom || 1);
      gl.uniform2f(this.u.off, p.off ? p.off[0] : 0, p.off ? p.off[1] : 0);
      gl.uniform1f(this.u.strength, p.strength == null ? 1 : p.strength);
      gl.uniform1f(this.u.dzoom, p.dzoom || 0);
      gl.uniform1f(this.u.hasDepth, depth ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return this.canvas;
    }
  };

  /** Repli 2D : dessine `source` en « cover » avec zoom/pan (sans profondeur). */
  Warp.drawCover = function (ctx, source, W, H, p) {
    const sa = source.width / source.height, da = W / H;
    let dw, dh; if (sa > da) { dh = H; dw = H * sa; } else { dw = W; dh = W / sa; }
    const z = p && p.zoom ? p.zoom : 1; dw *= z; dh *= z;
    const px = p && p.pan ? p.pan[0] : 0, py = p && p.pan ? p.pan[1] : 0;
    ctx.drawImage(source, (W - dw) / 2 - px * dw, (H - dh) / 2 - py * dh, dw, dh);
  };

  NS.Warp = Warp;
  if (typeof module !== 'undefined' && module.exports) module.exports = Warp;
})(typeof window !== 'undefined' ? window : globalThis);
