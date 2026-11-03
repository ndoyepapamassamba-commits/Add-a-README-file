/* Teranga Vitrine — catalogue PDF (A4, 6 produits par page, liens « Commander » vers WhatsApp). jsPDF est chargé à la demande. */
(function () {
  'use strict';
  var VT = window.VT;
  function chargerScript(src) {
    return new Promise(function (ok, ko) {
      if (document.querySelector('script[data-src="' + src + '"]')) return ok();
      var s = document.createElement('script'); s.src = src; s.dataset.src = src;
      s.onload = function () { ok(); };
      s.onerror = function () { s.remove(); ko(new Error('Fichier manquant. Ouvrez l\'application une fois avec Internet.')); };
      document.head.appendChild(s);
    });
  }
  function bibliotheque() { return window.jspdf ? Promise.resolve() : chargerScript('vendor/jspdf.umd.min.js'); }
  function rgb(h) { var n = parseInt(String(h || '#7b1e5a').replace('#', ''), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  var T = function (s) { return VT.textePDF(s); };

  // Photo recadrée au format de la carte (JPEG compact)
  function recadrer(blob, w, h) {
    if (!blob) return Promise.resolve(null);
    return window.VTImages.chargerImage(blob).then(function (img) {
      if (!img) return null;
      var c = document.createElement('canvas'), L = 640;
      c.width = L; c.height = Math.round(L * h / w);
      var x = c.getContext('2d'), iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      var k = Math.max(c.width / iw, c.height / ih), dw = iw * k, dh = ih * k;
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, (c.width - dw) / 2, (c.height - dh) * 0.4, dw, dh);
      return c.toDataURL('image/jpeg', 0.82);
    });
  }

  // o : { produits: [{ …produit, blob }], profil, couleur, titre }
  function catalogue(o) {
    return bibliotheque().then(function () {
      var cw = 87, ph = 51;
      return Promise.all(o.produits.map(function (p) { return recadrer(p.blob, cw, ph); }));
    }).then(function (photos) {
      var J = window.jspdf.jsPDF, doc = new J({ unit: 'mm', format: 'a4', compress: true });
      var P = o.profil || {}, A = rgb(o.couleur), W = 210, H = 297, M = 14, cw = 87, ch = 71, ph = 51, gx = W - 2 * M - 2 * cw;
      var num = P.numero ? VT.afficherNumero(P.numero) : '';
      var lienGeneral = P.numero ? VT.lienWhatsApp(P.numero, VT.messageCommande(P, null, P.messageCommande)) : '';
      var parPage = 6, pages = Math.max(1, Math.ceil(o.produits.length / parPage));
      doc.setProperties({ title: T('Catalogue ' + (P.nom || '')), subject: 'Catalogue', creator: 'Teranga Vitrine' });

      function entete() {
        doc.setFillColor(A[0], A[1], A[2]); doc.rect(0, 0, W, 44, 'F');
        doc.setFillColor(255, 255, 255); doc.setGState && doc.setGState(new doc.GState({ opacity: 0.12 }));
        doc.circle(W - 18, 6, 26, 'F'); doc.circle(W - 52, 44, 14, 'F');
        doc.setGState && doc.setGState(new doc.GState({ opacity: 1 }));
        doc.setTextColor(255, 255, 255);
        doc.setFont('times', 'bold'); doc.setFontSize(26);
        doc.text(T(doc.splitTextToSize(P.nom || 'Ma boutique', W - 2 * M - 30)[0]), M, 18);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
        var l2 = [P.slogan, P.lieu].filter(Boolean).join(' · ');
        if (l2) doc.text(T(doc.splitTextToSize(l2, W - 2 * M)[0]), M, 26);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        var titre = (o.titre || 'Catalogue') + ' du ' + VT.jourFr(VT.dateISO(), '0000-00-00').replace(/^\w+ /, '').toLowerCase();
        doc.text(T(titre.charAt(0).toUpperCase() + titre.slice(1)), M, 34);
        if (num) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
          var t = T('Commandez sur WhatsApp : ' + num), w = doc.getTextWidth(t) + 8;
          doc.setFillColor(255, 255, 255); doc.roundedRect(W - M - w, 29, w, 8, 4, 4, 'F');
          doc.setTextColor(A[0], A[1], A[2]); doc.text(t, W - M - w + 4, 34.6);
          doc.link(W - M - w, 29, w, 8, { url: lienGeneral });
        }
        if (P.livraison) { doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(T(doc.splitTextToSize(P.livraison, W - 2 * M)[0]), M, 40.5); }
      }
      function pied(n) {
        doc.setDrawColor(225, 220, 215); doc.setLineWidth(0.3); doc.line(M, H - 13, W - M, H - 13);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(120, 112, 105);
        doc.text(T((P.nom || '') + (num ? ' · WhatsApp ' + num : '')), M, H - 8);
        doc.text(T('Page ' + n + ' / ' + pages), W - M, H - 8, { align: 'right' });
        doc.setFontSize(7); doc.text(T('Prix en F CFA. Catalogue fait avec Teranga Vitrine.'), W / 2, H - 4.5, { align: 'center' });
      }
      function carte(p, photo, x, y) {
        doc.setDrawColor(230, 224, 218); doc.setLineWidth(0.3); doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, y, cw, ch, 3, 3, 'FD');
        if (photo) doc.addImage(photo, 'JPEG', x + 0.6, y + 0.6, cw - 1.2, ph, undefined, 'FAST');
        else {
          doc.setFillColor(A[0], A[1], A[2]); doc.rect(x + 0.6, y + 0.6, cw - 1.2, ph, 'F');
          doc.setTextColor(255, 255, 255); doc.setFont('times', 'bold'); doc.setFontSize(34);
          doc.text(T(String(p.nom || '?').charAt(0).toUpperCase()), x + cw / 2, y + ph / 2 + 5, { align: 'center' });
        }
        if (VT.enPromo(p)) {
          doc.setFillColor(A[0], A[1], A[2]); doc.circle(x + cw - 9, y + 9, 6.5, 'F');
          doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
          doc.text(T('-' + VT.remisePct(p) + '%'), x + cw - 9, y + 10.2, { align: 'center' });
        }
        var et = VT.etatStock(p);
        if (et === 'epuise') {
          doc.setFillColor(180, 35, 24); doc.rect(x + 0.6, y + 4, 26, 6.5, 'F');
          doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(T('ÉPUISÉ'), x + 13.6, y + 8.4, { align: 'center' });
        }
        var ty = y + ph + 6;
        doc.setTextColor(35, 28, 24); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
        var nl = doc.splitTextToSize(T(p.nom), cw - 6);
        doc.text(nl[0] + (nl.length > 1 ? '…' : ''), x + 3, ty);
        ty += 6.2;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(A[0], A[1], A[2]);
        var px = T(VT.formatNombre(VT.prixVente(p), ' ') + ' F CFA');
        doc.text(px, x + 3, ty);
        if (VT.enPromo(p)) {
          var wpx = doc.getTextWidth(px);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(150, 142, 135);
          var ap = T(VT.formatNombre(p.prix, ' ') + ' F'), wap = doc.getTextWidth(ap);
          doc.text(ap, x + 6 + wpx, ty); doc.setDrawColor(150, 142, 135); doc.line(x + 6 + wpx, ty - 1.1, x + 6 + wpx + wap, ty - 1.1);
        }
        var info = [];
        if (p.tailles && p.tailles.length) info.push(p.tailles.join(', '));
        if (p.couleurs && p.couleurs.length) info.push(p.couleurs.join(', '));
        if (et === 'bas') info.push('plus que ' + p.stock);
        if (info.length) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 102, 96);
          doc.text(doc.splitTextToSize(T(info.join(' · ')), cw - 30)[0], x + 3, y + ch - 3.2);
        }
        if (P.numero && et !== 'epuise') {
          doc.setFillColor(31, 168, 85); doc.roundedRect(x + cw - 26, y + ch - 8, 23, 6, 3, 3, 'F');
          doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
          doc.text(T('Commander'), x + cw - 14.5, y + ch - 3.9, { align: 'center' });
          doc.link(x + cw - 26, y + ch - 8, 23, 6, { url: VT.lienWhatsApp(P.numero, VT.messageCommande(P, p)) });
        }
      }
      for (var pg = 0; pg < pages; pg++) {
        if (pg) doc.addPage();
        doc.setFillColor(250, 247, 243); doc.rect(0, 0, W, H, 'F');
        entete();
        var y0 = 50;
        for (var k = 0; k < parPage; k++) {
          var i = pg * parPage + k;
          if (i >= o.produits.length) break;
          carte(o.produits[i], photos[i], M + (k % 2) * (cw + gx), y0 + Math.floor(k / 2) * (ch + 5));
        }
        pied(pg + 1);
      }
      var nom = 'catalogue-' + (VT.sansAccents(P.nom || 'boutique').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'boutique') + '-' + VT.dateISO() + '.pdf';
      return { blob: doc.output('blob'), nom: nom };
    });
  }
  window.VTPDF = { catalogue: catalogue, bibliotheque: bibliotheque };
})();
