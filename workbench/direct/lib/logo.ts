// The user's LOGO in the browser: decode (PNG, JPEG, WebP, SVG), recolour to the chosen palette (logoHarmony), trim,
// encode back to PNG. Everything stays in the browser; the result is a file of the chat.
import { buildTheme, type CustomTheme, type ThemeId } from '../../server/services/houseDesign';
import type { DesignLayout } from '../../server/services/layoutClone';
import { recolorLogo, type LogoPalette, type LogoVariant } from '../../server/services/logoHarmony';
import { bytesOf, dataUrl } from './vfs';
import type { VFile } from './types';

export const isLogoFile = (p: string) => /\.(png|jpe?g|webp|svg|gif)$/i.test(p);
export interface DecodedLogo {
  px: Uint8ClampedArray;
  width: number;
  height: number;
}
const MAX = 640;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
/** Decode a logo file of the chat (SVG rasterised), at most 640 px wide. */
export async function decodeLogo(f: VFile): Promise<DecodedLogo> {
  const img = new Image();
  img.decoding = 'async';
  img.src = dataUrl(f);
  await img.decode();
  const w0 = img.naturalWidth || 600;
  const h0 = img.naturalHeight || 300;
  const k = Math.min(1, MAX / w0);
  const w = Math.max(1, Math.round(w0 * k));
  const h = Math.max(1, Math.round(h0 * k));
  const c = canvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  return { px: g.getImageData(0, 0, w, h).data, width: w, height: h };
}
/** Palette of a design choice for the logo (theme, Internet image or real website). */
export function logoPalette(theme: ThemeId | 'custom', custom?: CustomTheme | null, layout?: DesignLayout | null): LogoPalette {
  if (layout) {
    const p = layout.palette;
    return { primary: p.primary, accent: p.accent, dark: layout.dark ? p.bg : p.text, light: layout.dark ? p.text : '#FFFFFF', series: p.series };
  }
  const t = buildTheme(theme === 'custom' ? (custom ?? null) : theme);
  const c = t.color;
  return { primary: `#${c.blue}`, accent: `#${c.gold}`, dark: `#${c.navy}`, series: t.chartSeries.slice(0, 5).map((x) => `#${x}`) };
}
/** Crop transparent margins (variants without background). */
function trim(px: Uint8ClampedArray, w: number, h: number): { px: Uint8ClampedArray; width: number; height: number } {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return { px, width: w, height: h };
  const pad = 4;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const W = x1 - x0 + 1;
  const H = y1 - y0 + 1;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) out.set(px.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + W) * 4), y * W * 4);
  return { px: out, width: W, height: H };
}
/** One variant of the logo for a palette → PNG (bytes + data URL). */
export async function renderLogo(src: DecodedLogo, pal: LogoPalette, variant: LogoVariant): Promise<{ png: Uint8Array; dataUrl: string; width: number; height: number }> {
  const rec = recolorLogo(src.px, src.width, src.height, pal, variant);
  const t = variant === 'harmonized' || variant === 'original' ? { px: rec, width: src.width, height: src.height } : trim(rec, src.width, src.height);
  const c = canvas(t.width, t.height);
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(t.px), t.width, t.height), 0, 0);
  const url = c.toDataURL('image/png');
  const bin = atob(url.split(',')[1]!);
  const png = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) png[i] = bin.charCodeAt(i);
  return { png, dataUrl: url, width: t.width, height: t.height };
}
export const logoDataUrl = (f: VFile) => `data:image/png;base64,${f.binary ? f.data : btoa(String.fromCharCode(...bytesOf(f)))}`;
