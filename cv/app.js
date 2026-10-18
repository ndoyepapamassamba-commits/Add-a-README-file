// Shared core for every page: DOM helpers, safe storage, formatting, API client, public config,
// "Mes documents" book and the scaled A4 document view. Exposed as window.TCV.
(function () {
  "use strict";

  var TCV = (window.TCV = window.TCV || {});

  /* ---------- DOM ---------- */

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /** el("p", { class: "x", text: "…", "aria-live": "polite" }, [children]) — text always via textContent. */
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
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function setText(node, text) {
    if (node) node.textContent = text == null ? "" : String(text);
  }

  /* ---------- Storage (private mode / blocked storage must never break the page) ---------- */

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

  /* ---------- Formatting ---------- */

  function groupThousands(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function fcfa(n) {
    return groupThousands(n) + " FCFA";
  }

  function two(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function dateTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return two(d.getDate()) + "/" + two(d.getMonth() + 1) + "/" + d.getFullYear() + " " + two(d.getHours()) + "h" + two(d.getMinutes());
  }

  function snPhone(e164) {
    var m = /^\+221(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164 || "");
    return m ? "+221 " + m[1] + " " + m[2] + " " + m[3] + " " + m[4] : e164 || "";
  }

  var PRODUCT_LABELS = { cv: "CV", lettre: "Lettre de motivation", pack: "Pack CV + lettre" };

  function productLabel(p) {
    return PRODUCT_LABELS[p] || p;
  }

  /** "Aïssatou FALL" → "Aissatou-FALL" (ASCII, safe for file names). */
  function fileBase(fullName) {
    var ascii = String(fullName || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return ascii || "document";
  }

  /* ---------- API ---------- */

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
    if (opts.adminKey) headers.authorization = "Bearer " + opts.adminKey;
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

  /* ---------- Public config (GET /config) ---------- */

  var DEFAULT_CONFIG = {
    brandName: "Teranga CV",
    currency: "XOF",
    prices: { cv: 1000, lettre: 1000, pack: 1500 },
    payment: { wave: false, manual: false, manualWaveNumber: null, ownerWhatsapp: null },
    loaded: false
  };
  var configPromise = null;

  function loadConfig() {
    if (!configPromise) {
      configPromise = request("GET", "/config", { timeout: 12000 }).then(
        function (c) {
          var prices = (c && c.prices) || {};
          return {
            brandName: (c && c.brandName) || DEFAULT_CONFIG.brandName,
            currency: "XOF",
            prices: {
              cv: Number(prices.cv) || DEFAULT_CONFIG.prices.cv,
              lettre: Number(prices.lettre) || DEFAULT_CONFIG.prices.lettre,
              pack: Number(prices.pack) || DEFAULT_CONFIG.prices.pack
            },
            payment: Object.assign({}, DEFAULT_CONFIG.payment, (c && c.payment) || {}),
            loaded: true
          };
        },
        function () {
          return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        }
      );
    }
    return configPromise;
  }

  /** Fills every [data-price="cv|lettre|pack"] and [data-price-saving] under root. */
  function applyPrices(root, prices) {
    $$("[data-price]", root).forEach(function (n) {
      var p = prices[n.getAttribute("data-price")];
      if (p) n.textContent = fcfa(p);
    });
    var saving = prices.cv + prices.lettre - prices.pack;
    $$("[data-price-saving]", root).forEach(function (n) {
      if (saving > 0) {
        n.textContent = "Vous économisez " + fcfa(saving);
        n.hidden = false;
      } else {
        n.hidden = true;
      }
    });
    $$("[data-price-min]", root).forEach(function (n) {
      n.textContent = fcfa(Math.min(prices.cv, prices.lettre, prices.pack));
    });
  }

  function whatsappLink(number, text) {
    var digits = String(number || "").replace(/\D/g, "");
    var base = digits.length >= 8 ? "https://wa.me/" + digits : "https://wa.me/";
    return text ? base + "?text=" + encodeURIComponent(text) : base;
  }

  /** Shows footer/contact WhatsApp links when the owner configured a number. */
  function applyContact(root, payment) {
    var number = payment && payment.ownerWhatsapp;
    $$("[data-whatsapp]", root).forEach(function (n) {
      if (!number) {
        n.hidden = true;
        return;
      }
      var a = n.tagName === "A" ? n : $("a", n);
      if (a) a.href = whatsappLink(number, "Bonjour, j'ai une question sur Teranga CV.");
      n.hidden = false;
    });
  }

  /* ---------- "Mes documents" (orders kept on this phone) ---------- */

  var ORDERS_KEY = "tcv:orders";

  var orders = {
    list: function () {
      var list = store.get(ORDERS_KEY, []);
      return Array.isArray(list) ? list.filter(function (o) { return o && o.id && o.token; }) : [];
    },
    save: function (entry) {
      var list = orders.list().filter(function (o) { return o.id !== entry.id; });
      list.unshift({ id: entry.id, token: entry.token, product: entry.product, createdAt: entry.createdAt || new Date().toISOString() });
      store.set(ORDERS_KEY, list.slice(0, 20));
    },
    find: function (id) {
      return orders.list().filter(function (o) { return o.id === id; })[0] || null;
    }
  };

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

  function resultUrl(id, token) {
    return "resultat.html?o=" + encodeURIComponent(id) + "&t=" + encodeURIComponent(token);
  }

  function siteUrl() {
    return returnBase() + "/index.html";
  }

  /* ---------- Document paths (data-path="cv.experiences.0.title") ---------- */

  function setPath(obj, path, value) {
    var keys = path.split(".");
    var cur = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      if (cur == null) return;
      cur = cur[keys[i]];
    }
    if (cur != null) cur[keys[keys.length - 1]] = value;
  }

  /* ---------- Scaled A4 view ---------- */

  var views = [];
  var plaintextEditing = (function () {
    var probe = document.createElement("div");
    try {
      probe.contentEditable = "plaintext-only";
      return probe.contentEditable === "plaintext-only";
    } catch (e) {
      return false;
    }
  })();

  /**
   * One document page shown at the width of its parent.
   * opts.editable: make [data-path] text editable; opts.onEdit(path, text) is called on every change.
   */
  function DocView(parent, kind, opts) {
    this.kind = kind;
    this.opts = opts || {};
    this.zoomed = false;
    this.frame = el("div", { class: "doc-frame", "data-doc": kind });
    this.scaler = el("div", { class: "doc-scaler" });
    this.frame.appendChild(this.scaler);
    parent.appendChild(this.frame);
    this.page = null;
    var self = this;
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(function () {
        self.rescale();
      }).observe(this.frame);
    }
    views.push(this);
  }

  DocView.prototype.show = function (part, template) {
    clear(this.scaler);
    this.page = window.TCVRender[this.kind](part, template);
    this.scaler.appendChild(this.page);
    if (this.opts.editable) this.enableEditing();
    this.layout();
    return this.page;
  };

  DocView.prototype.layout = function () {
    if (!this.page) return;
    window.TCVRender.fit(this.page);
    this.rescale();
  };

  DocView.prototype.rescale = function () {
    if (!this.page) return;
    var width = this.frame.clientWidth;
    if (!width) return;
    var natural = this.scaler.offsetWidth || window.TCVRender.A4_W_PX;
    var s = this.zoomed ? 1 : Math.min(1, width / natural);
    this.scaler.style.transform = s === 1 ? "none" : "scale(" + s + ")";
    this.frame.style.height = Math.ceil(this.page.offsetHeight * s) + "px";
    this.frame.classList.toggle("is-zoomed", this.zoomed && natural > width);
  };

  DocView.prototype.setZoom = function (on) {
    this.zoomed = !!on;
    this.rescale();
  };

  DocView.prototype.enableEditing = function () {
    var self = this;
    var page = this.page;
    $$("[data-path]", page).forEach(function (n) {
      n.setAttribute("contenteditable", plaintextEditing ? "plaintext-only" : "true");
      n.setAttribute("spellcheck", "true");
    });
    page.addEventListener("input", function (e) {
      var n = e.target && e.target.closest ? e.target.closest("[data-path]") : null;
      if (!n) return;
      if (self.opts.onEdit) self.opts.onEdit(n.getAttribute("data-path"), n.textContent.replace(/\s+/g, " ").trim());
      self.rescale();
    });
    page.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.target && e.target.blur) e.target.blur();
      }
    });
    page.addEventListener("focusout", function () {
      self.layout();
    });
    if (!plaintextEditing) {
      page.addEventListener("paste", function (e) {
        var text = e.clipboardData && e.clipboardData.getData("text/plain");
        if (text == null) return;
        e.preventDefault();
        document.execCommand("insertText", false, text.replace(/\s+/g, " "));
      });
    }
  };

  function rescaleAll() {
    views.forEach(function (v) {
      v.rescale();
    });
  }
  window.addEventListener("resize", rescaleAll);
  window.addEventListener("orientationchange", rescaleAll);

  /* ---------- Clipboard ---------- */

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
      var ta = el("textarea", { readonly: true, "aria-hidden": "true" });
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
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

  /** Busy state on a button: disables it and swaps its label for a spinner + text. */
  function busy(btn, on, text) {
    if (!btn) return;
    var label = $(".btn-label", btn);
    if (on) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      if (label) {
        if (!btn.hasAttribute("data-label")) btn.setAttribute("data-label", label.textContent);
        label.textContent = text || label.textContent;
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

  TCV.dom = { $: $, $$: $$, el: el, clear: clear, setText: setText, busy: busy };
  TCV.store = store;
  TCV.fmt = { fcfa: fcfa, dateTime: dateTime, snPhone: snPhone, productLabel: productLabel, fileBase: fileBase };
  TCV.api = { request: request, ApiError: ApiError };
  TCV.loadConfig = loadConfig;
  TCV.applyPrices = applyPrices;
  TCV.applyContact = applyContact;
  TCV.whatsappLink = whatsappLink;
  TCV.orders = orders;
  TCV.url = { param: param, returnBase: returnBase, resultUrl: resultUrl, siteUrl: siteUrl };
  TCV.setPath = setPath;
  TCV.DocView = DocView;
  TCV.copyText = copyText;
})();
