/**
 * LOGO HARMONY — the user's logo takes the colours of the chosen design, harmoniously (not a flat tint):
 *  1. the logo's colours are found by k-means on its opaque pixels (≤ 5 colour families);
 *  2. each family gets a ROLE — background (touches the borders), light neutral (white text), dark neutral,
 *     chromatic (brand colours: the biggest first) — and a target colour of the palette for that role:
 *     background → primary, brand colours → accent then the chart series (distinct hues), white stays white
 *     and black becomes the palette's dark only if the contrast with the new background stays readable;
 *  3. every pixel is re-expressed as a blend of its two nearest families and rebuilt with their targets, so
 *     anti-aliased edges, gradients and shading are preserved (no halo, no posterisation).
 * Variants: harmonised, original, white (for dark bands), primary mono, transparent background.
 * Pure (RGBA bytes in → RGBA bytes out); the browser decodes / encodes the image with a canvas.
 */
export type RGB = [number, number, number];
export interface LogoPalette {
  primary: string;
  accent: string;
  dark: string;
  light?: string;
  series?: string[];
}
export type LogoVariant = 'harmonized' | 'original' | 'white' | 'mono' | 'transparent';
export const LOGO_VARIANTS: { id: LogoVariant; label: string }[] = [
  { id: 'harmonized', label: 'Harmonisé à la palette' },
  { id: 'transparent', label: 'Harmonisé, sans fond' },
  { id: 'white', label: 'Blanc (sur bandeau)' },
  { id: 'mono', label: 'Couleur principale' },
  { id: 'original', label: 'Original' },
];

export const hexToRgb = (h: string): RGB => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) || 0) as RGB;
};
export const rgbToHex = (c: RGB) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const lum = (c: RGB) => {
  const f = (x: number) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
export const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
const chroma = (c: RGB) => (Math.max(...c) - Math.min(...c)) / 255;
const hue = (c: RGB) => {
  const [r, g, b] = c.map((x) => x / 255) as RGB;
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const hueGap = (a: RGB, b: RGB) => {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
};
const d2 = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Lighten (t > 0) or darken (t < 0) towards white / black. */
const shift = (c: RGB, t: number): RGB => (t >= 0 ? mix(c, [255, 255, 255], t) : mix(c, [0, 0, 0], -t));

export type Role = 'background' | 'light' | 'dark' | 'neutral' | 'brand';
export interface Family {
  color: RGB;
  count: number;
  border: number;
  role: Role;
  target: RGB;
}

/** Colour families of the logo (k-means on a sample of the opaque pixels, close families merged). */
export function analyzeLogo(px: Uint8ClampedArray | Uint8Array, w: number, h: number, k = 5): Family[] {
  const sample: RGB[] = [];
  const total = w * h;
  const step = Math.max(1, Math.floor(total / 24_000));
  for (let i = 0; i < total; i += step) if (px[i * 4 + 3]! >= 128) sample.push([px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!]);
  if (!sample.length) return [];
  // Farthest-point initialisation: logos have few, very distinct colours.
  const centers: RGB[] = [sample[0]!];
  while (centers.length < k) {
    let best = -1;
    let far: RGB | null = null;
    for (const p of sample) {
      const d = Math.min(...centers.map((c) => d2(c, p)));
      if (d > best) {
        best = d;
        far = p;
      }
    }
    if (!far || best < 900) break;
    centers.push([...far] as RGB);
  }
  for (let it = 0; it < 10; it++) {
    const acc = centers.map(() => [0, 0, 0, 0]);
    for (const p of sample) {
      let bi = 0;
      for (let j = 1; j < centers.length; j++) if (d2(p, centers[j]!) < d2(p, centers[bi]!)) bi = j;
      const a = acc[bi]!;
      a[0]! += p[0];
      a[1]! += p[1];
      a[2]! += p[2];
      a[3]! += 1;
    }
    acc.forEach((a, j) => {
      if (a[3]) centers[j] = [a[0]! / a[3]!, a[1]! / a[3]!, a[2]! / a[3]!];
    });
  }
  // Counts on the whole image + how much of the border each family covers.
  const count = centers.map(() => 0);
  const border = centers.map(() => 0);
  const nearest = (p: RGB) => {
    let bi = 0;
    for (let j = 1; j < centers.length; j++) if (d2(p, centers[j]!) < d2(p, centers[bi]!)) bi = j;
    return bi;
  };
  let borderTotal = 0;
  for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 400))) {
    for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 400))) {
      const i = (y * w + x) * 4;
      if (px[i + 3]! < 128) continue;
      const j = nearest([px[i]!, px[i + 1]!, px[i + 2]!]);
      count[j]!++;
      if (x < w * 0.02 || x > w * 0.98 || y < h * 0.03 || y > h * 0.97) {
        border[j]!++;
        borderTotal++;
      }
    }
  }
  let fams = centers.map((c, j) => ({ color: c.map(Math.round) as RGB, count: count[j]!, border: border[j]!, role: 'neutral' as Role, target: c }));
  // Merge near-duplicates (anti-aliasing creates intermediate families).
  fams = fams.filter((f) => f.count > 0).sort((a, b) => b.count - a.count);
  const kept: typeof fams = [];
  for (const f of fams) {
    const host = kept.find((g) => d2(g.color, f.color) < 45 ** 2);
    if (host) {
      host.count += f.count;
      host.border += f.border;
    } else kept.push(f);
  }
  // A small family lying BETWEEN two others is an anti-aliasing blend: absorb it. A small but distinct colour
  // (thin text, a filet, a dot) is part of the logo and is kept, however few pixels it has.
  const sum = kept.reduce((s, f) => s + f.count, 0);
  const onSegment = (p: RGB, a: RGB, b: RGB) => {
    const seg: RGB = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = seg[0] ** 2 + seg[1] ** 2 + seg[2] ** 2;
    if (!len) return false;
    const t = ((p[0] - a[0]) * seg[0] + (p[1] - a[1]) * seg[1] + (p[2] - a[2]) * seg[2]) / len;
    if (t <= 0.08 || t >= 0.92) return false;
    return d2(p, mix(a, b, t)) < 22 ** 2;
  };
  const major = kept.filter((f) => {
    if (f.count / sum >= 0.04 || kept.length <= 2) return true;
    const others = kept.filter((g) => g !== f && g.count > f.count);
    return !others.some((a, i) => others.slice(i + 1).some((b) => onSegment(f.color, a.color, b.color)));
  });
  for (const f of major) {
    const c = f.color;
    const isBg = borderTotal > 0 && f.border / borderTotal >= 0.6;
    f.role = isBg ? 'background' : chroma(c) < 0.14 ? (lum(c) > 0.7 ? 'light' : lum(c) < 0.06 ? 'dark' : 'neutral') : 'brand';
  }
  return major;
}

/** Target colour of each family for the chosen palette (readable, distinct hues, harmonious). */
export function planColors(fams: Family[], pal: LogoPalette, opts: { dropBackground?: boolean } = {}): Family[] {
  const primary = hexToRgb(pal.primary);
  const accent = hexToRgb(pal.accent);
  const dark = hexToRgb(pal.dark);
  const light: RGB = pal.light ? hexToRgb(pal.light) : [255, 255, 255];
  const series = [accent, ...(pal.series ?? []).map(hexToRgb), primary];
  const bg = fams.find((f) => f.role === 'background');
  // The background takes the primary colour (a brand badge); a white / transparent background stays as is.
  // Without its background the logo sits on a light page: white parts take the primary colour, the rest stays readable.
  const bgTarget: RGB | null = bg && !opts.dropBackground ? (chroma(bg.color) < 0.14 && lum(bg.color) > 0.7 ? bg.color : primary) : null;
  const ground: RGB = bgTarget ?? (pal.light ? hexToRgb(pal.light) : [255, 255, 255]);
  const used: RGB[] = bgTarget ? [bgTarget] : [];
  const readable = (c: RGB, min: number) => contrast(c, ground) >= min;
  const brand = fams.filter((f) => f.role === 'brand').sort((a, b) => b.count - a.count);
  if (opts.dropBackground && fams.some((f) => f.role === 'light') && !readable(light, 2.6)) used.push(primary);
  return fams.map((f) => {
    let target: RGB = f.color;
    if (f.role === 'background') target = bgTarget ?? f.color;
    else if (f.role === 'light') target = readable(light, 2.6) ? light : opts.dropBackground && readable(primary, 2.6) ? primary : dark;
    else if (f.role === 'dark') target = readable(dark, 2.6) ? dark : light;
    else if (f.role === 'neutral') target = mix(f.color, readable(dark, 3) ? dark : light, 0.5);
    else {
      // Brand colours: without a coloured background the main one IS the primary; then accent / series, distinct hues.
      const rank = brand.indexOf(f);
      const pool = bgTarget && bgTarget !== bg?.color ? series : rank === 0 ? [primary, ...series] : series;
      let pick = pool.find((c) => used.every((u) => hueGap(u, c) >= 25 || d2(u, c) > 60 ** 2) && readable(c, 1.5)) ?? pool[0]!;
      // Keep it legible on the new ground: nudge lightness, never the hue.
      for (let i = 0; i < 6 && !readable(pick, 1.5); i++) pick = shift(pick, lum(ground) > 0.4 ? -0.15 : 0.15);
      // Keep the logo's own light / dark balance (a pale brand colour stays pale).
      const delta = lum(f.color) - lum(pick);
      if (Math.abs(delta) > 0.35) pick = shift(pick, delta > 0 ? 0.25 : -0.25);
      target = pick;
      used.push(pick);
    }
    return { ...f, target: target.map(Math.round) as RGB };
  });
}

/** Rebuild the pixels for a variant. Every pixel = blend of its two nearest families, rebuilt with their targets. */
export function recolorLogo(px: Uint8ClampedArray | Uint8Array, w: number, h: number, pal: LogoPalette, variant: LogoVariant = 'harmonized'): Uint8ClampedArray {
  const out = new Uint8ClampedArray(px);
  if (variant === 'original') return out;
  const fams = planColors(analyzeLogo(px, w, h), pal, { dropBackground: variant === 'transparent' });
  if (!fams.length) return out;
  const primary = hexToRgb(pal.primary);
  const bgIdx = fams.findIndex((f) => f.role === 'background');
  const dropBg = variant !== 'harmonized' && bgIdx >= 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const a = px[o + 3]!;
    if (a === 0) continue;
    const p: RGB = [px[o]!, px[o + 1]!, px[o + 2]!];
    // The pair of families whose BLEND explains the pixel best (anti-aliased edge between letter and background,
    // between filet and letter…): the pixel's position on that segment is kept, only the two colours change.
    let i1 = 0;
    let i2 = 0;
    let t = 0;
    let best = Infinity;
    for (let j = 0; j < fams.length; j++) {
      const dj = d2(p, fams[j]!.color);
      if (dj < best) {
        best = dj;
        i1 = i2 = j;
        t = 0;
      }
    }
    for (let j = 0; j < fams.length; j++)
      for (let k = j + 1; k < fams.length; k++) {
        const a0 = fams[j]!.color;
        const b0 = fams[k]!.color;
        const seg: RGB = [b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]];
        const len = seg[0] ** 2 + seg[1] ** 2 + seg[2] ** 2;
        if (!len) continue;
        const tt = Math.max(0, Math.min(1, ((p[0] - a0[0]) * seg[0] + (p[1] - a0[1]) * seg[1] + (p[2] - a0[2]) * seg[2]) / len));
        const dd = d2(p, mix(a0, b0, tt));
        // A real blend must fit clearly better than the nearest pure colour.
        if (dd < best * 0.6) {
          best = dd;
          i1 = j;
          i2 = k;
          t = tt;
        }
      }
    const f1 = fams[i1]!;
    const f2 = fams[i2]!;
    let alpha = a;
    let c: RGB;
    if (variant === 'white' || variant === 'mono') {
      // Single-colour mark: the background disappears, everything else becomes white / primary (edges keep alpha).
      const ink: RGB = variant === 'white' ? [255, 255, 255] : primary;
      const bgShare = i1 === bgIdx ? 1 - t : i2 === bgIdx ? t : 0;
      c = ink;
      alpha = Math.round(a * (bgIdx >= 0 ? 1 - bgShare : 1));
    } else {
      c = mix(f1.target, f2.target, t);
      if (dropBg) {
        const bgShare = i1 === bgIdx ? 1 - t : i2 === bgIdx ? t : 0;
        alpha = Math.round(a * (1 - bgShare));
        // Un-premultiply the background out of the edge colour.
        const other = i1 === bgIdx ? f2.target : f1.target;
        if (bgShare < 1) c = other;
      }
    }
    out[o] = c[0];
    out[o + 1] = c[1];
    out[o + 2] = c[2];
    out[o + 3] = alpha;
  }
  return out;
}
