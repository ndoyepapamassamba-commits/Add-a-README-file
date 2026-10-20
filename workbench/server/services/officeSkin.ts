/**
 * THE CHOSEN IMAGE'S DESIGN ON EVERY PAGE of every export — not only a first page:
 *  - Word: a band in the image's dark colour with an accent rule at the top of EVERY page (section headers),
 *    headings and body in the image's colours and font, table header rows tinted with its primary colour;
 *  - PowerPoint: on EVERY slide the image's page colour as background, a dark top strip with an accent rule, a
 *    footer strip, slide titles in the image's dark colour and font;
 *  - HTML (and the PDF printed from it): page colour, font, headings, tables, links and a top band.
 * Idempotent (a marker is left), schema order respected (Word / PowerPoint are strict). Pure (zip / text in → out).
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { orderPPr } from './officeCore';
import { ooxml } from './officeLogo';

const { addOverride, addRel, relsOf, ensureRootNs, NS_R } = ooxml;
type Zip = Record<string, Uint8Array>;
const rd = (z: Zip, p: string) => (z[p] ? strFromU8(z[p]!) : '');
const wr = (z: Zip, p: string, s: string) => {
  z[p] = strToU8(s);
};
export interface Skin {
  dark: string;
  primary: string;
  accent: string;
  /** Page / slide background (light). */
  page?: string;
  font: string;
  /**
   * Page layout of a catalogue model. Word / HTML: band (default), sidebar, boxed, editorial, minimal.
   * PowerPoint: strips (default), sidebar, night, corner, minimal.
   */
  layout?: string;
}
const hx = (c: string) => c.replace('#', '').slice(0, 6).toUpperCase();
const lum = (c: string) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hx(c).slice(i, i + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const onColour = (c: string) => (lum(c) < 0.55 ? 'FFFFFF' : '0F172A');
const mix = (a: string, b: string, t: number) => {
  const A = [0, 2, 4].map((i) => parseInt(hx(a).slice(i, i + 2), 16));
  const B = [0, 2, 4].map((i) => parseInt(hx(b).slice(i, i + 2), 16));
  return A.map((x, i) => Math.round(x + (B[i]! - x) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
};
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
const font = (s: Skin) => s.font.replace(/[<>"&]/g, '').slice(0, 31) || 'Segoe UI';
const MARK = '_massamba_design';

// ── Word ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function skinDocx(bytes: Uint8Array, s: Skin): Uint8Array | null {
  let z: Zip;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  const docPart = 'word/document.xml';
  let doc = rd(z, docPart);
  if (!doc || doc.includes(MARK) || Object.keys(z).some((k) => /^word\/header[^/]*\.xml$/.test(k) && rd(z, k).includes(MARK))) return null;
  const f = font(s);
  // 1. styles: body font, headings / title in the image's colours.
  let st = rd(z, 'word/styles.xml');
  if (st) {
    const rFonts = `<w:rFonts w:ascii="${esc(f)}" w:hAnsi="${esc(f)}" w:cs="${esc(f)}"/>`;
    st = /<w:rPrDefault>\s*<w:rPr>/.test(st)
      ? st.replace(/(<w:rPrDefault>\s*<w:rPr>)([\s\S]*?)(<\/w:rPr>)/, (_m, a: string, b: string, c: string) => `${a}${rFonts}${b.replace(/<w:rFonts\b[^>]*\/>/, '')}${c}`)
      : st.replace(/<w:docDefaults>/, `<w:docDefaults><w:rPrDefault><w:rPr>${rFonts}</w:rPr></w:rPrDefault>`);
    const lay = s.layout ?? 'band';
    const boxed = (id: string) => lay === 'boxed' && /^(Heading[12]|Titre[12])$/i.test(id);
    const colourOf = (id: string) => (boxed(id) ? onColour(s.primary) : /^(Title|Titre|Heading1|Titre1)$/i.test(id) ? hx(s.dark) : hx(s.primary));
    st = st.replace(/<w:style\b([^>]*w:styleId="(Title|Titre|Heading[1-4]|Titre[1-4])"[^>]*)>([\s\S]*?)<\/w:style>/g, (_m, a: string, id: string, body: string) => {
      const color = `<w:color w:val="${colourOf(id)}"/>`;
      let b = body.replace(/<w:color\b[^>]*\/>/g, '');
      // The layout's paragraph look: filled cartouche, editorial rule / centred title, or a thin accent rule.
      const kids = boxed(id)
        ? `<w:shd w:val="clear" w:color="auto" w:fill="${hx(s.primary)}"/><w:ind w:left="0"/>`
        : lay === 'editorial' && /^(Title|Titre)$/i.test(id)
          ? '<w:jc w:val="center"/>'
          : lay === 'editorial' && /^(Heading1|Titre1)$/i.test(id)
            ? `<w:pBdr><w:bottom w:val="double" w:sz="6" w:space="2" w:color="${hx(s.dark)}"/></w:pBdr>`
            : lay === 'minimal' && /^(Heading1|Titre1)$/i.test(id)
              ? `<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="2" w:color="${hx(s.accent)}"/></w:pBdr>`
              : '';
      if (kids) b = addStylePPr(b, kids);
      b = /<w:rPr>/.test(b) ? b.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/, (_q, r: string) => `<w:rPr>${placeColor(r.replace(/<w:rFonts\b[^>]*\/>/, ''), color, rFonts)}</w:rPr>`) : `${b}<w:rPr>${rFonts}${color}</w:rPr>`;
      return `<w:style${a}>${b}</w:style>`;
    });
    wr(z, 'word/styles.xml', st);
  }
  // 2. table header rows tinted with the primary colour (light, so their text stays readable).
  const tint = mix(s.primary, 'FFFFFF', 0.78);
  doc = doc.replace(/<w:tbl>([\s\S]*?)<\/w:tbl>/g, (tbl) =>
    tbl.replace(/<w:tr\b[\s\S]*?<\/w:tr>/, (tr) => {
      // White header text keeps a full primary fill; dark text gets a light tint (always readable).
      const fillC = /<w:color w:val="(FFFFFF|ffffff)"/.test(tr) && lum(s.primary) < 0.6 ? hx(s.primary) : tint;
      return tr.replace(/<w:tc>(?:\s*<w:tcPr>([\s\S]*?)<\/w:tcPr>)?/g, (_m, pr?: string) => {
        const shd = `<w:shd w:val="clear" w:color="auto" w:fill="${fillC}"/>`;
        const p = (pr ?? '').replace(/<w:shd\b[^>]*\/>/g, '');
        const after = /<w:(noWrap|tcMar|textDirection|tcFitText|vAlign|hideMark)\b/.exec(p);
        const np = after ? p.slice(0, after.index) + shd + p.slice(after.index) : p + shd;
        return `<w:tc><w:tcPr>${np}</w:tcPr>`;
      });
    }),
  );
  // 3. the band at the top of EVERY page: in each section's default header (ours, or prepended to the existing one).
  const firstText = /<w:t(?:\s[^>]*)?>([^<]{3,120})<\/w:t>/.exec(doc)?.[1] ?? '';
  const lay = s.layout ?? 'band';
  const filled = lay === 'band' || lay === 'boxed';
  const bandFill = lay === 'boxed' ? hx(s.primary) : hx(s.dark);
  const bandPPr = filled
    ? `<w:pBdr><w:bottom w:val="single" w:sz="18" w:space="4" w:color="${hx(s.accent)}"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="${bandFill}"/><w:spacing w:after="160"/>`
    : lay === 'editorial'
      ? `<w:pBdr><w:bottom w:val="double" w:sz="6" w:space="4" w:color="${hx(s.dark)}"/></w:pBdr><w:spacing w:after="160"/><w:jc w:val="center"/>`
      : `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${hx(s.accent)}"/></w:pBdr><w:spacing w:after="160"/>`;
  const bandText = filled ? onColour(bandFill) : hx(s.dark);
  const band = `<w:p><w:pPr>${bandPPr}</w:pPr><w:bookmarkStart w:id="98710" w:name="${MARK}"/><w:bookmarkEnd w:id="98710"/><w:r><w:rPr><w:rFonts w:ascii="${esc(f)}" w:hAnsi="${esc(f)}" w:cs="${esc(f)}"/><w:b/>${lay === 'editorial' ? '<w:caps/>' : ''}<w:color w:val="${bandText}"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">  ${esc(firstText.slice(0, 90))}</w:t></w:r></w:p>`;
  // Sidebar layout: a coloured rule down the left of EVERY page (page border of each section).
  const pgBorders = lay === 'sidebar' ? `<w:pgBorders w:offsetFrom="page"><w:left w:val="single" w:sz="48" w:space="0" w:color="${hx(s.dark)}"/></w:pgBorders>` : '';
  const withBorders = (body: string) => {
    if (!pgBorders || /<w:pgBorders\b/.test(body)) return body;
    const at = /<w:(lnNumType|pgNumType|cols|formProt|vAlign|noEndnote|titlePg|textDirection|bidi|rtlGutter|docGrid|printerSettings|sectPrChange)\b/.exec(body);
    return at ? body.slice(0, at.index) + pgBorders + body.slice(at.index) : body + pgBorders;
  };
  const rels = rd(z, relsOf(docPart));
  const headerOf = (rid: string) => {
    const t = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*/>`).exec(rels)?.[0];
    const target = t ? /Target="([^"]+)"/.exec(t)?.[1] : undefined;
    return target ? (target.startsWith('/') ? target.slice(1) : `word/${target}`) : null;
  };
  let ourHeader: string | null = null;
  doc = ensureRootNs(doc, 'r', NS_R);
  doc = doc.replace(/<w:sectPr\b([^>]*)>([\s\S]*?)<\/w:sectPr>/g, (_m, a: string, body: string) => {
    const ref = /<w:headerReference\b[^>]*w:type="default"[^>]*r:id="([^"]+)"[^>]*\/>|<w:headerReference\b[^>]*r:id="([^"]+)"[^>]*w:type="default"[^>]*\/>/.exec(body);
    const part = ref ? headerOf(ref[1] ?? ref[2]!) : null;
    if (part && z[part]) {
      const h = rd(z, part);
      if (!h.includes(MARK)) wr(z, part, h.replace(/(<w:hdr\b[^>]*>)/, `$1${band}`));
      return `<w:sectPr${a}>${withBorders(body)}</w:sectPr>`;
    }
    if (!ourHeader) {
      ourHeader = 'word/header-massamba-design.xml';
      wr(z, ourHeader, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${NS_R}">${band}</w:hdr>`);
      addOverride(z, `/${ourHeader}`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml');
    }
    const rid = addRel(z, relsOf(docPart), `${NS_R}/header`, 'header-massamba-design.xml', 'rIdDesignHeader');
    // headerReference must be the first children of sectPr.
    return `<w:sectPr${a}><w:headerReference w:type="default" r:id="${rid}"/>${withBorders(body)}</w:sectPr>`;
  });
  if (!/<w:sectPr\b/.test(doc)) return null;
  wr(z, docPart, doc);
  return zipSync(z, { level: 6 });
}
/** Adds paragraph properties to a style (pPr before rPr; children in schema order). */
function addStylePPr(body: string, kids: string): string {
  // A child the layout sets replaces the style's own (one pBdr, one shd… per pPr).
  const tags = [...kids.matchAll(/<w:(\w+)\b/g)].map((m) => m[1]!).filter((t, i, all) => all.indexOf(t) === i && !['top', 'left', 'bottom', 'right', 'between', 'bar'].includes(t));
  const strip = (inner: string) => tags.reduce((x, t) => x.replace(new RegExp(`<w:${t}\\b[^>]*\\/>|<w:${t}\\b[^>]*>[\\s\\S]*?<\\/w:${t}>`, 'g'), ''), inner);
  if (/<w:pPr>/.test(body)) return orderPPr(body.replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/, (_m, inner: string) => `<w:pPr>${strip(inner)}${kids}</w:pPr>`));
  if (/<w:pPr\/>/.test(body)) return orderPPr(body.replace(/<w:pPr\/>/, `<w:pPr>${kids}</w:pPr>`));
  const at = /<w:(rPr|tblPr|trPr|tcPr|tblStylePr)\b/.exec(body);
  const ppr = orderPPr(`<w:pPr>${kids}</w:pPr>`);
  return at ? body.slice(0, at.index) + ppr + body.slice(at.index) : body + ppr;
}
/** w:color placed in schema order inside a run-properties body (after b/i/caps…, before sz/u/…). */
function placeColor(r: string, color: string, rFonts: string): string {
  const before = /<w:(spacing|w|kern|position|sz|szCs|highlight|u|effect|bdr|shd|fitText|vertAlign|rtl|cs|em|lang|eastAsianLayout|specVanish|oMath)\b/.exec(r);
  const withColor = before ? r.slice(0, before.index) + color + r.slice(before.index) : r + color;
  // rFonts goes after rStyle (first child otherwise).
  return /<w:rStyle\b[^>]*\/>/.test(withColor) ? withColor.replace(/(<w:rStyle\b[^>]*\/>)/, `$1${rFonts}`) : rFonts + withColor;
}

// ── PowerPoint ───────────────────────────────────────────────────────────────────────────────────────────────────────
export function skinPptx(bytes: Uint8Array, s: Skin): Uint8Array | null {
  let z: Zip;
  try {
    z = unzipSync(bytes);
  } catch {
    return null;
  }
  const pres = rd(z, 'ppt/presentation.xml');
  const sz = /<p:sldSz\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(pres);
  if (!sz) return null;
  const W = +sz[1]!;
  const H = +sz[2]!;
  const slides = Object.keys(z).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
  const f = font(s);
  let n = 0;
  let id = 9700;
  const shape = (name: string, x: number, y: number, w: number, h: number, colour: string, geom = 'rect', flip = '') =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${++id}" name="${name}"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr><a:xfrm${flip}><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.max(1, Math.round(w))}" cy="${Math.max(1, Math.round(h))}"/></a:xfrm><a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${colour}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="fr-FR"/></a:p></p:txBody></p:sp>`;
  const rect = (name: string, y: number, h: number, colour: string) => shape(name, 0, y, W, h, colour);
  const lay = s.layout ?? 'strips';
  const night = lay === 'night';
  const titleColour = night ? onColour(s.dark) : hx(s.dark);
  for (const k of slides) {
    let x = rd(z, k);
    if (x.includes(MARK)) continue;
    // Background in the image's page colour.
    if (s.page || night) {
      const bg = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${night ? hx(s.dark) : hx(s.page!)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
      x = /<p:bg>[\s\S]*?<\/p:bg>/.test(x) ? x.replace(/<p:bg>[\s\S]*?<\/p:bg>/, bg) : x.replace(/<p:cSld\b([^>]*)>/, `<p:cSld$1>${bg}`);
    }
    // Strips behind the content: dark top strip + accent rule, footer strip.
    const strips =
      lay === 'sidebar'
        ? `${shape(`Barre design ${MARK}`, 0, 0, W * 0.035, H, hx(s.dark))}${shape('Filet design', W * 0.035, 0, W * 0.004, H, hx(s.accent))}`
        : lay === 'night'
          ? `${rect(`Filet design ${MARK}`, H * 0.992, H * 0.008, hx(s.accent))}`
          : lay === 'corner'
            ? `${shape(`Angle design ${MARK}`, W * 0.86, 0, W * 0.14, W * 0.14, hx(s.accent), 'rtTriangle', ' flipH="1" flipV="1"')}${shape('Angle design 2', W * 0.92, 0, W * 0.08, W * 0.08, hx(s.primary), 'rtTriangle', ' flipH="1" flipV="1"')}${rect('Pied design', H * 0.975, H * 0.025, hx(s.dark))}`
            : lay === 'minimal'
              ? `${rect(`Filet design ${MARK}`, 0, H * 0.008, hx(s.accent))}`
              : `${rect(`Bande design ${MARK}`, 0, H * 0.022, hx(s.dark))}${rect('Filet design', H * 0.022, H * 0.006, hx(s.accent))}${rect('Pied design', H * 0.965, H * 0.035, hx(s.primary))}`;
    x = x.replace(/(<p:spTree>\s*<p:nvGrpSpPr>[\s\S]*?<\/p:nvGrpSpPr>\s*<p:grpSpPr\b[^>]*?(?:\/>|>[\s\S]*?<\/p:grpSpPr>))/, `$1${strips}`);
    // Slide titles in the image's dark colour and font.
    x = x.replace(/<p:sp>([\s\S]*?)<\/p:sp>/g, (sp, inner: string) => {
      if (!/<p:ph\b[^>]*type="(title|ctrTitle)"/.test(inner)) return sp;
      return sp.replace(/<a:rPr\b([^>]*?)(\/>|>([\s\S]*?)<\/a:rPr>)/g, (_m, a: string, _end: string, body?: string) => {
        let b = (body ?? '').replace(/<a:(solidFill|gradFill|noFill|pattFill)\b[\s\S]*?(?:\/>|<\/a:\1>)/, '');
        const fill = `<a:solidFill><a:srgbClr val="${titleColour}"/></a:solidFill>`;
        b = /<a:ln\b[\s\S]*?(?:\/>|<\/a:ln>)/.test(b) ? b.replace(/(<a:ln\b[\s\S]*?(?:\/>|<\/a:ln>))/, `$1${fill}`) : fill + b;
        if (!/<a:latin\b/.test(b)) {
          const after = /<a:(ea|cs|sym|hlinkClick|hlinkMouseOver|rtl|extLst)\b/.exec(b);
          const latin = `<a:latin typeface="${esc(f)}"/>`;
          b = after ? b.slice(0, after.index) + latin + b.slice(after.index) : b + latin;
        }
        return `<a:rPr${a}>${b}</a:rPr>`;
      });
    });
    // Dark mode: body text without its own colour (inherited dark) turns light, except on shapes with their own fill.
    if (night) x = x.replace(/<p:sp>([\s\S]*?)<\/p:sp>/g, (sp, inner: string) => (/<p:ph\b[^>]*type="(title|ctrTitle)"/.test(inner) || /<p:spPr>[\s\S]*?<a:solidFill>[\s\S]*?<\/p:spPr>/.test(inner) ? sp : lightRuns(sp, onColour(s.dark))));
    wr(z, k, x);
    n++;
  }
  return n ? zipSync(z, { level: 6 }) : null;
}

/** Runs without a fill get the given colour (fill first in a:rPr, after a:ln). */
function lightRuns(sp: string, colour: string): string {
  const fill = `<a:solidFill><a:srgbClr val="${colour}"/></a:solidFill>`;
  return sp
    .replace(/<a:r><a:t>/g, `<a:r><a:rPr lang="fr-FR">${fill}</a:rPr><a:t>`)
    .replace(/<a:rPr\b([^>]*)\/>/g, `<a:rPr$1>${fill}</a:rPr>`)
    .replace(/<a:rPr\b([^>]*)>([\s\S]*?)<\/a:rPr>/g, (m, a: string, b: string) => {
      if (/<a:(solidFill|gradFill|noFill|pattFill)\b/.test(b)) return m;
      return /<a:ln\b/.test(b) ? `<a:rPr${a}>${b.replace(/(<a:ln\b[\s\S]*?(?:\/>|<\/a:ln>))/, `$1${fill}`)}</a:rPr>` : `<a:rPr${a}>${fill}${b}</a:rPr>`;
    });
}

// ── HTML / PDF ───────────────────────────────────────────────────────────────────────────────────────────────────────
export function skinHtml(html: string, s: Skin): string {
  if (/data-design-skin/.test(html)) return html;
  const f = font(s);
  const css = `<style data-design-skin>
:root{--design-dark:#${hx(s.dark)};--design-primary:#${hx(s.primary)};--design-accent:#${hx(s.accent)};--design-page:#${hx(s.page ?? 'FFFFFF')}}
body{background:var(--design-page)!important;font-family:"${f}",Segoe UI,Arial,sans-serif!important;border-top:10px solid var(--design-dark);box-shadow:inset 0 4px 0 var(--design-accent)}
h1,h2,h3,h4{color:var(--design-dark)!important;font-family:"${f}",Segoe UI,Arial,sans-serif!important}
h1{border-bottom:3px solid var(--design-accent);padding-bottom:6px}
h2{border-left:5px solid var(--design-primary);padding-left:8px}
a{color:var(--design-primary)}
table{border-collapse:collapse}
th{background:var(--design-primary)!important;color:#${onColour(s.primary)}!important}
tr:nth-child(even) td{background:#${mix(s.primary, 'FFFFFF', 0.92)}}
td,th{border-color:#${mix(s.primary, 'FFFFFF', 0.7)}!important}
${HTML_LAYOUT[s.layout ?? 'band'] ?? ''}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>`;
  const head = /<head[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + css + html.slice(head.index + head[0].length);
  return css + html;
}

/** Page layouts of the catalogue models for HTML / PDF (added after the base skin). */
const HTML_LAYOUT: Record<string, string> = {
  band: '',
  sidebar: 'body{border-top:0;box-shadow:none;border-left:14px solid var(--design-dark);padding-left:28px}h1{border-bottom-color:var(--design-accent)}',
  boxed: 'h2{background:var(--design-primary);color:#fff!important;border-left:0;padding:6px 12px;border-radius:6px}',
  editorial: 'body{border-top:0;box-shadow:none}h1{text-align:center;border-bottom:0;border-top:1px solid var(--design-dark);border-bottom:3px double var(--design-dark);padding:10px 0;letter-spacing:.04em}h2{border-left:0;padding-left:0;font-variant:small-caps}',
  minimal: 'body{border-top:3px solid var(--design-accent);box-shadow:none}h1{border-bottom:1px solid var(--design-accent)}h2{border-left:0;padding-left:0}',
};
