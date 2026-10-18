// Order form wizard: state + draft autosave, repeatable blocks, chips, per-step validation and submission.
// Navigation between steps goes through opts.navigate(stepKey|null) so the page router owns the URL hash.
(function () {
  "use strict";

  var TCV = window.TCV;
  var D = window.TCV_DATA;
  var V = TCV.validate;
  var S = TCV.stageForm || null; // Pack Stage parts (stage.js)
  var $ = TCV.dom.$;
  var $$ = TCV.dom.$$;
  var el = TCV.dom.el;

  var DRAFT_KEY = "tcv:draft:v1";
  var ALL_STEPS = ["offre", "identite", "objectif", "formation", "experiences", "competences", "langues", "lettre"];
  var STEP_OF = {
    product: "offre", identity: "identite", target: "objectif", education: "formation", experiences: "experiences",
    skills: "competences", it: "competences", languages: "langues", interests: "langues", letter: "lettre"
  };
  var LANGUAGES = ["Français", "Wolof", "Anglais", "Arabe", "Pulaar", "Sérère", "Diola", "Mandinka", "Soninké", "Espagnol", "Portugais", "Italien", "Allemand", "Chinois"];

  // CV Premium steps live in premium-wizard.js (loaded after this file); looked up lazily.
  function PW() {
    return TCV.premiumWizard || null;
  }

  var form;
  var state;
  var current = null;
  var opts = {};
  var chipGroups = [];
  var pendingErrors = {};
  var saveTimer = null;

  /* ---------- State ---------- */

  function emptyEdu() {
    return { degree: "", school: "", year: "", detail: "" };
  }

  function emptyExp() {
    return { title: "", company: "", place: "", start: "", end: "", missions: "" };
  }

  function defaults() {
    return {
      product: "pack",
      template: "classique",
      identity: { civility: "", firstName: "", lastName: "", phone: "", email: "", city: "", address: "" },
      target: { jobTitle: "", kind: "emploi", sector: "", level: "" },
      education: [emptyEdu()],
      experiences: [emptyExp()],
      skills: [],
      it: [],
      languages: [
        { name: "Français", level: "Courant" },
        { name: "Wolof", level: "Langue maternelle" },
        { name: "Anglais", level: "Notions" }
      ],
      interests: [],
      letter: { company: "", recipient: "", companyCity: "", source: "", qualities: [], motivation: "" },
      internship: S ? S.defaults() : null,
      premium: PW() ? PW().defaults() : null
    };
  }

  function copyStrings(target, src) {
    if (src && typeof src === "object") {
      Object.keys(target).forEach(function (k) {
        if (typeof src[k] === "string") target[k] = src[k];
      });
    }
    return target;
  }

  function stringList(list, max) {
    return Array.isArray(list) ? list.filter(function (s) { return typeof s === "string" && s; }).slice(0, max) : [];
  }

  /** Rebuilds a valid state from a saved draft (which may be old, partial or tampered with). */
  function restore(saved) {
    var s = defaults();
    if (!saved || typeof saved !== "object") return s;
    if (["cv", "lettre", "pack", "stage", "premium"].indexOf(saved.product) !== -1) s.product = saved.product;
    if (["classique", "moderne", "elegant"].indexOf(saved.template) !== -1) s.template = saved.template;
    copyStrings(s.identity, saved.identity);
    copyStrings(s.target, saved.target);
    var letter = saved.letter || {};
    copyStrings(s.letter, letter);
    s.letter.qualities = stringList(letter.qualities, 4);
    if (Array.isArray(saved.education)) s.education = saved.education.slice(0, 6).map(function (e) { return copyStrings(emptyEdu(), e); });
    if (Array.isArray(saved.experiences)) s.experiences = saved.experiences.slice(0, 6).map(function (e) { return copyStrings(emptyExp(), e); });
    if (Array.isArray(saved.languages)) {
      s.languages = saved.languages.slice(0, 6).map(function (l) {
        return copyStrings({ name: "", level: "Courant" }, l);
      });
    }
    s.skills = stringList(saved.skills, 20);
    s.it = stringList(saved.it, 15);
    s.interests = stringList(saved.interests, 8);
    if (S) s.internship = S.restore(saved.internship);
    if (PW()) s.premium = PW().restore(saved.premium);
    return s;
  }

  function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    TCV.store.set(DRAFT_KEY, state);
  }

  /** Debounced draft save; flush() runs on every step change and when the page is hidden. */
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 300);
  }

  function getPath(path) {
    return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, state);
  }

  /* ---------- Static options ---------- */

  function fillOptions(select, items) {
    items.forEach(function (it) {
      select.appendChild(el("option", { value: it.key, text: it.label }));
    });
  }

  function fillDatalist(id, values) {
    var dl = document.getElementById(id);
    values.forEach(function (v) {
      dl.appendChild(el("option", { value: v }));
    });
  }

  function fillStatic() {
    fillOptions($("#f-sector"), D.sectors);
    fillOptions($("#f-level"), D.levels);
    var kinds = $("#kind-options");
    D.kinds.forEach(function (k) {
      kinds.appendChild(el("label", null, [el("input", { type: "radio", name: "target.kind", value: k.key }), el("span", { text: k.label })]));
    });
    fillDatalist("dl-cities", D.cities);
    fillDatalist("dl-sources", D.sources);
    fillDatalist("dl-languages", LANGUAGES);
  }

  /* ---------- Writing state into the form ---------- */

  function writeSimpleFields() {
    $$("[name]", form).forEach(function (input) {
      var name = input.name;
      if (!name || name === "website" || /^(education|experiences|languages|internship\.companies|internship\.projects)\./.test(name)) return;
      var v = getPath(name);
      if (input.type === "radio") input.checked = input.value === v;
      else input.value = typeof v === "string" ? v : "";
    });
    updateCounters(form);
  }

  function updateCounters(root) {
    $$("[data-counter-for]", root).forEach(function (c) {
      var t = document.getElementById(c.getAttribute("data-counter-for"));
      var min = Number(c.getAttribute("data-min")) || 0;
      if (t) c.textContent = t.value.length + " / " + t.maxLength + (min && t.value.length < min ? " (" + min + " minimum)" : "");
    });
  }

  function renderCards(kind) {
    var isEdu = kind === "education";
    var list = $(isEdu ? "#edu-list" : "#exp-list");
    var tpl = document.getElementById(isEdu ? "tpl-edu" : "tpl-exp");
    TCV.dom.clear(list);
    state[kind].forEach(function (item, i) {
      var card = tpl.content.firstElementChild.cloneNode(true);
      var title = (isEdu ? "Formation " : "Expérience ") + (i + 1);
      $("[data-card-title]", card).textContent = title;
      $$("[data-field]", card).forEach(function (input) {
        var f = input.getAttribute("data-field");
        var key = kind + "-" + i + "-" + f;
        input.id = "f-" + key;
        input.name = kind + "." + i + "." + f;
        input.value = item[f] || "";
        var label = $('[data-for="' + f + '"]', card);
        if (label) label.setAttribute("for", input.id);
        var err = $('[data-error="' + f + '"]', card);
        if (err) {
          err.id = "e-" + key;
          err.setAttribute("data-error-for", input.name);
          input.setAttribute("aria-describedby", err.id);
        }
      });
      var counter = $("[data-counter]", card);
      if (counter) {
        counter.setAttribute("data-counter-for", "f-" + kind + "-" + i + "-missions");
        counter.id = "c-" + kind + "-" + i;
      }
      var remove = $("[data-remove]", card);
      remove.setAttribute("aria-label", "Supprimer « " + title + " »");
      remove.addEventListener("click", function () {
        state[kind].splice(i, 1);
        renderCards(kind);
        save();
        $(isEdu ? "#edu-add" : "#exp-add").focus();
      });
      list.appendChild(card);
    });
    updateCounters(list);
    $(isEdu ? "#edu-add" : "#exp-add").hidden = state[kind].length >= 6;
  }

  function addCard(kind) {
    state[kind].push(kind === "education" ? emptyEdu() : emptyExp());
    renderCards(kind);
    save();
    var inputs = $$("#" + (kind === "education" ? "edu" : "exp") + "-list .repeat-card:last-child [data-field]");
    if (inputs[0]) inputs[0].focus();
  }

  function renderLanguages() {
    var list = $("#lang-list");
    TCV.dom.clear(list);
    state.languages.forEach(function (l, i) {
      var nameId = "f-lang-" + i;
      var levelId = "f-lang-level-" + i;
      var name = el("input", { type: "text", id: nameId, name: "languages." + i + ".name", maxlength: 30, list: "dl-languages", autocomplete: "off" });
      name.value = l.name || "";
      var level = el("select", { id: levelId, name: "languages." + i + ".level" });
      D.languageLevels.forEach(function (lv) {
        level.appendChild(el("option", { value: lv, text: lv }));
      });
      level.value = D.languageLevels.indexOf(l.level) !== -1 ? l.level : "Courant";
      var remove = el("button", { type: "button", class: "icon-btn", "aria-label": "Retirer " + (l.name || "cette langue"), text: "×" });
      remove.addEventListener("click", function () {
        state.languages.splice(i, 1);
        renderLanguages();
        save();
        $("#lang-add").focus();
      });
      list.appendChild(el("div", { class: "lang-row" }, [
        el("div", { class: "field" }, [el("label", { for: nameId, text: "Langue" }), name, el("p", { class: "field-error", "data-error-for": "languages." + i + ".name" })]),
        el("div", { class: "field" }, [el("label", { for: levelId, text: "Niveau" }), level, el("p", { class: "field-error", "data-error-for": "languages." + i + ".level" })]),
        remove
      ]));
    });
    $("#lang-add").hidden = state.languages.length >= 6;
  }

  /* ---------- Chips ---------- */

  function lc(s) {
    return String(s).toLowerCase();
  }

  /** Toggle chips bound to a string array in the state (cfg.path), with optional free-text input. */
  function ChipGroup(cfg) {
    this.cfg = cfg;
    var self = this;
    if (cfg.input) {
      var btn = $('[data-add-for="' + cfg.input.id + '"]');
      if (btn) btn.addEventListener("click", function () { self.addTyped(); });
      cfg.input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          self.addTyped();
        }
      });
    }
  }

  ChipGroup.prototype.list = function () {
    return getPath(this.cfg.path);
  };

  ChipGroup.prototype.render = function (focusLabel) {
    var self = this;
    var selected = this.list();
    var keys = selected.map(lc);
    var all = this.cfg.suggestions().slice();
    var allKeys = all.map(lc);
    selected.forEach(function (s) {
      if (allKeys.indexOf(lc(s)) === -1) all.push(s);
    });
    var root = this.cfg.root;
    TCV.dom.clear(root);
    all.forEach(function (label) {
      var on = keys.indexOf(lc(label)) !== -1;
      var b = el("button", { type: "button", class: "chip", "aria-pressed": on ? "true" : "false", text: label });
      if (!on && selected.length >= self.cfg.max) b.disabled = true;
      b.addEventListener("click", function () { self.toggle(label); });
      root.appendChild(b);
      if (focusLabel && lc(focusLabel) === lc(label)) b.focus();
    });
  };

  ChipGroup.prototype.toggle = function (label) {
    var list = this.list();
    var idx = list.map(lc).indexOf(lc(label));
    if (idx !== -1) list.splice(idx, 1);
    else if (list.length < this.cfg.max) list.push(label);
    clearError(this.cfg.path);
    this.render(label);
    save();
  };

  ChipGroup.prototype.addTyped = function () {
    var input = this.cfg.input;
    var v = V.line(input.value);
    if (!v) return;
    var list = this.list();
    if (list.map(lc).indexOf(lc(v)) === -1) {
      if (list.length >= this.cfg.max) {
        setError(this.cfg.path, this.cfg.max + " éléments maximum. Retirez-en un pour en ajouter un autre.");
        return;
      }
      var known = this.cfg.suggestions().filter(function (s) { return lc(s) === lc(v); })[0];
      list.push(known || v);
    }
    input.value = "";
    clearError(this.cfg.path);
    this.render();
    save();
    input.focus();
  };

  function sectorSkills() {
    var sector = D.sectors.filter(function (s) { return s.key === state.target.sector; })[0];
    return sector ? sector.skills : D.sectors[D.sectors.length - 1].skills;
  }

  function buildChipGroups() {
    chipGroups = [
      new ChipGroup({ root: $("#chips-skills"), path: "skills", max: 20, input: $("#add-skill"), suggestions: sectorSkills }),
      new ChipGroup({ root: $("#chips-it"), path: "it", max: 15, input: $("#add-it"), suggestions: function () { return D.itSkills; } }),
      new ChipGroup({ root: $("#chips-interests"), path: "interests", max: 8, input: $("#add-interest"), suggestions: function () { return D.interests; } }),
      new ChipGroup({ root: $("#chips-qualities"), path: "letter.qualities", max: 4, suggestions: function () { return D.qualities; } })
    ];
    if (S && $("#chips-stage-qualities")) {
      chipGroups.push(new ChipGroup({ root: $("#chips-stage-qualities"), path: "internship.qualities", max: 4, suggestions: function () { return D.qualities; } }));
    }
  }

  function renderAll() {
    writeSimpleFields();
    renderCards("education");
    renderCards("experiences");
    renderLanguages();
    chipGroups.forEach(function (g) { g.render(); });
    if (S) S.render();
  }

  /* ---------- Errors ---------- */

  /** Error node for `path`, looked up in the step on screen first (some paths have a node in two steps). */
  function errorTarget(path) {
    var section = current ? $('.step[data-step="' + current + '"]', form) : null;
    return (section && findErrorNode(section, path)) || findErrorNode(form, path);
  }

  function findErrorNode(root, path) {
    var nodes = $$("[data-error-for]", root);
    var p = path;
    while (p) {
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].getAttribute("data-error-for") === p) return nodes[i];
      }
      p = p.indexOf(".") === -1 ? "" : p.slice(0, p.lastIndexOf("."));
    }
    return null;
  }

  function inputsFor(path) {
    return $$("[name]", form).filter(function (n) { return n.name === path; });
  }

  function setError(path, message) {
    var target = errorTarget(path);
    if (target) target.textContent = message;
    inputsFor(path).forEach(function (n) { n.setAttribute("aria-invalid", "true"); });
    return !!target;
  }

  function clearError(path) {
    delete pendingErrors[path];
    var target = errorTarget(path);
    if (target && target.getAttribute("data-error-for") === path) target.textContent = "";
    inputsFor(path).forEach(function (n) { n.removeAttribute("aria-invalid"); });
  }

  function clearAllErrors() {
    $$("[data-error-for]", form).forEach(function (n) { n.textContent = ""; });
    $$("[aria-invalid]", form).forEach(function (n) { n.removeAttribute("aria-invalid"); });
    TCV.dom.setText($("#wz-error"), "");
  }

  function stepOf(path) {
    if (PW() && /^premium(\.|$)/.test(path)) return PW().stepOf(path);
    if (S && state.product === "stage") {
      var st = S.stepOf(path);
      if (st !== undefined) return st;
    }
    return STEP_OF[path.split(".")[0]] || null;
  }

  /** Server/client paths use payload indexes; repeatable cards on screen may include blank ones. */
  function toScreenPaths(fields, index) {
    var out = {};
    Object.keys(fields || {}).forEach(function (path) {
      var m = /^(.+?)\.(\d+)(\..*)?$/.exec(path); // education.2.title, internship.companies.1.reason, premium.achievements.1.tags.0…
      // Pack Stage cards are indexed as "companies" / "projects"; premium lists under their full path.
      var key = m ? (index[m[1]] ? m[1] : m[1].replace(/^internship\./, "")) : null;
      var screen = path;
      if (m && index[key] && index[key][Number(m[2])] != null) screen = m[1] + "." + index[key][Number(m[2])] + (m[3] || "");
      if (S && state.product === "stage") screen = S.screenPath(screen);
      out[screen] = fields[path];
    });
    return out;
  }

  function showErrorsFor(step) {
    clearAllErrors();
    var loose = [];
    Object.keys(pendingErrors).forEach(function (path) {
      var s = stepOf(path);
      if (s === step) {
        if (!setError(path, pendingErrors[path])) loose.push(pendingErrors[path]);
      } else if (!s) {
        loose.push(pendingErrors[path]);
      }
    });
    if (loose.length) TCV.dom.setText($("#wz-error"), loose.join(" "));
  }

  function focusFirstError() {
    var section = $('.step[data-step="' + current + '"]', form);
    var bad = $("[aria-invalid='true']", section);
    if (bad) {
      bad.focus();
      return;
    }
    var msg = $$("[data-error-for]", section).filter(function (n) { return n.textContent; })[0];
    if (msg && msg.scrollIntoView) msg.scrollIntoView({ block: "center" });
  }

  /* ---------- Steps ---------- */

  function steps() {
    if (state.product === "premium" && PW()) return PW().steps();
    if (S && state.product === "stage") return S.STEPS.slice();
    return ALL_STEPS.filter(function (k) {
      if (k === "lettre") return state.product !== "cv";
      if (k === "langues") return state.product !== "lettre";
      return true;
    });
  }

  function show(key) {
    var list = steps();
    if (list.indexOf(key) === -1) key = list[0];
    current = key;
    var i = list.indexOf(key);
    $$(".step", form).forEach(function (s) {
      s.hidden = s.getAttribute("data-step") !== key;
    });
    var section = $('.step[data-step="' + key + '"]', form);
    var isStage = state.product === "stage";
    applyProductParts();
    if (isStage) stageStepHooks(key);
    TCV.dom.setText($("#wz-count"), "Étape " + (i + 1) + " sur " + list.length);
    TCV.dom.setText($("#wz-name"), section.getAttribute(isStage && section.hasAttribute("data-title-stage") ? "data-title-stage" : "data-title"));
    $("#wz-bar").style.width = Math.round(((i + 1) / list.length) * 100) + "%";
    TCV.dom.setText($("#wz-back"), i === 0 ? "Accueil" : "Retour");
    TCV.dom.setText($(".btn-label", $("#wz-next")), i === list.length - 1 ? "Voir mon aperçu gratuit" : "Continuer");
    if (key === "competences") chipGroups[0].render();
    if (PW()) PW().onShow(key, state.product);
    showErrorsFor(key);
    window.scrollTo(0, 0);
    var hasErrors = $$("[data-error-for]", section).some(function (n) { return n.textContent; });
    if (hasErrors) {
      focusFirstError();
      return;
    }
    var h = $("h2", section);
    if (h) h.focus({ preventScroll: true });
  }

  /** Blocks marked data-only="<product>" / data-not="<product>" follow the chosen product. */
  function applyProductParts() {
    $$("[data-only]", form).forEach(function (n) { n.hidden = n.getAttribute("data-only") !== state.product; });
    $$("[data-not]", form).forEach(function (n) { n.hidden = n.getAttribute("data-not") === state.product; });
  }

  function sameEdu(a, b) {
    return !!a && !!b && ["degree", "school", "year", "detail"].every(function (k) { return (a[k] || "") === (b[k] || ""); });
  }

  /** Pack Stage: prefill "Formation" from "Études" (until the student edits it), hide the blank experience card. */
  function stageStepHooks(key) {
    var st = state.internship;
    if (key === "formation") {
      var pre = S.formationPrefill(state);
      var blank = state.education.every(function (e) { return V.line([e.degree, e.school, e.year, e.detail].join(" ")) === ""; });
      if (pre.degree && (blank || sameEdu(state.education[0], st.prefill)) && !sameEdu(state.education[0], pre)) {
        if (!state.education.length) state.education.push(emptyEdu());
        state.education[0] = copyStrings(emptyEdu(), pre);
        st.prefill = copyStrings(emptyEdu(), pre);
        renderCards("education");
        save();
      }
    } else if (key === "experiences") {
      var noExp = state.experiences.every(function (e) { return V.line([e.title, e.company, e.place, e.start, e.end, e.missions].join(" ")) === ""; });
      if (noExp && state.experiences.length) {
        state.experiences = [];
        renderCards("experiences");
        save();
      }
    } else if (key === "stage") {
      S.updateTitleHint();
    } else if (key === "entreprises") {
      S.updatePrice();
    }
  }

  function navigate(key) {
    flush();
    if (opts.navigate) opts.navigate(key);
    else show(key);
  }

  function back() {
    var list = steps();
    var i = list.indexOf(current);
    navigate(i <= 0 ? null : list[i - 1]);
  }

  function next() {
    var list = steps();
    var built = V.buildInput(state, state.product);
    var errors = toScreenPaths(V.validate(state.product, built.data), built.index);
    var mine = {};
    Object.keys(errors).forEach(function (p) {
      if (stepOf(p) === current) mine[p] = errors[p];
    });
    if (Object.keys(mine).length) {
      pendingErrors = mine;
      showErrorsFor(current);
      focusFirstError();
      return;
    }
    var i = list.indexOf(current);
    if (i < list.length - 1) {
      navigate(list[i + 1]);
      return;
    }
    var first = firstStepWithErrors(errors);
    if (first) {
      pendingErrors = errors;
      navigate(first);
      return;
    }
    submit(built);
  }

  function firstStepWithErrors(errors) {
    var list = steps();
    var withErr = Object.keys(errors).map(stepOf).filter(Boolean);
    for (var i = 0; i < list.length; i++) if (withErr.indexOf(list[i]) !== -1) return list[i];
    return null;
  }

  function submit(built) {
    flush();
    var btn = $("#wz-next");
    TCV.dom.busy(btn, true, "Préparation de votre aperçu…");
    $("#wz-back").disabled = true;
    var body = { product: state.product, template: state.template, data: built.data, website: $("#f-website").value };
    Promise.resolve(opts.onSubmit(body))
      .catch(function (err) {
        var fields = err && err.fields ? toScreenPaths(err.fields, built.index) : null;
        var first = fields && firstStepWithErrors(fields);
        if (first) {
          pendingErrors = fields;
          navigate(first);
        } else {
          TCV.dom.setText($("#wz-error"), (err && err.message) || "Un problème est survenu. Réessayez.");
        }
      })
      .then(function () {
        TCV.dom.busy(btn, false);
        $("#wz-back").disabled = false;
      });
  }

  /* ---------- Events ---------- */

  function onField(e) {
    var t = e.target;
    var name = t && t.name;
    if (!name || name === "website") return;
    if (t.type === "radio" && !t.checked) return;
    TCV.setPath(state, name, t.value);
    clearError(name);
    if (t.tagName === "TEXTAREA") updateCounters(t.parentNode);
    if (name === "product") show(current);
    if (name === "target.sector") chipGroups[0].render();
    if (S && name.indexOf("internship.") === 0) S.onField(name, t);
    save();
  }

  function bind() {
    form.addEventListener("input", onField);
    form.addEventListener("change", onField);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      next();
    });
    $("#wz-back").addEventListener("click", back);
    window.addEventListener("pagehide", function () {
      if (saveTimer) flush();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && saveTimer) flush();
    });
    $("#edu-add").addEventListener("click", function () { addCard("education"); });
    $("#exp-add").addEventListener("click", function () { addCard("experiences"); });
    $("#lang-add").addEventListener("click", function () {
      state.languages.push({ name: "", level: "Courant" });
      renderLanguages();
      save();
      var inputs = $$("#lang-list input");
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
  }

  /* ---------- Public API ---------- */

  function init(options) {
    opts = options || {};
    form = $("#wizard");
    state = restore(TCV.store.get(DRAFT_KEY, null));
    fillStatic();
    if (S) S.init({ state: function () { return state; }, save: save, clearError: clearError });
    buildChipGroups();
    bind();
    if (PW()) PW().attach({ state: function () { return state; }, save: save, setError: setError, clearError: clearError, ChipGroup: ChipGroup });
    renderAll();
  }

  /** Starts the wizard, optionally with a product chosen on the landing page. */
  function start(product) {
    if (["cv", "lettre", "pack", "stage", "premium"].indexOf(product) !== -1) {
      state.product = product;
      writeSimpleFields();
      save();
      navigate("identite");
    } else {
      navigate("offre");
    }
  }

  function setTemplate(t) {
    state.template = t;
    save();
  }

  TCV.wizard = {
    init: init,
    show: show,
    start: start,
    steps: steps,
    setTemplate: setTemplate,
    current: function () { return current; },
    product: function () { return state.product; },
    phone: function () { return state.identity.phone; }
  };
})();
