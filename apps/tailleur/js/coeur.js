/* Carnet du Tailleur — logique pure (sans interface) : formats, mesures, commandes, paiements, planning,
   fêtes, caisse, WhatsApp, pass. Utilisable dans le navigateur (window.CT) et dans Node (require) pour les tests. */
(function (racine) {
  'use strict';
  var JOUR = 86400000;

  // ---------- Nombres et montants ----------
  function formatNombre(n, sep) {
    if (sep === undefined) sep = '\u202f';
    n = Math.round(Number(n) || 0);
    var signe = n < 0 ? '-' : '', s = String(Math.abs(n)), out = '';
    while (s.length > 3) { out = sep + s.slice(-3) + out; s = s.slice(0, -3); }
    return signe + s + out;
  }
  function f(n, sep) { return formatNombre(n, sep) + (sep === ' ' ? ' ' : '\u00a0') + 'F'; }
  // « 1 250 000 », « 2,5 », « 2.5 » → nombre
  function lireNombre(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function lireEntier(v) { return Math.max(0, Math.round(lireNombre(v))); }
  // Mesure en cm : arrondie au demi-centimètre près, vide si absente
  function lireMesure(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    var n = lireNombre(v);
    if (!(n > 0)) return null;
    return Math.round(n * 2) / 2;
  }
  function formatCm(n) {
    if (n === null || n === undefined || n === '') return '';
    var x = Math.round(Number(n) * 2) / 2;
    return (x % 1 === 0 ? String(x) : String(x).replace('.', ','));
  }

  // ---------- Montants en lettres (pour les reçus) ----------
  var UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze',
    'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  var DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
  function moinsDeCent(n, fin) {
    if (n < 20) return UNITES[n];
    var d = Math.floor(n / 10), u = n % 10;
    if (d === 7 || d === 9) {
      if (d === 7 && u === 1) return 'soixante et onze';
      return (d === 7 ? 'soixante' : 'quatre-vingt') + '-' + UNITES[10 + u];
    }
    if (d === 8) return u === 0 ? (fin ? 'quatre-vingts' : 'quatre-vingt') : 'quatre-vingt-' + UNITES[u];
    if (u === 0) return DIZAINES[d];
    if (u === 1) return DIZAINES[d] + ' et un';
    return DIZAINES[d] + '-' + UNITES[u];
  }
  function moinsDeMille(n, fin) {
    var c = Math.floor(n / 100), r = n % 100, mots = [];
    if (c === 1) mots.push('cent');
    else if (c > 1) mots.push(UNITES[c] + ' cent' + (r === 0 && fin ? 's' : ''));
    if (r > 0) mots.push(moinsDeCent(r, fin));
    return mots.join(' ');
  }
  function enLettres(n) {
    n = Math.round(Number(n));
    if (!isFinite(n) || n < 0 || n > 999999999999) return null;
    if (n === 0) return 'zéro';
    var mots = [];
    var mds = Math.floor(n / 1e9) % 1000, mns = Math.floor(n / 1e6) % 1000;
    if (mds) mots.push(moinsDeMille(mds, true) + ' milliard' + (mds > 1 ? 's' : ''));
    if (mns) mots.push(moinsDeMille(mns, true) + ' million' + (mns > 1 ? 's' : ''));
    var milliers = Math.floor(n / 1000) % 1000, reste = n % 1000;
    if (milliers === 1) mots.push('mille');
    else if (milliers > 1) mots.push(moinsDeMille(milliers, false) + ' mille');
    if (reste > 0) mots.push(moinsDeMille(reste, true));
    return mots.join(' ');
  }
  function sommeEnLettres(n) {
    n = Math.round(Number(n) || 0);
    var m = enLettres(n);
    if (m === null) return formatNombre(n) + ' francs CFA';
    if (n <= 1) return m + ' franc CFA';
    if (n % 1000000 === 0) return m + ' de francs CFA';
    return m + ' francs CFA';
  }

  // ---------- Dates (chaînes AAAA-MM-JJ, calculs en UTC pour éviter les décalages) ----------
  function dateISO(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, j = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
  }
  function versUTC(iso) { var p = String(iso).slice(0, 10).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function depuisUTC(ms) { var d = new Date(ms); var m = d.getUTCMonth() + 1, j = d.getUTCDate(); return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j; }
  function ajouterJours(iso, n) { return depuisUTC(versUTC(iso) + n * JOUR); }
  function joursEntre(a, b) { return Math.round((versUTC(b) - versUTC(a)) / JOUR); }
  function dateValide(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) && depuisUTC(versUTC(iso)) === iso; }
  function debutSemaine(iso) { var d = new Date(versUTC(iso)); return ajouterJours(iso, -((d.getUTCDay() + 6) % 7)); }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function dateFr(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso); }
  function dateLongue(iso) {
    if (!dateValide(iso)) return '';
    var d = new Date(versUTC(iso));
    return JOURS[d.getUTCDay()] + ' ' + d.getUTCDate() + (d.getUTCDate() === 1 ? 'er' : '') + ' ' + MOIS[d.getUTCMonth()];
  }
  function dateCourte(iso) {
    if (!dateValide(iso)) return '';
    var d = new Date(versUTC(iso));
    return JOURS[d.getUTCDay()].slice(0, 3) + '. ' + d.getUTCDate() + ' ' + MOIS_COURT[d.getUTCMonth()];
  }
  function cleMois(iso) { return String(iso).slice(0, 7); }
  function moisFr(cle) { var p = String(cle).split('-'); return MOIS[+p[1] - 1] + ' ' + p[0]; }
  function ajouterMois(cle, n) {
    var p = String(cle).split('-'), t = (+p[0]) * 12 + (+p[1] - 1) + n;
    var a = Math.floor(t / 12), m = t % 12 + 1;
    return a + '-' + (m < 10 ? '0' : '') + m;
  }
  // « aujourd'hui », « demain », « dans 3 jours », « hier », « il y a 4 jours »
  function relatif(iso, auj) {
    if (!dateValide(iso)) return '';
    var n = joursEntre(auj, iso);
    if (n === 0) return 'aujourd\'hui';
    if (n === 1) return 'demain';
    if (n === -1) return 'hier';
    if (n > 1) return 'dans ' + n + ' jours';
    return 'il y a ' + (-n) + ' jours';
  }

  // ---------- Mesures ----------
  // type : « tour » (mètre autour du corps) ou « long » (longueur). min/max : valeurs plausibles en cm (enfant à adulte).
  var MESURES = {
    cou: { nom: 'Tour de cou', type: 'tour', min: 22, max: 60,
      aide: 'Passez le mètre autour de la base du cou. Laissez un doigt de place entre le mètre et le cou.' },
    epaule: { nom: 'Largeur d\'épaules', type: 'long', min: 22, max: 65,
      aide: 'Dans le dos, mesurez d\'un bout d\'épaule à l\'autre, là où l\'os de l\'épaule se termine.' },
    poitrine: { nom: 'Tour de poitrine', type: 'tour', min: 45, max: 170,
      aide: 'Sous les bras, sur la partie la plus forte de la poitrine. Gardez le mètre bien droit tout autour, sans serrer.' },
    sousPoitrine: { nom: 'Tour sous la poitrine', type: 'tour', min: 45, max: 160,
      aide: 'Juste sous la poitrine, tout autour du buste. Le mètre reste bien droit dans le dos.' },
    hauteurPoitrine: { nom: 'Hauteur de poitrine', type: 'long', min: 12, max: 45,
      aide: 'Du haut de l\'épaule, près du cou, jusqu\'à la pointe de la poitrine.' },
    taille: { nom: 'Tour de taille', type: 'tour', min: 40, max: 170,
      aide: 'Autour de la taille, au niveau du nombril (ou là où la personne porte son pantalon). Sans serrer.' },
    hanches: { nom: 'Tour de hanches', type: 'tour', min: 45, max: 180,
      aide: 'Pieds joints, autour de la partie la plus forte des fesses. Le mètre reste bien droit.' },
    longueurManche: { nom: 'Longueur de manche', type: 'long', min: 20, max: 90,
      aide: 'Du bout de l\'épaule jusqu\'au poignet, le bras le long du corps, coude un peu plié.' },
    tourBras: { nom: 'Tour de bras', type: 'tour', min: 12, max: 60,
      aide: 'Autour de la partie la plus forte du haut du bras, bras détendu.' },
    poignet: { nom: 'Tour de poignet', type: 'tour', min: 10, max: 30,
      aide: 'Autour du poignet, juste au-dessus de l\'os. Ajoutez la place voulue pour la manche.' },
    longueurHaut: { nom: 'Longueur chemise / haut', type: 'long', min: 25, max: 110,
      aide: 'Du haut de l\'épaule, près du cou, jusqu\'à la longueur voulue (souvent le bas des fesses).' },
    longueurBoubou: { nom: 'Longueur boubou', type: 'long', min: 50, max: 175,
      aide: 'Du haut de l\'épaule, près du cou, jusqu\'à la cheville (ou jusqu\'au sol si le client le veut).' },
    longueurRobe: { nom: 'Longueur robe', type: 'long', min: 40, max: 175,
      aide: 'Du haut de l\'épaule, près du cou, jusqu\'à la longueur voulue par la cliente.' },
    longueurJupe: { nom: 'Longueur jupe / pagne', type: 'long', min: 25, max: 130,
      aide: 'De la taille jusqu\'à la longueur voulue (genou, mollet ou cheville).' },
    longueurPantalon: { nom: 'Longueur pantalon', type: 'long', min: 35, max: 130,
      aide: 'Sur le côté de la jambe, de la taille jusqu\'à la cheville.' },
    entrejambe: { nom: 'Entrejambe', type: 'long', min: 20, max: 100,
      aide: 'À l\'intérieur de la jambe, du haut de la cuisse jusqu\'à la cheville.' },
    cuisse: { nom: 'Tour de cuisse', type: 'tour', min: 25, max: 95,
      aide: 'Autour du haut de la cuisse, sur la partie la plus forte.' },
    bas: { nom: 'Tour de bas (cheville)', type: 'tour', min: 15, max: 60,
      aide: 'Largeur voulue en bas du pantalon : faites le tour de la cheville et du talon, pied tendu.' }
  };
  var MODELES = {
    homme: { nom: 'Homme', mesures: ['cou', 'epaule', 'poitrine', 'taille', 'hanches', 'longueurManche', 'tourBras', 'poignet',
      'longueurHaut', 'longueurBoubou', 'longueurPantalon', 'entrejambe', 'cuisse', 'bas'] },
    femme: { nom: 'Femme', mesures: ['epaule', 'poitrine', 'sousPoitrine', 'hauteurPoitrine', 'taille', 'hanches', 'longueurManche',
      'tourBras', 'longueurHaut', 'longueurRobe', 'longueurJupe', 'longueurPantalon', 'cuisse', 'cou'] },
    enfant: { nom: 'Enfant', mesures: ['cou', 'epaule', 'poitrine', 'taille', 'hanches', 'longueurManche', 'tourBras',
      'longueurHaut', 'longueurBoubou', 'longueurPantalon', 'entrejambe'] }
  };
  // null si plausible ; « petit » / « grand » sinon (simple alerte, la valeur est gardée)
  function verifierMesure(cle, val) {
    var m = MESURES[cle];
    if (!m || val === null || val === undefined) return null;
    if (val < m.min) return 'petit';
    if (val > m.max) return 'grand';
    return null;
  }
  // Toutes les mesures d'un relevé, dans l'ordre du modèle, puis les autres
  function clesReleve(r) {
    var modele = MODELES[r.modele] ? r.modele : 'homme', vu = {}, out = [];
    MODELES[modele].mesures.forEach(function (k) { vu[k] = 1; if (r.valeurs && r.valeurs[k] != null) out.push(k); });
    Object.keys(r.valeurs || {}).forEach(function (k) { if (!vu[k] && MESURES[k] && r.valeurs[k] != null) out.push(k); });
    return out;
  }
  // Différences avec le relevé précédent : { cle: +2 } (seulement les mesures présentes des deux côtés et différentes)
  function ecarts(actuel, precedent) {
    var d = {};
    if (!actuel || !precedent) return d;
    Object.keys(actuel.valeurs || {}).forEach(function (k) {
      var a = actuel.valeurs[k], b = precedent.valeurs && precedent.valeurs[k];
      if (a != null && b != null && a !== b) d[k] = Math.round((a - b) * 2) / 2;
    });
    return d;
  }
  // Relevés d'un client, du plus récent au plus ancien
  function relevesClient(releves, clientId) {
    return (releves || []).filter(function (r) { return r.clientId === clientId; }).sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.cree || 0) - (a.cree || 0);
    });
  }

  // ---------- Commandes ----------
  var STATUTS = [
    { cle: 'recu', nom: 'Reçu', aide: 'Commande et tissu reçus' },
    { cle: 'coupe', nom: 'Coupé', aide: 'Tissu coupé' },
    { cle: 'cousu', nom: 'Cousu', aide: 'Couture terminée' },
    { cle: 'essayage', nom: 'Essayage', aide: 'Essayage avec le client' },
    { cle: 'pret', nom: 'Prêt', aide: 'Habit prêt à remettre' },
    { cle: 'livre', nom: 'Livré', aide: 'Remis au client' }
  ];
  function indexStatut(s) { for (var i = 0; i < STATUTS.length; i++) if (STATUTS[i].cle === s) return i; return 0; }
  function nomStatut(s) { return STATUTS[indexStatut(s)].nom; }
  function statutSuivant(s) { var i = indexStatut(s); return i < STATUTS.length - 1 ? STATUTS[i + 1].cle : null; }
  var HABITS = ['Grand boubou', 'Boubou simple', 'Caftan', 'Taille basse', 'Ensemble pantalon', 'Chemise', 'Pantalon', 'Robe',
    'Jupe', 'Tenue enfant', 'Retouche', 'Autre'];
  var OCCASIONS = ['Tabaski', 'Korité', 'Fin d\'année', 'Mariage', 'Baptême', 'Rentrée', 'Autre'];

  function totalPaye(c) {
    var s = 0;
    (c.paiements || []).forEach(function (p) { s += lireEntier(p.montant); });
    return s;
  }
  function totauxCommande(c) {
    var prix = lireEntier(c.prix), paye = totalPaye(c);
    return { prix: prix, paye: paye, reste: Math.max(0, prix - paye), solde: prix > 0 && paye >= prix };
  }
  // Nature d'un nouveau paiement : « solde » s'il termine le paiement, sinon « acompte »
  function naturePaiement(c, montant) {
    var t = totauxCommande(c);
    return t.prix > 0 && t.paye + lireEntier(montant) >= t.prix ? 'solde' : 'acompte';
  }
  // Ce qui était payé et ce qui restait juste après un paiement donné (pour le reçu)
  function situationApres(c, paiementId) {
    var prix = lireEntier(c.prix), cumul = 0, p = null;
    var liste = (c.paiements || []).slice();
    for (var i = 0; i < liste.length; i++) {
      cumul += lireEntier(liste[i].montant);
      if (liste[i].id === paiementId) { p = liste[i]; break; }
    }
    if (!p) return null;
    return { paiement: p, prix: prix, payeAvant: cumul - lireEntier(p.montant), payeApres: cumul, reste: Math.max(0, prix - cumul) };
  }
  function pad(n, l) { var s = String(n); while (s.length < l) s = '0' + s; return s; }
  function numeroCommande(annee, seq) { return 'C-' + annee + '-' + pad(seq, 4); }
  function numeroRecu(annee, seq) { return 'R-' + annee + '-' + pad(seq, 4); }
  function pieces(c) { return Math.max(1, Math.round(lireNombre(c.pieces) || 1)); }
  function estFinie(c) { return indexStatut(c.statut) >= indexStatut('pret'); }
  // État affiché : retard, à remettre, livré, en cours
  function etatCommande(c, auj) {
    if (c.statut === 'livre') return 'livre';
    if (c.statut === 'pret') return 'pret';
    if (c.dateLivraison && c.dateLivraison < auj) return 'retard';
    return 'en_cours';
  }

  // ---------- Planning et surcharge ----------
  // Semaines (lundi → dimanche) à partir de la semaine d'aujourd'hui. « aFaire » = habits pas encore prêts.
  function semaines(commandes, capacite, auj, n, fetes) {
    var lundi0 = debutSemaine(auj), out = [], retard = { commandes: [], pieces: 0, aFaire: 0 };
    capacite = Math.max(0, lireEntier(capacite));
    for (var i = 0; i < (n || 8); i++) {
      var l = ajouterJours(lundi0, 7 * i);
      out.push({ lundi: l, dimanche: ajouterJours(l, 6), commandes: [], pieces: 0, aFaire: 0, capacite: capacite, surcharge: false, fetes: [] });
    }
    var plusTard = { commandes: [], pieces: 0, aFaire: 0 };
    (commandes || []).forEach(function (c) {
      if (c.statut === 'livre' || !dateValide(c.dateLivraison)) return;
      var p = pieces(c), af = estFinie(c) ? 0 : p, cible;
      if (c.dateLivraison < auj && !estFinie(c)) cible = retard;
      else {
        var k = Math.floor(joursEntre(lundi0, c.dateLivraison) / 7);
        cible = k < 0 ? out[0] : k < out.length ? out[k] : plusTard;
      }
      cible.commandes.push(c); cible.pieces += p; cible.aFaire += af;
    });
    var tri = function (a, b) { return a.dateLivraison < b.dateLivraison ? -1 : a.dateLivraison > b.dateLivraison ? 1 : 0; };
    out.forEach(function (s) {
      s.commandes.sort(tri);
      s.surcharge = capacite > 0 && s.aFaire > capacite;
      (fetes || []).forEach(function (fe) { if (fe.date >= s.lundi && fe.date <= s.dimanche) s.fetes.push(fe); });
    });
    retard.commandes.sort(tri); plusTard.commandes.sort(tri);
    return { semaines: out, retard: retard, plusTard: plusTard };
  }
  // Charge de la semaine d'une date de livraison (habits pas encore prêts), sans la commande « sauf »
  function chargeSemaine(commandes, dateLivraison, sauf) {
    if (!dateValide(dateLivraison)) return 0;
    var l = debutSemaine(dateLivraison), d = ajouterJours(l, 6), n = 0;
    (commandes || []).forEach(function (c) {
      if (c.id === sauf || estFinie(c) || !dateValide(c.dateLivraison)) return;
      if (c.dateLivraison >= l && c.dateLivraison <= d) n += pieces(c);
    });
    return n;
  }

  // Fêtes : dates approximatives (lune), modifiables dans les réglages
  var FETES_DEFAUT = [
    { cle: 'korite-2026', nom: 'Korité', date: '2026-03-20' },
    { cle: 'tabaski-2026', nom: 'Tabaski', date: '2026-05-27' },
    { cle: 'fin-2026', nom: 'Fin d\'année', date: '2026-12-31' },
    { cle: 'korite-2027', nom: 'Korité', date: '2027-03-10' },
    { cle: 'tabaski-2027', nom: 'Tabaski', date: '2027-05-17' },
    { cle: 'fin-2027', nom: 'Fin d\'année', date: '2027-12-31' },
    { cle: 'korite-2028', nom: 'Korité', date: '2028-02-27' },
    { cle: 'tabaski-2028', nom: 'Tabaski', date: '2028-05-06' },
    { cle: 'fin-2028', nom: 'Fin d\'année', date: '2028-12-31' }
  ];
  function fetesAVenir(fetes, auj, horizon) {
    return (fetes || FETES_DEFAUT).filter(function (fe) {
      if (!dateValide(fe.date)) return false;
      var n = joursEntre(auj, fe.date);
      return n >= 0 && n <= (horizon == null ? 60 : horizon);
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }
  // Avant chaque fête proche : habits à finir (livraison au plus tard le jour de la fête) et capacité d'ici là
  function alertesFetes(commandes, fetes, capacite, auj, horizon) {
    capacite = Math.max(0, lireEntier(capacite));
    return fetesAVenir(fetes, auj, horizon).map(function (fe) {
      var jours = joursEntre(auj, fe.date), aFaire = 0, nb = 0;
      (commandes || []).forEach(function (c) {
        if (estFinie(c) || !dateValide(c.dateLivraison) || c.dateLivraison > fe.date) return;
        aFaire += pieces(c); nb++;
      });
      var dispo = Math.floor(capacite * jours / 7);
      var niveau = aFaire > dispo ? 'surcharge' : aFaire * 10 > dispo * 8 ? 'serre' : 'ok';
      return { fete: fe, jours: jours, aFaire: aFaire, commandes: nb, capacite: dispo, niveau: niveau };
    });
  }

  // ---------- Caisse ----------
  function tousPaiements(commandes) {
    var l = [];
    (commandes || []).forEach(function (c) { (c.paiements || []).forEach(function (p) { l.push({ p: p, c: c }); }); });
    return l.sort(function (a, b) { return a.p.date < b.p.date ? 1 : a.p.date > b.p.date ? -1 : (b.p.cree || 0) - (a.p.cree || 0); });
  }
  function encaisseJour(commandes, iso) {
    var s = 0;
    (commandes || []).forEach(function (c) { (c.paiements || []).forEach(function (p) { if (p.date === iso) s += lireEntier(p.montant); }); });
    return s;
  }
  function resumeMois(commandes, cle) {
    var r = { mois: cle, encaisse: 0, paiements: 0, commandes: 0, montantCommandes: 0, livres: 0, jours: {} };
    (commandes || []).forEach(function (c) {
      (c.paiements || []).forEach(function (p) {
        if (cleMois(p.date) !== cle) return;
        var m = lireEntier(p.montant);
        r.encaisse += m; r.paiements++;
        r.jours[p.date] = r.jours[p.date] || { date: p.date, total: 0, n: 0 };
        r.jours[p.date].total += m; r.jours[p.date].n++;
      });
      if (cleMois(c.date || '') === cle) { r.commandes++; r.montantCommandes += lireEntier(c.prix); }
      if (c.statut === 'livre' && cleMois(c.livreLe || '') === cle) r.livres += pieces(c);
    });
    r.parJour = Object.keys(r.jours).sort().reverse().map(function (k) { return r.jours[k]; });
    delete r.jours;
    return r;
  }
  function resteAEncaisser(commandes) {
    var s = 0;
    (commandes || []).forEach(function (c) { s += totauxCommande(c).reste; });
    return s;
  }

  // ---------- Téléphone et WhatsApp ----------
  // Numéro pour wa.me : chiffres seuls, indicatif 221 ajouté aux numéros sénégalais à 9 chiffres
  function telWhatsApp(t) {
    var s = String(t || '').trim();
    if (!s) return '';
    var plus = /^\s*(\+|00)/.test(s);
    var d = s.replace(/\D/g, '');
    if (/^00/.test(d)) d = d.slice(2);
    if (!plus && d.length === 9 && /^(7|3)/.test(d)) d = '221' + d;
    return d.length >= 8 && d.length <= 15 ? d : '';
  }
  function lienWhatsApp(tel, texte) {
    var n = telWhatsApp(tel);
    return 'https://wa.me/' + n + '?text=' + encodeURIComponent(texte);
  }
  function texteHabit(c) {
    var h = String(c.habit || '').trim(), m = String(c.modele || '').trim();
    var t = m ? (h && m.toLowerCase().indexOf(h.toLowerCase()) < 0 ? h + ' (' + m + ')' : m) : (h || 'votre habit');
    return pieces(c) > 1 ? t + ', ' + pieces(c) + ' pièces' : t;
  }
  function signature(atelier) {
    var a = atelier || {}, l = [];
    if (a.nom) l.push(a.nom);
    if (a.adresse) l.push(String(a.adresse).replace(/\s*\n\s*/g, ', '));
    if (a.telephone) l.push('Tél. ' + a.telephone);
    return l.join('\n');
  }
  function messagePret(c, client, atelier) {
    var t = totauxCommande(c), nom = client && client.nom ? ' ' + client.nom : '';
    var s = 'Bonjour' + nom + ',\nVotre habit est prêt : ' + texteHabit(c) + '.\n';
    s += 'Vous pouvez passer le récupérer' + (atelier && atelier.nom ? ' chez ' + atelier.nom : '') + '.\n';
    s += t.reste > 0 ? 'Reste à payer : ' + f(t.reste, ' ') + '.\n' : 'Tout est déjà payé.\n';
    s += 'Merci pour votre confiance !';
    var sig = signature(atelier);
    return sig ? s + '\n\n' + sig : s;
  }
  function messageEssayage(c, client, atelier) {
    var nom = client && client.nom ? ' ' + client.nom : '';
    var s = 'Bonjour' + nom + ',\nPetit rappel : votre essayage (' + texteHabit(c) + ') est prévu ' +
      (dateValide(c.dateEssayage) ? 'le ' + dateLongue(c.dateEssayage) : 'bientôt') + '.\nÀ bientôt !';
    var sig = signature(atelier);
    return sig ? s + '\n\n' + sig : s;
  }
  function messageRecu(c, client, atelier, paiementId) {
    var sit = situationApres(c, paiementId);
    if (!sit) return '';
    var nom = client && client.nom ? ' ' + client.nom : '';
    var s = 'Bonjour' + nom + ',\nNous avons bien reçu ' + f(sit.paiement.montant, ' ') + ' pour ' + texteHabit(c) +
      (sit.paiement.recu ? ' (reçu ' + sit.paiement.recu + ')' : '') + '.\n';
    s += sit.reste > 0 ? 'Reste à payer : ' + f(sit.reste, ' ') + '.' : 'Tout est payé. Merci !';
    if (sit.reste > 0 && dateValide(c.dateLivraison)) s += '\nLivraison prévue le ' + dateLongue(c.dateLivraison) + '.';
    var sig = signature(atelier);
    return sig ? s + '\n\n' + sig : s;
  }

  // ---------- Texte pour le PDF (polices standard : Windows-1252) ----------
  var CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function textePDF(s) {
    s = String(s == null ? '' : s).replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/\r\n?/g, '\n');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.indexOf(ch) >= 0) { out += ch; continue; }
      if (ch === '−') { out += '-'; continue; }
      if (ch === 'ŋ') { out += 'n'; continue; }
      if (ch === 'Ŋ') { out += 'N'; continue; }
      var base = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : ch;
      out += /^[\x20-\x7e]$/.test(base) ? base : (c >= 0xD800 && c <= 0xDBFF ? (i++, '') : '');
    }
    return out;
  }
  function sansAccents(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function nouvelId() {
    try { if (racine.crypto && racine.crypto.randomUUID) return racine.crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // ---------- Pass (version gratuite : 15 clients) ----------
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique';
  var PASS = { slug: 'pass-carnet-tailleur-12-mois', jours: 365, prix: 3000, nom: 'Pass Carnet du Tailleur 12 mois' };
  var LIMITE_CLIENTS = 15, RAPPEL_JOURS = 15;
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
  function urlVerification(c) { return API + '/commandes/' + encodeURIComponent(c.id) + '?t=' + encodeURIComponent(c.jeton); }
  function urlProduit() { return '../../boutique/' + PASS.slug + '.html'; }
  // Réponse de GET /commandes/<id>?t=<jeton> → { ok, pass, fin } ou { ok: false, raison }
  // Valide si payée, bon produit et payée il y a moins de 365 jours (+1 jour de tolérance).
  function analyserReponse(j, maintenant) {
    var c = j && j.commande;
    if (!c || typeof c !== 'object') return { ok: false, raison: 'introuvable' };
    var slug = c.produit && c.produit.slug;
    if (slug !== PASS.slug) return { ok: false, raison: 'produit', titre: (c.produit && c.produit.titre) || '' };
    if (c.payee !== true) return { ok: false, raison: 'impayee' };
    var debut = Date.parse(c.payee_le);
    if (!isFinite(debut)) return { ok: false, raison: 'impayee' };
    var pass = { id: String(c.id || ''), slug: slug, payeeLe: new Date(debut).toISOString() };
    var fin = debut + (PASS.jours + 1) * JOUR;
    var now = maintenant == null ? Date.now() : +maintenant;
    if (now > fin) return { ok: false, raison: 'expiree', fin: new Date(fin).toISOString(), pass: pass };
    return { ok: true, pass: pass, fin: new Date(fin).toISOString() };
  }
  // Fin des droits : chaque pass ajoute 365 jours (un renouvellement anticipé ne fait rien perdre), +1 jour de tolérance
  function finDroits(passes) {
    var vus = {}, liste = [];
    (passes || []).forEach(function (p) {
      if (!p || p.slug !== PASS.slug || !isFinite(Date.parse(p.payeeLe))) return;
      if (p.id && vus[p.id]) return;
      if (p.id) vus[p.id] = 1;
      liste.push(p);
    });
    if (!liste.length) return null;
    liste.sort(function (a, b) { return Date.parse(a.payeeLe) - Date.parse(b.payeeLe); });
    var fin = null;
    liste.forEach(function (p) { var d = Date.parse(p.payeeLe); fin = Math.max(fin == null ? d : fin, d) + PASS.jours * JOUR; });
    return fin + JOUR;
  }
  function etatPass(passes, maintenant) {
    var now = maintenant == null ? Date.now() : +maintenant, fin = finDroits(passes);
    if (fin == null) return { actif: false, jamais: true, fin: null, joursRestants: 0, rappel: false, expire: false };
    var reste = fin - now, jr = reste > 0 ? Math.ceil(reste / JOUR) : 0;
    return { actif: reste > 0, jamais: false, fin: new Date(fin).toISOString(), joursRestants: jr, rappel: reste > 0 && jr <= RAPPEL_JOURS, expire: reste <= 0 };
  }
  function ajouterPass(passes, pass, maintenant) {
    var l = (passes || []).filter(function (p) { return !(pass.id && p.id === pass.id); });
    l.push({ id: pass.id, slug: pass.slug, payeeLe: pass.payeeLe, verifieLe: new Date(maintenant == null ? Date.now() : +maintenant).toISOString() });
    return l;
  }
  function peutAjouterClient(nbClients, actif) { return !!actif || nbClients < LIMITE_CLIENTS; }

  // ---------- Sauvegarde ----------
  function validerSauvegarde(o) {
    if (!o || typeof o !== 'object' || o.application !== 'carnet-tailleur') return 'Ce fichier n\'est pas une sauvegarde du Carnet du Tailleur.';
    if (!Array.isArray(o.clients) || !Array.isArray(o.releves) || !Array.isArray(o.commandes)) return 'Sauvegarde incomplète ou abîmée.';
    var ok = o.clients.every(function (c) { return c && typeof c.id === 'string' && typeof c.nom === 'string'; }) &&
      o.releves.every(function (r) { return r && typeof r.id === 'string' && typeof r.clientId === 'string'; }) &&
      o.commandes.every(function (c) { return c && typeof c.id === 'string' && typeof c.clientId === 'string'; });
    return ok ? null : 'Sauvegarde abîmée : certaines fiches sont illisibles.';
  }

  var CT = {
    JOUR: JOUR, formatNombre: formatNombre, f: f, lireNombre: lireNombre, lireEntier: lireEntier, lireMesure: lireMesure, formatCm: formatCm,
    enLettres: enLettres, sommeEnLettres: sommeEnLettres,
    dateISO: dateISO, ajouterJours: ajouterJours, joursEntre: joursEntre, dateValide: dateValide, debutSemaine: debutSemaine,
    dateFr: dateFr, dateLongue: dateLongue, dateCourte: dateCourte, cleMois: cleMois, moisFr: moisFr, ajouterMois: ajouterMois, relatif: relatif, MOIS: MOIS,
    MESURES: MESURES, MODELES: MODELES, verifierMesure: verifierMesure, clesReleve: clesReleve, ecarts: ecarts, relevesClient: relevesClient,
    STATUTS: STATUTS, indexStatut: indexStatut, nomStatut: nomStatut, statutSuivant: statutSuivant, HABITS: HABITS, OCCASIONS: OCCASIONS,
    totalPaye: totalPaye, totauxCommande: totauxCommande, naturePaiement: naturePaiement, situationApres: situationApres,
    numeroCommande: numeroCommande, numeroRecu: numeroRecu, pieces: pieces, estFinie: estFinie, etatCommande: etatCommande,
    semaines: semaines, chargeSemaine: chargeSemaine, FETES_DEFAUT: FETES_DEFAUT, fetesAVenir: fetesAVenir, alertesFetes: alertesFetes,
    tousPaiements: tousPaiements, encaisseJour: encaisseJour, resumeMois: resumeMois, resteAEncaisser: resteAEncaisser,
    telWhatsApp: telWhatsApp, lienWhatsApp: lienWhatsApp, texteHabit: texteHabit, messagePret: messagePret, messageEssayage: messageEssayage, messageRecu: messageRecu,
    textePDF: textePDF, sansAccents: sansAccents, nouvelId: nouvelId,
    API: API, PASS: PASS, LIMITE_CLIENTS: LIMITE_CLIENTS, RAPPEL_JOURS: RAPPEL_JOURS, lireLienCommande: lireLienCommande, urlVerification: urlVerification,
    urlProduit: urlProduit, analyserReponse: analyserReponse, finDroits: finDroits, etatPass: etatPass, ajouterPass: ajouterPass, peutAjouterClient: peutAjouterClient,
    validerSauvegarde: validerSauvegarde
  };
  if (typeof module === 'object' && module.exports) module.exports = CT;
  else racine.CT = CT;
})(typeof self !== 'undefined' ? self : this);
