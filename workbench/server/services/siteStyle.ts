/**
 * SITE STYLE — reproduce a REAL website's design, read from its own code: the page HTML and its stylesheets (fetched
 * through the r.jina.ai reader, which the browser may call) give the EXACT colours (CSS variables, page background,
 * text, buttons, links, borders), fonts (body / headings, Google Fonts), corner radius, shadows and navigation; a
 * screenshot read by a vision model gives the structure (KPI blocks, charts, table). Pure functions, no network.
 * Logos, photos and the site's text are never copied — only the design system, filled with the chat's data.
 */
import type { DesignLayout } from './layoutClone';

export interface SiteTokens {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  accent: string;
  border: string;
  series: string[];
  dark: boolean;
  font: string;
  headingFont: string;
  fontStack: string;
  fontHref?: string;
  radius: number;
  shadow: boolean;
  navigation: 'top' | 'sidebar' | 'none';
  /** Colour design tokens of the site (name → #hex), most meaningful first. */
  cssVars: Record<string, string>;
  /** How many colours / rules were actually read (0 = nothing usable). */
  evidence: { rules: number; colors: number; stylesheets: number };
}

// ── colours ──────────────────────────────────────────────────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const NAMED: Record<string, RGB> = { white: [255, 255, 255], black: [0, 0, 0] };
export function parseColor(v: string): RGB | null {
  const s = v.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1]!;
    if (h.length === 3 || h.length === 4) {
      if (h.length === 4 && parseInt(h[3]! + h[3]!, 16) < 128) return null;
      return [0, 1, 2].map((i) => parseInt(h[i]! + h[i]!, 16)) as RGB;
    }
    if (h.length === 6 || h.length === 8) {
      if (h.length === 8 && parseInt(h.slice(6, 8), 16) < 128) return null;
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
    }
    return null;
  }
  m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    if (a < 0.5) return null;
    return [+m[1]!, +m[2]!, +m[3]!].map((x) => Math.min(255, x)) as RGB;
  }
  return NAMED[s] ?? null;
}
const toHex = (c: RGB) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const lum = (c: RGB) => {
  const f = (x: number) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a: RGB, b: RGB) => {
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
const COLOR_IN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b/g;

// ── HTML helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Stylesheet URLs of a page (absolute), the useful ones first, at most `max`. */
export function stylesheetUrls(html: string, pageUrl: string, max = 4): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?[^"'>]*stylesheet/i.test(tag)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || /fonts\.googleapis\.com/i.test(href)) continue;
    try {
      out.push(new URL(href.replace(/&amp;/g, '&'), pageUrl).href);
    } catch {
      /* malformed href */
    }
  }
  return [...new Set(out)].slice(0, max);
}
const inlineStyles = (html: string) => [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]!).join('\n');
function googleFonts(html: string, css: string): { families: string[]; href?: string } {
  const hrefs = [
    ...[...html.matchAll(/href=["'](https:\/\/fonts\.googleapis\.com\/css2?\?[^"']+)["']/gi)].map((m) => m[1]!.replace(/&amp;/g, '&')),
    ...[...css.matchAll(/@import\s+url\(["']?(https:\/\/fonts\.googleapis\.com\/css2?\?[^"')]+)/gi)].map((m) => m[1]!),
  ];
  const families = hrefs.flatMap((h) => [...h.matchAll(/family=([^:&]+)/g)].map((m) => decodeURIComponent(m[1]!.replace(/\+/g, ' '))));
  return { families: [...new Set(families)], href: hrefs[0] };
}
const GENERIC = /^(inherit|initial|unset|sans-serif|serif|monospace|cursive|system-ui|-apple-system|blinkmacsystemfont|ui-sans-serif|ui-serif|ui-monospace|segoe ui emoji|apple color emoji|noto color emoji|segoe ui symbol|emoji|helvetica neue|helvetica|arial)$/i;
/** Popular Google Fonts: a site using one of them gets the real font in the reproduction. */
const GOOGLE_FONTS = ['Inter', 'Roboto', 'Poppins', 'Montserrat', 'Open Sans', 'Lato', 'Nunito', 'Raleway', 'Source Sans 3', 'Work Sans', 'DM Sans', 'Manrope', 'Plus Jakarta Sans', 'Outfit', 'Sora', 'Space Grotesk', 'IBM Plex Sans', 'Rubik', 'Mulish', 'Barlow', 'Figtree', 'Urbanist', 'Lexend', 'Playfair Display', 'Merriweather', 'Lora', 'Libre Baskerville', 'EB Garamond', 'Cormorant Garamond', 'PT Serif', 'Noto Sans', 'Noto Serif', 'Fira Sans', 'Karla', 'Quicksand', 'Josefin Sans', 'Oswald', 'Archivo', 'Public Sans', 'Red Hat Display', 'Geist'];
const googleName = (f: string) => GOOGLE_FONTS.find((g) => g.toLowerCase() === f.toLowerCase());
const googleHref = (families: string[]) =>
  `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700`).join('&')}&display=swap`;

// ── extraction ───────────────────────────────────────────────────────────────────────────────────────────────────────
const ROOT_SEL = /(^|[\s,>])(html|body|:root)(?=$|[\s,.:#[>])/i;
const BTN_SEL = /btn|button|cta|primary|brand|\.accent/i;
const LINK_SEL = /(^|[\s,>])a(?=$|[\s,.:#[>])|link/i;
const HEAD_SEL = /(^|[\s,>])h[1-3](?=$|[\s,.:#[>])|title|heading|display/i;

export function extractSiteTokens(html: string, stylesheets: string[]): SiteTokens {
  const css = `${inlineStyles(html)}\n${stylesheets.join('\n')}`.slice(0, 2_500_000);
  // CSS variables (first definition wins — usually :root), resolved up to 4 levels.
  const vars = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) if (!vars.has(m[1]!)) vars.set(m[1]!, m[2]!.trim());
  const resolve = (v: string, depth = 0): string =>
    depth > 4 ? v : v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_m, name: string, fb?: string) => resolve(vars.get(name) ?? fb ?? '', depth + 1));

  const score = { bg: new Map<string, number>(), rootBg: new Map<string, number>(), text: new Map<string, number>(), rootText: new Map<string, number>(), btn: new Map<string, number>(), link: new Map<string, number>(), border: new Map<string, number>(), any: new Map<string, number>() };
  const add = (m: Map<string, number>, k: string, w = 1) => m.set(k, (m.get(k) ?? 0) + w);
  const fonts = new Map<string, number>();
  const headFonts = new Map<string, number>();
  const radii: number[] = [];
  let shadows = 0;
  let rules = 0;
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1]!.trim();
    if (sel.startsWith('@font-face') || sel.startsWith('@keyframes') || /^(from|to|\d+%)$/.test(sel)) continue;
    rules++;
    for (const d of m[2]!.split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      const prop = d.slice(0, i).trim().toLowerCase();
      if (prop.startsWith('--')) continue;
      const val = resolve(d.slice(i + 1).trim());
      if (prop === 'font-family') {
        const fam = val
          .split(',')
          .map((x) => x.trim().replace(/^["']|["']$/g, ''))
          .find((x) => x && !GENERIC.test(x) && !/var\(|icon|awesome|material/i.test(x));
        if (fam) {
          add(fonts, fam, ROOT_SEL.test(sel) ? 6 : 1);
          if (HEAD_SEL.test(sel)) add(headFonts, fam, 2);
        }
        continue;
      }
      if (prop === 'border-radius') {
        const px = /^(\d+(?:\.\d+)?)px/.exec(val);
        if (px && +px[1]! >= 2 && +px[1]! <= 40) radii.push(+px[1]!);
        continue;
      }
      if (prop === 'box-shadow') {
        if (val && val !== 'none' && !/inset/.test(val)) shadows++;
        continue;
      }
      const colors = val.match(COLOR_IN);
      if (!colors) continue;
      for (const raw of colors) {
        const c = parseColor(raw);
        if (!c) continue;
        const h = toHex(c);
        add(score.any, h);
        if (prop === 'background' || prop === 'background-color') {
          add(score.bg, h);
          if (ROOT_SEL.test(sel)) add(score.rootBg, h, 5);
          if (BTN_SEL.test(sel)) add(score.btn, h, 3);
        } else if (prop === 'color') {
          add(score.text, h);
          if (ROOT_SEL.test(sel)) add(score.rootText, h, 5);
          if (LINK_SEL.test(sel)) add(score.link, h, 2);
          if (BTN_SEL.test(sel)) add(score.btn, h, 1);
        } else if (prop.startsWith('border') || prop === 'outline-color') add(score.border, h);
        else if (prop === 'fill' || prop === 'stroke') add(score.btn, h, 0.5);
      }
    }
  }
  // Colour design tokens named like a role are strong evidence for that role.
  const cssVars: Record<string, string> = {};
  const roleVars: { name: string; hex: string }[] = [];
  for (const [name, raw] of vars) {
    const c = parseColor(resolve(raw));
    if (!c) continue;
    roleVars.push({ name, hex: toHex(c) });
  }
  const rank = (n: string) => (/primary|brand/i.test(n) ? 0 : /accent|secondary|highlight/i.test(n) ? 1 : /background|bg|surface|canvas/i.test(n) ? 2 : /text|foreground|fg|ink/i.test(n) ? 3 : /border|line|muted/i.test(n) ? 4 : 5);
  for (const v of roleVars.sort((a, b) => rank(a.name) - rank(b.name)).slice(0, 24)) cssVars[v.name] = v.hex;
  for (const v of roleVars) {
    if (/primary|brand/i.test(v.name)) add(score.btn, v.hex, 4);
    if (/accent|secondary|highlight/i.test(v.name)) add(score.link, v.hex, 3);
    if (/^--(color-)?(background|bg)$|page-bg|body-bg/i.test(v.name)) add(score.rootBg, v.hex, 3);
    if (/^--(color-)?(text|foreground|fg)$|body-color/i.test(v.name)) add(score.rootText, v.hex, 3);
  }
  const top = (m: Map<string, number>, ok: (c: RGB) => boolean = () => true) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h).filter((h) => ok(parseColor(h)!));

  const bgHex = top(score.rootBg)[0] ?? top(score.bg, (c) => chroma(c) < 0.12)[0] ?? '#FFFFFF';
  const bg = parseColor(bgHex)!;
  const dark = lum(bg) < 0.3;
  const readable = (c: RGB) => contrast(c, bg) >= 4;
  const textHex = top(score.rootText, readable)[0] ?? top(score.text, readable)[0] ?? (dark ? '#F1F5F9' : '#0F172A');
  const surfaceHex = top(score.bg, (c) => toHex(c) !== bgHex && chroma(c) < 0.12 && Math.abs(lum(c) - lum(bg)) < 0.2)[0] ?? (dark ? '#1E293B' : '#FFFFFF');
  const vivid = (c: RGB) => chroma(c) >= 0.22 && contrast(c, bg) >= 1.6;
  const candidates = [...top(score.btn, vivid), ...top(score.link, vivid), ...top(score.bg, vivid), ...top(score.any, vivid)];
  const primaryHex = candidates[0] ?? (dark ? '#6366F1' : '#1E3A8A');
  const primary = parseColor(primaryHex)!;
  const accentHex = candidates.find((h) => hueGap(parseColor(h)!, primary) >= 30) ?? candidates.find((h) => h !== primaryHex) ?? '#F59E0B';
  const series: string[] = [];
  for (const h of candidates) if (series.length < 5 && series.every((s) => hueGap(parseColor(s)!, parseColor(h)!) >= 25)) series.push(h);
  const text = parseColor(textHex)!;
  const mutedHex = top(score.text, (c) => toHex(c) !== textHex && chroma(c) < 0.15 && contrast(c, bg) >= 2.5 && contrast(c, bg) < contrast(text, bg))[0] ?? (dark ? '#94A3B8' : '#64748B');
  const borderHex = top(score.border, (c) => chroma(c) < 0.15)[0] ?? (dark ? '#334155' : '#E2E8F0');

  const g = googleFonts(html, css);
  const bodyFont = [...fonts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? g.families[0] ?? 'Inter';
  const headingFont = [...headFonts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? bodyFont;
  const webFonts = [...new Set([bodyFont, headingFont].map(googleName).filter((x): x is string => Boolean(x)))];
  const fallback = g.families.find((f) => f !== bodyFont) ?? (googleName(bodyFont) ? undefined : 'Inter');
  const fontStack = [bodyFont, fallback, 'system-ui', 'sans-serif'].filter(Boolean).map((f) => (/\s/.test(f!) && !/^system-ui|sans-serif$/.test(f!) ? `"${f}"` : f)).join(', ');
  const fontHref = g.href ?? (webFonts.length ? googleHref(webFonts) : fallback === 'Inter' ? googleHref(['Inter']) : undefined);
  radii.sort((a, b) => a - b);
  const navigation = /<aside\b|class=["'][^"']*\b(sidebar|side-nav|sidenav)\b/i.test(html) ? 'sidebar' : /<nav\b|<header\b/i.test(html) ? 'top' : 'none';
  return {
    bg: bgHex,
    surface: surfaceHex,
    text: textHex,
    muted: mutedHex,
    primary: primaryHex,
    accent: accentHex,
    border: borderHex,
    series: series.length >= 2 ? series : [primaryHex, accentHex, '#10B981', '#06B6D4', '#EF4444'],
    dark,
    font: bodyFont,
    headingFont,
    fontStack,
    fontHref,
    radius: radii.length ? Math.round(radii[Math.floor(radii.length / 2)]!) : 8,
    shadow: shadows >= 3,
    navigation,
    cssVars,
    evidence: { rules, colors: score.any.size, stylesheets: stylesheets.length },
  };
}

/** The site's exact design system on top of the structure read from its screenshot (or a sober default structure). */
export function siteLayout(t: SiteTokens, vision?: DesignLayout | null): DesignLayout {
  const base: DesignLayout = vision ?? {
    dark: t.dark,
    navigation: t.navigation,
    header: 'minimal',
    kpis: { count: 4, style: 'card' },
    charts: [{ type: 'bar', span: 2 }, { type: 'donut', span: 1 }],
    table: { style: 'lined', position: 'bottom' },
    columns: 3,
    radius: t.radius,
    shadow: t.shadow,
    palette: { bg: t.bg, surface: t.surface, primary: t.primary, accent: t.accent, text: t.text, muted: t.muted, series: t.series },
    font: t.font,
  };
  return {
    ...base,
    dark: t.dark,
    navigation: vision?.navigation ?? t.navigation,
    radius: t.radius,
    shadow: t.shadow,
    // Colours and fonts come from the site's CODE (exact), not from a model's estimate.
    palette: { bg: t.bg, surface: t.surface, primary: t.primary, accent: t.accent, text: t.text, muted: t.muted, series: t.series },
    font: t.font,
    fontStack: t.fontStack,
    fontHref: t.fontHref,
    cssVars: t.cssVars,
  };
}
