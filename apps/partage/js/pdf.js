/* Teranga Partage Frais — résumé PDF d'un groupe (A4). jsPDF est chargé à la demande, depuis le téléphone. */
(function () {
  'use strict';
  var PF = window.PF;
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
  var T = function (s) { return PF.textePDF(s); };
  var M = function (n) { return PF.formatNombre(n, ' ') + ' F'; };
  var BRAND = [15, 102, 116], VERT = [19, 121, 91], ORANGE = [194, 65, 12], GRIS = [95, 112, 116], ENCRE = [19, 33, 36];

  function resume(groupe, operations, journal) {
    return bibliotheque().then(function () {
      var J = window.jspdf.jsPDF, doc = new J({ unit: 'mm', format: 'a4', compress: true });
      var W = 210, H = 297, X = 14, L = W - 2 * X, y = 0;
      var ordre = groupe.membres.map(function (m) { return m.id; }), nom = function (id) { return PF.nomMembre(groupe, id); };
      var b = PF.bilan(groupe, operations), s = PF.soldes(groupe, operations), regl = PF.reglements(s, ordre);
      var deps = operations.filter(function (o) { return o.type !== 'remboursement'; }).sort(function (a, c) { return a.date.localeCompare(c.date) || (a.cree || '').localeCompare(c.cree || ''); });
      var rembs = operations.filter(function (o) { return o.type === 'remboursement'; }).sort(function (a, c) { return a.date.localeCompare(c.date); });
      doc.setProperties({ title: T('Partage des frais : ' + groupe.nom), creator: 'Teranga Partage Frais' });

      function couleur(c) { doc.setTextColor(c[0], c[1], c[2]); }
      function saut(h) { if (y + h > H - 18) { doc.addPage(); y = 18; return true; } return false; }
      function titre(t) {
        saut(16); y += 4;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); couleur(BRAND); doc.text(T(t), X, y);
        doc.setDrawColor(BRAND[0], BRAND[1], BRAND[2]); doc.setLineWidth(0.5); doc.line(X, y + 2, X + L, y + 2);
        y += 8;
      }
      // tableau simple : colonnes [{ t, w, a }] ; lignes de textes ; couleurs par cellule facultatives
      function tableau(cols, lignes, opt) {
        opt = opt || {};
        var entete = function () {
          doc.setFillColor(233, 240, 241); doc.rect(X, y - 4.5, L, 7, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); couleur(GRIS);
          var x = X; cols.forEach(function (c) { doc.text(T(c.t), c.a === 'r' ? x + c.w - 2 : x + 2, y, { align: c.a === 'r' ? 'right' : 'left' }); x += c.w; });
          y += 6;
        };
        entete();
        lignes.forEach(function (lg, k) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
          var hauteurs = lg.cells.map(function (v, i) { return doc.splitTextToSize(T(v), cols[i].w - 4).length; });
          var h = Math.max.apply(null, hauteurs) * 4.4 + 2.4;
          if (saut(h + 2)) entete();
          if (k % 2) { doc.setFillColor(247, 250, 250); doc.rect(X, y - 4.2, L, h, 'F'); }
          var x = X;
          lg.cells.forEach(function (v, i) {
            var c = cols[i];
            doc.setFont('helvetica', (lg.gras && lg.gras[i]) ? 'bold' : 'normal');
            couleur((lg.couleurs && lg.couleurs[i]) || ENCRE);
            doc.text(doc.splitTextToSize(T(v), c.w - 4), c.a === 'r' ? x + c.w - 2 : x + 2, y, { align: c.a === 'r' ? 'right' : 'left' });
            x += c.w;
          });
          y += h;
        });
        y += 2;
      }

      // En-tête
      doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]); doc.rect(0, 0, W, 38, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
      doc.text(T(doc.splitTextToSize(groupe.nom, L)[0]), X, 16);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
      var dates = deps.length ? (deps[0].date === deps[deps.length - 1].date ? 'le ' + PF.dateFr(deps[0].date) : 'du ' + PF.dateFr(deps[0].date) + ' au ' + PF.dateFr(deps[deps.length - 1].date)) : 'aucune dépense';
      doc.text(T(PF.type(groupe.type).nom + ' · ' + groupe.membres.length + ' membres · dépenses ' + dates), X, 24);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text(T('Total des dépenses : ' + M(b.total) + ' CFA (' + b.nbDepenses + ' dépense' + (b.nbDepenses > 1 ? 's' : '') + ')'), X, 32);
      y = 48;

      titre('Pour tout régler');
      doc.setFontSize(11);
      if (regl.length) {
        regl.forEach(function (t, i) {
          saut(7);
          doc.setFont('helvetica', 'bold'); couleur(ENCRE);
          doc.text(T((i + 1) + '. ' + nom(t.de) + ' donne ' + M(t.montant) + ' à ' + nom(t.a)), X + 2, y);
          y += 6.5;
        });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); couleur(GRIS);
        doc.text(T(regl.length + ' remboursement' + (regl.length > 1 ? 's' : '') + ' au plus petit nombre possible. Chacun rembourse directement ; l\'application ne touche pas à l\'argent.'), X + 2, y); y += 4;
      } else { doc.setFont('helvetica', 'bold'); couleur(VERT); doc.text(T('Tout est réglé : personne ne doit rien.'), X + 2, y); y += 5; }

      titre('Soldes');
      tableau([{ t: 'Membre', w: 46 }, { t: 'A payé', w: 28, a: 'r' }, { t: 'Sa part', w: 28, a: 'r' }, { t: 'Remb. donnés', w: 28, a: 'r' }, { t: 'Remb. reçus', w: 26, a: 'r' }, { t: 'Solde', w: 26, a: 'r' }],
        groupe.membres.map(function (m) {
          var x = b.membres[m.id], c = x.solde > 0 ? VERT : x.solde < 0 ? ORANGE : ENCRE;
          return { cells: [m.nom, M(x.paye), M(x.part), M(x.envoye), M(x.recu), (x.solde > 0 ? '+' : '') + M(x.solde)], couleurs: [null, null, null, null, null, c], gras: [true, false, false, false, false, true] };
        }));
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); couleur(GRIS);
      saut(6); doc.text(T('Solde positif : la personne doit recevoir. Solde négatif : elle doit donner.'), X, y); y += 4;

      titre('Dépenses');
      if (deps.length) tableau([{ t: 'Date', w: 22 }, { t: 'Quoi', w: 50 }, { t: 'Payé par', w: 32 }, { t: 'Pour qui', w: 50 }, { t: 'Montant', w: 28, a: 'r' }],
        deps.map(function (o) {
          var parts = PF.partsDepense(o, ordre), ids = Object.keys(parts);
          var pour = ids.length === groupe.membres.length && o.repartition.mode === 'egal' ? 'Tout le monde, parts égales' :
            ids.map(function (id) { return nom(id) + ' ' + PF.formatNombre(parts[id], ' '); }).join(', ');
          return { cells: [PF.dateFr(o.date), o.titre + (o.note ? ' (' + o.note + ')' : ''), nom(o.payeur), pour, M(o.montant)], gras: [false, true, false, false, true] };
        }));
      else { doc.setFontSize(10); couleur(GRIS); doc.text(T('Aucune dépense.'), X, y); y += 6; }

      if (rembs.length) {
        titre('Remboursements déjà faits');
        tableau([{ t: 'Date', w: 22 }, { t: 'Qui a donné', w: 58 }, { t: 'À qui', w: 58 }, { t: 'Montant', w: 44, a: 'r' }],
          rembs.map(function (o) { return { cells: [PF.dateFr(o.date), nom(o.de), nom(o.a), M(o.montant)], couleurs: [null, null, null, VERT], gras: [false, false, false, true] }; }));
      }
      if (journal && journal.length) {
        titre('Historique des changements');
        tableau([{ t: 'Quand', w: 34 }, { t: 'Changement', w: 148 }], journal.slice().sort(function (a, c) { return a.le.localeCompare(c.le); }).map(function (j) {
          var d = new Date(j.le);
          return { cells: [PF.dateFr(PF.dateISO(d)) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2), j.texte] };
        }));
      }
      var n = doc.getNumberOfPages();
      for (var p = 1; p <= n; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); couleur(GRIS);
        doc.text(T('Résumé fait le ' + PF.dateFr(PF.dateISO()) + ' avec Teranga Partage Frais. Montants en F CFA.'), X, H - 8);
        doc.text(T('Page ' + p + ' / ' + n), W - X, H - 8, { align: 'right' });
      }
      var fichier = 'partage-' + (PF.sansAccents(groupe.nom).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'groupe') + '-' + PF.dateISO() + '.pdf';
      return { blob: doc.output('blob'), nom: fichier };
    });
  }
  window.PFPDF = { resume: resume, bibliotheque: bibliotheque };
})();
