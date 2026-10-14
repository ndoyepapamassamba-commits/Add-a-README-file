// THE COMMITTEE DECK — a Dossier rendered as the owner's reference deck (ECOBANK Covenant & Trigger Intelligence,
// 30/09/2026): a marine band with the kicker and the action title, the logo badge on a plate, KPI tiles underlined in
// their tone, native 3D charts, a « Lecture — » band on every slide, recommendation cards (reference · priority,
// owner, deadline, indicator), the decisions put to the vote with their Pour / Contre boxes, the annexes, speaker
// notes timed on the whole deck. Colours and fonts come from the active design: the same deck in every theme.
import { strToU8, zipSync } from 'fflate';
import { activeDesign, liveColorProxy, type Design } from '../houseDesign';
import { CHART_CT, CHART_REL, pptxChartFrame } from '../officeChart';
import { allRecos, type Chapter, type Dossier, type Kpi, type Reco, type Tone } from './dossier';
import { figureChartXml } from './dossierChart';

export interface DeckLogo {
  png: Uint8Array;
  width: number;
  height: number;
}
export interface DeckOptions {
  logo?: DeckLogo | null;
  /** Brand line on the title slide footer. */
  brand?: string;
}

const C = liveColorProxy((c) => c) as Design['color'];
const EMU = 914400;
const W = 12192000;
const H = 6858000;
const inch = (x: number) => Math.round(x * EMU);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let nid = 1;
const fill = (rgb: string) => `<a:solidFill><a:srgbClr val="${rgb}"/></a:solidFill>`;
const font = () => activeDesign().font.ui;
const mono = () => activeDesign().font.mono;
const toneColor = (t?: Tone): string => (t === 'risk' ? C.risk : t === 'warn' ? C.warn : t === 'ok' ? C.green : t === 'info' ? C.cyan : C.blue);

// ── primitives ────────────────────────────────────────────────────────────────
interface RunOpt {
  sz: number;
  color: string;
  b?: boolean;
  i?: boolean;
  font?: string;
  caps?: boolean;
}
const run = (t: string, o: RunOpt) =>
  `<a:r><a:rPr lang="fr-FR" sz="${Math.round(o.sz * 100)}" b="${o.b ? 1 : 0}" i="${o.i ? 1 : 0}"${o.caps ? ' cap="all"' : ''} dirty="0">${fill(o.color)}<a:latin typeface="${o.font ?? font()}"/><a:cs typeface="${o.font ?? font()}"/></a:rPr><a:t>${esc(t)}</a:t></a:r>`;
const para = (runs: string, o: { bullet?: boolean; algn?: string; spc?: number; after?: number; lvl?: number; buColor?: string } = {}) =>
  `<a:p><a:pPr algn="${o.algn ?? 'l'}"${o.bullet ? ` marL="${228600 + (o.lvl ?? 0) * 228600}" indent="-228600"` : ''}><a:spcBef><a:spcPts val="${o.spc ?? 300}"/></a:spcBef>${o.after != null ? `<a:spcAft><a:spcPts val="${o.after}"/></a:spcAft>` : ''}${o.bullet ? `<a:buClr><a:srgbClr val="${o.buColor ?? C.gold}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="▪"/>` : '<a:buNone/>'}</a:pPr>${runs}</a:p>`;
const sp = (x: number, y: number, w: number, h: number, inner: string, name: string, geom = 'rect', adj = '') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${++nid}" name="${esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="${geom}"><a:avLst>${adj}</a:avLst></a:prstGeom>${inner}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="fr-FR"/></a:p></p:txBody></p:sp>`;
const rect = (x: number, y: number, w: number, h: number, rgb: string, name: string) => sp(x, y, w, h, `${fill(rgb)}<a:ln><a:noFill/></a:ln>`, name);
const SHADOW = () => `<a:effectLst><a:outerShdw blurRad="76200" dist="25400" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="${C.navy}"><a:alpha val="14000"/></a:srgbClr></a:outerShdw></a:effectLst>`;
const card = (x: number, y: number, w: number, h: number, rgb: string, name: string, o: { shadow?: boolean; line?: string; radius?: number } = {}) =>
  sp(x, y, w, h, `${fill(rgb)}${o.line ? `<a:ln w="9525">${fill(o.line)}</a:ln>` : '<a:ln><a:noFill/></a:ln>'}${o.shadow === false ? '' : SHADOW()}`, name, 'roundRect', `<a:gd name="adj" fmla="val ${o.radius ?? 6000}"/>`);
const circle = (x: number, y: number, d: number, rgb: string, label: string, sz = 12, color = C.white) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${++nid}" name="Pastille"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${d}" cy="${d}"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>${fill(rgb)}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr anchor="ctr" lIns="0" rIns="0" tIns="0" bIns="0"/><a:lstStyle/>${para(run(label, { sz, color, b: true }), { algn: 'ctr', spc: 0 })}</p:txBody></p:sp>`;
const text = (x: number, y: number, w: number, h: number, paras: string[], name: string, o: { anchor?: 'ctr' | 't' | 'b'; inset?: number; fit?: boolean } = {}) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${++nid}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="${o.inset ?? 45720}" rIns="${o.inset ?? 45720}" tIns="36000" bIns="36000" anchor="${o.anchor ?? 't'}">${o.fit === false ? '' : '<a:normAutofit/>'}</a:bodyPr><a:lstStyle/>${paras.join('')}</p:txBody></p:sp>`;
const isNum = (s: string) => /^[-+]?[\d\s .,]+(%|Mds?|M|k)?$/.test(s.trim()) && /\d/.test(s);
function table(x: number, y: number, w: number, head: string[], rows: string[][], o: { widths?: number[]; sz?: number; rowH?: number; firstColTone?: (r: string[]) => string | null } = {}): string {
  const n = Math.max(1, head.length);
  const widths = o.widths && o.widths.length === n ? o.widths.map((p) => Math.floor(w * p)) : Array.from({ length: n }, () => Math.floor(w / n));
  const sz = o.sz ?? 9;
  const rh = inch(o.rowH ?? 0.3);
  const cell = (t: string, header: boolean, numeric: boolean, fillRgb: string | null, textRgb: string, bold: boolean) =>
    `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="${header ? 'ctr' : numeric ? 'r' : 'l'}"/>${run(t, { sz: header ? sz : sz, color: textRgb, b: bold, font: !header && numeric ? mono() : font() })}</a:p></a:txBody><a:tcPr marL="54000" marR="54000" marT="27000" marB="27000" anchor="ctr"><a:lnB w="6350">${fill(C.line)}</a:lnB>${fillRgb ? fill(fillRgb) : '<a:noFill/>'}</a:tcPr></a:tc>`;
  const body = rows
    .map((r, i) => {
      const tone = o.firstColTone?.(r) ?? null;
      return `<a:tr h="${rh}">${Array.from({ length: n }, (_, j) => cell(r[j] ?? '', false, isNum(r[j] ?? ''), j === 0 && tone ? tone : i % 2 ? C.panel : null, j === 0 && tone ? C.white : C.text, j === 0)).join('')}</a:tr>`;
    })
    .join('');
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${++nid}" name="Tableau"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${widths.reduce((a, b) => a + b, 0)}" cy="${rh * (rows.length + 1)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${widths.map((cw) => `<a:gridCol w="${cw}"/>`).join('')}</a:tblGrid><a:tr h="${rh}">${head.map((h) => cell(h, true, false, C.navy, C.white, true)).join('')}</a:tr>${body}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}
const sld = (shapes: string, bg: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr>${fill(bg)}<a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
const LOGO_RID = 'rIdLogo';
/** The badge at the top-right of every slide: a white plate with the logo, or the organisation on a plate. */
function badge(d: Dossier, logo: DeckLogo | null, xRight: number, y: number, h: number): string {
  if (logo) {
    const cx = Math.round((h * logo.width) / Math.max(1, logo.height));
    const pad = inch(0.07);
    return (
      card(xRight - cx - 2 * pad, y - pad, cx + 2 * pad, h + 2 * pad, C.white, 'Plaque logo', { shadow: true, radius: 12000 }) +
      `<p:pic><p:nvPicPr><p:cNvPr id="${++nid}" name="Logo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${LOGO_RID}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${xRight - cx - pad}" y="${y}"/><a:ext cx="${cx}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
    );
  }
  const label = (d.org || 'MASSAMBA').slice(0, 16);
  const w = inch(0.22) + Math.round(inch(0.11) * label.length);
  return card(xRight - w, y, w, h, C.white, 'Plaque', { shadow: true, radius: 12000 }) + text(xRight - w, y, w, h, [para(run(label, { sz: 10, color: C.navy, b: true }), { algn: 'ctr', spc: 0 })], 'Organisation', { anchor: 'ctr' });
}

interface Part {
  xml: string;
  charts: string[];
  notes: string;
  /** Relative speaking weight for the timing of the notes. */
  weight: number;
}

/** Lines of text that fit a width (chars per line from the size), used to choose sizes and continuations. */
const linesOf = (t: string, widthIn: number, sz: number) => Math.max(1, Math.ceil(t.length / Math.max(8, Math.floor((widthIn * 72) / (sz * 0.52)))));

export function dossierPptx(d: Dossier, opts: DeckOptions = {}): Uint8Array {
  const logo = opts.logo && opts.logo.png.length ? opts.logo : null;
  const parts: Part[] = [];
  const footerText = [d.org, d.unit, d.confidentiality].filter(Boolean).join(' · ') || `${d.title} · ${d.date}`;
  const BAND = inch(0.78);
  const FOOT = inch(0.34);
  const LECT = inch(0.5);
  const M = inch(0.45); // side margin
  const contentTop = BAND + inch(0.2);
  const lectureTop = H - FOOT - LECT - inch(0.08);
  const footer = (pageNo: number) =>
    rect(0, H - FOOT, W, FOOT, C.ice, 'Pied') +
    text(M, H - FOOT, W - inch(2), FOOT, [para(run(footerText, { sz: 8, color: C.text2 }), { spc: 0 })], 'Pied texte', { anchor: 'ctr' }) +
    text(W - inch(1.3), H - FOOT, inch(0.85), FOOT, [para(run(String(pageNo), { sz: 9, color: C.blue, b: true, font: mono() }), { algn: 'r', spc: 0 })], 'Numéro', { anchor: 'ctr' });
  /** Content frame: band (kicker + action title), filet, badge, body, Lecture band, footer. */
  const frame = (title: string, kicker: string, body: string, lecture?: string) => {
    nid = 1;
    const pageNo = parts.length + 1;
    const tSz = title.length > 95 ? 15 : title.length > 70 ? 17 : 19;
    const shapes =
      rect(0, 0, W, BAND, C.navy, 'Bandeau') +
      rect(0, BAND, W, Math.round(0.035 * EMU), C.gold, 'Filet') +
      text(M, inch(0.06), W - inch(3.2), inch(0.5), [para(run(title, { sz: tSz, color: C.white, b: true }), { spc: 0 })], 'Titre', { anchor: 'ctr' }) +
      text(M, inch(0.5), W - inch(3.2), inch(0.26), [para(run(kicker, { sz: 8, color: C.subtle, b: true, caps: true }), { spc: 0 })], 'Rubrique', { anchor: 'ctr' }) +
      badge(d, logo, W - M, inch(0.14), inch(0.5)) +
      body +
      (lecture
        ? rect(M, lectureTop, W - 2 * M, LECT, C.ice, 'Lecture') +
          rect(M, lectureTop, inch(0.06), LECT, C.gold, 'Accent lecture') +
          text(M + inch(0.15), lectureTop, W - 2 * M - inch(0.2), LECT, [para(`${run('Lecture — ', { sz: 9.5, color: C.navy, b: true })}${run(lecture, { sz: 9.5, color: C.text, i: true })}`, { spc: 0 })], 'Texte lecture', { anchor: 'ctr' })
        : '') +
      footer(pageNo);
    return sld(shapes, C.white);
  };
  const push = (xml: string, o: { charts?: string[]; notes: string; weight?: number }) => parts.push({ xml, charts: o.charts ?? [], notes: o.notes, weight: o.weight ?? 1 });

  // 1 ── Title slide: white page, marine block with kicker + title + subtitle, four KPI tiles, author line.
  nid = 1;
  {
    const tiles = d.kpis.slice(0, 4);
    const tw = Math.floor((W - 2 * M - inch(0.25) * 3) / 4);
    let body = '';
    tiles.forEach((k, i) => {
      const x = M + i * (tw + inch(0.25));
      const y = inch(4.95);
      body +=
        card(x, y, tw, inch(1.15), C.white, 'Tuile', { line: C.line, shadow: true }) +
        text(x + inch(0.1), y + inch(0.08), tw - inch(0.2), inch(0.6), [para(run(k.value, { sz: k.value.length > 9 ? 20 : 24, color: C.navy, b: true, font: mono() }), { spc: 0 })], 'Valeur', { anchor: 'ctr' }) +
        text(x + inch(0.1), y + inch(0.68), tw - inch(0.2), inch(0.4), [para(run(k.label, { sz: 9, color: C.text2 }), { spc: 0 })], 'Étiquette') +
        rect(x + inch(0.1), y + inch(1.08), inch(0.9), inch(0.035), toneColor(k.tone), 'Soulignement');
    });
    const shapes =
      rect(0, 0, W, inch(1.05), C.navy, 'Bandeau') +
      rect(0, inch(1.05), W, inch(0.04), C.gold, 'Filet') +
      badge(d, logo, W - M, inch(0.2), inch(0.62)) +
      text(M, inch(0.22), W - inch(3), inch(0.4), [para(run(d.kicker || `${d.org ?? ''} · ${d.date}`.trim(), { sz: 10, color: C.gold, b: true, caps: true }), { spc: 0 })], 'Rubrique', { anchor: 'ctr' }) +
      text(M, inch(0.56), W - inch(3), inch(0.4), [para(run([d.org, d.unit].filter(Boolean).join(' · ') || 'MASSAMBA Workbench', { sz: 9.5, color: C.subtle }), { spc: 0 })], 'Unité', { anchor: 'ctr' }) +
      text(M, inch(1.5), W - 2 * M, inch(1.4), [para(run(d.title, { sz: d.title.length > 48 ? 30 : 36, color: C.navy, b: true }), { spc: 0 })], 'Titre', { anchor: 'ctr' }) +
      rect(M + inch(0.05), inch(2.95), inch(2.4), inch(0.05), C.gold, 'Filet titre') +
      text(M, inch(3.1), W - 2 * M, inch(1.4), [para(run(d.subtitle || d.thesis.split(/(?<=\.)\s/)[0] || '', { sz: 15, color: C.text2 }), { spc: 0 })], 'Sous-titre') +
      body +
      text(M, inch(6.3), W - 2 * M - inch(2), inch(0.5), [para(run(`${d.author ? `Présenté par ${d.author}` : ''}${d.asOf ? ` · arrêté du ${d.asOf}` : ''}${d.dataSource ? ` · ${d.dataSource}` : ''}`.replace(/^ · /, ''), { sz: 9, color: C.text2, i: true }), { spc: 0 })], 'Auteur', { anchor: 'ctr' }) +
      text(W - M - inch(2), inch(6.3), inch(2), inch(0.5), [para(run(d.confidentiality || opts.brand || 'MASSAMBA Workbench', { sz: 9, color: C.risk, b: true, caps: true }), { algn: 'r', spc: 0 })], 'Confidentialité', { anchor: 'ctr' });
    push(sld(shapes, C.white), { notes: `${d.title}\n${d.subtitle ?? ''}\n${d.thesis}`, weight: 0.6 });
  }

  // 2 ── The figure: one huge number, the thesis under it.
  {
    const lead = d.kpis.find((k) => k.tone === 'risk') ?? d.kpis[1] ?? d.kpis[0];
    if (lead) {
      const body =
        text(M, inch(1.35), W - 2 * M, inch(1.9), [para(run(lead.value, { sz: lead.value.length > 10 ? 54 : 72, color: C.navy, b: true, font: mono() }), { algn: 'ctr', spc: 0 })], 'Chiffre', { anchor: 'ctr' }) +
        text(M, inch(3.25), W - 2 * M, inch(0.5), [para(run(lead.label.toUpperCase(), { sz: 11, color: C.gold, b: true }), { algn: 'ctr', spc: 0 })], 'Étiquette', { anchor: 'ctr' }) +
        rect(W / 2 - inch(1.2), inch(3.8), inch(2.4), inch(0.04), C.gold, 'Filet') +
        text(M + inch(1), inch(3.95), W - 2 * M - inch(2), inch(1.85), [para(run(d.thesis, { sz: d.thesis.length > 420 ? 12 : 14, color: C.text }), { algn: 'ctr', spc: 0 })], 'Thèse', { anchor: 'ctr' });
      push(frame(d.messages[0] || `${lead.label} : ${lead.value}`, 'Le chiffre qui change la lecture', body, lead.method ? `${lead.method}` : undefined), { notes: `${lead.label} = ${lead.value}. ${d.thesis}`, weight: 1.2 });
    }
  }

  // 3 ── The indicators: ten tiles (two rows), the same in every deliverable.
  if (d.kpis.length) {
    const kp = d.kpis.slice(0, 10);
    const cols = kp.length > 5 ? 5 : kp.length;
    const rowsN = Math.ceil(kp.length / cols);
    const gap = inch(0.2);
    const tw = Math.floor((W - 2 * M - gap * (cols - 1)) / cols);
    const th = rowsN > 1 ? inch(1.85) : inch(2.4);
    let body = '';
    kp.forEach((k, i) => {
      const x = M + (i % cols) * (tw + gap);
      const y = contentTop + Math.floor(i / cols) * (th + inch(0.22));
      body += kpiTile(x, y, tw, th, k);
    });
    push(frame(`${kp.length} indicateurs à retenir — les mêmes dans le classeur, le deck et le rapport`, 'Ce qu’il faut retenir', body, d.provenance || 'Chaque indicateur est calculé une seule fois puis repris à l’identique dans les trois livrables ; aucune valeur n’est saisie à la main.'), {
      notes: kp.map((k) => `${k.code} ${k.label} = ${k.value}${k.method ? ` — ${k.method}` : ''}`).join('\n'),
      weight: 1.6,
    });
  }

  // 4 ── Method: numbered circles, the rules applied, what the research changes.
  if (d.method && (d.method.steps.length || d.method.rules.length)) {
    const steps = d.method.steps.slice(0, 7);
    let body = '';
    if (steps.length) {
      const sw = Math.floor((W - 2 * M) / steps.length);
      steps.forEach((s, i) => {
        const x = M + i * sw;
        body +=
          circle(x + Math.floor(sw / 2) - inch(0.22), contentTop + inch(0.05), inch(0.44), C.blue, String(s.n), 13) +
          text(x, contentTop + inch(0.55), sw, inch(0.35), [para(run(s.label, { sz: 10.5, color: C.navy, b: true }), { algn: 'ctr', spc: 0 })], 'Étape') +
          text(x + inch(0.08), contentTop + inch(0.9), sw - inch(0.16), inch(0.75), [para(run(s.detail ?? '', { sz: 8.5, color: C.text2 }), { algn: 'ctr', spc: 0 })], 'Détail');
      });
    }
    const y2 = contentTop + (steps.length ? inch(1.8) : 0);
    const colW = Math.floor((W - 2 * M - inch(0.3)) / 2);
    const hh = lectureTop - y2 - inch(0.15);
    body +=
      card(M, y2, colW, hh, C.panel, 'Règles', { line: C.line, shadow: false }) +
      text(M + inch(0.15), y2 + inch(0.05), colW - inch(0.3), hh - inch(0.1), [para(run('Règles non négociables appliquées', { sz: 11, color: C.navy, b: true }), { spc: 0, after: 400 }), ...d.method.rules.slice(0, 6).map((r) => para(run(r, { sz: 9.5, color: C.text }), { bullet: true, spc: 250, buColor: C.gold }))], 'Règles texte');
    if (d.method.research?.length)
      body +=
        card(M + colW + inch(0.3), y2, colW, hh, C.panel, 'Recherche', { line: C.line, shadow: false }) +
        text(M + colW + inch(0.45), y2 + inch(0.05), colW - inch(0.3), hh - inch(0.1), [para(run('Ce que la recherche change (extraits)', { sz: 11, color: C.navy, b: true }), { spc: 0, after: 400 }), ...d.method.research.slice(0, 5).map((r) => para(run(r, { sz: 9.5, color: C.text }), { bullet: true, spc: 250, buColor: C.gold }))], 'Recherche texte');
    push(frame(d.messages[1] || 'Une seule chaîne, une seule date : méthode en trente secondes', 'Enjeu · périmètre et méthode', body), { notes: `${steps.map((s) => `${s.n}. ${s.label}${s.detail ? ` — ${s.detail}` : ''}`).join('\n')}\nRègles : ${d.method.rules.join(' ; ')}`, weight: 1.3 });
  }

  // 5… ── Chapters: a findings screen (tiles + figures + Lecture) then a cases-and-actions screen.
  for (const ch of d.chapters) {
    const kicker = ch.kicker ?? `CHAPITRE ${ch.n} · ${ch.title.toUpperCase()}`;
    const headline = ch.headline || ch.constats[0] || ch.title;
    // (a) findings: left column = chapter KPIs or the first constats; right = up to two figures (or a table).
    {
      let body = '';
      const leftW = inch(2.75);
      const tiles = (ch.kpis?.length ? ch.kpis : []).slice(0, 3);
      const bodyH = lectureTop - contentTop - inch(0.15);
      if (tiles.length) {
        const th = Math.floor((bodyH - inch(0.15) * (tiles.length - 1)) / tiles.length);
        tiles.forEach((k, i) => (body += kpiTile(M, contentTop + i * (th + inch(0.15)), leftW, Math.min(th, inch(1.6)), k)));
      } else {
        body +=
          card(M, contentTop, leftW, bodyH, C.panel, 'Constats', { line: C.line, shadow: false }) +
          text(M + inch(0.1), contentTop + inch(0.05), leftW - inch(0.2), bodyH - inch(0.1), [para(run('Constat chiffré', { sz: 10, color: C.navy, b: true, caps: true }), { spc: 0, after: 300 }), ...ch.constats.slice(0, 5).map((c) => para(run(c, { sz: 9.5, color: C.text }), { bullet: true, spc: 250 }))], 'Constats texte');
      }
      const charts: string[] = [];
      const rx = M + leftW + inch(0.25);
      const rw = W - M - rx;
      const figs = ch.figures.slice(0, 2);
      if (figs.length) {
        const fw = figs.length === 2 ? Math.floor((rw - inch(0.2)) / 2) : rw;
        figs.forEach((f, i) => {
          charts.push(figureChartXml(f));
          body += pptxChartFrame(`rIdChart${i + 1}`, ++nid, 'Graphique', rx + i * (fw + inch(0.2)), contentTop, fw, bodyH);
        });
      } else if (ch.tables[0]) {
        const t = ch.tables[0];
        body += table(rx, contentTop, rw, t.head, t.rows.slice(0, 10), { sz: 8.5, rowH: 0.28 });
      } else {
        body += card(rx, contentTop, rw, bodyH, C.panel, 'Analyse', { line: C.line, shadow: false }) + text(rx + inch(0.15), contentTop + inch(0.05), rw - inch(0.3), bodyH - inch(0.1), [para(run('Analyse', { sz: 10, color: C.navy, b: true, caps: true }), { spc: 0, after: 300 }), ...ch.analyse.slice(0, 4).map((a) => para(run(a, { sz: 10, color: C.text }), { spc: 300 }))], 'Analyse texte');
      }
      const lecture = ch.lecture || ch.figures[0]?.lecture || ch.analyse[0];
      push(frame(headline, kicker, body, lecture), { charts, notes: [...ch.constats, ...ch.analyse].join('\n'), weight: 1.5 });
    }
    // (b) cases, frame and actions: left = cases + regulatory frame, right = recommendation cards (3 per screen).
    const recos = ch.recommandations;
    const hasLeft = ch.cas.length || ch.cadre.length;
    if (hasLeft || recos.length) {
      for (let r0 = 0; r0 < Math.max(1, recos.length); r0 += 3) {
        const slice = recos.slice(r0, r0 + 3);
        let body = '';
        const bodyH = lectureTop - contentTop - inch(0.15);
        const leftW = slice.length ? inch(5.3) : W - 2 * M;
        if (hasLeft) {
          const half = Math.floor((bodyH - inch(0.15)) / 2);
          const casH = ch.cas.length && ch.cadre.length ? half : bodyH;
          if (ch.cas.length)
            body += card(M, contentTop, leftW, casH, C.panel, 'Cas', { line: C.line, shadow: false }) + text(M + inch(0.12), contentTop + inch(0.04), leftW - inch(0.24), casH - inch(0.08), [para(run('Cas emblématiques', { sz: 10, color: C.navy, b: true, caps: true }), { spc: 0, after: 250 }), ...ch.cas.slice(0, 4).map((c) => para(run(c, { sz: 9, color: C.text }), { bullet: true, spc: 200, buColor: C.gold }))], 'Cas texte');
          if (ch.cadre.length) {
            const y = ch.cas.length ? contentTop + half + inch(0.15) : contentTop;
            const h = ch.cas.length ? half : bodyH;
            body += card(M, y, leftW, h, C.panel, 'Cadre', { line: C.line, shadow: false }) + text(M + inch(0.12), y + inch(0.04), leftW - inch(0.24), h - inch(0.08), [para(run('Ce que disent la réglementation et la recherche', { sz: 10, color: C.navy, b: true, caps: true }), { spc: 0, after: 250 }), ...ch.cadre.slice(0, 4).map((c) => para(run(c, { sz: 9, color: C.text }), { bullet: true, spc: 200, buColor: C.gold }))], 'Cadre texte');
          }
        } else if (ch.analyse.length) body += card(M, contentTop, leftW, bodyH, C.panel, 'Analyse', { line: C.line, shadow: false }) + text(M + inch(0.12), contentTop + inch(0.04), leftW - inch(0.24), bodyH - inch(0.08), [para(run('Analyse', { sz: 10, color: C.navy, b: true, caps: true }), { spc: 0, after: 250 }), ...ch.analyse.slice(0, 4).map((a) => para(run(a, { sz: 9.5, color: C.text }), { spc: 250 }))], 'Analyse texte');
        if (slice.length) {
          const rx = hasLeft || ch.analyse.length ? M + leftW + inch(0.25) : M;
          const rw = W - M - rx;
          const rh = Math.floor((bodyH - inch(0.15) * (slice.length - 1)) / slice.length);
          slice.forEach((rec, i) => (body += recoCard(rx, contentTop + i * (rh + inch(0.15)), rw, rh, rec)));
        }
        const title = r0 === 0 ? (recos[0] ? `${recos[0].title}` : headline) : `${headline} (suite)`;
        push(frame(title, `${kicker} · cas et actions`, body, ch.lecture ? undefined : ch.analyse[1] ?? ch.analyse[0]), { notes: [...ch.cas, ...ch.cadre, ...slice.map((r) => `${r.ref} ${r.priority} ${r.title} — ${r.action} (${r.owner}, ${r.due})`)].join('\n'), weight: 1.4 });
        if (!recos.length) break;
      }
    }
    // (c) extra figures and tables beyond the first screen.
    const extra = ch.figures.slice(2);
    for (let i = 0; i < extra.length; i += 2) {
      const pair = extra.slice(i, i + 2);
      const bodyH = lectureTop - contentTop - inch(0.15);
      const fw = pair.length === 2 ? Math.floor((W - 2 * M - inch(0.25)) / 2) : W - 2 * M;
      let body = '';
      const charts: string[] = [];
      pair.forEach((f, k) => {
        charts.push(figureChartXml(f));
        body += pptxChartFrame(`rIdChart${k + 1}`, ++nid, 'Graphique', M + k * (fw + inch(0.25)), contentTop, fw, bodyH);
      });
      push(frame(pair[0]!.title, `${kicker} · figures`, body, pair[0]!.lecture ?? pair[1]?.lecture), { charts, notes: pair.map((f) => `${f.title} : ${f.categories.map((c, j) => `${c} ${f.series[0]!.values[j]}`).join(', ')}`).join('\n'), weight: 1 });
    }
    for (const t of ch.tables.slice(ch.figures.length ? 0 : 1)) {
      const body = table(M, contentTop, W - 2 * M, t.head, t.rows.slice(0, 12), { sz: 8.5, rowH: 0.3 });
      push(frame(t.title ?? ch.title, `${kicker} · tableau`, body, t.lecture), { notes: t.rows.map((r) => r.join(' | ')).join('\n'), weight: 1 });
    }
  }

  // ── Action plan: the P1 recommendations in one table.
  const recos = allRecos(d);
  if (recos.length) {
    const p1 = recos.filter((r) => r.priority === 'P1');
    const shown = (p1.length >= 4 ? p1 : recos).slice(0, 12);
    const body = table(M, contentTop, W - 2 * M, ['Réf.', 'Recommandation', 'Axe', 'Responsable', 'Échéance'], shown.map((r) => [r.ref, r.title, r.axis ?? '', r.owner, r.due]), { widths: [0.07, 0.48, 0.15, 0.18, 0.12], sz: 8.5, rowH: 0.3, firstColTone: (r) => (recos.find((x) => x.ref === r[0])?.priority === 'P1' ? C.risk : recos.find((x) => x.ref === r[0])?.priority === 'P2' ? C.warn : C.blue) });
    push(frame(`${recos.length} recommandations, dont ${p1.length} priorité P1`, 'Décisions · plan d’actions', body, `Le plan complet (${recos.length} recommandations) figure dans le rapport et le classeur ; chaque action a un responsable, une échéance et un indicateur.`), { notes: recos.map((r) => `${r.ref} [${r.priority}] ${r.title} — ${r.owner}, ${r.due}, KPI : ${r.kpi}`).join('\n'), weight: 1.3 });
  }

  // ── Decisions put to the vote.
  if (d.decisions.length) {
    const dec = d.decisions.slice(0, 8);
    const rowH = Math.floor((lectureTop - contentTop - inch(0.1)) / dec.length);
    let body = '';
    dec.forEach((x, i) => {
      const y = contentTop + i * rowH;
      body +=
        circle(M, y + Math.floor(rowH / 2) - inch(0.2), inch(0.4), C.risk, x.code, 10) +
        text(M + inch(0.55), y, W - 2 * M - inch(2.6), rowH, [para(run(x.text, { sz: rowH > inch(0.7) ? 11.5 : 10, color: C.text }), { spc: 0 })], 'Décision', { anchor: 'ctr' }) +
        text(W - M - inch(1.9), y, inch(1.9), rowH, [para(`${run('☐ Pour', { sz: 10, color: C.green, b: true })}${run('   ☐ Contre', { sz: 10, color: C.risk, b: true })}`, { algn: 'r', spc: 0 })], 'Vote', { anchor: 'ctr' }) +
        rect(M, y + rowH - inch(0.02), W - 2 * M, inch(0.012), C.line, 'Ligne');
    });
    push(frame(`${dec.length} décision${dec.length > 1 ? 's' : ''} soumise${dec.length > 1 ? 's' : ''} à votre vote aujourd’hui`, 'Décisions · vote du comité', body), { notes: dec.map((x) => `${x.code} — ${x.text}`).join('\n'), weight: 1.5 });
  }

  // ── Annexes: hypotheses and data quality, sources by axis.
  if (d.hypotheses.length || d.dataQuality?.items.length) {
    const colW = Math.floor((W - 2 * M - inch(0.3)) / 2);
    const bodyH = lectureTop - contentTop - inch(0.15);
    let body = '';
    const charts: string[] = [];
    body += card(M, contentTop, colW, bodyH, C.panel, 'Hypothèses', { line: C.line, shadow: false }) + text(M + inch(0.12), contentTop + inch(0.04), colW - inch(0.24), bodyH - inch(0.08), [para(run('Hypothèses structurantes (extrait du registre)', { sz: 10, color: C.navy, b: true, caps: true }), { spc: 0, after: 250 }), ...d.hypotheses.slice(0, 8).map((h) => para(`${run(`${h.code} `, { sz: 8.5, color: C.blue, b: true, font: mono() })}${run(`${h.title} — ${h.text}`, { sz: 8.5, color: C.text })}`, { bullet: true, spc: 150 }))], 'Hypothèses texte');
    const dq = d.dataQuality;
    if (dq?.items.length && dq.items.some((it) => it.score != null)) {
      charts.push(figureChartXml({ kind: 'col3d', title: 'Indice de qualité par source (/100)', categories: dq.items.filter((it) => it.score != null).map((it) => it.item), series: [{ name: 'Qualité', values: dq.items.filter((it) => it.score != null).map((it) => it.score!) }], fmt: '0' }));
      body += pptxChartFrame('rIdChart1', ++nid, 'Graphique', M + colW + inch(0.3), contentTop, colW, bodyH);
    } else if (dq?.items.length) body += card(M + colW + inch(0.3), contentTop, colW, bodyH, C.panel, 'Qualité', { line: C.line, shadow: false }) + text(M + colW + inch(0.42), contentTop + inch(0.04), colW - inch(0.24), bodyH - inch(0.08), [para(run('Qualité des données', { sz: 10, color: C.navy, b: true, caps: true }), { spc: 0, after: 250 }), ...dq.items.slice(0, 8).map((it) => para(run(`${it.item} — ${it.note}`, { sz: 8.5, color: C.text }), { bullet: true, spc: 150 }))], 'Qualité texte');
    push(frame('Annexe — Hypothèses et qualité des données', 'Annexes · hypothèses', body, dq?.score != null ? `Indice de qualité global ${dq.score}/100 ; les hypothèses sont numérotées, motivées et reliées aux paramètres.` : 'Chaque hypothèse est numérotée et motivée ; aucune question bloquante n’a été posée.'), { charts, notes: d.hypotheses.map((h) => `${h.code} ${h.title} : ${h.text}`).join('\n'), weight: 0.8 });
  }
  if (d.sources.length) {
    const byAxis = new Map<string, number>();
    for (const s of d.sources) byAxis.set(s.axis ?? 'R1', (byAxis.get(s.axis ?? 'R1') ?? 0) + 1);
    const axes = [...byAxis.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const colW = Math.floor((W - 2 * M - inch(0.3)) / 2);
    const bodyH = lectureTop - contentTop - inch(0.15);
    const charts = [figureChartXml({ kind: 'col3d', title: 'Sources par axe de recherche', categories: axes.map((a) => a[0]), series: [{ name: 'Sources', values: axes.map((a) => a[1]) }], fmt: '0' })];
    const body =
      pptxChartFrame('rIdChart1', ++nid, 'Graphique', M, contentTop, colW, bodyH) +
      card(M + colW + inch(0.3), contentTop, colW, bodyH, C.panel, 'Références', { line: C.line, shadow: false }) +
      text(M + colW + inch(0.42), contentTop + inch(0.04), colW - inch(0.24), bodyH - inch(0.08), [para(run('Références clés', { sz: 10, color: C.navy, b: true, caps: true }), { spc: 0, after: 250 }), ...d.sources.slice(0, 8).map((s) => para(`${run(`[${s.id}] `, { sz: 8.5, color: C.blue, b: true, font: mono() })}${run(`${s.title}${s.author ? ` — ${s.author}` : ''}${s.date ? ` (${s.date})` : ''}`, { sz: 8.5, color: C.text })}`, { bullet: true, spc: 150 }))], 'Références texte');
    push(frame(`Annexe — ${d.sources.length} source${d.sources.length > 1 ? 's' : ''} sur ${axes.length} axe${axes.length > 1 ? 's' : ''} de recherche`, 'Annexes · sources', body, 'Bibliographie complète, datée et reliée à une application concrète : annexe du rapport et feuille SOURCES du classeur.'), { charts, notes: d.sources.map((s) => `[${s.id}] ${s.title} — ${s.lesson}`).join('\n'), weight: 0.8 });
  }

  return packDeck(d, parts, logo);
}

function kpiTile(x: number, y: number, w: number, h: number, k: Kpi): string {
  const tone = toneColor(k.tone);
  const vSz = h < inch(1.2) ? 16 : k.value.length > 9 ? 18 : 22;
  return (
    card(x, y, w, h, C.white, 'Tuile KPI', { line: C.line, shadow: true }) +
    text(x + inch(0.08), y + inch(0.04), w - inch(0.16), inch(0.42), [para(run(`${k.code} · ${k.label}`, { sz: 7.5, color: C.text2, b: true, caps: true }), { spc: 0 })], 'Étiquette') +
    text(x + inch(0.08), y + inch(0.42), w - inch(0.16), Math.max(inch(0.45), h - inch(0.95)), [para(run(k.value, { sz: vSz, color: C.navy, b: true, font: mono() }), { spc: 0 })], 'Valeur', { anchor: 'ctr' }) +
    (k.sub ? text(x + inch(0.08), y + h - inch(0.5), w - inch(0.16), inch(0.38), [para(run(k.sub, { sz: 7.5, color: tone, i: true }), { spc: 0 })], 'Sous-titre', { anchor: 'ctr' }) : '') +
    rect(x + inch(0.08), y + h - inch(0.1), inch(0.8), inch(0.035), tone, 'Soulignement')
  );
}
function recoCard(x: number, y: number, w: number, h: number, r: Reco): string {
  const tone = r.priority === 'P1' ? C.risk : r.priority === 'P2' ? C.warn : C.blue;
  const meta = `Responsable : ${r.owner} · Échéance : ${r.due} · Indicateur : ${r.kpi}`;
  const aSz = h > inch(1.6) ? 9 : 8.5;
  return (
    card(x, y, w, h, C.white, 'Recommandation', { line: C.line, shadow: true }) +
    rect(x, y + inch(0.12), inch(0.06), h - inch(0.24), tone, 'Priorité') +
    card(x + inch(0.15), y + inch(0.1), inch(0.95), inch(0.24), tone, 'Pastille', { shadow: false, radius: 50000 }) +
    text(x + inch(0.15), y + inch(0.1), inch(0.95), inch(0.24), [para(run(`${r.ref} · ${r.priority}`, { sz: 8, color: C.white, b: true, font: mono() }), { algn: 'ctr', spc: 0 })], 'Référence', { anchor: 'ctr', inset: 0 }) +
    text(x + inch(1.15), y + inch(0.06), w - inch(1.25), inch(0.34), [para(run(r.title, { sz: 10, color: C.navy, b: true }), { spc: 0 })], 'Titre', { anchor: 'ctr' }) +
    text(x + inch(0.15), y + inch(0.38), w - inch(0.25), h - inch(0.72), [para(run(r.action, { sz: aSz, color: C.text }), { spc: 0 })], 'Action') +
    text(x + inch(0.15), y + h - inch(0.36), w - inch(0.25), inch(0.32), [para(run(meta, { sz: 7.5, color: C.text2, i: true }), { spc: 0 })], 'Responsable', { anchor: 'ctr' })
  );
}

// ── packaging ─────────────────────────────────────────────────────────────────
function packDeck(d: Dossier, parts: Part[], logo: DeckLogo | null): Uint8Array {
  const N = parts.length;
  const ns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const D = activeDesign();
  const theme = (name: string) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${esc(name)}"><a:themeElements><a:clrScheme name="${esc(D.name)}"><a:dk1><a:srgbClr val="${C.text}"/></a:dk1><a:lt1><a:srgbClr val="${C.white}"/></a:lt1><a:dk2><a:srgbClr val="${C.navy}"/></a:dk2><a:lt2><a:srgbClr val="${C.ice}"/></a:lt2><a:accent1><a:srgbClr val="${C.blue}"/></a:accent1><a:accent2><a:srgbClr val="${C.gold}"/></a:accent2><a:accent3><a:srgbClr val="${C.cyan}"/></a:accent3><a:accent4><a:srgbClr val="${C.warn}"/></a:accent4><a:accent5><a:srgbClr val="${C.risk}"/></a:accent5><a:accent6><a:srgbClr val="${C.green}"/></a:accent6><a:hlink><a:srgbClr val="${C.blue}"/></a:hlink><a:folHlink><a:srgbClr val="${C.text2}"/></a:folHlink></a:clrScheme><a:fontScheme name="${esc(D.font.ui)}"><a:majorFont><a:latin typeface="${esc(D.font.ui)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${esc(D.font.ui)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  const CLR_MAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';
  const emptyTree = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';
  // Speaker notes timed on the deck: [m:ss → m:ss · x min] from the slides' weights.
  const total = d.minutes ?? Math.max(10, Math.round(N * 1.1));
  const wsum = parts.reduce((a, p) => a + p.weight, 0);
  let t = 0;
  const mmss = (m: number) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`;
  const timed = parts.map((p) => {
    const dur = (p.weight / wsum) * total;
    const s = `[${mmss(t)} → ${mmss(t + dur)} · ${dur >= 1 ? `${Math.round(dur * 10) / 10} min` : `${Math.round(dur * 60)} s`}] `;
    t += dur;
    return s + p.notes;
  });
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>${parts
        .map(
          (p, i) =>
            `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/notesSlides/notesSlide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>${p.charts.map((_, k) => `<Override PartName="/ppt/charts/chart${i + 1}_${k + 1}.xml" ContentType="${CHART_CT}"/>`).join('')}`,
        )
        .join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    ),
    'docProps/core.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(d.title)}</dc:title><dc:subject>${esc(d.subtitle ?? '')}</dc:subject><dc:creator>${esc(d.author || 'MASSAMBA Workbench')}</dc:creator><cp:keywords>${esc([d.org, d.unit].filter(Boolean).join(', '))}</cp:keywords><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`,
    ),
    'docProps/app.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MASSAMBA Workbench</Application><Slides>${N}</Slides><Notes>${N}</Notes><Company>${esc(d.org ?? '')}</Company></Properties>`,
    ),
    'ppt/presentation.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${ns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId${N + 3}"/></p:notesMasterIdLst><p:sldIdLst>${parts.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="fr-FR"/></a:defPPr></p:defaultTextStyle></p:presentation>`,
    ),
    'ppt/_rels/presentation.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>${parts.map((_, i) => `<Relationship Id="rId${i + 2}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}<Relationship Id="rId${N + 2}" Type="${REL}/theme" Target="theme/theme1.xml"/><Relationship Id="rId${N + 3}" Type="${REL}/notesMaster" Target="notesMasters/notesMaster1.xml"/></Relationships>`,
    ),
    'ppt/slideMasters/slideMaster1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${ns}><p:cSld><p:bg><p:bgPr>${fill(C.white)}<a:effectLst/></p:bgPr></p:bg>${emptyTree}</p:cSld>${CLR_MAP}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="2400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1400"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1400"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`),
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`),
    'ppt/slideLayouts/slideLayout1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${ns} type="blank" preserve="1"><p:cSld name="Vide">${emptyTree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`),
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`),
    'ppt/theme/theme1.xml': strToU8(theme(D.name)),
    'ppt/theme/theme2.xml': strToU8(theme(`${D.name} — notes`)),
    'ppt/notesMasters/notesMaster1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notesMaster ${ns}><p:cSld><p:bg><p:bgPr>${fill(C.white)}<a:effectLst/></p:bgPr></p:bg>${emptyTree}</p:cSld>${CLR_MAP}<p:notesStyle><a:lvl1pPr><a:defRPr sz="1200"/></a:lvl1pPr></p:notesStyle></p:notesMaster>`),
    'ppt/notesMasters/_rels/notesMaster1.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/theme" Target="../theme/theme2.xml"/></Relationships>`),
  };
  if (logo) files['ppt/media/dossier-logo.png'] = logo.png;
  parts.forEach((p, i) => {
    const n = i + 1;
    files[`ppt/slides/slide${n}.xml`] = strToU8(p.xml);
    files[`ppt/slides/_rels/slide${n}.xml.rels`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdNotes" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/>${logo ? `<Relationship Id="${LOGO_RID}" Type="${REL}/image" Target="../media/dossier-logo.png"/>` : ''}${p.charts.map((_, k) => `<Relationship Id="rIdChart${k + 1}" Type="${CHART_REL}" Target="../charts/chart${n}_${k + 1}.xml"/>`).join('')}</Relationships>`,
    );
    p.charts.forEach((c, k) => (files[`ppt/charts/chart${n}_${k + 1}.xml`] = strToU8(c)));
    const paras = timed[i]!.split('\n').map((l) => `<a:p><a:r><a:rPr lang="fr-FR" sz="1200" dirty="0"/><a:t>${esc(l)}</a:t></a:r></a:p>`).join('');
    files[`ppt/notesSlides/notesSlide${n}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes ${ns}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4343400"/><a:ext cx="5486400" cy="4114800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`,
    );
    files[`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/notesMaster" Target="../notesMasters/notesMaster1.xml"/><Relationship Id="rId2" Type="${REL}/slide" Target="../slides/slide${n}.xml"/></Relationships>`,
    );
  });
  return zipSync(files);
}

export const deckSlideCount = (d: Dossier): number => 4 + d.chapters.length * 2 + 2 + 2; // indicative
export type { Chapter };
