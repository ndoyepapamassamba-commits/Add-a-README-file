/* Rendez-vous Pro — cœur : profil de la page, horaires, services, rendez-vous tirés de l'historique, créneaux libres,
   messages WhatsApp, pass, semaine. Sans dépendance. Navigateur (window.RV) et Node (require) pour les tests. */
(function (racine) {
  'use strict';
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/dossiers';
  var API_BOUTIQUE = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique';
  var SITE = 'https://ndoyepapamassamba-commits.github.io/Add-a-README-file/apps/rdv/';
  var BOUTIQUE = '../../boutique/';
  var LIMITE_GRATUITE = 15;      // rendez-vous acceptés par mois sans pass
  var CAPACITE_PAGE = 1500;      // événements gardés par le serveur pour une page
  var RAPPEL_JOURS = 5;          // rappel avant la fin du pass
  var JOUR_MS = 86400000;
  var PASS = {
    'pass-rendez-vous-pro-1-mois': { nom: 'Pass 1 mois', prix: 1000, jours: 31 },
    'pass-rendez-vous-pro-12-mois': { nom: 'Pass 12 mois', prix: 9000, jours: 366 }
  };
  var JOURS = [
    { cle: 'lun', nom: 'lundi' }, { cle: 'mar', nom: 'mardi' }, { cle: 'mer', nom: 'mercredi' }, { cle: 'jeu', nom: 'jeudi' },
    { cle: 'ven', nom: 'vendredi' }, { cle: 'sam', nom: 'samedi' }, { cle: 'dim', nom: 'dimanche' }
  ];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  // Métiers proposés (hors cabinets médicaux) et services d'exemple, modifiables
  var METIERS = [
    { cle: 'coiffure', nom: 'Coiffure, tresses, barbier', services: [['Coupe homme', 1500, 30], ['Tresses', 10000, 180], ['Brushing', 3000, 60]] },
    { cle: 'beaute', nom: 'Beauté, ongles, maquillage', services: [['Pose d\'ongles', 5000, 60], ['Maquillage', 10000, 60]] },
    { cle: 'couture', nom: 'Couture, tailleur', services: [['Prise de mesures', 0, 30], ['Essayage', 0, 30]] },
    { cle: 'mecanique', nom: 'Mécanique, garage', services: [['Vidange', 15000, 60], ['Diagnostic', 5000, 30]] },
    { cle: 'photo', nom: 'Photographe, studio', services: [['Photo d\'identité', 2000, 15], ['Séance photo', 25000, 60]] },
    { cle: 'cours', nom: 'Répétiteur, cours particuliers', services: [['Cours d\'une heure', 5000, 60]] },
    { cle: 'conseil', nom: 'Consultant, conseil aux entreprises', services: [['Rendez-vous d\'une heure', 20000, 60]] },
    { cle: 'autre', nom: 'Autre service', services: [['Rendez-vous', 0, 30]] }
  ];
  var METIER = {};
  METIERS.forEach(function (m) { METIER[m.cle] = m; });
  var STATUTS = {
    en_attente: { nom: 'En attente', ton: 'attente' },
    confirme: { nom: 'Confirmé', ton: 'ok' },
    reporte: { nom: 'Autre heure proposée', ton: 'info' },
    refuse: { nom: 'Refusé', ton: 'neutre' },
    annule: { nom: 'Annulé', ton: 'neutre' }
  };
  var ACTIFS = { en_attente: 1, confirme: 1, reporte: 1 };

  // ---------- Petits outils ----------
  function texte(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max || 2000); }
  function entier(v) {
    if (typeof v === 'number') return isFinite(v) ? Math.round(v) : 0;
    var s = String(v == null ? '' : v).replace(/[\s\u00a0\u202f.]/g, '').replace(/f(cfa)?$/i, '');
    return /^-?\d+$/.test(s) ? parseInt(s, 10) : 0;
  }
  function borne(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function milliers(n) { return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'); }
  function fcfa(n) { n = entier(n); return (n < 0 ? '-' : '') + milliers(n) + '\u00a0F'; }

  // ---------- Heures et dates (heure du téléphone ; Dakar = UTC, sans heure d'été) ----------
  function minutes(h) { var m = String(h || '').match(/^(\d{1,2}):(\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; }
  function hhmm(n) { return deux(Math.floor(n / 60)) + ':' + deux(n % 60); }
  function heureFr(h) { var n = minutes(h); if (n == null) return String(h || ''); var m = n % 60; return Math.floor(n / 60) + '\u00a0h' + (m ? '\u00a0' + deux(m) : ''); }
  function iso(d) { return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }
  function versDate(isoJour, h) {
    var m = String(isoJour || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var n = h == null ? 0 : minutes(h) || 0;
    return new Date(+m[1], +m[2] - 1, +m[3], Math.floor(n / 60), n % 60);
  }
  function dateValide(s) { var d = versDate(s); return !!d && iso(d) === s; }
  function ajouterJours(isoJour, k) { var d = versDate(isoJour); d.setDate(d.getDate() + k); return iso(d); }
  function aujourdhui(maintenant) { return iso(maintenant == null ? new Date() : new Date(maintenant)); }
  function jourSemaine(isoJour) { var d = versDate(isoJour); return JOURS[(d.getDay() + 6) % 7].cle; }
  function lundi(isoJour) { var d = versDate(isoJour); return ajouterJours(isoJour, -((d.getDay() + 6) % 7)); }
  function dateFr(isoJour, opts) {
    var d = versDate(isoJour); if (!d) return '';
    opts = opts || {};
    var s = (opts.sansJour ? '' : JOURS[(d.getDay() + 6) % 7].nom + ' ') + (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + MOIS[d.getMonth()];
    return opts.annee ? s + ' ' + d.getFullYear() : s;
  }
  function moisCle(t) { var d = new Date(t); return isNaN(d) ? '' : d.getFullYear() + '-' + deux(d.getMonth() + 1); }
  function moisFr(t) { var d = new Date(t); return MOIS[d.getMonth()] + ' ' + d.getFullYear(); }

  // ---------- Horaires : « 09:00-13:00,15:00-19:00 » ----------
  function lireHoraires(s) {
    var out = [];
    String(s || '').split(/[,;]/).forEach(function (p) {
      var m = p.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
      if (!m) return;
      var a = minutes(m[1].length === 4 ? '0' + m[1] : m[1]), b = minutes(m[2].length === 4 ? '0' + m[2] : m[2]);
      if (a == null || b == null || b <= a) return;
      out.push([a, b]);
    });
    out.sort(function (x, y) { return x[0] - y[0]; });
    return out.filter(function (x, i) { return !i || x[0] >= out[i - 1][1]; });
  }
  function ecrireHoraires(plages) { return (plages || []).map(function (p) { return hhmm(p[0]) + '-' + hhmm(p[1]); }).join(','); }
  function horairesFr(plages) {
    if (!plages || !plages.length) return 'Fermé';
    return plages.map(function (p) { return heureFr(hhmm(p[0])) + ' – ' + heureFr(hhmm(p[1])); }).join(' et ');
  }

  // ---------- Services : JSON [{"n":"Tresses","p":10000,"d":180}] ----------
  function lireServices(s) {
    var l = [];
    try { l = JSON.parse(String(s || '[]')); } catch (e) { l = []; }
    if (!Array.isArray(l)) return [];
    return l.map(function (x) {
      return x && { nom: texte(x.n, 60), prix: Math.max(0, entier(x.p)), duree: borne(entier(x.d) || 30, 5, 600) };
    }).filter(function (x) { return x && x.nom; }).slice(0, 20);
  }
  function ecrireServices(l) {
    return JSON.stringify((l || []).filter(function (x) { return x && texte(x.nom); }).slice(0, 20).map(function (x) {
      return { n: texte(x.nom, 60), p: Math.max(0, entier(x.prix)), d: borne(entier(x.duree) || 30, 5, 600) };
    }));
  }
  function lireConges(s) { return String(s || '').split(/[,;\s]+/).filter(dateValide).sort(); }

  // ---------- Profil de la page (données du dossier) ----------
  function horairesParDefaut() {
    var h = {};
    JOURS.forEach(function (j) { h[j.cle] = j.cle === 'dim' ? [] : [[540, 780], [900, 1140]]; });
    return h;
  }
  function nouveauProfil(metier) {
    var m = METIER[metier] || METIER.autre;
    return { nom: '', metier: m.cle, activite: '', lieu: '', telephone: '', presentation: '', pas: 30, delai: 2, jours: 14, capacite: 1, conges: [],
      horaires: horairesParDefaut(), services: m.services.map(function (s) { return { nom: s[0], prix: s[1], duree: s[2] }; }), suite: '' };
  }
  function profil(donnees, titre) {
    var d = donnees || {};
    var p = {
      nom: texte(d.nom || titre, 80), metier: METIER[d.metier] ? d.metier : 'autre', activite: texte(d.activite, 120), lieu: texte(d.lieu, 160),
      telephone: texte(d.telephone, 30), presentation: texte(d.presentation, 400),
      pas: borne(entier(d.pas) || 30, 5, 240), delai: d.delai == null || d.delai === '' ? 2 : borne(entier(d.delai), 0, 168),
      jours: borne(entier(d.jours) || 14, 1, 90), capacite: borne(entier(d.capacite) || 1, 1, 20),
      conges: lireConges(d.conges), horaires: {}, services: lireServices(d.services), suite: texte(d.suite, 300)
    };
    JOURS.forEach(function (j) { p.horaires[j.cle] = lireHoraires(d['h_' + j.cle]); });
    return p;
  }
  function donneesProfil(p) {
    var d = { nom: texte(p.nom, 80), metier: METIER[p.metier] ? p.metier : 'autre', activite: texte(p.activite, 120), lieu: texte(p.lieu, 160),
      telephone: texte(p.telephone, 30), presentation: texte(p.presentation, 400), pas: borne(entier(p.pas) || 30, 5, 240),
      delai: borne(entier(p.delai), 0, 168), jours: borne(entier(p.jours) || 14, 1, 90), capacite: borne(entier(p.capacite) || 1, 1, 20),
      conges: (p.conges || []).filter(dateValide).join(','), services: ecrireServices(p.services), version: 1 };
    JOURS.forEach(function (j) { d['h_' + j.cle] = ecrireHoraires(p.horaires && p.horaires[j.cle]); });
    if (p.suite) d.suite = texte(p.suite, 300);
    return d;
  }
  // Erreurs bloquantes d'un profil avant enregistrement
  function verifierProfil(p) {
    var e = [];
    if (texte(p.nom).length < 2) e.push('Écrivez le nom de votre activité.');
    if (!(p.services || []).filter(function (s) { return texte(s.nom); }).length) e.push('Ajoutez au moins un service.');
    if (!JOURS.some(function (j) { return (p.horaires[j.cle] || []).length; })) e.push('Indiquez au moins un jour d\'ouverture.');
    if (p.telephone && !numeroWhatsApp(p.telephone)) e.push('Numéro WhatsApp non reconnu (ex. : 77 123 45 67).');
    return e;
  }

  // ---------- Téléphone (WhatsApp) ----------
  function numeroWhatsApp(tel) {
    var s = String(tel || '').replace(/[^\d+]/g, '');
    if (!s) return '';
    if (s.indexOf('00') === 0) s = '+' + s.slice(2);
    if (s.charAt(0) === '+') { s = s.slice(1); return /^[1-9]\d{7,14}$/.test(s) ? s : ''; }
    if (/^(7[05678]|3[03])\d{7}$/.test(s)) return '221' + s;
    if (/^221(7[05678]|3[03])\d{7}$/.test(s)) return s;
    return '';
  }
  function lienWhatsApp(numero, msg) { return 'https://wa.me/' + (numero || '') + '?text=' + encodeURIComponent(msg); }

  // ---------- Liens ----------
  function lienPage(id, jeton) { return SITE + '#d=' + id + '&t=' + jeton; }
  function lireLien(s) {
    var m = String(s || '').match(/[#&?]d=(D-[0-9A-HJKMNP-TV-Z]{10})&(?:amp;)?t=([A-Za-z0-9_-]{20,64})/);
    return m ? { id: m[1], t: m[2] } : null;
  }
  function codeDemande() {
    var b = new Uint8Array(18), s = '', a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    racine.crypto.getRandomValues(b);
    for (var i = 0; i < b.length; i++) s += a.charAt(b[i] & 63);
    return s + s.slice(0, 6);
  }

  // ---------- Rendez-vous tirés de l'historique de la page ----------
  function trier(evs) { return (evs || []).slice().sort(function (a, b) { return (a.id || 0) - (b.id || 0); }); }
  function parHeure(a, b) { return (a.date + a.heure) < (b.date + b.heure) ? -1 : (a.date + a.heure) > (b.date + b.heure) ? 1 : 0; }
  // Chaque demande (client) ou rendez-vous ajouté (professionnel) devient une fiche ; les réponses s'y rattachent par « demande »
  function reservations(evenements, pas) {
    var parRef = {}, liste = [];
    pas = pas || 30;
    trier(evenements).forEach(function (e) {
      var d = e.donnees || {};
      var directe = e.type === 'confirmation' && !d.demande && e.auteur === 'proprio';
      if (e.type === 'demande' || directe) {
        if (!dateValide(d.date) || minutes(d.heure) == null) return;
        var r = { ref: e.empreinte, page: e.page || '', source: directe ? 'pro' : 'client', nom: texte(d.nom, 80), telephone: texte(d.telephone, 30),
          service: texte(d.service, 60), prix: Math.max(0, entier(d.prix)), duree: borne(entier(d.duree) || pas, 5, 600), date: d.date, heure: d.heure,
          note: texte(d.note, 500), statut: directe ? 'confirme' : 'en_attente', creeLe: e.le, accepteLe: directe ? e.le : null,
          local: !!e.local, notes: [], rappels: 0, historique: [{ type: e.type, le: e.le, auteur: e.auteur }] };
        parRef[r.ref] = r; liste.push(r);
        return;
      }
      var x = d.demande && parRef[d.demande];
      if (!x) return;
      x.historique.push({ type: e.type, le: e.le, auteur: e.auteur, date: d.date, heure: d.heure });
      if (e.local) x.local = true;
      if (e.type === 'confirmation') {
        x.statut = 'confirme'; x.accepteLe = x.accepteLe || e.le;
        if (dateValide(d.date) && minutes(d.heure) != null) { x.date = d.date; x.heure = d.heure; }
      } else if (e.type === 'report') {
        if (dateValide(d.date) && minutes(d.heure) != null) { x.avant = { date: x.date, heure: x.heure }; x.date = d.date; x.heure = d.heure; }
        x.statut = 'reporte'; x.accepteLe = x.accepteLe || e.le;
      } else if (e.type === 'refus') { x.statut = 'refuse'; x.motif = texte(d.motif, 200); }
      else if (e.type === 'annulation') { x.statut = 'annule'; x.annulePar = e.auteur === 'proprio' ? 'pro' : 'client'; }
      else if (e.type === 'note') x.notes.push({ auteur: e.auteur, texte: texte(d.texte, 500), le: e.le });
      else if (e.type === 'rappel') x.rappels++;
    });
    return liste.sort(parHeure);
  }
  function actif(r) { return !!ACTIFS[r.statut]; }
  function retenu(r) { return r.statut === 'confirme' || r.statut === 'reporte'; }

  // ---------- Créneaux libres ----------
  function ferme(p, isoJour) { return (p.conges || []).indexOf(isoJour) > -1 || !(p.horaires[jourSemaine(isoJour)] || []).length; }
  // Jours où l'on peut réserver : d'aujourd'hui à « jours » jours
  function joursReservables(p, maintenant) {
    var a = aujourdhui(maintenant), out = [];
    for (var k = 0; k <= p.jours; k++) { var j = ajouterJours(a, k); out.push({ date: j, ouvert: !ferme(p, j) }); }
    return out;
  }
  // Heures de début possibles un jour donné pour une durée donnée, moins les rendez-vous retenus ou demandés
  function creneauxLibres(p, liste, isoJour, duree, maintenant, ignorer) {
    duree = borne(entier(duree) || p.pas, 5, 600);
    var now = maintenant == null ? new Date() : new Date(maintenant);
    var auj = iso(now);
    if (!dateValide(isoJour) || isoJour < auj || isoJour > ajouterJours(auj, p.jours) || ferme(p, isoJour)) return [];
    var limite = now.getTime() + p.delai * 3600000;
    var occ = (liste || []).filter(function (r) { return actif(r) && r.date === isoJour && r.ref !== ignorer; }).map(function (r) {
      var a = minutes(r.heure); return [a, a + (r.duree || p.pas)];
    });
    var out = [];
    (p.horaires[jourSemaine(isoJour)] || []).forEach(function (pl) {
      for (var t = pl[0]; t + duree <= pl[1]; t += p.pas) {
        if (versDate(isoJour, hhmm(t)).getTime() < limite) continue;
        var n = 0;
        for (var i = 0; i < occ.length; i++) if (occ[i][0] < t + duree && t < occ[i][1]) n++;
        if (n < p.capacite) out.push(hhmm(t));
      }
    });
    return out;
  }
  // Grille d'une journée pour l'agenda : rendez-vous et plages libres, dans l'ordre
  function journee(p, liste, isoJour) {
    var rdv = (liste || []).filter(function (r) { return r.date === isoJour && (actif(r)); }).sort(parHeure);
    var lignes = [], plages = p.horaires[jourSemaine(isoJour)] || [];
    var occupe = function (t) { return rdv.filter(function (r) { var a = minutes(r.heure); return a <= t && t < a + r.duree; }).length >= p.capacite; };
    plages.forEach(function (pl) {
      var libreDebut = null;
      for (var t = pl[0]; t < pl[1]; t += p.pas) {
        if (!occupe(t)) { if (libreDebut == null) libreDebut = t; }
        else if (libreDebut != null) { lignes.push({ libre: true, debut: hhmm(libreDebut), fin: hhmm(t) }); libreDebut = null; }
      }
      if (libreDebut != null) lignes.push({ libre: true, debut: hhmm(libreDebut), fin: hhmm(pl[1]) });
    });
    rdv.forEach(function (r) { lignes.push({ rdv: r, debut: r.heure }); });
    return lignes.sort(function (a, b) { return a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : (a.libre ? 1 : -1); });
  }

  // ---------- Version gratuite ----------
  function rdvDuMois(liste, maintenant) {
    var m = moisCle(maintenant == null ? Date.now() : maintenant);
    return (liste || []).filter(function (r) { return r.accepteLe && moisCle(r.accepteLe) === m; }).length;
  }
  function peutAccepter(liste, passActif, maintenant) { return !!passActif || rdvDuMois(liste, maintenant) < LIMITE_GRATUITE; }

  // ---------- Absences ----------
  // Même client : même numéro si les deux en ont un, sinon même nom (sans tenir compte des majuscules ni des espaces)
  function memeClient(x, r) {
    var a = numeroWhatsApp(x.telephone), b = numeroWhatsApp(r.telephone);
    if (a && b) return a === b;
    var nom = function (s) { return texte(s).toLowerCase().replace(/\s+/g, ' '); };
    return !!nom(x.nom) && nom(x.nom) === nom(r.nom);
  }
  function absences(liste, presences, r) {
    return (liste || []).filter(function (x) { return x.ref !== r.ref && presences[x.ref] === 'absent' && memeClient(x, r); }).length;
  }

  // ---------- Semaine ----------
  function semaine(liste, isoJour, presences) {
    var l0 = lundi(isoJour), jours = [], total = 0, prevu = 0, encaisse = 0, absents = 0, venus = 0;
    presences = presences || {};
    for (var k = 0; k < 7; k++) {
      var j = ajouterJours(l0, k);
      var rdv = (liste || []).filter(function (r) { return r.date === j && retenu(r); }).sort(parHeure);
      rdv.forEach(function (r) {
        total++; prevu += r.prix;
        if (presences[r.ref] === 'absent') absents++;
        else if (presences[r.ref] === 'venu') { venus++; encaisse += r.prix; }
      });
      jours.push({ date: j, rdv: rdv, attente: (liste || []).filter(function (r) { return r.date === j && r.statut === 'en_attente'; }).length });
    }
    return { lundi: l0, dimanche: ajouterJours(l0, 6), jours: jours, total: total, prevu: prevu, encaisse: encaisse, absents: absents, venus: venus };
  }

  // ---------- Messages (envoyés par l'utilisateur lui-même, jamais automatiquement) ----------
  function quand(r) { return dateFr(r.date) + ' à ' + heureFr(r.heure); }
  function prenom(nom) { return texte(nom).split(/\s+/)[0] || ''; }
  function detailsService(r) { return r.service ? ' (' + r.service + (r.prix ? ', ' + fcfa(r.prix) : '') + ')' : ''; }
  function messageConfirmation(p, r) {
    return 'Bonjour ' + prenom(r.nom) + ', votre rendez-vous chez ' + p.nom + ' est confirmé : ' + quand(r) + detailsService(r) + '.' +
      (p.lieu ? ' Adresse : ' + p.lieu + '.' : '') + ' Si vous ne pouvez pas venir, prévenez-moi. À bientôt !';
  }
  function messageReport(p, r, lien) {
    return 'Bonjour ' + prenom(r.nom) + ', je ne suis pas disponible ' + (r.avant ? quand(r.avant) : 'à l\'heure demandée') + '. Je vous propose ' + quand(r) + detailsService(r) +
      ' chez ' + p.nom + '. Si cela ne vous convient pas, répondez-moi' + (lien ? ' ou choisissez un autre moment ici : ' + lien : '.');
  }
  function messageRefus(p, r, lien) {
    return 'Bonjour ' + prenom(r.nom) + ', désolé, je ne peux pas vous recevoir ' + quand(r) + ' chez ' + p.nom + '.' +
      (lien ? ' Choisissez un autre moment ici : ' + lien : '');
  }
  function messageRappel(p, r, maintenant) {
    var demain = ajouterJours(aujourdhui(maintenant), 1);
    var q = r.date === aujourdhui(maintenant) ? 'aujourd\'hui à ' + heureFr(r.heure) : r.date === demain ? 'demain, ' + quand(r) : quand(r);
    return 'Bonjour ' + prenom(r.nom) + ', petit rappel : rendez-vous ' + q + ' chez ' + p.nom + detailsService(r) + '.' +
      (p.lieu ? ' Adresse : ' + p.lieu + '.' : '') + ' Si vous ne pouvez pas venir, prévenez-moi. Merci !';
  }
  function messageAnnulation(p, r) {
    return 'Bonjour ' + prenom(r.nom) + ', je dois annuler votre rendez-vous du ' + quand(r) + ' chez ' + p.nom + '. Toutes mes excuses. Écrivez-moi pour choisir un autre moment.';
  }
  function messagePage(p, lien) {
    return 'Prenez rendez-vous chez ' + p.nom + (p.lieu ? ' (' + p.lieu + ')' : '') + ' sans appeler : choisissez votre service et votre heure ici ' + lien;
  }
  function messageClient(p, r) {
    return 'Bonjour, je viens de demander un rendez-vous sur votre page Rendez-vous Pro : ' + (r.service ? r.service + ', ' : '') + quand(r) + '. Mon nom : ' + texte(r.nom) + '.';
  }

  // ---------- Pass (commande payée de la boutique) ----------
  function lireLienCommande(s) {
    s = String(s || '').trim();
    if (!s) return null;
    var o = s.match(/[?&]o=(TCV-[0-9A-HJKMNP-TV-Z]{8})(?![0-9A-Z])/i);
    var t = s.match(/[?&](?:amp;)?t=([A-Za-z0-9_-]{20,64})(?![A-Za-z0-9_-])/);
    if (o && t) return { id: o[1].toUpperCase(), jeton: t[1] };
    var m = s.match(/TCV-[0-9A-HJKMNP-TV-Z]{8}(?![0-9A-Z])/i);
    if (!m) return null;
    var reste = s.replace(m[0], ' ').replace(/https?:\/\/\S*/g, ' ');
    var j = reste.match(/(?:^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{20,64})(?![A-Za-z0-9_-])/);
    return j ? { id: m[0].toUpperCase(), jeton: j[1] } : null;
  }
  function urlVerification(c) { return API_BOUTIQUE + '/commandes/' + encodeURIComponent(c.id) + '?t=' + encodeURIComponent(c.jeton); }
  function urlAchat(slug) { return BOUTIQUE + (PASS[slug] ? slug : 'pass-rendez-vous-pro-1-mois') + '.html'; }
  // Réponse de GET /commandes/<id>?t=<jeton> → { ok, pass, fin } ou { ok: false, raison: introuvable | produit | impayee | expiree }
  function analyserReponse(j, maintenant) {
    var c = j && j.commande;
    if (!c || typeof c !== 'object') return { ok: false, raison: 'introuvable' };
    var slug = c.produit && c.produit.slug, p = PASS[slug];
    if (!p) return { ok: false, raison: 'produit', titre: texte(c.produit && c.produit.titre, 120) };
    if (c.payee !== true) return { ok: false, raison: 'impayee' };
    var debut = Date.parse(c.payee_le);
    if (!isFinite(debut)) return { ok: false, raison: 'impayee' };
    var fin = debut + p.jours * JOUR_MS, now = maintenant == null ? Date.now() : +new Date(maintenant);
    var pass = { id: String(c.id || ''), slug: slug, payeeLe: new Date(debut).toISOString() };
    if (fin <= now) return { ok: false, raison: 'expiree', fin: new Date(fin).toISOString(), pass: pass };
    return { ok: true, pass: pass, fin: new Date(fin).toISOString() };
  }
  // Fin des droits : les pass s'ajoutent bout à bout (un renouvellement anticipé ne fait pas perdre de jours)
  function finDroits(passes) {
    var vus = {}, l = [];
    (passes || []).forEach(function (p) { if (p && PASS[p.slug] && isFinite(Date.parse(p.payeeLe)) && !vus[p.id]) { vus[p.id] = 1; l.push(p); } });
    l.sort(function (a, b) { return Date.parse(a.payeeLe) - Date.parse(b.payeeLe); });
    var fin = null;
    l.forEach(function (p) { var d = Date.parse(p.payeeLe); fin = Math.max(fin == null ? d : fin, d) + PASS[p.slug].jours * JOUR_MS; });
    return fin;
  }
  function etatPass(passes, maintenant) {
    var now = maintenant == null ? Date.now() : +new Date(maintenant), fin = finDroits(passes);
    if (fin == null) return { actif: false, jamais: true, fin: null, joursRestants: 0, rappel: false, expire: false, courant: null };
    var reste = fin - now, jr = reste > 0 ? Math.ceil(reste / JOUR_MS) : 0;
    var courant = null;
    (passes || []).forEach(function (p) { if (PASS[p.slug] && (!courant || Date.parse(p.payeeLe) >= Date.parse(courant.payeeLe))) courant = p; });
    return { actif: reste > 0, jamais: false, fin: new Date(fin).toISOString(), joursRestants: jr, rappel: reste > 0 && jr <= RAPPEL_JOURS, expire: reste <= 0, courant: courant };
  }
  function ajouterPass(passes, pass, jeton) {
    var l = (passes || []).filter(function (p) { return p.id !== pass.id; });
    l.push({ id: pass.id, jeton: jeton || pass.jeton || '', slug: pass.slug, payeeLe: pass.payeeLe, verifieLe: new Date().toISOString() });
    return l;
  }

  // ---------- Page : remplissage (le serveur garde 1 500 événements par page) ----------
  function remplissage(dossier) {
    var n = (dossier && dossier.evenements || []).length;
    return { n: n, max: CAPACITE_PAGE, presquePlein: n >= CAPACITE_PAGE * 0.85, plein: n >= CAPACITE_PAGE };
  }

  // ---------- Texte pour le PDF (polices standard : Windows-1252) ----------
  var CP1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function textePDF(s) {
    s = String(s == null ? '' : s).replace(/[\u202f\u2009\u2007]/g, ' ').replace(/\r\n?/g, '\n');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252.indexOf(ch) > -1) { out += ch; continue; }
      if (ch === '\u014b' || ch === '\u014a') { out += ch === '\u014b' ? 'n' : 'N'; continue; }
      var base = ch.normalize ? ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : ch;
      out += /^[\x20-\x7e]$/.test(base) ? base : (c >= 0xD800 && c <= 0xDBFF ? (i++, '') : '');
    }
    return out;
  }

  var RV = {
    API: API, API_BOUTIQUE: API_BOUTIQUE, SITE: SITE, BOUTIQUE: BOUTIQUE, LIMITE_GRATUITE: LIMITE_GRATUITE, CAPACITE_PAGE: CAPACITE_PAGE,
    RAPPEL_JOURS: RAPPEL_JOURS, PASS: PASS, JOURS: JOURS, MOIS: MOIS, MOIS_COURTS: MOIS_COURTS, METIERS: METIERS, METIER: METIER, STATUTS: STATUTS,
    texte: texte, entier: entier, fcfa: fcfa, milliers: milliers, minutes: minutes, hhmm: hhmm, heureFr: heureFr, iso: iso, versDate: versDate,
    dateValide: dateValide, ajouterJours: ajouterJours, aujourdhui: aujourdhui, jourSemaine: jourSemaine, lundi: lundi, dateFr: dateFr,
    moisCle: moisCle, moisFr: moisFr, lireHoraires: lireHoraires, ecrireHoraires: ecrireHoraires, horairesFr: horairesFr,
    lireServices: lireServices, ecrireServices: ecrireServices, lireConges: lireConges, nouveauProfil: nouveauProfil, profil: profil,
    donneesProfil: donneesProfil, verifierProfil: verifierProfil, numeroWhatsApp: numeroWhatsApp, lienWhatsApp: lienWhatsApp,
    lienPage: lienPage, lireLien: lireLien, codeDemande: codeDemande, trier: trier, reservations: reservations, actif: actif, retenu: retenu,
    ferme: ferme, joursReservables: joursReservables, creneauxLibres: creneauxLibres, journee: journee, rdvDuMois: rdvDuMois,
    peutAccepter: peutAccepter, absences: absences, semaine: semaine, quand: quand,
    messageConfirmation: messageConfirmation, messageReport: messageReport, messageRefus: messageRefus, messageRappel: messageRappel,
    messageAnnulation: messageAnnulation, messagePage: messagePage, messageClient: messageClient,
    lireLienCommande: lireLienCommande, urlVerification: urlVerification, urlAchat: urlAchat, analyserReponse: analyserReponse,
    finDroits: finDroits, etatPass: etatPass, ajouterPass: ajouterPass, remplissage: remplissage, textePDF: textePDF
  };
  if (typeof module === 'object' && module.exports) module.exports = RV;
  else racine.RV = RV;
})(typeof self !== 'undefined' ? self : globalThis);
