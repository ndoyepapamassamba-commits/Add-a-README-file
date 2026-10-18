// Downloads for the result page: PDF (html2pdf.js, loaded lazily from cdnjs), Word (.doc = HTML with Office
// namespaces and inline styles, built from the live page so customer edits are kept), print, letter as text.
(function () {
  "use strict";

  var HTML2PDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
  var HTML2PDF_SRI = "sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnIg==";
  var loading = null;

  function loadHtml2pdf() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (!loading) {
      loading = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = HTML2PDF_URL;
        s.integrity = HTML2PDF_SRI;
        s.crossOrigin = "anonymous";
        s.referrerPolicy = "no-referrer";
        s.onload = function () {
          if (window.html2pdf) resolve(window.html2pdf);
          else reject(new Error("html2pdf missing"));
        };
        s.onerror = function () {
          loading = null;
          s.parentNode.removeChild(s);
          reject(new Error("html2pdf failed to load"));
        };
        document.head.appendChild(s);
      });
    }
    return loading;
  }

  /** A4 PDF of one rendered page. Content longer than one page is split with small top/bottom margins. */
  function pdf(page, filename) {
    return loadHtml2pdf().then(function (html2pdf) {
      var multi = page.scrollHeight > window.TCVRender.A4_H_PX + 1;
      // A single page is exported 1 px shorter than 297 mm: html2pdf rounds 1123 px up to a blank 2nd page.
      page.classList.add(multi ? "is-multipage" : "is-exporting");
      var opt = {
        margin: multi ? [8, 0, 10, 0] : 0,
        filename: filename,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false, scrollX: 0, scrollY: 0 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
        pagebreak: { mode: ["css", "legacy"], avoid: [".tcv-item", ".tcv-para", ".tcv-h", "li"] }
      };
      var restore = function () {
        page.classList.remove("is-multipage", "is-exporting");
      };
      return html2pdf().set(opt).from(page).save().then(restore, function (e) {
        restore();
        throw e;
      });
    });
  }

  /* ---------- Word ---------- */
  // Word and LibreOffice disagree on nested blocks: LibreOffice repeats a container's margins and borders on
  // every paragraph inside it, gives h1–h3 its own heading spacing and does not pass the font into tables.
  // So the export is flat: containers are dissolved, each text block becomes one <p> (or a bulleted <ul>)
  // carrying its own font and the spacing measured on the laid-out page, and side-by-side parts
  // (data-w="row|cols|box") become one-row tables.

  var XHTML = "http://www.w3.org/1999/xhtml";
  var PX_PER_CM = 96 / 2.54;
  var WORD_MARGIN_CM = { top: 1.5, side: 1.7 };
  var NO_INSET = { top: 0, side: 0 };
  var TEXT_PROPS = ["font-size", "font-weight", "font-style", "text-transform", "letter-spacing"];
  var SIDES = ["top", "right", "bottom", "left"];

  function pt(px) {
    var n = parseFloat(px);
    return isNaN(n) ? "0pt" : Math.round(n * 0.75 * 10) / 10 + "pt";
  }

  function hex(rgb) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(rgb || "");
    if (!m || (m[4] !== undefined && parseFloat(m[4]) === 0)) return null;
    return "#" + [m[1], m[2], m[3]].map(function (v) { return ("0" + Number(v).toString(16)).slice(-2); }).join("");
  }

  function css(node) {
    return window.getComputedStyle(node);
  }

  function shown(node) {
    return node.nodeType === 1 && node.namespaceURI === XHTML && !node.classList.contains("tcv-lock") && css(node).display !== "none";
  }

  /** An element whose visible children are all inline becomes one Word paragraph. */
  function isLeaf(node) {
    for (var c = node.firstElementChild; c; c = c.nextElementSibling) {
      if (shown(c) && !/^inline/.test(css(c).display)) return false;
    }
    return true;
  }

  function textStyle(node) {
    var cs = css(node);
    var out = [];
    TEXT_PROPS.forEach(function (p) {
      var v = cs.getPropertyValue(p);
      if (p === "font-size") v = pt(v);
      if (p === "letter-spacing") v = v === "normal" ? null : pt(v);
      if (p === "text-transform" && v === "none") v = null;
      if (v) out.push(p + ":" + v);
    });
    var color = hex(cs.color);
    if (color) out.push("color:" + color);
    // line-height is left to Word's single spacing: percentage values inflate paragraph spacing in some importers.
    return out;
  }

  /** The block's own box (padding, borders, background, alignment); its margins are measured by Flow. */
  function boxStyle(node, align) {
    var cs = css(node);
    var a = align || cs.textAlign;
    var out = ["text-align:" + (a === "start" ? "left" : a === "end" ? "right" : a)];
    SIDES.forEach(function (side) {
      out.push("padding-" + side + ":" + pt(cs.getPropertyValue("padding-" + side)));
      var w = parseFloat(cs.getPropertyValue("border-" + side + "-width"));
      var c = hex(cs.getPropertyValue("border-" + side + "-color"));
      if (w && c && cs.getPropertyValue("border-" + side + "-style") !== "none") out.push("border-" + side + ":" + pt(w) + " solid " + c);
    });
    var bg = hex(cs.backgroundColor);
    if (bg && bg !== "#ffffff") out.push("background:" + bg);
    return out;
  }

  /**
   * Where blocks go: an output node plus the screen box its content is laid out in (`inset` in CSS px is
   * taken off when the Word page margins already provide that space). Screen coordinates are divided by
   * `scale` because the page may be shown shrunk.
   */
  function Flow(target, box, inset, scale, font) {
    this.target = target;
    this.left = box.left + inset.side * scale;
    this.right = box.right - inset.side * scale;
    this.y = box.top + inset.top * scale;
    this.scale = scale;
    this.font = font;
    this.last = null; // last paragraph placed, which can still take a bottom border or space
  }

  Flow.prototype.gap = function (from, to) {
    return Math.max(0, (to - from) / this.scale);
  };

  /** Appends a block spaced and indented as on the page. Zero lengths keep their unit: LibreOffice ignores a bare 0. */
  Flow.prototype.place = function (node, src, styles) {
    var r = src.getBoundingClientRect();
    styles.push(
      "margin-top:" + pt(this.gap(this.y, r.top)),
      "margin-bottom:0pt",
      "margin-left:" + pt(this.gap(this.left, r.left)),
      "margin-right:" + pt(this.gap(r.right, this.right)),
      "font-family:" + this.font
    );
    node.setAttribute("style", styles.join(";"));
    this.target.appendChild(node);
    this.y = r.bottom;
    this.last = node;
  };

  /** Adds declarations to the last paragraph (later declarations win) and moves the flow down to `bottom`. */
  Flow.prototype.extendLast = function (bottom, extra) {
    if (!this.last) return;
    this.last.setAttribute("style", this.last.getAttribute("style") + ";" + extra.join(";"));
    this.y = bottom;
  };

  function appendInline(src, dst, out) {
    for (var c = src.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) dst.appendChild(out.createTextNode(c.nodeValue));
      else if (c.nodeName === "BR") dst.appendChild(out.createElement("br"));
      else if (shown(c)) {
        var span = out.createElement("span");
        span.setAttribute("style", textStyle(c).join(";"));
        appendInline(c, span, out);
        dst.appendChild(span);
      }
    }
  }

  function paragraph(src, flow, out, align) {
    if (!src.textContent.trim()) return;
    var p = out.createElement("p");
    var styles = textStyle(src).concat(boxStyle(src, align));
    if (/^H\d$/.test(src.tagName)) styles.push("page-break-after:avoid");
    appendInline(src, p, out);
    flow.place(p, src, styles);
  }

  function bulletList(src, flow, out) {
    var ul = out.createElement("ul");
    var prev = null;
    for (var li = src.firstElementChild; li; li = li.nextElementSibling) {
      if (!shown(li)) continue;
      var r = li.getBoundingClientRect();
      var item = out.createElement("li");
      var styles = textStyle(li);
      styles.push("margin-top:" + pt(prev ? flow.gap(prev.bottom, r.top) : 0), "margin-bottom:0pt", "font-family:" + flow.font);
      item.setAttribute("style", styles.join(";"));
      appendInline(li, item, out);
      ul.appendChild(item);
      prev = r;
    }
    var cs = css(src);
    flow.place(ul, src, textStyle(src).concat(["list-style-type:" + cs.listStyleType, "padding-left:" + pt(cs.paddingLeft)]));
  }

  /**
   * A side-by-side part as a one-row table; each cell is a flow of its own. Cell paddings are written as
   * longhands (LibreOffice ignores the shorthand) and carry the space above the row and its indentation.
   */
  function table(src, flow, out, kind) {
    var box = src.getBoundingClientRect();
    var cells = kind === "box" ? [src] : Array.prototype.filter.call(src.children, shown);
    var space = pt(flow.gap(flow.y, box.top));
    var t = out.createElement("table");
    t.setAttribute("width", "100%");
    t.setAttribute("cellspacing", "0");
    t.setAttribute("cellpadding", "0");
    t.setAttribute("style", "width:100%;border-collapse:collapse");
    var tr = out.createElement("tr");
    cells.forEach(function (cell, i) {
      var last = i === cells.length - 1;
      var r = cell.getBoundingClientRect();
      // A cell runs up to the next one, so the gap between columns stays inside the cell on its left.
      var end = last ? box.right : cells[i + 1].getBoundingClientRect().left;
      var pct = Math.max(1, Math.round(((end - r.left) / (box.width || 1)) * 100));
      var bg = hex(css(cell).backgroundColor);
      var td = out.createElement("td");
      td.setAttribute("width", pct + "%");
      td.setAttribute("valign", "top");
      if (bg) td.setAttribute("bgcolor", bg);
      td.setAttribute("style", [
        "vertical-align:top", "width:" + pct + "%",
        "padding-top:" + space, "padding-bottom:0pt",
        "padding-left:" + (i === 0 ? pt(flow.gap(flow.left, box.left)) : "0pt"),
        "padding-right:" + (last ? pt(flow.gap(box.right, flow.right)) : "0pt")
      ].concat(bg ? ["background:" + bg] : []).join(";"));
      if (kind !== "box" && isLeaf(cell)) {
        // The date of a title row sits on the right edge.
        paragraph(cell, new Flow(td, r, NO_INSET, flow.scale, flow.font), out, kind === "row" && i > 0 && last ? "right" : null);
      } else {
        var inner = new Flow(td, { left: r.left, right: end, top: r.top }, NO_INSET, flow.scale, flow.font);
        walk(cell, inner, out);
        var rest = inner.gap(inner.y, r.bottom);
        if (rest >= 1) inner.extendLast(r.bottom, ["margin-bottom:" + pt(rest)]);
      }
      tr.appendChild(td);
    });
    t.appendChild(tr);
    flow.target.appendChild(t);
    flow.y = box.bottom;
    flow.last = null;
  }

  /** A dissolved container's bottom rule (CV header) moves to its last paragraph. */
  function underline(src, flow) {
    var cs = css(src);
    var w = parseFloat(cs.borderBottomWidth);
    var color = hex(cs.borderBottomColor);
    if (!w || !color || cs.borderBottomStyle === "none") return;
    var r = src.getBoundingClientRect();
    flow.extendLast(r.bottom, [
      "padding-bottom:" + pt(flow.gap(flow.y, r.bottom - w * flow.scale)),
      "border-bottom:" + pt(w) + " solid " + color
    ]);
  }

  function walk(src, flow, out) {
    for (var c = src.firstElementChild; c; c = c.nextElementSibling) {
      if (!shown(c)) continue;
      var kind = c.getAttribute("data-w");
      if (kind) table(c, flow, out, kind);
      else if (c.tagName === "UL" && css(c).listStyleType !== "none") bulletList(c, flow, out);
      else if (isLeaf(c)) paragraph(c, flow, out);
      else {
        flow.last = null;
        walk(c, flow, out);
        underline(c, flow);
      }
    }
  }

  var WORD_HEAD =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="utf-8"><meta name="ProgId" content="Word.Document"><title>Document</title>' +
    "<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->" +
    "<style>@page WordSection1{size:21cm 29.7cm;margin:" + WORD_MARGIN_CM.top + "cm " + WORD_MARGIN_CM.side + "cm;mso-page-orientation:portrait}" +
    "div.WordSection1{page:WordSection1}p,li{margin:0pt}table{border-collapse:collapse}</style></head>";

  /** Word-compatible HTML of a rendered page (text serialized by the DOM, never concatenated). */
  function wordHtml(page) {
    var out = document.implementation.createHTMLDocument("");
    var section = out.createElement("div");
    section.className = "WordSection1";
    var font = page.getAttribute("data-word-font") || "Calibri, Arial, sans-serif";
    section.setAttribute("style", "font-family:" + font);
    var box = page.getBoundingClientRect();
    var margins = { top: WORD_MARGIN_CM.top * PX_PER_CM, side: WORD_MARGIN_CM.side * PX_PER_CM };
    walk(page, new Flow(section, box, margins, box.width / page.offsetWidth || 1, font), out);
    return WORD_HEAD + '<body lang="FR">' + section.outerHTML + "</body></html>";
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
  }

  function word(page, filename) {
    var blob = new Blob(["﻿", wordHtml(page)], { type: "application/msword" });
    download(blob, filename);
  }

  /* ---------- Print ---------- */

  /** Prints the given pages only (copies go into #print-root, the only thing visible in print CSS). */
  function print(pages) {
    var root = document.getElementById("print-root");
    while (root.firstChild) root.removeChild(root.firstChild);
    pages.forEach(function (p) {
      root.appendChild(p.cloneNode(true));
    });
    var cleanup = function () {
      window.removeEventListener("afterprint", cleanup);
      while (root.firstChild) root.removeChild(root.firstChild);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  /** Plain text of a letter, for "Copier la lettre". */
  function letterText(l) {
    var blocks = [];
    var add = function (lines) {
      var t = lines.filter(function (s) { return s && s.trim(); }).join("\n");
      if (t) blocks.push(t);
    };
    add(l.sender || []);
    add(l.recipient || []);
    add([l.placeDate]);
    add([l.subject]);
    add([l.salutation]);
    (l.paragraphs || []).forEach(function (p) { add([p]); });
    add([l.closing]);
    add([l.signature]);
    return blocks.join("\n\n");
  }

  window.TCVExport = { pdf: pdf, word: word, wordHtml: wordHtml, print: print, letterText: letterText, loadHtml2pdf: loadHtml2pdf };
})();
