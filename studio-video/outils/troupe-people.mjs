// TROUPE — the people painted in the owner's sets (market women, guests, passers-by): a soft mask of them per set
// (MediaPipe selfie multiclass segmentation over overlapping tiles, run once in a headless browser), so the engine can make them breathe and sway — the
// background lives instead of being a frozen photograph. Results cached in .private/troupe/hd/<set>.people.png and
// referenced in the manifest (`people`). Run after outils/troupe-enhance.py:  node outils/troupe-people.mjs [--force]
import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../.private/troupe/', import.meta.url));
const MODEL = `${homedir()}/.cache/massamba-models/selfie_multiclass_256x256.tflite`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';
// The segmenter also takes patterned sofas, huts or trees for clothes: only what lies inside a detected PERSON is kept.
const DET = `${homedir()}/.cache/massamba-models/efficientdet_lite0.tflite`;
const DET_URL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/latest/efficientdet_lite0.tflite';
const force = process.argv.includes('--force');
const man = JSON.parse(readFileSync(ROOT + 'manifest.json', 'utf8'));
for (const [f, u] of [
  [MODEL, MODEL_URL],
  [DET, DET_URL],
])
  if (!existsSync(f)) writeFileSync(f, Buffer.from(await (await fetch(u)).arrayBuffer()));
const b = await chromium.launch({ ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}), args: ['--ignore-certificate-errors'] });
const page = await b.newPage();
await page.goto('about:blank');
await page.evaluate(async ([model, det]) => {
  const mp = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
  const files = await mp.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const buf = Uint8Array.from(atob(model), (c) => c.charCodeAt(0));
  window.seg = await mp.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetBuffer: buf, delegate: 'CPU' }, runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true });
  const dbuf = Uint8Array.from(atob(det), (c) => c.charCodeAt(0));
  window.det = await mp.ObjectDetector.createFromOptions(files, { baseOptions: { modelAssetBuffer: dbuf, delegate: 'CPU' }, runningMode: 'IMAGE', scoreThreshold: 0.3, categoryAllowlist: ['person'], maxResults: 25 });
}, [readFileSync(MODEL).toString('base64'), readFileSync(DET).toString('base64')]);
let n = 0;
for (const d of man.decors ?? []) {
  const src = d.hd ?? d.file;
  const out = src.replace(/\.(jpe?g|png)$/i, '.people.png').replace(/^(?!hd\/)/, 'hd/');
  if (!force && existsSync(ROOT + out)) {
    d.people = out;
    continue;
  }
  const png = await page.evaluate(async (dataUrl) => {
    const im = new Image();
    im.src = dataUrl;
    await im.decode();
    // Whole picture + overlapping tiles (small far people are found in the tiles).
    const W = 512;
    const H = Math.round((W * im.height) / im.width);
    const acc = new Float32Array(W * H);
    const inPerson = new Uint8Array(W * H);
    const views = [[0, 0, im.width, im.height]];
    for (const fy of [0, 0.4])
      for (const fx of [0, 0.3, 0.6]) views.push([im.width * fx, im.height * fy, im.width * 0.4, im.height * 0.6]);
    for (const [sx, sy, sw, sh] of views) {
      const c = document.createElement('canvas');
      const k = Math.min(1, 1024 / Math.max(sw, sh));
      c.width = Math.round(sw * k);
      c.height = Math.round(sh * k);
      c.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height);
      // MediaPipe aborts on some canvases: it is given a decoded picture.
      const pic = new Image();
      pic.src = c.toDataURL('image/jpeg', 0.92);
      await pic.decode();
      // Confidence of « background » (mask 0): a person is everything that is not background.
      const r = window.seg.segment(pic);
      const m = r.confidenceMasks[0];
      const a = m.getAsFloat32Array();
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const ix = ((x / W) * im.width - sx) / sw;
          const iy = ((y / H) * im.height - sy) / sh;
          if (ix < 0 || ix >= 1 || iy < 0 || iy >= 1) continue;
          const v = 1 - a[Math.floor(iy * m.height) * m.width + Math.floor(ix * m.width)];
          if (v > acc[y * W + x]) acc[y * W + x] = v;
        }
      r.confidenceMasks.forEach((q) => q.close());
      // The people found by the detector in this view (boxes, a little enlarged).
      for (const d of window.det.detect(pic).detections ?? []) {
        const b = d.boundingBox;
        const x0 = ((sx + ((b.originX - b.width * 0.08) / pic.width) * sw) / im.width) * W;
        const x1 = ((sx + ((b.originX + b.width * 1.08) / pic.width) * sw) / im.width) * W;
        const y0 = ((sy + ((b.originY - b.height * 0.05) / pic.height) * sh) / im.height) * H;
        const y1 = ((sy + ((b.originY + b.height * 1.05) / pic.height) * sh) / im.height) * H;
        for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++)
          for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) inPerson[y * W + x] = 1;
      }
    }
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const id = g.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const v = inPerson[i] ? Math.round(Math.min(1, Math.max(0, (acc[i] - 0.3) / 0.4)) * 255) : 0;
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v;
      id.data[i * 4 + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    // Soft edges: the warp fades out around each person (no tear in the set).
    const s = document.createElement('canvas');
    s.width = W;
    s.height = H;
    const sg = s.getContext('2d');
    sg.filter = 'blur(3px)';
    sg.drawImage(c, 0, 0);
    return s.toDataURL('image/png').split(',')[1];
  }, `data:image/jpeg;base64,${readFileSync(ROOT + src).toString('base64')}`);
  writeFileSync(ROOT + out, Buffer.from(png, 'base64'));
  d.people = out;
  n++;
  console.log(`  ${d.name}: ${out}`);
}
writeFileSync(ROOT + 'manifest.json', JSON.stringify(man, null, 1));
console.log(`personnes des décors : ${n} masque(s) calculé(s)`);
await b.close();
