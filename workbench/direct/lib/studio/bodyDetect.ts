// LECTURE LOCALE ET GRATUITE D'UNE IMAGE DE SCÈNE — in the browser (Edge, Chrome…), no key, no paid call, no GPU card
// needed: MediaPipe Tasks Vision (Google, Apache-2.0) runs on WebAssembly (WebGL when available):
//  - PERSONNES: EfficientDet-Lite0 finds each character (box);
//  - SQUELETTE: BlazePose « heavy » on a crop around each character (33 landmarks: eyes, mouth, shoulders, elbows,
//    wrists, hips, knees, ankles, feet) → body2d rig;
//  - DÉTOURAGE: MagicTouch (interactive segmenter) given the torso / thigh / shin points → an exact cut-out per character.
// Models are downloaded once from Google / jsDelivr and kept by the browser cache. Any failure returns null: the caller
// keeps the previous engine (nothing is invented).
import {
  bodyFromLandmarks,
  characterFromBody,
  type BodyRig,
  type Landmark,
} from '../../../server/jev/studio/body2d';
import type { PuppetCharacter, RBox } from '../../../server/jev/studio/puppet';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELS = {
  person:
    'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite',
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
  touch:
    'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/latest/magic_touch.tflite',
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
};
type Img = OffscreenCanvas | HTMLCanvasElement | ImageBitmap | HTMLImageElement;
interface MpMask {
  width: number;
  height: number;
  getAsFloat32Array(): Float32Array;
  close(): void;
}
interface Kit {
  person: {
    detect(i: Img): {
      detections: {
        boundingBox?: { originX: number; originY: number; width: number; height: number };
        categories: { score: number }[];
      }[];
    };
  };
  pose: { detect(i: Img): { landmarks: Landmark[][] } };
  touch: {
    segment(
      i: Img,
      roi: { keypoint: { x: number; y: number } },
    ): { confidenceMasks?: MpMask[]; close?: () => void };
  };
}
let loading: Promise<Kit | null> | null = null;
/** Loads the three models once (GPU delegate first, CPU fallback). */
export function visionKit(): Promise<Kit | null> {
  loading ??= (async () => {
    try {
      const mp = (await import(/* @vite-ignore */ `${MP}/vision_bundle.mjs`)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const files = await mp.FilesetResolver.forVisionTasks(`${MP}/wasm`);
      const make = async (delegate: 'GPU' | 'CPU'): Promise<Kit> => ({
        person: await mp.ObjectDetector.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODELS.person, delegate },
          runningMode: 'IMAGE',
          scoreThreshold: 0.3,
          categoryAllowlist: ['person'],
          maxResults: 6,
        }),
        pose: await mp.PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODELS.pose, delegate },
          runningMode: 'IMAGE',
          numPoses: 1,
          minPoseDetectionConfidence: 0.2,
          minPosePresenceConfidence: 0.2,
        }),
        touch: await mp.InteractiveSegmenter.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODELS.touch, delegate: 'CPU' },
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        }),
      });
      try {
        return await make('GPU');
      } catch {
        return await make('CPU');
      }
    } catch {
      loading = null;
      return null;
    }
  })();
  return loading;
}
/** The face landmarker (478 points: lips, chin, eyes, irises) — loaded once, only when a character sheet is read. */
export interface FaceKit {
  detect(i: Img): { faceLandmarks: { x: number; y: number }[][] };
}
let faceLoading: Promise<FaceKit | null> | null = null;
export function faceKit(): Promise<FaceKit | null> {
  faceLoading ??= (async () => {
    try {
      const mp = (await import(/* @vite-ignore */ `${MP}/vision_bundle.mjs`)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const files = await mp.FilesetResolver.forVisionTasks(`${MP}/wasm`);
      const make = (delegate: 'GPU' | 'CPU'): Promise<FaceKit> =>
        mp.FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODELS.face, delegate },
          runningMode: 'IMAGE',
          numFaces: 1,
          minFaceDetectionConfidence: 0.1,
          minFacePresenceConfidence: 0.1,
        });
      try {
        return await make('GPU');
      } catch {
        return await make('CPU');
      }
    } catch {
      faceLoading = null;
      return null;
    }
  })();
  return faceLoading;
}
const canvasOf = (w: number, h: number): OffscreenCanvas | HTMLCanvasElement =>
  typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
const ctx2d = (c: OffscreenCanvas | HTMLCanvasElement) =>
  c.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;

export interface SceneReading {
  characters: PuppetCharacter[];
  /** One cut-out per character (0..1 coverage, w × h), null where the segmenter gave nothing usable. */
  masks: (Float32Array | null)[];
  w: number;
  h: number;
  ms: number;
}
const iou = (a: RBox, b: RBox) => {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (x * y) / (a.w * a.h + b.w * b.h - x * y || 1);
};
/** The pose of the character in a box (crop with margins → landmarks → rig in image fractions). */
function poseIn(k: Kit, img: OffscreenCanvas | HTMLCanvasElement, box: RBox): BodyRig | null {
  const W = img.width;
  const H = img.height;
  const x0 = Math.max(0, box.x - box.w * 0.25);
  const y0 = Math.max(0, box.y - box.h * 0.08);
  const x1 = Math.min(1, box.x + box.w * 1.25);
  const y1 = Math.min(1, box.y + box.h * 1.08);
  const cw = Math.max(8, Math.round((x1 - x0) * W));
  const ch = Math.max(8, Math.round((y1 - y0) * H));
  const crop = canvasOf(cw, ch);
  ctx2d(crop).drawImage(img, x0 * W, y0 * H, cw, ch, 0, 0, cw, ch);
  const lm = k.pose.detect(crop).landmarks[0];
  return lm ? bodyFromLandmarks(lm, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }) : null;
}
/**
 * Exact cut-out of one character: union of the segmenter's answers for points inside its body (core), plus the hands /
 * forearms / head (extra) — an extra answer larger than `maxExtra` pixels took the background, it is not used.
 */
function cutOut(
  k: Kit,
  img: OffscreenCanvas | HTMLCanvasElement,
  core: { x: number; y: number }[],
  extra: { x: number; y: number }[],
  maxExtra: number,
): Float32Array | null {
  const W = img.width;
  const H = img.height;
  const acc = new Float32Array(W * H);
  let any = false;
  const ask = (p: { x: number; y: number }, limit: number) => {
    if (p.x <= 0 || p.x >= 1 || p.y <= 0 || p.y >= 1) return;
    const r = k.touch.segment(img, { keypoint: p });
    const m = r.confidenceMasks?.[0];
    if (m) {
      const a = m.getAsFloat32Array();
      const sx = m.width / W;
      const sy = m.height / H;
      const at = (x: number, y: number) =>
        a[Math.min(m.height - 1, Math.floor(y * sy)) * m.width + Math.min(m.width - 1, Math.floor(x * sx))]!;
      let area = 0;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (at(x, y) > 0.5) area += 4;
      if (area <= limit) {
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const v = at(x, y);
            if (v > acc[y * W + x]!) acc[y * W + x] = v;
          }
        any = true;
      }
    }
    r.close?.();
  };
  for (const p of core) ask(p, Infinity);
  for (const p of extra) ask(p, maxExtra);
  return any ? acc : null;
}
const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
/** Points inside the character the segmenter is asked about: the body (torso, thighs, shins) and the small parts a
 *  single point often misses (forearms, hands, head). */
function seeds(c: PuppetCharacter & { body2d?: BodyRig }): {
  core: { x: number; y: number }[];
  extra: { x: number; y: number }[];
} {
  const J = c.body2d?.joints;
  if (J?.lSh && J.rSh && J.lHip && J.rHip && J.lKn && J.rKn && J.lAn && J.rAn) {
    const neck = mid(J.lSh, J.rSh);
    const pelvis = mid(J.lHip, J.rHip);
    const extra = [
      J.lEl && J.lWr ? mid(J.lEl, J.lWr) : null,
      J.rEl && J.rWr ? mid(J.rEl, J.rWr) : null,
      J.lHand ?? null,
      J.rHand ?? null,
      J.lWr ?? null,
      J.rWr ?? null,
      J.nose ?? null,
    ].filter((p): p is { x: number; y: number } => !!p);
    return {
      core: [mid(neck, pelvis), mid(J.lHip, J.lKn), mid(J.rHip, J.rKn), mid(J.lKn, J.lAn), mid(J.rKn, J.rAn)],
      extra,
    };
  }
  return {
    core: [{ x: c.body.x + c.body.w / 2, y: c.body.y + c.body.h * 0.3 }],
    extra: [{ x: c.head.x + c.head.w / 2, y: c.head.y + c.head.h / 2 }],
  };
}
/**
 * Reads a scene picture: who is there (or the characters already known), their skeletons and their cut-outs.
 * Returns null when the models cannot load (offline, blocked) or nobody is found.
 */
export async function readScene(src: Img, known: PuppetCharacter[] = []): Promise<SceneReading | null> {
  const t0 = performance.now();
  const k = await visionKit();
  if (!k) return null;
  const sw = (src as HTMLImageElement).naturalWidth || src.width;
  const sh = (src as HTMLImageElement).naturalHeight || src.height;
  const s = Math.min(1, 720 / Math.max(1, sw));
  const w = Math.round(sw * s);
  const h = Math.round(sh * s);
  const img = canvasOf(w, h);
  ctx2d(img).drawImage(src, 0, 0, w, h);
  try {
    let boxes: RBox[] = known.map((c) => c.box);
    if (!boxes.length) {
      const found = k.person
        .detect(img)
        .detections.filter((d) => d.boundingBox && d.categories[0]!.score >= 0.3)
        .map((d) => ({
          x: d.boundingBox!.originX / w,
          y: d.boundingBox!.originY / h,
          w: d.boundingBox!.width / w,
          h: d.boundingBox!.height / h,
          s: d.categories[0]!.score,
        }))
        .filter((b) => b.h >= 0.2)
        .sort((a, b) => b.s - a.s);
      for (const b of found)
        if (boxes.length < 4 && !boxes.some((o) => iou(o, b) > 0.5))
          boxes.push({ x: b.x, y: b.y, w: b.w, h: b.h });
      boxes = boxes.sort((a, b) => a.x - b.x);
    }
    const characters: (PuppetCharacter & { body2d?: BodyRig })[] = [];
    boxes.forEach((b, i) => {
      const body = poseIn(k, img, b);
      const prev = known[i];
      if (body) {
        const fromBody = characterFromBody(body, prev?.name ?? `perso ${i + 1}`, w / h);
        // A rig read before (vision model) keeps its finer face reading; the body comes from the pose.
        characters.push(prev ? { ...prev, body2d: body } : fromBody);
      } else if (prev) characters.push(prev);
    });
    if (!characters.length) return null;
    const raw = characters.map((c) => {
      const sd = seeds(c);
      return cutOut(k, img, sd.core, sd.extra, c.box.w * w * c.box.h * h * 0.18);
    });
    // Each pixel belongs to the character the segmenter is the most sure of; soft edge 0.35 → 0.65.
    const masks = raw.map((m, i) => {
      if (!m) return null;
      const c = characters[i]!;
      const out = new Float32Array(w * h);
      const bx0 = Math.max(0, (c.box.x - c.box.w * 0.3) * w);
      const bx1 = Math.min(w, (c.box.x + c.box.w * 1.3) * w);
      const by0 = Math.max(0, (c.box.y - c.box.h * 0.1) * h);
      const by1 = Math.min(h, (c.box.y + c.box.h * 1.1) * h);
      let on = 0;
      for (let y = Math.floor(by0); y < by1; y++)
        for (let x = Math.floor(bx0); x < bx1; x++) {
          const p = y * w + x;
          const v = m[p]!;
          if (raw.some((o, j) => j !== i && o && o[p]! > v)) continue;
          const e = (v - 0.35) / 0.3;
          out[p] = e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e);
          if (out[p]! > 0.5) on++;
        }
      // A cut-out that misses the character (or floods the region around it) is not used.
      const region = (bx1 - Math.floor(bx0)) * (by1 - Math.floor(by0));
      return on > c.box.w * w * c.box.h * h * 0.12 && on < region * 0.85 ? out : null;
    });
    return { characters, masks, w, h, ms: Math.round(performance.now() - t0) };
  } catch {
    return null;
  }
}

/** Masks → one grey PNG (characters stacked vertically): stored once with the scene, read back by the renderer. */
export async function masksToPng(masks: (Float32Array | null)[], w: number, h: number): Promise<Blob> {
  const c = canvasOf(w, h * masks.length);
  const g = ctx2d(c);
  const img = g.createImageData(w, h * masks.length);
  masks.forEach((m, k) => {
    for (let i = 0; i < w * h; i++) {
      const v = m ? Math.round(m[i]! * 255) : 0;
      const o = (k * w * h + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  });
  g.putImageData(img, 0, 0);
  return 'convertToBlob' in c
    ? c.convertToBlob({ type: 'image/png' })
    : new Promise<Blob>((ok, ko) =>
        (c as HTMLCanvasElement).toBlob((b) => (b ? ok(b) : ko(new Error('png'))), 'image/png'),
      );
}
/** The stacked PNG → n masks at the renderer's size (all-black slices → null). */
export function masksFromImage(
  img: CanvasImageSource & { width: number; height: number },
  n: number,
  w: number,
  h: number,
): (Float32Array | null)[] {
  const c = canvasOf(w, h * n);
  const g = ctx2d(c);
  g.drawImage(img, 0, 0, w, h * n);
  const d = g.getImageData(0, 0, w, h * n).data;
  return Array.from({ length: n }, (_, k) => {
    const m = new Float32Array(w * h);
    let any = false;
    for (let i = 0; i < w * h; i++) {
      const v = d[(k * w * h + i) * 4]! / 255;
      m[i] = v;
      if (v > 0.5) any = true;
    }
    return any ? m : null;
  });
}
