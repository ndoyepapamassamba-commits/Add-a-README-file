/* Budget Famille — PDF (jsPDF embarqué, chargé seulement quand on fabrique un PDF). Fonctionne hors ligne. */
(function () {
  'use strict';
  var chargement = null;
  function charger() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (chargement) return chargement;
    chargement = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = 'vendor/jspdf.umd.min.js';
      s.onload = function () { ok(); };
      s.onerror = function () { chargement = null; s.remove(); ko(new Error('Fichier PDF manquant. Ouvrez l\'application une fois avec Internet.')); };
      document.head.appendChild(s);
    });
    return chargement;
  }
  var T = function (s) { return BF.textePDF(s); };
  var C = { brand: [15, 102, 112], brandFonce: [11, 79, 87], texte: [20, 32, 30], gris: [90, 104, 100], ligne: [214, 223, 221], fond: [237, 242, 241],
    alerte: [162, 74, 0], danger: [179, 38, 30], ok: [27, 122, 70], or: [242, 183, 5], blanc: [255, 255, 255] };
  function F(n) { return BF.formatNombre(n, ' ') + ' F'; }
  var MARGE = 14, LARGEUR = 182, BAS = 282;

  function nouveauDoc(titre, sousTitre, foyer) {
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({ title: T(titre + ' - ' + sousTitre), creator: 'Budget Famille (TERANGA)', subject: T(sousTitre) });
    doc.setFillColor.apply(doc, C.brand); doc.rect(0, 0, 210, 30, 'F');
    doc.setFillColor.apply(doc, C.or); doc.rect(0, 30, 210, 1.6, 'F');
    doc.setTextColor.apply(doc, C.blanc);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.text(T(titre), MARGE, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11.5); doc.text(T(sousTitre), MARGE, 23);
    if (foyer) { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(T(foyer), 210 - MARGE, 14, { align: 'right' }); }
    doc.setTextColor.apply(doc, C.texte);
    return { doc: doc, y: 42 };
  }
  function pied(doc, aujourdhui) {
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor.apply(doc, C.ligne); doc.setLineWidth(0.3); doc.line(MARGE, 287, 210 - MARGE, 287);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, C.gris);
      doc.text(T('Budget Famille (TERANGA) - établi le ' + BF.dateFr(aujourdhui) + ' à partir des notes du foyer'), MARGE, 292);
      doc.text('Page ' + i + ' / ' + n, 210 - MARGE, 292, { align: 'right' });
    }
  }
  function saut(o, h) { if (o.y + h > BAS) { o.doc.addPage(); o.y = 18; return true; } return false; }
  function titre(o, t) {
    saut(o, 16);
    o.doc.setFont('helvetica', 'bold'); o.doc.setFontSize(13); o.doc.setTextColor.apply(o.doc, C.brandFonce);
    o.doc.text(T(t), MARGE, o.y); o.y += 2.5;
    o.doc.setDrawColor.apply(o.doc, C.brand); o.doc.setLineWidth(0.6); o.doc.line(MARGE, o.y, MARGE + 22, o.y);
    o.doc.setTextColor.apply(o.doc, C.texte); o.y += 6;
  }
  function texte(o, t, opts) {
    opts = opts || {};
    o.doc.setFont('helvetica', opts.gras ? 'bold' : 'normal'); o.doc.setFontSize(opts.taille || 10.5);
    o.doc.setTextColor.apply(o.doc, opts.couleur || C.texte);
    var lignes = o.doc.splitTextToSize(T(t), LARGEUR);
    lignes.forEach(function (l) { saut(o, 6); o.doc.text(l, MARGE, o.y); o.y += (opts.taille || 10.5) * 0.48; });
    o.doc.setTextColor.apply(o.doc, C.texte);
    o.y += 1.5;
  }
  // Cases de chiffres : [[libellé, valeur, couleur?]]
  function cases(o, items) {
    saut(o, 24);
    var n = items.length, ecart = 4, l = (LARGEUR - ecart * (n - 1)) / n;
    items.forEach(function (it, i) {
      var x = MARGE + i * (l + ecart);
      o.doc.setFillColor.apply(o.doc, C.fond); o.doc.roundedRect(x, o.y, l, 19, 2.5, 2.5, 'F');
      o.doc.setFont('helvetica', 'normal'); o.doc.setFontSize(8.5); o.doc.setTextColor.apply(o.doc, C.gris); o.doc.text(T(it[0]), x + 3.5, o.y + 6.5);
      o.doc.setFont('helvetica', 'bold'); o.doc.setFontSize(13); o.doc.setTextColor.apply(o.doc, it[2] || C.texte); o.doc.text(T(it[1]), x + 3.5, o.y + 14.5);
    });
    o.doc.setTextColor.apply(o.doc, C.texte);
    o.y += 25;
  }
  // Tableau simple : colonnes [{t, l, a}], lignes [[cellules]] ; une cellule peut être {t, gras, couleur}
  function tableau(o, colonnes, lignes, opts) {
    opts = opts || {};
    var doc = o.doc;
    function entete() {
      doc.setFillColor.apply(doc, C.brand); doc.rect(MARGE, o.y, LARGEUR, 8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, C.blanc);
      var x = MARGE;
      colonnes.forEach(function (c) { doc.text(T(c.t), c.a === 'right' ? x + c.l - 2.5 : x + 2.5, o.y + 5.5, { align: c.a === 'right' ? 'right' : 'left' }); x += c.l; });
      doc.setTextColor.apply(doc, C.texte); o.y += 8;
    }
    saut(o, 18); entete();
    lignes.forEach(function (ligne, idx) {
      var cellules = ligne.map(function (c) { return typeof c === 'object' && c !== null ? c : { t: c }; });
      doc.setFontSize(9.5);
      var hauteurs = cellules.map(function (c, i) { doc.setFont('helvetica', c.gras ? 'bold' : 'normal'); return doc.splitTextToSize(T(c.t), colonnes[i].l - 5).length; });
      var h = Math.max.apply(null, hauteurs) * 4.4 + 3.4;
      if (saut(o, h)) entete();
      if (ligne.total) { doc.setFillColor.apply(doc, C.fond); doc.rect(MARGE, o.y, LARGEUR, h, 'F'); }
      else if (idx % 2 === 1) { doc.setFillColor(248, 250, 249); doc.rect(MARGE, o.y, LARGEUR, h, 'F'); }
      var x = MARGE;
      cellules.forEach(function (c, i) {
        var col = colonnes[i];
        doc.setFont('helvetica', c.gras || ligne.total ? 'bold' : 'normal');
        doc.setTextColor.apply(doc, c.couleur || C.texte);
        var l = doc.splitTextToSize(T(c.t), col.l - 5);
        doc.text(l, col.a === 'right' ? x + col.l - 2.5 : x + 2.5, o.y + 5, { align: col.a === 'right' ? 'right' : 'left', lineHeightFactor: 1.3 });
        x += col.l;
      });
      doc.setTextColor.apply(doc, C.texte);
      doc.setDrawColor.apply(doc, C.ligne); doc.setLineWidth(0.2); doc.line(MARGE, o.y + h, MARGE + LARGEUR, o.y + h);
      o.y += h;
    });
    o.y += opts.apres == null ? 7 : opts.apres;
  }
  function couleurNiveau(n) { return n === 'depasse' || n === 'hors' ? C.danger : n === 'alerte' || n === 'epuise' ? C.alerte : C.texte; }

  // ---------- Rapport du mois ----------
  function rapportMois(d) {
    return charger().then(function () {
      var s = d.s, o = nouveauDoc('Budget Famille', 'Rapport de ' + BF.moisFr(d.mois), d.foyer);
      cases(o, [['Revenus', F(s.revenus)], ['Dépensé', F(s.depense)], ['Solde', F(s.solde), s.solde < 0 ? C.danger : C.ok], ['Mis de côté', F(s.epargne)]]);
      if (s.prevu > 0) texte(o, 'Prévu dans les enveloppes : ' + F(s.prevu) + ' (' + s.pct + ' % utilisé). ' + (s.aRepartir > 0 ? 'Non réparti : ' + F(s.aRepartir) + '.' : s.aRepartir < 0 ? 'Les enveloppes dépassaient les revenus de ' + F(-s.aRepartir) + '.' : ''), { couleur: C.gris, taille: 10 });
      titre(o, 'Enveloppes : prévu et dépensé');
      var envs = s.enveloppes.filter(function (e) { return e.prevu > 0 || e.depense > 0; });
      var lignes = envs.map(function (e) {
        return [e.nom, F(e.prevu), F(e.depense), { t: e.prevu > 0 ? (e.reste < 0 ? '- ' + F(-e.reste) : F(e.reste)) : 'hors budget', couleur: couleurNiveau(e.niveau), gras: e.niveau !== 'ok' && e.niveau !== 'vide' },
          { t: e.prevu > 0 ? e.pct + ' %' : '-', couleur: couleurNiveau(e.niveau) }];
      });
      var tot = ['Total', F(s.prevu), F(s.depense), F(s.prevu - s.depense), s.prevu > 0 ? s.pct + ' %' : '-']; tot.total = true;
      lignes.push(tot);
      tableau(o, [{ t: 'Enveloppe', l: 70 }, { t: 'Prévu', l: 30, a: 'right' }, { t: 'Dépensé', l: 30, a: 'right' }, { t: 'Reste', l: 30, a: 'right' }, { t: 'Utilisé', l: 22, a: 'right' }], lignes);
      if (s.alertes.length) {
        titre(o, 'À surveiller');
        s.alertes.forEach(function (e) {
          var t = e.niveau === 'depasse' ? 'dépassé de ' + F(-e.reste) : e.niveau === 'hors' ? F(e.depense) + ' hors budget' : e.niveau === 'epuise' ? 'enveloppe vide' : 'reste ' + F(e.reste) + ' (' + e.pct + ' % utilisé)';
          texte(o, '- ' + e.nom + ' : ' + t, { couleur: couleurNiveau(e.niveau), taille: 10 });
        });
        o.y += 2;
      }
      if (d.comp) {
        var c = d.comp.c;
        titre(o, 'Comparaison avec ' + BF.moisFr(d.comp.mois));
        texte(o, c.diff === 0 ? 'Dépenses identiques.' : 'Dépenses ' + (c.diff > 0 ? 'en hausse' : 'en baisse') + ' de ' + F(Math.abs(c.diff)) + (c.pct != null ? ' (' + (c.pct > 0 ? '+' : '') + c.pct + ' %)' : '') + ' : ' + F(c.b) + ' puis ' + F(c.a) + '.', { taille: 10.5 });
        tableau(o, [{ t: 'Enveloppe', l: 80 }, { t: BF.moisFr(d.comp.mois), l: 34, a: 'right' }, { t: BF.moisFr(d.mois), l: 34, a: 'right' }, { t: 'Écart', l: 34, a: 'right' }],
          c.lignes.map(function (l) { return [l.nom, F(l.b), F(l.a), { t: (l.diff > 0 ? '+ ' : l.diff < 0 ? '- ' : '') + F(Math.abs(l.diff)), couleur: l.diff > 0 ? C.danger : l.diff < 0 ? C.ok : C.texte }]; }));
      }
      if (d.projets && d.projets.length) {
        titre(o, 'Budgets spéciaux');
        tableau(o, [{ t: 'Budget', l: 62 }, { t: 'Date', l: 26 }, { t: 'Objectif', l: 32, a: 'right' }, { t: 'Mis de côté', l: 32, a: 'right' }, { t: 'Reste', l: 30, a: 'right' }],
          d.projets.map(function (p) { var t = BF.totauxProjet(p); return [p.nom, BF.dateFr(p.date), F(t.objectif), F(t.epargne), F(t.resteAEpargner)]; }));
      }
      titre(o, 'Détail des dépenses (' + (d.depenses.length + (d.versements || []).length) + ')');
      var det = d.depenses.map(function (x) { return { date: x.date, env: BF.nomEnveloppe(x.env, [d.plan || {}]), note: x.note || '', montant: x.montant }; });
      (d.versements || []).forEach(function (v) { det.push({ date: v.date, env: 'Épargne', note: 'Mis de côté : ' + v.nom, montant: v.montant }); });
      det.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      if (!det.length) texte(o, 'Aucune dépense notée.', { couleur: C.gris });
      else {
        var lt = det.map(function (x) { return [BF.dateFr(x.date), x.env, x.note, F(x.montant)]; });
        var tl = ['', 'Total', '', F(BF.somme(det, 'montant'))]; tl.total = true; lt.push(tl);
        tableau(o, [{ t: 'Date', l: 24 }, { t: 'Enveloppe', l: 52 }, { t: 'Note', l: 72 }, { t: 'Montant', l: 34, a: 'right' }], lt);
      }
      pied(o.doc, d.aujourdhui);
      return o.doc.output('blob');
    });
  }

  // ---------- Liste d'un budget spécial ----------
  function listeProjet(d) {
    return charger().then(function () {
      var p = d.p, t = d.t, pe = d.pe;
      var o = nouveauDoc(p.nom, (BF.dateValide(p.date) ? 'Le ' + BF.dateLongue(p.date) : 'Budget spécial') + (pe.jours > 0 ? ' - dans ' + pe.jours + ' jours' : ''), d.foyer);
      cases(o, [['Total prévu', F(t.objectif)], ['Mis de côté', F(t.epargne), C.ok], ['Reste à trouver', F(t.resteAEpargner), t.resteAEpargner > 0 ? C.alerte : C.ok]]);
      if (pe.jours > 0 && t.resteAEpargner > 0) texte(o, 'Pour être prêt à temps : mettre de côté ' + F(pe.parMois) + ' par mois, ou ' + F(pe.parSemaine) + ' par semaine, ou ' + F(pe.parJour) + ' par jour.', { gras: true, couleur: C.brandFonce });
      var groupes = [{ id: '', nom: p.enfants && p.enfants.length ? 'Achats communs' : 'Liste des achats' }].concat((p.enfants || []).map(function (e) { return { id: e.id, nom: 'Liste de ' + e.nom }; }));
      var connus = {}; (p.enfants || []).forEach(function (e) { connus[e.id] = 1; });
      groupes.forEach(function (g) {
        var lignes = (p.lignes || []).filter(function (l) { return g.id ? l.groupe === g.id : !connus[l.groupe]; });
        if (!lignes.length) return;
        titre(o, g.nom);
        var lt = lignes.map(function (l) { var m = BF.montantLigne(l); return [l.achete ? 'Oui' : '', l.nom, String(l.qte), l.prix ? F(l.prix) : '-', m ? F(m) : '-']; });
        var tot = ['', 'Total', '', '', F(BF.somme(lignes.map(BF.montantLigne)))]; tot.total = true; lt.push(tot);
        tableau(o, [{ t: 'Acheté', l: 20 }, { t: 'Article', l: 84 }, { t: 'Qté', l: 16, a: 'right' }, { t: 'Prix unitaire', l: 30, a: 'right' }, { t: 'Total', l: 32, a: 'right' }], lt);
      });
      if ((p.versements || []).length) {
        titre(o, 'Argent mis de côté');
        var lv = p.versements.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).map(function (v) { return [BF.dateFr(v.date), F(v.montant)]; });
        var tv = ['Total', F(t.epargne)]; tv.total = true; lv.push(tv);
        tableau(o, [{ t: 'Date', l: 120 }, { t: 'Montant', l: 62, a: 'right' }], lv);
      }
      pied(o.doc, d.aujourdhui);
      return o.doc.output('blob');
    });
  }

  window.BFPdf = { charger: charger, rapportMois: rapportMois, listeProjet: listeProjet };
})();
