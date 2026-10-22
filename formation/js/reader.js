// Teranga Pro — lecture.html?o=&t= : the buyer's reader. GET /orders/:id (paid?) → GET /orders/:id/course → modules
// (TPRO.safeHtml), downloads (licence-stamped files), quiz + attestation, receipt link, WhatsApp self-send,
// reading progress (tpro:read:<id>) and quiz answers in progress (tpro:quiz:<id>) on this phone.
(function () {
  "use strict";

  var TPRO = window.TPRO;
  var $ = TPRO.dom.$;
  var $$ = TPRO.dom.$$;
  var el = TPRO.dom.el;
  var clear = TPRO.dom.clear;
  var setText = TPRO.dom.setText;
  var fmt = TPRO.fmt;
  var NBSP = fmt.NBSP;

  var POLL_MS = 4000;
  var POLL_FOR_MS = 15 * 60 * 1000;

  var id = TPRO.url.param("o");
  var token = TPRO.url.param("t");
  var course = null; // CourseView
  var current = null; // section id shown
  var pollTimer = null;
  var pollUntil = 0;

  /** Demo mode (js/demo-shim.js): the page runs on the in-browser mock. */
  function isDemo() {
    return document.documentElement.classList.contains("is-demo");
  }

  function api(method, suffix, body) {
    return TPRO.api.request(method, TPRO.api.orderPath(id, suffix), body ? { body: body } : undefined);
  }

  function q(suffix) {
    return suffix + "?t=" + encodeURIComponent(token);
  }

  /* ---------- Screens (loading, errors, pending payment) ---------- */

  function screen(opts) {
    var box = $("#rd-state");
    clear(box);
    $("#rd-layout").hidden = true;
    box.hidden = false;
    var card = el("div", { class: "state-card" + (opts.tone ? " state-" + opts.tone : "") });
    if (opts.spinner) card.appendChild(el("span", { class: "spinner spinner-lg", "aria-hidden": "true" }));
    var h = el("h1", { tabindex: "-1", text: opts.title });
    card.appendChild(h);
    (opts.lines || []).forEach(function (line) {
      if (line) card.appendChild(typeof line === "string" ? el("p", { text: line }) : line);
    });
    box.appendChild(card);
    if (opts.focus !== false) h.focus({ preventScroll: true });
    return card;
  }

  function bookList() {
    var list = TPRO.courses.list().filter(function (c) {
      return c.id !== id;
    });
    if (!list.length) return null;
    return el("div", { class: "state-book" }, [
      el("h2", { text: "Mes formations sur ce téléphone" }),
      el(
        "ul",
        { class: "book-list" },
        list.map(function (c) {
          return el("li", null, [
            el("a", { href: TPRO.url.readerUrl(c.id, c.token) }, ["Commande ", el("strong", { text: c.id })]),
            c.createdAt ? el("span", { class: "muted", text: " · " + fmt.date(c.createdAt) }) : null
          ]);
        })
      )
    ]);
  }

  function homeLink() {
    return el("p", null, [el("a", { class: "btn btn-ghost", href: "index.html", text: "Découvrir la formation" })]);
  }

  function retryButton(label, fn) {
    var b = el("button", { type: "button", class: "btn btn-primary" }, [el("span", { class: "btn-label", text: label })]);
    b.addEventListener("click", fn);
    return el("p", null, [b]);
  }

  function noParams() {
    var book = bookList();
    screen({
      title: "Mes formations",
      lines: book
        ? ["Choisissez la formation à ouvrir.", book]
        : [
            "Aucune formation n'est enregistrée sur ce téléphone. Ouvrez le lien personnel reçu après votre paiement (pensez à le garder sur votre WhatsApp).",
            homeLink()
          ]
    });
  }

  function errorScreen(err, retry) {
    if (err.status === 404) {
      screen({
        title: "Lien d'accès introuvable",
        tone: "warn",
        lines: [
          "Ce lien ne correspond à aucune formation. Vérifiez qu'il est complet : il contient « o= » puis « t= » suivi d'une longue suite de caractères.",
          bookList(),
          homeLink()
        ]
      });
    } else if (err.status === 410) {
      screen({ title: "Accès expiré", tone: "warn", lines: [err.message, homeLink()] });
    } else {
      screen({ title: "Connexion impossible", tone: "warn", lines: [err.message, retryButton("Réessayer", retry)] });
    }
  }

  /* ---------- Step 1: the order ---------- */

  function start() {
    if (!id || !token) {
      noParams();
      return;
    }
    screen({ title: "Ouverture de votre formation…", spinner: true, focus: false });
    loadOrder();
  }

  var polling = false; // the « Paiement en attente » screen is up and checks the order every 4 s
  var inFlight = false;

  function loadOrder() {
    if (inFlight) return;
    inFlight = true;
    api("GET", q("")).then(function (res) {
      inFlight = false;
      if (!TPRO.courses.find(id)) {
        TPRO.courses.save({ id: id, token: token, product: res.order.product, createdAt: res.order.createdAt });
      }
      if (res.order.status === "paid") {
        stopPolling();
        polling = false;
        loadCourse();
      } else {
        pendingScreen(res);
      }
    }, function (err) {
      inFlight = false;
      if (polling && err.status !== 404 && err.status !== 410) {
        schedulePoll(); // transient error while waiting for the payment: keep waiting
        return;
      }
      stopPolling();
      polling = false;
      errorScreen(err, start);
    });
  }

  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }

  function schedulePoll() {
    stopPolling();
    if (Date.now() > pollUntil) {
      var late = $("#pending-late");
      if (late) late.hidden = false;
      return;
    }
    pollTimer = setTimeout(loadOrder, POLL_MS);
  }

  var pendingShown = false;

  function pendingScreen(res) {
    polling = true;
    if (!pendingShown) {
      pendingShown = true;
      pollUntil = Date.now() + POLL_FOR_MS;
      var payBox = el("div", { id: "rd-pay", class: "rd-pay", hidden: true });
      var payError = el("p", { class: "form-status", role: "alert" });
      var showPay = el("button", { type: "button", class: "btn btn-primary", id: "show-pay" }, [
        el("span", { class: "btn-label", text: "Afficher les instructions de paiement" })
      ]);
      var checkNow = el("button", { type: "button", class: "btn btn-ghost" }, [el("span", { class: "btn-label", text: "Vérifier maintenant" })]);
      var late = el("div", { id: "pending-late", class: "pending-late", hidden: true }, [
        el("p", { text: "Le paiement n'est toujours pas reconnu. Si vous avez envoyé l'argent, touchez « Vérifier maintenant » ou prévenez le vendeur avec votre référence de commande." }),
        checkNow
      ]);
      checkNow.addEventListener("click", function () {
        late.hidden = true;
        pollUntil = Date.now() + POLL_FOR_MS;
        loadOrder();
      });
      showPay.addEventListener("click", function () {
        TPRO.pay.checkout({
          id: id,
          token: token,
          amount: res.order.amount,
          container: payBox,
          button: showPay,
          errorBox: payError,
          onManual: function () {
            showPay.hidden = true;
          }
        });
      });
      screen({
        title: "Paiement en attente",
        lines: [
          el("p", { class: "pending-line" }, [
            el("span", { class: "pulse", "aria-hidden": "true" }),
            "Nous attendons la confirmation de votre transfert Wave. Cette page s'ouvre toute seule dès que le paiement est reconnu."
          ]),
          el("p", { class: "muted" }, [
            "Commande ", el("strong", { text: id }), " · ", TPRO.COURSE_LABEL,
            " — prix " + fmt.fcfa(res.order.amount) + ". Le montant exact à envoyer (un peu moins) s'affiche avec «" + NBSP +
              "Afficher les instructions de paiement" + NBSP + "»."
          ]),
          el("p", { class: "state-actions" }, [showPay]),
          payError,
          payBox,
          late,
          keepLinkBox()
        ]
      });
    }
    schedulePoll();
  }

  /* ---------- Step 2: the course ---------- */

  function loadCourse() {
    screen({ title: "Ouverture de votre formation…", spinner: true, focus: false });
    api("GET", q("/course")).then(render, function (err) {
      if (err.status === 503) {
        screen({
          title: "Le contenu est en cours de mise en ligne",
          lines: [err.message, retryButton("Réessayer", loadCourse)]
        });
      } else {
        errorScreen(err, loadCourse);
      }
    });
  }

  /* ---------- Reading progress (tpro:read:<id>) ---------- */

  function readState() {
    var s = TPRO.store.get("tpro:read:" + id, null);
    var done = s && Array.isArray(s.done) ? s.done.filter(function (n) { return typeof n === "number"; }) : [];
    return { last: s && typeof s.last === "number" ? s.last : null, done: done };
  }

  function saveRead(s) {
    TPRO.store.set("tpro:read:" + id, { last: s.last, done: s.done });
  }

  function isDone(n) {
    return readState().done.indexOf(n) >= 0;
  }

  function setDone(n, on) {
    var s = readState();
    s.done = s.done.filter(function (x) { return x !== n; });
    if (on) s.done.push(n);
    s.done.sort(function (a, b) { return a - b; });
    saveRead(s);
    refreshProgress();
  }

  function refreshProgress() {
    var s = readState();
    var total = course.modules.length;
    var count = course.modules.filter(function (m) { return s.done.indexOf(m.n) >= 0; }).length;
    setText($("#rd-progress-text"), count + " / " + total + " modules lus");
    var bar = $("#rd-progress-bar");
    bar.style.width = total ? Math.round((100 * count) / total) + "%" : "0";
    $("#rd-progress").setAttribute("aria-valuenow", String(count));
    $("#rd-progress").setAttribute("aria-valuemax", String(total));
    course.modules.forEach(function (m) {
      var li = $('#rd-toc [data-n="' + m.n + '"]');
      if (li) li.classList.toggle("is-done", s.done.indexOf(m.n) >= 0);
      var btn = $("#m" + m.n + " [data-mark]");
      if (btn) {
        var on = s.done.indexOf(m.n) >= 0;
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        setText($(".btn-label", btn), on ? "Lu ✓" : "Marquer comme lu");
      }
    });
  }

  /* ---------- Rendering ---------- */

  function licenceText() {
    return "Licence personnelle — " + course.buyer.fullName + " — " + course.order.id + ". Usage personnel uniquement.";
  }

  function render(view) {
    course = view;
    course.modules = (view.modules || []).slice().sort(function (a, b) { return a.n - b.n; });
    course.files = view.files || [];
    $("#rd-state").hidden = true;
    $("#rd-layout").hidden = false;
    $("#rd-footer").hidden = false;
    document.title = view.course.title + " — Teranga Pro";

    setText($("#rd-buyer"), view.buyer.fullName);
    $("#rd-licence").hidden = false;
    setText($("#rd-footer-licence"), licenceText());
    setText($("#print-line"), licenceText());
    setText($("#print-diag"), view.buyer.fullName + " · " + view.order.id);
    setText($("#rd-course-title"), view.course.title);
    setText($("#rd-course-sub"), view.course.subtitle || "");
    setText($("#rd-course-meta"), "Édition " + view.course.edition + " · version " + view.course.version + (view.course.updatedAt ? " · mise à jour du " + fmt.date(view.course.updatedAt) : ""));
    setText($("#rd-side-title"), view.course.title);
    $("#rd-receipt").href = TPRO.url.receiptUrl(id, token);
    $("#rd-whatsapp-slot").appendChild(keepLinkBox());

    renderToc();
    var sections = clear($("#rd-sections"));
    course.modules.forEach(function (m, i) {
      sections.appendChild(moduleSection(m, i));
    });
    sections.appendChild(filesSection());
    sections.appendChild(quizSection());
    refreshProgress();
    bindNav();
    var s = readState();
    var target = sectionFromHash() || (s.last ? "m" + s.last : "m" + (course.modules[0] ? course.modules[0].n : 1));
    show(target, false);
  }

  function renderToc() {
    var toc = clear($("#rd-toc"));
    course.modules.forEach(function (m) {
      toc.appendChild(
        el("li", { "data-n": String(m.n) }, [
          el("a", { href: "#m" + m.n, class: "toc-link", "data-section": "m" + m.n }, [
            el("span", { class: "toc-n", text: String(m.n) }),
            el("span", { class: "toc-body" }, [
              el("span", { class: "toc-title", text: m.title }),
              el("span", { class: "toc-min", text: m.minutes + NBSP + "min" })
            ]),
            el("span", { class: "toc-check", "aria-hidden": "true", text: "✓" }),
            el("span", { class: "sr-only toc-done-sr", text: " (lu)" })
          ])
        ])
      );
    });
  }

  function moduleSection(m, index) {
    var art = el("article", { id: "m" + m.n, class: "rd-section rd-module", "aria-labelledby": "m" + m.n + "-label", hidden: true });
    var total = course.modules.length;
    var head = el("header", { class: "module-head" }, [
      el("p", { class: "eyebrow", id: "m" + m.n + "-label" }, ["Module " + m.n + " sur " + total, el("span", { class: "dot", "aria-hidden": "true", text: "·" }), m.minutes + NBSP + "min"])
    ]);
    art.appendChild(head);

    // Demo only: module 1 is the public free module, whose « gratuit/… » links point at the public data file.
    var frag = TPRO.safeHtml(m.html, { allowLocalDownloads: isDemo() && m.n === 1 });
    var holder = el("div", { class: "module-body module" });
    holder.appendChild(frag);
    // Wide tables scroll inside their own box (never the page) and stay announced as tables. The caption is shown
    // above the box (it would be cut at the box edge otherwise) and stays in the table for screen readers.
    $$("table", holder).forEach(function (t) {
      var label = t.caption ? t.caption.textContent : "";
      var box = el("div", { class: "table-wrap", tabindex: "0", role: "region", "aria-label": label || "Tableau" });
      t.parentNode.insertBefore(box, t);
      box.appendChild(t);
      if (label) {
        box.parentNode.insertBefore(el("p", { class: "table-title", "aria-hidden": "true", text: label }), box);
        t.caption.classList.add("sr-only");
      }
    });
    // « Copier le code » on every M block: the method is to paste it into the Advanced Editor.
    $$("pre.m-code", holder).forEach(function (pre) {
      var box = el("div", { class: "code-box" });
      pre.parentNode.insertBefore(box, pre);
      box.appendChild(pre);
      var label = el("span", { class: "btn-label", text: "Copier le code" });
      var b = el("button", { type: "button", class: "code-copy" }, [label]);
      b.addEventListener("click", function () {
        TPRO.copyText(pre.textContent).then(
          function () {
            setText(label, "Copié ✓");
            setTimeout(function () {
              setText(label, "Copier le code");
            }, 2500);
          },
          function () {
            setText(label, "Sélectionnez le code");
          }
        );
      });
      box.appendChild(b);
    });
    var firstEl = holder.firstElementChild;
    var root = firstEl && firstEl.tagName === "SECTION" ? firstEl : holder;
    var lead = root.firstElementChild;
    if (!lead || lead.tagName !== "H2") {
      head.appendChild(el("h2", { class: "module-title", text: m.title }));
    } else {
      // The fragment's own title goes into the header so the eyebrow, title and objectives read as one block.
      head.appendChild(lead);
      lead.classList.add("module-title");
    }
    symWrap($(".module-title", head));
    if (m.objectives && m.objectives.length) {
      head.appendChild(
        el("div", { class: "objectives" }, [
          el("p", { class: "objectives-title", text: "À la fin de ce module, vous saurez" }),
          el("ul", null, m.objectives.map(function (o) { return el("li", { text: o }); }))
        ])
      );
    }
    art.appendChild(holder);

    var files = (m.files || [])
      .map(function (name) {
        return course.files.filter(function (f) { return f.name === name; })[0];
      })
      .filter(Boolean);
    if (files.length) {
      art.appendChild(
        el("aside", { class: "module-files", "aria-label": "Fichiers du module " + m.n }, [
          el("h3", { text: "Fichiers de ce module" }),
          el("ul", { class: "file-list" }, files.map(fileItem))
        ])
      );
    }

    var mark = el("button", { type: "button", class: "btn btn-ghost", "data-mark": "", "aria-pressed": "false" }, [el("span", { class: "btn-label", text: "Marquer comme lu" })]);
    mark.addEventListener("click", function () {
      setDone(m.n, !isDone(m.n));
    });
    var nextM = course.modules[index + 1];
    var next = el("a", { class: "btn btn-primary", href: nextM ? "#m" + nextM.n : "#quiz" }, [
      el("span", { class: "btn-label", text: nextM ? "Module suivant" : "Passer au quiz final" }),
      el("span", { class: "arrow", "aria-hidden": "true", text: "→" })
    ]);
    next.addEventListener("click", function () {
      setDone(m.n, true);
    });
    var printOne = el("button", { type: "button", class: "btn-link", text: "Imprimer ce module" });
    printOne.addEventListener("click", function () {
      doPrint("print-one");
    });
    var printAll = el("button", { type: "button", class: "btn-link", text: "Tout imprimer" });
    printAll.addEventListener("click", function () {
      doPrint("print-all");
    });
    art.appendChild(
      el("footer", { class: "module-actions" }, [
        el("div", { class: "module-actions-main" }, [mark, next]),
        el("div", { class: "module-actions-print" }, [printOne, printAll])
      ])
    );
    return art;
  }

  /** Arrows (→ ↔) drawn with the sans font inside serif titles: many serif fonts lack them. */
  function symWrap(node) {
    if (!node) return;
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    var texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(function (t) {
      var parts = t.nodeValue.split(/([←-⇿])/);
      if (parts.length < 2) return;
      var frag = document.createDocumentFragment();
      parts.forEach(function (p, i) {
        if (!p) return;
        frag.appendChild(i % 2 ? el("span", { class: "sym", text: p }) : document.createTextNode(p));
      });
      t.parentNode.replaceChild(frag, t);
    });
  }

  /* ---------- Downloads ---------- */

  function fileItem(f) {
    var status = el("span", { class: "file-status", role: "status", "aria-live": "polite" });
    var btn = el("button", { type: "button", class: "btn btn-small btn-outline", "data-file": f.name }, [
      el("span", { class: "btn-label", text: "Télécharger" })
    ]);
    btn.addEventListener("click", function () {
      download(f, btn, status);
    });
    var ext = /\.zip$/i.test(f.name) ? "ZIP" : /\.xlsx$/i.test(f.name) ? "XLSX" : /\.csv$/i.test(f.name) ? "CSV" : "";
    return el("li", { class: "file-item" }, [
      el("span", { class: "file-ext ext-" + ext.toLowerCase(), "aria-hidden": "true", text: ext }),
      el("span", { class: "file-body" }, [
        el("span", { class: "file-label", text: f.label }),
        el("span", { class: "file-meta", text: f.name + " · " + fmt.size(f.size) })
      ]),
      btn,
      status
    ]);
  }

  function download(f, btn, status) {
    setText(status, "");
    TPRO.dom.busy(btn, true, "Préparation…");
    var u = TPRO.api.base() + "/orders/" + encodeURIComponent(id) + "/files/" + encodeURIComponent(f.name) + "?t=" + encodeURIComponent(token);
    fetch(u, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (txt) {
            var data = null;
            try {
              data = JSON.parse(txt);
            } catch (e) {
              data = null;
            }
            throw new Error((data && data.message) || (res.status === 429 ? "Vous avez atteint la limite de 30 téléchargements sur 24 heures. Réessayez demain." : "Téléchargement impossible. Réessayez dans un instant."));
          });
        }
        return res.blob();
      })
      .then(function (blob) {
        var objectUrl = URL.createObjectURL(blob);
        var a = el("a", { href: objectUrl, download: f.name, class: "offscreen" });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () {
          URL.revokeObjectURL(objectUrl);
        }, 1500);
        TPRO.dom.busy(btn, false);
        setText(status, "Téléchargé");
      })
      .catch(function (err) {
        TPRO.dom.busy(btn, false);
        setText(status, err && err.message && !/fetch|network/i.test(err.message) ? err.message : "Connexion impossible. Vérifiez votre connexion internet puis réessayez.");
        status.classList.add("is-error");
      });
  }

  function filesSection() {
    var sec = el("section", { id: "fichiers", class: "rd-section", "aria-labelledby": "fichiers-title", hidden: true }, [
      el("header", { class: "module-head" }, [
        el("p", { class: "eyebrow", text: "Ressources" }),
        el("h2", { id: "fichiers-title", class: "module-title", text: "Fichiers à télécharger" }),
        el("p", { class: "lede", text: "Les classeurs d'exercices et les données fictives de chaque module. Chaque fichier est marqué à votre nom (licence personnelle : ne le partagez pas)." })
      ])
    ]);
    var groups = {};
    var order = [];
    course.files.forEach(function (f) {
      var k = f.module == null ? "all" : String(f.module);
      if (!groups[k]) {
        groups[k] = [];
        order.push(k);
      }
      groups[k].push(f);
    });
    order.sort(function (a, b) {
      return (a === "all" ? 999 : Number(a)) - (b === "all" ? 999 : Number(b));
    });
    if (!order.length) sec.appendChild(el("p", { class: "muted", text: "Aucun fichier pour le moment." }));
    order.forEach(function (k) {
      var m = course.modules.filter(function (x) { return String(x.n) === k; })[0];
      sec.appendChild(el("h3", { class: "files-group", text: k === "all" ? "Toute la formation" : "Module " + k + (m ? " — " + m.title : "") }));
      sec.appendChild(el("ul", { class: "file-list" }, groups[k].map(fileItem)));
    });
    sec.appendChild(el("p", { class: "hint", text: "30 téléchargements par 24 heures au plus. Les fichiers s'ouvrent avec Excel 2016 ou plus récent, ou Microsoft 365." }));
    return sec;
  }

  /* ---------- Quiz & attestation ---------- */

  function quizKey() {
    return "tpro:quiz:" + id;
  }

  function attestationBox(att) {
    var box = el("div", { class: "attest-box", id: "attest-box" });
    if (!att) {
      box.hidden = true;
      return box;
    }
    fillAttestation(box, att);
    return box;
  }

  function fillAttestation(box, att) {
    clear(box);
    box.hidden = false;
    var links = el("p", { class: "attest-links" }, [
      el("a", { class: "btn btn-primary", href: TPRO.url.attestationUrl(id, token) }, [el("span", { class: "btn-label", text: "Voir et imprimer mon attestation" })])
    ]);
    if (att.publicListing) {
      links.appendChild(el("a", { class: "btn btn-ghost", href: TPRO.url.publicAttestationUrl(att.code), target: "_blank", rel: "noopener" }, [el("span", { class: "btn-label", text: "Page publique de vérification" })]));
    }
    box.appendChild(el("div", { class: "attest-seal", "aria-hidden": "true" }, [sealSvg()]));
    box.appendChild(
      el("div", { class: "attest-body" }, [
        el("p", { class: "attest-title", text: "Attestation de suivi obtenue" }),
        el("p", null, [
          att.passedAt ? "Quiz réussi le " + fmt.longDate(att.passedAt) : "Quiz réussi",
          att.score != null ? " (meilleur score : " + fmt.percent(att.score) + ")." : "."
        ]),
        el("p", null, ["Code de vérification : ", el("code", { class: "code", text: att.code })]),
        el("p", { class: "muted small", text: att.publicListing ? "Votre attestation est visible sur la page publique de vérification (nom, formation, date)." : "Vérification publique désactivée : votre attestation n'apparaît pas sur la page publique." }),
        links
      ])
    );
  }

  function sealSvg() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 48 48");
    var c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", "24");
    c.setAttribute("cy", "24");
    c.setAttribute("r", "21");
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", "currentColor");
    c.setAttribute("stroke-width", "2");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M15 24.5l6 6 12-13");
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "3");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    svg.appendChild(c);
    svg.appendChild(p);
    return svg;
  }

  function quizSection() {
    var qz = course.quiz || { passPercent: 70, questions: [] };
    var att = course.attestation || null;
    var saved = TPRO.store.get(quizKey(), {}) || {};
    var sec = el("section", { id: "quiz", class: "rd-section", "aria-labelledby": "quiz-title", hidden: true });
    sec.appendChild(
      el("header", { class: "module-head" }, [
        el("p", { class: "eyebrow", text: "Évaluation finale" }),
        el("h2", { id: "quiz-title", class: "module-title", text: "Quiz final et attestation" }),
        el("p", {
          class: "lede",
          text:
            qz.questions.length + " questions à choix multiple. Avec au moins " + qz.passPercent + NBSP + "% de bonnes réponses, vous obtenez une attestation de suivi (non diplômante). 10 tentatives par 24 heures."
        })
      ])
    );
    var attBox = attestationBox(att);
    sec.appendChild(attBox);

    var form = el("form", { id: "quiz-form", class: "quiz-form", novalidate: true });
    qz.questions.forEach(function (question, i) {
      var fs = el("fieldset", { class: "quiz-q", "data-q": question.id });
      fs.appendChild(el("legend", null, [el("span", { class: "quiz-n", text: String(i + 1) }), el("span", { class: "quiz-text", text: question.text })]));
      var choices = el("div", { class: "quiz-choices" });
      question.choices.forEach(function (choice, j) {
        var inputId = "quiz-" + question.id + "-" + j;
        var radio = el("input", { type: "radio", name: question.id, value: String(j), id: inputId });
        if (saved[question.id] === j) radio.checked = true;
        choices.appendChild(el("label", { class: "quiz-choice", for: inputId }, [radio, el("span", { text: choice })]));
      });
      fs.appendChild(choices);
      form.appendChild(fs);
    });
    form.addEventListener("change", function (e) {
      var t = e.target;
      if (!t || t.type !== "radio") return;
      var answers = TPRO.store.get(quizKey(), {}) || {};
      answers[t.name] = Number(t.value);
      TPRO.store.set(quizKey(), answers);
      var fs = t.closest("fieldset");
      if (fs) fs.classList.remove("is-missing");
    });
    var publicBox = el("input", { type: "checkbox", id: "quiz-public", name: "publicListing" });
    if (att && att.publicListing) publicBox.checked = true;
    form.appendChild(
      el("div", { class: "check check-card" }, [
        publicBox,
        el("label", { for: "quiz-public", text: "Afficher mon attestation sur la page publique de vérification (nom, formation, date)" })
      ])
    );
    var submit = el("button", { type: "submit", class: "btn btn-primary btn-lg" }, [el("span", { class: "btn-label", text: "Envoyer mes réponses" })]);
    var status = el("p", { class: "form-status", role: "alert" });
    form.appendChild(el("div", { class: "quiz-submit" }, [submit, status]));
    var result = el("div", { id: "quiz-result", class: "quiz-result", tabindex: "-1", role: "status", hidden: true });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      setText(status, "");
      var answers = {};
      var missing = [];
      qz.questions.forEach(function (question) {
        var picked = form.querySelector('input[name="' + question.id + '"]:checked');
        answers[question.id] = picked ? Number(picked.value) : null;
        var fs = form.querySelector('[data-q="' + question.id + '"]');
        if (fs) fs.classList.toggle("is-missing", !picked);
        if (!picked) missing.push(question.id);
      });
      if (missing.length) {
        setText(status, missing.length === 1 ? "Il reste une question sans réponse." : "Il reste " + missing.length + " questions sans réponse.");
        var first = form.querySelector('[data-q="' + missing[0] + '"] input');
        if (first) first.focus();
        return;
      }
      TPRO.dom.busy(submit, true, "Correction…");
      api("POST", "/quiz", { t: token, answers: answers, publicListing: !!publicBox.checked }).then(
        function (res) {
          TPRO.dom.busy(submit, false);
          showResult(result, res, !!publicBox.checked, attBox);
        },
        function (err) {
          TPRO.dom.busy(submit, false);
          setText(status, (err.fields && err.fields.answers) || err.message);
        }
      );
    });
    sec.appendChild(form);
    sec.appendChild(result);
    return sec;
  }

  function showResult(box, res, listed, attBox) {
    clear(box);
    box.hidden = false;
    var pass = res.passPercent || 70;
    if (res.passed) {
      TPRO.store.remove(quizKey());
      box.className = "quiz-result is-pass";
      box.appendChild(el("p", { class: "quiz-result-title", text: "Bravo ! Score : " + fmt.percent(res.score) + ". Votre attestation de suivi est prête." }));
      box.appendChild(el("p", null, ["Code de vérification : ", el("code", { class: "code", id: "quiz-code", text: res.code })]));
      var links = el("p", { class: "attest-links" }, [
        el("a", { class: "btn btn-primary", href: TPRO.url.attestationUrl(id, token) }, [el("span", { class: "btn-label", text: "Voir et imprimer mon attestation" })])
      ]);
      if (listed) {
        links.appendChild(el("a", { class: "btn btn-ghost", id: "quiz-public-link", href: TPRO.url.publicAttestationUrl(res.code), target: "_blank", rel: "noopener" }, [el("span", { class: "btn-label", text: "Page publique de vérification" })]));
      }
      box.appendChild(links);
      var prev = course.attestation;
      course.attestation = {
        code: res.code,
        passedAt: prev && prev.passedAt ? prev.passedAt : new Date().toISOString(),
        score: prev ? Math.max(prev.score || 0, res.score) : res.score,
        publicListing: listed
      };
      fillAttestation(attBox, course.attestation);
    } else {
      box.className = "quiz-result is-fail";
      box.appendChild(
        el("p", {
          class: "quiz-result-title",
          text:
            "Score : " + fmt.percent(res.score) + ". Il faut au moins " + pass + NBSP + "% pour obtenir l'attestation. Relisez les modules puis réessayez (10 tentatives par 24 heures)."
        })
      );
    }
    box.focus();
  }

  /* ---------- Keep the link (WhatsApp self-send) ---------- */

  function readerAbsoluteUrl() {
    return window.location.origin + window.location.pathname + "?o=" + encodeURIComponent(id) + "&t=" + encodeURIComponent(token);
  }

  function keepLinkBox() {
    var text = "Mon accès personnel à la formation « Power Query pour le reporting bancaire » (Teranga Pro) : " + readerAbsoluteUrl();
    return el("div", { class: "keep-link" }, [
      el("a", { class: "btn btn-whatsapp btn-block", "data-whatsapp-self": "", href: TPRO.whatsappSelfLink(text), target: "_blank", rel: "noopener noreferrer" }, [
        chatIcon(),
        el("span", { class: "btn-label", text: "Envoyer ce lien sur mon WhatsApp" })
      ]),
      el("p", { class: "hint", text: "Ce lien est personnel : ne le transférez à personne." })
    ]);
  }

  /** Generic chat bubble (no third-party logo). */
  function chatIcon() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "ico-chat");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M12 3.5a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.4-1.1A8.5 8.5 0 1 0 12 3.5z");
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.8");
    p.setAttribute("stroke-linejoin", "round");
    var d = document.createElementNS(ns, "path");
    d.setAttribute("d", "M8.5 10.5h7M8.5 13.5h4.5");
    d.setAttribute("stroke", "currentColor");
    d.setAttribute("stroke-width", "1.8");
    d.setAttribute("stroke-linecap", "round");
    svg.appendChild(p);
    svg.appendChild(d);
    return svg;
  }

  /* ---------- Navigation & drawer ---------- */

  function validSections() {
    var ids = course.modules.map(function (m) { return "m" + m.n; });
    ids.push("fichiers", "quiz");
    return ids;
  }

  function sectionFromHash() {
    var h = String(window.location.hash || "").replace(/^#/, "");
    return validSections().indexOf(h) >= 0 ? h : null;
  }

  function show(sectionId, focus) {
    if (validSections().indexOf(sectionId) < 0) sectionId = validSections()[0];
    current = sectionId;
    $$("#rd-sections > .rd-section").forEach(function (s) {
      var on = s.id === sectionId;
      s.hidden = !on;
      s.classList.toggle("is-current", on);
    });
    $$("#rd-side [data-section]").forEach(function (a) {
      if (a.getAttribute("data-section") === sectionId) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    var m = /^m(\d+)$/.exec(sectionId);
    if (m) {
      var s = readState();
      s.last = Number(m[1]);
      saveRead(s);
    }
    closeDrawer(false);
    window.scrollTo(0, 0);
    if (focus) {
      var h = $("#" + sectionId + " .module-title");
      if (h) {
        h.setAttribute("tabindex", "-1");
        h.focus({ preventScroll: true });
      }
    }
  }

  function bindNav() {
    window.addEventListener("hashchange", function () {
      var s = sectionFromHash();
      if (s) show(s, true);
    });
    var menu = $("#rd-menu");
    menu.hidden = false;
    menu.addEventListener("click", function () {
      if (document.body.classList.contains("drawer-open")) closeDrawer(true);
      else openDrawer();
    });
    $("#rd-scrim").addEventListener("click", function () {
      closeDrawer(true);
    });
    $("#rd-close").addEventListener("click", function () {
      closeDrawer(true);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("drawer-open")) closeDrawer(true);
    });
    $$("#rd-side a[href^='#']").forEach(function (a) {
      a.addEventListener("click", function () {
        // Same hash clicked again: hashchange does not fire, close the drawer anyway.
        if (a.getAttribute("href") === window.location.hash) show(a.getAttribute("href").slice(1), true);
      });
    });
  }

  function openDrawer() {
    document.body.classList.add("drawer-open");
    $("#rd-menu").setAttribute("aria-expanded", "true");
    var cur = $("#rd-side [aria-current]") || $("#rd-side a");
    if (cur) cur.focus();
  }

  function closeDrawer(returnFocus) {
    if (!document.body.classList.contains("drawer-open")) return;
    document.body.classList.remove("drawer-open");
    $("#rd-menu").setAttribute("aria-expanded", "false");
    if (returnFocus) $("#rd-menu").focus();
  }

  /* ---------- Print ---------- */

  // Solutions are printed open (buttons or Ctrl+P); the ones the reader had closed are closed again afterwards.
  var closedForPrint = [];
  window.addEventListener("beforeprint", function () {
    closedForPrint = $$("#rd-sections details:not([open])");
    closedForPrint.forEach(function (d) {
      d.open = true;
    });
  });
  window.addEventListener("afterprint", function () {
    closedForPrint.forEach(function (d) {
      d.open = false;
    });
    closedForPrint = [];
    document.body.classList.remove("print-one", "print-all");
  });

  function doPrint(mode) {
    document.body.classList.remove("print-one", "print-all");
    document.body.classList.add(mode);
    window.print();
  }

  // Back from the Wave app: check at once instead of waiting for the next tick.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && polling && pollTimer) {
      stopPolling();
      loadOrder();
    }
  });

  start();
})();
