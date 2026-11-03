/* Teranga Vitrine — logique pure (sans interface) : formats, numéros WhatsApp, commandes, stock, ventes, pass.
   Utilisable dans le navigateur (window.VT) et dans Node (module.exports) pour les tests. */
(function (racine) {
  'use strict';
  var JOUR_MS = 86400000;
  var MONTANT_MAX = 999999999999;

  // ---------------------------------------------------------------- Formats
  function formatNombre(n, sep) {
    if (sep === undefined) sep = ' ';
    n = Math.round(Number(n) || 0);
    var signe = n < 0 ? '-' : '', s = String(Math.abs(n)), out = '';
    while (s.length > 3) { out = sep + s.slice(-3) + out; s = s.slice(0, -3); }
    return signe + s + out;
  }
  function f(n) { return formatNombre(n) + ' F'; }
  function fcfa(n, sep) { return formatNombre(n, sep) + (sep === ' ' ? ' ' : ' ') + 'F CFA'; }
  // Saisie « 15 000 », « 15.000 », « 15000F » → entier ≥ 0 ; vide → null ; illisible → NaN
  function lireEntier(v) {
    if (typeof v === 'number') return isFinite(v) && v >= 0 ? Math.round(v) : NaN;
    var s = String(v == null ? '' : v).trim();
    if (!s) return null;
    s = s.replace(/[\s  .]/g, '').replace(/f(cfa)?$/i, '');
    if (!/^\d+$/.test(s)) return NaN;
    var n = parseInt(s, 10);
    return n > MONTANT_MAX ? NaN : n;
  }

  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function dateISO(d) { d = d || new Date(); return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }
  function versDate(iso) { var p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function ajouterJours(iso, j) { var d = versDate(iso); d.setDate(d.getDate() + j); return dateISO(d); }
  function dateFr(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso); }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function jourFr(iso, aujourdhui) {
    aujourdhui = aujourdhui || dateISO();
    if (iso === aujourdhui) return 'Aujourd\'hui';
    if (iso === ajouterJours(aujourdhui, -1)) return 'Hier';
    var d = versDate(iso);
    return JOURS[d.getDay()].charAt(0).toUpperCase() + JOURS[d.getDay()].slice(1) + ' ' + d.getDate() + (d.getDate() === 1 ? 'er' : '') + ' ' + MOIS[d.getMonth()] +
      (String(iso).slice(0, 4) !== aujourdhui.slice(0, 4) ? ' ' + String(iso).slice(0, 4) : '');
  }
  function sansAccents(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function nouvelId() {
    try { if (racine.crypto && racine.crypto.randomUUID) return racine.crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // ---------------------------------------------------------------- Produits
  var CATEGORIES = [
    { id: 'vetements', nom: 'Vêtements', tailles: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Taille unique'] },
    { id: 'tissus', nom: 'Tissus', tailles: ['1 mètre', '2 mètres', '3 yards', '6 yards'] },
    { id: 'chutes', nom: 'Chutes de tissu', tailles: ['Petit lot', 'Moyen lot', 'Grand lot', 'Au kilo'] },
    { id: 'cosmetiques', nom: 'Cosmétiques', tailles: ['50 ml', '100 ml', '250 ml', '500 ml', '1 litre'] },
    { id: 'plats', nom: 'Plats', tailles: ['Petit', 'Moyen', 'Grand', 'Plateau', 'Bol'] },
    { id: 'accessoires', nom: 'Accessoires', tailles: ['Taille unique'] },
    { id: 'bijoux', nom: 'Bijoux', tailles: ['Taille unique', 'Réglable'] },
    { id: 'chaussures', nom: 'Chaussures', tailles: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'] },
    { id: 'autre', nom: 'Autre', tailles: [] }
  ];
  function categorie(id) { for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i]; return CATEGORIES[CATEGORIES.length - 1]; }
  var COULEURS_NOMMEES = {
    noir: '#151515', noire: '#151515', blanc: '#ffffff', blanche: '#ffffff', rouge: '#c81e1e', bleu: '#1d4ed8', bleue: '#1d4ed8', 'bleu ciel': '#60a5fa',
    'bleu marine': '#1e2a5a', marine: '#1e2a5a', vert: '#15803d', verte: '#15803d', 'vert olive': '#6b7a2a', olive: '#6b7a2a', jaune: '#facc15',
    orange: '#f97316', rose: '#f472b6', 'rose pale': '#f9c6d6', 'vieux rose': '#c9808f', violet: '#7c3aed', violette: '#7c3aed', mauve: '#b18fcf', lilas: '#c8a2c8',
    marron: '#7c4a1e', chocolat: '#4e2a14', beige: '#e8d5b0', nude: '#e3bc9a', camel: '#c19a6b', gris: '#9ca3af', grise: '#9ca3af', dore: '#d4af37', doree: '#d4af37', or: '#d4af37',
    argent: '#c0c0c0', argente: '#c0c0c0', argentee: '#c0c0c0', bordeaux: '#7f1d1d', kaki: '#8a8a4a', creme: '#f5ecd7', ecru: '#efe6d2', fuchsia: '#d946ef',
    turquoise: '#14b8a6', corail: '#ff7f50', saumon: '#fa8072', moutarde: '#d4a017', ocre: '#cc7722', bronze: '#a97142', indigo: '#3f3fa0', prune: '#6d1d5a',
    multicolore: 'multi', wax: 'multi', imprime: 'multi', bazin: null
  };
  function couleurHex(nom) {
    var k = sansAccents(nom).replace(/\s+/g, ' ').trim();
    return Object.prototype.hasOwnProperty.call(COULEURS_NOMMEES, k) ? COULEURS_NOMMEES[k] : null;
  }
  // Prix de vente : le prix promo s'il est valable (plus petit que le prix normal)
  function enPromo(p) { var pr = Number(p && p.promo); return !!(p && pr > 0 && pr < Number(p.prix)); }
  function prixVente(p) { return enPromo(p) ? Math.round(p.promo) : Math.round(Number(p && p.prix) || 0); }
  function remisePct(p) { return enPromo(p) ? Math.round((1 - p.promo / p.prix) * 100) : 0; }
  function suiviStock(p) { return p && p.stock !== null && p.stock !== undefined && p.stock !== ''; }
  function etatStock(p) {
    if (!suiviStock(p)) return 'libre';
    if (p.stock <= 0) return 'epuise';
    if (p.stock <= 3) return 'bas';
    return 'ok';
  }
  function listeOptions(s) {
    var vus = {}, out = [];
    (Array.isArray(s) ? s : String(s || '').split(/[,;\n]/)).forEach(function (x) {
      x = String(x).trim().replace(/\s+/g, ' ');
      var k = sansAccents(x);
      if (x && !vus[k]) { vus[k] = 1; out.push(x.slice(0, 30)); }
    });
    return out.slice(0, 20);
  }
  // Contrôle d'un produit saisi → { ok, erreurs: [..], produit }
  function verifierProduit(v) {
    var e = [], nom = String(v.nom || '').trim().replace(/\s+/g, ' ');
    var prix = lireEntier(v.prix), promo = lireEntier(v.promo), stock = v.stockLibre ? null : lireEntier(v.stock);
    if (!nom) e.push('Donnez un nom au produit.');
    if (prix === null || isNaN(prix) || prix <= 0) e.push('Indiquez le prix en F CFA (un nombre entier).');
    if (promo !== null && (isNaN(promo) || promo <= 0)) e.push('Le prix promo doit être un nombre entier.');
    else if (promo !== null && prix > 0 && promo >= prix) e.push('Le prix promo doit être plus petit que le prix normal.');
    if (!v.stockLibre && (stock === null || isNaN(stock))) e.push('Indiquez le stock (nombre de pièces), ou cochez « Je ne compte pas le stock ».');
    else if (stock !== null && stock > 100000) e.push('Stock trop grand.');
    return { ok: !e.length, erreurs: e, produit: { nom: nom.slice(0, 80), prix: prix, promo: promo === null || isNaN(promo) ? null : promo,
      stock: v.stockLibre ? null : stock, tailles: listeOptions(v.tailles), couleurs: listeOptions(v.couleurs), categorie: categorie(v.categorie).id,
      description: String(v.description || '').trim().slice(0, 300) } };
  }

  // ---------------------------------------------------------------- Numéros WhatsApp
  var PAYS = [
    { code: '221', nom: 'Sénégal', local: [9] }, { code: '223', nom: 'Mali', local: [8] }, { code: '225', nom: 'Côte d\'Ivoire', local: [10] },
    { code: '224', nom: 'Guinée', local: [9] }, { code: '226', nom: 'Burkina Faso', local: [8] }, { code: '220', nom: 'Gambie', local: [7] },
    { code: '222', nom: 'Mauritanie', local: [8] }, { code: '245', nom: 'Guinée-Bissau', local: [7, 9] }, { code: '227', nom: 'Niger', local: [8] },
    { code: '228', nom: 'Togo', local: [8] }, { code: '229', nom: 'Bénin', local: [8, 10] }, { code: '237', nom: 'Cameroun', local: [9] },
    { code: '241', nom: 'Gabon', local: [8, 9] }, { code: '242', nom: 'Congo', local: [9] }, { code: '243', nom: 'RD Congo', local: [9] },
    { code: '212', nom: 'Maroc', local: [9], zero: true }, { code: '33', nom: 'France', local: [9], zero: true }, { code: '32', nom: 'Belgique', local: [8, 9], zero: true },
    { code: '39', nom: 'Italie', local: [9, 10] }, { code: '34', nom: 'Espagne', local: [9] }, { code: '1', nom: 'États-Unis / Canada', local: [10] }
  ];
  function pays(code) { for (var i = 0; i < PAYS.length; i++) if (PAYS[i].code === code) return PAYS[i]; return PAYS[0]; }
  // « 77 123 45 67 » (+ indicatif) → « 221771234567 » ; « +223 70 00 00 00 » ou « 00223… » → gardé tel quel ; invalide → null
  function normaliserNumero(saisie, indicatif) {
    var s = String(saisie || '').trim();
    if (!s) return null;
    if (/[^\d\s+().\-\/]/.test(s)) return null;
    var international = /^\s*(\+|00)/.test(s);
    var ch = s.replace(/\D/g, '');
    if (international) {
      if (ch.indexOf('00') === 0 && /^\s*00/.test(s)) ch = ch.slice(2);
      if (ch.length < 8 || ch.length > 15) return null;
      if (ch.indexOf('221') === 0 && !/^221[73]\d{8}$/.test(ch)) return null;
      return ch;
    }
    var p = pays(indicatif || '221');
    if (ch.indexOf(p.code) === 0 && p.local.indexOf(ch.length - p.code.length) >= 0 && p.local.indexOf(ch.length) < 0) ch = ch.slice(p.code.length);
    if (p.zero && ch.charAt(0) === '0') ch = ch.slice(1);
    if (p.local.indexOf(ch.length) < 0) return null;
    if (p.code === '221' && !/^[73]\d{8}$/.test(ch)) return null;
    return p.code + ch;
  }
  function afficherNumero(n) {
    n = String(n || '');
    if (!n) return '';
    var code = null;
    PAYS.slice().sort(function (a, b) { return b.code.length - a.code.length; }).some(function (p) {
      if (n.indexOf(p.code) === 0 && p.local.indexOf(n.length - p.code.length) >= 0) { code = p.code; return true; } return false;
    });
    if (!code) return '+' + n;
    var l = n.slice(code.length), g = [];
    if (code === '221') g = [l.slice(0, 2), l.slice(2, 5), l.slice(5, 7), l.slice(7)];
    else if (code === '33') g = [l.slice(0, 1)].concat((l.slice(1).match(/\d{1,2}/g) || []));
    else g = l.match(/\d{1,2}/g) || [l];
    return '+' + code + ' ' + g.join(' ');
  }
  // Numéro local (sans indicatif), pour les images : « 77 123 45 67 »
  function numeroCourt(n, indicatif) {
    var a = afficherNumero(n);
    if (indicatif && String(n).indexOf(indicatif) === 0) return a.replace('+' + indicatif + ' ', '');
    return a;
  }
  function lienWhatsApp(numero, texte) {
    return 'https://wa.me/' + (numero ? String(numero).replace(/\D/g, '') : '') + (texte ? '?text=' + encodeURIComponent(texte) : '');
  }
  function messageCommande(profil, produit, modele) {
    var nom = String((profil && profil.nom) || '').trim();
    if (!produit) {
      var m = String(modele || '').trim();
      return m || ('Bonjour' + (nom ? ' ' + nom : '') + ' ! Je voudrais commander : ');
    }
    var lignes = ['Bonjour' + (nom ? ' ' + nom : '') + ' ! Je voudrais commander « ' + produit.nom + ' » (' + fcfa(prixVente(produit), ' ') + ').'];
    if (produit.tailles && produit.tailles.length) lignes.push('Taille : ');
    if (produit.couleurs && produit.couleurs.length > 1) lignes.push('Couleur : ');
    lignes.push('Quantité : 1');
    lignes.push('Lieu de livraison : ');
    return lignes.join('\n');
  }

  // ---------------------------------------------------------------- Commandes
  function totalLignes(lignes) {
    var t = 0;
    (lignes || []).forEach(function (l) { t += Math.round(Number(l.prix) || 0) * Math.round(Number(l.qte) || 0); });
    return t;
  }
  function totalCommande(c) { return totalLignes(c && c.lignes) + Math.round(Number(c && c.frais) || 0); }
  function nbArticles(c) { var n = 0; (c && c.lignes || []).forEach(function (l) { n += Math.round(Number(l.qte) || 0); }); return n; }
  function quantitesParProduit(c) {
    var q = {};
    (c && c.lignes || []).forEach(function (l) { if (l.produitId) q[l.produitId] = (q[l.produitId] || 0) + Math.round(Number(l.qte) || 0); });
    return q;
  }
  // Contrôle du stock quand une commande est créée ou modifiée.
  // ancienne : la commande avant modification (ou null) ; nouvelle : la commande enregistrée (ou null si supprimée).
  // → { ok, manques: [{ id, nom, dispo, demande }], stocks: { id: nouveauStock } } (seulement les produits suivis qui changent)
  function mouvementStock(produits, ancienne, nouvelle) {
    var avant = quantitesParProduit(ancienne), apres = quantitesParProduit(nouvelle), ids = {}, manques = [], stocks = {};
    Object.keys(avant).concat(Object.keys(apres)).forEach(function (id) { ids[id] = 1; });
    var parId = {};
    (produits || []).forEach(function (p) { parId[p.id] = p; });
    Object.keys(ids).forEach(function (id) {
      var p = parId[id];
      if (!p || !suiviStock(p)) return;
      var delta = (apres[id] || 0) - (avant[id] || 0);
      if (!delta) return;
      var dispo = p.stock + (avant[id] || 0);
      if (delta > 0 && p.stock - delta < 0) manques.push({ id: id, nom: p.nom, dispo: dispo, demande: apres[id] || 0 });
      stocks[id] = p.stock - delta;
    });
    return { ok: !manques.length, manques: manques, stocks: stocks };
  }
  function verifierCommande(c) {
    var e = [];
    if (!String(c.client || '').trim()) e.push('Indiquez le nom du client.');
    if (!c.lignes || !c.lignes.length) e.push('Ajoutez au moins un article.');
    (c.lignes || []).forEach(function (l) {
      if (!(l.qte >= 1) || Math.round(l.qte) !== l.qte) e.push('Quantité invalide pour « ' + l.nom + ' ».');
      if (!(l.prix >= 0) || Math.round(l.prix) !== l.prix) e.push('Prix invalide pour « ' + l.nom + ' ».');
    });
    if (c.frais !== null && c.frais !== undefined && (isNaN(c.frais) || c.frais < 0)) e.push('Frais de livraison invalides.');
    return e;
  }
  // Totaux par jour : { 'AAAA-MM-JJ': { n, articles, total, encaisse, reste, aLivrer } }
  function totauxParJour(commandes) {
    var r = {};
    (commandes || []).forEach(function (c) {
      var j = r[c.date] || (r[c.date] = { date: c.date, n: 0, articles: 0, total: 0, encaisse: 0, reste: 0, aLivrer: 0 });
      var t = totalCommande(c);
      j.n++; j.articles += nbArticles(c); j.total += t;
      if (c.paye) j.encaisse += t; else j.reste += t;
      if (!c.livre) j.aLivrer++;
    });
    return r;
  }
  function totauxPeriode(commandes, debut, fin) {
    var t = { n: 0, articles: 0, total: 0, encaisse: 0, reste: 0, aLivrer: 0 };
    (commandes || []).forEach(function (c) {
      if ((debut && c.date < debut) || (fin && c.date > fin)) return;
      var m = totalCommande(c);
      t.n++; t.articles += nbArticles(c); t.total += m;
      if (c.paye) t.encaisse += m; else t.reste += m;
      if (!c.livre) t.aLivrer++;
    });
    return t;
  }
  // Meilleures ventes sur une période (dates incluses) : triées par quantité puis montant
  function meilleuresVentes(commandes, debut, fin) {
    var m = {};
    (commandes || []).forEach(function (c) {
      if ((debut && c.date < debut) || (fin && c.date > fin)) return;
      (c.lignes || []).forEach(function (l) {
        var k = l.produitId || ('nom:' + sansAccents(l.nom));
        var x = m[k] || (m[k] = { produitId: l.produitId || null, nom: l.nom, qte: 0, montant: 0, commandes: 0 });
        x.qte += Math.round(Number(l.qte) || 0); x.montant += Math.round(Number(l.prix) || 0) * Math.round(Number(l.qte) || 0); x.commandes++;
      });
    });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.qte - a.qte || b.montant - a.montant || a.nom.localeCompare(b.nom, 'fr'); });
  }
  function messageRecap(c, profil) {
    var l = ['Bonjour ' + String(c.client || '').trim() + ',', 'Merci pour votre commande' + (profil && profil.nom ? ' chez ' + profil.nom : '') + ' :'];
    (c.lignes || []).forEach(function (x) {
      var opt = [x.taille, x.couleur].filter(Boolean).join(', ');
      l.push('• ' + x.qte + ' × ' + x.nom + (opt ? ' (' + opt + ')' : '') + ' : ' + fcfa(x.prix * x.qte, ' '));
    });
    if (c.frais) l.push('• Livraison : ' + fcfa(c.frais, ' '));
    l.push('Total : ' + fcfa(totalCommande(c), ' ') + (c.paye ? ' (payé, merci !)' : ''));
    if (c.lieu) l.push('Livraison : ' + c.lieu);
    l.push(c.livre ? 'Votre commande a été livrée. À bientôt !' : 'Nous vous prévenons dès que la livraison part.');
    return l.join('\n');
  }

  // ---------------------------------------------------------------- Pass Vitrine 12 mois
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique';
  var PASS = { slug: 'pass-vitrine-12-mois', mois: 12, nom: 'Pass Vitrine 12 mois', prix: 2000 };
  var PRODUITS_GRATUITS = 12, RAPPEL_JOURS = 15;
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
  function ajouterMois(ms, n) {
    var d = new Date(ms), j = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    var dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(j, dernier));
    return d.getTime();
  }
  // Fin des droits d'un pass payé à « debut » : 12 mois + 1 jour de tolérance
  function finPass(debut) { return ajouterMois(debut, PASS.mois) + JOUR_MS; }
  // Réponse de GET /commandes/<id>?t=<jeton> → { ok, pass, fin } ou { ok: false, raison: introuvable | produit | impayee | expiree }
  function analyserReponse(j, maintenant) {
    var c = j && j.commande;
    if (!c || typeof c !== 'object') return { ok: false, raison: 'introuvable' };
    if (!c.produit || c.produit.slug !== PASS.slug) return { ok: false, raison: 'produit', titre: (c.produit && c.produit.titre) || '' };
    if (c.payee !== true) return { ok: false, raison: 'impayee' };
    var debut = Date.parse(c.payee_le);
    if (!isFinite(debut)) return { ok: false, raison: 'impayee' };
    var now = maintenant == null ? Date.now() : +maintenant;
    var pass = { id: String(c.id || ''), slug: PASS.slug, payeeLe: new Date(debut).toISOString() };
    var fin = finPass(debut);
    if (fin <= now) return { ok: false, raison: 'expiree', fin: new Date(fin).toISOString(), pass: pass };
    return { ok: true, pass: pass, fin: new Date(fin).toISOString() };
  }
  // Plusieurs pass : un renouvellement anticipé s'ajoute à la fin du précédent (aucun jour perdu)
  function finDroits(passes) {
    var vus = {}, l = [];
    (passes || []).forEach(function (p) {
      if (!p || p.slug !== PASS.slug || !isFinite(Date.parse(p.payeeLe))) return;
      if (p.id && vus[p.id]) return;
      if (p.id) vus[p.id] = 1;
      l.push(Date.parse(p.payeeLe));
    });
    l.sort(function (a, b) { return a - b; });
    var fin = null;
    l.forEach(function (d) { fin = finPass(fin == null ? d : Math.max(d, fin - JOUR_MS)); });
    return fin;
  }
  function etatPass(passes, maintenant) {
    var now = maintenant == null ? Date.now() : +maintenant, fin = finDroits(passes);
    if (fin == null) return { actif: false, jamais: true, fin: null, joursRestants: 0, rappel: false, expire: false };
    var reste = fin - now, jr = reste > 0 ? Math.ceil(reste / JOUR_MS) : 0;
    return { actif: reste > 0, jamais: false, fin: new Date(fin).toISOString(), joursRestants: jr, rappel: reste > 0 && jr <= RAPPEL_JOURS, expire: reste <= 0 };
  }
  function ajouterPass(passes, pass) {
    var l = (passes || []).filter(function (p) { return !(pass.id && p.id === pass.id); });
    l.push({ id: pass.id, slug: pass.slug, payeeLe: pass.payeeLe, verifieLe: new Date().toISOString() });
    return l;
  }
  function peutAjouterProduit(nb, actif) { return !!actif || nb < PRODUITS_GRATUITS; }

  // ---------------------------------------------------------------- Texte pour le PDF (polices standard : Windows-1252)
  var CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function textePDF(s) {
    s = String(s == null ? '' : s).replace(/[   ]/g, ' ').replace(/ /g, ' ').replace(/\r\n?/g, '\n');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.indexOf(ch) >= 0) { out += ch; continue; }
      if (ch === 'ŋ') { out += 'n'; continue; }
      if (ch === 'Ŋ') { out += 'N'; continue; }
      var base = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : ch;
      out += /^[\x20-\x7e]$/.test(base) ? base : (c >= 0xD800 && c <= 0xDBFF ? (i++, '') : '');
    }
    return out;
  }

  var VT = {
    JOUR_MS: JOUR_MS, formatNombre: formatNombre, f: f, fcfa: fcfa, lireEntier: lireEntier,
    dateISO: dateISO, ajouterJours: ajouterJours, dateFr: dateFr, jourFr: jourFr, MOIS: MOIS, sansAccents: sansAccents, nouvelId: nouvelId,
    CATEGORIES: CATEGORIES, categorie: categorie, couleurHex: couleurHex, enPromo: enPromo, prixVente: prixVente, remisePct: remisePct,
    suiviStock: suiviStock, etatStock: etatStock, listeOptions: listeOptions, verifierProduit: verifierProduit,
    PAYS: PAYS, pays: pays, normaliserNumero: normaliserNumero, afficherNumero: afficherNumero, numeroCourt: numeroCourt,
    lienWhatsApp: lienWhatsApp, messageCommande: messageCommande,
    totalLignes: totalLignes, totalCommande: totalCommande, nbArticles: nbArticles, mouvementStock: mouvementStock, verifierCommande: verifierCommande,
    totauxParJour: totauxParJour, totauxPeriode: totauxPeriode, meilleuresVentes: meilleuresVentes, messageRecap: messageRecap,
    API: API, PASS: PASS, PRODUITS_GRATUITS: PRODUITS_GRATUITS, RAPPEL_JOURS: RAPPEL_JOURS,
    lireLienCommande: lireLienCommande, urlVerification: urlVerification, ajouterMois: ajouterMois, finPass: finPass,
    analyserReponse: analyserReponse, finDroits: finDroits, etatPass: etatPass, ajouterPass: ajouterPass, peutAjouterProduit: peutAjouterProduit,
    textePDF: textePDF
  };
  if (typeof module === 'object' && module.exports) module.exports = VT;
  else racine.VT = VT;
})(typeof self !== 'undefined' ? self : this);
