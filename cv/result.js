// resultat.html?o=ID&t=TOKEN — waits for the payment (polling), then shows the full documents with
// template switcher, in-place text corrections and PDF / Word / print / copy actions.
// Pack Stage orders: tabs CV · Lettre 1…N · Message d'envoi; the letters download as ONE PDF / ONE Word file
// (one letter per page), the CV as its own file, and the sending message has copy buttons.
(function () {
  "use strict";

  var TCV = window.TCV;
  var $ = TCV.dom.$;
  var el = TCV.dom.el;
  var setText = TCV.dom.setText;

  var POLL_MS = 4000;
  var POLL_WINDOW_MS = 15 * 60 * 1000;
  var DOC_TITLES = { cv: "Votre CV", lettre: "Votre lettre de motivation" };
  var FILE_PREFIX = { cv: "CV", lettre: "Lettre" };

  var id = TCV.url.param("o");
  var token = TCV.url.param("t");
  var order = null;
  var serverDoc = null;
  var doc = null;
  var template = "classique";
  var parts = [];
  var views = {};
  var tab = null;
  var refreshEnvoi = null;
  var layoutEnvoi = null;
  var pollStart = 0;
  var pollTimer = null;
  var waitPreviewShown = false;
  var config = null;
  var premium = null; // CV Premium card (premium-export.js), when the order is a CV Premium

  function editsKey() {
    return "tcv:edits:" + id;
  }

  function state(name) {
    ["loading", "error", "wait", "ready"].forEach(function (s) {
      $("#st-" + s).hidden = s !== name;
    });
  }

  function fail(title, text) {
    stopPolling();
    state("error");
    setText($("#err-title"), title);
    setText($("#err-text"), text);
    $("#err-title").focus();
  }

  function fetchOrder() {
    return TCV.api.request("GET", "/orders/" + encodeURIComponent(id) + "?t=" + encodeURIComponent(token));
  }

  function previewUrl() {
    return "index.html?o=" + encodeURIComponent(id) + "&t=" + encodeURIComponent(token);
  }

  /* ---------- Waiting for payment ---------- */

  function stopPolling() {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  function schedulePoll() {
    stopPolling();
    if (Date.now() - pollStart > POLL_WINDOW_MS) {
      setText($("#wait-status"), "La vérification automatique est en pause. Touchez « Vérifier maintenant » pour relancer.");
      return;
    }
    pollTimer = setTimeout(poll, POLL_MS);
  }

  function poll() {
    if (document.hidden) {
      schedulePoll();
      return;
    }
    fetchOrder().then(handle, function (err) {
      if (err.status === 404 || err.status === 410) handleError(err);
      else {
        setText($("#wait-status"), "Connexion instable, nouvelle tentative dans quelques secondes…");
        schedulePoll();
      }
    });
  }

  function showWaiting(res) {
    state("wait");
    // Manual transfer: the customer said "J'ai envoyé l'argent", or opened this page while the order waits for it.
    var claimed = res.order.status === "awaiting_manual";
    var manual = claimed || (res.order.status === "checkout" && !!(config && config.payment.manual));
    setText($("#wait-ref"), res.order.id);
    setText($("#wait-title"), manual ? "Paiement en cours de vérification" : "Confirmation du paiement Wave…");
    setText($("#wait-text"), manual
      ? "Merci ! Dès que votre transfert Wave est reçu, vos documents s'affichent ici tout seuls. Gardez cette page ouverte."
      : "Nous attendons la confirmation de Wave. Cela prend en général quelques secondes après la validation dans Wave.");
    var wa = $("#wait-whatsapp");
    var owner = config && config.payment.ownerWhatsapp;
    wa.hidden = !(manual && owner);
    if (manual && owner) {
      wa.href = TCV.whatsappLink(owner, "Bonjour, j'ai envoyé le paiement par Wave pour ma commande Teranga CV " + res.order.id + ".");
    }
    var back = $("#wait-back");
    back.hidden = claimed;
    setText(back, manual ? "Revoir le montant exact à envoyer" : "Revenir à l'aperçu pour payer");
    back.href = previewUrl();
    if (!waitPreviewShown && res.preview) {
      waitPreviewShown = true;
      if (res.order.product === "premium" && TCV.premiumResult) {
        TCV.premiumResult.preview($("#wait-preview"), res.preview.cv, res.order.id);
        return;
      }
      // CV and lettre; for the Pack Stage, the CV and the first letter only.
      TCV.docParts(res.preview).forEach(function (part) {
        if (part.kind === "envoi" || part.index > 0) return;
        new TCV.DocView($("#wait-preview"), part.kind).show(TCV.getPath(res.preview, part.path), res.order.template);
      });
    }
  }

  function handle(res) {
    order = res.order;
    setText($("#wait-status"), "");
    if (order.status === "paid" && res.document) {
      stopPolling();
      showReady(res.document);
      return;
    }
    if (order.status === "preview") {
      window.location.replace(previewUrl());
      return;
    }
    showWaiting(res);
    schedulePoll();
  }

  function handleError(err) {
    if (err.status === 410) {
      fail("Documents supprimés", "Pour protéger vos données, les documents sont effacés automatiquement 30 jours après le paiement (3 jours sans paiement). Vous pouvez créer un nouveau document.");
    } else if (err.status === 404) {
      fail("Commande introuvable", "Ce lien n'est pas valide. Vérifiez qu'il est complet, ou ouvrez « Mes documents » depuis la page d'accueil sur le téléphone utilisé pour la commande.");
    } else {
      fail("Chargement impossible", err.message);
    }
  }

  /* ---------- Documents ready ---------- */

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function sameShape(a, b) {
    var la = Array.isArray(a.lettres) ? a.lettres.length : -1;
    var lb = Array.isArray(b.lettres) ? b.lettres.length : -1;
    return !!a.cv === !!b.cv && !!a.lettre === !!b.lettre && la === lb && !!a.envoi === !!b.envoi;
  }

  function loadEdits(fresh) {
    var saved = TCV.store.get(editsKey(), null);
    var ok = saved && typeof saved === "object" && sameShape(saved, fresh);
    return ok ? saved : clone(fresh);
  }

  function personName() {
    if (doc.cv && doc.cv.fullName) return doc.cv.fullName;
    var l = doc.lettre || (doc.lettres || [])[0];
    if (l) return l.signature || (l.sender || [])[0] || "";
    return "";
  }

  function filename(kind, ext) {
    return FILE_PREFIX[kind] + "-" + TCV.fmt.fileBase(personName()) + "." + ext;
  }

  function lettersFilename(ext) {
    var n = (doc.lettres || []).length;
    return (n > 1 ? "Lettres-de-stage-" : "Lettre-de-stage-") + TCV.fmt.fileBase(personName()) + "." + ext;
  }

  function isStageLetter(part) {
    return part.path.indexOf("lettres.") === 0;
  }

  function persistEdits() {
    TCV.store.set(editsKey(), doc);
    $("#reset-edits").hidden = false;
  }

  /** The renderer names letter fields "lettre.*"; a Pack Stage letter lives at "lettres.<i>.*". */
  function editHandler(part) {
    return function (path, value) {
      var real = isStageLetter(part) ? path.replace(/^lettre\./, part.path + ".") : path;
      TCV.setPath(doc, real, value);
      persistEdits();
    };
  }

  function actionButton(cls, label, act) {
    return el("button", { type: "button", class: "btn " + cls, "data-act": act }, [el("span", { class: "btn-label", text: label })]);
  }

  /** "Sonatel, Dakar" from the recipient block of a Pack Stage letter (first line = addressee title). */
  function letterCompany(l) {
    var lines = ((l && l.recipient) || []).filter(function (s) { return typeof s === "string" && s.trim(); });
    return (lines.length > 1 ? lines.slice(1) : lines).join(", ");
  }

  function docCard(part) {
    if (part.kind === "envoi") return envoiCard(part);
    var kind = part.kind;
    var multi = isStageLetter(part);
    var count = part.count || 1;
    var title = !multi ? DOC_TITLES[kind] : count > 1 ? "Lettre " + (part.index + 1) + " sur " + count : "Votre lettre de demande de stage";
    var status = el("p", { class: "status", role: "status", "aria-live": "polite" });
    var zoom = el("button", { type: "button", class: "btn btn-ghost btn-sm zoom-btn", "aria-pressed": "false", text: "Agrandir pour corriger" });
    var buttons = multi
      ? [
        actionButton("btn-primary", count > 1 ? "Télécharger les " + count + " lettres (PDF)" : "Télécharger PDF", "pdf-all"),
        actionButton("btn-secondary", count > 1 ? "Télécharger les " + count + " lettres (Word)" : "Télécharger Word", "word-all"),
        actionButton("btn-secondary", count > 1 ? "Imprimer les lettres" : "Imprimer", "print-all"),
        actionButton("btn-secondary", "Copier cette lettre", "copy")
      ]
      : [
        actionButton("btn-primary", "Télécharger PDF", "pdf"),
        actionButton("btn-secondary", "Télécharger Word", "word"),
        actionButton("btn-secondary", "Imprimer", "print"),
        kind === "lettre" ? actionButton("btn-secondary", "Copier la lettre", "copy") : null
      ];
    var actions = el("div", { class: "doc-actions" }, buttons);
    var company = multi ? letterCompany(TCV.getPath(doc, part.path)) : "";
    var frameParent = el("div");
    var card = el("section", { class: "doc-card", "data-doc": kind, "data-part": part.key, "aria-label": multi ? title + (company ? " — " + company : "") : DOC_TITLES[kind] }, [
      el("div", { class: "doc-card-head" }, [
        el("div", null, [el("h2", { text: title }), company ? el("p", { class: "doc-card-sub", text: company }) : null]),
        zoom
      ]),
      actions,
      multi && count > 1 ? el("p", { class: "hint doc-card-hint", text: "Un seul fichier pour vos " + count + " lettres, une par page." }) : null,
      status,
      frameParent
    ]);
    $("#docs").appendChild(card);
    var view = new TCV.DocView(frameParent, kind, { editable: true, onEdit: editHandler(part) });
    views[part.key] = view;
    zoom.addEventListener("click", function () {
      var on = zoom.getAttribute("aria-pressed") !== "true";
      zoom.setAttribute("aria-pressed", on ? "true" : "false");
      setText(zoom, on ? "Réduire" : "Agrandir pour corriger");
      view.setZoom(on);
    });
    actions.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-act]") : null;
      if (btn) runAction(part, btn.getAttribute("data-act"), btn, status);
    });
  }

  /** Fresh A4 pages of the given parts, laid out off screen so they can be measured, fitted and exported. */
  function freshPages(list) {
    var host = el("div", { class: "export-host", "aria-hidden": "true" });
    document.body.appendChild(host);
    var pages = list.map(function (part) {
      var page = window.TCVRender[part.kind](TCV.getPath(doc, part.path), template);
      host.appendChild(page);
      window.TCVRender.fit(page);
      return page;
    });
    return {
      pages: pages,
      done: function () {
        if (host.parentNode) host.parentNode.removeChild(host);
      }
    };
  }

  function stageLetterParts() {
    return parts.filter(isStageLetter);
  }

  function runAction(part, act, btn, status) {
    var page = views[part.key].page;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    setText(status, "");
    if (act === "pdf") {
      TCV.dom.busy(btn, true, window.html2pdf ? "Création du PDF…" : "Préparation du PDF…");
      var name = filename(part.kind, "pdf");
      window.TCVExport.pdf(page, name).then(
        function () {
          TCV.dom.busy(btn, false);
          setText(status, "PDF téléchargé : " + name);
        },
        function () {
          TCV.dom.busy(btn, false);
          setText(status, "Le PDF n'a pas pu être créé (connexion ?). Réessayez, ou touchez « Imprimer » puis « Enregistrer au format PDF ».");
        }
      );
    } else if (act === "word") {
      var docName = filename(part.kind, "doc");
      window.TCVExport.word(page, docName);
      setText(status, "Fichier Word téléchargé : " + docName);
    } else if (act === "print") {
      window.TCVExport.print([page]);
    } else if (act === "copy") {
      TCV.copyText(window.TCVExport.letterText(TCV.getPath(doc, part.path))).then(
        function () { setText(status, "Lettre copiée. Collez-la dans un e-mail ou un message."); },
        function () { setText(status, "Copie impossible sur ce navigateur. Utilisez le fichier Word."); }
      );
    } else if (act === "pdf-all") {
      TCV.dom.busy(btn, true, window.html2pdf ? "Création du PDF…" : "Préparation du PDF…");
      var pdfName = lettersFilename("pdf");
      var set = freshPages(stageLetterParts());
      window.TCVExport.pdfPages(set.pages, pdfName).then(
        function () {
          set.done();
          TCV.dom.busy(btn, false);
          setText(status, "PDF téléchargé : " + pdfName);
        },
        function () {
          set.done();
          TCV.dom.busy(btn, false);
          setText(status, "Le PDF n'a pas pu être créé (connexion ?). Réessayez, ou touchez « Imprimer les lettres » puis « Enregistrer au format PDF ».");
        }
      );
    } else if (act === "word-all") {
      var wordName = lettersFilename("doc");
      var words = freshPages(stageLetterParts());
      window.TCVExport.wordPages(words.pages, wordName);
      words.done();
      setText(status, "Fichier Word téléchargé : " + wordName);
    } else if (act === "print-all") {
      var prints = freshPages(stageLetterParts());
      window.TCVExport.print(prints.pages);
      prints.done();
    }
  }

  /* ---------- Pack Stage sending message ---------- */

  /** Copy button that confirms on itself ("Copié") and in the card's status line (screen readers). */
  function copyButton(cls, label, source, status, done) {
    var span = el("span", { class: "btn-label", text: label });
    var btn = el("button", { type: "button", class: "btn " + cls }, [span]);
    var timer = null;
    btn.addEventListener("click", function () {
      TCV.copyText(source()).then(
        function () {
          setText(status, done);
          setText(span, "Copié ✓");
          clearTimeout(timer);
          timer = setTimeout(function () { setText(span, label); }, 2500);
        },
        function () { setText(status, "Copie impossible sur ce navigateur : sélectionnez le texte et copiez-le."); }
      );
    });
    return btn;
  }

  /** Grows a textarea to its content (only while it is on screen). */
  function autoSize(ta) {
    if (!ta.offsetParent) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + 4 + "px";
  }

  function envoiCard(part) {
    var status = el("p", { class: "status", role: "status", "aria-live": "polite" });
    var subject = el("textarea", { id: "env-subject", rows: 2, maxlength: 200, class: "env-subject" });
    var body = el("textarea", { id: "env-body", rows: 10 });
    var wa = el("textarea", { id: "env-wa", rows: 8, "aria-describedby": "env-wa-count" });
    var waCount = el("span", { class: "counter", id: "env-wa-count" });
    var mailLink = el("a", { class: "btn btn-secondary", id: "env-mail-link", text: "Ouvrir ma messagerie" });
    var waLink = el("a", { class: "btn btn-secondary", id: "env-wa-link", target: "_blank", rel: "noopener", text: "Ouvrir WhatsApp" });
    var boxes = [subject, body, wa];

    function sync() {
      mailLink.href = "mailto:?subject=" + encodeURIComponent(subject.value) + "&body=" + encodeURIComponent(body.value);
      waLink.href = TCV.whatsappLink("", wa.value);
      setText(waCount, wa.value.length + " caractères");
      boxes.forEach(autoSize);
    }
    refreshEnvoi = function () {
      var e = doc.envoi || {};
      subject.value = e.emailSubject || "";
      body.value = e.emailBody || "";
      wa.value = e.whatsapp || "";
      sync();
    };
    // The subject is one line: Enter is ignored and pasted line breaks become spaces.
    subject.addEventListener("keydown", function (e) {
      if (e.key === "Enter") e.preventDefault();
    });
    [[subject, "emailSubject"], [body, "emailBody"], [wa, "whatsapp"]].forEach(function (pair) {
      pair[0].addEventListener("input", function () {
        if (pair[0] === subject && /\n/.test(subject.value)) subject.value = subject.value.replace(/\s*\n\s*/g, " ");
        if (!doc.envoi) doc.envoi = {};
        doc.envoi[pair[1]] = pair[0].value;
        persistEdits();
        sync();
      });
    });

    var card = el("section", { class: "doc-card envoi-card", "data-doc": "envoi", "data-part": part.key, "aria-labelledby": "env-title" }, [
      el("div", { class: "doc-card-head" }, [el("h2", { id: "env-title", text: "Message d'envoi" })]),
      el("p", { class: "hint", text: "Copiez le message, collez-le dans votre e-mail ou sur WhatsApp, puis joignez votre CV et la lettre de l'entreprise en PDF. Vous pouvez le modifier ici avant de copier." }),
      el("div", { class: "envoi-block" }, [
        el("h3", { text: "E-mail" }),
        el("div", { class: "field" }, [
          el("label", { for: "env-subject", text: "Objet" }),
          subject,
          el("div", { class: "envoi-actions envoi-actions-sm" }, [
            copyButton("btn-secondary btn-sm", "Copier l'objet", function () { return subject.value; }, status, "Objet copié. Collez-le dans le champ « Objet » de votre e-mail.")
          ])
        ]),
        el("div", { class: "field" }, [el("label", { for: "env-body", text: "Message" }), body]),
        el("div", { class: "envoi-actions" }, [
          copyButton("btn-primary", "Copier l'email", function () { return body.value; }, status, "E-mail copié. Collez-le dans votre message, ajoutez l'objet et les pièces jointes."),
          mailLink
        ])
      ]),
      el("div", { class: "envoi-block" }, [
        el("h3", { text: "WhatsApp" }),
        el("div", { class: "field" }, [el("label", { for: "env-wa", text: "Message WhatsApp" }), wa, waCount]),
        el("div", { class: "envoi-actions" }, [
          copyButton("btn-primary", "Copier le message WhatsApp", function () { return wa.value; }, status, "Message copié. Collez-le dans WhatsApp, puis envoyez vos PDF."),
          waLink
        ])
      ]),
      status
    ]);
    layoutEnvoi = sync;
    $("#docs").appendChild(card);
    refreshEnvoi();
  }

  /* ---------- Rendering ---------- */

  function renderDocs() {
    if (premium) {
      premium.render();
      return;
    }
    parts.forEach(function (part) {
      if (views[part.key]) views[part.key].show(TCV.getPath(doc, part.path), template);
    });
  }

  /** Pack Stage: only the card of the selected tab is shown. */
  function showTab() {
    var tabs = !$("#rs-doc-tabs-wrap").hidden;
    Array.prototype.forEach.call($("#docs").children, function (card) {
      card.hidden = tabs && card.getAttribute("data-part") !== tab;
    });
    if (tabs && views[tab]) views[tab].layout();
    if (layoutEnvoi && (!tabs || tab === "envoi")) layoutEnvoi();
  }

  function showReady(fresh) {
    serverDoc = fresh;
    doc = loadEdits(fresh);
    template = order.template || "classique";
    state("ready");
    TCV.dom.clear($("#docs"));
    views = {};
    refreshEnvoi = null;
    layoutEnvoi = null;
    premium = order.product === "premium" && doc.cv && TCV.premiumResult
      ? TCV.premiumResult.mount({ root: $("#docs"), id: id, doc: function () { return doc; }, onEdit: editHandler({ key: "cv", path: "cv" }) })
      : null;
    $("#rs-templates").parentNode.hidden = !!premium; // CV Premium: colour switcher inside its card
    if (premium) {
      parts = [{ key: "cv", kind: "premium", label: "CV Premium", path: "cv" }];
      views.cv = premium.view;
    } else {
      parts = TCV.docParts(doc);
      parts.forEach(docCard);
    }
    if (!premium) TCV.dom.segRadios($("#rs-templates"), "rs-template", window.TCVRender.TEMPLATES, template, function (t) {
      template = t;
      renderDocs();
      TCV.api.request("POST", "/orders/" + encodeURIComponent(id) + "/template", { body: { t: token, template: t } }).catch(function () {
        /* cosmetic preference only */
      });
    });
    var stage = Array.isArray(doc.lettres) && doc.lettres.length > 0;
    $("#rs-doc-tabs-wrap").hidden = !stage;
    tab = parts.length ? parts[0].key : null;
    if (stage) {
      $("#rs-doc-tabs").classList.toggle("seg-tabs", parts.length > 3);
      TCV.dom.segRadios($("#rs-doc-tabs"), "rs-doc", parts.map(function (p) { return { key: p.key, label: p.label }; }), tab, function (k) {
        tab = k;
        showTab();
      });
    }
    $("#reset-edits").hidden = JSON.stringify(doc) === JSON.stringify(serverDoc);
    renderDocs();
    showTab();
    $("#ready-title").focus();
  }

  function bind() {
    $("#check-now").addEventListener("click", function () {
      var btn = $("#check-now");
      TCV.dom.busy(btn, true, "Vérification…");
      pollStart = Date.now();
      fetchOrder()
        .then(handle, function (err) {
          if (err.status === 404 || err.status === 410) handleError(err);
          else setText($("#wait-status"), err.message);
        })
        .then(function () {
          TCV.dom.busy(btn, false);
        });
    });
    $("#reset-edits").addEventListener("click", function () {
      TCV.store.remove(editsKey());
      doc = clone(serverDoc);
      $("#reset-edits").hidden = true;
      renderDocs();
      if (refreshEnvoi) refreshEnvoi();
    });
    var share = $("#share-btn");
    share.href = TCV.whatsappLink("", "J'ai préparé mon CV et ma lettre de motivation sur Teranga CV, en 5 minutes et payé avec Wave : " + TCV.url.siteUrl());
    window.addEventListener("beforeprint", function () {
      var root = document.getElementById("print-root");
      if (root.firstChild || !doc) return;
      if (premium) {
        // The CV Premium page carries its colour and photo: the one on screen is printed.
        if (premium.view && premium.view.page) root.appendChild(premium.view.page.cloneNode(true));
      } else {
        // Fresh, fitted pages: Pack Stage letters on hidden tabs have never been laid out on screen.
        var set = freshPages(parts.filter(function (p) { return p.kind !== "envoi"; }));
        set.pages.forEach(function (p) {
          root.appendChild(p.cloneNode(true));
        });
        set.done();
      }
      window.addEventListener("afterprint", function clean() {
        window.removeEventListener("afterprint", clean);
        TCV.dom.clear(root);
      });
    });
  }

  function boot() {
    bind();
    if (!id || !token) {
      fail("Lien incomplet", "Ce lien ne contient pas la référence de votre commande. Ouvrez « Mes documents » depuis la page d'accueil, sur le téléphone utilisé pour la commande.");
      return;
    }
    pollStart = Date.now();
    Promise.all([fetchOrder(), TCV.loadConfig()]).then(function (both) {
      var res = both[0];
      config = both[1];
      TCV.orders.save({ id: id, token: token, product: res.order.product, createdAt: res.order.createdAt });
      handle(res);
    }, handleError);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
