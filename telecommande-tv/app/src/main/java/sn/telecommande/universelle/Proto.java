package sn.telecommande.universelle;

import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;

/** Encodage/décodage protobuf minimal (varints et champs délimités), suffisant pour Android TV Remote v2. */
final class Proto {
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private final ByteArrayOutputStream out = new ByteArrayOutputStream();

    Proto varint(int field, long value) {
        key(field, 0);
        writeVarint(out, value);
        return this;
    }

    Proto bytes(int field, byte[] b) {
        key(field, 2);
        writeVarint(out, b.length);
        out.write(b, 0, b.length);
        return this;
    }

    Proto string(int field, String s) {
        return bytes(field, s.getBytes(UTF8));
    }

    Proto message(int field, Proto m) {
        return bytes(field, m.toByteArray());
    }

    byte[] toByteArray() {
        return out.toByteArray();
    }

    private void key(int field, int wire) {
        writeVarint(out, ((long) field << 3) | wire);
    }

    static void writeVarint(OutputStream o, long v) {
        try {
            while ((v & ~0x7FL) != 0) {
                o.write((int) ((v & 0x7F) | 0x80));
                v >>>= 7;
            }
            o.write((int) v);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Écrit un message précédé de sa longueur (varint), comme l'attend la télé. */
    static void writeFrame(OutputStream o, byte[] msg) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream(msg.length + 5);
        writeVarint(b, msg.length);
        b.write(msg, 0, msg.length);
        o.write(b.toByteArray());
        o.flush();
    }

    static byte[] readFrame(InputStream in) throws IOException {
        long len = 0;
        int shift = 0;
        while (true) {
            int b = in.read();
            if (b < 0) throw new EOFException("connexion fermée par la télé");
            len |= (long) (b & 0x7F) << shift;
            if ((b & 0x80) == 0) break;
            shift += 7;
            if (shift > 28) throw new IOException("longueur de message invalide");
        }
        if (len > 1 << 20) throw new IOException("message trop long");
        byte[] data = new byte[(int) len];
        int off = 0;
        while (off < data.length) {
            int n = in.read(data, off, data.length - off);
            if (n < 0) throw new EOFException("connexion fermée par la télé");
            off += n;
        }
        return data;
    }

    /** Parcourt les champs d'un message : {@code while (r.next()) { r.field … }}. */
    static final class Reader {
        private final byte[] buf;
        private int pos;
        int field;
        int wire;
        long varint;
        byte[] bytes;

        Reader(byte[] buf) {
            this.buf = buf;
        }

        boolean next() {
            if (pos >= buf.length) return false;
            long k = readVarint();
            field = (int) (k >>> 3);
            wire = (int) (k & 7);
            bytes = null;
            switch (wire) {
                case 0:
                    varint = readVarint();
                    break;
                case 1:
                    pos += 8;
                    break;
                case 2: {
                    int len = (int) readVarint();
                    if (len < 0 || pos + len > buf.length) throw new IllegalArgumentException("message tronqué");
                    bytes = new byte[len];
                    System.arraycopy(buf, pos, bytes, 0, len);
                    pos += len;
                    break;
                }
                case 5:
                    pos += 4;
                    break;
                default:
                    throw new IllegalArgumentException("type de champ protobuf inconnu : " + wire);
            }
            if (pos > buf.length) throw new IllegalArgumentException("message tronqué");
            return true;
        }

        String string() {
            return new String(bytes, UTF8);
        }

        private long readVarint() {
            long v = 0;
            int shift = 0;
            while (true) {
                if (pos >= buf.length) throw new IllegalArgumentException("varint tronqué");
                int b = buf[pos++] & 0xFF;
                v |= (long) (b & 0x7F) << shift;
                if ((b & 0x80) == 0) return v;
                shift += 7;
            }
        }
    }
}
