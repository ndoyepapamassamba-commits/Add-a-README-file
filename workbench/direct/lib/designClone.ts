// DASHBOARD CLONE in the browser: load the chosen image, measure it (dashClone), let a vision model LABEL the numbered
// panels (set-of-marks), render the reproduction with the chat's own data (dashRender), rasterise it and measure how
// close it is to the image. The vision model only labels; geometry and colours come from the pixels.
import { BOXES_PROMPT, buildSpec, detectLayout, fidelityScore, parseBoxes, parseSom, SOM_PROMPT, withVisionBoxes, type DashSpec, type PanelKind } from '../../server/services/dashClone';
import { cloneData, renderCloneSvg, type CloneData } from '../../server/services/dashRender';
import { DataCore, isDataFile } from '../../server/services/dataCore';
import { askVision, imageBlob } from './designWeb';
import { useStore } from './store';
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
export async function cloneDesign(url: string, onStep: (s: string) => void = () => {}): Promise<ClonedDesign> {
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
  let som = null;
  let labelledBy: string | null = null;
  // Ambiguous pixels (photo, mock-up, blurry image, no visible borders): the vision model draws the boxes, the pixels
  // refine their edges and give the colours.
  if (det.score < 0.55 || det.panels.length < 2) {
    try {
      onStep('délimitation des panneaux par le modèle vision…');
      const r = await askVision(BOXES_PROMPT, await gridded(dataUrl, w, h), 1500);
      const vb = parseBoxes(r.content);
      if (vb && vb.panels.length >= 2) {
        const v = withVisionBoxes(px, w, h, det, vb);
        det = v.det;
        som = v.som;
        labelledBy = r.model;
      }
    } catch {
      /* keep the pixel segmentation */
    }
  }
  if (!det.panels.length) throw new Error('Aucun panneau n’a pu être isolé dans cette image : choisissez un tableau de bord plus net.');
  if (!som) {
    try {
      onStep(`identification des ${det.panels.length} panneaux par le modèle vision…`);
      const r = await askVision(SOM_PROMPT(det.panels.length), await annotate(dataUrl, w, h, det.panels), 700);
      som = parseSom(r.content);
      labelledBy = som ? r.model : null;
    } catch {
      // No vision model answered: the pixel classifier labels the panels.
    }
  }
  return { spec: buildSpec(px, w, h, det, som, url.startsWith('data:') ? undefined : url), source: dataUrl, width: w, height: h, px, labelledBy };
}

/** Rasterise an SVG to RGBA pixels and PNG bytes at a given size. */
export function rasterise(svg: string, w: number, h: number): Promise<{ px: Uint8ClampedArray; png: Uint8Array; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = canvas(w, h);
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, w, h);
      const url = c.toDataURL('image/png');
      const bin = atob(url.split(',')[1]!);
      const png = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) png[i] = bin.charCodeAt(i);
      resolve({ px: g.getImageData(0, 0, w, h).data, png, dataUrl: url });
    };
    img.onerror = () => reject(new Error('rendu de la reproduction impossible'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
/** Visual similarity (0–100) between the source image and the reproduction. */
export async function measureFidelity(c: ClonedDesign, data: CloneData): Promise<number> {
  const svg = renderCloneSvg(c.spec, data, c.width);
  const r = await rasterise(svg, c.width, c.height);
  return fidelityScore(c.px, r.px, c.width, c.height, c.spec.page);
}

/** The data of the chat for the preview: its latest data file (attachment), else a neutral sample. */
export function previewData(sid: string | null, title = 'Aperçu avec vos données'): { data: CloneData; from: string | null } {
  if (sid) {
    const files = Object.values(filesFor(sid, sessionAllow(sid)))
      .filter((f) => isDataFile(f.path) && !f.path.startsWith('outputs/'))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    for (const f of files.slice(0, 3)) {
      try {
        const ds = new DataCore().parseBytes(f.path, bytesOf(f), null);
        if (ds.rows.length) return { data: cloneData(title, ds.columns, ds.rows as Record<string, unknown>[]), from: f.path };
      } catch {
        /* next file */
      }
    }
  }
  const cats = ['Nord', 'Sud', 'Est', 'Ouest', 'Centre'];
  const rows = cats.flatMap((c, i) => [1, 2, 3, 4, 5, 6].map((m) => ({ mois: `2025-0${m}-15`, region: c, montant: 400 + ((i * 7 + m * 13) % 9) * 120, volume: 10 + ((i * 5 + m * 3) % 7) * 4 })));
  return { data: cloneData(title, ['mois', 'region', 'montant', 'volume'], rows), from: null };
}
export const KIND_LABEL: Record<PanelKind, string> = { kpi: 'Indicateurs', bar: 'Colonnes', hbar: 'Barres horizontales', line: 'Courbe', area: 'Aire', pie: 'Camembert', donut: 'Anneau', gauge: 'Jauge', table: 'Tableau', text: 'Texte', title: 'Titre', map: 'Carte', image: 'Image', filter: 'Filtre' };
