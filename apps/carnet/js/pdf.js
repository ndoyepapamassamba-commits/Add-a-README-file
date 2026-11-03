/* Carnet Boutique — relevé de compte d'un client en PDF, fabriqué dans le téléphone (jsPDF, copie locale). */
(function () {
  'use strict';
  var CB = window.CB;
  var W = 210, H = 297, M = 14;
  var VERT = [11, 110, 79], VERT_CLAIR = [226, 241, 234], JAUNE = [242, 183, 5], TEXTE = [28, 33, 30], DOUX = [96, 106, 101], LIGNE = [214, 220, 217];
  var ROUGE = [180, 35, 24], ZEBRE = [247, 249, 246];
  var chargement = null;

  function bibliotheque() {
    if (window.jspdf) return Promise.resolve();
    if (!chargement) {
      chargement = new Promise(function (ok, ko) {
        var s = document.createElement('script');
        s.src = 'vendor/jspdf.umd.min.js';
        s.onload = function () { ok(); };
        s.onerror = function () { s.remove(); chargement = null; ko(new Error("Fichier PDF manquant. Rouvrez l'application une fois connecté à Internet.")); };
        document.head.appendChild(s);
      });
    }
    return chargement;
  }
  var F = function (n) { return CB.formatF(n, ' '); };
  // Le PDF n'utilise que les polices standard : on remplace les caractères qu'elles ne savent pas écrire
  function propre(s) {
    return String(s == null ? '' : s).replace(/[  ]/g, ' ').replace(/[×]/g, 'x').replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-').replace(/[^\x20-\x7e -ÿŒœ€]/g, '');
  }

  // d : { boutique, paiement, client, lignes (historique chronologique), resume, jour }
  function releve(d) {
    return bibliotheque().then(function () {
      var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
      doc.setProperties({ title: 'Relevé de compte - ' + propre(d.client.nom), creator: 'Carnet Boutique' });
      var y = 0, page = 1;

      function entete() {
        doc.setFillColor.apply(doc, VERT); doc.rect(0, 0, W, 30, 'F');
        doc.setFillColor.apply(doc, JAUNE); doc.rect(0, 30, W, 1.6, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
        doc.text(propre(d.boutique || 'Ma boutique').slice(0, 40), M, 14);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
        doc.text('Relevé de compte client', M, 22);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        doc.setTextColor.apply(doc, JAUNE);
        doc.text('Le ' + CB.dateComplete(d.jour), W - M, 14, { align: 'right' });
        y = 40;
      }
      function teteTableau() {
        doc.setFillColor.apply(doc, VERT_CLAIR); doc.rect(M, y, W - 2 * M, 9, 'F');
        doc.setTextColor.apply(doc, VERT); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
        doc.text('Date', M + 2, y + 6);
        doc.text('Détail', M + 26, y + 6);
        doc.text('Crédit', 136, y + 6, { align: 'right' });
        doc.text('Payé', 164, y + 6, { align: 'right' });
        doc.text('Reste', W - M - 2, y + 6, { align: 'right' });
        y += 11;
      }
      function nouvellePage() { doc.addPage(); page++; entete(); teteTableau(); }

      entete();
      // Client et reste à payer
      doc.setTextColor.apply(doc, DOUX); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text('Client', M, y);
      doc.setTextColor.apply(doc, TEXTE); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
      doc.text(propre(d.client.nom).slice(0, 40), M, y + 8);
      var reste = d.resume.solde;
      var boite = reste > 0 ? [253, 236, 234] : VERT_CLAIR;
      doc.setFillColor.apply(doc, boite); doc.roundedRect(118, y - 5, W - M - 118, 22, 3, 3, 'F');
      doc.setTextColor.apply(doc, DOUX); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.text(reste > 0 ? 'Reste à payer' : 'Compte à jour', W - M - 4, y + 1, { align: 'right' });
      doc.setTextColor.apply(doc, reste > 0 ? ROUGE : VERT); doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
      doc.text(F(Math.max(0, reste)), W - M - 4, y + 12, { align: 'right' });
      y += 24;
      if (reste > 0 && d.resume.depuis) {
        doc.setTextColor.apply(doc, DOUX); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        doc.text('Plus ancien crédit non réglé : ' + CB.dateComplete(d.resume.depuis), M, y);
        y += 6;
      }
      y += 2;
      teteTableau();

      doc.setFontSize(10);
      d.lignes.forEach(function (l, i) {
        var o = l.op, credit = o.type !== 'paiement';
        var detail = credit ? (CB.texteArticles(o.articles) || 'Crédit') : 'Paiement' + (o.note ? ' - ' + o.note : '');
        if (credit && o.note) detail += ' - ' + o.note;
        doc.setFont('helvetica', 'normal');
        var lignesTxt = doc.splitTextToSize(propre(detail), 76).slice(0, 3);
        var h = Math.max(8, 4 + lignesTxt.length * 4.4);
        if (y + h > H - 26) nouvellePage();
        if (i % 2 === 1) { doc.setFillColor.apply(doc, ZEBRE); doc.rect(M, y - 1, W - 2 * M, h, 'F'); }
        doc.setTextColor.apply(doc, TEXTE); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        doc.text(CB.dateComplete(o.date), M + 2, y + 4.6);
        doc.text(lignesTxt, M + 26, y + 4.6);
        if (credit) doc.text(F(o.montant), 136, y + 4.6, { align: 'right' });
        else { doc.setTextColor.apply(doc, VERT); doc.text(F(o.montant), 164, y + 4.6, { align: 'right' }); }
        doc.setTextColor.apply(doc, TEXTE); doc.setFont('helvetica', 'bold');
        doc.text(F(l.soldeApres), W - M - 2, y + 4.6, { align: 'right' });
        y += h;
      });
      if (!d.lignes.length) {
        doc.setTextColor.apply(doc, DOUX); doc.setFont('helvetica', 'normal');
        doc.text('Aucune opération.', M + 2, y + 5); y += 9;
      }
      // Totaux
      if (y + 30 > H - 20) nouvellePage();
      doc.setDrawColor.apply(doc, LIGNE); doc.setLineWidth(0.4); doc.line(M, y + 1, W - M, y + 1);
      y += 7;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor.apply(doc, TEXTE);
      doc.text('Total des crédits', M + 2, y); doc.text(F(d.resume.credits), W - M - 2, y, { align: 'right' }); y += 6.5;
      doc.text('Total payé', M + 2, y); doc.setTextColor.apply(doc, VERT); doc.text(F(d.resume.paiements), W - M - 2, y, { align: 'right' }); y += 8;
      doc.setFillColor.apply(doc, reste > 0 ? ROUGE : VERT); doc.roundedRect(M, y - 5.5, W - 2 * M, 11, 2, 2, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5);
      doc.text(reste > 0 ? 'RESTE À PAYER' : 'COMPTE À JOUR', M + 4, y + 1.8);
      doc.text(F(Math.max(0, reste)), W - M - 4, y + 1.8, { align: 'right' });
      y += 14;
      doc.setTextColor.apply(doc, TEXTE); doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
      if (d.paiement) { doc.text(propre('Paiement possible par ' + d.paiement + '.'), M, y); y += 6; }
      doc.text('Merci de votre confiance.', M, y);
      // Pied de page sur chaque page
      var n = doc.getNumberOfPages();
      for (var p = 1; p <= n; p++) {
        doc.setPage(p);
        doc.setDrawColor.apply(doc, LIGNE); doc.line(M, H - 14, W - M, H - 14);
        doc.setTextColor.apply(doc, DOUX); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
        doc.text('Relevé établi avec Carnet Boutique, le carnet de crédit du boutiquier.', M, H - 9);
        doc.text(p + ' / ' + n, W - M, H - 9, { align: 'right' });
      }
      return doc.output('blob');
    });
  }

  window.CBPDF = { releve: releve, bibliotheque: bibliotheque };
})();
