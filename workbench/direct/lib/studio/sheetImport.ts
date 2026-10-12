// IMPORT D'UNE PLANCHE DE PERSONNAGE — une image fond vert (le personnage dans plusieurs poses) est découpée dans le
// navigateur : fond vert retiré, poses séparées et étiquetées (neutre, accuse, choc, haussement, rire) ; le VISAGE de
// chaque pose est mesuré sur le dessin (lèvres, menton, yeux : détecteur de visage MediaPipe, puis couture des lèvres et
// blanc des yeux relevés sur les pixels) pour que l'acteur parle avec sa propre bouche et cligne de ses propres yeux.
// Chaque pose et la planche entière sont rangées dans les fichiers du studio. 0 $, aucun appel payant.
import { blobs } from './blobs';
import { faceKit, visionKit } from './bodyDetect';
import { chromaMask, galleryBoxes, isolateFigure, keyOut, mouthOf, poseBoxes, poseKinds, readingOrder, sheetBoxes, type Box } from '../../../server/jev/studio/actor/sheet';
import { FACE_IDX, faceRig, facingOf, type Pt } from '../../../server/jev/studio/actor/face2d';
import type { SheetPose } from '../../../server/jev/studio/actor/cast3d';
import { bodyFromLandmarks } from '../../../server/jev/studio/actor/puppetMotion';

/** Face landmarks measured beforehand on a sheet (pixels of the whole sheet, the FACE_IDX points in order). */
export interface SheetFaceMarks {
  pts: number[];
}
/** Body landmarks measured beforehand (pixels of the whole sheet, [x, y, visibility] × 33). */
export interface SheetBodyMarks {
  pts: number[];
}
export interface SheetImport {
  sourceAssetId: string;
  poses: SheetPose[];
  /** Poses whose face was measured (they talk and blink); the others keep the art still. */
  rigged: number;
}

const marksFn = (m: SheetFaceMarks, dx = 0, dy = 0) => {
  const at = new Map<number, Pt>();
  FACE_IDX.forEach((k, i) => {
    const x = m.pts[i * 2];
    const y = m.pts[i * 2 + 1];
    if (x !== undefined && y !== undefined) at.set(k, [x - dx, y - dy]);
  });
  return (i: number) => at.get(i);
};

export async function importSheet(file: Blob, key: string, o: { gallery?: boolean; faces?: SheetFaceMarks[]; bodies?: SheetBodyMarks[] } = {}): Promise<SheetImport> {
  const bmp = await createImageBitmap(file);
  // Large sheets are read at most 2048 px wide (enough for a 9:16 film, fast in the browser).
  const k = Math.min(1, 2048 / bmp.width);
  const W = Math.round(bmp.width * k);
  const H = Math.round(bmp.height * k);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, W, H);
  bmp.close();
  const img = g.getImageData(0, 0, W, H);
  const mask = chromaMask(img.data, W, H);
  // A sheet: one character in several poses, left to right. A gallery: one character per figure, in reading order.
  // Gallery figures often touch (an arm on the neighbour): rows, then the valleys between bodies.
  const gallery = () => {
    const a = galleryBoxes(mask, W, H);
    const b = readingOrder(poseBoxes(mask, W, H), H);
    return a.length >= b.length ? a : b;
  };
  const boxes: Box[] = o.gallery ? gallery() : sheetBoxes(mask, W, H);
  if (!boxes.length) throw new Error('aucun personnage trouvé sur fond vert dans cette image');
  const kinds = o.gallery ? boxes.map(() => 'neutre' as const) : poseKinds(boxes.length);
  const stamp = Date.now().toString(36);
  const sourceAssetId = `sheet-${key}-${stamp}`;
  await blobs.put(sourceAssetId, file);
  const poses: SheetPose[] = [];
  // Landmarks measured beforehand (scaled to the decoded size), else the face detector of the studio, live.
  const pre = (o.faces ?? []).map((m) => ({ pts: m.pts.map((v) => v * k) }));
  const kit = pre.length ? null : await Promise.race([faceKit().catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), 20_000))]);
  // The skeletons: measured beforehand, else the body detector of the studio (BlazePose), live.
  const preB = (o.bodies ?? []).map((m) => ({ pts: m.pts.map((v, i) => (i % 3 === 2 ? v : v * k)) }));
  const bodyKit = preB.length ? null : await Promise.race([visionKit().catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), 25_000))]);
  let rigged = 0;
  for (const [i, b] of boxes.entries()) {
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    const cut = document.createElement('canvas');
    cut.width = w;
    cut.height = h;
    const cg = cut.getContext('2d', { willReadFrequently: true })!;
    const part = g.getImageData(b.x0, b.y0, w, h);
    keyOut(part.data, w, h);
    // A piece of the NEIGHBOUR pose / figure crossing the cut (a pointing hand, a stick) is removed.
    isolateFigure(part.data, w, h);
    cg.putImageData(part, 0, 0);
    const png = await new Promise<Blob>((ok, ko) => cut.toBlob((x) => (x ? ok(x) : ko(new Error('découpe impossible'))), 'image/png'));
    const assetId = `pose-${key}-${stamp}-${i}`;
    await blobs.put(assetId, png);
    const mouth = mouthOf(mask, W, H, b);
    let lm: ((i: number) => Pt | undefined) | null = null;
    // Measured beforehand: the face whose nose falls in this figure.
    const mine = pre.find((m) => {
      const n = marksFn(m)(1);
      return !!n && n[0] >= b.x0 && n[0] < b.x1 && n[1] >= b.y0 && n[1] < b.y1;
    });
    if (mine) lm = marksFn(mine, b.x0, b.y0);
    else if (kit) {
      // The head: top third of the figure around its axis, enlarged on grey (the detector wants a big face); other
      // framings when the first one finds nothing (a long beard, a child's small head).
      for (const [fr, wr] of [
        [0.32, 1.4],
        [0.24, 1.25],
        [0.4, 1.6],
        [0.2, 1.1],
      ] as const) {
        try {
          const hh = Math.max(16, Math.round(h * fr));
          const ax = b.x0 + mouth[0] * w;
          const cw = Math.round(Math.min(w + 40, hh * wr));
          const sx = Math.round(ax - cw / 2);
          const K = Math.min(3, 1024 / Math.max(cw, hh));
          const head = document.createElement('canvas');
          head.width = Math.round(cw * K);
          head.height = Math.round(hh * K);
          const hg = head.getContext('2d', { willReadFrequently: true })!;
          hg.fillStyle = '#9a9a9a';
          hg.fillRect(0, 0, head.width, head.height);
          hg.imageSmoothingQuality = 'high';
          hg.drawImage(cut, sx - b.x0, 0, cw, hh, 0, 0, head.width, head.height);
          const f = kit.detect(head).faceLandmarks[0];
          if (!f) continue;
          const at = new Map<number, Pt>();
          for (const idx of FACE_IDX) {
            const p = f[idx];
            if (p) at.set(idx, [sx - b.x0 + p.x * cw, p.y * hh]);
          }
          lm = (q) => at.get(q);
          break;
        } catch {
          /* next framing */
        }
      }
    }
    // The skeleton of this figure: the measured one whose shoulders fall in it, else BlazePose on the figure alone.
    let body = null as ReturnType<typeof bodyFromLandmarks>;
    const mineB = preB.find((m) => {
      const x = (m.pts[11 * 3]! + m.pts[12 * 3]!) / 2;
      const y = (m.pts[11 * 3 + 1]! + m.pts[12 * 3 + 1]!) / 2;
      return x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;
    });
    if (mineB) body = bodyFromLandmarks(mineB.pts.map((v, i) => (i % 3 === 0 ? v - b.x0 : i % 3 === 1 ? v - b.y0 : v)), w, h);
    else if (bodyKit) {
      try {
        const pad = Math.round(h * 0.08);
        const c2 = document.createElement('canvas');
        c2.width = w + pad * 2;
        c2.height = h + pad * 2;
        const g2 = c2.getContext('2d')!;
        g2.fillStyle = '#9a9a9a';
        g2.fillRect(0, 0, c2.width, c2.height);
        g2.drawImage(cut, pad, pad);
        const L = bodyKit.pose.detect(c2).landmarks[0];
        if (L) body = bodyFromLandmarks(L.flatMap((q) => [q.x * c2.width - pad, q.y * c2.height - pad, (q as { visibility?: number }).visibility ?? 1]), w, h);
      } catch {
        /* rigid drawing */
      }
    }
    const face = lm ? faceRig(part, lm) : null;
    const facing = lm ? facingOf(lm) : undefined;
    if (face) rigged++;
    const m: [number, number] = face ? [Math.round(((face.l[0] + face.r[0]) / 2) * 1000) / 1000, Math.round(face.seam[1] * 1000) / 1000] : mouth;
    poses.push({ kind: kinds[i]!, assetId, w, h, mouth: m, ...(facing !== undefined ? { facing } : {}), ...(face ? { face } : {}), ...(body ? { body } : {}) });
  }
  return { sourceAssetId, poses, rigged };
}
