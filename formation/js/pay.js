// Teranga Pro — payment step shared by index.html (after the order) and lecture.html (« Paiement en attente »).
// Adapted copy of cv/checkout.js (pay / showManual / manualPaid / bindCopy / watchReturn): POST /orders/:id/checkout,
// Wave redirect, or the manual Wave panel with the exact unique amount, then « J'ai envoyé l'argent ».
(function () {
  "use strict";

  var TPRO = window.TPRO;
  var el = TPRO.dom.el;
  var setText = TPRO.dom.setText;
  var fmt = TPRO.fmt;
  var NBSP = fmt.NBSP;

  function isSafeLaunchUrl(u) {
    return /^https:\/\//i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(u);
  }

  function goReader(ctx) {
    window.location.href = TPRO.url.readerUrl(ctx.id, ctx.token);
  }

  function copyButton(getText, label) {
    var btn = el("button", { type: "button", class: "copy-btn", text: "Copier", "aria-label": label });
    btn.addEventListener("click", function () {
      TPRO.copyText(getText()).then(
        function () {
          setText(btn, "Copié");
          setTimeout(function () {
            setText(btn, "Copier");
          }, 2000);
        },
        function () {
          setText(btn, "Copie impossible");
        }
      );
    });
    return btn;
  }

  /** Builds the manual transfer panel inside ctx.container (replaces its content) and focuses its title. */
  function showManual(ctx, res) {
    var exact = Number(res.exactAmount || res.amount || ctx.amount) || 0;
    var price = Number(res.amount || ctx.amount) || 0;
    var number = String(res.waveNumber || "");
    var status = el("p", { class: "form-status", role: "alert" });
    var paidBtn = el("button", { type: "button", class: "btn btn-primary btn-block btn-lg", id: "manual-paid-btn" }, [
      el("span", { class: "btn-label", text: "J'ai envoyé l'argent" })
    ]);
    var title = el("h3", { id: "pay-title", tabindex: "-1", text: "Payer par transfert Wave" });

    var whatsapp = null;
    if (res.whatsapp) {
      var msg =
        "Bonjour, je viens d'envoyer " + fmt.fcfa(exact) + " par Wave pour la formation Power Query (Teranga Pro), commande " +
        (res.reference || ctx.id) + ".";
      whatsapp = el("a", {
        class: "btn btn-ghost btn-block",
        id: "manual-whatsapp",
        href: TPRO.whatsappLink(res.whatsapp, msg),
        target: "_blank",
        rel: "noopener noreferrer",
        text: "Prévenir le vendeur sur WhatsApp (facultatif)"
      });
    }

    var panel = el("section", { class: "pay-panel", id: "manual-panel", "aria-labelledby": "pay-title" }, [
      el("div", { class: "pay-panel-head" }, [
        el("span", { class: "pay-badge", "aria-hidden": "true" }, [waveGlyph()]),
        title
      ]),
      el("div", { class: "exact-box" }, [
        el("div", { class: "exact-row" }, [
          el("p", { class: "exact-line" }, ["Envoyez exactement ", el("strong", { class: "exact-amount", id: "m-amount", text: fmt.fcfa(exact) })]),
          copyButton(function () {
            return String(exact);
          }, "Copier le montant")
        ]),
        el("p", { class: "exact-why", text: exactWhy(exact, price) })
      ]),
      el("ol", { class: "pay-steps" }, [
        el("li", null, [
          "Ouvrez Wave et envoyez ce montant au numéro :",
          el("span", { class: "copy-line" }, [
            el("strong", { id: "m-number", class: "nowrap", text: number }),
            copyButton(function () {
              return number;
            }, "Copier le numéro")
          ])
        ]),
        el("li", { text: "Revenez sur cette page et touchez « J'ai envoyé l'argent »." })
      ]),
      el("p", { class: "pay-note", text: "Les frais de transfert Wave sont à votre charge." }),
      el("p", {
        class: "pay-note pay-note-strong",
        id: "manual-after",
        text: res.autoUnlock
          ? "Votre accès s'ouvre tout seul dès que votre transfert arrive, en général en moins d'une minute."
          : "Votre accès s'ouvre dès que le vendeur a vérifié la réception."
      }),
      paidBtn,
      whatsapp,
      el("p", { class: "pay-ref" }, ["Référence de commande : ", el("strong", { id: "m-ref", text: res.reference || ctx.id })]),
      status
    ]);

    paidBtn.addEventListener("click", function () {
      TPRO.dom.busy(paidBtn, true, "Ouverture de votre accès…");
      // Errors are ignored (the reader waits for the payment anyway), except already_paid which is good news.
      TPRO.api
        .request("POST", TPRO.api.orderPath(ctx.id, "/manual-paid"), { body: { t: ctx.token } })
        .then(
          function () {
            goReader(ctx);
          },
          function () {
            goReader(ctx);
          }
        );
    });

    TPRO.dom.clear(ctx.container);
    ctx.container.appendChild(panel);
    ctx.container.hidden = false;
    if (ctx.onManual) ctx.onManual(panel);
    try {
      title.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    } catch (e) {
      title.scrollIntoView();
    }
    title.focus({ preventScroll: true });
    return panel;
  }

  /** Why the amount differs from the price (the buyer must not think he underpays, nor round up). */
  function exactWhy(exact, price) {
    if (price > exact) {
      return (
        "Pourquoi ce montant" + NBSP + "? C'est votre montant personnel, " + fmt.fcfa(price - exact) + " de moins que le prix (" +
        fmt.fcfa(price) + ")" + NBSP + ": il permet de reconnaître votre transfert automatiquement. Envoyez-le au franc près, sans arrondir."
      );
    }
    return "Envoyez ce montant au franc près. Le vendeur vérifie la réception de votre transfert, puis ouvre votre accès.";
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function waveGlyph() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 26 26");
    svg.setAttribute("aria-hidden", "true");
    [["M5.5 15c1.6-2 3.2-2 4.8 0s3.2 2 4.8 0 3.2-2 4.8 0", "1"], ["M5.5 10.5c1.6-2 3.2-2 4.8 0s3.2 2 4.8 0 3.2-2 4.8 0", ".5"]].forEach(function (d) {
      var p = document.createElementNS(ns, "path");
      p.setAttribute("d", d[0]);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", "currentColor");
      p.setAttribute("stroke-width", "2");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("opacity", d[1]);
      svg.appendChild(p);
    });
    return svg;
  }

  /**
   * After the Wave redirect the tab may stay open (Wave app) or come back from the cache: re-enable the button,
   * offer the reader link and open it when the payment already went through. Same logic as cv/checkout.js.
   */
  function watchReturn(ctx) {
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
      TPRO.dom.busy(ctx.button, false);
      setText(ctx.statusBox, "");
      if (ctx.returnBox) ctx.returnBox.hidden = false;
      TPRO.api.request("GET", TPRO.api.orderPath(ctx.id, "?t=" + encodeURIComponent(ctx.token))).then(
        function (res) {
          if (res && res.order && res.order.status === "paid") goReader(ctx);
        },
        function () {
          /* the « Ouvrir ma formation » link still works */
        }
      );
    }
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
  }

  /**
   * ctx = { id, token, amount, container, button?, errorBox?, statusBox?, returnBox?, onClosed?(err), onManual?(panel) }.
   * Resolves once the next screen is shown (manual panel, Wave redirect or an error message).
   */
  function checkout(ctx) {
    setText(ctx.errorBox, "");
    TPRO.dom.busy(ctx.button, true, "Préparation du paiement…");
    return TPRO.api
      .request("POST", TPRO.api.orderPath(ctx.id, "/checkout"), {
        body: { t: ctx.token, returnBase: TPRO.url.returnBase() },
        timeout: 30000
      })
      .then(function (res) {
        if (res && res.mode === "wave" && isSafeLaunchUrl(res.launchUrl || "")) {
          setText(ctx.statusBox, "Ouverture de Wave…");
          window.location.href = res.launchUrl;
          watchReturn(ctx);
          return;
        }
        TPRO.dom.busy(ctx.button, false);
        if (res && res.mode === "manual") showManual(ctx, res);
        else setText(ctx.errorBox, "Le paiement en ligne arrive très bientôt.");
      })
      .catch(function (err) {
        if (err.code === "already_paid") {
          goReader(ctx);
          return;
        }
        TPRO.dom.busy(ctx.button, false);
        if (err.code === "sales_closed" && ctx.onClosed) ctx.onClosed(err);
        setText(ctx.errorBox, err.message);
      });
  }

  TPRO.pay = { checkout: checkout, showManual: showManual, isSafeLaunchUrl: isSafeLaunchUrl };
})();
