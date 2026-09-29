package sn.telecommande.universelle;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Base de codes TV (assets/codes.txt). Chaque « profil » correspond à une famille de
 * télécommandes : un code Power commun et les autres boutons connus.
 * Les profils sont triés du plus courant au plus rare.
 */
public final class CodeDb {

    public static final class Profile {
        public final int index;
        public final String label;
        public final int files;
        public final Map<String, Signal> buttons = new LinkedHashMap<String, Signal>();

        Profile(int index, String label, int files) {
            this.index = index;
            this.label = label;
            this.files = files;
        }

        public Signal power() {
            return buttons.get("POWER");
        }

        /** Identifiant stable (ne dépend pas de l'ordre dans la base). */
        public String id() {
            Signal p = power();
            return label + "#" + (p == null ? "" : p.key());
        }
    }

    public final List<Profile> profiles = new ArrayList<Profile>();

    public static CodeDb load(InputStream in) throws IOException {
        CodeDb db = new CodeDb();
        BufferedReader r = new BufferedReader(new InputStreamReader(in, "UTF-8"), 65536);
        Profile cur = null;
        String line;
        while ((line = r.readLine()) != null) {
            if (line.isEmpty() || line.charAt(0) == '#') continue;
            String[] f = line.split("\t");
            switch (f[0]) {
                case "P":
                    cur = new Profile(db.profiles.size(), f[1], Integer.parseInt(f[2]));
                    db.profiles.add(cur);
                    break;
                case "B":
                    if (cur != null) {
                        cur.buttons.put(f[1], Signal.parsed(f[2], Long.parseLong(f[3], 16), Long.parseLong(f[4], 16)));
                    }
                    break;
                case "R":
                    if (cur != null) {
                        String[] d = f[3].split(",");
                        int[] raw = new int[d.length];
                        for (int i = 0; i < d.length; i++) raw[i] = Integer.parseInt(d[i]);
                        cur.buttons.put(f[1], Signal.raw(Integer.parseInt(f[2]), raw));
                    }
                    break;
                default:
                    break;
            }
        }
        r.close();
        return db;
    }

    public Profile findById(String id) {
        if (id == null) return null;
        for (Profile p : profiles) if (p.id().equals(id)) return p;
        return null;
    }

    /** Marques présentes dans la base, avec le nombre de profils où elles apparaissent. */
    public List<String[]> brands() {
        TreeMap<String, Integer> count = new TreeMap<String, Integer>(String.CASE_INSENSITIVE_ORDER);
        for (Profile p : profiles) {
            for (String b : p.label.split(" / ")) {
                Integer n = count.get(b);
                count.put(b, n == null ? 1 : n + 1);
            }
        }
        List<String[]> out = new ArrayList<String[]>();
        for (Map.Entry<String, Integer> e : count.entrySet()) {
            out.add(new String[] {e.getKey(), String.valueOf(e.getValue())});
        }
        return out;
    }

    /** Indices des profils à tester avec un bouton donné, éventuellement limités à une marque. */
    public List<Integer> candidates(String button, String brand) {
        List<Integer> out = new ArrayList<Integer>();
        for (Profile p : profiles) {
            if (!p.buttons.containsKey(button)) continue;
            if (brand != null) {
                boolean match = false;
                for (String b : p.label.split(" / ")) if (b.equalsIgnoreCase(brand)) match = true;
                if (!match) continue;
            }
            out.add(p.index);
        }
        return Collections.unmodifiableList(out);
    }
}
