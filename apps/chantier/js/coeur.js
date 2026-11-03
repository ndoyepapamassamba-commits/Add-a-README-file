/* Chantier Clair — logique sans écran : étapes et budgets, avancement, argent déclaré et dépenses justifiées, écarts signalés,
   messages à partager, liens par rôle, vérification de l'historique chaîné, texte pour le PDF.
   Fonctionne dans le navigateur (window.CC) et dans Node (require) pour les tests. */
(function (racine) {
  'use strict';
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/dossiers';
  var APP = 'chantier';
  var SLUG_PASS = 'pass-chantier-clair-12-mois', PRIX_PASS = 5000, JOURS_PASS = 365;
  var LIMITE_CHANTIERS = 1, LIMITE_ACTIONS = 30, MAX_PHOTOS = 30, MAX_ETAPES = 15, MAX_LIGNES = 12;
  var HEURE = 3600000, JOUR = 86400000;
  var JOURS_SANS_PHOTO = 7, JOURS_QUESTION = 3, JOURS_VERSEMENT = 3;

  // ---------- Libellés ----------
  var ETAPES_DEFAUT = [
    ['fondations', 'Fondations'], ['elevation', 'Élévation des murs'], ['dalle', 'Dalle'], ['toiture', 'Toiture'], ['enduits', 'Enduits'],
    ['electricite', 'Électricité'], ['plomberie', 'Plomberie'], ['carrelage', 'Carrelage'], ['peinture', 'Peinture']
  ];
  var ROLES = { proprio: 'Propriétaire', chef: 'Chef de chantier', temoin: 'Témoin' };
  var ROLES_COURTS = { proprio: 'Propriétaire', chef: 'Chef', temoin: 'Témoin' };
  var EVENEMENTS = {
    creation: 'Chantier créé', modification: 'Informations modifiées', validation: 'Étape validée', question: 'Question posée',
    note: 'Note', versement_declare: 'Envoi d\'argent déclaré', cloture: 'Chantier terminé', avancement: 'Avancement',
    preuve: 'Photo', demande_materiaux: 'Demande de matériaux', depense: 'Dépense', constat: 'Constat du témoin'
  };
  var PERMIS = {
    proprio: ['modification', 'validation', 'question', 'note', 'versement_declare', 'cloture'],
    chef: ['avancement', 'preuve', 'demande_materiaux', 'depense', 'note'],
    temoin: ['constat', 'preuve', 'note']
  };
  var MOYENS = { wave: 'Wave', orange_money: 'Orange Money', virement: 'Virement bancaire', transfert: 'Transfert d\'argent (agence)', main_propre: 'Remis en main propre', autre: 'Autre moyen' };
  var AVIS = { conforme: 'Conforme', a_verifier: 'À vérifier', probleme: 'Problème' };
  var STATUTS = { en_preparation: 'En préparation', en_cours: 'En cours', termine: 'Terminé' };
  var TYPES_CONSTRUCTION = ['Maison de plain-pied', 'Maison R+1', 'Maison R+2', 'Extension', 'Clôture et terrain', 'Autre'];
  var MATERIAUX = ['Ciment (sac de 50 kg)', 'Sable (camion)', 'Gravier (camion)', 'Fer de 8', 'Fer de 10', 'Fer de 12', 'Briques de 15', 'Briques de 20', 'Bois de coffrage', 'Tôles', 'Carreaux (m²)', 'Peinture (pot)', 'Fil électrique (rouleau)', 'Tuyaux PVC'];

  // ---------- Nombres et dates ----------
  function formatNombre(n) {
    var s = String(Math.round(Math.abs(+n || 0))), out = '';
    for (var i = 0; i < s.length; i++) { if (i && (s.length - i) % 3 === 0) out += ' '; out += s[i]; }
    return (n < 0 && Math.round(Math.abs(n)) ? '-' : '') + out;
  }
  function formatF(n) { return formatNombre(n) + ' F'; }
  function lireMontant(s) {
    var t = String(s == null ? '' : s).replace(/[\s  .]/g, '').replace(/f(cfa)?$/i, '');
    if (!t) return 0;
    if (!/^\d{1,10}$/.test(t)) return NaN;
    var n = parseInt(t, 10);
    return n > 9999999999 ? NaN : n;
  }
  function entier(v) { var n = Math.round(+v); return isFinite(n) && n > 0 ? n : 0; }
  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function dateFr(iso) { var d = new Date(iso); if (isNaN(d)) return ''; return deux(d.getDate()) + '/' + deux(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function heureFr(iso) { var d = new Date(iso); if (isNaN(d)) return ''; return deux(d.getHours()) + ':' + deux(d.getMinutes()); }
  function dateHeureFr(iso) { return dateFr(iso) + ' à ' + heureFr(iso); }
  function jourFr(j) { var m = String(j || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function cleJour(t) { var d = new Date(t); return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }
  function cleMois(t) { var d = new Date(t); return d.getFullYear() + '-' + deux(d.getMonth() + 1); }
  function joursEntre(a, b) { return Math.floor((+b - +a) / JOUR); }
  function depuis(iso, maintenant) {
    var ms = (maintenant == null ? Date.now() : +maintenant) - Date.parse(iso);
    if (!isFinite(ms)) return '';
    if (ms < 60000) return 'à l\'instant';
    if (ms < HEURE) return 'il y a ' + Math.floor(ms / 60000) + ' min';
    if (ms < JOUR) return 'il y a ' + Math.floor(ms / HEURE) + ' h';
    var j = Math.floor(ms / JOUR);
    return 'il y a ' + j + ' jour' + (j > 1 ? 's' : '');
  }
  function sansAccents(s) { s = String(s || ''); return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s; }
  function cleTexte(s) { return sansAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16) || 'etape'; }

  // ---------- Protection des données : pas de numéro de téléphone ----------
  function contientTelephone(s) {
    var t = String(s || '');
    if (/(?:^|[^\d])(?:\+|00)?(?:221[\s.\-]*)?(?:7[05678]|3[03])(?:[\s.\-]*\d){7}(?!\d)/.test(t)) return true;
    if (/\+\s*\d(?:[\s.\-]*\d){7,}/.test(t)) return true;
    return false;
  }

  // ---------- Étapes et budgets (gardés dans les données du dossier sous forme de texte JSON) ----------
  function etapesDefaut() { return ETAPES_DEFAUT.map(function (e) { return { k: e[0], n: e[1], b: 0 }; }); }
  function lireEtapes(donnees) {
    var l;
    try { l = JSON.parse((donnees && donnees.etapes) || '[]'); } catch (e) { l = []; }
    if (!Array.isArray(l)) l = [];
    var vues = {};
    return l.filter(function (x) { if (!x || typeof x.k !== 'string' || !x.n || vues[x.k]) return false; vues[x.k] = 1; return true; })
      .slice(0, MAX_ETAPES).map(function (x) { return { k: String(x.k).slice(0, 20), n: String(x.n).slice(0, 40), b: entier(x.b) }; });
  }
  function ecrireEtapes(l) { return JSON.stringify((l || []).slice(0, MAX_ETAPES).map(function (x) { return { k: x.k, n: x.n, b: entier(x.b) }; })); }
  function nouvelleCle(l, nom) {
    var base = cleTexte(nom), k = base, i = 2, pris = {};
    (l || []).forEach(function (x) { pris[x.k] = 1; });
    while (pris[k]) k = base.slice(0, 13) + '_' + (i++);
    return k;
  }
  function budgetTotal(etapes) { return (etapes || []).reduce(function (s, e) { return s + entier(e.b); }, 0); }

  // Lignes d'une demande de matériaux : [{a: article, q: quantité, u: unité, p: prix unitaire}]
  function lireLignes(s) {
    var l;
    try { l = JSON.parse(s || '[]'); } catch (e) { l = []; }
    if (!Array.isArray(l)) return [];
    return l.filter(function (x) { return x && x.a; }).slice(0, MAX_LIGNES).map(function (x) {
      var q = Math.round((+x.q || 0) * 100) / 100;
      return { a: String(x.a).slice(0, 60), q: q > 0 ? q : 0, u: String(x.u || '').slice(0, 15), p: entier(x.p) };
    });
  }
  function totalLigne(x) { return Math.round((+x.q || 0) * 100) * entier(x.p) / 100; }
  function totalLignes(l) { return Math.round((l || []).reduce(function (s, x) { return s + Math.round((+x.q || 0) * 100) * entier(x.p); }, 0) / 100); }

  // ---------- Lecture de l'historique ----------
  function evsDe(d) { return (d && d.evenements) || []; }
  function etiquetteEtape(etapes, k) { for (var i = 0; i < etapes.length; i++) if (etapes[i].k === k) return etapes[i].n; return k ? 'Étape retirée' : ''; }

  // Rattache chaque photo (« preuve ») à l'action qui l'annonce (donnees.photos = nombre de photos) : les photos suivantes du même
  // auteur, dans l'ordre. Les autres photos restent seules.
  function rattacher(evs) {
    var attente = {}, items = [];
    (evs || []).forEach(function (e, i) {
      var d = (e && e.donnees) || {};
      if (e.type === 'preuve') {
        var a = attente[e.auteur];
        if (a && a.reste > 0) { a.item.photos.push(e); a.reste--; return; }
        items.push({ e: e, i: i, photos: d.photo ? [e] : [], seule: true });
        return;
      }
      var it = { e: e, i: i, photos: [] };
      items.push(it);
      var n = Math.min(4, Math.max(0, Math.floor(+d.photos || 0)));
      if (n > 0) attente[e.auteur] = { item: it, reste: n };
      else if (attente[e.auteur]) attente[e.auteur] = null;
    });
    return items;
  }

  // État complet d'un chantier : { etapes, global, budget, envoye, depense, justifie, nonJustifie, nbNonJustifiees, statut,
  //   versements, depenses, demandes, questions, constats, photos, alertes, actions, dernierePhoto, derniereNouvelle }
  function etat(dossier, maintenant, pendants) {
    var now = maintenant == null ? Date.now() : +maintenant;
    var d = (dossier && dossier.donnees) || {};
    var evs = evsDe(dossier);
    var etapes = lireEtapes(d).map(function (x) { return { k: x.k, n: x.n, b: x.b, pourcent: 0, valide: false, valideLe: null, depense: 0, justifie: 0, nbDepenses: 0, derniere: null, photos: 0 }; });
    var parCle = {};
    etapes.forEach(function (x) { parCle[x.k] = x; });
    var items = rattacher(evs);
    var r = {
      etapes: etapes, global: 0, budget: budgetTotal(etapes), envoye: 0, depense: 0, justifie: 0, nonJustifie: 0, nbNonJustifiees: 0,
      statut: 'en_preparation', versements: [], depenses: [], demandes: [], questions: [], constats: [], photos: [], alertes: [],
      actions: 0, dernierePhoto: null, derniereNouvelle: null, derniereChef: null, items: items, cloture: null
    };
    var parEmpreinte = {};
    items.forEach(function (it) { if (it.e.empreinte) parEmpreinte[it.e.empreinte] = it; });
    evs.forEach(function (e) {
      if (e.type !== 'creation') r.actions++;
      if (e.type === 'preuve' && e.donnees && e.donnees.photo) { r.photos.push(e); r.dernierePhoto = e; }
      if (e.auteur === 'chef') r.derniereChef = e;
    });
    items.forEach(function (it) { if (it.e.type !== 'creation' && it.e.type !== 'modification') r.derniereNouvelle = it.e; });
    items.forEach(function (it) {
      var e = it.e, dn = e.donnees || {}, et = parCle[dn.etape];
      switch (e.type) {
        case 'avancement':
          if (et) { et.pourcent = Math.max(0, Math.min(100, Math.round(+dn.pourcent || 0))); et.derniere = it; et.photos += it.photos.length; }
          if (r.statut === 'en_preparation') r.statut = 'en_cours';
          break;
        case 'validation':
          if (dn.demande) { var dm = parEmpreinte[dn.demande]; if (dm) { dm.reponse = it; dm.statut = 'accord'; } }
          else if (et) { et.valide = true; et.valideLe = e.le; et.pourcent = 100; }
          break;
        case 'depense':
          var m = entier(dn.montant);
          r.depense += m;
          if (et) { et.depense += m; et.nbDepenses++; }
          it.montant = m;
          r.depenses.push(it);
          if (r.statut === 'en_preparation') r.statut = 'en_cours';
          break;
        case 'versement_declare':
          it.montant = entier(dn.montant);
          r.envoye += it.montant;
          r.versements.push(it);
          break;
        case 'demande_materiaux':
          it.lignes = lireLignes(dn.lignes);
          it.total = entier(dn.total) || totalLignes(it.lignes);
          it.statut = 'attente';
          r.demandes.push(it);
          break;
        case 'question':
          if (dn.demande && parEmpreinte[dn.demande] && parEmpreinte[dn.demande].statut === 'attente') parEmpreinte[dn.demande].statut = 'question';
          it.reponses = [];
          r.questions.push(it);
          break;
        case 'note':
          if (dn.reponse_a && parEmpreinte[dn.reponse_a]) {
            var cible = parEmpreinte[dn.reponse_a];
            if (cible.e.type === 'versement_declare' && dn.recu === true && e.auteur === 'chef') cible.recu = it;
            if (cible.e.type === 'question' && e.auteur !== 'proprio') cible.reponses.push(it);
            if (cible.e.type === 'demande_materiaux') { cible.notes = cible.notes || []; cible.notes.push(it); }
          }
          break;
        case 'constat':
          r.constats.push(it);
          if (et) et.photos += it.photos.length;
          break;
        case 'cloture':
          r.statut = 'termine'; r.cloture = it;
          break;
      }
    });
    // Dépenses justifiées : au moins une photo du reçu (envoyée, ou en attente d'envoi sur ce téléphone)
    var enAttente = {};
    (pendants || []).forEach(function (p) { if (p.cle) enAttente[p.cle] = p; });
    r.depenses.forEach(function (it) {
      it.justifiee = it.photos.length > 0;
      if (it.justifiee) { r.justifie += it.montant; var et2 = parCle[(it.e.donnees || {}).etape]; if (et2) et2.justifie += it.montant; }
      else { r.nonJustifie += it.montant; r.nbNonJustifiees++; }
    });
    // Avancement global : moyenne pondérée par le budget de chaque étape (moyenne simple si aucun budget)
    if (etapes.length) {
      if (r.budget > 0) r.global = Math.round(etapes.reduce(function (s, x) { return s + x.b * x.pourcent; }, 0) / r.budget);
      else r.global = Math.round(etapes.reduce(function (s, x) { return s + x.pourcent; }, 0) / etapes.length);
    }
    if (r.statut === 'termine') r.global = Math.max(r.global, etapes.every(function (x) { return x.valide; }) ? 100 : r.global);
    r.solde = r.envoye - r.depense;
    r.alertes = alertes(r, dossier, now);
    return r;
  }

  // ---------- Écarts signalés (du plus grave au moins grave) ----------
  function alertes(r, dossier, now) {
    var a = [];
    var termine = r.statut === 'termine';
    if (r.nbNonJustifiees) a.push({ type: 'non_justifiees', grave: 2, texte: (r.nbNonJustifiees > 1 ? r.nbNonJustifiees + ' dépenses non justifiées' : '1 dépense non justifiée') + ' : ' + formatF(r.nonJustifie) + ' sans photo du reçu' });
    if (r.depense > r.envoye) a.push({ type: 'depasse_envoye', grave: 2, texte: 'Dépenses déclarées supérieures à l\'argent envoyé : ' + formatF(r.depense - r.envoye) + ' de plus' });
    r.etapes.forEach(function (x) { if (x.b > 0 && x.depense > x.b) a.push({ type: 'budget', grave: 1, etape: x.k, texte: x.n + ' : budget dépassé de ' + formatF(x.depense - x.b) }); });
    r.constats.forEach(function (it) {
      var dn = it.e.donnees || {};
      if (dn.avis === 'probleme' && now - Date.parse(it.e.le) < 14 * JOUR) a.push({ type: 'probleme', grave: 3, texte: 'Le témoin signale un problème' + (dn.texte ? ' : « ' + String(dn.texte).slice(0, 80) + ' »' : ''), le: it.e.le });
    });
    if (!termine) {
      var cree = dossier && dossier.cree_le ? Date.parse(dossier.cree_le) : (evsDe(dossier)[0] ? Date.parse(evsDe(dossier)[0].le) : now);
      if (r.dernierePhoto) {
        var j = joursEntre(Date.parse(r.dernierePhoto.le), now);
        if (j >= JOURS_SANS_PHOTO) a.push({ type: 'photos', grave: 2, texte: 'Photos manquantes depuis ' + j + ' jours' });
      } else if (joursEntre(cree, now) >= JOURS_SANS_PHOTO) a.push({ type: 'photos', grave: 2, texte: 'Photos manquantes : aucune photo depuis le début (' + joursEntre(cree, now) + ' jours)' });
      var dc = r.derniereChef ? Date.parse(r.derniereChef.le) : cree;
      if (joursEntre(dc, now) >= JOURS_SANS_PHOTO && r.statut === 'en_cours') a.push({ type: 'silence', grave: 1, texte: 'Pas de nouvelle du chef depuis ' + joursEntre(dc, now) + ' jours' });
    }
    r.questions.forEach(function (it) {
      var j = joursEntre(Date.parse(it.e.le), now);
      if (!it.reponses.length && j >= JOURS_QUESTION) a.push({ type: 'question', grave: 1, texte: 'Question sans réponse depuis ' + j + ' jours : « ' + String((it.e.donnees || {}).texte || '').slice(0, 60) + ' »' });
    });
    r.versements.forEach(function (it) {
      var j = joursEntre(Date.parse(it.e.le), now);
      if (!it.recu && j >= JOURS_VERSEMENT) a.push({ type: 'versement', grave: 1, texte: 'Envoi de ' + formatF(it.montant) + ' pas encore confirmé par le chef (' + j + ' jours)' });
    });
    var att = r.demandes.filter(function (it) { return it.statut === 'attente'; });
    if (att.length) a.push({ type: 'demandes', grave: 0, texte: (att.length > 1 ? att.length + ' demandes de matériaux attendent' : '1 demande de matériaux attend') + ' une réponse (' + formatF(att.reduce(function (s, it) { return s + it.total; }, 0)) + ')' });
    a.sort(function (x, y) { return y.grave - x.grave; });
    return a;
  }

  // ---------- Limites de la version gratuite ----------
  function passDossier(donnees, maintenant) {
    var f = donnees && donnees.pass_fin;
    return !!(f && /^\d{4}-\d{2}-\d{2}$/.test(String(f)) && String(f) >= cleJour(maintenant == null ? Date.now() : maintenant));
  }
  // Nombre d'actions comptées (étapes et photos ; la création ne compte pas), y compris celles en attente d'envoi
  function actionsComptees(evs, pendants) {
    var n = (evs || []).filter(function (e) { return e.type !== 'creation'; }).length;
    (pendants || []).forEach(function (p) { if (p.etat === 'attente' || p.etat === 'erreur') { if (p.type !== 'photo' && !p.evenementEnvoye) n++; if (p.photo) n++; } });
    return n;
  }
  function photosComptees(evs, pendants) {
    var n = (evs || []).filter(function (e) { return e.type === 'preuve' && e.donnees && e.donnees.photo; }).length;
    (pendants || []).forEach(function (p) { if (p.photo) n++; });
    return n;
  }

  // ---------- Période (rapport de la semaine) ----------
  function periode(evs, debut, fin) {
    return (evs || []).filter(function (e) { var t = Date.parse(e.le); return t >= +debut && t <= +fin; });
  }

  // ---------- Liens par rôle (la partie secrète est après « # » : elle ne quitte jamais le téléphone) ----------
  var CHEMINS = { proprio: 'proprio', chef: 'chef', temoin: 'temoin' };
  var RE_ID = /^D-[0-9A-HJKMNP-TV-Z]{10}$/, RE_JETON = /^[A-Za-z0-9_-]{20,64}$/;
  function baseApp(loc) {
    var l = loc || (typeof location !== 'undefined' ? location : null);
    if (!l) return '';
    return l.origin + l.pathname.replace(/index\.html$/, '');
  }
  // Le lien du propriétaire porte aussi les liens du chef et du témoin (pour les renvoyer depuis un autre téléphone)
  function lienRole(base, role, id, jetons) {
    var j = typeof jetons === 'string' ? jetons : jetons[role];
    var l = String(base).replace(/[?#].*$/, '').replace(/index\.html$/, '') + '#/' + CHEMINS[role] + '/' + id + '/' + j;
    if (role === 'proprio' && typeof jetons === 'object' && jetons.chef && jetons.temoin) l += '/' + jetons.chef + '/' + jetons.temoin;
    return l;
  }
  function lireLienRole(texte) {
    var m = String(texte || '').match(/#\/(proprio|chef|temoin)\/(D-[0-9A-HJKMNP-TV-Z]{10})\/([A-Za-z0-9_-]{20,64})(?:\/([A-Za-z0-9_-]{20,64})\/([A-Za-z0-9_-]{20,64}))?/);
    if (!m) return null;
    var r = { role: m[1], id: m[2], jeton: m[3] };
    if (m[1] === 'proprio') r.jetons = { proprio: m[3], chef: m[4] || '', temoin: m[5] || '' };
    return r;
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
  // Validité d'une commande de la boutique pour ce pass (même règle que la boutique : payée, bon produit, 365 jours + 1)
  function commandeValide(c, maintenant) {
    if (!c || c.payee !== true || !c.produit || c.produit.slug !== SLUG_PASS || !c.payee_le) return false;
    var t = Date.parse(c.payee_le);
    return isFinite(t) && (maintenant == null ? Date.now() : +maintenant) <= t + (JOURS_PASS + 1) * JOUR;
  }
  function finPass(payeeLe) { var t = Date.parse(payeeLe); return isFinite(t) ? t + JOURS_PASS * JOUR : null; }

  // ---------- Messages à partager (jamais de numéro de téléphone) ----------
  function nomChantier(d) { return (d && (d.nom || d.titre)) || 'le chantier'; }
  function messageChef(d, lien) {
    return 'Bonjour' + (d.chef ? ' ' + d.chef : '') + ', voici le lien du chantier « ' + nomChantier(d) + ' » sur Chantier Clair.\n' +
      'Notez-y l\'avancement avec des photos, les dépenses avec la photo du reçu et vos demandes de matériaux. Rien à installer :\n' + lien + '\n' +
      'Ce lien est pour vous seul : ne le transférez pas.';
  }
  function messageTemoin(d, lien) {
    return 'Bonjour' + (d.temoin ? ' ' + d.temoin : '') + ', je fais construire « ' + nomChantier(d) + ' »' + (d.lieu ? ' à ' + d.lieu : '') + '.\n' +
      'Quand vous passez sur le chantier, pouvez-vous noter ce que vous voyez, avec une photo ? C\'est simple, rien à installer :\n' + lien + '\n' +
      'Ce lien est pour vous seul : ne le transférez pas.';
  }
  function messageProprio(d, lien) {
    return 'Mon lien propriétaire Chantier Clair pour « ' + nomChantier(d) + ' » (à garder pour moi, ne pas transférer) :\n' + lien;
  }
  function messageLimite(d) {
    return 'Bonjour, les ' + LIMITE_ACTIONS + ' actions gratuites du chantier « ' + nomChantier(d) + ' » sur Chantier Clair sont utilisées. ' +
      'Pouvez-vous activer le Pass Chantier Clair (' + formatF(PRIX_PASS) + ' pour 12 mois) pour que nous continuions à noter l\'avancement et les dépenses ?';
  }
  function resumeTexte(d, r, maintenant) {
    var now = maintenant == null ? Date.now() : maintenant;
    var l = ['Chantier « ' + nomChantier(d) + ' »' + (d.lieu ? ' — ' + d.lieu : ''), 'Point du ' + dateFr(new Date(now).toISOString()) + ' : avancement ' + r.global + ' %', ''];
    r.etapes.forEach(function (x) { if (x.pourcent || x.valide) l.push('• ' + x.n + ' : ' + x.pourcent + ' %' + (x.valide ? ' (validée)' : '')); });
    l.push('');
    l.push('Argent envoyé (déclaré) : ' + formatF(r.envoye));
    l.push('Dépenses déclarées : ' + formatF(r.depense) + ' dont ' + formatF(r.justifie) + ' avec reçu');
    if (r.budget) l.push('Budget prévu : ' + formatF(r.budget));
    if (r.alertes.length) { l.push(''); l.push('À surveiller :'); r.alertes.slice(0, 4).forEach(function (a) { l.push('• ' + a.texte); }); }
    l.push(''); l.push('(Suivi avec Chantier Clair — historique daté et vérifiable)');
    return l.join('\n');
  }

  // ---------- Détail lisible d'une action ----------
  function libelleEvenement(e, etapes) {
    var d = (e && e.donnees) || {};
    if (e.type === 'validation') return d.demande ? 'Accord pour les matériaux' : 'Étape validée' + (d.etape ? ' : ' + etiquetteEtape(etapes || [], d.etape) : '');
    if (e.type === 'avancement') return 'Avancement' + (d.etape ? ' — ' + etiquetteEtape(etapes || [], d.etape) : '') + (d.pourcent != null ? ' : ' + Math.round(+d.pourcent || 0) + ' %' : '');
    if (e.type === 'note' && d.recu) return 'Argent bien reçu';
    if (e.type === 'note' && d.reponse_a) return 'Réponse';
    if (e.type === 'constat') return 'Constat du témoin' + (d.avis && AVIS[d.avis] ? ' : ' + AVIS[d.avis] : '');
    return EVENEMENTS[e && e.type] || 'Action';
  }
  function detailEvenement(e, etapes) {
    var d = (e && e.donnees) || {}, m = [];
    switch (e.type) {
      case 'depense':
        m.push(formatF(entier(d.montant)) + (d.libelle ? ' — ' + d.libelle : ''));
        if (d.etape) m.push(etiquetteEtape(etapes || [], d.etape));
        if (d.fournisseur) m.push(String(d.fournisseur));
        if (d.date) m.push('le ' + jourFr(d.date));
        break;
      case 'versement_declare':
        m.push(formatF(entier(d.montant)) + (d.moyen && MOYENS[d.moyen] ? ' par ' + MOYENS[d.moyen] : ''));
        if (d.date) m.push('envoyé le ' + jourFr(d.date));
        if (d.beneficiaire) m.push('à ' + d.beneficiaire);
        break;
      case 'demande_materiaux':
        var l = lireLignes(d.lignes);
        m.push(l.map(function (x) { return x.q + ' ' + (x.u ? x.u + ' ' : '') + x.a; }).join(', '));
        m.push('Total : ' + formatF(entier(d.total) || totalLignes(l)));
        if (d.etape) m.push(etiquetteEtape(etapes || [], d.etape));
        if (d.pour_le) m.push('pour le ' + jourFr(d.pour_le));
        break;
      case 'avancement':
        if (d.date) m.push('travaux du ' + jourFr(d.date));
        break;
      case 'question':
        if (d.etape) m.push(etiquetteEtape(etapes || [], d.etape));
        break;
      case 'modification':
        if (d.resume) m.push(String(d.resume));
        break;
      case 'preuve':
        if (d.legende) m.push(String(d.legende));
        break;
      case 'constat':
        if (d.etape) m.push(etiquetteEtape(etapes || [], d.etape));
        break;
    }
    if (d.texte && e.type !== 'preuve') m.push('« ' + String(d.texte) + ' »');
    return m.filter(Boolean).join(' · ');
  }

  // ---------- Historique chaîné : vérification sur le téléphone (même calcul que la base) ----------
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
  function pgHorodatage(le) { return String(le || '').replace('T', ' ').replace(/Z$/, '+00').replace(/([+-]\d\d):00$/, '$1'); }
  function empreinteEvenement(precedent, e) {
    return sha256Hex(String(precedent) + '|' + e.type + '|' + e.auteur + '|' + jsonbTexte(e.donnees || {}) + '|' + pgHorodatage(e.le));
  }
  // Chaque action porte l'empreinte de la précédente (la première, celle du numéro du dossier) et son empreinte est recalculée
  // à partir de son contenu. → { ok, total, liens, contenus, contenusTotal, erreurs: [{ index, raison: 'lien' | 'contenu' | 'vide' }], derniere }
  function verifierChaine(id, evs) {
    evs = evs || [];
    var r = { ok: true, total: evs.length, liens: 0, contenus: 0, contenusTotal: evs.length, erreurs: [], derniere: '', premiere: '' };
    if (!evs.length) { r.ok = false; r.erreurs.push({ index: -1, raison: 'vide' }); return Promise.resolve(r); }
    var i = 0;
    return sha256Hex(String(id)).then(function (p0) {
      r.premiere = p0;
      function suivant(attendu) {
        if (i >= evs.length) { r.derniere = attendu; return r; }
        var e = evs[i];
        if (e.precedent === attendu) r.liens++;
        else { r.ok = false; r.erreurs.push({ index: i, raison: 'lien' }); }
        return empreinteEvenement(e.precedent, e).then(function (calc) {
          if (calc === e.empreinte) r.contenus++;
          else { r.ok = false; r.erreurs.push({ index: i, raison: 'contenu' }); }
          var emp = e.empreinte; i++;
          return suivant(emp);
        });
      }
      return suivant(p0);
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
      if (ch === '−') { out += '-'; continue; }
      var base = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : ch;
      out += /^[\x20-\x7e]$/.test(base) ? base : (c >= 0xD800 && c <= 0xDBFF ? (i++, '') : '');
    }
    return out;
  }

  var CC = {
    API: API, APP: APP, SLUG_PASS: SLUG_PASS, PRIX_PASS: PRIX_PASS, JOURS_PASS: JOURS_PASS, LIMITE_CHANTIERS: LIMITE_CHANTIERS, LIMITE_ACTIONS: LIMITE_ACTIONS,
    MAX_PHOTOS: MAX_PHOTOS, MAX_ETAPES: MAX_ETAPES, MAX_LIGNES: MAX_LIGNES, JOUR: JOUR, JOURS_SANS_PHOTO: JOURS_SANS_PHOTO,
    ETAPES_DEFAUT: ETAPES_DEFAUT, ROLES: ROLES, ROLES_COURTS: ROLES_COURTS, EVENEMENTS: EVENEMENTS, PERMIS: PERMIS, MOYENS: MOYENS, AVIS: AVIS, STATUTS: STATUTS,
    TYPES_CONSTRUCTION: TYPES_CONSTRUCTION, MATERIAUX: MATERIAUX,
    formatNombre: formatNombre, formatF: formatF, lireMontant: lireMontant, entier: entier, dateFr: dateFr, heureFr: heureFr, dateHeureFr: dateHeureFr, jourFr: jourFr,
    cleJour: cleJour, cleMois: cleMois, depuis: depuis, sansAccents: sansAccents, contientTelephone: contientTelephone,
    etapesDefaut: etapesDefaut, lireEtapes: lireEtapes, ecrireEtapes: ecrireEtapes, nouvelleCle: nouvelleCle, budgetTotal: budgetTotal, etiquetteEtape: etiquetteEtape,
    lireLignes: lireLignes, totalLigne: totalLigne, totalLignes: totalLignes, rattacher: rattacher, etat: etat,
    passDossier: passDossier, actionsComptees: actionsComptees, photosComptees: photosComptees, periode: periode,
    baseApp: baseApp, lienRole: lienRole, lireLienRole: lireLienRole, lireLienCommande: lireLienCommande, commandeValide: commandeValide, finPass: finPass,
    RE_ID: RE_ID, RE_JETON: RE_JETON,
    messageChef: messageChef, messageTemoin: messageTemoin, messageProprio: messageProprio, messageLimite: messageLimite, resumeTexte: resumeTexte,
    libelleEvenement: libelleEvenement, detailEvenement: detailEvenement,
    sha256Hex: sha256Hex, jsonbTexte: jsonbTexte, pgHorodatage: pgHorodatage, empreinteEvenement: empreinteEvenement, verifierChaine: verifierChaine,
    textePDF: textePDF
  };
  if (typeof module === 'object' && module.exports) module.exports = CC;
  else racine.CC = CC;
})(typeof self !== 'undefined' ? self : globalThis);
