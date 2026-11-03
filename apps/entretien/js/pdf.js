/* Carnet Entretien — historique PDF d'un engin (jsPDF embarqué, chargé seulement au moment du PDF). Fonctionne hors ligne. */
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
  var T = function (s) { return CE.textePDF(s); };
  var C = { brand: [29, 79, 145], brandFonce: [20, 58, 107], texte: [20, 27, 38], gris: [83, 94, 109], ligne: [213, 221, 232], fond: [234, 239, 245],
    alerte: [162, 74, 0], danger: [179, 38, 30], ok: [27, 122, 70], orange: [242, 140, 40], blanc: [255, 255, 255] };
  function F(n) { return CE.formatNombre(n, ' ') + ' F'; }
  var MARGE = 14, LARGEUR = 182, BAS = 282;

  function nouveauDoc(titre, sousTitre, droite) {
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({ title: T(titre + ' - ' + sousTitre), creator: 'Carnet Entretien (TERANGA)', subject: T(sousTitre) });
    doc.setFillColor.apply(doc, C.brand); doc.rect(0, 0, 210, 30, 'F');
    doc.setFillColor.apply(doc, C.orange); doc.rect(0, 30, 210, 1.6, 'F');
    doc.setTextColor.apply(doc, C.blanc);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.text(T(titre), MARGE, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11.5); doc.text(T(sousTitre), MARGE, 23);
    if (droite) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(T(droite), 210 - MARGE, 14, { align: 'right' }); }
    doc.setTextColor.apply(doc, C.texte);
    return { doc: doc, y: 42 };
  }
  function pied(doc, aujourdhui) {
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor.apply(doc, C.ligne); doc.setLineWidth(0.3); doc.line(MARGE, 287, 210 - MARGE, 287);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, C.gris);
      doc.text(T('Notes tenues par le propriétaire dans Carnet Entretien (TERANGA) - édité le ' + CE.dateFr(aujourdhui)), MARGE, 292);
      doc.text('Page ' + i + ' / ' + n, 210 - MARGE, 292, { align: 'right' });
    }
  }
  function saut(o, h) { if (o.y + h > BAS) { o.doc.addPage(); o.y = 18; return true; } return false; }
  function titre(o, t) {
    saut(o, 16);
    o.doc.setFont('helvetica', 'bold'); o.doc.setFontSize(13); o.doc.setTextColor.apply(o.doc, C.brandFonce);
    o.doc.text(T(t), MARGE, o.y); o.y += 2.5;
    o.doc.setDrawColor.apply(o.doc, C.orange); o.doc.setLineWidth(0.6); o.doc.line(MARGE, o.y, MARGE + 22, o.y);
    o.doc.setTextColor.apply(o.doc, C.texte); o.y += 6;
  }
  function texte(o, t, opts) {
    opts = opts || {};
    o.doc.setFont('helvetica', opts.gras ? 'bold' : 'normal'); o.doc.setFontSize(opts.taille || 10.5);
    o.doc.setTextColor.apply(o.doc, opts.couleur || C.texte);
    o.doc.splitTextToSize(T(t), LARGEUR).forEach(function (l) { saut(o, 6); o.doc.text(l, MARGE, o.y); o.y += (opts.taille || 10.5) * 0.48; });
    o.doc.setTextColor.apply(o.doc, C.texte); o.y += 1.5;
  }
  function cases(o, items) {
    saut(o, 24);
    var n = items.length, ecart = 4, l = (LARGEUR - ecart * (n - 1)) / n;
    items.forEach(function (it, i) {
      var x = MARGE + i * (l + ecart);
      o.doc.setFillColor.apply(o.doc, C.fond); o.doc.roundedRect(x, o.y, l, 19, 2.5, 2.5, 'F');
      o.doc.setFont('helvetica', 'normal'); o.doc.setFontSize(8.5); o.doc.setTextColor.apply(o.doc, C.gris); o.doc.text(T(it[0]), x + 3.5, o.y + 6.5);
      o.doc.setFont('helvetica', 'bold'); o.doc.setFontSize(12.5); o.doc.setTextColor.apply(o.doc, it[2] || C.texte); o.doc.text(T(it[1]), x + 3.5, o.y + 14.5);
    });
    o.doc.setTextColor.apply(o.doc, C.texte); o.y += 25;
  }
  function tableau(o, colonnes, lignes) {
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
      var h = Math.max.apply(null, cellules.map(function (c, i) { doc.setFont('helvetica', c.gras ? 'bold' : 'normal'); return doc.splitTextToSize(T(c.t), colonnes[i].l - 5).length; })) * 4.4 + 3.4;
      if (saut(o, h)) entete();
      if (ligne.total) { doc.setFillColor.apply(doc, C.fond); doc.rect(MARGE, o.y, LARGEUR, h, 'F'); }
      else if (idx % 2 === 1) { doc.setFillColor(247, 249, 252); doc.rect(MARGE, o.y, LARGEUR, h, 'F'); }
      var x = MARGE;
      cellules.forEach(function (c, i) {
        var col = colonnes[i];
        doc.setFont('helvetica', c.gras || ligne.total ? 'bold' : 'normal'); doc.setTextColor.apply(doc, c.couleur || C.texte);
        doc.text(doc.splitTextToSize(T(c.t), col.l - 5), col.a === 'right' ? x + col.l - 2.5 : x + 2.5, o.y + 5, { align: col.a === 'right' ? 'right' : 'left', lineHeightFactor: 1.3 });
        x += col.l;
      });
      doc.setTextColor.apply(doc, C.texte);
      doc.setDrawColor.apply(doc, C.ligne); doc.setLineWidth(0.2); doc.line(MARGE, o.y + h, MARGE + LARGEUR, o.y + h);
      o.y += h;
    });
    o.y += 7;
  }
  var COULEUR_STATUT = { retard: C.danger, bientot: C.alerte, ok: C.ok, inconnu: C.gris };

  // d : { e, compteur, liste (aFaire), hist, conso, cout, montants, proprietaire, aujourdhui }
  function historique(d) {
    return charger().then(function () {
      var e = d.e, Ty = CE.TYPES[e.type], u = e.unite;
      var o = nouveauDoc('Carnet d\'entretien', e.nom + (e.immat ? ' - ' + e.immat : ''), d.proprietaire ? 'Propriétaire : ' + d.proprietaire : '');
      var boites = [['Type', Ty.nom]];
      if (u) boites.push([u === 'km' ? 'Compteur' : 'Heures de marche', CE.compteurTxt(d.compteur, u, ' ')]);
      if (e.annee) boites.push(['Année', String(e.annee)]);
      if (d.conso && d.conso.moyenne != null) boites.push(['Consommation', CE.decimal(d.conso.moyenne, 1, ' ') + ' ' + CE.libelleConso(u).replace(' ', ' ')]);
      cases(o, boites.slice(0, 4));
      var ops = d.hist.filter(function (l) { return l.genre === 'operation'; });
      var nbEntretiens = ops.filter(function (l) { return l.categorie === 'entretien'; }).length;
      texte(o, 'Ce carnet regroupe ' + ops.length + ' intervention' + (ops.length > 1 ? 's' : '') + ' notée' + (ops.length > 1 ? 's' : '') + ' (dont ' + nbEntretiens + ' entretien' + (nbEntretiens > 1 ? 's' : '') + ' du programme)' +
        (d.conso && d.conso.nb ? ' et ' + d.conso.nb + ' plein' + (d.conso.nb > 1 ? 's' : '') + ' de carburant' : '') + '.', { couleur: C.gris, taille: 10 });

      titre(o, 'Programme d\'entretien');
      tableau(o, [{ t: 'Entretien', l: 62 }, { t: 'Rythme', l: 42 }, { t: 'Dernière fois', l: 38 }, { t: 'Prochaine fois', l: 40 }], d.liste.map(function (x) {
        var t = x.tache, s = x.etat;
        var der = t.mode === 'echeance' ? (t.echeance ? 'fin le ' + CE.dateFr(t.echeance) : '-') : t.dernier ? CE.dateFr(t.dernier.date) + (u && t.dernier.compteur ? '\n' + CE.compteurTxt(t.dernier.compteur, u, ' ') : '') : 'non notée';
        var proch = s.statut === 'inconnu' ? '-' : t.mode === 'echeance' ? (s.jours < 0 ? 'expirée' : 'à renouveler') : (s.compteurDu ? CE.compteurTxt(s.compteurDu, u, ' ') : '') + (s.compteurDu && s.dateDu ? '\nou ' : '') + (s.dateDu ? CE.dateFr(s.dateDu) : '');
        return [t.nom, CE.rythmeTxt(t, u), der, { t: proch || '-', couleur: COULEUR_STATUT[s.statut], gras: s.statut === 'retard' }];
      }));

      titre(o, 'Historique des entretiens et réparations');
      if (!ops.length) texte(o, 'Aucune intervention notée.', { couleur: C.gris });
      else {
        var cols = [{ t: 'Date', l: 24 }, { t: u ? 'Compteur' : 'Catégorie', l: 28 }, { t: 'Intervention', l: d.montants ? 70 : 96 }, { t: 'Garage', l: d.montants ? 32 : 34 }];
        if (d.montants) cols.push({ t: 'Montant', l: 28, a: 'right' });
        var lignes = ops.slice().reverse().map(function (l) {
          var r = [CE.dateFr(l.date), u ? (l.compteur ? CE.compteurTxt(l.compteur, u, ' ') : '-') : CE.CATEGORIES[l.categorie].nom, l.libelle + (l.ref.note ? ' (' + l.ref.note + ')' : ''), l.ref.garage || ''];
          if (d.montants) r.push(F(l.montant));
          return r;
        });
        if (d.montants) { var tot = ['', '', 'Total', '', F(CE.somme(ops, 'montant'))]; tot.total = true; lignes.push(tot); }
        tableau(o, cols, lignes);
      }
      if (d.conso && d.conso.nb) {
        titre(o, 'Carburant');
        var c = d.conso, lib = CE.libelleConso(u).replace(' ', ' ');
        texte(o, c.nb + ' plein' + (c.nb > 1 ? 's' : '') + ' notés, ' + CE.decimal(c.totalCl / 100, 1, ' ') + ' litres au total.' +
          (c.moyenne != null ? ' Consommation moyenne : ' + CE.decimal(c.moyenne, 1, ' ') + ' ' + lib + (c.approx ? ' (approximative)' : '') + '.' : '') +
          (d.montants && c.prixLitre ? ' Prix moyen du litre : ' + F(c.prixLitre) + '.' : '') + (d.montants && c.coutParUnite != null ? ' Carburant par ' + (u === 'h' ? 'heure' : 'km') + ' : ' + F(c.coutParUnite) + '.' : ''));
      }
      if (d.montants && d.cout) texte(o, 'Coût tout compris (carburant, entretien, réparations) : ' + F(d.cout.total) + ' sur ' + CE.compteurTxt(d.cout.distance, u, ' ') + ', soit ' + F(d.cout.parUnite) + ' par ' + (u === 'h' ? 'heure' : 'km') + '.', { gras: true });
      o.y += 2;
      texte(o, 'Ce document reprend les notes saisies par le propriétaire. Les factures du garage, quand elles existent, restent la meilleure preuve des travaux.', { couleur: C.gris, taille: 9 });
      pied(o.doc, d.aujourdhui);
      return o.doc.output('blob');
    });
  }
  window.CEPdf = { charger: charger, historique: historique };
})();
