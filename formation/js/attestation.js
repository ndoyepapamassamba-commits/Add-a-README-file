// Teranga Pro — attestation.html
//   ?c=CODE  public verification: GET /attestations/:code (only attestations the buyer chose to list)
//   ?o=&t=   the buyer's printable A4 landscape attestation, from GET /orders/:id/course
//   (none)   a small « Vérifier une attestation » form
(function () {
  "use strict";

  var TPRO = window.TPRO;
  var $ = TPRO.dom.$;
  var el = TPRO.dom.el;
  var clear = TPRO.dom.clear;
  var setText = TPRO.dom.setText;
  var fmt = TPRO.fmt;
  var NBSP = fmt.NBSP;
  var KIND = "Attestation de suivi — non diplômante";
  var DESIGNED_BY = "Conçu par un praticien du reporting bancaire en Afrique de l'Ouest";

  function state(nodes) {
    var box = clear($("#att-state"));
    box.hidden = false;
    $("#att-sheet").hidden = true;
    $("#att-tools").hidden = true;
    $("#att-small-note").hidden = true;
    nodes.forEach(function (n) {
      if (n) box.appendChild(typeof n === "string" ? el("p", { text: n }) : n);
    });
    var h = box.querySelector("h1");
    if (h) {
      h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
    }
  }

  function verifyForm(value) {
    var input = el("input", {
      type: "text",
      id: "att-code",
      name: "c",
      autocomplete: "off",
      autocapitalize: "none",
      spellcheck: "false",
      maxlength: "12",
      placeholder: "ex. 3f9a0c1b2d4e",
      "aria-describedby": "att-code-error att-code-hint"
    });
    if (value) input.value = value;
    var err = el("p", { class: "field-error", id: "att-code-error" });
    var form = el("form", { class: "verify-form", action: "attestation.html", method: "get", novalidate: true }, [
      el("div", { class: "field" }, [
        el("label", { for: "att-code", text: "Code de vérification" }),
        el("span", { class: "field-hint", id: "att-code-hint", text: "12 caractères (chiffres et lettres de a à f), imprimés en bas de l'attestation." }),
        el("div", { class: "inline-field" }, [
          input,
          el("button", { type: "submit", class: "btn btn-primary" }, [el("span", { class: "btn-label", text: "Vérifier" })])
        ]),
        err
      ])
    ]);
    form.addEventListener("submit", function (e) {
      var v = String(input.value || "").trim().toLowerCase();
      if (!/^[0-9a-f]{12}$/.test(v)) {
        e.preventDefault();
        setText(err, "Le code compte 12 caractères : chiffres de 0 à 9 et lettres de a à f.");
        input.setAttribute("aria-invalid", "true");
        input.focus();
      } else {
        input.value = v;
      }
    });
    return form;
  }

  /* ---------- Public verification ---------- */

  function publicMode(code) {
    state([el("p", { class: "loading" }, [el("span", { class: "spinner", "aria-hidden": "true" }), "Vérification en cours…"])]);
    var c = String(code).trim().toLowerCase();
    if (!/^[0-9a-f]{12}$/.test(c)) {
      notFound(code);
      return;
    }
    TPRO.api.request("GET", "/attestations/" + encodeURIComponent(c)).then(
      function (a) {
        state([
          el("article", { class: "verify-card", "aria-labelledby": "verify-title" }, [
            el("p", { class: "verify-badge" }, [checkSvg(), "Attestation vérifiée"]),
            el("h1", { id: "verify-title", text: a.kind || KIND }),
            el("dl", { class: "verify-list" }, [
              el("dt", { text: "Nom" }),
              el("dd", { class: "verify-name", text: a.fullName }),
              el("dt", { text: "Formation" }),
              el("dd", { text: a.course }),
              el("dt", { text: "Date de réussite du quiz final" }),
              el("dd", { text: fmt.longDate(a.date) }),
              el("dt", { text: "Code" }),
              el("dd", null, [el("code", { class: "code", text: a.code })])
            ]),
            el("p", { class: "muted small", text: "Cette attestation de suivi atteste la réussite au quiz final de la formation. Ce n'est ni un diplôme ni une certification. " + DESIGNED_BY + "." })
          ]),
          el("p", { class: "center" }, [el("a", { href: "index.html", text: "Découvrir la formation" })])
        ]);
      },
      function (err) {
        if (err.status === 404) notFound(c);
        else state([el("h1", { text: "Vérification impossible" }), err.message, verifyForm(c)]);
      }
    );
  }

  function notFound(code) {
    state([
      el("h1", { text: "Attestation introuvable" }),
      el("p", { class: "banner banner-warn", text: "Aucune attestation publique ne correspond à ce code." }),
      "Vérifiez le code (12 caractères). Le titulaire peut aussi avoir choisi de ne pas rendre son attestation publique.",
      verifyForm(code)
    ]);
  }

  function checkSvg() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M4 10.5l4 4 8-9");
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "2.4");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    svg.appendChild(p);
    return svg;
  }

  /* ---------- Buyer's printable attestation ---------- */

  function buyerMode(id, token) {
    state([el("p", { class: "loading" }, [el("span", { class: "spinner", "aria-hidden": "true" }), "Préparation de votre attestation…"])]);
    TPRO.api.request("GET", TPRO.api.orderPath(id, "/course?t=" + encodeURIComponent(token))).then(
      function (view) {
        if (!view.attestation) {
          state([
            el("h1", { text: "Attestation pas encore disponible" }),
            "L'attestation de suivi s'obtient en réussissant le quiz final de la formation (au moins " + ((view.quiz && view.quiz.passPercent) || 70) + NBSP + "% de bonnes réponses).",
            el("p", null, [el("a", { class: "btn btn-primary", href: TPRO.url.readerUrl(id, token) + "#quiz" }, [el("span", { class: "btn-label", text: "Aller au quiz final" })])])
          ]);
          return;
        }
        certificate(view, id, token);
      },
      function (err) {
        var title = err.status === 404 ? "Lien introuvable" : err.status === 410 ? "Accès expiré" : err.status === 503 ? "Contenu en cours de mise en ligne" : "Connexion impossible";
        state([el("h1", { text: title }), err.status === 404 ? "Ce lien ne correspond à aucune formation payée. Ouvrez l'attestation depuis votre espace de lecture." : err.message]);
      }
    );
  }

  function certificate(view, id, token) {
    var att = view.attestation;
    var label = "Formation «" + NBSP + view.course.title + NBSP + "» — édition " + view.course.edition;
    var verifyUrl = TPRO.url.absolute(TPRO.url.publicAttestationUrl(att.code));
    $("#att-state").hidden = true;
    $("#att-tools").hidden = false;
    $("#att-back").href = TPRO.url.readerUrl(id, token) + "#quiz";
    setText($("#cert-name"), view.buyer.fullName);
    setText($("#cert-text"), "a réussi le quiz final de la formation le " + fmt.longDate(att.passedAt) + " (score " + fmt.percent(att.score) + ")");
    setText($("#cert-course"), label);
    setText($("#cert-code"), att.code);
    var verify = clear($("#cert-verify"));
    if (att.publicListing) {
      verify.appendChild(el("span", { class: "cert-label", text: "Vérification en ligne" }));
      verify.appendChild(el("span", { class: "cert-url", text: verifyUrl }));
    } else {
      verify.appendChild(el("span", { class: "cert-label", text: "Vérification publique désactivée" }));
      verify.appendChild(el("span", { class: "cert-url muted", text: "Le titulaire a choisi de ne pas publier cette attestation." }));
    }
    var listing = $("#att-listing");
    setText(listing, att.publicListing
      ? "Vérification publique activée : toute personne qui saisit le code voit votre nom, la formation et la date."
      : "Vérification publique désactivée. Pour l'activer, repassez le quiz en cochant « Afficher mon attestation sur la page publique de vérification ».");
    $("#att-sheet").hidden = false;
    $("#att-small-note").hidden = false;
    document.title = "Attestation de suivi — " + view.buyer.fullName + " — Teranga Pro";
    fit();
  }

  /** On screen the A4 landscape sheet (297 mm) is scaled down to the available width; print uses real size. */
  function fit() {
    var sheet = $("#att-sheet");
    var page = $("#cert");
    if (!sheet || sheet.hidden) return;
    page.style.transform = "none";
    var natural = page.offsetWidth;
    var avail = sheet.clientWidth;
    var s = natural ? Math.min(1, avail / natural) : 1;
    page.style.transform = s < 1 ? "scale(" + s + ")" : "none";
    sheet.style.height = Math.ceil(page.offsetHeight * s) + "px";
  }

  function init() {
    var printBtn = $("#att-print");
    if (printBtn) printBtn.addEventListener("click", function () { window.print(); });
    window.addEventListener("resize", fit);
    window.addEventListener("beforeprint", function () {
      $("#cert").style.transform = "none";
      $("#att-sheet").style.height = "";
    });
    window.addEventListener("afterprint", fit);
    var code = TPRO.url.param("c");
    var id = TPRO.url.param("o");
    var token = TPRO.url.param("t");
    if (code) publicMode(code);
    else if (id && token) buyerMode(id, token);
    else state([el("h1", { text: "Vérifier une attestation" }), "Saisissez le code imprimé en bas de l'attestation de suivi Teranga Pro.", verifyForm("")]);
  }

  init();
})();
