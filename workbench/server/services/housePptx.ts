// PowerPoint export in the locked house design (houseDesign.ts): navy title slide with a gold filet, navy header band
// + gold filet on every content slide, blue table headers, ice footer, Segoe UI / Consolas. Built from Markdown
// (# / ## = a slide; bullets, numbered lists, tables and paragraphs fill it). No colour or font parameter exists.
import { strToU8, zipSync } from 'fflate';
import { DESIGN } from './houseDesign';
import { fmtDateFr } from './houseStyle';

const C = DESIGN.color;
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
  const open = (t: string) => {
    st.cur = { title: clean(t), blocks: [] };
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
      if (h[1]!.length <= 2 || !st.cur) open(h[2]!);
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
    else c.blocks.push({ k: 'p', text: clean(l) });
  }
  // Continuation: at most 9 bullet / paragraph lines or 9 table rows per slide.
  const out: Slide[] = [];
  for (const s of slides) {
    let part: Slide = { title: s.title, blocks: [] };
    let used = 0;
    const flush = () => {
      if (part.blocks.length) out.push(part);
      part = { title: `${s.title} (suite)`, blocks: [] };
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
  `<a:r><a:rPr lang="fr-FR" sz="${Math.round(o.sz * 100)}" b="${o.b ? 1 : 0}" dirty="0">${fill(o.color)}<a:latin typeface="${o.font ?? DESIGN.font.ui}"/><a:cs typeface="${o.font ?? DESIGN.font.ui}"/></a:rPr><a:t>${esc(t)}</a:t></a:r>`;
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
    `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="${header ? 'ctr' : numeric ? 'r' : 'l'}"/>${run(t, { sz: header ? 12 : 11, color: header ? C.white : C.text, b: header, font: !header && numeric ? DESIGN.font.mono : DESIGN.font.ui })}</a:p></a:txBody><a:tcPr marL="72000" marR="72000" marT="36000" marB="36000" anchor="ctr"><a:lnL w="9525">${fill(C.line)}</a:lnL><a:lnR w="9525">${fill(C.line)}</a:lnR><a:lnT w="9525">${fill(C.line)}</a:lnT><a:lnB w="9525">${fill(C.line)}</a:lnB>${fill(header ? C.blue : C.white)}</a:tcPr></a:tc>`;
  const isNum = (s: string) => /^-?[\d\s.,]+%?$/.test(s.trim()) && /\d/.test(s);
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${++nid}" name="Tableau"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cw * n}" cy="${rh * (rows.length + 1)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${head.map(() => `<a:gridCol w="${cw}"/>`).join('')}</a:tblGrid><a:tr h="${rh}">${head.map((t) => cell(t, true, false)).join('')}</a:tr>${rows.map((r) => `<a:tr h="${rh}">${head.map((_, i) => cell(r[i] ?? '', false, isNum(r[i] ?? ''))).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

const sld = (shapes: string, bg: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr>${fill(bg)}<a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

export function housePptx(md: string, titleOverride?: string): Uint8Array {
  const { title: deck, slides } = slidesFromMarkdown(md);
  const title = titleOverride || deck;
  const date = fmtDateFr();
  const parts: string[] = [];
  // Title slide: navy field, gold filet, white title, subtle date line.
  nid = 1;
  parts.push(
    sld(
      rect(0, 0, W, H, C.navy, 'Fond') +
        rect(inch(0.7), inch(3.55), inch(4.2), Math.round(0.03 * EMU), C.gold, 'Filet') +
        text(
          inch(0.6),
          inch(1.9),
          W - inch(1.2),
          inch(1.6),
          [para(run(title, { sz: 40, color: C.white, b: true }))],
          'Titre',
          'b',
        ) +
        text(
          inch(0.6),
          inch(3.7),
          W - inch(1.2),
          inch(0.8),
          [para(run(`Édité le ${date}`, { sz: 16, color: C.subtle }))],
          'Sous-titre',
        ) +
        rect(0, H - inch(0.5), W, inch(0.5), C.blue, 'Pied'),
      C.navy,
    ),
  );
  slides.forEach((s, idx) => {
    nid = 1;
    let shapes =
      rect(0, 0, W, inch(1.0), C.navy, 'Bandeau') +
      rect(0, inch(1.0), W, Math.round(0.04 * EMU), C.gold, 'Filet') +
      text(
        inch(0.5),
        inch(0.1),
        W - inch(1.0),
        inch(0.8),
        [para(run(s.title, { sz: 26, color: C.white, b: true }))],
        'Titre',
        'ctr',
      );
    let y = inch(1.3);
    const x = inch(0.6);
    const w = W - inch(1.2);
    const flow: string[] = [];
    const flushText = () => {
      if (flow.length) {
        shapes += text(x, y, w, inch(0.45) * Math.max(2, flow.length), flow.splice(0), 'Texte');
        y += inch(0.5) * 5;
      }
    };
    for (const b of s.blocks) {
      if (b.k === 'table') {
        flushText();
        shapes += table(x, y, w, b.head, b.rows);
        y += inch(0.42) * (b.rows.length + 1) + inch(0.2);
      } else flow.push(para(run(b.text, { sz: 18, color: C.text }), { bullet: b.k === 'li', spc: 600 }));
    }
    if (flow.length) shapes += text(x, y, w, H - y - inch(0.8), flow, 'Texte');
    shapes +=
      rect(0, H - inch(0.4), W, inch(0.4), C.ice, 'Pied') +
      text(
        inch(0.5),
        H - inch(0.4),
        W - inch(2),
        inch(0.4),
        [para(run(`${title} · ${date}`, { sz: 10, color: C.text2 }))],
        'Source',
        'ctr',
      ) +
      text(
        W - inch(1.5),
        H - inch(0.4),
        inch(1.0),
        inch(0.4),
        [
          para(run(String(idx + 2), { sz: 10, color: C.blue, b: true, font: DESIGN.font.mono }), {
            algn: 'r',
          }),
        ],
        'Numéro',
        'ctr',
      );
    parts.push(sld(shapes, C.white));
  });
  const N = parts.length;
  const ns =
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${parts.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    ),
    'docProps/core.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>MASSAMBA Workbench</dc:creator></cp:coreProperties>`,
    ),
    'ppt/presentation.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${ns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${parts.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    ),
    'ppt/_rels/presentation.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>${parts.map((_, i) => `<Relationship Id="rId${i + 2}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}<Relationship Id="rId${N + 2}" Type="${REL}/theme" Target="theme/theme1.xml"/></Relationships>`,
    ),
    'ppt/slideMasters/slideMaster1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${ns}><p:cSld><p:bg><p:bgPr>${fill(C.white)}<a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="2600" b="1">${fill(C.navy)}<a:latin typeface="${DESIGN.font.ui}"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800">${fill(C.text)}<a:latin typeface="${DESIGN.font.ui}"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800">${fill(C.text)}<a:latin typeface="${DESIGN.font.ui}"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`,
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
    'ppt/theme/theme1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="GOD 3D BLUE ECOBANK"><a:themeElements><a:clrScheme name="BlueEcobank"><a:dk1><a:srgbClr val="${C.text}"/></a:dk1><a:lt1><a:srgbClr val="${C.white}"/></a:lt1><a:dk2><a:srgbClr val="${C.navy}"/></a:dk2><a:lt2><a:srgbClr val="${C.ice}"/></a:lt2><a:accent1><a:srgbClr val="${C.blue}"/></a:accent1><a:accent2><a:srgbClr val="${C.cyan}"/></a:accent2><a:accent3><a:srgbClr val="${C.gold}"/></a:accent3><a:accent4><a:srgbClr val="${C.warn}"/></a:accent4><a:accent5><a:srgbClr val="${C.orange}"/></a:accent5><a:accent6><a:srgbClr val="${C.sky}"/></a:accent6><a:hlink><a:srgbClr val="${C.blue}"/></a:hlink><a:folHlink><a:srgbClr val="${C.navy}"/></a:folHlink></a:clrScheme><a:fontScheme name="Ecobank"><a:majorFont><a:latin typeface="${DESIGN.font.ui}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${DESIGN.font.ui}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`,
    ),
  };
  parts.forEach((x, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = strToU8(x);
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`,
    );
  });
  return zipSync(files);
}
