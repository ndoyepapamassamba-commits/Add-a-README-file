/* Carnet Entretien (TERANGA) — interface. Toutes les données restent sur le téléphone (IndexedDB).
   Seule la vérification du pass contacte la boutique, une fois, quand l'utilisateur colle le lien de sa commande.
   Les rappels s'affichent dans l'application ; un fichier .ics est proposé, l'utilisateur l'ajoute lui-même à son agenda. */
(function () {
  'use strict';
  var VERSION = '1.0.0';
  var URL_ACHAT = '../../boutique/' + CE.PASS.slug + '.html';
  var MOIS_MS = 30 * CE.JOUR_MS;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var F = CE.f, N = CE.formatNombre;
  function trouver(l, fn) { for (var i = 0; i < l.length; i++) if (fn(l[i])) return l[i]; return null; }
  function guil(t) { return '« ' + t + ' »'; }

  // ---------- Icônes ----------
  function svg(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + p + '</svg>'; }
  var DESSINS = {
    voiture: '<path d="M3 13l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-11v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h18"/><circle cx="7" cy="15.5" r="1"/><circle cx="17" cy="15.5" r="1"/>',
    moto: '<circle cx="5.5" cy="16" r="3.5"/><circle cx="18.5" cy="16" r="3.5"/><path d="M5.5 16h5l3-6h3l2 6M13.5 10l-1.5-3h-2.5M16 6h2.5"/>',
    groupe: '<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 18v2M17 18v2M6 11h5M6 14h5"/><path d="M16 9.5l-1.5 3h2.5l-1.5 3"/>',
    clim: '<rect x="2.5" y="5" width="19" height="9" rx="2"/><path d="M6 11h12M7 17.5c0 1 .8 1.5.8 2.5M12 17.5c0 1 .8 1.5.8 2.5M17 17.5c0 1 .8 1.5.8 2.5"/>',
    pompe: '<path d="M3 8h8a3 3 0 0 1 3 3v1"/><path d="M3 5v6"/><rect x="11" y="11" width="6" height="3" rx="1"/><path d="M14 16.5s-2.3 2.4-2.3 3.9a2.3 2.3 0 0 0 4.6 0c0-1.5-2.3-3.9-2.3-3.9z"/>',
    frigo: '<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M6 10h12M9 6v2M9 13v3"/>',
    outil: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.5-.5-2.4z"/>',
    'pompe-essence': '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M6 8h6"/><path d="M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
    reparation: '<path d="M14 6l4 4M3 21l9-9M13.5 3.5l7 7-3 3-7-7z"/>',
    piece: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5V9M12 15v5.5M3.5 12H9M15 12h5.5"/>',
    papier: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    goutte: '<path d="M12 3s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z"/>',
    divers: '<circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/>',
    compteur: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/><circle cx="12" cy="17" r="1.3"/>'
  };
  function icone(n) { return svg(DESSINS[n] || DESSINS.outil); }
  function iconeEngin(e) { return icone((CE.TYPES[e.type] || CE.TYPES.autre).icone); }
  var ICO = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'), gauche: svg('<path d="M15 18l-6-6 6-6"/>'), droite: svg('<path d="M9 18l6-6-6-6"/>'),
    ok: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'), x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    alerte: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.2v.3"/>'), info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.3"/>'),
    cadenas: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
    telecharger: svg('<path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5"/><path d="M4 17v3h16v-3"/>'),
    pdf: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    tableau: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>'),
    wa: svg('<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z"/>'),
    calendrier: svg('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    sauvegarde: svg('<path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
    etoile: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    aide: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17v.3"/>'),
    boutique: svg('<path d="M4 8h16l-1.5 12h-13z"/><path d="M8.5 8a3.5 3.5 0 0 1 7 0"/>'),
    poubelle: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    crayon: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
    installer: svg('<path d="M12 3v11m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="4" rx="1"/>'),
    restaurer: svg('<path d="M12 21V9m0 0-4.5 4.5M12 9l4.5 4.5"/><path d="M4 7V4h16v3"/>'),
    compteur: icone('compteur'), carburant: icone('pompe-essence'), outil: icone('outil')
  };

  // ---------- État ----------
  var S = { profil: { nom: '' }, engins: [], pleins: [], operations: [], releves: [], passes: [], sauvegarde: null, passVu: null, dernierEngin: null };
  function aujourdhui() { return CE.dateISO(new Date()); }
  function etatPass() { return CE.etatPass(S.passes, Date.now()); }
  function premium() { return etatPass().premium; }
  function donnees() { return { pleins: S.pleins, operations: S.operations, releves: S.releves }; }
  function enginDe(id) { return trouver(S.engins, function (e) { return e.id === id; }); }
  function compteurDe(e) { return CE.compteurActuel(e, S.pleins, S.operations, S.releves); }
  function ctxDe(e) { return { compteur: compteurDe(e), usage: CE.usageParJour(e, S.pleins, S.operations, S.releves), aujourdhui: aujourdhui(), unite: e.unite }; }
  function modifiable(e) { return CE.enginModifiable(e, S.engins, premium()); }
  function enginsTries() { return CE.enginsOrdonnes(S.engins); }

  function charger() {
    return Promise.all([DB.lire('kv', 'profil'), DB.lire('kv', 'passes'), DB.lire('kv', 'sauvegarde'), DB.lire('kv', 'passVu'), DB.lire('kv', 'dernierEngin'),
      DB.tout('engins'), DB.tout('pleins'), DB.tout('operations'), DB.tout('releves')]).then(function (r) {
      S.profil = r[0] || { nom: '' }; S.passes = r[1] || []; S.sauvegarde = r[2] || null; S.passVu = r[3] || null; S.dernierEngin = r[4] || null;
      S.engins = r[5] || []; S.pleins = r[6] || []; S.operations = r[7] || []; S.releves = r[8] || [];
    });
  }

  // ---------- Outils d'interface ----------
  var minuteurToast = null;
  function toast(msg, action, genre) {
    var t = $('#toast');
    t.className = 'toast' + (genre ? ' ' + genre : '');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button" class="toast-btn">' + esc(action.label) + '</button>' : '');
    t.hidden = false;
    requestAnimationFrame(function () { t.classList.add('visible'); });
    if (action) t.querySelector('button').onclick = function () { cacherToast(); action.fn(); };
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(cacherToast, action ? 7000 : 4000);
  }
  function cacherToast() { var t = $('#toast'); t.classList.remove('visible'); setTimeout(function () { if (!t.classList.contains('visible')) t.hidden = true; }, 250); }
  var feuilleOuverte = null;
  function feuille(titre, contenu, init) {
    fermerFeuille();
    var fond = document.createElement('div');
    fond.className = 'feuille-fond';
    fond.innerHTML = '<div class="feuille" role="dialog" aria-modal="true" aria-labelledby="feuille-titre"><div class="feuille-tete"><h2 id="feuille-titre">' +
      esc(titre) + '</h2><button type="button" class="icone-btn" data-fermer aria-label="Fermer">' + ICO.x + '</button></div><div class="feuille-corps">' + contenu + '</div></div>';
    document.body.appendChild(fond);
    document.body.classList.add('fige');
    feuilleOuverte = { el: fond, avant: document.activeElement };
    fond.addEventListener('click', function (e) { if (e.target === fond || e.target.closest('[data-fermer]')) fermerFeuille(); });
    var f1 = fond.querySelector('.feuille-corps input:not([type=hidden]):not([type=checkbox]):not([type=radio]), .feuille-corps select, .feuille-corps textarea, .feuille-corps button, .feuille-corps a');
    (f1 || fond.querySelector('[data-fermer]')).focus({ preventScroll: true });
    var el = fond.querySelector('.feuille');
    if (init) init(el);
    requestAnimationFrame(function () { fond.classList.add('ouverte'); });
    return el;
  }
  function fermerFeuille() {
    if (!feuilleOuverte) return;
    var o = feuilleOuverte; feuilleOuverte = null;
    o.el.remove(); document.body.classList.remove('fige');
    if (o.fin) o.fin();
    if (o.avant && o.avant.focus && document.body.contains(o.avant)) o.avant.focus({ preventScroll: true });
  }
  function confirmer(message, oui, danger) {
    return new Promise(function (ok) {
      var repondu = false;
      feuille('Confirmation', '<p>' + esc(message) + '</p><div class="rang-btn"><button type="button" class="btn sec" data-non>Annuler</button><button type="button" class="btn ' +
        (danger ? 'danger' : 'plein') + '" data-oui>' + esc(oui || 'Confirmer') + '</button></div>', function (el) {
        el.querySelector('[data-oui]').onclick = function () { repondu = true; fermerFeuille(); ok(true); };
        el.querySelector('[data-non]').onclick = function () { repondu = true; fermerFeuille(); ok(false); };
        el.querySelector('[data-non]').focus();
      });
      feuilleOuverte.fin = function () { if (!repondu) ok(false); };
    });
  }
  function telecharger(blob, nom) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nom; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
  }
  function aller(h) { if (location.hash === h) router(); else location.hash = h; }
  function rediriger(h) { history.replaceState(null, '', h); router(); }
  function vue(html) { $('#vue').innerHTML = html; }
  function cadre(o) {
    $('#titre').textContent = o.titre || 'Carnet Entretien';
    document.title = (o.titre && o.titre !== 'Carnet Entretien' ? o.titre + ' · ' : '') + 'Carnet Entretien';
    var r = $('#retour');
    r.hidden = !o.retour; r.dataset.vers = o.retour || '';
    $('#marque').hidden = !!o.retour;
    $$('#nav a').forEach(function (a) { a.classList.toggle('actif', a.dataset.nav === o.nav); if (a.dataset.nav === o.nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    majBadge();
  }
  function majBadge() {
    var b = $('#badge-pass'), e = etatPass();
    b.textContent = e.premium ? 'Pass' : 'Gratuit';
    b.classList.toggle('actif', e.premium);
    b.setAttribute('aria-label', e.premium ? 'Pass actif : voir le détail' : 'Version gratuite : voir le pass');
  }
  function champNombre(id, valeur, opts) {
    opts = opts || {};
    return '<div class="' + (opts.suffixe ? 'suffixe-' + opts.suffixe : 'suffixe') + '"><input type="text" inputmode="' + (opts.decimal ? 'decimal' : 'numeric') + '" autocomplete="off" class="montant" id="' + id + '" value="' +
      (valeur ? (opts.decimal ? String(valeur).replace('.', ',') : N(valeur, ' ')) : '') + '" placeholder="' + esc(opts.placeholder || '0') + '"' + (opts.attr || '') + '></div>';
  }
  function libStatut(s) { return { retard: 'En retard', bientot: 'Bientôt', ok: 'À jour', inconnu: 'À compléter' }[s] || s; }
  function feuillePass(raison) {
    var txt = {
      engin: 'La version gratuite suit 1 engin ou appareil. Avec le pass, suivez la voiture, la moto, le groupe électrogène, les climatiseurs, la pompe et le frigo ensemble.',
      modif: 'Sans pass, seul votre premier engin peut recevoir de nouvelles notes. Les autres restent consultables : historique, PDF et rappels.'
    }[raison] || 'Cette fonction fait partie du pass.';
    feuille('Avec le pass', '<p>' + esc(txt) + '</p><p class="prix">' + N(CE.PASS.prix) + ' F <small>pour 12 mois, payé une fois par Wave</small></p>' +
      '<div class="pile"><a class="btn or large" href="#/pass">' + ICO.etoile + 'Voir le pass</a><button type="button" class="btn sec large" data-fermer>Plus tard</button></div>');
  }

  // ---------- Routeur ----------
  var ROUTES = [
    [/^\/$/, function () { vueAccueil(); }],
    [/^\/nouveau$/, function () { vueTypes(); }],
    [/^\/nouveau\/(\w+)$/, function (m) { vueNouvelEngin(m[1]); }],
    [/^\/engin\/([\w-]+)$/, function (m, q) { vueEngin(m[1], q.get('onglet') || 'entretien'); }],
    [/^\/tache\/([\w-]+)\/([\w-]+)$/, function (m) { vueTache(m[1], m[2]); }],
    [/^\/ajouter$/, function () { vueAjouter(); }],
    [/^\/rappels$/, function () { vueRappels(); }],
    [/^\/depenses$/, function (m, q) { vueDepenses(q.get('annee')); }],
    [/^\/reglages$/, function () { vueReglages(); }],
    [/^\/pass$/, function (m, q) { vuePass(q); }],
    [/^\/sauvegarde$/, function () { vueSauvegarde(); }],
    [/^\/aide$/, function () { vueAide(); }]
  ];
  function router() {
    fermerFeuille();
    var h = location.hash.replace(/^#/, '') || '/', q = '', i = h.indexOf('?');
    if (i >= 0) { q = h.slice(i + 1); h = h.slice(0, i); }
    var params = new URLSearchParams(q);
    for (var k = 0; k < ROUTES.length; k++) {
      var m = h.match(ROUTES[k][0]);
      if (m) { ROUTES[k][1](m, params); window.scrollTo(0, 0); return; }
    }
    rediriger('#/');
  }

  // ---------- Bandeaux ----------
  function bandeaux() {
    var h = '', e = etatPass();
    if (e.rappel) {
      h += '<div class="bandeau alerte" id="bandeau-pass">' + ICO.etoile + '<div><p>Votre pass se termine dans <b>' + e.joursRestants + ' jour' + (e.joursRestants > 1 ? 's' : '') +
        '</b> (le ' + esc(CE.dateFr(CE.dateISO(new Date(Date.parse(e.fin))))) + ').</p><a class="btn petit or" href="#/pass">Renouveler le pass</a></div></div>';
    } else if (e.expire && S.passVu !== e.fin) {
      h += '<div class="bandeau alerte" id="bandeau-pass">' + ICO.info + '<div><p>Votre pass est terminé. Vous êtes revenu à la version gratuite : <b>tout votre historique est gardé</b>.</p>' +
        '<div class="rang-btn"><a class="btn petit or" href="#/pass">Renouveler</a><button type="button" class="btn petit sec" data-action="pass-vu">J\'ai compris</button></div></div></div>';
    }
    if (S.pleins.length + S.operations.length >= 20 && (!S.sauvegarde || Date.now() - Date.parse(S.sauvegarde) > MOIS_MS)) {
      h += '<div class="bandeau">' + ICO.sauvegarde + '<p>Pensez à sauvegarder votre carnet (une fois par mois). <a href="#/sauvegarde">Sauvegarder</a></p></div>';
    }
    return h;
  }

  // ---------- Accueil ----------
  function ligneTache(x, avecEngin) {
    var e = x.engin, t = x.tache, s = x.etat, mod = modifiable(e);
    var bouton = '';
    if (mod) bouton = s.statut === 'inconnu' ? '<button type="button" class="btn petit sec" data-action="tache-modifier" data-engin="' + esc(e.id) + '" data-tache="' + esc(t.id) + '">Noter</button>' :
      '<button type="button" class="btn petit ' + (s.statut === 'ok' ? 'sec' : 'plein') + '" data-action="fait" data-engin="' + esc(e.id) + '" data-tache="' + esc(t.id) + '" aria-label="' + esc(t.nom) + ' : c\'est fait">' +
      (t.mode === 'echeance' ? 'Renouvelé' : 'Fait') + '</button>';
    return '<li data-tache="' + esc(t.id) + '"><a class="tache-lien" href="#/tache/' + esc(e.id) + '/' + esc(t.id) + '"><span class="ico ' + s.statut + '">' + (avecEngin ? iconeEngin(e) : (t.mode === 'echeance' ? icone('papier') : ICO.outil)) +
      '</span><span class="tache-corps"><b>' + esc(t.nom) + '</b><small class="' + s.statut + '">' + (avecEngin ? esc(e.nom) + ' · ' : '') + esc(s.texte || '') + '</small></span></a>' + bouton + '</li>';
  }
  function vueAccueil() {
    cadre({ titre: 'Carnet Entretien', nav: 'accueil' });
    if (!S.engins.length) {
      vue('<section class="accueil-bienvenue"><img src="icons/icon-192.png" alt="" width="84" height="84"><h1>Carnet Entretien</h1><p class="lead">Notez l\'entretien de vos engins et appareils : l\'application vous dit quand faire la vidange, ' +
        'quand renouveler l\'assurance, combien vous consommez et combien vous dépensez. Tout reste sur ce téléphone.</p></section><h2>Que voulez-vous suivre ?</h2>' + grilleTypes() +
        '<p class="petit centre" style="margin-top:14px"><a href="#/sauvegarde">J\'ai une sauvegarde à restaurer</a></p>');
      return;
    }
    var liste = CE.aFaire(S.engins, donnees(), aujourdhui());
    var urgents = liste.filter(function (x) { return x.etat.statut === 'retard' || x.etat.statut === 'bientot'; });
    var h = bandeaux();
    h += '<section class="carte" id="a-faire" aria-labelledby="t-afaire"><div class="carte-tete"><h2 id="t-afaire">À faire</h2><a href="#/rappels">Tous les rappels</a></div>';
    if (urgents.length) h += '<ul class="taches">' + urgents.slice(0, 6).map(function (x) { return ligneTache(x, true); }).join('') + '</ul>';
    else {
      var prochain = trouver(liste, function (x) { return x.etat.statut === 'ok' && x.etat.date; });
      h += '<div class="bandeau ok" id="tout-a-jour">' + ICO.ok + '<p><b>Tout est à jour.</b>' + (prochain ? ' Prochain : ' + esc(prochain.tache.nom) + ' (' + esc(prochain.engin.nom) + '), ' + esc(prochain.etat.texte) + '.' : '') + '</p></div>';
    }
    var aCompleter = liste.filter(function (x) { return x.etat.statut === 'inconnu'; }).length;
    if (aCompleter) h += '<p class="petit">' + aCompleter + ' entretien' + (aCompleter > 1 ? 's' : '') + ' sans date de dernière fois : <a href="#/rappels">les compléter</a> pour recevoir les rappels.</p>';
    h += '</section>';
    h += enginsTries().map(carteEngin).join('');
    h += '<button type="button" class="btn sec large" data-action="nouvel-engin" id="btn-nouvel-engin">' + ICO.plus + 'Ajouter un engin ou un appareil</button>';
    if (!premium()) h += '<p class="petit centre">Version gratuite : 1 engin ou appareil. <a href="#/pass">Avec le pass : autant que vous voulez.</a></p>';
    var m = aujourdhui().slice(0, 7), t = CE.totauxDepenses(CE.historique(null, S.pleins, S.operations), function (l) { return l.date.slice(0, 7) === m; });
    h += '<a class="carte" style="display:block;text-decoration:none;color:inherit;margin-top:14px" href="#/depenses" id="depenses-mois"><div class="carte-tete"><h2>Dépenses de ' + esc(CE.moisFr(m)) + '</h2><b class="nombre">' + F(t.total) + '</b></div><p class="petit">' +
      (t.total ? CE.ORDRE_CATEGORIES.filter(function (c) { return t.parCategorie[c]; }).map(function (c) { return CE.CATEGORIES[c].nom + ' ' + F(t.parCategorie[c]); }).join(' · ') : 'Rien de noté ce mois-ci.') + '</p></a>';
    vue(h);
  }
  function grilleTypes() {
    return '<div class="types" role="list">' + CE.ORDRE_TYPES.map(function (k) {
      var t = CE.TYPES[k];
      return '<a role="listitem" class="type" href="#/nouveau/' + k + '" data-type-engin="' + k + '" style="text-decoration:none"><span class="ico">' + icone(t.icone) + '</span><b>' + esc(t.nom) + '</b><small>' +
        esc(t.unite === 'km' ? 'Vidanges au kilomètre, papiers, carburant' : t.unite === 'h' ? 'Vidanges aux heures, carburant en L/heure' : 'Nettoyages et révisions au mois') + '</small></a>';
    }).join('') + '</div>';
  }
  function carteEngin(e) {
    var l = CE.aFaire([e], donnees(), aujourdhui()), retard = l.filter(function (x) { return x.etat.statut === 'retard'; }).length, bientot = l.filter(function (x) { return x.etat.statut === 'bientot'; }).length;
    var prochain = l[0] && l[0].etat.statut !== 'inconnu' ? l[0] : trouver(l, function (x) { return x.etat.statut !== 'inconnu'; });
    var c = compteurDe(e);
    return '<a class="carte engin-carte" href="#/engin/' + esc(e.id) + '" data-engin="' + esc(e.id) + '"><span class="ico ' + (retard ? 'retard' : bientot ? 'bientot' : '') + '">' + iconeEngin(e) + '</span><span style="min-width:0;flex:1"><h2>' + esc(e.nom) + '</h2><p>' +
      esc([e.immat, e.unite ? CE.compteurTxt(c, e.unite) : CE.TYPES[e.type].nom].filter(Boolean).join(' · ')) + '</p>' + (prochain ? '<p>Prochain : ' + esc(prochain.tache.nom) + ' · ' + esc(prochain.etat.texte) + '</p>' : '') + '</span><span class="droite">' +
      (retard ? '<span class="statut retard">' + retard + ' en retard</span>' : bientot ? '<span class="statut bientot">' + bientot + ' bientôt</span>' : '<span class="statut ok">À jour</span>') + (modifiable(e) ? '' : '<br><span class="statut inconnu" style="margin-top:4px">Lecture seule</span>') + '</span></a>';
  }

  // ---------- Nouvel engin ----------
  function vueTypes() {
    if (!CE.peutCreerEngin(S.engins, premium())) { rediriger(S.engins.length ? '#/' : '#/'); feuillePass('engin'); return; }
    cadre({ titre: 'Ajouter', retour: '#/', nav: 'accueil' });
    vue('<p class="lead">Que voulez-vous suivre ?</p>' + grilleTypes());
  }
  function vueNouvelEngin(type) {
    if (!CE.TYPES[type]) { rediriger('#/nouveau'); return; }
    if (!CE.peutCreerEngin(S.engins, premium())) { rediriger('#/'); feuillePass('engin'); return; }
    var T = CE.TYPES[type], km = T.unite === 'km', h = T.unite === 'h', modeles = CE.MODELES[type];
    cadre({ titre: T.nom, retour: S.engins.length ? '#/nouveau' : '#/', nav: 'accueil' });
    var html = '<form class="carte" data-form="engin" data-type="' + type + '" novalidate><div class="projet-tete" style="margin-bottom:12px"><span class="ico">' + icone(T.icone) + '</span><h1 style="margin:0">' + esc(T.nom) + '</h1></div>' +
      '<div class="champ"><label for="n-nom">Nom</label><input id="n-nom" maxlength="50" placeholder="' + esc(T.exemple) + '"></div>';
    if (T.unite) html += '<div class="champ"><label for="n-compteur">' + (km ? 'Kilométrage actuel (compteur)' : 'Heures au compteur') + '</label>' + champNombre('n-compteur', 0, { suffixe: T.unite }) +
      (h ? '<small>Le chiffre affiché par le compteur d\'heures du groupe. S\'il n\'en a pas, mettez 0 et notez ensuite les heures de marche.</small>' : '') + '</div>';
    if (km) html += '<div class="deux"><div class="champ"><label for="n-immat">Immatriculation</label><input id="n-immat" maxlength="20" placeholder="Facultatif" autocapitalize="characters"></div>' +
      '<div class="champ"><label for="n-annee">Année</label><input id="n-annee" inputmode="numeric" maxlength="4" placeholder="Facultatif"></div></div>';
    if (T.carburant) html += '<div class="champ"><label for="n-carburant">Carburant</label><select id="n-carburant"><option value="">—</option><option value="essence">Essence</option><option value="gasoil">Gasoil</option>' +
      (type === 'moto' || type === 'groupe' ? '<option value="melange">Mélange 2 temps</option>' : '') + '</select></div>';
    var premiere = modeles[0];
    html += '<fieldset class="champ" style="border:0;padding:0;margin:0 0 14px"><legend class="etiquette">' + esc(premiere.nom) + ' : la dernière fois (facultatif)</legend><div class="deux"><div><label class="petit" for="n-der-date">Date</label><input type="date" id="n-der-date" max="' + aujourdhui() + '"></div>' +
      (T.unite && (premiere.intKm || premiere.intH) ? '<div><label class="petit" for="n-der-compteur">Au compteur</label>' + champNombre('n-der-compteur', 0, { suffixe: T.unite }) + '</div>' : '') + '</div><small class="petit">Sans cette date, l\'application ne peut pas encore calculer la prochaine fois.</small></fieldset>';
    var echeances = modeles.filter(function (m) { return m.mode === 'echeance'; });
    if (echeances.length) {
      html += '<fieldset class="champ" style="border:0;padding:0;margin:0 0 14px"><legend class="etiquette">Papiers : dates de fin (facultatif)</legend><p class="petit" style="margin-top:0">Tapez les dates écrites sur vos papiers.</p>' +
        echeances.map(function (m) { return '<div class="champ"><label for="n-ech-' + m.cle + '">' + esc(m.nom) + ' valable jusqu\'au</label><input type="date" id="n-ech-' + m.cle + '" data-echeance="' + m.cle + '"></div>'; }).join('') + '</fieldset>';
    }
    html += '<fieldset class="champ" style="border:0;padding:0;margin:0 0 14px"><legend class="etiquette">' + (T.unite ? 'Votre garage ou mécanicien' : 'Votre technicien') + ' (facultatif)</legend><div class="deux"><div><label class="petit" for="n-garage">Nom</label><input id="n-garage" maxlength="50"></div>' +
      '<div><label class="petit" for="n-tel">Téléphone WhatsApp</label><input id="n-tel" type="tel" inputmode="tel" maxlength="20" placeholder="77 000 00 00"></div></div></fieldset>' +
      '<p class="msg erreur" id="n-msg" role="alert"></p><button type="submit" class="btn plein large btn-enregistrer">' + ICO.ok + 'Créer le carnet</button>' +
      '<p class="petit">Le programme d\'entretien proposé est indicatif : vous pourrez changer chaque rythme selon le carnet du constructeur ou l\'avis de votre mécanicien.</p></form>';
    vue(html);
  }
  function creerEngin(form) {
    var type = form.dataset.type, T = CE.TYPES[type], msg = $('#n-msg');
    if (!CE.peutCreerEngin(S.engins, premium())) { feuillePass('engin'); return; }
    var nom = $('#n-nom').value.trim();
    if (!nom) { msg.textContent = 'Donnez un nom (par exemple la marque et le modèle).'; $('#n-nom').focus(); return; }
    var compteur = T.unite ? CE.lireEntier($('#n-compteur').value) : 0;
    if (T.unite === 'km' && !compteur) { msg.textContent = 'Indiquez le kilométrage affiché au compteur.'; $('#n-compteur').focus(); return; }
    var e = CE.nouvelEngin(type, { nom: nom, immat: $('#n-immat') ? $('#n-immat').value : '', annee: $('#n-annee') ? $('#n-annee').value : '', carburant: $('#n-carburant') ? $('#n-carburant').value : '',
      compteur: compteur, garageNom: $('#n-garage').value, garageTel: $('#n-tel').value }, aujourdhui());
    e.ordre = S.engins.reduce(function (m, x) { return Math.max(m, x.ordre || 0); }, 0) + 1;
    var dd = $('#n-der-date').value, dc = $('#n-der-compteur') ? CE.lireEntier($('#n-der-compteur').value) : 0;
    if (dd) {
      if (!CE.dateValide(dd) || dd > aujourdhui()) { msg.textContent = 'La date de la dernière fois n\'est pas valable.'; return; }
      if (dc > compteur && T.unite) { msg.textContent = 'Le compteur de la dernière fois dépasse le compteur actuel.'; return; }
      e.taches[0].dernier = { date: dd, compteur: dc || (T.unite ? compteur : 0) };
    }
    $$('[data-echeance]', form).forEach(function (i) { if (CE.dateValide(i.value)) { var t = CE.tacheParCle(e, i.dataset.echeance); if (t) t.echeance = i.value; } });
    S.engins.push(e);
    DB.mettre('engins', e).then(function () { rediriger('#/engin/' + e.id); toast('Carnet ' + guil(e.nom) + ' créé.'); }).catch(erreurStockage);
  }

  // ---------- Fiche d'un engin ----------
  function vueEngin(id, onglet) {
    var e = enginDe(id);
    if (!e) { rediriger('#/'); return; }
    var T = CE.TYPES[e.type], mod = modifiable(e), c = compteurDe(e), usage = CE.usageParJour(e, S.pleins, S.operations, S.releves);
    if (onglet === 'carburant' && !T.carburant) onglet = 'entretien';
    cadre({ titre: e.nom, retour: '#/', nav: 'accueil' });
    var h = '';
    if (!mod) h += '<div class="bandeau alerte" id="lecture-seule">' + ICO.cadenas + '<div><p>Version gratuite : ce carnet est <b>en lecture seule</b>. Historique, PDF et rappels restent disponibles.</p><a class="btn petit or" href="#/pass">Voir le pass</a></div></div>';
    h += '<section class="hero"><div class="engin-carte" style="color:inherit"><span class="ico" style="background:rgba(255,255,255,.16);color:#fff">' + iconeEngin(e) + '</span><span><h2 style="color:#fff">' + esc(e.nom) + '</h2><p style="color:rgba(255,255,255,.85)">' +
      esc([T.nom, e.immat, e.annee].filter(Boolean).join(' · ')) + '</p></span></div>';
    if (e.unite) {
      h += '<small style="margin-top:12px">' + (e.unite === 'km' ? 'Compteur' : 'Heures de marche') + '</small><div class="compteur-gros" id="compteur">' + N(c) + '<small>' + CE.uniteTxt(e.unite) + '</small></div>' +
        (usage ? '<small>Environ ' + N(Math.round(usage * (e.unite === 'h' ? 10 : 1)) / (e.unite === 'h' ? 10 : 1)) + ' ' + (e.unite === 'km' ? 'km' : 'heures') + ' par jour</small>' : '') +
        (mod ? '<div class="rang-btn"><button type="button" class="btn petit" data-action="releve" data-engin="' + esc(e.id) + '">' + ICO.compteur + 'Mettre à jour le compteur</button></div>' : '');
    }
    h += '</section>';
    var onglets = [['entretien', 'Entretien', ICO.outil]].concat(T.carburant ? [['carburant', 'Carburant', ICO.carburant]] : []).concat([['depenses', 'Dépenses', ICO.tableau], ['infos', 'Infos', ICO.info]]);
    h += '<nav class="onglets" aria-label="Rubriques">' + onglets.map(function (o) { return '<a href="#/engin/' + esc(e.id) + '?onglet=' + o[0] + '"' + (o[0] === onglet ? ' aria-current="page"' : '') + ' data-onglet="' + o[0] + '">' + o[2] + o[1] + '</a>'; }).join('') + '</nav>';
    if (onglet === 'carburant') h += ongletCarburant(e, mod);
    else if (onglet === 'depenses') h += ongletDepenses(e, mod);
    else if (onglet === 'infos') h += ongletInfos(e, mod);
    else h += ongletEntretien(e, mod);
    vue(h);
  }
  function ongletEntretien(e, mod) {
    var l = CE.aFaire([e], donnees(), aujourdhui()), T = CE.TYPES[e.type];
    var h = '<section class="carte" aria-labelledby="t-prog"><div class="carte-tete"><h2 id="t-prog">Programme d\'entretien</h2></div><ul class="taches" id="liste-taches">' + l.map(function (x) { return ligneTache(x, false); }).join('') + '</ul>' +
      (mod ? '<button type="button" class="btn sec petit" data-action="tache-ajouter" data-engin="' + esc(e.id) + '" style="margin-top:8px">' + ICO.plus + 'Ajouter un entretien</button>' : '') +
      '<p class="petit">Rythmes indicatifs : suivez le carnet du constructeur ou l\'avis de votre mécanicien, et changez-les si besoin (touchez un entretien).</p></section>';
    if (T.voyage) {
      var liste = e.type === 'moto' ? CE.VOYAGE_MOTO : CE.VOYAGE;
      h += '<details class="carte" id="voyage"><summary>Contrôles avant un long voyage</summary><ul class="liste-coches">' + liste.map(function (x, i) {
        return '<li><label><input type="checkbox" id="v-' + i + '">' + esc(x) + '</label></li>';
      }).join('') + '</ul><p class="petit">Une simple liste pour ne rien oublier avant la route (Magal, Gamou, vacances…). En cas de doute, demandez à votre mécanicien.</p></details>';
    }
    h += '<section class="carte"><h2>Rappels dans l\'agenda</h2><p class="petit">Les rappels s\'affichent dans l\'application. Vous pouvez aussi ajouter les prochaines dates à l\'agenda du téléphone : ouvrez le fichier, le téléphone propose de les ajouter.</p>' +
      '<button type="button" class="btn sec large" data-action="ics" data-engin="' + esc(e.id) + '">' + ICO.calendrier + 'Fichier agenda (.ics)</button></section>';
    return h;
  }
  function ongletCarburant(e, mod) {
    var co = CE.consommation(CE.pleinsDe(S.pleins, e.id), e.unite), u = e.unite, lib = CE.libelleConso(u);
    var h = '<div class="chiffres" id="stats-carburant"><div><small>Consommation moyenne</small><strong id="conso-moyenne">' + (co.moyenne != null ? CE.decimal(co.moyenne, 1) : '–') + '</strong><em>' + lib + (co.approx ? ' (approximative)' : '') + '</em></div>' +
      '<div><small>Dernière mesure</small><strong id="conso-derniere">' + (co.derniere != null ? CE.decimal(co.derniere, 1) : '–') + '</strong><em>' + lib + '</em></div>' +
      '<div><small>Prix moyen du litre</small><strong id="prix-litre">' + (co.prixLitre ? F(co.prixLitre) : '–') + '</strong><em>sur ' + co.nb + ' plein' + (co.nb > 1 ? 's' : '') + '</em></div>' +
      '<div><small>Carburant par ' + (u === 'h' ? 'heure' : 'km') + '</small><strong id="cout-unite">' + (co.coutParUnite != null ? F(co.coutParUnite) : '–') + '</strong><em>' + (co.distance ? 'sur ' + CE.compteurTxt(co.distance, u) : 'pas encore assez de pleins') + '</em></div></div>';
    if (mod) h += '<button type="button" class="btn plein large" data-action="plein" data-engin="' + esc(e.id) + '" style="margin-bottom:14px">' + ICO.plus + 'Ajouter un plein</button>';
    var pl = S.pleins.filter(function (p) { return p.engin === e.id; }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.compteur - a.compteur; });
    h += '<section class="carte"><h2>Pleins (' + pl.length + ')</h2>';
    if (!pl.length) h += '<p class="petit">Notez chaque plein avec le compteur : l\'application calcule la consommation et le coût par ' + (u === 'h' ? 'heure' : 'km') + '.</p>';
    h += '<ul class="lignes" id="liste-pleins">' + pl.map(function (p) {
      return '<li><button type="button" class="ligne" data-action="plein" data-engin="' + esc(e.id) + '" data-id="' + esc(p.id) + '"' + (mod ? '' : ' disabled') + '><span class="ligne-corps"><b>' + esc(CE.litres(p.litresCl)) + ' · ' + esc(CE.dateFr(p.date)) +
        '</b><small>' + esc(CE.compteurTxt(p.compteur, u)) + ' · ' + F(CE.prixLitre(p.montant, p.litresCl)) + '/L' + (p.complet === false ? ' · partiel' : '') + (p.note ? ' · ' + esc(p.note) : '') + '</small></span><span class="ligne-montant">' + F(p.montant) + '</span></button></li>';
    }).join('') + '</ul><p class="petit">Pour une mesure juste : faites le plein complet et notez le compteur à chaque fois.</p></section>';
    return h;
  }
  function ongletDepenses(e, mod) {
    var hist = CE.historique(e.id, S.pleins, S.operations), an = aujourdhui().slice(0, 4);
    var tAn = CE.totauxDepenses(hist, function (l) { return l.date.slice(0, 4) === an; }), tTout = CE.totauxDepenses(hist), cout = CE.coutToutCompris(e, S.pleins, S.operations, S.releves);
    var h = '<div class="chiffres"><div><small>Cette année</small><strong id="dep-annee">' + F(tAn.total) + '</strong><em>' + tAn.nb + ' dépense' + (tAn.nb > 1 ? 's' : '') + '</em></div><div><small>Depuis le début</small><strong>' + F(tTout.total) + '</strong><em>' + tTout.nb + ' dépense' + (tTout.nb > 1 ? 's' : '') + '</em></div>' +
      (cout ? '<div style="grid-column:1/-1"><small>Coût tout compris par ' + (e.unite === 'h' ? 'heure' : 'km') + '</small><strong id="cout-total">' + F(cout.parUnite) + '</strong><em>carburant, entretien et réparations, sur ' + CE.compteurTxt(cout.distance, e.unite) + '</em></div>' : '') + '</div>';
    if (mod) h += '<button type="button" class="btn plein large" data-action="operation" data-engin="' + esc(e.id) + '" style="margin-bottom:14px">' + ICO.plus + 'Ajouter une dépense</button>';
    if (tTout.total) {
      var max = 0; CE.ORDRE_CATEGORIES.forEach(function (c) { if ((tTout.parCategorie[c] || 0) > max) max = tTout.parCategorie[c]; });
      h += '<section class="carte"><h2>Par catégorie</h2><ul class="barres-cat">' + CE.ORDRE_CATEGORIES.filter(function (c) { return tTout.parCategorie[c]; }).map(function (c) {
        return '<li><div class="haut"><span>' + esc(CE.CATEGORIES[c].nom) + '</span><b>' + F(tTout.parCategorie[c]) + '</b></div><div class="barre"><i style="width:' + Math.round(tTout.parCategorie[c] * 100 / max) + '%"></i></div></li>';
      }).join('') + '</ul></section>';
    }
    h += '<section class="carte"><h2>Historique (' + hist.length + ')</h2>' + (hist.length ? '' : '<p class="petit">Rien de noté pour l\'instant.</p>') + '<ul class="lignes" id="historique">' + hist.map(function (l) {
      return '<li><button type="button" class="ligne" data-action="' + (l.genre === 'plein' ? 'plein' : 'operation') + '" data-engin="' + esc(e.id) + '" data-id="' + esc(l.id) + '"' + (mod ? '' : ' disabled') + '><span class="ico" style="width:38px;height:38px;border-radius:12px">' +
        icone(CE.CATEGORIES[l.categorie].icone) + '</span><span class="ligne-corps"><b>' + esc(l.libelle) + '</b><small>' + esc(CE.dateFr(l.date)) + (l.compteur && e.unite ? ' · ' + esc(CE.compteurTxt(l.compteur, e.unite)) : '') + ' · ' + esc(CE.CATEGORIES[l.categorie].nom) +
        '</small></span><span class="ligne-montant">' + (l.montant ? F(l.montant) : '–') + '</span></button></li>';
    }).join('') + '</ul></section>';
    return h;
  }
  function ongletInfos(e, mod) {
    var T = CE.TYPES[e.type], dis = mod ? '' : ' disabled';
    var h = '<form class="carte" data-form="infos" data-engin="' + esc(e.id) + '" novalidate><h2>Informations</h2><div class="champ"><label for="i-nom">Nom</label><input id="i-nom" maxlength="50" value="' + esc(e.nom) + '"' + dis + '></div>';
    if (T.unite === 'km') h += '<div class="deux"><div class="champ"><label for="i-immat">Immatriculation</label><input id="i-immat" maxlength="20" value="' + esc(e.immat) + '"' + dis + '></div><div class="champ"><label for="i-annee">Année</label><input id="i-annee" inputmode="numeric" maxlength="4" value="' + esc(e.annee || '') + '"' + dis + '></div></div>';
    if (T.carburant) h += '<div class="champ"><label for="i-carburant">Carburant</label><select id="i-carburant"' + dis + '>' + [['', '—'], ['essence', 'Essence'], ['gasoil', 'Gasoil'], ['melange', 'Mélange 2 temps']].map(function (o) { return '<option value="' + o[0] + '"' + (e.carburant === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>';
    h += '<div class="deux"><div class="champ"><label for="i-garage">Garage ou technicien</label><input id="i-garage" maxlength="50" value="' + esc(e.garageNom) + '"' + dis + '></div><div class="champ"><label for="i-tel">Son WhatsApp</label><input id="i-tel" type="tel" inputmode="tel" maxlength="20" value="' + esc(e.garageTel) + '"' + dis + '></div></div>' +
      '<div class="champ"><label for="i-note">Notes</label><textarea id="i-note" maxlength="500" rows="3"' + dis + ' placeholder="Ex. : type d\'huile, taille des pneus, référence du filtre">' + esc(e.note || '') + '</textarea></div>' +
      (mod ? '<button type="submit" class="btn plein large">' + ICO.ok + 'Enregistrer</button>' : '') + '</form>';
    h += '<section class="carte"><h2>Historique en PDF</h2><p class="petit">Pour montrer l\'entretien à un acheteur ou à votre mécanicien : programme, historique des entretiens et réparations' + (T.carburant ? ', consommation' : '') + '.</p>' +
      '<label class="case"><input type="checkbox" id="pdf-montants" checked>Afficher les montants payés</label><button type="button" class="btn plein large" data-action="pdf" data-engin="' + esc(e.id) + '">' + ICO.pdf + 'PDF de l\'historique</button></section>';
    if (mod) h += '<section class="carte"><button type="button" class="btn danger-sec large" data-action="engin-supprimer" data-engin="' + esc(e.id) + '">' + ICO.poubelle + 'Supprimer ce carnet</button></section>';
    return h;
  }

  // ---------- Fiche d'un entretien ----------
  function vueTache(eid, tid) {
    var e = enginDe(eid), t = e && CE.tacheDe(e, tid);
    if (!t) { rediriger(e ? '#/engin/' + eid : '#/'); return; }
    var mod = modifiable(e), ctx = ctxDe(e), s = CE.etatTache(t, ctx);
    cadre({ titre: t.nom, retour: '#/engin/' + eid, nav: 'accueil' });
    var h = '<section class="carte"><div class="engin-carte"><span class="ico ' + s.statut + '">' + (t.mode === 'echeance' ? icone('papier') : ICO.outil) + '</span><span style="flex:1;min-width:0"><h1 style="margin:0;font-size:1.2rem">' + esc(t.nom) + '</h1><p>' + esc(e.nom) +
      '</p></span><span class="statut ' + s.statut + '" id="statut-tache">' + libStatut(s.statut) + '</span></div><p id="texte-tache" style="font-weight:700;margin-top:12px">' + esc(s.texte || '') + '</p>' +
      (s.dateEstimee ? '<p class="petit">Date estimée selon votre usage : ' + esc(CE.dateFr(s.dateEstimee)) + '.</p>' : '') +
      '<dl class="totaux" style="margin-top:8px"><dt>Rythme</dt><dd style="font-weight:600">' + esc(CE.rythmeTxt(t, e.unite)) + '</dd>' +
      (t.mode === 'echeance' ? '<dt>Échéance</dt><dd>' + (t.echeance ? esc(CE.dateFr(t.echeance)) : '–') + '</dd>' : '<dt>Dernière fois</dt><dd>' + (t.dernier ? esc(CE.dateFr(t.dernier.date)) + (e.unite && t.dernier.compteur ? ' à ' + esc(CE.compteurTxt(t.dernier.compteur, e.unite)) : '') : '–') + '</dd>') + '</dl>';
    if (mod) h += '<div class="pile">' + (s.statut === 'inconnu' && t.mode !== 'echeance' ? '<button type="button" class="btn plein large" data-action="tache-modifier" data-engin="' + esc(e.id) + '" data-tache="' + esc(t.id) + '">' + ICO.crayon + 'Noter la dernière fois</button>' : '') +
      '<button type="button" class="btn ' + (s.statut === 'inconnu' && t.mode !== 'echeance' ? 'sec' : 'plein') + ' large" data-action="fait" data-engin="' + esc(e.id) + '" data-tache="' + esc(t.id) + '">' + ICO.ok + (t.mode === 'echeance' ? 'Renouvelé : noter la nouvelle date' : 'C\'est fait : le noter') + '</button>' +
      '<button type="button" class="btn sec large" data-action="tache-modifier" data-engin="' + esc(e.id) + '" data-tache="' + esc(t.id) + '">' + ICO.crayon + 'Modifier le rythme ou les dates</button></div>';
    h += '<a class="btn wa large" id="wa-garage" style="margin-top:10px" target="_blank" rel="noopener" href="' + esc(CE.lienWhatsApp(CE.texteGarage(e, t, ctx.compteur), e.garageTel)) + '">' + ICO.wa +
      (e.garageNom ? 'Écrire à ' + esc(e.garageNom) : 'Écrire au garage sur WhatsApp') + '</a><p class="petit">WhatsApp s\'ouvre avec le message prêt ; c\'est vous qui l\'envoyez.</p></section>';
    if (t.checklist && t.checklist.length) h += '<section class="carte"><h2>Liste de contrôle</h2><ul class="liste-coches">' + t.checklist.map(function (x, i) { return '<li><label><input type="checkbox" id="lc-' + i + '">' + esc(x) + '</label></li>'; }).join('') + '</ul></section>';
    var ops = S.operations.filter(function (o) { return o.engin === e.id && o.tache === t.id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    h += '<section class="carte"><h2>Historique (' + ops.length + ')</h2>' + (ops.length ? '<ul class="lignes">' + ops.map(function (o) {
      return '<li><button type="button" class="ligne" data-action="operation" data-engin="' + esc(e.id) + '" data-id="' + esc(o.id) + '"' + (mod ? '' : ' disabled') + '><span class="ligne-corps"><b>' + esc(CE.dateFr(o.date)) + (o.compteur && e.unite ? ' · ' + esc(CE.compteurTxt(o.compteur, e.unite)) : '') +
        '</b><small>' + esc([o.garage, o.note].filter(Boolean).join(' · ') || o.libelle) + '</small></span><span class="ligne-montant">' + (o.montant ? F(o.montant) : '–') + '</span></button></li>';
    }).join('') + '</ul>' : '<p class="petit">Pas encore noté dans l\'application.</p>') + '</section>';
    vue(h);
  }

  // ---------- Formulaires (feuilles) ----------
  function dernierCompteurAvant(e, date, saufId) {
    var m = 0;
    CE.pointsCompteur(e, S.pleins.filter(function (p) { return p.id !== saufId; }), S.operations.filter(function (o) { return o.id !== saufId; }), S.releves.filter(function (r) { return r.id !== saufId; }))
      .forEach(function (p) { if (p.date <= date && p.compteur > m) m = p.compteur; });
    return m;
  }
  function verifierCompteur(e, date, compteur, saufId) {
    var m = dernierCompteurAvant(e, date, saufId);
    if (compteur && compteur < m) return 'Le compteur est plus petit qu\'un relevé précédent (' + CE.compteurTxt(m, e.unite) + '). Vérifiez le chiffre ou la date.';
    return '';
  }
  function champCompteur(e, id, valeur, avecHeures) {
    var u = e.unite;
    return '<div class="champ"><label for="' + id + '">' + (u === 'km' ? 'Compteur (km)' : 'Heures au compteur') + '</label>' + champNombre(id, valeur, { suffixe: u, placeholder: 'Dernier : ' + N(compteurDe(e), ' ') }) + '</div>' +
      (u === 'h' && avecHeures ? '<div class="champ"><label for="' + id + '-marche">ou heures de marche depuis le dernier relevé</label>' + champNombre(id + '-marche', 0, { suffixe: 'h' }) + '<small>Si le groupe n\'a pas de compteur d\'heures.</small></div>' : '');
  }
  function lireCompteur(e, id) {
    var v = CE.lireEntier($('#' + id).value), m = $('#' + id + '-marche');
    if (m && CE.lireEntier(m.value)) v = compteurDe(e) + CE.lireEntier(m.value);
    return v;
  }
  function feuillePlein(e, pid) {
    var p = pid ? trouver(S.pleins, function (x) { return x.id === pid; }) : null;
    feuille(p ? 'Modifier le plein' : 'Nouveau plein', '<form data-form="plein" novalidate><p class="petit" style="margin-top:0">' + esc(e.nom) + '</p>' +
      '<div class="champ"><label for="p-date">Date</label><input type="date" id="p-date" value="' + (p ? p.date : aujourdhui()) + '" max="' + aujourdhui() + '"></div>' + champCompteur(e, 'p-compteur', p ? p.compteur : 0, true) +
      '<div class="deux"><div class="champ"><label for="p-litres">Litres</label>' + champNombre('p-litres', p ? p.litresCl / 100 : 0, { decimal: true, suffixe: 'L' }) + '</div><div class="champ"><label for="p-montant">Montant payé</label>' + champNombre('p-montant', p ? p.montant : 0) + '</div></div>' +
      '<p class="petit" id="p-prix">Prix du litre : –</p><label class="case"><input type="checkbox" id="p-complet"' + (!p || p.complet !== false ? ' checked' : '') + '>Plein complet (réservoir rempli)</label>' +
      '<div class="champ"><label for="p-note">Station (facultatif)</label><input id="p-note" maxlength="60" value="' + esc(p ? p.note || '' : '') + '"></div><p class="msg erreur" id="p-msg" role="alert"></p>' +
      '<div class="rang-btn">' + (p ? '<button type="button" class="btn danger-sec" data-action="supprimer" data-genre="pleins" data-id="' + esc(p.id) + '">' + ICO.poubelle + 'Supprimer</button>' : '') + '<button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>', function (el) {
      var maj = function () { var cl = CE.versCl($('#p-litres').value), m = CE.lireEntier($('#p-montant').value); $('#p-prix').textContent = 'Prix du litre : ' + (cl && m ? N(CE.prixLitre(m, cl)) + ' F' : '–'); };
      $('#p-litres').addEventListener('input', maj); $('#p-montant').addEventListener('input', maj); maj();
      $('form', el).addEventListener('submit', function (ev) {
        ev.preventDefault();
        var date = $('#p-date').value, cl = CE.versCl($('#p-litres').value), montant = CE.lireEntier($('#p-montant').value), compteur = lireCompteur(e, 'p-compteur'), msg = $('#p-msg');
        if (!CE.dateValide(date) || date > aujourdhui()) { msg.textContent = 'Date non valable.'; return; }
        if (!compteur) { msg.textContent = e.unite === 'km' ? 'Indiquez le kilométrage au moment du plein.' : 'Indiquez les heures au compteur (ou les heures de marche).'; return; }
        if (!cl) { msg.textContent = 'Indiquez le nombre de litres.'; return; }
        if (!montant) { msg.textContent = 'Indiquez le montant payé.'; return; }
        var err = verifierCompteur(e, date, compteur, p && p.id);
        if (err) { msg.textContent = err; return; }
        var neuf = !p;
        if (!p) p = { id: 'p-' + CE.nouvelId().slice(0, 12), engin: e.id };
        p.date = date; p.compteur = compteur; p.litresCl = cl; p.montant = montant; p.complet = $('#p-complet').checked; p.note = $('#p-note').value.trim().slice(0, 60);
        if (neuf) S.pleins.push(p);
        enregistrer([['pleins', p], ['kv', e.id, 'dernierEngin']], 'Plein noté : ' + CE.litres(cl) + ', ' + F(montant) + '.');
      });
    });
  }
  function feuilleOperation(e, oid, preset) {
    var o = oid ? trouver(S.operations, function (x) { return x.id === oid; }) : null, pr = preset || {};
    var cat = o ? o.categorie : pr.categorie || 'reparation';
    feuille(o ? 'Modifier la dépense' : 'Nouvelle dépense', '<form data-form="operation" novalidate><p class="petit" style="margin-top:0">' + esc(e.nom) + '</p>' +
      '<div class="champ"><label for="o-cat">Catégorie</label><select id="o-cat">' + CE.ORDRE_CATEGORIES.filter(function (c) { return c !== 'carburant'; }).map(function (c) { return '<option value="' + c + '"' + (c === cat ? ' selected' : '') + '>' + esc(CE.CATEGORIES[c].nom) + '</option>'; }).join('') + '</select></div>' +
      '<div class="champ"><label for="o-libelle">Quoi ?</label><input id="o-libelle" maxlength="80" value="' + esc(o ? o.libelle : pr.libelle || '') + '" placeholder="Ex. : changement des plaquettes, lavage, pneu neuf"></div>' +
      '<div class="deux"><div class="champ"><label for="o-date">Date</label><input type="date" id="o-date" value="' + (o ? o.date : aujourdhui()) + '" max="' + aujourdhui() + '"></div><div class="champ"><label for="o-montant">Montant</label>' + champNombre('o-montant', o ? o.montant : 0) + '</div></div>' +
      (e.unite ? champCompteur(e, 'o-compteur', o ? o.compteur : 0, false) : '') +
      '<div class="champ"><label for="o-tache">Lié à un entretien du programme</label><select id="o-tache"><option value="">Non</option>' + e.taches.map(function (t) { return '<option value="' + esc(t.id) + '"' + ((o ? o.tache : pr.tache) === t.id ? ' selected' : '') + '>' + esc(t.nom) + '</option>'; }).join('') + '</select><small>Si oui, la date et le compteur servent de « dernière fois ».</small></div>' +
      '<div class="champ"><label for="o-garage">Garage ou vendeur</label><input id="o-garage" maxlength="50" value="' + esc(o ? o.garage || '' : e.garageNom || '') + '"></div>' +
      '<div class="champ"><label for="o-note">Note</label><input id="o-note" maxlength="120" value="' + esc(o ? o.note || '' : '') + '"></div><p class="msg erreur" id="o-msg" role="alert"></p>' +
      '<div class="rang-btn">' + (o ? '<button type="button" class="btn danger-sec" data-action="supprimer" data-genre="operations" data-id="' + esc(o.id) + '">' + ICO.poubelle + 'Supprimer</button>' : '') + '<button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>', function (el) {
      $('form', el).addEventListener('submit', function (ev) {
        ev.preventDefault();
        var libelle = $('#o-libelle').value.trim(), date = $('#o-date').value, msg = $('#o-msg'), compteur = e.unite ? lireCompteur(e, 'o-compteur') : 0, tid = $('#o-tache').value;
        if (!libelle) { msg.textContent = 'Indiquez ce qui a été fait ou acheté.'; $('#o-libelle').focus(); return; }
        if (!CE.dateValide(date) || date > aujourdhui()) { msg.textContent = 'Date non valable.'; return; }
        var err = e.unite ? verifierCompteur(e, date, compteur, o && o.id) : '';
        if (err) { msg.textContent = err; return; }
        var neuf = !o;
        if (!o) o = { id: 'o-' + CE.nouvelId().slice(0, 12), engin: e.id };
        o.categorie = $('#o-cat').value; o.libelle = libelle.slice(0, 80); o.date = date; o.montant = CE.lireEntier($('#o-montant').value); o.compteur = compteur; o.tache = tid;
        o.garage = $('#o-garage').value.trim().slice(0, 50); o.note = $('#o-note').value.trim().slice(0, 120);
        if (neuf) S.operations.push(o);
        var ops = [['operations', o], ['kv', e.id, 'dernierEngin']];
        var t = tid && CE.tacheDe(e, tid);
        if (t && (!t.dernier || date >= t.dernier.date)) { t.dernier = { date: date, compteur: compteur }; ops.push(['engins', e]); }
        enregistrer(ops, 'Dépense notée : ' + F(o.montant) + '.');
      });
    });
  }
  function feuilleFait(e, t) {
    var c = compteurDe(e);
    if (t.mode === 'echeance') {
      feuille(t.nom + ' renouvelée', '<form data-form="fait" novalidate><p class="petit" style="margin-top:0">' + esc(e.nom) + '</p><div class="champ"><label for="f-echeance">Nouvelle date de fin (écrite sur le papier)</label><input type="date" id="f-echeance" min="' + aujourdhui() + '"></div>' +
        '<div class="deux"><div class="champ"><label for="f-date">Payé le</label><input type="date" id="f-date" value="' + aujourdhui() + '" max="' + aujourdhui() + '"></div><div class="champ"><label for="f-montant">Montant</label>' + champNombre('f-montant', 0) + '</div></div>' +
        '<div class="champ"><label for="f-garage">Où (assureur, centre…)</label><input id="f-garage" maxlength="50"></div><p class="msg erreur" id="f-msg" role="alert"></p><button type="submit" class="btn plein large">' + ICO.ok + 'Enregistrer</button></form>', function (el) {
        $('form', el).addEventListener('submit', function (ev) {
          ev.preventDefault();
          var ech = $('#f-echeance').value, date = $('#f-date').value, msg = $('#f-msg');
          if (!CE.dateValide(ech)) { msg.textContent = 'Tapez la nouvelle date de fin.'; $('#f-echeance').focus(); return; }
          if (ech <= aujourdhui()) { msg.textContent = 'La nouvelle date de fin doit être après aujourd\'hui.'; return; }
          if (!CE.dateValide(date) || date > aujourdhui()) { msg.textContent = 'Date de paiement non valable.'; return; }
          var o = { id: 'o-' + CE.nouvelId().slice(0, 12), engin: e.id, categorie: 'papiers', libelle: t.nom + ' (jusqu\'au ' + CE.dateFr(ech) + ')', date: date, montant: CE.lireEntier($('#f-montant').value), compteur: 0, tache: t.id, garage: $('#f-garage').value.trim().slice(0, 50), note: '' };
          t.echeance = ech; t.dernier = { date: date, compteur: 0 };
          S.operations.push(o);
          enregistrer([['operations', o], ['engins', e]], t.nom + ' : valable jusqu\'au ' + CE.dateFr(ech) + '.');
        });
      });
      return;
    }
    var avecCompteur = !!e.unite;
    feuille(t.nom, '<form data-form="fait" novalidate><p class="petit" style="margin-top:0">' + esc(e.nom) + '</p>' +
      (t.checklist && t.checklist.length ? '<ul class="liste-coches" style="margin-bottom:10px">' + t.checklist.map(function (x, i) { return '<li><label><input type="checkbox" class="f-coche" value="' + esc(x) + '" id="fc-' + i + '">' + esc(x) + '</label></li>'; }).join('') + '</ul>' : '') +
      '<div class="champ"><label for="f-date">Fait le</label><input type="date" id="f-date" value="' + aujourdhui() + '" max="' + aujourdhui() + '"></div>' + (avecCompteur ? champCompteur(e, 'f-compteur', c, true) : '') +
      '<div class="deux"><div class="champ"><label for="f-montant">Montant (facultatif)</label>' + champNombre('f-montant', 0) + '</div><div class="champ"><label for="f-garage">Garage</label><input id="f-garage" maxlength="50" value="' + esc(e.garageNom || '') + '"></div></div>' +
      '<div class="champ"><label for="f-note">Note</label><input id="f-note" maxlength="120" placeholder="Ex. : huile 15W40, 4 litres"></div><p class="msg erreur" id="f-msg" role="alert"></p><button type="submit" class="btn plein large">' + ICO.ok + 'Enregistrer</button></form>', function (el) {
      $('form', el).addEventListener('submit', function (ev) {
        ev.preventDefault();
        var date = $('#f-date').value, compteur = avecCompteur ? lireCompteur(e, 'f-compteur') : 0, msg = $('#f-msg');
        if (!CE.dateValide(date) || date > aujourdhui()) { msg.textContent = 'Date non valable.'; return; }
        if (avecCompteur && (t.intKm || t.intH) && !compteur) { msg.textContent = 'Indiquez le compteur : il sert à calculer la prochaine fois.'; return; }
        var err = avecCompteur ? verifierCompteur(e, date, compteur) : '';
        if (err) { msg.textContent = err; return; }
        var o = { id: 'o-' + CE.nouvelId().slice(0, 12), engin: e.id, categorie: 'entretien', libelle: t.nom, date: date, montant: CE.lireEntier($('#f-montant').value), compteur: compteur, tache: t.id,
          garage: $('#f-garage').value.trim().slice(0, 50), note: $('#f-note').value.trim().slice(0, 120), coches: $$('.f-coche:checked', el).map(function (i) { return i.value; }) };
        if (!t.dernier || date >= t.dernier.date) t.dernier = { date: date, compteur: compteur };
        S.operations.push(o);
        var s = CE.etatTache(t, ctxDe(e));
        enregistrer([['operations', o], ['engins', e], ['kv', e.id, 'dernierEngin']], 'C\'est noté : ' + t.nom + '. Prochaine fois : ' + (s.compteurDu ? 'à ' + CE.compteurTxt(s.compteurDu, e.unite) : '') + (s.compteurDu && s.dateDu ? ' ou ' : '') + (s.dateDu ? 'le ' + CE.dateFr(s.dateDu) : '') + '.');
      });
    });
  }
  function feuilleReleve(e) {
    feuille('Mettre à jour le compteur', '<form data-form="releve" novalidate><p class="petit" style="margin-top:0">' + esc(e.nom) + ' · actuel : ' + esc(CE.compteurTxt(compteurDe(e), e.unite)) + '</p>' +
      '<div class="champ"><label for="r-date">Date</label><input type="date" id="r-date" value="' + aujourdhui() + '" max="' + aujourdhui() + '"></div>' + champCompteur(e, 'r-compteur', 0, true) +
      '<p class="msg erreur" id="r-msg" role="alert"></p><button type="submit" class="btn plein large">' + ICO.ok + 'Enregistrer</button></form>', function (el) {
      $('form', el).addEventListener('submit', function (ev) {
        ev.preventDefault();
        var date = $('#r-date').value, compteur = lireCompteur(e, 'r-compteur'), msg = $('#r-msg');
        if (!CE.dateValide(date) || date > aujourdhui()) { msg.textContent = 'Date non valable.'; return; }
        if (!compteur) { msg.textContent = 'Indiquez le compteur.'; return; }
        var err = verifierCompteur(e, date, compteur);
        if (err) { msg.textContent = err; return; }
        var r = { id: 'r-' + CE.nouvelId().slice(0, 12), engin: e.id, date: date, compteur: compteur };
        S.releves.push(r);
        enregistrer([['releves', r]], 'Compteur : ' + CE.compteurTxt(compteur, e.unite) + '.');
      });
    });
  }
  function feuilleTache(e, t) {
    var neuve = !t, u = e.unite, m = t || { nom: '', mode: 'periodique', intKm: 0, intH: 0, intMois: 0, dernier: null, echeance: '' };
    feuille(neuve ? 'Nouvel entretien' : 'Modifier', '<form data-form="tache" novalidate><div class="champ"><label for="t-nom">Nom</label><input id="t-nom" maxlength="60" value="' + esc(m.nom) + '" placeholder="Ex. : Lavage moteur, Contrôle des amortisseurs"></div>' +
      '<fieldset class="champ" style="border:0;padding:0;margin:0 0 14px"><legend class="etiquette">Comment le suivre ?</legend><label class="case"><input type="radio" name="t-mode" value="periodique"' + (m.mode !== 'echeance' ? ' checked' : '') + '>À refaire régulièrement</label>' +
      '<label class="case"><input type="radio" name="t-mode" value="echeance"' + (m.mode === 'echeance' ? ' checked' : '') + '>Une date de fin (assurance, papiers…)</label></fieldset>' +
      '<div id="t-periodique"' + (m.mode === 'echeance' ? ' hidden' : '') + '><div class="deux">' + (u ? '<div class="champ"><label for="t-int">Tous les</label>' + champNombre('t-int', u === 'km' ? m.intKm : m.intH, { suffixe: u }) + '</div>' : '') +
      '<div class="champ"><label for="t-mois">' + (u ? 'ou tous les' : 'Tous les') + '</label>' + champNombre('t-mois', m.intMois, { suffixe: 'mois' }) + '</div></div>' +
      '<p class="etiquette">La dernière fois</p><div class="deux"><div class="champ"><label for="t-der-date" class="petit">Date</label><input type="date" id="t-der-date" value="' + esc(m.dernier ? m.dernier.date : '') + '" max="' + aujourdhui() + '"></div>' +
      (u ? '<div class="champ"><label for="t-der-compteur" class="petit">Au compteur</label>' + champNombre('t-der-compteur', m.dernier ? m.dernier.compteur : 0, { suffixe: u }) + '</div>' : '') + '</div></div>' +
      '<div id="t-echeance-zone"' + (m.mode === 'echeance' ? '' : ' hidden') + '><div class="champ"><label for="t-echeance">Valable jusqu\'au (date écrite sur le papier)</label><input type="date" id="t-echeance" value="' + esc(m.echeance || '') + '"></div></div>' +
      '<p class="msg erreur" id="t-msg" role="alert"></p><div class="rang-btn">' + (neuve ? '' : '<button type="button" class="btn danger-sec" data-action="tache-supprimer" data-engin="' + esc(e.id) + '" data-tache="' + esc(t.id) + '">' + ICO.poubelle + 'Retirer</button>') +
      '<button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>', function (el) {
      el.addEventListener('change', function (ev) {
        if (ev.target.name !== 't-mode') return;
        var ech = ev.target.value === 'echeance';
        $('#t-periodique', el).hidden = ech; $('#t-echeance-zone', el).hidden = !ech;
      });
      $('form', el).addEventListener('submit', function (ev) {
        ev.preventDefault();
        var nom = $('#t-nom').value.trim(), mode = $('input[name=t-mode]:checked', el).value, msg = $('#t-msg');
        if (!nom) { msg.textContent = 'Donnez un nom.'; $('#t-nom').focus(); return; }
        var x = t || CE.nouvelleTache({ nom: nom, mode: mode });
        x.nom = nom.slice(0, 60); x.mode = mode;
        if (mode === 'echeance') {
          var ech = $('#t-echeance').value;
          if (ech && !CE.dateValide(ech)) { msg.textContent = 'Date non valable.'; return; }
          x.echeance = ech;
        } else {
          var inter = u ? CE.lireEntier($('#t-int').value) : 0, mois = CE.lireEntier($('#t-mois').value);
          if (!inter && !mois) { msg.textContent = 'Indiquez un rythme (' + (u ? (u === 'km' ? 'kilomètres' : 'heures') + ' ou ' : '') + 'mois).'; return; }
          if (u === 'km') x.intKm = inter; else if (u === 'h') x.intH = inter;
          x.intMois = Math.min(mois, 120);
          var dd = $('#t-der-date').value, dc = u ? CE.lireEntier($('#t-der-compteur').value) : 0;
          if (dd) {
            if (!CE.dateValide(dd) || dd > aujourdhui()) { msg.textContent = 'Date de la dernière fois non valable.'; return; }
            if (u && inter && !dc) { msg.textContent = 'Indiquez aussi le compteur de la dernière fois.'; return; }
            if (u && dc > compteurDe(e) && compteurDe(e)) { msg.textContent = 'Ce compteur dépasse le compteur actuel (' + CE.compteurTxt(compteurDe(e), u) + ').'; return; }
            x.dernier = { date: dd, compteur: dc };
          } else x.dernier = null;
        }
        if (neuve) e.taches.push(x);
        enregistrer([['engins', e]], 'Entretien enregistré.');
      });
    });
  }
  function enregistrer(ops, message) {
    return DB.lot(ops).then(function () {
      ops.forEach(function (o) { if (o[0] === 'kv' && o[2] === 'dernierEngin') S.dernierEngin = o[1]; });
      fermerFeuille(); router(); if (message) toast(message);
    }).catch(erreurStockage);
  }
  function supprimer(genre, id) {
    var liste = S[genre], x = trouver(liste, function (y) { return y.id === id; });
    if (!x) return;
    S[genre] = liste.filter(function (y) { return y.id !== id; });
    fermerFeuille();
    DB.effacer(genre, id).then(function () {
      router();
      toast('Supprimé.', { label: 'Annuler', fn: function () { S[genre].push(x); DB.mettre(genre, x).then(router); } });
    }).catch(erreurStockage);
  }

  // ---------- Ajouter (bouton +) ----------
  function vueAjouter() {
    if (!S.engins.length) { rediriger('#/nouveau'); return; }
    cadre({ titre: 'Ajouter', nav: 'ajouter' });
    var tries = enginsTries(), choisi = enginDe(S.dernierEngin) || tries[0];
    var h = '';
    if (tries.length > 1) h += '<p class="etiquette" id="t-choix">Pour</p><div class="types" role="radiogroup" aria-labelledby="t-choix" style="margin-bottom:16px">' + tries.map(function (e) {
      return '<button type="button" class="type" role="radio" data-choix-engin="' + esc(e.id) + '" aria-checked="' + (e.id === choisi.id) + '" aria-pressed="' + (e.id === choisi.id) + '" style="min-height:0"><span class="ico">' + iconeEngin(e) + '</span><b>' + esc(e.nom) + '</b>' + (modifiable(e) ? '' : '<small>Lecture seule</small>') + '</button>';
    }).join('') + '</div>';
    h += '<div id="actions-ajout"></div>';
    vue(h);
    actionsAjout(choisi);
  }
  function actionsAjout(e) {
    var T = CE.TYPES[e.type], z = $('#actions-ajout');
    if (!z) return;
    if (!modifiable(e)) { z.innerHTML = '<div class="bandeau alerte">' + ICO.cadenas + '<div><p>Ce carnet est en lecture seule sans pass.</p><a class="btn petit or" href="#/pass">Voir le pass</a></div></div>'; return; }
    var tuiles = [];
    if (T.carburant) tuiles.push(['plein', ICO.carburant, 'Un plein de carburant', 'Litres, montant et compteur']);
    tuiles.push(['fait-choix', ICO.outil, 'Un entretien fait', 'Vidange, filtre, nettoyage…']);
    tuiles.push(['operation', icone('reparation'), 'Une autre dépense', 'Réparation, pièce, papiers, lavage']);
    if (e.unite) tuiles.push(['releve', ICO.compteur, 'Le compteur', e.unite === 'km' ? 'Kilométrage du jour' : 'Heures de marche']);
    z.innerHTML = '<div class="pile">' + tuiles.map(function (t) {
      return '<button type="button" class="carte engin-carte" style="width:100%;text-align:left;font:inherit;cursor:pointer;margin:0" data-action="' + t[0] + '" data-engin="' + esc(e.id) + '"><span class="ico">' + t[1] + '</span><span><h2>' + esc(t[2]) + '</h2><p>' + esc(t[3]) + '</p></span></button>';
    }).join('') + '</div>';
  }
  function feuilleChoixTache(e) {
    var l = CE.aFaire([e], donnees(), aujourdhui());
    feuille('Quel entretien ?', '<ul class="taches">' + l.map(function (x) {
      return '<li><button type="button" class="ligne" data-choisir-tache="' + esc(x.tache.id) + '" style="border:0"><span class="ico ' + x.etat.statut + '">' + ICO.outil + '</span><span class="ligne-corps"><b>' + esc(x.tache.nom) + '</b><small>' + esc(x.etat.texte || '') + '</small></span></button></li>';
    }).join('') + '</ul><button type="button" class="btn sec large" data-action="tache-ajouter" data-engin="' + esc(e.id) + '">' + ICO.plus + 'Autre entretien (à ajouter au programme)</button>', function (el) {
      el.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-choisir-tache]');
        if (b) { var t = CE.tacheDe(e, b.dataset.choisirTache); fermerFeuille(); feuilleFait(e, t); }
      });
    });
  }

  // ---------- Rappels ----------
  function vueRappels() {
    cadre({ titre: 'Rappels', nav: 'rappels' });
    if (!S.engins.length) { vue('<section class="carte vide-etat">' + ICO.calendrier + '<p>Ajoutez un engin ou un appareil pour voir ses rappels.</p><a class="btn plein" href="#/nouveau">Ajouter</a></section>'); return; }
    var l = CE.aFaire(S.engins, donnees(), aujourdhui()), groupes = [['retard', 'En retard'], ['bientot', 'Bientôt'], ['inconnu', 'À compléter'], ['ok', 'Plus tard']];
    var h = '';
    groupes.forEach(function (g) {
      var x = l.filter(function (y) { return y.etat.statut === g[0]; });
      if (!x.length) return;
      h += '<section class="carte" id="rappels-' + g[0] + '"><div class="carte-tete"><h2>' + g[1] + '</h2><span class="statut ' + g[0] + '">' + x.length + '</span></div>' + (g[0] === 'inconnu' ? '<p class="petit">Notez la dernière fois (ou la date de fin) pour que l\'application calcule la suite.</p>' : '') +
        '<ul class="taches">' + x.map(function (y) { return ligneTache(y, true); }).join('') + '</ul></section>';
    });
    h += '<section class="carte"><h2>Dans l\'agenda du téléphone</h2><p class="petit">Téléchargez le fichier des prochaines dates puis ouvrez-le : le téléphone propose de les ajouter à son agenda, avec une alarme 7 jours avant et la veille. Refaites-le après chaque entretien pour mettre les dates à jour.</p>' +
      '<button type="button" class="btn plein large" data-action="ics">' + ICO.calendrier + 'Fichier agenda (.ics)</button></section>';
    vue(h);
  }
  function exporterICS(eid) {
    var engins = eid ? [enginDe(eid)] : S.engins;
    var ev = CE.evenementsRappel(CE.aFaire(engins, donnees(), aujourdhui()), aujourdhui());
    if (!ev.length) { toast('Aucune date à ajouter : notez d\'abord la dernière fois de vos entretiens.'); return; }
    telecharger(new Blob([CE.ics(ev, Date.now())], { type: 'text/calendar;charset=utf-8' }), 'rappels-entretien.ics');
    toast(ev.length + ' rappel' + (ev.length > 1 ? 's' : '') + ' dans le fichier agenda.');
  }

  // ---------- Dépenses (tous les engins) ----------
  function vueDepenses(anneeParam) {
    cadre({ titre: 'Dépenses', nav: 'depenses' });
    var an = /^\d{4}$/.test(anneeParam || '') ? anneeParam : aujourdhui().slice(0, 4);
    var hist = CE.historique(null, S.pleins, S.operations), t = CE.totauxDepenses(hist, function (l) { return l.date.slice(0, 4) === an; });
    var mc = aujourdhui().slice(0, 7), tMois = CE.totauxDepenses(hist, function (l) { return l.date.slice(0, 7) === mc; });
    var h = '<div class="mois-nav"><a class="icone-btn" href="#/depenses?annee=' + (+an - 1) + '" aria-label="Année ' + (+an - 1) + '">' + ICO.gauche + '</a><h1>' + an + '</h1>' +
      (an < aujourdhui().slice(0, 4) ? '<a class="icone-btn" href="#/depenses?annee=' + (+an + 1) + '" aria-label="Année ' + (+an + 1) + '">' + ICO.droite + '</a>' : '<span class="icone-btn" aria-hidden="true" style="visibility:hidden"></span>') + '</div>';
    h += '<div class="chiffres"><div><small>Total ' + an + '</small><strong id="total-annee">' + F(t.total) + '</strong><em>' + t.nb + ' dépense' + (t.nb > 1 ? 's' : '') + '</em></div><div><small>' + esc(CE.moisFr(mc)) + '</small><strong id="total-mois">' + F(tMois.total) + '</strong><em>ce mois-ci</em></div>' +
      '<div><small>Carburant ' + an + '</small><strong>' + F(t.parCategorie.carburant || 0) + '</strong></div><div><small>Entretien et réparations</small><strong>' + F((t.parCategorie.entretien || 0) + (t.parCategorie.reparation || 0) + (t.parCategorie.pieces || 0)) + '</strong></div></div>';
    if (t.total) {
      var maxE = 0; S.engins.forEach(function (e) { if ((t.parEngin[e.id] || 0) > maxE) maxE = t.parEngin[e.id]; });
      if (S.engins.length > 1) h += '<section class="carte"><h2>Par engin</h2><ul class="barres-cat">' + enginsTries().filter(function (e) { return t.parEngin[e.id]; }).map(function (e) {
        return '<li><div class="haut"><span>' + esc(e.nom) + '</span><b>' + F(t.parEngin[e.id]) + '</b></div><div class="barre"><i style="width:' + Math.round(t.parEngin[e.id] * 100 / maxE) + '%"></i></div></li>';
      }).join('') + '</ul></section>';
      var maxC = 0; CE.ORDRE_CATEGORIES.forEach(function (c) { if ((t.parCategorie[c] || 0) > maxC) maxC = t.parCategorie[c]; });
      h += '<section class="carte"><h2>Par catégorie</h2><ul class="barres-cat" id="par-categorie">' + CE.ORDRE_CATEGORIES.filter(function (c) { return t.parCategorie[c]; }).map(function (c) {
        return '<li><div class="haut"><span>' + esc(CE.CATEGORIES[c].nom) + '</span><b>' + F(t.parCategorie[c]) + '</b></div><div class="barre"><i style="width:' + Math.round(t.parCategorie[c] * 100 / maxC) + '%"></i></div></li>';
      }).join('') + '</ul></section>';
      var maxM = 0, mois = [];
      for (var i = 1; i <= 12; i++) { var k = an + '-' + CE.pad(i), v = t.parMois[k] || 0; mois.push([k, v]); if (v > maxM) maxM = v; }
      h += '<section class="carte"><h2>Mois par mois</h2><div class="colonnes" role="img" aria-label="Dépenses de chaque mois de ' + an + '">' + mois.map(function (x) {
        return '<div' + (x[0] === mc ? ' class="courant"' : '') + '><b>' + (x[1] >= 1000 ? Math.round(x[1] / 1000) + 'k' : x[1] ? N(x[1]) : '') + '</b><i style="height:' + (maxM ? Math.max(2, Math.round(x[1] * 100 / maxM)) : 2) + '%"></i></div>';
      }).join('') + '</div><div class="colonnes-legende">' + mois.map(function (x) { return '<span>' + CE.MOIS[+x[0].slice(5) - 1].slice(0, 1).toUpperCase() + '</span>'; }).join('') + '</div></section>';
    }
    var liste = hist.filter(function (l) { return l.date.slice(0, 4) === an && l.montant > 0; });
    h += '<section class="carte"><h2>Détail ' + an + ' (' + liste.length + ')</h2>' + (liste.length ? '' : '<p class="petit">Rien de noté pour cette année.</p>') + '<ul class="lignes">' + liste.slice(0, 60).map(function (l) {
      var e = enginDe(l.engin) || { nom: '', unite: '' };
      return '<li><a class="ligne" style="text-decoration:none;color:inherit" href="#/engin/' + esc(l.engin) + '?onglet=depenses"><span class="ico" style="width:38px;height:38px;border-radius:12px">' + icone(CE.CATEGORIES[l.categorie].icone) + '</span><span class="ligne-corps"><b>' + esc(l.libelle) +
        '</b><small>' + esc(CE.dateFr(l.date)) + ' · ' + esc(e.nom) + '</small></span><span class="ligne-montant">' + F(l.montant) + '</span></a></li>';
    }).join('') + '</ul>' + (liste.length > 60 ? '<p class="petit">… et ' + (liste.length - 60) + ' autres dans le fichier CSV.</p>' : '') + '</section>';
    h += '<section class="carte"><h2>Exporter</h2><p class="petit">Toutes les dépenses de tous vos engins, pour Excel.</p><button type="button" class="btn sec large" data-action="csv">' + ICO.tableau + 'Fichier CSV (Excel)</button></section>';
    vue(h);
  }
  function exporterCSV() {
    var csv = CE.csvHistorique(CE.historique(null, S.pleins, S.operations), S.engins);
    telecharger(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), 'carnet-entretien-depenses.csv');
    toast('Fichier CSV téléchargé.');
  }
  function exporterPDF(eid) {
    var e = enginDe(eid);
    if (!e) return;
    var montants = $('#pdf-montants') ? $('#pdf-montants').checked : true;
    toast('Préparation du PDF…');
    CEPdf.historique({ e: e, compteur: compteurDe(e), liste: CE.aFaire([e], donnees(), aujourdhui()), hist: CE.historique(e.id, S.pleins, S.operations),
      conso: CE.TYPES[e.type].carburant ? CE.consommation(CE.pleinsDe(S.pleins, e.id), e.unite) : null, cout: CE.coutToutCompris(e, S.pleins, S.operations, S.releves), montants: montants, proprietaire: S.profil.nom, aujourdhui: aujourdhui() })
      .then(function (blob) { telecharger(blob, 'carnet-entretien-' + e.nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.pdf'); toast('PDF de l\'historique téléchargé.'); })
      .catch(function (er) { toast(er && er.message ? er.message : 'PDF impossible.'); });
  }

  // ---------- Réglages, pass, sauvegarde, aide ----------
  function lireTheme() { try { return localStorage.getItem('ce-theme') || 'auto'; } catch (e) { return 'auto'; } }
  function appliquerTheme(v) {
    try { localStorage.setItem('ce-theme', v); } catch (e) { /* rien */ }
    var r = document.documentElement;
    if (v === 'clair') r.setAttribute('data-theme', 'light'); else if (v === 'sombre') r.setAttribute('data-theme', 'dark'); else r.removeAttribute('data-theme');
  }
  function lireGrand() { try { return localStorage.getItem('ce-grand') === '1'; } catch (e) { return false; } }
  function appliquerGrand(v) { try { localStorage.setItem('ce-grand', v ? '1' : '0'); } catch (e) { /* rien */ } document.documentElement.classList.toggle('grand', v); }
  function estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function estInstallee() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  var invite = null;
  function majInstall() { var b = $('#installer'); if (b) b.hidden = estInstallee() || !(invite || estIOS()); }
  function instructionsInstall() {
    if (estIOS()) return '<ol class="etapes"><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez le bouton <b>Partager</b> (carré avec une flèche vers le haut).</li><li>Choisissez <b>« Sur l\'écran d\'accueil »</b>, puis <b>Ajouter</b>.</li></ol>';
    return '<ol class="etapes"><li>Ouvrez cette page dans <b>Chrome</b>.</li><li>Touchez le menu <b>⋮</b> en haut à droite.</li><li>Choisissez <b>« Installer l\'application »</b> ou <b>« Ajouter à l\'écran d\'accueil »</b>.</li></ol>';
  }
  function installer() {
    if (invite) { invite.prompt(); invite.userChoice.then(function () { invite = null; majInstall(); }).catch(function () { /* rien */ }); return; }
    feuille('Installer l\'application', '<p>Ajoutez Carnet Entretien à l\'écran d\'accueil : elle s\'ouvrira comme une application, même sans Internet.</p>' + instructionsInstall());
  }
  function vueReglages() {
    cadre({ titre: 'Réglages', nav: 'reglages' });
    var e = etatPass(), theme = lireTheme();
    vue('<section class="carte"><h2>Propriétaire</h2><div class="champ"><label for="r-nom">Votre nom (facultatif)</label><input id="r-nom" maxlength="50" value="' + esc(S.profil.nom || '') + '"><small>Apparaît sur l\'historique PDF.</small></div></section>' +
      '<section class="carte"><ul class="menu">' +
      '<li><a href="#/pass"><span class="ico">' + ICO.etoile + '</span><span>Pass Carnet Entretien<small>' + (e.premium ? 'Actif jusqu\'au ' + esc(CE.dateFr(CE.dateISO(new Date(Date.parse(e.fin))))) : 'Version gratuite : 1 engin') + '</small></span>' + ICO.droite + '</a></li>' +
      '<li><a href="#/sauvegarde"><span class="ico">' + ICO.sauvegarde + '</span><span>Sauvegarde<small>' + (S.sauvegarde ? 'Dernière : ' + esc(CE.dateFr(S.sauvegarde.slice(0, 10))) : 'Aucune sauvegarde pour l\'instant') + '</small></span>' + ICO.droite + '</a></li>' +
      '<li><a href="#/aide"><span class="ico">' + ICO.aide + '</span><span>Aide et installation<small>Comment ça marche, installer sur le téléphone</small></span>' + ICO.droite + '</a></li></ul></section>' +
      '<section class="carte"><h2>Affichage</h2><div class="champ"><label for="r-theme">Thème</label><select id="r-theme"><option value="auto"' + (theme === 'auto' ? ' selected' : '') + '>Automatique (comme le téléphone)</option>' +
      '<option value="clair"' + (theme === 'clair' ? ' selected' : '') + '>Clair</option><option value="sombre"' + (theme === 'sombre' ? ' selected' : '') + '>Sombre</option></select></div>' +
      '<label class="case"><input type="checkbox" id="r-grand"' + (lireGrand() ? ' checked' : '') + '>Texte plus grand</label></section>' +
      (estInstallee() ? '' : '<section class="carte"><h2>Installer l\'application</h2>' + (invite ? '<button type="button" class="btn plein large" data-action="installer">' + ICO.installer + 'Installer Carnet Entretien</button>' : instructionsInstall()) + '</section>') +
      '<section class="carte"><h2>Vos données</h2><p class="petit">Tout reste sur ce téléphone : aucun compte, rien n\'est envoyé. Seule la vérification du pass utilise Internet, une fois. L\'application ne donne pas de conseils de réparation : pour un problème, voyez un mécanicien ou un technicien.</p>' +
      '<button type="button" class="btn danger-sec large" data-action="tout-effacer">' + ICO.poubelle + 'Effacer toutes mes données</button></section>' +
      '<p class="petit centre">Carnet Entretien ' + VERSION + ' · TERANGA · <a href="../">Toutes nos applications</a></p>');
  }
  function vuePass(q) {
    cadre({ titre: 'Pass Carnet Entretien', retour: '#/reglages', nav: 'reglages' });
    var e = etatPass(), pre = q && q.get('code') || '';
    var atouts = ['Autant d\'engins et d\'appareils que vous voulez : voiture, moto, groupe, clims, pompe, frigo', 'Rappels de tous vos entretiens et papiers au même endroit',
      'Dépenses par engin et coût tout compris par km ou par heure', 'Historique PDF de chaque engin pour la revente', 'Fichier agenda (.ics) de toutes vos échéances'];
    var h = '';
    if (e.premium) {
      h += '<section class="carte offre" id="pass-actif"><div class="bandeau ok">' + ICO.ok + '<p><b>Pass actif</b> jusqu\'au ' + esc(CE.dateFr(CE.dateISO(new Date(Date.parse(e.fin))))) + ' (' + e.joursRestants + ' jour' + (e.joursRestants > 1 ? 's' : '') + ').</p></div>' +
        '<ul class="atouts">' + atouts.map(function (a) { return '<li>' + ICO.ok + '<span>' + esc(a) + '</span></li>'; }).join('') + '</ul>' +
        (e.rappel ? '<p><b>Votre pass se termine bientôt.</b> Un nouveau pass s\'ajoute à la fin de celui-ci : vous ne perdez aucun jour.</p><a class="btn or large" href="' + URL_ACHAT + '" target="_blank" rel="noopener">' + ICO.boutique + 'Renouveler (' + N(CE.PASS.prix) + ' F)</a>' : '') + '</section>';
    } else {
      if (e.expire) h += '<div class="bandeau alerte">' + ICO.info + '<p>Votre pass s\'est terminé le ' + esc(CE.dateFr(CE.dateISO(new Date(Date.parse(e.fin))))) + '. Tout votre historique est gardé ; renouvelez pour modifier tous vos carnets.</p></div>';
      h += '<section class="carte offre"><h1>Passez au Pass Carnet Entretien</h1><ul class="atouts">' + atouts.map(function (a) { return '<li>' + ICO.ok + '<span>' + esc(a) + '</span></li>'; }).join('') + '</ul>' +
        '<p class="prix">' + N(CE.PASS.prix) + ' F <small>pour 12 mois, payé une fois par Wave, sans renouvellement automatique</small></p>' +
        '<a class="btn or large" id="lien-achat" href="' + URL_ACHAT + '" target="_blank" rel="noopener">' + ICO.boutique + 'Acheter le pass (Wave)</a></section>';
    }
    h += '<form class="carte" data-form="pass" novalidate><h2>' + (e.premium ? 'Ajouter un autre pass' : 'Activer mon pass') + '</h2><ol class="etapes"><li>Achetez « Pass Carnet Entretien 12 mois » dans la boutique TERANGA et payez par Wave.</li>' +
      '<li>Sur la page de votre commande payée, copiez le lien de la page.</li><li>Collez-le ci-dessous puis touchez « Activer ».</li></ol><div class="champ"><label for="c-code">Lien de votre commande</label>' +
      '<textarea id="c-code" rows="3" placeholder="https://…/boutique/commande.html?o=TCV-…&amp;t=…" autocomplete="off" autocapitalize="off" spellcheck="false">' + esc(pre) + '</textarea></div>' +
      '<p class="msg" id="msg-pass" role="status" aria-live="polite"></p><button type="submit" class="btn plein large" id="btn-activer">' + ICO.etoile + 'Activer</button>' +
      '<p class="petit">Internet est nécessaire une seule fois pour vérifier la commande. Ensuite tout marche hors ligne.</p></form>' +
      '<section class="carte"><h2>Toujours gratuit</h2><p class="petit">1 engin ou appareil avec tout son carnet : programme d\'entretien, rappels, carburant, dépenses, PDF, fichier agenda, sauvegarde et export CSV. Quand un pass se termine, rien n\'est effacé.</p></section>';
    vue(h);
    if (pre && !e.premium) activer(pre);
  }
  function activer(texte) {
    var msg = $('#msg-pass'), btn = $('#btn-activer');
    var dire = function (m, genre) { if (msg) { msg.textContent = m; msg.className = 'msg' + (genre ? ' ' + genre : ''); } };
    var c = CE.lireLienCommande(texte);
    if (!c) return dire('Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « TCV- »).', 'erreur');
    if (navigator.onLine === false) return dire('Vous êtes hors ligne. Connectez-vous à Internet une fois pour activer.', 'erreur');
    dire('Vérification de votre commande…');
    if (btn) btn.disabled = true;
    fetch(CE.urlVerification(c), { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (r.status === 404) throw { m: 'Commande introuvable. Vérifiez que vous avez copié le lien complet.' };
      if (!r.ok) throw { m: 'Le service de vérification ne répond pas. Réessayez dans un instant.' };
      return r.json();
    }).then(function (j) {
      var v = CE.analyserReponse(j, Date.now());
      if (!v.ok) {
        if (v.raison === 'impayee') throw { m: 'Le paiement de cette commande n\'est pas encore confirmé. Terminez le paiement Wave, attendez la confirmation, puis réessayez.' };
        if (v.raison === 'produit') throw { m: 'Ce lien correspond à un autre achat' + (v.titre ? ' (« ' + v.titre + ' »)' : '') + '. Il faut le lien de la commande « Pass Carnet Entretien 12 mois ».' };
        if (v.raison === 'expiree') throw { m: 'Ce pass est terminé depuis le ' + CE.dateFr(CE.dateISO(new Date(Date.parse(v.fin)))) + '. Achetez un nouveau pass pour continuer.' };
        throw { m: 'Commande introuvable.' };
      }
      S.passes = CE.ajouterPass(S.passes, v.pass, Date.now());
      return DB.mettre('kv', S.passes, 'passes').then(function () {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { /* rien */ });
        toast('Pass activé. Merci !');
        majBadge();
        rediriger('#/pass');
      });
    }).catch(function (e) {
      if (btn) btn.disabled = false;
      dire(e && e.m ? e.m : 'Pas de connexion au service. Vérifiez Internet et réessayez.', 'erreur');
    });
  }
  function vueSauvegarde() {
    cadre({ titre: 'Sauvegarde', retour: S.engins.length ? '#/reglages' : '#/', nav: 'reglages' });
    vue('<section class="carte"><h2>Sauvegarder</h2><p>Un fichier avec tous vos carnets : engins, entretiens, pleins et dépenses. Gardez-le en lieu sûr (envoyez-le-vous sur WhatsApp ou copiez-le sur une carte mémoire).</p>' +
      '<p class="petit">' + (S.sauvegarde ? 'Dernière sauvegarde : ' + esc(CE.dateFr(S.sauvegarde.slice(0, 10))) : 'Aucune sauvegarde pour l\'instant.') + '</p>' +
      '<button type="button" class="btn plein large" data-action="exporter-json">' + ICO.telecharger + 'Télécharger la sauvegarde</button></section>' +
      '<section class="carte"><h2>Restaurer une sauvegarde</h2><p>Remplace toutes les données de ce téléphone par celles du fichier choisi.</p>' +
      '<label class="btn sec large" for="f-import">' + ICO.restaurer + 'Choisir le fichier de sauvegarde</label><input type="file" id="f-import" class="vh" accept=".json,application/json"></section>' +
      '<section class="carte"><h2>Toutes les dépenses en CSV</h2><p class="petit">Pour Excel ou une autre application. Toujours disponible, avec ou sans pass.</p><button type="button" class="btn sec large" data-action="csv">' + ICO.tableau + 'Télécharger le CSV</button></section>');
  }
  function exporterJSON() {
    var data = { app: 'carnet-entretien', version: 1, exporte: new Date().toISOString(), kv: { profil: S.profil }, engins: S.engins, pleins: S.pleins, operations: S.operations, releves: S.releves };
    telecharger(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), 'carnet-entretien-sauvegarde-' + aujourdhui() + '.json');
    S.sauvegarde = new Date().toISOString();
    DB.mettre('kv', S.sauvegarde, 'sauvegarde').then(function () { toast('Sauvegarde téléchargée.'); if (location.hash === '#/sauvegarde') vueSauvegarde(); });
  }
  function importerJSON(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var data;
      try { data = JSON.parse(lecteur.result); } catch (e) { toast('Fichier illisible : ce n\'est pas une sauvegarde Carnet Entretien.'); return; }
      if (!data || data.app !== 'carnet-entretien' || !Array.isArray(data.engins) || !Array.isArray(data.pleins) || !Array.isArray(data.operations)) { toast('Ce fichier n\'est pas une sauvegarde Carnet Entretien.'); return; }
      confirmer('Remplacer toutes les données de ce téléphone par la sauvegarde du ' + CE.dateFr(String(data.exporte || '').slice(0, 10)) + ' (' + data.engins.length + ' engin' + (data.engins.length > 1 ? 's' : '') + ', ' + (data.pleins.length + data.operations.length) + ' dépenses) ?', 'Restaurer', true).then(function (oui) {
        if (!oui) return;
        var ok = function (x) { return x && x.id; };
        DB.remplacer({ kv: { profil: (data.kv && data.kv.profil) || { nom: '' } }, engins: data.engins.filter(function (e) { return ok(e) && Array.isArray(e.taches); }), pleins: data.pleins.filter(ok), operations: data.operations.filter(ok), releves: (data.releves || []).filter(ok) }, ['passes'])
          .then(charger).then(function () { toast('Sauvegarde restaurée.'); rediriger('#/'); }).catch(erreurStockage);
      });
    };
    lecteur.readAsText(fichier);
  }
  function vueAide() {
    cadre({ titre: 'Aide', retour: '#/reglages', nav: 'reglages' });
    vue('<section class="carte"><h2>Comment ça marche</h2><ol class="etapes"><li><b>Ajoutez un engin ou un appareil</b> : voiture, moto ou Jakarta, groupe électrogène, climatiseur, pompe, réfrigérateur. Un programme d\'entretien est proposé ; changez les rythmes à votre convenance.</li>' +
      '<li><b>Notez la dernière fois</b> de chaque entretien, et les dates de fin de vos papiers (assurance, visite technique, vignette) telles qu\'elles sont écrites.</li>' +
      '<li><b>À chaque plein</b>, notez les litres, le montant et le compteur : l\'application calcule la consommation (L/100 km, ou L/heure pour un groupe) et le coût par km ou par heure.</li>' +
      '<li><b>Les rappels</b> s\'affichent sur l\'accueil et dans « Rappels ». Vous pouvez aussi télécharger un fichier agenda (.ics) et l\'ajouter vous-même à l\'agenda du téléphone.</li>' +
      '<li><b>Pour vendre</b> : le PDF de l\'historique montre tous les entretiens notés.</li></ol></section>' +
      '<section class="carte"><h2>Installer sur le téléphone</h2>' + instructionsInstall() + '</section>' +
      '<section class="carte"><h2>Bon à savoir</h2><p>Les rythmes proposés sont indicatifs. Suivez le carnet du constructeur et l\'avis de votre mécanicien ou technicien. L\'application ne donne pas de conseils de réparation : elle sert à se souvenir et à compter.</p>' +
      '<p class="petit">Vos notes restent sur votre téléphone. Faites une sauvegarde chaque mois.</p></section>' +
      '<p class="petit centre"><a href="../">Toutes nos applications</a> · <a href="../../boutique/">Boutique TERANGA</a></p>');
  }
  function toutEffacer() {
    confirmer('Effacer définitivement tous vos carnets, pleins et dépenses de ce téléphone ? Faites d\'abord une sauvegarde.', 'Tout effacer', true).then(function (oui) {
      if (!oui) return;
      DB.toutEffacer(['passes']).then(function () {
        S.engins = []; S.pleins = []; S.operations = []; S.releves = []; S.profil = { nom: '' }; S.sauvegarde = null; S.dernierEngin = null;
        toast('Données effacées.'); rediriger('#/');
      }).catch(erreurStockage);
    });
  }
  function erreurStockage(e) { toast('Enregistrement impossible : ' + (e && e.message ? e.message : 'stockage plein ou indisponible') + '.', null, 'danger'); }

  // ---------- Événements ----------
  function enginBouton(b) { return enginDe(b.dataset.engin); }
  function siModifiable(e, fn) { if (!e) return; if (!modifiable(e)) { feuillePass('modif'); return; } fn(); }
  var ACTIONS = {
    'nouvel-engin': function () { if (!CE.peutCreerEngin(S.engins, premium())) { feuillePass('engin'); return; } aller('#/nouveau'); },
    'plein': function (b) { var e = enginBouton(b); siModifiable(e, function () { feuillePlein(e, b.dataset.id); }); },
    'operation': function (b) { var e = enginBouton(b); siModifiable(e, function () { feuilleOperation(e, b.dataset.id); }); },
    'releve': function (b) { var e = enginBouton(b); siModifiable(e, function () { feuilleReleve(e); }); },
    'fait': function (b) { var e = enginBouton(b); siModifiable(e, function () { feuilleFait(e, CE.tacheDe(e, b.dataset.tache)); }); },
    'fait-choix': function (b) { var e = enginBouton(b); siModifiable(e, function () { feuilleChoixTache(e); }); },
    'tache-modifier': function (b) { var e = enginBouton(b); siModifiable(e, function () { feuilleTache(e, CE.tacheDe(e, b.dataset.tache)); }); },
    'tache-ajouter': function (b) { var e = enginBouton(b); siModifiable(e, function () { feuilleTache(e, null); }); },
    'tache-supprimer': function (b) {
      var e = enginBouton(b), t = e && CE.tacheDe(e, b.dataset.tache);
      if (!t) return;
      fermerFeuille();
      confirmer('Retirer « ' + t.nom + ' » du programme ? L\'historique déjà noté reste.', 'Retirer', true).then(function (oui) {
        if (!oui) return;
        e.taches = e.taches.filter(function (x) { return x.id !== t.id; });
        DB.mettre('engins', e).then(function () { rediriger('#/engin/' + e.id); toast('Entretien retiré.'); }).catch(erreurStockage);
      });
    },
    'supprimer': function (b) { supprimer(b.dataset.genre, b.dataset.id); },
    'engin-supprimer': function (b) {
      var e = enginBouton(b); if (!e) return;
      confirmer('Supprimer le carnet « ' + e.nom + ' » avec tout son historique (entretiens, pleins, dépenses) ?', 'Supprimer', true).then(function (oui) {
        if (!oui) return;
        var ops = [['-', 'engins', e.id]];
        S.pleins.filter(function (x) { return x.engin === e.id; }).forEach(function (x) { ops.push(['-', 'pleins', x.id]); });
        S.operations.filter(function (x) { return x.engin === e.id; }).forEach(function (x) { ops.push(['-', 'operations', x.id]); });
        S.releves.filter(function (x) { return x.engin === e.id; }).forEach(function (x) { ops.push(['-', 'releves', x.id]); });
        DB.lot(ops).then(function () {
          S.engins = S.engins.filter(function (x) { return x.id !== e.id; });
          ['pleins', 'operations', 'releves'].forEach(function (g) { S[g] = S[g].filter(function (x) { return x.engin !== e.id; }); });
          rediriger('#/'); toast('Carnet supprimé.');
        }).catch(erreurStockage);
      });
    },
    'ics': function (b) { exporterICS(b.dataset.engin); },
    'pdf': function (b) { exporterPDF(b.dataset.engin); },
    'csv': function () { exporterCSV(); },
    'exporter-json': function () { exporterJSON(); },
    'tout-effacer': function () { toutEffacer(); },
    'installer': function () { installer(); },
    'pass-vu': function () { var e = etatPass(); S.passVu = e.fin; DB.mettre('kv', e.fin, 'passVu'); var b = $('#bandeau-pass'); if (b) b.remove(); }
  };
  function brancher() {
    document.addEventListener('click', function (e) {
      var c = e.target.closest('[data-choix-engin]');
      if (c) {
        $$('[data-choix-engin]').forEach(function (x) { var on = x === c; x.setAttribute('aria-checked', String(on)); x.setAttribute('aria-pressed', String(on)); });
        S.dernierEngin = c.dataset.choixEngin; DB.mettre('kv', S.dernierEngin, 'dernierEngin');
        actionsAjout(enginDe(c.dataset.choixEngin));
        return;
      }
      var t = e.target.closest('[data-action]');
      if (!t || t.disabled) return;
      var a = t.dataset.action;
      if (ACTIONS[a]) { if (t.tagName === 'A') e.preventDefault(); ACTIONS[a](t, e); }
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el.id === 'r-nom') { S.profil.nom = el.value.trim().slice(0, 50); DB.mettre('kv', S.profil, 'profil').then(function () { toast('Enregistré.'); }); return; }
      if (el.id === 'r-theme') { appliquerTheme(el.value); return; }
      if (el.id === 'r-grand') { appliquerGrand(el.checked); return; }
      if (el.id === 'f-import' && el.files && el.files[0]) { importerJSON(el.files[0]); el.value = ''; }
    });
    document.addEventListener('focusout', function (e) {
      var el = e.target;
      if (el.classList && el.classList.contains('montant') && el.value && el.getAttribute('inputmode') === 'numeric') { var v = CE.lireEntier(el.value); el.value = v ? N(v, ' ') : ''; }
    });
    document.addEventListener('submit', function (e) {
      var f = e.target;
      if (f.dataset.form === 'engin') { e.preventDefault(); creerEngin(f); }
      else if (f.dataset.form === 'pass') { e.preventDefault(); activer($('#c-code').value); }
      else if (f.dataset.form === 'infos') {
        e.preventDefault();
        var en = enginDe(f.dataset.engin); if (!en || !modifiable(en)) return;
        en.nom = $('#i-nom').value.trim().slice(0, 50) || en.nom;
        if ($('#i-immat')) { en.immat = $('#i-immat').value.trim().toUpperCase().slice(0, 20); en.annee = CE.lireEntier($('#i-annee').value) || ''; }
        if ($('#i-carburant')) en.carburant = $('#i-carburant').value;
        en.garageNom = $('#i-garage').value.trim().slice(0, 50); en.garageTel = $('#i-tel').value.trim().slice(0, 20); en.note = $('#i-note').value.trim().slice(0, 500);
        enregistrer([['engins', en]], 'Informations enregistrées.');
      }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && feuilleOuverte) fermerFeuille(); });
    $('#retour').addEventListener('click', function () { aller($('#retour').dataset.vers || '#/'); });
    $('#installer').addEventListener('click', installer);
    window.addEventListener('hashchange', router);
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; majInstall(); });
    window.addEventListener('appinstalled', function () { invite = null; majInstall(); toast('Application installée.'); });
  }
  var majDemandee = false;
  function serviceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      var proposer = function () { toast('Nouvelle version de l\'application disponible.', { label: 'Mettre à jour', fn: function () { majDemandee = true; if (reg.waiting) reg.waiting.postMessage('maj'); } }); };
      if (reg.waiting && navigator.serviceWorker.controller) proposer();
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        if (w) w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) proposer(); });
      });
    }).catch(function () { /* hors ligne au premier chargement */ });
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (majDemandee) { majDemandee = false; location.reload(); } });
  }
  function demarrer() {
    brancher();
    majInstall();
    var p = new URLSearchParams(location.search);
    if (p.get('o') && p.get('t')) history.replaceState(null, '', location.pathname + '#/pass?code=' + encodeURIComponent('?o=' + p.get('o') + '&t=' + p.get('t')));
    charger().then(router).catch(function (e) {
      vue('<section class="carte"><h1>Stockage indisponible</h1><p>' + esc(e && e.message || e) + '</p><p>Sur iPhone, quittez la navigation privée. Sinon, mettez à jour votre navigateur.</p></section>');
    });
    serviceWorker();
  }
  window.CEApp = { etat: S, version: VERSION };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
