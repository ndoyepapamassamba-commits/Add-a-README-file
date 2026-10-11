// MARIONNETTE AFRIKATOON — browser renderer: the scene image is drawn, then each rigged character is redrawn through
// its deformed mesh (affine-mapped triangles), then its eyes blink and its mouth opens with the voice.
import { deformPoint, poseAt, warpGrid, type Pose, type PuppetCharacter, type PuppetRig } from '../../../server/jev/studio/puppet';

export interface PuppetFrameInput {
  t: number;
  /** -1 left, 0 centre, 1 right (who is speaking), and the voice level 0..1. */
  side: number;
  energy: number;
  speaking: boolean;
  action?: string;
  emphasis?: number;
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
  constructor(
    private img: CanvasImageSource & { width: number; height: number },
    private rig: PuppetRig,
  ) {
    const k = Math.min(1, 720 / Math.max(1, img.width));
    const w = Math.round(img.width * k);
    const h = Math.round(img.height * k);
    this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    this.g = this.canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    this.g.drawImage(img, 0, 0, w, h);
    this.src = this.g.getImageData(0, 0, w, h).data;
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
    g.drawImage(this.img, 0, 0, W, H);
    const talker = f.speaking ? speakerOf(this.rig.characters, f.side) : undefined;
    for (const c of this.rig.characters) {
      const pose = poseAt(c, f.t, { speaking: c === talker, energy: f.energy, emphasis: c === talker ? f.emphasis : 0, action: f.action });
      this.drawMesh(c, pose, W, H);
      this.drawFace(c, pose, W, H);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return this.canvas;
  }
  private drawMesh(c: PuppetCharacter, p: Pose, W: number, H: number) {
    const { g } = this;
    const m = warpGrid(c, p);
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
          if (s.every((q, k) => Math.abs(q.x - d[k]!.x) < 0.15 && Math.abs(q.y - d[k]!.y) < 0.15)) continue;
          drawTriangle(g, this.img, W, H, s, d);
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
    if (c.mouth && p.mouth > 0.05) {
      const mc = deformPoint(c, p, { x: c.mouth.x + c.mouth.w / 2, y: c.mouth.y + c.mouth.h / 2 });
      const rx = c.mouth.w * W * 0.34;
      const ry = Math.max(1, c.mouth.h * H * 0.55 * p.mouth);
      g.fillStyle = 'rgb(58,14,16)';
      g.beginPath();
      g.ellipse(mc.x * W, mc.y * H, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(200,82,92,0.9)';
      g.beginPath();
      g.ellipse(mc.x * W, mc.y * H + ry * 0.45, rx * 0.6, ry * 0.42, 0, 0, Math.PI * 2);
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
