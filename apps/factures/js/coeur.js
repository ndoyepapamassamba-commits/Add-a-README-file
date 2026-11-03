/* Teranga Factures — logique pure (sans interface) : montants en lettres, formats, totaux, numéros, licence.
   Utilisable dans le navigateur (window.TF) et dans Node (module.exports) pour les tests. */
(function (racine) {
  'use strict';

  // ---------- Nombres en lettres (orthographe traditionnelle) ----------
  var UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze',
    'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  var DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

  // 0 < n < 100. « fin » : le mot termine le nombre ou précède million/milliard (accord de « quatre-vingts »).
  function moinsDeCent(n, fin) {
    if (n < 20) return UNITES[n];
    var d = Math.floor(n / 10), u = n % 10;
    if (d === 7 || d === 9) {
      var base = d === 7 ? 'soixante' : 'quatre-vingt';
      if (d === 7 && u === 1) return 'soixante et onze';
      return base + '-' + UNITES[10 + u];
    }
    if (d === 8) return u === 0 ? (fin ? 'quatre-vingts' : 'quatre-vingt') : 'quatre-vingt-' + UNITES[u];
    if (u === 0) return DIZAINES[d];
    if (u === 1) return DIZAINES[d] + ' et un';
    return DIZAINES[d] + '-' + UNITES[u];
  }

  // 0 < n < 1000
  function moinsDeMille(n, fin) {
    var c = Math.floor(n / 100), r = n % 100, mots = [];
    if (c === 1) mots.push('cent');
    else if (c > 1) mots.push(UNITES[c] + ' cent' + (r === 0 && fin ? 's' : ''));
    if (r > 0) mots.push(moinsDeCent(r, fin));
    return mots.join(' ');
  }

  var MAX_LETTRES = 999999999999999; // jusqu'à 999 billions

  // Entier positif ou nul en lettres. Au-delà de la limite : null.
  function enLettres(n) {
    n = Number(n);
    if (!isFinite(n)) return null;
    n = Math.round(n);
    if (n < 0) { var p = enLettres(-n); return p === null ? null : 'moins ' + p; }
    if (n === 0) return 'zéro';
    if (n > MAX_LETTRES) return null;
    var groupes = [
      [Math.floor(n / 1e12) % 1000, 'billion'],
      [Math.floor(n / 1e9) % 1000, 'milliard'],
      [Math.floor(n / 1e6) % 1000, 'million']
    ];
    var mots = [];
    groupes.forEach(function (g) {
      if (g[0] > 0) mots.push(moinsDeMille(g[0], true) + ' ' + g[1] + (g[0] > 1 ? 's' : ''));
    });
    var milliers = Math.floor(n / 1000) % 1000, reste = n % 1000;
    if (milliers === 1) mots.push('mille');
    else if (milliers > 1) mots.push(moinsDeMille(milliers, false) + ' mille');
    if (reste > 0) mots.push(moinsDeMille(reste, true));
    return mots.join(' ');
  }

  // « deux millions de francs CFA », « un million un francs CFA », « un franc CFA »
  function sommeEnLettres(n) {
    n = Math.round(Number(n) || 0);
    var m = enLettres(n);
    if (m === null) return formatNombre(n) + ' francs CFA';
    if (Math.abs(n) <= 1) return m + ' franc CFA';
    if (n % 1000000 === 0) return m + ' de francs CFA';
    return m + ' francs CFA';
  }

  var FORMULES = {
    facture: 'Arrêté la présente facture à la somme de',
    proforma: 'Arrêté la présente facture proforma à la somme de',
    devis: 'Arrêté le présent devis à la somme de',
    recu: 'Arrêté le présent reçu à la somme de'
  };
  function phraseArrete(nature, total, sep) {
    var f = FORMULES[nature] || FORMULES.facture;
    return f + ' : ' + sommeEnLettres(total) + ' (' + formatNombre(total, sep) + ' F CFA).';
  }

  // ---------- Formats ----------
  // Espace insécable fine par défaut (écran) ; espace simple pour le PDF.
  function formatNombre(n, sep) {
    if (sep === undefined) sep = ' ';
    n = Math.round(Number(n) || 0);
    var signe = n < 0 ? '-' : '', s = String(Math.abs(n)), out = '';
    while (s.length > 3) { out = sep + s.slice(-3) + out; s = s.slice(0, -3); }
    return signe + s + out;
  }
  function formatQuantite(q, sep) {
    q = Number(q) || 0;
    if (Math.round(q) === q) return formatNombre(q, sep);
    var e = Math.trunc(q), d = String(Math.round(Math.abs(q - e) * 1000) / 1000).slice(2);
    return (q < 0 && e === 0 ? '-' : '') + formatNombre(e, sep) + ',' + d;
  }
  function fcfa(n, sep) { return formatNombre(n, sep) + (sep === ' ' ? ' ' : ' ') + 'F CFA'; }
  function f(n) { return formatNombre(n) + ' F'; }

  // Saisie : « 1 250 000 », « 2,5 », « 2.5 » → nombre
  function lireNombre(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).replace(/[\s  ]/g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function dateISO(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, j = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
  }
  function ajouterJours(iso, jours) {
    var p = String(iso).split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + jours);
    return dateISO(d);
  }
  function dateFr(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso);
  }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function moisFr(cle) { var p = String(cle).split('-'); return MOIS[+p[1] - 1] + ' ' + p[0]; }

  // ---------- Totaux ----------
  function arrondi(n) { return Math.round(n); }
  function montantLigne(l) {
    var brut = lireNombre(l.qte) * lireNombre(l.pu);
    var r = Math.min(100, Math.max(0, lireNombre(l.remise)));
    return arrondi(brut * (1 - r / 100));
  }
  function totaux(d) {
    var lignes = d.lignes || [], sousTotal = 0, remisesLignes = 0;
    lignes.forEach(function (l) {
      var brut = arrondi(lireNombre(l.qte) * lireNombre(l.pu)), net = montantLigne(l);
      sousTotal += net; remisesLignes += brut - net;
    });
    var rg = Math.max(0, lireNombre(d.remiseGlobale));
    var remise = d.remiseType === 'pct' ? arrondi(sousTotal * Math.min(100, rg) / 100) : Math.min(sousTotal, arrondi(rg));
    var ht = sousTotal - remise;
    var tva = d.tvaActive ? arrondi(ht * Math.max(0, lireNombre(d.tvaTaux)) / 100) : 0;
    var ttc = ht + tva;
    var paye = 0;
    (d.paiements || []).forEach(function (p) { paye += arrondi(lireNombre(p.montant)); });
    if (d.type === 'recu') paye = ttc;
    return { sousTotal: sousTotal, remisesLignes: remisesLignes, remise: remise, ht: ht, tva: tva, ttc: ttc,
      paye: paye, reste: Math.max(0, ttc - paye) };
  }

  // ---------- Types, numéros, statuts ----------
  var TYPES = {
    facture: { nom: 'Facture', titre: 'FACTURE', prefixe: 'FA', article: 'la facture' },
    devis: { nom: 'Devis', titre: 'DEVIS', prefixe: 'DE', article: 'le devis' },
    proforma: { nom: 'Facture proforma', titre: 'FACTURE PROFORMA', prefixe: 'PF', article: 'la facture proforma' },
    recu: { nom: 'Reçu', titre: 'REÇU', prefixe: 'RE', article: 'le reçu' }
  };
  function numero(type, annee, seq) {
    var s = String(seq); while (s.length < 4) s = '0' + s;
    return TYPES[type].prefixe + '-' + annee + '-' + s;
  }
  function estDevis(type) { return type === 'devis' || type === 'proforma'; }

  // Statut affiché : « en retard » est calculé (facture envoyée, échéance passée, reste à payer)
  function statut(d, aujourdhui) {
    aujourdhui = aujourdhui || dateISO();
    if (d.type === 'recu') return 'payee';
    if (estDevis(d.type)) return d.statut || 'brouillon';
    var t = totaux(d);
    if (d.statut === 'brouillon') return 'brouillon';
    if (t.ttc > 0 && t.reste === 0) return 'payee';
    if (d.statut === 'payee') return 'payee';
    if (d.echeance && d.echeance < aujourdhui && t.reste > 0) return 'en_retard';
    return 'envoyee';
  }
  var STATUTS = {
    brouillon: 'Brouillon', envoyee: 'Envoyée', payee: 'Payée', en_retard: 'En retard',
    accepte: 'Accepté', refuse: 'Refusé'
  };
  function libelleStatut(d, s) {
    s = s || statut(d);
    if (estDevis(d.type) && s === 'envoyee') return d.type === 'devis' ? 'Envoyé' : 'Envoyée';
    if (estDevis(d.type) && d.type === 'proforma' && (s === 'accepte' || s === 'refuse')) return STATUTS[s] + 'e';
    return STATUTS[s] || s;
  }

  // ---------- Licence ----------
  var ID_COMMANDE = /TCV-[0-9A-HJKMNP-TV-Z]{8}/i;
  // Accepte le lien complet de la page de commande, ou « TCV-XXXXXXXX » suivi du jeton.
  function lireLienCommande(texte) {
    var s = String(texte || '').trim();
    if (!s) return null;
    var o = s.match(/[?&]o=(TCV-[0-9A-HJKMNP-TV-Z]{8})(?![0-9A-Z])/i);
    var t = s.match(/[?&]t=([A-Za-z0-9_-]{20,64})(?![A-Za-z0-9_-])/);
    if (o && t) return { id: o[1].toUpperCase(), jeton: t[1] };
    var m = s.match(ID_COMMANDE);
    if (!m) return null;
    var reste = s.replace(m[0], ' ').replace(/https?:\/\/\S*?(?=\s|$)/g, ' ');
    var j = reste.match(/(?:^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{20,64})(?![A-Za-z0-9_-])/);
    if (!j) return null;
    return { id: m[0].toUpperCase(), jeton: j[1] };
  }
  var SLUG_LICENCE = 'licence-teranga-factures';
  // Réponse de GET /commandes/<id>?t=<jeton> → { ok, raison }
  function verifierReponseLicence(j) {
    var c = j && j.commande;
    if (!c) return { ok: false, raison: 'introuvable' };
    if (!c.produit || c.produit.slug !== SLUG_LICENCE) return { ok: false, raison: 'produit', titre: c.produit && c.produit.titre };
    if (c.payee !== true) return { ok: false, raison: 'impayee' };
    return { ok: true };
  }

  // ---------- Lien Wave ----------
  function lienWaveValide(u) {
    try {
      var x = new URL(String(u || '').trim());
      return x.protocol === 'https:' && /(^|\.)wave\.com$/i.test(x.hostname);
    } catch (e) { return false; }
  }

  // ---------- Texte pour le PDF (polices standard : Windows-1252) ----------
  var CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function textePDF(s) {
    s = String(s == null ? '' : s).replace(/[   ]/g, ' ').replace(/ /g, ' ').replace(/\r\n?/g, '\n');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.indexOf(ch) >= 0) { out += ch; continue; }
      if (ch === 'ŋ') { out += 'n'; continue; }
      if (ch === 'Ŋ') { out += 'N'; continue; }
      if (ch === '−') { out += '-'; continue; }
      var base = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : ch;
      out += /^[\x20-\x7e]$/.test(base) ? base : (c >= 0xD800 && c <= 0xDBFF ? (i++, '') : '');
    }
    return out;
  }

  function nouvelId() {
    try { if (racine.crypto && racine.crypto.randomUUID) return racine.crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function sansAccents(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  var TF = {
    enLettres: enLettres, sommeEnLettres: sommeEnLettres, phraseArrete: phraseArrete,
    formatNombre: formatNombre, formatQuantite: formatQuantite, fcfa: fcfa, f: f, lireNombre: lireNombre,
    dateISO: dateISO, ajouterJours: ajouterJours, dateFr: dateFr, moisFr: moisFr, MOIS: MOIS,
    montantLigne: montantLigne, totaux: totaux, TYPES: TYPES, numero: numero, estDevis: estDevis,
    statut: statut, libelleStatut: libelleStatut, STATUTS: STATUTS,
    lireLienCommande: lireLienCommande, verifierReponseLicence: verifierReponseLicence, SLUG_LICENCE: SLUG_LICENCE,
    lienWaveValide: lienWaveValide, textePDF: textePDF, nouvelId: nouvelId, sansAccents: sansAccents,
    LIMITE_GRATUITE: 10
  };
  if (typeof module === 'object' && module.exports) module.exports = TF;
  else racine.TF = TF;
})(typeof self !== 'undefined' ? self : this);
