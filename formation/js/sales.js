// Teranga Pro — index.html: price from GET /config, open/closed switch, buy form → POST /orders → checkout
// (pay.js), « Le paiement n'a pas abouti » banner (?o=&t=&paiement=echec), « Mes formations » on this phone.
(function () {
  "use strict";

  var TPRO = window.TPRO;
  var $ = TPRO.dom.$;
  var $$ = TPRO.dom.$$;
  var el = TPRO.dom.el;
  var setText = TPRO.dom.setText;
  var V = TPRO.validate;

  var price = 25000;
  var pending = null; // order created but not yet at the payment step: { id, token, amount, key }

  function applyPrice(p) {
    price = p;
    $$("[data-course-price]").forEach(function (n) {
      n.textContent = TPRO.fmt.fcfa(p);
    });
  }

  function setOpen(open) {
    $$('[data-when="open"]').forEach(function (n) {
      n.hidden = !open;
    });
    $$('[data-when="closed"]').forEach(function (n) {
      n.hidden = open;
    });
    document.documentElement.setAttribute("data-sales", open ? "open" : "closed");
  }

  /* ---------- « Mes formations » ---------- */

  function renderMyCourses() {
    var list = TPRO.courses.list();
    var box = $("#my-courses");
    var link = $("#my-courses-link");
    if (!box) return;
    if (!list.length) {
      box.hidden = true;
      if (link) link.hidden = true;
      return;
    }
    var ul = $("#my-courses-list");
    TPRO.dom.clear(ul);
    list.forEach(function (c) {
      ul.appendChild(
        el("li", null, [
          el("a", { class: "btn btn-light", href: TPRO.url.readerUrl(c.id, c.token) }, [el("span", { class: "btn-label", text: "Reprendre ma formation" })]),
          el("span", { class: "my-course-ref" }, ["Commande ", el("strong", { text: c.id }), c.createdAt ? " · " + TPRO.fmt.date(c.createdAt) : ""])
        ])
      );
    });
    box.hidden = false;
    if (link) link.hidden = false;
  }

  /* ---------- Buy form ---------- */

  var FIELD_FOR = { "buyer.fullName": "fullName", "buyer.email": "email", "buyer.phone": "phone", acceptCgv: "acceptCgv" };

  function input(name) {
    return $("#buy-" + name);
  }

  function clearErrors() {
    ["fullName", "email", "phone", "acceptCgv"].forEach(function (n) {
      TPRO.dom.fieldError(input(n), "");
    });
    setText($("#buy-error"), "");
  }

  /** Mirrors validateCourseOrder (§4). Returns { buyer } or null after showing the errors. */
  function readForm() {
    var fullName = V.clean(input("fullName").value);
    var email = V.clean(input("email").value);
    var phone = V.clean(input("phone").value);
    var first = null;
    function bad(name, msg) {
      TPRO.dom.fieldError(input(name), msg);
      first = first || input(name);
    }
    if (!fullName) bad("fullName", "Indiquez votre prénom et votre nom : ils figurent sur vos fichiers et votre attestation.");
    else if (!V.nameOk(fullName)) bad("fullName", "Lettres, espaces, apostrophes et tirets uniquement (80 caractères au plus).");
    if (email && !V.emailOk(email)) bad("email", "Adresse e-mail invalide.");
    if (phone && !V.intlPhone(phone)) bad("phone", "Numéro invalide (8 à 15 chiffres, indicatif du pays accepté).");
    if (!input("acceptCgv").checked) bad("acceptCgv", "Cochez la case pour accepter les conditions générales de vente.");
    if (first) {
      first.focus();
      return null;
    }
    var buyer = { fullName: fullName };
    if (email) buyer.email = email;
    if (phone) buyer.phone = phone;
    return buyer;
  }

  function payCtx(order, button, errorBox) {
    return {
      id: order.id,
      token: order.token,
      amount: order.amount || price,
      container: $("#checkout"),
      button: button,
      errorBox: errorBox,
      statusBox: $("#buy-status"),
      returnBox: $("#pay-return"),
      onManual: function () {
        $("#buy-form").hidden = true;
        $("#buy-intro").hidden = true;
        var failed = $("#pay-failed");
        if (failed) failed.hidden = true;
      },
      onClosed: closedByServer
    };
  }

  function closedByServer(err) {
    setOpen(false);
    var note = $("#closed-note");
    setText(note, err.message);
    note.hidden = false;
  }

  function prepareReturn(order) {
    var link = $("#pay-return-link");
    if (link) link.href = TPRO.url.readerUrl(order.id, order.token);
  }

  function onSubmit(e) {
    e.preventDefault();
    clearErrors();
    var buyer = readForm();
    if (!buyer) return;
    var button = $("#buy-submit");
    var key = JSON.stringify(buyer);
    if (pending && pending.key === key) {
      TPRO.pay.checkout(payCtx(pending, button, $("#buy-error")));
      return;
    }
    var body = { product: TPRO.PRODUCT, buyer: buyer, acceptCgv: true, website: input("website").value };
    TPRO.dom.busy(button, true, "Création de votre commande…");
    TPRO.api
      .request("POST", "/orders", { body: body, timeout: 30000 })
      .then(function (res) {
        var o = res.order;
        TPRO.courses.save({ id: o.id, token: o.token, product: o.product, createdAt: o.createdAt });
        pending = { id: o.id, token: o.token, amount: o.amount, key: key };
        prepareReturn(o);
        renderMyCourses();
        TPRO.dom.busy(button, false);
        return TPRO.pay.checkout(payCtx(pending, button, $("#buy-error")));
      })
      .catch(function (err) {
        TPRO.dom.busy(button, false);
        if (err.code === "sales_closed") {
          closedByServer(err);
          return;
        }
        var shown = false;
        var fields = err.fields || {};
        Object.keys(fields).forEach(function (k) {
          var name = FIELD_FOR[k];
          if (name) {
            TPRO.dom.fieldError(input(name), fields[k]);
            if (!shown) input(name).focus();
            shown = true;
          }
        });
        if (!shown) setText($("#buy-error"), err.message);
      });
  }

  /* ---------- ?o=&t=&paiement=echec ---------- */

  function failedPayment() {
    var id = TPRO.url.param("o");
    var token = TPRO.url.param("t");
    if (!id || !token || TPRO.url.param("paiement") !== "echec") return;
    var banner = $("#pay-failed");
    banner.hidden = false;
    var order = { id: id, token: token, amount: price };
    prepareReturn(order);
    TPRO.courses.save({ id: id, token: token, product: TPRO.PRODUCT });
    renderMyCourses();
    $("#pay-retry").addEventListener("click", function () {
      TPRO.pay.checkout(payCtx(order, $("#pay-retry"), $("#pay-failed-error")));
    });
  }

  function init() {
    applyPrice(price);
    renderMyCourses();
    failedPayment();
    var form = $("#buy-form");
    if (form) form.addEventListener("submit", onSubmit);
    TPRO.loadConfig().then(function (cfg) {
      applyPrice(cfg.price);
      setOpen(cfg.open);
    });
  }

  init();
})();
