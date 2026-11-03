/* Tontine Claire — interface. Routes par le « # » de l'adresse ; données partagées par l'API « dossiers » (liens secrets),
   copie locale pour l'usage hors ligne. L'application n'encaisse et ne déplace jamais d'argent. */
(function () {
  'use strict';
  var TC = window.TC, DB = window.TCDB;
  var VERSION = '1.0.0';
  var NOTICE = 'Tontine Claire n\'encaisse jamais d\'argent : les versements se font entre vous, l\'application garde la trace.';
  var MODES = ['Wave', 'Orange Money', 'Free Money', 'Espèces', 'Autre'];
  var URL_PASS = '../../boutique/' + TC.PASS_SLUG + '.html';
  var S = { tontines: [], pass: null, brouillon: null, reglages: {} };

  // ---------- Petits outils ----------
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var ICO = (function () {
    var p = {
      retour: '<path d="M15 18l-6-6 6-6"/>', plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
      accueil: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
      reglages: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
      etoile: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
      partager: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
      wa: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.3-1.4-2-1-1 .8a4 4 0 0 1-2.2-2.2l.8-1-1-2z"/>',
      copier: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
      ok: '<path d="M5 12.5 10 17 19 7"/>', alerte: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
      cloche: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
      calendrier: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
      grille: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
      historique: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
      regles: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
      gerer: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
      pdf: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
      cadenas: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
      bouclier: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
      cadeau: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8S10.5 3.5 8 4.5 9 8 12 8zm0 0s1.5-4.5 4-3.5S15 8 12 8z"/>',
      actualiser: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 3v5h5M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 21v-5h-5"/>',
      chevron: '<path d="m9 6 6 6-6 6"/>', gauche: '<path d="m15 6-6 6 6 6"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
      installer: '<path d="M12 3v11m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="4" rx="1"/>',
      des: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.3"/><circle cx="16" cy="16" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="16" cy="8" r="1.3"/><circle cx="8" cy="16" r="1.3"/>',
      haut: '<path d="m6 15 6-6 6 6"/>', bas: '<path d="m6 9 6 6 6-6"/>',
      crayon: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
      tel: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
      lien: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
      main: '<path d="M12 21c-4.4 0-8-3.6-8-8V8.5a1.5 1.5 0 0 1 3 0V12M7 12V5.5a1.5 1.5 0 0 1 3 0V11M10 11V4.5a1.5 1.5 0 0 1 3 0V11M13 11V6.5a1.5 1.5 0 0 1 3 0V14l1.5-2a1.6 1.6 0 0 1 2.5 2l-3 5a6 6 0 0 1-5 2"/>',
      groupe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
      sortie: '<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M10 17l5-5-5-5M15 12H3"/>',
      note: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>'
    };
    var o = {};
    Object.keys(p).forEach(function (k) { o[k] = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + p[k] + '</svg>'; });
    return o;
  })();
  function aujourdhui() { return TC.isoLocal(); }
  function premium() { return !!(S.pass && S.pass.o); }
  function base() { return location.href.replace(/[?#].*$/, '').replace(/index\.html$/, ''); }
  function lienMembre(rec) { return TC.lienTontine(base(), 'membre', rec.id, rec.role === 'proprio' ? rec.jetonMembre : rec.jeton); }
  function lienOrg(rec) { return TC.lienTontine(base(), 'proprio', rec.id, rec.jeton) + (rec.jetonMembre ? '/' + rec.jetonMembre : ''); }
  function estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

  // ---------- Stockage ----------
  function charger() {
    return Promise.all([DB.lire('tontines'), DB.lire('pass'), DB.lire('brouillon'), DB.lire('reglages')]).then(function (r) {
      S.tontines = Array.isArray(r[0]) ? r[0] : []; S.pass = r[1] || null; S.brouillon = r[2] || null; S.reglages = r[3] || {};
    });
  }
  function sauver() { return DB.mettre('tontines', S.tontines); }
  function trouver(id, role) { return S.tontines.filter(function (x) { return x.id === id && x.role === role; })[0] || null; }
  function activesOrg() { return S.tontines.filter(function (x) { return x.role === 'proprio' && !(x.dossier && x.dossier.statut === 'clos'); }).length; }
  var persistance = false;
  function demanderPersistance() {
    if (persistance) return; persistance = true;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) { /* rien */ }
  }

  // ---------- API ----------
  function appel(chemin, corps) {
    var o = corps ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) } : { cache: 'no-store' };
    return fetch(TC.API + chemin, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.message || ('Service indisponible (' + r.status + ').')); e.status = r.status; e.code = j.erreur; throw e; }
        return j;
      });
    }, function () { var e = new Error('Pas de connexion Internet. Réessayez quand vous êtes connecté.'); e.reseau = true; throw e; });
  }
  var enCours = {};
  function actualiser(rec, silencieux) {
    if (!rec) return Promise.resolve();
    if (navigator.onLine === false) { if (!silencieux) toast('Hors ligne : voici la dernière copie enregistrée.'); return Promise.resolve(); }
    var cle = rec.id + rec.role;
    if (enCours[cle]) return enCours[cle];
    enCours[cle] = appel('/' + rec.id + '?t=' + encodeURIComponent(rec.jeton)).then(function (j) {
      rec.dossier = j.dossier; rec.lu = new Date().toISOString(); rec.erreur = '';
      rec.titre = j.dossier.titre;
      return sauver();
    }).catch(function (e) {
      if (e.status === 404) { rec.erreur = 'introuvable'; sauver(); }
      if (!silencieux) toast(e.status === 404 ? 'Tontine introuvable : lien faux ou données effacées.' : e.message);
    }).then(function () { delete enCours[cle]; rerendre(rec); });
    return enCours[cle];
  }
  function envoyer(rec, type, donnees, maj) {
    var corps = { t: rec.jeton, type: type, donnees: donnees || {} };
    if (maj) corps.maj = maj;
    return appel('/' + rec.id + '/evenement', corps).then(function (j) {
      return actualiser(rec, true).then(function () { return j; });
    }).catch(function (e) {
      if (e.code === 'plein') e.message = 'L\'historique de cette tontine est complet (' + TC.MAX_EVENEMENTS + ' actions). Clôturez-la et créez la suite.';
      throw e;
    });
  }

  // ---------- Composants ----------
  var minuteurToast = 0;
  function toast(msg, action) {
    var t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button" class="toast-btn">' + esc(action.label) + '</button>' : '');
    t.hidden = false; t.classList.add('visible');
    if (action) t.querySelector('button').onclick = function () { cacherToast(); action.fn(); };
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(cacherToast, action ? 8000 : 3800);
  }
  function cacherToast() { var t = $('#toast'); t.classList.remove('visible'); setTimeout(function () { if (!t.classList.contains('visible')) t.hidden = true; }, 250); }
  var ouverte = null;
  function feuille(titre, contenu, init) {
    fermerFeuille();
    cacherToast();
    var fond = document.createElement('div');
    fond.className = 'feuille-fond';
    fond.innerHTML = '<div class="feuille" role="dialog" aria-modal="true" aria-labelledby="feuille-titre"><div class="feuille-tete"><h2 id="feuille-titre">' + esc(titre) +
      '</h2><button type="button" class="icone-btn" data-fermer aria-label="Fermer">' + ICO.x + '</button></div><div class="feuille-corps">' + contenu + '</div></div>';
    document.body.appendChild(fond);
    document.body.classList.add('fige');
    ouverte = { el: fond, avant: document.activeElement };
    fond.addEventListener('click', function (e) { if (e.target === fond || e.target.closest('[data-fermer]')) fermerFeuille(); });
    var f1 = fond.querySelector('.feuille-corps input:not([type=hidden]):not([type=checkbox]), .feuille-corps select, .feuille-corps textarea, .feuille-corps .btn');
    (f1 || fond.querySelector('[data-fermer]')).focus({ preventScroll: true });
    if (init) init(fond.querySelector('.feuille'));
    requestAnimationFrame(function () { fond.classList.add('ouverte'); });
    return fond.querySelector('.feuille');
  }
  function fermerFeuille() {
    if (!ouverte) return;
    var o = ouverte; ouverte = null;
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
      });
      var obs = new MutationObserver(function () { if (!fini && !(ouverte && document.body.contains(ouverte.el))) { obs.disconnect(); fini = true; ok(false); } });
      obs.observe(document.body, { childList: true });
    });
  }
  function telecharger(blob, nom) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nom; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
  }
  function copier(texte) {
    var fini = function () { toast('Copié.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(texte).then(fini, function () { copierVieux(texte); fini(); });
    copierVieux(texte); fini();
  }
  function copierVieux(texte) {
    var z = document.createElement('textarea'); z.value = texte; z.setAttribute('readonly', ''); z.style.position = 'fixed'; z.style.opacity = '0';
    document.body.appendChild(z); z.select(); try { document.execCommand('copy'); } catch (e) { /* rien */ } z.remove();
  }
  function partager(titre, texte, url) {
    if (navigator.share) return navigator.share({ title: titre, text: texte, url: url }).catch(function () {});
    copier(url ? texte + '\n' + url : texte);
  }
  function occuper(btn, oui) { if (!btn) return; btn.disabled = oui; if (oui) { btn.dataset.txt = btn.innerHTML; btn.innerHTML = '<span class="roue" aria-hidden="true"></span>Envoi…'; } else if (btn.dataset.txt) btn.innerHTML = btn.dataset.txt; }
  function champ(label, id, valeur, o) {
    o = o || {};
    var attrs = ' id="' + id + '"' + (o.nom ? ' name="' + o.nom + '"' : '') + (o.requis ? ' required' : '') + (o.mode ? ' inputmode="' + o.mode + '"' : '') +
      (o.place ? ' placeholder="' + esc(o.place) + '"' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') + (o.auto ? ' autocomplete="' + o.auto + '"' : ' autocomplete="off"') + (o.aide ? ' aria-describedby="' + id + '-aide"' : '');
    var input = o.zone ? '<textarea' + attrs + ' rows="' + (o.lignes || 3) + '">' + esc(valeur) + '</textarea>'
      : '<input type="' + (o.type || 'text') + '"' + attrs + ' value="' + esc(valeur) + '"' + (o.min ? ' min="' + o.min + '"' : '') + (o.maxDate ? ' max="' + o.maxDate + '"' : '') + '>';
    return '<div class="champ"><label for="' + id + '">' + esc(label) + '</label>' + input + (o.aide ? '<small id="' + id + '-aide">' + o.aide + '</small>' : '') + '</div>';
  }
  function options(liste, choix) { return liste.map(function (x) { var v = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x; return '<option value="' + esc(v) + '"' + (String(v) === String(choix) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join(''); }
  function initiales(nom) { return esc(String(nom || '?').trim().charAt(0).toUpperCase() || '?'); }
  function puce(statut) { var s = TC.STATUTS[statut] || { court: statut, sym: '' }; return '<span class="chip c-' + statut + '"><span aria-hidden="true">' + esc(s.sym) + '</span>' + esc(s.court) + '</span>'; }

  // ---------- Cadre et routeur ----------
  function vue(html) { $('#vue').innerHTML = html; }
  function cadre(o) {
    $('#titre').textContent = o.titre || 'Tontine Claire';
    document.title = (o.titre && o.titre !== 'Tontine Claire' ? o.titre + ' · ' : '') + 'Tontine Claire';
    var r = $('#retour'); r.hidden = !o.retour; r.dataset.href = o.retour || '';
    $$('#nav a').forEach(function (a) { a.classList.toggle('actif', a.dataset.nav === o.nav); if (a.dataset.nav === o.nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.body.classList.toggle('sans-nav', !!o.sansNav);
  }
  var routeAvant = '';
  function router() {
    fermerFeuille();
    var brut = location.hash.replace(/^#/, '') || '/', iq = brut.indexOf('?');
    var chemin = iq < 0 ? brut : brut.slice(0, iq), params = new URLSearchParams(iq < 0 ? '' : brut.slice(iq + 1));
    var h = brut;
    var p = chemin.split('/').filter(Boolean).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    var memeRoute = routeAvant === h, y = window.scrollY;
    routeAvant = h;
    if (!p.length) vueAccueil();
    else if (p[0] === 'nouvelle') vueNouvelle();
    else if (p[0] === 'rejoindre' && p[1] && p[2]) ouvrirLien('membre', p[1], p[2]);
    else if (p[0] === 'org' && p[1] && p[2]) ouvrirLien('proprio', p[1], p[2], p[3]);
    else if ((p[0] === 't' || p[0] === 'm') && p[1]) vueTontine(p[0] === 't' ? 'proprio' : 'membre', p[1], p[2] || 'tour', p[3]);
    else if (p[0] === 'pass') vuePass(params.get('code'));
    else if (p[0] === 'reglages') vueReglages();
    else { location.replace('#/'); return; }
    if (memeRoute) window.scrollTo(0, y);
    else { window.scrollTo(0, 0); $('#vue').focus({ preventScroll: true }); }
  }
  function rerendre(rec) {
    var h = location.hash;
    if (rec && h.indexOf('/' + rec.id) < 0 && h !== '' && h !== '#/' ) return;
    if (ouverte) return; // ne pas fermer une feuille ouverte : la vue sera à jour au prochain affichage
    router();
  }

  // ---------- Accueil ----------
  function bandeauInstall() {
    if (estInstallee() || (!invite && !estIOS())) return '';
    return '<div class="bandeau-install"><img src="icons/icon-192.png" alt="" width="40" height="40"><p><b>Installez l\'application</b><span>Accès en un geste, même sans Internet.</span></p>' +
      '<button type="button" class="btn plein" data-action="installer">Installer</button></div>';
  }
  function vueAccueil() {
    cadre({ titre: 'Tontine Claire', nav: 'accueil' });
    if (!S.tontines.length) {
      vue('<section class="bienvenue"><img src="icons/icon-192.png" alt="" width="84" height="84"><h1>Tontine Claire</h1>' +
        '<p class="lead">Le carnet de votre tontine, partagé avec tout le groupe : les tours, les cotisations, les rappels.</p>' +
        '<p class="notice">' + ICO.info + '<span>' + esc(NOTICE) + '</span></p>' +
        '<a class="btn plein large" href="#/nouvelle">' + ICO.plus + 'Créer une tontine</a>' +
        '<button type="button" class="btn sec large" data-action="coller-lien">' + ICO.lien + 'J\'ai reçu un lien</button>' +
        '<ul class="atouts">' +
        '<li>' + ICO.des + '<span><b>Ordre des tours équitable</b> : tirage au sort que chacun peut vérifier.</span></li>' +
        '<li>' + ICO.grille + '<span><b>Qui a versé, qui doit encore</b> : une grille claire, mise à jour pour tous.</span></li>' +
        '<li>' + ICO.wa + '<span><b>Rappels polis par WhatsApp</b> : c\'est vous qui envoyez, rien n\'est automatique.</span></li>' +
        '<li>' + ICO.bouclier + '<span><b>Historique infalsifiable</b> : chaque action est scellée par une empreinte.</span></li>' +
        '</ul>' + bandeauInstall() + '</section>');
      return;
    }
    var h = '<div class="salut"><h1>Mes tontines</h1></div>' + bandeauInstall();
    S.tontines.slice().sort(function (a, b) { return (b.ajouteLe || '').localeCompare(a.ajouteLe || ''); }).forEach(function (rec) {
      var href = '#/' + (rec.role === 'proprio' ? 't' : 'm') + '/' + rec.id;
      if (!rec.dossier) {
        h += '<a class="carte carte-tontine" href="' + href + '"><div class="ct-haut"><strong>' + esc(rec.titre || rec.id) + '</strong>' + badgeRole(rec) + '</div><p class="petit">' +
          (rec.erreur === 'introuvable' ? 'Introuvable : lien faux ou données effacées.' : 'Pas encore chargée : ouvrez-la avec Internet.') + '</p></a>';
        return;
      }
      var t = TC.decoderTontine(rec.dossier), r = TC.calculer(t, rec.dossier.evenements, aujourdhui());
      var tr = r.courant || r.tours[r.tours.length - 1];
      var payes = tr ? tr.payes : 0;
      h += '<a class="carte carte-tontine" href="' + href + '"><div class="ct-haut"><strong>' + esc(t.titre) + '</strong>' + badgeRole(rec) + '</div>' +
        '<p class="petit">' + TC.formatF(t.montant) + ' ' + esc(TC.parPeriode(t.frequence, t.intervalle)) + ' · ' + t.membres.length + ' membres</p>' +
        (t.statut === 'clos' ? '<p class="ct-tour">Tontine clôturée</p>' : tr ? '<p class="ct-tour">' + ICO.cadeau + '<span>Tour ' + tr.n + ' · ' + esc(TC.dateCourte(tr.date)) + ' · <b>' + esc(TC.nomMembre(t, tr.beneficiaire)) + '</b></span></p>' +
          '<div class="barre" role="img" aria-label="' + payes + ' sur ' + t.membres.length + ' ont versé"><span style="width:' + Math.round(100 * payes / Math.max(1, t.membres.length)) + '%"></span></div>' +
          '<p class="ct-bas"><span>' + payes + ' / ' + t.membres.length + ' ont versé</span>' + (r.retardsMembres.length ? '<span class="chip c-retard">' + r.retardsMembres.length + ' en retard</span>' : '') +
          (rec.role === 'proprio' && r.aConfirmer.length ? '<span class="chip c-declare">' + r.aConfirmer.length + ' à confirmer</span>' : '') + '</p>' : '') + '</a>';
    });
    h += '<div class="rang-btn"><a class="btn plein" href="#/nouvelle">' + ICO.plus + 'Nouvelle tontine</a><button type="button" class="btn sec" data-action="coller-lien">' + ICO.lien + 'J\'ai reçu un lien</button></div>';
    h += '<p class="notice petite">' + ICO.info + '<span>' + esc(NOTICE) + '</span></p>';
    vue(h);
  }
  function badgeRole(rec) { return rec.role === 'proprio' ? '<span class="badge org">Vous organisez</span>' : '<span class="badge">Membre</span>'; }

  // ---------- Lien reçu ----------
  function ouvrirLien(role, id, jeton, jetonMembre) {
    if (!/^D-[0-9A-HJKMNP-TV-Z]{10}$/.test(id) || !/^[A-Za-z0-9_-]{20,64}$/.test(jeton)) { toast('Lien non reconnu.'); location.replace('#/'); return; }
    var rec = trouver(id, role);
    if (!rec) { rec = { id: id, role: role, jeton: jeton, ajouteLe: new Date().toISOString(), tels: {} }; S.tontines.push(rec); }
    rec.jeton = jeton;
    if (role === 'proprio' && jetonMembre && /^[A-Za-z0-9_-]{20,64}$/.test(jetonMembre)) rec.jetonMembre = jetonMembre;
    sauver();
    demanderPersistance();
    history.replaceState(null, '', location.pathname + location.search + '#/' + (role === 'proprio' ? 't' : 'm') + '/' + id);
    routeAvant = '';
    router();
    actualiser(rec);
  }

  // ---------- Création d'une tontine ----------
  function nouveauBrouillon() {
    var d = new Date(); d.setDate(d.getDate() + 7);
    return Object.assign({ etape: 1, titre: '', organisateur: '', montant: '', frequence: 'mensuelle', intervalle: 10, debut: TC.isoLocal(d),
      membres: [{ id: 1, nom: '', mains: 1, tel: '' }, { id: 2, nom: '', mains: 1, tel: '' }, { id: 3, nom: '', mains: 1, tel: '' }],
      ordreMode: 'tirage', graine: TC.graineNouvelle(), tirageLe: '', ordre: [] }, JSON.parse(JSON.stringify(TC.REGLES_DEFAUT)));
  }
  function sauverBrouillon() { return DB.mettre('brouillon', S.brouillon); }
  function membresValides(b) { return b.membres.filter(function (m) { return TC.nettoyerNom(m.nom); }); }
  function etapes(n) {
    var noms = ['Cotisation', 'Membres', 'Ordre', 'Règles', 'Vérifier'];
    return '<ol class="etapes-ind" aria-label="Étapes">' + noms.map(function (x, i) {
      return '<li class="' + (i + 1 < n ? 'fait' : i + 1 === n ? 'actif' : '') + '"' + (i + 1 === n ? ' aria-current="step"' : '') + '><span>' + (i + 1) + '</span>' + x + '</li>';
    }).join('') + '</ol>';
  }
  function boutonsEtape(n, libelle) {
    return '<div class="rang-btn etape-btn">' + (n > 1 ? '<button type="button" class="btn sec" data-action="etape-prec">Retour</button>' : '') +
      '<button type="submit" class="btn plein"' + (n === 5 ? ' id="btn-creer"' : '') + '>' + (libelle || 'Continuer') + '</button></div>';
  }
  function vueNouvelle() {
    cadre({ titre: 'Nouvelle tontine', retour: '#/', nav: 'nouvelle' });
    if (!S.brouillon) S.brouillon = nouveauBrouillon();
    var lim = TC.limiteAtteinte(activesOrg(), 0, premium());
    if (lim) {
      vue('<section class="carte offre"><h1>Une tontine à la fois en version gratuite</h1><p>Vous organisez déjà une tontine en cours sur ce téléphone. Clôturez-la ou prenez le <b>Pass Tontine 12 mois</b> pour en suivre plusieurs en même temps.</p>' +
        offreContenu() + '</section>');
      return;
    }
    var b = S.brouillon, n = b.etape, h = etapes(n);
    if (n === 1) {
      h += '<form class="carte" data-form="etape1"><h1 class="h-etape">La tontine</h1>' +
        champ('Nom de la tontine', 'n-titre', b.titre, { requis: true, max: 80, place: 'Ex. : Natt des amies de Pikine' }) +
        champ('Votre prénom (facultatif)', 'n-org', b.organisateur, { max: 30, place: 'Ex. : Awa', aide: 'Il signe les rappels. Prénom ou surnom seulement.' }) +
        champ('Cotisation par personne et par tour (F CFA)', 'n-montant', b.montant ? TC.formatNombre(b.montant) : '', { requis: true, mode: 'numeric', place: 'Ex. : 10 000' }) +
        '<fieldset class="choix"><legend>Fréquence des tours</legend>' +
        [['mensuelle', 'Chaque mois'], ['hebdomadaire', 'Chaque semaine'], ['autre', 'Autre : tous les … jours']].map(function (f) {
          return '<label class="option"><input type="radio" name="frequence" value="' + f[0] + '"' + (b.frequence === f[0] ? ' checked' : '') + '><span>' + f[1] + '</span></label>';
        }).join('') + '</fieldset>' +
        '<div id="zone-intervalle"' + (b.frequence === 'autre' ? '' : ' hidden') + '>' + champ('Nombre de jours entre deux tours', 'n-intervalle', b.intervalle || 10, { mode: 'numeric' }) + '</div>' +
        champ('Date du premier tour', 'n-debut', b.debut, { type: 'date', requis: true, aide: 'Jour où le premier bénéficiaire reçoit la cagnotte. Les cotisations sont dues ce jour-là.' }) +
        '<p id="err-etape" class="erreur" role="alert" hidden></p>' + boutonsEtape(1) + '</form>';
    } else if (n === 2) {
      var nb = membresValides(b).length;
      h += '<form class="carte" data-form="etape2"><h1 class="h-etape">Les membres</h1><p class="petit">Prénoms ou surnoms seulement. Le numéro est facultatif : il reste <b>sur ce téléphone</b> pour ouvrir WhatsApp, il n\'est jamais envoyé.</p>' +
        '<div id="liste-membres">' + b.membres.map(function (m, i) {
          return '<div class="ligne-membre"><span class="num" aria-hidden="true">' + (i + 1) + '</span><div class="lm-champs">' +
            '<label class="vh" for="m-nom-' + i + '">Prénom du membre ' + (i + 1) + '</label><input type="text" id="m-nom-' + i + '" value="' + esc(m.nom) + '" maxlength="' + TC.NOM_MAX + '" placeholder="Prénom ou surnom" autocomplete="off">' +
            '<div class="lm-bas"><label class="vh" for="m-tel-' + i + '">Numéro WhatsApp du membre ' + (i + 1) + ' (facultatif)</label><input type="tel" id="m-tel-' + i + '" value="' + esc(m.tel || '') + '" placeholder="N° facultatif" autocomplete="off">' +
            '<label class="vh" for="m-mains-' + i + '">Nombre de mains</label><select id="m-mains-' + i + '">' + options([[1, '1 main'], [2, '2 mains'], [3, '3 mains'], [4, '4 mains']], m.mains || 1) + '</select></div></div>' +
            '<button type="button" class="icone-btn" data-action="membre-suppr" data-i="' + i + '" aria-label="Retirer ' + esc(m.nom || 'ce membre') + '">' + ICO.x + '</button></div>';
        }).join('') + '</div>' +
        '<div class="rang-btn"><button type="button" class="btn sec" data-action="membre-ajout">' + ICO.plus + 'Ajouter un membre</button><button type="button" class="btn sec" data-action="membres-coller">' + ICO.copier + 'Coller une liste</button></div>' +
        '<p class="petit" id="compte-membres">' + nb + ' membre' + (nb > 1 ? 's' : '') + (premium() ? '' : ' · version gratuite : ' + TC.GRATUIT_MEMBRES + ' au plus') + '. « 2 mains » : la personne verse deux fois et reçoit deux fois.</p>' +
        '<p id="err-etape" class="erreur" role="alert" hidden></p>' + boutonsEtape(2) + '</form>';
    } else if (n === 3) {
      var ms = membresValides(b);
      if (!b.ordre.length || TC.listeMains(ms).join() !== b.ordre.slice().sort(function (x, y) { return x - y; }).join()) {
        b.ordre = b.ordreMode === 'tirage' ? [] : b.ordreMode === 'date' ? TC.ordreParDate(ms) : TC.ordreManuel(ms);
      }
      h += '<form class="carte" data-form="etape3"><h1 class="h-etape">Ordre des tours</h1><fieldset class="choix"><legend>Comment fixer l\'ordre ?</legend>' +
        [['tirage', 'Tirage au sort', 'Équitable et vérifiable par tous.'], ['manuel', 'Je fixe l\'ordre', 'Selon l\'accord du groupe.'], ['date', 'Selon la date souhaitée', 'Chacun indique quand il a besoin de la cagnotte.']].map(function (o) {
          return '<label class="option"><input type="radio" name="ordre" value="' + o[0] + '"' + (b.ordreMode === o[0] ? ' checked' : '') + '><span>' + o[1] + '<small>' + o[2] + '</small></span></label>';
        }).join('') + '</fieldset>';
      if (b.ordreMode === 'tirage') {
        h += champ('Graine du tirage', 'n-graine', b.graine, { max: 120, aide: 'Le tirage dépend seulement de cette graine et de la liste des membres. Vous pouvez y mettre des chiffres choisis ensemble en réunion. Tout le monde pourra refaire le calcul.' }) +
          '<div class="rang-btn"><button type="button" class="btn plein" data-action="tirer">' + ICO.des + (b.ordre.length ? 'Refaire le tirage' : 'Faire le tirage au sort') + '</button><button type="button" class="btn sec" data-action="nouvelle-graine">Nouvelle graine</button></div>';
      }
      if (b.ordreMode === 'date') {
        h += '<p class="petit">Indiquez quand chacun souhaite recevoir la cagnotte. Les dates les plus proches passent en premier ; sans date, à la suite.</p>' + ms.map(function (m) {
          return champ(m.nom + ' souhaite recevoir vers le', 'm-souhait-' + m.id, m.souhait || '', { type: 'date' });
        }).join('') + '<button type="button" class="btn sec large" data-action="trier-dates">Classer selon les dates</button>';
      }
      if (b.ordre.length) {
        var dates = TC.datesTours(b.debut, b.frequence, b.intervalle, b.ordre.length), parId = {};
        ms.forEach(function (m) { parId[m.id] = m; });
        h += '<h2 class="h-ordre">Calendrier obtenu</h2>' + (b.ordreMode === 'tirage' && b.tirageLe ? '<p class="petit" id="info-tirage">Tirage fait le ' + esc(TC.dateHeure(b.tirageLe)) + ' avec la graine « ' + esc(b.graine) + ' ».</p>' : '') +
          '<ol class="ordre" id="ordre-liste">' + b.ordre.map(function (id, i) {
            return '<li><span class="num">' + (i + 1) + '</span><span class="o-nom"><b>' + esc(parId[id] ? parId[id].nom : '?') + '</b><small>' + esc(TC.dateLongue(dates[i])) + '</small></span>' +
              (b.ordreMode === 'manuel' ? '<span class="o-btn"><button type="button" class="icone-btn" data-action="monter" data-i="' + i + '" aria-label="Monter ' + esc(parId[id] ? parId[id].nom : '') + '"' + (i ? '' : ' disabled') + '>' + ICO.haut + '</button>' +
                '<button type="button" class="icone-btn" data-action="descendre" data-i="' + i + '" aria-label="Descendre ' + esc(parId[id] ? parId[id].nom : '') + '"' + (i < b.ordre.length - 1 ? '' : ' disabled') + '>' + ICO.bas + '</button></span>' : '') + '</li>';
          }).join('') + '</ol>';
      }
      h += '<p id="err-etape" class="erreur" role="alert" hidden></p>' + boutonsEtape(3) + '</form>';
    } else if (n === 4) {
      h += '<form class="carte" data-form="etape4"><h1 class="h-etape">Règles du groupe</h1><p class="petit">Écrivez ce que le groupe a décidé. Vous pourrez les modifier plus tard ; chaque changement est noté dans l\'historique.</p>' +
        '<div class="grille2">' + '<div class="champ"><label for="n-grace">Délai accordé</label><select id="n-grace">' + options([[0, 'Aucun'], [1, '1 jour'], [2, '2 jours'], [3, '3 jours'], [5, '5 jours'], [7, '7 jours']], b.grace) + '</select></div>' +
        champ('Amende de retard (F)', 'n-amende', b.amende ? TC.formatNombre(b.amende) : '', { mode: 'numeric', place: '0 = aucune' }) + '</div>' +
        '<fieldset class="choix compact"><legend>L\'amende s\'applique</legend><label class="option"><input type="radio" name="amende_mode" value="fixe"' + (b.amende_mode !== 'jour' ? ' checked' : '') + '><span>Une fois par tour en retard</span></label>' +
        '<label class="option"><input type="radio" name="amende_mode" value="jour"' + (b.amende_mode === 'jour' ? ' checked' : '') + '><span>Par jour de retard</span></label></fieldset>' +
        '<div id="zone-plafond"' + (b.amende_mode === 'jour' ? '' : ' hidden') + '>' + champ('Plafond par tour (F, facultatif)', 'n-plafond', b.amende_plafond ? TC.formatNombre(b.amende_plafond) : '', { mode: 'numeric' }) + '</div>' +
        '<p class="exemple" id="exemple-amende">' + esc(exempleAmende({ amende: b.amende, amendeMode: b.amende_mode, amendePlafond: b.amende_plafond, grace: b.grace })) + '</p>' +
        champ('En cas de retard', 'n-regle-retard', b.regle_retard, { zone: true, lignes: 3, max: 1500 }) +
        champ('Si quelqu\'un quitte la tontine', 'n-regle-depart', b.regle_depart, { zone: true, lignes: 4, max: 1500 }) +
        champ('Autres règles (lieu, moyens de paiement…)', 'n-regle-autres', b.regle_autres, { zone: true, lignes: 3, max: 1500 }) +
        '<p id="err-etape" class="erreur" role="alert" hidden></p>' + boutonsEtape(4) + '</form>';
    } else {
      var ms5 = membresValides(b), t = apercuTontine(b);
      h += '<form class="carte" data-form="etape5"><h1 class="h-etape">Vérifier et créer</h1><dl class="recap">' +
        '<div><dt>Nom</dt><dd>' + esc(b.titre) + '</dd></div><div><dt>Cotisation</dt><dd>' + TC.formatF(b.montant) + ' ' + esc(TC.parPeriode(b.frequence, b.intervalle)) + '</dd></div>' +
        '<div><dt>Membres</dt><dd>' + ms5.length + (t.totalMains !== ms5.length ? ' (' + t.totalMains + ' mains)' : '') + '</dd></div><div><dt>Cagnotte par tour</dt><dd>' + TC.formatF(t.pot) + '</dd></div>' +
        '<div><dt>Premier tour</dt><dd>' + esc(TC.dateLongue(b.debut)) + '</dd></div><div><dt>Dernier tour</dt><dd>' + esc(TC.dateLongue(t.dates[t.dates.length - 1])) + '</dd></div>' +
        '<div><dt>Ordre</dt><dd>' + (b.ordreMode === 'tirage' ? 'Tirage au sort (graine « ' + esc(b.graine) + ' »)' : b.ordreMode === 'date' ? 'Selon les dates souhaitées' : 'Fixé par vous') + '</dd></div></dl>' +
        '<p class="petit">Chacun verse ' + TC.formatF(b.montant) + ' à chaque tour et reçoit une fois ' + TC.formatF(t.pot) + ' (par main). Personne ne gagne ni ne perd d\'argent.</p>' +
        '<p class="notice">' + ICO.info + '<span>' + esc(NOTICE) + '</span></p>' +
        '<p class="petit">Les prénoms, les montants et l\'historique sont gardés sur notre serveur pour être partagés avec le groupe, puis effacés 180 jours après la dernière activité. Les numéros de téléphone restent sur ce téléphone.</p>' +
        '<p id="err-etape" class="erreur" role="alert" hidden></p>' + boutonsEtape(5, 'Créer la tontine') + '</form>';
    }
    vue(h);
  }
  function apercuTontine(b) {
    var ms = membresValides(b);
    var tot = ms.reduce(function (s, m) { return s + Math.max(1, m.mains | 0); }, 0);
    return { totalMains: tot, pot: tot * (b.montant || 0), dates: TC.datesTours(b.debut, b.frequence, b.intervalle, Math.max(1, b.ordre.length || tot)) };
  }
  function exempleAmende(t) {
    var a = TC.entier(t.amende) || 0;
    if (!a) return 'Pas d\'amende : seuls les retards sont signalés.';
    var tt = { amende: a, amendeMode: t.amendeMode, amendePlafond: TC.entier(t.amendePlafond) || 0 };
    var g = (t.grace | 0) ? 'Après ' + (t.grace | 0) + ' jour' + ((t.grace | 0) > 1 ? 's' : '') + ' de délai, ' : '';
    if (t.amendeMode === 'jour') return 'Exemple : ' + g + '3 jours de retard = 3 × ' + TC.formatF(a) + ' = ' + TC.formatF(TC.amendePour(tt, 3)) + (tt.amendePlafond ? ' (au plus ' + TC.formatF(tt.amendePlafond) + ' par tour)' : '') + '.';
    return 'Exemple : ' + g + 'un tour versé en retard = ' + TC.formatF(a) + ' d\'amende, quel que soit le nombre de jours.';
  }
  function lireEtape(n) {
    var b = S.brouillon;
    if (n === 1) {
      b.titre = $('#n-titre').value.trim(); b.organisateur = TC.nettoyerNom($('#n-org').value);
      b.montant = TC.entier($('#n-montant').value); b.frequence = ($('input[name=frequence]:checked') || {}).value || 'mensuelle';
      b.intervalle = Math.max(1, TC.entier($('#n-intervalle').value) || 10); b.debut = $('#n-debut').value;
    } else if (n === 2) {
      b.membres = b.membres.map(function (m, i) {
        return { id: m.id, nom: $('#m-nom-' + i).value, tel: $('#m-tel-' + i).value.trim(), mains: +$('#m-mains-' + i).value || 1, souhait: m.souhait || '' };
      });
    } else if (n === 3) {
      if ($('#n-graine')) b.graine = $('#n-graine').value.trim();
      membresValides(b).forEach(function (m) { var el = $('#m-souhait-' + m.id); if (el) m.souhait = el.value; });
    } else if (n === 4) {
      b.grace = +$('#n-grace').value || 0; b.amende = TC.entier($('#n-amende').value) || 0;
      b.amende_mode = ($('input[name=amende_mode]:checked') || {}).value || 'fixe'; b.amende_plafond = TC.entier($('#n-plafond').value) || 0;
      b.regle_retard = $('#n-regle-retard').value; b.regle_depart = $('#n-regle-depart').value; b.regle_autres = $('#n-regle-autres').value;
    }
  }
  function erreurEtape(msg) { var e = $('#err-etape'); e.textContent = msg; e.hidden = false; e.scrollIntoView({ block: 'center' }); }
  function validerEtape(n) {
    var b = S.brouillon;
    if (n === 1) {
      if (b.titre.length < 2) return 'Donnez un nom à la tontine.';
      if (!(b.montant > 0) || b.montant > 100000000) return 'Indiquez la cotisation en F CFA (un nombre entier).';
      if (!TC.dateValide(b.debut)) return 'Choisissez la date du premier tour.';
      if (b.frequence === 'autre' && !(b.intervalle >= 1 && b.intervalle <= 365)) return 'Indiquez un nombre de jours entre 1 et 365.';
    }
    if (n === 2) {
      var ms = membresValides(b), vus = {};
      if (ms.length < 2) return 'Ajoutez au moins 2 membres.';
      for (var i = 0; i < ms.length; i++) {
        var k = TC.nettoyerNom(ms[i].nom).toLowerCase();
        if (vus[k]) return 'Deux membres portent le nom « ' + TC.nettoyerNom(ms[i].nom) + ' » : ajoutez une initiale pour les distinguer.';
        vus[k] = 1;
      }
      if (TC.limiteAtteinte(0, ms.length, premium())) return 'membres';
    }
    if (n === 3) {
      if (b.ordreMode === 'tirage' && !b.ordre.length) return 'Faites d\'abord le tirage au sort.';
      if (!b.ordre.length) return 'L\'ordre des tours est vide.';
    }
    return '';
  }
  function tontineDepuisBrouillon(b) {
    var ms = membresValides(b).map(function (m) { return { id: m.id, nom: TC.nettoyerNom(m.nom), mains: Math.max(1, m.mains | 0), souhait: b.ordreMode === 'date' ? m.souhait : '' }; });
    return { montant: b.montant, frequence: b.frequence, intervalle: b.intervalle, debut: b.debut, membres: ms, ordre: b.ordre, ordreMode: b.ordreMode, graine: b.graine, tirageLe: b.tirageLe,
      organisateur: b.organisateur, grace: b.grace, amende: b.amende, amendeMode: b.amende_mode, amendePlafond: b.amende_plafond,
      regle_retard: b.regle_retard, regle_depart: b.regle_depart, regle_autres: b.regle_autres };
  }
  function creer(btn) {
    var b = S.brouillon;
    var donnees = TC.encoderTontine(tontineDepuisBrouillon(b));
    if (TC.tailleDonnees(donnees) > 19000) { erreurEtape('Trop d\'informations (liste ou textes trop longs). Raccourcissez les règles.'); return; }
    var corps = { app: 'tontine', titre: b.titre, donnees: donnees };
    if (premium()) corps.pass = { o: S.pass.o, t: S.pass.t };
    occuper(btn, true);
    appel('/creer', corps).then(function (j) {
      var tels = {};
      membresValides(b).forEach(function (m) { var n = TC.normaliserTel(m.tel); if (n) tels[m.id] = m.tel.trim(); });
      var rec = { id: j.id, role: 'proprio', jeton: j.jetons.proprio, jetonMembre: j.jetons.membre, titre: b.titre, ajouteLe: new Date().toISOString(), tels: tels,
        dossier: { id: j.id, app: 'tontine', titre: b.titre, donnees: donnees, statut: 'ouvert', role: 'proprio', evenements: [] } };
      S.tontines.push(rec); S.brouillon = null;
      demanderPersistance();
      return Promise.all([sauver(), DB.mettre('brouillon', null)]).then(function () {
        location.hash = '#/t/' + j.id + '/partager?nouveau=1';
        return actualiser(rec, true);
      });
    }).catch(function (e) {
      occuper(btn, false);
      erreurEtape(e.status === 429 ? e.message + (premium() ? '' : ' (le Pass Tontine relève cette limite)') : e.message);
    });
  }

  // ---------- Page d'une tontine ----------
  var ONGLETS = { proprio: [['tour', 'Tour', 'cadeau'], ['grille', 'Grille', 'grille'], ['calendrier', 'Calendrier', 'calendrier'], ['historique', 'Historique', 'historique'], ['regles', 'Règles', 'regles'], ['gerer', 'Gérer', 'gerer']],
    membre: [['tour', 'Tour', 'cadeau'], ['grille', 'Grille', 'grille'], ['calendrier', 'Calendrier', 'calendrier'], ['historique', 'Historique', 'historique'], ['regles', 'Règles', 'regles']] };
  var memoChaine = {};
  function chaineDe(rec) {
    // Mémoire de la dernière vérification, refaite à chaque lecture du serveur (rec.lu change)
    var evs = rec.dossier.evenements || [], cle = rec.id + ':' + rec.role + ':' + (rec.lu || '') + ':' + evs.length;
    if (!memoChaine[cle]) memoChaine[cle] = TC.verifierChaine(rec.id, evs);
    return memoChaine[cle];
  }
  function contexte(rec) {
    var t = TC.decoderTontine(rec.dossier), evs = rec.dossier.evenements || [];
    return { rec: rec, t: t, evs: evs, r: TC.calculer(t, evs, aujourdhui()), org: rec.role === 'proprio', clos: t.statut === 'clos' };
  }
  function vueTontine(role, id, onglet, arg) {
    var rec = trouver(id, role);
    var pre = '#/' + (role === 'proprio' ? 't' : 'm') + '/' + id;
    if (!rec) { cadre({ titre: 'Tontine', retour: '#/', nav: 'accueil' }); vue('<section class="carte"><h1>Tontine inconnue sur ce téléphone</h1><p>Ouvrez le lien reçu (WhatsApp, SMS…) pour la suivre.</p><a class="btn plein" href="#/">Accueil</a></section>'); return; }
    if (!rec.dossier) {
      cadre({ titre: rec.titre || 'Tontine', retour: '#/', nav: 'accueil' });
      vue('<section class="carte centre">' + (rec.erreur === 'introuvable' ? '<h1>Tontine introuvable</h1><p>Le lien est faux ou les données ont été effacées (180 jours sans activité).</p><button type="button" class="btn sec" data-action="retirer" data-id="' + esc(id) + '" data-role="' + role + '">Retirer de ce téléphone</button>'
        : '<div class="roue grande" aria-hidden="true"></div><p>Chargement de la tontine…</p><p class="petit">Il faut Internet pour l\'ouvrir la première fois.</p><button type="button" class="btn sec" data-action="actualiser" data-id="' + esc(id) + '" data-role="' + role + '">Réessayer</button>') + '</section>');
      return;
    }
    var c = contexte(rec), t = c.t;
    cadre({ titre: t.titre, retour: '#/', nav: 'accueil' });
    var h = '<section class="entete-t"><div class="et-l1"><h1>' + esc(t.titre) + '</h1>' + badgeRole(rec) + '</div>' +
      '<p class="et-info">' + TC.formatF(t.montant) + ' ' + esc(TC.parPeriode(t.frequence, t.intervalle)) + ' · ' + t.membres.length + ' membres · cagnotte ' + TC.formatF(t.pot) + '</p>' +
      '<p class="et-maj">' + (c.clos ? '<span class="chip c-clos">Clôturée</span>' : '') + '<span>' + (rec.lu ? 'Mis à jour le ' + esc(TC.dateHeure(rec.lu)) : 'Copie locale') + '</span>' +
      '<button type="button" class="lien-btn" data-action="actualiser" data-id="' + esc(id) + '" data-role="' + role + '">' + ICO.actualiser + 'Actualiser</button></p></section>';
    if (!c.org) h += '<p class="notice">' + ICO.info + '<span>' + esc(NOTICE) + '</span></p>';
    h += '<nav class="onglets" aria-label="Sections de la tontine">' + ONGLETS[role].map(function (o) {
      return '<a href="' + pre + '/' + o[0] + '"' + (o[0] === onglet ? ' aria-current="page" class="actif"' : '') + '>' + ICO[o[2]] + '<span>' + o[1] + '</span></a>';
    }).join('') + '</nav>';
    var corps;
    if (onglet === 'grille') corps = ongletGrille(c);
    else if (onglet === 'calendrier') corps = ongletCalendrier(c);
    else if (onglet === 'historique') corps = ongletHistorique(c);
    else if (onglet === 'regles') corps = ongletRegles(c, arg === 'modifier');
    else if (onglet === 'gerer' && c.org) corps = ongletGerer(c);
    else if (onglet === 'partager' && c.org) corps = ongletPartager(c, /nouveau=1/.test(location.hash));
    else corps = ongletTour(c, +arg || 0);
    vue(h + '<div id="corps-onglet">' + corps + '</div>');
  }

  // Onglet « Tour » : le tour affiché, qui a versé, qui doit encore, actions
  function ongletTour(c, n) {
    var t = c.t, r = c.r, rec = c.rec, pre = '#/' + (c.org ? 't' : 'm') + '/' + t.id + '/tour/';
    if (!n) n = r.courant ? r.courant.n : t.nbTours;
    n = Math.max(1, Math.min(t.nbTours, n));
    var tr = r.tours[n - 1], h = '';
    if (!c.org) h += blocMoi(c);
    h += '<div class="tour-nav"><a class="icone-btn' + (n > 1 ? '' : ' inactif') + '" href="' + (n > 1 ? pre + (n - 1) : '#') + '" aria-label="Tour précédent"' + (n > 1 ? '' : ' aria-disabled="true" tabindex="-1"') + '>' + ICO.gauche + '</a>' +
      '<div><strong id="tour-titre">Tour ' + n + ' sur ' + t.nbTours + '</strong><span>' + esc(TC.dateLongue(tr.date)) + '</span>' +
      (tr.etat === 'courant' ? '<em class="chip c-attendu">Tour actuel</em>' : tr.etat === 'passe' ? '<em class="chip c-passe">Passé</em>' : '<em class="chip c-avenir">À venir</em>') + '</div>' +
      '<a class="icone-btn' + (n < t.nbTours ? '' : ' inactif') + '" href="' + (n < t.nbTours ? pre + (n + 1) : '#') + '" aria-label="Tour suivant"' + (n < t.nbTours ? '' : ' aria-disabled="true" tabindex="-1"') + '>' + ICO.chevron + '</a></div>';
    h += '<section class="carte benef-carte' + (tr.remis ? ' remis' : '') + '"><div class="pastille" aria-hidden="true">' + initiales(TC.nomMembre(t, tr.beneficiaire)) + '</div><div><small>' + (tr.remis ? 'Main remise à' : tr.etat === 'passe' ? 'Bénéficiaire prévu' : 'C\'est le tour de') + '</small>' +
      '<strong id="beneficiaire">' + esc(TC.nomMembre(t, tr.beneficiaire)) + '</strong><span>' + (tr.remis ? ICO.ok + ' ' + TC.formatF(tr.remis.montant) + ' le ' + esc(TC.dateCourte(tr.remis.date)) : 'Cagnotte prévue : ' + TC.formatF(tr.attendu)) + '</span></div></section>';
    var pct = Math.min(100, Math.round(100 * tr.confirme / Math.max(1, tr.attendu)));
    h += '<section class="carte" aria-labelledby="h-versements"><h2 id="h-versements">Versements du tour</h2><div class="montants"><div><small>Confirmé</small><strong id="tour-confirme">' + TC.formatF(tr.confirme) + '</strong></div>' +
      '<div><small>Attendu</small><strong>' + TC.formatF(tr.attendu) + '</strong></div><div><small>Reste</small><strong id="tour-reste" class="' + (tr.reste ? 'rouge' : 'vert') + '">' + TC.formatF(tr.reste) + '</strong></div></div>' +
      '<div class="barre grande" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Part confirmée de la cagnotte"><span style="width:' + pct + '%"></span></div>' +
      '<p class="petit">' + tr.payes + ' sur ' + t.membres.length + ' ont versé' + (tr.enAttente ? ' · ' + TC.formatF(tr.enAttente) + ' déclarés à confirmer' : '') + (tr.retards ? ' · ' + tr.retards + ' en retard' : '') + '</p>' +
      '<ul class="liste-statuts" id="liste-tour">' + t.membres.map(function (m) {
        var cel = r.cellules[m.id][n];
        var det = cel.statut === 'confirme' ? TC.formatF(cel.confirme) + (cel.jours ? ' · ' + cel.jours + ' j de retard' : '')
          : cel.statut === 'declare' ? TC.formatF(cel.enAttente) + ' déclarés' : cel.statut === 'retard' ? 'Manque ' + TC.formatF(cel.manque) + ' · ' + cel.jours + ' j'
          : cel.statut === 'partiel' ? TC.formatF(cel.confirme + cel.enAttente) + ' sur ' + TC.formatF(cel.du) : TC.formatF(cel.du);
        var act = '';
        if (c.org && !c.clos) {
          if (cel.statut !== 'confirme') act += '<button type="button" class="btn mini plein" data-action="confirmer" data-m="' + m.id + '" data-p="' + n + '">Confirmer</button>';
          if (cel.statut === 'retard' || cel.statut === 'attendu' || cel.statut === 'partiel') act += '<button type="button" class="btn mini wa" data-action="rappeler" data-m="' + m.id + '" data-p="' + n + '">' + ICO.wa + 'Rappeler</button>';
        }
        return '<li class="ls s-' + cel.statut + '" data-membre="' + m.id + '"><button type="button" class="ls-info" data-action="case" data-m="' + m.id + '" data-p="' + n + '"><span class="pastille petite" aria-hidden="true">' + initiales(m.nom) + '</span><span class="ls-txt"><b>' + esc(m.nom) +
          (m.id === tr.beneficiaire ? ' <span class="or" title="Bénéficiaire">' + ICO.cadeau + '<span class="vh">(bénéficiaire)</span></span>' : '') + '</b><small>' + esc(det) + '</small></span>' + puce(cel.statut) + '</button>' + (act ? '<span class="ls-act">' + act + '</span>' : '') + '</li>';
      }).join('') + '</ul></section>';
    if (c.org && !c.clos) {
      var aConf = r.aConfirmer.filter(function (x) { return x.periode === n; });
      h += '<div class="rang-btn">' + (aConf.length > 1 ? '<button type="button" class="btn plein" data-action="tout-confirmer" data-p="' + n + '">' + ICO.ok + 'Confirmer les ' + aConf.length + ' déclarations</button>' : '') +
        '<button type="button" class="btn wa" data-action="message-groupe" data-p="' + n + '">' + ICO.wa + 'Message au groupe</button>' +
        '<button type="button" class="btn sec" data-action="remettre" data-p="' + n + '">' + ICO.cadeau + (tr.remis ? 'Corriger la remise' : 'Remettre la main') + '</button></div>';
    }
    if (!c.org && !c.clos) h += '<button type="button" class="btn plein large gros" data-action="jai-verse">' + ICO.ok + 'J\'ai versé</button>';
    // Retards (tous les tours), regroupés par membre
    if (r.retardsMembres.length) {
      h += '<section class="carte alerte" aria-labelledby="h-retards"><h2 id="h-retards">' + ICO.alerte + 'En retard (' + r.retardsMembres.length + ')</h2><ul class="liste-retards" id="liste-retards">' + r.retardsMembres.map(function (x) {
        var det = x.periodes.map(function (p) { return (x.periodes.length > 1 ? 'T' : 'Tour ') + p.periode + ' (' + TC.dateCourte(p.date) + ', ' + p.jours + ' j)'; }).join(', ') +
          ' · manque ' + TC.formatF(x.manque) + (x.amende ? ' · amende' + (x.periodes.filter(function (p) { return p.amende; }).length > 1 ? 's ' : ' ') + TC.formatF(x.amende) : '');
        return '<li data-membre="' + x.membre + '"><span><b>' + esc(x.nom) + '</b><small>' + esc(det) + '</small></span>' +
          (c.org && !c.clos ? '<button type="button" class="btn mini wa" data-action="rappeler" data-m="' + x.membre + '" data-p="' + x.periodes[0].periode + '">' + ICO.wa + 'Rappeler</button>' : '') + '</li>';
      }).join('') + '</ul></section>';
    }
    if (c.org && r.aConfirmer.length) {
      h += '<section class="carte" aria-labelledby="h-aconf"><h2 id="h-aconf">À confirmer (' + r.aConfirmer.length + ')</h2><ul class="liste-retards">' + r.aConfirmer.map(function (x) {
        return '<li><span><b>' + esc(x.nom) + '</b><small>Tour ' + x.periode + ' · ' + TC.formatF(x.montant) + ' déclarés</small></span>' + (c.clos ? '' : '<button type="button" class="btn mini plein" data-action="confirmer" data-m="' + x.membre + '" data-p="' + x.periode + '">Confirmer</button>') + '</li>';
      }).join('') + '</ul></section>';
    }
    if (!c.org) {
      h += (c.clos ? '' : '<button type="button" class="btn sec large" data-action="note">' + ICO.note + 'Laisser un mot au groupe</button>') +
        '<button type="button" class="btn-lien-danger" data-action="retirer" data-id="' + esc(t.id) + '" data-role="membre">Retirer cette tontine de ce téléphone</button>';
    }
    return h;
  }
  function blocMoi(c) {
    var t = c.t, r = c.r, moi = c.rec.moi && t.parId[c.rec.moi] ? c.rec.moi : 0;
    var h = '<section class="carte moi"><div class="champ compact"><label for="moi">Je suis</label><select id="moi" data-change="moi"><option value="">Choisissez votre nom</option>' +
      t.membres.map(function (m) { return '<option value="' + m.id + '"' + (m.id === moi ? ' selected' : '') + '>' + esc(m.nom) + '</option>'; }).join('') + '</select></div>';
    if (moi) {
      var M = r.membres[moi], mesTours = r.tours.filter(function (x) { return x.beneficiaire === moi; });
      var prochain = r.tours.filter(function (x) { var cel = r.cellules[moi][x.n]; return cel.statut !== 'confirme' && cel.statut !== 'declare'; })[0];
      h += '<ul class="moi-liste">' +
        '<li>' + ICO.cadeau + '<span>' + (mesTours.length ? 'Votre main : ' + mesTours.map(function (x) { return '<b>tour ' + x.n + '</b>, ' + esc(TC.dateLongue(x.date)) + (x.remis ? ' (reçue)' : ''); }).join(' ; ') + ' — ' + TC.formatF(t.pot) : 'Pas de main prévue') + '</span></li>' +
        '<li>' + ICO.calendrier + '<span>' + (prochain ? 'Prochaine cotisation : <b>' + TC.formatF(r.cellules[moi][prochain.n].manque) + '</b> pour le tour ' + prochain.n + ' (' + esc(TC.dateCourte(prochain.date)) + ')' + (r.cellules[moi][prochain.n].statut === 'retard' ? ' — <b class="rouge">en retard</b>' : '') : 'Toutes vos cotisations sont notées. Merci !') + '</span></li>' +
        '<li>' + ICO.ok + '<span>Déjà confirmé : ' + TC.formatF(M.verse) + (M.declares ? ' · ' + M.declares + ' déclaration(s) à confirmer' : '') + (M.amendes - M.amendesPayees > 0 ? ' · amendes : ' + TC.formatF(M.amendes - M.amendesPayees) : '') + '</span></li></ul>';
    }
    return h + '</section>';
  }
  function ongletGrille(c) {
    var t = c.t, r = c.r, h = '<section class="carte large"><h2>Grille des cotisations</h2><p class="petit">Touchez une case pour le détail' + (c.org ? ' et pour confirmer' : '') + '.</p>' +
      '<div class="grille-defil" tabindex="0" role="region" aria-label="Grille membres et tours (défilement horizontal)"><table class="grille-t"><caption class="vh">Cotisations par membre et par tour</caption><thead><tr><th scope="col">Membre</th>' +
      r.tours.map(function (tr) { return '<th scope="col" class="' + (tr.etat === 'courant' ? 'courant' : '') + '"><span>T' + tr.n + '</span><small>' + esc(TC.dateCourte(tr.date)) + '</small></th>'; }).join('') + '</tr></thead><tbody>';
    t.membres.forEach(function (m) {
      h += '<tr><th scope="row">' + esc(m.nom) + (m.mains > 1 ? ' <small>×' + m.mains + '</small>' : '') + '</th>' + r.tours.map(function (tr) {
        var cel = r.cellules[m.id][tr.n], s = TC.STATUTS[cel.statut];
        return '<td><button type="button" class="case c-' + cel.statut + (tr.beneficiaire === m.id ? ' benef' : '') + '" data-action="case" data-m="' + m.id + '" data-p="' + tr.n + '" aria-label="' + esc(m.nom + ', tour ' + tr.n + ' : ' + s.court + (tr.beneficiaire === m.id ? ', bénéficiaire' : '')) + '">' + esc(s.sym) + '</button></td>';
      }).join('') + '</tr>';
    });
    h += '</tbody><tfoot><tr><th scope="row">Versé</th>' + r.tours.map(function (tr) { return '<td class="tot">' + tr.payes + '/' + t.membres.length + '</td>'; }).join('') + '</tr></tfoot></table></div>' +
      '<ul class="legende">' + ['confirme', 'declare', 'retard', 'partiel', 'attendu', 'avenir'].map(function (s) { return '<li><span class="case mini c-' + s + '" aria-hidden="true">' + esc(TC.STATUTS[s].sym) + '</span>' + esc(TC.STATUTS[s].court) + '</li>'; }).join('') +
      '<li><span class="case mini benef" aria-hidden="true"></span>Bénéficiaire</li></ul></section>';
    h += '<section class="carte"><h2>Totaux par membre</h2><ul class="liste-retards">' + t.membres.map(function (m) {
      var M = r.membres[m.id];
      return '<li><span><b>' + esc(m.nom) + '</b><small>Confirmé ' + TC.formatF(M.verse) + ' sur ' + TC.formatF(M.attenduAuj) + ' dus à ce jour' + (M.retards ? ' · ' + M.retards + ' retard(s)' : '') + (M.amendes ? ' · amendes ' + TC.formatF(M.amendes - M.amendesPayees) + ' à régler' : '') + '</small></span>' +
        (c.org && M.amendes - M.amendesPayees > 0 && !c.clos ? '<button type="button" class="btn mini sec" data-action="amende-payee" data-m="' + m.id + '">Amende réglée</button>' : '') + '</li>';
    }).join('') + '</ul></section>';
    return h;
  }
  function ongletCalendrier(c) {
    var t = c.t, r = c.r;
    var verif = TC.verifierTirage(t);
    var h = '<section class="carte"><h2>Ordre des tours</h2><p class="petit" id="info-ordre">' + (t.ordreMode === 'tirage' ? 'Tiré au sort' + (t.tirageLe ? ' le ' + esc(TC.dateHeure(t.tirageLe)) : '') + ' avec la graine « <b>' + esc(t.graine) + '</b> ». ' +
      (verif ? '<span class="vert">' + ICO.ok + ' Vérifié : refaire le tirage avec cette graine donne exactement cet ordre.</span>' : '<span class="rouge">L\'ordre a été modifié après le tirage (voir l\'historique).</span>')
      : t.ordreMode === 'date' ? 'Ordre fixé selon les dates souhaitées par les membres.' : 'Ordre fixé par l\'organisation, en accord avec le groupe.') + '</p>' +
      '<ol class="calendrier" id="calendrier">' + r.tours.map(function (tr) {
        return '<li class="' + tr.etat + (tr.remis ? ' remis' : '') + '"><span class="cal-n">' + tr.n + '</span><span class="cal-txt"><b>' + esc(TC.nomMembre(t, tr.beneficiaire)) + '</b><small>' + esc(TC.dateLongue(tr.date)) +
          (tr.remis && tr.remis.membre !== tr.prevu ? ' · prévu : ' + esc(TC.nomMembre(t, tr.prevu)) : '') + '</small></span><span class="cal-etat">' +
          (tr.remis ? '<span class="chip c-confirme">' + ICO.ok + 'Reçue</span>' : tr.etat === 'courant' ? '<span class="chip c-attendu">Maintenant</span>' : tr.etat === 'passe' ? '<span class="chip c-passe">' + TC.formatNombre(tr.confirme) + ' / ' + TC.formatNombre(tr.attendu) + '</span>' : '') + '</span></li>';
      }).join('') + '</ol></section>';
    if (t.ordreMode === 'tirage') h += '<details class="carte"><summary>Comment vérifier le tirage ?</summary><p class="petit">On part de la liste des membres classés par numéro (' + esc(t.membres.map(function (m) { return m.id + '. ' + m.nom + (m.mains > 1 ? ' ×' + m.mains : ''); }).join(', ')) +
      '). On mélange cette liste avec la méthode de Fisher-Yates : pour chaque place i, de la dernière à la deuxième, on calcule SHA-256(« graine|i »), on garde les 12 premiers chiffres hexadécimaux, et le reste de la division par (i + 1) donne la place à échanger. N\'importe qui peut refaire ce calcul : le résultat est toujours le même.</p></details>';
    return h;
  }
  function ongletHistorique(c) {
    var t = c.t, evs = c.evs, ch = chaineDe(c.rec);
    var h = '<section class="carte chaine ' + (ch.ok ? 'ok' : 'ko') + '" id="chaine" role="status">' + (ch.ok ? ICO.bouclier : ICO.alerte) + '<div><strong>' + (ch.ok ? 'Historique intact' : 'Attention : historique modifié') + '</strong><span>' +
      (ch.ok ? evs.length + ' actions vérifiées sur ce téléphone : chacune contient l\'empreinte de la précédente, la première part de l\'identifiant de la tontine. Rien n\'a été effacé ni changé.'
        : 'La chaîne est rompue à l\'action n° ' + (ch.rupture + 1) + ' (' + (ch.raison === 'lien' ? 'lien avec l\'action précédente cassé' : 'empreinte qui ne correspond pas au contenu') + '). Prévenez le groupe.') + '</span></div></section>';
    h += '<p class="petit">' + evs.length + ' / ' + TC.MAX_EVENEMENTS + ' actions · les plus récentes en premier.</p><ol class="historique" id="historique" reversed>';
    for (var i = evs.length - 1; i >= 0; i--) {
      var e = evs[i], annule = c.r.annules[e.id], d = e.donnees || {};
      var annulable = c.org && !c.clos && !annule && !d.annule && (e.type === 'versement_recu' || e.type === 'versement_declare' || e.type === 'tour');
      h += '<li class="ev ev-' + esc(e.type) + (annule ? ' annule' : '') + (i === ch.rupture ? ' rompu' : '') + '"><div class="ev-l1"><span class="ev-qui">' + (e.auteur === 'proprio' ? 'Organisation' : 'Membre') + '</span><time datetime="' + esc(e.le) + '">' + esc(TC.dateHeure(e.le)) + '</time></div>' +
        '<p>' + esc(window.TCPDF.texteEvenement(t, e, false)) + (annule ? ' <em>(annulé)</em>' : '') + '</p>' +
        (d.note ? '<p class="petit">« ' + esc(d.note) + ' »</p>' : '') +
        '<div class="ev-l3"><code title="Empreinte SHA-256">#' + esc(String(e.empreinte || '').slice(0, 10)) + '</code>' + (annulable ? '<button type="button" class="lien-btn" data-action="annuler-ev" data-ev="' + e.id + '">Annuler</button>' : '') + '</div></li>';
    }
    return h + '</ol>';
  }
  function ongletRegles(c, edition) {
    var t = c.t;
    if (edition && c.org && !c.clos) {
      return '<form class="carte" data-form="regles"><h2>Modifier les règles</h2>' +
        '<div class="grille2"><div class="champ"><label for="n-grace">Délai accordé</label><select id="n-grace">' + options([[0, 'Aucun'], [1, '1 jour'], [2, '2 jours'], [3, '3 jours'], [5, '5 jours'], [7, '7 jours']], t.grace) + '</select></div>' +
        champ('Amende de retard (F)', 'n-amende', t.amende ? TC.formatNombre(t.amende) : '', { mode: 'numeric', place: '0 = aucune' }) + '</div>' +
        '<fieldset class="choix compact"><legend>L\'amende s\'applique</legend><label class="option"><input type="radio" name="amende_mode" value="fixe"' + (t.amendeMode !== 'jour' ? ' checked' : '') + '><span>Une fois par tour en retard</span></label>' +
        '<label class="option"><input type="radio" name="amende_mode" value="jour"' + (t.amendeMode === 'jour' ? ' checked' : '') + '><span>Par jour de retard</span></label></fieldset>' +
        '<div id="zone-plafond"' + (t.amendeMode === 'jour' ? '' : ' hidden') + '>' + champ('Plafond par tour (F, facultatif)', 'n-plafond', t.amendePlafond ? TC.formatNombre(t.amendePlafond) : '', { mode: 'numeric' }) + '</div>' +
        '<p class="exemple" id="exemple-amende">' + esc(exempleAmende(t)) + '</p>' +
        champ('En cas de retard', 'n-regle-retard', t.regle_retard, { zone: true, lignes: 3, max: 1500 }) +
        champ('Si quelqu\'un quitte la tontine', 'n-regle-depart', t.regle_depart, { zone: true, lignes: 4, max: 1500 }) +
        champ('Autres règles', 'n-regle-autres', t.regle_autres, { zone: true, lignes: 3, max: 1500 }) +
        '<p class="petit">Le groupe sera informé : la modification apparaît dans l\'historique.</p><p id="err-regles" class="erreur" role="alert" hidden></p>' +
        '<div class="rang-btn"><a class="btn sec" href="#/t/' + t.id + '/regles">Annuler</a><button type="submit" class="btn plein">Enregistrer les règles</button></div></form>';
    }
    var h = '<section class="carte regles" id="regles"><h2>Règles de « ' + esc(t.titre) + ' »</h2><dl class="recap">' +
      '<div><dt>Cotisation</dt><dd>' + TC.formatF(t.montant) + ' par main, ' + esc(TC.libelleFrequence(t.frequence, t.intervalle)) + '</dd></div>' +
      '<div><dt>Date limite</dt><dd>' + (t.grace ? 'La date du tour + ' + t.grace + ' jour' + (t.grace > 1 ? 's' : '') + ' de délai' : 'La date du tour') + '</dd></div>' +
      '<div><dt>Amende</dt><dd id="regle-amende">' + (t.amende ? (t.amendeMode === 'jour' ? TC.formatF(t.amende) + ' par jour de retard' + (t.amendePlafond ? ', au plus ' + TC.formatF(t.amendePlafond) + ' par tour' : '') : TC.formatF(t.amende) + ' par tour en retard') : 'Aucune') + '</dd></div></dl>' +
      '<p class="exemple">' + esc(exempleAmende(t)) + '</p>' +
      [['En cas de retard', t.regle_retard], ['Si quelqu\'un quitte la tontine', t.regle_depart], ['Autres règles', t.regle_autres]].map(function (x) {
        return x[1] ? '<h3>' + esc(x[0]) + '</h3><p class="texte-regle">' + esc(x[1]) + '</p>' : '';
      }).join('') + '</section>';
    h += '<p class="notice">' + ICO.info + '<span>' + esc(NOTICE) + '</span></p>';
    if (c.org && !c.clos) h += '<a class="btn plein large" href="#/t/' + t.id + '/regles/modifier">' + ICO.crayon + 'Modifier les règles</a>';
    return h;
  }
  function ongletGerer(c) {
    var t = c.t, rec = c.rec, r = c.r;
    var h = '<section class="carte"><h2>Partager et exporter</h2><a class="btn plein large" href="#/t/' + t.id + '/partager">' + ICO.partager + 'Lien du groupe (membres)</a>' +
      '<button type="button" class="btn sec large" data-action="pdf">' + ICO.pdf + 'Résumé PDF' + (premium() ? '' : ' <span class="verrou">' + ICO.cadenas + '<span class="vh">(Pass)</span></span>') + '</button>' +
      '<button type="button" class="btn sec large" data-action="message-groupe" data-p="' + (r.courant ? r.courant.n : t.nbTours) + '">' + ICO.wa + 'Message au groupe</button></section>';
    h += '<section class="carte"><h2>Membres</h2><p class="petit">Les numéros restent sur ce téléphone : ils servent seulement à ouvrir WhatsApp.</p><ul class="liste-retards" id="liste-gerer">' + t.membres.map(function (m) {
      var tel = (rec.tels || {})[m.id];
      return '<li><span><b>' + esc(m.nom) + (m.mains > 1 ? ' ×' + m.mains : '') + '</b><small>' + (tel ? ICO.tel + ' ' + esc(tel) : 'Pas de numéro') + '</small></span><span class="ls-act">' +
        '<button type="button" class="btn mini sec" data-action="tel" data-m="' + m.id + '">' + (tel ? 'Numéro' : 'Ajouter n°') + '</button>' +
        (c.clos ? '' : '<button type="button" class="btn mini sec" data-action="renommer" data-m="' + m.id + '">Renommer</button>') + '</span></li>';
    }).join('') + '</ul></section>';
    if (!c.clos) {
      var libres = r.tours.filter(function (x) { return !x.remis; });
      h += '<form class="carte" data-form="echanger"><h2>Échanger deux tours</h2><p class="petit">Quand deux membres sont d\'accord pour échanger leur place. Le changement est noté dans l\'historique.</p>' +
        '<div class="grille2"><div class="champ"><label for="ech-a">Tour</label><select id="ech-a">' + options(libres.map(function (x) { return [x.n, 'T' + x.n + ' · ' + TC.nomMembre(t, x.prevu)]; }), libres[0] && libres[0].n) + '</select></div>' +
        '<div class="champ"><label for="ech-b">avec le tour</label><select id="ech-b">' + options(libres.map(function (x) { return [x.n, 'T' + x.n + ' · ' + TC.nomMembre(t, x.prevu)]; }), libres[1] && libres[1].n) + '</select></div></div>' +
        '<button type="submit" class="btn sec large"' + (libres.length < 2 ? ' disabled' : '') + '>Échanger</button></form>';
      h += '<section class="carte"><h2>Autres actions</h2><button type="button" class="btn sec large" data-action="note">' + ICO.note + 'Ajouter une note au groupe</button>' +
        '<button type="button" class="btn sec large" data-action="voir-lien-org">' + ICO.cadenas + 'Mon lien d\'organisation (secret)</button>' +
        '<button type="button" class="btn danger large" data-action="cloturer">Clôturer la tontine</button></section>';
    }
    h += '<button type="button" class="btn-lien-danger" data-action="retirer" data-id="' + esc(t.id) + '" data-role="proprio">Retirer de ce téléphone</button>';
    return h;
  }
  function ongletPartager(c, nouveau) {
    var t = c.t, rec = c.rec;
    if (!rec.jetonMembre) return '<section class="carte"><h2>Lien du groupe</h2><p>Le lien des membres n\'est pas enregistré sur ce téléphone. Ouvrez votre lien d\'organisation complet sur le téléphone qui a créé la tontine.</p></section>';
    var lien = lienMembre(rec), msg = TC.messageInvitation(t, lien);
    return (nouveau ? '<section class="carte succes">' + ICO.ok + '<div><strong>La tontine est créée !</strong><span>Envoyez maintenant le lien au groupe.</span></div></section>' : '') +
      '<section class="carte"><h2>Lien du groupe</h2><p class="petit">Un seul lien pour tous les membres : ils voient le calendrier et les versements, et signalent « J\'ai versé ». Aucune installation n\'est nécessaire.</p>' +
      '<div class="lien-box"><input type="text" id="lien-membre" readonly value="' + esc(lien) + '" aria-label="Lien du groupe"></div>' +
      '<a class="btn wa large" id="wa-invitation" href="' + esc(TC.lienWhatsApp('', msg)) + '" target="_blank" rel="noopener">' + ICO.wa + 'Envoyer dans le groupe WhatsApp</a>' +
      '<div class="rang-btn"><button type="button" class="btn sec" data-action="copier" data-texte="' + esc(lien) + '">' + ICO.copier + 'Copier</button><button type="button" class="btn sec" data-action="partager-lien">' + ICO.partager + 'Partager</button></div></section>' +
      '<details class="carte"><summary>' + ICO.cadenas + ' Votre lien d\'organisation (secret)</summary><p class="petit">Il permet de confirmer les versements : <b>ne le donnez à personne</b>. Gardez-le (dans vos notes) pour retrouver la tontine sur un autre téléphone.</p>' +
      '<div class="lien-box"><input type="text" id="lien-org" readonly value="' + esc(lienOrg(rec)) + '" aria-label="Lien d\'organisation"></div><button type="button" class="btn sec large" data-action="copier" data-texte="' + esc(lienOrg(rec)) + '">' + ICO.copier + 'Copier mon lien secret</button></details>' +
      '<a class="btn plein large" href="#/t/' + t.id + '/tour">Voir la tontine</a>';
  }

  // ---------- Feuilles d'action ----------
  function ctxCourant() {
    var m = location.hash.match(/^#\/(t|m)\/(D-[0-9A-HJKMNP-TV-Z]{10})/);
    if (!m) return null;
    var rec = trouver(m[2], m[1] === 't' ? 'proprio' : 'membre');
    return rec && rec.dossier ? contexte(rec) : null;
  }
  function feuilleCase(c, mid, n) {
    var t = c.t, cel = c.r.cellules[mid][n], tr = c.r.tours[n - 1], m = t.parId[mid];
    var h = '<p class="case-tete">' + puce(cel.statut) + '<span>' + esc(TC.STATUTS[cel.statut].long) + '</span></p><dl class="recap">' +
      '<div><dt>Tour</dt><dd>' + n + ' · ' + esc(TC.dateLongue(tr.date)) + '</dd></div><div><dt>Montant dû</dt><dd>' + TC.formatF(cel.du) + '</dd></div>' +
      '<div><dt>Confirmé</dt><dd>' + TC.formatF(cel.confirme) + '</dd></div>' + (cel.enAttente ? '<div><dt>Déclaré, à confirmer</dt><dd>' + TC.formatF(cel.enAttente) + '</dd></div>' : '') +
      (cel.jours ? '<div><dt>Retard</dt><dd>' + cel.jours + ' jour' + (cel.jours > 1 ? 's' : '') + '</dd></div>' : '') + (cel.amende ? '<div><dt>Amende (règlement)</dt><dd>' + TC.formatF(cel.amende) + '</dd></div>' : '') + '</dl>';
    if (cel.evs.length) h += '<ul class="mini-hist">' + cel.evs.map(function (e) { return '<li>' + esc(window.TCPDF.texteEvenement(t, e)) + ' <small>' + esc(TC.dateHeure(e.le)) + '</small></li>'; }).join('') + '</ul>';
    h += '<div class="rang-btn pile">';
    if (c.org && !c.clos) {
      if (cel.statut !== 'confirme') h += '<button type="button" class="btn plein" data-action="confirmer" data-m="' + mid + '" data-p="' + n + '">' + ICO.ok + 'Confirmer un versement</button>';
      if (cel.statut !== 'confirme' && cel.statut !== 'declare') h += '<button type="button" class="btn wa" data-action="rappeler" data-m="' + mid + '" data-p="' + n + '">' + ICO.wa + 'Rappeler ' + esc(m.nom) + '</button>';
    }
    if (!c.org && !c.clos && cel.statut !== 'confirme') h += '<button type="button" class="btn plein" data-action="jai-verse" data-p="' + n + '" data-m="' + mid + '">' + ICO.ok + 'J\'ai versé</button>';
    feuille(m.nom + ' · tour ' + n, h + '</div>');
  }
  function feuilleConfirmer(c, mid, n) {
    var t = c.t, cel = c.r.cellules[mid][n], m = t.parId[mid];
    var decl = cel.evs.filter(function (e) { return e.type === 'versement_declare'; }).pop();
    var dd = decl && decl.donnees || {};
    var montant = cel.enAttente || cel.manque || cel.du;
    feuille('Confirmer un versement', '<form data-form="confirmer" data-m="' + mid + '" data-p="' + n + '"><p><b>' + esc(m.nom) + '</b> · tour ' + n + ' (' + esc(TC.dateCourte(c.r.tours[n - 1].date)) + ') · dû ' + TC.formatF(cel.du) + '</p>' +
      (decl ? '<p class="info-decl">' + ICO.info + '<span>' + esc(m.nom) + ' a déclaré ' + TC.formatF(dd.montant) + (dd.mode ? ' (' + esc(dd.mode) + ')' : '') + ' le ' + esc(TC.dateCourte(dd.date || TC.isoLocal(new Date(decl.le)))) + '.</span></p>' : '') +
      champ('Montant reçu (F CFA)', 'c-montant', TC.formatNombre(montant), { mode: 'numeric', requis: true }) +
      '<div class="grille2">' + champ('Date du versement', 'c-date', TC.dateValide(dd.date) ? dd.date : aujourdhui(), { type: 'date', maxDate: aujourdhui() }) +
      '<div class="champ"><label for="c-mode">Moyen</label><select id="c-mode">' + options(MODES, dd.mode || 'Wave') + '</select></div></div>' +
      '<p class="petit">Confirmez seulement quand l\'argent est bien arrivé (à vous ou au bénéficiaire).</p><p id="err-feuille" class="erreur" role="alert" hidden></p>' +
      '<button type="submit" class="btn plein large">' + ICO.ok + 'Confirmer la réception</button></form>');
  }
  function feuilleDeclarer(c, n, mid) {
    var t = c.t, r = c.r, moi = mid || c.rec.moi || '';
    // Tour proposé : celui demandé (case touchée), sinon le plus ancien tour encore dû, sinon le tour actuel
    function tourDefaut(id) {
      if (n) return n;
      if (!id) return r.courant ? r.courant.n : 1;
      var x = r.tours.filter(function (tr) { var s = r.cellules[id][tr.n].statut; return s === 'retard' || s === 'attendu' || s === 'partiel'; })[0];
      return x ? x.n : (r.courant ? r.courant.n : 1);
    }
    var p = tourDefaut(moi);
    function montantDefaut(id, q) { if (!id) return t.montant; var cel = r.cellules[id][q]; return Math.max(0, cel.du - cel.confirme - cel.enAttente) || cel.du; }
    feuille('J\'ai versé', '<form data-form="declarer"><div class="champ"><label for="d-membre">Je suis</label><select id="d-membre" required><option value="">Choisissez votre nom</option>' +
      t.membres.map(function (m) { return '<option value="' + m.id + '"' + (String(m.id) === String(moi) ? ' selected' : '') + '>' + esc(m.nom) + '</option>'; }).join('') + '</select></div>' +
      '<div class="champ"><label for="d-tour">Pour le tour</label><select id="d-tour">' + r.tours.map(function (tr) { return '<option value="' + tr.n + '"' + (tr.n === p ? ' selected' : '') + '>Tour ' + tr.n + ' · ' + esc(TC.dateCourte(tr.date)) + ' (' + esc(TC.nomMembre(t, tr.beneficiaire)) + ')</option>'; }).join('') + '</select></div>' +
      champ('Montant versé (F CFA)', 'd-montant', TC.formatNombre(montantDefaut(moi, p)), { mode: 'numeric', requis: true }) +
      '<div class="grille2"><div class="champ"><label for="d-mode">Comment ?</label><select id="d-mode">' + options(MODES, 'Wave') + '</select></div>' +
      champ('Date', 'd-date', aujourdhui(), { type: 'date', maxDate: aujourdhui() }) + '</div>' +
      champ('Petit mot (facultatif)', 'd-note', '', { max: 200, place: 'Ex. : versé à Awa par Wave' }) +
      '<p class="petit">Versez comme d\'habitude (à l\'organisation ou au bénéficiaire). Ici, vous le signalez seulement : l\'organisation le confirmera.</p><p id="err-feuille" class="erreur" role="alert" hidden></p>' +
      '<button type="submit" class="btn plein large">Envoyer ma déclaration</button></form>', function (el) {
      var maj = function () { var id = +$('#d-membre', el).value, q = +$('#d-tour', el).value; if (id) $('#d-montant', el).value = TC.formatNombre(montantDefaut(id, q)); };
      $('#d-membre', el).addEventListener('change', function () { var id = +this.value; if (id && !n) $('#d-tour', el).value = String(tourDefaut(id)); maj(); });
      $('#d-tour', el).addEventListener('change', maj);
    });
  }
  function feuilleRappel(c, mid, n) {
    var t = c.t, rec = c.rec, r = c.r, m = t.parId[mid];
    // Un seul message par personne : tous ses tours en retard, plus le tour demandé s'il reste à verser
    var ps = r.retards.filter(function (x) { return x.membre === mid; }).map(function (x) { return x.periode; });
    var sn = r.cellules[mid][n].statut;
    if (ps.indexOf(n) < 0 && sn !== 'confirme' && sn !== 'declare') ps.push(n);
    if (!ps.length) ps = [n];
    ps.sort(function (a, b) { return a - b; });
    var montant = ps.reduce(function (s, p) { var ce = r.cellules[mid][p]; return s + (ce.manque || ce.du); }, 0);
    var msg = TC.messageRappel(t, { membre: mid, periodes: ps, montant: montant, lien: lienMembre(rec), enRetard: ps.some(function (p) { return r.cellules[mid][p].statut === 'retard'; }) });
    var tel = (rec.tels || {})[mid] || '';
    feuille('Rappeler ' + m.nom, '<p class="petit">Rien n\'est envoyé automatiquement : WhatsApp s\'ouvre avec le message, c\'est vous qui l\'envoyez.</p>' +
      champ('Numéro WhatsApp de ' + m.nom, 'r-tel', tel, { type: 'tel', place: '77 000 00 00', aide: 'Gardé seulement sur ce téléphone, jamais envoyé. Sans numéro, WhatsApp vous laisse choisir le contact.' }) +
      champ('Message', 'r-msg', msg, { zone: true, lignes: 8 }) +
      '<label class="case-a-cocher"><input type="checkbox" id="r-noter" checked> Noter ce rappel dans l\'historique</label>' +
      '<a class="btn wa large" id="r-wa" href="' + esc(TC.lienWhatsApp(tel, msg)) + '" target="_blank" rel="noopener">' + ICO.wa + 'Ouvrir WhatsApp</a>' +
      (navigator.share ? '<button type="button" class="btn sec large" id="r-partager">' + ICO.partager + 'Partager autrement</button>' : ''), function (el) {
      var maj = function () { $('#r-wa', el).href = TC.lienWhatsApp($('#r-tel', el).value, $('#r-msg', el).value); };
      $('#r-tel', el).addEventListener('input', maj); $('#r-msg', el).addEventListener('input', maj);
      var noter = function () {
        var v = $('#r-tel', el).value.trim();
        rec.tels = rec.tels || {};
        if (TC.normaliserTel(v)) rec.tels[mid] = v; else if (!v) delete rec.tels[mid];
        sauver();
        if ($('#r-noter', el).checked) envoyer(rec, 'rappel', { membre: mid, nom: m.nom, periode: ps[0], periodes: ps.join(','), canal: 'whatsapp' }).then(function () { toast('Rappel noté dans l\'historique.'); }).catch(function (e) { toast(e.message); });
        setTimeout(fermerFeuille, 300);
      };
      $('#r-wa', el).addEventListener('click', noter);
      if ($('#r-partager', el)) $('#r-partager', el).addEventListener('click', function () { partager(t.titre, $('#r-msg', el).value); noter(); });
    });
  }
  function feuilleGroupe(c, n) {
    var t = c.t, rec = c.rec, msg = TC.messageGroupe(t, c.r, n, lienMembre(rec));
    feuille('Message au groupe', '<p class="petit">Le point du tour ' + n + ', à envoyer dans votre groupe WhatsApp.</p>' + champ('Message', 'g-msg', msg, { zone: true, lignes: 10 }) +
      '<a class="btn wa large" id="g-wa" href="' + esc(TC.lienWhatsApp('', msg)) + '" target="_blank" rel="noopener">' + ICO.wa + 'Ouvrir WhatsApp</a>' +
      (navigator.share ? '<button type="button" class="btn sec large" id="g-partager">' + ICO.partager + 'Partager autrement</button>' : '') +
      '<button type="button" class="btn sec large" id="g-copier">' + ICO.copier + 'Copier le message</button>', function (el) {
      $('#g-msg', el).addEventListener('input', function () { $('#g-wa', el).href = TC.lienWhatsApp('', this.value); });
      $('#g-wa', el).addEventListener('click', function () { setTimeout(fermerFeuille, 300); });
      if ($('#g-partager', el)) $('#g-partager', el).addEventListener('click', function () { partager(t.titre, $('#g-msg', el).value); });
      $('#g-copier', el).addEventListener('click', function () { copier($('#g-msg', el).value); });
    });
  }
  function feuilleRemettre(c, n) {
    var t = c.t, tr = c.r.tours[n - 1];
    feuille('Remise de la main · tour ' + n, '<form data-form="remettre" data-p="' + n + '"><div class="champ"><label for="t-benef">Bénéficiaire</label><select id="t-benef">' +
      t.membres.map(function (m) { return '<option value="' + m.id + '"' + (m.id === tr.beneficiaire ? ' selected' : '') + '>' + esc(m.nom) + (m.id === tr.prevu ? ' (prévu)' : '') + '</option>'; }).join('') + '</select></div>' +
      champ('Montant remis (F CFA)', 't-montant', TC.formatNombre(tr.confirme || tr.attendu), { mode: 'numeric', requis: true, aide: 'Confirmé pour ce tour : ' + TC.formatF(tr.confirme) + ' sur ' + TC.formatF(tr.attendu) + '.' }) +
      champ('Date de la remise', 't-date', aujourdhui(), { type: 'date', maxDate: TC.ajouterJours(aujourdhui(), 0) }) +
      '<p class="petit">L\'application ne transfère rien : notez ici la remise faite en main propre ou par Wave.</p><p id="err-feuille" class="erreur" role="alert" hidden></p>' +
      '<button type="submit" class="btn plein large">' + ICO.cadeau + 'Noter la remise</button></form>');
  }
  function offreContenu() {
    return '<ul class="atouts"><li>' + ICO.groupe + '<span><b>Tontines et membres illimités</b> (gratuit : 1 tontine en cours, ' + TC.GRATUIT_MEMBRES + ' membres)</span></li>' +
      '<li>' + ICO.pdf + '<span><b>Résumé PDF</b> à partager ou imprimer : calendrier, grille, retards, historique vérifié</span></li>' +
      '<li>' + ICO.calendrier + '<span><b>12 mois</b>, sans abonnement : un seul paiement de ' + TC.formatF(TC.PASS_PRIX) + '</span></li></ul>' +
      '<a class="btn plein large" href="' + URL_PASS + '">' + ICO.etoile + 'Prendre le Pass Tontine 12 mois (' + TC.formatF(TC.PASS_PRIX) + ')</a>' +
      '<a class="btn sec large" href="#/pass">J\'ai déjà payé : activer</a>';
  }
  function offrePass(raison) {
    var titres = { membres: 'Plus de ' + TC.GRATUIT_MEMBRES + ' membres ?', tontines: 'Une tontine à la fois en version gratuite', pdf: 'Résumé PDF avec le Pass' };
    feuille(titres[raison] || 'Pass Tontine', '<div class="offre">' + (raison === 'membres' ? '<p>La version gratuite suit jusqu\'à ' + TC.GRATUIT_MEMBRES + ' membres. Le Pass Tontine enlève cette limite.</p>' : '') + offreContenu() + '</div>');
  }

  // ---------- Pass ----------
  function vuePass(code) {
    cadre({ titre: 'Pass Tontine', nav: 'pass' });
    var h = '';
    if (premium()) {
      h += '<section class="carte statut-pass ok" id="pass-statut">' + ICO.etoile + '<div><small>Votre version</small><strong>Pass Tontine 12 mois actif</strong><span>Commande ' + esc(S.pass.o) + (S.pass.verifieLe ? ' · vérifié le ' + esc(TC.dateMoyenne(S.pass.verifieLe.slice(0, 10))) : '') + '</span></div></section>' +
        '<section class="carte"><p>Tontines et membres illimités, résumés PDF. Sur un autre téléphone, ouvrez le lien de votre page de commande pour l\'activer aussi.</p>' +
        '<button type="button" class="btn sec large" data-action="retirer-pass">Retirer le pass de ce téléphone</button></section>';
    } else {
      h += '<section class="carte statut-pass" id="pass-statut">' + ICO.etoile + '<div><small>Votre version</small><strong>Version gratuite</strong><span>1 tontine en cours, ' + TC.GRATUIT_MEMBRES + ' membres au plus</span></div></section>' +
        '<section class="carte offre"><h1>Pass Tontine 12 mois</h1>' + offreContenu().replace('<a class="btn sec large" href="#/pass">J\'ai déjà payé : activer</a>', '') + '</section>' +
        '<form class="carte" data-form="pass"><h2>J\'ai payé : activer le pass</h2><p class="petit">Collez le lien de votre page de commande (il commence par …/commande.html?o=TCV-).</p>' +
        champ('Lien de la commande', 'p-code', code || '', { place: 'https://…/commande.html?o=TCV-…&t=…' }) +
        '<p id="msg-pass" class="msg" role="status"></p><button type="submit" class="btn plein large" id="btn-activer">Activer</button></form>';
    }
    h += '<p class="notice petite">' + ICO.info + '<span>Le pass paie l\'application, pas la tontine. ' + esc(NOTICE) + '</span></p>';
    vue(h);
    if (code && !premium()) setTimeout(function () { var f = $('form[data-form=pass]'); if (f) activerPass(f); }, 50);
  }
  function activerPass(form) {
    var msg = $('#msg-pass'), btn = $('#btn-activer');
    var c = TC.lireLienCommande($('#p-code').value);
    msg.className = 'msg';
    if (!c) { msg.textContent = 'Lien non reconnu. Copiez le lien complet de votre page de commande.'; msg.className = 'msg erreur'; return; }
    occuper(btn, true); msg.textContent = 'Vérification…';
    appel('/pass', { app: 'tontine', pass: c }).then(function (j) {
      occuper(btn, false);
      if (!j.valide) { msg.textContent = 'Cette commande n\'active pas le Pass Tontine (pas encore payée, autre produit ou pass expiré).'; msg.className = 'msg erreur'; return; }
      S.pass = { o: c.o, t: c.t, activeLe: new Date().toISOString(), verifieLe: new Date().toISOString() };
      return DB.mettre('pass', S.pass).then(function () { toast('Pass Tontine activé. Merci !'); vuePass(); });
    }).catch(function (e) { occuper(btn, false); msg.textContent = e.message; msg.className = 'msg erreur'; });
  }
  function reverifierPass() {
    if (!premium() || navigator.onLine === false) return;
    if (S.pass.verifieLe && Date.now() - Date.parse(S.pass.verifieLe) < 7 * 86400000) return;
    appel('/pass', { app: 'tontine', pass: { o: S.pass.o, t: S.pass.t } }).then(function (j) {
      if (j.valide) { S.pass.verifieLe = new Date().toISOString(); DB.mettre('pass', S.pass); return; }
      S.pass = null; DB.mettre('pass', null); toast('Votre Pass Tontine a expiré. Vos tontines restent visibles.');
    }).catch(function () { /* hors ligne : on garde le pass */ });
  }

  // ---------- Réglages ----------
  var invite = null;
  function estInstallee() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function majInstall() { var b = $('#installer'); if (b) b.hidden = estInstallee() || !(invite || estIOS()); }
  function instructionsInstall() {
    if (estIOS()) return '<ol class="etapes"><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez <b>Partager</b> (carré avec une flèche vers le haut).</li><li>Choisissez <b>« Sur l\'écran d\'accueil »</b>, puis <b>Ajouter</b>.</li></ol>';
    return '<ol class="etapes"><li>Ouvrez cette page dans <b>Chrome</b>.</li><li>Touchez le menu <b>⋮</b> en haut à droite.</li><li>Choisissez <b>« Installer l\'application »</b> ou <b>« Ajouter à l\'écran d\'accueil »</b>.</li></ol>';
  }
  function lireTheme() { try { return localStorage.getItem('tc-theme') || 'auto'; } catch (e) { return 'auto'; } }
  function appliquerTheme(v) {
    try { localStorage.setItem('tc-theme', v); } catch (e) { /* rien */ }
    var r = document.documentElement;
    if (v === 'clair') r.setAttribute('data-theme', 'light'); else if (v === 'sombre') r.setAttribute('data-theme', 'dark'); else r.removeAttribute('data-theme');
  }
  function vueReglages() {
    cadre({ titre: 'Réglages', nav: 'reglages' });
    var th = lireTheme();
    vue('<section class="carte"><h2>Installer l\'application</h2>' + (estInstallee() ? '<p>' + ICO.ok + ' L\'application est installée sur ce téléphone.</p>' :
      (invite ? '<button type="button" class="btn plein large" data-action="installer">' + ICO.installer + 'Installer l\'application</button>' : instructionsInstall())) +
      '<p class="petit">Les membres n\'ont rien à installer : le lien du groupe s\'ouvre dans le navigateur.</p></section>' +
      '<section class="carte"><h2>Apparence</h2><div class="champ"><label for="theme">Thème</label><select id="theme" data-change="theme">' + options([['auto', 'Automatique (comme le téléphone)'], ['clair', 'Clair'], ['sombre', 'Sombre']], th) + '</select></div></section>' +
      '<section class="carte"><h2>Comment ça marche</h2><ol class="etapes"><li>L\'organisatrice ou l\'organisateur crée la tontine et envoie <b>un seul lien</b> au groupe.</li>' +
      '<li>Chacun verse comme d\'habitude (espèces, Wave, Orange Money…) puis touche <b>« J\'ai versé »</b>.</li><li>L\'organisation <b>confirme</b> la réception et note la <b>remise de la main</b>.</li>' +
      '<li>Tout le monde voit la même grille, le même calendrier et le même historique, scellé par des empreintes.</li></ol><p class="notice">' + ICO.info + '<span>' + esc(NOTICE) + '</span></p></section>' +
      '<section class="carte"><h2>Confidentialité</h2><p>Sur notre serveur : le nom de la tontine, les prénoms ou surnoms, les montants et l\'historique, pour les partager avec le groupe. Ils sont effacés 180 jours après la dernière activité.</p>' +
      '<p><b>Les numéros de téléphone restent uniquement sur ce téléphone</b> : ils servent à ouvrir WhatsApp. Aucun message n\'est envoyé automatiquement.</p>' +
      '<p class="petit">Les liens sont secrets : toute personne qui a le lien du groupe peut voir la tontine et déclarer un versement. Ne le partagez qu\'avec les membres.</p></section>' +
      '<section class="carte"><h2>À propos</h2><p>Tontine Claire, version ' + VERSION + '.</p><p class="petit">Bibliothèque libre incluse : jsPDF (licence MIT). <a href="vendor/LISEZMOI.txt">Détails et licence</a>.</p>' +
      '<p class="petit"><a href="../">Toutes nos applications</a> · <a href="../../boutique/">Boutique Teranga Outils</a> · <a href="../../boutique/guide-organiser-une-tontine-sans-disputes.html">Guide : organiser une tontine sans disputes</a></p></section>');
  }

  // ---------- Actions ----------
  function membreDe(el) { return +el.dataset.m; }
  var ACTIONS = {
    retour: function (b) { if (b.dataset.href) location.hash = b.dataset.href; else history.back(); },
    installer: function () {
      if (invite) { invite.prompt(); invite.userChoice.then(function () { invite = null; majInstall(); }); return; }
      feuille('Installer l\'application', instructionsInstall());
    },
    'coller-lien': function () {
      feuille('J\'ai reçu un lien', '<form data-form="lien">' + champ('Collez le lien de la tontine', 'l-lien', '', { place: 'https://…/tontine/#/rejoindre/…' }) +
        '<p id="err-feuille" class="erreur" role="alert" hidden></p><button type="submit" class="btn plein large">Ouvrir</button></form>');
    },
    'etape-prec': function () { lireEtape(S.brouillon.etape); S.brouillon.etape = Math.max(1, S.brouillon.etape - 1); sauverBrouillon(); router(); },
    'membre-ajout': function () {
      lireEtape(2);
      var b = S.brouillon, max = b.membres.reduce(function (s, m) { return Math.max(s, m.id); }, 0);
      if (!premium() && membresValides(b).length >= TC.GRATUIT_MEMBRES) { offrePass('membres'); return; }
      b.membres.push({ id: max + 1, nom: '', mains: 1, tel: '' }); sauverBrouillon(); router();
      var el = $('#m-nom-' + (b.membres.length - 1)); if (el) el.focus();
    },
    'membre-suppr': function (b) { lireEtape(2); S.brouillon.membres.splice(+b.dataset.i, 1); if (!S.brouillon.membres.length) S.brouillon.membres.push({ id: 1, nom: '', mains: 1, tel: '' }); sauverBrouillon(); router(); },
    'membres-coller': function () {
      lireEtape(2);
      feuille('Coller une liste', '<form data-form="coller"><p class="petit">Un prénom par ligne (vous pouvez coller la liste d\'un groupe WhatsApp). Les numéros éventuels restent sur ce téléphone.</p>' +
        champ('Liste des membres', 'c-liste', '', { zone: true, lignes: 8, place: 'Awa\nFatou 77 123 45 67\nMoussa' }) + '<button type="submit" class="btn plein large">Ajouter</button></form>');
    },
    tirer: function () {
      lireEtape(3);
      var b = S.brouillon;
      if (!b.graine) b.graine = TC.graineNouvelle();
      b.ordre = TC.tirage(b.graine, membresValides(b)); b.tirageLe = new Date().toISOString();
      sauverBrouillon(); router();
      var o = $('#ordre-liste'); if (o) o.scrollIntoView({ block: 'center' });
      toast('Tirage fait. Tout le monde pourra le vérifier avec la graine.');
    },
    'nouvelle-graine': function () { lireEtape(3); S.brouillon.graine = TC.graineNouvelle(); S.brouillon.ordre = []; S.brouillon.tirageLe = ''; sauverBrouillon(); router(); },
    'trier-dates': function () { lireEtape(3); S.brouillon.ordre = TC.ordreParDate(membresValides(S.brouillon)); sauverBrouillon(); router(); },
    monter: function (b) { lireEtape(3); var i = +b.dataset.i, o = S.brouillon.ordre; if (i > 0) { var x = o[i]; o[i] = o[i - 1]; o[i - 1] = x; } sauverBrouillon(); router(); var nb = $('[data-action=monter][data-i="' + (i - 1) + '"]'); if (nb) nb.focus(); },
    descendre: function (b) { lireEtape(3); var i = +b.dataset.i, o = S.brouillon.ordre; if (i < o.length - 1) { var x = o[i]; o[i] = o[i + 1]; o[i + 1] = x; } sauverBrouillon(); router(); var nb = $('[data-action=descendre][data-i="' + (i + 1) + '"]'); if (nb) nb.focus(); },
    actualiser: function (b) { var rec = trouver(b.dataset.id, b.dataset.role) || (ctxCourant() || {}).rec; if (rec) actualiser(rec).then(function () { if (navigator.onLine !== false) toast('À jour.'); }); },
    retirer: function (b) {
      confirmer('Retirer cette tontine de ce téléphone ? ' + (b.dataset.role === 'proprio' ? 'Gardez votre lien d\'organisation pour la retrouver : sans lui, vous ne pourrez plus confirmer les versements.' : 'Vous pourrez la retrouver avec le lien du groupe.'), 'Retirer', true).then(function (oui) {
        if (!oui) return;
        S.tontines = S.tontines.filter(function (x) { return !(x.id === b.dataset.id && x.role === b.dataset.role); });
        sauver().then(function () { location.hash = '#/'; });
      });
    },
    case: function (b) { var c = ctxCourant(); if (c) feuilleCase(c, membreDe(b), +b.dataset.p); },
    confirmer: function (b) { var c = ctxCourant(); if (c && c.org) feuilleConfirmer(c, membreDe(b), +b.dataset.p); },
    'jai-verse': function (b) { var c = ctxCourant(); if (c) feuilleDeclarer(c, +b.dataset.p || 0, b.dataset.m || ''); },
    rappeler: function (b) { var c = ctxCourant(); if (c && c.org) feuilleRappel(c, membreDe(b), +b.dataset.p); },
    'message-groupe': function (b) { var c = ctxCourant(); if (c && c.org) feuilleGroupe(c, +b.dataset.p); },
    remettre: function (b) { var c = ctxCourant(); if (c && c.org) feuilleRemettre(c, +b.dataset.p); },
    'tout-confirmer': function (b) {
      var c = ctxCourant(); if (!c) return;
      var n = +b.dataset.p, liste = c.r.aConfirmer.filter(function (x) { return x.periode === n; });
      if (!liste.length) return;
      var total = liste.reduce(function (s, x) { return s + x.montant; }, 0);
      confirmer('Confirmer la réception de ' + liste.length + ' versements déclarés pour le tour ' + n + ' (' + TC.formatF(total).replace(/ /g, ' ') + ') : ' + liste.map(function (x) { return x.nom; }).join(', ') + ' ?', 'Tout confirmer').then(function (oui) {
        if (!oui) return;
        envoyer(c.rec, 'versement_recu', { periode: n, lot: liste.map(function (x) { return x.membre + ':' + x.montant; }).join('|'), montant: total, nb: liste.length, date: aujourdhui() })
          .then(function () { toast(liste.length + ' versements confirmés.'); }).catch(function (e) { toast(e.message); });
      });
    },
    'annuler-ev': function (b) {
      var c = ctxCourant(); if (!c) return;
      var e = c.r.parId[b.dataset.ev]; if (!e) return;
      confirmer('Annuler cette action ? « ' + window.TCPDF.texteEvenement(c.t, e) + ' ». Elle restera visible, barrée, dans l\'historique.', 'Annuler l\'action', true).then(function (oui) {
        if (!oui) return;
        var d = e.donnees || {};
        envoyer(c.rec, 'versement_recu', { annule: e.id, membre: d.membre || d.beneficiaire || 0, nom: d.nom || '', periode: d.periode || 0, montant: 0 })
          .then(function () { toast('Action annulée.'); }).catch(function (er) { toast(er.message); });
      });
    },
    'amende-payee': function (b) {
      var c = ctxCourant(); if (!c) return;
      var M = c.r.membres[membreDe(b)], du = M.amendes - M.amendesPayees;
      feuille('Amende réglée · ' + M.nom, '<form data-form="amende" data-m="' + M.id + '">' + champ('Montant reçu (F CFA)', 'a-montant', TC.formatNombre(du), { mode: 'numeric', requis: true }) +
        '<p class="petit">Selon le règlement, ' + esc(M.nom) + ' doit ' + TC.formatF(du) + ' d\'amendes.</p><p id="err-feuille" class="erreur" role="alert" hidden></p><button type="submit" class="btn plein large">Noter</button></form>');
    },
    note: function () {
      var c = ctxCourant(); if (!c) return;
      feuille(c.org ? 'Note au groupe' : 'Laisser un mot', '<form data-form="note">' + (c.org ? '' : '<div class="champ"><label for="n-qui">De la part de</label><select id="n-qui"><option value="">(sans nom)</option>' +
        c.t.membres.map(function (m) { return '<option value="' + m.id + '"' + (m.id === c.rec.moi ? ' selected' : '') + '>' + esc(m.nom) + '</option>'; }).join('') + '</select></div>') +
        champ('Message', 'n-texte', '', { zone: true, lignes: 4, max: 500, requis: true }) + '<p class="petit">Visible par tout le groupe dans l\'historique.</p><p id="err-feuille" class="erreur" role="alert" hidden></p><button type="submit" class="btn plein large">Publier</button></form>');
    },
    cloturer: function () {
      var c = ctxCourant(); if (!c) return;
      var restants = c.r.tours.filter(function (x) { return !x.remis; }).length;
      confirmer((restants ? 'Il reste ' + restants + ' tour(s) sans remise notée. ' : '') + 'Clôturer la tontine « ' + c.t.titre + ' » ? Elle restera consultable par le groupe, mais plus rien ne pourra être noté.', 'Clôturer', true).then(function (oui) {
        if (!oui) return;
        envoyer(c.rec, 'cloture', { texte: 'Cycle terminé', total_confirme: c.r.totalConfirme, mains_remises: c.r.toursRemis }).then(function () { toast('Tontine clôturée.'); }).catch(function (e) { toast(e.message); });
      });
    },
    tel: function (b) {
      var c = ctxCourant(); if (!c) return;
      var mid = membreDe(b), m = c.t.parId[mid];
      feuille('Numéro de ' + m.nom, '<form data-form="tel" data-m="' + mid + '">' + champ('Numéro WhatsApp', 'tel-num', (c.rec.tels || {})[mid] || '', { type: 'tel', place: '77 000 00 00', aide: 'Gardé seulement sur ce téléphone, jamais envoyé.' }) +
        '<p id="err-feuille" class="erreur" role="alert" hidden></p><button type="submit" class="btn plein large">Enregistrer</button></form>');
    },
    renommer: function (b) {
      var c = ctxCourant(); if (!c) return;
      var mid = membreDe(b), m = c.t.parId[mid];
      feuille('Renommer ' + m.nom, '<form data-form="renommer" data-m="' + mid + '">' + champ('Prénom ou surnom', 'rn-nom', m.nom, { max: TC.NOM_MAX, requis: true }) +
        '<p class="petit">Par exemple quand un membre est remplacé. Le changement est noté dans l\'historique.</p><p id="err-feuille" class="erreur" role="alert" hidden></p><button type="submit" class="btn plein large">Enregistrer</button></form>');
    },
    'voir-lien-org': function () { var c = ctxCourant(); if (c) location.hash = '#/t/' + c.t.id + '/partager'; },
    copier: function (b) { copier(b.dataset.texte); },
    'partager-lien': function () { var c = ctxCourant(); if (c) partager(c.t.titre, TC.messageInvitation(c.t, ''), lienMembre(c.rec)); },
    pdf: function (b) {
      var c = ctxCourant(); if (!c) return;
      if (!premium()) { offrePass('pdf'); return; }
      occuper(b, true);
      window.TCPDF.generer(c.t, c.r, chaineDe(c.rec), c.evs).then(function (blob) {
        occuper(b, false);
        var nom = 'tontine-' + TC.textePDF(c.t.titre).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '-' + aujourdhui() + '.pdf';
        var fichier = null;
        try { fichier = new File([blob], nom, { type: 'application/pdf' }); } catch (e) { /* vieux navigateur */ }
        if (fichier && navigator.canShare && navigator.canShare({ files: [fichier] }) && navigator.share) {
          navigator.share({ files: [fichier], title: c.t.titre }).catch(function () { telecharger(blob, nom); });
        } else telecharger(blob, nom);
      }).catch(function (e) { occuper(b, false); toast(e.message); });
    },
    'retirer-pass': function () {
      confirmer('Retirer le pass de ce téléphone ? Vous pourrez le réactiver avec le lien de votre commande.', 'Retirer', true).then(function (oui) {
        if (!oui) return; S.pass = null; DB.mettre('pass', null).then(function () { vuePass(); });
      });
    }
  };

  // ---------- Formulaires ----------
  function erreurFeuille(msg) { var e = $('#err-feuille'); if (e) { e.textContent = msg; e.hidden = false; } else toast(msg); }
  function montantSaisi(id) { var v = TC.entier($(id).value); return v > 0 && v <= 100000000 ? v : 0; }
  function modifier(c, changements, objet, resume) {
    var t = Object.assign({}, c.t, changements);
    var maj = TC.encoderTontine(t);
    if (TC.tailleDonnees(maj) > 19000) return Promise.reject(new Error('Textes trop longs.'));
    return envoyer(c.rec, 'modification', { objet: objet, resume: resume }, maj);
  }
  var FORMS = {
    etape1: function () { avancer(1); }, etape2: function () { avancer(2); }, etape3: function () { avancer(3); }, etape4: function () { avancer(4); },
    etape5: function (f) { creer($('#btn-creer', f)); },
    lien: function () {
      var l = TC.lireLienTontine($('#l-lien').value);
      if (!l) { erreurFeuille('Lien non reconnu. Copiez le lien complet reçu de l\'organisation.'); return; }
      fermerFeuille();
      location.hash = '#/' + (l.role === 'proprio' ? 'org' : 'rejoindre') + '/' + l.id + '/' + l.jeton + (l.jetonMembre ? '/' + l.jetonMembre : '');
    },
    coller: function () {
      var b = S.brouillon, lignes = $('#c-liste').value.split(/\r?\n/), max = b.membres.reduce(function (s, m) { return Math.max(s, m.id); }, 0);
      b.membres = b.membres.filter(function (m) { return TC.nettoyerNom(m.nom); });
      lignes.forEach(function (l) {
        var tel = (l.match(/\+?\d[\d\s.-]{7,}\d/) || [''])[0];
        var nom = TC.nettoyerNom(l.replace(tel, '').replace(/^[\s\-•*\d.)]+/, ''));
        if (nom) b.membres.push({ id: ++max, nom: nom, mains: 1, tel: tel.trim() });
      });
      if (!b.membres.length) b.membres.push({ id: 1, nom: '', mains: 1, tel: '' });
      fermerFeuille(); sauverBrouillon(); router();
    },
    confirmer: function (f) {
      var c = ctxCourant(); if (!c) return;
      var mid = +f.dataset.m, n = +f.dataset.p, montant = montantSaisi('#c-montant'), date = $('#c-date').value;
      if (!montant) { erreurFeuille('Indiquez le montant reçu.'); return; }
      if (!TC.dateValide(date)) date = aujourdhui();
      var btn = $('button[type=submit]', f); occuper(btn, true);
      envoyer(c.rec, 'versement_recu', { membre: mid, nom: c.t.parId[mid].nom, periode: n, montant: montant, date: date, mode: $('#c-mode').value })
        .then(function () { fermerFeuille(); toast('Versement confirmé.'); router(); }).catch(function (e) { occuper(btn, false); erreurFeuille(e.message); });
    },
    declarer: function (f) {
      var c = ctxCourant(); if (!c) return;
      var mid = +$('#d-membre').value, n = +$('#d-tour').value, montant = montantSaisi('#d-montant'), date = $('#d-date').value;
      if (!mid) { erreurFeuille('Choisissez votre nom dans la liste.'); return; }
      if (!montant) { erreurFeuille('Indiquez le montant versé.'); return; }
      if (!TC.dateValide(date)) date = aujourdhui();
      var d = { membre: mid, nom: c.t.parId[mid].nom, periode: n, montant: montant, mode: $('#d-mode').value, date: date };
      var note = $('#d-note').value.trim(); if (note) d.note = note.slice(0, 200);
      c.rec.moi = mid; sauver();
      var btn = $('button[type=submit]', f); occuper(btn, true);
      envoyer(c.rec, 'versement_declare', d).then(function () {
        fermerFeuille(); toast('Merci ! Votre versement est signalé. L\'organisation va le confirmer.');
        var cible = '#/m/' + c.t.id + '/tour/' + n;
        if (location.hash !== cible) location.hash = cible; else router();
      })
        .catch(function (e) { occuper(btn, false); erreurFeuille(e.message); });
    },
    remettre: function (f) {
      var c = ctxCourant(); if (!c) return;
      var n = +f.dataset.p, mid = +$('#t-benef').value, montant = montantSaisi('#t-montant'), date = $('#t-date').value;
      if (!montant) { erreurFeuille('Indiquez le montant remis.'); return; }
      if (!TC.dateValide(date)) date = aujourdhui();
      var btn = $('button[type=submit]', f); occuper(btn, true);
      envoyer(c.rec, 'tour', { beneficiaire: mid, nom: c.t.parId[mid].nom, periode: n, montant: montant, date: date })
        .then(function () { fermerFeuille(); toast('Remise de la main notée.'); router(); }).catch(function (e) { occuper(btn, false); erreurFeuille(e.message); });
    },
    amende: function (f) {
      var c = ctxCourant(); if (!c) return;
      var mid = +f.dataset.m, montant = montantSaisi('#a-montant');
      if (!montant) { erreurFeuille('Indiquez le montant.'); return; }
      var btn = $('button[type=submit]', f); occuper(btn, true);
      envoyer(c.rec, 'versement_recu', { membre: mid, nom: c.t.parId[mid].nom, objet: 'amende', montant: montant, date: aujourdhui() })
        .then(function () { fermerFeuille(); toast('Amende notée.'); router(); }).catch(function (e) { occuper(btn, false); erreurFeuille(e.message); });
    },
    note: function (f) {
      var c = ctxCourant(); if (!c) return;
      var texte = $('#n-texte').value.trim(); if (!texte) { erreurFeuille('Écrivez votre message.'); return; }
      var d = { texte: texte.slice(0, 500) };
      if (!c.org && $('#n-qui').value) d.nom = c.t.parId[+$('#n-qui').value].nom;
      else if (c.org && c.t.organisateur) d.nom = c.t.organisateur;
      var btn = $('button[type=submit]', f); occuper(btn, true);
      envoyer(c.rec, 'note', d).then(function () { fermerFeuille(); toast('Message publié.'); router(); }).catch(function (e) { occuper(btn, false); erreurFeuille(e.message); });
    },
    tel: function (f) {
      var c = ctxCourant(); if (!c) return;
      var v = $('#tel-num').value.trim(), mid = +f.dataset.m;
      if (v && !TC.normaliserTel(v)) { erreurFeuille('Numéro non reconnu (ex. : 77 123 45 67 ou +33 6 12 34 56 78).'); return; }
      c.rec.tels = c.rec.tels || {};
      if (v) c.rec.tels[mid] = v; else delete c.rec.tels[mid];
      sauver().then(function () { fermerFeuille(); toast('Numéro enregistré sur ce téléphone.'); router(); });
    },
    renommer: function (f) {
      var c = ctxCourant(); if (!c) return;
      var mid = +f.dataset.m, nom = TC.nettoyerNom($('#rn-nom').value), ancien = c.t.parId[mid].nom;
      if (!nom) { erreurFeuille('Indiquez un prénom.'); return; }
      if (c.t.membres.some(function (m) { return m.id !== mid && m.nom.toLowerCase() === nom.toLowerCase(); })) { erreurFeuille('Ce nom est déjà pris.'); return; }
      var ms = c.t.membres.map(function (m) { return m.id === mid ? Object.assign({}, m, { nom: nom }) : m; });
      var btn = $('button[type=submit]', f); occuper(btn, true);
      modifier(c, { membres: ms }, 'membres', ancien + ' devient ' + nom).then(function () { fermerFeuille(); toast('Membre renommé.'); router(); }).catch(function (e) { occuper(btn, false); erreurFeuille(e.message); });
    },
    echanger: function (f) {
      var c = ctxCourant(); if (!c) return;
      var a = +$('#ech-a').value, b = +$('#ech-b').value;
      if (!a || !b || a === b) { toast('Choisissez deux tours différents.'); return; }
      var o = c.t.ordre.slice(), x = o[a - 1]; o[a - 1] = o[b - 1]; o[b - 1] = x;
      var resume = 'tours ' + a + ' et ' + b + ' échangés (' + TC.nomMembre(c.t, o[a - 1]) + ' passe au tour ' + a + ', ' + TC.nomMembre(c.t, o[b - 1]) + ' au tour ' + b + ')';
      confirmer('Échanger les tours ' + a + ' et ' + b + ' ? ' + TC.nomMembre(c.t, o[a - 1]) + ' recevra au tour ' + a + ' et ' + TC.nomMembre(c.t, o[b - 1]) + ' au tour ' + b + '.', 'Échanger').then(function (oui) {
        if (!oui) return;
        modifier(c, { ordre: o }, 'ordre', resume).then(function () { toast('Tours échangés.'); router(); }).catch(function (e) { toast(e.message); });
      });
    },
    regles: function (f) {
      var c = ctxCourant(); if (!c) return;
      var ch = { grace: +$('#n-grace').value || 0, amende: TC.entier($('#n-amende').value) || 0, amendeMode: ($('input[name=amende_mode]:checked') || {}).value || 'fixe',
        amendePlafond: TC.entier($('#n-plafond').value) || 0, regle_retard: $('#n-regle-retard').value, regle_depart: $('#n-regle-depart').value, regle_autres: $('#n-regle-autres').value };
      var btn = $('button[type=submit]', f); occuper(btn, true);
      modifier(c, ch, 'regles', 'règles du groupe mises à jour').then(function () { toast('Règles enregistrées.'); location.hash = '#/t/' + c.t.id + '/regles'; })
        .catch(function (e) { occuper(btn, false); var er = $('#err-regles'); er.textContent = e.message; er.hidden = false; });
    },
    pass: function (f) { activerPass(f); }
  };
  function avancer(n) {
    lireEtape(n);
    var err = validerEtape(n);
    if (err === 'membres') { offrePass('membres'); return; }
    if (err) { erreurEtape(err); return; }
    if (n === 2) S.brouillon.membres = S.brouillon.membres.filter(function (m) { return TC.nettoyerNom(m.nom); });
    S.brouillon.etape = n + 1;
    sauverBrouillon(); router();
  }

  // ---------- Branchements ----------
  function brancher() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]');
      if (!b || b.disabled) return;
      var a = ACTIONS[b.dataset.action];
      if (!a) return;
      if (b.tagName === 'A' && b.getAttribute('href') && b.getAttribute('href') !== '#') return;
      e.preventDefault();
      a(b);
    });
    document.addEventListener('submit', function (e) {
      var f = e.target.closest('form[data-form]');
      if (!f) return;
      e.preventDefault();
      var fn = FORMS[f.dataset.form];
      if (fn) fn(f);
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el.name === 'frequence') { var z = $('#zone-intervalle'); if (z) z.hidden = el.value !== 'autre'; }
      if (el.name === 'ordre' && S.brouillon) { lireEtape(3); S.brouillon.ordreMode = el.value; S.brouillon.ordre = []; S.brouillon.tirageLe = ''; sauverBrouillon(); router(); }
      if (el.name === 'amende_mode') { var p = $('#zone-plafond'); if (p) p.hidden = el.value !== 'jour'; }
      if (el.name === 'amende_mode' || el.id === 'n-amende' || el.id === 'n-plafond' || el.id === 'n-grace') majExemple();
      if (el.dataset.change === 'moi') { var c = ctxCourant(); if (c) { c.rec.moi = +el.value || 0; sauver().then(router); } }
      if (el.dataset.change === 'theme') appliquerTheme(el.value);
      if (/^m-souhait-/.test(el.id) && S.brouillon) { lireEtape(3); S.brouillon.ordre = TC.ordreParDate(membresValides(S.brouillon)); sauverBrouillon(); router(); }
    });
    document.addEventListener('input', function (e) {
      if (e.target.id === 'n-amende' || e.target.id === 'n-plafond') majExemple();
      if (/^m-nom-/.test(e.target.id) && S.brouillon) {
        var nb = $$('#liste-membres input[id^=m-nom-]').filter(function (i) { return TC.nettoyerNom(i.value); }).length, cpt = $('#compte-membres');
        if (cpt) cpt.firstChild && (cpt.textContent = nb + ' membre' + (nb > 1 ? 's' : '') + (premium() ? '' : ' · version gratuite : ' + TC.GRATUIT_MEMBRES + ' au plus') + '. « 2 mains » : la personne verse deux fois et reçoit deux fois.');
      }
    });
    document.addEventListener('focusout', function (e) {
      var el = e.target;
      if (/^(n-montant|n-amende|n-plafond|c-montant|d-montant|t-montant|a-montant)$/.test(el.id) && el.value) { var v = TC.entier(el.value); if (isFinite(v) && v >= 0) el.value = TC.formatNombre(v); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ouverte) fermerFeuille(); });
    $('#retour').addEventListener('click', function () { ACTIONS.retour(this); });
    $('#installer').addEventListener('click', function () { ACTIONS.installer(); });
    window.addEventListener('hashchange', router);
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; majInstall(); });
    window.addEventListener('appinstalled', function () { invite = null; majInstall(); toast('Application installée.'); });
    window.addEventListener('online', function () { reverifierPass(); var c = ctxCourant(); if (c) actualiser(c.rec, true); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      var c = ctxCourant();
      if (c && (!c.rec.lu || Date.now() - Date.parse(c.rec.lu) > 30000)) actualiser(c.rec, true);
    });
  }
  function majExemple() {
    var ex = $('#exemple-amende'); if (!ex) return;
    ex.textContent = exempleAmende({ amende: $('#n-amende').value, amendeMode: ($('input[name=amende_mode]:checked') || {}).value, amendePlafond: $('#n-plafond') ? $('#n-plafond').value : 0, grace: $('#n-grace') ? +$('#n-grace').value : 0 });
  }
  var majDemandee = false;
  function serviceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      var proposer = function () { toast('Nouvelle version disponible.', { label: 'Mettre à jour', fn: function () { majDemandee = true; if (reg.waiting) reg.waiting.postMessage('maj'); } }); };
      if (reg.waiting && navigator.serviceWorker.controller) proposer();
      reg.addEventListener('updatefound', function () { var w = reg.installing; if (w) w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) proposer(); }); });
    }).catch(function () { /* sans service worker */ });
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (majDemandee) { majDemandee = false; location.reload(); } });
  }
  function demarrer() {
    appliquerTheme(lireTheme());
    brancher();
    var p = new URLSearchParams(location.search);
    if (p.get('o') && p.get('t')) history.replaceState(null, '', location.pathname + '#/pass?code=' + encodeURIComponent('?o=' + p.get('o') + '&t=' + p.get('t')));
    charger().then(function () {
      router(); majInstall();
      var c = ctxCourant(); if (c) actualiser(c.rec, true);
      reverifierPass();
    }).catch(function (e) {
      vue('<section class="carte"><h1>Stockage indisponible</h1><p>' + esc(e && e.message || e) + '</p><p>Sur iPhone, quittez la navigation privée. Sinon, mettez à jour votre navigateur.</p></section>');
    });
    serviceWorker();
  }
  window.TCApp = { etat: S, version: VERSION };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
