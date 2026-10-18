// Preview screen: blurred document preview, template switcher and payment (Wave checkout or manual transfer).
(function () {
  "use strict";

  var TCV = window.TCV;
  var $ = TCV.dom.$;
  var $$ = TCV.dom.$$;
  var setText = TCV.dom.setText;

  var ctx = null; // { order, token, preview, parts, template, tab, whatsapp, exact, accent }
  var views = {}; // part key → DocView, or { frame, envoi: true } for the Pack Stage sending message
  var zoomed = false; // "Agrandir l'aperçu" state, kept when the views are rebuilt
  var paying = false;

  function orderPath(suffix) {
    return "/orders/" + encodeURIComponent(ctx.order.id) + (suffix || "");
  }

  function payButtons() {
    return $$("[data-pay]");
  }

  function setPayBusy(on, text) {
    paying = on;
    payButtons().forEach(function (b) {
      TCV.dom.busy(b, on, text);
    });
  }

  /** CV Premium: one « Prestige » document, a colour instead of a template, the photo kept on this phone. */
  function isPremium() {
    return !!(ctx && ctx.order.product === "premium" && window.TCVPremium && ctx.preview && ctx.preview.cv);
  }

  /** The parts shown: CV, lettre or Pack Stage letters and sending message; a CV Premium is one Prestige part. */
  function partsOf(order, preview) {
    if (order.product === "premium" && window.TCVPremium && preview && preview.cv) {
      return [{ key: "premium", kind: "premium", label: "CV Premium", path: "cv" }];
    }
    return TCV.docParts(preview || {});
  }

  /** One view per part (CV, lettre or Pack Stage letters, sending message), in display order. */
  function buildViews() {
    var docs = $("#pv-docs");
    TCV.dom.clear(docs);
    views = {};
    ctx.parts.forEach(function (part) {
      if (part.kind === "envoi") {
        var frame = TCV.dom.el("div", { class: "envoi-frame", "data-doc": "envoi" });
        docs.appendChild(frame);
        views[part.key] = { frame: frame, envoi: true };
      } else {
        views[part.key] = new TCV.DocView(docs, part.kind);
        if (zoomed) views[part.key].setZoom(true);
      }
    });
  }

  function showTab() {
    ctx.parts.forEach(function (part) {
      var view = views[part.key];
      view.frame.hidden = ctx.tab !== part.key;
      if (!view.frame.hidden && view.layout) view.layout();
    });
  }

  function renderDocs() {
    ctx.parts.forEach(function (part) {
      var view = views[part.key];
      var data = TCV.getPath(ctx.preview, part.path);
      if (view.envoi) {
        TCV.dom.clear(view.frame);
        view.frame.appendChild(window.TCVRender.envoi(data));
      } else if (part.kind === "premium") {
        view.show(data, ctx.accent, window.TCVPremium.photo.get(ctx.order.id));
      } else {
        view.show(data, ctx.template);
      }
    });
    showTab();
  }

  function renderSwitchers() {
    if (TCV.premiumWizard) TCV.premiumWizard.decoratePreview(isPremium());
    if (isPremium()) {
      setText($("#pv-tpl-label"), "Couleur");
      TCV.dom.segRadios($("#pv-templates"), "pv-template", window.TCVPremium.ACCENTS, ctx.accent, function (a) {
        ctx.accent = a;
        window.TCVPremium.accent.set(ctx.order.id, a); // kept on this phone, picked up by the result page
        renderDocs();
      });
      $("#pv-doc-tabs-wrap").hidden = true;
      return;
    }
    setText($("#pv-tpl-label"), "Modèle");
    TCV.dom.segRadios($("#pv-templates"), "pv-template", window.TCVRender.TEMPLATES, ctx.template, function (t) {
      ctx.template = t;
      renderDocs();
      if (TCV.wizard) TCV.wizard.setTemplate(t);
      TCV.api.request("POST", orderPath("/template"), { body: { t: ctx.token, template: t } }).catch(function () {
        /* the choice can still be changed after payment */
      });
    });
    var tabs = ctx.parts.length > 1;
    $("#pv-doc-tabs-wrap").hidden = !tabs;
    $("#pv-doc-tabs").classList.toggle("seg-tabs", ctx.parts.length > 3);
    if (tabs) {
      var options = ctx.parts.map(function (p) { return { key: p.key, label: p.label }; });
      TCV.dom.segRadios($("#pv-doc-tabs"), "pv-doc", options, ctx.tab, function (k) {
        ctx.tab = k;
        showTab();
      });
    }
  }

  function productLine(order, preview) {
    var label = TCV.fmt.productLabel(order.product);
    var n = preview && Array.isArray(preview.lettres) ? preview.lettres.length : 0;
    return order.product === "stage" && n ? label + " · " + n + (n > 1 ? " entreprises" : " entreprise") : label;
  }

  function payLabel() {
    return "Payer " + TCV.fmt.fcfa(ctx.order.amount) + " avec Wave";
  }

  /** Shows the preview of an unpaid order. opts.failed displays the "payment not completed" banner. */
  function show(order, token, preview, opts) {
    opts = opts || {};
    var parts = partsOf(order, preview);
    ctx = { order: order, token: token, preview: preview || {}, parts: parts, template: order.template || "classique", tab: parts.length ? parts[0].key : null, whatsapp: null };
    if (window.TCVPremium) {
      var pm = preview && preview.cv && preview.cv.premium;
      ctx.accent = window.TCVPremium.accent.get(order.id) || (pm && pm.accent) || "marine";
    }
    $("#pay-failed").hidden = !opts.failed;
    setText($("#pv-product"), productLine(order, preview));
    setText($("#pv-amount"), TCV.fmt.fcfa(order.amount));
    setText($("#pv-ref"), order.id);
    $$("[data-pay-label]").forEach(function (n) {
      setText(n, payLabel());
    });
    $("#manual-panel").hidden = true;
    $("#pay-btn").hidden = false;
    $("#paybar").hidden = false;
    $("#pay-return").hidden = true;
    $("#pay-return-link").href = TCV.url.resultUrl(order.id, token);
    setText($("#pay-status"), "");
    setText($("#pay-error"), "");
    setPayBusy(false);
    buildViews();
    renderSwitchers();
    renderDocs();
  }

  function isSafeLaunchUrl(url) {
    return /^https:\/\//i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url);
  }

  function pay() {
    if (paying || !ctx) return;
    setText($("#pay-error"), "");
    setPayBusy(true, "Connexion à Wave…");
    TCV.api
      .request("POST", orderPath("/checkout"), { body: { t: ctx.token, returnBase: TCV.url.returnBase() }, timeout: 30000 })
      .then(function (res) {
        if (res && res.mode === "wave" && isSafeLaunchUrl(res.launchUrl || "")) {
          setText($("#pay-status"), "Ouverture de Wave…");
          window.location.href = res.launchUrl;
          watchReturn();
          return;
        }
        setPayBusy(false);
        if (res && res.mode === "manual") showManual(res);
        else setText($("#pay-error"), "Le paiement en ligne arrive très bientôt.");
      })
      .catch(function (err) {
        if (err.code === "already_paid") {
          window.location.href = TCV.url.resultUrl(ctx.order.id, ctx.token);
          return;
        }
        setPayBusy(false);
        setText($("#pay-error"), err.message);
      });
  }

  /**
   * On Android the Wave app can take over the payment link while this tab stays open, and the Back button can
   * restore this page from the browser cache: either way the customer would come back to a stuck "Connexion
   * à Wave…" button. When the page is shown again (or after 10 s) payment is re-enabled, a link to the
   * documents is offered, and a payment that already went through opens the documents.
   */
  function watchReturn() {
    var done = false;
    var timer = setTimeout(back, 10000);
    function onShow() {
      if (!document.hidden) back();
    }
    function back() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", onShow);
      setPayBusy(false);
      setText($("#pay-status"), "");
      $("#pay-return").hidden = false;
      TCV.api.request("GET", orderPath("?t=" + encodeURIComponent(ctx.token))).then(function (res) {
        if (res.order.status === "paid") window.location.href = TCV.url.resultUrl(ctx.order.id, ctx.token);
      }, function () {
        /* the "Afficher mes documents" link still works */
      });
    }
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
  }

  function showManual(res) {
    ctx.whatsapp = res.whatsapp || null;
    // The exact amount is unique to this order: it is how the transfer is recognised automatically.
    ctx.exact = res.exactAmount || res.amount || ctx.order.amount;
    setText($("#m-amount"), TCV.fmt.fcfa(ctx.exact));
    setText($("#m-amount-raw"), String(ctx.exact));
    setText($("#m-number"), res.waveNumber || "");
    setText($("#m-ref"), res.reference || ctx.order.id);
    setText($("#manual-after"), res.autoUnlock
      ? "Vos documents se débloquent tout seuls dès que votre transfert arrive, en général en moins d'une minute."
      : "Vos documents se débloquent dès que le vendeur a vérifié la réception. Pour aller plus vite, prévenez-le sur WhatsApp.");
    $("#manual-whatsapp").hidden = !ctx.whatsapp;
    $("#manual-panel").hidden = false;
    // The transfer instructions replace the pay buttons: "J'ai payé" is the only next step.
    $("#pay-btn").hidden = true;
    $("#paybar").hidden = true;
    var payer = $("#payer-phone");
    var typed = TCV.wizard ? TCV.wizard.phone() : "";
    if (!payer.value && TCV.validate.normalizeSnMobile(typed)) payer.value = typed;
    var title = $("#manual-title");
    title.scrollIntoView({ block: "start", behavior: "smooth" });
    title.focus({ preventScroll: true });
  }

  /** The payer's number is optional; when typed it must be a valid Senegal mobile. Returns null if invalid. */
  function payerPhone() {
    var input = $("#payer-phone");
    var err = $("#payer-phone-error");
    var phone = TCV.validate.line(input.value);
    if (phone && !TCV.validate.normalizeSnMobile(phone)) {
      setText(err, "Numéro Wave invalide. Exemple : 77 123 45 67. Vous pouvez aussi laisser ce champ vide.");
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return null;
    }
    setText(err, "");
    input.removeAttribute("aria-invalid");
    return phone;
  }

  /** Optional: tells the owner on WhatsApp (the transfer is recognised without it). */
  function notifySeller() {
    var phone = payerPhone();
    if (phone === null || !ctx.whatsapp) return;
    var msg = "Bonjour, je viens d'envoyer " + TCV.fmt.fcfa(ctx.exact || ctx.order.amount) + " par Wave pour ma commande Teranga CV " +
      ctx.order.id + "." + (phone ? " Numéro Wave utilisé : " + phone + "." : "");
    window.open(TCV.whatsappLink(ctx.whatsapp, msg), "_blank", "noopener");
  }

  function manualPaid() {
    var err = $("#payer-phone-error");
    var phone = payerPhone();
    if (phone === null) return;
    var btn = $("#manual-paid-btn");
    TCV.dom.busy(btn, true, "Envoi…");
    TCV.api
      .request("POST", orderPath("/manual-paid"), { body: { t: ctx.token, payerPhone: phone } })
      .then(function () {
        window.location.href = TCV.url.resultUrl(ctx.order.id, ctx.token);
      })
      .catch(function (e) {
        TCV.dom.busy(btn, false);
        if (e.code === "already_paid") {
          window.location.href = TCV.url.resultUrl(ctx.order.id, ctx.token);
          return;
        }
        var fieldMsg = e.fields && (e.fields.payerPhone || e.fields.phone);
        setText(fieldMsg ? err : $("#pay-error"), fieldMsg || e.message);
      });
  }

  function bindCopy() {
    $$("[data-copy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var source = document.getElementById(btn.getAttribute("data-copy"));
        TCV.copyText(source ? source.textContent.trim() : "").then(
          function () {
            setText(btn, "Copié");
            setTimeout(function () { setText(btn, "Copier"); }, 2000);
          },
          function () {
            setText(btn, "Copie impossible");
          }
        );
      });
    });
  }

  /** Hides the sticky mobile pay bar while the main pay button is on screen. */
  function watchPaybar() {
    if (typeof IntersectionObserver !== "function") return;
    var bar = $("#paybar");
    new IntersectionObserver(function (entries) {
      bar.style.visibility = entries[0].isIntersecting ? "hidden" : "";
    }).observe($("#pay-btn"));
  }

  /** On a phone the A4 preview is shrunk to the screen width; "Agrandir" shows it at real size (scrolls sideways). */
  function bindZoom() {
    var btn = $("#pv-zoom");
    btn.addEventListener("click", function () {
      var on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      setText(btn, on ? "Réduire l'aperçu" : "Agrandir l'aperçu");
      zoomed = on;
      Object.keys(views).forEach(function (k) {
        if (views[k].setZoom) views[k].setZoom(on);
      });
    });
  }

  function init() {
    $("#pv-docs").classList.add("doc-stack");
    bindZoom();
    payButtons().forEach(function (b) {
      b.addEventListener("click", pay);
    });
    $("#manual-paid-btn").addEventListener("click", manualPaid);
    $("#manual-whatsapp").addEventListener("click", notifySeller);
    bindCopy();
    watchPaybar();
  }

  function focus() {
    var h = $("#pv-title");
    window.scrollTo(0, 0);
    if (h) h.focus({ preventScroll: true });
  }

  function relayout() {
    Object.keys(views).forEach(function (k) {
      if (views[k].layout) views[k].layout();
    });
  }

  TCV.checkout = { init: init, show: show, focus: focus, relayout: relayout, hasOrder: function () { return !!ctx; } };
})();
