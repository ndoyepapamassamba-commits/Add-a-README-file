/**
 * CLEAN TEMPLATE — the chosen dashboard image with its CONTENT removed and its DESIGN kept, pixel for pixel:
 * backgrounds and their gradients, cards, header bands, sidebars, buttons, frames, zebra rows and soft shadows stay;
 * texts, chart marks, logos, icons and photos are erased and filled from the surrounding surface. The user's data is
 * then drawn on it at the same places, so the reproduction matches the image by construction (never its texts, logos
 * or photos — only its design).
 *
 * How: the image is split into flat regions (neighbouring pixels of nearly the same colour, so gradients stay one
 * region); a SURFACE is a big and thick region (not a thin glyph stroke); a CARD is a big, rectangular surface (its
 * header band merged in); inside a card only its own surface and full-width bands are design — anything else is a
 * chart mark. Erased pixels are filled by a multi-scale average of the kept ones (smooth across gradients). Text lines
 * (erased thin strokes) are returned with their box, colour and size to place the new texts exactly. Pure.
 */
export interface PxBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface TextLine {
  box: PxBox;
  color: string;
  /** Text height in pixels (cap height + descenders). */
  size: number;
}
export interface Template {
  bg: Uint8ClampedArray;
  /** 1 = pixel erased (content), 0 = design kept. */
  erased: Uint8Array;
  cards: PxBox[];
  texts: TextLine[];
  /** Share of the image kept as design. */
  kept: number;
  /** The given panel boxes snapped to the exact edges of their card (same order). */
  snapped: PxBox[];
}
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const lumOf = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Robust smooth model of a panel background: c = a + b·x + c·y + d·y² per channel, outliers (content) rejected. */
function fitBackground(px: ArrayLike<number>, w: number, pts: number[], box: PxBox): ((x: number, y: number) => [number, number, number]) | null {
  if (pts.length < 30) return null;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const sx = Math.max(1, (box.x1 - box.x0) / 2);
  const sy = Math.max(1, (box.y1 - box.y0) / 2);
  const feats = (i: number) => {
    const x = ((i % w) - cx) / sx;
    const y = (Math.floor(i / w) - cy) / sy;
    return [1, x, y, y * y];
  };
  let use = pts.length > 6000 ? pts.filter((_, k) => k % Math.ceil(pts.length / 6000) === 0) : pts;
  let coef: number[][] = [];
  for (let it = 0; it < 4; it++) {
    coef = [0, 1, 2].map((c) => {
      // Normal equations (4 × 4).
      const A = Array.from({ length: 4 }, () => new Float64Array(4));
      const B = new Float64Array(4);
      for (const i of use) {
        const f = feats(i);
        const v = px[i * 4 + c]!;
        for (let a = 0; a < 4; a++) {
          B[a]! += f[a]! * v;
          for (let b = 0; b < 4; b++) A[a]![b]! += f[a]! * f[b]!;
        }
      }
      for (let a = 0; a < 4; a++) A[a]![a]! += 1e-6;
      // Gaussian elimination.
      const M = A.map((r, k) => [...r, B[k]!]);
      for (let col = 0; col < 4; col++) {
        let piv = col;
        for (let r = col + 1; r < 4; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
        [M[col], M[piv]] = [M[piv]!, M[col]!];
        const d = M[col]![col]! || 1e-9;
        for (let r = 0; r < 4; r++) {
          if (r === col) continue;
          const f = M[r]![col]! / d;
          for (let k = col; k < 5; k++) M[r]![k]! -= f * M[col]![k]!;
        }
      }
      return M.map((r, k) => r[4]! / (M[k]![k]! || 1e-9));
    });
    const model = (i: number) => {
      const f = feats(i);
      return coef.map((cf) => cf.reduce((a, v, k) => a + v * f[k]!, 0));
    };
    const kept = use.filter((i) => {
      const m = model(i);
      return Math.abs(px[i * 4]! - m[0]!) + Math.abs(px[i * 4 + 1]! - m[1]!) + Math.abs(px[i * 4 + 2]! - m[2]!) < 36;
    });
    if (kept.length < 30 || kept.length === use.length) break;
    use = kept;
  }
  return (x: number, y: number) => {
    const fx = (x - cx) / sx;
    const fy = (y - cy) / sy;
    const f = [1, fx, fy, fy * fy];
    return coef.map((cf) => cf.reduce((a, v, k) => a + v * f[k]!, 0)) as [number, number, number];
  };
}

/**
 * `panels`: the panel boxes (from the vision model or the pixel detection). Inside each, only the design survives:
 * the panel's own background (smooth model), full-width bands (header, zebra rows), inner tiles, its frame; every
 * other mark is erased and replaced by the background model.
 */
export function cleanTemplate(px: ArrayLike<number>, w: number, h: number, panels: PxBox[] = [], photos: ReadonlySet<number> = new Set()): Template {
  const N = w * h;
  // ── 1. flat regions (union-find; gradients stay one region) ────────────────────────────────────────────────────
  const parent = new Int32Array(N);
  for (let i = 0; i < N; i++) parent[i] = i;
  const find = (i: number) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra < rb ? rb : ra] = ra < rb ? ra : rb;
  };
  const T = 9;
  const near = (i: number, j: number) => Math.abs(px[i * 4]! - px[j * 4]!) <= T && Math.abs(px[i * 4 + 1]! - px[j * 4 + 1]!) <= T && Math.abs(px[i * 4 + 2]! - px[j * 4 + 2]!) <= T;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x + 1 < w && near(i, i + 1)) unite(i, i + 1);
      if (y + 1 < h && near(i, i + w)) unite(i, i + w);
    }
  const rid = new Int32Array(N);
  const idOf = new Int32Array(N).fill(-1);
  let R = 0;
  for (let i = 0; i < N; i++) {
    const r = find(i);
    if (idOf[r]! < 0) idOf[r] = R++;
    rid[i] = idOf[r]!;
  }
  const area = new Float64Array(R);
  const perim = new Float64Array(R);
  const bx0 = new Int32Array(R).fill(w);
  const by0 = new Int32Array(R).fill(h);
  const bx1 = new Int32Array(R).fill(-1);
  const by1 = new Int32Array(R).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = rid[i]!;
      area[r]!++;
      if (x < bx0[r]!) bx0[r] = x;
      if (x > bx1[r]!) bx1[r] = x;
      if (y < by0[r]!) by0[r] = y;
      if (y > by1[r]!) by1[r] = y;
      if (x === 0 || rid[i - 1] !== r) perim[r]!++;
      if (x === w - 1 || rid[i + 1] !== r) perim[r]!++;
      if (y === 0 || rid[i - w] !== r) perim[r]!++;
      if (y === h - 1 || rid[i + w] !== r) perim[r]!++;
    }
  // ── 2. surfaces and cards ────────────────────────────────────────────────────────────────────────────────────────
  const minArea = N * 0.0004;
  const minThick = Math.max(4, Math.min(w, h) * 0.009);
  const surface = new Uint8Array(R);
  for (let r = 0; r < R; r++) if (area[r]! >= minArea && area[r]! / Math.max(1, perim[r]! / 2) >= minThick) surface[r] = 1;
  // Rectangularity of big surfaces: their row spans (holes included) fill their box.
  const big: number[] = [];
  for (let r = 0; r < R; r++) if (surface[r] && area[r]! >= N * 0.008 && area[r]! <= N * 0.6) big.push(r);
  const bigIdx = new Map(big.map((r, k) => [r, k]));
  const spanMin = big.map((r) => new Int32Array(by1[r]! - by0[r]! + 1).fill(w));
  const spanMax = big.map((r) => new Int32Array(by1[r]! - by0[r]! + 1).fill(-1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = bigIdx.get(rid[y * w + x]!);
      if (k === undefined) continue;
      const r = big[k]!;
      const row = y - by0[r]!;
      if (x < spanMin[k]![row]!) spanMin[k]![row] = x;
      if (x > spanMax[k]![row]!) spanMax[k]![row] = x;
    }
  const cardBoxes: { r: number; box: PxBox }[] = [];
  big.forEach((r, k) => {
    const bw = bx1[r]! - bx0[r]! + 1;
    const bh = by1[r]! - by0[r]! + 1;
    let covered = 0;
    for (let row = 0; row < bh; row++) if (spanMax[k]![row]! >= 0) covered += spanMax[k]![row]! - spanMin[k]![row]! + 1;
    const rect = covered / (bw * bh);
    // The page / outer background touches the image border on most sides; a card does not.
    const touches = +(bx0[r]! <= 1) + +(by0[r]! <= 1) + +(bx1[r]! >= w - 2) + +(by1[r]! >= h - 2);
    if (rect >= 0.86 && touches <= 1 && bw * bh <= N * 0.5 && bw >= w * 0.06 && bh >= h * 0.06) cardBoxes.push({ r, box: { x0: bx0[r]!, y0: by0[r]!, x1: bx1[r]! + 1, y1: by1[r]! + 1 } });
  });
  // A card nested in a bigger card (a tile on a band) is kept; a band on top of a card (its header) is merged in.
  for (const c of cardBoxes) {
    for (let r = 0; r < R; r++) {
      if (!surface[r] || r === c.r) continue;
      const w0 = bx1[r]! - bx0[r]! + 1;
      const cw = c.box.x1 - c.box.x0;
      if (Math.abs(by1[r]! + 1 - c.box.y0) <= 3 && Math.min(bx1[r]! + 1, c.box.x1) - Math.max(bx0[r]!, c.box.x0) >= cw * 0.85 && w0 <= cw * 1.1 && by1[r]! - by0[r]! < (c.box.y1 - c.box.y0) * 0.3) c.box.y0 = by0[r]!;
    }
  }
  const cards = cardBoxes
    .map((c) => c.box)
    .filter((b, i, all) => !all.some((o, j) => j !== i && o.x0 <= b.x0 + 2 && o.y0 <= b.y0 + 2 && o.x1 >= b.x1 - 2 && o.y1 >= b.y1 - 2 && (o.x1 - o.x0) * (o.y1 - o.y0) < (b.x1 - b.x0) * (b.y1 - b.y0) * 1.02 && j < i));
  // Inside a card, a surface narrower than 85 % of it is a chart mark (bar, slice, area) — erased.
  const mark = new Uint8Array(R);
  for (let r = 0; r < R; r++) {
    if (!surface[r]) continue;
    for (const c of cardBoxes) {
      if (c.r === r) continue;
      const inside = bx0[r]! >= c.box.x0 && bx1[r]! < c.box.x1 && by0[r]! >= c.box.y0 && by1[r]! < c.box.y1;
      if (inside && bx1[r]! - bx0[r]! + 1 < (c.box.x1 - c.box.x0) * 0.85) {
        mark[r] = 1;
        break;
      }
    }
  }
  // Panels given: inside each, the panel's own background region (largest region inside), bands (≥ 85 % of the width,
  // ≤ 30 % of the height), inner tiles (rectangular, ≥ 6 % of the panel) and frame rings are design; anything else is a
  // mark. Regions reaching outside the panel (the page around a rounded corner) are context, kept.
  type PanelInfo = { box: PxBox; bgR: number; keepR: Set<number>; fit: ((x: number, y: number) => [number, number, number]) | null; photo: boolean };
  // The card's own edge (border line, inner shadow) is design: a thin ring along the box is kept as is.
  const ring = Math.max(3, Math.round(Math.min(w, h) * 0.006));
  const infos: PanelInfo[] = [];
  const snapped: PxBox[] = [];
  for (const [pi, pb] of panels.entries()) {
    let box = { x0: Math.max(0, Math.round(pb.x0)), y0: Math.max(0, Math.round(pb.y0)), x1: Math.min(w, Math.round(pb.x1)), y1: Math.min(h, Math.round(pb.y1)) };
    // Snap to the card: the surface that fills most of the box, when its own box is close (a model's box is a few
    // pixels off; the card's edges are exact).
    {
      const cnt = new Map<number, number>();
      for (let y = box.y0; y < box.y1; y += 2) for (let x = box.x0; x < box.x1; x += 2) cnt.set(rid[y * w + x]!, (cnt.get(rid[y * w + x]!) ?? 0) + 1);
      let best = -1;
      let bestN = 0;
      for (const [r, n] of cnt) if (surface[r] && n > bestN) {
        best = r;
        bestN = n;
      }
      const tw = (box.x1 - box.x0) * 0.05;
      const th = (box.y1 - box.y0) * 0.05;
      if (best >= 0 && Math.abs(bx0[best]! - box.x0) <= tw && Math.abs(bx1[best]! + 1 - box.x1) <= tw && Math.abs(by0[best]! - box.y0) <= th && Math.abs(by1[best]! + 1 - box.y1) <= th)
        box = { x0: bx0[best]!, y0: by0[best]!, x1: bx1[best]! + 1, y1: by1[best]! + 1 };
    }
    snapped.push(box);
    const bw = box.x1 - box.x0;
    const bh = box.y1 - box.y0;
    if (bw < 8 || bh < 8) continue;
    const inBox = new Map<number, number>();
    for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) inBox.set(rid[y * w + x]!, (inBox.get(rid[y * w + x]!) ?? 0) + 1);
    let bgR = -1;
    let bgN = 0;
    const keepR = new Set<number>();
    // The panel background SURROUNDS the content: it reaches the box edges on several sides (a big bar does not); a
    // surface reaching outside the box (the card is the page's colour, or the box is a bit tight) surrounds it too.
    const m = Math.max(3, Math.min(bw, bh) * 0.06);
    for (const [r, n] of inBox) {
      if (!surface[r] && n < bw * bh * 0.2) continue;
      const outside = bx0[r]! < box.x0 - 2 || by0[r]! < box.y0 - 2 || bx1[r]! > box.x1 + 1 || by1[r]! > box.y1 + 1;
      const sides = outside ? 4 : +(bx0[r]! <= box.x0 + m) + +(by0[r]! <= box.y0 + m) + +(bx1[r]! >= box.x1 - 1 - m) + +(by1[r]! >= box.y1 - 1 - m);
      const score = n * (1 + sides);
      if (score > bgN) {
        bgN = score;
        bgR = r;
      }
    }
    // Other surfaces reaching outside the box are context (the page around a rounded corner): kept.
    for (const [r, n] of inBox) {
      if (r === bgR) continue;
      const outside = bx0[r]! < box.x0 - 2 || by0[r]! < box.y0 - 2 || bx1[r]! > box.x1 + 1 || by1[r]! > box.y1 + 1;
      if (outside && n < bw * bh * 0.5) keepR.add(r);
    }
    // A photo panel: nothing of the picture is design — only the context around it; its background is the smooth model of
    // the whole picture (its tones, none of its content).
    const photo = photos.has(pi);
    for (const [r, n] of inBox) {
      if (photo || r === bgR || keepR.has(r)) continue;
      const rw = bx1[r]! - bx0[r]! + 1;
      const rh = by1[r]! - by0[r]! + 1;
      const band = rw >= bw * 0.85 && rh <= bh * 0.3 && n >= rw * 2;
      const ring = rw >= bw * 0.9 && rh >= bh * 0.9;
      let tile = false;
      if (!band && !ring && n >= bw * bh * 0.06 && surface[r]) tile = n / (rw * rh) >= 0.86;
      if (band || ring || tile) keepR.add(r);
    }
    keepR.delete(bgR);
    const pts: number[] = [];
    if (photo) {
      for (let y = box.y0; y < box.y1; y += 3) for (let x = box.x0; x < box.x1; x += 3) if (!keepR.has(rid[y * w + x]!)) pts.push(y * w + x);
      bgR = -2; // no region is the background: every pixel is replaced by the model
    } else if (bgR >= 0) for (let y = box.y0; y < box.y1; y += 2) for (let x = box.x0; x < box.x1; x += 2) if (rid[y * w + x] === bgR) pts.push(y * w + x);
    infos.push({ box, bgR, keepR, fit: fitBackground(px, w, pts, box), photo });
  }
  const panelAt = new Int32Array(N).fill(-1);
  infos.forEach((p, k) => {
    for (let y = p.box.y0; y < p.box.y1; y++) for (let x = p.box.x0; x < p.box.x1; x++) panelAt[y * w + x] = k;
  });
  // ── 3. kept pixels: on a surface, close to the surface's local colour (a thin line glued to it is not) ─────────────
  const cell = Math.max(6, Math.round(Math.min(w, h) / 70));
  const cw = Math.ceil(w / cell);
  const ch = Math.ceil(h / cell);
  const loc = new Map<number, [number, number, number, number]>();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = rid[i]!;
      if (!surface[r] || mark[r]) continue;
      const key = r * cw * ch + Math.floor(y / cell) * cw + Math.floor(x / cell);
      const v = loc.get(key) ?? [0, 0, 0, 0];
      v[0] += px[i * 4]!;
      v[1] += px[i * 4 + 1]!;
      v[2] += px[i * 4 + 2]!;
      v[3]++;
      loc.set(key, v);
    }
  const erased = new Uint8Array(N);
  let keptN = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = rid[i]!;
      let keep = false;
      const pk = panelAt[i]!;
      if (pk >= 0) {
        const P = infos[pk]!;
        const onRing = !P.photo && (x - P.box.x0 < ring || P.box.x1 - 1 - x < ring || y - P.box.y0 < ring || P.box.y1 - 1 - y < ring);
        if (P.keepR.has(r) || onRing) keep = true;
        else if (r === P.bgR && P.fit) {
          const m = P.fit(x, y);
          keep = Math.abs(px[i * 4]! - m[0]) + Math.abs(px[i * 4 + 1]! - m[1]) + Math.abs(px[i * 4 + 2]! - m[2]) < 16;
        }
      } else if (surface[r] && !mark[r]) {
        const v = loc.get(r * cw * ch + Math.floor(y / cell) * cw + Math.floor(x / cell))!;
        keep = Math.abs(px[i * 4]! - v[0] / v[3]) + Math.abs(px[i * 4 + 1]! - v[1] / v[3]) + Math.abs(px[i * 4 + 2]! - v[2] / v[3]) < 30;
      }
      if (keep) keptN++;
      else erased[i] = 1;
    }
  // Anti-aliased rims around erased content are erased too (no halo of the old text): two pixels around.
  let grown = erased.slice();
  for (let pass = 0; pass < 2; pass++) {
    const next = grown.slice();
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!grown[i] && (grown[i - 1] || grown[i + 1] || grown[i - w] || grown[i + w])) next[i] = 1;
      }
    grown = next;
  }
  // ── 4. fill: multi-scale average of the kept pixels ─────────────────────────────────────────────────────────────
  type Level = { w: number; h: number; c: Float64Array; n: Float64Array };
  const L0: Level = { w, h, c: new Float64Array(N * 3), n: new Float64Array(N) };
  for (let i = 0; i < N; i++)
    if (!grown[i]) {
      L0.c[i * 3] = px[i * 4]!;
      L0.c[i * 3 + 1] = px[i * 4 + 1]!;
      L0.c[i * 3 + 2] = px[i * 4 + 2]!;
      L0.n[i] = 1;
    }
  const levels: Level[] = [L0];
  while (levels[levels.length - 1]!.w > 1 || levels[levels.length - 1]!.h > 1) {
    const p = levels[levels.length - 1]!;
    const q: Level = { w: Math.ceil(p.w / 2), h: Math.ceil(p.h / 2), c: new Float64Array(Math.ceil(p.w / 2) * Math.ceil(p.h / 2) * 3), n: new Float64Array(Math.ceil(p.w / 2) * Math.ceil(p.h / 2)) };
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const a = y * p.w + x;
        const b = (y >> 1) * q.w + (x >> 1);
        q.n[b] = q.n[b]! + p.n[a]!;
        q.c[b * 3] = q.c[b * 3]! + p.c[a * 3]!;
        q.c[b * 3 + 1] = q.c[b * 3 + 1]! + p.c[a * 3 + 1]!;
        q.c[b * 3 + 2] = q.c[b * 3 + 2]! + p.c[a * 3 + 2]!;
      }
    levels.push(q);
  }
  // Top-down: each level's colour where it has kept pixels, else the (bilinear) colour of the level above.
  const filled: Float64Array[] = new Array(levels.length);
  for (let k = levels.length - 1; k >= 0; k--) {
    const L = levels[k]!;
    const f = new Float64Array(L.w * L.h * 3);
    const up = k + 1 < levels.length ? { f: filled[k + 1]!, w: levels[k + 1]!.w, h: levels[k + 1]!.h } : null;
    for (let y = 0; y < L.h; y++)
      for (let x = 0; x < L.w; x++) {
        const a = y * L.w + x;
        if (L.n[a]! > 0 && (k > 0 || !grown[a])) {
          for (let c = 0; c < 3; c++) f[a * 3 + c] = L.c[a * 3 + c]! / L.n[a]!;
        } else if (up) {
          const fx = Math.max(0, Math.min(up.w - 1, (x + 0.5) / 2 - 0.5));
          const fy = Math.max(0, Math.min(up.h - 1, (y + 0.5) / 2 - 0.5));
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const x1 = Math.min(up.w - 1, x0 + 1);
          const y1 = Math.min(up.h - 1, y0 + 1);
          const tx = fx - x0;
          const ty = fy - y0;
          for (let c = 0; c < 3; c++)
            f[a * 3 + c] =
              (up.f[(y0 * up.w + x0) * 3 + c]! * (1 - tx) + up.f[(y0 * up.w + x1) * 3 + c]! * tx) * (1 - ty) + (up.f[(y1 * up.w + x0) * 3 + c]! * (1 - tx) + up.f[(y1 * up.w + x1) * 3 + c]! * tx) * ty;
        }
      }
    filled[k] = f;
  }
  const bg = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    const pk = panelAt[i]!;
    const P = pk >= 0 ? infos[pk]! : null;
    if (grown[i] && P?.fit) {
      // Inside a panel: the panel background model, unless the pixel lies on a kept band / tile (then the diffusion).
      let onKept = false;
      const x = i % w;
      const y = (i - x) / w;
      for (const r of P.keepR) if (x >= bx0[r]! && x <= bx1[r]! && y >= by0[r]! && y <= by1[r]! && bx0[r]! >= P.box.x0 - 2 && bx1[r]! <= P.box.x1 + 1 && by0[r]! >= P.box.y0 - 2 && by1[r]! <= P.box.y1 + 1) {
        onKept = true;
        break;
      }
      if (!onKept) {
        const m = P.fit(x, y);
        bg[i * 4] = m[0];
        bg[i * 4 + 1] = m[1];
        bg[i * 4 + 2] = m[2];
        bg[i * 4 + 3] = 255;
        continue;
      }
    }
    if (grown[i]) {
      bg[i * 4] = filled[0]![i * 3]!;
      bg[i * 4 + 1] = filled[0]![i * 3 + 1]!;
      bg[i * 4 + 2] = filled[0]![i * 3 + 2]!;
    } else {
      bg[i * 4] = px[i * 4]!;
      bg[i * 4 + 1] = px[i * 4 + 1]!;
      bg[i * 4 + 2] = px[i * 4 + 2]!;
    }
    bg[i * 4 + 3] = 255;
  }
  // ── 5. text lines: erased thin strokes contrasting with the filled background, grouped along the line ────────────
  const ink = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = rid[i]!;
    if (!erased[i] || mark[r] || area[r]! > N * 0.004) continue;
    const dl = Math.abs(lumOf(px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!) - lumOf(bg[i * 4]!, bg[i * 4 + 1]!, bg[i * 4 + 2]!));
    if (dl > 0.22) ink[i] = 1;
  }
  // Group ink by rows of a coarse grid, joined horizontally across small gaps.
  const g = Math.max(1, Math.round(Math.min(w, h) / 450));
  const gw = Math.ceil(w / g);
  const gh = Math.ceil(h / g);
  const gm = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink[y * w + x]) gm[Math.floor(y / g) * gw + Math.floor(x / g)] = 1;
  const lab = new Int32Array(gw * gh).fill(-1);
  const boxes: { x0: number; y0: number; x1: number; y1: number; n: number }[] = [];
  const gapX = Math.max(3, Math.round(8 / g));
  for (let i = 0; i < gw * gh; i++) {
    if (!gm[i] || lab[i]! >= 0) continue;
    const id = boxes.length;
    const b = { x0: gw, y0: gh, x1: 0, y1: 0, n: 0 };
    const st = [i];
    lab[i] = id;
    while (st.length) {
      const k = st.pop()!;
      const x = k % gw;
      const y = (k - x) / gw;
      b.n++;
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
      for (let dx = -gapX; dx <= gapX; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const nk = ny * gw + nx;
          if (gm[nk] && lab[nk]! < 0) {
            lab[nk] = id;
            st.push(nk);
          }
        }
    }
    boxes.push(b);
  }
  const texts: TextLine[] = [];
  for (const b of boxes) {
    const box = { x0: b.x0 * g, y0: b.y0 * g, x1: Math.min(w, (b.x1 + 1) * g), y1: Math.min(h, (b.y1 + 1) * g) };
    const bh = box.y1 - box.y0;
    const bw = box.x1 - box.x0;
    // A text line is wider than tall and not huge (a photo leftover is not text).
    if (bh < 5 || bh > h * 0.16 || bw < bh * 1.4 || b.n < 4) continue;
    // Text colour: the most contrasting ink pixels (glyph cores, not their anti-aliased rims nor coloured legend dots).
    const inks: { i: number; c: number }[] = [];
    for (let y = box.y0; y < box.y1; y++)
      for (let x = box.x0; x < box.x1; x++) {
        const i = y * w + x;
        if (!ink[i]) continue;
        const r0 = px[i * 4]!;
        const g0 = px[i * 4 + 1]!;
        const b0 = px[i * 4 + 2]!;
        const chromaI = Math.max(r0, g0, b0) - Math.min(r0, g0, b0);
        inks.push({ i, c: Math.abs(lumOf(r0, g0, b0) - lumOf(bg[i * 4]!, bg[i * 4 + 1]!, bg[i * 4 + 2]!)) - chromaI / 600 });
      }
    if (inks.length < 12) continue;
    inks.sort((a, b) => b.c - a.c);
    const core = inks.slice(0, Math.max(6, Math.round(inks.length * 0.25)));
    const avg = (k: number) => core.reduce((a, v) => a + px[v.i * 4 + k]!, 0) / core.length;
    texts.push({ box, color: hex(avg(0), avg(1), avg(2)), size: bh });
  }
  // Words of one line split by a wide gap (big titles): merged when on the same row and closer than a line height.
  texts.sort((a, b) => a.box.x0 - b.box.x0);
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]!;
      const b = texts[j]!;
      const ov = Math.min(a.box.y1, b.box.y1) - Math.max(a.box.y0, b.box.y0);
      const hh = Math.max(a.size, b.size);
      if (ov >= Math.min(a.size, b.size) * 0.6 && Math.abs(a.size - b.size) <= hh * 0.3 && b.box.x0 - a.box.x1 < hh * 0.9 && b.box.x0 >= a.box.x0) {
        a.box = { x0: a.box.x0, y0: Math.min(a.box.y0, b.box.y0), x1: Math.max(a.box.x1, b.box.x1), y1: Math.max(a.box.y1, b.box.y1) };
        a.size = a.box.y1 - a.box.y0;
        texts.splice(j, 1);
        j = i;
      }
    }
  texts.sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0);
  return { bg, erased: grown, cards, texts, kept: keptN / N, snapped };
}
