/* Champ Pilot — écrans : campagne, parcelles, calendrier, dépenses, main-d'œuvre, récoltes, ventes, bilan, eau, réglages. */
(function () {
  'use strict';
  var U = window.TU, CP = window.CP, DB = window.TDB, h = U.h, icone = U.icone, bouton = U.bouton, lienBouton = U.lienBouton,
    alerte = U.alerte, kpi = U.kpi, champ = U.champ, entree = U.entree, toast = U.toast;
  var S = { recs: [], idx: {}, D: null, reglages: CP.reglagesComplets(), active: null, B: null };
  var C;

  // ---------- Données ----------
  function auj() { return U.dateISO(new Date()); }
  function recalculer() {
    S.idx = {}; S.recs.forEach(function (r) { S.idx[r.id] = r; });
    S.D = CP.grouper(S.recs);
    if (!S.active || !S.idx[S.active] || S.idx[S.active].type !== 'campagne') {
      var cs = S.D.campagne.slice().sort(function (a, b) { return (a.debut || '') < (b.debut || '') ? 1 : -1; });
      S.active = cs.length ? cs[0].id : null;
    }
    S.B = S.active ? CP.analyserCampagne(S.D, S.active) : null;
  }
  function charger() {
    return Promise.all([DB.tout(), DB.lire('reglages'), DB.lire('campagneActive')]).then(function (r) {
      S.recs = Array.isArray(r[0]) ? r[0] : [];
      S.reglages = CP.reglagesComplets(r[1]);
      S.active = r[2] || null;
      recalculer();
    });
  }
  function sauver(recs) {
    recs = [].concat(recs);
    return DB.mettre(recs).then(function () {
      recs.forEach(function (r) { var i = S.recs.findIndex(function (x) { return x.id === r.id; }); if (i >= 0) S.recs[i] = r; else S.recs.push(r); });
      recalculer();
    });
  }
  function effacer(ids) {
    ids = [].concat(ids);
    return DB.supprimer(ids).then(function () { S.recs = S.recs.filter(function (r) { return ids.indexOf(r.id) < 0; }); recalculer(); });
  }
  function choisirCampagne(id) { S.active = id; recalculer(); return DB.ecrire('campagneActive', id); }
  function copie(x) { return JSON.parse(JSON.stringify(x)); }
  function nouveau(type, o) { o = o || {}; o.id = U.nouvelId(); o.type = type; return o; }
  function campagne() { return S.active ? S.idx[S.active] : null; }
  function parcelles() { return S.D.parcelle.filter(function (p) { return p.campagneId === S.active; }).sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom), 'fr', { numeric: true }); }); }
  function aDesDonnees() { return S.recs.some(function (r) { return !r.exemple; }); }
  function aller(x) { C.aller(x); }
  function parDateDesc(a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }

  // ---------- Éléments ----------
  function emojiCulture(p) { return h('span', { class: 'vignette', 'aria-hidden': 'true' }, CP.culture(p.culture).emoji); }
  function ouvrirFormulaire(titre, retour, onglet) { var v = C.cadre(titre, retour, onglet); C.bandeaux('form'); return v; }
  function pied(texte, extra) { return h('div', { class: 'pied-form' }, h('button', { type: 'submit', class: 'btn large' }, icone('ok'), texte), extra || null); }
  function dateOk(form, nom, opts) {
    opts = opts || {};
    var d = U.val(form, nom);
    if (!U.dateValide(d)) { U.erreur(form, nom, 'Choisissez une date.'); return null; }
    if (!opts.futur && d > auj()) { U.erreur(form, nom, 'La date ne peut pas être après aujourd’hui.'); return null; }
    return d;
  }
  function selParcelle(nom, courant, avecToutes) {
    var opts = parcelles().map(function (p) { return { id: p.id, nom: CP.culture(p.culture).emoji + ' ' + p.nom }; });
    if (avecToutes) opts.push({ id: '', nom: 'Toutes mes parcelles actuelles (partagé selon la surface)' });
    return U.selection(nom, opts, courant == null ? '' : courant);
  }
  function retourDe(q) { return q.parcelle && S.idx[q.parcelle] ? '#/parcelle/' + q.parcelle : '#/'; }
  function carteLimite() {
    return h('section', { class: 'carte', 'data-limite': '1' }, h('h2', null, 'Limite de la version gratuite'),
      h('p', null, 'La version gratuite suit ' + CP.LIMITE_GRATUITE + ' parcelles par campagne. Cette campagne en a déjà ' + CP.nbComptees(S.D.parcelle, S.active) + '.'),
      h('p', null, 'Avec le pass 12 mois (2 000 F), ajoutez autant de parcelles que vous voulez. Vos parcelles déjà notées restent toutes modifiables, avec ou sans pass.'),
      lienBouton('#/pass', 'Voir le pass', 'accent large', 'etoile'));
  }
  function sansCampagne(vue) {
    vue.appendChild(alerte('info', 'Créez d’abord une campagne.', [' ', h('a', { href: '#/campagne/nouveau' }, 'Nouvelle campagne')]));
  }

  // ---------- Accueil ----------
  function nomSuggere() {
    var d = auj(), an = +d.slice(0, 4), m = +d.slice(5, 7);
    return m >= 5 && m <= 10 ? 'Hivernage ' + an : 'Contre-saison ' + (m >= 11 ? an + '-' + (an + 1) : (an - 1) + '-' + an);
  }
  function pageAccueil() {
    var vue = C.cadre(null, null, 'accueil'); C.bandeaux('accueil');
    var c = campagne();
    if (!c) {
      vue.appendChild(h('section', { class: 'carte', 'data-bienvenue': '1' }, h('h1', null, 'Bienvenue dans Champ Pilot'),
        h('p', null, 'Le carnet de votre campagne agricole : arachide, mil, maïs, oignon, riz, niébé, maraîchage.'),
        h('ul', { class: 'liste-coches' }, h('li', null, 'Notez vos parcelles, vos travaux, vos achats, la main-d’œuvre, la récolte et les ventes.'),
          h('li', null, 'L’application calcule le rendement à l’hectare et ce que chaque parcelle vous a rapporté.'),
          h('li', null, 'Elle vous rappelle les travaux prévus et compare vos campagnes.'))));
      vue.appendChild(formCampagne(null, true));
      vue.appendChild(h('div', { class: 'boutons' }, bouton('Voir un exemple', 'secondaire large', creerExemple, 'info', { 'data-action': 'exemple' })));
      vue.appendChild(h('p', { class: 'discret petit centre' }, 'Gratuit pour ' + CP.LIMITE_GRATUITE + ' parcelles par campagne. Tout reste sur votre téléphone, même sans Internet.'));
      return;
    }
    var T = S.B.totaux, ps = parcelles();
    vue.appendChild(h('div', { class: 'ligne-entre' }, h('h1', { style: 'margin:0', 'data-campagne': c.nom }, c.nom), h('a', { href: '#/campagnes', class: 'petit', 'data-action': 'campagnes' }, 'Changer de campagne')));
    // Rappels
    var e = CP.echeances(S.D, S.active, auj(), S.reglages.rappelJours);
    var aFaire = e.retard.concat(e.aujourdhui, e.bientot);
    if (aFaire.length) vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'acc-rappels', 'data-rappels': aFaire.length }, h('h2', { id: 'acc-rappels' }, 'À faire (' + aFaire.length + ')'),
      h('ul', { class: 'liste' }, aFaire.map(ligneOperation)), h('p', null, lienBouton('#/calendrier', 'Tout le calendrier', 'secondaire petit', 'calendrier'))));
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'acc-chiffres' }, h('h2', { id: 'acc-chiffres', class: 'invisible' }, 'Chiffres de la campagne'),
      h('div', { class: 'kpis' },
        kpi('Surface', U.nombre(T.surfaceHa, 2) + ' ha', U.pluriel(T.nbParcelles, 'parcelle') + (C.premium() ? '' : ' (' + CP.nbComptees(S.D.parcelle, S.active) + ' / ' + CP.LIMITE_GRATUITE + ' en gratuit)'), { id: 'surface' }),
        kpi('Récolte', U.kg(T.recolteKg, 0), T.venduKg ? U.kg(T.venduKg, 0) + ' vendus' : null, { id: 'recolte' }),
        kpi('Dépenses', U.fcfa(T.coutTotal), 'achats ' + U.fcfa(T.depenses) + ' · main-d’œuvre ' + U.fcfa(T.travail), { id: 'depenses' }),
        kpi('Ventes', U.fcfa(T.ventes), null, { id: 'ventes' }),
        kpi('Marge', U.fcfa(T.marge), T.margeHa != null ? U.fcfa(T.margeHa) + ' par ha' : null, { id: 'marge', signe: T.marge < 0 ? -1 : 1, large: true }))));
    vue.appendChild(h('div', { class: 'actions' },
      lienBouton('#/operation/nouveau', 'Prévoir un travail', 'principal', 'calendrier', { 'data-action': 'operation' }),
      lienBouton('#/depense/nouveau', 'Achat, dépense', 'secondaire', 'depense', { 'data-action': 'depense' }),
      lienBouton('#/travail/nouveau', 'Main-d’œuvre', 'secondaire', 'travail', { 'data-action': 'travail' }),
      lienBouton('#/recolte/nouveau', 'Récolte', 'secondaire', 'recolte', { 'data-action': 'recolte' }),
      lienBouton('#/vente/nouveau', 'Vente', 'secondaire', 'vente', { 'data-action': 'vente' })));
    var sec = h('section', { class: 'carte', 'aria-labelledby': 'acc-parc' }, h('div', { class: 'ligne-entre' }, h('h2', { id: 'acc-parc' }, 'Mes parcelles'), lienBouton('#/parcelle/nouveau', 'Ajouter', 'petit secondaire', 'plus', { 'data-action': 'ajouter-parcelle' })));
    if (!ps.length) sec.appendChild(h('div', { class: 'vide' }, h('span', { class: 'grand-emoji', 'aria-hidden': 'true' }, '🌱'), h('p', null, 'Ajoutez votre première parcelle : son nom, sa surface et la culture.'),
      lienBouton('#/parcelle/nouveau', 'Ajouter une parcelle', 'large', 'plus', { 'data-action': 'premiere-parcelle' })));
    ps.forEach(function (p) { sec.appendChild(carteParcelle(p)); });
    vue.appendChild(sec);
    if (S.recs.some(function (r) { return r.exemple; })) vue.appendChild(alerte('info', 'Les données « Exemple » servent à découvrir l’application.', [' ', bouton('Supprimer l’exemple', 'petit secondaire', supprimerExemple, 'corbeille', { 'data-action': 'supprimer-exemple' })]));
  }
  function carteParcelle(p) {
    var b = S.B.parcelles[p.id], c = CP.culture(p.culture);
    return h('a', { class: 'carte carte-lien', href: '#/parcelle/' + p.id, 'data-parcelle': p.nom },
      h('div', { class: 'element', style: 'padding:0;min-height:0' }, emojiCulture(p),
        h('span', { class: 'quoi' }, h('b', null, p.nom), h('span', null, c.nom + (p.variete ? ' · ' + p.variete : '') + ' · ' + CP.texteSurface(p))),
        h('span', { class: 'chiffre' }, h('span', { class: b.marge < 0 ? 'negatif' : 'positif' }, U.fcfa(b.marge)), h('small', null, 'marge'))),
      h('div', { class: 'mini' },
        h('div', null, h('span', null, 'Rendement'), h('b', null, b.rendementHa != null ? U.nombre(b.rendementHa) + ' kg/ha' : '—')),
        h('div', null, h('span', null, 'Dépenses'), h('b', null, U.fcfa(b.coutTotal)))));
  }
  function creerExemple() {
    var ex = CP.exemple(auj());
    sauver(ex.recs).then(function () { return choisirCampagne(ex.campagneId); }).then(function () { toast('Exemple créé.'); aller('#/'); }).catch(C.echec);
  }
  function supprimerExemple() {
    if (!confirm('Supprimer toutes les données d’exemple ?')) return;
    effacer(S.recs.filter(function (r) { return r.exemple; }).map(function (r) { return r.id; })).then(function () { return DB.ecrire('campagneActive', S.active); }).then(function () { toast('Exemple supprimé.'); aller('#/'); }).catch(C.echec);
  }

  // ---------- Campagnes ----------
  function formCampagne(c, accueil) {
    var prec = S.D.campagne.filter(function (x) { return !c || x.id !== c.id; }).sort(function (a, b) { return (a.debut || '') < (b.debut || '') ? 1 : -1; })[0];
    var nbPrec = prec ? S.D.parcelle.filter(function (p) { return p.campagneId === prec.id; }).length : 0;
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'campagne' },
      h('h2', null, c ? 'Modifier la campagne' : 'Nouvelle campagne'),
      champ('Nom de la campagne', entree('nom', c ? c.nom : nomSuggere(), 'texte', { maxlength: 60 })),
      U.choixRadio('saison', CP.SAISONS, c ? c.saison : (/^Hivernage/.test(nomSuggere()) ? 'hivernage' : 'contre_saison'), 'Saison'),
      champ('Début', entree('debut', c ? c.debut : auj(), 'date')),
      !c && nbPrec ? h('label', { class: 'case' }, h('input', { type: 'checkbox', name: 'reprendre', checked: true }), 'Reprendre les ' + nbPrec + ' parcelles de « ' + prec.nom + ' » (nom, surface, lieu)') : null,
      h('button', { type: 'submit', class: 'btn large' }, icone('ok'), c ? 'Enregistrer' : 'Commencer la campagne'));
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var nom = U.val(form, 'nom'); if (!nom) return U.erreur(form, 'nom', 'Donnez un nom à la campagne.');
      var d = dateOk(form, 'debut', { futur: true }); if (!d) return;
      var r = c ? copie(c) : nouveau('campagne'); r.nom = nom; r.saison = U.radio(form, 'saison'); r.debut = d;
      var recs = [r];
      if (!c && U.coche(form, 'reprendre') && prec) {
        var anciennes = S.D.parcelle.filter(function (p) { return p.campagneId === prec.id; });
        if (!C.premium()) anciennes = anciennes.filter(function (p) { return !p.exemple; }).slice(0, CP.LIMITE_GRATUITE);
        anciennes.forEach(function (p) { recs.push(nouveau('parcelle', { campagneId: r.id, nom: p.nom, surface: p.surface, unite: p.unite, culture: p.culture, variete: '', lieu: p.lieu, lat: p.lat, lon: p.lon, note: p.note || '', exemple: p.exemple || undefined })); });
      }
      sauver(recs).then(function () { return choisirCampagne(r.id); }).then(function () { toast(c ? 'Campagne enregistrée.' : 'Campagne commencée.'); aller(accueil || !c ? '#/' : '#/campagnes'); }).catch(C.echec);
    });
    return form;
  }
  function pageCampagnes() {
    var vue = C.cadre('Mes campagnes', '#/', 'accueil'); C.bandeaux('campagnes');
    var cs = S.D.campagne.slice().sort(function (a, b) { return (a.debut || '') < (b.debut || '') ? 1 : -1; });
    vue.appendChild(lienBouton('#/campagne/nouveau', 'Nouvelle campagne', 'large', 'plus', { 'data-action': 'nouvelle-campagne' }));
    vue.appendChild(h('section', { class: 'carte' }, h('ul', { class: 'liste' }, cs.map(function (c) {
      var T = CP.analyserCampagne(S.D, c.id).totaux, actif = c.id === S.active;
      return h('li', null, h('div', { class: 'element' },
        h('span', { class: 'quoi' }, h('b', null, c.nom), h('span', null, U.nombre(T.surfaceHa, 2) + ' ha · marge ' + U.fcfa(T.marge))),
        actif ? h('span', { class: 'pastille ok' }, 'en cours') : bouton('Ouvrir', 'petit', function () { choisirCampagne(c.id).then(function () { toast('Campagne « ' + c.nom + ' » ouverte.'); aller('#/'); }); }, null, { 'data-ouvrir': c.nom })),
        h('div', { class: 'boutons', style: 'margin:0 0 10px' }, lienBouton('#/campagne/' + c.id, 'Modifier', 'petit secondaire', 'modifier'),
          bouton('Supprimer', 'petit danger', function () { supprimerCampagne(c); }, 'corbeille')));
    }))));
  }
  function pageFormCampagne(id) {
    var c = id ? S.idx[id] : null; if (id && !c) { aller('#/campagnes'); return; }
    ouvrirFormulaire(c ? 'Modifier la campagne' : 'Nouvelle campagne', '#/campagnes', 'accueil').appendChild(formCampagne(c, false));
  }
  function supprimerCampagne(c) {
    var ps = S.D.parcelle.filter(function (p) { return p.campagneId === c.id; }).map(function (p) { return p.id; });
    if (!confirm('Supprimer la campagne « ' + c.nom + ' » avec ses ' + U.pluriel(ps.length, 'parcelle') + ' et tout ce qui y est noté ?')) return;
    var ids = [c.id].concat(ps);
    S.recs.forEach(function (r) { if (ps.indexOf(r.parcelleId) >= 0 || r.campagneId === c.id) ids.push(r.id); });
    effacer(ids).then(function () { return DB.ecrire('campagneActive', S.active); }).then(function () { toast('Campagne supprimée.'); C.afficher(); }).catch(C.echec);
  }

  // ---------- Parcelle ----------
  function pageParcelle(id) {
    var p = S.idx[id]; if (!p || p.type !== 'parcelle') { aller('#/'); return; }
    if (p.campagneId !== S.active) { choisirCampagne(p.campagneId).then(function () { pageParcelle(id); }); return; }
    var b = S.B.parcelles[id], c = CP.culture(p.culture);
    var vue = C.cadre(p.nom, '#/', 'accueil'); C.bandeaux('parcelle');
    vue.appendChild(h('section', { class: 'carte' },
      h('div', { class: 'element', style: 'padding:0' }, emojiCulture(p), h('span', { class: 'quoi' }, h('b', { style: 'font-size:1.2rem' }, c.nom + (p.variete ? ' · ' + p.variete : '')),
        h('span', null, CP.texteSurface(p) + (p.unite === 'm2' ? ' (' + U.nombre(b.surfaceHa, 4) + ' ha)' : '') + (p.lieu ? ' · ' + p.lieu : '')))),
      h('div', { class: 'kpis', style: 'margin-top:10px' },
        kpi('Récolte', U.kg(b.recolteKg, 0), b.stockKg > 0 && b.nbVentes ? U.kg(b.stockKg, 0) + ' pas encore vendus' : null, { id: 'p-recolte' }),
        kpi('Rendement', b.rendementHa != null ? U.nombre(b.rendementHa) + ' kg/ha' : '—', 'récolte ÷ surface', { id: 'p-rendement' }),
        kpi('Dépenses', U.fcfa(b.coutTotal), 'achats ' + U.fcfa(b.depenses) + ' · main-d’œuvre ' + U.fcfa(b.travail), { id: 'p-depenses' }),
        kpi('Ventes', U.fcfa(b.ventes), b.prixMoyenKg ? U.fcfa(b.prixMoyenKg) + ' le kg en moyenne' : null, { id: 'p-ventes' }),
        kpi('Marge', U.fcfa(b.marge), b.margeHa != null ? U.fcfa(b.margeHa) + ' par ha' : null, { id: 'p-marge', signe: b.marge < 0 ? -1 : 1 }),
        kpi('Coût du kg récolté', b.coutKg != null ? U.fcfa(b.coutKg) : '—', U.nombre(b.joursTravail, 1) + ' jours de travail' + (b.joursFamiliaux ? ' (dont ' + U.nombre(b.joursFamiliaux, 1) + ' en famille)' : ''), { id: 'p-coutkg' })),
      b.valeurStock ? h('p', { class: 'discret petit' }, 'Récolte pas encore vendue : ' + U.kg(b.stockKg, 0) + ', environ ' + U.fcfa(b.valeurStock) + ' au prix moyen de vos ventes (estimation, pas comptée dans la marge).') : null,
      b.stockKg < 0 ? alerte('attention', 'Vous avez noté plus de ventes que de récolte : vérifiez les quantités.') : null));
    vue.appendChild(h('div', { class: 'actions' },
      lienBouton('#/operation/nouveau?parcelle=' + id, 'Prévoir un travail', 'principal', 'calendrier', { 'data-action': 'operation' }),
      lienBouton('#/depense/nouveau?parcelle=' + id, 'Achat, dépense', 'secondaire', 'depense', { 'data-action': 'depense' }),
      lienBouton('#/travail/nouveau?parcelle=' + id, 'Main-d’œuvre', 'secondaire', 'travail', { 'data-action': 'travail' }),
      lienBouton('#/recolte/nouveau?parcelle=' + id, 'Récolte', 'secondaire', 'recolte', { 'data-action': 'recolte' }),
      lienBouton('#/vente/nouveau?parcelle=' + id, 'Vente', 'secondaire', 'vente', { 'data-action': 'vente' })));
    // Calendrier
    var ops = S.D.operation.filter(function (o) { return o.parcelleId === id; }).sort(function (a, b2) { return a.date < b2.date ? -1 : 1; });
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'p-cal' }, h('h2', { id: 'p-cal' }, 'Calendrier des travaux'),
      ops.length ? h('ul', { class: 'liste' }, ops.map(ligneOperation)) : h('p', { class: 'discret' }, 'Prévoyez vos travaux (semis, sarclage, récolte…) : l’application vous les rappelle quand vous l’ouvrez.')));
    // Journal de la parcelle
    var deps = S.D.depense.filter(function (d) { return d.parcelleId === id; }).sort(parDateDesc);
    var trav = S.D.travail.filter(function (t) { return t.parcelleId === id; }).sort(parDateDesc);
    var partages = S.D.depense.filter(function (d) { return d.campagneId === S.active && !d.parcelleId; }).length + S.D.travail.filter(function (t) { return t.campagneId === S.active && !t.parcelleId; }).length;
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'p-dep' }, h('h2', { id: 'p-dep' }, 'Achats et main-d’œuvre'),
      deps.length || trav.length ? h('ul', { class: 'liste' }, deps.map(ligneDepense).concat(trav.map(ligneTravail))) : h('p', { class: 'discret' }, 'Rien de noté pour cette parcelle.'),
      partages ? h('p', { class: 'discret petit' }, U.pluriel(partages, 'dépense commune') + ' à toutes les parcelles : comptée(s) ici selon la surface.') : null,
      Object.keys(b.depCat).length ? U.barres(CP.CATEGORIES.filter(function (k) { return b.depCat[k.id]; }).map(function (k) { return { nom: k.nom, valeur: b.depCat[k.id], texte: U.fcfa(b.depCat[k.id]) }; }).concat(b.travail ? [{ nom: 'Main-d’œuvre', valeur: b.travail, texte: U.fcfa(b.travail) }] : []), 'Dépenses par poste') : null));
    var rec = S.D.recolte.filter(function (r) { return r.parcelleId === id; }).sort(parDateDesc);
    var ven = S.D.vente.filter(function (v) { return v.parcelleId === id; }).sort(parDateDesc);
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'p-rec' }, h('h2', { id: 'p-rec' }, 'Récoltes et ventes'),
      rec.length || ven.length ? h('ul', { class: 'liste' }, rec.map(ligneRecolte).concat(ven.map(ligneVente))) : h('p', { class: 'discret' }, 'Pas encore de récolte notée.')));
    vue.appendChild(sectionEau(p, b));
    vue.appendChild(h('div', { class: 'boutons' }, lienBouton('#/parcelle/' + id + '/modifier', 'Modifier la parcelle', 'secondaire', 'modifier', { 'data-action': 'modifier' }),
      bouton('Supprimer la parcelle', 'danger', function () { supprimerParcelle(p); }, 'corbeille')));
  }
  function supprimerParcelle(p) {
    if (!confirm('Supprimer la parcelle « ' + p.nom + ' » et tout ce qui y est noté (travaux, achats, récoltes, ventes) ?')) return;
    var ids = [p.id]; S.recs.forEach(function (r) { if (r.parcelleId === p.id) ids.push(r.id); });
    effacer(ids).then(function () { toast('Parcelle supprimée.'); aller('#/'); }).catch(C.echec);
  }

  // ---------- Besoin en eau indicatif ----------
  function sectionEau(p, b) {
    var sec = h('section', { class: 'carte', 'aria-labelledby': 'p-eau', 'data-eau': '1' }, h('h2', { id: 'p-eau' }, 'Besoin en eau indicatif'));
    sec.appendChild(h('p', { class: 'discret' }, 'Prévision de l’évaporation (ET0) et de la pluie pour les 7 prochains jours, à la position de la parcelle (service gratuit Open-Meteo). C’est un repère, pas un conseil d’arrosage.'));
    if (p.lat == null || p.lon == null) {
      sec.appendChild(alerte('info', 'Indiquez où se trouve la parcelle (ville proche ou votre position).', [' ', h('a', { href: '#/parcelle/' + p.id + '/modifier' }, 'Situer la parcelle')]));
      return sec;
    }
    var kc = entree('kc', p.eau && p.eau.kc ? p.eau.kc : S.reglages.kcDefaut, 'nombre');
    var res = h('div', { 'aria-live': 'polite' });
    var btn = bouton('Voir le besoin en eau (Internet)', '', function () { chercherEau(p, b, kc, res, btn); }, 'goutte', { 'data-action': 'eau' });
    sec.appendChild(champ('Coefficient de la culture', kc, 'Laissez 1 si vous ne savez pas. Il dépend de la culture et de son stade (par exemple plus bas au début, plus haut en pleine croissance).'));
    sec.appendChild(btn);
    sec.appendChild(res);
    if (p.eau && p.eau.jours) afficherEau(p, b, U.lireNombre(kc.value), res);
    kc.addEventListener('input', function () { if (p.eau && p.eau.jours) afficherEau(p, b, U.lireNombre(kc.value), res); });
    return sec;
  }
  function chercherEau(p, b, kcInput, res, btn) {
    var kc = U.lireNombre(kcInput.value);
    if (!(kc > 0 && kc <= 2)) { toast('Coefficient entre 0,1 et 2 (1 si vous ne savez pas).'); return; }
    btn.disabled = true; res.textContent = ''; res.appendChild(alerte('info', 'Recherche de la prévision…'));
    fetch(CP.urlOpenMeteo(p.lat, p.lon), { headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      btn.disabled = false;
      var jours = CP.lireOpenMeteo(j);
      if (!jours) throw new Error('réponse');
      var n2 = copie(p); n2.eau = { le: new Date().toISOString(), jours: jours, kc: kc };
      return sauver(n2).then(function () { p.eau = n2.eau; afficherEau(n2, b, kc, res); });
    }).catch(function () {
      btn.disabled = false; res.textContent = '';
      res.appendChild(alerte('danger', 'Prévision impossible : pas de connexion à Internet ou service indisponible. Réessayez plus tard.'));
    });
  }
  function afficherEau(p, b, kc, res) {
    res.textContent = '';
    var E = CP.besoinEau(p.eau.jours, b.surfaceHa, kc > 0 ? kc : 1);
    res.appendChild(h('p', { class: 'total-direct' }, 'Sur 7 jours : ', h('b', { 'data-eau-m3': E.m3 }, U.nombre(E.m3, 1) + ' m³'), ' d’eau, soit environ ' + U.nombre(E.litres) + ' litres pour ' + CP.texteSurface(p) + ' (' + U.nombre(E.parJourM3, 1) + ' m³ par jour).'));
    res.appendChild(h('div', { class: 'defile' }, h('table', null,
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Jour'), h('th', { scope: 'col', class: 'n' }, 'ET0'), h('th', { scope: 'col', class: 'n' }, 'Pluie'), h('th', { scope: 'col', class: 'n' }, 'Besoin'))),
      h('tbody', null, E.lignes.map(function (l) { return h('tr', null, h('th', { scope: 'row' }, U.dateCourte(l.date)), h('td', { class: 'n' }, U.nombre(l.et0, 1) + ' mm'), h('td', { class: 'n' }, U.nombre(l.pluie, 1) + ' mm'), h('td', { class: 'n' }, U.nombre(l.m3, 1) + ' m³')); })))));
    res.appendChild(h('p', { class: 'discret petit' }, 'Calcul : (ET0 × ' + U.nombre(E.kc, 2) + ' − pluie) chaque jour, jamais en dessous de 0 ; 1 mm d’eau sur 1 ha = 10 m³. Prévision du ' + U.dateFr(String(p.eau.le).slice(0, 10)) + ' (Open-Meteo). Estimation indicative : le vrai besoin dépend du sol, du stade de la culture et de votre façon d’arroser.'));
  }

  // ---------- Formulaire parcelle ----------
  function pageFormParcelle(id) {
    var p = id ? S.idx[id] : null; if (id && !p) { aller('#/'); return; }
    var vue = ouvrirFormulaire(p ? 'Modifier la parcelle' : 'Nouvelle parcelle', p ? '#/parcelle/' + id : '#/', 'accueil');
    if (!S.active) { sansCampagne(vue); return; }
    if (!p && !CP.peutAjouterParcelle(S.D.parcelle, S.active, C.premium())) { vue.appendChild(carteLimite()); return; }
    var lat = p ? p.lat : null, lon = p ? p.lon : null;
    var villeCour = p && p.lieu && CP.VILLES.some(function (v) { return v.id === p.lieu; }) && lat != null ? p.lieu : '';
    var selVille = U.selection('ville', [{ id: '', nom: 'Choisir une ville proche…' }].concat(CP.VILLES), villeCour);
    var pos = h('p', { class: 'discret petit', 'aria-live': 'polite' });
    function majPos() { pos.textContent = lat != null && lon != null ? 'Position enregistrée : ' + U.nombre(lat, 3) + ' ; ' + U.nombre(lon, 3) + '.' : 'Pas encore de position (utile seulement pour le besoin en eau).'; }
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'parcelle' },
      champ('Nom de la parcelle', entree('nom', p ? p.nom : '', 'texte', { maxlength: 50, placeholder: 'Exemple : Champ du puits' })),
      h('div', { class: 'deux' }, champ('Surface', entree('surface', p ? p.surface : '', 'nombre', { placeholder: '1' })),
        h('div', { class: 'champ' }, U.choixRadio('unite', [{ id: 'ha', nom: 'ha' }, { id: 'm2', nom: 'm²' }], p ? p.unite : 'ha', 'Unité'))),
      h('p', { class: 'discret petit c-surface' }, ''),
      U.choixRadio('culture', CP.CULTURES, p ? p.culture : 'arachide', 'Culture', 'grands'),
      champ('Variété (facultatif)', entree('variete', p ? p.variete : '', 'texte', { maxlength: 50, placeholder: 'Exemple : Fleur 11, Souna, Violet de Galmi…' })),
      h('fieldset', null, h('legend', null, 'Où est la parcelle ? (facultatif)'),
        champ('Ville la plus proche', selVille),
        bouton('Utiliser ma position (GPS)', 'secondaire', function () {
          if (!navigator.geolocation) { toast('Position non disponible sur ce téléphone.'); return; }
          pos.textContent = 'Recherche de la position…';
          navigator.geolocation.getCurrentPosition(function (g) { lat = Math.round(g.coords.latitude * 10000) / 10000; lon = Math.round(g.coords.longitude * 10000) / 10000; selVille.value = ''; majPos(); },
            function () { pos.textContent = 'Position refusée ou introuvable. Choisissez plutôt une ville proche.'; }, { timeout: 15000, maximumAge: 600000 });
        }, 'position', { 'data-action': 'gps' }), pos,
        h('p', { class: 'discret petit' }, 'La position reste sur votre téléphone. Elle sert seulement si vous demandez le besoin en eau.')),
      champ('Note (facultatif)', U.zoneTexte('note', p ? p.note : '', { rows: 2, maxlength: 300 })),
      pied(p ? 'Enregistrer' : 'Ajouter la parcelle'));
    selVille.addEventListener('change', function () {
      var v = CP.VILLES.filter(function (x) { return x.id === selVille.value; })[0];
      if (v) { lat = v.lat; lon = v.lon; } majPos();
    });
    function majSurf() {
      var s = U.nb(form, 'surface'), u = U.radio(form, 'unite'), z = form.querySelector('.c-surface');
      z.textContent = s > 0 ? (u === 'ha' ? '= ' + U.nombre(s * 10000) + ' m²' : '= ' + U.nombre(s / 10000, 4) + ' ha') + '. Rappel : 1 ha = 10 000 m² (100 m × 100 m).' : 'Rappel : 1 ha = 10 000 m² (100 m × 100 m).';
    }
    form.addEventListener('input', majSurf); form.addEventListener('change', majSurf);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var nom = U.val(form, 'nom'); if (!nom) return U.erreur(form, 'nom', 'Donnez un nom à la parcelle.');
      var s = U.nb(form, 'surface'), u = U.radio(form, 'unite');
      if (!(s > 0)) return U.erreur(form, 'surface', 'Écrivez la surface.');
      if (u === 'ha' && s > 5000) return U.erreur(form, 'surface', 'Surface trop grande : en m², choisissez l’unité m².');
      var r = p ? copie(p) : nouveau('parcelle', { campagneId: S.active });
      r.nom = nom; r.surface = s; r.unite = u; r.culture = U.radio(form, 'culture'); r.variete = U.val(form, 'variete'); r.note = U.val(form, 'note');
      if (r.lat !== lat || r.lon !== lon) r.eau = null;
      r.lat = lat; r.lon = lon; r.lieu = selVille.value || (lat != null ? 'Position GPS' : '');
      sauver(r).then(function () { toast(p ? 'Parcelle enregistrée.' : 'Parcelle ajoutée.'); aller('#/parcelle/' + r.id); }).catch(C.echec);
    });
    vue.appendChild(form); majPos(); majSurf();
  }

  // ---------- Opérations (calendrier) ----------
  function ligneOperation(o) {
    var p = S.idx[o.parcelleId], k = U.ecartJours(auj(), o.date);
    var cls = o.faite ? 'fait' : k < 0 ? 'retard' : k <= S.reglages.rappelJours ? 'bientot' : '';
    var etat = o.faite ? 'Fait' + (o.dateFaite ? ' le ' + U.dateFr(o.dateFaite) : '') : k < 0 ? 'En retard de ' + U.pluriel(-k, 'jour') : U.dans(k);
    var li = h('li', { 'data-operation': CP.nature(o.nature).nom });
    var lien = h('a', { class: 'echeance ' + cls, href: '#/operation/' + o.id },
      h('span', { class: 'date-bloc', 'aria-hidden': 'true' }, h('b', null, String(U.jourDuMois(o.date))), h('span', null, U.moisCourt(o.date))),
      h('span', { class: 'quoi' }, h('b', null, CP.nature(o.nature).nom), h('span', null, (p ? CP.culture(p.culture).emoji + ' ' + p.nom + ' · ' : '') + etat)));
    li.appendChild(h('div', { class: 'ligne', style: 'flex-wrap:nowrap' }, h('div', { style: 'flex:1;min-width:0' }, lien),
      !o.faite ? bouton('Fait', 'petit', function () { marquerFait(o); }, 'ok', { 'data-action': 'fait', 'aria-label': 'Marquer « ' + CP.nature(o.nature).nom + ' » comme fait' }) : null));
    return li;
  }
  function marquerFait(o) {
    var r = copie(o); r.faite = true; r.dateFaite = auj();
    sauver(r).then(function () { toast('« ' + CP.nature(o.nature).nom + ' » marqué fait.'); C.afficher(); }).catch(C.echec);
  }
  function pageCalendrier() {
    var vue = C.cadre('Calendrier', null, 'calendrier'); C.bandeaux('calendrier');
    if (!S.active) { sansCampagne(vue); return; }
    var e = CP.echeances(S.D, S.active, auj(), S.reglages.rappelJours);
    vue.appendChild(lienBouton('#/operation/nouveau', 'Prévoir un travail', 'large', 'plus', { 'data-action': 'operation' }));
    var vide = true;
    [['retard', 'En retard'], ['aujourdhui', 'Aujourd’hui'], ['bientot', 'Dans les ' + S.reglages.rappelJours + ' prochains jours'], ['plusTard', 'Plus tard'], ['faites', 'Déjà faits']].forEach(function (g) {
      if (!e[g[0]].length) return; vide = false;
      vue.appendChild(h('section', { class: 'carte', 'data-groupe': g[0] }, h('h2', null, g[1] + ' (' + e[g[0]].length + ')'), h('ul', { class: 'liste' }, e[g[0]].map(ligneOperation))));
    });
    if (vide) vue.appendChild(h('p', { class: 'vide' }, 'Aucun travail prévu. Prévoyez semis, sarclage, récolte… : l’application vous les rappelle à l’ouverture.'));
    vue.appendChild(h('p', { class: 'discret petit' }, 'Les rappels s’affichent dans l’application. Pour prévenir quelqu’un, ouvrez un travail et touchez « Rappel sur WhatsApp » : c’est vous qui envoyez le message.'));
  }
  function pageFormOperation(id, q) {
    var o = id ? S.idx[id] : null; if (id && !o) { aller('#/calendrier'); return; }
    var retour = o ? '#/parcelle/' + o.parcelleId : (q.parcelle ? '#/parcelle/' + q.parcelle : '#/calendrier');
    var vue = ouvrirFormulaire(o ? CP.nature(o.nature).nom : 'Prévoir un travail', retour, 'calendrier');
    if (!parcelles().length && !o) { vue.appendChild(alerte('info', 'Ajoutez d’abord une parcelle.', [' ', h('a', { href: '#/parcelle/nouveau' }, 'Ajouter une parcelle')])); return; }
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'operation' },
      champ('Parcelle', selParcelle('parcelleId', o ? o.parcelleId : (q.parcelle || parcelles()[0].id), false)),
      U.choixRadio('nature', CP.NATURES, o ? o.nature : 'semis', 'Travail'),
      champ('Date prévue', entree('date', o ? o.date : U.ajouterJours(auj(), 1), 'date')),
      h('label', { class: 'case' }, h('input', { type: 'checkbox', name: 'faite', checked: o ? !!o.faite : false }), 'C’est déjà fait'),
      champ('Note (facultatif)', U.zoneTexte('note', o ? o.note : '', { rows: 2, maxlength: 200 })),
      h('p', { class: 'discret petit' }, 'Notez seulement ce que vous avez décidé. L’application ne propose ni date, ni produit, ni dose.'),
      pied('Enregistrer', o ? bouton('Supprimer ce travail', 'danger large', function () { if (confirm('Supprimer ce travail ?')) effacer(o.id).then(function () { aller(retour); }); }, 'corbeille') : null));
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var d = dateOk(form, 'date', { futur: true }); if (!d) return;
      var r = o ? copie(o) : nouveau('operation');
      r.parcelleId = U.val(form, 'parcelleId'); r.nature = U.radio(form, 'nature'); r.date = d; r.note = U.val(form, 'note');
      var f = U.coche(form, 'faite'); if (f && !r.faite) r.dateFaite = d <= auj() ? d : auj(); if (!f) r.dateFaite = null; r.faite = f;
      sauver(r).then(function () { toast('Travail enregistré.'); aller('#/parcelle/' + r.parcelleId); }).catch(C.echec);
    });
    if (o) {
      var p = S.idx[o.parcelleId];
      vue.appendChild(h('section', { class: 'carte' }, h('h2', null, 'Rappel'), h('p', null, 'Préparez un message et envoyez-le vous-même (à vous, à votre famille ou à vos ouvriers).'),
        h('div', { class: 'boutons' }, p ? U.boutonWhatsApp('Rappel sur WhatsApp', CP.messageRappel(o, p)) : null,
          !o.faite ? bouton('Marquer comme fait', '', function () { marquerFait(o); }, 'ok', { 'data-action': 'fait' }) : null)));
    }
    vue.appendChild(form);
  }

  // ---------- Dépenses (intrants et autres) ----------
  function pourTexte(x) { var p = x.parcelleId ? S.idx[x.parcelleId] : null; return p ? p.nom : 'toutes les parcelles'; }
  function ligneDepense(d) {
    return h('li', null, h('a', { class: 'element', href: '#/depense/' + d.id, style: 'min-height:52px' },
      h('span', { class: 'quoi' }, h('b', null, d.nom || CP.categorie(d.categorie).nom), h('span', null, U.dateFr(d.date) + ' · ' + CP.categorie(d.categorie).nom + (d.quantite ? ' · ' + U.nombre(d.quantite, 2) + ' ' + (d.unite || '') : '') + ' · ' + pourTexte(d))),
      h('span', { class: 'chiffre' }, U.fcfa(d.montant))));
  }
  function ligneTravail(t) {
    var m = CP.montantTravail(t);
    return h('li', null, h('a', { class: 'element', href: '#/travail/' + t.id, style: 'min-height:52px' },
      h('span', { class: 'quoi' }, h('b', null, 'Main-d’œuvre : ' + CP.nature(t.nature).nom.toLowerCase()), h('span', null, U.dateFr(t.date) + ' · ' + U.nombre(CP.joursTravail(t), 2) + ' jours de travail' + (t.mode === 'familial' ? ' (famille)' : '') + ' · ' + pourTexte(t))),
      h('span', { class: 'chiffre' }, t.mode === 'familial' ? h('small', null, 'non payé') : U.fcfa(m))));
  }
  function ligneRecolte(r) {
    var kgT = CP.kgDe(r.quantite, r.unite, r.kgParSac);
    return h('li', null, h('a', { class: 'element', href: '#/recolte/' + r.id, style: 'min-height:52px' },
      h('span', { class: 'quoi' }, h('b', null, 'Récolte'), h('span', null, U.dateFr(r.date) + (r.unite === 'sac' ? ' · ' + U.nombre(r.quantite, 2) + ' sacs de ' + U.nombre(r.kgParSac, 1) + ' kg' : ''))),
      h('span', { class: 'chiffre' }, U.kg(kgT, 0))));
  }
  function ligneVente(v) {
    return h('li', null, h('a', { class: 'element', href: '#/vente/' + v.id, style: 'min-height:52px' },
      h('span', { class: 'quoi' }, h('b', null, 'Vente' + (v.acheteur ? ' · ' + v.acheteur : '')), h('span', null, U.dateFr(v.date) + ' · ' + U.nombre(v.quantite, 2) + ' ' + (v.unite === 'sac' ? 'sacs' : 'kg') + ' à ' + U.fcfa(v.prixUnitaire))),
      h('span', { class: 'chiffre' }, h('span', { class: 'positif' }, U.fcfa(v.montant)))));
  }
  function pageDepenses() {
    var vue = C.cadre('Dépenses de la campagne', '#/bilan', 'bilan'); C.bandeaux('depenses');
    if (!S.active) { sansCampagne(vue); return; }
    var T = S.B.totaux;
    var deps = S.D.depense.filter(function (d) { return d.campagneId === S.active; }).sort(parDateDesc);
    var trav = S.D.travail.filter(function (t) { return t.campagneId === S.active; }).sort(parDateDesc);
    vue.appendChild(h('div', { class: 'kpis' }, kpi('Achats et dépenses', U.fcfa(T.depenses + T.nonReparti)), kpi('Main-d’œuvre', U.fcfa(T.travail), U.nombre(T.joursTravail, 1) + ' jours de travail')));
    vue.appendChild(h('div', { class: 'boutons' }, lienBouton('#/depense/nouveau', 'Achat, dépense', '', 'plus'), lienBouton('#/travail/nouveau', 'Main-d’œuvre', 'secondaire', 'plus')));
    vue.appendChild(h('section', { class: 'carte' }, h('h2', null, 'Achats et dépenses (' + deps.length + ')'), deps.length ? h('ul', { class: 'liste' }, deps.map(ligneDepense)) : h('p', { class: 'discret' }, 'Rien de noté.')));
    vue.appendChild(h('section', { class: 'carte' }, h('h2', null, 'Main-d’œuvre (' + trav.length + ')'), trav.length ? h('ul', { class: 'liste' }, trav.map(ligneTravail)) : h('p', { class: 'discret' }, 'Rien de noté.')));
  }
  function pageFormDepense(id, q) {
    var d = id ? S.idx[id] : null; if (id && !d) { aller('#/'); return; }
    var retour = d ? (d.parcelleId ? '#/parcelle/' + d.parcelleId : '#/depenses') : retourDe(q);
    var vue = ouvrirFormulaire(d ? 'Modifier la dépense' : 'Achat ou dépense', retour, 'accueil');
    if (!S.active) { sansCampagne(vue); return; }
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'depense' },
      U.choixRadio('categorie', CP.CATEGORIES, d ? d.categorie : 'semences', 'Quoi ?'),
      champ('Nom du produit ou de la dépense', entree('nom', d ? d.nom : '', 'texte', { maxlength: 60, placeholder: 'Exemple : semences d’arachide, engrais…' })),
      h('div', { class: 'deux' }, champ('Quantité (facultatif)', entree('quantite', d ? d.quantite : '', 'nombre')), champ('Unité', entree('unite', d ? d.unite : '', 'texte', { maxlength: 15, placeholder: 'kg, sac, litre…' }))),
      champ('Montant payé (F)', entree('montant', d ? d.montant : '', 'entier', { class: 'gros', placeholder: '45 000' })),
      champ('Date', entree('date', d ? d.date : auj(), 'date')),
      champ('Pour quelle parcelle ?', selParcelle('parcelleId', d ? (d.parcelleId || '') : (q.parcelle || (parcelles()[0] ? parcelles()[0].id : '')), true), 'Une dépense pour toutes les parcelles est partagée selon la surface, entre les parcelles qui existent aujourd’hui.'),
      champ('Vendeur (facultatif)', entree('fournisseur', d ? d.fournisseur : '', 'texte', { maxlength: 60 })),
      h('p', { class: 'discret petit' }, 'Notez les noms et les prix seulement. L’application ne conseille ni produit ni dose : suivez l’étiquette et votre conseiller agricole.'),
      pied('Enregistrer', d ? bouton('Supprimer', 'danger large', function () { if (confirm('Supprimer cette dépense ?')) effacer(d.id).then(function () { aller(retour); }); }, 'corbeille') : null));
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var m = U.nb(form, 'montant'); if (!(m > 0)) return U.erreur(form, 'montant', 'Écrivez le montant payé en F.');
      var dt = dateOk(form, 'date'); if (!dt) return;
      var qn = U.nb(form, 'quantite'); if (qn != null && !(qn >= 0)) return U.erreur(form, 'quantite', 'Écrivez un nombre.');
      var r = d ? copie(d) : nouveau('depense', { campagneId: S.active });
      r.categorie = U.radio(form, 'categorie'); r.nom = U.val(form, 'nom'); r.quantite = qn; r.unite = U.val(form, 'unite'); r.montant = Math.round(m); r.date = dt;
      r.parcelleId = U.val(form, 'parcelleId') || null; r.fournisseur = U.val(form, 'fournisseur');
      r.partage = r.parcelleId ? null : (d && d.partage && !d.parcelleId ? d.partage : parcelles().map(function (x) { return x.id; }));
      sauver(r).then(function () { toast('Dépense enregistrée.'); aller(r.parcelleId ? '#/parcelle/' + r.parcelleId : '#/depenses'); }).catch(C.echec);
    });
    vue.appendChild(form);
  }
  function pageFormTravail(id, q) {
    var t = id ? S.idx[id] : null; if (id && !t) { aller('#/'); return; }
    var retour = t ? (t.parcelleId ? '#/parcelle/' + t.parcelleId : '#/depenses') : retourDe(q);
    var vue = ouvrirFormulaire(t ? 'Main-d’œuvre' : 'Main-d’œuvre', retour, 'accueil');
    if (!S.active) { sansCampagne(vue); return; }
    var res = h('p', { class: 'total-direct', 'aria-live': 'polite' });
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'travail' },
      U.choixRadio('nature', CP.NATURES, t ? t.nature : 'sarclage', 'Travail fait'),
      champ('Date', entree('date', t ? t.date : auj(), 'date')),
      h('div', { class: 'deux' }, champ('Nombre de personnes', entree('personnes', t ? t.personnes : 1, 'nombre', { class: 'gros' })), champ('Nombre de jours', entree('jours', t ? t.jours : 1, 'nombre', { class: 'gros' }))),
      U.choixRadio('mode', [{ id: 'jour', nom: 'Payé à la journée' }, { id: 'forfait', nom: 'Payé au forfait' }, { id: 'familial', nom: 'Famille (non payé)' }], t ? t.mode : 'jour', 'Paiement'),
      champ('Prix d’une journée par personne (F)', entree('prixJour', t ? t.prixJour : '', 'entier', { placeholder: '2 500' }), null, { cls: 'c-jour' }),
      champ('Montant total payé (F)', entree('montant', t ? t.montant : '', 'entier'), null, { cls: 'c-forfait' }),
      res,
      champ('Pour quelle parcelle ?', selParcelle('parcelleId', t ? (t.parcelleId || '') : (q.parcelle || (parcelles()[0] ? parcelles()[0].id : '')), true)),
      pied('Enregistrer', t ? bouton('Supprimer', 'danger large', function () { if (confirm('Supprimer ?')) effacer(t.id).then(function () { aller(retour); }); }, 'corbeille') : null));
    function lire() { return { mode: U.radio(form, 'mode'), personnes: U.nb(form, 'personnes'), jours: U.nb(form, 'jours'), prixJour: U.nb(form, 'prixJour'), montant: U.nb(form, 'montant') }; }
    function maj() {
      var x = lire();
      form.querySelector('.c-jour').hidden = x.mode !== 'jour'; form.querySelector('.c-forfait').hidden = x.mode !== 'forfait';
      res.textContent = '';
      res.appendChild(document.createTextNode(U.nombre(CP.joursTravail(x), 2) + ' jours de travail · coût : ')); res.appendChild(h('b', { 'data-total-travail': CP.montantTravail(x) }, U.fcfa(CP.montantTravail(x))));
    }
    form.addEventListener('input', maj); form.addEventListener('change', maj);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var dt = dateOk(form, 'date'); if (!dt) return;
      var x = lire();
      if (!(x.personnes > 0)) return U.erreur(form, 'personnes', 'Au moins 1 personne.');
      if (!(x.jours > 0)) return U.erreur(form, 'jours', 'Écrivez le nombre de jours (0,5 pour une demi-journée).');
      if (x.mode === 'jour' && !(x.prixJour >= 0 && x.prixJour != null)) return U.erreur(form, 'prixJour', 'Écrivez le prix d’une journée.');
      if (x.mode === 'forfait' && !(x.montant >= 0 && x.montant != null)) return U.erreur(form, 'montant', 'Écrivez le montant payé.');
      var r = t ? copie(t) : nouveau('travail', { campagneId: S.active });
      r.nature = U.radio(form, 'nature'); r.date = dt; r.personnes = x.personnes; r.jours = x.jours; r.mode = x.mode;
      r.prixJour = x.mode === 'jour' ? Math.round(x.prixJour) : null; r.montant = x.mode === 'forfait' ? Math.round(x.montant) : null; r.parcelleId = U.val(form, 'parcelleId') || null;
      r.partage = r.parcelleId ? null : (t && t.partage && !t.parcelleId ? t.partage : parcelles().map(function (y) { return y.id; }));
      sauver(r).then(function () { toast('Main-d’œuvre enregistrée.'); aller(r.parcelleId ? '#/parcelle/' + r.parcelleId : '#/depenses'); }).catch(C.echec);
    });
    vue.appendChild(form); maj();
  }

  // ---------- Récoltes et ventes ----------
  function pageFormRecolte(id, q) {
    var x = id ? S.idx[id] : null; if (id && !x) { aller('#/'); return; }
    var retour = x ? '#/parcelle/' + x.parcelleId : retourDe(q);
    var vue = ouvrirFormulaire('Récolte', retour, 'accueil');
    if (!parcelles().length && !x) { vue.appendChild(alerte('info', 'Ajoutez d’abord une parcelle.', [' ', h('a', { href: '#/parcelle/nouveau' }, 'Ajouter une parcelle')])); return; }
    var res = h('p', { class: 'total-direct', 'aria-live': 'polite' });
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'recolte' },
      champ('Parcelle', selParcelle('parcelleId', x ? x.parcelleId : (q.parcelle || parcelles()[0].id), false)),
      champ('Date', entree('date', x ? x.date : auj(), 'date')),
      U.choixRadio('unite', [{ id: 'sac', nom: 'En sacs' }, { id: 'kg', nom: 'En kg' }], x ? x.unite : 'sac', 'Comment comptez-vous ?', 'grands'),
      h('div', { class: 'deux' }, champ('Quantité', entree('quantite', x ? x.quantite : '', 'nombre', { class: 'gros', placeholder: '16' })), champ('kg dans 1 sac', entree('kgParSac', x ? x.kgParSac : 50, 'nombre', { class: 'gros' }), null, { cls: 'c-kgsac' })),
      res, pied('Enregistrer la récolte', x ? bouton('Supprimer', 'danger large', function () { if (confirm('Supprimer cette récolte ?')) effacer(x.id).then(function () { aller(retour); }); }, 'corbeille') : null));
    function maj() {
      var u = U.radio(form, 'unite'); form.querySelector('.c-kgsac').hidden = u !== 'sac';
      var kgT = CP.kgDe(U.nb(form, 'quantite'), u, U.nb(form, 'kgParSac')), p = S.idx[U.val(form, 'parcelleId')];
      res.textContent = ''; res.hidden = !(kgT > 0);
      if (kgT > 0) { res.appendChild(document.createTextNode('= ')); res.appendChild(h('b', { 'data-kg': kgT }, U.kg(kgT, 1))); if (p && CP.surfaceHa(p) > 0) res.appendChild(document.createTextNode(', soit ' + U.nombre(kgT / CP.surfaceHa(p)) + ' kg par ha (cette récolte seule)')); }
    }
    form.addEventListener('input', maj); form.addEventListener('change', maj);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var dt = dateOk(form, 'date'); if (!dt) return;
      var u = U.radio(form, 'unite'), qn = U.nb(form, 'quantite'), ks = U.nb(form, 'kgParSac');
      if (!(qn > 0)) return U.erreur(form, 'quantite', 'Écrivez la quantité récoltée.');
      if (u === 'sac' && !(ks > 0)) return U.erreur(form, 'kgParSac', 'Combien de kg dans un sac ?');
      var r = x ? copie(x) : nouveau('recolte');
      r.parcelleId = U.val(form, 'parcelleId'); r.date = dt; r.unite = u; r.quantite = qn; r.kgParSac = u === 'sac' ? ks : null;
      sauver(r).then(function () { toast('Récolte enregistrée.'); aller('#/parcelle/' + r.parcelleId); }).catch(C.echec);
    });
    vue.appendChild(form); maj();
  }
  function pageFormVente(id, q) {
    var x = id ? S.idx[id] : null; if (id && !x) { aller('#/'); return; }
    var retour = x ? '#/parcelle/' + x.parcelleId : retourDe(q);
    var vue = ouvrirFormulaire('Vente', retour, 'accueil');
    if (!parcelles().length && !x) { vue.appendChild(alerte('info', 'Ajoutez d’abord une parcelle.', [' ', h('a', { href: '#/parcelle/nouveau' }, 'Ajouter une parcelle')])); return; }
    var res = h('p', { class: 'total-direct', 'aria-live': 'polite' });
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'vente' },
      champ('Parcelle', selParcelle('parcelleId', x ? x.parcelleId : (q.parcelle || parcelles()[0].id), false)),
      champ('Date', entree('date', x ? x.date : auj(), 'date')),
      U.choixRadio('unite', [{ id: 'sac', nom: 'En sacs' }, { id: 'kg', nom: 'Au kg' }], x ? x.unite : 'sac', 'Vendu', 'grands'),
      h('div', { class: 'deux' }, champ('Quantité', entree('quantite', x ? x.quantite : '', 'nombre', { class: 'gros' })), champ('kg dans 1 sac', entree('kgParSac', x ? x.kgParSac : 50, 'nombre', { class: 'gros' }), null, { cls: 'c-kgsac' })),
      champ('Prix (F)', entree('prixUnitaire', x ? x.prixUnitaire : '', 'entier', { class: 'gros' }), null, { cls: 'c-prix' }),
      res,
      champ('Acheteur (facultatif)', entree('acheteur', x ? x.acheteur : '', 'texte', { maxlength: 60 })),
      pied('Enregistrer la vente', x ? bouton('Supprimer', 'danger large', function () { if (confirm('Supprimer cette vente ?')) effacer(x.id).then(function () { aller(retour); }); }, 'corbeille') : null));
    function maj() {
      var u = U.radio(form, 'unite'); form.querySelector('.c-kgsac').hidden = u !== 'sac';
      form.querySelector('.c-prix label').textContent = u === 'sac' ? 'Prix d’un sac (F)' : 'Prix du kg (F)';
      var qn = U.nb(form, 'quantite'), pu = U.nb(form, 'prixUnitaire'), kgT = CP.kgDe(qn, u, U.nb(form, 'kgParSac'));
      res.textContent = ''; res.hidden = !(qn > 0 && pu > 0);
      if (qn > 0 && pu > 0) { res.appendChild(document.createTextNode('Total : ')); res.appendChild(h('b', { 'data-total-vente': Math.round(qn * pu) }, U.fcfa(qn * pu))); if (kgT > 0) res.appendChild(document.createTextNode(' pour ' + U.kg(kgT, 1) + ' (' + U.fcfa(qn * pu / kgT) + ' le kg)')); }
    }
    form.addEventListener('input', maj); form.addEventListener('change', maj);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var dt = dateOk(form, 'date'); if (!dt) return;
      var u = U.radio(form, 'unite'), qn = U.nb(form, 'quantite'), ks = U.nb(form, 'kgParSac'), pu = U.nb(form, 'prixUnitaire');
      if (!(qn > 0)) return U.erreur(form, 'quantite', 'Écrivez la quantité vendue.');
      if (u === 'sac' && !(ks > 0)) return U.erreur(form, 'kgParSac', 'Combien de kg dans un sac ?');
      if (!(pu > 0)) return U.erreur(form, 'prixUnitaire', 'Écrivez le prix.');
      var r = x ? copie(x) : nouveau('vente');
      r.parcelleId = U.val(form, 'parcelleId'); r.date = dt; r.unite = u; r.quantite = qn; r.kgParSac = u === 'sac' ? ks : null; r.prixUnitaire = Math.round(pu); r.montant = Math.round(qn * pu); r.acheteur = U.val(form, 'acheteur');
      sauver(r).then(function () { toast('Vente enregistrée : ' + U.fcfa(r.montant) + '.'); aller('#/parcelle/' + r.parcelleId); }).catch(C.echec);
    });
    vue.appendChild(form); maj();
  }

  // ---------- Bilan et comparaison ----------
  function pageBilan() {
    var vue = C.cadre('Bilan', null, 'bilan'); C.bandeaux('bilan');
    if (!S.active) { sansCampagne(vue); return; }
    var c = campagne(), T = S.B.totaux, ps = parcelles();
    vue.appendChild(h('h1', { style: 'margin:4px 0 0' }, c.nom));
    vue.appendChild(h('section', { class: 'carte' }, h('div', { class: 'kpis' },
      kpi('Marge de la campagne', U.fcfa(T.marge), 'ventes − dépenses', { id: 'b-marge', signe: T.marge < 0 ? -1 : 1, large: true }),
      kpi('Marge par ha', T.margeHa != null ? U.fcfa(T.margeHa) : '—', U.nombre(T.surfaceHa, 2) + ' ha', { id: 'b-margeha' }),
      kpi('Ventes', U.fcfa(T.ventes), null, { id: 'b-ventes' }),
      kpi('Dépenses', U.fcfa(T.coutTotal), null, { id: 'b-depenses' }),
      kpi('Récolte', U.kg(T.recolteKg, 0), null, { id: 'b-recolte' })),
      T.valeurStock ? h('p', { class: 'discret petit' }, 'Récolte pas encore vendue : environ ' + U.fcfa(T.valeurStock) + ' au prix moyen de vos ventes (pas comptée dans la marge).') : null,
      T.nonReparti ? h('p', { class: 'discret petit' }, U.fcfa(T.nonReparti) + ' de dépenses communes sans parcelle (comptées dans le total).') : null,
      h('p', null, h('a', { href: '#/depenses' }, 'Voir toutes les dépenses'))));
    if (ps.length) vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'b-parc' }, h('h2', { id: 'b-parc' }, 'Par parcelle'),
      h('div', { class: 'defile' }, h('table', null,
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Parcelle'), h('th', { scope: 'col', class: 'n' }, 'Rendement'), h('th', { scope: 'col', class: 'n' }, 'Dépenses'), h('th', { scope: 'col', class: 'n' }, 'Ventes'), h('th', { scope: 'col', class: 'n' }, 'Marge'), h('th', { scope: 'col', class: 'n' }, 'Marge/ha'))),
        h('tbody', null, ps.map(function (p) {
          var b = S.B.parcelles[p.id];
          return h('tr', null, h('th', { scope: 'row' }, CP.culture(p.culture).emoji + ' ' + p.nom), h('td', { class: 'n' }, b.rendementHa != null ? U.nombre(b.rendementHa) + ' kg/ha' : '—'),
            h('td', { class: 'n' }, U.fcfa(b.coutTotal)), h('td', { class: 'n' }, U.fcfa(b.ventes)), h('td', { class: 'n ' + (b.marge < 0 ? 'negatif' : 'positif') }, U.fcfa(b.marge)), h('td', { class: 'n' }, b.margeHa != null ? U.fcfa(b.margeHa) : '—'));
        })))),
      U.barres(ps.map(function (p) { var b = S.B.parcelles[p.id]; return { nom: p.nom, valeur: b.marge, texte: U.fcfa(b.marge) }; }), 'Marge par parcelle')));
    if (Object.keys(T.depCat).length || T.travail) vue.appendChild(h('section', { class: 'carte' }, h('h2', null, 'Où va l’argent'),
      U.barres(CP.CATEGORIES.filter(function (k) { return T.depCat[k.id]; }).map(function (k) { return { nom: k.nom, valeur: T.depCat[k.id], texte: U.fcfa(T.depCat[k.id]) }; }).concat(T.travail ? [{ nom: 'Main-d’œuvre', valeur: T.travail, texte: U.fcfa(T.travail) }] : []))));
    var zone = h('div', { id: 'fichier-pret' });
    vue.appendChild(h('section', { class: 'carte' }, h('h2', null, 'Rapport et partage'),
      h('div', { class: 'boutons' }, bouton('Rapport PDF de la campagne', '', function () { rapport(zone); }, 'pdf', { 'data-action': 'pdf' }), U.boutonWhatsApp('Envoyer le bilan', CP.messageBilan(c, T))), zone));
    vue.appendChild(sectionComparaison());
  }
  function sectionComparaison() {
    var L = CP.comparerCampagnes(S.D);
    var sec = h('section', { class: 'carte', 'aria-labelledby': 'b-cmp', 'data-comparaison': L.length }, h('h2', { id: 'b-cmp' }, 'Comparer les campagnes'));
    if (L.length < 2) { sec.appendChild(h('p', { class: 'discret' }, 'Après votre deuxième campagne, vous verrez ici ce qui a le mieux marché d’une année à l’autre.')); return sec; }
    sec.appendChild(h('div', { class: 'defile' }, h('table', null,
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Campagne'), h('th', { scope: 'col', class: 'n' }, 'Surface'), h('th', { scope: 'col', class: 'n' }, 'Dépenses'), h('th', { scope: 'col', class: 'n' }, 'Ventes'), h('th', { scope: 'col', class: 'n' }, 'Marge'), h('th', { scope: 'col', class: 'n' }, 'Marge/ha'))),
      h('tbody', null, L.map(function (x) {
        var T = x.bilan.totaux;
        return h('tr', null, h('th', { scope: 'row' }, x.campagne.nom), h('td', { class: 'n' }, U.nombre(T.surfaceHa, 2) + ' ha'), h('td', { class: 'n' }, U.fcfa(T.coutTotal)), h('td', { class: 'n' }, U.fcfa(T.ventes)),
          h('td', { class: 'n ' + (T.marge < 0 ? 'negatif' : 'positif') }, U.fcfa(T.marge)), h('td', { class: 'n' }, T.margeHa != null ? U.fcfa(T.margeHa) : '—'));
      })))));
    sec.appendChild(h('h3', null, 'Marge par hectare'));
    sec.appendChild(U.barres(L.map(function (x) { return { nom: x.campagne.nom, valeur: x.bilan.totaux.margeHa || 0, texte: x.bilan.totaux.margeHa != null ? U.fcfa(x.bilan.totaux.margeHa) : '—' }; }), 'Marge par hectare'));
    var cultures = {};
    L.forEach(function (x) { Object.keys(x.bilan.totaux.parCulture).forEach(function (k) { cultures[k] = true; }); });
    Object.keys(cultures).forEach(function (k) {
      var items = L.filter(function (x) { var c = x.bilan.totaux.parCulture[k]; return c && c.rendementHa != null; }).map(function (x) {
        var c = x.bilan.totaux.parCulture[k]; return { nom: x.campagne.nom, valeur: c.rendementHa, texte: U.nombre(c.rendementHa) + ' kg/ha' };
      });
      if (items.length >= 2) { sec.appendChild(h('h3', null, 'Rendement : ' + CP.culture(k).nom.toLowerCase())); sec.appendChild(U.barres(items, 'Rendement ' + CP.culture(k).nom)); }
    });
    return sec;
  }

  // ---------- Rapport PDF ----------
  function rapport(zone) {
    var c = campagne(), T = S.B.totaux, ps = parcelles();
    toast('Préparation du rapport…');
    window.TPDF.creer({ app: 'Champ Pilot', titre: 'Rapport de campagne « ' + c.nom + ' »', sousTitre: 'Rapport de campagne agricole', edition: 'Édité le ' + U.dateFr(auj()),
      infos: 'Début : ' + U.dateFr(c.debut) + '  ·  ' + U.pluriel(T.nbParcelles, 'parcelle') + ', ' + U.nombre(T.surfaceHa, 2) + ' ha' }).then(function (P) {
      P.titre('Les chiffres clés');
      P.kpis([
        ['Surface', U.nombre(T.surfaceHa, 2) + ' ha'], ['Récolte', U.kg(T.recolteKg, 0)], ['Vendu', U.kg(T.venduKg, 0)],
        ['Achats et dépenses', U.fcfa(T.depenses + T.nonReparti)], ['Main-d’œuvre', U.fcfa(T.travail)], ['Dépenses totales', U.fcfa(T.coutTotal)],
        ['Ventes', U.fcfa(T.ventes)], ['Marge', U.fcfa(T.marge), T.marge < 0], ['Marge par ha', T.margeHa != null ? U.fcfa(T.margeHa) : '-', T.margeHa < 0]
      ]);
      if (T.valeurStock) P.paragraphe('Récolte pas encore vendue : environ ' + U.fcfa(T.valeurStock) + ' au prix moyen des ventes (estimation, pas comptée dans la marge).', 8.5, P.GRIS);
      P.titre('Par parcelle');
      P.tableau([{ t: 'Parcelle', w: 34 }, { t: 'Culture', w: 26 }, { t: 'Surface', w: 18, d: 1 }, { t: 'Récolte', w: 18, d: 1 }, { t: 'kg/ha', w: 14, d: 1 }, { t: 'Dépenses', w: 22, d: 1 }, { t: 'Ventes', w: 22, d: 1 }, { t: 'Marge', w: 28, d: 1, signe: 1 }],
        ps.map(function (p) {
          var b = S.B.parcelles[p.id];
          return [p.nom, CP.culture(p.culture).nom + (p.variete ? ' ' + p.variete : ''), U.nombre(b.surfaceHa, 2) + ' ha', U.nombre(b.recolteKg) + ' kg', b.rendementHa != null ? U.nombre(b.rendementHa) : '-', U.nombre(b.coutTotal), U.nombre(b.ventes), U.nombre(b.marge)];
        }), { total: ['Total', '', U.nombre(T.surfaceHa, 2) + ' ha', U.nombre(T.recolteKg) + ' kg', '', U.nombre(T.coutTotal), U.nombre(T.ventes), U.nombre(T.marge)] });
      P.titre('Où va l’argent');
      P.barres(CP.CATEGORIES.filter(function (k) { return T.depCat[k.id]; }).map(function (k) { return { nom: k.nom, valeur: T.depCat[k.id], texte: U.fcfa(T.depCat[k.id]) }; }).concat(T.travail ? [{ nom: 'Main-d’œuvre (' + U.nombre(T.joursTravail, 1) + ' j)', valeur: T.travail, texte: U.fcfa(T.travail) }] : []));
      var deps = S.D.depense.filter(function (d) { return d.campagneId === S.active; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (deps.length) {
        P.titre('Achats et dépenses');
        P.tableau([{ t: 'Date', w: 22 }, { t: 'Quoi', w: 52 }, { t: 'Catégorie', w: 38 }, { t: 'Parcelle', w: 38 }, { t: 'Montant', w: 32, d: 1 }],
          deps.map(function (d) { return [U.dateFr(d.date), (d.nom || '') + (d.quantite ? ' (' + U.nombre(d.quantite, 2) + ' ' + (d.unite || '') + ')' : ''), CP.categorie(d.categorie).nom, pourTexte(d), U.fcfa(d.montant)]; }));
      }
      var trav = S.D.travail.filter(function (t) { return t.campagneId === S.active; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (trav.length) {
        P.titre('Main-d’œuvre');
        P.tableau([{ t: 'Date', w: 22 }, { t: 'Travail', w: 46 }, { t: 'Jours de travail', w: 30, d: 1 }, { t: 'Parcelle', w: 50 }, { t: 'Coût', w: 34, d: 1 }],
          trav.map(function (t) { return [U.dateFr(t.date), CP.nature(t.nature).nom + (t.mode === 'familial' ? ' (famille)' : ''), U.nombre(CP.joursTravail(t), 2), pourTexte(t), t.mode === 'familial' ? 'non payé' : U.fcfa(CP.montantTravail(t))]; }));
      }
      var ventes = S.D.vente.filter(function (v) { var p = S.idx[v.parcelleId]; return p && p.campagneId === S.active; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (ventes.length) {
        P.titre('Ventes');
        P.tableau([{ t: 'Date', w: 22 }, { t: 'Parcelle', w: 46 }, { t: 'Quantité', w: 40 }, { t: 'Prix', w: 30, d: 1 }, { t: 'Montant', w: 44, d: 1 }],
          ventes.map(function (v) { return [U.dateFr(v.date), S.idx[v.parcelleId].nom, U.nombre(v.quantite, 2) + (v.unite === 'sac' ? ' sacs de ' + U.nombre(v.kgParSac) + ' kg' : ' kg'), U.fcfa(v.prixUnitaire) + (v.unite === 'sac' ? '/sac' : '/kg'), U.fcfa(v.montant)]; }));
      }
      var ops = S.D.operation.filter(function (o) { var p = S.idx[o.parcelleId]; return p && p.campagneId === S.active; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (ops.length) {
        P.titre('Calendrier des travaux');
        P.tableau([{ t: 'Date', w: 26 }, { t: 'Travail', w: 52 }, { t: 'Parcelle', w: 60 }, { t: 'État', w: 44 }],
          ops.map(function (o) { return [U.dateFr(o.date), CP.nature(o.nature).nom, S.idx[o.parcelleId].nom, o.faite ? 'fait' : (o.date < auj() ? 'en retard' : 'prévu')]; }));
      }
      var L = CP.comparerCampagnes(S.D);
      if (L.length >= 2) {
        P.titre('Comparaison des campagnes');
        P.tableau([{ t: 'Campagne', w: 56 }, { t: 'Surface', w: 22, d: 1 }, { t: 'Dépenses', w: 28, d: 1 }, { t: 'Ventes', w: 26, d: 1 }, { t: 'Marge', w: 26, d: 1, signe: 1 }, { t: 'Marge/ha', w: 24, d: 1, signe: 1 }],
          L.map(function (x) { var t = x.bilan.totaux; return [x.campagne.nom, U.nombre(t.surfaceHa, 2) + ' ha', U.nombre(t.coutTotal), U.nombre(t.ventes), U.nombre(t.marge), t.margeHa != null ? U.nombre(t.margeHa) : '-']; }));
      }
      P.titre('À savoir');
      P.paragraphe('Rendement = récolte (kg) ÷ surface (ha). Marge = ventes − (achats + main-d’œuvre payée). Une dépense commune à toutes les parcelles est partagée selon la surface. Calculs faits par Champ Pilot à partir des saisies de l’agriculteur ; aucun conseil de produit ni de dose.', 8.5, P.GRIS);
      return P.terminer(U.nomFichier('rapport campagne ' + c.nom + ' ' + auj(), 'pdf'));
    }).then(function (r) { U.offrirFichier(zone, r.blob, r.nom, 'Rapport ' + c.nom); })
      .catch(function (e) { console.warn(e); toast('Rapport impossible : ' + (e && e.message ? e.message : 'erreur')); });
  }

  // ---------- Réglages et aide ----------
  function pageReglages() {
    var vue = C.cadre('Réglages', null, 'reglages'); C.bandeaux('reglages');
    var f = h('form', { class: 'carte', novalidate: true, 'data-form': 'rappels' }, h('h2', null, 'Rappels'),
      champ('Montrer les travaux prévus combien de jours avant ?', entree('rappelJours', S.reglages.rappelJours, 'entier'), 'Ils s’affichent en haut de l’accueil quand vous ouvrez l’application.'),
      champ('Coefficient de culture proposé pour l’eau', entree('kcDefaut', S.reglages.kcDefaut, 'nombre'), '1 si vous ne savez pas.'),
      h('button', { type: 'submit', class: 'btn' }, icone('ok'), 'Enregistrer'));
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(f);
      var r = U.nb(f, 'rappelJours'), k = U.nb(f, 'kcDefaut');
      if (!(r >= 0 && r <= 30)) return U.erreur(f, 'rappelJours', 'Entre 0 et 30 jours.');
      if (!(k > 0 && k <= 2)) return U.erreur(f, 'kcDefaut', 'Entre 0,1 et 2.');
      S.reglages = CP.reglagesComplets({ rappelJours: Math.round(r), kcDefaut: k });
      DB.ecrire('reglages', S.reglages).then(function () { toast('Réglages enregistrés.'); });
    });
    vue.appendChild(f);
    vue.appendChild(h('section', { class: 'carte' }, h('h2', null, 'Campagnes'), h('p', null, 'Campagne ouverte : ' + (campagne() ? campagne().nom : 'aucune') + '.'), lienBouton('#/campagnes', 'Mes campagnes', 'secondaire', 'liste')));
    C.sectionsReglages(vue);
  }
  function pageAide() {
    var vue = C.cadre('Aide', '#/reglages', 'reglages'); C.bandeaux('aide');
    function bloc(t, c) { vue.appendChild(h('section', { class: 'carte aide-texte' }, h('h2', null, t), c)); }
    bloc('À quoi sert Champ Pilot ?', h('p', null, 'À savoir ce que chaque parcelle vous coûte et vous rapporte, à ne pas oublier vos travaux, et à comparer vos campagnes. Vous notez, l’application calcule.'));
    bloc('Les calculs, simplement', h('ul', null,
      h('li', null, h('b', null, 'Surface'), ' : 1 ha = 10 000 m² (un carré de 100 m sur 100 m).'),
      h('li', null, h('b', null, 'Récolte en kg'), ' = nombre de sacs × kg dans un sac.'),
      h('li', null, h('b', null, 'Rendement'), ' = récolte (kg) ÷ surface (ha). Exemple : 800 kg sur 0,5 ha = 1 600 kg/ha.'),
      h('li', null, h('b', null, 'Main-d’œuvre'), ' = personnes × jours × prix d’une journée (ou le forfait payé). Le travail de la famille compte en jours, pas en argent.'),
      h('li', null, h('b', null, 'Dépense commune'), ' (labour de tout le champ, sacs…) : partagée entre les parcelles selon leur surface, au franc près.'),
      h('li', null, h('b', null, 'Marge'), ' = ventes − (achats + main-d’œuvre payée). Marge par ha = marge ÷ surface.')));
    bloc('Besoin en eau indicatif', h('div', null,
      h('p', null, 'Sur demande seulement (bouton dans la parcelle), l’application demande au service gratuit Open-Meteo la prévision des 7 prochains jours à la position de la parcelle : l’évapotranspiration de référence (ET0, l’eau qu’un gazon bien arrosé perd chaque jour) et la pluie.'),
      h('p', null, 'Besoin par jour = ET0 × coefficient de la culture − pluie (jamais négatif). 1 mm sur 1 ha = 10 m³ = 10 000 litres. C’est un repère indicatif, pas un conseil d’arrosage : le vrai besoin dépend du sol, du stade de la culture et de votre façon d’arroser.')));
    bloc('Ce que l’application ne fait pas', h('p', null, 'Elle ne conseille ni semence, ni engrais, ni produit, ni dose : notez seulement les noms et les prix. Suivez l’étiquette des produits et votre conseiller agricole. Elle n’envoie aucun message toute seule : les boutons WhatsApp préparent un message que vous envoyez vous-même.'));
    bloc('Le pass', h('p', null, 'Gratuit : ' + CP.LIMITE_GRATUITE + ' parcelles par campagne, avec tous les calculs, le rapport PDF, la comparaison et la sauvegarde. Pass 12 mois (2 000 F, payé par Wave) : parcelles illimitées. Quand le pass se termine, rien n’est perdu ni bloqué.'));
  }

  // ---------- Routage ----------
  function routes(p, q) {
    if (!p.length) pageAccueil();
    else if (p[0] === 'campagnes') pageCampagnes();
    else if (p[0] === 'campagne' && p[1] === 'nouveau') pageFormCampagne(null);
    else if (p[0] === 'campagne' && p[1]) pageFormCampagne(p[1]);
    else if (p[0] === 'parcelle' && p[1] === 'nouveau') pageFormParcelle(null);
    else if (p[0] === 'parcelle' && p[1] && !p[2]) pageParcelle(p[1]);
    else if (p[0] === 'parcelle' && p[2] === 'modifier') pageFormParcelle(p[1]);
    else if (p[0] === 'calendrier') pageCalendrier();
    else if (p[0] === 'operation' && p[1] === 'nouveau') pageFormOperation(null, q);
    else if (p[0] === 'operation' && p[1]) pageFormOperation(p[1], q);
    else if (p[0] === 'depenses') pageDepenses();
    else if (p[0] === 'depense' && p[1] === 'nouveau') pageFormDepense(null, q);
    else if (p[0] === 'depense' && p[1]) pageFormDepense(p[1], q);
    else if (p[0] === 'travail' && p[1] === 'nouveau') pageFormTravail(null, q);
    else if (p[0] === 'travail' && p[1]) pageFormTravail(p[1], q);
    else if (p[0] === 'recolte' && p[1] === 'nouveau') pageFormRecolte(null, q);
    else if (p[0] === 'recolte' && p[1]) pageFormRecolte(p[1], q);
    else if (p[0] === 'vente' && p[1] === 'nouveau') pageFormVente(null, q);
    else if (p[0] === 'vente' && p[1]) pageFormVente(p[1], q);
    else if (p[0] === 'bilan') pageBilan();
    else if (p[0] === 'reglages') pageReglages();
    else if (p[0] === 'aide') pageAide();
    else return false;
    return true;
  }

  C = window.TC.creer({
    nom: 'Champ Pilot', titre: ['Champ ', 'Pilot'], prefixe: 'cp', version: '1.0.0', dbNom: 'champ-pilot',
    L: window.TL, DB: DB, charger: charger, routes: routes, aDesDonnees: aDesDonnees,
    bandeauxApp: function (route, ajout) {
      if (route !== 'calendrier' && route !== 'accueil' && S.active) {
        var e = CP.echeances(S.D, S.active, auj(), S.reglages.rappelJours);
        if (e.retard.length + e.aujourdhui.length && route !== 'form') ajout(alerte('attention', U.pluriel(e.retard.length + e.aujourdhui.length, 'travail', 'travaux') + ' à faire aujourd’hui ou en retard.', [' ', h('a', { href: '#/calendrier' }, 'Voir')]));
      }
    },
    offres: {
      texteGratuit: 'Vous suivez ' + CP.LIMITE_GRATUITE + ' parcelles par campagne, avec tous les calculs. Le pass enlève la limite.',
      gratuit: [CP.LIMITE_GRATUITE + ' parcelles par campagne', 'Calendrier des travaux et rappels', 'Achats, main-d’œuvre, récoltes, ventes', 'Rendement, marge, comparaison des campagnes', 'Besoin en eau indicatif, rapport PDF, sauvegarde'],
      complet: ['Parcelles illimitées', 'Tout ce que fait la version gratuite', 'Vos données restent à vous, même après le pass']
    },
    sauvegarde: {
      app: 'ChampPilot', photos: false,
      exporter: function () { return Promise.resolve({ recs: S.recs.filter(function (r) { return !r.exemple; }), reglages: S.reglages, campagneActive: S.idx[S.active] && !S.idx[S.active].exemple ? S.active : null }); },
      valider: CP.validerSauvegarde
    },
    apropos: ['Carnet de campagne agricole : parcelles, travaux, achats, main-d’œuvre, récoltes, ventes, rendement et marge.',
      'Pas de conseil de produit, de dose ou de traitement : seulement vos noms et vos prix.',
      'Vos données restent sur ce téléphone. Rien n’est envoyé sur Internet, sauf la vérification de votre pass (une fois) et, seulement si vous touchez le bouton, la position de la parcelle au service météo Open-Meteo pour le besoin en eau.']
  });
  window.CPApp = { S: S, C: C };
  C.demarrer();
})();
