import sn.telecommande.universelle.IrCodec;
import sn.telecommande.universelle.Signal;

import java.io.BufferedReader;
import java.io.FileReader;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Vérification croisée : imprime la 1re trame de chaque code de la base (bascule 0 puis 1),
 * au même format que le banc de test compilé depuis les encodeurs C du Flipper Zero.
 * Usage : XCheck codes.txt entrees.txt sortie_java.txt
 */
public class XCheck {
    public static void main(String[] a) throws Exception {
        Set<String> uniq = new LinkedHashSet<String>();
        BufferedReader r = new BufferedReader(new FileReader(a[0]));
        String line;
        while ((line = r.readLine()) != null) {
            String[] f = line.split("\t");
            if (f[0].equals("B")) uniq.add(f[2] + " " + f[3].toLowerCase() + " " + f[4].toLowerCase());
        }
        r.close();
        StringBuilder in = new StringBuilder(), out = new StringBuilder();
        for (String u : uniq) {
            String[] p = u.split(" ");
            Signal s = Signal.parsed(p[0], Long.parseLong(p[1], 16), Long.parseLong(p[2], 16));
            for (int t = 0; t < 2; t++) {
                in.append(u).append('\n');
                int[] pat = IrCodec.encode(s, t == 1).pattern;
                out.append(u).append(':');
                for (int i = 0; i < pat.length; i++) {
                    if (i % 2 == 1 && pat[i] >= 9500 && (p[0].startsWith("SIRC") || p[0].equals("Pioneer"))) break;
                    out.append(' ').append(pat[i]);
                }
                out.append('\n');
            }
        }
        java.nio.file.Files.write(java.nio.file.Paths.get(a[1]), in.toString().getBytes("UTF-8"));
        java.nio.file.Files.write(java.nio.file.Paths.get(a[2]), out.toString().getBytes("UTF-8"));
        System.out.println(uniq.size() + " codes");
    }
}
