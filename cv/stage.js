// Pack Stage (product "stage") in the order wizard: internship state and draft restore, OrderInput building,
// client-side mirror of the server validation (SPEC_STAGE "Validation"), price, step mapping, and the
// stage-only form parts (projects, companies, live price, CV title hint, "Formation" prefill).
// Loaded after validate.js and before wizard.js. Every text goes through textContent / value.
(function () {
  "use strict";

  var TCV = window.TCV;
  var D = window.TCV_DATA;

  var TYPES = ["academique", "fin_etudes", "vacances", "perfectionnement"];
  var CHANNELS = ["email", "whatsapp", "depot"];
  var MAX_COMPANIES = 5;
  var MAX_PROJECTS = 4;
  var REASON_MIN = 20;
  var REASON_MAX = 300;
  var STEPS = ["offre", "identite", "etudes", "stage", "formation", "experiences", "competences", "langues", "entreprises"];
  var ETUDES_KEYS = ["school", "program", "studyLevel", "studyLevelOther"];
  var STAGE_KEYS = ["internshipType", "start", "end", "durationText", "conventionProvided", "department", "channel", "cvTitle"];
  var PROJECT_PLACEHOLDER = "Ex. : Tenue des comptes d'une boutique fictive sur Excel, en groupe de 4 (projet de 2e année)";

  function V() {
    return TCV.validate;
  }

  /* ---------- State ---------- */

  function emptyCompany() {
    return { name: "", city: "", recipient: "", department: "", reason: "" };
  }

  function defaults() {
    return {
      school: "", program: "", studyLevel: "", studyLevelOther: "", internshipType: "",
      start: "", end: "", durationText: "", conventionProvided: "", department: "", cvTitle: "",
      projects: [""], qualities: [], channel: "", companies: [emptyCompany()], prefill: null
    };
  }

  function str(v) {
    return typeof v === "string" ? v : "";
  }

  /** Rebuilds the internship state from a saved draft (old, partial or tampered with). */
  function restore(saved) {
    var s = defaults();
    if (!saved || typeof saved !== "object") return s;
    Object.keys(s).forEach(function (k) {
      if (typeof s[k] === "string" && typeof saved[k] === "string") s[k] = saved[k];
    });
    if (Array.isArray(saved.projects)) {
      s.projects = saved.projects.slice(0, MAX_PROJECTS).map(str);
      if (!s.projects.length) s.projects = [""];
    }
    if (Array.isArray(saved.qualities)) s.qualities = saved.qualities.filter(function (q) { return typeof q === "string" && q; }).slice(0, 4);
    if (Array.isArray(saved.companies)) {
      s.companies = saved.companies.slice(0, MAX_COMPANIES).map(function (c) {
        var out = emptyCompany();
        if (c && typeof c === "object") Object.keys(out).forEach(function (k) { out[k] = str(c[k]); });
        return out;
      });
      if (!s.companies.length) s.companies = [emptyCompany()];
    }
    var p = saved.prefill;
    if (p && typeof p === "object") s.prefill = { degree: str(p.degree), school: str(p.school), year: str(p.year), detail: str(p.detail) };
    return s;
  }

  function blankCompany(c) {
    return !c || Object.keys(emptyCompany()).every(function (k) { return V().line(str(c[k])) === ""; });
  }

  /** Companies that will be sent (blank cards are dropped). */
  function companyCount(state) {
    return ((state.internship && state.internship.companies) || []).filter(function (c) { return !blankCompany(c); }).length;
  }

  function studyLevel(s) {
    return s.studyLevel === "Autre" ? V().line(s.studyLevelOther) : V().line(s.studyLevel);
  }

  /** "Comptabilité" → "comptabilité"; acronyms ("RH", "QHSE") are kept. */
  function lowerFirst(s) {
    if (s.length > 1 && s.charAt(1) !== s.charAt(1).toLowerCase()) return s;
    return s.charAt(0).toLowerCase() + s.slice(1);
  }

  function clip(s, max) {
    if (s.length <= max) return s;
    var cut = s.slice(0, max);
    var sp = cut.lastIndexOf(" ");
    return (sp > max / 2 ? cut.slice(0, sp) : cut).replace(/[\s,;:–—-]+$/, "");
  }

  /** CV title used when the student leaves it blank: "Stagiaire en comptabilité" (service visé, else filière). */
  function defaultTitle(s) {
    var base = V().line(s.department) || V().line(s.program);
    return base ? clip("Stagiaire en " + lowerFirst(base), 80) : "";
  }

  /** The education card built from the "Études" step. */
  function formationPrefill(state) {
    var s = state.internship;
    var degree = clip([studyLevel(s), V().line(s.program)].filter(Boolean).join(" "), 100);
    return { degree: degree, school: clip(V().line(s.school), 100), year: s.internshipType === "perfectionnement" ? "" : "En cours", detail: "" };
  }

  function price(prices, count) {
    return count >= 2 ? prices.stageMulti : prices.stage;
  }

  /* ---------- OrderInput ---------- */

  /** Fills data.target / data.internship for the stage product; `index` maps payload positions to cards. */
  function build(state, data, index) {
    var v = V();
    var s = state.internship || defaults();
    var tg = state.target || {};
    data.target = { jobTitle: v.line(s.cvTitle) || defaultTitle(s), kind: "stage", sector: tg.sector, level: "debutant" };
    index.projects = [];
    index.companies = [];
    var projects = [];
    (s.projects || []).forEach(function (p, i) {
      var t = v.line(p);
      if (!t) return;
      index.projects.push(i);
      projects.push(t);
    });
    var companies = [];
    (s.companies || []).forEach(function (c, i) {
      if (blankCompany(c)) return;
      index.companies.push(i);
      companies.push({
        name: v.line(c.name),
        city: v.opt(c.city),
        recipient: v.opt(c.recipient),
        department: v.opt(c.department),
        reason: v.line(c.reason)
      });
    });
    data.internship = {
      school: v.line(s.school),
      program: v.line(s.program),
      studyLevel: studyLevel(s),
      internshipType: s.internshipType,
      start: v.opt(s.start),
      end: v.opt(s.end),
      durationText: v.opt(s.durationText),
      conventionProvided: s.conventionProvided === "oui" ? true : s.conventionProvided === "non" ? false : undefined,
      department: v.opt(s.department),
      projects: projects,
      qualities: v.cleanList(s.qualities, 4),
      channel: s.channel,
      companies: companies
    };
    delete data.letter;
  }

  /** Stage rules on top of the shared ones (identity, education, experiences, skills, languages…). */
  function validate(data, f) {
    function need(path, value, max, missing) {
      if (!value) f[path] = missing;
      else if (value.length > max) f[path] = max + " caractères maximum.";
    }
    function cap(path, value, max) {
      if (value && value.length > max) f[path] = max + " caractères maximum.";
    }
    var it = data.internship;
    if (!it) {
      f.internship = "Complétez les informations sur votre stage.";
      return f;
    }
    if (f["target.sector"]) f["target.sector"] = "Choisissez le domaine de votre filière.";
    if (f["target.jobTitle"] && !it.program) delete f["target.jobTitle"];
    delete f["target.kind"];
    delete f["target.level"];
    need("internship.school", it.school, 100, "Indiquez votre école ou université.");
    need("internship.program", it.program, 100, "Indiquez votre filière.");
    need("internship.studyLevel", it.studyLevel, 40, "Indiquez votre niveau d'études.");
    if (TYPES.indexOf(it.internshipType) === -1) f["internship.internshipType"] = "Choisissez le type de stage.";
    cap("internship.start", it.start, 30);
    cap("internship.end", it.end, 30);
    cap("internship.durationText", it.durationText, 30);
    cap("internship.department", it.department, 80);
    if (typeof it.conventionProvided !== "boolean") f["internship.conventionProvided"] = "Indiquez si votre école fournit une convention de stage.";
    if (CHANNELS.indexOf(it.channel) === -1) f["internship.channel"] = "Choisissez comment vous enverrez vos candidatures.";
    if (it.projects.length > MAX_PROJECTS) f["internship.projects"] = MAX_PROJECTS + " projets maximum.";
    it.projects.forEach(function (p, i) { cap("internship.projects." + i, p, 200); });
    it.qualities.forEach(function (q, i) { cap("internship.qualities." + i, q, 40); });
    if (!it.companies.length) f["internship.companies"] = "Ajoutez au moins une entreprise.";
    else if (it.companies.length > MAX_COMPANIES) f["internship.companies"] = MAX_COMPANIES + " entreprises maximum.";
    it.companies.forEach(function (c, i) {
      var p = "internship.companies." + i + ".";
      need(p + "name", c.name, 100, "Indiquez le nom de l'entreprise.");
      cap(p + "city", c.city, 60);
      cap(p + "recipient", c.recipient, 100);
      cap(p + "department", c.department, 80);
      if (!c.reason) f[p + "reason"] = "Expliquez avec vos mots pourquoi cette entreprise (" + REASON_MIN + " caractères minimum).";
      else if (c.reason.length < REASON_MIN) f[p + "reason"] = "Écrivez au moins " + REASON_MIN + " caractères (" + c.reason.length + " pour l'instant).";
      else if (c.reason.length > REASON_MAX) f[p + "reason"] = REASON_MAX + " caractères maximum.";
    });
    if (!data.education.length && !it.projects.length && !data.experiences.length && !f.experiences) {
      f.experiences = "Ajoutez au moins une formation, un projet ou une expérience (stage, job, bénévolat…).";
    }
    return f;
  }

  /* ---------- Steps and error paths ---------- */

  /** Wizard step of an error path for the stage product; undefined = use the default mapping. */
  function stepOf(path) {
    var parts = path.split(".");
    if (parts[0] === "internship") {
      var k = parts[1];
      if (ETUDES_KEYS.indexOf(k) !== -1) return "etudes";
      if (STAGE_KEYS.indexOf(k) !== -1) return "stage";
      if (k === "projects") return "experiences";
      if (k === "qualities") return "competences";
      if (k === "companies") return "entreprises";
      return null;
    }
    if (path === "target.sector") return "etudes";
    if (parts[0] === "target" || parts[0] === "letter") return null;
    return undefined;
  }

  /** Server/client path → path of the field on screen (the CV title field stands for target.jobTitle). */
  function screenPath(path) {
    return path === "target.jobTitle" ? "internship.cvTitle" : path;
  }

  /* ---------- Stage-only form parts ---------- */

  var ctx = null; // { state(), save(), clearError(path) } from wizard.js

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function renderProjects() {
    var el = TCV.dom.el;
    var list = $("#proj-list");
    if (!list) return;
    var projects = ctx.state().internship.projects;
    TCV.dom.clear(list);
    projects.forEach(function (text, i) {
      var id = "f-internship-projects-" + i;
      var name = "internship.projects." + i;
      var ta = el("textarea", { id: id, name: name, maxlength: 200, rows: 3, placeholder: i === 0 ? PROJECT_PLACEHOLDER : null, "aria-describedby": "e-proj-" + i + " c-proj-" + i });
      ta.value = text || "";
      var remove = null;
      if (projects.length > 1) {
        remove = el("button", { type: "button", class: "btn-danger-link", "aria-label": "Supprimer le projet " + (i + 1), text: "Supprimer" });
        remove.addEventListener("click", function () {
          projects.splice(i, 1);
          renderProjects();
          ctx.save();
          $("#proj-add").focus();
        });
      }
      list.appendChild(el("div", { class: "field proj-field" }, [
        el("div", { class: "proj-head" }, [el("label", { for: id, text: "Projet ou activité " + (i + 1) }), remove]),
        ta,
        el("span", { class: "counter", id: "c-proj-" + i, "data-counter-for": id, text: ta.value.length + " / 200" }),
        el("p", { class: "field-error", id: "e-proj-" + i, "data-error-for": name })
      ]));
    });
    $("#proj-add").hidden = projects.length >= MAX_PROJECTS;
  }

  function addProject() {
    var projects = ctx.state().internship.projects;
    if (projects.length >= MAX_PROJECTS) return;
    projects.push("");
    renderProjects();
    ctx.save();
    var last = document.getElementById("f-internship-projects-" + (projects.length - 1));
    if (last) last.focus();
  }

  function renderCompanies() {
    var list = $("#company-list");
    if (!list) return;
    var companies = ctx.state().internship.companies;
    var tpl = document.getElementById("tpl-company");
    TCV.dom.clear(list);
    companies.forEach(function (item, i) {
      var card = tpl.content.firstElementChild.cloneNode(true);
      var title = "Entreprise " + (i + 1);
      $("[data-card-title]", card).textContent = title;
      Array.prototype.forEach.call(card.querySelectorAll("[data-field]"), function (input) {
        var f = input.getAttribute("data-field");
        var key = "internship-companies-" + i + "-" + f;
        input.id = "f-" + key;
        input.name = "internship.companies." + i + "." + f;
        input.value = item[f] || "";
        var label = $('[data-for="' + f + '"]', card);
        if (label) label.setAttribute("for", input.id);
        var described = [];
        var hint = $('[data-hint="' + f + '"]', card);
        if (hint) {
          hint.id = "h-" + key;
          described.push(hint.id);
        }
        var err = $('[data-error="' + f + '"]', card);
        if (err) {
          err.id = "e-" + key;
          err.setAttribute("data-error-for", input.name);
          described.push(err.id);
        }
        var counter = $('[data-counter="' + f + '"]', card);
        if (counter) {
          counter.id = "c-" + key;
          counter.setAttribute("data-counter-for", input.id);
          described.push(counter.id);
        }
        input.setAttribute("aria-describedby", described.join(" "));
      });
      var remove = $("[data-remove]", card);
      remove.hidden = companies.length < 2;
      remove.setAttribute("aria-label", "Supprimer « " + title + " »");
      remove.addEventListener("click", function () {
        companies.splice(i, 1);
        renderCompanies();
        updatePrice();
        ctx.save();
        $("#company-add").focus();
      });
      list.appendChild(card);
    });
    updateCounters(list);
    $("#company-add").hidden = companies.length >= MAX_COMPANIES;
    updatePrice();
  }

  function addCompany() {
    var companies = ctx.state().internship.companies;
    if (companies.length >= MAX_COMPANIES) return;
    companies.push(emptyCompany());
    renderCompanies();
    ctx.save();
    var input = document.getElementById("f-internship-companies-" + (companies.length - 1) + "-name");
    if (input) input.focus();
  }

  /** "12 / 300 (20 minimum)": counters with data-min also show the minimum while it is not reached. */
  function updateCounters(root) {
    Array.prototype.forEach.call(root.querySelectorAll("[data-counter-for]"), function (c) {
      var t = document.getElementById(c.getAttribute("data-counter-for"));
      if (!t) return;
      var min = Number(c.getAttribute("data-min")) || 0;
      var len = t.value.length;
      c.textContent = len + " / " + t.maxLength + (min && len < min ? " (" + min + " minimum)" : "");
    });
  }

  var shownCount = null;

  /** Live price of the entreprises step: 1 company vs 2–5 companies. */
  function updatePrice() {
    var box = $("#stage-price");
    if (!box || !ctx) return;
    var n = Math.max(1, companyCount(ctx.state()));
    TCV.loadConfig().then(function (cfg) {
      var text = n + (n > 1 ? " entreprises" : " entreprise");
      var amount = TCV.fmt.fcfa(price(cfg.prices, n));
      if (shownCount === text + amount) return;
      shownCount = text + amount;
      TCV.dom.setText($("#stage-price-count"), "Prix pour " + text);
      TCV.dom.setText($("#stage-price-amount"), amount);
    });
  }

  /** Placeholder of the optional CV title field = the title used when it stays blank. */
  function updateTitleHint() {
    var input = $("#f-cvTitle");
    if (!input || !ctx) return;
    input.placeholder = defaultTitle(ctx.state().internship) || "Stagiaire en comptabilité";
  }

  /** "Précisez votre niveau" appears only for "Autre". */
  function updateLevelOther() {
    var box = $("#study-level-other");
    if (!box || !ctx) return;
    box.hidden = ctx.state().internship.studyLevel !== "Autre";
  }

  function fillStatic() {
    var el = TCV.dom.el;
    var level = $("#f-studyLevel");
    if (level) D.studyLevels.forEach(function (l) { level.appendChild(el("option", { value: l, text: l === "DUT/ISEP" ? "DUT / ISEP" : l })); });
    var sector = $("#f-stage-sector");
    if (sector) D.sectors.forEach(function (s) { sector.appendChild(el("option", { value: s.key, text: s.label })); });
    var types = $("#stage-type-options");
    if (types) {
      D.internshipTypes.forEach(function (t) {
        types.appendChild(el("label", null, [
          el("input", { type: "radio", name: "internship.internshipType", value: t.key, "aria-describedby": "e-internshipType" }),
          el("span", { class: "c-title", text: "Stage " + t.label }),
          el("span", { class: "c-desc", text: t.hint })
        ]));
      });
    }
    var channels = $("#stage-channel-options");
    if (channels) {
      D.channels.forEach(function (c) {
        channels.appendChild(el("label", null, [el("input", { type: "radio", name: "internship.channel", value: c.key }), el("span", { text: c.label })]));
      });
    }
  }

  /** Called once by wizard.init(). */
  function init(context) {
    ctx = context;
    fillStatic();
    var addP = $("#proj-add");
    if (addP) addP.addEventListener("click", addProject);
    var addC = $("#company-add");
    if (addC) addC.addEventListener("click", addCompany);
  }

  function render() {
    renderProjects();
    renderCompanies();
    updateTitleHint();
    updateLevelOther();
  }

  /** Field changes inside the stage parts (counters with minimum, price, title hint, "Autre"). */
  function onField(name, target) {
    if (/^internship\.companies\./.test(name)) {
      updatePrice();
      if (target && target.tagName === "TEXTAREA") updateCounters(target.parentNode);
    } else if (name === "internship.program" || name === "internship.department") {
      updateTitleHint();
    } else if (name === "internship.studyLevel") {
      updateLevelOther();
    }
  }

  TCV.stageForm = {
    STEPS: STEPS,
    TYPES: TYPES,
    CHANNELS: CHANNELS,
    MAX_COMPANIES: MAX_COMPANIES,
    defaults: defaults,
    restore: restore,
    build: build,
    validate: validate,
    stepOf: stepOf,
    screenPath: screenPath,
    price: price,
    companyCount: companyCount,
    defaultTitle: defaultTitle,
    formationPrefill: formationPrefill,
    init: init,
    render: render,
    onField: onField,
    updatePrice: updatePrice,
    updateTitleHint: updateTitleHint
  };
})();
