/* Calcul Chantier — interface (projet, éléments, budget par étape, prix, épargne, devis PDF, pass, sauvegarde).
   Tout reste sur le téléphone ; seule la vérification du pass passe par Internet, une fois. */
(function () {
  'use strict';
  var VERSION = '1.0.0';
  var S = { projets: [], elements: [], depenses: [], courant: null, passes: [], pass: CC.etatPass([]), sauvegardeLe: null, fermes: {}, route: '', apresRoute: null };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var F = function (n) { return CC.f(n); };
  function pluriel(n, mot, pl) { return CC.formatNombre(n) + ' ' + (n > 1 ? (pl || mot + 's') : mot); }
  function moisCourant() { return CC.dateISO().slice(0, 7); }

  function ico(d, cls) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"' + (cls ? ' class="' + cls + '"' : '') + '>' + d + '</svg>'; }
  var ICO = {
    plus: ico('<path d="M12 5v14M5 12h14"/>'),
    pdf: ico('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    wa: ico('<path d="M4 20l1.3-4A8 8 0 1 1 8.4 19z"/><path d="M9.5 9.2c.2 1.9 2.4 4.3 4.6 4.8l1-1.1 1.6.8c-.2 1-1 1.6-2 1.6-3 0-6.4-3.4-6.4-6.4 0-1 .6-1.8 1.6-2l.8 1.6z"/>'),
    ok: ico('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    alerte: ico('<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5v.5"/>'),
    info: ico('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
    chevron: ico('<path d="M9 6l6 6-6 6"/>', 'chevron'),
    crayon: ico('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    poubelle: ico('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    prix: ico('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>', 'ico'),
    etoile: ico('<path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z"/>', 'ico'),
    sauvegarde: ico('<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/>', 'ico'),
    livre: ico('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7M8 11h7"/>', 'ico'),
    maison: ico('<path d="M3 21V10l9-7 9 7v11"/><path d="M9 21v-6h6v6"/>', 'ico'),
    tirelire: ico('<path d="M4 11c0-3.3 3.6-6 8-6s8 2.7 8 6c0 2-1.2 3.7-3 4.8V19h-3v-2h-4v2H7v-3.2C5.2 14.7 4 13 4 11z"/>', 'ico'),
    installer: ico('<path d="M12 3v11m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="4" rx="1"/>', 'ico'),
    fermer: ico('<path d="M6 6l12 12M18 6 6 18"/>'),
    calcul: ico('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18.5h6"/>'),
    briques: ico('<rect x="3" y="4" width="8" height="5" rx="1"/><rect x="13" y="4" width="8" height="5" rx="1"/><rect x="8" y="11" width="8" height="5" rx="1"/><path d="M3 20h18"/>')
  };
  function avertissement() { return '<div class="avertissement" role="note">' + ICO.alerte + '<p style="margin:0"><b>' + esc(CC.AVERTISSEMENT) + '</b></p></div>'; }

  // ---------- Données ----------
  function charger() {
    return Promise.all([DB.tout('projets'), DB.tout('elements'), DB.tout('depenses'), DB.lire('courant'), DB.lire('passes'), DB.lire('sauvegardeLe')]).then(function (r) {
      S.projets = (r[0] || []).sort(function (a, b) { return (a.cree || 0) - (b.cree || 0); }); S.elements = r[1] || []; S.depenses = r[2] || [];
      S.courant = r[3] || null; S.passes = Array.isArray(r[4]) ? r[4] : []; S.sauvegardeLe = r[5] || null;
      if (!projet() && S.projets.length) S.courant = S.projets[0].id;
      majPass();
    });
  }
  function majPass() {
    S.pass = CC.etatPass(S.passes);
    var b = $('#badge-pass');
    if (b) {
      b.textContent = S.pass.actif ? 'Pass actif' : 'Gratuit';
      b.className = 'badge-pass' + (S.pass.actif ? ' actif' : '');
      b.setAttribute('aria-label', S.pass.actif ? 'Pass actif, ' + S.pass.joursRestants + ' jours restants' : 'Version gratuite : voir le pass');
    }
  }
  function projet() { for (var i = 0; i < S.projets.length; i++) if (S.projets[i].id === S.courant) return S.projets[i]; return null; }
  function element(id) { for (var i = 0; i < S.elements.length; i++) if (S.elements[i].id === id) return S.elements[i]; return null; }
  function elementsProjet(p) { p = p || projet(); return p ? S.elements.filter(function (e) { return e.projetId === p.id; }).sort(function (a, b) { return (a.cree || 0) - (b.cree || 0); }) : []; }
  function depensesProjet(p) { p = p || projet(); return p ? S.depenses.filter(function (d) { return d.projetId === p.id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }) : []; }
  function remplacer(liste, obj) { for (var i = 0; i < liste.length; i++) if (liste[i].id === obj.id) { liste[i] = obj; return; } liste.push(obj); }
  function nouveauProjet(nom, lieu) {
    return { id: CC.nouvelId(), nom: nom || 'Ma maison', lieu: lieu || '', marge: 10, prix: Object.assign({}, CC.PRIX_DEFAUT), prixVerifies: false, epargne: { deja: 0, mensuel: 0 }, terminees: {}, cree: Date.now() };
  }
  function budgetCourant() { var p = projet(); return CC.budget(p, elementsProjet(p)); }
  function planCourant(b) { var p = projet(); return CC.plan(b || budgetCourant(), depensesProjet(p), p.terminees, p.epargne.deja, p.epargne.mensuel, moisCourant()); }

  // ---------- Cadre, messages, feuilles ----------
  function cadre(o) {
    $('#titre').textContent = o.titre;
    document.title = o.titre === 'Calcul Chantier' ? 'Calcul Chantier' : o.titre + ' · Calcul Chantier';
    var r = $('#retour'); r.hidden = !o.retour; r.dataset.cible = o.retour || '';
    $$('#nav a').forEach(function (a) { if (a.dataset.nav === o.nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    bandeaux();
  }
  function vue(html) { $('#vue').innerHTML = html; }
  function bandeaux() {
    var b = [], P = S.pass;
    if (DB.temporaire) b.push('<div class="bandeau"><p><b>Attention :</b> ce navigateur ne garde pas les données (navigation privée ?). Elles seront perdues à la fermeture.</p></div>');
    if (P.rappel && !S.fermes.rappel) b.push('<div class="bandeau"><p>Votre pass se termine dans <b>' + pluriel(P.joursRestants, 'jour') + '</b> (le ' + CC.dateFr(P.fin.slice(0, 10)) + ').</p><a class="btn or petit" href="' + esc(CC.urlProduit()) + '">Renouveler</a><button type="button" class="icone-btn" data-action="fermer-bandeau" data-cle="rappel" aria-label="Fermer">' + ICO.fermer + '</button></div>');
    if (P.expire && !S.fermes.expire) b.push('<div class="bandeau"><p>Votre pass a pris fin le ' + CC.dateFr(P.fin.slice(0, 10)) + '. Vos projets restent consultables et modifiables.</p><a class="btn or petit" href="' + esc(CC.urlProduit()) + '">Renouveler</a><button type="button" class="icone-btn" data-action="fermer-bandeau" data-cle="expire" aria-label="Fermer">' + ICO.fermer + '</button></div>');
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
      (o.place ? ' placeholder="' + esc(o.place) + '"' : '') + ' autocomplete="off"' + (o.data || '');
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
    return champ(etiquette, id, valeur || valeur === 0 ? CC.formatNombre(valeur) : '', { mode: 'numeric', suffixe: o.suffixe || 'F', place: '0', aide: o.aide, data: ' data-montant' });
  }
  function erreur(id, msg) {
    var e = $('#err-' + id), c = $('#champ-' + id);
    if (e) { e.textContent = msg; e.hidden = false; }
    if (c) c.classList.add('champ-erreur');
    var i = $('#' + id); if (i) i.focus();
    return false;
  }
  function val(form, nom) { var el = form.elements[nom]; if (!el) return ''; if (el.length && !el.tagName) { for (var i = 0; i < el.length; i++) if (el[i].checked) return el[i].value; return ''; } return String(el.value || '').trim(); }

  // ---------- Routeur ----------
  var ROUTES = [
    [/^#\/?$/, vueAccueil],
    [/^#\/elements$/, vueElements],
    [/^#\/element\/nouveau$/, vueChoixType],
    [/^#\/element\/nouveau\/(\w+)$/, function (t) { vueElementForm(null, t); }],
    [/^#\/element\/([\w-]+)$/, function (id) { vueElementForm(id); }],
    [/^#\/budget$/, vueBudget],
    [/^#\/prix$/, vuePrix],
    [/^#\/epargne$/, vueEpargne],
    [/^#\/projets$/, vueProjets],
    [/^#\/projet-modifier\/([\w-]+)$/, vueProjetForm],
    [/^#\/hypotheses$/, vueHypotheses],
    [/^#\/reglages$/, vueReglages],
    [/^#\/sauvegarde$/, vueSauvegarde],
    [/^#\/pass$/, vuePass]
  ];
  var SANS_PROJET = /^#\/(projet-modifier\/nouveau|reglages|sauvegarde|pass|hypotheses|projets)/;
  function router() {
    var h = location.hash || '#/', parts = h.split('?'), chemin = parts[0], q = new URLSearchParams(parts[1] || '');
    var nouvelle = chemin !== S.route.split('?')[0];
    S.route = h;
    fermerFeuille(true);
    if (!projet() && !SANS_PROJET.test(chemin) && chemin !== '#/' && chemin !== '#') { location.replace('#/'); return; }
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

  // ---------- Accueil (projet courant) ----------
  function vueAccueil() {
    cadre({ titre: 'Calcul Chantier', nav: 'accueil' });
    var p = projet();
    if (!p) return vueBienvenue();
    var b = budgetCourant(), els = elementsProjet(p), pl = planCourant(b), dep = 0;
    depensesProjet(p).forEach(function (d) { dep += CC.entier(d.montant); });
    var h = '';
    if (S.projets.length > 1) h += '<div class="projet-choix"><label for="choix-projet" class="discret petit">Projet</label><select id="choix-projet">' +
      S.projets.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.nom) + '</option>'; }).join('') + '</select></div>';
    h += '<div class="salut"><h1 id="nom-projet">' + esc(p.nom) + '</h1><p class="discret">' + (p.lieu ? esc(p.lieu) + ' · ' : '') + pluriel(els.length, 'élément') + ' · marge de pertes ' + CC.formatDecimal(p.marge, 1) + ' %</p></div>';
    h += avertissement();
    var fin = pl.length && pl[pl.length - 1];
    h += '<div class="kpis"><a class="kpi fort" href="#/budget" id="kpi-total"><small>Budget matériaux</small><strong class="nb">' + F(b.total) + '</strong><span>Voir le détail</span></a>' +
      '<a class="kpi" href="#/epargne" id="kpi-plan"><small>Tout finançable</small><strong>' + (!fin ? '—' : fin.mois === 0 ? 'Maintenant' : fin.quand ? esc(CC.moisFr(fin.quand)) : '—') + '</strong><span>' +
      (CC.entier(p.epargne.mensuel) ? F(p.epargne.mensuel) + ' / mois' : 'Réglez votre épargne') + '</span></a>' +
      '<a class="kpi" href="#/epargne" id="kpi-depense"><small>Déjà dépensé</small><strong class="nb">' + F(dep) + '</strong><span>' + (b.total ? Math.round(dep * 100 / b.total) + ' % du budget' : 'Suivi des dépenses') + '</span></a>' +
      '<a class="kpi" href="#/elements"><small>Éléments calculés</small><strong class="nb">' + els.length + '</strong><span>' + (S.pass.actif ? 'Pass actif' : els.length + ' / ' + CC.LIMITE_ELEMENTS + ' (gratuit)') + '</span></a></div>';
    if (!p.prixVerifies) h += alerte('attention', '<p><b>Prix d\'exemple.</b> Remplacez-les par les prix de votre quincaillerie pour un budget juste. <a href="#/prix">Mettre mes prix</a></p>');
    h += '<div class="grille-actions"><a class="action-tuile principale" href="#/element/nouveau" id="ajouter-element">' + ICO.plus + 'Ajouter un élément</a>' +
      '<button type="button" class="action-tuile" data-action="devis-pdf">' + ICO.pdf + 'Devis PDF</button>' +
      '<a class="action-tuile" target="_blank" rel="noopener" id="wa-resume" href="' + esc('https://wa.me/?text=' + encodeURIComponent(CC.messageDevis(p, b))) + '">' + ICO.wa + 'Résumé WhatsApp</a>' +
      '<a class="action-tuile" href="#/prix">' + ICO.prix.replace('class="ico"', '') + 'Prix et marge</a></div>';
    h += '<section class="carte"><div class="carte-titre"><h2>Budget par étape</h2><a href="#/budget" class="petit">Détail</a></div>';
    var avec = b.etapes.filter(function (e) { return e.total > 0; });
    if (!avec.length) h += '<p class="discret">Ajoutez un premier élément (fondations, murs, dalle…) : l\'application calcule les matériaux et leur prix.</p><a class="btn large" href="#/element/nouveau">' + ICO.plus + 'Ajouter un élément</a>';
    avec.forEach(function (e) {
      var pct = b.total ? Math.round(e.total * 100 / b.total) : 0;
      h += '<a class="barre-etape" href="#/budget"><span><b>' + esc(e.nom) + '</b> <small class="discret">(' + pluriel(e.elements.length, 'élément') + ')</small></span><strong class="nb">' + F(e.total) + '</strong>' +
        '<div class="jauge" role="img" aria-label="' + pct + ' % du budget"><span class="brand" style="width:' + pct + '%"></span></div></a>';
    });
    h += '</section>';
    h += '<p class="pied-app"><a href="#/hypotheses">Dosages et hypothèses utilisés</a> · <a href="#/projets">' + (S.projets.length > 1 ? 'Mes projets' : 'Projets') + '</a></p>';
    vue(h);
  }
  function vueBienvenue() {
    vue('<section class="carte"><div style="max-width:300px;margin:0 auto">' + CCSchema.dessin('mur', {}, 'Mur en parpaings') + '</div>' +
      '<h1>Construisez votre maison étape par étape</h1><p>Tapez les dimensions : l\'application calcule le ciment, le sable, le gravier, le fer, les parpaings… puis le budget de chaque étape et la date où vous pourrez la payer.</p>' +
      avertissement() +
      '<form data-form="projet" data-id="nouveau" novalidate>' + champ('Nom du projet', 'p-nom', '', { place: 'Ex. : Maison de Keur Massar' }) +
      champ('Lieu (facultatif)', 'p-lieu', '', { place: 'Ex. : Keur Massar, Dakar' }) +
      '<button type="submit" class="btn large">Commencer</button></form><p class="petit discret">Tout reste sur ce téléphone. Rien n\'est envoyé sur Internet.</p></section>');
  }

  // ---------- Éléments ----------
  function vueElements() {
    cadre({ titre: 'Éléments', nav: 'elements' });
    var p = projet(), els = elementsProjet(p);
    var h = '<div class="carte-titre"><h1 style="margin:0">Éléments <span class="discret">(' + els.length + ')</span></h1><a class="btn petit" href="#/element/nouveau" id="btn-ajouter">' + ICO.plus + 'Ajouter</a></div>';
    if (!S.pass.actif) h += '<p class="petit discret">Version gratuite : ' + S.elements.length + ' / ' + CC.LIMITE_ELEMENTS + ' éléments. <a href="#/pass">Illimité avec le pass</a></p>';
    h += avertissement();
    if (!els.length) return vue(h + '<div class="carte vide">' + ICO.briques + '<p>Aucun élément pour l\'instant.</p><a class="btn" href="#/element/nouveau">' + ICO.plus + 'Ajouter un élément</a></div>');
    CC.ETAPES.forEach(function (e, i) {
      var l = els.filter(function (x) { return x.etape === e.cle; });
      if (!l.length) return;
      h += '<h2 class="section-titre">' + (i + 1) + '. ' + esc(e.nom) + '</h2><div class="carte" style="padding:4px 14px"><ul class="liste">' + l.map(function (x) {
        var c = CC.coutElement(x, p);
        return '<li><a class="ligne" href="#/element/' + esc(x.id) + '"><span style="width:64px;flex-shrink:0">' + CCSchema.dessin(x.type, x.dims, CC.TYPES[x.type].nom) + '</span><span class="ligne-corps"><strong>' + esc(x.nom) +
          '</strong><small>' + esc(CC.resumeDims(x)) + '</small></span><span class="ligne-fin"><strong class="nb">' + F(c.total) + '</strong></span></a></li>';
      }).join('') + '</ul></div>';
    });
    vue(h);
  }
  function offreLimite(quoi) {
    feuille('Version gratuite', '<p>La version gratuite permet <b>' + CC.LIMITE_PROJETS + ' projet et ' + CC.LIMITE_ELEMENTS + ' éléments</b>. ' + (quoi === 'projet' ? 'Vous avez déjà un projet.' : 'Vous avez déjà ' + CC.LIMITE_ELEMENTS + ' éléments.') +
      ' Tout ce que vous avez calculé reste utilisable.</p><p>Le <b>pass 12 mois</b> (' + F(CC.PASS.prix) + ') permet des projets et des éléments sans limite.</p>' +
      '<div class="boutons"><a class="btn or" href="#/pass">' + ICO.etoile.replace('class="ico"', '') + 'Voir le pass</a><button type="button" class="btn sec" data-fermer>Plus tard</button></div>');
  }
  function vueChoixType() {
    cadre({ titre: 'Ajouter un élément', retour: '#/elements', nav: 'elements' });
    if (!CC.peutAjouterElement(S.elements.length, S.pass.actif)) {
      history.replaceState(null, '', '#/elements'); S.route = '#/elements';
      vueElements();
      return offreLimite('element');
    }
    vue('<h1>Que voulez-vous calculer ?</h1><p class="discret">Choisissez la partie de la maison. Vous tapez ensuite ses dimensions.</p><div class="types">' + CC.ORDRE_TYPES.map(function (t) {
      var T = CC.TYPES[t];
      return '<a class="type-tuile" href="#/element/nouveau/' + t + '" data-type="' + t + '">' + CCSchema.dessin(t, {}, T.nom) + '<strong>' + esc(T.nom) + '</strong><small>' + esc(T.aide) + '</small></a>';
    }).join('') + '</div>');
  }
  var NOMS_DEFAUT = { fondation: 'Semelles', poteaux: 'Poteaux', chainage: 'Chaînage', dalle: 'Dalle', mur: 'Murs', enduit: 'Enduit', carrelage: 'Carrelage', peinture: 'Peinture' };
  function vueElementForm(id, type) {
    var el = id ? element(id) : null;
    if (id && !el) return location.replace('#/elements');
    if (!id && !CC.TYPES[type]) return location.replace('#/element/nouveau');
    if (!id && !CC.peutAjouterElement(S.elements.length, S.pass.actif)) return vueChoixType();
    type = el ? el.type : type;
    var T = CC.TYPES[type], dims = Object.assign(CC.dimsDefaut(type), el ? el.dims : {});
    cadre({ titre: el ? el.nom : T.nom, retour: el ? '#/elements' : '#/element/nouveau', nav: 'elements' });
    var h = '<form class="carte" data-form="element" data-id="' + esc(id || 'nouveau') + '" data-type="' + type + '" novalidate>' +
      '<div id="schema-element">' + CCSchema.dessin(type, dims, 'Schéma : ' + T.nom) + '</div><p class="petit discret" style="text-align:center">' + esc(T.aide) + '</p>' +
      '<div class="grille2">' + champ('Nom', 'e-nom', el ? el.nom : NOMS_DEFAUT[type], { place: 'Ex. : Chambres, salon…' }) +
      champ('Étape', 'e-etape', el ? el.etape : CC.etapeDefaut(type, dims), { options: CC.ETAPES.map(function (e, i) { return [e.cle, (i + 1) + '. ' + e.nom]; }) }) + '</div>' +
      '<div id="champs-element">' + champsElement(type, dims) + '</div>' +
      '<div class="resultats" id="resultats" aria-live="polite"></div>' +
      '<button type="submit" class="btn large">' + ICO.ok + (el ? 'Enregistrer' : 'Ajouter au projet') + '</button>' +
      (el ? '<div class="boutons"><button type="button" class="btn danger" data-action="element-suppr" data-id="' + esc(el.id) + '">' + ICO.poubelle + 'Supprimer cet élément</button></div>' : '') + '</form>' + avertissement();
    vue(h);
    majResultats();
  }
  function champsElement(type, dims) {
    var h = '', paire = [];
    function vider() { if (paire.length) { h += paire.length === 2 ? '<div class="grille2">' + paire.join('') + '</div>' : paire[0]; paire = []; } }
    CC.TYPES[type].champs.forEach(function (c) {
      if (!CC.champVisible(c, dims)) return;
      var id = 'd-' + c.cle, v = dims[c.cle];
      if (c.type === 'choix') { vider(); h += choix(id, v, c.options, c.nom); return; }
      if (c.type === 'ouinon') { vider(); h += '<label class="coche champ"><input type="checkbox" id="' + id + '" name="' + id + '"' + (v ? ' checked' : '') + '> ' + esc(c.nom) + '</label>'; return; }
      var html;
      if (c.type === 'diametre') html = champ(c.nom, id, v, { options: CC.DIAMETRES.map(function (d) { return [String(d), d + ' mm (HA' + d + ')']; }) });
      else if (c.type === 'format') html = champ(c.nom, id, v, { options: CC.FORMATS });
      else if (c.type === 'montant') html = champ(c.nom, id, CC.formatNombre(v), { mode: 'numeric', suffixe: c.unite, data: ' data-montant' });
      else html = champ(c.nom, id, String(v).replace('.', ','), { mode: c.type === 'entier' ? 'numeric' : 'decimal', suffixe: c.unite || '' });
      paire.push(html);
      if (paire.length === 2) vider();
    });
    vider();
    return h;
  }
  function lireDims(form, type) {
    var d = {};
    CC.TYPES[type].champs.forEach(function (c) {
      var el = form.elements['d-' + c.cle];
      if (!el) return;
      if (c.type === 'ouinon') d[c.cle] = !!el.checked;
      else if (c.type === 'choix') d[c.cle] = val(form, 'd-' + c.cle);
      else if (c.type === 'diametre') d[c.cle] = parseInt(el.value, 10);
      else if (c.type === 'format') d[c.cle] = el.value;
      else if (c.type === 'entier' || c.type === 'montant') d[c.cle] = CC.entier(el.value);
      else d[c.cle] = Math.max(0, CC.lireNombre(el.value));
    });
    return d;
  }
  function tableauLignes(lignes, id) {
    return '<table class="tableau"' + (id ? ' id="' + id + '"' : '') + '><thead><tr><th scope="col">Matériau</th><th scope="col">Quantité</th><th scope="col">Montant</th></tr></thead><tbody>' + lignes.map(function (l) {
      return '<tr data-mat="' + esc(l.cle) + '"><td class="mat">' + esc(l.nom) + '<small>' + esc(F(l.pu)) + ' ' + esc(CC.MATERIAUX[l.cle] ? CC.MATERIAUX[l.cle].pu : l.cle === 'carreaux' ? 'le m²' : 'le pot') + '</small></td>' +
        '<td><span class="qte">' + esc(CC.quantiteTexte(l)) + '</span>' + (l.info ? '<small>' + esc(l.info) + '</small>' : '') + '</td><td class="nb">' + F(l.montant) + '</td></tr>';
    }).join('') + '</tbody></table>';
  }
  function majResultats() {
    var form = $('form[data-form=element]'), zone = $('#resultats');
    if (!form || !zone) return;
    var type = form.dataset.type, dims = lireDims(form, type), p = projet();
    var q = CC.calculer({ type: type, dims: dims }), r = CC.arrondir(q, p.marge, p.prix), i = q.infos, infos = [];
    if (i.beton) infos.push('Béton : ' + CC.formatDecimal(i.beton, 3) + ' m³');
    if (i.proprete) infos.push('propreté : ' + CC.formatDecimal(i.proprete, 3) + ' m³');
    if (i.surface) infos.push('Surface : ' + CC.formatDecimal(i.surface, 2) + ' m²');
    if (i.mortier) infos.push('mortier : ' + CC.formatDecimal(i.mortier, 3) + ' m³');
    zone.innerHTML = '<div class="carte-titre"><h2>Matériaux à prévoir</h2><span class="discret petit">+' + CC.formatDecimal(p.marge, 1) + ' % de pertes</span></div>' +
      (infos.length ? '<p class="petit discret" id="infos-element">' + esc(infos.join(' · ')) + '</p>' : '') +
      (r.lignes.length ? tableauLignes(r.lignes, 'table-element') : '<p class="discret">Tapez les dimensions pour voir les quantités.</p>') +
      '<div class="resultat-total"><span>Coût de cet élément</span><strong class="nb" id="total-element">' + F(r.total) + '</strong></div>' +
      (!p.prixVerifies ? '<p class="petit discret">Avec des prix d\'exemple. <a href="#/prix">Mettre mes prix</a></p>' : '');
  }

  // ---------- Budget ----------
  function vueBudget() {
    cadre({ titre: 'Budget', nav: 'budget' });
    var p = projet(), b = budgetCourant();
    var h = '<div class="carte-titre"><h1 style="margin:0">Budget matériaux</h1></div>' + avertissement();
    h += '<section class="carte"><p class="discret" style="margin:0">' + esc(p.nom) + ' · marge de pertes ' + CC.formatDecimal(p.marge, 1) + ' %</p><p class="gros-chiffre nb" id="budget-total">' + F(b.total) + '</p>' +
      '<div class="boutons"><button type="button" class="btn" data-action="devis-pdf" id="btn-devis">' + ICO.pdf + 'Devis PDF</button><a class="btn wa" target="_blank" rel="noopener" id="wa-resume-budget" href="' +
      esc('https://wa.me/?text=' + encodeURIComponent(CC.messageDevis(p, b))) + '">' + ICO.wa + 'Résumé WhatsApp</a></div>' +
      '<p class="petit discret">Le devis est pour le maçon ou la famille : vous choisissez à qui l\'envoyer.</p></section>';
    if (!p.prixVerifies) h += alerte('attention', '<p><b>Prix d\'exemple.</b> <a href="#/prix">Mettez les prix de votre quincaillerie</a> pour un budget juste.</p>');
    var vide = true;
    b.etapes.forEach(function (e, i) {
      if (!e.total) return;
      vide = false;
      h += '<section class="carte" data-etape="' + e.cle + '"><div class="etape-tete"><h2>' + (i + 1) + '. ' + esc(e.nom) + '</h2><strong class="nb">' + F(e.total) + '</strong></div>' +
        '<p class="petit discret">' + e.elements.map(function (x) { return esc(x.nom); }).join(', ') + '</p>' + tableauLignes(e.lignes) + '</section>';
    });
    if (vide) h += '<div class="carte vide">' + ICO.calcul + '<p>Aucun élément calculé.</p><a class="btn" href="#/element/nouveau">' + ICO.plus + 'Ajouter un élément</a></div>';
    else {
      var achat = CC.listeAchat(b);
      h += '<section class="carte"><h2>Liste d\'achat de tout le chantier</h2><table class="tableau" id="liste-achat"><thead><tr><th scope="col">Matériau</th><th scope="col">Quantité</th><th scope="col">Montant</th></tr></thead><tbody>' +
        achat.map(function (l) { return '<tr data-mat="' + esc(l.cle) + '"><td>' + esc(l.nom) + '</td><td class="qte">' + esc(CC.quantiteTexte(l)) + '</td><td class="nb">' + F(l.montant) + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td>Total</td><td></td><td class="nb">' + F(b.total) + '</td></tr></tfoot></table>' +
        '<p class="note-hyp">Les quantités sont additionnées pour chaque étape puis arrondies au-dessus (on achète par étape) : le total d\'une étape peut être un peu plus petit que la somme des éléments calculés un par un. <a href="#/hypotheses">Voir les dosages</a></p></section>';
    }
    vue(h);
  }
  function vuePrix() {
    cadre({ titre: 'Prix et marge', retour: '#/budget', nav: 'budget' });
    var p = projet();
    vue('<form class="carte" data-form="prix" novalidate><h1>Vos prix</h1><p class="discret">Demandez les prix à votre quincaillerie ou à votre maçon. Ils servent à tous les éléments de « ' + esc(p.nom) + ' ».</p>' +
      champ('Marge de pertes', 'p-marge', CC.formatDecimal(p.marge, 1), { mode: 'decimal', suffixe: '%', aide: 'Ajoutée à toutes les quantités (casse, chutes, pertes). Souvent 5 à 10 %.' }) +
      '<div class="prix-grille">' + CC.ORDRE_MATERIAUX.map(function (k) {
        var M = CC.MATERIAUX[k];
        return '<label for="prix-' + k + '">' + esc(M.nom) + '<small>' + esc(M.pu) + '</small></label><div class="champ" id="champ-prix-' + k + '"><div class="suffixe"><input type="text" inputmode="numeric" id="prix-' + k + '" name="prix-' + k + '" data-montant value="' + CC.formatNombre(p.prix[k]) + '"><span>F</span></div></div>';
      }).join('') + '</div><p class="petit discret">Prix des carreaux et de la peinture : dans chaque élément (ils changent d\'une pièce à l\'autre).</p>' +
      '<button type="submit" class="btn large">' + ICO.ok + 'Enregistrer mes prix</button><div class="boutons"><button type="button" class="btn sec" data-action="prix-exemple">Remettre les prix d\'exemple</button></div></form>');
  }

  // ---------- Épargne et dépenses ----------
  function vueEpargne() {
    cadre({ titre: 'Épargne', nav: 'epargne' });
    var p = projet(), b = budgetCourant(), pl = planCourant(b), deps = depensesProjet(p);
    var h = '<h1>Construire par étapes</h1><form class="carte" data-form="epargne" novalidate><div class="grille2">' +
      montantChamp('Déjà mis de côté', 'ep-deja', p.epargne.deja, { aide: 'Argent disponible aujourd\'hui' }) + montantChamp('Épargne par mois', 'ep-mensuel', p.epargne.mensuel, { aide: 'Ce que vous pouvez mettre de côté' }) +
      '</div><button type="submit" class="btn large">Calculer les dates</button></form>';
    h += '<section class="carte" id="plan"><h2>Quand chaque étape devient payable</h2>';
    if (!pl.length) h += '<p class="discret">Ajoutez des éléments pour voir le plan.</p>';
    else if (!CC.entier(p.epargne.mensuel) && pl.some(function (x) { return x.mois !== 0; })) h += alerte('info', '<p>Indiquez combien vous pouvez épargner par mois pour voir les dates.</p>');
    pl.forEach(function (x, i) {
      var pct = x.budget ? Math.min(100, Math.round(x.depense * 100 / x.budget)) : (x.depense ? 100 : 0);
      var quand = x.terminee ? '<span class="quand maintenant">Terminée</span>' : x.mois === 0 ? '<span class="quand maintenant">Payable dès maintenant</span>' :
        x.quand ? '<span class="quand">Payable en ' + esc(CC.moisFr(x.quand)) + '</span> <small class="discret">(dans ' + pluriel(x.mois, 'mois', 'mois') + ')</small>' : '<span class="discret">Date inconnue</span>';
      h += '<div class="plan-etape" data-etape="' + x.cle + '"><div class="etape-tete"><h3 style="margin:0">' + (i + 1) + '. ' + esc(x.nom) + '</h3><strong class="nb">' + F(x.budget) + '</strong></div>' +
        '<p style="margin:4px 0">' + quand + '</p>' +
        '<div class="jauge' + (x.depense > x.budget ? ' surcharge' : '') + '" role="img" aria-label="Dépensé : ' + pct + ' % du budget"><span class="' + (x.depense > x.budget ? 'depasse' : 'brand') + '" style="width:' + pct + '%"></span></div>' +
        '<p class="petit" style="margin:2px 0">Dépensé : <b class="nb">' + F(x.depense) + '</b>' + (x.depense || x.terminee ? ' · écart : <span class="' + (x.ecart > 0 ? 'ecart-plus' : 'ecart-moins') + ' nb">' + (x.ecart > 0 ? '+' : '') + F(x.ecart) + '</span>' : '') +
        (x.reste ? ' · reste à financer : <b class="nb">' + F(x.reste) + '</b>' : '') + '</p>' +
        '<label class="coche petit"><input type="checkbox" data-action="terminee" data-etape="' + x.cle + '"' + (x.terminee ? ' checked' : '') + '> Étape terminée (on garde la dépense réelle)</label></div>';
    });
    h += '</section>';
    h += '<section class="carte"><div class="carte-titre"><h2>Dépenses réelles</h2><button type="button" class="btn petit" data-action="depense" id="btn-depense">' + ICO.plus + 'Ajouter</button></div>' +
      (deps.length ? '<ul class="liste" id="liste-depenses">' + deps.map(function (d) {
        return '<li class="ligne"><span class="ligne-corps"><strong>' + esc(d.libelle || CC.nomEtape(d.etape)) + '</strong><small>' + esc(CC.nomEtape(d.etape)) + ' · ' + CC.dateFr(d.date) + '</small></span><strong class="nb">' + F(d.montant) +
          '</strong><button type="button" class="icone-btn" data-action="depense-suppr" data-id="' + esc(d.id) + '" aria-label="Supprimer cette dépense">' + ICO.poubelle + '</button></li>';
      }).join('') + '</ul>' : '<p class="discret">Notez ici ce que vous payez vraiment (matériaux, main-d\'œuvre…) pour comparer avec le budget.</p>') + '</section>';
    h += '<p class="petit discret">L\'application calcule et note ; elle ne reçoit ni ne garde aucun argent.</p>';
    vue(h);
  }

  // ---------- Projets ----------
  function vueProjets() {
    cadre({ titre: 'Projets', retour: '#/reglages', nav: 'reglages' });
    var h = '<div class="carte-titre"><h1 style="margin:0">Mes projets</h1><a class="btn petit" href="#/projet-modifier/nouveau" id="btn-nouveau-projet">' + ICO.plus + 'Nouveau</a></div>';
    if (!S.pass.actif) h += '<p class="petit discret">Version gratuite : 1 projet. <a href="#/pass">Plusieurs projets avec le pass</a></p>';
    h += '<div class="carte" style="padding:4px 14px"><ul class="liste">' + S.projets.map(function (x) {
      var b = CC.budget(x, elementsProjet(x));
      return '<li class="ligne"><button type="button" class="ligne-corps" style="background:none;border:0;text-align:left;cursor:pointer;padding:0" data-action="choisir-projet" data-id="' + esc(x.id) + '"><strong>' + esc(x.nom) + (x.id === S.courant ? ' ✓' : '') +
        '</strong><small>' + pluriel(elementsProjet(x).length, 'élément') + ' · ' + F(b.total) + '</small></button><a class="icone-btn" href="#/projet-modifier/' + esc(x.id) + '" aria-label="Modifier ' + esc(x.nom) + '">' + ICO.crayon + '</a></li>';
    }).join('') + '</ul></div>';
    vue(h);
  }
  function vueProjetForm(id) {
    var nouveau = id === 'nouveau', p = nouveau ? null : S.projets.filter(function (x) { return x.id === id; })[0];
    if (!nouveau && !p) return location.replace('#/projets');
    if (nouveau && !CC.peutAjouterProjet(S.projets.length, S.pass.actif)) {
      history.replaceState(null, '', '#/projets'); S.route = '#/projets';
      vueProjets();
      return offreLimite('projet');
    }
    cadre({ titre: nouveau ? 'Nouveau projet' : 'Modifier le projet', retour: '#/projets', nav: 'reglages' });
    vue('<form class="carte" data-form="projet" data-id="' + esc(id) + '" novalidate>' + champ('Nom du projet', 'p-nom', p ? p.nom : '', { place: 'Ex. : Maison de Keur Massar' }) +
      champ('Lieu (facultatif)', 'p-lieu', p ? p.lieu : '') + '<button type="submit" class="btn large">Enregistrer</button>' +
      (p ? '<div class="boutons"><button type="button" class="btn danger" data-action="projet-suppr" data-id="' + esc(p.id) + '">' + ICO.poubelle + 'Supprimer ce projet</button></div>' : '') + '</form>');
  }

  // ---------- Hypothèses, réglages ----------
  function vueHypotheses() {
    cadre({ titre: 'Hypothèses', retour: projet() ? '#/budget' : '#/reglages', nav: 'reglages' });
    var D = CC.DOSAGES;
    vue('<h1>Dosages et hypothèses</h1>' + avertissement() +
      '<section class="carte"><h2>Dosages pour 1 m³</h2><div style="overflow-x:auto"><table class="tableau" id="table-dosages"><thead><tr><th scope="col">Mélange</th><th scope="col">Ciment</th><th scope="col">Sable</th><th scope="col">Gravier</th><th scope="col">Eau</th></tr></thead><tbody>' +
      Object.keys(D).map(function (k) { var d = D[k]; return '<tr><td>' + esc(d.nom) + '</td><td class="nb">' + d.ciment + ' kg</td><td class="nb">' + CC.formatDecimal(d.sable * 1000, 0) + ' L</td><td class="nb">' + (d.gravier ? CC.formatDecimal(d.gravier * 1000, 0) + ' L' : '—') + '</td><td class="nb">' + d.eau + ' L</td></tr>'; }).join('') +
      '</tbody></table></div></section><section class="carte"><h2>Toutes les règles de calcul</h2><ul class="liste-hyp">' + CCPdf.hypotheses(projet()).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<p class="note-hyp">Ces règles sont des valeurs courantes pour préparer un budget. Les sections de poteaux, le fer et la profondeur des fondations dépendent du terrain et de la maison : faites-les valider par un ingénieur ou un maçon expérimenté.</p></section>');
  }
  var invite = null;
  function estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function estInstallee() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function majInstall() { var b = $('#installer'); if (b) b.hidden = estInstallee() || !(invite || estIOS()); }
  function aideInstallation() {
    if (estIOS()) return '<ol class="etapes"><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez le bouton <b>Partager</b> (carré avec une flèche vers le haut).</li><li>Choisissez <b>« Sur l\'écran d\'accueil »</b>, puis <b>Ajouter</b>.</li></ol>';
    return '<ol class="etapes"><li>Ouvrez cette page dans <b>Chrome</b>.</li><li>Touchez le menu <b>⋮</b> en haut à droite.</li><li>Choisissez <b>« Installer l\'application »</b> ou <b>« Ajouter à l\'écran d\'accueil »</b>.</li></ol>';
  }
  function lien(href, icone, titre, sous) { return '<a href="' + href + '">' + icone + '<span><strong>' + esc(titre) + '</strong><small>' + esc(sous) + '</small></span>' + ICO.chevron + '</a>'; }
  function lireTheme() { try { return localStorage.getItem('cc-theme') || 'auto'; } catch (e) { return 'auto'; } }
  function appliquerTheme(v) {
    try { localStorage.setItem('cc-theme', v); } catch (e) {}
    var r = document.documentElement;
    if (v === 'clair') r.setAttribute('data-theme', 'light'); else if (v === 'sombre') r.setAttribute('data-theme', 'dark'); else r.removeAttribute('data-theme');
  }
  function vueReglages() {
    cadre({ titre: 'Réglages', nav: 'reglages' });
    var P = S.pass, theme = lireTheme(), p = projet();
    var h = '<section class="carte statut-pass' + (P.actif ? ' actif' : '') + '"><div><small class="discret">Votre version</small><h2 style="margin:0">' + (P.actif ? 'Pass actif' : 'Version gratuite') + '</h2><span class="petit">' +
      (P.actif ? 'Jusqu\'au ' + CC.dateFr(P.fin.slice(0, 10)) : '1 projet, ' + S.elements.length + ' / ' + CC.LIMITE_ELEMENTS + ' éléments') + '</span></div><a class="btn ' + (P.actif ? 'sec' : 'or') + ' petit" href="#/pass">' + (P.actif ? 'Détails' : 'Voir le pass') + '</a></section>';
    h += '<nav class="menu" aria-label="Réglages">' +
      lien('#/projets', ICO.maison, 'Projets', p ? p.nom + (S.projets.length > 1 ? ' (+ ' + (S.projets.length - 1) + ')' : '') : 'Aucun projet') +
      (p ? lien('#/prix', ICO.prix, 'Prix et marge de pertes', (p.prixVerifies ? 'Vos prix' : 'Prix d\'exemple') + ' · marge ' + CC.formatDecimal(p.marge, 1) + ' %') : '') +
      lien('#/hypotheses', ICO.livre, 'Dosages et hypothèses', 'Béton 350 kg/m³, mortiers, fer, parpaings…') +
      lien('#/sauvegarde', ICO.sauvegarde, 'Sauvegarde', S.sauvegardeLe ? 'Dernière : ' + CC.dateFr(S.sauvegardeLe.slice(0, 10)) : 'Aucune sauvegarde pour l\'instant') +
      lien('#/pass', ICO.etoile, 'Pass 12 mois', P.actif ? 'Actif' : F(CC.PASS.prix) + ' : projets et éléments illimités') + '</nav>';
    h += '<section class="carte"><h2>Apparence</h2>' + champ('Thème', 'theme', theme, { options: [['auto', 'Automatique (comme le téléphone)'], ['clair', 'Clair'], ['sombre', 'Sombre']] }) + '</section>';
    h += '<section class="carte"><h2>Installer l\'application</h2>' + (estInstallee() ? alerte('ok', '<p>L\'application est installée sur ce téléphone.</p>') :
      (invite ? '<button type="button" class="btn large" data-action="installer">' + ICO.installer.replace('class="ico"', '') + 'Installer l\'application</button>' : aideInstallation())) + '</section>';
    h += '<section class="carte"><h2>Confidentialité</h2><p>Vos projets, prix et dépenses sont enregistrés <b>uniquement sur ce téléphone</b>. Rien n\'est envoyé sur Internet, sauf la vérification de votre pass (une seule fois).</p>' +
      '<p class="petit">Le devis ne part jamais tout seul : c\'est vous qui choisissez à qui l\'envoyer sur WhatsApp.</p></section>';
    h += '<section class="carte"><h2>À propos</h2><p>Calcul Chantier, version ' + VERSION + ' (famille TERANGA).</p><p class="petit">' + esc(CC.AVERTISSEMENT) + '</p><p class="petit">Bibliothèques libres incluses : jsPDF et jsPDF-AutoTable (licence MIT). <a href="vendor/LISEZMOI.txt">Détails</a>.</p>' +
      '<p class="petit"><a href="../">Toutes nos applications</a> · <a href="../../boutique/">Boutique</a></p></section>';
    vue(h);
    $('#theme').addEventListener('change', function () { appliquerTheme(this.value); });
  }

  // ---------- Pass ----------
  function vuePass(_, q) {
    cadre({ titre: 'Pass 12 mois', retour: '#/reglages', nav: 'reglages' });
    var P = S.pass, h = '<section class="carte" id="etat-pass">';
    if (P.actif) h += '<h1>Pass actif</h1><p>Projets et éléments illimités jusqu\'au <b>' + CC.dateFr(P.fin.slice(0, 10)) + '</b> (' + pluriel(P.joursRestants, 'jour') + ').</p>' +
      (P.rappel ? alerte('attention', '<p>Votre pass se termine bientôt. Renouvelez maintenant : les jours restants s\'ajoutent, rien n\'est perdu.</p>') + '<a class="btn or" href="' + esc(CC.urlProduit()) + '">Renouveler</a>' : '');
    else if (P.expire) h += '<h1>Pass terminé</h1><p>Votre pass a pris fin le ' + CC.dateFr(P.fin.slice(0, 10)) + '. Tous vos projets restent consultables et modifiables, devis PDF compris ; seul l\'ajout au-delà de 1 projet et ' + CC.LIMITE_ELEMENTS + ' éléments est en pause.</p><a class="btn or" href="' + esc(CC.urlProduit()) + '">Renouveler</a>';
    else h += '<h1>Version gratuite</h1><p>Vous utilisez <b>' + S.projets.length + ' / ' + CC.LIMITE_PROJETS + ' projet</b> et <b>' + S.elements.length + ' / ' + CC.LIMITE_ELEMENTS + ' éléments</b>. Budget, épargne, devis PDF et WhatsApp sont inclus.</p>';
    h += '</section>';
    h += '<section class="carte"><h2>Ce que permet le pass</h2><div class="offres"><div class="offre"><h3>Gratuit</h3><ul><li>1 projet et ' + CC.LIMITE_ELEMENTS + ' éléments</li><li>Budget, épargne, devis PDF</li></ul></div>' +
      '<div class="offre mise-en-avant"><h3>Pass 12 mois · ' + F(CC.PASS.prix) + '</h3><ul><li>Projets et éléments illimités pendant 12 mois : toute la maison, étape par étape</li><li>Payé une fois par Wave, sans abonnement automatique</li><li>À la fin, rien n\'est bloqué</li></ul>' +
      '<a class="btn or large" style="margin-top:10px" href="' + esc(CC.urlProduit()) + '" id="acheter-pass">' + ICO.etoile.replace('class="ico"', '') + 'Acheter le pass (' + F(CC.PASS.prix) + ')</a></div></div></section>';
    h += '<section class="carte"><form data-form="pass" novalidate><h2>Activer mon pass</h2><ol class="etapes"><li>Payez le pass par Wave sur la boutique.</li><li>Sur la page de votre commande payée, copiez le lien de la page.</li><li>Collez-le ici, puis touchez « Activer ». Internet est nécessaire une seule fois.</li></ol>' +
      champ('Lien de votre commande', 'code-pass', q && q.get('code') ? q.get('code') : '', { zone: true, lignes: 3, place: 'https://…/commande.html?o=TCV-…&t=…' }) +
      '<button type="submit" class="btn large" id="btn-activer">Activer</button><div id="msg-pass" aria-live="polite"></div></form></section>';
    if (S.passes.length) h += '<section class="carte"><h2>Pass activés sur ce téléphone</h2><ul>' + S.passes.map(function (p) {
      return '<li>Payé le ' + CC.dateFr(String(p.payeeLe).slice(0, 10)) + ' · commande ' + esc(String(p.id || '').replace(/^(TCV-....).*/, '$1••••')) + '</li>';
    }).join('') + '</ul><p class="petit discret">Sur un autre téléphone, collez le même lien de commande.</p></section>';
    vue(h);
    if (q && q.get('code') && q.get('auto') === '1') activerPass(q.get('code'));
  }
  function activerPass(texte) {
    var msg = $('#msg-pass');
    var dire = function (type, html) { if (msg) msg.innerHTML = alerte(type, html); };
    var c = CC.lireLienCommande(texte);
    if (!c) return dire('danger', '<p>Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « o=TCV- » et « t= »).</p>');
    dire('info', '<p>Vérification en cours…</p>');
    var ctrl = window.AbortController ? new AbortController() : null, minuterie = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    fetch(CC.urlVerification(c), { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }).then(function (r) {
      clearTimeout(minuterie);
      if (r.status === 404) return { commande: null };
      if (!r.ok) throw new Error('service');
      return r.json();
    }).then(function (j) {
      var a = CC.analyserReponse(j);
      if (a.ok) {
        S.passes = CC.ajouterPass(S.passes, a.pass);
        return DB.ecrire('passes', S.passes).then(function () {
          majPass(); history.replaceState(null, '', '#/pass'); S.route = '#/pass';
          vuePass(null, new URLSearchParams()); toast('Pass activé : projets et éléments illimités.');
        });
      }
      if (a.raison === 'impayee') dire('attention', '<p>Cette commande n\'est pas encore payée. Ouvrez la page de la commande, payez par Wave, puis réessayez.</p>');
      else if (a.raison === 'produit') dire('danger', '<p>Ce lien correspond à un autre achat' + (a.titre ? ' (« ' + esc(a.titre) + ' »)' : '') + '. Collez le lien de votre commande du pass Calcul Chantier.</p>');
      else if (a.raison === 'expiree') dire('attention', '<p>Ce pass a pris fin le ' + CC.dateFr(a.fin.slice(0, 10)) + '. Prenez un nouveau pass pour ajouter des projets et des éléments sans limite.</p><p><a href="' + esc(CC.urlProduit()) + '">Renouveler</a></p>');
      else dire('danger', '<p>Commande introuvable. Vérifiez que vous avez collé le lien complet de la page de commande.</p>');
    }).catch(function () {
      clearTimeout(minuterie);
      dire('attention', '<p>Pas de connexion à Internet, ou service indisponible. Réessayez dans un moment : vos données ne sont pas touchées.</p>');
    });
  }

  // ---------- Sauvegarde ----------
  function vueSauvegarde() {
    cadre({ titre: 'Sauvegarde', retour: '#/reglages', nav: 'reglages' });
    vue('<section class="carte"><h1>Sauvegarder</h1><p>Un fichier avec vos projets, éléments, prix et dépenses (' + pluriel(S.projets.length, 'projet') + ', ' + pluriel(S.elements.length, 'élément') + ', ' + pluriel(S.depenses.length, 'dépense') + ').</p>' +
      '<p class="petit discret">Gardez-le en lieu sûr (par exemple en l\'envoyant à vous-même sur WhatsApp ou par e-mail). Il ne contient pas votre pass.</p>' +
      '<button type="button" class="btn large" data-action="exporter">' + ICO.sauvegarde.replace('class="ico"', '') + 'Télécharger la sauvegarde</button>' +
      (S.sauvegardeLe ? '<p class="petit discret">Dernière sauvegarde : ' + CC.dateFr(S.sauvegardeLe.slice(0, 10)) + '</p>' : '') + '</section>' +
      '<section class="carte"><h2>Restaurer</h2><p>Remplace les données de ce téléphone par celles d\'un fichier de sauvegarde.</p><span class="btn sec large btn-fichier">Choisir le fichier<input type="file" accept="application/json,.json" id="f-import" aria-label="Fichier de sauvegarde"></span></section>' +
      '<section class="carte"><h2>Tout effacer</h2><p>Supprime tous les projets de ce téléphone. Votre pass est conservé.</p><button type="button" class="btn danger large" data-action="tout-effacer">' + ICO.poubelle + 'Tout effacer</button></section>');
  }
  function telecharger(blob, nom) {
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 30000);
  }
  function exporter() {
    var d = { application: 'calcul-chantier', version: 1, exporteLe: new Date().toISOString(), projets: S.projets, elements: S.elements, depenses: S.depenses, kv: { courant: S.courant } };
    telecharger(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }), 'calcul-chantier-sauvegarde-' + CC.dateISO() + '.json');
    S.sauvegardeLe = new Date().toISOString();
    DB.ecrire('sauvegardeLe', S.sauvegardeLe).then(function () { toast('Sauvegarde téléchargée.'); if (S.route === '#/sauvegarde') vueSauvegarde(); });
  }
  function importer(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var d;
      try { d = JSON.parse(lecteur.result); } catch (e) { return toast('Fichier illisible.'); }
      var pb = CC.validerSauvegarde(d);
      if (pb) return toast(pb);
      confirmer('Restaurer la sauvegarde ?', 'Les données actuelles seront remplacées par celles du ' + esc(CC.dateFr(String(d.exporteLe || '').slice(0, 10))) + ' : ' + pluriel(d.projets.length, 'projet') + ', ' + pluriel(d.elements.length, 'élément') + '.', 'Restaurer', function () {
        DB.remplacer({ projets: d.projets, elements: d.elements, depenses: d.depenses, kv: d.kv || {} }, ['passes', 'sauvegardeLe']).then(charger).then(function () { toast('Sauvegarde restaurée.'); aller('#/'); });
      });
    };
    lecteur.readAsText(fichier);
  }

  // ---------- Formulaires ----------
  function enregistrerProjet(p) { return DB.lot([['projets', p], ['kv', p.id, 'courant']]).then(function () { remplacer(S.projets, p); S.courant = p.id; }); }
  var FORMS = {
    projet: function (form) {
      var id = form.dataset.id, nouveau = id === 'nouveau', nom = val(form, 'p-nom');
      if (!nom) return erreur('p-nom', 'Donnez un nom à votre projet.');
      if (nouveau && !CC.peutAjouterProjet(S.projets.length, S.pass.actif)) return offreLimite('projet');
      var p = nouveau ? nouveauProjet(nom, val(form, 'p-lieu')) : Object.assign({}, S.projets.filter(function (x) { return x.id === id; })[0], { nom: nom, lieu: val(form, 'p-lieu') });
      enregistrerProjet(p).then(function () { toast(nouveau ? 'Projet créé.' : 'Projet enregistré.'); aller(nouveau ? '#/' : '#/projets'); });
    },
    element: function (form) {
      var id = form.dataset.id, nouveau = id === 'nouveau', type = form.dataset.type, p = projet();
      if (nouveau && !CC.peutAjouterElement(S.elements.length, S.pass.actif)) return offreLimite('element');
      var dims = lireDims(form, type), q = CC.calculer({ type: type, dims: dims }), r = CC.arrondir(q, p.marge, p.prix);
      if (!r.lignes.length) return toast('Tapez des dimensions plus grandes que zéro.');
      var el = nouveau ? { id: CC.nouvelId(), projetId: p.id, type: type, cree: Date.now() } : Object.assign({}, element(id));
      el.nom = val(form, 'e-nom') || NOMS_DEFAUT[type]; el.etape = val(form, 'e-etape') || CC.etapeDefaut(type, dims); el.dims = dims; el.modifie = Date.now();
      DB.mettre('elements', el).then(function () { remplacer(S.elements, el); toast(nouveau ? 'Élément ajouté : ' + F(r.total) + '.' : 'Élément enregistré.'); aller('#/elements'); });
    },
    prix: function (form) {
      var p = Object.assign({}, projet()), prix = {};
      var m = CC.lireNombre(val(form, 'p-marge'));
      if (!(m >= 0 && m <= 50)) return erreur('p-marge', 'Entre 0 et 50 %.');
      CC.ORDRE_MATERIAUX.forEach(function (k) { prix[k] = CC.entier(val(form, 'prix-' + k)); });
      p.marge = Math.round(m * 10) / 10; p.prix = prix; p.prixVerifies = true;
      enregistrerProjet(p).then(function () { toast('Prix enregistrés.'); aller('#/budget'); });
    },
    epargne: function (form) {
      var p = Object.assign({}, projet());
      p.epargne = { deja: CC.entier(val(form, 'ep-deja')), mensuel: CC.entier(val(form, 'ep-mensuel')) };
      enregistrerProjet(p).then(function () { vueEpargne(); toast('Plan mis à jour.'); var pl = $('#plan'); if (pl) pl.scrollIntoView({ block: 'start' }); });
    },
    depense: function (form) {
      var m = CC.entier(val(form, 'dp-montant')), d = val(form, 'dp-date');
      if (!(m > 0)) return erreur('dp-montant', 'Indiquez le montant payé.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return erreur('dp-date', 'Date invalide.');
      var dep = { id: CC.nouvelId(), projetId: projet().id, etape: val(form, 'dp-etape'), date: d, libelle: val(form, 'dp-libelle'), montant: m, cree: Date.now() };
      DB.mettre('depenses', dep).then(function () { S.depenses.push(dep); fermerFeuille(true); vueEpargne(); toast('Dépense notée.'); });
    },
    pass: function (form) { activerPass(val(form, 'code-pass')); }
  };

  // ---------- Actions ----------
  var occupe = false;
  function devisPDF() {
    if (occupe) return;
    var p = projet(), b = budgetCourant();
    if (!b.total) return toast('Ajoutez d\'abord un élément.');
    occupe = true;
    toast('Préparation du devis PDF…');
    CCPdf.devis(p, elementsProjet(p), b, planCourant(b)).then(function (r) {
      occupe = false;
      var texte = CC.messageDevis(p, b), fichier = null, peut = false;
      try { fichier = new File([r.blob], r.nom, { type: 'application/pdf' }); } catch (e) { fichier = null; }
      try { peut = !!(fichier && navigator.canShare && navigator.share && navigator.canShare({ files: [fichier] })); } catch (e) { peut = false; }
      if (peut) {
        cacherToast();
        return navigator.share({ files: [fichier], title: r.nom, text: 'Devis matériaux : ' + p.nom }).catch(function (e) { if (!e || e.name !== 'AbortError') telecharger(r.blob, r.nom); });
      }
      telecharger(r.blob, r.nom);
      cacherToast();
      feuille('Envoyer le devis', '<p>Le PDF <b>' + esc(r.nom) + '</b> est enregistré dans vos téléchargements.</p><ol class="etapes"><li>Ouvrez WhatsApp avec le bouton ci-dessous et choisissez le maçon ou un proche.</li>' +
        '<li>Joignez le fichier : trombone, puis « Document », puis <b>' + esc(r.nom) + '</b>.</li></ol><a class="btn wa large" target="_blank" rel="noopener" id="wa-devis" href="' + esc('https://wa.me/?text=' + encodeURIComponent(texte)) + '">' + ICO.wa + 'Ouvrir WhatsApp</a>' +
        '<button type="button" class="btn sec large" style="margin-top:10px" data-fermer>Fermer</button>');
    }).catch(function (e) { occupe = false; toast(e.message || 'Le PDF n\'a pas pu être créé.'); });
  }
  var ACTIONS = {
    'fermer-bandeau': function (el) { S.fermes[el.dataset.cle] = 1; bandeaux(); },
    'devis-pdf': devisPDF,
    'element-suppr': function (el) {
      var x = element(el.dataset.id);
      confirmer('Supprimer « ' + x.nom + ' » ?', 'Cet élément sera retiré du budget.', 'Supprimer', function () {
        DB.lot([['-', 'elements', x.id]]).then(function () { S.elements = S.elements.filter(function (e) { return e.id !== x.id; }); toast('Élément supprimé.'); aller('#/elements'); });
      }, true);
    },
    'prix-exemple': function () {
      var p = Object.assign({}, projet(), { prix: Object.assign({}, CC.PRIX_DEFAUT), prixVerifies: false });
      enregistrerProjet(p).then(function () { vuePrix(); toast('Prix d\'exemple remis.'); });
    },
    terminee: function (el) {
      var p = Object.assign({}, projet()); p.terminees = Object.assign({}, p.terminees); p.terminees[el.dataset.etape] = el.checked;
      enregistrerProjet(p).then(vueEpargne);
    },
    depense: function () {
      var b = budgetCourant(), premiere = b.etapes.filter(function (e) { return e.total > 0; })[0];
      feuille('Ajouter une dépense', '<form data-form="depense" novalidate>' + champ('Étape', 'dp-etape', premiere ? premiere.cle : 'fondations', { options: CC.ETAPES.map(function (e) { return [e.cle, e.nom]; }) }) +
        champ('Quoi ?', 'dp-libelle', '', { place: 'Ex. : 20 sacs de ciment, maçon' }) +
        '<div class="grille2">' + montantChamp('Montant payé', 'dp-montant', '') + champ('Date', 'dp-date', CC.dateISO(), { type: 'date' }) + '</div>' +
        '<button type="submit" class="btn large">' + ICO.ok + 'Enregistrer</button></form>');
    },
    'depense-suppr': function (el) {
      DB.lot([['-', 'depenses', el.dataset.id]]).then(function () { S.depenses = S.depenses.filter(function (d) { return d.id !== el.dataset.id; }); vueEpargne(); toast('Dépense supprimée.'); });
    },
    'choisir-projet': function (el) { S.courant = el.dataset.id; DB.ecrire('courant', S.courant).then(function () { aller('#/'); }); },
    'projet-suppr': function (el) {
      var p = S.projets.filter(function (x) { return x.id === el.dataset.id; })[0];
      confirmer('Supprimer « ' + p.nom + ' » ?', 'Le projet, ses éléments et ses dépenses seront supprimés de ce téléphone.', 'Supprimer', function () {
        var ops = [['-', 'projets', p.id]];
        S.elements.filter(function (e) { return e.projetId === p.id; }).forEach(function (e) { ops.push(['-', 'elements', e.id]); });
        S.depenses.filter(function (d) { return d.projetId === p.id; }).forEach(function (d) { ops.push(['-', 'depenses', d.id]); });
        DB.lot(ops).then(function () {
          S.projets = S.projets.filter(function (x) { return x.id !== p.id; });
          S.elements = S.elements.filter(function (e) { return e.projetId !== p.id; });
          S.depenses = S.depenses.filter(function (d) { return d.projetId !== p.id; });
          S.courant = S.projets.length ? S.projets[0].id : null;
          return DB.ecrire('courant', S.courant);
        }).then(function () { toast('Projet supprimé.'); aller('#/'); });
      }, true);
    },
    exporter: exporter,
    'tout-effacer': function () {
      confirmer('Tout effacer ?', 'Tous les projets, éléments et dépenses de ce téléphone seront supprimés. Faites d\'abord une sauvegarde si besoin.', 'Tout effacer', function () {
        DB.remplacer({ projets: [], elements: [], depenses: [], kv: { courant: null } }, ['passes']).then(charger).then(function () { toast('Données effacées.'); aller('#/'); });
      }, true);
    },
    installer: function () {
      if (invite) { invite.prompt(); invite = null; majInstall(); return; }
      feuille('Installer l\'application', aideInstallation());
    }
  };

  function brancher() {
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-fermer]')) { fermerFeuille(); return; }
      if (e.target.id === 'feuille') { fermerFeuille(); return; }
      var a = e.target.closest('[data-action]');
      if (a && ACTIONS[a.dataset.action] && a.type !== 'checkbox') {
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
      if (el.type === 'checkbox' && el.dataset.action && ACTIONS[el.dataset.action]) { ACTIONS[el.dataset.action](el); return; }
      if (el.id === 'f-import' && el.files && el.files[0]) { importer(el.files[0]); el.value = ''; return; }
      if (el.id === 'choix-projet') { S.courant = el.value; DB.ecrire('courant', S.courant).then(vueAccueil); return; }
      var form = el.closest && el.closest('form[data-form=element]');
      if (form) {
        var type = form.dataset.type;
        if (el.name === 'd-forme' || el.name === 'd-niveau') {
          var dims = Object.assign(CC.dimsDefaut(type), lireDims(form, type));
          $('#champs-element').innerHTML = champsElement(type, dims);
          $('#schema-element').innerHTML = CCSchema.dessin(type, dims, 'Schéma : ' + CC.TYPES[type].nom);
          var e2 = form.elements['e-etape']; if (e2) e2.value = CC.etapeDefaut(type, dims);
        }
        majResultats();
      }
    });
    document.addEventListener('input', function (e) {
      var ch = e.target.closest && e.target.closest('.champ-erreur');
      if (ch) { ch.classList.remove('champ-erreur'); var er = ch.querySelector('.erreur'); if (er) er.hidden = true; }
      if (e.target.closest && e.target.closest('form[data-form=element]')) majResultats();
    });
    document.addEventListener('pointerdown', function (e) {
      var t = $('#toast');
      if (!t.hidden && !t.querySelector('button') && !t.contains(e.target)) cacherToast();
    });
    document.addEventListener('focusout', function (e) {
      var el = e.target;
      if (el.hasAttribute && el.hasAttribute('data-montant') && el.value.trim()) el.value = CC.formatNombre(CC.entier(el.value));
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
    var p = new URLSearchParams(location.search);
    if (p.get('o') && p.get('t')) {
      var code = '?o=' + p.get('o') + '&t=' + p.get('t');
      history.replaceState(null, '', location.pathname + '#/pass?auto=1&code=' + encodeURIComponent(code));
    }
    charger().then(router).catch(function (e) {
      vue('<section class="carte"><h1>Stockage indisponible</h1><p>' + esc(e && e.message || e) + '</p><p>Sur iPhone, quittez la navigation privée. Sinon, mettez à jour votre navigateur.</p></section>');
    });
    serviceWorker();
  }
  window.CCApp = { etat: S, version: VERSION };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
