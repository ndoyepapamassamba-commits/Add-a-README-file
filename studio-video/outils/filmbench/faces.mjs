// FILM BENCH — faces of every picture (MediaPipe FaceLandmarker, up to 4 faces, small faces looked for again in tiles):
// proportions — the raw data of the lip-sync and face-stability measures.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const S = process.env.FILMBENCH_DIR ?? '.filmbench';
const MODELS = `${process.env.HOME}/.cache/massamba-models`;
const names = process.argv.slice(2);
const b = await chromium.launch({ ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}), args: ['--ignore-certificate-errors'] });
const page = await b.newPage();
await page.goto('about:blank');
const model = readFileSync(MODELS + '/face_landmarker.task').toString('base64');
await page.evaluate(async (model) => {
  const mp = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
  const files = await mp.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const buf = Uint8Array.from(atob(model), (c) => c.charCodeAt(0));
  window.fl = await mp.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetBuffer: buf, delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 4, minFaceDetectionConfidence: 0.3, minFacePresenceConfidence: 0.3 });
}, model);
for (const n of names) {
  const dir = `${S}/${n}`;
  const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
  const out = [];
  for (let i = 0; i < files.length; i += 20) {
    const batch = files.slice(i, i + 20).map((f) => 'data:image/jpeg;base64,' + readFileSync(`${dir}/${f}`).toString('base64'));
    const r = await page.evaluate(async (batch) => {
      const res = [];
      for (const src of batch) {
        const im = new Image();
        im.src = src;
        await im.decode();
        // Whole frame first; small faces (wide shots) are looked for again in 2×2 overlapping tiles, upscaled ×2.
        let found = (window.fl.detect(im).faceLandmarks ?? []).map((lm) => ({ lm, ox: 0, oy: 0, s: 1, W: im.width, H: im.height }));
        if (!found.length) {
          const tw = Math.round(im.width * 0.6), th = Math.round(im.height * 0.6);
          for (const [ox, oy] of [[0, 0], [im.width - tw, 0], [0, im.height - th], [im.width - tw, im.height - th]]) {
            const c = document.createElement('canvas');
            c.width = tw * 2; c.height = th * 2;
            c.getContext('2d').drawImage(im, ox, oy, tw, th, 0, 0, tw * 2, th * 2);
            for (const lm of window.fl.detect(c).faceLandmarks ?? []) {
              const nx = ox + lm[1].x * tw, ny = oy + lm[1].y * th;
              if (!found.some((f) => Math.hypot(f.ox + f.lm[1].x * f.W - nx, f.oy + f.lm[1].y * f.H - ny) < 20)) found.push({ lm, ox, oy, s: 1, W: tw, H: th });
            }
          }
        }
        const faces = found.map(({ lm, ox, oy, W, H }) => {
          const P = (k) => [ox + lm[k].x * W, oy + lm[k].y * H];
          const d = (a, b) => Math.hypot(P(a)[0] - P(b)[0], P(a)[1] - P(b)[1]);
          const eye = d(33, 263);
          return {
            cx: P(1)[0], cy: P(1)[1], size: d(10, 152),
            pts: [P(33), P(263), P(10), P(1)].map((p) => p.map((v) => Math.round(v * 10) / 10)),
            // outer lips (corners, top, bottom) — the mouth box of the « dark mouth » measure
            lips: [P(61), P(291), P(0), P(17)].map((p) => p.map((v) => Math.round(v * 10) / 10)),
            box: [Math.min(...lm.map((_, k) => P(k)[0])), Math.min(...lm.map((_, k) => P(k)[1])), Math.max(...lm.map((_, k) => P(k)[0])), Math.max(...lm.map((_, k) => P(k)[1]))].map(Math.round),
            open: d(13, 14) / Math.max(1, eye),
            // proportions that a rigid face keeps (a morphing face does not)
            g: [d(33, 263) / Math.max(1, d(10, 152)), d(61, 291) / Math.max(1, eye), d(1, 152) / Math.max(1, d(10, 152))],
            // the same, on the UPPER face only (forehead, eyes, nose): untouched by the jaw of a talking mouth
            u: [d(33, 263) / Math.max(1, d(10, 1)), d(133, 362) / Math.max(1, eye), d(168, 1) / Math.max(1, d(10, 1))],
          };
        });
        res.push(faces);
      }
      return res;
    }, batch);
    out.push(...r);
  }
  writeFileSync(`${dir}/faces.json`, JSON.stringify(out));
  console.log(n, out.length, 'frames,', out.filter((f) => f.length).length, 'with faces');
}
await b.close();
