/* ColisPreuve — logique sans écran : états des colis, montants, tableau de bord, CSV, messages, liens,
   vérification de l'historique chaîné. Fonctionne dans le navigateur (window.CP) et dans Node (require) pour les tests. */
(function (racine) {
  'use strict';
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/dossiers';
  var LIMITE_GRATUITE = 5;
  var HEURE = 3600000, JOUR = 86400000;

  // ---------- États d'un colis ----------
  var ETATS = {
    cree: { libelle: 'Créé', phrase: 'Le colis est enregistré par le vendeur.' },
    prepare: { libelle: 'Préparé', phrase: 'Le colis est prêt chez le vendeur.' },
    chez_livreur: { libelle: 'Chez le livreur', phrase: 'Le livreur a le colis.' },
    en_route: { libelle: 'En route', phrase: 'Le livreur est en route.' },
    tentative: { libelle: 'Tentative', phrase: 'Le livreur est passé mais n\'a pas pu remettre le colis.' },
    livre: { libelle: 'Livré', phrase: 'Remis au client : le code du client a été vérifié.' },
    recu: { libelle: 'Reçu', phrase: 'Le client a confirmé la réception.' },
    probleme: { libelle: 'Problème', phrase: 'Le client a signalé un problème.' },
    annule: { libelle: 'Annulé', phrase: 'Le vendeur a annulé ce colis.' }
  };
  var ORDRE_ETATS = ['cree', 'prepare', 'chez_livreur', 'en_route', 'tentative', 'livre', 'recu', 'probleme', 'annule'];
  var EN_COURS = { cree: 1, prepare: 1, chez_livreur: 1, en_route: 1, tentative: 1 };
  var RANG = { preparation: 1, remise_livreur: 2, prise_en_charge: 2, en_route: 3, tentative: 3 };
  var ETAT_DE = { preparation: 'prepare', remise_livreur: 'chez_livreur', prise_en_charge: 'chez_livreur', en_route: 'en_route', tentative: 'tentative' };

  // État affiché, déduit de l'historique (plus sûr que le dernier statut : l'ordre des gestes n'est pas imposé)
  function etatColis(evs) {
    var prog = null, rang = 0, livre = false, recu = false, annule = false, dernierClient = null;
    (evs || []).forEach(function (e) {
      var t = e && e.type;
      if (RANG[t] && RANG[t] >= rang) { rang = RANG[t]; prog = ETAT_DE[t]; }
      else if (t === 'livraison') livre = true;
      else if (t === 'reception') { recu = true; dernierClient = 'reception'; }
      else if (t === 'probleme') dernierClient = 'probleme';
      else if (t === 'annulation') annule = true;
    });
    if (annule) return 'annule';
    if (dernierClient === 'probleme') return 'probleme';
    if (recu) return 'recu';
    if (livre) return 'livre';
    return prog || 'cree';
  }
  function dernier(evs, type) {
    for (var i = (evs || []).length - 1; i >= 0; i--) if (evs[i] && evs[i].type === type) return evs[i];
    return null;
  }
  function premier(evs, type) {
    for (var i = 0; i < (evs || []).length; i++) if (evs[i] && evs[i].type === type) return evs[i];
    return null;
  }

  // ---------- Libellés ----------
  var ROLES = { proprio: 'Vendeur', livreur: 'Livreur', destinataire: 'Client' };
  var PAIEMENTS = { deja_paye: 'Déjà payé', especes: 'Espèces à la livraison', wave: 'Wave à la livraison', orange_money: 'Orange Money à la livraison' };
  var MODES = { especes: 'Espèces', wave: 'Wave', orange_money: 'Orange Money' };
  var EVENEMENTS = {
    creation: 'Colis créé',
    preparation: 'Colis préparé',
    remise_livreur: 'Remis au livreur',
    prise_en_charge: 'Pris en charge par le livreur',
    en_route: 'En route vers le client',
    tentative: 'Tentative de livraison',
    livraison: 'Livré : code du client vérifié',
    reception: 'Réception confirmée par le client',
    probleme: 'Problème signalé par le client',
    annulation: 'Colis annulé',
    note: 'Note',
    preuve: 'Photo ajoutée',
    modification: 'Informations modifiées'
  };
  var RAISONS_TENTATIVE = ['Client absent', 'Client injoignable', 'Lieu introuvable', 'Client a refusé le colis', 'Client a demandé un autre jour', 'Autre raison'];
  var RAISONS_PROBLEME = ['Colis pas reçu', 'Colis abîmé', 'Article manquant ou différent', 'Montant demandé différent', 'Retard', 'Autre problème'];

  function libelleEvenement(e) { return EVENEMENTS[e && e.type] || 'Étape'; }
  function detailEvenement(e) {
    var d = (e && e.donnees) || {}, morceaux = [];
    if (e.type === 'creation') {
      if (d.articles) morceaux.push(String(d.articles));
    }
    if (d.raison) morceaux.push(String(d.raison));
    if (e.type === 'livraison') {
      if (typeof d.montant_encaisse === 'number' && d.montant_encaisse > 0) morceaux.push('Encaissé : ' + formatF(d.montant_encaisse) + (d.mode_paiement && MODES[d.mode_paiement] ? ' (' + MODES[d.mode_paiement] + ')' : ''));
    }
    if (e.type === 'preuve' && d.legende) morceaux.push(String(d.legende));
    if (d.commentaire) morceaux.push('« ' + String(d.commentaire) + ' »');
    if (e.type === 'note' && d.texte) morceaux.push(String(d.texte));
    return morceaux.join(' · ');
  }

  // ---------- Nombres et dates ----------
  function formatNombre(n) {
    var s = String(Math.round(Math.abs(+n || 0)));
    var out = '';
    for (var i = 0; i < s.length; i++) { if (i && (s.length - i) % 3 === 0) out += ' '; out += s[i]; }
    return (n < 0 ? '-' : '') + out;
  }
  function formatF(n) { return formatNombre(n) + ' F'; }
  function lireMontant(s) {
    var t = String(s == null ? '' : s).replace(/[\s  .]/g, '').replace(/f(cfa)?$/i, '');
    if (!t) return 0;
    if (!/^\d{1,9}$/.test(t)) return NaN;
    return parseInt(t, 10);
  }
  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function dateFr(iso) { var d = new Date(iso); if (isNaN(d)) return ''; return deux(d.getDate()) + '/' + deux(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function heureFr(iso) { var d = new Date(iso); if (isNaN(d)) return ''; return deux(d.getHours()) + ':' + deux(d.getMinutes()); }
  function dateHeureFr(iso) { return dateFr(iso) + ' à ' + heureFr(iso); }
  var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  function jourCourt(d) { return JOURS[d.getDay()] + ' ' + d.getDate(); }
  function cleJour(t) { var d = new Date(t); return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }
  function cleMois(t) { var d = new Date(t); return d.getFullYear() + '-' + deux(d.getMonth() + 1); }
  function depuis(iso, maintenant) {
    var ms = (maintenant == null ? Date.now() : +maintenant) - Date.parse(iso);
    if (!isFinite(ms)) return '';
    if (ms < 60000) return 'à l\'instant';
    if (ms < HEURE) return 'il y a ' + Math.floor(ms / 60000) + ' min';
    if (ms < JOUR) return 'il y a ' + Math.floor(ms / HEURE) + ' h';
    var j = Math.floor(ms / JOUR);
    return 'il y a ' + j + ' jour' + (j > 1 ? 's' : '');
  }

  // ---------- Code de remise (4 chiffres, tiré au hasard par crypto) ----------
  function codeFacile(c) {
    if (/^(\d)\1{3}$/.test(c)) return true;           // 1111
    if ('0123456789012'.indexOf(c) >= 0 || '9876543210987'.indexOf(c) >= 0) return true; // 1234, 4321
    if (/^(\d\d)\1$/.test(c)) return true;            // 1212
    if (/^19\d\d$|^20[0-3]\d$/.test(c)) return true;  // années
    return false;
  }
  function genererCode() {
    var cr = racine.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    var buf = new Uint32Array(1);
    for (var essai = 0; essai < 100; essai++) {
      cr.getRandomValues(buf);
      if (buf[0] >= 4294965000) continue; // tirage uniforme (rejet du reste)
      var c = String(1000 + (buf[0] % 9000));
      if (!codeFacile(c)) return c;
    }
    return String(1000 + (buf[0] % 9000));
  }

  // ---------- Protection des données : pas de numéro de téléphone ----------
  function contientTelephone(s) {
    var t = String(s || '');
    if (/(?:^|[^\d])(?:\+|00)?(?:221[\s.\-]*)?(?:7[05678]|3[03])(?:[\s.\-]*\d){7}(?!\d)/.test(t)) return true;
    if (/\+\s*\d(?:[\s.\-]*\d){7,}/.test(t)) return true;
    return false;
  }

  // ---------- Montants et tableau de bord ----------
  function aEncaisserColis(c) { return !!c && c.paiement && c.paiement !== 'deja_paye' && (+c.montant || 0) > 0; }
  function evsDe(c) { return (c && c.evenements) || []; }
  function montantEncaisse(c) {
    var l = premier(evsDe(c), 'livraison');
    if (!l || !aEncaisserColis(c)) return 0;
    var d = l.donnees || {};
    return typeof d.montant_encaisse === 'number' && d.montant_encaisse >= 0 ? d.montant_encaisse : (+c.montant || 0);
  }
  function stats(liste, maintenant, heuresAlerte) {
    var now = maintenant == null ? Date.now() : +maintenant;
    var seuil = (heuresAlerte || 24) * HEURE;
    var r = { total: 0, parEtat: {}, aEncaisser: 0, nbAEncaisser: 0, encaisse: 0, nbEncaisse: 0, alertes: [], parJour: [], enCours: 0, livresMois: 0 };
    ORDRE_ETATS.forEach(function (k) { r.parEtat[k] = 0; });
    var jours = {}, i;
    for (i = 6; i >= 0; i--) {
      var d = new Date(now - i * JOUR);
      var k = cleJour(d);
      jours[k] = { cle: k, libelle: jourCourt(d), crees: 0, livres: 0 };
      r.parJour.push(jours[k]);
    }
    var mois = cleMois(now);
    (liste || []).forEach(function (c) {
      var evs = evsDe(c), etat = etatColis(evs);
      r.total++; r.parEtat[etat]++;
      if (EN_COURS[etat]) r.enCours++;
      var liv = premier(evs, 'livraison');
      if (aEncaisserColis(c)) {
        if (liv) { r.encaisse += montantEncaisse(c); r.nbEncaisse++; }
        else if (etat !== 'annule') { r.aEncaisser += +c.montant; r.nbAEncaisser++; }
      }
      if (c.creeLe && jours[cleJour(c.creeLe)]) jours[cleJour(c.creeLe)].crees++;
      if (liv && liv.le) {
        if (jours[cleJour(liv.le)]) jours[cleJour(liv.le)].livres++;
        if (cleMois(liv.le) === mois) r.livresMois++;
      }
      if (EN_COURS[etat] && c.creeLe && now - Date.parse(c.creeLe) > seuil) r.alertes.push({ type: 'retard', id: c.id, depuis: c.creeLe });
      if (etat === 'livre' && liv && now - Date.parse(liv.le) > seuil) r.alertes.push({ type: 'non_confirme', id: c.id, depuis: liv.le });
      if (etat === 'probleme') { var p = dernier(evs, 'probleme'); r.alertes.push({ type: 'probleme', id: c.id, depuis: p && p.le, raison: p && p.donnees && p.donnees.raison }); }
    });
    var poids = { probleme: 0, non_confirme: 1, retard: 2 };
    r.alertes.sort(function (a, b) { return poids[a.type] - poids[b.type] || Date.parse(a.depuis) - Date.parse(b.depuis); });
    return r;
  }
  function filtrer(liste, f, maintenant) {
    var now = maintenant == null ? Date.now() : +maintenant;
    f = f || {};
    var q = sansAccents(String(f.texte || '').trim().toLowerCase());
    var limite = f.periode === 'jour' ? cleJour(now) : f.periode === '7j' ? now - 7 * JOUR : f.periode === '30j' ? now - 30 * JOUR : null;
    return (liste || []).filter(function (c) {
      var etat = etatColis(evsDe(c));
      if (f.etat && f.etat !== 'tous') {
        if (f.etat === 'en_cours') { if (!EN_COURS[etat]) return false; }
        else if (etat !== f.etat) return false;
      }
      if (limite != null) {
        if (f.periode === 'jour') { if (cleJour(c.creeLe) !== limite) return false; }
        else if (Date.parse(c.creeLe) < limite) return false;
      }
      if (q) {
        var h = sansAccents([c.ref, c.client, c.zone, c.articles, c.id].join(' ').toLowerCase());
        if (h.indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  function sansAccents(s) { return String(s || '').normalize ? String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '') : String(s || ''); }

  // ---------- Export CSV (tableur : séparateur « ; », UTF-8 avec BOM) ----------
  function celluleCsv(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = '\'' + s; // pas de formule involontaire dans le tableur
    if (/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function csv(liste) {
    var lignes = [['Référence', 'Client', 'Zone', 'Articles', 'Montant à encaisser (F)', 'Paiement', 'Statut', 'Créé le', 'Livré le', 'Reçu le', 'Encaissé (F)', 'Code vérifié', 'Dossier']];
    (liste || []).forEach(function (c) {
      var evs = evsDe(c), liv = premier(evs, 'livraison'), rec = premier(evs, 'reception');
      lignes.push([c.ref, c.client, c.zone, c.articles, aEncaisserColis(c) ? +c.montant : 0, PAIEMENTS[c.paiement] || '', ETATS[etatColis(evs)].libelle,
        c.creeLe ? dateHeureFr(c.creeLe) : '', liv ? dateHeureFr(liv.le) : '', rec ? dateHeureFr(rec.le) : '', montantEncaisse(c),
        liv && liv.donnees && liv.donnees.code_verifie ? 'oui' : 'non', c.id]);
    });
    return '﻿' + lignes.map(function (l) { return l.map(celluleCsv).join(';'); }).join('\r\n') + '\r\n';
  }

  // ---------- Liens ----------
  var CHEMINS = { proprio: 'vendeur', livreur: 'livreur', destinataire: 'suivi' };
  function baseApp(loc) {
    var l = loc || (typeof location !== 'undefined' ? location : null);
    if (!l) return '';
    return l.origin + l.pathname.replace(/index\.html$/, '');
  }
  function lienRole(base, role, id, jeton) { return base + '#/' + CHEMINS[role] + '/' + id + '/' + jeton; }
  var RE_ID = /^D-[0-9A-HJKMNP-TV-Z]{10}$/, RE_JETON = /^[A-Za-z0-9_-]{20,64}$/;
  function lireLienRole(texte) {
    var m = String(texte || '').match(/#\/(vendeur|livreur|suivi)\/(D-[0-9A-HJKMNP-TV-Z]{10})\/([A-Za-z0-9_-]{20,64})/);
    if (!m) return null;
    return { role: { vendeur: 'proprio', livreur: 'livreur', suivi: 'destinataire' }[m[1]], id: m[2], jeton: m[3] };
  }
  // Lien de la page de commande de la boutique : …/commande.html?o=TCV-XXXXXXXX&t=<jeton> (ou « TCV-… » suivi du jeton)
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

  // ---------- Messages à partager (sans numéro de téléphone) ----------
  function ligneMontant(c, pour) {
    if (!aEncaisserColis(c)) return '';
    var mode = MODES[c.paiement] || '';
    return '\n' + (pour === 'client' ? 'À payer à la livraison : ' : 'À encaisser : ') + formatF(c.montant) + (mode ? ' (' + mode + ')' : '') + '.';
  }
  function messageClient(c, lien) {
    return 'Bonjour ' + (c.client || '') + ', votre commande ' + (c.ref || '') + (c.boutique ? ' chez ' + c.boutique : '') + ' est enregistrée.\n' +
      'Suivez votre colis ici : ' + lien + '\n\n' +
      'Votre code de remise : ' + c.code + '\n' +
      'Donnez ce code au livreur seulement à la réception : ' + c.code + '. Ne le donnez à personne avant d\'avoir le colis en main.' +
      ligneMontant(c, 'client');
  }
  function messageLivreur(c, lien) {
    return 'Bonjour, voici le colis ' + (c.ref || '') + ' à livrer' + (c.zone ? ' (' + c.zone + ')' : '') + (c.client ? ' pour ' + c.client : '') + '.\n' +
      'Ouvrez ce lien pour noter chaque étape, sans rien installer : ' + lien + '\n' +
      'À la remise, demandez au client son code à 4 chiffres et tapez-le dans la page.' + ligneMontant(c, 'livreur');
  }

  // ---------- Historique chaîné : vérification sur le téléphone ----------
  function hex(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; }
  function sha256Hex(texte) {
    var cr = racine.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    return cr.subtle.digest('SHA-256', new TextEncoder().encode(texte)).then(hex);
  }
  // Texte d'un objet tel que la base l'écrit (jsonb) : clés triées par longueur puis par octets, « , » et « : » suivis d'un espace
  function octets(s) { return new TextEncoder().encode(s); }
  function compareCles(a, b) {
    var x = octets(a), y = octets(b);
    if (x.length !== y.length) return x.length - y.length;
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  }
  function chaineJson(s) {
    var out = '"';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (ch === '"') out += '\\"';
      else if (ch === '\\') out += '\\\\';
      else if (ch === '\b') out += '\\b';
      else if (ch === '\f') out += '\\f';
      else if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else if (c < 32) out += '\\u' + ('000' + c.toString(16)).slice(-4);
      else out += ch;
    }
    return out + '"';
  }
  function nombreJson(n) {
    var s = String(n);
    if (!/e/i.test(s)) return s;
    var m = s.match(/^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/i);
    if (!m) return s;
    var chiffres = m[2] + (m[3] || ''), exp = parseInt(m[4], 10), pos = 1 + exp;
    if (pos >= chiffres.length) return m[1] + chiffres + new Array(pos - chiffres.length + 1).join('0');
    if (pos <= 0) return m[1] + '0.' + new Array(-pos + 1).join('0') + chiffres;
    return m[1] + chiffres.slice(0, pos) + '.' + chiffres.slice(pos);
  }
  function jsonbTexte(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return nombreJson(v);
    if (typeof v === 'string') return chaineJson(v);
    if (Array.isArray(v)) return '[' + v.map(jsonbTexte).join(', ') + ']';
    var cles = Object.keys(v).sort(compareCles);
    return '{' + cles.map(function (k) { return chaineJson(k) + ': ' + jsonbTexte(v[k]); }).join(', ') + '}';
  }
  // Horodatage tel que la base l'écrit en texte : « 2026-11-03 19:46:38.123+00 »
  function pgHorodatage(le) {
    return String(le || '').replace('T', ' ').replace(/([+-]\d\d):00$/, '$1');
  }
  function empreinteEvenement(e) {
    return sha256Hex(String(e.precedent) + '|' + e.type + '|' + e.auteur + '|' + jsonbTexte(e.donnees || {}) + '|' + pgHorodatage(e.le));
  }
  // Vérifie que chaque étape porte l'empreinte de la précédente (la première porte celle du numéro du dossier),
  // puis recalcule l'empreinte de chaque étape (sauf la création, qui contient une donnée masquée) à partir de son contenu.
  function verifierChaine(id, evs) {
    evs = evs || [];
    var r = { ok: true, total: evs.length, liens: 0, contenus: 0, contenusTotal: 0, erreurs: [] };
    if (!evs.length) { r.ok = false; r.erreurs.push({ index: -1, raison: 'vide' }); return Promise.resolve(r); }
    var i = 0;
    return sha256Hex(String(id)).then(function suivant(attendu) {
      if (i >= evs.length) return r;
      var e = evs[i];
      if (e.precedent === attendu) r.liens++;
      else { r.ok = false; r.erreurs.push({ index: i, raison: 'lien' }); }
      var p = Promise.resolve();
      if (e.type !== 'creation') {
        r.contenusTotal++;
        p = empreinteEvenement(e).then(function (calc) {
          if (calc === e.empreinte) r.contenus++;
          else { r.ok = false; r.erreurs.push({ index: i, raison: 'contenu' }); }
        });
      }
      return p.then(function () { var emp = e.empreinte; i++; return suivant(emp); });
    });
  }

  // ---------- PDF : texte compatible avec les polices standard (WinAnsi) ----------
  var CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function textePDF(s) {
    s = String(s == null ? '' : s).replace(/[   ]/g, ' ').replace(/\r\n?/g, '\n');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.indexOf(ch) >= 0) { out += ch; continue; }
      if (ch === '✓' || ch === '✔') { out += 'OK'; continue; }
      if (ch === '→') { out += '->'; continue; }
      var base = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : ch;
      out += /^[\x20-\x7e]$/.test(base) ? base : (c >= 0xD800 && c <= 0xDBFF ? (i++, '') : '');
    }
    return out;
  }

  var CP = {
    API: API, LIMITE_GRATUITE: LIMITE_GRATUITE, ETATS: ETATS, ORDRE_ETATS: ORDRE_ETATS, EN_COURS: EN_COURS, ROLES: ROLES,
    PAIEMENTS: PAIEMENTS, MODES: MODES, EVENEMENTS: EVENEMENTS, RAISONS_TENTATIVE: RAISONS_TENTATIVE, RAISONS_PROBLEME: RAISONS_PROBLEME,
    etatColis: etatColis, dernier: dernier, premier: premier, libelleEvenement: libelleEvenement, detailEvenement: detailEvenement,
    formatNombre: formatNombre, formatF: formatF, lireMontant: lireMontant, dateFr: dateFr, heureFr: heureFr, dateHeureFr: dateHeureFr,
    cleJour: cleJour, cleMois: cleMois, depuis: depuis, genererCode: genererCode, codeFacile: codeFacile, contientTelephone: contientTelephone,
    aEncaisserColis: aEncaisserColis, montantEncaisse: montantEncaisse, stats: stats, filtrer: filtrer, sansAccents: sansAccents, csv: csv,
    baseApp: baseApp, lienRole: lienRole, lireLienRole: lireLienRole, lireLienCommande: lireLienCommande, RE_ID: RE_ID, RE_JETON: RE_JETON,
    messageClient: messageClient, messageLivreur: messageLivreur,
    sha256Hex: sha256Hex, jsonbTexte: jsonbTexte, pgHorodatage: pgHorodatage, empreinteEvenement: empreinteEvenement, verifierChaine: verifierChaine,
    textePDF: textePDF
  };
  if (typeof module === 'object' && module.exports) module.exports = CP;
  else racine.CP = CP;
})(typeof self !== 'undefined' ? self : globalThis);
