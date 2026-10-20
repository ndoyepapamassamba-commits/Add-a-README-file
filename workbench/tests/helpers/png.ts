// Minimal PNG decoder for the tests (8-bit RGB / RGBA, non-interlaced) — enough for the fixtures, no dependency.
import { unzlibSync } from 'fflate';

export function decodePng(buf: Uint8Array): { w: number; h: number; px: Uint8ClampedArray } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 8;
  let w = 0;
  let h = 0;
  let type = 0;
  const idat: Uint8Array[] = [];
  while (p < buf.length) {
    const len = dv.getUint32(p);
    const name = String.fromCharCode(...buf.subarray(p + 4, p + 8));
    const data = buf.subarray(p + 8, p + 8 + len);
    if (name === 'IHDR') {
      w = dv.getUint32(p + 8);
      h = dv.getUint32(p + 12);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('PNG 8 bits non entrelacé attendu');
      type = data[9]!;
    } else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    p += 12 + len;
  }
  const all = new Uint8Array(idat.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const d of idat) {
    all.set(d, o);
    o += d.length;
  }
  const raw = unzlibSync(all);
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (!bpp) throw new Error(`type de couleur PNG ${type} non géré`);
  const stride = w * bpp;
  const out = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp]! : 0;
      const b = y ? out[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp]! : 0;
      let v = line[x]!;
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = out[i * bpp]!;
    px[i * 4 + 1] = out[i * bpp + 1]!;
    px[i * 4 + 2] = out[i * bpp + 2]!;
    px[i * 4 + 3] = bpp === 4 ? out[i * bpp + 3]! : 255;
  }
  return { w, h, px };
}
