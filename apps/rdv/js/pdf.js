/* Rendez-vous Pro — PDF : agenda de la semaine et affiche avec le QR code de la page (jsPDF embarqué, polices standard). */
(function () {
  'use strict';
  var RV = window.RV;
  var T = RV.textePDF;
  var VERT = [11, 110, 79], GRIS = [90, 100, 96], CLAIR = [232, 243, 237];
  var PRESENCE = { venu: 'Venu', absent: 'Absent' };

  function doc(format) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('Module PDF indisponible : rechargez l\'application.');
    var d = new window.jspdf.jsPDF({ unit: 'mm', format: format || 'a4', compress: true });
    d.setProperties({ title: 'Rendez-vous Pro', creator: 'Rendez-vous Pro (Teranga Outils)' });
    return d;
  }
  function coupe(d, s, larg) { var l = d.splitTextToSize(T(s), larg); return l.length > 1 ? l[0].replace(/\s*$/, '…') : l[0] || ''; }

  // Agenda de la semaine : un bloc par jour, totaux en tête
  function semaine(sem, profil, presences) {
    var d = doc('a4'), y = 16, X = 12, L = 186;
    presences = presences || {};
    var pied = function () {
      var n = d.getNumberOfPages();
      for (var i = 1; i <= n; i++) {
        d.setPage(i); d.setFontSize(8); d.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
        d.text(T('Rendez-vous Pro — ' + profil.nom + ' — page ' + i + '/' + n), X, 290);
      }
    };
    var place = function (h) { if (y + h > 280) { d.addPage(); y = 16; } };
    d.setFont('helvetica', 'bold'); d.setFontSize(17); d.setTextColor(VERT[0], VERT[1], VERT[2]);
    d.text(T(profil.nom), X, y); y += 7;
    d.setFont('helvetica', 'normal'); d.setFontSize(11); d.setTextColor(30, 30, 30);
    d.text(T('Rendez-vous de la semaine du ' + RV.dateFr(sem.lundi) + ' au ' + RV.dateFr(sem.dimanche, { annee: true })), X, y); y += 8;
    // Totaux
    var cases = [['Rendez-vous', String(sem.total)], ['Montant prévu', RV.fcfa(sem.prevu)], ['Clients venus', String(sem.venus)], ['Absents', String(sem.absents)]];
    var lc = L / 4;
    cases.forEach(function (c, i) {
      d.setFillColor(CLAIR[0], CLAIR[1], CLAIR[2]); d.roundedRect(X + i * lc, y, lc - 3, 16, 2, 2, 'F');
      d.setFontSize(8); d.setTextColor(GRIS[0], GRIS[1], GRIS[2]); d.text(T(c[0]), X + i * lc + 3, y + 5);
      d.setFont('helvetica', 'bold'); d.setFontSize(13); d.setTextColor(20, 20, 20); d.text(T(c[1]), X + i * lc + 3, y + 12.5); d.setFont('helvetica', 'normal');
    });
    y += 22;
    var cols = [['Heure', 18], ['Client', 52], ['Service', 50], ['Prix', 24], ['Statut', 24], ['Présence', 18]];
    sem.jours.forEach(function (j) {
      place(16);
      d.setFillColor(VERT[0], VERT[1], VERT[2]); d.rect(X, y, L, 7, 'F');
      d.setFont('helvetica', 'bold'); d.setFontSize(10); d.setTextColor(255, 255, 255);
      var titre = RV.dateFr(j.date); titre = titre.charAt(0).toUpperCase() + titre.slice(1);
      d.text(T(titre + ' — ' + (j.rdv.length ? j.rdv.length + ' rendez-vous' : 'aucun rendez-vous')), X + 2, y + 5);
      d.setFont('helvetica', 'normal'); y += 7;
      if (!j.rdv.length) { y += 3; return; }
      d.setFontSize(8); d.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
      var x = X + 2; cols.forEach(function (c) { d.text(T(c[0]), x, y + 4); x += c[1]; }); y += 6;
      d.setFontSize(9.5);
      j.rdv.forEach(function (r, i) {
        place(7);
        if (i % 2) { d.setFillColor(246, 248, 247); d.rect(X, y - 0.5, L, 6.5, 'F'); }
        d.setTextColor(25, 25, 25);
        var vals = [RV.heureFr(r.heure), r.nom || '—', r.service || '—', r.prix ? RV.fcfa(r.prix) : '—', RV.STATUTS[r.statut].nom.replace('Autre heure proposée', 'Déplacé'), PRESENCE[presences[r.ref]] || ''];
        x = X + 2; vals.forEach(function (v, k) { d.text(coupe(d, v, cols[k][1] - 2), x, y + 4); x += cols[k][1]; });
        y += 6.5;
      });
      y += 3;
    });
    place(10);
    d.setFontSize(8); d.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
    d.text(T('Montants indicatifs (prix des services). Rendez-vous Pro n\'encaisse aucun paiement.'), X, y + 4);
    pied();
    return d.output('blob');
  }

  // Affiche A4 : nom, « Prenez rendez-vous ici », QR code vectoriel, lien
  function affiche(profil, lien) {
    var d = doc('a4'), W = 210;
    var qr = window.qrcode(0, 'M'); qr.addData(lien); qr.make();
    var n = qr.getModuleCount(), taille = 120, cote = taille / n, x0 = (W - taille) / 2, y0 = 78;
    d.setFillColor(VERT[0], VERT[1], VERT[2]); d.rect(0, 0, W, 50, 'F');
    d.setTextColor(255, 255, 255); d.setFont('helvetica', 'bold'); d.setFontSize(26);
    d.text(d.splitTextToSize(T(profil.nom), 180).slice(0, 2), W / 2, 22, { align: 'center' });
    d.setFont('helvetica', 'normal'); d.setFontSize(13);
    if (profil.lieu) d.text(T(coupe(d, profil.lieu, 180)), W / 2, 40, { align: 'center' });
    d.setTextColor(20, 20, 20); d.setFont('helvetica', 'bold'); d.setFontSize(22);
    d.text(T('Prenez rendez-vous ici'), W / 2, 66, { align: 'center' });
    d.setFillColor(0, 0, 0);
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d.rect(x0 + c * cote, y0 + r * cote, cote + 0.02, cote + 0.02, 'F');
    d.setFont('helvetica', 'normal'); d.setFontSize(13); d.setTextColor(40, 40, 40);
    d.text(T('Ouvrez l\'appareil photo de votre téléphone et visez le carré.'), W / 2, y0 + taille + 12, { align: 'center' });
    d.text(T('Choisissez votre service et votre heure : je confirme sur WhatsApp.'), W / 2, y0 + taille + 19, { align: 'center' });
    var services = (profil.services || []).slice(0, 5).map(function (s) { return s.nom + (s.prix ? ' : ' + RV.fcfa(s.prix) : ''); }).join('   ·   ');
    if (services) { d.setFontSize(11); d.setTextColor(GRIS[0], GRIS[1], GRIS[2]); d.text(d.splitTextToSize(T(services), 180).slice(0, 2), W / 2, y0 + taille + 30, { align: 'center' }); }
    d.setFontSize(7); d.setTextColor(130, 130, 130);
    d.text(d.splitTextToSize(T(lien), 190), W / 2, 284, { align: 'center' });
    return d.output('blob');
  }

  window.RV_PDF = { semaine: semaine, affiche: affiche };
})();
