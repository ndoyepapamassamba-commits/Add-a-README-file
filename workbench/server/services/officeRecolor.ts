/**
 * OFFICE RECOLOR — the design the user picked is enforced on Office files the model wrote ITSELF (Python openpyxl,
 * python-docx, python-pptx, JS), not only on the native exporters. The model tends to reuse the house palette it has
 * seen in its memory; every known house colour (current charter + legacy Ecobank palette) is mapped to the role it
 * plays in the chosen theme, and the UI font is swapped. Pure (bytes in → bytes out), no data is touched: only the
 * style parts (styles, themes, charts, drawings, document / slide XML colour attributes) are rewritten.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { DESIGN, type Design } from './houseDesign';

type Role = 'navy' | 'blue' | 'gold' | 'cyan' | 'ice' | 'panel' | 'line' | 'sky';
/** House colours (current charter + legacy palette seen in old memories) → role in the theme. */
export const HOUSE_HEX: Record<string, Role> = {
  [DESIGN.color.navy]: 'navy',
  [DESIGN.color.blue]: 'blue',
  [DESIGN.color.gold]: 'gold',
  [DESIGN.color.cyan]: 'cyan',
  [DESIGN.color.ice]: 'ice',
  [DESIGN.color.panel]: 'panel',
  [DESIGN.color.line]: 'line',
  [DESIGN.color.sky]: 'sky',
  // Legacy Ecobank palette (navy / Ecobank blue / lime, zebra, total row).
  '00415E': 'navy',
  '005C83': 'blue',
  '8CC63F': 'gold',
  F6FAFC: 'panel',
  E8F5E0: 'ice',
  '0B2545': 'navy',
  '1F4E79': 'blue',
};
const STYLE_PART = /^(xl\/(styles|theme\/|charts\/|drawings\/|worksheets\/)|word\/(styles|theme\/|document|header|footer|numbering)|ppt\/(theme\/|slides\/|slideMasters\/|slideLayouts\/|charts\/))/;

export const isOffice = (path: string) => /\.(xlsx|xlsm|docx|pptx)$/i.test(path);

/** Colour map house → theme (empty when the theme IS the house design). */
export function recolorMap(d: Design): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [hex, role] of Object.entries(HOUSE_HEX)) {
    const to = String(d.color[role] ?? '').toUpperCase();
    if (to && to !== hex.toUpperCase()) map[hex.toUpperCase()] = to;
  }
  return map;
}

/** Rewrite the colours and the UI font of one XML part. Returns the new text and the number of replacements. */
export function recolorXml(xml: string, map: Record<string, string>, fromFont: string, toFont: string): { xml: string; n: number } {
  let n = 0;
  const keys = Object.keys(map);
  let out = xml;
  if (keys.length) {
    // 6-hex (rgb="FF00415E", srgbClr val="00415E", w:color w:val="00415E", fill="#00415E"): replace whole tokens only.
    const re = new RegExp(`(["'#]|FF)(${keys.join('|')})(?=["'])`, 'gi');
    out = out.replace(re, (_m, pre: string, hex: string) => {
      n++;
      return `${pre}${map[hex.toUpperCase()]}`;
    });
  }
  if (fromFont && toFont && fromFont !== toFont) {
    const fr = new RegExp(`(["'])${fromFont.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(["'])`, 'g');
    out = out.replace(fr, (_m, a: string, b: string) => {
      n++;
      return `${a}${toFont}${b}`;
    });
  }
  return { xml: out, n };
}

/** Apply the chosen design to an Office file. Returns null when nothing had to change (or the file is not a zip). */
export function recolorOffice(bytes: Uint8Array, d: Design): { bytes: Uint8Array; replaced: number } | null {
  const map = recolorMap(d);
  const fromFont = DESIGN.font.ui;
  const toFont = d.font.ui;
  if (!Object.keys(map).length && fromFont === toFont) return null;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return null;
  }
  let replaced = 0;
  for (const [name, data] of Object.entries(entries)) {
    if (!name.endsWith('.xml') || !STYLE_PART.test(name)) continue;
    const r = recolorXml(strFromU8(data), map, fromFont, toFont);
    if (r.n) {
      entries[name] = strToU8(r.xml);
      replaced += r.n;
    }
  }
  if (!replaced) return null;
  return { bytes: zipSync(entries, { level: 6 }), replaced };
}
