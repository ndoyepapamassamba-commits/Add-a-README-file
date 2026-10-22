// Teranga Pro — demo.html: « Commencer la démo » turns the demo mode on for this tab (sessionStorage tpro:demo=1,
// read by js/demo-shim.js on every formation page) and opens the sales page at its order form.
(function () {
  "use strict";

  var btn = document.getElementById("demo-start");
  var status = document.getElementById("demo-status");
  if (!btn) return;
  btn.addEventListener("click", function () {
    try {
      window.sessionStorage.setItem("tpro:demo", "1");
      window.sessionStorage.removeItem("tpro:demo:state");
    } catch (e) {
      if (status) status.textContent = "La démonstration a besoin du stockage du navigateur. Quittez la navigation privée puis réessayez.";
      return;
    }
    // Straight to the order form: the sales page is long on a phone.
    window.location.href = "index.html#tarif";
  });
})();
