// PowerPoint export in the locked house design (houseDesign.ts): navy title slide with a gold filet, navy header band
// + gold filet on every content slide, blue table headers, ice footer, Segoe UI / Consolas. Built from Markdown
// (# / ## = a slide; bullets, numbered lists, tables and paragraphs fill it). No colour or font parameter exists;
// the premium extras (PptxExtras) only add slides and the logo, in the same design.
import { strToU8, zipSync } from 'fflate';
import { activeDesign, liveColorProxy, type Design } from './houseDesign';
import { fmtDateFr } from './houseStyle';
import { CHART_CT, CHART_REL, literalChartXml, pptxChartFrame } from './officeChart';
import { fmtFact, type Brief } from './reportBrief';

export interface PptxLogo {
  png: Uint8Array;
  width: number;
  height: number;
}
/**
 * PREMIUM deck (report.export): sub-title, agenda, « L'essentiel en chiffres » (KPI cards), native charts from the
 * brief, a section slide per chapter, speaker notes, the user's logo on a white plate. Nothing invented: the cards,
 * charts and readings carry the brief's figures only.
 */
export interface PptxExtras {
  premium?: boolean;
  subtitle?: string;
  brief?: Brief | null;
  logo?: PptxLogo | null;
}

const C = liveColorProxy((c) => c) as Design['color'];
const EMU = 914400;
const W = 12192000;
const H = 6858000;
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inch = (x: number) => Math.round(x * EMU);

type Block =
  { k: 'p'; text: string } | { k: 'li'; text: string } | { k: 'table'; head: string[]; rows: string[][] };
export interface Slide {
  title: string;
  blocks: Block[];
  /** Heading level that opened the slide (1 = chapter → a section slide in premium decks). */
  level?: number;
}

const clean = (s: string) =>
  s
    .replace(/\*\*|__|`/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();

/** Markdown → slides: every # or ## heading opens a slide; long slides continue on the next one. */
export function slidesFromMarkdown(md: string): { title: string; slides: Slide[] } {
  const lines = md.replace(/\r/g, '').split('\n');
  const slides: Slide[] = [];
  const st: { cur: Slide | null } = { cur: null };
  let deckTitle = '';
  const open = (t: string, level = 2) => {
    st.cur = { title: clean(t), blocks: [], level };
    slides.push(st.cur);
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const h = /^(#{1,3})\s+(.*)$/.exec(l);
    if (h) {
      if (h[1]!.length === 1 && !deckTitle) {
        deckTitle = clean(h[2]!);
        continue;
      }
      if (h[1]!.length <= 2 || !st.cur) open(h[2]!, h[1]!.length);
      else st.cur.blocks.push({ k: 'p', text: clean(h[2]!) });
      continue;
    }
    if (!l.trim() || /^```/.test(l)) continue;
    if (!st.cur) open(deckTitle || 'Synthèse');
    const c = st.cur!;
    if (/^\s*\|/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const cells = (r: string) =>
        r
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((x) => clean(x));
      const head = cells(l);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) rows.push(cells(lines[i++]!));
      i--;
      c.blocks.push({ k: 'table', head, rows });
    } else if (/^\s*([-*+]|\d+[.)])\s+/.test(l))
      c.blocks.push({ k: 'li', text: clean(l.replace(/^\s*([-*+]|\d+[.)])\s+/, '')) });
    else c.blocks.push({ k: 'p', text: clean(l.replace(/^\s*>\s?/, '')) });
  }
  // Continuation: at most 9 bullet / paragraph lines or 9 table rows per slide.
  const out: Slide[] = [];
  for (const s of slides) {
    let part: Slide = { title: s.title, blocks: [], level: s.level };
    let used = 0;
    const flush = () => {
      if (part.blocks.length) out.push(part);
      part = { title: `${s.title} (suite)`, blocks: [], level: 2 };
      used = 0;
    };
    for (const b of s.blocks) {
      if (b.k === 'table') {
        for (let r = 0; r < Math.max(1, b.rows.length); r += 8) {
          if (used > 0) flush();
          part.blocks.push({ k: 'table', head: b.head, rows: b.rows.slice(r, r + 8) });
          used = 9;
        }
      } else {
        if (used >= 9) flush();
        part.blocks.push(b);
        used++;
      }
    }
    if (part.blocks.length || !s.blocks.length) out.push(part);
  }
  return { title: deckTitle || out[0]?.title || 'Présentation', slides: out };
}

const fill = (rgb: string) => `<a:solidFill><a:srgbClr val="${rgb}"/></a:solidFill>`;
const run = (t: string, o: { sz: number; color: string; b?: boolean; font?: string }) =>
  `<a:r><a:rPr lang="fr-FR" sz="${Math.round(o.sz * 100)}" b="${o.b ? 1 : 0}" dirty="0">${fill(o.color)}<a:latin typeface="${o.font ?? activeDesign().font.ui}"/><a:cs typeface="${o.font ?? activeDesign().font.ui}"/></a:rPr><a:t>${esc(t)}</a:t></a:r>`;
let nid = 1;
const rect = (x: number, y: number, w: number, h: number, rgb: string, name: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${++nid}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill(rgb)}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="fr-FR"/></a:p></p:txBody></p:sp>`;
const text = (x: number, y: number, w: number, h: number, paras: string[], name: string, anchor = 't') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${++nid}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="91440" rIns="91440" tIns="45720" bIns="45720" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras.join('')}</p:txBody></p:sp>`;
const para = (runs: string, o: { bullet?: boolean; algn?: string; spc?: number } = {}) =>
  `<a:p><a:pPr algn="${o.algn ?? 'l'}"${o.bullet ? ' marL="285750" indent="-285750"' : ''}><a:spcBef><a:spcPts val="${o.spc ?? 400}"/></a:spcBef>${o.bullet ? `<a:buClr><a:srgbClr val="${C.gold}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="■"/>` : '<a:buNone/>'}</a:pPr>${runs}</a:p>`;

function table(x: number, y: number, w: number, head: string[], rows: string[][]): string {
  const n = Math.max(1, head.length);
  const cw = Math.floor(w / n);
  const rh = inch(0.42);
  const cell = (t: string, header: boolean, numeric: boolean) =>
    `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="${header ? 'ctr' : numeric ? 'r' : 'l'}"/>${run(t, { sz: header ? 12 : 11, color: header ? C.white : C.text, b: header, font: !header && numeric ? activeDesign().font.mono : activeDesign().font.ui })}</a:p></a:txBody><a:tcPr marL="72000" marR="72000" marT="36000" marB="36000" anchor="ctr"><a:lnL w="9525">${fill(C.line)}</a:lnL><a:lnR w="9525">${fill(C.line)}</a:lnR><a:lnT w="9525">${fill(C.line)}</a:lnT><a:lnB w="9525">${fill(C.line)}</a:lnB>${fill(header ? C.blue : C.white)}</a:tcPr></a:tc>`;
  const isNum = (s: string) => /^-?[\d\s.,]+%?$/.test(s.trim()) && /\d/.test(s);
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${++nid}" name="Tableau"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cw * n}" cy="${rh * (rows.length + 1)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${head.map(() => `<a:gridCol w="${cw}"/>`).join('')}</a:tblGrid><a:tr h="${rh}">${head.map((t) => cell(t, true, false)).join('')}</a:tr>${rows.map((r) => `<a:tr h="${rh}">${head.map((_, i) => cell(r[i] ?? '', false, isNum(r[i] ?? ''))).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

const sld = (shapes: string, bg: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr>${fill(bg)}<a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

const SHADOW = () =>
  `<a:effectLst><a:outerShdw blurRad="63500" dist="25400" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="${C.navy}"><a:alpha val="16000"/></a:srgbClr></a:outerShdw></a:effectLst>`;
/** Rounded card (white by default) with a soft shadow. */
const card = (x: number, y: number, w: number, h: number, rgb: string, name: string, shadow = true) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${++nid}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 9000"/></a:avLst></a:prstGeom>${fill(rgb)}<a:ln><a:noFill/></a:ln>${shadow ? SHADOW() : ''}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="fr-FR"/></a:p></p:txBody></p:sp>`;
const LOGO_RID = 'rIdLogo';
/** The user's logo (height h) with its right edge at xRight; on a white plate when it sits on a dark field. */
function logoShape(logo: PptxLogo, xRight: number, y: number, h: number, plate: boolean): string {
  const cx = Math.round((h * logo.width) / Math.max(1, logo.height));
  const x = xRight - cx;
  const pad = inch(0.08);
  return (
    (plate ? card(x - pad, y - pad, cx + 2 * pad, h + 2 * pad, C.white, 'Plaque logo') : '') +
    `<p:pic><p:nvPicPr><p:cNvPr id="${++nid}" name="Logo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${LOGO_RID}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}
const pct = (x: number) => `${Math.round(x * 100)} %`;
const fmtN = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('fr-FR') : v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }));

interface Part {
  xml: string;
  /** Chart part (chartSpace XML) referenced by the slide as rIdChart. */
  chart?: string;
  /** Speaker notes (premium). */
  notes?: string;
  logo?: boolean;
}

export function housePptx(md: string, titleOverride?: string, extras: PptxExtras = {}): Uint8Array {
  const { title: deck, slides } = slidesFromMarkdown(md);
  const title = titleOverride || deck;
  const date = fmtDateFr();
  const premium = Boolean(extras.premium);
  const brief = premium ? (extras.brief ?? null) : null;
  const logo = premium && extras.logo && extras.logo.png.length ? extras.logo : null;
  const subtitle = extras.subtitle || (brief ? `${brief.rows.toLocaleString('fr-FR')} lignes analysées · ${brief.source}` : '');
  const parts: Part[] = [];
  const footer = (pageNo: number) =>
    rect(0, H - inch(0.4), W, inch(0.4), C.ice, 'Pied') +
    text(inch(0.5), H - inch(0.4), W - inch(2), inch(0.4), [para(run(`${title} · ${date}`, { sz: 10, color: C.text2 }))], 'Source', 'ctr') +
    text(W - inch(1.5), H - inch(0.4), inch(1.0), inch(0.4), [para(run(String(pageNo), { sz: 10, color: C.blue, b: true, font: activeDesign().font.mono }), { algn: 'r' })], 'Numéro', 'ctr');
  /** Content slide frame: navy band + gold filet + title (+ logo on a plate), the body, the footer. */
  const frame = (titleText: string, body: string) => {
    const pageNo = parts.length + 1;
    const shapes =
      rect(0, 0, W, inch(1.0), C.navy, 'Bandeau') +
      rect(0, inch(1.0), W, Math.round(0.04 * EMU), C.gold, 'Filet') +
      text(inch(0.5), inch(0.1), W - inch(1.0) - (logo ? inch(1.9) : 0), inch(0.8), [para(run(titleText, { sz: 26, color: C.white, b: true }))], 'Titre', 'ctr') +
      body +
      footer(pageNo) +
      (logo ? logoShape(logo, W - inch(0.45), inch(0.22), inch(0.56), true) : '');
    return sld(shapes, C.white);
  };
  // Title slide: navy field, gold filet, white title, sub-title, date line; the logo top-right on a white plate.
  nid = 1;
  parts.push({
    logo: Boolean(logo),
    notes: premium ? [title, subtitle, `Édité le ${date}`].filter(Boolean).join('\n') : undefined,
    xml: sld(
      rect(0, 0, W, H, C.navy, 'Fond') +
        rect(inch(0.7), inch(3.55), inch(4.2), Math.round(0.03 * EMU), C.gold, 'Filet') +
        text(inch(0.6), inch(1.9), W - inch(1.2), inch(1.6), [para(run(title, { sz: 40, color: C.white, b: true }))], 'Titre', 'b') +
        text(inch(0.6), inch(3.7), W - inch(1.2), inch(0.8), [para(run(subtitle ? `${subtitle}` : `Édité le ${date}`, { sz: 16, color: C.subtle }))], 'Sous-titre') +
        (subtitle ? text(inch(0.6), inch(4.3), W - inch(1.2), inch(0.5), [para(run(`Édité le ${date}`, { sz: 12, color: C.subtle }))], 'Date') : '') +
        rect(0, H - inch(0.5), W, inch(0.5), C.blue, 'Pied') +
        text(inch(0.5), H - inch(0.5), inch(6), inch(0.5), [para(run('MASSAMBA Workbench', { sz: 10, color: C.white, b: true }))], 'Marque', 'ctr') +
        (logo ? logoShape(logo, W - inch(0.6), inch(0.5), inch(0.9), true) : ''),
      C.navy,
    ),
  });
  const bodyText = (s: Slide) => s.blocks.map((b) => (b.k === 'table' ? `${b.head.join(' | ')}\n${b.rows.map((r) => r.join(' | ')).join('\n')}` : b.k === 'li' ? `• ${b.text}` : b.text)).join('\n');
  // Agenda (premium, 3 slides or more): numbered chapters, two columns beyond six.
  const agenda = [...new Set(slides.map((s) => s.title.replace(/ \(suite\)$/, '')))].slice(0, 12);
  if (premium && agenda.length >= 3) {
    nid = 1;
    const cols = agenda.length > 6 ? 2 : 1;
    const perCol = Math.ceil(agenda.length / cols);
    const cw = Math.floor((W - inch(1.2)) / cols);
    let body = '';
    agenda.forEach((t, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const y = inch(1.45) + row * inch(0.72);
      const x = inch(0.6) + col * cw;
      body +=
        rect(x, y + inch(0.1), inch(0.06), inch(0.5), i === 0 ? C.gold : C.blue, 'Repère') +
        text(x + inch(0.15), y, inch(0.9), inch(0.7), [para(run(String(i + 1).padStart(2, '0'), { sz: 22, color: C.gold, b: true, font: activeDesign().font.mono }))], 'Numéro', 'ctr') +
        text(x + inch(1.0), y, cw - inch(1.2), inch(0.7), [para(run(t, { sz: 16, color: C.text }))], 'Chapitre', 'ctr');
    });
    parts.push({ logo: Boolean(logo), notes: agenda.map((t, i) => `${i + 1}. ${t}`).join('\n'), xml: frame('Sommaire', body) });
  }
  // « L'essentiel en chiffres »: KPI cards + reading, from the brief only.
  if (brief) {
    const kpis = brief.kpis.slice(0, 4);
    const dim = brief.dims.find((d) => d.dim !== brief.entity) ?? brief.dims[0];
    const reading = [
      dim && dim.top[0] ? `${dim.label} : « ${dim.top[0].key} » porte ${pct(dim.top[0].share)} du total ; les 3 premières catégories ${pct(dim.top3Share)}` : '',
      dim ? `${dim.n80} catégorie(s) sur ${dim.categories} suffisent pour atteindre 80 % du total` : '',
      brief.trend?.delta != null ? `Dernière période (${brief.trend.last}) : ${brief.trend.delta >= 0 ? '+' : ''}${Math.round(brief.trend.delta * 100)} % par rapport à la précédente` : '',
      brief.anomalies.length ? `${brief.anomalies.length} anomalie(s) relevée(s) dans les données` : 'Aucune anomalie relevée dans les données',
    ].filter(Boolean);
    if (kpis.length) {
      nid = 1;
      const gap = inch(0.25);
      const x0 = inch(0.6);
      const cw = Math.floor((W - 2 * x0 - gap * (kpis.length - 1)) / kpis.length);
      const y0 = inch(1.4);
      const ch = inch(2.1);
      let body = '';
      kpis.forEach((k, i) => {
        const x = x0 + i * (cw + gap);
        body +=
          card(x, y0, cw, ch, C.white, 'Carte KPI') +
          rect(x, y0 + inch(0.25), inch(0.07), ch - inch(0.5), i === 0 ? C.gold : C.blue, 'Accent') +
          text(x + inch(0.2), y0 + inch(0.15), cw - inch(0.3), inch(0.5), [para(run(k.label.toUpperCase(), { sz: 10, color: C.text2, b: true }))], 'Étiquette', 'ctr') +
          text(x + inch(0.2), y0 + inch(0.6), cw - inch(0.3), inch(0.8), [para(run(fmtFact(k), { sz: fmtFact(k).length <= 7 ? 30 : fmtFact(k).length <= 9 ? 26 : fmtFact(k).length <= 11 ? 22 : 18, color: C.navy, b: true, font: activeDesign().font.mono }))], 'Valeur', 'ctr') +
          text(x + inch(0.2), y0 + inch(1.4), cw - inch(0.3), inch(0.65), [para(run(k.method, { sz: 9, color: C.text2 }))], 'Méthode');
      });
      const ry = y0 + ch + inch(0.3);
      body +=
        rect(inch(0.6), ry, W - inch(1.2), H - ry - inch(0.6), C.ice, 'Lecture') +
        rect(inch(0.6), ry, inch(0.08), H - ry - inch(0.6), C.gold, 'Accent lecture') +
        text(inch(0.85), ry + inch(0.05), W - inch(1.7), H - ry - inch(0.7), [para(run('Lecture', { sz: 14, color: C.navy, b: true })), ...reading.map((r) => para(run(r, { sz: 13, color: C.text }), { bullet: true, spc: 300 }))], 'Texte lecture');
      parts.push({ logo: Boolean(logo), notes: `Méthodes :\n${kpis.map((k) => `${k.label} = ${fmtFact(k)} — ${k.method}`).join('\n')}\nSource : ${brief.source} (${brief.rows} lignes).`, xml: frame('L’essentiel en chiffres', body) });
    }
    // Native chart: the main dimension (horizontal bars, leader in gold) with its concentration reading.
    if (dim && dim.top.length >= 2) {
      nid = 1;
      const cx = inch(7.7);
      const body =
        pptxChartFrame('rIdChart', ++nid, 'Graphique', inch(0.5), inch(1.25), cx, H - inch(1.85)) +
        rect(inch(8.5), inch(1.45), W - inch(9.1), H - inch(2.25), C.ice, 'Lecture') +
        rect(inch(8.5), inch(1.45), inch(0.08), H - inch(2.25), C.gold, 'Accent') +
        text(inch(8.75), inch(1.5), W - inch(9.5), H - inch(2.4), [
          para(run('Concentration', { sz: 14, color: C.navy, b: true })),
          ...[
            `Top 1 : ${dim.top[0]!.key} — ${fmtN(dim.top[0]!.sum)} (${pct(dim.top[0]!.share)})`,
            `Top 3 : ${pct(dim.top3Share)} du total`,
            `50 % du total : ${dim.n50} catégorie(s) · 80 % : ${dim.n80}`,
            `Indice de concentration (HHI) : ${dim.hhi.toFixed(2)}`,
            `${dim.categories} catégorie(s) au total · η² = ${dim.eta2.toFixed(2)}`,
          ].map((r) => para(run(r, { sz: 12, color: C.text }), { bullet: true, spc: 300 })),
        ], 'Texte');
      parts.push({
        logo: Boolean(logo),
        chart: literalChartXml({ kind: 'hbar', title: `${brief.measureLabel} par ${dim.label}`, name: brief.measureLabel, categories: dim.top.map((t) => t.key), values: dim.top.map((t) => t.sum) }),
        notes: dim.top.map((t) => `${t.key} : ${fmtN(t.sum)} (${pct(t.share)}, ${t.count} ligne(s))`).join('\n'),
        xml: frame(`${brief.measureLabel} par ${dim.label}`, body),
      });
    }
    if (brief.trend && brief.trend.points.length >= 3) {
      nid = 1;
      const t = brief.trend;
      const body =
        pptxChartFrame('rIdChart', ++nid, 'Graphique', inch(0.5), inch(1.25), W - inch(1.0), H - inch(2.55)) +
        text(inch(0.6), H - inch(1.25), W - inch(1.2), inch(0.7), [
          para(run(`${t.points.length} périodes · meilleure : ${t.best} · plus faible : ${t.worst}${t.delta != null ? ` · dernière période ${t.last} : ${t.delta >= 0 ? '+' : ''}${Math.round(t.delta * 100)} % vs la précédente` : ''}`, { sz: 12, color: C.text2 })),
        ], 'Lecture');
      parts.push({
        logo: Boolean(logo),
        chart: literalChartXml({ kind: 'line', title: `Évolution ${t.by === 'month' ? 'mensuelle' : 'annuelle'} — ${brief.measureLabel}`, name: brief.measureLabel, categories: t.points.map((p) => p.period), values: t.points.map((p) => p.sum) }),
        notes: t.points.map((p) => `${p.period} : ${fmtN(p.sum)} (${p.count} ligne(s))`).join('\n'),
        xml: frame(`Évolution — ${brief.measureLabel}`, body),
      });
    }
  }
  // Chapters: in a premium deck a level-1 heading opens a section slide (navy, big number) before its content.
  let chapter = 0;
  const hasChapters = premium && slides.filter((s) => s.level === 1).length >= 2;
  slides.forEach((s) => {
    if (hasChapters && s.level === 1) {
      nid = 1;
      chapter++;
      parts.push({
        logo: Boolean(logo),
        notes: s.title,
        xml: sld(
          rect(0, 0, W, H, C.navy, 'Fond') +
            text(inch(0.6), inch(1.6), inch(4), inch(1.4), [para(run(String(chapter).padStart(2, '0'), { sz: 72, color: C.gold, b: true, font: activeDesign().font.mono }))], 'Numéro', 'b') +
            rect(inch(0.7), inch(3.15), inch(2.6), Math.round(0.03 * EMU), C.gold, 'Filet') +
            text(inch(0.6), inch(3.3), W - inch(1.2), inch(1.4), [para(run(s.title, { sz: 34, color: C.white, b: true }))], 'Titre') +
            (logo ? logoShape(logo, W - inch(0.6), inch(0.5), inch(0.7), true) : ''),
          C.navy,
        ),
      });
      if (!s.blocks.length) return;
    }
    nid = 1;
    let body = '';
    let y = inch(1.3);
    const x = inch(0.6);
    const w = W - inch(1.2);
    const flow: string[] = [];
    const flushText = () => {
      if (flow.length) {
        body += text(x, y, w, inch(0.45) * Math.max(2, flow.length), flow.splice(0), 'Texte');
        y += inch(0.5) * 5;
      }
    };
    for (const b of s.blocks) {
      if (b.k === 'table') {
        flushText();
        body += table(x, y, w, b.head, b.rows);
        y += inch(0.42) * (b.rows.length + 1) + inch(0.2);
      } else flow.push(para(run(b.text, { sz: 18, color: C.text }), { bullet: b.k === 'li', spc: 600 }));
    }
    if (flow.length) body += text(x, y, w, H - y - inch(0.8), flow, 'Texte');
    parts.push({ logo: Boolean(logo), notes: premium ? bodyText(s) : undefined, xml: frame(s.title, body) });
  });
  const N = parts.length;
  const ns =
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const notes = premium;
  const theme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="GOD 3D BLUE ECOBANK"><a:themeElements><a:clrScheme name="BlueEcobank"><a:dk1><a:srgbClr val="${C.text}"/></a:dk1><a:lt1><a:srgbClr val="${C.white}"/></a:lt1><a:dk2><a:srgbClr val="${C.navy}"/></a:dk2><a:lt2><a:srgbClr val="${C.ice}"/></a:lt2><a:accent1><a:srgbClr val="${C.blue}"/></a:accent1><a:accent2><a:srgbClr val="${C.cyan}"/></a:accent2><a:accent3><a:srgbClr val="${C.gold}"/></a:accent3><a:accent4><a:srgbClr val="${C.warn}"/></a:accent4><a:accent5><a:srgbClr val="${C.orange}"/></a:accent5><a:accent6><a:srgbClr val="${C.sky}"/></a:accent6><a:hlink><a:srgbClr val="${C.blue}"/></a:hlink><a:folHlink><a:srgbClr val="${C.navy}"/></a:folHlink></a:clrScheme><a:fontScheme name="Ecobank"><a:majorFont><a:latin typeface="${activeDesign().font.ui}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${activeDesign().font.ui}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  const CLR_MAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${parts.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}${parts.map((p, i) => (p.chart ? `<Override PartName="/ppt/charts/chart${i + 1}.xml" ContentType="${CHART_CT}"/>` : '')).join('')}${
        notes
          ? `<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/><Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${parts.map((_, i) => `<Override PartName="/ppt/notesSlides/notesSlide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`).join('')}`
          : ''
      }<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    ),
    'docProps/core.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>MASSAMBA Workbench</dc:creator></cp:coreProperties>`,
    ),
    'ppt/presentation.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${ns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${notes ? `<p:notesMasterIdLst><p:notesMasterId r:id="rId${N + 3}"/></p:notesMasterIdLst>` : ''}<p:sldIdLst>${parts.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    ),
    'ppt/_rels/presentation.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>${parts.map((_, i) => `<Relationship Id="rId${i + 2}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}<Relationship Id="rId${N + 2}" Type="${REL}/theme" Target="theme/theme1.xml"/>${notes ? `<Relationship Id="rId${N + 3}" Type="${REL}/notesMaster" Target="notesMasters/notesMaster1.xml"/>` : ''}</Relationships>`,
    ),
    'ppt/slideMasters/slideMaster1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${ns}><p:cSld><p:bg><p:bgPr>${fill(C.white)}<a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>${CLR_MAP}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="2600" b="1">${fill(C.navy)}<a:latin typeface="${activeDesign().font.ui}"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800">${fill(C.text)}<a:latin typeface="${activeDesign().font.ui}"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800">${fill(C.text)}<a:latin typeface="${activeDesign().font.ui}"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`,
    ),
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`,
    ),
    'ppt/slideLayouts/slideLayout1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${ns} type="blank" preserve="1"><p:cSld name="Vide"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
    ),
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
    ),
    'ppt/theme/theme1.xml': strToU8(theme),
  };
  if (logo) files['ppt/media/massamba-logo.png'] = logo.png;
  if (notes) {
    files['ppt/theme/theme2.xml'] = strToU8(theme);
    files['ppt/notesMasters/notesMaster1.xml'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notesMaster ${ns}><p:cSld><p:bg><p:bgPr>${fill(C.white)}<a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Image de la diapositive"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700">${fill(C.line)}</a:ln></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="fr-FR"/></a:p></p:txBody></p:sp></p:spTree></p:cSld>${CLR_MAP}<p:notesStyle><a:lvl1pPr><a:defRPr sz="1200">${fill(C.text)}<a:latin typeface="${activeDesign().font.ui}"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`,
    );
    files['ppt/notesMasters/_rels/notesMaster1.xml.rels'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/theme" Target="../theme/theme2.xml"/></Relationships>`,
    );
  }
  parts.forEach((p, i) => {
    const n = i + 1;
    files[`ppt/slides/slide${n}.xml`] = strToU8(p.xml);
    files[`ppt/slides/_rels/slide${n}.xml.rels`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${p.logo && logo ? `<Relationship Id="${LOGO_RID}" Type="${REL}/image" Target="../media/massamba-logo.png"/>` : ''}${p.chart ? `<Relationship Id="rIdChart" Type="${CHART_REL}" Target="../charts/chart${n}.xml"/>` : ''}${notes ? `<Relationship Id="rIdNotes" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/>` : ''}</Relationships>`,
    );
    if (p.chart) files[`ppt/charts/chart${n}.xml`] = strToU8(p.chart);
    if (notes) {
      const paras = (p.notes || title).split('\n').map((l) => `<a:p><a:r><a:rPr lang="fr-FR" sz="1200" dirty="0"/><a:t>${esc(l)}</a:t></a:r></a:p>`).join('');
      files[`ppt/notesSlides/notesSlide${n}.xml`] = strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes ${ns}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Image de la diapositive"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="3"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`,
      );
      files[`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`] = strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/notesMaster" Target="../notesMasters/notesMaster1.xml"/><Relationship Id="rId2" Type="${REL}/slide" Target="../slides/slide${n}.xml"/></Relationships>`,
      );
    }
  });
  return zipSync(files);
}
