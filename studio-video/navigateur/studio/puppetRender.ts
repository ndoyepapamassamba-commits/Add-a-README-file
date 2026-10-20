// MARIONNETTE AFRIKATOON — browser renderer: the scene image is drawn, then each rigged character is redrawn through
// its deformed mesh (affine-mapped triangles), then its eyes blink and its mouth opens with the voice.
import { deformPoint as deformPointOf, gestureOf, jawOffset, poseAt, springPose, warpGrid, type SpringState, type Pose, type PuppetCharacter, type PuppetRig } from '../../coeur/studio/puppet';
import { characterLayer, inpaint, plateHole } from '../../coeur/studio/layers';
import { apply, findHem, ownerOf, bodyModel, bodyTarget, boneMatrices, buildBodyMesh, deformMesh, poseFromTarget, restLimbs, springBody, type BodyMesh, type BodyModel, type BodySpring } from '../../coeur/studio/body2d';

type Surface = OffscreenCanvas | HTMLCanvasElement;
const surface = (w: number, h: number): Surface => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));

export interface PuppetFrameInput {
  t: number;
  /** -1 left, 0 centre, 1 right (who is speaking), and the voice level 0..1. */
  side: number;
  energy: number;
  speaking: boolean;
  action?: string;
  emphasis?: number;
  /** The gesture of the line being spoken and the seconds since that line began (anticipation → overshoot → settle). */
  gesture?: string | null;
  lineAge?: number;
  /** Emotion of the line / scene (body layer) and jaw opening from the visemes of the words. */
  emotion?: string;
  viseme?: number;
  /** Preston Blair mouth shape of the sound said now, and the voice accent (beat gestures). */
  visemeKey?: string;
  beat?: number;
  /** Seconds since the scene began (the scene's action — walk in, fall, exit… — is played from its start). */
  sceneAge?: number;
}
/** CORPS ENTIER state of one character: skeleton model, skinned mesh, springs, travel kept between gestures. */
interface BodyState {
  model: BodyModel;
  mesh: BodyMesh;
  dst: Float32Array;
  spring?: BodySpring;
  /** Part textures (pixels owned by one bone, cropped at ox / oy) for the border triangles of unconnected parts. */
  parts: Map<number, { tex: Surface; ox: number; oy: number }>;
}
/** Actions played by the whole body for the whole scene (they win over the gestures of the lines). */
const SCENE_ACTIONS = ['fall', 'exit', 'walk', 'run', 'dance', 'jump'];
const rgb = (d: Uint8ClampedArray, w: number, h: number, x: number, y: number) => {
  const i = (Math.max(0, Math.min(h - 1, Math.round(y))) * w + Math.max(0, Math.min(w - 1, Math.round(x)))) * 4;
  return `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
};
/** The character who speaks for a side: leftmost / rightmost / biggest. */
function speakerOf(chars: PuppetCharacter[], side: number): PuppetCharacter | undefined {
  if (!chars.length) return undefined;
  const byX = [...chars].sort((a, b) => a.box.x + a.box.w / 2 - (b.box.x + b.box.w / 2));
  if (side < 0) return byX[0];
  if (side > 0) return byX[byX.length - 1];
  return [...chars].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)[0];
}

export class PuppetStage {
  readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  private g: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  private src: Uint8ClampedArray;
  /** Per character: colour matte (vertex weights) for the single-image fallback. */
  private matte = new Map<PuppetCharacter, (s: { x: number; y: number }) => number>();
  /** 2.5D layers: the clean background plate and one cut-out layer per character (null → single-image fallback). */
  private plate: Surface | null = null;
  private layers = new Map<PuppetCharacter, Surface>();
  /** Arms the cut-out really covers (the others keep still with the body). */
  private armsOk = new Map<PuppetCharacter, boolean[]>();
  /** The plate is the generated empty set (exact) rather than an inpainted guess: full amplitude is safe. */
  private exactPlate = false;
  /** The still with the characters' mouths replaced by skin (the renderer draws the talking mouths). */
  private base!: Surface;
  private lips = new Map<PuppetCharacter, string>();
  /** Characters whose painted mouth is already open: lip-sync by moving the real jaw, no drawn mouth. */
  private jawMode = new Set<PuppetCharacter>();
  /** Per-frame buffer of one character (layered mode): its face is drawn « source-atop », never outside its silhouette. */
  private buf: Surface | null = null;
  /** Spring state per character (secondary motion: every part eases, overshoots a little and settles). */
  private springs = new Map<PuppetCharacter, SpringState>();
  /** Characters animated by the CORPS ENTIER engine (skeleton read in the browser + exact cut-out). */
  private bodies = new Map<PuppetCharacter, BodyState>();
  constructor(
    private img: CanvasImageSource & { width: number; height: number },
    private rig: PuppetRig,
    /** The same shot without the characters, when the app generated it (exact cut-out, true background). */
    plateImg?: (CanvasImageSource & { width: number; height: number }) | null,
    /** Exact cut-outs read in the browser (one per character, at this stage's size) — see bodyDetect.ts. */
    masks?: (Float32Array | null)[] | null,
  ) {
    const k = Math.min(1, 720 / Math.max(1, img.width));
    const w = Math.round(img.width * k);
    const h = Math.round(img.height * k);
    this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    this.g = this.canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    this.g.drawImage(img, 0, 0, w, h);
    this.src = this.g.getImageData(0, 0, w, h).data;
    this.eraseMouths(w, h);
    for (const c of rig.characters) {
      this.matte.set(c, this.buildMatte(c, w, h));
    }
    let plateSrc: Uint8ClampedArray | undefined;
    if (plateImg) {
      const pc = surface(w, h);
      const pg = pc.getContext('2d') as OffscreenCanvasRenderingContext2D;
      pg.drawImage(plateImg, 0, 0, w, h);
      plateSrc = pg.getImageData(0, 0, w, h).data;
      this.plate = pc;
      this.exactPlate = true;
    }
    this.buildLayers(w, h, plateSrc, masks ?? undefined);
  }
  /** Size of the stage canvas for an image (the caller reads the masks at this size). */
  static sizeFor(img: { width: number; height: number }): { w: number; h: number } {
    const k = Math.min(1, 720 / Math.max(1, img.width));
    return { w: Math.round(img.width * k), h: Math.round(img.height * k) };
  }
  /** Number of characters played by the full-body engine. */
  get fullBody(): number {
    return this.bodies.size;
  }
  /**
   * Cuts the still into layers: a matte per character, a clean plate (characters removed, holes filled by push-pull),
   * a cut-out per character. A matte that looks wrong (almost empty / almost the whole box) keeps the single-image mode.
   */
  private buildLayers(w: number, h: number, plateSrc?: Uint8ClampedArray, masks?: (Float32Array | null)[]) {
    const given = this.plate;
    try {
      const chars = this.rig.characters;
      const cuts = chars.map((c, k) => {
        const m = masks?.[k];
        return m && m.length === w * h ? { alpha: m, armsOk: c.arms.map(() => true) } : characterLayer(this.src, w, h, c, chars.filter((o) => o !== c), plateSrc);
      });
      const mattes = cuts.map((x) => x.alpha);
      const ok = chars.every((c, k) => {
        const m = mattes[k]!;
        let on = 0, n = 0;
        for (let y = Math.floor(c.box.y * h); y < (c.box.y + c.box.h) * h; y += 3)
          for (let x = Math.floor(c.box.x * w); x < (c.box.x + c.box.w) * w; x += 3) {
            on += m[y * w + x]! > 0.5 ? 1 : 0;
            n++;
          }
        const cov = n ? on / n : 0;
        // An exact cut-out (segmenter) may fill a tight box; a colour matte that does is the background.
        return masks?.[k] ? cov > 0.15 : cov > 0.15 && cov < 0.93;
      });
      if (!ok) {
        this.plate = null;
        return;
      }
      if (!given) {
        const plateData = inpaint(this.src, w, h, plateHole(mattes, w, h));
        const plate = surface(w, h);
        (plate.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(new ImageData(new Uint8ClampedArray(plateData), w, h), 0, 0);
        this.plate = plate;
      }
      chars.forEach((c, k) => {
        this.armsOk.set(c, cuts[k]!.armsOk);
        const m = mattes[k]!;
        const px = new Uint8ClampedArray(this.src.length);
        px.set(this.src);
        for (let i = 0; i < w * h; i++) px[i * 4 + 3] = Math.round(m[i]! * 255);
        const layer = surface(w, h);
        (layer.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(new ImageData(px, w, h), 0, 0);
        this.layers.set(c, layer);
        if (c.body2d) this.buildBody(c, m, w, h);
      });
    } catch {
      this.plate = null;
      this.layers.clear();
    }
  }
  /** Skinned mesh over the cut-out of a character with a skeleton (the mesh covers exactly its pixels). */
  private buildBody(c: PuppetCharacter, m: Float32Array, w: number, h: number) {
    try {
      const model = bodyModel(c.body2d!, w / h);
      let x0 = w;
      let y0 = h;
      let x1 = 0;
      let y1 = 0;
      for (let y = 0; y < h; y += 2)
        for (let x = 0; x < w; x += 2)
          if (m[y * w + x]! > 0.05) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
      if (x1 <= x0 || y1 <= y0) return;
      const alphaAt = (X: number, Y: number) => {
        const x = Math.round(X * h);
        const y = Math.round(Y * h);
        return x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]!;
      };
      const pad = 3 / h;
      model.hem = findHem(model, alphaAt);
      const mesh = buildBodyMesh(model, alphaAt, { x0: x0 / h - pad, y0: y0 / h - pad, x1: x1 / h + pad, y1: y1 / h + pad }, 46);
      if (mesh.tris.length < 30) return;
      // Pixel ownership (nearest bone) → one cropped texture per part that borders an unconnected part.
      const need = new Set([...mesh.part].filter((p) => p >= 0));
      const parts = new Map<number, { tex: Surface; ox: number; oy: number }>();
      if (need.size) {
        const bw = x1 - x0 + 1;
        const bh = y1 - y0 + 1;
        const owner = new Int8Array(bw * bh).fill(-1);
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) if (m[y * w + x]! > 0.02) owner[(y - y0) * bw + (x - x0)] = ownerOf(model, { x: x / h, y: y / h });
        for (const p of need) {
          const tex = surface(bw, bh);
          const tg = tex.getContext('2d') as OffscreenCanvasRenderingContext2D;
          const im = tg.createImageData(bw, bh);
          for (let y = 0; y < bh; y++)
            for (let x = 0; x < bw; x++) {
              if (owner[y * bw + x] !== p) continue;
              const si = ((y + y0) * w + (x + x0)) * 4;
              const o = (y * bw + x) * 4;
              im.data[o] = this.src[si]!;
              im.data[o + 1] = this.src[si + 1]!;
              im.data[o + 2] = this.src[si + 2]!;
              im.data[o + 3] = Math.round(m[(y + y0) * w + (x + x0)]! * 255);
            }
          tg.putImageData(im, 0, 0);
          parts.set(p, { tex, ox: x0, oy: y0 });
        }
      }
      this.bodies.set(c, { model, mesh, dst: new Float32Array(mesh.src.length), parts });
    } catch {
      this.bodies.delete(c);
    }
  }
  /** The character who performs the scene's action: named in it, else the speaker, else the first one. */
  private actorOf(action: string | undefined, talker: PuppetCharacter | undefined): PuppetCharacter | undefined {
    const a = (action ?? '').toLowerCase();
    return this.rig.characters.find((c) => c.name.length > 2 && a.includes(c.name.toLowerCase())) ?? talker ?? [...this.rig.characters].sort((p, q) => p.box.x - q.box.x)[0];
  }
  /** True when the scene is rendered in 2.5D layers (plate + cut-outs). */
  get layered() {
    return this.plate !== null;
  }
  /**
   * MOUTH REPLACEMENT (the classic 2D lip-sync technique): the mouth painted in the picture (often wide open in comedy
   * stills) is replaced by skin rebuilt from around it; the renderer then draws, every frame, the mouth shape of the sound
   * being said. The lip colour is taken from the skin.
   */
  private eraseMouths(w: number, h: number) {
    const hole = new Float32Array(w * h);
    let any = false;
    for (const c of this.rig.characters) {
      if (!c.mouth) continue;
      if (this.darkFraction(c, w, h) > 0.25) {
        this.jawMode.add(c);
        continue;
      }
      any = true;
      const cx = (c.mouth.x + c.mouth.w / 2) * w;
      const cy = (c.mouth.y + c.mouth.h / 2) * h;
      const rx = Math.max(3, c.mouth.w * w * 0.62);
      const ry = Math.max(3, c.mouth.h * h * 0.85);
      for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(h - 1, cy + ry); y++)
        for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(w - 1, cx + rx); x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) hole[y * w + x] = 1;
    }
    if (any) {
      const out = inpaint(this.src, w, h, hole);
      this.src = out;
      for (const c of this.rig.characters) {
        if (!c.mouth || this.jawMode.has(c)) continue;
        const [r, g2, b] = this.patch((c.mouth.x + c.mouth.w / 2) * w, (c.mouth.y + c.mouth.h / 2) * h, w, h, 2);
        this.lips.set(c, `rgb(${Math.round(r * 0.62)},${Math.round(g2 * 0.4)},${Math.round(b * 0.42)})`);
      }
    }
    this.base = surface(w, h);
    (this.base.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(new ImageData(new Uint8ClampedArray(this.src), w, h), 0, 0);
  }
  /** Share of dark pixels in the mouth box: the picture already shows an open mouth. */
  private darkFraction(c: PuppetCharacter, w: number, h: number) {
    if (!c.mouth) return 0;
    let dark = 0;
    let n = 0;
    for (let y = c.mouth.y; y < c.mouth.y + c.mouth.h; y += c.mouth.h / 8)
      for (let x = c.mouth.x; x < c.mouth.x + c.mouth.w; x += c.mouth.w / 8) {
        const [r, g2, b] = this.patch(x * w, y * h, w, h, 0);
        if (0.3 * r + 0.59 * g2 + 0.11 * b < 60) dark++;
        n++;
      }
    return n ? dark / n : 0;
  }
  /** Mean colour of a small square around (x, y) in pixels. */
  private patch(x: number, y: number, w: number, h: number, r = 2): [number, number, number] {
    let R = 0, G = 0, B = 0, n = 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const px = Math.max(0, Math.min(w - 1, Math.round(x + dx)));
        const py = Math.max(0, Math.min(h - 1, Math.round(y + dy)));
        const i = (py * w + px) * 4;
        R += this.src[i]!;
        G += this.src[i + 1]!;
        B += this.src[i + 2]!;
        n++;
      }
    return [R / n, G / n, B / n];
  }
  /**
   * Colour matte: the background palette is sampled on a ring just outside the character's box; a point whose colour is
   * far from every background sample belongs to the character. Inside the head / body cores the weight is high anyway.
   * The vertex weights are then dilated (no tearing at the silhouette) and smoothed.
   */
  private buildMatte(c: PuppetCharacter, w: number, h: number) {
    const bg: [number, number, number][] = [];
    const ring = { x: c.box.x - c.box.w * 0.08, y: c.box.y - c.box.h * 0.05, w: c.box.w * 1.16, h: c.box.h * 1.1 };
    for (let k = 0; k < 48; k++) {
      const u = k / 48;
      for (const [x, y] of [
        [ring.x + ring.w * u, ring.y],
        [ring.x + ring.w * u, ring.y + ring.h],
        [ring.x, ring.y + ring.h * u],
        [ring.x + ring.w, ring.y + ring.h * u],
      ] as [number, number][]) {
        if (x < 0 || x > 1 || y < 0 || y > 1) continue;
        // Skip samples that fall on another character.
        if (this.rig.characters.some((o) => o !== c && x > o.box.x && x < o.box.x + o.box.w && y > o.box.y && y < o.box.y + o.box.h)) continue;
        bg.push(this.patch(x * w, y * h, w, h, 3));
      }
    }
    const inCore = (s: { x: number; y: number }) =>
      [c.head, c.body].some((b) => s.x > b.x + b.w * 0.15 && s.x < b.x + b.w * 0.85 && s.y > b.y + b.h * 0.1 && s.y < b.y + b.h * 0.9);
    const raw = (s: { x: number; y: number }) => {
      if (inCore(s)) return 1;
      if (!bg.length) return 1;
      const [r, g2, b] = this.patch(s.x * w, s.y * h, w, h, 2);
      let best = Infinity;
      for (const q of bg) best = Math.min(best, Math.hypot(r - q[0], g2 - q[1], b - q[2]));
      const v = (best - 22) / 38;
      return v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
    };
    // Dilate over a neighbourhood the size of a mesh cell (the silhouette moves as a whole).
    const step = { x: (c.box.w * 1.28) / 16, y: (c.box.h * 1.14) / 24 };
    const cache = new Map<string, number>();
    return (s: { x: number; y: number }) => {
      const key = `${s.x.toFixed(4)},${s.y.toFixed(4)}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      let m = 0;
      for (let dy = -1; dy <= 1 && m < 1; dy++) for (let dx = -1; dx <= 1 && m < 1; dx++) m = Math.max(m, raw({ x: s.x + dx * step.x, y: s.y + dy * step.y }) * (dx || dy ? 0.85 : 1));
      cache.set(key, m);
      return m;
    };
  }

  get width() {
    return this.canvas.width;
  }
  get height() {
    return this.canvas.height;
  }
  /** Draws one frame and returns the canvas (to be framed by the camera like the still image). */
  frame(f: PuppetFrameInput): OffscreenCanvas | HTMLCanvasElement {
    const { g } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.plate ?? this.base, 0, 0, W, H);
    const talker = f.speaking ? speakerOf(this.rig.characters, f.side) : undefined;
    // Back to front: the character whose feet are higher in the frame is further away.
    for (const c of [...this.rig.characters].sort((a, b) => a.box.y + a.box.h - (b.box.y + b.box.h))) {
      // Each character faces the nearest other one: leans, points and arm swings go towards them.
      const cx = c.box.x + c.box.w / 2;
      const other = this.rig.characters.filter((o) => o !== c).sort((a, b) => Math.abs(a.box.x + a.box.w / 2 - cx) - Math.abs(b.box.x + b.box.w / 2 - cx))[0];
      const facing = other ? (other.box.x + other.box.w / 2 >= cx ? 1 : -1) : cx < 0.5 ? 1 : -1;
      const mine = c === talker;
      const raw = poseAt(c, f.t, {
        speaking: mine,
        energy: f.energy,
        emphasis: mine ? f.emphasis : 0,
        action: f.action,
        facing,
        emotion: f.emotion,
        ...(mine && f.viseme !== undefined ? { viseme: f.viseme } : {}),
        ...(mine && f.visemeKey ? { visemeKey: f.visemeKey } : {}),
        ...(mine && f.beat !== undefined ? { beat: f.beat } : {}),
        ...(mine && f.gesture ? { gesture: f.gesture, age: f.lineAge ?? 1 } : {}),
      });
      // Secondary motion: the whole pose goes through damped springs (no jump between frames, natural follow-through).
      const sp = springPose(this.springs.get(c), raw, f.t);
      this.springs.set(c, sp.state);
      const pose = sp.pose;
      const body = this.bodies.get(c);
      if (body && this.layers.has(c)) {
        if (!this.buf || this.buf.width !== W || this.buf.height !== H) this.buf = surface(W, H);
        const bg = this.buf.getContext('2d') as OffscreenCanvasRenderingContext2D;
        bg.setTransform(1, 0, 0, 1, 0, 0);
        bg.globalCompositeOperation = 'source-over';
        bg.clearRect(0, 0, W, H);
        const headM = this.drawBody(c, body, f, mine, talker, facing, other, bg, W, H);
        const aspect = W / H;
        const map = (q: { x: number; y: number }) => {
          const u = apply(headM, { x: q.x * aspect, y: q.y });
          return { x: u.x / aspect, y: u.y };
        };
        bg.globalCompositeOperation = 'source-atop';
        this.drawFace(c, pose, W, H, bg, this.buf, map);
        bg.globalCompositeOperation = 'source-over';
        g.drawImage(this.buf, 0, 0);
      } else if (this.layers.has(c)) {
        // Character rendered alone in its buffer, face features clipped to its own pixels, then composited.
        if (!this.buf || this.buf.width !== W || this.buf.height !== H) this.buf = surface(W, H);
        const bg = this.buf.getContext('2d') as OffscreenCanvasRenderingContext2D;
        bg.setTransform(1, 0, 0, 1, 0, 0);
        bg.globalCompositeOperation = 'source-over';
        bg.clearRect(0, 0, W, H);
        this.drawMesh(c, pose, W, H, bg);
        bg.globalCompositeOperation = 'source-atop';
        this.drawFace(c, pose, W, H, bg, this.buf);
        bg.globalCompositeOperation = 'source-over';
        g.drawImage(this.buf, 0, 0);
      } else {
        this.drawMesh(c, pose, W, H);
        this.drawFace(c, pose, W, H);
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return this.canvas;
  }
  private drawMesh(c: PuppetCharacter, p: Pose, W: number, H: number, g: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D = this.g) {
    const layer = this.layers.get(c);
    const ok = this.armsOk.get(c);
    if (layer && ok) p = { ...p, arms: p.arms.map((v, i) => (ok[i] === false ? 0 : v)) };
    // Guessed plate: smaller head / body travel, so the revealed background stays a thin, invisible strip.
    if (layer && !this.exactPlate) p = { ...p, headRot: p.headRot * 0.6, headNod: p.headNod * 0.6, lean: p.lean * 0.7 };
    // Layered: the cut-out moves freely over the still plate (no matte gating needed, every triangle is drawn).
    const m = layer ? warpGrid(c, p, 16, 24) : warpGrid(c, p, 16, 24, this.matte.get(c));
    const at = (arr: { x: number; y: number }[], i: number, j: number) => arr[j * (m.cols + 1) + i]!;
    for (let j = 0; j < m.rows; j++)
      for (let i = 0; i < m.cols; i++) {
        const quads: [number, number][][] = [
          [[i, j], [i + 1, j], [i, j + 1]],
          [[i + 1, j], [i + 1, j + 1], [i, j + 1]],
        ];
        for (const tri of quads) {
          const s = tri.map(([a, b]) => at(m.src, a, b)).map((q) => ({ x: q.x * W, y: q.y * H }));
          const d = tri.map(([a, b]) => at(m.dst, a, b)).map((q) => ({ x: q.x * W, y: q.y * H }));
          // Skip triangles that do not move (most of the background around the character).
          if (!layer && s.every((q, k) => Math.abs(q.x - d[k]!.x) < 0.15 && Math.abs(q.y - d[k]!.y) < 0.15)) continue;
          drawTriangle(g, layer ?? this.base, W, H, s, d);
        }
      }
  }
  /**
   * CORPS ENTIER: the character's own drawing, skinned on its skeleton, plays the clip of the moment (line gesture, or
   * the scene's action for its performer). Returns the head matrix (the face follows it).
   */
  private drawBody(c: PuppetCharacter, B: BodyState, f: PuppetFrameInput, mine: boolean, talker: PuppetCharacter | undefined, facing: number, other: PuppetCharacter | undefined, g: OffscreenCanvasRenderingContext2D, W: number, H: number) {
    const act = gestureOf(f.action);
    let clip: string | null = mine && f.gesture ? f.gesture : null;
    let age = f.lineAge ?? 0;
    if (act && c === this.actorOf(f.action, talker) && (SCENE_ACTIONS.includes(act) || !clip)) {
      clip = act;
      age = f.sceneAge ?? f.t;
    }
    // Room to walk towards the other character (body heights), keeping a small gap.
    const gap = other ? (facing > 0 ? other.box.x - (c.box.x + c.box.w) : c.box.x - (other.box.x + other.box.w)) : 0.3;
    const room = Math.max(0, Math.min(1.2, (gap * (W / H)) / B.model.height + 0.05));
    const target = bodyTarget(clip, {
      t: f.t,
      age,
      speaking: mine,
      energy: mine ? f.energy : 0,
      beat: mine ? (f.beat ?? 0) : 0,
      emotion: f.emotion,
      rest: restLimbs(B.model, facing),
      room,
      travel: true,
      phase: (c.name.length * 1.7 + c.box.x * 13) % 6,
      // A fall goes to the side of the picture with the most room.
      fallDir: (1 - c.box.x - c.box.w > c.box.x ? 1 : -1) * facing,
    });
    const sp = springBody(B.spring, poseFromTarget(B.model, target, facing), f.t);
    B.spring = sp.state;
    const mats = boneMatrices(B.model, sp.pose);
    const d = deformMesh(B.mesh, mats, B.dst);
    const s = B.mesh.src;
    const layer = this.layers.get(c)!;
    const tris = B.mesh.tris;
    const st = (i: number, j: number, arr: Float32Array) => Math.hypot(arr[i * 2]! - arr[j * 2]!, arr[i * 2 + 1]! - arr[j * 2 + 1]!);
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t]!;
      const b = tris[t + 1]!;
      const e = tris[t + 2]!;
      // A triangle stretched far beyond its size (between two parts that moved apart) is a smear: it is not drawn.
      const r0 = Math.max(st(a, b, s), st(b, e, s), st(e, a, s));
      if (Math.max(st(a, b, d), st(b, e, d), st(e, a, d)) > r0 * 2.2 + 1 / H) continue;
      const part = B.mesh.part[t / 3]!;
      const pt = part >= 0 ? B.parts.get(part) : undefined;
      const ox = pt?.ox ?? 0;
      const oy = pt?.oy ?? 0;
      const tex = pt?.tex ?? layer;
      drawTriangle(
        g,
        tex,
        pt ? tex.width : W,
        pt ? tex.height : H,
        [
          { x: s[a * 2]! * H - ox, y: s[a * 2 + 1]! * H - oy },
          { x: s[b * 2]! * H - ox, y: s[b * 2 + 1]! * H - oy },
          { x: s[e * 2]! * H - ox, y: s[e * 2 + 1]! * H - oy },
        ],
        [
          { x: d[a * 2]! * H, y: d[a * 2 + 1]! * H },
          { x: d[b * 2]! * H, y: d[b * 2 + 1]! * H },
          { x: d[e * 2]! * H, y: d[e * 2 + 1]! * H },
        ],
      );
    }
    return mats[B.model.bones.findIndex((x) => x.id === 'head')]!;
  }
  private drawFace(c: PuppetCharacter, p: Pose, W: number, H: number, g: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D = this.g, from: Surface = this.canvas, map?: (q: { x: number; y: number }) => { x: number; y: number }) {
    const { src } = this;
    const deformPoint = map ? (_c: PuppetCharacter, _p: Pose, q: { x: number; y: number }) => map(q) : deformPointOf;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const headCx = c.head.x + c.head.w / 2;
    for (const e of c.eyes) {
      const q = deformPoint(c, p, e);
      const r = e.r * W;
      // BROWS: a fine local warp above the eye moves the painted brow (inner end towards the nose, outer end).
      this.browWarp(q.x * W, q.y * H, r, e.x < headCx ? 1 : -1, p.browIn, p.browOut, g, from);
      // Eyelids: blink, or squint from the emotion.
      const lid = Math.max(p.blink, p.squint * 0.5);
      if (lid > 0.05) {
        g.fillStyle = rgb(src, W, H, e.x * W, (e.y - e.r * 2.4) * H);
        g.beginPath();
        g.ellipse(q.x * W, q.y * H - r * (1 - lid) * 0.6, r * 1.35, r * 1.35 * lid, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(25,15,10,0.85)';
        g.lineWidth = Math.max(1, r * 0.22);
        g.beginPath();
        g.ellipse(q.x * W, q.y * H + r * 0.35 * lid, r * 1.2, r * 0.25, 0, 0, Math.PI);
        g.stroke();
      }
    }
    // JAW: fine local warp of the mouth / chin (the real pixels move: lower lip, chin).
    if (c.mouth) {
      const mc = deformPoint(c, p, { x: c.mouth.x + c.mouth.w / 2, y: c.mouth.y + c.mouth.h / 2 });
      this.jawWarp(mc.x * W, mc.y * H, c.mouth.w * W, c.mouth.h * H, p.mouth, this.jawMode.has(c) ? 1 : 0, g, from);
    }
    if (c.mouth && !this.jawMode.has(c)) {
      const mc = deformPoint(c, p, { x: c.mouth.x + c.mouth.w / 2, y: c.mouth.y + c.mouth.h / 2 });
      drawMouth(g, mc.x * W, mc.y * H + c.mouth.h * H * 0.2 * p.mouth, c.mouth.w * W, c.mouth.h * H, p.mouthShape, p.mouth, p.smile, this.lips.get(c) ?? 'rgb(120,45,45)');
    }
  }
  /** Local jaw warp: a 10×12 mesh over mouth + chin, vertices moved by jawOffset (sides fade to 0). */
  private jawWarp(mx: number, my: number, mw: number, mh: number, open: number, rest: 0 | 1, g: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, from: Surface) {
    if (mh < 3 || (!rest && open < 0.02)) return;
    const x0 = mx - mw * 1.3;
    const y0 = my - mh * 0.8;
    const bw = mw * 2.6;
    const bh = mh * 3;
    const cols = 10;
    const rows = 12;
    const tmp = surface(Math.ceil(bw), Math.ceil(bh));
    const tg = tmp.getContext('2d') as OffscreenCanvasRenderingContext2D;
    tg.drawImage(from, x0, y0, bw, bh, 0, 0, bw, bh);
    const pt = (i: number, j: number, moved: boolean) => {
      const x = (i / cols) * bw;
      const y = (j / rows) * bh;
      if (!moved || i === 0 || i === cols || j === 0 || j === rows) return { x, y };
      const side = Math.sin((i / cols) * Math.PI) ** 0.8;
      return { x, y: y + jawOffset(y + y0, my, mh, open, rest) * side };
    };
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++)
        for (const tri of [
          [[i, j], [i + 1, j], [i, j + 1]],
          [[i + 1, j], [i + 1, j + 1], [i, j + 1]],
        ] as [number, number][][]) {
          const sP = tri.map(([a, b]) => pt(a, b, false));
          const dP = tri.map(([a, b]) => pt(a, b, true)).map((q) => ({ x: q.x + x0, y: q.y + y0 }));
          drawTriangleFrom(g, tmp, sP, dP);
        }
  }
  /** Local brow warp: a 6×4 mesh over the brow area, vertices lifted / lowered (inner / outer), fading to the edges. */
  private browWarp(ex: number, ey: number, r: number, inward: number, browIn: number, browOut: number, g: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, from: Surface) {
    if (Math.abs(browIn) < 0.05 && Math.abs(browOut) < 0.05) return;
    const x0 = ex - r * 2.6;
    const y0 = ey - r * 4.4;
    const bw = r * 5.2;
    const bh = r * 4;
    const cols = 6;
    const rows = 4;
    if (bw < 6 || bh < 6) return;
    const tmp = surface(Math.ceil(bw), Math.ceil(bh));
    const tg = tmp.getContext('2d') as OffscreenCanvasRenderingContext2D;
    tg.drawImage(from, x0, y0, bw, bh, 0, 0, bw, bh);
    const pt = (i: number, j: number, moved: boolean) => {
      const u = i / cols;
      const v = j / rows;
      if (!moved || i === 0 || i === cols || j === 0 || j === rows) return { x: u * bw, y: v * bh };
      // u from the inner end (towards the nose) to the outer end.
      const ui = inward > 0 ? 1 - u : u;
      const raise = browIn * (1 - ui) + browOut * ui;
      const fall = Math.sin(v * Math.PI) ** 1.5;
      return { x: u * bw, y: v * bh - raise * r * 0.55 * fall };
    };
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++)
        for (const tri of [
          [[i, j], [i + 1, j], [i, j + 1]],
          [[i + 1, j], [i + 1, j + 1], [i, j + 1]],
        ] as [number, number][][]) {
          const sP = tri.map(([a, b]) => pt(a, b, false));
          const dP = tri.map(([a, b]) => pt(a, b, true)).map((q) => ({ x: q.x + x0, y: q.y + y0 }));
          drawTriangleFrom(g, tmp, sP, dP);
        }
  }
}

/** Preston Blair mouth shapes: [width factor, opening factor] (AI, E, O, U, WQ, MBP, FV, L, etc, rest). */
const SHAPES: Record<string, [number, number]> = { AI: [1, 1], E: [1.1, 0.55], O: [0.62, 0.9], U: [0.45, 0.5], WQ: [0.5, 0.45], MBP: [0.88, 0], FV: [0.9, 0.18], L: [0.85, 0.6], etc: [0.9, 0.45], rest: [0.85, 0] };
/** Draws one cartoon mouth: lips, dark opening, upper teeth, tongue; closed = a lip line; corners follow the emotion. */
function drawMouth(g: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, cx: number, cy: number, mw: number, mh: number, shape: string, open: number, smile: number, lip: string) {
  const [wf, of] = SHAPES[shape] ?? SHAPES.etc!;
  const w = Math.max(4, mw * 0.95 * wf);
  const hOpen = Math.max(0, mh * 1.5 * Math.min(1, open) * (of > 0 ? Math.max(of, 0.3) : 0));
  const corner = -smile * mh * 0.35;
  const lx = cx - w / 2;
  const rx = cx + w / 2;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (hOpen < mh * 0.12) {
    // Closed: a lip line curved by the emotion (smile up, frown down), pressed lips for M/B/P.
    g.strokeStyle = lip;
    g.lineWidth = Math.max(2, mh * (shape === 'MBP' ? 0.32 : 0.24));
    g.beginPath();
    g.moveTo(lx, cy + corner);
    g.quadraticCurveTo(cx, cy - corner * 0.6 + mh * 0.05, rx, cy + corner);
    g.stroke();
    g.strokeStyle = 'rgba(30,8,10,0.85)';
    g.lineWidth = Math.max(1, mh * 0.07);
    g.beginPath();
    g.moveTo(lx + w * 0.06, cy + corner * 0.9);
    g.quadraticCurveTo(cx, cy - corner * 0.5 + mh * 0.05, rx - w * 0.06, cy + corner * 0.9);
    g.stroke();
    g.restore();
    return;
  }
  const top = cy - hOpen * 0.42;
  const bottom = cy + hOpen * 0.58;
  const path = () => {
    g.beginPath();
    g.moveTo(lx, cy + corner);
    g.bezierCurveTo(lx + w * 0.15, top - hOpen * 0.05, rx - w * 0.15, top - hOpen * 0.05, rx, cy + corner);
    g.bezierCurveTo(rx - w * 0.12, bottom + hOpen * 0.12, lx + w * 0.12, bottom + hOpen * 0.12, lx, cy + corner);
    g.closePath();
  };
  // Lips (outline thickness), then the dark inside.
  path();
  g.strokeStyle = lip;
  g.lineWidth = Math.max(2, mh * 0.26);
  g.stroke();
  g.fillStyle = '#2a090b';
  g.fill();
  g.save();
  path();
  g.clip();
  // Upper teeth (not for the rounded O / U / WQ), tongue at the bottom.
  if (!['O', 'U', 'WQ'].includes(shape) && hOpen > mh * 0.25) {
    g.fillStyle = '#f4efe6';
    g.fillRect(lx, top - hOpen * 0.1, w, hOpen * (shape === 'FV' ? 0.75 : 0.3));
  }
  g.fillStyle = '#c9545e';
  g.beginPath();
  g.ellipse(cx, bottom + hOpen * (shape === 'L' ? -0.25 : 0.05), w * 0.32, hOpen * 0.32, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.restore();
}
/** Like drawTriangle, but from an arbitrary source surface in its own pixel coordinates. */
function drawTriangleFrom(g: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, s: { x: number; y: number }[], d: { x: number; y: number }[]) {
  drawTriangle(g, img, img.width, img.height, s, d);
}

/** Draws the source triangle s of the image onto the destination triangle d (affine map, clipped, slight overlap). */
function drawTriangle(g: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, img: CanvasImageSource, W: number, H: number, s: { x: number; y: number }[], d: { x: number; y: number }[]) {
  const [s0, s1, s2] = s as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  const [d0, d1, d2] = d as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  const den = s0.x * (s2.y - s1.y) - s1.x * s2.y + s2.x * s1.y + (s1.x - s2.x) * s0.y;
  if (Math.abs(den) < 1e-6) return;
  const a = -(s0.y * (d2.x - d1.x) - s1.y * d2.x + s2.y * d1.x + (s1.y - s2.y) * d0.x) / den;
  const b = (s1.y * d2.y + s0.y * (d1.y - d2.y) - s2.y * d1.y + (s2.y - s1.y) * d0.y) / den;
  const c = (s0.x * (d2.x - d1.x) - s1.x * d2.x + s2.x * d1.x + (s1.x - s2.x) * d0.x) / den;
  const dd = -(s1.x * d2.y + s0.x * (d1.y - d2.y) - s2.x * d1.y + (s2.x - s1.x) * d0.y) / den;
  const e = (s0.x * (s2.y * d1.x - s1.y * d2.x) + s0.y * (s1.x * d2.x - s2.x * d1.x) + (s2.x * s1.y - s1.x * s2.y) * d0.x) / den;
  const f = (s0.x * (s2.y * d1.y - s1.y * d2.y) + s0.y * (s1.x * d2.y - s2.x * d1.y) + (s2.x * s1.y - s1.x * s2.y) * d0.y) / den;
  // Slightly enlarged clip (no hairline seams between triangles).
  const cx = (d0.x + d1.x + d2.x) / 3;
  const cy = (d0.y + d1.y + d2.y) / 3;
  const grow = (p: { x: number; y: number }) => ({ x: p.x + (p.x - cx) * 0.04 + Math.sign(p.x - cx) * 0.6, y: p.y + (p.y - cy) * 0.04 + Math.sign(p.y - cy) * 0.6 });
  const [e0, e1, e2] = [grow(d0), grow(d1), grow(d2)];
  g.save();
  g.beginPath();
  g.moveTo(e0.x, e0.y);
  g.lineTo(e1.x, e1.y);
  g.lineTo(e2.x, e2.y);
  g.closePath();
  g.clip();
  g.setTransform(a, b, c, dd, e, f);
  g.drawImage(img, 0, 0, W, H);
  g.restore();
}
