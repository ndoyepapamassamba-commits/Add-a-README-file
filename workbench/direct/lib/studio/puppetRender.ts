// MARIONNETTE AFRIKATOON — browser renderer: the scene image is drawn, then each rigged character is redrawn through
// its deformed mesh (affine-mapped triangles), then its eyes blink and its mouth opens with the voice.
import { deformPoint, poseAt, warpGrid, type Pose, type PuppetCharacter, type PuppetRig } from '../../../server/jev/studio/puppet';
import { characterLayer, inpaint, plateHole } from '../../../server/jev/studio/layers';

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
}
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
  /** Per character: colour matte (vertex weights) and whether the picture already shows an open mouth. */
  private matte = new Map<PuppetCharacter, (s: { x: number; y: number }) => number>();
  private mouthOpen = new Map<PuppetCharacter, boolean>();
  /** 2.5D layers: the clean background plate and one cut-out layer per character (null → single-image fallback). */
  private plate: Surface | null = null;
  private layers = new Map<PuppetCharacter, Surface>();
  /** Arms the cut-out really covers (the others keep still with the body). */
  private armsOk = new Map<PuppetCharacter, boolean[]>();
  /** The plate is the generated empty set (exact) rather than an inpainted guess: full amplitude is safe. */
  private exactPlate = false;
  constructor(
    private img: CanvasImageSource & { width: number; height: number },
    private rig: PuppetRig,
    /** The same shot without the characters, when the app generated it (exact cut-out, true background). */
    plateImg?: (CanvasImageSource & { width: number; height: number }) | null,
  ) {
    const k = Math.min(1, 720 / Math.max(1, img.width));
    const w = Math.round(img.width * k);
    const h = Math.round(img.height * k);
    this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    this.g = this.canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    this.g.drawImage(img, 0, 0, w, h);
    this.src = this.g.getImageData(0, 0, w, h).data;
    for (const c of rig.characters) {
      this.matte.set(c, this.buildMatte(c, w, h));
      this.mouthOpen.set(c, this.darkFraction(c, w, h) > 0.3);
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
    this.buildLayers(w, h, plateSrc);
  }
  /**
   * Cuts the still into layers: a matte per character, a clean plate (characters removed, holes filled by push-pull),
   * a cut-out per character. A matte that looks wrong (almost empty / almost the whole box) keeps the single-image mode.
   */
  private buildLayers(w: number, h: number, plateSrc?: Uint8ClampedArray) {
    const given = this.plate;
    try {
      const chars = this.rig.characters;
      const cuts = chars.map((c) => characterLayer(this.src, w, h, c, chars.filter((o) => o !== c), plateSrc));
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
        return cov > 0.15 && cov < 0.93;
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
      });
    } catch {
      this.plate = null;
      this.layers.clear();
    }
  }
  /** True when the scene is rendered in 2.5D layers (plate + cut-outs). */
  get layered() {
    return this.plate !== null;
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
  /** Share of dark pixels in the mouth box: the picture already shows an open mouth (then only the jaw moves). */
  private darkFraction(c: PuppetCharacter, w: number, h: number) {
    if (!c.mouth) return 0;
    let dark = 0, n = 0;
    for (let y = c.mouth.y; y < c.mouth.y + c.mouth.h; y += c.mouth.h / 8)
      for (let x = c.mouth.x; x < c.mouth.x + c.mouth.w; x += c.mouth.w / 8) {
        const [r, g2, b] = this.patch(x * w, y * h, w, h, 0);
        if (0.3 * r + 0.59 * g2 + 0.11 * b < 70) dark++;
        n++;
      }
    return n ? dark / n : 0;
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
    g.drawImage(this.plate ?? this.img, 0, 0, W, H);
    const talker = f.speaking ? speakerOf(this.rig.characters, f.side) : undefined;
    // Back to front: the character whose feet are higher in the frame is further away.
    for (const c of [...this.rig.characters].sort((a, b) => a.box.y + a.box.h - (b.box.y + b.box.h))) {
      // Each character faces the nearest other one: leans, points and arm swings go towards them.
      const cx = c.box.x + c.box.w / 2;
      const other = this.rig.characters.filter((o) => o !== c).sort((a, b) => Math.abs(a.box.x + a.box.w / 2 - cx) - Math.abs(b.box.x + b.box.w / 2 - cx))[0];
      const facing = other ? (other.box.x + other.box.w / 2 >= cx ? 1 : -1) : cx < 0.5 ? 1 : -1;
      const mine = c === talker;
      const pose = poseAt(c, f.t, {
        speaking: mine,
        energy: f.energy,
        emphasis: mine ? f.emphasis : 0,
        action: f.action,
        facing,
        emotion: f.emotion,
        ...(mine && f.viseme !== undefined ? { viseme: f.viseme } : {}),
        ...(mine && f.gesture ? { gesture: f.gesture, age: f.lineAge ?? 1 } : {}),
      });
      this.drawMesh(c, pose, W, H);
      this.drawFace(c, pose, W, H);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return this.canvas;
  }
  private drawMesh(c: PuppetCharacter, p: Pose, W: number, H: number) {
    const { g } = this;
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
          drawTriangle(g, layer ?? this.img, W, H, s, d);
        }
      }
  }
  private drawFace(c: PuppetCharacter, p: Pose, W: number, H: number) {
    const { g, src } = this;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (p.blink > 0.05)
      for (const e of c.eyes) {
        const q = deformPoint(c, p, e);
        const r = e.r * W;
        // Eyelid in the skin colour just above the eye, closing from the top.
        g.fillStyle = rgb(src, W, H, e.x * W, (e.y - e.r * 2.4) * H);
        g.beginPath();
        g.ellipse(q.x * W, q.y * H - r * (1 - p.blink) * 0.6, r * 1.35, r * 1.35 * p.blink, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(25,15,10,0.85)';
        g.lineWidth = Math.max(1, r * 0.22);
        g.beginPath();
        g.ellipse(q.x * W, q.y * H + r * 0.35 * p.blink, r * 1.2, r * 0.25, 0, 0, Math.PI);
        g.stroke();
      }
    // A mouth already open in the picture is animated by the jaw alone; a closed one gets a soft dark opening
    // (feathered edge, no outline) that the jaw then stretches.
    if (c.mouth && p.mouth > 0.05 && !this.mouthOpen.get(c)) {
      const mc = deformPoint(c, p, { x: c.mouth.x + c.mouth.w / 2, y: c.mouth.y + c.mouth.h / 2 });
      const rx = c.mouth.w * W * 0.3;
      const ry = Math.max(1, c.mouth.h * H * 0.42 * p.mouth);
      const x = mc.x * W;
      const y = mc.y * H + ry * 0.3;
      const grad = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      grad.addColorStop(0, 'rgba(45,10,12,0.95)');
      grad.addColorStop(0.7, 'rgba(60,16,18,0.85)');
      grad.addColorStop(1, 'rgba(60,16,18,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
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
