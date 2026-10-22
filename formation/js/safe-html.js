// Teranga Pro — TPRO.safeHtml(html): DocumentFragment. The ONLY way module HTML enters a page.
// The fragment is parsed by DOMParser (scripts never run, nothing is loaded), then rebuilt node by node with
// createElement / createElementNS, keeping only the elements, attributes and classes of the content contract
// (SPEC_COURSE §7.4). Everything else is dropped (dangerous elements with their content) or reduced to its text.
(function () {
  "use strict";

  var TPRO = (window.TPRO = window.TPRO || {});
  var SVG_NS = "http://www.w3.org/2000/svg";
  var HTML_NS = "http://www.w3.org/1999/xhtml";

  function set(list) {
    var o = Object.create(null);
    list.split(/\s+/).forEach(function (k) {
      if (k) o[k] = true;
    });
    return o;
  }

  var HTML_TAGS = set("section h2 h3 p ul ol li strong em code kbd pre table thead tbody tr th td caption figure figcaption a div details summary");
  var SVG_TAGS = set("svg g title desc defs marker path rect circle ellipse line polyline polygon text tspan");
  // Dropped together with everything inside them.
  var DROP = set(
    "script style iframe frame frameset object embed applet link meta base form input button select option optgroup textarea " +
      "img picture video audio source track canvas noscript template foreignobject math portal dialog slot"
  );
  var CLASSES = set("module module-free m-code data num callout-info callout-warning callout-source exercise solution expected");
  var SVG_ATTRS = set(
    "viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points fill stroke stroke-width stroke-dasharray stroke-linecap " +
      "stroke-linejoin opacity fill-opacity transform text-anchor dominant-baseline font-size font-weight font-style marker-start " +
      "marker-end refX refY markerWidth markerHeight orient preserveAspectRatio role aria-label aria-hidden focusable"
  );
  var ID_RE = /^m\d{1,2}-[A-Za-z0-9_-]{1,60}$/;
  var LOCAL_DOWNLOAD_RE = /^gratuit\/[a-z0-9][a-z0-9._-]{0,80}$/i;

  function cleanClasses(value) {
    return String(value || "")
      .split(/\s+/)
      .filter(function (c) {
        return c && CLASSES[c];
      })
      .join(" ");
  }

  /** A presentation value is kept unless it smuggles a URL; url() only as a local reference url(#id). */
  function safeSvgValue(value) {
    var v = String(value);
    if (/url\s*\(/i.test(v)) {
      var all = v.match(/url\s*\([^)]*\)/gi) || [];
      for (var i = 0; i < all.length; i++) {
        if (!/^url\(\s*#[A-Za-z0-9_-]+\s*\)$/i.test(all[i])) return null;
      }
    }
    if (/javascript:|data:|expression\s*\(/i.test(v)) return null;
    return v;
  }

  function safeHref(value, opts) {
    var v = String(value || "").trim();
    if (/[\u0000- \u007f]/.test(v)) return null;
    if (/^https:\/\/[^/\s]+/i.test(v)) return { href: v, local: false };
    if (opts.allowLocalDownloads && LOCAL_DOWNLOAD_RE.test(v) && v.indexOf("..") < 0) return { href: v, local: true };
    return null;
  }

  function copyHtmlAttrs(src, dst, tag, opts) {
    for (var i = 0; i < src.attributes.length; i++) {
      var a = src.attributes[i];
      var name = a.name.toLowerCase();
      var value = a.value;
      if (name === "class") {
        var cls = cleanClasses(value);
        if (cls) dst.setAttribute("class", cls);
      } else if (name === "data-module" && tag === "section") {
        if (/^\d{1,2}$/.test(value)) dst.setAttribute("data-module", value);
      } else if (name === "id" && (tag === "h2" || tag === "h3")) {
        if (ID_RE.test(value)) dst.setAttribute("id", value);
      } else if ((name === "scope" && (tag === "th" || tag === "td")) && /^(row|col|rowgroup|colgroup)$/.test(value)) {
        dst.setAttribute("scope", value);
      } else if ((name === "colspan" || name === "rowspan") && (tag === "th" || tag === "td") && /^\d{1,2}$/.test(value)) {
        dst.setAttribute(name, value);
      }
      // href handled below; everything else (on*, style, src, target, title…) is dropped.
    }
    if (tag === "a") {
      var h = safeHref(src.getAttribute("href"), opts);
      if (h) {
        dst.setAttribute("href", h.href);
        if (h.local) {
          if (src.hasAttribute("download")) dst.setAttribute("download", "");
        } else {
          dst.setAttribute("rel", "noopener noreferrer");
          dst.setAttribute("target", "_blank");
        }
      }
    }
  }

  function copySvgAttrs(src, dst) {
    for (var i = 0; i < src.attributes.length; i++) {
      var a = src.attributes[i];
      var name = a.name;
      if (name === "class") {
        var cls = cleanClasses(a.value);
        if (cls) dst.setAttribute("class", cls);
      } else if (name === "id") {
        if (ID_RE.test(a.value)) dst.setAttribute("id", a.value);
      } else if (SVG_ATTRS[name]) {
        var v = safeSvgValue(a.value);
        if (v !== null) dst.setAttribute(name, v);
      }
    }
  }

  function rebuild(node, out, opts, inSvg) {
    for (var c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) {
        out.appendChild(document.createTextNode(c.nodeValue));
        continue;
      }
      if (c.nodeType !== 1) continue; // comments, processing instructions…
      var local = String(c.localName || "").toLowerCase();
      if (DROP[local]) continue;
      var ns = c.namespaceURI;
      if (ns === SVG_NS && SVG_TAGS[c.localName] && (inSvg || c.localName === "svg")) {
        var s = document.createElementNS(SVG_NS, c.localName);
        copySvgAttrs(c, s);
        rebuild(c, s, opts, true);
        out.appendChild(s);
      } else if ((ns === HTML_NS || ns == null) && !inSvg && HTML_TAGS[local]) {
        var e = document.createElement(local);
        copyHtmlAttrs(c, e, local, opts);
        rebuild(c, e, opts, false);
        out.appendChild(e);
      } else {
        var text = c.textContent;
        if (text) out.appendChild(document.createTextNode(text));
      }
    }
  }

  /**
   * opts.allowLocalDownloads: keep relative « gratuit/<file> » links (free module page only).
   * Returns a DocumentFragment; never throws (an unparsable input gives an empty fragment).
   */
  function safeHtml(html, opts) {
    opts = opts || {};
    var frag = document.createDocumentFragment();
    var doc;
    try {
      doc = new DOMParser().parseFromString("<!doctype html><html><body>" + String(html || "") + "</body></html>", "text/html");
    } catch (e) {
      return frag;
    }
    if (doc && doc.body) rebuild(doc.body, frag, opts, false);
    return frag;
  }

  TPRO.safeHtml = safeHtml;
})();
