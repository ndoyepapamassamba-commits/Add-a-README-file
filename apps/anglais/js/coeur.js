/* Anglais du Métier — logique pure (sans interface) : répétition espacée SM-2, séances, quiz,
   comparaison de la phrase dite, série de jours, pass. Navigateur (window.AM) et Node (module.exports). */
(function (racine) {
  'use strict';
  var JOUR_MS = 86400000;

  // ---------- Dates locales « AAAA-MM-JJ » ----------
  function dateISO(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, j = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
  }
  function versDate(iso) { var p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function ajouterJours(iso, n) { var d = versDate(iso); d.setDate(d.getDate() + n); return dateISO(d); }
  // Nombre de jours de a à b (b - a), sans souci d'heure d'été
  function ecartJours(a, b) {
    var x = String(a).split('-'), y = String(b).split('-');
    return Math.round((Date.UTC(+y[0], +y[1] - 1, +y[2]) - Date.UTC(+x[0], +x[1] - 1, +x[2])) / JOUR_MS);
  }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function dateFr(iso) { var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function dateLongue(iso) { var p = String(iso).slice(0, 10).split('-'); return (+p[2]) + ' ' + MOIS[+p[1] - 1] + ' ' + p[0]; }

  // ---------- Répétition espacée : algorithme SM-2 (SuperMemo 2) ----------
  // Note q de 0 à 5. Boutons : Raté = 1, Difficile = 3, Bien = 4, Facile = 5.
  var NOTES = { rate: 1, difficile: 3, bien: 4, facile: 5 };
  var EF_DEPART = 2.5, EF_MIN = 1.3, INTERVALLE_MAX = 3650;

  function nouvelleCarte(id, metier) {
    return { id: id, metier: metier, rep: 0, ef: EF_DEPART, intervalle: 0, echeance: null, vues: 0, erreurs: 0, cree: null, derniere: null };
  }
  // Renvoie une nouvelle carte (l'ancienne n'est pas modifiée).
  //   q ≥ 3 : 1re réussite → 1 jour, 2e → 6 jours, ensuite intervalle précédent × facilité (EF), arrondi.
  //   q < 3 : on recommence (1 jour).
  //   EF' = EF + (0,1 − (5 − q) × (0,08 + (5 − q) × 0,02)), jamais sous 1,3.
  function sm2(carte, q, aujourdhui) {
    var c = {};
    for (var k in carte) if (Object.prototype.hasOwnProperty.call(carte, k)) c[k] = carte[k];
    if (typeof c.ef !== 'number' || !(c.ef >= EF_MIN)) c.ef = EF_DEPART;
    c.rep = c.rep | 0; c.intervalle = c.intervalle | 0;
    q = Math.max(0, Math.min(5, Math.round(+q || 0)));
    if (q >= 3) {
      if (c.rep === 0) c.intervalle = 1;
      else if (c.rep === 1) c.intervalle = 6;
      else c.intervalle = Math.min(INTERVALLE_MAX, Math.max(1, Math.round(c.intervalle * c.ef)));
      c.rep += 1;
    } else {
      c.rep = 0; c.intervalle = 1; c.erreurs = (c.erreurs | 0) + 1;
    }
    c.ef = Math.round(Math.max(EF_MIN, c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))) * 1000) / 1000;
    c.vues = (c.vues | 0) + 1;
    if (!c.cree) c.cree = aujourdhui;
    c.derniere = aujourdhui;
    c.echeance = ajouterJours(aujourdhui, c.intervalle);
    return c;
  }
  // Intervalle (jours) que donnerait chaque bouton
  function apercu(carte, aujourdhui) {
    var r = {};
    Object.keys(NOTES).forEach(function (n) { r[n] = sm2(carte, NOTES[n], aujourdhui).intervalle; });
    return r;
  }
  function libelleIntervalle(j) {
    if (j <= 1) return 'demain';
    if (j < 30) return j + ' j';
    if (j < 365) return Math.round(j / 30) + ' mois';
    return Math.round(j / 365 * 10) / 10 + ' an' + (j >= 730 ? 's' : '');
  }
  // nouveau → en cours (moins de 2 réussites d'affilée) → appris → maîtrisé (intervalle ≥ 21 jours)
  function statutCarte(c) {
    if (!c || !c.vues) return 'nouveau';
    if (c.rep < 2) return 'en_cours';
    return c.intervalle >= 21 ? 'maitrise' : 'appris';
  }

  // ---------- Ordre d'apprentissage et séances ----------
  // Mots et phrases mêlés : environ une phrase après chaque groupe de 2 ou 3 mots.
  function ordreApprentissage(data) {
    var mots = data.mots || [], phrases = data.phrases || [], out = [], j = 0;
    var ratio = mots.length / Math.max(1, phrases.length);
    for (var i = 0; i < mots.length; i++) {
      out.push({ type: 'mot', id: mots[i].id });
      while (j < phrases.length && (j + 1) * ratio <= i + 1) { out.push({ type: 'phrase', id: phrases[j].id }); j++; }
    }
    while (j < phrases.length) { out.push({ type: 'phrase', id: phrases[j].id }); j++; }
    return out;
  }
  function idCarte(metier, itemId) { return metier + ':' + itemId; }
  function cartesDuMetier(cartes, metier) {
    var l = [];
    Object.keys(cartes || {}).forEach(function (k) { var c = cartes[k]; if (c && c.metier === metier) l.push(c); });
    return l;
  }
  function dues(cartes, metier, aujourdhui) {
    return cartesDuMetier(cartes, metier).filter(function (c) { return c.echeance && c.echeance <= aujourdhui; })
      .sort(function (a, b) { return a.echeance < b.echeance ? -1 : a.echeance > b.echeance ? 1 : a.ef - b.ef; });
  }
  function nouvellesDuJour(cartes, metier, aujourdhui) {
    return cartesDuMetier(cartes, metier).filter(function (c) { return c.cree === aujourdhui; }).length;
  }
  // File d'une séance : révisions dues d'abord, avec une nouvelle carte toutes les 3 révisions.
  function construireSeance(o) {
    var aRevoir = dues(o.cartes, o.metier, o.aujourdhui).slice(0, o.maxRevisions || 80).map(function (c) { return c.id; });
    var reste = Math.max(0, (o.nouvellesMax == null ? 10 : o.nouvellesMax) - nouvellesDuJour(o.cartes, o.metier, o.aujourdhui));
    var nouvelles = [];
    ordreApprentissage(o.data).forEach(function (it) {
      if (nouvelles.length >= reste) return;
      var id = idCarte(o.metier, it.id);
      if (!o.cartes[id]) nouvelles.push(id);
    });
    var file = [], i = 0, j = 0;
    while (i < aRevoir.length || j < nouvelles.length) {
      for (var k = 0; k < 3 && i < aRevoir.length; k++) file.push(aRevoir[i++]);
      if (j < nouvelles.length) file.push(nouvelles[j++]);
    }
    return { file: file, revisions: aRevoir.length, nouvelles: nouvelles.length };
  }
  // Carte ratée : elle revient un peu plus loin dans la même séance (au plus 3 fois).
  function reinserer(file, position, id, ecart) {
    var f = file.slice(), p = Math.min(f.length, position + 1 + (ecart == null ? 3 : ecart));
    f.splice(p, 0, id);
    return f;
  }
  function progressionMetier(cartes, data) {
    var r = { total: 0, nouveau: 0, en_cours: 0, appris: 0, maitrise: 0 };
    ordreApprentissage(data).forEach(function (it) {
      r.total++;
      r[statutCarte(cartes[idCarte(data.id, it.id)])]++;
    });
    r.vus = r.total - r.nouveau;
    r.acquis = r.appris + r.maitrise;
    r.pourcent = r.total ? Math.round(r.acquis * 100 / r.total) : 0;
    return r;
  }

  // ---------- Hasard reproductible (tests) ----------
  function alea(graine) {
    var a = (graine >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function melanger(liste, r) {
    r = r || Math.random;
    var a = liste.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // ---------- Quiz ----------
  var TROU = '_____';
  function phraseATrou(phrase) {
    var re = new RegExp('(^|[^A-Za-z])(' + phrase.trou.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![A-Za-z])', 'i');
    return phrase.en.replace(re, function (_, a) { return a + TROU; });
  }
  function choisirDistracteurs(bonne, candidats, n, r, cle) {
    var vus = {}, out = [];
    vus[cle(bonne).toLowerCase()] = 1;
    melanger(candidats, r).forEach(function (c) {
      if (out.length >= n) return;
      var k = cle(c).toLowerCase();
      if (vus[k]) return;
      vus[k] = 1; out.push(c);
    });
    return out;
  }
  function questionQCM(type, item, data, r) {
    var mot = !!item.fr && !item.trou;
    var pool = mot ? data.mots : data.phrases;
    var cleF = function (x) { return x.fr; }, cleE = function (x) { return x.en; };
    var q = { type: type, itemId: item.id, sorte: mot ? 'mot' : 'phrase', en: item.en, fr: item.fr };
    var dis, choix;
    if (type === 'trou') {
      var trous = data.phrases.map(function (p) { return p.trou; });
      var autres = choisirDistracteurs(item.trou, trous, 3, r, function (x) { return x; });
      choix = melanger([item.trou].concat(autres), r);
      q.texte = phraseATrou(item); q.aide = item.fr; q.choix = choix; q.bonne = choix.indexOf(item.trou);
      return q;
    }
    if (type === 'fr-en') {
      dis = choisirDistracteurs(item, pool.filter(function (x) { return x.fr !== item.fr; }), 3, r, cleE);
      choix = melanger([item].concat(dis), r);
      q.texte = item.fr; q.choix = choix.map(cleE); q.bonne = choix.indexOf(item);
      return q;
    }
    // 'en-fr' et 'ecoute' : on voit (ou entend) l'anglais, on choisit le français
    dis = choisirDistracteurs(item, pool.filter(function (x) { return x.en !== item.en; }), 3, r, cleF);
    choix = melanger([item].concat(dis), r);
    q.texte = type === 'ecoute' ? '' : item.en; q.choix = choix.map(cleF); q.bonne = choix.indexOf(item);
    return q;
  }
  // o : { data, cartes, n, mode: 'melange'|'mots'|'trous'|'ecoute', audio: bool, graine }
  function genererQuiz(o) {
    var r = o.graine != null ? alea(o.graine) : Math.random;
    var data = o.data, n = o.n || 10, cartes = o.cartes || {}, mode = o.mode || 'melange';
    var vu = function (it) { var c = cartes[idCarte(data.id, it.id)]; return !!(c && c.vues); };
    // éléments déjà vus d'abord (mélangés), puis les prochains à apprendre
    var choisir = function (liste, k) {
      var vus = melanger(liste.filter(vu), r), autres = liste.filter(function (x) { return !vu(x); });
      return vus.concat(autres).slice(0, k);
    };
    var types = [];
    if (mode === 'mots') { for (var i = 0; i < n; i++) types.push(i % 3 === 2 ? 'fr-en' : 'en-fr'); }
    else if (mode === 'trous') { for (i = 0; i < n; i++) types.push('trou'); }
    else if (mode === 'ecoute') { for (i = 0; i < n; i++) types.push('ecoute'); }
    else {
      var base = ['en-fr', 'trou', 'en-fr', 'fr-en', 'trou', o.audio ? 'ecoute' : 'en-fr', 'en-fr', 'trou', 'fr-en', o.audio ? 'ecoute' : 'trou'];
      for (i = 0; i < n; i++) types.push(base[i % base.length]);
    }
    var nbMots = types.filter(function (t) { return t === 'en-fr' || t === 'fr-en'; }).length;
    var nbPhr = types.filter(function (t) { return t === 'trou'; }).length;
    var nbEco = types.filter(function (t) { return t === 'ecoute'; }).length;
    var mots = choisir(data.mots, nbMots + Math.ceil(nbEco / 2));
    var phrases = choisir(data.phrases, nbPhr + Math.floor(nbEco / 2));
    var im = 0, ip = 0, alt = 0, qs = [];
    types.forEach(function (t) {
      var item;
      if (t === 'trou') item = phrases[ip++];
      else if (t === 'ecoute') item = (alt++ % 2 === 0 ? mots[im++] : phrases[ip++]) || mots[im++] || phrases[ip++];
      else item = mots[im++];
      if (item) qs.push(questionQCM(t, item, data, r));
    });
    return melanger(qs, r);
  }

  // ---------- Comparaison de la phrase dite (tolérante) ----------
  var CONTRACTIONS = {
    "i'm": 'i am', "you're": 'you are', "he's": 'he is', "she's": 'she is', "it's": 'it is', "we're": 'we are', "they're": 'they are',
    "that's": 'that is', "there's": 'there is', "what's": 'what is', "where's": 'where is', "who's": 'who is', "how's": 'how is',
    "here's": 'here is', "let's": 'let us', "i'll": 'i will', "you'll": 'you will', "he'll": 'he will', "she'll": 'she will',
    "we'll": 'we will', "they'll": 'they will', "it'll": 'it will', "i've": 'i have', "you've": 'you have', "we've": 'we have',
    "they've": 'they have', "i'd": 'i would', "you'd": 'you would', "we'd": 'we would', "they'd": 'they would',
    "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'can not', "cannot": 'can not', "won't": 'will not',
    "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "haven't": 'have not', "hasn't": 'has not',
    "hadn't": 'had not', "shouldn't": 'should not', "wouldn't": 'would not', "couldn't": 'could not', "mustn't": 'must not', "shan't": 'shall not'
  };
  // Mots qui se prononcent pareil : on les confond volontiers.
  var HOMOPHONES = [['to', 'too', 'two'], ['for', 'four'], ['right', 'write'], ['here', 'hear'], ['there', 'their'], ['no', 'know'],
    ['by', 'buy', 'bye'], ['see', 'sea'], ['one', 'won'], ['eight', 'ate'], ['wait', 'weight'], ['meet', 'meat'], ['fare', 'fair'],
    ['sale', 'sail'], ['check', 'cheque'], ['brake', 'break'], ['new', 'knew'], ['hour', 'our'], ['week', 'weak'], ['piece', 'peace'],
    ['road', 'rode'], ['sell', 'cell'], ['steel', 'steal'], ['plane', 'plain'], ['pedal', 'peddle'], ['site', 'sight'], ['stair', 'stare'],
    ['tide', 'tied'], ['tea', 'tee'], ['i', 'eye'], ['tire', 'tyre'], ['whole', 'hole'], ['ok', 'okay']];
  var CANON = {};
  HOMOPHONES.forEach(function (g) { g.forEach(function (w) { CANON[w] = g[0]; }); });
  var UNITES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
    'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var DIZAINES = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  var ORDINAUX = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth',
    11: 'eleventh', 12: 'twelfth', 13: 'thirteenth', 20: 'twentieth', 30: 'thirtieth' };
  function nombreAnglais(n) {
    n = Math.floor(n);
    if (n < 20) return UNITES[n];
    if (n < 100) return DIZAINES[Math.floor(n / 10)] + (n % 10 ? ' ' + UNITES[n % 10] : '');
    if (n < 1000) return UNITES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + nombreAnglais(n % 100) : '');
    if (n < 1000000) return nombreAnglais(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + nombreAnglais(n % 1000) : '');
    return String(n);
  }
  function normaliser(texte) {
    var s = String(texte || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/&/g, ' and ');
    s = s.replace(/\bwi-?fi\b/g, 'wifi').replace(/\be-mail\b/g, 'email');
    s = s.replace(/(\d),(?=\d{3}\b)/g, '$1');                         // 5,000 → 5000
    s = s.replace(/\b(\d{1,2}):00\b/g, '$1');                          // 8:00 → 8
    s = s.replace(/\b(\d+)(st|nd|rd|th)\b/g, function (m, d) {         // 3rd → third
      var k = +d; return ORDINAUX[k] || (k < 20 ? UNITES[k] + 'th' : m);
    });
    s = s.replace(/\d+/g, function (d) { return ' ' + nombreAnglais(+d) + ' '; });
    s = s.replace(/[a-z]+'[a-z]+/g, function (w) { return CONTRACTIONS[w] || w; });
    s = s.replace(/\bcannot\b/g, 'can not');
    s = s.replace(/'/g, '').replace(/[^a-z\s]/g, ' ');
    return s.split(/\s+/).filter(Boolean).map(function (w) { return CANON[w] || w; });
  }
  function levenshtein(a, b) {
    if (a === b) return 0;
    var m = a.length, n = b.length, prec = [], cur, i, j;
    for (j = 0; j <= n; j++) prec[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) cur[j] = Math.min(prec[j] + 1, cur[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prec = cur;
    }
    return prec[n];
  }
  function motsProches(a, b) {
    if (a === b) return true;
    if (a.replace(/s$/, '') === b.replace(/s$/, '')) return true;      // pluriel oublié
    var l = Math.max(a.length, b.length);
    if (l < 4) return false;
    return 1 - levenshtein(a, b) / l >= 0.75;                           // colour / color, tyres / tires
  }
  // → { score: 0..100, mots: [{ mot, ok }], verdict: 'bien' | 'presque' | 'encore' }
  function comparer(cible, entendu) {
    var affiche = String(cible || '').split(/\s+/).filter(Boolean);
    // chaque mot affiché peut donner plusieurs mots normalisés (« I'm » → « i am »)
    var t = [], proprio = [];
    affiche.forEach(function (w, k) { normaliser(w).forEach(function (x) { t.push(x); proprio.push(k); }); });
    var h = normaliser(entendu);
    var n = t.length, m = h.length, D = [], i, j;
    for (i = 0; i <= n; i++) { D[i] = []; for (j = 0; j <= m; j++) D[i][j] = i === 0 ? j : j === 0 ? i : 0; }
    for (i = 1; i <= n; i++) for (j = 1; j <= m; j++)
      D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (motsProches(t[i - 1], h[j - 1]) ? 0 : 1));
    var ok = []; for (i = 0; i < n; i++) ok[i] = false;
    i = n; j = m;
    while (i > 0 && j > 0) {
      var p = motsProches(t[i - 1], h[j - 1]);
      if (D[i][j] === D[i - 1][j - 1] + (p ? 0 : 1)) { if (p) ok[i - 1] = true; i--; j--; }
      else if (D[i][j] === D[i - 1][j] + 1) i--;
      else j--;
    }
    var bons = ok.filter(Boolean).length;
    // pénalité légère pour les mots ajoutés en trop
    var trop = Math.max(0, m - n);
    var score = n ? Math.max(0, Math.round(100 * (bons - trop * 0.5) / n)) : 0;
    var parMot = affiche.map(function (w, k) {
      var l = []; for (var x = 0; x < n; x++) if (proprio[x] === k) l.push(ok[x]);
      return { mot: w, ok: l.length ? l.every(Boolean) : true };
    });
    return { score: score, mots: parMot, verdict: score >= 80 ? 'bien' : score >= 55 ? 'presque' : 'encore' };
  }
  function meilleureComparaison(cible, alternatives) {
    var best = null;
    (alternatives || []).forEach(function (a) { var r = comparer(cible, a); r.entendu = a; if (!best || r.score > best.score) best = r; });
    return best || comparer(cible, '');
  }

  // ---------- Activité du jour et série ----------
  function pointsJour(j) { return j ? (j.cartes | 0) + 5 * (j.quiz | 0) + (j.oral | 0) + (j.ecoute | 0) : 0; }
  // Jours consécutifs avec au moins une activité. Si rien aujourd'hui, la série d'hier tient jusqu'à minuit.
  function serie(jours, aujourdhui) {
    jours = jours || {};
    var d = aujourdhui, n = 0;
    if (!(pointsJour(jours[d]) > 0)) d = ajouterJours(d, -1);
    while (pointsJour(jours[d]) > 0) { n++; d = ajouterJours(d, -1); }
    return n;
  }
  function meilleureSerie(jours) {
    var cles = Object.keys(jours || {}).filter(function (k) { return pointsJour(jours[k]) > 0; }).sort();
    var best = 0, cur = 0, prec = null;
    cles.forEach(function (k) { cur = prec && ecartJours(prec, k) === 1 ? cur + 1 : 1; if (cur > best) best = cur; prec = k; });
    return best;
  }
  function ajouterActivite(jours, aujourdhui, champ, n) {
    var j = {}; for (var k in jours) j[k] = jours[k];
    var x = j[aujourdhui] ? Object.assign({}, j[aujourdhui]) : {};
    x[champ] = (x[champ] | 0) + (n == null ? 1 : n);
    j[aujourdhui] = x;
    return j;
  }

  // ---------- Pass ----------
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique';
  var BOUTIQUE = '../../boutique/';
  var PRODUITS = { 'pass-anglais-metier-12-mois': { jours: 365, nom: 'Pass Anglais du Métier 12 mois', prix: 2000 } };
  var SLUG = 'pass-anglais-metier-12-mois';
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
  function urlVerification(c) { return API + '/commandes/' + encodeURIComponent(c.id) + '?t=' + encodeURIComponent(c.jeton); }
  function urlProduit() { return BOUTIQUE + SLUG + '.html'; }
  // Réponse de GET /commandes/<id>?t=<jeton> → { ok, pass, fin } ou { ok: false, raison }
  function analyserReponse(j, maintenant) {
    var c = j && j.commande;
    if (!c || typeof c !== 'object') return { ok: false, raison: 'introuvable' };
    var slug = c.produit && c.produit.slug, p = PRODUITS[slug];
    if (!p) return { ok: false, raison: 'produit', titre: (c.produit && c.produit.titre) || '' };
    if (c.payee !== true) return { ok: false, raison: 'impayee' };
    var debut = Date.parse(c.payee_le);
    if (!isFinite(debut)) return { ok: false, raison: 'impayee' };
    var pass = { id: String(c.id || ''), slug: slug, jours: p.jours, payeeLe: new Date(debut).toISOString() };
    var fin = debut + (p.jours + GRACE_JOURS) * JOUR_MS;
    var now = maintenant == null ? Date.now() : +maintenant;
    if (fin <= now) return { ok: false, raison: 'expiree', fin: new Date(fin).toISOString(), pass: pass };
    return { ok: true, pass: pass, fin: new Date(fin).toISOString() };
  }
  // Chaque pass ajoute sa durée ; un renouvellement anticipé ne fait perdre aucun jour.
  function finDroits(passes) {
    var vus = {}, liste = [];
    (passes || []).forEach(function (p) {
      if (!p || !PRODUITS[p.slug] || !isFinite(Date.parse(p.payeeLe))) return;
      if (p.id && vus[p.id]) return;
      if (p.id) vus[p.id] = 1;
      liste.push(p);
    });
    if (!liste.length) return null;
    liste.sort(function (a, b) { return Date.parse(a.payeeLe) - Date.parse(b.payeeLe); });
    var fin = null;
    liste.forEach(function (p) { var d = Date.parse(p.payeeLe); fin = Math.max(fin == null ? d : fin, d) + PRODUITS[p.slug].jours * JOUR_MS; });
    return fin + GRACE_JOURS * JOUR_MS;
  }
  function etatPass(passes, maintenant) {
    var now = maintenant == null ? Date.now() : +maintenant, fin = finDroits(passes);
    if (fin == null) return { premium: false, jamais: true, fin: null, joursRestants: 0, rappel: false, expire: false };
    var reste = fin - now, jr = reste > 0 ? Math.ceil(reste / JOUR_MS) : 0;
    return { premium: reste > 0, jamais: false, fin: new Date(fin).toISOString(), joursRestants: jr, rappel: reste > 0 && jr <= RAPPEL_JOURS, expire: reste <= 0 };
  }
  function ajouterPass(passes, pass) {
    var l = (passes || []).filter(function (p) { return !(pass.id && p.id === pass.id); });
    l.push({ id: pass.id, slug: pass.slug, jours: pass.jours, payeeLe: pass.payeeLe, verifieLe: new Date().toISOString() });
    return l;
  }

  // ---------- Version gratuite : un métier au choix ----------
  var CHANGEMENTS_GRATUITS = 1;
  function metierOuvert(id, profil, premium) { return !!premium || !!(profil && profil.metierGratuit === id); }
  function peutChangerMetierGratuit(profil) { return !profil || !profil.metierGratuit || (profil.changements | 0) < CHANGEMENTS_GRATUITS; }

  // ---------- Partage WhatsApp (le message part seulement si l'utilisateur l'envoie) ----------
  var URL_APPLI = 'https://ndoyepapamassamba-commits.github.io/Add-a-README-file/apps/anglais/';
  function messagePartage(o) {
    var l = 'J\'apprends l\'anglais de mon métier (' + o.metier + ') sur mon téléphone avec « Anglais du Métier ».';
    if (o.acquis > 0) l += ' Déjà ' + o.acquis + ' mots et phrases appris';
    if (o.serie > 1) l += (o.acquis > 0 ? ', ' : ' Déjà ') + o.serie + ' jours de suite';
    if (o.acquis > 0 || o.serie > 1) l += ' !';
    return l + ' Essaie aussi, c\'est gratuit pour un métier : ' + URL_APPLI;
  }
  function lienWhatsApp(message) { return 'https://wa.me/?text=' + encodeURIComponent(message); }

  function nouvelId() {
    try { if (racine.crypto && racine.crypto.randomUUID) return racine.crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  var AM = {
    JOUR_MS: JOUR_MS, dateISO: dateISO, ajouterJours: ajouterJours, ecartJours: ecartJours, dateFr: dateFr, dateLongue: dateLongue,
    NOTES: NOTES, EF_DEPART: EF_DEPART, EF_MIN: EF_MIN, nouvelleCarte: nouvelleCarte, sm2: sm2, apercu: apercu,
    libelleIntervalle: libelleIntervalle, statutCarte: statutCarte, ordreApprentissage: ordreApprentissage, idCarte: idCarte,
    dues: dues, nouvellesDuJour: nouvellesDuJour, construireSeance: construireSeance, reinserer: reinserer,
    progressionMetier: progressionMetier, alea: alea, melanger: melanger, TROU: TROU, phraseATrou: phraseATrou,
    genererQuiz: genererQuiz, normaliser: normaliser, levenshtein: levenshtein, motsProches: motsProches, comparer: comparer,
    meilleureComparaison: meilleureComparaison, nombreAnglais: nombreAnglais, pointsJour: pointsJour, serie: serie,
    meilleureSerie: meilleureSerie, ajouterActivite: ajouterActivite,
    API: API, PRODUITS: PRODUITS, SLUG: SLUG, GRACE_JOURS: GRACE_JOURS, RAPPEL_JOURS: RAPPEL_JOURS, lireLienCommande: lireLienCommande,
    urlVerification: urlVerification, urlProduit: urlProduit, analyserReponse: analyserReponse, finDroits: finDroits,
    etatPass: etatPass, ajouterPass: ajouterPass, metierOuvert: metierOuvert, peutChangerMetierGratuit: peutChangerMetierGratuit,
    URL_APPLI: URL_APPLI, messagePartage: messagePartage, lienWhatsApp: lienWhatsApp, nouvelId: nouvelId
  };
  if (typeof module === 'object' && module.exports) module.exports = AM;
  else racine.AM = AM;
})(typeof self !== 'undefined' ? self : this);
