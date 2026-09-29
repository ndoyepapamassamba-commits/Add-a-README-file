package sn.telecommande.universelle;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Classe les commandes à essayer pour un bouton, de la plus probable à la moins probable.
 *
 * Plusieurs familles de télécommandes partagent la même adresse (ex. NEC « 00 BF » : Hisense,
 * BGH, Manta…) mais pas la même disposition. Chaque disposition connue vote pour sa commande,
 * avec un poids multiplié par 4 pour chaque bouton déjà confirmé qui concorde et divisé par 4
 * pour chaque désaccord (bouton confirmé différent, ou code déjà refusé pour ce bouton).
 * Viennent ensuite les chiffres déduits des chiffres déjà trouvés, puis tous les autres codes.
 */
public final class Suggest {

    public static final class Result {
        /** Commandes dans l'ordre où les essayer. */
        public final long[] cmds;
        /** Les {@code suggested} premières viennent de la base ou d'une déduction. */
        public final int suggested;
        /** Origine de chaque suggestion (marques), vide pour les codes « en aveugle ». */
        public final String[] origins;

        Result(long[] cmds, int suggested, String[] origins) {
            this.cmds = cmds;
            this.suggested = suggested;
            this.origins = origins;
        }

        public int indexOf(long cmd) {
            for (int i = 0; i < cmds.length; i++) if (cmds[i] == cmd) return i;
            return -1;
        }
    }

    private Suggest() {}

    /**
     * @param ref       code de référence de la télé (protocole + adresse), en général son Power
     * @param button    bouton à trouver (VOL_UP, N5…)
     * @param confirmed boutons déjà confirmés sur cette télé → commande
     * @param rejected  commandes déjà refusées par bouton (peut être vide)
     * @param current   commande actuellement associée au bouton (essayée en premier), ou null
     */
    public static Result candidates(List<CodeDb.Layout> layouts, Signal ref, String button,
                                    Map<String, Long> confirmed, Map<String, Set<Long>> rejected, Long current) {
        Set<Long> excluded = new LinkedHashSet<Long>();
        for (Map.Entry<String, Long> e : confirmed.entrySet()) {
            if (!e.getKey().equals(button)) excluded.add(e.getValue());
        }
        Set<Long> refused = rejected.get(button);
        if (refused != null) excluded.addAll(refused);

        LinkedHashMap<Long, String> ordered = new LinkedHashMap<Long, String>();

        // 1. Chiffres : les télécommandes numérotent presque toujours leurs chiffres à la suite.
        if (button.length() == 2 && button.charAt(0) == 'N') {
            int j = button.charAt(1) - '0';
            for (Map.Entry<String, Long> e : confirmed.entrySet()) {
                String k = e.getKey();
                if (k.length() != 2 || k.charAt(0) != 'N') continue;
                long base = IrCodec.commandNumber(ref.withCommand(e.getValue())) - (k.charAt(1) - '0');
                addGuess(ordered, excluded, ref, base + j, "suite des chiffres");
                if (j == 0) addGuess(ordered, excluded, ref, base + 10, "suite des chiffres");
            }
        }
        if (current != null && !excluded.contains(current) && !ordered.containsKey(current)) {
            ordered.put(current, "code actuel");
        }

        // 2. Vote des dispositions connues, pondéré par leur accord avec ce qui est confirmé.
        Map<Long, Double> score = new HashMap<Long, Double>();
        Map<Long, Set<String>> origin = new HashMap<Long, Set<String>>();
        for (CodeDb.Layout l : layouts) {
            Long c = l.cmds.get(button);
            if (c == null) continue;
            int agree = 0;
            int disagree = 0;
            for (Map.Entry<String, Long> e : confirmed.entrySet()) {
                Long mine = l.cmds.get(e.getKey());
                if (mine == null || e.getKey().equals(button)) continue;
                if (mine.longValue() == e.getValue().longValue()) agree++;
                else disagree++;
            }
            for (Map.Entry<String, Set<Long>> e : rejected.entrySet()) {
                Long mine = l.cmds.get(e.getKey());
                if (mine != null && e.getValue().contains(mine)) disagree++;
            }
            double w = l.files * Math.pow(4, agree - disagree);
            Double old = score.get(c);
            score.put(c, old == null ? w : old + w);
            Set<String> o = origin.get(c);
            if (o == null) {
                o = new LinkedHashSet<String>();
                origin.put(c, o);
            }
            for (String b : l.label.split(" / ")) o.add(b);
        }
        List<Long> byScore = new ArrayList<Long>(score.keySet());
        final Map<Long, Double> sc = score;
        java.util.Collections.sort(byScore, new java.util.Comparator<Long>() {
            @Override
            public int compare(Long a, Long b) {
                return Double.compare(sc.get(b), sc.get(a));
            }
        });
        for (Long c : byScore) {
            if (excluded.contains(c) || ordered.containsKey(c)) continue;
            ordered.put(c, join(origin.get(c)));
        }
        int suggested = ordered.size();

        // 3. Tous les autres codes possibles pour cette télé.
        for (long c : IrCodec.commandRange(ref)) {
            if (!excluded.contains(c) && !ordered.containsKey(c)) ordered.put(c, "");
        }

        long[] cmds = new long[ordered.size()];
        String[] origins = new String[ordered.size()];
        int i = 0;
        for (Map.Entry<Long, String> e : ordered.entrySet()) {
            cmds[i] = e.getKey();
            origins[i] = e.getValue();
            i++;
        }
        return new Result(cmds, suggested, origins);
    }

    /** Boutons déjà sûrs pour cette télé : Power (trouvé par la recherche) + réglages confirmés. */
    public static Map<String, Long> confirmed(Signal ref, Signal power, Map<String, Signal> overrides) {
        Map<String, Long> out = new LinkedHashMap<String, Long>();
        if (power != null && !power.isRaw() && power.proto.equals(ref.proto) && power.addr == ref.addr) {
            out.put("POWER", power.cmd);
        }
        for (Map.Entry<String, Signal> e : overrides.entrySet()) {
            Signal s = e.getValue();
            if (s != null && !s.isRaw() && s.proto.equals(ref.proto) && s.addr == ref.addr) {
                out.put(e.getKey(), s.cmd);
            }
        }
        return out;
    }

    private static void addGuess(Map<Long, String> ordered, Set<Long> excluded, Signal ref, long number, String why) {
        long[] range = IrCodec.commandRange(ref);
        if (number < 0 || number >= range.length) return;
        long c = range[(int) number];
        if (!excluded.contains(c) && !ordered.containsKey(c)) ordered.put(c, why);
    }

    private static String join(Set<String> s) {
        StringBuilder sb = new StringBuilder();
        int n = 0;
        for (String x : s) {
            if (n == 3) {
                sb.append("…");
                break;
            }
            if (n > 0) sb.append(", ");
            sb.append(x);
            n++;
        }
        return sb.toString();
    }
}
