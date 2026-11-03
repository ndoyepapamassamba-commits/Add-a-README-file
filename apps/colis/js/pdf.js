/* ColisPreuve — preuve PDF d'un colis (jsPDF, chargé seulement à ce moment-là).
   Contenu : colis, code vérifié, étapes datées avec leurs auteurs, photos, empreintes chaînées, résultat de la vérification
   et la mention sur la valeur de la preuve. Version gratuite : pied de page « version gratuite ». */
(function (racine) {
  'use strict';
  var CP = racine.CP;
  var VERT = [11, 110, 79], ORANGE = [224, 123, 31], ENCRE = [20, 32, 27], GRIS = [92, 107, 99], TRAIT = [214, 222, 217], ROUGE = [178, 34, 34];
  var NOTICE = 'ColisPreuve garde une trace datée et chaînée de chaque étape. Sa valeur en cas de litige dépend des circonstances.';
  var ADRESSE = 'ndoyepapamassamba-commits.github.io/Add-a-README-file/apps/colis/';

  function fuseau() {
    var m = -new Date().getTimezoneOffset();
    if (!m) return 'GMT (heure de Dakar)';
    return 'GMT' + (m > 0 ? '+' : '-') + Math.floor(Math.abs(m) / 60) + (Math.abs(m) % 60 ? ':' + ('0' + Math.abs(m) % 60).slice(-2) : '');
  }

  // o : { colis, evenements, verification, photos: [{ nom, url, l, h, legende, le, auteur, sha256 }], premium, editeLe }
  function creer(o) {
    var jsPDF = racine.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    var W = 210, H = 297, M = 16, L = W - 2 * M, y = 0;
    var c = o.colis, evs = o.evenements || [];
    var T = CP.textePDF;
    doc.setProperties({ title: T('Preuve de livraison ' + (c.ref || c.id)), subject: 'ColisPreuve', creator: 'ColisPreuve' });

    function police(taille, style, couleur) { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(taille); doc.setTextColor.apply(doc, couleur || ENCRE); }
    function bas() { return H - (o.premium ? 14 : 20); }
    function place(h) { if (y + h > bas()) { doc.addPage(); y = M; return true; } return false; }
    function texte(s, x, largeur, taille, style, couleur, interligne) {
      police(taille, style, couleur);
      var lignes = doc.splitTextToSize(T(s), largeur);
      var lh = (interligne || 1.35) * taille * 0.3528;
      lignes.forEach(function (l) { place(lh); doc.text(l, x, y + lh * 0.8); y += lh; });
      return lignes.length;
    }
    function titre(s, apres) {
      place(14 + (apres || 12)); y += 4;
      police(12.5, 'bold', VERT); doc.text(T(s), M, y + 4.5);
      doc.setDrawColor.apply(doc, TRAIT); doc.setLineWidth(0.3); doc.line(M, y + 7, W - M, y + 7);
      y += 10;
    }
    function coche(x, yy, t, couleur) {
      doc.setDrawColor.apply(doc, couleur || VERT); doc.setLineWidth(t * 0.16); doc.setLineCap('round'); doc.setLineJoin('round');
      doc.lines([[t * 0.32, t * 0.32], [t * 0.62, -t * 0.7]], x, yy, [1, 1], 'S', false);
    }

    // ---------- En-tête ----------
    doc.setFillColor.apply(doc, VERT); doc.rect(0, 0, W, 30, 'F');
    doc.setFillColor.apply(doc, ORANGE); doc.rect(0, 30, W, 1.4, 'F');
    police(20, 'bold', [255, 255, 255]); doc.text('ColisPreuve', M, 14);
    police(10.5, 'normal', [225, 242, 235]); doc.text(T('Preuve de livraison — historique daté et chaîné'), M, 21.5);
    police(9, 'normal', [225, 242, 235]);
    doc.text(T('Dossier ' + c.id), W - M, 13, { align: 'right' });
    doc.text(T('Édité le ' + CP.dateHeureFr(o.editeLe || new Date().toISOString())), W - M, 18.5, { align: 'right' });
    doc.text(T('Heures : ' + fuseau()), W - M, 24, { align: 'right' });
    y = 38;

    // ---------- Le colis ----------
    police(16, 'bold'); doc.text(T('Commande ' + (c.ref || '—')), M, y + 5); y += 9;
    var etat = CP.etatColis(evs);
    var lignes = [
      ['Client', c.client || '—'], ['Quartier / zone', c.zone || '—'], ['Articles', c.articles || '—'],
      ['Paiement', CP.PAIEMENTS[c.paiement] || '—'],
      ['Montant à encaisser', CP.aEncaisserColis(c) ? CP.formatF(c.montant) : 'Rien (déjà payé)'],
      ['Statut actuel', CP.ETATS[etat].libelle], ['Créé le', c.creeLe ? CP.dateHeureFr(c.creeLe) : '—']
    ];
    if (c.boutique) lignes.unshift(['Boutique', c.boutique]);
    lignes.forEach(function (l) {
      police(10, 'bold');
      var val = doc.splitTextToSize(T(l[1]), L - 42), h = Math.max(1, val.length) * 4.6 + 1;
      place(h);
      police(9.5, 'normal', GRIS); doc.text(T(l[0]), M, y + 4);
      police(10, 'bold', ENCRE); doc.text(val, M + 42, y + 4);
      y += h;
    });

    // ---------- Code de remise et réception ----------
    y += 3;
    var liv = CP.premier(evs, 'livraison'), rec = CP.premier(evs, 'reception'), pb = CP.dernier(evs, 'probleme');
    place(30);
    var hBoite = 24;
    doc.setFillColor(236, 247, 242); doc.setDrawColor.apply(doc, liv ? VERT : TRAIT); doc.setLineWidth(0.4);
    doc.roundedRect(M, y, L, hBoite, 2.5, 2.5, 'FD');
    if (liv && liv.donnees && liv.donnees.code_verifie) {
      doc.setFillColor.apply(doc, VERT); doc.circle(M + 10, y + hBoite / 2, 6.2, 'F');
      coche(M + 6.6, y + hBoite / 2 + 0.2, 7, [255, 255, 255]);
      police(11.5, 'bold', VERT); doc.text(T('Code de remise du client vérifié'), M + 21, y + 8);
      police(9.5, 'normal');
      doc.text(T('Le livreur a saisi le code que seul le client connaissait, le ' + CP.dateHeureFr(liv.le) + '.'), M + 21, y + 13.5);
      var enc = CP.montantEncaisse(c);
      doc.text(T(rec ? 'Réception confirmée par le client le ' + CP.dateHeureFr(rec.le) + '.' : 'Réception pas encore confirmée par le client.') +
        (enc ? T('  Encaissé : ' + CP.formatF(enc) + '.') : ''), M + 21, y + 19);
    } else {
      police(11.5, 'bold', GRIS); doc.text(T('Livraison pas encore validée par le code du client'), M + 6, y + 9);
      police(9.5, 'normal');
      doc.text(T(rec ? 'Réception confirmée par le client le ' + CP.dateHeureFr(rec.le) + '.' : 'Réception pas encore confirmée par le client.'), M + 6, y + 15.5);
    }
    y += hBoite + 2;
    if (pb && etat === 'probleme') { texte('Problème signalé par le client le ' + CP.dateHeureFr(pb.le) + ' : ' + (CP.detailEvenement(pb) || 'sans précision') + '.', M, L, 9.5, 'bold', ROUGE); }

    // ---------- Étapes ----------
    titre('Étapes (heure du serveur)');
    var cols = [M, M + 33, M + 92, M + 112], largeurs = [31, 57, 18, W - M - (M + 112)];
    police(8.5, 'bold', GRIS);
    place(6); doc.text(T('Date et heure'), cols[0], y + 4); doc.text(T('Étape'), cols[1], y + 4); doc.text(T('Par'), cols[2], y + 4); doc.text(T('Détails'), cols[3], y + 4);
    y += 6;
    evs.forEach(function (e, i) {
      var d = e.donnees || {};
      var det = CP.detailEvenement(e);
      if (e.type === 'livraison' && d.code_verifie) det = 'Code du client vérifié' + (det ? ' · ' + det : '');
      if (e.type === 'preuve' && d.photo) det = (det ? det + ' · ' : '') + d.photo;
      if (d.fait_le) det = (det ? det + ' · ' : '') + 'fait le ' + CP.dateHeureFr(d.fait_le) + ' sans réseau, envoyé plus tard';
      police(8.5, 'normal');
      var a = doc.splitTextToSize(T(CP.libelleEvenement(e)), largeurs[1]);
      var b = doc.splitTextToSize(T(det || '—'), largeurs[3]);
      var h = Math.max(a.length, b.length, 1) * 3.9 + 2.6;
      place(h);
      if (i % 2 === 0) { doc.setFillColor(246, 248, 246); doc.rect(M - 1.5, y, L + 3, h, 'F'); }
      police(8.5, 'normal'); doc.text(T(CP.dateFr(e.le) + ' ' + CP.heureFr(e.le)), cols[0], y + 4.2);
      police(8.5, 'bold'); doc.text(a, cols[1], y + 4.2);
      police(8.5, 'normal'); doc.text(T(CP.ROLES[e.auteur] || e.auteur || ''), cols[2], y + 4.2);
      doc.setTextColor.apply(doc, GRIS); doc.text(b, cols[3], y + 4.2);
      y += h;
    });

    // ---------- Photos ----------
    var photos = o.photos || [];
    if (photos.length) {
      titre('Photos (' + photos.length + ')', 76);
      var lc = (L - 6) / 2, hc = 62;
      for (var i = 0; i < photos.length; i += 2) {
        place(hc + 13);
        for (var k = 0; k < 2 && i + k < photos.length; k++) {
          var p = photos[i + k], x = M + k * (lc + 6);
          doc.setDrawColor.apply(doc, TRAIT); doc.setLineWidth(0.3); doc.rect(x, y, lc, hc);
          if (p.url) {
            var r = Math.min((lc - 2) / p.l, (hc - 2) / p.h), iw = p.l * r, ih = p.h * r;
            try { doc.addImage(p.url, 'JPEG', x + (lc - iw) / 2, y + (hc - ih) / 2, iw, ih, undefined, 'FAST'); } catch (err) { /* photo illisible */ }
          } else { police(8.5, 'normal', GRIS); doc.text(T('Photo indisponible'), x + lc / 2, y + hc / 2, { align: 'center' }); }
          police(8, 'bold'); doc.text(T((p.legende || p.nom) + ' · ' + (CP.ROLES[p.auteur] || '')), x, y + hc + 4, { maxWidth: lc });
          police(7.5, 'normal', GRIS); doc.text(T(p.nom + ' · ' + CP.dateHeureFr(p.le)), x, y + hc + 8, { maxWidth: lc });
          if (p.sha256) { doc.setFont('courier', 'normal'); doc.setFontSize(5.8); doc.text('sha256 ' + p.sha256, x, y + hc + 11.3); }
        }
        y += hc + 14;
      }
    }

    // ---------- Historique chaîné ----------
    titre('Historique chaîné (empreintes SHA-256)', 30);
    texte('Chaque étape porte l\'empreinte de l\'étape précédente. La première porte l\'empreinte du numéro du dossier. Modifier ou retirer une étape casserait la chaîne.', M, L, 8.5, 'normal', GRIS);
    y += 1.5;
    evs.forEach(function (e, i) {
      place(13.5);
      police(8, 'bold'); doc.text(T((i + 1) + '. ' + CP.libelleEvenement(e) + ' — ' + CP.dateHeureFr(e.le) + ' — ' + (CP.ROLES[e.auteur] || e.auteur)), M, y + 3.5);
      doc.setFont('courier', 'normal'); doc.setFontSize(6.6); doc.setTextColor.apply(doc, GRIS);
      doc.text('precedent : ' + String(e.precedent || ''), M + 3, y + 7.3);
      doc.setTextColor.apply(doc, ENCRE);
      doc.text('empreinte : ' + String(e.empreinte || ''), M + 3, y + 10.6);
      y += 13;
    });
    var v = o.verification;
    if (v) {
      y += 2; place(16);
      var bon = v.ok;
      doc.setFillColor.apply(doc, bon ? [236, 247, 242] : [252, 236, 236]); doc.setDrawColor.apply(doc, bon ? VERT : ROUGE);
      doc.roundedRect(M, y, L, 14, 2, 2, 'FD');
      if (bon) coche(M + 4, y + 7.4, 6);
      police(9.5, 'bold', bon ? VERT : ROUGE);
      doc.text(T(bon ? 'Historique vérifié sur le téléphone : intact' : 'Attention : l\'historique ne se vérifie pas entièrement'), M + 13, y + 5.6);
      police(8, 'normal');
      doc.text(T(v.liens + ' lien(s) sur ' + v.total + ' corrects ; ' + v.contenus + ' empreinte(s) sur ' + v.contenusTotal + ' recalculée(s) à l\'identique. Vérifié le ' + CP.dateHeureFr(o.editeLe || new Date().toISOString()) + '.'), M + 13, y + 10.6);
      y += 17;
    }

    // ---------- Mention ----------
    y += 2;
    texte(NOTICE, M, L, 9, 'italic', ENCRE);
    texte('Les heures sont celles du serveur au moment où chaque étape a été reçue. ColisPreuve ne garde ni adresse exacte ni numéro de téléphone. Les données sont effacées 180 jours après la dernière activité.', M, L, 8, 'normal', GRIS);

    // ---------- Pieds de page ----------
    var n = doc.getNumberOfPages();
    for (var pg = 1; pg <= n; pg++) {
      doc.setPage(pg);
      police(7.5, 'normal', GRIS);
      doc.text(T('Page ' + pg + ' / ' + n + ' · Dossier ' + c.id), W - M, H - 7, { align: 'right' });
      if (!o.premium) {
        doc.setFillColor(255, 244, 232); doc.rect(0, H - 15, W, 5.5, 'F');
        police(7.5, 'bold', [150, 80, 10]);
        doc.text(T('Créé avec la version gratuite de ColisPreuve — ' + ADRESSE), W / 2, H - 11.2, { align: 'center' });
      }
    }
    var nom = 'preuve-colis-' + String(c.ref || c.id).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) + '.pdf';
    return { blob: doc.output('blob'), nom: nom, pages: n };
  }
  racine.CPPdf = { creer: creer, NOTICE: NOTICE };
})(typeof self !== 'undefined' ? self : this);
