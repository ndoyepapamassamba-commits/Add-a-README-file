/* Teranga — rapports PDF A4 avec jsPDF (copie locale, chargée seulement au besoin). */
(function () {
  'use strict';
  var chargement = null;
  function chargerJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (chargement) return chargement;
    chargement = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = 'vendor/jspdf.umd.min.js';
      s.onload = function () { window.jspdf && window.jspdf.jsPDF ? ok(window.jspdf.jsPDF) : ko(new Error('jsPDF absent')); };
      s.onerror = function () { chargement = null; ko(new Error('Chargement du module PDF impossible.')); };
      document.head.appendChild(s);
    });
    return chargement;
  }

  // Les polices standard du PDF ne connaissent que l'alphabet Windows-1252 : on remplace le reste.
  var CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function T(s) {
    s = String(s == null ? '' : s).replace(/[    ]/g, ' ').replace(/−/g, '-').replace(/≈/g, '~').replace(/×/g, 'x').replace(/÷/g, '/').replace(/\r\n?/g, '\n');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.indexOf(ch) >= 0) { out += ch; continue; }
      var base = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : ch;
      out += /^[\x20-\x7e]$/.test(base) ? base : (c >= 0xD800 && c <= 0xDBFF ? (i++, '') : '');
    }
    return out;
  }
  function imageEnDataURL(url) {
    return fetch(url).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
      if (!b) return null;
      return new Promise(function (ok) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = function () { ok(null); }; fr.readAsDataURL(b); });
    }).catch(function () { return null; });
  }

  var VERT = [11, 110, 79], JAUNE = [242, 183, 5], ENCRE = [19, 32, 26], GRIS = [86, 102, 95], FILET = [213, 223, 218], FOND = [238, 243, 240], ROUGE = [180, 35, 24];

  // opts = { app, titre, sousTitre, edition (texte), infos (texte) }
  function creer(opts) {
    return Promise.all([chargerJsPDF(), imageEnDataURL('icons/icon-192.png')]).then(function (r) {
      var JsPDF = r[0], logo = r[1];
      var doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
      doc.setProperties({ title: T(opts.titre), subject: T(opts.app), creator: T(opts.app) });
      var M = 14, L = 210 - 2 * M, BAS = 282;
      var P = { doc: doc, M: M, L: L, y: 0, VERT: VERT, JAUNE: JAUNE, ENCRE: ENCRE, GRIS: GRIS, ROUGE: ROUGE, T: T };
      function couleur(c) { doc.setTextColor(c[0], c[1], c[2]); }
      function police(style, taille) { doc.setFont('helvetica', style); doc.setFontSize(taille); }
      P.couleur = couleur; P.police = police;
      P.saut = function (hauteur) { if (P.y + hauteur > BAS) { doc.addPage(); P.y = 18; return true; } return false; };
      P.titre = function (t) {
        P.saut(32); P.y += 4; police('bold', 12.5); couleur(VERT); doc.text(T(t), M, P.y); P.y += 2;
        doc.setDrawColor(JAUNE[0], JAUNE[1], JAUNE[2]); doc.setLineWidth(0.8); doc.line(M, P.y, M + 22, P.y); P.y += 5;
      };
      P.paragraphe = function (t, taille, c, gras) {
        taille = taille || 9.5;
        police(gras ? 'bold' : 'normal', taille); couleur(c || ENCRE);
        doc.splitTextToSize(T(t), L).forEach(function (l) { P.saut(5); doc.text(l, M, P.y); P.y += taille * 0.45; });
        P.y += 1.5;
      };
      // Cases de chiffres clés : [[étiquette, valeur, négatif?], …], 3 par ligne
      P.kpis = function (k) {
        var cw = (L - 6) / 3, chh = 14;
        for (var i = 0; i < k.length; i++) {
          var col = i % 3;
          if (col === 0) P.saut(chh + 2);
          var x = M + col * (cw + 3);
          doc.setFillColor(FOND[0], FOND[1], FOND[2]); doc.roundedRect(x, P.y, cw, chh, 2, 2, 'F');
          police('normal', 7.8); couleur(GRIS); doc.text(T(k[i][0]), x + 3, P.y + 4.8);
          police('bold', 11.5); couleur(k[i][2] ? ROUGE : ENCRE); doc.text(T(k[i][1]), x + 3, P.y + 11);
          if (col === 2 || i === k.length - 1) P.y += chh + 3;
        }
      };
      // Tableau : cols = [{t: titre, w: largeur mm, d: aligné à droite}], lignes = [[…]], opts.total = ligne en gras
      P.tableau = function (cols, lignes, o) {
        o = o || {};
        var lh = 6.2;
        function entete() {
          doc.setFillColor(VERT[0], VERT[1], VERT[2]); doc.rect(M, P.y, L, lh + 0.6, 'F');
          police('bold', 8.2); doc.setTextColor(255, 255, 255);
          var x = M; cols.forEach(function (c) { doc.text(T(c.t), c.d ? x + c.w - 2 : x + 2, P.y + 4.4, { align: c.d ? 'right' : 'left' }); x += c.w; });
          P.y += lh + 0.6;
        }
        P.saut(lh * 3); entete();
        var toutes = lignes.slice(); if (o.total) toutes.push(o.total);
        toutes.forEach(function (l, li) {
          var estTotal = o.total && li === toutes.length - 1;
          if (P.saut(lh + 1)) entete();
          if (estTotal) { doc.setFillColor(255, 243, 196); doc.rect(M, P.y, L, lh, 'F'); }
          else if (li % 2) { doc.setFillColor(FOND[0], FOND[1], FOND[2]); doc.rect(M, P.y, L, lh, 'F'); }
          var x = M;
          cols.forEach(function (c, ci) {
            var v = T(l[ci]);
            police(estTotal ? 'bold' : 'normal', 8.2);
            couleur(c.signe && /^-\d/.test(v) ? ROUGE : ENCRE);
            var max = c.w - 3;
            while (v.length > 1 && doc.getTextWidth(v) > max) v = v.slice(0, -2) + '…';
            doc.text(v, c.d ? x + c.w - 2 : x + 2, P.y + 4.3, { align: c.d ? 'right' : 'left' });
            x += c.w;
          });
          P.y += lh;
        });
        doc.setDrawColor(FILET[0], FILET[1], FILET[2]); doc.setLineWidth(0.2); doc.line(M, P.y, M + L, P.y);
        P.y += 4;
      };
      // Barres horizontales : [{nom, valeur, texte}]
      P.barres = function (items) {
        var max = 0; items.forEach(function (it) { max = Math.max(max, Math.abs(it.valeur || 0)); });
        items.forEach(function (it) {
          P.saut(8);
          police('normal', 8.5); couleur(ENCRE); doc.text(T(it.nom), M, P.y + 3.5);
          var x0 = M + 55, w = L - 55 - 32, lw = max > 0 ? Math.max(0.6, Math.abs(it.valeur || 0) / max * w) : 0.6;
          var c = (it.valeur || 0) < 0 ? ROUGE : VERT;
          doc.setFillColor(FOND[0], FOND[1], FOND[2]); doc.roundedRect(x0, P.y, w, 4.6, 1.5, 1.5, 'F');
          doc.setFillColor(c[0], c[1], c[2]); doc.roundedRect(x0, P.y, lw, 4.6, 1.5, 1.5, 'F');
          police('bold', 8.5); couleur((it.valeur || 0) < 0 ? ROUGE : ENCRE); doc.text(T(it.texte), M + L, P.y + 3.5, { align: 'right' });
          P.y += 7;
        });
        P.y += 2;
      };
      P.terminer = function (nomFichier) {
        var nb = doc.getNumberOfPages();
        for (var p = 1; p <= nb; p++) {
          doc.setPage(p);
          police('normal', 7.5); couleur(GRIS);
          doc.setDrawColor(FILET[0], FILET[1], FILET[2]); doc.setLineWidth(0.2); doc.line(M, 287, M + L, 287);
          doc.text(T(opts.app + ' · calculs faits à partir de vos saisies · données gardées sur votre téléphone'), M, 291);
          doc.text('Page ' + p + ' / ' + nb, M + L, 291, { align: 'right' });
        }
        return { blob: doc.output('blob'), nom: nomFichier, pages: nb };
      };

      // En-tête de la première page
      doc.setFillColor(VERT[0], VERT[1], VERT[2]); doc.rect(0, 0, 210, 26, 'F');
      doc.setFillColor(JAUNE[0], JAUNE[1], JAUNE[2]); doc.rect(0, 26, 210, 1.4, 'F');
      if (logo) { try { doc.addImage(logo, 'PNG', M, 5, 16, 16); } catch (e) { /* sans logo */ } }
      police('bold', 17); doc.setTextColor(255, 255, 255); doc.text(T(opts.app), M + 20, 13);
      police('normal', 10); doc.text(T(opts.sousTitre || ''), M + 20, 19.5);
      police('normal', 9); doc.text(T(opts.edition || ''), 210 - M, 13, { align: 'right' });
      P.y = 37;
      police('bold', 16); couleur(ENCRE);
      doc.splitTextToSize(T(opts.titre), L).forEach(function (l) { doc.text(l, M, P.y); P.y += 7; });
      if (opts.infos) P.paragraphe(opts.infos, 9.5, GRIS);
      return P;
    });
  }

  window.TPDF = { chargerJsPDF: chargerJsPDF, T: T, creer: creer };
})();
