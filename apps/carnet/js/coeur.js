/* Carnet Boutique — cœur de l'application, sans affichage : montants, soldes, rappels, calculette de marge,
   ardoise, bilan, lecture d'une phrase dictée, pass, code de verrouillage, sauvegarde.
   Fonctionne dans le navigateur (window.CB) et dans Node (require) pour les tests. */
(function (racine) {
  'use strict';
  var JOUR_MS = 86400000;
  var NBSP = ' ';

  // ---------------------------------------------------------------- Montants (F CFA : nombres entiers)
  var MONTANT_MAX = 100000000;
  function formatNombre(n, sep) {
    sep = sep == null ? NBSP : sep;
    n = Math.round(Number(n) || 0);
    var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    return (n < 0 ? '-' : '') + s;
  }
  function formatF(n, sep) {
    sep = sep == null ? NBSP : sep;
    return formatNombre(n, sep) + (sep || ' ') + 'F';
  }
  // « 2 500 », « 2.500 », « 2500 F », « 2 500 FCFA » → 2500 ; décimales, négatifs, texte → null
  function lireMontant(t) {
    var s = String(t == null ? '' : t).trim().replace(/\s*(f\s*cfa|fcfa|cfa|francs?|frs?|f)\.?$/i, '');
    s = s.replace(/[\s  ]/g, '');
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (!/^\d+$/.test(s)) return null;
    var n = parseInt(s, 10);
    return n > 0 && n <= MONTANT_MAX ? n : null;
  }
  function montantValide(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n > 0 && n <= MONTANT_MAX; }

  // ---------------------------------------------------------------- Dates (jour local « AAAA-MM-JJ »)
  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function jourLocal(d) { d = d || new Date(); return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }
  function versDate(j) { var p = String(j).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function jourValide(j) { return /^\d{4}-\d{2}-\d{2}$/.test(j || '') && jourLocal(versDate(j)) === j; }
  function decalerJour(j, n) { var d = versDate(j); d.setDate(d.getDate() + n); return jourLocal(d); }
  function ecartJours(a, b) { return Math.round((versDate(b) - versDate(a)) / JOUR_MS); }
  function dateCourte(j) { var p = String(j || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : ''; }
  function dateComplete(j) { var p = String(j || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function dateLongue(j) { var d = versDate(j); return d.getDate() + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear(); }
  function jourSemaine(j) { return JOURS[versDate(j).getDay()]; }
  // « aujourd'hui », « hier », « il y a 5 j »
  function depuisQuand(j, auj) {
    var n = ecartJours(j, auj || jourLocal());
    if (n <= 0) return "aujourd'hui";
    if (n === 1) return 'hier';
    return 'il y a ' + n + NBSP + 'j';
  }

  // ---------------------------------------------------------------- Texte
  function sansAccents(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function normaliser(s) { return sansAccents(s).toLowerCase().replace(/[’'`´-]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function majuscule(s) { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function nomPropre(s) { return String(s || '').trim().split(/\s+/).map(function (m) { return m ? m.charAt(0).toUpperCase() + m.slice(1) : m; }).join(' '); }
  function initiales(nom) {
    var m = String(nom || '?').trim().split(/\s+/).filter(Boolean);
    return ((m[0] || '?').charAt(0) + (m.length > 1 ? m[m.length - 1].charAt(0) : '')).toUpperCase();
  }
  function couleurNom(nom) { // teinte stable pour l'avatar sans photo
    var h = 0, s = normaliser(nom);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
  }

  // ---------------------------------------------------------------- Soldes du carnet
  // op : { id, clientId, type: 'credit' | 'paiement', montant (entier), articles: [{nom, qte, prix}], date: 'AAAA-MM-JJ', cree }
  function trierOps(ops) {
    return (ops || []).slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.cree || 0) - (b.cree || 0);
    });
  }
  // Résumé d'un client : crédits, paiements, reste, date de la plus ancienne dette non réglée
  // (les paiements règlent d'abord les crédits les plus anciens).
  function resumeClient(ops) {
    var liste = trierOps(ops), credits = 0, paiements = 0, nbCredits = 0, dernierPaiement = null, dernierCredit = null;
    liste.forEach(function (o) {
      if (o.type === 'paiement') { paiements += o.montant; dernierPaiement = o.date; }
      else { credits += o.montant; nbCredits++; dernierCredit = o.date; }
    });
    var solde = credits - paiements, depuis = null;
    if (solde > 0) {
      var reste = paiements;
      for (var i = 0; i < liste.length; i++) {
        var o = liste[i];
        if (o.type === 'paiement') continue;
        if (reste >= o.montant) { reste -= o.montant; continue; }
        depuis = o.date; break;
      }
    }
    return { credits: credits, paiements: paiements, solde: solde, depuis: depuis, nb: liste.length, nbCredits: nbCredits,
      dernierCredit: dernierCredit, dernierPaiement: dernierPaiement };
  }
  // Historique chronologique avec le reste après chaque ligne
  function historique(ops) {
    var s = 0;
    return trierOps(ops).map(function (o) {
      s += o.type === 'paiement' ? -o.montant : o.montant;
      return { op: o, soldeApres: s };
    });
  }
  function grouperParClient(ops) {
    var g = {};
    (ops || []).forEach(function (o) { (g[o.clientId] = g[o.clientId] || []).push(o); });
    return g;
  }
  function resumes(clients, ops) {
    var g = grouperParClient(ops), r = {};
    (clients || []).forEach(function (c) { r[c.id] = resumeClient(g[c.id] || []); });
    return r;
  }
  // Total que les clients doivent à la boutique (les avances éventuelles ne se déduisent pas)
  function totalDu(clients, res) {
    var t = 0, n = 0;
    (clients || []).forEach(function (c) { var s = res[c.id] ? res[c.id].solde : 0; if (s > 0) { t += s; n++; } });
    return { total: t, nb: n };
  }
  // Tri : 'ancien' (plus vieilles dettes d'abord), 'gros' (plus grosses dettes), 'nom'
  function trierClients(clients, res, mode) {
    var nom = function (a, b) { return String(a.nom).localeCompare(String(b.nom), 'fr', { sensitivity: 'base' }); };
    return (clients || []).slice().sort(function (a, b) {
      var ra = res[a.id] || { solde: 0 }, rb = res[b.id] || { solde: 0 };
      if (mode === 'nom') return nom(a, b);
      var da = ra.solde > 0, db = rb.solde > 0;
      if (da !== db) return da ? -1 : 1;
      if (!da) return nom(a, b);
      if (mode === 'gros') return rb.solde - ra.solde || nom(a, b);
      if (ra.depuis !== rb.depuis) return ra.depuis < rb.depuis ? -1 : 1;
      return rb.solde - ra.solde || nom(a, b);
    });
  }
  // Âge de la dette : 'frais' (≤ 7 j), 'moyen' (≤ 30 j), 'vieux'
  function niveauAge(depuis, auj) {
    if (!depuis) return null;
    var n = ecartJours(depuis, auj || jourLocal());
    return n > 30 ? 'vieux' : n > 7 ? 'moyen' : 'frais';
  }
  // Limite de crédit : nouveau reste si on note ce crédit, et dépassement éventuel
  function controleLimite(solde, montant, plafond) {
    var apres = (solde || 0) + (montant || 0);
    var p = plafond > 0 ? plafond : 0;
    return { apres: apres, plafond: p, depasse: p > 0 && apres > p, de: p > 0 ? Math.max(0, apres - p) : 0 };
  }

  // ---------------------------------------------------------------- Téléphone et WhatsApp (numéro gardé sur le téléphone)
  function normaliserTel(t) {
    var brut = String(t || '').trim();
    if (!brut) return null;
    var international = /^(\+|00)/.test(brut.replace(/[\s.\-()]/g, ''));
    var d = brut.replace(/\D/g, '');
    if (/^00/.test(d)) d = d.slice(2);
    if (!international) {
      if (d.length === 9) d = '221' + d; // numéro sénégalais sans indicatif (77…, 78…, 76…, 70…, 75…, 33…)
      else if (!(d.length === 12 && d.indexOf('221') === 0)) return null;
    }
    return d.length >= 8 && d.length <= 15 ? d : null;
  }
  function afficherTel(d) {
    if (!d) return '';
    if (/^221\d{9}$/.test(d)) return d.slice(3).replace(/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4');
    return '+' + d;
  }
  function lienWhatsApp(tel, texte) {
    return 'https://wa.me/' + (tel ? tel : '') + '?text=' + encodeURIComponent(texte);
  }
  var TONS = ['amical', 'normal', 'ferme'];
  // Message de rappel poli, que le boutiquier envoie lui-même
  function messageRappel(ton, d) {
    var nom = String(d.nom || '').trim();
    var somme = formatF(d.solde, ' ');
    var chez = d.boutique ? ' chez ' + String(d.boutique).trim() : '';
    var depuis = d.depuis ? ' depuis le ' + dateComplete(d.depuis) : '';
    var payer = d.paiement ? String(d.paiement).trim() : '';
    if (ton === 'amical') {
      return 'Salam ' + nom + ' 🙂 J\'espère que tu vas bien. Petit rappel du carnet' + chez + ' : il reste ' + somme +
        ' à régler. Passe quand tu peux.' + (payer ? ' Tu peux aussi payer par ' + payer + '.' : '') + ' Jërëjëf !';
    }
    if (ton === 'ferme') {
      return 'Bonjour ' + nom + ', votre crédit' + chez + ' est de ' + somme + depuis + '. Merci de le régler cette semaine. ' +
        'Sans règlement, je ne pourrai plus vous faire crédit.' + (payer ? ' Paiement possible par ' + payer + '.' : '') + ' Merci de votre compréhension.';
    }
    return 'Bonjour ' + nom + ', il reste ' + somme + ' à payer sur votre compte' + chez + depuis + '. Merci de passer régler dès que possible.' +
      (payer ? ' Vous pouvez aussi payer par ' + payer + '.' : '') + ' Bonne journée !';
  }

  // ---------------------------------------------------------------- Calculette de marge
  // achat : prix d'achat d'une unité (ou prixLot / nbLot) ; vente : prix de vente ou offre du client ; cible : marge voulue en %
  function arrondi5Haut(x) { return Math.ceil(x / 5 - 1e-9) * 5; }
  function calculMarge(o) {
    o = o || {};
    var achat = Number(o.achat) || 0;
    if (o.prixLot > 0 && o.nbLot > 0) achat = o.prixLot / o.nbLot;
    var vente = Number(o.vente) || 0, cible = Number(o.cible) || 0;
    var r = { achat: achat, vente: vente, cible: cible, benefice: null, tauxAchat: null, tauxVente: null, prixMin: null, verdict: null, manque: 0 };
    if (achat > 0 && cible >= 0) r.prixMin = arrondi5Haut(achat * (100 + cible) / 100);
    if (achat > 0 && vente > 0) {
      r.benefice = Math.round((vente - achat) * 100) / 100;
      r.tauxAchat = Math.round((vente - achat) / achat * 1000) / 10;   // marge sur le prix d'achat
      r.tauxVente = Math.round((vente - achat) / vente * 1000) / 10;   // part du prix de vente qui reste
      if (vente < achat) r.verdict = 'perte';
      else if (cible > 0 && vente < r.prixMin) { r.verdict = 'faible'; r.manque = r.prixMin - vente; }
      else r.verdict = 'ok';
    }
    return r;
  }
  function formatTaux(t) { return t == null ? '' : String(t).replace('.', ',') + NBSP + '%'; }

  // ---------------------------------------------------------------- Ardoise (commandes de dibiterie / restaurant)
  // commande : { id, date, client, lignes: [{nom, qte, prix}], statut: 'attente' | 'pret' | 'livre', paye: bool, carnet: bool, payeLe }
  function totalLignes(lignes) {
    return (lignes || []).reduce(function (t, l) { return t + Math.round((Number(l.qte) || 0) * (Number(l.prix) || 0)); }, 0);
  }
  function totalCommande(c) { return totalLignes(c && c.lignes); }
  function bilanArdoise(commandes, jour) {
    var b = { nb: 0, total: 0, encaisse: 0, aEncaisser: 0, auCarnet: 0, attente: 0, prets: 0, livres: 0 };
    (commandes || []).forEach(function (c) {
      if (jour && c.date !== jour) return;
      var t = totalCommande(c);
      b.nb++; b.total += t;
      if (c.paye) b.encaisse += t; else if (c.carnet) b.auCarnet += t; else b.aEncaisser += t;
      if (c.statut === 'livre') b.livres++; else if (c.statut === 'pret') b.prets++; else b.attente++;
    });
    return b;
  }

  // ---------------------------------------------------------------- Bilan d'une période
  function bilanPeriode(ops, commandes, debut, fin) {
    var b = { credits: 0, nbCredits: 0, paiements: 0, nbPaiements: 0, ardoise: 0, nbArdoise: 0, attendu: 0, parJour: {} };
    for (var j = debut; j <= fin; j = decalerJour(j, 1)) b.parJour[j] = { credits: 0, paiements: 0, ardoise: 0 };
    (ops || []).forEach(function (o) {
      if (o.date < debut || o.date > fin) return;
      if (o.type === 'paiement') { b.paiements += o.montant; b.nbPaiements++; b.parJour[o.date].paiements += o.montant; }
      else { b.credits += o.montant; b.nbCredits++; b.parJour[o.date].credits += o.montant; }
    });
    (commandes || []).forEach(function (c) {
      if (!c.paye) return;
      var j = c.payeLe || c.date;
      if (j < debut || j > fin) return;
      var t = totalCommande(c);
      b.ardoise += t; b.nbArdoise++; b.parJour[j].ardoise += t;
    });
    b.attendu = b.paiements + b.ardoise; // argent qui doit être entré dans la caisse
    return b;
  }

  // ---------------------------------------------------------------- CSV (séparateur « ; » pour Excel en français)
  function celluleCsv(v) {
    if (v == null) return '';
    if (typeof v === 'number') return String(v);
    var s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // pas de formule exécutée à l'ouverture
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(lignes) { return '﻿' + lignes.map(function (l) { return l.map(celluleCsv).join(';'); }).join('\r\n') + '\r\n'; }
  function texteArticles(articles) {
    return (articles || []).map(function (a) { return (a.qte > 1 ? a.qte + ' × ' : '') + a.nom; }).join(', ');
  }

  // ---------------------------------------------------------------- Lecture d'une phrase dictée
  // « Mamadou 2500 riz » → { type: 'credit', clientId, nom: 'Mamadou', montant: 2500, articles: [{nom: 'Riz', qte: 1, prix: 0}] }
  // Le résultat est TOUJOURS montré au boutiquier pour confirmation avant d'être noté.
  var MOTS_NOMBRES = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
    onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40,
    cinquante: 50, soixante: 60, septante: 70, huitante: 80, octante: 80, nonante: 90 };
  var MULTIPLICATEURS = { cent: 100, cents: 100, mille: 1000, milles: 1000, million: 1000000, millions: 1000000 };
  var DIZAINES_ET = { vingt: 1, trente: 1, quarante: 1, cinquante: 1, soixante: 1 };
  var ARGENT = { f: 1, fr: 1, frs: 1, franc: 1, francs: 1, fcfa: 1, cfa: 1, balles: 1, fcf: 1 };
  var UNITES = { kg: 1, kgs: 1, kilo: 1, kilos: 1, kilogramme: 1, kilogrammes: 1, g: 1, gr: 1, gramme: 1, grammes: 1, l: 1, litre: 1,
    litres: 1, paquet: 1, paquets: 1, sachet: 1, sachets: 1, boite: 1, boites: 1, pot: 1, pots: 1, piece: 1, pieces: 1,
    bouteille: 1, bouteilles: 1, tas: 1, morceau: 1, morceaux: 1, bidon: 1, bidons: 1, sac: 1, sacs: 1, carton: 1, cartons: 1,
    tablette: 1, tablettes: 1, plaquette: 1, plaquettes: 1, barre: 1, barres: 1, boule: 1, boules: 1, douzaine: 1, douzaines: 1,
    pain: 0, demi: 1, verre: 1, verres: 1, tasse: 1, tasses: 1, portion: 1, portions: 1, assiette: 1, assiettes: 1, unite: 1, unites: 1 };
  var MOTS_PAIEMENT = { paie: 1, paye: 1, payer: 1, payes: 1, payee: 1, paient: 1, verse: 1, verser: 1, versement: 1, rembourse: 1,
    rembourser: 1, remboursement: 1, regle: 1, regler: 1, reglement: 1, acompte: 1, encaisse: 1, encaisser: 1, rendu: 1, solde: 1 };
  var MOTS_CREDIT = { credit: 1, credits: 1, prend: 1, pris: 1, prendre: 1, doit: 1, dette: 1, achete: 1, acheter: 1, emprunte: 1 };
  var MOTS_VIDES = { a: 1, au: 1, aux: 1, de: 1, du: 1, des: 1, d: 1, le: 1, la: 1, les: 1, l: 1, pour: 1, avec: 1, sur: 1, en: 1,
    il: 1, elle: 1, ont: 1, client: 1, cliente: 1, note: 1, noter: 1, notez: 1, mets: 1, mettre: 1, mettez: 1, met: 1, ajoute: 1,
    ajouter: 1, ajoutez: 1, carnet: 1, compte: 1, chez: 1, son: 1, sa: 1, ses: 1, mon: 1, ma: 1, et: 1, puis: 1, plus: 1,
    aujourd: 1, hui: 1, ce: 1, matin: 1, soir: 1, euh: 1, alors: 1, donc: 1, ok: 1, voila: 1, svp: 1, merci: 1, tout: 1, total: 1 };

  function estNombreMot(m) { return MOTS_NOMBRES[m] != null || MULTIPLICATEURS[m] != null; }
  // Transforme les nombres écrits en lettres (et mélangés : « 2 mille 500 ») en chiffres. Entrée : mots normalisés.
  function nombresEnChiffres(mots) {
    var sortie = [], i = 0;
    while (i < mots.length) {
      var m = mots[i];
      var debut = estNombreMot(m) || /^\d+$/.test(m);
      // « un » / « une » seuls devant un nom restent un nombre (quantité 1) ; « et » ne démarre jamais un nombre
      if (!debut) { sortie.push(m); i++; continue; }
      var total = 0, courant = 0, j = i, precedent = null, vu = false;
      while (j < mots.length) {
        var w = mots[j];
        if (/^\d+$/.test(w)) {
          // un chiffre ne suit qu'un multiplicateur (« 2 mille 500 ») ou commence le nombre
          if (vu && !(precedent && MULTIPLICATEURS[precedent] && MULTIPLICATEURS[precedent] >= 1000)) break;
          courant += parseInt(w, 10);
        } else if (MOTS_NOMBRES[w] != null) {
          if (vu && precedent && /^\d+$/.test(precedent)) break;
          var v = MOTS_NOMBRES[w];
          if ((w === 'vingt' || w === 'vingts') && courant % 100 === 4 && precedent === 'quatre') courant += 76; // quatre-vingt
          else if (vu && v < 10 && courant % 10 !== 0) break;      // « deux trois » : deux nombres
          else if (vu && v >= 10 && v < 20 && courant % 100 !== 0 && courant % 100 !== 60 && courant % 100 !== 80) break;
          else courant += v;
        } else if (MULTIPLICATEURS[w] != null) {
          var k = MULTIPLICATEURS[w];
          if (k === 100) courant = (courant % 1000 || 1) * 100 + (courant - courant % 1000);
          else { total += (courant || 1) * k; courant = 0; }
        } else if (w === 'et' && precedent && DIZAINES_ET[precedent] && (mots[j + 1] === 'un' || mots[j + 1] === 'une' || mots[j + 1] === 'onze')) {
          j++; precedent = w; continue;
        } else break;
        precedent = w; vu = true; j++;
      }
      sortie.push(String(total + courant));
      i = j;
    }
    return sortie;
  }
  function preparerPhrase(texte) {
    var s = sansAccents(String(texte || '')).toLowerCase();
    s = s.replace(/[  ]/g, ' ');
    // milliers séparés : « 2 500 », « 10.000 », « 1,250,000 »
    s = s.replace(/\b\d{1,3}(?:[ .,]\d{3})+(?![\d,.]\d)/g, function (x) { return x.replace(/[ .,]/g, ''); });
    s = s.replace(/(\d),(\d)/g, '$1.$2');                // « 2,5 kg » → 2.5
    s = s.replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2'); // « 2500f », « 2kg »
    s = s.replace(/[’'`´\-]/g, ' ').replace(/[,;/+&]/g, ' et ').replace(/[^a-z0-9. ]+/g, ' ').replace(/\.(?!\d)/g, ' ');
    var mots = s.split(/\s+/).filter(Boolean);
    return nombresEnChiffres(mots);
  }
  function distance(a, b) { // Levenshtein, petits mots
    if (a === b) return 0;
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function motsProches(a, b) { return a === b || (a.length >= 5 && b.length >= 5 && distance(a, b) <= 1); }
  // Cherche la suite de mots du nom dans la phrase ; renvoie la position ou -1
  function chercherSuite(mots, cible) {
    if (!cible.length) return -1;
    for (var i = 0; i + cible.length <= mots.length; i++) {
      var ok = true;
      for (var k = 0; k < cible.length; k++) if (!motsProches(mots[i + k], cible[k])) { ok = false; break; }
      if (ok) return i;
    }
    return -1;
  }
  function estNombre(m) { return /^\d+(\.\d+)?$/.test(m); }

  function analyserPhrase(texte, clients, produits) {
    var mots = preparerPhrase(texte);
    var pris = mots.map(function () { return false; });
    var r = { texte: String(texte || '').trim(), type: 'credit', clientId: null, nom: '', candidats: [], montant: null, montantCalcule: false, articles: [] };

    // 1. Type : paiement ou crédit
    var nbPaie = 0, nbCredit = 0;
    mots.forEach(function (m, i) {
      if (MOTS_PAIEMENT[m]) { nbPaie++; pris[i] = true; }
      else if (MOTS_CREDIT[m]) { nbCredit++; pris[i] = true; }
    });
    if (nbPaie > 0 && nbPaie >= nbCredit) r.type = 'paiement';

    // 2. Client connu cité dans la phrase (le nom le plus long l'emporte)
    var meilleurs = [], longueur = 0, position = -1;
    (clients || []).forEach(function (c) {
      var cible = normaliser(c.nom).split(' ').filter(Boolean);
      var p = chercherSuite(mots, cible);
      if (p < 0) return;
      if (cible.length > longueur) { meilleurs = [c]; longueur = cible.length; position = p; }
      else if (cible.length === longueur) meilleurs.push(c);
    });
    if (meilleurs.length) for (var k = 0; k < longueur; k++) pris[position + k] = true;

    // 3. Nombres : quantités (suivies d'une unité ou d'un produit favori) et montant
    var favoris = (produits || []).map(function (p) { return { p: p, mots: normaliser(p.nom).split(' ').filter(function (m) { return m.length > 1 && !estNombre(m) && !UNITES[m] && !MOTS_VIDES[m]; }) }; })
      .filter(function (f) { return f.mots.length; });
    function produitEn(i) {
      if (i >= mots.length) return null;
      var w = mots[i].replace(/s$/, '');
      for (var f = 0; f < favoris.length; f++) {
        for (var q = 0; q < favoris[f].mots.length; q++) { var fm = favoris[f].mots[q].replace(/s$/, ''); if (fm === w || motsProches(fm, w)) return favoris[f].p; }
      }
      return null;
    }
    var quantites = {}, explicite = null, candidatsMontant = [];
    mots.forEach(function (m, i) {
      if (pris[i] || !estNombre(m)) return;
      var n = parseFloat(m), suivant = mots[i + 1];
      if (suivant && ARGENT[suivant] && Math.floor(n) === n) { explicite = { n: n, i: i }; pris[i + 1] = true; return; }
      if (suivant && UNITES[suivant]) { quantites[i] = n; return; }
      var apres = suivant === 'de' || suivant === 'd' ? i + 2 : i + 1;
      if (n < 100 && produitEn(apres)) { quantites[i] = n; return; }
      if (Math.floor(n) === n) candidatsMontant.push({ n: n, i: i });
    });
    var choix = explicite;
    if (!choix && candidatsMontant.length) choix = candidatsMontant.reduce(function (a, b) { return b.n > a.n ? b : a; });
    if (choix && choix.n > 0 && choix.n <= MONTANT_MAX) { r.montant = choix.n; pris[choix.i] = true; }
    // mots d'argent isolés (« mille francs » déjà converti)
    mots.forEach(function (m, i) { if (ARGENT[m] && (i === 0 || estNombre(mots[i - 1]) || pris[i - 1])) pris[i] = true; });

    // 4. Nom du client (s'il n'est pas déjà connu) : les mots avant le premier nombre, sinon après « pour » / « a »
    if (meilleurs.length === 1) { r.clientId = meilleurs[0].id; r.nom = meilleurs[0].nom; r.candidats = [meilleurs[0]]; }
    else if (meilleurs.length > 1) { r.candidats = meilleurs; r.nom = meilleurs[0].nom; }
    else {
      var nomMots = [], i0 = 0;
      while (i0 < mots.length && (MOTS_VIDES[mots[i0]] || pris[i0]) && !estNombre(mots[i0])) i0++;
      for (var i = i0; i < mots.length && !estNombre(mots[i]) && !pris[i] && !MOTS_VIDES[mots[i]] && !ARGENT[mots[i]] && nomMots.length < 4; i++) {
        if (produitEn(i) && nomMots.length) break;
        nomMots.push(i);
      }
      if (!nomMots.length || (nomMots.length && produitEn(nomMots[0]) && !/^[A-ZÀ-Ý]/.test(String(texte).trim()))) {
        nomMots = [];
        // « 2000 de lait pour Coumba »
        for (var p2 = mots.length - 1; p2 >= 0; p2--) {
          if (mots[p2] === 'pour' || mots[p2] === 'a' || mots[p2] === 'chez') {
            for (var q2 = p2 + 1; q2 < mots.length && !estNombre(mots[q2]) && !MOTS_VIDES[mots[q2]] && !ARGENT[mots[q2]] && !pris[q2] && nomMots.length < 3; q2++) nomMots.push(q2);
            break;
          }
        }
      }
      if (nomMots.length) {
        nomMots.forEach(function (x) { pris[x] = true; });
        var nomNorm = nomMots.map(function (x) { return mots[x]; }).join(' ');
        r.nom = nomPropre(retrouverOrthographe(texte, nomNorm));
        // même prénom qu'un ou plusieurs clients connus (« Mamadou » → « Mamadou Diallo »)
        var prenom = nomNorm.split(' ');
        (clients || []).forEach(function (c) {
          var cm = normaliser(c.nom).split(' ');
          if (prenom.length <= cm.length && prenom.every(function (w, k) { return motsProches(w, cm[k]); })) r.candidats.push(c);
        });
        if (r.candidats.length === 1) { r.clientId = r.candidats[0].id; r.nom = r.candidats[0].nom; }
      }
    }

    // 5. Articles : ce qui reste, coupé sur « et »
    var groupes = [], courant = [], qteDite = Object.keys(quantites).length > 0;
    mots.forEach(function (m, i) {
      if (m === 'et' || m === 'plus' || m === 'puis') { if (courant.length) groupes.push(courant); courant = []; return; }
      if (pris[i] && !(quantites[i] != null)) { if (courant.length && estNombre(m) === false && pris[i]) { /* coupe */ } return; }
      courant.push(i);
    });
    if (courant.length) groupes.push(courant);
    groupes.forEach(function (g) {
      // retirer les petits mots au début et à la fin
      while (g.length && MOTS_VIDES[mots[g[0]]] && quantites[g[0]] == null) g.shift();
      while (g.length && MOTS_VIDES[mots[g[g.length - 1]]]) g.pop();
      if (!g.length) return;
      var qte = 1, idx = g.slice();
      if (quantites[idx[0]] != null) {
        qte = quantites[idx[0]];
        var uniteApres = UNITES[mots[idx[1]]];
        if (!uniteApres) { idx.shift(); while (idx.length && MOTS_VIDES[mots[idx[0]]]) idx.shift(); }
      }
      if (!idx.length) return;
      var fav = null;
      for (var t = 0; t < idx.length && !fav; t++) fav = produitEn(idx[t]);
      if (fav) {
        var avecUnite = quantites[idx[0]] != null && UNITES[mots[idx[1]]];
        if (avecUnite) {
          var unite = mots[idx[1]];
          if (/^(kg|kgs|kilo|kilos|kilogrammes?|l|litres?)$/.test(unite) && !/\b(sac|bidon|carton)\b/.test(normaliser(fav.nom))) qte = quantites[idx[0]];
          else qte = 1;
        }
        r.articles.push({ nom: fav.nom, qte: qte, prix: Math.round(Number(fav.prix) || 0) });
      } else {
        var txt = idx.map(function (x) { return mots[x]; }).join(' ');
        r.articles.push({ nom: majuscule(retrouverOrthographe(texte, txt)), qte: quantites[idx[0]] != null && !UNITES[mots[idx[1]]] ? qte : 1, prix: 0 });
      }
    });
    // « Mamadou 2500 riz » avec le riz à 500 F : 5 × riz
    if (r.montant != null && r.articles.length === 1 && r.articles[0].prix > 0 && r.articles[0].qte === 1 && !qteDite &&
        r.montant % r.articles[0].prix === 0 && r.montant / r.articles[0].prix >= 2 && r.montant / r.articles[0].prix <= 10) {
      r.articles[0].qte = r.montant / r.articles[0].prix;
    }
    if (r.montant == null) {
      var calc = r.articles.reduce(function (t, a) { return t + Math.round(a.qte * a.prix); }, 0);
      if (calc > 0 && r.articles.every(function (a) { return a.prix > 0; })) { r.montant = calc; r.montantCalcule = true; }
    }
    if (r.type === 'paiement') r.articles = [];
    return r;
  }
  // Retrouve l'orthographe d'origine (accents, majuscules) d'une suite de mots normalisés
  function retrouverOrthographe(texte, norm) {
    var morceaux = String(texte || '').split(/[\s,;]+/).filter(Boolean);
    var cible = norm.split(' ');
    var normes = morceaux.map(function (m) { return normaliser(m); });
    for (var i = 0; i + cible.length <= morceaux.length; i++) {
      var ok = true;
      for (var k = 0; k < cible.length; k++) if (normes[i + k] !== cible[k]) { ok = false; break; }
      if (ok) return morceaux.slice(i, i + cible.length).join(' ');
    }
    return norm;
  }

  // ---------------------------------------------------------------- Pass Carnet Boutique 12 mois
  var PASS = { slug: 'pass-carnet-boutique-12-mois', jours: 366, nom: 'Pass Carnet Boutique 12 mois', prix: 3000 };
  var CLIENTS_GRATUITS = 30, ESSAI_ARDOISE = 5, RAPPEL_PASS_JOURS = 15, SAUVEGARDE_JOURS = 7;
  var API_BOUTIQUE = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique';
  // Lien complet de la page de commande (…/commande.html?o=TCV-XXXXXXXX&t=<jeton>) ou « TCV-XXXXXXXX <jeton> »
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
  function urlVerification(c) { return API_BOUTIQUE + '/commandes/' + encodeURIComponent(c.id) + '?t=' + encodeURIComponent(c.jeton); }
  // Réponse de GET /commandes/<id>?t=<jeton> → { ok, pass, fin } ou { ok: false, raison: 'introuvable' | 'produit' | 'impayee' | 'expiree' }
  function analyserReponse(j, maintenant) {
    var c = j && j.commande;
    if (!c || typeof c !== 'object') return { ok: false, raison: 'introuvable' };
    if (!c.produit || c.produit.slug !== PASS.slug) return { ok: false, raison: 'produit', titre: (c.produit && c.produit.titre) || '' };
    if (c.payee !== true) return { ok: false, raison: 'impayee' };
    var debut = Date.parse(c.payee_le);
    if (!isFinite(debut)) return { ok: false, raison: 'impayee' };
    var now = maintenant == null ? Date.now() : +maintenant;
    var fin = debut + PASS.jours * JOUR_MS;
    var pass = { id: String(c.id || ''), slug: PASS.slug, payeeLe: new Date(debut).toISOString() };
    if (fin <= now) return { ok: false, raison: 'expiree', fin: new Date(fin).toISOString(), pass: pass };
    return { ok: true, pass: pass, fin: new Date(fin).toISOString() };
  }
  // Chaque pass ajoute 366 jours ; un renouvellement anticipé ne fait perdre aucun jour.
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
    var now = maintenant == null ? Date.now() : +maintenant;
    var fin = finDroits(passes);
    if (fin == null) return { premium: false, jamais: true, fin: null, joursRestants: 0, rappel: false, expire: false };
    var reste = fin - now, jr = reste > 0 ? Math.ceil(reste / JOUR_MS) : 0;
    return { premium: reste > 0, jamais: false, fin: new Date(fin).toISOString(), joursRestants: jr, rappel: reste > 0 && jr <= RAPPEL_PASS_JOURS, expire: reste <= 0 };
  }
  function ajouterPass(passes, pass, maintenant) {
    var l = (passes || []).filter(function (p) { return !(pass.id && p.id === pass.id); });
    l.push({ id: pass.id, slug: pass.slug, payeeLe: pass.payeeLe, verifieLe: new Date(maintenant == null ? Date.now() : +maintenant).toISOString() });
    return l;
  }
  // Version gratuite : 30 clients. Rien n'est jamais bloqué de ce qui existe déjà.
  function peutAjouterClient(nbClients, premium) { return !!premium || nbClients < CLIENTS_GRATUITS; }
  function peutCreerCommande(nbCommandes, premium) { return !!premium || nbCommandes < ESSAI_ARDOISE; }

  // ---------------------------------------------------------------- Code de verrouillage (empreinte salée, jamais le code)
  var ITERATIONS = 120000;
  function versHex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); }
  function depuisHex(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
  function cryptoWeb() { return (typeof crypto !== 'undefined' && crypto.subtle) ? crypto : null; }
  function nouveauSel() { var a = new Uint8Array(16); cryptoWeb().getRandomValues(a); return versHex(a); }
  function hacherCode(code, sel, iterations) {
    var c = cryptoWeb();
    if (!c) return Promise.reject(new Error('Chiffrement indisponible sur ce navigateur.'));
    return c.subtle.importKey('raw', new TextEncoder().encode(String(code)), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return c.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: depuisHex(sel), iterations: iterations || ITERATIONS }, k, 256);
    }).then(versHex);
  }
  function codeValide(code) { return /^\d{4}$/.test(String(code || '')); }
  function creerCode(code) {
    if (!codeValide(code)) return Promise.reject(new Error('Le code doit avoir 4 chiffres.'));
    var sel = nouveauSel();
    return hacherCode(code, sel, ITERATIONS).then(function (h) { return { sel: sel, iterations: ITERATIONS, empreinte: h, cree: new Date().toISOString() }; });
  }
  function verifierCode(code, enreg) {
    if (!enreg || !enreg.sel || !enreg.empreinte) return Promise.resolve(false);
    return hacherCode(code, enreg.sel, enreg.iterations).then(function (h) {
      var diff = h.length ^ enreg.empreinte.length;
      for (var i = 0; i < h.length && i < enreg.empreinte.length; i++) diff |= h.charCodeAt(i) ^ enreg.empreinte.charCodeAt(i);
      return diff === 0;
    });
  }
  // Après 5 erreurs : attente de 30 s, puis doublée à chaque nouvelle série (5 min au plus)
  function attenteCode(echecs) { if (echecs < 5) return 0; return Math.min(300, 30 * Math.pow(2, Math.floor((echecs - 5) / 5))) * 1000; }

  // ---------------------------------------------------------------- Sauvegarde (fichier JSON)
  function nettoyerArticles(a) {
    return (Array.isArray(a) ? a : []).slice(0, 50).map(function (x) {
      return { nom: String(x && x.nom || '').slice(0, 80), qte: Math.max(0, Number(x && x.qte) || 1), prix: Math.max(0, Math.round(Number(x && x.prix) || 0)) };
    }).filter(function (x) { return x.nom; });
  }
  function validerSauvegarde(obj) {
    if (!obj || obj.app !== 'carnet-boutique' || !obj.donnees) throw new Error("Ce fichier n'est pas une sauvegarde de Carnet Boutique.");
    var d = obj.donnees, ids = {};
    var clients = (Array.isArray(d.clients) ? d.clients : []).filter(function (c) { return c && c.id && c.nom; }).map(function (c) {
      ids[c.id] = 1;
      return { id: String(c.id), nom: String(c.nom).slice(0, 60), tel: normaliserTel(c.tel) || '', plafond: Math.max(0, Math.round(Number(c.plafond) || 0)),
        photo: /^data:image\/(jpeg|png|webp);base64,/.test(c.photo || '') ? c.photo : '', cree: +c.cree || Date.now(), relances: Array.isArray(c.relances) ? c.relances.slice(-20) : [] };
    });
    var ops = (Array.isArray(d.ops) ? d.ops : []).filter(function (o) { return o && o.id && ids[o.clientId] && montantValide(o.montant) && jourValide(o.date); }).map(function (o) {
      return { id: String(o.id), clientId: String(o.clientId), type: o.type === 'paiement' ? 'paiement' : 'credit', montant: o.montant, date: o.date,
        articles: nettoyerArticles(o.articles), note: String(o.note || '').slice(0, 200), cree: +o.cree || 0, source: String(o.source || '') };
    });
    var produits = (Array.isArray(d.produits) ? d.produits : []).filter(function (p) { return p && p.id && p.nom; }).map(function (p) {
      return { id: String(p.id), nom: String(p.nom).slice(0, 60), prix: Math.max(0, Math.round(Number(p.prix) || 0)), genre: p.genre === 'plat' ? 'plat' : 'produit', ordre: +p.ordre || 0 };
    });
    var ardoise = (Array.isArray(d.ardoise) ? d.ardoise : []).filter(function (c) { return c && c.id && jourValide(c.date); }).map(function (c) {
      return { id: String(c.id), date: c.date, client: String(c.client || '').slice(0, 60), lignes: nettoyerArticles(c.lignes),
        statut: ['attente', 'pret', 'livre'].indexOf(c.statut) >= 0 ? c.statut : 'attente', paye: !!c.paye, carnet: !!c.carnet,
        payeLe: jourValide(c.payeLe) ? c.payeLe : null, cree: +c.cree || 0, note: String(c.note || '').slice(0, 200) };
    });
    var reglages = d.reglages && typeof d.reglages === 'object' ? d.reglages : {};
    return { clients: clients, ops: ops, produits: produits, ardoise: ardoise, reglages: reglages };
  }

  var CB = {
    NBSP: NBSP, JOUR_MS: JOUR_MS, MONTANT_MAX: MONTANT_MAX,
    formatNombre: formatNombre, formatF: formatF, lireMontant: lireMontant, montantValide: montantValide,
    jourLocal: jourLocal, versDate: versDate, jourValide: jourValide, decalerJour: decalerJour, ecartJours: ecartJours,
    dateCourte: dateCourte, dateComplete: dateComplete, dateLongue: dateLongue, jourSemaine: jourSemaine, depuisQuand: depuisQuand,
    sansAccents: sansAccents, normaliser: normaliser, majuscule: majuscule, nomPropre: nomPropre, initiales: initiales, couleurNom: couleurNom,
    trierOps: trierOps, resumeClient: resumeClient, historique: historique, grouperParClient: grouperParClient, resumes: resumes,
    totalDu: totalDu, trierClients: trierClients, niveauAge: niveauAge, controleLimite: controleLimite,
    normaliserTel: normaliserTel, afficherTel: afficherTel, lienWhatsApp: lienWhatsApp, TONS: TONS, messageRappel: messageRappel,
    calculMarge: calculMarge, formatTaux: formatTaux, arrondi5Haut: arrondi5Haut,
    totalLignes: totalLignes, totalCommande: totalCommande, bilanArdoise: bilanArdoise, bilanPeriode: bilanPeriode,
    csv: csv, texteArticles: texteArticles,
    preparerPhrase: preparerPhrase, analyserPhrase: analyserPhrase,
    PASS: PASS, CLIENTS_GRATUITS: CLIENTS_GRATUITS, ESSAI_ARDOISE: ESSAI_ARDOISE, RAPPEL_PASS_JOURS: RAPPEL_PASS_JOURS, SAUVEGARDE_JOURS: SAUVEGARDE_JOURS,
    API_BOUTIQUE: API_BOUTIQUE, lireLienCommande: lireLienCommande, urlVerification: urlVerification, analyserReponse: analyserReponse,
    finDroits: finDroits, etatPass: etatPass, ajouterPass: ajouterPass, peutAjouterClient: peutAjouterClient, peutCreerCommande: peutCreerCommande,
    codeValide: codeValide, creerCode: creerCode, verifierCode: verifierCode, hacherCode: hacherCode, attenteCode: attenteCode,
    validerSauvegarde: validerSauvegarde
  };
  if (typeof module === 'object' && module.exports) module.exports = CB;
  else racine.CB = CB;
})(typeof self !== 'undefined' ? self : this);
