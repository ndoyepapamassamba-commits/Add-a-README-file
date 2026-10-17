/**
 * MULTI-PANEL DETECTOR — an image generator asked for a story beat often draws a comic page (2 to 6 panels, white or
 * black gutters) instead of ONE shot: the scene then looks incoherent in the film. A gutter is a THIN band crossing
 * the whole picture (≥ 92 % of its length) in one flat colour, with picture content on both sides. Pure (RGBA in).
 */
export interface PanelCheck {
  /** Internal horizontal / vertical gutters found (0 = a single shot). */
  rows: number[];
  cols: number[];
  multiPanel: boolean;
}

export function detectPanels(px: ArrayLike<number>, w: number, h: number): PanelCheck {
  const lum = (i: number) => 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
  // Is the line flat (one colour along ≥ 92 % of it)? Returns its colour, or -1.
  const flat = (get: (k: number) => number, n: number): number => {
    const step = Math.max(1, Math.floor(n / 240));
    const vals: number[] = [];
    for (let k = 0; k < n; k += step) vals.push(get(k));
    const sorted = [...vals].sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1]!;
    const near = vals.filter((v) => Math.abs(v - med) <= 14).length;
    return near >= vals.length * 0.92 ? med : -1;
  };
  // Is the line picture content (several colours), not a flat area? Cartoons are flat between their outlines, so
  // « content » means: far from one single colour.
  const busy = (get: (k: number) => number, n: number): boolean => {
    const step = Math.max(1, Math.floor(n / 240));
    const vals: number[] = [];
    for (let k = 0; k < n; k += step) vals.push(get(k));
    const sorted = [...vals].sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1]!;
    return vals.filter((v) => Math.abs(v - med) <= 14).length < vals.length * 0.8;
  };
  const scan = (len: number, across: number, at: (line: number) => (k: number) => number): number[] => {
    const maxBand = Math.max(2, Math.round(len * 0.035));
    const margin = Math.round(len * 0.1);
    const found: number[] = [];
    let start = -1;
    let colour = -1;
    for (let l = margin; l < len - margin; l++) {
      const c = flat(at(l), across);
      if (c >= 0 && (start < 0 || Math.abs(c - colour) <= 14)) {
        if (start < 0) {
          start = l;
          colour = c;
        }
        continue;
      }
      if (start >= 0) {
        const end = l - 1;
        const thick = end - start + 1;
        const before = start - 3;
        const after = end + 3;
        if (thick <= maxBand && before >= 0 && after < len && busy(at(before), across) && busy(at(after), across)) found.push(Math.round((start + end) / 2));
        start = -1;
      }
      if (c >= 0) {
        start = l;
        colour = c;
      }
    }
    return found;
  };
  const rows = scan(h, w, (y) => (x) => lum((y * w + x) * 4));
  const cols = scan(w, h, (x) => (y) => lum((y * w + x) * 4));
  return { rows, cols, multiPanel: rows.length > 0 || cols.length > 0 };
}

/** The stronger instruction sent when a comic page came back instead of one shot. */
export const SINGLE_SHOT_RETRY =
  'STRICT: draw ONE single continuous shot filling the whole frame — NOT a comic page, no panels, no borders, no grid, no split screen, no speech bubbles; every character appears only once.';
