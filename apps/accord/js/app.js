/* AccordAI — interface (sans framework). Les liens secrets des accords restent sur le téléphone (IndexedDB) ;
   les accords eux-mêmes sont gardés par le serveur « dossiers » (historique chaîné, photos de preuve). */
(function () {
  'use strict';
  var AC = window.AC, DB = window.DB;
  var VERSION = '1.0.0';
  var URL_PASS = { 'pass-accordai-1-mois': '../../boutique/pass-accordai-1-mois.html', 'pass-accordai-12-mois': '../../boutique/pass-accordai-12-mois.html' };
  var HEURE_MS = 3600000;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- Icônes ----------
  function svg(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + p + '</svg>'; }
  var ICO = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    ok: svg('<path d="m5 12 5 5 9-10"/>'),
    alerte: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.5"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
    wa: svg('<path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5z"/><path d="M8.5 9.5c.3 2.6 2.4 4.8 5 5.2l1.3-1.3 2 .9"/>'),
    partager: svg('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>'),
    copier: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    fichier: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M12 18v-6m0 0-3 3m3-3 3 3"/>'),
    photo: svg('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>'),
    magie: svg('<path d="m4 20 10-10M14 4v3M12.5 5.5h3M19 8v3M17.5 9.5h3M18 15v2M17 16h2"/><path d="m13 9 2 2"/>'),
    modifier: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
    note: svg('<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4M8 9h8M8 13h5"/>'),
    camion: svg('<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>'),
    colis: svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
    cadenas: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    pdf: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M12 11v6m0 0-3-3m3 3 3-3"/>'),
    chaine: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    rafraichir: svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16m0 4v-4h-4"/>'),
    chercher: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
    etoile: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    boutique: svg('<path d="M4 9h16l-1 11H5zM8 9V7a4 4 0 0 1 8 0v2"/>'),
    cloche: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
    lune: svg('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>'),
    installer: svg('<path d="M12 3v11m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="4" rx="1"/>'),
    lien: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    sauvegarde: svg('<path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
    poubelle: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    fin: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>'),
    chevron: svg('<path d="m9 6 6 6-6 6"/>'),
    horloge: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')
  };
  var ICO_EV = { creation: ICO.plus, confirmation: ICO.ok, correction: ICO.modifier, acceptation: ICO.ok, modification: ICO.modifier, note: ICO.note, preuve: ICO.photo, livraison: ICO.camion, reception: ICO.colis, cloture: ICO.fin };

  // ---------- État ----------
  var S = { dossiers: [], pass: null, compteur: null, reglages: {}, rappels: {}, brouillon: null, filtre: 'tous', recherche: '', synchroTout: 0, verifs: {} };
  function rec(id) { for (var i = 0; i < S.dossiers.length; i++) if (S.dossiers[i].id === id) return S.dossiers[i]; return null; }
  function passActif() { return AC.passActif(S.pass); }
  function enregistrer(r) {
    var i = S.dossiers.indexOf(r);
    if (i < 0) { S.dossiers = S.dossiers.filter(function (x) { return x.id !== r.id; }); S.dossiers.push(r); }
    return DB.mettre('dossiers', r).then(function () { majPastille(); return r; });
  }
  function kv(cle, valeur) { return DB.mettre('kv', valeur, cle); }

  // ---------- Petits outils d'interface ----------
  var vueEl, toastMinuterie;
  function toast(t) {
    var el = $('#toast');
    el.textContent = t; el.hidden = false;
    clearTimeout(toastMinuterie);
    toastMinuterie = setTimeout(function () { el.hidden = true; }, 3800);
  }
  function titre(t) { $('#titre').textContent = t; document.title = (t === 'AccordAI' ? 'AccordAI : le carnet des accords commerciaux' : t + ' · AccordAI'); }
  function vue(html) { vueEl.innerHTML = html; }
  function occupe(btn, oui, texte) {
    if (!btn) return;
    if (oui) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.classList.add('occupe'); btn.setAttribute('aria-busy', 'true'); btn.innerHTML = ICO.rafraichir + '<span>' + esc(texte || 'Un instant…') + '</span>'; }
    else { if (btn.dataset.html) btn.innerHTML = btn.dataset.html; btn.disabled = false; btn.classList.remove('occupe'); btn.removeAttribute('aria-busy'); }
  }
  function message(el, texte, type) { if (!el) return; el.className = 'msg' + (type ? ' ' + type : ''); el.innerHTML = texte || ''; }
  function texteErreur(e) {
    if (!e) return 'Une erreur est survenue.';
    if (typeof e === 'string') return e;
    return e.message || 'Une erreur est survenue.';
  }
  function badge(statut) { var s = AC.STATUTS[statut] || { label: statut || '?', ton: 'neutre' }; return '<span class="badge ' + s.ton + '">' + esc(s.label) + '</span>'; }
  function montant(v) { var n = AC.normaliserMontant(v); return n || ''; }
  function ios() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function estInstallee() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function enLigne() { return navigator.onLine !== false; }
  function heure(iso) { var d = new Date(iso); return isNaN(d) ? '' : AC.dateHeure(d.toISOString()); }

  // ---------- Serveur ----------
  function api(methode, chemin, corps) {
    var init = { method: methode, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' };
    if (corps !== undefined) { init.headers = { 'content-type': 'application/json' }; init.body = JSON.stringify(corps); }
    return fetch((chemin.indexOf('http') === 0 ? '' : AC.API) + chemin, init).catch(function () {
      throw { horsLigne: true, message: 'Pas de connexion Internet. Réessayez dès que le réseau revient.' };
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw { status: r.status, code: j.erreur, message: j.message || ('Le serveur ne répond pas correctement (' + r.status + '). Réessayez plus tard.') };
        return j;
      });
    });
  }
  function synchroniser(r) {
    return api('GET', '/' + r.id + '?t=' + encodeURIComponent(r.jeton)).then(function (j) {
      var d = j.dossier || {};
      var evs = AC.trier(d.evenements);
      var copie = AC.comparerCopie(r.evenements || [], evs);
      if (!copie.ok && !r.alerteCopie) r.alerteCopie = { index: copie.index, empreinte: copie.evenement && copie.evenement.empreinte, le: new Date().toISOString() };
      r.titre = d.titre || r.titre; r.donnees = d.donnees || {}; r.statut = d.statut || r.statut; r.role = d.role || r.role;
      r.evenements = evs; r.creeLe = d.cree_le || r.creeLe; r.majLe = d.maj_le || r.majLe; r.synchroLe = new Date().toISOString(); r.introuvable = false;
      delete S.verifs[r.id];
      return enregistrer(r);
    }, function (e) {
      if (e && e.status === 404) { r.introuvable = true; return enregistrer(r).then(function () { throw e; }); }
      throw e;
    });
  }
  function evenement(r, type, donnees, maj) {
    var corps = { t: r.jeton, type: type, donnees: donnees || {} };
    if (maj) corps.maj = maj;
    return api('POST', '/' + r.id + '/evenement', corps).then(function () { return synchroniser(r); });
  }
  function envoyerPhoto(r, photo, legende) {
    return api('POST', '/' + r.id + '/photo', { t: r.jeton, photo: photo.data, legende: legende || '' }).then(function (j) {
      return reduire(photo.data, 1000, 0.8).then(function (v) { return DB.mettre('photos', v, r.id + '/' + j.photo); }).catch(function () {}).then(function () { return j; });
    });
  }

  // ---------- Photos (réduites dans le navigateur) ----------
  function chargerImage(src) {
    return new Promise(function (ok, ko) {
      var url = typeof src === 'string' ? src : URL.createObjectURL(src);
      var img = new Image();
      img.onload = function () { ok(img); if (typeof src !== 'string') setTimeout(function () { URL.revokeObjectURL(url); }, 2000); };
      img.onerror = function () { if (typeof src !== 'string') URL.revokeObjectURL(url); ko(new Error('Image illisible : choisissez une photo JPEG ou PNG.')); };
      img.src = url;
    });
  }
  // Réduit une image à « max » pixels (côté le plus long), en JPEG, en restant sous la taille permise par le serveur
  function reduire(src, max, qualite) {
    return chargerImage(src).then(function (img) {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error('Image vide.');
      var essai = function (m, q) {
        var r = Math.min(1, m / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * r)); c.height = Math.max(1, Math.round(h * r));
        var g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        var data = c.toDataURL('image/jpeg', q);
        while (data.length > 1150000 && q > 0.45) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
        return { data: data, w: c.width, h: c.height };
      };
      var p = essai(max, qualite || 0.82);
      if (p.data.length > 1150000) p = essai(Math.round(max * 0.7), 0.7);
      return p;
    });
  }
  function obtenirPhoto(r, nom) {
    var cle = r.id + '/' + nom;
    return DB.lire('photos', cle).then(function (p) {
      if (p) return p;
      if (!enLigne()) return null;
      return fetch(AC.API + '/' + r.id + '/photos/' + encodeURIComponent(nom) + '?t=' + encodeURIComponent(r.jeton), { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
        .then(function (res) { if (!res.ok) throw new Error('photo'); return res.blob(); })
        .then(function (b) { return reduire(b, 1000, 0.8); })
        .then(function (v) { return DB.mettre('photos', v, cle).then(function () { return v; }); })
        .catch(function () { return null; });
    });
  }
  function afficherPhotos(r) {
    $$('img[data-photo]').forEach(function (img) {
      obtenirPhoto(r, img.getAttribute('data-photo')).then(function (p) { if (p) img.src = p.data; else img.alt = (img.alt || '') + ' (non disponible hors connexion)'; });
    });
  }

  // ---------- Démarrage, routes ----------
  var ROUTES = [
    [/^\/?$/, vueAccords],
    [/^\/nouveau$/, vueNouveau],
    [/^\/accord\/(D-[0-9A-Z]{10})$/, vueAccord],
    [/^\/accord\/(D-[0-9A-Z]{10})\/partager$/, vuePartager],
    [/^\/accord\/(D-[0-9A-Z]{10})\/(corriger|modifier)$/, vueCorriger],
    [/^\/pass$/, vuePass],
    [/^\/plus$/, vuePlus]
  ];
  function route() {
    var brut = location.hash.replace(/^#/, '');
    // Lien d'un accord : #d=<id>&t=<jeton>
    var liens = AC.lireLiensDossier('#' + brut);
    if (liens.length) return ouvrirLien(liens[0].id, liens[0].t);
    var chemin = brut.split('?')[0], params = new URLSearchParams(brut.split('?')[1] || '');
    var m = null, fn = vueIntrouvable;
    for (var i = 0; i < ROUTES.length; i++) { m = chemin.match(ROUTES[i][0]); if (m) { fn = ROUTES[i][1]; break; } }
    document.body.classList.toggle('edition', fn === vueCorriger);
    $('#retour').hidden = !(fn === vueAccord || fn === vuePartager || fn === vueCorriger);
    var nav = fn === vueAccords || fn === vueAccord || fn === vuePartager ? 'accords' : fn === vueNouveau ? 'nouveau' : fn === vuePass ? 'pass' : fn === vuePlus ? 'plus' : '';
    $$('#nav a').forEach(function (a) { var on = a.getAttribute('data-nav') === nav; a.classList.toggle('actif', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    window.scrollTo(0, 0);
    fn.apply(null, (m ? m.slice(1) : []).concat([params]));
    try { vueEl.focus({ preventScroll: true }); } catch (e) { /* ancien navigateur */ }
  }
  function aller(h) { if (location.hash === h) route(); else location.hash = h; }

  function vueIntrouvable() {
    titre('AccordAI');
    vue('<section class="carte"><h1>Page introuvable</h1><p>Ce lien ne correspond à aucune page de l\'application.</p><a class="btn plein large" href="#/">Voir mes accords</a></section>');
  }

  // ---------- Ouvrir un lien d'accord (#d=…&t=…) ----------
  function ouvrirLien(id, jeton) {
    var r = rec(id);
    if (r && r.jeton === jeton) { location.replace('#/accord/' + id); return; }
    if (r && r.role === 'proprio' && r.jetonPartie === jeton) {
      location.replace('#/accord/' + id);
      setTimeout(function () { toast('C\'est le lien de l\'autre partie. Vous voyez votre vue de créateur.'); }, 300);
      return;
    }
    titre('Ouverture…');
    vue('<section class="carte centre" aria-busy="true"><p>Ouverture de l\'accord…</p></section>');
    api('GET', '/' + id + '?t=' + encodeURIComponent(jeton)).then(function (j) {
      var d = j.dossier;
      if (r && r.role === 'proprio' && d.role === 'partie') {
        r.jetonPartie = jeton;
        return enregistrer(r).then(function () { location.replace('#/accord/' + id); toast('C\'est le lien de l\'autre partie. Vous voyez votre vue de créateur.'); });
      }
      var n = r || { id: id, ajouteLe: new Date().toISOString(), vus: 0 };
      if (r && r.role === 'partie' && d.role === 'proprio') n.jetonPartie = r.jeton;
      n.jeton = jeton; n.role = d.role; n.titre = d.titre; n.donnees = d.donnees || {}; n.statut = d.statut; n.evenements = AC.trier(d.evenements);
      n.creeLe = d.cree_le; n.majLe = d.maj_le; n.synchroLe = new Date().toISOString(); n.introuvable = false;
      return enregistrer(n).then(function () { location.replace('#/accord/' + id); });
    }).catch(function (e) {
      titre('AccordAI');
      var hors = e && e.horsLigne;
      vue('<section class="carte ' + (hors ? 'info' : 'alerte') + '"><h1>' + (hors ? 'Pas de connexion' : 'Lien non valable') + '</h1><p>' +
        (hors ? 'Il faut Internet pour ouvrir cet accord la première fois. Réessayez dès que le réseau revient.' :
          e && e.status === 404 ? 'Ce lien ne correspond à aucun accord. Il est peut-être incomplet (copiez-le en entier) ou l\'accord a été effacé après 180 jours sans activité.' : esc(texteErreur(e))) +
        '</p><button type="button" class="btn plein large" data-action="reessayer-lien">' + ICO.rafraichir + 'Réessayer</button><a class="btn large" href="#/">Mes accords</a></section>');
    });
  }

  // ---------- Tableau de bord ----------
  function derniereActivite(r) { var evs = r.evenements || []; return (evs.length ? evs[evs.length - 1].le : r.creeLe || r.ajouteLe) || ''; }
  function nouveaux(r) {
    var evs = r.evenements || [], n = 0;
    for (var i = r.vus || 0; i < evs.length; i++) if (evs[i].auteur !== r.role) n++;
    return n;
  }
  function majPastille() {
    var n = S.dossiers.filter(function (r) { return nouveaux(r) > 0 || AC.enRetard(r); }).length;
    var p = $('#pastille');
    if (p) { p.hidden = !n; p.textContent = n > 9 ? '9+' : String(n); }
    try { if (navigator.setAppBadge) { if (n) navigator.setAppBadge(n).catch(function () {}); else navigator.clearAppBadge().catch(function () {}); } } catch (e) { /* non pris en charge */ }
  }
  var FILTRES = [['tous', 'Tous'], ['ouvert', 'À confirmer'], ['a_revoir', 'À revoir'], ['confirme', 'Confirmés'], ['livre', 'Livrés'], ['recu', 'Reçus'], ['clos', 'Clos'], ['retard', 'En retard']];
  function filtrer(liste) {
    var q = S.recherche.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return liste.filter(function (r) {
      if (S.filtre === 'retard' ? !AC.enRetard(r) : S.filtre === 'suivre' ? ['ouvert', 'a_revoir'].indexOf(r.statut) < 0 : S.filtre === 'cours' ? ['confirme', 'livre'].indexOf(r.statut) < 0 : S.filtre !== 'tous' && r.statut !== S.filtre) return false;
      if (!q) return true;
      var d = r.donnees || {};
      return [r.titre, r.id, d.produit, d.vendeur, d.acheteur, d.lieu].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').indexOf(q) > -1;
    }).sort(function (a, b) { return derniereActivite(b) < derniereActivite(a) ? -1 : 1; });
  }
  function carteAccord(r) {
    var d = r.donnees || {}, t = AC.calculer(d), n = nouveaux(r), retard = AC.enRetard(r);
    var autre = r.role === 'proprio' ? (d.createur === 'acheteur' ? d.vendeur : d.acheteur) : (d.createur === 'acheteur' ? d.acheteur : d.vendeur);
    var tags = '';
    if (n) tags += '<span class="badge nouveau">' + n + ' nouveau' + (n > 1 ? 'x' : '') + '</span>';
    if (retard) tags += '<span class="badge retard">Délai dépassé</span>';
    if (r.role === 'partie') tags += '<span class="badge neutre">Reçu d\'un partenaire</span>';
    if (r.introuvable) tags += '<span class="badge alerte">Introuvable</span>';
    return '<li><a class="accord" href="#/accord/' + esc(r.id) + '"><div class="haut"><h3>' + esc(r.titre || 'Accord') + '</h3>' + badge(r.statut) + '</div>' +
      '<div class="infos">' + (t.total != null ? '<span class="montant">' + esc(AC.fcfa(t.total)) + '</span>' : '') + (autre ? '<span>Avec ' + esc(autre) + '</span>' : '') +
      (d.delai_date ? '<span>Délai : ' + esc(AC.dateFr(d.delai_date, true)) + '</span>' : d.delai ? '<span>Délai : ' + esc(d.delai) + '</span>' : '') + '</div>' +
      (tags ? '<div class="tags">' + tags + '</div>' : '') + '</a></li>';
  }
  function vueAccords() {
    titre('AccordAI');
    var L = S.dossiers;
    if (!L.length) {
      var h = '<section class="carte vide"><img src="icons/icon-192.png" alt="" width="72" height="72"><h1>Le carnet de vos accords</h1>' +
        '<p class="lead">Notez ce qui a été convenu avec un client ou un fournisseur, faites-le confirmer, suivez la livraison.</p>' +
        '<ol class="etapes"><li>Collez la conversation WhatsApp ou remplissez la fiche (produit, prix, acompte, délai).</li><li>Envoyez le lien à l\'autre partie : elle confirme ou propose une correction.</li><li>Chaque étape est datée et reliée à la précédente. Imprimez le dossier en PDF à tout moment.</li></ol>' +
        '<a class="btn plein large" href="#/nouveau">' + ICO.plus + 'Créer mon premier accord</a></section>';
      h += astuceIos();
      h += '<p class="mention">' + esc(AC.MENTION) + '</p>';
      vue(h); return;
    }
    var retards = L.filter(function (r) { return AC.enRetard(r); });
    var suivre = L.filter(function (r) { return ['ouvert', 'a_revoir'].indexOf(r.statut) > -1; }).length;
    var cours = L.filter(function (r) { return ['confirme', 'livre'].indexOf(r.statut) > -1; }).length;
    var h2 = '';
    if (retards.length) {
      h2 += '<section class="carte alerte" id="rappels"><h2>' + ICO.horloge + (retards.length > 1 ? retards.length + ' accords ont dépassé leur délai' : 'Un accord a dépassé son délai') + '</h2><ul class="diff">' +
        retards.slice(0, 5).map(function (r) { return '<li><a href="#/accord/' + esc(r.id) + '">' + esc(r.titre) + '</a> — délai : ' + esc(AC.dateFr(r.donnees.delai_date)) + '</li>'; }).join('') + '</ul>' +
        (S.reglages.notifs || !('Notification' in window) ? '' : '<button type="button" class="lien-btn" data-action="notifs">Recevoir ces rappels en notification</button>') + '</section>';
    }
    h2 += '<div class="resume" role="group" aria-label="Résumé">' +
      '<button type="button" data-filtre="suivre" class="' + (S.filtre === 'suivre' ? 'actif' : '') + '"><strong>' + suivre + '</strong><span>À suivre</span></button>' +
      '<button type="button" data-filtre="cours" class="' + (S.filtre === 'cours' ? 'actif' : '') + '"><strong>' + cours + '</strong><span>En cours</span></button>' +
      '<button type="button" data-filtre="retard" class="' + (S.filtre === 'retard' ? 'actif' : '') + '"><strong>' + retards.length + '</strong><span>En retard</span></button></div>';
    h2 += '<div class="recherche"><label for="recherche" class="vh">Chercher un accord</label>' + ICO.chercher + '<input type="search" id="recherche" placeholder="Chercher : client, produit, n° D-…" value="' + esc(S.recherche) + '" autocomplete="off"></div>';
    h2 += '<div class="filtres" role="group" aria-label="Filtrer par statut">' + FILTRES.map(function (f) { return '<button type="button" data-filtre="' + f[0] + '" aria-pressed="' + (S.filtre === f[0]) + '">' + f[1] + '</button>'; }).join('') + '</div>';
    h2 += '<ul class="liste" id="liste" aria-live="polite"></ul>';
    if (!passActif()) {
      var n = AC.creationsCeMois(S.compteur);
      h2 += '<p class="petit centre">Version gratuite : ' + n + ' / ' + AC.LIMITE_GRATUITE + ' accords créés ce mois-ci. <a href="#/pass">Pass AccordAI</a></p>';
    }
    h2 += astuceIos();
    vue(h2);
    majListe();
    rafraichirTout();
  }
  function majListe() {
    var ul = $('#liste');
    if (!ul) return;
    var l = filtrer(S.dossiers);
    ul.innerHTML = l.length ? l.map(carteAccord).join('') : '<li class="petit centre">Aucun accord ne correspond.</li>';
  }
  function astuceIos() {
    if (!ios() || estInstallee() || S.reglages.astuceIos) return '';
    return '<section class="carte info"><h2>' + ICO.installer + 'Installer sur iPhone</h2><p>Dans Safari, touchez <strong>Partager</strong> (carré avec une flèche) puis <strong>Sur l\'écran d\'accueil</strong>.</p><button type="button" class="lien-btn" data-action="cacher-astuce">J\'ai compris</button></section>';
  }
  // Mise à jour des accords en cours (au plus toutes les 2 minutes), puis rappels et notifications
  function rafraichirTout(force) {
    if (!enLigne() || (!force && Date.now() - S.synchroTout < 120000)) { rappels(); return Promise.resolve(); }
    S.synchroTout = Date.now();
    var liste = S.dossiers.filter(function (r) { return r.statut !== 'clos' && !r.introuvable; }).slice(0, 25);
    return liste.reduce(function (p, r) {
      return p.then(function () { return synchroniser(r).catch(function () {}); });
    }, Promise.resolve()).then(function () {
      majPastille(); rappels();
      if (!$('#liste')) return;
      if (document.activeElement && document.activeElement.id === 'recherche') majListe(); else vueAccords();
    });
  }
  function notifier(titreN, corps, url, tag) {
    if (!S.reglages.notifs || !('Notification' in window) || Notification.permission !== 'granted') return;
    var o = { body: corps, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', tag: tag, data: { url: url } };
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification(titreN, o); }).catch(function () {});
      else new Notification(titreN, o);
    } catch (e) { /* notifications indisponibles */ }
  }
  function rappels() {
    var jour = AC.aujourdhui(), change = false;
    S.dossiers.forEach(function (r) {
      if (AC.enRetard(r) && S.rappels[r.id] !== jour) {
        notifier('Délai dépassé : ' + r.titre, 'Le délai était le ' + AC.dateFr(r.donnees.delai_date) + '. Faites le point avec l\'autre partie.', './#/accord/' + r.id, 'retard-' + r.id);
        S.rappels[r.id] = jour; change = true;
      }
      var n = (r.evenements || []).length;
      if (r.notifie == null) r.notifie = n;
      if (n > r.notifie) {
        var der = r.evenements[n - 1];
        if (der.auteur !== r.role) notifier((AC.EVENEMENTS[der.type] || 'Nouveau') + ' : ' + r.titre, 'Action de l\'autre partie le ' + AC.dateHeure(der.le) + '.', './#/accord/' + r.id, 'ev-' + r.id);
        r.notifie = n; DB.mettre('dossiers', r).catch(function () {});
      }
    });
    if (change) kv('rappels', S.rappels).catch(function () {});
  }

  // ---------- Nouvel accord ----------
  function brouillonVide() { return { titre: '', createur: 'vendeur', champs: {}, texte: '', photos: [], joindre: true, ia: [], participants: [], coupe: false }; }
  var minuterieBrouillon;
  function garderBrouillon() {
    clearTimeout(minuterieBrouillon);
    minuterieBrouillon = setTimeout(function () { kv('brouillon', S.brouillon).catch(function () {}); }, 350);
  }
  function champHtml(c, v, pre, classe) {
    var id = pre + '-' + c.cle;
    var attrs = ' id="' + id + '" data-c="' + c.cle + '" placeholder="' + esc(c.place) + '" autocomplete="off"';
    var input = c.zone ? '<textarea' + attrs + ' rows="3">' + esc(v) + '</textarea>'
      : '<input type="text"' + attrs + ' value="' + esc(v) + '"' + (c.montant ? ' inputmode="numeric" data-montant="1"' : c.mode ? ' inputmode="' + c.mode + '"' : '') +
        ((c.cle === 'vendeur' || c.cle === 'acheteur') ? ' list="' + pre + '-noms"' : '') + '>';
    return '<div class="champ' + (classe || '') + '" data-champ="' + c.cle + '"><label for="' + id + '">' + esc(c.label) + '</label>' + input + '</div>';
  }
  function champsHtml(d, pre, classeDe) {
    var get = function (k) { return d[k] == null ? '' : d[k]; };
    var C = {}; AC.CHAMPS.forEach(function (c) { C[c.cle] = c; });
    var cl = function (k) { return classeDe ? classeDe(k) : ''; };
    return champHtml(C.vendeur, get('vendeur'), pre, cl('vendeur')) + champHtml(C.acheteur, get('acheteur'), pre, cl('acheteur')) +
      champHtml(C.produit, get('produit'), pre, cl('produit')) +
      '<div class="deux">' + champHtml(C.quantite, get('quantite'), pre, cl('quantite')) + champHtml(C.prix_unitaire, get('prix_unitaire'), pre, cl('prix_unitaire')) + '</div>' +
      champHtml(C.prix_total, get('prix_total'), pre, cl('prix_total')) + '<div id="' + pre + '-calcul" aria-live="polite">' + calculHtml(d) + '</div>' +
      champHtml(C.acompte, get('acompte'), pre, cl('acompte')) + '<div id="' + pre + '-reste" aria-live="polite">' + resteHtml(d) + '</div>' +
      champHtml(C.delai, get('delai'), pre, cl('delai')) +
      '<div class="champ' + cl('delai_date') + '" data-champ="delai_date"><label for="' + pre + '-delai_date">Date limite (pour les rappels)</label><input type="date" id="' + pre + '-delai_date" data-c="delai_date" value="' + esc(get('delai_date')) + '"></div>' +
      champHtml(C.lieu, get('lieu'), pre, cl('lieu')) +
      '<p class="petit">Pas d\'adresse exacte, de numéro de pièce d\'identité ni de coordonnées bancaires dans un accord.</p>' +
      champHtml(C.engagements, get('engagements'), pre, cl('engagements')) + champHtml(C.points_flous, get('points_flous'), pre, cl('points_flous'));
  }
  function calculHtml(d) {
    var t = AC.calculer(d);
    if (t.totalCalcule == null) return '';
    var op = esc(AC.milliers(t.quantite)) + ' × ' + esc(AC.fcfa(t.prixUnitaire)) + ' = <strong>' + esc(AC.fcfa(t.totalCalcule)) + '</strong>';
    if (t.ecart) return '<div class="calcul ecart" role="alert"><strong>Attention :</strong> le total écrit (' + esc(AC.fcfa(t.totalEcrit)) + ') ne correspond pas au calcul : ' + op + '. ' +
      '<button type="button" class="lien-btn" data-action="utiliser-calcul">Mettre ' + esc(AC.fcfa(t.totalCalcule)) + '</button></div>';
    if (t.totalEcrit == null) return '<div class="calcul">Calcul : ' + op + '. <button type="button" class="lien-btn" data-action="utiliser-calcul">Mettre comme prix total</button></div>';
    return '<div class="calcul">Total vérifié : ' + op + '.</div>';
  }
  function resteHtml(d) {
    var t = AC.calculer(d);
    if (t.acompteTrop) return '<div class="calcul ecart" role="alert">L\'acompte dépasse le prix total : vérifiez les montants.</div>';
    if (t.reste == null || t.acompte == null) return '';
    return '<div class="calcul">Reste à payer : <strong>' + esc(AC.fcfa(t.reste)) + '</strong></div>';
  }
  function lireChamps(form) {
    var d = {};
    $$('[data-c]', form).forEach(function (el) { d[el.getAttribute('data-c')] = el.value.trim(); });
    return d;
  }
  function vueNouveau(params) {
    titre('Nouvel accord');
    var B = S.brouillon || (S.brouillon = brouillonVide());
    var actif = passActif();
    var h = '<form data-form="nouveau" id="f-nouveau" novalidate>';
    h += '<section class="carte"><h2>1. La conversation <span class="petit">(facultatif)</span></h2>' +
      '<div class="champ"><label for="n-texte">Collez la discussion WhatsApp ou vos notes</label><textarea id="n-texte" rows="6" placeholder="Ex. : Awa : Je prends 20 tenues à 9\u00a0000 F, je donne 50\u00a0000 d\'acompte. Livraison vendredi.">' + esc(B.texte) + '</textarea>' +
      '<span class="aide" id="n-info-texte">' + infoTexte(B) + '</span></div>' +
      '<div class="rang-btn pile"><label class="btn sec fichier">' + ICO.fichier + '<span>Importer une discussion WhatsApp</span><input type="file" id="n-fichier" accept=".txt,.zip,text/plain,application/zip" aria-label="Importer une discussion WhatsApp (.txt ou .zip)"></label>' +
      '<label class="btn sec fichier">' + ICO.photo + '<span>Ajouter des photos</span><input type="file" id="n-photos" accept="image/*" multiple aria-label="Ajouter des photos : devis, bon, capture (4 au plus)"></label></div>' +
      '<details class="aide-export"><summary>Comment exporter une discussion WhatsApp ?</summary><ol><li>Ouvrez la discussion dans WhatsApp.</li><li>Android : ⋮ → <strong>Plus</strong> → <strong>Exporter la discussion</strong> → <strong>Sans médias</strong>. iPhone : touchez le nom du contact → <strong>Exporter la discussion</strong>.</li><li>Enregistrez le fichier, puis touchez « Importer une discussion ». Avec l\'application installée sur Android, choisissez directement AccordAI dans la liste de partage.</li></ol></details>' +
      '<div class="vignettes" id="n-vignettes">' + vignettesHtml(B) + '</div>' +
      '<p class="petit">Photos : devis, bon de commande ou capture d\'écran, 4 au plus. Elles sont réduites sur votre téléphone avant l\'envoi.</p>' +
      (B.photos.length ? '<div class="choix"><label><input type="checkbox" id="n-joindre"' + (B.joindre ? ' checked' : '') + '> Joindre ces photos au dossier comme preuves</label></div>' : '');
    if (actif) {
      h += '<div class="ia-bloc"><button type="button" class="btn plein" id="n-extraire" data-action="extraire">' + ICO.magie + 'Extraire avec l\'IA</button>' +
        '<p class="petit">L\'IA lit la conversation et les photos, puis remplit la fiche. Les numéros de téléphone sont masqués avant l\'envoi. L\'IA peut se tromper : relisez chaque champ.</p><p class="msg" id="n-msg-ia" role="status" aria-live="polite"></p></div>';
    } else {
      h += '<div class="ia-bloc"><p><strong>Remplissage automatique :</strong> avec le Pass AccordAI, l\'IA lit la conversation et les photos et remplit la fiche pour vous.</p>' +
        '<a class="btn sec" href="#/pass">' + ICO.etoile + 'Voir le Pass AccordAI</a><p class="petit">Sans pass, remplissez la fiche ci-dessous : c\'est rapide.</p></div>';
    }
    h += '</section>';
    var classeIa = function (k) { return B.ia.indexOf(k) > -1 ? ' ia' : ''; };
    h += '<fieldset class="carte" id="n-fiche"><legend>2. Ce qui a été convenu</legend>' + (B.ia.length ? '<p class="petit">Les champs marqués d\'un trait vert ont été remplis par l\'IA : vérifiez-les.</p>' : '') +
      '<div class="champ' + classeIa('titre') + '"><label for="n-titre">Objet de l\'accord (obligatoire)</label><input type="text" id="n-titre" maxlength="140" value="' + esc(B.titre) + '" placeholder="Ex. : 20 tenues de mariage pour Awa" autocomplete="off" required></div>' +
      '<div class="champ"><span class="label" id="n-qui">Dans cet accord, vous êtes :</span><div class="choix" role="radiogroup" aria-labelledby="n-qui">' +
      '<label><input type="radio" name="createur" value="vendeur"' + (B.createur !== 'acheteur' ? ' checked' : '') + '> Vendeur ou prestataire</label>' +
      '<label><input type="radio" name="createur" value="acheteur"' + (B.createur === 'acheteur' ? ' checked' : '') + '> Client ou acheteur</label></div></div>' +
      champsHtml(B.champs, 'n', classeIa) +
      '<datalist id="n-noms">' + (B.participants || []).map(function (p) { return '<option value="' + esc(p) + '">'; }).join('') + '</datalist></fieldset>';
    h += '<p class="mention">' + esc(AC.MENTION) + '</p>';
    if (!actif) {
      var n = AC.creationsCeMois(S.compteur);
      h += '<p class="petit centre">Version gratuite : ' + n + ' / ' + AC.LIMITE_GRATUITE + ' accords créés ce mois-ci.</p>';
    }
    h += '<p class="msg" id="n-msg" role="status" aria-live="polite"></p>' +
      '<button type="submit" class="btn plein large" id="n-creer">' + ICO.ok + 'Créer l\'accord et obtenir le lien</button>' +
      '<div class="rang-btn"><a class="btn" href="#/">Plus tard</a><button type="button" class="btn" data-action="vider">' + ICO.poubelle + 'Tout effacer</button></div></form>';
    vue(h);
    if (params && params.get('partage')) lirePartage();
  }
  function infoTexte(B) {
    if (!B.texte) return 'Rien n\'est envoyé tant que vous ne créez pas l\'accord' + (passActif() ? ' ou ne lancez pas l\'extraction.' : '.');
    var n = B.texte.length;
    return n.toLocaleString('fr-FR') + ' caractères' + (B.participants && B.participants.length ? ' · ' + B.participants.length + ' participant' + (B.participants.length > 1 ? 's' : '') + ' : ' + B.participants.slice(0, 3).join(', ') : '') +
      (n > AC.MAX_TEXTE_IA ? ' · seuls les messages les plus récents seront lus par l\'IA.' : '');
  }
  function vignettesHtml(B) {
    return B.photos.map(function (p, i) {
      return '<div class="vignette"><img src="' + p.data + '" alt="Photo ' + (i + 1) + '"><button type="button" data-action="retirer-photo" data-i="' + i + '" aria-label="Retirer la photo ' + (i + 1) + '">' + ICO.x + '</button></div>';
    }).join('');
  }
  function majSource() {
    var B = S.brouillon;
    var v = $('#n-vignettes'); if (v) v.innerHTML = vignettesHtml(B);
    var i = $('#n-info-texte'); if (i) i.textContent = infoTexte(B);
  }
  function importerConversation(fichier) {
    var B = S.brouillon;
    var lecture = /\.zip$/i.test(fichier.name) || /zip/.test(fichier.type)
      ? fichier.arrayBuffer().then(AC.lireZipTexte)
      : fichier.text();
    return lecture.then(function (brut) {
      var w = AC.lireWhatsApp(brut);
      if (w.ok) {
        B.texte = w.texte; B.participants = w.participants;
        toast(w.messages.length + ' messages importés' + (w.participants.length ? ' (' + w.participants.slice(0, 2).join(', ') + ')' : '') + '.');
      } else {
        B.texte = String(brut || '').slice(0, 60000);
        toast('Fichier importé (format WhatsApp non reconnu : texte gardé tel quel).');
      }
      var ta = $('#n-texte'); if (ta) ta.value = B.texte;
      var dl = $('#n-noms'); if (dl) dl.innerHTML = (B.participants || []).map(function (p) { return '<option value="' + esc(p) + '">'; }).join('');
      majSource(); garderBrouillon();
    }).catch(function (e) { toast(texteErreur(e)); });
  }
  function ajouterPhotos(fichiers) {
    var B = S.brouillon;
    var place = AC.MAX_PHOTOS - B.photos.length;
    if (place <= 0) { toast('4 photos au plus : retirez-en une d\'abord.'); return Promise.resolve(); }
    var liste = Array.prototype.slice.call(fichiers, 0, place);
    if (fichiers.length > place) toast('4 photos au plus : les suivantes sont ignorées.');
    return liste.reduce(function (p, f) {
      return p.then(function () { return reduire(f, 1600, 0.82).then(function (ph) { B.photos.push(ph); }, function (e) { toast(texteErreur(e)); }); });
    }, Promise.resolve()).then(function () {
      var avait = !!$('#n-joindre');
      if (!avait && B.photos.length) { vueNouveau(); return; }
      majSource(); garderBrouillon();
    });
  }
  // Fichiers reçus par le partage Android (service worker → cache « accordai-partage »)
  function lirePartage() {
    if (!window.caches) return;
    caches.open('accordai-partage').then(function (c) {
      return c.keys().then(function (cles) {
        return cles.reduce(function (p, req) {
          return p.then(function () {
            return c.match(req).then(function (res) {
              if (!res) return;
              var type = res.headers.get('content-type') || '', nom = decodeURIComponent(res.headers.get('x-nom') || '');
              return res.blob().then(function (b) {
                if (/^image\//.test(type)) return ajouterPhotos([b]);
                var f = new File([b], nom || (/zip/.test(type) ? 'discussion.zip' : 'discussion.txt'), { type: type });
                if (/partage\/texte$/.test(req.url)) {
                  return b.text().then(function (t) { if (S.brouillon.texte) return; S.brouillon.texte = t; var ta = $('#n-texte'); if (ta) ta.value = t; majSource(); garderBrouillon(); });
                }
                return importerConversation(f);
              });
            });
          });
        }, Promise.resolve());
      }).then(function () { return caches.delete('accordai-partage'); });
    }).then(function () { history.replaceState(null, '', '#/nouveau'); }).catch(function () {});
  }
  function extraire(btn) {
    var B = S.brouillon, msg = $('#n-msg-ia');
    if (!B.texte.trim() && !B.photos.length) { message(msg, 'Collez une conversation ou ajoutez une photo d\'abord.', 'erreur'); $('#n-texte').focus(); return; }
    var c = AC.couperTexte(AC.masquerNumeros(B.texte));
    occupe(btn, true, 'L\'IA lit la conversation…');
    message(msg, '');
    api('POST', '/extraire', { texte: c.texte, photos: B.photos.map(function (p) { return p.data; }), pass: { o: S.pass.o, t: S.pass.t } }).then(function (j) {
      var a = j.accord || {}, remplis = [];
      if (a.titre && String(a.titre).trim()) { B.titre = String(a.titre).trim().slice(0, 140); remplis.push('titre'); }
      AC.CHAMPS.forEach(function (ch) {
        var v = a[ch.cle];
        if (v == null || String(v).trim() === '') return;
        B.champs[ch.cle] = ch.montant ? montant(v) : String(v).trim();
        remplis.push(ch.cle);
      });
      if (B.champs.delai && !B.champs.delai_date) { var dd = AC.dateDansTexte(B.champs.delai); if (dd) { B.champs.delai_date = dd; remplis.push('delai_date'); } }
      B.ia = remplis;
      if ((B.participants || []).length === 0) B.participants = [a.vendeur, a.acheteur].filter(Boolean);
      garderBrouillon();
      vueNouveau();
      var t = AC.calculer(B.champs);
      toast(remplis.length ? remplis.length + ' champs remplis par l\'IA : relisez-les.' : 'L\'IA n\'a rien trouvé de précis : remplissez la fiche.');
      if (t.ecart || (a.points_flous && String(a.points_flous).trim())) {
        var m = $('#n-msg-ia');
        message(m, (t.ecart ? 'Le total ne correspond pas à quantité × prix unitaire. ' : '') + (a.points_flous ? 'Des points sont à clarifier avec l\'autre partie avant de confirmer.' : ''), 'erreur');
      }
      var f = $('#n-fiche'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function (e) {
      occupe(btn, false);
      if (e && e.status === 402) {
        S.pass.valide = false; kv('pass', S.pass).catch(function () {});
        message(msg, 'Votre pass n\'est plus valable (expiré ou non reconnu). <a href="#/pass">Voir le pass</a>. Vous pouvez remplir la fiche vous-même.', 'erreur');
        return;
      }
      message(msg, esc(e && e.status === 503 ? 'L\'extraction est indisponible pour le moment. Remplissez la fiche vous-même ou réessayez plus tard.' : texteErreur(e)), 'erreur');
    });
  }
  function creer(form) {
    var B = S.brouillon, msg = $('#n-msg'), btn = $('#n-creer');
    lireFormNouveau(form);
    if (B.titre.trim().length < 2) { message(msg, 'Donnez un objet à l\'accord (par exemple « 20 tenues pour Awa »).', 'erreur'); $('#n-titre').focus(); return; }
    var actif = passActif();
    if (!AC.peutCreer(S.compteur, actif)) {
      message(msg, 'Vous avez créé ' + AC.LIMITE_GRATUITE + ' accords ce mois-ci avec la version gratuite. <a href="#/pass">Activez le Pass AccordAI</a> pour continuer sans limite.', 'erreur');
      return;
    }
    var donnees = AC.nettoyer(Object.assign({}, B.champs, { createur: B.createur }));
    ['prix_unitaire', 'prix_total', 'acompte'].forEach(function (k) { if (donnees[k]) donnees[k] = montant(donnees[k]); });
    occupe(btn, true, 'Création de l\'accord…');
    message(msg, '');
    var corps = { app: 'accord', titre: B.titre.trim(), donnees: donnees };
    if (actif) corps.pass = { o: S.pass.o, t: S.pass.t };
    api('POST', '/creer', corps).then(function (j) {
      var maintenant = new Date().toISOString();
      var r = { id: j.id, role: 'proprio', jeton: j.jetons.proprio, jetonPartie: j.jetons.partie, titre: corps.titre, donnees: donnees, statut: 'ouvert', evenements: [], creeLe: maintenant, ajouteLe: maintenant, premium: !!j.premium, vus: 0, notifie: 0 };
      if (!j.premium) {
        var mois = AC.moisCle();
        S.compteur = { mois: mois, n: AC.creationsCeMois(S.compteur) + 1 };
        kv('compteur', S.compteur).catch(function () {});
        if (actif) { S.pass.verifieLe = null; verifierPass(true); }
      }
      return enregistrer(r).then(function () {
        var photos = B.joindre ? B.photos.slice() : [];
        return photos.reduce(function (p, ph, i) {
          return p.then(function () {
            occupe(btn, false); occupe(btn, true, 'Envoi des photos (' + (i + 1) + '/' + photos.length + ')…');
            return envoyerPhoto(r, ph, 'Pièce jointe à la création (devis, bon ou capture)').catch(function () { toast('Une photo n\'a pas pu être envoyée : ajoutez-la depuis l\'accord.'); });
          });
        }, Promise.resolve());
      }).then(function () { return synchroniser(r).catch(function () {}); }).then(function () {
        r.vus = (r.evenements || []).length; r.notifie = r.vus;
        return enregistrer(r);
      }).then(function () {
        S.brouillon = brouillonVide();
        return DB.effacer('kv', 'brouillon').catch(function () {});
      }).then(function () { S.justeCree = r.id; aller('#/accord/' + r.id + '/partager'); });
    }).catch(function (e) {
      occupe(btn, false);
      if (e && e.status === 429) message(msg, esc(texteErreur(e)) + (actif ? '' : ' <a href="#/pass">Voir le Pass AccordAI</a>'), 'erreur');
      else message(msg, esc(texteErreur(e)), 'erreur');
    });
  }
  function lireFormNouveau(form) {
    var B = S.brouillon;
    if (!form || !B) return;
    var t = $('#n-titre', form); if (t) B.titre = t.value;
    var ta = $('#n-texte', form); if (ta) B.texte = ta.value;
    var c = $('input[name=createur]:checked', form); if (c) B.createur = c.value;
    var j = $('#n-joindre', form); if (j) B.joindre = j.checked;
    B.champs = Object.assign(B.champs || {}, lireChamps($('#n-fiche', form)));
  }

  // ---------- Partage du lien (juste après la création, puis à la demande) ----------
  function vuePartager(id) {
    var r = rec(id);
    if (!r) return vueAbsent();
    titre('Envoyer le lien');
    if (r.role !== 'proprio' || !r.jetonPartie) { aller('#/accord/' + id); return; }
    var lien = AC.lienDossier(r.id, r.jetonPartie), texteMsg = AC.messagePartage(r.titre, lien);
    var nouveau = S.justeCree === r.id;
    var h = '<section class="carte ok"><h1>' + (nouveau ? 'Accord créé' : 'Lien de l\'autre partie') + '</h1><p><strong>' + esc(r.titre) + '</strong> · n° ' + esc(r.id) + '</p>' +
      '<p>Envoyez ce lien à l\'autre partie. Elle pourra lire l\'accord, le confirmer ou proposer une correction, sans rien installer.</p></section>';
    h += '<section class="carte"><h2>' + ICO.lien + 'Lien pour l\'autre partie</h2><div class="lien-boite"><label for="lien-partie" class="vh">Lien pour l\'autre partie</label><input type="text" id="lien-partie" readonly value="' + esc(lien) + '"></div>' +
      '<a class="btn wa large" id="envoyer-wa" href="https://wa.me/?text=' + encodeURIComponent(texteMsg) + '" target="_blank" rel="noopener">' + ICO.wa + 'Envoyer par WhatsApp</a>' +
      (navigator.share ? '<button type="button" class="btn sec large" data-action="partager-lien">' + ICO.partager + 'Partager autrement…</button>' : '') +
      '<button type="button" class="btn large" data-action="copier" data-texte="' + esc(lien) + '">' + ICO.copier + 'Copier le lien</button>' +
      '<p class="petit">Ce lien est secret : ne l\'envoyez qu\'à la personne concernée. Il est gardé sur ce téléphone, vous pourrez le renvoyer depuis l\'accord.</p></section>';
    h += '<details class="carte"><summary><strong>Mon lien personnel (créateur)</strong></summary><p class="petit">Il permet de retrouver cet accord sur un autre téléphone. Ne le partagez avec personne : il donne vos droits de créateur (modifier, clôturer).</p>' +
      '<div class="lien-boite"><label for="lien-proprio" class="vh">Mon lien personnel</label><input type="text" id="lien-proprio" readonly value="' + esc(AC.lienDossier(r.id, r.jeton)) + '"></div>' +
      '<button type="button" class="btn large" data-action="copier" data-texte="' + esc(AC.lienDossier(r.id, r.jeton)) + '">' + ICO.copier + 'Copier mon lien personnel</button></details>';
    h += '<a class="btn plein large" href="#/accord/' + esc(r.id) + '">Voir l\'accord</a>';
    vue(h);
  }

  // ---------- Fiche d'un accord ----------
  function vueAbsent() {
    titre('AccordAI');
    vue('<section class="carte"><h1>Accord absent de ce téléphone</h1><p>Ouvrez le lien reçu (WhatsApp, SMS…) pour afficher l\'accord, ou collez-le dans <a href="#/plus">Plus → Ouvrir un lien d\'accord</a>.</p><a class="btn plein large" href="#/">Mes accords</a></section>');
  }
  function lignesChamps(d, r) {
    var t = AC.calculer(d), h = '';
    AC.CHAMPS.forEach(function (c) {
      var v = d[c.cle];
      if (v == null || v === '') return;
      var aff = c.montant ? montant(v) : String(v);
      h += '<dt>' + esc(AC.LIBELLES[c.cle]) + '</dt><dd' + (c.cle === 'prix_total' && t.ecart ? ' class="ecart"' : '') + '>' + esc(aff) + '</dd>';
      if (c.cle === 'prix_total' && t.ecart) h += '<dt>Calcul</dt><dd class="ecart">' + esc(AC.milliers(t.quantite) + ' × ' + AC.fcfa(t.prixUnitaire) + ' = ' + AC.fcfa(t.totalCalcule)) + ' (différent du total écrit)</dd>';
      if (c.cle === 'delai' && d.delai_date) h += '<dt>Date limite</dt><dd' + (AC.enRetard(r) ? ' class="ecart"' : '') + '>' + esc(AC.dateFr(d.delai_date)) + (AC.enRetard(r) ? ' (dépassée)' : '') + '</dd>';
    });
    if (d.delai_date && !d.delai) h += '<dt>Date limite</dt><dd' + (AC.enRetard(r) ? ' class="ecart"' : '') + '>' + esc(AC.dateFr(d.delai_date)) + (AC.enRetard(r) ? ' (dépassée)' : '') + '</dd>';
    if (t.totalEcrit == null && t.totalCalcule != null) h += '<dt>Total calculé</dt><dd>' + esc(AC.fcfa(t.totalCalcule)) + '</dd>';
    if (t.reste != null) h += '<dt>Reste à payer</dt><dd>' + esc(AC.fcfa(t.reste)) + '</dd>';
    return h || '<dt>Détails</dt><dd>Aucun détail saisi.</dd>';
  }
  function friseHtml(r, verif) {
    var evs = r.evenements || [];
    if (!evs.length) return '<p class="petit">Historique pas encore chargé. Connectez-vous à Internet puis actualisez.</p>';
    return '<ol class="frise">' + evs.map(function (e, i) {
      var det = AC.lignesEvenement(e).filter(function (l) { return !/^Fichier : /.test(l); });
      var casse = verif && !verif.ok && verif.index === i;
      var photo = e.type === 'preuve' && e.donnees && e.donnees.photo;
      return '<li class="' + (e.auteur === r.role ? 'moi' : 'autre') + (casse ? ' casse' : '') + '" data-ev="' + i + '"><span class="point">' + (casse ? ICO.x : (ICO_EV[e.type] || ICO.ok)) + '</span>' +
        '<div class="ev-tete"><strong>' + esc(AC.EVENEMENTS[e.type] || e.type) + '</strong><span class="ev-qui">' + esc(AC.auteur(e, r.role)) + '</span></div>' +
        '<div class="ev-date">' + esc(AC.dateHeure(e.le)) + '</div>' +
        (det.length ? '<div class="ev-det">' + esc(det.join('\n')) + '</div>' : '') +
        (photo ? '<img class="ev-photo" data-photo="' + esc(e.donnees.photo) + '" alt="' + esc('Photo de preuve' + (e.donnees.legende ? ' : ' + e.donnees.legende : '')) + '">' : '') +
        '<div class="empreinte mono" title="Empreinte SHA-256">#' + esc(String(e.empreinte || '').slice(0, 16)) + '…</div></li>';
    }).join('') + '</ol>';
  }
  function verifHtml(r, v) {
    if (!v) return '';
    if (v.ok && !r.alerteCopie) {
      return '<div class="verif ok" role="status">' + ICO.ok + ' Historique intact : ' + v.n + ' événement' + (v.n > 1 ? 's' : '') + ', chaque lien vérifié sur ce téléphone.' +
        '<p>Chaque événement contient l\'empreinte du précédent ; le premier reprend l\'empreinte du numéro ' + esc(r.id) + '.' + (v.recalcul ? ' Chaque empreinte a aussi été recalculée ici : identique.' : '') + '</p>' +
        '<p class="mono">Dernière empreinte : ' + esc(v.derniere) + '</p></div>';
    }
    if (v.ok && r.alerteCopie) {
      return '<div class="verif ko" role="alert">' + ICO.alerte + ' Les liens sont cohérents, mais l\'historique ne correspond plus à la copie gardée sur ce téléphone (événement n° ' + (r.alerteCopie.index + 1) + ').' +
        '<p>Un événement que vous aviez déjà vu a changé ou disparu. Gardez vos PDF déjà téléchargés.</p></div>';
    }
    var e = v.evenement, raisons = { lien: 'son « précédent » ne correspond pas à l\'empreinte de l\'événement d\'avant', origine: 'le premier événement ne part pas du numéro de dossier', empreinte: 'son empreinte est illisible', ordre: 'sa date est antérieure à l\'événement d\'avant', vide: 'aucun événement' };
    return '<div class="verif ko" role="alert">' + ICO.x + ' Historique rompu à l\'événement n° ' + (v.index + 1) + (e ? ' (« ' + esc(AC.EVENEMENTS[e.type] || e.type) + ' », ' + esc(AC.dateHeure(e.le)) + ')' : '') + ' : ' + esc(raisons[v.raison] || 'lien invalide') + '.' +
      '<p>Le dossier a pu être modifié après coup. Gardez vos PDF déjà téléchargés et parlez-en avec l\'autre partie.</p></div>';
  }
  function vueAccord(id) {
    var r = rec(id);
    if (!r) return vueAbsent();
    rendreAccord(r);
    if (enLigne()) {
      var avant = JSON.stringify([r.statut, (r.evenements || []).length, r.donnees]);
      synchroniser(r).then(function () {
        if (location.hash !== '#/accord/' + id) return;
        if (JSON.stringify([r.statut, (r.evenements || []).length, r.donnees]) !== avant) rendreAccord(r);
        else { var s = $('#synchro'); if (s) s.textContent = 'À jour à ' + AC.dateHeure(r.synchroLe).split(' à ')[1]; }
      }).catch(function (e) {
        if (location.hash !== '#/accord/' + id) return;
        var s = $('#synchro');
        if (e && e.status === 404) rendreAccord(r);
        else if (s) s.textContent = e && e.horsLigne ? 'Hors ligne : version gardée sur ce téléphone.' : texteErreur(e);
      });
    }
  }
  function rendreAccord(r) {
    var d = r.donnees || {}, E = AC.etat(r), proprio = r.role === 'proprio', st = r.statut;
    titre(r.titre || 'Accord');
    var h = '<section class="carte"><div class="fiche-tete"><h1>' + esc(r.titre) + '</h1>' + badge(st) + '</div>' +
      '<p class="meta">N° ' + esc(r.id) + ' · ' + (proprio ? 'vous l\'avez créé' : 'reçu d\'un partenaire') + (r.evenements && r.evenements[0] ? ' le ' + esc(AC.dateFr(r.evenements[0].le.slice(0, 10))) : '') + '</p>' +
      '<p class="meta"><span id="synchro">' + (!enLigne() ? 'Hors ligne : version gardée sur ce téléphone' + (r.synchroLe ? ' (mise à jour le ' + esc(AC.dateHeure(r.synchroLe)) + ')' : '') + '.' : r.synchroLe ? 'Mis à jour le ' + esc(AC.dateHeure(r.synchroLe)) : 'Pas encore synchronisé') + '</span> <button type="button" class="lien-btn" data-action="actualiser">Actualiser</button></p></section>';
    // Bandeaux d'état
    if (r.introuvable) h += '<section class="carte alerte"><h2>' + ICO.alerte + 'Accord introuvable sur le serveur</h2><p>Le lien n\'est plus valable ou l\'accord a été effacé (180 jours sans activité). La copie gardée sur ce téléphone reste lisible et imprimable.</p></section>';
    if (r.alerteCopie) h += '<section class="carte alerte"><h2>' + ICO.alerte + 'Historique changé</h2><p>Un événement déjà vu sur ce téléphone a changé ou disparu (n° ' + (r.alerteCopie.index + 1) + '). Gardez vos PDF déjà téléchargés.</p></section>';
    var nomCreateur = d.createur === 'acheteur' ? d.acheteur : d.createur === 'vendeur' ? d.vendeur : '';
    if (!proprio && st === 'ouvert') h += '<section class="carte info"><h2>' + ICO.info + (nomCreateur ? esc(nomCreateur) + ' vous propose cet accord' : 'Un accord vous est proposé') + '</h2><p>Lisez ce qui a été convenu. Si tout est juste, confirmez. Sinon, proposez une correction. Pas besoin d\'installer l\'application.</p></section>';
    if (proprio && st === 'ouvert') h += '<section class="carte accent"><h2>' + ICO.horloge + 'En attente de l\'autre partie</h2><p>Elle n\'a pas encore confirmé. Renvoyez-lui le lien si besoin.</p><a class="btn sec" href="#/accord/' + esc(r.id) + '/partager">' + ICO.wa + 'Renvoyer le lien</a></section>';
    if (E.correction) {
      var ch = AC.changements(E.correction.donnees);
      h += '<section class="carte accent" id="correction"><h2>' + ICO.modifier + (proprio ? 'L\'autre partie propose une correction' : 'Votre correction attend une réponse') + '</h2>' +
        '<p class="petit">Le ' + esc(AC.dateHeure(E.correction.le)) + '</p><ul class="diff">' + ch.map(function (c) {
          return '<li><strong>' + esc(c.label) + '</strong> : <del>' + esc(c.avant || '(vide)') + '</del> → <ins>' + esc(c.apres || '(vide)') + '</ins></li>';
        }).join('') + (E.correction.donnees.commentaire ? '<li>« ' + esc(E.correction.donnees.commentaire) + ' »</li>' : '') + '</ul>' +
        (proprio ? '<div class="rang-btn pile"><button type="button" class="btn plein" data-action="accepter">' + ICO.ok + 'Accepter la correction</button><a class="btn sec" href="#/accord/' + esc(r.id) + '/modifier">' + ICO.modifier + 'Proposer autre chose</a></div>' : '') + '</section>';
    }
    if (E.aReconfirmer && !E.correction && ['confirme', 'a_revoir', 'ouvert'].indexOf(st) > -1) {
      h += proprio ? '<section class="carte accent"><h2>' + ICO.info + 'Modifié après confirmation</h2><p>L\'autre partie doit relire et confirmer à nouveau. Renvoyez-lui le lien si besoin.</p></section>'
        : '<section class="carte accent"><h2>' + ICO.info + 'L\'accord a été modifié</h2><p>Il a changé depuis votre confirmation. Relisez puis confirmez à nouveau, ou proposez une correction.</p></section>';
    }
    if (AC.enRetard(r)) h += '<section class="carte alerte"><h2>' + ICO.horloge + 'Délai dépassé</h2><p>La date limite était le ' + esc(AC.dateFr(d.delai_date)) + ' et la livraison n\'est pas encore déclarée.</p></section>';
    if (!proprio && st === 'livre') h += '<section class="carte info"><h2>' + ICO.camion + 'Livraison déclarée</h2><p>Si vous avez bien reçu, confirmez la réception. Sinon, ajoutez une note.</p><button type="button" class="btn plein" data-action="reception">' + ICO.colis + 'J\'ai bien reçu</button></section>';

    h += '<section class="carte"><h2>Ce qui a été convenu</h2><dl class="champs">' + lignesChamps(d, r) + '</dl>' +
      (d.points_flous ? '<p class="mention"><strong>À clarifier :</strong> ' + esc(d.points_flous) + '</p>' : '') + '</section>';

    // Actions
    var A = [];
    if (st !== 'clos') {
      if (proprio) {
        A.push('<a class="btn wa long" href="#/accord/' + esc(r.id) + '/partager">' + ICO.wa + 'Envoyer le lien à l\'autre partie</a>');
        A.push('<a class="btn" href="#/accord/' + esc(r.id) + '/modifier">' + ICO.modifier + 'Modifier</a>');
        A.push('<button type="button" class="btn" data-action="note">' + ICO.note + 'Note</button>');
        A.push('<button type="button" class="btn" data-action="photo">' + ICO.photo + 'Photo</button>');
        if (['livre', 'recu'].indexOf(st) < 0) A.push('<button type="button" class="btn" data-action="livraison">' + ICO.camion + 'Livraison</button>');
        A.push('<button type="button" class="btn" data-action="cloture">' + ICO.fin + 'Clôturer</button>');
      } else {
        if (st === 'ouvert' || st === 'a_revoir' || E.aReconfirmer) A.push('<button type="button" class="btn plein long" data-action="confirmer">' + ICO.ok + 'Je confirme cet accord</button>');
        A.push('<a class="btn" href="#/accord/' + esc(r.id) + '/corriger">' + ICO.modifier + 'Proposer une correction</a>');
        A.push('<button type="button" class="btn" data-action="note">' + ICO.note + 'Note</button>');
        A.push('<button type="button" class="btn" data-action="photo">' + ICO.photo + 'Photo</button>');
        if (st === 'confirme') A.push('<button type="button" class="btn" data-action="reception">' + ICO.colis + 'Reçu</button>');
      }
    } else {
      A.push('<button type="button" class="btn" data-action="note">' + ICO.note + 'Note</button>');
    }
    A.push('<button type="button" class="btn" data-action="pdf">' + ICO.pdf + 'PDF</button>');
    h += '<section class="carte"><h2>Actions</h2><div class="grille-actions">' + A.join('') + '</div></section>';

    var v = S.verifs[r.id];
    h += '<section class="carte" id="historique"><h2>Historique</h2>' + friseHtml(r, v) +
      '<button type="button" class="btn sec large" data-action="verifier">' + ICO.chaine + 'Vérifier l\'historique</button><div id="resultat-verif" aria-live="polite">' + verifHtml(r, v) + '</div></section>';
    h += '<p class="mention">' + esc(AC.MENTION) + '</p>';
    if (!proprio) h += '<section class="carte"><h2>Vous aussi, gardez vos accords</h2><p class="petit">Clients, fournisseurs, commandes : notez ce qui a été convenu et faites-le confirmer par un simple lien.</p><a class="btn sec" href="#/nouveau">' + ICO.plus + 'Créer un accord</a></section>';
    h += '<p class="centre"><button type="button" class="lien-btn" data-action="oublier">Retirer cet accord de ce téléphone</button></p>';
    vue(h);
    afficherPhotos(r);
    if ((r.vus || 0) !== (r.evenements || []).length) { r.vus = (r.evenements || []).length; enregistrer(r).catch(function () {}); }
  }

  // Vérification de la chaîne (liens précédent → empreinte), puis recalcul complet si possible
  function verifier(r) {
    return AC.verifierChaine(r.id, r.evenements).then(function (v) {
      if (!v.ok) return v;
      return AC.recalculer(r.evenements).then(function (x) { v.recalcul = x.tous; return v; }, function () { return v; });
    });
  }

  // ---------- Feuilles d'action ----------
  function feuille(o) {
    var dlg = document.createElement('dialog');
    dlg.className = 'feuille';
    dlg.setAttribute('aria-labelledby', 'f-titre');
    dlg.innerHTML = '<form novalidate><h2 id="f-titre"><span>' + esc(o.titre) + '</span><button type="button" class="icone-btn" data-fermer aria-label="Fermer">' + ICO.x + '</button></h2>' +
      o.corps + '<p class="msg" id="f-msg" role="status" aria-live="polite"></p>' +
      (o.bouton ? '<button type="submit" class="btn ' + (o.classe || 'plein') + ' large" id="f-valider">' + o.bouton + '</button>' : '') + '</form>';
    document.body.appendChild(dlg);
    var form = $('form', dlg), retourFocus = document.activeElement;
    function fermer() { try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); } dlg.remove(); if (retourFocus && retourFocus.focus) try { retourFocus.focus(); } catch (e) { /* élément disparu */ } }
    $('[data-fermer]', dlg).addEventListener('click', fermer);
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); fermer(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) fermer(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!o.valider) return fermer();
      var btn = $('#f-valider', dlg), msg = $('#f-msg', dlg);
      occupe(btn, true, o.attente);
      message(msg, '');
      Promise.resolve().then(function () { return o.valider(form, function (t) { occupe(btn, false); occupe(btn, true, t); }); }).then(function (res) {
        fermer();
        if (o.ok) o.ok(res);
      }).catch(function (err) { occupe(btn, false); message(msg, esc(texteErreur(err)), 'erreur'); });
    });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    var premier = $('textarea, input:not([type=hidden])', dlg);
    if (premier && o.focus !== false) try { premier.focus(); } catch (e) { /* rien */ }
    if (o.apres) o.apres(dlg, fermer);
    return dlg;
  }
  function zone(id, label, place, requis) {
    return '<div class="champ"><label for="' + id + '">' + esc(label) + '</label><textarea id="' + id + '" rows="3" maxlength="1500" placeholder="' + esc(place || '') + '"' + (requis ? ' required' : '') + '></textarea></div>';
  }
  function champPhoto(id, label) {
    return '<div class="champ"><span class="label">' + esc(label) + '</span><label class="btn sec fichier large">' + ICO.photo + '<span id="' + id + '-nom">Choisir ou prendre une photo</span><input type="file" id="' + id + '" accept="image/*" aria-label="' + esc(label) + '"></label>' +
      '<img id="' + id + '-apercu" alt="Aperçu de la photo" hidden style="max-width:160px;border-radius:10px;margin-top:6px"></div>';
  }
  function brancherPhoto(dlg, id) {
    var inp = $('#' + id, dlg), etat = { photo: null, encours: null };
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      $('#' + id + '-nom', dlg).textContent = 'Préparation de la photo…';
      etat.encours = reduire(f, 1600, 0.82).then(function (p) {
        etat.photo = p;
        var ap = $('#' + id + '-apercu', dlg); ap.src = p.data; ap.hidden = false;
        $('#' + id + '-nom', dlg).textContent = 'Changer de photo';
        return p;
      }, function (e) { $('#' + id + '-nom', dlg).textContent = 'Choisir ou prendre une photo'; message($('#f-msg', dlg), esc(texteErreur(e)), 'erreur'); return null; });
    });
    return etat;
  }
  function apresAction(r, texte) { toast(texte); if (location.hash === '#/accord/' + r.id) rendreAccord(r); }

  function actionConfirmer(r) {
    feuille({
      titre: 'Confirmer l\'accord', bouton: ICO.ok + 'Je confirme', attente: 'Confirmation…',
      corps: '<p>En confirmant, vous dites que ce qui est écrit correspond à ce qui a été convenu. Votre confirmation est datée et ajoutée à l\'historique.</p>' + zone('f-com', 'Commentaire (facultatif)', 'Ex. : D\'accord, merci.'),
      valider: function (f) { var c = $('#f-com', f).value.trim(); return evenement(r, 'confirmation', c ? { commentaire: c } : {}); },
      ok: function () { apresAction(r, 'Accord confirmé.'); }
    });
  }
  function actionNote(r) {
    feuille({
      titre: 'Ajouter une note', bouton: ICO.note + 'Ajouter la note', attente: 'Envoi…',
      corps: '<p class="petit">La note est visible par les deux parties et reste dans l\'historique.</p>' + zone('f-texte', 'Votre note', 'Ex. : Acompte reçu par Wave ce matin.', true),
      valider: function (f) { var t = $('#f-texte', f).value.trim(); if (!t) throw new Error('Écrivez votre note.'); return evenement(r, 'note', { texte: t }); },
      ok: function () { apresAction(r, 'Note ajoutée.'); }
    });
  }
  function actionPhoto(r) {
    var etat;
    feuille({
      titre: 'Ajouter une photo de preuve', bouton: ICO.photo + 'Envoyer la photo', attente: 'Envoi de la photo…',
      corps: champPhoto('f-photo', 'Photo (bon, reçu, produit, colis…)') + '<div class="champ"><label for="f-legende">Légende (facultatif)</label><input type="text" id="f-legende" maxlength="200" placeholder="Ex. : Tissu choisi par la cliente"></div>',
      apres: function (dlg) { etat = brancherPhoto(dlg, 'f-photo'); },
      valider: function (f) {
        return Promise.resolve(etat.encours).then(function () {
          if (!etat.photo) throw new Error('Choisissez une photo.');
          return envoyerPhoto(r, etat.photo, $('#f-legende', f).value.trim());
        }).then(function () { return synchroniser(r); });
      },
      ok: function () { apresAction(r, 'Photo ajoutée à l\'historique.'); }
    });
  }
  function actionLivraison(r) {
    var etat;
    feuille({
      titre: 'Déclarer la livraison', bouton: ICO.camion + 'Déclarer la livraison', attente: 'Envoi…',
      corps: '<p class="petit">L\'autre partie pourra ensuite confirmer la réception.</p>' + zone('f-com', 'Commentaire (facultatif)', 'Ex. : 20 tenues remises à la cliente au marché.') + champPhoto('f-photo', 'Photo de la livraison (facultatif)'),
      apres: function (dlg) { etat = brancherPhoto(dlg, 'f-photo'); },
      valider: function (f, etape) {
        var c = $('#f-com', f).value.trim(), donnees = c ? { commentaire: c } : {};
        return Promise.resolve(etat.encours).then(function () {
          if (!etat.photo) return null;
          etape('Envoi de la photo…');
          return envoyerPhoto(r, etat.photo, 'Preuve de livraison');
        }).then(function (j) {
          if (j && j.photo) donnees.photo = j.photo;
          etape('Déclaration de la livraison…');
          return evenement(r, 'livraison', donnees);
        });
      },
      ok: function () { apresAction(r, 'Livraison déclarée.'); }
    });
  }
  function actionReception(r) {
    feuille({
      titre: 'Confirmer la réception', bouton: ICO.colis + 'J\'ai bien reçu', attente: 'Envoi…',
      corps: '<p>Confirmez seulement si vous avez reçu ce qui était convenu.</p>' + zone('f-com', 'Commentaire (facultatif)', 'Ex. : Bien reçu, merci.'),
      valider: function (f) { var c = $('#f-com', f).value.trim(); return evenement(r, 'reception', c ? { commentaire: c } : {}); },
      ok: function () { apresAction(r, 'Réception confirmée.'); }
    });
  }
  function actionCloture(r) {
    feuille({
      titre: 'Clôturer l\'accord', bouton: ICO.fin + 'Clôturer', attente: 'Clôture…',
      corps: '<p>L\'accord sera marqué « Clos ». L\'historique reste lisible et imprimable.</p>' + zone('f-com', 'Commentaire (facultatif)', 'Ex. : Tout est payé et livré.'),
      valider: function (f) { var c = $('#f-com', f).value.trim(); return evenement(r, 'cloture', c ? { commentaire: c } : {}); },
      ok: function () { apresAction(r, 'Accord clos.'); }
    });
  }
  function actionAccepter(r) {
    var corr = AC.etat(r).correction;
    if (!corr) return;
    var ch = AC.changements(corr.donnees);
    feuille({
      titre: 'Accepter la correction', bouton: ICO.ok + 'Accepter', attente: 'Envoi…',
      corps: '<p>L\'accord sera mis à jour ainsi :</p><ul class="diff">' + ch.map(function (c) { return '<li><strong>' + esc(c.label) + '</strong> : <del>' + esc(c.avant || '(vide)') + '</del> → <ins>' + esc(c.apres || '(vide)') + '</ins></li>'; }).join('') + '</ul>',
      valider: function () {
        var maj = Object.assign({}, r.donnees), donnees = { correction: String(corr.id) };
        ch.forEach(function (c) { maj[c.cle] = c.apres; donnees[c.cle] = c.apres; donnees['avant_' + c.cle] = r.donnees[c.cle] == null ? '' : String(r.donnees[c.cle]); });
        return evenement(r, 'acceptation', donnees, AC.nettoyer(maj));
      },
      ok: function () { apresAction(r, 'Correction acceptée : l\'accord est à jour.'); }
    });
  }
  // jsPDF (copie locale) n'est chargé qu'au premier PDF : ouverture plus rapide pour l'autre partie
  var jsPdfCharge = null;
  function chargerJsPdf() {
    if (window.jspdf) return Promise.resolve();
    if (jsPdfCharge) return jsPdfCharge;
    jsPdfCharge = new Promise(function (ok, ko) {
      var sc = document.createElement('script');
      sc.src = 'vendor/jspdf.umd.min.js';
      sc.onload = function () { ok(); };
      sc.onerror = function () { jsPdfCharge = null; sc.remove(); ko(new Error('module PDF non chargé (connexion ?)')); };
      document.head.appendChild(sc);
    });
    return jsPdfCharge;
  }
  function actionPdf(r, btn) {
    occupe(btn, true, 'PDF…');
    var photos = {};
    var noms = (r.evenements || []).filter(function (e) { return e.type === 'preuve' && e.donnees && e.donnees.photo; }).map(function (e) { return e.donnees.photo; });
    chargerJsPdf().then(function () { return noms.reduce(function (p, nom) {
      return p.then(function () { return obtenirPhoto(r, nom).then(function (ph) { if (ph) photos[nom] = ph; }); });
    }, Promise.resolve()); }).then(function () {
      return verifier(r).catch(function () { return null; });
    }).then(function (v) {
      var blob = window.PDFA.generer(r, { photos: photos, verification: v, premium: passActif() });
      var nom = 'Accord-' + r.id + '.pdf';
      occupe(btn, false);
      var url = URL.createObjectURL(blob), fichier = null;
      try { fichier = new File([blob], nom, { type: 'application/pdf' }); } catch (e) { fichier = null; }
      var peutPartager = fichier && navigator.canShare && navigator.canShare({ files: [fichier] });
      feuille({
        titre: 'Dossier chronologique prêt', focus: false,
        corps: '<p>' + esc(nom) + ' · ' + Math.max(1, Math.round(blob.size / 1024)) + ' Ko' + (v && v.ok ? ' · historique vérifié' : '') + '</p>' +
          '<a class="btn plein large" id="f-telecharger" href="' + url + '" download="' + esc(nom) + '">' + ICO.pdf + 'Télécharger le PDF</a>' +
          (peutPartager ? '<button type="button" class="btn wa large" id="f-partager-pdf">' + ICO.partager + 'Envoyer le PDF (WhatsApp…)</button>' : '') +
          (passActif() ? '' : '<p class="petit">Version gratuite : le PDF porte la mention « Créé avec AccordAI ». <a href="#/pass">Pass AccordAI</a></p>'),
        apres: function (dlg) {
          var b = $('#f-partager-pdf', dlg);
          if (b) b.addEventListener('click', function () { navigator.share({ files: [fichier], title: 'Accord ' + r.id }).catch(function () {}); });
          setTimeout(function () { URL.revokeObjectURL(url); }, 10 * 60000);
        }
      });
    }).catch(function (e) { occupe(btn, false); toast('PDF impossible : ' + texteErreur(e)); });
  }
  function actionVerifier(r, btn) {
    occupe(btn, true, 'Vérification…');
    var suite = enLigne() ? synchroniser(r).catch(function () {}) : Promise.resolve();
    suite.then(function () { return verifier(r); }).then(function (v) {
      S.verifs[r.id] = v;
      if (location.hash === '#/accord/' + r.id) {
        rendreAccord(r);
        var res = $('#resultat-verif'); if (res) res.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }).catch(function (e) { occupe(btn, false); toast(texteErreur(e)); });
  }

  // ---------- Corriger (autre partie) / Modifier (créateur) ----------
  function vueCorriger(id, mode) {
    var r = rec(id);
    if (!r) return vueAbsent();
    var proprio = r.role === 'proprio';
    if ((mode === 'modifier') !== proprio) { aller('#/accord/' + id + '/' + (proprio ? 'modifier' : 'corriger')); return; }
    titre(proprio ? 'Modifier l\'accord' : 'Proposer une correction');
    var d = r.donnees || {};
    var h = '<form data-form="corriger" id="f-corriger" novalidate><section class="carte ' + (proprio ? '' : 'info') + '"><h1>' + esc(r.titre) + '</h1><p>' +
      (proprio ? 'Changez les champs nécessaires. La modification est datée dans l\'historique et l\'autre partie devra confirmer à nouveau.'
        : 'Changez seulement ce qui ne correspond pas à ce qui a été convenu. L\'autre partie verra votre proposition, champ par champ, et pourra l\'accepter.') + '</p></section>' +
      '<fieldset class="carte" id="c-fiche"><legend>Champs</legend>' + champsHtml(d, 'c') + '<datalist id="c-noms"></datalist></fieldset>' +
      '<section class="carte"><div class="champ"><label for="c-commentaire">' + (proprio ? 'Pourquoi ce changement ? (facultatif)' : 'Explication (facultatif)') + '</label><textarea id="c-commentaire" rows="3" maxlength="1500" placeholder="Ex. : Remise de 10 000 F convenue au téléphone."></textarea></div>' +
      '<ul class="diff" id="c-resume" aria-live="polite"></ul></section>' +
      '<p class="msg" id="c-msg" role="status" aria-live="polite"></p>' +
      '<button type="submit" class="btn plein large" id="c-envoyer">' + ICO.ok + (proprio ? 'Enregistrer la modification' : 'Envoyer la correction') + '</button>' +
      '<a class="btn large" href="#/accord/' + esc(r.id) + '">Annuler</a></form>';
    vue(h);
  }
  function resumeCorrection(r, form) {
    var nouv = lireChamps($('#c-fiche', form));
    var diff = AC.differences(r.donnees || {}, nouv);
    $$('[data-champ]', form).forEach(function (el) { var k = el.getAttribute('data-champ'); el.classList.toggle('change', Object.prototype.hasOwnProperty.call(diff.donnees, k)); });
    var ul = $('#c-resume', form);
    if (ul) ul.innerHTML = AC.changements(diff.donnees).map(function (c) { return '<li><strong>' + esc(c.label) + '</strong> : <del>' + esc(c.avant || '(vide)') + '</del> → <ins>' + esc(c.apres || '(vide)') + '</ins></li>'; }).join('');
    return { nouv: nouv, diff: diff };
  }
  function envoyerCorrection(r, form) {
    var x = resumeCorrection(r, form), msg = $('#c-msg'), btn = $('#c-envoyer');
    var com = $('#c-commentaire', form).value.trim();
    ['prix_unitaire', 'prix_total', 'acompte'].forEach(function (k) { if (x.diff.donnees[k]) x.diff.donnees[k] = montant(x.diff.donnees[k]); });
    if (!x.diff.n) { message(msg, 'Changez au moins un champ.', 'erreur'); return; }
    var donnees = Object.assign({}, x.diff.donnees); if (com) donnees.commentaire = com;
    occupe(btn, true, 'Envoi…');
    var proprio = r.role === 'proprio';
    var maj = null;
    if (proprio) {
      maj = Object.assign({}, r.donnees);
      Object.keys(x.diff.donnees).forEach(function (k) { if (k.indexOf('avant_') !== 0) maj[k] = x.diff.donnees[k]; });
      maj = AC.nettoyer(maj);
    }
    evenement(r, proprio ? 'modification' : 'correction', donnees, maj).then(function () {
      aller('#/accord/' + r.id);
      toast(proprio ? 'Modification enregistrée. Prévenez l\'autre partie.' : 'Correction envoyée à l\'autre partie.');
    }).catch(function (e) { occupe(btn, false); message(msg, esc(texteErreur(e)), 'erreur'); });
  }

  // ---------- Pass ----------
  function vuePass() {
    titre('Pass AccordAI');
    var P = S.pass, actif = passActif();
    var avantages = '<ul class="atouts"><li>' + ICO.magie + '<span><strong>Extraction par l\'IA</strong> : collez la discussion WhatsApp ou photographiez le devis, la fiche se remplit seule.</span></li>' +
      '<li>' + ICO.ok + '<span><strong>Accords sans limite</strong> (la version gratuite en permet ' + AC.LIMITE_GRATUITE + ' par mois).</span></li>' +
      '<li>' + ICO.pdf + '<span><strong>PDF sans mention</strong> « Créé avec AccordAI ».</span></li></ul>';
    var h = '';
    if (P && actif) {
      var nom = P.produit && AC.PASS[P.produit] ? AC.PASS[P.produit].nom : 'Pass AccordAI';
      h += '<section class="carte ok"><div class="statut-pass">' + ICO.etoile + '<div><strong>' + esc(nom) + ' actif</strong><span class="petit">' + (P.fin ? 'Jusqu\'au ' + esc(AC.dateFr(P.fin.slice(0, 10))) : 'Vérifié le ' + esc(heure(P.verifieLe))) + ' · commande ' + esc(P.o) + '</span></div></div></section>' + avantages +
        '<p class="petit">Gardez le lien de votre commande : il permet d\'activer le pass sur un autre téléphone.</p>' +
        '<div class="rang-btn"><button type="button" class="btn sec" data-action="verifier-pass">' + ICO.rafraichir + 'Vérifier maintenant</button><button type="button" class="btn" data-action="retirer-pass">Retirer de ce téléphone</button></div>';
    } else {
      if (P && !actif) h += '<section class="carte alerte"><h2>' + ICO.alerte + 'Pass expiré ou non reconnu</h2><p>Le pass de la commande ' + esc(P.o) + ' n\'est plus actif. Renouvelez-le, puis collez le lien de la nouvelle commande.</p></section>';
      h += '<section class="carte"><h1>Pass AccordAI</h1><p class="lead">Moins de saisie, plus d\'accords suivis.</p>' + avantages +
        '<div class="offres"><div class="offre"><strong>1 mois</strong><span class="prix">3 000 F</span><span class="petit">Payé par Wave</span><a class="btn sec" href="' + URL_PASS['pass-accordai-1-mois'] + '" target="_blank" rel="noopener">' + ICO.boutique + 'Choisir</a></div>' +
        '<div class="offre mise"><strong>12 mois</strong><span class="prix">30 000 F</span><span class="petit">2 mois offerts</span><a class="btn plein" href="' + URL_PASS['pass-accordai-12-mois'] + '" target="_blank" rel="noopener">' + ICO.boutique + 'Choisir</a></div></div></section>';
      h += '<form class="carte" data-form="pass"><h2>Activer mon pass</h2><ol class="etapes"><li>Achetez le pass dans la boutique et payez par Wave.</li><li>Sur la page de votre commande payée, copiez le lien de la page.</li><li>Collez-le ci-dessous puis touchez « Activer ».</li></ol>' +
        '<div class="champ"><label for="p-lien">Lien de votre commande</label><textarea id="p-lien" rows="3" placeholder="https://…/boutique/commande.html?o=TCV-…&amp;t=…" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea></div>' +
        '<p class="msg" id="p-msg" role="status" aria-live="polite"></p><button type="submit" class="btn plein large" id="p-activer">' + ICO.etoile + 'Activer</button></form>';
      h += '<section class="carte"><h2>Version gratuite</h2><p>Saisie de la fiche à la main, ' + AC.LIMITE_GRATUITE + ' accords par mois, lien de confirmation, historique vérifiable, PDF avec mention. Ce mois-ci : ' + AC.creationsCeMois(S.compteur) + ' / ' + AC.LIMITE_GRATUITE + '.</p></section>';
    }
    vue(h);
  }
  function infosCommande(c) {
    // Détails de la commande (produit, date de paiement) pour afficher la fin du pass ; facultatif
    var ctl = window.AbortController ? new AbortController() : null;
    var tm = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
    return fetch(AC.API_BOUTIQUE + '/commandes/' + encodeURIComponent(c.o) + '?t=' + encodeURIComponent(c.t), { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        clearTimeout(tm);
        var k = j && j.commande;
        if (!k || !k.produit || !AC.PASS[k.produit.slug]) return null;
        return { produit: k.produit.slug, fin: AC.finPass(k.produit.slug, k.payee_le) };
      }).catch(function () { clearTimeout(tm); return null; });
  }
  function activerPass(form) {
    var msg = $('#p-msg'), btn = $('#p-activer');
    var c = AC.lireLienCommande($('#p-lien', form).value);
    if (!c) { message(msg, 'Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « TCV- »).', 'erreur'); return; }
    occupe(btn, true, 'Vérification…');
    message(msg, '');
    api('POST', '/pass', { app: 'accord', pass: { o: c.o, t: c.t } }).then(function (j) {
      if (!j.valide) throw { message: 'Cette commande n\'ouvre pas de Pass AccordAI en cours : paiement pas encore confirmé, autre produit, ou pass expiré. Vérifiez la page de la commande puis réessayez.' };
      return infosCommande(c).then(function (x) {
        var maintenant = new Date().toISOString();
        S.pass = { o: c.o, t: c.t, valide: true, produit: x && x.produit, fin: x && x.fin, activeLe: maintenant, verifieLe: maintenant };
        return kv('pass', S.pass);
      });
    }).then(function () { toast('Pass AccordAI activé. Merci !'); vuePass(); }).catch(function (e) { occupe(btn, false); message(msg, esc(texteErreur(e)), 'erreur'); });
  }
  // Vérification du pass : au plus une fois par jour en ligne (hors ligne, il reste actif jusqu'à sa date de fin)
  function verifierPass(force) {
    var P = S.pass;
    if (!P || !enLigne()) return Promise.resolve();
    if (!force && P.verifieLe && Date.now() - Date.parse(P.verifieLe) < 24 * HEURE_MS) return Promise.resolve();
    return api('POST', '/pass', { app: 'accord', pass: { o: P.o, t: P.t } }).then(function (j) {
      P.valide = !!j.valide; P.verifieLe = new Date().toISOString();
      return kv('pass', P);
    }).catch(function () {});
  }

  // ---------- Plus : installation, rappels, thème, liens, à propos ----------
  var invite = null;
  function vuePlus() {
    titre('Plus');
    var notifOk = 'Notification' in window;
    var theme = ''; try { theme = localStorage.getItem('accordai-theme') || ''; } catch (e) { theme = ''; }
    var h = '<section class="carte"><h2>Application</h2><ul class="menu">';
    if (!estInstallee()) {
      if (invite) h += '<li><button type="button" data-action="installer">' + ICO.installer + '<span>Installer AccordAI<small>Ouverture d\'un geste, même sans Internet</small></span></button></li>';
      else if (ios()) h += '<li><div class="bandeau" style="padding:10px 0">' + ICO.installer + '<span>Installer sur iPhone : dans Safari, touchez <strong>Partager</strong> puis <strong>Sur l\'écran d\'accueil</strong>.</span></div></li>';
      else h += '<li><div class="bandeau" style="padding:10px 0">' + ICO.installer + '<span>Installer : dans le menu du navigateur (⋮), choisissez <strong>Installer l\'application</strong> ou <strong>Ajouter à l\'écran d\'accueil</strong>.</span></div></li>';
    }
    h += '<li><button type="button" data-action="notifs" ' + (notifOk ? '' : 'disabled') + '>' + ICO.cloche + '<span>Rappels en notification<small>' +
      (!notifOk ? 'Non disponibles sur ce navigateur : les rappels restent dans l\'application.' : S.reglages.notifs && Notification.permission === 'granted' ? 'Activés : délais dépassés et réponses de l\'autre partie, à l\'ouverture de l\'application.' : Notification.permission === 'denied' ? 'Bloqués dans les réglages du navigateur.' : 'Désactivés : touchez pour activer.') + '</small></span></button></li>';
    h += '<li><div class="champ" style="margin:10px 0"><label for="theme">' + 'Thème' + '</label><select id="theme" data-action="theme"><option value=""' + (!theme ? ' selected' : '') + '>Comme le téléphone</option><option value="light"' + (theme === 'light' ? ' selected' : '') + '>Clair</option><option value="dark"' + (theme === 'dark' ? ' selected' : '') + '>Sombre</option></select></div></li></ul></section>';
    h += '<form class="carte" data-form="liens"><h2>Ouvrir un lien d\'accord</h2><p class="petit">Collez un ou plusieurs liens d\'accord (ou le contenu d\'une sauvegarde) pour les retrouver sur ce téléphone.</p>' +
      '<div class="champ"><label for="l-liens">Liens</label><textarea id="l-liens" rows="3" placeholder="https://…/apps/accord/#d=D-…&amp;t=…" autocapitalize="off" spellcheck="false"></textarea></div>' +
      '<div class="rang-btn"><button type="submit" class="btn plein" id="l-ouvrir">' + ICO.lien + 'Ouvrir</button><label class="btn sec fichier">' + ICO.fichier + '<span>Depuis un fichier</span><input type="file" id="l-fichier" accept=".txt,text/plain" aria-label="Ouvrir une sauvegarde de liens"></label></div><p class="msg" id="l-msg" role="status" aria-live="polite"></p></form>';
    h += '<section class="carte"><h2>Sauvegarder mes liens</h2><p class="petit">Les liens secrets de vos accords sont gardés sur ce téléphone uniquement. Téléchargez-les de temps en temps et gardez le fichier en lieu sûr (il donne accès à vos accords).</p>' +
      '<button type="button" class="btn sec large" data-action="sauvegarder" ' + (S.dossiers.length ? '' : 'disabled') + '>' + ICO.sauvegarde + 'Télécharger mes liens (' + S.dossiers.length + ')</button></section>';
    h += '<section class="carte"><h2>Bon à savoir</h2><p class="mention" style="margin-top:0">' + esc(AC.MENTION) + '</p>' +
      '<ul class="atouts"><li>' + ICO.info + '<span>AccordAI ne donne aucun conseil juridique. L\'IA aide seulement à remplir la fiche : relisez toujours.</span></li>' +
      '<li>' + ICO.cadenas + '<span>Seuls les détenteurs d\'un lien voient l\'accord. Le serveur ne garde que l\'empreinte des liens, jamais les liens eux-mêmes.</span></li>' +
      '<li>' + ICO.horloge + '<span>Un accord est effacé du serveur 180 jours après sa dernière activité. Téléchargez le PDF pour garder une copie.</span></li>' +
      '<li>' + ICO.alerte + '<span>Ne mettez ni adresse exacte, ni numéro de pièce d\'identité, ni données bancaires dans un accord.</span></li></ul></section>';
    h += '<section class="carte"><h2>À propos</h2><p>AccordAI, version ' + VERSION + ' · une application <a href="../../boutique/">Teranga Outils</a>.</p><p class="petit">Bibliothèque libre incluse : jsPDF (licence MIT). <a href="vendor/LISEZMOI.txt">Détails et licences</a>.</p></section>';
    vue(h);
  }
  function activerNotifs() {
    if (!('Notification' in window)) { toast('Notifications non disponibles sur ce navigateur.'); return; }
    if (S.reglages.notifs && Notification.permission === 'granted') {
      S.reglages.notifs = false; kv('reglages', S.reglages).catch(function () {}); toast('Rappels en notification désactivés.'); if (location.hash === '#/plus') vuePlus(); return;
    }
    Promise.resolve(Notification.requestPermission()).then(function (p) {
      S.reglages.notifs = p === 'granted';
      kv('reglages', S.reglages).catch(function () {});
      toast(p === 'granted' ? 'Rappels activés.' : 'Notifications refusées : les rappels restent visibles dans l\'application.');
      if (location.hash === '#/plus') vuePlus(); else if (location.hash === '#/' || location.hash === '') vueAccords();
    });
  }
  function sauvegarderLiens() {
    var lignes = ['AccordAI — mes liens d\'accords', 'À garder en lieu sûr : ces liens donnent accès à vos accords.', 'Exporté le ' + AC.dateHeure(new Date().toISOString()), ''];
    S.dossiers.forEach(function (r) {
      lignes.push(r.id + ' — ' + r.titre + ' — vous : ' + (r.role === 'proprio' ? 'créateur' : 'autre partie'));
      lignes.push('Mon lien : ' + AC.lienDossier(r.id, r.jeton));
      if (r.jetonPartie) lignes.push('Lien de l\'autre partie : ' + AC.lienDossier(r.id, r.jetonPartie));
      lignes.push('');
    });
    var blob = new Blob([lignes.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'accordai-liens-' + AC.aujourdhui() + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
  }
  function ouvrirLiens(texte) {
    var msg = $('#l-msg'), btn = $('#l-ouvrir');
    var liens = AC.lireLiensDossier(texte);
    if (!liens.length) { message(msg, 'Aucun lien d\'accord reconnu. Un lien ressemble à …/apps/accord/#d=D-…&t=…', 'erreur'); return; }
    occupe(btn, true, 'Ouverture…');
    var ok = 0, ko = 0;
    liens.reduce(function (p, l) {
      return p.then(function () {
        return api('GET', '/' + l.id + '?t=' + encodeURIComponent(l.t)).then(function (j) {
          var d = j.dossier, r = rec(l.id);
          if (r && r.role === 'proprio' && d.role === 'partie') { r.jetonPartie = l.t; ok++; return enregistrer(r); }
          if (r && r.role === 'proprio' && d.role !== 'proprio') return;
          var n = r || { id: l.id, ajouteLe: new Date().toISOString(), vus: 0 };
          if (r && r.role === 'partie' && d.role === 'proprio') n.jetonPartie = r.jeton;
          n.jeton = l.t; n.role = d.role; n.titre = d.titre; n.donnees = d.donnees || {}; n.statut = d.statut; n.evenements = AC.trier(d.evenements);
          n.creeLe = d.cree_le; n.synchroLe = new Date().toISOString(); n.vus = n.vus || n.evenements.length; n.notifie = n.evenements.length;
          ok++;
          return enregistrer(n);
        }, function () { ko++; });
      });
    }, Promise.resolve()).then(function () {
      occupe(btn, false);
      message(msg, ok + ' accord' + (ok > 1 ? 's' : '') + ' retrouvé' + (ok > 1 ? 's' : '') + (ko ? ', ' + ko + ' lien' + (ko > 1 ? 's' : '') + ' non valable' + (ko > 1 ? 's' : '') + ' (ou pas de connexion)' : '') + '.', ok ? 'ok' : 'erreur');
    });
  }

  // ---------- Événements de l'interface ----------
  function brancher() {
    document.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filtre]');
      if (f) { var v = f.getAttribute('data-filtre'); S.filtre = S.filtre === v && f.closest('.resume') ? 'tous' : v; vueAccords(); return; }
      var b = e.target.closest('[data-action]');
      if (!b || b.tagName === 'SELECT') return;
      var a = b.getAttribute('data-action');
      var m = location.hash.match(/^#\/accord\/(D-[0-9A-Z]{10})/), r = m ? rec(m[1]) : null;
      switch (a) {
        case 'extraire': lireFormNouveau($('#f-nouveau')); extraire(b); break;
        case 'utiliser-calcul': {
          var form = b.closest('form'), pre = form && form.id === 'f-corriger' ? 'c' : 'n';
          var champs = lireChamps(form), t = AC.calculer(champs);
          var inp = $('#' + pre + '-prix_total');
          if (inp && t.totalCalcule != null) { inp.value = AC.fcfa(t.totalCalcule); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); }
          break;
        }
        case 'retirer-photo': lireFormNouveau($('#f-nouveau')); S.brouillon.photos.splice(+b.getAttribute('data-i'), 1); garderBrouillon(); vueNouveau(); break;
        case 'vider':
          if (!confirm('Effacer la conversation, les photos et la fiche ?')) return;
          S.brouillon = brouillonVide(); DB.effacer('kv', 'brouillon').catch(function () {}); vueNouveau(); break;
        case 'copier': copier(b.getAttribute('data-texte')); break;
        case 'partager-lien': {
          var rr = rec((location.hash.match(/D-[0-9A-Z]{10}/) || [])[0]);
          if (rr && navigator.share) navigator.share({ title: 'Accord : ' + rr.titre, text: AC.messagePartage(rr.titre, AC.lienDossier(rr.id, rr.jetonPartie)) }).catch(function () {});
          break;
        }
        case 'actualiser':
          if (r) { occupe(b, true, 'Mise à jour…'); synchroniser(r).then(function () { rendreAccord(r); toast('Accord à jour.'); }, function (err) { occupe(b, false); toast(texteErreur(err)); if (err && err.status === 404) rendreAccord(r); }); }
          break;
        case 'confirmer': if (r) actionConfirmer(r); break;
        case 'note': if (r) actionNote(r); break;
        case 'photo': if (r) actionPhoto(r); break;
        case 'livraison': if (r) actionLivraison(r); break;
        case 'reception': if (r) actionReception(r); break;
        case 'cloture': if (r) actionCloture(r); break;
        case 'accepter': if (r) actionAccepter(r); break;
        case 'pdf': if (r) actionPdf(r, b); break;
        case 'verifier': if (r) actionVerifier(r, b); break;
        case 'oublier':
          if (r && confirm('Retirer cet accord de ce téléphone ? Il reste sur le serveur ; sans son lien, vous ne pourrez plus l\'ouvrir.' + (r.role === 'proprio' ? ' Pensez à sauvegarder vos liens (menu Plus).' : ''))) {
            S.dossiers = S.dossiers.filter(function (x) { return x !== r; });
            DB.effacer('dossiers', r.id).then(function () { return DB.effacerPhotos(r.id); }).catch(function () {}).then(function () { majPastille(); aller('#/'); toast('Accord retiré de ce téléphone.'); });
          }
          break;
        case 'reessayer-lien': route(); break;
        case 'cacher-astuce': S.reglages.astuceIos = true; kv('reglages', S.reglages).catch(function () {}); b.closest('.carte').remove(); break;
        case 'notifs': activerNotifs(); break;
        case 'installer': installer(); break;
        case 'sauvegarder': sauvegarderLiens(); break;
        case 'verifier-pass': occupe(b, true, 'Vérification…'); verifierPass(true).then(function () { toast(passActif() ? 'Pass actif.' : 'Pass non valable.'); vuePass(); }); break;
        case 'retirer-pass':
          if (confirm('Retirer le pass de ce téléphone ? Vous pourrez le réactiver avec le lien de la commande.')) { S.pass = null; DB.effacer('kv', 'pass').catch(function () {}); vuePass(); }
          break;
      }
    });
    document.addEventListener('submit', function (e) {
      var form = e.target, type = form.getAttribute('data-form');
      if (!type) return;
      e.preventDefault();
      if (type === 'nouveau') creer(form);
      else if (type === 'pass') activerPass(form);
      else if (type === 'liens') ouvrirLiens($('#l-liens', form).value);
      else if (type === 'corriger') { var m = location.hash.match(/D-[0-9A-Z]{10}/); var r = m && rec(m[0]); if (r) envoyerCorrection(r, form); }
    });
    document.addEventListener('input', function (e) {
      var el = e.target;
      if (el.id === 'recherche') { S.recherche = el.value; majListe(); return; }
      var form = el.closest('form');
      if (!form) return;
      if (form.id === 'f-nouveau') {
        lireFormNouveau(form);
        if (el.id === 'n-texte') { var i = $('#n-info-texte'); if (i) i.textContent = infoTexte(S.brouillon); }
        if (el.getAttribute('data-c')) { var c1 = $('#n-calcul'), c2 = $('#n-reste'); if (c1) c1.innerHTML = calculHtml(S.brouillon.champs); if (c2) c2.innerHTML = resteHtml(S.brouillon.champs); }
        garderBrouillon();
      } else if (form.id === 'f-corriger') {
        var d = lireChamps($('#c-fiche', form)), k1 = $('#c-calcul'), k2 = $('#c-reste');
        if (k1) k1.innerHTML = calculHtml(d); if (k2) k2.innerHTML = resteHtml(d);
        var m = location.hash.match(/D-[0-9A-Z]{10}/), r = m && rec(m[0]);
        if (r) resumeCorrection(r, form);
      }
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el.id === 'n-fichier' && el.files && el.files[0]) { lireFormNouveau($('#f-nouveau')); importerConversation(el.files[0]); el.value = ''; }
      else if (el.id === 'n-photos' && el.files && el.files.length) { lireFormNouveau($('#f-nouveau')); ajouterPhotos(el.files); el.value = ''; }
      else if (el.id === 'l-fichier' && el.files && el.files[0]) { el.files[0].text().then(function (t) { $('#l-liens').value = t; ouvrirLiens(t); }); el.value = ''; }
      else if (el.id === 'theme') {
        try { if (el.value) localStorage.setItem('accordai-theme', el.value); else localStorage.removeItem('accordai-theme'); } catch (x) { /* stockage bloqué */ }
        if (el.value) document.documentElement.setAttribute('data-theme', el.value); else document.documentElement.removeAttribute('data-theme');
      } else if (el.name === 'createur' || el.id === 'n-joindre') { lireFormNouveau($('#f-nouveau')); garderBrouillon(); }
    });
    // Mise en forme des montants et date limite déduite du délai, à la sortie du champ
    document.addEventListener('focusout', function (e) {
      var el = e.target;
      if (!el.getAttribute || !el.getAttribute('data-c')) return;
      var form = el.closest('form'), pre = form && form.id === 'f-corriger' ? 'c' : 'n';
      if (el.getAttribute('data-montant') && el.value.trim()) { var v = montant(el.value); if (v !== el.value) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } }
      if (el.getAttribute('data-c') === 'delai' && el.value.trim()) {
        var dd = $('#' + pre + '-delai_date');
        var trouve = AC.dateDansTexte(el.value);
        if (dd && !dd.value && trouve) { dd.value = trouve; dd.dispatchEvent(new Event('input', { bubbles: true })); toast('Date limite : ' + AC.dateFr(trouve) + ' (vérifiez).'); }
      }
    });
    $('#retour').addEventListener('click', function () {
      var m = location.hash.match(/^#\/accord\/(D-[0-9A-Z]{10})\/(partager|corriger|modifier)/);
      aller(m ? '#/accord/' + m[1] : '#/');
    });
    $('#installer').addEventListener('click', installer);
    window.addEventListener('hashchange', route);
    window.addEventListener('online', function () { toast('Connexion retrouvée.'); verifierPass(); if (location.hash === '#/' || !location.hash) rafraichirTout(true); });
    window.addEventListener('offline', function () { toast('Hors ligne : vos accords restent lisibles.'); });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; majInstall(); });
    window.addEventListener('appinstalled', function () { invite = null; majInstall(); toast('AccordAI est installée.'); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && (location.hash === '#/' || !location.hash)) rafraichirTout(); });
  }
  function copier(texte) {
    var fini = function () { toast('Lien copié.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texte).then(fini, function () { copierAncien(texte); fini(); });
    else { copierAncien(texte); fini(); }
  }
  function copierAncien(texte) {
    var t = document.createElement('textarea'); t.value = texte; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) { /* rien */ } t.remove();
  }
  function majInstall() { $('#installer').hidden = !invite || estInstallee(); }
  function installer() {
    if (!invite) { aller('#/plus'); return; }
    invite.prompt();
    Promise.resolve(invite.userChoice).then(function () { invite = null; majInstall(); });
  }
  function serviceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      var proposer = function () {
        var el = $('#toast');
        el.innerHTML = 'Nouvelle version disponible. <button type="button" class="lien-btn" style="color:inherit" id="maj-app">Mettre à jour</button>';
        el.hidden = false;
        $('#maj-app').addEventListener('click', function () { if (reg.waiting) { majDemandee = true; reg.waiting.postMessage('maj'); } });
      };
      if (reg.waiting && navigator.serviceWorker.controller) proposer();
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        if (w) w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) proposer(); });
      });
    }).catch(function () { /* hors ligne ou navigateur ancien */ });
    var majDemandee = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (majDemandee) { majDemandee = false; location.reload(); } });
  }

  function demarrer() {
    vueEl = $('#vue');
    brancher();
    Promise.all([DB.tout('dossiers'), DB.lire('kv', 'pass'), DB.lire('kv', 'compteur'), DB.lire('kv', 'reglages'), DB.lire('kv', 'rappels'), DB.lire('kv', 'brouillon')]).then(function (x) {
      S.dossiers = x[0] || []; S.pass = x[1] || null; S.compteur = x[2] || null; S.reglages = x[3] || {}; S.rappels = x[4] || {};
      S.brouillon = x[5] ? Object.assign(brouillonVide(), x[5]) : brouillonVide();
      majPastille(); majInstall();
      route();
      verifierPass();
    }).catch(function (e) {
      vue('<section class="carte alerte"><h1>Stockage indisponible</h1><p>' + esc(texteErreur(e)) + '</p><p>Sur iPhone, quittez la navigation privée. Sinon, mettez à jour votre navigateur.</p></section>');
    });
    serviceWorker();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
