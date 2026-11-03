/* Rendez-vous Pro — application : espace du professionnel (page, demandes, agenda, PDF) et page publique des clients.
   Les données du professionnel restent sur son téléphone ; le serveur « dossiers » ne garde que la page et l'historique
   des demandes. Aucun message n'est envoyé automatiquement : chaque envoi WhatsApp est fait par l'utilisateur. */
(function () {
  'use strict';
  var RV = window.RV;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]; }); };
  var JOUR_MS = 86400000;

  function svg(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + d + '</svg>'; }
  var ICO = {
    ok: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    croix: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    horloge: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    agenda: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    soleil: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    qr: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4"/>'),
    plus: svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
    ajouter: svg('<path d="M12 5v14M5 12h14"/>'),
    wa: svg('<path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.8z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z"/>'),
    partager: svg('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>'),
    copier: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    telecharger: svg('<path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16"/>'),
    imprimer: svg('<path d="M7 8V3h10v5M7 17H5a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="7" y="14" width="10" height="7"/>'),
    etoile: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    modifier: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
    actualiser: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
    tel: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
    lieu: svg('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    attention: svg('<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18v.01"/>'),
    gauche: svg('<path d="M15 18l-6-6 6-6"/>'),
    droite: svg('<path d="M9 18l6-6-6-6"/>'),
    sauvegarde: svg('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
    oeil: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    poubelle: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>'),
    installer: svg('<path d="M12 3v11m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="4" rx="1"/>')
  };

  // ---------- État ----------
  var S = { page: null, anciennes: [], dossiers: {}, attente: [], presences: {}, passes: [], reglages: { theme: 'auto' }, syncLe: null, sauvegarde: null,
    syncEnCours: false, horsLigne: false, envoi: null };
  var C = null;            // page publique ouverte (mode client)
  var vueCourante = '';     // nom de la vue affichée (pour savoir si l'on peut la redessiner)
  var FORMULAIRES = { profil: 1, creer: 1, ajouter: 1, pass: 1, importer: 1 };

  function sauver(cle) { return DB.mettre(cle, S[cle]).catch(function (e) { toast('Enregistrement impossible : ' + (e && e.message || e)); }); }
  function maintenant() { return new Date(); }
  function nouvelleRef() { return 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---------- Serveur ----------
  function api(chemin, corps) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var tm = setTimeout(function () { if (ctl) ctl.abort(); }, 20000);
    var init = { credentials: 'omit', cache: 'no-store' };
    if (ctl) init.signal = ctl.signal;
    if (corps) { init.method = 'POST'; init.headers = { 'content-type': 'application/json' }; init.body = JSON.stringify(corps); }
    return fetch(RV.API + chemin, init).then(function (r) {
      return r.text().then(function (t) {
        clearTimeout(tm);
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        return { status: r.status, json: j || {} };
      });
    }, function () { clearTimeout(tm); throw { reseau: true }; });
  }
  function passServeur() {
    var e = RV.etatPass(S.passes);
    return e.actif && e.courant && e.courant.jeton ? { o: e.courant.id, t: e.courant.jeton } : undefined;
  }
  function pageParId(id) { if (S.page && S.page.id === id) return S.page; return S.anciennes.filter(function (a) { return a.id === id; })[0] || null; }
  function pagesASuivre() {
    var now = Date.now();
    return [S.page].concat(S.anciennes.filter(function (a) { return !a.finSuivi || Date.parse(a.finSuivi) > now; })).filter(Boolean);
  }

  // ---------- Profil et rendez-vous ----------
  function profilCourant() {
    if (!S.page) return null;
    var d = S.dossiers[S.page.id], donnees = d ? d.donnees : S.page.donnees, titre = d ? d.titre : S.page.titre;
    S.attente.forEach(function (a) { if (a.page === S.page.id && a.maj) donnees = a.maj; });
    return RV.profil(donnees, titre);
  }
  function evenementsPage(id) {
    var d = S.dossiers[id];
    var evs = (d && d.evenements || []).map(function (e) { var x = Object.assign({}, e); x.page = id; return x; });
    S.attente.forEach(function (a, i) {
      if (a.page === id) evs.push({ id: 1e12 + i, type: a.type, auteur: 'proprio', donnees: a.donnees, le: a.cree, empreinte: a.lid, local: true, page: id });
    });
    return evs;
  }
  var cacheListe = null;
  function liste() {
    if (cacheListe) return cacheListe;
    var p = profilCourant(), out = [];
    pagesASuivre().forEach(function (pg) { out = out.concat(RV.reservations(evenementsPage(pg.id), p ? p.pas : 30)); });
    cacheListe = out.sort(function (a, b) { return (a.date + a.heure) < (b.date + b.heure) ? -1 : 1; });
    return cacheListe;
  }
  function trouver(ref) { return liste().filter(function (r) { return r.ref === ref; })[0] || null; }
  function passActif() { return RV.etatPass(S.passes).actif; }
  function enAttente() { var a = RV.aujourdhui(); return liste().filter(function (r) { return r.statut === 'en_attente' && r.date >= a; }); }
  function lienPublic(pg) { pg = pg || S.page; return pg && pg.jetonClient ? RV.lienPage(pg.id, pg.jetonClient) : ''; }
  function lienSecret() { return S.page ? RV.SITE + '#d=' + S.page.id + '&t=' + S.page.jetonPro + (S.page.jetonClient ? '&c=' + S.page.jetonClient : '') : ''; }

  // ---------- Actions du professionnel : file d'envoi (fonctionne hors ligne, envoyée dès que possible) ----------
  function agir(pageId, type, donnees, maj) {
    var a = { lid: nouvelleRef(), page: pageId, type: type, donnees: donnees || {}, maj: maj || null, cree: new Date().toISOString() };
    S.attente.push(a);
    cacheListe = null;
    sauver('attente');
    envoyer();
    return a;
  }
  function envoyer() {
    if (S.envoi) return S.envoi;
    S.envoi = (function suivant() {
      var a = S.attente[0];
      if (!a) return Promise.resolve();
      var pg = pageParId(a.page);
      if (!pg) { S.attente.shift(); return sauver('attente').then(suivant); }
      var corps = { t: pg.jetonPro, type: a.type, donnees: a.donnees };
      if (a.maj) corps.maj = a.maj;
      return api('/' + a.page + '/evenement', corps).then(function (r) {
        if (r.status === 201) {
          S.attente.shift();
          var vrai = r.json.empreinte;
          if (S.presences[a.lid]) { S.presences[vrai] = S.presences[a.lid]; delete S.presences[a.lid]; sauver('presences'); }
          S.attente.forEach(function (b) { if (b.donnees && b.donnees.demande === a.lid) b.donnees.demande = vrai; });
          var d = S.dossiers[a.page];
          if (d) {
            var der = d.evenements.length ? d.evenements[d.evenements.length - 1].id || 0 : 0;
            d.evenements.push({ id: der + 1, auteur: 'proprio', type: a.type, donnees: a.donnees, le: a.cree, empreinte: vrai });
            if (a.maj) d.donnees = a.maj;
            sauver('dossiers');
          }
          S.horsLigne = false;
          cacheListe = null;
          return sauver('attente').then(suivant);
        }
        if (r.status === 429 || r.status >= 500 || r.status === 0) return null;
        S.attente.shift();
        cacheListe = null;
        toast(r.status === 409 ? 'Votre page est pleine : créez une nouvelle page (Ma page).' : 'Action refusée par le serveur : ' + (r.json.message || r.status));
        return sauver('attente').then(suivant);
      }, function () { S.horsLigne = true; return null; });
    })().then(function () { S.envoi = null; rafraichir(); }, function () { S.envoi = null; });
    return S.envoi;
  }
  function synchroniser() {
    if (!S.page || S.syncEnCours) return Promise.resolve();
    S.syncEnCours = true; majEtatSync();
    return envoyer().then(function () {
      return pagesASuivre().reduce(function (p, pg) {
        return p.then(function () {
          return api('/' + pg.id + '?t=' + encodeURIComponent(pg.jetonPro)).then(function (r) {
            if (r.status === 200 && r.json.dossier) { S.dossiers[pg.id] = r.json.dossier; pg.introuvable = false; }
            else if (r.status === 404) pg.introuvable = true;
          });
        });
      }, Promise.resolve());
    }).then(function () {
      S.syncLe = new Date().toISOString(); S.horsLigne = false; cacheListe = null;
      return Promise.all([sauver('dossiers'), DB.mettre('syncLe', S.syncLe)]);
    }, function () { S.horsLigne = true; }).then(function () { S.syncEnCours = false; rafraichir(); });
  }

  // ---------- Interface commune ----------
  function vue(html) { var m = $('#vue'); m.innerHTML = html; document.documentElement.setAttribute('data-pret', '1'); }
  function cadre(o) {
    o = o || {};
    $('#titre').textContent = o.titre || 'Rendez-vous Pro';
    document.title = o.titreDoc || ((o.titre && o.titre !== 'Rendez-vous Pro' ? o.titre + ' — ' : '') + 'Rendez-vous Pro');
    var r = $('#retour'); r.hidden = !o.retour; r.setAttribute('data-cible', o.retour || '');
    $('#marque').hidden = !!o.retour;
    $('#nav').hidden = !!o.client || !S.page;
    document.body.classList.toggle('sans-nav', !!o.client || !S.page);
    $$('#nav a').forEach(function (a) { if (a.getAttribute('data-nav') === o.nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    majBadge(); majInstall(!!o.client);
    vueCourante = o.vue || '';
    window.scrollTo(0, 0);
  }
  function majBadge() {
    var b = $('#pastille'); if (!b) return;
    var n = S.page ? enAttente().length : 0;
    b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n);
  }
  var toastMinuterie = null;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.add('visible');
    clearTimeout(toastMinuterie);
    toastMinuterie = setTimeout(function () { t.classList.remove('visible'); setTimeout(function () { t.hidden = true; }, 300); }, 4200);
  }
  var feuilleOuverte = false, focusAvant = null;
  function feuille(titre, html) {
    var f = $('#feuille');
    focusAvant = document.activeElement;
    f.innerHTML = '<div class="feuille-fond" data-action="fermer-feuille"></div><div class="feuille-corps" role="dialog" aria-modal="true" aria-labelledby="feuille-titre">' +
      '<div class="feuille-tete"><h2 id="feuille-titre">' + esc(titre) + '</h2><button type="button" class="icone-btn" data-action="fermer-feuille" aria-label="Fermer">' + ICO.croix + '</button></div>' + html + '</div>';
    f.hidden = false; feuilleOuverte = true;
    var premier = $('.feuille-corps a, .feuille-corps button:not([data-action=fermer-feuille])', f);
    (premier || $('.feuille-corps', f)).focus();
  }
  function fermerFeuille() {
    var f = $('#feuille'); if (!f || f.hidden) return;
    f.hidden = true; f.innerHTML = ''; feuilleOuverte = false;
    if (focusAvant && focusAvant.focus) try { focusAvant.focus(); } catch (e) { /* élément disparu */ }
  }
  function rafraichir() {
    cacheListe = null;
    majBadge(); majEtatSync();
    if (feuilleOuverte || C || FORMULAIRES[vueCourante]) return;
    router(true);
  }
  function majEtatSync() {
    var el = $('#etat-sync'); if (!el) return;
    el.innerHTML = texteSync();
  }
  function texteSync() {
    var n = S.attente.length;
    if (S.syncEnCours) return '<span class="sync">' + ICO.actualiser + 'Mise à jour…</span>';
    if (S.horsLigne || navigator.onLine === false) return '<span class="sync hors">' + ICO.attention + 'Hors ligne' + (n ? ' — ' + n + ' action' + (n > 1 ? 's' : '') + ' en attente d\'envoi' : '') + '</span>';
    if (n) return '<span class="sync">' + n + ' action' + (n > 1 ? 's' : '') + ' en cours d\'envoi</span>';
    return S.syncLe ? '<span class="sync">Mis à jour à ' + heureLocale(S.syncLe) + '</span>' : '';
  }
  function heureLocale(t) { var d = new Date(t); return RV.heureFr(RV.hhmm(d.getHours() * 60 + d.getMinutes())); }
  function dureeFr(n) { var h = Math.floor(n / 60), m = n % 60; return h ? h + '\u00a0h' + (m ? '\u00a0' + (m < 10 ? '0' : '') + m : '') : m + '\u00a0min'; }
  function dateCourte(j) {
    var d = RV.versDate(j);
    return RV.JOURS[(d.getDay() + 6) % 7].nom.slice(0, 3) + '. ' + d.getDate() + ' ' + RV.MOIS_COURTS[d.getMonth()];
  }
  function majuscule(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function puce(statut) { var s = RV.STATUTS[statut] || { nom: statut, ton: 'neutre' }; return '<span class="puce ' + s.ton + '">' + esc(s.nom) + '</span>'; }
  function champ(label, nom, valeur, o) {
    o = o || {};
    var id = 'c-' + nom;
    var attrs = ' id="' + id + '" name="' + nom + '"' + (o.requis ? ' required' : '') + (o.place ? ' placeholder="' + esc(o.place) + '"' : '') +
      (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.auto ? ' autocomplete="' + o.auto + '"' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') + (o.aide ? ' aria-describedby="' + id + '-aide"' : '');
    var entree = o.zone ? '<textarea' + attrs + ' rows="' + (o.lignes || 3) + '">' + esc(valeur) + '</textarea>' : '<input type="' + (o.type || 'text') + '"' + attrs + ' value="' + esc(valeur) + '">';
    return '<div class="champ"><label for="' + id + '">' + esc(label) + (o.facultatif ? ' <small>(facultatif)</small>' : '') + '</label>' + entree +
      (o.aide ? '<p class="aide" id="' + id + '-aide">' + o.aide + '</p>' : '') + '</div>';
  }
  function telecharger(blob, nom) {
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = nom; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1500);
  }
  function copier(texte) {
    var fin = function () { toast('Lien copié.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(texte).then(fin, function () { copierAncien(texte); fin(); });
    copierAncien(texte); fin();
  }
  function copierAncien(texte) { var t = document.createElement('textarea'); t.value = texte; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) { /* rien */ } t.remove(); }
  function boutonWA(numero, message, libelle, extra) {
    return '<a class="btn wa large" target="_blank" rel="noopener" data-wa="1" href="' + esc(RV.lienWhatsApp(numero, message)) + '"' + (extra || '') + '>' + ICO.wa + esc(libelle) + '</a>';
  }
  function qrSVG(texte) {
    var qr = window.qrcode(0, 'M'); qr.addData(texte); qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true, alt: 'QR code de la page de rendez-vous' }).replace('<svg ', '<svg role="img" aria-label="QR code de votre page de rendez-vous" ');
  }

  // ---------- Installation ----------
  var invite = null;
  function estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function estInstallee() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function majInstall(client) { var b = $('#installer'); if (b) b.hidden = !!client || !!C || estInstallee() || !(invite || estIOS()); }
  function instructionsInstall() {
    if (estIOS()) return '<ol class="etapes"><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez <b>Partager</b> (carré avec une flèche vers le haut).</li><li>Choisissez <b>« Sur l\'écran d\'accueil »</b>, puis <b>Ajouter</b>.</li></ol>';
    return '<ol class="etapes"><li>Ouvrez cette page dans <b>Chrome</b>.</li><li>Touchez le menu <b>⋮</b> en haut à droite.</li><li>Choisissez <b>« Installer l\'application »</b> ou <b>« Ajouter à l\'écran d\'accueil »</b>.</li></ol>';
  }
  function installer() {
    if (invite) { invite.prompt(); invite.userChoice.then(function () { invite = null; majInstall(); }); return; }
    feuille('Installer l\'application', instructionsInstall());
  }

  // ---------- Bienvenue (pas encore de page) ----------
  function vueBienvenue() {
    cadre({ titre: 'Rendez-vous Pro', vue: 'bienvenue' });
    vue('<section class="hero"><img src="icons/icon-192.png" alt="" width="72" height="72"><h1>Rendez-vous Pro</h1>' +
      '<p class="accroche">Vos clients prennent rendez-vous en ligne. Vous confirmez en un geste, et WhatsApp prépare le message.</p></section>' +
      '<ul class="atouts">' + ['Votre page : services, prix et horaires', 'Un lien et un QR code à partager', 'Les demandes rangées dans votre agenda', 'Confirmer, refuser ou proposer une autre heure en un geste', 'Rappel WhatsApp la veille, absences notées', 'Le PDF de votre semaine']
        .map(function (x) { return '<li>' + ICO.ok + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<a class="btn plein large" href="#/creer">' + ICO.ajouter + 'Créer ma page de rendez-vous</a>' +
      '<p class="petit centre">Pour coiffeurs, salons, tailleurs, mécaniciens, photographes, répétiteurs, consultants… (hors cabinets médicaux).</p>' +
      '<section class="carte"><h2>Gratuit pour commencer</h2><p><b>' + RV.LIMITE_GRATUITE + ' rendez-vous par mois</b> sans payer. Au-delà : pass 1 mois à <b>' + RV.fcfa(1000) + '</b> ou 12 mois à <b>' + RV.fcfa(9000) + '</b>, payé par Wave.</p></section>' +
      '<section class="carte"><h2>Vous avez déjà une page ?</h2><p>Sur un nouveau téléphone, ouvrez votre <b>lien secret de professionnel</b> ou restaurez votre sauvegarde.</p>' +
      '<div class="rang-btn"><a class="btn sec" href="#/importer">Coller mon lien secret</a><a class="btn sec" href="#/sauvegarde">Restaurer une sauvegarde</a></div></section>' +
      '<section class="carte"><h2>Installer l\'application</h2>' + (invite ? '<button type="button" class="btn plein" data-action="installer">' + ICO.installer + 'Installer</button>' : instructionsInstall()) + '</section>');
  }

  // ---------- Formulaire de la page (création et modification) ----------
  var brouillon = null;
  function vueProfil(creation) {
    if (!creation && !S.page) { location.replace('#/'); return; }
    if (!brouillon || brouillon.pour !== (creation ? 'creer' : S.page.id)) {
      var p0 = creation ? RV.nouveauProfil('coiffure') : profilCourant();
      brouillon = { pour: creation ? 'creer' : S.page.id, p: JSON.parse(JSON.stringify(p0)), servicesTouches: !creation };
    }
    var p = brouillon.p;
    cadre({ titre: creation ? 'Créer ma page' : 'Modifier ma page', retour: creation ? '#/' : '#/page', nav: 'page', vue: creation ? 'creer' : 'profil' });
    var metiers = RV.METIERS.map(function (m) { return '<option value="' + m.cle + '"' + (m.cle === p.metier ? ' selected' : '') + '>' + esc(m.nom) + '</option>'; }).join('');
    var h = '<form class="pile" data-form="profil" data-creation="' + (creation ? 1 : 0) + '" novalidate>';
    if (creation) h += '<p class="intro">Remplissez votre page une fois. Vos clients y verront vos services, vos prix et vos heures libres.</p>';
    h += '<section class="carte"><h2>Votre activité</h2>' +
      champ('Nom affiché', 'nom', p.nom, { requis: true, place: 'Ex. : Salon Awa Coiffure', max: 80, auto: 'organization' }) +
      '<div class="champ"><label for="c-metier">Métier</label><select id="c-metier" name="metier">' + metiers + '</select></div>' +
      champ('Lieu', 'lieu', p.lieu, { place: 'Ex. : Liberté 6, près de la pharmacie', max: 160, facultatif: true, aide: 'Quartier et repère suffisent.' }) +
      champ('Votre numéro WhatsApp', 'telephone', p.telephone, { type: 'tel', mode: 'tel', place: 'Ex. : 77 123 45 67', max: 30, facultatif: true, aide: 'Visible par vos clients sur votre page, pour vous écrire.' }) +
      champ('Présentation courte', 'presentation', p.presentation, { zone: true, lignes: 2, max: 400, facultatif: true, place: 'Ex. : Tresses, tissages et coupes. Sur rendez-vous du lundi au samedi.' }) + '</section>';
    h += '<section class="carte"><h2>Services et prix</h2><p class="petit">Le prix et la durée s\'affichent sur votre page. Prix 0 = « sur devis ».</p><div id="services">' +
      p.services.map(ligneService).join('') + '</div><button type="button" class="btn sec" data-action="service-ajouter">' + ICO.ajouter + 'Ajouter un service</button></section>';
    h += '<section class="carte"><h2>Horaires</h2><p class="petit">Laissez l\'après-midi vide si vous travaillez sans pause.</p>' +
      RV.JOURS.map(function (j) { return ligneJour(j, p.horaires[j.cle]); }).join('') +
      '<button type="button" class="btn sec" data-action="copier-lundi">' + ICO.copier + 'Mettre les horaires du lundi partout</button></section>';
    h += '<details class="carte"' + (creation ? '' : ' open') + '><summary><h2>Réglages des rendez-vous</h2></summary>' +
      choix('Durée d\'un créneau', 'pas', p.pas, [[15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 heure']]) +
      choix('Délai minimum avant un rendez-vous', 'delai', p.delai, [[0, 'Aucun'], [1, '1 heure'], [2, '2 heures'], [4, '4 heures'], [12, '12 heures'], [24, 'La veille (24 h)']]) +
      choix('On peut réserver jusqu\'à', 'jours', p.jours, [[7, '7 jours à l\'avance'], [14, '14 jours'], [30, '30 jours'], [60, '60 jours']]) +
      choix('Clients reçus en même temps', 'capacite', p.capacite, [[1, '1 (un seul poste)'], [2, '2'], [3, '3'], [4, '4'], [5, '5']]) +
      '<div class="champ"><label for="c-conge">Jours fermés (congés, fêtes)</label><div class="rang"><input type="date" id="c-conge"><button type="button" class="btn sec" data-action="conge-ajouter">Ajouter</button></div>' +
      '<ul class="conges" id="conges">' + p.conges.map(ligneConge).join('') + '</ul></div></details>';
    h += '<p class="msg erreur" id="msg-profil" role="alert"></p><button type="submit" class="btn plein large" id="btn-profil">' + (creation ? ICO.ok + 'Créer ma page' : ICO.ok + 'Enregistrer') + '</button>';
    if (creation) h += '<p class="petit centre">La création demande Internet une fois. Gratuit : ' + RV.LIMITE_GRATUITE + ' rendez-vous par mois.</p>';
    vue(h + '</form>');
  }
  function choix(label, nom, val, opts) {
    return '<div class="champ"><label for="c-' + nom + '">' + esc(label) + '</label><select id="c-' + nom + '" name="' + nom + '">' +
      opts.map(function (o) { return '<option value="' + o[0] + '"' + (+o[0] === +val ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>';
  }
  var DUREES = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300];
  function ligneService(s, i) {
    var dd = DUREES.indexOf(s.duree) > -1 ? DUREES : DUREES.concat([s.duree]).sort(function (a, b) { return a - b; });
    return '<div class="service-ligne" data-i="' + i + '"><input type="text" name="s_nom" aria-label="Nom du service" placeholder="Nom du service" maxlength="60" value="' + esc(s.nom) + '">' +
      '<div class="rang"><label class="mini">Prix (F)<input type="text" name="s_prix" inputmode="numeric" value="' + (s.prix ? RV.milliers(s.prix) : '0') + '"></label>' +
      '<label class="mini">Durée<select name="s_duree">' + dd.map(function (d) { return '<option value="' + d + '"' + (d === s.duree ? ' selected' : '') + '>' + dureeFr(d) + '</option>'; }).join('') + '</select></label>' +
      '<button type="button" class="icone-btn danger" data-action="service-retirer" aria-label="Retirer ce service">' + ICO.poubelle + '</button></div></div>';
  }
  function ligneJour(j, plages) {
    var ouvert = plages && plages.length, a = plages[0] || [540, 780], b = plages[1];
    return '<fieldset class="jour" data-jour="' + j.cle + '"><legend>' + majuscule(j.nom) + '</legend><label class="interrupteur"><input type="checkbox" name="o_' + j.cle + '"' + (ouvert ? ' checked' : '') + '> Ouvert</label>' +
      '<div class="plages"' + (ouvert ? '' : ' hidden') + '><div class="rang"><input type="time" step="900" name="a1_' + j.cle + '" aria-label="' + j.nom + ' : début" value="' + RV.hhmm(a[0]) + '"><span>à</span><input type="time" step="900" name="b1_' + j.cle + '" aria-label="' + j.nom + ' : fin" value="' + RV.hhmm(a[1]) + '"></div>' +
      '<div class="rang"><span class="petit">puis</span><input type="time" step="900" name="a2_' + j.cle + '" aria-label="' + j.nom + ' : reprise" value="' + (b ? RV.hhmm(b[0]) : '') + '"><span>à</span><input type="time" step="900" name="b2_' + j.cle + '" aria-label="' + j.nom + ' : fin de journée" value="' + (b ? RV.hhmm(b[1]) : '') + '"></div></div></fieldset>';
  }
  function ligneConge(d) { return '<li><span>' + esc(majuscule(RV.dateFr(d, { annee: true }))) + '</span><button type="button" class="icone-btn" data-action="conge-retirer" data-date="' + d + '" aria-label="Retirer ce jour fermé">' + ICO.croix + '</button></li>'; }
  // Lit le formulaire dans le brouillon (appelé à chaque changement pour ne rien perdre)
  function lireProfil(f) {
    var p = brouillon.p, v = function (n) { var e = f.elements[n]; return e ? e.value : ''; };
    p.nom = RV.texte(v('nom'), 80); p.lieu = RV.texte(v('lieu'), 160); p.telephone = RV.texte(v('telephone'), 30); p.presentation = RV.texte(v('presentation'), 400);
    if (f.elements.pas) { p.pas = +v('pas'); p.delai = +v('delai'); p.jours = +v('jours'); p.capacite = +v('capacite'); }
    p.services = $$('.service-ligne', f).map(function (l) {
      return { nom: RV.texte($('[name=s_nom]', l).value, 60), prix: RV.entier($('[name=s_prix]', l).value), duree: +$('[name=s_duree]', l).value };
    });
    // Nouveau métier choisi avant d'avoir touché aux services : on propose ses services d'exemple
    var metier = v('metier');
    if (metier !== p.metier && !brouillon.servicesTouches) p.services = RV.METIER[metier].services.map(function (s) { return { nom: s[0], prix: s[1], duree: s[2] }; });
    p.metier = metier;
    RV.JOURS.forEach(function (j) {
      var o = f.elements['o_' + j.cle].checked, pl = [];
      if (o) {
        var a1 = RV.minutes(v('a1_' + j.cle)), b1 = RV.minutes(v('b1_' + j.cle)), a2 = RV.minutes(v('a2_' + j.cle)), b2 = RV.minutes(v('b2_' + j.cle));
        if (a1 != null && b1 != null && b1 > a1) pl.push([a1, b1]);
        if (a2 != null && b2 != null && b2 > a2 && (!pl.length || a2 >= pl[0][1])) pl.push([a2, b2]);
      }
      p.horaires[j.cle] = pl;
    });
    return p;
  }
  function enregistrerProfil(f) {
    var p = lireProfil(f), msg = $('#msg-profil'), btn = $('#btn-profil');
    p.services = p.services.filter(function (s) { return s.nom; });
    var err = RV.verifierProfil(p);
    if (err.length) { msg.textContent = err.join(' '); msg.scrollIntoView({ block: 'center' }); return; }
    msg.textContent = '';
    if (f.getAttribute('data-creation') === '1') {
      btn.disabled = true; msg.textContent = 'Création de votre page…'; msg.classList.remove('erreur');
      var donnees = RV.donneesProfil(p);
      api('/creer', { app: 'rdv', titre: p.nom, donnees: donnees, pass: passServeur() }).then(function (r) {
        if (r.status !== 201) {
          btn.disabled = false; msg.classList.add('erreur');
          msg.textContent = r.status === 429 ? 'Trop de pages créées aujourd\'hui depuis cette connexion. Réessayez demain.' : (r.json.message || 'Création impossible pour le moment.');
          return;
        }
        var now = new Date().toISOString();
        S.page = { id: r.json.id, jetonPro: r.json.jetons.proprio, jetonClient: r.json.jetons.client, creeLe: now, titre: p.nom, donnees: donnees };
        S.dossiers[S.page.id] = { id: S.page.id, app: 'rdv', titre: p.nom, donnees: donnees, statut: 'ouvert', role: 'proprio', evenements: [{ id: 1, auteur: 'proprio', type: 'creation', donnees: donnees, le: now, empreinte: r.json.empreinte }] };
        brouillon = null;
        Promise.all([sauver('page'), sauver('dossiers')]).then(function () { DB.persister(); location.hash = '#/page?nouvelle=1'; });
      }, function () {
        btn.disabled = false; msg.classList.add('erreur');
        msg.textContent = 'Pas de connexion Internet : connectez-vous une fois pour créer votre page. Vos informations restent dans le formulaire.';
      });
      return;
    }
    var avant = profilCourant();
    p.suite = avant.suite || '';
    agir(S.page.id, 'modification', { changement: 'page' }, RV.donneesProfil(p));
    brouillon = null;
    toast('Page enregistrée.');
    location.hash = '#/page';
  }

  // ---------- Accueil du professionnel : demandes, aujourd'hui, demain ----------
  function vueAccueil() {
    var p = profilCourant(), l = liste(), auj = RV.aujourdhui(), dem = RV.ajouterJours(auj, 1);
    cadre({ titre: p.nom || 'Rendez-vous Pro', nav: 'accueil', vue: 'accueil' });
    var att = enAttente(), duJour = l.filter(function (r) { return r.date === auj && RV.retenu(r); }), demain = l.filter(function (r) { return r.date === dem && RV.retenu(r); });
    var prevu = duJour.reduce(function (s, r) { return s + r.prix; }, 0);
    var h = '<div class="barre-etat"><p id="etat-sync" aria-live="polite">' + texteSync() + '</p><button type="button" class="btn petit sec" data-action="actualiser">' + ICO.actualiser + 'Actualiser</button></div>';
    h += bandeauPass(l);
    if (S.page.introuvable) h += '<section class="carte alerte"><p>' + ICO.attention + ' Votre page est introuvable sur le serveur (effacée après 180 jours sans activité ?). Créez-en une nouvelle depuis « Plus ».</p></section>';
    h += '<div class="kpis"><div class="kpi"><span class="valeur">' + duJour.length + '</span><span class="lib">rendez-vous aujourd\'hui</span></div>' +
      '<div class="kpi"><span class="valeur">' + RV.fcfa(prevu) + '</span><span class="lib">prévus aujourd\'hui</span></div>' +
      '<div class="kpi' + (att.length ? ' chaud' : '') + '"><span class="valeur">' + att.length + '</span><span class="lib">demande' + (att.length > 1 ? 's' : '') + ' à traiter</span></div></div>';
    if (att.length) h += '<h2>Demandes à traiter</h2>' + att.map(carteDemande).join('');
    h += '<h2>Aujourd\'hui <small>' + esc(RV.dateFr(auj)) + '</small></h2>' + (duJour.length ? duJour.map(function (r) { return carteRdv(r, 'jour'); }).join('') :
      '<p class="vide">Aucun rendez-vous aujourd\'hui.</p>');
    h += '<h2>Demain <small>' + esc(RV.dateFr(dem)) + '</small></h2>' + (demain.length ? '<p class="petit">Envoyez un rappel à chaque client, un par un.</p>' + demain.map(function (r) { return carteRdv(r, 'demain'); }).join('') :
      '<p class="vide">Aucun rendez-vous demain.</p>');
    h += '<div class="rang-btn"><a class="btn sec" href="#/ajouter">' + ICO.ajouter + 'Ajouter un rendez-vous</a><a class="btn sec" href="#/page">' + ICO.partager + 'Partager ma page</a></div>';
    vue(h);
  }
  function bandeauPass(l) {
    var e = RV.etatPass(S.passes), n = RV.rdvDuMois(l);
    if (e.actif) return e.rappel ? '<section class="carte alerte"><p>' + ICO.attention + ' Votre pass se termine dans <b>' + e.joursRestants + ' jour' + (e.joursRestants > 1 ? 's' : '') + '</b>. <a href="#/pass">Renouveler</a></p></section>' : '';
    var plein = n >= RV.LIMITE_GRATUITE;
    return '<section class="carte quota' + (plein ? ' alerte' : '') + '"><div class="jauge" role="progressbar" aria-label="Rendez-vous gratuits utilisés ce mois" aria-valuemin="0" aria-valuemax="' + RV.LIMITE_GRATUITE + '" aria-valuenow="' + Math.min(n, RV.LIMITE_GRATUITE) + '"><span style="width:' + Math.min(100, Math.round(n / RV.LIMITE_GRATUITE * 100)) + '%"></span></div>' +
      '<p><b>' + Math.min(n, RV.LIMITE_GRATUITE) + ' / ' + RV.LIMITE_GRATUITE + '</b> rendez-vous gratuits en ' + esc(RV.moisFr(Date.now())) + '. ' +
      (plein ? 'Limite atteinte : les nouvelles demandes attendent votre pass. ' : '') + '<a href="#/pass">' + (e.expire ? 'Renouveler le pass' : 'Passer au pass') + '</a></p></section>';
  }
  function infosRdv(r) {
    var bits = [];
    if (r.service) bits.push(esc(r.service));
    if (r.prix) bits.push(esc(RV.fcfa(r.prix)));
    bits.push(esc(dureeFr(r.duree)));
    return bits.join(' · ');
  }
  function carteDemande(r) {
    var abs = RV.absences(liste(), S.presences, r);
    return '<article class="carte demande" data-ref="' + esc(r.ref) + '"><a class="lien-carte" href="#/rdv/' + encodeURIComponent(r.ref) + '"><div class="quand"><span class="jourc">' + esc(dateCourte(r.date)) + '</span><span class="heure">' + esc(RV.heureFr(r.heure)) + '</span></div>' +
      '<div class="qui"><h3>' + esc(r.nom) + '</h3><p>' + infosRdv(r) + '</p>' + (r.note ? '<p class="note">« ' + esc(r.note) + ' »</p>' : '') +
      (abs ? '<p class="alerte-texte">' + ICO.attention + 'Absent' + (abs > 1 ? ' ' + abs + ' fois' : ' 1 fois') + ' déjà</p>' : '') + (r.telephone ? '' : '<p class="petit">Pas de numéro laissé</p>') + '</div></a>' +
      '<div class="actions3"><button type="button" class="btn ok" data-action="confirmer" data-ref="' + esc(r.ref) + '">' + ICO.ok + 'Confirmer</button>' +
      '<a class="btn sec" href="#/autre-heure/' + encodeURIComponent(r.ref) + '">' + ICO.horloge + 'Autre heure</a>' +
      '<button type="button" class="btn danger-doux" data-action="refuser" data-ref="' + esc(r.ref) + '">' + ICO.croix + 'Refuser</button></div></article>';
  }
  function carteRdv(r, contexte) {
    var p = profilCourant(), pres = S.presences[r.ref], num = RV.numeroWhatsApp(r.telephone);
    var h = '<article class="carte rdv' + (pres === 'absent' ? ' absent' : '') + '" data-ref="' + esc(r.ref) + '"><a class="lien-carte" href="#/rdv/' + encodeURIComponent(r.ref) + '">' +
      '<div class="quand"><span class="heure">' + esc(RV.heureFr(r.heure)) + '</span>' + (contexte === 'semaine' ? '<span class="jourc">' + esc(dateCourte(r.date)) + '</span>' : '') + '</div>' +
      '<div class="qui"><h3>' + esc(r.nom) + '</h3><p>' + infosRdv(r) + '</p>' + (r.statut !== 'confirme' ? puce(r.statut) : '') + (r.local ? ' <span class="puce attente">Envoi en attente</span>' : '') + '</div></a>';
    if (contexte === 'jour') {
      h += '<div class="presence" role="group" aria-label="Présence de ' + esc(r.nom) + '"><button type="button" class="btn petit' + (pres === 'venu' ? ' ok' : ' sec') + '" data-action="presence" data-valeur="venu" data-ref="' + esc(r.ref) + '" aria-pressed="' + (pres === 'venu') + '">' + ICO.ok + 'Venu</button>' +
        '<button type="button" class="btn petit' + (pres === 'absent' ? ' danger' : ' sec') + '" data-action="presence" data-valeur="absent" data-ref="' + esc(r.ref) + '" aria-pressed="' + (pres === 'absent') + '">' + ICO.croix + 'Absent</button></div>';
    } else if (contexte === 'demain') {
      h += '<div class="presence"><a class="btn petit wa" target="_blank" rel="noopener" data-wa="1" data-action="rappel" data-ref="' + esc(r.ref) + '" href="' + esc(RV.lienWhatsApp(num, RV.messageRappel(p, r))) + '">' + ICO.wa + (r.rappels ? 'Rappel envoyé — renvoyer' : 'Envoyer le rappel') + '</a></div>';
    }
    return h + '</article>';
  }

  // ---------- Réponses aux demandes ----------
  function verifierQuota(r) {
    if (r.accepteLe || RV.peutAccepter(liste(), passActif())) return true;
    location.hash = '#/pass?raison=limite';
    return false;
  }
  function confirmer(ref) {
    var r = trouver(ref); if (!r) return;
    if (!verifierQuota(r)) return;
    agir(r.page || S.page.id, 'confirmation', { demande: ref });
    var r2 = trouver(ref) || r, num = RV.numeroWhatsApp(r2.telephone);
    rafraichirSousFeuille();
    feuille('Rendez-vous confirmé', '<p class="grand">' + ICO.ok + ' ' + esc(r2.nom) + ' — ' + esc(RV.quand(r2)) + '</p>' +
      (num ? '<p>Prévenez ' + esc(r2.nom) + ' : le message est prêt, il ne reste qu\'à l\'envoyer.</p>' : '<p>' + esc(r2.nom) + ' n\'a pas laissé de numéro : la confirmation s\'affiche sur sa page. Vous pouvez aussi choisir son contact dans WhatsApp.</p>') +
      boutonWA(num, RV.messageConfirmation(profilCourant(), r2), num ? 'Envoyer la confirmation sur WhatsApp' : 'Ouvrir WhatsApp') +
      '<button type="button" class="btn sec large" data-action="fermer-feuille">Fermer</button>');
  }
  function refuser(ref) {
    var r = trouver(ref); if (!r) return;
    agir(r.page || S.page.id, 'refus', { demande: ref });
    var num = RV.numeroWhatsApp(r.telephone);
    rafraichirSousFeuille();
    feuille('Demande refusée', '<p>' + esc(r.nom) + ' — ' + esc(RV.quand(r)) + '</p>' +
      boutonWA(num, RV.messageRefus(profilCourant(), r, lienPublic()), num ? 'Prévenir sur WhatsApp' : 'Ouvrir WhatsApp') +
      '<button type="button" class="btn sec large" data-action="confirmer" data-ref="' + esc(ref) + '">Finalement, confirmer</button>' +
      '<button type="button" class="btn sec large" data-action="fermer-feuille">Fermer</button>');
  }
  function annulerRdv(ref) {
    var r = trouver(ref); if (!r) return;
    if (!confirm('Annuler le rendez-vous de ' + r.nom + ' (' + RV.quand(r) + ') ?')) return;
    agir(r.page || S.page.id, 'annulation', { demande: ref });
    var num = RV.numeroWhatsApp(r.telephone);
    rafraichirSousFeuille();
    feuille('Rendez-vous annulé', boutonWA(num, RV.messageAnnulation(profilCourant(), r), 'Prévenir sur WhatsApp') + '<button type="button" class="btn sec large" data-action="fermer-feuille">Fermer</button>');
  }
  function rafraichirSousFeuille() { cacheListe = null; majBadge(); if (!C && !FORMULAIRES[vueCourante]) router(true); }

  // ---------- Fiche d'un rendez-vous ----------
  var LIB_EV = { demande: 'Demande reçue', confirmation: 'Confirmé', report: 'Autre heure proposée', refus: 'Refusé', annulation: 'Annulé', note: 'Note du client', rappel: 'Rappel WhatsApp envoyé' };
  function vueRdv(ref) {
    var r = trouver(ref);
    if (!r) { cadre({ titre: 'Rendez-vous', retour: '#/', nav: 'accueil', vue: 'rdv' }); vue('<p class="vide">Rendez-vous introuvable.</p>'); return; }
    var p = profilCourant(), num = RV.numeroWhatsApp(r.telephone), pres = S.presences[r.ref];
    cadre({ titre: r.nom || 'Rendez-vous', retour: '#/agenda?j=' + r.date, nav: 'agenda', vue: 'rdv' });
    var h = '<section class="carte fiche"><div class="ligne-entre">' + puce(r.statut) + (r.source === 'pro' ? '<span class="petit">Ajouté par vous</span>' : '<span class="petit">Demandé en ligne</span>') + '</div>' +
      '<p class="grand-quand">' + esc(majuscule(RV.dateFr(r.date))) + '<br><b>' + esc(RV.heureFr(r.heure)) + '</b> <small>(' + esc(dureeFr(r.duree)) + ')</small></p>' +
      (r.avant ? '<p class="petit">Demandé au départ : ' + esc(RV.quand(r.avant)) + '</p>' : '') +
      '<dl class="details"><dt>Client</dt><dd>' + esc(r.nom) + '</dd>' + (r.service ? '<dt>Service</dt><dd>' + esc(r.service) + '</dd>' : '') +
      '<dt>Prix</dt><dd>' + (r.prix ? esc(RV.fcfa(r.prix)) : 'Sur devis') + '</dd>' + (r.telephone ? '<dt>Téléphone</dt><dd>' + esc(r.telephone) + '</dd>' : '') +
      (r.note ? '<dt>Note</dt><dd>« ' + esc(r.note) + ' »</dd>' : '') + (r.motif ? '<dt>Motif</dt><dd>' + esc(r.motif) + '</dd>' : '') + '</dl>' +
      (r.notes.length ? '<h3>Messages du client</h3><ul class="notes">' + r.notes.map(function (n) { return '<li>« ' + esc(n.texte) + ' » <small>' + esc(new Date(n.le).toLocaleString('fr-FR')) + '</small></li>'; }).join('') + '</ul>' : '') + '</section>';
    h += '<div class="pile">';
    if (r.statut === 'en_attente') {
      h += '<button type="button" class="btn ok large" data-action="confirmer" data-ref="' + esc(r.ref) + '">' + ICO.ok + 'Confirmer</button>' +
        '<a class="btn sec large" href="#/autre-heure/' + encodeURIComponent(r.ref) + '">' + ICO.horloge + 'Proposer une autre heure</a>' +
        '<button type="button" class="btn danger-doux large" data-action="refuser" data-ref="' + esc(r.ref) + '">' + ICO.croix + 'Refuser</button>';
    } else if (RV.retenu(r)) {
      h += boutonWA(num, RV.messageRappel(p, r), 'Envoyer un rappel WhatsApp', ' data-action="rappel" data-ref="' + esc(r.ref) + '"');
      if (r.date <= RV.aujourdhui()) h += '<div class="presence" role="group" aria-label="Présence"><button type="button" class="btn' + (pres === 'venu' ? ' ok' : ' sec') + '" data-action="presence" data-valeur="venu" data-ref="' + esc(r.ref) + '" aria-pressed="' + (pres === 'venu') + '">' + ICO.ok + 'Venu</button>' +
        '<button type="button" class="btn' + (pres === 'absent' ? ' danger' : ' sec') + '" data-action="presence" data-valeur="absent" data-ref="' + esc(r.ref) + '" aria-pressed="' + (pres === 'absent') + '">' + ICO.croix + 'Absent</button></div>';
      h += '<a class="btn sec large" href="#/autre-heure/' + encodeURIComponent(r.ref) + '">' + ICO.horloge + 'Changer l\'heure</a>' +
        '<button type="button" class="btn danger-doux large" data-action="annuler-rdv" data-ref="' + esc(r.ref) + '">' + ICO.croix + 'Annuler le rendez-vous</button>';
    } else if (r.statut === 'refuse' && r.date >= RV.aujourdhui()) {
      h += '<button type="button" class="btn sec large" data-action="confirmer" data-ref="' + esc(r.ref) + '">Finalement, confirmer</button>';
    }
    if (num) h += '<a class="btn sec large" href="tel:+' + num + '">' + ICO.tel + 'Appeler</a>';
    h += '</div><section class="carte"><h2>Historique</h2><ol class="historique">' + r.historique.map(function (e) {
      return '<li><b>' + esc(LIB_EV[e.type] || (e.type === 'confirmation' && r.source === 'pro' ? 'Ajouté' : e.type)) + '</b>' + (e.type === 'report' && e.date ? ' : ' + esc(RV.quand(e)) : '') +
        (e.type === 'annulation' ? (e.auteur === 'client' ? ' par le client' : ' par vous') : '') + ' <small>' + esc(new Date(e.le).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + '</small></li>';
    }).join('') + (r.local ? '<li><span class="puce attente">Envoi en attente (hors ligne)</span></li>' : '') + '</ol></section>';
    vue(h);
  }

  // ---------- Choix d'un jour puis d'une heure (autre heure, ajout, page publique) ----------
  function grilleJours(p, l, duree, choisi, action, ignorer) {
    return '<div class="jours" role="list">' + RV.joursReservables(p).map(function (j) {
      var n = j.ouvert ? RV.creneauxLibres(p, l, j.date, duree, null, ignorer).length : 0;
      var d = RV.versDate(j.date);
      return '<button type="button" role="listitem" class="jour-puce' + (j.date === choisi ? ' choisi' : '') + '" data-action="' + action + '" data-date="' + j.date + '"' + (n ? '' : ' disabled') +
        ' aria-label="' + esc(RV.dateFr(j.date)) + ' : ' + (n ? n + ' heure' + (n > 1 ? 's' : '') + ' libre' + (n > 1 ? 's' : '') : (j.ouvert ? 'complet' : 'fermé')) + '"' + (j.date === choisi ? ' aria-pressed="true"' : '') + '>' +
        '<small>' + RV.JOURS[(d.getDay() + 6) % 7].nom.slice(0, 3) + '.</small><b>' + d.getDate() + '</b><small>' + RV.MOIS_COURTS[d.getMonth()] + '</small><em>' + (n ? n + ' libre' + (n > 1 ? 's' : '') : (j.ouvert ? 'complet' : 'fermé')) + '</em></button>';
    }).join('') + '</div>';
  }
  function grilleHeures(liste_, action, choisie) {
    if (!liste_.length) return '<p class="vide">Plus d\'heure libre ce jour-là.</p>';
    return '<div class="creneaux">' + liste_.map(function (h) {
      return '<button type="button" class="creneau' + (h === choisie ? ' choisi' : '') + '" data-action="' + action + '" data-heure="' + h + '">' + esc(RV.heureFr(h)) + '</button>';
    }).join('') + '</div>';
  }
  var choixAutre = {};
  function vueAutreHeure(ref) {
    var r = trouver(ref);
    if (!r) { location.replace('#/'); return; }
    var p = profilCourant(), l = liste();
    if (choixAutre.ref !== ref) choixAutre = { ref: ref, date: r.date };
    cadre({ titre: 'Autre heure', retour: '#/rdv/' + encodeURIComponent(ref), nav: 'agenda', vue: 'autre' });
    var libres = RV.creneauxLibres(p, l, choixAutre.date, r.duree, null, ref);
    vue('<section class="carte"><p>' + esc(r.nom) + ' a demandé <b>' + esc(RV.quand(r)) + '</b>' + (r.service ? ' (' + esc(r.service) + ')' : '') + '.</p><p class="petit">Choisissez le jour puis l\'heure que vous proposez.</p></section>' +
      '<h2>Jour</h2>' + grilleJours(p, l, r.duree, choixAutre.date, 'autre-jour', ref) +
      '<h2>Heure <small>' + esc(RV.dateFr(choixAutre.date)) + '</small></h2>' + grilleHeures(libres, 'autre-heure'));
  }
  function proposer(heure) {
    var r = trouver(choixAutre.ref); if (!r) return;
    if (!verifierQuota(r)) return;
    agir(r.page || S.page.id, 'report', { demande: r.ref, date: choixAutre.date, heure: heure });
    var r2 = trouver(r.ref), num = RV.numeroWhatsApp(r2.telephone);
    apresRendu = function () {
      feuille('Nouvelle heure proposée', '<p class="grand">' + esc(r2.nom) + ' — ' + esc(RV.quand(r2)) + '</p>' +
        boutonWA(num, RV.messageReport(profilCourant(), r2, lienPublic()), num ? 'Envoyer la proposition sur WhatsApp' : 'Ouvrir WhatsApp') +
        '<button type="button" class="btn sec large" data-action="fermer-feuille">Fermer</button>');
    };
    location.hash = '#/rdv/' + encodeURIComponent(r.ref);
  }

  // ---------- Ajouter un rendez-vous (client au téléphone ou de passage) ----------
  var choixAjout = null;
  function vueAjouter(params) {
    var p = profilCourant(), l = liste();
    if (!choixAjout) choixAjout = { date: params.get('j') || RV.aujourdhui(), heure: params.get('h') || '', service: 0 };
    var s = p.services[choixAjout.service] || p.services[0] || { nom: '', prix: 0, duree: p.pas };
    cadre({ titre: 'Ajouter un rendez-vous', retour: '#/agenda?j=' + choixAjout.date, nav: 'agenda', vue: 'ajouter' });
    var libres = RV.creneauxLibres(p, l, choixAjout.date, s.duree, Date.now() - p.delai * 3600000);
    if (choixAjout.heure && libres.indexOf(choixAjout.heure) < 0) libres.push(choixAjout.heure);
    libres.sort();
    vue('<form class="pile" data-form="ajouter" novalidate><section class="carte">' +
      champ('Nom du client', 'nom', choixAjout.nom || '', { requis: true, max: 80, auto: 'off' }) +
      champ('Téléphone', 'telephone', choixAjout.telephone || '', { type: 'tel', mode: 'tel', max: 30, facultatif: true, place: 'Ex. : 77 123 45 67', aide: 'Gardé dans l\'historique de votre page, pour lui écrire sur WhatsApp.' }) +
      '<div class="champ"><label for="c-service">Service</label><select id="c-service" name="service">' + p.services.map(function (x, i) {
        return '<option value="' + i + '"' + (i === choixAjout.service ? ' selected' : '') + '>' + esc(x.nom) + ' — ' + (x.prix ? esc(RV.fcfa(x.prix)) : 'sur devis') + ' — ' + esc(dureeFr(x.duree)) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="champ"><label for="c-date">Jour</label><input type="date" id="c-date" name="date" value="' + esc(choixAjout.date) + '" min="' + RV.aujourdhui() + '"></div></section>' +
      '<h2>Heure <small>' + esc(RV.dateFr(choixAjout.date)) + '</small></h2>' + grilleHeures(libres, 'ajout-heure', choixAjout.heure) +
      '<div class="champ"><label for="c-heure-libre">Ou une autre heure</label><input type="time" step="300" id="c-heure-libre" name="heure_libre" value=""></div>' +
      champ('Note', 'note', choixAjout.note || '', { zone: true, lignes: 2, max: 300, facultatif: true }) +
      '<p class="msg erreur" id="msg-ajout" role="alert"></p><button type="submit" class="btn plein large">' + ICO.ok + 'Enregistrer le rendez-vous</button></form>');
  }
  function lireAjout(f) {
    choixAjout.nom = f.elements.nom.value; choixAjout.telephone = f.elements.telephone.value; choixAjout.note = f.elements.note.value;
    choixAjout.service = +f.elements.service.value;
    if (RV.dateValide(f.elements.date.value)) choixAjout.date = f.elements.date.value;
  }
  function enregistrerAjout(f) {
    lireAjout(f);
    var p = profilCourant(), s = p.services[choixAjout.service] || { nom: '', prix: 0, duree: p.pas };
    var heure = RV.minutes(f.elements.heure_libre.value) != null ? f.elements.heure_libre.value : choixAjout.heure;
    var msg = $('#msg-ajout');
    if (RV.texte(choixAjout.nom).length < 2) { msg.textContent = 'Écrivez le nom du client.'; return; }
    if (!heure) { msg.textContent = 'Choisissez une heure.'; return; }
    if (choixAjout.telephone && !RV.numeroWhatsApp(choixAjout.telephone)) { msg.textContent = 'Numéro non reconnu (ex. : 77 123 45 67).'; return; }
    if (!RV.peutAccepter(liste(), passActif())) { location.hash = '#/pass?raison=limite'; return; }
    var d = { nom: RV.texte(choixAjout.nom, 80), service: s.nom, prix: s.prix, duree: s.duree, date: choixAjout.date, heure: heure };
    if (choixAjout.telephone) d.telephone = RV.texte(choixAjout.telephone, 30);
    if (RV.texte(choixAjout.note)) d.note = RV.texte(choixAjout.note, 300);
    agir(S.page.id, 'confirmation', d);
    var date = choixAjout.date;
    choixAjout = null;
    toast('Rendez-vous ajouté.');
    location.hash = '#/agenda?j=' + date;
  }

  // ---------- Agenda : jour et semaine ----------
  function vueAgenda(params) {
    var p = profilCourant(), l = liste();
    var j = RV.dateValide(params.get('j')) ? params.get('j') : RV.aujourdhui(), mode = params.get('v') === 'semaine' ? 'semaine' : 'jour';
    cadre({ titre: 'Agenda', nav: 'agenda', vue: 'agenda' });
    var pas = mode === 'jour' ? 1 : 7;
    var h = '<div class="segments" role="tablist"><a role="tab" href="#/agenda?j=' + j + '"' + (mode === 'jour' ? ' aria-selected="true" class="actif"' : '') + '>Jour</a>' +
      '<a role="tab" href="#/agenda?v=semaine&j=' + j + '"' + (mode === 'semaine' ? ' aria-selected="true" class="actif"' : '') + '>Semaine</a></div>' +
      '<div class="nav-date"><a class="icone-btn" href="#/agenda?' + (mode === 'semaine' ? 'v=semaine&' : '') + 'j=' + RV.ajouterJours(j, -pas) + '" aria-label="Précédent">' + ICO.gauche + '</a>' +
      '<p>' + (mode === 'jour' ? esc(majuscule(RV.dateFr(j))) : 'Semaine du ' + esc(RV.dateFr(RV.lundi(j), { sansJour: true }))) + '</p>' +
      '<a class="icone-btn" href="#/agenda?' + (mode === 'semaine' ? 'v=semaine&' : '') + 'j=' + RV.ajouterJours(j, pas) + '" aria-label="Suivant">' + ICO.droite + '</a></div>';
    if (j !== RV.aujourdhui()) h += '<p class="centre"><a class="btn petit sec" href="#/agenda?' + (mode === 'semaine' ? 'v=semaine&' : '') + 'j=' + RV.aujourdhui() + '">Revenir à aujourd\'hui</a></p>';
    if (mode === 'jour') {
      var lignes = RV.journee(p, l, j);
      if (RV.ferme(p, j)) h += '<p class="vide">Fermé ce jour-là' + (p.conges.indexOf(j) > -1 ? ' (jour fermé)' : '') + '.</p>';
      h += lignes.map(function (x) {
        if (x.libre) return '<a class="libre" href="#/ajouter?j=' + j + '&h=' + x.debut + '"><span>' + esc(RV.heureFr(x.debut)) + ' – ' + esc(RV.heureFr(x.fin)) + '</span><span>Libre · ajouter</span></a>';
        return x.rdv.statut === 'en_attente' ? carteDemande(x.rdv) : carteRdv(x.rdv, x.rdv.date <= RV.aujourdhui() ? 'jour' : (x.rdv.date === RV.ajouterJours(RV.aujourdhui(), 1) ? 'demain' : ''));
      }).join('') || (RV.ferme(p, j) ? '' : '<p class="vide">Aucun rendez-vous.</p>');
      h += '<a class="btn sec large" href="#/ajouter?j=' + j + '">' + ICO.ajouter + 'Ajouter un rendez-vous ce jour</a>';
    } else {
      var sem = RV.semaine(l, j, S.presences);
      h += '<div class="kpis"><div class="kpi"><span class="valeur">' + sem.total + '</span><span class="lib">rendez-vous</span></div><div class="kpi"><span class="valeur">' + RV.fcfa(sem.prevu) + '</span><span class="lib">prévus</span></div>' +
        '<div class="kpi"><span class="valeur">' + sem.absents + '</span><span class="lib">absent' + (sem.absents > 1 ? 's' : '') + '</span></div></div>';
      h += sem.jours.map(function (jj) {
        var ferme = RV.ferme(p, jj.date), total = jj.rdv.reduce(function (s, r) { return s + r.prix; }, 0);
        return '<a class="carte jour-sem' + (jj.date === RV.aujourdhui() ? ' aujourdhui' : '') + '" href="#/agenda?j=' + jj.date + '"><div class="ligne-entre"><b>' + esc(majuscule(RV.dateFr(jj.date))) + '</b><span>' +
          (ferme && !jj.rdv.length ? 'Fermé' : !jj.rdv.length ? 'Aucun' : jj.rdv.length + ' rdv' + (total ? ' · ' + esc(RV.fcfa(total)) : '')) + '</span></div>' +
          (jj.rdv.length ? '<p class="chips">' + jj.rdv.map(function (r) { return '<span class="chip' + (S.presences[r.ref] === 'absent' ? ' barre' : '') + '">' + esc(RV.heureFr(r.heure)) + ' ' + esc(r.nom.split(' ')[0]) + '</span>'; }).join('') + '</p>' : '') +
          (jj.attente ? '<p class="petit attente-txt">' + jj.attente + ' demande' + (jj.attente > 1 ? 's' : '') + ' en attente</p>' : '') + '</a>';
      }).join('');
      h += '<button type="button" class="btn plein large" data-action="pdf-semaine" data-j="' + j + '">' + ICO.imprimer + 'PDF de la semaine</button>';
    }
    vue(h);
  }
  function pdfSemaine(j) {
    try {
      var sem = RV.semaine(liste(), j, S.presences);
      var blob = window.RV_PDF.semaine(sem, profilCourant(), S.presences);
      telecharger(blob, 'rendez-vous-semaine-' + sem.lundi + '.pdf');
      toast('PDF enregistré dans vos téléchargements.');
    } catch (e) { toast(e.message || 'PDF impossible.'); }
  }

  // ---------- Ma page : lien, QR code, partage ----------
  function vuePage(params) {
    var p = profilCourant(), lien = lienPublic(), rem = RV.remplissage(S.dossiers[S.page.id]);
    cadre({ titre: 'Ma page', nav: 'page', vue: 'page' });
    var h = '';
    if (params.get('nouvelle')) h += '<section class="carte succes"><h1>' + ICO.ok + ' Votre page est prête !</h1><p>Partagez le lien sur WhatsApp (statut, groupes) et affichez le QR code dans votre local. Les demandes arriveront dans « Aujourd\'hui ».</p></section>';
    if (!lien) h += '<section class="carte alerte"><p>' + ICO.attention + ' Le lien public de cette page est inconnu sur ce téléphone. Ouvrez votre lien secret complet (avec « &c= ») ou restaurez votre sauvegarde.</p></section>';
    else {
      h += '<section class="carte qr-carte"><h2>Le lien de votre page</h2><div class="qr" id="qr">' + qrSVG(lien) + '</div>' +
        '<label class="vh" for="lien-public">Lien public</label><input id="lien-public" class="lien" readonly value="' + esc(lien) + '">' +
        '<div class="pile">' + boutonWA('', RV.messagePage(p, lien), 'Partager sur WhatsApp') +
        '<div class="rang-btn"><button type="button" class="btn sec" data-action="copier-lien">' + ICO.copier + 'Copier le lien</button>' +
        (navigator.share ? '<button type="button" class="btn sec" data-action="partager">' + ICO.partager + 'Partager…</button>' : '') + '</div>' +
        '<div class="rang-btn"><button type="button" class="btn sec" data-action="affiche">' + ICO.imprimer + 'Affiche (PDF)</button><button type="button" class="btn sec" data-action="qr-png">' + ICO.telecharger + 'Image du QR</button></div>' +
        '<a class="btn sec large" href="' + esc('#d=' + S.page.id + '&t=' + S.page.jetonClient) + '">' + ICO.oeil + 'Voir ma page comme un client</a></div></section>';
    }
    h += '<section class="carte"><div class="ligne-entre"><h2>' + esc(p.nom) + '</h2><a class="btn petit sec" href="#/profil">' + ICO.modifier + 'Modifier</a></div>' +
      (p.lieu ? '<p>' + ICO.lieu + ' ' + esc(p.lieu) + '</p>' : '') +
      '<h3>Services</h3><ul class="liste-services">' + p.services.map(function (s) { return '<li><span>' + esc(s.nom) + ' <small>' + esc(dureeFr(s.duree)) + '</small></span><b>' + (s.prix ? esc(RV.fcfa(s.prix)) : 'Sur devis') + '</b></li>'; }).join('') + '</ul>' +
      '<h3>Horaires</h3>' + tableHoraires(p) + '</section>';
    h += '<section class="carte"><h2>Historique de la page</h2><p>' + rem.n + ' / ' + RV.milliers(rem.max) + ' actions gardées par le serveur (demandes et réponses).</p>' +
      (rem.presquePlein ? '<p class="alerte-texte">' + ICO.attention + 'Votre page sera bientôt pleine. Créez une nouvelle page : vos clients qui ouvrent l\'ancien lien seront envoyés vers la nouvelle.</p><button type="button" class="btn plein" data-action="nouvelle-page">Créer une nouvelle page</button>' : '') + '</section>';
    vue(h);
  }
  function tableHoraires(p) {
    return '<table class="horaires"><tbody>' + RV.JOURS.map(function (j) {
      return '<tr><th scope="row">' + esc(majuscule(j.nom)) + '</th><td>' + esc(RV.horairesFr(p.horaires[j.cle])) + '</td></tr>';
    }).join('') + '</tbody></table>' + (p.conges.filter(function (d) { return d >= RV.aujourdhui(); }).length ? '<p class="petit">Fermé aussi : ' + p.conges.filter(function (d) { return d >= RV.aujourdhui(); }).map(function (d) { return esc(RV.dateFr(d)); }).join(', ') + '.</p>' : '');
  }
  function qrPNG() {
    var qr = window.qrcode(0, 'M'); qr.addData(lienPublic()); qr.make();
    var n = qr.getModuleCount(), c = 12, m = 4, cv = document.createElement('canvas');
    cv.width = cv.height = (n + 2 * m) * c;
    var x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (qr.isDark(r, k)) x.fillRect((k + m) * c, (r + m) * c, c, c);
    cv.toBlob(function (b) { telecharger(b, 'qr-rendez-vous.png'); toast('Image du QR code enregistrée.'); }, 'image/png');
  }
  function nouvellePage() {
    if (!confirm('Créer une nouvelle page ? Vos clients seront envoyés vers elle. Pensez à imprimer le nouveau QR code.')) return;
    var p = profilCourant(), ancienne = S.page;
    var d = RV.donneesProfil(Object.assign({}, p, { suite: '' }));
    api('/creer', { app: 'rdv', titre: p.nom, donnees: d, pass: passServeur() }).then(function (r) {
      if (r.status !== 201) { toast(r.json.message || 'Création impossible pour le moment.'); return; }
      var lien = RV.lienPage(r.json.id, r.json.jetons.client), now = new Date().toISOString();
      agir(ancienne.id, 'modification', { changement: 'nouvelle_page' }, RV.donneesProfil(Object.assign({}, p, { suite: lien })));
      S.anciennes.push(Object.assign({}, ancienne, { finSuivi: new Date(Date.now() + 90 * JOUR_MS).toISOString() }));
      S.page = { id: r.json.id, jetonPro: r.json.jetons.proprio, jetonClient: r.json.jetons.client, creeLe: now, titre: p.nom, donnees: d };
      S.dossiers[S.page.id] = { id: S.page.id, app: 'rdv', titre: p.nom, donnees: d, statut: 'ouvert', role: 'proprio', evenements: [{ id: 1, auteur: 'proprio', type: 'creation', donnees: d, le: now, empreinte: r.json.empreinte }] };
      cacheListe = null;
      Promise.all([sauver('page'), sauver('anciennes'), sauver('dossiers')]).then(function () { location.hash = '#/page?nouvelle=1'; });
    }, function () { toast('Pas de connexion Internet.'); });
  }

  // ---------- Pass ----------
  function vuePass(params) {
    var e = RV.etatPass(S.passes), n = RV.rdvDuMois(liste()), pre = params.get('code') || '';
    cadre({ titre: 'Pass', retour: S.page ? '#/plus' : '#/', nav: 'plus', vue: 'pass' });
    var h = '';
    if (params.get('raison') === 'limite' && !e.actif) h += '<section class="carte alerte"><p>' + ICO.attention + ' Vous avez accepté <b>' + RV.LIMITE_GRATUITE + ' rendez-vous</b> ce mois-ci : c\'est la limite gratuite. Activez un pass pour continuer. Vos demandes restent en attente, rien n\'est perdu.</p></section>';
    if (e.actif) h += '<section class="carte succes"><h1>' + ICO.etoile + ' Pass actif</h1><p>Rendez-vous illimités jusqu\'au <b>' + esc(RV.dateFr(RV.aujourdhui(e.fin), { annee: true })) + '</b> (' + e.joursRestants + ' jour' + (e.joursRestants > 1 ? 's' : '') + ').</p>' +
      (e.rappel ? '<p class="alerte-texte">Pensez à le renouveler : les jours s\'ajoutent, vous ne perdez rien.</p>' : '') + '</section>';
    else h += '<section class="carte"><h1>Version gratuite</h1><p><b>' + Math.min(n, RV.LIMITE_GRATUITE) + ' / ' + RV.LIMITE_GRATUITE + '</b> rendez-vous acceptés en ' + esc(RV.moisFr(Date.now())) + '.' + (e.expire ? ' Votre pass est terminé.' : '') + '</p></section>';
    h += '<div class="offres">' + Object.keys(RV.PASS).map(function (slug) {
      var x = RV.PASS[slug];
      return '<section class="carte offre"><h2>' + esc(x.nom) + '</h2><p class="prix">' + esc(RV.fcfa(x.prix)) + '</p><p class="petit">' + (x.jours > 40 ? 'soit ' + RV.fcfa(Math.round(x.prix / 12)) + ' par mois' : 'sans engagement') + '</p>' +
        '<a class="btn plein" href="' + esc(RV.urlAchat(slug)) + '" target="_blank" rel="noopener">Acheter (Wave)</a></section>';
    }).join('') + '</div>' +
      '<ul class="atouts">' + ['Rendez-vous illimités', 'Toutes les fonctions restent les mêmes', 'Vos données ne sont jamais bloquées'].map(function (x) { return '<li>' + ICO.ok + esc(x) + '</li>'; }).join('') + '</ul>';
    h += '<form class="carte" data-form="pass"><h2 id="pass-act">' + (e.actif ? 'Ajouter un pass (les jours s\'ajoutent)' : 'Activer mon pass') + '</h2><ol class="etapes"><li>Achetez le pass dans la boutique et payez par Wave.</li><li>Sur la page de votre commande payée, copiez le lien de la page.</li><li>Collez-le ici puis touchez « Activer ».</li></ol>' +
      '<div class="champ"><label for="c-lien">Lien de votre commande</label><textarea id="c-lien" name="lien" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…/boutique/commande.html?o=TCV-…&amp;t=…">' + esc(pre) + '</textarea></div>' +
      '<p class="msg" id="msg-pass" role="status" aria-live="polite"></p><button type="submit" class="btn plein large" id="btn-pass">' + ICO.etoile + 'Activer</button>' +
      '<p class="petit">Internet est nécessaire une seule fois pour la vérification. Rendez-vous Pro n\'encaisse et ne garde jamais d\'argent.</p></form>';
    vue(h);
    if (pre) activerPass(pre);
  }
  function activerPass(texte) {
    var msg = $('#msg-pass'), btn = $('#btn-pass');
    var dire = function (m, err) { msg.textContent = m; msg.classList.toggle('erreur', !!err); };
    var c = RV.lireLienCommande(texte);
    if (!c) return dire('Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « TCV- »).', true);
    dire('Vérification de votre commande…');
    btn.disabled = true;
    fetch(RV.urlVerification(c), { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (r.status === 404) throw { m: 'Commande introuvable. Vérifiez que vous avez copié le lien complet.' };
      if (!r.ok) throw { m: 'Le service de vérification ne répond pas. Réessayez dans un instant.' };
      return r.json();
    }).then(function (j) {
      var v = RV.analyserReponse(j);
      if (!v.ok) {
        if (v.raison === 'impayee') throw { m: 'Le paiement de cette commande n\'est pas encore confirmé. Terminez le paiement Wave, attendez la confirmation, puis réessayez.' };
        if (v.raison === 'produit') throw { m: 'Ce lien correspond à un autre achat' + (v.titre ? ' (« ' + v.titre + ' »)' : '') + '. Il faut le lien d\'un pass Rendez-vous Pro.' };
        if (v.raison === 'expiree') throw { m: 'Ce pass est terminé depuis le ' + RV.dateFr(RV.aujourdhui(v.fin), { annee: true }) + '. Achetez un nouveau pass pour continuer.' };
        throw { m: 'Commande introuvable.' };
      }
      S.passes = RV.ajouterPass(S.passes, v.pass, c.jeton);
      return sauver('passes').then(function () {
        DB.persister();
        btn.disabled = false;
        vuePass(new URLSearchParams());
        toast('Pass activé. Merci !');
        var m = $('#msg-pass'); if (m) m.innerHTML = '<span id="pass-ok">Pass activé jusqu\'au ' + esc(RV.dateFr(RV.aujourdhui(RV.etatPass(S.passes).fin), { annee: true })) + '.</span>';
      });
    }).catch(function (e) { btn.disabled = false; dire(e && e.m ? e.m : 'Pas de connexion au service. Vérifiez Internet et réessayez.', true); });
  }

  // ---------- Plus : installation, thème, sauvegarde, lien secret, aide ----------
  function vuePlus() {
    cadre({ titre: 'Plus', nav: 'plus', vue: 'plus' });
    var e = RV.etatPass(S.passes), t = S.reglages.theme || 'auto';
    vue('<a class="carte lien-menu" href="#/pass">' + ICO.etoile + '<span><b>' + (e.actif ? 'Pass actif' : 'Version gratuite') + '</b><small>' + (e.actif ? 'Jusqu\'au ' + esc(RV.dateFr(RV.aujourdhui(e.fin), { annee: true })) : RV.LIMITE_GRATUITE + ' rendez-vous par mois — passer au pass') + '</small></span></a>' +
      '<a class="carte lien-menu" href="#/sauvegarde">' + ICO.sauvegarde + '<span><b>Sauvegarde</b><small>Garder une copie, changer de téléphone</small></span></a>' +
      '<section class="carte"><h2>Lien secret du professionnel</h2><p>Il permet de retrouver votre page sur un autre téléphone. <b>Ne le donnez à personne</b> : il permet de répondre aux demandes à votre place.</p>' +
      '<button type="button" class="btn sec" data-action="copier-secret">' + ICO.copier + 'Copier mon lien secret</button></section>' +
      '<section class="carte"><h2>Installer l\'application</h2>' + (estInstallee() ? '<p>' + ICO.ok + ' Installée sur ce téléphone.</p>' : invite ? '<button type="button" class="btn plein" data-action="installer">' + ICO.installer + 'Installer</button>' : instructionsInstall()) + '</section>' +
      '<section class="carte"><h2>Affichage</h2><div class="segments" role="radiogroup" aria-label="Thème">' + [['auto', 'Auto'], ['clair', 'Clair'], ['sombre', 'Sombre']].map(function (x) {
        return '<button type="button" role="radio" aria-checked="' + (t === x[0]) + '" class="' + (t === x[0] ? 'actif' : '') + '" data-action="theme" data-theme="' + x[0] + '">' + x[1] + '</button>';
      }).join('') + '</div></section>' +
      '<section class="carte"><h2>Comment ça marche</h2><ol class="etapes"><li>Votre client ouvre votre lien ou scanne le QR code, choisit un service et une heure libre.</li><li>La demande arrive dans « Aujourd\'hui ». Vous confirmez, refusez ou proposez une autre heure.</li><li>WhatsApp s\'ouvre avec le message prêt : c\'est vous qui l\'envoyez.</li><li>La veille, envoyez un rappel ; le jour même, notez qui est venu.</li></ol>' +
      '<p class="petit">Pour coiffeurs, salons, tailleurs, mécaniciens, photographes, répétiteurs, consultants… Pas pour les cabinets médicaux : ne demandez et n\'écrivez aucune information de santé.</p></section>' +
      '<section class="carte"><h2>Vos données</h2><p class="petit">Votre agenda, les présences et votre pass restent sur ce téléphone. Le serveur garde seulement votre page et l\'historique des demandes (nom et, si le client le choisit, son numéro), effacés 180 jours après la dernière activité. Vos clients ne voient jamais les noms ni les numéros des autres.</p></section>' +
      '<p class="petit centre"><a href="../">Toutes nos applications</a> · <a href="../../boutique/">Boutique Teranga Outils</a></p>');
  }
  function vueSauvegarde() {
    cadre({ titre: 'Sauvegarde', retour: S.page ? '#/plus' : '#/', nav: 'plus', vue: 'sauvegarde' });
    vue('<section class="carte"><h2>Sauvegarder</h2><p>Un fichier avec votre page, vos liens, vos rendez-vous et votre pass. Envoyez-le-vous sur WhatsApp ou gardez-le sur Google Drive.</p>' +
      '<p class="petit">' + (S.sauvegarde ? 'Dernière sauvegarde : ' + esc(RV.dateFr(RV.aujourdhui(S.sauvegarde), { annee: true })) : 'Aucune sauvegarde pour l\'instant.') + '</p>' +
      (S.page ? '<button type="button" class="btn plein large" data-action="exporter">' + ICO.telecharger + 'Télécharger la sauvegarde</button>' : '<p>Rien à sauvegarder pour l\'instant.</p>') + '</section>' +
      '<section class="carte"><h2>Restaurer</h2><p>Remplace les données de ce téléphone par celles du fichier.</p><label class="btn sec large" for="f-import">' + ICO.sauvegarde + 'Choisir le fichier</label><input type="file" id="f-import" class="vh" accept=".json,application/json"></section>' +
      (S.page ? '<section class="carte"><h2>Effacer ce téléphone</h2><p class="petit">Retire la page et l\'agenda de ce téléphone (la page reste sur le serveur : gardez votre lien secret ou une sauvegarde pour la retrouver).</p><button type="button" class="btn danger" data-action="tout-effacer">' + ICO.poubelle + 'Tout effacer</button></section>' : ''));
  }
  var CLES_SAUVEGARDE = ['page', 'anciennes', 'dossiers', 'attente', 'presences', 'passes', 'reglages'];
  function exporter() {
    var data = { application: 'rendez-vous-pro', format: 1, exporte: new Date().toISOString() };
    CLES_SAUVEGARDE.forEach(function (k) { data[k] = S[k]; });
    telecharger(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'rendez-vous-pro-sauvegarde-' + RV.aujourdhui() + '.json');
    S.sauvegarde = new Date().toISOString();
    DB.mettre('sauvegarde', S.sauvegarde).then(function () { toast('Sauvegarde téléchargée.'); if (vueCourante === 'sauvegarde') vueSauvegarde(); });
  }
  function importer(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var data;
      try { data = JSON.parse(lecteur.result); } catch (e) { toast('Fichier illisible.'); return; }
      if (!data || data.application !== 'rendez-vous-pro' || !data.page || !data.page.id) { toast('Ce fichier n\'est pas une sauvegarde de Rendez-vous Pro.'); return; }
      if (S.page && !confirm('Remplacer les données de ce téléphone par cette sauvegarde ?')) return;
      CLES_SAUVEGARDE.forEach(function (k) { if (data[k] !== undefined) S[k] = data[k]; });
      S.anciennes = S.anciennes || []; S.attente = S.attente || []; S.presences = S.presences || {}; S.passes = S.passes || []; S.dossiers = S.dossiers || {};
      cacheListe = null;
      Promise.all(CLES_SAUVEGARDE.map(sauver)).then(function () { toast('Sauvegarde restaurée.'); location.hash = '#/'; router(); synchroniser(); });
    };
    lecteur.readAsText(fichier);
  }
  function toutEffacer() {
    if (!confirm('Effacer la page, l\'agenda et le pass de ce téléphone ?')) return;
    DB.toutEffacer().then(function () { location.hash = '#/'; location.reload(); });
  }

  // ---------- Importer une page (lien secret) ----------
  function vueImporter() {
    cadre({ titre: 'Retrouver ma page', retour: '#/', vue: 'importer' });
    vue('<form class="carte" data-form="importer"><h2>Collez votre lien secret</h2><p>C\'est le lien « professionnel » copié depuis « Plus » sur votre ancien téléphone.</p>' +
      champ('Lien secret', 'lien', '', { zone: true, lignes: 3 }) + '<p class="msg erreur" id="msg-import" role="alert"></p><button class="btn plein large" type="submit">Ouvrir</button></form>');
  }
  function ouvrirLienPro(lien, jetonClient, dossier) {
    cadre({ titre: 'Votre page', retour: '#/', vue: 'import-confirmer' });
    var p = RV.profil(dossier.donnees, dossier.titre);
    vue('<section class="carte"><h1>' + esc(p.nom) + '</h1><p>Ce lien est le <b>lien secret du professionnel</b> de cette page.</p>' +
      (S.page && S.page.id !== lien.id ? '<p class="alerte-texte">' + ICO.attention + 'Ce téléphone gère déjà une autre page (« ' + esc(profilCourant().nom) + ' »). Elle sera remplacée sur ce téléphone.</p>' : '') +
      (jetonClient ? '' : '<p class="petit">Le lien public n\'est pas dans ce lien : le QR code ne pourra pas être affiché. Utilisez le lien secret complet (copié depuis « Plus »).</p>') +
      '<button type="button" class="btn plein large" data-action="importer-page">Utiliser cette page sur ce téléphone</button><a class="btn sec large" href="#/">Annuler</a></section>');
    ACTIONS['importer-page'] = function () {
      S.page = { id: lien.id, jetonPro: lien.t, jetonClient: jetonClient || '', creeLe: dossier.cree_le || new Date().toISOString(), titre: dossier.titre, donnees: dossier.donnees };
      S.dossiers[lien.id] = dossier; cacheListe = null;
      Promise.all([sauver('page'), sauver('dossiers')]).then(function () { toast('Page retrouvée.'); location.replace('#/'); });
    };
  }

  // ---------- Page publique (mode client) ----------
  function ouvrirLien(lien, hash) {
    var mc = hash.match(/[&]c=([A-Za-z0-9_-]{20,64})/);
    if (C && C.id === lien.id && C.t === lien.t && C.dossier) { rendreClient(); return; }
    // Le professionnel ouvre son propre lien secret : pas besoin du serveur
    if (S.page && S.page.id === lien.id && S.page.jetonPro === lien.t) { C = null; location.replace('#/'); return; }
    C = { id: lien.id, t: lien.t, dossier: null, etape: 'accueil', choix: {}, stock: {}, horsLigne: false };
    cadre({ titre: 'Rendez-vous', client: true, vue: 'client' });
    vue('<p class="chargement">Ouverture de la page…</p>');
    DB.lire('client:' + lien.id).then(function (st) {
      C.stock = st && st.t === lien.t ? st : { t: lien.t, mes: [] };
      return api('/' + lien.id + '?t=' + encodeURIComponent(lien.t));
    }).then(function (r) {
      if (r.status === 200 && r.json.dossier && r.json.dossier.app === 'rdv') {
        var d = r.json.dossier;
        if (d.role === 'proprio') { var cl = mc ? mc[1] : ''; C = null; ouvrirLienPro(lien, cl, d); return; }
        C.dossier = d; C.stock.dossier = d; C.stock.lu = new Date().toISOString();
        DB.mettre('client:' + C.id, C.stock);
        var suite = RV.lireLien(d.donnees && d.donnees.suite);
        if (suite && suite.id !== C.id) { location.replace('#d=' + suite.id + '&t=' + suite.t); return; }
        rendreClient();
      } else if (r.status === 404 || (r.json.dossier && r.json.dossier.app !== 'rdv')) {
        C = null; cadre({ titre: 'Rendez-vous', client: true, vue: 'client' });
        vue('<section class="carte"><h1>Page introuvable</h1><p>Ce lien de rendez-vous n\'existe pas ou n\'est plus actif. Demandez le bon lien au professionnel.</p></section>');
      } else throw new Error('serveur');
    }).catch(function () {
      if (C && C.stock && C.stock.dossier) { C.dossier = C.stock.dossier; C.horsLigne = true; rendreClient(); return; }
      cadre({ titre: 'Rendez-vous', client: true, vue: 'client' });
      vue('<section class="carte"><h1>Pas de connexion</h1><p>Connectez-vous à Internet pour voir les heures libres et demander un rendez-vous.</p><button type="button" class="btn plein" data-action="client-recharger">Réessayer</button></section>');
    });
  }
  function rechargerClient() {
    if (!C) return Promise.resolve();
    return api('/' + C.id + '?t=' + encodeURIComponent(C.t)).then(function (r) {
      if (r.status === 200 && r.json.dossier) { C.dossier = r.json.dossier; C.stock.dossier = C.dossier; C.horsLigne = false; DB.mettre('client:' + C.id, C.stock); }
    }, function () { C.horsLigne = true; }).then(function () { if (C) rendreClient(); });
  }
  function profilClient() { return RV.profil(C.dossier.donnees, C.dossier.titre); }
  function listeClient() { var p = profilClient(); return RV.reservations(C.dossier.evenements, p.pas); }
  function rendreClient() {
    var p = profilClient(), l = listeClient(), e = C.etape, ch = C.choix;
    var apercu = S.page && S.page.id === C.id;
    cadre({ titre: p.nom, client: true, vue: 'client', retour: e === 'accueil' ? '' : '#client-retour', titreDoc: 'Prendre rendez-vous — ' + p.nom });
    var h = '';
    if (apercu) h += '<p class="bandeau-apercu">' + ICO.oeil + 'Aperçu : voici ce que voient vos clients. <a href="#/page">Retour</a></p>';
    if (C.horsLigne) h += '<p class="bandeau-apercu hors">' + ICO.attention + 'Hors ligne : informations peut-être anciennes.</p>';
    var tel = RV.numeroWhatsApp(p.telephone);
    if (e === 'accueil') {
      h += '<section class="carte entete-pro"><h1>' + esc(p.nom) + '</h1><p class="metier">' + esc(RV.METIER[p.metier].nom) + '</p>' + (p.presentation ? '<p>' + esc(p.presentation) + '</p>' : '') +
        (p.lieu ? '<p class="lieu">' + ICO.lieu + esc(p.lieu) + '</p>' : '') + (tel ? '<a class="btn sec" target="_blank" rel="noopener" href="' + esc(RV.lienWhatsApp(tel, 'Bonjour ' + p.nom + ', ')) + '">' + ICO.wa + 'Écrire sur WhatsApp</a>' : '') + '</section>';
      h += mesRendezVous(p, l);
      h += '<h2>Prendre rendez-vous</h2><p class="petit">Choisissez un service :</p><div class="pile">' + p.services.map(function (s, i) {
        return '<button type="button" class="service-choix" data-action="client-service" data-i="' + i + '"><span><b>' + esc(s.nom) + '</b><small>' + esc(dureeFr(s.duree)) + '</small></span><span class="prix">' + (s.prix ? esc(RV.fcfa(s.prix)) : 'Sur devis') + '</span></button>';
      }).join('') + '</div>';
      h += '<section class="carte"><h2>Horaires</h2>' + tableHoraires(p) + '</section>';
      h += '<p class="petit centre pied-client">Page de rendez-vous créée avec <a href="./#/">Rendez-vous Pro</a>. Vous êtes professionnel ? Créez la vôtre gratuitement.</p>';
    } else if (e === 'jour') {
      var s = p.services[ch.service];
      h += recapClient(p, s) + '<h2>Quel jour ?</h2>' + grilleJours(p, l, s.duree, ch.date, 'client-jour');
    } else if (e === 'heure') {
      var s2 = p.services[ch.service];
      h += recapClient(p, s2, ch.date) + '<h2>À quelle heure ?</h2>' + grilleHeures(RV.creneauxLibres(p, l, ch.date, s2.duree), 'client-heure');
    } else if (e === 'infos') {
      var s3 = p.services[ch.service];
      h += recapClient(p, s3, ch.date, ch.heure) + '<form class="pile" data-form="demande" novalidate><section class="carte">' +
        champ('Votre nom', 'nom', ch.nom || C.stock.nom || '', { requis: true, max: 80, auto: 'name', place: 'Ex. : Fatou Ndiaye' }) +
        champ('Votre numéro WhatsApp', 'telephone', ch.telephone != null ? ch.telephone : (C.stock.telephone || ''), { type: 'tel', mode: 'tel', auto: 'tel', max: 30, facultatif: true, place: 'Ex. : 77 123 45 67',
          aide: 'Seulement si vous voulez que ' + esc(p.nom) + ' vous réponde sur WhatsApp. Il sera enregistré avec votre demande sur notre serveur et visible par ce professionnel seulement. Laissez vide si vous préférez : la réponse s\'affichera sur cette page.' }) +
        champ('Message', 'note', ch.note || '', { zone: true, lignes: 2, max: 300, facultatif: true, place: 'Ex. : cheveux longs, je viens avec ma fille', aide: 'N\'écrivez aucune information de santé.' }) + '</section>' +
        '<p class="msg erreur" id="msg-demande" role="alert"></p><button type="submit" class="btn plein large" id="btn-demande">' + ICO.ok + 'Envoyer ma demande</button>' +
        '<p class="petit centre">' + esc(p.nom) + ' confirme ensuite votre rendez-vous.</p></form>';
    } else if (e === 'envoye') {
      var m = C.stock.mes[C.stock.mes.length - 1];
      h += '<section class="carte succes"><h1>' + ICO.ok + ' Demande envoyée</h1><p><b>' + esc(m.service || '') + '</b> — ' + esc(RV.quand(m)) + '</p><p>' + esc(p.nom) + ' va confirmer. Gardez cette page : la réponse s\'affichera ici' + (m.telephone ? ' et sur WhatsApp' : '') + '.</p></section>' +
        (tel ? '<p>Pour aller plus vite, prévenez ' + esc(p.nom) + ' :</p>' + boutonWA(tel, RV.messageClient(p, m), 'Prévenir sur WhatsApp') : '') +
        '<button type="button" class="btn sec large" data-action="client-accueil">Voir mes rendez-vous</button>';
    }
    vue(h);
  }
  function recapClient(p, s, date, heure) {
    return '<section class="carte recap"><p><b>' + esc(s.nom) + '</b> · ' + (s.prix ? esc(RV.fcfa(s.prix)) : 'sur devis') + ' · ' + esc(dureeFr(s.duree)) + '</p>' +
      (date ? '<p>' + ICO.agenda + esc(majuscule(RV.dateFr(date))) + (heure ? ' à <b>' + esc(RV.heureFr(heure)) + '</b>' : '') + '</p>' : '') + '</section>';
  }
  var MSG_CLIENT = { en_attente: 'Le professionnel va répondre.', confirme: 'Le professionnel vous attend.', reporte: '', refuse: 'Choisissez un autre moment.', annule: '' };
  function mesRendezVous(p, l) {
    var mes = (C.stock.mes || []).filter(function (m) { return m.date >= RV.ajouterJours(RV.aujourdhui(), -1); });
    if (!mes.length) return '';
    return '<section class="carte mes"><div class="ligne-entre"><h2>Mes rendez-vous ici</h2><button type="button" class="btn petit sec" data-action="client-recharger">' + ICO.actualiser + 'Actualiser</button></div>' + mes.map(function (m) {
      var r = l.filter(function (x) { return x.ref === m.ref; })[0], st = r ? r.statut : 'en_attente', q = r ? r : m;
      return '<div class="mes-ligne" data-ref="' + esc(m.ref) + '"><p><b>' + esc(m.service || 'Rendez-vous') + '</b> — ' + esc(RV.quand(q)) + '</p><p>' + puce(st) + ' <span class="petit">' + esc(MSG_CLIENT[st]) + (st === 'reporte' && r && r.avant ? 'Au lieu de ' + esc(RV.quand(r.avant)) + '.' : '') + '</span></p>' +
        (RV.actif({ statut: st }) && q.date >= RV.aujourdhui() ? '<button type="button" class="btn petit danger-doux" data-action="client-annuler" data-ref="' + esc(m.ref) + '">Annuler ce rendez-vous</button>' : '') + '</div>';
    }).join('') + '</section>';
  }
  function envoyerDemande(f) {
    var p = profilClient(), s = p.services[C.choix.service], msg = $('#msg-demande'), btn = $('#btn-demande');
    var nom = RV.texte(f.elements.nom.value, 80), tel = RV.texte(f.elements.telephone.value, 30), note = RV.texte(f.elements.note.value, 300);
    C.choix.nom = nom; C.choix.telephone = tel; C.choix.note = note;
    if (nom.length < 2) { msg.textContent = 'Écrivez votre nom.'; f.elements.nom.focus(); return; }
    if (tel && !RV.numeroWhatsApp(tel)) { msg.textContent = 'Numéro non reconnu (ex. : 77 123 45 67) ou laissez vide.'; f.elements.telephone.focus(); return; }
    var code = RV.codeDemande();
    var d = { nom: nom, service: s.nom, prix: s.prix, duree: s.duree, date: C.choix.date, heure: C.choix.heure };
    if (tel) d.telephone = tel;
    if (note) d.note = note;
    btn.disabled = true; msg.textContent = '';
    api('/' + C.id + '/evenement', { t: C.t, type: 'demande', code: code, donnees: d }).then(function (r) {
      if (r.status !== 201) {
        btn.disabled = false;
        msg.textContent = r.status === 429 ? 'Trop de demandes envoyées aujourd\'hui depuis ce téléphone. Écrivez directement au professionnel.' :
          r.status === 409 ? 'Cette page est complète : demandez le nouveau lien au professionnel.' : (r.json.message || 'Demande refusée.');
        return;
      }
      C.stock.mes = (C.stock.mes || []).concat([{ ref: r.json.empreinte, code: code, service: s.nom, prix: s.prix, date: d.date, heure: d.heure, nom: nom, telephone: tel, envoyeLe: new Date().toISOString() }]);
      C.stock.nom = nom; C.stock.telephone = tel;
      C.choix = {}; C.etape = 'envoye';
      return DB.mettre('client:' + C.id, C.stock).then(function () { return rechargerClient(); });
    }, function () { btn.disabled = false; msg.textContent = 'Pas de connexion Internet. Vérifiez puis réessayez.'; });
  }
  function annulerClient(ref) {
    var m = (C.stock.mes || []).filter(function (x) { return x.ref === ref; })[0];
    if (!m || !confirm('Annuler votre rendez-vous du ' + RV.quand(m) + ' ?')) return;
    api('/' + C.id + '/evenement', { t: C.t, type: 'annulation', code: m.code, donnees: { demande: ref } }).then(function (r) {
      if (r.status === 201) { toast('Rendez-vous annulé.'); return rechargerClient(); }
      toast(r.json.message || 'Annulation impossible.');
    }, function () { toast('Pas de connexion Internet.'); });
  }

  // ---------- Actions ----------
  var ACTIONS = {
    'fermer-feuille': fermerFeuille,
    installer: installer,
    actualiser: function () { synchroniser(); },
    confirmer: function (el) { fermerFeuille(); confirmer(el.getAttribute('data-ref')); },
    refuser: function (el) { refuser(el.getAttribute('data-ref')); },
    'annuler-rdv': function (el) { annulerRdv(el.getAttribute('data-ref')); },
    rappel: function (el) {
      var r = trouver(el.getAttribute('data-ref'));
      if (r && !r.local) agir(r.page || S.page.id, 'rappel', { demande: r.ref });
      setTimeout(rafraichirSousFeuille, 400);
      return true; // le lien WhatsApp s'ouvre normalement
    },
    presence: function (el) {
      var ref = el.getAttribute('data-ref'), v = el.getAttribute('data-valeur');
      if (S.presences[ref] === v) delete S.presences[ref]; else S.presences[ref] = v;
      sauver('presences'); rafraichirSousFeuille();
    },
    'autre-jour': function (el) { choixAutre.date = el.getAttribute('data-date'); vueAutreHeure(choixAutre.ref); },
    'autre-heure': function (el) { proposer(el.getAttribute('data-heure')); },
    'ajout-heure': function (el) { lireAjout($('form[data-form=ajouter]')); choixAjout.heure = el.getAttribute('data-heure'); vueAjouter(new URLSearchParams()); },
    'pdf-semaine': function (el) { pdfSemaine(el.getAttribute('data-j')); },
    'copier-lien': function () { copier(lienPublic()); },
    'copier-secret': function () { copier(lienSecret()); },
    partager: function () { var p = profilCourant(); navigator.share({ title: p.nom, text: RV.messagePage(p, ''), url: lienPublic() }).catch(function () {}); },
    affiche: function () { try { telecharger(window.RV_PDF.affiche(profilCourant(), lienPublic()), 'affiche-rendez-vous.pdf'); toast('Affiche enregistrée : imprimez-la ou envoyez-la à un imprimeur.'); } catch (e) { toast(e.message); } },
    'qr-png': qrPNG,
    'nouvelle-page': nouvellePage,
    theme: function (el) {
      var t = el.getAttribute('data-theme'); S.reglages.theme = t; sauver('reglages');
      try { if (t === 'auto') localStorage.removeItem('rdvpro-theme'); else localStorage.setItem('rdvpro-theme', t); } catch (e) { /* facultatif */ }
      if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
      vuePlus();
    },
    exporter: exporter,
    'tout-effacer': toutEffacer,
    'service-ajouter': function () {
      var f = $('form[data-form=profil]'); lireProfil(f); brouillon.servicesTouches = true;
      brouillon.p.services.push({ nom: '', prix: 0, duree: brouillon.p.pas || 30 }); vueProfil(f.getAttribute('data-creation') === '1');
      var l = $$('.service-ligne [name=s_nom]'); if (l.length) l[l.length - 1].focus();
    },
    'service-retirer': function (el) {
      var f = $('form[data-form=profil]'); lireProfil(f); brouillon.servicesTouches = true;
      brouillon.p.services.splice(+el.closest('.service-ligne').getAttribute('data-i'), 1); vueProfil(f.getAttribute('data-creation') === '1');
    },
    'copier-lundi': function () {
      var f = $('form[data-form=profil]'), p = lireProfil(f);
      RV.JOURS.forEach(function (j) { if (j.cle !== 'lun' && (p.horaires[j.cle].length || j.cle !== 'dim')) p.horaires[j.cle] = p.horaires.lun.slice(); });
      vueProfil(f.getAttribute('data-creation') === '1'); toast('Horaires du lundi copiés (le dimanche reste tel quel).');
    },
    'conge-ajouter': function () {
      var f = $('form[data-form=profil]'), v = $('#c-conge').value; lireProfil(f);
      if (RV.dateValide(v) && brouillon.p.conges.indexOf(v) < 0) { brouillon.p.conges.push(v); brouillon.p.conges.sort(); }
      vueProfil(f.getAttribute('data-creation') === '1');
    },
    'conge-retirer': function (el) {
      var f = $('form[data-form=profil]'); lireProfil(f);
      brouillon.p.conges = brouillon.p.conges.filter(function (d) { return d !== el.getAttribute('data-date'); }); vueProfil(f.getAttribute('data-creation') === '1');
    },
    'client-service': function (el) { C.choix = { service: +el.getAttribute('data-i') }; C.etape = 'jour'; rendreClient(); },
    'client-jour': function (el) { C.choix.date = el.getAttribute('data-date'); C.etape = 'heure'; rendreClient(); },
    'client-heure': function (el) { C.choix.heure = el.getAttribute('data-heure'); C.etape = 'infos'; rendreClient(); },
    'client-accueil': function () { C.etape = 'accueil'; rendreClient(); },
    'client-recharger': function () { if (C) rechargerClient(); else router(); },
    'client-annuler': function (el) { annulerClient(el.getAttribute('data-ref')); }
  };
  var FORMS = {
    profil: enregistrerProfil,
    ajouter: enregistrerAjout,
    pass: function (f) { activerPass(f.elements.lien.value); },
    demande: envoyerDemande,
    importer: function (f) {
      var l = RV.lireLien(f.elements.lien.value);
      if (!l) { $('#msg-import').textContent = 'Lien non reconnu.'; return; }
      var c = f.elements.lien.value.match(/[&]c=([A-Za-z0-9_-]{20,64})/);
      location.hash = '#d=' + l.id + '&t=' + l.t + (c ? '&c=' + c[1] : '');
    }
  };
  function retour() {
    if (C) {
      var ordre = ['accueil', 'jour', 'heure', 'infos'], i = ordre.indexOf(C.etape);
      C.etape = i > 0 ? ordre[i - 1] : 'accueil'; rendreClient(); return;
    }
    var cible = $('#retour').getAttribute('data-cible');
    if (cible) location.hash = cible;
  }

  // ---------- Routeur ----------
  var apresRendu = null;   // feuille à ouvrir une fois la nouvelle vue affichée
  function router(redessin) {
    afficher(redessin);
    if (apresRendu && !redessin) { var f = apresRendu; apresRendu = null; f(); }
  }
  function afficher(redessin) {
    if (!redessin) fermerFeuille();
    cacheListe = null;
    var h = location.hash || '#/';
    var lien = RV.lireLien(h);
    if (lien) { ouvrirLien(lien, h); return; }
    C = null;
    var m = h.match(/^#\/([a-z-]*)\/?([^?]*)(?:\?(.*))?$/) || [];
    var route = m[1] || '', arg = decodeURIComponent(m[2] || ''), params = new URLSearchParams(m[3] || '');
    if (!redessin) { if (route !== 'ajouter') choixAjout = null; if (route !== 'creer' && route !== 'profil') brouillon = null; }
    if (!S.page && ['', 'agenda', 'page', 'rdv', 'autre-heure', 'ajouter', 'profil', 'plus'].indexOf(route) > -1) route = 'bienvenue';
    switch (route) {
      case 'bienvenue': return vueBienvenue();
      case 'creer': return S.page ? location.replace('#/profil') : vueProfil(true);
      case 'profil': return vueProfil(false);
      case 'agenda': return vueAgenda(params);
      case 'rdv': return vueRdv(arg);
      case 'autre-heure': return vueAutreHeure(arg);
      case 'ajouter': return vueAjouter(params);
      case 'page': return vuePage(params);
      case 'pass': return vuePass(params);
      case 'plus': return vuePlus();
      case 'sauvegarde': return vueSauvegarde();
      case 'importer': return vueImporter();
      default: return vueAccueil();
    }
  }

  // ---------- Branchements ----------
  function brancher() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-action]');
      if (!el) return;
      var fn = ACTIONS[el.getAttribute('data-action')];
      if (!fn) return;
      if (el.tagName === 'A' && el.getAttribute('data-wa')) { fn(el); return; } // lien WhatsApp : on note, puis il s'ouvre
      e.preventDefault();
      fn(el);
    });
    document.addEventListener('submit', function (e) {
      var f = e.target.closest('[data-form]'); if (!f) return;
      e.preventDefault();
      var fn = FORMS[f.getAttribute('data-form')]; if (fn) fn(f);
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el.id === 'f-import' && el.files && el.files[0]) { importer(el.files[0]); return; }
      var f = el.closest && el.closest('form[data-form=profil]');
      if (f) {
        if (/^o_/.test(el.name)) { var pl = el.closest('.jour').querySelector('.plages'); pl.hidden = !el.checked; }
        if (el.name === 'metier') { lireProfil(f); vueProfil(f.getAttribute('data-creation') === '1'); }
        if (/^s_/.test(el.name)) brouillon.servicesTouches = true;
      }
      var fa = el.closest && el.closest('form[data-form=ajouter]');
      if (fa && (el.name === 'service' || el.name === 'date')) { lireAjout(fa); choixAjout.heure = ''; vueAjouter(new URLSearchParams()); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && feuilleOuverte) fermerFeuille(); });
    $('#retour').addEventListener('click', retour);
    $('#installer').addEventListener('click', installer);
    window.addEventListener('hashchange', function () { router(); });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; majInstall(); });
    window.addEventListener('appinstalled', function () { invite = null; majInstall(); toast('Application installée.'); });
    window.addEventListener('online', function () { S.horsLigne = false; if (C) rechargerClient(); else synchroniser(); });
    window.addEventListener('offline', function () { S.horsLigne = true; majEtatSync(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (C) rechargerClient();
      else if (S.page && (!S.syncLe || Date.now() - Date.parse(S.syncLe) > 60000)) synchroniser();
    });
    setInterval(function () { if (document.visibilityState === 'visible' && S.page && !C && !FORMULAIRES[vueCourante]) synchroniser(); }, 180000);
  }
  var majDemandee = false;
  function serviceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      var proposer = function () {
        var t = $('#toast'); t.innerHTML = 'Nouvelle version disponible. <button type="button" class="btn petit" id="maj-app">Mettre à jour</button>'; t.hidden = false; t.classList.add('visible');
        $('#maj-app').addEventListener('click', function () { majDemandee = true; if (reg.waiting) reg.waiting.postMessage('maj'); });
      };
      if (reg.waiting && navigator.serviceWorker.controller) proposer();
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        if (w) w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) proposer(); });
      });
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (majDemandee) { majDemandee = false; location.reload(); } });
  }
  function charger() {
    return Promise.all(['page', 'anciennes', 'dossiers', 'attente', 'presences', 'passes', 'reglages', 'syncLe', 'sauvegarde'].map(function (k) {
      return DB.lire(k).then(function (v) { if (v != null) S[k] = v; });
    }));
  }
  function demarrer() {
    brancher();
    var q = new URLSearchParams(location.search);
    if (q.get('o') && q.get('t')) history.replaceState(null, '', location.pathname + '#/pass?code=' + encodeURIComponent('?o=' + q.get('o') + '&t=' + q.get('t')));
    charger().then(function () {
      router();
      if (S.page && !RV.lireLien(location.hash)) synchroniser();
    }).catch(function (e) {
      vue('<section class="carte"><h1>Stockage indisponible</h1><p>' + esc(e && e.message || e) + '</p><p>Sur iPhone, quittez la navigation privée. Sinon, mettez à jour votre navigateur.</p></section>');
    });
    serviceWorker();
  }
  demarrer();
})();
