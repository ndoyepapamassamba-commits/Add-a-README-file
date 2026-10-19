// admin.html — owner dashboard. The ADMIN_KEY comes from #k=<key> (then removed from the address bar)
// or from the login form, and is kept in localStorage. It is only ever sent as a Bearer header.
(function () {
  "use strict";

  var TCV = window.TCV;
  var $ = TCV.dom.$;
  var el = TCV.dom.el;
  var setText = TCV.dom.setText;
  var fcfa = TCV.fmt.fcfa;

  var KEY_STORE = "tcv:adminKey";
  var REFRESH_MS = 60000;
  var adminKey = null;
  var refreshTimer = null;
  var copyTimer = null;

  // Every label on this page matches the owner guide (LANCEMENT-CV.md, section 7): keep both in sync.
  var STATUS = {
    preview: ["Aperçu", ""],
    checkout: ["Paiement en cours", "badge-wait"],
    awaiting_manual: ["En attente", "badge-wait"],
    paid: ["Payé", "badge-paid"]
  };
  var PAYOUT_STATUS = {
    pending: ["En attente", "badge-wait"],
    processing: ["En cours", "badge-wait"],
    succeeded: ["Réussi", "badge-paid"],
    failed: ["Échoué", "badge-fail"],
    unknown: ["À confirmer (nouvel essai automatique)", "badge-wait"]
  };

  function keyFromFragment() {
    var h = window.location.hash.replace(/^#/, "");
    if (!h) return null;
    try {
      return new URLSearchParams(h).get("k");
    } catch (e) {
      return null;
    }
  }

  function showLogin(message) {
    stopRefresh();
    hidePhoneCard();
    $("#dash").hidden = true;
    $("#login").hidden = false;
    setText($("#login-error"), message || "");
    $("#admin-key").focus();
  }

  function badge(map, value) {
    var entry = map[value] || [value || "—", ""];
    return el("span", { class: "badge " + entry[1], text: entry[0] });
  }

  function kpi(title, amount, sub, highlight) {
    return el("div", { class: "kpi" + (highlight ? " kpi-hl" : "") }, [
      el("h3", { text: title }),
      el("div", { class: "v" }, [TCV.fmt.fcfa(amount).replace(/\u00a0FCFA$/, ""), el("span", { class: "unit", text: " FCFA" })]),
      sub ? el("div", { class: "s", text: sub }) : null
    ]);
  }

  function periodSub(p) {
    return p.paid + " payée" + (p.paid > 1 ? "s" : "") + " sur " + p.orders + " commande" + (p.orders > 1 ? "s" : "");
  }

  function renderKpis(stats, health) {
    var box = TCV.dom.clear($("#kpis"));
    var payoutSub = health.payout
      ? "Versé automatiquement vers 20 h 30 sur " + (health.ownerWaveMobile || "votre Wave") + ", frais Wave déduits"
      : "Reversement automatique désactivé";
    box.appendChild(kpi("À reverser ce soir", stats.pendingPayout, payoutSub, true));
    box.appendChild(kpi("Aujourd'hui", stats.today.revenue, periodSub(stats.today)));
    box.appendChild(kpi("Hier", stats.yesterday.revenue, periodSub(stats.yesterday)));
    box.appendChild(kpi("7 jours", stats.last7.revenue, periodSub(stats.last7)));
    box.appendChild(kpi("30 jours", stats.last30.revenue, periodSub(stats.last30)));
    box.appendChild(kpi("Depuis le début", stats.allTime.revenue, stats.allTime.paid + " commande" + (stats.allTime.paid > 1 ? "s" : "") + " payée" + (stats.allTime.paid > 1 ? "s" : "")));
  }

  /** "Téléphone relié (MacroDroid)": on once the phone has sent at least one notification (MACRODROID.md). */
  function phoneItem(h) {
    var last = h.lastPhoneNotificationAt ? TCV.fmt.dateTime(h.lastPhoneNotificationAt) : "";
    return [h.phoneHook && !!last, "Téléphone relié (MacroDroid)", "Dernier signal reçu le " + last,
      h.phoneHook ? "Aucun signal reçu pour le moment" : "Pas encore relié",
      "Chaque transfert Wave reçu sur votre téléphone débloque tout seul la commande qui a ce montant exact.",
      h.phoneHook
        ? "Suivez « Relier mon téléphone » juste en dessous, puis touchez « Tester l'action » dans MacroDroid : l'heure doit s'afficher ici."
        : "Facultatif : reliez votre téléphone (guide MACRODROID.md) pour que les transferts Wave débloquent les commandes tout seuls. Il faut la clé PHONE_HOOK_KEY."];
  }

  /** Grows the link field to its content so the whole link is visible (it wraps, never scrolls sideways). */
  function fitField(field) {
    field.style.height = "0px";
    field.style.height = field.scrollHeight + (field.offsetHeight - field.clientHeight) + "px";
  }

  function resetCopy() {
    clearTimeout(copyTimer);
    setText($(".btn-label", $("#phone-copy")), "Copier le lien");
    setText($("#phone-copy-status"), "");
  }

  /** Logged out: the secret link must not stay in the page. */
  function hidePhoneCard() {
    $("#phone-card").hidden = true;
    $("#phone-url").value = "";
    resetCopy();
  }

  /**
   * « Relier mon téléphone (MacroDroid) »: the secret link (sent by GET /admin/stats only), the steps, and the
   * same state as the « Téléphone relié » line, so the owner sees « Tester l'action » arrive after « Actualiser ».
   */
  function renderPhoneCard(h) {
    if (!h.phoneHookUrl) {
      hidePhoneCard();
      return;
    }
    var item = phoneItem(h);
    var on = !!item[0];
    var state = TCV.dom.clear($("#phone-state"));
    state.className = "phone-state " + (on ? "on" : "off");
    state.appendChild(el("span", { class: "dot", "aria-hidden": "true" }));
    state.appendChild(el("span", null, [
      el("strong", { text: item[1] + "\u00a0: " }),
      on ? item[2] : item[3],
      el("span", { class: "sr-only", text: on ? " (actif)" : " (inactif)" })
    ]));
    var field = $("#phone-url");
    if (field.value !== h.phoneHookUrl) {
      field.value = h.phoneHookUrl;
      resetCopy();
    }
    $("#phone-card").hidden = false;
    fitField(field);
  }

  function selectLink(field) {
    field.focus();
    field.select();
    field.setSelectionRange(0, field.value.length);
  }

  /** navigator.clipboard first; otherwise the link is selected in its field (and copied when the browser allows it). */
  function copyPhoneLink() {
    var field = $("#phone-url");
    var label = $(".btn-label", $("#phone-copy"));
    var status = $("#phone-copy-status");
    function copied() {
      setText(label, "Lien copié ✓");
      setText(status, "Lien copié. Collez-le dans MacroDroid, à l'étape 4.");
      clearTimeout(copyTimer);
      copyTimer = setTimeout(function () { setText(label, "Copier le lien"); }, 3000);
    }
    function bySelection() {
      selectLink(field);
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e) {
        ok = false;
      }
      if (ok) copied();
      else setText(status, "Le lien est sélectionné\u00a0: appuyez longuement dessus, puis touchez «\u00a0Copier\u00a0».");
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(field.value).then(copied, bySelection);
    else bySelection();
  }

  function renderHealth(h) {
    var number = h.ownerWaveMobile || "";
    // [on, label, state when on, state when off, hint when on, hint when off]
    var items = [
      [h.wave, "Wave", "Paiement automatique actif", "Paiement automatique pas encore actif",
        "Les clients paient dans Wave et leurs documents se débloquent tout seuls.",
        "Ajoutez la clé API Wave Business (WAVE_API_KEY) dans les secrets de la fonction Supabase."],
      [h.webhook, "Webhook", "Wave prévient le site à chaque paiement", "Pas encore configuré",
        "Les paiements sont confirmés en quelques secondes.",
        "Ajoutez le secret du webhook Wave (WAVE_WEBHOOK_SECRET). Sans lui, les paiements sont quand même vérifiés toutes les 10 minutes."],
      [h.payout, "Versement", "Envoi automatique chaque soir à 20 h 30", "Désactivé",
        "Les revenus du jour partent vers " + (number || "votre numéro Wave") + ".",
        "Renseignez votre numéro Wave (OWNER_WAVE_MOBILE) et PAYOUT_ENABLED=true. Il faut aussi le paiement Wave automatique."],
      [h.manual, "Mode manuel", "Paiement par transfert Wave actif", "Désactivé",
        "Les clients envoient l'argent sur votre Wave : vérifiez la réception puis touchez « Débloquer ».",
        "Facultatif : renseignez MANUAL_WAVE_NUMBER pour accepter les transferts en attendant l'API Wave."],
      phoneItem(h),
      [h.llm, "IA", "Rédaction enrichie active", "Désactivée (facultatif)",
        "Le texte est retravaillé par l'IA avant d'être livré.",
        "Les documents sont rédigés sans IA externe. Pour l'activer, ajoutez OPENROUTER_API_KEY."],
      [!!number, "Votre numéro Wave", number, "Non renseigné",
        "Le numéro qui reçoit l'argent du soir.",
        "Renseignez votre numéro Wave personnel (OWNER_WAVE_MOBILE) pour recevoir les versements."]
    ];
    var ul = TCV.dom.clear($("#health"));
    items.forEach(function (it) {
      var on = !!it[0];
      ul.appendChild(el("li", { class: on ? "on" : "off" }, [
        el("span", { class: "dot", "aria-hidden": "true" }),
        el("div", null, [el("strong", { text: it[1] }), on ? it[2] : it[3], el("span", { class: "sr-only", text: on ? " (actif)" : " (inactif)" })]),
        el("p", { class: "hint", text: on ? it[4] : it[5] })
      ]));
    });
    $("#no-payment").hidden = !!(h.wave || h.manual);
  }

  function emptyRow(cols, text) {
    return el("tr", null, [el("td", { colspan: cols, class: "hint", text: text })]);
  }

  function unlockButton(o) {
    var btn = el("button", { type: "button", class: "btn btn-primary btn-sm", "aria-label": "Débloquer la commande " + o.id }, [el("span", { class: "btn-label", text: "Débloquer" })]);
    btn.addEventListener("click", function () { unlock(o, btn); });
    return btn;
  }

  /** Amount the customer was asked to send: the order's unique amount when it has one. */
  function exactAmount(o) {
    return o.manual_amount || o.amount;
  }

  function detectedBadge(o) {
    return o.payment_detected_at ? el("span", { class: "badge badge-detected", text: "Paiement détecté" }) : null;
  }

  /** Orders paid by manual Wave transfer that the owner must confirm: shown first, as cards. */
  function renderUnlock(list) {
    var waiting = list.filter(function (o) {
      return o.status !== "paid" && (o.status === "awaiting_manual" || !!o.payment_detected_at);
    });
    var ul = TCV.dom.clear($("#unlock-list"));
    waiting.forEach(function (o) {
      ul.appendChild(el("li", { class: "unlock-card" }, [
        el("div", null, [
          el("strong", { class: "unlock-amount", text: fcfa(exactAmount(o)) }),
          o.payment_detected_at ? " " : null,
          detectedBadge(o),
          el("div", { text: (o.manual_payer_phone ? "Envoyé par le " + TCV.fmt.snPhone(o.manual_payer_phone) : "Numéro du payeur non indiqué") }),
          el("div", { class: "hint", text: o.id + " · " + TCV.fmt.productLabel(o.product) + " · " + TCV.fmt.dateTime(o.created_at) })
        ]),
        unlockButton(o)
      ]));
    });
    $("#to-unlock").hidden = !waiting.length;
  }

  function renderOrders(list) {
    var body = TCV.dom.clear($("#orders-body"));
    if (!list.length) body.appendChild(emptyRow(7, "Aucune commande pour le moment."));
    list.forEach(function (o) {
      body.appendChild(el("tr", null, [
        el("td", null, [el("strong", { text: o.id })]),
        el("td", null, [badge(STATUS, o.status), o.payment_detected_at ? " " : null, detectedBadge(o)]),
        el("td", { text: fcfa(o.amount) }),
        el("td", { text: TCV.fmt.productLabel(o.product) }),
        el("td", { text: o.payment_method === "wave" ? "Wave" : o.payment_method === "manual" ? "Transfert Wave" : "—" }),
        el("td", { text: o.manual_payer_phone ? TCV.fmt.snPhone(o.manual_payer_phone) : "—" }),
        el("td", { text: TCV.fmt.dateTime(o.created_at) })
      ]));
    });
  }

  function renderPayouts(list) {
    var body = TCV.dom.clear($("#payouts-body"));
    if (!list.length) body.appendChild(emptyRow(5, "Aucun reversement pour le moment."));
    list.forEach(function (p) {
      body.appendChild(el("tr", null, [
        el("td", { text: p.day }),
        el("td", { text: fcfa(p.amount) }),
        el("td", { text: TCV.fmt.snPhone(p.mobile) }),
        el("td", null, [badge(PAYOUT_STATUS, p.status)]),
        el("td", { text: p.error || (p.fee != null ? "Frais Wave : " + fcfa(p.fee) : "") })
      ]));
    });
  }

  function render(res) {
    $("#login").hidden = true;
    $("#dash").hidden = false;
    setText($("#dash-error"), "");
    var stats = res.stats;
    var health = res.health || {};
    renderKpis(stats, health);
    renderHealth(health);
    renderPhoneCard(health);
    renderUnlock(stats.recentOrders || []);
    renderOrders(stats.recentOrders || []);
    renderPayouts(stats.payouts || []);
    setText($("#dash-updated"), "Mis à jour à " + TCV.fmt.dateTime(new Date().toISOString()).split(" ")[1]);
  }

  function load() {
    return TCV.api.request("GET", "/admin/stats", { adminKey: adminKey }).then(
      function (res) {
        render(res);
        scheduleRefresh();
      },
      function (err) {
        if (err.status === 401) {
          TCV.store.remove(KEY_STORE);
          adminKey = null;
          showLogin("Clé incorrecte ou expirée.");
        } else if (!$("#dash").hidden) {
          setText($("#dash-error"), err.message);
          scheduleRefresh();
        } else {
          showLogin(err.message);
        }
      }
    );
  }

  function unlock(order, btn) {
    var who = order.manual_payer_phone ? " du " + TCV.fmt.snPhone(order.manual_payer_phone) : "";
    if (!window.confirm("Avez-vous bien reçu " + fcfa(exactAmount(order)) + who + " sur votre Wave ?\n\nLa commande " + order.id + " sera débloquée pour le client.")) return;
    TCV.dom.busy(btn, true, "…");
    TCV.api
      .request("POST", "/admin/orders/" + encodeURIComponent(order.id) + "/unlock", { adminKey: adminKey, body: {} })
      .then(function (res) {
        setText($("#dash-status"), res && res.changed === false ? "La commande " + order.id + " était déjà débloquée." : "Commande " + order.id + " débloquée. Le client voit maintenant ses documents.");
        return load();
      })
      .catch(function (err) {
        TCV.dom.busy(btn, false);
        setText($("#dash-error"), err.status === 401 ? "Clé incorrecte." : err.message);
      });
  }

  function stopRefresh() {
    clearTimeout(refreshTimer);
  }

  function scheduleRefresh() {
    stopRefresh();
    refreshTimer = setTimeout(function () {
      if (document.hidden) scheduleRefresh();
      else load();
    }, REFRESH_MS);
  }

  function bind() {
    $("#login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = $("#admin-key").value.trim();
      if (!v) {
        setText($("#login-error"), "Saisissez la clé d'administration.");
        return;
      }
      adminKey = v;
      TCV.store.set(KEY_STORE, v);
      $("#admin-key").value = "";
      var btn = $("#login-btn");
      TCV.dom.busy(btn, true, "Connexion…");
      load().then(function () { TCV.dom.busy(btn, false); });
    });
    $("#refresh").addEventListener("click", function () {
      var btn = $("#refresh");
      TCV.dom.busy(btn, true, "Actualisation…");
      load().then(function () { TCV.dom.busy(btn, false); });
    });
    $("#phone-copy").addEventListener("click", copyPhoneLink);
    $("#phone-url").addEventListener("click", function () { selectLink($("#phone-url")); });
    window.addEventListener("resize", function () {
      if (!$("#phone-card").hidden) fitField($("#phone-url"));
    });
    $("#logout").addEventListener("click", function () {
      TCV.store.remove(KEY_STORE);
      adminKey = null;
      showLogin("");
    });
  }

  /** Takes a key passed as #k=… (first visit or a new link opened in the same tab), then hides it. */
  function takeKeyFromUrl() {
    var fromUrl = keyFromFragment();
    if (!fromUrl) return null;
    TCV.store.set(KEY_STORE, fromUrl);
    history.replaceState(null, "", window.location.pathname + window.location.search);
    return fromUrl;
  }

  function boot() {
    bind();
    adminKey = takeKeyFromUrl() || TCV.store.get(KEY_STORE, null);
    if (adminKey) load();
    else showLogin("");
    window.addEventListener("hashchange", function () {
      var k = takeKeyFromUrl();
      if (k) {
        adminKey = k;
        load();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
