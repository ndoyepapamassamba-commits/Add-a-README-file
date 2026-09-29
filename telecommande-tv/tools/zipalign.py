#!/usr/bin/env python3
"""zipalign minimal : réécrit un zip en alignant les entrées non compressées sur 4 octets."""
import sys, zipfile, struct

def align(src, dst, alignment=4):
    zin = zipfile.ZipFile(src)
    with open(dst, 'wb') as out:
        central = []
        for info in zin.infolist():
            data = zin.read(info.filename)
            comp = info.compress_type
            if comp == zipfile.ZIP_DEFLATED:
                import zlib
                c = zlib.compressobj(9, zlib.DEFLATED, -15)
                payload = c.compress(data) + c.flush()
            else:
                payload = data
            name = info.filename.encode('utf-8')
            offset = out.tell()
            extra = b''
            if comp == zipfile.ZIP_STORED:
                pos = offset + 30 + len(name)
                pad = (-pos) % alignment
                extra = b'\x00' * pad
            crc = zipfile.crc32(data) & 0xffffffff
            dostime = (0 << 11) | (0 << 5) | 0
            dosdate = ((1981 - 1980) << 9) | (1 << 5) | 1
            flags = 0x800 if any(b > 0x7f for b in name) else 0
            out.write(struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, flags, comp, dostime, dosdate, crc,
                                  len(payload), len(data), len(name), len(extra)))
            out.write(name); out.write(extra); out.write(payload)
            central.append((name, comp, crc, len(payload), len(data), offset, flags, dostime, dosdate))
        cd_start = out.tell()
        for name, comp, crc, csize, usize, offset, flags, t, d in central:
            out.write(struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 20, 20, flags, comp, t, d, crc, csize,
                                  usize, len(name), 0, 0, 0, 0, 0, offset))
            out.write(name)
        cd_end = out.tell()
        out.write(struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, len(central), len(central),
                              cd_end - cd_start, cd_start, 0))

def check(path, alignment=4):
    z = zipfile.ZipFile(path)
    f = open(path, 'rb')
    bad = []
    for info in z.infolist():
        f.seek(info.header_offset)
        h = f.read(30)
        n, e = struct.unpack('<HH', h[26:30])
        data_off = info.header_offset + 30 + n + e
        if info.compress_type == zipfile.ZIP_STORED and data_off % alignment:
            bad.append(info.filename)
    return bad

if __name__ == '__main__':
    if sys.argv[1] == '--check':
        bad = check(sys.argv[2])
        print('alignement OK' if not bad else 'NON ALIGNÉ: %s' % bad)
        sys.exit(1 if bad else 0)
    align(sys.argv[1], sys.argv[2])
