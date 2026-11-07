/* =====================================================================
   Skit Studio — 85-zip.js
   Écrivain ZIP minimal (méthode STORE, sans compression : les vidéos sont
   déjà compressées). Aucune dépendance. Entrées < 4 Go, < 65 535 fichiers.
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(d) {
    d = d || new Date();
    const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() >> 1) & 31);
    const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { time, date };
  }

  const enc = (s) => (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(s) : Uint8Array.from(Buffer.from(s, 'utf8'));

  /**
   * @param entries [{ name:string, data:Uint8Array, date?:Date }]
   * @returns Uint8Array du fichier .zip
   */
  function build(entries) {
    const parts = [];
    const central = [];
    let offset = 0;
    for (const e of entries) {
      const name = enc(e.name);
      const data = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data);
      const crc = crc32(data);
      const { time, date } = dosDateTime(e.date);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(4, 0, true); eocd.setUint16(6, 0, true);
    eocd.setUint16(8, entries.length, true); eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true); eocd.setUint16(20, 0, true);
    const all = parts.concat(central, [new Uint8Array(eocd.buffer)]);
    const total = all.reduce((a, b) => a + b.length, 0);
    const out = new Uint8Array(total);
    let p = 0; for (const b of all) { out.set(b, p); p += b.length; }
    return out;
  }

  const Zip = { crc32, build };
  NS.Zip = Zip;
  if (typeof module !== 'undefined' && module.exports) module.exports = Zip;
})(typeof window !== 'undefined' ? window : globalThis);
