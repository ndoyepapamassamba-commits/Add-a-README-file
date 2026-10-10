/**
 * GOD 3D VISUALS — the house « 3D » charts and reading cards of the reference workbook (Impayés 30-90 j), as SVG:
 *  - card: white, rounded, soft drop shadow, thin gold left edge, navy title, grey subtitle, short gold underline;
 *  - 3D columns / 3D horizontal bars: front face with a light reflection, lighter top face, darker side face, floor
 *    shadow, values in bold Consolas;
 *  - 3D donut (tilted, extruded);
 *  - « Lecture » card: navy gradient band with the date, gold filet, sections (constats / points d'attention / …)
 *    with coloured markers and triangle bullets.
 * Colours come from the active house palette (Maison 2.0), so every palette gets its 3D look. Pure: the browser
 * rasterises the SVG to PNG for Excel / Word / PowerPoint.
 */
export interface Palette3d {
  navy: string;
  blue: string;
  gold: string;
  cyan: string;
  text: string;
  muted: string;
  series: string[];
  font: string;
  mono: string;
}
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const hx = (h: string) => h.replace('#', '');
const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(hx(h).slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
/** Lighten (t > 0) towards white or darken (t < 0) towards black. */
export const shade = (h: string, t: number) => toHex(rgb(h).map((v) => (t >= 0 ? v + (255 - v) * t : v * (1 + t))));
const esc = (s: unknown) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const fmtShort = (n: number) =>
  Math.abs(n) >= 1e9 ? `${(n / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${Math.abs(n) >= 2e9 ? 'Mds' : 'Md'}` : Math.abs(n) >= 1e6 ? `${Math.round(n / 1e6).toLocaleString('fr-FR')} M` : Math.abs(n) >= 1e4 ? `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')}` : `${(Math.round(n * 100) / 100).toLocaleString('fr-FR').replace(/[  ]/g, ' ')}`;

/** Round axis: 4 to 5 steps of 1, 2, 2.5 or 5 × 10^n covering max. */
export function niceAxis(max: number): { top: number; step: number } {
  if (!(max > 0)) return { top: 1, step: 0.25 };
  const raw = max / 4;
  const p10 = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p10;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p10;
  return { top: Math.ceil(max / step - 1e-9) * step, step };
}

let uid = 0;
const id = (p: string) => `${p}${++uid}`;

/** The card frame shared by every visual. Returns the SVG head (with defs) and the content box. */
function card(W: number, H: number, title: string, subtitle: string, p: Palette3d): { head: string; x: number; y: number; w: number; h: number } {
  const sh = id('sh');
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'${p.font}', 'Segoe UI', Calibri, Arial, sans-serif">
<defs><filter id="${sh}" x="-5%" y="-5%" width="112%" height="118%"><feDropShadow dx="5" dy="7" stdDeviation="6" flood-color="#5B6B80" flood-opacity="0.28"/></filter></defs>
<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>
<rect x="10" y="8" width="${W - 26}" height="${H - 26}" rx="18" fill="#FFFFFF" filter="url(#${sh})"/>
<path d="M28,8 h-0 a18,18 0 0 0 -18,18 v${H - 62} a18,18 0 0 0 18,18" fill="none" stroke="${p.gold}" stroke-width="2.5"/>
<text x="38" y="44" font-size="19" font-weight="700" fill="${shade(p.navy, 0.05)}">${esc(trunc(title, 70))}</text>
${subtitle ? `<text x="38" y="66" font-size="13" fill="${p.muted}">${esc(trunc(subtitle, 90))}</text>` : ''}
<rect x="38" y="${subtitle ? 76 : 56}" width="46" height="3" rx="1.5" fill="${p.gold}"/>`;
  const top = subtitle ? 96 : 76;
  return { head, x: 38, y: top, w: W - 76, h: H - top - 36 };
}

/** 3D vertical columns (one colour per column from the palette, like the reference « montant par plage »). */
export function bar3dSvg(o: { title: string; subtitle?: string; categories: string[]; values: number[]; unit?: string; colors?: string[]; W?: number; H?: number }, p: Palette3d): string {
  const W = o.W ?? 1520;
  const H = o.H ?? 760;
  const c = card(W, H, o.title, o.subtitle ?? o.unit ?? '', p);
  const n = Math.max(1, Math.min(8, o.categories.length));
  const vals = o.values.slice(0, n);
  const ax = niceAxis(Math.max(...vals.map((v) => Math.abs(v))));
  const max = ax.top;
  const left = c.x + 70;
  const right = c.x + c.w - 20;
  const top = c.y + 40;
  const bottom = c.y + c.h - 46;
  const ph = bottom - top;
  const step = (right - left) / n;
  const bw = Math.min(150, step * 0.55);
  const d = bw * 0.26;
  let s = c.head;
  // gridlines + y labels
  for (let v = 0; v <= max + 1e-9; v += ax.step) {
    const y = bottom - (v / max) * (ph - d);
    s += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#E5EAF0" stroke-width="1.2"/>`;
    s += `<text x="${left - 14}" y="${y + 5}" text-anchor="end" font-family="'${p.mono}', Consolas, monospace" font-size="15" fill="${p.muted}">${esc(fmtShort(v))}</text>`;
  }
  s += `<line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="${p.navy}" stroke-width="2"/>`;
  const cols = o.colors ?? [p.blue, shade(p.blue, 0.25), p.gold, '#DC2626', p.cyan, shade(p.navy, 0.15), shade(p.gold, -0.15), '#16A34A'];
  vals.forEach((v, i) => {
    const base = cols[i % cols.length]!;
    const x = left + i * step + (step - bw) / 2;
    const h = Math.max(4, (Math.abs(v) / max) * (ph - d));
    const y = bottom - h;
    const g = id('g');
    s += `<defs><linearGradient id="${g}" x1="0" x2="1"><stop offset="0" stop-color="${shade(base, -0.05)}"/><stop offset="0.22" stop-color="${shade(base, 0.38)}"/><stop offset="0.45" stop-color="${base}"/><stop offset="1" stop-color="${shade(base, -0.22)}"/></linearGradient></defs>`;
    s += `<ellipse cx="${x + bw / 2 + d / 2}" cy="${bottom + 6}" rx="${bw * 0.78}" ry="9" fill="#0F172A" opacity="0.08"/>`;
    s += `<polygon points="${x + bw},${y} ${x + bw + d},${y - d * 0.62} ${x + bw + d},${bottom - d * 0.62} ${x + bw},${bottom}" fill="${shade(base, -0.38)}"/>`;
    s += `<polygon points="${x},${y} ${x + d},${y - d * 0.62} ${x + bw + d},${y - d * 0.62} ${x + bw},${y}" fill="${shade(base, 0.3)}"/>`;
    s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="url(#${g})"/>`;
    s += `<text x="${x + bw / 2 + d / 2}" y="${y - d * 0.62 - 14}" text-anchor="middle" font-family="'${p.mono}', Consolas, monospace" font-size="17" font-weight="700" fill="${p.text}">${esc(fmtShort(v))}</text>`;
    s += `<text x="${x + bw / 2}" y="${bottom + 30}" text-anchor="middle" font-size="15" fill="${p.muted}">${esc(trunc(o.categories[i]!, Math.max(6, Math.round(step / 9))))}</text>`;
  });
  return `${s}</svg>`;
}

/** 3D horizontal bars (the reference « clients les plus exposés »). */
export function hbar3dSvg(o: { title: string; subtitle?: string; categories: string[]; values: number[]; colors?: (string | null)[]; W?: number; H?: number }, p: Palette3d): string {
  const n = Math.max(1, Math.min(12, o.categories.length));
  const W = o.W ?? 1520;
  const H = o.H ?? Math.max(420, 150 + n * 54);
  const c = card(W, H, o.title, o.subtitle ?? '', p);
  const vals = o.values.slice(0, n);
  const max = Math.max(...vals.map((v) => Math.abs(v)), 1);
  const labelW = Math.min(520, c.w * 0.4);
  const left = c.x + labelW;
  const right = c.x + c.w - 150;
  const step = c.h / n;
  const bh = Math.min(34, step * 0.62);
  const d = bh * 0.42;
  let s = c.head;
  vals.forEach((v, i) => {
    const base = o.colors?.[i] ?? p.navy;
    const y = c.y + i * step + (step - bh) / 2 + d * 0.5;
    const len = Math.max(6, (Math.abs(v) / max) * (right - left - d));
    const g = id('g');
    s += `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(base, 0.32)}"/><stop offset="0.35" stop-color="${base}"/><stop offset="1" stop-color="${shade(base, -0.25)}"/></linearGradient></defs>`;
    s += `<text x="${left - 18}" y="${y + bh * 0.68}" text-anchor="end" font-size="16" fill="${p.text}">${esc(trunc(o.categories[i]!, Math.max(8, Math.floor((labelW - 30) / 8.8))))}</text>`;
    s += `<polygon points="${left},${y} ${left + d},${y - d * 0.62} ${left + len + d},${y - d * 0.62} ${left + len},${y}" fill="${shade(base, 0.28)}"/>`;
    s += `<polygon points="${left + len},${y} ${left + len + d},${y - d * 0.62} ${left + len + d},${y + bh - d * 0.62} ${left + len},${y + bh}" fill="${shade(base, -0.4)}"/>`;
    s += `<rect x="${left}" y="${y}" width="${len}" height="${bh}" fill="url(#${g})"/>`;
    s += `<text x="${left + len + d + 14}" y="${y + bh * 0.68}" font-family="'${p.mono}', Consolas, monospace" font-size="16" font-weight="700" fill="${p.text}">${esc(fmtShort(v))}</text>`;
  });
  return `${s}</svg>`;
}

/** Tilted, extruded donut (shares), legend on the right. */
export function donut3dSvg(o: { title: string; subtitle?: string; categories: string[]; values: number[]; W?: number; H?: number }, p: Palette3d): string {
  const W = o.W ?? 1520;
  const H = o.H ?? 760;
  const c = card(W, H, o.title, o.subtitle ?? '', p);
  const n = Math.min(6, o.categories.length);
  const rest = o.values.slice(n).reduce((a, b) => a + b, 0);
  const vals = rest > 0 ? [...o.values.slice(0, n - 1), o.values[n - 1]! + rest] : o.values.slice(0, n);
  const cats = rest > 0 ? [...o.categories.slice(0, n - 1), 'Autres'] : o.categories.slice(0, n);
  const tot = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const cols = [p.navy, p.blue, p.gold, p.cyan, shade(p.blue, 0.4), shade(p.gold, -0.2)];
  const legendW = c.w * 0.38;
  const rx = Math.min((c.w - legendW) / 2 - 20, c.h * 0.95);
  const ry = rx * 0.5;
  const cx = c.x + (c.w - legendW) / 2;
  const cy = c.y + c.h / 2 - 10;
  const depth = Math.max(16, ry * 0.22);
  const ix = rx * 0.52;
  const iy = ry * 0.52;
  const P = (a: number, r1: number, r2: number, dy = 0) => `${(cx + r1 * Math.cos(a)).toFixed(1)},${(cy + r2 * Math.sin(a) + dy).toFixed(1)}`;
  let s = c.head;
  s += `<ellipse cx="${cx}" cy="${cy + depth + 14}" rx="${rx * 1.02}" ry="${ry * 0.9}" fill="#0F172A" opacity="0.08"/>`;
  let a0 = -Math.PI / 2;
  const slices = vals.map((v, i) => {
    const da = (Math.max(0, v) / tot) * Math.PI * 2;
    const sl = { a0, a1: a0 + da, col: cols[i % cols.length]! };
    a0 += da;
    return sl;
  });
  // side walls (front half only: sin(angle) > 0)
  for (const sl of slices) {
    const from = Math.max(sl.a0, 0);
    const to = Math.min(sl.a1, Math.PI);
    const ranges: [number, number][] = [];
    if (to > from) ranges.push([from, to]);
    const from2 = Math.max(sl.a0, 2 * Math.PI);
    const to2 = Math.min(sl.a1, 3 * Math.PI);
    if (to2 > from2) ranges.push([from2, to2]);
    for (const [f, t] of ranges) {
      const large = t - f > Math.PI ? 1 : 0;
      s += `<path d="M${P(f, rx, ry)} A${rx},${ry} 0 ${large} 1 ${P(t, rx, ry)} L${P(t, rx, ry, depth)} A${rx},${ry} 0 ${large} 0 ${P(f, rx, ry, depth)} Z" fill="${shade(sl.col, -0.35)}"/>`;
    }
  }
  for (const sl of slices) {
    const large = sl.a1 - sl.a0 > Math.PI ? 1 : 0;
    const g = id('g');
    s += `<defs><radialGradient id="${g}" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="${shade(sl.col, 0.3)}"/><stop offset="1" stop-color="${sl.col}"/></radialGradient></defs>`;
    s += `<path d="M${P(sl.a0, rx, ry)} A${rx},${ry} 0 ${large} 1 ${P(sl.a1, rx, ry)} L${P(sl.a1, ix, iy)} A${ix},${iy} 0 ${large} 0 ${P(sl.a0, ix, iy)} Z" fill="url(#${g})" stroke="#FFFFFF" stroke-width="2"/>`;
  }
  // inner wall (back half visible through the hole)
  s += `<path d="M${P(Math.PI, ix, iy)} A${ix},${iy} 0 0 1 ${P(2 * Math.PI, ix, iy)} L${P(2 * Math.PI, ix, iy, depth * 0.7)} A${ix},${iy} 0 0 0 ${P(Math.PI, ix, iy, depth * 0.7)} Z" fill="#E2E8F0"/>`;
  s += `<text x="${cx}" y="${cy + 8}" text-anchor="middle" font-family="'${p.mono}', Consolas, monospace" font-size="22" font-weight="700" fill="${p.navy}">${esc(fmtShort(tot))}</text>`;
  cats.forEach((cat, i) => {
    const y = c.y + c.h / 2 - (cats.length * 38) / 2 + i * 38;
    const x = c.x + c.w - legendW + 20;
    s += `<rect x="${x}" y="${y}" width="18" height="18" rx="4" fill="${cols[i % cols.length]}"/>`;
    s += `<text x="${x + 30}" y="${y + 15}" font-size="16" fill="${p.text}">${esc(trunc(cat, 22))}</text>`;
    s += `<text x="${c.x + c.w - 10}" y="${y + 15}" text-anchor="end" font-family="'${p.mono}', Consolas, monospace" font-size="16" font-weight="700" fill="${p.text}">${Math.round((Math.max(0, vals[i]!) / tot) * 100)} %</text>`;
  });
  return `${s}</svg>`;
}

/** The « Lecture » card: navy band with title and date, gold filet, sections with coloured markers. */
export function insightCardSvg(o: { title: string; date?: string; sections: { label: string; tone: 'navy' | 'green' | 'red' | 'gold'; lines: string[] }[]; W?: number }, p: Palette3d): string {
  const W = o.W ?? 1828;
  const lineCount = o.sections.reduce((n, s) => n + 1 + s.lines.length, 0);
  const H = Math.max(300, 120 + lineCount * 34 + o.sections.length * 14);
  const sh = id('sh');
  const g = id('g');
  const tone = { navy: p.navy, green: '#16A34A', red: '#DC2626', gold: p.gold };
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'${p.font}', 'Segoe UI', Calibri, Arial, sans-serif">
<defs><filter id="${sh}" x="-3%" y="-5%" width="108%" height="118%"><feDropShadow dx="5" dy="7" stdDeviation="6" flood-color="#5B6B80" flood-opacity="0.28"/></filter>
<linearGradient id="${g}" x1="0" x2="1"><stop offset="0" stop-color="${shade(p.navy, 0.05)}"/><stop offset="1" stop-color="${p.blue}"/></linearGradient>
<clipPath id="${g}c"><rect x="10" y="8" width="${W - 26}" height="${H - 26}" rx="18"/></clipPath></defs>
<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>
<rect x="10" y="8" width="${W - 26}" height="${H - 26}" rx="18" fill="#FFFFFF" filter="url(#${sh})"/>
<g clip-path="url(#${g}c)"><rect x="10" y="8" width="${W - 26}" height="64" fill="url(#${g})"/><rect x="10" y="72" width="${W - 26}" height="4" fill="${p.gold}"/></g>
<text x="40" y="49" font-size="22" font-weight="700" fill="#FFFFFF">${esc(trunc(o.title, 80))}</text>
${o.date ? `<text x="${W - 46}" y="47" text-anchor="end" font-size="14" fill="#E0E7FF">${esc(o.date)}</text>` : ''}`;
  let y = 116;
  for (const sec of o.sections) {
    s += `<rect x="40" y="${y - 17}" width="5" height="22" fill="${tone[sec.tone]}"/><text x="56" y="${y}" font-size="15" font-weight="800" fill="${sec.tone === 'navy' ? p.navy : tone[sec.tone]}" letter-spacing="0.5">${esc(sec.label.toUpperCase())}</text>`;
    y += 34;
    for (const l of sec.lines) {
      s += `<path d="M58,${y - 11} l9,5 l-9,5 z" fill="${tone[sec.tone]}"/><text x="78" y="${y}" font-size="16" fill="${p.text}">${esc(trunc(l, 150))}</text>`;
      y += 34;
    }
    y += 14;
  }
  return `${s}</svg>`;
}

type Section = { label: string; tone: 'navy' | 'green' | 'red' | 'gold'; lines: string[] };
const pct = (a: number, b: number) => `${(b ? (a / b) * 100 : 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
/** The facts of the « Lecture » card, computed from the rows — nothing invented, no advice made up. */
export function insightFacts(a: { rows: number; measure: string | null; total: number; main: View3d | null; mainCol: string; top: View3d | null; topCol: string; trend: View3d | null }): Section[] {
  const what = a.measure ?? 'lignes';
  const constats: string[] = [a.measure ? `Total ${a.measure} : ${fmtShort(a.total)} sur ${a.rows.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} lignes.` : `${a.rows} lignes analysées.`];
  const attention: string[] = [];
  if (a.top && a.top.values.length >= 2) {
    const t = a.top.values.reduce((x, y) => x + y, 0);
    constats.push(`Les ${a.top.values.length} premiers (${a.topCol}) concentrent ${pct(t, a.total)} du total ; en tête : ${a.top.categories[0]} (${fmtShort(a.top.values[0]!)}).`);
    if (a.total && t / a.total >= 0.5) attention.push(`Concentration élevée : les ${a.top.values.length} premiers (${a.topCol}) portent ${pct(t, a.total)} du total ${what}.`);
    if (a.total && a.top.values[0]! / a.total >= 0.2) attention.push(`${a.top.categories[0]} pèse à lui seul ${pct(a.top.values[0]!, a.total)} du total.`);
  }
  if (a.main && a.main !== a.top && a.main.values.length >= 2) {
    constats.push(`Par ${a.mainCol} : ${a.main.categories[0]} en tête avec ${pct(a.main.values[0]!, a.total)} (${fmtShort(a.main.values[0]!)}), puis ${a.main.categories[1]} (${pct(a.main.values[1]!, a.total)}).`);
    if (a.total && a.main.values[0]! / a.total >= 0.5) attention.push(`${a.mainCol} « ${a.main.categories[0]} » = ${pct(a.main.values[0]!, a.total)} du total.`);
  }
  if (a.trend && a.trend.values.length >= 2) {
    const v = a.trend.values;
    const iMax = v.indexOf(Math.max(...v));
    const last = v[v.length - 1]!;
    const prev = v[v.length - 2]!;
    constats.push(`Pic en ${a.trend.categories[iMax]} (${fmtShort(v[iMax]!)}) ; dernier mois ${a.trend.categories[v.length - 1]} : ${fmtShort(last)}.`);
    if (prev && Math.abs(last / prev - 1) >= 0.2) attention.push(`Variation de ${last >= prev ? '+' : ''}${pct(last - prev, prev)} entre ${a.trend.categories[v.length - 2]} et ${a.trend.categories[v.length - 1]}.`);
  }
  return [
    { label: 'Constats', tone: 'navy', lines: constats },
    attention.length ? { label: 'Points d’attention', tone: 'red', lines: attention } : { label: 'Points d’attention', tone: 'green', lines: ['Aucune concentration ni variation marquée (seuils : 50 % du total, 20 % d’un mois sur l’autre).'] },
  ];
}

/** Pareto in 3D: the top items as 3D columns and the cumulative share as a gold line (right axis, 0-100 %). */
export function pareto3dSvg(o: { title: string; subtitle?: string; categories: string[]; values: number[]; total: number; W?: number; H?: number }, p: Palette3d): string {
  const W = o.W ?? 1520;
  const H = o.H ?? 760;
  const c = card(W, H, o.title, o.subtitle ?? '', p);
  const n = Math.max(1, Math.min(10, o.categories.length));
  const vals = o.values.slice(0, n);
  const ax = niceAxis(Math.max(...vals));
  const max = ax.top;
  const left = c.x + 70;
  const right = c.x + c.w - 60;
  const top = c.y + 30;
  const bottom = c.y + c.h - 46;
  const step = (right - left) / n;
  const bw = step * 0.56;
  const d = bw * 0.26;
  let s = c.head;
  for (let k = 0; k <= 4; k++) {
    const y = bottom - ((bottom - top) * k) / 4;
    s += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#E5EAF0" stroke-width="1.2"/><text x="${right + 12}" y="${y + 5}" font-family="'${p.mono}', Consolas, monospace" font-size="14" fill="${p.gold}">${k * 25} %</text>`;
  }
  for (let v = 0; v <= max + 1e-9; v += ax.step) s += `<text x="${left - 12}" y="${bottom - (v / max) * (bottom - top - d) + 5}" text-anchor="end" font-family="'${p.mono}', Consolas, monospace" font-size="14" fill="${p.muted}">${esc(fmtShort(v))}</text>`;
  let cum = 0;
  const pts: string[] = [];
  vals.forEach((v, i) => {
    const x = left + i * step + (step - bw) / 2;
    const h = Math.max(3, (v / max) * (bottom - top - d));
    const y = bottom - h;
    const base = p.blue;
    const g = id('g');
    s += `<defs><linearGradient id="${g}" x1="0" x2="1"><stop offset="0" stop-color="${shade(base, -0.05)}"/><stop offset="0.25" stop-color="${shade(base, 0.35)}"/><stop offset="1" stop-color="${shade(base, -0.2)}"/></linearGradient></defs>`;
    s += `<polygon points="${x + bw},${y} ${x + bw + d},${y - d * 0.62} ${x + bw + d},${bottom - d * 0.62} ${x + bw},${bottom}" fill="${shade(base, -0.38)}"/><polygon points="${x},${y} ${x + d},${y - d * 0.62} ${x + bw + d},${y - d * 0.62} ${x + bw},${y}" fill="${shade(base, 0.3)}"/><rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="url(#${g})"/>`;
    s += `<text x="${x + bw / 2}" y="${bottom + 26}" text-anchor="middle" font-size="13" fill="${p.muted}">${esc(trunc(o.categories[i]!, Math.max(5, Math.round(step / 8.5))))}</text>`;
    cum += v;
    const cy = bottom - (o.total ? Math.min(1, cum / o.total) : 0) * (bottom - top);
    pts.push(`${(x + bw / 2 + d / 2).toFixed(1)},${cy.toFixed(1)}`);
  });
  s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${p.gold}" stroke-width="4" stroke-linejoin="round"/>`;
  pts.forEach((pt, i) => {
    const [x, y] = pt.split(',').map(Number) as [number, number];
    s += `<circle cx="${x}" cy="${y}" r="6" fill="#FFFFFF" stroke="${p.gold}" stroke-width="3"/>`;
    if (i === pts.length - 1) s += `<text x="${x}" y="${y - 14}" text-anchor="middle" font-family="'${p.mono}', Consolas, monospace" font-size="16" font-weight="700" fill="${p.text}">${esc(pct(vals.reduce((a, b) => a + b, 0), o.total))}</text>`;
  });
  return `${s}</svg>`;
}

/** The 3D palette of a house design (Maison 2.0 palettes, built-in themes or custom colours). */
export function paletteOf(d: { color: Record<string, string>; chartSeries: readonly string[]; font: { ui: string; mono: string } }): Palette3d {
  const c = (k: string, f: string) => `#${(d.color[k] ?? f).replace('#', '')}`;
  return {
    navy: c('navy', '001B4D'),
    blue: c('blue', '003DA5'),
    gold: c('gold', 'C8A951'),
    cyan: c('cyan', '06B6D4'),
    text: c('text', '0F172A'),
    muted: '#64748B',
    series: d.chartSeries.map((s) => `#${s.replace('#', '')}`),
    font: d.font.ui,
    mono: d.font.mono,
  };
}

/** Trend in relief: gradient area, shadowed line, haloed markers, first / max / last values labelled. */
export function area3dSvg(o: { title: string; subtitle?: string; categories: string[]; values: number[]; W?: number; H?: number }, p: Palette3d): string {
  const W = o.W ?? 1520;
  const H = o.H ?? 760;
  const c = card(W, H, o.title, o.subtitle ?? '', p);
  const vals = o.values.slice(-24);
  const cats = o.categories.slice(-24);
  const n = vals.length;
  const lo = Math.min(...vals, 0);
  const ax = niceAxis(Math.max(...vals, 0) - lo);
  const min = lo < 0 ? -Math.ceil(-lo / ax.step) * ax.step : 0;
  const max = min + niceAxis(Math.max(...vals, 0) - min).top;
  const vmax = Math.max(...vals);
  const left = c.x + 70;
  const right = c.x + c.w - 30;
  const top = c.y + 34;
  const bottom = c.y + c.h - 46;
  const X = (i: number) => left + (n <= 1 ? (right - left) / 2 : (i * (right - left)) / (n - 1));
  const Y = (v: number) => bottom - ((v - min) / (max - min || 1)) * (bottom - top);
  const g = id('g');
  const sh = id('sh');
  let s = c.head;
  s += `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.blue}" stop-opacity="0.55"/><stop offset="1" stop-color="${p.blue}" stop-opacity="0.04"/></linearGradient><filter id="${sh}" x="-5%" y="-20%" width="110%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="5" flood-color="${p.navy}" flood-opacity="0.35"/></filter></defs>`;
  const st = niceAxis(max - min).step;
  for (let v = min; v <= max + 1e-9; v += st) {
    const y = Y(v);
    s += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#E5EAF0" stroke-width="1.2"/><text x="${left - 14}" y="${y + 5}" text-anchor="end" font-family="'${p.mono}', Consolas, monospace" font-size="15" fill="${p.muted}">${esc(fmtShort(v))}</text>`;
  }
  const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
  s += `<path d="M${X(0)},${bottom} L${pts.join(' L')} L${X(n - 1)},${bottom} Z" fill="url(#${g})"/>`;
  s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${p.navy}" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round" filter="url(#${sh})"/>`;
  const iMax = vals.indexOf(vmax);
  const mark = new Set([0, iMax, n - 1]);
  vals.forEach((v, i) => {
    const big = mark.has(i);
    s += `<circle cx="${X(i)}" cy="${Y(v)}" r="${big ? 8 : 5}" fill="${big ? p.gold : '#FFFFFF'}" stroke="${p.navy}" stroke-width="3"/>`;
    if (big) s += `<text x="${X(i)}" y="${Y(v) - 18}" text-anchor="middle" font-family="'${p.mono}', Consolas, monospace" font-size="16" font-weight="700" fill="${p.text}">${esc(fmtShort(v))}</text>`;
  });
  const every = Math.max(1, Math.ceil(n / 8));
  cats.forEach((cat, i) => {
    if (i % every === 0 || i === n - 1) s += `<text x="${X(i)}" y="${bottom + 30}" text-anchor="middle" font-size="14" fill="${p.muted}">${esc(trunc(cat, 12))}</text>`;
  });
  return `${s}</svg>`;
}

/** Puts a full card SVG inside a composite at (x, y), without its own white page. */
function embed(svg: string, x: number, y: number): string {
  return svg
    .replace(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /, `<svg x="${x}" y="${y}" `)
    .replace(/<rect x="0" y="0" width="\d+" height="\d+" fill="#FFFFFF"\/>/, '');
}
const svgSize = (svg: string) => {
  const m = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
  return { w: m ? +m[1]! : 0, h: m ? +m[2]! : 0 };
};

export interface Synthesis {
  svg: string;
  width: number;
  height: number;
  /** Number of charts drawn (KPIs and the reading card not counted). */
  charts: number;
}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface View3d {
  title: string;
  categories: string[];
  values: number[];
  valueName: string;
  ordered: boolean;
  /** The column the view groups by. */
  col?: string;
}
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const asDate = (v: unknown): Date | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};
const MONEY = /montant|solde|encours|total|chiffre|\bca\b|valeur|prix|xof|fcfa|eur|usd|amount|revenue|sales|ventes?|co[uû]t|budget|limite|impay|cr[ée]ance|marge|profit/i;
const NOT_MEASURE = /^(id|n°|no\b|num|code|stade|ann[ée]e|year|mois|month|rang|rank|t[ée]l|phone)/i;

/** What the board shows, read from the rows: the measure (money first), groupings, a top-10, a monthly trend, KPIs. */
export function analyse3d(columns: string[], rows: Record<string, unknown>[]): { measure: string | null; total: number; kpis: { label: string; value: string }[]; groups: View3d[]; counts: View3d | null; top: View3d | null; trend: View3d | null } {
  const sample = rows.slice(0, 400);
  const share = (c: string, f: (v: unknown) => boolean) => sample.length > 0 && sample.filter((r) => f(r[c])).length >= sample.length * 0.6;
  const dateCols = columns.filter((c) => share(c, (v) => asDate(v) !== null));
  const numCols = columns.filter((c) => !dateCols.includes(c) && share(c, isNum));
  const sums = new Map(numCols.map((c) => [c, rows.reduce((a, r) => a + (isNum(r[c]) ? Math.abs(r[c] as number) : 0), 0)]));
  const measures = numCols.filter((c) => !NOT_MEASURE.test(c.trim()));
  const measure = [...measures].sort((a, b) => (MONEY.test(b) ? 1 : 0) - (MONEY.test(a) ? 1 : 0) || sums.get(b)! - sums.get(a)!)[0] ?? null;
  const valOf = (r: Record<string, unknown>) => (measure ? (isNum(r[measure]) ? (r[measure] as number) : 0) : 1);
  const valueName = measure ?? 'Nombre';
  const textCols = columns.filter((c) => !numCols.includes(c) && !dateCols.includes(c) && sample.some((r) => typeof r[c] === 'string' && r[c] !== ''));
  const distinct = (c: string) => new Set(sample.map((r) => String(r[c] ?? ''))).size;
  const sumBy = (key: (r: Record<string, unknown>) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = key(r);
      if (k !== null) m.set(k, (m.get(k) ?? 0) + valOf(r));
    }
    return m;
  };
  const groups: View3d[] = textCols
    .filter((c) => distinct(c) >= 2 && distinct(c) <= 15)
    .sort((a, b) => Math.abs(distinct(a) - 6) - Math.abs(distinct(b) - 6))
    .slice(0, 3)
    .map((c) => {
      const s = [...sumBy((r) => String(r[c] ?? '—'))].sort((a, b) => b[1] - a[1]);
      return { title: `${valueName} par ${c}`, categories: s.map(([k]) => k), values: s.map(([, v]) => v), valueName, ordered: false, col: c };
    });
  // Number of rows per category of the first grouping (contracts, operations…) — only when a measure is summed.
  let counts: View3d | null = null;
  if (measure && groups[0]?.col) {
    const c = groups[0].col;
    const m = new Map<string, number>();
    for (const r of rows) m.set(String(r[c] ?? '—'), (m.get(String(r[c] ?? '—')) ?? 0) + 1);
    const s = [...m].sort((x, y) => y[1] - x[1]);
    counts = { title: `Nombre de lignes par ${c}`, categories: s.map(([k]) => k), values: s.map(([, v]) => v), valueName: 'Nombre', ordered: false, col: c };
  }
  // The « who » column for the top 10: a name (client, société, agence…), never a code or a reference.
  const whoScore = (c: string) =>
    (/client|nom|name|soci[ée]t[ée]|raison|d[ée]biteur|agence|compte|produit/i.test(c) ? 2 : 0) -
    (/code|^id\b|n°|r[ée]f|num[ée]ro|matricule/i.test(c) ? 4 : 0) -
    (sample.filter((r) => /^[\d\s.-]+$/.test(String(r[c] ?? ''))).length > sample.length * 0.5 ? 4 : 0);
  const wide = textCols.filter((c) => distinct(c) > 15).sort((a, b) => whoScore(b) - whoScore(a))[0];
  let top: View3d | null = null;
  if (wide) {
    const s = [...sumBy((r) => String(r[wide] ?? '—'))].sort((a, b) => b[1] - a[1]).slice(0, 10);
    top = { title: `Top ${s.length} — ${valueName} par ${wide}`, categories: s.map(([k]) => k), values: s.map(([, v]) => v), valueName, ordered: false, col: wide };
  } else if (groups[0]) top = { ...groups[0], title: `Classement — ${groups[0].title}`, categories: groups[0].categories.slice(0, 10), values: groups[0].values.slice(0, 10) };
  let trend: View3d | null = null;
  if (dateCols[0]) {
    const d = dateCols[0];
    const m = sumBy((r) => {
      const x = asDate(r[d]);
      return x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` : null;
    });
    const keys = [...m.keys()].sort().slice(-24);
    if (keys.length >= 3) trend = { title: `${valueName} par mois (${d})`, categories: keys.map((k) => `${MONTHS[+k.slice(5) - 1]} ${k.slice(2, 4)}`), values: keys.map((k) => m.get(k)!), valueName, ordered: true, col: d };
  }
  const total = measure ? rows.reduce((x, r) => x + (isNum(r[measure]) ? (r[measure] as number) : 0), 0) : rows.length;
  const kpis = [{ label: 'Lignes', value: rows.length.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ') }];
  if (measure) {
    const v = rows.map((r) => r[measure]).filter(isNum);
    const tot = v.reduce((a, b) => a + b, 0);
    kpis.push({ label: `Σ ${measure}`, value: fmtShort(tot) }, { label: `Moyenne ${measure}`, value: fmtShort(v.length ? tot / v.length : 0) });
    if (top && tot) kpis.push({ label: `Part du top ${top.categories.length}`, value: `${((top.values.reduce((a, b) => a + b, 0) / tot) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` });
    else kpis.push({ label: `Max ${measure}`, value: fmtShort(v.length ? Math.max(...v) : 0) });
  }
  return { measure, total, kpis, groups, counts, top, trend };
}

/**
 * « SYNTHÈSE 3D » — the house board placed BEFORE the table: navy title band with gold filet, KPI tiles, a 2 × 2 grid
 * of 3D visuals (columns, donut, top-10 bars, trend in relief), then the « Lecture » card. Every figure is computed
 * from the rows (sums, shares, ranks); null when the data has nothing to chart.
 */
export function synthesisSvg(o: { title: string; subtitle?: string; columns: string[]; rows: Record<string, unknown>[]; /** Logo (data URL), already harmonised to the palette, shown in the band. */ logo?: { href: string; width: number; height: number } }, p: Palette3d): Synthesis | null {
  const a = analyse3d(o.columns, o.rows);
  const { groups, top, trend, kpis, counts } = a;
  const main = groups[0] ?? top;
  if (!main || main.categories.length < 2) return null;
  const W = 1800;
  const cw = 880;
  const ch = 560;
  const parts: string[] = [];
  // Row 1 — 3D columns (first grouping) + 3D donut (shares of the second grouping, else the first).
  parts.push(bar3dSvg({ title: main.title, subtitle: `Total par catégorie${main.categories.length > 8 ? ' · 8 premières' : ''}`, categories: main.categories, values: main.values, colors: p.series, W: cw, H: ch }, p));
  const share = groups[1] && groups[1].categories.length <= 12 ? groups[1] : main;
  parts.push(donut3dSvg({ title: `Répartition — ${share.title}`, subtitle: 'Part de chaque catégorie dans le total', categories: share.categories, values: share.values, W: cw, H: ch }, p));
  // Row 2 — top-10 3D bars (leader in gold) + trend in relief (else another grouping in 3D columns).
  if (top && top !== main)
    parts.push(hbar3dSvg({ title: top.title, subtitle: 'Classement décroissant', categories: top.categories, values: top.values, colors: top.values.map((_, i) => (i === 0 ? p.gold : p.navy)), W: cw, H: ch }, p));
  const other = groups.find((g) => g !== main && g !== share) ?? null;
  const fourth = trend ?? other;
  if (fourth)
    parts.push(
      fourth.ordered
        ? area3dSvg({ title: `Évolution — ${fourth.title}`, subtitle: `${fourth.categories[0]} → ${fourth.categories[fourth.categories.length - 1]}`, categories: fourth.categories, values: fourth.values, W: cw, H: ch }, p)
        : bar3dSvg({ title: fourth.title, subtitle: 'Total par catégorie', categories: fourth.categories, values: fourth.values, colors: [...p.series].reverse(), W: cw, H: ch }, p),
    );
  // Row 3 — Pareto of the top items (cumulative share) + number of rows per category (or the remaining grouping).
  if (top && top.values.length >= 3 && a.total > 0)
    parts.push(pareto3dSvg({ title: `Pareto — ${top.title.replace(/^Top \d+ — /, '')}`, subtitle: 'Montant par élément et part cumulée du total', categories: top.categories, values: top.values, total: a.total, W: cw, H: ch }, p));
  const sixth = counts ?? (trend && other ? other : null);
  if (sixth) parts.push(bar3dSvg({ title: sixth.title, subtitle: sixth === counts ? 'Nombre de lignes du fichier par catégorie' : 'Total par catégorie', categories: sixth.categories, values: sixth.values, colors: [p.navy, p.cyan, p.gold, p.blue, ...p.series], W: cw, H: ch }, p));
  const charts = parts.length;
  const lecture = insightCardSvg({ title: `Lecture — ${o.title}`, date: fmtDateShort(), sections: insightFacts({ rows: o.rows.length, measure: a.measure, total: a.total, main: groups[0] ?? null, mainCol: groups[0]?.col ?? '', top, topCol: top?.col ?? '', trend }), W: W - 14 }, p);
  // Composite: band, KPI tiles, grid, reading card.
  const bandH = 150;
  const tiles = kpis.slice(0, 4);
  const kpiY = bandH + 30;
  const kpiH = 150;
  const gridY = kpiY + kpiH + 30;
  const rowsN = Math.ceil(parts.length / 2);
  const lectY = gridY + rowsN * (ch + 14);
  const H = lectY + svgSize(lecture).h + 20;
  const bg = id('bg');
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'${p.font}', 'Segoe UI', Calibri, Arial, sans-serif">
<defs><linearGradient id="${bg}" x1="0" x2="1"><stop offset="0" stop-color="${p.navy}"/><stop offset="1" stop-color="${p.blue}"/></linearGradient><filter id="${bg}s" x="-5%" y="-5%" width="112%" height="125%"><feDropShadow dx="4" dy="6" stdDeviation="5" flood-color="#5B6B80" flood-opacity="0.25"/></filter></defs>
<rect x="0" y="0" width="${W}" height="${H}" fill="${shade(p.blue, 0.94)}"/>
<rect x="20" y="20" width="${W - 40}" height="${bandH - 20}" rx="20" fill="url(#${bg})"/>
<rect x="20" y="${bandH - 6}" width="${W - 40}" height="6" rx="3" fill="${p.gold}"/>
<text x="60" y="88" font-size="40" font-weight="800" fill="#FFFFFF">${esc(trunc(o.title, 60))}</text>
<text x="60" y="122" font-size="18" fill="${shade(p.blue, 0.75)}">${esc(trunc(o.subtitle ?? '', 110))}</text>
<text x="${W - 60}" y="${o.logo ? 124 : 88}" text-anchor="end" font-size="16" font-weight="700" fill="${p.gold}" letter-spacing="2">SYNTHÈSE 3D</text>`;
  if (o.logo) {
    const lh = 64;
    const lw = Math.min(320, (lh * o.logo.width) / Math.max(1, o.logo.height));
    s += `<image href="${esc(o.logo.href)}" x="${W - 60 - lw}" y="36" width="${lw}" height="${lh}" preserveAspectRatio="xMaxYMid meet"/>`;
  }
  const tw = (W - 40 - (tiles.length - 1) * 24) / Math.max(1, tiles.length);
  tiles.forEach((k, i) => {
    const x = 20 + i * (tw + 24);
    const col = p.series[i % p.series.length] ?? p.blue;
    s += `<rect x="${x}" y="${kpiY}" width="${tw}" height="${kpiH - 14}" rx="16" fill="#FFFFFF" filter="url(#${bg}s)"/>`;
    s += `<path d="M${x},${kpiY + 16} a16,16 0 0 1 16,-16 h${tw - 32} a16,16 0 0 1 16,16 v2 h-${tw} z" fill="${col}"/>`;
    s += `<text x="${x + 26}" y="${kpiY + 52}" font-size="15" font-weight="700" fill="${p.muted}" letter-spacing="1">${esc(trunc(k.label.toUpperCase(), 34))}</text>`;
    s += `<text x="${x + 26}" y="${kpiY + 108}" font-family="'${p.mono}', Consolas, monospace" font-size="40" font-weight="700" fill="${p.navy}">${esc(k.value)}</text>`;
  });
  // Cards (inner rect from x+10 to x+W-16) aligned on the band: 20 → 1780.
  parts.forEach((svg, i) => (s += embed(svg, i % 2 ? W - 4 - cw : 10, gridY + Math.floor(i / 2) * (ch + 14))));
  s += embed(lecture, 10, lectY);
  return { svg: `${s}</svg>`, width: W, height: H, charts };
}
const fmtDateShort = () => new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

/** One chart of data.chart as a 3D card (Word / PowerPoint / PDF reports); null when the chart has no 3D form. */
export function chart3dSvg(type: string, title: string, categories: string[], values: number[], p: Palette3d): string | null {
  if (categories.length < 1 || values.length !== categories.length) return null;
  if (type === 'pie') return donut3dSvg({ title, categories, values }, p);
  if (type === 'line' || type === 'area') return categories.length >= 2 ? area3dSvg({ title, categories, values }, p) : null;
  if (type === 'bar') return categories.length > 8 ? hbar3dSvg({ title, categories, values, colors: values.map((_, i) => (i === 0 ? p.gold : p.navy)) }, p) : bar3dSvg({ title, categories, values, colors: p.series }, p);
  return null;
}
