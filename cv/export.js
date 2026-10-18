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

  var BLOCK_PROPS = ["margin-top", "margin-bottom", "margin-left", "margin-right", "padding-top", "padding-bottom", "padding-left", "padding-right", "text-align"];
  var BORDER_SIDES = ["top", "right", "bottom", "left"];
  var TEXT_PROPS = ["font-size", "font-weight", "font-style", "text-transform", "letter-spacing"];

  function pt(px) {
    var n = parseFloat(px);
    return isNaN(n) ? null : Math.round(n * 0.75 * 10) / 10 + "pt";
  }

  function hex(rgb) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(rgb || "");
    if (!m || (m[4] !== undefined && parseFloat(m[4]) === 0)) return null;
    return "#" + [m[1], m[2], m[3]].map(function (v) { return ("0" + Number(v).toString(16)).slice(-2); }).join("");
  }

  function styleOf(node, isBlock, isContainer) {
    var cs = window.getComputedStyle(node);
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
    // line-height is left to Word's own single spacing: percentage values also inflate paragraph spacing
    // in some importers (a one-page letter became two in LibreOffice).
    if (isBlock) {
      BLOCK_PROPS.forEach(function (p) {
        var v = cs.getPropertyValue(p);
        if (p !== "text-align") v = parseFloat(v) ? pt(v) : "0";
        out.push(p + ":" + v);
      });
      BORDER_SIDES.forEach(function (side) {
        // Word/LibreOffice repeat a container's side borders on every paragraph inside it.
        if (isContainer && (side === "left" || side === "right")) return;
        var w = parseFloat(cs.getPropertyValue("border-" + side + "-width"));
        var c = hex(cs.getPropertyValue("border-" + side + "-color"));
        if (w && c && cs.getPropertyValue("border-" + side + "-style") !== "none") out.push("border-" + side + ":" + pt(w) + " solid " + c);
      });
    }
    var bg = hex(cs.backgroundColor);
    if (bg && bg !== "#ffffff") out.push("background:" + bg);
    return out.join(";");
  }

  var BLOCK_TAGS = { H1: "h1", H2: "h2", H3: "h3", P: "p", UL: "ul", LI: "li", DIV: "div", SECTION: "div", HEADER: "div", ASIDE: "div", ARTICLE: "div" };

  function convertChildren(src, dst, out) {
    for (var c = src.firstChild; c; c = c.nextSibling) {
      var n = convert(c, out);
      if (n) dst.appendChild(n);
    }
  }

  function cellsTable(src, out, kind) {
    var table = out.createElement("table");
    table.setAttribute("width", "100%");
    table.setAttribute("cellspacing", "0");
    table.setAttribute("cellpadding", "0");
    table.setAttribute("style", "width:100%;border-collapse:collapse;" + (kind === "box" ? "" : "margin-bottom:" + (pt(window.getComputedStyle(src).marginBottom) || "0")));
    var tr = out.createElement("tr");
    var cells = kind === "box" ? [src] : Array.prototype.slice.call(src.children);
    var total = src.getBoundingClientRect().width || 1;
    cells.forEach(function (cell, i) {
      var td = out.createElement("td");
      var cs = window.getComputedStyle(cell);
      var pct = Math.round((cell.getBoundingClientRect().width / total) * 100);
      var style = ["vertical-align:top", "width:" + pct + "%"];
      ["padding-top", "padding-right", "padding-bottom", "padding-left"].forEach(function (p) {
        style.push(p + ":" + (pt(cs.getPropertyValue(p)) || "0"));
      });
      if (kind === "row" && i === cells.length - 1 && cells.length > 1 && !cell.classList.contains("tcv-what")) style.push("text-align:right");
      var bg = hex(cs.backgroundColor);
      if (bg) {
        style.push("background:" + bg);
        td.setAttribute("bgcolor", bg);
      }
      td.setAttribute("width", pct + "%");
      td.setAttribute("valign", "top");
      td.setAttribute("style", style.join(";"));
      if (kind === "box") convertChildren(cell, td, out);
      else {
        var inner = convert(cell, out, true);
        if (inner) td.appendChild(inner);
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
    return table;
  }

  function convert(src, out, asCell) {
    if (src.nodeType === 3) return out.createTextNode(src.nodeValue);
    if (src.nodeType !== 1) return null;
    if (src.namespaceURI !== "http://www.w3.org/1999/xhtml" || src.classList.contains("tcv-lock")) return null;
    var cs = window.getComputedStyle(src);
    if (cs.display === "none") return null;
    var w = src.getAttribute("data-w");
    if (w && !asCell) return cellsTable(src, out, w);
    var inline = cs.display === "inline" || cs.display === "inline-block";
    var name = inline ? "span" : BLOCK_TAGS[src.tagName] || "p";
    // Lists without markers (contacts, languages) become plain paragraphs so Word adds no bullets.
    if (name === "ul" && cs.listStyleType === "none") name = "div";
    if (name === "li" && window.getComputedStyle(src.parentNode).listStyleType === "none") name = "p";
    var node = out.createElement(name);
    node.setAttribute("style", styleOf(src, !inline, name === "div"));
    convertChildren(src, node, out);
    return node;
  }

  var WORD_HEAD =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="utf-8"><meta name="ProgId" content="Word.Document"><title>Document</title>' +
    "<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->" +
    "<style>@page WordSection1{size:21cm 29.7cm;margin:1.5cm 1.7cm 1.5cm 1.7cm;mso-page-orientation:portrait}" +
    "div.WordSection1{page:WordSection1}p,h1,h2,h3{margin:0}table{border-collapse:collapse}</style></head>";

  /** Word-compatible HTML of a rendered page (text serialized by the DOM, never concatenated). */
  function wordHtml(page) {
    var out = document.implementation.createHTMLDocument("");
    var section = out.createElement("div");
    section.className = "WordSection1";
    var font = page.getAttribute("data-word-font") || "Calibri, Arial, sans-serif";
    section.setAttribute("style", "font-family:" + font);
    convertChildren(page, section, out);
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
