// Minimal ZIP writer (method 0 = "store"): no dependency, works offline. Enough for projects, kits and asset bundles.
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export interface ZipEntry {
  path: string;
  data: Uint8Array | string;
  /** Fixed timestamp keeps exports reproducible. */
  date?: Date;
}
const enc = new TextEncoder();
const dosTime = (d: Date) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d: Date) =>
  (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

export function makeZip(entries: ZipEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
  const u32 = (v: number) =>
    new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
  const cat = (...xs: Uint8Array[]) => {
    const out = new Uint8Array(xs.reduce((a, x) => a + x.length, 0));
    let o = 0;
    for (const x of xs) {
      out.set(x, o);
      o += x.length;
    }
    return out;
  };
  for (const e of entries) {
    const name = enc.encode(e.path.replace(/^\/+/, ''));
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const d = e.date ?? new Date(Date.UTC(2026, 0, 1));
    const crc = crc32(data);
    const flags = u16(0x0800); // UTF-8 names
    const local = cat(
      u32(0x04034b50),
      u16(20),
      flags,
      u16(0),
      u16(dosTime(d)),
      u16(dosDate(d)),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    );
    central.push(
      cat(
        u32(0x02014b50),
        u16(20),
        u16(20),
        flags,
        u16(0),
        u16(dosTime(d)),
        u16(dosDate(d)),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ),
    );
    parts.push(local);
    offset += local.length;
  }
  const cd = cat(...central);
  const end = cat(
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(cd.length),
    u32(offset),
    u16(0),
  );
  return cat(...parts, cd, end);
}
