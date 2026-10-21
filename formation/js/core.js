// Teranga Pro — shared core for every formation page: DOM helpers, safe storage, French formatting, API client
// (same ApiError as the CV site), public config, URLs, « Mes formations » book. Exposed as window.TPRO.
// apiBase comes from ../cv/config.js (window.TCV_CONFIG), loaded before this file.
(function () {
  "use strict";

  var TPRO = (window.TPRO = window.TPRO || {});
  var NBSP = " ";

  /* ---------- DOM ---------- */

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /** el("p", { class: "x", text: "…" }, [children]) — text always through textContent. */
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === "text") n.textContent = String(v);
        else if (k === "class") n.className = v;
        else n.setAttribute(k, v === true ? "" : String(v));
      });
    }
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function setText(node, text) {
    if (node) node.textContent = text == null ? "" : String(text);
  }

  /** Busy state on a button: disabled, spinner, optional temporary label (inside .btn-label). */
  function busy(btn, on, text) {
    if (!btn) return;
    var label = $(".btn-label", btn);
    if (on) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      if (label) {
        if (!btn.hasAttribute("data-label")) btn.setAttribute("data-label", label.textContent);
        if (text) label.textContent = text;
      }
      if (!$(".spinner", btn)) btn.insertBefore(el("span", { class: "spinner", "aria-hidden": "true" }), btn.firstChild);
    } else {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      var sp = $(".spinner", btn);
      if (sp) btn.removeChild(sp);
      if (label && btn.hasAttribute("data-label")) label.textContent = btn.getAttribute("data-label");
      btn.removeAttribute("data-label");
    }
  }

  /** Field error under an input: <p class="field-error" id="{inputId}-error">. Empty text clears it. */
  function fieldError(input, message) {
    if (!input) return;
    var box = document.getElementById(input.id + "-error");
    setText(box, message || "");
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  /* ---------- Storage (private mode / blocked storage never breaks a page) ---------- */

  var store = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove: function (key) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        /* storage unavailable */
      }
    }
  };

  /* ---------- Formatting (fr-FR, Africa/Dakar) ---------- */

  function group(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }

  /** 25000 → "25 000 FCFA" (NBSP as thousands separator and before FCFA). */
  function fcfa(n) {
    return group(n) + NBSP + "FCFA";
  }

  var TZ = "Africa/Dakar";

  function parts(iso) {
    if (!iso) return null;
    var d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00Z" : iso);
    if (isNaN(d.getTime())) return null;
    var out = { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
    try {
      var f = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" });
      f.formatToParts(d).forEach(function (p) {
        if (p.type === "year") out.y = Number(p.value);
        else if (p.type === "month") out.m = Number(p.value);
        else if (p.type === "day") out.d = Number(p.value);
        else if (p.type === "hour") out.h = Number(p.value) % 24;
        else if (p.type === "minute") out.min = Number(p.value);
      });
    } catch (e) {
      /* Dakar is UTC+0 all year: the UTC fields are right */
    }
    return out;
  }

  function two(n) {
    return n < 10 ? "0" + n : String(n);
  }

  /** "21/10/2026" */
  function date(iso) {
    var p = parts(iso);
    return p ? two(p.d) + "/" + two(p.m) + "/" + p.y : "";
  }

  /** "21/10/2026 à 10 h 04" (Dakar time) */
  function dateTime(iso) {
    var p = parts(iso);
    return p ? two(p.d) + "/" + two(p.m) + "/" + p.y + " à " + p.h + NBSP + "h" + NBSP + two(p.min) : "";
  }

  var MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  /** "22 octobre 2026" ("1er" for the first day of a month). */
  function longDate(iso) {
    var p = parts(iso);
    if (!p) return "";
    return (p.d === 1 ? "1er" : String(p.d)) + NBSP + MONTHS[p.m - 1] + NBSP + p.y;
  }

  /** 48213 → "48 Ko" */
  function size(bytes) {
    var b = Math.max(0, Number(bytes) || 0);
    if (b < 1000) return b + NBSP + "octets";
    if (b < 1000000) return Math.round(b / 1000) + NBSP + "Ko";
    return String(Math.round(b / 100000) / 10).replace(".", ",") + NBSP + "Mo";
  }

  function percent(n) {
    return Math.round(Number(n) || 0) + NBSP + "%";
  }

  /* ---------- API (copy of TCV.api.request: same ApiError, same timeouts) ---------- */

  function ApiError(status, code, message, fields) {
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.message = message;
    this.fields = fields || null;
  }
  ApiError.prototype = Object.create(Error.prototype);

  function fallbackMessage(status, code) {
    if (code === "network") return "Connexion impossible. Vérifiez votre connexion internet puis réessayez.";
    if (code === "timeout") return "Le serveur met trop de temps à répondre. Réessayez dans un instant.";
    if (status === 429) return "Trop de demandes en peu de temps. Patientez quelques minutes puis réessayez.";
    if (status === 404) return "Commande introuvable. Vérifiez le lien.";
    return "Un problème technique est survenu. Réessayez dans un instant.";
  }

  function apiBase() {
    var cfg = window.TCV_CONFIG || {};
    return String(cfg.apiBase || "").replace(/\/+$/, "");
  }

  /** JSON request to the API. Resolves with the parsed body, rejects with ApiError. */
  function request(method, path, opts) {
    opts = opts || {};
    var headers = {};
    var init = { method: method, headers: headers, cache: "no-store" };
    if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    if (ctrl) init.signal = ctrl.signal;
    var timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, opts.timeout || 20000);

    return fetch(apiBase() + path, init)
      .then(
        function (res) {
          return res.text().then(function (txt) {
            var data = null;
            try {
              data = txt ? JSON.parse(txt) : null;
            } catch (e) {
              data = null;
            }
            if (!res.ok) {
              var code = (data && data.error) || "http_" + res.status;
              throw new ApiError(res.status, code, (data && data.message) || fallbackMessage(res.status, code), data && data.fields);
            }
            return data;
          });
        },
        function (err) {
          var code = err && err.name === "AbortError" ? "timeout" : "network";
          throw new ApiError(0, code, fallbackMessage(0, code));
        }
      )
      .finally(function () {
        clearTimeout(timer);
      });
  }

  /** "/orders/TCV-…" + suffix */
  function orderPath(id, suffix) {
    return "/orders/" + encodeURIComponent(id) + (suffix || "");
  }

  /* ---------- Public config (GET /config → courses.pq_essentiel) ---------- */

  var PRODUCT = "pq_essentiel";
  var DEFAULT_PRICE = 25000;
  var configPromise = null;

  /** Resolves { price, open, payment, loaded }. Any failure → { price: 25000, open: false } (closed stays). */
  function loadConfig() {
    if (!configPromise) {
      configPromise = request("GET", "/config", { timeout: 12000 }).then(
        function (c) {
          var course = (c && c.courses && c.courses[PRODUCT]) || {};
          var price = Number(course.price);
          return {
            price: price > 0 ? price : DEFAULT_PRICE,
            open: course.open === true,
            payment: (c && c.payment) || {},
            loaded: true
          };
        },
        function () {
          return { price: DEFAULT_PRICE, open: false, payment: {}, loaded: false };
        }
      );
    }
    return configPromise;
  }

  /* ---------- URLs ---------- */

  function param(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (e) {
      return null;
    }
  }

  /** Absolute URL of the folder holding the current page, without trailing slash (checkout returnBase). */
  function returnBase() {
    return window.location.origin + window.location.pathname.replace(/\/[^/]*$/, "");
  }

  function withOrder(page, id, t) {
    return page + "?o=" + encodeURIComponent(id) + "&t=" + encodeURIComponent(t);
  }

  var url = {
    param: param,
    returnBase: returnBase,
    readerUrl: function (id, t) {
      return withOrder("lecture.html", id, t);
    },
    receiptUrl: function (id, t) {
      return withOrder("recu.html", id, t);
    },
    attestationUrl: function (id, t) {
      return withOrder("attestation.html", id, t);
    },
    publicAttestationUrl: function (code) {
      return "attestation.html?c=" + encodeURIComponent(code);
    },
    /** Absolute URL of a page of this folder. */
    absolute: function (relative) {
      return returnBase() + "/" + relative;
    }
  };

  /* ---------- « Mes formations » (tpro:courses, newest first, max 10) ---------- */

  var COURSES_KEY = "tpro:courses";

  var courses = {
    list: function () {
      var list = store.get(COURSES_KEY, []);
      return Array.isArray(list)
        ? list.filter(function (c) {
            return c && typeof c.id === "string" && typeof c.token === "string";
          })
        : [];
    },
    save: function (entry) {
      if (!entry || !entry.id || !entry.token) return;
      var list = courses.list().filter(function (c) {
        return c.id !== entry.id;
      });
      list.unshift({ id: entry.id, token: entry.token, product: entry.product || PRODUCT, createdAt: entry.createdAt || new Date().toISOString() });
      store.set(COURSES_KEY, list.slice(0, 10));
    },
    find: function (id) {
      return (
        courses.list().filter(function (c) {
          return c.id === id;
        })[0] || null
      );
    }
  };

  /* ---------- WhatsApp & clipboard ---------- */

  /** Self-send link: WhatsApp asks the person to pick a chat (their own number, « Moi »). */
  function whatsappSelfLink(text) {
    return "https://wa.me/?text=" + encodeURIComponent(text);
  }

  function whatsappLink(number, text) {
    var digits = String(number || "").replace(/\D/g, "");
    var base = digits.length >= 8 ? "https://wa.me/" + digits : "https://wa.me/";
    return text ? base + "?text=" + encodeURIComponent(text) : base;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        return legacyCopy(text);
      });
    }
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = el("textarea", { readonly: true, "aria-hidden": "true", class: "offscreen" });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e) {
        ok = false;
      }
      document.body.removeChild(ta);
      if (ok) resolve();
      else reject(new Error("copy failed"));
    });
  }

  /* ---------- Validation shared by the forms (mirrors validate_course.ts) ---------- */

  function clean(s) {
    return String(s == null ? "" : s)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  var NAME_RE = (function () {
    try {
      return new RegExp("^[\\p{L}\\p{M}][\\p{L}\\p{M}'’ .-]*$", "u");
    } catch (e) {
      return /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’ .-]*$/;
    }
  })();
  var LETTER_RE = (function () {
    try {
      return new RegExp("\\p{L}", "gu");
    } catch (e) {
      return /[A-Za-zÀ-ɏ]/g;
    }
  })();
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function nameOk(name) {
    var letters = name.match(LETTER_RE);
    return name.length >= 2 && name.length <= 80 && NAME_RE.test(name) && !!letters && letters.length >= 2;
  }

  function emailOk(email) {
    return email.length <= 80 && EMAIL_RE.test(email);
  }

  /** normalizeIntlPhone: "+225 07 07 07 07 07" → "+2250707070707", "00221…" → "+221…", else null. */
  function intlPhone(s) {
    var v = clean(s).replace(/[\s.\-()]/g, "");
    if (/^00/.test(v)) v = "+" + v.slice(2);
    return /^\+?\d{8,15}$/.test(v) ? v : null;
  }

  /** [data-owner-whatsapp] blocks (legal pages) show the seller's WhatsApp link once GET /config gives it. */
  function applyOwnerContact() {
    var nodes = $$("[data-owner-whatsapp]");
    if (!nodes.length) return;
    loadConfig().then(function (cfg) {
      var number = cfg.payment && cfg.payment.ownerWhatsapp;
      if (!number) return;
      nodes.forEach(function (n) {
        var a = n.tagName === "A" ? n : $("a", n);
        if (a) {
          a.href = whatsappLink(number, "Bonjour, j'ai une question sur la formation Power Query (Teranga Pro).");
          a.target = "_blank";
          a.rel = "noopener noreferrer";
        }
        n.hidden = false;
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyOwnerContact);
  else applyOwnerContact();

  TPRO.dom = { $: $, $$: $$, el: el, clear: clear, setText: setText, busy: busy, fieldError: fieldError };
  TPRO.store = store;
  TPRO.fmt = { fcfa: fcfa, date: date, dateTime: dateTime, longDate: longDate, size: size, percent: percent, NBSP: NBSP };
  TPRO.api = { request: request, ApiError: ApiError, base: apiBase, orderPath: orderPath };
  TPRO.loadConfig = loadConfig;
  TPRO.url = url;
  TPRO.courses = courses;
  TPRO.whatsappSelfLink = whatsappSelfLink;
  TPRO.whatsappLink = whatsappLink;
  TPRO.copyText = copyText;
  TPRO.validate = { clean: clean, nameOk: nameOk, emailOk: emailOk, intlPhone: intlPhone };
  TPRO.PRODUCT = PRODUCT;
  TPRO.COURSE_LABEL = "Formation " + "«" + NBSP + "Power Query pour le reporting bancaire" + NBSP + "»";
})();
