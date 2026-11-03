/* Chantier Clair — écrans : mes chantiers, nouveau chantier, liens à partager, tableau de bord de la personne qui paie
   (résumé, argent, photos, historique), vue du chef de chantier, vue du témoin, pass, réglages.
   Les liens du chef et du témoin marchent sans installation ; tout reste lisible sans réseau. */
(function () {
  'use strict';
  var CC = window.CC, DB = window.DB, R = window.RES, PH = window.PHOTO;
  var VERSION = '1.0.0';
  var BOUTIQUE = '../../boutique/';
  var NOTICE = 'Chantier Clair garde une trace datée et chaînée de chaque action. Les montants sont déclarés par chacun : l\'application ne transfère jamais d\'argent.';
  var S = { chantiers: [], liens: [], file: [], pass: null, reglages: { theme: 'auto' }, creations: 0, verif: {}, toutVoir: {} };
  var V = { nom: '', args: [] };
  var minuterie = null, invite = null, swAttente = null, feuilleEtat = null, dernierFocus = null;

  // ---------- Outils ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Typographie française à l'écran : espace insécable avant « : ; ? ! » et à l'intérieur des guillemets
  function fr(h) { return h.replace(/ ([:;?!»])/g, ' $1').replace(/« /g, '« '); }
  function svg(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + p + '</svg>'; }
  var ICO = {
    maison: svg('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    etoile: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>'),
    reglages: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    photo: svg('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>'),
    galerie: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
    note: svg('<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    truelle: svg('<path d="M3 21l7-7"/><path d="M9 10l5 5 7-7-5-5z"/>'),
    briques: svg('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 10h18M3 14.5h18M9 5v5M15 5v5M12 10v4.5M6 14.5V19M18 14.5V19"/>'),
    argent: svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9.5v5M18 9.5v5"/>'),
    recu: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 15.5h3"/>'),
    panier: svg('<path d="M3 5h2l2 11h11l2-8H7"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>'),
    question: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.5"/>'),
    valider: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>'),
    oeil: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    drapeau: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    envoi: svg('<path d="M4 12h12M12 6l6 6-6 6"/><path d="M20 4v16"/>'),
    ok: svg('<path d="m5 12.5 4.5 4.5L19 7"/>'),
    alerte: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>'),
    partager: svg('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>'),
    copier: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    message: svg('<path d="M4 20l1.3-3.9A8 8 0 1 1 8.2 19z"/><path d="M9 10.5h6M9 13.5h4"/>'),
    pdf: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    bouclier: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
    actualiser: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
    telecharger: svg('<path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16"/>'),
    installer: svg('<path d="M12 3v11m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="4" rx="1"/>'),
    horsligne: svg('<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.3-2.5M19 12.9a10 10 0 0 0-2-1.5M2 9a15 15 0 0 1 4.2-2.6M22 9a15 15 0 0 0-9.8-3.9"/><circle cx="12" cy="20" r=".8"/>'),
    horloge: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    fleche: svg('<path d="m9 6 6 6-6 6"/>'),
    lien: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    personne: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>'),
    crayon: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
    poubelle: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    fermer: svg('<path d="M6 6l12 12M18 6 6 18"/>')
  };
  var ICO_EV = { creation: 'maison', modification: 'crayon', validation: 'valider', question: 'question', note: 'note', versement_declare: 'envoi', cloture: 'drapeau',
    avancement: 'truelle', preuve: 'photo', demande_materiaux: 'panier', depense: 'recu', constat: 'oeil' };

  function toast(msg, ms, action) {
    var t = $('#toast');
    t.innerHTML = '<span>' + fr(esc(msg)) + '</span>' + (action ? '<button type="button" class="toast-btn">' + esc(action.libelle) + '</button>' : '');
    t.hidden = false;
    if (action) $('.toast-btn', t).addEventListener('click', function () { t.hidden = true; action.faire(); });
    clearTimeout(toast.m);
    toast.m = setTimeout(function () { t.hidden = true; }, ms || 3800);
  }
  function afficher(html) { $('#vue').innerHTML = fr(html); }
  function sauverChantier(c) { return DB.mettre('chantiers', c); }
  function sauverLien(l) { return DB.mettre('liens', l); }
  function sauverKv(k, v) { return DB.mettre('kv', v, k); }
  function premium() { return !!(S.pass && S.pass.valide); }
  function base() { return CC.baseApp(location); }
  function enLigne() { return navigator.onLine !== false; }
  function chantierPar(id) { for (var i = 0; i < S.chantiers.length; i++) if (S.chantiers[i].id === id) return S.chantiers[i]; return null; }
  function lienPar(role, id) { for (var i = 0; i < S.liens.length; i++) if (S.liens[i].cle === role + ':' + id) return S.liens[i]; return null; }
  function pendants(id) { return S.file.filter(function (it) { return it.dossier === id; }); }
  function montant(n) { return '<span class="nw">' + esc(CC.formatF(n)) + '</span>'; }
  function aujourdhui() { return CC.cleJour(Date.now()); }
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
  function appliquerTheme() {
    var t = S.reglages.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('chantierclair-theme', t || 'auto'); } catch (e) { /* stockage bloqué */ }
  }

  // ---------- Feuille (fenêtre du bas) ----------
  function ouvrirFeuille(html, etat) {
    var f = $('#feuille');
    if (!f.hidden) libererApercus();
    dernierFocus = document.activeElement;
    feuilleEtat = etat || {};
    $('.feuille-contenu', f).innerHTML = '<button type="button" class="feuille-fermer" data-action="fermer-feuille" aria-label="Fermer">' + ICO.fermer + '</button>' + fr(html);
    f.hidden = false;
    document.body.classList.add('feuille-ouverte');
    var h = $('.feuille-contenu h2', f);
    if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
  }
  function libererApercus() { if (feuilleEtat && feuilleEtat.photos) feuilleEtat.photos.forEach(function (p) { URL.revokeObjectURL(p.url); }); }
  function fermerFeuille() {
    var f = $('#feuille');
    if (f.hidden) return;
    libererApercus();
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
    Promise.all([DB.tout('chantiers'), DB.tout('liens'), R.liste(), DB.lire('kv', 'pass'), DB.lire('kv', 'reglages'), DB.lire('kv', 'creations'), DB.persistant()])
      .then(function (r) {
        S.chantiers = r[0] || []; S.liens = r[1] || []; S.file = r[2] || []; S.pass = r[3] || null;
        if (r[4]) S.reglages = Object.assign(S.reglages, r[4]);
        S.creations = +r[5] || 0;
        appliquerTheme();
        if (!r[6]) setTimeout(function () { toast('Mode privé : rien ne sera gardé sur ce téléphone après fermeture.', 6000); }, 800);
        R.ecouter(surFile);
        window.addEventListener('hashchange', router);
        window.addEventListener('online', majReseau); window.addEventListener('offline', majReseau);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) actualiserVue(); });
        router(); majReseau(); installation(); enregistrerSW(); verifierPassRoutine();
        R.vider().catch(function () {});
      });
  }
  function majReseau() {
    var p = $('#reseau');
    var n = S.file.filter(function (it) { return it.etat === 'attente'; }).length;
    if (!enLigne()) { p.hidden = false; p.className = 'pastille'; p.innerHTML = ICO.horsligne + 'Hors ligne' + (n ? ' · ' + n : ''); }
    else if (n) { p.hidden = false; p.className = 'pastille attente'; p.innerHTML = ICO.horloge + n + ' en attente'; }
    else p.hidden = true;
  }
  function surFile(bilan) {
    R.liste().then(function (l) {
      S.file = l; majReseau();
      if (!bilan) return;
      var ids = {};
      bilan.envoyes.forEach(function (it) { ids[it.dossier] = it; });
      if (bilan.envoyes.some(function (it) { return Date.now() - it.creeLe > 20000; })) toast('Actions en attente envoyées ✓');
      if (bilan.refuses.length) toast('Une action a été refusée par le serveur : voyez le bandeau rouge.', 6000);
      return Promise.all(Object.keys(ids).map(function (id) { return rafraichirDossier(id, ids[id].role, ids[id].jeton).catch(function () {}); })).then(rendreSiDossier);
    });
  }
  function rendreSiDossier() { if (V.nom === 'chantier' || V.nom === 'chef' || V.nom === 'temoin' || V.nom === 'accueil') rendre(true); }

  // ---------- Routeur ----------
  function router() {
    fermerFeuille();
    var h = location.hash.replace(/^#\/?/, ''), p = h.split('/').filter(Boolean);
    var nom = p[0] || 'accueil', args = p.slice(1);
    var connus = { accueil: 1, nouveau: 1, partager: 1, chantier: 1, proprio: 1, chef: 1, temoin: 1, pass: 1, reglages: 1 };
    if (!connus[nom]) nom = 'accueil';
    V = { nom: nom, args: args };
    document.body.classList.toggle('vue-role', nom === 'chef' || nom === 'temoin');
    majInstall();
    $$('#nav a').forEach(function (a) {
      var actif = a.getAttribute('data-nav') === nom || ((nom === 'chantier' || nom === 'partager') && a.getAttribute('data-nav') === 'accueil');
      a.classList.toggle('actif', actif);
      if (actif) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    clearInterval(minuterie);
    if (nom === 'chantier' || nom === 'chef' || nom === 'temoin' || nom === 'accueil') {
      minuterie = setInterval(function () { if (!document.hidden) actualiserVue(); }, 60000);
    }
    rendre();
    actualiserVue(true);
    window.scrollTo(0, 0);
  }
  function rendre(maj) {
    var y = window.scrollY;
    var a = V.args;
    switch (V.nom) {
      case 'nouveau': vueNouveau(); break;
      case 'partager': vuePartager(a[0]); break;
      case 'chantier': vueChantier(a[0], a[1] || 'resume'); break;
      case 'proprio': vueImport(a); break;
      case 'chef': case 'temoin': vueRole(V.nom, a[0], a[1]); break;
      case 'pass': vuePass(); break;
      case 'reglages': vueReglages(); break;
      default: vueAccueil();
    }
    if (maj) window.scrollTo(0, y);
  }
  function actualiserVue(premier) {
    if (!enLigne()) return;
    var p = null, n = V.nom, a = V.args;
    if (n === 'chantier') { var c = chantierPar(a[0]); if (c && (premier || Date.now() - (c.actualiseLe || 0) > 30000)) p = rafraichirChantier(c); }
    else if ((n === 'chef' || n === 'temoin') && a[0] && a[1]) { var l = lienPar(n, a[0]); if (l && l.dossier && (premier || Date.now() - (l.vuLe || 0) > 30000)) p = chargerRole(n, a[0], a[1]); }
    else if (n === 'accueil') p = rafraichirTout(premier);
    if (p) p.then(function (change) { if (change && V.nom === n && V.args[0] === a[0]) rendre(true); }).catch(function () {});
  }

  // ---------- Données du serveur ----------
  function signature(d) { var evs = (d && d.evenements) || []; return evs.length + ':' + (evs.length ? evs[evs.length - 1].empreinte : '') + ':' + JSON.stringify((d && d.donnees) || {}).length; }
  function rafraichirChantier(c) {
    return R.lire(c.id, c.jetons.proprio).then(function (r) {
      if (r.status === 404) { var avant = c.introuvable; c.introuvable = true; return sauverChantier(c).then(function () { return !avant; }); }
      if (!r.ok || !r.json.dossier) return false;
      var d = r.json.dossier, av = signature(c);
      c.titre = d.titre; c.donnees = d.donnees || {}; c.statut = d.statut; c.evenements = d.evenements || []; c.cree_le = d.cree_le || c.cree_le;
      c.actualiseLe = Date.now(); c.introuvable = false;
      var change = av !== signature(c);
      return sauverChantier(c).then(function () { return change; });
    });
  }
  function rafraichirTout(force) {
    var liste = S.chantiers.filter(function (c) { return !c.introuvable && (force || Date.now() - (c.actualiseLe || 0) > 120000); });
    var change = false, i = 0;
    function ouvrier() {
      if (i >= liste.length) return Promise.resolve();
      var c = liste[i++];
      return rafraichirChantier(c).then(function (ch) { if (ch) change = true; return ouvrier(); }, function (e) { if (!(e && e.reseau)) return ouvrier(); });
    }
    return Promise.all([ouvrier(), ouvrier()]).then(function () { return change; });
  }
  function chargerRole(role, id, jeton) {
    var l = lienPar(role, id);
    return R.lire(id, jeton).then(function (r) {
      if (r.status === 404) { l = l || { cle: role + ':' + id, role: role, id: id, jeton: jeton }; l.introuvable = true; l.vuLe = Date.now(); if (S.liens.indexOf(l) < 0) S.liens.push(l); return sauverLien(l).then(function () { return true; }); }
      if (!r.ok || !r.json.dossier) return false;
      if (!l) { l = { cle: role + ':' + id, role: role, id: id, jeton: jeton }; S.liens.push(l); }
      var avant = signature(l.dossier);
      l.jeton = jeton; l.dossier = r.json.dossier; l.vuLe = Date.now(); l.introuvable = false;
      return sauverLien(l).then(function () { return avant !== signature(l.dossier); });
    });
  }
  function rafraichirDossier(id, role, jeton) {
    if (role === 'proprio') { var c = chantierPar(id); return c ? rafraichirChantier(c) : Promise.resolve(false); }
    return chargerRole(role, id, jeton);
  }

  // ---------- Contexte d'une vue (qui je suis, sur quel chantier) ----------
  function contexte(role, id) {
    var d = null, jeton = '';
    if (role === 'proprio') { var c = chantierPar(id); if (c) { d = c; jeton = c.jetons.proprio; } }
    else { var l = lienPar(role, id); if (l && l.dossier) { d = l.dossier; jeton = l.jeton; } }
    if (!d) return null;
    var p = pendants(id);
    var ctx = { role: role, id: id, jeton: jeton, d: d, donnees: d.donnees || {}, evs: d.evenements || [], pendants: p };
    ctx.etapes = CC.lireEtapes(ctx.donnees);
    ctx.r = CC.etat({ donnees: ctx.donnees, evenements: ctx.evs, cree_le: d.cree_le || d.creeLe }, Date.now(), p);
    ctx.illimite = (role === 'proprio' && premium()) || CC.passDossier(ctx.donnees);
    ctx.actions = CC.actionsComptees(ctx.evs, p);
    ctx.photos = CC.photosComptees(ctx.evs, p);
    ctx.peutPhoto = role !== 'proprio';
    return ctx;
  }
  function contexteVue() {
    if (V.nom === 'chantier') return contexte('proprio', V.args[0]);
    if (V.nom === 'chef' || V.nom === 'temoin') return contexte(V.nom, V.args[0]);
    return null;
  }
  function limiteAtteinte(ctx, besoin) { return !ctx.illimite && ctx.actions + (besoin || 1) > CC.LIMITE_ACTIONS; }

  // ---------- Exécution d'une action (en direct, ou en file d'attente sans réseau) ----------
  function executer(item) {
    return R.ajouter(item).then(function (it) {
      return R.liste().then(function (l) { S.file = l; majReseau(); return it; });
    }).then(function (it) {
      return R.vider().catch(function () { return null; }).then(function () { return DB.lire('file', it.n); }).then(function (reste) {
        return R.liste().then(function (l) {
          S.file = l; majReseau();
          return reste ? { etat: reste.etat, message: reste.message, n: reste.n } : { etat: 'envoye' };
        });
      });
    });
  }
  function apresAction(res, ctx, okMsg) {
    if (res.etat === 'envoye') { toast(okMsg || 'Enregistré ✓'); return rafraichirDossier(ctx.id, ctx.role, ctx.jeton).catch(function () {}).then(function () { rendre(true); }); }
    if (res.etat === 'attente' && pendants(ctx.id).some(function (it) { return it.etat !== 'attente'; })) { toast('Action gardée : elle partira après l\'action refusée (bandeau rouge).', 6000); rendre(true); return; }
    if (res.etat === 'attente') { toast(enLigne() ? 'Le serveur ne répond pas : l\'action est gardée et partira toute seule.' : 'Pas de réseau : l\'action est gardée et partira toute seule.', 5000); rendre(true); return; }
    toast(res.message || 'Action refusée.', 6000); rendre(true);
  }

  // ---------- Éléments communs ----------
  function barre(p, classe) { p = Math.max(0, Math.min(100, Math.round(p || 0))); return '<span class="barre ' + (classe || '') + '" role="img" aria-label="' + p + ' %"><span style="width:' + p + '%"></span></span>'; }
  function badgeStatut(s) { return '<span class="badge s-' + s + '">' + esc(CC.STATUTS[s] || s) + '</span>'; }
  function nomRole(role, ctx) {
    var d = (ctx && ctx.donnees) || {};
    if (role === 'chef') return 'Chef' + (d.chef ? ' (' + d.chef + ')' : '');
    if (role === 'temoin') return 'Témoin' + (d.temoin ? ' (' + d.temoin + ')' : '');
    return 'Propriétaire';
  }
  function urlPhoto(ctx, nom) { return R.urlPhoto(ctx.id, nom, ctx.jeton); }
  function vignettes(ctx, photos, alt) {
    if (!photos || !photos.length) return '';
    return '<div class="vignettes">' + photos.map(function (p) {
      var d = p.donnees || {}, u = urlPhoto(ctx, d.photo);
      return '<button type="button" class="vignette" aria-label="Agrandir la photo' + (d.legende ? ' : ' + esc(d.legende) : '') + '" data-action="voir-photo" data-src="' + esc(u) + '" data-legende="' + esc(d.legende || alt || '') + '" data-le="' + esc(p.le) + '" data-sha="' + esc(d.sha256 || '') + '"><img loading="lazy" src="' + esc(u) + '" alt="' + esc(d.legende || alt || 'Photo') + '"></button>';
    }).join('') + '</div>';
  }
  function bandeauFile(ctx) {
    var l = ctx.pendants.filter(function (it) { return it.etat === 'attente'; });
    var ko = ctx.pendants.filter(function (it) { return it.etat === 'erreur'; });
    var h = '';
    if (ko.length) h += ko.map(function (it) {
      return '<div class="bandeau ko" role="alert">' + ICO.alerte + '<div><strong>Action refusée : ' + esc(libelleType(it.type)) + '</strong><span>' + esc(it.message || '') + '</span>' +
        '<div class="rang"><button type="button" class="btn petit sec" data-action="reessayer" data-n="' + it.n + '">Réessayer</button><button type="button" class="btn petit lien-danger" data-action="retirer-file" data-n="' + it.n + '">Supprimer</button></div></div></div>';
    }).join('');
    if (l.length) h += '<div class="bandeau attente" role="status">' + ICO.horloge + '<div><strong>' + l.length + ' action' + (l.length > 1 ? 's' : '') + ' en attente d\'envoi</strong><span>' + (enLigne() ? 'Envoi en cours…' : 'Elles partiront dès le retour du réseau.') + '</span></div>' +
      (enLigne() ? '<button type="button" class="btn petit sec" data-action="vider-file">Envoyer</button>' : '') + '</div>';
    return h;
  }
  function libelleType(t) { return t === 'photo' ? 'photo' : (CC.EVENEMENTS[t] || t).toLowerCase(); }
  function notice() { return '<p class="notice">' + ICO.bouclier + '<span>' + esc(NOTICE) + '</span></p>'; }

  function blocEntete(ctx, titreRole) {
    var r = ctx.r, d = ctx.donnees, dn = r.derniereNouvelle;
    var h = '<section class="carte entete-chantier">' + (titreRole ? '<p class="sur-titre">' + esc(titreRole) + '</p>' : '') +
      '<div class="titre-rang"><h1>' + esc(d.nom || ctx.d.titre || 'Chantier') + '</h1><span class="titre-droite">' + badgeStatut(r.statut) +
      (enLigne() ? '<button type="button" class="btn-icone" data-action="actualiser" aria-label="Actualiser">' + ICO.actualiser + '</button>' : '') + '</span></div>' +
      '<p class="lieu">' + esc([d.lieu, d.type].filter(Boolean).join(' · ')) + '</p>' +
      '<div class="global"><strong class="grand-chiffre">' + r.global + '<small> %</small></strong><div><span>Avancement global</span>' + barre(r.global, 'epaisse') + '</div></div>';
    if (dn) h += '<p class="derniere">' + ICO.horloge + '<span>Dernière nouvelle ' + esc(CC.depuis(dn.le)) + ' : ' + esc(nomRole(dn.auteur, ctx)) + ' — ' + esc(CC.libelleEvenement(dn, ctx.etapes)) + '</span></p>';
    if (ctx.d.introuvable) h += '<p class="erreur">Ce chantier n\'existe plus sur le serveur (effacé 180 jours après la dernière activité, ou lien erroné). Ce qui est affiché est la dernière copie gardée sur ce téléphone.</p>';
    return h + '</section>';
  }
  function blocAlertes(ctx) {
    var a = ctx.r.alertes;
    if (!a.length) return '<section class="carte rassurant">' + ICO.bouclier + '<div><strong>Rien d\'anormal à signaler</strong><span>Dépenses justifiées, photos récentes, questions répondues.</span></div></section>';
    return '<section class="carte alertes" aria-label="Écarts à surveiller"><h2>' + ICO.alerte + a.length + ' point' + (a.length > 1 ? 's' : '') + ' à surveiller</h2><ul>' +
      a.map(function (x) { return '<li class="al-' + x.type + '">' + esc(x.texte) + '</li>'; }).join('') + '</ul></section>';
  }
  function blocEtapes(ctx, avecBoutons) {
    var et = ctx.r.etapes;
    if (!et.length) return '<section class="carte"><h2>Étapes</h2><p class="vide">Aucune étape. ' + (ctx.role === 'proprio' ? 'Ajoutez-en avec « Modifier ».' : '') + '</p></section>';
    return '<section class="carte"><h2>' + ICO.briques + 'Étapes du chantier</h2><ul class="etapes-liste">' + et.map(function (x) {
      var depasse = x.b > 0 && x.depense > x.b;
      return '<li><button type="button" class="etape-ligne" data-action="voir-etape" data-k="' + esc(x.k) + '"><span class="et-haut"><strong>' + esc(x.n) + '</strong><span class="et-pc">' + (x.valide ? '<span class="puce ok">' + ICO.ok + 'Validée</span>' : x.pourcent + ' %') + '</span></span>' +
        barre(x.pourcent, x.valide ? 'fini' : '') +
        '<span class="et-bas">' + (x.b ? 'Budget ' + montant(x.b) : 'Pas de budget') + ' · Dépensé ' + '<span class="' + (depasse ? 'rouge' : '') + '">' + montant(x.depense) + '</span>' + (x.derniere ? ' · ' + esc(CC.depuis(x.derniere.e.le)) : '') + '</span></button>' +
        (avecBoutons && !x.valide && x.pourcent > 0 ? '<button type="button" class="btn petit sec valider-etape" data-action="feuille" data-type="validation" data-etape="' + esc(x.k) + '">' + ICO.valider + 'Valider</button>' : '') + '</li>';
    }).join('') + '</ul></section>';
  }
  function blocArgentCourt(ctx) {
    var r = ctx.r;
    return '<section class="carte"><h2>' + ICO.argent + 'Argent</h2><div class="kpis trois">' +
      '<div class="kpi"><small>Envoyé (déclaré)</small><strong>' + montant(r.envoye) + '</strong></div>' +
      '<div class="kpi"><small>Dépensé (déclaré)</small><strong>' + montant(r.depense) + '</strong></div>' +
      '<div class="kpi ' + (r.solde < 0 ? 'rouge' : 'vert') + '"><small>Envoyé − dépensé</small><strong>' + montant(r.solde) + '</strong></div></div>' +
      (r.nbNonJustifiees ? '<p class="petit rouge">' + r.nbNonJustifiees + ' dépense' + (r.nbNonJustifiees > 1 ? 's' : '') + ' sans photo du reçu (' + montant(r.nonJustifie) + ').</p>' : '') + '</section>';
  }
  function blocQuota(ctx) {
    var h = '';
    if (!ctx.illimite) {
      var n = Math.min(ctx.actions, CC.LIMITE_ACTIONS), pc = Math.round(n * 100 / CC.LIMITE_ACTIONS);
      h += '<div class="quota"><div><strong>' + n + ' / ' + CC.LIMITE_ACTIONS + '</strong> actions gratuites utilisées sur ce chantier<div class="jauge"><span style="width:' + pc + '%"></span></div></div>' +
        (ctx.role === 'proprio' ? '<a class="btn petit sec" href="#/pass">' + ICO.etoile + 'Pass</a>' : '') + '</div>';
    }
    h += '<p class="petit">' + ICO.photo + ' Photos : ' + ctx.photos + ' / ' + CC.MAX_PHOTOS + ' envois (plusieurs photos d\'une même action sont assemblées en une seule image).</p>';
    return '<section class="carte discret">' + h + '</section>';
  }
  function blocLimite(ctx) {
    var h = '<section class="carte offre-limite"><h2>' + ICO.etoile + 'Les ' + CC.LIMITE_ACTIONS + ' actions gratuites sont utilisées</h2>';
    if (ctx.role === 'proprio') h += '<p>Tout reste lisible, imprimable et vérifiable. Pour continuer à noter l\'avancement, les dépenses et les photos, activez le Pass Chantier Clair (' + montant(CC.PRIX_PASS) + ' pour 12 mois, chantiers et actions sans limite).</p><a class="btn plein large" href="#/pass">' + ICO.etoile + 'Voir le Pass</a>';
    else h += '<p>Tout reste lisible. Pour continuer, la personne qui paie le chantier doit activer le Pass Chantier Clair sur son téléphone.</p><a class="btn plein large" id="wa-limite" href="' + esc(wa(CC.messageLimite(ctx.donnees))) + '" target="_blank" rel="noopener">' + ICO.message + 'Le lui demander sur WhatsApp</a>';
    return h + '</section>';
  }

  // Frise : actions de la plus récente à la plus ancienne (photos rattachées à leur action)
  function blocFrise(ctx, titre) {
    var items = ctx.r.items.slice().reverse();
    var tout = S.toutVoir[ctx.id], max = tout ? 400 : 25;
    var h = '<section class="carte"><h2>' + ICO.horloge + (titre || 'Historique') + '</h2><ol class="frise">';
    ctx.pendants.slice().reverse().forEach(function (it) {
      h += '<li class="fr-pendant"><span class="fr-point">' + ICO.horloge + '</span><div class="fr-corps"><strong>' + esc(it.type === 'photo' ? 'Photo' : CC.libelleEvenement({ type: it.type, donnees: it.donnees || {} }, ctx.etapes)) + '</strong>' +
        '<small>' + (it.etat === 'erreur' ? 'Refusée par le serveur' : 'En attente d\'envoi') + ' · ' + esc(CC.dateHeureFr(new Date(it.creeLe).toISOString())) + '</small>' +
        (it.type !== 'photo' ? '<p>' + esc(CC.detailEvenement({ type: it.type, donnees: it.donnees || {} }, ctx.etapes)) + '</p>' : '') +
        (it.photo ? '<img class="vignette-locale" src="' + esc(it.photo) + '" alt="Photo en attente d\'envoi">' : '') + '</div></li>';
    });
    items.slice(0, max).forEach(function (it) {
      var e = it.e, d = e.donnees || {};
      var det = CC.detailEvenement(e, ctx.etapes);
      var extra = '';
      if (e.type === 'versement_declare') extra = it.recu ? '<span class="puce ok">' + ICO.ok + 'Reçu, confirmé par le chef</span>' : '<span class="puce attente">Réception pas encore confirmée</span>';
      if (e.type === 'depense') extra = it.photos.length ? '<span class="puce ok">' + ICO.recu + 'Reçu en photo</span>' : '<span class="puce ko">Sans photo du reçu</span>';
      if (e.type === 'question') extra = it.reponses && it.reponses.length ? '<span class="puce ok">' + ICO.ok + 'Répondu</span>' : '<span class="puce attente">Sans réponse</span>';
      if (e.type === 'demande_materiaux') extra = it.statut === 'accord' ? '<span class="puce ok">' + ICO.ok + 'Accord donné</span>' : it.statut === 'question' ? '<span class="puce attente">Question posée</span>' : '<span class="puce attente">En attente de réponse</span>';
      h += '<li class="fr-' + e.type + (e.type === 'constat' && d.avis ? ' avis-' + d.avis : '') + '"><span class="fr-point">' + ICO[ICO_EV[e.type] || 'note'] + '</span><div class="fr-corps">' +
        '<strong>' + esc(CC.libelleEvenement(e, ctx.etapes)) + '</strong><small>' + esc(nomRole(e.auteur, ctx)) + ' · ' + esc(CC.dateHeureFr(e.le)) + '</small>' +
        (det ? '<p>' + esc(det) + '</p>' : '') + (extra ? '<p>' + extra + '</p>' : '') +
        (d.fait_le ? '<p class="differe">Fait le ' + esc(CC.dateHeureFr(d.fait_le)) + ' sans réseau, envoyé plus tard.</p>' : '') +
        vignettes(ctx, it.photos, CC.libelleEvenement(e, ctx.etapes)) + boutonsItem(ctx, it) + '</div></li>';
    });
    h += '</ol>';
    if (items.length > max) h += '<button type="button" class="btn sec large" data-action="tout-voir" data-id="' + esc(ctx.id) + '">Voir tout l\'historique (' + items.length + ')</button>';
    return h + '</section>';
  }
  // Boutons de réponse dans la frise (selon le rôle)
  function boutonsItem(ctx, it) {
    var e = it.e, b = [];
    if (ctx.r.statut === 'termine' || limiteAtteinte(ctx)) return '';
    if (ctx.role === 'chef' && e.type === 'question' && !(it.reponses && it.reponses.length)) b.push('<button type="button" class="btn petit plein" data-action="feuille" data-type="reponse" data-cible="' + esc(e.empreinte) + '">' + ICO.message + 'Répondre</button>');
    if (ctx.role === 'chef' && e.type === 'versement_declare' && !it.recu) b.push('<button type="button" class="btn petit plein" data-action="feuille" data-type="recu" data-cible="' + esc(e.empreinte) + '">' + ICO.ok + 'Argent bien reçu</button>');
    if (ctx.role === 'proprio' && e.type === 'demande_materiaux' && it.statut !== 'accord') b.push('<button type="button" class="btn petit plein" data-action="feuille" data-type="accord" data-cible="' + esc(e.empreinte) + '">' + ICO.valider + 'Donner mon accord</button>', '<button type="button" class="btn petit sec" data-action="feuille" data-type="question" data-cible="' + esc(e.empreinte) + '">' + ICO.question + 'Poser une question</button>');
    if (ctx.role === 'chef' && e.type === 'depense' && !it.photos.length) b.push('<button type="button" class="btn petit sec" data-action="feuille" data-type="photo" data-legende="' + esc('Reçu : ' + ((e.donnees || {}).libelle || '') + ' (' + CC.formatF(CC.entier((e.donnees || {}).montant)) + ')') + '">' + ICO.photo + 'Ajouter la photo du reçu</button>');
    return b.length ? '<div class="rang">' + b.join('') + '</div>' : '';
  }
  function blocVerif(ctx) {
    var v = S.verif[ctx.id], r = '';
    if (v) {
      if (v.ok) r = '<div class="verif ok" role="status">' + ICO.bouclier + '<div><strong>Historique intact</strong><span>' + v.total + ' actions : chaque empreinte a été recalculée sur ce téléphone et chaque action porte bien celle de la précédente.</span><small>Dernière empreinte : ' + esc(v.derniere.slice(0, 16)) + '…</small></div></div>';
      else r = '<div class="verif ko" role="alert">' + ICO.alerte + '<div><strong>L\'historique ne se vérifie pas entièrement</strong>' + v.erreurs.slice(0, 5).map(function (e) {
        return '<span>Action ' + (e.index + 1) + ' : ' + (e.raison === 'lien' ? 'le lien avec l\'action précédente est rompu (action retirée ou ajoutée)' : e.raison === 'vide' ? 'historique vide' : 'son contenu ne correspond plus à son empreinte (modifiée)') + '</span>';
      }).join('') + '</div></div>';
    }
    return '<section class="carte"><h2>' + ICO.bouclier + 'Historique vérifiable</h2><p class="petit">Chaque action porte l\'empreinte de la précédente. Votre téléphone peut tout recalculer pour s\'assurer que rien n\'a été modifié ni retiré.</p>' +
      '<div class="rang"><button type="button" class="btn sec" data-action="verifier" data-id="' + esc(ctx.id) + '">' + ICO.bouclier + 'Vérifier l\'historique</button>' +
      '<button type="button" class="btn plein" data-action="pdf" data-id="' + esc(ctx.id) + '">' + ICO.pdf + 'Rapport PDF</button></div>' + r + notice() + '</section>';
  }

  // ---------- Accueil ----------
  function vueAccueil() {
    var roles = S.liens.filter(function (l) { return l.dossier; });
    if (!S.chantiers.length && !roles.length) return accueilVide();
    var h = bandeauPass();
    if (S.chantiers.length) {
      h += '<div class="titre-rang"><h1>Mes chantiers</h1>' + (enLigne() ? '<button type="button" class="btn petit sec" data-action="actualiser">' + ICO.actualiser + 'Actualiser</button>' : '') + '</div>';
      h += S.chantiers.slice().sort(function (a, b) { return (b.creeLe || 0) - (a.creeLe || 0); }).map(function (c) {
        var ctx = contexte('proprio', c.id), r = ctx.r;
        return '<a class="carte carte-chantier" href="#/chantier/' + esc(c.id) + '"><div class="titre-rang"><strong>' + esc(ctx.donnees.nom || c.titre) + '</strong>' + badgeStatut(r.statut) + '</div>' +
          '<span class="lieu">' + esc(ctx.donnees.lieu || '') + '</span><div class="global petit-global"><strong>' + r.global + ' %</strong>' + barre(r.global) + '</div>' +
          '<span class="cc-bas">' + 'Envoyé ' + montant(r.envoye) + ' · Dépensé ' + montant(r.depense) + '</span>' +
          (r.alertes.length ? '<span class="puce ko">' + ICO.alerte + r.alertes.length + ' point' + (r.alertes.length > 1 ? 's' : '') + ' à surveiller</span>' : '<span class="puce ok">' + ICO.ok + 'Rien d\'anormal</span>') + '</a>';
      }).join('');
      if (!premium()) h += '<p class="petit centre">Version gratuite : ' + CC.LIMITE_CHANTIERS + ' chantier et ' + CC.LIMITE_ACTIONS + ' actions. <a href="#/pass">Pass 12 mois : ' + esc(CC.formatF(CC.PRIX_PASS)) + '</a></p>';
    }
    if (roles.length) {
      h += '<section class="carte"><h2>' + ICO.lien + 'Chantiers où j\'interviens</h2><ul class="liste">' + roles.sort(function (a, b) { return (b.vuLe || 0) - (a.vuLe || 0); }).map(function (l) {
        var d = (l.dossier && l.dossier.donnees) || {};
        return '<li><a class="ligne" href="#/' + l.role + '/' + esc(l.id) + '/' + esc(l.jeton) + '"><span><strong>' + esc(d.nom || l.dossier.titre) + '</strong><small>' + esc(CC.ROLES[l.role]) + (d.lieu ? ' · ' + esc(d.lieu) : '') + '</small></span>' + ICO.fleche + '</a></li>';
      }).join('') + '</ul></section>';
    }
    h += blocCollerLien();
    afficher(h);
  }
  function accueilVide() {
    afficher('<section class="hero"><img src="icons/icon-192.png" alt="" width="88" height="88"><h1>Suivez votre chantier à distance, sans mauvaise surprise</h1>' +
      '<p>Pour la famille à l\'étranger qui fait construire au pays : avancement en photos, dépenses avec les reçus, argent envoyé, tout au même endroit.</p>' +
      '<a class="btn plein large" href="#/nouveau">' + ICO.plus + 'Créer mon chantier</a></section>' +
      '<section class="carte"><ol class="etapes-illus">' +
      '<li><span>1</span><div><strong>Créez le chantier</strong>Les étapes (fondations, élévation, dalle…) et le budget de chacune.</div></li>' +
      '<li><span>2</span><div><strong>Envoyez un lien par WhatsApp</strong>Au chef de chantier et à un témoin de la famille sur place. Rien à installer pour eux.</div></li>' +
      '<li><span>3</span><div><strong>Suivez tout, même de loin</strong>Photos datées, dépenses avec reçu, demandes de matériaux, écarts signalés, rapport PDF chaque semaine.</div></li></ol>' + notice() + '</section>' +
      blocCollerLien());
  }
  function blocCollerLien() {
    return '<details class="carte"><summary class="resume">' + ICO.lien + 'Vous avez reçu un lien de chantier ?</summary><form data-form="coller"><div class="champ"><label for="c-lien">Collez le lien reçu</label><input id="c-lien" name="lien" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…/apps/chantier/#/chef/…"></div><p class="msg" role="status"></p><button type="submit" class="btn sec">' + ICO.fleche + 'Ouvrir</button></form></details>';
  }
  function bandeauPass() {
    if (!S.pass) return '';
    var fin = S.pass.payeeLe ? CC.finPass(S.pass.payeeLe) : null;
    if (premium() && fin && fin - Date.now() < 30 * CC.JOUR) {
      var j = Math.max(0, Math.ceil((fin - Date.now()) / CC.JOUR));
      return '<div class="bandeau attente" role="status">' + ICO.etoile + '<div><strong>Votre pass se termine le ' + esc(CC.dateFr(new Date(fin).toISOString())) + '</strong><span>Dans ' + j + ' jour' + (j > 1 ? 's' : '') + '. Renouvelez-le pour garder les actions sans limite. Vos chantiers restent toujours lisibles.</span></div><a class="btn petit sec" href="#/pass">Renouveler</a></div>';
    }
    if (!premium()) return '<div class="bandeau attente" role="status">' + ICO.etoile + '<div><strong>Votre pass n\'est plus valable</strong><span>Vos chantiers restent lisibles. Version gratuite : ' + CC.LIMITE_ACTIONS + ' actions par chantier.</span></div><a class="btn petit sec" href="#/pass">Renouveler</a></div>';
    return '';
  }

  // ---------- Éditeur des étapes et budgets (création et modification) ----------
  function editeurEtapes(etapes) {
    return '<fieldset class="champ"><legend>Étapes et budget de chaque étape <small>(en F CFA, facultatif)</small></legend><ol class="ed-etapes" id="ed-etapes">' +
      etapes.map(ligneEtape).join('') + '</ol>' +
      '<button type="button" class="btn sec petit" data-action="ajouter-etape">' + ICO.plus + 'Ajouter une étape</button>' +
      '<p class="total-budget">Budget total : <strong id="budget-total">' + montant(CC.budgetTotal(etapes)) + '</strong></p></fieldset>';
  }
  var nLigne = 0;
  function ligneEtape(x) {
    var i = ++nLigne;
    return '<li data-k="' + esc(x.k || '') + '"><label class="vh" for="et-n-' + i + '">Nom de l\'étape</label><input id="et-n-' + i + '" class="et-nom" maxlength="40" value="' + esc(x.n) + '" required>' +
      '<label class="vh" for="et-b-' + i + '">Budget de l\'étape ' + esc(x.n) + ' (F)</label><input id="et-b-' + i + '" class="et-budget" inputmode="numeric" placeholder="Budget F" value="' + (x.b ? esc(CC.formatNombre(x.b)) : '') + '">' +
      '<button type="button" class="btn-icone" data-action="retirer-etape" aria-label="Retirer l\'étape ' + esc(x.n) + '">' + ICO.poubelle + '</button></li>';
  }
  function lireEditeurEtapes(form, anciennes) {
    var l = [], erreur = '';
    $$('#ed-etapes li', form).forEach(function (li) {
      var n = $('.et-nom', li).value.trim().slice(0, 40), b = CC.lireMontant($('.et-budget', li).value);
      if (!n) return;
      if (isNaN(b)) erreur = 'Budget de « ' + n + ' » illisible : écrivez seulement des chiffres (ex. 2 500 000).';
      var k = li.getAttribute('data-k') || CC.nouvelleCle(l.concat(anciennes || []), n);
      l.push({ k: k, n: n, b: isNaN(b) ? 0 : b });
    });
    return { etapes: l, erreur: erreur };
  }
  function majTotalBudget() {
    var t = 0; $$('#ed-etapes .et-budget').forEach(function (i) { var b = CC.lireMontant(i.value); if (!isNaN(b)) t += b; });
    var el = $('#budget-total'); if (el) el.textContent = CC.formatF(t);
  }

  // ---------- Nouveau chantier ----------
  function vueNouveau() {
    if (!premium() && S.creations >= CC.LIMITE_CHANTIERS) {
      afficher('<section class="carte offre-limite"><h1>' + ICO.etoile + 'Votre chantier gratuit est déjà créé</h1><p>La version gratuite suit ' + CC.LIMITE_CHANTIERS + ' chantier. Avec le Pass Chantier Clair (' + montant(CC.PRIX_PASS) + ' pour 12 mois), suivez autant de chantiers que vous voulez, sans limite d\'actions, avec des rapports PDF sans mention.</p><a class="btn plein large" href="#/pass">' + ICO.etoile + 'Voir le Pass</a></section>');
      return;
    }
    nLigne = 0;
    afficher('<form class="carte formulaire" data-form="nouveau" novalidate><h1>Nouveau chantier</h1>' +
      '<div class="champ"><label for="n-nom">Nom du chantier</label><input id="n-nom" name="nom" maxlength="80" required placeholder="Ex. : Maison familiale de Keur Massar"></div>' +
      '<div class="champ"><label for="n-lieu">Commune ou quartier <small>(pas d\'adresse exacte)</small></label><input id="n-lieu" name="lieu" maxlength="60" placeholder="Ex. : Keur Massar, Dakar"></div>' +
      '<div class="rang-champs"><div class="champ"><label for="n-type">Type</label><select id="n-type" name="type">' + CC.TYPES_CONSTRUCTION.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
      '<div class="champ"><label for="n-debut">Début des travaux</label><input id="n-debut" name="debut" type="date" value="' + aujourdhui() + '"></div></div>' +
      '<div class="rang-champs"><div class="champ"><label for="n-chef">Prénom du chef <small>(facultatif)</small></label><input id="n-chef" name="chef" maxlength="30" placeholder="Ex. : Moussa"></div>' +
      '<div class="champ"><label for="n-temoin">Prénom du témoin <small>(facultatif)</small></label><input id="n-temoin" name="temoin" maxlength="30" placeholder="Ex. : Tante Awa"></div></div>' +
      '<p class="astuce">' + ICO.personne + '<span>Le témoin est une personne de confiance sur place (famille, ami) qui passe voir le chantier et envoie ses propres photos.</span></p>' +
      editeurEtapes(CC.etapesDefaut()) +
      '<p class="msg" role="status" aria-live="polite"></p><button type="submit" class="btn plein large">' + ICO.ok + 'Créer le chantier</button>' +
      '<p class="petit">Aucun numéro de téléphone n\'est demandé : vous enverrez les liens vous-même par WhatsApp.</p></form>');
  }
  function soumettreNouveau(form) {
    var msg = $('.msg', form), bouton = $('button[type=submit]', form);
    function dire(t) { msg.textContent = fr(t); msg.classList.add('erreur'); }
    var v = function (n) { return String((form.elements[n] && form.elements[n].value) || '').trim(); };
    var nom = v('nom'), lieu = v('lieu'), chef = v('chef'), temoin = v('temoin');
    if (nom.length < 2) { dire('Donnez un nom au chantier.'); form.elements.nom.focus(); return; }
    if ([nom, lieu, chef, temoin].some(CC.contientTelephone)) return dire('Pas de numéro de téléphone ici : les liens se partagent par WhatsApp, sans numéro enregistré.');
    var ed = lireEditeurEtapes(form);
    if (ed.erreur) return dire(ed.erreur);
    if (!ed.etapes.length) return dire('Gardez au moins une étape.');
    if (ed.etapes.some(function (x) { return CC.contientTelephone(x.n); })) return dire('Pas de numéro de téléphone dans les étapes.');
    var donnees = { nom: nom, lieu: lieu, type: v('type'), debut: v('debut'), chef: chef, temoin: temoin, etapes: CC.ecrireEtapes(ed.etapes), v: 1 };
    if (premium() && S.pass.payeeLe) donnees.pass_fin = CC.cleJour(CC.finPass(S.pass.payeeLe));
    if (!enLigne()) return dire('Pas de réseau : la création demande Internet (une seule fois). Réessayez dès que le réseau revient.');
    var corps = { app: CC.APP, titre: nom, donnees: donnees };
    if (premium()) corps.pass = { o: S.pass.o, t: S.pass.t };
    bouton.disabled = true; msg.classList.remove('erreur'); msg.textContent = 'Création du chantier…';
    R.creer(corps).then(function (r) {
      if (r.status === 429) { bouton.disabled = false; return dire(r.json.message || 'Limite atteinte aujourd\'hui. Réessayez demain.'); }
      if (!r.ok || !r.json.id) { bouton.disabled = false; return dire(r.json.message || 'Le serveur ne répond pas. Réessayez dans un instant.'); }
      var c = { id: r.json.id, jetons: r.json.jetons, titre: nom, donnees: donnees, statut: 'ouvert', evenements: [], creeLe: Date.now(), cree_le: new Date().toISOString() };
      S.chantiers.push(c); S.creations++;
      return Promise.all([sauverChantier(c), sauverKv('creations', S.creations)]).then(function () {
        rafraichirChantier(c).catch(function () {});
        location.hash = '#/partager/' + c.id;
      });
    }).catch(function () { bouton.disabled = false; dire('Pas de réseau : le chantier n\'a pas été créé. Réessayez dès que le réseau revient.'); });
  }

  // ---------- Liens à partager ----------
  function textePartage(c, quoi) {
    var d = c.donnees || {};
    if (quoi === 'chef') return CC.messageChef(d, CC.lienRole(base(), 'chef', c.id, c.jetons));
    if (quoi === 'temoin') return CC.messageTemoin(d, CC.lienRole(base(), 'temoin', c.id, c.jetons));
    return CC.messageProprio(d, CC.lienRole(base(), 'proprio', c.id, c.jetons));
  }
  function vuePartager(id) {
    var c = chantierPar(id);
    if (!c) return afficher(introuvableIci());
    var d = c.donnees || {};
    function carte(quoi, titre, texte, explication) {
      var t = textePartage(c, quoi);
      return '<section class="carte envoi"><h2>' + ICO[quoi === 'proprio' ? 'lien' : 'personne'] + esc(titre) + '</h2><p class="petit">' + explication + '</p>' +
        '<a class="btn plein large wa" id="wa-' + quoi + '" href="' + esc(wa(t)) + '" target="_blank" rel="noopener">' + ICO.message + esc(texte) + '</a>' +
        '<div class="rang"><button type="button" class="btn sec" data-action="partager" data-quoi="' + quoi + '" data-id="' + esc(id) + '">' + ICO.partager + 'Autre application</button><button type="button" class="btn sec" data-action="copier" data-quoi="' + quoi + '" data-id="' + esc(id) + '">' + ICO.copier + 'Copier</button></div>' +
        '<pre class="apercu-msg">' + esc(t) + '</pre></section>';
    }
    if (!c.jetons.chef) {
      return afficher('<section class="carte"><h1>Liens du chantier</h1><p>Ce téléphone n\'a que votre lien propriétaire. Pour renvoyer les liens du chef et du témoin, ouvrez votre lien propriétaire complet (il contient les trois liens) ou importez une sauvegarde.</p></section>' +
        carte('proprio', 'Votre lien propriétaire', 'M\'envoyer mon lien', 'Gardez-le pour retrouver ce chantier sur un autre téléphone. Ne le donnez à personne.'));
    }
    afficher('<section class="carte succes"><h1>' + ICO.ok + 'Chantier prêt</h1><p>Envoyez maintenant un lien à chaque personne. Chaque lien est personnel : il donne seulement les actions de son rôle.</p></section>' +
      carte('chef', 'Lien du chef de chantier' + (d.chef ? ' (' + d.chef + ')' : ''), 'Envoyer au chef sur WhatsApp', 'Il note l\'avancement avec photos, les dépenses avec le reçu et ses demandes de matériaux.') +
      carte('temoin', 'Lien du témoin' + (d.temoin ? ' (' + d.temoin + ')' : ''), 'Envoyer au témoin sur WhatsApp', 'Une personne de confiance sur place : elle envoie ses propres constats et photos.') +
      carte('proprio', 'Votre lien propriétaire', 'M\'envoyer mon lien', 'À garder pour vous (par exemple en l\'envoyant à « Moi » sur WhatsApp) : il ouvre ce chantier sur un autre téléphone.') +
      '<a class="btn plein large" href="#/chantier/' + esc(id) + '">' + ICO.fleche + 'Terminé : voir le chantier</a>');
  }
  function introuvableIci() { return '<section class="carte"><h1>Chantier introuvable sur ce téléphone</h1><p>Ouvrez votre lien propriétaire pour le retrouver ici, ou importez une sauvegarde (Réglages).</p><a class="btn plein" href="#/">Retour</a></section>'; }

  // ---------- Tableau de bord de la personne qui paie ----------
  var ONGLETS = [['resume', 'Résumé'], ['argent', 'Argent'], ['photos', 'Photos'], ['historique', 'Historique']];
  function vueChantier(id, onglet) {
    var ctx = contexte('proprio', id);
    if (!ctx) return afficher(introuvableIci());
    var h = blocEntete(ctx) + '<nav class="onglets" aria-label="Sections du chantier">' + ONGLETS.map(function (o) {
      return '<a href="#/chantier/' + esc(id) + '/' + o[0] + '" class="' + (o[0] === onglet ? 'actif' : '') + '"' + (o[0] === onglet ? ' aria-current="page"' : '') + '>' + o[1] + '</a>';
    }).join('') + '</nav>' + bandeauFile(ctx);
    if (onglet === 'argent') h += ongletArgent(ctx);
    else if (onglet === 'photos') h += ongletPhotos(ctx);
    else if (onglet === 'historique') h += blocVerif(ctx) + blocFrise(ctx);
    else h += ongletResume(ctx);
    afficher(h);
  }
  function ongletResume(ctx) {
    var r = ctx.r, h = blocAlertes(ctx);
    var att = r.demandes.filter(function (it) { return it.statut !== 'accord'; });
    if (att.length) {
      h += '<section class="carte a-traiter"><h2>' + ICO.panier + 'Demandes de matériaux</h2>' + att.map(function (it) {
        return '<div class="demande"><div class="titre-rang"><strong>' + montant(it.total) + '</strong><small>' + esc(CC.etiquetteEtape(ctx.etapes, (it.e.donnees || {}).etape)) + ' · ' + esc(CC.depuis(it.e.le)) + '</small></div>' +
          '<ul class="lignes">' + it.lignes.map(function (x) { return '<li><span>' + esc(x.q + ' ' + (x.u ? x.u + ' ' : '') + x.a) + '</span><span>' + (x.p ? montant(CC.totalLigne(x)) : '<em>prix à confirmer</em>') + '</span></li>'; }).join('') + '</ul>' +
          ((it.e.donnees || {}).texte ? '<p class="petit">« ' + esc(it.e.donnees.texte) + ' »</p>' : '') + boutonsItem(ctx, it) + '</div>';
      }).join('') + '</section>';
    }
    h += blocEtapes(ctx, true);
    if (r.statut !== 'termine') h += limiteAtteinte(ctx) ? blocLimite(ctx) : '<section class="carte"><h2>Que voulez-vous faire ?</h2><div class="grille-actions">' +
      action('feuille', 'versement_declare', 'envoi', 'Déclarer un envoi d\'argent', true) + action('feuille', 'question', 'question', 'Poser une question') +
      action('feuille', 'validation', 'valider', 'Valider une étape') + action('feuille', 'note', 'note', 'Ajouter une note') +
      action('modifier', '', 'crayon', 'Modifier étapes et budgets') + action('feuille', 'cloture', 'drapeau', 'Chantier terminé') + '</div></section>';
    h += '<section class="carte"><h2>' + ICO.partager + 'Partager</h2><div class="rang">' +
      '<a class="btn sec" href="#/partager/' + esc(ctx.id) + '">' + ICO.lien + 'Liens du chef et du témoin</a>' +
      '<a class="btn sec" id="wa-resume" href="' + esc(wa(CC.resumeTexte(ctx.donnees, r))) + '" target="_blank" rel="noopener">' + ICO.message + 'Envoyer un point à la famille</a>' +
      '<button type="button" class="btn plein" data-action="pdf" data-id="' + esc(ctx.id) + '">' + ICO.pdf + 'Rapport PDF de la semaine</button></div></section>';
    h += blocQuota(ctx);
    h += '<div class="rang fin"><button type="button" class="btn lien-danger" data-action="retirer-chantier" data-id="' + esc(ctx.id) + '">Retirer ce chantier de ce téléphone</button></div>';
    return h;
  }
  function action(act, type, ico, libelle, fort) {
    return '<button type="button" class="action' + (fort ? ' fort' : '') + '" data-action="' + act + '"' + (type ? ' data-type="' + type + '"' : '') + '>' + ICO[ico] + '<span>' + esc(libelle) + '</span></button>';
  }
  function ongletArgent(ctx) {
    var r = ctx.r, max = Math.max(1, r.budget, r.envoye, r.depense);
    var h = '<div class="kpis">' +
      '<div class="kpi"><small>Budget prévu</small><strong>' + montant(r.budget) + '</strong></div>' +
      '<div class="kpi bleu"><small>Argent envoyé (déclaré)</small><strong>' + montant(r.envoye) + '</strong><span>' + r.versements.length + ' envoi' + (r.versements.length > 1 ? 's' : '') + '</span></div>' +
      '<div class="kpi"><small>Dépenses déclarées</small><strong>' + montant(r.depense) + '</strong><span>' + r.depenses.length + ' dépense' + (r.depenses.length > 1 ? 's' : '') + '</span></div>' +
      '<div class="kpi vert"><small>Dont justifiées (reçu)</small><strong>' + montant(r.justifie) + '</strong></div>' +
      '<div class="kpi ' + (r.nonJustifie ? 'rouge' : '') + '"><small>Non justifiées</small><strong>' + montant(r.nonJustifie) + '</strong><span>' + r.nbNonJustifiees + ' sans photo du reçu</span></div>' +
      '<div class="kpi ' + (r.solde < 0 ? 'rouge' : 'vert') + '"><small>Envoyé − dépensé</small><strong>' + montant(r.solde) + '</strong><span>' + (r.solde < 0 ? 'Dépenses au-delà de l\'envoyé' : 'Reste à justifier') + '</span></div></div>';
    h += '<section class="carte"><h2>' + ICO.argent + 'Comparaison</h2><div class="compare">' +
      ligneCompare('Budget', r.budget, max, 'c-budget') + ligneCompare('Envoyé', r.envoye, max, 'c-envoye') +
      '<div class="cmp"><span>Dépensé</span><span class="cmp-barre"><span class="c-justifie" style="width:' + (r.justifie * 100 / max) + '%"></span><span class="c-nonjustifie" style="width:' + (r.nonJustifie * 100 / max) + '%"></span></span><strong>' + montant(r.depense) + '</strong></div></div>' +
      '<p class="legende"><i class="c-justifie"></i>avec reçu <i class="c-nonjustifie"></i>sans reçu</p></section>';
    h += '<section class="carte"><h2>Budget par étape</h2><table class="tableau"><thead><tr><th>Étape</th><th>Budget</th><th>Dépensé</th></tr></thead><tbody>' + r.etapes.map(function (x) {
      var dep = x.b > 0 && x.depense > x.b;
      return '<tr><td>' + esc(x.n) + (x.b ? barre(Math.min(100, x.depense * 100 / x.b), dep ? 'rouge' : '') : '') + '</td><td>' + montant(x.b) + '</td><td class="' + (dep ? 'rouge' : '') + '">' + montant(x.depense) + '</td></tr>';
    }).join('') + '<tr class="total"><td>Total</td><td>' + montant(r.budget) + '</td><td>' + montant(r.depense) + '</td></tr></tbody></table></section>';
    h += '<section class="carte"><div class="titre-rang"><h2>' + ICO.envoi + 'Argent envoyé</h2>' + (r.statut !== 'termine' && !limiteAtteinte(ctx) ? '<button type="button" class="btn petit plein" data-action="feuille" data-type="versement_declare">' + ICO.plus + 'Déclarer</button>' : '') + '</div>' +
      (r.versements.length ? '<ul class="liste">' + r.versements.slice().reverse().map(function (it) {
        var d = it.e.donnees || {};
        return '<li class="ligne-argent"><span><strong>' + montant(it.montant) + '</strong><small>' + esc([CC.MOYENS[d.moyen], d.date ? 'le ' + CC.jourFr(d.date) : '', d.beneficiaire ? 'à ' + d.beneficiaire : ''].filter(Boolean).join(' · ')) + '</small></span>' +
          (it.recu ? '<span class="puce ok">' + ICO.ok + 'Reçu</span>' : '<span class="puce attente">À confirmer</span>') + '</li>';
      }).join('') + '</ul>' : '<p class="vide">Aucun envoi déclaré. Notez ici chaque envoi (Wave, virement, transfert…) : le chef confirme la réception.</p>') + '</section>';
    h += '<section class="carte"><h2>' + ICO.recu + 'Dépenses du chef</h2>' + (r.depenses.length ? '<ul class="liste">' + r.depenses.slice().reverse().map(function (it) {
      var d = it.e.donnees || {};
      return '<li class="ligne-argent"><span><strong>' + montant(it.montant) + '</strong> ' + esc(d.libelle || '') + '<small>' + esc([CC.etiquetteEtape(ctx.etapes, d.etape), d.fournisseur, d.date ? 'le ' + CC.jourFr(d.date) : ''].filter(Boolean).join(' · ')) + '</small>' + vignettes(ctx, it.photos, 'Reçu') + '</span>' +
        (it.photos.length ? '<span class="puce ok">' + ICO.recu + 'Reçu</span>' : '<span class="puce ko">Sans reçu</span>') + '</li>';
    }).join('') + '</ul>' : '<p class="vide">Aucune dépense déclarée pour l\'instant.</p>') + '</section>';
    return h;
  }
  function ligneCompare(lib, v, max, cl) { return '<div class="cmp"><span>' + lib + '</span><span class="cmp-barre"><span class="' + cl + '" style="width:' + (v * 100 / max) + '%"></span></span><strong>' + montant(v) + '</strong></div>'; }
  function ongletPhotos(ctx) {
    var ph = ctx.r.photos.slice().reverse();
    var h = '<section class="carte"><div class="titre-rang"><h2>' + ICO.photo + 'Photos du chantier</h2><span class="petit">' + ctx.photos + ' / ' + CC.MAX_PHOTOS + '</span></div>';
    if (!ph.length) h += '<p class="vide">Pas encore de photo. Le chef et le témoin envoient les photos depuis leur lien.</p>';
    else h += '<div class="galerie">' + ph.map(function (e) {
      var d = e.donnees || {}, u = urlPhoto(ctx, d.photo);
      return '<figure><button type="button" class="vignette" aria-label="Agrandir la photo' + (d.legende ? ' : ' + esc(d.legende) : '') + '" data-action="voir-photo" data-src="' + esc(u) + '" data-legende="' + esc(d.legende || '') + '" data-le="' + esc(e.le) + '" data-sha="' + esc(d.sha256 || '') + '"><img loading="lazy" src="' + esc(u) + '" alt="' + esc(d.legende || 'Photo du chantier') + '"></button><figcaption>' + esc(CC.dateFr(e.le)) + ' · ' + esc(CC.ROLES_COURTS[e.auteur] || '') + '</figcaption></figure>';
    }).join('') + '</div>';
    if (ctx.r.alertes.some(function (a) { return a.type === 'photos'; })) h += '<p class="erreur">' + esc(ctx.r.alertes.filter(function (a) { return a.type === 'photos'; })[0].texte) + '. Vous pouvez poser une question au chef.</p>';
    return h + '</section>';
  }

  // ---------- Lien propriétaire : importe le chantier sur ce téléphone ----------
  function vueImport(a) {
    var id = a[0], jp = a[1];
    if (!CC.RE_ID.test(id || '') || !CC.RE_JETON.test(jp || '')) return afficher('<section class="carte"><h1>Lien incomplet</h1><p>Vérifiez que le lien a été copié en entier.</p></section>');
    var ici = chantierPar(id);
    if (ici && ici.jetons.proprio === jp) {
      if (!ici.jetons.chef && a[2] && a[3]) { ici.jetons.chef = a[2]; ici.jetons.temoin = a[3]; sauverChantier(ici); }
      location.replace('#/chantier/' + id); return;
    }
    afficher('<section class="carte"><h1>Ouverture du chantier…</h1><div class="barre-attente"><span></span></div></section>');
    R.lire(id, jp).then(function (r) {
      if (!r.ok || !r.json.dossier || r.json.dossier.role !== 'proprio') return afficher('<section class="carte"><h1>Lien non reconnu</h1><p>Ce lien n\'ouvre pas de chantier. Il a peut-être été mal copié, ou le chantier a été effacé (180 jours sans activité).</p></section>');
      var d = r.json.dossier;
      var c = { id: id, jetons: { proprio: jp, chef: a[2] || '', temoin: a[3] || '' }, titre: d.titre, donnees: d.donnees || {}, statut: d.statut, evenements: d.evenements || [], creeLe: Date.parse(d.cree_le) || Date.now(), cree_le: d.cree_le, actualiseLe: Date.now() };
      S.chantiers.push(c);
      sauverChantier(c).then(function () { toast('Chantier ajouté à ce téléphone ✓'); location.replace('#/chantier/' + id); });
    }).catch(function () { afficher('<section class="carte"><h1>Pas de réseau</h1><p>Réessayez quand le réseau revient.</p></section>'); });
  }

  // ---------- Vues du chef et du témoin (sans menu, sans installation) ----------
  function vueRole(role, id, jeton) {
    if (!CC.RE_ID.test(id || '') || !CC.RE_JETON.test(jeton || '')) return afficher('<section class="carte"><h1>Lien incomplet</h1><p>Vérifiez que le lien a été copié en entier.</p></section>');
    var l = lienPar(role, id);
    if (!l || !l.dossier || l.jeton !== jeton) {
      if (l && l.introuvable) return afficher('<section class="carte"><h1>Chantier introuvable</h1><p>Ce lien ne marche plus : il a été mal copié, ou le chantier a été effacé.</p></section>');
      afficher('<section class="carte"><h1>Ouverture du chantier…</h1><div class="barre-attente"><span></span></div></section>');
      if (!V.chargement) {
        V.chargement = true;
        var echec = function (titre, texte) {
          if (V.args[0] === id) afficher('<section class="carte"><h1>' + titre + '</h1><p>' + texte + '</p><button type="button" class="btn plein" data-action="recharger">' + ICO.actualiser + 'Réessayer</button></section>');
        };
        chargerRole(role, id, jeton).then(function () {
          var l2 = lienPar(role, id);
          if (l2 && (l2.dossier || l2.introuvable)) { if (V.args[0] === id) rendre(true); }
          else echec('Le serveur ne répond pas', 'Réessayez dans un instant.');
        }, function () {
          echec('Pas de réseau', 'La première ouverture du lien demande Internet. Ensuite, le chantier reste lisible même sans réseau.');
        });
      }
      return;
    }
    var ctx = contexte(role, id);
    var h = blocEntete(ctx, role === 'chef' ? 'Vous êtes : chef de chantier' + (ctx.donnees.chef ? ' (' + ctx.donnees.chef + ')' : '') : 'Vous êtes : témoin' + (ctx.donnees.temoin ? ' (' + ctx.donnees.temoin + ')' : '')) + bandeauFile(ctx);
    var termine = ctx.r.statut === 'termine';
    if (role === 'chef') {
      var questions = ctx.r.questions.filter(function (it) { return !it.reponses.length; });
      var versements = ctx.r.versements.filter(function (it) { return !it.recu; });
      if (!termine && (questions.length || versements.length)) {
        h += '<section class="carte a-traiter"><h2>' + ICO.message + 'À répondre</h2>' + questions.map(function (it) {
          return '<div class="demande"><small>Question du propriétaire · ' + esc(CC.depuis(it.e.le)) + '</small><p class="question-texte">« ' + esc((it.e.donnees || {}).texte || '') + ' »</p>' + boutonsItem(ctx, it) + '</div>';
        }).join('') + versements.map(function (it) {
          var d = it.e.donnees || {};
          return '<div class="demande"><small>Envoi déclaré · ' + esc(CC.depuis(it.e.le)) + '</small><p class="question-texte">' + montant(it.montant) + (d.moyen ? ' par ' + esc(CC.MOYENS[d.moyen] || '') : '') + (d.date ? ' le ' + esc(CC.jourFr(d.date)) : '') + ' : l\'avez-vous reçu ?</p>' + boutonsItem(ctx, it) + '</div>';
        }).join('') + '</section>';
      }
    }
    if (termine) h += '<section class="bandeau ok">' + ICO.drapeau + '<div><strong>Chantier terminé</strong><span>Le propriétaire a clôturé ce chantier. Tout reste lisible.</span></div></section>';
    else if (limiteAtteinte(ctx)) h += blocLimite(ctx);
    else if (role === 'chef') {
      h += '<div class="principal">' +
        '<button type="button" class="btn-geant" data-action="feuille" data-type="avancement">' + ICO.truelle + '<span>Noter l\'avancement<small>Avec des photos du travail fait</small></span></button>' +
        '<button type="button" class="btn-geant orange" data-action="feuille" data-type="depense">' + ICO.recu + '<span>Ajouter une dépense<small>Avec la photo du reçu</small></span></button>' +
        '<button type="button" class="btn-geant bleu" data-action="feuille" data-type="demande_materiaux">' + ICO.panier + '<span>Demander des matériaux<small>Quantités et prix</small></span></button></div>' +
        '<div class="grille-actions deux">' + action('feuille', 'photo', 'photo', 'Envoyer une photo') + action('feuille', 'note', 'note', 'Ajouter une note') + '</div>';
    } else {
      h += '<div class="principal">' +
        '<button type="button" class="btn-geant" data-action="feuille" data-type="constat">' + ICO.oeil + '<span>Faire un constat<small>Ce que vous voyez sur place, avec photo</small></span></button></div>' +
        '<div class="grille-actions deux">' + action('feuille', 'photo', 'photo', 'Envoyer une photo') + action('feuille', 'note', 'note', 'Ajouter une note') + '</div>';
    }
    h += blocEtapes(ctx, false) + blocArgentCourt(ctx) + blocFrise(ctx) + blocVerif(ctx) + blocQuota(ctx);
    h += '<p class="petit centre">Chantier Clair · ' + esc(CC.ROLES[role]) + ' · <a href="#/">Mes chantiers</a></p>';
    afficher(h);
  }

  // ---------- Feuilles d'actions ----------
  var CONF = {
    avancement: { titre: 'Noter l\'avancement', bouton: 'Envoyer l\'avancement', ok: 'Avancement noté ✓ Le propriétaire le verra.', photos: 'Photos du travail fait (conseillé)' },
    depense: { titre: 'Ajouter une dépense', bouton: 'Enregistrer la dépense', ok: 'Dépense enregistrée ✓', photos: 'Photo du reçu ou de la facture' },
    demande_materiaux: { titre: 'Demander des matériaux', bouton: 'Envoyer la demande', ok: 'Demande envoyée ✓ Le propriétaire peut donner son accord.' },
    note: { titre: 'Ajouter une note', bouton: 'Ajouter la note', ok: 'Note ajoutée ✓', photos: 'Photo (facultatif)' },
    reponse: { titre: 'Répondre à la question', bouton: 'Envoyer la réponse', ok: 'Réponse envoyée ✓', photos: 'Photo (facultatif)' },
    recu: { titre: 'Confirmer la réception de l\'argent', bouton: 'Oui, je l\'ai bien reçu', ok: 'Réception confirmée ✓' },
    question: { titre: 'Poser une question', bouton: 'Envoyer la question', ok: 'Question envoyée ✓ Le chef la verra sur son lien.' },
    accord: { titre: 'Donner mon accord pour les matériaux', bouton: 'Donner mon accord', ok: 'Accord envoyé ✓' },
    versement_declare: { titre: 'Déclarer un envoi d\'argent', bouton: 'Enregistrer l\'envoi', ok: 'Envoi noté ✓ Le chef pourra confirmer la réception.' },
    validation: { titre: 'Valider une étape', bouton: 'Valider l\'étape', ok: 'Étape validée ✓' },
    cloture: { titre: 'Le chantier est terminé', bouton: 'Clôturer le chantier', ok: 'Chantier clôturé ✓', danger: true },
    constat: { titre: 'Faire un constat', bouton: 'Envoyer le constat', ok: 'Constat envoyé ✓ Le propriétaire le verra.', photos: 'Photos de ce que vous voyez (conseillé)' },
    photo: { titre: 'Envoyer une photo', bouton: 'Envoyer', ok: 'Photo envoyée ✓', photos: 'Photos (jusqu\'à 4, assemblées en une image)', photoRequise: true }
  };
  var TYPE_SERVEUR = { reponse: 'note', recu: 'note', accord: 'validation' };
  function selectEtapes(ctx, nom, opts) {
    opts = opts || {};
    var et = ctx.r.etapes.filter(function (x) { return !opts.nonValidees || !x.valide; });
    var def = opts.defaut;
    if (!def) { var enCours = et.filter(function (x) { return !x.valide && x.pourcent < 100; })[0]; def = enCours ? enCours.k : (et[0] && et[0].k); }
    return '<div class="champ"><label for="f-' + nom + '">' + esc(opts.libelle || 'Étape') + '</label><select id="f-' + nom + '" name="' + nom + '">' +
      (opts.facultatif ? '<option value="">— Aucune en particulier —</option>' : '') +
      et.map(function (x) { return '<option value="' + esc(x.k) + '"' + (!opts.facultatif && x.k === def ? ' selected' : '') + '>' + esc(x.n) + (x.valide ? ' (validée)' : x.pourcent ? ' (' + x.pourcent + ' %)' : '') + '</option>'; }).join('') + '</select></div>';
  }
  function champTexte(nom, libelle, requis, ph) { return '<div class="champ"><label for="f-' + nom + '">' + libelle + (requis ? '' : ' <small>(facultatif)</small>') + '</label><textarea id="f-' + nom + '" name="' + nom + '" rows="3" maxlength="600"' + (requis ? ' required' : '') + ' placeholder="' + esc(ph || '') + '"></textarea></div>'; }
  function champ(nom, libelle, attrs, requis) { return '<div class="champ"><label for="f-' + nom + '">' + libelle + (requis ? '' : ' <small>(facultatif)</small>') + '</label><input id="f-' + nom + '" name="' + nom + '" ' + (attrs || '') + (requis ? ' required' : '') + '></div>'; }
  function champPhotos(ctx, libelle) {
    if (!ctx.peutPhoto) return '';
    if (ctx.photos >= CC.MAX_PHOTOS) return '<p class="petit rouge">Ce chantier a atteint ' + CC.MAX_PHOTOS + ' envois de photos (limite du serveur) : décrivez par écrit.</p>';
    return '<div class="champ champ-photos"><span class="etiquette">' + esc(libelle) + '</span><div class="rang">' +
      '<label class="btn sec">' + ICO.photo + '<span>Prendre une photo</span><input type="file" accept="image/*" capture="environment" class="vh" data-photos></label>' +
      '<label class="btn sec">' + ICO.galerie + '<span>Galerie</span><input type="file" accept="image/*" multiple class="vh" data-photos></label></div>' +
      '<div class="apercus" aria-live="polite"></div><small class="aide">Jusqu\'à 4 photos, assemblées en une seule image avant l\'envoi.</small></div>';
  }
  function feuilleAction(type, el) {
    var ctx = contexteVue(); if (!ctx) return;
    var cf = CONF[type]; if (!cf) return;
    if (limiteAtteinte(ctx)) { toast('Les ' + CC.LIMITE_ACTIONS + ' actions gratuites de ce chantier sont utilisées.', 5000); return; }
    var cible = el && el.getAttribute('data-cible'), d = ctx.donnees;
    var h = '<h2>' + esc(cf.titre) + '</h2><form data-form="action" data-type="' + type + '" novalidate>';
    switch (type) {
      case 'avancement':
        h += selectEtapes(ctx, 'etape', { nonValidees: true });
        h += '<fieldset class="champ"><legend>Avancement de cette étape</legend><p class="aide" id="pc-actuel"></p><div class="choix pourcents">' + [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(function (p) {
          return '<label class="choix-item"><input type="radio" name="pourcent" value="' + p + '"><span>' + p + ' %</span></label>';
        }).join('') + '</div></fieldset>';
        h += champ('date', 'Date des travaux', 'type="date" value="' + aujourdhui() + '" max="' + aujourdhui() + '"', true);
        h += champTexte('texte', 'Qu\'est-ce qui a été fait ?', false, 'Ex. : coulage des poteaux du salon');
        break;
      case 'depense':
        h += selectEtapes(ctx, 'etape');
        h += champ('libelle', 'Quoi ?', 'maxlength="80" placeholder="Ex. : 40 sacs de ciment"', true);
        h += '<div class="rang-champs">' + champ('montant', 'Montant (F CFA)', 'inputmode="numeric" placeholder="Ex. : 192 000"', true) + champ('date', 'Date', 'type="date" value="' + aujourdhui() + '" max="' + aujourdhui() + '"', true) + '</div>';
        h += champ('fournisseur', 'Fournisseur', 'maxlength="60" placeholder="Ex. : Quincaillerie du marché"', false);
        break;
      case 'demande_materiaux':
        h += selectEtapes(ctx, 'etape');
        h += '<fieldset class="champ"><legend>Matériaux demandés</legend><datalist id="materiaux">' + CC.MATERIAUX.map(function (m) { return '<option value="' + esc(m) + '">'; }).join('') + '</datalist><ol class="lignes-ed" id="lignes-ed">' + ligneMateriau() + '</ol>' +
          '<button type="button" class="btn sec petit" data-action="ajouter-ligne">' + ICO.plus + 'Ajouter une ligne</button><p class="total-budget">Total : <strong id="total-demande">0 F</strong></p></fieldset>';
        h += champ('pour_le', 'Pour quand ?', 'type="date" min="' + aujourdhui() + '"', false);
        h += champTexte('texte', 'Précision', false, 'Ex. : pour couler la dalle samedi');
        break;
      case 'note': h += champTexte('texte', 'Votre note', true); break;
      case 'reponse':
        var q = ctx.r.questions.filter(function (it) { return it.e.empreinte === cible; })[0];
        if (q) h += '<p class="question-texte">« ' + esc((q.e.donnees || {}).texte || '') + ' »</p>';
        h += champTexte('texte', 'Votre réponse', true);
        break;
      case 'recu':
        var vs = ctx.r.versements.filter(function (it) { return it.e.empreinte === cible; })[0];
        if (vs) h += '<p class="question-texte">' + montant(vs.montant) + ' ' + esc(CC.detailEvenement(vs.e, ctx.etapes)) + '</p>';
        h += champTexte('texte', 'Précision', false, 'Ex. : reçu en deux fois');
        break;
      case 'question':
        if (cible) { var dm = ctx.r.demandes.filter(function (it) { return it.e.empreinte === cible; })[0]; if (dm) h += '<p class="petit">À propos de la demande de matériaux de ' + montant(dm.total) + '.</p>'; }
        else h += selectEtapes(ctx, 'etape', { facultatif: true, libelle: 'À propos de l\'étape' });
        h += champTexte('texte', 'Votre question', true, 'Ex. : pouvez-vous envoyer une photo des fers de la dalle ?');
        break;
      case 'accord':
        var dd = ctx.r.demandes.filter(function (it) { return it.e.empreinte === cible; })[0];
        if (dd) h += '<p class="question-texte">' + montant(dd.total) + ' — ' + esc(dd.lignes.map(function (x) { return x.q + ' ' + (x.u ? x.u + ' ' : '') + x.a; }).join(', ')) + '</p>';
        h += champTexte('texte', 'Message au chef', false, 'Ex. : d\'accord, j\'envoie l\'argent demain');
        break;
      case 'versement_declare':
        h += '<p class="astuce">' + ICO.bouclier + '<span>Chantier Clair ne transfère pas d\'argent : notez ici ce que vous avez envoyé par vos moyens habituels. Le chef pourra confirmer la réception.</span></p>';
        h += '<div class="rang-champs">' + champ('montant', 'Montant envoyé (F CFA)', 'inputmode="numeric" placeholder="Ex. : 500 000"', true) + champ('date', 'Date d\'envoi', 'type="date" value="' + aujourdhui() + '" max="' + aujourdhui() + '"', true) + '</div>';
        h += '<fieldset class="champ"><legend>Moyen utilisé</legend><div class="choix">' + Object.keys(CC.MOYENS).map(function (k, i) { return '<label class="choix-item"><input type="radio" name="moyen" value="' + k + '"' + (i === 0 ? ' checked' : '') + '><span>' + esc(CC.MOYENS[k]) + '</span></label>'; }).join('') + '</div></fieldset>';
        h += champ('beneficiaire', 'Envoyé à (prénom)', 'maxlength="40" value="' + esc(d.chef ? d.chef + ' (chef)' : '') + '" placeholder="Ex. : Moussa (chef)"', false);
        h += champTexte('texte', 'Pour quoi ?', false, 'Ex. : pour la dalle');
        break;
      case 'validation':
        var aValider = ctx.r.etapes.filter(function (x) { return !x.valide; });
        if (!aValider.length) { toast('Toutes les étapes sont déjà validées.'); return; }
        h += selectEtapes(ctx, 'etape', { nonValidees: true, defaut: el && el.getAttribute('data-etape') });
        h += '<p class="petit">Valider une étape signifie que vous la considérez comme terminée et acceptée (100 %).</p>';
        h += champTexte('texte', 'Commentaire', false, 'Ex. : vu sur les photos du témoin, c\'est propre');
        break;
      case 'cloture':
        h += '<p>Clôturer indique que le chantier est terminé. L\'historique reste lisible et vérifiable, le chef et le témoin ne pourront plus rien ajouter depuis l\'application.</p>';
        h += champTexte('texte', 'Mot de fin', false, 'Ex. : maison réceptionnée, merci à tous');
        break;
      case 'constat':
        h += selectEtapes(ctx, 'etape', { facultatif: true, libelle: 'Étape concernée' });
        h += '<fieldset class="champ"><legend>Votre avis</legend><div class="choix trois">' + Object.keys(CC.AVIS).map(function (k, i) { return '<label class="choix-item avis-' + k + '"><input type="radio" name="avis" value="' + k + '"' + (i === 0 ? ' checked' : '') + '><span>' + esc(CC.AVIS[k]) + '</span></label>'; }).join('') + '</div></fieldset>';
        h += champTexte('texte', 'Ce que vous avez vu', false, 'Ex. : les murs du premier niveau sont montés, 3 ouvriers présents');
        break;
      case 'photo':
        h += champ('legende', 'Légende', 'maxlength="120" value="' + esc((el && el.getAttribute('data-legende')) || '') + '" placeholder="Ex. : façade côté rue"', false);
        break;
    }
    if (cf.photos) h += champPhotos(ctx, cf.photos);
    if (type === 'depense' && ctx.peutPhoto) h += '<p class="aide">Sans photo du reçu, la dépense sera signalée « non justifiée » au propriétaire.</p>';
    h += '<p class="msg" role="status" aria-live="polite"></p><button type="submit" class="btn ' + (cf.danger ? 'danger' : 'plein') + ' large">' + esc(cf.bouton) + '</button></form>';
    ouvrirFeuille(h, { type: type, cible: cible, photos: [], ctx: { role: ctx.role, id: ctx.id, jeton: ctx.jeton } });
    if (type === 'avancement') majPourcent();
    if (type === 'demande_materiaux') majTotalDemande();
  }
  var nMat = 0;
  function ligneMateriau() {
    var i = ++nMat;
    return '<li><div class="champ"><label for="m-a-' + i + '">Article</label><input id="m-a-' + i + '" class="m-a" list="materiaux" maxlength="60" placeholder="Ex. : Ciment (sac de 50 kg)"></div>' +
      '<div class="rang-champs trois"><div class="champ"><label for="m-q-' + i + '">Quantité</label><input id="m-q-' + i + '" class="m-q" inputmode="decimal" placeholder="40"></div>' +
      '<div class="champ"><label for="m-u-' + i + '">Unité</label><input id="m-u-' + i + '" class="m-u" maxlength="15" placeholder="sacs"></div>' +
      '<div class="champ"><label for="m-p-' + i + '">Prix unitaire (F)</label><input id="m-p-' + i + '" class="m-p" inputmode="numeric" placeholder="4 800"></div></div>' +
      '<p class="m-total petit"></p></li>';
  }
  function lireLignesForm() {
    var l = [], erreur = '';
    $$('#lignes-ed li').forEach(function (li) {
      var a = $('.m-a', li).value.trim(), qs = $('.m-q', li).value.trim().replace(',', '.'), u = $('.m-u', li).value.trim(), p = CC.lireMontant($('.m-p', li).value);
      if (!a && !qs) return;
      var q = parseFloat(qs);
      if (!a) erreur = 'Écrivez l\'article de chaque ligne.';
      else if (!(q > 0)) erreur = 'Quantité manquante pour « ' + a + ' ».';
      else if (isNaN(p)) erreur = 'Prix de « ' + a + ' » illisible : écrivez seulement des chiffres.';
      l.push({ a: a.slice(0, 60), q: Math.round((q || 0) * 100) / 100, u: u.slice(0, 15), p: isNaN(p) ? 0 : p });
    });
    return { lignes: l, erreur: erreur };
  }
  function majTotalDemande() {
    var r = lireLignesForm();
    $$('#lignes-ed li').forEach(function (li, i) { var x = r.lignes[i]; $('.m-total', li).textContent = x && x.q && x.p ? x.q + ' × ' + CC.formatF(x.p) + ' = ' + CC.formatF(CC.totalLigne(x)) : ''; });
    var t = $('#total-demande'); if (t) t.textContent = CC.formatF(CC.totalLignes(r.lignes));
  }
  function majPourcent() {
    var ctx = contexteVue(), s = $('#f-etape'); if (!ctx || !s) return;
    var et = ctx.r.etapes.filter(function (x) { return x.k === s.value; })[0], cur = et ? et.pourcent : 0;
    $('#pc-actuel').textContent = 'Actuellement : ' + cur + ' %';
    var suivant = Math.min(100, (Math.floor(cur / 10) + 1) * 10);
    var r = $('#feuille input[name=pourcent][value="' + suivant + '"]'); if (r) r.checked = true;
  }
  function afficherApercus() {
    var z = $('#feuille .apercus'); if (!z || !feuilleEtat) return;
    z.innerHTML = feuilleEtat.photos.map(function (p, i) { return '<span class="apercu"><img src="' + esc(p.url) + '" alt="Photo ' + (i + 1) + '"><button type="button" class="btn-icone" data-action="photo-retirer" data-i="' + i + '" aria-label="Retirer la photo ' + (i + 1) + '">' + ICO.fermer + '</button></span>'; }).join('');
    $$('#feuille [data-photos]').forEach(function (inp) { inp.closest('label').classList.toggle('desactive', feuilleEtat.photos.length >= 4); inp.disabled = feuilleEtat.photos.length >= 4; });
  }

  function soumettreAction(form) {
    var type = form.getAttribute('data-type'), cf = CONF[type], st = feuilleEtat, ctx = contexteVue();
    if (!st || !ctx) return;
    var bouton = $('button[type=submit]', form);
    function dire(t) { msgFeuille(t, true); }
    var v = function (n) { return String((form.elements[n] && form.elements[n].value) || '').trim(); };
    var donnees = {}, legende = '', maj = null;
    var textes = [v('texte'), v('libelle'), v('fournisseur'), v('beneficiaire'), v('legende')];
    if (textes.some(CC.contientTelephone)) return dire('Pas de numéro de téléphone dans le texte, s\'il vous plaît.');
    var et = function () { return CC.etiquetteEtape(ctx.etapes, v('etape')); };
    switch (type) {
      case 'avancement':
        if (!v('etape')) return dire('Choisissez l\'étape.');
        var pc = form.querySelector('input[name=pourcent]:checked');
        if (!pc) return dire('Choisissez le pourcentage d\'avancement.');
        donnees = { etape: v('etape'), pourcent: +pc.value, date: v('date') || aujourdhui() };
        if (v('texte')) donnees.texte = v('texte');
        legende = et() + ' — avancement ' + pc.value + ' %';
        break;
      case 'depense':
        var m = CC.lireMontant(v('montant'));
        if (!v('libelle')) return dire('Écrivez ce qui a été acheté ou payé.');
        if (isNaN(m) || m <= 0) return dire('Écrivez le montant en chiffres (ex. 192 000).');
        donnees = { etape: v('etape'), libelle: v('libelle'), montant: m, date: v('date') || aujourdhui() };
        if (v('fournisseur')) donnees.fournisseur = v('fournisseur');
        legende = 'Reçu : ' + v('libelle') + ' (' + CC.formatF(m) + ')';
        break;
      case 'demande_materiaux':
        var lg = lireLignesForm();
        if (lg.erreur) return dire(lg.erreur);
        if (!lg.lignes.length) return dire('Ajoutez au moins un article avec sa quantité.');
        if (lg.lignes.some(function (x) { return CC.contientTelephone(x.a); })) return dire('Pas de numéro de téléphone dans les articles.');
        donnees = { etape: v('etape'), lignes: JSON.stringify(lg.lignes), total: CC.totalLignes(lg.lignes) };
        if (v('pour_le')) donnees.pour_le = v('pour_le');
        if (v('texte')) donnees.texte = v('texte');
        break;
      case 'note':
        if (!v('texte') && !st.photos.length) return dire('Écrivez votre note.');
        donnees = { texte: v('texte') }; legende = 'Note';
        break;
      case 'reponse':
        if (!v('texte')) return dire('Écrivez votre réponse.');
        donnees = { reponse_a: st.cible, texte: v('texte') }; legende = 'Réponse au propriétaire';
        break;
      case 'recu':
        donnees = { reponse_a: st.cible, recu: true, texte: v('texte') || 'Argent bien reçu' };
        break;
      case 'question':
        if (!v('texte')) return dire('Écrivez votre question.');
        donnees = { texte: v('texte') };
        if (st.cible) donnees.demande = st.cible; else if (v('etape')) donnees.etape = v('etape');
        break;
      case 'accord':
        donnees = { demande: st.cible };
        if (v('texte')) donnees.texte = v('texte');
        break;
      case 'versement_declare':
        var mv = CC.lireMontant(v('montant'));
        if (isNaN(mv) || mv <= 0) return dire('Écrivez le montant envoyé en chiffres (ex. 500 000).');
        var moy = form.querySelector('input[name=moyen]:checked');
        donnees = { montant: mv, moyen: moy ? moy.value : 'autre', date: v('date') || aujourdhui() };
        if (v('beneficiaire')) donnees.beneficiaire = v('beneficiaire');
        if (v('texte')) donnees.texte = v('texte');
        break;
      case 'validation':
        if (!v('etape')) return dire('Choisissez l\'étape à valider.');
        donnees = { etape: v('etape') };
        if (v('texte')) donnees.texte = v('texte');
        break;
      case 'cloture':
        donnees = { texte: v('texte') || 'Chantier terminé' };
        break;
      case 'constat':
        var av = form.querySelector('input[name=avis]:checked');
        if (!v('texte') && !st.photos.length) return dire('Décrivez ce que vous avez vu ou ajoutez une photo.');
        donnees = { avis: av ? av.value : 'conforme' };
        if (v('etape')) donnees.etape = v('etape');
        if (v('texte')) donnees.texte = v('texte');
        legende = 'Constat du témoin : ' + CC.AVIS[donnees.avis] + (v('etape') ? ' — ' + et() : '');
        break;
      case 'photo':
        if (!st.photos.length) return dire('Prenez ou choisissez au moins une photo.');
        legende = v('legende') || 'Photo du chantier';
        break;
    }
    if (st.photosEnCours) return dire('Patientez : la photo est en préparation.');
    var besoin = (type === 'photo' ? 0 : 1) + (st.photos.length ? 1 : 0);
    if (limiteAtteinte(ctx, besoin)) return dire('Les ' + CC.LIMITE_ACTIONS + ' actions gratuites de ce chantier sont utilisées.');
    bouton.disabled = true;
    var p = Promise.resolve(null);
    if (st.photos.length) { msgFeuille(st.photos.length > 1 ? 'Assemblage des photos…' : 'Préparation de la photo…'); p = PH.assembler(st.photos.map(function (x) { return x.file; })); }
    p.then(function (photo) {
      var item = { dossier: ctx.id, jeton: ctx.jeton, role: ctx.role, type: type === 'photo' ? 'photo' : (TYPE_SERVEUR[type] || type), donnees: donnees };
      if (photo) { item.photo = photo; item.legende = legende.slice(0, 200); if (type !== 'photo') item.donnees.photos = 1; }
      if (maj) item.maj = maj;
      msgFeuille('Envoi…');
      return executer(item).then(function (res) {
        if (type === 'validation' && res.etat === 'envoye') S.verif[ctx.id] = null;
        fermerFeuille(); apresAction(res, ctx, cf.ok);
      });
    }).catch(function () { bouton.disabled = false; dire('Photo illisible : essayez une autre photo.'); });
  }

  // ---------- Modifier les informations et les étapes (propriétaire) ----------
  function feuilleModifier() {
    var ctx = contexteVue(); if (!ctx || ctx.role !== 'proprio') return;
    if (limiteAtteinte(ctx)) { toast('Les ' + CC.LIMITE_ACTIONS + ' actions gratuites de ce chantier sont utilisées.', 5000); return; }
    var d = ctx.donnees; nLigne = 0;
    ouvrirFeuille('<h2>Modifier le chantier</h2><form data-form="modifier" novalidate>' +
      '<div class="champ"><label for="m-nom">Nom du chantier</label><input id="m-nom" name="nom" maxlength="80" value="' + esc(d.nom || '') + '" required></div>' +
      '<div class="champ"><label for="m-lieu">Commune ou quartier</label><input id="m-lieu" name="lieu" maxlength="60" value="' + esc(d.lieu || '') + '"></div>' +
      '<div class="rang-champs"><div class="champ"><label for="m-chef">Prénom du chef</label><input id="m-chef" name="chef" maxlength="30" value="' + esc(d.chef || '') + '"></div>' +
      '<div class="champ"><label for="m-temoin">Prénom du témoin</label><input id="m-temoin" name="temoin" maxlength="30" value="' + esc(d.temoin || '') + '"></div></div>' +
      editeurEtapes(ctx.etapes) + '<p class="petit">Retirer une étape ne retire rien de l\'historique.</p>' +
      '<p class="msg" role="status" aria-live="polite"></p><button type="submit" class="btn plein large">Enregistrer les changements</button></form>', { ctx: { role: ctx.role, id: ctx.id, jeton: ctx.jeton } });
  }
  function soumettreModifier(form) {
    var ctx = contexteVue(); if (!ctx) return;
    var v = function (n) { return String((form.elements[n] && form.elements[n].value) || '').trim(); };
    var ed = lireEditeurEtapes(form, ctx.etapes);
    if (ed.erreur) return msgFeuille(ed.erreur, true);
    if (!ed.etapes.length) return msgFeuille('Gardez au moins une étape.', true);
    if (v('nom').length < 2) return msgFeuille('Donnez un nom au chantier.', true);
    if ([v('nom'), v('lieu'), v('chef'), v('temoin')].concat(ed.etapes.map(function (x) { return x.n; })).some(CC.contientTelephone)) return msgFeuille('Pas de numéro de téléphone, s\'il vous plaît.', true);
    var avant = ctx.donnees, apres = Object.assign({}, avant, { nom: v('nom'), lieu: v('lieu'), chef: v('chef'), temoin: v('temoin'), etapes: CC.ecrireEtapes(ed.etapes) });
    var resume = resumeChangements(avant, apres);
    if (!resume) { fermerFeuille(); toast('Aucun changement.'); return; }
    $('button[type=submit]', form).disabled = true;
    executer({ dossier: ctx.id, jeton: ctx.jeton, role: 'proprio', type: 'modification', donnees: { resume: resume.slice(0, 600) }, maj: apres }).then(function (res) {
      var c = chantierPar(ctx.id);
      if (c && res.etat !== 'erreur') { c.donnees = apres; sauverChantier(c); }
      fermerFeuille(); apresAction(res, ctx, 'Chantier modifié ✓');
    });
  }
  function resumeChangements(a, b) {
    var l = [];
    [['nom', 'Nom'], ['lieu', 'Lieu'], ['chef', 'Chef'], ['temoin', 'Témoin']].forEach(function (k) { if ((a[k[0]] || '') !== (b[k[0]] || '')) l.push(k[1] + ' : ' + (b[k[0]] || '—')); });
    var ea = CC.lireEtapes(a), eb = CC.lireEtapes(b), pa = {}, pb = {};
    ea.forEach(function (x) { pa[x.k] = x; }); eb.forEach(function (x) { pb[x.k] = x; });
    eb.forEach(function (x) {
      var o = pa[x.k];
      if (!o) l.push('Étape ajoutée : ' + x.n + (x.b ? ' (' + CC.formatF(x.b) + ')' : ''));
      else {
        if (o.n !== x.n) l.push('Étape renommée : ' + o.n + ' → ' + x.n);
        if (o.b !== x.b) l.push('Budget ' + x.n + ' : ' + CC.formatF(o.b) + ' → ' + CC.formatF(x.b));
      }
    });
    ea.forEach(function (x) { if (!pb[x.k]) l.push('Étape retirée : ' + x.n); });
    if (a.pass_fin !== b.pass_fin && b.pass_fin) l.push('Pass actif jusqu\'au ' + CC.jourFr(b.pass_fin));
    return l.join(' ; ');
  }

  // ---------- Détail d'une étape ----------
  function voirEtape(k) {
    var ctx = contexteVue(); if (!ctx) return;
    var x = ctx.r.etapes.filter(function (e) { return e.k === k; })[0]; if (!x) return;
    var items = ctx.r.items.filter(function (it) { return (it.e.donnees || {}).etape === k; }).reverse();
    ouvrirFeuille('<h2>' + esc(x.n) + '</h2><div class="global"><strong class="grand-chiffre">' + x.pourcent + '<small> %</small></strong><div>' + barre(x.pourcent, x.valide ? 'fini' : '') + '<span>' + (x.valide ? 'Validée le ' + esc(CC.dateFr(x.valideLe)) : 'Pas encore validée') + '</span></div></div>' +
      '<div class="kpis trois"><div class="kpi"><small>Budget</small><strong>' + montant(x.b) + '</strong></div><div class="kpi"><small>Dépensé</small><strong>' + montant(x.depense) + '</strong></div><div class="kpi vert"><small>Avec reçu</small><strong>' + montant(x.justifie) + '</strong></div></div>' +
      (items.length ? '<ol class="frise">' + items.map(function (it) {
        var e = it.e;
        return '<li class="fr-' + e.type + '"><span class="fr-point">' + ICO[ICO_EV[e.type] || 'note'] + '</span><div class="fr-corps"><strong>' + esc(CC.libelleEvenement(e, ctx.etapes)) + '</strong><small>' + esc(nomRole(e.auteur, ctx)) + ' · ' + esc(CC.dateHeureFr(e.le)) + '</small><p>' + esc(CC.detailEvenement(e, ctx.etapes)) + '</p>' + vignettes(ctx, it.photos) + '</div></li>';
      }).join('') + '</ol>' : '<p class="vide">Rien de noté pour cette étape.</p>'));
  }

  // ---------- Pass ----------
  function finPassLocal() { return S.pass && S.pass.payeeLe ? CC.finPass(S.pass.payeeLe) : null; }
  function vuePass() {
    var h = '';
    if (premium()) {
      var fin = finPassLocal();
      h += '<section class="carte statut-pass ok"><small>Pass Chantier Clair</small><strong>' + ICO.etoile + 'Actif</strong><span>' + (fin ? 'Valable jusqu\'au ' + esc(CC.dateFr(new Date(fin).toISOString())) + '.' : 'Vérifié le ' + esc(CC.dateFr(new Date(S.pass.verifieLe).toISOString())) + '.') + ' Commande ' + esc(S.pass.o) + '.</span></section>';
    } else if (S.pass) {
      h += '<section class="carte statut-pass ko"><small>Pass Chantier Clair</small><strong>Expiré ou non valable</strong><span>Commande ' + esc(S.pass.o) + '. Vos chantiers restent lisibles ; renouvelez le pass pour les actions sans limite.</span></section>';
    }
    h += '<section class="carte offre"><h1>Pass Chantier Clair</h1><ul class="atouts">' +
      '<li>' + ICO.ok + 'Chantiers sans limite (gratuit : ' + CC.LIMITE_CHANTIERS + ')</li>' +
      '<li>' + ICO.ok + 'Actions sans limite : avancement, dépenses, photos, questions (gratuit : ' + CC.LIMITE_ACTIONS + ' par chantier)</li>' +
      '<li>' + ICO.ok + 'Rapports PDF sans la mention « version gratuite »</li>' +
      '<li>' + ICO.ok + 'Le chef et le témoin en profitent aussi, sans rien payer ni installer</li></ul>' +
      '<a class="offre-carte meilleure" href="' + BOUTIQUE + CC.SLUG_PASS + '.html" target="_blank" rel="noopener"><small>12 mois</small><strong>' + montant(CC.PRIX_PASS) + '</strong><span>Payé une fois par Wave</span></a></section>';
    h += (premium() ? '<details class="carte"><summary class="resume">Activer un autre pass (renouvellement)</summary>' : '') + '<form class="' + (premium() ? '' : 'carte') + '" data-form="pass"><h2>Activer mon pass</h2><ol class="etapes"><li>Achetez le pass dans la boutique et payez par Wave.</li><li>Sur la page de votre commande payée, copiez le lien de la page.</li><li>Collez-le ici puis touchez « Activer ».</li></ol>' +
      '<div class="champ"><label for="p-lien">Lien de votre commande</label><textarea id="p-lien" name="lien" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…/boutique/commande.html?o=TCV-…&amp;t=…"></textarea></div>' +
      '<p class="msg" role="status" aria-live="polite"></p><button type="submit" class="btn plein large">' + ICO.etoile + 'Activer</button>' +
      '<p class="petit">Une seule vérification en ligne. Le même lien active le pass sur vos autres téléphones.</p></form>' + (premium() ? '</details>' : '');
    afficher(h);
  }
  function soumettrePass(form) {
    var msg = $('.msg', form), btn = $('button[type=submit]', form);
    function dire(t, err) { msg.textContent = fr(t); msg.classList.toggle('erreur', !!err); }
    var p = CC.lireLienCommande(form.elements.lien.value);
    if (!p) return dire('Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « TCV- »).', true);
    if (!enLigne()) return dire('Pas de réseau : la vérification demande Internet.', true);
    btn.disabled = true; dire('Vérification de votre commande…');
    Promise.all([R.pass(p), R.commande(p.o, p.t)]).then(function (res) {
      btn.disabled = false;
      var r = res[0], c = res[1] && res[1].commande;
      if (!r.ok) return dire(r.json.message || 'Vérification impossible pour le moment. Réessayez.', true);
      if (!r.json.valide) {
        if (c && c.payee !== true) return dire('Cette commande n\'est pas encore payée. Si vous venez de payer, attendez la confirmation puis réessayez.', true);
        if (c && c.produit && c.produit.slug !== CC.SLUG_PASS) return dire('Ce lien correspond à un autre produit (' + (c.produit.titre || c.produit.slug) + '), pas au Pass Chantier Clair.', true);
        if (c && c.payee_le && !CC.commandeValide(c)) return dire('Ce pass a expiré le ' + CC.dateFr(new Date(CC.finPass(c.payee_le)).toISOString()) + '. Vos chantiers restent lisibles ; reprenez un pass pour continuer sans limite.', true);
        return dire('Ce lien ne correspond pas à un Pass Chantier Clair payé et en cours de validité.', true);
      }
      S.pass = { o: p.o, t: p.t, valide: true, activeLe: Date.now(), verifieLe: Date.now() };
      if (c && c.produit && c.produit.slug === CC.SLUG_PASS && c.payee_le) { S.pass.slug = c.produit.slug; S.pass.payeeLe = c.payee_le; }
      return sauverKv('pass', S.pass).then(function () { propagerPass(); toast('Pass activé ✓ Chantiers et actions sans limite.'); rendre(); window.scrollTo(0, 0); });
    }).catch(function () { btn.disabled = false; dire('Pas de réseau : réessayez dans un instant.', true); });
  }
  // Le chef et le témoin profitent du pass : la date de fin est notée dans les données de chaque chantier
  function propagerPass() {
    var fin = finPassLocal(); if (!fin) return;
    var jour = CC.cleJour(fin);
    S.chantiers.forEach(function (c) {
      var d = c.donnees || {};
      if (c.introuvable || d.pass_fin === jour || (c.statut === 'termine')) return;
      var apres = Object.assign({}, d, { pass_fin: jour });
      c.donnees = apres; sauverChantier(c);
      R.ajouter({ dossier: c.id, jeton: c.jetons.proprio, role: 'proprio', type: 'modification', donnees: { resume: 'Pass Chantier Clair actif jusqu\'au ' + CC.jourFr(jour) }, maj: apres })
        .then(function () { return R.liste(); }).then(function (l) { S.file = l; majReseau(); R.vider().catch(function () {}); });
    });
  }
  function verifierPassRoutine(force) {
    if (!S.pass || !enLigne()) return;
    if (!force && Date.now() - (S.pass.verifieLe || 0) < CC.JOUR) return;
    R.pass({ o: S.pass.o, t: S.pass.t }).then(function (r) {
      if (!r.ok) return;
      S.pass.valide = !!r.json.valide; S.pass.verifieLe = Date.now();
      var p = S.pass.payeeLe ? Promise.resolve() : R.commande(S.pass.o, S.pass.t).then(function (j) { var c = j && j.commande; if (c && c.payee_le && c.produit && c.produit.slug === CC.SLUG_PASS) { S.pass.slug = c.produit.slug; S.pass.payeeLe = c.payee_le; } });
      return p.then(function () { return sauverKv('pass', S.pass); }).then(function () { if (V.nom === 'accueil' || V.nom === 'pass') rendre(true); });
    }).catch(function () {});
  }

  // ---------- Réglages ----------
  function vueReglages() {
    var t = S.reglages.theme || 'auto';
    var h = '<section class="carte"><h1>Réglages</h1><fieldset class="champ"><legend>Affichage</legend><div class="choix trois">' + [['auto', 'Comme le téléphone'], ['light', 'Clair'], ['dark', 'Sombre']].map(function (o) {
      return '<label class="choix-item"><input type="radio" name="theme" value="' + o[0] + '"' + (t === o[0] ? ' checked' : '') + '><span>' + o[1] + '</span></label>';
    }).join('') + '</div></fieldset></section>';
    h += '<section class="carte"><h2>Sauvegarde</h2><p class="petit">Vos chantiers et leurs liens secrets sont gardés sur ce téléphone. Faites une sauvegarde pour les retrouver sur un autre téléphone.</p><div class="rang">' +
      '<button type="button" class="btn sec" data-action="sauvegarder">' + ICO.telecharger + 'Exporter (fichier)</button>' +
      '<label class="btn sec"><input type="file" accept="application/json,.json" class="vh" id="import-fichier">' + ICO.actualiser + 'Importer une sauvegarde</label></div></section>';
    h += '<section class="carte"><h2>Installer l\'application</h2>' + (estInstallee() ? '<p>' + ICO.ok + ' Chantier Clair est installée sur ce téléphone.</p>' : invite ? '<button type="button" class="btn plein" data-action="installer">' + ICO.installer + 'Installer Chantier Clair</button>' : instructionsInstall()) + '</section>';
    h += '<section class="carte"><h2>Confidentialité</h2><ul class="puces-texte"><li>Aucun numéro de téléphone, aucune adresse exacte, aucune pièce d\'identité, aucune donnée bancaire.</li><li>Les liens sont secrets : le serveur ne garde que leur empreinte. Ne les publiez pas.</li><li>L\'application ne transfère pas d\'argent : les envois sont seulement déclarés.</li><li>Les chantiers sont effacés du serveur 180 jours après la dernière activité : gardez vos rapports PDF.</li></ul></section>';
    h += '<section class="carte"><h2>À propos</h2><p>Chantier Clair, version ' + VERSION + '. Une application de Teranga Outils.</p>' + notice() +
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
    window.addEventListener('appinstalled', function () { invite = null; majInstall(); toast('Chantier Clair est installée ✓'); });
    majInstall();
  }
  function majInstall() { var b = $('#installer'); if (b) b.hidden = estInstallee() || document.body.classList.contains('vue-role') || !(invite || estIOS()); }
  function enregistrerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      function attente(w) { swAttente = w; toast('Nouvelle version de Chantier Clair prête.', 12000, { libelle: 'Mettre à jour', faire: function () { w.postMessage('maj'); } }); }
      if (reg.waiting && navigator.serviceWorker.controller) attente(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        if (w) w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) attente(w); });
      });
    }).catch(function () {});
    var recharge = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (swAttente && !recharge) { recharge = true; location.reload(); } });
  }

  // ---------- Vérification et rapport PDF ----------
  function verifier() {
    var ctx = contexteVue(); if (!ctx) return;
    if (!window.crypto || !crypto.subtle) { toast('Ce navigateur ne peut pas faire la vérification.'); return; }
    CC.verifierChaine(ctx.id, ctx.evs).then(function (v) { S.verif[ctx.id] = v; rendre(true); var el = $('.verif'); if (el) el.scrollIntoView({ block: 'nearest' }); });
  }
  function choisirPdf() {
    ouvrirFeuille('<h2>Rapport PDF</h2><p>Un rapport clair à partager avec la famille : avancement, argent, photos et historique vérifié.</p>' +
      '<div class="principal"><button type="button" class="btn-geant" data-action="pdf-go" data-periode="semaine">' + ICO.pdf + '<span>Rapport de la semaine<small>Les 7 derniers jours, avec les photos</small></span></button>' +
      '<button type="button" class="btn-geant bleu" data-action="pdf-go" data-periode="tout">' + ICO.pdf + '<span>Rapport complet<small>Depuis le début du chantier</small></span></button></div>');
  }
  function genererPdf(periode) {
    var ctx = contexteVue(); if (!ctx) return;
    ouvrirFeuille('<h2>Rapport PDF</h2><p class="msg" role="status" aria-live="polite">Préparation du rapport…</p><div class="barre-attente"><span></span></div>', {});
    var fin = Date.now(), debut = periode === 'semaine' ? fin - 7 * CC.JOUR : 0;
    var photos = [];
    Promise.all([chargerScript('vendor/jspdf.umd.min.js'), enLigne() ? rafraichirDossier(ctx.id, ctx.role, ctx.jeton).catch(function () {}) : null]).then(function () { return chargerScript('js/pdf.js'); }).then(function () {
      ctx = contexteVue();
      var liste = CC.periode(ctx.r.photos, debut, fin).slice(-12);
      var i = 0;
      function suivante() {
        if (i >= liste.length) return Promise.resolve();
        var e = liste[i++], d = e.donnees, p = { nom: d.photo, legende: d.legende, le: e.le, auteur: e.auteur, sha256: d.sha256 };
        photos.push(p);
        msgFeuille('Photos : ' + i + ' / ' + liste.length + '…');
        return fetch(R.urlPhoto(ctx.id, d.photo, ctx.jeton), { credentials: 'omit' }).then(function (r) { return r.ok ? r.blob() : null; })
          .then(function (b) { return b ? PH.miniature(b, 1000) : null; }).then(function (m) { if (m) { p.url = m.url; p.l = m.l; p.h = m.h; } }, function () {}).then(suivante);
      }
      return suivante().then(function () { return CC.verifierChaine(ctx.id, ctx.evs); }).then(function (v) {
        S.verif[ctx.id] = v;
        var res = window.RAPPORT.creer({ ctx: ctx, periode: { debut: debut, fin: fin, semaine: periode === 'semaine' }, verification: v, photos: photos, premium: ctx.illimite, editeLe: new Date().toISOString() });
        var url = URL.createObjectURL(res.blob);
        var fichier = null;
        try { fichier = new File([res.blob], res.nom, { type: 'application/pdf' }); } catch (e) { fichier = null; }
        var peutPartager = !!(fichier && navigator.canShare && navigator.canShare({ files: [fichier] }));
        feuilleEtat = { pdf: fichier, url: url };
        $('#feuille .feuille-contenu').innerHTML = fr('<button type="button" class="feuille-fermer" data-action="fermer-feuille" aria-label="Fermer">' + ICO.fermer + '</button><h2>Rapport PDF prêt</h2><p>' + res.pages + ' page' + (res.pages > 1 ? 's' : '') + ' · ' + Math.max(1, Math.round(res.blob.size / 1024)) + ' Ko' + (ctx.illimite ? '' : ' · version gratuite (mention en bas de page)') + '</p>' +
          '<div class="rang"><a class="btn plein large" id="pdf-telecharger" href="' + url + '" download="' + esc(res.nom) + '">' + ICO.telecharger + 'Télécharger</a>' +
          (peutPartager ? '<button type="button" class="btn sec large" data-action="pdf-partager">' + ICO.partager + 'Envoyer (WhatsApp…)</button>' : '') + '</div>' +
          (v.ok ? '<p class="petit">' + ICO.bouclier + ' Historique vérifié : intact.</p>' : '<p class="erreur">L\'historique ne se vérifie pas entièrement (voir le PDF).</p>'));
      });
    }).catch(function () { msgFeuille('Impossible de créer le PDF pour le moment. Vérifiez le réseau et réessayez.', true); });
  }

  // ---------- Sauvegarde ----------
  function sauvegarder() {
    var data = { app: 'chantierclair', version: 1, exporteLe: new Date().toISOString(), chantiers: S.chantiers, liens: S.liens, reglages: S.reglages, pass: S.pass, creations: S.creations };
    telecharger(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'sauvegarde-chantier-clair-' + aujourdhui() + '.json');
    toast('Sauvegarde téléchargée. Gardez ce fichier en lieu sûr : il contient vos liens secrets.', 6000);
  }
  function importer(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var d; try { d = JSON.parse(lecteur.result); } catch (e) { d = null; }
      if (!d || d.app !== 'chantierclair' || !Array.isArray(d.chantiers)) return toast('Ce fichier n\'est pas une sauvegarde Chantier Clair.');
      var n = 0, suite = [];
      d.chantiers.forEach(function (c) {
        if (!c || !CC.RE_ID.test(c.id) || !c.jetons || !CC.RE_JETON.test(c.jetons.proprio || '')) return;
        var ici = chantierPar(c.id);
        if (ici && (ici.evenements || []).length >= (c.evenements || []).length) return;
        if (ici) S.chantiers.splice(S.chantiers.indexOf(ici), 1);
        S.chantiers.push(c); suite.push(sauverChantier(c)); n++;
      });
      (d.liens || []).forEach(function (l) { if (l && l.cle && CC.RE_ID.test(l.id || '') && !lienPar(l.role, l.id)) { S.liens.push(l); suite.push(sauverLien(l)); } });
      if (d.pass && !S.pass) { S.pass = d.pass; suite.push(sauverKv('pass', S.pass)); }
      if ((+d.creations || 0) > S.creations) { S.creations = +d.creations; suite.push(sauverKv('creations', S.creations)); }
      Promise.all(suite).then(function () { toast(n + ' chantier' + (n > 1 ? 's' : '') + ' importé' + (n > 1 ? 's' : '') + ' ✓'); verifierPassRoutine(true); });
    };
    lecteur.readAsText(fichier);
  }

  // ---------- Événements ----------
  var ACTIONS = {
    'fermer-feuille': fermerFeuille,
    'feuille': function (el) { feuilleAction(el.getAttribute('data-type'), el); },
    'modifier': feuilleModifier,
    'voir-etape': function (el) { voirEtape(el.getAttribute('data-k')); },
    'ajouter-etape': function () { var ol = $('#ed-etapes'); if (!ol) return; if (ol.children.length >= CC.MAX_ETAPES) return toast(CC.MAX_ETAPES + ' étapes au plus.'); ol.insertAdjacentHTML('beforeend', ligneEtape({ k: '', n: '', b: 0 })); var i = ol.lastElementChild.querySelector('.et-nom'); i.focus(); },
    'retirer-etape': function (el) { var li = el.closest('li'); if (li && li.parentNode.children.length > 1) { li.remove(); majTotalBudget(); } },
    'ajouter-ligne': function () { var ol = $('#lignes-ed'); if (!ol) return; if (ol.children.length >= CC.MAX_LIGNES) return toast(CC.MAX_LIGNES + ' lignes au plus.'); ol.insertAdjacentHTML('beforeend', ligneMateriau()); ol.lastElementChild.querySelector('.m-a').focus(); },
    'photo-retirer': function (el) { if (!feuilleEtat) return; var i = +el.getAttribute('data-i'), p = feuilleEtat.photos.splice(i, 1)[0]; if (p) URL.revokeObjectURL(p.url); afficherApercus(); },
    'voir-photo': function (el) {
      ouvrirFeuille('<h2>Photo</h2><img class="photo-grande" alt="' + esc(el.getAttribute('data-legende') || 'Photo') + '" src="' + esc(el.getAttribute('data-src')) + '">' +
        '<p><strong>' + esc(el.getAttribute('data-legende') || '') + '</strong></p><p class="petit">' + esc(CC.dateHeureFr(el.getAttribute('data-le'))) + '</p>' +
        (el.getAttribute('data-sha') ? '<p class="empreinte">sha256 ' + esc(el.getAttribute('data-sha')) + '</p>' : ''));
    },
    'retirer-file': function (el) { if (confirm('Supprimer cette action non envoyée ?')) R.retirer(+el.getAttribute('data-n')).then(function () { return R.liste(); }).then(function (l) { S.file = l; majReseau(); rendre(true); R.vider().catch(function () {}); }); },
    'reessayer': function (el) { R.reessayer(+el.getAttribute('data-n')).then(function () { return R.vider(); }).catch(function () {}); },
    'vider-file': function () { R.vider().catch(function () {}); },
    'verifier': verifier,
    'pdf': choisirPdf,
    'pdf-go': function (el) { genererPdf(el.getAttribute('data-periode')); },
    'pdf-partager': function () { if (feuilleEtat && feuilleEtat.pdf) navigator.share({ files: [feuilleEtat.pdf], title: 'Rapport de chantier' }).catch(function () {}); },
    'partager': function (el) { var c = chantierPar(el.getAttribute('data-id')); if (c) partagerTexte(textePartage(c, el.getAttribute('data-quoi'))); },
    'copier': function (el) { var c = chantierPar(el.getAttribute('data-id')); if (c) copier(textePartage(c, el.getAttribute('data-quoi'))); },
    'tout-voir': function (el) { S.toutVoir[el.getAttribute('data-id')] = true; rendre(true); },
    'recharger': function () { location.reload(); },
    'actualiser': function (el) {
      if (!enLigne()) return toast('Pas de réseau.');
      el.disabled = true;
      var p = V.nom === 'accueil' ? rafraichirTout(true) : (function () { var c = contexteVue(); return c ? rafraichirDossier(c.id, c.role, c.jeton) : Promise.resolve(); })();
      p.then(function () { toast('À jour ✓'); rendre(true); }, function () { toast('Actualisation impossible.'); rendre(true); });
    },
    'retirer-chantier': function (el) {
      var id = el.getAttribute('data-id'), c = chantierPar(id);
      if (!c || !confirm('Retirer ce chantier de ce téléphone ? Il reste sur le serveur : vous pourrez le retrouver avec votre lien propriétaire ou une sauvegarde.')) return;
      S.chantiers.splice(S.chantiers.indexOf(c), 1);
      DB.effacer('chantiers', id).then(function () { location.hash = '#/'; });
    },
    'sauvegarder': sauvegarder,
    'installer': function () {
      if (invite) { invite.prompt(); invite.userChoice.then(function () { invite = null; majInstall(); }); return; }
      ouvrirFeuille('<h2>Installer Chantier Clair</h2>' + instructionsInstall());
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
    else if (f === 'action') soumettreAction(ev.target);
    else if (f === 'modifier') soumettreModifier(ev.target);
    else if (f === 'coller') {
      var l = CC.lireLienRole(ev.target.elements.lien.value);
      if (!l) { $('.msg', ev.target).textContent = 'Lien non reconnu : copiez le lien en entier.'; $('.msg', ev.target).classList.add('erreur'); return; }
      location.hash = '#/' + l.role + '/' + l.id + '/' + l.jeton + (l.jetons && l.jetons.chef ? '/' + l.jetons.chef + '/' + l.jetons.temoin : '');
    }
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.classList.contains('et-budget')) majTotalBudget();
    else if (t.closest && t.closest('#lignes-ed')) majTotalDemande();
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.name === 'theme' && V.nom === 'reglages') { S.reglages.theme = t.value; appliquerTheme(); sauverKv('reglages', S.reglages); toast('Affichage enregistré ✓'); }
    else if (t.id === 'f-etape' && feuilleEtat && feuilleEtat.type === 'avancement') majPourcent();
    else if (t.id === 'import-fichier' && t.files && t.files[0]) importer(t.files[0]);
    else if (t.hasAttribute && t.hasAttribute('data-photos') && t.files && t.files.length && feuilleEtat) {
      Array.prototype.slice.call(t.files, 0, 4 - feuilleEtat.photos.length).forEach(function (f) { feuilleEtat.photos.push({ file: f, url: URL.createObjectURL(f) }); });
      t.value = '';
      afficherApercus();
    }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !$('#feuille').hidden) fermerFeuille(); });
  $('#installer').addEventListener('click', function () { ACTIONS.installer(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
