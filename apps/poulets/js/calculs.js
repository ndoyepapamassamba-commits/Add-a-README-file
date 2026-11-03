/* PouletPilot — calculs de l'élevage (aucune dépendance, aucun envoi de données).
   Fonctionne dans le navigateur (window.PP) et dans Node (require) pour les tests.
   Toutes les fonctions sont déterministes : mêmes données → mêmes résultats. */
(function (racine) {
  'use strict';
  var JOUR_MS = 86400000;

  // ---------- Nombres ----------
  function n(x) { x = Number(x); return isFinite(x) ? x : 0; }
  function estNombre(x) { return typeof x === 'number' && isFinite(x); }
  // Lit « 1 850,5 », « 1850.5 », « 2 000 F » → nombre ; NaN si illisible
  function lireNombre(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var s = String(v == null ? '' : v).trim().replace(/[\s  ]/g, '').replace(/(fcfa|f|kg|g|l)$/i, '');
    if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return parseFloat(s);
  }
  function arrondi(x, dec) {
    if (!estNombre(x)) return x;
    var p = Math.pow(10, dec || 0);
    return Math.round((x + (x >= 0 ? 1 : -1) * Number.EPSILON * Math.abs(x)) * p) / p;
  }
  function grouper(ent) { return ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  // nombre(1850.5, 1) → « 1 850,5 » ; décimales fixes ; « — » si inconnu
  function nombre(x, dec) {
    if (!estNombre(x)) return '—';
    dec = dec || 0;
    var r = arrondi(x, dec);
    if (r === 0) r = 0; // pas de « -0 »
    var s = Math.abs(r).toFixed(dec).split('.');
    return (r < 0 ? '-' : '') + grouper(s[0]) + (s[1] ? ',' + s[1] : '');
  }
  // Comme nombre() mais sans zéros inutiles : 2,50 → 2,5 ; 3,00 → 3
  function nombreCourt(x, dec) {
    var s = nombre(x, dec);
    return s.indexOf(',') >= 0 ? s.replace(/0+$/, '').replace(/,$/, '') : s;
  }
  function fcfa(x) { return estNombre(x) ? nombre(Math.round(x), 0) + ' F' : '—'; }
  function pct(x, dec) { return estNombre(x) ? nombre(x * 100, dec == null ? 1 : dec) + ' %' : '—'; }
  function kg(x, dec) { return estNombre(x) ? nombreCourt(x, dec == null ? 1 : dec) + ' kg' : '—'; }

  // ---------- Dates (chaînes AAAA-MM-JJ, calculs en UTC pour éviter les décalages d'heure) ----------
  function deux(x) { return (x < 10 ? '0' : '') + x; }
  function dateISO(d) { d = d || new Date(); return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }
  function versUTC(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  }
  function dateValide(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) && isFinite(versUTC(iso)); }
  function diffJours(a, b) { return Math.round((versUTC(b) - versUTC(a)) / JOUR_MS); }
  function ajouterJours(iso, k) {
    var t = new Date(versUTC(iso) + k * JOUR_MS);
    return t.getUTCFullYear() + '-' + deux(t.getUTCMonth() + 1) + '-' + deux(t.getUTCDate());
  }
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function dateFr(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function dateCourte(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? (+m[3]) + ' ' + MOIS_COURTS[+m[2] - 1] : ''; }

  // ---------- Repères de poids (modifiables par l'éleveur) ----------
  // Valeurs de départ PUREMENT INDICATIVES, à adapter à la souche, à l'aliment et au climat.
  var REPERE_DEFAUT = [
    { age: 0, g: 40 }, { age: 7, g: 160 }, { age: 14, g: 400 }, { age: 21, g: 800 },
    { age: 28, g: 1250 }, { age: 35, g: 1750 }, { age: 42, g: 2200 }, { age: 49, g: 2600 }
  ];
  function normaliserRepere(t) {
    var parAge = {};
    (Array.isArray(t) ? t : []).forEach(function (p) {
      var a = lireNombre(p && p.age), g = lireNombre(p && p.g);
      if (estNombre(a) && estNombre(g) && a >= 0 && a <= 120 && g > 0) parAge[Math.round(a)] = g;
    });
    return Object.keys(parAge).map(Number).sort(function (x, y) { return x - y; }).map(function (a) { return { age: a, g: parAge[a] }; });
  }
  // Poids repère à un âge donné (interpolation linéaire entre deux points) ; null hors du tableau
  function repereA(table, age) {
    var t = normaliserRepere(table);
    if (!t.length || !estNombre(age) || age < t[0].age || age > t[t.length - 1].age) return null;
    for (var i = 0; i < t.length; i++) {
      if (t[i].age === age) return t[i].g;
      if (t[i].age > age) {
        var a = t[i - 1], b = t[i];
        return a.g + (b.g - a.g) * (age - a.age) / (b.age - a.age);
      }
    }
    return null;
  }

  // ---------- Réglages ----------
  var REGLAGES_DEFAUT = {
    kgParSac: 50, poidsPoussinG: 40, ageVente: 42,
    seuilMortalite: 0.05, tolerancePoids: 0.10, picMin: 3,
    repere: REPERE_DEFAUT
  };
  function reglagesComplets(r) {
    var o = {};
    for (var k in REGLAGES_DEFAUT) o[k] = REGLAGES_DEFAUT[k];
    if (r) for (var j in r) if (r[j] != null && r[j] !== '') o[j] = r[j];
    o.repere = normaliserRepere(o.repere);
    return o;
  }

  // ---------- Catégories de dépenses ----------
  var CATEGORIES = [
    { id: 'aliment', nom: 'Aliment' }, { id: 'poussins', nom: 'Poussins' },
    { id: 'soins', nom: 'Soins et traitements' }, { id: 'litiere', nom: 'Litière' },
    { id: 'electricite', nom: 'Électricité' }, { id: 'main_oeuvre', nom: 'Main-d’œuvre' },
    { id: 'transport', nom: 'Transport' }, { id: 'autre', nom: 'Autre' }
  ];
  function nomCategorie(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i].nom;
    return 'Autre';
  }
  function categorieValide(id) { return CATEGORIES.some(function (c) { return c.id === id; }) ? id : 'autre'; }

  // ---------- Opérations (une ligne du journal) ----------
  // jour    : { date, morts, sacs, kgParSac, eau, note }   — une seule par lot et par date
  // pesee   : { date, nb, poidsG }
  // achat   : { date, sacs, kgParSac, prixSac, fournisseur }  — achat d'aliment (dépense « aliment »)
  // depense : { date, categorie, montant, libelle }
  // vente   : { date, nb, kg, mode: 'poulet'|'kg', prix, acheteur, encaisse }
  // note    : { date, texte }
  function kgAlimentJour(op, reg) { return n(op.sacs) * (n(op.kgParSac) || n(reg && reg.kgParSac) || 50); }
  function kgAchat(op, reg) { return n(op.sacs) * (n(op.kgParSac) || n(reg && reg.kgParSac) || 50); }
  function coutAchat(op) { return n(op.sacs) * n(op.prixSac); }
  function montantVente(op) { return op.mode === 'kg' ? n(op.kg) * n(op.prix) : n(op.nb) * n(op.prix); }
  function encaisseVente(op) {
    var e = op.encaisse;
    if (e === null || e === undefined || e === '' || !isFinite(Number(e))) return montantVente(op);
    return Math.min(n(e), montantVente(op));
  }
  function trierOps(ops) {
    return (ops || []).slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : (n(a.cree) - n(b.cree)) || (String(a.id) < String(b.id) ? -1 : 1);
    });
  }

  // ---------- Lot ----------
  function lotNormalise(lot, reg) {
    reg = reglagesComplets(reg);
    return {
      id: lot.id, nom: lot.nom || 'Lot', statut: lot.statut === 'termine' ? 'termine' : 'en_cours',
      dateDebut: lot.dateDebut, dateFin: lot.dateFin || null,
      nbPoussins: n(lot.nbPoussins), prixPoussin: n(lot.prixPoussin),
      ageVente: n(lot.ageVente) || reg.ageVente,
      poidsPoussinG: lot.poidsPoussinG === 0 || lot.poidsPoussinG === '0' ? 0 : (n(lot.poidsPoussinG) || reg.poidsPoussinG),
      prixVentePrevu: n(lot.prixVentePrevu) || null, uniteVente: lot.uniteVente === 'kg' ? 'kg' : 'poulet'
    };
  }

  // Pesées regroupées par date (moyenne pondérée par le nombre de poulets pesés)
  function peseesParDate(lot, ops) {
    var parDate = {};
    ops.forEach(function (op) {
      if (op.type !== 'pesee' || !(n(op.poidsG) > 0)) return;
      var nb = n(op.nb) > 0 ? n(op.nb) : 1;
      var d = parDate[op.date] || (parDate[op.date] = { date: op.date, somme: 0, nb: 0 });
      d.somme += n(op.poidsG) * nb; d.nb += nb;
    });
    return Object.keys(parDate).sort().map(function (k) {
      var d = parDate[k];
      return { date: k, age: diffJours(lot.dateDebut, k), g: d.somme / d.nb, nb: d.nb };
    });
  }
  function poidsA(pesees, date) {
    var r = null;
    for (var i = 0; i < pesees.length; i++) if (pesees[i].date <= date) r = pesees[i]; else break;
    return r;
  }

  // Bilan complet d'un lot à une date (par défaut aujourd'hui)
  function bilanLot(lotBrut, opsBrutes, opts) {
    opts = opts || {};
    var reg = reglagesComplets(opts.reglages);
    var L = lotNormalise(lotBrut, reg);
    var aujourdhui = opts.aujourdhui || dateISO();
    var ops = trierOps(opsBrutes);
    var dateRef = L.statut === 'termine' ? (L.dateFin || (ops.length ? ops[ops.length - 1].date : aujourdhui)) : aujourdhui;
    if (dateRef < L.dateDebut) dateRef = L.dateDebut;
    var age = Math.max(0, diffJours(L.dateDebut, dateRef));

    var dep = {}; CATEGORIES.forEach(function (c) { dep[c.id] = 0; });
    dep.poussins = L.nbPoussins * L.prixPoussin;
    var morts = 0, alimentDonneKg = 0, eauL = 0, achatKg = 0, achatCout = 0;
    var vendus = 0, recettes = 0, encaisse = 0, kgVendus = 0, kgVendusConnu = true, nbVentes = 0;
    var jours = {}, derniereSaisie = null;
    var pesees = peseesParDate(L, ops);

    ops.forEach(function (op) {
      switch (op.type) {
        case 'jour':
          var j = jours[op.date] || (jours[op.date] = { date: op.date, morts: 0, alimentKg: 0, eau: 0 });
          j.morts += n(op.morts); j.alimentKg += kgAlimentJour(op, reg); j.eau += n(op.eau);
          morts += n(op.morts); alimentDonneKg += kgAlimentJour(op, reg); eauL += n(op.eau);
          if (!derniereSaisie || op.date > derniereSaisie) derniereSaisie = op.date;
          break;
        case 'achat':
          achatKg += kgAchat(op, reg); achatCout += coutAchat(op); dep.aliment += coutAchat(op);
          break;
        case 'depense':
          dep[categorieValide(op.categorie)] += n(op.montant);
          break;
        case 'vente':
          nbVentes++;
          vendus += n(op.nb); recettes += montantVente(op); encaisse += encaisseVente(op);
          if (n(op.kg) > 0) kgVendus += n(op.kg);
          else {
            var p = poidsA(pesees, op.date);
            if (p && n(op.nb) > 0) kgVendus += n(op.nb) * p.g / 1000; else if (n(op.nb) > 0) kgVendusConnu = false;
          }
          break;
      }
    });

    var coutTotal = 0; for (var c in dep) coutTotal += dep[c];
    var vivants = L.nbPoussins - morts - vendus;
    var survivants = L.nbPoussins - morts;
    var dp = pesees.length ? pesees[pesees.length - 1] : null;
    var poidsMoyenG = dp ? dp.g : null;
    var masseInitialeKg = L.nbPoussins * L.poidsPoussinG / 1000;
    // Aliment : on utilise les sacs donnés ; s'ils ne sont jamais notés, les sacs achetés (signalé)
    var sourceAliment = alimentDonneKg > 0 ? 'donne' : (achatKg > 0 ? 'achete' : null);
    var alimentKg = sourceAliment === 'donne' ? alimentDonneKg : achatKg;

    // Indice de consommation (IC) = aliment consommé (kg) ÷ poids vif gagné (kg)
    var ic = null, icDate = null, gainKg = null, icAlimentKg = null;
    if (vivants <= 0 && vendus > 0 && kgVendusConnu) {
      gainKg = kgVendus - masseInitialeKg; icDate = dateRef; icAlimentKg = alimentKg;
      ic = gainKg > 0 && alimentKg > 0 ? alimentKg / gainKg : null;
    } else if (dp) {
      var feedD = 0, mortsD = 0, vendusD = 0, kgVD = 0, connuD = true;
      ops.forEach(function (op) {
        if (op.date > dp.date) return;
        if (op.type === 'jour') { mortsD += n(op.morts); if (sourceAliment === 'donne') feedD += kgAlimentJour(op, reg); }
        else if (op.type === 'achat' && sourceAliment === 'achete') feedD += kgAchat(op, reg);
        else if (op.type === 'vente') {
          vendusD += n(op.nb);
          if (n(op.kg) > 0) kgVD += n(op.kg);
          else { var pp = poidsA(pesees, op.date); if (pp) kgVD += n(op.nb) * pp.g / 1000; else if (n(op.nb) > 0) connuD = false; }
        }
      });
      var vivD = Math.max(0, L.nbPoussins - mortsD - vendusD);
      gainKg = vivD * dp.g / 1000 + kgVD - masseInitialeKg; icDate = dp.date; icAlimentKg = feedD;
      ic = connuD && gainKg > 0 && feedD > 0 ? feedD / gainKg : null;
    }

    var poidsVifKg = vivants > 0 ? (poidsMoyenG != null ? vivants * poidsMoyenG / 1000 : null) : 0;
    var poidsTotalKg = poidsVifKg != null && kgVendusConnu ? poidsVifKg + kgVendus : null;
    var resteACouvrir = coutTotal - recettes;

    return {
      lot: L, aujourdhui: aujourdhui, dateRef: dateRef, age: age,
      joursAvantVente: L.ageVente - age,
      nbPoussins: L.nbPoussins, morts: morts, vendus: vendus, vivants: vivants, survivants: survivants,
      tauxMortalite: L.nbPoussins > 0 ? morts / L.nbPoussins : null,
      alimentKg: alimentKg, alimentDonneKg: alimentDonneKg, sourceAliment: sourceAliment,
      achatAlimentKg: achatKg, achatAlimentCout: achatCout,
      stockAlimentKg: achatKg > 0 && alimentDonneKg > 0 ? achatKg - alimentDonneKg : null,
      prixKgAliment: achatKg > 0 ? achatCout / achatKg : null,
      alimentParPoulet: survivants > 0 && alimentKg > 0 ? alimentKg / survivants : null,
      eauL: eauL,
      pesees: pesees, poidsMoyenG: poidsMoyenG, dernierePesee: dp,
      repereActuelG: dp ? repereA(reg.repere, dp.age) : null,
      masseInitialeKg: masseInitialeKg, poidsVifKg: poidsVifKg, poidsTotalKg: poidsTotalKg,
      gainKg: gainKg, ic: ic, icDate: icDate, icAlimentKg: icAlimentKg,
      depenses: dep, coutTotal: coutTotal,
      coutParPoulet: survivants > 0 ? coutTotal / survivants : null,
      coutParKg: poidsTotalKg > 0 ? coutTotal / poidsTotalKg : null,
      recettes: recettes, encaisse: encaisse, aRecevoir: recettes - encaisse,
      kgVendus: kgVendus, kgVendusConnu: kgVendusConnu, nbVentes: nbVentes,
      prixMoyenPoulet: vendus > 0 ? recettes / vendus : null,
      prixMoyenKg: kgVendus > 0 && kgVendusConnu ? recettes / kgVendus : null,
      marge: recettes - coutTotal,
      margeParPoulet: survivants > 0 ? (recettes - coutTotal) / survivants : null,
      tresorerie: encaisse - coutTotal,
      seuilParPoulet: vivants > 0 ? Math.max(0, resteACouvrir) / vivants : null,
      seuilParKg: vivants > 0 && poidsMoyenG ? Math.max(0, resteACouvrir) / (vivants * poidsMoyenG / 1000) : null,
      derniereSaisie: derniereSaisie, jours: jours
    };
  }

  // Série jour par jour (de l'arrivée à la date de référence) pour les graphiques
  function serieJournaliere(b) {
    var out = [], cumMorts = 0, cumAliment = 0;
    for (var d = 0; d <= b.age; d++) {
      var date = ajouterJours(b.lot.dateDebut, d), j = b.jours[date];
      var m = j ? j.morts : 0, a = j ? j.alimentKg : 0;
      cumMorts += m; cumAliment += a;
      out.push({ age: d, date: date, saisi: !!j, morts: m, alimentKg: a, cumMorts: cumMorts, cumAlimentKg: cumAliment });
    }
    return out;
  }

  // Rythme récent : moyenne par jour saisi sur les 7 derniers jours (sinon sur tous les jours saisis)
  function rythmeRecent(b) {
    var debut = ajouterJours(b.dateRef, -6);
    var dates = Object.keys(b.jours).filter(function (d) { return d <= b.dateRef; }).sort();
    var fen = dates.filter(function (d) { return d >= debut; });
    if (!fen.length) fen = dates;
    var m = 0, a = 0;
    fen.forEach(function (d) { m += b.jours[d].morts; a += b.jours[d].alimentKg; });
    return { jours: fen.length, mortsParJour: fen.length ? m / fen.length : 0, alimentParJour: fen.length ? a / fen.length : null };
  }

  // Projection jusqu'à l'âge de vente prévu. C'est une ESTIMATION : on prolonge la tendance actuelle.
  function projection(b, opts) {
    var reg = reglagesComplets(opts && opts.reglages);
    var L = b.lot;
    var jr = b.vivants > 0 ? Math.max(0, L.ageVente - b.age) : 0; // plus de poulets : rien à prolonger
    var r = rythmeRecent(b);
    var mortsPrevues = b.vivants > 0 ? Math.min(b.vivants, r.mortsParJour * jr) : 0;
    var vivantsFin = Math.max(0, b.vivants - mortsPrevues);

    // Poids à l'âge de vente
    var poidsFinG = null, methodePoids = null, ratio = null;
    var dp = b.dernierePesee;
    if (dp) {
      var repNow = repereA(reg.repere, dp.age), repFin = repereA(reg.repere, L.ageVente);
      if (repNow && repFin) {
        ratio = dp.g / repNow; poidsFinG = ratio * repFin; methodePoids = 'repere';
      } else {
        var pr = b.pesees.length >= 2 ? b.pesees[b.pesees.length - 2] : { age: 0, g: L.poidsPoussinG };
        if (dp.age > pr.age) {
          var gmq = (dp.g - pr.g) / (dp.age - pr.age);
          poidsFinG = Math.max(dp.g, dp.g + gmq * (L.ageVente - dp.age)); methodePoids = 'tendance';
        }
      }
    }

    // Aliment encore à donner, au rythme actuel
    var alimentParJour = b.sourceAliment === 'donne' ? r.alimentParJour
      : (b.sourceAliment === 'achete' ? b.alimentKg / (b.age + 1) : null);
    var alimentRestantKg = alimentParJour != null ? alimentParJour * jr : null;
    var stock = b.stockAlimentKg != null ? Math.max(0, b.stockAlimentKg) : 0;
    var alimentAAcheterKg = alimentRestantKg != null ? Math.max(0, alimentRestantKg - stock) : null;
    var coutAlimentFutur = alimentAAcheterKg == null ? null
      : (alimentAAcheterKg === 0 ? 0 : (b.prixKgAliment != null ? alimentAAcheterKg * b.prixKgAliment : null));
    // Dépenses régulières (électricité, main-d'œuvre) prolongées au même rythme par jour ; les autres ne sont pas prévues
    var autresParJour = (b.depenses.electricite + b.depenses.main_oeuvre) / Math.max(1, b.age);
    var autresFuturs = autresParJour * jr;
    var coutFin = b.coutTotal + (coutAlimentFutur || 0) + autresFuturs;

    // Prix de vente : celui prévu par l'éleveur, sinon le prix moyen déjà obtenu
    var prix = null, unite = 'poulet', sourcePrix = null;
    if (L.prixVentePrevu > 0) { prix = L.prixVentePrevu; unite = L.uniteVente; sourcePrix = 'prevu'; }
    else if (b.prixMoyenPoulet != null && b.prixMoyenPoulet > 0) { prix = b.prixMoyenPoulet; sourcePrix = 'ventes'; }
    var recettesFutures = null;
    if (prix != null) recettesFutures = unite === 'kg' ? (poidsFinG != null ? vivantsFin * poidsFinG / 1000 * prix : null) : vivantsFin * prix;
    var recettesFin = recettesFutures != null ? b.recettes + recettesFutures : null;
    var margeFin = recettesFin != null ? recettesFin - coutFin : null;
    var seuilFin = vivantsFin > 0 ? Math.max(0, coutFin - b.recettes) / vivantsFin : null;
    var poidsVifFinKg = poidsFinG != null ? vivantsFin * poidsFinG / 1000 : null;
    var icFin = null;
    if (poidsVifFinKg != null && alimentRestantKg != null && b.kgVendusConnu) {
      var g = poidsVifFinKg + b.kgVendus - b.masseInitialeKg;
      icFin = g > 0 ? (b.alimentKg + alimentRestantKg) / g : null;
    }
    return {
      joursRestants: jr, ageVente: L.ageVente, rythme: r,
      mortsPrevues: mortsPrevues, vivantsFin: vivantsFin,
      poidsFinG: poidsFinG, methodePoids: methodePoids, ratioRepere: ratio,
      alimentParJour: alimentParJour, alimentRestantKg: alimentRestantKg, alimentAAcheterKg: alimentAAcheterKg,
      sacsAAcheter: alimentAAcheterKg != null ? Math.max(0, Math.ceil(alimentAAcheterKg / (n(reg.kgParSac) || 50) - 1e-9)) : null,
      coutAlimentFutur: coutAlimentFutur, autresFuturs: autresFuturs, coutFin: coutFin,
      complet: coutAlimentFutur != null,
      prix: prix, unite: unite, sourcePrix: sourcePrix,
      recettesFutures: recettesFutures, recettesFin: recettesFin, margeFin: margeFin,
      margeFinParPoulet: margeFin != null && (vivantsFin + b.vendus) > 0 ? margeFin / (vivantsFin + b.vendus) : null,
      seuilFin: seuilFin, seuilFinKg: seuilFin != null && poidsFinG ? seuilFin / (poidsFinG / 1000) : null,
      poidsVifFinKg: poidsVifFinKg, icFin: icFin
    };
  }

  // ---------- Alertes « à vérifier » (jamais un diagnostic) ----------
  var VETO = ' En cas de doute sur la santé des poulets, consultez un vétérinaire.';
  function alertes(b, opts) {
    var reg = reglagesComplets(opts && opts.reglages);
    var proj = opts && opts.projection;
    var L = b.lot, out = [];
    function ajouter(code, niveau, texte) { out.push({ code: code, niveau: niveau, texte: texte }); }
    if (b.vivants < 0) ajouter('incoherence', 'attention', 'À vérifier : plus de poulets sortis (morts + vendus : ' + nombre(b.morts + b.vendus) + ') que de poussins au départ (' + nombre(b.nbPoussins) + ').');
    var enCours = L.statut === 'en_cours';
    if (enCours) {
      // Pic de mortalité : dernier jour saisi (dans les 3 derniers jours) comparé aux 7 jours saisis d'avant
      var dates = Object.keys(b.jours).filter(function (d) { return d <= b.dateRef; }).sort();
      if (dates.length) {
        var dj = dates[dates.length - 1], mj = b.jours[dj].morts;
        var avant = dates.slice(0, -1).filter(function (d) { return d >= ajouterJours(dj, -7); });
        var moy = 0; avant.forEach(function (d) { moy += b.jours[d].morts; }); moy = avant.length ? moy / avant.length : 0;
        if (diffJours(dj, b.dateRef) <= 2 && mj >= n(reg.picMin) && mj > 2 * moy) {
          ajouter('pic_mortalite', 'attention', 'À vérifier : ' + nombre(mj) + ' morts le ' + dateFr(dj) +
            (avant.length ? ', contre ' + nombreCourt(moy, 1) + ' par jour en moyenne les jours d’avant.' : '.') + VETO);
        }
      }
    }
    if (b.tauxMortalite != null && b.tauxMortalite > n(reg.seuilMortalite)) {
      ajouter('mortalite_cumul', 'attention', 'À vérifier : mortalité cumulée de ' + pct(b.tauxMortalite) + ', au-dessus de votre seuil de ' + pct(n(reg.seuilMortalite), 0) + '.' + (enCours ? VETO : ''));
    }
    if (b.dernierePesee && b.repereActuelG && b.dernierePesee.g < b.repereActuelG * (1 - n(reg.tolerancePoids))) {
      var ecart = 1 - b.dernierePesee.g / b.repereActuelG;
      ajouter('poids_bas', 'attention', 'À vérifier : poids moyen de ' + nombre(b.dernierePesee.g) + ' g à ' + b.dernierePesee.age + ' jours, ' + pct(ecart, 0) + ' sous votre repère (' + nombre(b.repereActuelG) + ' g).');
    }
    var fini = !enCours || (b.vivants <= 0 && b.vendus > 0);
    if (fini && b.marge < 0) ajouter('marge_negative', 'attention', 'À vérifier : la marge de ce lot est négative (' + fcfa(b.marge) + ').');
    if (!fini && L.prixVentePrevu > 0 && L.uniteVente === 'poulet' && b.seuilParPoulet != null && L.prixVentePrevu < b.seuilParPoulet) {
      ajouter('prix_sous_seuil', 'attention', 'À vérifier : votre prix prévu (' + fcfa(L.prixVentePrevu) + ' par poulet) est sous le prix minimum déjà atteint (' + fcfa(b.seuilParPoulet) + ') : la marge deviendrait négative.');
    }
    if (!fini && proj && proj.margeFin != null && proj.margeFin < 0) {
      ajouter('marge_prevue_negative', 'attention', 'À vérifier : marge estimée en fin de lot négative (' + fcfa(proj.margeFin) + '). Comparez votre prix de vente au prix minimum.');
    }
    if (enCours && b.stockAlimentKg != null && b.stockAlimentKg < 0) {
      ajouter('aliment', 'info', 'À vérifier : plus d’aliment donné (' + kg(b.alimentDonneKg, 0) + ') qu’acheté (' + kg(b.achatAlimentKg, 0) + '). Avez-vous noté tous les achats ?');
    }
    if (enCours && b.vivants === 0 && b.vendus > 0) {
      ajouter('tout_vendu', 'info', 'Tous les poulets sont sortis : vous pouvez terminer ce lot (bouton « Terminer ce lot » en bas de la page).');
    }
    if (enCours && b.vivants > 0 && b.age > L.ageVente) {
      ajouter('age_depasse', 'info', 'Âge de vente prévu dépassé de ' + (b.age - L.ageVente) + ' jour' + (b.age - L.ageVente > 1 ? 's' : '') + ' : chaque jour de plus coûte de l’aliment.');
    }
    if (enCours && b.vivants > 0) {
      var sans = b.derniereSaisie ? diffJours(b.derniereSaisie, b.dateRef) : b.age;
      if (sans >= 2 && b.age >= 2) ajouter('pas_de_saisie', 'info', 'Pas de saisie depuis ' + sans + ' jours. Notez les morts et l’aliment chaque jour.');
      var depuisPesee = b.dernierePesee ? diffJours(b.dernierePesee.date, b.dateRef) : b.age;
      if (b.age >= 7 && depuisPesee >= 7) ajouter('pesee', 'info', b.dernierePesee ? 'Dernière pesée il y a ' + depuisPesee + ' jours : pesez quelques poulets pour suivre la croissance.' : 'Aucune pesée : pesez une dizaine de poulets pour suivre la croissance.');
    }
    return out;
  }

  // ---------- Export CSV (compatible Excel en français : « ; » et virgule décimale) ----------
  function csvCellule(v) {
    if (v == null) return '';
    if (typeof v === 'number') return isFinite(v) ? String(arrondi(v, 4)).replace('.', ',') : '';
    var s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = '’' + s; // évite qu'Excel interprète une formule
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvLignes(lignes) { return '﻿' + lignes.map(function (l) { return l.map(csvCellule).join(';'); }).join('\r\n') + '\r\n'; }
  var TYPES_OP = { jour: 'Journée', pesee: 'Pesée', achat: 'Achat d’aliment', depense: 'Dépense', vente: 'Vente', note: 'Note' };
  function csvJournal(lotBrut, opsBrutes, opts) {
    var reg = reglagesComplets(opts && opts.reglages);
    var L = lotNormalise(lotBrut, reg);
    var lignes = [['Lot', 'Date', 'Âge (jours)', 'Type', 'Morts', 'Aliment donné (kg)', 'Eau (L)', 'Poulets pesés', 'Poids moyen (g)',
      'Aliment acheté (kg)', 'Catégorie', 'Dépense (F)', 'Poulets vendus', 'Kg vendus', 'Prix', 'Unité du prix', 'Montant vente (F)', 'Encaissé (F)', 'Acheteur / fournisseur', 'Détail']];
    trierOps(opsBrutes).forEach(function (op) {
      var l = [L.nom, dateFr(op.date), diffJours(L.dateDebut, op.date), TYPES_OP[op.type] || op.type,
        null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
      if (op.type === 'jour') { l[4] = n(op.morts); l[5] = kgAlimentJour(op, reg); l[6] = op.eau ? n(op.eau) : null; l[19] = op.note || ''; }
      else if (op.type === 'pesee') { l[7] = n(op.nb) || null; l[8] = n(op.poidsG); }
      else if (op.type === 'achat') { l[9] = kgAchat(op, reg); l[10] = 'Aliment'; l[11] = coutAchat(op); l[18] = op.fournisseur || ''; l[19] = n(op.sacs) + ' sac(s) à ' + n(op.prixSac) + ' F'; }
      else if (op.type === 'depense') { l[10] = nomCategorie(op.categorie); l[11] = n(op.montant); l[19] = op.libelle || ''; }
      else if (op.type === 'vente') { l[12] = n(op.nb); l[13] = n(op.kg) || null; l[14] = n(op.prix); l[15] = op.mode === 'kg' ? 'par kg' : 'par poulet'; l[16] = montantVente(op); l[17] = encaisseVente(op); l[18] = op.acheteur || ''; }
      else if (op.type === 'note') { l[19] = op.texte || ''; }
      lignes.push(l);
    });
    return csvLignes(lignes);
  }
  function csvResume(paires) {
    var lignes = [['Lot', 'Statut', 'Début', 'Âge (jours)', 'Poussins', 'Prix poussin (F)', 'Morts', 'Mortalité (%)', 'Vendus', 'Restants',
      'Aliment (kg)', 'Aliment par poulet (kg)', 'Poids moyen (g)', 'IC', 'Coût total (F)', 'Coût par poulet (F)', 'Coût par kg (F)',
      'Recettes (F)', 'Encaissé (F)', 'Marge (F)', 'Marge par poulet (F)', 'Trésorerie (F)', 'Prix minimum par poulet restant (F)']];
    paires.forEach(function (p) {
      var b = p.bilan;
      lignes.push([b.lot.nom, b.lot.statut === 'termine' ? 'Terminé' : 'En cours', dateFr(b.lot.dateDebut), b.age, b.nbPoussins, b.lot.prixPoussin,
        b.morts, b.tauxMortalite != null ? arrondi(b.tauxMortalite * 100, 2) : null, b.vendus, b.vivants,
        arrondi(b.alimentKg, 1), b.alimentParPoulet != null ? arrondi(b.alimentParPoulet, 3) : null,
        b.poidsMoyenG != null ? arrondi(b.poidsMoyenG, 0) : null, b.ic != null ? arrondi(b.ic, 2) : null,
        Math.round(b.coutTotal), b.coutParPoulet != null ? Math.round(b.coutParPoulet) : null, b.coutParKg != null ? Math.round(b.coutParKg) : null,
        Math.round(b.recettes), Math.round(b.encaisse), Math.round(b.marge), b.margeParPoulet != null ? Math.round(b.margeParPoulet) : null,
        Math.round(b.tresorerie), b.seuilParPoulet != null ? Math.round(b.seuilParPoulet) : null]);
    });
    return csvLignes(lignes);
  }

  // ---------- Totaux de la ferme (tous les lots) ----------
  function totauxFerme(bilans) {
    var t = { vivants: 0, encours: 0, coutTotal: 0, recettes: 0, encaisse: 0, aRecevoir: 0, tresorerie: 0, marge: 0 };
    bilans.forEach(function (b) {
      if (b.lot.statut === 'en_cours') { t.encours++; t.vivants += Math.max(0, b.vivants); }
      t.coutTotal += b.coutTotal; t.recettes += b.recettes; t.encaisse += b.encaisse; t.aRecevoir += b.aRecevoir;
      t.tresorerie += b.tresorerie; t.marge += b.marge;
    });
    return t;
  }


  // ---------- Sauvegarde : contrôle d'un fichier avant restauration (on ne garde que les champs connus) ----------
  var CHAMPS_OPS = {
    jour: { morts: 'n', sacs: 'n', kgParSac: 'n', eau: 'n', note: 500 },
    pesee: { nb: 'n', poidsG: 'n' },
    achat: { sacs: 'n', kgParSac: 'n', prixSac: 'n', fournisseur: 80 },
    depense: { categorie: 'cat', montant: 'n', libelle: 100 },
    vente: { nb: 'n', kg: 'n?', prix: 'n', mode: 'mode', acheteur: 80, encaisse: 'n?' },
    note: { texte: 1000 }
  };
  function texteCourt(v, max) { return String(v == null ? '' : v).slice(0, max); }
  function validerSauvegarde(o) {
    var refus = { ok: false, erreur: 'Ce fichier n’est pas une sauvegarde PouletPilot.' };
    if (!o || typeof o !== 'object' || o.app !== 'PouletPilot' || !Array.isArray(o.lots) || !Array.isArray(o.ops)) return refus;
    var lots = [], ids = {};
    o.lots.forEach(function (l) {
      if (!l || typeof l.id !== 'string' || !l.id || ids[l.id] || !dateValide(l.dateDebut)) return;
      var c = {
        id: l.id.slice(0, 64), nom: texteCourt(l.nom || 'Lot', 60), dateDebut: l.dateDebut,
        nbPoussins: Math.max(0, Math.round(n(l.nbPoussins))), prixPoussin: Math.max(0, n(l.prixPoussin)),
        statut: l.statut === 'termine' ? 'termine' : 'en_cours', dateFin: dateValide(l.dateFin) ? l.dateFin : null,
        ageVente: n(l.ageVente) > 0 ? n(l.ageVente) : null, poidsPoussinG: l.poidsPoussinG != null && isFinite(Number(l.poidsPoussinG)) ? n(l.poidsPoussinG) : null,
        prixVentePrevu: n(l.prixVentePrevu) > 0 ? n(l.prixVentePrevu) : null, uniteVente: l.uniteVente === 'kg' ? 'kg' : 'poulet',
        souche: texteCourt(l.souche, 60), batiment: texteCourt(l.batiment, 60), exemple: !!l.exemple, cree: n(l.cree) || 0
      };
      ids[c.id] = 1; lots.push(c);
    });
    var ops = [], idsOps = {};
    o.ops.forEach(function (x) {
      if (!x || typeof x.id !== 'string' || !x.id || idsOps[x.id] || !ids[x.lotId] || !CHAMPS_OPS[x.type] || !dateValide(x.date)) return;
      var c = { id: x.id.slice(0, 64), lotId: x.lotId, type: x.type, date: x.date, cree: n(x.cree) || 0, modifie: n(x.modifie) || 0 };
      var ch = CHAMPS_OPS[x.type];
      for (var k in ch) {
        var r = ch[k], v = x[k];
        if (r === 'n') c[k] = Math.max(0, n(v));
        else if (r === 'n?') c[k] = v == null || v === '' || !isFinite(Number(v)) ? null : Math.max(0, n(v));
        else if (r === 'cat') c[k] = categorieValide(v);
        else if (r === 'mode') c[k] = v === 'kg' ? 'kg' : 'poulet';
        else c[k] = texteCourt(v, r);
      }
      idsOps[c.id] = 1; ops.push(c);
    });
    if (o.lots.length && !lots.length) return { ok: false, erreur: 'Sauvegarde abîmée : aucun lot lisible.' };
    var reglages = null, rg = o.reglages;
    if (rg && typeof rg === 'object') {
      reglages = {};
      ['kgParSac', 'poidsPoussinG', 'ageVente', 'seuilMortalite', 'tolerancePoids', 'picMin'].forEach(function (k) { if (isFinite(Number(rg[k])) && rg[k] !== null && rg[k] !== '') reglages[k] = Number(rg[k]); });
      if (Array.isArray(rg.repere) && normaliserRepere(rg.repere).length >= 2) reglages.repere = normaliserRepere(rg.repere);
      if (rg.theme === 'clair' || rg.theme === 'sombre' || rg.theme === 'auto') reglages.theme = rg.theme;
      reglages = reglagesComplets(reglages);
    }
    return { ok: true, lots: lots, ops: ops, reglages: reglages, ignores: (o.lots.length - lots.length) + (o.ops.length - ops.length) };
  }

  var PP = {
    n: n, estNombre: estNombre, lireNombre: lireNombre, arrondi: arrondi, nombre: nombre, nombreCourt: nombreCourt,
    fcfa: fcfa, pct: pct, kg: kg,
    dateISO: dateISO, dateValide: dateValide, diffJours: diffJours, ajouterJours: ajouterJours, dateFr: dateFr, dateCourte: dateCourte,
    REPERE_DEFAUT: REPERE_DEFAUT, normaliserRepere: normaliserRepere, repereA: repereA,
    REGLAGES_DEFAUT: REGLAGES_DEFAUT, reglagesComplets: reglagesComplets,
    CATEGORIES: CATEGORIES, nomCategorie: nomCategorie, TYPES_OP: TYPES_OP,
    kgAlimentJour: kgAlimentJour, kgAchat: kgAchat, coutAchat: coutAchat, montantVente: montantVente, encaisseVente: encaisseVente,
    trierOps: trierOps, lotNormalise: lotNormalise, bilanLot: bilanLot, serieJournaliere: serieJournaliere,
    rythmeRecent: rythmeRecent, projection: projection, alertes: alertes,
    csvCellule: csvCellule, csvJournal: csvJournal, csvResume: csvResume, totauxFerme: totauxFerme,
    validerSauvegarde: validerSauvegarde
  };
  if (typeof module === 'object' && module.exports) module.exports = PP;
  else racine.PP = PP;
})(typeof self !== 'undefined' ? self : this);
