package sn.telecommande.universelle;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Looper;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.SeekBar;
import android.widget.TextView;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowCameraCharacteristics;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, shadows = {FakeIr.class})
public class AppTest {

    @Before
    public void reset() {
        FakeIr.sent.clear();
        FakeIr.freqs.clear();
    }

    // ---------------------------------------------------------------- helpers
    static List<View> all(View v) {
        List<View> out = new ArrayList<View>();
        out.add(v);
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) out.addAll(all(g.getChildAt(i)));
        }
        return out;
    }

    static View root(Activity a) {
        return a.getWindow().getDecorView();
    }

    static Button button(Activity a, String text) {
        for (View v : all(root(a))) {
            if (v instanceof Button && ((Button) v).getText().toString().contains(text) && v.isShown()) return (Button) v;
        }
        fail("Bouton introuvable : " + text + "\nÉcran : " + dump(a));
        return null;
    }

    static boolean has(Activity a, String text) {
        for (View v : all(root(a))) {
            if (v instanceof TextView && ((TextView) v).getText().toString().contains(text)) return true;
        }
        return false;
    }

    static String dump(Activity a) {
        StringBuilder sb = new StringBuilder();
        for (View v : all(root(a))) if (v instanceof TextView) sb.append("[").append(((TextView) v).getText()).append("] ");
        return sb.toString();
    }

    static void click(Activity a, String text) {
        assertTrue(button(a, text).performClick());
        idle();
    }

    static void idle() {
        shadowOf(Looper.getMainLooper()).idle();
    }

    static void waitSent(int n) throws InterruptedException {
        long end = System.currentTimeMillis() + 3000;
        while (FakeIr.sent.size() < n && System.currentTimeMillis() < end) Thread.sleep(10);
        assertTrue("attendu " + n + " envois, reçu " + FakeIr.sent.size(), FakeIr.sent.size() >= n);
    }

    static void touch(View v, int action) {
        long t = SystemClock.uptimeMillis();
        MotionEvent e = MotionEvent.obtain(t, t, action, 1, 1, 0);
        v.dispatchTouchEvent(e);
        e.recycle();
    }

    // ---------------------------------------------------------------- tests
    @Test
    public void scanThenRemoteThenExplorer() throws Exception {
        ActivityController<MainActivity> ctl = Robolectric.buildActivity(MainActivity.class).setup();
        MainActivity a = ctl.get();
        assertTrue(dump(a), has(a, "Télécommande TV"));
        assertTrue(has(a, "Émetteur infrarouge détecté"));
        assertTrue(has(a, "familles de codes"));

        // Recherche auto : TESTER envoie le code Power du 1er profil (LG, NEC 0x20DF10EF)
        click(a, "Recherche automatique");
        assertTrue(dump(a), has(a, "Code 1 /"));
        click(a, "TESTER");
        waitSent(1);
        assertEquals(38000, (int) FakeIr.freqs.get(0));
        assertEquals(9000, FakeIr.sent.get(0)[0]);
        assertEquals(67, FakeIr.sent.get(0).length);

        // Suivant, précédent
        click(a, "▶");
        assertTrue(has(a, "Code 2 /"));
        waitSent(2);
        click(a, "◀");
        assertTrue(has(a, "Code 1 /"));

        // Défilement automatique : avance d'un code toutes les 1,6 s
        click(a, "Défilement automatique");
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(1700));
        assertTrue(dump(a), has(a, "Code 2 /"));
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(1700));
        assertTrue(has(a, "Code 3 /"));
        click(a, "STOP, la télé a réagi");
        assertTrue(has(a, "La télé a réagi pendant le défilement"));
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(5000));
        assertTrue("le défilement doit être arrêté", has(a, "Code 3 /"));

        // Bouton de test Muet
        click(a, "Muet");
        assertTrue(has(a, "Code 1 /"));
        click(a, "⏻ Marche/Arrêt");

        // Valider le 1er code -> télécommande
        click(a, "Ça marche, c'est ma télé");
        assertTrue(dump(a), has(a, "VOL +"));
        SharedPreferences prefs = a.getSharedPreferences("telecommande", Context.MODE_PRIVATE);
        assertNotNull(prefs.getString("profile", null));

        int before = FakeIr.sent.size();
        click(a, "⏻");
        waitSent(before + 1);
        // Appui maintenu sur VOL + : envoi immédiat puis répétitions
        Button vol = button(a, "VOL +");
        before = FakeIr.sent.size();
        touch(vol, MotionEvent.ACTION_DOWN);
        idle();
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(1000));
        touch(vol, MotionEvent.ACTION_UP);
        idle();
        waitSent(before + 3);
        int afterUp = FakeIr.sent.size();
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(1000));
        Thread.sleep(100);
        assertEquals("plus de répétition après relâchement", afterUp, FakeIr.sent.size());

        // Chiffres
        click(a, "5");

        // Mode réglage -> explorateur pour Source
        click(a, "Régler");
        assertTrue(has(a, "Mode réglage"));
        click(a, "Source");
        assertTrue(dump(a), has(a, "Régler « Source »"));
        assertTrue(has(a, "Essai "));
        before = FakeIr.sent.size();
        click(a, "▶");
        waitSent(before + 1);
        click(a, "ENVOYER");
        click(a, "C'est ce code");
        assertTrue(has(a, "VOL +"));
        String key = null;
        for (String k : prefs.getAll().keySet()) if (k.startsWith("ovr:") && k.endsWith(":SOURCE")) key = k;
        assertNotNull("réglage enregistré", key);

        // Appui long -> explorateur, défilement auto puis retour
        assertTrue(button(a, "Menu").performLongClick());
        idle();
        assertTrue(has(a, "Régler « Menu »"));
        click(a, "Défilement automatique");
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(2800));
        click(a, "Pause");
        click(a, "Code d'origine");
        assertTrue(has(a, "VOL +"));

        // Relance de l'appli : on revient directement sur la télécommande
        ctl.pause().stop().destroy();
        MainActivity b = Robolectric.buildActivity(MainActivity.class).setup().get();
        assertTrue(has(b, "VOL +"));
        click(b, "⚙");
        assertTrue(has(b, "Télé configurée"));
        click(b, "Chercher par marque");
        EditText filter = null;
        for (View v : all(root(b))) if (v instanceof EditText) filter = (EditText) v;
        filter.setText("sams");
        idle();
        click(b, "Samsung");
        assertTrue(dump(b), has(b, "Marque : Samsung"));
        before = FakeIr.sent.size();
        click(b, "TESTER");
        waitSent(before + 1);
        assertEquals(4500, FakeIr.sent.get(FakeIr.sent.size() - 1)[0]);
        b.onBackPressed();
        idle();
        click(b, "Aide");
        assertTrue(has(b, "Rien ne marche"));
        b.onBackPressed();
        idle();
        click(b, "Lampe torche");
        Intent next = shadowOf(b).getNextStartedActivity();
        assertEquals(LampActivity.class.getName(), next.getComponent().getClassName());
    }

    @Test
    public void everyProfileEncodes() throws Exception {
        CodeDb db = CodeDb.load(org.robolectric.RuntimeEnvironment.getApplication().getAssets().open("codes.txt"));
        assertTrue(db.profiles.size() > 400);
        int n = 0;
        for (CodeDb.Profile p : db.profiles) {
            assertNotNull(p.label, p.power());
            for (Signal s : p.buttons.values()) {
                IrCodec.Frame f = IrCodec.encode(s, false);
                assertTrue(f.pattern.length % 2 == 1);
                assertTrue(f.freq >= 30000 && f.freq <= 60000);
                n++;
            }
        }
        System.out.println("profils=" + db.profiles.size() + " signaux=" + n + " marques=" + db.brands().size());
    }

    @Test
    public void lampScreenAndTorch() throws Exception {
        Context ctx = org.robolectric.RuntimeEnvironment.getApplication();
        CameraManager cm = (CameraManager) ctx.getSystemService(Context.CAMERA_SERVICE);
        CameraCharacteristics ch = ShadowCameraCharacteristics.newCameraCharacteristics();
        ShadowCameraCharacteristics sch = shadowOf(ch);
        sch.set(CameraCharacteristics.FLASH_INFO_AVAILABLE, true);
        sch.set(CameraCharacteristics.LENS_FACING, CameraCharacteristics.LENS_FACING_BACK);
        shadowOf(cm).addCamera("0", ch);

        ActivityController<LampActivity> ctl = Robolectric.buildActivity(LampActivity.class).setup();
        LampActivity a = ctl.get();
        idle();
        // Téléphone avec flash : onglet LED actif et LED allumée d'office
        assertTrue(dump(a), has(a, "ÉTEINDRE"));
        assertTrue("LED allumée", shadowOf(cm).getTorchMode("0"));
        click(a, "ÉTEINDRE");
        assertFalse(shadowOf(cm).getTorchMode("0"));
        click(a, "SOS");
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(3000));
        click(a, "Clignotant");
        assertTrue(has(a, "éclairs / seconde"));
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(500));

        // Écran couleur
        click(a, "Écran couleur");
        assertFalse("LED éteinte en mode écran", shadowOf(cm).getTorchMode("0"));
        click(a, "Fixe");
        assertTrue(has(a, "Couleur libre"));
        WindowManager.LayoutParams w = a.getWindow().getAttributes();
        assertEquals(1f, w.screenBrightness, 0.001f);
        // Pastille rouge
        View red = null;
        for (View v : all(root(a))) if ("Rouge".contentEquals(String.valueOf(v.getContentDescription()))) red = v;
        assertTrue(red.performClick());
        idle();
        // Curseur de teinte (couleur libre)
        SeekBar hue = null;
        for (View v : all(root(a))) if (v instanceof SeekBar && ((SeekBar) v).getMax() == 360) hue = (SeekBar) v;
        shadowOf(hue).getOnSeekBarChangeListener().onProgressChanged(hue, 200, true);
        shadowOf(hue).getOnSeekBarChangeListener().onStopTrackingTouch(hue);
        idle();
        click(a, "Arc-en-ciel");
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(400));
        click(a, "Police");
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(400));
        // Toucher la lumière cache le panneau
        View light = ((ViewGroup) ((ViewGroup) a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0);
        assertTrue(light.performClick());
        idle();
        for (View v : all(root(a))) {
            if (v instanceof Button && ((Button) v).getText().toString().contains("TEINDRE")) {
                assertFalse("panneau caché", v.isShown());
            }
        }
        assertTrue(light.performClick());
        click(a, "LED arrière");
        assertTrue(shadowOf(cm).getTorchMode("0"));
        ctl.pause().stop().destroy();
        assertFalse("LED éteinte en quittant", shadowOf(cm).getTorchMode("0"));
    }

    @Test
    public void lampWithoutFlashFallsBackToScreen() {
        LampActivity a = Robolectric.buildActivity(LampActivity.class).setup().get();
        idle();
        assertTrue(dump(a), has(a, "Couleur libre"));
        assertEquals(1f, a.getWindow().getAttributes().screenBrightness, 0.001f);
        click(a, "LED arrière");
        assertTrue(has(a, "ne permet pas de piloter sa LED"));
    }
}
