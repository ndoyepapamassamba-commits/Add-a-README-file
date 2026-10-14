// MOTEUR GPU « image → vidéo » (WebGL2) : applique, pour chaque image, la caméra virtuelle et les mouvements décidés
// par le module pur (server/jev/videogen/imageMotion.ts). Parallaxe par recherche de surface dans la carte de
// profondeur (occultations correctes : le proche masque le lointain), travelling physique et effet vertigo,
// échantillonnage eulérien en boucle (eau, nuages, fumée, pinceau de mouvement), profondeur de champ, atmosphère.
import { cameraState, type ImageMotionSpec } from '../../../server/jev/videogen/imageMotion';

const VS = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = p * 0.5 + 0.5; vUv.y = 1.0 - vUv.y; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D uImg, uDepth, uFlow;
uniform vec2 uCover, uOff;
uniform float uZoom, uDolly, uFocus, uRoll, uT, uLoop, uDof, uAspect, uFrame, uFlowOn;
uniform vec4 uFx1; // rain, snow, dust, fog
uniform vec4 uFx2; // rays, grain, vignette, letterbox
in vec2 vUv; out vec4 o;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
float depthAt(vec2 uv){ return texture(uDepth, clamp(uv, 0.0, 1.0)).r; }
vec2 flowAt(vec2 uv){ vec4 c = texture(uFlow, clamp(uv, 0.0, 1.0));
  vec2 v = vec2(c.r + c.g / 255.0, c.b + c.a / 255.0); return (v - 0.5) * 0.2; }
vec2 place(vec2 base, float h){ return 0.5 + (base - 0.5) / (1.0 + uDolly * (h - uFocus)) + uOff * (h - uFocus); }

void main(){
  vec2 c = vUv - 0.5; c.x *= uAspect;
  float cr = cos(uRoll), sr = sin(uRoll); c = vec2(cr * c.x - sr * c.y, sr * c.x + cr * c.y); c.x /= uAspect;
  vec2 base = c * uCover / uZoom + 0.5;
  // Surface search from the nearest layer to the farthest: the first layer the surface reaches is what the eye sees.
  const int N = 48;
  float prevH = 1.0; vec2 prevS = place(base, 1.0); float prevD = depthAt(prevS) - 1.0;
  vec2 s = prevS;
  for (int i = 1; i <= N; i++) {
    float h = 1.0 - float(i) / float(N);
    vec2 si = place(base, h);
    float di = depthAt(si) - h;
    if (di >= 0.0) { float k = prevD / (prevD - di + 1e-5); s = mix(prevS, si, clamp(k, 0.0, 1.0)); break; }
    prevH = h; prevS = si; prevD = di; s = si;
  }
  float d = depthAt(s);
  vec3 col;
  vec2 v = flowAt(s);
  if (uFlowOn > 0.5 && dot(v, v) > 1e-9) {
    float ta = mod(uT, uLoop);
    vec3 a = texture(uImg, s - v * ta).rgb, b = texture(uImg, s + v * (uLoop - ta)).rgb;
    col = mix(a, b, ta / uLoop);
    col *= 1.0 + 0.04 * sin(uT * 2.0 + s.x * 80.0 + s.y * 40.0) * clamp(length(v) * 60.0, 0.0, 1.0);
  } else col = texture(uImg, s).rgb;
  if (uDof > 0.0) {
    float coc = abs(d - uFocus) * uDof * 0.006;
    vec3 acc = col; 
    for (int k = 0; k < 8; k++) { float a = float(k) * 0.785398; acc += texture(uImg, s + vec2(cos(a), sin(a)) * coc).rgb; }
    col = mix(col, acc / 9.0, clamp(abs(d - uFocus) * 2.0, 0.0, 1.0));
  }
  vec2 sp = vec2(vUv.x * uAspect, vUv.y);
  if (uFx1.w > 0.0) { float n = noise(sp * 3.0 + vec2(uT * 0.05, 0.0)); col = mix(col, vec3(0.82, 0.85, 0.88), uFx1.w * (1.0 - d) * (0.45 + 0.25 * n)); }
  if (uFx2.x > 0.0) { vec2 lp = vec2(0.78 * uAspect, -0.15); vec2 r = sp - lp; float ang = atan(r.y, r.x);
    float ray = noise(vec2(ang * 18.0, uT * 0.15)) * smoothstep(1.6, 0.0, length(r)); col += vec3(1.0, 0.86, 0.6) * ray * 0.22 * uFx2.x * (1.0 - d * 0.5); }
  if (uFx1.x > 0.0) { for (int l = 0; l < 3; l++) { float fl = float(l);
    vec2 p = sp * vec2(70.0 + fl * 40.0, 7.0 + fl * 3.0); p.y -= uT * (22.0 + fl * 8.0); p.x += p.y * 0.12;
    vec2 cell = floor(p); float hh = hash(cell + fl * 17.0);
    float line = smoothstep(0.08, 0.0, abs(fract(p.x) - hh)) * step(0.55, fract(p.y + hh));
    col = mix(col, vec3(0.75, 0.8, 0.9), line * 0.35 * uFx1.x / (1.0 + fl)); }
    col *= 1.0 - 0.12 * uFx1.x; }
  if (uFx1.y > 0.0) { for (int l = 0; l < 3; l++) { float fl = float(l); float sc = 8.0 + fl * 6.0;
    vec2 p = sp * sc + vec2(sin(uT * 0.6 + fl) * 0.6, -uT * (0.6 + fl * 0.35));
    vec2 cell = floor(p); vec2 q = fract(p) - vec2(hash(cell), hash(cell + 3.1));
    float flake = smoothstep(0.06 - fl * 0.012, 0.0, length(q)); col = mix(col, vec3(1.0), flake * 0.8 * uFx1.y); } }
  if (uFx1.z > 0.0) { for (int l = 0; l < 2; l++) { float fl = float(l); float sc = 10.0 + fl * 9.0;
    vec2 p = sp * sc + vec2(sin(uT * 0.3 + fl * 2.0) * 0.5, uT * 0.25);
    vec2 cell = floor(p); vec2 q = fract(p) - vec2(hash(cell + 7.0), hash(cell + 9.0));
    float tw = 0.5 + 0.5 * sin(uT * 3.0 + hash(cell) * 30.0);
    col += vec3(1.0, 0.85, 0.55) * smoothstep(0.05, 0.0, length(q)) * tw * 0.6 * uFx1.z; } }
  if (uFx2.y > 0.0) col += (hash(vUv * 1000.0 + uFrame) - 0.5) * 0.05 * uFx2.y;
  if (uFx2.z > 0.0) { vec2 q = vUv - 0.5; col *= 1.0 - 0.38 * uFx2.z * pow(length(q) * 1.3, 2.2); }
  if (uFx2.w > 0.0) { float bar = max(0.0, (1.0 - uAspect / 2.39) * 0.5); if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0); }
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader : ${gl.getShaderInfoLog(s)}`);
  return s;
}

export interface FieldData {
  data: Float32Array;
  w: number;
  h: number;
}

export class ImageAnimator {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: { img: WebGLTexture; depth: WebGLTexture; flow: WebGLTexture };
  private u: Record<string, WebGLUniformLocation | null> = {};
  private imgW = 1;
  private imgH = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL2 indisponible dans ce navigateur');
    this.gl = gl;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`programme : ${gl.getProgramInfoLog(prog)}`);
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const mk = () => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.tex = { img: mk(), depth: mk(), flow: mk() };
    gl.useProgram(prog);
    for (const n of ['uImg', 'uDepth', 'uFlow', 'uCover', 'uOff', 'uZoom', 'uDolly', 'uFocus', 'uRoll', 'uT', 'uLoop', 'uDof', 'uAspect', 'uFrame', 'uFlowOn', 'uFx1', 'uFx2']) this.u[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(this.u.uImg!, 0);
    gl.uniform1i(this.u.uDepth!, 1);
    gl.uniform1i(this.u.uFlow!, 2);
  }

  setImage(src: TexImageSource & { width: number; height: number }): void {
    const gl = this.gl;
    this.imgW = src.width;
    this.imgH = src.height;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }
  setDepth(f: FieldData): void {
    const gl = this.gl;
    const bytes = new Uint8Array(f.w * f.h);
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.round(Math.min(1, Math.max(0, f.data[i]!)) * 255);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.depth);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, f.w, f.h, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
  }
  /** Motion field in uv/s (2 values per pixel), packed on 16 bits per component (hi, lo). */
  setFlow(f: FieldData): void {
    const gl = this.gl;
    const px = new Uint8Array(f.w * f.h * 4);
    for (let i = 0; i < f.w * f.h; i++)
      for (let c = 0; c < 2; c++) {
        const v = Math.min(65535, Math.max(0, Math.round((f.data[i * 2 + c]! / 0.2 + 0.5) * 65535)));
        px[i * 4 + c * 2] = v >> 8;
        px[i * 4 + c * 2 + 1] = v & 255;
      }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.flow);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, f.w, f.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }
  setSize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  /** Draws the picture at time t (s) of the spec. */
  render(spec: ImageMotionSpec, t: number, frame = 0): void {
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.prog);
    const k = spec.seconds > 0 ? Math.min(1, t / spec.seconds) : 0;
    const cam = cameraState(spec.preset, k, spec.intensity);
    // « Cover » fit: the output always shows picture, never borders.
    const ar = W / H;
    const ir = this.imgW / this.imgH;
    const cover: [number, number] = ar > ir ? [1, ir / ar] : [ar / ir, 1];
    const fx = spec.effects;
    gl.uniform2f(this.u.uCover!, cover[0], cover[1]);
    gl.uniform2f(this.u.uOff!, cam.ox, cam.oy);
    gl.uniform1f(this.u.uZoom!, cam.zoom);
    gl.uniform1f(this.u.uDolly!, cam.dolly ?? 0);
    gl.uniform1f(this.u.uFocus!, cam.focus);
    gl.uniform1f(this.u.uRoll!, cam.roll);
    gl.uniform1f(this.u.uT!, t);
    gl.uniform1f(this.u.uLoop!, Math.max(1, spec.loop));
    gl.uniform1f(this.u.uDof!, spec.preset === 'vertigo' || spec.preset === 'orbite' ? 1 : 0.5);
    gl.uniform1f(this.u.uAspect!, ar);
    gl.uniform1f(this.u.uFrame!, frame % 997);
    gl.uniform1f(this.u.uFlowOn!, fx.clouds || fx.water ? 1 : 0);
    gl.uniform4f(this.u.uFx1!, fx.rain ? 1 : 0, fx.snow ? 1 : 0, fx.dust ? 1 : 0, fx.fog ? 1 : 0);
    gl.uniform4f(this.u.uFx2!, fx.rays ? 1 : 0, fx.grain ? 1 : 0, fx.vignette ? 1 : 0, fx.letterbox ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

/** The final frame: the GPU picture + the title (fade in / out), on a 2D canvas that the encoder takes as is. */
export function composeFrame(out: HTMLCanvasElement, gl: HTMLCanvasElement, spec: ImageMotionSpec, t: number): HTMLCanvasElement {
  if (out.width !== gl.width || out.height !== gl.height) {
    out.width = gl.width;
    out.height = gl.height;
  }
  const g = out.getContext('2d')!;
  g.drawImage(gl, 0, 0);
  const ti = spec.title;
  if (ti?.text && t >= ti.start && t <= ti.start + ti.duration) {
    const k = Math.min(1, (t - ti.start) / 0.6, (ti.start + ti.duration - t) / 0.6);
    const size = Math.round(out.height * (out.width > out.height ? 0.075 : 0.05));
    g.save();
    g.globalAlpha = Math.max(0, k);
    g.font = `700 ${size}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = size * 0.4;
    g.fillStyle = '#ffffff';
    const lines = wrap(g, ti.text, out.width * 0.84);
    lines.forEach((l, i) => g.fillText(l, out.width / 2, out.height * 0.5 + (i - (lines.length - 1) / 2) * size * 1.2 - (1 - k) * size * 0.3));
    g.restore();
  }
  return out;
}
function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}
