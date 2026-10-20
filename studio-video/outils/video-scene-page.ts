// VIDÉO → PAGE HTML 3D AUTONOME, en ligne de commande (sans navigateur) — même algorithme que l'onglet
// « Vidéo → scène 3D » de l'app : profondeur par image (Depth Anything V2 Small en ONNX, ou heuristique), bande
// nette détectée (vidéo posée sur sa copie floue), changements de plan détectés (aucune profondeur ne traverse une
// coupure), suivi temporel (flot optique + recalage + filtre), atlas PNG sans perte, son AAC copié tel quel.
//
//   npx tsx outils/video-scene-page.ts entree.mp4 sortie.html [--title "Titre"] [--depth onnx|heuristic]
//        [--model chemin/model.onnx] [--depth-cache profondeur.f32] [--fps 15] [--style relief|original|nuage|holo] [--camera orbite|travelling|fixe]
//        [--seconds 8]   (image fixe : durée du mouvement de caméra)
// Une IMAGE (png, jpg, webp…) donne la même page : ses pixels + sa carte de profondeur (plus fine : 512 px), caméra animée.
// En couches (par défaut pour une image, --no-layers pour s'en passer) : premier plan détecté (UperNet, MIT), décor
// reconstruit derrière (LaMa, Apache-2.0) et sa profondeur → la caméra voit le vrai décor derrière les personnages.
//
// Les vidéos de l'utilisateur restent hors du dépôt (workbench/.private/ ou dossier temporaire).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { heuristicDepth } from '../coeur/videogen/imageMotion';
import { DEFAULT_SCENE, DepthTracker, atlasLayout, dilateNear, isCut, placeBand, quantize, rowSharpness, sharpBand, trackSize } from '../coeur/videogen/videoDepth';
import { extractAac } from '../navigateur/videogen/audioCopy';
import { buildScenePage, type SceneCamera } from '../navigateur/videogen/scenePage';
import type { SceneLook } from '../navigateur/videogen/videoScene';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k: string, d?: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const [input, output] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!input || !output) {
  console.error('usage : video-scene-page.ts entree.mp4 sortie.html [--title …] [--depth onnx|heuristic] [--model …] [--fps 15]');
  process.exit(2);
}
const t0 = Date.now();
const fps = Number(opt('fps', '15'));
const mode = opt('depth', 'onnx');

// 1. The video.
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', input]).toString()) as {
  streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string }[];
  format: { duration: string; format_name: string };
};
const vs = probe.streams.find((s) => s.codec_type === 'video')!;
const W = vs.width!;
const H = vs.height!;
const [fn, fd] = (vs.r_frame_rate ?? '30/1').split('/').map(Number);
const vfps = Math.round((fn! / (fd || 1)) * 100) / 100;
const duration = Number(probe.format.duration) || 0;
const hasAudio = probe.streams.some((s) => s.codec_type === 'audio');
const isImage = /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(input) || /image2|png_pipe|jpeg_pipe|webp_pipe/.test(probe.format.format_name);
const isMp4 = !isImage && /mp4|mov/.test(probe.format.format_name);
const seconds = Number(opt('seconds', '8'));
const [tw, th] = trackSize(W, H, isImage ? 512 : 288);
const raw = (vf: string, fmt: 'gray' | 'rgb24') => execFileSync('ffmpeg', ['-v', 'error', '-i', input, '-vf', vf, '-frames:v', isImage ? '1' : '100000', '-f', 'rawvideo', '-pix_fmt', fmt, '-'], { maxBuffer: 1 << 30 });
const tfps = isImage ? '' : `fps=${fps},`;

// 2. Luma at the track size → sharp band and cuts.
const lumaAll = raw(`${tfps}scale=${tw}:${th}:flags=area`, 'gray');
const n = Math.floor(lumaAll.length / (tw * th));
const luma = (i: number) => new Uint8Array(lumaAll.buffer, lumaAll.byteOffset + i * tw * th, tw * th);
const rows = new Float32Array(th);
for (let i = 0; i < Math.min(n, 8); i++) rowSharpness(luma(i), tw, th, rows);
const band = isImage ? null : sharpBand(rows);
const [y0, y1] = band ?? [0, th];
const cuts: number[] = [];
for (let i = 1; i < n; i++) if (isCut(luma(i - 1), luma(i))) cuts.push(i);
console.error(`${isImage ? 'image' : 'vidéo'} ${W}×${H} ${vfps} i/s ${duration.toFixed(2)} s · ${n} images analysées à ${fps} i/s · bande nette ${band ? `${y0}–${y1}/${th}` : 'image entière'} · coupures ${cuts.join(', ') || 'aucune'}`);

// 3. Depth of the band, frame by frame.
const bh = y1 - y0;
const sy0 = Math.round((y0 * H) / th);
const sy1 = Math.round((y1 * H) / th);
const crop = band ? `${W}:${sy1 - sy0}:0:${sy0}` : '';
let depth: Float32Array;
let source: string;
const tmp = mkdtempSync(path.join(tmpdir(), 'scene-'));
let modelInfo: unknown = null;
const cached = opt('depth-cache');
if (mode === 'onnx' && cached && existsSync(cached)) {
  const b = readFileSync(cached);
  depth = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  source = 'Depth Anything V2 Small (Apache-2.0), ONNX';
  modelInfo = { cache: cached };
} else if (mode === 'onnx') {
  const model = opt('model');
  if (!model) throw new Error('--model chemin/vers/model.onnx (onnx-community/depth-anything-v2-small) est requis avec --depth onnx');
  const out = cached ?? path.join(tmp, 'depth.f32');
  const r = spawnSync('python3', [path.join(ROOT, 'outils/depth_onnx.py'), '--model', model, '--video', input, '--fps', isImage ? '0' : String(fps), ...(crop ? ['--crop', crop] : []), '--cw', String(W), '--ch', String(sy1 - sy0), '--ow', String(tw), '--oh', String(bh), '--out', out], { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error('le calcul de profondeur a échoué');
  modelInfo = JSON.parse(r.stdout.toString().trim().split('\n').at(-1)!);
  const b = readFileSync(out);
  depth = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  source = 'Depth Anything V2 Small (Apache-2.0), ONNX';
} else {
  const rgb = raw(`${tfps}${crop ? `crop=${crop},` : ''}scale=${tw}:${bh}:flags=area`, 'rgb24');
  depth = new Float32Array(n * tw * bh);
  for (let i = 0; i < n; i++) {
    const src = new Uint8Array(rgb.buffer, rgb.byteOffset + i * tw * bh * 3, tw * bh * 3);
    const rgba = new Uint8Array(tw * bh * 4);
    for (let p = 0, q = 0; p < tw * bh; p++, q += 3) {
      rgba[p * 4] = src[q]!;
      rgba[p * 4 + 1] = src[q + 1]!;
      rgba[p * 4 + 2] = src[q + 2]!;
      rgba[p * 4 + 3] = 255;
    }
    depth.set(heuristicDepth(rgba, tw, bh), i * tw * bh);
  }
  source = 'heuristique (sans modèle)';
}
const nd = Math.min(n, Math.floor(depth.length / (tw * bh)));

// 4. Through time: per shot, fresh depth every analysed frame, fused with the flow-carried depth.
const tracker = new DepthTracker(tw, th);
const frames: Uint8Array[] = [];
for (let i = 0; i < nd; i++) {
  if (cuts.includes(i)) tracker.reset();
  const fresh = placeBand(depth.subarray(i * tw * bh, (i + 1) * tw * bh), tw, th, y0, y1, 0);
  frames.push(quantize(dilateNear(tracker.push(luma(i), fresh), tw, th)));
}

// 5. Lossless grey atlas (PNG written here: zlib + CRC, filter « Up »).
const L = atlasLayout(frames.length, tw, th);
const atlas = new Uint8Array(L.width * L.height);
frames.forEach((f, k) => {
  const cx = (k % L.cols) * tw;
  const cy = Math.floor(k / L.cols) * th;
  for (let y = 0; y < th; y++) atlas.set(f.subarray(y * tw, (y + 1) * tw), (cy + y) * L.width + cx);
});
const png = grayPng(atlas, L.width, L.height);

// 5 bis. Still image in layers (outils/scene_layers.py).
let layers: { plateB64: string; plateMime: string; plateDepthB64: string; pdw: number; pdh: number; masksB64: string; note: string } | null = null;
if (isImage && !args.includes('--no-layers')) {
  const dir = mkdtempSync(path.join(tmpdir(), 'layers-'));
  const r = spawnSync('python3', [path.join(ROOT, 'outils/scene_layers.py'), '--image', input, '--out-dir', dir, ...(opt('seg') ? ['--seg', opt('seg')!] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
  if (r.status === 0) {
    const info = JSON.parse(r.stdout.toString().trim().split('\n').at(-1)!) as { masks: [number, number]; foreground_share: number; fill: string };
    const pdBuf = readFileSync(path.join(dir, 'plate-depth.png'));
    const pdw = pdBuf.readUInt32BE(16);
    const pdh = pdBuf.readUInt32BE(20);
    layers = { plateB64: readFileSync(path.join(dir, 'plate.jpg')).toString('base64'), plateMime: 'image/jpeg', plateDepthB64: pdBuf.toString('base64'), pdw, pdh, masksB64: readFileSync(path.join(dir, 'masks.png')).toString('base64'), note: `décor reconstruit : ${info.fill}, éléments : UperNet ADE20K (MIT)` };
    console.error(`couches : premier plan ${(info.foreground_share * 100).toFixed(1)} %, ${info.fill}`);
  } else console.error('couches indisponibles (modèles absents ?) : page sans couches');
  rmSync(dir, { recursive: true, force: true });
}

// 6. Original sound (AAC copied as is) and the libraries.
const file = readFileSync(input);
const aac = isMp4 ? await extractAac(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)) : null;
const b64 = (p: string) => readFileSync(path.join(ROOT, p)).toString('base64');
const look: SceneLook = { style: (opt('style', 'relief') as SceneLook['style']) ?? 'relief', relief: DEFAULT_SCENE.relief, cut: DEFAULT_SCENE.cut, fog: false, relight: false, dust: false, snow: false, rain: false };
const html = buildScenePage({
  title: opt('title') ?? path.basename(input).replace(/\.[^.]+$/, ''),
  video: isImage
    ? { b64: file.toString('base64'), mime: imageMime(input), width: W, height: H, duration: seconds, fps: 30, hasAudio: false, kind: 'image' }
    : { b64: file.toString('base64'), mime: isMp4 ? 'video/mp4' : 'video/webm', width: W, height: H, duration, fps: vfps, hasAudio },
  depth: { atlasB64: png.toString('base64'), w: tw, h: th, n: frames.length, fps: isImage ? 1 : fps, cols: L.cols, cuts, band, source },
  audio: aac ? { codec: aac.codec, sampleRate: aac.sampleRate, channels: aac.channels, descB64: Buffer.from(aac.description).toString('base64'), dataB64: Buffer.from(aac.data).toString('base64'), table: aac.table } : null,
  libs: { threeCoreB64: b64('node_modules/three/build/three.core.js'), threeB64: b64('node_modules/three/build/three.module.js'), muxerB64: b64('node_modules/mp4-muxer/build/mp4-muxer.mjs') },
  look,
  layers,
  camera: (opt('camera', isImage ? 'travelling' : 'orbite') as SceneCamera) ?? 'orbite',
});
writeFileSync(output, html);
rmSync(tmp, { recursive: true, force: true });
console.log(JSON.stringify({ output, layers: !!layers, bytes: html.length, frames: frames.length, track: [tw, th], band, cuts, source, model: modelInfo, audio: aac ? `${aac.codec} ${aac.table.length} échantillons (copie exacte)` : hasAudio ? 'réencodé à l’export' : 'aucun', atlas: [L.width, L.height, png.length], seconds: Math.round((Date.now() - t0) / 100) / 10 }));

function imageMime(f: string): string {
  const e = path.extname(f).toLowerCase();
  return e === '.png' ? 'image/png' : e === '.webp' ? 'image/webp' : e === '.gif' ? 'image/gif' : e === '.bmp' ? 'image/bmp' : 'image/jpeg';
}
function grayPng(px: Uint8Array, w: number, h: number): Buffer {
  const rowsBuf = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    rowsBuf[y * (w + 1)] = 2; // filter « Up »
    for (let x = 0; x < w; x++) rowsBuf[y * (w + 1) + 1 + x] = (px[y * w + x]! - (y ? px[(y - 1) * w + x]! : 0)) & 255;
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rowsBuf, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function crc32(b: Buffer): number {
  let c = ~0;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i]!;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c;
}
