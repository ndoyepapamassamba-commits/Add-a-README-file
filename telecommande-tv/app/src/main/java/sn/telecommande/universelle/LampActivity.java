package sn.telecommande.universelle;

import android.app.Activity;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

/**
 * Lampe torche : LED arrière (à la puissance maximale quand le téléphone le permet)
 * ou écran plein écran à luminosité maximale, avec la couleur de son choix.
 */
public class LampActivity extends Activity {

    private static final int PANEL = 0xE6101418;
    private static final int KEY = 0xFF2A313A;
    private static final int ACTIVE = 0xFF1976D2;
    private static final int SUB = 0xFF9AA5B1;

    private static final int MODE_FIXE = 0;
    private static final int MODE_FLASH = 1;
    private static final int MODE_SOS = 2;
    private static final int MODE_ARC = 3;
    private static final int MODE_POLICE = 4;

    /** Morse S-O-S en unités de 200 ms : durées allumé / éteint alternées. */
    private static final int[] SOS = {1, 1, 1, 1, 1, 3, 3, 1, 3, 1, 3, 3, 1, 1, 1, 1, 1, 7};

    private static final int[] PALETTE = {
        0xFFFFFFFF, 0xFFFFE9C4, 0xFFFFEB3B, 0xFFFF9800, 0xFFFF1744,
        0xFFFF4081, 0xFFD500F9, 0xFF2962FF, 0xFF00E5FF, 0xFF00E676,
    };
    private static final String[] PALETTE_NAMES = {
        "Blanc", "Blanc chaud", "Jaune", "Orange", "Rouge", "Rose", "Violet", "Bleu", "Cyan", "Vert",
    };

    private final Handler ui = new Handler(Looper.getMainLooper());
    private CameraManager cameras;
    private String torchId;
    private int torchMaxLevel = 1;
    private int torchLevel = 1;

    private boolean screenTab = true;
    private boolean running;
    private int mode = MODE_FIXE;
    private int speed = 5; // éclairs par seconde (mode clignotant)
    private int color = 0xFFFFFFFF;
    private float hue = 0f;
    private float saturation = 1f;
    private float brightness = 1f;
    private int step;
    private Runnable ticker;

    private View light;
    private LinearLayout panel;
    private ScrollView panelScroll;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        findTorch();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        light = new View(this);
        light.setBackgroundColor(Color.BLACK);
        light.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                // Toucher la lumière masque / affiche les réglages (plein écran total quand ils sont cachés)
                boolean hide = panelScroll.getVisibility() == View.VISIBLE;
                panelScroll.setVisibility(hide ? View.GONE : View.VISIBLE);
                getWindow().getDecorView().setSystemUiVisibility(hide
                        ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        : View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
            }
        });
        root.addView(light, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        panelScroll = new ScrollView(this);
        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(16), dp(14), dp(16), dp(16));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(PANEL);
        bg.setCornerRadii(new float[] {dp(22), dp(22), dp(22), dp(22), 0, 0, 0, 0});
        panel.setBackground(bg);
        panelScroll.addView(panel);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(panelScroll, lp);
        setContentView(root);

        screenTab = torchId == null;
        start(); // la lampe s'allume dès l'ouverture
        buildPanel();
    }

    @Override
    protected void onDestroy() {
        stopTicker();
        setTorch(false);
        super.onDestroy();
    }

    // ------------------------------------------------------------------ LED arrière

    private void findTorch() {
        if (Build.VERSION.SDK_INT < 23) return;
        try {
            cameras = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
            for (String id : cameras.getCameraIdList()) {
                CameraCharacteristics c = cameras.getCameraCharacteristics(id);
                Boolean flash = c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                Integer facing = c.get(CameraCharacteristics.LENS_FACING);
                if (Boolean.TRUE.equals(flash) && facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                    torchId = id;
                    if (Build.VERSION.SDK_INT >= 33) {
                        Integer max = c.get(CameraCharacteristics.FLASH_INFO_STRENGTH_MAXIMUM_LEVEL);
                        if (max != null && max > 1) torchMaxLevel = max;
                    }
                    torchLevel = torchMaxLevel;
                    return;
                }
            }
        } catch (Exception e) {
            torchId = null;
        }
    }

    private void setTorch(boolean on) {
        if (torchId == null || cameras == null) return;
        try {
            if (on && Build.VERSION.SDK_INT >= 33 && torchMaxLevel > 1) {
                cameras.turnOnTorchWithStrengthLevel(torchId, Math.max(1, torchLevel));
            } else if (Build.VERSION.SDK_INT >= 23) {
                cameras.setTorchMode(torchId, on);
            }
        } catch (Exception e) {
            // caméra occupée par une autre appli : on ignore
        }
    }

    // ------------------------------------------------------------------ allumage et effets

    private void start() {
        stopTicker();
        running = true;
        step = 0;
        if (mode == MODE_FIXE) {
            apply(true);
            return;
        }
        ticker = new Runnable() {
            @Override
            public void run() {
                if (ticker != this) return;
                long delay;
                if (mode == MODE_FLASH) {
                    apply(step % 2 == 0);
                    delay = 500 / Math.max(1, speed);
                } else if (mode == MODE_SOS) {
                    int i = step % SOS.length;
                    apply(i % 2 == 0);
                    delay = SOS[i] * 200L;
                } else if (mode == MODE_ARC) {
                    hue = (hue + 3f) % 360f;
                    color = Color.HSVToColor(new float[] {hue, 1f, 1f});
                    apply(true);
                    delay = 40;
                } else { // police : rouge / bleu en alternance
                    color = (step / 4) % 2 == 0 ? 0xFFFF1744 : 0xFF2962FF;
                    apply(step % 2 == 0);
                    delay = 70;
                }
                step++;
                ui.postDelayed(this, delay);
            }
        };
        ui.post(ticker);
    }

    private void stop() {
        stopTicker();
        running = false;
        apply(false);
    }

    private void stopTicker() {
        if (ticker != null) ui.removeCallbacks(ticker);
        ticker = null;
    }

    /** Allume ou éteint la source choisie (LED ou écran). */
    private void apply(boolean on) {
        float wanted = screenTab && running ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL
                : WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
        WindowManager.LayoutParams w = getWindow().getAttributes();
        if (w.screenBrightness != wanted) {
            w.screenBrightness = wanted;
            getWindow().setAttributes(w);
        }
        if (screenTab) {
            light.setBackgroundColor(on ? scaled(color) : Color.BLACK);
        } else {
            light.setBackgroundColor(Color.BLACK);
            setTorch(on);
        }
    }

    private int scaled(int c) {
        if (brightness >= 0.999f) return c;
        float[] hsv = new float[3];
        Color.colorToHSV(c, hsv);
        hsv[2] *= brightness;
        return Color.HSVToColor(hsv);
    }

    // ------------------------------------------------------------------ panneau de réglages

    private void buildPanel() {
        panel.removeAllViews();
        LinearLayout tabs = row();
        tabs.addView(toggle("🔦 LED arrière", !screenTab, new Runnable() {
            @Override
            public void run() {
                screenTab = false;
                if (mode == MODE_ARC || mode == MODE_POLICE) mode = MODE_FIXE;
                rebuildAndRestart();
            }
        }), weight(1, 48));
        tabs.addView(toggle("📱 Écran couleur", screenTab, new Runnable() {
            @Override
            public void run() {
                screenTab = true;
                rebuildAndRestart();
            }
        }), weight(1, 48));
        panel.addView(tabs);

        Button power = key(running ? "⏻  ÉTEINDRE" : "⏻  ALLUMER", running ? 0xFFD32F2F : 0xFF2E7D32, 20);
        power.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (running) stop();
                else start();
                buildPanel();
            }
        });
        LinearLayout.LayoutParams plp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(60));
        plp.setMargins(dp(4), dp(8), dp(4), dp(4));
        panel.addView(power, plp);

        if (!screenTab && torchId == null) {
            panel.addView(text("Ce téléphone ne permet pas de piloter sa LED arrière (pas de flash, ou "
                    + "Android 5). Utilise l'écran couleur.", 14, 0xFFE57373));
        }

        panel.addView(text("Effet", 13, SUB));
        LinearLayout modes = row();
        addMode(modes, "Fixe", MODE_FIXE);
        addMode(modes, "Clignotant", MODE_FLASH);
        addMode(modes, "SOS", MODE_SOS);
        panel.addView(modes);
        if (screenTab) {
            LinearLayout modes2 = row();
            addMode(modes2, "🌈 Arc-en-ciel", MODE_ARC);
            addMode(modes2, "🚨 Police", MODE_POLICE);
            panel.addView(modes2);
        }
        if (mode == MODE_FLASH) {
            panel.addView(text("Vitesse : " + speed + " éclairs / seconde", 13, SUB));
            panel.addView(slider(20, speed - 1, new Slider() {
                @Override
                public void changed(int v) {
                    speed = v + 1;
                }
            }));
        }

        if (!screenTab && torchMaxLevel > 1) {
            panel.addView(text("Puissance de la LED : " + (torchLevel * 100 / torchMaxLevel) + " %", 13, SUB));
            panel.addView(slider(torchMaxLevel - 1, torchLevel - 1, new Slider() {
                @Override
                public void changed(int v) {
                    torchLevel = v + 1;
                    if (running && mode == MODE_FIXE) setTorch(true);
                }
            }));
        }

        if (screenTab) {
            panel.addView(text("Couleur (touche l'écran allumé pour cacher ce panneau)", 13, SUB));
            for (int r = 0; r < 2; r++) {
                LinearLayout sw = row();
                for (int i = r * 5; i < r * 5 + 5; i++) sw.addView(swatch(i), weight(1, 46));
                panel.addView(sw);
            }
            panel.addView(text("Couleur libre : teinte", 13, SUB));
            panel.addView(slider(360, (int) hue, new Slider() {
                @Override
                public void changed(int v) {
                    hue = v;
                    pickFree();
                }
            }));
            panel.addView(text("Blanc  ↔  couleur vive", 13, SUB));
            panel.addView(slider(100, (int) (saturation * 100), new Slider() {
                @Override
                public void changed(int v) {
                    saturation = v / 100f;
                    pickFree();
                }
            }));
            panel.addView(text("Intensité de la couleur", 13, SUB));
            panel.addView(slider(90, (int) (brightness * 100) - 10, new Slider() {
                @Override
                public void changed(int v) {
                    brightness = (v + 10) / 100f;
                    if (running && mode != MODE_ARC) apply(true);
                }
            }));
        }
        Button close = key("↩  Retour à la télécommande", KEY, 15);
        close.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
        clp.setMargins(dp(4), dp(10), dp(4), 0);
        panel.addView(close, clp);
    }

    private void pickFree() {
        color = Color.HSVToColor(new float[] {hue, saturation, 1f});
        if (mode == MODE_ARC || mode == MODE_POLICE) {
            mode = MODE_FIXE;
            buildPanel();
        }
        if (running) start();
    }

    private void rebuildAndRestart() {
        stopTicker();
        setTorch(false);
        light.setBackgroundColor(Color.BLACK);
        buildPanel();
        if (running) start();
    }

    private void addMode(LinearLayout row, String label, final int m) {
        row.addView(toggle(label, mode == m, new Runnable() {
            @Override
            public void run() {
                mode = m;
                running = true;
                buildPanel();
                start();
            }
        }), weight(1, 44));
    }

    private View swatch(final int i) {
        final int c = PALETTE[i];
        Button b = new Button(this);
        b.setStateListAnimator(null);
        GradientDrawable g = new GradientDrawable();
        g.setColor(c);
        g.setCornerRadius(dp(12));
        if (c == color) g.setStroke(dp(3), 0xFF1976D2);
        b.setBackground(g);
        b.setContentDescription(PALETTE_NAMES[i]);
        b.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                color = c;
                if (mode == MODE_ARC || mode == MODE_POLICE) mode = MODE_FIXE;
                running = true;
                buildPanel();
                start();
            }
        });
        return b;
    }

    // ------------------------------------------------------------------ outils d'interface

    private interface Slider {
        void changed(int value);
    }

    private SeekBar slider(int max, int value, final Slider cb) {
        SeekBar s = new SeekBar(this);
        s.setMax(max);
        s.setProgress(value);
        s.setPadding(dp(12), dp(10), dp(12), dp(10));
        s.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                if (fromUser) cb.changed(progress);
            }

            @Override
            public void onStartTrackingTouch(SeekBar bar) {}

            @Override
            public void onStopTrackingTouch(SeekBar bar) {
                buildPanel(); // met à jour les libellés (vitesse, puissance…)
            }
        });
        return s;
    }

    private Button toggle(String label, boolean active, final Runnable action) {
        Button b = key(label, active ? ACTIVE : KEY, 14);
        b.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                action.run();
            }
        });
        return b;
    }

    private Button key(String label, int bg, int sp) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setStateListAnimator(null);
        b.setPadding(dp(4), 0, dp(4), 0);
        GradientDrawable g = new GradientDrawable();
        g.setColor(bg);
        g.setCornerRadius(dp(14));
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x55FFFFFF), g, null));
        return b;
    }

    private TextView text(String s, int sp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(color);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setPadding(dp(4), dp(10), dp(4), dp(2));
        return t;
    }

    private LinearLayout row() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.HORIZONTAL);
        return l;
    }

    private LinearLayout.LayoutParams weight(float w, int heightDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(heightDp), w);
        lp.setMargins(dp(4), dp(4), dp(4), dp(4));
        return lp;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
