package sn.telecommande.universelle;

import android.content.Context;
import android.hardware.ConsumerIrManager;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@Implements(ConsumerIrManager.class)
public class FakeIr {
    public static final List<int[]> sent = new CopyOnWriteArrayList<int[]>();
    public static final List<Integer> freqs = new CopyOnWriteArrayList<Integer>();

    @Implementation
    protected void __constructor__(Context ctx) {}

    @Implementation
    protected boolean hasIrEmitter() {
        return true;
    }

    @Implementation
    protected void transmit(int f, int[] p) {
        freqs.add(f);
        sent.add(p);
    }

    @Implementation
    protected ConsumerIrManager.CarrierFrequencyRange[] getCarrierFrequencies() {
        return new ConsumerIrManager.CarrierFrequencyRange[0];
    }
}
