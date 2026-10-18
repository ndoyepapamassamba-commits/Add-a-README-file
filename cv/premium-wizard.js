// CV Premium on index.html: the extra wizard steps (accroche & chiffres clés, domaines & réalisations,
// compétences avec niveau, photo, couleur), the client-side mirror of the server validation for
// OrderInput.premium, the home section with its fictional sample, and small touches on the preview.
// wizard.js calls TCV.premiumWizard.{defaults, restore, steps, stepOf, onShow, attach}.
// The photo is processed and stored on this device only (TCVPremium.photo): it is never sent to the API.
(function () {
  "use strict";

  var TCV = window.TCV;
  var P = window.TCVPremium;
  var D = window.TCV_DATA;
  var V = TCV.validate;
  var $ = TCV.dom.$;
  var $$ = TCV.dom.$$;
  var el = TCV.dom.el;
  var setText = TCV.dom.setText;

  var STEPS = ["offre", "identite", "objectif", "accroche", "formation", "experiences", "domaines", "competences", "niveaux", "langues", "photo", "couleur"];
  var LEVELS = ["Expert", "Avancé", "Bon", "Notions"];
  var LEVEL_WIDTH = { Expert: 100, "Avancé": 80, Bon: 60, Notions: 35 };
  var ACCENT_DESC = {
    marine: "Sobre et institutionnel : banque, finance, télécoms.",
    bordeaux: "Élégant et affirmé : direction, conseil, juridique.",
    foret: "Calme et rassurant : ONG, santé, administration."
  };
  var MAX = { keyFigures: 4, domains: 3, achievements: 6, skillLevels: 8, qualities: 6, tags: 4 };

  var api = null; // { state, save, setError, clearError, ChipGroup } from wizard.js
  var form = null;
  var draftPhoto = null; // in-memory copy when the phone refuses to store it
  var peekViews = {};

  /* ---------- State ---------- */

  function emptyFigure() { return { value: "", label: "" }; }
  function emptyDomain() { return { title: "", detail: "" }; }
  function emptyAch() { return { title: "", detail: "", tags: [] }; }
  function emptyLevel() { return { name: "", level: "Bon" }; }

  function defaults() {
    return {
      headline: "",
      pitch: "",
      quote: "",
      keyFigures: [emptyFigure(), emptyFigure()],
      domains: [emptyDomain()],
      achievements: [emptyAch()],
      skillLevels: [],
      qualities: [],
      personal: { age: "", situation: "" },
      accent: "marine"
    };
  }

  function str(v) {
    return typeof v === "string" ? v : "";
  }

  function strings(list, max) {
    return Array.isArray(list) ? list.filter(function (s) { return typeof s === "string" && s; }).slice(0, max) : [];
  }

  function objects(list, max, make) {
    return Array.isArray(list) ? list.slice(0, max).map(function (o) { return make(o && typeof o === "object" ? o : {}); }) : null;
  }

  /** Rebuilds a valid premium state from a saved draft (which may be old, partial or tampered with). */
  function restore(saved) {
    var s = defaults();
    if (!saved || typeof saved !== "object") return s;
    s.headline = str(saved.headline);
    s.pitch = str(saved.pitch);
    s.quote = str(saved.quote);
    s.keyFigures = objects(saved.keyFigures, MAX.keyFigures, function (o) { return { value: str(o.value), label: str(o.label) }; }) || s.keyFigures;
    s.domains = objects(saved.domains, MAX.domains, function (o) { return { title: str(o.title), detail: str(o.detail) }; }) || s.domains;
    s.achievements = objects(saved.achievements, MAX.achievements, function (o) {
      return { title: str(o.title), detail: str(o.detail), tags: strings(o.tags, MAX.tags) };
    }) || s.achievements;
    s.skillLevels = objects(saved.skillLevels, MAX.skillLevels, function (o) {
      return { name: str(o.name), level: LEVELS.indexOf(o.level) !== -1 ? o.level : "Bon" };
    }) || s.skillLevels;
    s.qualities = strings(saved.qualities, MAX.qualities);
    var per = saved.personal && typeof saved.personal === "object" ? saved.personal : {};
    s.personal = { age: str(per.age), situation: str(per.situation) };
    if (P.isAccent(saved.accent)) s.accent = saved.accent;
    return s;
  }

  function pm() {
    var st = api.state();
    if (!st.premium) st.premium = defaults();
    return st.premium;
  }

  /* ---------- Payload + validation (mirror of the server, see SPEC_PREMIUM "Validation") ---------- */

  function line(s) {
    return V.line(s);
  }

  function opt(s) {
    var v = line(s);
    return v === "" ? undefined : v;
  }

  function blank(o) {
    return Object.keys(o).every(function (k) {
      var v = o[k];
      return Array.isArray(v) ? !v.some(function (x) { return line(x); }) : line(String(v == null ? "" : v)) === "";
    });
  }

  function cleanList(list, max) {
    var seen = {};
    return (list || []).map(line).filter(function (s) {
      var k = s.toLowerCase();
      if (!s || seen[k]) return false;
      seen[k] = true;
      return true;
    }).slice(0, max);
  }

  /** Premium state → { data: OrderInput.premium, index: { "premium.domains": [screen indexes…] … } }. */
  function buildPremium(p) {
    var index = { "premium.keyFigures": [], "premium.domains": [], "premium.achievements": [], "premium.skillLevels": [] };
    var data = {
      headline: line(p.headline),
      pitch: opt(p.pitch),
      quote: opt(p.quote),
      keyFigures: [],
      domains: [],
      achievements: [],
      skillLevels: [],
      qualities: cleanList(p.qualities, MAX.qualities),
      accent: p.accent
    };
    (p.keyFigures || []).forEach(function (k, i) {
      if (blank(k)) return;
      index["premium.keyFigures"].push(i);
      data.keyFigures.push({ value: line(k.value), label: line(k.label) });
    });
    (p.domains || []).forEach(function (d, i) {
      if (blank(d)) return;
      index["premium.domains"].push(i);
      data.domains.push({ title: line(d.title), detail: line(d.detail) });
    });
    (p.achievements || []).forEach(function (a, i) {
      if (blank(a)) return;
      index["premium.achievements"].push(i);
      data.achievements.push({ title: line(a.title), detail: line(a.detail), tags: cleanList(a.tags, MAX.tags) });
    });
    (p.skillLevels || []).forEach(function (s, i) {
      if (!line(s.name)) return;
      index["premium.skillLevels"].push(i);
      data.skillLevels.push({ name: line(s.name), level: s.level });
    });
    var per = p.personal || {};
    if (opt(per.age) || opt(per.situation)) data.personal = { age: opt(per.age), situation: opt(per.situation) };
    return { data: data, index: index };
  }

  var NOT_KKM = (function () {
    try {
      return new RegExp("[^\\P{L}kKM]", "u"); // any letter other than k, K, M
    } catch (e) {
      return /[A-JLN-Za-jl-zÀ-ÖØ-öø-ÿ]/;
    }
  })();

  /** "15+", "16 359", "100 %", "7/7", "1,5 M": at least one digit, + or %, and no letter other than k/K/M. */
  function isFigure(v) {
    return /[0-9+%]/.test(v) && !NOT_KKM.test(v);
  }

  function validatePremium(p, f) {
    if (!p) {
      f.premium = "Complétez les informations du CV Premium.";
      return;
    }
    function need(path, value, max, missing) {
      if (!value) f[path] = missing;
      else if (value.length > max) f[path] = max + " caractères maximum.";
    }
    function cap(path, value, max) {
      if (value && value.length > max) f[path] = max + " caractères maximum.";
    }
    need("premium.headline", p.headline, 160, "Écrivez votre accroche en une phrase.");
    cap("premium.pitch", p.pitch, 500);
    cap("premium.quote", p.quote, 220);
    if (p.keyFigures.length > MAX.keyFigures) f["premium.keyFigures"] = "4 chiffres clés maximum.";
    p.keyFigures.forEach(function (k, i) {
      var base = "premium.keyFigures." + i + ".";
      if (!k.value) f[base + "value"] = "Indiquez le chiffre.";
      else if (k.value.length > 12) f[base + "value"] = "12 caractères maximum.";
      else if (!isFigure(k.value)) f[base + "value"] = "Un nombre seulement (ex. : 12+, 250, 98 %, 1,5 M).";
      need(base + "label", k.label, 70, "Dites en quelques mots ce que ce chiffre représente.");
    });
    if (p.domains.length > MAX.domains) f["premium.domains"] = "3 domaines maximum.";
    p.domains.forEach(function (d, i) {
      var base = "premium.domains." + i + ".";
      need(base + "title", d.title, 40, "Indiquez le domaine.");
      need(base + "detail", d.detail, 120, "Précisez en quelques mots.");
    });
    if (p.achievements.length > MAX.achievements) f["premium.achievements"] = "6 réalisations maximum.";
    p.achievements.forEach(function (a, i) {
      var base = "premium.achievements." + i + ".";
      need(base + "title", a.title, 70, "Donnez un titre à cette réalisation.");
      need(base + "detail", a.detail, 240, "Décrivez la réalisation en une ou deux phrases.");
      if (a.tags.length > MAX.tags) f[base + "tags"] = "4 mots-clés maximum.";
      a.tags.forEach(function (t, j) { cap(base + "tags." + j, t, 30); });
    });
    if (p.skillLevels.length > MAX.skillLevels) f["premium.skillLevels"] = "8 compétences maximum.";
    p.skillLevels.forEach(function (s, i) {
      var base = "premium.skillLevels." + i + ".";
      cap(base + "name", s.name, 40);
      if (LEVELS.indexOf(s.level) === -1) f[base + "level"] = "Choisissez un niveau.";
    });
    if (p.qualities.length > MAX.qualities) f["premium.qualities"] = "6 qualités maximum.";
    p.qualities.forEach(function (q, i) { cap("premium.qualities." + i, q, 40); });
    if (p.personal) {
      cap("premium.personal.age", p.personal.age, 30);
      cap("premium.personal.situation", p.personal.situation, 30);
    }
    if (!P.isAccent(p.accent)) f["premium.accent"] = "Choisissez une couleur.";
  }

  var baseBuild = V.buildInput;
  var baseValidate = V.validate;
  V.buildInput = function (state, product) {
    var out = baseBuild(state, product);
    if (product === "premium") {
      var b = buildPremium(state.premium || defaults());
      out.data.premium = b.data;
      Object.keys(b.index).forEach(function (k) { out.index[k] = b.index[k]; });
    }
    return out;
  };
  V.validate = function (product, data) {
    var f = baseValidate(product, data);
    if (product === "premium") validatePremium(data.premium, f);
    return f;
  };

  function stepOf(path) {
    var k = path.split(".")[1];
    if (k === "domains" || k === "achievements") return "domaines";
    if (k === "skillLevels") return "niveaux";
    if (k === "qualities" || k === "personal") return "langues";
    if (k === "accent") return "couleur";
    return "accroche";
  }

  /* ---------- Form building blocks ---------- */

  function req() {
    return el("span", { class: "req", "aria-hidden": "true", text: "*" });
  }

  function optional(text) {
    return el("span", { class: "opt", text: text || "(facultatif)" });
  }

  /** A labelled text input or textarea bound to `name` (wizard.js keeps the state in sync). */
  function textField(o) {
    var errId = "e-" + o.id;
    var hintId = o.hint ? "h-" + o.id : null;
    var countId = o.counter ? "c-" + o.id : null;
    var input = el(o.rows ? "textarea" : "input", {
      type: o.rows ? null : "text",
      id: o.id,
      name: o.name,
      maxlength: o.max,
      rows: o.rows || null,
      placeholder: o.placeholder || null,
      inputmode: o.inputmode || null,
      autocomplete: "off",
      "aria-describedby": [hintId, errId, countId].filter(Boolean).join(" ")
    });
    if (o.value != null) input.value = o.value;
    var label = el("label", { for: o.id }, [o.label, o.required ? " " : null, o.required ? req() : null, o.optional ? " " : null, o.optional ? optional(o.optional) : null]);
    return el("div", { class: "field" + (o.cls ? " " + o.cls : "") }, [
      label,
      o.hint ? el("span", { class: "field-hint", id: hintId, text: o.hint }) : null,
      input,
      o.counter ? el("span", { class: "counter", id: countId, "data-counter-for": o.id, text: (input.value || "").length + " / " + o.max }) : null,
      el("p", { class: "field-error", id: errId, "data-error-for": o.name })
    ]);
  }

  function stepSection(key, title, heading, intro) {
    var sec = el("section", { class: "step", "data-step": key, "data-title": title, hidden: true, "aria-labelledby": "h-" + key });
    sec.appendChild(el("h2", { id: "h-" + key, tabindex: "-1", text: heading }));
    if (intro) sec.appendChild(el("p", { class: "step-intro", text: intro }));
    return sec;
  }

  function tick() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("class", "tick");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M4 10.5l4 4 8-9");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2.4");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    return svg;
  }

  function removeButton(label, onClick, cls) {
    var b = el("button", { type: "button", class: cls || "icon-btn", "aria-label": label, text: cls ? "Supprimer" : "×" });
    b.addEventListener("click", onClick);
    return b;
  }

  /* ---------- Repeatable lists ---------- */

  var LISTS = {
    keyFigures: { empty: emptyFigure, root: "pw-figs", add: "pw-figs-add", row: figureRow },
    domains: { empty: emptyDomain, root: "pw-domains", add: "pw-domains-add", row: domainCard },
    achievements: { empty: emptyAch, root: "pw-achs", add: "pw-achs-add", row: achCard },
    skillLevels: { empty: emptyLevel, root: "pw-levels", add: "pw-levels-add", row: levelRow }
  };

  function nameOf(kind, i, f) {
    return "premium." + kind + "." + i + "." + f;
  }

  function idOf(kind, i, f) {
    return "f-p-" + kind + "-" + i + "-" + f;
  }

  function renderList(kind) {
    var cfg = LISTS[kind];
    var root = document.getElementById(cfg.root);
    TCV.dom.clear(root);
    pm()[kind].forEach(function (item, i) {
      root.appendChild(cfg.row(item, i));
    });
    document.getElementById(cfg.add).hidden = pm()[kind].length >= MAX[kind];
    if (kind === "keyFigures") updateStrip();
    if (kind === "skillLevels") renderLevelSuggestions();
  }

  function addItem(kind, item) {
    pm()[kind].push(item || LISTS[kind].empty());
    renderList(kind);
    api.clearError("premium." + kind);
    api.save();
    var inputs = $$("#" + LISTS[kind].root + " > :last-child input, #" + LISTS[kind].root + " > :last-child textarea");
    if (inputs[0]) inputs[0].focus();
  }

  function removeItem(kind, i) {
    pm()[kind].splice(i, 1);
    renderList(kind);
    api.save();
    document.getElementById(LISTS[kind].add).focus();
  }

  function figureRow(item, i) {
    return el("div", { class: "pw-fig" }, [
      textField({ id: idOf("keyFigures", i, "value"), name: nameOf("keyFigures", i, "value"), label: "Chiffre", max: 12, placeholder: "Ex. : 12+", value: item.value }),
      textField({ id: idOf("keyFigures", i, "label"), name: nameOf("keyFigures", i, "label"), label: "Ce qu'il représente", max: 70, placeholder: "Ex. : années d'expérience", value: item.label }),
      removeButton("Retirer le chiffre clé " + (i + 1), function () { removeItem("keyFigures", i); })
    ]);
  }

  function repeatCard(title, kind, i, children) {
    return el("div", { class: "repeat-card" }, [
      el("div", { class: "repeat-head" }, [el("h3", { text: title + " " + (i + 1) }), removeButton("Supprimer « " + title + " " + (i + 1) + " »", function () { removeItem(kind, i); }, "btn-danger-link")])
    ].concat(children));
  }

  function domainCard(item, i) {
    return repeatCard("Domaine", "domains", i, [
      textField({ id: idOf("domains", i, "title"), name: nameOf("domains", i, "title"), label: "Domaine", required: true, max: 40, placeholder: "Ex. : Contrôle de gestion", value: item.title }),
      textField({ id: idOf("domains", i, "detail"), name: nameOf("domains", i, "detail"), label: "En quelques mots", required: true, max: 120, placeholder: "Ex. : Budgets, tableaux de bord, clôtures mensuelles", value: item.detail })
    ]);
  }

  function achCard(item, i) {
    return repeatCard("Réalisation", "achievements", i, [
      textField({ id: idOf("achievements", i, "title"), name: nameOf("achievements", i, "title"), label: "Titre", required: true, max: 70, placeholder: "Ex. : Refonte du reporting mensuel", value: item.title }),
      textField({ id: idOf("achievements", i, "detail"), name: nameOf("achievements", i, "detail"), label: "Ce que vous avez fait", required: true, max: 240, rows: 3, counter: true, placeholder: "Ex. : Un tableau de bord unique pour cinq agences, livré chaque mois à la direction.", value: item.detail }),
      tagEditor(item, i)
    ]);
  }

  function tagEditor(item, i) {
    var path = "premium.achievements." + i + ".tags";
    var inputId = "f-p-tag-" + i;
    var errId = "e-p-tag-" + i;
    var labelId = "l-p-tag-" + i;
    var list = el("ul", { class: "pw-tags", "aria-labelledby": labelId });
    var input = el("input", { type: "text", id: inputId, maxlength: 30, placeholder: "Ex. : Excel, 5 agences, audit…", enterkeyhint: "done", autocomplete: "off", "aria-describedby": errId });
    var addBtn = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Ajouter" });
    function draw() {
      TCV.dom.clear(list);
      item.tags.forEach(function (t, j) {
        var x = el("button", { type: "button", "aria-label": "Retirer le mot-clé « " + t + " »", text: "×" });
        x.addEventListener("click", function () {
          item.tags.splice(j, 1);
          api.clearError(path);
          draw();
          api.save();
          input.focus();
        });
        list.appendChild(el("li", { class: "pw-tag" }, [el("span", { text: t }), x]));
      });
      var full = item.tags.length >= MAX.tags;
      input.disabled = full;
      addBtn.disabled = full;
      input.placeholder = full ? "4 mots-clés au maximum" : "Ex. : Excel, 5 agences, audit…";
    }
    function add() {
      var v = line(input.value);
      if (!v) return;
      if (item.tags.map(function (t) { return t.toLowerCase(); }).indexOf(v.toLowerCase()) === -1) {
        if (item.tags.length >= MAX.tags) {
          api.setError(path, "4 mots-clés maximum.");
          return;
        }
        item.tags.push(v);
      }
      input.value = "";
      api.clearError(path);
      draw();
      api.save();
    }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        add();
        input.focus();
      }
    });
    input.addEventListener("change", add); // a word typed then left is kept too
    addBtn.addEventListener("click", function () {
      add();
      input.focus();
    });
    draw();
    return el("div", { class: "field" }, [
      el("p", { class: "label", id: labelId }, ["Mots-clés ", optional("(jusqu'à 4)")]),
      list,
      el("div", { class: "add-row" }, [el("label", { for: inputId, class: "sr-only", text: "Ajouter un mot-clé à la réalisation " + (i + 1) }), input, addBtn]),
      el("p", { class: "field-error", id: errId, "data-error-for": path })
    ]);
  }

  function levelRow(item, i) {
    var selId = idOf("skillLevels", i, "level");
    var select = el("select", { id: selId, name: nameOf("skillLevels", i, "level"), "aria-describedby": "e-" + selId });
    LEVELS.forEach(function (lv) {
      select.appendChild(el("option", { value: lv, text: lv }));
    });
    select.value = LEVELS.indexOf(item.level) !== -1 ? item.level : "Bon";
    var fill = el("i");
    fill.style.width = LEVEL_WIDTH[select.value] + "%";
    select.addEventListener("change", function () {
      fill.style.width = (LEVEL_WIDTH[select.value] || 50) + "%";
    });
    return el("div", { class: "pw-lvl" }, [
      textField({ id: idOf("skillLevels", i, "name"), name: nameOf("skillLevels", i, "name"), label: "Outil ou compétence", max: 40, placeholder: "Ex. : Excel", value: item.name }),
      el("div", { class: "field pw-lvl-level" }, [el("label", { for: selId, text: "Niveau" }), select, el("p", { class: "field-error", id: "e-" + selId, "data-error-for": nameOf("skillLevels", i, "level") })]),
      removeButton("Retirer « " + (item.name || "compétence " + (i + 1)) + " »", function () { removeItem("skillLevels", i); }),
      el("span", { class: "pw-bar", "aria-hidden": "true" }, [fill])
    ]);
  }

  /** Skills and software chosen earlier, offered as one-tap rows. */
  function renderLevelSuggestions() {
    var box = document.getElementById("pw-level-suggest");
    if (!box) return;
    var st = api.state();
    var taken = pm().skillLevels.map(function (s) { return line(s.name).toLowerCase(); });
    var seen = {};
    var names = (st.it || []).concat(st.skills || []).filter(function (n) {
      var k = line(n).toLowerCase();
      if (!k || seen[k] || taken.indexOf(k) !== -1 || n.length > 40) return false;
      seen[k] = true;
      return true;
    }).slice(0, 12);
    var chips = $(".chips", box);
    TCV.dom.clear(chips);
    names.forEach(function (n) {
      var b = el("button", { type: "button", class: "chip", text: n });
      b.disabled = pm().skillLevels.length >= MAX.skillLevels;
      b.addEventListener("click", function () {
        addItem("skillLevels", { name: n, level: "Bon" });
      });
      chips.appendChild(b);
    });
    box.hidden = !names.length;
  }

  /* ---------- Live key-figure strip ---------- */

  function figureNode(value) {
    var v = el("div", { class: "v" });
    String(value).split(/([^0-9\s., ]+)/).forEach(function (part, i) {
      if (part) v.appendChild(i % 2 ? el("i", { text: part }) : document.createTextNode(part));
    });
    return v;
  }

  function updateStrip() {
    var strip = document.getElementById("pw-strip");
    if (!strip) return;
    var figs = pm().keyFigures;
    TCV.dom.clear(strip);
    strip.className = "pw-strip n" + Math.max(1, figs.length);
    figs.forEach(function (k) {
      var empty = !line(k.value) && !line(k.label);
      strip.appendChild(el("div", { class: empty ? "is-empty" : null }, [
        figureNode(line(k.value) || "00"),
        el("div", { class: "l", text: line(k.label) || "Ce que représente ce chiffre" })
      ]));
    });
    document.getElementById("pw-strip-wrap").hidden = !figs.length;
  }

  /* ---------- Draft CV header preview (photo and colour steps) ---------- */

  function titleCase(s) {
    return line(s).toLowerCase().split(/([\s\-'’]+)/).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join("");
  }

  /** Header of the CV built from the form, to judge the photo and the colour. Not the final text. */
  function draftDoc() {
    var st = api.state();
    var id = st.identity || {};
    var p = pm();
    var name = (titleCase(id.firstName) + " " + line(id.lastName).toUpperCase()).trim() || "Votre NOM";
    var place = line(id.address) ? line(id.address) + ", " + line(id.city) : line(id.city);
    var phone = V.normalizeSnMobile(line(id.phone));
    return {
      fullName: name,
      title: line((st.target || {}).jobTitle),
      contacts: [phone ? TCV.fmt.snPhone(phone) : line(id.phone), line(id.email), place].filter(Boolean),
      profile: line(p.pitch),
      experiences: [],
      education: [],
      skills: [],
      it: [],
      languages: [],
      interests: [],
      premium: {
        headline: line(p.headline),
        quote: line(p.quote),
        keyFigures: buildPremium(p).data.keyFigures,
        domains: buildPremium(p).data.domains,
        achievements: [],
        skillLevels: [],
        qualities: [],
        personal: [],
        accent: p.accent
      }
    };
  }

  function currentPhoto() {
    return draftPhoto || P.photo.get("draft");
  }

  function renderPeek(key) {
    var host = document.getElementById("pw-peek-" + key);
    if (!host || host.closest("[hidden]")) return;
    if (!peekViews[key]) peekViews[key] = new TCV.DocView(host, "premium");
    peekViews[key].show(draftDoc(), pm().accent, currentPhoto());
  }

  /* ---------- Photo ---------- */

  function initialsOf() {
    var id = api.state().identity || {};
    return ((line(id.firstName).charAt(0) || "") + (line(id.lastName).charAt(0) || "")).toUpperCase() || "?";
  }

  function updatePhotoUI(message) {
    var url = currentPhoto();
    var disc = document.getElementById("pw-disc");
    TCV.dom.clear(disc);
    if (url) disc.appendChild(el("img", { src: url, alt: "Votre photo" }));
    else disc.appendChild(el("span", { "aria-hidden": "true", text: initialsOf() }));
    setText($(".btn-label", document.getElementById("pw-photo-pick")), url ? "Changer la photo" : "Choisir une photo");
    document.getElementById("pw-photo-remove").hidden = !url;
    if (message != null) setText(document.getElementById("pw-photo-status"), message);
    renderPeek("photo");
  }

  function onPhotoFile(file) {
    var status = document.getElementById("pw-photo-status");
    var error = document.getElementById("pw-photo-error");
    setText(error, "");
    if (!file) return;
    var btn = document.getElementById("pw-photo-pick");
    TCV.dom.busy(btn, true, "Préparation…");
    P.processPhoto(file).then(
      function (url) {
        TCV.dom.busy(btn, false);
        var kept = P.photo.set("draft", url);
        draftPhoto = kept ? null : url;
        var kb = Math.round(P.photoBytes(url) / 1024);
        updatePhotoUI(kept
          ? "Photo ajoutée (" + kb + " Ko). Elle reste sur ce téléphone."
          : "Photo ajoutée pour cette visite. Ce téléphone n'a plus assez de place pour la garder : vous pourrez la remettre après paiement.");
      },
      function (err) {
        TCV.dom.busy(btn, false);
        setText(status, "");
        setText(error, err.message);
      }
    );
  }

  /* ---------- Steps ---------- */

  function buildAccroche() {
    var sec = stepSection("accroche", "Accroche", "Votre accroche et vos chiffres clés", "C'est la première chose que lit le recruteur, juste sous votre nom.");
    sec.appendChild(textField({
      id: "f-p-headline", name: "premium.headline", label: "Accroche", required: true, max: 160, rows: 2, counter: true,
      hint: "Une phrase : votre métier et ce qui vous distingue. Exemple : Responsable des achats, 12 ans de négociation dans l'agroalimentaire."
    }));
    sec.appendChild(textField({
      id: "f-p-pitch", name: "premium.pitch", label: "Votre parcours en 2 ou 3 phrases", optional: "(facultatif, conseillé)", max: 500, rows: 4, counter: true,
      hint: "Avec vos mots. Nous nous en servons pour rédiger votre profil, sans rien inventer."
    }));
    sec.appendChild(textField({
      id: "f-p-quote", name: "premium.quote", label: "Votre façon de travailler", optional: "(facultatif)", max: 220, rows: 3, counter: true,
      hint: "Une phrase à la première personne, affichée en italique. Laissée vide, nous écrirons une phrase générale sur votre approche, sans aucun fait inventé."
    }));
    var figs = el("fieldset", { class: "field" }, [
      el("legend", null, ["Chiffres clés ", optional("(jusqu'à 4)")]),
      el("span", { class: "field-hint", text: "Uniquement des chiffres vrais, que vous pourrez justifier en entretien : années d'expérience, personnes encadrées, clients suivis, budget géré, taux atteint…" }),
      el("div", { class: "pw-rows", id: "pw-figs" }),
      el("button", { type: "button", class: "btn btn-secondary add-btn", id: "pw-figs-add", text: "+ Ajouter un chiffre" }),
      el("p", { class: "field-error", "data-error-for": "premium.keyFigures" })
    ]);
    sec.appendChild(figs);
    sec.appendChild(el("div", { class: "pw-strip-wrap", id: "pw-strip-wrap" }, [
      el("p", { class: "tool-label", text: "Aperçu du bandeau de chiffres" }),
      el("div", { class: "pw-strip", id: "pw-strip", "aria-hidden": "true" })
    ]));
    return sec;
  }

  function buildDomaines() {
    var sec = stepSection("domaines", "Réalisations", "Vos domaines d'expertise et vos réalisations", "Restez factuel : nous n'ajoutons aucun chiffre ni résultat que vous n'avez pas écrit.");
    sec.appendChild(el("div", { class: "field" }, [
      el("p", { class: "label" }, ["Domaines d'expertise ", optional("(jusqu'à 3)")]),
      el("span", { class: "field-hint", text: "Ils s'affichent à côté de votre profil, chacun avec une icône." }),
      el("p", { class: "field-error", "data-error-for": "premium.domains" }),
      el("div", { id: "pw-domains" }),
      el("button", { type: "button", class: "btn btn-secondary add-btn", id: "pw-domains-add", text: "+ Ajouter un domaine" })
    ]));
    sec.appendChild(el("div", { class: "field" }, [
      el("p", { class: "label" }, ["Réalisations marquantes ", optional("(jusqu'à 6)")]),
      el("span", { class: "field-hint", text: "Un projet, une mission, un résultat dont vous êtes fier. Ajoutez jusqu'à 4 mots-clés : outil, méthode, périmètre." }),
      el("p", { class: "field-error", "data-error-for": "premium.achievements" }),
      el("div", { id: "pw-achs" }),
      el("button", { type: "button", class: "btn btn-secondary add-btn", id: "pw-achs-add", text: "+ Ajouter une réalisation" })
    ]));
    return sec;
  }

  function buildNiveaux() {
    var sec = stepSection("niveaux", "Niveaux", "Vos outils et compétences, avec niveau", "Jusqu'à 8. Chacun s'affiche avec une barre : Expert, Avancé, Bon ou Notions.");
    sec.appendChild(el("div", { class: "pw-suggest", id: "pw-level-suggest", hidden: true }, [
      el("p", { class: "tool-label", text: "Ajouter depuis vos compétences" }),
      el("div", { class: "chips" })
    ]));
    sec.appendChild(el("p", { class: "field-error", "data-error-for": "premium.skillLevels" }));
    sec.appendChild(el("div", { class: "pw-rows", id: "pw-levels" }));
    sec.appendChild(el("button", { type: "button", class: "btn btn-secondary add-btn", id: "pw-levels-add", text: "+ Ajouter une compétence" }));
    return sec;
  }

  function buildPhoto() {
    var sec = stepSection("photo", "Photo", "Votre photo", "Facultatif, mais une photo professionnelle rend votre CV plus mémorable.");
    sec.appendChild(el("div", { class: "pw-note" }, [
      el("strong", { text: "Votre photo reste sur ce téléphone. " }),
      "Elle n'est jamais envoyée sur nos serveurs : elle est ajoutée à votre CV directement sur votre appareil."
    ]));
    var input = el("input", { type: "file", id: "pw-photo-input", accept: "image/*", class: "pw-file", tabindex: "-1", "aria-hidden": "true" });
    var pick = el("button", { type: "button", class: "btn btn-primary", id: "pw-photo-pick" }, [el("span", { class: "btn-label", text: "Choisir une photo" })]);
    var remove = el("button", { type: "button", class: "btn btn-secondary", id: "pw-photo-remove", text: "Retirer la photo", hidden: true });
    pick.addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () {
      onPhotoFile(input.files && input.files[0]);
      input.value = "";
    });
    remove.addEventListener("click", function () {
      P.photo.remove("draft");
      draftPhoto = null;
      updatePhotoUI("Photo retirée.");
      pick.focus();
    });
    sec.appendChild(el("div", { class: "pw-photo" }, [
      el("div", { class: "pw-ring" }, [el("div", { class: "pw-disc", id: "pw-disc" })]),
      el("div", { class: "pw-photo-actions" }, [pick, remove, input])
    ]));
    sec.appendChild(el("p", { class: "status", id: "pw-photo-status", role: "status", "aria-live": "polite" }));
    sec.appendChild(el("p", { class: "field-error", id: "pw-photo-error", role: "alert" }));
    sec.appendChild(el("ul", { class: "pw-tips" }, [
      el("li", { text: "Photo récente, de face, bien éclairée." }),
      el("li", { text: "Fond uni, tenue professionnelle." }),
      el("li", { text: "Elle est recadrée en carré : gardez le visage au centre." })
    ]));
    sec.appendChild(el("div", { class: "pw-peek-wrap" }, [
      el("p", { class: "tool-label", text: "Aperçu de votre en-tête" }),
      el("div", { class: "pw-peek", id: "pw-peek-photo", "aria-hidden": "true" })
    ]));
    return sec;
  }

  function buildCouleur() {
    var sec = stepSection("couleur", "Couleur", "La couleur de votre CV", "Vous pourrez encore la changer sur l'aperçu et après paiement.");
    var group = el("div", { class: "pw-accents" });
    P.ACCENTS.forEach(function (a) {
      group.appendChild(el("label", { class: "pw-accent" }, [
        el("input", { type: "radio", name: "premium.accent", value: a.key, "aria-describedby": "e-p-accent" }),
        el("span", { class: "pw-sw pw-sw-" + a.key, "aria-hidden": "true" }),
        el("span", null, [el("span", { class: "t", text: a.label }), el("span", { class: "d", text: a.desc + ". " + ACCENT_DESC[a.key] })])
      ]));
    });
    sec.appendChild(el("fieldset", { class: "field" }, [el("legend", { class: "sr-only", text: "Couleur du CV" }), group]));
    sec.appendChild(el("p", { class: "field-error", id: "e-p-accent", "data-error-for": "premium.accent" }));
    sec.appendChild(el("div", { class: "pw-peek-wrap" }, [
      el("p", { class: "tool-label", text: "Aperçu de votre en-tête" }),
      el("div", { class: "pw-peek", id: "pw-peek-couleur", "aria-hidden": "true" })
    ]));
    return sec;
  }

  /** Premium-only fields added to existing steps (langues, expériences). */
  function buildExtras() {
    var langues = $('.step[data-step="langues"]');
    langues.setAttribute("data-title-base", langues.getAttribute("data-title"));
    var h = $("h2", langues);
    h.setAttribute("data-text-base", h.textContent);
    langues.appendChild(el("div", { "data-premium-only": "", hidden: true }, [
      el("div", { class: "field" }, [
        el("p", { class: "label", id: "l-pqualities" }, ["Savoir-être ", optional("(jusqu'à 6)")]),
        el("span", { class: "field-hint", text: "Ils s'affichent en étiquettes à côté de vos langues." }),
        el("div", { class: "chips", id: "chips-pqualities", role: "group", "aria-labelledby": "l-pqualities" }),
        el("div", { class: "add-row" }, [
          el("label", { for: "add-pquality", class: "sr-only", text: "Ajouter une qualité" }),
          el("input", { type: "text", id: "add-pquality", maxlength: 40, placeholder: "Autre qualité…", enterkeyhint: "done", autocomplete: "off" }),
          el("button", { type: "button", class: "btn btn-secondary btn-sm", "data-add-for": "add-pquality", text: "Ajouter" })
        ]),
        el("p", { class: "field-error", "data-error-for": "premium.qualities" })
      ]),
      el("fieldset", { class: "field" }, [
        el("legend", null, ["Informations personnelles ", optional()]),
        el("span", { class: "field-hint", text: "N'indiquez que ce que vous souhaitez partager. Rien n'est ajouté si vous laissez vide." }),
        el("div", { class: "grid-2" }, [
          textField({ id: "f-p-age", name: "premium.personal.age", label: "Âge", max: 30, placeholder: "Ex. : 38 ans" }),
          textField({ id: "f-p-situation", name: "premium.personal.situation", label: "Situation familiale", max: 30, placeholder: "Ex. : Mariée, deux enfants" })
        ])
      ])
    ]));
    var exp = $('.step[data-step="experiences"] .step-intro');
    exp.parentNode.insertBefore(el("p", { class: "pw-note", "data-premium-only": "", hidden: true }, [
      el("strong", { text: "CV Premium : " }),
      "3 à 5 missions courtes par poste suffisent. Votre CV doit tenir sur deux pages."
    ]), exp.nextSibling);
  }

  function addOfferChoice() {
    var choice = $('.step[data-step="offre"] .choice');
    if (!choice) return;
    choice.appendChild(el("label", null, [
      el("input", { type: "radio", name: "product", value: "premium" }),
      el("span", { class: "c-title" }, ["CV Premium ", el("span", { class: "c-badge c-badge-premium", text: "Cadres" })]),
      el("span", { class: "c-price", "data-price": "premium", text: "5 000 FCFA" }),
      el("span", { class: "c-desc", text: "Design Prestige sur deux pages, avec photo, chiffres clés et réalisations. PDF, Word et CV web." })
    ]));
  }

  function buildSteps() {
    form = $("#wizard");
    var anchor = $("#wz-error");
    [buildAccroche(), buildDomaines(), buildNiveaux(), buildPhoto(), buildCouleur()].forEach(function (sec) {
      form.insertBefore(sec, anchor);
    });
    buildExtras();
    addOfferChoice();
    $("#pw-figs-add").addEventListener("click", function () { addItem("keyFigures"); });
    $("#pw-domains-add").addEventListener("click", function () { addItem("domains"); });
    $("#pw-achs-add").addEventListener("click", function () { addItem("achievements"); });
    $("#pw-levels-add").addEventListener("click", function () { addItem("skillLevels"); });
    form.addEventListener("input", onInput);
    form.addEventListener("change", onInput);
  }

  function onInput(e) {
    var name = e.target && e.target.name;
    if (!name || name.indexOf("premium.") !== 0) return;
    // wizard.js updates the state in its own listener, which runs after this one.
    setTimeout(function () {
      if (name.indexOf("premium.keyFigures.") === 0) updateStrip();
      if (name === "premium.accent") renderPeek("couleur");
    }, 0);
  }

  /* ---------- Hooks called by wizard.js ---------- */

  function attach(a) {
    api = a;
    if (!api.state().premium) api.state().premium = defaults();
    Object.keys(LISTS).forEach(renderList);
    new api.ChipGroup({ root: $("#chips-pqualities"), path: "premium.qualities", max: MAX.qualities, input: $("#add-pquality"), suggestions: function () { return D.qualities; } }).render();
  }

  function onShow(key, product) {
    var on = product === "premium";
    $$("[data-premium-only]").forEach(function (n) { n.hidden = !on; });
    var langues = $('.step[data-step="langues"]');
    var h = $("h2", langues);
    langues.setAttribute("data-title", on ? "Langues et savoir-être" : langues.getAttribute("data-title-base"));
    setText(h, on ? "Langues, savoir-être et centres d'intérêt" : h.getAttribute("data-text-base"));
    if (!on) return;
    if (key === "langues") setText($("#wz-name"), "Langues et savoir-être");
    if (key === "accroche") updateStrip();
    if (key === "niveaux") renderLevelSuggestions();
    if (key === "photo") updatePhotoUI(null);
    if (key === "couleur") renderPeek("couleur");
  }

  /** Called by home.js once the order exists: the draft photo is now kept under the order id. */
  function onOrderCreated(order) {
    if (!order || order.product !== "premium") return;
    var url = currentPhoto();
    if (url) P.photo.set(order.id, url);
  }

  /* ---------- Preview screen ---------- */

  /** Warns, before payment, when the CV cannot fit on two pages (TCVRender.fit sends "pcv:fit"). */
  function watchLength() {
    var docs = document.getElementById("pv-docs");
    if (!docs) return;
    var note = el("div", { class: "banner banner-warn", id: "pv-long", role: "status", hidden: true }, [
      el("p", null, [
        el("strong", { text: "Votre CV dépasse deux pages. " }),
        "Raccourcissez quelques missions ou réalisations pour qu'il tienne sur deux pages. ",
        el("a", { href: "#creer/experiences", text: "Modifier mes informations" })
      ])
    ]);
    docs.parentNode.insertBefore(note, docs);
    docs.addEventListener("pcv:fit", function (e) {
      note.hidden = !!(e.detail && e.detail.ok);
    });
  }

  function decoratePreview(on) {
    var long = document.getElementById("pv-long");
    if (long && !on) long.hidden = true;
    var hint = $("#view-preview .preview-wrap > .hint");
    if (hint) {
      if (!hint.hasAttribute("data-text-base")) hint.setAttribute("data-text-base", hint.textContent);
      setText(hint, on
        ? "Vérifiez la mise en page et choisissez votre couleur. Le texte flouté s'affiche en entier après paiement."
        : hint.getAttribute("data-text-base"));
    }
    var checks = $("#view-preview .checks");
    var extra = document.getElementById("pv-premium-formats");
    if (!extra && checks) {
      extra = el("li", { id: "pv-premium-formats" }, [tick(), "PDF de 2 pages, Word et CV web (.html) à envoyer ou à mettre en ligne"]);
      checks.insertBefore(extra, checks.children[1] || null);
    }
    if (extra) extra.hidden = !on;
  }

  /* ---------- Home: fictional sample ---------- */

  // Abstract silhouette standing in for a photo: the sample is a fictional person.
  var SILHOUETTE = "data:image/svg+xml;base64," + window.btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#d9e6ec"/><stop offset="1" stop-color="#a9c3cf"/></linearGradient></defs>' +
    '<rect width="120" height="120" fill="url(#g)"/><circle cx="60" cy="48" r="21" fill="#53707e"/>' +
    '<path d="M18 120c3-27 20-40 42-40s39 13 42 40z" fill="#53707e"/></svg>'
  );

  var SAMPLE = {
    fullName: "Ndèye Awa KANE",
    title: "Directrice administrative et financière",
    contacts: ["+221 77 000 00 00", "ndeye.kane@exemple.sn", "Dakar"],
    profile: "Forte de quinze années en finance d'entreprise, je pilote la comptabilité, le contrôle de gestion et la trésorerie de groupes multi-sites. Je fiabilise les clôtures, je structure les tableaux de bord et j'accompagne la direction générale dans ses décisions.",
    experiences: [
      { title: "Directrice administrative et financière", company: "Groupe agro-industriel", place: "Dakar", period: "Depuis 2019", bullets: ["Pilotage du budget annuel et des prévisions de trésorerie", "Consolidation mensuelle de douze entités selon le SYSCOHADA", "Encadrement d'une équipe de neuf personnes"] },
      { title: "Responsable du contrôle de gestion", company: "Société de distribution", place: "Dakar", period: "2014 – 2019", bullets: ["Mise en place des tableaux de bord mensuels", "Analyse des écarts budgétaires avec les directions"] },
      { title: "Auditrice senior", company: "Cabinet d'audit", place: "Dakar", period: "2010 – 2014", bullets: ["Missions d'audit légal et contractuel", "Revue des procédures de contrôle interne"] }
    ],
    education: [
      { degree: "Master en finance et contrôle", school: "École supérieure de commerce, Dakar", year: "2010", detail: "" },
      { degree: "Licence en sciences de gestion", school: "Université de Dakar", year: "2008", detail: "" }
    ],
    skills: ["Consolidation", "Fiscalité"],
    it: ["Sage", "SAP"],
    languages: [{ name: "Français", level: "Courant" }, { name: "Wolof", level: "Langue maternelle" }, { name: "Anglais", level: "Bon niveau" }],
    interests: ["Lecture", "Course à pied"],
    premium: {
      headline: "Directrice financière : quinze ans à fiabiliser les chiffres et à éclairer les décisions de la direction.",
      quote: "Des chiffres justes, livrés à temps et expliqués simplement : c'est ce qui permet de bien décider.",
      keyFigures: [
        { value: "15+", label: "années en finance d'entreprise" },
        { value: "12", label: "entités consolidées chaque mois" },
        { value: "-40 %", label: "de délai sur la clôture mensuelle" },
        { value: "9", label: "collaborateurs encadrés" }
      ],
      domains: [
        { title: "Finance et trésorerie", detail: "Budget, prévisions, relations bancaires" },
        { title: "Contrôle de gestion", detail: "Tableaux de bord, analyse des écarts" },
        { title: "Conformité", detail: "SYSCOHADA, audits, fiscalité" }
      ],
      achievements: [
        { title: "Clôture mensuelle accélérée", detail: "Calendrier de clôture partagé et contrôles automatisés : les comptes sont arrêtés dix jours plus tôt.", tags: ["Excel", "Process"] },
        { title: "Tableau de bord de direction", detail: "Un seul tableau mensuel pour les douze entités, commenté pour le comité de direction.", tags: ["Power BI", "Reporting"] },
        { title: "Passage au nouveau logiciel", detail: "Migration de la comptabilité de trois filiales, formation des équipes comprise.", tags: ["SAP", "Conduite du changement"] }
      ],
      skillLevels: [
        { name: "Excel", level: "Expert" },
        { name: "Consolidation des comptes", level: "Expert" },
        { name: "Power BI", level: "Avancé" },
        { name: "Fiscalité", level: "Bon" }
      ],
      qualities: ["Rigueur", "Leadership", "Discrétion", "Sens de l'organisation"],
      personal: [],
      accent: "marine"
    }
  };

  function renderHome() {
    var host = document.getElementById("premium-sample");
    if (!host) return;
    var view = new TCV.DocView(host, "premium");
    var accent = "marine";
    var swatches = document.getElementById("premium-swatches");
    function draw() {
      view.show(SAMPLE, accent, SILHOUETTE);
      $$("button", swatches).forEach(function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-accent") === accent ? "true" : "false");
      });
    }
    swatches.appendChild(el("span", { class: "pm-sw-label", text: "Couleurs :" }));
    P.ACCENTS.forEach(function (a) {
      var b = el("button", { type: "button", "data-accent": a.key, "aria-pressed": "false" }, [el("span", { class: "pw-sw pw-sw-" + a.key, "aria-hidden": "true" }), a.label]);
      b.addEventListener("click", function () {
        accent = a.key;
        draw();
      });
      swatches.appendChild(b);
    });
    draw();
  }

  buildSteps();
  watchLength();
  renderHome();

  TCV.premiumWizard = {
    defaults: defaults,
    restore: restore,
    steps: function () { return STEPS.slice(); },
    stepOf: stepOf,
    onShow: onShow,
    attach: attach,
    onOrderCreated: onOrderCreated,
    decoratePreview: decoratePreview,
    isFigure: isFigure,
    SAMPLE: SAMPLE
  };
})();
