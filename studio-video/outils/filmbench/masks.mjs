// Person masks of every frame of the benchmark films (MediaPipe image segmenters, the same for every film): the raw data
// of the « cut-out » (character/décor separation) and « living décor » (background motion) measures.
// usage: node outils/filmbench/masks.mjs <selfie|pose> <name>...  → $FILMBENCH_DIR/<name>/mask_<model>/m_00001.png (135×240, white = person)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
const S = process.env.FILMBENCH_DIR ?? '.filmbench';
const MODELS = `${process.env.HOME}/.cache/massamba-models`;
const [kind, ...names] = process.argv.slice(2);
const file = { selfie: 'selfie_multiclass_256x256.tflite', pose: 'pose_landmarker_full.task' }[kind];
const b = await chromium.launch({ ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}), args: ['--ignore-certificate-errors'] });
const page = await b.newPage();
await page.goto('about:blank');
await page.evaluate(async ([model, kind]) => {
  const mp = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
  const files = await mp.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const buf = Uint8Array.from(atob(model), (c) => c.charCodeAt(0));
  window.kind = kind;
  if (kind === 'pose') window.seg = await mp.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetBuffer: buf, delegate: 'CPU' }, runningMode: 'IMAGE', numPoses: 4, outputSegmentationMasks: true, minPoseDetectionConfidence: 0.3 });
  else window.seg = await mp.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetBuffer: buf, delegate: 'CPU' }, runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: false });
}, [readFileSync(`${MODELS}/${file}`).toString('base64'), kind]);
for (const n of names) {
  const dir = `${S}/${n}`;
  const out = `${dir}/mask_${kind}`;
  mkdirSync(out, { recursive: true });
  const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort().slice(0, Number(process.env.MAXF ?? 320));
  for (let i = 0; i < files.length; i += 16) {
    const batch = files.slice(i, i + 16).map((f) => 'data:image/jpeg;base64,' + readFileSync(`${dir}/${f}`).toString('base64'));
    const pngs = await page.evaluate(async (batch) => {
      const res = [];
      for (const src of batch) {
        const im = new Image();
        im.src = src;
        await im.decode();
        const c = document.createElement('canvas');
        c.width = 135;
        c.height = 240;
        const g = c.getContext('2d');
        const id = g.createImageData(135, 240);
        const put = (W, H, at) => {
          for (let y = 0; y < 240; y++)
            for (let x = 0; x < 135; x++) {
              const v = at(Math.min(W - 1, Math.floor((x / 135) * W)) + Math.min(H - 1, Math.floor((y / 240) * H)) * W);
              if (v) {
                const k = (y * 135 + x) * 4;
                id.data[k] = id.data[k + 1] = id.data[k + 2] = 255;
              }
            }
        };
        if (window.kind === 'pose') {
          const r = window.seg.detect(im);
          for (const m of r.segmentationMasks ?? []) {
            const a = m.getAsFloat32Array();
            put(m.width, m.height, (k) => a[k] > 0.5);
            m.close();
          }
        } else {
          const r = window.seg.segment(im);
          const m = r.categoryMask;
          const a = m.getAsUint8Array();
          put(m.width, m.height, (k) => (window.kind === 'deeplab' ? a[k] === 15 : a[k] !== 0));
          m.close();
        }
        for (let k = 3; k < id.data.length; k += 4) id.data[k] = 255;
        g.putImageData(id, 0, 0);
        res.push(c.toDataURL('image/png').split(',')[1]);
      }
      return res;
    }, batch);
    pngs.forEach((p, j) => writeFileSync(`${out}/m_${String(i + j + 1).padStart(5, '0')}.png`, Buffer.from(p, 'base64')));
  }
  console.log(n, kind, files.length, 'masks');
}
await b.close();
