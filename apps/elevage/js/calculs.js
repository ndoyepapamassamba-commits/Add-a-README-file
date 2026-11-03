/* Carnet Élevage — tous les calculs (sans écran). Marche dans le navigateur (window.CE) et dans Node (tests).
   Montants en F CFA entiers ; poids en kg ; dates AAAA-MM-JJ.
   L'application calcule à partir de ce que l'éleveur saisit : elle ne prescrit ni ration ni traitement. */
(function (racine) {
  'use strict';
  var U = racine.TU || (typeof require === 'function' ? require('./ui.js') : null);
  var n = U.n, jour = U.jour;

  var ESPECES = {
    mouton: { id: 'mouton', nom: 'Mouton', emoji: '🐑', male: 'bélier', femelle: 'brebis', petit: 'agneau', gestation: 150, marge: 5 },
    chevre: { id: 'chevre', nom: 'Chèvre', emoji: '🐐', male: 'bouc', femelle: 'chèvre', petit: 'chevreau', gestation: 150, marge: 5 },
    bovin: { id: 'bovin', nom: 'Bovin', emoji: '🐄', male: 'taureau', femelle: 'vache', petit: 'veau', gestation: 283, marge: 10 }
  };
  var CATEGORIES = [
    { id: 'berger', nom: 'Berger' }, { id: 'eau', nom: 'Eau' }, { id: 'transport', nom: 'Transport' },
    { id: 'soins', nom: 'Soins (montant payé)' }, { id: 'abri', nom: 'Abri, matériel' }, { id: 'autre', nom: 'Autre' }
  ];
  var MOTIFS = { vente: 'Vendu', mort: 'Mort', autre: 'Sorti (don, fête, consommé…)' };
  var COEF_DEFAUT = 80;               // formule de Crevat : poids (kg) ≈ 80 × (tour de poitrine en m)³
  var TABASKI_DEFAUT = '2027-05-16';  // date indicative de la Tabaski 2027, à confirmer (lune)
  var ANNEE_LUNAIRE = 354;            // l'Aïd revient environ 11 jours plus tôt chaque année
  var LIMITE_GRATUITE = 10;

  function reglagesComplets(r) {
    r = r || {};
    var coef = r.coef || {}, gest = r.gestation || {};
    return {
      coef: { mouton: n(coef.mouton) > 0 ? coef.mouton : COEF_DEFAUT, chevre: n(coef.chevre) > 0 ? coef.chevre : COEF_DEFAUT, bovin: n(coef.bovin) > 0 ? coef.bovin : COEF_DEFAUT },
      gestation: { mouton: n(gest.mouton) > 0 ? gest.mouton : 150, chevre: n(gest.chevre) > 0 ? gest.chevre : 150, bovin: n(gest.bovin) > 0 ? gest.bovin : 283 },
      tabaski: U.dateValide(r.tabaski) ? r.tabaski : null,
      tabaskiConfirmee: !!r.tabaskiConfirmee,
      margeVisee: U.estNombre(r.margeVisee) && r.margeVisee >= 0 ? Math.round(r.margeVisee) : 25000,
      especeDefaut: ESPECES[r.especeDefaut] ? r.especeDefaut : 'mouton'
    };
  }

  // ---------- Poids estimé au ruban (indicatif) ----------
  function estimerPoids(tourCm, coef) {
    var t = n(tourCm) / 100;
    if (!(t > 0)) return null;
    return Math.round((n(coef) > 0 ? coef : COEF_DEFAUT) * t * t * t * 10) / 10;
  }
  // Coefficient ajusté à vos animaux : médiane de poids ÷ (tour en m)³ sur vos pesées à la balance avec tour mesuré
  function coefDepuisPesees(pesees) {
    var l = (pesees || []).filter(function (p) { return p.methode !== 'ruban' && n(p.kg) > 0 && n(p.tourCm) >= 30; })
      .map(function (p) { var t = p.tourCm / 100; return p.kg / (t * t * t); });
    if (l.length < 3) return { coef: null, nb: l.length };
    return { coef: Math.round(U.mediane(l) * 10) / 10, nb: l.length };
  }

  // ---------- Tabaski ----------
  function dateTabaski(reglages, auj) {
    var r = reglagesComplets(reglages);
    if (r.tabaski && jour(r.tabaski) >= jour(auj)) return { date: r.tabaski, confirmee: r.tabaskiConfirmee, source: 'vous', jours: U.ecartJours(auj, r.tabaski) };
    var d = r.tabaski || TABASKI_DEFAUT;
    while (jour(d) < jour(auj)) d = U.ajouterJours(d, ANNEE_LUNAIRE);
    return { date: d, confirmee: false, source: d === TABASKI_DEFAUT ? 'defaut' : 'estimation', jours: U.ecartJours(auj, d) };
  }

  // ---------- Reproduction ----------
  function miseBasPrevue(s, reglages) {
    var r = reglagesComplets(reglages), esp = ESPECES[s.espece] || ESPECES.mouton;
    var g = r.gestation[esp.id], d = U.ajouterJours(s.date, g);
    return { date: d, min: U.ajouterJours(d, -esp.marge), max: U.ajouterJours(d, esp.marge), gestation: g };
  }
  function etatSaillie(s, reglages, auj) {
    if (s.miseBas && s.miseBas.date) return 'faite';
    if (s.echec) return 'echec';
    var p = miseBasPrevue(s, reglages), k = U.ecartJours(auj, p.date);
    if (U.ecartJours(auj, p.max) < 0) return 'depassee';
    if (k <= 14) return 'proche';
    return 'attente';
  }

  // ---------- Grouper les enregistrements ----------
  var TYPES = ['lot', 'animal', 'pesee', 'aliment', 'achat', 'inventaire', 'ration', 'depense', 'saillie'];
  function grouper(recs) {
    var D = {}; TYPES.forEach(function (t) { D[t] = []; });
    (recs || []).forEach(function (r) { if (r && D[r.type]) D[r.type].push(r); });
    return D;
  }
  function parDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : n(a.cree) - n(b.cree); }

  // Présence d'un animal : de l'arrivée au jour de sortie compris (ou aujourd'hui)
  function bornes(a, jAuj) {
    return { e: jour(a.dateEntree), f: a.sortie && a.sortie.date ? jour(a.sortie.date) : jAuj };
  }
  function presentLe(a, j) { var e = jour(a.dateEntree); return e <= j && (!(a.sortie && a.sortie.date) || j <= jour(a.sortie.date)); }

  // Prix du kg de chaque aliment : moyenne pondérée de vos achats, sinon le prix que vous avez indiqué
  function prixAliments(D) {
    var P = {};
    D.aliment.forEach(function (al) { P[al.id] = { kg: 0, f: 0 }; });
    D.achat.forEach(function (ac) { var p = P[ac.alimentId]; if (p && n(ac.kg) > 0) { p.kg += n(ac.kg); p.f += n(ac.prix); } });
    var out = {};
    D.aliment.forEach(function (al) {
      var p = P[al.id];
      if (p.kg > 0) out[al.id] = { prix: p.f / p.kg, source: 'achats' };
      else if (n(al.prixKg) > 0) out[al.id] = { prix: al.prixKg, source: 'vous' };
      else out[al.id] = { prix: null, source: null };
    });
    return out;
  }
  function coutRation(r, prix) {
    var c = 0, manque = false, kgT = 0;
    (r && r.lignes || []).forEach(function (l) {
      var p = prix[l.alimentId];
      kgT += n(l.kg);
      if (p && p.prix != null) c += n(l.kg) * p.prix; else if (n(l.kg) > 0) manque = true;
    });
    return { cout: c, manque: manque, kg: kgT };
  }
  // Périodes de ration d'un lot : chaque ration vaut de sa date de début jusqu'à la veille de la suivante
  function periodes(D, prix) {
    var parLot = {};
    D.ration.slice().sort(function (a, b) { return a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : n(a.cree) - n(b.cree); }).forEach(function (r) {
      (parLot[r.lotId] || (parLot[r.lotId] = [])).push(r);
    });
    var out = {};
    Object.keys(parLot).forEach(function (lotId) {
      var l = parLot[lotId];
      out[lotId] = l.map(function (r, i) {
        var c = coutRation(r, prix);
        return { ration: r, d: jour(r.debut), f: i + 1 < l.length ? jour(l[i + 1].debut) - 1 : Infinity, cout: c.cout, manque: c.manque, kg: c.kg };
      }).filter(function (p) { return p.f >= p.d; });
    });
    return out;
  }
  function chevauchement(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0) + 1); }

  // Aliment d'un animal entre deux jours (inclus) : coût et kg par aliment
  function alimentAnimal(a, pers, jAuj, w0, w1) {
    var b = bornes(a, jAuj), cout = 0, kgs = {};
    (pers[a.lotId] || []).forEach(function (p) {
      var k = chevauchement(b.e, b.f, Math.max(p.d, w0), Math.min(p.f, w1));
      if (!k) return;
      cout += k * p.cout;
      (p.ration.lignes || []).forEach(function (l) { kgs[l.alimentId] = (kgs[l.alimentId] || 0) + k * n(l.kg); });
    });
    return { cout: cout, kgs: kgs };
  }
  function rationDuJour(pers, lotId, j) {
    var l = pers[lotId] || [];
    for (var i = l.length - 1; i >= 0; i--) if (l[i].d <= j && j <= l[i].f) return l[i];
    return null;
  }

  // Dépenses partagées : une dépense commune est partagée à parts égales entre les animaux présents ce jour-là
  function repartirDepenses(D) {
    var parAnimal = {}, nonRep = [];
    var ordre = D.animal.slice().sort(function (a, b) { return a.dateEntree < b.dateEntree ? -1 : a.dateEntree > b.dateEntree ? 1 : (a.id < b.id ? -1 : 1); });
    var idx = {}; D.animal.forEach(function (a) { idx[a.id] = a; });
    D.depense.forEach(function (d) {
      var benef;
      if (d.cible === 'animal') benef = idx[d.cibleId] ? [idx[d.cibleId]] : [];
      else {
        var j = jour(d.date);
        benef = ordre.filter(function (a) { return (d.cible !== 'lot' || a.lotId === d.cibleId) && presentLe(a, j); });
      }
      if (!benef.length) { nonRep.push(d); return; }
      var parts = U.repartir(n(d.montant), benef.map(function () { return 1; }));
      benef.forEach(function (a, i) { (parAnimal[a.id] || (parAnimal[a.id] = [])).push({ dep: d, montant: parts[i], date: d.date, categorie: d.categorie }); });
    });
    return { parAnimal: parAnimal, nonReparti: nonRep };
  }

  function statut(a) { return !a.sortie || !a.sortie.date ? 'present' : (a.sortie.motif === 'vente' ? 'vendu' : a.sortie.motif === 'mort' ? 'mort' : 'autre'); }

  // ---------- Analyse complète ----------
  function analyser(recs, reglages, auj) {
    var D = Array.isArray(recs) ? grouper(recs) : recs;
    var R = reglagesComplets(reglages), jAuj = jour(auj);
    var prix = prixAliments(D), pers = periodes(D, prix), dep = repartirDepenses(D);
    var pesees = {};
    D.pesee.slice().sort(parDate).forEach(function (p) { (pesees[p.animalId] || (pesees[p.animalId] = [])).push(p); });

    var animaux = {};
    D.animal.forEach(function (a) {
      var b = bornes(a, jAuj), st = statut(a);
      var al = alimentAnimal(a, pers, jAuj, -Infinity, Infinity);
      var allocs = dep.parAnimal[a.id] || [], frais = 0, fraisCat = {};
      allocs.forEach(function (x) { frais += x.montant; fraisCat[x.categorie] = (fraisCat[x.categorie] || 0) + x.montant; });
      var aliment = Math.round(al.cout), prixAchat = Math.round(n(a.prixAchat));
      var cout = prixAchat + aliment + frais;
      var vente = st === 'vendu' ? Math.round(n(a.sortie.prix)) : null;
      var ps = pesees[a.id] || [];
      var B = {
        id: a.id, animal: a, statut: st, present: st === 'present', jours: Math.max(0, b.f - b.e + 1),
        prixAchat: prixAchat, aliment: aliment, frais: frais, fraisCat: fraisCat, coutTotal: cout,
        vente: vente, marge: vente != null ? vente - cout : (st === 'mort' || st === 'autre' ? -cout : null),
        pesees: ps, poidsActuel: ps.length ? n(ps[ps.length - 1].kg) : null, datePoids: ps.length ? ps[ps.length - 1].date : null,
        gainKg: null, gmq: null, gmqRecent: null, coutPeriode: null, coutKgGagne: null,
        coutJourAliment: 0, rationManque: false, fraisJour: 0
      };
      if (ps.length >= 2) {
        var p0 = ps[0], pn = ps[ps.length - 1], dj = U.ecartJours(p0.date, pn.date);
        B.gainKg = Math.round((n(pn.kg) - n(p0.kg)) * 10) / 10;
        if (dj > 0) B.gmq = Math.round((n(pn.kg) - n(p0.kg)) / dj * 1000);
        var pa = ps[ps.length - 2], dr = U.ecartJours(pa.date, pn.date);
        if (dr > 0) B.gmqRecent = Math.round((n(pn.kg) - n(pa.kg)) / dr * 1000);
        if (dj > 0) {
          var w0 = jour(p0.date), w1 = jour(pn.date) - 1;
          var cp = alimentAnimal(a, pers, jAuj, w0, w1).cout;
          allocs.forEach(function (x) { var j = jour(x.date); if (j >= w0 && j <= w1) cp += x.montant; });
          B.coutPeriode = Math.round(cp);
          if (B.gainKg > 0) B.coutKgGagne = Math.round(cp / B.gainKg);
        }
      }
      if (B.present) {
        var rj = rationDuJour(pers, a.lotId, jAuj);
        B.coutJourAliment = rj ? rj.cout : 0;
        B.rationManque = !!(rj && rj.manque);
        B.rationAbsente = !rj;
        B.fraisJour = B.jours > 0 ? frais / B.jours : 0;
      }
      animaux[a.id] = B;
    });

    // Lots
    var lots = {};
    D.lot.forEach(function (l) {
      lots[l.id] = { id: l.id, lot: l, ids: [], nbTotal: 0, nbPresents: 0, nbVendus: 0, nbMorts: 0, nbAutres: 0, achat: 0, aliment: 0, frais: 0,
        fraisNonRepartis: 0, fraisCat: {}, ventes: 0, margeVendus: 0, coutVendus: 0, sommeGmq: 0, nbGmq: 0, coutPeriode: 0, gainKg: 0,
        coutJour: 0, sommePoids: 0, nbPoids: 0, rationJour: null };
    });
    D.animal.forEach(function (a) {
      var L = lots[a.lotId], B = animaux[a.id];
      if (!L) return;
      L.ids.push(a.id); L.nbTotal++;
      if (B.statut === 'present') L.nbPresents++; else if (B.statut === 'vendu') L.nbVendus++; else if (B.statut === 'mort') L.nbMorts++; else L.nbAutres++;
      L.achat += B.prixAchat; L.aliment += B.aliment; L.frais += B.frais;
      Object.keys(B.fraisCat).forEach(function (k) { L.fraisCat[k] = (L.fraisCat[k] || 0) + B.fraisCat[k]; });
      if (B.vente != null) { L.ventes += B.vente; L.margeVendus += B.marge; L.coutVendus += B.coutTotal; }
      if (B.gmq != null) { L.sommeGmq += B.gmq; L.nbGmq++; }
      if (B.coutKgGagne != null) { L.coutPeriode += B.coutPeriode; L.gainKg += B.gainKg; }
      if (B.present) { L.coutJour += B.coutJourAliment; if (B.poidsActuel != null) { L.sommePoids += B.poidsActuel; L.nbPoids++; } }
    });
    dep.nonReparti.forEach(function (d) {
      if (d.cible === 'lot' && lots[d.cibleId]) { lots[d.cibleId].fraisNonRepartis += Math.round(n(d.montant)); lots[d.cibleId].fraisCat[d.categorie] = (lots[d.cibleId].fraisCat[d.categorie] || 0) + Math.round(n(d.montant)); }
    });
    Object.keys(lots).forEach(function (k) {
      var L = lots[k];
      L.coutTotal = L.achat + L.aliment + L.frais + L.fraisNonRepartis;
      L.resultat = L.ventes - L.coutTotal;
      L.coutMoyen = L.nbTotal ? Math.round(L.coutTotal / L.nbTotal) : null;
      L.gmqMoyen = L.nbGmq ? Math.round(L.sommeGmq / L.nbGmq) : null;
      L.coutKgGagne = L.gainKg > 0 ? Math.round(L.coutPeriode / L.gainKg) : null;
      L.poidsMoyen = L.nbPoids ? Math.round(L.sommePoids / L.nbPoids * 10) / 10 : null;
      var rj = rationDuJour(pers, k, jAuj);
      L.rationJour = rj ? { ration: rj.ration, cout: rj.cout, manque: rj.manque, kg: rj.kg } : null;
    });

    // Stock d'aliment
    var stock = {};
    D.aliment.forEach(function (al) {
      function conso(w0, w1) {
        var t = 0;
        D.animal.forEach(function (a) { var k = alimentAnimal(a, pers, jAuj, w0, w1).kgs[al.id]; if (k) t += k; });
        return t;
      }
      var achats = D.achat.filter(function (x) { return x.alimentId === al.id; });
      var invs = D.inventaire.filter(function (x) { return x.alimentId === al.id; }).sort(parDate);
      var achatsKg = 0, achatsF = 0;
      achats.forEach(function (x) { achatsKg += n(x.kg); achatsF += Math.round(n(x.prix)); });
      var base = 0, depuis = -Infinity, ecart = null, inv = invs.length ? invs[invs.length - 1] : null;
      if (inv) {
        var jI = jour(inv.date), avant = invs.length > 1 ? invs[invs.length - 2] : null;
        var b0 = avant ? n(avant.kg) : 0, d0 = avant ? jour(avant.date) : -Infinity;
        var theo = b0;
        achats.forEach(function (x) { var j = jour(x.date); if (j > d0 && j <= jI) theo += n(x.kg); });
        theo -= conso(d0 + 1, jI);
        ecart = Math.round((n(inv.kg) - theo) * 10) / 10;
        base = n(inv.kg); depuis = jI;
      }
      var s = base;
      achats.forEach(function (x) { if (jour(x.date) > depuis) s += n(x.kg); });
      s -= conso(depuis + 1, jAuj);
      var consoJour = 0;
      D.animal.forEach(function (a) {
        if (statut(a) !== 'present' || jour(a.dateEntree) > jAuj) return;
        var rj = rationDuJour(pers, a.lotId, jAuj);
        if (rj) (rj.ration.lignes || []).forEach(function (l) { if (l.alimentId === al.id) consoJour += n(l.kg); });
      });
      var p = prix[al.id];
      stock[al.id] = {
        id: al.id, aliment: al, prixKg: p.prix, sourcePrix: p.source, achatsKg: achatsKg, achatsF: achatsF,
        consoTotaleKg: Math.round(conso(-Infinity, jAuj) * 10) / 10, stockKg: Math.round(s * 10) / 10,
        valeur: p.prix != null ? Math.round(Math.max(0, s) * p.prix) : null, consoJour: Math.round(consoJour * 100) / 100,
        joursRestants: consoJour > 0 ? Math.floor(Math.max(0, s) / consoJour) : null, inventaire: inv, ecart: ecart
      };
    });

    // Totaux
    var G = { nbPresents: 0, nbTotal: 0, nbVendus: 0, coutPresents: 0, ventes: 0, coutTotal: 0, margeVendus: 0, coutJour: 0, valeurStock: 0, fraisNonRepartis: 0 };
    Object.keys(animaux).forEach(function (k) {
      var B = animaux[k]; G.nbTotal++; G.coutTotal += B.coutTotal;
      if (B.present) { G.nbPresents++; G.coutPresents += B.coutTotal; G.coutJour += B.coutJourAliment; }
      if (B.vente != null) { G.nbVendus++; G.ventes += B.vente; G.margeVendus += B.marge; }
    });
    dep.nonReparti.forEach(function (d) { G.fraisNonRepartis += Math.round(n(d.montant)); });
    G.coutTotal += G.fraisNonRepartis;
    G.resultat = G.ventes - G.coutTotal;
    Object.keys(stock).forEach(function (k) { G.valeurStock += n(stock[k].valeur); });

    return { aujourdhui: auj, reglages: R, D: D, prix: prix, animaux: animaux, lots: lots, stock: stock, global: G, nonReparti: dep.nonReparti };
  }

  // ---------- Prix de vente visé ----------
  // cout à la date de vente = coût à ce jour + jours restants × (ration du jour + frais moyens par jour)
  // prix visé = coût prévu + marge voulue (en F) ou coût prévu × (1 + marge en %)
  function prixVise(B, auj, dateVente, marge, enPct) {
    var jr = Math.max(0, U.ecartJours(auj, dateVente));
    var parJour = B.present ? n(B.coutJourAliment) + n(B.fraisJour) : 0;
    var coutPrevu = Math.round(B.coutTotal + jr * parJour);
    var prix = enPct ? Math.ceil(coutPrevu * (1 + n(marge) / 100)) : coutPrevu + Math.round(n(marge));
    return { joursRestants: jr, coutJour: parJour, coutPrevu: coutPrevu, prix: prix, gain: prix - coutPrevu };
  }
  function prixViseLot(A, lotId, auj, dateVente, marge, enPct) {
    var L = A.lots[lotId], tot = 0, totCout = 0, nb = 0;
    if (!L) return null;
    L.ids.forEach(function (id) {
      var B = A.animaux[id]; if (!B.present) return;
      var p = prixVise(B, auj, dateVente, marge, enPct); tot += p.prix; totCout += p.coutPrevu; nb++;
    });
    var nonRep = L.fraisNonRepartis && nb ? Math.ceil(L.fraisNonRepartis / nb) : 0;
    return { nb: nb, coutPrevu: totCout, total: tot, moyen: nb ? Math.ceil(tot / nb) + nonRep : null };
  }

  // ---------- Limite gratuite ----------
  function nbComptes(animaux) { return (animaux || []).filter(function (a) { return statut(a) === 'present' && !a.exemple; }).length; }
  function peutAjouterAnimal(animaux, premium) { return !!premium || nbComptes(animaux) < LIMITE_GRATUITE; }

  // ---------- Messages WhatsApp (envoyés par l'utilisateur lui-même) ----------
  function nomAnimal(a) {
    var e = ESPECES[a.espece] || ESPECES.mouton;
    return (a.sexe === 'F' ? e.femelle : a.sexe === 'M' ? e.male : e.nom.toLowerCase()) + ' « ' + a.nom + ' »';
  }
  function messageAnnonce(a, B, prix) {
    var t = 'À vendre : ' + nomAnimal(a) + (a.race ? ' (' + a.race + ')' : '') + '.';
    if (B && B.poidsActuel != null) t += '\nPoids : ' + U.kg(B.poidsActuel) + ' (le ' + U.dateFr(B.datePoids) + ').';
    if (n(prix) > 0) t += '\nPrix : ' + U.fcfa(prix) + '.';
    return t + '\nÉcrivez-moi ou appelez-moi pour le voir.';
  }
  function messageLot(L, auj, tab) {
    var t = 'Lot « ' + L.lot.nom + ' » au ' + U.dateFr(auj) + ' :\n' +
      '- ' + U.pluriel(L.nbPresents, 'animal présent', 'animaux présents') + (L.nbVendus ? ', ' + U.pluriel(L.nbVendus, 'vendu') : '') + '\n' +
      '- Dépensé : ' + U.fcfa(L.coutTotal) + '\n' + '- Ventes : ' + U.fcfa(L.ventes) + '\n';
    if (L.gmqMoyen != null) t += '- Gain moyen : ' + U.nombre(L.gmqMoyen) + ' g par jour\n';
    if (tab && tab.jours >= 0) t += '- Tabaski dans ' + U.pluriel(tab.jours, 'jour') + (tab.confirmee ? '' : ' (date à confirmer)') + '\n';
    return t + '(Carnet Élevage)';
  }
  function messageMiseBas(s, nomFemelle, p) {
    return 'Rappel : mise-bas attendue pour ' + nomFemelle + ' vers le ' + U.dateFr(p.date) +
      ' (entre le ' + U.dateFr(p.min) + ' et le ' + U.dateFr(p.max) + ', date approximative). Saillie du ' + U.dateFr(s.date) + '.';
  }

  // ---------- Sauvegarde ----------
  function validerSauvegarde(obj) {
    if (!obj || !Array.isArray(obj.recs)) return { ok: false, erreur: 'Sauvegarde incomplète : rien à restaurer.' };
    var recs = obj.recs.filter(function (r) { return r && typeof r.id === 'string' && TYPES.indexOf(r.type) >= 0; });
    var photos = Array.isArray(obj.photos) ? obj.photos.filter(function (p) { return p && typeof p.id === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p.grande || ''); }) : [];
    var nbA = recs.filter(function (r) { return r.type === 'animal'; }).length;
    return { ok: true, recs: recs, photos: photos, kv: { reglages: reglagesComplets(obj.reglages) },
      resume: U.pluriel(nbA, 'animal', 'animaux') + ', ' + U.pluriel(recs.length, 'enregistrement') + (photos.length ? ', ' + U.pluriel(photos.length, 'photo') : '') };
  }

  // ---------- Exemple ----------
  function exemple(auj, nouvelId) {
    var id = nouvelId || U.nouvelId, recs = [], k = 0;
    function r(o) { o.id = id(); o.exemple = true; o.cree = 1 + (k++); recs.push(o); return o; }
    var d0 = U.ajouterJours(auj, -60);
    var lot = r({ type: 'lot', nom: 'Exemple : embouche Tabaski', debut: d0, note: 'Données d’exemple, à supprimer quand vous voulez.' });
    var son = r({ type: 'aliment', nom: 'Son de blé (exemple)' });
    var fane = r({ type: 'aliment', nom: 'Fane d’arachide (exemple)' });
    var tourteau = r({ type: 'aliment', nom: 'Tourteau (exemple)' });
    r({ type: 'achat', alimentId: son.id, date: d0, quantite: 10, unite: 'sac', kgParUnite: 40, kg: 400, prix: 90000, fournisseur: 'Marché (exemple)' });
    r({ type: 'achat', alimentId: fane.id, date: d0, quantite: 20, unite: 'botte', kgParUnite: 25, kg: 500, prix: 60000, fournisseur: '' });
    r({ type: 'achat', alimentId: tourteau.id, date: U.ajouterJours(d0, 20), quantite: 3, unite: 'sac', kgParUnite: 50, kg: 150, prix: 45000, fournisseur: '' });
    r({ type: 'ration', lotId: lot.id, debut: d0, lignes: [{ alimentId: son.id, kg: 0.5 }, { alimentId: fane.id, kg: 1 }] });
    r({ type: 'ration', lotId: lot.id, debut: U.ajouterJours(d0, 21), lignes: [{ alimentId: son.id, kg: 0.6 }, { alimentId: fane.id, kg: 1 }, { alimentId: tourteau.id, kg: 0.3 }] });
    var a1 = r({ type: 'animal', lotId: lot.id, nom: 'Bandit', espece: 'mouton', sexe: 'M', race: 'Touabire', origine: 'achat', dateEntree: d0, prixAchat: 95000 });
    var a2 = r({ type: 'animal', lotId: lot.id, nom: 'Ndiaga', espece: 'mouton', sexe: 'M', race: 'Peul-peul', origine: 'achat', dateEntree: d0, prixAchat: 70000 });
    var a3 = r({ type: 'animal', lotId: lot.id, nom: 'Gris', espece: 'mouton', sexe: 'M', race: '', origine: 'achat', dateEntree: U.ajouterJours(d0, 7), prixAchat: 65000 });
    var a4 = r({ type: 'animal', lotId: lot.id, nom: 'Bella', espece: 'mouton', sexe: 'F', race: 'Ladoum', origine: 'achat', dateEntree: d0, prixAchat: 120000 });
    [[a1, [[0, 38, 82], [21, 43.5, 0], [42, 48, 0], [60, 52, 0]]], [a2, [[0, 32, 76], [21, 36, 0], [42, 39.5, 0], [60, 42.5, 0]]],
      [a3, [[7, 30, 0], [28, 33.5, 0], [49, 37, 0]]], [a4, [[0, 45, 86], [30, 48, 0]]]].forEach(function (x) {
      x[1].forEach(function (p) { r({ type: 'pesee', animalId: x[0].id, date: U.ajouterJours(d0, p[0]), kg: p[1], tourCm: p[2] || null, methode: 'balance' }); });
    });
    a3.sortie = { date: U.ajouterJours(d0, 50), motif: 'vente', prix: 110000, acheteur: 'Client du marché (exemple)' };
    r({ type: 'depense', date: d0, categorie: 'transport', montant: 15000, libelle: 'Transport depuis le marché', cible: 'lot', cibleId: lot.id });
    r({ type: 'depense', date: U.ajouterJours(d0, 30), categorie: 'berger', montant: 30000, libelle: 'Berger, 1 mois', cible: 'lot', cibleId: lot.id });
    r({ type: 'depense', date: U.ajouterJours(d0, 45), categorie: 'soins', montant: 6000, libelle: 'Visite (montant payé)', cible: 'animal', cibleId: a2.id });
    r({ type: 'saillie', femelleId: a4.id, femelleNom: a4.nom, espece: 'mouton', date: U.ajouterJours(d0, 20), male: 'Bélier du voisin', note: '' });
    return recs;
  }

  var CE = {
    ESPECES: ESPECES, CATEGORIES: CATEGORIES, MOTIFS: MOTIFS, COEF_DEFAUT: COEF_DEFAUT, TABASKI_DEFAUT: TABASKI_DEFAUT, LIMITE_GRATUITE: LIMITE_GRATUITE,
    reglagesComplets: reglagesComplets, estimerPoids: estimerPoids, coefDepuisPesees: coefDepuisPesees, dateTabaski: dateTabaski,
    miseBasPrevue: miseBasPrevue, etatSaillie: etatSaillie, grouper: grouper, statut: statut, analyser: analyser, prixAliments: prixAliments,
    prixVise: prixVise, prixViseLot: prixViseLot, nbComptes: nbComptes, peutAjouterAnimal: peutAjouterAnimal,
    nomAnimal: nomAnimal, messageAnnonce: messageAnnonce, messageLot: messageLot, messageMiseBas: messageMiseBas,
    validerSauvegarde: validerSauvegarde, exemple: exemple, presentLe: presentLe
  };
  if (typeof module === 'object' && module.exports) module.exports = CE;
  else racine.CE = CE;
})(typeof self !== 'undefined' ? self : this);
