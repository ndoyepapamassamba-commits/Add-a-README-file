// Preview screen: blurred document preview, template switcher and payment (Wave checkout or manual transfer).
(function () {
  "use strict";

  var TCV = window.TCV;
  var $ = TCV.dom.$;
  var $$ = TCV.dom.$$;
  var setText = TCV.dom.setText;

  var ctx = null; // { order, token, preview, parts, template, tab, whatsapp }
  var views = {}; // part key → DocView, or { frame, envoi: true } for the Pack Stage sending message
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
      } else {
        view.show(data, ctx.template);
      }
    });
    showTab();
  }

  function renderSwitchers() {
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
    var parts = TCV.docParts(preview || {});
    ctx = { order: order, token: token, preview: preview || {}, parts: parts, template: order.template || "classique", tab: parts.length ? parts[0].key : null, whatsapp: null };
    $("#pay-failed").hidden = !opts.failed;
    setText($("#pv-product"), productLine(order, preview));
    setText($("#pv-amount"), TCV.fmt.fcfa(order.amount));
    setText($("#pv-ref"), order.id);
    $$("[data-pay-label]").forEach(function (n) {
      setText(n, payLabel());
    });
    $("#manual-panel").hidden = true;
    $("#paybar").hidden = false;
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

  function showManual(res) {
    ctx.whatsapp = res.whatsapp || null;
    setText($("#m-amount"), TCV.fmt.fcfa(res.amount || ctx.order.amount));
    setText($("#m-number"), res.waveNumber || "");
    setText($("#m-ref"), res.reference || ctx.order.id);
    $("#manual-panel").hidden = false;
    $("#paybar").hidden = true;
    var title = $("#manual-title");
    title.scrollIntoView({ block: "start", behavior: "smooth" });
    title.focus({ preventScroll: true });
  }

  function manualPaid() {
    var input = $("#payer-phone");
    var err = $("#payer-phone-error");
    var phone = TCV.validate.line(input.value);
    if (!TCV.validate.normalizeSnMobile(phone)) {
      setText(err, "Numéro Wave invalide. Exemple : 77 123 45 67.");
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    setText(err, "");
    input.removeAttribute("aria-invalid");
    var btn = $("#manual-paid-btn");
    TCV.dom.busy(btn, true, "Envoi…");
    TCV.api
      .request("POST", orderPath("/manual-paid"), { body: { t: ctx.token, payerPhone: phone } })
      .then(function () {
        if (ctx.whatsapp) {
          var msg = "Bonjour, je viens d'envoyer " + TCV.fmt.fcfa(ctx.order.amount) + " par Wave pour ma commande Teranga CV " +
            ctx.order.id + ". Numéro Wave utilisé : " + phone + ".";
          window.open(TCV.whatsappLink(ctx.whatsapp, msg), "_blank", "noopener");
        }
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

  function init() {
    $("#pv-docs").classList.add("doc-stack");
    payButtons().forEach(function (b) {
      b.addEventListener("click", pay);
    });
    $("#manual-paid-btn").addEventListener("click", manualPaid);
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
