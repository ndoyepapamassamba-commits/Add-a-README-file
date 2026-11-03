/* Lecture Facile — interface. Tout reste sur le téléphone ; seule l'activation du pass contacte la boutique. */
(function () {
  'use strict';
  var VERSION = '1.0.0';
  var PRIX = '1 500 F';
  var MOIS_MS = 30 * 86400000;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function svg(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + p + '</svg>'; }
  // Espaces insécables de la typographie française (avant ! ? : ; », après «)
  function typo(h) { return h.replace(/ ([!?:;»])/g, '\u00a0$1').replace(/« /g, '«\u00a0'); }
  var ICO = {
    ecrire: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
    photo: svg('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>'),
    livre: svg('<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>'),
    dossier: svg('<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'),
    lire: svg('<path d="M7 4v16l13-8z"/>'),
    pause: svg('<path d="M7 4h4v16H7zM14 4h4v16h-4z"/>'),
    avant: svg('<path d="M18 6 9 12l9 6zM6 6v12"/>'),
    apres: svg('<path d="m6 6 9 6-9 6zM18 6v12"/>'),
    reprendre: svg('<path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/>'),
    ok: svg('<path d="m5 12 5 5 9-10"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    cadenas: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    etoile: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    boutique: svg('<path d="M4 7h16l-1.5 12a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>'),
    sauvegarde: svg('<path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
    telecharger: svg('<path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>'),
    partager: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
    installer: svg('<path d="M12 3v11m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="4" rx="1"/>'),
    poubelle: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    modifier: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
    regle: svg('<rect x="2" y="9" width="20" height="6" rx="1"/><path d="M6 9v3M10 9v2M14 9v3M18 9v2"/>'),
    aa: svg('<path d="M3 19 8 5l5 14M4.8 14h6.4M15 19v-6.5a3 3 0 0 1 6 0V19M15 16h6"/>'),
    syllabes: svg('<rect x="2" y="8" width="9" height="8" rx="2"/><rect x="13" y="8" width="9" height="8" rx="2"/>'),
    mot: svg('<path d="M4 7h16M4 12h10M4 17h6"/>'),
    haut: svg('<path d="m6 15 6-6 6 6"/>'),
    bas: svg('<path d="m6 9 6 6 6-6"/>'),
    coller: svg('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/>'),
    alerte: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.01"/>'),
    son: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>')
  };

  var DEFAUTS = { police: 'lexend', taille: 26, lettres: 0.05, mots: 0.2, interligne: 1.9, fond: 'auto', syllabes: false,
    confusions: { bd: false, pq: false, mn: false }, regle: false, vitesse: 0.8, motParMot: false, voix: '', theme: 'auto' };
  var CONSEILLES = { police: 'lexend', taille: 28, lettres: 0.12, mots: 0.35, interligne: 2.1, fond: 'creme', confusions: { bd: true, pq: true, mn: false } };
  var POLICES = [['lexend', 'Lexend'], ['atkinson', 'Atkinson'], ['opendyslexic', 'OpenDyslexic'], ['systeme', 'Standard']];
  var FONDS = [['creme', 'Crème', '#fbf5e6', '#26221a'], ['blanc', 'Blanc', '#ffffff', '#16131c'], ['bleu', 'Bleu', '#e7f0fb', '#14223a'],
    ['vert', 'Vert', '#e9f5e7', '#16261a'], ['rose', 'Rose', '#fbe9ee', '#2a1820'], ['sombre', 'Sombre', '#1b1d22', '#efe9db']];
  var VITESSES = [[0.6, 'Très lent'], [0.8, 'Lent'], [1, 'Normal'], [1.2, 'Rapide']];

  var S = { niveaux: [], faciles: [], textes: [], reglages: clone(DEFAUTS), passes: [], sauvegarde: null, brouillon: null, dernier: null, lecture: null, regleY: null };
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function etat() { return LF.etatPass(S.passes); }
  function premium() { return etat().premium; }
  function sauver(cle, val) { return DB.mettre('kv', val, cle); }
  var persistanceDemandee = false;
  function demanderPersistance() {
    if (persistanceDemandee) return; persistanceDemandee = true;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}
  }
  function charger() {
    return Promise.all([DB.lire('kv', 'reglages'), DB.lire('kv', 'passes'), DB.lire('kv', 'sauvegarde'), DB.lire('kv', 'brouillon'), DB.lire('kv', 'dernier'),
      DB.tout('textes'), fetch('data/textes.json').then(function (r) { if (!r.ok) throw new Error('Textes introuvables.'); return r.json(); })])
      .then(function (r) {
        var R = clone(DEFAUTS);
        Object.keys(r[0] || {}).forEach(function (k) { R[k] = r[0][k]; });
        R.confusions = Object.assign({ bd: false, pq: false, mn: false }, R.confusions || {});
        S.reglages = R;
        S.passes = r[1] || []; S.sauvegarde = r[2] || null; S.brouillon = r[3] || null; S.dernier = r[4] || null;
        S.textes = (r[5] || []).sort(function (a, b) { return (b.modifie || '') < (a.modifie || '') ? -1 : 1; });
        S.niveaux = r[6].niveaux; S.faciles = r[6].textes;
      });
  }
  function trouverTexte(id) {
    if (id === 'brouillon') return S.brouillon && S.brouillon.texte ? { id: 'brouillon', titre: S.brouillon.titre || LF.titreAuto(S.brouillon.texte), texte: S.brouillon.texte, brouillon: true } : null;
    for (var i = 0; i < S.faciles.length; i++) if (S.faciles[i].id === id) return Object.assign({ facile: true }, S.faciles[i]);
    for (i = 0; i < S.textes.length; i++) if (S.textes[i].id === id) return S.textes[i];
    return null;
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
    var b = fond.querySelector('[data-fermer]');
    if (b) b.focus();
    if (init) init(fond);
    return fond;
  }
  function fermerFeuille() {
    if (!feuilleOuverte) return;
    var f = feuilleOuverte; feuilleOuverte = null;
    f.el.remove();
    document.body.classList.remove('fige');
    if (f.avant && f.avant.focus && document.body.contains(f.avant)) try { f.avant.focus({ preventScroll: true }); } catch (e) {}
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
  function vue(html) { $('#vue').innerHTML = typo(html); window.scrollTo(0, 0); }
  function cadre(o) {
    $('#titre').textContent = o.titre || 'Lecture Facile';
    document.title = (o.titre && o.titre !== 'Lecture Facile' ? o.titre + ' · ' : '') + 'Lecture Facile';
    var r = $('#retour');
    r.hidden = !o.retour; r.dataset.cible = o.retour || '';
    $('#marque').hidden = !!o.retour;
    document.body.classList.toggle('lecture', !!o.lecture);
    $$('#nav a').forEach(function (a) { var on = a.dataset.nav === o.nav; a.classList.toggle('actif', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    majInstall();
  }
  function verrou() { return '<span class="cadenas">' + ICO.cadenas + '</span>'; }

  // ---------- Routeur ----------
  var ROUTES = [[/^\/?$/, vueAccueil], [/^\/ecrire(?:\/([\w-]+))?$/, vueEcrire], [/^\/photo$/, vuePhoto], [/^\/textes$/, vueTextes], [/^\/lire\/([\w-]+)$/, vueLire],
    [/^\/reglages$/, vueReglages], [/^\/pass$/, vuePass], [/^\/sauvegarde$/, vueSauvegarde], [/^\/aide$/, vueAide]];
  function router() {
    fermerFeuille();
    arreterLecture();
    retirerRegle();
    var b = $('.bulle-mot'); if (b) b.remove();
    var brut = location.hash.replace(/^#/, '') || '/';
    var q = brut.indexOf('?'), chemin = q >= 0 ? brut.slice(0, q) : brut, params = new URLSearchParams(q >= 0 ? brut.slice(q + 1) : '');
    for (var i = 0; i < ROUTES.length; i++) {
      var m = chemin.match(ROUTES[i][0]);
      if (m) { try { ROUTES[i][1](m[1], params); } catch (e) { erreurVue(e); } return; }
    }
    location.replace('#/');
  }
  function erreurVue(e) { vue('<section class="carte alerte rouge"><h1>Oups</h1><p>' + esc(e && e.message || e) + '</p><a class="btn plein large" href="#/">Revenir à l\'accueil</a></section>'); }
  function aller(h) { if (location.hash === h) router(); else location.hash = h; }

  // ---------- Accueil ----------
  function rappels() {
    var e = etat(), h = '';
    if (e.rappel) h += '<section class="carte alerte alerte-ligne">' + ICO.alerte + '<div><strong>Votre pass se termine dans ' + e.joursRestants + ' jour' + (e.joursRestants > 1 ? 's' : '') +
      '.</strong><p>Renouvelez-le pour garder les syllabes en couleur et les textes illimités. Les jours restants s\'ajoutent.</p><a class="btn accent" href="#/pass">Renouveler</a></div></section>';
    else if (e.expire) h += '<section class="carte alerte alerte-ligne">' + ICO.info + '<div><strong>Votre pass est terminé.</strong><p>Tous vos textes restent lisibles et modifiables. Reprenez un pass pour les syllabes en couleur.</p><a class="btn accent" href="#/pass">Reprendre un pass</a></div></section>';
    if (S.textes.length >= 3 && (!S.sauvegarde || Date.now() - Date.parse(S.sauvegarde) > MOIS_MS))
      h += '<p class="carte alerte alerte-ligne">' + ICO.sauvegarde + '<span>Pensez à sauvegarder vos textes. <a href="#/sauvegarde">Sauvegarder maintenant</a></span></p>';
    return h;
  }
  function vueAccueil() {
    cadre({ titre: 'Lecture Facile', nav: 'accueil' });
    var pr = premium(), d = S.dernier && trouverTexte(S.dernier.id);
    var h = rappels();
    h += '<section class="carte douce accroche"><h1>Lire plus facilement</h1><p class="exemple-syl" aria-label="chocolat, en syllabes"><span style="color:#1957b8">cho</span><span style="color:#c42b1c">co</span><span style="color:#1957b8">lat</span></p>' +
      '<p>De grandes lettres, des syllabes en couleur, les lettres <b>b</b> et <b>d</b> qui ne se mélangent plus, et le téléphone qui lit avec vous.</p></section>';
    h += '<div class="tuiles">';
    if (d) h += '<a class="tuile principale" href="#/lire/' + esc(d.id) + '">' + ICO.reprendre + '<span class="texte"><strong>Reprendre la lecture</strong><br><small>' + esc(d.titre) + '</small></span></a>';
    h += '<a class="tuile' + (d ? '' : ' principale') + '" href="#/ecrire">' + ICO.ecrire + '<span class="texte"><strong>Écrire ou coller un texte</strong><br><small>Une leçon, un message, une lettre…</small></span></a>' +
      '<a class="tuile" href="#/photo">' + ICO.photo + '<span><strong>Photo d\'un texte</strong><br><small>Le téléphone lit la page</small></span></a>' +
      '<a class="tuile" href="#/textes">' + ICO.livre + '<span><strong>Textes faciles</strong><br><small>' + S.faciles.length + ' textes, 4 niveaux</small></span></a>' +
      '<a class="tuile" href="#/textes?o=mes">' + ICO.dossier + '<span><strong>Mes textes</strong><br><small>' + S.textes.length + (pr ? ' enregistré' + (S.textes.length > 1 ? 's' : '') : ' / ' + LF.TEXTES_GRATUITS + ' (gratuit)') + '</small></span></a>' +
      (d ? '' : '<a class="tuile" href="#/aide">' + ICO.info + '<span><strong>Comment ça marche ?</strong><br><small>En 1 minute</small></span></a>') + '</div>';
    if (!pr) h += '<section class="carte"><h2>Le pass Lecture Facile</h2><p>Les <b>syllabes en couleur</b> sur tous les textes et <b>autant de textes enregistrés que vous voulez</b>. ' + PRIX + ' pour 12 mois.</p><a class="btn sec large" href="#/pass">' + ICO.etoile + 'Voir le pass</a></section>';
    h += '<a class="btn wa large" target="_blank" rel="noopener" id="conseil-wa" href="' + esc(LF.lienWhatsApp(LF.messageConseil())) + '">' + ICO.partager + 'Conseiller l\'appli sur WhatsApp</a>';
    h += carteInstallation();
    vue(h);
  }

  // ---------- Écrire ----------
  var minuteurBrouillon = 0;
  function vueEcrire(id, params) {
    var t = id ? trouverTexte(id) : null;
    if (id && (!t || t.facile || t.brouillon)) { location.replace('#/ecrire'); return; }
    cadre({ titre: t ? 'Modifier le texte' : 'Écrire un texte', nav: 'ecrire', retour: t ? '#/textes?o=mes' : '' });
    var b = !t && S.brouillon ? S.brouillon : null;
    var titre = t ? t.titre : b ? b.titre || '' : '', texte = t ? t.texte : b ? b.texte || '' : '';
    var pr = premium(), n = S.textes.length;
    var h = '<form data-form="ecrire" data-id="' + (t ? esc(t.id) : '') + '"><div class="champ"><label for="e-titre">Titre <span class="petit">(facultatif)</span></label><input type="text" id="e-titre" name="titre" maxlength="80" value="' + esc(titre) + '" autocomplete="off"></div>' +
      '<div class="champ"><label for="e-texte">Votre texte</label><textarea id="e-texte" name="texte" class="zone-texte" placeholder="Écrivez ou collez votre texte ici…" spellcheck="true" lang="fr">' + esc(texte) + '</textarea></div>' +
      '<p class="petit" id="e-compte" aria-live="polite">' + compteMots(texte) + '</p>' +
      (t ? '' : '<div class="rang-btn"><button type="button" class="btn sec" data-action="coller">' + ICO.coller + 'Coller</button><a class="btn sec" href="#/photo">' + ICO.photo + 'Photo</a></div>') +
      '<button type="submit" class="btn plein large" id="e-lire">' + ICO.lire + 'Lire ce texte</button>' +
      (t ? '' : '<button type="button" class="btn large" data-action="enregistrer-texte" id="e-enregistrer">' + ICO.sauvegarde + 'Enregistrer' + (pr ? '' : ' (' + n + ' / ' + LF.TEXTES_GRATUITS + ')') + '</button>') +
      (t ? '<button type="button" class="btn danger large" data-action="supprimer-texte" data-id="' + esc(t.id) + '">' + ICO.poubelle + 'Supprimer ce texte</button>' : '') + '</form>';
    if (!t && texte) h += '<p class="centre"><button type="button" class="lien-btn" data-action="vider">Effacer et recommencer</button></p>';
    vue(h);
    if (params && params.get('photo') === '1') toast('Vérifiez le texte lu sur la photo, corrigez si besoin, puis touchez « Lire ce texte ».');
  }
  function compteMots(t) { var n = LF.decouper(t).mots.length; return n + ' mot' + (n > 1 ? 's' : ''); }
  function lireFormulaire() {
    var f = $('form[data-form=ecrire]');
    return f ? { id: f.dataset.id, titre: f.titre.value.trim(), texte: f.texte.value.replace(/\s+$/, '') } : null;
  }
  function memoriserBrouillon() {
    var v = lireFormulaire();
    if (!v || v.id) return Promise.resolve();
    S.brouillon = { titre: v.titre, texte: v.texte, modifie: new Date().toISOString() };
    return sauver('brouillon', S.brouillon);
  }
  function enregistrerTexte(ouvrir) {
    var v = lireFormulaire();
    if (!v) return;
    if (!/\S/.test(v.texte)) { toast('Écrivez ou collez d\'abord un texte.'); $('#e-texte').focus(); return; }
    var maintenant = new Date().toISOString();
    if (v.id) {
      var t = trouverTexte(v.id);
      t.titre = v.titre || LF.titreAuto(v.texte); t.texte = v.texte; t.modifie = maintenant;
      return DB.mettre('textes', t).then(function () { toast('Texte enregistré.'); aller('#/lire/' + t.id); });
    }
    if (!LF.peutEnregistrer(S.textes.length, premium())) { offreLimite(); return; }
    var nouveau = { id: LF.nouvelId(), titre: v.titre || LF.titreAuto(v.texte), texte: v.texte, cree: maintenant, modifie: maintenant, source: (S.brouillon && S.brouillon.source) || 'saisie' };
    return DB.mettre('textes', nouveau).then(function () {
      S.textes.unshift(nouveau);
      S.brouillon = null;
      demanderPersistance();
      return DB.effacer('kv', 'brouillon');
    }).then(function () { toast('Texte enregistré.'); if (ouvrir !== false) aller('#/lire/' + nouveau.id); });
  }
  function offreLimite() {
    feuille('3 textes enregistrés', '<p>La version gratuite garde <b>' + LF.TEXTES_GRATUITS + ' textes</b>. Vous pouvez :</p><ul class="atouts"><li>' + ICO.ok + '<span>lire ce texte sans l\'enregistrer ;</span></li><li>' + ICO.ok +
      '<span>supprimer un ancien texte ;</span></li><li>' + ICO.etoile + '<span>prendre le pass (' + PRIX + ' pour 12 mois) : textes illimités et syllabes en couleur.</span></li></ul>' +
      '<div class="rang-btn"><a class="btn" href="#/textes?o=mes">Mes textes</a><a class="btn plein" href="#/pass">Voir le pass</a></div>');
  }

  // ---------- Photo (OCR) ----------
  function vuePhoto() {
    cadre({ titre: 'Photo d\'un texte', nav: 'ecrire', retour: '#/ecrire' });
    if (!OCR.disponible) {
      vue('<section class="carte alerte"><h1>Photo indisponible</h1><p>Ce navigateur ne peut pas lire le texte d\'une photo. Essayez avec Chrome (Android) ou Safari (iPhone) à jour, ou écrivez le texte.</p><a class="btn plein large" href="#/ecrire">Écrire le texte</a></section>');
      return;
    }
    vue('<section class="carte"><h1>Lire un texte en photo</h1><ol class="etapes"><li>Posez la page à plat, avec <b>beaucoup de lumière</b>.</li><li>Tenez le téléphone bien droit, au-dessus du texte.</li><li>Vérifiez ensuite le texte trouvé et corrigez les erreurs.</li></ol>' +
      '<label class="btn plein large" for="f-photo">' + ICO.photo + 'Prendre une photo</label><input type="file" id="f-photo" class="vh" accept="image/*" capture="environment">' +
      '<label class="btn sec large" for="f-image">' + ICO.dossier + 'Choisir une image</label><input type="file" id="f-image" class="vh" accept="image/*">' +
      '<p class="petit">La photo reste sur votre téléphone : elle n\'est envoyée nulle part. La première fois, le lecteur de photos est téléchargé (environ 3,7 Mo) ; ensuite il marche sans Internet.</p></section>' +
      '<section class="carte" id="ocr-etat" hidden><img id="ocr-apercu" class="apercu-photo" alt="Votre photo"><div class="progression" role="progressbar" aria-label="Lecture de la photo" aria-valuemin="0" aria-valuemax="100"><i id="ocr-barre" style="width:0"></i></div><p id="ocr-msg" class="msg" role="status" aria-live="polite"></p></section>');
  }
  var ocrEnCours = false;
  function lirePhoto(fichier) {
    if (ocrEnCours) return;
    ocrEnCours = true;
    var zone = $('#ocr-etat'), barre = $('#ocr-barre'), msg = $('#ocr-msg'), img = $('#ocr-apercu');
    zone.hidden = false;
    var url = URL.createObjectURL(fichier);
    img.src = url;
    var progres = function (p, m) {
      if (!document.body.contains(barre)) return;
      barre.style.width = p + '%'; barre.parentNode.setAttribute('aria-valuenow', p);
      msg.textContent = m + ' ' + p + ' %'; msg.className = 'msg';
    };
    zone.scrollIntoView({ block: 'start' });
    OCR.lire(fichier, progres).then(function (brut) {
      ocrEnCours = false;
      URL.revokeObjectURL(url);
      var texte = LF.nettoyerOCR(brut);
      if (!LF.decouper(texte).mots.length) {
        if (document.body.contains(msg)) { msg.textContent = 'Je n\'ai pas trouvé de texte. Reprenez la photo plus près, avec plus de lumière.'; msg.className = 'msg erreur'; }
        return;
      }
      S.brouillon = { titre: LF.titreAuto(texte), texte: texte, source: 'photo', modifie: new Date().toISOString() };
      return sauver('brouillon', S.brouillon).then(function () { aller('#/ecrire?photo=1'); });
    }).catch(function (e) {
      ocrEnCours = false;
      URL.revokeObjectURL(url);
      if (!document.body.contains(msg)) return;
      msg.className = 'msg erreur';
      msg.textContent = e && e.message === 'image' ? 'Cette image ne peut pas être ouverte. Essayez une autre photo.' :
        navigator.onLine === false ? 'La première fois, il faut Internet pour télécharger le lecteur de photos (3,7 Mo). Réessayez avec une connexion.' :
          'La lecture de la photo n\'a pas marché. Réessayez, ou écrivez le texte.';
    });
  }

  // ---------- Textes ----------
  function vueTextes(_, params) {
    var mes = params.get('o') === 'mes', pr = premium();
    cadre({ titre: 'Textes', nav: 'textes' });
    var h = '<div class="onglets" role="tablist"><button type="button" role="tab" aria-selected="' + !mes + '" data-action="onglet" data-o="faciles">Textes faciles</button><button type="button" role="tab" aria-selected="' +
      mes + '" data-action="onglet" data-o="mes">Mes textes (' + S.textes.length + ')</button></div>';
    if (!mes) {
      S.niveaux.forEach(function (n) {
        h += '<div class="niveau"><span class="pastille-niveau" aria-hidden="true">' + n.id + '</span><h2>Niveau ' + n.id + ' · ' + esc(n.nom) + '</h2></div><p class="petit" style="margin-top:0">' + esc(n.description) + '</p><div class="textes">' +
          S.faciles.filter(function (t) { return t.niveau === n.id; }).map(function (t) {
            return '<a class="texte-ligne" href="#/lire/' + t.id + '"><span class="t"><strong>' + esc(t.titre) + (!pr && t.id === LF.TEXTE_ESSAI ? ' <span class="etiquette">Essai syllabes</span>' : '') + '</strong><small>' + esc(t.texte.replace(/\s+/g, ' ').slice(0, 80)) + '</small></span>' + ICO.lire.replace('<svg', '<svg style="color:var(--brand-texte)"') + '</a>';
          }).join('') + '</div>';
      });
    } else {
      if (!pr) h += '<p class="carte douce">Version gratuite : <b class="compteur-textes">' + S.textes.length + ' / ' + LF.TEXTES_GRATUITS + '</b> textes enregistrés. ' + (S.textes.length >= LF.TEXTES_GRATUITS ? 'Supprimez un texte ou <a href="#/pass">prenez le pass</a> pour en ajouter.' : '') + '</p>';
      if (!S.textes.length) h += '<section class="carte centre"><p>Aucun texte enregistré pour l\'instant.</p></section>';
      h += '<div class="textes" id="mes-textes">' + S.textes.map(function (t) {
        return '<div class="texte-ligne"><a class="t" href="#/lire/' + esc(t.id) + '" style="color:inherit;text-decoration:none"><strong>' + esc(t.titre) + '</strong><small>' + esc(LF.dateFr(t.modifie || t.cree)) + ' · ' + esc(t.texte.replace(/\s+/g, ' ').slice(0, 60)) +
          '</small></a><span class="actions"><a class="icone-btn" href="#/ecrire/' + esc(t.id) + '" aria-label="Modifier « ' + esc(t.titre) + ' »">' + ICO.modifier + '</a><button type="button" class="icone-btn" data-action="supprimer-texte" data-id="' + esc(t.id) +
          '" aria-label="Supprimer « ' + esc(t.titre) + ' »">' + ICO.poubelle + '</button></span></div>';
      }).join('') + '</div><a class="btn plein large" href="#/ecrire" style="margin-top:14px">' + ICO.ecrire + 'Nouveau texte</a>';
    }
    vue(h);
  }
  function supprimerTexte(id) {
    var t = trouverTexte(id);
    if (!t) return;
    confirmer('Supprimer « ' + t.titre + ' » ? Ce texte sera effacé de ce téléphone.', 'Supprimer', true).then(function (oui) {
      if (!oui) return;
      DB.effacer('textes', id).then(function () {
        S.textes = S.textes.filter(function (x) { return x.id !== id; });
        if (S.dernier && S.dernier.id === id) { S.dernier = null; DB.effacer('kv', 'dernier'); }
        toast('Texte supprimé.');
        aller('#/textes?o=mes');
      });
    });
  }

  // ---------- Lecteur ----------
  function fondEffectif() {
    var f = S.reglages.fond;
    if (f !== 'auto') return f;
    var t = document.documentElement.getAttribute('data-theme');
    var sombre = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    return sombre ? 'sombre' : 'creme';
  }
  function stylePage() {
    var R = S.reglages;
    return '--l-taille:' + R.taille + 'px;--l-lettres:' + R.lettres + 'em;--l-mots:' + R.mots + 'em;--l-interligne:' + R.interligne;
  }
  function classePage() { return 'page p-' + S.reglages.police + ' fond-' + fondEffectif(); }
  function syllabesActives() { var L = S.lecture; return !!(S.reglages.syllabes && L && LF.syllabesPermises(L.id, premium())); }
  function vueLire(id) {
    var t = trouverTexte(id);
    if (!t) { toast('Ce texte n\'existe plus.'); location.replace('#/textes'); return; }
    var retour = t.facile ? '#/textes' : t.brouillon ? '#/ecrire' : '#/textes?o=mes';
    cadre({ titre: t.titre, retour: retour, lecture: true });
    var analyse = LF.decouper(t.texte);
    S.lecture = { id: t.id, titre: t.titre, texte: t.texte, analyse: analyse, phrases: LF.phrases(analyse), i: 0, k: 0, joue: false, jeton: 0, courant: -1, facile: !!t.facile, brouillon: !!t.brouillon };
    if (S.dernier && S.dernier.id === t.id && S.dernier.i < S.lecture.phrases.length) S.lecture.i = S.dernier.i;
    S.dernier = { id: t.id, i: S.lecture.i }; sauver('dernier', S.dernier);
    afficherLecteur();
    if (S.reglages.regle) placerRegle(true);
  }
  function afficherLecteur() {
    var L = S.lecture, R = S.reglages, pr = premium(), cf = LF.lettresActives(R.confusions);
    var sylOk = LF.syllabesPermises(L.id, pr);
    var h = '<div class="puces" role="toolbar" aria-label="Aides à la lecture">' +
      '<button type="button" class="puce" data-action="basculer-syllabes" aria-pressed="' + syllabesActives() + '">' + ICO.syllabes + 'Syllabes' + (sylOk ? '' : verrou()) + '</button>' +
      '<button type="button" class="puce" data-action="basculer-cf" aria-pressed="' + !!cf + '"><b>b d</b>&nbsp;<b>p q</b></button>' +
      '<button type="button" class="puce" data-action="basculer-regle" aria-pressed="' + !!R.regle + '">' + ICO.regle + 'Règle</button>' +
      '<button type="button" class="puce" data-action="basculer-mot" aria-pressed="' + !!R.motParMot + '">' + ICO.mot + 'Mot par mot</button>' +
      '<button type="button" class="puce" data-action="affichage">' + ICO.aa + 'Affichage</button>' +
      (L.brouillon ? '<button type="button" class="puce" data-action="enregistrer-brouillon">' + ICO.sauvegarde + 'Enregistrer</button>' : '') +
      (!L.facile && !L.brouillon ? '<a class="puce" href="#/ecrire/' + esc(L.id) + '">' + ICO.modifier + 'Modifier</a>' : '') +
      '<a class="puce" id="texte-wa" target="_blank" rel="noopener" href="' + esc(LF.lienWhatsApp(LF.messageTexte(L.titre, L.texte))) + '">' + ICO.partager + 'WhatsApp</a></div>';
    if (cf) h += '<div class="legende-cf" aria-label="Lettres coloriées : ' + cf.split('').join(', ') + '">' + cf.split('').map(function (c) { return '<span class="cf cf-' + c + '">' + c + '</span>'; }).join('') + '</div>';
    h += '<article id="page" class="' + classePage() + '" style="' + stylePage() + '" lang="fr"><h1>' + esc(L.titre) + '</h1>' +
      LF.htmlTexte(L.analyse, { syllabes: syllabesActives(), confusions: R.confusions }) + '</article>';
    h += '<p class="petit centre" style="margin-top:12px">Touchez un mot pour l\'entendre.</p>';
    h += '<div class="barre-lecture" role="toolbar" aria-label="Lecture à voix haute"><button type="button" class="icone-btn" data-action="phrase-avant" aria-label="Phrase précédente">' + ICO.avant + '</button>' +
      '<button type="button" class="lire" data-action="lire" id="btn-lire" aria-label="' + (L.joue ? 'Pause' : 'Lire à voix haute') + '">' + (L.joue ? ICO.pause : ICO.lire) + '</button>' +
      '<button type="button" class="icone-btn" data-action="phrase-apres" aria-label="Phrase suivante">' + ICO.apres + '</button>' +
      '<button type="button" class="vitesse" data-action="vitesse" aria-label="Vitesse de lecture : ' + libelleVitesse() + '">' + String(R.vitesse).replace('.', ',') + '×<small>' + libelleVitesse() + '</small></button></div>';
    var y = window.scrollY;
    $('#vue').innerHTML = typo(h);
    window.scrollTo(0, y);
    if (L.courant >= 0) surligner(L.courant, true);
  }
  function libelleVitesse() { var v = S.reglages.vitesse; for (var i = 0; i < VITESSES.length; i++) if (Math.abs(VITESSES[i][0] - v) < 0.01) return VITESSES[i][1]; return ''; }
  function surligner(i, sansDefiler) {
    var L = S.lecture; if (!L) return;
    var a = $('.page .mot.lu'); if (a) a.classList.remove('lu');
    L.courant = i;
    var m = $('.page .mot[data-i="' + i + '"]');
    if (!m) return;
    m.classList.add('lu');
    if (sansDefiler) return;
    var r = m.getBoundingClientRect(), haut = 70, bas = window.innerHeight - 120;
    if (r.top < haut || r.bottom > bas) {
      var reduit = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.35, behavior: reduit ? 'auto' : 'smooth' });
      r = { top: window.innerHeight * 0.35, height: r.height };
    }
    if (S.reglages.regle && S.regleY != null) { var bande = hauteurBande(); S.regleY = r.top + r.height / 2 - bande / 2; placerRegle(); }
  }
  function phraseDuMot(i) {
    var P = S.lecture.phrases;
    for (var p = 0; p < P.length; p++) for (var k = 0; k < P[p].mots.length; k++) if (P[p].mots[k].i === i) return [p, k];
    return [0, 0];
  }
  // Lecture à voix haute, phrase par phrase (ou mot par mot)
  function lire() {
    var L = S.lecture;
    if (!L) return;
    if (!Voix.synthese) { toast('La lecture à voix haute n\'est pas disponible sur ce navigateur. Essayez Chrome ou Safari.'); return; }
    if (!Voix.choisir(S.reglages.voix) && !lire.averti) { lire.averti = true; toast('Aucune voix française trouvée : installez « Synthèse vocale Google » (français) dans les réglages du téléphone.'); }
    if (L.i >= L.phrases.length) { L.i = 0; L.k = 0; }
    L.joue = true;
    majBoutonLire();
    direPhrase(L.i, L.k);
  }
  function majBoutonLire() {
    var b = $('#btn-lire'), L = S.lecture; if (!b || !L) return;
    b.innerHTML = L.joue ? ICO.pause : ICO.lire;
    b.setAttribute('aria-label', L.joue ? 'Pause' : 'Lire à voix haute');
  }
  var minuteurEstime = 0;
  function direPhrase(i, depuis) {
    var L = S.lecture, jet = ++L.jeton;
    clearTimeout(minuteurEstime);
    if (i >= L.phrases.length) return finLecture();
    L.i = i; depuis = depuis || 0; L.k = depuis;
    memoriserPosition();
    var p = L.phrases[i], vitesse = S.reglages.vitesse;
    if (S.reglages.motParMot) return direMot(i, depuis, jet);
    var decal = p.mots[depuis].debut, texte = p.texte.slice(decal);
    surligner(p.mots[depuis].i);
    var bornes = false;
    var estimer = function (k) {
      if (L.jeton !== jet || bornes || k >= p.mots.length) return;
      surligner(p.mots[k].i); L.k = k;
      minuteurEstime = setTimeout(function () { estimer(k + 1); }, LF.dureeMot(p.mots[k].texte, vitesse) * 1000);
    };
    Voix.dire(texte, { vitesse: vitesse, voix: S.reglages.voix,
      debut: function () { minuteurEstime = setTimeout(function () { if (!bornes) estimer(depuis); }, 450); },
      mot: function (c) {
        if (L.jeton !== jet) return;
        bornes = true; clearTimeout(minuteurEstime);
        var k = LF.motAuCaractere(p, c + decal); L.k = k;
        surligner(p.mots[k].i);
      },
      fin: function (ok) {
        clearTimeout(minuteurEstime);
        if (L.jeton !== jet || !L.joue) return;
        if (!ok) { pause(); toast('La voix du téléphone s\'est arrêtée. Touchez ▶ pour reprendre.'); return; }
        setTimeout(function () { if (L.jeton === jet && L.joue) direPhrase(i + 1, 0); }, 280);
      } });
  }
  function direMot(i, k, jet) {
    var L = S.lecture, p = L.phrases[i];
    if (L.jeton !== jet || !L.joue) return;
    if (k >= p.mots.length) { setTimeout(function () { if (L.jeton === jet && L.joue) direPhrase(i + 1, 0); }, 350); return; }
    L.k = k;
    surligner(p.mots[k].i);
    Voix.dire(p.mots[k].texte, { vitesse: S.reglages.vitesse, voix: S.reglages.voix, fin: function (ok) {
      if (L.jeton !== jet || !L.joue) return;
      if (!ok) { pause(); return; }
      setTimeout(function () { direMot(i, k + 1, jet); }, 380 / S.reglages.vitesse);
    } });
  }
  function pause() {
    var L = S.lecture; if (!L) return;
    L.joue = false; L.jeton++;
    clearTimeout(minuteurEstime);
    Voix.arreter();
    majBoutonLire();
    memoriserPosition();
  }
  function finLecture() {
    var L = S.lecture;
    L.joue = false; L.i = 0; L.k = 0;
    majBoutonLire();
    var a = $('.page .mot.lu'); if (a) a.classList.remove('lu');
    L.courant = -1;
    S.dernier = { id: L.id, i: 0 }; sauver('dernier', S.dernier);
    toast('Bravo, le texte est fini !');
  }
  function arreterLecture() { if (S.lecture) { pause(); S.lecture = null; } else Voix.arreter(); clearTimeout(minuteurEstime); }
  var minuteurPosition = 0;
  function memoriserPosition() {
    clearTimeout(minuteurPosition);
    var L = S.lecture; if (!L) return;
    minuteurPosition = setTimeout(function () { S.dernier = { id: L.id, i: L.i }; sauver('dernier', S.dernier); }, 600);
  }
  function changerPhrase(d) {
    var L = S.lecture, joue = L.joue;
    if (joue) pause();
    L.i = Math.max(0, Math.min(L.phrases.length - 1, L.i + d)); L.k = 0;
    surligner(L.phrases[L.i].mots[0].i);
    memoriserPosition();
    if (joue) lire();
  }
  function toucherMot(el) {
    var L = S.lecture; if (!L) return;
    var i = +el.dataset.i, w = L.analyse.mots[i];
    if (L.joue) pause();
    var pk = phraseDuMot(i); L.i = pk[0]; L.k = pk[1];
    surligner(i, true);
    memoriserPosition();
    var b = $('.bulle-mot'); if (b) b.remove();
    b = document.createElement('div');
    b.className = 'bulle-mot'; b.setAttribute('role', 'status');
    if (syllabesActives() && !w.nombre) b.innerHTML = LF.syllabes(w.texte).map(function (s, k) { return '<span class="s' + (k % 2) + '">' + esc(s) + '</span>'; }).join('<span class="point">·</span>');
    else b.textContent = w.texte;
    document.body.appendChild(b);
    clearTimeout(toucherMot.m);
    toucherMot.m = setTimeout(function () { if (b.parentNode) b.remove(); }, 2600);
    if (Voix.synthese) Voix.dire(w.texte, { vitesse: Math.min(S.reglages.vitesse, 0.9), voix: S.reglages.voix });
  }
  function changerVitesse() {
    var R = S.reglages, k = 0;
    for (var i = 0; i < VITESSES.length; i++) if (Math.abs(VITESSES[i][0] - R.vitesse) < 0.01) k = i;
    R.vitesse = VITESSES[(k + 1) % VITESSES.length][0];
    sauver('reglages', R);
    var b = $('.barre-lecture .vitesse');
    if (b) { b.innerHTML = String(R.vitesse).replace('.', ',') + '×<small>' + libelleVitesse() + '</small>'; b.setAttribute('aria-label', 'Vitesse de lecture : ' + libelleVitesse()); }
    var L = S.lecture;
    if (L && L.joue) { pause(); lire(); }
  }
  function basculerSyllabes() {
    var L = S.lecture;
    if (!LF.syllabesPermises(L.id, premium())) {
      feuille('Syllabes en couleur', '<p class="exemple-syl" style="text-align:center"><span style="color:#1957b8">pa</span><span style="color:#c42b1c">pi</span><span style="color:#1957b8">llon</span></p>' +
        '<p>Les syllabes en couleur, sur tous vos textes, font partie du <b>pass Lecture Facile</b> (' + PRIX + ' pour 12 mois).</p><p>Essayez-les gratuitement sur le texte « Le chat de Rama ».</p>' +
        '<div class="rang-btn"><a class="btn sec" href="#/lire/' + LF.TEXTE_ESSAI + '">Essayer</a><a class="btn plein" href="#/pass">Voir le pass</a></div>');
      return;
    }
    S.reglages.syllabes = !S.reglages.syllabes;
    sauver('reglages', S.reglages);
    afficherLecteur();
  }

  // ---------- Règle de lecture ----------
  function hauteurBande() { return Math.round(S.reglages.taille * S.reglages.interligne * 1.08 + 8); }
  function placerRegle(creer) {
    var r = $('#regle');
    if (!r) {
      if (!creer) return;
      r = document.createElement('div');
      r.id = 'regle'; r.className = 'regle'; r.setAttribute('aria-hidden', 'true');
      r.innerHTML = '<div class="masque haut"></div><div class="bande"><div class="poignee"><button type="button" data-action="regle-haut" tabindex="-1" aria-label="Ligne précédente">' + ICO.haut +
        '</button><button type="button" data-action="regle-bas" tabindex="-1" aria-label="Ligne suivante">' + ICO.bas + '</button></div></div><div class="masque bas"></div>';
      document.body.appendChild(r);
      brancherRegle(r);
    }
    var h = hauteurBande(), min = 62, max = window.innerHeight - 96 - h;
    if (S.regleY == null) {
      // au départ : sur la ligne du mot en cours, sinon sur la première ligne du texte
      var m = $('.page .mot.lu') || $('.page .mot[data-i="0"]');
      var rm = m ? m.getBoundingClientRect() : { top: 160, height: 0 };
      S.regleY = Math.round(rm.top + rm.height / 2 - h / 2);
    }
    S.regleY = Math.max(min, Math.min(max, S.regleY));
    var bande = $('.bande', r), haut = $('.masque.haut', r), bas = $('.masque.bas', r);
    bande.style.top = S.regleY + 'px'; bande.style.height = h + 'px';
    haut.style.top = '0px'; haut.style.height = S.regleY + 'px';
    bas.style.top = (S.regleY + h) + 'px'; bas.style.bottom = '0px';
  }
  function brancherRegle(r) {
    var bande = $('.bande', r), depart = null;
    bande.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      depart = { y: e.clientY, r: S.regleY };
      try { bande.setPointerCapture(e.pointerId); } catch (x) {}
      e.preventDefault();
    });
    bande.addEventListener('pointermove', function (e) { if (!depart) return; S.regleY = depart.r + e.clientY - depart.y; placerRegle(); });
    var fin = function () { depart = null; };
    bande.addEventListener('pointerup', fin); bande.addEventListener('pointercancel', fin);
  }
  function retirerRegle() { var r = $('#regle'); if (r) r.remove(); }
  function deplacerRegle(sens) {
    var pas = Math.round(S.reglages.taille * S.reglages.interligne);
    S.regleY += sens * pas;
    var max = window.innerHeight - 96 - hauteurBande();
    if (S.regleY > max) { window.scrollBy(0, pas); S.regleY = max; }
    if (S.regleY < 62) { window.scrollBy(0, -pas); S.regleY = 62; }
    placerRegle();
  }

  // ---------- Panneau d'affichage ----------
  function panneauAffichage() {
    var R = S.reglages;
    var plage = function (nom, libelle, min, max, pas, val, unite) {
      return '<div class="reglage-ligne"><label for="r-' + nom + '">' + libelle + '</label><output id="o-' + nom + '">' + formater(nom, val) + '</output></div>' +
        '<input type="range" id="r-' + nom + '" data-plage="' + nom + '" min="' + min + '" max="' + max + '" step="' + pas + '" value="' + val + '">';
    };
    var h = '<p style="font-weight:700;margin:0 0 6px">Police</p><div class="polices" role="radiogroup" aria-label="Police">' + POLICES.map(function (p) {
      return '<label><input type="radio" name="police" value="' + p[0] + '"' + (R.police === p[0] ? ' checked' : '') + '><span class="p-' + p[0] + '">Lire bdpq<small>' + p[1] + '</small></span></label>';
    }).join('') + '</div>';
    h += '<div class="reglage-ligne"><label>Taille des lettres</label><button type="button" class="icone-btn" data-action="taille" data-d="-2" aria-label="Plus petit">−</button><output id="o-taille">' + R.taille +
      '</output><button type="button" class="icone-btn" data-action="taille" data-d="2" aria-label="Plus grand">+</button></div>';
    h += plage('lettres', 'Espace entre les lettres', 0, 0.3, 0.01, R.lettres) + plage('mots', 'Espace entre les mots', 0, 1, 0.05, R.mots) + plage('interligne', 'Hauteur des lignes', 1.4, 3, 0.1, R.interligne);
    h += '<p style="font-weight:700;margin:12px 0 6px">Couleur du fond</p><div class="fonds" role="radiogroup" aria-label="Couleur du fond">' + FONDS.map(function (f) {
      return '<label title="' + f[1] + '"><input type="radio" name="fond" value="' + f[0] + '"' + (fondEffectif() === f[0] ? ' checked' : '') + ' aria-label="' + f[1] + '"><span style="background:' + f[2] + ';color:' + f[3] + '">Aa</span></label>';
    }).join('') + '</div>';
    h += '<p style="font-weight:700;margin:12px 0 0">Lettres à colorier</p>' + [['bd', 'b et d'], ['pq', 'p et q'], ['mn', 'm et n']].map(function (c) {
      return '<label class="interrupteur"><span>' + c[1] + '</span><input type="checkbox" data-cf="' + c[0] + '"' + (R.confusions[c[0]] ? ' checked' : '') + '></label>';
    }).join('');
    h += '<div class="rang-btn"><button type="button" class="btn sec" data-action="preset" data-p="conseilles">Réglages conseillés</button><button type="button" class="btn" data-action="preset" data-p="defaut">Par défaut</button></div>';
    feuille('Affichage', h);
  }
  function formater(nom, v) {
    v = +v;
    if (nom === 'interligne') return v.toFixed(1).replace('.', ',');
    if (nom === 'lettres' || nom === 'mots') return Math.round(v * 100) + ' %';
    return String(v);
  }
  var minuteurReglages = 0;
  function appliquerAffichage(complet) {
    clearTimeout(minuteurReglages);
    minuteurReglages = setTimeout(function () { sauver('reglages', S.reglages); }, 300);
    var p = $('#page');
    if (!p) return;
    if (complet) { afficherLecteur(); return; }
    p.setAttribute('style', stylePage());
    p.className = classePage();
    if (S.reglages.regle) placerRegle();
  }

  // ---------- Réglages ----------
  function vueReglages() {
    cadre({ titre: 'Réglages', nav: 'reglages' });
    var R = S.reglages, e = etat(), fr = Voix.synthese ? Voix.voixFrancaises() : [];
    var radio = function (nom, opts, val) {
      return '<div class="segment" role="radiogroup">' + opts.map(function (o) {
        return '<label><input type="radio" name="' + nom + '" value="' + o[0] + '"' + (String(val) === String(o[0]) ? ' checked' : '') + '><span>' + o[1] + '</span></label>';
      }).join('') + '</div>';
    };
    var h = '<section class="carte"><h2>Affichage du texte</h2><div class="' + classePage() + ' apercu-page" style="' + stylePage() + '">Le petit <span class="syl s0">cha</span><span class="syl s1">pi</span><span class="syl s0">teau</span> rouge.</div>' +
      '<button type="button" class="btn sec large" data-action="affichage">' + ICO.aa + 'Police, taille, espaces, fond</button></section>';
    h += '<section class="carte"><h2>Voix</h2>';
    if (!Voix.synthese) h += '<p class="petit">Ce navigateur ne lit pas à voix haute. Essayez Chrome (Android) ou Safari (iPhone).</p>';
    else {
      if (fr.length > 1) h += '<div class="champ"><label for="r-voix">Voix française</label><select id="r-voix" data-voix style="width:100%;min-height:50px;font:inherit;border-radius:14px;border:2px solid var(--line);background:var(--surface);color:var(--text);padding:8px">' +
        '<option value="">Automatique</option>' + fr.map(function (v) { return '<option value="' + esc(v.name) + '"' + (R.voix === v.name ? ' selected' : '') + '>' + esc(v.name) + '</option>'; }).join('') + '</select></div>';
      else if (!fr.length) h += '<p class="petit">Aucune voix française trouvée. Sur Android : Réglages, Accessibilité, Synthèse vocale, puis installez le français.</p>';
      h += '<p style="margin:8px 0 4px;font-weight:700">Vitesse</p>' + radio('vitesse', VITESSES, R.vitesse) +
        '<button type="button" class="btn sec large" data-action="essayer-voix">' + ICO.son + 'Essayer la voix</button>';
    }
    h += '</section><section class="carte"><h2>Thème de l\'application</h2>' + radio('theme', [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']], R.theme) + '</section>';
    h += '<section class="carte"><ul class="menu">' +
      '<li><a href="#/pass">' + ICO.etoile + '<span class="t"><strong>Pass Lecture Facile</strong><small>' + (e.premium ? 'Actif jusqu\'au ' + LF.dateFr(e.fin.slice(0, 10)) : e.expire ? 'Terminé : vos textes restent lisibles' : 'Version gratuite : 3 textes, sans syllabes en couleur') + '</small></span></a></li>' +
      '<li><a href="#/sauvegarde">' + ICO.sauvegarde + '<span class="t"><strong>Sauvegarde</strong><small>' + (S.sauvegarde ? 'Dernière : ' + LF.dateFr(S.sauvegarde.slice(0, 10)) : 'Aucune sauvegarde pour l\'instant') + '</small></span></a></li>' +
      '<li><a href="#/aide">' + ICO.info + '<span class="t"><strong>Aide et licences</strong><small>Comment ça marche, polices, lecteur de photos</small></span></a></li>' +
      (peutInstaller() ? '<li><button type="button" data-action="installer">' + ICO.installer + '<span class="t"><strong>Installer l\'application</strong><small>Une icône sur l\'écran d\'accueil</small></span></button></li>' : '') +
      '</ul></section>';
    h += '<p class="pied">Lecture Facile ' + VERSION + ' · vos textes restent sur ce téléphone.<br>Seule l\'activation du pass utilise Internet, une seule fois.</p>';
    vue(h);
  }
  function appliquerTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    try { if (t === 'light' || t === 'dark') localStorage.setItem('lecture-theme', t); else localStorage.removeItem('lecture-theme'); } catch (e) {}
  }

  // ---------- Aide ----------
  function vueAide() {
    cadre({ titre: 'Aide', nav: 'reglages', retour: '#/reglages' });
    var h = '<section class="carte"><h1>Comment ça marche ?</h1><ol class="etapes"><li><b>Choisissez un texte</b> : un texte facile, le vôtre (écrit ou collé), ou la photo d\'une page.</li>' +
      '<li><b>Réglez l\'affichage</b> : grandes lettres, plus d\'espace, une police plus lisible, un fond doux.</li><li><b>Activez les aides</b> : syllabes en couleur, lettres b/d et p/q coloriées, règle de lecture.</li>' +
      '<li><b>Touchez ▶</b> : le téléphone lit et surligne chaque mot. Touchez un mot pour l\'entendre seul.</li></ol></section>';
    h += '<section class="carte"><h2>Conseils pour lire ensemble</h2><ul class="atouts"><li>' + ICO.ok + '<span>Des séances courtes : 10 minutes par jour valent mieux qu\'une heure le dimanche.</span></li><li>' + ICO.ok +
      '<span>Lisez d\'abord avec la voix (mot par mot, très lent), puis sans.</span></li><li>' + ICO.ok + '<span>Avec la règle, on ne voit qu\'une ligne à la fois : on ne se perd plus.</span></li><li>' + ICO.ok +
      '<span>Félicitez chaque progrès. Lire, ça s\'apprend à tout âge.</span></li></ul><p class="petit">Lecture Facile aide à lire ; elle ne remplace pas l\'accompagnement d\'un enseignant ou d\'un spécialiste.</p></section>';
    h += '<section class="carte"><h2>Licences</h2><p class="petit">Polices embarquées sous licence SIL Open Font License 1.1 : <b>OpenDyslexic</b> (Abbie Gonzalez), <b>Lexend</b> (The Lexend Project Authors), <b>Atkinson Hyperlegible</b> (Braille Institute of America). ' +
      'Lecture des photos : <b>Tesseract.js 7.0.0</b> et Tesseract OCR avec le modèle français tessdata, licence Apache 2.0, entièrement sur le téléphone. Les textes faciles sont des créations originales Teranga. Détails dans les dossiers fonts/ et vendor/ de l\'application.</p></section>';
    vue(h);
  }

  // ---------- Pass ----------
  function avantages() {
    return ['Syllabes en couleur sur tous vos textes', 'Textes enregistrés illimités (gratuit : 3)', 'La lecture à voix haute, la règle, les polices et les lettres coloriées restent gratuites', 'Vos textes gardés, même après la fin du pass']
      .map(function (x) { return '<li>' + ICO.ok + '<span>' + esc(x) + '</span></li>'; }).join('');
  }
  function vuePass(_, params) {
    cadre({ titre: 'Pass Lecture Facile', retour: '#/reglages', nav: 'reglages' });
    var e = etat(), pre = params.get('code') || '';
    var h = '';
    if (e.premium) {
      h += '<section class="carte statut-pass"><span class="gros-emoji" aria-hidden="true">⭐</span><div><small class="petit">Pass actif</small><strong>Toutes les aides sont ouvertes</strong><span class="petit">Jusqu\'au ' +
        LF.dateLongue(e.fin.slice(0, 10)) + ' (' + e.joursRestants + ' jours)</span></div></section>';
      if (e.rappel) h += '<section class="carte alerte"><p>Votre pass se termine bientôt. Renouvelez maintenant : les jours restants s\'ajoutent.</p><a class="btn accent large" href="' + LF.urlProduit() + '" target="_blank" rel="noopener">' + ICO.boutique + 'Renouveler (' + PRIX + ')</a></section>';
    } else {
      if (e.expire) h += '<section class="carte alerte"><p>Votre pass s\'est terminé le ' + LF.dateLongue(e.fin.slice(0, 10)) + '. Vos textes restent lisibles et modifiables.</p></section>';
      h += '<section class="carte"><h1>Le pass Lecture Facile</h1><ul class="atouts">' + avantages() + '</ul><p class="prix">' + PRIX + ' <small>pour 12 mois, paiement Wave</small></p>' +
        '<a class="btn plein large" href="' + LF.urlProduit() + '" target="_blank" rel="noopener">' + ICO.boutique + 'Acheter le pass</a></section>';
    }
    h += '<form class="carte" data-form="pass"><h2>' + (e.premium ? 'Ajouter un pass (renouvellement)' : 'Activer mon pass') + '</h2><ol class="etapes"><li>Achetez le pass dans la boutique Teranga et payez par Wave.</li>' +
      '<li>Sur la page de votre commande payée, copiez le lien de la page.</li><li>Collez-le ici puis touchez « Activer ».</li></ol>' +
      '<div class="champ"><label for="c-code">Lien de votre commande</label><textarea id="c-code" name="code" rows="3" placeholder="https://…/boutique/commande.html?o=TCV-…&amp;t=…" autocomplete="off" autocapitalize="off" spellcheck="false">' + esc(pre) + '</textarea></div>' +
      '<p class="msg" id="msg-pass" role="status" aria-live="polite"></p><button type="submit" class="btn plein large" id="btn-activer">' + ICO.etoile + 'Activer</button>' +
      '<p class="petit">Internet est nécessaire une seule fois, pour vérifier la commande. Ensuite tout marche hors ligne.</p></form>';
    vue(h);
    if (pre) activer(pre);
  }
  function activer(texte) {
    var msg = $('#msg-pass'), btn = $('#btn-activer');
    var dire = function (m, cls) { if (msg) { msg.textContent = m; msg.className = 'msg' + (cls ? ' ' + cls : ''); } };
    var c = LF.lireLienCommande(texte);
    if (!c) return dire('Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « TCV- »).', 'erreur');
    if (navigator.onLine === false) return dire('Vous êtes hors ligne. Connectez-vous à Internet une fois pour activer.', 'erreur');
    dire('Vérification de votre commande…');
    if (btn) btn.disabled = true;
    fetch(LF.urlVerification(c), { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (r.status === 404) throw { m: 'Commande introuvable. Vérifiez que vous avez copié le lien complet.' };
      if (!r.ok) throw { m: 'Le service de vérification ne répond pas. Réessayez dans un instant.' };
      return r.json();
    }).then(function (j) {
      var a = LF.analyserReponse(j);
      if (!a.ok) {
        if (a.raison === 'impayee') throw { m: 'Le paiement de cette commande n\'est pas encore confirmé. Terminez le paiement Wave, attendez la confirmation, puis réessayez.' };
        if (a.raison === 'produit') throw { m: 'Ce lien correspond à un autre achat' + (a.titre ? ' (« ' + a.titre + ' »)' : '') + '. Il faut le lien de la commande « Pass Lecture Facile ».' };
        if (a.raison === 'expiree') throw { m: 'Ce pass a pris fin le ' + LF.dateLongue(a.fin.slice(0, 10)) + '. Prenez un nouveau pass pour continuer.' };
        throw { m: 'Commande introuvable.' };
      }
      S.passes = LF.ajouterPass(S.passes, a.pass);
      return sauver('passes', S.passes).then(function () {
        demanderPersistance();
        toast('Pass activé : syllabes en couleur et textes illimités !');
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
    cadre({ titre: 'Sauvegarde', retour: '#/reglages', nav: 'reglages' });
    vue('<section class="carte"><h2>Sauvegarder mes textes</h2><p>Un petit fichier avec vos textes et vos réglages. Gardez-le (WhatsApp à vous-même, Drive…) pour tout retrouver sur un nouveau téléphone.</p>' +
      '<p class="petit">' + (S.sauvegarde ? 'Dernière sauvegarde : ' + LF.dateFr(S.sauvegarde.slice(0, 10)) : 'Aucune sauvegarde pour l\'instant.') + '</p>' +
      '<button type="button" class="btn plein large" data-action="exporter">' + ICO.telecharger + 'Télécharger la sauvegarde</button></section>' +
      '<section class="carte"><h2>Restaurer une sauvegarde</h2><p>Remplace les textes de ce téléphone par ceux du fichier choisi.</p><label class="btn sec large" for="f-import">' + ICO.sauvegarde +
      'Choisir le fichier</label><input type="file" id="f-import" class="vh" accept=".json,application/json"></section>' +
      '<section class="carte"><h2>Tout effacer</h2><p class="petit">Efface vos textes et réglages de ce téléphone (votre pass reste actif).</p><button type="button" class="btn danger large" data-action="tout-effacer">' + ICO.poubelle + 'Tout effacer</button></section>');
  }
  function telecharger(blob, nom) {
    var a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = nom; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1500);
  }
  function exporter() {
    var d = { application: 'teranga-lecture', version: 1, exporte: new Date().toISOString(), kv: { reglages: S.reglages, dernier: S.dernier, brouillon: S.brouillon }, textes: S.textes };
    telecharger(new Blob([JSON.stringify(d)], { type: 'application/json' }), 'lecture-facile-sauvegarde-' + LF.dateISO() + '.json');
    S.sauvegarde = new Date().toISOString();
    sauver('sauvegarde', S.sauvegarde).then(function () { toast('Sauvegarde téléchargée.'); if (location.hash === '#/sauvegarde') vueSauvegarde(); });
  }
  function importer(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var d;
      try { d = JSON.parse(lecteur.result); } catch (e) { return toast('Fichier illisible : ce n\'est pas une sauvegarde Lecture Facile.'); }
      if (!d || d.application !== 'teranga-lecture' || !Array.isArray(d.textes)) return toast('Ce fichier n\'est pas une sauvegarde Lecture Facile.');
      confirmer('Remplacer les textes de ce téléphone par la sauvegarde du ' + LF.dateFr(String(d.exporte || '').slice(0, 10)) + ' (' + d.textes.length + ' textes) ?', 'Restaurer', true).then(function (oui) {
        if (!oui) return;
        var kv = {};
        ['reglages', 'dernier', 'brouillon'].forEach(function (k) { if (d.kv && d.kv[k] != null) kv[k] = d.kv[k]; });
        var textes = d.textes.filter(function (t) { return t && typeof t.id === 'string' && typeof t.texte === 'string'; });
        DB.remplacer({ textes: textes, kv: kv }, ['passes', 'sauvegarde']).then(charger).then(function () {
          appliquerTheme(S.reglages.theme);
          toast('Sauvegarde restaurée.'); aller('#/textes?o=mes');
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
  function majInstall() { var b = $('#installer'); if (b) b.hidden = !peutInstaller() || document.body.classList.contains('lecture'); }
  function aideIOS() { return '<ol class="etapes installer-ios"><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez <b>Partager</b> (carré avec une flèche vers le haut).</li><li>Choisissez <b>« Sur l\'écran d\'accueil »</b>, puis <b>Ajouter</b>.</li></ol>'; }
  function carteInstallation() {
    if (!peutInstaller()) return '';
    return '<section class="carte douce"><h2>Installez l\'application</h2><p>Une icône sur votre écran d\'accueil, et l\'appli s\'ouvre même sans Internet.</p>' +
      (estIOS() && !invite ? aideIOS() : '<button type="button" class="btn plein large" data-action="installer">' + ICO.installer + 'Installer</button>') + '</section>';
  }
  function installer() {
    if (invite) { invite.prompt(); Promise.resolve(invite.userChoice).then(function () { invite = null; majInstall(); }); return; }
    if (estIOS()) feuille('Installer sur iPhone', aideIOS());
  }

  // ---------- Actions ----------
  var ACTIONS = {
    onglet: function (el) { location.replace(el.dataset.o === 'mes' ? '#/textes?o=mes' : '#/textes'); },
    coller: function () {
      var z = $('#e-texte');
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (t) {
          if (!t) { toast('Le presse-papiers est vide.'); return; }
          z.value = (z.value ? z.value.replace(/\s+$/, '') + '\n\n' : '') + t;
          $('#e-compte').textContent = compteMots(z.value);
          memoriserBrouillon();
        }).catch(function () { toast('Appuyez longtemps dans la zone de texte, puis choisissez « Coller ».'); z.focus(); });
      } else { toast('Appuyez longtemps dans la zone de texte, puis choisissez « Coller ».'); z.focus(); }
    },
    'enregistrer-texte': function () { enregistrerTexte(true); },
    vider: function () {
      confirmer('Effacer ce texte pour en écrire un autre ?', 'Effacer', true).then(function (oui) {
        if (!oui) return;
        S.brouillon = null; DB.effacer('kv', 'brouillon').then(function () { vueEcrire(null, null); });
      });
    },
    'supprimer-texte': function (el) { supprimerTexte(el.dataset.id); },
    'enregistrer-brouillon': function () {
      if (!LF.peutEnregistrer(S.textes.length, premium())) { offreLimite(); return; }
      var b = S.brouillon, m = new Date().toISOString();
      var t = { id: LF.nouvelId(), titre: b.titre || LF.titreAuto(b.texte), texte: b.texte, cree: m, modifie: m, source: b.source || 'saisie' };
      DB.mettre('textes', t).then(function () {
        S.textes.unshift(t); S.brouillon = null; demanderPersistance();
        return DB.effacer('kv', 'brouillon');
      }).then(function () { toast('Texte enregistré.'); location.replace('#/lire/' + t.id); });
    },
    lire: function () { var L = S.lecture; if (!L) return; if (L.joue) pause(); else lire(); },
    'phrase-avant': function () { changerPhrase(-1); },
    'phrase-apres': function () { changerPhrase(1); },
    vitesse: changerVitesse,
    'basculer-syllabes': basculerSyllabes,
    'basculer-cf': function () {
      var c = S.reglages.confusions, on = !!LF.lettresActives(c);
      S.reglages.confusions = on ? { bd: false, pq: false, mn: false } : { bd: true, pq: true, mn: !!c.mn };
      sauver('reglages', S.reglages); afficherLecteur();
    },
    'basculer-regle': function () {
      S.reglages.regle = !S.reglages.regle; sauver('reglages', S.reglages);
      if (S.reglages.regle) { S.regleY = null; placerRegle(true); } else retirerRegle();
      var b = $('[data-action="basculer-regle"]'); if (b) b.setAttribute('aria-pressed', String(S.reglages.regle));
    },
    'regle-haut': function () { deplacerRegle(-1); },
    'regle-bas': function () { deplacerRegle(1); },
    'basculer-mot': function () {
      var L = S.lecture, joue = L && L.joue;
      if (joue) pause();
      S.reglages.motParMot = !S.reglages.motParMot; sauver('reglages', S.reglages);
      var b = $('[data-action="basculer-mot"]'); if (b) b.setAttribute('aria-pressed', String(S.reglages.motParMot));
      if (joue) lire();
    },
    affichage: panneauAffichage,
    taille: function (el) {
      var R = S.reglages; R.taille = Math.max(16, Math.min(48, R.taille + (+el.dataset.d)));
      var o = $('#o-taille'); if (o) o.textContent = R.taille;
      appliquerAffichage();
    },
    preset: function (el) {
      var R = S.reglages, src = el.dataset.p === 'conseilles' ? CONSEILLES : DEFAUTS;
      ['police', 'taille', 'lettres', 'mots', 'interligne', 'fond'].forEach(function (k) { R[k] = src[k]; });
      R.confusions = clone(src.confusions);
      fermerFeuille(); appliquerAffichage(true);
      if (location.hash === '#/reglages') vueReglages();
      toast(el.dataset.p === 'conseilles' ? 'Réglages conseillés appliqués.' : 'Réglages par défaut rétablis.');
    },
    'essayer-voix': function () { Voix.dire('Bonjour ! Je vais lire avec vous.', { vitesse: S.reglages.vitesse, voix: S.reglages.voix }); },
    exporter: exporter,
    'tout-effacer': function () {
      confirmer('Effacer tous vos textes et réglages de ce téléphone ? Faites d\'abord une sauvegarde si besoin.', 'Tout effacer', true).then(function (oui) {
        if (!oui) return;
        DB.toutEffacer(['passes']).then(charger).then(function () { appliquerTheme(S.reglages.theme); toast('Tout est effacé.'); aller('#/'); });
      });
    },
    installer: installer,
    retour: function (el) { var c = el.dataset.cible; if (c) location.hash = c; }
  };

  function brancher() {
    document.addEventListener('click', function (e) {
      var mot = e.target.closest('.page .mot');
      if (mot && S.lecture && mot.closest('#page')) { toucherMot(mot); return; }
      var el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      var f = ACTIONS[el.dataset.action];
      if (f) { e.preventDefault(); f(el, e); }
    });
    document.addEventListener('input', function (e) {
      var el = e.target;
      if (el.id === 'e-texte' || el.id === 'e-titre') {
        if (el.id === 'e-texte') $('#e-compte').textContent = compteMots(el.value);
        clearTimeout(minuteurBrouillon); minuteurBrouillon = setTimeout(memoriserBrouillon, 500);
        return;
      }
      if (el.dataset.plage) {
        S.reglages[el.dataset.plage] = +el.value;
        var o = $('#o-' + el.dataset.plage); if (o) o.textContent = formater(el.dataset.plage, el.value);
        appliquerAffichage();
      }
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el.id === 'f-import' && el.files && el.files[0]) { importer(el.files[0]); el.value = ''; return; }
      if ((el.id === 'f-photo' || el.id === 'f-image') && el.files && el.files[0]) { lirePhoto(el.files[0]); el.value = ''; return; }
      if (el.dataset.cf) { S.reglages.confusions[el.dataset.cf] = el.checked; appliquerAffichage(true); return; }
      if (el.hasAttribute('data-voix')) { S.reglages.voix = el.value; sauver('reglages', S.reglages); return; }
      if (el.type === 'radio') {
        var R = S.reglages;
        if (el.name === 'police') { R.police = el.value; appliquerAffichage(); }
        else if (el.name === 'fond') { R.fond = el.value; appliquerAffichage(true); }
        else if (el.name === 'vitesse') { R.vitesse = +el.value; sauver('reglages', R); }
        else if (el.name === 'theme') { R.theme = el.value; appliquerTheme(el.value); sauver('reglages', R); }
        if (location.hash === '#/reglages' && (el.name === 'police' || el.name === 'fond')) { var a = $('.apercu-page'); if (a) { a.className = classePage() + ' apercu-page'; } }
      }
    });
    document.addEventListener('submit', function (e) {
      var f = e.target;
      if (f.dataset.form === 'pass') { e.preventDefault(); activer(f.code.value); }
      if (f.dataset.form === 'ecrire') {
        e.preventDefault();
        var v = lireFormulaire();
        if (!/\S/.test(v.texte)) { toast('Écrivez ou collez d\'abord un texte.'); f.texte.focus(); return; }
        if (v.id) { enregistrerTexte(true); return; }
        memoriserBrouillon().then(function () { aller('#/lire/brouillon'); });
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && feuilleOuverte) { fermerFeuille(); return; }
      if (!S.lecture || feuilleOuverte || /input|textarea|select/i.test(e.target.tagName)) return;
      if (S.reglages.regle && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); deplacerRegle(e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); ACTIONS.lire(); }
    });
    $('#retour').addEventListener('click', function () { ACTIONS.retour(this); });
    $('#installer').addEventListener('click', installer);
    window.addEventListener('hashchange', router);
    window.addEventListener('resize', function () { if (S.reglages.regle && $('#regle')) placerRegle(); });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; majInstall(); });
    window.addEventListener('appinstalled', function () { invite = null; majInstall(); toast('Application installée.'); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && S.lecture && S.lecture.joue) pause(); });
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
    var p = new URLSearchParams(location.search);
    if (p.get('o') && p.get('t')) history.replaceState(null, '', location.pathname + '#/pass?code=' + encodeURIComponent('?o=' + p.get('o') + '&t=' + p.get('t')));
    charger().then(function () { appliquerTheme(S.reglages.theme); router(); }).catch(function (e) {
      vue('<section class="carte alerte rouge"><h1>Démarrage impossible</h1><p>' + esc(e && e.message || e) + '</p><p>Sur iPhone, quittez la navigation privée. Sinon, mettez à jour votre navigateur.</p></section>');
    });
    serviceWorker();
  }
  window.LFApp = { etat: S, version: VERSION };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
