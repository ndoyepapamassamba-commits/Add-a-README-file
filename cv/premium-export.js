// resultat.html for a CV Premium order: the paid « Prestige » CV with a colour switcher, the photo (kept on
// this phone, or added here), in-place corrections, and the downloads: PDF (two A4 pages at most, one PDF
// page per sheet), Word (.doc built from the document data) and « CV web (.html) » (one self-contained file).
// result.js calls TCV.premiumResult.mount() / .preview(). Nothing here sends the photo anywhere.
(function () {
  "use strict";

  var TCV = window.TCV;
  var P = window.TCVPremium;
  var R = window.TCVRender;
  var $$ = TCV.dom.$$;
  var el = TCV.dom.el;
  var setText = TCV.dom.setText;

  var FONTS_CSS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Manrope:wght@400;500;600;700;800&display=swap";

  /* ---------- Web fonts (result page only; system fonts are the fallback) ---------- */

  function loadFonts() {
    if (document.getElementById("pcv-fonts")) return;
    document.head.appendChild(el("link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "anonymous" }));
    document.head.appendChild(el("link", { id: "pcv-fonts", rel: "stylesheet", href: FONTS_CSS }));
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /** Resolves once the document fonts are usable (or after `ms`, offline: the system fonts are used). */
  function fontsReady(ms) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var loads = ["600 40px 'Cormorant Garamond'", "italic 500 20px 'Cormorant Garamond'", "700 40px 'Cormorant Garamond'", "400 12px Manrope", "700 12px Manrope", "800 12px Manrope"].map(function (f) {
      return document.fonts.load(f).catch(function () { return []; });
    });
    return Promise.race([Promise.all(loads).then(function () { return document.fonts.ready; }), wait(ms || 4000)]);
  }

  /* ---------- Files ---------- */

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function fileName(cv, ext) {
    return "CV-Premium-" + TCV.fmt.fileBase(cv && cv.fullName) + "." + ext;
  }

  /* ---------- PDF: one PDF page per sheet, so the layout can never spill onto a third page ---------- */

  function exportPdf(page, filename) {
    return Promise.all([window.TCVExport.loadHtml2pdf(), fontsReady(4000)]).then(function (r) {
      var html2pdf = r[0];
      R.fit(page);
      var accent = page.getAttribute("data-accent") || "marine";
      var sheets = $$(".pcv-sheet", page).map(function (sheet) {
        // Each sheet keeps its .pcv root (colours and rules), without the screen-only page frame.
        var wrap = document.createElement("article");
        wrap.className = "pcv pcv--" + accent + " pcv-exporting" + (page.classList.contains("is-single") ? " is-single" : "");
        wrap.setAttribute("lang", "fr");
        var copy = sheet.cloneNode(true);
        $$("[contenteditable]", copy).forEach(function (n) { n.removeAttribute("contenteditable"); });
        wrap.appendChild(copy);
        return wrap;
      });
      var opt = {
        margin: 0,
        filename: filename,
        image: { type: "jpeg", quality: 0.97 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false, scrollX: 0, scrollY: 0 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true }
      };
      var worker = html2pdf().set(opt).from(sheets[0]).toPdf();
      sheets.slice(1).forEach(function (wrap) {
        worker = worker.get("pdf").then(function (pdf) { pdf.addPage(); }).from(wrap).toContainer().toCanvas().toPdf();
      });
      return worker.save();
    });
  }

  /* ---------- « CV web (.html) »: one standalone file, inline CSS, photo embedded, no script ---------- */

  var rawCss = null; // document part of premium.css, exactly as written (fetched once on mount)

  function prefetchCss() {
    if (rawCss !== null || !window.fetch) return;
    var link = $$('link[rel="stylesheet"]').filter(function (l) { return /premium\.css(\?|$)/.test(l.href); })[0];
    if (!link) return;
    fetch(link.href, { cache: "force-cache" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (text) {
        var doc = text.split(/\/\*\s*=+\s*\n\s*Site:/)[0];
        if (doc.indexOf(".pcv") !== -1) rawCss = doc;
      })
      .catch(function () { /* the CSSOM copy below is used instead */ });
  }

  /** Every rule of premium.css that styles the document (.pcv…). */
  function documentCss() {
    if (rawCss) return rawCss;
    // Fallback: the loaded stylesheet (CSSOM serialisation; rules are written so it stays faithful).
    var out = [];
    Array.prototype.forEach.call(document.styleSheets, function (sheet) {
      if (!/premium\.css(\?|$)/.test(sheet.href || "")) return;
      var rules;
      try {
        rules = sheet.cssRules;
      } catch (e) {
        return;
      }
      Array.prototype.forEach.call(rules, function (rule) {
        if (rule.cssText.indexOf(".pcv") !== -1) out.push(rule.cssText);
      });
    });
    return out.join("\n");
  }

  var WEB_CSS = [
    "html{-webkit-text-size-adjust:100%;text-size-adjust:100%}",
    "body{margin:0;padding:28px 14px 40px;background:#e8edf0}",
    "@page{size:A4;margin:0}",
    "@media (max-width:760px){body{padding:10px 8px 24px}}",
    "@media print{body{padding:0;background:#fff}}"
  ].join("\n");

  function webHtml(page, cv) {
    var out = document.implementation.createHTMLDocument("");
    out.documentElement.setAttribute("lang", "fr");
    var head = out.head;
    function meta(attrs) {
      var m = out.createElement("meta");
      Object.keys(attrs).forEach(function (k) { m.setAttribute(k, attrs[k]); });
      head.appendChild(m);
    }
    meta({ charset: "utf-8" });
    meta({ name: "viewport", content: "width=device-width, initial-scale=1" });
    meta({ name: "robots", content: "noindex, nofollow" });
    meta({ name: "referrer", content: "no-referrer" });
    var title = out.createElement("title");
    title.textContent = (cv.fullName || "CV") + " — CV";
    head.appendChild(title);
    var fonts = out.createElement("link");
    fonts.setAttribute("rel", "stylesheet");
    fonts.setAttribute("href", FONTS_CSS);
    head.appendChild(fonts);
    var style = out.createElement("style");
    style.textContent = WEB_CSS + "\n" + documentCss();
    head.appendChild(style);

    var copy = page.cloneNode(true);
    $$(".tcv-lock", copy).forEach(function (n) { n.parentNode.removeChild(n); });
    $$("[contenteditable], [data-path], [spellcheck]", copy).forEach(function (n) {
      n.removeAttribute("contenteditable");
      n.removeAttribute("data-path");
      n.removeAttribute("spellcheck");
    });
    copy.classList.remove("tcv-page", "is-preview");
    copy.classList.add("pcv-web");
    copy.removeAttribute("data-kind");
    var main = out.createElement("main");
    main.appendChild(out.importNode(copy, true));
    out.body.appendChild(main);
    return "<!doctype html>\n" + out.documentElement.outerHTML;
  }

  /* ---------- Word (.doc): tables and inline styles Word understands, built from the data ---------- */

  var WORD_HEAD =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="utf-8"><meta name="ProgId" content="Word.Document"><title>CV</title>' +
    "<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->" +
    "<style>@page WordSection1{size:21cm 29.7cm;margin:1.3cm 1.4cm 1.3cm 1.4cm;mso-page-orientation:portrait}" +
    "div.WordSection1{page:WordSection1}p,h1,h2,h3{margin:0}table{border-collapse:collapse}td{vertical-align:top}</style></head>";

  function blank(s) {
    return typeof s !== "string" || !s.trim();
  }

  function items(list) {
    return (Array.isArray(list) ? list : []).filter(function (x) { return x != null; });
  }

  function wordHtml(cv) {
    var pm = cv.premium || {};
    var a = P.accentOf(pm.accent);
    var out = document.implementation.createHTMLDocument("");
    var SANS = "font-family:Calibri,Arial,sans-serif;";
    var SERIF = "font-family:Georgia,'Times New Roman',serif;";
    /** "margin:4pt 0 2pt" → four longhands: some importers (LibreOffice) ignore the shorthand. */
    function longhands(style) {
      return style.replace(/(^|;)\s*margin\s*:\s*([^;]+)/g, function (m, lead, value) {
        var v = value.trim().split(/\s+/);
        var t = v[0], r = v[1] || t, b = v[2] || t, l = v[3] || r;
        return lead + "margin-top:" + t + ";margin-right:" + r + ";margin-bottom:" + b + ";margin-left:" + l;
      });
    }
    function E(tag, style, text) {
      var n = out.createElement(tag);
      // Word and LibreOffice add their own paragraph spacing unless every paragraph says otherwise.
      if (tag === "p" || tag === "li") style = "margin:0;" + (style || "");
      if (style) n.setAttribute("style", longhands(style));
      if (text != null) n.textContent = text;
      return n;
    }
    function table() {
      var t = E("table", "width:100%;border-collapse:collapse");
      t.setAttribute("width", "100%");
      t.setAttribute("cellspacing", "0");
      t.setAttribute("cellpadding", "0");
      return t;
    }
    function row(t) {
      var tr = E("tr");
      t.appendChild(tr);
      return tr;
    }
    function cell(tr, style, width, bg) {
      var td = E("td", "vertical-align:top;" + (style || "") + (bg ? ";background:" + bg : ""));
      if (width) td.setAttribute("width", width);
      if (bg) td.setAttribute("bgcolor", bg);
      td.setAttribute("valign", "top");
      tr.appendChild(td);
      return td;
    }
    function spacer(pt) {
      return E("p", "font-size:" + pt + "pt;line-height:" + pt + "pt", " ");
    }
    function heading(tag, title) {
      var p = E("p", "margin:14pt 0 7pt;padding-bottom:3pt;border-bottom:1.5pt solid " + a.hi);
      p.appendChild(E("span", SANS + "font-size:8pt;font-weight:bold;letter-spacing:2pt;color:" + a.mid, tag.toUpperCase() + "\u00a0\u00a0\u00a0"));
      p.appendChild(E("span", SERIF + "font-size:15pt;font-weight:bold;color:#15262d", title));
      return p;
    }
    var root = E("div", SANS + "font-size:10pt;color:#1f2f36");
    root.className = "WordSection1";

    // Header band
    var head = table();
    var hd = cell(row(head), "padding:16pt 18pt 14pt", "100%", a.dark);
    if (!blank(cv.title)) hd.appendChild(E("p", SANS + "font-size:8pt;font-weight:bold;letter-spacing:1.5pt;color:" + a.hi2, cv.title.toUpperCase()));
    hd.appendChild(E("p", SERIF + "font-size:26pt;font-weight:bold;color:#ffffff;margin-top:3pt", cv.fullName || ""));
    if (!blank(pm.headline)) hd.appendChild(E("p", SANS + "font-size:11.5pt;font-weight:bold;color:#ffffff;margin-top:6pt", pm.headline));
    var contacts = items(cv.contacts).filter(function (c) { return !blank(c); });
    if (contacts.length) hd.appendChild(E("p", SANS + "font-size:9pt;color:#e3edf1;margin-top:8pt", contacts.join("   ·   ")));
    root.appendChild(head);
    var figs = items(pm.keyFigures).filter(function (k) { return !blank(k.value) || !blank(k.label); });
    if (figs.length) {
      var ft = table();
      var fr = row(ft);
      figs.forEach(function (k) {
        var td = cell(fr, "padding:8pt 10pt 10pt;border-top:1pt solid " + a.dark, Math.floor(100 / figs.length) + "%", a.mid);
        td.appendChild(E("p", SANS + "font-size:17pt;font-weight:bold;color:#ffffff", k.value || ""));
        if (!blank(k.label)) td.appendChild(E("p", SANS + "font-size:8pt;color:#e3edf1;margin-top:3pt", k.label));
      });
      root.appendChild(ft);
    }

    // Profile
    var domains = items(pm.domains).filter(function (d) { return !blank(d.title); });
    if (!blank(pm.quote) || !blank(cv.profile) || domains.length) {
      root.appendChild(heading("À propos", "Profil professionnel"));
      if (!blank(pm.quote)) root.appendChild(E("p", SERIF + "font-size:12.5pt;font-style:italic;color:#15262d;margin-bottom:5pt", pm.quote));
      if (!blank(cv.profile)) root.appendChild(E("p", SANS + "font-size:10pt;line-height:140%", cv.profile));
      if (domains.length) {
        root.appendChild(spacer(5));
        var dt = table();
        var dr = row(dt);
        domains.forEach(function (d, i) {
          var td = cell(dr, "padding:6pt 8pt;border-left:" + (i ? "4pt solid #ffffff" : "0"), Math.floor(100 / domains.length) + "%", a.tint);
          td.appendChild(E("p", SANS + "font-size:10pt;font-weight:bold;color:" + a.dark, d.title));
          if (!blank(d.detail)) td.appendChild(E("p", SANS + "font-size:9pt;color:#44585f;margin-top:2pt", d.detail));
        });
        root.appendChild(dt);
      }
    }

    // Achievements, two per row
    var achs = items(pm.achievements).filter(function (x) { return !blank(x.title); });
    if (achs.length) {
      root.appendChild(heading("Résultats", "Réalisations marquantes"));
      var at = table();
      var ar = null;
      achs.forEach(function (x, i) {
        if (i % 2 === 0) {
          if (i) {
            var gap = row(at);
            cell(gap, "font-size:5pt;line-height:5pt", null).textContent = " ";
          }
          ar = row(at);
        }
        var td = cell(ar, "padding:6pt 9pt 7pt;border-left:3pt solid " + a.mid + ";border-top:.75pt solid #d5e0e5;border-bottom:.75pt solid #d5e0e5;border-right:.75pt solid #d5e0e5", "50%");
        td.appendChild(E("p", SANS + "font-size:10.5pt;font-weight:bold;color:" + a.dark, x.title));
        if (!blank(x.detail)) td.appendChild(E("p", SANS + "font-size:9pt;color:#44585f;margin-top:2pt", x.detail));
        var tags = items(x.tags).filter(function (t) { return !blank(t); });
        if (tags.length) td.appendChild(E("p", SANS + "font-size:8pt;font-weight:bold;color:" + a.mid + ";margin-top:4pt", tags.join("  ·  ")));
      });
      if (achs.length % 2) cell(ar, "", "50%").textContent = " ";
      root.appendChild(at);
    }

    var br = E("br");
    br.setAttribute("clear", "all");
    br.setAttribute("style", "page-break-before:always;mso-break-type:page-break");
    root.appendChild(br);

    // Timeline
    var exps = items(cv.experiences).filter(function (e) { return !blank(e.title); });
    if (exps.length) {
      root.appendChild(heading("Parcours", "Expérience professionnelle"));
      var et = table();
      exps.forEach(function (e) {
        var tr = row(et);
        cell(tr, "padding:2pt 10pt 8pt 0;border-right:1.5pt solid " + a.hi, "17%").appendChild(E("p", SANS + "font-size:9pt;font-weight:bold;color:" + a.mid + ";text-align:right", e.period || ""));
        var td = cell(tr, "padding:2pt 0 8pt 10pt", "83%");
        td.appendChild(E("p", SANS + "font-size:10.5pt;font-weight:bold;color:#15262d", e.title));
        var org = [e.company, e.place].filter(function (s) { return !blank(s); }).join(" · ");
        if (org) td.appendChild(E("p", SANS + "font-size:8pt;font-weight:bold;letter-spacing:.8pt;color:#6b8088;margin-top:1pt", org.toUpperCase()));
        var bullets = items(e.bullets).filter(function (b) { return !blank(b); });
        if (bullets.length) {
          var ul = E("ul", "margin:3pt 0 0 14pt;padding:0");
          bullets.forEach(function (b) { ul.appendChild(E("li", SANS + "font-size:9.5pt;color:#34474e;margin:0 0 1.5pt", b)); });
          td.appendChild(ul);
        }
      });
      root.appendChild(et);
    }

    // Skills with levels
    var levels = items(pm.skillLevels).filter(function (s) { return !blank(s.name); });
    var tools = items(cv.it).concat(items(cv.skills)).filter(function (s) {
      return !blank(s) && !levels.some(function (l) { return l.name.toLowerCase() === s.toLowerCase(); });
    });
    if (levels.length || tools.length) {
      root.appendChild(heading("Atouts", "Outils et compétences"));
      if (levels.length) {
        var lt = table();
        levels.forEach(function (s) {
          var tr = row(lt);
          cell(tr, "padding:1.5pt 8pt 1.5pt 0", "45%").appendChild(E("p", SANS + "font-size:10pt;font-weight:bold", s.name));
          var dots = { Expert: 4, "Avancé": 3, Bon: 2, Notions: 1 }[s.level] || 2;
          var lv = E("p", SANS + "font-size:9pt;color:#6b8088");
          // A dot scale reads the same in Word, LibreOffice and Google Docs (table bars do not).
          lv.appendChild(E("span", "font-size:10pt;letter-spacing:1pt;color:" + a.mid, "●●●●".slice(0, dots)));
          lv.appendChild(E("span", "font-size:10pt;letter-spacing:1pt;color:#cfd9dd", "●●●●".slice(dots)));
          lv.appendChild(out.createTextNode("\u00a0\u00a0" + (s.level || "")));
          cell(tr, "padding:1.5pt 0", "55%").appendChild(lv);
        });
        root.appendChild(lt);
      }
      if (tools.length) root.appendChild(E("p", SANS + "font-size:9.5pt;margin-top:5pt", tools.join("  ·  ")));
    }

    // Education
    var edu = items(cv.education).filter(function (e) { return !blank(e.degree); });
    if (edu.length) {
      root.appendChild(heading("Parcours", "Formation"));
      var edt = table();
      edu.forEach(function (e) {
        var tr = row(edt);
        cell(tr, "padding:2pt 0 5pt 0", "15%").appendChild(E("p", SANS + "font-size:9pt;font-weight:bold;color:" + a.mid + ";text-align:right", e.year || ""));
        cell(tr, "", "3%").appendChild(E("p", "font-size:6pt", "\u00a0"));
        var td = cell(tr, "padding:2pt 0 5pt 0", "82%");
        td.appendChild(E("p", SANS + "font-size:10pt;font-weight:bold", e.degree));
        var sub = [e.school, e.detail].filter(function (s) { return !blank(s); }).join(" · ");
        if (sub) td.appendChild(E("p", SANS + "font-size:9pt;color:#44585f", sub));
      });
      root.appendChild(edt);
    }

    // Languages, qualities, personal lines, interests
    var langs = items(cv.languages).filter(function (l) { return !blank(l.name); });
    var quals = items(pm.qualities).filter(function (q) { return !blank(q); });
    var personal = items(pm.personal).filter(function (q) { return !blank(q); });
    var interests = items(cv.interests).filter(function (q) { return !blank(q); });
    if (langs.length || quals.length || personal.length || interests.length) {
      root.appendChild(heading("Atouts", langs.length ? "Langues et savoir-être" : "Savoir-être"));
      var kt = table();
      langs.forEach(function (l) {
        var tr = row(kt);
        cell(tr, "padding:1.5pt 8pt 1.5pt 0", "25%").appendChild(E("p", SANS + "font-size:9.5pt;color:#6b8088", l.name));
        cell(tr, "padding:1.5pt 0", "75%").appendChild(E("p", SANS + "font-size:9.5pt;font-weight:bold", l.level || ""));
      });
      personal.forEach(function (line) {
        var at2 = line.indexOf(" : ");
        var tr = row(kt);
        cell(tr, "padding:1.5pt 8pt 1.5pt 0", "25%").appendChild(E("p", SANS + "font-size:9.5pt;color:#6b8088", at2 > 0 ? line.slice(0, at2) : ""));
        cell(tr, "padding:1.5pt 0", "75%").appendChild(E("p", SANS + "font-size:9.5pt;font-weight:bold", at2 > 0 ? line.slice(at2 + 3) : line));
      });
      if (interests.length) {
        var ir = row(kt);
        cell(ir, "padding:1.5pt 8pt 1.5pt 0", "25%").appendChild(E("p", SANS + "font-size:9.5pt;color:#6b8088", "Intérêts"));
        cell(ir, "padding:1.5pt 0", "75%").appendChild(E("p", SANS + "font-size:9.5pt;font-weight:bold", interests.join(", ")));
      }
      if (kt.childNodes.length) root.appendChild(kt);
      if (quals.length) root.appendChild(E("p", SANS + "font-size:9.5pt;font-weight:bold;color:" + a.mid + ";margin-top:5pt", quals.join("  ·  ")));
    }
    return WORD_HEAD + '<body lang="FR">' + root.outerHTML + "</body></html>";
  }

  /* ---------- Result page ---------- */

  function actionButton(cls, label, act) {
    return el("button", { type: "button", class: "btn " + cls, "data-act": act }, [el("span", { class: "btn-label", text: label })]);
  }

  /**
   * Mounts the CV Premium card. ctx = { root, id, doc: () => current Document, onEdit(path, value) } — onEdit
   * is result.js's (it saves corrections on this phone). Returns { view, render }.
   */
  function mount(ctx) {
    loadFonts();
    prefetchCss();
    var id = ctx.id;
    var photo = P.photo.get(id);
    var status = el("p", { class: "status", role: "status", "aria-live": "polite" });
    var accentSeg = el("div", { class: "seg", role: "radiogroup", "aria-labelledby": "pr-accent-label" });
    var photoText = el("p");
    var photoInput = el("input", { type: "file", accept: "image/*", class: "pw-file", tabindex: "-1", "aria-hidden": "true" });
    var photoBtn = el("button", { type: "button", class: "btn btn-secondary btn-sm" }, [el("span", { class: "btn-label", text: "Ajouter ma photo" })]);
    var photoRemove = el("button", { type: "button", class: "btn-danger-link", text: "Retirer la photo" });
    var photoError = el("p", { class: "field-error", role: "alert" });
    var zoom = el("button", { type: "button", class: "btn btn-ghost btn-sm zoom-btn", "aria-pressed": "false", text: "Agrandir pour corriger" });
    var actions = el("div", { class: "doc-actions" }, [
      actionButton("btn-primary", "Télécharger PDF", "pdf"),
      actionButton("btn-secondary", "Télécharger Word", "word"),
      actionButton("btn-secondary", "CV web (.html)", "html"),
      actionButton("btn-secondary", "Imprimer", "print")
    ]);
    var frameParent = el("div");
    var long = el("p", { class: "banner banner-warn pr-long", role: "status", hidden: true }, [
      el("strong", { text: "Votre CV dépasse deux pages. " }),
      "Pour qu'il tienne sur deux pages, raccourcissez quelques missions ou réalisations : touchez un texte du CV pour le corriger."
    ]);
    frameParent.addEventListener("pcv:fit", function (e) {
      long.hidden = !!(e.detail && e.detail.ok);
    });
    ctx.root.appendChild(el("section", { class: "doc-card", "data-doc": "premium", "aria-label": "Votre CV Premium" }, [
      el("div", { class: "doc-card-head" }, [el("h2", { text: "Votre CV Premium" }), zoom]),
      el("div", { class: "pr-tools" }, [el("div", null, [el("p", { class: "tool-label", id: "pr-accent-label", text: "Couleur" }), accentSeg])]),
      el("div", { class: "pr-photo" }, [photoText, photoBtn, photoRemove, photoInput]),
      photoError,
      el("p", { class: "pr-formats", text: "PDF de deux pages au maximum, Word modifiable, et CV web : un seul fichier .html à envoyer ou à mettre en ligne." }),
      actions,
      status,
      long,
      frameParent
    ]));

    function onEdit(path, value) {
      var m = /^cv\.premium\.personal\.(\d+)$/.exec(path);
      if (m) {
        // Only the value is editable on the page: keep the label (« Âge : … »).
        var current = (ctx.doc().cv.premium.personal || [])[Number(m[1])] || "";
        var at = current.indexOf(" : ");
        if (at > 0) value = current.slice(0, at + 3) + value;
      }
      ctx.onEdit(path, value);
    }

    var view = new TCV.DocView(frameParent, "premium", { editable: true, onEdit: onEdit });

    function accent() {
      var cv = ctx.doc().cv;
      return P.isAccent(cv.premium && cv.premium.accent) ? cv.premium.accent : "marine";
    }

    function render() {
      view.show(ctx.doc().cv, accent(), photo);
      TCV.dom.segRadios(accentSeg, "pr-accent", P.ACCENTS, accent(), function (a) {
        ctx.onEdit("cv.premium.accent", a);
        render();
      });
      setText(photoText, photo
        ? "Votre photo est enregistrée sur ce téléphone uniquement."
        : "Votre photo n'est pas sur ce téléphone. Ajoutez-la : elle reste sur votre appareil, elle n'est jamais envoyée.");
      setText(photoBtn.firstChild, photo ? "Changer la photo" : "Ajouter ma photo");
      photoRemove.hidden = !photo;
    }

    photoBtn.addEventListener("click", function () { photoInput.click(); });
    photoInput.addEventListener("change", function () {
      var file = photoInput.files && photoInput.files[0];
      photoInput.value = "";
      if (!file) return;
      setText(photoError, "");
      TCV.dom.busy(photoBtn, true, "Préparation…");
      P.processPhoto(file).then(
        function (url) {
          TCV.dom.busy(photoBtn, false);
          photo = url;
          var kept = P.photo.set(id, url);
          render();
          setText(status, kept ? "Photo ajoutée à votre CV." : "Photo ajoutée pour cette visite (ce téléphone n'a plus de place pour la garder).");
        },
        function (err) {
          TCV.dom.busy(photoBtn, false);
          setText(photoError, err.message);
        }
      );
    });
    photoRemove.addEventListener("click", function () {
      P.photo.remove(id);
      photo = null;
      render();
      setText(status, "Photo retirée du CV.");
      photoBtn.focus();
    });
    zoom.addEventListener("click", function () {
      var on = zoom.getAttribute("aria-pressed") !== "true";
      zoom.setAttribute("aria-pressed", on ? "true" : "false");
      setText(zoom, on ? "Réduire" : "Agrandir pour corriger");
      view.setZoom(on);
    });
    actions.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!btn) return;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      var cv = ctx.doc().cv;
      var act = btn.getAttribute("data-act");
      setText(status, "");
      if (act === "pdf") {
        var name = fileName(cv, "pdf");
        TCV.dom.busy(btn, true, "Création du PDF…");
        exportPdf(view.page, name).then(
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
        var doc = fileName(cv, "doc");
        download(new Blob(["﻿", wordHtml(cv)], { type: "application/msword" }), doc);
        setText(status, "Fichier Word téléchargé : " + doc + (photo ? " (la photo n'y figure pas : ajoutez-la dans Word si besoin)." : ""));
      } else if (act === "html") {
        var web = fileName(cv, "html");
        download(new Blob([webHtml(view.page, cv)], { type: "text/html;charset=utf-8" }), web);
        setText(status, "CV web téléchargé : " + web + ". Envoyez ce fichier ou mettez-le en ligne : il s'ouvre dans n'importe quel navigateur.");
      } else if (act === "print") {
        window.TCVExport.print([view.page]);
      }
    });

    // The colour picked on the preview (kept on this phone) becomes a correction of the paid document.
    var picked = P.accent.get(id);
    if (picked && picked !== accent()) ctx.onEdit("cv.premium.accent", picked);
    P.accent.remove(id);

    render();
    fontsReady(8000).then(function () { view.layout(); });
    return { view: view, render: render };
  }

  /** Blurred preview while the payment is being confirmed. */
  function preview(container, cv, id) {
    if (!cv) return;
    var view = new TCV.DocView(container, "premium");
    view.show(cv, P.accent.get(id) || (cv.premium && cv.premium.accent), P.photo.get(id));
  }

  TCV.premiumResult = { mount: mount, preview: preview, wordHtml: wordHtml, webHtml: webHtml, exportPdf: exportPdf };
})();
