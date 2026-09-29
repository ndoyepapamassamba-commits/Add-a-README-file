package sn.telecommande.universelle;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.Principal;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.KeyManager;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509KeyManager;
import javax.net.ssl.X509TrustManager;

/**
 * Client « Android TV Remote v2 » : le protocole de la télécommande de l'appli Google TV.
 * Port 6467 pour l'appairage (code à 6 caractères affiché sur la télé), port 6466 pour les touches.
 * Toutes les méthodes sont bloquantes : à appeler hors du fil de l'interface.
 */
public final class AtvClient {
    public static final int REMOTE_PORT = 6466;
    public static final int PAIR_PORT = 6467;

    // Fonctions annoncées à la télé : ping, touches, marche/arrêt, volume, liens d'applis
    private static final int FEATURES = 1 | 2 | 32 | 64 | 512;
    private static final int STATUS_OK = 200;
    private static final int DIRECTION_SHORT = 3;

    public interface Listener {
        /** Connexion prête (true) ou perdue (false), avec un message lisible. */
        void onConnection(boolean connected, String message);

        /** Volume signalé par la télé (niveau, maximum, muet). */
        void onVolume(int level, int max, boolean muted);
    }

    private final AtvCert identity;
    private final String clientName;
    private int remotePort = REMOTE_PORT;
    private int pairPort = PAIR_PORT;
    private int timeoutMs = 5000;

    private SSLSocket remote;
    private OutputStream remoteOut;
    private Listener listener;
    private String tvName = "";
    private long features = FEATURES;

    public AtvClient(AtvCert identity, String clientName) {
        this.identity = identity;
        this.clientName = clientName;
    }

    /** Pour les tests : autres ports que ceux de la télé. */
    void setPorts(int remote, int pair) {
        remotePort = remote;
        pairPort = pair;
    }

    public void setListener(Listener l) {
        listener = l;
    }

    public String tvName() {
        return tvName;
    }

    // ------------------------------------------------------------------ appairage

    /** Session d'appairage : {@link #start} fait apparaître le code sur la télé, {@link #finish} le valide. */
    public final class Pairing {
        private final SSLSocket s;
        private final InputStream in;
        private final OutputStream out;

        Pairing(String host) throws IOException {
            s = open(host, pairPort);
            in = s.getInputStream();
            out = s.getOutputStream();
        }

        public void start() throws IOException {
            exchange(outer(10, new Proto().string(1, "atvremote").string(2, clientName)), 11);
            Proto enc = new Proto().varint(1, 3).varint(2, 6); // hexadécimal, 6 caractères
            exchange(outer(20, new Proto().message(1, enc).varint(3, 1)), 20);
            exchange(outer(30, new Proto().message(1, enc).varint(2, 1)), 31);
        }

        /** @return false si le code ne correspond pas ; exception si la connexion échoue. */
        public boolean finish(String code) throws IOException {
            code = code.trim().toUpperCase(java.util.Locale.US);
            if (!code.matches("[0-9A-F]{6}")) return false;
            byte[] hash = pairingHash(identity.cert, (X509Certificate) s.getSession().getPeerCertificates()[0], code);
            if ((hash[0] & 0xFF) != Integer.parseInt(code.substring(0, 2), 16)) return false;
            Proto.writeFrame(out, outer(40, new Proto().bytes(1, hash)));
            Proto.Reader r = new Proto.Reader(Proto.readFrame(in));
            boolean ok = false;
            long status = 0;
            while (r.next()) {
                if (r.field == 2) status = r.varint;
                if (r.field == 41) ok = true;
            }
            close();
            return status == STATUS_OK && ok;
        }

        public void close() {
            try {
                s.close();
            } catch (IOException ignored) {
                // déjà fermé
            }
        }

        private void exchange(byte[] msg, int expectedField) throws IOException {
            Proto.writeFrame(out, msg);
            Proto.Reader r = new Proto.Reader(Proto.readFrame(in));
            long status = 0;
            boolean found = false;
            while (r.next()) {
                if (r.field == 2) status = r.varint;
                if (r.field == expectedField) {
                    found = true;
                    if (expectedField == 11 && r.bytes != null) tvName = pairingName(r.bytes);
                }
            }
            if (status != STATUS_OK || !found) {
                throw new IOException("la télé a refusé l'appairage (statut " + status + ")");
            }
        }
    }

    public Pairing pair(String host) throws IOException {
        return new Pairing(host);
    }

    private static String pairingName(byte[] ack) {
        Proto.Reader r = new Proto.Reader(ack);
        while (r.next()) if (r.field == 1 && r.bytes != null) return r.string();
        return "";
    }

    private static byte[] outer(int field, Proto inner) {
        return new Proto().varint(1, 2).varint(2, STATUS_OK).message(field, inner).toByteArray();
    }

    /** SHA-256(module client, exposant client, module télé, exposant télé, 2 derniers octets du code). */
    static byte[] pairingHash(X509Certificate client, X509Certificate server, String code) {
        try {
            RSAPublicKey c = (RSAPublicKey) client.getPublicKey();
            RSAPublicKey sv = (RSAPublicKey) server.getPublicKey();
            MessageDigest d = MessageDigest.getInstance("SHA-256");
            d.update(unsigned(c.getModulus()));
            d.update(unsigned(c.getPublicExponent()));
            d.update(unsigned(sv.getModulus()));
            d.update(unsigned(sv.getPublicExponent()));
            d.update(new byte[] {(byte) Integer.parseInt(code.substring(2, 4), 16),
                (byte) Integer.parseInt(code.substring(4, 6), 16)});
            return d.digest();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] unsigned(BigInteger v) {
        byte[] b = v.toByteArray();
        return b.length > 1 && b[0] == 0 ? Arrays.copyOfRange(b, 1, b.length) : b;
    }

    // ------------------------------------------------------------------ télécommande

    public synchronized boolean isConnected() {
        return remote != null && !remote.isClosed();
    }

    /** Ouvre la session télécommande et attend que la télé soit prête. */
    public void connect(String host) throws IOException {
        if (isConnected()) return;
        final SSLSocket s = open(host, remotePort);
        s.setSoTimeout(0);
        final InputStream in = s.getInputStream();
        final OutputStream out = s.getOutputStream();
        final CountDownLatch ready = new CountDownLatch(1);
        synchronized (this) {
            remote = s;
            remoteOut = out;
        }
        Thread reader = new Thread(new Runnable() {
            @Override
            public void run() {
                String why = "connexion perdue";
                try {
                    while (true) handle(Proto.readFrame(in), out, ready);
                } catch (IOException e) {
                    why = e.getMessage() == null ? why : e.getMessage();
                } catch (RuntimeException e) {
                    why = "message illisible de la télé";
                } finally {
                    drop(s, why);
                    ready.countDown();
                }
            }
        }, "atv-lecture");
        reader.setDaemon(true);
        reader.start();
        try {
            if (!ready.await(timeoutMs, TimeUnit.MILLISECONDS) || !isConnected()) {
                drop(s, "la télé ne répond pas");
                throw new IOException("la télé ne répond pas (appairage à refaire ?)");
            }
        } catch (InterruptedException e) {
            drop(s, "interrompu");
            throw new IOException("interrompu");
        }
        Listener l = listener;
        if (l != null) l.onConnection(true, "connecté");
    }

    private void handle(byte[] msg, OutputStream out, CountDownLatch ready) throws IOException {
        Proto.Reader r = new Proto.Reader(msg);
        while (r.next()) {
            switch (r.field) {
                case 1: { // remote_configure : la télé annonce ses fonctions
                    long tvFeatures = FEATURES;
                    Proto.Reader c = new Proto.Reader(r.bytes);
                    while (c.next()) {
                        if (c.field == 1) tvFeatures = c.varint;
                        if (c.field == 2 && c.bytes != null) tvName = deviceName(c.bytes);
                    }
                    Proto info = new Proto().string(1, clientName).string(2, "Telecommande TV").varint(3, 1)
                            .string(4, "1").string(5, "atvremote").string(6, "1.1");
                    features = FEATURES & tvFeatures;
                    write(out, new Proto().message(1, new Proto().varint(1, features).message(2, info)));
                    break;
                }
                case 2: // remote_set_active
                    write(out, new Proto().message(2, new Proto().varint(1, features)));
                    ready.countDown();
                    break;
                case 8: { // ping : on répond avec la même valeur
                    long val = 0;
                    Proto.Reader p = new Proto.Reader(r.bytes);
                    while (p.next()) if (p.field == 1) val = p.varint;
                    write(out, new Proto().message(9, new Proto().varint(1, val)));
                    break;
                }
                case 40: // remote_start : la télé est prête
                    ready.countDown();
                    break;
                case 50: { // volume
                    int level = 0;
                    int max = 0;
                    boolean muted = false;
                    Proto.Reader v = new Proto.Reader(r.bytes);
                    while (v.next()) {
                        if (v.field == 6) max = (int) v.varint;
                        if (v.field == 7) level = (int) v.varint;
                        if (v.field == 8) muted = v.varint != 0;
                    }
                    Listener l = listener;
                    if (l != null) l.onVolume(level, max, muted);
                    break;
                }
                default:
                    break;
            }
        }
    }

    private static String deviceName(byte[] info) {
        String model = "";
        String vendor = "";
        Proto.Reader r = new Proto.Reader(info);
        while (r.next()) {
            if (r.field == 1 && r.bytes != null) model = r.string();
            if (r.field == 2 && r.bytes != null) vendor = r.string();
        }
        return (vendor + " " + model).trim();
    }

    private void write(OutputStream out, Proto msg) throws IOException {
        byte[] b = msg.toByteArray();
        synchronized (out) {
            Proto.writeFrame(out, b);
        }
    }

    /** Appui court sur une touche Android (KEYCODE_*). */
    public void sendKey(int keyCode) throws IOException {
        send(new Proto().message(10, new Proto().varint(1, keyCode).varint(2, DIRECTION_SHORT)));
    }

    /** Ouvre une appli par son lien (ex. https://www.youtube.com). */
    public void launchApp(String link) throws IOException {
        send(new Proto().message(90, new Proto().string(1, link)));
    }

    private void send(Proto msg) throws IOException {
        OutputStream out;
        synchronized (this) {
            out = remoteOut;
        }
        if (out == null) throw new IOException("pas connecté");
        try {
            write(out, msg);
        } catch (IOException e) {
            SSLSocket s;
            synchronized (this) {
                s = remote;
            }
            drop(s, "connexion perdue");
            throw e;
        }
    }

    public void disconnect() {
        SSLSocket s;
        synchronized (this) {
            s = remote;
        }
        if (s != null) drop(s, "déconnecté");
    }

    private void drop(SSLSocket s, String why) {
        boolean notify;
        synchronized (this) {
            notify = remote == s && s != null;
            if (notify) {
                remote = null;
                remoteOut = null;
            }
        }
        try {
            if (s != null) s.close();
        } catch (IOException ignored) {
            // déjà fermé
        }
        Listener l = listener;
        if (notify && l != null) l.onConnection(false, why);
    }

    // ------------------------------------------------------------------ TLS

    private SSLSocket open(String host, int port) throws IOException {
        try {
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(new KeyManager[] {new ClientKeys()}, new TrustManager[] {new TrustTv()}, new SecureRandom());
            Socket raw = new Socket();
            raw.connect(new InetSocketAddress(host, port), timeoutMs);
            raw.setTcpNoDelay(true);
            SSLSocket s = (SSLSocket) ctx.getSocketFactory().createSocket(raw, host, port, true);
            s.setSoTimeout(timeoutMs);
            s.startHandshake();
            return s;
        } catch (GeneralSecurityException e) {
            throw new IOException("TLS indisponible : " + e.getMessage());
        }
    }

    /** Présente le certificat du téléphone (la télé l'exige). */
    private final class ClientKeys implements X509KeyManager {
        @Override
        public String chooseClientAlias(String[] keyType, Principal[] issuers, Socket socket) {
            return "atv";
        }

        @Override
        public X509Certificate[] getCertificateChain(String alias) {
            return new X509Certificate[] {identity.cert};
        }

        @Override
        public PrivateKey getPrivateKey(String alias) {
            return identity.key;
        }

        @Override
        public String[] getClientAliases(String keyType, Principal[] issuers) {
            return new String[] {"atv"};
        }

        @Override
        public String chooseServerAlias(String keyType, Principal[] issuers, Socket socket) {
            return null;
        }

        @Override
        public String[] getServerAliases(String keyType, Principal[] issuers) {
            return null;
        }
    }

    /**
     * La télé présente un certificat auto-signé : on l'accepte comme l'appli Google TV. L'appairage
     * protège contre l'usurpation, car le code affiché dépend de la clé publique de la télé.
     */
    private static final class TrustTv implements X509TrustManager {
        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) {}

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) {}

        @Override
        public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
        }
    }
}
