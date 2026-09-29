package sn.telecommande.universelle;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.IOException;
import java.util.List;

public class MainActivity extends Activity {

    private static final int BG = 0xFF101418;
    private static final int CARD = 0xFF1B2128;
    private static final int KEY = 0xFF2A313A;
    private static final int KEY_MISSING = 0xFF1A1F25;
    private static final int SUB = 0xFF9AA5B1;
    private static final int RED = 0xFFD32F2F;
    private static final int GREEN = 0xFF2E7D32;
    private static final int BLUE = 0xFF1976D2;
    private static final int ORANGE = 0xFFEF6C00;

    private static final long SCAN_INTERVAL_MS = 1600;
    private static final long EXPLORE_INTERVAL_MS = 1300;

    private enum Screen { HOME, SCAN, BRANDS, REMOTE, EXPLORER, HELP }

    private CodeDb db;
    private IrSender sender;
    private SharedPreferences prefs;
    private CodeDb.Profile profile;
    private Screen screen = Screen.HOME;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private Runnable autoTask;
    private Runnable repeatTask;
    private boolean setupMode;

    // État de la recherche automatique
    private List<Integer> scanList;
    private int scanPos;
    private String scanButton = "POWER";
    private String scanBrand;

    // État de l'explorateur de codes
    private String exploreButton;
    private long[] exploreCmds;
    private int explorePos;

    // ------------------------------------------------------------------ cycle de vie

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        prefs = getSharedPreferences("telecommande", MODE_PRIVATE);
        sender = new IrSender(this);
        try {
            db = CodeDb.load(getAssets().open("codes.txt"));
        } catch (IOException e) {
            throw new IllegalStateException("Base de codes illisible", e);
        }
        profile = db.findById(prefs.getString("profile", null));
        if (profile != null) showRemote();
        else showHome();
    }

    @Override
    protected void onPause() {
        super.onPause();
        stopAuto();
        stopRepeat();
    }

    @Override
    public void onBackPressed() {
        switch (screen) {
            case SCAN:
            case BRANDS:
            case HELP:
                showHome();
                break;
            case EXPLORER:
                showRemote();
                break;
            case REMOTE:
                if (setupMode) {
                    setupMode = false;
                    showRemote();
                } else {
                    super.onBackPressed();
                }
                break;
            default:
                super.onBackPressed();
        }
    }

    // ------------------------------------------------------------------ accueil

    private void showHome() {
        stopAuto();
        LinearLayout c = page(Screen.HOME);
        c.addView(title("📺 Télécommande TV"));
        c.addView(text("Universelle · faite pour les télés ELACTRON et les autres marques", 15, SUB, false));
        c.addView(space(12));
        c.addView(irStatusCard());

        if (profile != null) {
            LinearLayout card = card();
            card.addView(text("Télé configurée", 13, SUB, false));
            card.addView(text(profile.label, 17, Color.WHITE, true));
            card.addView(space(8));
            Button open = key("🎮  Ouvrir la télécommande", GREEN, 18);
            open.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showRemote();
                }
            });
            card.addView(open, fullWidth(64));
            c.addView(card);
        }

        LinearLayout find = card();
        find.addView(text("Trouver le code de ma télé", 17, Color.WHITE, true));
        find.addView(text("ELACTRON n'a pas de liste officielle : la recherche automatique essaie une à une "
                + db.profiles.size() + " familles de codes jusqu'à ce que ta télé réagisse.", 14, SUB, false));
        find.addView(space(8));
        Button auto = key("🔍  Recherche automatique (recommandé)", BLUE, 17);
        auto.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startScan(null);
            }
        });
        find.addView(auto, fullWidth(60));
        find.addView(space(8));
        Button brand = key("🏷️  Chercher par marque", KEY, 16);
        brand.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showBrands();
            }
        });
        find.addView(brand, fullWidth(54));
        c.addView(find);

        Button lamp = key("🔦  Lampe torche (LED ou écran couleur)", KEY, 16);
        lamp.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openLamp();
            }
        });
        c.addView(lamp, fullWidth(54));
        c.addView(space(8));
        Button help = key("❓  Aide et astuces", KEY, 16);
        help.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showHelp();
            }
        });
        c.addView(help, fullWidth(54));
        c.addView(space(16));
        c.addView(text("Base : " + db.profiles.size() + " familles de codes, " + db.brands().size()
                + " marques (Flipper-IRDB).", 12, SUB, false));
    }

    private View irStatusCard() {
        LinearLayout card = card();
        if (sender.hasEmitter()) {
            card.addView(text("✅ Émetteur infrarouge détecté", 16, 0xFF81C784, true));
            card.addView(text("Ton téléphone peut piloter la télé. Pointe le haut du téléphone vers la télé.",
                    14, SUB, false));
        } else {
            card.addView(text("❌ Pas d'émetteur infrarouge", 16, 0xFFE57373, true));
            card.addView(text("Ce téléphone n'a pas la petite diode infrarouge (souvent sur le dessus, à côté de "
                    + "la prise casque). Sans elle, aucune appli ne peut piloter une télé classique. Installe "
                    + "l'appli sur un téléphone qui en a une (beaucoup de Xiaomi / Redmi / POCO, Tecno, "
                    + "Infinix, Honor…).", 14, SUB, false));
        }
        return card;
    }

    // ------------------------------------------------------------------ recherche automatique

    private void startScan(String brand) {
        stopAuto();
        scanBrand = brand;
        scanPos = 0;
        scanList = db.candidates(scanButton, scanBrand);
        showScan(null);
    }

    private void showScan(String hint) {
        LinearLayout c = page(Screen.SCAN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        c.addView(title(scanBrand == null ? "🔍 Recherche automatique" : "🔍 Marque : " + scanBrand));
        c.addView(text("1. Allume la télé (avec le bouton sur la télé).\n"
                + "2. Pointe le haut du téléphone vers la télé, à 1–3 mètres.\n"
                + "3. Appuie sur TESTER. Si la télé réagit, appuie sur ✅.\n"
                + "   Sinon, passe au code suivant ▶ (ou lance le défilement automatique).", 14, SUB, false));
        c.addView(space(10));

        c.addView(text("Bouton utilisé pour le test :", 13, SUB, false));
        LinearLayout choice = row();
        addScanChoice(choice, "POWER", "⏻ Marche/Arrêt");
        addScanChoice(choice, "MUTE", "🔇 Muet");
        addScanChoice(choice, "VOL_DN", "🔉 Volume −");
        c.addView(choice);
        c.addView(space(10));

        if (scanList.isEmpty()) {
            c.addView(text("Aucun code pour ce choix. Essaie un autre bouton de test.", 16, Color.WHITE, true));
            return;
        }
        if (scanPos >= scanList.size()) scanPos = scanList.size() - 1;
        CodeDb.Profile p = db.profiles.get(scanList.get(scanPos));

        LinearLayout card = card();
        final TextView counter = text("Code " + (scanPos + 1) + " / " + scanList.size(), 26, Color.WHITE, true);
        counter.setGravity(Gravity.CENTER);
        card.addView(counter);
        TextView fam = text("Famille : " + p.label, 14, SUB, false);
        fam.setGravity(Gravity.CENTER);
        card.addView(fam);
        c.addView(card);

        if (hint != null) {
            TextView h = text(hint, 15, 0xFFFFCC80, true);
            c.addView(h);
            c.addView(space(8));
        }

        LinearLayout nav = row();
        Button prev = key("◀", KEY, 24);
        prev.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopAuto();
                if (scanPos > 0) scanPos--;
                showScan(null);
                sendScan();
            }
        });
        Button test = key("TESTER", ORANGE, 22);
        test.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                sendScan();
            }
        });
        Button next = key("▶", KEY, 24);
        next.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopAuto();
                if (scanPos < scanList.size() - 1) {
                    scanPos++;
                    showScan(null);
                    sendScan();
                } else {
                    toast("C'était le dernier code de la liste.");
                }
            }
        });
        nav.addView(prev, weight(1, 72));
        nav.addView(test, weight(2, 72));
        nav.addView(next, weight(1, 72));
        c.addView(nav);
        c.addView(space(10));

        final boolean running = autoTask != null;
        Button auto = key(running ? "⏸  Pause du défilement" : "⏩  Défilement automatique", running ? KEY : BLUE, 17);
        auto.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (autoTask != null) {
                    stopAuto();
                    showScan(null);
                } else {
                    startAutoScan();
                }
            }
        });
        c.addView(auto, fullWidth(58));
        c.addView(space(10));

        Button ok = key(running ? "✋  STOP, la télé a réagi !" : "✅  Ça marche, c'est ma télé !", GREEN, 19);
        ok.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (autoTask != null) {
                    stopAuto();
                    showScan("La télé a réagi pendant le défilement. Vérifie : appuie sur TESTER "
                            + "(et sur ◀ pour revenir au code d'avant si rien ne se passe), "
                            + "puis appuie sur ✅ quand c'est le bon code.");
                } else {
                    chooseProfile(db.profiles.get(scanList.get(scanPos)));
                }
            }
        });
        c.addView(ok, fullWidth(66));
    }

    private void addScanChoice(LinearLayout row, final String button, String label) {
        Button b = key(label, button.equals(scanButton) ? BLUE : KEY, 13);
        b.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopAuto();
                scanButton = button;
                startScan(scanBrand);
            }
        });
        row.addView(b, weight(1, 48));
    }

    private void sendScan() {
        if (!sender.hasEmitter()) {
            toast("Pas d'émetteur infrarouge sur ce téléphone.");
            return;
        }
        CodeDb.Profile p = db.profiles.get(scanList.get(scanPos));
        sender.send(p.buttons.get(scanButton), true);
    }

    private void startAutoScan() {
        autoTask = new Runnable() {
            @Override
            public void run() {
                if (autoTask != this) return;
                if (scanPos < scanList.size() - 1) {
                    scanPos++;
                    showScan(null);
                    sendScan();
                    ui.postDelayed(this, SCAN_INTERVAL_MS);
                } else {
                    stopAuto();
                    showScan("Fin de la liste. Essaie un autre bouton de test (Muet ou Volume −), "
                            + "rapproche-toi de la télé, ou recommence avec ◀.");
                }
            }
        };
        showScan(null);
        sendScan();
        ui.postDelayed(autoTask, SCAN_INTERVAL_MS);
    }

    private void chooseProfile(CodeDb.Profile p) {
        profile = p;
        prefs.edit().putString("profile", p.id()).apply();
        toast("Télécommande configurée ! Si un bouton ne marche pas, appuie longuement dessus pour le régler.");
        showRemote();
    }

    // ------------------------------------------------------------------ marques

    private void showBrands() {
        stopAuto();
        LinearLayout c = page(Screen.BRANDS);
        c.addView(title("🏷️ Choisir une marque"));
        c.addView(text("Ta marque n'est pas dans la liste (c'est le cas d'ELACTRON) ? Utilise la recherche "
                + "automatique : beaucoup de télés utilisent les codes d'une autre marque.", 14, SUB, false));
        c.addView(space(8));
        Button all = key("🔍  Toutes les marques (recherche complète)", BLUE, 16);
        all.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startScan(null);
            }
        });
        c.addView(all, fullWidth(56));
        c.addView(space(8));
        EditText filter = new EditText(this);
        filter.setHint("Rechercher une marque…");
        filter.setHintTextColor(SUB);
        filter.setTextColor(Color.WHITE);
        filter.setSingleLine(true);
        filter.setInputType(InputType.TYPE_CLASS_TEXT);
        filter.setBackground(rounded(CARD));
        filter.setPadding(dp(14), dp(10), dp(14), dp(10));
        c.addView(filter, fullWidth(52));
        c.addView(space(8));
        final LinearLayout list = col();
        c.addView(list);
        final List<String[]> brands = db.brands();
        fillBrands(list, brands, "");
        filter.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {}

            @Override
            public void afterTextChanged(Editable s) {
                fillBrands(list, brands, s.toString().trim().toLowerCase());
            }
        });
    }

    private void fillBrands(LinearLayout list, List<String[]> brands, String q) {
        list.removeAllViews();
        for (final String[] b : brands) {
            if (!q.isEmpty() && !b[0].toLowerCase().contains(q)) continue;
            Button item = key(b[0] + "   (" + b[1] + ")", KEY, 15);
            item.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
            item.setPadding(dp(16), 0, dp(16), 0);
            item.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    startScan(b[0]);
                }
            });
            LinearLayout.LayoutParams lp = fullWidth(50);
            lp.bottomMargin = dp(6);
            list.addView(item, lp);
        }
    }

    // ------------------------------------------------------------------ télécommande

    private static final String[][] LABELS = {
        {"POWER", "⏻"}, {"SOURCE", "Source"}, {"MUTE", "🔇"},
        {"MENU", "Menu"}, {"HOME", "⌂ Accueil"}, {"INFO", "Info"},
        {"UP", "▲"}, {"DOWN", "▼"}, {"LEFT", "◀"}, {"RIGHT", "▶"}, {"OK", "OK"},
        {"BACK", "↩ Retour"}, {"EXIT", "Quitter"},
        {"VOL_UP", "VOL +"}, {"VOL_DN", "VOL −"}, {"CH_UP", "CH +"}, {"CH_DN", "CH −"},
    };

    private static String label(String button) {
        for (String[] l : LABELS) if (l[0].equals(button)) return l[1];
        if (button.startsWith("N")) return button.substring(1);
        return button;
    }

    private static String friendly(String button) {
        if (button.equals("POWER")) return "Marche/Arrêt";
        if (button.equals("MUTE")) return "Muet";
        if (button.equals("VOL_UP")) return "Volume +";
        if (button.equals("VOL_DN")) return "Volume −";
        if (button.equals("CH_UP")) return "Chaîne +";
        if (button.equals("CH_DN")) return "Chaîne −";
        return label(button);
    }

    private void showRemote() {
        stopAuto();
        if (profile == null) {
            showHome();
            return;
        }
        LinearLayout c = page(Screen.REMOTE);
        LinearLayout head = row();
        TextView name = text("📺 " + profile.label, 14, SUB, false);
        name.setSingleLine(true);
        name.setEllipsize(TextUtils.TruncateAt.END);
        name.setGravity(Gravity.CENTER_VERTICAL);
        head.addView(name, weight(3, 44));
        Button lamp = key("🔦", KEY, 18);
        lamp.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openLamp();
            }
        });
        head.addView(lamp, weight(1, 44));
        Button tune = key(setupMode ? "✔ Terminé" : "🛠 Régler", setupMode ? ORANGE : KEY, 13);
        tune.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setupMode = !setupMode;
                showRemote();
            }
        });
        head.addView(tune, weight(2, 44));
        Button menu = key("⚙", KEY, 18);
        menu.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setupMode = false;
                showHome();
            }
        });
        head.addView(menu, weight(1, 44));
        c.addView(head);

        if (!sender.hasEmitter()) {
            c.addView(space(6));
            c.addView(text("❌ Ce téléphone n'a pas d'émetteur infrarouge : les boutons ne peuvent rien envoyer.",
                    14, 0xFFE57373, true));
        }
        if (setupMode) {
            c.addView(space(6));
            c.addView(text("Mode réglage : touche le bouton qui ne marche pas pour lui trouver le bon code.",
                    14, 0xFFFFCC80, true));
        }
        c.addView(space(10));

        c.addView(keyRow(new String[] {"POWER", "SOURCE", "MUTE"}, 60));
        c.addView(keyRow(new String[] {"MENU", "HOME", "INFO"}, 52));
        c.addView(space(8));
        c.addView(keyRow(new String[] {null, "UP", null}, 62));
        c.addView(keyRow(new String[] {"LEFT", "OK", "RIGHT"}, 62));
        c.addView(keyRow(new String[] {null, "DOWN", null}, 62));
        c.addView(keyRow(new String[] {"BACK", "EXIT"}, 52));
        c.addView(space(8));
        c.addView(keyRow(new String[] {"VOL_UP", "CH_UP"}, 62));
        c.addView(keyRow(new String[] {"VOL_DN", "CH_DN"}, 62));
        c.addView(space(8));
        c.addView(keyRow(new String[] {"N1", "N2", "N3"}, 54));
        c.addView(keyRow(new String[] {"N4", "N5", "N6"}, 54));
        c.addView(keyRow(new String[] {"N7", "N8", "N9"}, 54));
        c.addView(keyRow(new String[] {null, "N0", null}, 54));
        c.addView(space(12));
        c.addView(text("Astuce : appui long sur un bouton = le régler. Garde le doigt sur VOL / CH / flèches "
                + "pour répéter.", 12, SUB, false));
    }

    private LinearLayout keyRow(String[] buttons, int heightDp) {
        LinearLayout r = row();
        for (String b : buttons) {
            if (b == null) {
                r.addView(new View(this), weight(1, heightDp));
            } else {
                r.addView(remoteKey(b), weight(1, heightDp));
            }
        }
        return r;
    }

    private Button remoteKey(final String button) {
        Signal s = signalFor(button);
        int color = button.equals("POWER") ? RED : button.equals("OK") ? BLUE : (s == null ? KEY_MISSING : KEY);
        final Button b = key(label(button), color, button.equals("POWER") ? 24 : 17);
        if (s == null) b.setTextColor(0xFF5C6670);
        if (setupMode) b.setTextColor(0xFFFFCC80);
        final boolean repeats = button.startsWith("VOL") || button.startsWith("CH") || button.equals("UP")
                || button.equals("DOWN") || button.equals("LEFT") || button.equals("RIGHT");
        if (repeats && !setupMode) {
            b.setOnTouchListener(new View.OnTouchListener() {
                @Override
                public boolean onTouch(View v, MotionEvent e) {
                    switch (e.getActionMasked()) {
                        case MotionEvent.ACTION_DOWN:
                            v.setPressed(true);
                            press(button);
                            startRepeat(button);
                            return true;
                        case MotionEvent.ACTION_UP:
                        case MotionEvent.ACTION_CANCEL:
                            v.setPressed(false);
                            stopRepeat();
                            return true;
                        default:
                            return true;
                    }
                }
            });
        } else {
            b.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    if (setupMode) openExplorer(button);
                    else press(button);
                }
            });
            b.setOnLongClickListener(new View.OnLongClickListener() {
                @Override
                public boolean onLongClick(View v) {
                    openExplorer(button);
                    return true;
                }
            });
        }
        return b;
    }

    private void openLamp() {
        stopAuto();
        startActivity(new Intent(this, LampActivity.class));
    }

    private void press(String button) {
        Signal s = signalFor(button);
        if (s == null) {
            toast("Ce bouton n'est pas connu pour ta télé. Touche « 🛠 Régler » puis ce bouton pour le trouver.");
            return;
        }
        sender.send(s, true);
    }

    private void startRepeat(final String button) {
        stopRepeat();
        repeatTask = new Runnable() {
            @Override
            public void run() {
                if (repeatTask != this) return;
                Signal s = signalFor(button);
                if (s != null) sender.send(s, false);
                ui.postDelayed(this, 200);
            }
        };
        ui.postDelayed(repeatTask, 450);
    }

    private void stopRepeat() {
        if (repeatTask != null) ui.removeCallbacks(repeatTask);
        repeatTask = null;
    }

    private String overrideKey(String button) {
        return "ovr:" + profile.id() + ":" + button;
    }

    private Signal signalFor(String button) {
        if (profile == null) return null;
        Signal o = Signal.deserialize(prefs.getString(overrideKey(button), null));
        return o != null ? o : profile.buttons.get(button);
    }

    // ------------------------------------------------------------------ explorateur de codes

    /** Code de référence (protocole + adresse de la télé) à partir duquel on essaie les commandes. */
    private Signal reference() {
        Signal p = profile.power();
        if (IrCodec.explorable(p)) return p;
        for (Signal s : profile.buttons.values()) if (IrCodec.explorable(s)) return s;
        return null;
    }

    private void openExplorer(String button) {
        stopAuto();
        exploreButton = null;
        showExplorer(button);
    }

    private void showExplorer(final String button) {
        stopRepeat();
        final Signal ref = reference();
        LinearLayout c = page(Screen.EXPLORER);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        c.addView(title("🛠 Régler « " + friendly(button) + " »"));
        if (ref == null) {
            c.addView(text("Pour cette famille de télés, la base ne contient que des codes enregistrés : "
                    + "impossible de chercher d'autres codes. Essaie une autre famille avec la recherche "
                    + "automatique.", 15, SUB, false));
            Button back = key("↩  Retour à la télécommande", KEY, 16);
            back.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showRemote();
                }
            });
            c.addView(back, fullWidth(56));
            return;
        }
        if (!button.equals(exploreButton) || exploreCmds == null) {
            exploreButton = button;
            exploreCmds = IrCodec.commandRange(ref);
            explorePos = 0;
            Signal cur = signalFor(button);
            if (cur != null && !cur.isRaw() && cur.proto.equals(ref.proto) && cur.addr == ref.addr) {
                for (int i = 0; i < exploreCmds.length; i++) if (exploreCmds[i] == cur.cmd) explorePos = i;
            }
        }
        final Signal candidate = ref.withCommand(exploreCmds[explorePos]);

        c.addView(text("On essaie tous les codes de ta télé. Appuie sur ENVOYER (ou lance le défilement) "
                + "et regarde l'écran : quand la télé fait « " + friendly(button) + " », appuie sur ✅.",
                14, SUB, false));
        c.addView(space(6));
        c.addView(text("⚠️ Certains codes ouvrent des menus spéciaux de la télé. Si ça arrive, appuie sur "
                + "Retour/Quitter ou éteins la télé avec son bouton.", 13, 0xFFFFCC80, false));
        c.addView(space(10));

        LinearLayout card = card();
        TextView counter = text("Essai " + (explorePos + 1) + " / " + exploreCmds.length, 26, Color.WHITE, true);
        counter.setGravity(Gravity.CENTER);
        card.addView(counter);
        TextView detail = text("Commande n° " + IrCodec.commandNumber(candidate) + "  ·  " + ref.proto, 14, SUB,
                false);
        detail.setGravity(Gravity.CENTER);
        card.addView(detail);
        c.addView(card);

        LinearLayout nav = row();
        Button prev = key("◀", KEY, 24);
        prev.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopAuto();
                explorePos = (explorePos - 1 + exploreCmds.length) % exploreCmds.length;
                showExplorer(button);
                sender.send(ref.withCommand(exploreCmds[explorePos]), true);
            }
        });
        Button send = key("ENVOYER", ORANGE, 20);
        send.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                sender.send(candidate, true);
            }
        });
        Button next = key("▶", KEY, 24);
        next.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopAuto();
                explorePos = (explorePos + 1) % exploreCmds.length;
                showExplorer(button);
                sender.send(ref.withCommand(exploreCmds[explorePos]), true);
            }
        });
        nav.addView(prev, weight(1, 70));
        nav.addView(send, weight(2, 70));
        nav.addView(next, weight(1, 70));
        c.addView(nav);
        c.addView(space(10));

        boolean running = autoTask != null;
        Button auto = key(running ? "⏸  Pause" : "⏩  Défilement automatique", running ? KEY : BLUE, 17);
        auto.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (autoTask != null) {
                    stopAuto();
                    showExplorer(button);
                } else {
                    startAutoExplore(button, ref);
                }
            }
        });
        c.addView(auto, fullWidth(56));
        c.addView(space(10));

        Button ok = key(running ? "✋  STOP, ça a marché !" : "✅  C'est ce code !", GREEN, 18);
        ok.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (autoTask != null) {
                    stopAuto();
                    showExplorer(button);
                    toast("Vérifie avec ENVOYER (◀ pour le code d'avant), puis appuie sur ✅.");
                    return;
                }
                prefs.edit().putString(overrideKey(button), candidate.serialize()).apply();
                toast("Bouton « " + friendly(button) + " » enregistré.");
                exploreButton = null;
                showRemote();
            }
        });
        c.addView(ok, fullWidth(62));
        c.addView(space(10));

        LinearLayout bottom = row();
        Button reset = key("↺ Code d'origine", KEY, 14);
        reset.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopAuto();
                prefs.edit().remove(overrideKey(button)).apply();
                exploreButton = null;
                toast("Code d'origine remis pour « " + friendly(button) + " ».");
                showRemote();
            }
        });
        Button back = key("↩ Télécommande", KEY, 14);
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopAuto();
                exploreButton = null;
                showRemote();
            }
        });
        bottom.addView(reset, weight(1, 50));
        bottom.addView(back, weight(1, 50));
        c.addView(bottom);
    }

    private void startAutoExplore(final String button, final Signal ref) {
        autoTask = new Runnable() {
            @Override
            public void run() {
                if (autoTask != this) return;
                explorePos = (explorePos + 1) % exploreCmds.length;
                showExplorer(button);
                sender.send(ref.withCommand(exploreCmds[explorePos]), true);
                ui.postDelayed(this, EXPLORE_INTERVAL_MS);
            }
        };
        showExplorer(button);
        sender.send(ref.withCommand(exploreCmds[explorePos]), true);
        ui.postDelayed(autoTask, EXPLORE_INTERVAL_MS);
    }

    private void stopAuto() {
        if (autoTask != null) ui.removeCallbacks(autoTask);
        autoTask = null;
    }

    // ------------------------------------------------------------------ aide

    private void showHelp() {
        stopAuto();
        LinearLayout c = page(Screen.HELP);
        c.addView(title("❓ Aide"));
        String[][] items = {
            {"Mon téléphone peut-il servir de télécommande ?",
                "Il faut un émetteur infrarouge (une petite fenêtre noire sur le dessus du téléphone). "
                + "L'écran d'accueil de l'appli te le dit tout de suite. On en trouve sur beaucoup de "
                + "Xiaomi / Redmi / POCO, de Tecno et d'Infinix, sur certains Honor et Huawei. "
                + "Les iPhone et les Samsung récents n'en ont pas."},
            {"Comment trouver le code de ma ELACTRON ?",
                "Utilise la recherche automatique : allume la télé avec son bouton, pointe le téléphone "
                + "vers elle et appuie sur TESTER, puis ▶ pour le code suivant (ou lance le défilement "
                + "automatique). Dès que la télé s'éteint, appuie sur ✅. Rallume-la ensuite avec le "
                + "bouton ⏻ de l'appli."},
            {"La télé s'éteint mais d'autres boutons ne marchent pas",
                "Touche « 🛠 Régler » en haut de la télécommande, puis le bouton qui ne marche pas. "
                + "L'appli essaie alors tous les codes possibles de ta télé : appuie sur ✅ quand la télé "
                + "fait la bonne action. Le réglage est gardé en mémoire."},
            {"Je préfère ne pas éteindre la télé pendant la recherche",
                "Choisis « 🔇 Muet » ou « 🔉 Volume − » comme bouton de test : le symbole s'affiche à "
                + "l'écran quand le code est le bon."},
            {"Rien ne marche",
                "Rapproche-toi (1 à 3 m), vise bien la télé avec le haut du téléphone, enlève la coque "
                + "si elle couvre la diode, et évite le soleil direct sur la télé. Essaie aussi "
                + "« Chercher par marque » avec des marques chinoises courantes : Hisense, TCL, "
                + "Skyworth, Changhong, Konka, Haier, Akai…"},
        };
        for (String[] it : items) {
            LinearLayout card = card();
            card.addView(text(it[0], 16, Color.WHITE, true));
            card.addView(space(4));
            card.addView(text(it[1], 14, SUB, false));
            c.addView(card);
        }
        c.addView(text("Codes infrarouges : Flipper-IRDB (domaine public, CC0) et liste universelle "
                + "Flipper Zero.", 12, SUB, false));
    }

    // ------------------------------------------------------------------ outils d'interface

    private LinearLayout page(Screen s) {
        stopRepeat();
        if (s != Screen.SCAN && s != Screen.EXPLORER) {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
        screen = s;
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(BG);
        sv.setFillViewport(true);
        LinearLayout c = col();
        c.setPadding(dp(16), dp(20), dp(16), dp(24));
        sv.addView(c, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(sv);
        return c;
    }

    private LinearLayout col() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    private LinearLayout row() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.HORIZONTAL);
        return l;
    }

    private LinearLayout card() {
        LinearLayout l = col();
        l.setBackground(rounded(CARD));
        l.setPadding(dp(16), dp(14), dp(16), dp(14));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(12);
        l.setLayoutParams(lp);
        return l;
    }

    private TextView title(String s) {
        TextView t = text(s, 24, Color.WHITE, true);
        t.setPadding(0, 0, 0, dp(6));
        return t;
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(color);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setLineSpacing(0, 1.15f);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private View space(int heightDp) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, dp(heightDp)));
        return v;
    }

    private Button key(String label, int color, int sp) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setStateListAnimator(null);
        b.setPadding(dp(6), 0, dp(6), 0);
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x55FFFFFF), rounded(color), null));
        return b;
    }

    private GradientDrawable rounded(int color) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(16));
        return g;
    }

    private LinearLayout.LayoutParams weight(float w, int heightDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(heightDp), w);
        lp.setMargins(dp(4), dp(4), dp(4), dp(4));
        return lp;
    }

    private LinearLayout.LayoutParams fullWidth(int heightDp) {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(heightDp));
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_LONG).show();
    }
}
