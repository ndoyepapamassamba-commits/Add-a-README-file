package sn.telecommande.universelle;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Handler;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Deque;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Cherche les Android TV du réseau Wi-Fi : annonce mDNS « _androidtvremote2._tcp » (comme l'appli
 * Google TV) et, en secours, balayage du réseau local sur le port 6466.
 */
final class AtvFinder {
    interface Callback {
        void found(String host, String name);

        void done();
    }

    private static final String SERVICE = "_androidtvremote2._tcp";
    private static final long DURATION_MS = 7000;

    private final Handler ui;
    private final Callback cb;
    private final NsdManager nsd;
    private final Deque<NsdServiceInfo> toResolve = new ArrayDeque<NsdServiceInfo>();
    private boolean resolving;
    private boolean running;
    private NsdManager.DiscoveryListener discovery;
    private ExecutorService scan;

    AtvFinder(Context ctx, Handler ui, Callback cb) {
        this.ui = ui;
        this.cb = cb;
        NsdManager m = null;
        try {
            m = (NsdManager) ctx.getSystemService(Context.NSD_SERVICE);
        } catch (RuntimeException | LinkageError ignored) {
            // pas de mDNS sur ce téléphone : le balayage du réseau suffira
        }
        nsd = m;
    }

    void start() {
        stop();
        running = true;
        startNsd();
        startScan();
        ui.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!running) return;
                stop();
                cb.done();
            }
        }, DURATION_MS);
    }

    void stop() {
        running = false;
        if (discovery != null && nsd != null) {
            try {
                nsd.stopServiceDiscovery(discovery);
            } catch (RuntimeException | LinkageError ignored) {
                // déjà arrêtée
            }
        }
        discovery = null;
        if (scan != null) scan.shutdownNow();
        scan = null;
        synchronized (toResolve) {
            toResolve.clear();
        }
    }

    private void report(final String host, final String name) {
        ui.post(new Runnable() {
            @Override
            public void run() {
                if (running) cb.found(host, name);
            }
        });
    }

    // ---- mDNS

    private void startNsd() {
        if (nsd == null) return;
        discovery = new NsdManager.DiscoveryListener() {
            @Override
            public void onDiscoveryStarted(String serviceType) {}

            @Override
            public void onServiceFound(NsdServiceInfo info) {
                synchronized (toResolve) {
                    toResolve.add(info);
                }
                resolveNext();
            }

            @Override
            public void onServiceLost(NsdServiceInfo info) {}

            @Override
            public void onDiscoveryStopped(String serviceType) {}

            @Override
            public void onStartDiscoveryFailed(String serviceType, int errorCode) {}

            @Override
            public void onStopDiscoveryFailed(String serviceType, int errorCode) {}
        };
        try {
            nsd.discoverServices(SERVICE, NsdManager.PROTOCOL_DNS_SD, discovery);
        } catch (RuntimeException | LinkageError e) {
            discovery = null;
        }
    }

    /** Android ne résout qu'un service à la fois : file d'attente. */
    private void resolveNext() {
        NsdServiceInfo next;
        synchronized (toResolve) {
            if (resolving || toResolve.isEmpty() || !running) return;
            resolving = true;
            next = toResolve.poll();
        }
        try {
            nsd.resolveService(next, new NsdManager.ResolveListener() {
                @Override
                public void onResolveFailed(NsdServiceInfo info, int errorCode) {
                    done();
                }

                @Override
                public void onServiceResolved(NsdServiceInfo info) {
                    InetAddress a = info.getHost();
                    if (a instanceof Inet4Address) report(a.getHostAddress(), info.getServiceName());
                    done();
                }

                private void done() {
                    synchronized (toResolve) {
                        resolving = false;
                    }
                    resolveNext();
                }
            });
        } catch (RuntimeException e) {
            synchronized (toResolve) {
                resolving = false;
            }
        }
    }

    // ---- balayage du réseau local

    private void startScan() {
        final ExecutorService pool = Executors.newFixedThreadPool(48);
        scan = pool;
        try {
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback()) continue;
                for (InetAddress a : Collections.list(nif.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || !a.isSiteLocalAddress()) continue;
                    byte[] ip = a.getAddress();
                    for (int i = 1; i < 255; i++) {
                        if (i == (ip[3] & 0xFF)) continue;
                        final String host = (ip[0] & 0xFF) + "." + (ip[1] & 0xFF) + "." + (ip[2] & 0xFF) + "." + i;
                        pool.execute(new Runnable() {
                            @Override
                            public void run() {
                                if (probe(host)) report(host, "Android TV");
                            }
                        });
                    }
                }
            }
        } catch (Exception ignored) {
            // pas d'interface réseau lisible
        }
        pool.shutdown();
    }

    static boolean probe(String host) {
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, AtvClient.REMOTE_PORT), 600);
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            try {
                s.close();
            } catch (Exception ignored) {
                // rien
            }
        }
    }
}
