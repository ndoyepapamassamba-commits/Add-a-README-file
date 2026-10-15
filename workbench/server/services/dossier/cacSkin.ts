// FORMAT « CAC » (v64, 15/10/2026) — grammaire relevée sur le classeur de référence de l'utilisateur (requête des
// commissaires aux comptes, 20 feuilles) : en-tête à fil d'Ariane (filet marine 5 pt, titre 20 pt, sous-titre gris chaud,
// « CONFIDENTIEL », pilule d'alerte, filet 2 pt), sections « 01  Titre » sur fond pâle soulignées de marine, cartes
// chiffrées à filet supérieur coloré, tuiles d'états cliquables (liseré, bandeau teinté, médaillon, grand chiffre,
// « Ouvrir → »), menu « PAGES » figé en colonne A, une couleur par feuille (onglet + bande).
// La STRUCTURE et les neutres chauds viennent du format ; la marine, l'accent et la famille des couleurs d'états viennent
// de la palette choisie par l'utilisateur (consigne : « cet export devra prendre les palettes de couleurs et le logo »).
// Les formes sont natives (DrawingML) : nettes à tout zoom, éditables, recolorables, lisibles par un lecteur d'écran —
// la référence utilisait des images figées.
import type { Design } from '../houseDesign';
import type { Figure } from './dossier';

type Col = Design['color'];
const hx = (c: string) => c.replace('#', '').slice(-6).toUpperCase();
const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
function hsl(h: string): [number, number, number] {
  const [r, g, b] = rgb(h);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const hue = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return [(hue + 360) % 360, s, l];
}
function hexOf(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/** Lighten toward white (0-1). */
export const tintOf = (h: string, f: number) =>
  [0, 2, 4]
    .map((i) => {
      const x = parseInt(h.slice(i, i + 2), 16);
      return Math.round(x + (255 - x) * f).toString(16).padStart(2, '0');
    })
    .join('')
    .toUpperCase();
const gap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** The format's own neutrals (warm ink, warm grey, warm line, cream) and its alert red — measured on the reference. */
export const CAC_NEUTRALS = { ink: '17130C', warm: '5A5549', line: 'C7C4BD', cream: 'F9F6F1', alert: 'B32322', alertBg: 'FFE8E6', white: 'FFFFFF' } as const;
/** Column A is the « PAGES » menu (frozen), B–L the content, M a gutter. Same content columns as the committee grid. */
export const CAC_GRID = [24, 5.86, 14.43, 21, 10.14, 10.14, 8, 12.29, 21, 21, 21, 21, 2.3];

/**
 * One colour per sheet / state, in the PALETTE's hues: each strong colour of the theme (primary, dark, accent, secondary,
 * chart series) at the format's muted depths (L 34 %, 27 %, 42 %), saturation kept within the palette's own range — the
 * reference's teal / rosewood / ochre / indigo… become, for Onyx & Or, charcoals and bronzes; for the Ecobank blue,
 * marines, teals and olives.
 */
export function cacStates(c: Col, series: string[] = [], n = 16): string[] {
  const bases: [number, number][] = [];
  for (const h of [c.blue, c.navy, c.gold, c.cyan, ...series].map(hx)) {
    const [hue, s, l] = hsl(h);
    if (l > 0.93 || l < 0.03) continue;
    if (bases.some(([bh, bs]) => gap(bh, hue) < 10 && Math.abs(bs - s) < 0.2)) continue;
    bases.push([hue, s]);
  }
  if (!bases.length) bases.push([210, 0.5]);
  const out: string[] = [];
  for (const L of [0.34, 0.27, 0.42, 0.22]) for (const [hue, s] of bases) {
    const x = hexOf(hue, Math.min(0.72, Math.max(s < 0.25 ? s : 0.32, s * 0.85)), L);
    if (!out.includes(x)) out.push(x);
  }
  return out.slice(0, n);
}

/** The CAC design: the palette's marine / accent, the format's warm neutrals, Calibri, state colours as chart series. */
export function cacDesign(d: Design): Design {
  const c = d.color;
  const states = cacStates(c, d.chartSeries);
  return {
    ...d,
    name: `${d.name} · format CAC`,
    color: {
      ...c,
      text: CAC_NEUTRALS.ink,
      text2: CAC_NEUTRALS.warm,
      line: CAC_NEUTRALS.line,
      panel: tintOf(hx(c.blue), 0.955),
      ice: CAC_NEUTRALS.cream,
      subtle: tintOf(hx(c.blue), 0.87),
      risk: CAC_NEUTRALS.alert,
    },
    // APP look (v64): the system UI face of Windows (what a web app renders there), tabular digits for the figures.
    font: { ...d.font, ui: 'Segoe UI', mono: 'Segoe UI' },
    chartSeries: [hx(c.blue), hx(c.gold), ...states].filter((x, i, a) => a.indexOf(x) === i).slice(0, 10),
  } as Design;
}

// ── Shapes (DrawingML bodies; the caller anchors them) ──────────────────────────────────────────────────────────────
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const xe = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const EMOJI = /\p{Extended_Pictographic}/u;
/** A run of text; an emoji takes the emoji font (Excel falls back to it, LibreOffice uses Noto Color Emoji). */
export function run(text: string, o: { sz: number; color: string; bold?: boolean; italic?: boolean; font: string }): string {
  const face = EMOJI.test(text) && text.length <= 4 ? 'Segoe UI Emoji' : o.font;
  return `<a:r><a:rPr lang="fr-FR" sz="${Math.round(o.sz * 100)}"${o.bold ? ' b="1"' : ''}${o.italic ? ' i="1"' : ''}><a:solidFill><a:srgbClr val="${o.color}"/></a:solidFill><a:latin typeface="${xe(face)}"/><a:sym typeface="Segoe UI Emoji"/></a:rPr><a:t>${xe(text)}</a:t></a:r>`;
}
interface SpOpt {
  id: number;
  name: string;
  prst?: string;
  adj?: string;
  fill?: string | null;
  line?: string | null;
  lineW?: number;
  link?: string;
  tooltip?: string;
  paras?: string[];
  algn?: 'l' | 'ctr' | 'r';
  anchor?: 't' | 'ctr' | 'b';
  ins?: [number, number, number, number];
  wrap?: boolean;
  shadow?: boolean;
  /** Radial gradient [centre, edge] instead of a solid fill (the KPI cards' coloured halo). */
  grad?: [string, string];
}
/** One DrawingML shape (geometry, fill, line, optional hyperlink and paragraphs). */
export function sp(o: SpOpt): string {
  const link = o.link ? `<a:hlinkClick xmlns:r="${REL}" r:id="${o.link}" tooltip="${xe(o.tooltip ?? '')}"/>` : '';
  const fill = o.grad
    ? `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${o.grad[0]}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${o.grad[1]}"/></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>`
    : o.fill
      ? `<a:solidFill><a:srgbClr val="${o.fill}"/></a:solidFill>`
      : '<a:noFill/>';
  const ln = o.line ? `<a:ln w="${o.lineW ?? 9525}"><a:solidFill><a:srgbClr val="${o.line}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>';
  const fx = o.shadow ? '<a:effectLst><a:outerShdw blurRad="38100" dist="12700" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="16000"/></a:srgbClr></a:outerShdw></a:effectLst>' : '';
  const [l, t, r, b] = o.ins ?? [72000, 36000, 72000, 36000];
  const body = o.paras?.length
    ? `<xdr:txBody><a:bodyPr wrap="${o.wrap === false ? 'none' : 'square'}" lIns="${l}" tIns="${t}" rIns="${r}" bIns="${b}" anchor="${o.anchor ?? 'ctr'}"/><a:lstStyle/>${o.paras.map((p) => `<a:p><a:pPr algn="${o.algn ?? 'l'}"/>${p}</a:p>`).join('')}</xdr:txBody>`
    : '';
  return `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${o.id}" name="${xe(o.name)}">${link}</xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="${o.prst ?? 'rect'}"><a:avLst>${o.adj ?? ''}</a:avLst></a:prstGeom>${fill}${ln}${fx}</xdr:spPr>${body}</xdr:sp>`;
}
export { hsl as hslOf, hexOf as hexFromHsl, REL as REL_NS, EMOJI as EMOJI_RX };

// ── Premium button emoji (v64, consigne du 15/10/2026 : « partout où il y a un bouton, un émoji premium de décoration »)
// The emoji of a button / page, from its words: the topic first (assurances 🛡️, impayés 💸, IFRS 9 ⚖️…), then the action
// (ouvrir 📂, voir 🔎). Rendered in the colour emoji font (Segoe UI Emoji in Microsoft 365, Apple / Noto elsewhere).
const BUTTON_EMOJI: [RegExp, string][] = [
  [/accueil|cockpit|home|sommaire/, '🏠'],
  [/assurance/, '🛡️'],
  [/deferral|differ|report[ée]?s?\b|echeanc/, '⏳'],
  [/domicil/, '🏦'],
  [/ifrs|bceao|reglement|prudenti|norme|contentieux|litige/, '⚖️'],
  [/impaye|arriere|retard|recouvr/, '💸'],
  [/provision|depreciation|\becl\b/, '🧮'],
  [/garantie|surete|collateral/, '🔐'],
  [/concentration|exposition|contrepartie/, '🎯'],
  [/top|classement|palmares/, '🏆'],
  [/plan d|action|recommand/, '✅'],
  [/decision|vote/, '🗳️'],
  [/hypothese/, '🧩'],
  [/parametre|reglage/, '⚙️'],
  [/qualite/, '🔍'],
  [/source|reference/, '📚'],
  [/glossaire|lexique/, '📘'],
  [/donnee|base|liste/, '🗂️'],
  [/risque|alerte|attention/, '⚠️'],
  [/synthese|tableau de bord|dashboard|indicateur|kpi|chiffre/, '📊'],
  [/tendance|evolution|croissance/, '📈'],
  [/secteur|industrie/, '🏭'],
  [/client|tiers|beneficiaire/, '👥'],
  [/credit|engagement|pret|portefeuille|encours/, '💼'],
  [/liquidit|tresorerie/, '💧'],
  [/capital|fonds propres|solvabilit/, '🏛️'],
  [/couverture/, '☂️'],
  [/conformit|fraude|audit|controle/, '🕵️'],
  [/methode|analyse/, '🧪'],
  [/precedent/, '⬅️'],
  [/suivant/, '➡️'],
  [/ouvrir/, '📂'],
  [/voir|detail/, '🔎'],
];
const BUTTON_SPARE = ['📁', '📌', '🧾', '💠', '🗃️', '🧭', '📎', '🪙', '🏷️', '📐'];
const foldFr = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/** The premium emoji of a button or page label (`i` picks a distinct spare emoji when no topic matches). */
/** The topic emoji of a label, or null when no topic matches. */
export function topicEmoji(label: string): string | null {
  const t = foldFr(label);
  return BUTTON_EMOJI.find(([re]) => re.test(t))?.[1] ?? null;
}
export function buttonEmoji(label: string, i = 0): string {
  const t = foldFr(label);
  return BUTTON_EMOJI.find(([re]) => re.test(t))?.[1] ?? BUTTON_SPARE[Math.abs(i) % BUTTON_SPARE.length]!;
}

// ── Flat, IBCS-style figures (v64, veille du 15/10/2026 : pas de 3D, barres horizontales pour comparer des catégories,
// camembert seulement ≤ 5 parts, étiquettes sur les données, axe à zéro, une palette, l'élément de tête en accent) ──
/** Ordered categories (periods, brackets « 0-30 j », years) keep their order; free categories are ranked. */
export const ORDERED = /\d|\b(janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec)\b|\bt[1-4]\b|\bs[12]\b|trimestre|semestre|tranche|bucket|\bstage\b/i;
/** Where the doughnut's plot sits in its chart (fractions): its hole's centre is (x + w/2, y + h/2). */
export const DONUT = { x: 0.04, y: 0.17, w: 0.56, h: 0.78 } as const;
/** « 104,9 Mds », « 469 M », « 1 234 » — the short French form of a total. */
export function shortFr(v: number): string {
  const a = Math.abs(v);
  const f = (n: number, d: number) => n.toFixed(d).replace('.', ',');
  return a >= 1e9 ? `${f(v / 1e9, 1)} Mds` : a >= 1e6 ? `${f(v / 1e6, 1)} M` : Math.round(v).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');
}
/** The CAC figure: 3D → flat; pie / doughnut → doughnut only with ≤ 5 parts, else ranked bars; free categories ranked. */
export function flatFigure(f: Figure): Figure {
  const single = f.series.length === 1;
  const ordered = f.categories.some((c) => ORDERED.test(c));
  let kind: Figure['kind'] = f.kind === 'col3d' ? (f.categories.length > 6 || !ordered ? 'bar' : 'col') : f.kind === 'bar3d' ? 'bar' : f.kind;
  if ((kind === 'pie' || kind === 'doughnut') && (!single || f.categories.length > 5)) kind = 'bar';
  else if (kind === 'pie') kind = 'doughnut';
  if (kind !== 'bar' || !single || ordered) return { ...f, kind };
  const idx = f.categories.map((_, i) => i).sort((a, b) => (f.series[0]!.values[b] ?? 0) - (f.series[0]!.values[a] ?? 0));
  return { ...f, kind, categories: idx.map((i) => f.categories[i]!), series: f.series.map((s) => ({ ...s, values: idx.map((i) => s.values[i] ?? 0) })) };
}
/**
 * A native chart XML made flat: 3D bars → bars (no box shape, no depth axis), 3D pie → doughnut with thin white
 * separators, gradients → their base colour, no 3D view nor walls; a single-series bar chart gets ONE accent (the leader)
 * and the primary for the rest — the eye goes to the first category (the committee format kept its 3D on request).
 */
export function flatChart(xml: string, o: { primary: string; accent: string }): string {
  let x = xml
    .replace(/<c:view3D>[\s\S]*?<\/c:view3D>/g, '')
    .replace(/<c:(floor|sideWall|backWall)>[\s\S]*?<\/c:\1>/g, '')
    .replace(/<a:gradFill\b[\s\S]*?<\/a:gradFill>/g, (g) => {
      const base = /<a:gs pos="55000"><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(g)?.[1] ?? /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(g)?.[1] ?? o.primary;
      return `<a:solidFill><a:srgbClr val="${base}"/></a:solidFill>`;
    });
  if (/<c:bar3DChart>/.test(x)) {
    const sers = (x.match(/<c:ser>/g) ?? []).length;
    x = x
      .replace('<c:bar3DChart>', '<c:barChart>')
      .replace('</c:bar3DChart>', '</c:barChart>')
      .replace(/<c:shape val="box"\/>/g, '')
      .replace(/<c:axId val="0"\/>/g, '')
      .replace(/<c:gapWidth val="\d+"\/>/, `<c:gapWidth val="${sers > 1 ? 70 : 45}"/>`);
    // The accent marks the LEADER of a ranking only; ordered categories (periods, brackets) stay in one colour.
    const cats = [...(/<c:cat>[\s\S]*?<\/c:cat>/.exec(x)?.[0] ?? '').matchAll(/<c:v>([^<]*)<\/c:v>/g)].map((m) => m[1]!);
    if (sers === 1 && cats.some((c) => ORDERED.test(c))) x = x.replace(/<c:dPt>[\s\S]*?<\/c:dPt>/g, '');
    else if (sers === 1) {
      const fillOf = (c: string) => `<c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>`;
      x = x
        .replace(/<c:dPt>[\s\S]*?<\/c:dPt>/g, '')
        .replace(/(<c:ser><c:idx val="0"\/>[\s\S]*?<\/c:tx>)<c:spPr>[\s\S]*?<\/c:spPr>(<c:invertIfNegative val="0"\/>)/, `$1${fillOf(o.primary)}$2<c:dPt><c:idx val="0"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/>${fillOf(o.accent)}</c:dPt>`);
    }
  }
  if (/<c:pie3DChart>/.test(x))
    x = x
      // A fixed plot area (left 56 %) so the hole's centre is known: the total is written in it (dossierXlsx).
      .replace('<c:plotArea><c:layout/>', `<c:plotArea><c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="${DONUT.x}"/><c:y val="${DONUT.y}"/><c:w val="${DONUT.w}"/><c:h val="${DONUT.h}"/></c:manualLayout></c:layout>`)
      .replace(/<c:pie3DChart>([\s\S]*?)<\/c:pie3DChart>/, '<c:doughnutChart>$1<c:firstSliceAng val="0"/><c:holeSize val="62"/></c:doughnutChart>')
      .replace(/(<c:dPt><c:idx val="\d+"\/><c:bubble3D val="0"\/><c:spPr><a:solidFill><a:srgbClr val="[0-9A-Fa-f]{6}"\/><\/a:solidFill>)<a:ln w="9525"><a:solidFill><a:srgbClr val="[0-9A-Fa-f]{6}"\/><\/a:solidFill><\/a:ln>/g, '$1<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>');
  return x;
}
