// Client-side mirror of the server validation (supabase/functions/api/lib/validate.ts, SPEC "Validation").
// buildInput() turns the wizard state into the OrderInput the API expects; validate() returns
// { "<dotted.path>": "<French message>" } using the same paths as the server's `fields`.
(function () {
  "use strict";

  var TCV = (window.TCV = window.TCV || {});

  var ENUMS = {
    civility: ["M", "Mme"],
    kind: ["emploi", "stage", "alternance"],
    level: ["debutant", "junior", "confirme", "senior"],
    sector: ["commerce", "comptabilite", "informatique", "sante", "enseignement", "administration", "btp", "hotellerie", "logistique", "communication", "agriculture", "securite", "autre"],
    languageLevel: ["Langue maternelle", "Courant", "Bon niveau", "Intermédiaire", "Notions"]
  };

  // eslint-disable-next-line no-control-regex
  var CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

  /** Single-line field: strip control chars, collapse whitespace, trim. */
  function line(s) {
    return typeof s === "string" ? s.replace(CONTROL, " ").replace(/\s+/g, " ").trim() : "";
  }

  /** Multi-line field (missions, motivation): keep newlines, tidy each line. */
  function text(s) {
    if (typeof s !== "string") return "";
    return s
      .replace(/\r\n?/g, "\n")
      .replace(CONTROL, " ")
      .split("\n")
      .map(function (l) { return l.replace(/[ \t ]+/g, " ").trim(); })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function opt(s) {
    var v = line(s);
    return v === "" ? undefined : v;
  }

  function normalizeSnMobile(input) {
    if (typeof input !== "string") return null;
    var compact = input.trim().replace(/[\s.\-()]/g, "");
    var m = /^(?:\+221|00221|221)?(7[015678]\d{7})$/.exec(compact);
    return m ? "+221" + m[1] : null;
  }

  function isPhone(s) {
    return normalizeSnMobile(s) !== null || /^[+0-9 ]{8,20}$/.test(s);
  }

  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
  }

  function allBlank(obj) {
    return Object.keys(obj).every(function (k) { return line(String(obj[k] == null ? "" : obj[k])) === ""; });
  }

  function cleanList(list, max) {
    var seen = {};
    return (list || [])
      .map(line)
      .filter(function (s) {
        var k = s.toLowerCase();
        if (!s || seen[k]) return false;
        seen[k] = true;
        return true;
      })
      .slice(0, max);
  }

  /**
   * Wizard state → { data: OrderInput, index: { education: [stateIdx…], experiences: […], languages: […] } }.
   * Blank repeatable cards are dropped; `index` maps payload positions back to the cards on screen.
   */
  function buildInput(state, product) {
    var index = { education: [], experiences: [], languages: [] };
    var id = state.identity || {};
    var tg = state.target || {};
    var data = {
      identity: {
        civility: id.civility,
        firstName: line(id.firstName),
        lastName: line(id.lastName),
        phone: line(id.phone),
        email: opt(id.email),
        city: line(id.city),
        address: opt(id.address)
      },
      target: { jobTitle: line(tg.jobTitle), kind: tg.kind, sector: tg.sector, level: tg.level },
      education: [],
      experiences: [],
      skills: cleanList(state.skills, 20),
      it: cleanList(state.it, 15),
      languages: [],
      interests: product === "lettre" ? [] : cleanList(state.interests, 8)
    };
    (state.education || []).forEach(function (e, i) {
      if (allBlank(e)) return;
      index.education.push(i);
      data.education.push({ degree: line(e.degree), school: opt(e.school), year: opt(e.year), detail: opt(e.detail) });
    });
    (state.experiences || []).forEach(function (e, i) {
      if (allBlank(e)) return;
      index.experiences.push(i);
      data.experiences.push({
        title: line(e.title),
        company: opt(e.company),
        place: opt(e.place),
        start: opt(e.start),
        end: opt(e.end),
        missions: text(e.missions) || undefined
      });
    });
    if (product !== "lettre") {
      (state.languages || []).forEach(function (l, i) {
        if (!line(l.name)) return;
        index.languages.push(i);
        data.languages.push({ name: line(l.name), level: l.level });
      });
    }
    if (product === "stage" && TCV.stageForm) TCV.stageForm.build(state, data, index);
    if (product === "lettre" || product === "pack") {
      var lt = state.letter || {};
      data.letter = {
        company: line(lt.company),
        recipient: opt(lt.recipient),
        companyCity: opt(lt.companyCity),
        source: opt(lt.source),
        qualities: cleanList(lt.qualities, 4),
        motivation: text(lt.motivation) || undefined
      };
    }
    return { data: data, index: index };
  }

  function validate(product, data) {
    var f = {};
    function need(path, value, max, missing) {
      if (!value) f[path] = missing;
      else if (value.length > max) f[path] = max + " caractères maximum.";
    }
    function cap(path, value, max) {
      if (value && value.length > max) f[path] = max + " caractères maximum.";
    }
    function oneOf(path, value, list, msg) {
      if (list.indexOf(value) === -1) f[path] = msg;
    }

    var id = data.identity;
    oneOf("identity.civility", id.civility, ENUMS.civility, "Choisissez Monsieur ou Madame.");
    need("identity.firstName", id.firstName, 40, "Indiquez votre prénom.");
    need("identity.lastName", id.lastName, 40, "Indiquez votre nom.");
    if (!id.phone) f["identity.phone"] = "Indiquez votre numéro de téléphone.";
    else if (!isPhone(id.phone)) f["identity.phone"] = "Numéro invalide. Exemple : 77 123 45 67.";
    if (id.email && id.email.length > 80) f["identity.email"] = "80 caractères maximum.";
    else if (id.email && !isEmail(id.email)) f["identity.email"] = "Adresse e-mail invalide (exemple : prenom.nom@gmail.com).";
    need("identity.city", id.city, 60, "Indiquez votre ville.");
    cap("identity.address", id.address, 80);

    var tg = data.target;
    need("target.jobTitle", tg.jobTitle, 80, "Indiquez le poste que vous visez.");
    oneOf("target.kind", tg.kind, ENUMS.kind, "Choisissez emploi, stage ou alternance.");
    oneOf("target.sector", tg.sector, ENUMS.sector, "Choisissez un secteur.");
    oneOf("target.level", tg.level, ENUMS.level, "Choisissez votre niveau d'expérience.");

    if (data.education.length > 6) f.education = "6 formations maximum.";
    data.education.forEach(function (e, i) {
      var p = "education." + i + ".";
      need(p + "degree", e.degree, 100, "Indiquez le diplôme ou la formation.");
      cap(p + "school", e.school, 100);
      cap(p + "year", e.year, 20);
      cap(p + "detail", e.detail, 100);
    });

    if (data.experiences.length > 6) f.experiences = "6 expériences maximum.";
    data.experiences.forEach(function (e, i) {
      var p = "experiences." + i + ".";
      need(p + "title", e.title, 80, "Indiquez le poste occupé.");
      cap(p + "company", e.company, 80);
      cap(p + "place", e.place, 60);
      cap(p + "start", e.start, 20);
      cap(p + "end", e.end, 20);
      cap(p + "missions", e.missions, 800);
    });
    if (product !== "lettre" && product !== "stage" && !data.education.length && !data.experiences.length && !f.experiences) {
      f.experiences = "Ajoutez au moins une formation ou une expérience (stage, petit boulot, bénévolat…).";
    }

    data.skills.forEach(function (s, i) { cap("skills." + i, s, 60); });
    data.it.forEach(function (s, i) { cap("it." + i, s, 40); });
    data.interests.forEach(function (s, i) { cap("interests." + i, s, 40); });
    data.languages.forEach(function (l, i) {
      cap("languages." + i + ".name", l.name, 30);
      oneOf("languages." + i + ".level", l.level, ENUMS.languageLevel, "Choisissez un niveau.");
    });

    if (data.letter) {
      var lt = data.letter;
      need("letter.company", lt.company, 100, "Indiquez le nom de l'entreprise.");
      cap("letter.recipient", lt.recipient, 100);
      cap("letter.companyCity", lt.companyCity, 60);
      cap("letter.source", lt.source, 100);
      cap("letter.motivation", lt.motivation, 600);
      lt.qualities.forEach(function (q, i) { cap("letter.qualities." + i, q, 40); });
    }
    if (product === "stage" && TCV.stageForm) TCV.stageForm.validate(data, f);
    return f;
  }

  TCV.validate = {
    ENUMS: ENUMS,
    line: line,
    text: text,
    opt: opt,
    cleanList: cleanList,
    normalizeSnMobile: normalizeSnMobile,
    isPhone: isPhone,
    buildInput: buildInput,
    validate: validate
  };
})();
