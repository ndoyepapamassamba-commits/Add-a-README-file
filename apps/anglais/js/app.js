/* Anglais du Métier — interface. Tout reste sur le téléphone ; seule l'activation du pass contacte la boutique. */
(function () {
  'use strict';
  var VERSION = '1.0.0';
  var PRIX = '2 000 F';
  var MOIS_MS = 30 * 86400000;

  // ---------- Petits outils ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Espaces insécables de la typographie française (avant ! ? : ; », après «)
  function typo(h) { return h.replace(/ ([!?:;»])/g, '\u00a0$1').replace(/« /g, '«\u00a0'); }
  function svg(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + p + '</svg>'; }
  var ICO = {
    son: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
    cartes: svg('<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>'),
    quiz: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>'),
    ecouter: svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="5" height="7" rx="2"/><rect x="16" y="14" width="5" height="7" rx="2"/>'),
    micro: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    progres: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    lire: svg('<path d="M7 4v16l13-8z"/>'),
    pause: svg('<path d="M7 4h4v16H7zM14 4h4v16h-4z"/>'),
    avant: svg('<path d="M18 6 9 12l9 6zM6 6v12"/>'),
    apres: svg('<path d="m6 6 9 6-9 6zM18 6v12"/>'),
    ok: svg('<path d="m5 12 5 5 9-10"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    cadenas: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    etoile: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    boutique: svg('<path d="M4 7h16l-1.5 12a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>'),
    sauvegarde: svg('<path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
    telecharger: svg('<path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>'),
    livre: svg('<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>'),
    partager: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
    installer: svg('<path d="M12 3v11m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="4" rx="1"/>'),
    echange: svg('<path d="M4 7h13l-3-3M20 17H7l3 3"/>'),
    alerte: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.01"/>'),
    poubelle: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    liste: svg('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
    flamme: svg('<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 5"/>')
  };

  var DEFAUTS = { accent: 'en-GB', vitesse: 0.9, nouvelles: 10, sens: 'en-fr', auto: true, objectif: 20, correctionVoix: null,
    theme: 'auto', ecouteTraduire: true, ecouteRepeter: false };
  var S = { index: [], data: {}, profil: null, reglages: Object.assign({}, DEFAUTS), cartes: {}, jours: {}, historique: [], passes: [], sauvegarde: null,
    seance: null, quiz: null, ecoute: null, oral: null };

  function aujourdhui() { return AM.dateISO(); }
  function etat() { return AM.etatPass(S.passes); }
  function premium() { return etat().premium; }
  function metierInfo(id) { for (var i = 0; i < S.index.length; i++) if (S.index[i].id === id) return S.index[i]; return null; }
  function ouvert(id) { return AM.metierOuvert(id, S.profil, premium()); }
  function metierActuel() {
    var id = S.profil && S.profil.metierActuel;
    if (!id || !ouvert(id)) id = S.profil && S.profil.metierGratuit;
    return metierInfo(id);
  }
  function chargerMetier(id) {
    if (S.data[id]) return Promise.resolve(S.data[id]);
    var m = metierInfo(id);
    return fetch('data/' + (m ? m.fichier : id + '.json')).then(function (r) {
      if (!r.ok) throw new Error('Contenu introuvable. Vérifiez la connexion puis réessayez.');
      return r.json();
    }).then(function (d) { S.data[id] = d; return d; });
  }
  function item(data, itemId) {
    var l = itemId.charAt(0) === 'p' ? data.phrases : data.mots;
    for (var i = 0; i < l.length; i++) if (l[i].id === itemId) return l[i];
    return null;
  }
  function pronHTML(p) {
    return esc(p).split(/([\s-]+)/).map(function (t) {
      return /[A-ZÀ-Ý]/.test(t) && t === t.toUpperCase() && t.replace(/[^A-Za-zÀ-ÿ]/g, '').length > 1 ? '<b>' + t + '</b>' : t;
    }).join('');
  }
  function sansParentheses(s) { return String(s).replace(/\s*\([^)]*\)/g, '').replace(/\s*\/\s*/g, ', '); }

  // ---------- Stockage ----------
  function sauver(cle, val) { return DB.mettre('kv', val, cle); }
  var persistanceDemandee = false;
  function demanderPersistance() {
    if (persistanceDemandee) return; persistanceDemandee = true;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}
  }
  function charger() {
    return Promise.all([DB.lire('kv', 'profil'), DB.lire('kv', 'reglages'), DB.lire('kv', 'jours'), DB.lire('kv', 'historique'),
      DB.lire('kv', 'passes'), DB.lire('kv', 'sauvegarde'), DB.tout('cartes'),
      fetch('data/metiers.json').then(function (r) { if (!r.ok) throw new Error('Contenu introuvable.'); return r.json(); })])
      .then(function (r) {
        S.profil = r[0] || null;
        S.reglages = Object.assign({}, DEFAUTS, r[1] || {});
        S.jours = r[2] || {};
        S.historique = r[3] || [];
        S.passes = r[4] || [];
        S.sauvegarde = r[5] || null;
        S.cartes = {};
        (r[6] || []).forEach(function (c) { S.cartes[c.id] = c; });
        S.index = r[7].metiers;
      });
  }

  // ---------- Composants ----------
  var minuteurToast = 0;
  function toast(msg, action) {
    var t = $('#toast');
    t.innerHTML = '<span>' + typo(esc(msg)) + '</span>' + (action ? '<button type="button" class="toast-btn">' + esc(action.label) + '</button>' : '');
    t.hidden = false;
    requestAnimationFrame(function () { t.classList.add('visible'); });
    if (action) t.querySelector('button').onclick = function () { cacherToast(); action.fn(); };
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(cacherToast, action ? 8000 : 3500);
  }
  function cacherToast() { var t = $('#toast'); t.classList.remove('visible'); setTimeout(function () { if (!t.classList.contains('visible')) t.hidden = true; }, 250); }

  var feuilleOuverte = null;
  function feuille(titre, contenu, init) {
    fermerFeuille();
    var fond = document.createElement('div');
    fond.className = 'feuille-fond';
    fond.innerHTML = '<div class="feuille" role="dialog" aria-modal="true" aria-labelledby="feuille-titre"><div class="feuille-tete"><h2 id="feuille-titre">' +
      esc(titre) + '</h2><button type="button" class="icone-btn" data-fermer aria-label="Fermer">' + ICO.x + '</button></div><div class="feuille-corps">' + typo(contenu) + '</div></div>';
    document.body.appendChild(fond);
    document.body.classList.add('fige');
    feuilleOuverte = { el: fond, avant: document.activeElement };
    fond.addEventListener('click', function (e) { if (e.target === fond || e.target.closest('[data-fermer]')) fermerFeuille(); });
    var b = fond.querySelector('.feuille-corps button, .feuille-corps a, [data-fermer]');
    if (b) b.focus();
    if (init) init(fond);
    return fond;
  }
  function fermerFeuille() {
    if (!feuilleOuverte) return;
    var f = feuilleOuverte; feuilleOuverte = null;
    f.el.remove();
    document.body.classList.remove('fige');
    if (f.avant && f.avant.focus) try { f.avant.focus(); } catch (e) {}
  }
  function confirmer(question, oui, danger) {
    return new Promise(function (ok) {
      var repondu = false;
      feuille('Confirmer', '<p>' + esc(question) + '</p><div class="rang-btn"><button type="button" class="btn" data-fermer>Annuler</button><button type="button" class="btn ' +
        (danger ? 'danger' : 'plein') + '" data-oui>' + esc(oui) + '</button></div>', function (f) {
        f.querySelector('[data-oui]').addEventListener('click', function () { repondu = true; fermerFeuille(); ok(true); });
        var obs = new MutationObserver(function () { if (!document.body.contains(f)) { obs.disconnect(); if (!repondu) ok(false); } });
        obs.observe(document.body, { childList: true });
      });
    });
  }

  function vue(html) {
    var v = $('#vue');
    v.innerHTML = typo(html);
    window.scrollTo(0, 0);
  }
  function cadre(o) {
    $('#titre').textContent = o.titre || 'Anglais du Métier';
    document.title = (o.titre && o.titre !== 'Anglais du Métier' ? o.titre + ' · ' : '') + 'Anglais du Métier';
    var r = $('#retour');
    r.hidden = !o.retour;
    r.dataset.cible = o.retour || '';
    $('#marque').hidden = !!o.retour;
    $$('#nav a').forEach(function (a) { a.classList.toggle('actif', a.dataset.nav === o.nav); if (a.dataset.nav === o.nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#nav').hidden = !S.profil;
    $('#lien-reglages').hidden = !S.profil || o.nav === 'reglages';
    majInstall();
  }
  function son(texte, lang, cls, libelle) {
    return '<button type="button" class="son ' + (cls || '') + '" data-action="dire" data-texte="' + esc(texte) + '" data-lang="' + (lang || 'en') + '" aria-label="' +
      esc(libelle || (lang === 'fr' ? 'Écouter en français' : 'Écouter en anglais')) + '">' + ICO.son + '</button>';
  }
  function verrou() { return '<span class="etiquette verrou">' + ICO.cadenas.replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"') + ' Pass</span>'; }

  // ---------- Voix ----------
  var arretVoix = null;
  function parler(texte, lang, bouton, fin) {
    if (arretVoix) { arretVoix(); arretVoix = null; }
    $$('.son.joue').forEach(function (b) { b.classList.remove('joue'); });
    if (!Voix.synthese) { toast('La lecture à voix haute n\'est pas disponible sur ce navigateur.'); if (fin) fin(false); return; }
    if (bouton) bouton.classList.add('joue');
    arretVoix = Voix.dire(texte, { lang: lang === 'fr' ? 'fr-FR' : S.reglages.accent, vitesse: lang === 'fr' ? 1 : S.reglages.vitesse, fin: function (ok) {
      if (bouton) bouton.classList.remove('joue');
      if (fin) fin(ok);
    } });
  }
  function silence() { if (arretVoix) { arretVoix(); arretVoix = null; } Voix.arreter(); $$('.son.joue').forEach(function (b) { b.classList.remove('joue'); }); }

  function noterActivite(champ, n) {
    S.jours = AM.ajouterActivite(S.jours, aujourdhui(), champ, n);
    return sauver('jours', S.jours);
  }

  // ---------- Routeur ----------
  var ROUTES = [
    [/^\/?$/, vueAccueil], [/^\/bienvenue$/, vueBienvenue], [/^\/metiers$/, vueMetiers], [/^\/metier\/([a-z]+)$/, vueMetier],
    [/^\/cartes$/, vueCartes], [/^\/quiz$/, vueQuiz], [/^\/ecouter$/, vueEcouter], [/^\/parler$/, vueParler],
    [/^\/progres$/, vueProgres], [/^\/reglages$/, vueReglages], [/^\/pass$/, vuePass], [/^\/sauvegarde$/, vueSauvegarde], [/^\/aide$/, vueAide]
  ];
  var LIBRES = ['/bienvenue', '/pass', '/sauvegarde', '/aide'];
  function router() {
    fermerFeuille();
    silence();
    if (S.oral && S.oral.arret) { S.oral.arret(); S.oral.arret = null; }
    if (S.ecoute) S.ecoute.joue = false;
    var brut = location.hash.replace(/^#/, '') || '/';
    var q = brut.indexOf('?'), chemin = q >= 0 ? brut.slice(0, q) : brut, params = new URLSearchParams(q >= 0 ? brut.slice(q + 1) : '');
    if (!S.profil && LIBRES.indexOf(chemin) < 0) { location.replace('#/bienvenue'); return; }
    for (var i = 0; i < ROUTES.length; i++) {
      var m = chemin.match(ROUTES[i][0]);
      if (m) {
        var r;
        try { r = ROUTES[i][1](m[1], params); } catch (e) { erreurVue(e); return; }
        if (r && r.catch) r.catch(erreurVue);
        return;
      }
    }
    location.replace('#/');
  }
  function erreurVue(e) {
    vue('<section class="carte alerte rouge"><h1>Oups</h1><p>' + esc(e && e.message || e) + '</p><a class="btn plein large" href="#/">Revenir à l\'accueil</a></section>');
  }
  function aller(h) { if (location.hash === h) router(); else location.hash = h; }

  // ---------- Bienvenue : choix du métier gratuit ----------
  function vueBienvenue(_, params) {
    var changer = params.get('changer') === '1' && S.profil;
    cadre({ titre: changer ? 'Changer de métier gratuit' : 'Bienvenue', retour: changer ? '#/reglages' : '', nav: '' });
    var h = '';
    if (!changer) h += '<section class="carte douce"><h1>Bienvenue !</h1><p>Apprenez l\'anglais <b>utile pour votre travail</b>, expliqué en français simple : 60 mots et 25 phrases par métier, avec la prononciation, des cartes mémoire, l\'écoute, des quiz et l\'oral.</p><p class="petit">Tout marche sans Internet et reste sur votre téléphone.</p></section>';
    else h += '<section class="carte alerte"><p>Vous pouvez changer de métier gratuit <b>une seule fois</b>. Vos progrès dans l\'ancien métier sont gardés.</p></section>';
    h += '<h2>' + (changer ? 'Nouveau métier gratuit' : 'Choisissez votre métier') + '</h2>';
    if (!changer && !premium()) h += '<p class="petit">Ce métier sera gratuit. Les 9 autres font partie du pass (' + PRIX + ' pour 12 mois).</p>';
    h += '<div class="metiers">' + S.index.map(function (m) {
      var actuel = changer && S.profil.metierGratuit === m.id;
      return '<button type="button" class="metier' + (actuel ? ' actif' : '') + '" data-action="choisir-gratuit" data-id="' + m.id + '"' + (actuel ? ' disabled' : '') + '><span class="gros-emoji emoji" aria-hidden="true">' + m.emoji +
        '</span><span class="info"><strong>' + esc(m.nom) + '</strong><small>' + esc(m.description) + '</small></span></button>';
    }).join('') + '</div>';
    if (!changer) h += '<p class="centre petit" style="margin-top:18px"><a href="#/sauvegarde">J\'ai une sauvegarde à restaurer</a> · <a href="#/pass">J\'ai déjà un pass</a></p>';
    vue(h);
  }
  function choisirGratuit(id) {
    var m = metierInfo(id), changer = !!(S.profil && S.profil.metierGratuit);
    if (!m) return;
    if (changer && !AM.peutChangerMetierGratuit(S.profil)) { toast('Vous avez déjà changé de métier gratuit.'); return; }
    var q = changer ? 'Prendre « ' + m.nom + ' » comme métier gratuit ? Ce changement ne pourra plus être refait.'
      : premium() ? 'Commencer par « ' + m.nom + ' » ? Avec votre pass, vous pourrez ouvrir tous les métiers.'
        : 'Choisir « ' + m.nom + ' » comme métier gratuit ? Vous pourrez en changer une fois plus tard.';
    confirmer(q, 'Choisir').then(function (oui) {
      if (!oui) return;
      var p = S.profil || { cree: new Date().toISOString(), changements: 0 };
      if (changer) p.changements = (p.changements | 0) + 1;
      p.metierGratuit = id; p.metierActuel = id;
      S.profil = p;
      S.seance = null;
      sauver('profil', p).then(function () { demanderPersistance(); toast('C\'est parti : ' + m.court + ' !'); aller('#/'); });
    });
  }

  // ---------- Accueil ----------
  function rappels() {
    var h = '', e = etat();
    if (e.rappel) h += '<section class="carte alerte"><div class="alerte-ligne">' + ICO.alerte + '<div><strong>Votre pass se termine dans ' + e.joursRestants + ' jour' + (e.joursRestants > 1 ? 's' : '') +
      '.</strong><p>Renouvelez-le pour garder les 10 métiers : les jours restants s\'ajoutent, rien n\'est perdu.</p><a class="btn accent" href="#/pass">Renouveler</a></div></div></section>';
    else if (e.expire) h += '<section class="carte alerte"><div class="alerte-ligne">' + ICO.info + '<div><strong>Votre pass est terminé.</strong><p>Vos progrès sont gardés. Votre métier gratuit reste ouvert ; reprenez un pass pour les autres.</p><a class="btn accent" href="#/pass">Reprendre un pass</a></div></div></section>';
    var nb = Object.keys(S.cartes).length;
    if (nb >= 30 && (!S.sauvegarde || Date.now() - Date.parse(S.sauvegarde) > MOIS_MS))
      h += '<p class="carte alerte alerte-ligne">' + ICO.sauvegarde + '<span>Pensez à sauvegarder vos progrès. <a href="#/sauvegarde">Sauvegarder maintenant</a></span></p>';
    return h;
  }
  function vueAccueil() {
    cadre({ titre: 'Anglais du Métier', nav: 'accueil' });
    var m = metierActuel();
    if (!m) { location.replace('#/bienvenue'); return; }
    if (S.profil.metierActuel !== m.id) { S.profil.metierActuel = m.id; sauver('profil', S.profil); }
    return chargerMetier(m.id).then(function (data) {
      var j = aujourdhui();
      var s = AM.construireSeance({ metier: m.id, data: data, cartes: S.cartes, aujourdhui: j, nouvellesMax: S.reglages.nouvelles });
      var p = AM.progressionMetier(S.cartes, data);
      var serie = AM.serie(S.jours, j), pts = AM.pointsJour(S.jours[j]), obj = S.reglages.objectif;
      var h = rappels();
      h += '<section class="carte metier-actuel"><span class="gros-emoji emoji" aria-hidden="true">' + m.emoji + '</span><div style="flex:1;min-width:0"><p class="petit">Mon métier</p><h1>' +
        esc(m.nom) + '</h1></div><a class="btn sec" href="#/metiers" style="min-height:46px;padding:8px 14px;font-size:15px">Changer</a></section>';
      var sousTitre = s.file.length ? (s.revisions ? s.revisions + ' à revoir' : '') + (s.revisions && s.nouvelles ? ' · ' : '') + (s.nouvelles ? s.nouvelles + ' nouvelle' + (s.nouvelles > 1 ? 's' : '') : '') : 'Tout est révisé pour aujourd\'hui';
      h += '<div class="tuiles"><a class="tuile principale" href="#/cartes">' + ICO.cartes + '<span class="texte"><strong>Réviser mes cartes</strong><br><small>' + esc(sousTitre) + '</small></span>' +
        (s.file.length ? '<span class="pastille" aria-label="' + s.file.length + ' cartes">' + s.file.length + '</span>' : '') + '</a>' +
        '<a class="tuile" href="#/quiz">' + ICO.quiz + '<span><strong>Quiz</strong><br><small>10 questions</small></span></a>' +
        '<a class="tuile" href="#/ecouter">' + ICO.ecouter + '<span><strong>Écouter</strong><br><small>Mains libres</small></span></a>' +
        '<a class="tuile" href="#/parler">' + ICO.micro + '<span><strong>Parler</strong><br><small>Dire les phrases</small></span></a>' +
        '<a class="tuile" href="#/metier/' + m.id + '">' + ICO.liste + '<span><strong>Mots et phrases</strong><br><small>' + data.mots.length + ' mots, ' + data.phrases.length + ' phrases</small></span></a></div>';
      h += '<section class="carte"><div class="serie"><span class="flamme emoji" aria-hidden="true">' + (serie > 0 ? '🔥' : '🌱') + '</span><div style="flex:1"><strong>' + serie + ' jour' + (serie > 1 ? 's' : '') +
        ' de suite</strong><span class="petit">' + (pts > 0 ? 'Bravo, vous avez travaillé aujourd\'hui.' : serie > 0 ? 'Travaillez aujourd\'hui pour garder votre série.' : 'Faites une activité pour commencer une série.') +
        '</span></div><a class="lien-btn" href="#/progres">Détails</a></div><div class="objectif"><div class="petit" style="display:flex;justify-content:space-between"><span>Objectif du jour</span><b>' +
        Math.min(pts, obj) + ' / ' + obj + ' points</b></div><div class="barre" role="progressbar" aria-label="Objectif du jour" aria-valuemin="0" aria-valuemax="' + obj + '" aria-valuenow="' + Math.min(pts, obj) +
        '"><i class="' + (pts >= obj ? 'ok' : 'moyen') + '" style="width:' + Math.min(100, Math.round(pts * 100 / obj)) + '%"></i></div></div></section>';
      h += '<section class="carte"><h2>Ma progression en ' + esc(m.court) + '</h2>' + barreProgres(p) +
        '<div class="chiffres"><div><strong>' + p.acquis + '</strong><span>appris</span></div><div><strong>' + p.en_cours + '</strong><span>en cours</span></div><div><strong>' + p.nouveau +
        '</strong><span>à découvrir</span></div></div></section>';
      var msg = AM.messagePartage({ metier: m.court, acquis: p.acquis, serie: serie });
      h += '<a class="btn wa large" target="_blank" rel="noopener" id="partage-wa" href="' + esc(AM.lienWhatsApp(msg)) + '">' + ICO.partager + 'Conseiller l\'appli sur WhatsApp</a>';
      h += carteInstallation();
      vue(h);
    });
  }
  function barreProgres(p) {
    var pc = function (n) { return p.total ? (n * 100 / p.total).toFixed(2) : 0; };
    return '<div class="barre" role="img" aria-label="' + p.acquis + ' appris, ' + p.en_cours + ' en cours, ' + p.nouveau + ' à découvrir sur ' + p.total + '"><i class="ok" style="width:' + pc(p.maitrise) +
      '%"></i><i style="width:' + pc(p.appris) + '%"></i><i class="moyen" style="width:' + pc(p.en_cours) + '%"></i></div>' +
      '<div class="legende"><span><i style="background:var(--ok)"></i>maîtrisé</span><span><i style="background:var(--brand)"></i>appris</span><span><i style="background:var(--accent)"></i>en cours</span><span><i style="background:var(--surface-2)"></i>à découvrir</span></div>';
  }

  // ---------- Métiers ----------
  function vueMetiers() {
    cadre({ titre: 'Les métiers', retour: '#/', nav: 'accueil' });
    var actuel = metierActuel(), pr = premium();
    var h = pr ? '' : '<p class="carte douce">Votre métier gratuit est ouvert. <b>Le pass ouvre les 10 métiers</b> pendant 12 mois (' + PRIX + '). <a href="#/pass">Voir le pass</a></p>';
    h += '<div class="metiers">' + S.index.map(function (m) {
      var ok = ouvert(m.id), nb = 0, appris = 0;
      Object.keys(S.cartes).forEach(function (k) { var c = S.cartes[k]; if (c.metier === m.id) { nb++; if (c.rep >= 2) appris++; } });
      var total = m.mots + m.phrases, pc = Math.round(appris * 100 / total);
      var etiquette = S.profil.metierGratuit === m.id && !pr ? '<span class="etiquette gratuit">Gratuit</span>' : ok ? '' : verrou();
      return '<button type="button" class="metier' + (actuel && actuel.id === m.id ? ' actif' : '') + '" data-action="ouvrir-metier" data-id="' + m.id + '"><span class="gros-emoji emoji" aria-hidden="true">' + m.emoji +
        '</span><span class="info"><strong>' + esc(m.nom) + ' ' + etiquette + '</strong><small>' + (nb ? pc + ' % appris · ' + appris + ' / ' + total : esc(m.description)) + '</small>' +
        (nb ? '<span class="barre"><i class="ok" style="width:' + pc + '%"></i></span>' : '') + '</span>' + (actuel && actuel.id === m.id ? '<span class="etat">' + ICO.ok + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    vue(h);
  }
  function ouvrirMetier(id) {
    if (!ouvert(id)) { aller('#/metier/' + id); return; }
    S.profil.metierActuel = id; S.seance = null; S.quiz = null; S.ecoute = null; S.oral = null;
    sauver('profil', S.profil).then(function () { aller('#/'); });
  }
  function vueMetier(id, params) {
    var m = metierInfo(id);
    if (!m) { location.replace('#/metiers'); return; }
    var ok = ouvert(id), onglet = params.get('o') === 'phrases' ? 'phrases' : 'mots';
    cadre({ titre: m.court, retour: ok ? '#/' : '#/metiers', nav: 'accueil' });
    return chargerMetier(id).then(function (data) {
      var liste = onglet === 'mots' ? data.mots : data.phrases;
      var visibles = ok ? liste : liste.slice(0, onglet === 'mots' ? 8 : 3);
      var h = '<section class="carte metier-actuel"><span class="gros-emoji emoji" aria-hidden="true">' + m.emoji + '</span><div><h1>' + esc(m.nom) + '</h1><p class="petit">' + esc(m.description) + '</p></div></section>';
      if (!ok) h += '<section class="carte alerte"><p><b>Aperçu.</b> Ce métier fait partie du pass. Écoutez quelques mots pour découvrir.</p></section>';
      h += '<div class="onglets" role="tablist"><button type="button" role="tab" aria-selected="' + (onglet === 'mots') + '" data-action="onglet-metier" data-o="mots">' + data.mots.length +
        ' mots</button><button type="button" role="tab" aria-selected="' + (onglet === 'phrases') + '" data-action="onglet-metier" data-o="phrases">' + data.phrases.length + ' phrases</button></div>';
      h += '<section class="carte"><ul class="mots-liste">' + visibles.map(function (x) {
        var st = AM.statutCarte(S.cartes[AM.idCarte(id, x.id)]);
        return '<li><span class="statut-point ' + st + '" title="' + { nouveau: 'à découvrir', en_cours: 'en cours', appris: 'appris', maitrise: 'maîtrisé' }[st] + '"></span><div class="t"><strong lang="en">' + esc(x.en) +
          '</strong><small>' + esc(x.fr) + '</small><span class="p">' + pronHTML(x.pron) + '</span>' + (x.note ? '<small>' + esc(x.note) + '</small>' : '') + '</div>' + son(x.en, 'en', 'petit-son', 'Écouter « ' + x.en + ' »') + '</li>';
      }).join('') + '</ul>' + (ok ? '' : '<p class="petit centre">… et ' + (liste.length - visibles.length) + ' autres avec le pass.</p>') + '</section>';
      if (!ok) h += offrePass();
      vue(h);
    });
  }
  function offrePass() {
    return '<section class="carte"><h2>Débloquez les 10 métiers</h2><ul class="atouts">' + avantages() + '</ul><p class="prix">' + PRIX + ' <small>pour 12 mois</small></p><a class="btn plein large" href="#/pass">' + ICO.etoile + 'Voir le pass</a></section>';
  }

  // ---------- Cartes mémoire ----------
  function vueCartes(_, params) {
    var m = metierActuel();
    cadre({ titre: 'Cartes · ' + m.court, nav: 'cartes' });
    return chargerMetier(m.id).then(function (data) {
      var j = aujourdhui();
      if (!S.seance || S.seance.metier !== m.id || S.seance.jour !== j || params.get('nouvelle') === '1' || params.get('plus') === '1') {
        var extra = params.get('plus') === '1' ? 5 : 0;
        var s = AM.construireSeance({ metier: m.id, data: data, cartes: S.cartes, aujourdhui: j,
          nouvellesMax: extra ? AM.nouvellesDuJour(S.cartes, m.id, j) + extra : S.reglages.nouvelles });
        S.seance = { metier: m.id, jour: j, file: s.file, pos: 0, faites: 0, nouvelles: 0, rates: 0, echecs: {}, revele: false };
        if (params.get('plus') === '1' || params.get('nouvelle') === '1') history.replaceState(null, '', '#/cartes');
      }
      afficherCarte(data);
    });
  }
  function sensCarte(id) {
    var s = S.reglages.sens;
    if (s === 'mix') { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return (h + S.seance.pos) % 2 ? 'fr-en' : 'en-fr'; }
    return s;
  }
  function afficherCarte(data) {
    var se = S.seance, m = metierInfo(se.metier);
    if (se.pos >= se.file.length) return finSeance(data);
    var id = se.file[se.pos], itemId = id.split(':')[1], x = item(data, itemId), c = S.cartes[id];
    var phrase = itemId.charAt(0) === 'p', sens = sensCarte(id), avantEn = sens === 'en-fr';
    var restant = se.file.length - se.pos, total = se.file.length;
    var h = '<div class="flash"><div class="flash-tete"><span>' + (c && c.vues ? 'Révision' : 'Nouveau') + '</span><div class="barre" aria-hidden="true"><i style="width:' + Math.round(se.pos * 100 / total) +
      '%"></i></div><span>' + restant + ' restante' + (restant > 1 ? 's' : '') + '</span></div>';
    h += '<section class="face" aria-live="polite"><p class="sorte">' + (phrase ? 'Phrase' : 'Mot') + (avantEn ? ' · que veut dire ?' : ' · comment dit-on en anglais ?') + '</p>';
    if (avantEn) h += '<p class="question' + (phrase ? ' phrase' : '') + '" lang="en">' + esc(x.en) + '</p>' + son(x.en, 'en', '', 'Écouter en anglais');
    else h += '<p class="question' + (phrase ? ' phrase' : '') + '">' + esc(x.fr) + '</p>';
    if (se.revele) {
      h += '<hr class="separateur">';
      if (avantEn) h += '<p class="reponse' + (phrase ? ' phrase' : '') + '">' + esc(x.fr) + '</p>';
      else h += '<p class="reponse' + (phrase ? ' phrase' : '') + '" lang="en">' + esc(x.en) + '</p>' + son(x.en, 'en', '', 'Écouter en anglais');
      h += '<p class="pron">' + pronHTML(x.pron) + '</p>' + (x.note ? '<p class="note-us">' + esc(x.note) + '</p>' : '');
    }
    h += '</section>';
    if (!se.revele) h += '<button type="button" class="btn plein large" data-action="reveler" id="reveler">Voir la réponse</button>';
    else {
      var a = AM.apercu(c || AM.nouvelleCarte(id, se.metier), aujourdhui());
      h += '<div class="notes4" role="group" aria-label="Je savais ?">' +
        '<button type="button" class="n-rate" data-action="noter" data-note="rate">Raté<small>tout de suite</small></button>' +
        '<button type="button" class="n-difficile" data-action="noter" data-note="difficile">Difficile<small>' + AM.libelleIntervalle(a.difficile) + '</small></button>' +
        '<button type="button" class="n-bien" data-action="noter" data-note="bien">Bien<small>' + AM.libelleIntervalle(a.bien) + '</small></button>' +
        '<button type="button" class="n-facile" data-action="noter" data-note="facile">Facile<small>' + AM.libelleIntervalle(a.facile) + '</small></button></div>' +
        '<p class="raccourcis">Soyez honnête : l\'application vous redonne la carte au bon moment.</p>';
    }
    h += '</div>';
    vue(h);
    if (S.reglages.auto && Voix.synthese && (avantEn ? !se.revele : se.revele)) setTimeout(function () { var b = $('.face .son'); if (b && S.seance === se) parler(x.en, 'en', b); }, 250);
  }
  function noter(note) {
    var se = S.seance;
    if (!se || !se.revele) return;
    var id = se.file[se.pos], j = aujourdhui(), ancienne = S.cartes[id];
    var c = AM.sm2(ancienne || AM.nouvelleCarte(id, se.metier), AM.NOTES[note], j);
    S.cartes[id] = c;
    se.faites++;
    if (!ancienne || !ancienne.vues) se.nouvelles++;
    if (note === 'rate') { se.rates++; se.echecs[id] = (se.echecs[id] | 0) + 1; if (se.echecs[id] <= 3) se.file = AM.reinserer(se.file, se.pos, id); }
    S.jours = AM.ajouterActivite(S.jours, j, 'cartes', 1);
    DB.lot([['cartes', c], ['kv', S.jours, 'jours']]).catch(function (e) { toast('Enregistrement impossible : ' + (e && e.message || e)); });
    se.pos++; se.revele = false;
    silence();
    afficherCarte(S.data[se.metier]);
  }
  function finSeance(data) {
    var se = S.seance, j = aujourdhui();
    var prochaines = AM.dues(S.cartes, se.metier, AM.ajouterJours(j, 1)).length;
    var h = '<section class="carte centre">';
    if (se.faites) h += '<p class="etoiles emoji" aria-hidden="true">🎉</p><h1>Séance terminée !</h1><p>' + se.faites + ' carte' + (se.faites > 1 ? 's' : '') + ' travaillée' + (se.faites > 1 ? 's' : '') +
      (se.nouvelles ? ', dont ' + se.nouvelles + ' nouvelle' + (se.nouvelles > 1 ? 's' : '') : '') + '.</p>';
    else h += '<p class="etoiles emoji" aria-hidden="true">✅</p><h1>Rien à réviser pour l\'instant</h1><p>Vous avez vu vos nouvelles cartes du jour (' + S.reglages.nouvelles + ' par jour).</p>';
    h += '<p class="petit">' + (prochaines ? 'Demain : ' + prochaines + ' carte' + (prochaines > 1 ? 's' : '') + ' à revoir.' : 'Revenez demain pour la suite.') + '</p></section>';
    var p = AM.progressionMetier(S.cartes, data);
    if (p.nouveau > 0) h += '<button type="button" class="btn sec large" data-action="encore-cartes">' + ICO.cartes + 'Apprendre 5 cartes de plus</button>';
    h += '<a class="btn plein large" href="#/quiz">' + ICO.quiz + 'Faire un quiz</a><a class="btn large" href="#/">Revenir à l\'accueil</a>';
    vue(h);
  }

  // ---------- Quiz ----------
  var TYPES_QUIZ = { 'en-fr': 'Que veut dire… ?', 'fr-en': 'Comment dit-on en anglais ?', trou: 'Complétez la phrase', ecoute: 'Écoutez et choisissez' };
  function vueQuiz(_, params) {
    var m = metierActuel();
    cadre({ titre: 'Quiz · ' + m.court, nav: 'quiz' });
    return chargerMetier(m.id).then(function (data) {
      if (S.quiz && S.quiz.metier === m.id && !S.quiz.fini && params.get('choix') !== '1') return afficherQuestion();
      if (params.get('choix') === '1') history.replaceState(null, '', '#/quiz');
      var modes = [['melange', '🎯', 'Quiz mélangé', 'Mots, phrases à compléter' + (Voix.synthese ? ' et écoute' : '')],
        ['mots', '🔤', 'Les mots', 'Choisir la bonne traduction'], ['trous', '✍️', 'Phrases à compléter', 'Trouver le mot qui manque']];
      if (Voix.synthese) modes.push(['ecoute', '🎧', 'Écoute', 'Écouter puis choisir le sens']);
      var h = '<section class="carte douce"><h1>Quiz de 10 questions</h1><p>Les mots déjà vus en cartes viennent en premier. Une erreur ? La carte revient vite en révision.</p></section><div class="modes">' + modes.map(function (x) {
        return '<button type="button" class="mode" data-action="quiz-lancer" data-mode="' + x[0] + '"><span class="gros-emoji emoji" aria-hidden="true">' + x[1] + '</span><span><strong>' + x[2] + '</strong><small>' + x[3] + '</small></span></button>';
      }).join('') + '</div>';
      var derniers = S.historique.filter(function (q) { return q.metier === m.id; }).slice(-3).reverse();
      if (derniers.length) h += '<section class="carte" style="margin-top:14px"><h2>Derniers scores</h2>' + derniers.map(function (q) { return '<p>' + AM.dateFr(q.date) + ' : <b>' + q.score + ' / ' + q.n + '</b></p>'; }).join('') + '</section>';
      vue(h);
    });
  }
  function lancerQuiz(mode) {
    var m = metierActuel(), data = S.data[m.id];
    var qs = AM.genererQuiz({ data: data, cartes: S.cartes, n: 10, mode: mode, audio: Voix.synthese });
    S.quiz = { metier: m.id, mode: mode, questions: qs, i: 0, bonnes: 0, erreurs: [], repondu: -1, fini: false };
    afficherQuestion();
  }
  function afficherQuestion() {
    var Q = S.quiz, q = Q.questions[Q.i];
    if (!q) return finQuiz();
    var phrase = q.sorte === 'phrase';
    var h = '<div class="flash-tete" style="margin-bottom:10px"><span>Question ' + (Q.i + 1) + ' / ' + Q.questions.length + '</span><div class="barre" aria-hidden="true"><i style="width:' +
      Math.round(Q.i * 100 / Q.questions.length) + '%"></i></div><span>' + Q.bonnes + ' ' + ICO.ok.replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px;color:var(--ok)"') + '</span></div>';
    h += '<section class="carte"><p class="q-type">' + TYPES_QUIZ[q.type] + '</p>';
    if (q.type === 'ecoute') h += '<div class="q-ecoute">' + son(q.en, 'en', '', 'Écouter la question') + '<span class="petit">Touchez pour réécouter</span></div>';
    else if (q.type === 'trou') h += '<p class="q-texte phrase" lang="en">' + esc(q.texte).replace(AM.TROU, '<span class="trou" aria-label="mot manquant">____</span>') + '</p><p class="q-aide">' + esc(q.aide) + '</p>';
    else h += '<p class="q-texte' + (phrase ? ' phrase' : '') + '"' + (q.type === 'en-fr' ? ' lang="en"' : '') + '>' + esc(q.texte) + '</p>' + (q.type === 'en-fr' ? son(q.en, 'en', 'petit-son') : '');
    var rep = Q.repondu;
    h += '<div class="choix" role="group" aria-label="Réponses">' + q.choix.map(function (c, k) {
      var cls = rep >= 0 ? (k === q.bonne ? 'bonne' : k === rep ? 'fausse' : '') : '';
      return '<button type="button" class="' + cls + '" data-action="repondre" data-k="' + k + '"' + (rep >= 0 ? ' disabled' : '') + (q.type === 'fr-en' || q.type === 'trou' ? ' lang="en"' : '') +
        '><span class="lettre" aria-hidden="true">' + 'ABCD'.charAt(k) + '</span><span>' + esc(c) + '</span></button>';
    }).join('') + '</div>';
    if (rep >= 0) {
      var juste = rep === q.bonne;
      h += '<p class="verdict ' + (juste ? 'ok' : 'ko') + '" role="status">' + (juste ? ICO.ok + 'Bonne réponse !' : ICO.x + 'Pas tout à fait.') + '</p>';
      h += '<p lang="en"><b>' + esc(q.en) + '</b></p><p class="petit">' + esc(q.fr) + '</p>';
      h += '<button type="button" class="btn plein large" data-action="question-suivante" id="suivante">' + (Q.i + 1 < Q.questions.length ? 'Question suivante' : 'Voir mon score') + '</button>';
    }
    h += '</section>';
    vue(h);
    if (q.type === 'ecoute' && rep < 0) setTimeout(function () { var b = $('.q-ecoute .son'); if (b && S.quiz === Q) parler(q.en, 'en', b); }, 250);
  }
  function repondre(k) {
    var Q = S.quiz, q = Q && Q.questions[Q.i];
    if (!q || Q.repondu >= 0) return;
    Q.repondu = k;
    if (k === q.bonne) Q.bonnes++;
    else Q.erreurs.push(q);
    afficherQuestion();
    if (S.reglages.auto && Voix.synthese) parler(q.en, 'en');
    var s = $('#suivante'); if (s) s.focus();
  }
  function finQuiz() {
    var Q = S.quiz, j = aujourdhui();
    if (!Q.fini) {
      Q.fini = true;
      S.historique = S.historique.concat([{ date: j, metier: Q.metier, mode: Q.mode, score: Q.bonnes, n: Q.questions.length }]).slice(-200);
      S.jours = AM.ajouterActivite(S.jours, j, 'quiz', 1);
      var ops = [['kv', S.historique, 'historique'], ['kv', S.jours, 'jours']];
      // une erreur fait revenir la carte (déjà vue) en révision dès aujourd'hui
      Q.erreurs.forEach(function (q) {
        var c = S.cartes[AM.idCarte(Q.metier, q.itemId)];
        if (c && c.echeance > j) { c = Object.assign({}, c, { echeance: j }); S.cartes[c.id] = c; ops.push(['cartes', c]); }
      });
      DB.lot(ops).catch(function () {});
      S.seance = null;
    }
    var n = Q.questions.length, b = Q.bonnes;
    var etoiles = b >= n * 0.9 ? '⭐⭐⭐' : b >= n * 0.7 ? '⭐⭐' : b >= n * 0.5 ? '⭐' : '💪';
    var h = '<section class="carte centre"><p class="etoiles emoji" aria-hidden="true">' + etoiles + '</p><p class="score-final">' + b + ' / ' + n + '</p><h1>' +
      (b === n ? 'Parfait !' : b >= n * 0.7 ? 'Très bien !' : b >= n * 0.5 ? 'C\'est bien, continuez !' : 'Courage, ça va venir !') + '</h1></section>';
    if (Q.erreurs.length) h += '<section class="carte"><h2>À revoir</h2><ul class="liste-erreurs">' + Q.erreurs.map(function (q) {
      return '<li><div><strong lang="en">' + esc(q.en) + '</strong><span class="petit">' + esc(q.fr) + '</span></div>' + son(q.en, 'en', 'petit-son') + '</li>';
    }).join('') + '</ul></section>';
    h += '<button type="button" class="btn plein large" data-action="quiz-lancer" data-mode="' + Q.mode + '">Rejouer</button><a class="btn large" href="#/quiz?choix=1">Autre quiz</a><a class="btn sec large" href="#/cartes">' + ICO.cartes + 'Réviser mes cartes</a>';
    vue(h);
  }

  // ---------- Écoute (mains libres) ----------
  function listeEcoute(data, liste) {
    var m = data.id;
    if (liste === 'phrases') return data.phrases.slice();
    if (liste === 'difficiles') {
      var l = data.mots.concat(data.phrases).filter(function (x) { var c = S.cartes[AM.idCarte(m, x.id)]; return c && (c.erreurs > 0 || c.ef < 2.3); });
      return l;
    }
    return data.mots.slice();
  }
  function vueEcouter() {
    var m = metierActuel();
    cadre({ titre: 'Écouter · ' + m.court, nav: 'ecouter' });
    return chargerMetier(m.id).then(function (data) {
      if (!S.ecoute || S.ecoute.metier !== m.id) S.ecoute = { metier: m.id, liste: 'mots', i: 0, joue: false };
      var E = S.ecoute;
      if (!Voix.synthese) {
        vue('<section class="carte alerte"><h1>Lecture à voix haute indisponible</h1><p>Ce navigateur ne sait pas lire à voix haute. Essayez avec <b>Chrome</b> sur Android ou <b>Safari</b> sur iPhone.</p><p>En attendant, lisez la prononciation sous chaque mot.</p><a class="btn plein large" href="#/metier/' + m.id + '">Voir les mots et la prononciation</a></section>');
        return;
      }
      var items = listeEcoute(data, E.liste);
      if (E.i >= items.length) E.i = 0;
      var x = items[E.i], R = S.reglages;
      var h = '<div class="segment" role="radiogroup" aria-label="Que voulez-vous écouter ?">' + [['mots', 'Mots'], ['phrases', 'Phrases'], ['difficiles', 'Difficiles']].map(function (o) {
        return '<label><input type="radio" name="liste-ecoute" value="' + o[0] + '"' + (E.liste === o[0] ? ' checked' : '') + '><span>' + o[1] + '</span></label>';
      }).join('') + '</div>';
      if (!x) h += '<section class="carte centre"><p>Aucune carte difficile pour l\'instant. Bravo !</p><p class="petit">Les cartes ratées en révision apparaîtront ici.</p></section>';
      else {
        var phrase = x.id.charAt(0) === 'p';
        h += '<section class="carte lecteur" aria-live="polite"><p class="compteur">' + (E.i + 1) + ' / ' + items.length + '</p><p class="en-cours' + (phrase ? ' phrase' : '') + '" lang="en">' + esc(x.en) +
          '</p><p class="fr">' + esc(x.fr) + '</p><p class="pron">' + pronHTML(x.pron) + '</p>' +
          '<div class="controles"><button type="button" class="icone-btn" data-action="ecoute-avant" aria-label="Précédent">' + ICO.avant + '</button><button type="button" class="lire" data-action="ecoute-lire" aria-label="' +
          (E.joue ? 'Pause' : 'Lire') + '">' + (E.joue ? ICO.pause : ICO.lire) + '</button><button type="button" class="icone-btn" data-action="ecoute-apres" aria-label="Suivant">' + ICO.apres + '</button></div>' +
          '<p class="petit">' + (E.joue ? 'Lecture en continu… vous pouvez poser le téléphone.' : 'Touchez ▶ pour écouter toute la liste, en mains libres.') + '</p></section>';
      }
      h += '<section class="carte"><h2>Réglages de l\'écoute</h2><label class="interrupteur"><span>Dire aussi la traduction en français</span><input type="checkbox" data-reglage="ecouteTraduire"' + (R.ecouteTraduire ? ' checked' : '') +
        '></label><label class="interrupteur"><span>Répéter l\'anglais deux fois</span><input type="checkbox" data-reglage="ecouteRepeter"' + (R.ecouteRepeter ? ' checked' : '') + '></label>' +
        '<p style="margin:10px 0 4px;font-weight:700">Vitesse</p>' + segmentVitesse() + '</section>';
      vue(h);
    });
  }
  function segmentVitesse() {
    return '<div class="segment" role="radiogroup" aria-label="Vitesse">' + [[0.7, 'Lente'], [0.9, 'Normale'], [1.05, 'Rapide']].map(function (o) {
      return '<label><input type="radio" name="vitesse" value="' + o[0] + '"' + (Math.abs(S.reglages.vitesse - o[0]) < 0.01 ? ' checked' : '') + '><span>' + o[1] + '</span></label>';
    }).join('') + '</div>';
  }
  function ecouteJouer() {
    var E = S.ecoute, data = S.data[E.metier], items = listeEcoute(data, E.liste), x = items[E.i];
    if (!x) { E.joue = false; return vueEcouter(); }
    var R = S.reglages, morceaux = [{ texte: x.en, lang: R.accent, vitesse: R.vitesse, pause: 700 }];
    if (R.ecouteRepeter) morceaux.push({ texte: x.en, lang: R.accent, vitesse: R.vitesse, pause: 700 });
    if (R.ecouteTraduire) morceaux.push({ texte: sansParentheses(x.fr), lang: 'fr-FR', vitesse: 1, pause: 900 });
    if (arretVoix) arretVoix();
    arretVoix = Voix.suite(morceaux, { fin: function () {
      if (!S.ecoute || S.ecoute !== E || !E.joue) return;
      noterActivite('ecoute', 1);
      if (E.i + 1 >= items.length) { E.joue = false; E.i = 0; toast('Fin de la liste. Bravo !'); if (location.hash === '#/ecouter') vueEcouter(); return; }
      E.i++;
      if (location.hash === '#/ecouter') { vueEcouter().then(function () { if (E.joue) ecouteJouer(); }); }
      else E.joue = false;
    } });
  }

  // ---------- Oral ----------
  function vueParler() {
    var m = metierActuel();
    cadre({ titre: 'Parler · ' + m.court, nav: 'parler' });
    return chargerMetier(m.id).then(function (data) {
      if (!S.oral || S.oral.metier !== m.id) S.oral = { metier: m.id, sorte: 'phrases', i: 0, resultat: null };
      afficherOral(data);
    });
  }
  function afficherOral(data) {
    var O = S.oral, liste = O.sorte === 'mots' ? data.mots : data.phrases;
    if (O.i >= liste.length) O.i = 0;
    var x = liste[O.i], R = O.resultat, voix = Voix.reconnaissance && S.reglages.correctionVoix !== false;
    var h = '<div class="onglets" role="tablist"><button type="button" role="tab" aria-selected="' + (O.sorte === 'phrases') + '" data-action="oral-sorte" data-s="phrases">Phrases</button><button type="button" role="tab" aria-selected="' +
      (O.sorte === 'mots') + '" data-action="oral-sorte" data-s="mots">Mots</button></div>';
    h += '<section class="carte"><p class="q-type">Dites en anglais · ' + (O.i + 1) + ' / ' + liste.length + '</p><p class="q-aide" style="font-size:1.1rem;color:var(--text)">« ' + esc(x.fr) + ' »</p>';
    h += '<p class="oral-phrase" lang="en">' + (R ? R.mots.map(function (w) { return '<span class="m ' + (w.ok ? 'ok' : 'manque') + '">' + esc(w.mot) + '</span>'; }).join(' ') : esc(x.en)) + '</p>';
    h += '<p class="pron">' + pronHTML(x.pron) + '</p>';
    h += '<div style="display:flex;align-items:center;gap:12px;margin-top:12px">' + son(x.en, 'en', '', 'Écouter le modèle') + '<span>Écoutez le modèle, puis répétez.</span></div></section>';
    if (voix) {
      h += '<div class="micro"><button type="button" data-action="oral-micro" id="micro" aria-label="Parler maintenant">' + ICO.micro + '</button><span id="micro-etat" class="petit" role="status">' +
        (O.ecoute ? 'Je vous écoute… parlez maintenant.' : 'Touchez le micro et dites la phrase.') + '</span></div>';
    } else {
      h += '<section class="carte douce"><p>' + (Voix.reconnaissance ? 'Dites la phrase à voix haute, puis notez-vous.' : 'La correction automatique n\'est pas disponible sur ce navigateur. Dites la phrase à voix haute, puis notez-vous.') +
        '</p><div class="rang-btn"><button type="button" class="btn ok" data-action="oral-auto" data-r="bien">' + ICO.ok + 'Je l\'ai bien dit</button><button type="button" class="btn" data-action="oral-auto" data-r="encore">À retravailler</button></div></section>';
    }
    if (R) {
      var txt = { bien: 'Très bien !', presque: 'Presque ! Réécoutez les mots en orange.', encore: 'Réessayez : écoutez le modèle, puis parlez lentement.' }[R.verdict];
      h += '<div class="resultat-oral ' + R.verdict + '" role="status"><span class="score">' + R.score + ' %</span> · ' + txt + (R.entendu ? '<br><span class="petit">J\'ai entendu : « ' + esc(R.entendu) + ' »</span>' : '') + '</div>';
    }
    h += '<div class="rang-btn"><button type="button" class="btn" data-action="oral-nav" data-d="-1">Précédente</button><button type="button" class="btn plein" data-action="oral-nav" data-d="1">Suivante</button></div>';
    vue(h);
  }
  function oralMicro() {
    var O = S.oral;
    if (S.reglages.correctionVoix == null) {
      feuille('Correction par la voix', '<p>Pour vérifier ce que vous dites, le téléphone transforme votre voix en texte.</p><p><b>Sur beaucoup de téléphones, ce service passe par Internet</b> (Google ou Apple). L\'application, elle, n\'enregistre jamais votre voix.</p><div class="rang-btn"><button type="button" class="btn" data-action="voix-consentement" data-r="non">Non merci</button><button type="button" class="btn plein" data-action="voix-consentement" data-r="oui">J\'accepte</button></div>');
      return;
    }
    if (O.ecoute) { if (O.arret) O.arret(); return; }
    silence();
    var data = S.data[O.metier], liste = O.sorte === 'mots' ? data.mots : data.phrases, x = liste[O.i];
    O.ecoute = true; O.resultat = null;
    var b = $('#micro'), e = $('#micro-etat');
    if (b) b.classList.add('ecoute');
    if (e) e.textContent = 'Je vous écoute… parlez maintenant.';
    var recu = null;
    O.arret = Voix.ecouter({ lang: S.reglages.accent, resultat: function (alts) { recu = alts; }, erreur: function (code) {
      O.ecoute = false;
      var msg = code === 'not-allowed' || code === 'service-not-allowed' ? 'Autorisez le micro pour cette page dans les réglages du navigateur.' :
        code === 'network' ? 'La correction par la voix demande Internet sur ce téléphone.' : code === 'no-speech' ? 'Je n\'ai rien entendu. Rapprochez le téléphone et réessayez.' : 'Le micro n\'a pas marché. Réessayez.';
      toast(msg);
    }, fin: function () {
      O.ecoute = false; O.arret = null;
      if (S.oral !== O || location.hash !== '#/parler') return;
      if (recu && recu.length) { O.resultat = AM.meilleureComparaison(x.en, recu); noterActivite('oral', 1); }
      afficherOral(data);
    } });
  }

  // ---------- Progrès ----------
  function vueProgres() {
    cadre({ titre: 'Ma progression', retour: '#/', nav: 'accueil' });
    var j = aujourdhui(), serie = AM.serie(S.jours, j), best = Math.max(serie, AM.meilleureSerie(S.jours));
    var total = 0, quiz = 0;
    Object.keys(S.jours).forEach(function (k) { total += S.jours[k].cartes | 0; quiz += S.jours[k].quiz | 0; });
    var h = '<section class="carte"><div class="chiffres"><div><strong>' + serie + '</strong><span>jours de suite</span></div><div><strong>' + best + '</strong><span>record</span></div><div><strong>' + total +
      '</strong><span>cartes revues</span></div></div><h2 style="margin-top:14px">Les 4 dernières semaines</h2><div class="calendrier">';
    var debut = AM.ajouterJours(j, -27), noms = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    for (var k = 0; k < 7; k++) h += '<span class="jour-nom" aria-hidden="true">' + noms[new Date(AM.ajouterJours(debut, k).replace(/-/g, '/')).getDay()] + '</span>';
    for (k = 0; k < 28; k++) {
      var d = AM.ajouterJours(debut, k), fait = AM.pointsJour(S.jours[d]) > 0;
      h += '<span class="' + (fait ? 'fait' : '') + (d === j ? ' aujourdhui' : '') + '" title="' + AM.dateFr(d) + (fait ? ' : travaillé' : '') + '">' + (+d.slice(8)) + '</span>';
    }
    h += '</div><p class="petit">Un jour compte dès que vous faites une carte, un quiz, une écoute ou un essai à l\'oral. ' + quiz + ' quiz faits en tout.</p></section>';
    h += '<section class="carte"><h2>Par métier</h2><ul class="mots-liste">' + S.index.map(function (m) {
      var nb = 0, appris = 0;
      Object.keys(S.cartes).forEach(function (key) { var c = S.cartes[key]; if (c.metier === m.id) { nb++; if (c.rep >= 2) appris++; } });
      if (!nb && !ouvert(m.id)) return '';
      var t = m.mots + m.phrases;
      return '<li><span class="emoji" style="font-size:26px" aria-hidden="true">' + m.emoji + '</span><div class="t"><strong>' + esc(m.court) + '</strong><small>' + appris + ' appris sur ' + t + (nb ? ' · ' + nb + ' vus' : '') +
        '</small><div class="barre" style="height:8px;margin-top:4px"><i class="ok" style="width:' + Math.round(appris * 100 / t) + '%"></i></div></div></li>';
    }).join('') + '</ul></section>';
    vue(h);
  }

  // ---------- Réglages ----------
  function vueReglages() {
    cadre({ titre: 'Réglages', retour: '#/', nav: 'reglages' });
    var R = S.reglages, e = etat(), m = metierInfo(S.profil.metierGratuit);
    var radio = function (nom, opts, val) {
      return '<div class="segment" role="radiogroup">' + opts.map(function (o) {
        return '<label><input type="radio" name="' + nom + '" value="' + o[0] + '"' + (String(val) === String(o[0]) ? ' checked' : '') + '><span>' + o[1] + '</span></label>';
      }).join('') + '</div>';
    };
    var h = '<section class="carte"><h2>Voix anglaise</h2>' + radio('accent', [['en-GB', 'Britannique'], ['en-US', 'Américain']], R.accent);
    if (Voix.synthese && Voix.voix().length && !Voix.accentDisponible(R.accent)) h += '<p class="petit">Cet accent n\'est pas installé sur ce téléphone : une autre voix anglaise sera utilisée.</p>';
    if (!Voix.synthese) h += '<p class="petit">Ce navigateur ne lit pas à voix haute. Essayez Chrome (Android) ou Safari (iPhone).</p>';
    h += '<p style="margin:10px 0 4px;font-weight:700">Vitesse</p>' + segmentVitesse() + '<button type="button" class="btn sec large" data-action="dire" data-texte="Welcome! How can I help you?" data-lang="en">' + ICO.son + 'Essayer la voix</button></section>';
    h += '<section class="carte"><h2>Cartes mémoire</h2><p style="margin:0 0 4px;font-weight:700">Nouvelles cartes par jour</p>' + radio('nouvelles', [[5, '5'], [10, '10'], [15, '15'], [20, '20']], R.nouvelles) +
      '<p style="margin:0 0 4px;font-weight:700">Sens des cartes</p>' + radio('sens', [['en-fr', 'Anglais → français'], ['fr-en', 'Français → anglais'], ['mix', 'Mélange']], R.sens) +
      '<label class="interrupteur"><span>Dire l\'anglais automatiquement</span><input type="checkbox" data-reglage="auto"' + (R.auto ? ' checked' : '') + '></label>' +
      '<p style="margin:10px 0 4px;font-weight:700">Objectif du jour</p>' + radio('objectif', [[10, '10 points'], [20, '20 points'], [40, '40 points']], R.objectif) +
      '<p class="petit">1 point par carte, 5 par quiz, 1 par écoute ou essai à l\'oral.</p></section>';
    h += '<section class="carte"><h2>Oral</h2><label class="interrupteur"><span>Correction par la voix' + (Voix.reconnaissance ? '' : ' (indisponible ici)') + '</span><input type="checkbox" data-reglage="correctionVoix"' +
      (R.correctionVoix ? ' checked' : '') + (Voix.reconnaissance ? '' : ' disabled') + '></label><p class="petit">Le téléphone transforme votre voix en texte pour la comparer à la phrase. Sur beaucoup de téléphones, ce service passe par Internet (Google ou Apple). L\'application n\'enregistre jamais votre voix.</p></section>';
    h += '<section class="carte"><h2>Affichage</h2>' + radio('theme', [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']], R.theme) + '</section>';
    h += '<section class="carte"><ul class="menu">' +
      '<li><a href="#/pass">' + ICO.etoile + '<span class="t"><strong>Pass 10 métiers</strong><small>' + (e.premium ? 'Actif jusqu\'au ' + AM.dateFr(e.fin.slice(0, 10)) : e.expire ? 'Terminé : vos progrès sont gardés' : 'Version gratuite : 1 métier') + '</small></span></a></li>' +
      '<li><a href="#/bienvenue?changer=1">' + ICO.echange + '<span class="t"><strong>Métier gratuit</strong><small>' + esc(m ? m.nom : '') + (AM.peutChangerMetierGratuit(S.profil) ? ' · vous pouvez en changer une fois' : ' · déjà changé une fois') + '</small></span></a></li>' +
      '<li><a href="#/progres">' + ICO.progres + '<span class="t"><strong>Ma progression</strong><small>Série, calendrier, métiers</small></span></a></li>' +
      '<li><a href="#/sauvegarde">' + ICO.sauvegarde + '<span class="t"><strong>Sauvegarde</strong><small>' + (S.sauvegarde ? 'Dernière : ' + AM.dateFr(S.sauvegarde.slice(0, 10)) : 'Aucune sauvegarde pour l\'instant') + '</small></span></a></li>' +
      '<li><a href="#/aide">' + ICO.livre + '<span class="t"><strong>Lire la prononciation</strong><small>Comment lire les aides « WÈL-keum »</small></span></a></li>' +
      (peutInstaller() ? '<li><button type="button" data-action="installer">' + ICO.installer + '<span class="t"><strong>Installer l\'application</strong><small>Une icône sur l\'écran d\'accueil</small></span></button></li>' : '') +
      '</ul></section>';
    h += '<p class="pied">Anglais du Métier ' + VERSION + ' · contenu original Teranga · vos données restent sur ce téléphone.<br>Seule l\'activation du pass utilise Internet, une seule fois.</p>';
    vue(h);
  }
  function changerReglage(nom, valeur) {
    var R = S.reglages;
    if (nom === 'vitesse' || nom === 'nouvelles' || nom === 'objectif') valeur = Number(valeur);
    if (nom === 'correctionVoix' && valeur === true && R.correctionVoix !== true) toast('Correction par la voix activée.');
    R[nom] = valeur;
    if (nom === 'theme') appliquerTheme(valeur);
    if (nom === 'nouvelles' || nom === 'sens') S.seance = null;
    sauver('reglages', R);
    if (nom === 'accent' && location.hash === '#/reglages') vueReglages();
  }
  function appliquerTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    try { if (t === 'light' || t === 'dark') localStorage.setItem('anglais-theme', t); else localStorage.removeItem('anglais-theme'); } catch (e) {}
  }

  // ---------- Aide prononciation ----------
  function vueAide() {
    cadre({ titre: 'Lire la prononciation', retour: S.profil ? '#/reglages' : '#/bienvenue', nav: 'reglages' });
    var lignes = [['MAJUSCULES', 'la syllabe à dire plus fort', 'WÈL-keum (welcome)'], ['th', 'langue entre les dents, on souffle', 'thangk you (thank you)'],
      ['dh', 'langue entre les dents, avec la voix', 'dheu (the)'], ['h', 'on souffle, comme pour réchauffer ses mains', 'hèlp (help)'],
      ['w', 'comme dans « watt » ou en wolof', 'wéït (wait)'], ['y', 'comme dans « yaourt »', 'yôr (your)'], ['eu', 'son faible et court', 'eu-BAOUT (about)'],
      ['ii', 'i long', 'kii (key)'], ['ô, â', 'voyelle longue', 'fôn (phone), kâr (car)'], ['éï, aï', 'comme « paye », « ail »', 'déï (day), naït (night)'],
      ['nn', 'on entend le n (pas de son nasal)', 'kann (can)'], ['r', 'r anglais, sans le rouler', 'roum (room)']];
    var h = '<section class="carte"><p>Sous chaque mot, une <b>aide de prononciation</b> écrite comme on lit en français. Elle aide à démarrer ; la voix du téléphone donne le vrai son.</p><ul class="mots-liste">' +
      lignes.map(function (l) { return '<li><div class="t"><strong>' + esc(l[0]) + '</strong><small>' + esc(l[1]) + '</small><span class="p">' + esc(l[2]) + '</span></div></li>'; }).join('') + '</ul></section>';
    h += '<section class="carte"><h2>Comment marchent les cartes ?</h2><p>Après chaque carte, dites si vous saviez : <b>Raté</b>, <b>Difficile</b>, <b>Bien</b> ou <b>Facile</b>. L\'application calcule quand vous la remontrer : le lendemain, puis 6 jours plus tard, puis de plus en plus loin. Vous révisez au bon moment, juste avant d\'oublier (méthode de répétition espacée « SM-2 »).</p></section>';
    vue(h);
  }

  // ---------- Pass ----------
  function avantages() {
    return ['Les 10 métiers : 600 mots et 250 phrases', 'Cartes, quiz, écoute et oral pour chaque métier', 'Vos progrès gardés, même après la fin du pass', 'Tout marche sans Internet']
      .map(function (x) { return '<li>' + ICO.ok + '<span>' + esc(x) + '</span></li>'; }).join('');
  }
  function vuePass(_, params) {
    cadre({ titre: 'Pass 10 métiers', retour: S.profil ? '#/reglages' : '#/bienvenue', nav: 'reglages' });
    var e = etat(), pre = params.get('code') || '';
    var h = '';
    if (e.premium) {
      h += '<section class="carte statut-pass"><span class="gros-emoji emoji" aria-hidden="true">⭐</span><div><small class="petit">Pass actif</small><strong>Les 10 métiers sont ouverts</strong><span class="petit">Jusqu\'au ' +
        AM.dateLongue(e.fin.slice(0, 10)) + ' (' + e.joursRestants + ' jours)</span></div></section>';
      if (e.rappel) h += '<section class="carte alerte"><p>Votre pass se termine bientôt. Renouvelez maintenant : les jours restants s\'ajoutent.</p><a class="btn accent large" href="' + AM.urlProduit() + '" target="_blank" rel="noopener">' + ICO.boutique + 'Renouveler (' + PRIX + ')</a></section>';
      h += '<a class="btn plein large" href="#/metiers">Choisir un métier</a>';
    } else {
      if (e.expire) h += '<section class="carte alerte"><p>Votre pass s\'est terminé le ' + AM.dateLongue(e.fin.slice(0, 10)) + '. Vos progrès sont gardés.</p></section>';
      h += '<section class="carte"><h1>Le pass 10 métiers</h1><ul class="atouts">' + avantages() + '</ul><p class="prix">' + PRIX + ' <small>pour 12 mois, paiement Wave</small></p>' +
        '<a class="btn plein large" href="' + AM.urlProduit() + '" target="_blank" rel="noopener">' + ICO.boutique + 'Acheter le pass</a></section>';
    }
    h += '<form class="carte" data-form="pass"><h2>' + (e.premium ? 'Ajouter un pass (renouvellement)' : 'Activer mon pass') + '</h2><ol class="etapes"><li>Achetez le pass dans la boutique Teranga et payez par Wave.</li>' +
      '<li>Sur la page de votre commande payée, copiez le lien de la page.</li><li>Collez-le ici puis touchez « Activer ».</li></ol>' +
      '<div class="champ"><label for="c-code">Lien de votre commande</label><textarea id="c-code" name="code" rows="3" placeholder="https://…/boutique/commande.html?o=TCV-…&amp;t=…" autocomplete="off" autocapitalize="off" spellcheck="false">' + esc(pre) + '</textarea></div>' +
      '<p class="msg" id="msg-pass" role="status" aria-live="polite"></p><button type="submit" class="btn plein large" id="btn-activer">' + ICO.etoile + 'Activer</button>' +
      '<p class="petit">Internet est nécessaire une seule fois, pour vérifier la commande. Ensuite tout marche hors ligne.</p></form>';
    if (S.passes.length) h += '<section class="carte"><h2>Mes passes</h2>' + S.passes.map(function (p) {
      return '<p class="petit">Payé le ' + AM.dateFr(p.payeeLe.slice(0, 10)) + ' · commande ' + esc(String(p.id).replace(/^(TCV-....).*/, '$1••••')) + '</p>';
    }).join('') + '</section>';
    vue(h);
    if (pre) activer(pre);
  }
  function activer(texte) {
    var msg = $('#msg-pass'), btn = $('#btn-activer');
    var dire = function (m, cls) { if (msg) { msg.textContent = m; msg.className = 'msg' + (cls ? ' ' + cls : ''); } };
    var c = AM.lireLienCommande(texte);
    if (!c) return dire('Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « TCV- »).', 'erreur');
    if (navigator.onLine === false) return dire('Vous êtes hors ligne. Connectez-vous à Internet une fois pour activer.', 'erreur');
    dire('Vérification de votre commande…');
    if (btn) btn.disabled = true;
    fetch(AM.urlVerification(c), { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (r.status === 404) throw { m: 'Commande introuvable. Vérifiez que vous avez copié le lien complet.' };
      if (!r.ok) throw { m: 'Le service de vérification ne répond pas. Réessayez dans un instant.' };
      return r.json();
    }).then(function (j) {
      var a = AM.analyserReponse(j);
      if (!a.ok) {
        if (a.raison === 'impayee') throw { m: 'Le paiement de cette commande n\'est pas encore confirmé. Terminez le paiement Wave, attendez la confirmation, puis réessayez.' };
        if (a.raison === 'produit') throw { m: 'Ce lien correspond à un autre achat' + (a.titre ? ' (« ' + a.titre + ' »)' : '') + '. Il faut le lien de la commande « Pass Anglais du Métier ».' };
        if (a.raison === 'expiree') throw { m: 'Ce pass a pris fin le ' + AM.dateLongue(a.fin.slice(0, 10)) + '. Prenez un nouveau pass pour continuer.' };
        throw { m: 'Commande introuvable.' };
      }
      S.passes = AM.ajouterPass(S.passes, a.pass);
      return sauver('passes', S.passes).then(function () {
        demanderPersistance();
        toast('Pass activé : les 10 métiers sont ouverts !');
        history.replaceState(null, '', location.pathname + '#/pass');
        vuePass(null, new URLSearchParams());
      });
    }).catch(function (e) {
      if (btn) btn.disabled = false;
      dire(e && e.m ? e.m : 'Pas de connexion au service. Vérifiez Internet et réessayez.', 'erreur');
    });
  }

  // ---------- Sauvegarde ----------
  function vueSauvegarde() {
    cadre({ titre: 'Sauvegarde', retour: S.profil ? '#/reglages' : '#/bienvenue', nav: 'reglages' });
    var h = '';
    if (S.profil) h += '<section class="carte"><h2>Sauvegarder mes progrès</h2><p>Un petit fichier avec vos cartes, votre série et vos réglages. Gardez-le (WhatsApp à vous-même, Drive…) pour tout retrouver sur un nouveau téléphone.</p>' +
      '<p class="petit">' + (S.sauvegarde ? 'Dernière sauvegarde : ' + AM.dateFr(S.sauvegarde.slice(0, 10)) : 'Aucune sauvegarde pour l\'instant.') + '</p>' +
      '<button type="button" class="btn plein large" data-action="exporter">' + ICO.telecharger + 'Télécharger la sauvegarde</button></section>';
    h += '<section class="carte"><h2>Restaurer une sauvegarde</h2><p>Remplace les progrès de ce téléphone par ceux du fichier choisi.</p><label class="btn sec large" for="f-import">' + ICO.sauvegarde +
      'Choisir le fichier</label><input type="file" id="f-import" class="vh" accept=".json,application/json"></section>';
    if (S.profil) h += '<section class="carte"><h2>Tout effacer</h2><p class="petit">Efface vos progrès de ce téléphone (votre pass reste actif).</p><button type="button" class="btn danger large" data-action="tout-effacer">' + ICO.poubelle + 'Tout effacer</button></section>';
    vue(h);
  }
  function telecharger(blob, nom) {
    var a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = nom; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1500);
  }
  function exporter() {
    var d = { application: 'teranga-anglais', version: 1, exporte: new Date().toISOString(),
      kv: { profil: S.profil, reglages: S.reglages, jours: S.jours, historique: S.historique },
      cartes: Object.keys(S.cartes).map(function (k) { return S.cartes[k]; }) };
    telecharger(new Blob([JSON.stringify(d)], { type: 'application/json' }), 'anglais-du-metier-sauvegarde-' + aujourdhui() + '.json');
    S.sauvegarde = new Date().toISOString();
    sauver('sauvegarde', S.sauvegarde).then(function () { toast('Sauvegarde téléchargée.'); if (location.hash === '#/sauvegarde') vueSauvegarde(); });
  }
  function importer(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var d;
      try { d = JSON.parse(lecteur.result); } catch (e) { return toast('Fichier illisible : ce n\'est pas une sauvegarde Anglais du Métier.'); }
      if (!d || d.application !== 'teranga-anglais' || !Array.isArray(d.cartes) || !d.kv) return toast('Ce fichier n\'est pas une sauvegarde Anglais du Métier.');
      confirmer('Remplacer les progrès de ce téléphone par la sauvegarde du ' + AM.dateFr(String(d.exporte || '').slice(0, 10)) + ' (' + d.cartes.length + ' cartes) ?', 'Restaurer', true).then(function (oui) {
        if (!oui) return;
        var kv = {};
        ['profil', 'reglages', 'jours', 'historique'].forEach(function (k) { if (d.kv[k] != null) kv[k] = d.kv[k]; });
        DB.remplacer({ cartes: d.cartes.filter(function (c) { return c && typeof c.id === 'string'; }), kv: kv }, ['passes', 'sauvegarde']).then(charger).then(function () {
          S.seance = S.quiz = S.ecoute = S.oral = null;
          appliquerTheme(S.reglages.theme);
          toast('Sauvegarde restaurée.'); aller('#/');
        }).catch(function (e) { toast('Restauration impossible : ' + (e && e.message || e)); });
      });
    };
    lecteur.readAsText(fichier);
  }

  // ---------- Installation ----------
  var invite = null;
  function estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function estInstallee() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function peutInstaller() { return !estInstallee() && (!!invite || estIOS()); }
  function majInstall() { var b = $('#installer'); if (b) b.hidden = !peutInstaller(); }
  function aideIOS() { return '<ol class="etapes installer-ios"><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez <b>Partager</b> (carré avec une flèche vers le haut).</li><li>Choisissez <b>« Sur l\'écran d\'accueil »</b>, puis <b>Ajouter</b>.</li></ol>'; }
  function carteInstallation() {
    if (!peutInstaller()) return '';
    return '<section class="carte douce"><h2>Installez l\'application</h2><p>Une icône sur votre écran d\'accueil, et l\'appli s\'ouvre même sans Internet.</p>' +
      (estIOS() && !invite ? aideIOS() : '<button type="button" class="btn plein large" data-action="installer">' + ICO.installer + 'Installer</button>') + '</section>';
  }
  function installer() {
    if (invite) {
      invite.prompt();
      Promise.resolve(invite.userChoice).then(function () { invite = null; majInstall(); });
      return;
    }
    if (estIOS()) feuille('Installer sur iPhone', aideIOS());
  }

  // ---------- Actions ----------
  var ACTIONS = {
    'choisir-gratuit': function (el) { choisirGratuit(el.dataset.id); },
    'ouvrir-metier': function (el) { ouvrirMetier(el.dataset.id); },
    'onglet-metier': function (el) { var id = location.hash.match(/metier\/([a-z]+)/); if (id) location.replace('#/metier/' + id[1] + '?o=' + el.dataset.o); },
    dire: function (el) { parler(el.dataset.texte, el.dataset.lang, el.classList.contains('son') ? el : null); },
    reveler: function () { if (S.seance) { S.seance.revele = true; afficherCarte(S.data[S.seance.metier]); var b = $('.notes4 .n-bien'); if (b) b.focus(); } },
    noter: function (el) { noter(el.dataset.note); },
    'encore-cartes': function () { aller('#/cartes?plus=1'); },
    'quiz-lancer': function (el) { history.replaceState(null, '', '#/quiz'); lancerQuiz(el.dataset.mode); },
    repondre: function (el) { repondre(+el.dataset.k); },
    'question-suivante': function () { silence(); S.quiz.i++; S.quiz.repondu = -1; afficherQuestion(); },
    'ecoute-lire': function () {
      var E = S.ecoute; if (!E) return;
      if (E.joue) { E.joue = false; silence(); vueEcouter(); return; }
      E.joue = true; vueEcouter().then(ecouteJouer);
    },
    'ecoute-avant': function () { var E = S.ecoute; E.i = Math.max(0, E.i - 1); var j = E.joue; silence(); vueEcouter().then(function () { if (j) ecouteJouer(); }); },
    'ecoute-apres': function () {
      var E = S.ecoute, n = listeEcoute(S.data[E.metier], E.liste).length; E.i = (E.i + 1) % Math.max(1, n);
      var j = E.joue; silence(); vueEcouter().then(function () { if (j) ecouteJouer(); });
    },
    'oral-sorte': function (el) { S.oral.sorte = el.dataset.s; S.oral.i = 0; S.oral.resultat = null; afficherOral(S.data[S.oral.metier]); },
    'oral-nav': function (el) {
      var O = S.oral, data = S.data[O.metier], n = (O.sorte === 'mots' ? data.mots : data.phrases).length;
      if (O.arret) O.arret();
      O.i = (O.i + (+el.dataset.d) + n) % n; O.resultat = null; silence(); afficherOral(data);
    },
    'oral-micro': oralMicro,
    'oral-auto': function (el) {
      var O = S.oral, data = S.data[O.metier], x = (O.sorte === 'mots' ? data.mots : data.phrases)[O.i];
      noterActivite('oral', 1);
      O.resultat = el.dataset.r === 'bien' ? { score: 100, verdict: 'bien', mots: x.en.split(/\s+/).map(function (w) { return { mot: w, ok: true }; }) } : null;
      if (el.dataset.r === 'bien') { O.i = (O.i + 1) % (O.sorte === 'mots' ? data.mots : data.phrases).length; O.resultat = null; toast('Bravo ! Phrase suivante.'); }
      else toast('Réécoutez le modèle et réessayez.');
      afficherOral(data);
    },
    'voix-consentement': function (el) {
      S.reglages.correctionVoix = el.dataset.r === 'oui';
      sauver('reglages', S.reglages);
      fermerFeuille();
      afficherOral(S.data[S.oral.metier]);
      if (S.reglages.correctionVoix) oralMicro();
    },
    exporter: exporter,
    'tout-effacer': function () {
      confirmer('Effacer tous vos progrès de ce téléphone ? Faites d\'abord une sauvegarde si besoin.', 'Tout effacer', true).then(function (oui) {
        if (!oui) return;
        DB.toutEffacer(['passes']).then(charger).then(function () { S.seance = S.quiz = S.ecoute = S.oral = null; toast('Progrès effacés.'); aller('#/bienvenue'); });
      });
    },
    installer: installer,
    retour: function (el) { var c = el.dataset.cible; if (c) location.hash = c; }
  };

  function brancher() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      var f = ACTIONS[el.dataset.action];
      if (f) { e.preventDefault(); f(el, e); }
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el.id === 'f-import' && el.files && el.files[0]) { importer(el.files[0]); el.value = ''; return; }
      if (el.dataset.reglage) { changerReglage(el.dataset.reglage, el.checked); return; }
      if (el.type === 'radio') {
        if (el.name === 'liste-ecoute') { silence(); S.ecoute.liste = el.value; S.ecoute.i = 0; S.ecoute.joue = false; vueEcouter(); return; }
        if (['accent', 'vitesse', 'nouvelles', 'sens', 'objectif', 'theme'].indexOf(el.name) >= 0) changerReglage(el.name, el.value);
      }
    });
    document.addEventListener('submit', function (e) {
      var f = e.target;
      if (f.dataset.form === 'pass') { e.preventDefault(); activer(f.code.value); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && feuilleOuverte) { fermerFeuille(); return; }
      if (location.hash !== '#/cartes' || !S.seance || feuilleOuverte || /input|textarea/i.test(e.target.tagName)) return;
      if (!S.seance.revele && (e.key === ' ' || e.key === 'Enter') && e.target.tagName !== 'BUTTON') { e.preventDefault(); ACTIONS.reveler(); }
      else if (S.seance.revele && /^[1-4]$/.test(e.key)) noter(['rate', 'difficile', 'bien', 'facile'][+e.key - 1]);
    });
    $('#retour').addEventListener('click', function () { ACTIONS.retour(this); });
    $('#installer').addEventListener('click', installer);
    window.addEventListener('hashchange', router);
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; majInstall(); });
    window.addEventListener('appinstalled', function () { invite = null; majInstall(); toast('Application installée.'); });
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
    brancher();
    // Lien d'activation direct : ?o=TCV-…&t=… (depuis la page de commande)
    var p = new URLSearchParams(location.search);
    if (p.get('o') && p.get('t')) {
      var code = '?o=' + p.get('o') + '&t=' + p.get('t');
      history.replaceState(null, '', location.pathname + '#/pass?code=' + encodeURIComponent(code));
    }
    charger().then(function () {
      appliquerTheme(S.reglages.theme);
      router();
    }).catch(function (e) {
      vue('<section class="carte alerte rouge"><h1>Démarrage impossible</h1><p>' + esc(e && e.message || e) + '</p><p>Sur iPhone, quittez la navigation privée. Sinon, mettez à jour votre navigateur.</p></section>');
    });
    serviceWorker();
  }
  window.AMApp = { etat: S, version: VERSION };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
