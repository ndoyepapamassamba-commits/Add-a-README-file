package sn.telecommande.universelle;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.PKCS8EncodedKeySpec;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Identité du téléphone auprès de la télé : clé RSA 2048 et certificat X.509 auto-signé.
 * Android n'a pas d'API publique pour créer un certificat : on l'encode directement en DER.
 */
final class AtvCert {
    final PrivateKey key;
    final X509Certificate cert;

    private AtvCert(PrivateKey key, X509Certificate cert) {
        this.key = key;
        this.cert = cert;
    }

    static AtvCert generate(String commonName) throws GeneralSecurityException {
        KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
        g.initialize(2048, new SecureRandom());
        KeyPair kp = g.generateKeyPair();
        byte[] sha256WithRsa = der(0x30, cat(der(0x06, new byte[] {
            0x2A, (byte) 0x86, 0x48, (byte) 0x86, (byte) 0xF7, 0x0D, 0x01, 0x01, 0x0B}), der(0x05, new byte[0])));
        byte[] name = der(0x30, der(0x31, der(0x30, cat(der(0x06, new byte[] {0x55, 0x04, 0x03}),
                der(0x0C, commonName.getBytes(java.nio.charset.Charset.forName("UTF-8")))))));
        long now = System.currentTimeMillis();
        byte[] validity = der(0x30, cat(utcTime(new Date(now - 86400000L)),
                utcTime(new Date(now + 20L * 365 * 86400000L))));
        byte[] serial = der(0x02, BigInteger.valueOf(now / 1000).toByteArray());
        byte[] version = der(0xA0, der(0x02, new byte[] {2}));
        byte[] tbs = der(0x30, cat(version, serial, sha256WithRsa, name, validity, name,
                kp.getPublic().getEncoded()));
        Signature s = Signature.getInstance("SHA256withRSA");
        s.initSign(kp.getPrivate());
        s.update(tbs);
        byte[] sig = s.sign();
        byte[] bitString = new byte[sig.length + 1];
        System.arraycopy(sig, 0, bitString, 1, sig.length); // 0 bit inutilisé
        byte[] certDer = der(0x30, cat(tbs, sha256WithRsa, der(0x03, bitString)));
        return new AtvCert(kp.getPrivate(), parseCert(certDer));
    }

    static AtvCert load(byte[] pkcs8Key, byte[] certDer) throws GeneralSecurityException {
        PrivateKey k = KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(pkcs8Key));
        return new AtvCert(k, parseCert(certDer));
    }

    byte[] keyBytes() {
        return key.getEncoded();
    }

    byte[] certBytes() throws GeneralSecurityException {
        return cert.getEncoded();
    }

    private static X509Certificate parseCert(byte[] der) throws GeneralSecurityException {
        return (X509Certificate) CertificateFactory.getInstance("X.509")
                .generateCertificate(new ByteArrayInputStream(der));
    }

    private static byte[] utcTime(Date d) {
        SimpleDateFormat f = new SimpleDateFormat("yyMMddHHmmss'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return der(0x17, f.format(d).getBytes(java.nio.charset.Charset.forName("US-ASCII")));
    }

    private static byte[] der(int tag, byte[] content) {
        ByteArrayOutputStream o = new ByteArrayOutputStream(content.length + 6);
        o.write(tag);
        int len = content.length;
        if (len < 0x80) {
            o.write(len);
        } else if (len < 0x100) {
            o.write(0x81);
            o.write(len);
        } else if (len < 0x10000) {
            o.write(0x82);
            o.write(len >> 8);
            o.write(len);
        } else {
            o.write(0x83);
            o.write(len >> 16);
            o.write(len >> 8);
            o.write(len);
        }
        o.write(content, 0, content.length);
        return o.toByteArray();
    }

    private static byte[] cat(byte[]... parts) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        for (byte[] p : parts) o.write(p, 0, p.length);
        return o.toByteArray();
    }
}
