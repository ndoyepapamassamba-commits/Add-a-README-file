package sn.telecommande.universelle;

import java.util.Arrays;

/** Un code infrarouge : soit un protocole connu (adresse + commande), soit une suite brute de durées. */
public final class Signal {
    public static final String RAW = "RAW";

    public final String proto;
    public final long addr;
    public final long cmd;
    public final int freq;
    public final int[] raw;

    private Signal(String proto, long addr, long cmd, int freq, int[] raw) {
        this.proto = proto;
        this.addr = addr;
        this.cmd = cmd;
        this.freq = freq;
        this.raw = raw;
    }

    public static Signal parsed(String proto, long addr, long cmd) {
        return new Signal(proto, addr, cmd, 0, null);
    }

    public static Signal raw(int freq, int[] durations) {
        return new Signal(RAW, 0, 0, freq, durations);
    }

    public boolean isRaw() {
        return raw != null;
    }

    /** Même adresse et même protocole, autre commande (utilisé par l'explorateur de codes). */
    public Signal withCommand(long newCmd) {
        return parsed(proto, addr, newCmd);
    }

    public String key() {
        if (isRaw()) return "RAW:" + freq + ":" + Arrays.hashCode(raw);
        return proto + ":" + Long.toHexString(addr) + ":" + Long.toHexString(cmd);
    }

    public String serialize() {
        if (isRaw()) {
            StringBuilder sb = new StringBuilder("R|").append(freq).append('|');
            for (int i = 0; i < raw.length; i++) {
                if (i > 0) sb.append(',');
                sb.append(raw[i]);
            }
            return sb.toString();
        }
        return "P|" + proto + "|" + Long.toHexString(addr) + "|" + Long.toHexString(cmd);
    }

    public static Signal deserialize(String s) {
        if (s == null) return null;
        try {
            String[] p = s.split("\\|");
            if (p[0].equals("P") && p.length == 4) {
                return parsed(p[1], Long.parseLong(p[2], 16), Long.parseLong(p[3], 16));
            }
            if (p[0].equals("R") && p.length == 3) {
                String[] d = p[2].split(",");
                int[] r = new int[d.length];
                for (int i = 0; i < d.length; i++) r[i] = Integer.parseInt(d[i]);
                return raw(Integer.parseInt(p[1]), r);
            }
        } catch (RuntimeException ignored) {
            // préférence corrompue : on l'ignore
        }
        return null;
    }

    public String describe() {
        if (isRaw()) return "code enregistré (" + raw.length + " impulsions, " + freq / 1000 + " kHz)";
        return proto + " · adresse 0x" + Long.toHexString(addr).toUpperCase()
                + " · commande 0x" + Long.toHexString(cmd).toUpperCase();
    }
}
