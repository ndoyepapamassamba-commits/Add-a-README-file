/* Calcul Chantier — « devis matériaux » en PDF A4 (jsPDF + jsPDF-AutoTable, copies locales). */
(function () {
  'use strict';
  var BRIQUE = [168, 68, 27], ENCRE = [34, 29, 25], GRIS = [98, 90, 82], FOND = [245, 241, 236], AVERT = [255, 241, 214], AVERT_BORD = [154, 91, 0];
  var chargement = null;
  function script(src) {
    return new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = function () { ko(new Error('Le module PDF n\'a pas pu être chargé. Ouvrez l\'application une fois avec Internet.')); };
      document.head.appendChild(s);
    });
  }
  function charger() {
    if (!chargement) {
      chargement = (window.jspdf ? Promise.resolve() : script('vendor/jspdf.umd.min.js'))
        .then(function () { return window.jspdf && window.jspdf.jsPDF.API.autoTable ? null : script('vendor/jspdf.plugin.autotable.min.js'); })
        .then(function () { if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF indisponible.'); return window.jspdf.jsPDF; })
        .catch(function (e) { chargement = null; throw e; });
    }
    return chargement;
  }
  var T = function (s) { return CC.textePDF(s); };
  var F = function (n) { return CC.formatNombre(n, ' ') + ' F'; };
  function table(doc, opts) {
    opts = Object.assign({ theme: 'grid', margin: { left: 14, right: 14, bottom: 24 }, styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, textColor: ENCRE, lineColor: [224, 216, 205], lineWidth: 0.2 },
      headStyles: { fillColor: BRIQUE, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: FOND } }, opts);
    if (typeof doc.autoTable === 'function') doc.autoTable(opts); else window.jspdf_autotable ? window.jspdf_autotable.autoTable(doc, opts) : window.autoTable(doc, opts);
    return doc.lastAutoTable.finalY;
  }
  function place(doc, y, besoin) { if (y + besoin > 270) { doc.addPage(); return 20; } return y; }
  function titre(doc, y, s, taille) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(taille || 12.5); doc.setTextColor.apply(doc, BRIQUE);
    doc.text(T(s), 14, y);
    return y + 6;
  }
  function lignesMat(l) {
    return [T(l.nom), T(CC.quantiteTexte(l)), T(l.info || ''), T(F(l.pu)), T(F(l.montant))];
  }

  function devis(projet, elements, b, planEtapes) {
    return charger().then(function (jsPDF) {
      var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true }), L = 210, y;
      doc.setProperties({ title: T('Devis matériaux ' + (projet.nom || '')), creator: 'Calcul Chantier' });
      // en-tête
      doc.setFillColor.apply(doc, BRIQUE); doc.rect(0, 0, L, 30, 'F');
      doc.setFillColor(242, 183, 5); doc.rect(0, 30, L, 1.5, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
      doc.text(T('DEVIS MATÉRIAUX'), 14, 13);
      doc.setFontSize(12); doc.text(T((projet.nom || 'Mon chantier') + (projet.lieu ? ' — ' + projet.lieu : '')), 14, 21, { maxWidth: 130 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(T('Établi le ' + CC.dateFr(CC.dateISO())), L - 14, 13, { align: 'right' });
      doc.text(T('Marge de pertes : ' + CC.formatDecimal(projet.marge, 1) + ' %'), L - 14, 19, { align: 'right' });
      // avertissement
      y = 38;
      doc.setFillColor.apply(doc, AVERT); doc.setDrawColor.apply(doc, AVERT_BORD); doc.setLineWidth(0.4);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      var av = doc.splitTextToSize(T('Attention : ' + CC.AVERTISSEMENT), L - 36);
      doc.roundedRect(14, y, L - 28, av.length * 4.6 + 6, 2, 2, 'FD');
      doc.setTextColor.apply(doc, ENCRE); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      doc.text(av, 18, y + 5.5);
      y += av.length * 4.6 + 13;

      // résumé par étape
      y = titre(doc, y, 'Budget par étape');
      var etapes = b.etapes.filter(function (e) { return e.total > 0; });
      y = table(doc, { startY: y, head: [['Étape', 'Éléments', 'Montant']], body: etapes.map(function (e, i) { return [T((i + 1) + '. ' + e.nom), String(e.elements.length), T(F(e.total))]; }),
        foot: [[T('Total'), '', T(F(b.total))]], footStyles: { fillColor: [242, 183, 5], textColor: ENCRE, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'center', cellWidth: 24 }, 2: { halign: 'right', cellWidth: 40 } } }) + 8;

      // détail par étape
      etapes.forEach(function (e, i) {
        y = place(doc, y, 40);
        y = titre(doc, y, (i + 1) + '. ' + e.nom + ' — ' + F(e.total), 12);
        y = table(doc, { startY: y, head: [['Matériau', 'Quantité', 'Détail', 'Prix unitaire', 'Montant']], body: e.lignes.map(lignesMat),
          columnStyles: { 1: { halign: 'right', cellWidth: 30 }, 2: { cellWidth: 42, textColor: GRIS, fontSize: 8 }, 3: { halign: 'right', cellWidth: 26 }, 4: { halign: 'right', cellWidth: 28 } } }) + 3;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, GRIS);
        e.elements.forEach(function (el) {
          var txt = doc.splitTextToSize(T('• ' + (el.nom || CC.TYPES[el.type].nom) + ' : ' + CC.resumeDims(el)), L - 30);
          y = place(doc, y, txt.length * 4 + 2);
          doc.text(txt, 16, y + 3); y += txt.length * 4;
        });
        y += 7;
      });

      // liste d'achat globale
      var achat = CC.listeAchat(b);
      if (achat.length) {
        y = place(doc, y, 40);
        y = titre(doc, y, 'Liste d\'achat de tout le chantier');
        y = table(doc, { startY: y, head: [['Matériau', 'Quantité', 'Montant']], body: achat.map(function (l) { return [T(l.nom), T(CC.quantiteTexte(l)), T(F(l.montant))]; }),
          foot: [[T('Total'), '', T(F(b.total))]], footStyles: { fillColor: [242, 183, 5], textColor: ENCRE, fontStyle: 'bold' },
          columnStyles: { 1: { halign: 'right', cellWidth: 40 }, 2: { halign: 'right', cellWidth: 36 } } }) + 8;
      }

      // plan d'épargne
      if (planEtapes && planEtapes.length && CC.entier(projet.epargne && projet.epargne.mensuel) > 0) {
        y = place(doc, y, 40);
        y = titre(doc, y, 'Plan d\'épargne (' + F(projet.epargne.mensuel) + ' par mois, ' + F(projet.epargne.deja || 0) + ' déjà mis de côté)');
        y = table(doc, { startY: y, head: [['Étape', 'Budget', 'Déjà dépensé', 'Reste à financer', 'Finançable']], body: planEtapes.map(function (p) {
          return [T(p.nom), T(F(p.budget)), T(F(p.depense)), T(F(p.reste)), T(p.terminee ? 'terminée' : p.mois === 0 ? 'dès maintenant' : p.quand ? CC.moisFr(p.quand) : '—')];
        }), columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } }) + 8;
      }

      // hypothèses
      y = place(doc, y, 60);
      y = titre(doc, y, 'Hypothèses de calcul (dosages standard)');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, ENCRE);
      hypotheses(projet).forEach(function (h) {
        var txt = doc.splitTextToSize(T('• ' + h), L - 30);
        y = place(doc, y, txt.length * 4 + 1);
        doc.text(txt, 16, y); y += txt.length * 4 + 0.6;
      });

      // pied de page sur chaque page
      var n = doc.getNumberOfPages();
      for (var i = 1; i <= n; i++) {
        doc.setPage(i);
        doc.setDrawColor(224, 216, 205); doc.setLineWidth(0.3); doc.line(14, 282, L - 14, 282);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, GRIS);
        doc.text(doc.splitTextToSize(T(CC.AVERTISSEMENT), L - 60), 14, 286);
        doc.text(T('Calcul Chantier · page ' + i + ' / ' + n), L - 14, 286, { align: 'right' });
      }
      var nom = 'devis-materiaux-' + (CC.sansAccents(projet.nom || 'chantier').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'chantier') + '.pdf';
      return { blob: doc.output('blob'), nom: nom };
    });
  }

  // Liste lisible des hypothèses (aussi affichée dans l'application)
  function hypotheses(projet) {
    var D = CC.DOSAGES, H = CC.H, l = [];
    Object.keys(D).forEach(function (k) {
      var d = D[k];
      l.push(d.nom + ' : ' + d.ciment + ' kg de ciment par m³, ' + CC.formatDecimal(d.sable * 1000, 0) + ' L de sable' + (d.gravier ? ', ' + CC.formatDecimal(d.gravier * 1000, 0) + ' L de gravier' : '') + ', ' + d.eau + ' L d\'eau.');
    });
    l.push('Ciment en sacs de ' + H.sac + ' kg ; fer en barres de ' + H.barre + ' m ; eau comptée en barriques de ' + H.barrique + ' L.');
    l.push('Fer : recouvrement de ' + H.recouvrement + ' fois le diamètre à chaque jonction de barres filantes ; ' + CC.formatDecimal(H.attente * 100, 0) + ' cm d\'attente ajoutés à chaque barre de poteau ; cadres = tour de la section moins ' + CC.formatDecimal(H.enrobage, 1) + ' cm d\'enrobage de chaque côté, plus ' + CC.formatDecimal(H.crochets * 100, 0) + ' cm de crochets.');
    l.push('Semelles : barres dans les deux sens, longueur = côté − 2 × ' + CC.formatDecimal(H.enrobageSemelle * 100, 0) + ' cm + 2 retours de ' + CC.formatDecimal(H.retour * 100, 0) + ' cm ; béton de propreté de ' + CC.formatDecimal(H.proprete * 100, 0) + ' cm.');
    l.push('Murs : ' + CC.formatDecimal(H.parpaingsM2, 1) + ' parpaings de 40 × 20 cm par m² ; mortier de pose ' + CC.formatDecimal(H.mortierM2[15] * 1000, 0) + ' L/m² (parpaings de 15) et ' + CC.formatDecimal(H.mortierM2[20] * 1000, 0) + ' L/m² (parpaings de 20) ; porte 0,90 × 2,10 m, fenêtre 1,20 × 1,00 m.');
    l.push('Carrelage : colle ' + H.colleM2 + ' kg/m² (sacs de ' + H.sacColle + ' kg) ou mortier de ' + CC.formatDecimal(H.chape * 100, 0) + ' cm.');
    l.push('Marge de pertes ajoutée à toutes les quantités : ' + CC.formatDecimal(projet ? projet.marge : 10, 1) + ' %. Quantités arrondies au-dessus : sacs, barres, parpaings, pots et barriques entiers ; sable et gravier au dixième de m³.');
    l.push(projet && projet.prixVerifies ? 'Prix unitaires saisis par l\'utilisateur.' : 'Prix unitaires d\'exemple, à remplacer par ceux de votre quincaillerie.');
    return l;
  }

  window.CCPdf = { devis: devis, hypotheses: hypotheses, charger: charger };
})();
