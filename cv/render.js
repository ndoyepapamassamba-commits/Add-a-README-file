// Document renderer: turns a CvDoc / LettreDoc (see lib/types.ts) into an A4 page element.
// All text goes through textContent. Masked runs (█ and spaces, from the redacted preview) are drawn as
// blurred grey word blocks and the page gets a lock badge.
// Editable text nodes carry data-path="cv.experiences.0.bullets.1" so the result page can map edits back
// to the document. Elements marked data-w="row" / data-w="cols" are turned into tables by the Word export.
(function () {
  "use strict";

  var MASK_RUN = /█[█ ]*/g;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var A4_W_PX = 793.7; // 210 mm at 96 dpi
  var A4_H_PX = 1122.5; // 297 mm at 96 dpi

  var TEMPLATES = [
    { key: "classique", label: "Classique" },
    { key: "moderne", label: "Moderne" },
    { key: "elegant", label: "Élégant" }
  ];
  // Fonts Word can find on a typical Windows/Mac install (the screen stack starts with system-ui).
  var WORD_FONTS = { classique: "Calibri, Arial, sans-serif", moderne: "Calibri, Arial, sans-serif", elegant: "Georgia, 'Times New Roman', serif" };
  var BASE_PT = {
    cv: { classique: 10, moderne: 9.75, elegant: 10.5 },
    lettre: { classique: 11, moderne: 10.75, elegant: 11.5 }
  };

  function normTemplate(t) {
    return t === "moderne" || t === "elegant" ? t : "classique";
  }

  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }

  function isBlank(s) {
    return typeof s !== "string" || s.trim() === "";
  }

  function hasMask(s) {
    return typeof s === "string" && s.indexOf("█") !== -1;
  }

  /** Appends `text` to `node`, turning masked runs into blurred word blocks. */
  function appendText(node, text) {
    var s = typeof text === "string" ? text : "";
    var last = 0;
    s.replace(MASK_RUN, function (run, at) {
      if (at > last) node.appendChild(document.createTextNode(s.slice(last, at)));
      var trimmed = run.replace(/ +$/, "");
      node.appendChild(maskNode(trimmed));
      if (trimmed.length < run.length) node.appendChild(document.createTextNode(" "));
      last = at + run.length;
      return run;
    });
    if (last < s.length) node.appendChild(document.createTextNode(s.slice(last)));
    return node;
  }

  function maskNode(run) {
    var wrap = el("span", "tcv-mask", { "aria-label": "texte masqué", role: "img" });
    run.split(/ +/).forEach(function (word, i) {
      if (i > 0) wrap.appendChild(document.createTextNode(" "));
      var w = el("span", "tcv-mask-w", { "aria-hidden": "true" });
      w.textContent = word;
      wrap.appendChild(w);
    });
    return wrap;
  }

  /** Creates <tag> holding `text`, editable through `path` unless the text is masked. */
  function field(tag, cls, text, path) {
    var n = el(tag, cls);
    appendText(n, text);
    if (path && !hasMask(text)) n.setAttribute("data-path", path);
    return n;
  }

  function sectionTitle(label) {
    var h = el("h2", "tcv-h");
    h.textContent = label;
    return h;
  }

  function section(cls, label) {
    var s = el("section", "tcv-sec " + cls);
    if (label) s.appendChild(sectionTitle(label));
    return s;
  }

  /** "a · b · c" with real separator characters so they survive copy/paste and the Word export.
   *  The default separator starts with a no-break space so a line never begins with "·". */
  function inlineList(items, path, sep) {
    var p = el("p", "tcv-inline");
    items.forEach(function (item, i) {
      if (i > 0) {
        var s = el("span", "tcv-sep", { "aria-hidden": "true" });
        s.textContent = sep || "\u00a0· ";
        p.appendChild(s);
      }
      p.appendChild(field("span", "tcv-inline-item", item, path + "." + i));
    });
    return p;
  }

  function bulletList(items, path, cls) {
    var ul = el("ul", cls || "tcv-list");
    items.forEach(function (item, i) {
      ul.appendChild(field("li", null, item, path + "." + i));
    });
    return ul;
  }

  function languageEntry(tag, l, i) {
    var n = el(tag, "tcv-lang");
    n.appendChild(field("span", "tcv-lang-name", l.name, "cv.languages." + i + ".name"));
    if (!isBlank(l.level)) {
      var sep = el("span", "tcv-sep", { "aria-hidden": "true" });
      sep.textContent = " — ";
      n.appendChild(sep);
      n.appendChild(field("span", "tcv-lang-level", l.level, "cv.languages." + i + ".level"));
    }
    return n;
  }

  /** One language per line ("Wolof — Langue maternelle"). */
  function languageList(langs, cls) {
    var ul = el("ul", cls || "tcv-langs");
    langs.forEach(function (l, i) {
      ul.appendChild(languageEntry("li", l, i));
    });
    return ul;
  }

  /** Languages on one line, separated like inlineList(). */
  function languageInline(langs) {
    var p = el("p", "tcv-inline");
    langs.forEach(function (l, i) {
      if (i > 0) {
        var s = el("span", "tcv-sep", { "aria-hidden": "true" });
        s.textContent = "\u00a0· ";
        p.appendChild(s);
      }
      p.appendChild(languageEntry("span", l, i));
    });
    return p;
  }

  /** "Company, Place" line of an experience. */
  function orgLine(e, i) {
    var p = el("p", "tcv-org");
    if (!isBlank(e.company)) p.appendChild(field("span", "tcv-company", e.company, "cv.experiences." + i + ".company"));
    if (!isBlank(e.company) && !isBlank(e.place)) p.appendChild(document.createTextNode(", "));
    if (!isBlank(e.place)) p.appendChild(field("span", "tcv-place", e.place, "cv.experiences." + i + ".place"));
    return p.childNodes.length ? p : null;
  }

  function experienceBody(e, i, withPeriodRow) {
    var frag = document.createDocumentFragment();
    var title = field("h3", "tcv-item-title", e.title, "cv.experiences." + i + ".title");
    if (withPeriodRow && !isBlank(e.period)) {
      var row = el("div", "tcv-row", { "data-w": "row" });
      row.appendChild(title);
      row.appendChild(field("p", "tcv-period", e.period, "cv.experiences." + i + ".period"));
      frag.appendChild(row);
    } else {
      frag.appendChild(title);
    }
    var org = orgLine(e, i);
    if (org) frag.appendChild(org);
    if (e.bullets && e.bullets.length) frag.appendChild(bulletList(e.bullets, "cv.experiences." + i + ".bullets", "tcv-bullets"));
    return frag;
  }

  function educationBody(ed, i, withYearRow) {
    var frag = document.createDocumentFragment();
    var degree = field("h3", "tcv-item-title", ed.degree, "cv.education." + i + ".degree");
    if (withYearRow && !isBlank(ed.year)) {
      var row = el("div", "tcv-row", { "data-w": "row" });
      row.appendChild(degree);
      row.appendChild(field("p", "tcv-period", ed.year, "cv.education." + i + ".year"));
      frag.appendChild(row);
    } else {
      frag.appendChild(degree);
    }
    if (!isBlank(ed.school)) frag.appendChild(field("p", "tcv-org", ed.school, "cv.education." + i + ".school"));
    if (!isBlank(ed.detail)) frag.appendChild(field("p", "tcv-detail", ed.detail, "cv.education." + i + ".detail"));
    return frag;
  }

  /** Item list where the period sits on the title row (classique, moderne). */
  function stackedItems(items, kind) {
    var wrap = el("div", "tcv-items");
    items.forEach(function (it, i) {
      var item = el("div", "tcv-item");
      item.appendChild(kind === "exp" ? experienceBody(it, i, true) : educationBody(it, i, true));
      wrap.appendChild(item);
    });
    return wrap;
  }

  /** Item list with a left date column (élégant). */
  function datedItems(items, kind) {
    var wrap = el("div", "tcv-items");
    items.forEach(function (it, i) {
      var item = el("div", "tcv-item tcv-dated", { "data-w": "row" });
      var when = el("div", "tcv-when");
      var period = kind === "exp" ? it.period : it.year;
      var path = kind === "exp" ? "cv.experiences." + i + ".period" : "cv.education." + i + ".year";
      if (!isBlank(period)) when.appendChild(field("p", "tcv-period", period, path));
      var what = el("div", "tcv-what");
      what.appendChild(kind === "exp" ? experienceBody(it, i, false) : educationBody(it, i, false));
      item.appendChild(when);
      item.appendChild(what);
      wrap.appendChild(item);
    });
    return wrap;
  }

  function header(cv, cls) {
    var head = el("header", "tcv-head " + (cls || ""), cls === "tcv-band" ? { "data-w": "box" } : null);
    head.appendChild(field("h1", "tcv-name", cv.fullName, "cv.fullName"));
    if (!isBlank(cv.title)) head.appendChild(field("p", "tcv-title", cv.title, "cv.title"));
    return head;
  }

  function contactsInline(cv) {
    return inlineList(cv.contacts || [], "cv.contacts", "\u2002|\u2002");
  }

  function profileSection(cv, label) {
    if (isBlank(cv.profile)) return null;
    var s = section("tcv-sec-profile", label || "Profil");
    s.appendChild(field("p", "tcv-profile", cv.profile, "cv.profile"));
    return s;
  }

  function itemsSection(items, kind, label, dated) {
    if (!items || !items.length) return null;
    var s = section(kind === "exp" ? "tcv-sec-exp" : "tcv-sec-edu", label);
    s.appendChild(dated ? datedItems(items, kind) : stackedItems(items, kind));
    return s;
  }

  /** Label / value rows ("Compétences : a · b"), used by classique. */
  function factsSection(cv) {
    var rows = [
      ["Compétences", cv.skills, "cv.skills"],
      ["Informatique", cv.it, "cv.it"],
      ["Langues", null, null],
      ["Centres d'intérêt", cv.interests, "cv.interests"]
    ];
    var s = section("tcv-sec-facts", "Compétences et atouts");
    var any = false;
    rows.forEach(function (r) {
      var isLang = r[0] === "Langues";
      var list = isLang ? cv.languages : r[1];
      if (!list || !list.length) return;
      any = true;
      var row = el("div", "tcv-fact", { "data-w": "row" });
      var label = el("p", "tcv-fact-label");
      label.textContent = r[0];
      row.appendChild(label);
      var val = el("div", "tcv-fact-value");
      val.appendChild(isLang ? languageInline(list) : inlineList(list, r[2]));
      row.appendChild(val);
      s.appendChild(row);
    });
    return any ? s : null;
  }

  function sideSection(label, content) {
    if (!content) return null;
    var s = section("tcv-side-sec", label);
    s.appendChild(content);
    return s;
  }

  function appendAll(parent, nodes) {
    nodes.forEach(function (n) {
      if (n) parent.appendChild(n);
    });
  }

  function page(kind, template) {
    var t = normTemplate(template);
    var p = el("article", "tcv-page tcv-" + kind + " tpl-" + t, {
      "data-template": t,
      "data-kind": kind,
      "data-word-font": WORD_FONTS[t],
      lang: "fr"
    });
    p.style.fontSize = BASE_PT[kind][t] + "pt";
    return p;
  }

  function nonEmpty(list) {
    return list && list.length ? list : null;
  }

  function cvClassique(cv, p) {
    var head = header(cv);
    if (cv.contacts && cv.contacts.length) head.appendChild(contactsInline(cv));
    appendAll(p, [
      head,
      profileSection(cv),
      itemsSection(cv.experiences, "exp", "Expérience professionnelle"),
      itemsSection(cv.education, "edu", "Formation"),
      factsSection(cv)
    ]);
  }

  function cvModerne(cv, p) {
    p.appendChild(header(cv, "tcv-band"));
    var cols = el("div", "tcv-cols", { "data-w": "cols" });
    var side = el("aside", "tcv-side");
    var main = el("div", "tcv-main");
    appendAll(side, [
      sideSection("Contact", nonEmpty(cv.contacts) && bulletList(cv.contacts, "cv.contacts", "tcv-plain")),
      sideSection("Compétences", nonEmpty(cv.skills) && bulletList(cv.skills, "cv.skills", "tcv-list")),
      sideSection("Informatique", nonEmpty(cv.it) && bulletList(cv.it, "cv.it", "tcv-list")),
      sideSection("Langues", nonEmpty(cv.languages) && languageList(cv.languages, "tcv-langs tcv-langs-stack")),
      sideSection("Centres d'intérêt", nonEmpty(cv.interests) && bulletList(cv.interests, "cv.interests", "tcv-list"))
    ]);
    appendAll(main, [
      profileSection(cv),
      itemsSection(cv.experiences, "exp", "Expérience professionnelle"),
      itemsSection(cv.education, "edu", "Formation")
    ]);
    cols.appendChild(side);
    cols.appendChild(main);
    p.appendChild(cols);
  }

  function cvElegant(cv, p) {
    var head = header(cv);
    if (cv.contacts && cv.contacts.length) head.appendChild(contactsInline(cv));
    appendAll(p, [
      head,
      profileSection(cv),
      itemsSection(cv.experiences, "exp", "Expérience professionnelle", true),
      itemsSection(cv.education, "edu", "Formation", true)
    ]);
    var left = el("div", "tcv-col");
    var right = el("div", "tcv-col");
    appendAll(left, [sideSection("Compétences", nonEmpty(cv.skills) && bulletList(cv.skills, "cv.skills", "tcv-list"))]);
    appendAll(right, [
      sideSection("Langues", nonEmpty(cv.languages) && languageList(cv.languages, "tcv-langs tcv-langs-stack")),
      sideSection("Informatique", nonEmpty(cv.it) && inlineList(cv.it, "cv.it")),
      sideSection("Centres d'intérêt", nonEmpty(cv.interests) && inlineList(cv.interests, "cv.interests"))
    ]);
    if (left.childNodes.length || right.childNodes.length) {
      var cols = el("div", "tcv-cols tcv-cols-even", { "data-w": "cols" });
      cols.appendChild(left);
      cols.appendChild(right);
      p.appendChild(cols);
    }
  }

  function lockBadge() {
    var lock = el("div", "tcv-lock", { "aria-hidden": "true" });
    var badge = el("div", "tcv-lock-badge");
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "tcv-lock-icon");
    var body = document.createElementNS(SVG_NS, "rect");
    body.setAttribute("x", "4.5");
    body.setAttribute("y", "10.5");
    body.setAttribute("width", "15");
    body.setAttribute("height", "10.5");
    body.setAttribute("rx", "2.2");
    var shackle = document.createElementNS(SVG_NS, "path");
    shackle.setAttribute("d", "M8 10.5V7.5a4 4 0 0 1 8 0v3");
    shackle.setAttribute("fill", "none");
    svg.appendChild(shackle);
    svg.appendChild(body);
    var text = el("p", "tcv-lock-text");
    var strong = el("strong");
    strong.textContent = "Aperçu gratuit";
    text.appendChild(strong);
    text.appendChild(el("br"));
    text.appendChild(document.createTextNode("Le texte flouté s'affiche en entier après paiement"));
    badge.appendChild(svg);
    badge.appendChild(text);
    lock.appendChild(badge);
    return lock;
  }

  function finish(p) {
    if (p.querySelector(".tcv-mask")) {
      p.classList.add("is-preview");
      p.appendChild(lockBadge());
    }
    return p;
  }

  function cv(doc, template) {
    var p = page("cv", template);
    if (!doc) return p;
    var t = normTemplate(template);
    if (t === "moderne") cvModerne(doc, p);
    else if (t === "elegant") cvElegant(doc, p);
    else cvClassique(doc, p);
    return finish(p);
  }

  function lines(list, base, cls) {
    var box = el("div", cls);
    (list || []).forEach(function (line, i) {
      if (isBlank(line)) return;
      box.appendChild(field("p", i === 0 ? "tcv-line tcv-line-first" : "tcv-line", line, base + "." + i));
    });
    return box;
  }

  function lettre(doc, template) {
    var p = page("lettre", template);
    if (!doc) return p;
    var t = normTemplate(template);
    var sender = doc.sender || [];
    if (t === "moderne" || t === "elegant") {
      var head = el("header", "tcv-head " + (t === "moderne" ? "tcv-band" : ""), t === "moderne" ? { "data-w": "box" } : null);
      if (sender.length) head.appendChild(field("h1", "tcv-name", sender[0], "lettre.sender.0"));
      var details = el("p", "tcv-inline tcv-sender-details");
      sender.slice(1).forEach(function (line, i) {
        if (isBlank(line)) return;
        if (details.childNodes.length) {
          var sep = el("span", "tcv-sep", { "aria-hidden": "true" });
          sep.textContent = "\u2002|\u2002";
          details.appendChild(sep);
        }
        details.appendChild(field("span", "tcv-inline-item", line, "lettre.sender." + (i + 1)));
      });
      if (details.childNodes.length) head.appendChild(details);
      p.appendChild(head);
    } else {
      p.appendChild(lines(sender, "lettre.sender", "tcv-sender"));
    }
    var body = el("div", "tcv-letter-body");
    body.appendChild(lines(doc.recipient, "lettre.recipient", "tcv-recipient"));
    if (!isBlank(doc.placeDate)) body.appendChild(field("p", "tcv-place-date", doc.placeDate, "lettre.placeDate"));
    if (!isBlank(doc.subject)) body.appendChild(field("p", "tcv-subject", doc.subject, "lettre.subject"));
    if (!isBlank(doc.salutation)) body.appendChild(field("p", "tcv-salutation", doc.salutation, "lettre.salutation"));
    (doc.paragraphs || []).forEach(function (para, i) {
      body.appendChild(field("p", "tcv-para", para, "lettre.paragraphs." + i));
    });
    if (!isBlank(doc.closing)) body.appendChild(field("p", "tcv-para tcv-closing", doc.closing, "lettre.closing"));
    if (!isBlank(doc.signature)) body.appendChild(field("p", "tcv-signature", doc.signature, "lettre.signature"));
    p.appendChild(body);
    return finish(p);
  }

  /**
   * Shrinks the type (down to 86 %) until the page fits on one A4 sheet. The page must be in the DOM.
   * Returns true when the content fits on one page.
   */
  function fit(p) {
    var kind = p.getAttribute("data-kind") === "lettre" ? "lettre" : "cv";
    var base = BASE_PT[kind][normTemplate(p.getAttribute("data-template"))];
    var size = base;
    p.style.fontSize = size + "pt";
    while (p.scrollHeight > A4_H_PX + 1 && size > base * 0.86) {
      size = Math.round((size - 0.25) * 100) / 100;
      p.style.fontSize = size + "pt";
    }
    return p.scrollHeight <= A4_H_PX + 1;
  }

  window.TCVRender = {
    TEMPLATES: TEMPLATES,
    A4_W_PX: A4_W_PX,
    A4_H_PX: A4_H_PX,
    cv: cv,
    lettre: lettre,
    fit: fit,
    hasMask: hasMask
  };
})();
