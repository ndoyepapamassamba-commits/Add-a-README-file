/* Champ Pilot — tous les calculs (sans écran). Marche dans le navigateur (window.CP) et dans Node (tests).
   Montants en F CFA entiers ; surfaces en ha (ou m²) ; récoltes en kg ; dates AAAA-MM-JJ.
   L'application ne donne aucune dose ni aucun conseil de traitement : seulement des noms et des coûts. */
(function (racine) {
  'use strict';
  var U = racine.TU || (typeof require === 'function' ? require('./ui.js') : null);
  var n = U.n;

  var CULTURES = [
    { id: 'arachide', nom: 'Arachide', emoji: '🥜' }, { id: 'mil', nom: 'Mil', emoji: '🌾' }, { id: 'mais', nom: 'Maïs', emoji: '🌽' },
    { id: 'oignon', nom: 'Oignon', emoji: '🧅' }, { id: 'riz', nom: 'Riz', emoji: '🍚' }, { id: 'niebe', nom: 'Niébé', emoji: '🌿' },
    { id: 'maraichage', nom: 'Maraîchage', emoji: '🥬' }, { id: 'autre', nom: 'Autre culture', emoji: '🌱' }
  ];
  var NATURES = [
    { id: 'preparation', nom: 'Préparation du sol' }, { id: 'semis', nom: 'Semis' }, { id: 'repiquage', nom: 'Repiquage' },
    { id: 'demariage', nom: 'Démariage' }, { id: 'sarclage', nom: 'Sarclage, désherbage' }, { id: 'engrais', nom: 'Apport d’engrais' },
    { id: 'traitement', nom: 'Traitement' }, { id: 'arrosage', nom: 'Arrosage' }, { id: 'recolte', nom: 'Récolte' },
    { id: 'battage', nom: 'Battage, séchage' }, { id: 'autre', nom: 'Autre travail' }
  ];
  var CATEGORIES = [
    { id: 'semences', nom: 'Semences' }, { id: 'engrais', nom: 'Engrais' }, { id: 'produits', nom: 'Produits (traitement)' },
    { id: 'location', nom: 'Labour, matériel loué' }, { id: 'eau', nom: 'Carburant, irrigation' }, { id: 'transport', nom: 'Transport' },
    { id: 'sacs', nom: 'Sacs, emballages' }, { id: 'autre', nom: 'Autre dépense' }
  ];
  var SAISONS = [{ id: 'hivernage', nom: 'Hivernage (saison des pluies)' }, { id: 'contre_saison', nom: 'Contre-saison' }, { id: 'autre', nom: 'Autre' }];
  // Villes pour situer une parcelle sans GPS (coordonnées approchées, suffisantes pour une prévision météo)
  var VILLES = [
    ['Bakel', 14.90, -12.46], ['Bignona', 12.81, -16.23], ['Dagana', 16.52, -15.50], ['Dakar', 14.69, -17.45], ['Diourbel', 14.65, -16.23],
    ['Fatick', 14.34, -16.41], ['Kaffrine', 14.11, -15.55], ['Kaolack', 14.15, -16.07], ['Kédougou', 12.56, -12.18], ['Kolda', 12.89, -14.94],
    ['Koungheul', 13.98, -14.80], ['Linguère', 15.39, -15.12], ['Louga', 15.62, -16.22], ['Matam', 15.66, -13.26], ['Mbacké', 14.79, -15.91],
    ['Mboro (Niayes)', 15.15, -16.89], ['Mbour', 14.42, -16.96], ['Nioro du Rip', 13.75, -15.80], ['Podor', 16.65, -14.96],
    ['Richard-Toll', 16.46, -15.70], ['Rufisque', 14.72, -17.27], ['Saint-Louis', 16.03, -16.49], ['Sédhiou', 12.71, -15.56],
    ['Tambacounda', 13.77, -13.67], ['Thiès', 14.79, -16.93], ['Tivaouane', 14.95, -16.82], ['Touba', 14.85, -15.88],
    ['Vélingara', 13.15, -14.11], ['Ziguinchor', 12.56, -16.27]
  ].map(function (v) { return { id: v[0], nom: v[0], lat: v[1], lon: v[2] }; });
  var LIMITE_GRATUITE = 2;
  var OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

  function culture(id) { for (var i = 0; i < CULTURES.length; i++) if (CULTURES[i].id === id) return CULTURES[i]; return CULTURES[CULTURES.length - 1]; }
  function nature(id) { for (var i = 0; i < NATURES.length; i++) if (NATURES[i].id === id) return NATURES[i]; return NATURES[NATURES.length - 1]; }
  function categorie(id) { for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i]; return CATEGORIES[CATEGORIES.length - 1]; }
  function reglagesComplets(r) {
    r = r || {};
    return { rappelJours: U.estNombre(r.rappelJours) && r.rappelJours >= 0 && r.rappelJours <= 30 ? Math.round(r.rappelJours) : 3, kcDefaut: n(r.kcDefaut) > 0 ? r.kcDefaut : 1 };
  }

  // ---------- Unités ----------
  function surfaceHa(p) { var s = n(p && p.surface); return p && p.unite === 'm2' ? s / 10000 : s; }
  function texteSurface(p) { return p.unite === 'm2' ? U.nombre(p.surface) + ' m²' : U.nombre(p.surface, 4) + ' ha'; }
  function kgDe(q, unite, kgParSac) { return unite === 'sac' ? n(q) * n(kgParSac) : n(q); }
  function montantTravail(t) {
    if (t.mode === 'familial') return 0;
    if (t.mode === 'forfait') return Math.round(n(t.montant));
    return Math.round(n(t.personnes) * n(t.jours) * n(t.prixJour));
  }
  function joursTravail(t) { return Math.round(n(t.personnes) * n(t.jours) * 100) / 100; }

  // ---------- Grouper ----------
  var TYPES = ['campagne', 'parcelle', 'operation', 'depense', 'travail', 'recolte', 'vente'];
  function grouper(recs) {
    var D = {}; TYPES.forEach(function (t) { D[t] = []; });
    (recs || []).forEach(function (r) { if (r && D[r.type]) D[r.type].push(r); });
    return D;
  }

  // ---------- Bilan d'une campagne ----------
  // Une dépense ou un travail « pour toutes les parcelles » est partagé selon la surface, au franc près.
  function analyserCampagne(recs, campagneId) {
    var D = Array.isArray(recs) ? grouper(recs) : recs;
    var parcelles = D.parcelle.filter(function (p) { return p.campagneId === campagneId; });
    var ids = {}; parcelles.forEach(function (p) { ids[p.id] = true; });
    var B = {};
    parcelles.forEach(function (p) {
      B[p.id] = { id: p.id, parcelle: p, surfaceHa: surfaceHa(p), depenses: 0, depCat: {}, travail: 0, joursTravail: 0, joursFamiliaux: 0,
        recolteKg: 0, venduKg: 0, ventes: 0, nbRecoltes: 0, nbVentes: 0 };
    });
    var nonReparti = 0;
    // partage : parcelles qui existaient quand la dépense commune a été notée (sinon toutes celles de la campagne)
    function imputer(montant, x, fn) {
      if (x.parcelleId) { if (B[x.parcelleId]) fn(B[x.parcelleId], montant, 1); else nonReparti += montant; return; }
      var cibles = Array.isArray(x.partage) ? parcelles.filter(function (p) { return x.partage.indexOf(p.id) >= 0; }) : [];
      if (!cibles.length) cibles = parcelles;
      if (!cibles.length) { nonReparti += montant; return; }
      var poids = cibles.map(function (p) { return surfaceHa(p); }), tot = 0;
      poids.forEach(function (v) { tot += v; });
      var parts = U.repartir(montant, poids);
      cibles.forEach(function (p, i) { fn(B[p.id], parts[i], tot > 0 ? poids[i] / tot : 1 / cibles.length); });
    }
    D.depense.forEach(function (d) {
      if (d.campagneId !== campagneId) return;
      imputer(Math.round(n(d.montant)), d, function (b, m) { b.depenses += m; b.depCat[d.categorie] = (b.depCat[d.categorie] || 0) + m; });
    });
    D.travail.forEach(function (t) {
      if (t.campagneId !== campagneId) return;
      var jt = joursTravail(t);
      imputer(montantTravail(t), t, function (b, m, part) {
        b.travail += m;
        b.joursTravail += jt * part;
        if (t.mode === 'familial') b.joursFamiliaux += jt * part;
      });
    });
    D.recolte.forEach(function (r) { var b = B[r.parcelleId]; if (b) { b.recolteKg += kgDe(r.quantite, r.unite, r.kgParSac); b.nbRecoltes++; } });
    D.vente.forEach(function (v) { var b = B[v.parcelleId]; if (b) { b.venduKg += kgDe(v.quantite, v.unite, v.kgParSac); b.ventes += Math.round(n(v.montant)); b.nbVentes++; } });
    var T = { surfaceHa: 0, depenses: 0, depCat: {}, travail: 0, joursTravail: 0, recolteKg: 0, venduKg: 0, ventes: 0, valeurStock: 0, nonReparti: nonReparti, parCulture: {} };
    parcelles.forEach(function (p) {
      var b = B[p.id];
      b.joursTravail = Math.round(b.joursTravail * 10) / 10; b.joursFamiliaux = Math.round(b.joursFamiliaux * 10) / 10;
      b.recolteKg = Math.round(b.recolteKg * 10) / 10; b.venduKg = Math.round(b.venduKg * 10) / 10;
      b.coutTotal = b.depenses + b.travail;
      b.rendementHa = b.surfaceHa > 0 && b.recolteKg > 0 ? Math.round(b.recolteKg / b.surfaceHa) : null;
      b.marge = b.ventes - b.coutTotal;
      b.margeHa = b.surfaceHa > 0 ? Math.round(b.marge / b.surfaceHa) : null;
      b.coutHa = b.surfaceHa > 0 ? Math.round(b.coutTotal / b.surfaceHa) : null;
      b.coutKg = b.recolteKg > 0 ? Math.round(b.coutTotal / b.recolteKg) : null;
      b.prixMoyenKg = b.venduKg > 0 ? Math.round(b.ventes / b.venduKg) : null;
      b.stockKg = Math.round((b.recolteKg - b.venduKg) * 10) / 10;
      b.valeurStock = b.stockKg > 0 && b.prixMoyenKg ? Math.round(b.stockKg * b.ventes / b.venduKg) : null;
      T.surfaceHa += b.surfaceHa; T.depenses += b.depenses; T.travail += b.travail; T.joursTravail += b.joursTravail;
      T.recolteKg += b.recolteKg; T.venduKg += b.venduKg; T.ventes += b.ventes; T.valeurStock += n(b.valeurStock);
      Object.keys(b.depCat).forEach(function (k) { T.depCat[k] = (T.depCat[k] || 0) + b.depCat[k]; });
      var c = T.parCulture[p.culture] || (T.parCulture[p.culture] = { culture: p.culture, surfaceHa: 0, recolteKg: 0, ventes: 0, cout: 0, nb: 0 });
      c.surfaceHa += b.surfaceHa; c.recolteKg += b.recolteKg; c.ventes += b.ventes; c.cout += b.coutTotal; c.nb++;
    });
    Object.keys(T.parCulture).forEach(function (k) {
      var c = T.parCulture[k];
      c.rendementHa = c.surfaceHa > 0 && c.recolteKg > 0 ? Math.round(c.recolteKg / c.surfaceHa) : null;
      c.marge = c.ventes - c.cout; c.margeHa = c.surfaceHa > 0 ? Math.round(c.marge / c.surfaceHa) : null;
    });
    T.surfaceHa = Math.round(T.surfaceHa * 10000) / 10000;
    T.recolteKg = Math.round(T.recolteKg * 10) / 10; T.venduKg = Math.round(T.venduKg * 10) / 10; T.joursTravail = Math.round(T.joursTravail * 10) / 10;
    T.coutTotal = T.depenses + T.travail + nonReparti;
    T.marge = T.ventes - T.coutTotal;
    T.margeHa = T.surfaceHa > 0 ? Math.round(T.marge / T.surfaceHa) : null;
    T.nbParcelles = parcelles.length;
    return { campagneId: campagneId, parcelles: B, ordre: parcelles, totaux: T };
  }

  function comparerCampagnes(recs) {
    var D = Array.isArray(recs) ? grouper(recs) : recs;
    return D.campagne.slice().sort(function (a, b) { return (a.debut || '') < (b.debut || '') ? -1 : (a.debut || '') > (b.debut || '') ? 1 : n(a.cree) - n(b.cree); })
      .map(function (c) { return { campagne: c, bilan: analyserCampagne(D, c.id) }; });
  }

  // ---------- Calendrier et rappels ----------
  function echeances(recs, campagneId, auj, rappelJours) {
    var D = Array.isArray(recs) ? grouper(recs) : recs;
    var ids = {}; D.parcelle.forEach(function (p) { if (p.campagneId === campagneId) ids[p.id] = p; });
    var out = { retard: [], aujourdhui: [], bientot: [], plusTard: [], faites: [] }, rj = rappelJours == null ? 3 : rappelJours;
    D.operation.filter(function (o) { return ids[o.parcelleId]; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : n(a.cree) - n(b.cree); }).forEach(function (o) {
      if (o.faite) { out.faites.push(o); return; }
      var k = U.ecartJours(auj, o.date);
      if (k < 0) out.retard.push(o); else if (k === 0) out.aujourdhui.push(o); else if (k <= rj) out.bientot.push(o); else out.plusTard.push(o);
    });
    out.faites.reverse();
    out.aRappeler = out.retard.length + out.aujourdhui.length + out.bientot.length;
    return out;
  }

  // ---------- Besoin en eau indicatif (Open-Meteo) ----------
  function urlOpenMeteo(lat, lon) {
    return OPEN_METEO + '?latitude=' + (+lat).toFixed(4) + '&longitude=' + (+lon).toFixed(4) +
      '&daily=et0_fao_evapotranspiration,precipitation_sum&timezone=auto&forecast_days=7';
  }
  function lireOpenMeteo(j) {
    var d = j && j.daily;
    if (!d || !Array.isArray(d.time) || !Array.isArray(d.et0_fao_evapotranspiration)) return null;
    var out = [];
    d.time.forEach(function (t, i) {
      var e = d.et0_fao_evapotranspiration[i], p = d.precipitation_sum ? d.precipitation_sum[i] : 0;
      if (U.dateValide(t) && U.estNombre(e)) out.push({ date: t, et0: e, pluie: U.estNombre(p) ? p : 0 });
    });
    return out.length ? out : null;
  }
  // net (mm) par jour = ET0 × coefficient − pluie, jamais négatif ; 1 mm sur 1 ha = 10 m³
  function besoinEau(jours, ha, kc) {
    kc = n(kc) > 0 ? kc : 1;
    var lignes = (jours || []).map(function (j) {
      var net = Math.max(0, n(j.et0) * kc - n(j.pluie));
      return { date: j.date, et0: n(j.et0), pluie: n(j.pluie), netMm: Math.round(net * 10) / 10, m3: Math.round(net * n(ha) * 10 * 10) / 10 };
    });
    var et0 = 0, pluie = 0, net = 0;
    lignes.forEach(function (l) { et0 += l.et0; pluie += l.pluie; net += Math.max(0, l.et0 * kc - l.pluie); });
    var m3 = net * n(ha) * 10;
    return { lignes: lignes, kc: kc, et0Total: Math.round(et0 * 10) / 10, pluieTotal: Math.round(pluie * 10) / 10, netMm: Math.round(net * 10) / 10,
      m3: Math.round(m3 * 10) / 10, litres: Math.round(m3 * 1000), parJourM3: lignes.length ? Math.round(m3 / lignes.length * 10) / 10 : 0 };
  }

  // ---------- Limite gratuite ----------
  function nbComptees(parcelles, campagneId) { return (parcelles || []).filter(function (p) { return p.campagneId === campagneId && !p.exemple; }).length; }
  function peutAjouterParcelle(parcelles, campagneId, premium) { return !!premium || nbComptees(parcelles, campagneId) < LIMITE_GRATUITE; }

  // ---------- Messages WhatsApp (envoyés par l'utilisateur lui-même) ----------
  function messageRappel(o, p) {
    var c = culture(p.culture);
    return 'Rappel : ' + nature(o.nature).nom.toLowerCase() + ' de la parcelle « ' + p.nom + ' » (' + c.nom.toLowerCase() + ') prévu le ' + U.dateLongue(o.date) + '.' + (o.note ? '\n' + o.note : '');
  }
  function messageBilan(c, T) {
    return 'Campagne « ' + c.nom + ' » :\n' +
      '- Surface : ' + U.nombre(T.surfaceHa, 2) + ' ha (' + U.pluriel(T.nbParcelles, 'parcelle') + ')\n' +
      '- Récolte : ' + U.kg(T.recolteKg, 0) + '\n' +
      '- Dépenses : ' + U.fcfa(T.coutTotal) + '\n' +
      '- Ventes : ' + U.fcfa(T.ventes) + '\n' +
      '- Marge : ' + U.fcfa(T.marge) + (T.margeHa != null ? ' (' + U.fcfa(T.margeHa) + ' par ha)' : '') + '\n(Champ Pilot)';
  }

  // ---------- Sauvegarde ----------
  function validerSauvegarde(obj) {
    if (!obj || !Array.isArray(obj.recs)) return { ok: false, erreur: 'Sauvegarde incomplète : rien à restaurer.' };
    var recs = obj.recs.filter(function (r) { return r && typeof r.id === 'string' && TYPES.indexOf(r.type) >= 0; });
    var nbP = recs.filter(function (r) { return r.type === 'parcelle'; }).length, nbC = recs.filter(function (r) { return r.type === 'campagne'; }).length;
    var kv = { reglages: reglagesComplets(obj.reglages) };
    if (obj.campagneActive && recs.some(function (r) { return r.id === obj.campagneActive; })) kv.campagneActive = obj.campagneActive;
    return { ok: true, recs: recs, photos: [], kv: kv, resume: U.pluriel(nbC, 'campagne') + ', ' + U.pluriel(nbP, 'parcelle') + ', ' + U.pluriel(recs.length, 'enregistrement') };
  }

  // ---------- Exemple : deux campagnes pour voir la comparaison ----------
  function exemple(auj, nouvelId) {
    var id = nouvelId || U.nouvelId, recs = [], k = 0, an = +auj.slice(0, 4);
    function r(o) { o.id = id(); o.exemple = true; o.cree = 1 + (k++); recs.push(o); return o; }
    function campagne(annee, facteur) {
      var c = r({ type: 'campagne', nom: 'Exemple : hivernage ' + annee, saison: 'hivernage', debut: annee + '-06-01', note: 'Données d’exemple' });
      var d = function (m, j) { return annee + '-' + m + '-' + j; };
      var ara = r({ type: 'parcelle', campagneId: c.id, nom: 'Champ du puits', surface: 1, unite: 'ha', culture: 'arachide', variete: 'Fleur 11', lieu: 'Kaffrine', lat: 14.11, lon: -15.55 });
      var mil = r({ type: 'parcelle', campagneId: c.id, nom: 'Champ de case', surface: 5000, unite: 'm2', culture: 'mil', variete: 'Souna', lieu: 'Kaffrine', lat: 14.11, lon: -15.55 });
      [[ara, 'preparation', d('06', '20'), true], [ara, 'semis', d('07', '05'), true], [ara, 'sarclage', d('07', '25'), true], [ara, 'sarclage', d('08', '15'), true], [ara, 'recolte', d('10', '15'), true],
        [mil, 'semis', d('07', '02'), true], [mil, 'demariage', d('07', '20'), true], [mil, 'sarclage', d('08', '01'), true], [mil, 'recolte', d('10', '05'), true]].forEach(function (x) {
        r({ type: 'operation', parcelleId: x[0].id, nature: x[1], date: x[2], faite: x[3], dateFaite: x[3] ? x[2] : null, note: '' });
      });
      r({ type: 'depense', campagneId: c.id, parcelleId: ara.id, categorie: 'semences', nom: 'Semences d’arachide', quantite: 120, unite: 'kg', montant: Math.round(60000 * facteur), date: d('06', '25'), fournisseur: 'Coopérative (exemple)' });
      r({ type: 'depense', campagneId: c.id, parcelleId: ara.id, categorie: 'engrais', nom: 'Engrais', quantite: 3, unite: 'sacs', montant: 45000, date: d('07', '10'), fournisseur: '' });
      r({ type: 'depense', campagneId: c.id, parcelleId: mil.id, categorie: 'semences', nom: 'Semences de mil', quantite: 5, unite: 'kg', montant: 3000, date: d('06', '28'), fournisseur: '' });
      r({ type: 'depense', campagneId: c.id, parcelleId: null, categorie: 'location', nom: 'Labour à l’attelage', quantite: null, unite: '', montant: 30000, date: d('06', '20'), fournisseur: '' });
      r({ type: 'depense', campagneId: c.id, parcelleId: null, categorie: 'sacs', nom: 'Sacs vides', quantite: 30, unite: 'sacs', montant: 9000, date: d('10', '10'), fournisseur: '' });
      r({ type: 'travail', campagneId: c.id, parcelleId: ara.id, nature: 'sarclage', date: d('07', '25'), personnes: 3, jours: 2, mode: 'jour', prixJour: 2500, montant: null });
      r({ type: 'travail', campagneId: c.id, parcelleId: ara.id, nature: 'recolte', date: d('10', '15'), personnes: 4, jours: 2, mode: 'jour', prixJour: 3000, montant: null });
      r({ type: 'travail', campagneId: c.id, parcelleId: mil.id, nature: 'recolte', date: d('10', '05'), personnes: 3, jours: 2, mode: 'familial', prixJour: null, montant: null });
      r({ type: 'recolte', parcelleId: ara.id, date: d('10', '20'), quantite: Math.round(16 * facteur), unite: 'sac', kgParSac: 50 });
      r({ type: 'recolte', parcelleId: mil.id, date: d('10', '08'), quantite: Math.round(320 * facteur), unite: 'kg', kgParSac: null });
      var qa = Math.round(14 * facteur);
      r({ type: 'vente', parcelleId: ara.id, date: d('11', '02'), quantite: qa, unite: 'sac', kgParSac: 50, prixUnitaire: 15000, montant: qa * 15000, acheteur: 'Point de collecte (exemple)' });
      r({ type: 'vente', parcelleId: mil.id, date: d('11', '01'), quantite: 150, unite: 'kg', kgParSac: null, prixUnitaire: 250, montant: 37500, acheteur: 'Marché hebdomadaire' });
      return c;
    }
    campagne(an - 1, 0.85);
    var c2 = campagne(an, 1);
    var pc = recs.filter(function (x) { return x.type === 'parcelle' && x.campagneId === c2.id; });
    r({ type: 'operation', parcelleId: pc[0].id, nature: 'battage', date: U.ajouterJours(auj, 2), faite: false, dateFaite: null, note: 'Sécher les gousses avant de les mettre en sacs.' });
    r({ type: 'operation', parcelleId: pc[1].id, nature: 'autre', date: U.ajouterJours(auj, -1), faite: false, dateFaite: null, note: 'Rentrer les tiges de mil.' });
    return { recs: recs, campagneId: c2.id };
  }

  var CP = {
    CULTURES: CULTURES, NATURES: NATURES, CATEGORIES: CATEGORIES, SAISONS: SAISONS, VILLES: VILLES, LIMITE_GRATUITE: LIMITE_GRATUITE, OPEN_METEO: OPEN_METEO,
    culture: culture, nature: nature, categorie: categorie, reglagesComplets: reglagesComplets, surfaceHa: surfaceHa, texteSurface: texteSurface, kgDe: kgDe,
    montantTravail: montantTravail, joursTravail: joursTravail, grouper: grouper, analyserCampagne: analyserCampagne, comparerCampagnes: comparerCampagnes,
    echeances: echeances, urlOpenMeteo: urlOpenMeteo, lireOpenMeteo: lireOpenMeteo, besoinEau: besoinEau, nbComptees: nbComptees, peutAjouterParcelle: peutAjouterParcelle,
    messageRappel: messageRappel, messageBilan: messageBilan, validerSauvegarde: validerSauvegarde, exemple: exemple
  };
  if (typeof module === 'object' && module.exports) module.exports = CP;
  else racine.CP = CP;
})(typeof self !== 'undefined' ? self : this);
