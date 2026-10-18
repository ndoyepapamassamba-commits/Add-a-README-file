// index.html controller: hash router (landing / wizard / preview), landing sample, "Mes documents",
// order creation and resuming an order from ?o=ID&t=TOKEN (e.g. after a failed Wave payment).
(function () {
  "use strict";

  var TCV = window.TCV;
  var $ = TCV.dom.$;
  var $$ = TCV.dom.$$;
  var el = TCV.dom.el;

  var hasOrder = false;

  function showView(name) {
    $$("[data-view]").forEach(function (v) {
      v.hidden = v.getAttribute("data-view") !== name;
    });
  }

  function route() {
    var h = window.location.hash.replace(/^#/, "");
    if (h === "creer" || h.indexOf("creer/") === 0) {
      showView("wizard");
      TCV.wizard.show(h.split("/")[1] || TCV.wizard.current() || TCV.wizard.steps()[0]);
      return;
    }
    if (h === "apercu" && hasOrder) {
      showView("preview");
      TCV.checkout.relayout();
      TCV.checkout.focus();
      return;
    }
    showView("landing");
    var target = h && document.getElementById(h);
    if (target && target.scrollIntoView) target.scrollIntoView();
  }

  /** Wizard navigation: a step key, or null for the landing page. Each step gets a history entry. */
  function navigate(step) {
    var hash = step ? "#creer/" + step : "";
    if (window.location.hash === hash) route();
    else if (hash) window.location.hash = hash;
    else {
      history.pushState(null, "", window.location.pathname + window.location.search);
      route();
      window.scrollTo(0, 0);
    }
  }

  /**
   * Shows the preview under ?o=ID&t=TOKEN#apercu (a reload or a shared link reopens the same order).
   * opts.push adds a history entry so that Back returns to the last form step; opts.failed shows the retry banner.
   */
  function openPreview(order, token, preview, opts) {
    hasOrder = true;
    TCV.checkout.show(order, token, preview, { failed: opts.failed });
    var url = window.location.pathname + "?o=" + encodeURIComponent(order.id) + "&t=" + encodeURIComponent(token) + "#apercu";
    if (opts.push) history.pushState(null, "", url);
    else history.replaceState(null, "", url);
    route();
  }

  function createOrder(body) {
    return TCV.api.request("POST", "/orders", { body: body, timeout: 45000 }).then(function (res) {
      var order = res.order;
      TCV.orders.save({ id: order.id, token: order.token, product: order.product, createdAt: order.createdAt });
      renderMyDocs();
      openPreview(order, order.token, res.preview, { push: true });
    });
  }

  function resumeOrder(id, token, failed) {
    var banner = $("#resume-error");
    TCV.api.request("GET", "/orders/" + encodeURIComponent(id) + "?t=" + encodeURIComponent(token)).then(
      function (res) {
        var order = res.order;
        TCV.orders.save({ id: order.id, token: token, product: order.product, createdAt: order.createdAt });
        renderMyDocs();
        if (order.status === "paid" || order.status === "awaiting_manual") {
          window.location.replace(TCV.url.resultUrl(order.id, token));
          return;
        }
        openPreview(order, token, res.preview, { failed: failed });
      },
      function (err) {
        history.replaceState(null, "", window.location.pathname);
        route();
        if (!banner) return;
        TCV.dom.setText($("p", banner), err.status === 410
          ? "Cette commande a été supprimée : les données sont effacées automatiquement après 30 jours (3 jours sans paiement). Vous pouvez en créer une nouvelle."
          : err.status === 404 ? "Cette commande est introuvable. Vérifiez le lien ou créez un nouveau document." : err.message);
        banner.hidden = false;
      }
    );
  }

  function renderSample() {
    var sample = window.TCV_SAMPLE;
    if (!sample) return;
    new TCV.DocView($("#hero-sample"), "cv").show(sample.cv, "classique");
    var view = new TCV.DocView($("#sample-doc"), "cv");
    view.show(sample.cv, "moderne");
    TCV.dom.segRadios($("#sample-templates"), "sample-template", window.TCVRender.TEMPLATES, "moderne", function (t) {
      view.show(sample.cv, t);
    });
  }

  function renderMyDocs() {
    var list = TCV.orders.list();
    var section = $("#mes-documents");
    var ul = $("#mydocs-list");
    TCV.dom.clear(ul);
    list.forEach(function (o) {
      var meta = TCV.fmt.productLabel(o.product) + (o.createdAt ? " · " + TCV.fmt.dateTime(o.createdAt) : "");
      ul.appendChild(el("li", null, [
        el("div", null, [el("strong", { text: o.id }), el("div", { class: "meta", text: meta })]),
        el("a", { class: "btn btn-secondary btn-sm", href: TCV.url.resultUrl(o.id, o.token), text: "Ouvrir" })
      ]));
    });
    section.hidden = !list.length;
    $("#mydocs-link").hidden = !list.length;
  }

  function bindStarts() {
    $$("[data-start]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        TCV.wizard.start(a.getAttribute("data-start"));
      });
    });
  }

  function addResumeBanner() {
    var banner = el("div", { class: "banner banner-error", id: "resume-error", role: "alert", hidden: true }, [el("p")]);
    $("#view-landing .wrap").insertBefore(banner, $("#view-landing .wrap").firstChild);
  }

  function boot() {
    addResumeBanner();
    TCV.wizard.init({ navigate: navigate, onSubmit: createOrder });
    TCV.checkout.init();
    renderSample();
    renderMyDocs();
    bindStarts();
    window.addEventListener("hashchange", route);
    window.addEventListener("popstate", route);
    TCV.loadConfig().then(function (cfg) {
      TCV.applyPrices(document, cfg.prices);
      TCV.applyContact(document, cfg.payment);
    });
    var id = TCV.url.param("o");
    var token = TCV.url.param("t");
    // A reload while editing (#creer/…) stays in the wizard even though the URL still names the order.
    var editing = /^#creer/.test(window.location.hash);
    if (id && token && !editing) resumeOrder(id, token, TCV.url.param("paiement") === "echec");
    else route();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
