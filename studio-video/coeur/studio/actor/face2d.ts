/**
 * LE VISAGE D'UNE POSE DESSINÉE — where the drawn mouth, chin and eyes of a character sheet really are, so the actor
 * talks with ITS OWN lips (the lower lip and the jaw of the art move down, the inside of the mouth appears between the
 * lips) and blinks with its own eyes. The landmarks come from a face detector (MediaPipe FaceLandmarker: lips, chin,
 * eyes, irises); this module refines them on the pixels of the art: the seam between the lips (the darkest line of the
 * mouth), the white of each eye (cartoon eyes are much larger than the detector's human eyes), the colour of the lid and
 * of the inside of the mouth. Nothing is guessed: no landmarks → no face (the caller keeps the actor without lip-sync
 * and says so). Coordinates: fractions of the pose (x of its width, y of its height, from the top-left); radii in
 * fractions of its HEIGHT.
 */

/** MediaPipe FaceLandmarker indices kept for a pose. */
export const LIP_UPPER_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
export const LIP_LOWER_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];
export const EYE_A = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const EYE_B = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
/** Every index a sheet needs (lips, chin, nose, eyes and irises). */
export const FACE_IDX = [...new Set([61, 291, 0, 17, 13, 14, 152, 1, 234, 454, ...LIP_UPPER_INNER, ...LIP_LOWER_INNER, ...EYE_A, ...EYE_B, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477])].sort((a, b) => a - b);

export type Pt = [number, number];
export interface SheetEye {
  /** Centre of the visible eye (white + iris). */
  c: Pt;
  rx: number;
  ry: number;
}
export interface SheetFace {
  /** Mouth corners, the middle of the seam between the lips, top of the upper lip, bottom of the lower lip. */
  l: Pt;
  r: Pt;
  seam: Pt;
  top: Pt;
  bottom: Pt;
  /** Inner opening of the DRAWN mouth over its width (0 = closed lips; a laughing mouth ≈ 0.4). */
  open: number;
  chin: Pt;
  /** The open eyes of the art (none when they are closed — laughing — or hidden — sunglasses). */
  eyes: SheetEye[];
  /** Skin of the lids (above the eyes) and the inside of the mouth, 0..1. */
  lid: [number, number, number];
  cavity: [number, number, number];
}
export interface Rgba {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

const lum = (d: Rgba['data'], i: number) => 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
const sat = (d: Rgba['data'], i: number) => Math.max(d[i]!, d[i + 1]!, d[i + 2]!) - Math.min(d[i]!, d[i + 1]!, d[i + 2]!);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

/**
 * The seam between closed lips at column x: the darkest row (luminance smoothed over 3 rows) between y0 and y1.
 */
export function seamRow(img: Rgba, x: number, y0: number, y1: number): number | null {
  const { data, width, height } = img;
  const xi = Math.round(x);
  if (xi < 0 || xi >= width) return null;
  let best = Infinity;
  let at: number | null = null;
  for (let y = Math.max(1, Math.round(y0)); y <= Math.min(height - 2, Math.round(y1)); y++) {
    let s = 0;
    for (let k = -1; k <= 1; k++) s += lum(data, ((y + k) * width + xi) * 4);
    if (s < best) {
      best = s;
      at = y;
    }
  }
  return at;
}

/** Connected pieces (4-neighbours) of a mask inside a window: their boxes and sizes. */
function pieces(test: (x: number, y: number) => boolean, x0: number, y0: number, x1: number, y1: number) {
  const W = x1 - x0 + 1;
  const H = y1 - y0 + 1;
  const seen = new Uint8Array(W * H);
  const out: { x0: number; x1: number; y0: number; y1: number; n: number; edge: boolean }[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const p = (y - y0) * W + (x - x0);
      if (seen[p] || !test(x, y)) continue;
      seen[p] = 1;
      const stack = [p];
      const c = { x0: x, x1: x, y0: y, y1: y, n: 0, edge: false };
      while (stack.length) {
        const q = stack.pop()!;
        const qx = (q % W) + x0;
        const qy = Math.floor(q / W) + y0;
        c.n++;
        if (qx === x0 || qy === y0 || qx === x1 || qy === y1) c.edge = true;
        c.x0 = Math.min(c.x0, qx);
        c.x1 = Math.max(c.x1, qx);
        c.y0 = Math.min(c.y0, qy);
        c.y1 = Math.max(c.y1, qy);
        for (const [nx, ny] of [
          [qx + 1, qy],
          [qx - 1, qy],
          [qx, qy + 1],
          [qx, qy - 1],
        ] as const) {
          if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
          const n = (ny - y0) * W + (nx - x0);
          if (!seen[n] && test(nx, ny)) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
      out.push(c);
    }
  return out;
}

/**
 * The open eyes of a drawn face, read on the art (cartoon eyes are about twice the detector's human eye): the WHITE of
 * each eye (light, unsaturated pieces between the brows and the nose), its pieces on both sides of the iris joined, the
 * iris added where the eye looks sideways (the dark run beyond the white). An eye is kept only near an iris landmark.
 * Closed (laughing) or hidden (sunglasses) eyes have no white → no eye.
 */
export function eyesOf(img: Rgba, irises: Pt[], eyeW: number, noseY: number): { c: Pt; rx: number; ry: number }[] {
  const { data, width, height } = img;
  if (!irises.length) return [];
  const xs = irises.map((p) => p[0]);
  const ys = irises.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - eyeW * 1.6));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(...xs) + eyeW * 1.6));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - eyeW * 1.3));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(Math.max(...ys) + eyeW * 0.6, noseY - eyeW * 0.2)));
  if (x1 - x0 < 5 || y1 - y0 < 5) return [];
  const at = (x: number, y: number) => (y * width + x) * 4;
  const white = (x: number, y: number) => lum(data, at(x, y)) > 160 && sat(data, at(x, y)) < 60 && (data[at(x, y) + 3] ?? 255) > 128;
  const dark = (x: number, y: number) => lum(data, at(x, y)) < 105;
  const minN = Math.max(6, (eyeW * 0.12) ** 2);
  const ws = pieces(white, x0, y0, x1, y1).filter((c) => !c.edge && c.n >= minN && c.y1 - c.y0 >= 2);
  const eyes: { c: Pt; rx: number; ry: number }[] = [];
  for (const iris of irises) {
    // The white pieces of THIS eye: beside the iris row, within an eye width.
    const mine = ws.filter((c) => {
      const cy = (c.y0 + c.y1) / 2;
      const dx = c.x1 < iris[0] ? iris[0] - c.x1 : c.x0 > iris[0] ? c.x0 - iris[0] : 0;
      return dx < eyeW * 0.9 && Math.abs(cy - iris[1]) < eyeW * 0.55 && c.x1 - c.x0 < eyeW * 2.2;
    });
    if (!mine.length) continue;
    let bx0 = Math.min(...mine.map((c) => c.x0));
    let bx1 = Math.max(...mine.map((c) => c.x1)) + 1;
    const by0 = Math.min(...mine.map((c) => c.y0));
    const by1 = Math.max(...mine.map((c) => c.y1)) + 1;
    const n = mine.reduce((a, c) => a + c.n, 0);
    // The iris beyond the white (an eye looking sideways): dark run on the iris row past the white's edge.
    const row = Math.round(Math.min(Math.max(iris[1], by0), by1 - 1));
    const h = by1 - by0;
    for (const dir of [-1, 1] as const) {
      let x = dir < 0 ? bx0 - 1 : bx1;
      let run = 0;
      while (x > x0 && x < x1 && run < h && dark(x, row)) {
        x += dir;
        run++;
      }
      if (run >= 2) {
        if (dir < 0) bx0 = x + 1;
        else bx1 = x;
      }
    }
    if (n < (bx1 - bx0) * h * 0.1 || h < 3) continue;
    const e = { c: [(bx0 + bx1) / 2, (by0 + by1) / 2] as Pt, rx: (bx1 - bx0) / 2, ry: h / 2 };
    // A drawn eye sits in skin: around it (a ring 1.5× its size) mostly skin — not the dark lens of sunglasses.
    let skin = 0;
    let tot = 0;
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const x = Math.round(e.c[0] + Math.cos(a) * (e.rx * 1.5 + 2));
      const y = Math.round(e.c[1] + Math.sin(a) * (e.ry * 1.5 + 2));
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      tot++;
      const i = at(x, y);
      if (lum(data, i) > 60 && sat(data, i) > 45) skin++;
    }
    if (!tot || skin / tot < 0.45) continue;
    // Two landmarks may grab the same eye (a face in profile): keep it once.
    if (!eyes.some((o) => Math.abs(o.c[0] - e.c[0]) < Math.min(o.rx, e.rx))) eyes.push(e);
  }
  return eyes;
}

/**
 * The face of one pose from its landmarks (pixels of the pose image): the mouth with the seam measured on the art,
 * the chin, the open eyes, the lid and mouth colours.
 */
export function faceRig(img: Rgba, lm: (i: number) => Pt | undefined): SheetFace | null {
  const L = lm(61);
  const R = lm(291);
  const it = lm(13);
  const ib = lm(14);
  const top = lm(0);
  const bot = lm(17);
  const chin = lm(152);
  if (!L || !R || !it || !ib || !top || !bot || !chin) return null;
  const { data, width: w, height: h } = img;
  const mw = Math.hypot(R[0] - L[0], R[1] - L[1]);
  if (mw < 4) return null;
  const open = Math.max(0, ib[1] - it[1]) / mw;
  // The seam: on closed lips, the darkest line around the middle of the inner contour (median of the central columns).
  const mid: Pt = [(it[0] + ib[0]) / 2, (it[1] + ib[1]) / 2];
  let seam: Pt = mid;
  if (open < 0.12) {
    const ys: number[] = [];
    for (let k = -3; k <= 3; k++) {
      const x = mid[0] + (k / 3) * mw * 0.12;
      const y = seamRow(img, x, mid[1] - mw * 0.12, mid[1] + mw * 0.12);
      if (y !== null) ys.push(y);
    }
    if (ys.length) seam = [mid[0], median(ys)];
  }
  // Inside of the mouth: the dark pixels of the drawn opening, else a deep red-brown.
  let cavity: [number, number, number] = [0.17, 0.04, 0.05];
  if (open >= 0.12) {
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    for (let y = Math.round(it[1]); y <= Math.round(ib[1]); y++)
      for (let x = Math.round(mid[0] - mw * 0.2); x <= Math.round(mid[0] + mw * 0.2); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = (y * w + x) * 4;
        if (lum(data, i) < 70) {
          rs.push(data[i]!);
          gs.push(data[i + 1]!);
          bs.push(data[i + 2]!);
        }
      }
    if (rs.length > 4) cavity = [median(rs) / 255, median(gs) / 255, median(bs) / 255];
  }
  // Eyes: the white of each drawn eye near the iris landmarks; the lid colour is the skin just above them.
  const ring = [...EYE_A, ...EYE_B].map((i) => lm(i)).filter((p): p is Pt => !!p);
  const ea = EYE_A.map((i) => lm(i)).filter((p): p is Pt => !!p);
  const eyeW = ea.length ? Math.max(...ea.map((p) => p[0])) - Math.min(...ea.map((p) => p[0])) : mw * 0.6;
  const irises = [lm(468), lm(473)].filter((p): p is Pt => !!p);
  const nose = lm(1);
  const found = ring.length >= 4 && nose ? eyesOf(img, irises, Math.max(6, eyeW), nose[1]) : [];
  const eyes: SheetEye[] = [];
  const lids: number[][] = [[], [], []];
  for (const e of found) {
    eyes.push({ c: [Math.round((e.c[0] / w) * 10000) / 10000, Math.round((e.c[1] / h) * 10000) / 10000], rx: Math.round((e.rx / h) * 10000) / 10000, ry: Math.round((e.ry / h) * 10000) / 10000 });
    for (let y = Math.round(e.c[1] - e.ry * 1.9); y <= Math.round(e.c[1] - e.ry * 1.25); y++)
      for (let x = Math.round(e.c[0] - e.rx * 0.6); x <= Math.round(e.c[0] + e.rx * 0.6); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = (y * w + x) * 4;
        if (data[i + 3] !== undefined && data[i + 3]! < 128) continue;
        if (lum(data, i) > 55 && sat(data, i) > 40) for (let k = 0; k < 3; k++) lids[k]!.push(data[i + k]!);
      }
  }
  const lid: [number, number, number] = lids[0]!.length > 4 ? [median(lids[0]!) / 255, median(lids[1]!) / 255, median(lids[2]!) / 255] : [0.55, 0.33, 0.22];
  const f = (p: Pt): Pt => [Math.round((p[0] / w) * 10000) / 10000, Math.round((p[1] / h) * 10000) / 10000];
  return { l: f(L), r: f(R), seam: f(seam), top: f(top), bottom: f(bot), open: Math.round(open * 1000) / 1000, chin: f(chin), eyes, lid, cavity };
}

/** Which way a drawn face looks: the nose off the middle of the face's sides (−1 left, 1 right, 0 camera). */
export function facingOf(lm: (i: number) => Pt | undefined): -1 | 0 | 1 | undefined {
  const nose = lm(1);
  const a = lm(234);
  const b = lm(454);
  if (!nose || !a || !b) return undefined;
  const wFace = Math.abs(b[0] - a[0]);
  const d = nose[0] - (a[0] + b[0]) / 2;
  return Math.abs(d) < wFace * 0.06 ? 0 : d > 0 ? 1 : -1;
}
