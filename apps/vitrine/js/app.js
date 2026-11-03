/* Teranga Vitrine — interface (sans framework). Données et photos : IndexedDB du téléphone uniquement. */
(function () {
  'use strict';
  var VT = window.VT, DB = window.DB, IM = window.VTImages;
  var VERSION = '1.0.0';
  var URL_ACHAT = '../../boutique/' + VT.PASS.slug + '.html';
  var PRIX_PASS = '2 000 F';
  var MAX_PHOTOS = 4;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var f = VT.f;
  function svg(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + p + '</svg>'; }
  var ICO = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'), x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    photo: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    galerie: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
    image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
    etiquette: svg('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.6"/>'),
    commande: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    lien: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    wa: svg('<path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5z"/><path d="M8.5 9.5c.3 2.6 2.4 4.8 5 5.2l1.3-1.3 2 .9"/>'),
    partager: svg('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>'),
    telecharger: svg('<path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16"/>'),
    copier: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    modifier: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), supprimer: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    ok: svg('<path d="m5 12 5 5 9-10"/>'), cadenas: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    etoile: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    boutique: svg('<path d="M4 9h16l-1 11H5zM8 9V7a4 4 0 0 1 8 0v2"/>'), chevron: svg('<path d="m9 6 6 6-6 6"/>'),
    sauvegarde: svg('<path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
    installer: svg('<path d="M12 3v11m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="4" rx="1"/>'),
    pdf: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    ventes: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'), argent: svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>'),
    camion: svg('<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>')
  };

  // ---------- État ----------
  var STUDIO_DEFAUT = { format: 'carre', n: 1, modele: 'elegant', couleur: IM.COULEURS[0].v, titre: '', opt: { details: true, stock: true, numero: true }, choix: [] };
  var S = { profil: {}, reglages: { studio: JSON.parse(JSON.stringify(STUDIO_DEFAUT)) }, produits: [], commandes: [], passes: [], sauvegarde: null };
  function etat() { return VT.etatPass(S.passes); }
  function passActif() { return etat().actif; }
  function modeleLibre(id) { return passActif() || IM.modele(id).gratuit; }

  function charger() {
    return Promise.all([DB.lire('kv', 'profil'), DB.lire('kv', 'reglages'), DB.lire('kv', 'passes'), DB.lire('kv', 'sauvegarde'), DB.tout('produits'), DB.tout('commandes')])
      .then(function (r) {
        S.profil = r[0] || {};
        S.reglages = r[1] || { studio: JSON.parse(JSON.stringify(STUDIO_DEFAUT)) };
        S.reglages.studio = Object.assign(JSON.parse(JSON.stringify(STUDIO_DEFAUT)), S.reglages.studio || {});
        S.passes = r[2] || []; S.sauvegarde = r[3] || null; S.produits = r[4] || []; S.commandes = r[5] || [];
      });
  }
  var persistance = false;
  function demanderPersistance() {
    if (persistance) return; persistance = true;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}
  }

  // ---------- Petits composants ----------
  var minuteurToast = 0, toastDepuis = 0;
  function toast(msg, action) {
    toastDepuis = Date.now();
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
    fermerFeuille(); cacherToast();
    var fond = document.createElement('div');
    fond.className = 'feuille-fond';
    fond.innerHTML = '<div class="feuille" role="dialog" aria-modal="true" aria-labelledby="feuille-titre"><div class="feuille-tete"><h2 id="feuille-titre">' +
      esc(titre) + '</h2><button type="button" class="icone-btn" data-fermer aria-label="Fermer">' + ICO.x + '</button></div><div class="feuille-corps">' + contenu + '</div></div>';
    document.body.appendChild(fond);
    document.body.classList.add('fige');
    feuilleOuverte = { el: fond, avant: document.activeElement };
    fond.addEventListener('click', function (e) { if (e.target === fond || e.target.closest('[data-fermer]')) fermerFeuille(); });
    var f1 = fond.querySelector('.feuille-corps input:not([type=hidden]):not(.vh), .feuille-corps button, .feuille-corps a');
    (f1 || fond.querySelector('[data-fermer]')).focus({ preventScroll: true });
    if (init) init(fond.querySelector('.feuille'));
    remplirPhotos(fond);
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
      var obs = new MutationObserver(function () { if (!fini && !(feuilleOuverte && document.body.contains(feuilleOuverte.el))) { obs.disconnect(); fini = true; ok(false); } });
      obs.observe(document.body, { childList: true });
    });
  }
  function telecharger(blob, nom) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nom; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
  }
  function peutPartagerFichier(fichier) {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [fichier] })); } catch (e) { return false; }
  }
  // Partage d'un fichier (feuille de partage du téléphone) ; sinon téléchargement
  function partagerFichier(blob, nom, type) {
    var fichier;
    try { fichier = new File([blob], nom, { type: type }); } catch (e) { fichier = null; }
    if (fichier && peutPartagerFichier(fichier)) {
      return navigator.share({ files: [fichier] }).then(function () { return 'partage'; }).catch(function (e) {
        if (e && e.name === 'AbortError') return 'annule';
        telecharger(blob, nom); return 'telecharge';
      });
    }
    telecharger(blob, nom);
    return Promise.resolve('telecharge');
  }
  function copier(texte) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(texte).catch(function () { return copierVieux(texte); });
    return copierVieux(texte);
  }
  function copierVieux(texte) {
    return new Promise(function (ok, ko) {
      var t = document.createElement('textarea'); t.value = texte; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      var r = false; try { r = document.execCommand('copy'); } catch (e) {}
      t.remove(); if (r) ok(); else ko(new Error('copie'));
    });
  }
  function verrou() { return '<span class="verrou" title="Pass Vitrine">' + ICO.cadenas + '<span class="vh">(Pass Vitrine)</span></span>'; }
  function vide(texte, lien, libelle, ico) {
    return '<div class="vide">' + (ico || '') + '<p>' + esc(texte) + '</p>' + (lien ? '<a class="btn plein" href="' + lien + '">' + esc(libelle) + '</a>' : '') + '</div>';
  }
  function champ(label, nom, valeur, o) {
    o = o || {};
    var id = 'c-' + nom, attrs = ' id="' + id + '" name="' + nom + '"' + (o.requis ? ' required' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') +
      (o.auto ? ' autocomplete="' + o.auto + '"' : ' autocomplete="off"') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.mode ? ' inputmode="' + o.mode + '"' : '') +
      (o.liste ? ' list="' + o.liste + '"' : '') + (o.classe ? ' class="' + o.classe + '"' : '');
    var c = o.zone ? '<textarea' + attrs + ' rows="' + (o.lignes || 3) + '">' + esc(valeur) + '</textarea>'
      : '<input type="' + (o.type || 'text') + '"' + attrs + ' value="' + esc(valeur) + '">';
    return '<div class="champ"><label for="' + id + '">' + esc(label) + (o.facultatif ? ' <span class="petit">(facultatif)</span>' : '') + '</label>' + c + (o.aide ? '<small>' + esc(o.aide) + '</small>' : '') + '</div>';
  }
  function valeurs(form) {
    var v = {};
    $$('input,select,textarea', form).forEach(function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') v[el.name] = el.checked; else if (el.type !== 'file') v[el.name] = el.value.trim();
    });
    return v;
  }
  function nombreSaisi(v) { var n = VT.lireEntier(v); return n === null || isNaN(n) ? '' : VT.formatNombre(n); }

  // ---------- Photos (vignettes chargées après l'affichage) ----------
  var urlsMini = {}, urlsGrandes = {};
  function remplirPhotos(racine) {
    $$('img[data-photo]', racine || document).forEach(function (img) {
      var id = img.dataset.photo, grande = img.dataset.taille === 'grande', cache = grande ? urlsGrandes : urlsMini;
      if (cache[id]) { img.src = cache[id]; return; }
      DB.lire('photos', id).then(function (ph) {
        var b = ph && (grande ? ph.image : (ph.mini || ph.image));
        if (!b) return;
        if (!cache[id]) cache[id] = URL.createObjectURL(b);
        img.src = cache[id];
      }).catch(function () {});
    });
  }
  function oublierPhoto(id) {
    [urlsMini, urlsGrandes].forEach(function (c) { if (c[id]) { URL.revokeObjectURL(c[id]); delete c[id]; } });
    delete bitmaps[id];
  }
  function vignette(p, o) {
    o = o || {};
    var id = p && p.photos && p.photos[o.index || 0];
    var h = '<span class="vignette' + (o.classe ? ' ' + o.classe : '') + '">';
    if (id) h += '<img data-photo="' + esc(id) + '"' + (o.grande ? ' data-taille="grande"' : '') + ' alt="' + esc(o.alt || '') + '" loading="lazy">';
    else h += '<span class="initiale" aria-hidden="true">' + esc(String(p && p.nom || '?').trim().charAt(0).toUpperCase()) + '</span>';
    if (o.etiquettes && p) {
      var e = VT.etatStock(p);
      if (e === 'epuise') h += '<span class="etiquette epuise">Épuisé</span>';
      else if (e === 'bas') h += '<span class="etiquette bas">Plus que ' + p.stock + '</span>';
      if (VT.enPromo(p)) h += '<span class="etiquette promo">-' + VT.remisePct(p) + ' %</span>';
    }
    return h + '</span>';
  }
  function prixHTML(p) {
    return '<span class="prix-l"><b>' + f(VT.prixVente(p)) + '</b>' + (VT.enPromo(p) ? '<s>' + f(p.prix) + '</s>' : '') + '</span>';
  }
  // Réduction d'une photo prise ou choisie : image 1080 px et vignette 420 px (JPEG)
  function reduirePhoto(fichier) {
    if (!fichier || (fichier.type && !/^image\//.test(fichier.type))) return Promise.reject(new Error('Choisissez une photo (JPEG ou PNG).'));
    return IM.chargerImage(fichier).then(function (img) {
      if (!img) throw new Error('Photo illisible. Essayez une autre photo.');
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      function vers(max, q) {
        var k = Math.min(1, max / Math.max(iw, ih)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(iw * k)); c.height = Math.max(1, Math.round(ih * k));
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        return IM.versBlob(c, 'image/jpeg', q);
      }
      return Promise.all([vers(1080, 0.85), vers(420, 0.8)]).then(function (r) { if (img.close) img.close(); return { image: r[0], mini: r[1] }; });
    });
  }

  // ---------- Cadre ----------
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
    document.body.classList.toggle('toast-haut', o.nav === 'studio');
    var fab = $('#fab');
    fab.hidden = !o.fab;
    if (o.fab) { fab.dataset.vers = o.fab; fab.setAttribute('aria-label', o.fabLabel || 'Ajouter'); }
    document.title = o.titre + ' · Teranga Vitrine';
    majInstall();
  }
  function vue(html) {
    var v = $('#vue');
    v.innerHTML = html;
    window.scrollTo(0, 0);
    v.focus({ preventScroll: true });
    remplirPhotos(v);
  }

  // ---------- Routeur ----------
  var ROUTES = [
    [/^\/?$/, vueAccueil], [/^\/bienvenue$/, vueBienvenue],
    [/^\/produits$/, vueProduits], [/^\/produit\/([\w-]+)$/, vueProduit], [/^\/produit-modifier\/([\w-]+)$/, vueProduitForm],
    [/^\/studio$/, vueStudio], [/^\/catalogue$/, vueCatalogue],
    [/^\/commandes$/, vueCommandes], [/^\/commande\/([\w-]+)$/, vueCommande], [/^\/commande-modifier\/([\w-]+)$/, vueCommandeForm],
    [/^\/ventes$/, vueVentes], [/^\/lien$/, vueLien],
    [/^\/reglages$/, vueReglages], [/^\/boutique$/, vueBoutique], [/^\/pass$/, vuePass], [/^\/sauvegarde$/, vueSauvegarde]
  ];
  var E = null, retourForce = false;
  function router() {
    if (retourForce) { retourForce = false; return; }
    var h = location.hash.replace(/^#/, ''), q = '', i = h.indexOf('?');
    if (i >= 0) { q = h.slice(i + 1); h = h.slice(0, i); }
    var params = new URLSearchParams(q);
    if (E && E.sale && E.route !== h) {
      var ancien = E.route;
      if (!window.confirm('Quitter sans enregistrer ?')) { retourForce = true; history.pushState(null, '', '#' + ancien); retourForce = false; return; }
    }
    if (!E || E.route !== h) E = null;
    fermerFeuille();
    if (Date.now() - toastDepuis > 1500) cacherToast();
    if (!S.profil.nom && ['/bienvenue', '/sauvegarde', '/pass'].indexOf(h) < 0) { location.replace('#/bienvenue'); return; }
    for (var k = 0; k < ROUTES.length; k++) {
      var m = h.match(ROUTES[k][0]);
      if (m) { ROUTES[k][1](m[1], params); return; }
    }
    location.replace('#/');
  }
  function aller(h) { if (location.hash === h) router(); else location.hash = h; }
  function trouver(liste, id) { for (var i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i]; return null; }
  function produit(id) { return trouver(S.produits, id); }
  function produitsTries() { return S.produits.slice().sort(function (a, b) { return (b.cree || '').localeCompare(a.cree || ''); }); }

  // ---------- Bienvenue / boutique ----------
  function optionsPays(sel) {
    return VT.PAYS.map(function (p) { return '<option value="' + p.code + '"' + (p.code === sel ? ' selected' : '') + '>+' + p.code + ' ' + esc(p.nom) + '</option>'; }).join('');
  }
  function champsBoutique(P) {
    var local = P.numero ? VT.numeroCourt(P.numero, P.pays || '221') : '';
    return champ('Nom de votre boutique', 'nom', P.nom || '', { requis: true, max: 60, auto: 'organization', ph: 'Ex. : Awa Couture, Chez Fatou, Bazin Prestige' }) +
      '<div class="champ"><span class="label" id="l-numero">Votre numéro WhatsApp</span><div class="tel"><select id="c-pays" name="pays" aria-label="Pays">' + optionsPays(P.pays || '221') +
      '</select><input type="tel" id="c-numero" name="numero" aria-labelledby="l-numero" inputmode="tel" autocomplete="tel" placeholder="77 123 45 67" value="' + esc(local) + '"></div>' +
      '<small>Vos clientes vous écriront sur ce numéro. Il reste sur votre téléphone.</small></div>';
  }
  function lireBoutique(form, cible) {
    var v = valeurs(form), num = VT.normaliserNumero(v.numero, v.pays);
    if (!v.nom) return 'Indiquez le nom de votre boutique.';
    if (!num) return 'Numéro WhatsApp non reconnu. Exemple : 77 123 45 67.';
    cible.nom = v.nom.slice(0, 60); cible.pays = v.pays || '221'; cible.numero = num;
    ['slogan', 'lieu', 'livraison'].forEach(function (k) { if (v[k] !== undefined) cible[k] = v[k].slice(0, 120); });
    return null;
  }
  function vueBienvenue() {
    cadre({ titre: 'Bienvenue', edition: true });
    vue('<section class="bienvenue"><img src="icons/icon-192.png" alt="" width="84" height="84"><h1>Teranga Vitrine</h1>' +
      '<p class="lead">Votre vitrine pour vendre sur WhatsApp.</p>' +
      '<ul class="atouts">' + ['Vos produits en photo, avec prix, tailles, couleurs et stock', 'De belles images pour votre statut, prêtes en un geste', 'Un lien de commande et un catalogue PDF à partager', 'Vos commandes, ce qui est payé, ce qui est livré, vos meilleures ventes', 'Tout reste sur votre téléphone, même sans Internet']
        .map(function (x) { return '<li>' + ICO.ok + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<form class="carte" data-form="bienvenue">' + champsBoutique({}) + '<p class="erreur" id="erreur-bienvenue" hidden></p>' +
      '<button type="submit" class="btn plein large geant">Commencer</button></form>' +
      '<p class="petit"><a href="#/sauvegarde">Restaurer une sauvegarde</a> · <a href="#/pass">J\'ai déjà un pass</a></p></section>');
  }
  function vueBoutique() {
    var P = S.profil;
    cadre({ titre: 'Ma boutique', retour: '#/reglages', nav: 'reglages' });
    vue('<form class="carte" data-form="boutique">' + champsBoutique(P) +
      champ('Petite phrase', 'slogan', P.slogan || '', { facultatif: true, max: 80, ph: 'Ex. : Mode femme et enfant', aide: 'Affichée sous vos catalogues.' }) +
      champ('Quartier ou ville', 'lieu', P.lieu || '', { facultatif: true, max: 60, ph: 'Ex. : Parcelles Assainies, Dakar' }) +
      champ('Livraison', 'livraison', P.livraison || '', { facultatif: true, max: 120, ph: 'Ex. : Livraison 1 000 F dans Dakar' }) +
      '<p class="erreur" id="erreur-boutique" hidden></p><button type="submit" class="btn plein large">Enregistrer</button></form>');
  }

  // ---------- Accueil ----------
  function bandeauPass() {
    var e = etat();
    if (e.rappel) return '<div class="bandeau" id="rappel-pass">' + ICO.info + '<p>Votre Pass Vitrine se termine dans <b>' + e.joursRestants + ' jour' + (e.joursRestants > 1 ? 's' : '') +
      '</b> (le ' + esc(VT.dateFr(e.fin.slice(0, 10))) + ').</p><a class="btn plein" href="#/pass">Renouveler</a></div>';
    if (e.expire) return '<div class="bandeau" id="rappel-pass">' + ICO.info + '<p>Votre Pass Vitrine est terminé. Vos produits et commandes restent là ; renouvelez pour retrouver les 6 modèles et les produits illimités.</p><a class="btn plein" href="#/pass">Renouveler</a></div>';
    return '';
  }
  function vueAccueil() {
    cadre({ titre: S.profil.nom || 'Teranga Vitrine', nav: 'accueil' });
    var auj = VT.dateISO(), t = VT.totauxPeriode(S.commandes, auj, auj), tout = VT.totauxPeriode(S.commandes);
    var top = VT.meilleuresVentes(S.commandes, VT.ajouterJours(auj, -29), auj).slice(0, 3);
    var bas = produitsTries().filter(function (p) { var e = VT.etatStock(p); return e === 'epuise' || e === 'bas'; });
    var jour = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    var h = '<section class="salut"><div><h1>' + esc(S.profil.nom) + '</h1><p>' + esc(jour.charAt(0).toUpperCase() + jour.slice(1)) + '</p></div></section>';
    h += bandeauPass();
    h += '<div class="kpis" id="kpis-jour">' +
      '<a class="kpi" href="#/commandes" id="kpi-commandes"><span>Commandes du jour</span><strong>' + t.n + '</strong><small>' + t.articles + ' article' + (t.articles > 1 ? 's' : '') + '</small></a>' +
      '<a class="kpi" href="#/ventes" id="kpi-ventes"><span>Ventes du jour</span><strong>' + f(t.total) + '</strong><small>commandes du jour</small></a>' +
      '<a class="kpi bon" href="#/ventes" id="kpi-encaisse"><span>Encaissé aujourd\'hui</span><strong>' + f(t.encaisse) + '</strong><small>reste ' + f(t.reste) + '</small></a>' +
      '<a class="kpi' + (tout.aLivrer ? ' alerte' : '') + '" href="#/commandes?f=livrer" id="kpi-livrer"><span>À livrer</span><strong>' + tout.aLivrer + '</strong><small>' + (tout.reste ? 'à encaisser : ' + f(tout.reste) : 'tout est encaissé') + '</small></a></div>';
    h += '<div class="actions-grandes">' +
      '<a class="action-grande principale" href="#/produit-modifier/nouveau" id="act-produit">' + ICO.photo + '<span>Ajouter un produit<small>Photo, prix, stock</small></span></a>' +
      '<a class="action-grande" href="#/studio" id="act-image">' + ICO.image + '<span>Créer une image<small>Pour le statut</small></span></a>' +
      '<a class="action-grande" href="#/commande-modifier/nouveau" id="act-commande">' + ICO.commande + '<span>Nouvelle commande<small>Le stock se met à jour</small></span></a>' +
      '<a class="action-grande" href="#/lien" id="act-lien">' + ICO.lien + '<span>Lien de commande<small>À mettre en statut</small></span></a></div>';
    h += bandeauInstall();
    h += '<section class="carte"><div class="titre-ligne"><h2>Meilleures ventes (30 jours)</h2><a href="#/ventes">Tout voir</a></div>' + (top.length ? '<ol class="classement" id="top-accueil">' + top.map(ligneClassement(top[0].qte)).join('') + '</ol>'
      : '<p class="petit">Vos meilleures ventes apparaîtront ici dès vos premières commandes.</p>') + '</section>';
    if (bas.length) h += '<section class="carte" id="stock-bas"><h2>Stock à surveiller</h2><div class="liste">' + bas.slice(0, 6).map(function (p) {
      return '<a class="ligne-liste" href="#/produit/' + esc(p.id) + '"><span class="ll-g"><strong>' + esc(p.nom) + '</strong><span>' + esc(VT.categorie(p.categorie).nom) + '</span></span><span class="ll-d"><strong class="' + (p.stock <= 0 ? 'du' : '') + '">' +
        (p.stock <= 0 ? 'Épuisé' : 'Plus que ' + p.stock) + '</strong></span></a>';
    }).join('') + '</div></section>';
    if (!passActif()) {
      var n = S.produits.length, pct = Math.min(100, Math.round(n / VT.PRODUITS_GRATUITS * 100));
      h += '<section class="carte" id="quota"><h2>Version gratuite</h2><p>' + n + ' / ' + VT.PRODUITS_GRATUITS + ' produits · 2 modèles d\'images sur 6</p><div class="jauge" aria-hidden="true"><span style="width:' + pct + '%"></span></div>' +
        '<a class="btn plein large" href="#/pass">' + ICO.etoile + 'Pass Vitrine : ' + PRIX_PASS + ' pour 12 mois</a></section>';
    }
    vue(h);
  }
  function ligneClassement(max) {
    return function (x) {
      var p = x.produitId && produit(x.produitId);
      return '<li>' + (p ? vignette(p) : '<span class="vignette"><span class="initiale">' + esc(x.nom.charAt(0)) + '</span></span>') + '<span class="nom"><strong>' + esc(x.nom) + '</strong><span class="barre" style="width:' +
        Math.max(6, Math.round(x.qte / (max || 1) * 100)) + '%"></span></span><span class="val"><b>' + x.qte + ' vendu' + (x.qte > 1 ? 's' : '') + '</b><small>' + f(x.montant) + '</small></span></li>';
    };
  }

  // ---------- Produits ----------
  var filtreProduits = { q: '', cat: '' };
  function vueProduits() {
    cadre({ titre: 'Mes produits', nav: 'produits', fab: '#/produit-modifier/nouveau', fabLabel: 'Ajouter un produit' });
    if (!S.produits.length) { vue(vide('Ajoutez votre premier produit : prenez-le en photo, indiquez le prix et le stock.', '#/produit-modifier/nouveau', 'Ajouter un produit', ICO.photo)); return; }
    var cats = VT.CATEGORIES.filter(function (c) { return S.produits.some(function (p) { return p.categorie === c.id; }); });
    var h = '<div class="recherche"><label class="vh" for="q-produits">Rechercher un produit</label><input type="search" id="q-produits" placeholder="Rechercher un produit…" value="' + esc(filtreProduits.q) + '"></div>';
    if (cats.length > 1) h += '<div class="puces" role="group" aria-label="Catégorie"><button type="button" class="puce" data-action="filtre-cat" data-v="" aria-pressed="' + (!filtreProduits.cat) + '">Tous</button>' +
      cats.map(function (c) { return '<button type="button" class="puce" data-action="filtre-cat" data-v="' + c.id + '" aria-pressed="' + (filtreProduits.cat === c.id) + '">' + esc(c.nom) + '</button>'; }).join('') + '</div>';
    h += '<div class="produits" id="liste-produits"></div>';
    h += '<div class="rang-btn"><a class="btn sec" href="#/catalogue">' + ICO.pdf + 'Catalogue PDF</a><a class="btn sec" href="#/studio">' + ICO.image + 'Créer une image</a></div>';
    if (!passActif()) h += '<p class="petit centre">' + S.produits.length + ' / ' + VT.PRODUITS_GRATUITS + ' produits en version gratuite. <a href="#/pass">Pass Vitrine</a></p>';
    vue(h);
    $('#q-produits').addEventListener('input', function () { filtreProduits.q = this.value; listerProduits(); });
    listerProduits();
  }
  function listerProduits() {
    var q = VT.sansAccents(filtreProduits.q).trim();
    var l = produitsTries().filter(function (p) {
      return (!filtreProduits.cat || p.categorie === filtreProduits.cat) && (!q || VT.sansAccents(p.nom + ' ' + (p.tailles || []).join(' ') + ' ' + (p.couleurs || []).join(' ') + ' ' + (p.description || '')).indexOf(q) >= 0);
    });
    var z = $('#liste-produits');
    z.innerHTML = l.length ? l.map(function (p) {
      return '<a class="produit" href="#/produit/' + esc(p.id) + '">' + vignette(p, { etiquettes: true }) + '<span class="produit-t"><strong>' + esc(p.nom) + '</strong>' + prixHTML(p) + '</span></a>';
    }).join('') : '<p class="vide" style="grid-column:1/-1">Aucun produit ne correspond.</p>';
    remplirPhotos(z);
    $$('.puce[data-action="filtre-cat"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === filtreProduits.cat)); });
  }
  function ventesProduit(id) {
    var q = 0, m = 0, n = 0;
    S.commandes.forEach(function (c) { var vu = false; (c.lignes || []).forEach(function (l) { if (l.produitId === id) { q += l.qte; m += l.qte * l.prix; vu = true; } }); if (vu) n++; });
    return { qte: q, montant: m, commandes: n };
  }
  function vueProduit(id) {
    var p = produit(id);
    if (!p) { location.replace('#/produits'); return; }
    cadre({ titre: p.nom, retour: '#/produits', nav: 'produits' });
    var v = ventesProduit(p.id), cat = VT.categorie(p.categorie);
    var h = '<div class="galerie">' + ((p.photos && p.photos.length) ? p.photos.map(function (ph, i) { return vignette(p, { index: i, grande: true, alt: p.nom + ' (photo ' + (i + 1) + ')' }); }).join('') : vignette(p)) + '</div>';
    h += '<section class="fiche-t"><h1>' + esc(p.nom) + '</h1>' + prixHTML(p) + (VT.enPromo(p) ? ' <span class="badge b-paye">Promo -' + VT.remisePct(p) + ' %</span>' : '') +
      '<div class="infos"><span class="info">' + esc(cat.nom) + '</span>' + (p.tailles || []).map(function (t) { return '<span class="info">' + esc(t) + '</span>'; }).join('') +
      (p.couleurs || []).map(function (c) { var hx = VT.couleurHex(c); return '<span class="info">' + (hx && hx !== 'multi' ? '<span class="pastille" style="background:' + hx + '"></span>' : '') + esc(c) + '</span>'; }).join('') + '</div>' +
      (p.description ? '<p>' + esc(p.description) + '</p>' : '') + '</section>';
    h += '<section class="carte"><div class="stock-ligne"><div><h2 style="margin:0">Stock</h2><span class="petit" id="stock-etat">' + (VT.suiviStock(p) ? (p.stock <= 0 ? 'Épuisé' : p.stock + ' en stock') : 'Stock non compté') + '</span></div>' +
      (VT.suiviStock(p) ? '<div class="stepper"><button type="button" data-action="stock" data-d="-1" aria-label="Retirer une pièce">−</button><input id="stock-valeur" inputmode="numeric" aria-label="Stock" value="' + p.stock + '" readonly><button type="button" data-action="stock" data-d="1" aria-label="Ajouter une pièce">+</button></div>' : '') +
      '</div><p class="petit">Vendu : <b>' + v.qte + '</b> pièce' + (v.qte > 1 ? 's' : '') + ' (' + f(v.montant) + ') en ' + v.commandes + ' commande' + (v.commandes > 1 ? 's' : '') + '.</p></section>';
    h += '<a class="btn wa large geant" href="#/studio?p=' + esc(p.id) + '" id="btn-image-produit">' + ICO.image + 'Créer une image pour le statut</a>';
    h += '<div class="actions-sec"><button type="button" class="btn-action" data-action="lien-produit" data-id="' + esc(p.id) + '">' + ICO.lien + 'Lien de commande</button>' +
      '<a class="btn-action" href="#/commande-modifier/nouveau?p=' + esc(p.id) + '">' + ICO.commande + 'Nouvelle commande</a>' +
      '<a class="btn-action" href="#/produit-modifier/' + esc(p.id) + '">' + ICO.modifier + 'Modifier</a>' +
      '<button type="button" class="btn-action danger" data-action="produit-suppr" data-id="' + esc(p.id) + '">' + ICO.supprimer + 'Supprimer</button></div>';
    vue(h);
  }
  function feuilleLien(p) {
    var P = S.profil;
    if (!P.numero) return toast('Ajoutez d\'abord votre numéro WhatsApp dans Ma boutique.');
    var msg = VT.messageCommande(P, p), lien = VT.lienWhatsApp(P.numero, msg);
    feuille('Lien de commande', '<p>Quand une cliente touche ce lien, WhatsApp s\'ouvre vers <b>' + esc(VT.afficherNumero(P.numero)) + '</b> avec ce message :</p><div class="bulle-wa" id="apercu-message">' + esc(msg) + '</div>' +
      '<p class="sous-titre">Le lien</p><div class="lien-boite" id="lien-produit">' + esc(lien) + '</div>' +
      '<div class="rang-btn"><button type="button" class="btn plein" data-action="copier" data-texte="' + esc(lien) + '">' + ICO.copier + 'Copier le lien</button>' +
      '<a class="btn sec" href="' + esc(lien) + '" target="_blank" rel="noopener">' + ICO.wa + 'Essayer</a></div>' +
      '<p class="petit">Collez ce lien sous l\'image dans votre statut, ou envoyez-le à une cliente.</p>');
  }

  // ---------- Formulaire produit ----------
  var COULEURS_RAPIDES = ['Noir', 'Blanc', 'Rouge', 'Bleu', 'Vert', 'Jaune', 'Rose', 'Beige', 'Marron', 'Doré', 'Multicolore'];
  function vueProduitForm(id, params) {
    var nouveau = id === 'nouveau', p = nouveau ? null : produit(id);
    if (!nouveau && !p) { location.replace('#/produits'); return; }
    if (nouveau && !VT.peutAjouterProduit(S.produits.length, passActif())) {
      location.replace('#/produits');
      setTimeout(function () { proposerPass('La version gratuite garde jusqu\'à ' + VT.PRODUITS_GRATUITS + ' produits. Vos produits restent tous là ; avec le Pass Vitrine, ajoutez-en autant que vous voulez.'); }, 60);
      return;
    }
    var route = '/produit-modifier/' + id;
    if (!E || E.route !== route) {
      var base = p ? JSON.parse(JSON.stringify(p)) : { id: VT.nouvelId(), nom: '', categorie: 'vetements', prix: null, promo: null, stock: 1, tailles: [], couleurs: [], description: '', photos: [] };
      E = { route: route, nouveau: nouveau, p: base, photos: (base.photos || []).map(function (x) { return { id: x }; }), retirees: [], sale: false };
    }
    cadre({ titre: nouveau ? 'Nouveau produit' : 'Modifier le produit', retour: nouveau ? '#/produits' : '#/produit/' + id, nav: 'produits', edition: true });
    var q = E.p;
    var h = '<form data-form="produit" id="form-produit" novalidate>' +
      '<section class="carte"><h2>Photos</h2><div class="photos-edit" id="photos-edit"></div>' +
      '<div class="photos-boutons"><label class="btn plein" for="f-camera">' + ICO.photo + 'Prendre une photo</label><input type="file" id="f-camera" class="vh" accept="image/*" capture="environment" data-photos>' +
      '<label class="btn sec" for="f-galerie">' + ICO.galerie + 'Galerie</label><input type="file" id="f-galerie" class="vh" accept="image/*" multiple data-photos></div>' +
      '<p class="petit">Jusqu\'à ' + MAX_PHOTOS + ' photos. Elles sont réduites et gardées sur ce téléphone. Astuce : photographiez à la lumière du jour, sur un fond uni.</p></section>' +
      '<section class="carte"><h2>Le produit</h2>' + champ('Nom du produit', 'nom', q.nom, { requis: true, max: 80, ph: 'Ex. : Robe wax Ndèye' }) +
      '<div class="champ"><span class="label">Catégorie</span><div class="puces enroule" role="group" aria-label="Catégorie" id="cats">' + VT.CATEGORIES.map(function (c) {
        return '<button type="button" class="puce" data-action="cat" data-v="' + c.id + '" aria-pressed="' + (q.categorie === c.id) + '">' + esc(c.nom) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="grille2">' + champ('Prix (F CFA)', 'prix', q.prix != null ? VT.formatNombre(q.prix) : '', { mode: 'numeric', ph: '15 000', classe: 'grand-champ' }) +
      champ('Prix promo', 'promo', q.promo != null ? VT.formatNombre(q.promo) : '', { mode: 'numeric', ph: 'facultatif', classe: 'grand-champ' }) + '</div><p class="promo-info" id="promo-info" aria-live="polite"></p></section>' +
      '<section class="carte"><h2 id="t-tailles">Tailles ou formats</h2><div class="puces enroule" id="tailles" role="group" aria-labelledby="t-tailles"></div>' +
      '<div class="champ" style="display:flex;gap:8px;margin-top:6px"><label class="vh" for="c-taille-libre">Autre taille</label><input id="c-taille-libre" placeholder="Autre taille ou format…" maxlength="30"><button type="button" class="btn sec" data-action="ajout-option" data-cle="tailles">Ajouter</button></div></section>' +
      '<section class="carte"><h2 id="t-couleurs">Couleurs</h2><div class="puces enroule" id="couleurs" role="group" aria-labelledby="t-couleurs"></div>' +
      '<div class="champ" style="display:flex;gap:8px;margin-top:6px"><label class="vh" for="c-couleur-libre">Autre couleur</label><input id="c-couleur-libre" placeholder="Autre couleur…" maxlength="30"><button type="button" class="btn sec" data-action="ajout-option" data-cle="couleurs">Ajouter</button></div></section>' +
      '<section class="carte"><h2>Stock</h2><div class="stock-ligne"><span>Nombre de pièces</span><div class="stepper"><button type="button" data-action="pas-stock" data-d="-1" aria-label="Moins">−</button><input id="c-stock" name="stock" inputmode="numeric" aria-label="Nombre de pièces" value="' + (q.stock == null ? '' : q.stock) + '"><button type="button" data-action="pas-stock" data-d="1" aria-label="Plus">+</button></div></div>' +
      '<label class="interrupteur" style="margin-top:10px"><input type="checkbox" id="c-stockLibre" name="stockLibre"' + (q.stock == null && !E.nouveau ? ' checked' : '') + '> Je ne compte pas le stock (plats sur commande…)</label>' +
      '<p class="petit">Le stock baisse tout seul à chaque commande enregistrée.</p></section>' +
      '<section class="carte"><h2>Description <span class="petit">(facultatif)</span></h2><label class="vh" for="c-description">Description</label><textarea id="c-description" name="description" rows="3" maxlength="300" placeholder="Matière, coupe, conseils…">' + esc(q.description || '') + '</textarea></section>' +
      '<p class="erreur" id="erreur-produit" hidden></p>' +
      '<div class="barre-enreg"><div><small>Prix de vente</small><strong id="pv">—</strong></div><button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>';
    vue(h);
    rendrePhotosEdit(); rendreOptions(); majPrixForm();
    $('#c-stock').disabled = $('#c-stockLibre').checked;
  }
  function rendrePhotosEdit() {
    var z = $('#photos-edit'); if (!z) return;
    var h = E.photos.map(function (ph, i) {
      return '<div class="photo-edit"><img ' + (ph.mini ? 'src="' + esc(ph.url) + '"' : 'data-photo="' + esc(ph.id) + '"') + ' alt="Photo ' + (i + 1) + '">' + (i === 0 ? '<span class="principale">Principale</span>' : '') +
        '<button type="button" data-action="photo-retirer" data-i="' + i + '" aria-label="Retirer la photo ' + (i + 1) + '">' + ICO.x + '</button></div>';
    }).join('');
    if (E.photos.length < MAX_PHOTOS) h += '<label class="ajout-photo" for="f-camera">' + ICO.photo + '<span>Ajouter</span></label>';
    z.innerHTML = h;
    remplirPhotos(z);
  }
  function rendreOptions() {
    var cat = VT.categorie(E.p.categorie);
    var tailles = cat.tailles.concat(E.p.tailles.filter(function (t) { return cat.tailles.indexOf(t) < 0; }));
    var couleurs = COULEURS_RAPIDES.concat(E.p.couleurs.filter(function (c) { return COULEURS_RAPIDES.map(VT.sansAccents).indexOf(VT.sansAccents(c)) < 0; }));
    $('#tailles').innerHTML = tailles.map(function (t) { return '<button type="button" class="puce" data-action="option" data-cle="tailles" data-v="' + esc(t) + '" aria-pressed="' + (E.p.tailles.indexOf(t) >= 0) + '">' + esc(t) + '</button>'; }).join('') || '<span class="petit">Ajoutez une taille ci-dessous si besoin.</span>';
    $('#couleurs').innerHTML = couleurs.map(function (c) {
      var hx = VT.couleurHex(c), on = E.p.couleurs.map(VT.sansAccents).indexOf(VT.sansAccents(c)) >= 0;
      var pastille = hx === 'multi' ? '<span class="pastille" style="background:conic-gradient(#e63946,#f4a261,#2a9d8f,#264653,#e63946)"></span>' : hx ? '<span class="pastille" style="background:' + hx + '"></span>' : '';
      return '<button type="button" class="puce" data-action="option" data-cle="couleurs" data-v="' + esc(c) + '" aria-pressed="' + on + '">' + pastille + esc(c) + '</button>';
    }).join('');
    var t = $('#t-tailles'); if (t) t.textContent = cat.id === 'vetements' || cat.id === 'chaussures' ? 'Tailles' : 'Tailles ou formats';
  }
  function majPrixForm() {
    var prix = VT.lireEntier($('#c-prix').value), promo = VT.lireEntier($('#c-promo').value), info = $('#promo-info');
    var ok = prix > 0 && promo > 0 && promo < prix;
    info.textContent = ok ? 'Remise de ' + Math.round((1 - promo / prix) * 100) + ' % : affichée sur vos images.' : (promo > 0 && prix > 0 ? 'Le prix promo doit être plus petit que le prix.' : '');
    info.style.color = ok || !info.textContent ? '' : 'var(--danger)';
    $('#pv').textContent = prix > 0 ? f(ok ? promo : prix) : '—';
  }
  function ajouterPhotos(fichiers) {
    var l = Array.prototype.slice.call(fichiers || []).slice(0, MAX_PHOTOS - E.photos.length);
    if (!l.length) { if (fichiers && fichiers.length) toast('Maximum ' + MAX_PHOTOS + ' photos par produit.'); return Promise.resolve(); }
    toast('Préparation de la photo…');
    return l.reduce(function (pr, fi) {
      return pr.then(function () {
        return reduirePhoto(fi).then(function (r) {
          E.photos.push({ id: VT.nouvelId(), image: r.image, mini: r.mini, url: URL.createObjectURL(r.mini) });
          E.sale = true; rendrePhotosEdit();
        });
      });
    }, Promise.resolve()).then(function () { cacherToast(); }).catch(function (e) { toast(e.message || 'Photo illisible.'); });
  }
  function enregistrerProduit(form) {
    var v = valeurs(form), err = $('#erreur-produit');
    v.categorie = E.p.categorie; v.tailles = E.p.tailles; v.couleurs = E.p.couleurs; v.stockLibre = $('#c-stockLibre').checked;
    var r = VT.verifierProduit(v);
    if (!r.ok) { err.innerHTML = r.erreurs.map(esc).join('<br>'); err.hidden = false; err.scrollIntoView({ block: 'center' }); return; }
    if (E.nouveau && !VT.peutAjouterProduit(S.produits.length, passActif())) return proposerPass('La version gratuite garde jusqu\'à ' + VT.PRODUITS_GRATUITS + ' produits.');
    var p = Object.assign({}, E.p, r.produit), maint = new Date().toISOString();
    p.photos = E.photos.map(function (x) { return x.id; });
    if (E.nouveau) p.cree = maint;
    p.modifie = maint;
    var ops = [['produits', p]];
    E.photos.forEach(function (x) { if (x.image) ops.push(['photos', { id: x.id, image: x.image, mini: x.mini }]); });
    E.retirees.forEach(function (idp) { ops.push(['-', 'photos', idp]); });
    DB.lot(ops).then(function () {
      E.retirees.forEach(oublierPhoto);
      E.photos.forEach(function (x) { if (x.url) { urlsMini[x.id] = x.url; } });
      var i = S.produits.indexOf(produit(p.id));
      if (i >= 0) S.produits[i] = p; else S.produits.push(p);
      var nouveau = E.nouveau;
      E = null;
      demanderPersistance();
      toast(nouveau ? 'Produit ajouté.' : 'Produit enregistré.', nouveau ? { label: 'Créer une image', fn: function () { aller('#/studio?p=' + p.id); } } : null);
      location.replace('#/produit/' + p.id);
    }).catch(function (e) { err.textContent = 'Enregistrement impossible : ' + (e && e.message || e); err.hidden = false; });
  }
  function supprimerProduit(p) {
    confirmer('Supprimer « ' + p.nom + ' » et ses photos ? Les commandes passées restent dans l\'historique.', 'Supprimer', true).then(function (oui) {
      if (!oui) return;
      var ops = [['-', 'produits', p.id]].concat((p.photos || []).map(function (x) { return ['-', 'photos', x]; }));
      DB.lot(ops).then(function () {
        (p.photos || []).forEach(oublierPhoto);
        S.produits = S.produits.filter(function (x) { return x.id !== p.id; });
        S.reglages.studio.choix = S.reglages.studio.choix.filter(function (x) { return x !== p.id; });
        toast('Produit supprimé.'); location.replace('#/produits');
      });
    });
  }
  function changerStock(p, d) {
    var n = Math.max(0, (p.stock || 0) + d);
    if (n === p.stock) return;
    var q = Object.assign({}, p, { stock: n, modifie: new Date().toISOString() });
    DB.mettre('produits', q).then(function () {
      S.produits[S.produits.indexOf(p)] = q;
      $('#stock-valeur').value = n;
      $('#stock-etat').textContent = n <= 0 ? 'Épuisé' : n + ' en stock';
    });
  }

  // ---------- Studio d'images ----------
  var bitmaps = {}, dernierBlob = null, rendu = 0, minuteurRendu = 0;
  function ST() { return S.reglages.studio; }
  function sauverReglages() { return DB.mettre('kv', S.reglages, 'reglages').catch(function () {}); }
  function produitsDisponibles() { return produitsTries().filter(function (p) { return VT.etatStock(p) !== 'epuise'; }).concat(produitsTries().filter(function (p) { return VT.etatStock(p) === 'epuise'; })); }
  function choixValide() {
    var st = ST(), ids = st.choix.filter(function (x) { return !!produit(x); });
    var dispo = produitsDisponibles();
    if (st.n === 1) { if (!ids.length && dispo.length) ids = [dispo[0].id]; ids = ids.slice(0, 1); }
    else {
      ids = ids.slice(0, st.n);
      dispo.forEach(function (p) { if (ids.length < st.n && ids.indexOf(p.id) < 0) ids.push(p.id); });
    }
    st.choix = ids;
    return ids;
  }
  function vueStudio(_, params) {
    cadre({ titre: 'Images à partager', nav: 'studio' });
    if (!S.produits.length) { vue(vide('Ajoutez d\'abord un produit pour créer une belle image.', '#/produit-modifier/nouveau', 'Ajouter un produit', ICO.image)); return; }
    var st = ST();
    if (params && params.get('p') && produit(params.get('p'))) { st.n = 1; st.choix = [params.get('p')]; var pp = produit(params.get('p')); if (VT.enPromo(pp) && !st.titre) st.titre = 'Promo'; }
    if ([1, 4, 6, 9].indexOf(st.n) < 0) st.n = 1;
    if (st.n > S.produits.length) st.n = 1;
    choixValide();
    var h = '<div class="segments" role="group" aria-label="Format">' + [['carre', 'Carré 1:1'], ['statut', 'Statut 9:16']].map(function (x) {
      return '<button type="button" class="segment" data-action="st-format" data-v="' + x[0] + '" aria-pressed="' + (st.format === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    h += '<div class="segments" role="group" aria-label="Contenu">' + [[1, '1 produit'], [4, '4'], [6, '6'], [9, '9']].map(function (x) {
      return '<button type="button" class="segment" data-action="st-n" data-v="' + x[0] + '" aria-pressed="' + (st.n === x[0]) + '"' + (x[0] > S.produits.length ? ' disabled' : '') + '>' + (x[0] === 1 ? x[1] : 'Catalogue ' + x[1]) + '</button>';
    }).join('') + '</div>';
    h += '<div class="apercu' + (st.format === 'statut' ? ' statut' : '') + '" id="apercu"><canvas id="toile" width="1080" height="1080" role="img" aria-label="Aperçu de l\'image"></canvas><span class="attente" id="attente" hidden>…</span></div>';
    h += '<div class="barre-partage"><button type="button" class="btn wa" data-action="st-partager" id="btn-partager">' + ICO.wa + 'Partager</button><button type="button" class="btn sec" data-action="st-enregistrer" id="btn-enregistrer">' + ICO.telecharger + 'Enregistrer</button></div>';
    h += '<p class="etape"><b>1</b> ' + (st.n === 1 ? 'Choisissez le produit' : 'Choisissez ' + st.n + ' produits <span class="petit" id="compte-choix"></span>') + '</p><div class="choix-produits" id="choix-produits"></div>';
    h += '<p class="etape"><b>2</b> Modèle</p><div class="modeles" role="group" aria-label="Modèle">' + IM.MODELES.map(function (m) {
      return '<button type="button" class="modele" data-action="st-modele" data-v="' + m.id + '" aria-pressed="' + (st.modele === m.id) + '"><span class="mini mini-' + m.id + '" style="--c:' + esc(st.couleur) + '"></span><b>' + esc(m.nom) + '</b>' +
        (modeleLibre(m.id) ? '' : verrou()) + '</button>';
    }).join('') + '</div>';
    if (!passActif()) h += '<p class="petit">Élégant et Promo sont gratuits. Les 4 autres modèles viennent avec le <a href="#/pass">Pass Vitrine</a> (aperçu possible).</p>';
    h += '<p class="etape"><b>3</b> Couleur</p><div class="nuancier" role="group" aria-label="Couleur">' + IM.COULEURS.map(function (c) {
      return '<button type="button" class="nuance" data-action="st-couleur" data-v="' + c.v + '" style="background:' + c.v + '" aria-label="' + esc(c.nom) + '" aria-pressed="' + (st.couleur === c.v) + '"></button>';
    }).join('') + '<label class="nuance-libre" title="Autre couleur"><span class="vh">Autre couleur</span><input type="color" id="st-couleur-libre" value="' + esc(st.couleur) + '"></label></div>';
    h += '<p class="etape"><b>4</b> Texte</p><div class="champ"><label for="st-titre">Petit titre <span class="petit">(facultatif)</span></label><input id="st-titre" maxlength="40" value="' + esc(st.titre) + '" placeholder="Ex. : Nouvel arrivage"></div>' +
      '<div class="puces">' + ['Nouveauté', 'Promo', 'Arrivage', 'Stock limité', 'Livraison gratuite', 'Spécial Tabaski', 'Fait main'].map(function (x) { return '<button type="button" class="puce" data-action="st-titre" data-v="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') +
      '<button type="button" class="puce" data-action="st-titre" data-v="">Aucun</button></div>' +
      '<label class="interrupteur"><input type="checkbox" id="st-details"' + (st.opt.details ? ' checked' : '') + '> Tailles et couleurs</label>' +
      '<label class="interrupteur"><input type="checkbox" id="st-stock"' + (st.opt.stock ? ' checked' : '') + '> « Plus que 3 en stock »</label>' +
      '<label class="interrupteur"><input type="checkbox" id="st-numero"' + (st.opt.numero ? ' checked' : '') + '> Mon numéro WhatsApp</label>';
    h += '<section class="carte"><h2>Catalogue PDF</h2><p>Tous vos produits en PDF, avec un bouton « Commander » sur chaque produit.</p><a class="btn sec large" href="#/catalogue">' + ICO.pdf + 'Créer le catalogue PDF</a></section>';
    vue(h);
    rendreChoixProduits();
    dessinerApercu();
  }
  function rendreChoixProduits() {
    var st = ST(), z = $('#choix-produits'); if (!z) return;
    z.innerHTML = produitsDisponibles().map(function (p) {
      var k = st.choix.indexOf(p.id);
      return '<button type="button" class="choix-produit" data-action="st-produit" data-id="' + esc(p.id) + '" aria-pressed="' + (k >= 0) + '">' + (k >= 0 && st.n > 1 ? '<span class="ordre">' + (k + 1) + '</span>' : '') +
        vignette(p, { etiquettes: true }) + '<span>' + esc(p.nom) + '</span></button>';
    }).join('');
    remplirPhotos(z);
    var c = $('#compte-choix'); if (c) c.textContent = '(' + st.choix.length + ' / ' + st.n + ')';
  }
  function imageProduit(p) {
    var id = p.photos && p.photos[0];
    if (!id) return Promise.resolve(null);
    if (bitmaps[id]) return Promise.resolve(bitmaps[id]);
    return DB.lire('photos', id).then(function (ph) { return ph ? IM.chargerImage(ph.image || ph.mini) : null; }).then(function (b) {
      var ids = Object.keys(bitmaps);
      if (ids.length > 14) { var v = bitmaps[ids[0]]; if (v && v.close) v.close(); delete bitmaps[ids[0]]; }
      if (b) bitmaps[id] = b;
      return b;
    });
  }
  function optionsImage() {
    var st = ST(), P = S.profil;
    return { format: st.format, mise: st.n === 1 ? 'produit' : 'grille', modele: st.modele, couleur: st.couleur, boutique: P.nom, slogan: [P.slogan, P.livraison].filter(Boolean)[0] || P.lieu || '',
      numero: P.numero ? VT.numeroCourt(P.numero, P.pays || '221') : '', titre: st.titre, opt: st.opt, filigrane: !modeleLibre(st.modele) };
  }
  function dessinerApercu() {
    clearTimeout(minuteurRendu);
    minuteurRendu = setTimeout(function () {
      var toile = $('#toile'); if (!toile) return;
      var n = ++rendu, st = ST(), ids = choixValide();
      var att = $('#attente'); if (att) att.hidden = false;
      dernierBlob = null;
      Promise.all(ids.map(function (id) { var p = produit(id); return imageProduit(p).then(function (img) { return Object.assign({}, p, { img: img }); }); })).then(function (prods) {
        if (n !== rendu) return null;
        var o = optionsImage(); o.produits = prods;
        var c = document.createElement('canvas');
        return IM.dessiner(c, o).then(function () {
          if (n !== rendu || !$('#toile')) return;
          var t = $('#toile'); t.width = c.width; t.height = c.height; t.getContext('2d').drawImage(c, 0, 0);
          $('#apercu').classList.toggle('statut', st.format === 'statut');
          t.dataset.pret = String(n);
          return IM.versBlob(c, 'image/jpeg', 0.92).then(function (b) { if (n === rendu) { dernierBlob = b; var a = $('#attente'); if (a) a.hidden = true; t.dataset.blob = String(n); } });
        });
      }).catch(function (e) { toast('Image impossible : ' + (e && e.message || e)); });
    }, 90);
  }
  function nomImage() {
    var st = ST(), p = produit(st.choix[0]);
    var base = st.n === 1 && p ? p.nom : 'catalogue-' + st.n;
    return 'vitrine-' + (VT.sansAccents(base).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image') + '-' + (st.format === 'statut' ? 'statut' : 'carre') + '.jpg';
  }
  function exporterImage(partage) {
    var st = ST();
    if (!modeleLibre(st.modele)) return proposerPass('Le modèle « ' + IM.modele(st.modele).nom + ' » fait partie du Pass Vitrine. Élégant et Promo restent gratuits.');
    if (!dernierBlob) return toast('Image en préparation… réessayez dans un instant.');
    var blob = dernierBlob, nom = nomImage();
    if (!partage) { telecharger(blob, nom); toast('Image enregistrée dans vos téléchargements.'); return; }
    partagerFichier(blob, nom, 'image/jpeg').then(function (r) {
      if (r === 'telecharge') feuille('Image enregistrée', '<p>Ce navigateur ne peut pas partager directement : l\'image <b>' + esc(nom) + '</b> est dans vos téléchargements.</p>' +
        '<ol class="etapes"><li>Ouvrez <b>WhatsApp</b>, onglet <b>Actus</b> (ou <b>Statut</b>).</li><li>Touchez l\'appareil photo, puis choisissez l\'image dans la galerie.</li><li>Ajoutez votre lien de commande en légende, puis envoyez.</li></ol>' +
        '<a class="btn sec large" href="#/lien">' + ICO.lien + 'Mon lien de commande</a>');
      else if (r === 'partage') toast('Image partagée.');
    });
  }

  // ---------- Catalogue PDF ----------
  var catalogueOpt = { dispo: true, titre: 'Catalogue' };
  function vueCatalogue() {
    cadre({ titre: 'Catalogue PDF', retour: '#/studio', nav: 'studio' });
    if (!S.produits.length) { vue(vide('Ajoutez d\'abord des produits.', '#/produit-modifier/nouveau', 'Ajouter un produit')); return; }
    var nd = produitsTries().filter(function (p) { return VT.etatStock(p) !== 'epuise'; }).length;
    vue('<section class="carte"><h2>Votre catalogue</h2><p>Un PDF A4 avec vos photos, vos prix en F CFA et un bouton « Commander » qui ouvre WhatsApp vers votre numéro.</p>' +
      '<div class="segments" role="group" aria-label="Produits"><button type="button" class="segment" data-action="cat-dispo" data-v="1" aria-pressed="' + catalogueOpt.dispo + '">Disponibles (' + nd + ')</button>' +
      '<button type="button" class="segment" data-action="cat-dispo" data-v="0" aria-pressed="' + !catalogueOpt.dispo + '">Tous (' + S.produits.length + ')</button></div>' +
      '<div class="champ"><label for="cat-titre">Titre</label><input id="cat-titre" maxlength="40" value="' + esc(catalogueOpt.titre) + '"></div>' +
      '<p class="petit">Couleur : celle choisie dans « Images » (<span class="pastille" style="background:' + esc(ST().couleur) + '"></span>).</p>' +
      '<button type="button" class="btn plein large geant" data-action="cat-pdf" id="btn-pdf">' + ICO.pdf + 'Créer et partager le PDF</button>' +
      '<button type="button" class="btn sec large" data-action="cat-pdf-dl">' + ICO.telecharger + 'Télécharger le PDF</button></section>');
    if (window.VTPDF) setTimeout(function () { VTPDF.bibliotheque().catch(function () {}); }, 300);
  }
  var pdfOccupe = false;
  function creerCatalogue(partage) {
    if (pdfOccupe) return; pdfOccupe = true;
    var l = produitsTries().filter(function (p) { return !catalogueOpt.dispo || VT.etatStock(p) !== 'epuise'; });
    if (!l.length) { pdfOccupe = false; return toast('Aucun produit disponible à mettre dans le catalogue.'); }
    var t = $('#cat-titre'); catalogueOpt.titre = (t && t.value.trim()) || 'Catalogue';
    toast('Préparation du catalogue…');
    Promise.all(l.map(function (p) { var id = p.photos && p.photos[0]; return id ? DB.lire('photos', id).then(function (ph) { return Object.assign({}, p, { blob: ph && (ph.image || ph.mini) }); }) : Object.assign({}, p); }))
      .then(function (prods) { return VTPDF.catalogue({ produits: prods, profil: S.profil, couleur: IM.lisibleSurClair(ST().couleur), titre: catalogueOpt.titre }); })
      .then(function (r) {
        pdfOccupe = false; cacherToast();
        if (!partage) { telecharger(r.blob, r.nom); toast('Catalogue téléchargé.'); return; }
        return partagerFichier(r.blob, r.nom, 'application/pdf').then(function (x) { if (x === 'telecharge') toast('Catalogue téléchargé : envoyez-le depuis WhatsApp (trombone, Document).'); });
      }).catch(function (e) { pdfOccupe = false; toast(e.message || 'Le PDF n\'a pas pu être créé.'); });
  }

  // ---------- Commandes ----------
  var filtreCmd = 'toutes';
  function badgesCommande(c) {
    return '<span class="badges"><span class="badge ' + (c.paye ? 'b-paye">Payée' : 'b-impaye">Non payée') + '</span><span class="badge ' + (c.livre ? 'b-livre">Livrée' : 'b-alivrer">À livrer') + '</span></span>';
  }
  function resumeArticles(c) {
    var n = VT.nbArticles(c), noms = (c.lignes || []).map(function (l) { return l.nom; });
    return n + ' article' + (n > 1 ? 's' : '') + ' · ' + noms.join(', ');
  }
  function vueCommandes(_, params) {
    if (params && params.get('f')) filtreCmd = params.get('f') === 'livrer' ? 'livrer' : params.get('f') === 'encaisser' ? 'encaisser' : 'toutes';
    cadre({ titre: 'Commandes', nav: 'commandes', fab: '#/commande-modifier/nouveau', fabLabel: 'Nouvelle commande' });
    if (!S.commandes.length) { vue(vide('Notez ici chaque commande reçue sur WhatsApp : le stock baisse tout seul et vous voyez ce qui reste à encaisser et à livrer.', '#/commande-modifier/nouveau', 'Nouvelle commande', ICO.commande)); return; }
    var h = '<a class="btn sec large" href="#/ventes">' + ICO.ventes + 'Ventes du jour et meilleures ventes</a>';
    h += '<div class="puces" role="group" aria-label="Filtre">' + [['toutes', 'Toutes'], ['encaisser', 'À encaisser'], ['livrer', 'À livrer']].map(function (x) {
      return '<button type="button" class="puce" data-action="filtre-cmd" data-v="' + x[0] + '" aria-pressed="' + (filtreCmd === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div><div id="liste-commandes"></div>';
    vue(h);
    listerCommandes();
  }
  function listerCommandes() {
    var l = S.commandes.filter(function (c) { return filtreCmd === 'toutes' || (filtreCmd === 'encaisser' ? !c.paye : !c.livre); })
      .sort(function (a, b) { return b.date.localeCompare(a.date) || (b.cree || '').localeCompare(a.cree || ''); });
    var jours = VT.totauxParJour(S.commandes), parJour = {}, ordre = [];
    l.forEach(function (c) { if (!parJour[c.date]) { parJour[c.date] = []; ordre.push(c.date); } parJour[c.date].push(c); });
    $('#liste-commandes').innerHTML = ordre.length ? ordre.map(function (j) {
      var t = jours[j];
      return '<section class="jour" data-jour="' + j + '"><div class="jour-tete"><h2>' + esc(VT.jourFr(j)) + '</h2><span class="total-jour">' + t.n + ' commande' + (t.n > 1 ? 's' : '') + ' · <b class="nombre">' + f(t.total) + '</b> · encaissé ' + f(t.encaisse) + '</span></div><div class="liste">' +
        parJour[j].map(function (c) {
          return '<a class="ligne-liste" href="#/commande/' + esc(c.id) + '"><span class="ll-g"><strong>' + esc(c.client) + '</strong><span>' + esc(resumeArticles(c)) + '</span></span><span class="ll-d"><strong>' + f(VT.totalCommande(c)) + '</strong>' + badgesCommande(c) + '</span></a>';
        }).join('') + '</div></section>';
    }).join('') : '<p class="vide">Aucune commande dans ce filtre.</p>';
    $$('.puce[data-action="filtre-cmd"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === filtreCmd)); });
  }
  function vueCommande(id) {
    var c = trouver(S.commandes, id);
    if (!c) { location.replace('#/commandes'); return; }
    cadre({ titre: 'Commande de ' + c.client, retour: '#/commandes', nav: 'commandes' });
    var h = '<section class="carte"><div class="titre-ligne"><div><h1 style="margin:0">' + esc(c.client) + '</h1><p class="petit">' + esc(VT.jourFr(c.date)) + (c.telephone ? ' · ' + esc(c.telephone) : '') + '</p></div><strong class="nombre" style="font-size:1.4rem" id="cmd-total">' + f(VT.totalCommande(c)) + '</strong></div>' +
      '<div class="etats"><button type="button" class="etat" data-action="basculer" data-cle="paye" aria-pressed="' + !!c.paye + '" id="etat-paye">' + ICO.argent + (c.paye ? 'Payée' : 'Marquer payée') + '</button>' +
      '<button type="button" class="etat" data-action="basculer" data-cle="livre" aria-pressed="' + !!c.livre + '" id="etat-livre">' + ICO.camion + (c.livre ? 'Livrée' : 'Marquer livrée') + '</button></div></section>';
    h += '<section class="carte recap"><h2>Articles</h2><dl>' + c.lignes.map(function (l) {
      var opt = [l.taille, l.couleur].filter(Boolean).join(', ');
      return '<div><dt>' + l.qte + ' × ' + esc(l.nom) + (opt ? ' <span class="petit">(' + esc(opt) + ')</span>' : '') + '</dt><dd>' + f(l.prix * l.qte) + '</dd></div>';
    }).join('') + (c.frais ? '<div><dt>Livraison</dt><dd>' + f(c.frais) + '</dd></div>' : '') + '<div class="recap-total"><dt>Total</dt><dd>' + f(VT.totalCommande(c)) + '</dd></div></dl>' +
      (c.lieu ? '<p>' + ICO.camion + ' ' + esc(c.lieu) + '</p>' : '') + (c.note ? '<p class="petit">' + esc(c.note) + '</p>' : '') + '</section>';
    var num = c.telephone ? VT.normaliserNumero(c.telephone, S.profil.pays || '221') : null;
    h += '<a class="btn wa large geant" id="btn-recap" href="' + esc(VT.lienWhatsApp(num, VT.messageRecap(c, S.profil))) + '" target="_blank" rel="noopener">' + ICO.wa + 'Envoyer le récapitulatif' + (num ? ' à ' + esc(c.client) : '') + '</a>';
    if (!num) h += '<p class="petit centre">Sans numéro du client, WhatsApp vous laissera choisir le contact.</p>';
    h += '<div class="actions-sec"><a class="btn-action" href="#/commande-modifier/' + esc(c.id) + '">' + ICO.modifier + 'Modifier</a><button type="button" class="btn-action danger" data-action="cmd-suppr" data-id="' + esc(c.id) + '">' + ICO.supprimer + 'Supprimer</button></div>';
    vue(h);
  }
  function basculer(c, cle) {
    var q = Object.assign({}, c); q[cle] = !c[cle]; q.modifie = new Date().toISOString();
    DB.mettre('commandes', q).then(function () {
      S.commandes[S.commandes.indexOf(c)] = q;
      toast(cle === 'paye' ? (q.paye ? 'Commande marquée payée.' : 'Commande marquée non payée.') : (q.livre ? 'Commande marquée livrée.' : 'Commande marquée à livrer.'));
      vueCommande(q.id);
    });
  }
  function vueCommandeForm(id, params) {
    var nouveau = id === 'nouveau', c = nouveau ? null : trouver(S.commandes, id);
    if (!nouveau && !c) { location.replace('#/commandes'); return; }
    var route = '/commande-modifier/' + id;
    if (!E || E.route !== route) {
      var base = c ? JSON.parse(JSON.stringify(c)) : { id: VT.nouvelId(), date: VT.dateISO(), client: '', telephone: '', lignes: [], lieu: '', frais: null, paye: false, livre: false, note: '' };
      E = { route: route, nouveau: nouveau, c: base, originale: c ? JSON.parse(JSON.stringify(c)) : null, sale: false };
      var pid = params && params.get('p');
      if (nouveau && pid && produit(pid)) ajouterLigne(produit(pid));
    }
    cadre({ titre: nouveau ? 'Nouvelle commande' : 'Modifier la commande', retour: nouveau ? '#/commandes' : '#/commande/' + id, nav: 'commandes', edition: true });
    var q = E.c, clients = {}, lieux = {};
    S.commandes.forEach(function (x) { if (x.client) clients[x.client] = x.telephone || ''; if (x.lieu) lieux[x.lieu] = 1; });
    var h = '<form data-form="commande" id="form-commande" novalidate>' +
      '<section class="carte"><h2>Client</h2>' + champ('Nom du client', 'client', q.client, { requis: true, max: 60, liste: 'liste-clients', ph: 'Ex. : Fatou Diop' }) +
      champ('Téléphone du client', 'telephone', q.telephone, { facultatif: true, type: 'tel', mode: 'tel', max: 25, ph: '77 000 00 00', aide: 'Pour lui envoyer le récapitulatif sur WhatsApp.' }) +
      '<datalist id="liste-clients">' + Object.keys(clients).map(function (k) { return '<option value="' + esc(k) + '">'; }).join('') + '</datalist></section>' +
      '<section class="carte"><h2>Articles</h2><div class="lignes-cmd" id="lignes-cmd"></div><button type="button" class="btn plein large" data-action="cmd-ajout" id="btn-ajout-article">' + ICO.plus + 'Ajouter un article</button></section>' +
      '<section class="carte"><h2>Livraison</h2>' + champ('Lieu de livraison', 'lieu', q.lieu, { facultatif: true, max: 80, liste: 'liste-lieux', ph: 'Ex. : Sacré-Cœur 3, près de la pharmacie' }) +
      '<datalist id="liste-lieux">' + Object.keys(lieux).map(function (k) { return '<option value="' + esc(k) + '">'; }).join('') + '</datalist>' +
      '<div class="grille2">' + champ('Frais de livraison', 'frais', q.frais ? VT.formatNombre(q.frais) : '', { mode: 'numeric', ph: '0' }) + champ('Date', 'date', q.date, { type: 'date' }) + '</div></section>' +
      '<section class="carte"><h2>Paiement et livraison</h2><div class="etats"><button type="button" class="etat" data-action="cmd-etat" data-cle="paye" aria-pressed="' + !!q.paye + '">' + ICO.argent + 'Payée</button>' +
      '<button type="button" class="etat" data-action="cmd-etat" data-cle="livre" aria-pressed="' + !!q.livre + '">' + ICO.camion + 'Livrée</button></div>' +
      champ('Note', 'note', q.note, { facultatif: true, zone: true, lignes: 2, max: 300, ph: 'Ex. : paiement Wave à la livraison' }) + '</section>' +
      '<p class="erreur" id="erreur-commande" hidden></p>' +
      '<div class="barre-enreg"><div><small>Total</small><strong id="total-cmd">0 F</strong></div><button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>';
    vue(h);
    rendreLignes();
  }
  function ajouterLigne(p) {
    var l = E.c.lignes.filter(function (x) { return x.produitId === p.id && !x.taille && !x.couleur; })[0];
    if (l && !(p.tailles && p.tailles.length) && !(p.couleurs && p.couleurs.length > 1)) l.qte++;
    else E.c.lignes.push({ produitId: p.id, nom: p.nom, prix: VT.prixVente(p), qte: 1, taille: p.tailles && p.tailles.length === 1 ? p.tailles[0] : '', couleur: p.couleurs && p.couleurs.length === 1 ? p.couleurs[0] : '' });
    E.sale = true;
  }
  function stockDispo(pid) {
    var p = produit(pid);
    if (!p || !VT.suiviStock(p)) return null;
    var avant = 0;
    if (E.originale) E.originale.lignes.forEach(function (l) { if (l.produitId === pid) avant += l.qte; });
    return p.stock + avant;
  }
  function rendreLignes() {
    var z = $('#lignes-cmd'); if (!z) return;
    var demandes = {};
    E.c.lignes.forEach(function (l) { if (l.produitId) demandes[l.produitId] = (demandes[l.produitId] || 0) + l.qte; });
    z.innerHTML = E.c.lignes.length ? E.c.lignes.map(function (l, i) {
      var p = l.produitId && produit(l.produitId), dispo = l.produitId ? stockDispo(l.produitId) : null, trop = dispo !== null && demandes[l.produitId] > dispo;
      var opts = '';
      if (p && p.tailles && p.tailles.length) opts += '<div><label for="l' + i + '-taille">Taille</label><select id="l' + i + '-taille" data-ligne="' + i + '" data-cle="taille"><option value="">—</option>' + p.tailles.map(function (t) { return '<option' + (t === l.taille ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>';
      if (p && p.couleurs && p.couleurs.length) opts += '<div><label for="l' + i + '-couleur">Couleur</label><select id="l' + i + '-couleur" data-ligne="' + i + '" data-cle="couleur"><option value="">—</option>' + p.couleurs.map(function (t) { return '<option' + (t === l.couleur ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>';
      opts += '<div><label for="l' + i + '-prix">Prix unitaire</label><input id="l' + i + '-prix" inputmode="numeric" data-ligne="' + i + '" data-cle="prix" value="' + esc(VT.formatNombre(l.prix)) + '"></div>';
      return '<div class="ligne-cmd">' + (p ? vignette(p) : '<span class="vignette"><span class="initiale">' + esc(l.nom.charAt(0)) + '</span></span>') +
        '<div class="ligne-cmd-t"><strong>' + esc(l.nom) + '</strong><small class="' + (trop ? 'du' : '') + '" id="l' + i + '-stock">' + (dispo === null ? f(l.prix) + ' l\'unité' : (trop ? 'Stock insuffisant : ' + dispo + ' disponible' + (dispo > 1 ? 's' : '') : 'Stock : ' + dispo)) + '</small></div>' +
        '<div class="stepper petit"><button type="button" data-action="qte" data-i="' + i + '" data-d="-1" aria-label="Moins">−</button><input id="l' + i + '-qte" inputmode="numeric" data-ligne="' + i + '" data-cle="qte" value="' + l.qte + '" aria-label="Quantité"><button type="button" data-action="qte" data-i="' + i + '" data-d="1" aria-label="Plus">+</button></div>' +
        '<div class="options">' + opts + '<div style="display:flex;align-items:flex-end"><button type="button" class="btn sec" data-action="ligne-suppr" data-i="' + i + '" style="width:100%;min-height:44px">' + ICO.supprimer + 'Retirer</button></div></div></div>';
    }).join('') : '<p class="petit">Touchez « Ajouter un article » et choisissez dans vos produits.</p>';
    remplirPhotos(z);
    majTotalCmd();
  }
  function majTotalCmd() {
    var fr = VT.lireEntier(($('#c-frais') || {}).value);
    E.c.frais = fr > 0 ? fr : null;
    var t = $('#total-cmd'); if (t) t.textContent = f(VT.totalCommande(E.c));
  }
  function choisirArticle() {
    var l = produitsDisponibles();
    if (!l.length) return toast('Ajoutez d\'abord vos produits.');
    feuille('Choisir un article', '<div class="recherche"><label class="vh" for="q-choix">Rechercher</label><input type="search" id="q-choix" placeholder="Rechercher…"></div><div class="choix-grille" id="choix-articles" style="margin-top:10px"></div>', function (el) {
      var lister = function () {
        var q = VT.sansAccents($('#q-choix').value);
        $('#choix-articles').innerHTML = l.filter(function (p) { return VT.sansAccents(p.nom).indexOf(q) >= 0; }).map(function (p) {
          return '<button type="button" class="choix-produit" data-action="article-choisi" data-id="' + esc(p.id) + '">' + vignette(p, { etiquettes: true }) + '<span>' + esc(p.nom) + '</span><span class="petit" style="padding-top:0">' + f(VT.prixVente(p)) + '</span></button>';
        }).join('');
        remplirPhotos(el);
      };
      $('#q-choix').addEventListener('input', lister);
      lister();
    });
  }
  function enregistrerCommande(form) {
    var v = valeurs(form), err = $('#erreur-commande'), c = E.c;
    var montrer = function (m) { err.innerHTML = m; err.hidden = false; err.scrollIntoView({ block: 'center' }); };
    c.client = v.client.slice(0, 60); c.telephone = v.telephone.slice(0, 25); c.lieu = v.lieu.slice(0, 80); c.note = v.note.slice(0, 300);
    c.date = /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : VT.dateISO();
    var fr = VT.lireEntier(v.frais);
    if (isNaN(fr)) return montrer('Frais de livraison : écrivez un nombre entier.');
    c.frais = fr || null;
    var e = VT.verifierCommande(c);
    if (e.length) return montrer(e.map(esc).join('<br>'));
    var mv = VT.mouvementStock(S.produits, E.originale, c);
    if (!mv.ok) return montrer(mv.manques.map(function (m) { return 'Stock insuffisant pour « ' + esc(m.nom) + ' » : ' + m.dispo + ' disponible' + (m.dispo > 1 ? 's' : '') + ', vous en demandez ' + m.demande + '.'; }).join('<br>') + '<br>Corrigez la quantité, ou ajoutez du stock au produit.');
    var maint = new Date().toISOString();
    if (E.nouveau) c.cree = maint;
    c.modifie = maint;
    var ops = [['commandes', c]], maj = [];
    Object.keys(mv.stocks).forEach(function (pid) { var p = Object.assign({}, produit(pid), { stock: mv.stocks[pid] }); ops.push(['produits', p]); maj.push(p); });
    DB.lot(ops).then(function () {
      maj.forEach(function (p) { S.produits[S.produits.indexOf(produit(p.id))] = p; });
      var i = S.commandes.indexOf(trouver(S.commandes, c.id));
      if (i >= 0) S.commandes[i] = c; else S.commandes.push(c);
      var nouveau = E.nouveau; E = null;
      demanderPersistance();
      toast(nouveau ? 'Commande enregistrée. Stock mis à jour.' : 'Commande modifiée.');
      location.replace('#/commande/' + c.id);
    }).catch(function (x) { montrer('Enregistrement impossible : ' + esc(x && x.message || x)); });
  }
  function supprimerCommande(c) {
    confirmer('Supprimer la commande de ' + c.client + ' (' + VT.formatNombre(VT.totalCommande(c), ' ') + ' F) ? Les articles reviennent dans le stock.', 'Supprimer', true).then(function (oui) {
      if (!oui) return;
      var mv = VT.mouvementStock(S.produits, c, null), ops = [['-', 'commandes', c.id]], maj = [];
      Object.keys(mv.stocks).forEach(function (pid) { var p = Object.assign({}, produit(pid), { stock: mv.stocks[pid] }); ops.push(['produits', p]); maj.push(p); });
      DB.lot(ops).then(function () {
        maj.forEach(function (p) { S.produits[S.produits.indexOf(produit(p.id))] = p; });
        S.commandes = S.commandes.filter(function (x) { return x.id !== c.id; });
        toast('Commande supprimée. Stock remis.'); location.replace('#/commandes');
      });
    });
  }

  // ---------- Ventes ----------
  var periode = '7';
  function vueVentes(_, params) {
    if (params && params.get('p')) periode = params.get('p');
    cadre({ titre: 'Ventes', retour: '#/commandes', nav: 'commandes' });
    var auj = VT.dateISO(), debut = periode === 'jour' ? auj : periode === 'tout' ? null : VT.ajouterJours(auj, -(+periode - 1));
    var t = VT.totauxPeriode(S.commandes, debut, auj), top = VT.meilleuresVentes(S.commandes, debut, auj);
    var jours = VT.totauxParJour(S.commandes.filter(function (c) { return (!debut || c.date >= debut) && c.date <= auj; }));
    var lj = Object.keys(jours).sort().reverse();
    var h = '<div class="puces" role="group" aria-label="Période">' + [['jour', 'Aujourd\'hui'], ['7', '7 jours'], ['30', '30 jours'], ['tout', 'Tout']].map(function (x) {
      return '<button type="button" class="puce" data-action="periode" data-v="' + x[0] + '" aria-pressed="' + (periode === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    h += '<div class="kpis" id="kpis-ventes"><div class="kpi"><span>Total des commandes</span><strong id="v-total">' + f(t.total) + '</strong><small>' + t.n + ' commande' + (t.n > 1 ? 's' : '') + '</small></div>' +
      '<div class="kpi bon"><span>Encaissé</span><strong id="v-encaisse">' + f(t.encaisse) + '</strong><small>commandes payées</small></div>' +
      '<div class="kpi' + (t.reste ? ' alerte' : '') + '"><span>À encaisser</span><strong id="v-reste">' + f(t.reste) + '</strong><small>non payées</small></div>' +
      '<div class="kpi"><span>Articles vendus</span><strong id="v-articles">' + t.articles + '</strong><small>' + t.aLivrer + ' commande' + (t.aLivrer > 1 ? 's' : '') + ' à livrer</small></div></div>';
    h += '<section class="carte"><h2>Meilleures ventes</h2>' + (top.length ? '<ol class="classement" id="classement">' + top.slice(0, 10).map(ligneClassement(top[0].qte)).join('') + '</ol>' : '<p class="petit">Aucune vente sur cette période.</p>') + '</section>';
    h += '<section class="carte"><h2>Totaux par jour</h2>' + (lj.length ? '<table class="tableau" id="totaux-jours"><thead><tr><th>Jour</th><th>Cmd</th><th>Total</th><th>Encaissé</th></tr></thead><tbody>' + lj.map(function (j) {
      var x = jours[j]; return '<tr><td>' + esc(VT.jourFr(j)) + '</td><td>' + x.n + '</td><td>' + f(x.total) + '</td><td>' + f(x.encaisse) + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="petit">Aucune commande sur cette période.</p>') + '</section>';
    vue(h);
  }

  // ---------- Lien de commande ----------
  function vueLien() {
    cadre({ titre: 'Lien de commande', retour: '#/', nav: 'accueil' });
    var P = S.profil;
    if (!P.numero) { vue(vide('Ajoutez votre numéro WhatsApp dans Ma boutique pour créer votre lien.', '#/boutique', 'Ma boutique')); return; }
    var msg = VT.messageCommande(P, null, P.messageCommande), lien = VT.lienWhatsApp(P.numero, msg);
    vue('<section class="carte"><h2>Votre lien</h2><p>Mettez ce lien dans votre statut ou votre profil : la cliente le touche, WhatsApp s\'ouvre vers <b>' + esc(VT.afficherNumero(P.numero)) + '</b> avec un message déjà écrit. Elle n\'a plus qu\'à envoyer.</p>' +
      '<div class="lien-boite" id="lien-general">' + esc(lien) + '</div>' +
      '<div class="rang-btn"><button type="button" class="btn plein" data-action="copier" data-texte="' + esc(lien) + '" id="btn-copier-lien">' + ICO.copier + 'Copier le lien</button>' +
      '<button type="button" class="btn sec" data-action="partager-lien" data-texte="' + esc(lien) + '">' + ICO.partager + 'Partager</button>' +
      '<a class="btn sec" href="' + esc(lien) + '" target="_blank" rel="noopener" id="btn-essayer">' + ICO.wa + 'Essayer</a></div></section>' +
      '<section class="carte"><h2>Message reçu</h2><form data-form="message"><div class="bulle-wa" id="bulle">' + esc(msg) + '</div>' +
      '<div class="champ" style="margin-top:12px"><label for="c-message">Modifier le message</label><textarea id="c-message" name="message" rows="3" maxlength="200">' + esc(msg) + '</textarea></div>' +
      '<button type="submit" class="btn sec large">Enregistrer le message</button></form></section>' +
      '<section class="carte"><h2>Dans votre statut</h2><ol class="etapes"><li>Publiez d\'abord votre image (onglet <b>Images</b>).</li><li>Touchez <b>Copier le lien</b>.</li><li>Dans WhatsApp, ajoutez un statut texte (crayon) et collez le lien, ou mettez-le en légende de l\'image.</li></ol>' +
      '<p class="petit">Chaque produit a aussi son propre lien (fiche du produit), avec le nom et le prix déjà écrits.</p></section>');
  }

  // ---------- Réglages ----------
  var invite = null;
  function estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function estInstallee() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function majInstall() { var b = $('#installer'); if (b) b.hidden = estInstallee() || !(invite || estIOS()); }
  function bandeauInstall() {
    if (estInstallee() || (!invite && !estIOS())) return '';
    return '<div class="bandeau-install"><img src="icons/icon-192.png" alt="" width="40" height="40"><p><b>Installez l\'application</b><span>Sur l\'écran d\'accueil, même sans Internet.</span></p>' +
      '<button type="button" class="btn plein" data-action="installer">Installer</button></div>';
  }
  function instructionsInstall() {
    if (estIOS()) return '<ol class="etapes"><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez le bouton <b>Partager</b> (carré avec une flèche vers le haut).</li><li>Choisissez <b>« Sur l\'écran d\'accueil »</b>, puis <b>Ajouter</b>.</li></ol>';
    return '<ol class="etapes"><li>Ouvrez cette page dans <b>Chrome</b>.</li><li>Touchez le menu <b>⋮</b> en haut à droite.</li><li>Choisissez <b>« Installer l\'application »</b> ou <b>« Ajouter à l\'écran d\'accueil »</b>.</li></ol>';
  }
  function lireTheme() { try { return localStorage.getItem('tv-theme') || 'auto'; } catch (e) { return 'auto'; } }
  function appliquerTheme(v) {
    try { localStorage.setItem('tv-theme', v); } catch (e) {}
    var r = document.documentElement;
    if (v === 'clair') r.setAttribute('data-theme', 'light'); else if (v === 'sombre') r.setAttribute('data-theme', 'dark'); else r.removeAttribute('data-theme');
  }
  function lienMenu(href, ico, titre, sous) { return '<a class="menu-lien" href="' + href + '">' + ico + '<span><strong>' + esc(titre) + '</strong><small>' + esc(sous) + '</small></span>' + ICO.chevron + '</a>'; }
  function libellePass() {
    var e = etat();
    if (e.actif) return 'Actif jusqu\'au ' + VT.dateFr(e.fin.slice(0, 10));
    return e.expire ? 'Terminé le ' + VT.dateFr(e.fin.slice(0, 10)) : PRIX_PASS + ' pour 12 mois';
  }
  function vueReglages() {
    cadre({ titre: 'Réglages', nav: 'reglages' });
    var e = etat(), theme = lireTheme();
    var h = '<section class="carte statut-version' + (e.actif ? ' ok' : '') + '"><div><small>Votre version</small><strong>' + (e.actif ? 'Pass Vitrine' : 'Version gratuite') + '</strong><span>' +
      (e.actif ? 'Jusqu\'au ' + esc(VT.dateFr(e.fin.slice(0, 10))) + ' (' + e.joursRestants + ' jours)' : S.produits.length + ' / ' + VT.PRODUITS_GRATUITS + ' produits · 2 modèles sur 6') + '</span></div><a class="btn ' + (e.actif ? 'sec' : 'plein') + '" href="#/pass">' + (e.actif ? 'Détails' : 'Passer au Pass') + '</a></section>';
    h += '<nav class="menu" aria-label="Réglages">' + lienMenu('#/boutique', ICO.boutique, 'Ma boutique', S.profil.nom + (S.profil.numero ? ' · ' + VT.afficherNumero(S.profil.numero) : '')) +
      lienMenu('#/lien', ICO.lien, 'Lien de commande', 'À mettre dans votre statut') + lienMenu('#/catalogue', ICO.pdf, 'Catalogue PDF', 'Tous vos produits en un fichier') +
      lienMenu('#/sauvegarde', ICO.sauvegarde, 'Sauvegarde', S.sauvegarde ? 'Dernière : ' + VT.dateFr(S.sauvegarde.slice(0, 10)) : 'Aucune sauvegarde pour l\'instant') +
      lienMenu('#/pass', ICO.etoile, 'Pass Vitrine', libellePass()) + '</nav>';
    h += '<section class="carte"><h2>Apparence</h2><div class="champ"><label for="theme">Thème</label><select id="theme"><option value="auto"' + (theme === 'auto' ? ' selected' : '') + '>Automatique (comme le téléphone)</option><option value="clair"' +
      (theme === 'clair' ? ' selected' : '') + '>Clair</option><option value="sombre"' + (theme === 'sombre' ? ' selected' : '') + '>Sombre</option></select></div></section>';
    h += '<section class="carte"><h2>Installer l\'application</h2>' + (estInstallee() ? '<p>' + ICO.ok + ' L\'application est installée sur ce téléphone.</p>' :
      (invite ? '<button type="button" class="btn plein large" data-action="installer">' + ICO.installer + 'Installer l\'application</button>' : instructionsInstall())) + '</section>';
    h += '<section class="carte"><h2>Confidentialité</h2><p>Vos produits, photos, clients et commandes restent <b>uniquement sur ce téléphone</b>. Rien n\'est envoyé sur Internet. ' +
      'La seule connexion sert à vérifier votre pass, une fois. L\'application n\'encaisse aucun argent : vos clientes vous paient directement, comme d\'habitude.</p><p class="petit">Faites des sauvegardes régulières : si vous effacez les données du navigateur ou changez de téléphone, seule une sauvegarde permet de tout retrouver.</p></section>';
    h += '<section class="carte"><h2>À propos</h2><p>Teranga Vitrine, version ' + VERSION + '.</p><p class="petit">WhatsApp est une marque de son propriétaire ; Teranga Vitrine est une application indépendante. Bibliothèques et polices libres incluses : jsPDF (MIT), Playfair Display et Montserrat (SIL OFL 1.1). <a href="vendor/LISEZMOI.txt">Détails et licences</a>.</p>' +
      '<p class="petit"><a href="../">Toutes nos applications</a> · <a href="../../boutique/">Boutique Teranga Outils</a></p></section>';
    vue(h);
    $('#theme').addEventListener('change', function () { appliquerTheme(this.value); });
  }

  // ---------- Pass ----------
  function proposerPass(raison) {
    feuille('Pass Vitrine', '<p>' + esc(raison) + '</p><ul class="atouts">' + avantages() + '</ul><p class="prix">' + PRIX_PASS + ' <small>pour 12 mois, payé une fois par Wave</small></p>' +
      '<a class="btn plein large" href="#/pass">' + ICO.etoile + 'Voir le Pass Vitrine</a>');
  }
  function avantages() {
    return ['Produits illimités (gratuit : ' + VT.PRODUITS_GRATUITS + ')', 'Les 6 modèles d\'images : Élégant, Promo, Wax, Nuit d\'or, Pastel, Magazine', 'Toutes vos images carré, statut et catalogues 4, 6, 9', 'Rappel avant la fin du pass ; vos données ne sont jamais bloquées']
      .map(function (x) { return '<li>' + ICO.ok + esc(x) + '</li>'; }).join('');
  }
  function vuePass(_, params) {
    cadre({ titre: 'Pass Vitrine', retour: S.profil.nom ? '#/reglages' : '#/bienvenue', nav: 'reglages' });
    var e = etat(), pre = params.get('code') || '', h = '';
    if (e.actif) {
      h += '<section class="carte statut-version ok" id="pass-actif"><div><small>Pass Vitrine 12 mois</small><strong>Pass actif</strong><span>Jusqu\'au ' + esc(VT.dateFr(e.fin.slice(0, 10))) + ' · encore ' + e.joursRestants + ' jours</span></div></section><ul class="atouts">' + avantages() + '</ul>' +
        '<p class="petit">Gardez le lien de votre commande : il permet d\'activer aussi le pass sur un nouveau téléphone. Pour prolonger, achetez un nouveau pass : les jours s\'ajoutent.</p>';
    } else {
      h += '<section class="carte offre"><h1>' + (e.expire ? 'Renouvelez votre Pass Vitrine' : 'Passez au Pass Vitrine') + '</h1>' + (e.expire ? '<p>Votre pass s\'est terminé le ' + esc(VT.dateFr(e.fin.slice(0, 10))) + '. Vos produits et commandes restent tous là.</p>' : '') +
        '<ul class="atouts">' + avantages() + '</ul><p class="prix">' + PRIX_PASS + ' <small>pour 12 mois</small></p>' +
        '<a class="btn plein large" href="' + URL_ACHAT + '" target="_blank" rel="noopener" id="lien-achat">' + ICO.boutique + 'Acheter le pass (Wave)</a></section>';
    }
    h += '<form class="carte" data-form="pass"><h2>' + (e.actif ? 'Ajouter un autre pass' : 'Activer mon pass') + '</h2><ol class="etapes"><li>Achetez « Pass Vitrine 12 mois » dans la boutique et payez par Wave.</li>' +
      '<li>Sur la page de votre commande payée, copiez le lien de la page.</li><li>Collez-le ci-dessous puis touchez « Activer ».</li></ol>' +
      '<div class="champ"><label for="c-code">Lien de votre commande</label><textarea id="c-code" name="code" rows="3" placeholder="https://…/boutique/commande.html?o=TCV-…&amp;t=…" autocomplete="off" autocapitalize="off" spellcheck="false">' + esc(pre) + '</textarea></div>' +
      '<p class="msg" id="msg-pass" role="status" aria-live="polite"></p><button type="submit" class="btn plein large" id="btn-activer">' + ICO.etoile + 'Activer</button>' +
      '<p class="petit">Une connexion Internet est nécessaire une seule fois. Ensuite tout marche hors ligne.</p></form>';
    vue(h);
    if (pre) activer(pre);
  }
  function activer(texte) {
    var msg = $('#msg-pass'), btn = $('#btn-activer');
    var dire = function (m, erreur) { if (msg) { msg.textContent = m; msg.classList.toggle('erreur', !!erreur); msg.classList.toggle('ok', !erreur); } };
    var c = VT.lireLienCommande(texte);
    if (!c) return dire('Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « TCV- »).', true);
    if (navigator.onLine === false) return dire('Vous êtes hors ligne. Connectez-vous à Internet une fois pour activer.', true);
    dire('Vérification de votre commande…');
    if (btn) btn.disabled = true;
    fetch(VT.urlVerification(c), { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (r.status === 404) throw { m: 'Commande introuvable. Vérifiez que vous avez copié le lien complet.' };
      if (!r.ok) throw { m: 'Le service de vérification ne répond pas. Réessayez dans un instant.' };
      return r.json();
    }).then(function (j) {
      var v = VT.analyserReponse(j);
      if (!v.ok) {
        if (v.raison === 'impayee') throw { m: 'Le paiement de cette commande n\'est pas encore confirmé. Terminez le paiement Wave, attendez la confirmation, puis réessayez.' };
        if (v.raison === 'produit') throw { m: 'Ce lien correspond à un autre achat' + (v.titre ? ' (« ' + v.titre + ' »)' : '') + '. Il faut le lien de la commande « Pass Vitrine 12 mois ».' };
        if (v.raison === 'expiree') throw { m: 'Ce pass est terminé depuis le ' + VT.dateFr(v.fin.slice(0, 10)) + '. Achetez un nouveau pass pour continuer.' };
        throw { m: 'Commande introuvable.' };
      }
      S.passes = VT.ajouterPass(S.passes, v.pass);
      return DB.mettre('kv', S.passes, 'passes').then(function () {
        toast('Pass Vitrine activé. Merci !');
        demanderPersistance();
        vuePass(null, new URLSearchParams());
      });
    }).catch(function (e) {
      if (btn) btn.disabled = false;
      dire(e && e.m ? e.m : 'Pas de connexion au service. Vérifiez Internet et réessayez.', true);
    });
  }

  // ---------- Sauvegarde ----------
  function blobVersTexte(b) {
    return new Promise(function (ok) { if (!b) return ok(null); var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = function () { ok(null); }; r.readAsDataURL(b); });
  }
  function texteVersBlob(u) {
    if (typeof u !== 'string' || u.indexOf('data:') !== 0) return null;
    var i = u.indexOf(','), type = (u.slice(5, i).split(';')[0]) || 'image/jpeg', bin = atob(u.slice(i + 1)), n = bin.length, a = new Uint8Array(n);
    for (var k = 0; k < n; k++) a[k] = bin.charCodeAt(k);
    return new Blob([a], { type: type });
  }
  function vueSauvegarde() {
    cadre({ titre: 'Sauvegarde', retour: S.profil.nom ? '#/reglages' : '#/bienvenue', nav: 'reglages' });
    vue('<section class="carte"><h2>Sauvegarder mes données</h2><p>Un fichier avec vos produits, leurs photos, vos commandes et votre boutique. Envoyez-le-vous sur WhatsApp ou gardez-le sur Google Drive.</p>' +
      '<p class="petit">' + (S.sauvegarde ? 'Dernière sauvegarde : ' + esc(VT.dateFr(S.sauvegarde.slice(0, 10))) : 'Aucune sauvegarde pour l\'instant.') + '</p>' +
      '<button type="button" class="btn plein large" data-action="exporter-json">' + ICO.telecharger + 'Télécharger la sauvegarde</button></section>' +
      '<section class="carte"><h2>Restaurer une sauvegarde</h2><p>Remplace toutes les données de ce téléphone par celles du fichier.</p>' +
      '<label class="btn sec large" for="f-import">' + ICO.sauvegarde + 'Choisir le fichier de sauvegarde</label><input type="file" id="f-import" class="vh" accept=".json,application/json"></section>' +
      '<section class="carte"><h2>Effacer toutes les données</h2><p class="petit">Supprime la boutique, les produits, les photos et les commandes de ce téléphone. Le pass reste actif.</p>' +
      '<button type="button" class="btn danger" data-action="tout-effacer">' + ICO.supprimer + 'Tout effacer</button></section>');
  }
  function exporterJSON() {
    toast('Préparation de la sauvegarde…');
    DB.tout('photos').then(function (photos) {
      return Promise.all(photos.map(function (ph) { return Promise.all([blobVersTexte(ph.image), blobVersTexte(ph.mini)]).then(function (r) { return { id: ph.id, image: r[0], mini: r[1] }; }); }));
    }).then(function (photos) {
      var data = { application: 'teranga-vitrine', format: 1, exporte: new Date().toISOString(), kv: { profil: S.profil, reglages: S.reglages }, produits: S.produits, commandes: S.commandes, photos: photos };
      telecharger(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'teranga-vitrine-sauvegarde-' + VT.dateISO() + '.json');
      S.sauvegarde = new Date().toISOString();
      return DB.mettre('kv', S.sauvegarde, 'sauvegarde');
    }).then(function () { toast('Sauvegarde téléchargée.'); if (location.hash === '#/sauvegarde') vueSauvegarde(); })
      .catch(function (e) { toast('Sauvegarde impossible : ' + (e && e.message || e)); });
  }
  function importerJSON(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var data;
      try { data = JSON.parse(lecteur.result); } catch (e) { return toast('Fichier illisible : ce n\'est pas une sauvegarde Teranga Vitrine.'); }
      if (!data || data.application !== 'teranga-vitrine' || !Array.isArray(data.produits) || !Array.isArray(data.commandes) || !data.kv) return toast('Ce fichier n\'est pas une sauvegarde Teranga Vitrine.');
      confirmer('Remplacer toutes les données de ce téléphone par la sauvegarde du ' + VT.dateFr(String(data.exporte || '').slice(0, 10)) + ' (' + data.produits.length + ' produits, ' + data.commandes.length + ' commandes) ?', 'Restaurer', true).then(function (oui) {
        if (!oui) return;
        var photos = (data.photos || []).map(function (ph) { return { id: ph.id, image: texteVersBlob(ph.image), mini: texteVersBlob(ph.mini) }; }).filter(function (ph) { return ph.id && (ph.image || ph.mini); });
        Object.keys(urlsMini).forEach(oublierPhoto); Object.keys(urlsGrandes).forEach(oublierPhoto);
        DB.remplacer({ kv: { profil: data.kv.profil || {}, reglages: data.kv.reglages || {} }, produits: data.produits, commandes: data.commandes, photos: photos }, ['passes']).then(charger).then(function () {
          toast('Sauvegarde restaurée.'); aller('#/');
        }).catch(function (e) { toast('Restauration impossible : ' + (e && e.message || e)); });
      });
    };
    lecteur.readAsText(fichier);
  }

  // ---------- Actions ----------
  var ACTIONS = {
    'retour': function (b) { if (pileNav > 0) history.back(); else location.hash = b.dataset.vers || '#/'; },
    'installer': function () {
      if (invite) { invite.prompt(); invite.userChoice.then(function () { invite = null; majInstall(); router(); }).catch(function () {}); }
      else feuille('Installer l\'application', instructionsInstall());
    },
    'filtre-cat': function (b) { filtreProduits.cat = b.dataset.v; listerProduits(); },
    'cat': function (b) { E.p.categorie = b.dataset.v; E.sale = true; $$('#cats .puce').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); rendreOptions(); },
    'option': function (b) {
      var l = E.p[b.dataset.cle], v = b.dataset.v, k = l.map(VT.sansAccents).indexOf(VT.sansAccents(v));
      if (k >= 0) l.splice(k, 1); else l.push(v);
      E.sale = true; b.setAttribute('aria-pressed', String(k < 0));
    },
    'ajout-option': function (b) {
      var cle = b.dataset.cle, inp = $(cle === 'tailles' ? '#c-taille-libre' : '#c-couleur-libre'), v = inp.value.trim();
      if (!v) return inp.focus();
      VT.listeOptions(v).forEach(function (x) { if (E.p[cle].map(VT.sansAccents).indexOf(VT.sansAccents(x)) < 0) E.p[cle].push(x); });
      inp.value = ''; E.sale = true; rendreOptions();
    },
    'pas-stock': function (b) { var i = $('#c-stock'); if (i.disabled) return; var n = VT.lireEntier(i.value); i.value = Math.max(0, (isNaN(n) || n === null ? 0 : n) + (+b.dataset.d)); E.sale = true; },
    'photo-retirer': function (b) {
      var ph = E.photos.splice(+b.dataset.i, 1)[0];
      if (ph && !ph.image) E.retirees.push(ph.id);
      if (ph && ph.url) URL.revokeObjectURL(ph.url);
      E.sale = true; rendrePhotosEdit();
    },
    'stock': function (b) { var p = produit(location.hash.split('/').pop()); if (p) changerStock(p, +b.dataset.d); },
    'lien-produit': function (b) { var p = produit(b.dataset.id); if (p) feuilleLien(p); },
    'produit-suppr': function (b) { var p = produit(b.dataset.id); if (p) supprimerProduit(p); },
    'copier': function (b) { copier(b.dataset.texte).then(function () { toast('Lien copié.'); }).catch(function () { toast('Copie impossible : appuyez longuement sur le lien pour le copier.'); }); },
    'partager-lien': function (b) {
      var t = b.dataset.texte;
      if (navigator.share) navigator.share({ text: t }).catch(function () {});
      else window.open(VT.lienWhatsApp(null, t), '_blank', 'noopener');
    },
    'st-format': function (b) { ST().format = b.dataset.v; sauverReglages(); vueStudio(null, null); },
    'st-n': function (b) { ST().n = +b.dataset.v; sauverReglages(); vueStudio(null, null); },
    'st-produit': function (b) {
      var st = ST(), id = b.dataset.id, k = st.choix.indexOf(id);
      if (st.n === 1) st.choix = [id];
      else if (k >= 0) st.choix.splice(k, 1);
      else { if (st.choix.length >= st.n) st.choix.shift(); st.choix.push(id); }
      if (st.n > 1 && st.choix.length < st.n) { rendreChoixProduitsPartiel(); return; }
      sauverReglages(); rendreChoixProduits(); dessinerApercu();
    },
    'st-modele': function (b) {
      ST().modele = b.dataset.v; sauverReglages();
      $$('.modele').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      if (!modeleLibre(b.dataset.v)) toast('Aperçu du modèle « ' + IM.modele(b.dataset.v).nom + ' » : disponible avec le Pass Vitrine.');
      dessinerApercu();
    },
    'st-couleur': function (b) { choisirCouleur(b.dataset.v); },
    'st-titre': function (b) { ST().titre = b.dataset.v; $('#st-titre').value = b.dataset.v; sauverReglages(); dessinerApercu(); },
    'st-partager': function () { exporterImage(true); },
    'st-enregistrer': function () { exporterImage(false); },
    'cat-dispo': function (b) { catalogueOpt.dispo = b.dataset.v === '1'; $$('[data-action="cat-dispo"]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); },
    'cat-pdf': function () { creerCatalogue(true); },
    'cat-pdf-dl': function () { creerCatalogue(false); },
    'filtre-cmd': function (b) { filtreCmd = b.dataset.v; listerCommandes(); },
    'periode': function (b) { periode = b.dataset.v; vueVentes(null, null); },
    'basculer': function (b) { var c = trouver(S.commandes, location.hash.split('/').pop()); if (c) basculer(c, b.dataset.cle); },
    'cmd-suppr': function (b) { var c = trouver(S.commandes, b.dataset.id); if (c) supprimerCommande(c); },
    'cmd-ajout': function () { choisirArticle(); },
    'article-choisi': function (b) { var p = produit(b.dataset.id); if (!p) return; ajouterLigne(p); fermerFeuille(); rendreLignes(); },
    'qte': function (b) { var l = E.c.lignes[+b.dataset.i]; if (!l) return; l.qte = Math.max(1, l.qte + (+b.dataset.d)); E.sale = true; rendreLignes(); },
    'ligne-suppr': function (b) { E.c.lignes.splice(+b.dataset.i, 1); E.sale = true; rendreLignes(); },
    'cmd-etat': function (b) { var k = b.dataset.cle; E.c[k] = !E.c[k]; E.sale = true; b.setAttribute('aria-pressed', String(E.c[k])); },
    'exporter-json': function () { exporterJSON(); },
    'tout-effacer': function () {
      confirmer('Effacer définitivement la boutique, les produits, les photos et les commandes de ce téléphone ? Faites d\'abord une sauvegarde.', 'Tout effacer', true).then(function (oui) {
        if (!oui) return;
        Object.keys(urlsMini).forEach(oublierPhoto); Object.keys(urlsGrandes).forEach(oublierPhoto);
        DB.toutEffacer(['passes']).then(charger).then(function () { toast('Données effacées.'); aller('#/bienvenue'); });
      });
    }
  };
  function rendreChoixProduitsPartiel() { rendreChoixProduits(); var c = $('#compte-choix'); if (c) c.textContent = '(' + ST().choix.length + ' / ' + ST().n + ' : choisissez encore ' + (ST().n - ST().choix.length) + ')'; }
  function choisirCouleur(v) {
    if (!/^#[0-9a-f]{6}$/i.test(v)) return;
    ST().couleur = v; sauverReglages();
    $$('.nuance').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.v === v)); });
    $$('.mini').forEach(function (x) { x.style.setProperty('--c', v); });
    dessinerApercu();
  }
  var FORMULAIRES = {
    'bienvenue': function (form) {
      var P = {}, e = lireBoutique(form, P), err = $('#erreur-bienvenue');
      if (e) { err.textContent = e; err.hidden = false; return; }
      S.profil = P;
      DB.mettre('kv', S.profil, 'profil').then(function () { demanderPersistance(); toast('Bienvenue, ' + P.nom + ' !'); location.replace('#/'); });
    },
    'boutique': function (form) {
      var P = Object.assign({}, S.profil), e = lireBoutique(form, P), err = $('#erreur-boutique');
      if (e) { err.textContent = e; err.hidden = false; return; }
      S.profil = P;
      DB.mettre('kv', S.profil, 'profil').then(function () { toast('Boutique enregistrée.'); location.replace('#/reglages'); });
    },
    'message': function (form) {
      S.profil.messageCommande = valeurs(form).message.slice(0, 200);
      DB.mettre('kv', S.profil, 'profil').then(function () { toast('Message enregistré.'); vueLien(); });
    },
    'produit': function (form) { enregistrerProduit(form); },
    'commande': function (form) { enregistrerCommande(form); },
    'pass': function (form) { activer(form.querySelector('[name=code]').value); }
  };
  function brancher() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]');
      if (!b || b.disabled) return;
      var a = ACTIONS[b.dataset.action];
      if (a) { e.preventDefault(); a(b); }
    });
    document.addEventListener('submit', function (e) {
      var fo = e.target.closest('form[data-form]');
      if (!fo) return;
      e.preventDefault();
      var h = FORMULAIRES[fo.dataset.form]; if (h) h(fo);
    });
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (E && t.closest && t.closest('#form-produit, #form-commande')) E.sale = true;
      if (t.id === 'c-prix' || t.id === 'c-promo') majPrixForm();
      if (t.id === 'st-titre') { ST().titre = t.value; sauverReglages(); dessinerApercu(); }
      if (t.id === 'st-couleur-libre') choisirCouleur(t.value);
      if (t.id === 'c-frais') majTotalCmd();
      if (t.dataset && t.dataset.ligne !== undefined && E && E.c) {
        var l = E.c.lignes[+t.dataset.ligne]; if (!l) return;
        if (t.dataset.cle === 'prix') { var n = VT.lireEntier(t.value); l.prix = n > 0 ? n : 0; majTotalCmd(); }
        if (t.dataset.cle === 'qte') { var q = VT.lireEntier(t.value); if (q >= 1) { l.qte = q; majTotalCmd(); } }
      }
      if (t.id === 'c-message') { var bu = $('#bulle'); if (bu) bu.textContent = t.value; }
    });
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches('input[data-photos]')) { ajouterPhotos(t.files).then(function () { t.value = ''; }); return; }
      if (t.id === 'c-stockLibre') { $('#c-stock').disabled = t.checked; E.sale = true; }
      if (t.id === 'st-details' || t.id === 'st-stock' || t.id === 'st-numero') { ST().opt[t.id.slice(3)] = t.checked; sauverReglages(); dessinerApercu(); }
      if (t.dataset && t.dataset.ligne !== undefined && E && E.c) {
        var l = E.c.lignes[+t.dataset.ligne]; if (!l) return;
        if (t.dataset.cle === 'taille' || t.dataset.cle === 'couleur') { l[t.dataset.cle] = t.value; E.sale = true; }
        if (t.dataset.cle === 'qte' || t.dataset.cle === 'prix') setTimeout(rendreLignes, 0);
      }
      if (t.id === 'f-import' && t.files[0]) { importerJSON(t.files[0]); t.value = ''; }
      if ((t.id === 'c-prix' || t.id === 'c-promo' || t.id === 'c-frais') && t.value) t.value = nombreSaisi(t.value) || t.value;
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && feuilleOuverte) fermerFeuille(); });
    $('#retour').addEventListener('click', function () { ACTIONS.retour(this); });
    $('#fab').addEventListener('click', function () { aller(this.dataset.vers || '#/'); });
    $('#installer').addEventListener('click', function () { ACTIONS.installer(); });
    window.addEventListener('hashchange', function () { pileNav++; router(); });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; majInstall(); });
    window.addEventListener('appinstalled', function () { invite = null; majInstall(); toast('Application installée.'); });
    window.addEventListener('beforeunload', function (e) { if (E && E.sale) { e.preventDefault(); e.returnValue = ''; } });
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
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (majDemandee) { majDemandee = false; location.reload(); } });
  }
  function demarrer() {
    appliquerTheme(lireTheme());
    brancher();
    var p = new URLSearchParams(location.search);
    if (p.get('o') && p.get('t')) history.replaceState(null, '', location.pathname + '#/pass?code=' + encodeURIComponent('?o=' + p.get('o') + '&t=' + p.get('t')));
    charger().then(function () { router(); }).catch(function (e) {
      vue('<section class="carte"><h1>Stockage indisponible</h1><p>' + esc(e && e.message || e) + '</p><p>Sur iPhone, quittez la navigation privée. Sinon, mettez à jour votre navigateur.</p></section>');
    });
    serviceWorker();
    IM.chargerPolices();
  }
  window.TVApp = { etat: S, version: VERSION };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
