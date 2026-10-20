/**
 * VISUAL DIFF — the `visual-regression` and `frontend-visual-qa` skills turned into a check the app can run: compare two
 * raster images (RGBA) and report the share of pixels that changed, where (bounding boxes of the changed regions on a
 * grid) and a diff image. Pure arithmetic (no DOM): the tool decodes the PNGs in the browser and hands the pixels here.
 * Thresholds follow the skill's advice (per-channel tolerance, a ratio of changed pixels under which a page is "stable").
 */

export interface Raster {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  data: Uint8ClampedArray | Uint8Array;
}
export interface DiffBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Share of changed pixels inside the box (0–1). */
  density: number;
}
export interface DiffResult {
  /** Share of pixels that differ (0–1), on the common area. */
  changed: number;
  changedPixels: number;
  total: number;
  sameSize: boolean;
  boxes: DiffBox[];
  /** Diff image (RGBA): unchanged pixels faded, changed pixels in red. */
  diff: Uint8ClampedArray;
  verdict: 'identique' | 'stable' | 'changé';
}

/** Compares two rasters; `tolerance` is the per-channel difference under which a pixel is the same, `maxRatio` the share of changed pixels under which the page is still "stable". */
export function pixelDiff(a: Raster, b: Raster, o: { tolerance?: number; maxRatio?: number; grid?: number } = {}): DiffResult {
  const tol = o.tolerance ?? 24;
  const maxRatio = o.maxRatio ?? 0.002;
  const grid = o.grid ?? 24;
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const diff = new Uint8ClampedArray(w * h * 4);
  const cells = new Float64Array(grid * grid);
  const cellN = new Float64Array(grid * grid);
  let changed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      const io = (y * w + x) * 4;
      const d = Math.max(Math.abs(a.data[ia]! - b.data[ib]!), Math.abs(a.data[ia + 1]! - b.data[ib + 1]!), Math.abs(a.data[ia + 2]! - b.data[ib + 2]!), Math.abs(a.data[ia + 3]! - b.data[ib + 3]!));
      const c = Math.min(grid - 1, Math.floor((y / h) * grid)) * grid + Math.min(grid - 1, Math.floor((x / w) * grid));
      cellN[c]!++;
      if (d > tol) {
        changed++;
        cells[c]!++;
        diff[io] = 220;
        diff[io + 1] = 30;
        diff[io + 2] = 30;
        diff[io + 3] = 255;
      } else {
        const g = Math.round((a.data[ia]! * 0.299 + a.data[ia + 1]! * 0.587 + a.data[ia + 2]! * 0.114) * 0.35 + 150);
        diff[io] = g;
        diff[io + 1] = g;
        diff[io + 2] = g;
        diff[io + 3] = 255;
      }
    }
  }
  // Changed cells → merged boxes (a cell is "changed" when more than 2 % of its pixels differ).
  const hot = new Uint8Array(grid * grid);
  for (let i = 0; i < grid * grid; i++) hot[i] = cellN[i]! && cells[i]! / cellN[i]! > 0.02 ? 1 : 0;
  const boxes: DiffBox[] = [];
  const seen = new Uint8Array(grid * grid);
  for (let i = 0; i < grid * grid; i++) {
    if (!hot[i] || seen[i]) continue;
    // Flood fill of 4-connected hot cells.
    const stack = [i];
    let x0 = grid;
    let y0 = grid;
    let x1 = -1;
    let y1 = -1;
    let px = 0;
    let n = 0;
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % grid;
      const cy = Math.floor(c / grid);
      x0 = Math.min(x0, cx);
      y0 = Math.min(y0, cy);
      x1 = Math.max(x1, cx);
      y1 = Math.max(y1, cy);
      px += cells[c]!;
      n += cellN[c]!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) continue;
        const k = ny * grid + nx;
        if (hot[k] && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    boxes.push({
      x: Math.round((x0 / grid) * w),
      y: Math.round((y0 / grid) * h),
      w: Math.round(((x1 - x0 + 1) / grid) * w),
      h: Math.round(((y1 - y0 + 1) / grid) * h),
      density: n ? px / n : 0,
    });
  }
  boxes.sort((p, q) => q.w * q.h * q.density - p.w * p.h * p.density);
  const total = w * h;
  const ratio = total ? changed / total : 0;
  return {
    changed: ratio,
    changedPixels: changed,
    total,
    sameSize: a.width === b.width && a.height === b.height,
    boxes: boxes.slice(0, 12),
    diff,
    verdict: changed === 0 && a.width === b.width && a.height === b.height ? 'identique' : ratio <= maxRatio ? 'stable' : 'changé',
  };
}

/** The report for the model, in French. */
export function diffReport(r: DiffResult, names: { before: string; after: string }): string {
  const pct = (r.changed * 100).toFixed(2);
  const head = `Régression visuelle ${names.before} → ${names.after} : ${r.verdict.toUpperCase()} — ${pct} % des pixels changés (${r.changedPixels}/${r.total})${r.sameSize ? '' : ' · tailles différentes (comparaison sur la zone commune)'}.`;
  if (!r.boxes.length) return head;
  const zones = r.boxes.slice(0, 6).map((b, i) => `${i + 1}. zone x=${b.x} y=${b.y} ${b.w}×${b.h} px (${Math.round(b.density * 100)} % changée)`);
  return `${head}\nZones modifiées :\n${zones.join('\n')}\nRègle (visual-regression) : un changement voulu se confirme en regardant la zone ; un changement non voulu (mise en page, thème, composant, responsive) se corrige avant livraison.`;
}
