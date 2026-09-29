package sn.telecommande.universelle;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
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
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

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

    private enum Screen { HOME, SCAN, BRANDS, REMOTE, DONE, SETUP, ASSIST, DISCOVER, HELP, WIFI_FIND, WIFI_PAIR }

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

    // État de l'assistant de réglage (un ou plusieurs boutons)
    private String[] assistQueue;
    private int assistIndex;
    private boolean assistSingle;
    private String assistFor;
    private Suggest.Result assistCands;
    private int assistPos;
    private int assistFound;
    private final Map<String, Set<Long>> rejected = new HashMap<String, Set<Long>>();

    // Télécommande Wi-Fi (Android TV Remote v2) : réseau sur un fil dédié
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private AtvClient atv;
    private AtvFinder finder;
    private final List<String[]> foundTvs = new ArrayList<String[]>();
    private boolean searching;
    private AtvClient.Pairing pairing;
    private String pairHost;
    private String pairName;
    private TextView wifiStatusView;
    private String wifiStatusText = "";
    private int wifiStatusColor = SUB;
    private volatile boolean wifiConnecting;

    // État du scan libre de tous les codes
    private long[] discoverCmds;
    private int discoverPos;
    private boolean discoverPicking;

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
        if (wifiMode() || profile != null) showRemote();
        else showHome();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (screen == Screen.REMOTE && wifiMode()) wifiWarmUp();
    }

    @Override
    protected void onPause() {
        super.onPause();
        stopAuto();
        stopRepeat();
        if (finder != null) finder.stop();
        net.execute(new Runnable() {
            @Override
            public void run() {
                if (atv != null) atv.disconnect();
            }
        });
    }

    @Override
    public void onBackPressed() {
        switch (screen) {
            case SCAN:
            case BRANDS:
            case HELP:
            case WIFI_FIND:
                showHome();
                break;
            case WIFI_PAIR:
                showWifiFind();
                break;
            case DONE:
            case SETUP:
            case ASSIST:
            case DISCOVER:
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
        c.addView(wifiCard());
        c.addView(text("Télécommande infrarouge", 17, Color.WHITE, true));
        c.addView(space(6));
        c.addView(irStatusCard());

        if (profile != null) {
            LinearLayout card = card();
            card.addView(text("Télé configurée", 13, SUB, false));
            card.addView(text(profile.label, 17, Color.WHITE, true));
            card.addView(space(8));
            Button open = key("🎮  Télécommande infrarouge", GREEN, 18);
            open.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    prefs.edit().putString("mode", "ir").apply();
                    showRemote();
                }
            });
            card.addView(open, fullWidth(64));
            card.addView(space(8));
            Button tuneAll = key("🛠  Régler mes boutons", KEY, 16);
            tuneAll.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showSetup();
                }
            });
            card.addView(tuneAll, fullWidth(54));
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

    private View wifiCard() {
        LinearLayout card = card();
        card.addView(text("📶 Par le Wi-Fi (télés Android TV)", 17, Color.WHITE, true));
        card.addView(text("Pour les télés ELACTRON Smart / Android TV : pas besoin d'infrarouge, réponse "
                + "immédiate, et tous les boutons marchent tout de suite. Le téléphone et la télé doivent être "
                + "sur le même Wi-Fi.", 14, SUB, false));
        card.addView(space(8));
        String host = prefs.getString("atv_host", null);
        if (host != null) {
            card.addView(text("Télé Wi-Fi : " + prefs.getString("atv_name", host), 15, 0xFF81C784, true));
            card.addView(space(6));
            Button open = key("🎮  Télécommande Wi-Fi", GREEN, 18);
            open.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    prefs.edit().putString("mode", "wifi").apply();
                    showRemote();
                }
            });
            card.addView(open, fullWidth(62));
            card.addView(space(8));
            Button other = key("🔄  Changer de télé Wi-Fi", KEY, 15);
            other.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showWifiFind();
                }
            });
            card.addView(other, fullWidth(50));
        } else {
            Button connect = key("📶  Connecter ma télé en Wi-Fi", BLUE, 18);
            connect.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showWifiFind();
                }
            });
            card.addView(connect, fullWidth(62));
        }
        return card;
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
        addScanChoice(choice, "POWER", "🔴 Marche/Arrêt");
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
        rejected.clear();
        prefs.edit().putString("profile", p.id()).apply();
        if (reference() != null && profile.buttons.containsKey("VOL_UP")) showDone();
        else showRemote();
    }

    /** Juste après la recherche : on vérifie qu'un 2e bouton marche avant d'ouvrir la télécommande. */
    private void showDone() {
        stopAuto();
        LinearLayout c = page(Screen.DONE);
        c.addView(title("🎉 La télé a réagi !"));
        c.addView(text("Famille trouvée : " + profile.label + ".", 15, SUB, false));
        c.addView(space(6));
        c.addView(text("Plusieurs modèles de télés partagent ce code Marche/Arrêt mais pas les autres boutons. "
                + "Vérifions : rallume la télé si besoin, appuie sur TESTER VOLUME + et regarde l'écran.",
                15, Color.WHITE, false));
        c.addView(space(12));
        Button test = key("🔊  TESTER VOLUME +", ORANGE, 19);
        test.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                press("VOL_UP");
            }
        });
        c.addView(test, fullWidth(66));
        c.addView(space(12));
        Button yes = key("✅  Le volume a monté : c'est prêt", GREEN, 17);
        yes.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showRemote();
            }
        });
        c.addView(yes, fullWidth(60));
        c.addView(space(10));
        Button no = key("❌  Rien, ou autre chose → régler les boutons", KEY, 16);
        no.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openAssistant(ASSIST_ORDER, false);
            }
        });
        c.addView(no, fullWidth(60));
        c.addView(space(10));
        c.addView(text("L'assistant propose d'abord les codes les plus probables pour ta télé : en général "
                + "2 ou 3 essais par bouton suffisent.", 13, SUB, false));
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
        {"POWER", "Marche/Arrêt"}, {"SOURCE", "Source"}, {"MUTE", "🔇"},
        {"MENU", "Menu"}, {"HOME", "⌂ Accueil"}, {"INFO", "Info"},
        {"UP", "▲"}, {"DOWN", "▼"}, {"LEFT", "◀"}, {"RIGHT", "▶"}, {"OK", "OK"},
        {"BACK", "↩ Retour"}, {"EXIT", "Quitter"},
        {"VOL_UP", "VOL +"}, {"VOL_DN", "VOL −"}, {"CH_UP", "CH +"}, {"CH_DN", "CH −"},
        {"NETFLIX", "Netflix"}, {"YOUTUBE", "YouTube"}, {"PRIME", "Prime Video"},
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
        if (button.equals("UP")) return "Flèche haut ▲";
        if (button.equals("DOWN")) return "Flèche bas ▼";
        if (button.equals("LEFT")) return "Flèche gauche ◀";
        if (button.equals("RIGHT")) return "Flèche droite ▶";
        if (button.startsWith("N") && button.length() == 2) return "Chiffre " + button.substring(1);
        return label(button);
    }

    private void showRemote() {
        stopAuto();
        final boolean wifi = wifiMode();
        if (profile == null && !wifi) {
            showHome();
            return;
        }
        if (wifi) setupMode = false;
        LinearLayout c = page(Screen.REMOTE);
        if (wifi) {
            LinearLayout head = row();
            TextView name = text("📶 " + prefs.getString("atv_name", "Android TV"), 14, SUB, false);
            name.setSingleLine(true);
            name.setEllipsize(TextUtils.TruncateAt.END);
            name.setGravity(Gravity.CENTER_VERTICAL);
            head.addView(name, weight(4, 44));
            Button lamp = key("🔦", KEY, 18);
            lamp.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    openLamp();
                }
            });
            head.addView(lamp, weight(1, 44));
            Button menu = key("⚙", KEY, 18);
            menu.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showHome();
                }
            });
            head.addView(menu, weight(1, 44));
            c.addView(head);
            wifiStatusView = text(wifiStatusText, 13, wifiStatusColor, true);
            c.addView(wifiStatusView);
            wifiWarmUp();
        }
        if (!wifi) irHeader(c);
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
        c.addView(space(8));
        c.addView(keyRow(new String[] {"NETFLIX", "YOUTUBE", "PRIME"}, 52));
        c.addView(space(12));
        if (wifi) {
            c.addView(text("Commande par Wi-Fi : garde le doigt sur VOL / CH / flèches pour répéter. Si la télé "
                    + "ne répond plus, vérifie qu'elle est allumée et sur le même Wi-Fi.", 12, SUB, false));
        } else {
            c.addView(text("Un bouton ne marche pas ? « 🛠 Régler » → Assistant. Appui long sur un bouton = le "
                    + "régler seul. Garde le doigt sur VOL / CH / flèches pour répéter.", 12, SUB, false));
        }
    }

    /** En-tête de la télécommande infrarouge : famille de codes, lampe, réglage, accueil. */
    private void irHeader(LinearLayout c) {
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
                if (setupMode) {
                    setupMode = false;
                    showRemote();
                } else {
                    showSetup();
                }
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
        final boolean wifi = wifiMode();
        Signal s = wifi ? null : signalFor(button);
        boolean available = wifi || s != null;
        int color = button.equals("POWER") ? RED : button.equals("OK") ? BLUE : (available ? KEY : KEY_MISSING);
        final Button b = key(wifi ? wifiLabel(button) : label(button), color,
                button.startsWith("N") && button.length() == 2 ? 18 : 16);
        if (button.equals("POWER")) {
            b.setText("");
            b.setContentDescription("Marche/Arrêt");
            Drawable icon = new LayerDrawable(new Drawable[] {rounded(RED), new PowerIcon(Color.WHITE, dp(3))});
            b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x55FFFFFF), icon, null));
        }
        if (button.equals("NETFLIX") && available) b.setTextColor(0xFFE50914);
        if (!available) b.setTextColor(0xFF5C6670);
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
            if (!wifi) {
                b.setOnLongClickListener(new View.OnLongClickListener() {
                    @Override
                    public boolean onLongClick(View v) {
                        openExplorer(button);
                        return true;
                    }
                });
            }
        }
        return b;
    }

    private void openLamp() {
        stopAuto();
        startActivity(new Intent(this, LampActivity.class));
    }

    private void press(String button) {
        if (wifiMode()) {
            wifiPress(button, true);
            return;
        }
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
                if (wifiMode()) {
                    wifiPress(button, false);
                } else {
                    Signal s = signalFor(button);
                    if (s != null) sender.send(s, false);
                }
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

    // ------------------------------------------------------------------ réglage des boutons

    /** Ordre de l'assistant : Menu avant les flèches, pour voir la sélection bouger. */
    private static final String[] ASSIST_ORDER = {
        "VOL_UP", "VOL_DN", "MUTE", "CH_UP", "CH_DN", "SOURCE", "MENU", "UP", "DOWN", "LEFT", "RIGHT", "OK",
        "BACK", "EXIT", "HOME", "INFO", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N0",
        "NETFLIX", "YOUTUBE", "PRIME",
    };

    private static String hint(String button) {
        switch (button) {
            case "VOL_UP":
            case "VOL_DN":
                return "La barre de volume doit s'afficher et bouger.";
            case "MUTE":
                return "Le son doit se couper (symbole « muet » à l'écran).";
            case "CH_UP":
            case "CH_DN":
                return "La télé doit changer de chaîne (en mode TV).";
            case "SOURCE":
                return "La liste des entrées (TV, HDMI, AV…) doit s'afficher.";
            case "MENU":
                return "Le menu ou les réglages de la télé doivent s'ouvrir. Laisse-le ouvert pour la suite.";
            case "UP":
            case "DOWN":
            case "LEFT":
            case "RIGHT":
                return "Garde un menu ouvert à l'écran : la sélection doit se déplacer.";
            case "OK":
                return "Dans un menu, l'élément sélectionné doit s'ouvrir.";
            case "BACK":
            case "EXIT":
                return "Avec un menu ouvert : il doit se fermer ou revenir en arrière.";
            case "HOME":
                return "L'écran d'accueil de la télé (applis) doit s'afficher.";
            case "NETFLIX":
            case "YOUTUBE":
            case "PRIME":
                return "L'appli doit se lancer sur la télé.";
            default:
                if (button.startsWith("N")) return "Le chiffre doit s'afficher, ou la chaîne changer.";
                return "Regarde l'écran de la télé.";
        }
    }

    /** Code de référence (protocole + adresse de la télé) à partir duquel on essaie les commandes. */
    private Signal reference() {
        Signal p = profile.power();
        if (IrCodec.explorable(p)) return p;
        for (Signal s : profile.buttons.values()) if (IrCodec.explorable(s)) return s;
        return null;
    }

    private Map<String, Signal> overrides() {
        Map<String, Signal> m = new LinkedHashMap<String, Signal>();
        for (String b : allButtons()) {
            Signal s = Signal.deserialize(prefs.getString(overrideKey(b), null));
            if (s != null) m.put(b, s);
        }
        return m;
    }

    private static String[] allButtons() {
        String[] all = new String[ASSIST_ORDER.length + 1];
        all[0] = "POWER";
        System.arraycopy(ASSIST_ORDER, 0, all, 1, ASSIST_ORDER.length);
        return all;
    }

    private void saveOverride(String button, Signal s) {
        prefs.edit().putString(overrideKey(button), s.serialize()).apply();
    }

    private void backButton(LinearLayout c) {
        Button back = key("↩  Retour à la télécommande", KEY, 16);
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showRemote();
            }
        });
        c.addView(back, fullWidth(54));
    }

    private void showSetup() {
        stopAuto();
        setupMode = false;
        LinearLayout c = page(Screen.SETUP);
        c.addView(title("🛠 Régler mes boutons"));
        if (reference() == null) {
            c.addView(text("Pour cette famille de télés, la base ne contient que des codes enregistrés : "
                    + "impossible de chercher d'autres codes. Relance la recherche automatique pour essayer "
                    + "une autre famille.", 15, SUB, false));
            c.addView(space(10));
            backButton(c);
            return;
        }
        c.addView(text("Ta télé a réagi au code Marche/Arrêt, mais d'autres modèles utilisent le même code "
                + "avec des boutons différents. Règle-les ici : l'appli propose d'abord les codes les plus "
                + "probables pour ta télé.", 14, SUB, false));
        c.addView(space(12));
        Button assist = key("✨  Assistant : tous les boutons, un par un", GREEN, 17);
        assist.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openAssistant(ASSIST_ORDER, false);
            }
        });
        c.addView(assist, fullWidth(62));
        c.addView(text("Recommandé · 2 à 3 essais par bouton en général.", 12, SUB, false));
        c.addView(space(12));
        Button one = key("👆  Régler un seul bouton", KEY, 16);
        one.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setupMode = true;
                showRemote();
            }
        });
        c.addView(one, fullWidth(56));
        c.addView(space(8));
        Button scan = key("🔎  Scanner tous les codes de la télé", KEY, 16);
        scan.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openDiscover();
            }
        });
        c.addView(scan, fullWidth(56));
        c.addView(text("L'appli envoie tous les codes un par un ; à chaque réaction de la télé, tu dis "
                + "de quel bouton il s'agit.", 12, SUB, false));
        c.addView(space(8));
        Button reset = key("↺  Effacer tous mes réglages", KEY, 15);
        reset.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                SharedPreferences.Editor e = prefs.edit();
                for (String b : allButtons()) e.remove(overrideKey(b));
                e.apply();
                rejected.clear();
                toast("Réglages effacés : retour aux codes d'origine.");
                showSetup();
            }
        });
        c.addView(reset, fullWidth(52));
        c.addView(space(8));
        backButton(c);
    }

    // ---- assistant (un ou plusieurs boutons)

    private void openExplorer(String button) {
        openAssistant(new String[] {button}, true);
    }

    private void openAssistant(String[] queue, boolean single) {
        stopAuto();
        stopRepeat();
        assistQueue = queue;
        assistIndex = 0;
        assistSingle = single;
        assistFor = null;
        assistFound = 0;
        showAssistant(null);
    }

    private void computeCandidates(String button, Signal ref) {
        Signal cur = signalFor(button);
        Long current = cur != null && !cur.isRaw() && cur.proto.equals(ref.proto) && cur.addr == ref.addr
                ? Long.valueOf(cur.cmd) : null;
        Map<String, Long> confirmed = Suggest.confirmed(ref, profile.power(), overrides());
        assistCands = Suggest.candidates(db.layouts(ref.proto, ref.addr), ref, button, confirmed, rejected, current);
        assistPos = 0;
        assistFor = button;
    }

    private void showAssistant(String note) {
        stopRepeat();
        final Signal ref = reference();
        LinearLayout c = page(Screen.ASSIST);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (ref == null) {
            c.addView(title("🛠 Réglage impossible"));
            c.addView(text("Pour cette famille de télés, la base ne contient que des codes enregistrés.",
                    15, SUB, false));
            backButton(c);
            return;
        }
        final String button = assistQueue[assistIndex];
        if (!button.equals(assistFor) || assistCands == null) computeCandidates(button, ref);
        final Signal candidate = ref.withCommand(assistCands.cmds[assistPos]);

        c.addView(title(assistSingle ? "🛠 Régler un bouton" : "✨ Assistant de réglage"));
        if (!assistSingle) {
            c.addView(text("Bouton " + (assistIndex + 1) + " / " + assistQueue.length + "  ·  " + assistFound
                    + " réglé(s)", 13, SUB, false));
        }
        TextView big = text(friendly(button), 30, Color.WHITE, true);
        big.setGravity(Gravity.CENTER);
        big.setPadding(0, dp(8), 0, dp(4));
        c.addView(big);
        TextView h = text(hint(button), 14, SUB, false);
        h.setGravity(Gravity.CENTER);
        c.addView(h);
        c.addView(space(10));

        LinearLayout card = card();
        TextView counter = text("Essai " + (assistPos + 1) + " / " + assistCands.cmds.length, 22, Color.WHITE,
                true);
        counter.setGravity(Gravity.CENTER);
        card.addView(counter);
        String origin = assistCands.origins[assistPos];
        String detail = assistPos < assistCands.suggested
                ? "💡 Code probable" + (origin.isEmpty() ? "" : " (" + origin + ")")
                : "Code n° " + IrCodec.commandNumber(candidate) + " (recherche complète)";
        TextView d = text(detail, 14, assistPos < assistCands.suggested ? 0xFF81C784 : SUB, false);
        d.setGravity(Gravity.CENTER);
        card.addView(d);
        c.addView(card);
        if (note != null) {
            c.addView(text(note, 14, 0xFFFFCC80, true));
            c.addView(space(6));
        }

        LinearLayout nav = row();
        Button prev = key("◀", KEY, 22);
        prev.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopAuto();
                if (assistPos > 0) assistPos--;
                showAssistant(null);
                sender.send(ref.withCommand(assistCands.cmds[assistPos]), true);
            }
        });
        Button test = key("TESTER", ORANGE, 21);
        test.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                sender.send(candidate, true);
            }
        });
        Button next = key("▶", KEY, 22);
        next.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopAuto();
                assistStep(ref, false);
            }
        });
        nav.addView(prev, weight(1, 68));
        nav.addView(test, weight(2, 68));
        nav.addView(next, weight(1, 68));
        c.addView(nav);
        c.addView(space(8));

        final boolean running = autoTask != null;
        Button yes = key(running ? "✋  STOP, la télé a réagi !" : "✅  Oui, ça marche !", GREEN, 18);
        yes.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (autoTask != null) {
                    stopAuto();
                    showAssistant("Vérifie : appuie sur TESTER (◀ pour le code d'avant si rien ne se passe), "
                            + "puis sur ✅.");
                    return;
                }
                saveOverride(button, candidate);
                assistFound++;
                if (assistSingle) {
                    toast("« " + friendly(button) + " » enregistré.");
                    showRemote();
                } else {
                    assistNextButton();
                }
            }
        });
        c.addView(yes, fullWidth(60));
        c.addView(space(8));
        Button no = key("❌  Non, essayer le code suivant", KEY, 16);
        no.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopAuto();
                assistStep(ref, true);
            }
        });
        c.addView(no, fullWidth(54));
        c.addView(space(8));
        Button auto = key(running ? "⏸  Pause du défilement" : "⏩  Défilement automatique", running ? KEY : BLUE,
                15);
        auto.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (autoTask != null) {
                    stopAuto();
                    showAssistant(null);
                } else {
                    startAutoAssist(ref);
                }
            }
        });
        c.addView(auto, fullWidth(52));
        c.addView(space(10));

        LinearLayout bottom = row();
        if (assistSingle) {
            Button reset = key("↺ Code d'origine", KEY, 14);
            reset.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    prefs.edit().remove(overrideKey(button)).apply();
                    toast("Code d'origine remis pour « " + friendly(button) + " ».");
                    showRemote();
                }
            });
            Button back = key("↩ Télécommande", KEY, 14);
            back.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showRemote();
                }
            });
            bottom.addView(reset, weight(1, 50));
            bottom.addView(back, weight(1, 50));
        } else {
            Button skip = key("⏭ Passer ce bouton", KEY, 14);
            skip.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    assistNextButton();
                }
            });
            Button done = key("✔ Terminer", KEY, 14);
            done.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    finishAssistant();
                }
            });
            bottom.addView(skip, weight(1, 50));
            bottom.addView(done, weight(1, 50));
        }
        c.addView(bottom);
        c.addView(space(8));
        c.addView(text("⚠️ Certains codes ouvrent des menus spéciaux de la télé. Si ça arrive, appuie sur "
                + "Retour/Quitter, ou éteins la télé avec son bouton.", 12, SUB, false));
    }

    /** Passe au code suivant et l'envoie ; {@code refuse} = l'utilisateur a dit que ce code ne marche pas. */
    private void assistStep(Signal ref, boolean refuse) {
        String button = assistQueue[assistIndex];
        if (refuse) {
            Set<Long> r = rejected.get(button);
            if (r == null) {
                r = new HashSet<Long>();
                rejected.put(button, r);
            }
            r.add(assistCands.cmds[assistPos]);
        }
        if (assistPos < assistCands.cmds.length - 1) {
            assistPos++;
            showAssistant(null);
            sender.send(ref.withCommand(assistCands.cmds[assistPos]), true);
        } else {
            showAssistant("Tous les codes ont été essayés pour ce bouton : passe au suivant.");
        }
    }

    private void assistNextButton() {
        stopAuto();
        if (assistIndex < assistQueue.length - 1) {
            assistIndex++;
            assistFor = null;
            showAssistant(null);
        } else {
            finishAssistant();
        }
    }

    private void finishAssistant() {
        stopAuto();
        toast("🎉 Réglage terminé : " + assistFound + " bouton(s) enregistré(s).");
        showRemote();
    }

    private void startAutoAssist(final Signal ref) {
        autoTask = new Runnable() {
            @Override
            public void run() {
                if (autoTask != this) return;
                if (assistPos < assistCands.cmds.length - 1) {
                    assistPos++;
                    showAssistant(null);
                    sender.send(ref.withCommand(assistCands.cmds[assistPos]), true);
                    ui.postDelayed(this, EXPLORE_INTERVAL_MS);
                } else {
                    stopAuto();
                    showAssistant("Fin de la liste pour ce bouton.");
                }
            }
        };
        showAssistant(null);
        sender.send(ref.withCommand(assistCands.cmds[assistPos]), true);
        ui.postDelayed(autoTask, EXPLORE_INTERVAL_MS);
    }

    // ---- scan libre : tous les codes, on dit ce que fait la télé

    private void openDiscover() {
        stopAuto();
        Signal ref = reference();
        if (ref == null) {
            showSetup();
            return;
        }
        long[] all = IrCodec.commandRange(ref);
        Signal power = profile.power();
        int n = 0;
        long[] cmds = new long[all.length];
        for (long c : all) {
            // on saute Marche/Arrêt pour ne pas éteindre la télé pendant le scan
            if (power != null && !power.isRaw() && c == power.cmd) continue;
            cmds[n++] = c;
        }
        discoverCmds = java.util.Arrays.copyOf(cmds, n);
        discoverPos = 0;
        discoverPicking = false;
        showDiscover(null);
    }

    private void showDiscover(String note) {
        final Signal ref = reference();
        LinearLayout c = page(Screen.DISCOVER);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        final Signal candidate = ref.withCommand(discoverCmds[discoverPos]);
        c.addView(title("🔎 Scanner tous les codes"));
        c.addView(text("L'appli envoie un par un tous les codes de ta télé (sauf Marche/Arrêt). Dès que la "
                + "télé fait quelque chose, appuie sur ✋ et dis ce qui s'est passé.", 14, SUB, false));
        c.addView(space(8));
        LinearLayout card = card();
        TextView counter = text("Code " + (discoverPos + 1) + " / " + discoverCmds.length, 24, Color.WHITE, true);
        counter.setGravity(Gravity.CENTER);
        card.addView(counter);
        TextView d = text("n° " + IrCodec.commandNumber(candidate), 14, SUB, false);
        d.setGravity(Gravity.CENTER);
        card.addView(d);
        c.addView(card);
        if (note != null) {
            c.addView(text(note, 14, 0xFFFFCC80, true));
            c.addView(space(6));
        }

        if (discoverPicking) {
            c.addView(text("Qu'a fait la télé avec ce code ?", 16, Color.WHITE, true));
            c.addView(space(6));
            String[] all = ASSIST_ORDER;
            LinearLayout r = null;
            for (int i = 0; i < all.length; i++) {
                if (i % 3 == 0) {
                    r = row();
                    c.addView(r);
                }
                final String b = all[i];
                Button pick = key(friendly(b), KEY, 13);
                pick.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        saveOverride(b, candidate);
                        discoverPicking = false;
                        toast("« " + friendly(b) + " » enregistré.");
                        showDiscover(null);
                    }
                });
                r.addView(pick, weight(1, 50));
            }
            c.addView(space(6));
            Button cancel = key("Rien d'utile / annuler", KEY, 15);
            cancel.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    discoverPicking = false;
                    showDiscover(null);
                }
            });
            c.addView(cancel, fullWidth(52));
            return;
        }

        LinearLayout nav = row();
        Button prev = key("◀", KEY, 22);
        prev.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopAuto();
                if (discoverPos > 0) discoverPos--;
                showDiscover(null);
                sender.send(ref.withCommand(discoverCmds[discoverPos]), true);
            }
        });
        Button send = key("ENVOYER", ORANGE, 20);
        send.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                sender.send(candidate, true);
            }
        });
        Button next = key("▶", KEY, 22);
        next.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopAuto();
                if (discoverPos < discoverCmds.length - 1) discoverPos++;
                showDiscover(null);
                sender.send(ref.withCommand(discoverCmds[discoverPos]), true);
            }
        });
        nav.addView(prev, weight(1, 68));
        nav.addView(send, weight(2, 68));
        nav.addView(next, weight(1, 68));
        c.addView(nav);
        c.addView(space(8));
        final boolean running = autoTask != null;
        Button react = key(running ? "✋  STOP, la télé a réagi !" : "✋  La télé a réagi : attribuer ce code",
                GREEN, 17);
        react.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (autoTask != null) {
                    stopAuto();
                    showDiscover("Vérifie avec ENVOYER (◀ pour le code d'avant, la télé réagit parfois avec "
                            + "un temps de retard), puis attribue le code.");
                    return;
                }
                discoverPicking = true;
                showDiscover(null);
            }
        });
        c.addView(react, fullWidth(60));
        c.addView(space(8));
        Button auto = key(running ? "⏸  Pause du défilement" : "⏩  Défilement automatique", running ? KEY : BLUE,
                15);
        auto.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (autoTask != null) {
                    stopAuto();
                    showDiscover(null);
                } else {
                    startAutoDiscover(ref);
                }
            }
        });
        c.addView(auto, fullWidth(52));
        c.addView(space(10));
        StringBuilder found = new StringBuilder();
        for (String b : overrides().keySet()) {
            if (found.length() > 0) found.append(", ");
            found.append(friendly(b));
        }
        if (found.length() > 0) c.addView(text("Déjà réglés : " + found, 13, 0xFF81C784, false));
        c.addView(space(8));
        backButton(c);
    }

    private void startAutoDiscover(final Signal ref) {
        autoTask = new Runnable() {
            @Override
            public void run() {
                if (autoTask != this) return;
                if (discoverPos < discoverCmds.length - 1) {
                    discoverPos++;
                    showDiscover(null);
                    sender.send(ref.withCommand(discoverCmds[discoverPos]), true);
                    ui.postDelayed(this, EXPLORE_INTERVAL_MS);
                } else {
                    stopAuto();
                    showDiscover("Tous les codes ont été envoyés.");
                }
            }
        };
        showDiscover(null);
        sender.send(ref.withCommand(discoverCmds[discoverPos]), true);
        ui.postDelayed(autoTask, EXPLORE_INTERVAL_MS);
    }

    private void stopAuto() {
        if (autoTask != null) ui.removeCallbacks(autoTask);
        autoTask = null;
    }

    // ------------------------------------------------------------------ Wi-Fi (Android TV)

    private boolean wifiMode() {
        return "wifi".equals(prefs.getString("mode", "")) && prefs.getString("atv_host", null) != null;
    }

    private static String wifiLabel(String button) {
        if (button.equals("MENU")) return "⚙ Réglages";
        if (button.equals("EXIT")) return "⏯ Lecture";
        return label(button);
    }

    /** Touche Android (KEYCODE_*) envoyée pour chaque bouton de la télécommande. */
    static int wifiKey(String button) {
        switch (button) {
            case "POWER": return 26;
            case "SOURCE": return 178;
            case "MUTE": return 164;
            case "MENU": return 176;
            case "HOME": return 3;
            case "INFO": return 165;
            case "UP": return 19;
            case "DOWN": return 20;
            case "LEFT": return 21;
            case "RIGHT": return 22;
            case "OK": return 23;
            case "BACK": return 4;
            case "EXIT": return 85;
            case "VOL_UP": return 24;
            case "VOL_DN": return 25;
            case "CH_UP": return 166;
            case "CH_DN": return 167;
            default:
                if (button.length() == 2 && button.charAt(0) == 'N') return 7 + (button.charAt(1) - '0');
                return -1;
        }
    }

    static String wifiLink(String button) {
        if (button.equals("NETFLIX")) return "https://www.netflix.com/title";
        if (button.equals("YOUTUBE")) return "https://www.youtube.com";
        if (button.equals("PRIME")) return "https://app.primevideo.com";
        return null;
    }

    private void setWifiStatus(String textValue, int color) {
        wifiStatusText = textValue;
        wifiStatusColor = color;
        if (wifiStatusView != null) {
            wifiStatusView.setText(textValue);
            wifiStatusView.setTextColor(color);
        }
    }

    private void postWifiStatus(final String textValue, final int color) {
        ui.post(new Runnable() {
            @Override
            public void run() {
                setWifiStatus(textValue, color);
            }
        });
    }

    /** À appeler sur le fil réseau : identité du téléphone (créée une seule fois) et client. */
    private AtvClient atvClient() throws GeneralSecurityException {
        if (atv != null) return atv;
        AtvCert id = null;
        String k = prefs.getString("atv_key", null);
        String c = prefs.getString("atv_cert", null);
        if (k != null && c != null) {
            try {
                id = AtvCert.load(Base64.decode(k, Base64.NO_WRAP), Base64.decode(c, Base64.NO_WRAP));
            } catch (GeneralSecurityException | IllegalArgumentException e) {
                id = null;
            }
        }
        if (id == null) {
            id = AtvCert.generate("Telecommande TV");
            prefs.edit()
                    .putString("atv_key", Base64.encodeToString(id.keyBytes(), Base64.NO_WRAP))
                    .putString("atv_cert", Base64.encodeToString(id.certBytes(), Base64.NO_WRAP))
                    .apply();
        }
        atv = new AtvClient(id, "Télécommande TV (" + Build.MANUFACTURER + " " + Build.MODEL + ")");
        atv.setListener(new AtvClient.Listener() {
            @Override
            public void onConnection(boolean connected, String message) {
                if (connected) postWifiStatus("● Connecté à la télé", 0xFF81C784);
                else postWifiStatus("○ Déconnecté (" + message + ") — touche un bouton pour reconnecter", SUB);
            }

            @Override
            public void onVolume(int level, int max, boolean muted) {
                postWifiStatus("● Connecté · volume " + level + (max > 0 ? "/" + max : "") + (muted ? " (muet)" : ""),
                        0xFF81C784);
            }
        });
        return atv;
    }

    /** Ouvre la connexion à l'avance pour que le premier appui soit instantané. */
    private void wifiWarmUp() {
        final String host = prefs.getString("atv_host", null);
        if (host == null) return;
        net.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    AtvClient c = atvClient();
                    if (c.isConnected()) {
                        postWifiStatus("● Connecté à la télé", 0xFF81C784);
                        return;
                    }
                    postWifiStatus("… Connexion à la télé", 0xFFFFCC80);
                    wifiConnecting = true;
                    c.connect(host);
                } catch (Exception e) {
                    postWifiStatus("✕ Télé injoignable : allumée ? même Wi-Fi ?", 0xFFE57373);
                } finally {
                    wifiConnecting = false;
                }
            }
        });
    }

    /** {@code firstPress} = vrai appui (pas une répétition) : on reconnecte si besoin. */
    private void wifiPress(String button, boolean firstPress) {
        final int keyCode = wifiKey(button);
        final String link = wifiLink(button);
        if (keyCode < 0 && link == null) return;
        if (firstPress) getWindow().getDecorView().performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
        if (!firstPress && (wifiConnecting || atv == null || !atv.isConnected())) return;
        final String host = prefs.getString("atv_host", null);
        net.execute(new Runnable() {
            @Override
            public void run() {
                for (int attempt = 0; attempt < 2; attempt++) {
                    try {
                        AtvClient c = atvClient();
                        if (!c.isConnected()) {
                            postWifiStatus("… Connexion à la télé", 0xFFFFCC80);
                            wifiConnecting = true;
                            try {
                                c.connect(host);
                            } finally {
                                wifiConnecting = false;
                            }
                        }
                        if (link != null) c.launchApp(link);
                        else c.sendKey(keyCode);
                        return;
                    } catch (Exception e) {
                        if (atv != null) atv.disconnect();
                    }
                }
                postWifiStatus("✕ Télé injoignable : vérifie qu'elle est allumée et sur le même Wi-Fi", 0xFFE57373);
            }
        });
    }

    private LinearLayout foundList;
    private TextView searchStatus;

    private void showWifiFind() {
        stopAuto();
        LinearLayout c = page(Screen.WIFI_FIND);
        c.addView(title("📶 Télé en Wi-Fi"));
        c.addView(text("1. Allume la télé et vérifie qu'elle est connectée au Wi-Fi (Réglages → Réseau).\n"
                + "2. Connecte ce téléphone au même Wi-Fi (la même box).\n"
                + "3. Choisis ta télé ci-dessous, puis tape le code qui s'affiche sur l'écran de la télé.",
                14, SUB, false));
        c.addView(space(10));
        searchStatus = text("", 15, Color.WHITE, true);
        c.addView(searchStatus);
        c.addView(space(6));
        foundList = col();
        c.addView(foundList);
        c.addView(space(6));
        Button again = key("🔄  Rechercher à nouveau", KEY, 15);
        again.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startSearch();
            }
        });
        c.addView(again, fullWidth(50));
        c.addView(space(14));
        c.addView(text("Ta télé n'apparaît pas ? Tape son adresse IP (sur la télé : Réglages → Réseau et "
                + "Internet → ton Wi-Fi, par exemple 192.168.1.25) :", 14, SUB, false));
        final EditText ip = new EditText(this);
        ip.setHint("192.168.1.25");
        ip.setHintTextColor(SUB);
        ip.setTextColor(Color.WHITE);
        ip.setSingleLine(true);
        ip.setInputType(InputType.TYPE_CLASS_PHONE);
        ip.setBackground(rounded(CARD));
        ip.setPadding(dp(14), dp(10), dp(14), dp(10));
        c.addView(ip, fullWidth(52));
        c.addView(space(6));
        Button go = key("Se connecter à cette adresse", BLUE, 16);
        go.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String host = ip.getText().toString().trim();
                if (!host.matches("\\d{1,3}(\\.\\d{1,3}){3}")) {
                    toast("Adresse invalide : 4 nombres séparés par des points, par exemple 192.168.1.25");
                    return;
                }
                startPairing(host, host);
            }
        });
        c.addView(go, fullWidth(52));
        c.addView(space(12));
        c.addView(text("Ça marche avec les télés Android TV / Google TV (ELACTRON Smart, TCL, Hisense Android, "
                + "Sony, Xiaomi…). Si ta télé n'est pas une Android TV, utilise la télécommande infrarouge.",
                12, SUB, false));
        startSearch();
    }

    private void startSearch() {
        if (finder != null) finder.stop();
        foundTvs.clear();
        searching = true;
        refreshFoundList();
        finder = new AtvFinder(this, ui, new AtvFinder.Callback() {
            @Override
            public void found(String host, String name) {
                for (String[] t : foundTvs) {
                    if (t[0].equals(host)) {
                        if (!name.equals("Android TV")) t[1] = name; // le nom mDNS est plus parlant
                        refreshFoundList();
                        return;
                    }
                }
                foundTvs.add(new String[] {host, name});
                refreshFoundList();
            }

            @Override
            public void done() {
                searching = false;
                refreshFoundList();
            }
        });
        finder.start();
    }

    private void refreshFoundList() {
        if (screen != Screen.WIFI_FIND || foundList == null) return;
        if (searching) searchStatus.setText("🔍 Recherche des télés sur le Wi-Fi…");
        else if (foundTvs.isEmpty()) searchStatus.setText("Aucune télé trouvée. Vérifie le Wi-Fi, ou tape l'adresse IP.");
        else searchStatus.setText(foundTvs.size() + " télé(s) trouvée(s) : touche la tienne.");
        foundList.removeAllViews();
        for (final String[] t : foundTvs) {
            Button b = key("📺  " + t[1] + "\n" + t[0], GREEN, 15);
            b.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    startPairing(t[0], t[1]);
                }
            });
            LinearLayout.LayoutParams lp = fullWidth(66);
            lp.bottomMargin = dp(6);
            foundList.addView(b, lp);
        }
    }

    private void startPairing(final String host, final String name) {
        if (finder != null) finder.stop();
        pairHost = host;
        pairName = name;
        pairing = null;
        showWifiPair("… Connexion à la télé " + host, true);
        net.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    AtvClient c = atvClient();
                    c.disconnect();
                    try { // déjà appairée ? on passe directement à la télécommande
                        c.connect(host);
                        onPaired(host, c.tvName().isEmpty() ? name : c.tvName());
                        return;
                    } catch (IOException notPaired) {
                        c.disconnect();
                    }
                    AtvClient.Pairing p = c.pair(host);
                    p.start();
                    pairing = p;
                    if (!c.tvName().isEmpty()) pairName = c.tvName();
                    ui.post(new Runnable() {
                        @Override
                        public void run() {
                            showWifiPair(null, false);
                        }
                    });
                } catch (final Exception e) {
                    ui.post(new Runnable() {
                        @Override
                        public void run() {
                            showWifiPair("❌ Impossible de joindre la télé (" + e.getMessage() + ").\n"
                                    + "Vérifie qu'elle est allumée, sur le même Wi-Fi, et que c'est bien une "
                                    + "Android TV.", false);
                        }
                    });
                }
            }
        });
    }

    private void onPaired(final String host, final String name) {
        prefs.edit().putString("atv_host", host).putString("atv_name", name).putString("mode", "wifi").apply();
        ui.post(new Runnable() {
            @Override
            public void run() {
                toast("📶 Télé connectée en Wi-Fi !");
                showRemote();
            }
        });
    }

    private void showWifiPair(String note, boolean busy) {
        LinearLayout c = page(Screen.WIFI_PAIR);
        c.addView(title("🔐 Appairage"));
        c.addView(text("Télé : " + pairName + (pairName.equals(pairHost) ? "" : " (" + pairHost + ")"), 15, SUB, false));
        c.addView(space(10));
        if (note != null) {
            c.addView(text(note, 15, busy ? 0xFFFFCC80 : 0xFFE57373, true));
            c.addView(space(10));
        }
        if (busy) return;
        if (pairing != null) {
            c.addView(text("Un code de 6 caractères (chiffres et lettres A à F) s'affiche sur l'écran de la télé. "
                    + "Tape-le ici :", 16, Color.WHITE, true));
            c.addView(space(8));
            final EditText code = new EditText(this);
            code.setHint("ex. 4B7A2F");
            code.setHintTextColor(SUB);
            code.setTextColor(Color.WHITE);
            code.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
            code.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
            code.setGravity(Gravity.CENTER);
            code.setSingleLine(true);
            code.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
                    | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
            code.setFilters(new android.text.InputFilter[] {new android.text.InputFilter.LengthFilter(6),
                new android.text.InputFilter.AllCaps()});
            code.setBackground(rounded(CARD));
            c.addView(code, fullWidth(70));
            c.addView(space(10));
            Button ok = key("✅  Valider le code", GREEN, 18);
            ok.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    finishPairing(code.getText().toString());
                }
            });
            c.addView(ok, fullWidth(60));
            c.addView(space(10));
        }
        Button retry = key("🔄  Recommencer (nouveau code)", KEY, 15);
        retry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startPairing(pairHost, pairName);
            }
        });
        c.addView(retry, fullWidth(52));
        c.addView(space(8));
        Button back = key("↩  Retour à la liste des télés", KEY, 15);
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showWifiFind();
            }
        });
        c.addView(back, fullWidth(52));
    }

    private void finishPairing(final String code) {
        final AtvClient.Pairing p = pairing;
        final String host = pairHost;
        if (p == null) return;
        if (!code.trim().toUpperCase(java.util.Locale.US).matches("[0-9A-F]{6}")) {
            toast("Le code fait 6 caractères : chiffres 0-9 et lettres A-F.");
            return;
        }
        showWifiPair("… Vérification du code", true);
        net.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    if (!p.finish(code)) {
                        p.close();
                        ui.post(new Runnable() {
                            @Override
                            public void run() {
                                toast("Code incorrect : un nouveau code va s'afficher sur la télé.");
                                startPairing(pairHost, pairName);
                            }
                        });
                        return;
                    }
                    pairing = null;
                    AtvClient c = atvClient();
                    c.connect(host);
                    onPaired(host, c.tvName().isEmpty() ? pairName : c.tvName());
                } catch (final Exception e) {
                    ui.post(new Runnable() {
                        @Override
                        public void run() {
                            showWifiPair("❌ Échec : " + e.getMessage(), false);
                        }
                    });
                }
            }
        });
    }

    // ------------------------------------------------------------------ aide

    private void showHelp() {
        stopAuto();
        LinearLayout c = page(Screen.HELP);
        c.addView(title("❓ Aide"));
        String[][] items = {
            {"Mon téléphone n'a pas d'infrarouge",
                "Si ta télé est une Android TV (c'est le cas des ELACTRON Smart), passe par le Wi-Fi : "
                + "Accueil → « 📶 Connecter ma télé en Wi-Fi ». Télé et téléphone sur le même Wi-Fi, choisis "
                + "la télé, tape le code à 6 caractères affiché sur la télé : c'est fini, tous les boutons "
                + "marchent tout de suite."},
            {"La télé Wi-Fi n'est pas trouvée",
                "Vérifie que la télé est allumée et connectée au Wi-Fi (Réglages → Réseau), et que le "
                + "téléphone est sur la même box (pas en 4G). Tu peux aussi taper l'adresse IP de la télé, "
                + "visible dans Réglages → Réseau et Internet. En veille profonde, la télé ne répond plus en "
                + "Wi-Fi : allume-la avec son bouton."},
            {"Mon téléphone peut-il servir de télécommande ?",
                "Il faut un émetteur infrarouge (une petite fenêtre noire sur le dessus du téléphone). "
                + "L'écran d'accueil de l'appli te le dit tout de suite. On en trouve sur beaucoup de "
                + "Xiaomi / Redmi / POCO, de Tecno et d'Infinix, sur certains Honor et Huawei. "
                + "Les iPhone et les Samsung récents n'en ont pas."},
            {"Comment trouver le code de ma ELACTRON ?",
                "Utilise la recherche automatique : allume la télé avec son bouton, pointe le téléphone "
                + "vers elle et appuie sur TESTER, puis ▶ pour le code suivant (ou lance le défilement "
                + "automatique). Dès que la télé s'éteint, appuie sur ✅. Rallume-la ensuite avec le "
                + "gros bouton rouge de l'appli."},
            {"La télé s'éteint mais d'autres boutons ne marchent pas",
                "C'est normal : plusieurs modèles partagent le même code Marche/Arrêt. Touche "
                + "« 🛠 Régler » → « ✨ Assistant » : pour chaque bouton, appuie sur TESTER puis ✅ ou ❌. "
                + "L'appli propose d'abord les codes les plus probables (souvent 2 ou 3 essais) et "
                + "apprend de tes réponses. Les réglages sont gardés en mémoire."},
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
        if (s != Screen.SCAN && s != Screen.ASSIST && s != Screen.DISCOVER) {
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
