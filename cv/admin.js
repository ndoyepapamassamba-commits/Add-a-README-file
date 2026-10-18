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

  var STATUS = {
    preview: ["Aperçu", ""],
    checkout: ["Paiement Wave en cours", "badge-wait"],
    awaiting_manual: ["À vérifier", "badge-wait"],
    paid: ["Payée", "badge-paid"]
  };
  var PAYOUT_STATUS = {
    pending: ["En attente", "badge-wait"],
    processing: ["En cours", "badge-wait"],
    succeeded: ["Versé", "badge-paid"],
    failed: ["Échec", "badge-fail"],
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
    box.appendChild(kpi("Total", stats.allTime.revenue, stats.allTime.paid + " commande" + (stats.allTime.paid > 1 ? "s" : "") + " payée" + (stats.allTime.paid > 1 ? "s" : "")));
  }

  function renderHealth(h) {
    var items = [
      [h.wave, "Paiement Wave automatique actif", "Paiement Wave automatique inactif",
        "Les clients paient dans Wave et leurs documents se débloquent tout seuls.",
        "Ajoutez la clé API Wave Business (WAVE_API_KEY) dans les secrets de la fonction Supabase."],
      [h.webhook, "Notifications Wave reçues (webhook)", "Notifications Wave non configurées",
        "Wave prévient le site à chaque paiement.",
        "Ajoutez le secret du webhook Wave (WAVE_WEBHOOK_SECRET). Sans lui, les paiements sont quand même vérifiés toutes les 10 minutes."],
      [h.payout, "Reversement automatique chaque soir", "Reversement automatique désactivé",
        "Les revenus du jour partent vers 20 h 30 sur " + (h.ownerWaveMobile || "votre numéro Wave") + ".",
        "Renseignez votre numéro Wave (OWNER_WAVE_MOBILE) et PAYOUT_ENABLED=true. Il faut aussi le paiement Wave automatique."],
      [h.manual, "Paiement par transfert Wave actif", "Paiement par transfert désactivé",
        "Les clients envoient l'argent sur votre Wave : vérifiez la réception puis touchez « Débloquer ».",
        "Facultatif : renseignez MANUAL_WAVE_NUMBER pour accepter les transferts en attendant l'API Wave."],
      [h.llm, "Rédaction enrichie par IA active", "Rédaction enrichie par IA désactivée",
        "Le texte est retravaillé par l'IA avant d'être livré.",
        "Facultatif : les documents sont rédigés sans IA externe. Pour l'activer, ajoutez OPENROUTER_API_KEY."]
    ];
    var ul = TCV.dom.clear($("#health"));
    items.forEach(function (it) {
      var on = !!it[0];
      ul.appendChild(el("li", { class: on ? "on" : "off" }, [
        el("span", { class: "dot", "aria-hidden": "true" }),
        el("div", null, [el("strong", { text: on ? it[1] : it[2] }), el("span", { class: "sr-only", text: on ? " (actif)" : " (inactif)" })]),
        el("p", { class: "hint", text: on ? it[3] : it[4] })
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

  /** Orders paid by manual Wave transfer that the owner must confirm: shown first, as cards. */
  function renderUnlock(list) {
    var waiting = list.filter(function (o) { return o.status === "awaiting_manual"; });
    var ul = TCV.dom.clear($("#unlock-list"));
    waiting.forEach(function (o) {
      ul.appendChild(el("li", { class: "unlock-card" }, [
        el("div", null, [
          el("strong", { class: "unlock-amount", text: fcfa(o.amount) }),
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
        el("td", null, [badge(STATUS, o.status)]),
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
    if (!window.confirm("Avez-vous bien reçu " + fcfa(order.amount) + who + " sur votre Wave ?\n\nLa commande " + order.id + " sera débloquée pour le client.")) return;
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
