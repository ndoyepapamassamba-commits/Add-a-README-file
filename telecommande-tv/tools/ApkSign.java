import com.android.apksig.ApkSigner;
import com.android.apksig.ApkSignerEngine;
import com.android.apksig.ApkVerifier;
import com.android.apksig.DefaultApkSignerEngine;
import com.android.apksig.util.DataSource;

import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

/**
 * Ajoute la signature v2 à un APK déjà signé en v1 par jarsigner, puis vérifie le résultat.
 * (apksig 2.3.0 ne sait plus produire la v1 sur les JDK récents : on garde celle de jarsigner.)
 * Usage : ApkSign keystore motdepasse alias entrée.apk sortie.apk
 */
public class ApkSign {

    /** Moteur apksig (v2 seule) qui recopie tels quels les fichiers de signature v1 existants. */
    static final class KeepV1Engine implements ApkSignerEngine {
        private final ApkSignerEngine d;

        KeepV1Engine(ApkSignerEngine d) {
            this.d = d;
        }

        @Override
        public void inputApkSigningBlock(DataSource block) throws java.io.IOException,
                com.android.apksig.apk.ApkFormatException {
            d.inputApkSigningBlock(block);
        }

        @Override
        public InputJarEntryInstructions inputJarEntry(String name) {
            if (name.startsWith("META-INF/")) {
                return new InputJarEntryInstructions(InputJarEntryInstructions.OutputPolicy.OUTPUT);
            }
            return d.inputJarEntry(name);
        }

        @Override
        public InspectJarEntryRequest outputJarEntry(String name) {
            return d.outputJarEntry(name);
        }

        @Override
        public InputJarEntryInstructions.OutputPolicy inputJarEntryRemoved(String name) {
            return d.inputJarEntryRemoved(name);
        }

        @Override
        public void outputJarEntryRemoved(String name) {
            d.outputJarEntryRemoved(name);
        }

        @Override
        public OutputJarSignatureRequest outputJarEntries() throws com.android.apksig.apk.ApkFormatException,
                java.security.NoSuchAlgorithmException, java.security.InvalidKeyException,
                java.security.SignatureException {
            return d.outputJarEntries();
        }

        @Override
        public OutputApkSigningBlockRequest outputZipSections(DataSource entries, DataSource cd, DataSource eocd)
                throws java.io.IOException, com.android.apksig.apk.ApkFormatException,
                java.security.NoSuchAlgorithmException, java.security.InvalidKeyException,
                java.security.SignatureException {
            return d.outputZipSections(entries, cd, eocd);
        }

        @Override
        public void outputDone() {
            d.outputDone();
        }

        @Override
        public void close() {
            d.close();
        }
    }

    public static void main(String[] a) throws Exception {
        KeyStore ks = KeyStore.getInstance("PKCS12");
        char[] pw = a[1].toCharArray();
        try (FileInputStream in = new FileInputStream(a[0])) {
            ks.load(in, pw);
        }
        PrivateKey key = (PrivateKey) ks.getKey(a[2], pw);
        X509Certificate cert = (X509Certificate) ks.getCertificate(a[2]);
        DefaultApkSignerEngine.SignerConfig cfg = new DefaultApkSignerEngine.SignerConfig.Builder("CERT", key,
                Collections.singletonList(cert)).build();
        DefaultApkSignerEngine engine = new DefaultApkSignerEngine.Builder(Collections.singletonList(cfg), 21)
                .setV1SigningEnabled(false)
                .setV2SigningEnabled(true)
                .build();
        new ApkSigner.Builder(new KeepV1Engine(engine))
                .setInputApk(new File(a[3]))
                .setOutputApk(new File(a[4]))
                .build()
                .sign();
        ApkVerifier.Result r = new ApkVerifier.Builder(new File(a[4])).build().verify();
        System.out.println("verified=" + r.isVerified() + " v1=" + r.isVerifiedUsingV1Scheme()
                + " v2=" + r.isVerifiedUsingV2Scheme());
        for (ApkVerifier.IssueWithParams e : r.getErrors()) System.out.println("ERROR " + e);
        for (ApkVerifier.IssueWithParams w : r.getWarnings()) System.out.println("WARN " + w);
        if (!r.isVerified() || !r.isVerifiedUsingV1Scheme() || !r.isVerifiedUsingV2Scheme()) System.exit(1);
    }
}
