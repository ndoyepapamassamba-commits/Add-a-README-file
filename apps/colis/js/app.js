/* ColisPreuve — écrans : tableau de bord du vendeur, nouveau colis, partage, détail, vue livreur, vue client,
   pass, réglages. Les liens livreur / client marchent sans installation. */
(function () {
  'use strict';
  var CP = window.CP, DB = window.DB, R = window.CPR, PH = window.CPPhoto;
  var VERSION = '1.0.0';
  var BOUTIQUE = '../../boutique/';
  var PASS = {
    'pass-colispreuve-1-mois': { nom: 'Pass ColisPreuve 1 mois', prix: 3000, jours: 30, duree: '1 mois' },
    'pass-colispreuve-12-mois': { nom: 'Pass ColisPreuve 12 mois', prix: 30000, jours: 365, duree: '12 mois' }
  };
  var NOTICE = 'ColisPreuve garde une trace datée et chaînée de chaque étape. Sa valeur en cas de litige dépend des circonstances.';
  var JOUR = 86400000;
  var S = { colis: [], liens: [], file: [], pass: null, reglages: { boutique: '', heures: 24, prochain: 1 }, creations: {}, filtre: { etat: 'tous', periode: 'tout', texte: '' }, actualiseLe: 0, verif: {} };
  var V = { nom: '', args: [] };
  var minuterie = null, invite = null, swAttente = null, feuilleEtat = null, dernierFocus = null;

  // ---------- Outils ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Typographie française à l'écran : espace insécable avant « : ; ? ! » et à l'intérieur des guillemets
  function fr(h) { return h.replace(/ ([:;?!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0'); }
  function svg(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + p + '</svg>'; }
  var ICO = {
    colis: svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    etoile: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>'),
    reglages: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    photo: svg('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>'),
    note: svg('<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    route: svg('<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
    main: svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m8 11 4 3 6-7"/>'),
    cle: svg('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14.5 8.5l2 2"/>'),
    horloge: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    ok: svg('<path d="m5 12.5 4.5 4.5L19 7"/>'),
    alerte: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>'),
    annuler: svg('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>'),
    partager: svg('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>'),
    copier: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    message: svg('<path d="M4 20l1.3-3.9A8 8 0 1 1 8.2 19z"/><path d="M9 10.5h6M9 13.5h4"/>'),
    pdf: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    bouclier: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
    actualiser: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
    telecharger: svg('<path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16"/>'),
    installer: svg('<path d="M12 3v11m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="4" rx="1"/>'),
    horsligne: svg('<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.3-2.5M19 12.9a10 10 0 0 0-2-1.5M2 9a15 15 0 0 1 4.2-2.6M22 9a15 15 0 0 0-9.8-3.9"/><circle cx="12" cy="20" r=".8"/>'),
    retour: svg('<path d="M15 18l-6-6 6-6"/>'),
    fleche: svg('<path d="m9 6 6 6-6 6"/>'),
    lien: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    client: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>'),
    probleme: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>'),
    fermer: svg('<path d="M6 6l12 12M18 6 6 18"/>')
  };
  var ICO_EV = { creation: 'colis', preparation: 'colis', remise_livreur: 'main', prise_en_charge: 'main', en_route: 'route', tentative: 'horloge', livraison: 'cle', reception: 'ok', probleme: 'probleme', annulation: 'annuler', note: 'note', preuve: 'photo', modification: 'note', photo: 'photo' };

  function toast(msg, ms, action) {
    var t = $('#toast');
    t.innerHTML = '<span>' + fr(esc(msg)) + '</span>' + (action ? '<button type="button" class="toast-btn">' + esc(action.libelle) + '</button>' : '');
    t.hidden = false;
    if (action) $('.toast-btn', t).addEventListener('click', function () { t.hidden = true; action.faire(); });
    clearTimeout(toast.m);
    toast.m = setTimeout(function () { t.hidden = true; }, ms || 3800);
  }
  function afficher(html) { $('#vue').innerHTML = fr(html); }
  function sauverColis(c) { return DB.mettre('colis', c); }
  function sauverLien(l) { return DB.mettre('liens', l); }
  function sauverKv(k, v) { return DB.mettre('kv', v, k); }
  function premium() { return !!(S.pass && S.pass.valide); }
  function creesCeMois() { return S.creations[CP.cleMois(Date.now())] || 0; }
  function base() { return CP.baseApp(location); }
  function enLigne() { return navigator.onLine !== false; }
  function colisPar(id) { for (var i = 0; i < S.colis.length; i++) if (S.colis[i].id === id) return S.colis[i]; return null; }
  function lienPar(role, id) { for (var i = 0; i < S.liens.length; i++) if (S.liens[i].cle === role + ':' + id) return S.liens[i]; return null; }
  function pendants(id) { return S.file.filter(function (it) { return it.dossier === id; }); }
  function evsAvecPendants(evs, id) {
    var p = pendants(id).filter(function (it) { return it.etat === 'attente' && it.type !== 'photo' && it.type !== 'livraison' && it.type !== 'reception'; })
      .map(function (it) { return { type: it.type, auteur: it.role, le: new Date(it.creeLe).toISOString(), donnees: it.donnees || {}, enAttente: true }; });
    return (evs || []).concat(p);
  }
  function enAttente(id, type) { return pendants(id).filter(function (it) { return it.type === type && it.etat === 'attente'; })[0] || null; }
  function badge(etat) { return '<span class="badge e-' + etat + '">' + esc(CP.ETATS[etat].libelle) + '</span>'; }
  function montantTxt(n) { return '<span class="nw">' + esc(CP.formatF(n)) + '</span>'; }
  function chargerScript(src) {
    chargerScript.cache = chargerScript.cache || {};
    if (!chargerScript.cache[src]) chargerScript.cache[src] = new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { delete chargerScript.cache[src]; ko(new Error('script')); };
      document.head.appendChild(s);
    });
    return chargerScript.cache[src];
  }
  function telecharger(blob, nom) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function copier(texte) {
    function repli() {
      var z = document.createElement('textarea'); z.value = texte; z.setAttribute('readonly', ''); z.style.position = 'fixed'; z.style.opacity = '0';
      document.body.appendChild(z); z.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } z.remove(); return ok;
    }
    var p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(texte).then(function () { return true; }, repli) : Promise.resolve(repli());
    return p.then(function (ok) { toast(ok ? 'Copié ✓' : 'Copie impossible : appuyez longuement sur le texte pour le copier.'); });
  }
  function partagerTexte(texte) {
    if (navigator.share) return navigator.share({ text: texte }).catch(function (e) { if (!e || e.name !== 'AbortError') copier(texte); });
    return copier(texte);
  }
  function wa(texte) { return 'https://wa.me/?text=' + encodeURIComponent(texte); }

  // ---------- Feuille (fenêtre du bas) ----------
  function ouvrirFeuille(html, etat) {
    var f = $('#feuille');
    dernierFocus = document.activeElement;
    feuilleEtat = etat || {};
    $('.feuille-contenu', f).innerHTML = '<button type="button" class="feuille-fermer" data-action="fermer-feuille" aria-label="Fermer">' + ICO.fermer + '</button>' + fr(html);
    f.hidden = false;
    document.body.classList.add('feuille-ouverte');
    var champ = $('.feuille-contenu h2', f);
    if (champ) { champ.setAttribute('tabindex', '-1'); champ.focus(); }
  }
  function fermerFeuille() {
    var f = $('#feuille');
    if (f.hidden) return;
    f.hidden = true; feuilleEtat = null;
    document.body.classList.remove('feuille-ouverte');
    $('.feuille-contenu', f).innerHTML = '';
    if (dernierFocus && dernierFocus.focus && document.body.contains(dernierFocus)) dernierFocus.focus();
  }
  function msgFeuille(texte, erreur) {
    var m = $('#feuille .msg');
    if (m) { m.textContent = fr(texte || ''); m.classList.toggle('erreur', !!erreur); }
  }

  // ---------- Démarrage ----------
  function demarrer() {
    Promise.all([DB.tout('colis'), DB.tout('liens'), DB.lire('kv', 'pass'), DB.lire('kv', 'reglages'), DB.lire('kv', 'creations'), R.liste(), DB.persistant()])
      .then(function (r) {
        S.colis = r[0] || []; S.liens = r[1] || []; S.pass = r[2] || null;
        if (r[3]) for (var k in r[3]) S.reglages[k] = r[3][k];
        S.creations = r[4] || {}; S.file = r[5] || [];
        if (!r[6]) setTimeout(function () { toast('Mode privé : rien ne sera gardé sur ce téléphone après fermeture.', 6000); }, 800);
        R.ecouter(surFile);
        window.addEventListener('hashchange', router);
        window.addEventListener('online', majReseau); window.addEventListener('offline', majReseau);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) actualiserVue(); });
        majReseau(); router(); installation(); enregistrerSW(); verifierPassRoutine();
        R.vider().catch(function () {});
      });
  }
  function majReseau() {
    var b = $('#reseau');
    var n = S.file.filter(function (it) { return it.etat === 'attente'; }).length;
    b.hidden = enLigne() && !n;
    b.innerHTML = enLigne() ? '<span>' + n + ' en attente</span>' : ICO.horsligne + '<span>Hors ligne' + (n ? ' · ' + n : '') + '</span>';
    b.classList.toggle('attente', enLigne());
  }
  function surFile(bilan) {
    R.liste().then(function (l) {
      S.file = l; majReseau();
      if (bilan && bilan.envoyes && bilan.envoyes.length) {
        var ids = {};
        bilan.envoyes.forEach(function (it) { ids[it.dossier] = it; });
        if (bilan.envoyes.some(function (it) { return Date.now() - it.creeLe > 20000; })) toast('Actions en attente envoyées ✓');
        return Promise.all(Object.keys(ids).map(function (id) { return rafraichirDossier(id, ids[id].role, ids[id].jeton).catch(function () {}); })).then(rendreSiAffichage);
      }
      if (bilan && bilan.refuses && bilan.refuses.length && $('#feuille').hidden) toast(bilan.refuses[0].message || 'Une action a été refusée.', 6000);
      rendreSiAffichage();
    });
  }
  function rendreSiAffichage() {
    if (['accueil', 'colis', 'livreur', 'suivi'].indexOf(V.nom) >= 0) rendre(true);
  }

  // ---------- Routeur ----------
  var ID = '(D-[0-9A-HJKMNP-TV-Z]{10})', JT = '([A-Za-z0-9_-]{20,64})';
  var ROUTES = [
    ['accueil', /^\/?$/], ['nouveau', /^\/nouveau$/], ['partager', new RegExp('^/colis/' + ID + '/partager$')], ['colis', new RegExp('^/colis/' + ID + '$')],
    ['livreur', new RegExp('^/livreur/' + ID + '/' + JT + '$')], ['suivi', new RegExp('^/suivi/' + ID + '/' + JT + '$')], ['vendeur', new RegExp('^/vendeur/' + ID + '/' + JT + '$')],
    ['pass', /^\/pass$/], ['reglages', /^\/reglages$/]
  ];
  function router() {
    clearInterval(minuterie); fermerFeuille();
    var h = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
    var nom = 'accueil', args = [];
    for (var i = 0; i < ROUTES.length; i++) { var m = h.match(ROUTES[i][1]); if (m) { nom = ROUTES[i][0]; args = m.slice(1); break; } }
    V = { nom: nom, args: args };
    var role = nom === 'livreur' || nom === 'suivi';
    document.body.classList.toggle('vue-role', role);
    if (V.premier) majInstall();
    $$('#nav a').forEach(function (a) { a.classList.toggle('actif', a.getAttribute('data-nav') === nom || (nom === 'colis' || nom === 'partager') && a.getAttribute('data-nav') === 'accueil'); if (a.classList.contains('actif')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    window.scrollTo(0, 0);
    rendre(false);
    var main = $('#vue'); if (main && document.activeElement !== main && V.premier) main.focus({ preventScroll: true });
    V.premier = true;
    if (['accueil', 'colis', 'livreur', 'suivi'].indexOf(nom) >= 0) {
      minuterie = setInterval(function () { if (!document.hidden) actualiserVue(); }, nom === 'accueil' ? 120000 : 30000);
      actualiserVue(true);
    }
  }
  function rendre(maj) {
    var y = window.scrollY;
    var f = { accueil: vueAccueil, nouveau: vueNouveau, partager: vuePartager, colis: vueColis, livreur: vueLivreur, suivi: vueSuivi, vendeur: vueVendeur, pass: vuePass, reglages: vueReglages }[V.nom];
    f.apply(null, V.args);
    if (maj) window.scrollTo(0, y);
    document.title = V.nom === 'livreur' ? 'Livraison — ColisPreuve' : V.nom === 'suivi' ? 'Suivi de colis — ColisPreuve' : 'ColisPreuve — la preuve de livraison des petits commerçants';
  }
  function actualiserVue(premier) {
    if (!enLigne()) return;
    var n = V.nom, a = V.args;
    var p = n === 'accueil' ? rafraichirTout(false) : n === 'colis' ? rafraichirColis(colisPar(a[0])) : n === 'livreur' ? chargerRole('livreur', a[0], a[1]) : n === 'suivi' ? chargerRole('destinataire', a[0], a[1]) : null;
    if (p) p.then(function (change) { if (change && V.nom === n && V.args[0] === a[0]) rendre(true); }).catch(function () {});
  }

  // ---------- Données du serveur ----------
  function signature(evs) { evs = evs || []; return evs.length + ':' + (evs.length ? evs[evs.length - 1].empreinte : ''); }
  function rafraichirColis(c) {
    if (!c || !c.jetons || !c.jetons.proprio) return Promise.resolve(false);
    return R.lire(c.id, c.jetons.proprio).then(function (r) {
      if (r.status === 404) { var avant = c.introuvable; c.introuvable = true; return sauverColis(c).then(function () { return !avant; }); }
      if (!r.ok || !r.json.dossier) return false;
      var d = r.json.dossier, change = signature(d.evenements) !== signature(c.evenements) || c.introuvable;
      c.evenements = d.evenements || []; c.statut = d.statut; c.majLe = Date.now(); c.introuvable = false;
      return sauverColis(c).then(function () { return change; });
    });
  }
  function rafraichirTout(force) {
    if (!enLigne()) return Promise.resolve(false);
    if (!force && Date.now() - S.actualiseLe < 60000) return Promise.resolve(false);
    S.actualiseLe = Date.now();
    var liste = S.colis.filter(function (c) {
      if (c.introuvable) return false;
      var e = CP.etatColis(c.evenements);
      if (force || (e !== 'recu' && e !== 'annule')) return true;
      return Date.now() - (c.majLe || 0) > 6 * 3600000 && Date.now() - Date.parse(c.creeLe) < 3 * JOUR;
    });
    var i = 0, change = false;
    function ouvrier() {
      if (i >= liste.length) return Promise.resolve();
      var c = liste[i++];
      return rafraichirColis(c).then(function (ch) { if (ch) change = true; return ouvrier(); }, function (e) { if (!(e && e.reseau)) return ouvrier(); });
    }
    return Promise.all([ouvrier(), ouvrier(), ouvrier()]).then(function () { return change; });
  }
  function chargerRole(role, id, jeton) {
    var l = lienPar(role, id) || { cle: role + ':' + id, role: role, id: id, jeton: jeton, dossier: null, vuLe: Date.now() };
    l.jeton = jeton;
    return R.lire(id, jeton).then(function (r) {
      var avant = signature(l.dossier && l.dossier.evenements) + (l.erreur || '');
      if (r.status === 404) { l.erreur = 'introuvable'; }
      else if (r.ok && r.json.dossier) { l.dossier = r.json.dossier; l.erreur = null; l.majLe = Date.now(); }
      else return false;
      if (!lienPar(role, id) && !l.erreur) S.liens.push(l);
      var apres = signature(l.dossier && l.dossier.evenements) + (l.erreur || '');
      if (l.erreur && !lienPar(role, id)) { S.liensTemp = S.liensTemp || {}; S.liensTemp[l.cle] = l; return true; }
      return sauverLien(l).then(function () { return avant !== apres; });
    });
  }
  function rafraichirDossier(id, role, jeton) {
    var c = colisPar(id);
    if (c && role === 'proprio') return rafraichirColis(c);
    if (role === 'livreur' || role === 'destinataire') return chargerRole(role, id, jeton);
    return c ? rafraichirColis(c) : Promise.resolve(false);
  }

  // ---------- Exécution d'une action (en direct, ou en file d'attente sans réseau) ----------
  // → { etat: 'envoye' | 'attente' | 'code' | 'erreur', message }
  function executer(item) {
    return R.ajouter(item).then(function (it) {
      return R.liste().then(function (l) { S.file = l; majReseau(); return it; });
    }).then(function (it) {
      return R.vider().catch(function () { return null; }).then(function () { return DB.lire('file', it.n); }).then(function (reste) {
        return R.liste().then(function (l) {
          S.file = l; majReseau();
          if (!reste) return { etat: 'envoye' };
          return { etat: reste.etat, message: reste.message, n: reste.n };
        });
      });
    });
  }
  function apresAction(res, ctx, okMsg) {
    if (res.etat === 'envoye') { toast(okMsg || 'Enregistré ✓'); return rafraichirDossier(ctx.id, ctx.role, ctx.jeton).catch(function () {}).then(function () { rendre(true); }); }
    if (res.etat === 'attente' && pendants(ctx.id).some(function (it) { return it.etat !== 'attente'; })) { toast('Action gardée : elle partira après la correction de l\'action refusée.', 6000); rendre(true); return; }
    if (res.etat === 'attente') { toast(enLigne() ? 'Le serveur ne répond pas pour le moment : action gardée sur le téléphone, elle sera renvoyée toute seule.' : 'Pas de réseau : action gardée sur le téléphone. Elle partira toute seule dès le retour du réseau.', 7000); rendre(true); return; }
    toast(res.message || 'Action refusée.', 6000); rendre(true);
  }

  // ---------- Éléments communs ----------
  function frise(evs, ctx) {
    var items = [];
    pendants(ctx.id).slice().reverse().forEach(function (it) { items.push(itemPendant(it)); });
    (evs || []).slice().reverse().forEach(function (e) { items.push(itemEv(e, ctx)); });
    if (!items.length) return '<p class="vide">Aucune étape pour le moment.</p>';
    return '<ol class="frise">' + items.join('') + '</ol>';
  }
  function itemEv(e, ctx) {
    var d = e.donnees || {}, det = CP.detailEvenement(e);
    var photo = e.type === 'preuve' && d.photo && ctx.jeton ? '<button type="button" class="vignette" data-action="voir-photo" data-src="' + esc(R.urlPhoto(ctx.id, d.photo, ctx.jeton)) + '" aria-label="Agrandir la photo"><img loading="lazy" alt="Photo : ' + esc(d.legende || d.photo) + '" src="' + esc(R.urlPhoto(ctx.id, d.photo, ctx.jeton)) + '"></button>' : '';
    var code = e.type === 'livraison' && d.code_verifie ? ' <span class="puce ok">' + ICO.ok + 'Code vérifié</span>' : '';
    var differe = d.fait_le ? '<small class="differe">Fait à ' + esc(CP.heureFr(d.fait_le)) + ' sans réseau, envoyé à ' + esc(CP.heureFr(e.le)) + '</small>' : '';
    return '<li class="fr-' + e.type + '"><span class="fr-point">' + ICO[ICO_EV[e.type] || 'note'] + '</span><div class="fr-corps"><strong>' + esc(CP.libelleEvenement(e)) + '</strong>' + code +
      '<small>' + esc(CP.dateHeureFr(e.le)) + ' · ' + esc(CP.ROLES[e.auteur] || '') + '</small>' + (det && e.type !== 'creation' ? '<p>' + esc(det) + '</p>' : '') + differe + photo + '</div></li>';
  }
  function itemPendant(it) {
    var titre = it.type === 'photo' ? 'Photo' : CP.libelleEvenement({ type: it.type });
    if (it.type === 'livraison') titre = 'Livraison (code à vérifier)';
    var etat = it.etat === 'attente' ? '<span class="puce attente">' + ICO.horloge + 'En attente d\'envoi</span>' : '<span class="puce ko">' + ICO.alerte + (it.etat === 'code' ? 'Code refusé' : 'Refusé') + '</span>';
    var actions = it.etat === 'code' ? '<div class="rang"><button type="button" class="btn plein petit" data-action="recoder" data-n="' + it.n + '">Ressaisir le code</button><button type="button" class="btn sec petit" data-action="retirer-file" data-n="' + it.n + '">Supprimer</button></div>'
      : it.etat === 'erreur' ? '<div class="rang"><button type="button" class="btn sec petit" data-action="reessayer" data-n="' + it.n + '">Réessayer</button><button type="button" class="btn sec petit" data-action="retirer-file" data-n="' + it.n + '">Supprimer</button></div>' : '';
    var d = it.donnees || {};
    var det = [d.raison, d.commentaire ? '« ' + d.commentaire + ' »' : '', it.legende].filter(Boolean).join(' · ');
    return '<li class="fr-pendant fr-' + it.type + '"><span class="fr-point">' + ICO[ICO_EV[it.type] || 'note'] + '</span><div class="fr-corps"><strong>' + esc(titre) + '</strong> ' + etat +
      '<small>Fait à ' + esc(CP.heureFr(new Date(it.creeLe).toISOString())) + ' sur ce téléphone</small>' + (det ? '<p>' + esc(det) + '</p>' : '') +
      (it.message && it.etat !== 'attente' ? '<p class="erreur">' + esc(it.message) + '</p>' : '') + (it.photo ? '<img class="vignette-locale" alt="Photo en attente d\'envoi" src="' + it.photo + '">' : '') + actions + '</div></li>';
  }
  function bandeauFile(id) {
    var l = pendants(id).filter(function (it) { return it.etat === 'attente'; });
    if (!l.length) return '';
    var bloque = pendants(id).some(function (it) { return it.etat !== 'attente'; });
    return '<div class="bandeau attente" role="status">' + ICO.horloge + '<div><strong>' + l.length + ' action' + (l.length > 1 ? 's' : '') + ' en attente d\'envoi</strong><span>' +
      (bloque ? 'Elles attendent la correction de l\'action refusée (voir ci-dessous), pour garder l\'ordre.' : enLigne() ? 'Envoi en cours… Si le serveur ne répond pas, nouvel essai automatique.' : 'Pas de réseau. Elles partiront toutes seules, dans l\'ordre, dès le retour du réseau.') + '</span></div>' +
      '<button type="button" class="btn sec petit" data-action="vider-file">Envoyer</button></div>';
  }
  function infosColis(d, avecClient, evs) {
    var l = [], liv = CP.premier(evs || [], 'livraison');
    if (avecClient !== false && d.client) l.push(['Client', d.client]);
    if (d.zone) l.push(['Quartier / zone', d.zone]);
    if (d.articles) l.push(['Articles', d.articles]);
    var h = '<dl class="infos">' + l.map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>'; }).join('') + '</dl>';
    if (CP.aEncaisserColis(d) && liv) {
      var ld = liv.donnees || {}, m = typeof ld.montant_encaisse === 'number' ? ld.montant_encaisse : +d.montant;
      h += '<p class="paye">' + ICO.ok + '<span>' + (avecClient === 'client' ? 'Payé à la livraison : ' : 'Encaissé : ') + montantTxt(m) + (CP.MODES[ld.mode_paiement || d.paiement] ? ' (' + esc(CP.MODES[ld.mode_paiement || d.paiement]) + ')' : '') + '</span></p>';
    } else if (CP.aEncaisserColis(d)) h += '<p class="a-encaisser"><span>' + (avecClient === 'client' ? 'À payer à la livraison' : 'À encaisser') + '</span><strong>' + montantTxt(d.montant) + '</strong><small>' + esc(CP.MODES[d.paiement] || '') + '</small></p>';
    else if (d.paiement === 'deja_paye') h += '<p class="paye">' + ICO.ok + 'Déjà payé : rien à encaisser.</p>';
    return h;
  }
  function blocVerification(id, evs) {
    var v = S.verif[id];
    var r = '';
    if (v) {
      if (v.ok) r = '<div class="verif ok" role="status">' + ICO.bouclier + '<div><strong>Historique intact</strong><span>Les ' + v.total + ' étapes sont bien enchaînées. Aucune n\'a été modifiée ni retirée depuis leur enregistrement.</span><small>' + v.liens + ' liens vérifiés, ' + v.contenus + ' empreintes recalculées sur ce téléphone.</small></div></div>';
      else r = '<div class="verif ko" role="alert">' + ICO.alerte + '<div><strong>L\'historique ne se vérifie pas entièrement</strong>' + v.erreurs.map(function (e) {
        var ev = evs[e.index];
        var nom = ev ? 'Étape ' + (e.index + 1) + ' (' + CP.libelleEvenement(ev) + ')' : 'Historique';
        return '<span>' + esc(nom) + ' : ' + (e.raison === 'lien' ? 'ne suit pas l\'étape précédente.' : e.raison === 'contenu' ? 'son contenu ne correspond pas à son empreinte.' : 'vide.') + '</span>';
      }).join('') + '</div></div>';
    }
    return '<button type="button" class="btn sec large" data-action="verifier" data-id="' + id + '">' + ICO.bouclier + 'Vérifier l\'historique</button>' + r;
  }
  function photoChamp(libelle) {
    return '<div class="champ-photo"><label class="btn sec large"><input type="file" accept="image/*" capture="environment" class="vh" data-photo>' + ICO.photo + '<span>' + esc(libelle || 'Prendre une photo') + '</span></label>' +
      '<div class="apercu" hidden><img alt="Aperçu de la photo"><button type="button" class="btn sec petit" data-action="photo-retirer">Retirer</button></div></div>';
  }
  function notice() { return '<p class="notice">' + ICO.bouclier + '<span>' + esc(NOTICE) + '</span></p>'; }

  // ---------- Accueil / tableau de bord ----------
  function vueAccueil() {
    var liv = S.liens.filter(function (l) { return l.role === 'livreur'; }), sui = S.liens.filter(function (l) { return l.role === 'destinataire'; });
    var h = '';
    if (!S.colis.length) h += accueilVide(liv.length || sui.length);
    else h += tableauDeBord();
    if (liv.length) h += listeLiens('Mes livraisons', liv, 'livreur');
    if (sui.length) h += listeLiens('Mes colis suivis', sui, 'suivi');
    afficher(h);
  }
  function accueilVide(aDesLiens) {
    return '<section class="hero"><img src="icons/icon-192.png" alt="" width="72" height="72"><h1>La preuve de livraison de vos colis</h1>' +
      '<p>Créez un colis en quelques secondes. Le livreur et le client suivent chaque étape sur un simple lien. La livraison est validée par un <strong>code à 4 chiffres</strong> que seul votre client connaît.</p>' +
      '<a class="btn plein large" href="#/nouveau">' + ICO.plus + 'Créer mon premier colis</a></section>' +
      '<section class="carte"><h2>Comment ça marche</h2><ol class="etapes-illus">' +
      '<li><span>1</span><div><strong>Vous créez le colis</strong>ColisPreuve donne un code secret. Vous l\'envoyez au client avec son lien de suivi.</div></li>' +
      '<li><span>2</span><div><strong>Le livreur note les étapes</strong>Prise en charge, en route, photos. Même sans réseau.</div></li>' +
      '<li><span>3</span><div><strong>Le client donne le code à la réception</strong>Le livreur le tape : la livraison est prouvée. Le client confirme en un geste.</div></li></ol>' +
      '<p class="petit">Gratuit : ' + CP.LIMITE_GRATUITE + ' colis par mois. <a href="#/pass">Pass illimité dès 3 000 F</a>.</p></section>' +
      (aDesLiens ? '' : '<section class="carte discret"><h2>Vous êtes livreur ou client ?</h2><p>Ouvrez simplement le lien reçu sur WhatsApp. Rien à installer.</p></section>') + notice();
  }
  function listeLiens(titre, liste, chemin) {
    liste = liste.slice().sort(function (a, b) { return (b.vuLe || 0) - (a.vuLe || 0); }).slice(0, 30);
    return '<section class="carte"><h2>' + esc(titre) + '</h2><ul class="liste">' + liste.map(function (l) {
      var d = l.dossier || {}, dn = d.donnees || {}, etat = CP.etatColis(evsAvecPendants(d.evenements, l.id));
      return '<li><a class="ligne-colis" href="#/' + chemin + '/' + l.id + '/' + l.jeton + '"><span class="lc-haut"><strong>' + esc(dn.ref ? 'Commande ' + dn.ref : d.titre || l.id) + '</strong>' + badge(etat) + '</span>' +
        '<span class="lc-bas">' + esc([dn.client, dn.zone].filter(Boolean).join(' · ')) + '</span></a></li>';
    }).join('') + '</ul></section>';
  }
  function tableauDeBord() {
    var st = CP.stats(S.colis, Date.now(), S.reglages.heures);
    var h = '<h1 class="vh">Mes colis</h1><section class="kpis" aria-label="Résumé">' +
      '<div class="kpi"><small>À encaisser</small><strong>' + montantTxt(st.aEncaisser) + '</strong><span>' + st.nbAEncaisser + ' colis</span></div>' +
      '<div class="kpi vert"><small>Encaissé</small><strong>' + montantTxt(st.encaisse) + '</strong><span>' + st.nbEncaisse + ' livré' + (st.nbEncaisse > 1 ? 's' : '') + ' avec paiement</span></div>' +
      '<div class="kpi"><small>En cours</small><strong>' + st.enCours + '</strong><span>colis</span></div>' +
      '<div class="kpi"><small>Livrés ce mois</small><strong>' + st.livresMois + '</strong><span>colis</span></div></section>';
    if (st.alertes.length) {
      h += '<section class="carte alertes" aria-label="À surveiller"><h2>' + ICO.alerte + st.alertes.length + ' colis à surveiller</h2><ul>' + st.alertes.slice(0, 8).map(function (a) {
        var c = colisPar(a.id);
        var txt = a.type === 'probleme' ? 'Problème signalé' + (a.raison ? ' : ' + a.raison : '') : a.type === 'non_confirme' ? 'Livré ' + CP.depuis(a.depuis) + ', réception pas encore confirmée' : 'Créé ' + CP.depuis(a.depuis) + ', toujours pas livré';
        return '<li class="al-' + a.type + '"><a href="#/colis/' + a.id + '"><strong>' + esc('Commande ' + (c.ref || '')) + ' · ' + esc(c.client || '') + '</strong><span>' + esc(txt) + '</span></a></li>';
      }).join('') + '</ul><p class="petit">Alerte après ' + S.reglages.heures + ' h sans confirmation. <a href="#/reglages">Changer</a></p></section>';
    }
    if (!premium()) {
      var n = creesCeMois(), pct = Math.min(100, Math.round(n / CP.LIMITE_GRATUITE * 100));
      h += '<section class="carte quota"><div><strong>' + n + ' / ' + CP.LIMITE_GRATUITE + ' colis gratuits ce mois</strong><div class="jauge" role="progressbar" aria-valuemin="0" aria-valuemax="' + CP.LIMITE_GRATUITE + '" aria-valuenow="' + n + '" aria-label="Colis gratuits utilisés"><span style="width:' + pct + '%"></span></div></div><a class="btn ' + (n >= CP.LIMITE_GRATUITE ? 'plein' : 'sec') + ' petit" href="#/pass">' + ICO.etoile + 'Pass illimité</a></section>';
    }
    h += '<section class="carte"><div class="titre-rang"><h2>Mes colis</h2><button type="button" class="btn sec petit" data-action="actualiser">' + ICO.actualiser + 'Actualiser</button></div>' + filtres(st) + '<div id="liste-colis">' + listeColis() + '</div>' +
      '<div class="rang fin"><button type="button" class="btn sec petit" data-action="csv">' + ICO.telecharger + 'Exporter (CSV)' + (premium() ? '' : ' · Pass') + '</button></div></section>';
    h += graphique(st.parJour);
    return h;
  }
  function graphique(jours) {
    var max = 1;
    jours.forEach(function (j) { max = Math.max(max, j.crees, j.livres); });
    var sel = S.jourChoisi != null ? S.jourChoisi : jours.length - 1;
    var j0 = jours[sel];
    return '<section class="carte"><div class="titre-rang"><h2>7 derniers jours</h2><span class="legende"><i class="s1"></i>Créés <i class="s2"></i>Livrés</span></div>' +
      '<div class="graph" role="group" aria-label="Colis créés et livrés par jour">' + jours.map(function (j, i) {
        return '<button type="button" class="jour' + (i === sel ? ' choisi' : '') + '" data-action="jour" data-i="' + i + '" aria-label="' + esc(j.libelle + ' : ' + j.crees + ' créés, ' + j.livres + ' livrés') + '" aria-pressed="' + (i === sel) + '">' +
          '<span class="barres"><span class="b s1" style="height:' + (j.crees / max * 100) + '%"></span><span class="b s2" style="height:' + (j.livres / max * 100) + '%"></span></span><span class="jl">' + esc(j.libelle) + '</span></button>';
      }).join('') + '</div><p class="graph-info" aria-live="polite"><strong>' + esc(j0.libelle) + '</strong> : ' + j0.crees + ' créé' + (j0.crees > 1 ? 's' : '') + ', ' + j0.livres + ' livré' + (j0.livres > 1 ? 's' : '') + '</p>' +
      '<table class="vh"><caption>Colis par jour</caption><tr><th>Jour</th><th>Créés</th><th>Livrés</th></tr>' + jours.map(function (j) { return '<tr><td>' + esc(j.libelle) + '</td><td>' + j.crees + '</td><td>' + j.livres + '</td></tr>'; }).join('') + '</table></section>';
  }
  function filtres(st) {
    var f = S.filtre;
    var puces = [['tous', 'Tous', st.total], ['en_cours', 'En cours', st.enCours]];
    CP.ORDRE_ETATS.forEach(function (k) { if (st.parEtat[k]) puces.push([k, CP.ETATS[k].libelle, st.parEtat[k]]); });
    return '<div class="filtres"><div class="rang-champs"><label class="vh" for="f-texte">Chercher un colis</label><input id="f-texte" type="search" placeholder="Chercher un colis" value="' + esc(f.texte) + '" autocomplete="off">' +
      '<label class="vh" for="f-periode">Période</label><select id="f-periode"><option value="tout"' + (f.periode === 'tout' ? ' selected' : '') + '>Tout</option><option value="jour"' + (f.periode === 'jour' ? ' selected' : '') + '>Aujourd\'hui</option><option value="7j"' + (f.periode === '7j' ? ' selected' : '') + '>7 jours</option><option value="30j"' + (f.periode === '30j' ? ' selected' : '') + '>30 jours</option></select></div>' +
      '<div class="puces" role="group" aria-label="Filtrer par statut">' + puces.map(function (p) {
        return '<button type="button" class="puce-f' + (f.etat === p[0] ? ' actif' : '') + '" data-action="filtre-etat" data-etat="' + p[0] + '" aria-pressed="' + (f.etat === p[0]) + '">' + esc(p[1]) + ' <b>' + p[2] + '</b></button>';
      }).join('') + '</div></div>';
  }
  function listeFiltree() {
    return CP.filtrer(S.colis, S.filtre).sort(function (a, b) { return Date.parse(b.creeLe) - Date.parse(a.creeLe); });
  }
  function listeColis() {
    var l = listeFiltree();
    if (!l.length) return '<p class="vide">Aucun colis ne correspond.</p>';
    return '<ul class="liste">' + l.slice(0, 200).map(function (c) {
      var evs = evsAvecPendants(c.evenements, c.id), etat = CP.etatColis(evs), n = pendants(c.id).length;
      var der = (c.evenements || []).length ? c.evenements[c.evenements.length - 1].le : c.creeLe;
      return '<li><a class="ligne-colis" href="#/colis/' + c.id + '"><span class="lc-haut"><strong>' + esc('Commande ' + c.ref) + '</strong>' + badge(etat) + '</span>' +
        '<span class="lc-bas">' + esc([c.client, c.zone].filter(Boolean).join(' · ')) + (CP.aEncaisserColis(c) ? ' · ' + montantTxt(c.montant) : '') + '</span>' +
        '<span class="lc-temps">' + esc(CP.depuis(der)) + (n ? ' · <span class="puce attente">' + n + ' en attente</span>' : '') + (c.introuvable ? ' · introuvable' : '') + '</span></a></li>';
    }).join('') + '</ul>';
  }
  function rendreListe() { var el = $('#liste-colis'); if (el) el.innerHTML = listeColis(); }

  // ---------- Nouveau colis ----------
  function vueNouveau() {
    if (!premium() && creesCeMois() >= CP.LIMITE_GRATUITE) {
      afficher('<section class="carte offre"><h1>Vos ' + CP.LIMITE_GRATUITE + ' colis gratuits du mois sont utilisés</h1><p>Avec le Pass ColisPreuve, créez autant de colis que vous voulez, avec des preuves PDF sans mention « version gratuite » et l\'export de votre tableau de bord.</p><a class="btn plein large" href="#/pass">' + ICO.etoile + 'Voir le Pass (dès 3 000 F)</a><p class="petit">Le compteur repart à zéro le 1er du mois prochain.</p></section>');
      return;
    }
    var zones = {}, ref = String(S.reglages.prochain || 1);
    S.colis.forEach(function (c) { if (c.zone) zones[c.zone] = 1; });
    while (ref.length < 4) ref = '0' + ref;
    afficher('<form class="carte formulaire" data-form="nouveau" novalidate><h1>Nouveau colis</h1>' +
      '<div class="champ"><label for="n-ref">Référence de la commande</label><input id="n-ref" name="ref" value="' + esc(ref) + '" maxlength="30" autocomplete="off" required></div>' +
      '<div class="champ"><label for="n-client">Prénom ou surnom du client</label><input id="n-client" name="client" maxlength="40" autocomplete="off" autocapitalize="words" required placeholder="Ex. : Fatou, Tata Awa…"></div>' +
      '<div class="champ"><label for="n-zone">Quartier ou zone</label><input id="n-zone" name="zone" maxlength="60" list="zones" autocomplete="off" required placeholder="Ex. : Liberté 6, Parcelles U17…"><datalist id="zones">' + Object.keys(zones).map(function (z) { return '<option value="' + esc(z) + '">'; }).join('') + '</datalist></div>' +
      '<p class="astuce">' + ICO.bouclier + '<span>Ni adresse exacte ni numéro de téléphone ici : les liens peuvent être transférés. Pour protéger votre client, donnez-les au livreur directement, par appel ou WhatsApp.</span></p>' +
      '<div class="champ"><label for="n-articles">Articles <small>(facultatif)</small></label><textarea id="n-articles" name="articles" rows="2" maxlength="300" placeholder="Ex. : 2 robes wax taille M, 1 sac"></textarea></div>' +
      '<fieldset class="champ"><legend>Comment le client paie ?</legend><div class="choix">' +
      [['especes', 'Espèces'], ['wave', 'Wave'], ['orange_money', 'Orange Money'], ['deja_paye', 'Déjà payé']].map(function (p, i) {
        return '<label class="choix-item"><input type="radio" name="paiement" value="' + p[0] + '"' + (i === 0 ? ' checked' : '') + '><span>' + esc(p[1]) + '</span></label>';
      }).join('') + '</div></fieldset>' +
      '<div class="champ" id="bloc-montant"><label for="n-montant">Montant à encaisser à la livraison <small>(F CFA, facultatif)</small></label><input id="n-montant" name="montant" inputmode="numeric" maxlength="12" autocomplete="off" placeholder="Ex. : 15 000"></div>' +
      '<details class="champ"><summary>Le colis est déjà prêt ? Ajoutez sa photo</summary>' + photoChamp('Photo du colis prêt') + '</details>' +
      '<p class="msg" role="status" aria-live="polite"></p><button type="submit" class="btn plein large">' + ICO.colis + 'Créer le colis</button>' +
      (premium() ? '' : '<p class="petit centre">' + creesCeMois() + ' / ' + CP.LIMITE_GRATUITE + ' colis gratuits utilisés ce mois.</p>') + '</form>');
    feuilleEtat = null;
    S.photoNouveau = null;
  }
  function soumettreNouveau(form) {
    var msg = $('.msg', form);
    function dire(t) { msg.textContent = t; msg.classList.add('erreur'); }
    var v = function (n) { return String((form.elements[n] && form.elements[n].value) || '').trim(); };
    var ref = v('ref'), client = v('client'), zone = v('zone'), articles = v('articles'), paiement = (form.querySelector('input[name=paiement]:checked') || {}).value || 'especes';
    var montant = CP.lireMontant(v('montant'));
    if (!ref) return dire('Donnez une référence à la commande.'), $('#n-ref').focus();
    if (!client) return dire('Indiquez le prénom ou le surnom du client.'), $('#n-client').focus();
    if (!zone) return dire('Indiquez le quartier ou la zone de livraison.'), $('#n-zone').focus();
    if ([client, zone, articles].some(CP.contientTelephone)) return dire('Retirez le numéro de téléphone : il ne doit pas être dans ColisPreuve. Donnez-le au livreur directement.');
    if (isNaN(montant)) return dire('Montant invalide : chiffres seulement, par exemple 15000.'), $('#n-montant').focus();
    if (paiement === 'deja_paye') montant = 0;
    if (!premium() && creesCeMois() >= CP.LIMITE_GRATUITE) { location.hash = '#/nouveau'; return rendre(); }
    if (!enLigne()) return dire('Pas de réseau : la création d\'un colis demande Internet quelques secondes. Réessayez dès que le réseau revient.');
    var code = CP.genererCode();
    var donnees = { ref: ref, client: client, zone: zone, articles: articles, montant: montant, paiement: paiement };
    if (S.reglages.boutique) donnees.boutique = S.reglages.boutique;
    var corps = { app: 'colis', titre: ('Commande ' + ref + ' – ' + client).slice(0, 140), donnees: donnees, code_remise: code };
    if (S.pass && S.pass.o) corps.pass = { o: S.pass.o, t: S.pass.t };
    var bouton = $('button[type=submit]', form);
    bouton.disabled = true; msg.classList.remove('erreur'); msg.textContent = 'Création du colis…';
    R.creer(corps).then(function (r) {
      if (r.status === 429) { bouton.disabled = false; return dire((r.json.message || 'Limite atteinte aujourd\'hui.') + (premium() ? '' : ' Le Pass permet d\'en créer bien plus.')); }
      if (!r.ok || !r.json.id) { bouton.disabled = false; return dire(r.json.message || 'Le serveur n\'a pas pu créer le colis. Réessayez dans un instant.'); }
      var now = new Date().toISOString();
      var c = { id: r.json.id, jetons: r.json.jetons, code: code, ref: ref, client: client, zone: zone, articles: articles, montant: montant, paiement: paiement, boutique: donnees.boutique || '',
        titre: corps.titre, creeLe: now, premium: !!r.json.premium, statut: 'ouvert', majLe: Date.now(),
        evenements: [{ type: 'creation', auteur: 'proprio', le: now, donnees: donnees, empreinte: r.json.empreinte }] };
      S.colis.push(c);
      var mois = CP.cleMois(Date.now());
      S.creations[mois] = (S.creations[mois] || 0) + 1;
      var num = parseInt(ref, 10);
      S.reglages.prochain = isFinite(num) && String(num) === ref.replace(/^0+(?=\d)/, '') ? num + 1 : (S.reglages.prochain || 1) + 1;
      if (S.pass && !r.json.premium) verifierPassRoutine(true);
      var suite = [sauverColis(c), sauverKv('creations', S.creations), sauverKv('reglages', S.reglages)];
      if (S.photoNouveau) suite.push(R.ajouter({ dossier: c.id, jeton: c.jetons.proprio, role: 'proprio', type: 'preparation', donnees: {}, photo: S.photoNouveau, legende: 'Photo du colis préparé' }).then(function () { return R.liste().then(function (l) { S.file = l; }); }));
      S.photoNouveau = null;
      return Promise.all(suite).then(function () {
        R.vider().catch(function () {});
        rafraichirColis(c).catch(function () {});
        location.hash = '#/colis/' + c.id + '/partager';
      });
    }).catch(function () { bouton.disabled = false; dire('Pas de réseau : le colis n\'a pas été créé. Réessayez dès que le réseau revient.'); });
  }

  // ---------- Partage (code + liens) ----------
  function vuePartager(id) {
    var c = colisPar(id);
    if (!c) return afficher(introuvableIci());
    var b = base(), j = c.jetons || {};
    var h = '<section class="carte succes"><h1>' + ICO.ok + 'Colis ' + esc(c.ref) + ' créé</h1><p>Envoyez maintenant le lien et le code au client, puis le lien au livreur.</p></section>';
    if (c.code) {
      h += '<section class="carte code-carte"><h2>Code de remise du client</h2><p class="code-grand" aria-label="Code ' + esc(c.code.split('').join(' ')) + '">' + c.code.split('').map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</p>' +
        '<p>Seul le client doit connaître ce code. Il le donne au livreur <strong>seulement quand il a le colis en main</strong>. Le livreur le tape : la livraison est prouvée.</p></section>';
    } else h += '<section class="carte"><p>Le code de remise a été créé sur un autre téléphone : il n\'est pas disponible ici.</p></section>';
    if (j.destinataire && c.code) {
      var mc = CP.messageClient(c, CP.lienRole(b, 'destinataire', c.id, j.destinataire));
      h += '<section class="carte envoi"><h2>' + ICO.client + '1. Au client : lien de suivi + code</h2><pre class="apercu-msg">' + esc(mc) + '</pre><div class="rang">' +
        '<a class="btn plein" id="wa-client" href="' + esc(wa(mc)) + '" target="_blank" rel="noopener">' + ICO.message + 'WhatsApp</a>' +
        '<button type="button" class="btn sec" data-action="partager" data-quoi="client">' + ICO.partager + 'Autre</button>' +
        '<button type="button" class="btn sec" data-action="copier" data-quoi="client">' + ICO.copier + 'Copier</button></div></section>';
    }
    if (j.livreur) {
      var ml = CP.messageLivreur(c, CP.lienRole(b, 'livreur', c.id, j.livreur));
      h += '<section class="carte envoi"><h2>' + ICO.route + '2. Au livreur : son lien (sans le code)</h2><pre class="apercu-msg">' + esc(ml) + '</pre><div class="rang">' +
        '<a class="btn plein" id="wa-livreur" href="' + esc(wa(ml)) + '" target="_blank" rel="noopener">' + ICO.message + 'WhatsApp</a>' +
        '<button type="button" class="btn sec" data-action="partager" data-quoi="livreur">' + ICO.partager + 'Autre</button>' +
        '<button type="button" class="btn sec" data-action="copier" data-quoi="livreur">' + ICO.copier + 'Copier</button></div></section>';
    }
    if (j.proprio) h += '<section class="carte"><h2>' + ICO.lien + 'Votre lien vendeur</h2><p class="petit">Gardez-le pour vous : il permet de retrouver ce colis sur un autre téléphone. Ne l\'envoyez à personne.</p><div class="rang"><button type="button" class="btn sec" data-action="copier" data-quoi="proprio">' + ICO.copier + 'Copier mon lien</button></div></section>';
    h += '<div class="rang centre"><a class="btn plein large" href="#/colis/' + c.id + '">Terminé : voir le colis</a></div>';
    afficher(h);
  }
  function texteAPartager(quoi) {
    var c = colisPar(V.args[0]); if (!c) return '';
    var b = base();
    if (quoi === 'client') return CP.messageClient(c, CP.lienRole(b, 'destinataire', c.id, c.jetons.destinataire));
    if (quoi === 'livreur') return CP.messageLivreur(c, CP.lienRole(b, 'livreur', c.id, c.jetons.livreur));
    return CP.lienRole(b, 'proprio', c.id, c.jetons.proprio);
  }
  function introuvableIci() { return '<section class="carte"><h1>Colis introuvable sur ce téléphone</h1><p>Ouvrez le lien vendeur de ce colis pour le retrouver ici.</p><a class="btn plein" href="#/">Retour à mes colis</a></section>'; }

  // ---------- Détail d'un colis (vendeur) ----------
  var ETAPES_VENDEUR = [
    { type: 'preparation', libelle: 'Colis préparé', ico: 'colis', photo: 'Photo du colis préparé', titre: 'Le colis est prêt' },
    { type: 'remise_livreur', libelle: 'Remis au livreur', ico: 'main', photo: 'Photo de la remise au livreur', titre: 'Remise au livreur' },
    { type: 'photo', libelle: 'Photo', ico: 'photo' },
    { type: 'note', libelle: 'Note', ico: 'note' }
  ];
  function vueColis(id) {
    var c = colisPar(id);
    if (!c) return afficher(introuvableIci());
    var evs = evsAvecPendants(c.evenements, c.id), etat = CP.etatColis(evs);
    var h = '<section class="carte entete-colis"><div class="titre-rang"><h1>Commande ' + esc(c.ref) + '</h1>' + badge(etat) + '</div>' +
      '<p class="phrase-etat">' + esc(CP.ETATS[etat].phrase) + '</p>' + infosColis(c, true, c.evenements) +
      '<p class="petit">Créé le ' + esc(CP.dateHeureFr(c.creeLe)) + ' · dossier <span class="nw">' + esc(c.id) + '</span></p>' +
      (c.introuvable ? '<p class="erreur">Ce dossier n\'existe plus sur le serveur (effacé après 180 jours sans activité).</p>' : '') + '</section>';
    h += bandeauFile(c.id);
    if (etat !== 'annule') {
      h += '<section class="carte"><h2>Étapes du vendeur</h2><div class="grille-actions">' + ETAPES_VENDEUR.map(function (e) {
        var fait = (e.type === 'preparation' || e.type === 'remise_livreur') && CP.premier(evs, e.type);
        return '<button type="button" class="action' + (fait ? ' fait' : '') + '" data-action="etape" data-type="' + e.type + '">' + (fait ? ICO.ok : ICO[e.ico]) + '<span>' + esc(e.libelle) + '</span>' + (fait ? '<small>Fait</small>' : '') + '</button>';
      }).join('') + '</div><div class="rang"><a class="btn sec" href="#/colis/' + c.id + '/partager">' + ICO.partager + 'Renvoyer le code et les liens</a></div></section>';
    }
    h += '<section class="carte"><h2>Suivi</h2>' + frise(c.evenements, { id: c.id, jeton: c.jetons && c.jetons.proprio, role: 'proprio' }) + '</section>';
    h += '<section class="carte"><h2>Preuve</h2><div class="rang"><button type="button" class="btn plein" data-action="pdf" data-id="' + c.id + '">' + ICO.pdf + 'Preuve PDF</button></div>' + blocVerification(c.id, c.evenements || []) + notice() + '</section>';
    h += '<div class="rang fin">' + (etat !== 'annule' && etat !== 'recu' ? '<button type="button" class="btn lien-danger" data-action="etape" data-type="annulation">' + ICO.annuler + 'Annuler le colis</button>' : '') +
      '<button type="button" class="btn lien-danger" data-action="retirer-colis" data-id="' + c.id + '">Retirer de ce téléphone</button></div>';
    afficher(h);
  }

  // ---------- Vue livreur ----------
  function vueLivreur(id, jeton) { vueRole('livreur', id, jeton); }
  function vueSuivi(id, jeton) { vueRole('destinataire', id, jeton); }
  function vueRole(role, id, jeton) {
    var l = lienPar(role, id) || (S.liensTemp && S.liensTemp[role + ':' + id]);
    if (!l || !l.dossier) {
      if (l && l.erreur === 'introuvable') return afficher('<section class="carte"><h1>Lien introuvable</h1><p>Ce lien n\'est pas valable ou le colis a été effacé. Demandez un nouveau lien au vendeur.</p></section>');
      afficher('<section class="carte chargement-carte" aria-busy="true"><h1>' + (role === 'livreur' ? 'Livraison' : 'Suivi de votre colis') + '</h1><p>' + (enLigne() ? 'Chargement du colis…' : 'Pas de réseau. Ouvrez ce lien quand le réseau revient (une seule fois suffit : ensuite il marche aussi sans réseau).') + '</p></section>');
      if (enLigne() && !V.chargementEnCours) {
        V.chargementEnCours = true;
        chargerRole(role, id, jeton).then(function () { V.chargementEnCours = false; if (V.args[0] === id) rendre(true); }, function () { V.chargementEnCours = false; if (V.args[0] === id) rendre(true); });
      }
      return;
    }
    var d = l.dossier;
    if (d.role && d.role !== role) { location.replace('#/' + { proprio: 'vendeur', livreur: 'livreur', destinataire: 'suivi' }[d.role] + '/' + id + '/' + jeton); return; }
    l.vuLe = Date.now();
    if (role === 'livreur') afficher(ecranLivreur(l)); else afficher(ecranClient(l));
  }
  function ecranLivreur(l) {
    var d = l.dossier, dn = d.donnees || {}, evs = evsAvecPendants(d.evenements, d.id), etat = CP.etatColis(evs);
    var aMoi = evs.some(function (e) { return e.auteur === 'livreur' && (e.type === 'prise_en_charge' || e.type === 'en_route'); });
    var h = '<section class="carte entete-colis"><p class="sur-titre">Livraison' + (dn.boutique ? ' · ' + esc(dn.boutique) : '') + '</p><div class="titre-rang"><h1>Commande ' + esc(dn.ref || '') + '</h1>' + badge(etat) + '</div>' + infosColis(dn, true, d.evenements) + '</section>';
    h += bandeauFile(d.id) + bandeauRefus(d.id);
    var principal = '', livEnAttente = enAttente(d.id, 'livraison');
    if (livEnAttente) principal = '<div class="bandeau attente" role="status">' + ICO.cle + '<div><strong>Livraison en attente d\'envoi</strong><span>Le code du client sera vérifié dès que le serveur sera joignable. Gardez la page ouverte ou revenez-y plus tard.</span></div></div>';
    else if (etat === 'annule') principal = '<div class="bandeau ko" role="alert">' + ICO.annuler + '<div><strong>Colis annulé par le vendeur</strong><span>Ne le livrez pas. Rapportez-le au vendeur.</span></div></div>';
    else if (etat === 'recu') principal = '<div class="bandeau ok">' + ICO.ok + '<div><strong>Livraison terminée</strong><span>Le client a confirmé la réception. Merci !</span></div></div>';
    else if (etat === 'livre') principal = '<div class="bandeau ok">' + ICO.ok + '<div><strong>Livré : code vérifié</strong><span>En attente de la confirmation du client.</span></div></div>';
    else if (etat === 'en_route' || etat === 'tentative') principal = '<button type="button" class="btn-geant" data-action="livrer">' + ICO.cle + '<span>Remettre le colis<small>Taper le code du client</small></span></button>' +
      '<button type="button" class="btn sec large" data-action="etape" data-type="tentative">' + ICO.horloge + 'Tentative ratée</button>';
    else if (etat === 'chez_livreur' && aMoi) principal = '<button type="button" class="btn-geant" data-action="etape-directe" data-type="en_route">' + ICO.route + '<span>Je pars livrer<small>Le client voit que vous êtes en route</small></span></button>';
    else principal = '<button type="button" class="btn-geant" data-action="etape" data-type="prise_en_charge">' + ICO.main + '<span>J\'ai pris le colis<small>Avec une photo si possible</small></span></button>';
    if (etat === 'probleme') principal = '<div class="bandeau ko" role="alert">' + ICO.alerte + '<div><strong>Le client a signalé un problème</strong><span>' + esc(CP.detailEvenement(CP.dernier(evs, 'probleme')) || '') + '</span></div></div>' + principal;
    h += '<section class="principal">' + principal + '</section>';
    if (etat !== 'recu' && etat !== 'annule') h += '<section class="carte"><h2>Toutes les étapes</h2><div class="grille-actions">' +
      '<button type="button" class="action" data-action="etape" data-type="prise_en_charge">' + ICO.main + '<span>J\'ai pris le colis</span></button>' +
      '<button type="button" class="action" data-action="etape-directe" data-type="en_route">' + ICO.route + '<span>En route</span></button>' +
      '<button type="button" class="action" data-action="etape" data-type="tentative">' + ICO.horloge + '<span>Tentative ratée</span></button>' +
      '<button type="button" class="action fort" data-action="livrer">' + ICO.cle + '<span>Remettre (code)</span></button>' +
      '<button type="button" class="action" data-action="etape" data-type="photo">' + ICO.photo + '<span>Photo</span></button>' +
      '<button type="button" class="action" data-action="etape" data-type="note">' + ICO.note + '<span>Note</span></button></div></section>';
    h += '<section class="carte"><h2>Suivi</h2>' + frise(d.evenements, { id: d.id, jeton: l.jeton, role: 'livreur' }) + '</section>';
    h += '<section class="carte discret"><p class="petit">Pas besoin d\'installer d\'application : gardez ce lien. Sans réseau, vos actions sont gardées et partent toutes seules au retour du réseau.</p>' + blocVerification(d.id, d.evenements || []) + notice() + '</section>';
    return h;
  }
  function bandeauRefus(id) {
    var l = pendants(id).filter(function (it) { return it.etat === 'code'; });
    if (!l.length) return '';
    return '<div class="bandeau ko" role="alert">' + ICO.alerte + '<div><strong>Code refusé</strong><span>' + esc(l[0].message || 'Code de remise incorrect.') + '</span></div><button type="button" class="btn plein petit" data-action="recoder" data-n="' + l[0].n + '">Ressaisir</button></div>';
  }
  var ETAPES_CLIENT = ['prepare', 'chez_livreur', 'en_route', 'livre', 'recu'];
  function ecranClient(l) {
    var d = l.dossier, dn = d.donnees || {}, evs = evsAvecPendants(d.evenements, d.id), etat = CP.etatColis(evs);
    var rang = { cree: -1, prepare: 0, chez_livreur: 1, en_route: 2, tentative: 2, livre: 3, recu: 4, probleme: -2, annule: -3 }[etat];
    if (etat === 'probleme') rang = CP.premier(evs, 'livraison') ? 3 : 2;
    var h = '<section class="carte hero-client"><p class="sur-titre">Votre colis' + (dn.boutique ? ' chez ' + esc(dn.boutique) : '') + '</p><h1>Commande ' + esc(dn.ref || '') + '</h1>' +
      '<p class="etat-grand e-' + etat + '">' + esc(CP.ETATS[etat].libelle) + '</p><p>' + esc(phraseClient(etat, evs)) + '</p>';
    if (etat !== 'annule') h += '<ol class="progression" aria-label="Avancement">' + ETAPES_CLIENT.map(function (k, i) {
      return '<li class="' + (i <= rang ? 'fait' : '') + (i === rang ? ' actuel' : '') + '"' + (i === rang ? ' aria-current="step"' : '') + '><span></span><small>' + esc(CP.ETATS[k].libelle) + '</small></li>';
    }).join('') + '</ol>';
    h += '</section>' + bandeauFile(d.id);
    if (etat !== 'recu' && etat !== 'annule' && etat !== 'livre') h += '<section class="carte rappel-code">' + ICO.cle + '<div><strong>À la remise, donnez votre code au livreur</strong><span>Le code à 4 chiffres est dans le message du vendeur. Ne le donnez jamais avant d\'avoir le colis en main.</span></div></section>';
    h += '<section class="carte">' + infosColis(dn, 'client', d.evenements) + '</section>';
    if (etat !== 'annule') {
      h += '<section class="principal">';
      if (etat === 'recu') h += '<div class="bandeau ok">' + ICO.ok + '<div><strong>Merci ! Réception confirmée</strong><span>Le ' + esc(CP.dateHeureFr((CP.premier(evs, 'reception') || {}).le)) + '.</span></div></div>';
      else if (enAttente(d.id, 'reception')) h += '<div class="bandeau attente" role="status">' + ICO.horloge + '<div><strong>Confirmation en attente d\'envoi</strong><span>Elle partira toute seule dès le retour du réseau.</span></div></div>';
      else h += '<button type="button" class="btn-geant" data-action="recu">' + ICO.ok + '<span>J\'ai bien reçu mon colis<small>Un seul geste</small></span></button>';
      h += '<button type="button" class="btn sec large" data-action="etape" data-type="probleme">' + ICO.probleme + 'Signaler un problème</button></section>';
    }
    h += '<section class="carte"><h2>Suivi</h2>' + frise(d.evenements, { id: d.id, jeton: l.jeton, role: 'destinataire' }) + '<p class="petit">La page se met à jour toute seule.</p></section>';
    h += '<section class="carte discret">' + blocVerification(d.id, d.evenements || []) + notice() +
      '<p class="petit">Vous vendez sur WhatsApp ou Instagram ? <a href="./">Créez vos colis avec ColisPreuve</a>, gratuit jusqu\'à ' + CP.LIMITE_GRATUITE + ' colis par mois.</p></section>';
    return h;
  }
  function phraseClient(etat, evs) {
    if (etat === 'tentative') { var t = CP.dernier(evs, 'tentative'); return 'Le livreur est passé mais n\'a pas pu vous remettre le colis' + (t && t.donnees && t.donnees.raison ? ' (' + t.donnees.raison.toLowerCase() + ')' : '') + '.'; }
    if (etat === 'en_route') return 'Le livreur est en route vers vous. Préparez votre code.';
    if (etat === 'livre') return 'Le livreur a validé la remise avec votre code. Confirmez la réception ci-dessous.';
    if (etat === 'probleme') return 'Vous avez signalé un problème. Le vendeur le voit dans son suivi.';
    return CP.ETATS[etat].phrase;
  }

  // ---------- Lien vendeur : importe le colis sur ce téléphone ----------
  function vueVendeur(id, jeton) {
    var c = colisPar(id);
    if (c) { if (!c.jetons) c.jetons = {}; c.jetons.proprio = jeton; location.replace('#/colis/' + id); return; }
    afficher('<section class="carte" aria-busy="true"><h1>Ajout du colis…</h1><p>' + (enLigne() ? 'Lecture du dossier.' : 'Pas de réseau : réessayez quand le réseau revient.') + '</p></section>');
    if (!enLigne()) return;
    R.lire(id, jeton).then(function (r) {
      if (!r.ok || !r.json.dossier) return afficher('<section class="carte"><h1>Lien introuvable</h1><p>Ce lien vendeur n\'est pas valable ou le colis a été effacé.</p><a class="btn plein" href="#/">Retour</a></section>');
      var d = r.json.dossier;
      if (d.role !== 'proprio') { location.replace('#/' + (d.role === 'livreur' ? 'livreur' : 'suivi') + '/' + id + '/' + jeton); return; }
      var dn = d.donnees || {};
      var c2 = { id: id, jetons: { proprio: jeton }, code: null, ref: dn.ref || d.titre, client: dn.client || '', zone: dn.zone || '', articles: dn.articles || '', montant: +dn.montant || 0,
        paiement: dn.paiement || 'deja_paye', boutique: dn.boutique || '', titre: d.titre, creeLe: d.cree_le || (d.evenements[0] && d.evenements[0].le) || new Date().toISOString(),
        statut: d.statut, evenements: d.evenements || [], majLe: Date.now(), importe: true };
      S.colis.push(c2);
      sauverColis(c2).then(function () { toast('Colis ajouté à ce téléphone ✓'); location.replace('#/colis/' + id); });
    }).catch(function () { afficher('<section class="carte"><h1>Pas de réseau</h1><p>Réessayez quand le réseau revient.</p></section>'); });
  }

  // ---------- Pass ----------
  function finPass() {
    var p = S.pass;
    if (!p || !p.payeeLe || !PASS[p.slug]) return null;
    return Date.parse(p.payeeLe) + PASS[p.slug].jours * JOUR;
  }
  function vuePass() {
    var h = '';
    if (premium()) {
      var fin = finPass();
      h += '<section class="carte statut-pass ok"><small>Pass ColisPreuve</small><strong>' + ICO.etoile + 'Actif</strong><span>' + (fin ? 'Valable jusqu\'au ' + esc(CP.dateFr(new Date(fin).toISOString())) + '.' : 'Vérifié le ' + esc(CP.dateFr(new Date(S.pass.verifieLe).toISOString())) + '.') + ' Commande ' + esc(S.pass.o) + '.</span></section>';
    } else if (S.pass) {
      h += '<section class="carte statut-pass ko"><small>Pass ColisPreuve</small><strong>Expiré ou non valable</strong><span>Commande ' + esc(S.pass.o) + '. Renouvelez le pass pour retrouver les colis illimités.</span></section>';
    }
    h += '<section class="carte offre"><h1>Pass ColisPreuve</h1><ul class="atouts">' +
      '<li>' + ICO.ok + 'Colis illimités (gratuit : ' + CP.LIMITE_GRATUITE + ' par mois)</li>' +
      '<li>' + ICO.ok + 'Preuves PDF sans la mention « version gratuite »</li>' +
      '<li>' + ICO.ok + 'Export du tableau de bord (CSV pour Excel)</li>' +
      '<li>' + ICO.ok + 'Les liens livreur et client restent gratuits et sans installation</li></ul>' +
      '<div class="offres"><a class="offre-carte" href="' + BOUTIQUE + 'pass-colispreuve-1-mois.html" target="_blank" rel="noopener"><small>1 mois</small><strong>' + montantTxt(3000) + '</strong><span>Payé une fois par Wave</span></a>' +
      '<a class="offre-carte meilleure" href="' + BOUTIQUE + 'pass-colispreuve-12-mois.html" target="_blank" rel="noopener"><small>12 mois</small><strong>' + montantTxt(30000) + '</strong><span>2 mois offerts</span></a></div></section>';
    h += (premium() ? '<details class="carte"><summary class="resume">Activer un autre pass (renouvellement)</summary>' : '') + '<form class="' + (premium() ? '' : 'carte') + '" data-form="pass"><h2>Activer mon pass</h2><ol class="etapes"><li>Achetez le pass dans la boutique et payez par Wave.</li><li>Sur la page de votre commande payée, copiez le lien de la page.</li><li>Collez-le ici puis touchez « Activer ».</li></ol>' +
      '<div class="champ"><label for="p-lien">Lien de votre commande</label><textarea id="p-lien" name="lien" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…/boutique/commande.html?o=TCV-…&amp;t=…"></textarea></div>' +
      '<p class="msg" role="status" aria-live="polite"></p><button type="submit" class="btn plein large">' + ICO.etoile + 'Activer</button>' +
      '<p class="petit">Le même lien active le pass sur vos autres téléphones.</p></form>' + (premium() ? '</details>' : '');
    afficher(h);
  }
  function soumettrePass(form) {
    var msg = $('.msg', form), btn = $('button[type=submit]', form);
    function dire(t, err) { msg.textContent = t; msg.classList.toggle('erreur', !!err); }
    var p = CP.lireLienCommande(form.elements.lien.value);
    if (!p) return dire('Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « TCV- »).', true);
    if (!enLigne()) return dire('Pas de réseau : la vérification demande Internet.', true);
    btn.disabled = true; dire('Vérification de votre commande…');
    R.pass(p).then(function (r) {
      btn.disabled = false;
      if (!r.ok) return dire(r.json.message || 'Vérification impossible pour le moment. Réessayez.', true);
      if (!r.json.valide) return dire('Ce lien ne correspond pas à un Pass ColisPreuve payé et en cours de validité. Si vous venez de payer, attendez la confirmation puis réessayez.', true);
      S.pass = { o: p.o, t: p.t, valide: true, activeLe: Date.now(), verifieLe: Date.now() };
      return infosPass().then(function () { return sauverKv('pass', S.pass); }).then(function () { toast('Pass activé ✓ Colis illimités.'); rendre(); window.scrollTo(0, 0); });
    }).catch(function () { btn.disabled = false; dire('Pas de réseau : réessayez dans un instant.', true); });
  }
  function infosPass() {
    return R.commande(S.pass.o, S.pass.t).then(function (j) {
      var c = j && j.commande;
      if (c && c.produit && PASS[c.produit.slug] && c.payee_le) { S.pass.slug = c.produit.slug; S.pass.payeeLe = c.payee_le; }
    });
  }
  function verifierPassRoutine(force) {
    if (!S.pass || !enLigne()) return;
    if (!force && Date.now() - (S.pass.verifieLe || 0) < JOUR) return;
    R.pass({ o: S.pass.o, t: S.pass.t }).then(function (r) {
      if (!r.ok) return;
      S.pass.valide = !!r.json.valide; S.pass.verifieLe = Date.now();
      return (S.pass.payeeLe ? Promise.resolve() : infosPass()).then(function () { return sauverKv('pass', S.pass); }).then(function () { if (V.nom === 'accueil' || V.nom === 'pass') rendre(true); });
    }).catch(function () {});
  }

  // ---------- Réglages ----------
  function vueReglages() {
    var R2 = S.reglages;
    var h = '<form class="carte" data-form="reglages"><h1>Réglages</h1>' +
      '<div class="champ"><label for="r-boutique">Nom de votre boutique <small>(facultatif)</small></label><input id="r-boutique" name="boutique" maxlength="50" value="' + esc(R2.boutique) + '" placeholder="Ex. : Awa Couture"><small class="aide">Le client et le livreur le voient sur leur page.</small></div>' +
      '<div class="champ"><label for="r-heures">Alerte si un colis n\'est pas confirmé après</label><select id="r-heures" name="heures">' + [6, 12, 24, 48, 72].map(function (n) { return '<option value="' + n + '"' + (+R2.heures === n ? ' selected' : '') + '>' + n + ' heures</option>'; }).join('') + '</select></div>' +
      '<p class="msg" role="status" aria-live="polite"></p><button type="submit" class="btn plein">Enregistrer</button></form>';
    h += '<section class="carte"><h2>Sauvegarde</h2><p class="petit">Vos colis et leurs liens secrets sont gardés sur ce téléphone seulement. Faites une sauvegarde pour ne rien perdre si vous changez de téléphone.</p><div class="rang">' +
      '<button type="button" class="btn sec" data-action="sauvegarder">' + ICO.telecharger + 'Exporter mes colis</button>' +
      '<label class="btn sec"><input type="file" accept="application/json,.json" class="vh" id="import-fichier">' + ICO.actualiser + 'Importer une sauvegarde</label></div></section>';
    h += '<section class="carte"><h2>Installer l\'application</h2>' + (estInstallee() ? '<p>' + ICO.ok + ' ColisPreuve est installée sur ce téléphone.</p>' : invite ? '<button type="button" class="btn plein" data-action="installer">' + ICO.installer + 'Installer ColisPreuve</button>' : instructionsInstall()) + '</section>';
    h += '<section class="carte"><h2>Confidentialité</h2><ul class="puces-texte"><li>Pas d\'adresse exacte, pas de numéro de téléphone, pas de pièce d\'identité.</li><li>Le code de remise n\'est jamais gardé en clair sur le serveur : seule son empreinte l\'est.</li><li>Les dossiers sont effacés du serveur 180 jours après la dernière activité.</li><li>Les liens sont secrets : ne les publiez pas.</li></ul></section>';
    h += '<section class="carte"><h2>À propos</h2><p>ColisPreuve, version ' + VERSION + '. Une application de Teranga Outils.</p>' + notice() +
      '<p class="petit">Bibliothèque libre incluse : jsPDF (licence MIT). <a href="vendor/LISEZMOI.txt">Détails</a>.</p></section>';
    afficher(h);
  }
  function estInstallee() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function instructionsInstall() {
    if (estIOS()) return '<ol class="etapes"><li>Ouvrez cette page dans <strong>Safari</strong>.</li><li>Touchez le bouton <strong>Partager</strong> (carré avec une flèche vers le haut).</li><li>Choisissez <strong>« Sur l\'écran d\'accueil »</strong>, puis « Ajouter ».</li></ol>';
    return '<ol class="etapes"><li>Ouvrez le menu du navigateur (les 3 points en haut à droite).</li><li>Choisissez <strong>« Installer l\'application »</strong> ou <strong>« Ajouter à l\'écran d\'accueil »</strong>.</li></ol>';
  }
  function installation() {
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; majInstall(); });
    window.addEventListener('appinstalled', function () { invite = null; majInstall(); toast('ColisPreuve est installée ✓'); });
    majInstall();
  }
  function majInstall() { $('#installer').hidden = estInstallee() || document.body.classList.contains('vue-role') || !(invite || estIOS()); }

  function enregistrerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      function attente(w) { swAttente = w; toast('Nouvelle version de ColisPreuve prête.', 12000, { libelle: 'Mettre à jour', faire: function () { w.postMessage('maj'); } }); }
      if (reg.waiting && navigator.serviceWorker.controller) attente(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        if (w) w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) attente(w); });
      });
    }).catch(function () {});
    var recharge = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (swAttente && !recharge) { recharge = true; location.reload(); } });
  }

  // ---------- Feuilles d'étapes ----------
  var CONF = {
    preparation: { titre: 'Le colis est prêt', photo: 'Photo du colis préparé', legende: 'Photo du colis préparé', bouton: 'Valider : colis préparé', ok: 'Colis préparé ✓' },
    remise_livreur: { titre: 'Remise au livreur', photo: 'Photo de la remise (facultatif)', legende: 'Photo de la remise au livreur', bouton: 'Valider : remis au livreur', ok: 'Remise au livreur notée ✓' },
    prise_en_charge: { titre: 'J\'ai pris le colis', photo: 'Photo du colis (conseillé)', legende: 'Photo à la prise en charge', bouton: 'Valider la prise en charge', ok: 'Prise en charge notée ✓' },
    tentative: { titre: 'Tentative ratée', raisons: CP.RAISONS_TENTATIVE, commentaire: 'Précision (facultatif)', photo: 'Photo (facultatif)', legende: 'Photo de la tentative', bouton: 'Noter la tentative', ok: 'Tentative notée' },
    probleme: { titre: 'Signaler un problème', raisons: CP.RAISONS_PROBLEME, commentaire: 'Expliquez en quelques mots', photo: 'Photo du problème (facultatif)', legende: 'Photo du problème', bouton: 'Envoyer le signalement', ok: 'Problème signalé. Le vendeur le verra.' },
    annulation: { titre: 'Annuler le colis', raisons: ['Le client a annulé', 'Article indisponible', 'Erreur de commande', 'Autre raison'], commentaire: 'Précision (facultatif)', bouton: 'Confirmer l\'annulation', ok: 'Colis annulé', danger: true },
    note: { titre: 'Ajouter une note', commentaire: 'Votre note', requis: true, bouton: 'Ajouter la note', ok: 'Note ajoutée ✓' },
    photo: { titre: 'Ajouter une photo', photo: 'Prendre la photo', photoRequise: true, legendeLibre: true, bouton: 'Envoyer la photo', ok: 'Photo ajoutée ✓' },
    en_route: { ok: 'En route ✓ Le client est prévenu sur sa page.' },
    reception: { ok: 'Merci ! Réception confirmée ✓' }
  };
  function contexteVue() {
    if (V.nom === 'colis') { var c = colisPar(V.args[0]); return c ? { id: c.id, jeton: c.jetons.proprio, role: 'proprio' } : null; }
    if (V.nom === 'livreur') return { id: V.args[0], jeton: V.args[1], role: 'livreur' };
    if (V.nom === 'suivi') return { id: V.args[0], jeton: V.args[1], role: 'destinataire' };
    return null;
  }
  function feuilleEtape(type) {
    var cf = CONF[type], ctx = contexteVue();
    if (!cf || !ctx) return;
    var h = '<form data-form="etape" data-type="' + type + '"><h2>' + esc(cf.titre) + '</h2>';
    if (type === 'annulation') h += '<p>Le livreur et le client verront que le colis est annulé.</p>';
    if (cf.raisons) h += '<fieldset class="champ"><legend>Raison</legend><div class="choix">' + cf.raisons.map(function (r, i) { return '<label class="choix-item"><input type="radio" name="raison" value="' + esc(r) + '"' + (i === 0 ? ' checked' : '') + '><span>' + esc(r) + '</span></label>'; }).join('') + '</div></fieldset>';
    if (cf.commentaire) h += '<div class="champ"><label for="e-com">' + esc(cf.commentaire) + '</label><textarea id="e-com" name="commentaire" rows="2" maxlength="300"></textarea></div>';
    if (cf.photo) h += photoChamp(cf.photo);
    if (cf.legendeLibre) h += '<div class="champ"><label for="e-leg">Légende <small>(facultatif)</small></label><input id="e-leg" name="legende" maxlength="120" placeholder="Ex. : colis fermé avec scotch"></div>';
    h += '<p class="msg" role="status" aria-live="polite"></p><button type="submit" class="btn ' + (cf.danger ? 'danger' : 'plein') + ' large">' + esc(cf.bouton) + '</button></form>';
    ouvrirFeuille(h, { type: type, ctx: ctx, photo: null });
  }
  function soumettreEtape(form) {
    var type = form.getAttribute('data-type'), cf = CONF[type], st = feuilleEtat || {}, ctx = st.ctx;
    if (!ctx) return;
    var raison = (form.querySelector('input[name=raison]:checked') || {}).value || '';
    var com = form.elements.commentaire ? form.elements.commentaire.value.trim() : '';
    if (cf.requis && !com) return msgFeuille('Écrivez votre note.', true);
    if (cf.photoRequise && !st.photo) return msgFeuille('Prenez d\'abord la photo.', true);
    if (st.photoEnCours) return msgFeuille('Un instant : la photo se prépare…');
    if (com && CP.contientTelephone(com)) return msgFeuille('Pas de numéro de téléphone ici, s\'il vous plaît.', true);
    var donnees = {};
    if (raison) donnees.raison = raison;
    if (com) donnees.commentaire = com;
    var item = { dossier: ctx.id, jeton: ctx.jeton, role: ctx.role, type: type, donnees: donnees };
    if (st.photo) { item.photo = st.photo; item.legende = type === 'photo' ? (form.elements.legende.value.trim() || 'Photo') : cf.legende; }
    $('button[type=submit]', form).disabled = true; msgFeuille('Envoi…');
    executer(item).then(function (res) { fermerFeuille(); apresAction(res, ctx, cf.ok); });
  }
  function etapeDirecte(type) {
    var ctx = contexteVue(); if (!ctx) return;
    executer({ dossier: ctx.id, jeton: ctx.jeton, role: ctx.role, type: type, donnees: {} }).then(function (res) { apresAction(res, ctx, (CONF[type] || {}).ok); });
  }

  // ---------- Livraison : code du client ----------
  function feuilleLivrer(nCorrection) {
    var ctx = contexteVue(); if (!ctx) return;
    var l = lienPar('livreur', ctx.id), dn = (l && l.dossier && l.dossier.donnees) || {};
    var it = nCorrection ? S.file.filter(function (x) { return x.n === nCorrection; })[0] : null;
    var h = '<form data-form="livrer"><h2>Remise au client</h2>';
    if (!nCorrection) {
      h += '<ol class="etapes-livrer"><li>' + (CP.aEncaisserColis(dn) ? 'Encaissez et prenez une photo du colis remis.' : 'Prenez une photo du colis remis (conseillé).') + '</li><li>Demandez au client son <strong>code à 4 chiffres</strong> et tapez-le.</li></ol>';
      if (CP.aEncaisserColis(dn)) h += '<div class="encaisse-rang"><div class="champ"><label for="l-montant">Montant encaissé (F)</label><input id="l-montant" name="montant" inputmode="numeric" value="' + esc(dn.montant) + '" maxlength="12"></div>' +
        '<div class="champ"><label for="l-mode">Payé en</label><select id="l-mode" name="mode">' + Object.keys(CP.MODES).map(function (k) { return '<option value="' + k + '"' + (dn.paiement === k ? ' selected' : '') + '>' + esc(CP.MODES[k]) + '</option>'; }).join('') + '</select></div></div>';
      h += photoChamp('Photo à la remise').replace('class="champ-photo"', 'class="champ-photo compact"');
    } else h += '<p>Le code envoyé a été refusé. Redemandez au client son <strong>code à 4 chiffres</strong> et tapez-le.</p>';
    h += '<div class="champ code-champ"><label for="code-saisie">Code du client</label><input id="code-saisie" name="code" inputmode="none" autocomplete="off" maxlength="4" pattern="[0-9]{4}" class="code-saisie"></div>' +
      '<div class="pave" role="group" aria-label="Clavier du code">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button type="button" data-action="touche" data-v="' + n + '">' + n + '</button>'; }).join('') +
      '<button type="button" data-action="touche" data-v="efface" aria-label="Effacer un chiffre">' + ICO.retour + '</button><button type="button" data-action="touche" data-v="0">0</button><button type="button" data-action="touche" data-v="vide" aria-label="Tout effacer">' + ICO.fermer + '</button></div>';
    h += '<p class="msg" role="status" aria-live="polite"></p><button type="submit" class="btn plein large" id="btn-livrer" disabled>' + ICO.cle + 'Valider la livraison</button></form>';
    ouvrirFeuille(h, { type: 'livraison', ctx: ctx, photo: null, correction: it ? it.n : null });
  }
  function touche(v) {
    var c = $('#code-saisie'); if (!c) return;
    if (v === 'efface') c.value = c.value.slice(0, -1);
    else if (v === 'vide') c.value = '';
    else if (c.value.length < 4) c.value += v;
    majCode();
  }
  function majCode() {
    var c = $('#code-saisie'); if (!c) return;
    c.value = c.value.replace(/\D/g, '').slice(0, 4);
    $('#btn-livrer').disabled = c.value.length !== 4;
    msgFeuille('');
  }
  function soumettreLivrer(form) {
    var st = feuilleEtat || {}, ctx = st.ctx, code = form.elements.code.value.replace(/\D/g, '');
    if (!ctx) return;
    if (code.length !== 4) return msgFeuille('Le code a 4 chiffres.', true);
    if (st.photoEnCours) return msgFeuille('Un instant : la photo se prépare…');
    var btn = $('#btn-livrer'); btn.disabled = true; msgFeuille('Vérification du code…');
    var p;
    if (st.correction) p = R.corriger(st.correction, { code_remise: code }).then(function (it) { if (!it) return { etat: 'envoye' }; return R.vider().catch(function () {}).then(function () { return DB.lire('file', it.n); }).then(function (reste) { return R.liste().then(function (l) { S.file = l; majReseau(); return reste ? { etat: reste.etat, message: reste.message, n: reste.n } : { etat: 'envoye' }; }); }); });
    else {
      var donnees = {};
      if (form.elements.montant) {
        var m = CP.lireMontant(form.elements.montant.value);
        if (isNaN(m)) { btn.disabled = false; return msgFeuille('Montant invalide.', true); }
        donnees.montant_encaisse = m;
        if (form.elements.mode && form.elements.mode.value) donnees.mode_paiement = form.elements.mode.value;
      }
      var item = { dossier: ctx.id, jeton: ctx.jeton, role: 'livreur', type: 'livraison', donnees: donnees, code_remise: code };
      if (st.photo) { item.photo = st.photo; item.legende = 'Photo à la remise'; }
      p = executer(item);
    }
    p.then(function (res) {
      if (res.etat === 'code' && !st.correction) {
        // en direct : on retire l'essai refusé et on laisse ressaisir tout de suite
        return R.retirer(res.n).then(function () { return R.liste(); }).then(function (l) {
          S.file = l; majReseau();
          var c = $('#code-saisie'); if (c) { c.value = ''; c.focus(); }
          form.classList.remove('secoue'); void form.offsetWidth; form.classList.add('secoue');
          msgFeuille('Code incorrect. Redemandez au client son code à 4 chiffres (reçu du vendeur).', true);
          btn.disabled = true;
        });
      }
      if (res.etat === 'code') { msgFeuille('Code toujours incorrect. Redemandez-le au client.', true); var c2 = $('#code-saisie'); if (c2) c2.value = ''; return; }
      fermerFeuille();
      if (res.etat === 'envoye') { toast('Livraison validée ✓ Code du client vérifié.'); return rafraichirDossier(ctx.id, 'livreur', ctx.jeton).catch(function () {}).then(function () { rendre(true); }); }
      if (res.etat === 'attente' && pendants(ctx.id).some(function (it) { return it.etat !== 'attente'; })) { toast('Action gardée : elle partira après la correction de l\'action refusée.', 6000); rendre(true); return; }
    if (res.etat === 'attente') { toast(enLigne() ? 'Le serveur ne répond pas pour le moment : livraison gardée sur le téléphone. Le code sera vérifié dès qu\'il répond.' : 'Pas de réseau : livraison gardée sur le téléphone. Le code sera vérifié dès le retour du réseau.', 8000); return rendre(true); }
      toast(res.message || 'Livraison refusée.', 6000); rendre(true);
    });
  }

  // ---------- Réception (client) ----------
  function confirmerReception() {
    var ctx = contexteVue(); if (!ctx) return;
    var l = lienPar('destinataire', ctx.id), evs = evsAvecPendants(l && l.dossier && l.dossier.evenements, ctx.id), etat = CP.etatColis(evs);
    if (etat !== 'livre' && etat !== 'probleme') {
      ouvrirFeuille('<h2>Vous avez le colis en main ?</h2><p>Le livreur n\'a pas encore validé la remise avec votre code. Confirmez seulement si vous avez bien reçu votre colis.</p><div class="rang"><button type="button" class="btn plein large" data-action="recu-confirme">Oui, je l\'ai reçu</button><button type="button" class="btn sec large" data-action="fermer-feuille">Pas encore</button></div>', { ctx: ctx });
      return;
    }
    envoyerReception(ctx);
  }
  function envoyerReception(ctx) {
    fermerFeuille();
    executer({ dossier: ctx.id, jeton: ctx.jeton, role: 'destinataire', type: 'reception', donnees: {} }).then(function (res) { apresAction(res, ctx, CONF.reception.ok); });
  }

  // ---------- Vérification, PDF ----------
  function evenementsDe(id) {
    var c = colisPar(id);
    if (c && (V.nom === 'colis')) return c.evenements || [];
    var l = lienPar(V.nom === 'livreur' ? 'livreur' : 'destinataire', id);
    return (l && l.dossier && l.dossier.evenements) || [];
  }
  function verifier(id) {
    var evs = evenementsDe(id);
    if (!window.crypto || !crypto.subtle) { toast('Ce navigateur ne peut pas faire la vérification.'); return; }
    CP.verifierChaine(id, evs).then(function (v) { S.verif[id] = v; rendre(true); var el = $('.verif'); if (el) el.scrollIntoView({ block: 'nearest' }); });
  }
  function genererPdf(id) {
    var c = colisPar(id); if (!c) return;
    ouvrirFeuille('<h2>Preuve PDF</h2><p class="msg" role="status" aria-live="polite">Préparation de la preuve…</p><div class="barre-attente"><span></span></div>', {});
    var photos = [];
    Promise.all([chargerScript('vendor/jspdf.umd.min.js'), rafraichirColis(c).catch(function () {})]).then(function () { return chargerScript('js/pdf.js'); }).then(function () {
      var evs = c.evenements || [];
      var liste = evs.filter(function (e) { return e.type === 'preuve' && e.donnees && e.donnees.photo; }).slice(0, 30);
      var i = 0;
      function suivante() {
        if (i >= liste.length) return Promise.resolve();
        var e = liste[i++], d = e.donnees, p = { nom: d.photo, legende: d.legende, le: e.le, auteur: e.auteur, sha256: d.sha256 };
        photos.push(p);
        msgFeuille('Photos : ' + i + ' / ' + liste.length + '…');
        return fetch(R.urlPhoto(c.id, d.photo, c.jetons.proprio), { credentials: 'omit' }).then(function (r) { return r.ok ? r.blob() : null; })
          .then(function (b) { return b ? PH.miniature(b, 900) : null; }).then(function (m) { if (m) { p.url = m.url; p.l = m.l; p.h = m.h; } }, function () {}).then(suivante);
      }
      return suivante().then(function () { return CP.verifierChaine(c.id, evs); }).then(function (v) {
        S.verif[c.id] = v;
        var res = window.CPPdf.creer({ colis: c, evenements: evs, verification: v, photos: photos, premium: premium(), editeLe: new Date().toISOString() });
        var url = URL.createObjectURL(res.blob);
        var fichier = null;
        try { fichier = new File([res.blob], res.nom, { type: 'application/pdf' }); } catch (e) { fichier = null; }
        var peutPartager = !!(fichier && navigator.canShare && navigator.canShare({ files: [fichier] }));
        feuilleEtat = { pdf: fichier, url: url };
        $('#feuille .feuille-contenu').innerHTML = '<button type="button" class="feuille-fermer" data-action="fermer-feuille" aria-label="Fermer">' + ICO.fermer + '</button><h2>Preuve PDF prête</h2><p>' + res.pages + ' page' + (res.pages > 1 ? 's' : '') + ' · ' + Math.max(1, Math.round(res.blob.size / 1024)) + ' Ko' + (premium() ? '' : ' · version gratuite (mention en bas de page)') + '</p>' +
          '<div class="rang"><a class="btn plein large" id="pdf-telecharger" href="' + url + '" download="' + esc(res.nom) + '">' + ICO.telecharger + 'Télécharger</a>' +
          (peutPartager ? '<button type="button" class="btn sec large" data-action="pdf-partager">' + ICO.partager + 'Envoyer (WhatsApp…)</button>' : '') + '</div>' +
          (v.ok ? '<p class="petit">' + ICO.bouclier + ' Historique vérifié : intact.</p>' : '<p class="erreur">L\'historique ne se vérifie pas entièrement (voir le PDF).</p>');
        rendre(true);
      });
    }).catch(function () { msgFeuille('Impossible de créer le PDF pour le moment. Vérifiez le réseau et réessayez.', true); });
  }

  // ---------- Sauvegarde ----------
  function sauvegarder() {
    var data = { app: 'colispreuve', version: 1, exporteLe: new Date().toISOString(), colis: S.colis, liens: S.liens, reglages: S.reglages, pass: S.pass, creations: S.creations };
    telecharger(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'sauvegarde-colispreuve-' + CP.cleJour(Date.now()) + '.json');
    toast('Sauvegarde téléchargée. Gardez ce fichier en lieu sûr : il contient vos liens secrets.', 6000);
  }
  function importer(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var d; try { d = JSON.parse(lecteur.result); } catch (e) { d = null; }
      if (!d || d.app !== 'colispreuve' || !Array.isArray(d.colis)) return toast('Ce fichier n\'est pas une sauvegarde ColisPreuve.');
      var n = 0, suite = [];
      d.colis.forEach(function (c) {
        if (!c || !CP.RE_ID.test(c.id) || !c.jetons) return;
        var ici = colisPar(c.id);
        if (ici && (ici.majLe || 0) >= (c.majLe || 0)) return;
        if (ici) S.colis.splice(S.colis.indexOf(ici), 1);
        S.colis.push(c); suite.push(sauverColis(c)); n++;
      });
      (d.liens || []).forEach(function (l) { if (l && l.cle && !lienPar(l.role, l.id)) { S.liens.push(l); suite.push(sauverLien(l)); } });
      if (d.pass && !S.pass) { S.pass = d.pass; suite.push(sauverKv('pass', S.pass)); }
      Promise.all(suite).then(function () { toast(n + ' colis importé' + (n > 1 ? 's' : '') + ' ✓'); verifierPassRoutine(true); });
    };
    lecteur.readAsText(fichier);
  }

  // ---------- Événements ----------
  var ACTIONS = {
    'fermer-feuille': fermerFeuille,
    'etape': function (el) { feuilleEtape(el.getAttribute('data-type')); },
    'etape-directe': function (el) { el.disabled = true; etapeDirecte(el.getAttribute('data-type')); },
    'livrer': function () { feuilleLivrer(null); },
    'recoder': function (el) { feuilleLivrer(+el.getAttribute('data-n')); },
    'touche': function (el) { touche(el.getAttribute('data-v')); },
    'recu': confirmerReception,
    'recu-confirme': function () { envoyerReception(feuilleEtat.ctx); },
    'retirer-file': function (el) { if (confirm('Supprimer cette action non envoyée ?')) R.retirer(+el.getAttribute('data-n')).then(function () { return R.liste(); }).then(function (l) { S.file = l; majReseau(); rendre(true); }); },
    'reessayer': function (el) { R.corriger(+el.getAttribute('data-n'), {}).then(function () { return R.vider(); }).catch(function () {}); },
    'vider-file': function () { R.vider().catch(function () {}); },
    'photo-retirer': function () { if (feuilleEtat) feuilleEtat.photo = null; else S.photoNouveau = null; var a = $('.apercu'); if (a) { a.hidden = true; } var i = $('[data-photo]'); if (i) i.value = ''; },
    'voir-photo': function (el) { ouvrirFeuille('<h2>Photo</h2><img class="photo-grande" alt="Photo de preuve" src="' + esc(el.getAttribute('data-src')) + '">'); },
    'verifier': function (el) { verifier(el.getAttribute('data-id')); },
    'pdf': function (el) { genererPdf(el.getAttribute('data-id')); },
    'pdf-partager': function () { if (feuilleEtat && feuilleEtat.pdf) navigator.share({ files: [feuilleEtat.pdf], title: 'Preuve de livraison' }).catch(function () {}); },
    'partager': function (el) { partagerTexte(texteAPartager(el.getAttribute('data-quoi'))); },
    'copier': function (el) { copier(texteAPartager(el.getAttribute('data-quoi'))); },
    'filtre-etat': function (el) { S.filtre.etat = el.getAttribute('data-etat'); rendre(true); },
    'jour': function (el) { S.jourChoisi = +el.getAttribute('data-i'); rendre(true); },
    'actualiser': function (el) { if (!enLigne()) return toast('Pas de réseau.'); el.disabled = true; rafraichirTout(true).then(function () { toast('Colis à jour ✓'); rendre(true); }, function () { toast('Actualisation impossible.'); rendre(true); }); },
    'csv': function () {
      if (!premium()) { toast('L\'export du tableau de bord fait partie du Pass ColisPreuve.', 5000, { libelle: 'Voir le Pass', faire: function () { location.hash = '#/pass'; } }); return; }
      telecharger(new Blob([CP.csv(listeFiltree())], { type: 'text/csv;charset=utf-8' }), 'colispreuve-' + CP.cleJour(Date.now()) + '.csv');
    },
    'retirer-colis': function (el) {
      var id = el.getAttribute('data-id'), c = colisPar(id);
      if (!c || !confirm('Retirer ce colis de ce téléphone ? Les liens du livreur et du client continueront de marcher. Vous pourrez le retrouver avec votre lien vendeur.')) return;
      S.colis.splice(S.colis.indexOf(c), 1);
      DB.effacer('colis', id).then(function () { location.hash = '#/'; });
    },
    'sauvegarder': sauvegarder,
    'installer': function () {
      if (invite) { invite.prompt(); invite.userChoice.then(function () { invite = null; majInstall(); }); return; }
      ouvrirFeuille('<h2>Installer ColisPreuve</h2>' + instructionsInstall());
    }
  };
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el) { if (ev.target.id === 'feuille') fermerFeuille(); return; }
    var f = ACTIONS[el.getAttribute('data-action')];
    if (f) { ev.preventDefault(); f(el, ev); }
  });
  document.addEventListener('submit', function (ev) {
    var f = ev.target.getAttribute('data-form');
    if (!f) return;
    ev.preventDefault();
    if (f === 'nouveau') soumettreNouveau(ev.target);
    else if (f === 'pass') soumettrePass(ev.target);
    else if (f === 'etape') soumettreEtape(ev.target);
    else if (f === 'livrer') soumettreLivrer(ev.target);
    else if (f === 'reglages') {
      var fm = ev.target;
      S.reglages.boutique = fm.elements.boutique.value.trim().slice(0, 50);
      S.reglages.heures = +fm.elements.heures.value || 24;
      if (CP.contientTelephone(S.reglages.boutique)) { $('.msg', fm).textContent = 'Pas de numéro de téléphone dans le nom.'; return; }
      sauverKv('reglages', S.reglages).then(function () { toast('Réglages enregistrés ✓'); });
    }
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.id === 'f-texte') { S.filtre.texte = t.value; rendreListe(); }
    else if (t.id === 'code-saisie') majCode();
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.id === 'f-periode') { S.filtre.periode = t.value; rendre(true); }
    else if (t.name === 'paiement') { var b = $('#bloc-montant'); if (b) b.hidden = t.value === 'deja_paye'; }
    else if (t.id === 'import-fichier' && t.files && t.files[0]) importer(t.files[0]);
    else if (t.hasAttribute && t.hasAttribute('data-photo') && t.files && t.files[0]) {
      var cible = feuilleEtat || null, zone = t.closest('.champ-photo'), ap = $('.apercu', zone), lab = $('label span', zone);
      if (cible) cible.photoEnCours = true;
      lab.textContent = 'Préparation de la photo…';
      PH.reduire(t.files[0]).then(function (url) {
        if (cible) { cible.photo = url; cible.photoEnCours = false; } else S.photoNouveau = url;
        $('img', ap).src = url; ap.hidden = false; lab.textContent = 'Changer la photo';
      }, function () { if (cible) cible.photoEnCours = false; lab.textContent = 'Photo illisible : réessayez'; });
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !$('#feuille').hidden) fermerFeuille();
    if (!$('#feuille').hidden && $('#code-saisie') && document.activeElement !== $('#code-saisie')) {
      if (/^[0-9]$/.test(ev.key)) { touche(ev.key); ev.preventDefault(); }
      else if (ev.key === 'Backspace') { touche('efface'); ev.preventDefault(); }
    }
  });
  $('#installer').addEventListener('click', function () { ACTIONS.installer(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
