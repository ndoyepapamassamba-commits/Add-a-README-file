/* Teranga Factures — interface (sans framework). Données : IndexedDB du téléphone uniquement. */
(function () {
  'use strict';
  var TF = window.TF, DB = window.DB;
  var VERSION = '1.0.0';
  var API_LICENCE = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique/commandes/';
  var URL_ACHAT = '../../boutique/licence-teranga-factures.html';
  var PRIX = '2 000 F';
  var MOIS_MS = 30 * 864e5;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function f(n) { return TF.f(n); }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }

  // ---------- Icônes ----------
  function svg(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + p + '</svg>'; }
  var ICO = {
    accueil: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    doc: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    devis: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 12h2m2 0h2M9 16h2m2 0h2"/>'),
    recu: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
    clients: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.5 3.5 5.2"/>'),
    articles: svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
    reglages: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    retour: svg('<path d="M15 18l-6-6 6-6"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    telecharger: svg('<path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16"/>'),
    partager: svg('<path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5z"/><path d="M8.5 9.5c.3 2.6 2.4 4.8 5 5.2l1.3-1.3 2 .9"/>'),
    installer: svg('<path d="M12 3v11m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="4" rx="1"/>'),
    cadenas: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    modifier: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
    supprimer: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    ok: svg('<path d="m5 12 5 5 9-10"/>'),
    copier: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    argent: svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>'),
    tableau: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>'),
    etoile: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    convertir: svg('<path d="M4 12h13m0 0-4-4m4 4-4 4M20 5v14"/>'),
    envoyer: svg('<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>'),
    sauvegarde: svg('<path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
    palette: svg('<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.5-2.2-.6-1.4.3-2.8 1.8-2.8H18a3 3 0 0 0 3-3c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="11" cy="7" r="1.2"/><circle cx="16" cy="8.5" r="1.2"/>'),
    boutique: svg('<path d="M4 9h16l-1 11H5zM8 9V7a4 4 0 0 1 8 0v2"/>'),
    chevron: svg('<path d="m9 6 6 6-6 6"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>')
  };

  // ---------- État ----------
  var DEFAUTS = { modele: 'classique', couleur: '#0b6e4f', tvaTaux: 18, tvaDefaut: false, echeanceJours: 30, validiteJours: 30,
    notesFacture: '', notesDevis: '', notesRecu: 'Merci pour votre paiement.' };
  var S = { profil: {}, reglages: Object.assign({}, DEFAUTS), clients: [], articles: [], documents: [], compteurs: {}, creations: {}, licence: null, sauvegarde: null };
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function majuscule(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  var MODES = ['Espèces', 'Wave', 'Orange Money', 'Free Money', 'Virement', 'Chèque', 'Autre'];
  var UNITES = ['pièce', 'unité', 'kg', 'g', 'litre', 'm', 'm²', 'm³', 'heure', 'jour', 'mois', 'forfait', 'sac', 'carton', 'paquet', 'lot', 'plat', 'personne', 'voyage'];
  var COULEURS = [['#0b6e4f', 'Vert Teranga'], ['#1d3557', 'Bleu nuit'], ['#8d1c3d', 'Bordeaux'], ['#b5542b', 'Terre cuite'], ['#2f3e46', 'Ardoise'], ['#5b3a8c', 'Violet']];
  var MODELES = [['classique', 'Classique', 'Sobre, noir et blanc. Idéal pour l\'impression.'], ['moderne', 'Moderne', 'Bandeau de couleur, tableau aéré.'], ['afrique', 'Afrique', 'Fine bande inspirée du wax, couleurs chaudes.']];

  function complet() { return !!(S.licence && S.licence.commande); }
  function moisCourant() { return TF.dateISO().slice(0, 7); }
  function creesCeMois() { return S.creations[moisCourant()] || 0; }
  function quotaAtteint() { return !complet() && creesCeMois() >= TF.LIMITE_GRATUITE; }

  function charger() {
    return Promise.all([DB.lire('kv', 'profil'), DB.lire('kv', 'reglages'), DB.lire('kv', 'compteurs'), DB.lire('kv', 'creations'),
      DB.lire('kv', 'licence'), DB.lire('kv', 'sauvegarde'), DB.tout('clients'), DB.tout('articles'), DB.tout('documents')])
      .then(function (r) {
        S.profil = r[0] || {}; S.reglages = Object.assign({}, DEFAUTS, r[1] || {}); S.compteurs = r[2] || {}; S.creations = r[3] || {};
        S.licence = r[4] || null; S.sauvegarde = r[5] || null; S.clients = r[6] || []; S.articles = r[7] || []; S.documents = r[8] || [];
      });
  }
  var persistanceDemandee = false;
  function demanderPersistance() {
    if (persistanceDemandee) return; persistanceDemandee = true;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}
  }

  // ---------- Petits composants ----------
  var minuteurToast = 0;
  function toast(msg, action) {
    var t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button" class="toast-btn">' + esc(action.label) + '</button>' : '');
    t.hidden = false; t.classList.add('visible');
    if (action) t.querySelector('button').onclick = function () { cacherToast(); action.fn(); };
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(cacherToast, action ? 7000 : 3500);
  }
  function cacherToast() { var t = $('#toast'); t.classList.remove('visible'); setTimeout(function () { if (!t.classList.contains('visible')) t.hidden = true; }, 250); }

  var feuilleOuverte = null;
  function feuille(titre, contenu, init) {
    fermerFeuille();
    cacherToast();
    var fond = document.createElement('div');
    fond.className = 'feuille-fond';
    fond.innerHTML = '<div class="feuille" role="dialog" aria-modal="true" aria-labelledby="feuille-titre"><div class="feuille-tete"><h2 id="feuille-titre">' +
      esc(titre) + '</h2><button type="button" class="icone-btn" data-fermer aria-label="Fermer">' + ICO.x + '</button></div><div class="feuille-corps">' + contenu + '</div></div>';
    document.body.appendChild(fond);
    document.body.classList.add('fige');
    feuilleOuverte = { el: fond, avant: document.activeElement };
    fond.addEventListener('click', function (e) { if (e.target === fond || e.target.closest('[data-fermer]')) fermerFeuille(); });
    var f1 = fond.querySelector('.feuille-corps input:not([type=hidden]):not(.vh), .feuille-corps select, .feuille-corps textarea, .feuille-corps button, .feuille-corps a');
    (f1 || fond.querySelector('[data-fermer]')).focus({ preventScroll: true });
    if (init) init(fond.querySelector('.feuille'));
    requestAnimationFrame(function () { fond.classList.add('ouverte'); });
    return fond.querySelector('.feuille');
  }
  function fermerFeuille() {
    if (!feuilleOuverte) return;
    var o = feuilleOuverte; feuilleOuverte = null;
    o.el.remove(); document.body.classList.remove('fige');
    if (o.avant && o.avant.focus && document.body.contains(o.avant)) o.avant.focus({ preventScroll: true });
  }
  function confirmer(message, oui, danger) {
    return new Promise(function (ok) {
      var fini = false;
      feuille('Confirmation', '<p>' + esc(message) + '</p><div class="rang-btn"><button type="button" class="btn sec" data-non>Annuler</button><button type="button" class="btn ' +
        (danger ? 'danger' : 'plein') + '" data-oui>' + esc(oui || 'Confirmer') + '</button></div>', function (el) {
        el.querySelector('[data-oui]').onclick = function () { fini = true; fermerFeuille(); ok(true); };
        el.querySelector('[data-non]').onclick = function () { fini = true; fermerFeuille(); ok(false); };
        el.querySelector('[data-non]').focus();
      });
      var obs = new MutationObserver(function () { if (!document.body.contains(feuilleOuverte && feuilleOuverte.el) && !fini) { obs.disconnect(); fini = true; ok(false); } });
      obs.observe(document.body, { childList: true });
    });
  }

  function telecharger(blob, nom) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nom; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
  }
  function chargerScript(src) {
    return new Promise(function (ok, ko) {
      if ($('script[data-src="' + src + '"]')) return ok();
      var s = document.createElement('script'); s.src = src; s.dataset.src = src;
      s.onload = function () { ok(); };
      s.onerror = function () { s.remove(); ko(new Error('Fichier manquant. Ouvrez l\'application une fois avec Internet.')); };
      document.head.appendChild(s);
    });
  }

  function badge(d) {
    var s = TF.statut(d);
    return '<span class="badge b-' + s + '">' + esc(TF.libelleStatut(d, s)) + '</span>';
  }
  function nomType(d) { return TF.TYPES[d.type].nom; }
  function trierDocs(l) {
    return l.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || (b.numero || '').localeCompare(a.numero || ''); });
  }
  function ligneDoc(d) {
    var t = TF.totaux(d);
    return '<a class="ligne-liste" href="#/doc/' + esc(d.id) + '"><span class="ll-g"><strong>' + esc(d.numero) + '</strong><span>' +
      esc((d.client && d.client.nom) || 'Client de passage') + ' · ' + esc(TF.dateFr(d.date)) + '</span></span><span class="ll-d"><strong>' + f(t.ttc) +
      '</strong>' + badge(d) + '</span></a>';
  }
  function vide(texte, lien, libelle) {
    return '<div class="vide"><p>' + esc(texte) + '</p>' + (lien ? '<a class="btn plein" href="' + lien + '">' + esc(libelle) + '</a>' : '') + '</div>';
  }
  function verrou() { return complet() ? '' : '<span class="verrou" title="Version complète">' + ICO.cadenas + '<span class="vh">(version complète)</span></span>'; }

  // ---------- Cadre de page ----------
  var pileNav = 0;
  function cadre(o) {
    $('#titre').textContent = o.titre;
    var r = $('#retour');
    r.hidden = !o.retour; r.dataset.vers = o.retour || '';
    $('#marque').hidden = !!o.retour;
    $$('#nav a').forEach(function (a) {
      var actif = a.dataset.nav === o.nav;
      a.classList.toggle('actif', actif);
      if (actif) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.body.classList.toggle('edition', !!o.edition);
    $('#fab').hidden = !o.fab;
    document.title = (o.titreDoc || o.titre) + ' · Teranga Factures';
    majInstall();
  }
  function vue(html) {
    var v = $('#vue');
    v.innerHTML = html;
    window.scrollTo(0, 0);
    v.focus({ preventScroll: true });
  }

  // ---------- Routeur ----------
  var ROUTES = [
    [/^\/?$/, vueAccueil],
    [/^\/bienvenue$/, vueBienvenue],
    [/^\/documents$/, vueDocuments],
    [/^\/doc\/([\w-]+)$/, vueDocument],
    [/^\/nouveau\/(facture|devis|proforma|recu)$/, vueNouveau],
    [/^\/editer\/([\w-]+)$/, vueEditer],
    [/^\/clients$/, vueClients],
    [/^\/client\/([\w-]+)$/, vueClient],
    [/^\/client-modifier\/([\w-]+)$/, vueClientForm],
    [/^\/articles$/, vueArticles],
    [/^\/article\/([\w-]+)$/, vueArticleForm],
    [/^\/reglages$/, vueReglages],
    [/^\/profil$/, vueProfil],
    [/^\/modeles$/, vueModeles],
    [/^\/licence$/, vueLicence],
    [/^\/sauvegarde$/, vueSauvegarde]
  ];
  var E = null, Esale = false, retourForce = false;
  function router() {
    if (retourForce) { retourForce = false; return; }
    var h = location.hash.replace(/^#/, ''), q = '';
    var i = h.indexOf('?');
    if (i >= 0) { q = h.slice(i + 1); h = h.slice(0, i); }
    var params = new URLSearchParams(q);
    if (E && Esale && !/^\/(nouveau|editer)\//.test(h)) {
      var ancien = E;
      if (!window.confirm('Quitter sans enregistrer ce document ?')) {
        retourForce = true;
        history.pushState(null, '', ancien.nouveau ? '#/nouveau/' + ancien.type : '#/editer/' + ancien.id);
        retourForce = false;
        return;
      }
    }
    if (!/^\/(nouveau|editer)\//.test(h)) { E = null; Esale = false; }
    fermerFeuille();
    if (!S.profil.nom && h !== '/bienvenue' && h !== '/sauvegarde' && h !== '/licence') { location.replace('#/bienvenue'); return; }
    for (var k = 0; k < ROUTES.length; k++) {
      var m = h.match(ROUTES[k][0]);
      if (m) { ROUTES[k][1](m[1], params); return; }
    }
    location.replace('#/');
  }
  function aller(h) { if (location.hash === h) router(); else location.hash = h; }

  // ---------- Bienvenue ----------
  function vueBienvenue() {
    cadre({ titre: 'Bienvenue', nav: '', edition: true });
    vue('<section class="bienvenue"><img src="icons/icon-192.png" alt="" width="84" height="84"><h1>Teranga Factures</h1>' +
      '<p class="lead">Vos factures, devis et reçus en PDF, depuis votre téléphone. Même sans Internet.</p>' +
      '<ul class="atouts"><li>' + ICO.ok + 'Montants en F CFA, écrits aussi en lettres</li><li>' + ICO.ok + 'Envoi direct au client sur WhatsApp</li><li>' + ICO.ok +
      'Vos données restent sur votre téléphone</li></ul>' +
      '<form class="carte" data-form="bienvenue"><h2>Votre entreprise</h2>' +
      champ('Nom de l\'entreprise', 'nom', '', { requis: true, auto: 'organization' }) +
      champ('Activité', 'activite', '', { aide: 'Ex. : boutique, couture, BTP, restaurant, consultant…' }) +
      champ('Téléphone (facultatif)', 'telephone', '', { type: 'tel', auto: 'tel', aide: 'Affiché sur vos documents seulement si vous le remplissez.' }) +
      '<button class="btn plein large" type="submit">Commencer</button></form>' +
      '<p class="centre petit"><a href="#/sauvegarde">J\'ai une sauvegarde à restaurer</a></p></section>');
  }
  function champ(label, nom, valeur, o) {
    o = o || {};
    var id = 'c-' + nom.replace(/[^\w-]/g, '');
    var attr = ' id="' + id + '" name="' + esc(nom) + '"' + (o.requis ? ' required' : '') + (o.auto ? ' autocomplete="' + o.auto + '"' : '') +
      (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.place ? ' placeholder="' + esc(o.place) + '"' : '') + (o.aide ? ' aria-describedby="' + id + '-aide"' : '') +
      (o.liste ? ' list="' + o.liste + '"' : '') + (o.extra || '');
    var input = o.zone ? '<textarea' + attr + ' rows="' + (o.lignes || 3) + '">' + esc(valeur) + '</textarea>'
      : '<input type="' + (o.type || 'text') + '"' + attr + ' value="' + esc(valeur) + '">';
    return '<div class="champ"><label for="' + id + '">' + esc(label) + (o.requis ? ' <span aria-hidden="true">*</span>' : '') + '</label>' + input +
      (o.aide ? '<small id="' + id + '-aide">' + esc(o.aide) + '</small>' : '') + '</div>';
  }
  function valeurs(form) {
    var o = {};
    $$('input,select,textarea', form).forEach(function (el) {
      if (!el.name) return;
      o[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    return o;
  }

  // ---------- Statistiques ----------
  function stats() {
    var auj = TF.dateISO(), mois = auj.slice(0, 7), annee = auj.slice(0, 4);
    var r = { ca: 0, encaisse: 0, impayes: 0, nbImpayes: 0, nbRetard: 0, devis: 0, nbDevis: 0, parMois: {}, parClient: {} };
    S.documents.forEach(function (d) {
      var st = TF.statut(d, auj), t = TF.totaux(d), m = (d.date || '').slice(0, 7);
      if (st === 'brouillon') return;
      var vente = d.type === 'facture' || (d.type === 'recu' && !(d.origine && d.origine.id));
      if (vente) {
        r.parMois[m] = (r.parMois[m] || 0) + t.ttc;
        if (m === mois) r.ca += t.ttc;
        if ((d.date || '').slice(0, 4) === annee) {
          var cle = (d.client && (d.client.id || d.client.nom)) || '—';
          var c = r.parClient[cle] || (r.parClient[cle] = { nom: (d.client && d.client.nom) || 'Clients de passage', id: d.client && d.client.id, total: 0 });
          c.total += t.ttc;
        }
      }
      if (d.type === 'facture') {
        (d.paiements || []).forEach(function (p) { if ((p.date || '').slice(0, 7) === mois) r.encaisse += Math.round(TF.lireNombre(p.montant)); });
        if (st === 'envoyee' || st === 'en_retard') { r.impayes += t.reste; r.nbImpayes++; }
        if (st === 'en_retard') r.nbRetard++;
      }
      if (d.type === 'recu' && !(d.origine && d.origine.id) && m === mois) r.encaisse += t.ttc;
      if (TF.estDevis(d.type) && st === 'envoyee') { r.devis += t.ttc; r.nbDevis++; }
    });
    return r;
  }
  function derniersMois(n) {
    var d = new Date(), out = [];
    d.setDate(1);
    for (var i = 0; i < n; i++) { out.unshift(TF.dateISO(d).slice(0, 7)); d.setMonth(d.getMonth() - 1); }
    return out;
  }

  // ---------- Accueil ----------
  function vueAccueil() {
    cadre({ titre: 'Teranga Factures', titreDoc: 'Tableau de bord', nav: 'accueil', fab: true });
    var st = stats(), mois = TF.moisFr(moisCourant());
    var ms = derniersMois(6), max = 1;
    ms.forEach(function (m) { max = Math.max(max, st.parMois[m] || 0); });
    var barres = ms.map(function (m) {
      var v = st.parMois[m] || 0, h = Math.round(v / max * 100);
      return '<div class="barre"><span class="barre-v">' + (v ? TF.formatNombre(Math.round(v / 1000)) + 'k' : '') + '</span><span class="barre-b" style="height:' + Math.max(v ? 4 : 1, h) +
        '%"></span><span class="barre-m">' + MOIS_COURTS[+m.slice(5) - 1] + '</span></div>';
    }).join('');
    var resume = ms.map(function (m) { return TF.moisFr(m) + ' : ' + TF.formatNombre(st.parMois[m] || 0) + ' F'; }).join(' ; ');
    var tops = Object.keys(st.parClient).map(function (k) { return st.parClient[k]; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
    var maxC = tops.length ? tops[0].total : 1;
    var derniers = trierDocs(S.documents).slice(0, 5);
    var h = '<section class="salut"><p class="petit">' + esc(majuscule(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))) +
      '</p><h1>' + esc(S.profil.nom) + '</h1></section>';
    h += bandeauInstall();
    h += '<nav class="raccourcis" aria-label="Créer un document"><a class="raccourci" href="#/nouveau/facture">' + ICO.doc + '<span>Facture</span></a>' +
      '<a class="raccourci" href="#/nouveau/devis">' + ICO.devis + '<span>Devis</span></a><a class="raccourci" href="#/nouveau/proforma">' + ICO.devis +
      '<span>Proforma</span></a><a class="raccourci" href="#/nouveau/recu">' + ICO.recu + '<span>Reçu</span></a></nav>';
    h += '<section class="kpis" aria-label="Chiffres clés">' +
      '<div class="kpi" id="kpi-ca"><span>Chiffre d\'affaires · ' + esc(mois) + '</span><strong>' + f(st.ca) + '</strong></div>' +
      '<div class="kpi"><span>Encaissé ce mois</span><strong>' + f(st.encaisse) + '</strong></div>' +
      '<a class="kpi' + (st.nbRetard ? ' alerte' : '') + '" href="#/documents?statut=impayes" id="kpi-impayes"><span>Impayés</span><strong>' + f(st.impayes) + '</strong><small>' +
      st.nbImpayes + ' facture' + (st.nbImpayes > 1 ? 's' : '') + (st.nbRetard ? ' · ' + st.nbRetard + ' en retard' : '') + '</small></a>' +
      '<a class="kpi" href="#/documents?type=devis&statut=envoyee"><span>Devis en attente</span><strong>' + f(st.devis) + '</strong><small>' + st.nbDevis + ' devis</small></a></section>';
    h += '<section class="carte"><h2>Chiffre d\'affaires sur 6 mois</h2><div class="barres" role="img" aria-label="' + esc(resume) + '">' + barres + '</div></section>';
    h += '<section class="carte"><h2>Meilleurs clients ' + TF.dateISO().slice(0, 4) + '</h2>' + (tops.length ? '<ol class="tops">' + tops.map(function (c) {
      return '<li><span class="tops-n">' + (c.id ? '<a href="#/client/' + esc(c.id) + '">' + esc(c.nom) + '</a>' : esc(c.nom)) + '</span><span class="tops-v">' + f(c.total) +
        '</span><span class="tops-b" style="width:' + Math.max(3, Math.round(c.total / maxC * 100)) + '%"></span></li>';
    }).join('') + '</ol>' : '<p class="petit">Vos meilleurs clients apparaîtront ici après vos premières factures.</p>') + '</section>';
    h += '<section class="carte"><div class="titre-ligne"><h2>Derniers documents</h2>' + (derniers.length ? '<a href="#/documents">Tout voir</a>' : '') + '</div>' +
      (derniers.length ? '<div class="liste">' + derniers.map(ligneDoc).join('') + '</div>' : '<p class="petit">Aucun document pour l\'instant. Touchez « Facture » pour commencer.</p>') + '</section>';
    if (!complet()) {
      var n = creesCeMois(), pct = Math.min(100, Math.round(n / TF.LIMITE_GRATUITE * 100));
      h += '<section class="carte quota" id="quota"><h2>Version gratuite</h2><p><strong>' + n + ' / ' + TF.LIMITE_GRATUITE + '</strong> documents créés en ' + esc(mois) +
        '.</p><div class="jauge" role="progressbar" aria-valuemin="0" aria-valuemax="' + TF.LIMITE_GRATUITE + '" aria-valuenow="' + n + '" aria-label="Documents créés ce mois"><span style="width:' + pct +
        '%"></span></div><p class="petit">Version complète : documents illimités, 3 modèles, signature et cachet, export Excel, sans mention en bas de page. ' + PRIX + ', une seule fois.</p>' +
        '<a class="btn plein" href="#/licence">' + ICO.etoile + 'Passer à la version complète</a></section>';
    }
    h += '<button type="button" class="btn sec large" data-action="excel">' + ICO.tableau + 'Exporter en Excel' + verrou() + '</button>';
    if (S.documents.length && (!S.sauvegarde || Date.now() - Date.parse(S.sauvegarde) > MOIS_MS)) {
      h += '<p class="rappel">' + ICO.info + '<span>Pensez à faire une sauvegarde de vos données. <a href="#/sauvegarde">Sauvegarder maintenant</a></span></p>';
    }
    vue(h);
  }

  // ---------- Documents ----------
  var filtres = { q: '', type: 'tous', statut: 'tous' };
  function vueDocuments(_, params) {
    if (params.get('statut')) filtres.statut = params.get('statut');
    if (params.get('type')) filtres.type = params.get('type');
    cadre({ titre: 'Documents', nav: 'documents', fab: true });
    var types = [['tous', 'Tous'], ['facture', 'Factures'], ['devis', 'Devis'], ['recu', 'Reçus']];
    var statuts = [['tous', 'Tous les statuts'], ['brouillon', 'Brouillons'], ['envoyee', 'Envoyés'], ['impayes', 'Impayés'], ['en_retard', 'En retard'],
      ['payee', 'Payés'], ['accepte', 'Devis acceptés'], ['refuse', 'Devis refusés']];
    vue('<div class="recherche"><label class="vh" for="q-docs">Rechercher un document</label><input id="q-docs" type="search" placeholder="Numéro, client, article, montant…" value="' + esc(filtres.q) + '"></div>' +
      '<div class="puces" role="group" aria-label="Type de document">' + types.map(function (t) {
        return '<button type="button" class="puce" data-action="filtre-type" data-v="' + t[0] + '" aria-pressed="' + (filtres.type === t[0]) + '">' + t[1] + '</button>';
      }).join('') + '</div><div class="champ compact"><label class="vh" for="filtre-statut">Statut</label><select id="filtre-statut">' + statuts.map(function (s) {
        return '<option value="' + s[0] + '"' + (filtres.statut === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
      }).join('') + '</select></div><p class="petit" id="nb-docs" aria-live="polite"></p><div class="liste" id="liste-docs"></div>');
    $('#q-docs').addEventListener('input', function () { filtres.q = this.value; listerDocs(); });
    $('#filtre-statut').addEventListener('change', function () { filtres.statut = this.value; listerDocs(); });
    listerDocs();
  }
  function correspond(d, q) {
    if (!q) return true;
    var t = TF.totaux(d);
    var tas = TF.sansAccents([d.numero, d.client && d.client.nom, d.objet, TF.dateFr(d.date), nomType(d)].concat((d.lignes || []).map(function (l) { return l.designation; })).join(' '));
    var mots = TF.sansAccents(q).split(/\s+/).filter(Boolean);
    var chiffres = q.replace(/[\s .]/g, '');
    if (/^\d{3,}$/.test(chiffres) && String(t.ttc).indexOf(chiffres) >= 0) return true;
    return mots.every(function (m) { return tas.indexOf(m) >= 0; });
  }
  function listerDocs() {
    var auj = TF.dateISO();
    var l = trierDocs(S.documents).filter(function (d) {
      if (filtres.type !== 'tous' && !(filtres.type === d.type || (filtres.type === 'devis' && d.type === 'proforma'))) return false;
      var s = TF.statut(d, auj);
      if (filtres.statut === 'impayes') { if (!(d.type === 'facture' && (s === 'envoyee' || s === 'en_retard'))) return false; }
      else if (filtres.statut !== 'tous' && s !== filtres.statut) return false;
      return correspond(d, filtres.q.trim());
    });
    $$('.puce[data-action="filtre-type"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === filtres.type)); });
    $('#nb-docs').textContent = l.length + ' document' + (l.length > 1 ? 's' : '');
    $('#liste-docs').innerHTML = l.length ? l.map(ligneDoc).join('') : (S.documents.length ? '<p class="vide">Aucun document ne correspond.</p>' : vide('Aucun document pour l\'instant.', '#/nouveau/facture', 'Créer ma première facture'));
  }

  // ---------- Fiche d'un document ----------
  function trouverDoc(id) { for (var i = 0; i < S.documents.length; i++) if (S.documents[i].id === id) return S.documents[i]; return null; }
  function vueDocument(id) {
    var d = trouverDoc(id);
    if (!d) { toast('Document introuvable.'); location.replace('#/documents'); return; }
    var t = TF.totaux(d), st = TF.statut(d), info = TF.TYPES[d.type];
    cadre({ titre: d.numero, titreDoc: info.nom + ' ' + d.numero, retour: '#/documents', nav: 'documents' });
    var h = '<section class="doc-tete"><div><p class="petit">' + esc(info.nom) + ' · ' + esc(TF.dateFr(d.date)) + '</p><h1>' + esc(d.numero) + '</h1><p>' +
      esc((d.client && d.client.nom) || 'Client de passage') + '</p></div><div class="doc-montant"><strong id="doc-total">' + f(t.ttc) + '</strong>' + badge(d) + '</div></section>';
    if (d.type === 'facture' && t.paye > 0 && t.reste > 0) h += '<p class="info-paye">Déjà payé : <strong>' + f(t.paye) + '</strong> · Reste : <strong>' + f(t.reste) + '</strong></p>';
    if (d.convertiEn) h += '<p class="info-lien">' + ICO.convertir + '<span>Converti en <a href="#/doc/' + esc(d.convertiEn.id) + '">facture ' + esc(d.convertiEn.numero) + '</a></span></p>';
    if (d.origine && d.origine.id) h += '<p class="info-lien">' + ICO.info + '<span>' + (d.type === 'recu' ? 'Règlement de la ' : 'Établie d\'après ') + '<a href="#/doc/' + esc(d.origine.id) + '">' +
      esc(d.origine.numero) + '</a></span></p>';
    h += '<div class="actions-principales"><button type="button" class="btn wa large" data-action="partager" data-id="' + esc(d.id) + '">' + ICO.partager + 'Envoyer sur WhatsApp</button>' +
      '<button type="button" class="btn sec large" data-action="pdf" data-id="' + esc(d.id) + '">' + ICO.telecharger + 'Télécharger le PDF</button></div>';
    var a = [];
    a.push(['editer', ICO.modifier, 'Modifier']);
    if (d.type !== 'recu' && st === 'brouillon') a.push(['envoye', ICO.envoyer, d.type === 'devis' ? 'Marquer comme envoyé' : 'Marquer comme envoyée']);
    if (d.type === 'facture' && t.reste > 0 && st !== 'brouillon') a.push(['paiement', ICO.argent, 'Enregistrer un paiement']);
    if (d.type === 'facture' && t.reste > 0 && st === 'brouillon') a.push(['paiement', ICO.argent, 'Enregistrer un paiement']);
    if (TF.estDevis(d.type) && !d.convertiEn) a.push(['convertir', ICO.convertir, 'Convertir en facture']);
    if (TF.estDevis(d.type) && !d.convertiEn && st !== 'accepte') a.push(['accepte', ICO.ok, d.type === 'devis' ? 'Marquer accepté' : 'Marquer acceptée']);
    if (TF.estDevis(d.type) && !d.convertiEn && st !== 'refuse') a.push(['refuse', ICO.x, d.type === 'devis' ? 'Marquer refusé' : 'Marquer refusée']);
    if (d.type === 'facture' && (d.paiements || []).length) a.push(['recu-depuis', ICO.recu, 'Créer un reçu']);
    a.push(['dupliquer', ICO.copier, 'Dupliquer']);
    a.push(['supprimer', ICO.supprimer, 'Supprimer']);
    h += '<div class="actions-sec">' + a.map(function (x) {
      return '<button type="button" class="btn-action' + (x[0] === 'supprimer' ? ' danger' : '') + '" data-action="doc-' + x[0] + '" data-id="' + esc(d.id) + '">' + x[1] + '<span>' + esc(x[2]) + '</span></button>';
    }).join('') + '</div>';
    if (d.type === 'facture' && (d.paiements || []).length) {
      h += '<section class="carte"><h2>Paiements reçus</h2><ul class="paiements">' + d.paiements.map(function (p, i) {
        return '<li><span>' + esc(TF.dateFr(p.date)) + ' · ' + esc(p.mode || '') + '</span><strong>' + f(TF.lireNombre(p.montant)) + '</strong><button type="button" class="icone-btn" data-action="paiement-suppr" data-id="' +
          esc(d.id) + '" data-i="' + i + '" aria-label="Supprimer le paiement du ' + esc(TF.dateFr(p.date)) + '">' + ICO.supprimer + '</button></li>';
      }).join('') + '</ul></section>';
    }
    h += '<h2 class="sous-titre">Aperçu</h2>' + apercu(d);
    if (!complet()) h += '<p class="petit centre">PDF au modèle Classique avec la mention « Créé avec Teranga Factures ». <a href="#/licence">Version complète</a></p>';
    vue(h);
    if (window.TF_PDF) setTimeout(function () { TF_PDF.bibliotheques().catch(function () {}); }, 400);
  }

  function apercu(d) {
    var P = S.profil, t = TF.totaux(d), info = TF.TYPES[d.type], c = d.client || {};
    var det = [P.activite, P.adresse, P.ville, [P.telephone ? 'Tél. ' + P.telephone : '', P.email].filter(Boolean).join(' · '),
      [P.ninea ? 'NINEA : ' + P.ninea : '', P.rc ? 'RC : ' + P.rc : ''].filter(Boolean).join(' · ')].filter(Boolean);
    var refs = '<span>N° <b>' + esc(d.numero) + '</b></span><span>Date : ' + esc(TF.dateFr(d.date)) + '</span>';
    if (d.type === 'facture' && d.echeance) refs += '<span>Échéance : ' + esc(d.echeance <= d.date ? 'à réception' : TF.dateFr(d.echeance)) + '</span>';
    if (TF.estDevis(d.type) && d.echeance) refs += '<span>Valable jusqu\'au ' + esc(TF.dateFr(d.echeance)) + '</span>';
    if (d.type === 'recu' && d.mode) refs += '<span>Paiement : ' + esc(d.mode) + '</span>';
    var lignes = (d.lignes || []).map(function (l) {
      return '<tr><td>' + esc(l.designation) + (l.details ? '<small>' + nl2br(l.details) + '</small>' : '') + '</td><td class="n">' + esc(TF.formatQuantite(l.qte)) + (l.unite ? ' ' + esc(l.unite) : '') +
        '</td><td class="n">' + esc(TF.formatNombre(TF.lireNombre(l.pu))) + (TF.lireNombre(l.remise) > 0 ? '<small>−' + esc(TF.formatQuantite(TF.lireNombre(l.remise))) + ' %</small>' : '') +
        '</td><td class="n"><b>' + esc(TF.formatNombre(TF.montantLigne(l))) + '</b></td></tr>';
    }).join('');
    var tot = '';
    if (t.remise > 0 || d.tvaActive) tot += '<div><dt>Sous-total</dt><dd>' + f(t.sousTotal) + '</dd></div>';
    if (t.remise > 0) tot += '<div><dt>Remise</dt><dd>−' + f(t.remise) + '</dd></div>';
    if (d.tvaActive) tot += '<div><dt>TVA (' + esc(TF.formatQuantite(TF.lireNombre(d.tvaTaux))) + ' %)</dt><dd>' + f(t.tva) + '</dd></div>';
    tot += '<div class="p-total"><dt>' + (d.type === 'recu' ? 'Montant reçu' : d.tvaActive ? 'Total TTC' : 'Total') + '</dt><dd>' + f(t.ttc) + '</dd></div>';
    if (d.type === 'facture' && t.paye > 0) tot += '<div><dt>Déjà payé</dt><dd>' + f(t.paye) + '</dd></div><div><dt><b>Reste à payer</b></dt><dd><b>' + f(t.reste) + '</b></dd></div>';
    var ph = TF.phraseArrete(d.type, t.ttc), i = ph.indexOf(' : ');
    return '<article class="papier" aria-label="Aperçu de ' + esc(info.article) + '"><header class="p-tete"><div class="p-ent">' + (P.logo ? '<img src="' + esc(P.logo) + '" alt="Logo">' : '') +
      '<div><strong>' + esc(P.nom) + '</strong>' + det.map(function (x) { return '<small>' + nl2br(x) + '</small>'; }).join('') + '</div></div><div class="p-titre"><b>' + esc(info.titre) + '</b>' + refs + '</div></header>' +
      '<div class="p-client"><small>' + (d.type === 'facture' ? 'Facturé à' : d.type === 'recu' ? 'Reçu de' : 'Client') + '</small><strong>' + esc(c.nom || 'Client de passage') + '</strong>' +
      (c.adresse ? '<span>' + nl2br(c.adresse) + '</span>' : '') + (c.telephone ? '<span>Tél. ' + esc(c.telephone) + '</span>' : '') + (c.ninea ? '<span>NINEA : ' + esc(c.ninea) + '</span>' : '') + '</div>' +
      (d.objet ? '<p class="p-objet"><small>Objet</small> ' + esc(d.objet) + '</p>' : '') +
      '<div class="p-table-boite"><table class="p-table"><thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">P.U.</th><th class="n">Montant</th></tr></thead><tbody>' + lignes + '</tbody></table></div>' +
      '<dl class="p-totaux">' + tot + '</dl><p class="p-lettres"><em>' + esc(ph.slice(0, i + 2)) + '</em> <b>' + esc(ph.slice(i + 3)) + '</b></p>' +
      (d.notes ? '<p class="p-notes">' + nl2br(d.notes) + '</p>' : '') + (P.paiement ? '<p class="p-notes"><small>Paiement</small> ' + nl2br(P.paiement) + '</p>' : '') +
      (complet() && P.signature ? '<div class="p-sig"><small>Signature et cachet</small><img src="' + esc(P.signature) + '" alt="Signature"></div>' : '') + '</article>';
  }

  // ---------- PDF et partage ----------
  var occupe = false;
  function fairePDF(d) {
    if (!window.TF_PDF) return Promise.reject(new Error('Module PDF absent.'));
    return TF_PDF.generer(d, { profil: S.profil, reglages: S.reglages, complet: complet() });
  }
  function marquerEnvoye(d) {
    if (d.type !== 'recu' && d.statut === 'brouillon') { d.statut = 'envoyee'; d.modifie = new Date().toISOString(); return DB.mettre('documents', d); }
    return Promise.resolve();
  }
  function messageWA(d) {
    var t = TF.totaux(d), info = TF.TYPES[d.type];
    var s = 'Bonjour' + (d.client && d.client.nom ? ' ' + d.client.nom : '') + ',\n';
    if (d.type === 'recu') s += 'Voici votre reçu ' + d.numero + ' pour votre paiement de ' + TF.fcfa(t.ttc, ' ') + '. Merci !';
    else if (TF.estDevis(d.type)) s += 'Voici ' + info.article + ' ' + d.numero + ' d\'un montant de ' + TF.fcfa(t.ttc, ' ') + '.';
    else {
      s += 'Voici la facture ' + d.numero + ' d\'un montant de ' + TF.fcfa(t.ttc, ' ') + '.';
      if (t.paye > 0 && t.reste > 0) s += ' Reste à payer : ' + TF.fcfa(t.reste, ' ') + '.';
      if (t.reste > 0 && TF.lienWaveValide(S.profil.lienWave)) s += '\nPayer par Wave : ' + String(S.profil.lienWave).trim();
    }
    return s + '\nMerci de votre confiance.\n' + (S.profil.nom || '');
  }
  function estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function peutPartagerFichier(fichier) {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [fichier] })); } catch (e) { return false; }
  }
  function apresEnvoi(d) { return marquerEnvoye(d).then(function () { if (location.hash === '#/doc/' + d.id) vueDocument(d.id); }); }

  function actionPDF(id, partage) {
    var d = trouverDoc(id);
    if (!d || occupe) return;
    occupe = true;
    toast('Préparation du PDF…');
    fairePDF(d).then(function (r) {
      occupe = false;
      var fichier = null;
      try { fichier = new File([r.blob], r.nom, { type: 'application/pdf' }); } catch (e) { fichier = null; }
      var texte = messageWA(d);
      if ((partage || estIOS()) && fichier && peutPartagerFichier(fichier)) {
        cacherToast();
        return navigator.share({ files: [fichier], title: r.nom, text: partage ? texte : undefined })
          .then(function () { return apresEnvoi(d); })
          .catch(function (e) {
            if (e && e.name === 'AbortError') return;
            // délai d'activation dépassé : nouveau geste de l'utilisateur
            feuille('Envoyer le PDF', '<p>Votre PDF est prêt.</p><button type="button" class="btn wa large" id="partager-maintenant">' + ICO.partager + 'Partager maintenant</button>', function (el) {
              el.querySelector('#partager-maintenant').onclick = function () {
                navigator.share({ files: [fichier], title: r.nom, text: texte }).then(function () { fermerFeuille(); return apresEnvoi(d); }).catch(function () {});
              };
            });
          });
      }
      telecharger(r.blob, r.nom);
      if (partage) {
        cacherToast();
        feuille('Envoyer sur WhatsApp', '<p>Le PDF <b>' + esc(r.nom) + '</b> est enregistré dans vos téléchargements.</p><ol class="etapes"><li>Ouvrez WhatsApp avec le bouton ci-dessous et choisissez le client.</li>' +
          '<li>Joignez le fichier : trombone, puis « Document », puis <b>' + esc(r.nom) + '</b>.</li></ol><a class="btn wa large" id="ouvrir-wa" target="_blank" rel="noopener" href="https://wa.me/?text=' +
          encodeURIComponent(texte) + '">' + ICO.partager + 'Ouvrir WhatsApp</a><button type="button" class="btn sec large" data-action="copier-message" data-id="' + esc(d.id) + '">' + ICO.copier + 'Copier le message</button>');
      } else toast('PDF enregistré : ' + r.nom);
      return apresEnvoi(d);
    }).catch(function (e) { occupe = false; toast(e.message || 'Le PDF n\'a pas pu être créé.'); });
  }

  // ---------- Éditeur ----------
  function notesDefaut(type) { return type === 'facture' ? S.reglages.notesFacture : type === 'recu' ? S.reglages.notesRecu : S.reglages.notesDevis; }
  function echeanceDefaut(type, date) {
    if (type === 'facture') return TF.ajouterJours(date, Math.max(0, parseInt(S.reglages.echeanceJours, 10) || 0));
    if (TF.estDevis(type)) return TF.ajouterJours(date, Math.max(0, parseInt(S.reglages.validiteJours, 10) || 30));
    return '';
  }
  function nouveauDocument(type, base) {
    var auj = TF.dateISO();
    return Object.assign({ id: TF.nouvelId(), type: type, numero: '', date: auj, echeance: echeanceDefaut(type, auj), client: null, objet: '',
      lignes: [{ designation: '', qte: 1, pu: '', remise: '' }], remiseGlobale: '', remiseType: 'montant', tvaActive: !!S.reglages.tvaDefaut,
      tvaTaux: S.reglages.tvaTaux || 18, notes: notesDefaut(type) || '', statut: type === 'recu' ? 'payee' : 'brouillon', paiements: [],
      mode: type === 'recu' ? 'Espèces' : '', nouveau: true }, base || {});
  }
  function proposerComplet(raison) {
    feuille('Version complète', '<p class="lead">' + esc(raison) + '</p><ul class="atouts"><li>' + ICO.ok + 'Documents illimités</li><li>' + ICO.ok + '3 modèles : Classique, Moderne, Afrique</li><li>' + ICO.ok +
      'Signature et cachet sur vos PDF</li><li>' + ICO.ok + 'Export Excel du tableau de bord</li><li>' + ICO.ok + 'Plus de mention « Créé avec Teranga Factures »</li></ul><p><strong>' + PRIX +
      '</strong>, payé une seule fois par Wave. Licence à vie.</p><a class="btn plein large" href="#/licence">' + ICO.etoile + 'Activer la version complète</a>');
  }
  function vueNouveau(type, params) {
    if (quotaAtteint()) {
      location.replace('#/');
      setTimeout(function () { proposerComplet('Vous avez créé ' + TF.LIMITE_GRATUITE + ' documents ce mois : c\'est la limite de la version gratuite.'); }, 50);
      return;
    }
    if (!E || !E.nouveau || E.type !== type) {
      E = nouveauDocument(type);
      var cid = params.get('client');
      var c = cid && S.clients.filter(function (x) { return x.id === cid; })[0];
      if (c) E.client = instantane(c);
      Esale = false;
    }
    vueEditeur();
  }
  function vueEditer(id) {
    var d = trouverDoc(id);
    if (!d) { location.replace('#/documents'); return; }
    if (!E || E.id !== id) { E = JSON.parse(JSON.stringify(d)); Esale = false; }
    vueEditeur();
  }
  function instantane(c) { return { id: c.id, nom: c.nom, adresse: c.adresse || '', telephone: c.telephone || '', email: c.email || '', ninea: c.ninea || '' }; }
  function clientsTries() { return S.clients.slice().sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr'); }); }
  function optionsClients() {
    var sel = E.client ? (E.client.id || '__passage') : '';
    return '<option value=""' + (sel === '' ? ' selected' : '') + '>— Choisir un client —</option>' + clientsTries().map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (sel === c.id ? ' selected' : '') + '>' + esc(c.nom) + '</option>';
    }).join('') + '<option value="__passage"' + (sel === '__passage' ? ' selected' : '') + '>Client de passage (sans fiche)</option><option value="__nouveau">+ Nouveau client…</option>';
  }
  function vueEditeur() {
    var d = E, info = TF.TYPES[d.type];
    cadre({ titre: d.nouveau ? 'Nouveau document' : 'Modifier ' + d.numero, retour: d.nouveau ? '#/' : '#/doc/' + d.id, nav: 'documents', edition: true });
    var h = '<form id="editeur" data-form="document" novalidate><p class="erreur" id="erreur-doc" role="alert" hidden></p>';
    if (d.nouveau) {
      h += '<fieldset class="segments"><legend class="vh">Type de document</legend>' + ['facture', 'devis', 'proforma', 'recu'].map(function (t) {
        return '<label class="segment"><input type="radio" name="type" value="' + t + '"' + (t === d.type ? ' checked' : '') + '><span>' + (t === 'proforma' ? 'Proforma' : TF.TYPES[t].nom) + '</span></label>';
      }).join('') + '</fieldset>';
      h += '<p class="petit">Numéro attribué à l\'enregistrement : <b id="prochain-num">' + esc(prochainNumero(d.type, d.date)) + '</b></p>';
    }
    h += '<fieldset class="carte"><legend>Client</legend><div class="champ"><label for="e-client" class="vh">Client</label><select id="e-client" data-e="client">' + optionsClients() + '</select></div>' +
      '<div class="champ" id="bloc-passage"' + (E.client && !E.client.id ? '' : ' hidden') + '><label for="e-passage">Nom du client (facultatif)</label><input id="e-passage" data-e="passage" value="' +
      esc(E.client && !E.client.id ? E.client.nom : '') + '"></div></fieldset>';
    h += '<fieldset class="carte"><legend>Informations</legend><div class="grille2"><div class="champ"><label for="e-date">Date</label><input type="date" id="e-date" data-e="date" value="' + esc(d.date) + '" required></div>';
    if (d.type === 'facture' || TF.estDevis(d.type)) {
      h += '<div class="champ"><label for="e-echeance">' + (d.type === 'facture' ? 'Échéance' : 'Valable jusqu\'au') + '</label><input type="date" id="e-echeance" data-e="echeance" value="' + esc(d.echeance) + '"></div>';
    }
    if (d.type === 'recu') {
      h += '<div class="champ"><label for="e-mode">Mode de paiement</label><select id="e-mode" data-e="mode">' + MODES.map(function (m) { return '<option' + (m === d.mode ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '</select></div>';
    }
    h += '</div>';
    if (d.type === 'facture') h += '<div class="puces petites" role="group" aria-label="Échéance rapide"><button type="button" class="puce" data-action="echeance" data-j="0">À réception</button><button type="button" class="puce" data-action="echeance" data-j="15" aria-label="Échéance à 15 jours">15 j</button><button type="button" class="puce" data-action="echeance" data-j="30" aria-label="Échéance à 30 jours">30 j</button><button type="button" class="puce" data-action="echeance" data-j="60" aria-label="Échéance à 60 jours">60 j</button></div>';
    h += '<div class="champ"><label for="e-objet">Objet (facultatif)</label><input id="e-objet" data-e="objet" value="' + esc(d.objet) + '" placeholder="Ex. : Travaux de peinture, commande du 2 novembre…"></div></fieldset>';
    h += '<fieldset class="carte"><legend>Lignes</legend><div id="lignes"></div><div class="rang-btn pile"><button type="button" class="btn sec" data-action="ligne-ajout">' + ICO.plus + 'Ajouter une ligne</button>' +
      '<button type="button" class="btn sec" data-action="ligne-article">' + ICO.articles + 'Choisir dans mes articles</button></div></fieldset>';
    h += '<fieldset class="carte"><legend>Remise et TVA</legend><div class="grille2"><div class="champ"><label for="e-remise">Remise globale</label><input id="e-remise" data-e="remiseGlobale" inputmode="decimal" value="' +
      esc(d.remiseGlobale ? TF.formatNombre(TF.lireNombre(d.remiseGlobale), ' ') : '') + '" placeholder="0"></div><div class="champ"><label for="e-remise-type">En</label><select id="e-remise-type" data-e="remiseType"><option value="montant"' +
      (d.remiseType !== 'pct' ? ' selected' : '') + '>F CFA</option><option value="pct"' + (d.remiseType === 'pct' ? ' selected' : '') + '>%</option></select></div></div>' +
      '<label class="interrupteur"><input type="checkbox" id="e-tva" data-e="tvaActive"' + (d.tvaActive ? ' checked' : '') + '><span>Appliquer la TVA</span></label>' +
      '<div class="champ" id="bloc-tva"' + (d.tvaActive ? '' : ' hidden') + '><label for="e-tva-taux">Taux de TVA (%)</label><input id="e-tva-taux" data-e="tvaTaux" inputmode="decimal" value="' + esc(TF.formatQuantite(TF.lireNombre(d.tvaTaux))) + '"></div></fieldset>';
    h += '<fieldset class="carte"><legend>Conditions et notes</legend><div class="champ"><label for="e-notes" class="vh">Conditions et notes</label><textarea id="e-notes" data-e="notes" rows="3" placeholder="Ex. : Paiement à réception. Acompte de 50 % à la commande.">' +
      esc(d.notes) + '</textarea></div></fieldset>';
    h += '<section class="carte recap" aria-live="polite"><dl id="recap"></dl><p class="lettres" id="lettres"></p></section>';
    h += '<div class="barre-enreg"><div><small>Total</small><strong id="total-doc">0 F</strong></div><button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>';
    h += '<datalist id="liste-articles">' + S.articles.map(function (a) { return '<option value="' + esc(a.designation) + '">'; }).join('') + '</datalist>';
    h += '<datalist id="liste-unites">' + UNITES.map(function (u) { return '<option value="' + esc(u) + '">'; }).join('') + '</datalist>';
    vue(h);
    rendreLignes();
    majTotaux();
  }
  function prochainNumero(type, date) {
    var annee = String(date || TF.dateISO()).slice(0, 4), cle = TF.TYPES[type].prefixe + '-' + annee;
    return TF.numero(type, annee, seqMax(cle) + 1);
  }
  function seqMax(cle) {
    var n = S.compteurs[cle] || 0;
    S.documents.forEach(function (d) { if (d.numero && d.numero.indexOf(cle + '-') === 0) n = Math.max(n, parseInt(d.numero.slice(cle.length + 1), 10) || 0); });
    return n;
  }
  function rendreLignes() {
    var z = $('#lignes');
    z.innerHTML = E.lignes.map(function (l, i) {
      var n = i + 1;
      return '<div class="ligne" data-i="' + i + '"><div class="ligne-tete"><span>Ligne ' + n + '</span><button type="button" class="icone-btn" data-action="ligne-suppr" data-i="' + i +
        '" aria-label="Supprimer la ligne ' + n + '">' + ICO.supprimer + '</button></div>' +
        '<div class="champ"><label for="l' + i + '-d">Désignation</label><input id="l' + i + '-d" data-l="designation" list="liste-articles" value="' + esc(l.designation) + '" placeholder="Produit ou service"></div>' +
        '<div class="grille3"><div class="champ"><label for="l' + i + '-q">Qté</label><input id="l' + i + '-q" data-l="qte" inputmode="decimal" value="' + esc(l.qte === '' ? '' : TF.formatQuantite(TF.lireNombre(l.qte), ' ')) + '"></div>' +
        '<div class="champ"><label for="l' + i + '-p">Prix unit. (F)</label><input id="l' + i + '-p" data-l="pu" inputmode="numeric" value="' + esc(l.pu === '' ? '' : TF.formatNombre(TF.lireNombre(l.pu), ' ')) + '"></div>' +
        '<div class="champ"><label for="l' + i + '-r">Remise %</label><input id="l' + i + '-r" data-l="remise" inputmode="decimal" value="' + esc(TF.lireNombre(l.remise) ? TF.formatQuantite(TF.lireNombre(l.remise), ' ') : '') + '" placeholder="0"></div></div>' +
        '<details class="ligne-plus"' + (l.details ? ' open' : '') + '><summary>Unité' + (l.unite ? ' (' + esc(l.unite) + ')' : '') + ' et détails</summary><div class="grille2"><div class="champ"><label for="l' + i + '-u">Unité</label><input id="l' + i +
        '-u" data-l="unite" list="liste-unites" value="' + esc(l.unite || '') + '" placeholder="pièce, m², jour…"></div></div><div class="champ"><label for="l' + i + '-x">Détails</label><textarea id="l' + i +
        '-x" data-l="details" rows="2">' + esc(l.details || '') + '</textarea></div></details>' +
        '<p class="ligne-montant">Montant : <strong data-montant>' + f(TF.montantLigne(l)) + '</strong></p></div>';
    }).join('') || '<p class="petit">Aucune ligne. Ajoutez un produit ou un service.</p>';
  }
  function majTotaux() {
    if (!E || !$('#recap')) return;
    var t = TF.totaux(E), r = '';
    if (t.remise > 0 || E.tvaActive) r += '<div><dt>Sous-total</dt><dd>' + f(t.sousTotal) + '</dd></div>';
    if (t.remise > 0) r += '<div><dt>Remise</dt><dd>−' + f(t.remise) + '</dd></div>';
    if (E.tvaActive) r += '<div><dt>TVA (' + esc(TF.formatQuantite(TF.lireNombre(E.tvaTaux))) + ' %)</dt><dd>' + f(t.tva) + '</dd></div>';
    r += '<div class="recap-total"><dt>' + (E.type === 'recu' ? 'Montant reçu' : E.tvaActive ? 'Total TTC' : 'Total') + '</dt><dd id="recap-total">' + f(t.ttc) + '</dd></div>';
    $('#recap').innerHTML = r;
    $('#lettres').textContent = TF.phraseArrete(E.type, t.ttc);
    $('#total-doc').textContent = f(t.ttc);
  }
  function surSaisieEditeur(el) {
    Esale = true;
    var ligne = el.closest('.ligne');
    if (ligne && el.dataset.l) {
      var i = +ligne.dataset.i, l = E.lignes[i];
      l[el.dataset.l] = el.value;
      if (el.dataset.l === 'designation') {
        var a = S.articles.filter(function (x) { return x.designation === el.value; })[0];
        if (a && !TF.lireNombre(l.pu)) {
          l.pu = a.prix; l.unite = l.unite || a.unite || '';
          ligne.querySelector('[data-l="pu"]').value = TF.formatNombre(a.prix, ' ');
          if (a.unite) ligne.querySelector('[data-l="unite"]').value = l.unite;
        }
      }
      ligne.querySelector('[data-montant]').textContent = f(TF.montantLigne(l));
      majTotaux();
      return;
    }
    var k = el.dataset.e;
    if (!k) return;
    if (k === 'client') {
      if (el.value === '__nouveau') { el.value = E.client ? (E.client.id || '__passage') : ''; formulaireClientRapide(); return; }
      if (el.value === '__passage') { E.client = { id: '', nom: $('#e-passage').value.trim() }; $('#bloc-passage').hidden = false; }
      else {
        $('#bloc-passage').hidden = true;
        var c = S.clients.filter(function (x) { return x.id === el.value; })[0];
        E.client = c ? instantane(c) : null;
      }
      return;
    }
    if (k === 'passage') { E.client = { id: '', nom: el.value.trim() }; return; }
    if (k === 'tvaActive') { E.tvaActive = el.checked; $('#bloc-tva').hidden = !el.checked; majTotaux(); return; }
    E[k] = el.value;
    if (k === 'date' && E.nouveau && $('#prochain-num')) $('#prochain-num').textContent = prochainNumero(E.type, E.date);
    majTotaux();
  }
  function changerType(type) {
    var ancienNotes = notesDefaut(E.type) || '';
    var garde = { lignes: E.lignes, client: E.client, objet: E.objet, date: E.date, remiseGlobale: E.remiseGlobale, remiseType: E.remiseType, tvaActive: E.tvaActive, tvaTaux: E.tvaTaux };
    var notes = E.notes === ancienNotes ? notesDefaut(type) || '' : E.notes;
    var id = E.id;
    E = nouveauDocument(type, garde);
    E.id = id; E.notes = notes; E.echeance = echeanceDefaut(type, E.date);
    history.replaceState(null, '', '#/nouveau/' + type);
    vueEditeur();
  }
  function formulaireClientRapide() {
    feuille('Nouveau client', '<form data-form="client-rapide">' + champ('Nom du client', 'nom', '', { requis: true }) + champ('Téléphone', 'telephone', '', { type: 'tel' }) +
      champ('Adresse', 'adresse', '', { zone: true, lignes: 2 }) + '<button type="submit" class="btn plein large">Ajouter ce client</button></form>');
  }
  function choisirArticle() {
    if (!S.articles.length) {
      feuille('Mes articles', vide('Vous n\'avez pas encore d\'articles. Enregistrez vos produits et services avec leur prix pour les ajouter en un geste.', '#/article/nouveau', 'Ajouter un article'));
      return;
    }
    feuille('Choisir un article', '<div class="recherche"><label class="vh" for="q-choix">Rechercher un article</label><input type="search" id="q-choix" placeholder="Rechercher…"></div><div class="liste" id="choix-articles"></div>', function (el) {
      var lister = function () {
        var q = TF.sansAccents($('#q-choix').value);
        $('#choix-articles').innerHTML = S.articles.filter(function (a) { return TF.sansAccents(a.designation).indexOf(q) >= 0; })
          .sort(function (a, b) { return a.designation.localeCompare(b.designation, 'fr'); })
          .map(function (a) { return '<button type="button" class="ligne-liste" data-action="article-choisi" data-id="' + esc(a.id) + '"><span class="ll-g"><strong>' + esc(a.designation) + '</strong></span><span class="ll-d"><strong>' + f(a.prix) + '</strong><span>' + esc(a.unite || '') + '</span></span></button>'; }).join('');
      };
      el.querySelector('#q-choix').addEventListener('input', lister);
      lister();
    });
  }
  function enregistrerDocument() {
    var d = E, err = $('#erreur-doc');
    var montrer = function (m) { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center' }); };
    d.lignes = d.lignes.filter(function (l) { return String(l.designation || '').trim() || TF.lireNombre(l.pu); });
    if (!d.lignes.length) { d.lignes = [{ designation: '', qte: 1, pu: '', remise: '' }]; rendreLignes(); return montrer('Ajoutez au moins une ligne (produit ou service).'); }
    for (var i = 0; i < d.lignes.length; i++) if (!String(d.lignes[i].designation || '').trim()) { rendreLignes(); return montrer('La ligne ' + (i + 1) + ' n\'a pas de désignation.'); }
    if (!d.client && d.type !== 'recu') return montrer('Choisissez un client (ou « Client de passage »).');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return montrer('Indiquez la date du document.');
    d.lignes = d.lignes.map(function (l) {
      return { designation: String(l.designation).trim(), details: String(l.details || '').trim(), unite: String(l.unite || '').trim(),
        qte: TF.lireNombre(l.qte === '' ? 1 : l.qte), pu: Math.round(TF.lireNombre(l.pu)), remise: Math.min(100, Math.max(0, TF.lireNombre(l.remise))) };
    });
    d.remiseGlobale = TF.lireNombre(d.remiseGlobale); d.tvaTaux = TF.lireNombre(d.tvaTaux);
    if (d.client && !d.client.id) d.client = { id: '', nom: d.client.nom || '' };
    if (!d.client) d.client = { id: '', nom: '' };
    d.objet = String(d.objet || '').trim(); d.notes = String(d.notes || '').trim();
    var ops = [], nouveau = !!d.nouveau, origineDevis = null;
    if (nouveau) {
      if (quotaAtteint()) { proposerComplet('Vous avez atteint la limite de ' + TF.LIMITE_GRATUITE + ' documents ce mois avec la version gratuite.'); return; }
      var annee = d.date.slice(0, 4), cle = TF.TYPES[d.type].prefixe + '-' + annee, seq = seqMax(cle) + 1;
      d.numero = TF.numero(d.type, annee, seq);
      S.compteurs[cle] = seq;
      var m = moisCourant();
      S.creations[m] = (S.creations[m] || 0) + 1;
      d.cree = new Date().toISOString();
      delete d.nouveau;
      ops.push(['kv', S.compteurs, 'compteurs'], ['kv', S.creations, 'creations']);
      if (d.origine && d.origine.id && d.type === 'facture') {
        origineDevis = trouverDoc(d.origine.id);
        if (origineDevis) { origineDevis.statut = 'accepte'; origineDevis.convertiEn = { id: d.id, numero: d.numero }; ops.push(['documents', origineDevis]); }
      }
    }
    if (d.type === 'facture' && TF.totaux(d).reste === 0 && TF.totaux(d).ttc > 0 && d.statut !== 'brouillon') d.statut = 'payee';
    d.modifie = new Date().toISOString();
    ops.push(['documents', d]);
    DB.lot(ops).then(function () {
      var i = -1;
      S.documents.forEach(function (x, k) { if (x.id === d.id) i = k; });
      if (i >= 0) S.documents[i] = d; else S.documents.push(d);
      E = null; Esale = false;
      demanderPersistance();
      toast(nomType(d) + ' ' + d.numero + (nouveau ? ' créé' + (d.type === 'devis' ? '' : 'e') : ' enregistré' + (d.type === 'devis' ? '' : 'e')) + '.');
      location.replace('#/doc/' + d.id);
    }).catch(function (e) { montrer('Enregistrement impossible : ' + (e && e.message || e)); });
  }

  // ---------- Paiements, conversion, duplication ----------
  function formulairePaiement(d) {
    var t = TF.totaux(d);
    feuille('Enregistrer un paiement', '<form data-form="paiement" data-id="' + esc(d.id) + '"><p>Reste à payer : <strong>' + f(t.reste) + '</strong></p>' +
      champ('Montant reçu (F CFA)', 'montant', TF.formatNombre(t.reste, ' '), { mode: 'numeric', requis: true }) + champ('Date', 'date', TF.dateISO(), { type: 'date', requis: true }) +
      '<div class="champ"><label for="c-mode">Mode de paiement</label><select id="c-mode" name="mode">' + MODES.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select></div>' +
      '<p class="erreur" id="erreur-paiement" role="alert" hidden></p><button type="submit" class="btn plein large">Enregistrer le paiement</button></form>');
  }
  function creerRecuDepuis(d, p) {
    if (quotaAtteint()) return proposerComplet('Vous avez atteint la limite de ' + TF.LIMITE_GRATUITE + ' documents ce mois avec la version gratuite.');
    var t = TF.totaux(d);
    p = p || d.paiements[d.paiements.length - 1];
    E = nouveauDocument('recu', { client: d.client, date: p.date || TF.dateISO(), mode: p.mode || 'Espèces', objet: d.objet || '',
      lignes: [{ designation: 'Règlement de la facture ' + d.numero, qte: 1, pu: Math.round(TF.lireNombre(p.montant)), remise: '' }],
      origine: { id: d.id, numero: d.numero, reste: t.reste } });
    Esale = true;
    aller('#/nouveau/recu');
  }
  function convertir(d) {
    if (quotaAtteint()) return proposerComplet('Vous avez atteint la limite de ' + TF.LIMITE_GRATUITE + ' documents ce mois avec la version gratuite.');
    E = nouveauDocument('facture', { client: d.client, objet: d.objet, lignes: JSON.parse(JSON.stringify(d.lignes)), remiseGlobale: d.remiseGlobale, remiseType: d.remiseType,
      tvaActive: d.tvaActive, tvaTaux: d.tvaTaux, origine: { id: d.id, numero: d.numero } });
    Esale = true;
    aller('#/nouveau/facture');
    toast('Vérifiez puis enregistrez la facture.');
  }
  function dupliquer(d) {
    if (quotaAtteint()) return proposerComplet('Vous avez atteint la limite de ' + TF.LIMITE_GRATUITE + ' documents ce mois avec la version gratuite.');
    E = nouveauDocument(d.type, { client: d.client, objet: d.objet, lignes: JSON.parse(JSON.stringify(d.lignes)), remiseGlobale: d.remiseGlobale, remiseType: d.remiseType,
      tvaActive: d.tvaActive, tvaTaux: d.tvaTaux, notes: d.notes, mode: d.mode });
    Esale = true;
    aller('#/nouveau/' + d.type);
  }
  function supprimerDoc(d) {
    confirmer('Supprimer ' + TF.TYPES[d.type].article + ' ' + d.numero + ' ? Cette action est définitive.', 'Supprimer', true).then(function (oui) {
      if (!oui) return;
      var ops = [['-', 'documents', d.id]];
      var annee = d.numero.split('-')[1], cle = TF.TYPES[d.type].prefixe + '-' + annee;
      if (S.compteurs[cle] && d.numero === TF.numero(d.type, annee, S.compteurs[cle])) { S.compteurs[cle]--; ops.push(['kv', S.compteurs, 'compteurs']); }
      S.documents.forEach(function (x) {
        if (x.convertiEn && x.convertiEn.id === d.id) { delete x.convertiEn; ops.push(['documents', x]); }
      });
      DB.lot(ops).then(function () {
        S.documents = S.documents.filter(function (x) { return x.id !== d.id; });
        toast(nomType(d) + ' ' + d.numero + ' supprimé' + (d.type === 'devis' ? '' : 'e') + '.');
        location.replace('#/documents');
      });
    });
  }
  function changerStatut(d, statut) {
    d.statut = statut; d.modifie = new Date().toISOString();
    return DB.mettre('documents', d).then(function () { vueDocument(d.id); });
  }

  // ---------- Clients ----------
  function chiffresClient(id) {
    var r = { ca: 0, reste: 0, docs: [] };
    S.documents.forEach(function (d) {
      if (!d.client || d.client.id !== id) return;
      r.docs.push(d);
      var st = TF.statut(d), t = TF.totaux(d);
      if (st !== 'brouillon' && (d.type === 'facture' || (d.type === 'recu' && !(d.origine && d.origine.id)))) r.ca += t.ttc;
      if (d.type === 'facture' && (st === 'envoyee' || st === 'en_retard')) r.reste += t.reste;
    });
    return r;
  }
  function vueClients() {
    cadre({ titre: 'Clients', nav: 'clients' });
    vue('<div class="recherche"><label class="vh" for="q-clients">Rechercher un client</label><input id="q-clients" type="search" placeholder="Nom, téléphone…"></div>' +
      '<a class="btn plein large" href="#/client-modifier/nouveau">' + ICO.plus + 'Nouveau client</a><div class="liste" id="liste-clients"></div>');
    var lister = function () {
      var q = TF.sansAccents($('#q-clients').value);
      var l = clientsTries().filter(function (c) { return TF.sansAccents(c.nom + ' ' + (c.telephone || '') + ' ' + (c.adresse || '')).indexOf(q) >= 0; });
      $('#liste-clients').innerHTML = l.length ? l.map(function (c) {
        var x = chiffresClient(c.id);
        return '<a class="ligne-liste" href="#/client/' + esc(c.id) + '"><span class="ll-g"><strong>' + esc(c.nom) + '</strong><span>' + esc(c.telephone || c.adresse || '') + '</span></span><span class="ll-d">' +
          (x.reste ? '<strong class="du">' + f(x.reste) + '</strong><span>à encaisser</span>' : '<span>' + x.docs.length + ' doc.</span>') + '</span></a>';
      }).join('') : (S.clients.length ? '<p class="vide">Aucun client ne correspond.</p>' : vide('Ajoutez vos clients pour les retrouver en un geste sur vos factures.'));
    };
    $('#q-clients').addEventListener('input', lister);
    lister();
  }
  function vueClient(id) {
    var c = S.clients.filter(function (x) { return x.id === id; })[0];
    if (!c) { location.replace('#/clients'); return; }
    var x = chiffresClient(id);
    cadre({ titre: c.nom, retour: '#/clients', nav: 'clients' });
    vue('<section class="carte fiche"><h1>' + esc(c.nom) + '</h1>' + (c.telephone ? '<p>Tél. <a href="tel:' + esc(c.telephone.replace(/\s/g, '')) + '">' + esc(c.telephone) + '</a></p>' : '') +
      (c.email ? '<p>' + esc(c.email) + '</p>' : '') + (c.adresse ? '<p>' + nl2br(c.adresse) + '</p>' : '') + (c.ninea ? '<p>NINEA : ' + esc(c.ninea) + '</p>' : '') + (c.notes ? '<p class="petit">' + nl2br(c.notes) + '</p>' : '') +
      '</section><section class="kpis"><div class="kpi"><span>Chiffre d\'affaires</span><strong>' + f(x.ca) + '</strong></div><div class="kpi' + (x.reste ? ' alerte' : '') + '"><span>Reste à encaisser</span><strong>' + f(x.reste) + '</strong></div></section>' +
      '<div class="rang-btn"><a class="btn plein" href="#/nouveau/facture?client=' + esc(c.id) + '">' + ICO.doc + 'Facture</a><a class="btn sec" href="#/nouveau/devis?client=' + esc(c.id) + '">' + ICO.devis + 'Devis</a>' +
      '<a class="btn sec" href="#/client-modifier/' + esc(c.id) + '">' + ICO.modifier + 'Modifier</a></div>' +
      '<section class="carte"><h2>Documents</h2>' + (x.docs.length ? '<div class="liste">' + trierDocs(x.docs).map(ligneDoc).join('') + '</div>' : '<p class="petit">Aucun document pour ce client.</p>') + '</section>' +
      '<button type="button" class="btn-action danger" data-action="client-suppr" data-id="' + esc(c.id) + '">' + ICO.supprimer + '<span>Supprimer ce client</span></button>');
  }
  function vueClientForm(id) {
    var c = id === 'nouveau' ? {} : S.clients.filter(function (x) { return x.id === id; })[0];
    if (!c) { location.replace('#/clients'); return; }
    cadre({ titre: id === 'nouveau' ? 'Nouveau client' : 'Modifier le client', retour: id === 'nouveau' ? '#/clients' : '#/client/' + id, nav: 'clients' });
    vue('<form class="carte" data-form="client" data-id="' + esc(id) + '">' + champ('Nom ou raison sociale', 'nom', c.nom || '', { requis: true }) + champ('Téléphone', 'telephone', c.telephone || '', { type: 'tel' }) +
      champ('E-mail', 'email', c.email || '', { type: 'email' }) + champ('Adresse', 'adresse', c.adresse || '', { zone: true, lignes: 2 }) + champ('NINEA (facultatif)', 'ninea', c.ninea || '') +
      champ('Notes (non imprimées)', 'notes', c.notes || '', { zone: true, lignes: 2 }) + '<button type="submit" class="btn plein large">Enregistrer</button></form>');
  }
  function enregistrerClient(form, rapide) {
    var v = valeurs(form);
    if (!v.nom) { form.querySelector('[name=nom]').focus(); toast('Indiquez le nom du client.'); return; }
    var id = rapide ? 'nouveau' : form.dataset.id;
    var c = id === 'nouveau' ? { id: TF.nouvelId(), cree: new Date().toISOString() } : S.clients.filter(function (x) { return x.id === id; })[0];
    ['nom', 'telephone', 'email', 'adresse', 'ninea', 'notes'].forEach(function (k) { if (v[k] !== undefined) c[k] = v[k]; });
    DB.mettre('clients', c).then(function () {
      if (id === 'nouveau') S.clients.push(c);
      demanderPersistance();
      if (rapide && E) {
        E.client = instantane(c); fermerFeuille();
        var sel = $('#e-client'); if (sel) { sel.innerHTML = optionsClients(); $('#bloc-passage').hidden = true; }
        toast('Client ajouté.');
      } else { toast('Client enregistré.'); location.replace('#/client/' + c.id); }
    });
  }

  // ---------- Articles ----------
  function vueArticles() {
    cadre({ titre: 'Articles et services', nav: 'articles' });
    vue('<div class="recherche"><label class="vh" for="q-articles">Rechercher un article</label><input id="q-articles" type="search" placeholder="Rechercher un produit ou un service…"></div>' +
      '<a class="btn plein large" href="#/article/nouveau">' + ICO.plus + 'Nouvel article</a><div class="liste" id="liste-articles-v"></div>');
    var lister = function () {
      var q = TF.sansAccents($('#q-articles').value);
      var l = S.articles.filter(function (a) { return TF.sansAccents(a.designation + ' ' + (a.details || '')).indexOf(q) >= 0; }).sort(function (a, b) { return a.designation.localeCompare(b.designation, 'fr'); });
      $('#liste-articles-v').innerHTML = l.length ? l.map(function (a) {
        return '<a class="ligne-liste" href="#/article/' + esc(a.id) + '"><span class="ll-g"><strong>' + esc(a.designation) + '</strong><span>' + esc(a.details || '') + '</span></span><span class="ll-d"><strong>' + f(a.prix) + '</strong><span>' + esc(a.unite ? 'par ' + a.unite : '') + '</span></span></a>';
      }).join('') : (S.articles.length ? '<p class="vide">Aucun article ne correspond.</p>' : vide('Enregistrez vos produits et services avec leur prix : vous les ajouterez à vos factures en un geste.'));
    };
    $('#q-articles').addEventListener('input', lister);
    lister();
  }
  function vueArticleForm(id) {
    var a = id === 'nouveau' ? {} : S.articles.filter(function (x) { return x.id === id; })[0];
    if (!a) { location.replace('#/articles'); return; }
    cadre({ titre: id === 'nouveau' ? 'Nouvel article' : 'Modifier l\'article', retour: '#/articles', nav: 'articles' });
    vue('<form class="carte" data-form="article" data-id="' + esc(id) + '">' + champ('Désignation', 'designation', a.designation || '', { requis: true, place: 'Ex. : Sac de ciment 50 kg, Coupe homme, Plat thiéboudiène' }) +
      '<div class="grille2">' + champ('Prix unitaire (F CFA)', 'prix', a.prix !== undefined ? TF.formatNombre(a.prix, ' ') : '', { mode: 'numeric', requis: true }) + champ('Unité', 'unite', a.unite || '', { liste: 'liste-unites-a', place: 'pièce, m², jour…' }) + '</div>' +
      champ('Détails (facultatif)', 'details', a.details || '', { zone: true, lignes: 2 }) + '<datalist id="liste-unites-a">' + UNITES.map(function (u) { return '<option value="' + esc(u) + '">'; }).join('') + '</datalist>' +
      '<button type="submit" class="btn plein large">Enregistrer</button>' + (id !== 'nouveau' ? '<button type="button" class="btn-action danger" data-action="article-suppr" data-id="' + esc(id) + '">' + ICO.supprimer + '<span>Supprimer cet article</span></button>' : '') + '</form>');
  }

  // ---------- Réglages ----------
  var invite = null;
  function estInstallee() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function majInstall() { var b = $('#installer'); if (b) b.hidden = estInstallee() || !(invite || estIOS()); }
  function bandeauInstall() {
    if (estInstallee() || (!invite && !estIOS())) return '';
    return '<div class="bandeau-install"><img src="icons/icon-192.png" alt="" width="40" height="40"><p><b>Installez l\'application</b><span>Accès en un geste, même sans Internet.</span></p>' +
      '<button type="button" class="btn plein" data-action="installer">Installer</button></div>';
  }
  function instructionsInstall() {
    if (estIOS()) return '<ol class="etapes"><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez le bouton <b>Partager</b> (carré avec une flèche vers le haut).</li><li>Choisissez <b>« Sur l\'écran d\'accueil »</b>, puis <b>Ajouter</b>.</li></ol>';
    return '<ol class="etapes"><li>Ouvrez cette page dans <b>Chrome</b>.</li><li>Touchez le menu <b>⋮</b> en haut à droite.</li><li>Choisissez <b>« Installer l\'application »</b> ou <b>« Ajouter à l\'écran d\'accueil »</b>.</li></ol>';
  }
  function vueReglages() {
    cadre({ titre: 'Réglages', nav: 'reglages' });
    var theme = lireTheme();
    var h = '<section class="carte statut-version ' + (complet() ? 'ok' : '') + '"><div><small>Votre version</small><strong>' + (complet() ? 'Version complète' : 'Version gratuite') + '</strong>' +
      (complet() ? '<span>Licence à vie active</span>' : '<span>' + creesCeMois() + ' / ' + TF.LIMITE_GRATUITE + ' documents ce mois</span>') + '</div><a class="btn ' + (complet() ? 'sec' : 'plein') + '" href="#/licence">' + (complet() ? 'Détails' : 'Passer à la version complète') + '</a></section>';
    h += '<nav class="menu" aria-label="Réglages">' +
      lienMenu('#/profil', ICO.boutique, 'Mon entreprise', 'Nom, logo, adresse, NINEA, paiement Wave') +
      lienMenu('#/modeles', ICO.palette, 'Modèles et documents', 'Modèle du PDF, TVA, délais, mentions') +
      lienMenu('#/sauvegarde', ICO.sauvegarde, 'Sauvegarde', S.sauvegarde ? 'Dernière : ' + TF.dateFr(S.sauvegarde.slice(0, 10)) : 'Aucune sauvegarde pour l\'instant') +
      lienMenu('#/licence', ICO.etoile, 'Version complète', complet() ? 'Activée' : PRIX + ', licence à vie') + '</nav>';
    h += '<section class="carte"><h2>Apparence</h2><div class="champ"><label for="theme">Thème</label><select id="theme"><option value="auto"' + (theme === 'auto' ? ' selected' : '') +
      '>Automatique (comme le téléphone)</option><option value="clair"' + (theme === 'clair' ? ' selected' : '') + '>Clair</option><option value="sombre"' + (theme === 'sombre' ? ' selected' : '') + '>Sombre</option></select></div></section>';
    h += '<section class="carte"><h2>Installer l\'application</h2>' + (estInstallee() ? '<p>' + ICO.ok + ' L\'application est installée sur ce téléphone.</p>' :
      (invite ? '<button type="button" class="btn plein large" data-action="installer">' + ICO.installer + 'Installer l\'application</button>' : instructionsInstall())) + '</section>';
    h += '<section class="carte"><h2>Confidentialité</h2><p>Vos clients, articles et documents sont enregistrés <b>uniquement sur ce téléphone</b>. Rien n\'est envoyé sur Internet. ' +
      'La seule connexion sert à vérifier votre licence (une fois, puis au plus une fois par mois).</p><p class="petit">Faites des sauvegardes régulières : si vous effacez les données du navigateur ou changez de téléphone, seules vos sauvegardes permettent de tout retrouver.</p></section>';
    h += '<section class="carte"><h2>À propos</h2><p>Teranga Factures, version ' + VERSION + '.</p><p class="petit">Bibliothèques libres incluses : jsPDF et jsPDF-AutoTable (MIT), qrcode-generator (MIT), SheetJS Community Edition (Apache 2.0). <a href="vendor/LISEZMOI.txt">Détails et licences</a>.</p>' +
      '<p class="petit"><a href="../">Toutes nos applications</a> · <a href="../../boutique/">Boutique Teranga Outils</a></p></section>';
    vue(h);
    $('#theme').addEventListener('change', function () { appliquerTheme(this.value); });
  }
  function lienMenu(href, ico, titre, sous) {
    return '<a class="menu-lien" href="' + href + '">' + ico + '<span><strong>' + esc(titre) + '</strong><small>' + esc(sous) + '</small></span>' + ICO.chevron + '</a>';
  }
  function lireTheme() { try { return localStorage.getItem('tf-theme') || 'auto'; } catch (e) { return 'auto'; } }
  function appliquerTheme(v) {
    try { localStorage.setItem('tf-theme', v); } catch (e) {}
    var r = document.documentElement;
    if (v === 'clair') r.setAttribute('data-theme', 'light'); else if (v === 'sombre') r.setAttribute('data-theme', 'dark'); else r.removeAttribute('data-theme');
  }

  function vueProfil() {
    var P = S.profil;
    cadre({ titre: 'Mon entreprise', retour: '#/reglages', nav: 'reglages' });
    vue('<form class="carte" data-form="profil"><h2>Identité</h2>' + champ('Nom de l\'entreprise', 'nom', P.nom || '', { requis: true, auto: 'organization' }) +
      champ('Activité', 'activite', P.activite || '', { place: 'Ex. : Couture homme et femme, Bâtiment et travaux publics…' }) +
      '<div class="champ"><span class="label">Logo</span><div class="image-choix" id="logo-zone">' + zoneImage('logo', P.logo, 'Ajouter mon logo') + '</div></div>' +
      '<h2>Coordonnées</h2>' + champ('Adresse', 'adresse', P.adresse || '', { zone: true, lignes: 2 }) + champ('Ville', 'ville', P.ville || '') +
      champ('Téléphone', 'telephone', P.telephone || '', { type: 'tel', auto: 'tel', aide: 'Facultatif : affiché sur vos documents seulement si vous le remplissez.' }) +
      champ('E-mail', 'email', P.email || '', { type: 'email', auto: 'email' }) +
      '<h2>Mentions légales</h2>' + champ('NINEA', 'ninea', P.ninea || '', { aide: 'Facultatif.' }) + champ('Registre du commerce (RC)', 'rc', P.rc || '', { aide: 'Facultatif.' }) +
      champ('Autre mention', 'autres', P.autres || '', { place: 'Ex. : Compte bancaire, agrément…' }) +
      '<h2>Paiement</h2>' + champ('Moyens de paiement acceptés', 'paiement', P.paiement || '', { zone: true, lignes: 2, place: 'Ex. : Wave et Orange Money acceptés. Espèces à la livraison.', aide: 'Imprimé sous la rubrique « Paiement ». Ajoutez votre numéro Wave ou Orange Money si vous le souhaitez.' }) +
      champ('Lien de paiement Wave (facultatif)', 'lienWave', P.lienWave || '', { type: 'url', place: 'https://pay.wave.com/…', aide: 'Si vous avez un lien de paiement Wave, un QR code « Payer par Wave » est ajouté aux factures et devis.' }) +
      '<p class="erreur" id="erreur-profil" role="alert" hidden></p>' +
      '<h2>Signature et cachet ' + verrou() + '</h2><div class="champ"><div class="image-choix" id="signature-zone">' + (complet() ? zoneImage('signature', P.signature, 'Ajouter ma signature ou mon cachet') :
        '<p class="petit">Ajoutez la photo de votre signature ou de votre cachet sur vos PDF avec la version complète. <a href="#/licence">En savoir plus</a></p>') + '</div>' +
      (complet() ? '<small>Astuce : photographiez votre signature sur une feuille blanche ; le fond blanc devient transparent.</small>' : '') + '</div>' +
      '<div class="barre-enreg"><span></span><button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>');
  }
  function zoneImage(cle, src, libelle) {
    return (src ? '<img src="' + esc(src) + '" alt="' + (cle === 'logo' ? 'Votre logo' : 'Votre signature') + '"><button type="button" class="btn sec" data-action="image-retirer" data-cle="' + cle + '">Retirer</button>' : '') +
      '<label class="btn sec" for="f-' + cle + '">' + esc(src ? 'Changer' : libelle) + '</label><input type="file" id="f-' + cle + '" class="vh" accept="image/*" data-image="' + cle + '">';
  }
  function lireImage(fichier, max, fondTransparent) {
    return new Promise(function (ok, ko) {
      if (!fichier || !/^image\//.test(fichier.type || 'image/')) return ko(new Error('Choisissez une image (JPEG ou PNG).'));
      var url = URL.createObjectURL(fichier), img = new Image();
      img.onload = function () {
        var k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        var x = c.getContext('2d');
        x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var data = x.getImageData(0, 0, c.width, c.height), p = data.data, alpha = false, i;
        if (fondTransparent) {
          for (i = 0; i < p.length; i += 4) if (p[i] > 215 && p[i + 1] > 215 && p[i + 2] > 215) p[i + 3] = 0;
          x.putImageData(data, 0, 0); alpha = true;
        } else for (i = 3; i < p.length; i += 4) if (p[i] < 250) { alpha = true; break; }
        ok(alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('Image illisible. Choisissez une photo JPEG ou PNG.')); };
      img.src = url;
    });
  }

  function vueModeles() {
    var R = S.reglages, actuel = complet() ? R.modele : 'classique';
    cadre({ titre: 'Modèles et documents', retour: '#/reglages', nav: 'reglages' });
    var h = '<form data-form="modeles"><section class="carte"><h2>Modèle du PDF</h2><div class="modeles">' + MODELES.map(function (m) {
      var bloque = !complet() && m[0] !== 'classique';
      return '<div class="modele-carte"><label class="modele"><input type="radio" name="modele" value="' + m[0] + '"' + (actuel === m[0] ? ' checked' : '') + (bloque ? ' disabled' : '') + '>' +
        '<span class="mini mini-' + m[0] + '" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="modele-t"><strong>' + m[1] + (bloque ? verrou() : '') + '</strong><small>' + m[2] + '</small></span></label>' +
        '<button type="button" class="lien-btn" data-action="exemple" data-modele="' + m[0] + '">Voir un exemple PDF</button></div>';
    }).join('') + '</div>' + (complet() ? '' : '<p class="petit">Les modèles Moderne et Afrique font partie de la <a href="#/licence">version complète</a>.</p>') + '</section>';
    h += '<section class="carte"><h2>Couleur ' + verrou() + '</h2><div class="couleurs" role="radiogroup" aria-label="Couleur principale">' + COULEURS.map(function (c) {
      return '<label class="couleur"><input type="radio" name="couleur" value="' + c[0] + '"' + (R.couleur === c[0] ? ' checked' : '') + (complet() ? '' : ' disabled') + '><span style="background:' + c[0] + '"></span><small>' + c[1] + '</small></label>';
    }).join('') + '</div><p class="petit">Utilisée par les modèles Moderne et Afrique.</p></section>';
    h += '<section class="carte"><h2>TVA</h2><label class="interrupteur"><input type="checkbox" name="tvaDefaut"' + (R.tvaDefaut ? ' checked' : '') + '><span>Appliquer la TVA par défaut sur les nouveaux documents</span></label>' +
      champ('Taux de TVA par défaut (%)', 'tvaTaux', TF.formatQuantite(R.tvaTaux), { mode: 'decimal' }) + '</section>';
    h += '<section class="carte"><h2>Délais</h2><div class="grille2">' + champ('Échéance des factures (jours)', 'echeanceJours', String(R.echeanceJours), { mode: 'numeric', aide: '0 = paiement à réception' }) +
      champ('Validité des devis (jours)', 'validiteJours', String(R.validiteJours), { mode: 'numeric' }) + '</div></section>';
    h += '<section class="carte"><h2>Mentions par défaut</h2>' + champ('Factures', 'notesFacture', R.notesFacture, { zone: true, lignes: 2, place: 'Ex. : Paiement à réception de facture.' }) +
      champ('Devis et proformas', 'notesDevis', R.notesDevis, { zone: true, lignes: 2, place: 'Ex. : Acompte de 50 % à la commande.' }) + champ('Reçus', 'notesRecu', R.notesRecu, { zone: true, lignes: 2 }) + '</section>';
    h += '<div class="barre-enreg"><span></span><button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>';
    vue(h);
  }
  function exemplePDF(modele) {
    var P = S.profil.nom ? S.profil : { nom: 'Votre entreprise', activite: 'Votre activité', adresse: 'Votre adresse', ville: 'Dakar' };
    var d = { type: 'facture', numero: 'FA-' + TF.dateISO().slice(0, 4) + '-0001', date: TF.dateISO(), echeance: TF.ajouterJours(TF.dateISO(), 30), objet: 'Exemple de facture',
      client: { nom: 'Client exemple', adresse: 'Quartier, ville' }, lignes: [{ designation: 'Produit ou service A', qte: 2, pu: 15000 }, { designation: 'Produit ou service B', qte: 1, unite: 'forfait', pu: 45000, remise: 10 },
        { designation: 'Livraison', qte: 1, pu: 2500 }], notes: 'Ceci est un exemple.', paiements: [] };
    toast('Préparation de l\'exemple…');
    TF_PDF.generer(d, { profil: P, reglages: S.reglages, complet: complet(), modele: modele, exemple: true, filigrane: true }).then(function (r) {
      telecharger(r.blob, 'Exemple-' + modele + '.pdf'); toast('Exemple enregistré dans vos téléchargements.');
    }).catch(function (e) { toast(e.message); });
  }

  // ---------- Licence ----------
  function vueLicence(_, params) {
    cadre({ titre: 'Version complète', retour: S.profil.nom ? '#/reglages' : '#/bienvenue', nav: 'reglages' });
    var L = S.licence, pre = params.get('code') || '';
    var h = '';
    if (L) {
      h += '<section class="carte statut-version ok"><div><small>Licence à vie</small><strong>Version complète activée</strong><span>Depuis le ' + esc(TF.dateFr((L.activeLe || '').slice(0, 10))) + ' · commande <span class="insecable">' +
        esc(L.commande) + '</span></span></div></section><ul class="atouts">' + avantages() + '</ul><div class="rang-btn pile"><a class="btn plein" href="#/modeles">' + ICO.palette + 'Choisir mon modèle de PDF</a><a class="btn sec" href="#/profil">' + ICO.modifier + 'Ajouter ma signature ou mon cachet</a></div><p class="petit">Gardez le lien de votre commande : il permet d\'activer aussi l\'application sur un nouveau téléphone.</p>';
    } else {
      h += '<section class="carte offre"><h1>Passez à la version complète</h1><ul class="atouts">' + avantages() + '</ul><p class="prix">' + PRIX + ' <small>une seule fois, licence à vie</small></p>' +
        '<a class="btn plein large" href="' + URL_ACHAT + '" target="_blank" rel="noopener">' + ICO.boutique + 'Acheter la licence (Wave)</a></section>';
      h += '<form class="carte" data-form="licence"><h2>Activer ma licence</h2><ol class="etapes"><li>Achetez « Licence Teranga Factures » dans la boutique et payez par Wave.</li>' +
        '<li>Sur la page de votre commande payée, copiez le lien de la page (ou le code TCV-… et son jeton).</li><li>Collez-le ci-dessous puis touchez « Activer ».</li></ol>' +
        '<div class="champ"><label for="c-code">Lien de votre commande</label><textarea id="c-code" name="code" rows="3" placeholder="https://…/boutique/commande.html?o=TCV-…&amp;t=…" autocomplete="off" autocapitalize="off" spellcheck="false">' + esc(pre) + '</textarea></div>' +
        '<p class="msg" id="msg-licence" role="status" aria-live="polite"></p><button type="submit" class="btn plein large" id="btn-activer">' + ICO.etoile + 'Activer</button>' +
        '<p class="petit">Une connexion Internet est nécessaire une seule fois pour l\'activation. Ensuite l\'application fonctionne hors ligne.</p></form>';
    }
    vue(h);
    if (pre && !L) activer(pre);
  }
  function avantages() {
    return ['Documents illimités (gratuit : ' + TF.LIMITE_GRATUITE + ' par mois)', '3 modèles : Classique, Moderne, Afrique', 'Signature et cachet sur vos PDF', 'Export Excel du tableau de bord', 'Plus de mention « Créé avec Teranga Factures »']
      .map(function (x) { return '<li>' + ICO.ok + esc(x) + '</li>'; }).join('');
  }
  function urlLicence(c) { return API_LICENCE + encodeURIComponent(c.id) + '?t=' + encodeURIComponent(c.jeton); }
  function activer(texte) {
    var msg = $('#msg-licence'), btn = $('#btn-activer');
    var dire = function (m, erreur) { if (msg) { msg.textContent = m; msg.classList.toggle('erreur', !!erreur); } };
    var c = TF.lireLienCommande(texte);
    if (!c) return dire('Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « TCV- »).', true);
    if (navigator.onLine === false) return dire('Vous êtes hors ligne. Connectez-vous à Internet une fois pour activer.', true);
    dire('Vérification de votre commande…');
    if (btn) btn.disabled = true;
    fetch(urlLicence(c), { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (r.status === 404) throw { m: 'Commande introuvable. Vérifiez que vous avez copié le lien complet.' };
      if (!r.ok) throw { m: 'Le service de vérification ne répond pas. Réessayez dans un instant.' };
      return r.json();
    }).then(function (j) {
      var v = TF.verifierReponseLicence(j);
      if (!v.ok) {
        if (v.raison === 'impayee') throw { m: 'Le paiement de cette commande n\'est pas encore confirmé. Terminez le paiement Wave, attendez la confirmation, puis réessayez.' };
        if (v.raison === 'produit') throw { m: 'Ce lien correspond à un autre achat' + (v.titre ? ' (« ' + v.titre + ' »)' : '') + '. Il faut le lien de la commande « Licence Teranga Factures ».' };
        throw { m: 'Commande introuvable.' };
      }
      var maintenant = new Date().toISOString();
      S.licence = { commande: c.id, jeton: c.jeton, activeLe: maintenant, verifieLe: maintenant };
      return DB.mettre('kv', S.licence, 'licence').then(function () {
        toast('Version complète activée. Merci !');
        demanderPersistance();
        vueLicence(null, new URLSearchParams());
      });
    }).catch(function (e) {
      if (btn) btn.disabled = false;
      dire(e && e.m ? e.m : 'Pas de connexion au service. Vérifiez Internet et réessayez.', true);
    });
  }
  // Vérification de routine : au plus une fois par mois, seulement en ligne ; hors ligne ou panne : la licence reste active.
  function reverifierLicence() {
    var L = S.licence;
    if (!L || navigator.onLine === false) return;
    if (L.verifieLe && Date.now() - Date.parse(L.verifieLe) < MOIS_MS) return;
    fetch(urlLicence({ id: L.commande, jeton: L.jeton }), { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (r.status === 404 || r.ok) return r.status === 404 ? null : r.json();
      throw new Error('indisponible');
    }).then(function (j) {
      if (j) {
        var v = TF.verifierReponseLicence(j);
        if (!v.ok && (v.raison === 'impayee' || v.raison === 'produit')) {
          S.licence = null;
          return DB.effacer('kv', 'licence').then(function () { toast('Licence non valable : la version gratuite est rétablie.'); router(); });
        }
      }
      L.verifieLe = new Date().toISOString();
      return DB.mettre('kv', L, 'licence');
    }).catch(function () { /* hors ligne ou service indisponible : on garde la licence */ });
  }

  // ---------- Sauvegarde ----------
  function vueSauvegarde() {
    cadre({ titre: 'Sauvegarde', retour: S.profil.nom ? '#/reglages' : '#/bienvenue', nav: 'reglages' });
    vue('<section class="carte"><h2>Sauvegarder mes données</h2><p>Téléchargez un fichier avec tous vos clients, articles et documents. Envoyez-le-vous sur WhatsApp ou gardez-le sur Google Drive.</p>' +
      '<p class="petit">' + (S.sauvegarde ? 'Dernière sauvegarde : ' + esc(TF.dateFr(S.sauvegarde.slice(0, 10))) : 'Aucune sauvegarde pour l\'instant.') + '</p>' +
      '<button type="button" class="btn plein large" data-action="exporter-json">' + ICO.telecharger + 'Télécharger la sauvegarde</button></section>' +
      '<section class="carte"><h2>Restaurer une sauvegarde</h2><p>Remplace toutes les données de ce téléphone par celles du fichier choisi.</p>' +
      '<label class="btn sec large" for="f-import">' + ICO.sauvegarde + 'Choisir le fichier de sauvegarde</label><input type="file" id="f-import" class="vh" accept=".json,application/json"></section>' +
      '<section class="carte"><h2>Effacer toutes les données</h2><p class="petit">Supprime le profil, les clients, les articles et les documents de ce téléphone. La licence reste active.</p>' +
      '<button type="button" class="btn danger" data-action="tout-effacer">' + ICO.supprimer + 'Tout effacer</button></section>');
  }
  function exporterJSON() {
    var data = { application: 'teranga-factures', format: 1, exporte: new Date().toISOString(),
      kv: { profil: S.profil, reglages: S.reglages, compteurs: S.compteurs }, clients: S.clients, articles: S.articles, documents: S.documents };
    var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    telecharger(blob, 'teranga-factures-sauvegarde-' + TF.dateISO() + '.json');
    S.sauvegarde = new Date().toISOString();
    DB.mettre('kv', S.sauvegarde, 'sauvegarde').then(function () { toast('Sauvegarde téléchargée.'); if (location.hash === '#/sauvegarde') vueSauvegarde(); });
  }
  function importerJSON(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var data;
      try { data = JSON.parse(lecteur.result); } catch (e) { return toast('Fichier illisible : ce n\'est pas une sauvegarde Teranga Factures.'); }
      if (!data || data.application !== 'teranga-factures' || !Array.isArray(data.documents) || !Array.isArray(data.clients) || !Array.isArray(data.articles) || !data.kv) {
        return toast('Ce fichier n\'est pas une sauvegarde Teranga Factures.');
      }
      confirmer('Remplacer toutes les données de ce téléphone par la sauvegarde du ' + TF.dateFr(String(data.exporte || '').slice(0, 10)) + ' (' + data.documents.length + ' documents, ' + data.clients.length + ' clients) ?', 'Restaurer', true)
        .then(function (oui) {
          if (!oui) return;
          var kv = { profil: data.kv.profil || {}, reglages: data.kv.reglages || {}, compteurs: data.kv.compteurs || {} };
          DB.remplacer({ kv: kv, clients: data.clients, articles: data.articles, documents: data.documents }, ['licence', 'creations']).then(charger).then(function () {
            toast('Sauvegarde restaurée.'); aller('#/');
          }).catch(function (e) { toast('Restauration impossible : ' + (e && e.message || e)); });
        });
    };
    lecteur.readAsText(fichier);
  }

  // ---------- Export Excel (version complète) ----------
  function exporterExcel() {
    if (!complet()) return proposerComplet('L\'export Excel du tableau de bord fait partie de la version complète.');
    toast('Préparation du fichier Excel…');
    chargerScript('vendor/xlsx.mini.min.js').then(function () {
      var X = window.XLSX, wb = X.utils.book_new(), auj = TF.dateISO();
      var docs = trierDocs(S.documents);
      var a1 = [['Type', 'Numéro', 'Date', 'Échéance', 'Client', 'Statut', 'Total HT', 'TVA', 'Total TTC', 'Payé', 'Reste à payer']];
      docs.forEach(function (d) {
        var t = TF.totaux(d);
        a1.push([nomType(d), d.numero, d.date, d.echeance || '', (d.client && d.client.nom) || '', TF.libelleStatut(d, TF.statut(d, auj)), t.ht, t.tva, t.ttc, d.type === 'facture' || d.type === 'recu' ? t.paye : '', d.type === 'facture' ? t.reste : '']);
      });
      var a2 = [['Numéro', 'Date', 'Client', 'Désignation', 'Quantité', 'Unité', 'Prix unitaire', 'Remise %', 'Montant']];
      docs.forEach(function (d) { (d.lignes || []).forEach(function (l) { a2.push([d.numero, d.date, (d.client && d.client.nom) || '', l.designation, TF.lireNombre(l.qte), l.unite || '', TF.lireNombre(l.pu), TF.lireNombre(l.remise), TF.montantLigne(l)]); }); });
      var a3 = [['Client', 'Téléphone', 'Chiffre d\'affaires', 'Reste à encaisser']];
      clientsTries().forEach(function (c) { var x = chiffresClient(c.id); a3.push([c.nom, c.telephone || '', x.ca, x.reste]); });
      var st = stats(), a4 = [['Mois', 'Chiffre d\'affaires']];
      derniersMois(12).forEach(function (m) { a4.push([TF.moisFr(m), st.parMois[m] || 0]); });
      a4.push([], ['Impayés', st.impayes], ['Devis en attente', st.devis]);
      [[a4, 'Synthèse', [22, 18]], [a1, 'Documents', [14, 16, 12, 12, 28, 12, 14, 12, 14, 12, 14]], [a2, 'Lignes', [16, 12, 24, 36, 10, 10, 14, 10, 14]], [a3, 'Clients', [28, 16, 18, 18]]].forEach(function (s) {
        var ws = X.utils.aoa_to_sheet(s[0]);
        ws['!cols'] = s[2].map(function (w) { return { wch: w }; });
        X.utils.book_append_sheet(wb, ws, s[1]);
      });
      X.writeFile(wb, 'teranga-factures-' + auj + '.xlsx', { compression: true });
      toast('Fichier Excel enregistré.');
    }).catch(function (e) { toast(e.message); });
  }

  // ---------- Actions (délégation) ----------
  var ACTIONS = {
    'retour': function (b) { if (pileNav > 0) history.back(); else location.hash = b.dataset.vers || '#/'; },
    'nouveau-menu': function () {
      feuille('Créer un document', '<div class="choix-types">' + [['facture', ICO.doc, 'Facture', 'Pour demander le paiement'], ['devis', ICO.devis, 'Devis', 'Proposition de prix avant travaux'],
        ['proforma', ICO.devis, 'Facture proforma', 'Devis au format facture'], ['recu', ICO.recu, 'Reçu', 'Preuve d\'un paiement reçu']].map(function (t) {
        return '<a class="choix-type" href="#/nouveau/' + t[0] + '">' + t[1] + '<span><strong>' + t[2] + '</strong><small>' + t[3] + '</small></span></a>';
      }).join('') + '</div>');
    },
    'filtre-type': function (b) { filtres.type = b.dataset.v; listerDocs(); },
    'partager': function (b) { actionPDF(b.dataset.id, true); },
    'pdf': function (b) { actionPDF(b.dataset.id, false); },
    'copier-message': function (b) {
      var d = trouverDoc(b.dataset.id); if (!d) return;
      (navigator.clipboard ? navigator.clipboard.writeText(messageWA(d)) : Promise.reject()).then(function () { toast('Message copié.'); }).catch(function () { toast('Copie impossible sur ce téléphone.'); });
    },
    'doc-editer': function (b) { aller('#/editer/' + b.dataset.id); },
    'doc-envoye': function (b) { var d = trouverDoc(b.dataset.id); if (d) changerStatut(d, 'envoyee'); },
    'doc-accepte': function (b) { var d = trouverDoc(b.dataset.id); if (d) changerStatut(d, 'accepte'); },
    'doc-refuse': function (b) { var d = trouverDoc(b.dataset.id); if (d) changerStatut(d, 'refuse'); },
    'doc-paiement': function (b) { var d = trouverDoc(b.dataset.id); if (d) formulairePaiement(d); },
    'doc-convertir': function (b) { var d = trouverDoc(b.dataset.id); if (d) convertir(d); },
    'doc-recu-depuis': function (b) { var d = trouverDoc(b.dataset.id); if (d) creerRecuDepuis(d); },
    'doc-dupliquer': function (b) { var d = trouverDoc(b.dataset.id); if (d) dupliquer(d); },
    'doc-supprimer': function (b) { var d = trouverDoc(b.dataset.id); if (d) supprimerDoc(d); },
    'paiement-suppr': function (b) {
      var d = trouverDoc(b.dataset.id); if (!d) return;
      confirmer('Supprimer ce paiement ?', 'Supprimer', true).then(function (oui) {
        if (!oui) return;
        d.paiements.splice(+b.dataset.i, 1);
        if (d.statut === 'payee') d.statut = 'envoyee';
        DB.mettre('documents', d).then(function () { vueDocument(d.id); });
      });
    },
    'echeance': function (b) {
      E.echeance = TF.ajouterJours(E.date, +b.dataset.j); Esale = true;
      $('#e-echeance').value = E.echeance;
    },
    'ligne-ajout': function () {
      E.lignes.push({ designation: '', qte: 1, pu: '', remise: '' }); Esale = true; rendreLignes(); majTotaux();
      var l = $$('#lignes .ligne'); l[l.length - 1].querySelector('input').focus();
    },
    'ligne-suppr': function (b) { E.lignes.splice(+b.dataset.i, 1); Esale = true; rendreLignes(); majTotaux(); },
    'ligne-article': function () { choisirArticle(); },
    'article-choisi': function (b) {
      var a = S.articles.filter(function (x) { return x.id === b.dataset.id; })[0]; if (!a) return;
      var l = { designation: a.designation, qte: 1, pu: a.prix, remise: '', unite: a.unite || '', details: a.details || '' };
      var vides = E.lignes.length === 1 && !E.lignes[0].designation && !TF.lireNombre(E.lignes[0].pu);
      if (vides) E.lignes[0] = l; else E.lignes.push(l);
      Esale = true; fermerFeuille(); rendreLignes(); majTotaux(); toast(a.designation + ' ajouté.');
    },
    'client-suppr': function (b) {
      var c = S.clients.filter(function (x) { return x.id === b.dataset.id; })[0]; if (!c) return;
      confirmer('Supprimer le client « ' + c.nom + ' » ? Ses documents sont conservés.', 'Supprimer', true).then(function (oui) {
        if (!oui) return;
        DB.effacer('clients', c.id).then(function () { S.clients = S.clients.filter(function (x) { return x.id !== c.id; }); toast('Client supprimé.'); location.replace('#/clients'); });
      });
    },
    'article-suppr': function (b) {
      confirmer('Supprimer cet article ?', 'Supprimer', true).then(function (oui) {
        if (!oui) return;
        DB.effacer('articles', b.dataset.id).then(function () { S.articles = S.articles.filter(function (x) { return x.id !== b.dataset.id; }); toast('Article supprimé.'); location.replace('#/articles'); });
      });
    },
    'image-retirer': function (b) {
      delete S.profil[b.dataset.cle];
      DB.mettre('kv', S.profil, 'profil').then(function () { $('#' + b.dataset.cle + '-zone').innerHTML = zoneImage(b.dataset.cle, null, b.dataset.cle === 'logo' ? 'Ajouter mon logo' : 'Ajouter ma signature ou mon cachet'); });
    },
    'exemple': function (b) { exemplePDF(b.dataset.modele); },
    'installer': function () {
      if (invite) { invite.prompt(); invite.userChoice.then(function () { invite = null; majInstall(); if (location.hash === '#/') vueAccueil(); }).catch(function () {}); }
      else feuille('Installer l\'application', instructionsInstall());
    },
    'excel': function () { exporterExcel(); },
    'exporter-json': function () { exporterJSON(); },
    'tout-effacer': function () {
      confirmer('Effacer définitivement tous vos clients, articles et documents de ce téléphone ? Faites d\'abord une sauvegarde.', 'Tout effacer', true).then(function (oui) {
        if (!oui) return;
        var lic = S.licence;
        DB.toutEffacer().then(function () { return lic ? DB.mettre('kv', lic, 'licence') : null; }).then(charger).then(function () { toast('Données effacées.'); aller('#/bienvenue'); });
      });
    }
  };

  var FORMS = {
    'bienvenue': function (form) {
      var v = valeurs(form);
      if (!v.nom) { form.querySelector('[name=nom]').focus(); return; }
      S.profil = Object.assign({}, S.profil, { nom: v.nom, activite: v.activite, telephone: v.telephone });
      DB.mettre('kv', S.profil, 'profil').then(function () { demanderPersistance(); toast('Bienvenue, ' + v.nom + ' !'); location.replace('#/'); });
    },
    'document': function () { enregistrerDocument(); },
    'client': function (form) { enregistrerClient(form, false); },
    'client-rapide': function (form) { enregistrerClient(form, true); },
    'article': function (form) {
      var v = valeurs(form), id = form.dataset.id;
      if (!v.designation) { form.querySelector('[name=designation]').focus(); return; }
      var a = id === 'nouveau' ? { id: TF.nouvelId() } : S.articles.filter(function (x) { return x.id === id; })[0];
      a.designation = v.designation; a.prix = Math.round(TF.lireNombre(v.prix)); a.unite = v.unite; a.details = v.details;
      DB.mettre('articles', a).then(function () { if (id === 'nouveau') S.articles.push(a); toast('Article enregistré.'); location.replace('#/articles'); });
    },
    'paiement': function (form) {
      var d = trouverDoc(form.dataset.id); if (!d) return;
      var v = valeurs(form), m = Math.round(TF.lireNombre(v.montant)), err = $('#erreur-paiement');
      if (m <= 0) { err.textContent = 'Indiquez un montant supérieur à zéro.'; err.hidden = false; return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) { err.textContent = 'Indiquez la date du paiement.'; err.hidden = false; return; }
      d.paiements = d.paiements || [];
      var p = { date: v.date, montant: m, mode: v.mode };
      d.paiements.push(p);
      var t = TF.totaux(d);
      d.statut = t.reste === 0 ? 'payee' : (d.statut === 'brouillon' ? 'envoyee' : d.statut);
      d.modifie = new Date().toISOString();
      DB.mettre('documents', d).then(function () {
        fermerFeuille(); vueDocument(d.id);
        toast(t.reste === 0 ? 'Facture soldée.' : 'Paiement enregistré.', { label: 'Créer le reçu', fn: function () { creerRecuDepuis(d, p); } });
      });
    },
    'profil': function (form) {
      var v = valeurs(form), err = $('#erreur-profil');
      if (!v.nom) { form.querySelector('[name=nom]').focus(); return; }
      if (v.lienWave && !TF.lienWaveValide(v.lienWave)) { err.textContent = 'Le lien Wave doit commencer par https:// et venir de wave.com (ex. : https://pay.wave.com/…).'; err.hidden = false; form.querySelector('[name=lienWave]').focus(); return; }
      ['nom', 'activite', 'adresse', 'ville', 'telephone', 'email', 'ninea', 'rc', 'autres', 'paiement', 'lienWave'].forEach(function (k) { S.profil[k] = v[k] || ''; });
      DB.mettre('kv', S.profil, 'profil').then(function () { toast('Profil enregistré.'); location.replace('#/reglages'); });
    },
    'modeles': function (form) {
      var v = valeurs(form), R = S.reglages;
      var choix = $('input[name=modele]:checked', form), coul = $('input[name=couleur]:checked', form);
      if (choix) R.modele = choix.value;
      if (coul) R.couleur = coul.value;
      R.tvaDefaut = !!v.tvaDefaut;
      R.tvaTaux = TF.lireNombre(v.tvaTaux) || 18;
      R.echeanceJours = Math.max(0, parseInt(v.echeanceJours, 10) || 0);
      R.validiteJours = Math.max(1, parseInt(v.validiteJours, 10) || 30);
      R.notesFacture = v.notesFacture; R.notesDevis = v.notesDevis; R.notesRecu = v.notesRecu;
      DB.mettre('kv', R, 'reglages').then(function () { toast('Réglages enregistrés.'); location.replace('#/reglages'); });
    },
    'licence': function (form) { activer(form.querySelector('[name=code]').value); }
  };

  // ---------- Démarrage ----------
  function brancher() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]');
      if (!b) return;
      var fn = ACTIONS[b.dataset.action];
      if (fn) { e.preventDefault(); fn(b, e); }
    });
    document.addEventListener('submit', function (e) {
      var fn = FORMS[e.target.dataset.form];
      if (fn) { e.preventDefault(); fn(e.target, e); }
    });
    document.addEventListener('input', function (e) {
      if (e.target.closest('#editeur') && e.target.name !== 'type') surSaisieEditeur(e.target);
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el.closest('#editeur')) {
        if (el.name === 'type') { changerType(el.value); return; }
        if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date') surSaisieEditeur(el);
        // mise en forme des nombres en quittant le champ
        if (el.dataset.l === 'pu' && el.value) el.value = TF.formatNombre(TF.lireNombre(el.value), ' ');
        if (el.dataset.e === 'remiseGlobale' && el.value) el.value = TF.formatQuantite(TF.lireNombre(el.value), ' ');
        return;
      }
      if (el.dataset.image) {
        var cle = el.dataset.image, fichier = el.files && el.files[0];
        if (!fichier) return;
        lireImage(fichier, cle === 'logo' ? 600 : 700, cle === 'signature').then(function (src) {
          S.profil[cle] = src;
          return DB.mettre('kv', S.profil, 'profil').then(function () {
            $('#' + cle + '-zone').innerHTML = zoneImage(cle, src, '');
            toast(cle === 'logo' ? 'Logo enregistré.' : 'Signature enregistrée.');
          });
        }).catch(function (er) { toast(er.message); });
      }
      if (el.id === 'f-import' && el.files && el.files[0]) importerJSON(el.files[0]);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && feuilleOuverte) fermerFeuille(); });
    $('#retour').addEventListener('click', function () { ACTIONS.retour(this); });
    $('#fab').addEventListener('click', function () { ACTIONS['nouveau-menu'](); });
    $('#installer').addEventListener('click', function () { ACTIONS.installer(); });
    window.addEventListener('hashchange', function () { pileNav++; router(); });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; majInstall(); });
    window.addEventListener('appinstalled', function () { invite = null; majInstall(); toast('Application installée.'); });
    window.addEventListener('online', reverifierLicence);
    window.addEventListener('beforeunload', function (e) { if (E && Esale) { e.preventDefault(); e.returnValue = ''; } });
  }

  var majDemandee = false;
  function serviceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      var proposer = function () {
        toast('Nouvelle version de l\'application disponible.', { label: 'Mettre à jour', fn: function () { majDemandee = true; if (reg.waiting) reg.waiting.postMessage('maj'); } });
      };
      if (reg.waiting && navigator.serviceWorker.controller) proposer();
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        if (w) w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) proposer(); });
      });
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (majDemandee) { majDemandee = false; location.reload(); } });
  }

  function demarrer() {
    appliquerTheme(lireTheme());
    brancher();
    // Lien d'activation direct : ?o=TCV-…&t=… (depuis la page de commande)
    var p = new URLSearchParams(location.search);
    if (p.get('o') && p.get('t')) {
      var code = '?o=' + p.get('o') + '&t=' + p.get('t');
      history.replaceState(null, '', location.pathname + '#/licence?code=' + encodeURIComponent(code));
    }
    charger().then(function () {
      router();
      reverifierLicence();
    }).catch(function (e) {
      vue('<section class="carte"><h1>Stockage indisponible</h1><p>' + esc(e && e.message || e) + '</p><p>Sur iPhone, quittez la navigation privée. Sinon, mettez à jour votre navigateur.</p></section>');
    });
    serviceWorker();
  }
  window.TFApp = { etat: S, version: VERSION };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
