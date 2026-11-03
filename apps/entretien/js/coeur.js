/* Carnet Entretien (TERANGA) — logique pure, sans interface : engins, programme d'entretien, échéances,
   carburant (consommation et coût), dépenses, rappels .ics, textes WhatsApp, pass.
   Navigateur (window.CE) et Node (require) pour les tests. Montants en entiers F CFA ; litres stockés en centilitres entiers. */
(function (racine) {
  'use strict';
  var JOUR_MS = 86400000;

  // ---------- Nombres ----------
  function formatNombre(n, sep) {
    if (sep === undefined) sep = '\u202f';
    n = Math.round(Number(n) || 0);
    var signe = n < 0 ? '-' : '', s = String(Math.abs(n)), out = '';
    while (s.length > 3) { out = sep + s.slice(-3) + out; s = s.slice(0, -3); }
    return signe + s + out;
  }
  function f(n, sep) { return formatNombre(n, sep) + (sep === undefined ? '\u00a0' : sep) + 'F'; }
  function decimal(n, chiffres, sep) {
    chiffres = chiffres == null ? 1 : chiffres;
    var p = Math.pow(10, chiffres), v = Math.round(Number(n) * p) / p;
    var e = Math.trunc(v), d = Math.round(Math.abs(v - e) * p);
    return (v < 0 && e === 0 ? '-' : '') + formatNombre(e, sep) + (chiffres && d ? ',' + String(d).padStart(chiffres, '0').replace(/0+$/, '') : '');
  }
  function lireEntier(v) {
    var s = String(v == null ? '' : v).replace(/[^0-9]/g, '').slice(0, 12);
    return s ? parseInt(s, 10) : 0;
  }
  // « 32,5 » ou « 32.5 » → 32.5 ; toujours positif
  function lireDecimal(v) {
    if (typeof v === 'number') return isFinite(v) && v > 0 ? v : 0;
    var s = String(v == null ? '' : v).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.').replace(/[^0-9.]/g, '');
    var n = parseFloat(s);
    return isFinite(n) && n > 0 ? n : 0;
  }
  function versCl(litres) { return Math.round(lireDecimal(litres) * 100); }
  function litres(cl, sep) { return decimal((cl || 0) / 100, 2, sep) + '\u00a0L'; }
  function somme(liste, cle) { var t = 0; (liste || []).forEach(function (x) { t += Math.round(Number(cle ? x[cle] : x) || 0); }); return t; }

  // ---------- Dates ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateISO(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function versDate(iso) { var p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +(p[2] || 1)); }
  function dateValide(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) && dateISO(versDate(iso)) === iso; }
  function joursEntre(a, b) { return Math.round((versDate(b) - versDate(a)) / JOUR_MS); }
  function ajouterJours(iso, n) { var d = versDate(iso); d.setDate(d.getDate() + n); return dateISO(d); }
  // Ajoute des mois sans déborder : 31/01 + 1 mois → 28/02 (ou 29/02)
  function ajouterMois(iso, n) {
    var p = String(iso).split('-'), a = +p[0], m = +p[1] - 1 + n, j = +p[2];
    var d = new Date(a, m, 1), fin = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(j, fin));
    return dateISO(d);
  }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function moisFr(m) { var p = String(m).split('-'); return MOIS[+p[1] - 1] + ' ' + p[0]; }
  function dateFr(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso); }
  function dateCourte(iso) { var d = versDate(iso); return d.getDate() + (d.getDate() === 1 ? 'er' : '') + ' ' + MOIS_COURTS[d.getMonth()] + ' ' + d.getFullYear(); }

  // ---------- Types d'engins et programme d'entretien (valeurs indicatives, modifiables) ----------
  var TYPES = {
    voiture: { nom: 'Voiture', icone: 'voiture', unite: 'km', carburant: true, exemple: 'Ex. : Toyota Corolla', voyage: true },
    moto: { nom: 'Moto ou Jakarta', icone: 'moto', unite: 'km', carburant: true, exemple: 'Ex. : Jakarta rouge', voyage: true },
    groupe: { nom: 'Groupe électrogène', icone: 'groupe', unite: 'h', carburant: true, exemple: 'Ex. : Groupe 5 kVA de la maison' },
    clim: { nom: 'Climatiseur', icone: 'clim', unite: '', carburant: false, exemple: 'Ex. : Clim du salon' },
    pompe: { nom: 'Pompe à eau', icone: 'pompe', unite: '', carburant: false, exemple: 'Ex. : Surpresseur de la citerne' },
    frigo: { nom: 'Réfrigérateur', icone: 'frigo', unite: '', carburant: false, exemple: 'Ex. : Frigo de la cuisine' },
    autre: { nom: 'Autre appareil', icone: 'outil', unite: '', carburant: false, exemple: 'Ex. : Congélateur, chauffe-eau…' }
  };
  var ORDRE_TYPES = ['voiture', 'moto', 'groupe', 'clim', 'pompe', 'frigo', 'autre'];
  function T(cle, nom, km, h, mois, liste) { return { cle: cle, nom: nom, mode: 'periodique', intKm: km || 0, intH: h || 0, intMois: mois || 0, checklist: liste || [] }; }
  function E(cle, nom) { return { cle: cle, nom: nom, mode: 'echeance', checklist: [] }; }
  var MODELES = {
    voiture: [
      T('vidange', 'Vidange moteur et filtre à huile', 5000, 0, 6, ['Huile moteur remplacée', 'Filtre à huile remplacé', 'Kilométrage noté pour la prochaine fois']),
      T('filtre_air', 'Filtre à air', 10000, 0, 12, ['Filtre à air remplacé ou nettoyé']),
      T('filtre_carburant', 'Filtre à carburant', 20000, 0, 24),
      T('pneus', 'Pneus : contrôle et permutation', 10000, 0, 6, ['Pression des 4 pneus et de la roue de secours', 'Usure regardée', 'Permutation faite']),
      T('freins', 'Freins : contrôle des plaquettes', 20000, 0, 12),
      T('courroie', 'Courroie de distribution', 60000, 0, 48),
      T('refroidissement', 'Liquide de refroidissement', 0, 0, 24),
      T('batterie', 'Batterie : contrôle', 0, 0, 12),
      E('visite', 'Visite technique'), E('assurance', 'Assurance'), E('vignette', 'Vignette')
    ],
    moto: [
      T('vidange', 'Vidange', 1500, 0, 3, ['Huile remplacée', 'Kilométrage noté pour la prochaine fois']),
      T('chaine', 'Chaîne : graissage et tension', 500, 0, 1, ['Chaîne nettoyée et graissée', 'Tension regardée']),
      T('bougie', 'Bougie', 5000, 0, 12),
      T('filtre_air', 'Filtre à air', 3000, 0, 6),
      T('pneus_freins', 'Pneus et freins : contrôle', 3000, 0, 3, ['Pression des pneus', 'Usure des pneus', 'Freins avant et arrière']),
      E('assurance', 'Assurance')
    ],
    groupe: [
      T('vidange', 'Vidange', 0, 100, 6, ['Huile remplacée', 'Heures notées pour la prochaine fois']),
      T('filtre_air', 'Filtre à air : nettoyage', 0, 50, 3),
      T('filtre_carburant', 'Filtre à carburant', 0, 250, 12),
      T('bougie', 'Bougie (groupe à essence)', 0, 300, 12),
      T('essai', 'Démarrage d\'essai', 0, 0, 1, ['Niveau d\'huile regardé', 'Carburant suffisant', 'Démarrage et marche 15 minutes'])
    ],
    clim: [
      T('filtres', 'Nettoyage des filtres', 0, 0, 1, ['Courant coupé', 'Filtres retirés et lavés à l\'eau claire', 'Filtres séchés à l\'ombre puis remis']),
      T('technicien', 'Entretien par un technicien', 0, 0, 6, ['Unité extérieure nettoyée', 'Contrôle fait par le technicien'])
    ],
    pompe: [
      T('controle', 'Contrôle de la pompe', 0, 0, 3, ['Pas de fuite', 'Pas de bruit inhabituel', 'Pression correcte au robinet']),
      T('technicien', 'Révision par un technicien', 0, 0, 12)
    ],
    frigo: [
      T('nettoyage', 'Nettoyage et dégivrage', 0, 0, 3, ['Appareil débranché', 'Intérieur nettoyé', 'Joint de porte essuyé', 'Rebranché']),
      T('grille', 'Grille arrière : dépoussiérage', 0, 0, 6)
    ],
    autre: [T('controle', 'Contrôle général', 0, 0, 6)]
  };
  var VOYAGE = ['Pression des pneus et roue de secours', 'Niveaux : huile, eau, liquide de frein', 'Phares, clignotants, feux stop', 'Essuie-glaces et lave-glace',
    'Papiers à bord : carte grise, assurance, visite technique', 'Triangle, gilet, cric et clé de roue', 'Trousse de secours et eau à boire'];
  var VOYAGE_MOTO = ['Pression des pneus', 'Freins avant et arrière', 'Chaîne graissée et tendue', 'Phare et clignotants', 'Papiers à bord', 'Casque'];

  function nouvelleTache(m) {
    return { id: 't-' + nouvelId().slice(0, 10), cle: m.cle || 'perso', nom: String(m.nom || '').trim().slice(0, 60) || 'Entretien', mode: m.mode === 'echeance' ? 'echeance' : 'periodique',
      intKm: lireEntier(m.intKm), intH: lireEntier(m.intH), intMois: lireEntier(m.intMois), checklist: (m.checklist || []).slice(), dernier: null, echeance: m.echeance || '', actif: true };
  }
  function nouvelEngin(type, champs, aujourdhui) {
    var t = TYPES[type] ? type : 'autre', c = champs || {};
    var e = { id: 'e-' + nouvelId().slice(0, 12), type: t, nom: String(c.nom || '').trim().slice(0, 50) || TYPES[t].nom, immat: String(c.immat || '').trim().toUpperCase().slice(0, 20),
      annee: lireEntier(c.annee) || '', carburant: c.carburant || '', unite: TYPES[t].unite, compteurInitial: TYPES[t].unite ? lireEntier(c.compteur) : 0,
      garageNom: String(c.garageNom || '').trim().slice(0, 50), garageTel: String(c.garageTel || '').trim().slice(0, 20), note: '', cree: aujourdhui || dateISO(), taches: [] };
    MODELES[t].forEach(function (m) { e.taches.push(nouvelleTache(m)); });
    return e;
  }
  function tacheDe(engin, id) { var l = (engin && engin.taches) || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function tacheParCle(engin, cle) { var l = (engin && engin.taches) || []; for (var i = 0; i < l.length; i++) if (l[i].cle === cle) return l[i]; return null; }
  function uniteTxt(u) { return u === 'km' ? 'km' : u === 'h' ? 'h' : ''; }
  function compteurTxt(n, u, sep) { return formatNombre(n, sep) + (sep === undefined ? '\u00a0' : sep) + uniteTxt(u); }
  function rythmeTxt(t, u) {
    if (t.mode === 'echeance') return 'Date d\'échéance que vous notez';
    var p = [];
    if (u === 'km' && t.intKm) p.push(formatNombre(t.intKm) + '\u00a0km');
    if (u === 'h' && t.intH) p.push(formatNombre(t.intH) + '\u00a0heures');
    if (t.intMois) p.push(t.intMois + '\u00a0mois');
    if (!p.length) return 'Pas de rythme';
    if (p.length === 1 && t.intMois === 1) return 'Chaque mois';
    return 'Tous les ' + p.join(' ou ');
  }

  // ---------- Compteur ----------
  function pointsCompteur(engin, pleins, operations, releves) {
    var id = engin.id, pts = [];
    if (engin.unite) pts.push({ date: engin.cree, compteur: lireEntier(engin.compteurInitial) });
    (releves || []).forEach(function (r) { if (r.engin === id && r.compteur > 0) pts.push({ date: r.date, compteur: r.compteur }); });
    (pleins || []).forEach(function (p) { if (p.engin === id && p.compteur > 0) pts.push({ date: p.date, compteur: p.compteur }); });
    (operations || []).forEach(function (o) { if (o.engin === id && o.compteur > 0) pts.push({ date: o.date, compteur: o.compteur }); });
    (engin.taches || []).forEach(function (t) { if (t.dernier && t.dernier.compteur > 0) pts.push({ date: t.dernier.date, compteur: t.dernier.compteur }); });
    return pts.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.compteur - b.compteur; });
  }
  function compteurActuel(engin, pleins, operations, releves) {
    if (!engin.unite) return 0;
    var m = 0;
    pointsCompteur(engin, pleins, operations, releves).forEach(function (p) { if (p.compteur > m) m = p.compteur; });
    return m;
  }
  // Usage moyen par jour (km ou heures) sur les 180 derniers jours connus ; null si trop peu de recul
  function usageParJour(engin, pleins, operations, releves) {
    if (!engin.unite) return null;
    var pts = pointsCompteur(engin, pleins, operations, releves);
    if (pts.length < 2) return null;
    var dernier = pts[pts.length - 1], premier = null;
    pts.forEach(function (p) { if (!premier && joursEntre(p.date, dernier.date) <= 180) premier = p; });
    var jours = joursEntre(premier.date, dernier.date), delta = dernier.compteur - premier.compteur;
    if (jours < 7 || delta <= 0) return null;
    return delta / jours;
  }

  // ---------- État d'un entretien ----------
  var RANG = { retard: 0, bientot: 1, inconnu: 2, ok: 3 };
  function seuilCompteur(intervalle, unite) { return Math.max(Math.round(intervalle * 0.1), unite === 'km' ? 100 : 5); }
  // ctx : { compteur, usage (par jour), aujourdhui, unite }
  function etatTache(t, ctx) {
    var auj = ctx.aujourdhui || dateISO(), u = ctx.unite, r = { statut: 'ok' };
    if (t.mode === 'echeance') {
      if (!dateValide(t.echeance)) return { statut: 'inconnu', texte: 'Notez la date d\'échéance' };
      var j = joursEntre(auj, t.echeance);
      r.date = t.echeance; r.jours = j;
      r.statut = j < 0 ? 'retard' : j <= (t.rappelJours || 30) ? 'bientot' : 'ok';
      r.texte = j < 0 ? 'Expirée depuis ' + (-j) + ' jour' + (j < -1 ? 's' : '') + ' (le ' + dateFr(t.echeance) + ')' : j === 0 ? 'Expire aujourd\'hui' :
        'Expire le ' + dateFr(t.echeance) + ' (dans ' + j + ' jour' + (j > 1 ? 's' : '') + ')';
      r.tri = j;
      return r;
    }
    if (!t.dernier || !dateValide(t.dernier.date)) return { statut: 'inconnu', texte: 'Notez la dernière fois que c\'est fait', tri: 1e9 };
    var statuts = [], parties = [], dates = [];
    var inter = u === 'km' ? t.intKm : u === 'h' ? t.intH : 0;
    if (inter && u) {
      var du = (t.dernier.compteur || 0) + inter, reste = du - (ctx.compteur || 0);
      r.compteurDu = du; r.resteCompteur = reste;
      var s = reste < 0 ? 'retard' : reste <= seuilCompteur(inter, u) ? 'bientot' : 'ok';
      statuts.push(s);
      parties.push(reste < 0 ? 'Dépassé de ' + compteurTxt(-reste, u) : s === 'bientot' ? 'Dans ' + compteurTxt(reste, u) : 'À ' + compteurTxt(du, u));
      if (ctx.usage && reste > 0) { r.dateEstimee = ajouterJours(auj, Math.ceil(reste / ctx.usage)); dates.push(r.dateEstimee); }
      else if (reste <= 0) dates.push(auj);
    }
    if (t.intMois) {
      var dd = ajouterMois(t.dernier.date, t.intMois), jj = joursEntre(auj, dd);
      r.dateDu = dd; r.joursDate = jj;
      var s2 = jj < 0 ? 'retard' : jj <= (t.rappelJours || 15) ? 'bientot' : 'ok';
      statuts.push(s2);
      parties.push(jj < 0 ? 'En retard de ' + (-jj) + ' jour' + (jj < -1 ? 's' : '') : jj === 0 ? 'Aujourd\'hui' : s2 === 'bientot' ? 'Dans ' + jj + ' jour' + (jj > 1 ? 's' : '') + ' (le ' + dateFr(dd) + ')' : 'le ' + dateFr(dd));
      dates.push(jj < 0 ? auj : dd);
    }
    if (!statuts.length) return { statut: 'ok', texte: 'Pas de rythme défini', tri: 1e9 };
    statuts.sort(function (a, b) { return RANG[a] - RANG[b]; });
    r.statut = statuts[0];
    r.texte = parties.join(r.statut === 'ok' ? ' ou ' : ' · ');
    dates.sort();
    r.date = dates[0] || null;
    r.tri = r.date ? joursEntre(auj, r.date) : 1e8;
    if (r.statut === 'retard' && r.resteCompteur != null && r.resteCompteur < 0) r.tri = Math.min(r.tri, -1);
    return r;
  }
  // Tous les entretiens d'un engin (ou de tous), triés par urgence
  function aFaire(engins, donnees, aujourdhui) {
    var l = [];
    (engins || []).forEach(function (e) {
      var ctx = { compteur: compteurActuel(e, donnees.pleins, donnees.operations, donnees.releves), usage: usageParJour(e, donnees.pleins, donnees.operations, donnees.releves), aujourdhui: aujourdhui, unite: e.unite };
      (e.taches || []).forEach(function (t) { if (t.actif !== false) l.push({ engin: e, tache: t, etat: etatTache(t, ctx) }); });
    });
    return l.sort(function (a, b) { return RANG[a.etat.statut] - RANG[b.etat.statut] || (a.etat.tri || 0) - (b.etat.tri || 0); });
  }

  // ---------- Carburant ----------
  function pleinsDe(pleins, enginId) {
    return (pleins || []).filter(function (p) { return p.engin === enginId; }).sort(function (a, b) { return a.compteur - b.compteur || (a.date < b.date ? -1 : 1); });
  }
  // Méthode du plein complet : entre deux pleins complets, litres versés / distance parcourue
  function consommation(pleins, unite) {
    var segs = [], dernierComplet = null, cl = 0, montant = 0;
    pleins.forEach(function (p) {
      if (dernierComplet) { cl += p.litresCl || 0; montant += p.montant || 0; }
      if (p.complet !== false) {
        if (dernierComplet && p.compteur > dernierComplet.compteur) segs.push({ de: dernierComplet, a: p, distance: p.compteur - dernierComplet.compteur, cl: cl, montant: montant });
        if (!dernierComplet || p.compteur > dernierComplet.compteur) { dernierComplet = p; cl = 0; montant = 0; }
      }
    });
    function taux(c, d) { return unite === 'h' ? Math.round(c / d / 10) / 10 : Math.round(c * 10 / d) / 10; }
    var r = { segments: segs.map(function (s) { s.conso = taux(s.cl, s.distance); s.cout = Math.round(s.montant / s.distance); return s; }), approx: false };
    var dist = somme(segs, 'distance'), totalCl = somme(segs, 'cl'), totalF = somme(segs, 'montant');
    if (dist > 0) { r.moyenne = taux(totalCl, dist); r.coutParUnite = Math.round(totalF / dist); r.derniere = segs[segs.length - 1].conso; r.distance = dist; }
    else if (pleins.length >= 2 && pleins[pleins.length - 1].compteur > pleins[0].compteur) {
      // Sans pleins complets : moyenne approximative (tout ce qui a été versé après le premier plein)
      var d = pleins[pleins.length - 1].compteur - pleins[0].compteur, c = 0, m = 0;
      pleins.slice(1).forEach(function (p) { c += p.litresCl || 0; m += p.montant || 0; });
      r.moyenne = taux(c, d); r.coutParUnite = Math.round(m / d); r.approx = true; r.distance = d;
    }
    var tl = somme(pleins, 'litresCl'), tm = somme(pleins, 'montant');
    r.prixLitre = tl > 0 ? Math.round(tm * 100 / tl) : null;
    r.totalCl = tl; r.totalMontant = tm; r.nb = pleins.length;
    return r;
  }
  function prixLitre(montant, cl) { return cl > 0 ? Math.round(montant * 100 / cl) : 0; }
  function libelleConso(u) { return u === 'h' ? 'L/heure' : 'L/100\u00a0km'; }

  // ---------- Dépenses ----------
  var CATEGORIES = {
    carburant: { nom: 'Carburant', icone: 'pompe-essence' },
    entretien: { nom: 'Entretien', icone: 'outil' },
    reparation: { nom: 'Réparation', icone: 'reparation' },
    pieces: { nom: 'Pièces et pneus', icone: 'piece' },
    papiers: { nom: 'Assurance et papiers', icone: 'papier' },
    lavage: { nom: 'Lavage et parking', icone: 'goutte' },
    autre: { nom: 'Autre', icone: 'divers' }
  };
  var ORDRE_CATEGORIES = ['carburant', 'entretien', 'reparation', 'pieces', 'papiers', 'lavage', 'autre'];
  // Liste unique (pleins + opérations), du plus récent au plus ancien
  function historique(enginId, pleins, operations) {
    var l = [];
    (pleins || []).forEach(function (p) { if (!enginId || p.engin === enginId) l.push({ id: p.id, genre: 'plein', engin: p.engin, date: p.date, compteur: p.compteur, categorie: 'carburant', libelle: 'Plein : ' + litres(p.litresCl), montant: p.montant || 0, ref: p }); });
    (operations || []).forEach(function (o) { if (!enginId || o.engin === enginId) l.push({ id: o.id, genre: 'operation', engin: o.engin, date: o.date, compteur: o.compteur || 0, categorie: o.categorie || 'autre', libelle: o.libelle, montant: o.montant || 0, ref: o }); });
    return l.sort(function (a, b) { return a.date > b.date ? -1 : a.date < b.date ? 1 : (b.compteur || 0) - (a.compteur || 0); });
  }
  function totauxDepenses(lignes, filtre) {
    var t = { total: 0, parCategorie: {}, parMois: {}, parEngin: {}, nb: 0 };
    lignes.forEach(function (l) {
      if (filtre && !filtre(l)) return;
      t.total += l.montant; if (l.montant > 0) t.nb++;
      t.parCategorie[l.categorie] = (t.parCategorie[l.categorie] || 0) + l.montant;
      var m = l.date.slice(0, 7); t.parMois[m] = (t.parMois[m] || 0) + l.montant;
      t.parEngin[l.engin] = (t.parEngin[l.engin] || 0) + l.montant;
    });
    return t;
  }
  // Coût de revient tout compris (carburant + entretien + réparations…) par km ou par heure, sur toute la période notée
  function coutToutCompris(engin, pleins, operations, releves) {
    if (!engin.unite) return null;
    // Seulement la période où les dépenses sont notées (pas les « dernières fois » anciennes du programme)
    var pts = pointsCompteur(Object.assign({}, engin, { taches: [] }), pleins, operations, releves);
    if (pts.length < 2) return null;
    var min = Infinity, max = 0;
    pts.forEach(function (p) { if (p.compteur < min) min = p.compteur; if (p.compteur > max) max = p.compteur; });
    var dist = max - min;
    if (dist <= 0) return null;
    var total = somme(historique(engin.id, pleins, operations), 'montant');
    return { distance: dist, total: total, parUnite: Math.round(total / dist) };
  }

  // ---------- Version gratuite ----------
  var ENGINS_GRATUITS = 1;
  function enginsOrdonnes(engins) {
    return (engins || []).slice().sort(function (a, b) { return (a.cree || '') < (b.cree || '') ? -1 : (a.cree || '') > (b.cree || '') ? 1 : (a.ordre || 0) - (b.ordre || 0); });
  }
  function peutCreerEngin(engins, premium) { return !!premium || (engins || []).length < ENGINS_GRATUITS; }
  // Sans pass : le premier engin reste modifiable ; les autres restent consultables (historique, PDF, rappels)
  function enginModifiable(e, engins, premium) {
    if (premium || !e) return true;
    var o = enginsOrdonnes(engins);
    for (var i = 0; i < ENGINS_GRATUITS && i < o.length; i++) if (o[i].id === e.id) return true;
    return false;
  }

  // ---------- Rappels pour le calendrier (.ics, l'utilisateur l'ajoute lui-même) ----------
  function icsTexte(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function octets(s) { var n = 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xD800 && c <= 0xDBFF) ? (i++, 4) : 3; } return n; }
  // Plie les lignes à 75 octets (RFC 5545), sans couper un caractère
  function plier(ligne) {
    if (octets(ligne) <= 75) return ligne;
    var out = [], cur = '', max = 75;
    for (var i = 0; i < ligne.length; i++) {
      var ch = ligne[i];
      if (ch >= '\uD800' && ch <= '\uDBFF' && i + 1 < ligne.length) { ch += ligne[++i]; }
      if (octets(cur + ch) > max) { out.push(cur); cur = ' ' + ch; max = 75; } else cur += ch;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function horodatage(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  // evenements : [{ uid, date (AAAA-MM-JJ), titre, description }]
  function ics(evenements, maintenantMs) {
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TERANGA//Carnet Entretien//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Carnet Entretien'];
    var stamp = horodatage(maintenantMs == null ? Date.now() : maintenantMs);
    evenements.forEach(function (ev) {
      L.push('BEGIN:VEVENT', 'UID:' + ev.uid + '@carnet-entretien.teranga', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ev.date.replace(/-/g, ''),
        'DTEND;VALUE=DATE:' + ajouterJours(ev.date, 1).replace(/-/g, ''), 'SUMMARY:' + icsTexte(ev.titre), 'DESCRIPTION:' + icsTexte(ev.description || ''), 'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTexte(ev.titre), 'TRIGGER:-P7D', 'END:VALARM',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTexte(ev.titre), 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.map(plier).join('\r\n') + '\r\n';
  }
  function evenementsRappel(liste, aujourdhui) {
    var ev = [];
    liste.forEach(function (x) {
      var e = x.engin, t = x.tache, s = x.etat;
      if (s.statut === 'inconnu' || !s.date) return;
      var date = s.date < aujourdhui ? aujourdhui : s.date;
      var desc = e.nom + (e.immat ? ' (' + e.immat + ')' : '') + ' : ' + t.nom + '. ' + (s.texte || '') + (s.compteurDu ? '. Prévu à ' + compteurTxt(s.compteurDu, e.unite, ' ') : '') +
        (s.dateEstimee && t.mode !== 'echeance' ? ' (date estimée selon votre usage)' : '') + '. Noté dans Carnet Entretien.';
      ev.push({ uid: e.id + '-' + t.id + '-' + date.replace(/-/g, ''), date: date, titre: t.nom + ' : ' + e.nom, description: desc.replace(/\u00a0|\u202f/g, ' ') });
    });
    return ev;
  }

  // ---------- WhatsApp (l'utilisateur envoie lui-même) ----------
  function numeroWhatsApp(tel) {
    var d = String(tel || '').replace(/[^0-9+]/g, '');
    if (!d) return '';
    if (d.indexOf('+') === 0) d = d.slice(1); else if (d.indexOf('00') === 0) d = d.slice(2);
    d = d.replace(/\D/g, '');
    if (d.length === 9 && /^[37]/.test(d)) d = '221' + d;
    return d.length >= 8 && d.length <= 15 ? d : '';
  }
  function lienWhatsApp(texte, tel) { return 'https://wa.me/' + numeroWhatsApp(tel) + '?text=' + encodeURIComponent(texte); }
  function texteGarage(engin, tache, compteur) {
    var c = engin.unite && compteur ? ', compteur ' + compteurTxt(compteur, engin.unite, ' ') : '';
    return 'Bonjour, je voudrais faire : ' + tache.nom.toLowerCase() + ' pour ' + (engin.type === 'voiture' || engin.type === 'moto' ? 'mon véhicule ' : 'mon appareil ') + engin.nom +
      (engin.immat ? ' (' + engin.immat + ')' : '') + c + '. Quand puis-je passer ? Merci.';
  }

  // ---------- CSV ----------
  function csvCellule(v) {
    if (typeof v === 'number') return String(v);
    var s = String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u00a0\u202f]/g, ' ');
    if (/^[=+\-@\t]/.test(s)) s = '\'' + s;
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvHistorique(lignes, engins) {
    var noms = {}; (engins || []).forEach(function (e) { noms[e.id] = e.nom; });
    var out = [['Date', 'Engin', 'Catégorie', 'Libellé', 'Compteur', 'Montant (F CFA)'].map(csvCellule).join(';')];
    lignes.slice().reverse().forEach(function (l) {
      out.push([l.date, noms[l.engin] || '', (CATEGORIES[l.categorie] || CATEGORIES.autre).nom, l.libelle, l.compteur || '', l.montant].map(csvCellule).join(';'));
    });
    return out.join('\r\n') + '\r\n';
  }

  // ---------- Pass ----------
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique/commandes/';
  var PASS = { slug: 'pass-carnet-entretien-12-mois', jours: 365, prix: 1500, nom: 'Pass Carnet Entretien 12 mois' };
  var GRACE_JOURS = 1, RAPPEL_JOURS = 15;
  function lireLienCommande(texte) {
    var s = String(texte || '').trim();
    if (!s) return null;
    var o = s.match(/[?&]o=(TCV-[0-9A-HJKMNP-TV-Z]{8})(?![0-9A-Z])/i);
    var t = s.match(/[?&]t=([A-Za-z0-9_-]{20,64})(?![A-Za-z0-9_-])/);
    if (o && t) return { id: o[1].toUpperCase(), jeton: t[1] };
    var m = s.match(/TCV-[0-9A-HJKMNP-TV-Z]{8}(?![0-9A-Z])/i);
    if (!m) return null;
    var reste = s.replace(m[0], ' ').replace(/https?:\/\/\S*/g, ' ');
    var j = reste.match(/(?:^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{20,64})(?![A-Za-z0-9_-])/);
    return j ? { id: m[0].toUpperCase(), jeton: j[1] } : null;
  }
  function urlVerification(c) { return API + encodeURIComponent(c.id) + '?t=' + encodeURIComponent(c.jeton); }
  function analyserReponse(j, maintenant) {
    var c = j && j.commande;
    if (!c || typeof c !== 'object') return { ok: false, raison: 'introuvable' };
    if (!c.produit || c.produit.slug !== PASS.slug) return { ok: false, raison: 'produit', titre: (c.produit && c.produit.titre) || '' };
    if (c.payee !== true) return { ok: false, raison: 'impayee' };
    var debut = Date.parse(c.payee_le);
    if (!isFinite(debut)) return { ok: false, raison: 'impayee' };
    var fin = debut + PASS.jours * JOUR_MS, now = maintenant == null ? Date.now() : +maintenant;
    var pass = { id: String(c.id || ''), slug: PASS.slug, jours: PASS.jours, payeeLe: new Date(debut).toISOString() };
    if (now >= fin + GRACE_JOURS * JOUR_MS) return { ok: false, raison: 'expiree', fin: new Date(fin).toISOString(), pass: pass };
    return { ok: true, pass: pass, fin: new Date(fin).toISOString() };
  }
  function finDroits(passes) {
    var vus = {}, liste = [];
    (passes || []).forEach(function (p) {
      if (!p || p.slug !== PASS.slug || !isFinite(Date.parse(p.payeeLe))) return;
      if (p.id && vus[p.id]) return;
      if (p.id) vus[p.id] = 1;
      liste.push(p);
    });
    liste.sort(function (a, b) { return Date.parse(a.payeeLe) - Date.parse(b.payeeLe); });
    var fin = null;
    liste.forEach(function (p) { var d = Date.parse(p.payeeLe); fin = Math.max(fin == null ? d : fin, d) + PASS.jours * JOUR_MS; });
    return fin;
  }
  function etatPass(passes, maintenant) {
    var now = maintenant == null ? Date.now() : +maintenant, fin = finDroits(passes);
    if (fin == null) return { premium: false, jamais: true, fin: null, joursRestants: 0, rappel: false, expire: false };
    var limite = fin + GRACE_JOURS * JOUR_MS, reste = fin - now, jr = reste > 0 ? Math.ceil(reste / JOUR_MS) : 0;
    return { premium: now < limite, jamais: false, fin: new Date(fin).toISOString(), joursRestants: jr, rappel: now < limite && jr <= RAPPEL_JOURS, expire: now >= limite };
  }
  function ajouterPass(passes, pass, maintenant) {
    var l = (passes || []).filter(function (p) { return !(pass.id && p.id === pass.id); });
    l.push({ id: pass.id, slug: pass.slug, jours: pass.jours, payeeLe: pass.payeeLe, verifieLe: new Date(maintenant == null ? Date.now() : +maintenant).toISOString() });
    return l;
  }

  // ---------- Texte PDF (Windows-1252) ----------
  var CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function textePDF(s) {
    s = String(s == null ? '' : s).replace(/[\u202f\u2009\u2007\u00a0]/g, ' ').replace(/\r\n?/g, '\n');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.indexOf(ch) >= 0) { out += ch; continue; }
      if (ch === 'ŋ') { out += 'n'; continue; }
      if (ch === '−') { out += '-'; continue; }
      if (ch === '✔') { out += 'x'; continue; }
      var base = ch.normalize ? ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : ch;
      out += /^[\x20-\x7e]$/.test(base) ? base : (c >= 0xD800 && c <= 0xDBFF ? (i++, '') : '');
    }
    return out;
  }
  function nouvelId() {
    try { if (racine.crypto && racine.crypto.randomUUID) return racine.crypto.randomUUID(); } catch (e) { /* ancien navigateur */ }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
  }

  var CE = {
    JOUR_MS: JOUR_MS, formatNombre: formatNombre, f: f, decimal: decimal, lireEntier: lireEntier, lireDecimal: lireDecimal, versCl: versCl, litres: litres, somme: somme,
    pad: pad, dateISO: dateISO, versDate: versDate, dateValide: dateValide, joursEntre: joursEntre, ajouterJours: ajouterJours, ajouterMois: ajouterMois,
    MOIS: MOIS, moisFr: moisFr, dateFr: dateFr, dateCourte: dateCourte,
    TYPES: TYPES, ORDRE_TYPES: ORDRE_TYPES, MODELES: MODELES, VOYAGE: VOYAGE, VOYAGE_MOTO: VOYAGE_MOTO, nouvelleTache: nouvelleTache, nouvelEngin: nouvelEngin,
    tacheDe: tacheDe, tacheParCle: tacheParCle, uniteTxt: uniteTxt, compteurTxt: compteurTxt, rythmeTxt: rythmeTxt,
    pointsCompteur: pointsCompteur, compteurActuel: compteurActuel, usageParJour: usageParJour, seuilCompteur: seuilCompteur, etatTache: etatTache, aFaire: aFaire, RANG: RANG,
    pleinsDe: pleinsDe, consommation: consommation, prixLitre: prixLitre, libelleConso: libelleConso,
    CATEGORIES: CATEGORIES, ORDRE_CATEGORIES: ORDRE_CATEGORIES, historique: historique, totauxDepenses: totauxDepenses, coutToutCompris: coutToutCompris,
    ENGINS_GRATUITS: ENGINS_GRATUITS, enginsOrdonnes: enginsOrdonnes, peutCreerEngin: peutCreerEngin, enginModifiable: enginModifiable,
    icsTexte: icsTexte, plier: plier, ics: ics, evenementsRappel: evenementsRappel,
    numeroWhatsApp: numeroWhatsApp, lienWhatsApp: lienWhatsApp, texteGarage: texteGarage, csvCellule: csvCellule, csvHistorique: csvHistorique,
    API: API, PASS: PASS, GRACE_JOURS: GRACE_JOURS, RAPPEL_JOURS: RAPPEL_JOURS, lireLienCommande: lireLienCommande, urlVerification: urlVerification,
    analyserReponse: analyserReponse, finDroits: finDroits, etatPass: etatPass, ajouterPass: ajouterPass, textePDF: textePDF, nouvelId: nouvelId
  };
  if (typeof module === 'object' && module.exports) module.exports = CE;
  else racine.CE = CE;
})(typeof self !== 'undefined' ? self : this);
