/* Carnet du Tailleur — reçus PDF (acompte et solde) et fiche de mesures, au format A5, avec jsPDF (copie locale). */
(function () {
  'use strict';
  var INDIGO = [45, 58, 140], OR = [242, 183, 5], ENCRE = [28, 28, 36], GRIS = [96, 98, 112], FILET = [214, 214, 226], FOND = [244, 244, 250];
  var vendor = null;

  function charger() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (vendor) return vendor;
    vendor = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = 'vendor/jspdf.umd.min.js';
      s.onload = function () { window.jspdf && window.jspdf.jsPDF ? ok(window.jspdf.jsPDF) : ko(new Error('PDF indisponible.')); };
      s.onerror = function () { vendor = null; ko(new Error('Le module PDF n\'a pas pu être chargé. Ouvrez l\'application une fois avec Internet.')); };
      document.head.appendChild(s);
    });
    return vendor;
  }
  var T = function (s) { return CT.textePDF(s); };
  var F = function (n) { return CT.formatNombre(n, ' ') + ' F'; };
  function nomFichier(s) { return CT.sansAccents(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'document'; }

  function entete(doc, atelier, L) {
    doc.setFillColor.apply(doc, INDIGO); doc.rect(0, 0, L, 27, 'F');
    doc.setFillColor.apply(doc, OR); doc.rect(0, 27, L, 1.6, 'F');
    // petites graduations de mètre ruban sur la bande dorée
    doc.setDrawColor(120, 90, 0); doc.setLineWidth(0.2);
    for (var x = 4; x < L; x += 3) doc.line(x, 27, x, (x - 4) % 15 === 0 ? 28.6 : 27.8);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(T(atelier.nom || 'Mon atelier de couture'), 12, 12, { maxWidth: L - 24 });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    var l = [];
    if (atelier.adresse) l.push(String(atelier.adresse).replace(/\s*\n\s*/g, ', '));
    if (atelier.telephone) l.push('Tél. ' + atelier.telephone);
    if (l.length) doc.text(T(l.join('  ·  ')), 12, 19, { maxWidth: L - 24 });
  }
  function pied(doc, L, H, texte) {
    doc.setDrawColor.apply(doc, FILET); doc.setLineWidth(0.3); doc.line(12, H - 14, L - 12, H - 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, GRIS);
    doc.text(T(texte), 12, H - 9.5, { maxWidth: L - 24 });
  }
  function ligne(doc, y, gauche, droite, L, opt) {
    opt = opt || {};
    if (opt.fond) { doc.setFillColor.apply(doc, opt.fond); doc.rect(12, y - 5.2, L - 24, 8, 'F'); }
    doc.setFont('helvetica', opt.gras ? 'bold' : 'normal'); doc.setFontSize(opt.taille || 10); doc.setTextColor.apply(doc, opt.couleur || ENCRE);
    doc.text(T(gauche), 15, y);
    doc.text(T(droite), L - 15, y, { align: 'right' });
  }

  // Reçu d'un paiement : « REÇU D'ACOMPTE » ou « REÇU DE SOLDE »
  function recu(commande, client, atelier, paiementId) {
    return charger().then(function (jsPDF) {
      var sit = CT.situationApres(commande, paiementId);
      if (!sit) throw new Error('Paiement introuvable.');
      var p = sit.paiement, solde = sit.reste === 0;
      var doc = new jsPDF({ unit: 'mm', format: 'a5', compress: true });
      var L = 148, H = 210, y;
      doc.setProperties({ title: T((solde ? 'Reçu de solde ' : 'Reçu d\'acompte ') + (p.recu || '')), creator: 'Carnet du Tailleur' });
      entete(doc, atelier || {}, L);
      doc.setTextColor.apply(doc, INDIGO); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
      doc.text(T(solde ? 'REÇU DE SOLDE' : 'REÇU D\'ACOMPTE'), 12, 41);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, ENCRE);
      doc.text(T('N° ' + (p.recu || '—')), L - 12, 37, { align: 'right' });
      doc.text(T('Le ' + CT.dateFr(p.date)), L - 12, 42, { align: 'right' });

      y = 53;
      doc.setFontSize(9); doc.setTextColor.apply(doc, GRIS); doc.text('Reçu de', 12, y);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor.apply(doc, ENCRE);
      doc.text(T(client && client.nom ? client.nom : 'Client'), 12, y + 6, { maxWidth: L - 24 });
      y += 15;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, GRIS); doc.text('Pour', 12, y);
      doc.setFontSize(10.5); doc.setTextColor.apply(doc, ENCRE);
      var habit = doc.splitTextToSize(T(CT.texteHabit(commande)), L - 24);
      doc.text(habit.slice(0, 3), 12, y + 6);
      y += 6 + habit.slice(0, 3).length * 5;
      doc.setFontSize(8.5); doc.setTextColor.apply(doc, GRIS);
      doc.text(T('Commande ' + (commande.numero || '') + ' du ' + CT.dateFr(commande.date)), 12, y);
      y += 9;

      // tableau des montants
      doc.setDrawColor.apply(doc, FILET); doc.setLineWidth(0.3);
      doc.roundedRect(12, y - 6, L - 24, 37, 2, 2, 'S');
      ligne(doc, y, 'Prix convenu', F(sit.prix), L);
      ligne(doc, y + 8, 'Déjà payé avant ce reçu', F(sit.payeAvant), L);
      ligne(doc, y + 16, 'Montant reçu ce jour' + (p.mode ? ' (' + p.mode + ')' : ''), F(p.montant), L, { gras: true, fond: FOND, taille: 11 });
      ligne(doc, y + 25, solde ? 'Reste à payer : SOLDÉ' : 'Reste à payer', F(sit.reste), L, { gras: true, taille: 12, couleur: solde ? [11, 110, 79] : [168, 42, 32] });
      y += 41;

      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor.apply(doc, ENCRE);
      var lettres = doc.splitTextToSize(T('Arrêté le présent reçu à la somme de : ' + CT.sommeEnLettres(p.montant) + '.'), L - 24);
      doc.text(lettres, 12, y);
      y += lettres.length * 4.6 + 4;

      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      if (!solde) {
        if (CT.dateValide(commande.dateEssayage)) { doc.text(T('Essayage prévu : ' + CT.dateLongue(commande.dateEssayage) + ' ' + commande.dateEssayage.slice(0, 4)), 12, y); y += 5.5; }
        if (CT.dateValide(commande.dateLivraison)) { doc.text(T('Livraison prévue : ' + CT.dateLongue(commande.dateLivraison) + ' ' + commande.dateLivraison.slice(0, 4)), 12, y); y += 5.5; }
      } else {
        doc.text(T('Merci ! La commande est entièrement payée.'), 12, y); y += 5.5;
      }

      // signature
      var ys = Math.max(y + 8, 160);
      doc.setFontSize(8.5); doc.setTextColor.apply(doc, GRIS);
      doc.text(T('Signature et cachet de l\'atelier'), L - 12, ys, { align: 'right' });
      doc.setDrawColor.apply(doc, FILET); doc.line(L - 70, ys + 16, L - 12, ys + 16);
      pied(doc, L, H, solde ? 'Reçu de solde. Merci pour votre confiance.' : 'Gardez ce reçu : il vous sera demandé au retrait de votre habit.');
      var nom = (solde ? 'recu-solde-' : 'recu-acompte-') + nomFichier((p.recu || '') + '-' + (client && client.nom || '')) + '.pdf';
      return { blob: doc.output('blob'), nom: nom };
    });
  }

  // Fiche de mesures d'un client (dernier relevé ou relevé donné)
  function fiche(client, releve, atelier) {
    return charger().then(function (jsPDF) {
      var doc = new jsPDF({ unit: 'mm', format: 'a5', compress: true });
      var L = 148, H = 210;
      doc.setProperties({ title: T('Mesures ' + (client.nom || '')), creator: 'Carnet du Tailleur' });
      entete(doc, atelier || {}, L);
      doc.setTextColor.apply(doc, INDIGO); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text('MESURES', 12, 41);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, ENCRE);
      doc.text(T('Prises le ' + CT.dateFr(releve.date)), L - 12, 41, { align: 'right' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text(T((client.nom || '') + ' · ' + (CT.MODELES[releve.modele] ? CT.MODELES[releve.modele].nom : '')), 12, 50, { maxWidth: L - 24 });
      var y = 60, cles = CT.clesReleve(releve);
      cles.forEach(function (k, i) {
        if (i % 2 === 0) { doc.setFillColor.apply(doc, FOND); doc.rect(12, y - 5, L - 24, 7.4, 'F'); }
        ligne(doc, y, CT.MESURES[k].nom, CT.formatCm(releve.valeurs[k]) + ' cm', L, { taille: 10.5 });
        y += 7.4;
      });
      (releve.libres || []).forEach(function (m) {
        if (!m || !m.nom) return;
        ligne(doc, y, m.nom, String(m.valeur || ''), L, { taille: 10.5 }); y += 7.4;
      });
      if (releve.note) {
        y += 3; doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor.apply(doc, GRIS);
        doc.text(doc.splitTextToSize(T('Note : ' + releve.note), L - 24).slice(0, 4), 12, y);
      }
      pied(doc, L, H, 'Mesures en centimètres.');
      return { blob: doc.output('blob'), nom: 'mesures-' + nomFichier(client.nom) + '-' + releve.date + '.pdf' };
    });
  }

  window.CTPdf = { recu: recu, fiche: fiche, charger: charger };
})();
