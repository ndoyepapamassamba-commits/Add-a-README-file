/* Budget Famille (TERANGA) — interface. Toutes les données restent sur le téléphone (IndexedDB).
   Seule la vérification du pass contacte la boutique, une fois, quand l'utilisateur colle le lien de sa commande. */
(function () {
  'use strict';
  var VERSION = '1.0.0';
  var URL_ACHAT = '../../boutique/' + BF.PASS.slug + '.html';
  var MOIS_MS = 30 * BF.JOUR_MS;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var F = BF.f, N = BF.formatNombre;
  function trouver(liste, fn) { for (var i = 0; i < liste.length; i++) if (fn(liste[i])) return liste[i]; return null; }

  // ---------- Icônes (traits, 24 × 24) ----------
  function svg(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + p + '</svg>'; }
  var DESSINS = {
    panier: '<path d="M4 10h16l-1.6 9.2a1 1 0 0 1-1 .8H6.6a1 1 0 0 1-1-.8z"/><path d="M8 10l3-6M16 10l-3-6M9 14v3M12 14v3M15 14v3"/>',
    maison: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>',
    eclair: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    compteur: '<rect x="4" y="3" width="16" height="18" rx="2"/><rect x="7" y="6" width="10" height="4" rx="1"/><path d="M12.5 12.5l-2 3h3l-2 3"/>',
    goutte: '<path d="M12 3s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z"/>',
    flamme: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.5 1 2.5 2 3 0-3-.5-5.5.5-8z"/>',
    bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 18v2.5M16 18v2.5"/><circle cx="8" cy="14.5" r=".9"/><circle cx="16" cy="14.5" r=".9"/>',
    livre: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
    sante: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M12 9v5M9.5 11.5h5"/>',
    mains: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5M15 15c2.8-.4 5.2 1.4 6 4.5"/>',
    tontine: '<circle cx="12" cy="5" r="2.2"/><circle cx="18.5" cy="12" r="2.2"/><circle cx="12" cy="19" r="2.2"/><circle cx="5.5" cy="12" r="2.2"/><path d="M15 6.5l1.8 2.5M16.8 15l-1.8 2.5M9 17.5 7.2 15M7.2 9 9 6.5"/>',
    telephone: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>',
    tirelire: '<path d="M4.5 12a7 6 0 0 1 12.8-3.4L20 7.5v3.6l1 .9v3h-2a7 6 0 0 1-3 2.6V20h-3v-1.6a8 8 0 0 1-2 0V20H8v-2.6A6.2 6.2 0 0 1 4.5 12z"/><path d="M9.5 7.2a6 6 0 0 1 4 0"/><circle cx="16.5" cy="11" r=".8"/>',
    divers: '<circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/>',
    etoile: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    habits: '<path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
    coiffure: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5 20 18M8 15.5 20 6"/>',
    cadeau: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8S10.5 3 8 4s.5 4 4 4zM12 8s1.5-5 4-4-.5 4-4 4z"/>',
    outil: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.5-.5-2.4z"/>',
    cartable: '<rect x="5" y="7" width="14" height="14" rx="3"/><path d="M9 7V5a3 3 0 0 1 6 0v2M5 13h14M11 13v2h2v-2"/>',
    mouton: '<path d="M8.5 8.7a2.5 2.5 0 0 1 4-1.6 2.5 2.5 0 0 1 4 .6 2.5 2.5 0 0 1 2.4 3 2.5 2.5 0 0 1-1.1 4.4 2.5 2.5 0 0 1-3.5 1 2.5 2.5 0 0 1-3.8 0 2.5 2.5 0 0 1-2.9-2.4"/><ellipse cx="6" cy="10.8" rx="2.6" ry="2.1"/><path d="M10.5 17v3M15.5 17v3M4.5 9.3 3.3 8.4"/>',
    lune: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    route: '<path d="M8 3 4 21M16 3l4 18M12 5v2M12 11v2M12 17v2"/>',
    bebe: '<path d="M10 2h4v3h-4z"/><path d="M9 5h6l1 3v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8z"/><path d="M8 11h3M8 14h3"/>',
    anneaux: '<circle cx="9" cy="14" r="5"/><circle cx="15" cy="14" r="5"/><path d="M10 5l2-2 2 2-2 2z"/>'
  };
  function icone(nom) { return svg(DESSINS[nom] || DESSINS.divers); }
  var ICO = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    gauche: svg('<path d="M15 18l-6-6 6-6"/>'),
    droite: svg('<path d="M9 18l6-6-6-6"/>'),
    ok: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    alerte: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.2v.3"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.3"/>'),
    cadenas: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
    telecharger: svg('<path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5"/><path d="M4 17v3h16v-3"/>'),
    pdf: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    tableau: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>'),
    wa: svg('<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z"/>'),
    calendrier: svg('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    note: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    effacer: svg('<path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z"/><path d="M12 9.5l5 5M17 9.5l-5 5"/>'),
    sauvegarde: svg('<path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
    etoile: svg(DESSINS.etoile),
    aide: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17v.3"/>'),
    budget: svg('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>'),
    boutique: svg('<path d="M4 8h16l-1.5 12h-13z"/><path d="M8.5 8a3.5 3.5 0 0 1 7 0"/>'),
    poubelle: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    crayon: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
    installer: svg('<path d="M12 3v11m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="4" rx="1"/>'),
    restaurer: svg('<path d="M12 21V9m0 0-4.5 4.5M12 9l4.5 4.5"/><path d="M4 7V4h16v3"/>')
  };

  // ---------- État ----------
  var S = { profil: { foyer: '' }, reglages: { seuil: 80 }, plans: [], depenses: [], projets: [], passes: [], sauvegarde: null,
    derniereEnv: 'quotidien', nouveauMois: null, mois: null, passVu: null };
  function aujourdhui() { return BF.dateISO(new Date()); }
  function moisActuel() { return aujourdhui().slice(0, 7); }
  function etatPass() { return BF.etatPass(S.passes, Date.now()); }
  function premium() { return etatPass().premium; }
  function planDe(m) { return trouver(S.plans, function (p) { return p.mois === m; }); }
  function synthese(m) { return BF.syntheseMois(planDe(m), S.depenses, S.projets, m, aujourdhui(), S.reglages.seuil); }
  function projetDe(id) { return trouver(S.projets, function (p) { return p.id === id; }); }

  function charger() {
    return Promise.all([DB.lire('kv', 'profil'), DB.lire('kv', 'reglages'), DB.lire('kv', 'passes'), DB.lire('kv', 'sauvegarde'), DB.lire('kv', 'derniereEnv'),
      DB.tout('plans'), DB.tout('depenses'), DB.tout('projets'), DB.lire('kv', 'passVu')]).then(function (r) {
      S.profil = r[0] || { foyer: '' };
      S.reglages = Object.assign({ seuil: 80 }, r[1] || {});
      S.passes = r[2] || []; S.sauvegarde = r[3] || null; S.derniereEnv = r[4] || 'quotidien';
      S.plans = r[5] || []; S.depenses = r[6] || []; S.projets = r[7] || []; S.passVu = r[8] || null;
      return assurerMoisCourant();
    });
  }
  // Nouveau mois : le budget est repris automatiquement du dernier mois connu
  function assurerMoisCourant() {
    var m = moisActuel();
    if (!S.plans.length || planDe(m)) return Promise.resolve(false);
    var ref = BF.planReference(S.plans, m);
    if (!ref) return Promise.resolve(false);
    var p = BF.copierPlan(ref, m);
    S.plans.push(p);
    S.nouveauMois = { de: ref.mois, mois: m };
    return DB.mettre('plans', p).then(function () { return true; });
  }

  // ---------- Petits outils d'interface ----------
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
    var f1 = fond.querySelector('.feuille-corps input:not([type=hidden]):not([type=checkbox]), .feuille-corps select, .feuille-corps textarea, .feuille-corps button, .feuille-corps a');
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
  // Redirection sans événement « hashchange » (évite de refermer une feuille ouverte juste après)
  function rediriger(h) { history.replaceState(null, '', h); router(); }
  function vue(html) { var v = $('#vue'); v.innerHTML = html; }
  function cadre(o) {
    $('#titre').textContent = o.titre || 'Budget Famille';
    document.title = (o.titre && o.titre !== 'Budget Famille' ? o.titre + ' · ' : '') + 'Budget Famille';
    var r = $('#retour');
    r.hidden = !o.retour; r.dataset.vers = o.retour || '';
    $('#marque').hidden = !!o.retour;
    $$('#nav a').forEach(function (a) { a.classList.toggle('actif', a.dataset.nav === o.nav); if (a.dataset.nav === o.nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.body.classList.toggle('saisie', !!o.saisie);
    majBadge();
  }
  function majBadge() {
    var b = $('#badge-pass'), e = etatPass();
    b.textContent = e.premium ? 'Pass' : 'Gratuit';
    b.classList.toggle('actif', e.premium);
    b.setAttribute('aria-label', e.premium ? 'Pass actif : voir le détail' : 'Version gratuite : voir le pass');
  }
  function champMontant(id, valeur, label, extra) {
    return '<div class="suffixe"><input type="text" inputmode="numeric" autocomplete="off" class="montant" id="' + id + '" value="' + (valeur ? N(valeur, ' ') : '') + '"' +
      (label ? ' aria-label="' + esc(label) + '"' : '') + (extra || '') + ' placeholder="0"></div>';
  }
  function libNiveau(e) {
    if (e.niveau === 'depasse') return 'Dépassé de ' + F(-e.reste);
    if (e.niveau === 'epuise') return 'Vide : plus rien à dépenser';
    if (e.niveau === 'alerte') return 'Presque vide : reste ' + F(e.reste);
    if (e.niveau === 'hors') return F(e.depense) + ' hors budget';
    return 'Reste ' + F(e.reste);
  }
  function largeur(pct) { return Math.max(0, Math.min(100, pct)); }

  function feuillePass(raison) {
    var txt = {
      mois: 'La version gratuite montre le mois en cours. Avec le pass, revenez sur tous vos mois passés, leurs dépenses et leurs rapports.',
      projet: 'La version gratuite permet 1 budget spécial en cours. Avec le pass, préparez en même temps la Tabaski, la rentrée, la Korité, un baptême…',
      comparer: 'Avec le pass, comparez chaque mois au mois précédent et suivez vos dépenses sur 6 mois.',
      date: 'La version gratuite enregistre les dépenses du mois en cours. Avec le pass, ajoutez une dépense à n\'importe quelle date.'
    }[raison] || 'Cette fonction fait partie du pass.';
    feuille('Avec le pass', '<p>' + esc(txt) + '</p><p class="prix">' + N(BF.PASS.prix) + ' F <small>pour 12 mois, payé une fois par Wave</small></p>' +
      '<div class="pile"><a class="btn or large" href="#/pass">' + ICO.etoile + 'Voir le pass</a><button type="button" class="btn sec large" data-fermer>Plus tard</button></div>');
  }

  // ---------- Routeur ----------
  var ROUTES = [
    [/^\/$/, function () { vueAccueil(); }],
    [/^\/mois\/(\d{4}-\d{2})$/, function (m) { vueAccueil(m[1]); }],
    [/^\/bienvenue$/, function () { vueBienvenue(); }],
    [/^\/plan(?:\/(\d{4}-\d{2}))?$/, function (m) { vuePlan(m[1]); }],
    [/^\/ajouter$/, function (m, q) { vueAjouter(q); }],
    [/^\/enveloppe\/([\w-]+)(?:\/(\d{4}-\d{2}))?$/, function (m) { vueEnveloppe(m[1], m[2]); }],
    [/^\/projets$/, function () { vueProjets(); }],
    [/^\/projet-nouveau$/, function () { vueNouveauProjet(); }],
    [/^\/projet\/([\w-]+)$/, function (m) { vueProjet(m[1]); }],
    [/^\/rapport(?:\/(\d{4}-\d{2}))?$/, function (m) { vueRapport(m[1]); }],
    [/^\/reglages$/, function () { vueReglages(); }],
    [/^\/pass$/, function (m, q) { vuePass(q); }],
    [/^\/sauvegarde$/, function () { vueSauvegarde(); }],
    [/^\/aide$/, function () { vueAide(); }]
  ];
  function router() {
    fermerFeuille();
    var h = location.hash.replace(/^#/, '') || '/', q = '', i = h.indexOf('?');
    if (i >= 0) { q = h.slice(i + 1); h = h.slice(0, i); }
    if (!S.plans.length && !/^\/(bienvenue|sauvegarde|pass|aide|plan)$/.test(h)) { rediriger('#/bienvenue'); return; }
    var params = new URLSearchParams(q);
    for (var k = 0; k < ROUTES.length; k++) {
      var m = h.match(ROUTES[k][0]);
      if (m) { ROUTES[k][1](m, params); window.scrollTo(0, 0); return; }
    }
    rediriger('#/');
  }
  function retour() { aller($('#retour').dataset.vers || '#/'); }

  // ---------- Bandeaux ----------
  function bandeaux() {
    var h = '', e = etatPass();
    if (S.nouveauMois && S.nouveauMois.mois === moisActuel()) {
      h += '<div class="bandeau ok" id="bandeau-mois">' + ICO.calendrier + '<div><p><b>Nouveau mois !</b> Le budget de ' + esc(BF.moisFr(S.nouveauMois.mois)) + ' reprend celui de ' +
        esc(BF.moisFr(S.nouveauMois.de)) + '. Vérifiez vos revenus et vos enveloppes.</p><a class="btn petit sec" href="#/plan" data-action="vu-nouveau-mois">Vérifier mon budget</a></div></div>';
    }
    if (e.rappel) {
      h += '<div class="bandeau alerte" id="bandeau-pass">' + ICO.etoile + '<div><p>Votre pass se termine dans <b>' + e.joursRestants + ' jour' + (e.joursRestants > 1 ? 's' : '') +
        '</b> (le ' + esc(BF.dateFr(BF.dateISO(new Date(Date.parse(e.fin))))) + ').</p><a class="btn petit or" href="#/pass">Renouveler le pass</a></div></div>';
    } else if (e.expire && S.passVu !== e.fin) {
      h += '<div class="bandeau alerte" id="bandeau-pass">' + ICO.info + '<div><p>Votre pass est terminé. Vous êtes revenu à la version gratuite : <b>toutes vos données sont gardées</b>.</p>' +
        '<div class="rang-btn"><a class="btn petit or" href="#/pass">Renouveler</a><button type="button" class="btn petit sec" data-action="pass-vu">J\'ai compris</button></div></div></div>';
    }
    if (S.depenses.length >= 30 && (!S.sauvegarde || Date.now() - Date.parse(S.sauvegarde) > MOIS_MS)) {
      h += '<div class="bandeau">' + ICO.sauvegarde + '<p>Pensez à sauvegarder vos données (une fois par mois). <a href="#/sauvegarde">Sauvegarder</a></p></div>';
    }
    return h;
  }
  function moisNav(m, base) {
    var mc = moisActuel(), prem = premium(), prec = BF.decalerMois(m, -1), suiv = BF.decalerMois(m, 1);
    return '<div class="mois-nav"><button type="button" class="icone-btn' + (prem ? '' : ' verrou') + '" data-action="mois" data-m="' + prec + '" data-base="' + base + '" aria-label="Mois précédent : ' +
      esc(BF.moisFr(prec)) + (prem ? '' : ' (avec le pass)') + '">' + ICO.gauche + '</button><h1>' + esc(BF.moisFr(m)) + '</h1><button type="button" class="icone-btn" data-action="mois" data-m="' + suiv +
      '" data-base="' + base + '" aria-label="Mois suivant : ' + esc(BF.moisFr(suiv)) + '"' + (m >= mc ? ' disabled' : '') + '>' + ICO.droite + '</button></div>';
  }
  function lienMois(base, m) {
    var courant = m === moisActuel();
    if (base === 'rapport') return '#/rapport' + (courant ? '' : '/' + m);
    return courant ? '#/' : '#/mois/' + m;
  }

  // ---------- Accueil ----------
  function vueAccueil(m) {
    var mc = moisActuel();
    m = m || mc;
    if (!BF.moisAccessible(m, mc, premium())) { rediriger('#/'); feuillePass('mois'); return; }
    if (m > mc) { rediriger('#/'); return; }
    S.mois = m;
    cadre({ titre: 'Budget Famille', nav: 'accueil' });
    var p = planDe(m), h = (m === mc ? bandeaux() : '') + moisNav(m, 'accueil');
    if (!p) {
      vue(h + '<section class="carte vide-etat">' + ICO.calendrier + '<p>Pas de budget pour ' + esc(BF.moisFr(m)) + '.</p><a class="btn plein" href="#/plan/' + m + '">Créer le budget de ce mois</a></section>');
      return;
    }
    var s = synthese(m), courant = m === mc;
    var pctRev = s.revenus > 0 ? Math.floor(s.depense * 100 / s.revenus) : (s.depense > 0 ? 100 : 0);
    var nivRev = pctRev > 100 ? 'depasse' : pctRev * 1 >= S.reglages.seuil ? 'alerte' : 'ok';
    h += '<section class="hero" aria-label="Résumé du mois"><small>' + (courant ? 'Il vous reste ce mois' : 'Il vous restait') + '</small><span class="gros nombre' + (s.solde < 0 ? ' negatif' : '') + '" id="reste-mois">' +
      F(s.solde) + '</span><div class="barre ' + nivRev + '" role="img" aria-label="' + pctRev + ' % des revenus dépensés"><i style="width:' + largeur(pctRev) + '%"></i></div>' +
      '<div class="hero-ligne"><span>Dépensé <b class="nombre" id="depense-mois">' + F(s.depense) + '</b></span><span>sur <b class="nombre">' + F(s.revenus) + '</b></span></div>' +
      '<div class="hero-stats">' + (courant ? statParJour(s) : '<div><strong>' + s.nbDepenses + '</strong><span>dépenses notées</span></div>') +
      '<div><strong>' + F(s.epargne) + '</strong><span>mis de côté</span></div></div></section>';
    if (s.aRepartir > 0) h += '<div class="bandeau" id="a-repartir">' + ICO.info + '<p><b>' + F(s.aRepartir) + '</b> de vos revenus ne sont dans aucune enveloppe. <a href="#/plan/' + m + '">Les répartir</a></p></div>';
    else if (s.aRepartir < 0) h += '<div class="bandeau alerte" id="a-repartir">' + ICO.alerte + '<p>Vos enveloppes dépassent vos revenus de <b>' + F(-s.aRepartir) + '</b>. <a href="#/plan/' + m + '">Revoir mon budget</a></p></div>';
    if (s.alertes.length) {
      h += '<section class="carte" aria-labelledby="t-alertes" id="alertes"><h2 id="t-alertes">À surveiller</h2><ul class="alertes">' + s.alertes.map(function (e) {
        return '<li><span class="ico ' + e.niveau + '">' + icone(e.icone) + '</span><a href="#/enveloppe/' + esc(e.id) + '/' + m + '"><b>' + esc(e.nom) + '</b><br><small>' + esc(libNiveau(e)) +
          '</small></a><span class="pastille ' + e.niveau + '">' + (e.prevu > 0 ? e.pct + ' %' : 'hors budget') + '</span></li>';
      }).join('') + '</ul></section>';
    }
    h += '<section class="carte" aria-labelledby="t-env"><div class="carte-tete"><h2 id="t-env">Mes enveloppes</h2><a href="#/plan/' + m + '">Modifier</a></div><ul class="envs">' +
      s.enveloppes.map(function (e) { return ligneEnveloppe(e, m, courant); }).join('') + '</ul></section>';
    h += apercuProjets();
    vue(h);
  }
  // Dépense quotidienne : combien par jour jusqu'à la fin du mois (sinon : reste libre par jour, factures mises à part)
  function statParJour(s) {
    var q = trouver(s.enveloppes, function (e) { return e.id === 'quotidien' && e.prevu > 0; });
    if (q) return '<div><strong id="par-jour">' + F(q.parJourRestant || 0) + '</strong><span>par jour pour la dépense</span></div>';
    return '<div><strong id="par-jour">' + F(s.parJour) + '</strong><span>par jour jusqu\'au ' + s.nbJours + '</span></div>';
  }
  function guil(t) { return '«\u00a0' + t + '\u00a0»'; }
  function ligneEnveloppe(e, m, courant) {
    if (e.type === 'epargne' || e.paye) {
      var txt = e.type === 'epargne' ? (e.prevu > 0 ? 'Prévu : ' + F(e.prevu) : 'Sans montant prévu') : 'Facture du mois réglée';
      return '<li><a class="env" href="#/enveloppe/' + esc(e.id) + '/' + m + '" data-env="' + esc(e.id) + '"><span class="ico">' + icone(e.icone) + '</span><span class="env-corps"><span class="env-haut"><span class="env-nom">' + esc(e.nom) +
        '</span><span class="env-reste paye">' + (e.paye ? 'Payé' : F(e.depense)) + '</span></span><span class="barre epargne"><i style="width:' + largeur(e.prevu > 0 ? e.pct : (e.depense > 0 ? 100 : 0)) + '%"></i></span><span class="env-bas"><span>' + txt +
        '</span><span>' + (e.paye ? F(e.depense) : 'mis de côté') + '</span></span></span></a></li>';
    }
    var payer = courant && e.type === 'fixe' && e.prevu > 0 && e.depense === 0;
    var bas = payer ? 'À payer ce mois' : e.prevu > 0 ? 'Dépensé ' + F(e.depense) + ' sur ' + F(e.prevu) : 'Pas prévu ce mois';
    return '<li><a class="env" href="#/enveloppe/' + esc(e.id) + '/' + m + '" data-env="' + esc(e.id) + '"><span class="ico ' + e.niveau + '">' + icone(e.icone) +
      '</span><span class="env-corps"><span class="env-haut"><span class="env-nom">' + esc(e.nom) + '</span><span class="env-reste ' + e.niveau + '">' + (e.niveau === 'depasse' || e.niveau === 'hors' ? '−' + F(Math.abs(e.reste)) : F(e.reste)) +
      '</span></span><span class="barre ' + (e.type === 'epargne' && e.niveau === 'ok' ? 'epargne' : e.niveau) + '"><i style="width:' + largeur(e.pct) + '%"></i></span><span class="env-bas"><span>' + bas + '</span><span>' +
      (payer ? '' : e.niveau === 'depasse' || e.niveau === 'hors' ? 'en trop' : 'reste') + '</span></span></span></a>' +
      (payer ? '<button type="button" class="btn petit sec env-payer" data-action="payer" data-env="' + esc(e.id) + '" aria-label="Marquer ' + esc(e.nom) + ' comme payé">Payé</button>' : '') + '</li>';
  }
  function apercuProjets() {
    var actifs = BF.projetsActifs(S.projets);
    if (!actifs.length) {
      return '<section class="carte"><div class="carte-tete"><h2>Budgets spéciaux</h2></div><p>Tabaski, rentrée, Korité, baptême… Préparez ces grosses dépenses à l\'avance : liste des achats, compte à rebours et montant à mettre de côté.</p>' +
        '<a class="btn sec large" href="#/projet-nouveau">' + ICO.plus + 'Créer un budget spécial</a></section>';
    }
    return '<section class="carte"><div class="carte-tete"><h2>Budgets spéciaux</h2><a href="#/projets">Tout voir</a></div><ul class="lignes">' + actifs.slice(0, 3).map(function (p) {
      var t = BF.totauxProjet(p), pe = BF.planEpargne(p, aujourdhui());
      return '<li><a class="ligne" style="text-decoration:none;color:inherit" href="#/projet/' + esc(p.id) + '"><span class="ico" style="background:var(--alerte-soft);color:var(--alerte)">' + icone(BF.MODELES[p.type].icone) + '</span><span class="ligne-corps"><b>' + esc(p.nom) +
        '</b><small>' + F(t.epargne) + ' mis de côté sur ' + F(t.objectif) + '</small><span class="barre epargne" style="margin-top:4px"><i style="width:' + t.pct + '%"></i></span></span>' + compte(pe) + '</a></li>';
    }).join('') + '</ul></section>';
  }
  function compte(pe) {
    if (pe.sansDate) return '';
    if (pe.jours < 0) return '<span class="compte passe"><b>Passé</b></span>';
    if (pe.jours === 0) return '<span class="compte"><b>Jour J</b></span>';
    return '<span class="compte" aria-label="Dans ' + pe.jours + ' jours"><b>J-' + pe.jours + '</b><small>' + (pe.jours > 1 ? 'jours' : 'jour') + '</small></span>';
  }

  // ---------- Plan du mois (revenus et enveloppes) ----------
  function planVide(m) { return { mois: m, revenus: [{ id: 'salaire', nom: 'Salaire', montant: 0 }, { id: 'autres', nom: 'Autres revenus', montant: 0 }], enveloppes: [] }; }
  function vueBienvenue() {
    if (S.plans.length) { rediriger('#/'); return; }
    formulairePlan(planVide(moisActuel()), true);
  }
  function vuePlan(m) {
    var mc = moisActuel();
    m = m || mc;
    if (!S.plans.length) { rediriger('#/bienvenue'); return; }
    if (!BF.moisAccessible(m, mc, premium())) { rediriger('#/'); feuillePass('mois'); return; }
    var p = planDe(m);
    if (!p) { var ref = BF.planReference(S.plans, m); p = ref ? BF.copierPlan(ref, m) : planVide(m); }
    if (S.nouveauMois && m === S.nouveauMois.mois) { S.nouveauMois = null; }
    formulairePlan(p, false);
  }
  function lignePlan(e, nbJours) {
    var c = BF.CAT[e.id], aide = c && c.aide ? '<small>' + esc(c.aide) + '</small>' : (e.perso ? '<small>Enveloppe à moi</small>' : '');
    if (e.id === 'quotidien') {
      return '<div class="plan-ligne parjour" data-ligne="quotidien"><span class="ico">' + icone(e.icone) + '</span><label for="pe-quotidien">' + esc(e.nom) + aide + '</label>' +
        '<div class="parjour-zone"><div class="champ" style="margin:0"><label for="pj-quotidien" class="petit" style="font-weight:600">Par jour</label>' + champMontant('pj-quotidien', e.parJour || 0, null, ' data-parjour') +
        '</div><div class="champ" style="margin:0"><label for="pe-quotidien" class="petit" style="font-weight:600">Pour le mois (' + nbJours + ' j)</label>' + champMontant('pe-quotidien', e.prevu, null, ' data-env="quotidien"') + '</div></div></div>';
    }
    return '<div class="plan-ligne" data-ligne="' + esc(e.id) + '"><span class="ico">' + icone(e.icone) + '</span><label for="pe-' + esc(e.id) + '">' + esc(e.nom) + aide + '</label>' +
      champMontant('pe-' + e.id, e.prevu, null, ' data-env="' + esc(e.id) + '"') + '</div>';
  }
  var persoBrouillon = [];
  function formulairePlan(p, premiere) {
    var m = p.mois, nbJours = BF.joursDansMois(m);
    persoBrouillon = (p.enveloppes || []).filter(function (e) { return !BF.CAT[e.id]; }).map(function (e) { return Object.assign({}, e); });
    var parId = {};
    (p.enveloppes || []).forEach(function (e) { parId[e.id] = e; });
    var lignes = BF.CATEGORIES.map(function (c) { return parId[c.cle] || BF.nouvelleEnveloppe(c.cle, 0); });
    cadre({ titre: premiere ? 'Bienvenue' : 'Budget de ' + BF.moisFr(m), retour: premiere ? '' : '#/', nav: premiere ? '' : 'accueil', saisie: true });
    var h = '';
    if (premiere) {
      h += '<section class="accueil-bienvenue"><img src="icons/icon-192.png" alt="" width="84" height="84"><h1>Budget Famille</h1><p class="lead">Préparez le budget de <b>' + esc(BF.moisFr(m)) +
        '</b> en 2 minutes : l\'argent qui entre, puis une enveloppe pour chaque dépense. Vos chiffres restent sur ce téléphone.</p></section>';
    }
    h += '<form data-form="plan" data-mois="' + m + '" novalidate><section class="carte"><h2>1. L\'argent qui entre ce mois</h2><div id="revenus">' +
      (p.revenus.length ? p.revenus : planVide(m).revenus).map(ligneRevenu).join('') + '</div>' +
      '<button type="button" class="btn sec petit" data-action="ajouter-revenu">' + ICO.plus + 'Ajouter un revenu</button></section>' +
      '<section class="carte"><h2>2. Vos enveloppes</h2><p class="petit">Mettez un montant dans chaque enveloppe utile. Laissez vide celles qui ne vous concernent pas.</p><div id="lignes-plan">' +
      lignes.map(function (e) { return lignePlan(e, nbJours); }).join('') + persoBrouillon.map(function (e) { return lignePlan(e, nbJours); }).join('') + '</div>' +
      '<button type="button" class="btn sec petit" data-action="ajouter-perso">' + ICO.plus + 'Créer une enveloppe à moi</button></section>' +
      '<div class="totaux-plan" aria-live="polite"><dl><dt>Revenus</dt><dd id="t-rev">0 F</dd><dt>Dans les enveloppes</dt><dd id="t-prevu">0 F</dd><dt>Reste à répartir</dt><dd id="t-reste" class="reste">0 F</dd></dl></div>' +
      '<p class="msg erreur" id="msg-plan" role="alert"></p><button type="submit" class="btn plein large btn-enregistrer">' + ICO.ok + (premiere ? 'Commencer' : 'Enregistrer mon budget') + '</button>' +
      (premiere ? '<p class="centre"><a href="#/sauvegarde">J\'ai une sauvegarde à restaurer</a></p>' : '') + '</form>';
    vue(h);
    majTotauxPlan();
  }
  function ligneRevenu(r) {
    var id = r.id || 'r-' + BF.nouvelId().slice(0, 8);
    return '<div class="revenu" data-revenu="' + esc(id) + '"><input type="text" value="' + esc(r.nom) + '" aria-label="Nom du revenu" maxlength="40" placeholder="Ex. : commerce" data-rnom>' +
      champMontant('rv-' + id, r.montant, 'Montant : ' + (r.nom || 'revenu'), ' data-rmontant') +
      '<button type="button" class="icone-btn" data-action="retirer-revenu" aria-label="Retirer ce revenu">' + ICO.x + '</button></div>';
  }
  function lireFormulairePlan(form) {
    var revenus = $$('[data-revenu]', form).map(function (d) {
      return { id: d.dataset.revenu, nom: ($('[data-rnom]', d).value || '').trim().slice(0, 40) || 'Revenu', montant: BF.lireMontant($('[data-rmontant]', d).value) };
    });
    var montants = {};
    $$('input[data-env]', form).forEach(function (i) { montants[i.dataset.env] = BF.lireMontant(i.value); });
    var pj = $('#pj-quotidien', form);
    return { revenus: revenus, montants: montants, parJour: pj ? BF.lireMontant(pj.value) : 0 };
  }
  function majTotauxPlan() {
    var form = $('form[data-form=plan]');
    if (!form) return;
    var l = lireFormulairePlan(form), rev = BF.somme(l.revenus, 'montant'), prevu = 0;
    Object.keys(l.montants).forEach(function (k) { prevu += l.montants[k]; });
    $('#t-rev').textContent = F(rev); $('#t-prevu').textContent = F(prevu);
    var r = $('#t-reste'); r.textContent = F(rev - prevu); r.classList.toggle('negatif', rev - prevu < 0);
  }
  function enregistrerPlan(form) {
    var m = form.dataset.mois, l = lireFormulairePlan(form), msg = $('#msg-plan');
    var revenus = l.revenus.filter(function (r) { return r.montant > 0; });
    if (!revenus.length) { msg.textContent = 'Indiquez l\'argent qui entre ce mois (salaire, commerce, pension…).'; $('[data-rmontant]').focus(); return; }
    var ancien = planDe(m), dejaDepense = {};
    S.depenses.forEach(function (d) { if (d.mois === m) dejaDepense[d.env] = 1; });
    var anciens = {};
    ((ancien && ancien.enveloppes) || []).forEach(function (e) { anciens[e.id] = e; });
    var envs = [];
    BF.CATEGORIES.forEach(function (c) {
      var prevu = l.montants[c.cle] || 0;
      if (prevu > 0 || anciens[c.cle] && dejaDepense[c.cle]) {
        var e = BF.nouvelleEnveloppe(c.cle, prevu);
        if (c.cle === 'quotidien' && l.parJour > 0 && prevu === l.parJour * BF.joursDansMois(m)) e.parJour = l.parJour;
        envs.push(e);
      }
    });
    persoBrouillon.forEach(function (e) {
      var prevu = l.montants[e.id] || 0;
      if (prevu > 0 || dejaDepense[e.id]) envs.push(BF.enveloppePerso(e.nom, e.icone, prevu, e.id));
    });
    if (!envs.some(function (e) { return e.prevu > 0; })) { msg.textContent = 'Mettez un montant dans au moins une enveloppe (par exemple la dépense quotidienne).'; $('#pe-quotidien').focus(); return; }
    var premiere = !S.plans.length;
    var p = { mois: m, revenus: revenus, enveloppes: envs, cree: ancien && ancien.cree || new Date().toISOString(), modifie: new Date().toISOString() };
    if (ancien && ancien.copieDe) p.copieDe = ancien.copieDe;
    S.plans = S.plans.filter(function (x) { return x.mois !== m; }).concat([p]);
    DB.mettre('plans', p).then(function () {
      if (S.nouveauMois && S.nouveauMois.mois === m) S.nouveauMois = null;
      toast(premiere ? 'Budget de ' + BF.moisFr(m) + ' prêt ! Notez vos dépenses avec le bouton +.' : 'Budget enregistré.');
      rediriger(lienMois('accueil', m));
    }).catch(erreurStockage);
  }
  function feuilleEnveloppePerso() {
    var choix = BF.ICONES_PERSO[0];
    feuille('Nouvelle enveloppe', '<form data-form="perso" novalidate><div class="champ"><label for="np-nom">Nom</label><input id="np-nom" maxlength="40" placeholder="Ex. : Coiffure, Cotisation, Couture"></div>' +
      '<p class="etiquette" id="np-ico-t">Image</p><div class="icones-choix" role="group" aria-labelledby="np-ico-t">' + BF.ICONES_PERSO.map(function (n, i) {
        return '<button type="button" data-ico="' + n + '" aria-pressed="' + (i === 0) + '" aria-label="' + n + '">' + icone(n) + '</button>';
      }).join('') + '</div><div class="champ" style="margin-top:14px"><label for="np-montant">Montant prévu ce mois</label>' + champMontant('np-montant', 0) + '</div>' +
      '<p class="msg erreur" id="np-msg"></p><button type="submit" class="btn plein large">' + ICO.plus + 'Ajouter l\'enveloppe</button></form>', function (el) {
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ico]');
        if (!b) return;
        choix = b.dataset.ico;
        $$('[data-ico]', el).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
      $('form', el).addEventListener('submit', function (e) {
        e.preventDefault();
        var nom = $('#np-nom').value.trim();
        if (!nom) { $('#np-msg').textContent = 'Donnez un nom à l\'enveloppe.'; $('#np-nom').focus(); return; }
        var env = BF.enveloppePerso(nom, choix, BF.lireMontant($('#np-montant').value));
        persoBrouillon.push(env);
        fermerFeuille();
        var form = $('form[data-form=plan]');
        $('#lignes-plan', form).insertAdjacentHTML('beforeend', lignePlan(env, BF.joursDansMois(form.dataset.mois)));
        majTotauxPlan();
        toast('Enveloppe ' + guil(env.nom) + ' ajoutée. Pensez à enregistrer.');
      });
    });
  }

  // ---------- Saisie rapide d'une dépense ----------
  var saisie = null;
  function vueAjouter(q) {
    var mc = moisActuel(), prem = premium();
    var mVue = S.mois && BF.moisAccessible(S.mois, mc, prem) ? S.mois : mc;
    var date = q.get('date') || (mVue === mc ? aujourdhui() : BF.ajouterJours(BF.decalerMois(mVue, 1) + '-01', -1));
    if (!BF.dateValide(date) || date > aujourdhui()) date = aujourdhui();
    if (!prem && BF.moisDe(date) !== mc) date = aujourdhui();
    var p = planDe(BF.moisDe(date)) || planDe(mc);
    var env = q.get('env') || S.derniereEnv || 'quotidien';
    if (!p || !trouver(p.enveloppes, function (e) { return e.id === env; })) env = p && p.enveloppes[0] ? p.enveloppes[0].id : 'quotidien';
    saisie = { montant: 0, env: env, date: date, note: '', retour: q.get('retour') || '' };
    cadre({ titre: 'Nouvelle dépense', retour: '#/', nav: 'ajouter', saisie: true });
    vue('<div class="saisie-montant"><output id="s-montant" class="vide" aria-live="polite" aria-label="Montant">0 F</output><div class="saisie-options">' +
      '<label class="puce">' + ICO.calendrier + '<span id="s-date-txt"></span><input type="date" id="s-date" value="' + date + '" max="' + aujourdhui() + '"' + (prem ? '' : ' min="' + mc + '-01"') + ' aria-label="Date de la dépense"></label>' +
      '<button type="button" class="puce" data-action="s-note">' + ICO.note + '<span id="s-note-txt">Note</span></button></div></div>' +
      '<p class="vh" id="t-tuiles">Choisissez l\'enveloppe</p><div class="tuiles" role="group" aria-labelledby="t-tuiles" id="tuiles"></div>' +
      '<div class="clavier" role="group" aria-label="Clavier du montant">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0'].map(function (t) {
        return '<button type="button" data-touche="' + t + '">' + t + '</button>';
      }).join('') + '<button type="button" data-touche="effacer" aria-label="Effacer le dernier chiffre">' + ICO.effacer + '</button></div>' +
      '<button type="button" class="btn plein large btn-enregistrer" id="s-ok" data-action="s-enregistrer" disabled>Enregistrer</button>');
    majSaisie();
  }
  function tuilesSaisie() {
    var m = BF.moisDe(saisie.date), s = synthese(m);
    var envs = s.enveloppes.filter(function (e) { return !e.horsPlan || e.id === saisie.env; });
    if (!trouver(envs, function (e) { return e.id === saisie.env; })) {
      var c = BF.CAT[saisie.env] || { nom: saisie.env, icone: 'divers', court: saisie.env };
      envs.push({ id: saisie.env, nom: c.nom, court: c.court, icone: c.icone, niveau: 'hors', prevu: 0, reste: 0, depense: 0 });
    }
    return envs.map(function (e) {
      var info = e.prevu > 0 ? (e.reste >= 0 ? N(e.reste) + ' F' : '−' + N(-e.reste) + ' F') : 'hors budget';
      return '<button type="button" class="tuile" data-env="' + esc(e.id) + '" aria-pressed="' + (e.id === saisie.env) + '" aria-label="' + esc(e.nom + ', ' + (e.prevu > 0 ? 'reste ' + info : 'hors budget')) + '">' +
        icone(e.icone) + '<b>' + esc(e.court || e.nom) + '</b><small class="' + e.niveau + '">' + esc(info) + '</small></button>';
    }).join('') + '<button type="button" class="tuile" data-action="s-autres">' + icone('divers') + '<b>Autre…</b><small>&nbsp;</small></button>';
  }
  function majSaisie() {
    if (!saisie) return;
    var o = $('#s-montant');
    o.textContent = F(saisie.montant); o.classList.toggle('vide', !saisie.montant);
    $('#s-date-txt').textContent = saisie.date === aujourdhui() ? 'Aujourd\'hui' : BF.dateCourte(saisie.date);
    $('#s-note-txt').textContent = saisie.note ? (saisie.note.length > 18 ? saisie.note.slice(0, 17) + '…' : saisie.note) : 'Note';
    $('#tuiles').innerHTML = tuilesSaisie();
    var b = $('#s-ok'), nom = BF.nomEnveloppe(saisie.env, [planDe(BF.moisDe(saisie.date)) || {}]);
    b.disabled = !saisie.montant;
    b.innerHTML = ICO.ok + (saisie.montant ? 'Enregistrer ' + esc(F(saisie.montant)) : 'Tapez le montant');
    b.setAttribute('aria-label', saisie.montant ? 'Enregistrer ' + F(saisie.montant) + ' dans ' + nom : 'Tapez d\'abord le montant');
  }
  function toucheSaisie(t) {
    if (!saisie) return;
    var s = String(saisie.montant || '');
    if (t === 'effacer') s = s.slice(0, -1);
    else if (s.length < 10) s = (s === '0' ? '' : s) + t;
    saisie.montant = BF.lireMontant(s.slice(0, 10));
    majSaisie();
  }
  function enregistrerSaisie() {
    if (!saisie || !saisie.montant) return;
    var mc = moisActuel();
    if (!BF.dateValide(saisie.date) || saisie.date > aujourdhui()) { toast('Date non valable.'); return; }
    if (!premium() && BF.moisDe(saisie.date) !== mc) { feuillePass('date'); return; }
    var d = { id: BF.nouvelId(), date: saisie.date, mois: BF.moisDe(saisie.date), env: saisie.env, montant: saisie.montant, note: saisie.note.trim().slice(0, 80), cree: new Date().toISOString() };
    var envId = d.env, m = d.mois;
    S.depenses.push(d);
    S.derniereEnv = envId;
    DB.lot([['depenses', d], ['kv', envId, 'derniereEnv']]).then(function () {
      var s = synthese(m), e = trouver(s.enveloppes, function (x) { return x.id === envId; });
      var msg = F(d.montant) + ' notés dans ' + guil(e ? e.nom : envId) + '. ', genre = '';
      if (e) {
        if (e.niveau === 'depasse') { msg += 'Attention : enveloppe dépassée de ' + F(-e.reste) + '.'; genre = 'danger'; }
        else if (e.niveau === 'epuise') { msg += 'Attention : l\'enveloppe est vide.'; genre = 'alerte'; }
        else if (e.niveau === 'alerte') { msg += 'Attention : il ne reste que ' + F(e.reste) + '.'; genre = 'alerte'; }
        else if (e.niveau === 'hors') { msg += 'Cette dépense n\'était pas prévue au budget.'; genre = 'alerte'; }
        else msg += 'Reste ' + F(e.reste) + '.';
      }
      var dest = saisie.retour || lienMois('accueil', S.mois && S.mois === m ? m : moisActuel());
      saisie = null;
      rediriger(dest);
      toast(msg, { label: 'Annuler', fn: function () { supprimerDepense(d.id, true); } }, genre);
    }).catch(erreurStockage);
  }
  function feuilleAutresEnveloppes() {
    var p = planDe(BF.moisDe(saisie.date)) || { enveloppes: [] };
    var ids = {}; p.enveloppes.forEach(function (e) { ids[e.id] = 1; });
    var autres = BF.CATEGORIES.filter(function (c) { return !ids[c.cle]; });
    feuille('Autre enveloppe', '<p class="petit">Ces enveloppes ne sont pas prévues ce mois : la dépense sera notée « hors budget ».</p><div class="tuiles">' + autres.map(function (c) {
      return '<button type="button" class="tuile" data-choisir="' + c.cle + '">' + icone(c.icone) + '<b>' + esc(c.court) + '</b></button>';
    }).join('') + '</div><a class="btn sec large" href="#/plan">' + ICO.crayon + 'Modifier mes enveloppes</a>', function (el) {
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-choisir]');
        if (!b) return;
        saisie.env = b.dataset.choisir; fermerFeuille(); majSaisie();
      });
    });
  }
  function feuilleNote() {
    feuille('Note', '<form data-form="note"><div class="champ"><label for="s-note">Pour quoi ? (facultatif)</label><input id="s-note" maxlength="80" value="' + esc(saisie.note) +
      '" placeholder="Ex. : poisson, pain, ordonnance" autocomplete="off"></div><button type="submit" class="btn plein large">' + ICO.ok + 'OK</button></form>', function (el) {
      $('form', el).addEventListener('submit', function (e) { e.preventDefault(); saisie.note = $('#s-note').value.trim(); fermerFeuille(); majSaisie(); });
    });
  }

  // ---------- Dépenses : modifier, supprimer, payer ----------
  function supprimerDepense(id, silencieux) {
    var d = trouver(S.depenses, function (x) { return x.id === id; });
    if (!d) return Promise.resolve();
    S.depenses = S.depenses.filter(function (x) { return x.id !== id; });
    return DB.effacer('depenses', id).then(function () {
      router();
      if (silencieux) toast('Dépense annulée.');
      else toast('Dépense supprimée.', { label: 'Annuler', fn: function () { S.depenses.push(d); DB.mettre('depenses', d).then(router); } });
    }).catch(erreurStockage);
  }
  function optionsEnveloppes(m, choisi) {
    var p = planDe(m) || { enveloppes: [] }, ids = {}, h = '<optgroup label="Prévues ce mois">';
    p.enveloppes.forEach(function (e) { ids[e.id] = 1; h += '<option value="' + esc(e.id) + '"' + (e.id === choisi ? ' selected' : '') + '>' + esc(e.nom) + '</option>'; });
    h += '</optgroup><optgroup label="Autres">';
    BF.CATEGORIES.forEach(function (c) { if (!ids[c.cle]) h += '<option value="' + c.cle + '"' + (c.cle === choisi ? ' selected' : '') + '>' + esc(c.nom) + '</option>'; });
    if (!ids[choisi] && !BF.CAT[choisi]) h += '<option value="' + esc(choisi) + '" selected>Enveloppe retirée</option>';
    return h + '</optgroup>';
  }
  function feuilleDepense(id) {
    var d = trouver(S.depenses, function (x) { return x.id === id; });
    if (!d) return;
    var prem = premium(), mc = moisActuel();
    feuille('Modifier la dépense', '<form data-form="depense" novalidate><div class="champ"><label for="d-montant">Montant</label>' + champMontant('d-montant', d.montant) + '</div>' +
      '<div class="champ"><label for="d-env">Enveloppe</label><select id="d-env">' + optionsEnveloppes(d.mois, d.env) + '</select></div>' +
      '<div class="champ"><label for="d-date">Date</label><input type="date" id="d-date" value="' + d.date + '" max="' + aujourdhui() + '"' + (prem ? '' : ' min="' + mc + '-01"') + '></div>' +
      '<div class="champ"><label for="d-note">Note</label><input id="d-note" maxlength="80" value="' + esc(d.note || '') + '"></div><p class="msg erreur" id="d-msg"></p>' +
      '<div class="rang-btn"><button type="button" class="btn danger-sec" data-action="supprimer-depense" data-id="' + esc(d.id) + '">' + ICO.poubelle + 'Supprimer</button>' +
      '<button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>', function (el) {
      $('form', el).addEventListener('submit', function (e) {
        e.preventDefault();
        var montant = BF.lireMontant($('#d-montant').value), date = $('#d-date').value;
        if (!montant) { $('#d-msg').textContent = 'Indiquez un montant.'; return; }
        if (!BF.dateValide(date) || date > aujourdhui()) { $('#d-msg').textContent = 'Date non valable.'; return; }
        if (!prem && BF.moisDe(date) !== mc) { $('#d-msg').textContent = 'Version gratuite : seulement les dates du mois en cours.'; return; }
        d.montant = montant; d.env = $('#d-env').value; d.date = date; d.mois = BF.moisDe(date); d.note = $('#d-note').value.trim().slice(0, 80);
        DB.mettre('depenses', d).then(function () { fermerFeuille(); router(); toast('Dépense modifiée.'); }).catch(erreurStockage);
      });
    });
  }
  function payer(envId) {
    var m = S.mois && BF.moisAccessible(S.mois, moisActuel(), premium()) ? S.mois : moisActuel();
    var s = synthese(m), e = trouver(s.enveloppes, function (x) { return x.id === envId; });
    if (!e) return;
    var montant = Math.max(0, e.prevu - e.depense);
    if (!montant) { toast('Rien à payer : le montant prévu est déjà dépensé.'); return; }
    var date = m === moisActuel() ? aujourdhui() : BF.ajouterJours(BF.decalerMois(m, 1) + '-01', -1);
    var d = { id: BF.nouvelId(), date: date, mois: m, env: envId, montant: montant, note: 'Payé', cree: new Date().toISOString() };
    S.depenses.push(d);
    DB.mettre('depenses', d).then(function () {
      router();
      toast(e.nom + ' : ' + F(montant) + ' payés.', { label: 'Annuler', fn: function () { supprimerDepense(d.id, true); } });
    }).catch(erreurStockage);
  }
  function feuillePrevu(envId, m) {
    var p = planDe(m);
    if (!p) { aller('#/plan/' + m); return; }
    var e = trouver(p.enveloppes, function (x) { return x.id === envId; });
    var c = BF.CAT[envId], nom = e ? e.nom : (c ? c.nom : envId);
    feuille('Montant prévu', '<form data-form="prevu" novalidate><p><b>' + esc(nom) + '</b> · ' + esc(BF.moisFr(m)) + '</p><div class="champ"><label for="pv-montant">Montant prévu pour le mois</label>' +
      champMontant('pv-montant', e ? e.prevu : 0) + '</div><button type="submit" class="btn plein large">' + ICO.ok + 'Enregistrer</button></form>', function (el) {
      $('form', el).addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = BF.lireMontant($('#pv-montant').value);
        if (e) { e.prevu = v; delete e.parJour; }
        else if (c) p.enveloppes.push(BF.nouvelleEnveloppe(envId, v));
        p.modifie = new Date().toISOString();
        DB.mettre('plans', p).then(function () { fermerFeuille(); router(); toast('Montant prévu : ' + F(v) + '.'); }).catch(erreurStockage);
      });
    });
  }

  // ---------- Détail d'une enveloppe ----------
  function vueEnveloppe(id, m) {
    var mc = moisActuel();
    m = m || mc;
    if (!BF.moisAccessible(m, mc, premium())) { rediriger('#/'); feuillePass('mois'); return; }
    S.mois = m;
    var s = synthese(m), e = trouver(s.enveloppes, function (x) { return x.id === id; });
    if (!e) {
      var c = BF.CAT[id];
      if (!c) { rediriger('#/'); return; }
      e = BF.etatEnveloppe(0, 0, S.reglages.seuil); e.id = id; e.nom = c.nom; e.icone = c.icone; e.type = c.type;
    }
    cadre({ titre: e.nom, retour: lienMois('accueil', m), nav: 'accueil' });
    var deps = S.depenses.filter(function (d) { return d.mois === m && d.env === id; }).sort(function (a, b) { return a.date > b.date ? -1 : a.date < b.date ? 1 : (a.cree < b.cree ? 1 : -1); });
    var vers = id === 'epargne' ? BF.versementsDuMois(S.projets, m) : [];
    var courant = m === mc;
    var h = '<section class="carte"><div class="resume-env"><span class="ico ' + e.niveau + '">' + icone(e.icone) + '</span><div><small class="petit">' + (e.niveau === 'depasse' || e.niveau === 'hors' ? 'En trop' : 'Reste') +
      ' · ' + esc(BF.moisFr(m)) + '</small><div class="chiffre ' + e.niveau + '" id="env-reste">' + F(Math.abs(e.reste)) + '</div></div></div>' +
      '<div class="barre ' + (e.type === 'epargne' && e.niveau === 'ok' ? 'epargne' : e.niveau) + '"><i style="width:' + largeur(e.pct) + '%"></i></div>' +
      '<p class="petit">Dépensé ' + F(e.depense) + (e.prevu > 0 ? ' sur ' + F(e.prevu) + ' prévus (' + e.pct + ' %)' : ' · pas de montant prévu') + '</p>';
    if (e.niveau !== 'ok' && e.niveau !== 'vide') h += '<div class="bandeau ' + (e.niveau === 'alerte' || e.niveau === 'epuise' ? 'alerte' : 'danger') + '">' + ICO.alerte + '<p>' + esc(libNiveau(e)) + '</p></div>';
    if (e.paye) h += '<div class="bandeau ok">' + ICO.ok + '<p>Payé ce mois : ' + F(e.depense) + '.</p></div>';
    if (e.videVers) h += '<div class="bandeau alerte" id="rythme">' + ICO.info + '<p>À ce rythme, cette enveloppe sera vide vers le <b>' + esc(BF.dateCourte(e.videVers)) + '</b>.</p></div>';
    if (courant && e.parJourRestant) h += '<p id="par-jour-env">Vous pouvez encore dépenser <b>' + F(e.parJourRestant) + ' par jour</b> jusqu\'à la fin du mois.</p>';
    if (e.type === 'epargne') h += '<p class="petit">L\'argent mis de côté pour vos budgets spéciaux compte ici.</p>';
    h += '<div class="rang-btn"><a class="btn plein" href="#/ajouter?env=' + encodeURIComponent(id) + '">' + ICO.plus + 'Ajouter une dépense</a>' +
      (e.type === 'fixe' && e.prevu > e.depense ? '<button type="button" class="btn sec" data-action="payer" data-env="' + esc(id) + '">' + ICO.ok + 'Marquer payé (' + esc(F(e.prevu - e.depense)) + ')</button>' : '') +
      '<button type="button" class="btn sec" data-action="prevu" data-env="' + esc(id) + '" data-m="' + m + '">' + ICO.crayon + 'Montant prévu</button></div></section>';
    h += '<section class="carte"><h2>Dépenses de ' + esc(BF.moisFr(m)) + ' (' + (deps.length + vers.length) + ')</h2>';
    if (!deps.length && !vers.length) h += '<div class="vide-etat">' + icone(e.icone) + '<p>Aucune dépense pour l\'instant.</p></div>';
    else {
      h += '<ul class="lignes" id="liste-depenses">' + deps.map(function (d) {
        return '<li><button type="button" class="ligne" data-action="depense" data-id="' + esc(d.id) + '"><span class="ligne-corps"><b>' + esc(d.note || e.nom) + '</b><small>' + esc(BF.dateLongue(d.date)) +
          '</small></span><span class="ligne-montant">' + F(d.montant) + '</span></button></li>';
      }).join('') + vers.map(function (v) {
        return '<li><a class="ligne" style="text-decoration:none;color:inherit" href="#/projet/' + esc(v.projet) + '"><span class="ligne-corps"><b>Mis de côté : ' + esc(v.nom) + '</b><small>' + esc(BF.dateLongue(v.date)) +
          '</small></span><span class="ligne-montant">' + F(v.montant) + '</span></a></li>';
      }).join('') + '</ul>';
    }
    vue(h + '</section>');
  }

  // ---------- Budgets spéciaux ----------
  function vueProjets() {
    cadre({ titre: 'Budgets spéciaux', nav: 'projets' });
    var actifs = BF.projetsActifs(S.projets), termines = S.projets.filter(function (p) { return p.statut === 'termine'; }), prem = premium();
    var h = '';
    if (!S.projets.length) {
      h += '<section class="carte"><h1>Préparez les grands moments</h1><p>Tabaski, rentrée scolaire, Ramadan et Korité, voyage du Magal ou du Gamou, baptême, mariage… Faites la liste des achats avec les prix : l\'application calcule le total, ' +
        'le compte à rebours et combien mettre de côté chaque mois.</p></section>';
    }
    h += actifs.map(carteProjet).join('');
    h += '<button type="button" class="btn plein large" data-action="nouveau-projet" id="btn-nouveau-projet">' + ICO.plus + 'Nouveau budget spécial</button>';
    if (!prem) h += '<p class="petit centre">Version gratuite : 1 budget spécial en cours. <a href="#/pass">Avec le pass : autant que vous voulez.</a></p>';
    if (termines.length) h += '<h2 style="margin-top:22px">Terminés</h2>' + termines.map(carteProjet).join('');
    vue(h);
  }
  function carteProjet(p) {
    var t = BF.totauxProjet(p), pe = BF.planEpargne(p, aujourdhui()), m = BF.MODELES[p.type] || BF.MODELES.autre;
    var conseil = '';
    if (p.statut !== 'termine' && pe.jours > 0 && pe.reste > 0) conseil = '<p class="conseil">À mettre de côté : <b>' + F(pe.parMois) + ' par mois</b> (' + F(pe.parSemaine) + ' par semaine)</p>';
    else if (t.objectif > 0 && pe.reste === 0) conseil = '<p class="conseil">Objectif atteint.</p>';
    return '<a class="carte projet-carte" href="#/projet/' + esc(p.id) + '" data-projet="' + esc(p.id) + '"><div class="projet-tete"><span class="ico">' + icone(m.icone) + '</span><div style="min-width:0"><h2>' + esc(p.nom) +
      '</h2><p>' + (BF.dateValide(p.date) ? esc(BF.dateLongue(p.date)) : 'Date à choisir') + '</p></div>' + (p.statut === 'termine' ? '<span class="compte passe"><b>Fini</b></span>' : compte(pe)) + '</div>' +
      '<div class="projet-chiffres"><span>Mis de côté <b>' + F(t.epargne) + '</b></span><span>sur <b>' + F(t.objectif) + '</b></span></div><div class="barre epargne"><i style="width:' + t.pct + '%"></i></div>' + conseil + '</a>';
  }
  function vueNouveauProjet() {
    if (!BF.peutCreerProjet(S.projets, premium())) { rediriger('#/projets'); feuillePass('projet'); return; }
    cadre({ titre: 'Nouveau budget spécial', retour: '#/projets', nav: 'projets' });
    vue('<p class="lead">Pour quel moment ?</p><div class="types" role="group" aria-label="Type de budget spécial">' + BF.ORDRE_MODELES.map(function (k) {
      var m = BF.MODELES[k];
      return '<button type="button" class="type" data-type="' + k + '" aria-pressed="false"><span class="ico">' + icone(m.icone) + '</span><b>' + esc(m.nom) + '</b><small>' + esc(m.aide) + '</small></button>';
    }).join('') + '</div><div id="form-projet"></div>');
  }
  function formulaireNouveauProjet(type) {
    var m = BF.MODELES[type];
    $$('.type').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.type === type)); });
    var z = $('#form-projet');
    z.innerHTML = '<form class="carte" data-form="nouveau-projet" data-type="' + type + '" novalidate style="margin-top:14px"><h2>' + esc(m.nom) + '</h2>' +
      '<div class="champ"><label for="np-date">Date prévue</label><input type="date" id="np-date" min="' + aujourdhui() + '"><small>Tapez la date du jour J (à confirmer selon votre calendrier).</small></div>' +
      '<div class="champ"><label for="np-nom">Nom</label><input id="np-nom" maxlength="60" value="' + esc(m.nom) + '" data-auto="1"></div>' +
      (m.parEnfant ? '<fieldset class="champ" style="border:0;padding:0;margin:0 0 14px"><legend class="etiquette">Prénoms des enfants</legend><div id="np-enfants"><input class="np-enfant" maxlength="40" placeholder="1er enfant" aria-label="Prénom du 1er enfant" style="margin-bottom:8px">' +
        '<input class="np-enfant" maxlength="40" placeholder="2e enfant (facultatif)" aria-label="Prénom du 2e enfant" style="margin-bottom:8px"></div><button type="button" class="btn sec petit" data-action="np-enfant-plus">' + ICO.plus + 'Un autre enfant</button>' +
        '<small class="petit" style="display:block;margin-top:6px">Chaque enfant reçoit sa liste : inscription, fournitures, tenues, transport…</small></fieldset>' : '') +
      (type === 'autre' ? '<div class="champ"><label for="np-objectif">Montant à réunir (facultatif)</label>' + champMontant('np-objectif', 0) + '<small>Ou faites la liste des achats ensuite : le total sera calculé.</small></div>' : '') +
      '<p class="msg erreur" id="np-msg" role="alert"></p><button type="submit" class="btn plein large">' + ICO.ok + 'Créer le budget</button></form>';
    $('#np-date').focus();
    z.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function creerProjet(form) {
    var type = form.dataset.type, date = $('#np-date').value, nom = $('#np-nom').value.trim(), msg = $('#np-msg');
    if (!BF.peutCreerProjet(S.projets, premium())) { feuillePass('projet'); return; }
    if (!BF.dateValide(date)) { msg.textContent = 'Choisissez la date du jour J.'; $('#np-date').focus(); return; }
    if (date < aujourdhui()) { msg.textContent = 'Cette date est déjà passée.'; $('#np-date').focus(); return; }
    var p = BF.nouveauProjet(type, nom, date, aujourdhui());
    p.creeMs = Date.now();
    p.ordre = S.projets.reduce(function (m, x) { return Math.max(m, x.ordre || 0); }, 0) + 1;
    if (type === 'rentree') {
      var noms = $$('.np-enfant', form).map(function (i) { return i.value.trim(); }).filter(Boolean);
      if (!noms.length) noms = ['Enfant 1'];
      noms.forEach(function (n) { BF.ajouterEnfant(p, n); });
    }
    if (type === 'autre') p.objectifManuel = BF.lireMontant($('#np-objectif').value);
    S.projets.push(p);
    DB.mettre('projets', p).then(function () { rediriger('#/projet/' + p.id); toast('Budget ' + guil(p.nom) + ' créé. Ajoutez les prix de la liste.'); }).catch(erreurStockage);
  }
  function sauverProjet(p, msg) {
    return DB.mettre('projets', p).then(function () { router(); if (msg) toast(msg); }).catch(erreurStockage);
  }
  function vueProjet(id) {
    var p = projetDe(id);
    if (!p) { rediriger('#/projets'); return; }
    var prem = premium(), mod = BF.projetModifiable(p, S.projets, prem) && p.statut !== 'termine';
    var t = BF.totauxProjet(p), pe = BF.planEpargne(p, aujourdhui()), m = BF.MODELES[p.type] || BF.MODELES.autre;
    cadre({ titre: p.nom, retour: '#/projets', nav: 'projets' });
    var h = '';
    if (!mod && p.statut !== 'termine') h += '<div class="bandeau alerte" id="lecture-seule">' + ICO.cadenas + '<div><p>Version gratuite : ce budget spécial est <b>en lecture seule</b>. Le pass permet de gérer plusieurs budgets spéciaux en même temps.</p><a class="btn petit or" href="#/pass">Voir le pass</a></div></div>';
    if (p.statut === 'termine') h += '<div class="bandeau ok">' + ICO.ok + '<p>Ce budget spécial est terminé.</p></div>';
    h += '<section class="carte"><div class="projet-tete"><span class="ico">' + icone(m.icone) + '</span><div style="min-width:0"><h1>' + esc(p.nom) + '</h1><p>' + (BF.dateValide(p.date) ? esc(BF.dateLongue(p.date)) : '') +
      (pe.jours > 0 ? ' · ' + esc(BF.compteARebours(pe.jours)) : '') + '</p></div>' + (p.statut === 'termine' ? '' : compte(pe)) + '</div>' +
      (mod || p.statut === 'termine' ? '<div class="rang-btn"><button type="button" class="btn sec petit" data-action="projet-modifier">' + ICO.crayon + 'Modifier</button></div>' : '') + '</section>';
    // Épargne
    h += '<section class="carte" aria-labelledby="t-epargne"><h2 id="t-epargne">L\'argent mis de côté</h2><div class="projet-chiffres"><span>Mis de côté <b id="pj-epargne">' + F(t.epargne) + '</b></span><span>Objectif <b id="pj-objectif">' + F(t.objectif) + '</b></span></div>' +
      '<div class="barre epargne"><i style="width:' + t.pct + '%"></i></div><p>Reste à trouver : <b id="pj-reste">' + F(t.resteAEpargner) + '</b></p>';
    if (t.objectif === 0) h += '<p class="petit">Mettez les prix dans la liste ci-dessous : l\'objectif sera calculé tout seul.</p>';
    else if (t.resteAEpargner === 0) h += '<div class="bandeau ok">' + ICO.ok + '<p><b>Objectif atteint !</b> Tout l\'argent est prêt.</p></div>';
    else if (p.statut !== 'termine' && pe.jours > 0) {
      h += '<p class="etiquette" style="margin-top:12px">Pour être prêt à temps, mettez de côté\u00a0:</p><div class="grille-plan" id="plan-epargne"><div><b>' + F(pe.parMois) + '</b><span>par mois</span></div><div><b>' + F(pe.parSemaine) +
        '</b><span>par semaine</span></div><div><b>' + F(pe.parJour) + '</b><span>par jour</span></div></div>';
      if (pe.ecart != null && Math.abs(pe.ecart) >= 500) h += '<p class="petit" id="avance">' + (pe.ecart > 0 ? 'Bravo : vous avez ' + F(pe.ecart) + ' d\'avance sur un rythme régulier.' : 'Vous avez ' + F(-pe.ecart) + ' de retard sur un rythme régulier.') + '</p>';
    } else if (pe.jours <= 0 && t.resteAEpargner > 0 && p.statut !== 'termine') h += '<p class="petit">La date est arrivée. Il manque ' + F(t.resteAEpargner) + '.</p>';
    if (mod) h += '<button type="button" class="btn plein large" data-action="versement" style="margin-top:10px">' + icone('tirelire') + 'Mettre de l\'argent de côté</button><p class="petit">Cet argent compte dans l\'enveloppe Épargne du mois. Les achats faits avec ne sont pas comptés une deuxième fois.</p>';
    var vs = (p.versements || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    if (vs.length) {
      h += '<details><summary class="etiquette" style="cursor:pointer;min-height:44px;display:flex;align-items:center">Historique (' + vs.length + ')</summary><ul class="lignes">' + vs.map(function (v) {
        return '<li><button type="button" class="ligne" data-action="versement-voir" data-id="' + esc(v.id) + '"' + (mod ? '' : ' disabled') + '><span class="ligne-corps"><b>Mis de côté</b><small>' + esc(BF.dateLongue(v.date)) +
          '</small></span><span class="ligne-montant">' + F(v.montant) + '</span></button></li>';
      }).join('') + '</ul></details>';
    }
    h += '</section>';
    // Liste des achats
    h += '<section class="carte" aria-labelledby="t-liste"><div class="carte-tete"><h2 id="t-liste">Liste des achats</h2><span class="pastille brand" id="pj-coches">' + t.nbAchetes + '/' + t.nbLignes + ' achetés</span></div>';
    var groupes = (p.enfants || []).map(function (e) { return { id: e.id, nom: e.nom }; });
    var sansGroupe = (p.lignes || []).filter(function (l) { return !l.groupe || !trouver(groupes, function (g) { return g.id === l.groupe; }); });
    if (sansGroupe.length || !groupes.length) {
      h += sansGroupe.map(function (l) { return ligneCoche(l, mod); }).join('');
      if (!sansGroupe.length && !groupes.length) h += '<p class="petit">La liste est vide.</p>';
      if (mod && !groupes.length) h += '<button type="button" class="btn sec petit" data-action="ligne-ajouter" data-groupe="" style="margin-top:8px">' + ICO.plus + 'Ajouter une ligne</button>';
    }
    groupes.forEach(function (g) {
      var tg = t.groupes[g.id] || { total: 0, nb: 0, nbAchetes: 0 };
      h += '<div class="groupe-tete" data-enfant="' + esc(g.id) + '"><h3>' + esc(g.nom) + '</h3><span><b class="nombre">' + F(tg.total) + '</b>' +
        (mod ? ' <button type="button" class="icone-btn" data-action="enfant-modifier" data-id="' + esc(g.id) + '" aria-label="Modifier ' + esc(g.nom) + '">' + ICO.crayon + '</button>' : '') + '</span></div>' +
        (p.lignes || []).filter(function (l) { return l.groupe === g.id; }).map(function (l) { return ligneCoche(l, mod); }).join('') +
        (mod ? '<button type="button" class="btn sec petit" data-action="ligne-ajouter" data-groupe="' + esc(g.id) + '" style="margin-top:8px">' + ICO.plus + 'Ajouter une ligne pour ' + esc(g.nom) + '</button>' : '');
    });
    if (mod && p.type === 'rentree') h += '<div class="rang-btn"><button type="button" class="btn sec" data-action="enfant-ajouter">' + ICO.plus + 'Ajouter un enfant</button></div>';
    h += '<dl class="totaux"><dt>Total prévu</dt><dd id="pj-total">' + F(t.objectifLignes) + '</dd><dt>Déjà acheté</dt><dd>' + F(t.achete) + '</dd><dt>Reste à acheter</dt><dd id="pj-reste-acheter">' + F(t.resteAAcheter) + '</dd></dl></section>';
    // Partage
    h += '<section class="carte"><h2>Partager la liste</h2><div class="pile"><a class="btn wa large" id="wa-liste" target="_blank" rel="noopener" href="' + esc(BF.lienWhatsApp(BF.texteListeProjet(p, aujourdhui()))) + '">' + ICO.wa +
      'Envoyer sur WhatsApp</a><button type="button" class="btn sec large" data-action="pdf-projet">' + ICO.pdf + 'PDF de la liste</button></div><p class="petit">WhatsApp s\'ouvre avec le message prêt : choisissez la personne et envoyez vous-même.</p></section>';
    vue(h);
  }
  function ligneCoche(l, mod) {
    var m = BF.montantLigne(l);
    return '<div class="coche' + (l.achete ? ' fait' : '') + '"><input type="checkbox" data-action="cocher" data-id="' + esc(l.id) + '"' + (l.achete ? ' checked' : '') + (mod ? '' : ' disabled') +
      ' aria-label="Acheté : ' + esc(l.nom) + '"><button type="button" data-action="ligne" data-id="' + esc(l.id) + '"' + (mod ? '' : ' disabled') + '><span style="min-width:0"><span class="nom">' + esc(l.nom) + '</span>' +
      (l.prix > 0 ? '<small>' + l.qte + ' × ' + F(l.prix) + '</small>' : '') + '</span><span class="prix' + (m > 0 ? '' : ' vide') + '">' + (m > 0 ? F(m) : 'Prix ?') + '</span></button></div>';
  }
  function projetCourant() { var m = location.hash.match(/^#\/projet\/([\w-]+)/); return m ? projetDe(m[1]) : null; }
  function feuilleLigne(p, lid, groupe) {
    var l = lid ? trouver(p.lignes, function (x) { return x.id === lid; }) : null;
    var groupes = p.enfants || [];
    feuille(l ? 'Modifier la ligne' : 'Nouvelle ligne', '<form data-form="ligne" novalidate><div class="champ"><label for="l-nom">Article</label><input id="l-nom" maxlength="80" value="' + esc(l ? l.nom : '') +
      '" placeholder="Ex. : cahiers 100 pages"></div><div class="revenu" style="grid-template-columns:110px 1fr"><div class="champ" style="margin:0"><label for="l-qte">Quantité</label><input type="text" inputmode="numeric" id="l-qte" value="' + (l ? l.qte : 1) + '"></div>' +
      '<div class="champ" style="margin:0"><label for="l-prix">Prix à l\'unité</label>' + champMontant('l-prix', l ? l.prix : 0) + '</div></div><p class="petit">Total : <b id="l-total">' + F(l ? BF.montantLigne(l) : 0) + '</b></p>' +
      (groupes.length ? '<div class="champ"><label for="l-groupe">Pour</label><select id="l-groupe">' + groupes.map(function (g) { return '<option value="' + esc(g.id) + '"' + ((l ? l.groupe : groupe) === g.id ? ' selected' : '') + '>' + esc(g.nom) + '</option>'; }).join('') + '</select></div>' : '') +
      '<label class="case"><input type="checkbox" id="l-achete"' + (l && l.achete ? ' checked' : '') + '>Déjà acheté</label><p class="msg erreur" id="l-msg"></p>' +
      '<div class="rang-btn">' + (l ? '<button type="button" class="btn danger-sec" data-action="ligne-supprimer" data-id="' + esc(l.id) + '">' + ICO.poubelle + 'Supprimer</button>' : '') +
      '<button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>', function (el) {
      var maj = function () { $('#l-total').textContent = F(BF.lireMontant($('#l-prix').value) * Math.max(1, BF.entierPositif($('#l-qte').value, 1))); };
      $('#l-prix').addEventListener('input', maj); $('#l-qte').addEventListener('input', maj);
      $('form', el).addEventListener('submit', function (e) {
        e.preventDefault();
        var nom = $('#l-nom').value.trim();
        if (!nom) { $('#l-msg').textContent = 'Indiquez l\'article.'; $('#l-nom').focus(); return; }
        var g = $('#l-groupe') ? $('#l-groupe').value : (groupe || '');
        if (!l) { l = BF.ligneProjet(nom, 0, 1, g); p.lignes.push(l); }
        l.nom = nom.slice(0, 80); l.qte = Math.max(1, BF.entierPositif($('#l-qte').value, 1)); l.prix = BF.lireMontant($('#l-prix').value); l.groupe = g; l.achete = $('#l-achete').checked;
        fermerFeuille(); sauverProjet(p);
      });
    });
  }
  function feuilleVersement(p) {
    var prem = premium(), mc = moisActuel();
    feuille('Mettre de côté', '<form data-form="versement" novalidate><p>Pour <b>' + esc(p.nom) + '</b></p><div class="champ"><label for="v-montant">Montant mis de côté</label>' + champMontant('v-montant', 0) + '</div>' +
      '<div class="champ"><label for="v-date">Date</label><input type="date" id="v-date" value="' + aujourdhui() + '" max="' + aujourdhui() + '"' + (prem ? '' : ' min="' + mc + '-01"') + '></div><p class="msg erreur" id="v-msg"></p>' +
      '<button type="submit" class="btn plein large">' + ICO.ok + 'Enregistrer</button></form>', function (el) {
      $('form', el).addEventListener('submit', function (e) {
        e.preventDefault();
        var montant = BF.lireMontant($('#v-montant').value), date = $('#v-date').value;
        if (!montant) { $('#v-msg').textContent = 'Indiquez le montant.'; return; }
        if (!BF.dateValide(date) || date > aujourdhui()) { $('#v-msg').textContent = 'Date non valable.'; return; }
        if (!prem && BF.moisDe(date) !== mc) { $('#v-msg').textContent = 'Version gratuite : seulement les dates du mois en cours.'; return; }
        p.versements = (p.versements || []).concat([{ id: BF.nouvelId(), date: date, montant: montant }]);
        fermerFeuille(); sauverProjet(p, F(montant) + ' mis de côté. Bravo !');
      });
    });
  }
  function feuilleModifierProjet(p) {
    var t = BF.totauxProjet(p);
    feuille('Modifier', '<form data-form="projet" novalidate><div class="champ"><label for="pm-nom">Nom</label><input id="pm-nom" maxlength="60" value="' + esc(p.nom) + '"></div>' +
      '<div class="champ"><label for="pm-date">Date du jour J</label><input type="date" id="pm-date" value="' + esc(p.date) + '"></div>' +
      (t.objectifLignes === 0 ? '<div class="champ"><label for="pm-objectif">Montant à réunir</label>' + champMontant('pm-objectif', p.objectifManuel) + '<small>Utilisé tant que la liste n\'a pas de prix.</small></div>' : '') +
      '<label class="case"><input type="checkbox" id="pm-termine"' + (p.statut === 'termine' ? ' checked' : '') + '>Ce budget spécial est terminé</label><p class="msg erreur" id="pm-msg"></p>' +
      '<div class="rang-btn"><button type="button" class="btn danger-sec" data-action="projet-supprimer">' + ICO.poubelle + 'Supprimer</button><button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>', function (el) {
      $('form', el).addEventListener('submit', function (e) {
        e.preventDefault();
        var date = $('#pm-date').value, termine = $('#pm-termine').checked;
        if (!BF.dateValide(date)) { $('#pm-msg').textContent = 'Choisissez une date.'; return; }
        if (!termine && p.statut === 'termine' && !BF.peutCreerProjet(S.projets, premium())) { fermerFeuille(); feuillePass('projet'); return; }
        p.nom = $('#pm-nom').value.trim().slice(0, 60) || p.nom; p.date = date; p.statut = termine ? 'termine' : 'actif';
        if ($('#pm-objectif')) p.objectifManuel = BF.lireMontant($('#pm-objectif').value);
        fermerFeuille(); sauverProjet(p, 'Enregistré.');
      });
    });
  }

  // ---------- Rapport du mois ----------
  function vueRapport(m) {
    var mc = moisActuel(), prem = premium();
    m = m || mc;
    if (!BF.moisAccessible(m, mc, prem)) { rediriger('#/rapport'); feuillePass('mois'); return; }
    if (m > mc) { rediriger('#/rapport'); return; }
    S.mois = m;
    cadre({ titre: 'Rapport du mois', nav: 'rapport' });
    var s = synthese(m), h = moisNav(m, 'rapport');
    h += '<div class="stats"><div class="stat"><small>Revenus</small><strong id="r-revenus">' + F(s.revenus) + '</strong></div><div class="stat"><small>Dépensé</small><strong id="r-depense">' + F(s.depense) + '</strong></div>' +
      '<div class="stat' + (s.solde < 0 ? ' negatif' : '') + '"><small>Solde</small><strong id="r-solde">' + F(s.solde) + '</strong></div><div class="stat"><small>Mis de côté</small><strong>' + F(s.epargne) + '</strong></div></div>';
    var envs = s.enveloppes.filter(function (e) { return e.prevu > 0 || e.depense > 0; });
    h += '<section class="carte" aria-labelledby="t-pd"><h2 id="t-pd">Prévu et dépensé</h2>';
    if (!envs.length) h += '<p class="petit">Rien à afficher pour ce mois.</p>';
    h += '<ul class="barres-h">' + envs.map(function (e) {
      var ecart = e.type === 'epargne' ? (e.prevu > 0 && e.depense < e.prevu ? 'Encore ' + F(e.prevu - e.depense) + ' à mettre de côté' : 'Mis de côté : ' + F(e.depense)) :
        e.paye ? 'Payé' : e.prevu > 0 ? (e.reste >= 0 ? 'Reste ' + F(e.reste) : 'Dépassé de ' + F(-e.reste)) : 'Hors budget';
      return '<li><div class="haut"><span>' + esc(e.nom) + '</span><b>' + F(e.depense) + (e.prevu > 0 ? ' / ' + F(e.prevu) : '') + '</b></div><div class="barre-double" role="img" aria-label="' + esc(e.nom + ' : ' + e.pct + ' %') +
        '"><i class="' + e.niveau + '" style="width:' + largeur(e.prevu > 0 ? e.pct : 100) + '%"></i></div><small class="' + (e.reste < 0 || e.niveau === 'hors' ? 'hausse' : 'petit') + '">' + esc(ecart) + '</small></li>';
    }).join('') + '</ul></section>';
    h += carteComparaison(m, s, prem);
    var top = BF.plusGrosses(S.depenses, m, 5);
    if (top.length) {
      h += '<section class="carte"><h2>Les plus grosses dépenses</h2><ul class="lignes">' + top.map(function (d) {
        return '<li><div class="ligne"><span class="ligne-corps"><b>' + esc(d.note || BF.nomEnveloppe(d.env, [planDe(m) || {}])) + '</b><small>' + esc(BF.nomEnveloppe(d.env, [planDe(m) || {}])) + ' · ' + esc(BF.dateCourte(d.date)) +
          '</small></span><span class="ligne-montant">' + F(d.montant) + '</span></div></li>';
      }).join('') + '</ul></section>';
    }
    h += '<section class="carte"><h2>Exporter et partager</h2><div class="pile"><button type="button" class="btn plein large" data-action="pdf-mois">' + ICO.pdf + 'PDF du rapport</button>' +
      '<button type="button" class="btn sec large" data-action="csv-mois">' + ICO.tableau + 'Fichier CSV (Excel)</button><a class="btn wa large" id="wa-resume" target="_blank" rel="noopener" href="' +
      esc(BF.lienWhatsApp(BF.texteResume(s, S.profil.foyer))) + '">' + ICO.wa + 'Envoyer le résumé sur WhatsApp</a></div></section>';
    vue(h);
  }
  function carteComparaison(m, s, prem) {
    var prec = BF.decalerMois(m, -1);
    if (!prem) {
      return '<section class="carte verrouille" id="comparaison-verrou"><h2>Comparaison avec ' + esc(BF.moisFr(prec)) + '</h2><div class="flou" aria-hidden="true"><ul class="ecarts"><li><span class="nom">Dépense quotidienne</span><span class="val hausse">+ 12 000 F</span></li>' +
        '<li><span class="nom">Transport</span><span class="val baisse">− 4 500 F</span></li><li><span class="nom">Famille et solidarité</span><span class="val hausse">+ 10 000 F</span></li></ul><div class="colonnes"><div><i style="height:60%"></i></div><div><i style="height:80%"></i></div><div><i style="height:45%"></i></div><div><i style="height:70%"></i></div></div></div>' +
        '<div class="sur-flou">' + ICO.cadenas + '<p><b>Comparez vos mois et suivez vos dépenses sur 6 mois</b></p><button type="button" class="btn or" data-action="voir-pass-comparer">Avec le pass</button></div></section>';
    }
    var sp = synthese(prec), h = '<section class="carte" id="comparaison"><h2>Comparaison avec ' + esc(BF.moisFr(prec)) + '</h2>';
    if (!planDe(prec) && sp.depense === 0) h += '<p class="petit">Pas de données pour ' + esc(BF.moisFr(prec)) + '.</p>';
    else {
      var c = BF.comparerMois(s, sp);
      h += '<p id="comp-total">' + (c.diff === 0 ? 'Vous avez dépensé autant qu\'en ' + esc(BF.moisFr(prec)) + '.' : 'Vous avez dépensé <b class="' + (c.diff > 0 ? 'hausse' : 'baisse') + '">' + F(Math.abs(c.diff)) + ' de ' + (c.diff > 0 ? 'plus' : 'moins') +
        '</b> qu\'en ' + esc(BF.moisFr(prec)) + (c.pct != null ? ' (' + (c.pct > 0 ? '+' : '') + c.pct + ' %)' : '') + '.') + '</p>';
      h += '<ul class="ecarts">' + c.lignes.slice(0, 8).map(function (l) {
        return '<li><span class="ico" style="width:34px;height:34px;border-radius:10px">' + icone(l.icone) + '</span><span class="nom">' + esc(l.nom) + '<br><small class="petit">' + F(l.b) + ' → ' + F(l.a) + '</small></span><span class="val ' + (l.diff > 0 ? 'hausse' : l.diff < 0 ? 'baisse' : '') + '">' +
          (l.diff > 0 ? '+ ' : l.diff < 0 ? '− ' : '') + F(Math.abs(l.diff)) + '</span></li>';
      }).join('') + '</ul>';
    }
    // Évolution sur 6 mois
    var mois = [], max = 0;
    for (var i = 5; i >= 0; i--) { var mm = BF.decalerMois(m, -i), t = synthese(mm).depense; mois.push({ m: mm, t: t }); if (t > max) max = t; }
    h += '<h3 style="margin-top:16px">Dépenses sur 6 mois</h3><div class="colonnes" role="img" aria-label="Dépenses des 6 derniers mois">' + mois.map(function (x) {
      return '<div' + (x.m === m ? ' class="courant"' : '') + '><b>' + (x.t >= 1000 ? Math.round(x.t / 1000) + ' k' : N(x.t)) + '</b><i style="height:' + (max > 0 ? Math.max(2, Math.round(x.t * 100 / max)) : 2) + '%"></i></div>';
    }).join('') + '</div><div class="colonnes-legende">' + mois.map(function (x) { return '<span>' + esc(BF.moisFrCourt(x.m).split(' ')[0]) + '</span>'; }).join('') + '</div>';
    return h + '</section>';
  }
  function exporterPDFMois() {
    var m = S.mois || moisActuel(), s = synthese(m), prem = premium();
    var comp = null;
    if (prem) { var prec = BF.decalerMois(m, -1), sp = synthese(prec); if (planDe(prec) || sp.depense > 0) comp = { mois: prec, c: BF.comparerMois(s, sp) }; }
    var deps = S.depenses.filter(function (d) { return d.mois === m; }).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    toast('Préparation du PDF…');
    BFPdf.rapportMois({ s: s, mois: m, comp: comp, depenses: deps, plan: planDe(m), versements: BF.versementsDuMois(S.projets, m), projets: BF.projetsActifs(S.projets), foyer: S.profil.foyer, aujourdhui: aujourdhui() })
      .then(function (blob) { telecharger(blob, 'budget-famille-' + m + '.pdf'); toast('PDF du rapport téléchargé.'); })
      .catch(function (e) { toast(e && e.message ? e.message : 'PDF impossible.'); });
  }
  function exporterCSV(mois) {
    var csv = BF.csvDepenses(S.depenses, S.plans.slice().sort(function (a, b) { return a.mois < b.mois ? 1 : -1; }), S.projets, mois);
    telecharger(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), 'budget-famille-' + (mois || 'toutes-les-depenses') + '.csv');
    toast('Fichier CSV téléchargé.');
  }
  function exporterPDFProjet(p) {
    toast('Préparation du PDF…');
    BFPdf.listeProjet({ p: p, t: BF.totauxProjet(p), pe: BF.planEpargne(p, aujourdhui()), foyer: S.profil.foyer, aujourdhui: aujourdhui() })
      .then(function (blob) { telecharger(blob, 'budget-' + (p.nom || 'special').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.pdf'); toast('PDF de la liste téléchargé.'); })
      .catch(function (e) { toast(e && e.message ? e.message : 'PDF impossible.'); });
  }

  // ---------- Réglages, pass, sauvegarde, aide ----------
  function lireTheme() { try { return localStorage.getItem('bf-theme') || 'auto'; } catch (e) { return 'auto'; } }
  function appliquerTheme(v) {
    try { localStorage.setItem('bf-theme', v); } catch (e) { /* rien */ }
    var r = document.documentElement;
    if (v === 'clair') r.setAttribute('data-theme', 'light'); else if (v === 'sombre') r.setAttribute('data-theme', 'dark'); else r.removeAttribute('data-theme');
  }
  function lireGrand() { try { return localStorage.getItem('bf-grand') === '1'; } catch (e) { return false; } }
  function appliquerGrand(v) { try { localStorage.setItem('bf-grand', v ? '1' : '0'); } catch (e) { /* rien */ } document.documentElement.classList.toggle('grand', v); }
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
    feuille('Installer l\'application', '<p>Ajoutez Budget Famille à l\'écran d\'accueil : elle s\'ouvrira comme une application, même sans Internet.</p>' + instructionsInstall());
  }
  function vueReglages() {
    cadre({ titre: 'Réglages', nav: 'reglages' });
    var e = etatPass(), theme = lireTheme();
    vue('<section class="carte"><h2>Mon foyer</h2><div class="champ"><label for="r-foyer">Nom du foyer (facultatif)</label><input id="r-foyer" maxlength="40" placeholder="Ex. : Famille Diop" value="' + esc(S.profil.foyer || '') +
      '"><small>Apparaît sur vos rapports PDF et vos messages.</small></div></section>' +
      '<section class="carte"><ul class="menu">' +
      '<li><a href="#/plan"><span class="ico">' + ICO.budget + '</span><span>Mon budget du mois<small>Revenus et enveloppes de ' + esc(BF.moisFr(moisActuel())) + '</small></span>' + ICO.droite + '</a></li>' +
      '<li><a href="#/pass"><span class="ico">' + ICO.etoile + '</span><span>Pass Budget Famille<small>' + (e.premium ? 'Actif jusqu\'au ' + esc(BF.dateFr(BF.dateISO(new Date(Date.parse(e.fin))))) : 'Version gratuite') + '</small></span>' + ICO.droite + '</a></li>' +
      '<li><a href="#/sauvegarde"><span class="ico">' + ICO.sauvegarde + '</span><span>Sauvegarde et export<small>' + (S.sauvegarde ? 'Dernière : ' + esc(BF.dateFr(S.sauvegarde.slice(0, 10))) : 'Aucune sauvegarde pour l\'instant') + '</small></span>' + ICO.droite + '</a></li>' +
      '<li><a href="#/aide"><span class="ico">' + ICO.aide + '</span><span>Aide et installation<small>Comment ça marche, installer sur le téléphone</small></span>' + ICO.droite + '</a></li></ul></section>' +
      '<section class="carte"><h2>Alertes</h2><div class="champ"><label for="r-seuil">Prévenir quand une enveloppe est utilisée à</label><select id="r-seuil">' + [70, 80, 90].map(function (v) {
        return '<option value="' + v + '"' + (S.reglages.seuil === v ? ' selected' : '') + '>' + v + ' %</option>';
      }).join('') + '</select><small>Les alertes s\'affichent dans l\'application, rien n\'est envoyé.</small></div></section>' +
      '<section class="carte"><h2>Affichage</h2><div class="champ"><label for="r-theme">Thème</label><select id="r-theme"><option value="auto"' + (theme === 'auto' ? ' selected' : '') + '>Automatique (comme le téléphone)</option>' +
      '<option value="clair"' + (theme === 'clair' ? ' selected' : '') + '>Clair</option><option value="sombre"' + (theme === 'sombre' ? ' selected' : '') + '>Sombre</option></select></div>' +
      '<label class="case"><input type="checkbox" id="r-grand"' + (lireGrand() ? ' checked' : '') + '>Texte plus grand</label></section>' +
      (estInstallee() ? '' : '<section class="carte"><h2>Installer l\'application</h2>' + (invite ? '<button type="button" class="btn plein large" data-action="installer">' + ICO.installer + 'Installer Budget Famille</button>' : instructionsInstall()) + '</section>') +
      '<section class="carte"><h2>Vos données</h2><p class="petit">Tout reste sur ce téléphone : aucun compte, aucune connexion à la banque. Seule la vérification du pass utilise Internet, une fois. L\'application ne détient jamais d\'argent.</p>' +
      '<button type="button" class="btn danger-sec large" data-action="tout-effacer">' + ICO.poubelle + 'Effacer toutes mes données</button></section>' +
      '<p class="petit centre">Budget Famille ' + VERSION + ' · TERANGA · <a href="../">Toutes nos applications</a></p>');
  }
  function vuePass(q) {
    cadre({ titre: 'Pass Budget Famille', retour: '#/reglages', nav: 'reglages' });
    var e = etatPass(), pre = q && q.get('code') || '';
    var atouts = ['Tous vos mois : revenez sur les mois passés et leurs dépenses', 'Comparaison avec le mois précédent et évolution sur 6 mois',
      'Budgets spéciaux sans limite : Tabaski, rentrée, Korité, baptême, mariage…', 'Rapport PDF et CSV de n\'importe quel mois', 'Dépenses à n\'importe quelle date'];
    var h = '';
    if (e.premium) {
      h += '<section class="carte offre" id="pass-actif"><div class="bandeau ok">' + ICO.ok + '<p><b>Pass actif</b> jusqu\'au ' + esc(BF.dateFr(BF.dateISO(new Date(Date.parse(e.fin))))) + ' (' + e.joursRestants + ' jour' + (e.joursRestants > 1 ? 's' : '') + ').</p></div>' +
        '<ul class="atouts">' + atouts.map(function (a) { return '<li>' + ICO.ok + '<span>' + esc(a) + '</span></li>'; }).join('') + '</ul>' +
        (e.rappel ? '<p><b>Votre pass se termine bientôt.</b> Un nouveau pass s\'ajoute à la fin de celui-ci : vous ne perdez aucun jour.</p><a class="btn or large" href="' + URL_ACHAT + '" target="_blank" rel="noopener">' + ICO.boutique + 'Renouveler (' + N(BF.PASS.prix) + ' F)</a>' : '') + '</section>';
    } else {
      if (e.expire) h += '<div class="bandeau alerte">' + ICO.info + '<p>Votre pass s\'est terminé le ' + esc(BF.dateFr(BF.dateISO(new Date(Date.parse(e.fin))))) + '. Vos données sont gardées ; renouvelez pour retrouver tous vos mois.</p></div>';
      h += '<section class="carte offre"><h1>Passez au Pass Budget Famille</h1><ul class="atouts">' + atouts.map(function (a) { return '<li>' + ICO.ok + '<span>' + esc(a) + '</span></li>'; }).join('') + '</ul>' +
        '<p class="prix">' + N(BF.PASS.prix) + ' F <small>pour 12 mois, payé une fois par Wave, sans renouvellement automatique</small></p>' +
        '<a class="btn or large" id="lien-achat" href="' + URL_ACHAT + '" target="_blank" rel="noopener">' + ICO.boutique + 'Acheter le pass (Wave)</a></section>';
    }
    h += '<form class="carte" data-form="pass" novalidate><h2>' + (e.premium ? 'Ajouter un autre pass' : 'Activer mon pass') + '</h2><ol class="etapes"><li>Achetez « Pass Budget Famille 12 mois » dans la boutique TERANGA et payez par Wave.</li>' +
      '<li>Sur la page de votre commande payée, copiez le lien de la page.</li><li>Collez-le ci-dessous puis touchez « Activer ».</li></ol><div class="champ"><label for="c-code">Lien de votre commande</label>' +
      '<textarea id="c-code" rows="3" placeholder="https://…/boutique/commande.html?o=TCV-…&amp;t=…" autocomplete="off" autocapitalize="off" spellcheck="false">' + esc(pre) + '</textarea></div>' +
      '<p class="msg" id="msg-pass" role="status" aria-live="polite"></p><button type="submit" class="btn plein large" id="btn-activer">' + ICO.etoile + 'Activer</button>' +
      '<p class="petit">Internet est nécessaire une seule fois pour vérifier la commande. Ensuite tout marche hors ligne.</p></form>' +
      '<section class="carte"><h2>Toujours gratuit</h2><p class="petit">Le mois en cours avec toutes ses enveloppes, la saisie rapide, les alertes, 1 budget spécial, le rapport du mois en PDF et CSV, le partage WhatsApp, la sauvegarde et l\'export de toutes vos dépenses. ' +
      'Quand un pass se termine, rien n\'est effacé.</p></section>';
    vue(h);
    if (pre && !e.premium) activer(pre);
  }
  function activer(texte) {
    var msg = $('#msg-pass'), btn = $('#btn-activer');
    var dire = function (m, genre) { if (msg) { msg.textContent = m; msg.className = 'msg' + (genre ? ' ' + genre : ''); } };
    var c = BF.lireLienCommande(texte);
    if (!c) return dire('Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « TCV- »).', 'erreur');
    if (navigator.onLine === false) return dire('Vous êtes hors ligne. Connectez-vous à Internet une fois pour activer.', 'erreur');
    dire('Vérification de votre commande…');
    if (btn) btn.disabled = true;
    fetch(BF.urlVerification(c), { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (r.status === 404) throw { m: 'Commande introuvable. Vérifiez que vous avez copié le lien complet.' };
      if (!r.ok) throw { m: 'Le service de vérification ne répond pas. Réessayez dans un instant.' };
      return r.json();
    }).then(function (j) {
      var v = BF.analyserReponse(j, Date.now());
      if (!v.ok) {
        if (v.raison === 'impayee') throw { m: 'Le paiement de cette commande n\'est pas encore confirmé. Terminez le paiement Wave, attendez la confirmation, puis réessayez.' };
        if (v.raison === 'produit') throw { m: 'Ce lien correspond à un autre achat' + (v.titre ? ' (« ' + v.titre + ' »)' : '') + '. Il faut le lien de la commande « Pass Budget Famille 12 mois ».' };
        if (v.raison === 'expiree') throw { m: 'Ce pass est terminé depuis le ' + BF.dateFr(BF.dateISO(new Date(Date.parse(v.fin)))) + '. Achetez un nouveau pass pour continuer.' };
        throw { m: 'Commande introuvable.' };
      }
      S.passes = BF.ajouterPass(S.passes, v.pass, Date.now());
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
    cadre({ titre: 'Sauvegarde et export', retour: S.plans.length ? '#/reglages' : '#/bienvenue', nav: 'reglages' });
    vue('<section class="carte"><h2>Sauvegarder</h2><p>Un fichier avec tous vos budgets, dépenses et budgets spéciaux. Gardez-le en lieu sûr (par exemple envoyez-le-vous sur WhatsApp ou copiez-le sur une carte mémoire).</p>' +
      '<p class="petit">' + (S.sauvegarde ? 'Dernière sauvegarde : ' + esc(BF.dateFr(S.sauvegarde.slice(0, 10))) : 'Aucune sauvegarde pour l\'instant.') + '</p>' +
      '<button type="button" class="btn plein large" data-action="exporter-json">' + ICO.telecharger + 'Télécharger la sauvegarde</button></section>' +
      '<section class="carte"><h2>Restaurer une sauvegarde</h2><p>Remplace toutes les données de ce téléphone par celles du fichier choisi.</p>' +
      '<label class="btn sec large" for="f-import">' + ICO.restaurer + 'Choisir le fichier de sauvegarde</label><input type="file" id="f-import" class="vh" accept=".json,application/json"></section>' +
      '<section class="carte"><h2>Toutes mes dépenses en CSV</h2><p class="petit">Toutes vos dépenses de tous les mois, pour Excel ou une autre application. Toujours disponible, avec ou sans pass : vos données vous appartiennent.</p>' +
      '<button type="button" class="btn sec large" data-action="csv-tout">' + ICO.tableau + 'Télécharger le CSV complet</button></section>');
  }
  function exporterJSON() {
    var data = { app: 'budget-famille', version: 1, exporte: new Date().toISOString(), kv: { profil: S.profil, reglages: S.reglages }, plans: S.plans, depenses: S.depenses, projets: S.projets };
    telecharger(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), 'budget-famille-sauvegarde-' + aujourdhui() + '.json');
    S.sauvegarde = new Date().toISOString();
    DB.mettre('kv', S.sauvegarde, 'sauvegarde').then(function () { toast('Sauvegarde téléchargée.'); if (location.hash === '#/sauvegarde') vueSauvegarde(); });
  }
  function importerJSON(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var data;
      try { data = JSON.parse(lecteur.result); } catch (e) { toast('Fichier illisible : ce n\'est pas une sauvegarde Budget Famille.'); return; }
      if (!data || data.app !== 'budget-famille' || !Array.isArray(data.plans) || !Array.isArray(data.depenses) || !Array.isArray(data.projets)) { toast('Ce fichier n\'est pas une sauvegarde Budget Famille.'); return; }
      confirmer('Remplacer toutes les données de ce téléphone par la sauvegarde du ' + BF.dateFr(String(data.exporte || '').slice(0, 10)) + ' (' + data.plans.length + ' mois, ' + data.depenses.length + ' dépenses) ?', 'Restaurer', true).then(function (oui) {
        if (!oui) return;
        var kv = { profil: (data.kv && data.kv.profil) || { foyer: '' }, reglages: (data.kv && data.kv.reglages) || { seuil: 80 } };
        DB.remplacer({ kv: kv, plans: data.plans.filter(function (p) { return p && /^\d{4}-\d{2}$/.test(p.mois); }), depenses: data.depenses.filter(function (d) { return d && d.id; }), projets: data.projets.filter(function (p) { return p && p.id; }) }, ['passes'])
          .then(charger).then(function () { toast('Sauvegarde restaurée.'); rediriger('#/'); }).catch(erreurStockage);
      });
    };
    lecteur.readAsText(fichier);
  }
  function vueAide() {
    cadre({ titre: 'Aide', retour: '#/reglages', nav: 'reglages' });
    vue('<section class="carte"><h2>Comment ça marche</h2><ol class="etapes"><li><b>Au début du mois</b>, notez l\'argent qui entre et répartissez-le dans des enveloppes : dépense quotidienne, loyer, Senelec ou Woyofal, eau, transport, école, santé, famille, tontine, épargne…</li>' +
      '<li><b>À chaque dépense</b>, touchez le gros bouton <b>+</b>, tapez le montant, choisissez l\'enveloppe : c\'est noté.</li><li><b>Les alertes</b> vous préviennent quand une enveloppe est presque vide ou dépassée.</li>' +
      '<li><b>Les budgets spéciaux</b> (Tabaski, rentrée, Korité…) calculent combien mettre de côté chaque mois jusqu\'au jour J.</li><li><b>À la fin du mois</b>, regardez le rapport, téléchargez le PDF ou envoyez le résumé sur WhatsApp. Le mois suivant reprend vos enveloppes automatiquement.</li></ol></section>' +
      '<section class="carte"><h2>Installer sur le téléphone</h2>' + instructionsInstall() + '</section>' +
      '<section class="carte"><h2>Vie privée</h2><p>Vos chiffres restent sur votre téléphone. Pas de compte, pas de connexion à la banque, pas de publicité. L\'application ne prend et ne garde jamais d\'argent : c\'est un carnet de calcul.</p>' +
      '<p class="petit">Faites une sauvegarde chaque mois : si vous changez de téléphone ou effacez le navigateur, la sauvegarde permet de tout retrouver.</p></section>' +
      '<p class="petit centre"><a href="../">Toutes nos applications</a> · <a href="../../boutique/">Boutique TERANGA</a></p>');
  }
  function toutEffacer() {
    confirmer('Effacer définitivement tous vos budgets, dépenses et budgets spéciaux de ce téléphone ? Faites d\'abord une sauvegarde.', 'Tout effacer', true).then(function (oui) {
      if (!oui) return;
      DB.toutEffacer(['passes']).then(function () {
        S.plans = []; S.depenses = []; S.projets = []; S.profil = { foyer: '' }; S.reglages = { seuil: 80 }; S.sauvegarde = null; S.nouveauMois = null;
        toast('Données effacées.'); rediriger('#/bienvenue');
      }).catch(erreurStockage);
    });
  }
  function erreurStockage(e) { toast('Enregistrement impossible : ' + (e && e.message ? e.message : 'stockage plein ou indisponible') + '.', null, 'danger'); }

  // ---------- Événements ----------
  var ACTIONS = {
    'mois': function (b) {
      var m = b.dataset.m, base = b.dataset.base;
      if (!BF.moisAccessible(m, moisActuel(), premium())) { feuillePass('mois'); return; }
      aller(lienMois(base, m));
    },
    'payer': function (b) { payer(b.dataset.env); },
    'prevu': function (b) { feuillePrevu(b.dataset.env, b.dataset.m); },
    'depense': function (b) { feuilleDepense(b.dataset.id); },
    'supprimer-depense': function (b) { fermerFeuille(); supprimerDepense(b.dataset.id); },
    'ajouter-revenu': function () { $('#revenus').insertAdjacentHTML('beforeend', ligneRevenu({ nom: '', montant: 0 })); $('#revenus .revenu:last-child [data-rnom]').focus(); },
    'retirer-revenu': function (b) { b.closest('.revenu').remove(); majTotauxPlan(); },
    'ajouter-perso': function () { feuilleEnveloppePerso(); },
    's-note': function () { feuilleNote(); },
    's-autres': function () { feuilleAutresEnveloppes(); },
    's-enregistrer': function () { enregistrerSaisie(); },
    'nouveau-projet': function () { if (!BF.peutCreerProjet(S.projets, premium())) { feuillePass('projet'); return; } aller('#/projet-nouveau'); },
    'np-enfant-plus': function () {
      var z = $('#np-enfants'), n = $$('.np-enfant', z).length + 1;
      z.insertAdjacentHTML('beforeend', '<input class="np-enfant" maxlength="40" placeholder="' + n + 'e enfant" aria-label="Prénom du ' + n + 'e enfant" style="margin-bottom:8px">');
      $$('.np-enfant', z).pop().focus();
    },
    'versement': function () { var p = projetCourant(); if (p) feuilleVersement(p); },
    'versement-voir': function (b) {
      var p = projetCourant(); if (!p) return;
      var v = trouver(p.versements || [], function (x) { return x.id === b.dataset.id; }); if (!v) return;
      confirmer('Supprimer ce montant mis de côté (' + F(v.montant) + ' le ' + BF.dateFr(v.date) + ') ?', 'Supprimer', true).then(function (oui) {
        if (!oui) return;
        p.versements = p.versements.filter(function (x) { return x.id !== v.id; });
        sauverProjet(p, 'Supprimé.');
      });
    },
    'ligne': function (b) { var p = projetCourant(); if (p) feuilleLigne(p, b.dataset.id); },
    'ligne-ajouter': function (b) { var p = projetCourant(); if (p) feuilleLigne(p, null, b.dataset.groupe); },
    'ligne-supprimer': function (b) {
      var p = projetCourant(); if (!p) return;
      var l = trouver(p.lignes, function (x) { return x.id === b.dataset.id; });
      p.lignes = p.lignes.filter(function (x) { return x.id !== b.dataset.id; });
      fermerFeuille();
      sauverProjet(p).then(function () { toast('Ligne supprimée.', { label: 'Annuler', fn: function () { p.lignes.push(l); sauverProjet(p); } }); });
    },
    'enfant-ajouter': function () {
      var p = projetCourant(); if (!p) return;
      feuille('Ajouter un enfant', '<form data-form="enfant"><div class="champ"><label for="e-nom">Prénom</label><input id="e-nom" maxlength="40"></div><button type="submit" class="btn plein large">' + ICO.plus + 'Ajouter sa liste</button></form>', function (el) {
        $('form', el).addEventListener('submit', function (e) { e.preventDefault(); BF.ajouterEnfant(p, $('#e-nom').value); fermerFeuille(); sauverProjet(p, 'Liste ajoutée.'); });
      });
    },
    'enfant-modifier': function (b) {
      var p = projetCourant(); if (!p) return;
      var g = trouver(p.enfants || [], function (x) { return x.id === b.dataset.id; }); if (!g) return;
      feuille('Modifier', '<form data-form="enfant"><div class="champ"><label for="e-nom">Prénom</label><input id="e-nom" maxlength="40" value="' + esc(g.nom) + '"></div><div class="rang-btn"><button type="button" class="btn danger-sec" id="e-suppr">' + ICO.poubelle +
        'Retirer cet enfant</button><button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>', function (el) {
        $('form', el).addEventListener('submit', function (e) { e.preventDefault(); g.nom = $('#e-nom').value.trim().slice(0, 40) || g.nom; fermerFeuille(); sauverProjet(p); });
        $('#e-suppr', el).addEventListener('click', function () {
          fermerFeuille();
          confirmer('Retirer ' + g.nom + ' et sa liste ?', 'Retirer', true).then(function (oui) {
            if (!oui) return;
            p.enfants = p.enfants.filter(function (x) { return x.id !== g.id; });
            p.lignes = p.lignes.filter(function (l) { return l.groupe !== g.id; });
            sauverProjet(p, 'Retiré.');
          });
        });
      });
    },
    'projet-modifier': function () { var p = projetCourant(); if (p) feuilleModifierProjet(p); },
    'projet-supprimer': function () {
      var p = projetCourant(); if (!p) return;
      fermerFeuille();
      confirmer('Supprimer « ' + p.nom + ' », sa liste et l\'argent mis de côté noté ?', 'Supprimer', true).then(function (oui) {
        if (!oui) return;
        S.projets = S.projets.filter(function (x) { return x.id !== p.id; });
        DB.effacer('projets', p.id).then(function () { rediriger('#/projets'); toast('Budget spécial supprimé.'); }).catch(erreurStockage);
      });
    },
    'pdf-projet': function () { var p = projetCourant(); if (p) exporterPDFProjet(p); },
    'pdf-mois': function () { exporterPDFMois(); },
    'csv-mois': function () { exporterCSV(S.mois || moisActuel()); },
    'csv-tout': function () { exporterCSV(null); },
    'voir-pass-comparer': function () { feuillePass('comparer'); },
    'exporter-json': function () { exporterJSON(); },
    'tout-effacer': function () { toutEffacer(); },
    'installer': function () { installer(); },
    'pass-vu': function () { var e = etatPass(); S.passVu = e.fin; DB.mettre('kv', e.fin, 'passVu'); var b = $('#bandeau-pass'); if (b) b.remove(); },
    'vu-nouveau-mois': function () { S.nouveauMois = null; }
  };
  function brancher() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-action],[data-touche],.tuile[data-env],.type[data-type]');
      if (!t || t.disabled) return;
      if (t.dataset.touche) { toucheSaisie(t.dataset.touche); return; }
      if (t.classList.contains('tuile') && t.dataset.env && !t.dataset.action) { saisie.env = t.dataset.env; majSaisie(); return; }
      if (t.classList.contains('type') && t.dataset.type) { formulaireNouveauProjet(t.dataset.type); return; }
      var a = t.dataset.action;
      if (a === 'cocher') return; // géré par « change »
      if (ACTIONS[a]) { if (t.tagName === 'A' && a !== 'vu-nouveau-mois') e.preventDefault(); ACTIONS[a](t, e); }
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el.dataset.action === 'cocher') {
        var p = projetCourant(); if (!p) return;
        var l = trouver(p.lignes, function (x) { return x.id === el.dataset.id; }); if (!l) return;
        l.achete = el.checked; sauverProjet(p); return;
      }
      if (el.id === 's-date' && saisie) {
        var v = el.value;
        if (!BF.dateValide(v) || v > aujourdhui()) { el.value = saisie.date; return; }
        if (!premium() && BF.moisDe(v) !== moisActuel()) { el.value = saisie.date; feuillePass('date'); return; }
        saisie.date = v; majSaisie(); return;
      }
      if (el.id === 'r-foyer') { S.profil.foyer = el.value.trim().slice(0, 40); DB.mettre('kv', S.profil, 'profil').then(function () { toast('Enregistré.'); }); return; }
      if (el.id === 'r-seuil') { S.reglages.seuil = +el.value; DB.mettre('kv', S.reglages, 'reglages').then(function () { toast('Alerte à ' + el.value + ' %.'); }); return; }
      if (el.id === 'r-theme') { appliquerTheme(el.value); return; }
      if (el.id === 'r-grand') { appliquerGrand(el.checked); return; }
      if (el.id === 'f-import' && el.files && el.files[0]) { importerJSON(el.files[0]); el.value = ''; return; }
      if (el.id === 'np-date') {
        var nom = $('#np-nom');
        if (nom && nom.dataset.auto === '1' && BF.dateValide(el.value)) nom.value = BF.MODELES[$('form[data-form=nouveau-projet]').dataset.type].nom + ' ' + el.value.slice(0, 4);
      }
    });
    document.addEventListener('input', function (e) {
      var el = e.target;
      if (el.id === 'np-nom') el.dataset.auto = '0';
      if (!el.closest('form[data-form=plan]')) return;
      if (el.hasAttribute('data-parjour')) {
        var f = el.closest('form'), pj = BF.lireMontant(el.value), mens = $('#pe-quotidien', f);
        if (pj > 0) mens.value = N(pj * BF.joursDansMois(f.dataset.mois), ' ');
      } else if (el.id === 'pe-quotidien') {
        var pjx = $('#pj-quotidien'); if (pjx) pjx.value = '';
      }
      majTotauxPlan();
    });
    document.addEventListener('focusout', function (e) {
      var el = e.target;
      if (el.classList && el.classList.contains('montant') && el.value) { var v = BF.lireMontant(el.value); el.value = v ? N(v, ' ') : ''; }
    });
    document.addEventListener('submit', function (e) {
      var f = e.target;
      if (f.dataset.form === 'plan') { e.preventDefault(); enregistrerPlan(f); }
      else if (f.dataset.form === 'nouveau-projet') { e.preventDefault(); creerProjet(f); }
      else if (f.dataset.form === 'pass') { e.preventDefault(); activer($('#c-code').value); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && feuilleOuverte) { fermerFeuille(); return; }
      if (!saisie || feuilleOuverte || !$('#s-montant')) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) return;
      if (/^[0-9]$/.test(e.key)) { toucheSaisie(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { toucheSaisie('effacer'); e.preventDefault(); }
      else if (e.key === 'Enter') { enregistrerSaisie(); e.preventDefault(); }
    });
    $('#retour').addEventListener('click', retour);
    $('#installer').addEventListener('click', installer);
    window.addEventListener('hashchange', function () { if (!/^#\/ajouter/.test(location.hash)) saisie = null; router(); });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; majInstall(); });
    window.addEventListener('appinstalled', function () { invite = null; majInstall(); toast('Application installée.'); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible' || !S.plans.length) return;
      assurerMoisCourant().then(function (nouveau) { if (nouveau && !feuilleOuverte && !saisie) router(); });
    });
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
    }).catch(function () { /* hors ligne au premier chargement : rien */ });
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (majDemandee) { majDemandee = false; location.reload(); } });
  }

  function demarrer() {
    brancher();
    majInstall();
    // Lien direct depuis la page de commande : ?o=TCV-…&t=…
    var p = new URLSearchParams(location.search);
    if (p.get('o') && p.get('t')) {
      var code = '?o=' + p.get('o') + '&t=' + p.get('t');
      history.replaceState(null, '', location.pathname + '#/pass?code=' + encodeURIComponent(code));
    }
    charger().then(router).catch(function (e) {
      vue('<section class="carte"><h1>Stockage indisponible</h1><p>' + esc(e && e.message || e) + '</p><p>Sur iPhone, quittez la navigation privée. Sinon, mettez à jour votre navigateur.</p></section>');
    });
    serviceWorker();
  }
  window.BFApp = { etat: S, version: VERSION, synthese: synthese };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
