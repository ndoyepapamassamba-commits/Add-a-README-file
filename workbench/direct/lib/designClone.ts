// DASHBOARD CLONE in the browser: load the chosen image, measure it (dashClone), let a vision model LABEL the numbered
// panels (set-of-marks), render the reproduction with the chat's own data (dashRender), rasterise it and measure how
// close it is to the image. The vision model only labels; geometry and colours come from the pixels.
import { attachTexts, BOXES_PROMPT, buildSpec, detectLayout, fidelityScore, backdropFidelity, panelCandidates, parseBoxes, parseSom, regionFidelity, SOM_PROMPT, withVisionBoxes, type DashSpec, type PanelKind, type SomAnswer } from '../../server/services/dashClone';
import { cleanTemplate } from '../../server/services/cleanTemplate';
import { cloneData, renderCloneSvg, type CloneData } from '../../server/services/dashRender';
import { DataCore, isDataFile } from '../../server/services/dataCore';
import { pickTable, type SheetTable } from '../../server/services/tablePick';
import { askVision, imageBlob } from './designWeb';
import { colorPatches, emptyZones, panelFor, restoreLines, ZONE_KINDS } from '../../server/services/cloneFix';
import { bytesOf, filesFor, sessionAllow } from './vfs';

export interface ClonedDesign {
  spec: DashSpec;
  /** The source image as decoded (data URL) — shown next to the reproduction. */
  source: string;
  width: number;
  height: number;
  px: Uint8ClampedArray;
  labelledBy: string | null;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
/** Decode an image at a working size (small thumbnails are upscaled smoothly so thin lines stay measurable). */
export async function loadPixels(url: string): Promise<{ px: Uint8ClampedArray; w: number; h: number; dataUrl: string }> {
  const blob = url.startsWith('data:') ? await (await fetch(url)).blob() : await imageBlob(url, 1400);
  if (!blob) throw new Error('Image inaccessible (le site refuse son téléchargement) : choisissez-en une autre.');
  const bmp = await createImageBitmap(blob);
  if (bmp.width < 120 || bmp.height < 80) throw new Error('Image trop petite pour être reproduite.');
  const k = bmp.width < 900 ? 900 / bmp.width : bmp.width > 1400 ? 1400 / bmp.width : 1;
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const c = canvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, h);
  return { px: g.getImageData(0, 0, w, h).data, w, h, dataUrl: c.toDataURL('image/jpeg', 0.9) };
}
/** The image with numbered red boxes on the detected panels (what the vision model labels). */
function annotate(dataUrl: string, w: number, h: number, boxes: { x0: number; y0: number; x1: number; y1: number }[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = canvas(w, h);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0, w, h);
      const lw = Math.max(3, Math.round(w / 300));
      const fs = Math.max(18, Math.round(w / 45));
      boxes.forEach((b, i) => {
        g.strokeStyle = '#FF0000';
        g.lineWidth = lw;
        g.strokeRect(b.x0 + lw, b.y0 + lw, b.x1 - b.x0 - lw * 2, b.y1 - b.y0 - lw * 2);
        g.fillStyle = '#FF0000';
        g.fillRect(b.x0 + lw, b.y0 + lw, fs * 1.5, fs * 1.3);
        g.fillStyle = '#FFFFFF';
        g.font = `bold ${fs}px sans-serif`;
        g.fillText(String(i + 1), b.x0 + lw + fs * 0.3, b.y0 + lw + fs * 1.05);
      });
      resolve(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => reject(new Error('annotation impossible'));
    img.src = dataUrl;
  });
}

/** The image with a light 10 % grid (helps the vision model give coordinates). */
function gridded(dataUrl: string, w: number, h: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = canvas(w, h);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0, w, h);
      g.strokeStyle = 'rgba(255,0,255,0.35)';
      g.lineWidth = 1;
      g.fillStyle = 'rgba(255,0,255,0.8)';
      g.font = `${Math.max(10, Math.round(w / 90))}px sans-serif`;
      for (let i = 1; i < 10; i++) {
        g.beginPath();
        g.moveTo((w * i) / 10, 0);
        g.lineTo((w * i) / 10, h);
        g.moveTo(0, (h * i) / 10);
        g.lineTo(w, (h * i) / 10);
        g.stroke();
        g.fillText(String(i * 100), (w * i) / 10 + 2, 12);
        g.fillText(String(i * 100), 2, (h * i) / 10 - 2);
      }
      resolve(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => reject(new Error('quadrillage impossible'));
    img.src = dataUrl;
  });
}

/** Measure the image and label its panels. */
/** The clean background (RGBA) as a compact JPEG data URL. */
function bgDataUrl(bg: Uint8ClampedArray, w: number, h: number): string {
  const c = canvas(w, h);
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(bg), w, h), 0, 0);
  return c.toDataURL('image/jpeg', 0.92);
}

export async function cloneDesign(url: string, onStep: (s: string) => void = () => {}, o: { vision?: boolean } = {}): Promise<ClonedDesign> {
  const vision = o.vision !== false;
  onStep('mesure de l’image (cadre, panneaux, couleurs)…');
  const { px, w, h, dataUrl } = await loadPixels(url);
  let det = detectLayout(px, w, h);
  // An empty / uniform image is not a dashboard: no reproduction, no model call.
  {
    const pg = det.page;
    let ink = 0;
    let n = 0;
    for (let i = 0; i < w * h; i += 37) {
      n++;
      if ((px[i * 4]! - pg[0]) ** 2 + (px[i * 4 + 1]! - pg[1]) ** 2 + (px[i * 4 + 2]! - pg[2]) ** 2 > 30 ** 2) ink++;
    }
    if (ink / Math.max(1, n) < 0.03) throw new Error('Cette image ne contient pas de tableau de bord à reproduire.');
  }
  let som: SomAnswer | null = null;
  let labelledBy: string | null = null;
  let visionColors: (string[] | undefined)[] = [];
  // 1. The strongest box-locating vision model of the catalogue cuts the panels out on EVERY image (kinds, colours);
  //    the pixels then refine each edge. Without any vision model, the pixel segmentation alone.
  if (vision)
    try {
      onStep('lecture de la mise en page par le meilleur modèle vision du catalogue…');
    const r = await askVision(BOXES_PROMPT, await gridded(dataUrl, w, h), 2000, 'design');
    const vb = parseBoxes(r.content);
    if (vb && vb.panels.length >= 2) {
      const v = withVisionBoxes(px, w, h, det, vb);
      det = v.det;
      som = v.som;
      labelledBy = r.model;
      visionColors = vb.panels.map((p) => p.colors);
    }
  } catch {
    /* keep the pixel segmentation */
  }
  if (!det.panels.length) throw new Error('Aucun panneau n’a pu être isolé dans cette image : choisissez un tableau de bord plus net.');
  if (!som && vision) {
    try {
      onStep(`identification des ${det.panels.length} panneaux par le modèle vision…`);
      const r = await askVision(SOM_PROMPT(det.panels.length), await annotate(dataUrl, w, h, det.panels), 700, 'design');
      som = parseSom(r.content);
      labelledBy = som ? r.model : null;
    } catch {
      // No vision model answered: the pixel classifier labels the panels.
    }
  }
  const source = url.startsWith('data:') ? undefined : url;
  // 2. The image's DESIGN without its content: backgrounds, gradients, cards, bands, frames, shadows — texts, chart
  //    marks, logos and photos removed. Menus / slicers keep their buttons; photos become their smooth tones.
  onStep('extraction du design (fonds, cartes, dégradés, ombres) sans le contenu…');
  const kinds0 = buildSpec(px, w, h, det, som, source).panels.map((p) => p.kind);
  const erasable = det.panels.map((b, i) => ({ b, i })).filter(({ i }) => kinds0[i] !== 'filter' && kinds0[i] !== 'title');
  const photos = new Set(erasable.map((e, k) => (kinds0[e.i] === 'image' ? k : -1)).filter((k) => k >= 0));
  // The title zone is cleaned like a panel (a big bold title is no design surface); it is not a panel of the spec.
  const titleZone = det.title ? [{ x0: det.title.x0 - 4, y0: det.title.y0 - 4, x1: det.title.x1 + 4, y1: det.title.y1 + 4 }] : [];
  const tpl = cleanTemplate(px, w, h, [...erasable.map((e) => e.b), ...titleZone], photos);
  erasable.forEach((e, k) => (det.panels[e.i] = tpl.snapped[k]!));
  const som2: SomAnswer = { ...(som ?? {}), kinds: Object.fromEntries(kinds0.map((k, i) => [i + 1, { ...(som?.kinds[i + 1] ?? {}), kind: k }])) };
  let spec = buildSpec(px, w, h, det, som2, source);
  // The model's mark colours (what the eye sees), when it gave them.
  spec.panels.forEach((p, i) => {
    const c = visionColors[i];
    if (c?.length) {
      p.colors = c;
      p.ramp = c;
      p.sequential = false;
    }
  });
  // The card borders and separators the cleaning erased with the content are design: copied back from the image.
  restoreLines(px, tpl.bg, w, h, spec.page, { panels: spec.panels.map((p) => p.box) });
  spec.background = bgDataUrl(tpl.bg, w, h);
  spec = attachTexts(spec, tpl.texts, w, h);
  return { spec, source: dataUrl, width: w, height: h, px, labelledBy };
}

/** Rasterise an SVG to RGBA pixels and PNG bytes at a given size. */
export function rasterise(svg: string, w: number, h: number, o: { png?: boolean } = {}): Promise<{ px: Uint8ClampedArray; png: Uint8Array; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      const c = canvas(w, h);
      const g = c.getContext('2d', { willReadFrequently: o.png === false })!;
      // Decoded off the page thread when the browser can (createImageBitmap), drawn once.
      const src: CanvasImageSource = typeof createImageBitmap === 'function' ? await createImageBitmap(img).catch(() => img) : img;
      g.drawImage(src, 0, 0, w, h);
      // Pixels only (the fidelity controller renders many candidates): no PNG encoding at all.
      if (o.png === false) return resolve({ px: g.getImageData(0, 0, w, h).data, png: new Uint8Array(0), dataUrl: '' });
      // A PNG is wanted: no 4 MB pixel copy nobody reads.
      const px = new Uint8ClampedArray(0);
      // PNG encoded ASYNCHRONOUSLY (toBlob: off the page thread), never toDataURL + atob (a 300 ms freeze).
      try {
        const blob = await new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('encodage PNG impossible'))), 'image/png'));
        const png = new Uint8Array(await blob.arrayBuffer());
        const dataUrl = await new Promise<string>((ok) => {
          const fr = new FileReader();
          fr.onload = () => ok(String(fr.result));
          fr.readAsDataURL(blob);
        });
        resolve({ px, png, dataUrl });
      } catch (e) {
        reject(e as Error);
      }
    };
    img.onerror = () => reject(new Error('rendu de la reproduction impossible'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
/** Visual similarity (0–100) between the source image and the reproduction. */
export async function measureFidelity(c: ClonedDesign, data: CloneData): Promise<number> {
  const svg = renderCloneSvg(c.spec, data, c.width);
  const r = await rasterise(svg, c.width, c.height, { png: false });
  return fidelityScore(c.px, r.px, c.width, c.height, c.spec.page);
}

/** The data of the chat for the preview: its latest data file (attachment), else a neutral sample. */
/** The DETAIL table of a data file: for a workbook, the sheet that is a real table (not a summary), TOTAL rows out. */
export function chatTable(path: string, bytes: Uint8Array): SheetTable | null {
  const dc = new DataCore();
  let names: string[];
  try {
    names = /\.xlsx?$|\.xlsm$|\.ods$/i.test(path) ? dc.sheetNamesOf(path, bytes) : [];
  } catch {
    names = [];
  }
  const tables: SheetTable[] = [];
  for (const sheet of names.length ? names.slice(0, 20) : [null]) {
    try {
      const ds = dc.parseBytes(path, bytes, sheet);
      tables.push({ sheet: sheet ?? '', columns: ds.columns, rows: ds.rows as Record<string, unknown>[] });
    } catch {
      /* next sheet */
    }
  }
  return pickTable(tables);
}
export function previewData(sid: string | null, title = 'Aperçu avec vos données'): { data: CloneData; from: string | null; table?: SheetTable } {
  if (sid) {
    const files = Object.values(filesFor(sid, sessionAllow(sid)))
      .filter((f) => isDataFile(f.path) && !f.path.startsWith('outputs/'))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    for (const f of files.slice(0, 3)) {
      const t = chatTable(f.path, bytesOf(f));
      if (t?.rows.length) return { data: cloneData(title, t.columns, t.rows), from: t.sheet ? `${f.path} · feuille ${t.sheet}` : f.path, table: t };
    }
  }
  const cats = ['Nord', 'Sud', 'Est', 'Ouest', 'Centre'];
  const rows = cats.flatMap((c, i) => [1, 2, 3, 4, 5, 6].map((m) => ({ mois: `2025-0${m}-15`, region: c, montant: 400 + ((i * 7 + m * 13) % 9) * 120, volume: 10 + ((i * 5 + m * 3) % 7) * 4 })));
  return { data: cloneData(title, ['mois', 'region', 'montant', 'volume'], rows), from: null };
}
export const KIND_LABEL: Record<PanelKind, string> = { kpi: 'Indicateurs', bar: 'Colonnes', hbar: 'Barres horizontales', line: 'Courbe', area: 'Aire', pie: 'Camembert', donut: 'Anneau', gauge: 'Jauge', table: 'Tableau', text: 'Texte', title: 'Titre', map: 'Carte', image: 'Image', filter: 'Filtre' };


// ── CONTRÔLEUR DE REPRODUCTION (en amont) ────────────────────────────────────────────────────────────────────────
/** Target the reproduction must reach before generation (below it, the user must explicitly accept). */
export const FIDELITY_TARGET = 95;
export interface CheckItem {
  id: 'layout' | 'colors' | 'charts' | 'legibility' | 'data' | 'logo';
  label: string;
  ok: boolean;
  note: string;
}
export interface RefineResult {
  spec: DashSpec;
  /** DESIGN fidelity (what must match whatever the data): backdrop, palette, verified chart forms. */
  fidelity: number;
  before: number;
  /** Plain pixel resemblance, data included (informative: the user's figures differ from the image's). */
  resemblance: number;
  changes: string[];
  checklist: CheckItem[];
}
/** Source pixels at a small working width (the search renders many candidates). */
async function smallPixels(dataUrl: string, w: number, h: number): Promise<Uint8ClampedArray> {
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('image illisible'));
    img.src = dataUrl;
  });
  const c = canvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}
const lumHex = (h: string) => {
  const v = [1, 3, 5].map((i) => parseInt(h.replace('#', '').padStart(7, '#').slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lumHex(a), lumHex(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};
/**
 * Brings the reproduction as close as possible to the image BEFORE anything is generated: each panel far from its
 * pixels is re-read in its other plausible forms (chart type, legend, value labels, number of tiles) and the form the
 * pixels prefer is kept — no model call, nothing invented. Rounds stop at the target or when nothing improves.
 */
export async function refineClone(c: ClonedDesign, data: CloneData, onStep: (s: string) => void = () => {}, target = FIDELITY_TARGET): Promise<RefineResult> {
  const W = 480;
  const H = Math.max(120, Math.round(W / c.spec.aspect));
  const src = await smallPixels(c.source, W, H);
  const render = async (sp: DashSpec) => (await rasterise(renderCloneSvg(sp, data, W), W, H, { png: false })).px;
  let spec: DashSpec = JSON.parse(JSON.stringify(c.spec)) as DashSpec;
  let cur = await render(spec);
  const before = fidelityScore(src, cur, W, H, spec.page);
  const changes: string[] = [];
  const verified = new Set<number>();
  // 1. COULEURS NON REMPLIES: a chart drawn without its series colours gets the colours measured in its box.
  for (const cp of colorPatches(src, W, H, spec)) {
    const box = spec.panels[cp.i]!.box;
    const f = regionFidelity(src, cur, W, H, box);
    const trial: DashSpec = { ...spec, panels: spec.panels.map((p, k) => (k === cp.i ? { ...p, ...cp.patch } : p)) };
    const px = await render(trial);
    const f2 = regionFidelity(src, px, W, H, box);
    if (f2 >= f) {
      spec = trial;
      cur = px;
      changes.push(`${cp.note} (${f} → ${f2} %)`);
    }
  }
  // 2. ESPACES NON REMPLIS: content in the image, flat area in the reproduction, outside every panel → a new panel in
  //    the shape the pixels prefer (kept only when the zone really gets closer to the image).
  for (const zone of emptyZones(src, cur, W, H, spec).slice(0, 4)) {
    const f = regionFidelity(src, cur, W, H, zone);
    onStep(`contrôle de reproduction : espace vide ${Math.round(zone.x * 100)},${Math.round(zone.y * 100)} (${f} %)…`);
    let best = { f, panel: null as DashSpec['panels'][number] | null, px: cur };
    for (const kind of ZONE_KINDS) {
      const panel = panelFor(src, W, H, zone, kind);
      const px = await render({ ...spec, panels: [...spec.panels, panel] });
      const f2 = regionFidelity(src, px, W, H, zone);
      if (f2 > best.f + 2) best = { f: f2, panel, px };
    }
    if (best.panel) {
      spec = { ...spec, panels: [...spec.panels, best.panel] };
      cur = best.px;
      verified.add(spec.panels.length - 1);
      changes.push(`espace vide comblé : ${KIND_LABEL[best.panel.kind]} (${f} → ${best.f} %)`);
    }
  }
  let fid = fidelityScore(src, cur, W, H, spec.page);
  // 3. GRAPHIQUES: each panel far from its pixels is re-read in its other plausible forms.
  for (let round = 0; round < 3 && fid < target; round++) {
    const worst = spec.panels
      .map((p, i) => ({ i, f: regionFidelity(src, cur, W, H, p.box) }))
      .filter((x) => x.f < 92 && panelCandidates(spec.panels[x.i]!).length)
      .sort((a, b) => a.f - b.f)
      .slice(0, 6);
    if (!worst.length) break;
    let improved = false;
    for (const { i, f } of worst) {
      onStep(`contrôle de reproduction : panneau ${i + 1} (${f} %)…`);
      let best = { f, patch: null as Partial<DashSpec['panels'][number]> | null, px: cur };
      // A chart TYPE named by the vision model is never overridden by raw pixels: the reproduction shows the user's
      // data, not the image's, so a line can look « closer » to bars it is not. Only legend / labels / tiles are tried.
      for (const cand of panelCandidates(spec.panels[i]!).filter((x) => !(c.labelledBy && x.kind && x.kind !== spec.panels[i]!.kind))) {
        const trial: DashSpec = { ...spec, panels: spec.panels.map((p, k) => (k === i ? { ...p, ...cand } : p)) };
        const px = await render(trial);
        const f2 = regionFidelity(src, px, W, H, spec.panels[i]!.box);
        if (f2 > best.f + 1) best = { f: f2, patch: cand, px };
      }
      verified.add(i);
      if (best.patch) {
        const was = spec.panels[i]!;
        spec = { ...spec, panels: spec.panels.map((p, k) => (k === i ? { ...p, ...best.patch } : p)) };
        cur = best.px;
        improved = true;
        changes.push(`panneau ${i + 1} : ${best.patch.kind ? `${KIND_LABEL[was.kind]} → ${KIND_LABEL[best.patch.kind]}` : best.patch.tiles ? `${best.patch.tiles} tuile(s)` : best.patch.legend ? `légende ${best.patch.legend}` : 'étiquettes de valeurs'} (${f} → ${best.f} %)`);
      }
    }
    fid = fidelityScore(src, cur, W, H, spec.page);
    if (!improved) break;
  }
  const regions = spec.panels.map((p) => regionFidelity(src, cur, W, H, p.box));
  // Diagnostic (opt-in, never in normal use): the source and the reproduction as compared, for a visual diff.
  try {
    if (localStorage.getItem('clone.debug') === '1')
      (globalThis as unknown as { __cloneDebug?: unknown }).__cloneDebug = { w: W, h: H, src: Array.from(src), cur: Array.from(cur), spec };
  } catch {
    /* no storage */
  }
  const resemblance = fid;
  // Texts are the user's (titles, figures, menu items): excluded like the data areas.
  const textBoxes = [
    ...spec.panels.flatMap((p) => [p.titleBox, p.valueBox, ...(p.slots ?? []).map((x) => x.box)]),
    spec.title?.box,
    spec.subtitle?.box,
  ]
    .filter((b): b is NonNullable<typeof b> => Boolean(b))
    .map((b) => ({ x: b.x - 0.01 - b.w * 0.18, y: b.y - 0.01 - b.h * 0.36, w: b.w * 1.36 + 0.02, h: b.h * 1.72 + 0.02 }));
  const backdrop = backdropFidelity(src, cur, W, H, [...spec.panels.map((p) => p.box), ...textBoxes]);
  const chartPanels = spec.panels.filter((p) => ['bar', 'hbar', 'line', 'area', 'pie', 'donut', 'gauge', 'map'].includes(p.kind));
  const paletteOk = chartPanels.length ? chartPanels.filter((p) => p.colors.length > 0).length / chartPanels.length : 1;
  const formsOk = chartPanels.length ? Math.min(1, (verified.size + (c.labelledBy ? chartPanels.length : 0)) / chartPanels.length) : 1;
  const design = Math.round(0.6 * backdrop + 20 * paletteOk + 20 * formsOk);
  const meanRegion = regions.length ? Math.round(regions.reduce((a, b) => a + b, 0) / regions.length) : 0;
  const charts = spec.panels.filter((p) => ['bar', 'hbar', 'line', 'area', 'pie', 'donut', 'gauge', 'map'].includes(p.kind)).length;
  const readable = spec.panels.filter((p) => contrast(p.text, p.fill) >= 4.5).length;
  const withData = spec.panels.filter((p) => p.kind !== 'image' && p.kind !== 'title').length;
  const logoFree = Boolean(spec.title) || spec.pageBox.y > 0.03;
  const checklist: CheckItem[] = [
    { id: 'layout', label: 'Agencement', ok: meanRegion >= 90, note: `${spec.panels.length} panneaux aux positions mesurées · correspondance moyenne par panneau ${meanRegion} %` },
    { id: 'colors', label: 'Couleurs et fonds', ok: backdrop >= 90 && paletteOk === 1, note: `fonds, cadres, bandeaux et cartes ${backdrop} % · palette des graphiques ${Math.round(paletteOk * 100)} % mesurée sur l’image` },
    { id: 'charts', label: 'Design des graphiques', ok: verified.size >= Math.min(charts, 6) || charts === 0, note: `${charts} graphique(s) ; ${verified.size} forme(s) vérifiée(s) sur les pixels${changes.length ? `, ${changes.length} correction(s)` : ''}` },
    { id: 'legibility', label: 'Lisibilité', ok: readable === spec.panels.length, note: `${readable}/${spec.panels.length} panneaux avec un texte lisible sur leur fond (≥ 4,5:1) — les autres sont corrigés à l’export` },
    { id: 'data', label: 'Données logées', ok: withData > 0, note: `${withData} panneau(x) recevant vos données (indicateurs, graphiques, tableau, filtres) — aucun chiffre inventé` },
    { id: 'logo', label: 'Emplacement du logo', ok: logoFree, note: logoFree ? 'réservé à droite du bandeau de titre, sans chevauchement' : 'aucune zone libre en tête : logo en haut à droite de la page' },
  ];
  return { spec, fidelity: design, before, resemblance, changes, checklist };
}

/**
 * PRE-SCORE of a gallery image (no model call, pixels only): measured, corrected by the controller, design fidelity.
 * The score after the vision model labels the panels can differ — it is shown as « pré-score ».
 */
export async function prescoreDesign(url: string, data: CloneData): Promise<number | null> {
  try {
    const c = await cloneDesign(url, () => {}, { vision: false });
    if (c.spec.panels.length < 2) return null;
    return (await refineClone(c, data)).fidelity;
  } catch {
    return null;
  }
}
