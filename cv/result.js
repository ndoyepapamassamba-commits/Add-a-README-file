// resultat.html?o=ID&t=TOKEN — waits for the payment (polling), then shows the full documents with
// template switcher, in-place text corrections and PDF / Word / print / copy actions.
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
  var views = {};
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
    var manual = res.order.status === "awaiting_manual";
    setText($("#wait-ref"), res.order.id);
    setText($("#wait-title"), manual ? "Paiement en cours de vérification" : "Confirmation du paiement Wave…");
    setText($("#wait-text"), manual
      ? "Merci ! Dès que la réception de votre transfert Wave est vérifiée, vos documents s'affichent ici automatiquement."
      : "Nous attendons la confirmation de Wave. Cela prend en général quelques secondes après la validation dans Wave.");
    var wa = $("#wait-whatsapp");
    var owner = config && config.payment.ownerWhatsapp;
    wa.hidden = !(manual && owner);
    if (manual && owner) {
      wa.href = TCV.whatsappLink(owner, "Bonjour, j'ai payé " + TCV.fmt.fcfa(res.order.amount) + " par Wave pour ma commande Teranga CV " + res.order.id + ".");
    }
    var back = $("#wait-back");
    back.hidden = manual;
    back.href = previewUrl();
    if (!waitPreviewShown && res.preview) {
      waitPreviewShown = true;
      if (res.order.product === "premium" && TCV.premiumResult) {
        TCV.premiumResult.preview($("#wait-preview"), res.preview.cv, res.order.id);
        return;
      }
      ["cv", "lettre"].forEach(function (kind) {
        if (res.preview[kind]) new TCV.DocView($("#wait-preview"), kind).show(res.preview[kind], res.order.template);
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

  function loadEdits(fresh) {
    var saved = TCV.store.get(editsKey(), null);
    var ok = saved && typeof saved === "object" && !!saved.cv === !!fresh.cv && !!saved.lettre === !!fresh.lettre;
    return ok ? saved : clone(fresh);
  }

  function personName() {
    if (doc.cv && doc.cv.fullName) return doc.cv.fullName;
    if (doc.lettre) return doc.lettre.signature || (doc.lettre.sender || [])[0] || "";
    return "";
  }

  function filename(kind, ext) {
    return FILE_PREFIX[kind] + "-" + TCV.fmt.fileBase(personName()) + "." + ext;
  }

  function onEdit(path, value) {
    TCV.setPath(doc, path, value);
    TCV.store.set(editsKey(), doc);
    $("#reset-edits").hidden = false;
  }

  function actionButton(cls, label, act) {
    return el("button", { type: "button", class: "btn " + cls, "data-act": act }, [el("span", { class: "btn-label", text: label })]);
  }

  function docCard(kind) {
    var status = el("p", { class: "status", role: "status", "aria-live": "polite" });
    var zoom = el("button", { type: "button", class: "btn btn-ghost btn-sm zoom-btn", "aria-pressed": "false", text: "Agrandir pour corriger" });
    var actions = el("div", { class: "doc-actions" }, [
      actionButton("btn-primary", "Télécharger PDF", "pdf"),
      actionButton("btn-secondary", "Télécharger Word", "word"),
      actionButton("btn-secondary", "Imprimer", "print"),
      kind === "lettre" ? actionButton("btn-secondary", "Copier la lettre", "copy") : null
    ]);
    var frameParent = el("div");
    var card = el("section", { class: "doc-card", "data-doc": kind, "aria-label": DOC_TITLES[kind] }, [
      el("div", { class: "doc-card-head" }, [el("h2", { text: DOC_TITLES[kind] }), zoom]),
      actions,
      status,
      frameParent
    ]);
    $("#docs").appendChild(card);
    var view = new TCV.DocView(frameParent, kind, { editable: true, onEdit: onEdit });
    views[kind] = view;
    zoom.addEventListener("click", function () {
      var on = zoom.getAttribute("aria-pressed") !== "true";
      zoom.setAttribute("aria-pressed", on ? "true" : "false");
      setText(zoom, on ? "Réduire" : "Agrandir pour corriger");
      view.setZoom(on);
    });
    actions.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-act]") : null;
      if (btn) runAction(kind, btn.getAttribute("data-act"), btn, status);
    });
  }

  function runAction(kind, act, btn, status) {
    var page = views[kind].page;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    setText(status, "");
    if (act === "pdf") {
      TCV.dom.busy(btn, true, window.html2pdf ? "Création du PDF…" : "Préparation du PDF…");
      var name = filename(kind, "pdf");
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
      var docName = filename(kind, "doc");
      window.TCVExport.word(page, docName);
      setText(status, "Fichier Word téléchargé : " + docName);
    } else if (act === "print") {
      window.TCVExport.print([page]);
    } else if (act === "copy") {
      TCV.copyText(window.TCVExport.letterText(doc.lettre)).then(
        function () { setText(status, "Lettre copiée. Collez-la dans un e-mail ou un message."); },
        function () { setText(status, "Copie impossible sur ce navigateur. Utilisez le fichier Word."); }
      );
    }
  }

  function renderDocs() {
    if (premium) {
      premium.render();
      return;
    }
    ["cv", "lettre"].forEach(function (kind) {
      if (doc[kind] && views[kind]) views[kind].show(doc[kind], template);
    });
  }

  function showReady(fresh) {
    serverDoc = fresh;
    doc = loadEdits(fresh);
    template = order.template || "classique";
    state("ready");
    TCV.dom.clear($("#docs"));
    views = {};
    premium = order.product === "premium" && doc.cv && TCV.premiumResult
      ? TCV.premiumResult.mount({ root: $("#docs"), id: id, doc: function () { return doc; }, onEdit: onEdit })
      : null;
    $("#rs-templates").parentNode.hidden = !!premium; // CV Premium: colour switcher inside its card
    if (premium) views.cv = premium.view;
    else ["cv", "lettre"].forEach(function (kind) {
      if (doc[kind]) docCard(kind);
    });
    if (!premium) TCV.dom.segRadios($("#rs-templates"), "rs-template", window.TCVRender.TEMPLATES, template, function (t) {
      template = t;
      renderDocs();
      TCV.api.request("POST", "/orders/" + encodeURIComponent(id) + "/template", { body: { t: token, template: t } }).catch(function () {
        /* cosmetic preference only */
      });
    });
    $("#reset-edits").hidden = JSON.stringify(doc) === JSON.stringify(serverDoc);
    renderDocs();
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
    });
    var share = $("#share-btn");
    share.href = TCV.whatsappLink("", "J'ai préparé mon CV et ma lettre de motivation sur Teranga CV, en 5 minutes et payé avec Wave : " + TCV.url.siteUrl());
    window.addEventListener("beforeprint", function () {
      var root = document.getElementById("print-root");
      if (root.firstChild || !doc) return;
      Object.keys(views).forEach(function (k) {
        root.appendChild(views[k].page.cloneNode(true));
      });
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
