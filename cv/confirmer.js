// confirmer.html?o=ORDER_ID&c=CODE — the owner's confirmation link for a manual Wave transfer.
// Opening the link changes nothing (WhatsApp and browsers preview links with GET requests): only the button
// sends POST /payments/confirm.
(function () {
  "use strict";

  var TCV = window.TCV;
  var $ = TCV.dom.$;
  var setText = TCV.dom.setText;

  var id = TCV.url.param("o");
  var code = TCV.url.param("c");

  function done(text) {
    setText($("#cf-status"), text);
    $("#cf-btn").hidden = true;
    $("#cf-hint").hidden = true;
  }

  function confirm() {
    var btn = $("#cf-btn");
    setText($("#cf-error"), "");
    TCV.dom.busy(btn, true, "Confirmation…");
    TCV.api.request("POST", "/payments/confirm", { body: { o: id, c: code } }).then(
      function (res) {
        done(res && res.changed === false
          ? "Cette commande était déjà débloquée. Rien d'autre à faire."
          : "C'est fait : la commande " + id + " est débloquée. Le client voit maintenant ses documents.");
      },
      function (err) {
        TCV.dom.busy(btn, false);
        setText($("#cf-error"), err.status === 401
          ? "Ce lien de confirmation n'est pas valide. Utilisez la page admin pour débloquer la commande."
          : err.message);
      }
    );
  }

  function boot() {
    if (!id || !code) {
      setText($("#cf-ref"), "—");
      setText($("#cf-error"), "Lien incomplet. Utilisez la page admin pour débloquer la commande.");
      $("#cf-btn").hidden = true;
      return;
    }
    setText($("#cf-ref"), id);
    $("#cf-btn").addEventListener("click", confirm);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
