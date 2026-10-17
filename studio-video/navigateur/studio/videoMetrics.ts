// Mesure d'une vidéo dans le navigateur — mêmes définitions que celles qui ont servi à mesurer les références
// (images 180×320, 12 premières secondes, 25 i/s) : netteté (Laplacien), richesse des couleurs (Hasler-Süsstrunk),
// luminosité, contraste, mouvement (différence entre images), saccades (différence seconde), longueur des plans.
import type { VideoMetrics } from '../../coeur/studio/qualityRef';

export async function measureVideo(blob: Blob, o: { seconds?: number; fps?: number; onProgress?: (p: number) => void } = {}): Promise<VideoMetrics> {
  const fps = o.fps ?? 25;
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.src = URL.createObjectURL(blob);
  await new Promise<void>((ok, ko) => {
    v.onloadedmetadata = () => ok();
    v.onerror = () => ko(new Error('vidéo illisible'));
  });
  const dur = Math.min(o.seconds ?? 12, Number.isFinite(v.duration) ? v.duration : 12);
  const W = 180;
  const H = 320;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const n = Math.max(3, Math.floor(dur * fps));
  let sharp = 0;
  let colf = 0;
  let bright = 0;
  let contr = 0;
  const d1: number[] = [];
  const d2: number[] = [];
  let prev: Float32Array | null = null;
  let prevD: Float32Array | null = null;
  for (let i = 0; i < n; i++) {
    v.currentTime = i / fps;
    await new Promise<void>((ok) => (v.onseeked = () => ok()));
    g.drawImage(v, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const gray = new Float32Array(W * H);
    let srg = 0;
    let syb = 0;
    let srg2 = 0;
    let syb2 = 0;
    let sg = 0;
    let sg2 = 0;
    for (let p = 0; p < W * H; p++) {
      const r = d[p * 4]!;
      const gg = d[p * 4 + 1]!;
      const b = d[p * 4 + 2]!;
      const y = (r + gg + b) / 3;
      gray[p] = y;
      sg += y;
      sg2 += y * y;
      const rg = r - gg;
      const yb = 0.5 * (r + gg) - b;
      srg += rg;
      syb += yb;
      srg2 += rg * rg;
      syb2 += yb * yb;
    }
    const N = W * H;
    const mrg = srg / N;
    const myb = syb / N;
    colf += Math.sqrt(srg2 / N - mrg * mrg + (syb2 / N - myb * myb)) + 0.3 * Math.sqrt(mrg * mrg + myb * myb);
    const mg = sg / N;
    bright += mg;
    contr += Math.sqrt(Math.max(0, sg2 / N - mg * mg));
    let lap = 0;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const k = y * W + x;
        lap += Math.abs(4 * gray[k]! - gray[k - W]! - gray[k + W]! - gray[k - 1]! - gray[k + 1]!);
      }
    sharp += lap / ((W - 2) * (H - 2));
    if (prev) {
      const diff = new Float32Array(N);
      let s1 = 0;
      for (let p = 0; p < N; p++) {
        diff[p] = gray[p]! - prev[p]!;
        s1 += Math.abs(diff[p]!);
      }
      d1.push(s1 / N);
      if (prevD) {
        let s2 = 0;
        for (let p = 0; p < N; p++) s2 += Math.abs(diff[p]! - prevD[p]!);
        d2.push(s2 / N);
      }
      prevD = diff;
    }
    prev = gray;
    o.onProgress?.(i / n);
  }
  URL.revokeObjectURL(v.src);
  const med = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)]! : 0;
  };
  const cuts = d1.filter((x) => x > 30).length;
  return { sharpness: sharp / n, colorfulness: colf / n, brightness: bright / n, contrast: contr / n, motion: med(d1), jerk: med(d2), shotSeconds: n / fps / (cuts + 1) };
}
