/* Teranga Partage Frais — logique pure : parts exactes en F CFA, soldes, remboursements minimum, résumé, pass.
   Utilisable dans le navigateur (window.PF) et dans Node (module.exports) pour les tests.
   L'application ne détient ni ne déplace jamais d'argent : elle calcule, les membres remboursent eux-mêmes. */
(function (racine) {
  'use strict';
  var JOUR_MS = 86400000, MONTANT_MAX = 999999999999;

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
  function lireEntier(v) {
    if (typeof v === 'number') return isFinite(v) && v >= 0 && Math.round(v) === v ? v : NaN;
    var s = String(v == null ? '' : v).trim();
    if (!s) return null;
    s = s.replace(/[\s  .]/g, '').replace(/f(cfa)?$/i, '');
    if (!/^\d+$/.test(s)) return NaN;
    var n = parseInt(s, 10);
    return n > MONTANT_MAX ? NaN : n;
  }
  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function dateISO(d) { d = d || new Date(); return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }
  function dateFr(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso); }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function dateLongue(iso) { var p = String(iso).split('-'); return (+p[2] === 1 ? '1er' : +p[2]) + ' ' + MOIS[+p[1] - 1] + ' ' + p[0]; }
  function sansAccents(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function nouvelId() {
    try { if (racine.crypto && racine.crypto.randomUUID) return racine.crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  var TYPES = [
    { id: 'amis', nom: 'Amis', titres: ['Restaurant', 'Dibiterie', 'Boissons', 'Taxi', 'Cinéma', 'Courses'] },
    { id: 'colocation', nom: 'Colocation', titres: ['Loyer', 'Électricité', 'Eau', 'Internet', 'Gaz', 'Courses', 'Ménage'] },
    { id: 'voyage', nom: 'Voyage', titres: ['Hébergement', 'Location voiture', 'Carburant', 'Repas', 'Billets', 'Excursion'] },
    { id: 'bapteme', nom: 'Baptême', titres: ['Mouton', 'Traiteur', 'Chaises et bâches', 'Sono', 'Boissons', 'Habits'] },
    { id: 'cotisation', nom: 'Cotisation', titres: ['Location salle', 'Repas', 'Transport', 'Décoration', 'Cadeau', 'Sono'] },
    { id: 'famille', nom: 'Famille', titres: ['Courses', 'Factures', 'Transport', 'Pharmacie', 'École'] },
    { id: 'autre', nom: 'Autre', titres: ['Courses', 'Repas', 'Transport'] }
  ];
  function type(id) { for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i]; return TYPES[TYPES.length - 1]; }

  // ---------------------------------------------------------------- Parts d'une dépense (entiers exacts)
  // dep : { montant, payeur, repartition: { mode: 'egal' | 'montants' | 'parts', ids: [membres concernés], valeurs: { id: n } } }
  // ordre : identifiants des membres dans l'ordre du groupe. → { id: part } dont la somme vaut exactement le montant
  function partsDepense(dep, ordre) {
    var M = Math.round(Number(dep.montant) || 0), R = dep.repartition || {}, ids = (R.ids || []).slice(), out = {};
    if (ordre) ids.sort(function (a, b) { return ordre.indexOf(a) - ordre.indexOf(b); });
    if (!ids.length || M <= 0) return out;
    if (R.mode === 'montants') {
      ids.forEach(function (id) { out[id] = Math.round(Number((R.valeurs || {})[id]) || 0); });
      return out;
    }
    var poids = ids.map(function (id) { return R.mode === 'parts' ? Math.max(0, Math.round(Number((R.valeurs || {})[id]) || 0)) : 1; });
    var W = poids.reduce(function (a, b) { return a + b; }, 0);
    if (!W) return out;
    // part entière puis répartition des francs restants : plus grand reste d'abord, puis celui qui a payé, puis l'ordre du groupe
    var reste = M, rang = [];
    ids.forEach(function (id, i) {
      var num = M * poids[i], q = Math.floor(num / W);
      out[id] = q; reste -= q;
      rang.push({ id: id, r: num - q * W, i: i, p: poids[i] });
    });
    rang.sort(function (a, b) { return b.r - a.r || (b.id === dep.payeur) - (a.id === dep.payeur) || a.i - b.i; });
    for (var k = 0; reste > 0 && k < rang.length; k++) { if (rang[k].p > 0) { out[rang[k].id]++; reste--; } if (k === rang.length - 1 && reste > 0) k = -1; }
    return out;
  }
  function verifierDepense(dep, membres) {
    var e = [], ids = (membres || []).map(function (m) { return m.id; }), R = dep.repartition || {};
    if (!String(dep.titre || '').trim()) e.push('Écrivez ce qui a été payé (ex. : Courses).');
    if (!(dep.montant > 0) || Math.round(dep.montant) !== dep.montant) e.push('Indiquez le montant en F CFA (un nombre entier).');
    if (ids.indexOf(dep.payeur) < 0) e.push('Choisissez qui a payé.');
    var concernes = (R.ids || []).filter(function (id) { return ids.indexOf(id) >= 0; });
    if (!concernes.length) e.push('Choisissez pour qui la dépense a été faite.');
    if (R.mode === 'montants' && concernes.length && dep.montant > 0) {
      var s = 0, bad = false;
      concernes.forEach(function (id) { var v = Number((R.valeurs || {})[id]); if (!(v >= 0) || Math.round(v) !== v) bad = true; s += v || 0; });
      if (bad) e.push('Chaque montant doit être un nombre entier.');
      else if (s !== dep.montant) e.push('La somme des montants (' + fcfa(s, ' ') + ') doit être égale au total (' + fcfa(dep.montant, ' ') + ') : ' + (s < dep.montant ? 'il reste ' + fcfa(dep.montant - s, ' ') + ' à répartir.' : 'il y a ' + fcfa(s - dep.montant, ' ') + ' de trop.'));
    }
    if (R.mode === 'parts' && concernes.length) {
      var w = 0; concernes.forEach(function (id) { var v = Number((R.valeurs || {})[id]); if (v >= 0 && Math.round(v) === v) w += v; });
      if (!w) e.push('Indiquez au moins une part.');
    }
    return e;
  }
  function verifierRemboursement(r, membres) {
    var e = [], ids = (membres || []).map(function (m) { return m.id; });
    if (ids.indexOf(r.de) < 0 || ids.indexOf(r.a) < 0) e.push('Choisissez qui a remboursé et qui a reçu.');
    else if (r.de === r.a) e.push('Une personne ne peut pas se rembourser elle-même.');
    if (!(r.montant > 0) || Math.round(r.montant) !== r.montant) e.push('Indiquez le montant en F CFA (un nombre entier).');
    return e;
  }

  // ---------------------------------------------------------------- Soldes
  // Solde > 0 : la personne doit recevoir ; solde < 0 : elle doit donner. La somme des soldes vaut toujours 0.
  function bilan(groupe, operations) {
    var ordre = groupe.membres.map(function (m) { return m.id; }), b = {};
    ordre.forEach(function (id) { b[id] = { paye: 0, part: 0, envoye: 0, recu: 0, solde: 0 }; });
    var total = 0, n = 0;
    (operations || []).forEach(function (o) {
      if (o.type === 'remboursement') {
        if (b[o.de]) { b[o.de].envoye += o.montant; b[o.de].solde += o.montant; }
        if (b[o.a]) { b[o.a].recu += o.montant; b[o.a].solde -= o.montant; }
        return;
      }
      if (!b[o.payeur]) return;
      var parts = partsDepense(o, ordre);
      b[o.payeur].paye += o.montant; b[o.payeur].solde += o.montant;
      Object.keys(parts).forEach(function (id) { if (b[id]) { b[id].part += parts[id]; b[id].solde -= parts[id]; } });
      total += o.montant; n++;
    });
    return { membres: b, total: total, nbDepenses: n };
  }
  function soldes(groupe, operations) {
    var b = bilan(groupe, operations).membres, s = {};
    Object.keys(b).forEach(function (id) { s[id] = b[id].solde; });
    return s;
  }

  // ---------------------------------------------------------------- Remboursements : nombre minimum de virements
  // Méthode exacte : le minimum vaut (personnes non soldées) − (nombre maximal de sous-groupes de somme nulle).
  // 1) on met de côté les paires « +x / −x » (toujours optimal) ; 2) programmation dynamique sur les sous-ensembles
  // (jusqu'à 18 personnes restantes) ; 3) au-delà, méthode gloutonne (au plus n − 1 virements, sans garantie du minimum).
  var MAX_EXACT = 18;
  function reglerGroupe(ids, v, out) {
    var cred = [], deb = [];
    ids.forEach(function (id, i) { if (v[i] > 0) cred.push({ id: id, m: v[i] }); else if (v[i] < 0) deb.push({ id: id, m: -v[i] }); });
    var tri = function (a, b) { return b.m - a.m; };
    cred.sort(tri); deb.sort(tri);
    var i = 0, j = 0;
    while (i < deb.length && j < cred.length) {
      var t = Math.min(deb[i].m, cred[j].m);
      if (t > 0) out.push({ de: deb[i].id, a: cred[j].id, montant: t });
      deb[i].m -= t; cred[j].m -= t;
      if (!deb[i].m) i++;
      if (!cred[j].m) j++;
    }
  }
  function reglements(s, ordre) {
    var ids = (ordre || Object.keys(s)).filter(function (id) { return s[id] && Math.round(s[id]) !== 0; });
    var out = [], restants = [], pris = {};
    // 1) paires exactes
    ids.forEach(function (a) {
      if (pris[a] || s[a] >= 0) return;
      for (var k = 0; k < ids.length; k++) {
        var b = ids[k];
        if (!pris[b] && b !== a && s[b] === -s[a]) { pris[a] = pris[b] = 1; out.push({ de: a, a: b, montant: s[b] }); return; }
      }
    });
    ids.forEach(function (id) { if (!pris[id]) restants.push(id); });
    var n = restants.length;
    if (!n) return out;
    var v = restants.map(function (id) { return s[id]; });
    if (n > MAX_EXACT) { reglerGroupe(restants, v, out); return out; }
    // 2) programmation dynamique : dp[masque] = nombre maximal de groupes de somme nulle
    var N = 1 << n, somme = new Float64Array(N), dp = new Int8Array(N);
    for (var m = 1; m < N; m++) {
      var bas = m & -m, i = 31 - Math.clz32(bas);
      somme[m] = somme[m ^ bas] + v[i];
      var best = 0;
      for (var k = 0; k < n; k++) if (m & (1 << k)) { var d = dp[m ^ (1 << k)]; if (d > best) best = d; }
      dp[m] = best + (somme[m] === 0 ? 1 : 0);
    }
    // reconstruction : on retire un à un les éléments ; chaque retour à une somme nulle ferme un groupe
    var masque = N - 1, groupe = [];
    while (masque) {
      var cible = dp[masque] - (somme[masque] === 0 ? 1 : 0);
      for (var x = 0; x < n; x++) {
        if ((masque & (1 << x)) && dp[masque ^ (1 << x)] === cible) { groupe.push(x); masque ^= (1 << x); break; }
      }
      if (somme[masque] === 0) {
        reglerGroupe(groupe.map(function (q) { return restants[q]; }), groupe.map(function (q) { return v[q]; }), out);
        groupe = [];
      }
    }
    return out;
  }
  // Applique des virements à des soldes (pour vérifier)
  function appliquer(s, virements) {
    var r = {};
    Object.keys(s).forEach(function (id) { r[id] = s[id]; });
    virements.forEach(function (t) { r[t.de] += t.montant; r[t.a] -= t.montant; });
    return r;
  }

  // ---------------------------------------------------------------- Résumé à partager
  function nomMembre(groupe, id) { for (var i = 0; i < groupe.membres.length; i++) if (groupe.membres[i].id === id) return groupe.membres[i].nom; return '?'; }
  function resume(groupe, operations) {
    var b = bilan(groupe, operations), ordre = groupe.membres.map(function (m) { return m.id; });
    var s = soldes(groupe, operations), r = reglements(s, ordre), F = function (n) { return fcfa(n, ' '); };
    var l = ['*' + groupe.nom + '* (' + type(groupe.type).nom.toLowerCase() + ')', 'Total des dépenses : ' + F(b.total) + ' (' + b.nbDepenses + ' dépense' + (b.nbDepenses > 1 ? 's' : '') + ')', ''];
    l.push('*Qui a payé, la part de chacun :*');
    groupe.membres.forEach(function (m) {
      var x = b.membres[m.id];
      l.push('• ' + m.nom + ' : a payé ' + F(x.paye) + ', sa part ' + F(x.part) + (x.solde > 0 ? ' → doit recevoir ' + F(x.solde) : x.solde < 0 ? ' → doit donner ' + F(-x.solde) : ' → à jour'));
    });
    l.push('');
    if (r.length) {
      l.push('*Pour tout régler (' + r.length + ' remboursement' + (r.length > 1 ? 's' : '') + ') :*');
      r.forEach(function (t, i) { l.push((i + 1) + '. ' + nomMembre(groupe, t.de) + ' donne ' + F(t.montant) + ' à ' + nomMembre(groupe, t.a)); });
    } else l.push('*Tout est réglé.* Personne ne doit rien.');
    l.push('', 'Chacun rembourse directement (espèces, Wave, Orange Money…). Fait avec Teranga Partage Frais.');
    return l.join('\n');
  }

  // ---------------------------------------------------------------- Pass Partage Frais 12 mois
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique';
  var PASS = { slug: 'pass-partage-frais-12-mois', mois: 12, nom: 'Pass Partage Frais 12 mois', prix: 1000 };
  var GROUPES_GRATUITS = 1, DEPENSES_GRATUITES = 20, RAPPEL_JOURS = 15;
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
    d.setUTCDate(Math.min(j, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
    return d.getTime();
  }
  function finPass(debut) { return ajouterMois(debut, PASS.mois) + JOUR_MS; }
  function analyserReponse(j, maintenant) {
    var c = j && j.commande;
    if (!c || typeof c !== 'object') return { ok: false, raison: 'introuvable' };
    if (!c.produit || c.produit.slug !== PASS.slug) return { ok: false, raison: 'produit', titre: (c.produit && c.produit.titre) || '' };
    if (c.payee !== true) return { ok: false, raison: 'impayee' };
    var debut = Date.parse(c.payee_le);
    if (!isFinite(debut)) return { ok: false, raison: 'impayee' };
    var now = maintenant == null ? Date.now() : +maintenant, fin = finPass(debut);
    var pass = { id: String(c.id || ''), slug: PASS.slug, payeeLe: new Date(debut).toISOString() };
    if (fin <= now) return { ok: false, raison: 'expiree', fin: new Date(fin).toISOString(), pass: pass };
    return { ok: true, pass: pass, fin: new Date(fin).toISOString() };
  }
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
  function peutCreerGroupe(nbGroupes, actif) { return !!actif || nbGroupes < GROUPES_GRATUITS; }
  function peutAjouterDepense(nbDepenses, actif) { return !!actif || nbDepenses < DEPENSES_GRATUITES; }

  // ---------------------------------------------------------------- Texte pour le PDF (polices standard : Windows-1252)
  var CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function textePDF(s) {
    s = String(s == null ? '' : s).replace(/[   ]/g, ' ').replace(/ /g, ' ').replace(/\r\n?/g, '\n').replace(/→/g, '->').replace(/−/g, '-');
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

  var PF = {
    JOUR_MS: JOUR_MS, formatNombre: formatNombre, f: f, fcfa: fcfa, lireEntier: lireEntier, dateISO: dateISO, dateFr: dateFr, dateLongue: dateLongue, MOIS: MOIS,
    sansAccents: sansAccents, nouvelId: nouvelId, TYPES: TYPES, type: type,
    partsDepense: partsDepense, verifierDepense: verifierDepense, verifierRemboursement: verifierRemboursement, bilan: bilan, soldes: soldes,
    reglements: reglements, appliquer: appliquer, MAX_EXACT: MAX_EXACT, nomMembre: nomMembre, resume: resume,
    API: API, PASS: PASS, GROUPES_GRATUITS: GROUPES_GRATUITS, DEPENSES_GRATUITES: DEPENSES_GRATUITES, RAPPEL_JOURS: RAPPEL_JOURS,
    lireLienCommande: lireLienCommande, urlVerification: urlVerification, ajouterMois: ajouterMois, finPass: finPass,
    analyserReponse: analyserReponse, finDroits: finDroits, etatPass: etatPass, ajouterPass: ajouterPass,
    peutCreerGroupe: peutCreerGroupe, peutAjouterDepense: peutAjouterDepense, textePDF: textePDF
  };
  if (typeof module === 'object' && module.exports) module.exports = PF;
  else racine.PF = PF;
})(typeof self !== 'undefined' ? self : this);
