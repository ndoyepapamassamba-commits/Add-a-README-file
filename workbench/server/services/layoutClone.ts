// LAYOUT REPRODUCTION — a design found on the Internet becomes a real copy of its LAYOUT, filled with the user's processed
// data: a vision model reads the image into a structured layout spec (header / sidebar, KPI count and style, charts and
// their arrangement, table style, grid, radius, shadow, light or dark, palette, font); this module validates it and renders
// it with the real figures. Logos, photos and the source's own text are never copied — only the structure and the look.
import type { CustomTheme } from './houseDesign';

export type ChartType = 'bar' | 'hbar' | 'line' | 'area' | 'pie' | 'donut';
export interface DesignLayout {
  dark: boolean;
  navigation: 'top' | 'sidebar' | 'none';
  header: 'band' | 'minimal' | 'hero';
  kpis: { count: number; style: 'card' | 'tile' | 'accent-left' | 'ring' };
  charts: { type: ChartType; span: 1 | 2 | 3 }[];
  table: { style: 'zebra' | 'lined' | 'minimal'; position: 'bottom' | 'right' | 'none' };
  columns: 2 | 3 | 4;
  radius: number;
  shadow: boolean;
  palette: { bg: string; surface: string; primary: string; accent: string; text: string; muted: string; series: string[] };
  font: string;
}

export const LAYOUT_PROMPT = `You are a senior UI designer. Read this dashboard / report / app design and describe its LAYOUT so it can be rebuilt pixel-faithfully with other data. Ignore logos, photos and the text content. Answer ONLY JSON:
{"dark":bool,"navigation":"top"|"sidebar"|"none","header":"band"|"minimal"|"hero","kpis":{"count":0-8,"style":"card"|"tile"|"accent-left"|"ring"},"charts":[{"type":"bar"|"hbar"|"line"|"area"|"pie"|"donut","span":1|2|3}] (in reading order, max 6),"table":{"style":"zebra"|"lined"|"minimal","position":"bottom"|"right"|"none"},"columns":2|3|4 (grid columns of the main area),"radius":0-24 (px corner radius of cards),"shadow":bool,"palette":{"bg":"#hex page background","surface":"#hex card background","primary":"#hex main brand colour","accent":"#hex highlight","text":"#hex","muted":"#hex secondary text","series":["#hex", ... up to 5 chart colours]},"font":"closest font family (Inter, Montserrat, Poppins, Roboto, Georgia, Segoe UI…)"}`;

const HEX = /^#?[0-9a-f]{6}$/i;
const hex = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v.trim()) ? `#${v.trim().replace('#', '').toUpperCase()}` : d);
const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
const clampN = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

/** Validates the vision answer; anything missing or malformed falls back to a sane premium default. */
export function parseLayout(text: string): DesignLayout | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const dark = j.dark === true;
  const p = (j.palette ?? {}) as Record<string, unknown>;
  const k = (j.kpis ?? {}) as Record<string, unknown>;
  const t = (j.table ?? {}) as Record<string, unknown>;
  const charts = Array.isArray(j.charts) ? (j.charts as Record<string, unknown>[]) : [];
  const series = (Array.isArray(p.series) ? p.series : []).map((x) => hex(x, '')).filter(Boolean).slice(0, 5);
  const primary = hex(p.primary, dark ? '#6366F1' : '#1E3A8A');
  return {
    dark,
    navigation: pick(j.navigation, ['top', 'sidebar', 'none'] as const, 'top'),
    header: pick(j.header, ['band', 'minimal', 'hero'] as const, 'band'),
    kpis: { count: clampN(k.count, 0, 8, 4), style: pick(k.style, ['card', 'tile', 'accent-left', 'ring'] as const, 'card') },
    charts: charts.slice(0, 6).map((c) => ({ type: pick(c.type, ['bar', 'hbar', 'line', 'area', 'pie', 'donut'] as const, 'bar'), span: clampN(c.span, 1, 3, 1) as 1 | 2 | 3 })),
    table: { style: pick(t.style, ['zebra', 'lined', 'minimal'] as const, 'zebra'), position: pick(t.position, ['bottom', 'right', 'none'] as const, 'bottom') },
    columns: clampN(j.columns, 2, 4, 3) as 2 | 3 | 4,
    radius: clampN(j.radius, 0, 24, 12),
    shadow: j.shadow !== false,
    palette: {
      bg: hex(p.bg, dark ? '#0F172A' : '#F5F7FB'),
      surface: hex(p.surface, dark ? '#1E293B' : '#FFFFFF'),
      primary,
      accent: hex(p.accent, '#F59E0B'),
      text: hex(p.text, dark ? '#E2E8F0' : '#0F172A'),
      muted: hex(p.muted, dark ? '#94A3B8' : '#64748B'),
      series: series.length ? series : [primary, hex(p.accent, '#F59E0B'), '#10B981', '#06B6D4', '#EF4444'],
    },
    font: typeof j.font === 'string' && j.font.trim() ? j.font.replace(/[^\w \-]/g, '').slice(0, 40) : 'Inter',
  };
}
/** The Office exporters reuse the layout's look (palette + font). */
export const layoutTheme = (l: DesignLayout): CustomTheme => ({ primary: l.palette.primary, accent: l.palette.accent, dark: l.dark ? l.palette.surface : l.palette.text, font: l.font });
/** Excel can hold one native chart: the first chart type of the layout that Excel supports. */
export function excelChart(l: DesignLayout): 'bar' | 'line' | 'pie' | 'none' {
  const c = l.charts.find((x) => x.type);
  if (!c) return 'none';
  return c.type === 'line' || c.type === 'area' ? 'line' : c.type === 'pie' || c.type === 'donut' ? 'pie' : 'bar';
}

// ── data → dashboard content ─────────────────────────────────────────────────────────────────────────────────────────
export interface DashData {
  title: string;
  subtitle?: string;
  kpis: { label: string; value: string }[];
  categories: string[];
  series: { name: string; values: number[] }[];
  table: { columns: string[]; rows: (string | number)[][] };
}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const fmtNum = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ') : (Math.round(n * 100) / 100).toLocaleString('fr-FR'));
/** KPIs, chart series and table straight from the processed rows (exact figures, nothing invented). */
export function dashboardData(title: string, columns: string[], rows: Record<string, unknown>[], kpiCount = 4): DashData {
  const numCols = columns.filter((c) => {
    const v = rows.slice(0, 200).map((r) => r[c]);
    return v.length > 0 && v.filter(isNum).length / v.length >= 0.6;
  });
  const textCol = columns.find((c) => !numCols.includes(c)) ?? columns[0]!;
  const kpis: DashData['kpis'] = [{ label: 'Lignes', value: fmtNum(rows.length) }];
  for (const c of numCols) {
    const vals = rows.map((r) => r[c]).filter(isNum);
    kpis.push({ label: `Total ${c}`, value: fmtNum(vals.reduce((a, b) => a + b, 0)) });
    if (kpis.length < kpiCount) kpis.push({ label: `Moyenne ${c}`, value: fmtNum(vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)) });
  }
  // Series: by category of the first text column, sum of the first two numeric columns (top 12 categories).
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    const k = String(r[textCol] ?? '—');
    const g = groups.get(k) ?? numCols.slice(0, 2).map(() => 0);
    numCols.slice(0, 2).forEach((c, i) => (g[i]! += isNum(r[c]) ? (r[c] as number) : 0));
    groups.set(k, g);
  }
  const top = [...groups].sort((a, b) => (b[1][0] ?? 0) - (a[1][0] ?? 0)).slice(0, 12);
  return {
    title,
    kpis: kpis.slice(0, Math.max(1, kpiCount)),
    categories: top.map(([k]) => k),
    series: numCols.slice(0, 2).map((c, i) => ({ name: c, values: top.map(([, g]) => g[i] ?? 0) })),
    table: { columns, rows: rows.slice(0, 200).map((r) => columns.map((c) => (isNum(r[c]) ? (r[c] as number) : String(r[c] ?? '')))) },
  };
}

// ── renderer ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const esc = (s: unknown) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
function chartSvg(type: ChartType, d: DashData, colors: string[], text: string, muted: string): string {
  const W = 560;
  const H = 260;
  const s0 = d.series[0]?.values ?? [];
  const cats = d.categories;
  if (!s0.length) return `<div class="empty">Aucune donnée numérique</div>`;
  const max = Math.max(...d.series.flatMap((s) => s.values), 1);
  if (type === 'pie' || type === 'donut') {
    const tot = s0.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    let a0 = -Math.PI / 2;
    const arcs = s0.slice(0, 8).map((v, i) => {
      const a1 = a0 + (Math.max(0, v) / tot) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const r = 100;
      const p = `M${180 + r * Math.cos(a0)},${130 + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${180 + r * Math.cos(a1)},${130 + r * Math.sin(a1)} L180,130Z`;
      a0 = a1;
      return `<path d="${p}" fill="${colors[i % colors.length]}"/>`;
    });
    const legend = cats.slice(0, 8).map((c, i) => `<g transform="translate(320,${40 + i * 24})"><rect width="12" height="12" rx="3" fill="${colors[i % colors.length]}"/><text x="18" y="11" font-size="12" fill="${text}">${esc(c).slice(0, 26)}</text></g>`);
    const hole = type === 'donut' ? `<circle cx="180" cy="130" r="58" fill="var(--surface)"/><text x="180" y="136" text-anchor="middle" font-size="16" font-weight="700" fill="${text}">${esc(fmtNum(tot))}</text>` : '';
    return `<svg viewBox="0 0 ${W} ${H}" role="img">${arcs.join('')}${hole}${legend.join('')}</svg>`;
  }
  const n = Math.max(1, cats.length);
  const left = type === 'hbar' ? 120 : 40;
  const pw = W - left - 16;
  const ph = H - 50;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => (type === 'hbar' ? `<line x1="${left + pw * f}" y1="10" x2="${left + pw * f}" y2="${10 + ph}" stroke="${muted}" stroke-opacity=".18"/>` : `<line x1="${left}" y1="${10 + ph * (1 - f)}" x2="${W - 16}" y2="${10 + ph * (1 - f)}" stroke="${muted}" stroke-opacity=".18"/><text x="${left - 6}" y="${14 + ph * (1 - f)}" text-anchor="end" font-size="10" fill="${muted}">${esc(fmtNum(max * f))}</text>`)).join('');
  if (type === 'hbar') {
    const bh = Math.min(22, (ph / n) * 0.7);
    const bars = s0.map((v, i) => `<text x="${left - 6}" y="${10 + (ph / n) * i + bh}" text-anchor="end" font-size="11" fill="${text}">${esc(cats[i]).slice(0, 16)}</text><rect x="${left}" y="${10 + (ph / n) * i + 2}" width="${(pw * Math.max(0, v)) / max}" height="${bh}" rx="4" fill="${colors[0]}"/>`);
    return `<svg viewBox="0 0 ${W} ${H}" role="img">${grid}${bars.join('')}</svg>`;
  }
  const xs = (i: number) => left + (pw / n) * (i + 0.5);
  const y = (v: number) => 10 + ph - (ph * Math.max(0, v)) / max;
  const labels = cats.map((c, i) => `<text x="${xs(i)}" y="${H - 22}" text-anchor="middle" font-size="10" fill="${muted}">${esc(c).slice(0, 10)}</text>`).join('');
  if (type === 'line' || type === 'area') {
    const lines = d.series.map((s, k) => {
      const pts = s.values.map((v, i) => `${xs(i)},${y(v)}`).join(' ');
      const area = type === 'area' ? `<polygon points="${xs(0)},${10 + ph} ${pts} ${xs(s.values.length - 1)},${10 + ph}" fill="${colors[k % colors.length]}" fill-opacity=".18"/>` : '';
      return `${area}<polyline points="${pts}" fill="none" stroke="${colors[k % colors.length]}" stroke-width="2.5" stroke-linejoin="round"/>${s.values.map((v, i) => `<circle cx="${xs(i)}" cy="${y(v)}" r="3" fill="${colors[k % colors.length]}"/>`).join('')}`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img">${grid}${lines.join('')}${labels}</svg>`;
  }
  const groupW = (pw / n) * 0.7;
  const bw = groupW / Math.max(1, d.series.length);
  const bars = d.series.flatMap((s, k) => s.values.map((v, i) => `<rect x="${xs(i) - groupW / 2 + k * bw}" y="${y(v)}" width="${bw - 2}" height="${10 + ph - y(v)}" rx="3" fill="${colors[k % colors.length]}"/>`));
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${grid}${bars.join('')}${labels}</svg>`;
}

/** The layout rebuilt with the real data: a self-contained premium HTML dashboard. */
export function renderLayoutHtml(l: DesignLayout, d: DashData, source?: string): string {
  const p = l.palette;
  const shadow = l.shadow ? (l.dark ? '0 8px 24px rgba(0,0,0,.35)' : '0 1px 2px rgba(15,23,42,.06),0 10px 28px rgba(15,23,42,.08)') : 'none';
  const kpi = d.kpis
    .map((k, i) => {
      const accent = p.series[i % p.series.length];
      if (l.kpis.style === 'ring')
        return `<div class="card kpi ring"><svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="18" fill="none" stroke="${p.muted}" stroke-opacity=".2" stroke-width="5"/><circle cx="22" cy="22" r="18" fill="none" stroke="${accent}" stroke-width="5" stroke-dasharray="${70 + i * 12} 200" transform="rotate(-90 22 22)" stroke-linecap="round"/></svg><div><div class="label">${esc(k.label)}</div><div class="value">${esc(k.value)}</div></div></div>`;
      return `<div class="card kpi ${l.kpis.style}" style="--k:${accent}"><div class="label">${esc(k.label)}</div><div class="value">${esc(k.value)}</div></div>`;
    })
    .join('');
  const charts = (l.charts.length ? l.charts : [{ type: 'bar' as ChartType, span: 2 as const }])
    .map((c, i) => `<div class="card chart" style="grid-column:span ${Math.min(c.span, l.columns)}"><div class="ctitle">${esc(i === 0 ? `${d.series[0]?.name ?? 'Valeur'} par ${d.table.columns[0] ?? 'catégorie'}` : d.series[1]?.name ? `${d.series[1].name} par ${d.table.columns[0] ?? 'catégorie'}` : 'Répartition')}</div>${chartSvg(c.type, i === 0 || !d.series[1] ? d : { ...d, series: [d.series[1]!] }, p.series, p.text, p.muted)}</div>`)
    .join('');
  const table =
    l.table.position === 'none'
      ? ''
      : `<div class="card table-wrap" style="grid-column:span ${l.table.position === 'right' ? 1 : l.columns}"><table class="${l.table.style}"><thead><tr>${d.table.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${d.table.rows.map((r) => `<tr>${r.map((v) => `<td class="${typeof v === 'number' ? 'num' : ''}">${esc(typeof v === 'number' ? fmtNum(v) : v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const nav =
    l.navigation === 'sidebar'
      ? `<aside class="side"><div class="brand">${esc(d.title).slice(0, 18)}</div>${['Vue d’ensemble', 'Analyse', 'Détail', 'Export'].map((x, i) => `<div class="nav ${i === 0 ? 'on' : ''}">${x}</div>`).join('')}</aside>`
      : '';
  const header = l.header === 'band' ? `<header class="band"><h1>${esc(d.title)}</h1>${d.subtitle ? `<p>${esc(d.subtitle)}</p>` : ''}</header>` : l.header === 'hero' ? `<header class="hero"><h1>${esc(d.title)}</h1>${d.subtitle ? `<p>${esc(d.subtitle)}</p>` : ''}</header>` : `<header class="mini"><h1>${esc(d.title)}</h1>${d.subtitle ? `<p>${esc(d.subtitle)}</p>` : ''}</header>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.title)}</title>
<style data-premium-theme="layout">
:root{--bg:${p.bg};--surface:${p.surface};--primary:${p.primary};--accent:${p.accent};--text:${p.text};--muted:${p.muted};--r:${l.radius}px;--shadow:${shadow}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14.5px/1.55 "${esc(l.font)}",Inter,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.shell{display:flex;min-height:100vh}.side{width:220px;flex-shrink:0;background:${l.dark ? p.surface : p.primary};color:#fff;padding:22px 14px}.brand{font-weight:800;font-size:17px;margin-bottom:22px}.nav{padding:9px 12px;border-radius:calc(var(--r) * .7);opacity:.75;margin-bottom:4px}.nav.on{background:rgba(255,255,255,.14);opacity:1;font-weight:600}
main{flex:1;min-width:0;padding:22px 26px}
header.band{background:var(--primary);color:#fff;border-radius:var(--r);padding:22px 26px;margin-bottom:18px;box-shadow:var(--shadow)}header.band p{opacity:.85;margin:4px 0 0}
header.hero{background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;border-radius:var(--r);padding:34px 30px;margin-bottom:18px;box-shadow:var(--shadow)}header.hero h1{font-size:30px}
header.mini{margin:4px 0 18px}header.mini p{color:var(--muted);margin:2px 0 0}h1{margin:0;font-size:24px;letter-spacing:-.01em}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:16px}
.card{background:var(--surface);border-radius:var(--r);box-shadow:var(--shadow);padding:16px 18px;${l.dark ? '' : 'border:1px solid rgba(15,23,42,.06);'}}
.kpi .label{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.kpi .value{font-size:26px;font-weight:750;margin-top:4px}
.kpi.tile{background:var(--k);color:#fff}.kpi.tile .label{color:rgba(255,255,255,.85)}.kpi.accent-left{border-left:4px solid var(--k)}.kpi.ring{display:flex;gap:12px;align-items:center}
.grid{display:grid;grid-template-columns:repeat(${l.columns},minmax(0,1fr));gap:14px}.ctitle{font-weight:650;margin-bottom:8px}svg{width:100%;height:auto;display:block}
.table-wrap{overflow:auto;padding:0}table{width:100%;border-collapse:collapse;font-size:13px}th{position:sticky;top:0;background:var(--primary);color:#fff;text-align:left;padding:10px 12px;font-weight:600}td{padding:9px 12px}td.num{text-align:right;font-variant-numeric:tabular-nums}
table.zebra tr:nth-child(even) td{background:${l.dark ? 'rgba(255,255,255,.03)' : 'rgba(15,23,42,.025)'}}table.lined td{border-top:1px solid ${l.dark ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.08)'}}table.minimal th{background:transparent;color:var(--muted);border-bottom:2px solid var(--primary)}
.empty{color:var(--muted);padding:30px;text-align:center}footer{color:var(--muted);font-size:12px;margin-top:16px}
@media(max-width:860px){.shell{flex-direction:column}.side{width:auto}.grid{grid-template-columns:1fr}.card.chart,.table-wrap{grid-column:auto!important}main{padding:16px}}
</style></head><body><div class="shell">${nav}<main>${header}<section class="kpis">${kpi}</section><section class="grid">${charts}${table}</section><footer>Mise en page reproduite d’après un design de référence${source ? ` (${esc(source)})` : ''} · données : vos chiffres traités · ${new Date().toLocaleDateString('fr-FR')}</footer></main></div></body></html>`;
}
