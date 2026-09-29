package sn.telecommande.universelle;

import android.content.Context;
import android.hardware.ConsumerIrManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Vibrator;
import android.util.Log;

/** Envoie les trames via l'émetteur infrarouge du téléphone, sur un fil d'exécution dédié. */
public final class IrSender {
    private static final String TAG = "IrSender";
    private static final long MAX_PATTERN_US = 1900000; // l'API refuse les trames de plus de 2 s

    private final ConsumerIrManager ir;
    private final Vibrator vibrator;
    private final Handler handler;
    private boolean toggle;

    public IrSender(Context ctx) {
        ConsumerIrManager m = null;
        try {
            m = (ConsumerIrManager) ctx.getSystemService(Context.CONSUMER_IR_SERVICE);
        } catch (RuntimeException e) {
            Log.w(TAG, "Service infrarouge indisponible", e);
        }
        ir = m;
        vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        HandlerThread t = new HandlerThread("ir");
        t.start();
        handler = new Handler(t.getLooper());
    }

    public boolean hasEmitter() {
        try {
            return ir != null && ir.hasIrEmitter();
        } catch (RuntimeException e) {
            return false;
        }
    }

    public void send(final Signal s, boolean buzz) {
        if (s == null) return;
        if (buzz && vibrator != null) {
            try {
                vibrator.vibrate(25);
            } catch (RuntimeException ignored) {
                // vibration facultative
            }
        }
        handler.post(new Runnable() {
            @Override
            public void run() {
                transmit(s);
            }
        });
    }

    private void transmit(Signal s) {
        if (!hasEmitter()) return;
        try {
            IrCodec.Frame f = IrCodec.encode(s, toggle);
            toggle = !toggle;
            int[] pattern = f.pattern;
            if (f.durationUs() > MAX_PATTERN_US) pattern = truncate(pattern);
            ir.transmit(supportedFrequency(f.freq), pattern);
        } catch (RuntimeException e) {
            Log.w(TAG, "Échec d'envoi " + s.describe(), e);
        }
    }

    /** Ramène la porteuse dans une plage acceptée par le téléphone. */
    private int supportedFrequency(int freq) {
        try {
            ConsumerIrManager.CarrierFrequencyRange[] ranges = ir.getCarrierFrequencies();
            if (ranges == null || ranges.length == 0) return freq;
            int best = freq;
            int bestDist = Integer.MAX_VALUE;
            for (ConsumerIrManager.CarrierFrequencyRange r : ranges) {
                if (freq >= r.getMinFrequency() && freq <= r.getMaxFrequency()) return freq;
                int c = freq < r.getMinFrequency() ? r.getMinFrequency() : r.getMaxFrequency();
                int d = Math.abs(c - freq);
                if (d < bestDist) {
                    bestDist = d;
                    best = c;
                }
            }
            return best;
        } catch (RuntimeException e) {
            return freq;
        }
    }

    private static int[] truncate(int[] p) {
        long t = 0;
        int n = 0;
        while (n < p.length && t + p[n] <= MAX_PATTERN_US) t += p[n++];
        if (n % 2 == 0) n--; // finir sur une impulsion
        int[] out = new int[Math.max(n, 1)];
        System.arraycopy(p, 0, out, 0, out.length);
        return out;
    }
}
