/* PouletPilot — interface (pages, formulaires, pass, sauvegarde, installation). Tout reste sur le téléphone. */
(function () {
  'use strict';
  var PP = window.PP, PPL = window.PPL, DB = window.PPDB, PPG = window.PPG, R = window.PPRapport;
  var VERSION_APP = '1.0.0';
  var E = {
    lots: [], ops: {}, reglages: PP.reglagesComplets(), passes: [], licence: PPL.etatLicence([]),
    sauvegardeLe: null, majDispo: null, majDemandee: false, installation: null, activationPreRemplie: '', masques: {}
  };

  // ---------- Outils DOM ----------
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) ajouter(e, arguments[i]);
    return e;
  }
  function ajouter(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { ajouter(e, x); }); return; }
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  var CHEMINS = {
    plus: 'M12 5v14M5 12h14',
    jour: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
    morts: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6',
    pesee: 'M5 8h14l-2 12H7zM9 8a3 3 0 0 1 6 0M12 12v3',
    achat: 'M6 4h12l1 5H5zM5 9v11h14V9M9 13h6',
    depense: 'M3 7h18v12H3zM3 11h18M7 15h3',
    vente: 'M20 12l-8 8-9-9V3h8zM7.5 7.5h.01',
    note: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
    pdf: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6',
    csv: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16',
    alerte: 'M12 3l10 18H2zM12 10v5M12 18h.01',
    info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7h.01',
    verrou: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
    ok: 'M20 6L9 17l-5-5',
    partager: 'M4 12v8h16v-8M12 3v13M7 8l5-5 5 5',
    telecharger: 'M4 17v3h16v-3M12 3v13M7 11l5 5 5-5',
    micro: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
    corbeille: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    modifier: 'M4 20h4L19 9l-4-4L4 16z',
    drapeau: 'M5 21V4M5 4h11l-2 4 2 4H5',
    graphique: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
    installer: 'M12 3v12M7 10l5 5 5-5M5 21h14',
    sauvegarde: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 14h8v7H8z',
    etoile: 'M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.1l1.4-7L2 9.3l7-.8z'
  };
  function icone(nom) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', CHEMINS[nom] || CHEMINS.info);
    svg.appendChild(p);
    return svg;
  }
  function $(s) { return document.querySelector(s); }
  var minuteurToast = null;
  function toast(t) {
    var el = $('#toast'); el.textContent = t; el.classList.add('visible');
    clearTimeout(minuteurToast); minuteurToast = setTimeout(function () { el.classList.remove('visible'); }, 3200);
  }
  function stockLocal(cle, val) {
    try { if (val === undefined) return localStorage.getItem(cle); if (val === null) localStorage.removeItem(cle); else localStorage.setItem(cle, val); } catch (e) { /* indisponible */ }
    return null;
  }
  function nouvelId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* ancien navigateur */ }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function aujourdhui() { return PP.dateISO(new Date()); }
  function premium() { return !!(E.licence && E.licence.premium); }
  function aller(hash) { if (location.hash === hash) afficher(); else location.hash = hash; }
  function lotParId(id) { for (var i = 0; i < E.lots.length; i++) if (E.lots[i].id === id) return E.lots[i]; return null; }
  function opsDe(id) { return E.ops[id] || []; }
  function bilan(lot) { return PP.bilanLot(lot, opsDe(lot.id), { aujourdhui: aujourdhui(), reglages: E.reglages }); }
  function modifiable(lot) { return PPL.lotModifiable(lot, E.lots, premium()); }
  function pluriel(nb, mot, motPl) { return PP.nombre(nb) + ' ' + (Math.abs(nb) >= 2 ? (motPl || mot + 's') : mot); }

  // ---------- Données ----------
  function charger() {
    return Promise.all([DB.lire('reglages'), DB.lire('passes'), DB.lots(), DB.toutesOps(), DB.lire('sauvegardeLe')]).then(function (r) {
      E.reglages = PP.reglagesComplets(r[0]);
      E.passes = Array.isArray(r[1]) ? r[1] : [];
      E.lots = Array.isArray(r[2]) ? r[2] : [];
      E.ops = {};
      (r[3] || []).forEach(function (o) { (E.ops[o.lotId] || (E.ops[o.lotId] = [])).push(o); });
      E.sauvegardeLe = r[4] || null;
      majLicence();
    });
  }
  function majLicence() {
    E.licence = PPL.etatLicence(E.passes, Date.now());
    var b = $('#badge-pass');
    if (b) {
      b.textContent = E.licence.premium ? 'Complet' : 'Gratuit';
      b.className = 'badge-pass' + (E.licence.premium ? ' complet' : '');
      b.setAttribute('aria-label', E.licence.premium ? 'Version complète, ' + E.licence.joursRestants + ' jours restants' : 'Version gratuite : voir les pass');
    }
  }
  function enregistrerLot(lot) {
    return DB.mettreLot(lot).then(function () {
      var i = E.lots.findIndex(function (l) { return l.id === lot.id; });
      if (i >= 0) E.lots[i] = lot; else E.lots.push(lot);
    });
  }
  function enregistrerOp(op) {
    return DB.mettreOp(op).then(function () {
      var l = E.ops[op.lotId] || (E.ops[op.lotId] = []);
      var i = l.findIndex(function (o) { return o.id === op.id; });
      if (i >= 0) l[i] = op; else l.push(op);
    });
  }
  function supprimerOp(op) {
    return DB.supprimerOp(op.id).then(function () { E.ops[op.lotId] = opsDe(op.lotId).filter(function (o) { return o.id !== op.id; }); });
  }

  // ---------- Cadre de page ----------
  function cadre(titre, retour, onglet) {
    var t = $('#titre'), r = $('#retour'), logo = $('#logo');
    if (titre) { t.textContent = titre; } else { t.textContent = ''; t.appendChild(document.createTextNode('Poulet')); t.appendChild(h('b', null, 'Pilot')); }
    document.title = (titre ? titre + ' · ' : '') + 'PouletPilot';
    r.hidden = !retour; logo.hidden = !!retour;
    if (retour) r.setAttribute('href', retour);
    document.querySelectorAll('.onglets a').forEach(function (a) {
      if (a.getAttribute('data-onglet') === onglet) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var vue = $('#vue'); vue.textContent = '';
    return vue;
  }
  function alerte(niveau, texte, extra) {
    return h('div', { class: 'alerte ' + niveau, role: niveau === 'attention' || niveau === 'danger' ? 'alert' : null },
      icone(niveau === 'info' || niveau === 'ok' ? (niveau === 'ok' ? 'ok' : 'info') : 'alerte'), h('div', { class: 'texte' }, texte, extra || null));
  }
  function kpi(etiquette, valeur, sous, opts) {
    opts = opts || {};
    return h('div', { class: 'kpi' + (opts.large ? ' large' : ''), 'data-kpi': opts.id || null },
      h('span', { class: 'etiquette' }, etiquette),
      h('span', { class: 'valeur' + (opts.signe && valeur !== '—' ? (opts.signe < 0 ? ' negatif' : ' positif') : '') }, valeur),
      sous ? h('span', { class: 'sous' }, sous) : null);
  }
  function lienBouton(href, texte, cls, ic) { return h('a', { class: 'btn ' + (cls || ''), href: href }, ic ? icone(ic) : null, texte); }
  function bouton(texte, cls, onclick, ic, attrs) {
    var a = { type: 'button', class: 'btn ' + (cls || ''), onclick: onclick };
    if (attrs) for (var k in attrs) a[k] = attrs[k];
    return h('button', a, ic ? icone(ic) : null, texte);
  }

  // ---------- Bandeaux (mise à jour, pass, installation) ----------
  function estInstalle() {
    try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; }
  }
  function estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function bandeaux(route) {
    E.route = route;
    var z = $('#bandeaux'); z.textContent = '';
    function ajout(el) { z.appendChild(h('div', { class: 'bandeau' }, el)); }
    function fermer(cle, persistant) {
      return h('button', { type: 'button', class: 'fermer', 'aria-label': 'Fermer ce message', onclick: function () {
        E.masques[cle] = true; if (persistant) stockLocal(cle, String(Date.now())); bandeaux(route);
      } }, '×');
    }
    if (E.majDispo) ajout(alerte('info', 'Une nouvelle version de PouletPilot est prête.', [' ', bouton('Mettre à jour', 'petit', function () {
      E.majDemandee = true; var w = E.majDispo.waiting; if (w) w.postMessage({ type: 'MISE_A_JOUR' }); else location.reload();
    })]));
    if (DB.temporaire) ajout(alerte('danger', 'Ce navigateur ne garde pas les données (mode privé ?). Ouvrez PouletPilot dans une fenêtre normale.'));
    var L = E.licence, accueil = route === 'accueil' || route === 'lot';
    if (L.rappel && accueil && !E.masques.rappel) {
      ajout(h('div', { class: 'alerte attention' }, icone('alerte'), h('div', { class: 'texte' },
        'Votre pass se termine dans ' + pluriel(L.joursRestants, 'jour') + ' (le ' + PP.dateFr(L.fin) + ').'),
        lienBouton(PPL.urlProduit(L.slug), 'Renouveler', 'accent petit'), fermer('rappel')));
    } else if (L.expire && route === 'accueil' && !E.masques.expire) {
      ajout(h('div', { class: 'alerte info' }, icone('info'), h('div', { class: 'texte' },
        'Votre pass a pris fin le ' + PP.dateFr(L.fin) + '. Vos données restent consultables et exportables.'),
        lienBouton(PPL.urlProduit(L.slug), 'Renouveler', 'accent petit'), fermer('expire')));
    }
    if (route === 'accueil' && !estInstalle() && !E.masques.installation && !stockLocal('pp-installation-masquee')) {
      if (E.installation) {
        ajout(h('div', { class: 'alerte ok' }, icone('installer'), h('div', { class: 'texte' }, 'Installez PouletPilot sur votre écran d’accueil : il s’ouvre comme une application, même sans Internet.'),
          bouton('Installer', 'petit', installer, null, { 'data-action': 'installer' }), fermer('installation', 'pp-installation-masquee')));
      } else if (estIOS()) {
        ajout(h('div', { class: 'alerte ok' }, icone('installer'), h('div', { class: 'texte' }, 'Sur iPhone : touchez le bouton Partager de Safari, puis « Sur l’écran d’accueil ».'),
          fermer('installation', 'pp-installation-masquee')));
      }
    }
  }
  function installer() {
    if (!E.installation) { aller('#/reglages'); return; }
    var p = E.installation; E.installation = null;
    p.prompt();
    if (p.userChoice) p.userChoice.then(function () { afficher(); });
  }

  // ---------- Accueil ----------
  function pageAccueil() {
    var vue = cadre(null, null, 'accueil');
    bandeaux('accueil');
    var paires = E.lots.map(function (l) { return { lot: l, bilan: bilan(l) }; });
    var enCours = paires.filter(function (p) { return p.lot.statut !== 'termine'; }).sort(function (a, b) { return a.lot.dateDebut < b.lot.dateDebut ? 1 : -1; });
    var finis = paires.filter(function (p) { return p.lot.statut === 'termine'; }).sort(function (a, b) { return a.lot.dateDebut < b.lot.dateDebut ? 1 : -1; });

    if (!E.lots.length) {
      vue.appendChild(h('div', { class: 'carte vide' },
        h('img', { src: 'icons/icon-192.png', alt: '' }),
        h('h2', null, 'Bienvenue dans PouletPilot'),
        h('p', null, 'Notez chaque jour les morts, l’aliment, les pesées, les dépenses et les ventes de vos poulets de chair. PouletPilot calcule votre coût par poulet, votre prix minimum et votre marge.'),
        h('p', { class: 'discret' }, 'Tout reste sur ce téléphone, même sans Internet.'),
        h('div', { class: 'boutons' }, lienBouton('#/nouveau', 'Créer mon premier lot', 'large', 'plus'),
          bouton('Voir un exemple', 'secondaire large', creerExemple, 'graphique'))));
      return;
    }

    var t = PP.totauxFerme(paires.map(function (p) { return p.bilan; }));
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'ferme-t' },
      h('h2', { id: 'ferme-t' }, 'Ma ferme aujourd’hui'),
      h('div', { class: 'kpis' },
        kpi('Poulets au poulailler', PP.nombre(t.vivants), pluriel(t.encours, 'lot en cours', 'lots en cours'), { id: 'vivants' }),
        kpi('Argent du poulailler', PP.fcfa(t.tresorerie), 'reçu − dépensé, tous lots', { signe: t.tresorerie, id: 'tresorerie' }),
        t.aRecevoir > 0 ? kpi('À recevoir des clients', PP.fcfa(t.aRecevoir)) : null)));

    // Alertes de tous les lots en cours
    var toutes = [];
    enCours.forEach(function (p) {
      PP.alertes(p.bilan, { reglages: E.reglages }).forEach(function (a) { if (a.niveau === 'attention') toutes.push({ lot: p.lot, a: a }); });
    });
    toutes.slice(0, 4).forEach(function (x) {
      vue.appendChild(alerte('attention', h('span', null, h('b', null, x.lot.nom + ' : '), x.a.texte.replace(/^À vérifier : /, 'à vérifier, ')), [' ', h('a', { href: '#/lot/' + x.lot.id }, 'Voir le lot')]));
    });

    vue.appendChild(h('div', { class: 'ligne-entre' }, h('h2', null, 'Lots en cours'),
      h('span', { class: 'discret' }, premium() ? 'Lots illimités' : 'Gratuit : 1 lot en cours')));
    if (!enCours.length) vue.appendChild(h('p', { class: 'discret' }, 'Aucun lot en cours.'));
    enCours.forEach(function (p) { vue.appendChild(carteLot(p.lot, p.bilan)); });
    if (PPL.peutCreerLot(E.lots, premium())) vue.appendChild(lienBouton('#/nouveau', 'Nouveau lot', 'large secondaire', 'plus'));
    else vue.appendChild(h('div', { class: 'carte verrou' }, h('h3', null, icone('verrou'), 'Plusieurs lots en même temps'),
      h('p', null, 'La version gratuite suit 1 lot en cours. Terminez ce lot ou prenez un pass pour suivre tous vos lots.'),
      lienBouton('#/pass', 'Voir les pass', 'accent', 'etoile')));

    if (finis.length) {
      vue.appendChild(h('h2', null, 'Lots terminés'));
      finis.forEach(function (p) { vue.appendChild(carteLot(p.lot, p.bilan)); });
    }
    vue.appendChild(h('div', { class: 'boutons' }, bouton('Résumé de tous les lots (CSV)', 'secondaire', exporterResume, 'csv')));
    vue.appendChild(h('div', { id: 'fichier-pret' }));
  }

  function carteLot(lot, b) {
    var fini = lot.statut === 'termine', mod = modifiable(lot);
    var nbA = PP.alertes(b, { reglages: E.reglages }).filter(function (a) { return a.niveau === 'attention'; }).length;
    var etat = fini ? h('span', { class: 'pastille' }, lot.exemple ? 'Exemple' : 'Terminé')
      : (!mod ? h('span', { class: 'pastille verrou' }, 'Lecture seule') : h('span', { class: 'pastille encours' }, 'Jour ' + b.age));
    var carte = h('article', { class: 'carte', 'data-lot': lot.id },
      h('div', { class: 'ligne-entre' }, h('a', { class: 'nom', href: '#/lot/' + lot.id, style: 'font-weight:800;font-size:1.1rem;overflow-wrap:anywhere' }, lot.nom), etat),
      h('p', { class: 'discret petit' }, 'Arrivés le ' + PP.dateFr(lot.dateDebut) + ' · ' + pluriel(b.nbPoussins, 'poussin') + (lot.batiment ? ' · ' + lot.batiment : '')));
    if (!fini) {
      var pc = Math.max(0, Math.min(100, b.age / b.lot.ageVente * 100));
      carte.appendChild(h('div', { class: 'progression', role: 'img', 'aria-label': 'Jour ' + b.age + ' sur ' + b.lot.ageVente }, h('i', { style: 'width:' + pc.toFixed(1) + '%' })));
    }
    var mini = h('div', { class: 'mini' });
    function m(et, val) { mini.appendChild(h('div', null, h('span', null, et), h('b', null, val))); }
    if (fini) {
      m('Marge', PP.fcfa(b.marge)); m('Marge par poulet', PP.fcfa(b.margeParPoulet));
      m('Mortalité', PP.pct(b.tauxMortalite)); m('IC', b.ic != null ? PP.nombre(b.ic, 2) : '—');
    } else {
      m('Poulets restants', PP.nombre(b.vivants)); m('Mortalité', PP.pct(b.tauxMortalite));
      m('Poids moyen', b.poidsMoyenG != null ? PP.nombre(b.poidsMoyenG) + '\u00a0g' : '—'); m('Coût par poulet', PP.fcfa(b.coutParPoulet));
    }
    carte.appendChild(mini);
    if (nbA) carte.appendChild(h('p', { class: 'petit', style: 'color:var(--attention);font-weight:700;margin:0 0 8px' }, pluriel(nbA, 'point à vérifier', 'points à vérifier')));
    var bt = h('div', { class: 'boutons', style: 'margin-bottom:0' });
    if (!fini && mod) bt.appendChild(lienBouton('#/lot/' + lot.id + '/jour/' + aujourdhui(), 'Saisie du jour', '', 'jour'));
    bt.appendChild(lienBouton('#/lot/' + lot.id, 'Voir le lot', 'secondaire', 'graphique'));
    carte.appendChild(bt);
    return carte;
  }

  // ---------- Page d'un lot ----------
  function pageLot(id) {
    var lot = lotParId(id);
    if (!lot) { aller('#/'); return; }
    var vue = cadre(lot.nom, '#/', 'accueil');
    bandeaux('lot');
    var b = bilan(lot), fini = lot.statut === 'termine', mod = modifiable(lot);
    var proj = premium() && !fini ? PP.projection(b, { reglages: E.reglages }) : null;
    var al = PP.alertes(b, { reglages: E.reglages, projection: proj });

    vue.appendChild(h('p', { class: 'discret' },
      (fini ? 'Lot terminé · ' + b.age + ' jours' : 'Jour ' + b.age + ' sur ' + b.lot.ageVente) + ' · arrivés le ' + PP.dateFr(lot.dateDebut) +
      (lot.souche ? ' · ' + lot.souche : '') + (lot.batiment ? ' · ' + lot.batiment : '')));
    if (lot.exemple) vue.appendChild(alerte('info', 'Ceci est un exemple pour découvrir PouletPilot. Supprimez-le quand vous voulez (en bas de la page).'));
    if (!mod) vue.appendChild(h('div', { class: 'alerte attention lecture-seule' }, icone('verrou'), h('div', { class: 'texte' },
      'Lecture seule : sans pass, un seul lot en cours peut recevoir des saisies. Vos chiffres restent visibles et exportables.'), lienBouton('#/pass', 'Voir les pass', 'accent petit')));

    if (!fini && mod) {
      var base = '#/lot/' + id;
      vue.appendChild(h('nav', { class: 'actions', 'aria-label': 'Ajouter une saisie' },
        lienBouton(base + '/jour/' + aujourdhui(), 'Saisie du jour (morts, aliment)', 'principal', 'jour'),
        lienBouton(base + '/ajout/pesee', 'Pesée', 'secondaire', 'pesee'),
        lienBouton(base + '/ajout/achat', 'Achat d’aliment', 'secondaire', 'achat'),
        lienBouton(base + '/ajout/depense', 'Dépense', 'secondaire', 'depense'),
        lienBouton(base + '/ajout/vente', 'Vente', 'secondaire', 'vente'),
        lienBouton(base + '/ajout/note', 'Note', 'secondaire', 'note'),
        lienBouton(base + '/journal', 'Journal', 'secondaire', 'csv')));
    } else if (fini && mod) {
      vue.appendChild(h('div', { class: 'boutons' }, lienBouton('#/lot/' + id + '/ajout/vente', 'Ajouter une vente', 'secondaire', 'vente'),
        lienBouton('#/lot/' + id + '/ajout/depense', 'Ajouter une dépense', 'secondaire', 'depense')));
    }

    al.forEach(function (a) { vue.appendChild(alerte(a.niveau, a.texte)); });

    // Les poulets
    var repTxt = b.repereActuelG ? 'repère ' + PP.nombre(b.repereActuelG) + '\u00a0g' : null;
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 's-poulets' }, h('h2', { id: 's-poulets' }, 'Les poulets'),
      h('div', { class: 'kpis' },
        kpi('Poulets restants', PP.nombre(b.vivants), 'sur ' + PP.nombre(b.nbPoussins) + ' poussins', { id: 'vivants' }),
        kpi('Mortalité', PP.pct(b.tauxMortalite), pluriel(b.morts, 'mort'), { id: 'mortalite' }),
        kpi('Poids moyen', b.poidsMoyenG != null ? PP.nombre(b.poidsMoyenG) + '\u00a0g' : '—', b.dernierePesee ? 'jour ' + b.dernierePesee.age + (repTxt ? ' · ' + repTxt : '') : 'aucune pesée', { id: 'poids' }),
        kpi('Poulets vendus', PP.nombre(b.vendus), b.kgVendus > 0 ? PP.kg(b.kgVendus, 0) : null, { id: 'vendus' }))));

    // L'aliment
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 's-aliment' }, h('h2', { id: 's-aliment' }, 'L’aliment'),
      h('div', { class: 'kpis' },
        kpi('Indice de consommation', b.ic != null ? PP.nombre(b.ic, 2) : '—', b.ic != null ? 'kg d’aliment pour 1 kg de poulet' : 'il faut une pesée et l’aliment', { id: 'ic' }),
        kpi('Aliment consommé', PP.kg(b.alimentKg, 0), b.sourceAliment === 'achete' ? 'd’après les sacs achetés' : (b.alimentParPoulet != null ? PP.kg(b.alimentParPoulet, 2) + ' par poulet' : null), { id: 'aliment' }),
        b.stockAlimentKg != null ? kpi('Stock d’aliment', PP.kg(b.stockAlimentKg, 0), 'acheté − donné', { id: 'stock' }) : null,
        b.prixKgAliment != null ? kpi('Prix moyen de l’aliment', PP.fcfa(b.prixKgAliment) + '/kg', null) : null),
      h('details', null, h('summary', null, 'Comment c’est calculé ?'),
        h('p', { class: 'petit' }, 'Indice de consommation (IC) = aliment consommé (kg) ÷ poids vif gagné (kg). Le poids gagné = poulets présents × poids moyen + kg déjà vendus − poids des poussins à l’arrivée. Plus l’IC est bas, moins il faut d’aliment pour faire 1 kg de poulet.'),
        b.ic != null ? h('p', { class: 'petit', 'data-ic-detail': '1' }, 'Pour ce lot' + (b.icDate ? ' au ' + PP.dateFr(b.icDate) : '') + ' : ' + PP.kg(b.icAlimentKg, 1) + ' d’aliment ÷ ' + PP.kg(b.gainKg, 1) + ' de poids gagné = ' + PP.nombre(b.ic, 2) + '.') : null)));

    // L'argent
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 's-argent' }, h('h2', { id: 's-argent' }, 'L’argent'),
      h('div', { class: 'kpis' },
        kpi('Coût total', PP.fcfa(b.coutTotal), 'poussins compris', { id: 'cout' }),
        kpi('Coût par poulet', PP.fcfa(b.coutParPoulet), b.coutParKg != null ? PP.fcfa(b.coutParKg) + ' par kg vif' : null, { id: 'cout-poulet' }),
        kpi('Recettes', PP.fcfa(b.recettes), b.prixMoyenPoulet != null ? PP.fcfa(b.prixMoyenPoulet) + ' par poulet en moyenne' : null, { id: 'recettes' }),
        kpi('Marge', PP.fcfa(b.marge), b.margeParPoulet != null ? PP.fcfa(b.margeParPoulet) + ' par poulet' : null, { signe: b.marge, id: 'marge' }),
        kpi('Trésorerie du lot', PP.fcfa(b.tresorerie), 'argent reçu − dépensé', { signe: b.tresorerie, id: 'tresorerie' }),
        b.aRecevoir > 0 ? kpi('À recevoir', PP.fcfa(b.aRecevoir), 'clients qui doivent encore', { id: 'a-recevoir' }) : null,
        b.vivants > 0 ? kpi('Prix minimum par poulet', PP.fcfa(b.seuilParPoulet), (b.seuilParKg != null ? PP.fcfa(b.seuilParKg) + ' par kg · ' : '') + 'pour ne pas perdre d’argent', { large: true, id: 'seuil' }) : null),
      h('details', null, h('summary', null, 'Comment c’est calculé ?'),
        h('p', { class: 'petit' }, 'Coût par poulet = coût total ÷ poulets arrivés au bout (poussins − morts). Marge = recettes − coût total. Trésorerie = argent reçu − dépenses. Prix minimum = (coût total − recettes déjà faites) ÷ poulets restants : si vous vendez en dessous, le lot perd de l’argent (avec les dépenses notées à ce jour).'))));

    // Graphiques
    var g = h('section', { class: 'carte', 'aria-labelledby': 's-graph' }, h('h2', { id: 's-graph' }, 'Courbes'));
    var axeMax = Math.max(b.lot.ageVente, b.age);
    var rep = E.reglages.repere.filter(function (p) { return p.age <= axeMax; });
    var repFin = PP.repereA(E.reglages.repere, axeMax);
    if (repFin && (!rep.length || rep[rep.length - 1].age < axeMax)) rep.push({ age: axeMax, g: repFin });
    g.appendChild(h('h3', null, 'Poids moyen (g) selon l’âge (jours)'));
    if (b.pesees.length) {
      g.appendChild(PPG.courbe({
        titre: 'Poids moyen : ' + b.pesees.map(function (p) { return 'jour ' + p.age + ' ' + Math.round(p.g) + '\u00a0g'; }).join(', '),
        series: [{ nom: 'Vos pesées', style: 1, points: b.pesees.map(function (p) { return { x: p.age, y: p.g }; }) },
          { nom: 'Vos repères (à adapter)', style: 2, points: rep.map(function (p) { return { x: p.age, y: p.g }; }) }],
        xMax: axeMax,
        lire: function (x) {
          var p = null; b.pesees.forEach(function (q) { if (q.age === x) p = q; });
          var r = PP.repereA(E.reglages.repere, x);
          return 'Jour ' + x + ' : ' + (p ? PP.nombre(p.g) + '\u00a0g' : '—') + (r ? ' · repère ' + PP.nombre(r) + '\u00a0g' : '');
        },
        entetes: ['Jour', 'Poids moyen', 'Repère'],
        lignes: b.pesees.map(function (p) { var r = PP.repereA(E.reglages.repere, p.age); return [String(p.age), PP.nombre(p.g) + '\u00a0g', r ? PP.nombre(r) + '\u00a0g' : '—']; })
      }));
    } else g.appendChild(h('p', { class: 'discret' }, 'Ajoutez une pesée pour voir la courbe de poids.'));
    var serie = PP.serieJournaliere(b);
    g.appendChild(h('h3', null, 'Morts par jour'));
    if (b.morts > 0) {
      g.appendChild(PPG.colonnes({
        titre: 'Morts par jour, total ' + b.morts,
        valeurs: serie.map(function (s) { return { x: s.age, y: s.morts, date: s.date }; }),
        lire: function (v) { return 'Jour ' + v.x + ' (' + PP.dateCourte(v.date) + ') : ' + pluriel(v.y, 'mort'); },
        entetes: ['Jour', 'Date', 'Morts'],
        lignes: serie.filter(function (s) { return s.morts > 0; }).map(function (s) { return [String(s.age), PP.dateFr(s.date), String(s.morts)]; })
      }));
    } else g.appendChild(h('p', { class: 'discret' }, 'Aucun mort noté.'));
    g.appendChild(h('h3', null, 'Dépenses par poste'));
    var postes = PP.CATEGORIES.filter(function (c) { return b.depenses[c.id] > 0; }).sort(function (x, y) { return b.depenses[y.id] - b.depenses[x.id]; });
    g.appendChild(PPG.barresH(postes.map(function (c) {
      return { nom: c.nom, valeur: b.depenses[c.id], texte: PP.fcfa(b.depenses[c.id]) + ' · ' + PP.pct(b.depenses[c.id] / (b.coutTotal || 1), 0) };
    }), 'Dépenses par poste'));
    vue.appendChild(g);

    // Estimation (pass)
    if (!fini) vue.appendChild(sectionProjection(b, proj));

    // Journal
    var j = h('section', { class: 'carte', 'aria-labelledby': 's-journal' }, h('h2', { id: 's-journal' }, 'Journal'));
    var ops = PP.trierOps(opsDe(id)).reverse();
    if (!ops.length) j.appendChild(h('p', { class: 'discret' }, 'Rien de noté pour l’instant. Commencez par la saisie du jour.'));
    else {
      j.appendChild(listeJournal(lot, ops.slice(0, 12), mod));
      if (ops.length > 12) j.appendChild(lienBouton('#/lot/' + id + '/journal', 'Voir tout le journal (' + ops.length + ')', 'secondaire large'));
    }
    vue.appendChild(j);

    // Exports et gestion du lot
    var actions = h('section', { class: 'carte', 'aria-labelledby': 's-actions' }, h('h2', { id: 's-actions' }, 'Rapports et gestion'),
      h('div', { class: 'boutons' },
        bouton(premium() ? 'Rapport PDF' : 'Rapport PDF (pass)', premium() ? '' : 'secondaire', function () { faireRapport(lot); }, premium() ? 'pdf' : 'verrou', { 'data-action': 'pdf' }),
        bouton('Journal (CSV)', 'secondaire', function () { exporterJournal(lot); }, 'csv', { 'data-action': 'csv' })),
      h('div', { id: 'fichier-pret' }),
      h('div', { class: 'boutons' },
        mod ? lienBouton('#/lot/' + id + '/modifier', 'Modifier le lot', 'secondaire', 'modifier') : null,
        fini ? bouton('Reprendre ce lot', 'secondaire', function () { reprendreLot(lot); }, 'drapeau')
          : (mod || !premium() ? bouton('Terminer ce lot', 'secondaire', function () { terminerLot(lot, b); }, 'drapeau') : null),
        bouton(lot.exemple ? 'Supprimer l’exemple' : 'Supprimer ce lot', 'danger', function () { supprimerLot(lot); }, 'corbeille')));
    vue.appendChild(actions);
  }

  function sectionProjection(b, proj) {
    if (!premium()) {
      return h('section', { class: 'carte verrou', 'aria-labelledby': 's-proj' }, h('h2', { id: 's-proj' }, icone('verrou'), 'Estimation de fin de lot'),
        h('p', null, 'Avec un pass, PouletPilot estime vos poulets, leur poids, l’aliment à acheter, votre prix minimum et votre marge à l’âge de vente.'),
        lienBouton('#/pass', 'Voir les pass', 'accent', 'etoile'));
    }
    var s = h('section', { class: 'carte', 'aria-labelledby': 's-proj', 'data-section': 'projection' },
      h('h2', { id: 's-proj' }, 'Estimation à ' + proj.ageVente + ' jours'));
    if (b.vivants <= 0) {
      s.appendChild(h('p', null, 'Tous les poulets sont sortis : les chiffres du lot sont définitifs.'));
      return s;
    }
    if (proj.joursRestants <= 0) {
      s.appendChild(h('p', null, 'L’âge de vente prévu est atteint. Les chiffres du lot sont ceux d’aujourd’hui.'));
      return s;
    }
    s.appendChild(h('p', { class: 'discret' }, 'Estimation (pas une promesse) : dans ' + pluriel(proj.joursRestants, 'jour') + ', si tout continue comme ces derniers jours.'));
    s.appendChild(h('div', { class: 'kpis' },
      kpi('Poulets restants', PP.nombre(Math.round(proj.vivantsFin)), proj.mortsPrevues > 0 ? 'environ ' + PP.nombre(Math.round(proj.mortsPrevues)) + ' morts de plus' : null, { id: 'p-vivants' }),
      kpi('Poids moyen', proj.poidsFinG != null ? PP.nombre(proj.poidsFinG) + '\u00a0g' : '—', proj.methodePoids === 'repere' ? 'à ' + PP.pct(proj.ratioRepere, 0) + ' de vos repères' : (proj.methodePoids ? 'au rythme des dernières pesées' : 'il faut une pesée'), { id: 'p-poids' }),
      kpi('Aliment à acheter', proj.sacsAAcheter != null ? pluriel(proj.sacsAAcheter, 'sac') : '—', proj.alimentRestantKg != null ? PP.kg(proj.alimentRestantKg, 0) + ' encore à donner' : 'notez l’aliment donné', { id: 'p-aliment' }),
      kpi('Coût total en fin de lot', PP.fcfa(proj.coutFin), proj.complet ? null : 'sans le prix de l’aliment (aucun achat noté)', { id: 'p-cout' }),
      kpi('Prix minimum par poulet', PP.fcfa(proj.seuilFin), proj.seuilFinKg != null ? PP.fcfa(proj.seuilFinKg) + ' par kg' : null, { id: 'p-seuil' }),
      kpi('Marge estimée', proj.margeFin != null ? PP.fcfa(proj.margeFin) : '—', proj.prix != null ? 'à ' + PP.fcfa(proj.prix) + (proj.unite === 'kg' ? ' le kg' : ' le poulet') + (proj.sourcePrix === 'ventes' ? ' (vos ventes)' : '') : 'indiquez un prix de vente prévu dans « Modifier le lot »', { signe: proj.margeFin, id: 'p-marge' })));
    s.appendChild(h('details', null, h('summary', null, 'Comment c’est estimé ?'),
      h('ul', { class: 'petit' },
        h('li', null, 'Morts : ' + PP.nombreCourt(proj.rythme.mortsParJour, 1) + ' par jour en moyenne sur les ' + pluriel(proj.rythme.jours, 'dernier jour saisi', 'derniers jours saisis') + '.'),
        h('li', null, 'Poids : ' + (proj.methodePoids === 'repere' ? 'votre dernière pesée est à ' + PP.pct(proj.ratioRepere, 0) + ' de vos repères ; on suppose que cela continue.' : 'on prolonge le gain de poids par jour des dernières pesées.')),
        h('li', null, 'Aliment : ' + (proj.alimentParJour != null ? PP.kg(proj.alimentParJour, 0) + ' par jour (rythme récent), moins le stock déjà acheté.' : 'pas encore de données.')),
        h('li', null, 'Électricité et main-d’œuvre : au même rythme par jour. Les autres dépenses (soins, transport…) ne sont pas prévues : gardez une marge.'))));
    return s;
  }

  function resumeOp(op) {
    var t = PP.TYPES_OP[op.type] || op.type, d = '', m = null, ic = 'note';
    if (op.type === 'jour') {
      ic = 'jour'; var parts = [pluriel(PP.n(op.morts), 'mort')];
      if (PP.n(op.sacs)) parts.push(PP.nombreCourt(PP.n(op.sacs), 2) + ' sac' + (PP.n(op.sacs) >= 2 ? 's' : '') + ' (' + PP.kg(PP.kgAlimentJour(op, E.reglages), 1) + ')');
      if (PP.n(op.eau)) parts.push('eau ' + PP.nombreCourt(PP.n(op.eau), 1) + ' L');
      if (op.note) parts.push(op.note);
      d = parts.join(' · ');
    } else if (op.type === 'pesee') { ic = 'pesee'; d = (PP.n(op.nb) ? pluriel(PP.n(op.nb), 'poulet pesé', 'poulets pesés') + ' · ' : '') + PP.nombre(PP.n(op.poidsG)) + ' g en moyenne'; }
    else if (op.type === 'achat') { ic = 'achat'; d = pluriel(PP.n(op.sacs), 'sac') + ' de ' + PP.nombreCourt(PP.n(op.kgParSac) || E.reglages.kgParSac, 1) + ' kg' + (op.fournisseur ? ' · ' + op.fournisseur : ''); m = '−' + PP.fcfa(PP.coutAchat(op)); }
    else if (op.type === 'depense') { ic = 'depense'; t = PP.nomCategorie(op.categorie); d = op.libelle || 'Dépense'; m = '−' + PP.fcfa(PP.n(op.montant)); }
    else if (op.type === 'vente') { ic = 'vente'; d = pluriel(PP.n(op.nb), 'poulet') + (op.acheteur ? ' · ' + op.acheteur : '') + (PP.encaisseVente(op) < PP.montantVente(op) ? ' · reste ' + PP.fcfa(PP.montantVente(op) - PP.encaisseVente(op)) : ''); m = '+' + PP.fcfa(PP.montantVente(op)); }
    else if (op.type === 'note') { ic = 'note'; d = op.texte || ''; }
    return { titre: t, detail: d, montant: m, icone: ic };
  }
  function listeJournal(lot, ops, mod) {
    var frag = document.createDocumentFragment(), dateCour = null, ul = null;
    ops.forEach(function (op) {
      if (op.date !== dateCour) {
        dateCour = op.date;
        frag.appendChild(h('p', { class: 'jour-titre' }, PP.dateFr(op.date) + ' · jour ' + PP.diffJours(lot.dateDebut, op.date)));
        ul = h('ul', { class: 'journal' }); frag.appendChild(ul);
      }
      var r = resumeOp(op);
      var contenu = [h('span', { class: 'ico' }, icone(r.icone)), h('span', { class: 'quoi' }, h('b', null, r.titre), h('span', null, r.detail)), r.montant ? h('span', { class: 'montant' }, r.montant) : null];
      var href = op.type === 'jour' ? '#/lot/' + lot.id + '/jour/' + op.date : '#/lot/' + lot.id + '/op/' + op.id;
      ul.appendChild(h('li', null, mod ? h('a', { href: href, 'aria-label': r.titre + ', ' + r.detail + (r.montant ? ', ' + r.montant : '') + '. Modifier' }, contenu) : h('div', { class: 'entree' }, contenu)));
    });
    return frag;
  }
  function pageJournal(id) {
    var lot = lotParId(id); if (!lot) { aller('#/'); return; }
    var vue = cadre('Journal · ' + lot.nom, '#/lot/' + id, 'accueil'); bandeaux('journal');
    var ops = PP.trierOps(opsDe(id)).reverse();
    vue.appendChild(h('section', { class: 'carte' }, ops.length ? listeJournal(lot, ops, modifiable(lot)) : h('p', null, 'Journal vide.')));
  }

  // ---------- Formulaires : outils ----------
  function champ(label, input, aide, erreurId) {
    if (!input.id) input.id = 'c-' + Math.random().toString(36).slice(2, 8);
    var lab = h('label', { for: input.id }, label);
    var d = h('div', { class: 'champ' }, lab, input);
    if (aide) { var a = h('span', { class: 'aide', id: input.id + '-aide' }, aide); d.appendChild(a); input.setAttribute('aria-describedby', a.id); }
    d.appendChild(h('div', { class: 'erreur-champ', id: input.id + '-err', role: 'alert', hidden: true }));
    return d;
  }
  function entree(nom, valeur, type, attrs) {
    var a = { name: nom, id: 'c-' + nom, type: type || 'text', value: valeur == null ? '' : String(valeur) };
    if (type === 'nombre') { a.type = 'text'; a.inputmode = 'decimal'; a.autocomplete = 'off'; }
    if (type === 'entier') { a.type = 'text'; a.inputmode = 'numeric'; a.autocomplete = 'off'; a.pattern = '[0-9 ]*'; }
    if (attrs) for (var k in attrs) a[k] = attrs[k];
    var i = h('input', a);
    if (type === 'nombre' || type === 'entier') i.addEventListener('focus', function () { try { i.select(); } catch (e) { /* rien */ } });
    return i;
  }
  function erreur(form, nom, texte) {
    var i = form.querySelector('[name="' + nom + '"]'), z = document.getElementById(i.id + '-err');
    i.setAttribute('aria-invalid', 'true'); if (z) { z.textContent = texte; z.hidden = false; }
    i.focus();
    return false;
  }
  function effacerErreurs(form) {
    form.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
    form.querySelectorAll('.erreur-champ').forEach(function (z) { z.hidden = true; z.textContent = ''; });
  }
  function val(form, nom) { var i = form.querySelector('[name="' + nom + '"]'); return i ? i.value : ''; }
  function nb(form, nom) { var v = val(form, nom); return String(v).trim() === '' ? null : PP.lireNombre(v); }
  function compteur(nom, valeur, pas, label, aide) {
    var i = entree(nom, valeur, pas < 1 ? 'nombre' : 'entier', { 'aria-label': label });
    function changer(s) {
      var v = PP.lireNombre(i.value); if (!PP.estNombre(v)) v = 0;
      v = Math.max(0, Math.round((v + s) * 100) / 100);
      i.value = PP.nombreCourt(v, 2).replace(/ /g, '');
      i.dispatchEvent(new Event('input', { bubbles: true }));
    }
    var d = h('div', { class: 'champ' }, h('span', { class: 'label', id: 'l-' + nom }, label),
      h('div', { class: 'compteur', role: 'group', 'aria-labelledby': 'l-' + nom },
        h('button', { type: 'button', 'aria-label': 'Moins', onclick: function () { changer(-pas); } }, '−'), i,
        h('button', { type: 'button', 'aria-label': 'Plus', onclick: function () { changer(pas); } }, '+')));
    if (aide) d.appendChild(h('span', { class: 'aide' }, aide));
    d.appendChild(h('div', { class: 'erreur-champ', id: i.id + '-err', role: 'alert', hidden: true }));
    return d;
  }
  function boutonDicter(zone) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    var lib = h('span', null, 'Dicter la note'), rec = null;
    var btn = h('button', { type: 'button', class: 'btn secondaire petit dicter' }, icone('micro'), lib);
    btn.addEventListener('click', function () {
      if (rec) { try { rec.stop(); } catch (e) { /* déjà arrêté */ } return; }
      try { rec = new SR(); } catch (e) { toast('Dictée indisponible sur ce téléphone.'); return; }
      rec.lang = 'fr-FR'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
      rec.onresult = function (ev) {
        var t = ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : '';
        if (t) zone.value = (zone.value ? zone.value.replace(/\s+$/, '') + ' ' : '') + t;
      };
      rec.onerror = function (ev) {
        toast(ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'Micro refusé : autorisez-le dans les réglages du navigateur.' : ev.error === 'network' ? 'La dictée a besoin d’Internet.' : 'Dictée arrêtée.');
      };
      rec.onend = function () { rec = null; btn.classList.remove('actif'); lib.textContent = 'Dicter la note'; };
      try { rec.start(); btn.classList.add('actif'); lib.textContent = 'Parlez… (touchez pour arrêter)'; } catch (e) { rec = null; }
    });
    return btn;
  }
  function choixRadio(nom, options, courant, legende) {
    var fs = h('fieldset', null, h('legend', null, legende));
    var c = h('div', { class: 'choix' });
    options.forEach(function (o) {
      c.appendChild(h('label', null, h('input', { type: 'radio', name: nom, value: o.id, checked: o.id === courant }), h('span', null, o.nom)));
    });
    fs.appendChild(c);
    return fs;
  }
  function radio(form, nom) { var r = form.querySelector('[name="' + nom + '"]:checked'); return r ? r.value : null; }
  function verifierModifiable(lot) {
    if (modifiable(lot)) return true;
    toast('Ce lot est en lecture seule sans pass.');
    aller('#/lot/' + lot.id);
    return false;
  }

  // ---------- Créer / modifier un lot ----------
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function pageFormLot(id) {
    var lot = id ? lotParId(id) : null;
    if (id && !lot) { aller('#/'); return; }
    if (lot && !verifierModifiable(lot)) return;
    var vue = cadre(lot ? 'Modifier le lot' : 'Nouveau lot', lot ? '#/lot/' + id : '#/', 'accueil'); bandeaux('form');
    if (!lot && !PPL.peutCreerLot(E.lots, premium())) {
      vue.appendChild(h('div', { class: 'carte verrou' }, h('h2', null, icone('verrou'), 'Un lot est déjà en cours'),
        h('p', null, 'La version gratuite suit 1 lot en cours à la fois. Terminez votre lot en cours (bouton « Terminer ce lot ») ou prenez un pass pour suivre plusieurs lots en même temps.'),
        h('div', { class: 'boutons' }, lienBouton('#/pass', 'Voir les pass', 'accent', 'etoile'), lienBouton('#/', 'Retour à mes lots', 'secondaire'))));
      return;
    }
    var d = new Date();
    var nomDefaut = 'Lot ' + MOIS[d.getMonth()] + ' ' + d.getFullYear();
    var l = lot || { nom: nomDefaut, dateDebut: aujourdhui(), ageVente: E.reglages.ageVente, poidsPoussinG: E.reglages.poidsPoussinG };
    var form = h('form', { novalidate: true, class: 'carte', 'aria-label': lot ? 'Modifier le lot' : 'Nouveau lot' },
      champ('Nom du lot', entree('nom', l.nom, 'text', { maxlength: 60, required: true, autocomplete: 'off' })),
      champ('Date d’arrivée des poussins', entree('dateDebut', l.dateDebut, 'date', { required: true, max: aujourdhui() })),
      h('div', { class: 'deux' },
        champ('Nombre de poussins', entree('nbPoussins', l.nbPoussins, 'entier', { required: true })),
        champ('Prix d’un poussin (F)', entree('prixPoussin', l.prixPoussin, 'nombre', { required: true }))),
      champ('Souche (facultatif)', entree('souche', l.souche, 'text', { maxlength: 60, placeholder: 'Le nom donné par le couvoir', autocomplete: 'off' })),
      champ('Poulailler ou bâtiment (facultatif)', entree('batiment', l.batiment, 'text', { maxlength: 60, placeholder: 'Ex. : Poulailler 1', autocomplete: 'off' })),
      champ('Âge de vente prévu (jours)', entree('ageVente', l.ageVente, 'entier'), 'Sert au compte à rebours et aux estimations.'),
      h('details', { class: 'plus', open: !!(l.prixVentePrevu) },
        h('summary', null, 'Plus d’options'),
        choixRadio('uniteVente', [{ id: 'poulet', nom: 'Prix par poulet' }, { id: 'kg', nom: 'Prix au kg' }], l.uniteVente === 'kg' ? 'kg' : 'poulet', 'Je compte vendre'),
        champ('Prix de vente prévu (F, facultatif)', entree('prixVentePrevu', l.prixVentePrevu, 'nombre'), 'Pour estimer la marge et être prévenu si ce prix est trop bas.'),
        champ('Poids d’un poussin à l’arrivée (g)', entree('poidsPoussinG', l.poidsPoussinG, 'nombre'), 'Sert au calcul de l’indice de consommation. Pesez quelques poussins à l’arrivée si vous pouvez.')),
      h('div', { class: 'pied-form' }, h('button', { type: 'submit', class: 'btn large' }, icone('ok'), lot ? 'Enregistrer' : 'Créer le lot')));
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); effacerErreurs(form);
      var nom = val(form, 'nom').trim(), dd = val(form, 'dateDebut'), np = nb(form, 'nbPoussins'), pp = nb(form, 'prixPoussin');
      var av = nb(form, 'ageVente'), pv = nb(form, 'prixVentePrevu'), pg = nb(form, 'poidsPoussinG');
      if (!nom) return erreur(form, 'nom', 'Donnez un nom au lot.');
      if (!PP.dateValide(dd)) return erreur(form, 'dateDebut', 'Choisissez la date d’arrivée.');
      if (dd > aujourdhui()) return erreur(form, 'dateDebut', 'La date ne peut pas être dans le futur.');
      if (!(np > 0) || np !== Math.round(np) || np > 1000000) return erreur(form, 'nbPoussins', 'Indiquez le nombre de poussins (nombre entier).');
      if (pp == null || !(pp >= 0)) return erreur(form, 'prixPoussin', 'Indiquez le prix d’un poussin (0 si offert).');
      if (av != null && !(av >= 1 && av <= 150)) return erreur(form, 'ageVente', 'Entre 1 et 150 jours.');
      if (pv != null && !(pv >= 0)) return erreur(form, 'prixVentePrevu', 'Prix invalide.');
      if (pg != null && !(pg >= 0 && pg < 500)) return erreur(form, 'poidsPoussinG', 'Poids invalide (en grammes).');
      if (lot && opsDe(lot.id).some(function (o) { return o.date < dd; }) && !confirm('Des saisies sont datées avant cette date d’arrivée. Continuer quand même ?')) return;
      var n = lot ? JSON.parse(JSON.stringify(lot)) : { id: nouvelId(), statut: 'en_cours', cree: Date.now() };
      n.nom = nom.slice(0, 60); n.dateDebut = dd; n.nbPoussins = np; n.prixPoussin = pp;
      n.souche = val(form, 'souche').trim().slice(0, 60); n.batiment = val(form, 'batiment').trim().slice(0, 60);
      n.ageVente = av || E.reglages.ageVente; n.prixVentePrevu = pv || null; n.uniteVente = radio(form, 'uniteVente') === 'kg' ? 'kg' : 'poulet';
      n.poidsPoussinG = pg != null ? pg : E.reglages.poidsPoussinG;
      if (!lot && !PPL.peutCreerLot(E.lots, premium())) { toast('Limite de la version gratuite atteinte.'); aller('#/pass'); return; }
      enregistrerLot(n).then(function () { toast(lot ? 'Lot enregistré.' : 'Lot créé. Bonne bande !'); aller('#/lot/' + n.id); }).catch(echec);
    });
    vue.appendChild(form);
  }
  function echec(e) { console.warn(e); toast('Enregistrement impossible. Réessayez.'); }

  function terminerLot(lot, b) {
    var msg = b.vivants > 0 ? 'Il reste ' + pluriel(b.vivants, 'poulet') + ' non vendus ou non comptés. Terminer quand même ce lot ? Il restera consultable.' : 'Terminer ce lot ? Il restera consultable dans « Lots terminés ».';
    if (!confirm(msg)) return;
    var n = JSON.parse(JSON.stringify(lot)); n.statut = 'termine';
    var der = PP.trierOps(opsDe(lot.id)).pop();
    n.dateFin = der && der.date > aujourdhui() ? der.date : aujourdhui();
    if (der && der.date < n.dateFin && b.vivants <= 0) n.dateFin = der.date;
    enregistrerLot(n).then(function () { toast('Lot terminé.'); afficher(); }).catch(echec);
  }
  function reprendreLot(lot) {
    if (!premium() && !PPL.peutCreerLot(E.lots, false)) { toast('Sans pass, un seul lot peut être en cours.'); aller('#/pass'); return; }
    var n = JSON.parse(JSON.stringify(lot)); n.statut = 'en_cours'; n.dateFin = null;
    enregistrerLot(n).then(function () { toast('Lot repris.'); afficher(); }).catch(echec);
  }
  function supprimerLot(lot) {
    if (!confirm('Supprimer « ' + lot.nom + ' » et tout son journal ? Cette action est définitive.')) return;
    if (!lot.exemple && opsDe(lot.id).length > 5 && !confirm('Vraiment ? Pensez à faire une sauvegarde avant (Réglages).')) return;
    DB.supprimerLot(lot.id).then(function () {
      E.lots = E.lots.filter(function (l) { return l.id !== lot.id; }); delete E.ops[lot.id];
      toast('Lot supprimé.'); aller('#/');
    }).catch(echec);
  }

  // ---------- Saisie du jour ----------
  function pageJour(id, date) {
    var lot = lotParId(id); if (!lot) { aller('#/'); return; }
    if (!verifierModifiable(lot)) return;
    var auj = aujourdhui();
    if (!PP.dateValide(date)) date = auj;
    if (date > auj) date = auj;
    if (date < lot.dateDebut) date = lot.dateDebut;
    var vue = cadre('Saisie du jour', '#/lot/' + id, 'accueil'); bandeaux('form');
    var existant = opsDe(id).filter(function (o) { return o.type === 'jour' && o.date === date; })[0] || null;
    var dejaMorts = 0, dejaVendus = 0;
    opsDe(id).forEach(function (o) { if (o.date < date) { if (o.type === 'jour') dejaMorts += PP.n(o.morts); if (o.type === 'vente') dejaVendus += PP.n(o.nb); } });
    var presents = PP.n(lot.nbPoussins) - dejaMorts - dejaVendus;
    var dernierSac = null;
    PP.trierOps(opsDe(id)).forEach(function (o) { if ((o.type === 'jour' || o.type === 'achat') && PP.n(o.kgParSac)) dernierSac = PP.n(o.kgParSac); });
    var kgSac = existant && PP.n(existant.kgParSac) ? PP.n(existant.kgParSac) : (dernierSac || E.reglages.kgParSac);
    var age = PP.diffJours(lot.dateDebut, date);

    var navDate = h('div', { class: 'nav-date' },
      h('button', { type: 'button', 'aria-label': 'Jour précédent', disabled: date <= lot.dateDebut, onclick: function () { aller('#/lot/' + id + '/jour/' + PP.ajouterJours(date, -1)); } }, '‹'),
      entree('date', date, 'date', { min: lot.dateDebut, max: auj, 'aria-label': 'Date de la saisie' }),
      h('button', { type: 'button', 'aria-label': 'Jour suivant', disabled: date >= auj, onclick: function () { aller('#/lot/' + id + '/jour/' + PP.ajouterJours(date, 1)); } }, '›'));
    navDate.querySelector('input').addEventListener('change', function (ev) { if (PP.dateValide(ev.target.value)) aller('#/lot/' + id + '/jour/' + ev.target.value); });
    var note = h('textarea', { name: 'note', id: 'c-note', maxlength: 500, placeholder: 'Ce que vous avez remarqué aujourd’hui (facultatif)' }, existant ? existant.note || '' : '');
    var form = h('form', { novalidate: true, 'aria-label': 'Saisie du jour' },
      h('div', { class: 'carte' },
        navDate,
        h('p', { class: 'discret', style: 'margin-bottom:0' }, (date === auj ? 'Aujourd’hui' : PP.dateFr(date)) + ' · jour ' + age + ' · ' + pluriel(presents, 'poulet') + ' au début de la journée' + (existant ? ' · déjà saisi, vous pouvez corriger' : ''))),
      h('div', { class: 'carte' },
        compteur('morts', existant ? PP.n(existant.morts) : 0, 1, 'Morts aujourd’hui'),
        compteur('sacs', existant ? PP.n(existant.sacs) : 0, 1, 'Sacs d’aliment donnés', 'Une moitié de sac ? Tapez 0,5.'),
        h('div', { class: 'deux' },
          champ('Poids d’un sac (kg)', entree('kgParSac', kgSac, 'nombre')),
          champ('Eau (litres)', entree('eau', existant && existant.eau ? existant.eau : '', 'nombre', { placeholder: 'facultatif' }))),
        h('p', { class: 'total-direct', id: 'total-jour', 'aria-live': 'polite' }),
        champ('Note (facultatif)', note), boutonDicter(note)),
      h('p', { class: 'discret petit' }, 'PouletPilot ne donne pas d’avis de santé. Si des poulets sont malades, consultez un vétérinaire.'),
      h('div', { class: 'pied-form boutons' },
        h('button', { type: 'submit', class: 'btn', name: 'action', value: 'ok' }, icone('ok'), 'Enregistrer'),
        date < auj ? h('button', { type: 'submit', class: 'btn secondaire', name: 'action', value: 'suivant' }, 'Enregistrer et jour suivant') : null));
    function total() {
      var s = nb(form, 'sacs') || 0, k = nb(form, 'kgParSac') || 0, m = nb(form, 'morts') || 0;
      $('#total-jour').textContent = 'Aliment : ' + PP.kg(s * k, 1) + ' · Poulets à la fin de la journée : ' + PP.nombre(presents - m);
    }
    form.addEventListener('input', total);
    var actionSoumise = 'ok';
    form.addEventListener('click', function (ev) { var t = ev.target.closest('button[type="submit"]'); if (t) actionSoumise = t.value; });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); effacerErreurs(form);
      var m = nb(form, 'morts'), s = nb(form, 'sacs'), k = nb(form, 'kgParSac'), e = nb(form, 'eau');
      if (m == null) m = 0; if (s == null) s = 0;
      if (!(m >= 0) || m !== Math.round(m)) return erreur(form, 'morts', 'Nombre entier de morts (0 s’il n’y en a pas).');
      if (m > presents && !confirm('Plus de morts (' + m + ') que de poulets présents (' + presents + '). Enregistrer quand même ?')) return;
      if (!(s >= 0) || s > 1000) return erreur(form, 'sacs', 'Nombre de sacs invalide.');
      if (!(k > 0) || k > 200) return erreur(form, 'kgParSac', 'Poids du sac en kg (par exemple 50).');
      if (e != null && !(e >= 0)) return erreur(form, 'eau', 'Quantité d’eau invalide.');
      var op = existant ? JSON.parse(JSON.stringify(existant)) : { id: nouvelId(), lotId: id, type: 'jour', date: date };
      op.morts = m; op.sacs = s; op.kgParSac = k; op.eau = e || 0; op.note = val(form, 'note').trim().slice(0, 500);
      var suivant = actionSoumise === 'suivant';
      enregistrerOp(op).then(function () {
        toast('Journée du ' + PP.dateFr(date) + ' enregistrée.');
        aller(suivant ? '#/lot/' + id + '/jour/' + PP.ajouterJours(date, 1) : '#/lot/' + id);
      }).catch(echec);
    });
    vue.appendChild(form);
    total();
  }

  // ---------- Autres saisies (pesée, achat, dépense, vente, note) ----------
  var TITRES = { pesee: 'Pesée', achat: 'Achat d’aliment', depense: 'Dépense', vente: 'Vente', note: 'Note' };
  var ENREGISTRE = { pesee: 'Pesée enregistrée.', achat: 'Achat d’aliment enregistré.', depense: 'Dépense enregistrée.', vente: 'Vente enregistrée.', note: 'Note enregistrée.' };
  function pageOp(id, type, opId) {
    var lot = lotParId(id); if (!lot) { aller('#/'); return; }
    var op = null;
    if (opId) { op = opsDe(id).filter(function (o) { return o.id === opId; })[0]; if (!op) { aller('#/lot/' + id); return; } type = op.type; }
    if (!TITRES[type]) { aller('#/lot/' + id); return; }
    if (!verifierModifiable(lot)) return;
    var vue = cadre((op ? 'Modifier : ' : '') + TITRES[type], '#/lot/' + id, 'accueil'); bandeaux('form');
    var o = op || {};
    var auj = aujourdhui();
    var b = bilan(lot);
    var champs = [champ('Date', entree('date', o.date || auj, 'date', { min: lot.dateDebut, max: auj, required: true }))];
    var info = h('p', { class: 'total-direct', 'aria-live': 'polite', id: 'total-op' });
    var note = null;
    if (type === 'pesee') {
      champs.push(h('div', { class: 'deux' },
        champ('Poulets pesés', entree('nb', o.nb || 10, 'entier')),
        champ('Poids moyen (g)', entree('poidsG', o.poidsG, 'nombre', { required: true }))));
      champs.push(champ('Ou poids total des poulets pesés (kg)', entree('total', '', 'nombre'), 'Si vous pesez un groupe ensemble : PouletPilot calcule le poids moyen.'));
      champs.push(h('p', { class: 'discret petit' }, 'Conseil : pesez 10 à 20 poulets pris au hasard, à différents endroits du poulailler.'));
      champs.push(info);
    } else if (type === 'achat') {
      champs.push(h('div', { class: 'deux' },
        champ('Nombre de sacs', entree('sacs', o.sacs, 'nombre', { required: true })),
        champ('Poids d’un sac (kg)', entree('kgParSac', o.kgParSac || E.reglages.kgParSac, 'nombre'))));
      champs.push(champ('Prix d’un sac (F)', entree('prixSac', o.prixSac, 'nombre', { required: true })));
      champs.push(champ('Fournisseur (facultatif)', entree('fournisseur', o.fournisseur, 'text', { maxlength: 80, autocomplete: 'off' })));
      champs.push(info);
    } else if (type === 'depense') {
      champs.push(choixRadio('categorie', PP.CATEGORIES, o.categorie || 'soins', 'Poste de dépense'));
      champs.push(champ('Montant (F)', entree('montant', o.montant, 'nombre', { required: true })));
      champs.push(champ('Détail (facultatif)', entree('libelle', o.libelle, 'text', { maxlength: 100, autocomplete: 'off', placeholder: 'Ex. : copeaux, facture Senelec, salaire…' })));
      champs.push(h('p', { class: 'discret petit' }, 'Le prix des poussins est déjà compté depuis la fiche du lot. Pour les médicaments, notez seulement la dépense : pour la santé des poulets, consultez un vétérinaire.'));
    } else if (type === 'vente') {
      champs.push(champ('Nombre de poulets vendus', entree('nb', o.nb, 'entier', { required: true }), 'Poulets restants avant cette vente : ' + PP.nombre(b.vivants + (op ? PP.n(op.nb) : 0)) + '. Poulets gardés ou donnés : mettez un prix de 0.'));
      champs.push(choixRadio('mode', [{ id: 'poulet', nom: 'Prix par poulet' }, { id: 'kg', nom: 'Prix au kg' }], o.mode === 'kg' ? 'kg' : 'poulet', 'Vous vendez'));
      champs.push(h('div', { class: 'deux' },
        champ('Prix (F)', entree('prix', o.prix, 'nombre', { required: true }), null),
        champ('Poids total (kg)', entree('kg', o.kg, 'nombre'), null)));
      champs.push(champ('Acheteur (facultatif)', entree('acheteur', o.acheteur, 'text', { maxlength: 80, autocomplete: 'off', placeholder: 'Ex. : restaurant, revendeuse, voisins' })));
      var toutPaye = o.encaisse == null || o.encaisse === '' || PP.n(o.encaisse) >= PP.montantVente(o);
      champs.push(h('label', { class: 'case' }, h('input', { type: 'checkbox', name: 'toutPaye', checked: toutPaye }), 'Le client a tout payé'));
      champs.push(h('div', { id: 'zone-recu', hidden: toutPaye }, champ('Montant déjà reçu (F)', entree('encaisse', toutPaye ? '' : o.encaisse, 'nombre'))));
      champs.push(info);
    } else if (type === 'note') {
      note = h('textarea', { name: 'texte', id: 'c-texte', maxlength: 1000, required: true }, o.texte || '');
      champs.push(champ('Votre note', note));
      champs.push(boutonDicter(note));
    }
    var form = h('form', { novalidate: true, 'aria-label': TITRES[type] },
      h('div', { class: 'carte' }, champs),
      h('div', { class: 'pied-form boutons' },
        h('button', { type: 'submit', class: 'btn' }, icone('ok'), 'Enregistrer'),
        op ? bouton('Supprimer', 'danger', function () {
          if (!confirm('Supprimer cette saisie ?')) return;
          supprimerOp(op).then(function () { toast('Saisie supprimée.'); aller('#/lot/' + id); }).catch(echec);
        }, 'corbeille') : null));

    function maj() {
      if (type === 'pesee') {
        var t = nb(form, 'total'), n = nb(form, 'nb');
        if (t > 0 && n > 0) form.querySelector('[name="poidsG"]').value = String(Math.round(t * 1000 / n));
        var d = val(form, 'date'), g = nb(form, 'poidsG');
        var r = PP.dateValide(d) ? PP.repereA(E.reglages.repere, PP.diffJours(lot.dateDebut, d)) : null;
        info.textContent = r ? 'Votre repère à ' + PP.diffJours(lot.dateDebut, d) + ' jours : ' + PP.nombre(r) + '\u00a0g' + (g > 0 ? ' (vous : ' + PP.pct(g / r, 0) + ')' : '') : 'Pas de repère pour cet âge.';
      } else if (type === 'achat') {
        var s = nb(form, 'sacs') || 0, k = nb(form, 'kgParSac') || 0, p = nb(form, 'prixSac') || 0;
        info.textContent = 'Total : ' + PP.fcfa(s * p) + ' pour ' + PP.kg(s * k, 0) + (s * k > 0 ? ' (' + PP.fcfa(p / (k || 1)) + ' le kg)' : '');
      } else if (type === 'vente') {
        var mode = radio(form, 'mode'), q = nb(form, 'nb') || 0, pr = nb(form, 'prix') || 0, kgv = nb(form, 'kg') || 0;
        var lp = form.querySelector('label[for="c-prix"]'), lk = form.querySelector('label[for="c-kg"]');
        lp.textContent = mode === 'kg' ? 'Prix du kg (F)' : 'Prix d’un poulet (F)';
        lk.textContent = 'Poids total (kg)';
        form.querySelector('[name="kg"]').placeholder = mode === 'kg' ? 'obligatoire' : 'facultatif';
        var tot = mode === 'kg' ? kgv * pr : q * pr;
        $('#zone-recu').hidden = form.querySelector('[name="toutPaye"]').checked;
        info.textContent = 'Montant de la vente : ' + PP.fcfa(tot) + (q > 0 && tot > 0 ? ' · ' + PP.fcfa(tot / q) + ' par poulet' : '') +
          (b.seuilParPoulet != null && q > 0 && tot > 0 && tot / q < b.seuilParPoulet && pr > 0 ? ' · sous votre prix minimum (' + PP.fcfa(b.seuilParPoulet) + ')' : '');
      }
    }
    form.addEventListener('input', maj); form.addEventListener('change', maj);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); effacerErreurs(form);
      var d = val(form, 'date');
      if (!PP.dateValide(d) || d > auj) return erreur(form, 'date', 'Choisissez une date (pas dans le futur).');
      if (d < lot.dateDebut) return erreur(form, 'date', 'Date avant l’arrivée des poussins (' + PP.dateFr(lot.dateDebut) + ').');
      var n = op ? JSON.parse(JSON.stringify(op)) : { id: nouvelId(), lotId: id, type: type };
      n.date = d;
      if (type === 'pesee') {
        var g = nb(form, 'poidsG'), q = nb(form, 'nb');
        if (!(g > 0) || g > 10000) return erreur(form, 'poidsG', 'Poids moyen en grammes (par exemple 1250).');
        if (q != null && !(q >= 1 && q === Math.round(q))) return erreur(form, 'nb', 'Nombre entier de poulets pesés.');
        n.poidsG = g; n.nb = q || 1;
      } else if (type === 'achat') {
        var s = nb(form, 'sacs'), k = nb(form, 'kgParSac'), p = nb(form, 'prixSac');
        if (!(s > 0)) return erreur(form, 'sacs', 'Nombre de sacs achetés.');
        if (!(k > 0) || k > 200) return erreur(form, 'kgParSac', 'Poids d’un sac en kg.');
        if (p == null || !(p >= 0)) return erreur(form, 'prixSac', 'Prix d’un sac en francs.');
        n.sacs = s; n.kgParSac = k; n.prixSac = p; n.fournisseur = val(form, 'fournisseur').trim().slice(0, 80);
      } else if (type === 'depense') {
        var mt = nb(form, 'montant');
        if (!(mt > 0)) return erreur(form, 'montant', 'Montant en francs.');
        n.categorie = radio(form, 'categorie') || 'autre'; n.montant = mt; n.libelle = val(form, 'libelle').trim().slice(0, 100);
      } else if (type === 'vente') {
        var qv = nb(form, 'nb'), pr = nb(form, 'prix'), kgv = nb(form, 'kg'), mode = radio(form, 'mode') === 'kg' ? 'kg' : 'poulet';
        if (!(qv > 0) || qv !== Math.round(qv)) return erreur(form, 'nb', 'Nombre entier de poulets vendus.');
        if (pr == null || !(pr >= 0)) return erreur(form, 'prix', 'Prix en francs (0 pour des poulets donnés).');
        if (mode === 'kg' && !(kgv > 0)) return erreur(form, 'kg', 'Pour un prix au kg, indiquez le poids total vendu.');
        if (kgv != null && !(kgv >= 0)) return erreur(form, 'kg', 'Poids invalide.');
        var dispo = b.vivants + (op ? PP.n(op.nb) : 0);
        if (qv > dispo && !confirm('Vous vendez ' + qv + ' poulets mais il en reste ' + dispo + ' d’après le journal. Enregistrer quand même ?')) return;
        n.nb = qv; n.prix = pr; n.kg = kgv || null; n.mode = mode; n.acheteur = val(form, 'acheteur').trim().slice(0, 80);
        var montant = PP.montantVente(n);
        if (form.querySelector('[name="toutPaye"]').checked) n.encaisse = null;
        else {
          var en = nb(form, 'encaisse');
          if (en == null || !(en >= 0)) return erreur(form, 'encaisse', 'Montant reçu (0 si rien encore).');
          if (en > montant) return erreur(form, 'encaisse', 'Plus que le montant de la vente (' + PP.fcfa(montant) + ').');
          n.encaisse = en;
        }
      } else if (type === 'note') {
        var tx = val(form, 'texte').trim();
        if (!tx) return erreur(form, 'texte', 'Écrivez ou dictez votre note.');
        n.texte = tx.slice(0, 1000);
      }
      enregistrerOp(n).then(function () { toast(ENREGISTRE[type]); aller('#/lot/' + id); }).catch(echec);
    });
    vue.appendChild(form);
    maj();
  }

  // ---------- Comparer les lots ----------
  function pageComparer() {
    var vue = cadre('Comparer mes lots', null, 'comparer'); bandeaux('comparer');
    var paires = E.lots.map(function (l) { return { lot: l, bilan: bilan(l) }; }).sort(function (a, b) { return a.lot.dateDebut < b.lot.dateDebut ? -1 : 1; });
    if (!premium()) {
      vue.appendChild(h('div', { class: 'carte verrou' }, h('h2', null, icone('verrou'), 'Comparer vos lots'),
        h('p', null, 'Avec un pass, voyez côte à côte la mortalité, l’indice de consommation, le coût par poulet et la marge de chaque lot, pour savoir ce qui a le mieux marché.'),
        h('p', { class: 'discret' }, 'Vos chiffres restent à vous : le résumé de tous les lots en CSV (Excel) est gratuit, depuis l’écran « Mes lots ».'),
        lienBouton('#/pass', 'Voir les pass', 'accent', 'etoile')));
      return;
    }
    if (paires.length < 1) { vue.appendChild(h('p', null, 'Créez un premier lot pour commencer.')); return; }
    var lignes = [
      ['Âge (jours)', function (b) { return String(b.age); }],
      ['Poussins', function (b) { return PP.nombre(b.nbPoussins); }],
      ['Mortalité', function (b) { return PP.pct(b.tauxMortalite); }],
      ['Poids moyen', function (b) { return b.poidsMoyenG != null ? PP.nombre(b.poidsMoyenG) + '\u00a0g' : '—'; }],
      ['IC', function (b) { return b.ic != null ? PP.nombre(b.ic, 2) : '—'; }],
      ['Aliment par poulet', function (b) { return b.alimentParPoulet != null ? PP.kg(b.alimentParPoulet, 2) : '—'; }],
      ['Coût par poulet', function (b) { return PP.fcfa(b.coutParPoulet); }],
      ['Prix moyen de vente', function (b) { return PP.fcfa(b.prixMoyenPoulet); }],
      ['Marge', function (b) { return PP.fcfa(b.marge); }],
      ['Marge par poulet', function (b) { return PP.fcfa(b.margeParPoulet); }]
    ];
    var t = h('table', null, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Indicateur'), paires.map(function (p) { return h('th', { scope: 'col', class: 'n' }, p.lot.nom); }))),
      h('tbody', null, lignes.map(function (l) { return h('tr', null, h('th', { scope: 'row' }, l[0]), paires.map(function (p) { return h('td', { class: 'n' }, l[1](p.bilan)); })); })));
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'cmp-t' }, h('h2', { id: 'cmp-t' }, 'Lots côte à côte'), h('div', { class: 'defile', tabindex: '0', role: 'region', 'aria-label': 'Tableau de comparaison (faire défiler)' }, t),
      h('p', { class: 'discret petit' }, 'Les lots en cours ne sont pas encore finis : leur marge n’est pas définitive.')));
    var avecVentes = paires.filter(function (p) { return p.bilan.vendus > 0; });
    if (avecVentes.length) {
      var meilleur = avecVentes.slice().sort(function (a, b) { return b.bilan.margeParPoulet - a.bilan.margeParPoulet; })[0];
      vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'cmp-m' }, h('h2', { id: 'cmp-m' }, 'Marge par poulet'),
        h('p', null, 'Meilleur lot : ', h('b', null, meilleur.lot.nom), ' (' + PP.fcfa(meilleur.bilan.margeParPoulet) + ' par poulet).'),
        PPG.barresH(avecVentes.map(function (p) { return { nom: p.lot.nom, valeur: p.bilan.margeParPoulet || 0, texte: PP.fcfa(p.bilan.margeParPoulet) }; }), 'Marge par poulet')));
    }
    var avecIC = paires.filter(function (p) { return p.bilan.ic != null; });
    if (avecIC.length) vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'cmp-ic' }, h('h2', { id: 'cmp-ic' }, 'Indice de consommation'),
      h('p', { class: 'discret petit' }, 'Plus c’est bas, moins il a fallu d’aliment pour 1 kg de poulet.'),
      PPG.barresH(avecIC.map(function (p) { return { nom: p.lot.nom, valeur: p.bilan.ic, texte: PP.nombre(p.bilan.ic, 2) }; }), 'Indice de consommation')));
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'cmp-mo' }, h('h2', { id: 'cmp-mo' }, 'Mortalité'),
      PPG.barresH(paires.map(function (p) { return { nom: p.lot.nom, valeur: p.bilan.tauxMortalite || 0, texte: PP.pct(p.bilan.tauxMortalite) }; }), 'Mortalité')));
  }

  // ---------- Pass ----------
  function pagePass(vientDActiver) {
    var vue = cadre('Mon pass', null, 'pass'); bandeaux('pass');
    var L = E.licence;
    var etat = h('section', { class: 'carte', 'aria-labelledby': 'pass-etat' });
    if (L.premium) {
      if (vientDActiver === true) etat.appendChild(h('div', { id: 'activation-ok', role: 'status' }, alerte('ok', 'Pass activé ! Merci. Toutes les fonctions sont débloquées.')));
      etat.appendChild(h('h2', { id: 'pass-etat' }, 'Version complète active'));
      etat.appendChild(h('p', { class: 'heros', 'data-jours': L.joursRestants }, pluriel(L.joursRestants, 'jour restant', 'jours restants')));
      etat.appendChild(h('p', null, 'Valable jusqu’au ' + PP.dateFr(L.fin) + '.'));
      if (L.rappel) etat.appendChild(alerte('attention', 'Votre pass se termine bientôt. Renouvelez maintenant : les jours restants s’ajoutent, rien n’est perdu.', [' ', h('a', { href: PPL.urlProduit(L.slug), 'data-action': 'renouveler' }, 'Renouveler')]));
    } else if (L.expire) {
      etat.appendChild(h('h2', { id: 'pass-etat' }, 'Pass terminé'));
      etat.appendChild(h('p', null, 'Votre pass a pris fin le ' + PP.dateFr(L.fin) + '. Tous vos lots et vos chiffres restent consultables ; vos sauvegardes et exports CSV restent gratuits. Les fonctions du pass sont en pause.'));
      etat.appendChild(lienBouton(PPL.urlProduit(L.slug), 'Renouveler', 'accent', 'etoile'));
    } else {
      etat.appendChild(h('h2', { id: 'pass-etat' }, 'Version gratuite'));
      etat.appendChild(h('p', null, 'Vous suivez 1 lot en cours avec tous les calculs de base. Un pass débloque le reste.'));
    }
    vue.appendChild(etat);

    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'pass-cmp' }, h('h2', { id: 'pass-cmp' }, 'Ce que chaque version permet'),
      h('div', { class: 'offres' },
        h('div', { class: 'offre' }, h('h3', null, 'Gratuit'),
          h('ul', { class: 'liste-coches' }, h('li', null, '1 lot en cours (lots terminés gardés)'), h('li', null, 'Journal : morts, aliment, pesées, dépenses, ventes'),
            h('li', null, 'IC, coût par poulet, prix minimum, marge, trésorerie'), h('li', null, 'Courbes et points à vérifier'), h('li', null, 'Export CSV (Excel) et sauvegarde'))),
        h('div', { class: 'offre mise-en-avant' }, h('h3', null, 'Complet (avec un pass)'),
          h('ul', { class: 'liste-coches' }, h('li', null, 'Lots en cours illimités'), h('li', null, 'Comparaison des lots'),
            h('li', null, 'Rapport PDF à partager'), h('li', null, 'Estimation de fin de lot : poids, aliment à acheter, marge'), h('li', null, 'Tout le reste de la version gratuite'))))));

    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'pass-achat' }, h('h2', { id: 'pass-achat' }, 'Acheter un pass'),
      h('p', null, 'Paiement par Wave sur la boutique. Pas d’abonnement : rien n’est prélevé automatiquement.'),
      h('div', { class: 'offres' },
        h('div', { class: 'offre' }, h('h3', null, 'Pass 1 mois'), h('p', { class: 'prix' }, '2 000 F'), h('p', { class: 'discret' }, '30 jours de version complète.'),
          lienBouton(PPL.urlProduit('pass-pouletpilot-1-mois'), 'Acheter le pass 1 mois', 'large secondaire')),
        h('div', { class: 'offre mise-en-avant' }, h('h3', null, 'Pass 12 mois'), h('p', { class: 'prix' }, '15 000 F'), h('p', { class: 'discret' }, '365 jours, soit 1 250 F par mois.'),
          lienBouton(PPL.urlProduit('pass-pouletpilot-12-mois'), 'Acheter le pass 12 mois', 'large accent')))));

    var zone = h('textarea', { id: 'c-lien', name: 'lien', rows: 3, placeholder: 'https://…/boutique/commande.html?o=TCV-…&t=…', autocomplete: 'off', spellcheck: 'false' }, E.activationPreRemplie || '');
    E.activationPreRemplie = '';
    var msg = h('div', { id: 'activation-msg', role: 'status', 'aria-live': 'polite' });
    var btn = h('button', { type: 'submit', class: 'btn large' }, icone('ok'), 'Activer');
    var form = h('form', { novalidate: true, 'aria-labelledby': 'pass-act' },
      h('h2', { id: 'pass-act' }, 'Activer mon pass'),
      h('ol', { class: 'etapes' }, h('li', null, 'Payez votre pass par Wave sur la boutique.'),
        h('li', null, 'Sur la page de votre commande, touchez « Copier le lien de cette page ».'),
        h('li', null, 'Collez ce lien ci-dessous puis touchez « Activer ». Il faut Internet une seule fois.')),
      champ('Lien de votre commande', zone), btn, msg);
    form.className = 'carte';
    form.addEventListener('submit', function (ev) { ev.preventDefault(); activer(zone.value, msg, btn); });
    vue.appendChild(form);

    if (E.passes.length) {
      vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'pass-hist' }, h('h2', { id: 'pass-hist' }, 'Pass activés sur ce téléphone'),
        h('ul', null, E.passes.map(function (p) {
          var prod = PPL.PRODUITS[p.slug];
          return h('li', null, (prod ? prod.nom : p.slug) + ' · payé le ' + PP.dateFr(String(p.payeeLe).slice(0, 10)) + ' · commande ' + String(p.id || '').replace(/^(TCV-....).*/, '$1••••'));
        })),
        h('p', { class: 'discret petit' }, 'Sur un autre téléphone, collez le même lien de commande pour activer votre pass.')));
    }
  }
  function activer(texte, msg, btn) {
    msg.textContent = '';
    var c = PPL.lireLienCommande(texte);
    if (!c) { msg.appendChild(alerte('danger', 'Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « TCV- »).')); return; }
    btn.disabled = true; msg.appendChild(alerte('info', 'Vérification en cours…'));
    fetch(PPL.urlVerification(c), { headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (r.status === 404) return { introuvable: true };
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      msg.textContent = ''; btn.disabled = false;
      if (j && j.introuvable) { msg.appendChild(alerte('danger', 'Commande introuvable. Vérifiez que vous avez copié tout le lien.')); return; }
      var a = PPL.analyserReponse(j, Date.now());
      if (a.ok) {
        E.passes = PPL.ajouterPass(E.passes, a.pass);
        return DB.ecrire('passes', E.passes).then(function () {
          majLicence();
          pagePass(true);
          window.scrollTo(0, 0);
          toast('Pass activé.');
        });
      }
      if (a.raison === 'impayee') msg.appendChild(alerte('attention', 'Cette commande n’est pas encore payée. Ouvrez le lien de la commande, payez par Wave, puis réessayez.'));
      else if (a.raison === 'produit') msg.appendChild(alerte('danger', 'Ce lien correspond à un autre achat' + (a.titre ? ' (« ' + a.titre + ' »)' : '') + '. Collez le lien de votre commande de pass PouletPilot.'));
      else if (a.raison === 'expiree') msg.appendChild(alerte('attention', 'Ce pass a pris fin le ' + PP.dateFr(a.fin) + '. Prenez un nouveau pass pour continuer.', [' ', h('a', { href: PPL.urlProduit(a.pass.slug) }, 'Renouveler')]));
      else msg.appendChild(alerte('danger', 'Commande introuvable. Vérifiez le lien.'));
    }).catch(function () {
      msg.textContent = ''; btn.disabled = false;
      msg.appendChild(alerte('danger', 'Pas de connexion à Internet, ou serveur injoignable. Réessayez quand vous avez du réseau : la vérification ne se fait qu’une fois.'));
    });
  }

  // ---------- Fichiers (PDF, CSV, sauvegarde) ----------
  function offrirFichier(blob, nom, titre) {
    var z = $('#fichier-pret'); if (!z) return;
    z.textContent = '';
    var carte = h('div', { class: 'alerte ok', 'data-fichier': nom }, icone('ok'), h('div', { class: 'texte' }, h('b', null, 'Fichier prêt : '), nom,
      h('div', { class: 'boutons', style: 'margin:8px 0 0' },
        bouton('Télécharger', 'petit', function () { R.telecharger(blob, nom); }, 'telecharger', { 'data-action': 'telecharger' }),
        R.peutPartager(blob, nom) ? bouton('Partager', 'petit secondaire', function () {
          R.partager(blob, nom, titre).catch(function (e) { if (e && e.name !== 'AbortError') toast('Partage impossible : téléchargez le fichier.'); });
        }, 'partager', { 'data-action': 'partager' }) : null)));
    z.appendChild(carte);
    carte.querySelector('button').focus();
  }
  function faireRapport(lot) {
    if (!premium()) { toast('Le rapport PDF fait partie du pass.'); aller('#/pass'); return; }
    var b = bilan(lot);
    var proj = lot.statut !== 'termine' ? PP.projection(b, { reglages: E.reglages }) : null;
    toast('Préparation du rapport…');
    R.pdfLot({ lot: lot, ops: opsDe(lot.id), bilan: b, projection: proj, alertes: PP.alertes(b, { reglages: E.reglages, projection: proj }), reglages: E.reglages,
      nomFichier: R.nomFichier('rapport ' + lot.nom + ' ' + aujourdhui(), 'pdf') })
      .then(function (r) { offrirFichier(r.blob, r.nom, 'Rapport du lot ' + lot.nom); })
      .catch(function (e) { console.warn(e); toast('Rapport impossible : ' + (e && e.message ? e.message : 'erreur')); });
  }
  function exporterJournal(lot) {
    var csv = PP.csvJournal(lot, opsDe(lot.id), { reglages: E.reglages });
    offrirFichier(new Blob([csv], { type: 'text/csv;charset=utf-8' }), R.nomFichier('journal ' + lot.nom, 'csv'), 'Journal du lot ' + lot.nom);
  }
  function exporterResume() {
    var paires = E.lots.map(function (l) { return { lot: l, bilan: bilan(l) }; });
    offrirFichier(new Blob([PP.csvResume(paires)], { type: 'text/csv;charset=utf-8' }), R.nomFichier('resume lots ' + aujourdhui(), 'csv'), 'Résumé des lots');
  }
  function sauvegarder() {
    var ops = []; Object.keys(E.ops).forEach(function (k) { ops = ops.concat(E.ops[k]); });
    var data = { app: 'PouletPilot', format: 1, version: VERSION_APP, exporteLe: new Date().toISOString(), lots: E.lots, ops: ops, reglages: E.reglages };
    var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    offrirFichier(blob, 'pouletpilot-sauvegarde-' + aujourdhui() + '.json', 'Sauvegarde PouletPilot');
    E.sauvegardeLe = new Date().toISOString();
    DB.ecrire('sauvegardeLe', E.sauvegardeLe).catch(function () { /* sans gravité */ });
  }
  function restaurer(fichier) {
    if (!fichier) return;
    var fr = new FileReader();
    fr.onload = function () {
      var obj; try { obj = JSON.parse(String(fr.result)); } catch (e) { toast('Ce fichier n’est pas une sauvegarde PouletPilot.'); return; }
      var v = PP.validerSauvegarde(obj);
      if (!v.ok) { toast(v.erreur); return; }
      if (!confirm('Remplacer toutes les données de ce téléphone par la sauvegarde (' + pluriel(v.lots.length, 'lot') + ', ' + pluriel(v.ops.length, 'saisie') + ') ?')) return;
      DB.remplacer(v.lots, v.ops, v.reglages).then(charger).then(function () {
        appliquerTheme(); toast('Sauvegarde restaurée.'); aller('#/');
      }).catch(echec);
    };
    fr.onerror = function () { toast('Lecture du fichier impossible.'); };
    fr.readAsText(fichier);
  }

  // ---------- Exemple ----------
  function creerExemple() {
    var deja = E.lots.filter(function (l) { return l.exemple; })[0];
    if (deja) { aller('#/lot/' + deja.id); return; }
    var debut = PP.ajouterJours(aujourdhui(), -50);
    var lot = { id: nouvelId(), nom: 'Exemple : lot de 500 poulets', dateDebut: debut, nbPoussins: 500, prixPoussin: 600, ageVente: 42, poidsPoussinG: 40,
      souche: 'Exemple', batiment: 'Poulailler 1', statut: 'termine', dateFin: PP.ajouterJours(debut, 44), exemple: true, cree: Date.now() };
    var ops = [], k = 0;
    function op(o) { o.id = nouvelId(); o.lotId = lot.id; o.cree = Date.now() + (k++); ops.push(o); }
    var morts = [3, 2, 2, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (var d = 0; d <= 43; d++) {
      var sacs = Math.max(0.5, Math.round((0.12 + 0.034 * d) * 2) / 2);
      op({ type: 'jour', date: PP.ajouterJours(debut, d), morts: morts[d] || 0, sacs: d <= 42 ? sacs : 0, kgParSac: 50, eau: 0, note: d === 0 ? 'Arrivée des poussins' : '' });
    }
    [[7, .97], [14, .96], [21, .98], [28, .97], [35, .96], [42, .97]].forEach(function (p) {
      op({ type: 'pesee', date: PP.ajouterJours(debut, p[0]), nb: 15, poidsG: Math.round(PP.repereA(PP.REPERE_DEFAUT, p[0]) * p[1]) });
    });
    op({ type: 'achat', date: debut, sacs: 10, kgParSac: 50, prixSac: 15500, fournisseur: 'Provenderie (exemple)' });
    op({ type: 'achat', date: PP.ajouterJours(debut, 14), sacs: 15, kgParSac: 50, prixSac: 14500, fournisseur: 'Provenderie (exemple)' });
    op({ type: 'achat', date: PP.ajouterJours(debut, 28), sacs: 14, kgParSac: 50, prixSac: 14000, fournisseur: 'Provenderie (exemple)' });
    [[0, 'litiere', 15000, 'Copeaux'], [5, 'soins', 25000, 'Soins de la bande'], [18, 'soins', 20000, 'Soins de la bande'], [20, 'electricite', 8000, 'Électricité'],
      [40, 'electricite', 8000, 'Électricité'], [30, 'main_oeuvre', 40000, 'Aide au poulailler'], [43, 'transport', 10000, 'Livraison des poulets']].forEach(function (x) {
      op({ type: 'depense', date: PP.ajouterJours(debut, x[0]), categorie: x[1], montant: x[2], libelle: x[3] });
    });
    op({ type: 'vente', date: PP.ajouterJours(debut, 42), nb: 300, prix: 2650, mode: 'poulet', acheteur: 'Restaurant (exemple)', encaisse: null });
    op({ type: 'vente', date: PP.ajouterJours(debut, 44), nb: 170, prix: 2700, mode: 'poulet', acheteur: 'Revendeuse (exemple)', encaisse: 400000 });
    var mortsTotal = morts.reduce(function (a, x) { return a + x; }, 0);
    op({ type: 'vente', date: PP.ajouterJours(debut, 44), nb: 500 - mortsTotal - 470, prix: 0, mode: 'poulet', acheteur: 'Gardés pour la famille', encaisse: null });
    enregistrerLot(lot).then(function () { return Promise.all(ops.map(enregistrerOp)); }).then(function () {
      toast('Exemple créé.'); aller('#/lot/' + lot.id);
    }).catch(echec);
  }

  // ---------- Réglages ----------
  function appliquerTheme() {
    var t = E.reglages.theme;
    if (t === 'clair' || t === 'sombre') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    stockLocal('pp-theme', t === 'clair' || t === 'sombre' ? t : null);
  }
  function enregistrerReglages(r) {
    E.reglages = PP.reglagesComplets(r);
    return DB.ecrire('reglages', E.reglages);
  }
  function pageReglages() {
    var vue = cadre('Réglages', null, 'reglages'); bandeaux('reglages');
    var rg = E.reglages;
    // Apparence
    var app = h('form', { class: 'carte', 'aria-labelledby': 'r-app' }, h('h2', { id: 'r-app' }, 'Apparence'),
      choixRadio('theme', [{ id: 'auto', nom: 'Automatique' }, { id: 'clair', nom: 'Clair' }, { id: 'sombre', nom: 'Sombre' }], rg.theme || 'auto', 'Couleurs de l’écran'));
    app.addEventListener('change', function () {
      var r = JSON.parse(JSON.stringify(E.reglages)); r.theme = radio(app, 'theme');
      enregistrerReglages(r).then(function () { appliquerTheme(); toast('Apparence enregistrée.'); });
    });
    vue.appendChild(app);

    // Valeurs par défaut et alertes
    var f = h('form', { class: 'carte', novalidate: true, 'aria-labelledby': 'r-def' }, h('h2', { id: 'r-def' }, 'Valeurs par défaut et alertes'),
      h('div', { class: 'deux' },
        champ('Poids d’un sac (kg)', entree('kgParSac', rg.kgParSac, 'nombre')),
        champ('Âge de vente (jours)', entree('ageVente', rg.ageVente, 'entier'))),
      champ('Poids d’un poussin à l’arrivée (g)', entree('poidsPoussinG', rg.poidsPoussinG, 'nombre')),
      h('div', { class: 'deux' },
        champ('Seuil de mortalité (%)', entree('seuilMortalite', PP.nombreCourt(rg.seuilMortalite * 100, 2).replace(/ /g, ''), 'nombre'), 'Alerte si la mortalité cumulée dépasse ce seuil.'),
        champ('Écart de poids toléré (%)', entree('tolerancePoids', PP.nombreCourt(rg.tolerancePoids * 100, 2).replace(/ /g, ''), 'nombre'), 'Alerte si le poids est plus bas que vos repères de plus que cet écart.')),
      champ('Pic de morts : à partir de combien de morts en un jour ?', entree('picMin', rg.picMin, 'entier'), 'Alerte aussi seulement si c’est plus du double de la moyenne des jours d’avant.'),
      h('button', { type: 'submit', class: 'btn' }, icone('ok'), 'Enregistrer'));
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); effacerErreurs(f);
      var k = nb(f, 'kgParSac'), a = nb(f, 'ageVente'), p = nb(f, 'poidsPoussinG'), s = nb(f, 'seuilMortalite'), t = nb(f, 'tolerancePoids'), m = nb(f, 'picMin');
      if (!(k > 0 && k <= 200)) return erreur(f, 'kgParSac', 'Entre 1 et 200 kg.');
      if (!(a >= 1 && a <= 150)) return erreur(f, 'ageVente', 'Entre 1 et 150 jours.');
      if (!(p >= 0 && p < 500)) return erreur(f, 'poidsPoussinG', 'En grammes, par exemple 40.');
      if (!(s > 0 && s <= 100)) return erreur(f, 'seuilMortalite', 'Entre 0 et 100 %.');
      if (!(t >= 0 && t < 100)) return erreur(f, 'tolerancePoids', 'Entre 0 et 99 %.');
      if (!(m >= 1)) return erreur(f, 'picMin', 'Au moins 1.');
      var r = JSON.parse(JSON.stringify(E.reglages));
      r.kgParSac = k; r.ageVente = a; r.poidsPoussinG = p; r.seuilMortalite = s / 100; r.tolerancePoids = t / 100; r.picMin = Math.round(m);
      enregistrerReglages(r).then(function () { toast('Réglages enregistrés.'); }).catch(echec);
    });
    vue.appendChild(f);

    // Repères de poids
    var fr = h('form', { class: 'carte', novalidate: true, 'aria-labelledby': 'r-rep', id: 'form-repere' }, h('h2', { id: 'r-rep' }, 'Repères de poids'),
      h('p', null, h('b', null, 'Repères indicatifs à adapter'), ' : ce ne sont pas des normes officielles. Remplacez-les par les poids conseillés par votre couvoir ou votre fournisseur d’aliment, ou par ceux de vos meilleurs lots.'));
    var tb = h('tbody');
    function ligne(p) {
      var tr = h('tr', null,
        h('td', null, h('input', { type: 'text', inputmode: 'numeric', name: 'age', value: p ? p.age : '', 'aria-label': 'Âge en jours' })),
        h('td', null, h('input', { type: 'text', inputmode: 'decimal', name: 'g', value: p ? p.g : '', 'aria-label': 'Poids en grammes' })),
        h('td', null, h('button', { type: 'button', class: 'btn petit secondaire', 'aria-label': 'Retirer cette ligne', onclick: function () { tr.remove(); } }, '×')));
      tb.appendChild(tr);
    }
    rg.repere.forEach(ligne);
    fr.appendChild(h('div', { class: 'defile repere-table' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Âge (jours)'), h('th', null, 'Poids (g)'), h('th', null, h('span', { class: 'sauter' }, 'Action')))), tb)));
    fr.appendChild(h('div', { class: 'boutons' },
      bouton('Ajouter une ligne', 'secondaire petit', function () { ligne(null); tb.lastChild.querySelector('input').focus(); }, 'plus'),
      bouton('Remettre les valeurs de départ', 'secondaire petit', function () {
        if (!confirm('Remettre les repères de départ ?')) return;
        var r = JSON.parse(JSON.stringify(E.reglages)); r.repere = PP.REPERE_DEFAUT;
        enregistrerReglages(r).then(function () { toast('Repères remis.'); pageReglages(); });
      })));
    fr.appendChild(h('button', { type: 'submit', class: 'btn' }, icone('ok'), 'Enregistrer les repères'));
    fr.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var pts = [];
      tb.querySelectorAll('tr').forEach(function (tr) {
        var a = PP.lireNombre(tr.querySelector('[name="age"]').value), g = PP.lireNombre(tr.querySelector('[name="g"]').value);
        if (PP.estNombre(a) && PP.estNombre(g)) pts.push({ age: a, g: g });
      });
      var norm = PP.normaliserRepere(pts);
      if (norm.length < 2) { toast('Il faut au moins 2 lignes valides (âge et poids).'); return; }
      var r = JSON.parse(JSON.stringify(E.reglages)); r.repere = norm;
      enregistrerReglages(r).then(function () { toast('Repères enregistrés.'); pageReglages(); }).catch(echec);
    });
    vue.appendChild(fr);

    // Sauvegarde
    var input = h('input', { type: 'file', accept: '.json,application/json', id: 'fichier-restaurer', class: 'sauter', onchange: function (ev) { restaurer(ev.target.files[0]); ev.target.value = ''; } });
    var vieux = !E.sauvegardeLe || (Date.now() - Date.parse(E.sauvegardeLe)) > 14 * 86400000;
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'r-sauv' }, h('h2', { id: 'r-sauv' }, 'Sauvegarde'),
      h('p', null, 'Vos données sont seulement sur ce téléphone. Faites une sauvegarde régulièrement et gardez le fichier ailleurs (WhatsApp, e-mail, clé USB).'),
      h('p', { class: 'discret' }, E.sauvegardeLe ? 'Dernière sauvegarde : ' + PP.dateFr(E.sauvegardeLe.slice(0, 10)) + '.' : 'Aucune sauvegarde faite sur ce téléphone.'),
      vieux && E.lots.length ? alerte('attention', 'Pensez à faire une sauvegarde.') : null,
      h('div', { class: 'boutons' }, bouton('Faire une sauvegarde', '', sauvegarder, 'sauvegarde', { 'data-action': 'sauvegarder' }),
        h('label', { class: 'btn secondaire', for: 'fichier-restaurer', tabindex: '0', role: 'button', onkeydown: function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); input.click(); } } }, icone('telecharger'), 'Restaurer une sauvegarde'), input),
      h('div', { id: 'fichier-pret' }),
      h('p', { class: 'discret petit' }, 'Le pass n’est pas dans la sauvegarde : sur un nouveau téléphone, collez à nouveau le lien de votre commande.')));

    // Installation
    var inst = h('section', { class: 'carte', 'aria-labelledby': 'r-inst' }, h('h2', { id: 'r-inst' }, 'Installer l’application'));
    if (estInstalle()) inst.appendChild(h('p', null, 'PouletPilot est installé sur ce téléphone.'));
    else if (E.installation) inst.appendChild(bouton('Installer PouletPilot', '', installer, 'installer', { 'data-action': 'installer' }));
    else if (estIOS()) inst.appendChild(h('p', null, 'Sur iPhone ou iPad : ouvrez cette page dans Safari, touchez le bouton Partager (carré avec une flèche), puis « Sur l’écran d’accueil ».'));
    else inst.appendChild(h('p', null, 'Dans Chrome : touchez le menu ⋮ en haut à droite, puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».'));
    inst.appendChild(h('p', { class: 'discret petit' }, 'Une fois ouverte une première fois, l’application marche sans Internet.'));
    vue.appendChild(inst);

    // À propos
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'r-apropos' }, h('h2', { id: 'r-apropos' }, 'À propos'),
      h('p', null, 'PouletPilot ' + VERSION_APP + ' · outil de gestion économique de l’élevage de poulets de chair.'),
      h('p', null, 'Ce n’est pas un outil vétérinaire : il ne donne ni diagnostic ni traitement. Pour la santé de vos poulets, consultez un vétérinaire.'),
      h('p', null, 'Vos données restent sur ce téléphone : rien n’est envoyé sur Internet (sauf la vérification de votre pass, une fois).'),
      h('div', { class: 'boutons' }, lienBouton('#/aide', 'Aide et explications', 'secondaire', 'info'),
        bouton('Tout effacer', 'danger', function () {
          if (!confirm('Effacer tous les lots, le journal et les réglages de ce téléphone ?')) return;
          if (!confirm('Dernière confirmation : tout effacer définitivement ?')) return;
          var passes = E.passes;
          DB.toutEffacer().then(function () { return DB.ecrire('passes', passes); }).then(charger).then(function () { appliquerTheme(); toast('Données effacées.'); aller('#/'); }).catch(echec);
        }, 'corbeille'))));
  }

  // ---------- Aide ----------
  function pageAide() {
    var vue = cadre('Aide', '#/reglages', 'reglages'); bandeaux('aide');
    function bloc(t, contenu) { vue.appendChild(h('section', { class: 'carte' }, h('h2', null, t), contenu)); }
    bloc('À quoi sert PouletPilot ?', h('p', null, 'À savoir combien vous coûte chaque poulet, à quel prix vendre pour ne pas perdre d’argent, et combien chaque lot vous a rapporté. Vous notez, l’application calcule.'));
    bloc('Ce qu’il faut noter', h('ul', null,
      h('li', null, h('b', null, 'Chaque jour : '), 'les morts et les sacs d’aliment donnés (bouton « Saisie du jour »).'),
      h('li', null, h('b', null, 'Chaque semaine : '), 'une pesée de 10 à 20 poulets pris au hasard.'),
      h('li', null, h('b', null, 'À chaque achat : '), 'les sacs d’aliment et les autres dépenses.'),
      h('li', null, h('b', null, 'À chaque vente : '), 'le nombre de poulets, le prix et ce que le client a payé.')));
    bloc('Les calculs, simplement', h('ul', null,
      h('li', null, h('b', null, 'Poulets restants'), ' = poussins − morts − vendus.'),
      h('li', null, h('b', null, 'Mortalité'), ' = morts ÷ poussins au départ.'),
      h('li', null, h('b', null, 'Indice de consommation (IC)'), ' = aliment consommé (kg) ÷ poids vif gagné (kg). Exemple : IC 1,9 = il a fallu 1,9 kg d’aliment pour faire 1 kg de poulet. Plus il est bas, mieux c’est.'),
      h('li', null, h('b', null, 'Coût par poulet'), ' = tout ce que le lot a coûté (poussins, aliment, soins, litière, électricité, main-d’œuvre, transport…) ÷ poulets arrivés au bout (poussins − morts).'),
      h('li', null, h('b', null, 'Coût par kg'), ' = coût total ÷ kg de poulet vivant.'),
      h('li', null, h('b', null, 'Prix minimum'), ' = (coût total − ventes déjà faites) ÷ poulets restants. Si vous vendez en dessous, le lot perd de l’argent.'),
      h('li', null, h('b', null, 'Marge'), ' = ventes − coût total. ', h('b', null, 'Trésorerie'), ' = argent réellement reçu − dépenses.'),
      h('li', null, h('b', null, 'Estimation de fin de lot'), ' (pass) : on prolonge la tendance des derniers jours. C’est une estimation, pas une promesse.')));
    bloc('Les « points à vérifier »', h('p', null, 'PouletPilot vous signale ce qui sort de l’ordinaire dans vos chiffres : un pic de morts, un poids sous vos repères, une marge négative… Ce n’est jamais un diagnostic. Si des poulets sont malades ou meurent, consultez un vétérinaire.'));
    bloc('Vos données', h('p', null, 'Tout est enregistré sur ce téléphone, rien n’est envoyé. Faites une sauvegarde de temps en temps (Réglages → Sauvegarde) et gardez le fichier ailleurs. Les exports CSV s’ouvrent dans Excel ou Google Sheets.'));
    bloc('Le pass', h('p', null, 'Gratuit : 1 lot en cours avec tous les calculs de base. Pass 1 mois (2 000 F) ou 12 mois (15 000 F) : lots illimités, comparaison des lots, rapports PDF et estimations. Quand un pass se termine, vous gardez l’accès à toutes vos données.'));
  }

  // ---------- Routage ----------
  function afficher() {
    var hs = location.hash.replace(/^#/, '') || '/';
    var p = hs.split('?')[0].split('/').filter(Boolean).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    try {
      if (!p.length) pageAccueil();
      else if (p[0] === 'nouveau') pageFormLot(null);
      else if (p[0] === 'lot' && p[1] && !p[2]) pageLot(p[1]);
      else if (p[0] === 'lot' && p[2] === 'modifier') pageFormLot(p[1]);
      else if (p[0] === 'lot' && p[2] === 'jour') pageJour(p[1], p[3]);
      else if (p[0] === 'lot' && p[2] === 'ajout') pageOp(p[1], p[3], null);
      else if (p[0] === 'lot' && p[2] === 'op') pageOp(p[1], null, p[3]);
      else if (p[0] === 'lot' && p[2] === 'journal') pageJournal(p[1]);
      else if (p[0] === 'comparer') pageComparer();
      else if (p[0] === 'pass') pagePass();
      else if (p[0] === 'reglages') pageReglages();
      else if (p[0] === 'aide') pageAide();
      else { aller('#/'); return; }
    } catch (e) {
      console.warn(e);
      var vue = cadre('Oups', '#/', 'accueil');
      vue.appendChild(alerte('danger', 'Cette page n’a pas pu s’afficher. Revenez à l’accueil.'));
    }
    var vue2 = $('#vue');
    if (document.activeElement === document.body || !vue2.contains(document.activeElement)) { try { vue2.focus({ preventScroll: true }); } catch (e) { vue2.focus(); } }
    window.scrollTo(0, 0);
  }

  // ---------- Démarrage ----------
  function demarrer() {
    // Lien de commande ouvert directement dans l'application (?o=…&t=…) : préremplit l'activation
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('o') && q.get('t')) {
        E.activationPreRemplie = location.href;
        history.replaceState(null, '', location.pathname + '#/pass');
      }
    } catch (e) { /* ancien navigateur */ }
    charger().then(function () {
      appliquerTheme();
      window.addEventListener('hashchange', afficher);
      afficher();
      document.documentElement.setAttribute('data-pret', '1');
    }).catch(function (e) {
      console.warn(e);
      $('#vue').textContent = '';
      $('#vue').appendChild(alerte('danger', 'Impossible d’ouvrir le stockage du téléphone. Fermez les autres onglets de PouletPilot et rechargez la page.'));
    });
    // Rafraîchit le compte des jours du pass une fois par heure si l'application reste ouverte
    setInterval(function () { var avant = E.licence.premium; majLicence(); if (avant !== E.licence.premium) afficher(); }, 3600000);
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); E.installation = e; if (!location.hash || location.hash === '#/' || /reglages/.test(location.hash)) afficher(); });
  window.addEventListener('appinstalled', function () { E.installation = null; toast('PouletPilot est installé.'); });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        function signaler() { E.majDispo = reg; bandeaux(E.route || ''); }
        if (reg.waiting && navigator.serviceWorker.controller) signaler();
        reg.addEventListener('updatefound', function () {
          var w = reg.installing;
          if (w) w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) signaler(); });
        });
      }).catch(function () { /* hors ligne ou non pris en charge */ });
      var recharge = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () { if (E.majDemandee && !recharge) { recharge = true; location.reload(); } });
    });
  }
  demarrer();
})();
