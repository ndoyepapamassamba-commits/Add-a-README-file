/* Carnet du Tailleur — interface (pages, formulaires, mesures guidées, commandes, planning, caisse, pass, sauvegarde).
   Tout reste sur le téléphone ; seule la vérification du pass passe par Internet, une fois. */
(function () {
  'use strict';
  var VERSION = '1.0.0';
  var S = {
    clients: [], releves: [], commandes: [], atelier: {}, reglages: { capacite: 10, fetes: null },
    compteurs: { commande: {}, recu: {} }, passes: [], pass: CT.etatPass([]), sauvegardeLe: null, accueilFait: false,
    fermes: {}, saisie: null, photos: {}, route: ''
  };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function auj() { return CT.dateISO(); }
  var F = function (n) { return CT.f(n); };
  function pluriel(n, mot, pl) { return CT.formatNombre(n) + ' ' + (n > 1 ? (pl || mot + 's') : mot); }

  function ico(d, cls) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"' + (cls ? ' class="' + cls + '"' : '') + '>' + d + '</svg>'; }
  var ICO = {
    plus: ico('<path d="M12 5v14M5 12h14"/>'),
    client: ico('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7"/>'),
    ruban: ico('<path d="M3 16V9a4.5 4.5 0 0 1 9 0v6"/><rect x="3" y="15" width="18" height="5" rx="1"/><path d="M7 15v2.5M10 15v1.5M13 15v2.5M16 15v1.5M19 15v2.5"/><circle cx="7.5" cy="9" r="1.5"/>'),
    habit: ico('<path d="M8 3 4 6l2 3 2-1v13h8V8l2 1 2-3-4-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z"/>'),
    wa: ico('<path d="M4 20l1.3-4A8 8 0 1 1 8.4 19z"/><path d="M9.5 9.2c.2 1.9 2.4 4.3 4.6 4.8l1-1.1 1.6.8c-.2 1-1 1.6-2 1.6-3 0-6.4-3.4-6.4-6.4 0-1 .6-1.8 1.6-2l.8 1.6z"/>'),
    tel: ico('<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2"/>'),
    pdf: ico('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    ok: ico('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    alerte: ico('<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5v.5"/>'),
    info: ico('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
    chevron: ico('<path d="M9 6l6 6-6 6"/>', 'chevron'),
    photo: ico('<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>'),
    crayon: ico('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    poubelle: ico('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    calendrier: ico('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    caisse: ico('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'),
    etoile: ico('<path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z"/>', 'ico'),
    sauvegarde: ico('<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/>', 'ico'),
    aide: ico('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.5v.5"/>', 'ico'),
    atelier: ico('<path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-6h6v6"/>', 'ico'),
    fete: ico('<path d="M4 20 9 7l8 8z"/><path d="M14 4l1 2M19 6l-2 1M20 11l-2-.5M11 3.5l.3 2"/>', 'ico'),
    ciseaux: ico('<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.5 8.5 20 18M8.5 15.5 20 6"/>'),
    installer: ico('<path d="M12 3v11m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="4" rx="1"/>', 'ico'),
    fermer: ico('<path d="M6 6l12 12M18 6 6 18"/>'),
    loupe: ico('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
    historique: ico('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
    soleil: ico('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>', 'ico'),
    bouclier: ico('<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="M9 12l2 2 4-4"/>', 'ico'),
    caisseMenu: ico('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>', 'ico')
  };

  // ---------- Données ----------
  function charger() {
    return Promise.all([DB.tout('clients'), DB.tout('releves'), DB.tout('commandes'), DB.lire('atelier'), DB.lire('reglages'),
      DB.lire('compteurs'), DB.lire('passes'), DB.lire('sauvegardeLe'), DB.lire('accueilFait')]).then(function (r) {
      S.clients = r[0] || []; S.releves = r[1] || []; S.commandes = r[2] || [];
      S.atelier = r[3] || {}; S.reglages = Object.assign({ capacite: 10, fetes: null }, r[4] || {});
      S.compteurs = r[5] || { commande: {}, recu: {} }; S.compteurs.commande = S.compteurs.commande || {}; S.compteurs.recu = S.compteurs.recu || {};
      S.passes = Array.isArray(r[6]) ? r[6] : []; S.sauvegardeLe = r[7] || null; S.accueilFait = !!r[8];
      majPass();
    });
  }
  function fetes() { return S.reglages.fetes && S.reglages.fetes.length ? S.reglages.fetes : CT.FETES_DEFAUT; }
  function majPass() {
    S.pass = CT.etatPass(S.passes);
    var b = $('#badge-pass');
    if (b) {
      b.textContent = S.pass.actif ? 'Pass actif' : 'Gratuit';
      b.className = 'badge-pass' + (S.pass.actif ? ' actif' : '');
      b.setAttribute('aria-label', S.pass.actif ? 'Pass actif, ' + S.pass.joursRestants + ' jours restants' : 'Version gratuite : voir le pass');
    }
  }
  function client(id) { for (var i = 0; i < S.clients.length; i++) if (S.clients[i].id === id) return S.clients[i]; return null; }
  function commande(id) { for (var i = 0; i < S.commandes.length; i++) if (S.commandes[i].id === id) return S.commandes[i]; return null; }
  function releve(id) { for (var i = 0; i < S.releves.length; i++) if (S.releves[i].id === id) return S.releves[i]; return null; }
  function remplacer(liste, obj) { for (var i = 0; i < liste.length; i++) if (liste[i].id === obj.id) { liste[i] = obj; return; } liste.push(obj); }
  function commandesClient(id) { return S.commandes.filter(function (c) { return c.clientId === id; }); }
  function prochainNumero(type) {
    var an = String(new Date().getFullYear()), seq = (S.compteurs[type][an] || 0) + 1;
    S.compteurs[type][an] = seq;
    return type === 'commande' ? CT.numeroCommande(an, seq) : CT.numeroRecu(an, seq);
  }
  function trierNoms(l) { return l.slice().sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom), 'fr', { sensitivity: 'base' }); }); }
  function initiales(nom) { return String(nom || '?').trim().split(/\s+/).slice(0, 2).map(function (m) { return m.charAt(0).toUpperCase(); }).join('') || '?'; }
  function avatar(c, grand) {
    return '<span class="avatar' + (grand ? ' grand' : '') + '" aria-hidden="true">' + (c && c.photo ? '<img src="' + esc(c.photo) + '" alt="">' : esc(initiales(c && c.nom))) + '</span>';
  }

  // ---------- Cadre, messages, feuilles ----------
  function cadre(o) {
    $('#titre').textContent = o.titre;
    document.title = o.titre === 'Carnet du Tailleur' ? 'Carnet du Tailleur' : o.titre + ' · Carnet du Tailleur';
    var r = $('#retour');
    r.hidden = !o.retour; r.dataset.cible = o.retour || '';
    $$('#nav a').forEach(function (a) { if (a.dataset.nav === o.nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    bandeaux();
  }
  function vue(html) { $('#vue').innerHTML = html; }
  function bandeaux() {
    var b = [], P = S.pass;
    if (DB.temporaire) b.push('<div class="bandeau"><p><b>Attention :</b> ce navigateur ne garde pas les données (navigation privée ?). Elles seront perdues à la fermeture.</p></div>');
    if (P.rappel && !S.fermes.rappel) b.push('<div class="bandeau"><p>Votre pass se termine dans <b>' + pluriel(P.joursRestants, 'jour') + '</b> (le ' + CT.dateFr(P.fin.slice(0, 10)) + ').</p><a class="btn or petit" href="' + esc(CT.urlProduit()) + '">Renouveler</a><button type="button" class="icone-btn" data-action="fermer-bandeau" data-cle="rappel" aria-label="Fermer">' + ICO.fermer + '</button></div>');
    if (P.expire && !S.fermes.expire) b.push('<div class="bandeau"><p>Votre pass a pris fin le ' + CT.dateFr(P.fin.slice(0, 10)) + '. Vos fiches restent consultables et modifiables.</p><a class="btn or petit" href="' + esc(CT.urlProduit()) + '">Renouveler</a><button type="button" class="icone-btn" data-action="fermer-bandeau" data-cle="expire" aria-label="Fermer">' + ICO.fermer + '</button></div>');
    var vieille = !S.sauvegardeLe || Date.now() - Date.parse(S.sauvegardeLe) > 30 * CT.JOUR;
    if (S.clients.length >= 5 && vieille && !S.fermes.sauvegarde && S.route.indexOf('#/sauvegarde') !== 0)
      b.push('<div class="bandeau info"><p>Pensez à faire une sauvegarde de vos fiches (en cas de perte du téléphone).</p><a class="btn petit" href="#/sauvegarde">Sauvegarder</a><button type="button" class="icone-btn" data-action="fermer-bandeau" data-cle="sauvegarde" aria-label="Fermer">' + ICO.fermer + '</button></div>');
    $('#bandeaux').innerHTML = b.join('');
  }
  var minuterieToast = null;
  function toast(msg, action) {
    var t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action.label) + '</button>' : '');
    t.hidden = false;
    if (action) t.querySelector('button').onclick = function () { cacherToast(); action.fn(); };
    clearTimeout(minuterieToast);
    minuterieToast = setTimeout(cacherToast, action ? 9000 : 3500);
  }
  function cacherToast() { var t = $('#toast'); t.hidden = true; t.innerHTML = ''; }
  var focusAvant = null;
  function feuille(titre, corps, apres) {
    var f = $('#feuille');
    focusAvant = document.activeElement;
    f.innerHTML = '<div class="feuille" role="dialog" aria-modal="true" aria-labelledby="feuille-titre"><div class="feuille-tete"><h2 id="feuille-titre">' + esc(titre) +
      '</h2><button type="button" class="icone-btn" data-fermer aria-label="Fermer">' + ICO.fermer + '</button></div>' + corps + '</div>';
    f.hidden = false;
    var premier = f.querySelector('.feuille input:not([type=hidden]), .feuille select, .feuille textarea') || f.querySelector('.feuille .btn, .feuille a[href]') || f.querySelector('[data-fermer]');
    if (premier) premier.focus();
    if (apres) apres(f.querySelector('.feuille'));
  }
  function fermerFeuille(silence) {
    var f = $('#feuille');
    if (f.hidden) return;
    f.hidden = true; f.innerHTML = '';
    if (!silence && focusAvant && document.body.contains(focusAvant)) try { focusAvant.focus(); } catch (e) {}
  }
  function confirmer(titre, texte, oui, fn, danger) {
    feuille(titre, '<p>' + texte + '</p><div class="boutons"><button type="button" class="btn ' + (danger ? 'danger' : '') + '" data-oui>' + esc(oui) +
      '</button><button type="button" class="btn sec" data-fermer>Annuler</button></div>', function (el) {
      el.querySelector('[data-oui]').onclick = function () { fermerFeuille(true); fn(); };
    });
  }
  function alerte(type, html) { return '<div class="alerte ' + type + '">' + (type === 'ok' ? ICO.ok : type === 'info' ? ICO.info : ICO.alerte) + '<div>' + html + '</div></div>'; }
  function aller(h) { if (location.hash === h) router(); else location.hash = h; }

  // ---------- Champs ----------
  function champ(etiquette, id, valeur, o) {
    o = o || {};
    var attrs = ' id="' + id + '" name="' + (o.nom || id) + '"' + (o.requis ? ' required' : '') + (o.mode ? ' inputmode="' + o.mode + '"' : '') +
      (o.place ? ' placeholder="' + esc(o.place) + '"' : '') + (o.auto ? ' autocomplete="' + o.auto + '"' : ' autocomplete="off"') + (o.data || '');
    var input;
    if (o.zone) input = '<textarea' + attrs + ' rows="' + (o.lignes || 3) + '">' + esc(valeur) + '</textarea>';
    else if (o.options) input = '<select' + attrs + '>' + o.options.map(function (x) {
      var v = typeof x === 'string' ? x : x[0], t = typeof x === 'string' ? x : x[1];
      return '<option value="' + esc(v) + '"' + (String(valeur) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('') + '</select>';
    else input = '<input type="' + (o.type || 'text') + '"' + attrs + ' value="' + esc(valeur) + '">';
    if (o.suffixe) input = '<div class="suffixe">' + input + '<span>' + esc(o.suffixe) + '</span></div>';
    return '<div class="champ" id="champ-' + id + '"><label for="' + id + '">' + esc(etiquette) + '</label>' + input + (o.aide ? '<small>' + o.aide + '</small>' : '') + '<div class="erreur" id="err-' + id + '" hidden></div></div>';
  }
  function choix(nom, valeur, options, etiquette) {
    return '<fieldset class="champ" style="border:0;padding:0;margin:0 0 14px"><legend class="etiquette" style="padding:0">' + esc(etiquette) + '</legend><div class="choix">' + options.map(function (o) {
      return '<label><input type="radio" name="' + nom + '" value="' + esc(o[0]) + '"' + (String(valeur) === String(o[0]) ? ' checked' : '') + '><span>' + esc(o[1]) + '</span></label>';
    }).join('') + '</div></fieldset>';
  }
  function montantChamp(etiquette, id, valeur, o) {
    o = o || {};
    return champ(etiquette, id, valeur ? CT.formatNombre(valeur) : '', { mode: 'numeric', suffixe: 'F', place: o.place || '0', requis: o.requis, aide: o.aide, data: ' data-montant' });
  }
  function erreur(id, msg) {
    var e = $('#err-' + id), c = $('#champ-' + id);
    if (e) { e.textContent = msg; e.hidden = false; }
    if (c) c.classList.add('champ-erreur');
    var i = $('#' + id); if (i) i.focus();
    return false;
  }
  function effacerErreurs(form) { $$('.erreur', form).forEach(function (e) { e.hidden = true; }); $$('.champ-erreur', form).forEach(function (c) { c.classList.remove('champ-erreur'); }); }
  function val(form, nom) { var el = form.elements[nom]; if (!el) return ''; if (el.length && !el.tagName) { for (var i = 0; i < el.length; i++) if (el[i].checked) return el[i].value; return ''; } return String(el.value || '').trim(); }

  // Photo réduite dans le téléphone (JPEG)
  function lireImage(fichier, max, qualite) {
    return new Promise(function (ok, ko) {
      if (!fichier || !/^image\//.test(fichier.type || '')) return ko(new Error('Choisissez une photo.'));
      var url = URL.createObjectURL(fichier), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', qualite || 0.72));
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('Cette photo ne peut pas être lue.')); };
      img.src = url;
    });
  }
  function zonePhoto(cle, etiquette, src) {
    return '<div class="champ"><span class="etiquette">' + esc(etiquette) + '</span><div class="photo-zone"><div class="photo-apercu" id="apercu-' + cle + '">' +
      (src ? '<img src="' + esc(src) + '" alt="">' : ICO.photo) + '</div><div style="display:flex;flex-direction:column;gap:8px">' +
      '<span class="btn doux petit btn-fichier">' + ICO.photo + '<span>' + (src ? 'Changer' : 'Prendre ou choisir') + '</span><input type="file" accept="image/*" data-photo="' + cle + '" id="f-' + cle + '" aria-label="' + esc(etiquette) + '"></span>' +
      (src ? '<button type="button" class="lien-action" data-action="retirer-photo" data-cle="' + cle + '">Retirer la photo</button>' : '') + '</div></div></div>';
  }

  // ---------- Routeur ----------
  var ROUTES = [
    [/^#\/?$/, vueAccueil],
    [/^#\/clients$/, vueClients],
    [/^#\/client\/([\w-]+)$/, vueClient],
    [/^#\/client-modifier\/([\w-]+)$/, vueClientForm],
    [/^#\/mesures\/([\w-]+)\/guidees$/, vueAssistant],
    [/^#\/mesures\/([\w-]+)\/rapide$/, function (id) { vueReleveForm(null, id); }],
    [/^#\/mesures\/([\w-]+)\/historique$/, vueHistorique],
    [/^#\/releve\/([\w-]+)$/, function (id) { vueReleveForm(id); }],
    [/^#\/commandes$/, vueCommandes],
    [/^#\/commande\/([\w-]+)$/, vueCommande],
    [/^#\/commande-modifier\/([\w-]+)$/, vueCommandeForm],
    [/^#\/planning$/, vuePlanning],
    [/^#\/caisse$/, vueCaisse],
    [/^#\/reglages$/, vueReglages],
    [/^#\/atelier$/, vueAtelier],
    [/^#\/fetes$/, vueFetes],
    [/^#\/sauvegarde$/, vueSauvegarde],
    [/^#\/pass$/, vuePass],
    [/^#\/aide$/, vueAide]
  ];
  function router() {
    var h = location.hash || '#/', parts = h.split('?'), chemin = parts[0], q = new URLSearchParams(parts[1] || '');
    var nouvelle = chemin !== S.route.split('?')[0];
    S.route = h;
    fermerFeuille(true);
    for (var i = 0; i < ROUTES.length; i++) {
      var m = chemin.match(ROUTES[i][0]);
      if (m) {
        ROUTES[i][1](m[1], q);
        if (nouvelle) { window.scrollTo(0, 0); try { $('#vue').focus({ preventScroll: true }); } catch (e) {} }
        if (S.apresRoute) { var fn = S.apresRoute; S.apresRoute = null; fn(); }
        return;
      }
    }
    location.replace('#/');
  }

  // ---------- Accueil ----------
  function vueAccueil() {
    cadre({ titre: 'Carnet du Tailleur', nav: 'accueil' });
    if (!S.accueilFait && !S.clients.length) return vueBienvenue();
    var A = auj(), h = '';
    h += '<div class="salut"><h1>' + esc(S.atelier.nom || 'Mon atelier') + '</h1><p class="discret">' + esc(CT.dateLongue(A)) + '</p></div>';
    // alertes avant les fêtes
    CT.alertesFetes(S.commandes, fetes(), S.reglages.capacite, A, 60).forEach(function (a) { if (a.aFaire > 0) h += carteFete(a); });
    // chiffres
    var lundi = CT.debutSemaine(A), dim = CT.ajouterJours(lundi, 6), semaine = 0;
    S.commandes.forEach(function (c) { if (c.statut !== 'livre' && c.dateLivraison >= lundi && c.dateLivraison <= dim) semaine += CT.pieces(c); });
    var mois = CT.resumeMois(S.commandes, CT.cleMois(A)), reste = CT.resteAEncaisser(S.commandes);
    h += '<div class="kpis">' +
      '<a class="kpi fort" href="#/caisse" id="kpi-jour"><small>Encaissé aujourd\'hui</small><strong class="nb">' + F(CT.encaisseJour(S.commandes, A)) + '</strong><span>Voir la caisse</span></a>' +
      '<a class="kpi" href="#/caisse" id="kpi-mois"><small>Encaissé ce mois</small><strong class="nb">' + F(mois.encaisse) + '</strong><span>' + pluriel(mois.paiements, 'paiement') + '</span></a>' +
      '<a class="kpi" href="#/planning" id="kpi-semaine"><small>À livrer cette semaine</small><strong class="nb">' + pluriel(semaine, 'habit') + '</strong><span>Voir le planning</span></a>' +
      '<a class="kpi' + (reste > 0 ? ' rouge' : '') + '" href="#/commandes?f=impayes" id="kpi-reste"><small>Reste à encaisser</small><strong class="nb">' + F(reste) + '</strong><span>Toutes commandes</span></a></div>';
    h += '<div class="grille-actions">' +
      '<a class="action-tuile principale" href="#/commande-modifier/nouveau">' + ICO.habit + 'Nouvelle commande</a>' +
      '<button type="button" class="action-tuile" data-action="choisir-client-mesures">' + ICO.ruban + 'Prendre des mesures</button>' +
      '<a class="action-tuile" href="#/client-modifier/nouveau">' + ICO.client + 'Nouveau client</a>' +
      '<a class="action-tuile" href="#/caisse">' + ICO.caisse + 'Caisse du jour</a></div>';
    h += '<h2 class="section-titre">À faire</h2>' + aFaire(A);
    if (!S.pass.actif) h += '<p class="pied-app"><a href="#/pass" id="quota">Version gratuite : ' + S.clients.length + ' / ' + CT.LIMITE_CLIENTS + ' clients</a></p>';
    vue(h);
  }
  function carteFete(a) {
    var fe = a.fete, quand = a.jours === 0 ? 'aujourd\'hui' : 'dans ' + pluriel(a.jours, 'jour');
    if (!a.aFaire) return '<div class="carte-fete" data-fete="' + esc(fe.cle) + '" data-niveau="vide">' + alerte('info', '<p><b>' + esc(fe.nom) + ' ' + quand + '</b> (≈ ' + esc(CT.dateLongue(fe.date)) +
      '). Aucun habit à finir pour cette date pour l\'instant ; capacité d\'ici là ≈ ' + pluriel(a.capacite, 'habit') + '.</p>') + '</div>';
    var type = a.niveau === 'surcharge' ? 'danger' : a.niveau === 'serre' ? 'attention' : 'ok';
    var pct = a.capacite > 0 ? Math.min(100, Math.round(a.aFaire * 100 / a.capacite)) : (a.aFaire ? 100 : 0);
    var texte = '<p><b>' + esc(fe.nom) + ' ' + quand + '</b> (≈ ' + esc(CT.dateLongue(fe.date)) + ')</p>' +
      '<p>' + pluriel(a.aFaire, 'habit') + ' à finir avant la fête · capacité d\'ici là ≈ ' + pluriel(a.capacite, 'habit') + '.</p>' +
      '<div class="jauge ' + a.niveau + '" role="img" aria-label="Charge : ' + pct + ' %"><span style="width:' + pct + '%"></span></div>';
    if (a.niveau === 'surcharge') texte += '<p><b>Surcharge :</b> refusez ou décalez les nouvelles commandes, ou prévoyez de l\'aide. <a href="#/planning">Voir le planning</a></p>';
    else if (a.niveau === 'serre') texte += '<p>C\'est serré : acceptez peu de nouvelles commandes pour cette date. <a href="#/planning">Voir le planning</a></p>';
    else texte += '<p class="petit discret">Votre charge est tenable. Capacité réglable dans <a href="#/atelier">Mon atelier</a>.</p>';
    return '<div class="carte-fete" data-fete="' + esc(fe.cle) + '" data-niveau="' + a.niveau + '">' + alerte(type, texte) + '</div>';
  }
  function aFaire(A) {
    var dem = CT.ajouterJours(A, 1), lignes = [];
    var tri = function (a, b) { return (a.dateLivraison || '') < (b.dateLivraison || '') ? -1 : 1; };
    S.commandes.filter(function (c) { return CT.etatCommande(c, A) === 'retard'; }).sort(tri).forEach(function (c) {
      lignes.push(ligneAFaire(c, 'En retard de ' + pluriel(CT.joursEntre(c.dateLivraison, A), 'jour') + ' (livraison ' + CT.dateCourte(c.dateLivraison) + ')', 'retard', null));
    });
    S.commandes.filter(function (c) { return c.statut === 'pret'; }).sort(tri).forEach(function (c) {
      var cl = client(c.clientId);
      lignes.push(ligneAFaire(c, 'Prêt à remettre' + (c.prevenuLe ? ' · prévenu le ' + CT.dateFr(c.prevenuLe) : ''), 'pret',
        { href: CT.lienWhatsApp(cl && cl.telephone, CT.messagePret(c, cl, S.atelier)), label: c.prevenuLe ? 'Relancer' : 'Prévenir', action: 'prevenu' }));
    });
    S.commandes.filter(function (c) { return !CT.estFinie(c) && c.dateEssayage && (c.dateEssayage === A || c.dateEssayage === dem); }).forEach(function (c) {
      var cl = client(c.clientId);
      lignes.push(ligneAFaire(c, 'Essayage ' + (c.dateEssayage === A ? 'aujourd\'hui' : 'demain'), 'essayage',
        { href: CT.lienWhatsApp(cl && cl.telephone, CT.messageEssayage(c, cl, S.atelier)), label: 'Rappeler', action: 'rappel-essayage' }));
    });
    S.commandes.filter(function (c) { return !CT.estFinie(c) && (c.dateLivraison === A || c.dateLivraison === dem); }).forEach(function (c) {
      lignes.push(ligneAFaire(c, 'À livrer ' + (c.dateLivraison === A ? 'aujourd\'hui' : 'demain') + ' : pas encore prêt (' + CT.nomStatut(c.statut).toLowerCase() + ')', 'essayage', null));
    });
    if (!lignes.length) return '<div class="carte vide" id="a-faire">' + ICO.ok + '<p>Rien d\'urgent aujourd\'hui.</p><p class="petit">Les essayages, habits prêts et retards s\'affichent ici.</p></div>';
    return '<div class="carte" id="a-faire" style="padding:4px 14px"><ul class="liste">' + lignes.join('') + '</ul></div>';
  }
  function ligneAFaire(c, texte, type, wa) {
    var cl = client(c.clientId);
    return '<li><div class="ligne"><a class="ligne-corps" href="#/commande/' + esc(c.id) + '" style="text-decoration:none;color:inherit"><strong>' + esc(cl ? cl.nom : 'Client') + '</strong><small>' +
      esc(CT.texteHabit(c)) + '</small><small><span class="badge ' + type + '">' + esc(texte) + '</span></small></a>' +
      (wa ? '<a class="btn wa petit" target="_blank" rel="noopener" href="' + esc(wa.href) + '" data-action="' + wa.action + '" data-id="' + esc(c.id) + '">' + ICO.wa + '<span>' + esc(wa.label) + '</span></a>' : ICO.chevron) + '</div></li>';
  }
  function vueBienvenue() {
    vue('<section class="carte bienvenue"><div class="dessin">' + CTFig.dessin('poitrine', 'homme', 'Mètre ruban autour de la poitrine') + '</div>' +
      '<h1>Bienvenue dans votre Carnet du Tailleur</h1><p>Clients, mesures, commandes, acomptes et livraisons : tout votre atelier dans le téléphone, même sans Internet.</p>' +
      '<form data-form="bienvenue" novalidate>' + champ('Nom de votre atelier', 'b-nom', '', { place: 'Ex. : Atelier Ndiaye Couture', auto: 'organization' }) +
      champ('Votre téléphone (facultatif)', 'b-tel', '', { type: 'tel', mode: 'tel', auto: 'tel', aide: 'Il apparaît sur les reçus et les messages à vos clients.' }) +
      '<button type="submit" class="btn large">Commencer</button></form>' +
      '<p class="petit discret">Vos fiches restent sur ce téléphone. Rien n\'est envoyé sur Internet.</p></section>');
  }

  // ---------- Clients ----------
  function vueClients(_, q) {
    cadre({ titre: 'Clients', nav: 'clients' });
    var h = '<div class="carte-titre"><h1 style="margin:0">Clients <span class="discret">(' + S.clients.length + ')</span></h1><a class="btn petit" href="#/client-modifier/nouveau" id="btn-nouveau-client">' + ICO.plus + 'Nouveau</a></div>';
    if (!S.pass.actif) h += '<p class="petit discret">Version gratuite : ' + S.clients.length + ' / ' + CT.LIMITE_CLIENTS + ' clients. <a href="#/pass">Clients illimités avec le pass</a></p>';
    if (!S.clients.length) {
      h += '<div class="carte vide">' + ICO.client + '<p>Aucun client pour l\'instant.</p><a class="btn" href="#/client-modifier/nouveau">' + ICO.plus + 'Ajouter mon premier client</a></div>';
      return vue(h);
    }
    h += '<div class="recherche">' + ICO.loupe + '<input type="search" id="q-clients" placeholder="Chercher un nom ou un numéro" aria-label="Chercher un client" value="' + esc(q.get('q') || '') + '"></div>';
    h += '<div class="carte" style="padding:4px 14px"><ul class="liste" id="liste-clients"></ul></div>';
    vue(h);
    var lister = function () {
      var t = CT.sansAccents($('#q-clients').value), tc = t.replace(/\D/g, '');
      var l = trierNoms(S.clients).filter(function (c) { return !t || CT.sansAccents(c.nom).indexOf(t) >= 0 || (tc.length >= 3 && String(c.telephone || '').replace(/\D/g, '').indexOf(tc) >= 0); });
      $('#liste-clients').innerHTML = l.length ? l.map(ligneClient).join('') : '<li class="vide">Aucun client trouvé.</li>';
    };
    $('#q-clients').addEventListener('input', lister);
    lister();
  }
  function ligneClient(c) {
    var cmds = commandesClient(c.id), enCours = cmds.filter(function (x) { return x.statut !== 'livre'; }).length;
    var prets = cmds.filter(function (x) { return x.statut === 'pret'; }).length;
    var sous = [];
    if (c.telephone) sous.push(c.telephone);
    sous.push(enCours ? pluriel(enCours, 'commande') + ' en cours' : 'Aucune commande en cours');
    return '<li><a class="ligne" href="#/client/' + esc(c.id) + '">' + avatar(c) + '<span class="ligne-corps"><strong>' + esc(c.nom) + '</strong><small>' + esc(sous.join(' · ')) + '</small></span>' +
      (prets ? '<span class="badge pret">Prêt</span>' : '') + ICO.chevron + '</a></li>';
  }
  function vueClientForm(id) {
    var nouveau = id === 'nouveau', c = nouveau ? { genre: 'homme' } : client(id);
    if (!c) return location.replace('#/clients');
    if (nouveau && !CT.peutAjouterClient(S.clients.length, S.pass.actif)) {
      history.replaceState(null, '', '#/clients'); S.route = '#/clients';
      vueClients(null, new URLSearchParams());
      return offreLimite();
    }
    cadre({ titre: nouveau ? 'Nouveau client' : 'Modifier le client', retour: nouveau ? '#/clients' : '#/client/' + id, nav: 'clients' });
    S.photos = { client: c.photo || null };
    vue('<form class="carte" data-form="client" data-id="' + esc(id) + '" novalidate>' +
      champ('Nom et prénom', 'c-nom', c.nom || '', { requis: true, auto: 'off', place: 'Ex. : Awa Diop' }) +
      champ('Téléphone (facultatif)', 'c-tel', c.telephone || '', { type: 'tel', mode: 'tel', place: 'Ex. : 77 123 45 67', aide: 'Pour le prévenir sur WhatsApp en un geste.' }) +
      choix('genre', c.genre || 'homme', [['homme', 'Homme'], ['femme', 'Femme'], ['enfant', 'Enfant']], 'Mesures habituelles') +
      zonePhoto('client', 'Photo (facultatif)', S.photos.client) +
      champ('Note (facultatif)', 'c-note', c.note || '', { zone: true, lignes: 2, place: 'Ex. : aime les manches larges, préfère le col rond' }) +
      '<p class="petit discret">' + ICO.bouclier.replace('class="ico"', 'style="width:18px;height:18px;vertical-align:-4px"') + ' Le numéro et la photo restent uniquement sur ce téléphone.</p>' +
      '<button type="submit" class="btn large">' + (nouveau ? 'Enregistrer le client' : 'Enregistrer') + '</button>' +
      (!nouveau ? '<div class="boutons"><button type="button" class="btn danger" data-action="client-suppr" data-id="' + esc(id) + '">' + ICO.poubelle + 'Supprimer ce client</button></div>' : '') + '</form>');
  }
  function offreLimite() {
    feuille('Version gratuite : ' + CT.LIMITE_CLIENTS + ' clients', '<p>Vous avez atteint <b>' + CT.LIMITE_CLIENTS + ' clients</b>, la limite de la version gratuite. Vos clients, mesures et commandes restent tous utilisables.</p>' +
      '<p>Le <b>pass 12 mois</b> (' + F(CT.PASS.prix) + ') permet d\'ajouter des clients sans limite.</p>' +
      '<div class="boutons"><a class="btn or" href="#/pass" data-fermer-nav>' + ICO.etoile + 'Voir le pass</a><button type="button" class="btn sec" data-fermer>Plus tard</button></div>');
  }
  function vueClient(id) {
    var c = client(id);
    if (!c) return location.replace('#/clients');
    cadre({ titre: c.nom, retour: '#/clients', nav: 'clients' });
    var rel = CT.relevesClient(S.releves, id), dernier = rel[0], prec = rel[1];
    var h = '<section class="carte"><div class="fiche-tete">' + avatar(c, true) + '<div><h1>' + esc(c.nom) + '</h1><p class="discret">' +
      esc(CT.MODELES[c.genre] ? CT.MODELES[c.genre].nom : '') + (c.telephone ? ' · ' + esc(c.telephone) : '') + '</p></div></div>';
    if (c.telephone) h += '<div class="contacts"><a class="btn sec" href="tel:' + esc(String(c.telephone).replace(/[^\d+]/g, '')) + '">' + ICO.tel + 'Appeler</a>' +
      '<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/' + esc(CT.telWhatsApp(c.telephone)) + '">' + ICO.wa + 'WhatsApp</a></div>';
    if (c.note) h += '<p class="petit" style="margin-top:12px">' + esc(c.note) + '</p>';
    h += '<div class="boutons"><a class="btn doux petit" href="#/client-modifier/' + esc(id) + '">' + ICO.crayon + 'Modifier la fiche</a></div></section>';
    // mesures
    h += '<section class="carte" id="carte-mesures"><div class="carte-titre"><h2>' + ICO.ruban.replace('<svg', '<svg style="width:22px;height:22px;vertical-align:-4px;margin-right:6px"') + 'Mesures</h2>' +
      (dernier ? '<span class="discret petit">du ' + CT.dateFr(dernier.date) + '</span>' : '') + '</div>';
    if (dernier) {
      h += grilleMesures(dernier, prec);
      if (dernier.note) h += '<p class="petit discret">Note : ' + esc(dernier.note) + '</p>';
      h += '<div class="boutons"><a class="btn" href="#/mesures/' + esc(id) + '/guidees">' + ICO.ruban + 'Nouvelles mesures</a><a class="btn sec" href="#/releve/' + esc(dernier.id) + '">' + ICO.crayon + 'Corriger</a></div>' +
        '<div class="boutons"><a class="btn doux petit" href="#/mesures/' + esc(id) + '/historique">' + ICO.historique + 'Historique (' + rel.length + ')</a>' +
        '<button type="button" class="btn doux petit" data-action="fiche-pdf" data-id="' + esc(dernier.id) + '">' + ICO.pdf + 'Fiche PDF</button></div>';
    } else {
      h += '<p>Aucune mesure pour l\'instant. L\'assistant vous montre, avec un dessin, où placer le mètre ruban pour chaque mesure.</p>' +
        '<a class="btn large" href="#/mesures/' + esc(id) + '/guidees">' + ICO.ruban + 'Prendre les mesures pas à pas</a><div class="boutons"><a class="btn sec" href="#/mesures/' + esc(id) + '/rapide">Saisie rapide sur une page</a></div>';
    }
    h += '</section>';
    // commandes
    var cmds = commandesClient(id).sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : 1; });
    h += '<section class="carte" style="padding-bottom:6px"><div class="carte-titre"><h2>Commandes</h2><a class="btn petit" href="#/commande-modifier/nouveau?client=' + esc(id) + '">' + ICO.plus + 'Nouvelle</a></div>';
    h += cmds.length ? '<ul class="liste">' + cmds.map(function (x) { return '<li>' + ligneCommande(x, true) + '</li>'; }).join('') + '</ul>' : '<p class="discret">Aucune commande.</p>';
    h += '</section>';
    vue(h);
  }
  function grilleMesures(r, prec) {
    var d = CT.ecarts(r, prec);
    var h = '<div class="mesures">' + CT.clesReleve(r).map(function (k) {
      var e = d[k];
      return '<div class="mesure"><small>' + esc(CT.MESURES[k].nom) + '</small><strong>' + CT.formatCm(r.valeurs[k]) + '</strong> cm' +
        (e ? '<em class="' + (e > 0 ? 'plus' : 'moins') + '" title="Par rapport aux mesures précédentes">' + (e > 0 ? '+' : '−') + CT.formatCm(Math.abs(e)) + '</em>' : '') + '</div>';
    }).join('');
    (r.libres || []).forEach(function (m) { if (m && m.nom) h += '<div class="mesure"><small>' + esc(m.nom) + '</small><strong>' + esc(m.valeur) + '</strong></div>'; });
    return h + '</div>';
  }

  // ---------- Mesures guidées ----------
  function vueAssistant(clientId) {
    var c = client(clientId);
    if (!c) return location.replace('#/clients');
    if (!S.saisie || S.saisie.clientId !== clientId) S.saisie = { clientId: clientId, modele: CT.MODELES[c.genre] ? c.genre : 'homme', valeurs: {}, i: -1, note: '', confirme: {} };
    cadre({ titre: 'Mesures de ' + c.nom, retour: '#/client/' + clientId, nav: 'clients' });
    dessinerAssistant();
  }
  function dessinerAssistant() {
    var s = S.saisie, c = client(s.clientId), cles = CT.MODELES[s.modele].mesures;
    var prec = CT.relevesClient(S.releves, s.clientId)[0];
    if (s.i < 0) {
      vue('<section class="carte"><h1>Qui mesurez-vous ?</h1><p>Choisissez le modèle : la liste des mesures change selon le cas.</p><form data-form="assistant-modele" novalidate><div class="modeles">' +
        ['homme', 'femme', 'enfant'].map(function (g) {
          return '<label><input type="radio" name="modele" value="' + g + '"' + (s.modele === g ? ' checked' : '') + '><span>' + CTFig.silhouette(g, CT.MODELES[g].nom) + CT.MODELES[g].nom + '</span></label>';
        }).join('') + '</div><p class="petit discret" style="margin-top:10px">Conseil : la personne se tient droite, pieds joints, bras le long du corps. Mesurez sur un vêtement léger, sans serrer le mètre.</p>' +
        '<button type="submit" class="btn large" id="commencer">' + ICO.ruban + 'Commencer (' + cles.length + ' mesures)</button></form>' +
        '<div class="boutons"><a class="btn sec" href="#/mesures/' + esc(s.clientId) + '/rapide">Saisie rapide sur une page</a></div></section>');
      return;
    }
    if (s.i >= cles.length) {
      var nb = Object.keys(s.valeurs).length;
      vue('<section class="carte"><h1>Vérifiez les mesures</h1><p class="discret">' + esc(c.nom) + ' · ' + CT.MODELES[s.modele].nom + ' · ' + pluriel(nb, 'mesure') + '</p>' +
        (nb ? '<div class="mesures" id="resume-mesures">' + cles.map(function (k, i) {
          var v = s.valeurs[k];
          return '<button type="button" class="mesure" style="border:0;text-align:left;cursor:pointer;font:inherit;color:inherit" data-action="aller-mesure" data-i="' + i + '"><small>' + esc(CT.MESURES[k].nom) + '</small>' +
            (v != null ? '<strong>' + CT.formatCm(v) + '</strong> cm' : '<span class="discret">passée</span>') + '</button>';
        }).join('') + '</div><p class="petit discret">Touchez une mesure pour la corriger.</p>' : alerte('attention', '<p>Aucune mesure saisie.</p>')) +
        '<form data-form="assistant-fin" novalidate>' + champ('Note (facultatif)', 'a-note', s.note || '', { zone: true, lignes: 2, place: 'Ex. : épaule droite un peu basse, aime le large' }) +
        '<button type="submit" class="btn large" id="enregistrer-mesures"' + (nb ? '' : ' disabled') + '>' + ICO.ok + 'Enregistrer les mesures</button></form>' +
        '<div class="boutons"><button type="button" class="btn sec" data-action="assistant-prec">‹ Revenir</button></div></section>');
      return;
    }
    var k = cles[s.i], m = CT.MESURES[k], v = s.valeurs[k];
    var pv = prec && prec.valeurs && prec.valeurs[k] != null ? prec.valeurs[k] : null;
    vue('<section class="carte assistant"><div class="progression"><span>Mesure ' + (s.i + 1) + ' sur ' + cles.length + '</span><span>' + esc(CT.MODELES[s.modele].nom) + '</span></div>' +
      '<div class="barre-progres" role="progressbar" aria-valuemin="0" aria-valuemax="' + cles.length + '" aria-valuenow="' + (s.i + 1) + '"><span style="width:' + Math.round((s.i + 1) * 100 / cles.length) + '%"></span></div>' +
      '<h2 id="nom-mesure">' + esc(m.nom) + '</h2><div class="dessin">' + CTFig.dessin(k, s.modele, 'Où placer le mètre : ' + m.nom) + '</div>' +
      '<p class="aide-mesure">' + esc(m.aide) + '</p>' +
      '<form data-form="assistant" novalidate><div class="saisie-cm"><button type="button" data-action="ajuster" data-pas="-0.5" aria-label="Moins un demi-centimètre">−</button>' +
      '<div class="suffixe" style="flex:1"><input type="text" inputmode="decimal" id="valeur-mesure" aria-labelledby="nom-mesure" autocomplete="off" value="' + (v != null ? CT.formatCm(v) : '') + '" placeholder="0"><span>cm</span></div>' +
      '<button type="button" data-action="ajuster" data-pas="0.5" aria-label="Plus un demi-centimètre">+</button></div>' +
      '<p class="precedente">' + (pv != null ? 'Dernière fois : <b>' + CT.formatCm(pv) + ' cm</b> le ' + CT.dateFr(prec.date) + ' <button type="button" class="lien-action" data-action="reprendre" data-v="' + pv + '">Reprendre</button>' : '') + '</p>' +
      '<div class="erreur" id="err-mesure" role="alert" hidden></div>' +
      '<button type="submit" class="btn large" id="suivant">' + (s.i === cles.length - 1 ? 'Terminer ›' : 'Suivant ›') + '</button></form>' +
      '<div class="boutons"><button type="button" class="btn sec" data-action="assistant-prec">‹ Précédent</button><button type="button" class="btn sec" data-action="assistant-passer" id="passer">Passer</button></div></section>');
    var inp = $('#valeur-mesure');
    try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); }
  }

  function vueReleveForm(releveId, clientId) {
    var r = releveId ? releve(releveId) : null;
    if (releveId && !r) return location.replace('#/clients');
    var cid = r ? r.clientId : clientId, c = client(cid);
    if (!c) return location.replace('#/clients');
    var modele = r ? r.modele : (CT.MODELES[c.genre] ? c.genre : 'homme');
    cadre({ titre: r ? 'Mesures du ' + CT.dateFr(r.date) : 'Saisie rapide', retour: '#/client/' + cid, nav: 'clients' });
    vue('<form class="carte" data-form="releve" data-id="' + esc(releveId || 'nouveau') + '" data-client="' + esc(cid) + '" novalidate><h1>' + esc(c.nom) + '</h1>' +
      champ('Date des mesures', 'r-date', r ? r.date : auj(), { type: 'date' }) +
      choix('modele', modele, [['homme', 'Homme'], ['femme', 'Femme'], ['enfant', 'Enfant']], 'Modèle') +
      '<div id="lignes-mesures">' + lignesMesures(modele, r ? r.valeurs : {}) + '</div>' +
      '<h2 style="margin-top:16px">Autres mesures (facultatif)</h2><div id="libres">' + lignesLibres(r && r.libres) + '</div>' +
      '<button type="button" class="lien-action" data-action="ajouter-libre">' + ICO.plus.replace('<svg', '<svg style="width:18px;height:18px"') + 'Ajouter une autre mesure</button>' +
      champ('Note (facultatif)', 'r-note', r ? r.note || '' : '', { zone: true, lignes: 2 }) +
      '<button type="submit" class="btn large">Enregistrer les mesures</button>' +
      (r ? '<div class="boutons"><button type="button" class="btn danger" data-action="releve-suppr" data-id="' + esc(r.id) + '">' + ICO.poubelle + 'Supprimer ces mesures</button></div>' : '') + '</form>');
  }
  function lignesMesures(modele, valeurs) {
    var cles = CT.MODELES[modele].mesures.slice();
    Object.keys(valeurs || {}).forEach(function (k) { if (cles.indexOf(k) < 0 && CT.MESURES[k] && valeurs[k] != null) cles.push(k); });
    return cles.map(function (k) {
      var v = valeurs && valeurs[k] != null ? CT.formatCm(valeurs[k]) : '';
      return '<div class="ligne-mesure">' + CTFig.dessin(k, modele, CT.MESURES[k].nom).replace('class="figure"', 'class="figure mini"') +
        '<label for="m-' + k + '">' + esc(CT.MESURES[k].nom) + '</label><div class="suffixe"><input type="text" inputmode="decimal" id="m-' + k + '" data-mesure="' + k + '" value="' + esc(v) + '" autocomplete="off"><span>cm</span></div></div>';
    }).join('');
  }
  function lignesLibres(libres) {
    var l = (libres || []).filter(function (m) { return m && m.nom; });
    if (!l.length) l = [{ nom: '', valeur: '' }];
    return l.map(function (m, i) { return ligneLibre(m, i); }).join('');
  }
  function ligneLibre(m, i) {
    return '<div class="grille2 libre"><div class="champ"><label for="l-nom-' + i + '">Nom</label><input type="text" id="l-nom-' + i + '" data-libre-nom value="' + esc(m.nom) + '" placeholder="Ex. : Tour de tête"></div>' +
      '<div class="champ"><label for="l-val-' + i + '">Valeur</label><input type="text" id="l-val-' + i + '" data-libre-val value="' + esc(m.valeur) + '" placeholder="Ex. : 56 cm"></div></div>';
  }
  function vueHistorique(clientId) {
    var c = client(clientId);
    if (!c) return location.replace('#/clients');
    cadre({ titre: 'Historique des mesures', retour: '#/client/' + clientId, nav: 'clients' });
    var rel = CT.relevesClient(S.releves, clientId);
    if (!rel.length) return vue('<div class="carte vide"><p>Aucune mesure.</p><a class="btn" href="#/mesures/' + esc(clientId) + '/guidees">Prendre les mesures</a></div>');
    var cles = [], vu = {};
    rel.forEach(function (r) { CT.clesReleve(r).forEach(function (k) { if (!vu[k]) { vu[k] = 1; cles.push(k); } }); });
    var h = '<section class="carte"><h1>' + esc(c.nom) + '</h1><p class="discret">' + pluriel(rel.length, 'prise', 'prises') + ' de mesures, de la plus récente à la plus ancienne. Les écarts sont comparés à la prise suivante.</p><div class="historique"><table><thead><tr><th scope="col">Mesure (cm)</th>' +
      rel.map(function (r) { return '<th scope="col"><a href="#/releve/' + esc(r.id) + '">' + CT.dateFr(r.date) + '</a></th>'; }).join('') + '</tr></thead><tbody>';
    cles.forEach(function (k) {
      h += '<tr><th scope="row">' + esc(CT.MESURES[k].nom) + '</th>' + rel.map(function (r, i) {
        var v = r.valeurs[k], p = rel[i + 1] && rel[i + 1].valeurs[k], e = v != null && p != null ? Math.round((v - p) * 2) / 2 : 0;
        return '<td>' + (v != null ? '<b>' + CT.formatCm(v) + '</b>' + (e ? ' <small class="' + (e > 0 ? 'reste' : 'discret') + '">(' + (e > 0 ? '+' : '−') + CT.formatCm(Math.abs(e)) + ')</small>' : '') : '<span class="discret">—</span>') + '</td>';
      }).join('') + '</tr>';
    });
    h += '</tbody></table></div></section>';
    vue(h);
  }

  // ---------- Commandes ----------
  var FILTRES = [['en_cours', 'En cours'], ['pret', 'Prêts'], ['retard', 'En retard'], ['impayes', 'Reste à payer'], ['livre', 'Livrés'], ['toutes', 'Toutes']];
  function filtrer(f, A) {
    return S.commandes.filter(function (c) {
      var e = CT.etatCommande(c, A);
      if (f === 'en_cours') return c.statut !== 'livre';
      if (f === 'pret') return e === 'pret';
      if (f === 'retard') return e === 'retard';
      if (f === 'impayes') return CT.totauxCommande(c).reste > 0;
      if (f === 'livre') return c.statut === 'livre';
      return true;
    });
  }
  function vueCommandes(_, q) {
    cadre({ titre: 'Commandes', nav: 'commandes' });
    var A = auj(), f = q.get('f') || 'en_cours';
    var l = filtrer(f, A).sort(function (a, b) {
      if (f === 'livre') return (b.livreLe || '') < (a.livreLe || '') ? -1 : 1;
      return (a.dateLivraison || '9') < (b.dateLivraison || '9') ? -1 : 1;
    });
    var h = '<div class="carte-titre"><h1 style="margin:0">Commandes</h1><a class="btn petit" href="#/commande-modifier/nouveau">' + ICO.plus + 'Nouvelle</a></div>';
    h += '<div class="chips" role="group" aria-label="Filtrer les commandes">' + FILTRES.map(function (x) {
      return '<a class="chip' + (x[0] === f ? ' actif' : '') + '" href="#/commandes?f=' + x[0] + '"' + (x[0] === f ? ' aria-current="true"' : '') + '>' + x[1] + ' <b>' + filtrer(x[0], A).length + '</b></a>';
    }).join('') + '</div>';
    if (f === 'impayes' && l.length) h += '<p class="discret">Total à encaisser : <b class="reste">' + F(CT.resteAEncaisser(l)) + '</b></p>';
    h += l.length ? '<div class="carte" style="padding:4px 14px"><ul class="liste" id="liste-commandes">' + l.map(function (c) { return '<li>' + ligneCommande(c) + '</li>'; }).join('') + '</ul></div>' :
      '<div class="carte vide">' + ICO.habit + '<p>' + (S.commandes.length ? 'Aucune commande ici.' : 'Aucune commande pour l\'instant.') + '</p>' + (S.commandes.length ? '' : '<a class="btn" href="#/commande-modifier/nouveau">' + ICO.plus + 'Nouvelle commande</a>') + '</div>';
    vue(h);
  }
  function badgeEtat(c, A) {
    var e = CT.etatCommande(c, A);
    return e === 'retard' ? '<span class="badge retard">En retard</span>' : '<span class="badge ' + c.statut + '">' + esc(CT.nomStatut(c.statut)) + '</span>';
  }
  function ligneCommande(c, sansClient) {
    var A = auj(), cl = client(c.clientId), t = CT.totauxCommande(c);
    var quand = c.statut === 'livre' ? 'Livré le ' + CT.dateFr(c.livreLe) : 'Livraison ' + CT.dateCourte(c.dateLivraison) + ' · ' + CT.relatif(c.dateLivraison, A);
    return '<a class="ligne" href="#/commande/' + esc(c.id) + '">' + (sansClient ? '' : avatar(cl)) + '<span class="ligne-corps"><strong>' + esc(sansClient ? CT.texteHabit(c) : (cl ? cl.nom : 'Client supprimé')) + '</strong><small>' +
      esc(sansClient ? (c.numero || '') : CT.texteHabit(c)) + '</small><small>' + esc(quand) + '</small></span><span class="ligne-fin">' + badgeEtat(c, A) +
      (t.reste > 0 ? '<small class="reste nb" style="display:block;margin-top:4px">' + F(t.reste) + '</small>' : '') + '</span></a>';
  }
  function vueCommandeForm(id, q) {
    var nouveau = id === 'nouveau', c = nouveau ? null : commande(id);
    if (!nouveau && !c) return location.replace('#/commandes');
    cadre({ titre: nouveau ? 'Nouvelle commande' : 'Modifier la commande', retour: nouveau ? (q.get('client') ? '#/client/' + q.get('client') : '#/commandes') : '#/commande/' + id, nav: 'commandes' });
    if (!S.clients.length) return vue('<div class="carte vide">' + ICO.client + '<p>Ajoutez d\'abord le client.</p><a class="btn" href="#/client-modifier/nouveau">' + ICO.plus + 'Nouveau client</a></div>');
    c = c || { clientId: q.get('client') || '', habit: '', pieces: 1, tissuFourni: 'client', uniteTissu: 'm', dateLivraison: '', dateEssayage: '' };
    S.photos = { modele: c.photoModele || null, tissu: c.photoTissu || null };
    var opts = [['', 'Choisir le client…']].concat(trierNoms(S.clients).map(function (x) { return [x.id, x.nom]; }));
    vue('<form class="carte" data-form="commande" data-id="' + esc(id) + '" novalidate>' +
      champ('Client', 'o-client', c.clientId, { options: opts, requis: true }) +
      '<p class="petit" style="margin-top:-8px"><a href="#/client-modifier/nouveau">+ Nouveau client</a></p>' +
      '<div class="grille2">' + champ('Habit', 'o-habit', c.habit || '', { options: [['', 'Choisir…']].concat(CT.HABITS) }) +
      champ('Nombre de pièces', 'o-pieces', c.pieces || 1, { mode: 'numeric', aide: 'Ex. : 2 boubous = 2' }) + '</div>' +
      champ('Modèle (description)', 'o-modele', c.modele || '', { place: 'Ex. : grand boubou bazin, broderie au col' }) +
      '<div class="grille2">' + zonePhoto('modele', 'Photo du modèle', S.photos.modele) + zonePhoto('tissu', 'Photo du tissu', S.photos.tissu) + '</div>' +
      choix('tissu', c.tissuFourni || 'client', [['client', 'Tissu apporté par le client'], ['atelier', 'Tissu fourni par l\'atelier']], 'Tissu') +
      '<div class="grille2">' + champ('Quantité de tissu', 'o-qte', c.quantiteTissu ? CT.formatCm(c.quantiteTissu) : '', { mode: 'decimal', place: 'Ex. : 4,5' }) +
      champ('Unité', 'o-unite', c.uniteTissu || 'm', { options: [['m', 'mètres'], ['yards', 'yards'], ['pagnes', 'pagnes']] }) + '</div>' +
      montantChamp('Prix total convenu', 'o-prix', c.prix, { requis: true }) +
      (nouveau ? '<div class="grille2">' + montantChamp('Acompte reçu aujourd\'hui', 'o-acompte', 0, { aide: 'Un reçu est préparé.' }) +
        champ('Payé par', 'o-mode', 'Espèces', { options: ['Espèces', 'Wave', 'Orange Money', 'Autre'] }) + '</div>' : '') +
      '<div class="grille2">' + champ('Date d\'essayage', 'o-essayage', c.dateEssayage || '', { type: 'date', aide: 'Facultatif' }) +
      champ('Date de livraison', 'o-livraison', c.dateLivraison || '', { type: 'date', requis: true }) + '</div>' +
      '<div id="alerte-charge" aria-live="polite"></div>' +
      champ('Occasion', 'o-occasion', c.occasion || '', { options: [['', 'Aucune en particulier']].concat(CT.OCCASIONS) }) +
      champ('Note (facultatif)', 'o-note', c.note || '', { zone: true, lignes: 2 }) +
      '<button type="submit" class="btn large">' + (nouveau ? 'Enregistrer la commande' : 'Enregistrer') + '</button></form>');
    majAlerteCharge();
  }
  function majAlerteCharge() {
    var form = $('form[data-form=commande]'), zone = $('#alerte-charge');
    if (!form || !zone) return;
    var d = val(form, 'o-livraison'), p = Math.max(1, CT.lireEntier(val(form, 'o-pieces')) || 1), id = form.dataset.id;
    if (!CT.dateValide(d)) { zone.innerHTML = ''; return; }
    var cap = CT.lireEntier(S.reglages.capacite), deja = CT.chargeSemaine(S.commandes, d, id), total = deja + p, l = CT.debutSemaine(d);
    var h = '';
    if (d < auj()) h += alerte('attention', '<p>Cette date de livraison est déjà passée.</p>');
    var txt = 'Semaine du ' + CT.dateCourte(l) + ' : ' + pluriel(total, 'habit') + ' à finir avec celle-ci' + (cap ? ' (capacité ' + cap + ')' : '') + '.';
    if (cap && total > cap) h += alerte('danger', '<p><b>Semaine surchargée.</b> ' + esc(txt) + ' Proposez une autre date au client.</p>');
    else h += '<p class="petit discret" id="charge-ok">' + esc(txt) + '</p>';
    fetes().forEach(function (fe) {
      var n = CT.joursEntre(d, fe.date);
      if (n >= 0 && n <= 21 && CT.joursEntre(auj(), fe.date) >= 0) {
        var a = CT.alertesFetes(S.commandes.filter(function (x) { return x.id !== id; }), [fe], cap, auj(), 400)[0];
        if (a && a.aFaire + p > a.capacite) h += alerte('danger', '<p><b>Avant la ' + esc(fe.nom) + ' :</b> ' + pluriel(a.aFaire + p, 'habit') + ' à finir pour une capacité d\'environ ' + pluriel(a.capacite, 'habit') + '.</p>');
      }
    });
    zone.innerHTML = h;
  }
  function vueCommande(id) {
    var c = commande(id);
    if (!c) return location.replace('#/commandes');
    var cl = client(c.clientId), A = auj(), t = CT.totauxCommande(c), i = CT.indexStatut(c.statut), suiv = CT.statutSuivant(c.statut);
    cadre({ titre: c.numero || 'Commande', retour: '#/commandes', nav: 'commandes' });
    var h = '<section class="carte"><div class="carte-titre"><div><h1 style="margin:0">' + esc(CT.texteHabit(c)) + '</h1><p class="discret" style="margin:2px 0 0">' +
      (cl ? '<a href="#/client/' + esc(cl.id) + '">' + esc(cl.nom) + '</a>' : 'Client supprimé') + ' · ' + esc(c.numero || '') + '</p></div>' + badgeEtat(c, A) + '</div>';
    if (c.occasion) h += '<span class="fete">' + esc(c.occasion) + '</span>';
    h += '<ol class="etapes-statut" aria-label="Étapes de la commande">' + CT.STATUTS.map(function (s, k) {
      var cls = k < i ? 'fait' : k === i ? 'actuel' : '';
      return '<li class="' + cls + '"><button type="button" data-action="statut" data-statut="' + s.cle + '" aria-label="' + esc(s.nom) + (k === i ? ' (étape actuelle)' : '') + '"' + (k === i ? ' aria-current="step"' : '') +
        '><span class="pastille">' + (k < i ? '✓' : k + 1) + '</span>' + esc(s.nom) + '</button></li>';
    }).join('') + '</ol>';
    if (suiv) h += '<button type="button" class="btn large' + (suiv === 'pret' ? ' or' : '') + '" style="margin-top:12px" data-action="statut" data-statut="' + suiv + '" id="etape-suivante">' + ICO.ok + 'Passer à : ' + esc(CT.nomStatut(suiv)) + '</button>';
    h += '<div class="montants"><div><small>Prix</small><strong class="nb">' + F(t.prix) + '</strong></div><div><small>Payé</small><strong class="nb">' + F(t.paye) + '</strong></div><div><small>Reste</small><strong class="nb ' + (t.reste ? 'reste' : 'solde') + '" id="reste-commande">' + F(t.reste) + '</strong></div></div>';
    h += '<div class="boutons">' + (t.reste > 0 ? '<button type="button" class="btn" data-action="encaisser" id="btn-encaisser">' + ICO.caisse + 'Encaisser</button>' : '');
    if (c.statut === 'pret' || c.statut === 'livre') h += '<a class="btn wa" target="_blank" rel="noopener" id="wa-pret" data-action="prevenu" data-id="' + esc(c.id) + '" href="' + esc(CT.lienWhatsApp(cl && cl.telephone, CT.messagePret(c, cl, S.atelier))) + '">' + ICO.wa + 'Habit prêt : prévenir</a>';
    else if (c.dateEssayage) h += '<a class="btn wa" target="_blank" rel="noopener" id="wa-essayage" data-action="rappel-essayage" data-id="' + esc(c.id) + '" href="' + esc(CT.lienWhatsApp(cl && cl.telephone, CT.messageEssayage(c, cl, S.atelier))) + '">' + ICO.wa + 'Rappel d\'essayage</a>';
    h += '</div>';
    if (c.prevenuLe) h += '<p class="petit discret">Client prévenu le ' + CT.dateFr(c.prevenuLe) + '.</p>';
    h += '</section>';
    // dates et tissu
    h += '<section class="carte"><h2>Détails</h2><dl class="infos">' +
      '<dt>Commandé</dt><dd>' + CT.dateFr(c.date) + '</dd>' +
      (c.dateEssayage ? '<dt>Essayage</dt><dd>' + esc(CT.dateCourte(c.dateEssayage)) + ' · ' + esc(CT.relatif(c.dateEssayage, A)) + '</dd>' : '') +
      '<dt>Livraison</dt><dd>' + esc(CT.dateCourte(c.dateLivraison)) + (c.statut !== 'livre' ? ' · ' + esc(CT.relatif(c.dateLivraison, A)) : '') + '</dd>' +
      (c.livreLe ? '<dt>Livré le</dt><dd>' + CT.dateFr(c.livreLe) + '</dd>' : '') +
      '<dt>Tissu</dt><dd>' + (c.tissuFourni === 'atelier' ? 'Fourni par l\'atelier' : 'Apporté par le client') + (c.quantiteTissu ? ' · ' + CT.formatCm(c.quantiteTissu) + ' ' + esc(c.uniteTissu === 'yards' ? 'yards' : c.uniteTissu === 'pagnes' ? 'pagne(s)' : 'm') : '') + '</dd>' +
      (c.note ? '<dt>Note</dt><dd>' + esc(c.note) + '</dd>' : '') + '</dl>';
    if (c.photoModele || c.photoTissu) {
      h += '<div class="photos" style="margin-top:12px">' + [['photoModele', 'Modèle'], ['photoTissu', 'Tissu']].filter(function (x) { return c[x[0]]; }).map(function (x) {
        return '<figure><button type="button" data-action="voir-photo" data-cle="' + x[0] + '" aria-label="Agrandir la photo : ' + x[1] + '"><img src="' + esc(c[x[0]]) + '" alt="' + x[1] + '"></button><figcaption>' + x[1] + '</figcaption></figure>';
      }).join('') + '</div>';
    }
    h += '</section>';
    // paiements
    h += '<section class="carte"><div class="carte-titre"><h2>Paiements</h2><span class="discret petit">' + pluriel((c.paiements || []).length, 'paiement') + '</span></div>';
    h += (c.paiements || []).length ? (c.paiements || []).map(function (p) {
      var sit = CT.situationApres(c, p.id);
      return '<div class="paiement"><span class="ligne-corps"><strong class="nb">' + F(p.montant) + '</strong><small>' + (p.nature === 'solde' ? 'Solde' : 'Acompte') + ' · ' + CT.dateFr(p.date) + (p.mode ? ' · ' + esc(p.mode) : '') +
        '</small><small>Reçu ' + esc(p.recu || '') + ' · reste après : ' + F(sit ? sit.reste : 0) + '</small></span>' +
        '<button type="button" class="btn doux petit" data-action="recu-pdf" data-p="' + esc(p.id) + '" aria-label="Reçu PDF ' + esc(p.recu || '') + '">' + ICO.pdf + 'Reçu</button>' +
        '<button type="button" class="icone-btn" data-action="paiement-suppr" data-p="' + esc(p.id) + '" aria-label="Supprimer ce paiement">' + ICO.poubelle + '</button></div>';
    }).join('') : '<p class="discret">Aucun paiement pour l\'instant.</p>';
    h += '</section>';
    // mesures du client
    var rel = cl ? CT.relevesClient(S.releves, cl.id)[0] : null;
    h += '<section class="carte"><div class="carte-titre"><h2>Mesures</h2>' + (rel ? '<span class="discret petit">du ' + CT.dateFr(rel.date) + '</span>' : '') + '</div>' +
      (rel ? grilleMesures(rel) : '<p class="discret">Pas encore de mesures pour ce client.</p>' + (cl ? '<a class="btn sec" href="#/mesures/' + esc(cl.id) + '/guidees">' + ICO.ruban + 'Prendre les mesures</a>' : '')) + '</section>';
    // étapes passées
    h += '<section class="carte"><h2>Suivi</h2><ul class="liste">' + (c.historique || []).slice().reverse().map(function (x) {
      return '<li class="petit" style="padding:6px 0;border-bottom:1px solid var(--line)"><b>' + esc(CT.nomStatut(x.statut)) + '</b> · ' + CT.dateFr(x.date) + '</li>';
    }).join('') + '</ul></section>';
    h += '<div class="boutons"><a class="btn sec" href="#/commande-modifier/' + esc(c.id) + '">' + ICO.crayon + 'Modifier</a><button type="button" class="btn danger" data-action="commande-suppr">' + ICO.poubelle + 'Supprimer</button></div>';
    vue(h);
  }

  function enregistrerCommande(c) {
    return DB.lot([['commandes', c], ['kv', S.compteurs, 'compteurs']]).then(function () { remplacer(S.commandes, c); });
  }
  function changerStatut(c, s) {
    var avant = c.statut;
    c.statut = s;
    c.historique = (c.historique || []).concat([{ statut: s, date: auj() }]);
    if (s === 'livre') c.livreLe = auj(); else if (avant === 'livre') delete c.livreLe;
    return enregistrerCommande(c);
  }
  function demanderStatut(c, s) {
    if (s === c.statut) return;
    var ia = CT.indexStatut(c.statut), ib = CT.indexStatut(s);
    var faire = function () {
      if (s === 'livre') {
        var t = CT.totauxCommande(c);
        if (t.reste > 0) {
          feuille('Livrer l\'habit', '<p>Il reste <b class="reste">' + F(t.reste) + '</b> à payer.</p><div class="boutons" style="flex-direction:column">' +
            '<button type="button" class="btn large" id="livrer-encaisser">' + ICO.caisse + 'Encaisser ' + F(t.reste) + ' et livrer</button>' +
            '<button type="button" class="btn sec large" id="livrer-sans">Livrer sans encaisser</button><button type="button" class="btn sec large" data-fermer>Annuler</button></div>', function (el) {
            el.querySelector('#livrer-encaisser').onclick = function () {
              ajouterPaiement(c, t.reste, 'Espèces', auj()).then(function (p) { return changerStatut(c, 'livre').then(function () { vueCommande(c.id); proposerRecu(c, p); }); });
            };
            el.querySelector('#livrer-sans').onclick = function () { fermerFeuille(true); changerStatut(c, 'livre').then(function () { vueCommande(c.id); toast('Habit livré.'); }); };
          });
          return;
        }
      }
      changerStatut(c, s).then(function () {
        vueCommande(c.id);
        if (s === 'pret') proposerPret(c); else toast('Étape : ' + CT.nomStatut(s));
      });
    };
    if (ib < ia) confirmer('Revenir en arrière ?', 'La commande repassera à l\'étape « ' + esc(CT.nomStatut(s)) + ' ».', 'Oui, revenir', faire);
    else faire();
  }
  function proposerPret(c) {
    var cl = client(c.clientId);
    feuille('Habit prêt !', '<p>Prévenez <b>' + esc(cl ? cl.nom : 'le client') + '</b> en un geste. Le message s\'ouvre dans WhatsApp : relisez-le puis envoyez-le vous-même.</p>' +
      '<a class="btn wa large" target="_blank" rel="noopener" id="wa-pret-feuille" data-action="prevenu" data-id="' + esc(c.id) + '" href="' + esc(CT.lienWhatsApp(cl && cl.telephone, CT.messagePret(c, cl, S.atelier))) + '">' + ICO.wa + 'Prévenir sur WhatsApp</a>' +
      (cl && !cl.telephone ? '<p class="petit discret">Son numéro n\'est pas dans sa fiche : WhatsApp vous demandera de choisir le contact.</p>' : '') +
      '<button type="button" class="btn sec large" style="margin-top:10px" data-fermer>Plus tard</button>');
  }
  function ajouterPaiement(c, montant, mode, date) {
    var p = { id: CT.nouvelId(), date: date || auj(), montant: CT.lireEntier(montant), mode: mode || '', nature: CT.naturePaiement(c, montant), recu: prochainNumero('recu'), cree: Date.now() };
    c.paiements = (c.paiements || []).concat([p]);
    return enregistrerCommande(c).then(function () { return p; });
  }
  function proposerRecu(c, p) {
    var cl = client(c.clientId), sit = CT.situationApres(c, p.id);
    feuille(p.nature === 'solde' ? 'Solde encaissé' : 'Acompte encaissé', '<p><b class="nb">' + F(p.montant) + '</b> reçus · reçu <b>' + esc(p.recu) + '</b>. ' +
      (sit.reste > 0 ? 'Reste à payer : <b class="reste nb">' + F(sit.reste) + '</b>.' : '<b class="solde">Tout est payé.</b>') + '</p>' +
      '<button type="button" class="btn large" data-action="recu-pdf" data-p="' + esc(p.id) + '" data-c="' + esc(c.id) + '" id="recu-pdf-feuille">' + ICO.pdf + 'Reçu PDF</button>' +
      '<a class="btn wa large" style="margin-top:10px" target="_blank" rel="noopener" id="wa-recu" href="' + esc(CT.lienWhatsApp(cl && cl.telephone, CT.messageRecu(c, cl, S.atelier, p.id))) + '">' + ICO.wa + 'Message de reçu WhatsApp</a>' +
      '<button type="button" class="btn sec large" style="margin-top:10px" data-fermer>Terminé</button>');
  }

  // ---------- Planning ----------
  function vuePlanning() {
    cadre({ titre: 'Planning', nav: 'planning' });
    var A = auj(), cap = CT.lireEntier(S.reglages.capacite), P = CT.semaines(S.commandes, cap, A, 8, fetes());
    var h = '<div class="carte-titre"><h1 style="margin:0">Planning des livraisons</h1></div>';
    h += '<p class="discret">Capacité : <b>' + pluriel(cap, 'habit') + ' par semaine</b> · <a href="#/atelier">changer</a></p>';
    CT.alertesFetes(S.commandes, fetes(), cap, A, 90).forEach(function (a) { h += carteFete(a); });
    if (P.retard.commandes.length) {
      h += '<section class="carte semaine retard" id="semaine-retard"><div class="semaine-tete"><h2>En retard</h2><span class="badge retard">' + pluriel(P.retard.aFaire, 'habit') + '</span></div><ul class="liste">' +
        P.retard.commandes.map(function (c) { return '<li>' + ligneCommande(c) + '</li>'; }).join('') + '</ul></section>';
    }
    P.semaines.forEach(function (s, k) {
      var niveau = s.surcharge ? 'surcharge' : cap && s.aFaire * 10 > cap * 8 ? 'serre' : 'ok';
      var pct = cap ? Math.min(100, Math.round(s.aFaire * 100 / cap)) : 0;
      var titre = k === 0 ? 'Cette semaine' : k === 1 ? 'Semaine prochaine' : 'Semaine du ' + CT.dateCourte(s.lundi);
      h += '<section class="carte semaine ' + (s.commandes.length ? niveau : 'libre') + '" data-lundi="' + s.lundi + '"><div class="semaine-tete"><h2>' + titre + '</h2><span class="discret petit">' +
        CT.dateFr(s.lundi).slice(0, 5) + ' → ' + CT.dateFr(s.dimanche).slice(0, 5) + '</span></div>';
      s.fetes.forEach(function (fe) { h += '<span class="fete">' + esc(fe.nom) + ' ≈ ' + esc(CT.dateCourte(fe.date)) + '</span> '; });
      if (!s.commandes.length) { h += '<p class="discret petit">Aucune livraison prévue.</p></section>'; return; }
      h += '<div class="jauge ' + niveau + '" role="img" aria-label="Charge ' + pct + ' %"><span style="width:' + pct + '%"></span></div>';
      h += '<p class="petit' + (s.surcharge ? ' reste' : '') + '">' + (s.surcharge ? '<b>Surcharge :</b> ' : '') + pluriel(s.aFaire, 'habit') + ' à finir sur ' + cap + ' possibles' +
        (s.pieces > s.aFaire ? ' · ' + pluriel(s.pieces - s.aFaire, 'habit') + ' déjà prêt' + (s.pieces - s.aFaire > 1 ? 's' : '') : '') + '</p>';
      var jour = '';
      h += '<ul class="liste">';
      s.commandes.forEach(function (c) {
        if (c.dateLivraison !== jour) { jour = c.dateLivraison; h += '<li class="jour-livraison">' + esc(CT.dateCourte(jour)) + '</li>'; }
        h += '<li>' + ligneCommande(c) + '</li>';
      });
      h += '</ul></section>';
    });
    if (P.plusTard.commandes.length) h += '<section class="carte"><h2>Plus tard</h2><p class="discret">' + pluriel(P.plusTard.commandes.length, 'commande') + ' (' + pluriel(P.plusTard.pieces, 'habit') + ') après ces 8 semaines.</p>' +
      '<ul class="liste">' + P.plusTard.commandes.map(function (c) { return '<li>' + ligneCommande(c) + '</li>'; }).join('') + '</ul></section>';
    vue(h);
  }

  // ---------- Caisse ----------
  function vueCaisse(_, q) {
    cadre({ titre: 'Caisse', retour: '#/', nav: 'accueil' });
    var A = auj(), cle = /^\d{4}-\d{2}$/.test(q.get('m') || '') ? q.get('m') : CT.cleMois(A), M = CT.resumeMois(S.commandes, cle);
    var duJour = CT.tousPaiements(S.commandes).filter(function (x) { return x.p.date === A; });
    var h = '<section class="carte"><div class="carte-titre"><h2>Aujourd\'hui</h2><span class="discret petit">' + esc(CT.dateLongue(A)) + '</span></div><p class="gros-chiffre nb" id="caisse-jour">' + F(CT.encaisseJour(S.commandes, A)) + '</p>';
    h += duJour.length ? '<ul class="liste">' + duJour.map(function (x) {
      var cl = client(x.c.clientId);
      return '<li><a class="ligne" href="#/commande/' + esc(x.c.id) + '"><span class="ligne-corps"><strong>' + esc(cl ? cl.nom : 'Client') + '</strong><small>' + (x.p.nature === 'solde' ? 'Solde' : 'Acompte') + ' · ' + esc(CT.texteHabit(x.c)) + '</small></span><strong class="nb">' + F(x.p.montant) + '</strong></a></li>';
    }).join('') + '</ul>' : '<p class="discret">Aucun paiement aujourd\'hui.</p>';
    h += '</section>';
    h += '<section class="carte"><div class="mois-nav"><a class="btn sec petit" href="#/caisse?m=' + CT.ajouterMois(cle, -1) + '" aria-label="Mois précédent">‹</a><strong>' + esc(CT.moisFr(cle)) + '</strong>' +
      (cle < CT.cleMois(A) ? '<a class="btn sec petit" href="#/caisse?m=' + CT.ajouterMois(cle, 1) + '" aria-label="Mois suivant">›</a>' : '<span style="width:48px"></span>') + '</div>';
    h += '<div class="kpis" style="margin-top:12px"><div class="kpi fort"><small>Encaissé</small><strong class="nb" id="caisse-mois">' + F(M.encaisse) + '</strong><span>' + pluriel(M.paiements, 'paiement') + '</span></div>' +
      '<div class="kpi"><small>Commandes prises</small><strong class="nb">' + M.commandes + '</strong><span class="nb">' + F(M.montantCommandes) + '</span></div>' +
      '<div class="kpi"><small>Habits livrés</small><strong class="nb">' + M.livres + '</strong><span>ce mois</span></div>' +
      '<div class="kpi"><small>Reste à encaisser</small><strong class="nb">' + F(CT.resteAEncaisser(S.commandes)) + '</strong><span>toutes commandes</span></div></div>';
    h += M.parJour.length ? '<table class="tableau" id="caisse-jours"><thead><tr><th scope="col">Jour</th><th scope="col">Paiements</th><th scope="col">Encaissé</th></tr></thead><tbody>' +
      M.parJour.map(function (j) { return '<tr><td>' + esc(CT.dateCourte(j.date)) + '</td><td>' + j.n + '</td><td class="nb">' + F(j.total) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td>Total</td><td>' + M.paiements + '</td><td class="nb">' + F(M.encaisse) + '</td></tr></tfoot></table>' : '<p class="discret">Aucun paiement ce mois-ci.</p>';
    h += '</section>';
    // 12 mois
    var lignes = [], tot = 0;
    for (var k = 0; k < 12; k++) { var cm = CT.ajouterMois(CT.cleMois(A), -k), r = CT.resumeMois(S.commandes, cm); tot += r.encaisse; lignes.push(r); }
    h += '<section class="carte"><h2>12 derniers mois</h2><table class="tableau" id="caisse-12"><thead><tr><th scope="col">Mois</th><th scope="col">Commandes</th><th scope="col">Encaissé</th></tr></thead><tbody>' +
      lignes.map(function (r) { return '<tr><td><a href="#/caisse?m=' + r.mois + '">' + esc(CT.moisFr(r.mois)) + '</a></td><td>' + r.commandes + '</td><td class="nb">' + F(r.encaisse) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td>Total</td><td></td><td class="nb">' + F(tot) + '</td></tr></tfoot></table><p class="petit discret">L\'application note ce que vous encaissez ; elle ne reçoit ni ne garde aucun argent.</p></section>';
    vue(h);
  }

  // ---------- Réglages ----------
  var invite = null;
  function estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function estInstallee() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function majInstall() { var b = $('#installer'); if (b) b.hidden = estInstallee() || !(invite || estIOS()); }
  function aideInstallation() {
    if (estIOS()) return '<ol class="etapes"><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez le bouton <b>Partager</b> (carré avec une flèche vers le haut).</li><li>Choisissez <b>« Sur l\'écran d\'accueil »</b>, puis <b>Ajouter</b>.</li></ol>';
    return '<ol class="etapes"><li>Ouvrez cette page dans <b>Chrome</b>.</li><li>Touchez le menu <b>⋮</b> en haut à droite.</li><li>Choisissez <b>« Installer l\'application »</b> ou <b>« Ajouter à l\'écran d\'accueil »</b>.</li></ol>';
  }
  function lien(href, icone, titre, sous) { return '<a href="' + href + '">' + icone + '<span><strong>' + esc(titre) + '</strong><small>' + esc(sous) + '</small></span>' + ICO.chevron + '</a>'; }
  function vueReglages() {
    cadre({ titre: 'Réglages', nav: 'reglages' });
    var P = S.pass, theme = lireTheme();
    var h = '<section class="carte statut-pass' + (P.actif ? ' actif' : '') + '"><div><small class="discret">Votre version</small><h2 style="margin:0">' + (P.actif ? 'Pass actif' : 'Version gratuite') + '</h2><span class="petit">' +
      (P.actif ? 'Jusqu\'au ' + CT.dateFr(P.fin.slice(0, 10)) : S.clients.length + ' / ' + CT.LIMITE_CLIENTS + ' clients') + '</span></div><a class="btn ' + (P.actif ? 'sec' : 'or') + ' petit" href="#/pass">' + (P.actif ? 'Détails' : 'Voir le pass') + '</a></section>';
    h += '<nav class="menu" aria-label="Réglages">' +
      lien('#/atelier', ICO.atelier, 'Mon atelier', (S.atelier.nom || 'Nom, téléphone, adresse') + ' · capacité ' + CT.lireEntier(S.reglages.capacite) + '/semaine') +
      lien('#/fetes', ICO.fete, 'Dates des fêtes', 'Tabaski, Korité, fin d\'année : alertes de surcharge') +
      lien('#/caisse', ICO.caisseMenu, 'Caisse', 'Totaux du jour et du mois') +
      lien('#/sauvegarde', ICO.sauvegarde, 'Sauvegarde', S.sauvegardeLe ? 'Dernière : ' + CT.dateFr(S.sauvegardeLe.slice(0, 10)) : 'Aucune sauvegarde pour l\'instant') +
      lien('#/pass', ICO.etoile, 'Pass 12 mois', P.actif ? 'Actif' : F(CT.PASS.prix) + ' : clients illimités') +
      lien('#/aide', ICO.aide, 'Aide', 'Bien prendre les mesures, questions fréquentes') + '</nav>';
    h += '<section class="carte"><h2>Apparence</h2>' + champ('Thème', 'theme', theme, { options: [['auto', 'Automatique (comme le téléphone)'], ['clair', 'Clair'], ['sombre', 'Sombre']] }) + '</section>';
    h += '<section class="carte"><h2>Installer l\'application</h2>' + (estInstallee() ? alerte('ok', '<p>L\'application est installée sur ce téléphone.</p>') :
      (invite ? '<button type="button" class="btn large" data-action="installer">' + ICO.installer.replace('class="ico"', '') + 'Installer l\'application</button>' : aideInstallation())) + '</section>';
    h += '<section class="carte"><h2>Confidentialité</h2><p>Vos clients, photos, mesures et commandes sont enregistrés <b>uniquement sur ce téléphone</b>. Rien n\'est envoyé sur Internet, sauf la vérification de votre pass (une seule fois).</p>' +
      '<p class="petit">Les messages WhatsApp ne partent jamais tout seuls : l\'application ouvre WhatsApp avec le texte, et c\'est vous qui l\'envoyez.</p></section>';
    h += '<section class="carte"><h2>À propos</h2><p>Carnet du Tailleur, version ' + VERSION + ' (famille TERANGA).</p><p class="petit">Bibliothèque libre incluse : jsPDF (licence MIT). <a href="vendor/LISEZMOI.txt">Détails</a>.</p>' +
      '<p class="petit"><a href="../">Toutes nos applications</a> · <a href="../../boutique/">Boutique</a></p></section>';
    vue(h);
    $('#theme').addEventListener('change', function () { appliquerTheme(this.value); });
  }
  function lireTheme() { try { return localStorage.getItem('ct-theme') || 'auto'; } catch (e) { return 'auto'; } }
  function appliquerTheme(v) {
    try { localStorage.setItem('ct-theme', v); } catch (e) {}
    var r = document.documentElement;
    if (v === 'clair') r.setAttribute('data-theme', 'light'); else if (v === 'sombre') r.setAttribute('data-theme', 'dark'); else r.removeAttribute('data-theme');
  }
  function vueAtelier() {
    cadre({ titre: 'Mon atelier', retour: '#/reglages', nav: 'reglages' });
    var a = S.atelier;
    vue('<form class="carte" data-form="atelier" novalidate>' + champ('Nom de l\'atelier', 'a-nom', a.nom || '', { place: 'Ex. : Atelier Ndiaye Couture', auto: 'organization' }) +
      champ('Téléphone', 'a-tel', a.telephone || '', { type: 'tel', mode: 'tel', aide: 'Affiché sur les reçus et dans les messages.' }) +
      champ('Adresse', 'a-adresse', a.adresse || '', { zone: true, lignes: 2, place: 'Ex. : Marché HLM, cantine 12, Dakar' }) +
      champ('Capacité de l\'atelier', 'a-capacite', CT.lireEntier(S.reglages.capacite) || '', { mode: 'numeric', suffixe: 'habits / semaine', aide: 'Nombre d\'habits que l\'atelier peut finir en une semaine. Sert aux alertes de surcharge.' }) +
      '<button type="submit" class="btn large">Enregistrer</button></form>');
  }
  function vueFetes() {
    cadre({ titre: 'Dates des fêtes', retour: '#/reglages', nav: 'reglages' });
    var A = auj(), l = fetes().filter(function (fe) { return fe.date >= CT.ajouterJours(A, -30); }).slice(0, 6);
    vue('<form class="carte" data-form="fetes" novalidate><p>Dates approximatives : Tabaski et Korité dépendent de la lune (un jour d\'écart est possible). Corrigez-les si besoin.</p>' +
      l.map(function (fe, i) { return '<input type="hidden" name="cle-' + i + '" value="' + esc(fe.cle) + '"><input type="hidden" name="nom-' + i + '" value="' + esc(fe.nom) + '">' + champ(fe.nom + ' ' + fe.date.slice(0, 4), 'fe-' + i, fe.date, { type: 'date' }); }).join('') +
      '<button type="submit" class="btn large">Enregistrer</button><div class="boutons"><button type="button" class="btn sec" data-action="fetes-defaut">Remettre les dates proposées</button></div></form>');
  }
  function vueAide() {
    cadre({ titre: 'Aide', retour: '#/reglages', nav: 'reglages' });
    vue('<section class="carte"><h1>Bien prendre les mesures</h1><ul class="etapes">' +
      '<li>La personne se tient droite, pieds joints, bras le long du corps, sur un vêtement léger.</li>' +
      '<li>Le mètre ruban reste <b>bien droit</b> tout autour du corps, sans serrer : on doit pouvoir glisser un doigt.</li>' +
      '<li>Notez tout en <b>centimètres</b>. Les demi-centimètres sont acceptés (ex. : 96,5).</li>' +
      '<li>Pour les longueurs (boubou, robe, pantalon), demandez la longueur voulue : cheville, sol, genou…</li>' +
      '<li>Reprenez les mesures des enfants à chaque commande : ils grandissent vite.</li></ul>' +
      '<div class="dessin">' + CTFig.dessin('hanches', 'femme', 'Exemple : tour de hanches') + '</div><p class="petit discret" style="text-align:center">En jaune : le mètre devant ; en pointillés : le mètre dans le dos.</p></section>' +
      '<section class="carte"><h2>Questions fréquentes</h2>' +
      '<p><b>Mes fiches sont-elles envoyées sur Internet ?</b><br>Non. Tout reste sur ce téléphone. Faites une sauvegarde de temps en temps (Réglages, puis Sauvegarde).</p>' +
      '<p><b>Les messages partent-ils tout seuls ?</b><br>Jamais. Le bouton WhatsApp ouvre le message déjà écrit : vous le relisez et vous l\'envoyez vous-même, à un client à la fois.</p>' +
      '<p><b>Que permet le pass ?</b><br>La version gratuite garde ' + CT.LIMITE_CLIENTS + ' clients. Le pass 12 mois (' + F(CT.PASS.prix) + ') permet des clients illimités. À la fin du pass, rien n\'est bloqué : vos fiches restent utilisables.</p>' +
      '<p><b>Changement de téléphone ?</b><br>Faites une sauvegarde, envoyez le fichier sur le nouveau téléphone, puis « Restaurer ». Collez à nouveau le lien de votre commande pour le pass.</p></section>' +
      '<section class="carte"><h2>Installer l\'application</h2>' + aideInstallation() + '</section>');
  }

  // ---------- Pass ----------
  function vuePass(_, q) {
    cadre({ titre: 'Pass 12 mois', retour: '#/reglages', nav: 'reglages' });
    var P = S.pass, h = '<section class="carte" id="etat-pass">';
    if (P.actif) h += '<h1>Pass actif</h1><p>Clients illimités jusqu\'au <b>' + CT.dateFr(P.fin.slice(0, 10)) + '</b> (' + pluriel(P.joursRestants, 'jour') + ').</p>' +
      (P.rappel ? alerte('attention', '<p>Votre pass se termine bientôt. Renouvelez maintenant : les jours restants s\'ajoutent, rien n\'est perdu.</p>') + '<a class="btn or" href="' + esc(CT.urlProduit()) + '">Renouveler</a>' : '');
    else if (P.expire) h += '<h1>Pass terminé</h1><p>Votre pass a pris fin le ' + CT.dateFr(P.fin.slice(0, 10)) + '. Tous vos clients, mesures et commandes restent utilisables ; seul l\'ajout de nouveaux clients au-delà de ' + CT.LIMITE_CLIENTS + ' est en pause.</p><a class="btn or" href="' + esc(CT.urlProduit()) + '">Renouveler</a>';
    else h += '<h1>Version gratuite</h1><p>Vous utilisez <b>' + S.clients.length + ' / ' + CT.LIMITE_CLIENTS + ' clients</b>. Toutes les fonctions sont incluses : mesures guidées, commandes, planning, reçus PDF, WhatsApp.</p>';
    h += '</section>';
    h += '<section class="carte"><h2>Ce que permet le pass</h2><div class="offres"><div class="offre"><h3>Gratuit</h3><ul><li>' + CT.LIMITE_CLIENTS + ' clients</li><li>Toutes les fonctions</li></ul></div>' +
      '<div class="offre mise-en-avant"><h3>Pass 12 mois · ' + F(CT.PASS.prix) + '</h3><ul><li>Clients illimités pendant 12 mois</li><li>Payé une fois par Wave, sans abonnement automatique</li><li>À la fin, rien n\'est bloqué</li></ul>' +
      '<a class="btn or large" style="margin-top:10px" href="' + esc(CT.urlProduit()) + '" id="acheter-pass">' + ICO.etoile.replace('class="ico"', '') + 'Acheter le pass (' + F(CT.PASS.prix) + ')</a></div></div></section>';
    h += '<section class="carte"><form data-form="pass" novalidate><h2>Activer mon pass</h2><ol class="etapes"><li>Payez le pass par Wave sur la boutique.</li><li>Sur la page de votre commande payée, copiez le lien de la page.</li><li>Collez-le ici, puis touchez « Activer ». Internet est nécessaire une seule fois.</li></ol>' +
      champ('Lien de votre commande', 'code-pass', q && q.get('code') ? q.get('code') : '', { zone: true, lignes: 3, place: 'https://…/commande.html?o=TCV-…&t=…' }) +
      '<button type="submit" class="btn large" id="btn-activer">Activer</button><div id="msg-pass" aria-live="polite"></div></form></section>';
    if (S.passes.length) h += '<section class="carte"><h2>Pass activés sur ce téléphone</h2><ul>' + S.passes.map(function (p) {
      return '<li>Payé le ' + CT.dateFr(String(p.payeeLe).slice(0, 10)) + ' · commande ' + esc(String(p.id || '').replace(/^(TCV-....).*/, '$1••••')) + '</li>';
    }).join('') + '</ul><p class="petit discret">Sur un autre téléphone, collez le même lien de commande.</p></section>';
    vue(h);
    if (q && q.get('code') && q.get('auto') === '1') activerPass(q.get('code'));
  }
  function activerPass(texte) {
    var msg = $('#msg-pass');
    var dire = function (type, html) { if (msg) msg.innerHTML = alerte(type, html); };
    var c = CT.lireLienCommande(texte);
    if (!c) return dire('danger', '<p>Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « o=TCV- » et « t= »).</p>');
    dire('info', '<p>Vérification en cours…</p>');
    var ctrl = window.AbortController ? new AbortController() : null, minuterie = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    fetch(CT.urlVerification(c), { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }).then(function (r) {
      clearTimeout(minuterie);
      if (r.status === 404) return { commande: null };
      if (!r.ok) throw new Error('service');
      return r.json();
    }).then(function (j) {
      var a = CT.analyserReponse(j);
      if (a.ok) {
        S.passes = CT.ajouterPass(S.passes, a.pass);
        return DB.ecrire('passes', S.passes).then(function () {
          majPass(); history.replaceState(null, '', '#/pass'); S.route = '#/pass';
          vuePass(null, new URLSearchParams()); toast('Pass activé : clients illimités.');
        });
      }
      if (a.raison === 'impayee') dire('attention', '<p>Cette commande n\'est pas encore payée. Ouvrez la page de la commande, payez par Wave, puis réessayez.</p>');
      else if (a.raison === 'produit') dire('danger', '<p>Ce lien correspond à un autre achat' + (a.titre ? ' (« ' + esc(a.titre) + ' »)' : '') + '. Collez le lien de votre commande du pass Carnet du Tailleur.</p>');
      else if (a.raison === 'expiree') dire('attention', '<p>Ce pass a pris fin le ' + CT.dateFr(a.fin.slice(0, 10)) + '. Prenez un nouveau pass pour ajouter des clients sans limite.</p><p><a href="' + esc(CT.urlProduit()) + '">Renouveler</a></p>');
      else dire('danger', '<p>Commande introuvable. Vérifiez que vous avez collé le lien complet de la page de commande.</p>');
    }).catch(function () {
      clearTimeout(minuterie);
      dire('attention', '<p>Pas de connexion à Internet, ou service indisponible. Réessayez dans un moment : vos données ne sont pas touchées.</p>');
    });
  }

  // ---------- Sauvegarde ----------
  function vueSauvegarde() {
    cadre({ titre: 'Sauvegarde', retour: '#/reglages', nav: 'reglages' });
    var photos = S.clients.filter(function (c) { return c.photo; }).length + S.commandes.reduce(function (n, c) { return n + (c.photoModele ? 1 : 0) + (c.photoTissu ? 1 : 0); }, 0);
    vue('<section class="carte"><h1>Sauvegarder</h1><p>Un fichier avec tous vos clients, mesures, commandes, paiements et photos (' + pluriel(S.clients.length, 'client') + ', ' + pluriel(S.commandes.length, 'commande') + ', ' + pluriel(photos, 'photo') + ').</p>' +
      '<p class="petit discret">Gardez-le en lieu sûr (par exemple en l\'envoyant à vous-même sur WhatsApp ou par e-mail). Il ne contient pas votre pass.</p>' +
      '<button type="button" class="btn large" data-action="exporter">' + ICO.sauvegarde.replace('class="ico"', '') + 'Télécharger la sauvegarde</button>' +
      (S.sauvegardeLe ? '<p class="petit discret">Dernière sauvegarde : ' + CT.dateFr(S.sauvegardeLe.slice(0, 10)) + '</p>' : '') + '</section>' +
      '<section class="carte"><h2>Restaurer</h2><p>Remplace les données de ce téléphone par celles d\'un fichier de sauvegarde.</p><span class="btn sec large btn-fichier">Choisir le fichier<input type="file" accept="application/json,.json" id="f-import" aria-label="Fichier de sauvegarde"></span></section>' +
      '<section class="carte"><h2>Tout effacer</h2><p>Supprime tous les clients, mesures et commandes de ce téléphone. Votre pass est conservé.</p><button type="button" class="btn danger large" data-action="tout-effacer">' + ICO.poubelle + 'Tout effacer</button></section>');
  }
  function telecharger(blob, nom) {
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 30000);
  }
  function exporter() {
    var d = { application: 'carnet-tailleur', version: 1, exporteLe: new Date().toISOString(), clients: S.clients, releves: S.releves, commandes: S.commandes,
      kv: { atelier: S.atelier, reglages: S.reglages, compteurs: S.compteurs, accueilFait: true } };
    telecharger(new Blob([JSON.stringify(d)], { type: 'application/json' }), 'carnet-tailleur-sauvegarde-' + auj() + '.json');
    S.sauvegardeLe = new Date().toISOString();
    DB.ecrire('sauvegardeLe', S.sauvegardeLe).then(function () { toast('Sauvegarde téléchargée.'); if (S.route === '#/sauvegarde') vueSauvegarde(); });
  }
  function importer(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var d;
      try { d = JSON.parse(lecteur.result); } catch (e) { return toast('Fichier illisible.'); }
      var pb = CT.validerSauvegarde(d);
      if (pb) return toast(pb);
      confirmer('Restaurer la sauvegarde ?', 'Les données actuelles seront remplacées par celles du ' + esc(CT.dateFr(String(d.exporteLe || '').slice(0, 10))) + ' : ' + pluriel(d.clients.length, 'client') + ', ' + pluriel(d.commandes.length, 'commande') + '.', 'Restaurer', function () {
        DB.remplacer({ clients: d.clients, releves: d.releves, commandes: d.commandes, kv: d.kv || {} }, ['passes', 'sauvegardeLe']).then(charger).then(function () { toast('Sauvegarde restaurée.'); aller('#/'); });
      });
    };
    lecteur.readAsText(fichier);
  }

  // ---------- Formulaires ----------
  var FORMS = {
    bienvenue: function (form) {
      S.atelier = Object.assign({}, S.atelier, { nom: val(form, 'b-nom'), telephone: val(form, 'b-tel') });
      S.accueilFait = true;
      DB.lot([['kv', S.atelier, 'atelier'], ['kv', true, 'accueilFait']]).then(function () { vueAccueil(); toast('Bienvenue ! Ajoutez votre premier client.'); });
    },
    client: function (form) {
      var id = form.dataset.id, nouveau = id === 'nouveau';
      var nom = val(form, 'c-nom');
      if (!nom) return erreur('c-nom', 'Écrivez le nom du client.');
      if (nouveau && !CT.peutAjouterClient(S.clients.length, S.pass.actif)) return offreLimite();
      var c = nouveau ? { id: CT.nouvelId(), cree: Date.now() } : Object.assign({}, client(id));
      c.nom = nom; c.telephone = val(form, 'c-tel'); c.genre = val(form, 'genre') || 'homme'; c.note = val(form, 'c-note'); c.photo = S.photos.client || null; c.modifie = Date.now();
      DB.mettre('clients', c).then(function () {
        remplacer(S.clients, c);
        toast(nouveau ? 'Client enregistré.' : 'Fiche enregistrée.');
        location.hash = '#/client/' + c.id;
      }).catch(function (e) { toast(e.message || 'Enregistrement impossible.'); });
    },
    'assistant-modele': function (form) {
      S.saisie.modele = val(form, 'modele') || 'homme';
      S.saisie.i = 0;
      dessinerAssistant();
    },
    assistant: function () {
      var s = S.saisie, cles = CT.MODELES[s.modele].mesures, k = cles[s.i], brut = $('#valeur-mesure').value, v = CT.lireMesure(brut);
      if (brut.trim() && v === null) { var e = $('#err-mesure'); e.textContent = 'Écrivez un nombre en centimètres, ex. : 96 ou 96,5.'; e.hidden = false; return; }
      var pb = CT.verifierMesure(k, v);
      if (pb && s.confirme[k] !== v) {
        s.confirme[k] = v;
        var er = $('#err-mesure');
        er.textContent = 'Vérifiez : ' + CT.formatCm(v) + ' cm semble ' + (pb === 'grand' ? 'beaucoup' : 'peu') + ' pour « ' + CT.MESURES[k].nom.toLowerCase() + ' ». Touchez encore « Suivant » si c\'est juste.';
        er.hidden = false; return;
      }
      if (v === null) delete s.valeurs[k]; else s.valeurs[k] = v;
      s.i++;
      dessinerAssistant();
    },
    'assistant-fin': function (form) {
      var s = S.saisie;
      if (!Object.keys(s.valeurs).length) return;
      var r = { id: CT.nouvelId(), clientId: s.clientId, date: auj(), modele: s.modele, valeurs: s.valeurs, note: val(form, 'a-note'), libres: [], cree: Date.now() };
      DB.mettre('releves', r).then(function () {
        S.releves.push(r); S.saisie = null;
        toast('Mesures enregistrées.');
        location.hash = '#/client/' + r.clientId;
      });
    },
    releve: function (form) {
      var id = form.dataset.id, nouveau = id === 'nouveau', valeurs = {}, mauvais = null;
      $$('[data-mesure]', form).forEach(function (i) {
        if (!i.value.trim()) return;
        var v = CT.lireMesure(i.value);
        if (v === null) { mauvais = mauvais || i; return; }
        valeurs[i.dataset.mesure] = v;
      });
      if (mauvais) { mauvais.focus(); return toast('Une mesure n\'est pas un nombre : corrigez-la (ex. : 96,5).'); }
      var libres = $$('.libre', form).map(function (l) { return { nom: $('[data-libre-nom]', l).value.trim(), valeur: $('[data-libre-val]', l).value.trim() }; }).filter(function (m) { return m.nom && m.valeur; });
      if (!Object.keys(valeurs).length && !libres.length) return toast('Saisissez au moins une mesure.');
      var date = val(form, 'r-date');
      if (!CT.dateValide(date)) return erreur('r-date', 'Date invalide.');
      var r = nouveau ? { id: CT.nouvelId(), clientId: form.dataset.client, cree: Date.now() } : Object.assign({}, releve(id));
      r.date = date; r.modele = val(form, 'modele') || 'homme'; r.valeurs = valeurs; r.libres = libres; r.note = val(form, 'r-note');
      DB.mettre('releves', r).then(function () { remplacer(S.releves, r); toast('Mesures enregistrées.'); location.hash = '#/client/' + r.clientId; });
    },
    commande: function (form) {
      effacerErreurs(form);
      var id = form.dataset.id, nouveau = id === 'nouveau';
      var clientId = val(form, 'o-client'), prix = CT.lireEntier(val(form, 'o-prix')), livraison = val(form, 'o-livraison'), essayage = val(form, 'o-essayage');
      var acompte = nouveau ? CT.lireEntier(val(form, 'o-acompte')) : 0;
      if (!client(clientId)) return erreur('o-client', 'Choisissez le client.');
      if (!(prix > 0)) return erreur('o-prix', 'Indiquez le prix convenu.');
      if (!CT.dateValide(livraison)) return erreur('o-livraison', 'Choisissez la date de livraison.');
      if (essayage && !CT.dateValide(essayage)) return erreur('o-essayage', 'Date d\'essayage invalide.');
      if (essayage && essayage > livraison) return erreur('o-essayage', 'L\'essayage doit être avant la livraison.');
      if (acompte > prix) return erreur('o-acompte', 'L\'acompte dépasse le prix.');
      if (!nouveau) {
        var paye = CT.totalPaye(commande(id));
        if (prix < paye) return erreur('o-prix', 'Le client a déjà payé ' + F(paye) + ' : le prix ne peut pas être plus petit.');
      }
      var c = nouveau ? { id: CT.nouvelId(), numero: prochainNumero('commande'), date: auj(), statut: 'recu', historique: [{ statut: 'recu', date: auj() }], paiements: [], cree: Date.now() } : Object.assign({}, commande(id));
      var rel = CT.relevesClient(S.releves, clientId)[0];
      c.clientId = clientId; c.habit = val(form, 'o-habit'); c.modele = val(form, 'o-modele'); c.pieces = Math.max(1, CT.lireEntier(val(form, 'o-pieces')) || 1);
      c.tissuFourni = val(form, 'tissu') || 'client'; c.quantiteTissu = CT.lireMesure(val(form, 'o-qte')); c.uniteTissu = val(form, 'o-unite') || 'm';
      c.prix = prix; c.dateEssayage = essayage; c.dateLivraison = livraison; c.occasion = val(form, 'o-occasion'); c.note = val(form, 'o-note');
      c.photoModele = S.photos.modele || null; c.photoTissu = S.photos.tissu || null; c.modifie = Date.now();
      if (nouveau && rel) c.releveId = rel.id;
      var suite = acompte > 0 ? ajouterPaiement(c, acompte, val(form, 'o-mode'), auj()) : enregistrerCommande(c).then(function () { return null; });
      suite.then(function (p) {
        if (p) S.apresRoute = function () { proposerRecu(c, p); };
        else toast(nouveau ? 'Commande enregistrée.' : 'Commande modifiée.');
        aller('#/commande/' + c.id);
      }).catch(function (e) { toast(e.message || 'Enregistrement impossible.'); });
    },
    encaisser: function (form) {
      var c = commande(form.dataset.id), t = CT.totauxCommande(c), m = CT.lireEntier(val(form, 'p-montant')), d = val(form, 'p-date');
      effacerErreurs(form);
      if (!(m > 0)) return erreur('p-montant', 'Indiquez le montant reçu.');
      if (m > t.reste) return erreur('p-montant', 'Le reste à payer est de ' + F(t.reste) + '.');
      if (!CT.dateValide(d)) return erreur('p-date', 'Date invalide.');
      ajouterPaiement(c, m, val(form, 'p-mode'), d).then(function (p) { vueCommande(c.id); proposerRecu(c, p); });
    },
    atelier: function (form) {
      S.atelier = Object.assign({}, S.atelier, { nom: val(form, 'a-nom'), telephone: val(form, 'a-tel'), adresse: val(form, 'a-adresse') });
      S.reglages = Object.assign({}, S.reglages, { capacite: Math.max(1, CT.lireEntier(val(form, 'a-capacite')) || 10) });
      S.accueilFait = true;
      DB.lot([['kv', S.atelier, 'atelier'], ['kv', S.reglages, 'reglages'], ['kv', true, 'accueilFait']]).then(function () { toast('Atelier enregistré.'); location.hash = '#/reglages'; });
    },
    fetes: function (form) {
      var base = fetes().map(function (fe) { return Object.assign({}, fe); });
      for (var i = 0; form.elements['cle-' + i]; i++) {
        var cle = form.elements['cle-' + i].value, d = val(form, 'fe-' + i);
        if (!CT.dateValide(d)) return erreur('fe-' + i, 'Date invalide.');
        base.forEach(function (fe) { if (fe.cle === cle) fe.date = d; });
      }
      S.reglages = Object.assign({}, S.reglages, { fetes: base });
      DB.ecrire('reglages', S.reglages).then(function () { toast('Dates enregistrées.'); location.hash = '#/reglages'; });
    },
    pass: function (form) { activerPass(val(form, 'code-pass')); }
  };

  // ---------- Actions ----------
  var occupe = false;
  function partagerPDF(fabrique, texte, tel) {
    if (occupe) return;
    occupe = true;
    toast('Préparation du PDF…');
    fabrique().then(function (r) {
      occupe = false;
      var fichier = null;
      try { fichier = new File([r.blob], r.nom, { type: 'application/pdf' }); } catch (e) { fichier = null; }
      var peut = false;
      try { peut = !!(fichier && navigator.canShare && navigator.share && navigator.canShare({ files: [fichier] })); } catch (e) { peut = false; }
      if (peut) {
        cacherToast();
        return navigator.share({ files: [fichier], title: r.nom, text: texte }).catch(function (e) { if (!e || e.name !== 'AbortError') telecharger(r.blob, r.nom); });
      }
      telecharger(r.blob, r.nom);
      cacherToast();
      feuille('Envoyer le PDF', '<p>Le PDF <b>' + esc(r.nom) + '</b> est enregistré dans vos téléchargements.</p><ol class="etapes"><li>Ouvrez WhatsApp avec le bouton ci-dessous et choisissez le client.</li>' +
        '<li>Joignez le fichier : trombone, puis « Document », puis <b>' + esc(r.nom) + '</b>.</li></ol><a class="btn wa large" target="_blank" rel="noopener" id="wa-pdf" href="' + esc(CT.lienWhatsApp(tel, texte)) + '">' + ICO.wa + 'Ouvrir WhatsApp</a>' +
        '<button type="button" class="btn sec large" style="margin-top:10px" data-fermer>Fermer</button>');
    }).catch(function (e) { occupe = false; toast(e.message || 'Le PDF n\'a pas pu être créé.'); });
  }
  function commandeCourante() { var m = S.route.match(/^#\/commande\/([\w-]+)/); return m ? commande(m[1]) : null; }
  function marquer(id, champNom) {
    var c = commande(id);
    if (!c) return;
    c[champNom] = auj();
    enregistrerCommande(c).then(function () { setTimeout(router, 400); });
  }
  var ACTIONS = {
    'fermer-bandeau': function (el) { S.fermes[el.dataset.cle] = 1; bandeaux(); },
    'choisir-client-mesures': function () {
      if (!S.clients.length) return aller('#/client-modifier/nouveau');
      feuille('Mesurer quel client ?', '<div class="recherche">' + ICO.loupe + '<input type="search" id="q-feuille" placeholder="Chercher un nom" aria-label="Chercher un client"></div><ul class="liste" id="liste-feuille"></ul>' +
        '<a class="btn sec large" href="#/client-modifier/nouveau">' + ICO.plus + 'Nouveau client</a>', function (el) {
        var lister = function () {
          var t = CT.sansAccents(el.querySelector('#q-feuille').value);
          el.querySelector('#liste-feuille').innerHTML = trierNoms(S.clients).filter(function (c) { return !t || CT.sansAccents(c.nom).indexOf(t) >= 0; }).slice(0, 30).map(function (c) {
            return '<li><a class="ligne" href="#/mesures/' + esc(c.id) + '/guidees">' + avatar(c) + '<span class="ligne-corps"><strong>' + esc(c.nom) + '</strong></span>' + ICO.chevron + '</a></li>';
          }).join('');
        };
        el.querySelector('#q-feuille').addEventListener('input', lister); lister();
      });
    },
    'retirer-photo': function (el) {
      S.photos[el.dataset.cle] = null;
      var z = $('#apercu-' + el.dataset.cle); if (z) z.innerHTML = ICO.photo;
      el.remove();
    },
    'client-suppr': function (el) {
      var c = client(el.dataset.id), n = commandesClient(c.id).length;
      confirmer('Supprimer ' + c.nom + ' ?', 'Sa fiche, ses mesures et ' + pluriel(n, 'commande') + ' seront supprimées de ce téléphone.', 'Supprimer', function () {
        var ops = [['-', 'clients', c.id]];
        S.releves.filter(function (r) { return r.clientId === c.id; }).forEach(function (r) { ops.push(['-', 'releves', r.id]); });
        commandesClient(c.id).forEach(function (x) { ops.push(['-', 'commandes', x.id]); });
        DB.lot(ops).then(function () {
          S.clients = S.clients.filter(function (x) { return x.id !== c.id; });
          S.releves = S.releves.filter(function (x) { return x.clientId !== c.id; });
          S.commandes = S.commandes.filter(function (x) { return x.clientId !== c.id; });
          toast('Client supprimé.'); location.hash = '#/clients';
        });
      }, true);
    },
    'ajuster': function (el) {
      var i = $('#valeur-mesure'), v = CT.lireMesure(i.value) || 0, n = Math.max(0, v + parseFloat(el.dataset.pas));
      i.value = n ? CT.formatCm(n) : ''; i.focus();
    },
    'reprendre': function (el) { var i = $('#valeur-mesure'); i.value = CT.formatCm(parseFloat(el.dataset.v)); i.focus(); },
    'assistant-prec': function () { if (S.saisie.i > -1) S.saisie.i--; dessinerAssistant(); },
    'assistant-passer': function () { var k = CT.MODELES[S.saisie.modele].mesures[S.saisie.i]; delete S.saisie.valeurs[k]; S.saisie.i++; dessinerAssistant(); },
    'aller-mesure': function (el) { S.saisie.i = parseInt(el.dataset.i, 10); dessinerAssistant(); },
    'ajouter-libre': function () { var z = $('#libres'), n = $$('.libre', z).length; z.insertAdjacentHTML('beforeend', ligneLibre({ nom: '', valeur: '' }, n)); $('#l-nom-' + n).focus(); },
    'releve-suppr': function (el) {
      var r = releve(el.dataset.id);
      confirmer('Supprimer ces mesures ?', 'Les mesures du ' + CT.dateFr(r.date) + ' seront supprimées.', 'Supprimer', function () {
        DB.lot([['-', 'releves', r.id]]).then(function () { S.releves = S.releves.filter(function (x) { return x.id !== r.id; }); toast('Mesures supprimées.'); location.hash = '#/client/' + r.clientId; });
      }, true);
    },
    'fiche-pdf': function (el) {
      var r = releve(el.dataset.id), c = client(r.clientId);
      partagerPDF(function () { return CTPdf.fiche(c, r, S.atelier); }, 'Mesures de ' + c.nom + ' (' + CT.dateFr(r.date) + ')', c.telephone);
    },
    statut: function (el) { var c = commandeCourante(); if (c) demanderStatut(c, el.dataset.statut); },
    encaisser: function () {
      var c = commandeCourante(), t = CT.totauxCommande(c);
      feuille('Encaisser un paiement', '<form data-form="encaisser" data-id="' + esc(c.id) + '" novalidate><p>Reste à payer : <b class="reste nb">' + F(t.reste) + '</b></p>' +
        montantChamp('Montant reçu', 'p-montant', t.reste, { requis: true }) +
        '<div class="grille2">' + champ('Payé par', 'p-mode', 'Espèces', { options: ['Espèces', 'Wave', 'Orange Money', 'Autre'] }) + champ('Date', 'p-date', auj(), { type: 'date' }) + '</div>' +
        '<button type="submit" class="btn large">' + ICO.ok + 'Enregistrer le paiement</button></form>');
    },
    'recu-pdf': function (el) {
      var c = el.dataset.c ? commande(el.dataset.c) : commandeCourante(), cl = client(c.clientId), pid = el.dataset.p;
      partagerPDF(function () { return CTPdf.recu(c, cl, S.atelier, pid); }, CT.messageRecu(c, cl, S.atelier, pid), cl && cl.telephone);
    },
    'paiement-suppr': function (el) {
      var c = commandeCourante(), p = (c.paiements || []).filter(function (x) { return x.id === el.dataset.p; })[0];
      confirmer('Supprimer ce paiement ?', F(p.montant) + ' du ' + CT.dateFr(p.date) + ' (reçu ' + esc(p.recu) + '). À faire seulement en cas d\'erreur de saisie.', 'Supprimer', function () {
        c.paiements = c.paiements.filter(function (x) { return x.id !== p.id; });
        enregistrerCommande(c).then(function () { vueCommande(c.id); toast('Paiement supprimé.'); });
      }, true);
    },
    'commande-suppr': function () {
      var c = commandeCourante();
      confirmer('Supprimer la commande ?', 'La commande ' + esc(c.numero) + ' et ses paiements seront supprimés de ce téléphone.', 'Supprimer', function () {
        DB.lot([['-', 'commandes', c.id]]).then(function () { S.commandes = S.commandes.filter(function (x) { return x.id !== c.id; }); toast('Commande supprimée.'); location.hash = '#/commandes'; });
      }, true);
    },
    'voir-photo': function (el) {
      var c = commandeCourante();
      feuille(el.dataset.cle === 'photoModele' ? 'Photo du modèle' : 'Photo du tissu', '<img class="photo-grande" src="' + esc(c[el.dataset.cle]) + '" alt="">');
    },
    prevenu: function (el) { marquer(el.dataset.id, 'prevenuLe'); },
    'rappel-essayage': function (el) { marquer(el.dataset.id, 'rappelEssayageLe'); },
    'fetes-defaut': function () {
      S.reglages = Object.assign({}, S.reglages, { fetes: null });
      DB.ecrire('reglages', S.reglages).then(function () { toast('Dates proposées remises.'); vueFetes(); });
    },
    exporter: exporter,
    'tout-effacer': function () {
      confirmer('Tout effacer ?', 'Tous les clients, mesures, commandes et réglages de ce téléphone seront supprimés. Faites d\'abord une sauvegarde si besoin.', 'Tout effacer', function () {
        DB.remplacer({ clients: [], releves: [], commandes: [], kv: { atelier: {}, reglages: { capacite: 10, fetes: null }, compteurs: { commande: {}, recu: {} }, accueilFait: false } }, ['passes']).then(charger).then(function () { toast('Données effacées.'); aller('#/'); });
      }, true);
    },
    installer: function () {
      if (invite) {
        invite.prompt();
        var p = invite.userChoice;
        invite = null; majInstall();
        if (p && p.then) p.then(function () { majInstall(); });
        return;
      }
      feuille('Installer l\'application', aideInstallation());
    }
  };

  function brancher() {
    document.addEventListener('click', function (e) {
      var f = e.target.closest('[data-fermer]');
      if (f) { fermerFeuille(); return; }
      if (e.target.id === 'feuille') { fermerFeuille(); return; }
      var nav = e.target.closest('[data-fermer-nav]');
      if (nav) fermerFeuille(true);
      var a = e.target.closest('[data-action]');
      if (a && ACTIONS[a.dataset.action]) {
        if (a.tagName === 'BUTTON') e.preventDefault();
        ACTIONS[a.dataset.action](a, e);
      }
    });
    document.addEventListener('submit', function (e) {
      var form = e.target.closest('form[data-form]');
      if (!form) return;
      e.preventDefault();
      if (FORMS[form.dataset.form]) FORMS[form.dataset.form](form);
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el.dataset && el.dataset.photo) {
        var cle = el.dataset.photo, fichier = el.files && el.files[0];
        if (!fichier) return;
        lireImage(fichier, cle === 'client' ? 360 : 900, 0.72).then(function (src) {
          S.photos[cle] = src;
          var z = $('#apercu-' + cle); if (z) z.innerHTML = '<img src="' + src + '" alt="">';
          toast('Photo ajoutée.');
        }).catch(function (er) { toast(er.message); });
        return;
      }
      if (el.id === 'f-import' && el.files && el.files[0]) { importer(el.files[0]); el.value = ''; return; }
      if (el.name === 'modele' && el.closest('form[data-form=releve]')) {
        var form = el.closest('form'), valeurs = {};
        $$('[data-mesure]', form).forEach(function (i) { var v = CT.lireMesure(i.value); if (v !== null) valeurs[i.dataset.mesure] = v; });
        $('#lignes-mesures').innerHTML = lignesMesures(el.value, valeurs);
        return;
      }
      if (el.closest && el.closest('form[data-form=commande]') && (el.id === 'o-livraison' || el.id === 'o-pieces')) majAlerteCharge();
      if (el.name === 'modele' && el.closest('form[data-form=assistant-modele]')) {
        S.saisie.modele = el.value;
        var b = $('#commencer'); if (b) b.lastChild.textContent = 'Commencer (' + CT.MODELES[el.value].mesures.length + ' mesures)';
      }
    });
    document.addEventListener('pointerdown', function (e) {
      var t = $('#toast');
      if (!t.hidden && !t.querySelector('button') && !t.contains(e.target)) cacherToast();
    });
    document.addEventListener('input', function (e) {
      var ch = e.target.closest && e.target.closest('.champ-erreur');
      if (ch) { ch.classList.remove('champ-erreur'); var er = ch.querySelector('.erreur'); if (er) er.hidden = true; }
      if (e.target.id === 'o-pieces' || e.target.id === 'o-livraison') majAlerteCharge();
      if (e.target.id === 'valeur-mesure') { var er = $('#err-mesure'); if (er) er.hidden = true; }
    });
    document.addEventListener('focusout', function (e) {
      var el = e.target;
      if (el.hasAttribute && el.hasAttribute('data-montant') && el.value.trim()) el.value = CT.formatNombre(CT.lireEntier(el.value));
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#feuille').hidden) fermerFeuille(); });
    $('#retour').addEventListener('click', function () { var c = this.dataset.cible; if (c) location.hash = c; });
    $('#installer').addEventListener('click', function () { ACTIONS.installer(); });
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
    appliquerTheme(lireTheme());
    brancher();
    majInstall();
    // Lien d'activation direct : ?o=TCV-…&t=… (depuis la page de commande)
    var p = new URLSearchParams(location.search);
    if (p.get('o') && p.get('t')) {
      var code = '?o=' + p.get('o') + '&t=' + p.get('t');
      history.replaceState(null, '', location.pathname + '#/pass?auto=1&code=' + encodeURIComponent(code));
    }
    charger().then(function () { router(); }).catch(function (e) {
      vue('<section class="carte"><h1>Stockage indisponible</h1><p>' + esc(e && e.message || e) + '</p><p>Sur iPhone, quittez la navigation privée. Sinon, mettez à jour votre navigateur.</p></section>');
    });
    serviceWorker();
  }
  window.CTApp = { etat: S, version: VERSION };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
