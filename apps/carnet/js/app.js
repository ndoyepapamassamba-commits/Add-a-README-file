/* Carnet Boutique — interface. Tout est gardé dans le téléphone (IndexedDB) ; seule la vérification du pass passe par Internet. */
(function () {
  'use strict';
  var CB = window.CB, DB = window.DB;
  var VERSION_APP = '1.0.0';
  var BOUTIQUE_PASS = '../../boutique/' + CB.PASS.slug + '.html';

  var etat = {
    clients: [], ops: [], produits: [], ardoise: [],
    reglages: {}, passes: [], code: null, sauvegardeLe: null, masques: {},
    verrouille: false, pret: false
  };
  var REGLAGES_DEFAUT = { boutique: '', paiement: '', ton: 'normal', plafondDefaut: 0, tri: 'ancien', voixAccord: false, accueilFait: false, nbCommandes: 0 };

  // ---------------------------------------------------------------- Outils
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function F(n) { return CB.formatF(n); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function auj() { return CB.jourLocal(); }
  function pass() { return CB.etatPass(etat.passes); }
  function premium() { return pass().premium; }
  var cacheRes = null;
  function R() { if (!cacheRes) cacheRes = CB.resumes(etat.clients, etat.ops); return cacheRes; }
  function changer() { cacheRes = null; }
  function client(id) { for (var i = 0; i < etat.clients.length; i++) if (etat.clients[i].id === id) return etat.clients[i]; return null; }
  function resume(id) { return R()[id] || CB.resumeClient([]); }
  function opsClient(id) { return etat.ops.filter(function (o) { return o.clientId === id; }); }
  function produitsGenre(g) { return etat.produits.filter(function (p) { return p.genre === g; }).sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0) || a.nom.localeCompare(b.nom, 'fr'); }); }
  function sauverReglages() { return DB.mettre('kv', etat.reglages, 'reglages'); }
  function slug(s) { return CB.normaliser(s).replace(/ /g, '-').slice(0, 40) || 'client'; }

  // ---------------------------------------------------------------- Icônes
  function svg(d, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + d + '</svg>'; }
  var IC = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    moins: '<path d="M5 12h14"/>',
    credit: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M7.5 12h9"/>',
    paiement: '<circle cx="12" cy="12" r="9"/><path d="M7.8 12.4l2.8 2.8 5.6-5.8"/>',
    micro: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    clientPlus: '<circle cx="10" cy="8" r="4"/><path d="M2.5 20.5c.8-3.8 3.7-6.2 7.5-6.2 1.3 0 2.5.3 3.6.8"/><path d="M18.5 13.5v7M15 17h7"/>',
    recherche: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5 16 16"/>',
    whatsapp: '<path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.2a8.5 8.5 0 1 1 15.6-4.7z"/><path d="M9 8.6c.3-.6.7-.6 1-.6l.7 1.7c.1.3 0 .5-.2.8l-.5.6c.6 1.2 1.6 2.2 2.8 2.8l.6-.6c.2-.2.5-.3.8-.2l1.7.8c0 .4-.1.8-.6 1.1-.5.4-1.3.6-2.2.3a8 8 0 0 1-4.6-4.6c-.3-.9-.1-1.6.3-2.1z"/>',
    pdf: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/>',
    carnet: '<path d="M6 3.5h11.5A1.5 1.5 0 0 1 19 5v14.5a1.5 1.5 0 0 1-1.5 1.5H6A2 2 0 0 1 4 19V5.5a2 2 0 0 1 2-2z"/><path d="M4 17.5a2 2 0 0 1 2-2h13M8.5 8h6M8.5 11.5h4"/>',
    ardoise: '<rect x="3" y="3.5" width="18" height="13" rx="1.8"/><path d="M7 8h7M7 12h10M8.5 21l1.8-4.5M15.5 21l-1.8-4.5"/>',
    calc: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8.5 6.5h7v3h-7zM8.5 13.5h.01M12 13.5h.01M15.5 13.5h.01M8.5 17.5h.01M12 17.5h.01M15.5 17.5h.01"/>',
    bilan: '<path d="M4 20V11M10 20V4.5M16 20v-6.5M21.5 20.5h-19"/>',
    reglages: '<path d="M4 6.5h10M18 6.5h2M4 12h4M12 12h8M4 17.5h12M20 17.5h0"/><circle cx="16" cy="6.5" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="17.5" r="2"/>',
    camera: '<path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.5l1.8-2.5h5.4L16.5 7H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/><circle cx="12" cy="12.8" r="3.4"/>',
    cadenas: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3M12 14.5v2.5"/>',
    retour: '<path d="M15 18.5 8.5 12 15 5.5"/>',
    poubelle: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    crayon: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 7.5l2 2"/>',
    tel: '<path d="M5.5 3.5h3.2l1.8 4.6-2.3 1.5a11.5 11.5 0 0 0 6.2 6.2l1.5-2.3 4.6 1.8v3.2a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 4 5.1a1.5 1.5 0 0 1 1.5-1.6z"/>',
    partager: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/>',
    telecharger: '<path d="M12 3.5v11m0 0-4.5-4.5m4.5 4.5 4.5-4.5"/><path d="M4 16.5v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    envoyer: '<path d="M12 15.5v-11m0 0L7.5 9M12 4.5 16.5 9"/><path d="M4 16.5v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    etoile: '<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/>',
    alerte: '<path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.5M12 17.2h.01"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    croix: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.3 2"/>',
    moto: '<circle cx="5.5" cy="17" r="3"/><circle cx="18.5" cy="17" r="3"/><path d="M8.5 17h6.2L12 9.5H9M14.3 9.5h2.4l1.8 7.5M5.5 11h4.2"/>',
    billet: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>',
    installer: '<path d="M12 3.5v10.5m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="3.5" rx="1.2"/>',
    gauche: '<path d="M14.5 6 8.5 12l6 6"/>',
    droite: '<path d="M9.5 6l6 6-6 6"/>',
    livre: '<path d="M12 6.5c-2-1.6-4.8-2.2-8-2v13c3.2-.2 6 .4 8 2 2-1.6 4.8-2.2 8-2v-13c-3.2-.2-6 .4-8 2zM12 6.5v13"/>',
    lune: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    bouclier: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12l2.3 2.3 4.2-4.3"/>'
  };
  function ic(nom, cls) { return svg(IC[nom], cls); }

  // ---------------------------------------------------------------- Affichage commun
  var pileNav = 0;
  var ONGLETS = { '': 'carnet', client: 'carnet', operation: 'carnet', 'client-modifier': 'carnet', ardoise: 'ardoise', commande: 'ardoise',
    marge: 'marge', bilan: 'bilan', plus: 'plus', produits: 'plus', pass: 'plus', code: 'plus', bienvenue: '' };
  var PARENTS = { client: '#/', operation: '#/', 'client-modifier': '#/', commande: '#/ardoise', produits: '#/plus', pass: '#/plus', code: '#/plus' };
  var parentCourant = null;

  function vue(html, titre, opts) {
    opts = opts || {};
    var main = $('#vue');
    main.innerHTML = html;
    $('#titre').textContent = titre || 'Carnet Boutique';
    document.title = (titre && titre !== 'Carnet Boutique' ? titre + ' · ' : '') + 'Carnet Boutique';
    parentCourant = opts.parent || null;
    $('#retour').hidden = !opts.parent;
    $('#marque').hidden = !!opts.parent;
    var ong = opts.onglet;
    $$('#nav a').forEach(function (a) { var on = a.getAttribute('data-nav') === ong; a.classList.toggle('actif', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#nav').hidden = !!opts.sansNav;
    majBadge();
    majBoutonVerrou();
    if (!opts.garderDefilement) window.scrollTo(0, 0);
  }
  function majBadge() {
    var b = $('#badge-pass');
    if (!b) return;
    var p = pass();
    b.textContent = p.premium ? 'Pass' : 'Gratuit';
    b.classList.toggle('actif', p.premium);
    b.hidden = !etat.reglages.accueilFait;
  }

  var minuteurToast = null;
  function toast(msg, action) {
    var t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button" class="toast-action">' + esc(action.label) + '</button>' : '');
    t.hidden = false;
    t.classList.add('visible');
    if (action) $('.toast-action', t).addEventListener('click', function () { cacherToast(); action.fn(); });
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(cacherToast, action ? 7000 : 3500);
  }
  function cacherToast() { var t = $('#toast'); t.classList.remove('visible'); t.hidden = true; }

  // Feuilles (fenêtres qui montent du bas)
  var feuilleOuverte = null, focusAvant = null;
  function ouvrirFeuille(html, opts) {
    fermerFeuille(true);
    opts = opts || {};
    focusAvant = document.activeElement;
    var voile = document.createElement('div');
    voile.className = 'voile';
    voile.innerHTML = '<div class="feuille' + (opts.classe ? ' ' + opts.classe : '') + '" role="dialog" aria-modal="true" aria-labelledby="feuille-titre" tabindex="-1">' +
      '<button type="button" class="feuille-fermer" data-action="fermer" aria-label="Fermer">' + ic('croix') + '</button>' + html + '</div>';
    document.body.appendChild(voile);
    document.body.classList.add('sans-defilement');
    voile.addEventListener('click', function (e) { if (e.target === voile && !opts.bloquante) fermerFeuille(); });
    feuilleOuverte = { el: voile, opts: opts };
    requestAnimationFrame(function () { voile.classList.add('ouverte'); var f = $('[autofocus]', voile) || $('.feuille', voile); if (f) f.focus(); });
    return $('.feuille', voile);
  }
  function fermerFeuille(silence) {
    if (!feuilleOuverte) return;
    var f = feuilleOuverte;
    feuilleOuverte = null;
    f.el.remove();
    document.body.classList.remove('sans-defilement');
    if (f.opts.surFermeture && !silence) f.opts.surFermeture();
    if (focusAvant && focusAvant.focus && document.contains(focusAvant)) try { focusAvant.focus(); } catch (e) { /* rien */ }
  }
  function confirmer(o) {
    return new Promise(function (ok) {
      var fini = false;
      var f = ouvrirFeuille('<h2 id="feuille-titre">' + esc(o.titre) + '</h2>' + (o.texte ? '<p class="feuille-texte">' + o.texte + '</p>' : '') +
        '<div class="pile-boutons"><button type="button" class="btn ' + (o.danger ? 'btn-danger' : 'btn-principal') + '" data-r="1" autofocus>' + esc(o.ok || 'Oui') + '</button>' +
        '<button type="button" class="btn btn-sec" data-r="0">' + esc(o.non || 'Annuler') + '</button></div>',
      { surFermeture: function () { if (!fini) { fini = true; ok(false); } } });
      $$('[data-r]', f).forEach(function (b) { b.addEventListener('click', function () { fini = true; var r = b.getAttribute('data-r') === '1'; fermerFeuille(true); ok(r); }); });
    });
  }

  function avatar(c, taille) {
    taille = taille || 'm';
    if (c && c.photo) return '<img class="avatar avatar-' + taille + '" src="' + esc(c.photo) + '" alt="">';
    var nom = c ? c.nom : '?';
    return '<span class="avatar avatar-' + taille + '" style="--teinte:' + CB.couleurNom(nom) + '" aria-hidden="true">' + esc(CB.initiales(nom)) + '</span>';
  }
  function badgeAge(r) {
    if (!r || r.solde <= 0 || !r.depuis) return '';
    var n = CB.ecartJours(r.depuis, auj());
    return '<span class="age age-' + CB.niveauAge(r.depuis, auj()) + '">' + (n <= 0 ? "aujourd'hui" : n + CB.NBSP + 'j') + '</span>';
  }

  // ---------------------------------------------------------------- Chargement
  function charger() {
    return Promise.all(DB.MAGASINS.map(function (m) { return DB.tout(m); })).then(function (res) {
      etat.clients = res[0] || []; etat.ops = res[1] || []; etat.produits = res[2] || []; etat.ardoise = res[3] || [];
      return DB.toutKv();
    }).then(function (kv) {
      etat.reglages = Object.assign({}, REGLAGES_DEFAUT, kv.reglages || {});
      etat.passes = Array.isArray(kv.passes) ? kv.passes : [];
      etat.code = kv.code || null;
      etat.sauvegardeLe = kv.sauvegardeLe || null;
      etat.masques = kv.masques || {};
      changer();
    });
  }

  // ---------------------------------------------------------------- Routeur
  function router() {
    fermerFeuille(true);
    if (etat.verrouille) return;
    var h = location.hash.replace(/^#\/?/, '');
    var i = h.indexOf('?');
    var chemin = i >= 0 ? h.slice(0, i) : h, p = new URLSearchParams(i >= 0 ? h.slice(i + 1) : '');
    var parts = chemin.split('/');
    if (!etat.reglages.accueilFait) return vueBienvenue();
    switch (parts[0]) {
      case '': return vueCarnet();
      case 'client': return client(parts[1]) ? vueClient(parts[1]) : allerA('#/');
      case 'operation': return vueOperation(p);
      case 'client-modifier': return vueClientForm(parts[1]);
      case 'ardoise': return vueArdoise(p);
      case 'commande': return vueCommande(parts[1]);
      case 'marge': return vueMarge();
      case 'bilan': return vueBilan(p);
      case 'plus': return vuePlus();
      case 'produits': return vueProduits(parts[1] === 'plat' ? 'plat' : 'produit');
      case 'pass': return vuePass(p);
      case 'code': return vueCode();
      default: return allerA('#/');
    }
  }
  function allerA(h, remplacer) {
    if (location.hash === h) return router();
    if (remplacer) { history.replaceState(null, '', h); router(); }
    else location.hash = h;
  }

  // ---------------------------------------------------------------- Bienvenue
  var PRODUITS_COURANTS = ['Riz', 'Sucre', 'Huile', 'Lait', 'Pain', 'Savon', 'Thé', 'Café', 'Oignon', 'Pomme de terre'];
  function vueBienvenue() {
    vue('<section class="bienvenue">' +
      '<img src="icons/icon-192.png" alt="" width="96" height="96" class="bienvenue-logo">' +
      '<h2>Carnet Boutique</h2>' +
      '<p class="bienvenue-texte">Le carnet de crédit du boutiquier. Tout reste dans votre téléphone.</p>' +
      '<ul class="bienvenue-points"><li>' + ic('carnet') + 'Qui doit combien</li><li>' + ic('whatsapp') + 'Rappel poli sur WhatsApp</li><li>' + ic('micro') + 'Noter en parlant</li></ul>' +
      '<form data-form="bienvenue" class="carte">' +
      '<label class="label" for="b-nom">Nom de la boutique</label>' +
      '<input id="b-nom" class="champ" maxlength="60" placeholder="Ex. : Boutique Baobab" autocomplete="organization">' +
      '<label class="case"><input type="checkbox" id="b-produits" checked> <span>Ajouter des produits courants (riz, sucre, huile…)</span></label>' +
      '<button type="submit" class="btn btn-principal btn-xl">Commencer</button>' +
      '</form><p class="centre"><label class="lien" for="f-restaurer">' + ic('envoyer', 'ic-mini') + 'J\'ai une sauvegarde : la restaurer</label>' +
      '<input type="file" id="f-restaurer" accept="application/json,.json" class="cache-fichier"></p></section>', 'Carnet Boutique', { onglet: '', sansNav: true });
  }
  function enregistrerBienvenue() {
    etat.reglages.boutique = $('#b-nom').value.trim().slice(0, 60);
    etat.reglages.accueilFait = true;
    var ops = [['kv', etat.reglages, 'reglages']];
    if ($('#b-produits').checked && !produitsGenre('produit').length) {
      PRODUITS_COURANTS.forEach(function (n, i) { var p = { id: uid(), nom: n, prix: 0, genre: 'produit', ordre: i }; etat.produits.push(p); ops.push(['produits', p]); });
    }
    DB.lot(ops).then(function () { allerA('#/', true); });
  }

  // ---------------------------------------------------------------- Carnet (accueil)
  var voixDispo = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  function bandeaux() {
    var p = pass(), html = [], m = etat.masques || {}, now = Date.now();
    if (p.premium && p.rappel) html.push(bandeau('alerte', 'Votre pass finit dans ' + p.joursRestants + ' jour' + (p.joursRestants > 1 ? 's' : '') + '.', '#/pass', 'Renouveler'));
    if (!p.premium && p.expire && !(m.passExpire > now)) html.push(bandeau('alerte', 'Votre pass est terminé. Votre carnet reste complet.', '#/pass', 'Renouveler', 'passExpire'));
    if (p.premium && etat.clients.length && (!etat.sauvegardeLe || Date.now() - Date.parse(etat.sauvegardeLe) > CB.SAUVEGARDE_JOURS * CB.JOUR_MS) && !(m.sauvegarde > now)) {
      html.push(bandeau('sauvegarde', etat.sauvegardeLe ? 'Sauvegarde : ' + CB.depuisQuand(CB.jourLocal(new Date(etat.sauvegardeLe))) + '.' : 'Pensez à sauvegarder.', '#/plus#sauvegarde', 'Sauvegarder', 'sauvegarde'));
    }
    if (!p.premium && etat.clients.length >= CB.CLIENTS_GRATUITS - 5) html.push(bandeau('info', etat.clients.length + ' / ' + CB.CLIENTS_GRATUITS + ' clients (version gratuite)', '#/pass', 'Pass'));
    return html.join('');
  }
  function bandeau(type, texte, lien, label, masque) {
    return '<div class="bandeau bandeau-' + type + '" role="status">' + ic(type === 'sauvegarde' ? 'telecharger' : type === 'info' ? 'etoile' : 'alerte') +
      '<p>' + esc(texte) + '</p><a class="bandeau-btn" href="' + lien + '">' + esc(label) + '</a>' +
      (masque ? '<button type="button" class="bandeau-x" data-action="masquer" data-cle="' + masque + '" aria-label="Plus tard">' + ic('croix') + '</button>' : '') + '</div>';
  }
  function vueCarnet() {
    var t = CB.totalDu(etat.clients, R());
    var tri = etat.reglages.tri || 'ancien';
    var html = '<section class="total-carte" aria-label="Total à recevoir">' +
      '<p class="total-label">On me doit</p>' +
      '<p class="total-montant" id="total-du">' + F(t.total) + '</p>' +
      '<p class="total-sous">' + (t.nb ? t.nb + ' client' + (t.nb > 1 ? 's' : '') + ' à crédit' : 'Personne ne doit rien') + '</p></section>' +
      '<div class="tuiles">' +
      '<a class="tuile tuile-credit" href="#/operation?type=credit">' + ic('credit') + '<span>Crédit</span></a>' +
      '<a class="tuile tuile-paiement" href="#/operation?type=paiement">' + ic('paiement') + '<span>Paiement</span></a>' +
      (voixDispo ? '<button type="button" class="tuile tuile-voix" data-action="voix">' + ic('micro') + '<span>Parler</span></button>'
        : '<a class="tuile tuile-client" href="#/client-modifier/nouveau">' + ic('clientPlus') + '<span>Client</span></a>') +
      '</div>' + bandeaux();
    if (!etat.clients.length) {
      html += '<section class="vide">' + ic('carnet', 'ic-xl') + '<h2>Le carnet est vide</h2><p>Ajoutez votre premier client.</p>' +
        '<a class="btn btn-principal btn-xl" href="#/client-modifier/nouveau">' + ic('clientPlus') + 'Nouveau client</a></section>';
    } else {
      html += '<div class="barre-liste"><label class="recherche">' + ic('recherche') +
        '<input type="search" id="recherche" placeholder="Chercher un client" aria-label="Chercher un client" autocomplete="off" enterkeyhint="search"></label>' +
        '<a class="btn-rond" href="#/client-modifier/nouveau" aria-label="Nouveau client">' + ic('clientPlus') + '</a></div>' +
        '<div class="tri" role="group" aria-label="Ordre de la liste">' +
        ['ancien', 'gros', 'nom'].map(function (k) {
          return '<button type="button" data-action="tri" data-tri="' + k + '" aria-pressed="' + (tri === k) + '">' + { ancien: 'Plus anciens', gros: 'Plus gros', nom: 'A → Z' }[k] + '</button>';
        }).join('') + '</div>' +
        '<ul class="liste-clients" id="liste-clients">' + lignesClients('') + '</ul>';
    }
    vue(html, 'Carnet Boutique', { onglet: 'carnet' });
  }
  function lignesClients(filtre) {
    var res = R(), f = CB.normaliser(filtre);
    var liste = CB.trierClients(etat.clients, res, etat.reglages.tri || 'ancien').filter(function (c) { return !f || CB.normaliser(c.nom).indexOf(f) >= 0; });
    if (!liste.length) return '<li class="liste-vide">Aucun client « ' + esc(filtre) + ' »</li>';
    return liste.map(function (c) {
      var r = res[c.id], dette = r.solde > 0, trop = dette && c.plafond > 0 && r.solde > c.plafond;
      var sous = [];
      if (dette) sous.push(badgeAge(r));
      if (c.relanceLe) sous.push('<span class="relance-mini">' + ic('whatsapp') + CB.dateCourte(c.relanceLe) + '</span>');
      if (trop) sous.push('<span class="limite-mini">' + ic('alerte') + 'limite</span>');
      return '<li><a class="ligne-client" href="#/client/' + esc(c.id) + '">' + avatar(c, 'm') +
        '<span class="lc-corps"><span class="lc-nom">' + esc(c.nom) + '</span><span class="lc-sous">' + (sous.join('') || (dette ? '' : '<span class="ajour-mini">À jour</span>')) + '</span></span>' +
        '<span class="lc-montant ' + (dette ? 'dette' : 'ajour') + '">' + (dette ? F(r.solde) : ic('check')) + '</span></a></li>';
    }).join('');
  }

  // ---------------------------------------------------------------- Fiche client
  function vueClient(id) {
    var c = client(id), r = resume(id), dette = r.solde > 0;
    var lim = c.plafond > 0 ? Math.min(100, Math.round(Math.max(0, r.solde) / c.plafond * 100)) : null;
    var hist = CB.historique(opsClient(id)).reverse();
    var html = '<section class="fiche">' +
      '<button type="button" class="fiche-photo" data-action="photo" data-id="' + esc(id) + '" aria-label="' + (c.photo ? 'Changer la photo' : 'Prendre une photo') + '">' + avatar(c, 'xl') + '<span class="photo-badge">' + ic('camera') + '</span></button>' +
      '<h2 class="fiche-nom">' + esc(c.nom) + '</h2>' +
      (c.tel ? '<p class="fiche-tel">' + ic('tel') + esc(CB.afficherTel(c.tel)) + '</p>' : '') +
      '<div class="solde-carte ' + (dette ? 'dette' : 'ajour') + '">' +
      '<p class="solde-label">' + (dette ? 'Doit' : 'À jour') + '</p>' +
      '<p class="solde-montant" id="solde-client">' + (dette ? F(r.solde) : ic('check', 'ic-xl')) + '</p>' +
      (dette && r.depuis ? '<p class="solde-sous">depuis le ' + CB.dateComplete(r.depuis) + ' ' + badgeAge(r) + '</p>' : '') +
      (r.solde < 0 ? '<p class="solde-sous">Avance : ' + F(-r.solde) + '</p>' : '') +
      (lim != null ? '<div class="limite"><div class="limite-barre' + (r.solde > c.plafond ? ' depasse' : lim >= 80 ? ' proche' : '') + '"><span style="width:' + lim + '%"></span></div><p>Limite ' + F(c.plafond) + (r.solde > c.plafond ? ' — dépassée de ' + F(r.solde - c.plafond) : '') + '</p></div>' : '') +
      '</div>' +
      '<div class="tuiles tuiles-2">' +
      '<a class="tuile tuile-credit" href="#/operation?type=credit&client=' + encodeURIComponent(id) + '">' + ic('credit') + '<span>Crédit</span></a>' +
      '<a class="tuile tuile-paiement' + (dette ? '' : ' inactive') + '" href="#/operation?type=paiement&client=' + encodeURIComponent(id) + '">' + ic('paiement') + '<span>Paiement</span></a></div>' +
      '<div class="actions-sec">' +
      (dette ? '<button type="button" class="btn btn-whatsapp" data-action="rappeler" data-id="' + esc(id) + '">' + ic('whatsapp') + 'Rappeler</button>' : '') +
      '<button type="button" class="btn btn-sec" data-action="releve" data-id="' + esc(id) + '">' + ic('pdf') + 'Relevé PDF' + (premium() ? '' : ' <span class="mini-pass">Pass</span>') + '</button></div>' +
      (c.relanceLe ? '<p class="relance-info">' + ic('whatsapp') + 'Relancé le ' + CB.dateComplete(c.relanceLe) + (c.relances && c.relances.length ? ' (' + esc(c.relances[c.relances.length - 1].ton) + ')' : '') + '</p>' : '') +
      '</section>' +
      '<h2 class="titre-section">Historique</h2>' +
      (hist.length ? '<ol class="historique">' + hist.map(function (l) {
        var o = l.op, cr = o.type !== 'paiement';
        var det = cr ? (CB.texteArticles(o.articles) || 'Crédit') : 'Paiement';
        return '<li><button type="button" class="h-ligne" data-action="op" data-id="' + esc(o.id) + '">' +
          '<span class="h-icone ' + (cr ? 'dette' : 'paye') + '">' + ic(cr ? 'plus' : 'check') + '</span>' +
          '<span class="h-corps"><span class="h-det">' + esc(det) + '</span><span class="h-sous">' + CB.dateCourte(o.date) + ' · reste ' + F(l.soldeApres) + (o.source === 'voix' ? ' · ' + ic('micro', 'ic-mini') : '') + '</span></span>' +
          '<span class="h-montant ' + (cr ? 'dette' : 'paye') + '">' + (cr ? '+' : '−') + F(o.montant) + '</span></button></li>';
      }).join('') + '</ol>' : '<p class="liste-vide">Rien de noté pour l\'instant.</p>') +
      '<a class="btn btn-sec btn-large" href="#/client-modifier/' + encodeURIComponent(id) + '">' + ic('crayon') + 'Modifier le client</a>';
    vue(html, c.nom, { onglet: 'carnet', parent: '#/' });
  }

  function detailOp(id) {
    var o = null;
    etat.ops.forEach(function (x) { if (x.id === id) o = x; });
    if (!o) return;
    var cr = o.type !== 'paiement', c = client(o.clientId);
    var f = ouvrirFeuille('<h2 id="feuille-titre">' + (cr ? 'Crédit' : 'Paiement') + ' du ' + CB.dateComplete(o.date) + '</h2>' +
      '<p class="feuille-montant ' + (cr ? 'dette' : 'paye') + '">' + F(o.montant) + '</p>' +
      (cr && o.articles && o.articles.length ? '<ul class="feuille-articles">' + o.articles.map(function (a) { return '<li>' + esc((a.qte !== 1 ? a.qte + ' × ' : '') + a.nom) + (a.prix ? ' <span>' + F(a.prix * a.qte) + '</span>' : '') + '</li>'; }).join('') + '</ul>' : '') +
      (o.note ? '<p class="feuille-texte">' + esc(o.note) + '</p>' : '') +
      '<div class="pile-boutons"><a class="btn btn-sec" href="#/operation?op=' + encodeURIComponent(o.id) + '">' + ic('crayon') + 'Corriger</a>' +
      '<button type="button" class="btn btn-danger-sec" data-action="op-supprimer">' + ic('poubelle') + 'Supprimer</button></div>');
    $('[data-action=op-supprimer]', f).addEventListener('click', function () {
      confirmer({ titre: 'Supprimer cette ligne ?', texte: esc((cr ? 'Crédit' : 'Paiement') + ' de ' + F(o.montant) + ' pour ' + (c ? c.nom : '')), ok: 'Supprimer', danger: true }).then(function (ok) {
        if (!ok) return;
        supprimerOp(o).then(function () {
          router();
          toast('Ligne supprimée.', { label: 'Annuler', fn: function () { etat.ops.push(o); changer(); DB.mettre('ops', o).then(router); } });
        });
      });
    });
  }
  function supprimerOp(o) {
    etat.ops = etat.ops.filter(function (x) { return x.id !== o.id; });
    changer();
    return DB.effacer('ops', o.id);
  }

  // ---------------------------------------------------------------- Crédit / paiement
  var FO = null;
  function vueOperation(p) {
    var cle = location.hash;
    if (!FO || FO.cle !== cle) {
      FO = { type: p.get('type') === 'paiement' ? 'paiement' : 'credit', clientId: client(p.get('client')) ? p.get('client') : null, nouveauNom: '', recherche: '',
        montant: null, manuel: false, articles: [], date: auj(), note: '', opId: null, limiteOk: false, cle: cle, source: 'main' };
      var opId = p.get('op');
      if (opId) {
        var o = null; etat.ops.forEach(function (x) { if (x.id === opId) o = x; });
        if (!o) return allerA('#/', true);
        FO.type = o.type; FO.clientId = o.clientId; FO.montant = o.montant; FO.manuel = true; FO.date = o.date; FO.note = o.note || '';
        FO.articles = (o.articles || []).map(function (a) { return { nom: a.nom, qte: a.qte, prix: a.prix, pid: a.pid || null }; });
        FO.opId = o.id; FO.source = o.source || 'main';
      }
    }
    var cr = FO.type === 'credit';
    var titre = FO.opId ? (cr ? 'Corriger le crédit' : 'Corriger le paiement') : (cr ? 'Nouveau crédit' : 'Paiement reçu');
    var html = '<form data-form="operation" class="form-op form-' + FO.type + '" novalidate>' +
      (FO.opId ? '' : '<div class="seg seg-type" role="group" aria-label="Type">' +
        '<button type="button" data-action="op-type" data-type="credit" aria-pressed="' + cr + '">' + ic('credit') + 'Crédit</button>' +
        '<button type="button" data-action="op-type" data-type="paiement" aria-pressed="' + !cr + '">' + ic('paiement') + 'Paiement</button></div>') +
      '<div id="op-client">' + htmlOpClient() + '</div>' +
      '<label class="label" for="op-montant">' + (cr ? 'Montant du crédit' : 'Montant reçu') + '</label>' +
      '<div class="montant-saisie"><input id="op-montant" inputmode="numeric" autocomplete="off" enterkeyhint="done" placeholder="0" value="' + (FO.montant ? CB.formatNombre(FO.montant, ' ') : '') + '"><span aria-hidden="true">F</span></div>' +
      '<div id="op-aide" aria-live="polite">' + htmlOpAide() + '</div>' +
      (cr ? '<p class="label">Articles</p><div class="puces" id="op-puces">' + htmlPuces('produit', FO.articles) + '</div>' +
        '<ul class="articles" id="op-articles">' + htmlArticles(FO.articles, false) + '</ul>' +
        '<div class="ajout-libre"><input id="op-libre" class="champ" placeholder="Autre article" maxlength="80" aria-label="Autre article" enterkeyhint="done">' +
        '<button type="button" class="btn btn-sec" data-action="op-libre" aria-label="Ajouter l\'article">' + ic('plus') + '</button></div>' : '') +
      '<div class="ligne-date"><label for="op-date">Date</label><input type="date" id="op-date" class="champ" value="' + FO.date + '" max="' + auj() + '"></div>' +
      '<label class="label" for="op-note">Note <span class="facultatif">(facultatif)</span></label>' +
      '<input id="op-note" class="champ" maxlength="200" value="' + esc(FO.note) + '">' +
      '<p class="erreur" id="op-erreur" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-xl ' + (cr ? 'btn-credit' : 'btn-paiement') + '" id="op-ok">' + ic(cr ? 'credit' : 'paiement') + (cr ? 'Noter le crédit' : 'Encaisser') + '</button>' +
      '</form>';
    vue(html, titre, { onglet: 'carnet', parent: FO.clientId ? '#/client/' + FO.clientId : '#/' });
  }
  function htmlOpClient() {
    var c = client(FO.clientId);
    if (c || FO.nouveauNom) {
      var r = c ? resume(c.id) : null;
      return '<div class="client-choisi">' + avatar(c || { nom: FO.nouveauNom }, 'm') +
        '<span class="cc-corps"><span class="cc-nom">' + esc(c ? c.nom : FO.nouveauNom) + '</span><span class="cc-sous">' +
        (c ? (r.solde > 0 ? 'doit ' + F(r.solde) : 'à jour') : 'nouveau client') + '</span></span>' +
        (FO.opId ? '' : '<button type="button" class="btn btn-sec btn-petit" data-action="op-changer-client">Changer</button>') + '</div>';
    }
    return '<div class="choix-client"><label class="label" for="op-cherche">Client</label>' +
      '<label class="recherche">' + ic('recherche') + '<input type="search" id="op-cherche" placeholder="Nom du client" autocomplete="off" value="' + esc(FO.recherche) + '"></label>' +
      '<ul class="choix-liste" id="op-choix">' + htmlChoixClients() + '</ul></div>';
  }
  function htmlChoixClients() {
    var f = CB.normaliser(FO.recherche), res = R();
    var liste = CB.trierClients(etat.clients, res, f ? 'nom' : 'ancien').filter(function (c) {
      if (FO.type === 'paiement' && !f && res[c.id].solde <= 0) return false;
      return !f || CB.normaliser(c.nom).indexOf(f) >= 0;
    }).slice(0, 30);
    var exact = etat.clients.some(function (c) { return CB.normaliser(c.nom) === f; });
    var html = liste.map(function (c) {
      return '<li><button type="button" class="choix" data-action="op-choisir" data-id="' + esc(c.id) + '">' + avatar(c, 's') + '<span>' + esc(c.nom) + '</span>' +
        (res[c.id].solde > 0 ? '<b class="dette">' + F(res[c.id].solde) + '</b>' : '') + '</button></li>';
    }).join('');
    if (FO.recherche.trim() && !exact && FO.type === 'credit') {
      html += '<li><button type="button" class="choix choix-nouveau" data-action="op-nouveau-client">' + ic('clientPlus') + '<span>Nouveau client « ' + esc(CB.nomPropre(FO.recherche.trim())) + ' »</span></button></li>';
    }
    if (!html) html = '<li class="liste-vide">' + (FO.type === 'paiement' ? 'Personne ne doit rien.' : 'Tapez le nom du client.') + '</li>';
    return html;
  }
  function soldeAvantOp() {
    if (!FO.clientId) return 0;
    var s = resume(FO.clientId).solde;
    if (FO.opId) etat.ops.forEach(function (o) { if (o.id === FO.opId) s += o.type === 'paiement' ? o.montant : -o.montant; });
    return s;
  }
  function htmlOpAide() {
    var c = client(FO.clientId), s = soldeAvantOp(), m = FO.montant || 0;
    if (FO.type === 'paiement') {
      if (!c) return '';
      if (s <= 0) return '<p class="aide">' + esc(c.nom) + ' ne doit rien.</p>';
      return '<div class="raccourcis"><button type="button" class="btn btn-sec btn-petit" data-action="op-tout">Tout : ' + F(s) + '</button>' +
        (s >= 200 ? '<button type="button" class="btn btn-sec btn-petit" data-action="op-moitie">Moitié</button>' : '') + '</div>' +
        (m ? (m > s ? '<p class="aide erreur-texte">' + ic('alerte') + 'Plus que ce qu\'il doit (' + F(s) + ').</p>' : '<p class="aide">Reste après : <b>' + F(s - m) + '</b></p>') : '');
    }
    var plafond = c ? c.plafond : (etat.reglages.plafondDefaut || 0);
    var lim = CB.controleLimite(s, m, plafond);
    var html = '';
    if (FO.articles.length && FO.manuel) {
      var tot = CB.totalLignes(FO.articles);
      if (tot && tot !== m) html += '<p class="aide">Articles : ' + F(tot) + ' <button type="button" class="lien" data-action="op-total-articles">utiliser</button></p>';
    }
    if (m && (c || FO.nouveauNom)) html += '<p class="aide">Nouveau total : <b>' + F(lim.apres) + '</b></p>';
    if (lim.depasse) html += '<p class="avertissement">' + ic('alerte') + 'Dépasse la limite de ' + F(lim.plafond) + ' (de ' + F(lim.de) + ')</p>';
    return html;
  }
  function htmlPuces(genre, lignes) {
    var liste = produitsGenre(genre);
    var compte = {};
    (lignes || []).forEach(function (a) { if (a.pid) compte[a.pid] = (compte[a.pid] || 0) + a.qte; });
    return liste.map(function (p) {
      return '<button type="button" class="puce' + (compte[p.id] ? ' choisie' : '') + '" data-action="puce" data-id="' + esc(p.id) + '">' +
        '<span class="puce-nom">' + esc(p.nom) + '</span>' + (p.prix ? '<span class="puce-prix">' + F(p.prix) + '</span>' : '') +
        (compte[p.id] ? '<b class="puce-compte" aria-label="' + compte[p.id] + ' choisi">' + compte[p.id] + '</b>' : '') + '</button>';
    }).join('') + '<a class="puce puce-gerer" href="#/produits/' + genre + '">' + ic('plus') + '<span class="puce-nom">' + (genre === 'plat' ? 'Mes plats' : 'Mes produits') + '</span></a>';
  }
  function htmlArticles(lignes, avecPrix) {
    return (lignes || []).map(function (a, i) {
      return '<li class="article"><span class="art-nom">' + esc(a.nom) + (a.prix ? '<small>' + F(a.prix) + (avecPrix ? '' : '') + '</small>' : '') + '</span>' +
        '<span class="qte"><button type="button" data-action="art-moins" data-i="' + i + '" aria-label="Un de moins">' + ic('moins') + '</button>' +
        '<b>' + esc(String(a.qte).replace('.', ',')) + '</b><button type="button" data-action="art-plus" data-i="' + i + '" aria-label="Un de plus">' + ic('plus') + '</button></span>' +
        (a.prix ? '<span class="art-total">' + F(Math.round(a.qte * a.prix)) + '</span>' : '') + '</li>';
    }).join('');
  }
  function majOp(parts) {
    if (!FO) return;
    if (parts.client) $('#op-client').innerHTML = htmlOpClient();
    if (parts.articles) {
      if ($('#op-puces')) $('#op-puces').innerHTML = htmlPuces('produit', FO.articles);
      if ($('#op-articles')) $('#op-articles').innerHTML = htmlArticles(FO.articles);
      if (!FO.manuel) { var t = CB.totalLignes(FO.articles); FO.montant = t || null; $('#op-montant').value = t ? CB.formatNombre(t, ' ') : ''; }
    }
    if (parts.montant) $('#op-montant').value = FO.montant ? CB.formatNombre(FO.montant, ' ') : '';
    $('#op-aide').innerHTML = htmlOpAide();
    var e = $('#op-erreur'); if (e) e.hidden = true;
  }
  function erreurOp(msg) { var e = $('#op-erreur'); e.textContent = msg; e.hidden = false; e.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  function ajouterArticle(lignes, p) {
    for (var i = 0; i < lignes.length; i++) if (lignes[i].pid === p.id) { lignes[i].qte++; return; }
    lignes.push({ pid: p.id, nom: p.nom, qte: 1, prix: p.prix || 0 });
  }
  function enregistrerOperation() {
    var c = client(FO.clientId);
    FO.note = ($('#op-note') ? $('#op-note').value : FO.note).trim();
    FO.date = $('#op-date') && CB.jourValide($('#op-date').value) ? $('#op-date').value : FO.date;
    if (!c && !FO.nouveauNom) return erreurOp('Choisissez le client.');
    if (!CB.montantValide(FO.montant)) return erreurOp('Tapez le montant.');
    if (FO.date > auj()) return erreurOp('La date ne peut pas être dans le futur.');
    if (FO.type === 'paiement') {
      var s = soldeAvantOp();
      if (!c || s <= 0) return erreurOp((c ? c.nom : FO.nouveauNom) + ' ne doit rien.');
      if (FO.montant > s) return erreurOp((c.nom) + ' doit seulement ' + F(s) + '.');
    } else if (!FO.limiteOk) {
      var plafond = c ? c.plafond : (etat.reglages.plafondDefaut || 0);
      var lim = CB.controleLimite(soldeAvantOp(), FO.montant, plafond);
      if (lim.depasse) {
        return confirmer({ titre: 'Limite dépassée', texte: esc((c ? c.nom : FO.nouveauNom) + ' devra ' + F(lim.apres) + ', au-dessus de sa limite de ' + F(lim.plafond) + '.'), ok: 'Noter quand même', non: 'Annuler' })
          .then(function (ok) { if (ok) { FO.limiteOk = true; enregistrerOperation(); } });
      }
    }
    var nouveau = null;
    if (!c) {
      if (!CB.peutAjouterClient(etat.clients.length, premium())) return limiteClients();
      nouveau = { id: uid(), nom: CB.nomPropre(FO.nouveauNom).slice(0, 60), tel: '', plafond: etat.reglages.plafondDefaut || 0, photo: '', cree: Date.now(), relances: [] };
      c = nouveau;
    }
    var op = { id: FO.opId || uid(), clientId: c.id, type: FO.type, montant: FO.montant, date: FO.date, note: FO.note,
      articles: FO.type === 'credit' ? FO.articles.map(function (a) { return { nom: a.nom, qte: a.qte, prix: a.prix, pid: a.pid || null }; }) : [],
      cree: Date.now(), source: FO.source || 'main' };
    if (FO.opId) etat.ops.forEach(function (o) { if (o.id === FO.opId) op.cree = o.cree; });
    noterOperation(op, nouveau, !!FO.opId);
  }
  function noterOperation(op, nouveau, correction) {
    var lot = [['ops', op]];
    if (nouveau) { etat.clients.push(nouveau); lot.push(['clients', nouveau]); }
    var ancien = null;
    etat.ops = etat.ops.filter(function (o) { if (o.id === op.id) { ancien = o; return false; } return true; });
    etat.ops.push(op);
    changer();
    return DB.lot(lot).then(function () {
      FO = null;
      var c = client(op.clientId);
      allerA('#/client/' + op.clientId, true);
      var msg = correction ? 'Corrigé.' : (op.type === 'credit' ? 'Crédit noté : ' : 'Paiement noté : ') + F(op.montant) + ' — ' + c.nom;
      toast(msg, correction ? null : { label: 'Annuler', fn: function () {
        // l'écran change tout de suite ; l'écriture suit
        var ecritures = [['-', 'ops', op.id]];
        etat.ops = etat.ops.filter(function (x) { return x.id !== op.id; });
        if (nouveau && !opsClient(nouveau.id).length) { etat.clients = etat.clients.filter(function (x) { return x.id !== nouveau.id; }); ecritures.push(['-', 'clients', nouveau.id]); }
        if (ancien) { etat.ops.push(ancien); ecritures.push(['ops', ancien]); }
        changer();
        allerA('#/', true);
        toast('Annulé.');
        DB.lot(ecritures).catch(function (e) { toast('Annulation impossible : ' + (e && e.message || e)); });
      } });
    }).catch(function (e) { toast('Enregistrement impossible : ' + (e && e.message || e)); });
  }
  function limiteClients() {
    ouvrirFeuille('<div class="feuille-icone jaune">' + ic('etoile') + '</div><h2 id="feuille-titre">' + CB.CLIENTS_GRATUITS + ' clients : le maximum gratuit</h2>' +
      '<p class="feuille-texte">Avec le <b>Pass Carnet Boutique</b> (3 000 F pour 12 mois) : clients sans limite, relevés PDF, ardoise sans limite.</p>' +
      '<p class="feuille-texte petit">Vos ' + etat.clients.length + ' clients restent utilisables, même sans pass.</p>' +
      '<div class="pile-boutons"><a class="btn btn-principal" href="#/pass">' + ic('etoile') + 'Voir le pass</a>' +
      '<button type="button" class="btn btn-sec" data-action="fermer">Plus tard</button></div>');
  }

  // ---------------------------------------------------------------- Fiche client : création / modification
  var photoTemp = null;
  function vueClientForm(id) {
    var c = id && id !== 'nouveau' ? client(id) : null;
    if (id && id !== 'nouveau' && !c) return allerA('#/', true);
    if (!c && !CB.peutAjouterClient(etat.clients.length, premium())) { vue('', 'Nouveau client', { onglet: 'carnet', parent: '#/' }); return limiteClients(); }
    photoTemp = c ? c.photo || '' : '';
    var html = '<form data-form="client" class="form-client" novalidate data-id="' + esc(c ? c.id : '') + '">' +
      '<button type="button" class="fiche-photo" data-action="photo-form" aria-label="Prendre une photo"><span id="photo-zone">' + avatar(c ? Object.assign({}, c, { photo: photoTemp }) : { nom: '?' }, 'xl') + '</span><span class="photo-badge">' + ic('camera') + '</span></button>' +
      '<p class="aide centre">Photo : reste dans ce téléphone</p>' +
      '<label class="label" for="c-nom">Nom ou surnom</label>' +
      '<input id="c-nom" class="champ champ-grand" maxlength="60" required value="' + esc(c ? c.nom : '') + '" autocomplete="off" placeholder="Ex. : Tata Awa">' +
      '<label class="label" for="c-tel">Téléphone <span class="facultatif">(pour WhatsApp)</span></label>' +
      '<input id="c-tel" class="champ" type="tel" inputmode="tel" maxlength="20" value="' + esc(c && c.tel ? CB.afficherTel(c.tel) : '') + '" placeholder="77 000 00 00" autocomplete="off">' +
      '<p class="aide">Le numéro reste dans ce téléphone. Il sert seulement à ouvrir WhatsApp.</p>' +
      '<label class="label" for="c-plafond">Limite de crédit <span class="facultatif">(facultatif)</span></label>' +
      '<div class="montant-saisie petit"><input id="c-plafond" inputmode="numeric" autocomplete="off" placeholder="Pas de limite" value="' + (c && c.plafond ? CB.formatNombre(c.plafond, ' ') : (!c && etat.reglages.plafondDefaut ? CB.formatNombre(etat.reglages.plafondDefaut, ' ') : '')) + '"><span aria-hidden="true">F</span></div>' +
      '<p class="erreur" id="c-erreur" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-principal btn-xl">' + ic('check') + 'Enregistrer</button>' +
      (c ? '<button type="button" class="btn btn-danger-sec btn-large" data-action="client-supprimer" data-id="' + esc(c.id) + '">' + ic('poubelle') + 'Supprimer ce client</button>' : '') +
      '</form>';
    vue(html, c ? 'Modifier' : 'Nouveau client', { onglet: 'carnet', parent: c ? '#/client/' + c.id : '#/' });
    if (!c) setTimeout(function () { var n = $('#c-nom'); if (n) n.focus(); }, 50);
  }
  function enregistrerClient(form) {
    var id = form.getAttribute('data-id'), c = id ? client(id) : null;
    var nom = $('#c-nom').value.trim().replace(/\s+/g, ' ');
    var err = function (m) { var e = $('#c-erreur'); e.textContent = m; e.hidden = false; };
    if (!nom) return err('Tapez le nom ou le surnom.');
    var telTxt = $('#c-tel').value.trim(), tel = telTxt ? CB.normaliserTel(telTxt) : '';
    if (telTxt && !tel) return err('Numéro incomplet. Exemple : 77 123 45 67');
    var plTxt = $('#c-plafond').value.trim(), plafond = plTxt ? CB.lireMontant(plTxt) : 0;
    if (plTxt && !plafond) return err('Limite : tapez un nombre, par exemple 10 000.');
    var doublon = etat.clients.some(function (x) { return x.id !== id && CB.normaliser(x.nom) === CB.normaliser(nom); });
    if (doublon && !form.getAttribute('data-doublon')) { form.setAttribute('data-doublon', '1'); return err('Un client porte déjà ce nom. Ajoutez un détail (quartier, surnom) ou touchez encore Enregistrer.'); }
    if (!c && !CB.peutAjouterClient(etat.clients.length, premium())) return limiteClients();
    var n = c ? Object.assign({}, c) : { id: uid(), cree: Date.now(), relances: [] };
    n.nom = nom.slice(0, 60); n.tel = tel || ''; n.plafond = plafond || 0; n.photo = photoTemp || '';
    DB.mettre('clients', n).then(function () {
      if (c) etat.clients = etat.clients.map(function (x) { return x.id === n.id ? n : x; }); else etat.clients.push(n);
      changer();
      allerA('#/client/' + n.id, true);
      toast(c ? 'Client modifié.' : 'Client ajouté : ' + n.nom);
    });
  }
  function supprimerClient(id) {
    var c = client(id), r = resume(id);
    confirmer({ titre: 'Supprimer ' + c.nom + ' ?', texte: (r.solde > 0 ? '<b>' + esc(c.nom) + ' doit encore ' + F(r.solde) + '.</b> ' : '') + 'Tout son historique sera effacé de ce téléphone.', ok: 'Supprimer', danger: true }).then(function (ok) {
      if (!ok) return;
      var ops = opsClient(id);
      DB.lot([['-', 'clients', id]].concat(ops.map(function (o) { return ['-', 'ops', o.id]; }))).then(function () {
        etat.clients = etat.clients.filter(function (x) { return x.id !== id; });
        etat.ops = etat.ops.filter(function (o) { return o.clientId !== id; });
        changer();
        allerA('#/', true);
        toast('Client supprimé.');
      });
    });
  }
  // Photo : réduite à 320 px (carré) dans le téléphone, jamais envoyée
  function reduirePhoto(fichier) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(fichier), img = new Image();
      img.onload = function () {
        var cote = Math.min(img.naturalWidth, img.naturalHeight), t = Math.min(320, cote);
        var cv = document.createElement('canvas'); cv.width = t; cv.height = t;
        var ctx = cv.getContext('2d');
        ctx.drawImage(img, (img.naturalWidth - cote) / 2, (img.naturalHeight - cote) / 2, cote, cote, 0, 0, t, t);
        URL.revokeObjectURL(url);
        ok(cv.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('Photo illisible.')); };
      img.src = url;
    });
  }
  var photoCible = null;
  function choisirPhoto(cible) { photoCible = cible; var f = $('#f-photo'); f.value = ''; f.click(); }
  function photoChoisie(fichier) {
    reduirePhoto(fichier).then(function (data) {
      if (photoCible === 'form') { photoTemp = data; var z = $('#photo-zone'); if (z) z.innerHTML = avatar({ nom: $('#c-nom').value || '?', photo: data }, 'xl'); return; }
      var c = client(photoCible); if (!c) return;
      var n = Object.assign({}, c, { photo: data });
      return DB.mettre('clients', n).then(function () { etat.clients = etat.clients.map(function (x) { return x.id === n.id ? n : x; }); router(); toast('Photo enregistrée.'); });
    }).catch(function (e) { toast(e.message); });
  }

  // ---------------------------------------------------------------- Rappels WhatsApp (jamais envoyés automatiquement)
  function rappeler(id) {
    var c = client(id), r = resume(id);
    if (!c || r.solde <= 0) return;
    var ton = etat.reglages.ton || 'normal';
    var donnees = { nom: c.nom, solde: r.solde, depuis: r.depuis, boutique: etat.reglages.boutique, paiement: etat.reglages.paiement };
    var partageTexte = !c.tel && !!navigator.share;
    var f = ouvrirFeuille('<h2 id="feuille-titre">Rappeler ' + esc(c.nom) + '</h2>' +
      '<p class="feuille-montant dette">' + F(r.solde) + '</p>' +
      '<div class="seg seg-ton" role="radiogroup" aria-label="Ton du message">' +
      CB.TONS.map(function (t) { return '<button type="button" role="radio" data-ton="' + t + '" aria-checked="' + (t === ton) + '">' + { amical: '🙂 Amical', normal: 'Normal', ferme: 'Ferme' }[t] + '</button>'; }).join('') + '</div>' +
      '<label class="label" for="rappel-texte">Message</label>' +
      '<textarea id="rappel-texte" class="champ apercu" rows="6"></textarea>' +
      (partageTexte ? '<button type="button" class="btn btn-whatsapp btn-xl" id="rappel-partager">' + ic('partager') + 'Envoyer…</button>' : '') +
      '<a class="btn ' + (partageTexte ? 'btn-sec' : 'btn-whatsapp btn-xl') + '" id="rappel-wa" target="_blank" rel="noopener noreferrer" href="#">' + ic('whatsapp') + 'Ouvrir WhatsApp</a>' +
      (c.tel ? '<p class="aide centre">Pour le ' + esc(CB.afficherTel(c.tel)) + '</p>' : '<p class="aide centre">Pas de numéro : choisissez le contact dans WhatsApp. <a href="#/client-modifier/' + encodeURIComponent(id) + '">Ajouter le numéro</a></p>') +
      '<p class="aide centre petit">' + ic('bouclier', 'ic-mini') + 'C\'est vous qui envoyez. Rien ne part tout seul.</p>');
    var zone = $('#rappel-texte', f), lien = $('#rappel-wa', f);
    function maj() { lien.href = CB.lienWhatsApp(c.tel, zone.value); zone.style.height = 'auto'; zone.style.height = (zone.scrollHeight + 4) + 'px'; }
    function choisirTon(t) {
      ton = t;
      $$('[data-ton]', f).forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-ton') === t)); });
      zone.value = CB.messageRappel(t, donnees);
      maj();
    }
    $$('[data-ton]', f).forEach(function (b) { b.addEventListener('click', function () { choisirTon(b.getAttribute('data-ton')); }); });
    zone.addEventListener('input', maj);
    choisirTon(ton);
    lien.addEventListener('click', function () { marquerRelance(c.id, ton); });
    var bp = $('#rappel-partager', f);
    if (bp) bp.addEventListener('click', function () {
      navigator.share({ text: zone.value }).then(function () { marquerRelance(c.id, ton); }).catch(function () { /* partage annulé */ });
    });
  }
  function marquerRelance(id, ton) {
    var c = client(id); if (!c) return;
    var n = Object.assign({}, c, { relanceLe: auj(), relances: (c.relances || []).concat([{ le: auj(), ton: ton }]).slice(-20) });
    etat.clients = etat.clients.map(function (x) { return x.id === id ? n : x; });
    DB.mettre('clients', n).then(function () {
      setTimeout(function () { fermerFeuille(true); router(); toast('Relancé le ' + CB.dateComplete(n.relanceLe) + '.'); }, 300);
    });
  }

  // ---------------------------------------------------------------- Relevé PDF
  function partagerOuTelecharger(blob, nom, titre) {
    var fichier = null;
    try { fichier = new File([blob], nom, { type: blob.type }); } catch (e) { fichier = null; }
    if (fichier && navigator.canShare && navigator.share) {
      try {
        if (navigator.canShare({ files: [fichier] })) return navigator.share({ files: [fichier], title: titre }).catch(function (e) { if (e && e.name !== 'AbortError') telecharger(blob, nom); });
      } catch (e) { /* on télécharge */ }
    }
    telecharger(blob, nom);
    return Promise.resolve();
  }
  function telecharger(blob, nom) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nom; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000);
  }
  function releve(id) {
    if (!premium()) {
      return ouvrirFeuille('<div class="feuille-icone jaune">' + ic('pdf') + '</div><h2 id="feuille-titre">Relevé PDF : avec le pass</h2>' +
        '<p class="feuille-texte">Le relevé montre au client chaque crédit, chaque paiement et ce qui reste. Vous l\'envoyez sur WhatsApp.</p>' +
        '<div class="pile-boutons"><a class="btn btn-principal" href="#/pass">' + ic('etoile') + 'Pass Carnet Boutique : 3 000 F / an</a>' +
        '<button type="button" class="btn btn-sec" data-action="fermer">Plus tard</button></div>');
    }
    var c = client(id);
    toast('Préparation du relevé…');
    window.CBPDF.releve({ boutique: etat.reglages.boutique, paiement: etat.reglages.paiement, client: c, lignes: CB.historique(opsClient(id)), resume: resume(id), jour: auj() })
      .then(function (blob) { cacherToast(); return partagerOuTelecharger(blob, 'releve-' + slug(c.nom) + '-' + auj() + '.pdf', 'Relevé ' + c.nom); })
      .catch(function (e) { toast(e && e.message || 'Relevé impossible.'); });
  }

  // ---------------------------------------------------------------- Voix
  var Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
  // Pas d'appel à Reco.available() : il fait planter certaines versions de Chrome.
  var ecoute = null;
  function voix() {
    if (!Reco) return;
    if (!etat.reglages.voixAccord) {
      var f = ouvrirFeuille('<div class="feuille-icone">' + ic('micro') + '</div><h2 id="feuille-titre">Noter en parlant</h2>' +
        '<p class="feuille-texte">Dites le nom, le montant, puis les articles :</p>' +
        '<p class="exemple">« Mamadou 2500 riz »</p><p class="exemple">« Fatou a payé 1000 »</p>' +
        '<p class="feuille-texte petit">Selon le téléphone, la voix peut passer par le service de dictée (Google ou Apple). Le carnet, lui, reste dans le téléphone. Chaque phrase vous est montrée avant d\'être notée.</p>' +
        '<button type="button" class="btn btn-principal btn-xl" id="voix-accord" autofocus>' + ic('micro') + 'Commencer</button>');
      $('#voix-accord', f).addEventListener('click', function () { etat.reglages.voixAccord = true; sauverReglages(); ecouter(); });
      return;
    }
    ecouter();
  }
  function ecouter() {
    var rec;
    try { rec = new Reco(); } catch (e) { return toast('Micro indisponible sur ce téléphone.'); }
    rec.lang = 'fr-FR'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
    var recu = false;
    ecoute = rec;
    ouvrirFeuille('<div class="micro-anime" aria-hidden="true">' + ic('micro') + '</div><h2 id="feuille-titre" class="centre">J\'écoute…</h2>' +
      '<p class="exemple">« Mamadou 2500 riz »</p><button type="button" class="btn btn-sec" data-action="fermer">Annuler</button>',
    { classe: 'feuille-ecoute', surFermeture: function () { try { rec.abort(); } catch (e) { /* rien */ } } });
    rec.onresult = function (e) {
      var r = e.results[e.results.length - 1];
      if (r && r.isFinal === false) return;
      var t = r && r[0] ? r[0].transcript : '';
      recu = true;
      fermerFeuille(true);
      confirmerVoix(CB.analyserPhrase(t, etat.clients, produitsGenre('produit')));
    };
    rec.onerror = function (e) {
      recu = true;
      fermerFeuille(true);
      var m = { 'not-allowed': 'Micro refusé. Autorisez le micro pour cette page dans le navigateur.', 'service-not-allowed': 'Micro refusé. Autorisez le micro pour cette page dans le navigateur.',
        'no-speech': 'Je n\'ai rien entendu. Réessayez, plus près du téléphone.', network: 'La dictée a besoin d\'Internet sur ce téléphone. Notez à la main.',
        'audio-capture': 'Aucun micro trouvé.', 'language-not-supported': 'Le français n\'est pas disponible pour la dictée sur ce téléphone.' }[e && e.error];
      if (e && e.error === 'aborted') return;
      toast(m || 'La dictée n\'a pas marché. Réessayez.');
    };
    rec.onend = function () { if (!recu && feuilleOuverte) { fermerFeuille(true); toast('Je n\'ai rien entendu. Réessayez.'); } };
    try { rec.start(); } catch (e) { fermerFeuille(true); toast('Micro indisponible.'); }
  }
  var VX = null;
  function confirmerVoix(a) {
    VX = { type: a.type, clientId: a.clientId, nom: a.nom, candidats: a.candidats, montant: a.montant, articles: a.articles.map(function (x) { return Object.assign({}, x); }), texte: a.texte, articlesTexte: null };
    rendreVoix();
  }
  function rendreVoix() {
    var c = client(VX.clientId), cr = VX.type === 'credit';
    var blocClient;
    if (c) blocClient = '<div class="client-choisi">' + avatar(c, 'm') + '<span class="cc-corps"><span class="cc-nom">' + esc(c.nom) + '</span><span class="cc-sous">' + (resume(c.id).solde > 0 ? 'doit ' + F(resume(c.id).solde) : 'à jour') + '</span></span>' +
      (VX.candidats.length > 1 ? '<button type="button" class="btn btn-sec btn-petit" data-vx="autre">Changer</button>' : '') + '</div>';
    else if (VX.candidats.length > 1) blocClient = '<p class="label">Quel client ?</p><ul class="choix-liste">' + VX.candidats.map(function (k) {
      return '<li><button type="button" class="choix" data-vx="client" data-id="' + esc(k.id) + '">' + avatar(k, 's') + '<span>' + esc(k.nom) + '</span>' + (resume(k.id).solde > 0 ? '<b class="dette">' + F(resume(k.id).solde) + '</b>' : '') + '</button></li>';
    }).join('') + '</ul>' + (cr ? '<label class="label" for="vx-nom">Ou nouveau client</label><input id="vx-nom" class="champ" value="">' : '');
    else blocClient = '<label class="label" for="vx-nom">' + (VX.nom ? 'Nouveau client' : 'Client') + '</label><input id="vx-nom" class="champ champ-grand" maxlength="60" value="' + esc(VX.nom) + '" placeholder="Nom du client">';
    var lim = c && cr ? CB.controleLimite(resume(c.id).solde, VX.montant || 0, c.plafond) : null;
    var artTxt = VX.articlesTexte != null ? VX.articlesTexte : CB.texteArticles(VX.articles);
    var f = ouvrirFeuille('<h2 id="feuille-titre">Vérifiez</h2>' +
      '<p class="phrase-dite">' + ic('micro', 'ic-mini') + '« ' + esc(VX.texte) + ' »</p>' +
      '<div class="seg seg-type" role="group" aria-label="Type"><button type="button" data-vx="type" data-type="credit" aria-pressed="' + cr + '">' + ic('credit') + 'Crédit</button>' +
      '<button type="button" data-vx="type" data-type="paiement" aria-pressed="' + !cr + '">' + ic('paiement') + 'Paiement</button></div>' +
      blocClient +
      '<label class="label" for="vx-montant">Montant</label>' +
      '<div class="montant-saisie"><input id="vx-montant" inputmode="numeric" autocomplete="off" value="' + (VX.montant ? CB.formatNombre(VX.montant, ' ') : '') + '" placeholder="0"><span aria-hidden="true">F</span></div>' +
      (cr ? '<label class="label" for="vx-articles">Articles</label><input id="vx-articles" class="champ" maxlength="200" value="' + esc(artTxt) + '" placeholder="Facultatif">' : '') +
      (lim && lim.depasse ? '<p class="avertissement">' + ic('alerte') + 'Dépasse la limite de ' + F(lim.plafond) + ' (de ' + F(lim.de) + ')</p>' : '') +
      '<p class="erreur" id="vx-erreur" role="alert" hidden></p>' +
      '<button type="button" class="btn btn-xl ' + (cr ? 'btn-credit' : 'btn-paiement') + '" data-vx="ok">' + ic('check') + (cr ? 'Noter le crédit' : 'Encaisser') + '</button>' +
      '<div class="pile-boutons rangee"><button type="button" class="btn btn-sec" data-vx="redire">' + ic('micro') + 'Redire</button>' +
      '<button type="button" class="btn btn-sec" data-vx="detail">' + ic('crayon') + 'Plus de détails</button></div>', { classe: 'feuille-voix' });
    function lire() {
      var m = $('#vx-montant', f); VX.montant = CB.lireMontant(m.value);
      var n = $('#vx-nom', f); if (n) VX.nom = n.value.trim();
      var at = $('#vx-articles', f); if (at && at.value !== CB.texteArticles(VX.articles)) VX.articlesTexte = at.value;
    }
    f.addEventListener('click', function (e) {
      var b = e.target.closest('[data-vx]'); if (!b) return;
      var k = b.getAttribute('data-vx');
      lire();
      if (k === 'type') { VX.type = b.getAttribute('data-type'); rendreVoix(); }
      else if (k === 'client') { VX.clientId = b.getAttribute('data-id'); rendreVoix(); }
      else if (k === 'autre') { VX.clientId = null; rendreVoix(); }
      else if (k === 'redire') { ecouter(); }
      else if (k === 'detail') { versFormulaire(); }
      else if (k === 'ok') { validerVoix(f); }
    });
  }
  function articlesVoix() {
    if (VX.articlesTexte == null) return VX.articles.map(function (a) { return { nom: a.nom, qte: a.qte, prix: a.prix }; });
    return VX.articlesTexte.split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return { nom: CB.majuscule(s).slice(0, 80), qte: 1, prix: 0 }; });
  }
  function versFormulaire() {
    var cle = '#/operation?type=' + VX.type + (VX.clientId ? '&client=' + encodeURIComponent(VX.clientId) : '');
    FO = { type: VX.type, clientId: VX.clientId, nouveauNom: VX.clientId ? '' : CB.nomPropre(VX.nom || ''), recherche: '', montant: VX.montant, manuel: !!VX.montant,
      articles: VX.type === 'credit' ? articlesVoix() : [], date: auj(), note: '', opId: null, limiteOk: false, cle: cle, source: 'voix' };
    fermerFeuille(true);
    allerA(cle);
  }
  function validerVoix(f) {
    var err = function (m) { var e = $('#vx-erreur', f); e.textContent = m; e.hidden = false; };
    var c = client(VX.clientId);
    if (!c && !VX.nom) return err('Choisissez ou tapez le client.');
    if (!CB.montantValide(VX.montant)) return err('Tapez le montant.');
    if (!c) {
      // le nom tapé correspond peut-être exactement à un client existant
      etat.clients.forEach(function (x) { if (CB.normaliser(x.nom) === CB.normaliser(VX.nom)) c = x; });
    }
    if (VX.type === 'paiement') {
      var s = c ? resume(c.id).solde : 0;
      if (!c || s <= 0) return err((c ? c.nom : VX.nom) + ' ne doit rien.');
      if (VX.montant > s) return err(c.nom + ' doit seulement ' + F(s) + '.');
    }
    var go = function () {
      var nouveau = null;
      if (!c) {
        if (!CB.peutAjouterClient(etat.clients.length, premium())) { fermerFeuille(true); return limiteClients(); }
        nouveau = { id: uid(), nom: CB.nomPropre(VX.nom).slice(0, 60), tel: '', plafond: etat.reglages.plafondDefaut || 0, photo: '', cree: Date.now(), relances: [] };
        c = nouveau;
      }
      var op = { id: uid(), clientId: c.id, type: VX.type, montant: VX.montant, date: auj(), note: '', articles: VX.type === 'credit' ? articlesVoix() : [], cree: Date.now(), source: 'voix' };
      fermerFeuille(true);
      noterOperation(op, nouveau, false);
    };
    if (VX.type === 'credit' && c) {
      var lim = CB.controleLimite(resume(c.id).solde, VX.montant, c.plafond);
      if (lim.depasse) {
        var vx = VX;
        return confirmer({ titre: 'Limite dépassée', texte: esc(c.nom + ' devra ' + F(lim.apres) + ', au-dessus de sa limite de ' + F(lim.plafond) + '.'), ok: 'Noter quand même' })
          .then(function (ok) { VX = vx; if (ok) go(); else rendreVoix(); });
      }
    }
    go();
  }

  // ---------------------------------------------------------------- Ardoise
  function vueArdoise(p) {
    var jour = CB.jourValide(p.get('j')) ? p.get('j') : auj();
    var liste = etat.ardoise.filter(function (c) { return c.date === jour; }).sort(function (a, b) {
      var fa = a.paye || a.carnet, fb = b.paye || b.carnet;
      if (fa !== fb) return fa ? 1 : -1;
      return (a.cree || 0) - (b.cree || 0);
    });
    var b = CB.bilanArdoise(etat.ardoise, jour), estAuj = jour === auj();
    var essai = !premium() ? Math.max(0, CB.ESSAI_ARDOISE - (etat.reglages.nbCommandes || 0)) : null;
    var html = '<div class="jour-nav"><a class="btn-rond" href="#/ardoise?j=' + CB.decalerJour(jour, -1) + '" aria-label="Jour précédent">' + ic('gauche') + '</a>' +
      '<p><b>' + (estAuj ? "Aujourd'hui" : CB.majuscule(CB.jourSemaine(jour))) + '</b><span>' + CB.dateLongue(jour) + '</span></p>' +
      (estAuj ? '<span class="btn-rond invisible"></span>' : '<a class="btn-rond" href="#/ardoise?j=' + CB.decalerJour(jour, 1) + '" aria-label="Jour suivant">' + ic('droite') + '</a>') + '</div>' +
      '<section class="kpis-3" aria-label="Total du jour">' +
      '<div class="kpi"><p>Total</p><b id="ard-total">' + F(b.total) + '</b><small>' + b.nb + ' commande' + (b.nb > 1 ? 's' : '') + '</small></div>' +
      '<div class="kpi kpi-paye"><p>Encaissé</p><b id="ard-encaisse">' + F(b.encaisse) + '</b></div>' +
      '<div class="kpi kpi-attente"><p>À encaisser</p><b id="ard-attente">' + F(b.aEncaisser) + '</b>' + (b.auCarnet ? '<small>+ ' + F(b.auCarnet) + ' au carnet</small>' : '') + '</div></section>' +
      (estAuj ? '<a class="btn btn-principal btn-xl" href="#/commande/nouvelle">' + ic('plus') + 'Nouvelle commande</a>' : '') +
      (essai != null && estAuj ? '<p class="aide centre">' + (essai > 0 ? 'Essai gratuit : encore ' + essai + ' commande' + (essai > 1 ? 's' : '') + '. ' : 'Essai terminé. ') + '<a href="#/pass">Pass pour l\'ardoise sans limite</a></p>' : '') +
      (liste.length ? '<ul class="commandes">' + liste.map(carteCommande).join('') + '</ul>' : '<section class="vide petit">' + ic('ardoise', 'ic-xl') + '<p>Aucune commande ce jour.</p></section>');
    vue(html, 'Ardoise', { onglet: 'ardoise' });
  }
  function carteCommande(c) {
    var t = CB.totalCommande(c), fini = c.paye || c.carnet;
    var etapes = [['attente', 'horloge', 'En cours'], ['pret', 'check', 'Prêt'], ['livre', 'moto', 'Livré']];
    var rang = { attente: 0, pret: 1, livre: 2 }[c.statut] || 0;
    var heure = c.cree ? new Date(c.cree).toTimeString().slice(0, 5) : '';
    return '<li class="commande' + (fini ? ' finie' : '') + ' statut-' + c.statut + '" data-id="' + esc(c.id) + '">' +
      '<div class="cmd-tete"><span class="cmd-client">' + esc(c.client || 'Sans nom') + '</span><span class="cmd-heure">' + heure + '</span><b class="cmd-total">' + F(t) + '</b></div>' +
      '<ul class="cmd-lignes">' + c.lignes.map(function (l) { return '<li><span>' + esc((l.qte !== 1 ? String(l.qte).replace('.', ',') + ' × ' : '') + l.nom) + '</span><span>' + F(Math.round(l.qte * l.prix)) + '</span></li>'; }).join('') + '</ul>' +
      '<div class="cmd-etapes" role="group" aria-label="Où en est la commande">' + etapes.map(function (e, i) {
        return '<button type="button" class="etape' + (i <= rang ? ' faite' : '') + '" data-action="cmd-statut" data-s="' + e[0] + '" aria-pressed="' + (c.statut === e[0]) + '">' + ic(e[1]) + '<span>' + e[2] + '</span></button>';
      }).join('') +
      '<button type="button" class="etape etape-paye' + (c.paye ? ' faite' : '') + '" data-action="cmd-paye" aria-pressed="' + !!c.paye + '"' + (c.carnet ? ' disabled' : '') + '>' + ic('billet') + '<span>Payé</span></button></div>' +
      '<div class="cmd-pied">' + (c.paye ? '<span class="pastille pastille-paye">' + ic('check') + 'Payé' + (c.payeLe && c.payeLe !== c.date ? ' le ' + CB.dateCourte(c.payeLe) : '') + '</span>'
        : c.carnet ? '<span class="pastille pastille-carnet">' + ic('carnet') + 'Au carnet</span>'
        : '<span class="pastille pastille-attente">À payer</span><button type="button" class="lien" data-action="cmd-carnet">' + ic('carnet', 'ic-mini') + 'Au carnet</button>') +
      '<a class="btn-icone" href="#/commande/' + encodeURIComponent(c.id) + '" aria-label="Modifier la commande ' + esc(c.client || '') + '" title="Modifier">' + ic('crayon') + '</a></div></li>';
  }
  function commande(id) { for (var i = 0; i < etat.ardoise.length; i++) if (etat.ardoise[i].id === id) return etat.ardoise[i]; return null; }
  function majCommande(n) {
    etat.ardoise = etat.ardoise.map(function (x) { return x.id === n.id ? n : x; });
    return DB.mettre('ardoise', n);
  }
  function rafraichirArdoise() {
    var y = window.scrollY;
    router();
    window.scrollTo(0, y);
  }
  var FC = null;
  function vueCommande(id) {
    var c = id && id !== 'nouvelle' ? commande(id) : null;
    if (id && id !== 'nouvelle' && !c) return allerA('#/ardoise', true);
    if (!c && !CB.peutCreerCommande(etat.reglages.nbCommandes || 0, premium())) {
      vue('<section class="vide">' + ic('etoile', 'ic-xl') + '<h2>Essai de l\'ardoise terminé</h2><p>Avec le Pass Carnet Boutique, l\'ardoise est sans limite. Vos commandes déjà notées restent visibles.</p>' +
        '<a class="btn btn-principal btn-xl" href="#/pass">' + ic('etoile') + 'Voir le pass</a></section>', 'Nouvelle commande', { onglet: 'ardoise', parent: '#/ardoise' });
      return;
    }
    if (!FC || FC.cle !== location.hash) {
      FC = c ? { id: c.id, client: c.client, lignes: c.lignes.map(function (l) { return Object.assign({}, l); }), paye: c.paye, cle: location.hash }
        : { id: null, client: '', lignes: [], paye: false, cle: location.hash };
    }
    var html = '<form data-form="commande" class="form-op" novalidate>' +
      '<label class="label" for="cmd-client">Client ou table</label>' +
      '<input id="cmd-client" class="champ champ-grand" maxlength="60" value="' + esc(FC.client) + '" placeholder="Ex. : Table 3, Moussa" autocomplete="off">' +
      '<p class="label">Plats</p><div class="puces" id="cmd-puces">' + htmlPuces('plat', FC.lignes) + '</div>' +
      '<ul class="articles" id="cmd-lignes">' + htmlArticles(FC.lignes, true) + '</ul>' +
      '<div class="ajout-libre ajout-libre-prix"><input id="cmd-libre" class="champ" placeholder="Autre plat" maxlength="80" aria-label="Autre plat">' +
      '<input id="cmd-libre-prix" class="champ" inputmode="numeric" placeholder="Prix" aria-label="Prix de l\'autre plat">' +
      '<button type="button" class="btn btn-sec" data-action="cmd-libre" aria-label="Ajouter le plat">' + ic('plus') + '</button></div>' +
      '<p class="total-ligne">Total <b id="cmd-total">' + F(CB.totalLignes(FC.lignes)) + '</b></p>' +
      '<div class="seg seg-paye" role="group" aria-label="Paiement">' +
      '<button type="button" data-action="cmd-mode" data-paye="0" aria-pressed="' + !FC.paye + '">' + ic('moto') + 'À la livraison</button>' +
      '<button type="button" data-action="cmd-mode" data-paye="1" aria-pressed="' + !!FC.paye + '">' + ic('billet') + 'Déjà payé</button></div>' +
      '<p class="erreur" id="cmd-erreur" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-principal btn-xl">' + ic('check') + 'Enregistrer</button>' +
      (c ? '<button type="button" class="btn btn-danger-sec btn-large" data-action="cmd-supprimer">' + ic('poubelle') + 'Supprimer la commande</button>' : '') +
      '</form>';
    vue(html, c ? 'Modifier la commande' : 'Nouvelle commande', { onglet: 'ardoise', parent: '#/ardoise' + (c && c.date !== auj() ? '?j=' + c.date : '') });
  }
  function majFormCommande() {
    $('#cmd-puces').innerHTML = htmlPuces('plat', FC.lignes);
    $('#cmd-lignes').innerHTML = htmlArticles(FC.lignes, true);
    $('#cmd-total').textContent = F(CB.totalLignes(FC.lignes));
    var e = $('#cmd-erreur'); if (e) e.hidden = true;
  }
  function enregistrerCommande() {
    FC.client = $('#cmd-client').value.trim();
    var err = function (m) { var e = $('#cmd-erreur'); e.textContent = m; e.hidden = false; };
    if (!FC.lignes.length) return err('Ajoutez au moins un plat.');
    if (!CB.totalLignes(FC.lignes)) return err('Les plats n\'ont pas de prix. Tapez un prix.');
    var ancien = FC.id ? commande(FC.id) : null;
    var n = ancien ? Object.assign({}, ancien) : { id: uid(), date: auj(), cree: Date.now(), statut: 'attente', carnet: false, payeLe: null };
    n.client = FC.client.slice(0, 60);
    n.lignes = FC.lignes.map(function (l) { return { nom: l.nom, qte: l.qte, prix: l.prix, pid: l.pid || null }; });
    n.paye = !!FC.paye; n.payeLe = n.paye ? (ancien && ancien.payeLe) || auj() : null;
    var lot = [['ardoise', n]];
    if (!ancien) { etat.ardoise.push(n); etat.reglages.nbCommandes = (etat.reglages.nbCommandes || 0) + 1; lot.push(['kv', etat.reglages, 'reglages']); }
    else etat.ardoise = etat.ardoise.map(function (x) { return x.id === n.id ? n : x; });
    DB.lot(lot).then(function () { FC = null; allerA('#/ardoise' + (n.date !== auj() ? '?j=' + n.date : ''), true); toast(ancien ? 'Commande modifiée.' : 'Commande notée : ' + F(CB.totalCommande(n))); });
  }
  function commandeAuCarnet(id) {
    var cmd = commande(id); if (!cmd) return;
    var t = CB.totalCommande(cmd);
    var proposes = etat.clients.filter(function (c) { return cmd.client && CB.normaliser(c.nom).indexOf(CB.normaliser(cmd.client)) >= 0; }).slice(0, 5);
    var f = ouvrirFeuille('<h2 id="feuille-titre">Mettre au carnet</h2><p class="feuille-montant dette">' + F(t) + '</p>' +
      '<p class="feuille-texte">Le client paiera plus tard. Choisissez son nom :</p>' +
      '<label class="recherche">' + ic('recherche') + '<input type="search" id="ac-cherche" placeholder="Nom du client" value="' + esc(cmd.client) + '" autocomplete="off" aria-label="Nom du client"></label>' +
      '<ul class="choix-liste" id="ac-liste"></ul>');
    function liste() {
      var q = $('#ac-cherche', f).value.trim(), n = CB.normaliser(q);
      var l = etat.clients.filter(function (c) { return !n || CB.normaliser(c.nom).indexOf(n) >= 0; }).slice(0, 8);
      if (!l.length && !n) l = proposes;
      var exact = etat.clients.some(function (c) { return CB.normaliser(c.nom) === n; });
      $('#ac-liste', f).innerHTML = l.map(function (c) { return '<li><button type="button" class="choix" data-ac="' + esc(c.id) + '">' + avatar(c, 's') + '<span>' + esc(c.nom) + '</span></button></li>'; }).join('') +
        (q && !exact ? '<li><button type="button" class="choix choix-nouveau" data-ac="+">' + ic('clientPlus') + '<span>Nouveau client « ' + esc(CB.nomPropre(q)) + ' »</span></button></li>' : '');
    }
    liste();
    $('#ac-cherche', f).addEventListener('input', liste);
    f.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ac]'); if (!b) return;
      var cid = b.getAttribute('data-ac'), nouveau = null;
      if (cid === '+') {
        if (!CB.peutAjouterClient(etat.clients.length, premium())) { fermerFeuille(true); return limiteClients(); }
        nouveau = { id: uid(), nom: CB.nomPropre($('#ac-cherche', f).value.trim()).slice(0, 60), tel: '', plafond: etat.reglages.plafondDefaut || 0, photo: '', cree: Date.now(), relances: [] };
        cid = nouveau.id;
      }
      var op = { id: uid(), clientId: cid, type: 'credit', montant: t, date: cmd.date, note: 'Ardoise' + (cmd.client ? ' (' + cmd.client + ')' : ''), articles: cmd.lignes.map(function (l) { return { nom: l.nom, qte: l.qte, prix: l.prix }; }), cree: Date.now(), source: 'ardoise' };
      var n = Object.assign({}, cmd, { carnet: true, carnetClientId: cid, carnetOpId: op.id });
      var lot = [['ops', op], ['ardoise', n]];
      if (nouveau) { lot.push(['clients', nouveau]); etat.clients.push(nouveau); }
      etat.ops.push(op); etat.ardoise = etat.ardoise.map(function (x) { return x.id === n.id ? n : x; });
      changer();
      DB.lot(lot).then(function () { fermerFeuille(true); rafraichirArdoise(); toast('Mis au carnet de ' + client(cid).nom + ' : ' + F(t)); });
    });
  }

  // ---------------------------------------------------------------- Calculette de marge
  var MG = { achat: '', vente: '', cible: 20, lot: false, prixLot: '', nbLot: '' };
  function nombreSaisi(s) { var t = String(s || '').replace(/[\s ]/g, '').replace(',', '.'); var n = parseFloat(t); return /^\d+(\.\d+)?$/.test(t) && n > 0 ? n : 0; }
  function vueMarge() {
    var html = '<section class="calc">' +
      '<label class="label" for="m-achat">Prix d\'achat</label>' +
      '<div class="montant-saisie"><input id="m-achat" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(MG.achat) + '"' + (MG.lot ? ' readonly' : '') + '><span aria-hidden="true">F</span></div>' +
      '<label class="case"><input type="checkbox" id="m-lot"' + (MG.lot ? ' checked' : '') + '> <span>Acheté en gros (sac, carton…)</span></label>' +
      '<div class="lot" id="m-lot-zone"' + (MG.lot ? '' : ' hidden') + '>' +
      '<div><label class="label" for="m-prixlot">Prix du lot</label><div class="montant-saisie petit"><input id="m-prixlot" inputmode="numeric" autocomplete="off" value="' + esc(MG.prixLot) + '" placeholder="15 000"><span aria-hidden="true">F</span></div></div>' +
      '<span class="lot-div" aria-hidden="true">÷</span>' +
      '<div><label class="label" for="m-nblot">Nombre</label><div class="montant-saisie petit"><input id="m-nblot" inputmode="decimal" autocomplete="off" value="' + esc(MG.nbLot) + '" placeholder="25"></div></div></div>' +
      '<label class="label" for="m-vente">Prix de vente ou offre du client</label>' +
      '<div class="montant-saisie"><input id="m-vente" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(MG.vente) + '"><span aria-hidden="true">F</span></div>' +
      '<p class="label">Marge voulue</p><div class="seg seg-cible" role="group" aria-label="Marge voulue">' +
      [5, 10, 15, 20, 30].map(function (t) { return '<button type="button" data-action="cible" data-c="' + t + '" aria-pressed="' + (MG.cible === t) + '">' + t + '&nbsp;%</button>'; }).join('') + '</div>' +
      '<div id="m-resultat" aria-live="polite">' + htmlMarge() + '</div></section>';
    vue(html, 'Calculette de marge', { onglet: 'marge' });
  }
  function htmlMarge() {
    var r = CB.calculMarge({ achat: nombreSaisi(MG.achat), vente: nombreSaisi(MG.vente), cible: MG.cible, prixLot: MG.lot ? nombreSaisi(MG.prixLot) : 0, nbLot: MG.lot ? nombreSaisi(MG.nbLot) : 0 });
    var h = '';
    if (r.benefice != null) {
      var cls = { ok: 'ok', faible: 'faible', perte: 'perte' }[r.verdict];
      var verdict = { ok: ic('check') + 'Ça va : vous gagnez', faible: ic('alerte') + 'Marge trop faible : il manque ' + F(r.manque), perte: ic('croix') + 'Vous perdez ' + F(-r.benefice) }[r.verdict];
      h += '<section class="resultat resultat-' + cls + '"><p class="res-label">Bénéfice par unité</p>' +
        '<p class="res-grand" id="m-benefice">' + (r.benefice > 0 ? '+' : '') + formatPrix(r.benefice) + '</p>' +
        '<p class="res-taux" id="m-taux">' + (r.tauxAchat > 0 ? '+' : '') + CB.formatTaux(r.tauxAchat) + ' sur l\'achat</p>' +
        '<p class="res-verdict" id="m-verdict">' + verdict + '</p></section>';
    }
    if (r.prixMin != null) {
      h += '<section class="prix-min"><p class="res-label">Prix minimum pour ' + MG.cible + '&nbsp;%</p><p class="res-moyen" id="m-prixmin">' + F(r.prixMin) + '</p>' +
        (MG.lot ? '<p class="aide">Achat d\'une unité : ' + formatPrix(r.achat) + '</p>' : '') + '</section>';
    }
    if (!h) h = '<p class="aide centre">Tapez le prix d\'achat, puis le prix de vente ou l\'offre du client.</p>';
    return h;
  }
  function formatPrix(n) { var a = Math.round(n * 100) / 100; return Math.floor(a) === a ? F(a) : CB.formatNombre(Math.floor(a)) + ',' + String(Math.round((Math.abs(a) % 1) * 100)).padStart(2, '0') + CB.NBSP + 'F'; }
  function majMarge() {
    if (MG.lot) { var r = CB.calculMarge({ prixLot: nombreSaisi(MG.prixLot), nbLot: nombreSaisi(MG.nbLot) }); var a = $('#m-achat'); if (a) { MG.achat = r.achat ? String(Math.round(r.achat * 100) / 100).replace('.', ',') : ''; a.value = MG.achat; } }
    $('#m-resultat').innerHTML = htmlMarge();
  }

  // ---------------------------------------------------------------- Bilan
  function vueBilan(p) {
    var per = { jour: 1, semaine: 7, mois: 30 }[p.get('p')] ? p.get('p') : 'jour';
    var n = { jour: 1, semaine: 7, mois: 30 }[per], fin = auj(), debut = CB.decalerJour(fin, -(n - 1));
    var b = CB.bilanPeriode(etat.ops, etat.ardoise, debut, fin), t = CB.totalDu(etat.clients, R());
    var html = '<div class="seg seg-periode" role="group" aria-label="Période">' + [['jour', "Aujourd'hui"], ['semaine', '7 jours'], ['mois', '30 jours']].map(function (x) {
      return '<a href="#/bilan?p=' + x[0] + '" role="button" aria-pressed="' + (per === x[0]) + '">' + x[1] + '</a>';
    }).join('') + '</div>' +
      '<p class="periode">' + (n === 1 ? CB.majuscule(CB.jourSemaine(fin)) + ' ' + CB.dateLongue(fin) : 'Du ' + CB.dateComplete(debut) + ' au ' + CB.dateComplete(fin)) + '</p>' +
      '<section class="kpis">' +
      '<div class="kpi kpi-dette"><p>' + ic('credit') + 'Crédits donnés</p><b id="b-credits">' + F(b.credits) + '</b><small>' + b.nbCredits + ' crédit' + (b.nbCredits > 1 ? 's' : '') + '</small></div>' +
      '<div class="kpi kpi-paye"><p>' + ic('paiement') + 'Paiements reçus</p><b id="b-paiements">' + F(b.paiements) + '</b><small>' + b.nbPaiements + ' paiement' + (b.nbPaiements > 1 ? 's' : '') + '</small></div>' +
      (b.nbArdoise || etat.ardoise.length ? '<div class="kpi"><p>' + ic('ardoise') + 'Ardoise encaissée</p><b id="b-ardoise">' + F(b.ardoise) + '</b><small>' + b.nbArdoise + ' commande' + (b.nbArdoise > 1 ? 's' : '') + '</small></div>' : '') +
      '<div class="kpi kpi-caisse"><p>' + ic('billet') + 'Argent attendu en caisse</p><b id="b-attendu">' + F(b.attendu) + '</b><small>paiements' + (etat.ardoise.length ? ' + ardoise' : '') + '</small></div>' +
      '<div class="kpi kpi-dehors"><p>' + ic('carnet') + 'Encore dehors</p><b id="b-dehors">' + F(t.total) + '</b><small>' + t.nb + ' client' + (t.nb > 1 ? 's' : '') + ' doivent</small></div>' +
      '</section>';
    if (n === 7) {
      var max = 1;
      Object.keys(b.parJour).forEach(function (j) { var d = b.parJour[j]; max = Math.max(max, d.credits, d.paiements + d.ardoise); });
      html += '<h2 class="titre-section">Jour par jour</h2><ul class="barres" aria-label="Crédits et argent reçu, jour par jour">' + Object.keys(b.parJour).map(function (j) {
        var d = b.parJour[j], recu = d.paiements + d.ardoise;
        var vide = !d.credits && !recu;
        return '<li' + (vide ? ' class="vide-jour"' : '') + '><span class="barres-jour">' + CB.jourSemaine(j).slice(0, 3) + ' ' + CB.dateCourte(j) + '</span><span class="barres-zone">' +
          (vide ? '<span class="barres-rien">—</span>' : (d.credits ? '<span class="barre barre-dette" style="width:' + (d.credits / max * 100) + '%"></span>' : '') +
          (recu ? '<span class="barre barre-paye" style="width:' + (recu / max * 100) + '%"></span>' : '')) + '</span>' +
          '<span class="barres-val">' + (d.credits ? '<span class="dette">+' + CB.formatNombre(d.credits) + '</span>' : '') + (recu ? '<span class="paye">' + CB.formatNombre(recu) + '</span>' : '') + '</span></li>';
      }).join('') + '</ul><p class="legende"><span class="pastille-c dette"></span>crédits <span class="pastille-c paye"></span>argent reçu</p>';
    }
    var top = CB.trierClients(etat.clients, R(), 'gros').filter(function (c) { return R()[c.id].solde > 0; }).slice(0, 5);
    if (top.length) html += '<h2 class="titre-section">Ceux qui doivent le plus</h2><ul class="liste-clients compacte">' + top.map(function (c) {
      return '<li><a class="ligne-client" href="#/client/' + esc(c.id) + '">' + avatar(c, 's') + '<span class="lc-corps"><span class="lc-nom">' + esc(c.nom) + '</span></span><span class="lc-montant dette">' + F(R()[c.id].solde) + '</span></a></li>';
    }).join('') + '</ul>';
    html += '<h2 class="titre-section">Exporter</h2><div class="pile-boutons">' +
      '<button type="button" class="btn btn-sec btn-large" data-action="csv">' + ic('telecharger') + 'Carnet en tableau (CSV)</button>' +
      (etat.ardoise.length ? '<button type="button" class="btn btn-sec btn-large" data-action="csv-ardoise">' + ic('telecharger') + 'Ardoise en tableau (CSV)</button>' : '') +
      '</div><p class="aide">Le relevé PDF d\'un client se fait depuis sa fiche.</p>';
    vue(html, 'Bilan', { onglet: 'bilan' });
  }
  function exporterCsv() {
    var lignes = [['Date', 'Client', 'Type', 'Montant (F)', 'Articles', 'Note', 'Reste du client après (F)']];
    var g = CB.grouperParClient(etat.ops), toutes = [];
    etat.clients.forEach(function (c) { CB.historique(g[c.id] || []).forEach(function (l) { toutes.push({ c: c, l: l }); }); });
    toutes.sort(function (a, b) { return a.l.op.date < b.l.op.date ? -1 : a.l.op.date > b.l.op.date ? 1 : (a.l.op.cree || 0) - (b.l.op.cree || 0); });
    toutes.forEach(function (x) { var o = x.l.op; lignes.push([CB.dateComplete(o.date), x.c.nom, o.type === 'paiement' ? 'Paiement' : 'Crédit', o.montant, CB.texteArticles(o.articles), o.note || '', x.l.soldeApres]); });
    telecharger(new Blob([CB.csv(lignes)], { type: 'text/csv;charset=utf-8' }), 'carnet-boutique-' + auj() + '.csv');
    toast('Tableau enregistré dans Téléchargements.');
  }
  function exporterCsvArdoise() {
    var lignes = [['Date', 'Client ou table', 'Plats', 'Total (F)', 'Étape', 'Paiement']];
    etat.ardoise.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.cree || 0) - (b.cree || 0); }).forEach(function (c) {
      lignes.push([CB.dateComplete(c.date), c.client, CB.texteArticles(c.lignes), CB.totalCommande(c), { attente: 'En cours', pret: 'Prêt', livre: 'Livré' }[c.statut], c.paye ? 'Payé' : c.carnet ? 'Au carnet' : 'À encaisser']);
    });
    telecharger(new Blob([CB.csv(lignes)], { type: 'text/csv;charset=utf-8' }), 'ardoise-' + auj() + '.csv');
    toast('Tableau enregistré dans Téléchargements.');
  }

  // ---------------------------------------------------------------- Plus (réglages)
  function lireTheme() { try { return localStorage.getItem('cb-theme') || 'auto'; } catch (e) { return 'auto'; } }
  function lireTaille() { try { return localStorage.getItem('cb-taille') || 'normale'; } catch (e) { return 'normale'; } }
  function appliquerAffichage() {
    var t = lireTheme(), d = document.documentElement;
    if (t === 'clair') d.setAttribute('data-theme', 'light'); else if (t === 'sombre') d.setAttribute('data-theme', 'dark'); else d.removeAttribute('data-theme');
    if (lireTaille() === 'grande') d.setAttribute('data-taille', 'grande'); else d.removeAttribute('data-taille');
  }
  function vuePlus() {
    var p = pass(), rg = etat.reglages;
    var sauv = etat.sauvegardeLe ? CB.depuisQuand(CB.jourLocal(new Date(etat.sauvegardeLe))) : 'jamais';
    var html = '<a class="carte-pass' + (p.premium ? ' actif' : '') + '" href="#/pass">' + ic('etoile') + '<span><b>' + (p.premium ? 'Pass actif' : 'Version gratuite') + '</b><small>' +
      (p.premium ? "jusqu'au " + new Date(p.fin).toLocaleDateString('fr-FR') : etat.clients.length + ' / ' + CB.CLIENTS_GRATUITS + ' clients') + '</small></span>' + ic('droite') + '</a>' +
      '<form data-form="reglages" class="carte" novalidate><h2>Ma boutique</h2>' +
      '<label class="label" for="r-boutique">Nom de la boutique</label><input id="r-boutique" class="champ" maxlength="60" value="' + esc(rg.boutique) + '" placeholder="Ex. : Boutique Baobab">' +
      '<label class="label" for="r-paiement">Pour être payé à distance <span class="facultatif">(facultatif)</span></label>' +
      '<input id="r-paiement" class="champ" maxlength="80" value="' + esc(rg.paiement) + '" placeholder="Ex. : Wave au 77 000 00 00">' +
      '<p class="aide">Ajouté aux rappels et aux relevés.</p>' +
      '<label class="label" for="r-plafond">Limite de crédit des nouveaux clients <span class="facultatif">(facultatif)</span></label>' +
      '<div class="montant-saisie petit"><input id="r-plafond" inputmode="numeric" value="' + (rg.plafondDefaut ? CB.formatNombre(rg.plafondDefaut, ' ') : '') + '" placeholder="Pas de limite"><span aria-hidden="true">F</span></div>' +
      '<p class="label">Ton des rappels</p><div class="seg" role="radiogroup" aria-label="Ton des rappels">' + CB.TONS.map(function (t) {
        return '<button type="button" role="radio" data-action="ton" data-ton="' + t + '" aria-checked="' + ((rg.ton || 'normal') === t) + '">' + { amical: 'Amical', normal: 'Normal', ferme: 'Ferme' }[t] + '</button>';
      }).join('') + '</div>' +
      '<button type="submit" class="btn btn-principal btn-large">' + ic('check') + 'Enregistrer</button></form>' +
      '<nav class="menu carte" aria-label="Listes et sécurité">' +
      '<a href="#/produits/produit">' + ic('carnet') + '<span>Mes produits <small>pour le carnet</small></span><b>' + produitsGenre('produit').length + '</b>' + ic('droite') + '</a>' +
      '<a href="#/produits/plat">' + ic('ardoise') + '<span>Mes plats <small>pour l\'ardoise</small></span><b>' + produitsGenre('plat').length + '</b>' + ic('droite') + '</a>' +
      '<a href="#/code">' + ic('cadenas') + '<span>Code de verrouillage <small>' + (etat.code ? 'activé' : 'pas de code') + '</small></span>' + ic('droite') + '</a></nav>' +
      '<section class="carte" id="sauvegarde"><h2>' + ic('telecharger') + 'Sauvegarde</h2>' +
      '<p>Dernière sauvegarde : <b id="sauv-date">' + sauv + '</b></p>' +
      '<p class="aide">Si le téléphone est perdu, la sauvegarde permet de tout retrouver. Gardez le fichier ailleurs (WhatsApp à vous-même, Drive…). Faites-la chaque semaine.</p>' +
      '<div class="pile-boutons">' +
      (navigator.share ? '<button type="button" class="btn btn-principal btn-large" data-action="sauvegarder-envoyer">' + ic('partager') + 'Sauvegarder et envoyer</button>' : '') +
      '<button type="button" class="btn ' + (navigator.share ? 'btn-sec' : 'btn-principal') + ' btn-large" data-action="sauvegarder">' + ic('telecharger') + 'Télécharger la sauvegarde</button>' +
      '<label class="btn btn-sec btn-large" for="f-restaurer">' + ic('envoyer') + 'Restaurer une sauvegarde</label>' +
      '<input type="file" id="f-restaurer" accept="application/json,.json" class="cache-fichier"></div></section>' +
      '<section class="carte"><h2>' + ic('lune') + 'Affichage</h2><p class="label">Thème</p><div class="seg" role="radiogroup" aria-label="Thème">' +
      [['auto', 'Auto'], ['clair', 'Clair'], ['sombre', 'Sombre']].map(function (x) { return '<button type="button" role="radio" data-action="theme" data-v="' + x[0] + '" aria-checked="' + (lireTheme() === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<p class="label">Taille du texte</p><div class="seg" role="radiogroup" aria-label="Taille du texte">' +
      [['normale', 'Normale'], ['grande', 'Grande']].map(function (x) { return '<button type="button" role="radio" data-action="taille" data-v="' + x[0] + '" aria-checked="' + (lireTaille() === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></section>' +
      htmlInstaller() +
      '<section class="carte"><h2>' + ic('bouclier') + 'Vos données</h2><p>Tout reste dans ce téléphone : clients, photos, numéros, montants. Rien n\'est envoyé, sauf le numéro de commande quand vous activez le pass.</p></section>' +
      '<button type="button" class="btn btn-danger-sec btn-large" data-action="tout-effacer">' + ic('poubelle') + 'Tout effacer</button>' +
      '<p class="version">Carnet Boutique ' + VERSION_APP + ' · <a href="../">Autres applications</a></p>';
    vue(html, 'Plus', { onglet: 'plus' });
    if (location.hash.indexOf('#sauvegarde') > 0) setTimeout(function () { var s = $('#sauvegarde'); if (s) s.scrollIntoView(); }, 50);
  }
  function enregistrerReglages() {
    var rg = etat.reglages;
    rg.boutique = $('#r-boutique').value.trim().slice(0, 60);
    rg.paiement = $('#r-paiement').value.trim().slice(0, 80);
    var pl = $('#r-plafond').value.trim();
    rg.plafondDefaut = pl ? (CB.lireMontant(pl) || 0) : 0;
    sauverReglages().then(function () { toast('Enregistré.'); });
  }

  // Produits / plats favoris
  function vueProduits(genre) {
    var liste = produitsGenre(genre), plat = genre === 'plat';
    var html = '<p class="aide">' + (plat ? 'Vos plats, pour noter une commande d\'un geste.' : 'Vos produits vendus à crédit, pour noter d\'un geste. Le prix est facultatif.') + '</p>' +
      '<form data-form="produit" data-genre="' + genre + '" class="carte form-produit" novalidate>' +
      '<label class="label" for="p-nom">' + (plat ? 'Plat' : 'Produit') + '</label><input id="p-nom" class="champ" maxlength="60" placeholder="' + (plat ? 'Ex. : Dibi mouton (1 kg)' : 'Ex. : Riz (1 kg)') + '" autocomplete="off">' +
      '<label class="label" for="p-prix">Prix' + (plat ? '' : ' <span class="facultatif">(facultatif)</span>') + '</label><div class="montant-saisie petit"><input id="p-prix" inputmode="numeric" autocomplete="off" placeholder="0"><span aria-hidden="true">F</span></div>' +
      '<p class="erreur" id="p-erreur" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-principal btn-large">' + ic('plus') + 'Ajouter</button></form>' +
      (liste.length ? '<ul class="liste-produits">' + liste.map(function (p) {
        return '<li><span class="lp-nom">' + esc(p.nom) + '</span>' +
          '<label class="lp-prix"><span class="sr">Prix de ' + esc(p.nom) + '</span><input inputmode="numeric" data-prix="' + esc(p.id) + '" value="' + (p.prix ? CB.formatNombre(p.prix, ' ') : '') + '" placeholder="—"> F</label>' +
          '<button type="button" class="btn-icone" data-action="produit-supprimer" data-id="' + esc(p.id) + '" aria-label="Supprimer ' + esc(p.nom) + '">' + ic('poubelle') + '</button></li>';
      }).join('') + '</ul>' : '<p class="liste-vide">Aucun ' + (plat ? 'plat' : 'produit') + ' pour l\'instant.</p>');
    vue(html, plat ? 'Mes plats' : 'Mes produits', { onglet: 'plus', parent: FC && plat ? FC.cle : FO && !plat ? FO.cle : '#/plus' });
  }
  function ajouterProduit(form) {
    var genre = form.getAttribute('data-genre'), nom = $('#p-nom').value.trim(), pt = $('#p-prix').value.trim();
    var prix = pt ? CB.lireMontant(pt) : 0;
    var err = function (m) { var e = $('#p-erreur'); e.textContent = m; e.hidden = false; };
    if (!nom) return err('Tapez le nom.');
    if (pt && !prix) return err('Prix : tapez un nombre.');
    if (genre === 'plat' && !prix) return err('Tapez le prix du plat.');
    var p = { id: uid(), nom: nom.slice(0, 60), prix: prix || 0, genre: genre, ordre: produitsGenre(genre).length };
    etat.produits.push(p);
    router();
    var champ = $('#p-nom'); if (champ) champ.focus();
    toast('Ajouté : ' + p.nom);
    DB.mettre('produits', p).catch(function (e) { toast('Enregistrement impossible : ' + (e && e.message || e)); });
  }

  // ---------------------------------------------------------------- Pass
  function vuePass(p) {
    var e = pass();
    var code = p.get('code') || '';
    var html = '<section class="pass-carte' + (e.premium ? ' actif' : '') + '">' + ic('etoile', 'ic-xl') +
      '<h2>Pass Carnet Boutique</h2>' +
      (e.premium ? '<p class="pass-etat" id="pass-etat">Actif jusqu\'au <b>' + new Date(e.fin).toLocaleDateString('fr-FR') + '</b><br>' + e.joursRestants + ' jours restants</p>'
        : e.expire ? '<p class="pass-etat" id="pass-etat">Terminé le ' + new Date(e.fin).toLocaleDateString('fr-FR') + '. Votre carnet reste complet.</p>'
        : '<p class="pass-etat" id="pass-etat">Version gratuite : ' + etat.clients.length + ' / ' + CB.CLIENTS_GRATUITS + ' clients</p>') +
      '<ul class="avantages"><li>' + ic('clientPlus') + 'Clients sans limite</li><li>' + ic('pdf') + 'Relevés PDF à envoyer sur WhatsApp</li><li>' + ic('ardoise') + 'Ardoise sans limite</li><li>' + ic('telecharger') + 'Rappel de sauvegarde chaque semaine</li></ul>' +
      '<p class="pass-prix"><b>3 000 F</b> pour 12 mois</p>' +
      '<a class="btn btn-jaune btn-xl" href="' + BOUTIQUE_PASS + '">' + (e.premium || e.expire ? 'Renouveler le pass' : 'Acheter le pass') + ' (Wave)</a></section>' +
      '<form data-form="pass" class="carte" novalidate><h2>Activer mon pass</h2>' +
      '<label class="label" for="lien-pass">Collez le lien de votre commande</label>' +
      '<textarea id="lien-pass" class="champ" rows="3" placeholder="https://…/commande.html?o=TCV-…&amp;t=…" autocomplete="off" spellcheck="false">' + esc(code) + '</textarea>' +
      '<p class="aide">Ce lien est sur la page de votre commande, après le paiement.</p>' +
      '<p class="message" id="msg-pass" role="status" aria-live="polite"></p>' +
      '<button type="submit" class="btn btn-principal btn-large" id="btn-activer">' + ic('check') + 'Activer</button>' +
      '<p class="aide petit">' + ic('bouclier', 'ic-mini') + 'Vérifié une seule fois par Internet. Seul le numéro de commande est envoyé, jamais votre carnet.</p></form>' +
      (etat.passes.length ? '<section class="carte"><h2>Mes pass</h2><ul class="liste-simple">' + etat.passes.map(function (x) { return '<li>' + esc(x.id) + ' — payé le ' + new Date(x.payeeLe).toLocaleDateString('fr-FR') + '</li>'; }).join('') + '</ul></section>' : '');
    vue(html, 'Mon pass', { onglet: 'plus', parent: '#/plus' });
    if (code) setTimeout(activerPass, 30);
  }
  var activationEnCours = false;
  function activerPass() {
    if (activationEnCours) return;
    var msg = $('#msg-pass'), btn = $('#btn-activer');
    var c = CB.lireLienCommande($('#lien-pass').value);
    var dire = function (t, ok) { msg.textContent = t; msg.className = 'message ' + (ok ? 'ok' : 'ko'); };
    if (!c) return dire('Lien non reconnu. Copiez le lien complet de la page de votre commande (il contient « TCV- »).', false);
    activationEnCours = true; btn.disabled = true; dire('Vérification…', true); msg.className = 'message';
    fetch(CB.urlVerification(c), { headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) { if (r.status === 404) return {}; if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (j) {
        var a = CB.analyserReponse(j);
        if (!a.ok) {
          return dire({ introuvable: 'Commande introuvable. Vérifiez le lien.', produit: 'Cette commande est un autre achat' + (a.titre ? ' (« ' + a.titre + ' »)' : '') + ', pas le Pass Carnet Boutique.',
            impayee: 'Paiement pas encore confirmé. Réessayez dans quelques minutes.', expiree: 'Ce pass est terminé (12 mois passés). Achetez un nouveau pass.' }[a.raison], false);
        }
        etat.passes = CB.ajouterPass(etat.passes, a.pass);
        return DB.mettre('kv', etat.passes, 'passes').then(function () {
          history.replaceState(null, '', location.pathname + '#/pass');
          vuePass(new URLSearchParams());
          var m = $('#msg-pass'); m.textContent = 'Pass activé. Merci !'; m.className = 'message ok';
          toast('Pass activé jusqu\'au ' + new Date(pass().fin).toLocaleDateString('fr-FR') + '.');
        });
      })
      .catch(function () { dire('Pas de connexion. Réessayez quand vous avez Internet.', false); })
      .then(function () { activationEnCours = false; var b = $('#btn-activer'); if (b) b.disabled = false; });
  }

  // ---------------------------------------------------------------- Code de verrouillage
  function clavier(prefixe) {
    var t = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    return '<div class="points-code" id="' + prefixe + '-points" aria-hidden="true"><span></span><span></span><span></span><span></span></div>' +
      '<div class="clavier" role="group" aria-label="Clavier">' + t.map(function (k) {
        if (!k) return '<span></span>';
        return '<button type="button" class="touche" data-touche="' + (k === '⌫' ? 'x' : k) + '" aria-label="' + (k === '⌫' ? 'Effacer' : k) + '">' + (k === '⌫' ? ic('gauche') : k) + '</button>';
      }).join('') + '</div>';
  }
  function brancherClavier(racine, prefixe, fini) {
    var val = '', jeton = uid();
    racine.setAttribute('data-clavier-' + prefixe, jeton);
    racine.removeAttribute('data-bloque');
    function actif() { return document.contains(racine) && racine.getAttribute('data-clavier-' + prefixe) === jeton && !!$('#' + prefixe + '-points', racine); }
    function maj() { $$('#' + prefixe + '-points span', racine).forEach(function (s, i) { s.classList.toggle('plein', i < val.length); }); }
    function touche(k) {
      if (racine.getAttribute('data-bloque')) return;
      if (k === 'x') val = val.slice(0, -1); else if (val.length < 4) val += k;
      maj();
      if (val.length === 4) { var v = val; setTimeout(function () { val = ''; maj(); fini(v); }, 120); }
    }
    var clic = function (e) {
      if (!actif()) return racine.removeEventListener('click', clic);
      var b = e.target.closest('[data-touche]'); if (b) touche(b.getAttribute('data-touche'));
    };
    racine.addEventListener('click', clic);
    var clav = function (e) {
      if (!actif()) return document.removeEventListener('keydown', clav);
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (/^\d$/.test(e.key)) touche(e.key); else if (e.key === 'Backspace') touche('x');
    };
    document.addEventListener('keydown', clav);
    return { vider: function () { val = ''; maj(); } };
  }
  function vueCode(nouveau) {
    var existe = etat.code && !nouveau;
    var html = '<section class="carte centre code-zone" id="code-zone">' + ic('cadenas', 'ic-xl') +
      '<h2 id="code-titre">' + (existe ? 'Code activé' : 'Choisissez 4 chiffres') + '</h2>' +
      '<p class="aide" id="code-aide">' + (existe ? 'Le carnet demande le code à chaque ouverture, et après 2 minutes hors de l\'application.' : 'Le code empêche d\'ouvrir le carnet sans vous. Ne l\'oubliez pas.') + '</p>' +
      (existe ? '<div class="pile-boutons"><button type="button" class="btn btn-sec btn-large" data-action="code-changer">Changer le code</button>' +
        '<button type="button" class="btn btn-danger-sec btn-large" data-action="code-retirer">Retirer le code</button></div>' : clavier('nc')) + '</section>';
    vue(html, 'Code', { onglet: 'plus', parent: '#/plus' });
    if (!existe) choisirCode();
  }
  function choisirCode() {
    var zone = $('#code-zone'), premier = null;
    if (!$('.clavier', zone)) zone.insertAdjacentHTML('beforeend', clavier('nc'));
    $('#code-titre').textContent = 'Choisissez 4 chiffres';
    brancherClavier(zone, 'nc', function (v) {
      if (!premier) { premier = v; $('#code-titre').textContent = 'Retapez le code'; return; }
      if (v !== premier) { premier = null; $('#code-titre').textContent = 'Les codes sont différents. Recommencez.'; return; }
      zone.setAttribute('data-bloque', '1');
      CB.creerCode(v).then(function (enreg) {
        etat.code = enreg;
        return DB.mettre('kv', enreg, 'code');
      }).then(function () { toast('Code activé.'); allerA('#/plus', true); }).catch(function (e) { toast(e.message); });
    });
  }
  function demanderCodeActuel(titre) {
    return new Promise(function (ok) {
      var f = ouvrirFeuille('<h2 id="feuille-titre" class="centre">' + esc(titre) + '</h2><p class="erreur centre" id="dc-erreur" hidden></p>' + clavier('dc'), { classe: 'feuille-code', surFermeture: function () { ok(false); } });
      brancherClavier(f, 'dc', function (v) {
        CB.verifierCode(v, etat.code).then(function (bon) {
          if (bon) { fermerFeuille(true); ok(true); }
          else { var e = $('#dc-erreur', f); e.textContent = 'Code faux.'; e.hidden = false; }
        });
      });
    });
  }

  // Écran de verrouillage
  var echecs = 0, bloqueJusqua = 0;
  function verrouiller() {
    if (!etat.code) return;
    etat.verrouille = true;
    fermerFeuille(true);
    $('#vue').innerHTML = '';
    var v = $('#verrou');
    v.innerHTML = '<div class="verrou-carte"><img src="icons/icon-192.png" alt="" width="72" height="72"><h2>Carnet Boutique</h2><p id="verrou-texte">Tapez votre code</p>' +
      clavier('vr') + '<button type="button" class="lien" id="code-oublie">Code oublié ?</button></div>';
    v.hidden = false;
    document.body.classList.add('verrouille');
    majBoutonVerrou();
    brancherClavier(v, 'vr', function (code) {
      var reste = bloqueJusqua - Date.now();
      if (reste > 0) { $('#verrou-texte').textContent = 'Attendez ' + Math.ceil(reste / 1000) + ' secondes.'; return; }
      CB.verifierCode(code, etat.code).then(function (bon) {
        if (bon) { echecs = 0; deverrouiller(); return; }
        echecs++;
        var att = CB.attenteCode(echecs);
        if (att) bloqueJusqua = Date.now() + att;
        var t = $('#verrou-texte'); t.textContent = att ? 'Code faux. Attendez ' + Math.round(att / 1000) + ' secondes.' : 'Code faux. Réessayez.';
        t.classList.add('ko'); var c = $('.verrou-carte'); c.classList.remove('secoue'); void c.offsetWidth; c.classList.add('secoue');
      });
    });
    $('#code-oublie').addEventListener('click', codeOublie);
  }
  function deverrouiller() {
    etat.verrouille = false;
    var v = $('#verrou'); v.hidden = true; v.innerHTML = '';
    document.body.classList.remove('verrouille');
    router();
  }
  function codeOublie() {
    confirmer({ titre: 'Code oublié', texte: 'Sans le code, le carnet ne peut pas s\'ouvrir. Vous pouvez <b>tout effacer</b> sur ce téléphone, puis restaurer votre dernière sauvegarde. Votre pass reste actif.', ok: 'Tout effacer', danger: true }).then(function (ok) {
      if (!ok) return;
      var passes = etat.passes;
      DB.toutEffacer().then(function () { return DB.mettre('kv', passes, 'passes'); }).then(function () { location.hash = '#/'; location.reload(); });
    });
  }

  // ---------------------------------------------------------------- Sauvegarde / restauration
  function donneesSauvegarde() {
    var rg = Object.assign({}, etat.reglages);
    return { app: 'carnet-boutique', version: 1, exporteLe: new Date().toISOString(),
      donnees: { clients: etat.clients, ops: etat.ops, produits: etat.produits, ardoise: etat.ardoise, reglages: rg } };
  }
  function sauvegarder(envoyer) {
    var blob = new Blob([JSON.stringify(donneesSauvegarde())], { type: 'application/json' });
    var nom = 'carnet-boutique-' + auj() + '.json';
    var fait = function () {
      etat.sauvegardeLe = new Date().toISOString();
      return DB.mettre('kv', etat.sauvegardeLe, 'sauvegardeLe').then(function () { var d = $('#sauv-date'); if (d) d.textContent = "aujourd'hui"; toast('Sauvegarde faite.'); });
    };
    if (envoyer) return partagerOuTelecharger(blob, nom, 'Sauvegarde Carnet Boutique').then(fait);
    telecharger(blob, nom);
    return fait();
  }
  function restaurer(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var d, brut;
      try { brut = JSON.parse(lecteur.result); d = CB.validerSauvegarde(brut); } catch (e) { return toast(e instanceof SyntaxError ? 'Fichier illisible.' : e.message); }
      confirmer({ titre: 'Restaurer la sauvegarde ?', texte: 'Le carnet actuel (' + etat.clients.length + ' clients) sera remplacé par la sauvegarde (' + d.clients.length + ' clients, ' + d.ops.length + ' lignes).', ok: 'Restaurer', danger: true }).then(function (ok) {
        if (!ok) return;
        d.reglages = Object.assign({}, REGLAGES_DEFAUT, d.reglages, { accueilFait: true });
        var le = Date.parse(brut.exporteLe);
        DB.remplacer(d).then(function () { return isFinite(le) && le <= Date.now() ? DB.mettre('kv', new Date(le).toISOString(), 'sauvegardeLe') : null; })
          .then(charger).then(function () { allerA('#/', true); toast('Carnet restauré : ' + etat.clients.length + ' clients.'); })
          .catch(function (e) { toast('Restauration impossible : ' + (e && e.message || e)); });
      });
    };
    lecteur.onerror = function () { toast('Fichier illisible.'); };
    lecteur.readAsText(fichier);
  }
  function toutEffacer() {
    confirmer({ titre: 'Tout effacer ?', texte: 'Clients, crédits, paiements, ardoise : <b>tout sera effacé de ce téléphone</b>. Faites d\'abord une sauvegarde. Votre pass reste actif.', ok: 'Tout effacer', danger: true }).then(function (ok) {
      if (!ok) return;
      return confirmer({ titre: 'Vraiment tout effacer ?', texte: 'Ce ne sera pas possible de revenir en arrière.', ok: 'Oui, tout effacer', danger: true });
    }).then(function (ok) {
      if (!ok) return;
      var passes = etat.passes;
      DB.toutEffacer().then(function () { return DB.mettre('kv', passes, 'passes'); }).then(charger).then(function () { etat.code = null; allerA('#/', true); toast('Carnet effacé.'); });
    });
  }

  // ---------------------------------------------------------------- Installation
  var invite = null;
  function estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function estInstallee() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function majInstall() { var b = $('#installer'); if (b) b.hidden = estInstallee() || !(invite || estIOS()); }
  function htmlInstaller() {
    if (estInstallee()) return '';
    return '<section class="carte"><h2>' + ic('installer') + 'Installer sur le téléphone</h2>' +
      (invite ? '<button type="button" class="btn btn-principal btn-large" data-action="installer">' + ic('installer') + 'Installer Carnet Boutique</button>'
        : estIOS() ? etapesIOS() : '<ol class="etapes"><li>Ouvrez le menu <b>⋮</b> de Chrome.</li><li>Touchez <b>« Installer l\'application »</b> ou <b>« Ajouter à l\'écran d\'accueil »</b>.</li></ol>') + '</section>';
  }
  function etapesIOS() { return '<ol class="etapes"><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez <b>Partager</b> (carré avec une flèche vers le haut).</li><li>Choisissez <b>« Sur l\'écran d\'accueil »</b>, puis <b>Ajouter</b>.</li></ol>'; }
  function installer() {
    if (invite) { invite.prompt(); invite.userChoice.then(function () { invite = null; majInstall(); }); return; }
    ouvrirFeuille('<h2 id="feuille-titre">Installer sur iPhone</h2>' + etapesIOS() + '<button type="button" class="btn btn-principal" data-action="fermer">Compris</button>');
  }

  // ---------------------------------------------------------------- Événements
  var ACTIONS = {
    fermer: function () { fermerFeuille(); },
    voix: voix,
    tri: function (b) { etat.reglages.tri = b.getAttribute('data-tri'); sauverReglages(); $$('[data-action=tri]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); $('#liste-clients').innerHTML = lignesClients($('#recherche') ? $('#recherche').value : ''); },
    masquer: function (b) { etat.masques[b.getAttribute('data-cle')] = Date.now() + 7 * CB.JOUR_MS; DB.mettre('kv', etat.masques, 'masques'); b.closest('.bandeau').remove(); },
    photo: function (b) { choisirPhoto(b.getAttribute('data-id')); },
    'photo-form': function () { choisirPhoto('form'); },
    rappeler: function (b) { rappeler(b.getAttribute('data-id')); },
    releve: function (b) { releve(b.getAttribute('data-id')); },
    op: function (b) { detailOp(b.getAttribute('data-id')); },
    'op-type': function (b) {
      FO.type = b.getAttribute('data-type');
      var h = '#/operation?type=' + FO.type + (FO.clientId ? '&client=' + encodeURIComponent(FO.clientId) : '');
      FO.cle = h; if (FO.type === 'paiement') { FO.articles = []; if (!FO.manuel) FO.montant = null; }
      history.replaceState(null, '', h); router();
    },
    'op-choisir': function (b) { FO.clientId = b.getAttribute('data-id'); FO.nouveauNom = ''; majOp({ client: true }); var m = $('#op-montant'); if (m && !FO.montant) m.focus(); },
    'op-nouveau-client': function () {
      if (!CB.peutAjouterClient(etat.clients.length, premium())) return limiteClients();
      FO.nouveauNom = CB.nomPropre(FO.recherche.trim()); FO.clientId = null; majOp({ client: true }); var m = $('#op-montant'); if (m) m.focus();
    },
    'op-changer-client': function () { FO.clientId = null; FO.nouveauNom = ''; FO.recherche = ''; majOp({ client: true }); var s = $('#op-cherche'); if (s) s.focus(); },
    'op-tout': function () { FO.montant = soldeAvantOp(); FO.manuel = true; majOp({ montant: true }); },
    'op-moitie': function () { FO.montant = Math.round(soldeAvantOp() / 2 / 5) * 5; FO.manuel = true; majOp({ montant: true }); },
    'op-total-articles': function () { FO.manuel = false; majOp({ articles: true }); },
    puce: function (b) {
      var p = null; etat.produits.forEach(function (x) { if (x.id === b.getAttribute('data-id')) p = x; });
      if (!p) return;
      if (p.genre === 'plat') { ajouterArticle(FC.lignes, p); majFormCommande(); }
      else { ajouterArticle(FO.articles, p); majOp({ articles: true }); }
    },
    'art-plus': function (b) { var l = cibleLignes(b); l[+b.getAttribute('data-i')].qte++; apresArticles(b); },
    'art-moins': function (b) { var l = cibleLignes(b), i = +b.getAttribute('data-i'); l[i].qte--; if (l[i].qte <= 0) l.splice(i, 1); apresArticles(b); },
    'op-libre': function () { var i = $('#op-libre'), n = i.value.trim(); if (!n) return i.focus(); FO.articles.push({ nom: CB.majuscule(n).slice(0, 80), qte: 1, prix: 0, pid: null }); i.value = ''; majOp({ articles: true }); },
    'cmd-libre': function () {
      var i = $('#cmd-libre'), n = i.value.trim(), pr = CB.lireMontant($('#cmd-libre-prix').value);
      if (!n) return i.focus();
      if (!pr) { $('#cmd-libre-prix').focus(); var e = $('#cmd-erreur'); e.textContent = 'Tapez le prix du plat.'; e.hidden = false; return; }
      FC.lignes.push({ nom: CB.majuscule(n).slice(0, 80), qte: 1, prix: pr, pid: null }); i.value = ''; $('#cmd-libre-prix').value = ''; majFormCommande();
    },
    'cmd-mode': function (b) { FC.paye = b.getAttribute('data-paye') === '1'; $$('[data-action=cmd-mode]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); },
    'cmd-statut': function (b) {
      var c = commande(b.closest('.commande').getAttribute('data-id')); if (!c) return;
      var s = b.getAttribute('data-s');
      majCommande(Object.assign({}, c, { statut: s })).then(rafraichirArdoise);
    },
    'cmd-paye': function (b) {
      var c = commande(b.closest('.commande').getAttribute('data-id')); if (!c || c.carnet) return;
      var paye = !c.paye;
      majCommande(Object.assign({}, c, { paye: paye, payeLe: paye ? auj() : null })).then(function () { rafraichirArdoise(); if (paye) toast('Encaissé : ' + F(CB.totalCommande(c))); });
    },
    'cmd-carnet': function (b) { commandeAuCarnet(b.closest('.commande').getAttribute('data-id')); },
    'cmd-supprimer': function () {
      var c = commande(FC && FC.id); if (!c) return;
      confirmer({ titre: 'Supprimer cette commande ?', texte: esc((c.client || 'Commande') + ' : ' + F(CB.totalCommande(c))), ok: 'Supprimer', danger: true }).then(function (ok) {
        if (!ok) return;
        etat.ardoise = etat.ardoise.filter(function (x) { return x.id !== c.id; });
        DB.effacer('ardoise', c.id).then(function () { FC = null; allerA('#/ardoise' + (c.date !== auj() ? '?j=' + c.date : ''), true); toast('Commande supprimée.'); });
      });
    },
    cible: function (b) { MG.cible = +b.getAttribute('data-c'); $$('[data-action=cible]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); majMarge(); },
    csv: exporterCsv,
    'csv-ardoise': exporterCsvArdoise,
    ton: function (b) { etat.reglages.ton = b.getAttribute('data-ton'); sauverReglages(); $$('[data-action=ton]').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); }); },
    theme: function (b) { try { localStorage.setItem('cb-theme', b.getAttribute('data-v')); } catch (e) { /* rien */ } appliquerAffichage(); $$('[data-action=theme]').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); }); },
    taille: function (b) { try { localStorage.setItem('cb-taille', b.getAttribute('data-v')); } catch (e) { /* rien */ } appliquerAffichage(); $$('[data-action=taille]').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); }); },
    'produit-supprimer': function (b) {
      var id = b.getAttribute('data-id');
      etat.produits = etat.produits.filter(function (p) { return p.id !== id; });
      DB.effacer('produits', id).then(router);
    },
    sauvegarder: function () { sauvegarder(false); },
    'sauvegarder-envoyer': function () { sauvegarder(true); },
    'tout-effacer': toutEffacer,
    'client-supprimer': function (b) { supprimerClient(b.getAttribute('data-id')); },
    'code-changer': function () { demanderCodeActuel('Code actuel').then(function (ok) { if (ok) vueCode(true); }); },
    'code-retirer': function () { demanderCodeActuel('Tapez le code pour le retirer').then(function (ok) { if (!ok) return; etat.code = null; DB.effacer('kv', 'code').then(function () { toast('Code retiré.'); vueCode(); }); }); },
    installer: installer
  };
  function cibleLignes(b) { return b.closest('#cmd-lignes') ? FC.lignes : FO.articles; }
  function apresArticles(b) { if (b.closest('#cmd-lignes')) majFormCommande(); else majOp({ articles: true }); }

  function brancher() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]');
      if (!b || b.disabled) return;
      var a = ACTIONS[b.getAttribute('data-action')];
      if (a) { if (b.tagName !== 'A' || b.getAttribute('data-action') !== 'relance') e.preventDefault(); a(b, e); }
    });
    document.addEventListener('submit', function (e) {
      var f = e.target, n = f.getAttribute('data-form');
      e.preventDefault();
      if (n === 'bienvenue') enregistrerBienvenue();
      else if (n === 'operation') enregistrerOperation();
      else if (n === 'client') enregistrerClient(f);
      else if (n === 'commande') enregistrerCommande();
      else if (n === 'reglages') enregistrerReglages();
      else if (n === 'produit') ajouterProduit(f);
      else if (n === 'pass') activerPass();
    });
    document.addEventListener('input', function (e) {
      var el = e.target;
      if (el.id === 'recherche') $('#liste-clients').innerHTML = lignesClients(el.value);
      else if (el.id === 'op-cherche') { FO.recherche = el.value; $('#op-choix').innerHTML = htmlChoixClients(); }
      else if (el.id === 'op-montant') { FO.montant = CB.lireMontant(el.value); FO.manuel = el.value.trim() !== ''; $('#op-aide').innerHTML = htmlOpAide(); var er = $('#op-erreur'); if (er) er.hidden = true; }
      else if (el.id === 'op-date' && FO) FO.date = el.value;
      else if (el.id === 'cmd-client' && FC) FC.client = el.value;
      else if (el.id === 'm-achat') { MG.achat = el.value; majMarge(); }
      else if (el.id === 'm-vente') { MG.vente = el.value; majMarge(); }
      else if (el.id === 'm-prixlot') { MG.prixLot = el.value; majMarge(); }
      else if (el.id === 'm-nblot') { MG.nbLot = el.value; majMarge(); }
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el.id === 'f-photo' && el.files && el.files[0]) photoChoisie(el.files[0]);
      else if (el.id === 'f-restaurer' && el.files && el.files[0]) { restaurer(el.files[0]); el.value = ''; }
      else if (el.id === 'm-lot') { MG.lot = el.checked; $('#m-lot-zone').hidden = !el.checked; $('#m-achat').readOnly = el.checked; majMarge(); }
      else if (el.getAttribute && el.getAttribute('data-prix')) {
        var id = el.getAttribute('data-prix'), p = null; etat.produits.forEach(function (x) { if (x.id === id) p = x; });
        if (!p) return;
        var v = el.value.trim() ? CB.lireMontant(el.value) : 0;
        if (el.value.trim() && !v) { el.value = p.prix ? CB.formatNombre(p.prix, ' ') : ''; return toast('Prix : tapez un nombre.'); }
        p.prix = v || 0; DB.mettre('produits', p).then(function () { toast('Prix enregistré.'); });
      }
    });
    document.addEventListener('focusout', function (e) {
      var el = e.target, n;
      if (el.id === 'op-montant' && FO && FO.montant) el.value = CB.formatNombre(FO.montant, ' ');
      else if ((el.id === 'm-achat' || el.id === 'm-vente' || el.id === 'm-prixlot') && !el.readOnly && /^\d{4,}$/.test(el.value.replace(/[\s\u00a0]/g, ''))) { el.value = CB.formatNombre(+el.value.replace(/[\s\u00a0]/g, ''), ' '); MG[{ 'm-achat': 'achat', 'm-vente': 'vente', 'm-prixlot': 'prixLot' }[el.id]] = el.value; }
      else if ((el.id === 'vx-montant' || el.id === 'c-plafond' || el.id === 'r-plafond' || el.id === 'p-prix' || el.id === 'cmd-libre-prix') && (n = CB.lireMontant(el.value))) el.value = CB.formatNombre(n, ' ');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && feuilleOuverte && !feuilleOuverte.opts.bloquante) fermerFeuille();
      if (e.key === 'Enter' && e.target.id === 'op-libre') { e.preventDefault(); ACTIONS['op-libre'](); }
      if (e.key === 'Enter' && (e.target.id === 'cmd-libre' || e.target.id === 'cmd-libre-prix')) { e.preventDefault(); ACTIONS['cmd-libre'](); }
    });
    $('#retour').addEventListener('click', function () {
      if (pileNav > 0) { pileNav -= 2; history.back(); } else allerA(parentCourant || '#/', true);
    });
    $('#installer').addEventListener('click', installer);
    $('#verrouiller').addEventListener('click', verrouiller);
    window.addEventListener('hashchange', function () { pileNav++; router(); });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; majInstall(); });
    window.addEventListener('appinstalled', function () { invite = null; majInstall(); toast('Application installée.'); });
    // Verrouillage automatique après 2 minutes hors de l'application
    var cache = 0;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) cache = Date.now();
      else if (etat.code && !etat.verrouille && cache && Date.now() - cache > 120000) verrouiller();
    });
  }
  function majBoutonVerrou() { var b = $('#verrouiller'); if (b) b.hidden = !etat.code || etat.verrouille; }

  var majDemandee = false;
  function serviceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      var proposer = function () { toast('Nouvelle version disponible.', { label: 'Mettre à jour', fn: function () { majDemandee = true; if (reg.waiting) reg.waiting.postMessage('maj'); } }); };
      if (reg.waiting && navigator.serviceWorker.controller) proposer();
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        if (w) w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) proposer(); });
      });
    }).catch(function () { /* hors ligne ou navigateur ancien */ });
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (majDemandee) { majDemandee = false; location.reload(); } });
  }

  function demarrer() {
    appliquerAffichage();
    brancher();
    // Lien direct depuis la page de commande : ?o=TCV-…&t=…
    var q = new URLSearchParams(location.search);
    if (q.get('o') && q.get('t')) history.replaceState(null, '', location.pathname + '#/pass?code=' + encodeURIComponent('?o=' + q.get('o') + '&t=' + q.get('t')));
    if (navigator.storage && navigator.storage.persist) try { navigator.storage.persist().catch(function () {}); } catch (e) { /* rien */ }
    charger().then(function () {
      etat.pret = true;
      if (etat.code) verrouiller(); else router();
      majInstall();
    }).catch(function (e) {
      vue('<section class="carte"><h1>Stockage indisponible</h1><p>' + esc(e && e.message || e) + '</p><p>Quittez la navigation privée, ou mettez à jour le navigateur.</p></section>', 'Carnet Boutique', { sansNav: true });
    });
    serviceWorker();
  }

  // Pour les tests et le débogage
  window.CBApp = { etat: etat, recharger: function () { return charger().then(router); }, R: R, version: VERSION_APP };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
