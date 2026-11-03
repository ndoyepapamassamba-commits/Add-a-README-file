/* Teranga Factures — PDF A4 généré dans le téléphone (jsPDF + AutoTable + qrcode-generator, copies locales). */
(function () {
  'use strict';
  var TF = window.TF;
  var W = 210, H = 297, M = 14;
  var chargement = null;

  function script(src) {
    return new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = function () { ok(); };
      s.onerror = function () { s.remove(); ko(new Error('Fichier manquant : ' + src + '. Rouvrez l\'application une fois connecté.')); };
      document.head.appendChild(s);
    });
  }
  function bibliotheques() {
    if (!chargement) {
      chargement = (window.jspdf ? Promise.resolve() : script('vendor/jspdf.umd.min.js'))
        .then(function () { return window.jspdf && window.jspdf.jsPDF.API.autoTable ? null : script('vendor/jspdf.plugin.autotable.min.js'); })
        .then(function () { return typeof window.qrcode === 'function' ? null : script('vendor/qrcode.js'); });
      chargement.catch(function () { chargement = null; });
    }
    return chargement;
  }

  function rgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return [11, 110, 79];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function teinte(c, k) { return c.map(function (v) { return Math.round(v + (255 - v) * k); }); }

  var TEXTE = [28, 33, 30], DOUX = [96, 106, 101], LIGNE = [214, 220, 217];
  function theme(nom, couleur) {
    var acc = rgb(couleur || '#0b6e4f');
    if (nom === 'moderne') return { nom: nom, accent: acc, titre: acc, teteFond: acc, teteTexte: [255, 255, 255], zebre: teinte(acc, 0.94), totalFond: acc };
    if (nom === 'afrique') return { nom: nom, accent: acc, titre: acc, teteFond: acc, teteTexte: [255, 255, 255], zebre: [251, 247, 236], totalFond: acc,
      or: [224, 161, 0], terre: [196, 87, 42], creme: [250, 243, 224] };
    return { nom: 'classique', accent: [33, 37, 41], titre: [33, 37, 41], teteFond: [236, 239, 241], teteTexte: [33, 37, 41], zebre: null, totalFond: [33, 37, 41] };
  }

  function formatImage(src) { return /^data:image\/png/i.test(src) ? 'PNG' : 'JPEG'; }
  // Place une image dans une boîte (l × h) en gardant ses proportions ; renvoie la taille utilisée.
  function image(doc, src, x, y, lmax, hmax, aDroite) {
    try {
      var p = doc.getImageProperties(src), k = Math.min(lmax / p.width, hmax / p.height);
      var l = p.width * k, h = p.height * k;
      doc.addImage(src, formatImage(src), aDroite ? x - l : x, y, l, h, undefined, 'FAST');
      return { l: l, h: h };
    } catch (e) { return null; }
  }

  function generer(d, ctx) {
    return bibliotheques().then(function () { return construire(d, ctx); });
  }

  function construire(d, ctx) {
    var P = ctx.profil || {}, R = ctx.reglages || {}, complet = !!ctx.complet;
    var modele = ctx.modele || (complet ? (R.modele || 'classique') : 'classique');
    var T = theme(modele, complet || ctx.exemple ? R.couleur : null);
    var info = TF.TYPES[d.type] || TF.TYPES.facture, t = TF.totaux(d);
    var tx = TF.textePDF, sp = ' ';
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({ title: tx(info.nom + ' ' + (d.numero || '')), subject: tx(info.nom), author: tx(P.nom || ''), creator: 'Teranga Factures' });
    doc.setLineHeightFactor(1.25);

    function police(taille, gras, couleur) {
      doc.setFont('helvetica', gras === true ? 'bold' : gras === 'i' ? 'italic' : 'normal');
      doc.setFontSize(taille);
      doc.setTextColor.apply(doc, couleur || TEXTE);
    }
    function remplir(c) { doc.setFillColor(c[0], c[1], c[2]); }
    function trait(c, ep) { doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(ep || 0.2); }
    function lignes(texte, larg) { return doc.splitTextToSize(tx(texte), larg); }
    function hauteur(n, taille) { return n * taille * 0.3528 * 1.25; }

    // ---- Bandes wax (modèle Afrique) ----
    function wax(y, h) {
      remplir(T.accent); doc.rect(0, y, W, h, 'F');
      var u = h * 1.5, cy = y + h / 2;
      for (var x = -u / 2, i = 0; x < W + u; x += u, i++) {
        var cx = x + u / 2;
        remplir(T.or);
        doc.triangle(cx - u * 0.36, cy, cx, y + h * 0.12, cx + u * 0.36, cy, 'F');
        doc.triangle(cx - u * 0.36, cy, cx, y + h * 0.88, cx + u * 0.36, cy, 'F');
        remplir(i % 2 ? T.terre : T.creme);
        doc.circle(cx, cy, h * 0.13, 'F');
        remplir(T.creme);
        doc.triangle(x + u, y, x + u - h * 0.16, y, x + u, y + h * 0.22, 'F');
        doc.triangle(x + u, y + h, x + u - h * 0.16, y + h, x + u, y + h * 0.78, 'F');
      }
      remplir(T.or); doc.rect(0, y + h, W, 0.7, 'F');
    }
    function decorPage() { if (T.nom === 'afrique') { wax(0, 8); remplir(T.or); doc.rect(0, H - 5.7, W, 0.7, 'F'); wax(H - 5, 5); } }

    // ---- Lignes de l'entreprise ----
    var details = [];
    if (P.activite) details.push(P.activite);
    String(P.adresse || '').split('\n').forEach(function (l) { if (l.trim()) details.push(l.trim()); });
    if (P.ville) details.push(P.ville);
    var contact = [];
    if (P.telephone) contact.push('Tél. ' + P.telephone);
    if (P.email) contact.push(P.email);
    if (contact.length) details.push(contact.join('  ·  '));
    var ids = [];
    if (P.ninea) ids.push('NINEA : ' + P.ninea);
    if (P.rc) ids.push('RC : ' + P.rc);
    if (ids.length) details.push(ids.join('  ·  '));
    if (P.autres) details.push(P.autres);

    // ---- Références du document ----
    var refs = [['N°', d.numero || '—'], ['Date', TF.dateFr(d.date)]];
    if (d.type === 'facture' && d.echeance) refs.push(['Échéance', d.echeance <= d.date ? 'À réception' : TF.dateFr(d.echeance)]);
    if (TF.estDevis(d.type) && d.echeance) refs.push(['Valable jusqu\'au', TF.dateFr(d.echeance)]);
    if (d.type === 'recu' && d.mode) refs.push(['Paiement', d.mode]);

    var y;
    decorPage();
    if (T.nom === 'moderne') {
      remplir(T.accent); doc.rect(0, 0, W, 38, 'F');
      var xm = M;
      if (P.logo) {
        remplir([255, 255, 255]); doc.roundedRect(M, 7, 30, 24, 2, 2, 'F');
        var im = image(doc, P.logo, M + 2, 9, 26, 20);
        if (im) xm = M + 35;
      }
      police(15, true, [255, 255, 255]);
      var nl = lignes(P.nom || '', 100 - (xm - M));
      doc.text(nl.slice(0, 2), xm, 17);
      if (P.activite) { police(9.5, false, teinte(T.accent, 0.75)); doc.text(lignes(P.activite, 100 - (xm - M))[0], xm, 17 + hauteur(Math.min(2, nl.length), 15) + 0.5); }
      police(22, true, [255, 255, 255]);
      doc.text(tx(info.titre), W - M, 18, { align: 'right' });
      police(11, false, [255, 255, 255]);
      doc.text(tx(d.numero || ''), W - M, 26, { align: 'right' });
      // sous la bande : coordonnées à gauche, références à droite
      y = 46;
      police(8.5, false, DOUX);
      var det = details.slice(P.activite ? 1 : 0), yg = y;
      det.forEach(function (l) { var ll = lignes(l, 100); doc.text(ll, M, yg); yg += hauteur(ll.length, 8.5); });
      var yd = y;
      refs.slice(1).forEach(function (r) {
        police(8.5, false, DOUX); doc.text(tx(r[0]), W - M - 38, yd, { align: 'right' });
        police(9.5, true, TEXTE); doc.text(tx(r[1]), W - M, yd, { align: 'right' });
        yd += 5;
      });
      y = Math.max(yg, yd) + 3;
    } else {
      var yTop = T.nom === 'afrique' ? 16 : M, xg = M, hLogo = 0;
      if (P.logo) {
        var il = image(doc, P.logo, M, yTop, 34, 22);
        if (il) { xg = M + il.l + 5; hLogo = il.h; }
      }
      var largG = 112 - (xg - M);
      police(13.5, true, T.nom === 'afrique' ? T.accent : TEXTE);
      var nom = lignes(P.nom || '', largG).slice(0, 2);
      var yy = yTop + 5;
      doc.text(nom, xg, yy);
      yy += hauteur(nom.length, 13.5) - 0.5;
      police(8.5, false, DOUX);
      details.forEach(function (l) { var ll = lignes(l, largG); doc.text(ll, xg, yy); yy += hauteur(ll.length, 8.5); });
      // titre et références à droite
      police(info.titre.length > 10 ? 17 : 21, true, T.titre);
      doc.text(tx(info.titre), W - M, yTop + 7, { align: 'right' });
      var yr = yTop + 9.5;
      if (T.nom === 'afrique') { remplir(T.or); doc.rect(W - M - 26, yTop + 9.2, 26, 1.1, 'F'); yr += 2; }
      refs.forEach(function (r, i) {
        yr += 5.2;
        police(8.5, false, DOUX); doc.text(tx(r[0]), W - M - 36, yr, { align: 'right' });
        police(i === 0 ? 10.5 : 9.5, true, TEXTE); doc.text(tx(r[1]), W - M, yr, { align: 'right' });
      });
      y = Math.max(yy, yr + 2, yTop + hLogo) + 4;
      trait(T.nom === 'afrique' ? T.or : LIGNE, T.nom === 'afrique' ? 0.5 : 0.3);
      doc.line(M, y, W - M, y);
      y += 6;
    }

    // ---- Client et objet ----
    var c = d.client || {};
    var etiquette = d.type === 'facture' ? 'FACTURÉ À' : d.type === 'recu' ? 'REÇU DE' : 'CLIENT';
    var cl = [];
    String(c.adresse || '').split('\n').forEach(function (l) { if (l.trim()) cl.push(l.trim()); });
    var cc = [];
    if (c.telephone) cc.push('Tél. ' + c.telephone);
    if (c.email) cc.push(c.email);
    if (cc.length) cl.push(cc.join('  ·  '));
    if (c.ninea) cl.push('NINEA : ' + c.ninea);
    var largC = 92;
    var nomC = lignes(c.nom || 'Client', largC - 8);
    var detC = [];
    cl.forEach(function (l) { detC = detC.concat(lignes(l, largC - 8)); });
    var hC = 8 + hauteur(nomC.length, 11) + hauteur(detC.length, 9) + 2;
    if (T.nom === 'classique') { trait(LIGNE, 0.3); doc.roundedRect(M, y, largC, hC, 2, 2, 'S'); }
    else { remplir(T.nom === 'afrique' ? T.creme : teinte(T.accent, 0.93)); doc.roundedRect(M, y, largC, hC, 2, 2, 'F'); remplir(T.nom === 'afrique' ? T.terre : T.accent); doc.rect(M, y, 1.4, hC, 'F'); }
    police(7.5, true, T.nom === 'classique' ? DOUX : T.accent);
    doc.text(tx(etiquette), M + 5, y + 5.5);
    police(11, true, TEXTE);
    doc.text(nomC, M + 5, y + 11);
    police(9, false, DOUX);
    if (detC.length) doc.text(detC, M + 5, y + 11 + hauteur(nomC.length, 11));
    // colonne de droite : objet, références liées
    var xo = M + largC + 8, lo = W - M - xo, yo = y + 5.5;
    var annexes = [];
    if (d.objet) annexes.push(['OBJET', d.objet]);
    if (d.origine && d.origine.numero) annexes.push([d.type === 'recu' ? 'RÈGLEMENT DE' : 'D\'APRÈS LE DEVIS', d.origine.numero]);
    annexes.forEach(function (a) {
      police(7.5, true, T.nom === 'classique' ? DOUX : T.accent);
      doc.text(tx(a[0]), xo, yo);
      police(10, false, TEXTE);
      var ol = lignes(a[1], lo).slice(0, 4);
      doc.text(ol, xo, yo + 5);
      yo += 5 + hauteur(ol.length, 10) + 3;
    });
    y = Math.max(y + hC, yo) + 7;

    // ---- Tableau des lignes ----
    var avecRemise = (d.lignes || []).some(function (l) { return TF.lireNombre(l.remise) > 0; });
    var tete = ['Désignation', 'Qté', 'Prix unitaire'];
    if (avecRemise) tete.push('Remise');
    tete.push('Montant');
    var corps = (d.lignes || []).map(function (l) {
      var r = [tx(l.designation || '') + (l.details ? '\n' + tx(l.details) : ''),
        TF.formatQuantite(l.qte, sp) + (l.unite ? ' ' + tx(l.unite) : ''), TF.formatNombre(TF.lireNombre(l.pu), sp)];
      if (avecRemise) r.push(TF.lireNombre(l.remise) > 0 ? TF.formatQuantite(TF.lireNombre(l.remise), sp) + ' %' : '');
      r.push(TF.formatNombre(TF.montantLigne(l), sp));
      return r;
    });
    var nc = tete.length, cs = {};
    cs[1] = { halign: 'right', cellWidth: 21 };
    cs[2] = { halign: 'right', cellWidth: 29 };
    if (avecRemise) cs[3] = { halign: 'right', cellWidth: 17 };
    cs[nc - 1] = { halign: 'right', cellWidth: 31, fontStyle: 'bold' };
    var opts = {
      startY: y, head: [tete.map(tx)], body: corps,
      margin: { left: M, right: M, top: T.nom === 'afrique' ? 16 : M, bottom: 24 },
      theme: T.nom === 'classique' ? 'grid' : 'plain',
      styles: { font: 'helvetica', fontSize: 9.5, textColor: TEXTE, cellPadding: { top: 2.6, bottom: 2.6, left: 2.6, right: 2.6 },
        lineColor: LIGNE, lineWidth: T.nom === 'classique' ? 0.2 : 0, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: T.teteFond, textColor: T.teteTexte, fontStyle: 'bold', fontSize: 9 },
      columnStyles: cs,
      didParseCell: function (h) {
        if (h.section === 'head' && h.column.index > 0) h.cell.styles.halign = 'right';
        if (h.section === 'body' && T.zebre && h.row.index % 2 === 1) h.cell.styles.fillColor = T.zebre;
      },
      didDrawCell: function (h) {
        if (T.nom !== 'classique' && h.section === 'body') { trait(LIGNE, 0.15); doc.line(h.cell.x, h.cell.y + h.cell.height, h.cell.x + h.cell.width, h.cell.y + h.cell.height); }
        if (T.nom === 'afrique' && h.section === 'head') { remplir(T.or); doc.rect(h.cell.x, h.cell.y + h.cell.height - 0.8, h.cell.width, 0.8, 'F'); }
      },
      didDrawPage: function (h) { if (h.pageNumber > 1) decorPage(); }
    };
    if (typeof doc.autoTable === 'function') doc.autoTable(opts); else window.jspdf_autotable ? window.jspdf_autotable.autoTable(doc, opts) : window.autoTable(doc, opts);
    y = doc.lastAutoTable.finalY + 5;

    function place(besoin) {
      if (y + besoin > H - 26) { doc.addPage(); decorPage(); y = T.nom === 'afrique' ? 18 : M + 4; }
    }

    // ---- Totaux ----
    var rangs = [];
    var aRemise = t.remise > 0;
    if (aRemise || d.tvaActive) rangs.push(['Sous-total', TF.formatNombre(t.sousTotal, sp)]);
    if (aRemise) rangs.push(['Remise' + (d.remiseType === 'pct' ? ' (' + TF.formatQuantite(TF.lireNombre(d.remiseGlobale), sp) + ' %)' : ''), '- ' + TF.formatNombre(t.remise, sp)]);
    if (d.tvaActive) {
      if (aRemise) rangs.push(['Total HT', TF.formatNombre(t.ht, sp)]);
      rangs.push(['TVA (' + TF.formatQuantite(TF.lireNombre(d.tvaTaux), sp) + ' %)', TF.formatNombre(t.tva, sp)]);
    }
    var libTotal = d.type === 'recu' ? 'MONTANT REÇU' : d.tvaActive ? 'TOTAL TTC' : 'TOTAL';
    var apres = [];
    if (d.type === 'facture' && t.paye > 0) {
      apres.push(['Déjà payé', TF.formatNombre(t.paye, sp)]);
      apres.push(['Reste à payer', TF.formatNombre(t.reste, sp), true]);
    }
    if (d.type === 'recu' && d.origine && d.origine.reste !== undefined) apres.push(['Reste à payer sur la facture', TF.formatNombre(d.origine.reste, sp), true]);
    var lt = 84, xt = W - M - lt, hRang = 6.2;
    place(rangs.length * hRang + 11 + apres.length * hRang + 4);
    rangs.forEach(function (r) {
      police(9.5, false, DOUX); doc.text(tx(r[0]), xt + 3, y + 4.3);
      police(9.5, false, TEXTE); doc.text(tx(r[1]) + ' F', W - M - 3, y + 4.3, { align: 'right' });
      trait(LIGNE, 0.15); doc.line(xt, y + hRang, W - M, y + hRang);
      y += hRang;
    });
    y += 1.5;
    remplir(T.totalFond); doc.roundedRect(xt, y, lt, 10, 1.5, 1.5, 'F');
    if (T.nom === 'afrique') { remplir(T.or); doc.rect(xt, y, 2.2, 10, 'F'); }
    police(10.5, true, [255, 255, 255]);
    doc.text(tx(libTotal), xt + 4, y + 6.6);
    police(12, true, [255, 255, 255]);
    doc.text(TF.formatNombre(t.ttc, sp) + ' F CFA', W - M - 3, y + 6.8, { align: 'right' });
    y += 10;
    apres.forEach(function (r) {
      y += hRang;
      police(9.5, r[2] === true, r[2] ? TEXTE : DOUX); doc.text(tx(r[0]), xt + 3, y - 1.6);
      police(9.5, r[2] === true, TEXTE); doc.text(tx(r[1]) + ' F', W - M - 3, y - 1.6, { align: 'right' });
    });
    y += 7;

    // ---- Montant en lettres ----
    var phrase = TF.phraseArrete(d.type, t.ttc, sp);
    var i2 = phrase.indexOf(' : ');
    var intro = phrase.slice(0, i2 + 2), somme = phrase.slice(i2 + 3);
    var lgL = W - 2 * M - 8;
    police(10, true);
    var sl = lignes(somme.charAt(0).toUpperCase() + somme.slice(1), lgL);
    var hL = 6 + hauteur(1, 9) + hauteur(sl.length, 10) + 1;
    place(hL + 4);
    remplir(T.nom === 'classique' ? [246, 247, 248] : T.nom === 'afrique' ? T.creme : teinte(T.accent, 0.94));
    doc.rect(M, y, W - 2 * M, hL, 'F');
    remplir(T.nom === 'afrique' ? T.or : T.accent); doc.rect(M, y, 1.2, hL, 'F');
    police(9, 'i', DOUX); doc.text(tx(intro), M + 5, y + 5.5);
    police(10, true, TEXTE); doc.text(sl, M + 5, y + 5.5 + hauteur(1, 9) + 0.6);
    y += hL + 7;

    // ---- Notes, paiement (QR Wave), signature ----
    var sig = complet && P.signature ? P.signature : null;
    var lienQR = TF.lienWaveValide(P.lienWave) && d.type !== 'recu' && t.reste > 0 ? String(P.lienWave).trim() : null;
    var lgGauche = sig ? 112 : W - 2 * M;
    var notes = d.notes ? lignes(d.notes, lgGauche - (lienQR && !P.paiement ? 34 : 0)) : [];
    var payTxt = P.paiement ? lignes(P.paiement, lgGauche - (lienQR ? 34 : 0)) : [];
    var hNotes = notes.length ? 5 + hauteur(notes.length, 9) + 3 : 0;
    var hPay = payTxt.length || lienQR ? Math.max(5 + hauteur(payTxt.length, 9.5), lienQR ? 31 : 0) + 2 : 0;
    var hSig = sig ? 34 : 0;
    place(Math.max(hNotes + hPay, hSig));
    var yb = y;
    if (notes.length) {
      police(7.5, true, T.nom === 'classique' ? DOUX : T.accent); doc.text('CONDITIONS ET NOTES', M, yb + 3);
      police(9, false, TEXTE); doc.text(notes, M, yb + 8);
      yb += hNotes;
    }
    if (hPay) {
      police(7.5, true, T.nom === 'classique' ? DOUX : T.accent); doc.text('PAIEMENT', M, yb + 3);
      if (payTxt.length) { police(9.5, false, TEXTE); doc.text(payTxt, M, yb + 8); }
      if (lienQR && typeof window.qrcode === 'function') {
        var tq = 24, xq = M + lgGauche - tq - 2, yq = yb + 1;
        try {
          var q = window.qrcode(0, 'M'); q.addData(lienQR); q.make();
          var n = q.getModuleCount(), s = tq / n;
          remplir([255, 255, 255]); doc.rect(xq - 1.5, yq - 1.5, tq + 3, tq + 3, 'F');
          remplir([0, 0, 0]);
          for (var r = 0; r < n; r++) {
            for (var k = 0; k < n;) {
              if (q.isDark(r, k)) { var k0 = k; while (k < n && q.isDark(r, k)) k++; doc.rect(xq + k0 * s, yq + r * s, (k - k0) * s + 0.02, s + 0.02, 'F'); }
              else k++;
            }
          }
          police(7.5, true, TEXTE); doc.text('Scannez pour payer par Wave', xq + tq / 2, yq + tq + 4, { align: 'center' });
        } catch (e) { /* lien trop long pour un QR : ignoré */ }
      }
      yb += hPay;
    }
    if (sig) {
      var xs = W - M - 62;
      police(7.5, true, T.nom === 'classique' ? DOUX : T.accent); doc.text('SIGNATURE ET CACHET', xs, y + 3);
      image(doc, sig, xs, y + 5, 62, 28);
    }
    y = Math.max(yb, y + hSig);

    // ---- Filigrane d'exemple ----
    var pages = doc.getNumberOfPages();
    for (var pg = 1; pg <= pages; pg++) {
      doc.setPage(pg);
      if (ctx.filigrane) {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.1 }));
        police(70, true, [0, 0, 0]);
        doc.text('EXEMPLE', W / 2, H / 2 + 20, { align: 'center', angle: 35 });
        doc.restoreGraphicsState();
      }
      // pied de page
      var yp = T.nom === 'afrique' ? H - 9.5 : H - 8;
      trait(LIGNE, 0.2); doc.line(M, yp - 5, W - M, yp - 5);
      var pied = [P.nom, P.ninea ? 'NINEA ' + P.ninea : '', P.rc ? 'RC ' + P.rc : ''].filter(Boolean).join('  ·  ');
      police(7.5, false, DOUX);
      doc.text(lignes(pied, 150)[0] || '', M, yp - 1);
      doc.text('Page ' + pg + ' / ' + pages, W - M, yp - 1, { align: 'right' });
      if (!complet) {
        police(7, false, [130, 140, 135]);
        doc.text('Créé avec Teranga Factures', W / 2, yp + 3, { align: 'center' });
      }
    }

    var base = (info.nom.replace('ç', 'c').replace(/\s+/g, '-')) + '-' + (d.numero || 'brouillon');
    return { blob: doc.output('blob'), pages: pages, nom: base.replace(/[^A-Za-z0-9._-]/g, '') + '.pdf' };
  }

  window.TF_PDF = { generer: generer, bibliotheques: bibliotheques };
})();
