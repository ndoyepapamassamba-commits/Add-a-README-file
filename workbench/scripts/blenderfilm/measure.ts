// MESURE « COMME VOS TIKTOK » — le MÊME code que pour vos vidéos (clipInspect de l'app) : plans par minute, durée
// médiane d'un plan, mouvement, part de l'image qui bouge, secondes figées, scintillement.
//   npx tsx scripts/blenderfilm/measure.ts film.mp4 [autre.mp4 …]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { measureFrames, segmentFilm, type FrameSeries } from '../../server/jev/studio/clipInspect';

const W = 96;
const H = 170;
const FPS = 12;
function load(file: string, maxS = 75): FrameSeries {
  const raw = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-t',
      String(maxS),
      '-i',
      file,
      '-vf',
      `fps=${FPS},scale=${W}:${H}`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      '-',
    ],
    { maxBuffer: 1 << 30 },
  );
  const n = Math.floor(raw.length / (W * H));
  const frames = Array.from({ length: n }, (_, i) =>
    Float32Array.from(raw.subarray(i * W * H, (i + 1) * W * H), (v) => v / 255),
  );
  return { w: W, h: H, fps: FPS, frames };
}
for (const f of process.argv.slice(2)) {
  if (!fs.existsSync(f)) continue;
  const s = load(f);
  const m = measureFrames(s);
  const shots = segmentFilm(s, 0.3);
  const lens = shots.map((x) => x.end - x.start).sort((a, b) => a - b);
  const med = lens[Math.floor(lens.length / 2)] ?? 0;
  console.log(
    JSON.stringify({
      file: f.split('/').pop(),
      seconds: +(s.frames.length / FPS).toFixed(1),
      shots: shots.length,
      shotMedianS: +med.toFixed(2),
      shotsPerMin: +((shots.length / (s.frames.length / FPS)) * 60).toFixed(1),
      motion: m.motion,
      coverage: m.coverage,
      frozenS: +m.frozen.reduce((a, x) => a + x.end - x.start, 0).toFixed(1),
      flicker: m.flicker,
    }),
  );
}
