/* Tontine Claire — résumé PDF (A4) : paramètres, calendrier des tours, grille des cotisations, retards, règles,
   historique avec la vérification de la chaîne d'empreintes. jsPDF (MIT) est chargé seulement au moment du PDF. */
(function (racine) {
  'use strict';
  var TC = racine.TC;
  var chargement = null;
  function charger() {
    if (racine.jspdf) return Promise.resolve();
    if (chargement) return chargement;
    chargement = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = 'vendor/jspdf.umd.min.js';
      s.onload = function () { ok(); };
      s.onerror = function () { chargement = null; ko(new Error('Bibliothèque PDF introuvable. Ouvrez l\'application une fois avec Internet.')); };
      document.head.appendChild(s);
    });
    return chargement;
  }
  var VERT = [11, 110, 79], OR = [184, 134, 11], ENCRE = [23, 32, 27], GRIS = [96, 108, 101], LIGNE = [214, 222, 217];
  var FONDS = { confirme: [214, 239, 226], declare: [252, 239, 196], retard: [250, 218, 214], partiel: [253, 228, 200], attendu: [255, 255, 255], avenir: [246, 247, 246] };
  var COURT = { confirme: 'OK', declare: 'Décl.', retard: 'Retard', partiel: 'Part.', attendu: 'à verser', avenir: '' };

  function texteEvenement(t, e, annule) {
    var d = e.donnees || {}, nom = d.nom || (d.membre ? TC.nomMembre(t, d.membre) : '');
    var s;
    switch (e.type) {
      case 'creation': s = 'Création de la tontine'; break;
      case 'versement_declare': s = d.annule ? 'Déclaration retirée' : nom + ' déclare ' + TC.formatF(d.montant) + ' (tour ' + d.periode + (d.mode ? ', ' + d.mode : '') + ')'; break;
      case 'versement_recu':
        if (d.annule) s = 'Annulation d\'une action (' + (nom || '') + ')';
        else if (d.objet === 'amende') s = 'Amende réglée : ' + nom + ', ' + TC.formatF(d.montant);
        else if (d.lot) s = 'Confirmés (tour ' + d.periode + ') : ' + d.lot.split('|').map(function (x) { var q = x.split(':'); return TC.nomMembre(t, +q[0]); }).join(', ') + ' — ' + TC.formatF(d.montant);
        else s = 'Confirmé : ' + nom + ', ' + TC.formatF(d.montant) + ' (tour ' + d.periode + ')';
        break;
      case 'tour': s = d.annule ? 'Remise de main annulée' : 'Main remise à ' + (d.nom || TC.nomMembre(t, d.beneficiaire)) + ' : ' + TC.formatF(d.montant) + ' (tour ' + d.periode + ')'; break;
      case 'rappel': s = d.groupe ? 'Message au groupe (tour ' + d.periode + ')' : 'Rappel à ' + nom + (d.periodes && String(d.periodes).indexOf(',') > 0 ? ' (tours ' + String(d.periodes).split(',').join(', ') + ')' : ' (tour ' + d.periode + ')'); break;
      case 'note': s = 'Note' + (d.nom ? ' de ' + d.nom : '') + ' : ' + (d.texte || ''); break;
      case 'modification': s = 'Modification : ' + (d.resume || d.objet || ''); break;
      case 'cloture': s = 'Tontine clôturée' + (d.texte ? ' : ' + d.texte : ''); break;
      default: s = e.type;
    }
    return (annule ? '[annulé] ' : '') + s;
  }

  function generer(t, r, chaine, evs, opts) {
    opts = opts || {};
    return charger().then(function () {
      var doc = new racine.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
      var L = 210, H = 297, M = 14, y = 0, P = TC.textePDF;
      doc.setProperties({ title: P('Tontine ' + t.titre + ' - résumé'), subject: 'Résumé de tontine', creator: 'Tontine Claire' });
      function couleur(c) { doc.setTextColor(c[0], c[1], c[2]); }
      function police(taille, gras) { doc.setFont('helvetica', gras ? 'bold' : 'normal'); doc.setFontSize(taille); }
      function place(h) { if (y + h > H - 18) { doc.addPage(); y = M + 2; } }
      function titre(s) {
        place(14); y += 4;
        police(12.5, true); couleur(VERT); doc.text(P(s), M, y); y += 1.8;
        doc.setDrawColor(OR[0], OR[1], OR[2]); doc.setLineWidth(0.6); doc.line(M, y, M + 18, y); y += 5;
        couleur(ENCRE);
      }
      function paragraphe(s, taille, c) {
        police(taille || 10, false); couleur(c || ENCRE);
        var lignes = doc.splitTextToSize(P(s), L - 2 * M);
        lignes.forEach(function (l) { place(5); doc.text(l, M, y); y += (taille || 10) * 0.45; });
        y += 1.2;
      }
      // Tableau simple avec saut de page et ligne d'en-tête répétée
      function tableau(cols, lignes, fonds) {
        var hEnt = 7, x0 = M;
        function entete() {
          doc.setFillColor(VERT[0], VERT[1], VERT[2]); doc.rect(x0, y, cols.reduce(function (s, c) { return s + c.l; }, 0), hEnt, 'F');
          police(8.5, true); doc.setTextColor(255, 255, 255);
          var x = x0;
          cols.forEach(function (c) { doc.text(P(c.t), c.a === 'r' ? x + c.l - 1.6 : c.a === 'c' ? x + c.l / 2 : x + 1.6, y + 4.7, { align: c.a === 'r' ? 'right' : c.a === 'c' ? 'center' : 'left' }); x += c.l; });
          y += hEnt;
        }
        place(hEnt + 7); entete();
        lignes.forEach(function (lg, i) {
          police(8.5, false);
          var hauteurs = lg.map(function (v, j) { return doc.splitTextToSize(P(v), cols[j].l - 3.2).length; });
          var h = Math.max(6.2, Math.max.apply(null, hauteurs) * 3.7 + 2.6);
          if (y + h > H - 18) { doc.addPage(); y = M + 2; entete(); police(8.5, false); }
          var x = x0;
          lg.forEach(function (v, j) {
            var f = fonds && fonds[i] && fonds[i][j];
            if (f) { doc.setFillColor(f[0], f[1], f[2]); doc.rect(x, y, cols[j].l, h, 'F'); }
            else if (i % 2) { doc.setFillColor(247, 249, 248); doc.rect(x, y, cols[j].l, h, 'F'); }
            couleur(ENCRE);
            var tl = doc.splitTextToSize(P(v), cols[j].l - 3.2);
            doc.text(tl, cols[j].a === 'r' ? x + cols[j].l - 1.6 : cols[j].a === 'c' ? x + cols[j].l / 2 : x + 1.6, y + 4.3, { align: cols[j].a === 'r' ? 'right' : cols[j].a === 'c' ? 'center' : 'left' });
            x += cols[j].l;
          });
          doc.setDrawColor(LIGNE[0], LIGNE[1], LIGNE[2]); doc.setLineWidth(0.2); doc.line(x0, y + h, x, y + h);
          y += h;
        });
        y += 6;
      }

      // En-tête
      doc.setFillColor(VERT[0], VERT[1], VERT[2]); doc.rect(0, 0, L, 34, 'F');
      doc.setFillColor(OR[0], OR[1], OR[2]); doc.rect(0, 34, L, 1.4, 'F');
      police(9.5, true); doc.setTextColor(242, 210, 120); doc.text('TONTINE CLAIRE', M, 11);
      police(18, true); doc.setTextColor(255, 255, 255);
      doc.text(doc.splitTextToSize(P(t.titre), L - 2 * M - 40)[0], M, 21);
      police(9, false); doc.text(P('Résumé du ' + TC.dateMoyenne(r.aujourdhui) + (t.statut === 'clos' ? ' - tontine clôturée' : '')), M, 28.5);
      police(8.5, false); doc.text(P('Réf. ' + t.id), L - M, 11, { align: 'right' });
      y = 44;

      var ordre = t.ordreMode === 'tirage' ? 'tirage au sort (graine « ' + t.graine + ' », ' + (TC.verifierTirage(t) ? 'vérifié' : 'à vérifier') + ')'
        : t.ordreMode === 'date' ? 'selon les dates souhaitées par les membres' : 'choisi par l\'organisation';
      paragraphe('Cotisation : ' + TC.formatF(t.montant) + ' par main, ' + TC.libelleFrequence(t.frequence, t.intervalle) + '. Membres : ' + t.membres.length +
        (t.totalMains !== t.membres.length ? ' (' + t.totalMains + ' mains)' : '') + '. Cagnotte par tour : ' + TC.formatF(t.pot) + '. Premier tour : ' + TC.dateLongue(t.debut) +
        '. Ordre des tours : ' + ordre + '.' + (t.organisateur ? ' Organisation : ' + t.organisateur + '.' : ''), 10);

      // Chiffres clés
      place(20);
      var cles = [['Total confirmé', TC.formatF(r.totalConfirme)], ['Mains remises', r.toursRemis + ' sur ' + t.nbTours], ['Retards en cours', String(r.retards.length)],
        ['Amendes (règlement)', t.amende ? TC.formatF(r.amendesTotal - r.amendesPayees) + ' à régler' : 'aucune']];
      var lb = (L - 2 * M - 9) / 4;
      cles.forEach(function (c, i) {
        var x = M + i * (lb + 3);
        doc.setFillColor(238, 245, 241); doc.roundedRect(x, y, lb, 16, 2, 2, 'F');
        police(7.8, false); couleur(GRIS); doc.text(P(c[0]), x + 3, y + 5.5);
        police(11, true); couleur(ENCRE); doc.text(P(c[1]), x + 3, y + 12);
      });
      y += 21;

      titre('Calendrier des tours');
      tableau([{ t: 'Tour', l: 13, a: 'c' }, { t: 'Date', l: 44 }, { t: 'Bénéficiaire', l: 42 }, { t: 'Confirmé / attendu', l: 43, a: 'r' }, { t: 'Main remise', l: 40 }],
        r.tours.map(function (tr) {
          return [String(tr.n), TC.dateLongue(tr.date), TC.nomMembre(t, tr.beneficiaire) + (tr.remis && tr.remis.membre !== tr.prevu ? ' (prévu : ' + TC.nomMembre(t, tr.prevu) + ')' : ''),
            TC.formatNombre(tr.confirme) + ' / ' + TC.formatF(tr.attendu), tr.remis ? TC.formatF(tr.remis.montant) + ' le ' + TC.dateCourte(tr.remis.date) : (tr.etat === 'courant' ? 'tour actuel' : '-')];
        }));

      titre('Cotisations par membre');
      paragraphe('OK = confirmé par l\'organisation · Décl. = déclaré par le membre, à confirmer · Retard = date dépassée · Part. = incomplet.', 8.5, GRIS);
      var parBloc = 9;
      for (var b = 0; b < t.nbTours; b += parBloc) {
        var nb = Math.min(parBloc, t.nbTours - b), lc = (L - 2 * M - 38) / nb;
        var cols = [{ t: 'Membre', l: 38 }];
        for (var k = 0; k < nb; k++) cols.push({ t: 'T' + (b + k + 1) + ' ' + TC.dateCourte(t.dates[b + k]), l: lc, a: 'c' });
        var fonds = [];
        var lignes = t.membres.map(function (m) {
          var f = [null];
          var l = [m.nom + (m.mains > 1 ? ' (x' + m.mains + ')' : '')];
          for (var k2 = 0; k2 < nb; k2++) { var c = r.cellules[m.id][b + k2 + 1]; l.push(COURT[c.statut] || ''); f.push(FONDS[c.statut]); }
          fonds.push(f);
          return l;
        });
        tableau(cols, lignes, fonds);
      }

      titre('Retards et amendes');
      if (!r.retards.length) paragraphe('Aucun retard en cours.');
      else tableau([{ t: 'Membre', l: 50 }, { t: 'Tour', l: 46 }, { t: 'Retard', l: 26, a: 'r' }, { t: 'Manque', l: 30, a: 'r' }, { t: 'Amende', l: 30, a: 'r' }],
        r.retards.map(function (x) { return [x.nom, x.periode + ' - ' + TC.dateCourte(x.date), x.jours + ' j', TC.formatF(x.manque), x.amende ? TC.formatF(x.amende) : '-']; }));
      if (t.amende) paragraphe('Règle : ' + (t.amendeMode === 'jour' ? TC.formatF(t.amende) + ' par jour de retard' + (t.amendePlafond ? ' (au plus ' + TC.formatF(t.amendePlafond) + ' par tour)' : '') : TC.formatF(t.amende) + ' par tour en retard') +
        (t.grace ? ', après ' + t.grace + ' jour(s) de délai' : '') + '. Total des amendes : ' + TC.formatF(r.amendesTotal) + ', déjà réglé : ' + TC.formatF(r.amendesPayees) + '.', 9);

      titre('Règles du groupe');
      [['Retards', t.regle_retard], ['Départ d\'un membre', t.regle_depart], ['Autres règles', t.regle_autres]].forEach(function (x) {
        if (!x[1]) return;
        place(8); police(9.5, true); couleur(ENCRE); doc.text(P(x[0]), M, y); y += 4.6;
        paragraphe(x[1], 9.5);
      });

      titre('Historique (' + evs.length + ' actions)');
      paragraphe(chaine.ok ? 'Chaîne d\'empreintes vérifiée sur le téléphone : intacte. Chaque action contient l\'empreinte SHA-256 de la précédente (la première part de l\'identifiant ' + t.id + '). Dernière empreinte : ' + chaine.derniere + '.'
        : 'ATTENTION : la chaîne d\'empreintes est rompue à l\'action n° ' + (chaine.rupture + 1) + '. L\'historique a pu être modifié.', 8.5, chaine.ok ? GRIS : [179, 38, 30]);
      tableau([{ t: 'N°', l: 10, a: 'c' }, { t: 'Date', l: 42 }, { t: 'Par', l: 23 }, { t: 'Action', l: 89 }, { t: 'Empreinte', l: 18 }],
        evs.map(function (e, i) {
          return [String(i + 1), TC.dateHeure(e.le), e.auteur === 'proprio' ? 'Organisation' : 'Membre', texteEvenement(t, e, r.annules[e.id]), String(e.empreinte || '').slice(0, 8)];
        }));

      // Pied de page
      var n = doc.getNumberOfPages();
      for (var p = 1; p <= n; p++) {
        doc.setPage(p);
        doc.setDrawColor(LIGNE[0], LIGNE[1], LIGNE[2]); doc.setLineWidth(0.2); doc.line(M, H - 13, L - M, H - 13);
        police(7.6, false); couleur(GRIS);
        doc.text(P('Tontine Claire n\'encaisse jamais d\'argent : les versements se font entre les membres, l\'application garde la trace.'), M, H - 8.5);
        doc.text(P('Page ' + p + ' / ' + n), L - M, H - 8.5, { align: 'right' });
      }
      return doc.output('blob');
    });
  }
  racine.TCPDF = { generer: generer, texteEvenement: texteEvenement, charger: charger };
})(typeof self !== 'undefined' ? self : this);
