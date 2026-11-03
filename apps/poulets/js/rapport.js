/* PouletPilot — rapport PDF d'un lot (jsPDF chargé seulement au besoin, copie locale), fichiers et partage. */
(function () {
  'use strict';
  var PP = window.PP;
  var chargement = null;
  function chargerJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (chargement) return chargement;
    chargement = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = 'vendor/jspdf.umd.min.js';
      s.onload = function () { window.jspdf && window.jspdf.jsPDF ? ok(window.jspdf.jsPDF) : ko(new Error('jsPDF absent')); };
      s.onerror = function () { chargement = null; ko(new Error('Chargement du module PDF impossible.')); };
      document.head.appendChild(s);
    });
    return chargement;
  }

  // Les polices standard du PDF ne connaissent que l'alphabet Windows-1252
  var CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function T(s) {
    s = String(s == null ? '' : s).replace(/[    ]/g, ' ').replace(/−/g, '-').replace(/\r\n?/g, '\n');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.indexOf(ch) >= 0) { out += ch; continue; }
      var base = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : ch;
      out += /^[\x20-\x7e]$/.test(base) ? base : (c >= 0xD800 && c <= 0xDBFF ? (i++, '') : '');
    }
    return out;
  }

  function imageEnDataURL(url) {
    return fetch(url).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
      if (!b) return null;
      return new Promise(function (ok) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = function () { ok(null); }; fr.readAsDataURL(b); });
    }).catch(function () { return null; });
  }

  var VERT = [11, 110, 79], JAUNE = [242, 183, 5], AMBRE = [181, 101, 10], ENCRE = [19, 32, 26], GRIS = [86, 102, 95], FILET = [213, 223, 218], FOND = [238, 243, 240], ROUGE = [180, 35, 24];

  function pdfLot(donnees) {
    // donnees = { lot, ops, bilan, projection (ou null), alertes, reglages, nomFichier }
    return Promise.all([chargerJsPDF(), imageEnDataURL('icons/icon-192.png')]).then(function (r) {
      var JsPDF = r[0], logo = r[1];
      var b = donnees.bilan, lot = donnees.lot, proj = donnees.projection, reg = PP.reglagesComplets(donnees.reglages);
      var doc = new JsPDF({ unit: 'mm', format: 'a4', compress: false });
      doc.setProperties({ title: T('Rapport du lot ' + lot.nom), subject: 'PouletPilot', creator: 'PouletPilot' });
      var M = 14, L = 210 - 2 * M, y = 0, BAS = 280;
      function couleur(c) { doc.setTextColor(c[0], c[1], c[2]); }
      function police(style, taille) { doc.setFont('helvetica', style); doc.setFontSize(taille); }
      function saut(h) { if (y + h > BAS) { doc.addPage(); y = 18; return true; } return false; }
      function titre(t) {
        saut(14); y += 4; police('bold', 12.5); couleur(VERT); doc.text(T(t), M, y); y += 2;
        doc.setDrawColor(JAUNE[0], JAUNE[1], JAUNE[2]); doc.setLineWidth(0.8); doc.line(M, y, M + 22, y); y += 5;
      }
      function paragraphe(t, taille, c) {
        police('normal', taille || 9.5); couleur(c || ENCRE);
        y += (taille || 9.5) * 0.3;
        var lignes = doc.splitTextToSize(T(t), L);
        lignes.forEach(function (l) { saut(5); doc.text(l, M, y); y += (taille || 9.5) * 0.45; });
        y += 1.5;
      }

      // En-tête
      doc.setFillColor(VERT[0], VERT[1], VERT[2]); doc.rect(0, 0, 210, 26, 'F');
      doc.setFillColor(JAUNE[0], JAUNE[1], JAUNE[2]); doc.rect(0, 26, 210, 1.4, 'F');
      if (logo) { try { doc.addImage(logo, 'PNG', M, 5, 16, 16); } catch (e) { /* sans logo */ } }
      police('bold', 17); doc.setTextColor(255, 255, 255); doc.text('PouletPilot', M + 20, 13);
      police('normal', 10); doc.text(T('Rapport du lot · calculs à partir de vos saisies'), M + 20, 19.5);
      police('normal', 9); doc.text(T('Édité le ' + PP.dateFr(b.aujourdhui)), 210 - M, 13, { align: 'right' });
      y = 37;
      police('bold', 16); couleur(ENCRE); doc.text(T(lot.nom), M, y); y += 6;
      var infos = ['Arrivée des poussins : ' + PP.dateFr(lot.dateDebut), (b.lot.statut === 'termine' ? 'Lot terminé à ' : 'Âge : ') + b.age + ' jours',
        'Âge de vente prévu : ' + b.lot.ageVente + ' jours'];
      if (lot.souche) infos.push('Souche : ' + lot.souche);
      if (lot.batiment) infos.push('Poulailler : ' + lot.batiment);
      paragraphe(infos.join('  ·  '), 9.5, GRIS);

      // Indicateurs
      titre('Les chiffres clés');
      var k = [
        ['Poussins au départ', PP.nombre(b.nbPoussins) + ' à ' + PP.fcfa(b.lot.prixPoussin)],
        ['Morts (mortalité)', PP.nombre(b.morts) + ' (' + PP.pct(b.tauxMortalite) + ')'],
        ['Poulets restants', PP.nombre(b.vivants)],
        ['Poulets vendus', PP.nombre(b.vendus)],
        ['Poids moyen', b.poidsMoyenG != null ? PP.nombre(b.poidsMoyenG) + ' g (jour ' + b.dernierePesee.age + ')' : 'pas de pesée'],
        ['Indice de consommation', b.ic != null ? PP.nombre(b.ic, 2) : '—'],
        ['Aliment consommé', PP.kg(b.alimentKg, 0) + (b.sourceAliment === 'achete' ? ' (achats)' : '')],
        ['Aliment par poulet', b.alimentParPoulet != null ? PP.kg(b.alimentParPoulet, 2) : '—'],
        ['Coût total', PP.fcfa(b.coutTotal)],
        ['Coût par poulet', PP.fcfa(b.coutParPoulet)],
        ['Coût par kg vif', PP.fcfa(b.coutParKg)],
        ['Recettes des ventes', PP.fcfa(b.recettes)],
        ['Marge', PP.fcfa(b.marge)],
        ['Marge par poulet', PP.fcfa(b.margeParPoulet)],
        ['Trésorerie (encaissé - dépensé)', PP.fcfa(b.tresorerie)],
        ['Prix minimum par poulet restant', b.seuilParPoulet != null ? PP.fcfa(b.seuilParPoulet) : '—']
      ];
      var cw = (L - 6) / 3, chh = 13;
      for (var i = 0; i < k.length; i++) {
        var col = i % 3;
        if (col === 0) saut(chh + 2);
        var x = M + col * (cw + 3);
        doc.setFillColor(FOND[0], FOND[1], FOND[2]); doc.roundedRect(x, y, cw, chh, 2, 2, 'F');
        police('normal', 7.8); couleur(GRIS); doc.text(T(k[i][0]), x + 3, y + 4.6);
        var neg = /^-/.test(T(k[i][1])) && /Marge|Trésorerie/.test(k[i][0]);
        police('bold', 11); couleur(neg ? ROUGE : ENCRE); doc.text(T(k[i][1]), x + 3, y + 10.4);
        if (col === 2 || i === k.length - 1) y += chh + 3;
      }
      if (b.ic != null) paragraphe('Indice de consommation (IC) : ' + PP.nombre(b.ic, 2) + ' kg d’aliment pour faire 1 kg de poulet vivant (aliment consommé ÷ poids vif gagné' + (b.icDate ? ', au ' + PP.dateFr(b.icDate) : '') + ').', 8.5, GRIS);

      // Courbe de poids
      if (b.pesees.length) {
        titre('Poids moyen et repères');
        saut(66);
        var gx = M + 14, gw = L - 18, gy = y + 2, gh = 50;
        var xMax = Math.max(b.lot.ageVente, b.pesees[b.pesees.length - 1].age, 1);
        var rep = reg.repere.filter(function (p) { return p.age <= xMax; });
        var yMax = 0;
        b.pesees.forEach(function (p) { yMax = Math.max(yMax, p.g); });
        rep.forEach(function (p) { yMax = Math.max(yMax, p.g); });
        var gr = window.PPG ? window.PPG.graduations(yMax * 1.08, 4) : [0, yMax];
        yMax = gr[gr.length - 1] || 1;
        function X(v) { return gx + v / xMax * gw; }
        function Y(v) { return gy + gh - v / yMax * gh; }
        doc.setLineWidth(0.2); doc.setDrawColor(FILET[0], FILET[1], FILET[2]);
        police('normal', 7.5); couleur(GRIS);
        gr.forEach(function (v) { doc.line(gx, Y(v), gx + gw, Y(v)); doc.text(T(PP.nombre(v)), gx - 2, Y(v) + 1, { align: 'right' }); });
        for (var a = 0; a <= xMax; a += 7) doc.text(String(a), X(a), gy + gh + 4.5, { align: 'center' });
        doc.text('jours', gx + gw, gy + gh + 8.5, { align: 'right' });
        doc.text('g', gx - 2, gy - 2, { align: 'right' });
        if (rep.length > 1) {
          doc.setDrawColor(AMBRE[0], AMBRE[1], AMBRE[2]); doc.setLineWidth(0.6); doc.setLineDashPattern([1.6, 1.4], 0);
          for (var j = 1; j < rep.length; j++) doc.line(X(rep[j - 1].age), Y(rep[j - 1].g), X(rep[j].age), Y(rep[j].g));
          doc.setLineDashPattern([], 0);
        }
        doc.setDrawColor(VERT[0], VERT[1], VERT[2]); doc.setLineWidth(0.8);
        for (var q = 1; q < b.pesees.length; q++) doc.line(X(b.pesees[q - 1].age), Y(b.pesees[q - 1].g), X(b.pesees[q].age), Y(b.pesees[q].g));
        doc.setFillColor(VERT[0], VERT[1], VERT[2]);
        b.pesees.forEach(function (p) { doc.circle(X(p.age), Y(p.g), 1.1, 'F'); });
        y = gy + gh + 11;
        police('normal', 8.5); couleur(ENCRE);
        doc.setDrawColor(VERT[0], VERT[1], VERT[2]); doc.setLineWidth(0.8); doc.line(M, y - 1, M + 8, y - 1); doc.text('Vos pesées', M + 10, y);
        doc.setDrawColor(AMBRE[0], AMBRE[1], AMBRE[2]); doc.setLineDashPattern([1.6, 1.4], 0); doc.line(M + 40, y - 1, M + 48, y - 1); doc.setLineDashPattern([], 0);
        doc.text(T('Vos repères (indicatifs, à adapter)'), M + 50, y);
        y += 4;
      }

      // Tableaux
      function tableau(cols, lignes) {
        var hL = 6.4;
        function entete() {
          doc.setFillColor(FOND[0], FOND[1], FOND[2]); doc.rect(M, y, L, hL, 'F');
          police('bold', 8.5); couleur(ENCRE);
          var x = M; cols.forEach(function (c) { doc.text(T(c.t), c.d ? x + c.w - 2 : x + 2, y + 4.4, { align: c.d ? 'right' : 'left' }); x += c.w; });
          y += hL;
        }
        saut(hL * 2); entete();
        lignes.forEach(function (l, li) {
          if (saut(hL)) entete();
          police(l.gras ? 'bold' : 'normal', 8.5); couleur(ENCRE);
          var x = M;
          cols.forEach(function (c, ci) {
            var v = T(l[ci] == null ? '' : l[ci]);
            var w = doc.getTextWidth(v), max = c.w - 3;
            while (w > max && v.length > 3) { v = v.slice(0, -2) + '…'; v = v.replace(/……$/, '…'); w = doc.getTextWidth(v); }
            doc.text(v, c.d ? x + c.w - 2 : x + 2, y + 4.4, { align: c.d ? 'right' : 'left' });
            x += c.w;
          });
          y += hL;
          doc.setDrawColor(FILET[0], FILET[1], FILET[2]); doc.setLineWidth(0.15); doc.line(M, y, M + L, y);
        });
        y += 3;
      }
      titre('Dépenses par poste');
      var lignesDep = PP.CATEGORIES.filter(function (c) { return b.depenses[c.id] > 0; }).map(function (c) {
        return [c.nom, PP.fcfa(b.depenses[c.id]), b.coutTotal > 0 ? PP.pct(b.depenses[c.id] / b.coutTotal, 0) : '—'];
      });
      var total = ['Total', PP.fcfa(b.coutTotal), '100 %']; total.gras = true; lignesDep.push(total);
      tableau([{ t: 'Poste', w: 100 }, { t: 'Montant', w: 50, d: 1 }, { t: 'Part', w: L - 150, d: 1 }], lignesDep);
      if (b.achatAlimentKg > 0) paragraphe('Aliment acheté : ' + PP.kg(b.achatAlimentKg, 0) + ' pour ' + PP.fcfa(b.achatAlimentCout) + ' (' + PP.fcfa(b.prixKgAliment) + ' le kg).', 8.5, GRIS);

      var ventes = PP.trierOps(donnees.ops).filter(function (o) { return o.type === 'vente'; });
      if (ventes.length) {
        titre('Ventes');
        tableau([{ t: 'Date', w: 22 }, { t: 'Acheteur', w: 50 }, { t: 'Poulets', w: 18, d: 1 }, { t: 'Kg', w: 18, d: 1 }, { t: 'Prix', w: 28, d: 1 }, { t: 'Montant', w: 23, d: 1 }, { t: 'Encaissé', w: L - 159, d: 1 }],
          ventes.map(function (v) {
            return [PP.dateFr(v.date), v.acheteur || '', PP.nombre(PP.n(v.nb)), PP.n(v.kg) ? PP.nombreCourt(PP.n(v.kg), 1) : '',
              PP.fcfa(PP.n(v.prix)) + (v.mode === 'kg' ? '/kg' : ''), PP.fcfa(PP.montantVente(v)), PP.fcfa(PP.encaisseVente(v))];
          }));
        if (b.aRecevoir > 0) paragraphe('Reste à recevoir des clients : ' + PP.fcfa(b.aRecevoir) + '.', 9, ENCRE);
      }

      if (proj && b.lot.statut === 'en_cours' && proj.joursRestants > 0) {
        titre('Estimation à ' + proj.ageVente + ' jours (dans ' + proj.joursRestants + ' jours)');
        paragraphe('Ceci est une estimation : elle prolonge la tendance actuelle de vos saisies et change avec elles.', 8.5, GRIS);
        tableau([{ t: 'Estimation', w: 110 }, { t: 'Valeur', w: L - 110, d: 1 }], [
          ['Poulets restants', PP.nombre(Math.round(proj.vivantsFin))],
          ['Poids moyen', proj.poidsFinG != null ? PP.nombre(proj.poidsFinG) + ' g' : '—'],
          ['Aliment encore à donner', proj.alimentRestantKg != null ? PP.kg(proj.alimentRestantKg, 0) : '—'],
          ['Sacs à acheter', proj.sacsAAcheter != null ? PP.nombre(proj.sacsAAcheter) : '—'],
          ['Coût total en fin de lot', PP.fcfa(proj.coutFin) + (proj.complet ? '' : ' (sans le prix de l’aliment)')],
          ['Prix minimum par poulet', PP.fcfa(proj.seuilFin)],
          ['Recettes estimées', PP.fcfa(proj.recettesFin)],
          ['Marge estimée', PP.fcfa(proj.margeFin)]
        ]);
      }

      var aVerifier = (donnees.alertes || []).filter(function (a) { return a.niveau === 'attention'; });
      if (aVerifier.length) {
        titre('Points à vérifier');
        aVerifier.forEach(function (a) { paragraphe('• ' + a.texte, 9, ENCRE); });
      }

      titre('Comment lire ces chiffres');
      paragraphe('Coût par poulet = coût total ÷ poulets arrivés au bout (poussins - morts). Marge = recettes - coût total. ' +
        'Prix minimum par poulet restant = (coût total - recettes déjà faites) ÷ poulets restants : en dessous, le lot perd de l’argent. ' +
        'Trésorerie = argent reçu des clients - dépenses du lot.', 8.5, GRIS);

      // Pied de page
      var nb = doc.getNumberOfPages();
      for (var p = 1; p <= nb; p++) {
        doc.setPage(p);
        doc.setDrawColor(FILET[0], FILET[1], FILET[2]); doc.setLineWidth(0.2); doc.line(M, 287, 210 - M, 287);
        police('normal', 7.5); couleur(GRIS);
        doc.text(T('PouletPilot · outil de gestion, pas un avis vétérinaire : pour la santé des poulets, consultez un vétérinaire.'), M, 291.5);
        doc.text(p + ' / ' + nb, 210 - M, 291.5, { align: 'right' });
      }
      var blob = doc.output('blob');
      return { blob: blob, nom: donnees.nomFichier || 'rapport-lot.pdf', pages: nb };
    });
  }

  // ---------- Fichiers : télécharger ou partager ----------
  function nomFichier(base, ext) {
    var s = String(base || 'pouletpilot').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'pouletpilot';
    return s + '.' + ext;
  }
  function telecharger(blob, nom) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nom; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }
  function peutPartager(blob, nom) {
    try {
      if (!navigator.share || !navigator.canShare || typeof File === 'undefined') return false;
      return navigator.canShare({ files: [new File([blob], nom, { type: blob.type })] });
    } catch (e) { return false; }
  }
  function partager(blob, nom, titre) {
    var f = new File([blob], nom, { type: blob.type });
    return navigator.share({ files: [f], title: titre || nom });
  }

  window.PPRapport = { pdfLot: pdfLot, chargerJsPDF: chargerJsPDF, texte: T, nomFichier: nomFichier, telecharger: telecharger, peutPartager: peutPartager, partager: partager };
})();
