/**
 * IMAGE PALETTE (no model) — the colours of a design image computed in the browser from its pixels, used when no vision
 * model can read it: the main brand colour (largest saturated family), a distinct accent, the darkest tone for titles.
 * The user never silently falls back to the house design.
 */
import { analyzeLogo, rgbToHex, type RGB } from './logoHarmony';
import type { CustomTheme } from './houseDesign';

const chroma = (c: RGB) => (Math.max(...c) - Math.min(...c)) / 255;
const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const hue = (c: RGB) => {
  const [r, g, b] = c.map((x) => x / 255) as RGB;
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const gap = (a: RGB, b: RGB) => {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
};

export function paletteFromPixels(px: Uint8ClampedArray | Uint8Array, w: number, h: number): CustomTheme | null {
  const fams = analyzeLogo(px, w, h, 7);
  if (!fams.length) return null;
  const vivid = fams.filter((f) => chroma(f.color) >= 0.2 && lum(f.color) > 0.12 && lum(f.color) < 0.85).sort((a, b) => b.count - a.count);
  const darkest = [...fams].sort((a, b) => lum(a.color) - lum(b.color))[0]!;
  const primary = vivid[0]?.color ?? (lum(darkest.color) < 0.45 ? darkest.color : null);
  if (!primary) return null;
  const accent = vivid.find((f) => gap(f.color, primary) >= 30)?.color ?? vivid[1]?.color ?? primary;
  const dark = lum(darkest.color) < 0.3 ? darkest.color : (primary.map((x) => Math.round(x * 0.45)) as RGB);
  return { primary: rgbToHex(primary), accent: rgbToHex(accent), dark: rgbToHex(dark) };
}
