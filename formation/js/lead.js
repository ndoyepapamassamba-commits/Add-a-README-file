// Teranga Pro — « Prévenez-moi de l'ouverture » forms (index.html closed state, gratuit.html always).
// POST /leads { email?, whatsapp?, consent: true, source, website }. Only { at, source } is kept on the phone
// (tpro:lead), never the contact itself.
(function () {
  "use strict";

  var TPRO = window.TPRO;
  var $ = TPRO.dom.$;
  var $$ = TPRO.dom.$$;
  var setText = TPRO.dom.setText;
  var V = TPRO.validate;
  var LEAD_KEY = "tpro:lead";

  function bind(form) {
    var box = form.closest("[data-lead]") || form.parentNode;
    var done = $("[data-lead-done]", box);
    var again = $("[data-lead-again]", box);
    var source = /^[a-z0-9-]{1,40}$/.test(form.getAttribute("data-source") || "") ? form.getAttribute("data-source") : "autre";
    var status = $(".form-status", form);
    var button = $("button[type=submit]", form);
    var inputs = {
      email: form.elements.namedItem("email"),
      whatsapp: form.elements.namedItem("whatsapp"),
      consent: form.elements.namedItem("consent"),
      website: form.elements.namedItem("website")
    };

    function error(key, message) {
      setText($('[data-error="' + key + '"]', form), message || "");
      var input = inputs[key];
      if (input) {
        if (message) input.setAttribute("aria-invalid", "true");
        else input.removeAttribute("aria-invalid");
      }
    }

    function clearErrors() {
      ["email", "whatsapp", "contact", "consent"].forEach(function (k) {
        error(k, "");
      });
      setText(status, "");
    }

    function showDone(focus) {
      form.hidden = true;
      if (done) {
        done.hidden = false;
        if (focus) {
          var msg = $("[data-lead-done-title]", done) || done;
          msg.setAttribute("tabindex", "-1");
          msg.focus();
        }
      }
    }

    if (TPRO.store.get(LEAD_KEY, null)) showDone(false);

    if (again) {
      again.addEventListener("click", function () {
        form.hidden = false;
        if (done) done.hidden = true;
        form.reset();
        clearErrors();
        if (inputs.email) inputs.email.focus();
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearErrors();
      var email = V.clean(inputs.email && inputs.email.value);
      var whatsappRaw = V.clean(inputs.whatsapp && inputs.whatsapp.value);
      var whatsapp = whatsappRaw ? V.intlPhone(whatsappRaw) : null;
      var first = null;
      if (email && !V.emailOk(email)) {
        error("email", "Adresse e-mail invalide.");
        first = first || inputs.email;
      }
      if (whatsappRaw && !whatsapp) {
        error("whatsapp", "Numéro WhatsApp invalide (8 à 15 chiffres, indicatif du pays accepté).");
        first = first || inputs.whatsapp;
      }
      if (!email && !whatsappRaw) {
        error("contact", "Indiquez un e-mail ou un numéro WhatsApp.");
        first = first || inputs.email;
      }
      if (!inputs.consent || !inputs.consent.checked) {
        error("consent", "Cochez la case pour accepter d'être prévenu(e).");
        first = first || inputs.consent;
      }
      if (first) {
        first.focus();
        return;
      }
      var body = { consent: true, source: source, website: inputs.website ? inputs.website.value : "" };
      if (email) body.email = email;
      if (whatsapp) body.whatsapp = whatsapp;
      TPRO.dom.busy(button, true, "Envoi…");
      TPRO.api
        .request("POST", "/leads", { body: body })
        .then(function () {
          TPRO.dom.busy(button, false);
          TPRO.store.set(LEAD_KEY, { at: new Date().toISOString(), source: source });
          showDone(true);
        })
        .catch(function (err) {
          TPRO.dom.busy(button, false);
          var f = err.fields || {};
          var shown = false;
          ["email", "whatsapp", "contact", "consent"].forEach(function (k) {
            if (f[k]) {
              error(k, f[k]);
              shown = true;
            }
          });
          if (!shown) setText(status, err.message);
        });
    });
  }

  function init() {
    $$("form[data-lead-form]").forEach(bind);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
