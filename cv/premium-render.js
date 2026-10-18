// CV Premium — « Prestige » renderer (A4, two pages at most) and the helpers shared by index.html and
// resultat.html: accents, the customer's photo (kept on this device only, never sent to the server) and
// the colour chosen on the preview.
// TCVRender.premium(cv, accent, photoDataUrl) → <article class="tcv-page pcv">, one .pcv-sheet per A4 page.
// All text goes through textContent; masked runs (█) are drawn as blurred blocks like render.js does.
// Editable text carries data-path="cv.premium.achievements.0.title" for the result page.
(function () {
  "use strict";

  var R = window.TCVRender;
  var MASK_RUN = /█[█ ]*/g;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var BASE_PT = 9; // body size of a sheet; every size in premium.css is in em
  var MIN_PT = 7.2; // never print smaller than this
  var MAX_PT = 10.2; // a lighter CV gets larger type instead of an empty page
  var SINGLE_MIN = 0.89; // a short CV goes on ONE page if it fits at ≥ 89 % of the base size

  var ACCENTS = [
    { key: "marine", label: "Marine", desc: "Bleu marine et vert lime", dark: "#00415E", mid: "#005C83", hi: "#8CC63F", hi2: "#A6D867", tint: "#EEF4F7" },
    { key: "bordeaux", label: "Bordeaux", desc: "Bordeaux et or", dark: "#5B1A2B", mid: "#7A2A3E", hi: "#C9A227", hi2: "#DDBB4E", tint: "#F7F0F1" },
    { key: "foret", label: "Forêt", desc: "Vert forêt et sable", dark: "#0F3D2E", mid: "#1D5A45", hi: "#D9B26F", hi2: "#E6C78E", tint: "#EFF5F1" }
  ];
  var LEVEL_WIDTH = { Expert: 100, "Avancé": 80, Bon: 60, Notions: 35 };

  function accentOf(key) {
    for (var i = 0; i < ACCENTS.length; i++) if (ACCENTS[i].key === key) return ACCENTS[i];
    return ACCENTS[0];
  }

  function isAccent(key) {
    return ACCENTS.some(function (a) { return a.key === key; });
  }

  /* ---------- Small DOM helpers (same conventions as render.js) ---------- */

  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }

  function txt(tag, cls, text) {
    var n = el(tag, cls);
    n.textContent = text;
    return n;
  }

  function isBlank(s) {
    return typeof s !== "string" || s.trim() === "";
  }

  function hasMask(s) {
    return typeof s === "string" && s.indexOf("█") !== -1;
  }

  function list(a) {
    return Array.isArray(a) ? a : [];
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

  /** Appends `text`, turning masked runs into blurred word blocks. */
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

  /** <tag> holding `text`, editable through `path` unless the text is masked. */
  function field(tag, cls, text, path) {
    var n = el(tag, cls);
    appendText(n, text);
    if (path && !hasMask(text)) n.setAttribute("data-path", path);
    return n;
  }

  function appendAll(parent, nodes) {
    nodes.forEach(function (n) {
      if (n) parent.appendChild(n);
    });
    return parent;
  }

  function svg(paths, color) {
    var s = document.createElementNS(SVG_NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("width", "24");
    s.setAttribute("height", "24");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    paths.forEach(function (d) {
      var p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", color);
      p.setAttribute("stroke-width", "2");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      s.appendChild(p);
    });
    return s;
  }

  // Three neutral glyphs for the expertise cards (bars, layers, pulse): decoration only.
  var ICONS = [
    ["M5 20V11", "M10 20V5", "M15 20v-7", "M20 20V9"],
    ["M12 3l9 5-9 5-9-5 9-5z", "M3 13l9 5 9-5", "M3 17.5l9 4.5 9-4.5"],
    ["M3 12h4l2.5-6 4 12 2.5-6H21"]
  ];

  /* ---------- Blocks ---------- */

  function sectionHead(tag, title) {
    var h = el("div", "pcv-sec-h");
    h.appendChild(txt("p", "pcv-tag", tag));
    h.appendChild(txt("h2", "pcv-h2", title));
    return h;
  }

  /** "Awa Marie NDIAYE" → ["Awa Marie", "NDIAYE"] (the trailing upper-case words are the family name). */
  var LETTER = (function () {
    try {
      return new RegExp("\\p{L}", "u");
    } catch (e) {
      return /[A-Za-zÀ-ÖØ-öø-ÿ]/; // browsers without Unicode property escapes
    }
  })();

  function splitName(full) {
    var words = String(full || "").trim().split(/\s+/).filter(Boolean);
    var i = words.length;
    while (i > 0 && LETTER.test(words[i - 1]) && words[i - 1] === words[i - 1].toUpperCase()) i--;
    if (i === 0 || i === words.length) return [words.join(" "), ""];
    return [words.slice(0, i).join(" "), words.slice(i).join(" ")];
  }

  function initials(full) {
    var words = String(full || "").replace(/[█]/g, "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return ["", ""];
    var first = words[0].charAt(0);
    var last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
    return [first.toUpperCase(), last.toUpperCase()];
  }

  function usablePhoto(url) {
    return typeof url === "string" && /^data:image\/(jpeg|png|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/.test(url);
  }

  function photo(cv, photoUrl) {
    var ring = el("div", "pcv-photo");
    var disc = el("div", "pcv-disc");
    if (usablePhoto(photoUrl)) {
      ring.classList.add("has-img");
      disc.appendChild(el("img", "pcv-img", { src: photoUrl, alt: "Photo de " + (cv.fullName || "la candidate ou du candidat") }));
    } else {
      var ini = initials(cv.fullName);
      var mono = el("span", "pcv-mono", { "aria-hidden": "true" });
      mono.appendChild(document.createTextNode(ini[0]));
      if (ini[1]) mono.appendChild(txt("i", null, ini[1]));
      disc.appendChild(mono);
    }
    ring.appendChild(disc);
    return ring;
  }

  /** "15+" → "15" + <i>+</i>: symbols and units are drawn in the bright accent. */
  function figureValue(value, path) {
    var p = el("p", "pcv-kpi-v");
    if (hasMask(value)) return appendText(p, value);
    String(value || "").split(/([^0-9\s.,  ]+)/).forEach(function (part, i) {
      if (!part) return;
      if (i % 2) p.appendChild(txt("i", null, part));
      else p.appendChild(document.createTextNode(part));
    });
    if (path) p.setAttribute("data-path", path);
    return p;
  }

  function hero(cv, pm, photoUrl) {
    var head = el("header", "pcv-hero");
    var inner = el("div", "pcv-hero-in");
    inner.appendChild(photo(cv, photoUrl));
    var id = el("div", "pcv-id");
    if (!isBlank(cv.title)) id.appendChild(field("p", "pcv-eyebrow", cv.title, "cv.title"));
    var name = el("h1", "pcv-name");
    var parts = splitName(cv.fullName);
    name.appendChild(document.createTextNode(parts[0]));
    if (parts[1]) {
      if (parts[0]) name.appendChild(document.createTextNode(" "));
      name.appendChild(txt("b", null, parts[1]));
    }
    if (!hasMask(cv.fullName)) name.setAttribute("data-path", "cv.fullName");
    id.appendChild(name);
    if (!isBlank(pm.headline)) id.appendChild(field("p", "pcv-headline", pm.headline, "cv.premium.headline"));
    var contacts = list(cv.contacts).filter(function (c) { return !isBlank(c); });
    if (contacts.length) {
      var ul = el("ul", "pcv-chips");
      list(cv.contacts).forEach(function (c, i) {
        if (isBlank(c)) return;
        ul.appendChild(field("li", "pcv-chip" + (/@/.test(c) ? " pcv-email" : ""), c, "cv.contacts." + i));
      });
      id.appendChild(ul);
    }
    inner.appendChild(id);
    head.appendChild(inner);
    var figs = list(pm.keyFigures).filter(function (k) { return k && (!isBlank(k.value) || !isBlank(k.label)); }).slice(0, 4);
    if (figs.length) {
      var strip = el("div", "pcv-kpis pcv-n" + figs.length);
      list(pm.keyFigures).forEach(function (k, i) {
        if (figs.indexOf(k) === -1) return;
        var cell = el("div", "pcv-kpi");
        cell.appendChild(figureValue(k.value, "cv.premium.keyFigures." + i + ".value"));
        if (!isBlank(k.label)) cell.appendChild(field("p", "pcv-kpi-l", k.label, "cv.premium.keyFigures." + i + ".label"));
        strip.appendChild(cell);
      });
      head.appendChild(strip);
    }
    return head;
  }

  function profileSection(cv, pm, accent) {
    var domains = list(pm.domains).filter(function (d) { return d && !isBlank(d.title); }).slice(0, 3);
    var hasText = !isBlank(pm.quote) || !isBlank(cv.profile);
    if (!hasText && !domains.length) return null;
    var sec = el("section", "pcv-sec pcv-sec-profile");
    sec.appendChild(sectionHead("À propos", "Profil professionnel"));
    var panel = el("div", "pcv-panel pcv-profile" + (domains.length && hasText ? "" : " is-solo"));
    if (hasText) {
      var left = el("div", "pcv-profile-text");
      if (!isBlank(pm.quote)) left.appendChild(field("p", "pcv-quote", pm.quote, "cv.premium.quote"));
      if (!isBlank(cv.profile)) left.appendChild(field("p", "pcv-profile-p", cv.profile, "cv.profile"));
      panel.appendChild(left);
    }
    if (domains.length) {
      var box = el("div", "pcv-domains" + (hasText ? "" : " pcv-domains-row pcv-n" + domains.length));
      list(pm.domains).forEach(function (d, i) {
        if (domains.indexOf(d) === -1) return;
        var card = el("div", "pcv-domain");
        var ico = el("span", "pcv-ico", { "aria-hidden": "true" });
        ico.appendChild(svg(ICONS[box.childNodes.length % ICONS.length], accent.hi2));
        card.appendChild(ico);
        var body = el("div", "pcv-domain-b");
        body.appendChild(field("p", "pcv-domain-t", d.title, "cv.premium.domains." + i + ".title"));
        if (!isBlank(d.detail)) body.appendChild(field("p", "pcv-domain-d", d.detail, "cv.premium.domains." + i + ".detail"));
        card.appendChild(body);
        box.appendChild(card);
      });
      panel.appendChild(box);
    }
    sec.appendChild(panel);
    return sec;
  }

  function achievementsSection(pm) {
    var items = list(pm.achievements).filter(function (a) { return a && !isBlank(a.title); }).slice(0, 6);
    if (!items.length) return null;
    var sec = el("section", "pcv-sec pcv-sec-ach");
    sec.appendChild(sectionHead("Résultats", "Réalisations marquantes"));
    var cols = items.length === 1 || items.length === 2 || items.length === 4 ? 2 : 3;
    var grid = el("div", "pcv-ach-grid pcv-c" + cols);
    list(pm.achievements).forEach(function (a, i) {
      if (items.indexOf(a) === -1) return;
      var base = "cv.premium.achievements." + i;
      var card = el("article", "pcv-ach");
      card.appendChild(field("h3", "pcv-ach-t", a.title, base + ".title"));
      if (!isBlank(a.detail)) card.appendChild(field("p", "pcv-ach-d", a.detail, base + ".detail"));
      var tags = list(a.tags).filter(function (t) { return !isBlank(t); });
      if (tags.length) {
        var ul = el("ul", "pcv-pills");
        list(a.tags).forEach(function (t, j) {
          if (!isBlank(t)) ul.appendChild(field("li", "pcv-pill", t, base + ".tags." + j));
        });
        card.appendChild(ul);
      }
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    return sec;
  }

  function isCurrent(period) {
    return /^\s*depuis\b/i.test(period || "") || /aujourd|actuel|en cours|présent/i.test(period || "");
  }

  function orgLine(company, place, base) {
    if (isBlank(company) && isBlank(place)) return null;
    var p = el("p", "pcv-org");
    if (!isBlank(company)) p.appendChild(field("span", null, company, base + ".company"));
    if (!isBlank(company) && !isBlank(place)) p.appendChild(txt("span", "pcv-dot", " · "));
    if (!isBlank(place)) p.appendChild(field("span", null, place, base + ".place"));
    return p;
  }

  function timelineItem(when, whenPath, now) {
    var li = el("li", "pcv-tl-i" + (now ? " is-now" : ""));
    var w = el("div", "pcv-when");
    if (!isBlank(when)) appendAll(w, [field("span", null, when, whenPath)]);
    li.appendChild(w);
    var what = el("div", "pcv-what");
    li.appendChild(what);
    return { li: li, what: what };
  }

  function experienceTimeline(cv) {
    var exps = list(cv.experiences).filter(function (e) { return e && !isBlank(e.title); });
    var sec = el("section", "pcv-sec pcv-sec-tl");
    var ol = el("ol");
    if (exps.length) {
      sec.appendChild(sectionHead("Parcours", "Expérience professionnelle"));
      list(cv.experiences).forEach(function (e, i) {
        if (exps.indexOf(e) === -1) return;
        var base = "cv.experiences." + i;
        var it = timelineItem(e.period, base + ".period", i === 0 && isCurrent(e.period));
        it.what.appendChild(field("h3", "pcv-role", e.title, base + ".title"));
        var org = orgLine(e.company, e.place, base);
        if (org) it.what.appendChild(org);
        var bullets = list(e.bullets).filter(function (b) { return !isBlank(b); });
        if (bullets.length) {
          var ul = el("ul", "pcv-bul");
          list(e.bullets).forEach(function (b, j) {
            if (!isBlank(b)) ul.appendChild(field("li", null, b, base + ".bullets." + j));
          });
          it.what.appendChild(ul);
        }
        ol.appendChild(it.li);
      });
    } else {
      // No experience typed: the education becomes the timeline (the rail then skips "Formation").
      sec.appendChild(sectionHead("Parcours", "Formation"));
      list(cv.education).forEach(function (ed, i) {
        if (!ed || isBlank(ed.degree)) return;
        var base = "cv.education." + i;
        var it = timelineItem(ed.year, base + ".year", false);
        it.what.appendChild(field("h3", "pcv-role", ed.degree, base + ".degree"));
        if (!isBlank(ed.school)) it.what.appendChild(field("p", "pcv-org", ed.school, base + ".school"));
        if (!isBlank(ed.detail)) it.what.appendChild(field("p", "pcv-tl-x", ed.detail, base + ".detail"));
        ol.appendChild(it.li);
      });
    }
    if (!ol.childNodes.length) return null;
    var panel = el("div", "pcv-panel pcv-tl");
    panel.appendChild(ol);
    sec.appendChild(panel);
    return sec;
  }

  function card(title, key) {
    var c = el("section", "pcv-card", { "data-card": key });
    c.appendChild(txt("h2", "pcv-card-h", title));
    return c;
  }

  function lc(s) {
    return String(s || "").toLowerCase().trim();
  }

  function skillsCard(cv, pm) {
    var levels = list(pm.skillLevels).filter(function (s) { return s && !isBlank(s.name); }).slice(0, 8);
    var taken = levels.map(function (s) { return lc(s.name); });
    var pills = [];
    [["it", cv.it], ["skills", cv.skills]].forEach(function (group) {
      list(group[1]).forEach(function (s, i) {
        if (isBlank(s) || taken.indexOf(lc(s)) !== -1) return;
        taken.push(lc(s));
        pills.push({ text: s, path: "cv." + group[0] + "." + i });
      });
    });
    if (!levels.length && !pills.length) return null;
    var c = card("Outils & compétences", "skills");
    list(pm.skillLevels).forEach(function (s, i) {
      if (levels.indexOf(s) === -1) return;
      var row = el("div", "pcv-skill");
      row.appendChild(field("span", "pcv-skill-n", s.name, "cv.premium.skillLevels." + i + ".name"));
      row.appendChild(txt("span", "pcv-skill-l", s.level || ""));
      var bar = el("span", "pcv-bar", { "aria-hidden": "true" });
      var fill = el("i");
      fill.style.width = (LEVEL_WIDTH[s.level] || 50) + "%";
      bar.appendChild(fill);
      row.appendChild(bar);
      c.appendChild(row);
    });
    if (pills.length) {
      var ul = el("ul", "pcv-tags" + (levels.length ? " pcv-tags-after" : ""));
      pills.forEach(function (p) {
        ul.appendChild(field("li", "pcv-tagp", p.text, p.path));
      });
      c.appendChild(ul);
    }
    return c;
  }

  function educationCard(cv) {
    var items = list(cv.education).filter(function (e) { return e && !isBlank(e.degree); });
    if (!items.length) return null;
    var c = card("Formation", "edu");
    var box = el("div", "pcv-edu");
    list(cv.education).forEach(function (e, i) {
      if (items.indexOf(e) === -1) return;
      var base = "cv.education." + i;
      var row = el("div", "pcv-edu-i");
      var y = el("div", "pcv-edu-y");
      if (!isBlank(e.year)) y.appendChild(field("span", null, e.year, base + ".year"));
      row.appendChild(y);
      var body = el("div");
      body.appendChild(field("p", "pcv-edu-d", e.degree, base + ".degree"));
      if (!isBlank(e.school)) body.appendChild(field("p", "pcv-edu-s", e.school, base + ".school"));
      if (!isBlank(e.detail)) body.appendChild(field("p", "pcv-edu-x", e.detail, base + ".detail"));
      row.appendChild(body);
      box.appendChild(row);
    });
    c.appendChild(box);
    return c;
  }

  function peopleCard(cv, pm) {
    var langs = list(cv.languages).filter(function (l) { return l && !isBlank(l.name); });
    var quals = list(pm.qualities).filter(function (q) { return !isBlank(q); });
    var personal = list(pm.personal).filter(function (p) { return !isBlank(p); });
    var interests = list(cv.interests).filter(function (s) { return !isBlank(s); });
    if (!langs.length && !quals.length && !personal.length && !interests.length) return null;
    var title = langs.length && quals.length ? "Langues & savoir-être" : langs.length ? "Langues" : quals.length ? "Savoir-être" : "Informations";
    var c = card(title, langs.length ? "langs" : "people");
    if (langs.length) {
      var dl = el("dl", "pcv-kv");
      list(cv.languages).forEach(function (l, i) {
        if (langs.indexOf(l) === -1) return;
        dl.appendChild(field("dt", null, l.name, "cv.languages." + i + ".name"));
        dl.appendChild(field("dd", null, l.level || "", "cv.languages." + i + ".level"));
      });
      c.appendChild(dl);
    }
    if (quals.length) {
      var ul = el("ul", "pcv-tags" + (langs.length ? " pcv-tags-after" : ""));
      list(pm.qualities).forEach(function (q, i) {
        if (!isBlank(q)) ul.appendChild(field("li", "pcv-tagp", q, "cv.premium.qualities." + i));
      });
      c.appendChild(ul);
    }
    if (personal.length || interests.length) {
      var kv = el("dl", "pcv-kv pcv-kv-after");
      list(pm.personal).forEach(function (line, i) {
        if (isBlank(line)) return;
        var at = line.indexOf(" : ");
        if (at > 0 && !hasMask(line)) {
          kv.appendChild(txt("dt", null, line.slice(0, at)));
          // The label stays fixed; the result page re-joins "Label : value" when the value is edited.
          kv.appendChild(field("dd", null, line.slice(at + 3), "cv.premium.personal." + i));
        } else {
          var dd = field("dd", "pcv-kv-full", line, null);
          kv.appendChild(dd);
        }
      });
      if (interests.length) {
        kv.appendChild(txt("dt", null, "Intérêts"));
        var dd2 = el("dd", "pcv-interests");
        list(cv.interests).forEach(function (s, i) {
          if (isBlank(s)) return;
          if (dd2.childNodes.length) dd2.appendChild(txt("span", "pcv-dot", ", "));
          dd2.appendChild(field("span", null, s, "cv.interests." + i));
        });
        kv.appendChild(dd2);
      }
      c.appendChild(kv);
    }
    return c;
  }

  /** Page 2: timeline + right rail. The rail cards may later move up to page 1 (see balance()). */
  function twoColumns(cv, pm) {
    var two = el("div", "pcv-two");
    var main = experienceTimeline(cv);
    var hasExp = list(cv.experiences).some(function (e) { return e && !isBlank(e.title); });
    var cards = [skillsCard(cv, pm), hasExp ? educationCard(cv) : null, peopleCard(cv, pm)].filter(Boolean);
    var rail = appendAll(el("aside", "pcv-rail"), cards);
    if (main) two.appendChild(main);
    if (cards.length) two.appendChild(rail);
    if (!main && !cards.length) return null;
    var extras = el("section", "pcv-sec pcv-sec-extra");
    var head = sectionHead("Atouts", "");
    var grid = el("div", "pcv-extra-grid");
    extras.appendChild(head);
    extras.appendChild(grid);
    return { two: two, main: main, rail: rail, cards: cards, extras: extras, extrasTitle: head.lastChild, extrasGrid: grid };
  }

  // Words for the « Atouts » heading, from each card title.
  var CARD_WORDS = { "Outils & compétences": "compétences", Formation: "formation", "Langues & savoir-être": "langues", Langues: "langues", "Savoir-être": "savoir-être", Informations: "informations" };

  function extrasTitle(cards) {
    // One card: its own title becomes the heading (the card label is then hidden by premium.css).
    if (cards.length === 1) return cards[0].firstChild.textContent.replace(" & ", " et ");
    var words = cards.map(function (c) { var t = c.firstChild.textContent; return CARD_WORDS[t] || t.toLowerCase(); });
    var t = words.length > 1 ? words.slice(0, -1).join(", ") + " et " + words[words.length - 1] : words[0] || "";
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function footer(cv, n) {
    var f = el("footer", "pcv-foot");
    var name = isBlank(cv.fullName) || hasMask(cv.fullName) ? "" : cv.fullName + " · ";
    f.appendChild(txt("span", null, name + "Curriculum vitae"));
    f.appendChild(txt("span", "pcv-pg", n + " / 2"));
    return f;
  }

  function sheet(n) {
    var s = el("section", "pcv-sheet pcv-sheet-" + n, { "aria-label": "Page " + n });
    var body = el("div", "pcv-body");
    s.appendChild(body);
    return { node: s, body: body };
  }

  /* ---------- Preview lock badges ---------- */

  function lockBadge() {
    var lock = el("div", "tcv-lock tcv-lock-center", { "aria-hidden": "true" });
    var badge = el("div", "tcv-lock-badge");
    var icon = document.createElementNS(SVG_NS, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("class", "tcv-lock-icon");
    var shackle = document.createElementNS(SVG_NS, "path");
    shackle.setAttribute("d", "M8 10.5V7.5a4 4 0 0 1 8 0v3");
    shackle.setAttribute("fill", "none");
    var body = document.createElementNS(SVG_NS, "rect");
    body.setAttribute("x", "4.5");
    body.setAttribute("y", "10.5");
    body.setAttribute("width", "15");
    body.setAttribute("height", "10.5");
    body.setAttribute("rx", "2.2");
    icon.appendChild(shackle);
    icon.appendChild(body);
    var p = el("p", "tcv-lock-text");
    p.appendChild(txt("strong", null, "Aperçu gratuit"));
    p.appendChild(el("br"));
    p.appendChild(document.createTextNode("Texte complet après paiement"));
    badge.appendChild(icon);
    badge.appendChild(p);
    lock.appendChild(badge);
    return lock;
  }

  /** One lock per page, over a block whose text is hidden, so it never covers readable text. */
  function addLocks(art) {
    if (!art.querySelector(".tcv-mask")) return;
    art.classList.add("is-preview");
    [[".pcv-ach-grid", ".pcv-profile"], [".pcv-tl", ".pcv-rail"]].forEach(function (hosts) {
      for (var i = 0; i < hosts.length; i++) {
        var host = art.querySelector(hosts[i]);
        if (host && host.querySelector(".tcv-mask")) {
          host.classList.add("tcv-lock-host");
          host.appendChild(lockBadge());
          return;
        }
      }
    });
  }

  /* ---------- Page ---------- */

  function premium(cv, accentKey, photoUrl) {
    cv = cv || {};
    var pm = cv.premium || {};
    var accent = accentOf(isAccent(accentKey) ? accentKey : pm.accent);
    var art = el("article", "tcv-page pcv pcv--" + accent.key, { "data-kind": "premium", "data-accent": accent.key, lang: "fr" });
    var s1 = sheet(1);
    var s2 = sheet(2);
    appendAll(s1.body, [hero(cv, pm, photoUrl), profileSection(cv, pm, accent), achievementsSection(pm)]);
    var cols = twoColumns(cv, pm);
    if (cols) s2.body.appendChild(cols.two);
    s1.node.appendChild(footer(cv, 1));
    s2.node.appendChild(footer(cv, 2));
    art.appendChild(s1.node);
    if (cols) art.appendChild(s2.node);
    // Kept for fit(), which moves blocks between the two pages (never on clones, which have no _pcv).
    art._pcv = { s1: s1.node, s2: cols ? s2.node : null, body1: s1.body, body2: s2.body, cols: cols };
    addLocks(art);
    return art;
  }

  /* ---------- Fitting on A4 ---------- */

  function overflows(sheetNode) {
    return sheetNode.scrollHeight > sheetNode.clientHeight + 1;
  }

  /** Shrinks the type of one sheet (down to `min` pt) until it fits. Returns true when it fits. */
  function shrink(sheetNode, min) {
    var size = BASE_PT;
    sheetNode.classList.remove("is-overflow", "is-compact");
    sheetNode.style.fontSize = size + "pt";
    while (overflows(sheetNode) && size > min) {
      size = Math.max(min, Math.round((size - 0.1) * 100) / 100);
      sheetNode.style.fontSize = size + "pt";
    }
    return !overflows(sheetNode);
  }

  /** Enlarges the type of all `sheets` together, step by step, while every one of them still fits. */
  function grow(sheets) {
    var size = parseFloat(sheets[0].style.fontSize) || BASE_PT;
    if (size < BASE_PT) return;
    while (size < MAX_PT) {
      var next = Math.min(MAX_PT, Math.round((size + 0.1) * 100) / 100);
      sheets.forEach(function (s) { s.style.fontSize = next + "pt"; });
      if (sheets.some(overflows)) {
        sheets.forEach(function (s) { s.style.fontSize = size + "pt"; });
        return;
      }
      size = next;
    }
  }

  /** Share of a page body's height used by its content (0–1, above 1 when it overflows). */
  function filled(body) {
    var first = body.firstElementChild;
    var last = body.lastElementChild;
    if (!first || !body.clientHeight) return 0;
    return (last.offsetTop + last.offsetHeight - first.offsetTop) / body.clientHeight;
  }

  /**
   * Page 1 is what a recruiter reads first, so it is filled as much as possible, as long as page 2 keeps
   * a third of its height (a nearly empty last page looks unfinished). When page 2 overflows in every
   * layout, as many cards as page 1 can take go up.
   */
  function pickLayout(options) {
    var fitting = options.filter(function (o) { return !o.o1 && !o.o2; });
    if (fitting.length) {
      var balanced = fitting.filter(function (o) { return o.f2 >= 0.33; });
      if (!balanced.length) return fitting[0];
      return balanced.reduce(function (a, b) { return b.f1 > a.f1 ? b : a; });
    }
    var page1ok = options.filter(function (o) { return !o.o1; });
    return page1ok.length ? page1ok[page1ok.length - 1] : options[0];
  }

  /** Puts the last `n` rail cards in the « Atouts » row of page 1 (n = 0: everything back in the rail). */
  function moveUp(c, n) {
    var up = c.cards.slice(c.cards.length - n);
    c.cards.forEach(function (card) {
      if (up.indexOf(card) === -1) c.rail.appendChild(card);
    });
    clearNode(c.extrasGrid);
    up.forEach(function (card) { c.extrasGrid.appendChild(card); });
    c.extrasGrid.className = "pcv-extra-grid pcv-n" + up.length;
    c.extrasTitle.textContent = extrasTitle(up);
    var railEmpty = n === c.cards.length;
    if (railEmpty && c.rail.parentNode) c.two.removeChild(c.rail);
    if (!railEmpty && c.cards.length && c.rail.parentNode !== c.two) c.two.appendChild(c.rail);
    c.two.classList.toggle("is-solo", !c.main || railEmpty || !c.cards.length);
    if (!n && c.extras.parentNode) c.extras.parentNode.removeChild(c.extras);
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /**
   * Lays the CV out on ONE A4 page when it fits at (almost) full size. Otherwise on two pages, with page 1
   * filled first: the rail cards (langues, formation, compétences) move up to page 1 while it still fits.
   * Each page's type then shrinks if needed; a page that still overflows at the minimum size grows instead
   * of cutting text (class is-overflow). The page must be in the DOM. Returns true when nothing overflows.
   */
  function fitPremium(art) {
    var p = art._pcv;
    if (!p) return true;
    var c = p.cols;
    if (c && p.s2) {
      moveUp(c, 0);
      if (c.two.parentNode !== p.body2) p.body2.appendChild(c.two);
      if (p.s2.parentNode !== art) art.appendChild(p.s2);
      art.classList.remove("is-single");
      // 1. Everything on a single page?
      p.body1.appendChild(c.two);
      art.removeChild(p.s2);
      art.classList.add("is-single");
      if (shrink(p.s1, BASE_PT * SINGLE_MIN)) {
        grow([p.s1]);
        return true;
      }
      p.body2.appendChild(c.two);
      art.appendChild(p.s2);
      art.classList.remove("is-single");
      // 2. Two pages. Measure each way of sharing the rail cards, at full size.
      p.s1.style.fontSize = p.s2.style.fontSize = BASE_PT + "pt";
      p.s1.classList.remove("is-overflow");
      p.s2.classList.remove("is-overflow");
      var maxUp = c.main ? c.cards.length : c.cards.length - 1;
      var options = [];
      for (var n = 0; n <= maxUp; n++) {
        moveUp(c, n);
        if (n && c.extras.parentNode !== p.body1) p.body1.appendChild(c.extras);
        var o = { n: n, o1: overflows(p.s1), o2: overflows(p.s2), f1: filled(p.body1), f2: filled(p.body2) };
        if (o.o1 && n) break; // page 1 is full: more cards cannot go up
        options.push(o);
      }
      moveUp(c, pickLayout(options).n);
      if (c.extrasGrid.childNodes.length && c.extras.parentNode !== p.body1) p.body1.appendChild(c.extras);
    }
    var sheets = [p.s1, p.s2].filter(Boolean);
    sheets.forEach(function (s) { s.style.fontSize = BASE_PT + "pt"; });
    if (!sheets.some(overflows)) {
      grow(sheets);
      return true;
    }
    var ok = true;
    sheets.forEach(function (s) {
      if (shrink(s, MIN_PT)) return;
      // Last resort before a third page: tighter spacing, then the smallest type again.
      var size = BASE_PT;
      s.classList.add("is-compact");
      s.style.fontSize = size + "pt";
      while (overflows(s) && size > MIN_PT) {
        size = Math.max(MIN_PT, Math.round((size - 0.1) * 100) / 100);
        s.style.fontSize = size + "pt";
      }
      if (overflows(s)) {
        ok = false;
        s.classList.add("is-overflow"); // grows: no text is ever cut
      }
    });
    return ok;
  }

  if (R) {
    var baseFit = R.fit;
    R.fit = function (page) {
      if (!(page && page.classList && page.classList.contains("pcv"))) return baseFit(page);
      var ok = fitPremium(page);
      page.classList.toggle("is-long", !ok);
      // Lets the preview and result pages tell the customer when the CV does not fit on two pages.
      var ev;
      try {
        ev = new CustomEvent("pcv:fit", { bubbles: true, detail: { ok: ok } });
      } catch (e) {
        ev = document.createEvent("CustomEvent");
        ev.initCustomEvent("pcv:fit", true, false, { ok: ok });
      }
      page.dispatchEvent(ev);
      return ok;
    };
    R.premium = premium;
    R.PREMIUM_ACCENTS = ACCENTS;
  }

  /* ---------- Device storage: photo and colour (never sent to the server) ---------- */

  var PHOTO_KEY = "tcv:photo:";
  var PHOTO_INDEX = "tcv:photos";
  var ACCENT_KEY = "tcv:accent:";
  var MAX_PHOTOS = 6;
  var MAX_BYTES = 150 * 1024;

  function rawGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function rawSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function rawRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      /* storage unavailable */
    }
  }

  function storablePhoto(url) {
    return typeof url === "string" && url.length < 400000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(url);
  }

  function photoIndex() {
    try {
      var l = JSON.parse(rawGet(PHOTO_INDEX) || "[]");
      return Array.isArray(l) ? l.filter(function (s) { return typeof s === "string"; }) : [];
    } catch (e) {
      return [];
    }
  }

  var photoStore = {
    /** Photo kept for an order id (or "draft" while the form is being filled), or null. */
    get: function (id) {
      var url = id ? rawGet(PHOTO_KEY + id) : null;
      return storablePhoto(url) ? url : null;
    },
    set: function (id, url) {
      if (!id || !storablePhoto(url)) return false;
      var ok = rawSet(PHOTO_KEY + id, url);
      if (!ok && id !== "draft") {
        // Storage full: drop the oldest order photos and try once more.
        photoIndex().slice(-2).forEach(function (old) { rawRemove(PHOTO_KEY + old); });
        ok = rawSet(PHOTO_KEY + id, url);
      }
      if (ok && id !== "draft") {
        var idx = photoIndex().filter(function (x) { return x !== id; });
        idx.unshift(id);
        idx.slice(MAX_PHOTOS).forEach(function (old) { rawRemove(PHOTO_KEY + old); });
        rawSet(PHOTO_INDEX, JSON.stringify(idx.slice(0, MAX_PHOTOS)));
      }
      return ok;
    },
    remove: function (id) {
      if (!id) return;
      rawRemove(PHOTO_KEY + id);
      if (id !== "draft") rawSet(PHOTO_INDEX, JSON.stringify(photoIndex().filter(function (x) { return x !== id; })));
    }
  };

  var accentStore = {
    get: function (id) {
      var a = id ? rawGet(ACCENT_KEY + id) : null;
      return isAccent(a) ? a : null;
    },
    set: function (id, key) {
      if (id && isAccent(key)) rawSet(ACCENT_KEY + id, key);
    },
    remove: function (id) {
      if (id) rawRemove(ACCENT_KEY + id);
    }
  };

  function photoError(code) {
    var messages = {
      type: "Ce fichier n'est pas une image. Choisissez une photo (JPEG ou PNG).",
      size: "Cette photo est trop lourde (20 Mo maximum). Choisissez-en une autre.",
      read: "Impossible de lire cette photo. Essayez avec une autre image.",
      decode: "Ce format de photo n'est pas pris en charge. Essayez avec une photo JPEG ou PNG."
    };
    var e = new Error(messages[code] || messages.read);
    e.code = code;
    return e;
  }

  function dataUrlBytes(url) {
    var i = url.indexOf(",");
    return Math.ceil(((url.length - i - 1) * 3) / 4);
  }

  /**
   * Customer photo → square 400×400 JPEG of at most 150 KB, as a data URL. Everything happens in this
   * browser (FileReader + canvas): the file is never uploaded.
   */
  function processPhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || "")) return reject(photoError("type"));
      if (file.size > 20 * 1024 * 1024) return reject(photoError("size"));
      var reader = new FileReader();
      reader.onerror = function () { reject(photoError("read")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(photoError("decode")); };
        img.onload = function () {
          try {
            resolve(squareJpeg(img));
          } catch (e) {
            reject(photoError("decode"));
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function squareJpeg(img) {
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    if (!w || !h) throw new Error("empty image");
    var side = Math.min(w, h);
    var sx = (w - side) / 2;
    var sy = h > w ? (h - side) * 0.3 : 0; // portraits: keep the face, which sits in the upper part
    // Halve in steps first: a single big downscale looks jagged.
    var src = img;
    var srcX = sx;
    var srcY = sy;
    var srcSide = side;
    while (srcSide > 800) {
      var half = document.createElement("canvas");
      half.width = half.height = Math.round(srcSide / 2);
      var hc = half.getContext("2d");
      hc.imageSmoothingEnabled = true;
      hc.imageSmoothingQuality = "high";
      hc.drawImage(src, srcX, srcY, srcSide, srcSide, 0, 0, half.width, half.height);
      src = half;
      srcX = srcY = 0;
      srcSide = half.width;
    }
    var canvas = document.createElement("canvas");
    canvas.width = canvas.height = 400;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 400, 400);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, srcX, srcY, srcSide, srcSide, 0, 0, 400, 400);
    var q = 0.9;
    var url = canvas.toDataURL("image/jpeg", q);
    while (dataUrlBytes(url) > MAX_BYTES && q > 0.35) {
      q = Math.round((q - 0.08) * 100) / 100;
      url = canvas.toDataURL("image/jpeg", q);
    }
    if (!/^data:image\/jpeg;base64,/.test(url)) throw new Error("no jpeg");
    return url;
  }

  window.TCVPremium = {
    ACCENTS: ACCENTS,
    LEVELS: ["Expert", "Avancé", "Bon", "Notions"],
    accentOf: accentOf,
    isAccent: isAccent,
    photo: photoStore,
    accent: accentStore,
    processPhoto: processPhoto,
    photoBytes: dataUrlBytes,
    splitName: splitName,
    BASE_PT: BASE_PT
  };
})();
