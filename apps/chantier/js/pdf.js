/* Chantier Clair — rapport PDF (jsPDF, chargé seulement à ce moment-là) : semaine ou depuis le début.
   Contenu : avancement par étape, argent envoyé (déclaré) et dépenses (justifiées ou non), écarts, faits de la période,
   photos, historique chaîné avec empreintes et résultat de la vérification. Version gratuite : mention en pied de page. */
(function (racine) {
  'use strict';
  var CC = racine.CC;
  var BLEU = [29, 78, 137], OCRE = [214, 140, 40], ENCRE = [22, 30, 40], GRIS = [92, 102, 115], TRAIT = [214, 220, 228], ROUGE = [178, 34, 34], VERT = [30, 120, 70], FOND = [244, 247, 251];
  var NOTICE = 'Chantier Clair garde une trace datée et chaînée de chaque action. Les montants et constats sont déclarés par chacun ; l\'application ne transfère jamais d\'argent. La valeur de ce rapport en cas de désaccord dépend des circonstances.';
  var ADRESSE = 'ndoyepapamassamba-commits.github.io/Add-a-README-file/apps/chantier/';

  function fuseau() {
    var m = -new Date().getTimezoneOffset();
    if (!m) return 'GMT (heure de Dakar)';
    return 'GMT' + (m > 0 ? '+' : '-') + Math.floor(Math.abs(m) / 60) + (Math.abs(m) % 60 ? ':' + ('0' + Math.abs(m) % 60).slice(-2) : '');
  }

  // o : { ctx, periode: { debut, fin, semaine }, verification, photos: [{ nom, url, l, h, legende, le, auteur, sha256 }], premium, editeLe }
  function creer(o) {
    var jsPDF = racine.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    var W = 210, H = 297, M = 15, L = W - 2 * M, y = 0;
    var ctx = o.ctx, d = ctx.donnees, r = ctx.r, et = ctx.etapes, T = CC.textePDF;
    var nom = d.nom || ctx.d.titre || 'Chantier';
    doc.setProperties({ title: T('Rapport de chantier — ' + nom), subject: 'Chantier Clair', creator: 'Chantier Clair' });

    function police(taille, style, couleur) { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(taille); doc.setTextColor.apply(doc, couleur || ENCRE); }
    function bas() { return H - (o.premium ? 14 : 20); }
    function place(h) { if (y + h > bas()) { doc.addPage(); y = M; return true; } return false; }
    function texte(s, x, largeur, taille, style, couleur, interligne) {
      police(taille, style, couleur);
      var lignes = doc.splitTextToSize(T(s), largeur), lh = (interligne || 1.35) * taille * 0.3528;
      lignes.forEach(function (l) { place(lh); doc.text(l, x, y + lh * 0.8); y += lh; });
    }
    function titre(s, apres) {
      place(14 + (apres || 12)); y += 4;
      police(12.5, 'bold', BLEU); doc.text(T(s), M, y + 4.5);
      doc.setDrawColor.apply(doc, TRAIT); doc.setLineWidth(0.3); doc.line(M, y + 7, W - M, y + 7);
      y += 10;
    }
    function barre(x, yy, w, p, couleur) {
      doc.setFillColor(230, 234, 240); doc.roundedRect(x, yy, w, 2.6, 1.2, 1.2, 'F');
      if (p > 0) { doc.setFillColor.apply(doc, couleur || BLEU); doc.roundedRect(x, yy, Math.max(2.6, w * Math.min(100, p) / 100), 2.6, 1.2, 1.2, 'F'); }
    }
    function tableau(cols, lignes, opts) {
      opts = opts || {};
      police(8.3, 'bold', GRIS); place(7);
      cols.forEach(function (c) { doc.text(T(c.t), c.droite ? c.x + c.w : c.x, y + 4, c.droite ? { align: 'right' } : undefined); });
      y += 6;
      lignes.forEach(function (l, i) {
        police(8.5, 'normal');
        var dec = l.map(function (v, k) { return doc.splitTextToSize(T(v == null ? '' : v), cols[k].w); });
        var h = Math.max.apply(null, dec.map(function (x) { return x.length; }).concat([1])) * 3.9 + 2.8;
        place(h);
        if (i % 2 === 0) { doc.setFillColor.apply(doc, FOND); doc.rect(M - 1.5, y, L + 3, h, 'F'); }
        dec.forEach(function (t, k) {
          var c = cols[k];
          police(8.5, c.gras ? 'bold' : 'normal', (opts.couleur && opts.couleur(i, k)) || (c.gris ? GRIS : ENCRE));
          doc.text(t, c.droite ? c.x + c.w : c.x, y + 4.2, c.droite ? { align: 'right' } : undefined);
        });
        if (opts.apres) opts.apres(i, y, h);
        y += h;
      });
    }
    function coche(x, yy, t, couleur) {
      doc.setDrawColor.apply(doc, couleur || VERT); doc.setLineWidth(t * 0.16); doc.setLineCap('round'); doc.setLineJoin('round');
      doc.lines([[t * 0.32, t * 0.32], [t * 0.62, -t * 0.7]], x, yy, [1, 1], 'S', false);
    }
    var F = CC.formatF;

    // ---------- En-tête ----------
    doc.setFillColor.apply(doc, BLEU); doc.rect(0, 0, W, 30, 'F');
    doc.setFillColor.apply(doc, OCRE); doc.rect(0, 30, W, 1.4, 'F');
    police(20, 'bold', [255, 255, 255]); doc.text('Chantier Clair', M, 14);
    police(10.5, 'normal', [222, 233, 247]); doc.text(T('Rapport de chantier — historique daté et vérifiable'), M, 21.5);
    police(9, 'normal', [222, 233, 247]);
    doc.text(T('Chantier ' + ctx.id), W - M, 12.5, { align: 'right' });
    doc.text(T('Édité le ' + CC.dateHeureFr(o.editeLe || new Date().toISOString())), W - M, 18, { align: 'right' });
    doc.text(T('Heures : ' + fuseau()), W - M, 23.5, { align: 'right' });
    y = 38;

    police(16, 'bold'); doc.text(doc.splitTextToSize(T(nom), L)[0], M, y + 5); y += 8;
    police(10, 'normal', GRIS);
    var sous = [d.lieu, d.type, d.debut ? 'début le ' + CC.jourFr(d.debut) : '', CC.STATUTS[r.statut]].filter(Boolean).join(' · ');
    doc.text(T(sous), M, y + 4); y += 6;
    var p = o.periode || {};
    police(10.5, 'bold', OCRE);
    doc.text(T(p.semaine ? 'Semaine du ' + CC.dateFr(new Date(p.debut).toISOString()) + ' au ' + CC.dateFr(new Date(p.fin).toISOString()) : 'Depuis le début du chantier, au ' + CC.dateFr(new Date(p.fin || Date.now()).toISOString())), M, y + 4);
    y += 9;

    // ---------- Chiffres clés ----------
    var boites = [['Avancement global', r.global + ' %', BLEU], ['Argent envoyé (déclaré)', F(r.envoye), BLEU], ['Dépenses déclarées', F(r.depense), ENCRE], ['Dont avec reçu', F(r.justifie), VERT]];
    var bw = (L - 9) / 4;
    boites.forEach(function (b, i) {
      var x = M + i * (bw + 3);
      doc.setFillColor.apply(doc, FOND); doc.setDrawColor.apply(doc, TRAIT); doc.setLineWidth(0.3); doc.roundedRect(x, y, bw, 19, 2, 2, 'FD');
      police(7.8, 'bold', GRIS); doc.text(T(b[0]), x + 3, y + 5.5);
      police(13, 'bold', b[2]); doc.text(T(b[1]), x + 3, y + 13);
    });
    y += 21;
    barre(M, y + 1, L, r.global, BLEU); y += 6;
    police(9, 'normal', GRIS);
    doc.text(T('Budget prévu : ' + F(r.budget) + '   ·   Envoyé − dépensé : ' + F(r.solde) + '   ·   Non justifié : ' + F(r.nonJustifie) + ' (' + r.nbNonJustifiees + ')'), M, y + 3.5);
    y += 7;

    // ---------- Points à surveiller ----------
    titre(r.alertes.length ? 'Points à surveiller (' + r.alertes.length + ')' : 'Points à surveiller', 10);
    if (!r.alertes.length) { coche(M + 1, y + 2.6, 4.5); texte('     Rien d\'anormal : dépenses justifiées, photos récentes, questions répondues.', M, L, 9.5, 'normal', VERT); }
    r.alertes.forEach(function (a) {
      place(6);
      doc.setFillColor.apply(doc, a.grave >= 2 ? ROUGE : OCRE); doc.circle(M + 1.5, y + 2.6, 1.1, 'F');
      police(9.3, a.grave >= 2 ? 'bold' : 'normal', a.grave >= 2 ? ROUGE : ENCRE);
      var l = doc.splitTextToSize(T(a.texte), L - 6);
      doc.text(l, M + 5, y + 3.6); y += l.length * 4.2 + 1.2;
    });

    // ---------- Étapes ----------
    titre('Étapes et budget', 20);
    var cE = [{ x: M, w: 58, t: 'Étape', gras: true }, { x: M + 60, w: 36, t: 'Avancement' }, { x: M + 98, w: 28, t: 'Budget', droite: true }, { x: M + 128, w: 28, t: 'Dépensé', droite: true }, { x: M + 160, w: 20, t: 'Validée' }];
    tableau(cE, r.etapes.map(function (x) { return [x.n, '', F(x.b), F(x.depense), x.valide ? 'oui, ' + CC.dateFr(x.valideLe) : '—']; }), {
      couleur: function (i, k) { var x = r.etapes[i]; return k === 3 && x.b > 0 && x.depense > x.b ? ROUGE : null; },
      apres: function (i, yy) { var x = r.etapes[i]; barre(M + 60, yy + 1.9, 16, x.pourcent, x.valide ? VERT : BLEU); police(8.5, 'bold', x.valide ? VERT : ENCRE); doc.text(x.pourcent + ' %', M + 79, yy + 4.2); }
    });
    police(9, 'bold'); place(6); doc.text(T('Total'), M, y + 4); doc.text(T(F(r.budget)), M + 126, y + 4, { align: 'right' }); doc.text(T(F(r.depense)), M + 156, y + 4, { align: 'right' }); y += 6;

    // ---------- Ce qui s'est passé ----------
    var evsP = CC.periode(ctx.evs, p.debut || 0, p.fin || Date.now()).filter(function (e) { return e.type !== 'preuve'; });
    titre(p.semaine ? 'Ce qui s\'est passé cette semaine (' + evsP.length + ')' : 'Toutes les actions (' + evsP.length + ')', 14);
    if (!evsP.length) texte('Aucune action notée pendant cette période.', M, L, 9.5, 'italic', GRIS);
    else tableau([{ x: M, w: 26, t: 'Date' }, { x: M + 28, w: 22, t: 'Par' }, { x: M + 52, w: 46, t: 'Action', gras: true }, { x: M + 100, w: L - 100, t: 'Détails', gris: true }],
      evsP.map(function (e) { var dt = CC.detailEvenement(e, et); if (e.donnees && e.donnees.fait_le) dt += (dt ? ' · ' : '') + 'fait le ' + CC.dateHeureFr(e.donnees.fait_le) + ' sans réseau'; return [CC.dateFr(e.le) + ' ' + CC.heureFr(e.le), CC.ROLES_COURTS[e.auteur] || e.auteur, CC.libelleEvenement(e, et), dt || '—']; }));

    // ---------- Photos ----------
    var photos = o.photos || [];
    titre(p.semaine ? 'Photos de la semaine (' + photos.length + ')' : 'Photos (' + photos.length + ' dernières)', photos.length ? 76 : 10);
    if (!photos.length) texte(p.semaine ? 'Aucune photo cette semaine.' : 'Aucune photo.', M, L, 9.5, 'italic', r.statut !== 'termine' && p.semaine ? ROUGE : GRIS);
    var lc = (L - 6) / 2, hc = 62;
    for (var i = 0; i < photos.length; i += 2) {
      place(hc + 14);
      for (var k = 0; k < 2 && i + k < photos.length; k++) {
        var ph = photos[i + k], x = M + k * (lc + 6);
        doc.setDrawColor.apply(doc, TRAIT); doc.setLineWidth(0.3); doc.rect(x, y, lc, hc);
        if (ph.url) {
          var rr = Math.min((lc - 2) / ph.l, (hc - 2) / ph.h), iw = ph.l * rr, ih = ph.h * rr;
          try { doc.addImage(ph.url, 'JPEG', x + (lc - iw) / 2, y + (hc - ih) / 2, iw, ih, undefined, 'FAST'); } catch (err) { /* photo illisible */ }
        } else { police(8.5, 'normal', GRIS); doc.text(T('Photo indisponible (pas de réseau)'), x + lc / 2, y + hc / 2, { align: 'center' }); }
        police(8, 'bold'); doc.text(doc.splitTextToSize(T((ph.legende || ph.nom) + ' · ' + (CC.ROLES_COURTS[ph.auteur] || '')), lc)[0], x, y + hc + 4);
        police(7.5, 'normal', GRIS); doc.text(T(ph.nom + ' · ' + CC.dateHeureFr(ph.le)), x, y + hc + 8);
        if (ph.sha256) { doc.setFont('courier', 'normal'); doc.setFontSize(5.8); doc.text('sha256 ' + ph.sha256, x, y + hc + 11.3); }
      }
      y += hc + 15;
    }

    // ---------- Argent ----------
    titre('Argent envoyé (déclaré par le propriétaire)', 14);
    if (!r.versements.length) texte('Aucun envoi déclaré.', M, L, 9.5, 'italic', GRIS);
    else tableau([{ x: M, w: 24, t: 'Envoyé le' }, { x: M + 26, w: 30, t: 'Montant', droite: true, gras: true }, { x: M + 60, w: 50, t: 'Moyen' }, { x: M + 112, w: L - 112, t: 'Réception' }],
      r.versements.map(function (it) { var dn = it.e.donnees || {}; return [dn.date ? CC.jourFr(dn.date) : CC.dateFr(it.e.le), F(it.montant), (CC.MOYENS[dn.moyen] || '') + (dn.beneficiaire ? ' · à ' + dn.beneficiaire : ''), it.recu ? 'confirmée par le chef le ' + CC.dateFr(it.recu.e.le) : 'pas encore confirmée']; }),
      { couleur: function (i, k) { return k === 3 && !r.versements[i].recu ? GRIS : null; } });
    titre('Dépenses (déclarées par le chef)', 14);
    if (!r.depenses.length) texte('Aucune dépense déclarée.', M, L, 9.5, 'italic', GRIS);
    else tableau([{ x: M, w: 22, t: 'Date' }, { x: M + 24, w: 62, t: 'Quoi', gras: true }, { x: M + 88, w: 34, t: 'Étape' }, { x: M + 124, w: 28, t: 'Montant', droite: true }, { x: M + 156, w: 24, t: 'Reçu' }],
      r.depenses.map(function (it) { var dn = it.e.donnees || {}; return [dn.date ? CC.jourFr(dn.date) : CC.dateFr(it.e.le), (dn.libelle || '') + (dn.fournisseur ? ' (' + dn.fournisseur + ')' : ''), CC.etiquetteEtape(et, dn.etape), F(it.montant), it.photos.length ? 'photo' : 'MANQUANT']; }),
      { couleur: function (i, k) { return k === 4 && !r.depenses[i].photos.length ? ROUGE : null; } });

    // ---------- Historique chaîné ----------
    var evsH = p.semaine ? CC.periode(ctx.evs, p.debut, p.fin) : ctx.evs;
    titre('Historique chaîné (empreintes SHA-256)', 30);
    texte('Chaque action porte l\'empreinte de la précédente ; la première porte l\'empreinte du numéro du chantier. Modifier, ajouter ou retirer une action casserait la chaîne.' + (p.semaine ? ' Actions de la période ci-dessous ; la vérification porte sur tout l\'historique (' + ctx.evs.length + ' actions).' : ''), M, L, 8.5, 'normal', GRIS);
    y += 1.5;
    evsH.forEach(function (e) {
      place(13.5);
      var n = ctx.evs.indexOf(e) + 1;
      police(8, 'bold'); doc.text(doc.splitTextToSize(T(n + '. ' + CC.libelleEvenement(e, et) + ' — ' + CC.dateHeureFr(e.le) + ' — ' + (CC.ROLES_COURTS[e.auteur] || e.auteur)), L)[0], M, y + 3.5);
      doc.setFont('courier', 'normal'); doc.setFontSize(6.6); doc.setTextColor.apply(doc, GRIS);
      doc.text('precedent : ' + String(e.precedent || ''), M + 3, y + 7.3);
      doc.setTextColor.apply(doc, ENCRE);
      doc.text('empreinte : ' + String(e.empreinte || ''), M + 3, y + 10.6);
      y += 13;
    });
    var v = o.verification;
    if (v) {
      y += 2; place(20);
      var bon = v.ok;
      doc.setFillColor.apply(doc, bon ? [234, 246, 238] : [252, 236, 236]); doc.setDrawColor.apply(doc, bon ? VERT : ROUGE);
      doc.roundedRect(M, y, L, 18, 2, 2, 'FD');
      if (bon) coche(M + 4, y + 7.6, 6);
      police(9.5, 'bold', bon ? VERT : ROUGE);
      doc.text(T(bon ? 'Historique vérifié sur le téléphone : intact' : 'Attention : l\'historique ne se vérifie pas entièrement'), M + 13, y + 5.8);
      police(8, 'normal');
      doc.text(T(v.liens + ' lien(s) sur ' + v.total + ' corrects ; ' + v.contenus + ' empreinte(s) sur ' + v.contenusTotal + ' recalculée(s) à l\'identique. Vérifié le ' + CC.dateHeureFr(o.editeLe || new Date().toISOString()) + '.'), M + 13, y + 10.6);
      doc.setFont('courier', 'normal'); doc.setFontSize(6.6);
      doc.text('derniere empreinte : ' + String(v.derniere || ''), M + 13, y + 14.8);
      y += 21;
    }

    // ---------- Mention ----------
    y += 2;
    texte(NOTICE, M, L, 9, 'italic', ENCRE);
    texte('Les heures sont celles du serveur à la réception de chaque action. Chantier Clair ne garde ni numéro de téléphone ni adresse exacte. Les données sont effacées 180 jours après la dernière activité : gardez ce rapport.', M, L, 8, 'normal', GRIS);

    // ---------- Pieds de page ----------
    var n = doc.getNumberOfPages();
    for (var pg = 1; pg <= n; pg++) {
      doc.setPage(pg);
      police(7.5, 'normal', GRIS);
      doc.text(T('Page ' + pg + ' / ' + n + ' · Chantier ' + ctx.id), W - M, H - 7, { align: 'right' });
      if (!o.premium) {
        doc.setFillColor(255, 244, 228); doc.rect(0, H - 15, W, 5.5, 'F');
        police(7.5, 'bold', [150, 85, 10]);
        doc.text(T('Créé avec la version gratuite de Chantier Clair — ' + ADRESSE), W / 2, H - 11.2, { align: 'center' });
      }
    }
    var fichier = 'rapport-chantier-' + CC.sansAccents(nom).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) + '-' + CC.cleJour(p.fin || Date.now()) + '.pdf';
    return { blob: doc.output('blob'), nom: fichier, pages: n };
  }
  racine.RAPPORT = { creer: creer, NOTICE: NOTICE };
})(typeof self !== 'undefined' ? self : this);
