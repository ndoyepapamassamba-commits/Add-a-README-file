/* Tontine Claire — cœur de calcul (sans interface) : dates des tours, tirage au sort vérifiable, état des cotisations,
   amendes, chaîne d'empreintes, messages. Fonctionne dans le navigateur (window.TC) et dans Node (require) pour les tests.
   L'application n'encaisse et ne déplace jamais d'argent : elle note et montre ce que les membres font entre eux. */
(function (racine) {
  'use strict';

  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/dossiers';
  var GRATUIT_TONTINES = 1, GRATUIT_MEMBRES = 12;
  var PASS_SLUG = 'pass-tontine-12-mois', PASS_PRIX = 2000;
  var MAX_EVENEMENTS = 400;
  var NOM_MAX = 30;
  var NBSP = ' ';

  // ---------- SHA-256 (synchrone, UTF-8) ----------
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function utf8(s) {
    s = String(s);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var u = unescape(encodeURIComponent(s)), o = new Uint8Array(u.length);
    for (var i = 0; i < u.length; i++) o[i] = u.charCodeAt(i);
    return o;
  }
  function sha256(texte) {
    var m = utf8(texte), l = m.length, n = ((l + 9 + 63) >> 6) << 6, b = new Uint8Array(n);
    b.set(m); b[l] = 0x80;
    var bits = l * 8;
    b[n - 4] = (bits >>> 24) & 255; b[n - 3] = (bits >>> 16) & 255; b[n - 2] = (bits >>> 8) & 255; b[n - 1] = bits & 255;
    b[n - 5] = Math.floor(l / 0x20000000) & 255;
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], w = new Array(64);
    for (var o = 0; o < n; o += 64) {
      for (var i = 0; i < 16; i++) w[i] = (b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3];
      for (i = 16; i < 64; i++) {
        var x = w[i - 15], y = w[i - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    var out = '';
    for (i = 0; i < 8; i++) out += ('00000000' + (h[i] >>> 0).toString(16)).slice(-8);
    return out;
  }

  // ---------- Nombres et dates ----------
  function entier(v) {
    if (typeof v === 'number') return isFinite(v) ? Math.round(v) : 0;
    var s = String(v == null ? '' : v).replace(/[\s  .]/g, '').replace(/F(CFA)?$/i, '');
    return /^-?\d+$/.test(s) ? parseInt(s, 10) : NaN;
  }
  function formatNombre(n) {
    n = Math.round(+n || 0);
    var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (n < 0 ? '-' : '') + s;
  }
  function formatF(n) { return formatNombre(n) + NBSP + 'F'; }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoLocal(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dateValide(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
    var p = s.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
  }
  function versUTC(s) { var p = s.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function depuisUTC(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function ajouterJours(s, n) { return depuisUTC(versUTC(s) + n * 86400000); }
  function ecartJours(a, b) { return Math.round((versUTC(b) - versUTC(a)) / 86400000); }
  function joursDansMois(a, m) { return new Date(Date.UTC(a, m + 1, 0)).getUTCDate(); }
  function ajouterMois(s, n) {
    var p = s.split('-').map(Number), a = p[0], m = p[1] - 1 + n;
    a += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return a + '-' + pad(m + 1) + '-' + pad(Math.min(p[2], joursDansMois(a, m)));
  }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function dateCourte(s) { if (!dateValide(s)) return ''; var p = s.split('-').map(Number); return p[2] + (p[2] === 1 ? 'er' : '') + ' ' + MOIS_C[p[1] - 1]; }
  function dateMoyenne(s) { if (!dateValide(s)) return ''; var p = s.split('-').map(Number); return p[2] + (p[2] === 1 ? 'er' : '') + ' ' + MOIS[p[1] - 1] + ' ' + p[0]; }
  function dateLongue(s) {
    if (!dateValide(s)) return '';
    var p = s.split('-').map(Number), j = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
    return JOURS[j] + ' ' + p[2] + (p[2] === 1 ? 'er' : '') + ' ' + MOIS[p[1] - 1] + ' ' + p[0];
  }
  function dateHeure(isoT) {
    var d = new Date(isoT);
    if (isNaN(d)) return '';
    return dateMoyenne(isoLocal(d)) + ' à ' + pad(d.getHours()) + ' h ' + pad(d.getMinutes());
  }
  function datesTours(debut, frequence, intervalle, n) {
    var out = [];
    for (var k = 0; k < n; k++) {
      if (frequence === 'mensuelle') out.push(ajouterMois(debut, k));
      else if (frequence === 'hebdomadaire') out.push(ajouterJours(debut, 7 * k));
      else out.push(ajouterJours(debut, Math.max(1, intervalle | 0) * k));
    }
    return out;
  }
  function libelleFrequence(f, intervalle) {
    if (f === 'mensuelle') return 'chaque mois';
    if (f === 'hebdomadaire') return 'chaque semaine';
    return 'tous les ' + (intervalle | 0) + ' jours';
  }
  function parPeriode(f, intervalle) {
    if (f === 'mensuelle') return 'par mois';
    if (f === 'hebdomadaire') return 'par semaine';
    return 'tous les ' + (intervalle | 0) + ' jours';
  }

  // ---------- Membres et données du dossier ----------
  // Prénoms ou surnoms seulement (jamais de numéro sur le serveur). Format compact : « 1:Awa|2:Fatou*2@2027-01-15|3:Moussa »
  function nettoyerNom(s) {
    return String(s == null ? '' : s).replace(/[|:*@,\u0000-\u001f\u007f]/g, ' ').replace(/\d{6,}/g, '').replace(/\s+/g, ' ').trim().slice(0, NOM_MAX);
  }
  function encoderMembres(liste) {
    return liste.map(function (m) {
      return m.id + ':' + nettoyerNom(m.nom) + ((m.mains | 0) > 1 ? '*' + (m.mains | 0) : '') + (m.souhait && dateValide(m.souhait) ? '@' + m.souhait : '');
    }).join('|');
  }
  function decoderMembres(s) {
    var out = [];
    String(s || '').split('|').forEach(function (bout) {
      var m = bout.match(/^(\d{1,4}):([^|*@]*?)(?:\*(\d{1,2}))?(?:@(\d{4}-\d{2}-\d{2}))?$/);
      if (!m || !m[2].trim()) return;
      out.push({ id: +m[1], nom: m[2].trim(), mains: Math.max(1, +(m[3] || 1)), souhait: m[4] || '' });
    });
    return out;
  }
  // Longues valeurs : découpées en morceaux de 1 900 caractères (cle, cle_2, cle_3…) — le serveur limite chaque texte à 2 000.
  // Le serveur enlève les espaces au début et à la fin de chaque texte : on ne coupe jamais à côté d'un espace.
  function decouper(cle, texte, donnees) {
    var s = String(texte), i = 0, k = 1;
    do {
      var fin = Math.min(s.length, i + 1900);
      while (fin < s.length && fin > i + 1 && (/\s/.test(s.charAt(fin - 1)) || /\s/.test(s.charAt(fin)))) fin--;
      donnees[k === 1 ? cle : cle + '_' + k] = s.slice(i, fin); i = fin; k++;
    } while (i < s.length);
  }
  function recoller(cle, donnees) {
    var s = String(donnees[cle] || ''), k = 2;
    while (typeof donnees[cle + '_' + k] === 'string') { s += donnees[cle + '_' + k]; k++; }
    return s;
  }
  var REGLES_DEFAUT = {
    grace: 0, amende: 0, amende_mode: 'fixe', amende_plafond: 0,
    regle_retard: 'Chacun verse sa cotisation au plus tard à la date du tour. En cas de retard, prévenez l\'organisatrice ou l\'organisateur avant la date.',
    regle_depart: 'Un membre qui veut partir prévient le groupe. S\'il n\'a pas encore reçu sa main, il récupère ce qu\'il a versé à la fin du cycle. S\'il l\'a déjà reçue, il continue à verser jusqu\'à la fin.',
    regle_autres: 'Les versements se font directement entre membres (espèces, Wave, Orange Money…). Le bénéficiaire du tour reçoit la cagnotte dès qu\'elle est complète.'
  };
  // Objet tontine (interface) → données du dossier (≤ 40 clés, textes ≤ 2 000, total ≤ 20 Ko)
  function encoderTontine(t) {
    var d = { v: 1, montant: entier(t.montant), frequence: t.frequence, debut: t.debut };
    if (t.frequence === 'autre') d.intervalle = Math.max(1, t.intervalle | 0);
    decouper('membres', encoderMembres(t.membres), d);
    decouper('ordre', t.ordre.join(','), d);
    d.ordre_mode = t.ordreMode || 'manuel';
    if (d.ordre_mode === 'tirage') { d.graine = String(t.graine || '').slice(0, 120); d.tirage_le = t.tirageLe || ''; }
    if (t.organisateur) d.organisateur = nettoyerNom(t.organisateur);
    d.grace = Math.max(0, t.grace | 0);
    d.amende = Math.max(0, entier(t.amende) || 0);
    d.amende_mode = t.amendeMode === 'jour' ? 'jour' : 'fixe';
    d.amende_plafond = Math.max(0, entier(t.amendePlafond) || 0);
    ['regle_retard', 'regle_depart', 'regle_autres'].forEach(function (k) { var v = String(t[k] == null ? '' : t[k]).trim().slice(0, 1500); if (v) d[k] = v; });
    return d;
  }
  function tailleDonnees(d) { return JSON.stringify(d).length; }
  function decoderTontine(dossier) {
    var d = (dossier && dossier.donnees) || {};
    var membres = decoderMembres(recoller('membres', d));
    var ordre = recoller('ordre', d).split(',').map(Number).filter(function (x) { return x > 0; });
    var t = {
      id: dossier.id, titre: dossier.titre || '', statut: dossier.statut || 'ouvert', role: dossier.role,
      montant: entier(d.montant) || 0, frequence: d.frequence || 'mensuelle', intervalle: d.intervalle | 0, debut: dateValide(d.debut) ? d.debut : isoLocal(),
      membres: membres, ordre: ordre, ordreMode: d.ordre_mode || 'manuel', graine: d.graine || '', tirageLe: d.tirage_le || '',
      organisateur: d.organisateur || '', grace: d.grace | 0, amende: entier(d.amende) || 0, amendeMode: d.amende_mode === 'jour' ? 'jour' : 'fixe',
      amendePlafond: entier(d.amende_plafond) || 0,
      regle_retard: d.regle_retard || '', regle_depart: d.regle_depart || '', regle_autres: d.regle_autres || ''
    };
    t.totalMains = membres.reduce(function (s, m) { return s + m.mains; }, 0);
    t.nbTours = ordre.length || t.totalMains;
    t.pot = t.montant * t.totalMains;
    t.dates = datesTours(t.debut, t.frequence, t.intervalle, t.nbTours);
    t.parId = {};
    membres.forEach(function (m) { t.parId[m.id] = m; });
    return t;
  }
  function nomMembre(t, id) { var m = t.parId && t.parId[id]; return m ? m.nom : 'Membre ' + id; }

  // ---------- Ordre des tours ----------
  // Tirage au sort vérifiable : mélange de Fisher-Yates, chaque nombre vient de SHA-256(graine|i). Même graine → même ordre.
  function listeMains(membres) {
    var l = [];
    membres.slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (m) { for (var k = 0; k < Math.max(1, m.mains | 0); k++) l.push(m.id); });
    return l;
  }
  function tirage(graine, membres) {
    var l = listeMains(membres);
    for (var i = l.length - 1; i > 0; i--) {
      var j = parseInt(sha256(String(graine) + '|' + i).slice(0, 12), 16) % (i + 1);
      var x = l[i]; l[i] = l[j]; l[j] = x;
    }
    return l;
  }
  function graineNouvelle(maintenant, aleatoire) {
    var d = maintenant || new Date();
    var n = aleatoire != null ? aleatoire : (function () {
      try { var a = new Uint32Array(1); (racine.crypto || crypto).getRandomValues(a); return a[0] % 1000000; } catch (e) { return Math.floor(Math.random() * 1000000); }
    })();
    return isoLocal(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' - ' + ('000000' + n).slice(-6);
  }
  // Selon la date souhaitée : les dates les plus proches d'abord ; sans date, à la suite dans l'ordre de la liste
  function ordreParDate(membres) {
    var l = [];
    membres.forEach(function (m, i) {
      for (var k = 0; k < Math.max(1, m.mains | 0); k++) l.push({ id: m.id, d: m.souhait && dateValide(m.souhait) ? m.souhait : '9999-12-31', i: i, k: k });
    });
    l.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : a.k - b.k || a.i - b.i; });
    return l.map(function (x) { return x.id; });
  }
  function ordreManuel(membres) {
    var l = [];
    membres.forEach(function (m) { for (var k = 0; k < Math.max(1, m.mains | 0); k++) l.push(m.id); });
    return l;
  }
  function verifierTirage(t) {
    if (t.ordreMode !== 'tirage' || !t.graine) return null;
    return tirage(t.graine, t.membres).join(',') === t.ordre.join(',');
  }

  // ---------- État des cotisations ----------
  function nombre(v) { var n = typeof v === 'number' ? v : entier(v); return isFinite(n) ? n : 0; }
  function amendePour(t, jours) {
    if (!t.amende || jours <= 0) return 0;
    if (t.amendeMode === 'jour') { var a = t.amende * jours; return t.amendePlafond > 0 ? Math.min(a, t.amendePlafond) : a; }
    return t.amende;
  }
  // t : tontine décodée ; evs : événements du dossier ; aujourdhui : 'AAAA-MM-JJ'
  function calculer(t, evs, aujourdhui) {
    aujourdhui = aujourdhui || isoLocal();
    evs = evs || [];
    var annules = {}, i, e, d, parId = {};
    evs.forEach(function (x) { parId[x.id] = x; });
    // Annulation : l'organisation peut annuler une confirmation, un tour ou une déclaration ; un membre, seulement une déclaration
    for (i = 0; i < evs.length; i++) {
      e = evs[i]; d = e.donnees || {};
      var cible = d.annule && parId[d.annule];
      if (!cible || cible.id === e.id || ['versement_recu', 'versement_declare', 'tour'].indexOf(cible.type) < 0) continue;
      if (e.auteur === 'proprio' || cible.type === 'versement_declare') annules[cible.id] = e;
    }
    var n = t.nbTours, tours = [], cel = {}, mem = {};
    t.membres.forEach(function (m) {
      cel[m.id] = [];
      mem[m.id] = { id: m.id, nom: m.nom, mains: m.mains, du: m.mains * t.montant, verse: 0, attenduAuj: 0, retards: 0, amendes: 0, amendesPayees: 0, declares: 0, tours: [] };
    });
    var limiteCourante = -1;
    for (var p = 1; p <= n; p++) {
      var date = t.dates[p - 1], limite = ajouterJours(date, t.grace);
      var etat = aujourdhui > limite ? 'passe' : 'avenir';
      if (etat === 'avenir' && limiteCourante < 0) { limiteCourante = p; etat = 'courant'; }
      tours.push({ n: p, date: date, limite: limite, etat: etat, prevu: t.ordre[p - 1] || 0, beneficiaire: t.ordre[p - 1] || 0, remis: null,
        attendu: t.pot, confirme: 0, enAttente: 0, reste: t.pot, payes: 0, retards: 0, doivent: [] });
      t.membres.forEach(function (m) { cel[m.id][p] = { du: m.mains * t.montant, confirme: 0, declare: 0, dates: [], dateDecl: '', statut: '', jours: 0, amende: 0, evs: [] }; });
    }
    // Versements et tours
    for (i = 0; i < evs.length; i++) {
      e = evs[i]; d = e.donnees || {};
      if (annules[e.id] || d.annule) continue;
      var jour = dateValide(d.date) ? d.date : isoLocal(new Date(e.le));
      if (e.type === 'versement_recu' && e.auteur === 'proprio') {
        if (d.objet === 'amende') { if (mem[d.membre]) mem[d.membre].amendesPayees += nombre(d.montant); continue; }
        var lots = [];
        if (typeof d.lot === 'string') d.lot.split('|').forEach(function (x) { var q = x.split(':'); if (q.length === 2) lots.push({ membre: +q[0], montant: nombre(q[1]) }); });
        else lots.push({ membre: +d.membre, montant: nombre(d.montant) });
        lots.forEach(function (l) {
          var c = cel[l.membre] && cel[l.membre][d.periode];
          if (!c) return;
          c.confirme += l.montant; c.dates.push(jour); c.evs.push(e);
        });
      } else if (e.type === 'versement_declare') {
        var c2 = cel[d.membre] && cel[d.membre][d.periode];
        if (!c2) continue;
        c2.declare += nombre(d.montant); c2.dateDecl = c2.dateDecl || jour; c2.evs.push(e);
      } else if (e.type === 'tour' && e.auteur === 'proprio') {
        var tr = tours[(d.periode | 0) - 1];
        if (!tr) continue;
        tr.remis = { membre: +d.beneficiaire, montant: nombre(d.montant), date: jour, ev: e };
        tr.beneficiaire = +d.beneficiaire;
      }
    }
    // Statuts des cases, totaux, retards et amendes
    var retards = [];
    tours.forEach(function (tr) {
      t.membres.forEach(function (m) {
        var c = cel[m.id][tr.n], M = mem[m.id];
        var attente = Math.max(0, c.declare - c.confirme);
        var datePaie = '';
        if (c.confirme >= c.du) { c.statut = 'confirme'; datePaie = c.dates.slice().sort().pop(); if (c.dateDecl && c.dateDecl < datePaie) datePaie = c.dateDecl; }
        else if (c.confirme + attente >= c.du) { c.statut = 'declare'; datePaie = c.dateDecl; }
        else if (tr.etat === 'passe') c.statut = 'retard';
        else if (c.confirme > 0 || attente > 0) c.statut = 'partiel';
        else c.statut = tr.etat === 'courant' ? 'attendu' : 'avenir';
        if (c.statut === 'retard') c.jours = ecartJours(tr.limite, aujourdhui);
        else if (datePaie && datePaie > tr.limite) c.jours = ecartJours(tr.limite, datePaie);
        c.amende = amendePour(t, c.jours);
        c.enAttente = attente;
        c.manque = Math.max(0, c.du - c.confirme);
        tr.confirme += c.confirme; tr.enAttente += attente;
        if (c.statut === 'confirme') tr.payes++;
        else tr.doivent.push(m.id);
        if (c.statut === 'retard') { tr.retards++; M.retards++; retards.push({ membre: m.id, nom: m.nom, periode: tr.n, date: tr.date, jours: c.jours, manque: c.manque, amende: c.amende }); }
        M.verse += c.confirme; M.amendes += c.amende;
        if (c.statut === 'declare') M.declares++;
        if (tr.etat === 'passe') M.attenduAuj += c.du;
      });
      tr.reste = Math.max(0, tr.attendu - tr.confirme);
      if (mem[tr.beneficiaire]) mem[tr.beneficiaire].tours.push(tr.n);
    });
    // Retards regroupés par membre (une ligne et un seul rappel par personne)
    var retardsMembres = [];
    t.membres.forEach(function (m) {
      var l = retards.filter(function (x) { return x.membre === m.id; });
      if (l.length) retardsMembres.push({ membre: m.id, nom: m.nom, periodes: l, manque: l.reduce(function (s, x) { return s + x.manque; }, 0), amende: l.reduce(function (s, x) { return s + x.amende; }, 0) });
    });
    var courant = tours.filter(function (x) { return x.etat === 'courant'; })[0] || null;
    var totalConfirme = tours.reduce(function (s, x) { return s + x.confirme; }, 0);
    var totalRemis = tours.reduce(function (s, x) { return s + (x.remis ? x.remis.montant : 0); }, 0);
    var amendesTotal = 0, amendesPayees = 0;
    Object.keys(mem).forEach(function (k) { amendesTotal += mem[k].amendes; amendesPayees += mem[k].amendesPayees; });
    var aConfirmer = [];
    tours.forEach(function (tr) { t.membres.forEach(function (m) { var c = cel[m.id][tr.n]; if (c.enAttente > 0) aConfirmer.push({ membre: m.id, nom: m.nom, periode: tr.n, montant: c.enAttente }); }); });
    return {
      tours: tours, cellules: cel, membres: mem, retards: retards, retardsMembres: retardsMembres, courant: courant, aujourdhui: aujourdhui,
      totalConfirme: totalConfirme, totalRemis: totalRemis, amendesTotal: amendesTotal, amendesPayees: amendesPayees,
      toursRemis: tours.filter(function (x) { return x.remis; }).length, aConfirmer: aConfirmer, annules: annules, parId: parId
    };
  }
  var STATUTS = {
    confirme: { court: 'Confirmé', long: 'Versement confirmé par l\'organisation', sym: '✓' },
    declare: { court: 'Déclaré', long: 'Déclaré par le membre, à confirmer', sym: '?' },
    retard: { court: 'En retard', long: 'Pas encore versé, date dépassée', sym: '!' },
    partiel: { court: 'Partiel', long: 'Versement incomplet', sym: '½' },
    attendu: { court: 'À verser', long: 'À verser pour ce tour', sym: '•' },
    avenir: { court: 'À venir', long: 'Tour à venir', sym: '' }
  };

  // ---------- Chaîne d'empreintes (historique infalsifiable) ----------
  // Texte JSON tel que la base l'écrit (jsonb) : clés triées par longueur puis par ordre binaire, séparateurs « , » et « : ».
  function jsonbTexte(o) {
    if (o === null || o === undefined) return 'null';
    if (typeof o === 'string') return JSON.stringify(o);
    if (typeof o === 'number' || typeof o === 'boolean') return String(o);
    if (Array.isArray(o)) return '[' + o.map(jsonbTexte).join(', ') + ']';
    var cles = Object.keys(o).sort(function (a, b) { return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0); });
    return '{' + cles.map(function (k) { return JSON.stringify(k) + ': ' + jsonbTexte(o[k]); }).join(', ') + '}';
  }
  // « 2026-11-03T19:48:00.12+00:00 » → « 2026-11-03 19:48:00.12+00 » (écriture texte d'un horodatage PostgreSQL)
  function horodatagePg(le) {
    var s = String(le || '').replace('T', ' ');
    return s.replace(/([+-]\d{2}):00$/, '$1').replace(/Z$/, '+00');
  }
  function empreinteAttendue(precedent, ev) {
    return sha256(precedent + '|' + ev.type + '|' + ev.auteur + '|' + jsonbTexte(ev.donnees || {}) + '|' + horodatagePg(ev.le));
  }
  // → { ok, n, rupture (indice ou -1), raison : 'lien' | 'empreinte' | '', derniere }
  function verifierChaine(id, evs) {
    evs = evs || [];
    var prec = sha256(id), res = { ok: true, n: evs.length, rupture: -1, raison: '', derniere: '', premiere: prec };
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.precedent !== prec) { res.ok = false; res.rupture = i; res.raison = 'lien'; return res; }
      if (!/^[0-9a-f]{64}$/.test(String(e.empreinte || '')) || empreinteAttendue(prec, e) !== e.empreinte) { res.ok = false; res.rupture = i; res.raison = 'empreinte'; return res; }
      prec = e.empreinte;
    }
    res.derniere = prec;
    return res;
  }

  // ---------- Liens, téléphones, messages ----------
  function normaliserTel(s) {
    var t = String(s || '').replace(/[^\d+]/g, '');
    if (!t) return '';
    if (t.indexOf('+') === 0) t = t.slice(1); else if (t.indexOf('00') === 0) t = t.slice(2);
    t = t.replace(/\D/g, '');
    if (/^[37]\d{8}$/.test(t)) return '221' + t;
    return t.length >= 10 && t.length <= 15 ? t : '';
  }
  function lienWhatsApp(tel, texte) {
    var n = normaliserTel(tel);
    return 'https://wa.me/' + (n ? n : '') + '?text=' + encodeURIComponent(texte);
  }
  function lienTontine(base, role, id, jeton) {
    return String(base).replace(/[?#].*$/, '').replace(/index\.html$/, '') + '#/' + (role === 'proprio' ? 'org' : 'rejoindre') + '/' + id + '/' + jeton;
  }
  function lireLienTontine(texte) {
    var m = String(texte || '').match(/#\/(rejoindre|org)\/(D-[0-9A-HJKMNP-TV-Z]{10})\/([A-Za-z0-9_-]{20,64})(?:\/([A-Za-z0-9_-]{20,64}))?/);
    if (!m) return null;
    var r = { role: m[1] === 'org' ? 'proprio' : 'membre', id: m[2], jeton: m[3] };
    if (m[1] === 'org' && m[4]) r.jetonMembre = m[4];
    return r;
  }
  function lireLienCommande(texte) {
    var s = String(texte || '').trim();
    if (!s) return null;
    var o = s.match(/[?&]o=(TCV-[0-9A-HJKMNP-TV-Z]{8})(?![0-9A-Z])/i);
    var t = s.match(/[?&]t=([A-Za-z0-9_-]{20,64})(?![A-Za-z0-9_-])/);
    if (o && t) return { o: o[1].toUpperCase(), t: t[1] };
    var m = s.match(/TCV-[0-9A-HJKMNP-TV-Z]{8}(?![0-9A-Z])/i);
    if (!m) return null;
    var reste = s.replace(m[0], ' ').replace(/https?:\/\/\S*/g, ' ');
    var j = reste.match(/(?:^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{20,64})(?![A-Za-z0-9_-])/);
    return j ? { o: m[0].toUpperCase(), t: j[1] } : null;
  }
  function libelleTour(t, n) { return 'tour n° ' + n + ' (' + dateLongue(t.dates[n - 1]) + ')'; }
  function listeTours(t, ps) {
    var l = ps.map(function (n) { return 'n° ' + n + ' (' + dateLongue(t.dates[n - 1]) + ')'; });
    return (l.length > 1 ? 'tours ' + l.slice(0, -1).join(', ') + ' et ' + l[l.length - 1] : 'tour ' + l[0]);
  }
  function messageRappel(t, o) {
    // o : { membre, periode | periodes: [n…], montant (total dû), lien, enRetard }
    var nom = nomMembre(t, o.membre);
    var ps = (o.periodes && o.periodes.length ? o.periodes : [o.periode]).slice().sort(function (a, b) { return a - b; });
    var debut = 'Petit rappel amical pour la tontine « ' + t.titre + ' » : ';
    var l = ['Bonjour ' + nom + ',', ''];
    if (ps.length > 1) l.push(debut + 'vos cotisations des ' + listeTours(t, ps) + ' ne sont pas encore notées, soit ' + formatF(o.montant) + ' au total.');
    else if (o.enRetard) l.push(debut + 'votre cotisation de ' + formatF(o.montant) + ' pour le ' + listeTours(t, ps) + ' n\'est pas encore notée.');
    else l.push(debut + 'votre cotisation de ' + formatF(o.montant) + ' est attendue pour le ' + listeTours(t, ps) + '.');
    l.push('Si vous avez déjà versé, merci de le signaler en touchant « J\'ai versé » ici : ' + o.lien);
    l.push('', 'Merci beaucoup et bonne journée !');
    if (t.organisateur) l.push(t.organisateur);
    return l.join('\n').replace(/\u00a0/g, ' ');
  }
  function messageGroupe(t, r, n, lien) {
    var tr = r.tours[n - 1];
    if (!tr) return '';
    var payes = t.membres.filter(function (m) { return r.cellules[m.id][n].statut === 'confirme'; }).length;
    var attente = tr.doivent.map(function (id) { return nomMembre(t, id); });
    var l = ['Tontine « ' + t.titre + ' » : ' + libelleTour(t, n), ''];
    l.push((tr.remis ? 'Main remise à : ' : 'Bénéficiaire : ') + nomMembre(t, tr.beneficiaire));
    l.push('Versements confirmés : ' + payes + ' sur ' + t.membres.length + ' (' + formatF(tr.confirme) + ' sur ' + formatF(tr.attendu) + ')');
    if (attente.length) l.push('Encore attendus : ' + attente.join(', '));
    else l.push('Tout le monde a versé. Merci à toutes et à tous !');
    l.push('', 'Le calendrier et les versements : ' + lien);
    l.push('Tontine Claire n\'encaisse jamais d\'argent : les versements se font entre vous, l\'application garde la trace.');
    return l.join('\n').replace(/ /g, ' ');
  }
  function messageInvitation(t, lien) {
    return ['Bonjour à toutes et à tous,', '', 'Voici le suivi de notre tontine « ' + t.titre + ' » : ' + formatF(t.montant) + ' ' + parPeriode(t.frequence, t.intervalle) +
      ', premier tour le ' + dateLongue(t.debut) + '.', 'Vous y verrez le calendrier, le tour de chacun et les versements. Quand vous avez versé, touchez « J\'ai versé ».', '', lien, '',
      'Tontine Claire n\'encaisse jamais d\'argent : les versements se font entre nous, l\'application garde la trace.'].join('\n').replace(/ /g, ' ');
  }

  // ---------- Pass et limites ----------
  function limiteAtteinte(nbActives, nbMembres, premium) {
    if (premium) return '';
    if (nbActives >= GRATUIT_TONTINES) return 'tontines';
    if (nbMembres > GRATUIT_MEMBRES) return 'membres';
    return '';
  }

  // Texte pour le PDF (polices standard : Latin-1 + quelques signes Windows-1252)
  var CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function textePDF(s) {
    s = String(s == null ? '' : s).replace(/[   ]/g, ' ').replace(/\r\n?/g, '\n').replace(/✓/g, 'OK');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.indexOf(ch) >= 0) { out += ch; continue; }
      var base = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : ch;
      out += /^[\x20-\x7e]$/.test(base) ? base : (c >= 0xD800 && c <= 0xDBFF ? (i++, '') : '');
    }
    return out;
  }

  var TC = {
    API: API, GRATUIT_TONTINES: GRATUIT_TONTINES, GRATUIT_MEMBRES: GRATUIT_MEMBRES, PASS_SLUG: PASS_SLUG, PASS_PRIX: PASS_PRIX,
    MAX_EVENEMENTS: MAX_EVENEMENTS, NOM_MAX: NOM_MAX, REGLES_DEFAUT: REGLES_DEFAUT, STATUTS: STATUTS,
    sha256: sha256, entier: entier, formatNombre: formatNombre, formatF: formatF,
    isoLocal: isoLocal, dateValide: dateValide, ajouterJours: ajouterJours, ajouterMois: ajouterMois, ecartJours: ecartJours,
    dateCourte: dateCourte, dateMoyenne: dateMoyenne, dateLongue: dateLongue, dateHeure: dateHeure, datesTours: datesTours,
    libelleFrequence: libelleFrequence, parPeriode: parPeriode,
    nettoyerNom: nettoyerNom, encoderMembres: encoderMembres, decoderMembres: decoderMembres, encoderTontine: encoderTontine,
    decoderTontine: decoderTontine, tailleDonnees: tailleDonnees, nomMembre: nomMembre,
    tirage: tirage, graineNouvelle: graineNouvelle, ordreParDate: ordreParDate, ordreManuel: ordreManuel, verifierTirage: verifierTirage, listeMains: listeMains,
    amendePour: amendePour, calculer: calculer,
    jsonbTexte: jsonbTexte, horodatagePg: horodatagePg, empreinteAttendue: empreinteAttendue, verifierChaine: verifierChaine,
    normaliserTel: normaliserTel, lienWhatsApp: lienWhatsApp, lienTontine: lienTontine, lireLienTontine: lireLienTontine, lireLienCommande: lireLienCommande,
    messageRappel: messageRappel, messageGroupe: messageGroupe, messageInvitation: messageInvitation, libelleTour: libelleTour,
    limiteAtteinte: limiteAtteinte, textePDF: textePDF
  };
  if (typeof module === 'object' && module.exports) module.exports = TC;
  else racine.TC = TC;
})(typeof self !== 'undefined' ? self : this);
