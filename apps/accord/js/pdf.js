/* AccordAI — PDF « Dossier chronologique » (jsPDF, copie locale). A4, polices standard du PDF. */
(function () {
  'use strict';
  var AC = window.AC;
  var VERT = [11, 110, 79], VERT_PALE = [226, 241, 234], ENCRE = [23, 32, 27], GRIS = [86, 98, 91], LIGNE = [210, 218, 213], ROUGE = [179, 38, 30];
  var L = 210, H = 297, M = 16, BAS = H - 18;

  // Les polices standard du PDF ne connaissent que l'alphabet latin (WinAnsi) : on remplace le reste
  function propre(s) {
    return String(s == null ? '' : s)
      .replace(/[     ]/g, ' ')
      .replace(/→/g, '->').replace(/✓|✔/g, 'OK').replace(/⚠️?/g, '!')
      .replace(/[‘’ʼ]/g, '\'').replace(/[“”]/g, '"')
      .replace(/[​-‏‪-‮⁦-⁩️]/g, '')
      .replace(/[^\u0009\u000a -~ -ÿŒœŠšŸŽžƒˆ˜–—‚„†‡•…‰‹›€™]/g, '');
  }

  function generer(dossier, opts) {
    opts = opts || {};
    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) throw new Error('Module PDF indisponible. Rechargez l\'application.');
    var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    var y = M;
    var evs = AC.trier(dossier.evenements);
    var d = dossier.donnees || {};
    var maintenant = opts.maintenant ? new Date(opts.maintenant) : new Date();

    function police(taille, style, couleur) { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(taille); doc.setTextColor.apply(doc, couleur || ENCRE); }
    function place(h) { if (y + h > BAS) { doc.addPage(); y = M; return true; } return false; }
    function lignes(texte, larg) { return doc.splitTextToSize(propre(texte), larg); }
    function ecrire(texte, x, larg, interligne) {
      var ls = lignes(texte, larg);
      ls.forEach(function (l) { place(interligne); doc.text(l, x, y + interligne * 0.75); y += interligne; });
    }
    function titreSection(t) {
      place(16); y += 4;
      police(12.5, 'bold', VERT); doc.text(propre(t), M, y + 5);
      doc.setDrawColor.apply(doc, VERT); doc.setLineWidth(0.5); doc.line(M, y + 7.5, L - M, y + 7.5);
      y += 11;
    }
    function nomPartie(role) {
      var c = d.createur, nomCreateur = c === 'vendeur' ? d.vendeur : c === 'acheteur' ? d.acheteur : '';
      var nomAutre = c === 'vendeur' ? d.acheteur : c === 'acheteur' ? d.vendeur : '';
      if (role === 'proprio') return 'Créateur de l\'accord' + (nomCreateur ? ' (' + nomCreateur + ')' : '');
      return 'Autre partie' + (nomAutre ? ' (' + nomAutre + ')' : '');
    }

    // En-tête
    doc.setFillColor.apply(doc, VERT); doc.rect(0, 0, L, 30, 'F');
    police(19, 'bold', [255, 255, 255]); doc.text('AccordAI', M, 13);
    police(10.5, 'normal', [255, 255, 255]); doc.text('Dossier chronologique', M, 20);
    police(9, 'normal', [226, 241, 234]);
    doc.text(propre('Dossier ' + dossier.id), L - M, 12, { align: 'right' });
    doc.text(propre('Édité le ' + AC.dateHeure(maintenant.toISOString())), L - M, 18, { align: 'right' });
    y = 40;

    police(16, 'bold'); ecrire(dossier.titre || 'Accord', M, L - 2 * M, 7);
    var st = AC.STATUTS[dossier.statut] || { label: dossier.statut || '' };
    police(10, 'normal', GRIS);
    var debut = evs[0] ? AC.dateHeure(evs[0].le) : '';
    var fin = evs.length ? AC.dateHeure(evs[evs.length - 1].le) : '';
    ecrire('Statut : ' + st.label + (debut ? '   ·   Créé le ' + debut : '') + (fin && evs.length > 1 ? '   ·   Dernier événement le ' + fin : ''), M, L - 2 * M, 5);
    y += 2;

    // Ce qui a été convenu
    titreSection('Ce qui a été convenu');
    var t = AC.calculer(d);
    var rangs = [];
    AC.CHAMPS.forEach(function (c) {
      var v = d[c.cle];
      if (v == null || v === '') return;
      rangs.push([AC.LIBELLES[c.cle], String(v)]);
      if (c.cle === 'delai' && d.delai_date) rangs.push(['Date limite', AC.dateFr(d.delai_date)]);
    });
    if (d.delai_date && !d.delai) rangs.push(['Date limite', AC.dateFr(d.delai_date)]);
    if (t.totalCalcule != null) rangs.push(['Calcul (quantité × prix unitaire)', AC.milliers(t.quantite) + ' × ' + AC.fcfa(t.prixUnitaire) + ' = ' + AC.fcfa(t.totalCalcule) + (t.ecart ? '  — différent du total écrit' : '')]);
    if (t.reste != null) rangs.push(['Reste à payer (total - acompte)', AC.fcfa(t.reste)]);
    if (!rangs.length) rangs.push(['Détails', '(aucun détail saisi)']);
    var col = 58, larg = L - 2 * M - col - 4;
    rangs.forEach(function (r, i) {
      police(10, 'normal');
      var lv = lignes(r[1], larg), lk = lignes(r[0], col - 2);
      var h = Math.max(lv.length, lk.length) * 5 + 3;
      place(h);
      if (i % 2 === 0) { doc.setFillColor.apply(doc, VERT_PALE); doc.rect(M, y, L - 2 * M, h, 'F'); }
      police(9.5, 'bold', GRIS); lk.forEach(function (l, k) { doc.text(l, M + 2, y + 5 + k * 5); });
      police(10, 'normal', (/différent du total/.test(r[1]) ? ROUGE : ENCRE)); lv.forEach(function (l, k) { doc.text(l, M + col, y + 5 + k * 5); });
      y += h;
    });

    // Historique
    titreSection('Historique (' + evs.length + ' événement' + (evs.length > 1 ? 's' : '') + ')');
    evs.forEach(function (e, i) {
      var det = AC.lignesEvenement(e);
      var photo = e.type === 'preuve' && e.donnees && e.donnees.photo && opts.photos ? opts.photos[e.donnees.photo] : null;
      police(9.5, 'normal');
      var detL = [];
      det.forEach(function (l) { detL = detL.concat(lignes(l, L - 2 * M - 12)); });
      var hPhoto = 0, wPhoto = 0;
      if (photo && photo.data) { wPhoto = 48; hPhoto = Math.min(60, wPhoto * (photo.h || 3) / (photo.w || 4)); wPhoto = hPhoto * (photo.w || 4) / (photo.h || 3); }
      var h = 7 + detL.length * 4.6 + (hPhoto ? hPhoto + 3 : 0) + 9;
      place(Math.min(h, 80));
      var y0 = y;
      // pastille numérotée
      doc.setFillColor.apply(doc, VERT); doc.circle(M + 3.5, y + 3.2, 3.2, 'F');
      police(8, 'bold', [255, 255, 255]); doc.text(String(i + 1), M + 3.5, y + 4.4, { align: 'center' });
      police(10.5, 'bold'); doc.text(propre(AC.EVENEMENTS[e.type] || e.type), M + 10, y + 4.4);
      var wT = doc.getTextWidth(propre(AC.EVENEMENTS[e.type] || e.type));
      police(9, 'normal', GRIS); doc.text(propre(AC.dateHeure(e.le) + '  ·  par ' + nomPartie(e.auteur)), M + 10 + wT + 3, y + 4.4);
      y += 7;
      police(9.5, 'normal');
      detL.forEach(function (l) { place(4.6); doc.text(l, M + 10, y + 3.4); y += 4.6; });
      if (hPhoto) {
        place(hPhoto + 3);
        try { doc.addImage(photo.data, 'JPEG', M + 10, y + 1, wPhoto, hPhoto, undefined, 'FAST'); } catch (err) { /* photo illisible : on garde la référence */ }
        doc.setDrawColor.apply(doc, LIGNE); doc.setLineWidth(0.2); doc.rect(M + 10, y + 1, wPhoto, hPhoto);
        y += hPhoto + 3;
      } else if (e.type === 'preuve' && e.donnees && e.donnees.photo) {
        police(8.5, 'italic', GRIS); place(4.6); doc.text('(photo non disponible hors connexion)', M + 10, y + 3.4); y += 4.6;
      }
      place(8.5);
      doc.setFont('courier', 'normal'); doc.setFontSize(6.8); doc.setTextColor.apply(doc, GRIS);
      doc.text('précédent ' + String(e.precedent || ''), M + 10, y + 3);
      doc.text('empreinte ' + String(e.empreinte || ''), M + 10, y + 6.4);
      y += 9;
      if (y0 < y && i < evs.length - 1) { doc.setDrawColor.apply(doc, LIGNE); doc.setLineWidth(0.2); doc.line(M + 10, y - 1, L - M, y - 1); }
      y += 1.5;
    });

    // Vérification
    titreSection('Vérification de la chaîne d\'empreintes');
    var v = opts.verification;
    police(10, 'bold', v && v.ok ? VERT : ROUGE);
    if (v && v.ok) ecrire('Chaîne vérifiée sur l\'appareil le ' + AC.dateHeure(maintenant.toISOString()) + ' : ' + v.n + ' événement' + (v.n > 1 ? 's' : '') + ', aucun lien rompu.' + (v.recalcul ? ' Chaque empreinte a aussi été recalculée : identique.' : ''), M, L - 2 * M, 5);
    else if (v) ecrire('Attention : la chaîne est rompue à l\'événement n° ' + (v.index + 1) + '. Le dossier a pu être modifié après coup.', M, L - 2 * M, 5);
    else ecrire('Chaîne non vérifiée (calcul indisponible sur cet appareil).', M, L - 2 * M, 5);
    police(9.5, 'normal', ENCRE);
    y += 1;
    ecrire('Comment vérifier : chaque événement contient l\'empreinte SHA-256 de l\'événement précédent (« précédent »). Le premier reprend l\'empreinte SHA-256 du numéro de dossier ' + dossier.id + '. Chaque empreinte est calculée par le serveur sur : précédent | type | auteur | données | date. Changer un événement passé casserait tous les liens qui suivent.', M, L - 2 * M, 4.8);
    if (v && v.origine) {
      place(6); doc.setFont('courier', 'normal'); doc.setFontSize(7); doc.setTextColor.apply(doc, GRIS);
      doc.text('sha256("' + dossier.id + '") = ' + v.origine, M, y + 3.5); y += 6;
    }

    // Mention
    y += 3;
    police(9.5, 'normal');
    var lm = lignes(AC.MENTION + ' AccordAI ne donne aucun conseil juridique.', L - 2 * M - 8);
    var hm = lm.length * 4.8 + 6;
    place(hm);
    doc.setFillColor(253, 246, 227); doc.setDrawColor(242, 183, 5); doc.setLineWidth(0.4); doc.roundedRect(M, y, L - 2 * M, hm, 2, 2, 'FD');
    police(9.5, 'normal', ENCRE); lm.forEach(function (l, k) { doc.text(l, M + 4, y + 5.5 + k * 4.8); });
    y += hm;

    // Pieds de page
    var n = doc.getNumberOfPages();
    for (var p = 1; p <= n; p++) {
      doc.setPage(p);
      police(8, 'normal', GRIS);
      doc.text(propre(dossier.id + '  ·  page ' + p + ' / ' + n), L - M, H - 11, { align: 'right' });
      if (!opts.premium) doc.text(propre('Créé avec AccordAI (version gratuite) · ndoyepapamassamba-commits.github.io/Add-a-README-file/apps/accord/'), M, H - 6.5);
    }
    doc.setProperties({ title: propre('Dossier chronologique ' + dossier.id + ' - ' + (dossier.titre || '')), subject: 'AccordAI', creator: 'AccordAI' });
    return doc.output('blob');
  }

  window.PDFA = { generer: generer, propre: propre };
})();
