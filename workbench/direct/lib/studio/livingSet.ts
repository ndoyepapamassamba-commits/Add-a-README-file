/**
 * DÉCOR VIVANT — the owner's set is no longer a flat photo behind the actors:
 *  - RELIEF: each point of the picture is pushed to its depth (Depth Anything V2 map, or a floor/wall guess) along the
 *    ray of the reference camera — the picture is unchanged from there, and every camera move (dolly, glide, hand-held
 *    breath, close-ups) shows true parallax: near stalls slide over far walls;
 *  - LENS: the blur follows the distance (sharp near, soft far) and deepens in close-ups;
 *  - LIFE: the light drifts slowly (clouds, lamps, passing shadows), the far air shimmers outdoors, dust motes float and
 *    catch the light between the camera, the actors and the set.
 */
import * as THREE from 'three';
import { RELIEF, fallbackDepth, pushAlongRay, reliefScale } from '../../../server/jev/studio/actor/relief';
import type { DecorFit } from './store';

export interface LivingSet {
  group: THREE.Group;
  /** Mean colour of the set (the light the actors take on). */
  avg: [number, number, number];
  tint: THREE.Color;
  /** Time of the scene (s) and how close the camera is (0 two-shot … 1 close-up). */
  update(t: number, closeUp: number): void;
}

/** The heavy part of a set (textures, relief), built once per picture and shared by the scenes that use it. */
export interface SetAssets {
  sharp: THREE.Texture;
  soft: THREE.Texture;
  /** Soft mask of the people painted in the set (null when none were measured). */
  people: THREE.Texture | null;
  geometry: THREE.BufferGeometry;
  avg: [number, number, number];
  outdoor: boolean;
}

const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int k = 0; k < 4; k++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

/** Builds the textures and the relief of a set picture (and its depth map when measured). */
export async function setAssets(blob: Blob, depthBlob: Blob | null, fit: DecorFit | undefined, outdoor: boolean, maxTex: number, peopleBlob: Blob | null = null): Promise<SetAssets> {
  const bmp = await createImageBitmap(blob);
  const dbmp = depthBlob ? await createImageBitmap(depthBlob).catch(() => null) : null;
  const pbmp = peopleBlob ? await createImageBitmap(peopleBlob).catch(() => null) : null;
  const iw = bmp.width;
  const ih = bmp.height;
  const f: DecorFit = fit ?? { mH: outdoor ? 4.5 : 2.4, floor: 0.92, cx: 0.5 };
  const ppm = ih / Math.max(0.5, f.mH);
  const X0 = -3.5;
  const X1 = 3.5;
  const Y0 = -2.0;
  const Y1 = outdoor ? 6 : 4.2;
  const K = Math.min(2, maxTex / ((X1 - X0) * ppm), maxTex / ((Y1 - Y0) * ppm));
  const cw = Math.max(16, Math.round((X1 - X0) * ppm * K));
  const chh = Math.max(16, Math.round((Y1 - Y0) * ppm * K));
  const w = iw * K;
  const h = ih * K;
  const sx = -X0 * ppm * K - f.cx * w;
  const sy = Y1 * ppm * K - f.floor * h;
  /** The picture laid on the set plane at scale `q` of the texture: continued sideways, up and down in mirror. */
  const layout = (img: CanvasImageSource, q: number) => {
    const W = Math.max(4, Math.round(cw * q));
    const H = Math.max(4, Math.round(chh * q));
    const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const g = c.getContext('2d')!;
    const pw = w * q;
    const ph = h * q;
    const strip = Object.assign(document.createElement('canvas'), { width: W, height: Math.max(1, Math.round(ph)) });
    const sg = strip.getContext('2d')!;
    for (let tx = -6; tx <= 6; tx++) {
      const x = sx * q + tx * pw;
      if (x > W || x + pw < 0) continue;
      const fx = Math.abs(tx) % 2 === 1;
      sg.save();
      sg.translate(x + (fx ? pw : 0), 0);
      sg.scale(fx ? -1 : 1, 1);
      sg.drawImage(img, 0, 0, pw, ph);
      sg.restore();
    }
    const top = sy * q;
    g.drawImage(strip, 0, top);
    const band = (y0: number, bh: number, from: number, dir: -1 | 1, until: number) => {
      let y = from;
      let flip = true;
      while (dir < 0 ? y > until : y < until) {
        const t0 = dir < 0 ? y - bh : y;
        g.save();
        g.translate(0, t0 + (flip ? bh : 0));
        g.scale(1, flip ? -1 : 1);
        g.drawImage(strip, 0, y0, W, bh, 0, 0, W, bh);
        g.restore();
        y += dir * bh;
        flip = !flip;
      }
    };
    band(0, Math.max(2, Math.round(ph * 0.28)), top, -1, 0);
    // Under the picture: its last rows STRETCHED down (never mirrored: a mirrored floor shows a seam and doubled
    // objects under the feet) — it reads as the near floor, out of focus.
    const botH = Math.max(2, Math.round(ph * 0.06));
    if (top + ph < H) g.drawImage(strip, 0, Math.round(ph) - botH, W, botH, 0, top + ph - 1, W, H - (top + ph) + 1);
    return { c, q, px: sx * q, py: top, pw, ph };
  };
  // Colour: the picture sharp, its mirrored continuation softened (the seams of the mirror never show).
  const full = layout(bmp, 1);
  const sharp = Object.assign(document.createElement('canvas'), { width: cw, height: chh });
  const sgc = sharp.getContext('2d')!;
  // The continuations (sides, top, floor) are out of focus: they extend the room, they must never show their seams.
  sgc.filter = `blur(${Math.max(1.5, h * 0.004).toFixed(1)}px)`;
  sgc.drawImage(full.c, 0, 0);
  sgc.filter = 'none';
  // The near floor under the picture darkens a little towards the lens (it is in the shade of the actors).
  const fl = sgc.createLinearGradient(0, sy + h, 0, chh);
  fl.addColorStop(0, 'rgba(0,0,0,0)');
  fl.addColorStop(1, 'rgba(0,0,0,0.35)');
  sgc.fillStyle = fl;
  sgc.fillRect(0, sy + h, cw, chh - sy - h);
  const pic = Object.assign(document.createElement('canvas'), { width: cw, height: chh });
  const pg = pic.getContext('2d')!;
  pg.drawImage(full.c, 0, 0);
  const mask = Object.assign(document.createElement('canvas'), { width: cw, height: chh });
  const mg = mask.getContext('2d')!;
  mg.filter = `blur(${(Math.min(w, h) * 0.05).toFixed(1)}px)`;
  mg.fillStyle = '#fff';
  // The picture fades into its continuation, more at the bottom (the floor seam is where the eye looks: the feet).
  mg.fillRect(sx + w * 0.025, sy + h * 0.025, w * 0.95, h * 0.9);
  pg.globalCompositeOperation = 'destination-in';
  pg.drawImage(mask, 0, 0);
  sgc.drawImage(pic, 0, 0);
  // The far layer of the lens: the same set, much softer (half resolution is enough for a blur).
  const soft = Object.assign(document.createElement('canvas'), { width: Math.round(cw / 2), height: Math.round(chh / 2) });
  const sfc = soft.getContext('2d')!;
  sfc.filter = `blur(${(2.5 * K * Math.max(1, ih / 800)).toFixed(1)}px)`;
  sfc.drawImage(sharp, 0, 0, soft.width, soft.height);
  // Depth (measured, else guessed from the floor line), laid exactly like the colour, at the resolution of the relief.
  const segX = 140;
  const segY = Math.round((segX * (Y1 - Y0)) / (X1 - X0));
  let dimg: CanvasImageSource | null = dbmp;
  if (!dimg) {
    const fc = Object.assign(document.createElement('canvas'), { width: 4, height: 128 });
    const fg = fc.getContext('2d')!;
    for (let y = 0; y < 128; y++) {
      const v = Math.round(fallbackDepth(y / 127, f.floor) * 255);
      fg.fillStyle = `rgb(${v},${v},${v})`;
      fg.fillRect(0, y, 4, 1);
    }
    dimg = fc;
  }
  const dl = layout(dimg, (segX + 1) / cw);
  const dc = dl.c;
  const dd = dc.getContext('2d')!.getImageData(0, 0, dc.width, dc.height).data;
  const dAt = (u: number, v: number) => {
    const x = Math.min(dc.width - 1, Math.max(0, Math.round(u * (dc.width - 1))));
    const y = Math.min(dc.height - 1, Math.max(0, Math.round(v * (dc.height - 1))));
    return dd[(y * dc.width + x) * 4]! / 255;
  };
  // The depth that stays on the plane: the median of the picture itself.
  const inPic: number[] = [];
  for (let y = Math.max(0, Math.round(dl.py)); y < Math.min(dc.height, dl.py + dl.ph); y++)
    for (let x = Math.max(0, Math.round(dl.px)); x < Math.min(dc.width, dl.px + dl.pw); x++) inPic.push(dd[(y * dc.width + x) * 4]! / 255);
  inPic.sort((a, b) => a - b);
  const dRef = inPic.length ? inPic[Math.floor(inPic.length / 2)]! : 0.5;
  // The relief: the plane, every vertex pushed along the ray of the reference camera.
  const geometry = new THREE.PlaneGeometry(X1 - X0, Y1 - Y0, segX, segY);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  const depth = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i);
    const v = 1 - uv.getY(i);
    const d = dAt(u, v);
    depth[i] = d;
    const p = pushAlongRay([pos.getX(i) + (X0 + X1) / 2, pos.getY(i) + (Y0 + Y1) / 2, RELIEF.planeZ], reliefScale(d, dRef));
    pos.setXYZ(i, p[0], p[1], p[2]);
  }
  geometry.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
  geometry.computeBoundingSphere();
  // Mean colour of the picture.
  const tiny = Object.assign(document.createElement('canvas'), { width: 16, height: 8 });
  const tg = tiny.getContext('2d')!;
  tg.drawImage(bmp, 0, 0, 16, 8);
  const px = tg.getImageData(0, 0, 16, 8).data;
  let r = 0;
  let gg = 0;
  let b = 0;
  for (let i = 0; i < px.length; i += 4) {
    r += px[i]!;
    gg += px[i + 1]!;
    b += px[i + 2]!;
  }
  const n = px.length / 4;
  // The people painted in the set, laid like the colour (a soft mask: they sway, the walls stay).
  let people: THREE.Texture | null = null;
  if (pbmp) {
    const pl = layout(pbmp, Math.min(1, 1024 / cw));
    people = new THREE.CanvasTexture(pl.c);
    people.colorSpace = THREE.NoColorSpace;
    pbmp.close();
  }
  bmp.close();
  dbmp?.close();
  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { sharp: tex(sharp), soft: tex(soft), people, geometry, avg: [r / n / 255, gg / n / 255, b / n / 255], outdoor };
}

/** Dust motes floating in the light between the camera, the actors and the set. */
function dust(avg: [number, number, number], outdoor: boolean): THREE.Points {
  const N = outdoor ? 220 : 160;
  const p = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // Deterministic placement (the same film renders the same way twice).
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin(i * 78.233) * 12345.6789;
    const c = Math.sin(i * 39.425) * 9876.54321;
    p[i * 3] = ((a - Math.floor(a)) - 0.5) * 4.4;
    p[i * 3 + 1] = 0.15 + (b - Math.floor(b)) * 3.0;
    p[i * 3 + 2] = -1.3 + (c - Math.floor(c)) * 2.6;
    seed[i] = (a * 7.1) % 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const warm = new THREE.Color(Math.min(1, avg[0] * 0.5 + 0.6), Math.min(1, avg[1] * 0.5 + 0.55), Math.min(1, avg[2] * 0.5 + 0.45));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: warm }, uOpacity: { value: outdoor ? 0.32 : 0.22 }, uScale: { value: 900 } },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime, uScale;
      varying float vA;
      void main() {
        float s = abs(aSeed);
        vec3 q = position;
        q.x += sin(uTime * (0.21 + s * 0.2) + s * 40.0) * 0.12;
        q.y += mod(uTime * (0.02 + s * 0.03) + s * 3.0, 1.2) - 0.6;
        q.z += cos(uTime * (0.17 + s * 0.15) + s * 23.0) * 0.08;
        vec4 mv = modelViewMatrix * vec4(q, 1.0);
        float d = max(0.25, -mv.z);
        // A mote close to the lens is a big soft disc; far ones are specks.
        gl_PointSize = clamp((0.004 + 0.01 * s) * uScale / d * (d < 1.2 ? 2.2 : 1.0), 1.0, 40.0);
        vA = (0.45 + 0.55 * sin(uTime * (1.3 + s) + s * 17.0)) * smoothstep(0.25, 0.9, d) * (d < 1.2 ? 0.45 : 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, r) * vA * uOpacity;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 10;
  return pts;
}

/** The living set of a scene, from the shared assets of its picture. */
export function livingSet(a: SetAssets, outputHeight: number): LivingSet {
  const haze = new THREE.Color(Math.min(1, a.avg[0] * 0.6 + 0.35), Math.min(1, a.avg[1] * 0.6 + 0.37), Math.min(1, a.avg[2] * 0.6 + 0.42));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tSharp: { value: a.sharp },
      tSoft: { value: a.soft },
      tPeople: { value: a.people },
      uPeople: { value: a.people ? 1 : 0 },
      uTime: { value: 0 },
      uClose: { value: 0 },
      uOut: { value: a.outdoor ? 1 : 0 },
      uHaze: { value: haze },
      // Acutance of the lens: a light unsharp mask on the set (v9 measured the upscaled set 9× softer than the crisp line
      // art of the actors — same lens, same sharpness), two texels wide.
      uSharp: { value: 0.8 },
      uTexel: { value: new THREE.Vector2(2 / Math.max(1, (a.sharp.image as { width: number }).width), 2 / Math.max(1, (a.sharp.image as { height: number }).height)) },
    },
    vertexShader: `
      attribute float aDepth;
      varying vec2 vUv;
      varying float vDepth;
      varying vec3 vW;
      void main() {
        vUv = uv;
        vDepth = aDepth;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform sampler2D tSharp, tSoft, tPeople;
      uniform float uTime, uClose, uOut, uPeople, uSharp;
      uniform vec3 uHaze;
      uniform vec2 uTexel;
      varying vec2 vUv;
      varying float vDepth;
      varying vec3 vW;
      ${NOISE}
      void main() {
        float far = 1.0 - vDepth;
        vec2 uv = vUv;
        // The far air shimmers in the heat outdoors.
        uv += uOut * far * far * 0.0007 * vec2(sin(vW.y * 9.0 + uTime * 2.1), cos(vW.x * 7.0 + uTime * 1.7));
        // The people of the set live: each sways and nods at its own pace (a soft warp inside their silhouettes).
        if (uPeople > 0.5) {
          float pm = texture2D(tPeople, vUv).r;
          if (pm > 0.01) {
            float ph = vUv.x * 46.0 + vUv.y * 13.0;
            vec2 sway = vec2(sin(uTime * 1.25 + ph) * 0.65 + sin(uTime * 0.61 + ph * 1.7) * 0.35, abs(sin(uTime * 2.3 + ph * 0.8)) * 0.6 - 0.3);
            uv -= pm * sway * vec2(0.0011, 0.0009) * mix(0.6, 1.5, vDepth);
          }
        }
        vec3 a = texture2D(tSharp, uv).rgb;
        vec3 nb4 = texture2D(tSharp, uv + vec2(uTexel.x, 0.0)).rgb + texture2D(tSharp, uv - vec2(uTexel.x, 0.0)).rgb + texture2D(tSharp, uv + vec2(0.0, uTexel.y)).rgb + texture2D(tSharp, uv - vec2(0.0, uTexel.y)).rgb;
        a = clamp(a + uSharp * (a - nb4 * 0.25), 0.0, 1.0);
        vec3 b = texture2D(tSoft, uv).rgb;
        // A phone-camera lens: the far set softens a little (wide lens, 2–4 m: almost everything is in focus), it never
        // dissolves into colour patches (v51 market) nor goes mushy behind the actors (v9).
        float blur = clamp((far - 0.55) * 0.6 + uClose * 0.3, 0.0, 0.35);
        vec3 col = mix(a, b, blur);
        // The light lives: slow drifting light and shade (clouds, lamps, people passing by a window).
        float n = fbm(vW.xy * 0.45 + vec2(uTime * 0.035, -uTime * 0.02));
        col *= 1.0 + (n - 0.5) * mix(0.09, 0.17, uOut);
        // Aerial perspective: the far set melts a little into the air.
        col = mix(col, uHaze, far * far * 0.16);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(a.geometry, mat);
  mesh.frustumCulled = false;
  const motes = dust(a.avg, a.outdoor);
  (motes.material as THREE.ShaderMaterial).uniforms.uScale!.value = outputHeight * 0.55;
  const group = new THREE.Group();
  group.add(mesh, motes);
  let close = 0;
  return {
    group,
    avg: a.avg,
    tint: new THREE.Color(a.avg[0], a.avg[1], a.avg[2]).convertSRGBToLinear(),
    update(t, closeUp) {
      close += (closeUp - close) * 0.15;
      mat.uniforms.uTime!.value = t;
      mat.uniforms.uClose!.value = close;
      (motes.material as THREE.ShaderMaterial).uniforms.uTime!.value = t;
    },
  };
}
