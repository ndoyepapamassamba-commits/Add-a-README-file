// Teranga Pro — demo mode for testing the whole journey on a phone without paying (started from demo.html).
// Loaded FIRST on every formation page. Without sessionStorage "tpro:demo" === "1" it does strictly nothing: one
// read of that key, then return (no global, no listener, no DOM change, window.fetch untouched — e2e/course.mjs
// proves it). With the flag it serves an in-browser mock of the course API for the API base only (state kept in
// sessionStorage "tpro:demo:state", the pages' localStorage swapped for a stand-in in the same tab storage, nothing
// ever reaches the server or the phone's real localStorage): sales open, manual checkout with the exact
// amount 24 987 FCFA, « J'ai envoyé l'argent » → paid about 3 s later, module 1 = the PUBLIC free module (read from
// gratuit.html), modules 2–8 listed with a placeholder, the PUBLIC exemple-impayes.csv as the only download, a
// 3-question sample quiz (not the real one), attestation, receipt, leads (nothing sent). It contains no paid content.
(function (w) {
  "use strict";

  var FLAG = "tpro:demo";
  var on = false;
  try {
    on = w.sessionStorage.getItem(FLAG) === "1";
  } catch (e) {
    on = false;
  }
  if (!on) return;

  /* ====================================================================================================== */
  /* Everything below runs in demo mode only.                                                                */
  /* ====================================================================================================== */

  var STATE_KEY = "tpro:demo:state";
  var NBSP = "\u00a0";
  var PRICE = 25000;
  var EXACT = 24987; // the unique amount a real order would show (price minus a small offset)
  var PAID_AFTER_MS = 3000;
  var DELAY_MS = 200;
  var TITLE = "Power Query pour le reporting bancaire";
  var SUBTITLE = "Automatisez vos états mensuels sous Excel — édition UEMOA";
  var EDITION = "Essentiel — démonstration";
  var LABEL = "Formation «" + NBSP + TITLE + NBSP + "» — édition Essentiel (démonstration, aucun paiement réel)";
  var SELLER = "Vendeur" + NBSP + ": particulier — reçu de paiement, pas une facture";
  var KIND = "Attestation de suivi — non diplômante";
  var RESERVED = "Contenu réservé aux acheteurs — visible dans la vraie formation";
  var FREE_PAGE = "gratuit.html";
  var CSV_NAME = "exemple-impayes.csv";
  var CSV_URL = "gratuit/" + CSV_NAME;
  var START = "<!-- GRATUIT:DEBUT -->";
  var END = "<!-- GRATUIT:FIN -->";

  // Public table of contents: the titles, durations, programme lines and exercise counts of the sales page
  // (index.html #programme). No module text here.
  var MODULES = [
    [1, "Exemple de leçon" + NBSP + ": calculer l'ancienneté des impayés (module gratuit)", 30, "", 1],
    [2, "Importer les extractions", 90,
      "CSV au point-virgule et bon encodage ; «" + NBSP + "1" + NBSP + "234" + NBSP + "567,50" + NBSP + "» et jj/mm/aaaa en fr-FR ; codes gardés en texte ; tous les fichiers mensuels d'un dossier combinés ; date d'arrêté pilotée par un tableau de paramètres ; contrôle de chaque import.", 5],
    [3, "Nettoyer et typer", 90,
      "Diagnostiquer une extraction «" + NBSP + "sale" + NBSP + "» (titres, lignes vides, total en pied) ; normaliser textes et codes agence ; isoler les erreurs dans une requête d'audit ; dédoublonner au bon moment ; rapprocher les totaux du pied de fichier.", 6],
    [4, "Table de correspondance comptes → postes", 100,
      "Mapper la balance par préfixe de compte (structure du PCB révisé) ; détecter automatiquement les comptes non mappés ; état par poste avec convention de signe ; règle du préfixe le plus long. Table d'exemple pédagogique, pas un état réglementaire officiel.", 7],
    [5, "Ancienneté des impayés", 110,
      "Jours de retard recalculés et contrôlés ; tranches lues dans un tableau Excel, sans toucher au code ; balance âgée stable avec ligne Total ; croisement agence × produit ; évolution sur plusieurs mois ; matrice de transition des tranches.", 7],
    [6, "Indicateurs de qualité du portefeuille", 110,
      "Créances en souffrance et taux de créances douteuses (banques) d'un côté, PAR30/PAR90 (microfinance) de l'autre" + NBSP + ": définitions publiques citées, calcul mensuel, détail par agence et par produit sans moyenne de taux.", 6],
    [7, "Rapprochement balance ↔ encours", 110,
      "Ventiler l'encours en comptes comptables ; rapprocher balance et encours par mois et par compte avec une tolérance documentée ; pourquoi un rapprochement en total ne suffit pas ; liste des écarts à justifier ; remonter d'un écart aux contrats.", 9],
    [8, "Contrôles de cohérence et actualisation en un clic", 120,
      "Contrôles bloquants et d'alerte (équilibre, continuité des soldes, sens anormaux, variations à double seuil) ; tableau de contrôle horodaté ; test avec un fichier du mauvais mois ; checklist mensuelle.", 7]
  ].map(function (m) {
    m[3] = m[3].replace(/ ;/g, NBSP + ";");
    return m;
  });

  // Sample quiz on the free module only (the real 20-question quiz is never in the public site).
  var QUIZ = [
    {
      id: "q01",
      text: "Dans le module gratuit, que mesurent les «" + NBSP + "jours de retard" + NBSP + "» d'un contrat" + NBSP + "?",
      choices: [
        "Le nombre de jours entre la date du premier impayé et la date d'arrêté",
        "Le nombre de jours écoulés depuis l'octroi du prêt",
        "Le nombre d'échéances qui restent à payer",
        "Le nombre de jours avant la prochaine échéance"
      ]
    },
    {
      id: "q02",
      text: "Un contrat sans aucun impayé (date du premier impayé vide) compte combien de jours de retard" + NBSP + "?",
      choices: ["Il est retiré du calcul", "0 jour", "30 jours", "Une erreur bloque la requête"]
    },
    {
      id: "q03",
      text: "Le mois suivant, comment mettre à jour la balance âgée" + NBSP + "?",
      choices: [
        "Refaire toutes les étapes à la main",
        "Recopier les formules sur les nouvelles lignes",
        "Remplacer le fichier puis cliquer sur Données › Actualiser tout",
        "Créer un nouveau classeur"
      ]
    }
  ];
  var QUIZ_KEY = { q01: 0, q02: 1, q03: 2 };

  var realFetch = typeof w.fetch === "function" ? w.fetch.bind(w) : null;
  var doc = w.document;

  /* ---------- State (sessionStorage) ---------- */

  function load() {
    try {
      var s = JSON.parse(w.sessionStorage.getItem(STATE_KEY) || "null");
      if (s && typeof s === "object" && s.orders && typeof s.orders === "object") return s;
    } catch (e) {
      /* fresh state */
    }
    return { orders: {}, leads: 0 };
  }

  function save(s) {
    try {
      w.sessionStorage.setItem(STATE_KEY, JSON.stringify(s));
    } catch (e) {
      /* the demo keeps working for this page */
    }
  }

  function randomChars(alphabet, n) {
    var out = "";
    var bytes = new Uint8Array(n);
    try {
      w.crypto.getRandomValues(bytes);
    } catch (e) {
      for (var i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    for (var j = 0; j < n; j++) out += alphabet.charAt(bytes[j] % alphabet.length);
    return out;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  /* ---------- HTTP helpers ---------- */

  function json(status, body, headers) {
    var h = { "content-type": "application/json; charset=utf-8" };
    Object.keys(headers || {}).forEach(function (k) {
      h[k] = headers[k];
    });
    return new Response(JSON.stringify(body), { status: status, headers: h });
  }

  function error(status, code, message, fields) {
    var body = { error: code, message: message };
    if (fields) body.fields = fields;
    return json(status, body);
  }

  function notFound() {
    return error(404, "not_found", "Commande introuvable.");
  }

  function parseBody(text) {
    if (!text) return {};
    try {
      var v = JSON.parse(text);
      return v && typeof v === "object" ? v : {};
    } catch (e) {
      return {};
    }
  }

  function clean(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  }

  /* ---------- Orders ---------- */

  function refresh(state, o) {
    if (o.status === "awaiting_manual" && o.paidAfter && Date.now() >= o.paidAfter) {
      o.status = "paid";
      o.paidAt = new Date(o.paidAfter).toISOString();
      save(state);
    }
    return o;
  }

  function findOrder(state, id, token) {
    var o = state.orders[id];
    if (!o || !token || o.token !== token) return null;
    return refresh(state, o);
  }

  function publicOrder(o) {
    var paid = o.status === "paid";
    return {
      id: o.id,
      product: "pq_essentiel",
      template: "classique",
      amount: PRICE,
      currency: "XOF",
      status: o.status,
      paymentMethod: paid ? "manual" : null,
      paidAt: paid ? o.paidAt : null,
      createdAt: o.createdAt
    };
  }

  function orderView(o) {
    var view = {
      order: publicOrder(o),
      buyer: { fullName: o.fullName },
      course: { id: "pq_essentiel", title: TITLE, edition: EDITION }
    };
    if (o.status === "paid") {
      view.receipt = {
        number: o.id,
        paidAt: o.paidAt,
        amount: EXACT,
        currency: "XOF",
        paymentMethod: "manual",
        label: LABEL,
        buyerName: o.fullName,
        seller: SELLER
      };
    }
    return view;
  }

  function config() {
    return json(200, {
      brandName: "Teranga CV",
      currency: "XOF",
      prices: { cv: 1000, lettre: 1000, pack: 1500, stage: 1500, premium: 5000, stageMulti: 2500 },
      payment: { wave: false, manual: true, manualWaveNumber: "Démo — n'envoyez rien", ownerWhatsapp: null },
      courses: { pq_essentiel: { price: PRICE, open: true } }
    });
  }

  var NAME_RE = (function () {
    try {
      return new RegExp("^[\\p{L}\\p{M}][\\p{L}\\p{M}'’ .-]*$", "u");
    } catch (e) {
      return /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’ .-]*$/;
    }
  })();

  function createOrder(state, body) {
    if (clean(body.website)) return error(400, "validation", "Votre demande n'a pas pu être traitée.");
    if (body.product !== "pq_essentiel") return error(400, "validation", "Certains champs sont à corriger.", { product: "Valeur invalide." });
    var buyer = body.buyer && typeof body.buyer === "object" ? body.buyer : {};
    var fullName = clean(buyer.fullName);
    var fields = {};
    if (!fullName) fields["buyer.fullName"] = "Indiquez votre prénom et votre nom" + NBSP + ": ils figurent sur vos fichiers et votre attestation.";
    else if (fullName.length < 2 || fullName.length > 80 || !NAME_RE.test(fullName)) {
      fields["buyer.fullName"] = "Lettres, espaces, apostrophes et tirets uniquement (80 caractères au plus).";
    }
    if (body.acceptCgv !== true) fields.acceptCgv = "Cochez la case pour accepter les conditions générales de vente.";
    if (Object.keys(fields).length) return error(400, "validation", "Certains champs sont à corriger.", fields);
    var id;
    do {
      id = "DEMO-" + randomChars("0123456789ABCDEFGHJKMNPQRSTVWXYZ", 6);
    } while (state.orders[id]);
    var o = {
      id: id,
      token: randomChars("0123456789abcdef", 32),
      fullName: fullName,
      createdAt: nowIso(),
      status: "preview",
      paidAfter: null,
      paidAt: null,
      attestation: null
    };
    state.orders[id] = o;
    save(state);
    var out = publicOrder(o);
    out.token = o.token;
    return json(201, { order: out });
  }

  function checkout(state, o) {
    if (o.status === "paid") return error(409, "already_paid", "Cette commande est déjà payée.");
    if (o.status === "preview") {
      o.status = "checkout";
      save(state);
    }
    return json(200, {
      mode: "manual",
      waveNumber: "Démo — n'envoyez rien",
      amount: PRICE,
      exactAmount: EXACT,
      exactAmountFormatted: "24" + NBSP + "987" + NBSP + "FCFA",
      autoUnlock: true,
      reference: o.id,
      whatsapp: null
    });
  }

  function manualPaid(state, o) {
    if (o.status !== "paid") {
      o.status = "awaiting_manual";
      if (!o.paidAfter) o.paidAfter = Date.now() + PAID_AFTER_MS;
      save(state);
    }
    return json(200, { order: publicOrder(o) });
  }

  /* ---------- Course (module 1 = the public free module, read from gratuit.html) ---------- */

  function freeModuleHtml() {
    if (!realFetch) return Promise.resolve(null);
    return realFetch(FREE_PAGE, { cache: "no-store" })
      .then(function (res) {
        return res.ok ? res.text() : null;
      })
      .then(function (page) {
        if (!page) return null;
        var a = page.indexOf(START);
        var b = page.indexOf(END);
        return a >= 0 && b > a ? page.slice(a + START.length, b).trim() : null;
      })
      .catch(function () {
        return null;
      });
  }

  function csvBytes() {
    if (!realFetch) return Promise.resolve(null);
    return realFetch(CSV_URL, { cache: "no-store" })
      .then(function (res) {
        return res.ok ? res.arrayBuffer() : null;
      })
      .catch(function () {
        return null;
      });
  }

  function escapeHtml(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /** Modules 2–8: what the real module holds (public programme line and exercise count), never its text. */
  function placeholder(n) {
    var m = MODULES[n - 1] || [n, "", 0, "", 0];
    var about = m[3]
      ? "<p><strong>Dans la vraie formation" + NBSP + ":</strong> " + escapeHtml(m[3]) + "</p><p>" + m[4] + NBSP +
        "exercices · classeur d'exercices + données fictives · solutions en code M · résultats attendus.</p>"
      : "";
    return (
      '<section class="module" data-module="' + n + '"><div class="callout-info"><p><strong>' + RESERVED +
      "</strong></p>" + about + "<p>Version de démonstration" + NBSP + ": le texte du module n'est pas affiché.</p></div></section>"
    );
  }

  function attestationOf(o) {
    var a = o.attestation;
    return a ? { code: a.code, passedAt: a.passedAt, score: a.score, publicListing: a.publicListing } : null;
  }

  function course(o) {
    return Promise.all([freeModuleHtml(), csvBytes()]).then(function (got) {
      var free = got[0] || placeholder(1).replace(RESERVED, "Le module d'exemple n'a pas pu être chargé. Réessayez dans un instant.");
      var size = got[1] ? got[1].byteLength : 0;
      var view = {
        course: { id: "pq_essentiel", title: TITLE, subtitle: SUBTITLE, edition: EDITION, version: "démo", updatedAt: "2026-10-21" },
        buyer: { fullName: o.fullName },
        order: { id: o.id, paidAt: o.paidAt },
        modules: MODULES.map(function (m) {
          return {
            id: "module-0" + m[0],
            n: m[0],
            title: m[1],
            minutes: m[2],
            objectives: [],
            files: m[0] === 1 ? [CSV_NAME] : [],
            html: m[0] === 1 ? free : placeholder(m[0])
          };
        }),
        files: [{ name: CSV_NAME, label: "Données du module gratuit (exemple de démonstration)", size: size, module: 1 }],
        quiz: { passPercent: 70, questions: QUIZ }
      };
      var att = attestationOf(o);
      if (att) view.attestation = att;
      return json(200, view);
    });
  }

  function download(o, name) {
    if (name !== CSV_NAME) return Promise.resolve(error(404, "not_found", "Fichier introuvable."));
    return csvBytes().then(function (bytes) {
      if (!bytes) return error(404, "not_found", "Fichier introuvable.");
      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="' + CSV_NAME + '"',
          "cache-control": "no-store, private"
        }
      });
    });
  }

  function quiz(state, o, body) {
    var answers = body.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return error(400, "validation", "Certains champs sont à corriger.", { answers: "Répondez aux questions avant d'envoyer." });
    }
    if (body.publicListing !== undefined && typeof body.publicListing !== "boolean") {
      return error(400, "validation", "Certains champs sont à corriger.", { publicListing: "Valeur invalide." });
    }
    var correct = QUIZ.filter(function (q) {
      return answers[q.id] === QUIZ_KEY[q.id];
    }).length;
    var total = QUIZ.length;
    var score = Math.round((100 * correct) / total);
    if (score < 70) return json(200, { score: score, correct: correct, total: total, passPercent: 70, passed: false, code: null });
    var prev = o.attestation;
    o.attestation = {
      code: prev ? prev.code : randomChars("0123456789abcdef", 12),
      passedAt: prev ? prev.passedAt : nowIso(),
      score: prev ? Math.max(prev.score, score) : score,
      publicListing: body.publicListing === true
    };
    save(state);
    return json(200, { score: score, correct: correct, total: total, passPercent: 70, passed: true, code: o.attestation.code });
  }

  function attestation(state, raw) {
    var code = String(raw || "").toLowerCase();
    var missing = error(404, "not_found", "Attestation introuvable.");
    if (!/^[0-9a-f]{12}$/.test(code)) return missing;
    var ids = Object.keys(state.orders);
    for (var i = 0; i < ids.length; i++) {
      var o = state.orders[ids[i]];
      if (o.attestation && o.attestation.code === code && o.attestation.publicListing) {
        return json(200, { code: code, fullName: o.fullName, course: LABEL, date: o.attestation.passedAt.slice(0, 10), kind: KIND });
      }
    }
    return missing;
  }

  function lead(state, body) {
    if (clean(body.website)) return error(400, "validation", "Votre demande n'a pas pu être traitée.");
    var fields = {};
    if (!clean(body.email) && !clean(body.whatsapp)) fields.contact = "Indiquez un e-mail ou un numéro WhatsApp.";
    if (body.consent !== true) fields.consent = "Cochez la case pour accepter d'être prévenu(e).";
    if (Object.keys(fields).length) return error(400, "validation", "Certains champs sont à corriger.", fields);
    state.leads = (state.leads || 0) + 1;
    save(state);
    return json(201, { ok: true });
  }

  /* ---------- Router ---------- */

  function route(method, rest, bodyText) {
    var state = load();
    var qi = rest.indexOf("?");
    var path = qi >= 0 ? rest.slice(0, qi) : rest;
    var params = new URLSearchParams(qi >= 0 ? rest.slice(qi + 1) : "");
    var body = method === "POST" ? parseBody(bodyText) : {};
    var m;

    if (path === "/config" && method === "GET") return config();
    if (path === "/health" && method === "GET") return json(200, { ok: true });
    if (path === "/orders" && method === "POST") return createOrder(state, body);
    if (path === "/leads" && method === "POST") return lead(state, body);
    if ((m = /^\/attestations\/([^/]+)$/.exec(path)) && method === "GET") return attestation(state, decodeURIComponent(m[1]));

    if ((m = /^\/orders\/([^/]+)(\/.*)?$/.exec(path))) {
      var id = decodeURIComponent(m[1]);
      var sub = m[2] || "";
      var token = method === "GET" ? params.get("t") : body.t;
      var o = findOrder(state, id, typeof token === "string" ? token : null);
      if (!o) return notFound();
      if (sub === "" && method === "GET") return json(200, orderView(o));
      if (sub === "/checkout" && method === "POST") return checkout(state, o);
      if (sub === "/manual-paid" && method === "POST") return manualPaid(state, o);
      if (o.status !== "paid") return notFound(); // course, files, quiz: paid orders only (same 404 as unknown)
      if (sub === "/course" && method === "GET") return course(o);
      var f = /^\/files\/([^/]+)$/.exec(sub);
      if (f && method === "GET") return download(o, decodeURIComponent(f[1]));
      if (sub === "/quiz" && method === "POST") return quiz(state, o, body);
      return notFound();
    }
    return error(404, "not_found", "Ressource introuvable.");
  }

  function apiBase() {
    var cfg = w.TCV_CONFIG || {};
    var base = String(cfg.apiBase || "").replace(/\/+$/, "");
    if (!base) return "";
    try {
      return new URL(base, w.location.href).href.replace(/\/+$/, "");
    } catch (e) {
      return base;
    }
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  w.fetch = function (input, init) {
    var raw = typeof input === "string" ? input : input && input.url ? input.url : String(input);
    var url = raw;
    try {
      url = new URL(raw, w.location.href).href;
    } catch (e) {
      url = raw;
    }
    var base = apiBase();
    var mine = base && (url === base || url.indexOf(base + "/") === 0 || url.indexOf(base + "?") === 0);
    if (!mine) {
      if (!realFetch) return Promise.reject(new TypeError("fetch unavailable"));
      return realFetch(input, init);
    }
    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var bodyText = init && typeof init.body === "string" ? init.body : null;
    return wait(DELAY_MS).then(function () {
      return route(method, url.slice(base.length), bodyText);
    });
  };

  /* ---------- The page's localStorage, kept in this tab only ---------- */

  // « Mes formations », reading progress, quiz answers and « Vous serez prévenu(e) » of the demo must never reach the
  // real site (even when the tab is closed without « Quitter la démo »): during the demo the pages get a Storage
  // stand-in backed by this tab's sessionStorage, under "tpro:demo:ls:". The phone's real localStorage is untouched.
  var LS_PREFIX = STATE_KEY.replace(/state$/, "ls:");
  var demoLocal = {
    getItem: function (k) {
      return w.sessionStorage.getItem(LS_PREFIX + k);
    },
    setItem: function (k, v) {
      w.sessionStorage.setItem(LS_PREFIX + k, String(v));
    },
    removeItem: function (k) {
      w.sessionStorage.removeItem(LS_PREFIX + k);
    },
    key: function (i) {
      return demoKeys()[i] || null;
    },
    clear: function () {
      demoKeys().forEach(function (k) {
        w.sessionStorage.removeItem(LS_PREFIX + k);
      });
    }
  };
  function demoKeys() {
    var out = [];
    for (var i = 0; i < w.sessionStorage.length; i++) {
      var k = w.sessionStorage.key(i);
      if (k && k.indexOf(LS_PREFIX) === 0) out.push(k.slice(LS_PREFIX.length));
    }
    return out;
  }
  Object.defineProperty(demoLocal, "length", {
    get: function () {
      return demoKeys().length;
    }
  });
  try {
    Object.defineProperty(w, "localStorage", {
      configurable: true,
      get: function () {
        return demoLocal;
      }
    });
  } catch (e) {
    /* old browser: the demo still works, its entries stay in localStorage */
  }

  /* ---------- Banner, exit, links ---------- */

  function quit() {
    // Everything of the demo lives in this tab's sessionStorage (flag, state, the page's « localStorage »).
    try {
      var drop = [];
      for (var i = 0; i < w.sessionStorage.length; i++) {
        var k = w.sessionStorage.key(i);
        if (k === FLAG || k.indexOf(FLAG + ":") === 0) drop.push(k);
      }
      drop.forEach(function (k) {
        w.sessionStorage.removeItem(k);
      });
    } catch (e) {
      /* nothing else to clear */
    }
    w.location.href = "index.html";
  }

  /** The next step on this page, shown in the banner (the instructions of demo.html are not visible here). */
  function pageHint() {
    var page = (w.location.pathname.split("/").pop() || "index.html").toLowerCase();
    var q = function (t) {
      return "«" + NBSP + t + NBSP + "»";
    };
    if (page === "index.html") return "Paiement simulé" + NBSP + ": n'envoyez rien, touchez " + q("J'ai envoyé l'argent");
    if (page === "lecture.html") return "Touchez " + q("Sommaire") + NBSP + ": quiz, fichiers, reçu";
    if (page === "recu.html" || page === "attestation.html") return q("Retour à la formation") + " pour continuer";
    if (page === "gratuit.html") return "Formulaire simulé" + NBSP + ": rien n'est envoyé";
    return "Paiement simulé";
  }

  var hintNode = null;
  var hintTimer = null;

  /** Shows `text` in the banner for a few seconds, then the page hint again. */
  function flash(text) {
    if (!hintNode) return;
    hintNode.textContent = text;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () {
      hintNode.textContent = pageHint();
    }, 8000);
  }

  function banner() {
    if (doc.getElementById("tpro-demo-banner")) return;
    var bar = doc.createElement("div");
    bar.id = "tpro-demo-banner";
    bar.className = "demo-banner";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Mode démonstration");
    var p = doc.createElement("p");
    var strong = doc.createElement("strong");
    strong.textContent = "MODE DÉMO";
    p.appendChild(strong);
    hintNode = doc.createElement("span");
    hintNode.className = "demo-hint";
    hintNode.setAttribute("aria-live", "polite");
    hintNode.textContent = pageHint();
    p.appendChild(hintNode);
    var btn = doc.createElement("button");
    btn.type = "button";
    btn.id = "tpro-demo-quit";
    btn.textContent = "Quitter la démo";
    btn.addEventListener("click", quit);
    p.appendChild(btn);
    bar.appendChild(p);
    doc.body.appendChild(bar);
    // Nothing of the page may stay hidden under the banner (formation.css reads --demo-bar-h).
    var measure = function () {
      doc.documentElement.style.setProperty("--demo-bar-h", Math.ceil(bar.getBoundingClientRect().height) + "px");
    };
    measure();
    w.addEventListener("resize", measure);
  }

  // Pages of this folder opened in a new tab would lose the demo (sessionStorage is per tab): keep them here.
  // « Envoyer ce lien sur mon WhatsApp » would send a demo link that only works in this tab: explained instead.
  doc.addEventListener(
    "click",
    function (e) {
      var self = e.target && e.target.closest ? e.target.closest("[data-whatsapp-self]") : null;
      if (self) {
        e.preventDefault();
        flash("En démonstration, ce lien ne marcherait pas hors de cet onglet. Dans la vraie formation, il ouvre WhatsApp avec le lien personnel de l'acheteur.");
        return;
      }
      var a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
      if (!a) return;
      try {
        var u = new URL(a.getAttribute("href") || "", w.location.href);
        var folder = w.location.pathname.replace(/[^/]*$/, "");
        if (u.origin === w.location.origin && u.pathname.indexOf(folder) === 0) a.removeAttribute("target");
      } catch (err) {
        /* leave the link as is */
      }
    },
    true
  );

  doc.documentElement.classList.add("is-demo");
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", banner);
  else banner();
})(window);
