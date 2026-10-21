// Teranga Pro — recu.html?o=&t= : printable A4 payment receipt from GET /orders/:id (receipt present once paid).
(function () {
  "use strict";

  var TPRO = window.TPRO;
  var $ = TPRO.dom.$;
  var el = TPRO.dom.el;
  var clear = TPRO.dom.clear;
  var setText = TPRO.dom.setText;
  var fmt = TPRO.fmt;

  function state(title, lines) {
    var box = clear($("#rc-state"));
    box.hidden = false;
    $("#rc-sheet").hidden = true;
    $("#rc-tools").hidden = true;
    var h = el("h1", { tabindex: "-1", text: title });
    box.appendChild(h);
    (lines || []).forEach(function (l) {
      if (l) box.appendChild(typeof l === "string" ? el("p", { text: l }) : l);
    });
    h.focus({ preventScroll: true });
  }

  function render(res, id, token) {
    var r = res.receipt;
    $("#rc-state").hidden = true;
    $("#rc-tools").hidden = false;
    $("#rc-back").href = TPRO.url.readerUrl(id, token);
    setText($("#rc-number"), "N° " + r.number);
    setText($("#rc-date"), fmt.dateTime(r.paidAt) + " (heure de Dakar)");
    setText($("#rc-buyer"), r.buyerName || (res.buyer && res.buyer.fullName) || "");
    setText($("#rc-label"), r.label);
    setText($("#rc-line-amount"), fmt.fcfa(r.amount));
    setText($("#rc-paid"), "Montant payé : " + fmt.fcfa(r.amount));
    setText($("#rc-method"), "Moyen de paiement : Wave");
    setText($("#rc-seller"), r.seller);
    $("#rc-sheet").hidden = false;
    document.title = "Reçu de paiement " + r.number + " — Teranga Pro";
  }

  function init() {
    var id = TPRO.url.param("o");
    var token = TPRO.url.param("t");
    var printBtn = $("#rc-print");
    if (printBtn) printBtn.addEventListener("click", function () { window.print(); });
    if (!id || !token) {
      state("Reçu de paiement", ["Ouvrez le reçu depuis votre espace de lecture (lien « Reçu de paiement »)."]);
      return;
    }
    state("Chargement du reçu…", []);
    TPRO.api.request("GET", TPRO.api.orderPath(id, "?t=" + encodeURIComponent(token))).then(
      function (res) {
        if (res && res.order && res.order.status === "paid" && res.receipt) render(res, id, token);
        else
          state("Reçu pas encore disponible", [
            "Le reçu sera disponible après le paiement.",
            el("p", null, [el("a", { class: "btn btn-primary", href: TPRO.url.readerUrl(id, token) }, [el("span", { class: "btn-label", text: "Revenir à ma commande" })])])
          ]);
      },
      function (err) {
        state(err.status === 404 ? "Lien introuvable" : err.status === 410 ? "Accès expiré" : "Connexion impossible", [
          err.status === 404 ? "Ce lien ne correspond à aucune commande. Vérifiez qu'il est complet." : err.message
        ]);
      }
    );
  }

  init();
})();
