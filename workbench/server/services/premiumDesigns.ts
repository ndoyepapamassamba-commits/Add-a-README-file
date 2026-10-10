// PREMIUM DESIGN GALLERY — what the user picks BEFORE any deliverable. Each design is a full visual system (palette,
// typography, accents) applied to Excel / Word / PowerPoint / PDF / mail by the exporters (activeDesign) and to sites and
// apps through a generated premium stylesheet. Thumbnails are SVG drawn from the SAME tokens the exporters use, so what you
// pick is what you get.
import { THEMES, buildTheme, type CustomTheme, type ThemeId } from './houseDesign';

export type DeliverableKind = 'excel' | 'document' | 'slides' | 'web';
export interface PremiumDesign {
  id: ThemeId;
  label: string;
  tagline: string;
  /** Best for … (shown under the thumbnail). */
  bestFor: string;
}
export const PREMIUM_DESIGNS: PremiumDesign[] = [
  { id: 'house', label: THEMES.house.label, tagline: 'Bandeaux navy, filet or, cartes KPI', bestFor: 'Reporting bancaire, COMEX' },
  { id: 'onyx', label: THEMES.onyx.label, tagline: 'Noir profond et or, serif élégante', bestFor: 'Direction, investisseurs' },
  { id: 'sapphire', label: THEMES.sapphire.label, tagline: 'Bleu royal, argent, très lisible', bestFor: 'Finance, conseil' },
  { id: 'emerald', label: THEMES.emerald.label, tagline: 'Vert émeraude et laiton', bestFor: 'Performance, ESG, budget' },
  { id: 'ivory', label: THEMES.ivory.label, tagline: 'Crème, charbon, Garamond', bestFor: 'Rapports narratifs, notes' },
  { id: 'terracotta', label: THEMES.terracotta.label, tagline: 'Terracotta, ocre, indigo', bestFor: 'Afrique, culture, marketing' },
  { id: 'graphite', label: THEMES.graphite.label, tagline: 'Gris graphite, cyan électrique', bestFor: 'Tech, data, monitoring' },
  { id: 'swiss', label: THEMES.swiss.label, tagline: 'Grille suisse, rouge signal', bestFor: 'Synthèses percutantes' },
  { id: 'modern', label: THEMES.modern.label, tagline: 'Indigo moderne, accents ambre', bestFor: 'Produit, startup' },
  { id: 'minimal', label: THEMES.minimal.label, tagline: 'Noir & blanc pur', bestFor: 'Impression, sobriété' },
  { id: 'executive', label: THEMES.executive.label, tagline: 'Bordeaux et or', bestFor: 'Conseil d’administration' },
  { id: 'corporate', label: THEMES.corporate.label, tagline: 'Gris-bleu institutionnel', bestFor: 'Administration, RH' },
  { id: 'warm', label: THEMES.warm.label, tagline: 'Orange chaleureux', bestFor: 'Communication interne' },
  { id: 'nature', label: THEMES.nature.label, tagline: 'Vert nature', bestFor: 'Agri, RSE' },
];

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
/** SVG thumbnail (240×150) of a deliverable in a design — drawn from the exporters' own tokens. */
export function designThumbnail(id: ThemeId, kind: DeliverableKind): string {
  const d = buildTheme(id);
  const c = d.color;
  const h = (x: string) => `#${x}`;
  const font = esc(d.font.ui);
  const series = d.chartSeries.slice(0, 4).map(h);
  const parts: string[] = [];
  const W = 240;
  const H = 150;
  parts.push(`<rect width="${W}" height="${H}" rx="8" fill="#fff"/>`);
  if (kind === 'excel') {
    parts.push(`<rect x="0" y="0" width="${W}" height="24" rx="8" fill="${h(c.navy)}"/><rect x="0" y="16" width="${W}" height="8" fill="${h(c.navy)}"/>`);
    parts.push(`<text x="10" y="16" font-family="${font}" font-size="10" font-weight="700" fill="#fff">SYNTHÈSE</text>`);
    parts.push(`<rect x="0" y="24" width="${W}" height="9" fill="${h(c.blue)}"/><rect x="0" y="33" width="${W}" height="2" fill="${h(c.gold)}"/>`);
    for (let i = 0; i < 4; i++) {
      const x = 8 + i * 57;
      parts.push(`<rect x="${x}" y="40" width="52" height="24" rx="3" fill="${h(c.panel)}" stroke="${h(c.line)}"/>`);
      parts.push(`<rect x="${x + 5}" y="44" width="22" height="3" fill="${h(c.text2)}" opacity=".5"/><rect x="${x + 5}" y="51" width="34" height="7" rx="1" fill="${h(c.navy)}"/>`);
    }
    parts.push(`<rect x="8" y="70" width="140" height="10" fill="${h(c.blue)}"/>`);
    for (let r = 0; r < 6; r++) parts.push(`<rect x="8" y="${80 + r * 10}" width="140" height="10" fill="${r % 2 ? h(c.panel) : '#fff'}" stroke="${h(c.line)}" stroke-width=".5"/><rect x="12" y="${83 + r * 10}" width="40" height="3" fill="${h(c.text)}" opacity=".55"/><rect x="${120 - (r % 3) * 6}" y="${83 + r * 10}" width="${22 + (r % 3) * 6}" height="3" fill="${h(c.text)}" opacity=".7"/>`);
    parts.push(`<rect x="156" y="70" width="76" height="70" rx="3" fill="${h(c.ice)}"/>`);
    [38, 52, 30, 46].forEach((v, i) => parts.push(`<rect x="${164 + i * 16}" y="${132 - v}" width="11" height="${v}" rx="1.5" fill="${series[i % series.length]}"/>`));
  } else if (kind === 'document') {
    parts.push(`<rect x="0" y="0" width="${W}" height="30" rx="8" fill="${h(c.navy)}"/><rect x="0" y="22" width="${W}" height="8" fill="${h(c.navy)}"/><rect x="0" y="30" width="${W}" height="2.5" fill="${h(c.gold)}"/>`);
    parts.push(`<text x="14" y="20" font-family="${font}" font-size="11" font-weight="700" fill="#fff">Rapport</text>`);
    parts.push(`<rect x="14" y="42" width="110" height="7" rx="1" fill="${h(c.blue)}"/>`);
    for (let i = 0; i < 4; i++) parts.push(`<rect x="14" y="${56 + i * 8}" width="${200 - (i % 2) * 40}" height="3" fill="${h(c.text)}" opacity=".45"/>`);
    parts.push(`<rect x="14" y="92" width="212" height="22" rx="3" fill="${h(c.ice)}"/><rect x="14" y="92" width="3" height="22" fill="${h(c.gold)}"/><rect x="24" y="99" width="150" height="3" fill="${h(c.text2)}" opacity=".6"/>`);
    parts.push(`<rect x="14" y="120" width="212" height="8" fill="${h(c.blue)}"/><rect x="14" y="128" width="212" height="8" fill="${h(c.panel)}" stroke="${h(c.line)}" stroke-width=".5"/>`);
  } else if (kind === 'slides') {
    parts.push(`<rect width="${W}" height="${H}" rx="8" fill="${h(c.navy)}"/>`);
    parts.push(`<rect x="16" y="22" width="4" height="34" fill="${h(c.gold)}"/>`);
    parts.push(`<text x="28" y="38" font-family="${font}" font-size="14" font-weight="700" fill="#fff">Titre d’action</text>`);
    parts.push(`<text x="28" y="54" font-family="${font}" font-size="8" fill="${h(c.subtle)}">La conclusion d’abord</text>`);
    [44, 62, 36, 70, 52].forEach((v, i) => parts.push(`<rect x="${120 + i * 20}" y="${130 - v}" width="13" height="${v}" rx="2" fill="${i === 3 ? h(c.gold) : h(c.cyan)}" opacity="${i === 3 ? 1 : 0.75}"/>`));
    parts.push(`<rect x="28" y="72" width="70" height="3" fill="#fff" opacity=".5"/><rect x="28" y="80" width="56" height="3" fill="#fff" opacity=".5"/><rect x="28" y="88" width="64" height="3" fill="#fff" opacity=".5"/>`);
  } else {
    parts.push(`<rect x="0" y="0" width="52" height="${H}" rx="8" fill="${h(c.navy)}"/><rect x="44" y="0" width="8" height="${H}" fill="${h(c.navy)}"/>`);
    for (let i = 0; i < 5; i++) parts.push(`<rect x="10" y="${16 + i * 14}" width="${i === 1 ? 32 : 26}" height="5" rx="2" fill="${i === 1 ? h(c.gold) : '#fff'}" opacity="${i === 1 ? 1 : 0.45}"/>`);
    parts.push(`<rect x="60" y="10" width="172" height="16" rx="4" fill="${h(c.ice)}"/>`);
    for (let i = 0; i < 3; i++) parts.push(`<rect x="${60 + i * 58}" y="32" width="52" height="34" rx="6" fill="#fff" stroke="${h(c.line)}"/><rect x="${66 + i * 58}" y="40" width="20" height="3" fill="${h(c.text2)}" opacity=".5"/><rect x="${66 + i * 58}" y="48" width="32" height="9" rx="2" fill="${i === 0 ? h(c.blue) : h(c.navy)}"/>`);
    parts.push(`<rect x="60" y="72" width="172" height="68" rx="6" fill="#fff" stroke="${h(c.line)}"/>`);
    parts.push(`<polyline points="68,128 92,110 116,116 140,96 164,102 188,84 220,90" fill="none" stroke="${h(c.blue)}" stroke-width="2.5"/>`);
    parts.push(`<polyline points="68,132 92,124 116,126 140,116 164,120 188,108 220,112" fill="none" stroke="${h(c.gold)}" stroke-width="2"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join('')}</svg>`;
}
export const thumbnailDataUrl = (id: ThemeId, kind: DeliverableKind) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(designThumbnail(id, kind))}`;

/** Premium stylesheet for sites and apps: CSS variables + refined base components, from the same tokens. */
export function webThemeCss(id: ThemeId | CustomTheme): string {
  const d = buildTheme(id);
  const c = d.color;
  const serif = /Georgia|Garamond/i.test(d.font.ui);
  return `<style data-premium-theme="${typeof id === 'string' ? id : 'custom'}">
:root{--navy:#${c.navy};--brand:#${c.blue};--accent:#${c.gold};--accent-2:#${c.cyan};--bg:#${c.ice};--panel:#${c.panel};--line:#${c.line};--text:#${c.text};--text-2:#${c.text2};--ok:#${c.green};--risk:#${c.risk};--radius:14px;--shadow:0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.08);--font:"${d.font.ui}",${serif ? 'Georgia,serif' : '"Segoe UI",system-ui,-apple-system,sans-serif'};--mono:"${d.font.mono}",ui-monospace,monospace}
*{box-sizing:border-box}html{-webkit-font-smoothing:antialiased}body{margin:0;font:15px/1.6 var(--font);color:var(--text);background:var(--bg)}
h1,h2,h3{color:var(--navy);letter-spacing:-.01em;line-height:1.2}h1{font-size:clamp(26px,3vw,38px);font-weight:750}h2{font-size:22px;font-weight:700}h3{font-size:16px;font-weight:650}
a{color:var(--brand)}header.app,.topbar{background:var(--navy);color:#fff;padding:14px 24px;border-bottom:3px solid var(--accent)}
.card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:18px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;box-shadow:var(--shadow)}.kpi .label{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-2)}.kpi .value{font:700 26px/1.2 var(--mono);color:var(--navy)}
table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}th{background:var(--brand);color:#fff;font-weight:600;text-align:left;padding:10px 12px;font-size:12.5px}td{padding:9px 12px;border-top:1px solid var(--line)}tr:nth-child(even) td{background:var(--panel)}td.num,th.num{text-align:right;font-family:var(--mono)}
button,.btn{font:600 13.5px var(--font);border:0;border-radius:10px;padding:9px 16px;background:var(--brand);color:#fff;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.08);transition:transform .08s,filter .15s}button:hover,.btn:hover{filter:brightness(1.08)}button:active{transform:translateY(1px)}.btn.secondary{background:#fff;color:var(--navy);border:1px solid var(--line)}
input,select,textarea{font:inherit;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:#fff;color:var(--text)}input:focus,select:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
.badge{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;background:var(--panel);color:var(--navy);border:1px solid var(--line)}
.accent-bar{height:3px;background:linear-gradient(90deg,var(--accent),var(--accent-2))}
@media (max-width:720px){body{font-size:14.5px}.card,.kpi{padding:14px}}
</style>`;
}
/** Adds the premium stylesheet to an HTML page (once). */
export function applyWebTheme(html: string, id: ThemeId | CustomTheme): string {
  if (/data-premium-theme=/.test(html)) return html;
  const css = webThemeCss(id);
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}\n${css}`) : `${css}\n${html}`;
}
export const kindForTool = (tool: string, args: Record<string, unknown>): DeliverableKind | null => {
  if (tool === 'data.export') return 'excel';
  if (tool === 'apex.build_app') return 'web';
  if (tool === 'artifact.create') return args.type === 'html' || /\.html?$/i.test(String(args.name ?? '')) ? 'web' : null;
  if (tool === 'report.export') {
    const f = (args.formats as string[] | undefined) ?? [];
    return f.length === 1 && f[0] === 'pptx' ? 'slides' : 'document';
  }
  return null;
};

/** Palette extraction from a design image (vision model answer → custom theme). */
export const PALETTE_PROMPT =
  'Extract the visual design system of this image for reuse in documents and apps. Answer ONLY JSON: {"primary":"#RRGGBB" (main brand / header colour),"accent":"#RRGGBB" (highlight colour),"dark":"#RRGGBB" (darkest title colour),"font":"closest common font family name (e.g. Inter, Georgia, Segoe UI, Montserrat)"}.';
export function parsePalette(text: string): CustomTheme | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const hex = (v: unknown) => (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : undefined);
    const t: CustomTheme = { primary: hex(j.primary), accent: hex(j.accent), dark: hex(j.dark), font: typeof j.font === 'string' ? j.font.slice(0, 40) : undefined };
    return t.primary || t.accent ? t : null;
  } catch {
    return null;
  }
}
