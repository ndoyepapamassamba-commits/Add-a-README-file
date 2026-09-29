package sn.telecommande.universelle;

import java.util.ArrayList;
import java.util.List;

/**
 * Transforme un {@link Signal} en trame infrarouge (fréquence porteuse + durées en microsecondes,
 * en commençant par une impulsion allumée). Les formats reproduisent ceux des encodeurs du
 * firmware Flipper Zero, dont provient la base de codes.
 */
public final class IrCodec {

    public static final class Frame {
        public final int freq;
        public final int[] pattern;

        Frame(int freq, int[] pattern) {
            this.freq = freq;
            this.pattern = pattern;
        }

        public long durationUs() {
            long t = 0;
            for (int d : pattern) t += d;
            return t;
        }
    }

    private IrCodec() {}

    public static int carrier(String proto) {
        if (proto.startsWith("RC5") || proto.equals("RC6")) return 36000;
        if (proto.startsWith("SIRC") || proto.equals("Pioneer")) return 40000;
        return 38000;
    }

    /** Protocoles pour lesquels on sait générer n'importe quelle commande (explorateur de codes). */
    public static boolean explorable(Signal s) {
        return s != null && !s.isRaw() && !s.proto.equals("RC5X");
    }

    /** Liste des commandes à essayer dans l'explorateur, selon le protocole du code de référence. */
    public static long[] commandRange(Signal ref) {
        String p = ref.proto;
        int n;
        if (p.equals("RC5")) n = 64;
        else if (p.startsWith("SIRC")) n = 128;
        else if (p.equals("Kaseikyo")) n = 1024;
        else n = 256;
        long[] out = new long[n];
        boolean ext = p.equals("NECext") || p.equals("NEC42ext");
        boolean inverse = ext && ((ref.cmd >> 8) & 0xFF) == (~ref.cmd & 0xFF);
        for (int i = 0; i < n; i++) {
            out[i] = inverse ? (i | ((~i & 0xFF) << 8)) : i;
        }
        return out;
    }

    /** Numéro lisible d'une commande (on masque l'octet inversé des variantes étendues). */
    public static int commandNumber(Signal s) {
        if (s.proto.equals("NECext") || s.proto.equals("NEC42ext")) return (int) (s.cmd & 0xFF);
        return (int) s.cmd;
    }

    public static Frame encode(Signal s, boolean toggle) {
        if (s.isRaw()) return encodeRaw(s);
        List<Integer> t = new ArrayList<Integer>();
        String p = s.proto;
        long a = s.addr, c = s.cmd;
        if (p.equals("NEC")) {
            long data = (a & 0xFF) | ((~a & 0xFF) << 8) | ((c & 0xFF) << 16) | ((~c & 0xFF) << 24);
            pdm(t, 9000, 4500, data, 32, 560, 1690, 560);
        } else if (p.equals("NECext")) {
            long data = (a & 0xFFFF) | ((c & 0xFFFF) << 16);
            pdm(t, 9000, 4500, data, 32, 560, 1690, 560);
        } else if (p.equals("NEC42")) {
            long data = (a & 0x1FFF) | ((~a & 0x1FFF) << 13) | ((c & 0xFF) << 26) | ((~c & 0xFF) << 34);
            pdm(t, 9000, 4500, data, 42, 560, 1690, 560);
        } else if (p.equals("NEC42ext")) {
            long data = (a & 0x3FFFFFF) | ((c & 0xFFFF) << 26);
            pdm(t, 9000, 4500, data, 42, 560, 1690, 560);
        } else if (p.equals("Samsung32")) {
            long data = (a & 0xFF) | ((a & 0xFF) << 8) | ((c & 0xFF) << 16) | ((~c & 0xFF) << 24);
            pdm(t, 4500, 4500, data, 32, 550, 1650, 550);
        } else if (p.equals("RCA")) {
            long data = (a & 0xF) | ((c & 0xFF) << 4) | ((~a & 0xF) << 12) | ((~c & 0xFF) << 16);
            pdm(t, 4000, 4000, data, 24, 500, 2000, 1000);
        } else if (p.equals("Pioneer")) {
            long data = (a & 0xFF) | ((~a & 0xFF) << 8) | ((c & 0xFF) << 16) | ((~c & 0xFF) << 24);
            List<Integer> one = new ArrayList<Integer>();
            pdm(one, 8500, 4225, data, 32, 500, 1500, 500); // la 33e impulsion sert de bit d'arrêt
            repeat(t, one, 2, 26500 + sum(one));
        } else if (p.equals("Kaseikyo")) {
            kaseikyo(t, a, c);
        } else if (p.startsWith("SIRC")) {
            int bits = p.equals("SIRC15") ? 15 : p.equals("SIRC20") ? 20 : 12;
            long amask = bits == 12 ? 0x1F : bits == 15 ? 0xFF : 0x1FFF;
            long data = (c & 0x7F) | ((a & amask) << 7);
            List<Integer> one = new ArrayList<Integer>();
            one.add(2400);
            one.add(600);
            for (int i = 0; i < bits; i++) {
                if (i > 0) one.add(600);
                one.add(((data >> i) & 1) == 1 ? 1200 : 600);
            }
            // Les télés Sony veulent la trame au moins 3 fois, toutes les 45 ms.
            repeat(t, one, 3, 45000);
        } else if (p.equals("RC5") || p.equals("RC5X")) {
            rc5(t, p.equals("RC5X"), toggle, a, c);
        } else if (p.equals("RC6")) {
            rc6(t, toggle, a, c);
        } else {
            throw new IllegalArgumentException("Protocole inconnu : " + p);
        }
        return new Frame(carrier(p), toArray(t));
    }

    private static Frame encodeRaw(Signal s) {
        int[] d = s.raw;
        int n = d.length % 2 == 0 ? d.length - 1 : d.length; // doit finir par une impulsion
        List<Integer> one = new ArrayList<Integer>();
        for (int i = 0; i < n; i++) one.add(Math.max(1, d[i]));
        List<Integer> t = new ArrayList<Integer>();
        int freq = s.freq > 0 ? s.freq : 38000;
        if (freq >= 39000 && freq <= 41000 && sum(one) < 60000) {
            repeat(t, one, 3, 45000); // code Sony enregistré avec une seule trame
        } else {
            t.addAll(one);
        }
        return new Frame(freq, toArray(t));
    }

    /** Codage à distance d'impulsion, bit de poids faible en premier, avec bit d'arrêt final. */
    private static void pdm(List<Integer> t, int hdrMark, int hdrSpace, long data, int bits,
                            int mark, int oneSpace, int zeroSpace) {
        t.add(hdrMark);
        t.add(hdrSpace);
        for (int i = 0; i < bits; i++) {
            t.add(mark);
            t.add(((data >>> i) & 1L) == 1L ? oneSpace : zeroSpace);
        }
        t.add(mark);
    }

    private static void kaseikyo(List<Integer> t, long address, long command) {
        int id = (int) ((address >> 24) & 3);
        int vendor = (int) ((address >> 8) & 0xFFFF);
        int genre1 = (int) ((address >> 4) & 0xF);
        int genre2 = (int) (address & 0xF);
        int[] b = new int[6];
        b[0] = vendor & 0xFF;
        b[1] = (vendor >> 8) & 0xFF;
        int parity = b[0] ^ b[1];
        parity = (parity & 0xF) ^ (parity >> 4);
        b[2] = (parity & 0xF) | (genre1 << 4);
        b[3] = (genre2 & 0xF) | ((int) (command & 0xF) << 4);
        b[4] = ((id << 6) | (int) ((command >> 4) & 0xFF)) & 0xFF;
        b[5] = b[2] ^ b[3] ^ b[4];
        t.add(8 * 432);
        t.add(4 * 432);
        for (int i = 0; i < 48; i++) {
            t.add(432);
            t.add(((b[i / 8] >> (i % 8)) & 1) == 1 ? 3 * 432 : 432);
        }
        t.add(432);
    }

    /** RC5 : codage Manchester (1 = pause puis impulsion), demi-bit de 888 µs. */
    private static void rc5(List<Integer> t, boolean extended, boolean toggle, long a, long c) {
        List<Boolean> bits = new ArrayList<Boolean>();
        bits.add(true);
        bits.add(!extended);
        bits.add(toggle);
        for (int i = 4; i >= 0; i--) bits.add(((a >> i) & 1) == 1);
        for (int i = 5; i >= 0; i--) bits.add(((c >> i) & 1) == 1);
        List<boolean[]> halves = new ArrayList<boolean[]>();
        List<Integer> lens = new ArrayList<Integer>();
        for (boolean b : bits) {
            halves.add(new boolean[] {!b});
            lens.add(888);
            halves.add(new boolean[] {b});
            lens.add(888);
        }
        merge(t, halves, lens);
    }

    /** RC6 mode 0 : en-tête, puis Manchester (1 = impulsion puis pause), bit de basculement double. */
    private static void rc6(List<Integer> t, boolean toggle, long a, long c) {
        List<boolean[]> halves = new ArrayList<boolean[]>();
        List<Integer> lens = new ArrayList<Integer>();
        halves.add(new boolean[] {true});
        lens.add(2666);
        halves.add(new boolean[] {false});
        lens.add(889);
        List<Boolean> bits = new ArrayList<Boolean>();
        bits.add(true); // bit de départ
        bits.add(false);
        bits.add(false);
        bits.add(false); // mode 0
        bits.add(toggle);
        for (int i = 7; i >= 0; i--) bits.add(((a >> i) & 1) == 1);
        for (int i = 7; i >= 0; i--) bits.add(((c >> i) & 1) == 1);
        for (int i = 0; i < bits.size(); i++) {
            boolean b = bits.get(i);
            int half = i == 4 ? 888 : 444;
            halves.add(new boolean[] {b});
            lens.add(half);
            halves.add(new boolean[] {!b});
            lens.add(half);
        }
        merge(t, halves, lens);
    }

    /** Fusionne des demi-bits de même niveau ; supprime les pauses au début et à la fin. */
    private static void merge(List<Integer> t, List<boolean[]> levels, List<Integer> lens) {
        boolean cur = false;
        int acc = 0;
        boolean started = false;
        for (int i = 0; i < levels.size(); i++) {
            boolean lvl = levels.get(i)[0];
            int len = lens.get(i);
            if (!started) {
                if (!lvl) continue;
                started = true;
                cur = true;
                acc = len;
                continue;
            }
            if (lvl == cur) {
                acc += len;
            } else {
                t.add(acc);
                cur = lvl;
                acc = len;
            }
        }
        if (started && cur) t.add(acc);
    }

    /** Répète une trame {@code times} fois, une trame toutes les {@code periodUs} microsecondes. */
    private static void repeat(List<Integer> t, List<Integer> frame, int times, int periodUs) {
        int len = sum(frame);
        for (int k = 0; k < times; k++) {
            if (k > 0) t.add(Math.max(periodUs - len, 10000));
            t.addAll(frame);
        }
    }

    private static int sum(List<Integer> l) {
        int s = 0;
        for (int v : l) s += v;
        return s;
    }

    private static int[] toArray(List<Integer> l) {
        int[] r = new int[l.size()];
        for (int i = 0; i < r.length; i++) r[i] = l.get(i);
        return r;
    }
}
