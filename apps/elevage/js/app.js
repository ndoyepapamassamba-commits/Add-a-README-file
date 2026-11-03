/* Carnet Élevage — écrans : troupeau, lots, animaux, pesées, aliment, dépenses, mises-bas, Tabaski, réglages. */
(function () {
  'use strict';
  var U = window.TU, CE = window.CE, DB = window.TDB, h = U.h, icone = U.icone, bouton = U.bouton, lienBouton = U.lienBouton,
    alerte = U.alerte, kpi = U.kpi, champ = U.champ, entree = U.entree, toast = U.toast;
  var S = { recs: [], idx: {}, reglages: CE.reglagesComplets(), A: null, minis: {} };
  var C;

  // ---------- Données ----------
  function auj() { return U.dateISO(new Date()); }
  function recalculer() {
    S.idx = {}; S.recs.forEach(function (r) { S.idx[r.id] = r; });
    S.A = CE.analyser(S.recs, S.reglages, auj());
  }
  function liste(type) { return S.A.D[type]; }
  function charger() {
    return Promise.all([DB.tout(), DB.lire('reglages'), DB.photos()]).then(function (r) {
      S.recs = Array.isArray(r[0]) ? r[0] : [];
      S.reglages = CE.reglagesComplets(r[1]);
      S.minis = {}; (r[2] || []).forEach(function (p) { if (p && p.mini) S.minis[p.id] = p.mini; });
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
    return DB.supprimer(ids).then(function () {
      S.recs = S.recs.filter(function (r) { return ids.indexOf(r.id) < 0; });
      ids.forEach(function (id) { delete S.minis[id]; });
      recalculer();
    });
  }
  function enregistrerReglages(r) { S.reglages = CE.reglagesComplets(r); recalculer(); return DB.ecrire('reglages', S.reglages); }
  function copie(x) { return JSON.parse(JSON.stringify(x)); }
  function nouveau(type, o) { o = o || {}; o.id = U.nouvelId(); o.type = type; return o; }
  function animauxPresents() { return liste('animal').filter(function (a) { return CE.statut(a) === 'present'; }); }
  function triNom(a, b) { return String(a.nom).localeCompare(String(b.nom), 'fr', { numeric: true }); }
  function espece(a) { return CE.ESPECES[a.espece] || CE.ESPECES.mouton; }
  function tab() { return CE.dateTabaski(S.reglages, auj()); }
  function aDesDonnees() { return S.recs.some(function (r) { return !r.exemple; }); }
  function aller(x) { C.aller(x); }

  // ---------- Petits éléments ----------
  function vignette(a) {
    var m = S.minis[a.id];
    return h('span', { class: 'vignette', 'aria-hidden': 'true' }, m ? h('img', { src: m, alt: '' }) : espece(a).emoji);
  }
  function libelleStatut(B) {
    if (B.statut === 'vendu') return h('span', { class: 'pastille ok' }, 'Vendu');
    if (B.statut === 'mort') return h('span', { class: 'pastille danger' }, 'Mort');
    if (B.statut === 'autre') return h('span', { class: 'pastille' }, 'Sorti');
    return null;
  }
  function ligneAnimal(a) {
    var B = S.A.animaux[a.id], e = espece(a), lot = S.idx[a.lotId];
    var sous = e.nom + (a.sexe === 'F' ? ' · femelle' : a.sexe === 'M' ? ' · mâle' : '') + (B.poidsActuel != null ? ' · ' + U.kg(B.poidsActuel) : '') + (lot ? ' · ' + lot.nom : '');
    var droite = B.statut === 'vendu' ? h('span', { class: 'chiffre' }, h('span', { class: B.marge < 0 ? 'negatif' : 'positif' }, (B.marge > 0 ? '+' : '') + U.fcfa(B.marge)), h('small', null, 'marge'))
      : B.present ? h('span', { class: 'chiffre' }, B.gmq != null ? U.nombre(B.gmq) + ' g/j' : U.fcfa(B.coutTotal), h('small', null, B.gmq != null ? 'gain par jour' : 'coût à ce jour'))
        : libelleStatut(B);
    return h('li', null, h('a', { class: 'element', href: '#/animal/' + a.id, 'data-animal': a.nom }, vignette(a),
      h('span', { class: 'quoi' }, h('b', null, a.nom), h('span', null, sous)), droite));
  }
  function carteLimite() {
    return h('section', { class: 'carte', 'data-limite': '1' }, h('h2', null, 'Limite de la version gratuite'),
      h('p', null, 'La version gratuite suit jusqu’à ' + CE.LIMITE_GRATUITE + ' animaux présents à la fois. Vous en avez ' + CE.nbComptes(liste('animal')) + '.'),
      h('p', null, 'Avec le pass 12 mois (3 000 F), ajoutez autant d’animaux que vous voulez. Vos animaux déjà notés restent tous modifiables, avec ou sans pass.'),
      lienBouton('#/pass', 'Voir le pass', 'accent large', 'etoile'));
  }
  function ouvrirFormulaire(titre, retour, onglet) { var v = C.cadre(titre, retour, onglet); C.bandeaux('form'); return v; }
  function pied(texte, extra) { return h('div', { class: 'pied-form' }, h('button', { type: 'submit', class: 'btn large' }, icone('ok'), texte), extra || null); }
  function dateOk(form, nom, opts) {
    opts = opts || {};
    var d = U.val(form, nom);
    if (!U.dateValide(d)) { U.erreur(form, nom, 'Choisissez une date.'); return null; }
    if (!opts.futur && d > auj()) { U.erreur(form, nom, 'La date ne peut pas être après aujourd’hui.'); return null; }
    if (opts.min && d < opts.min) { U.erreur(form, nom, opts.minTexte || 'Date trop ancienne.'); return null; }
    return d;
  }

  // ---------- Accueil ----------
  function pageAccueil() {
    var vue = C.cadre(null, null, 'accueil'); C.bandeaux('accueil');
    var A = S.A, G = A.global, animaux = liste('animal'), lots = liste('lot');
    if (!animaux.length && !lots.length) {
      vue.appendChild(h('section', { class: 'carte', 'data-bienvenue': '1' }, h('h1', null, 'Bienvenue dans Carnet Élevage'),
        h('p', null, 'Votre cahier d’élevage sur le téléphone, pour moutons, chèvres et bovins.'),
        h('ul', { class: 'liste-coches' }, h('li', null, 'Notez vos animaux, leurs pesées et ce que vous dépensez.'),
          h('li', null, 'L’application calcule le gain par jour, le coût du kilo gagné et votre marge.'),
          h('li', null, 'Préparez la Tabaski : jours restants et prix de vente pour gagner ce que vous voulez.')),
        h('div', { class: 'boutons' }, lienBouton('#/animal/nouveau', 'Ajouter mon premier animal', 'large', 'plus', { 'data-action': 'premier' }),
          bouton('Voir un exemple', 'secondaire large', creerExemple, 'info', { 'data-action': 'exemple' })),
        h('p', { class: 'discret petit' }, 'Gratuit jusqu’à ' + CE.LIMITE_GRATUITE + ' animaux. Tout reste sur votre téléphone, même sans Internet.')));
      vue.appendChild(carteTabaski());
      return;
    }
    vue.appendChild(carteTabaski());
    var nbC = CE.nbComptes(animaux);
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'acc-chiffres' }, h('h2', { id: 'acc-chiffres', class: 'invisible' }, 'Chiffres clés'),
      h('div', { class: 'kpis' },
        kpi('Animaux présents', U.nombre(G.nbPresents), C.premium() ? 'version complète' : nbC + ' / ' + CE.LIMITE_GRATUITE + ' en gratuit', { id: 'presents' }),
        kpi('Coût des animaux présents', U.fcfa(G.coutPresents), 'achat + aliment + frais', { id: 'investi' }),
        kpi('Ventes', U.fcfa(G.ventes), U.pluriel(G.nbVendus, 'animal vendu', 'animaux vendus'), { id: 'ventes' }),
        kpi('Marge sur les ventes', G.nbVendus ? U.fcfa(G.margeVendus) : '—', 'ventes − coût des vendus', { id: 'marge', signe: G.margeVendus < 0 ? -1 : 1 }),
        kpi('Aliment par jour', U.fcfa(G.coutJour), 'selon vos rations', { id: 'alimjour' }),
        kpi('Stock d’aliment', U.fcfa(G.valeurStock), 'valeur au prix d’achat', { id: 'stock' }))));
    var points = pointsAVoir();
    if (points.length) vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'acc-points' }, h('h2', { id: 'acc-points' }, 'À voir'), points));
    vue.appendChild(h('div', { class: 'actions' },
      lienBouton('#/animal/nouveau', 'Ajouter un animal', 'principal', 'plus', { 'data-action': 'ajouter-animal' }),
      lienBouton('#/pesee', 'Pesée', 'secondaire', 'pesee', { 'data-action': 'pesee' }),
      lienBouton('#/vendre', 'Vendre', 'secondaire', 'vente', { 'data-action': 'vendre' }),
      lienBouton('#/depense/nouveau', 'Dépense', 'secondaire', 'depense', { 'data-action': 'depense' }),
      lienBouton('#/achat/nouveau', 'Acheter de l’aliment', 'secondaire', 'sac', { 'data-action': 'achat' })));
    var sec = h('section', { class: 'carte', 'aria-labelledby': 'acc-lots' }, h('div', { class: 'ligne-entre' }, h('h2', { id: 'acc-lots' }, 'Mes lots'), lienBouton('#/lot/nouveau', 'Nouveau lot', 'petit secondaire', 'plus')));
    if (!lots.length) sec.appendChild(h('p', { class: 'discret' }, 'Un lot regroupe des animaux nourris ensemble (exemple : « Embouche Tabaski 2027 »).'));
    lots.slice().sort(function (a, b) { return (b.debut || '') < (a.debut || '') ? -1 : 1; }).forEach(function (l) { sec.appendChild(carteLot(l)); });
    vue.appendChild(sec);
    var tous = animaux.slice().sort(triNom);
    var pres = tous.filter(function (a) { return CE.statut(a) === 'present'; });
    if (pres.length) vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'acc-anim' }, h('h2', { id: 'acc-anim' }, 'Animaux présents (' + pres.length + ')'),
      h('ul', { class: 'liste' }, pres.map(ligneAnimal)),
      h('p', null, lienBouton('#/animaux', 'Tous les animaux, vendus compris', 'secondaire petit', 'liste'))));
    if (S.recs.some(function (r) { return r.exemple; })) vue.appendChild(alerte('info', 'Les données « Exemple » servent à découvrir l’application.', [' ', bouton('Supprimer l’exemple', 'petit secondaire', supprimerExemple, 'corbeille', { 'data-action': 'supprimer-exemple' })]));
  }
  function carteTabaski() {
    var t = tab();
    return h('section', { class: 'carte rebours', 'aria-labelledby': 'tab-titre', 'data-tabaski': t.jours },
      h('h2', { id: 'tab-titre', style: 'margin:0 0 .3em' }, 'Tabaski ' + t.date.slice(0, 4)),
      h('div', { class: 'grand' }, t.jours === 0 ? 'Aujourd’hui' : U.nombre(t.jours), t.jours === 0 ? null : h('small', null, t.jours === 1 ? 'jour' : 'jours')),
      h('p', null, U.dateLongue(t.date), ' ', h('span', { class: 'pastille' }, t.confirmee ? 'date confirmée' : 'date à confirmer')),
      h('p', { class: 'petit' }, h('a', { href: '#/tabaski', 'data-action': 'changer-tabaski' }, 'Changer la date')));
  }
  function carteLot(l) {
    var L = S.A.lots[l.id];
    return h('a', { class: 'carte carte-lien', href: '#/lot/' + l.id, 'data-lot': l.nom },
      h('div', { class: 'entete' }, h('span', { class: 'nom' }, l.nom), h('span', { class: 'pastille' + (L.nbPresents ? ' ok' : '') }, U.pluriel(L.nbPresents, 'présent'))),
      h('div', { class: 'mini' },
        h('div', null, h('span', null, 'Coût moyen par animal'), h('b', null, U.fcfa(L.coutMoyen))),
        h('div', null, h('span', null, 'Gain moyen par jour'), h('b', null, L.gmqMoyen != null ? U.nombre(L.gmqMoyen) + ' g' : '—')),
        h('div', null, h('span', null, 'Ration par animal'), h('b', null, L.rationJour ? U.fcfa(L.rationJour.cout) + ' / jour' : 'pas notée')),
        h('div', null, h('span', null, 'Marge des vendus'), h('b', null, L.nbVendus ? U.fcfa(L.margeVendus) : '—'))));
  }
  function pointsAVoir() {
    var A = S.A, out = [];
    Object.keys(A.stock).forEach(function (k) {
      var s = A.stock[k];
      if (s.consoJour > 0 && s.stockKg <= 0) out.push(alerte('attention', 'Stock de « ' + s.aliment.nom + ' » épuisé selon vos rations. Notez vos achats ou comptez votre stock.'));
      else if (s.joursRestants != null && s.joursRestants < 7) out.push(alerte('attention', 'Stock de « ' + s.aliment.nom + ' » : environ ' + U.pluriel(s.joursRestants, 'jour') + ' avec vos rations.'));
    });
    liste('lot').forEach(function (l) {
      var L = A.lots[l.id];
      if (L.nbPresents && !L.rationJour) out.push(alerte('info', 'Lot « ' + l.nom + ' » : notez la ration donnée pour compter le coût de l’aliment.', [' ', h('a', { href: '#/lot/' + l.id + '/ration' }, 'Noter la ration')]));
      else if (L.rationJour && L.rationJour.manque) out.push(alerte('info', 'Lot « ' + l.nom + ' » : un aliment de la ration n’a pas de prix. Notez un achat ou un prix du kg.', [' ', h('a', { href: '#/aliments' }, 'Aliments')]));
    });
    liste('saillie').forEach(function (s) {
      var e = CE.etatSaillie(s, S.reglages, auj());
      if (e === 'proche') { var p = CE.miseBasPrevue(s, S.reglages); out.push(alerte('ok', 'Mise-bas attendue pour « ' + nomFemelle(s) + ' » ' + U.dans(U.ecartJours(auj(), p.date)) + ' (vers le ' + U.dateFr(p.date) + ').', [' ', h('a', { href: '#/saillie/' + s.id }, 'Voir')])); }
    });
    if (A.nonReparti.length) out.push(alerte('info', U.pluriel(A.nonReparti.length, 'dépense') + ' sans animal présent à sa date : comptée(s) dans les totaux mais dans aucun animal.'));
    return out;
  }

  // ---------- Exemple ----------
  function creerExemple() {
    sauver(CE.exemple(auj())).then(function () { toast('Exemple créé.'); var l = liste('lot').filter(function (x) { return x.exemple; })[0]; aller(l ? '#/lot/' + l.id : '#/'); }).catch(C.echec);
  }
  function supprimerExemple() {
    if (!confirm('Supprimer toutes les données d’exemple ?')) return;
    effacer(S.recs.filter(function (r) { return r.exemple; }).map(function (r) { return r.id; })).then(function () { toast('Exemple supprimé.'); aller('#/'); }).catch(C.echec);
  }

  // ---------- Tous les animaux ----------
  function pageAnimaux() {
    var vue = C.cadre('Tous les animaux', '#/', 'accueil'); C.bandeaux('animaux');
    var groupes = [['present', 'Présents'], ['vendu', 'Vendus'], ['mort', 'Morts'], ['autre', 'Sortis']];
    var tous = liste('animal').slice().sort(triNom);
    if (!tous.length) vue.appendChild(h('p', { class: 'vide' }, 'Aucun animal pour l’instant.'));
    groupes.forEach(function (g) {
      var l = tous.filter(function (a) { return CE.statut(a) === g[0]; });
      if (l.length) vue.appendChild(h('section', { class: 'carte' }, h('h2', null, g[1] + ' (' + l.length + ')'), h('ul', { class: 'liste' }, l.map(ligneAnimal))));
    });
    vue.appendChild(lienBouton('#/animal/nouveau', 'Ajouter un animal', 'large', 'plus'));
  }

  // ---------- Lot ----------
  function pageLot(id) {
    var l = S.idx[id]; if (!l || l.type !== 'lot') { aller('#/'); return; }
    var L = S.A.lots[id], vue = C.cadre(l.nom, '#/', 'accueil'); C.bandeaux('lot');
    vue.appendChild(h('section', { class: 'carte' },
      h('p', { class: 'discret' }, 'Commencé le ' + U.dateFr(l.debut) + (l.note ? ' · ' + l.note : '')),
      h('div', { class: 'kpis' },
        kpi('Animaux présents', U.nombre(L.nbPresents), [L.nbVendus ? U.pluriel(L.nbVendus, 'vendu') : null, L.nbMorts ? U.pluriel(L.nbMorts, 'mort') : null, L.nbAutres ? U.pluriel(L.nbAutres, 'sorti') : null].filter(Boolean).join(', ') || null, { id: 'lot-presents' }),
        kpi('Dépensé au total', U.fcfa(L.coutTotal), 'achat ' + U.fcfa(L.achat) + ' · aliment ' + U.fcfa(L.aliment) + ' · frais ' + U.fcfa(L.frais + L.fraisNonRepartis), { id: 'lot-cout' }),
        kpi('Coût moyen par animal', U.fcfa(L.coutMoyen), null, { id: 'lot-moyen' }),
        kpi('Gain moyen par jour', L.gmqMoyen != null ? U.nombre(L.gmqMoyen) + ' g' : '—', L.poidsMoyen != null ? 'poids moyen ' + U.kg(L.poidsMoyen) : 'faites au moins 2 pesées', { id: 'lot-gmq' }),
        kpi('Coût du kilo gagné', L.coutKgGagne != null ? U.fcfa(L.coutKgGagne) : '—', 'dépenses ÷ kilos pris', { id: 'lot-ckg' }),
        kpi('Ventes', U.fcfa(L.ventes), L.nbVendus ? 'marge des vendus : ' + U.fcfa(L.margeVendus) : null, { id: 'lot-ventes', signe: L.nbVendus ? (L.margeVendus < 0 ? -1 : 1) : 0 }))));
    // Ration
    var r = L.rationJour, rs = h('section', { class: 'carte', 'aria-labelledby': 'lot-ration' }, h('h2', { id: 'lot-ration' }, 'Ration donnée'));
    if (r) {
      rs.appendChild(h('ul', null, (r.ration.lignes || []).map(function (x) { var al = S.idx[x.alimentId]; return h('li', null, U.kg(x.kg, 2) + ' de ' + (al ? al.nom : '?') + ' par animal et par jour'); })));
      rs.appendChild(h('p', { class: 'total-direct' }, 'Coût : ', h('b', { 'data-cout-ration': Math.round(r.cout) }, U.fcfa(r.cout)), ' par animal et par jour', L.nbPresents ? ' · ' + U.fcfa(L.coutJour) + ' par jour pour le lot' : ''));
      if (r.manque) rs.appendChild(alerte('attention', 'Un aliment n’a pas de prix : notez un achat ou indiquez son prix du kg.'));
      rs.appendChild(h('p', { class: 'discret petit' }, 'Depuis le ' + U.dateFr(r.ration.debut) + '. C’est vous qui choisissez la ration ; l’application calcule seulement son coût.'));
    } else rs.appendChild(h('p', null, 'Notez ce que vous donnez à chaque animal par jour : l’application calcule le coût de l’aliment et le stock restant.'));
    rs.appendChild(lienBouton('#/lot/' + id + '/ration', r ? 'Changer la ration' : 'Noter la ration', 'secondaire', 'sac', { 'data-action': 'ration' }));
    vue.appendChild(rs);
    // Animaux
    var an = L.ids.map(function (x) { return S.idx[x]; }).sort(function (a, b) { var sa = CE.statut(a) === 'present' ? 0 : 1, sb = CE.statut(b) === 'present' ? 0 : 1; return sa - sb || triNom(a, b); });
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'lot-an' }, h('div', { class: 'ligne-entre' }, h('h2', { id: 'lot-an' }, 'Animaux (' + an.length + ')'), lienBouton('#/animal/nouveau?lot=' + id, 'Ajouter', 'petit secondaire', 'plus')),
      an.length ? h('ul', { class: 'liste' }, an.map(ligneAnimal)) : h('p', { class: 'discret' }, 'Aucun animal dans ce lot.'),
      L.nbPresents ? h('div', { class: 'boutons' }, lienBouton('#/lot/' + id + '/pesee', 'Peser le lot', '', 'pesee', { 'data-action': 'seance' })) : null));
    // Prix visé
    if (L.nbPresents) vue.appendChild(calculPrixLot(id));
    // Dépenses
    var deps = liste('depense').filter(function (d) { return d.cible === 'lot' && d.cibleId === id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'lot-dep' }, h('div', { class: 'ligne-entre' }, h('h2', { id: 'lot-dep' }, 'Frais du lot'), lienBouton('#/depense/nouveau?cible=lot&id=' + id, 'Ajouter', 'petit secondaire', 'plus')),
      deps.length ? h('ul', { class: 'liste' }, deps.map(ligneDepense)) : h('p', { class: 'discret' }, 'Berger, eau, transport… partagés entre les animaux présents le jour de la dépense.'),
      Object.keys(L.fraisCat).length ? U.barres(CE.CATEGORIES.filter(function (c) { return L.fraisCat[c.id]; }).map(function (c) { return { nom: c.nom, valeur: L.fraisCat[c.id], texte: U.fcfa(L.fraisCat[c.id]) }; }), 'Frais par catégorie') : null));
    // Partage et rapport
    var zone = h('div', { id: 'fichier-pret' });
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'lot-part' }, h('h2', { id: 'lot-part' }, 'Rapport et partage'),
      h('div', { class: 'boutons' }, bouton('Rapport PDF du lot', '', function () { rapportLot(id, zone); }, 'pdf', { 'data-action': 'pdf' }),
        U.boutonWhatsApp('Envoyer le résumé', CE.messageLot(L, auj(), tab()))), zone));
    vue.appendChild(h('div', { class: 'boutons' }, lienBouton('#/lot/' + id + '/modifier', 'Modifier le lot', 'secondaire', 'modifier'),
      bouton('Supprimer le lot', 'danger', function () { supprimerLot(l); }, 'corbeille')));
  }
  function calculPrixLot(id) {
    var t = tab(), sec = h('section', { class: 'carte', 'aria-labelledby': 'lot-prix', 'data-prix-lot': '1' }, h('h2', { id: 'lot-prix' }, 'Prix de vente pour gagner ce que vous voulez'));
    var dV = entree('dateVente', t.date, 'date'), mg = entree('marge', S.reglages.margeVisee, 'entier');
    var res = h('div', { 'aria-live': 'polite' });
    function maj() {
      res.textContent = '';
      var d = U.dateValide(dV.value) ? dV.value : t.date, m = U.lireNombre(mg.value); if (!(m >= 0)) m = 0;
      var P = CE.prixViseLot(S.A, id, auj(), d, m, false);
      res.appendChild(h('p', { class: 'total-direct' }, 'Prix moyen à demander : ', h('b', { 'data-prix-moyen': P.moyen }, U.fcfa(P.moyen)), ' par animal'));
      var lignes = S.A.lots[id].ids.map(function (x) { return S.A.animaux[x]; }).filter(function (B) { return B.present; }).sort(function (a, b) { return triNom(a.animal, b.animal); });
      res.appendChild(h('div', { class: 'defile' }, h('table', null, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Animal'), h('th', { scope: 'col', class: 'n' }, 'Coût prévu'), h('th', { scope: 'col', class: 'n' }, 'Prix à demander'))),
        h('tbody', null, lignes.map(function (B) { var p = CE.prixVise(B, auj(), d, m, false); return h('tr', null, h('th', { scope: 'row' }, B.animal.nom), h('td', { class: 'n' }, U.fcfa(p.coutPrevu)), h('td', { class: 'n' }, h('b', null, U.fcfa(p.prix)))); })))));
      res.appendChild(h('p', { class: 'discret petit' }, 'Coût prévu = coût à ce jour + ' + U.pluriel(Math.max(0, U.ecartJours(auj(), d)), 'jour') + ' de ration et de frais moyens. Prix = coût prévu + la marge voulue.'));
    }
    dV.addEventListener('input', maj); mg.addEventListener('input', maj);
    sec.appendChild(h('div', { class: 'deux' }, champ('Date de vente', dV, t.confirmee ? null : 'Tabaski à confirmer'), champ('Marge voulue par animal (F)', mg)));
    sec.appendChild(res); maj();
    return sec;
  }
  function supprimerLot(l) {
    var L = S.A.lots[l.id];
    var msg = L.nbTotal ? 'Supprimer le lot « ' + l.nom + ' » et ses ' + U.pluriel(L.nbTotal, 'animal', 'animaux') + ' (pesées, ventes, rations et frais du lot compris) ?' : 'Supprimer le lot « ' + l.nom + ' » ?';
    if (!confirm(msg)) return;
    var ids = [l.id];
    L.ids.forEach(function (a) { ids.push(a); });
    S.recs.forEach(function (r) {
      if ((r.type === 'pesee' && L.ids.indexOf(r.animalId) >= 0) || (r.type === 'ration' && r.lotId === l.id) ||
        (r.type === 'depense' && ((r.cible === 'lot' && r.cibleId === l.id) || (r.cible === 'animal' && L.ids.indexOf(r.cibleId) >= 0))) ||
        (r.type === 'saillie' && L.ids.indexOf(r.femelleId) >= 0)) ids.push(r.id);
    });
    effacer(ids).then(function () { toast('Lot supprimé.'); aller('#/'); }).catch(C.echec);
  }
  function pageFormLot(id) {
    var l = id ? S.idx[id] : null;
    if (id && !l) { aller('#/'); return; }
    var vue = ouvrirFormulaire(l ? 'Modifier le lot' : 'Nouveau lot', l ? '#/lot/' + id : '#/', 'accueil');
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'lot' },
      champ('Nom du lot', entree('nom', l ? l.nom : (liste('lot').length ? '' : 'Mon troupeau'), 'texte', { maxlength: 60, placeholder: 'Exemple : Embouche Tabaski 2027' })),
      champ('Date de début', entree('debut', l ? l.debut : auj(), 'date')),
      champ('Note (facultatif)', U.zoneTexte('note', l ? l.note : '', { rows: 2, maxlength: 300 })),
      pied(l ? 'Enregistrer' : 'Créer le lot'));
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var nom = U.val(form, 'nom'); if (!nom) return U.erreur(form, 'nom', 'Donnez un nom au lot.');
      var d = dateOk(form, 'debut', { futur: true }); if (!d) return;
      var r = l ? copie(l) : nouveau('lot'); r.nom = nom; r.debut = d; r.note = U.val(form, 'note');
      sauver(r).then(function () { toast(l ? 'Lot enregistré.' : 'Lot créé.'); aller('#/lot/' + r.id); }).catch(C.echec);
    });
    vue.appendChild(form);
  }

  // ---------- Ration ----------
  function pageRation(lotId) {
    var l = S.idx[lotId]; if (!l) { aller('#/'); return; }
    var vue = ouvrirFormulaire('Ration : ' + l.nom, '#/lot/' + lotId, 'accueil');
    var aliments = liste('aliment').slice().sort(triNom);
    vue.appendChild(alerte('info', 'Notez ce que vous donnez vous-même à chaque animal, par jour. L’application ne conseille pas de ration : elle calcule son coût et votre stock.'));
    if (!aliments.length) {
      vue.appendChild(h('section', { class: 'carte' }, h('p', null, 'Ajoutez d’abord vos aliments (son, fane, tourteau, aliment bétail…) avec leurs achats.'),
        lienBouton('#/aliment/nouveau?retour=' + encodeURIComponent('#/lot/' + lotId + '/ration'), 'Ajouter un aliment', 'large', 'plus')));
      return;
    }
    var L = S.A.lots[lotId], actuelle = L.rationJour ? L.rationJour.ration : null;
    var lignes = h('div', { id: 'lignes-ration' });
    var total = h('p', { class: 'total-direct', 'aria-live': 'polite' });
    function ajouterLigne(x) {
      var sel = U.selection('aliment', [{ id: '', nom: 'Choisir…' }].concat(aliments.map(function (a) { return { id: a.id, nom: a.nom }; })), x ? x.alimentId : '');
      var q = entree('kg', x ? x.kg : '', 'nombre', { placeholder: '0,5' });
      var ligne = h('div', { class: 'ration-ligne' }, champ('Aliment', sel), champ('kg par jour', q),
        h('button', { type: 'button', class: 'fermer', 'aria-label': 'Retirer cette ligne', onclick: function () { ligne.remove(); maj(); } }, '×'));
      sel.addEventListener('change', maj); q.addEventListener('input', maj);
      lignes.appendChild(ligne);
    }
    function lire() {
      var out = [];
      lignes.querySelectorAll('.ration-ligne').forEach(function (d) {
        var a = d.querySelector('[name="aliment"]').value, k = U.lireNombre(d.querySelector('[name="kg"]').value);
        if (a && k > 0) out.push({ alimentId: a, kg: k });
      });
      return out;
    }
    function maj() {
      var c = 0, manque = false;
      lire().forEach(function (x) { var p = S.A.prix[x.alimentId]; if (p && p.prix != null) c += x.kg * p.prix; else manque = true; });
      total.textContent = '';
      total.appendChild(document.createTextNode('Coût par animal et par jour : ')); total.appendChild(h('b', { 'data-total-ration': Math.round(c) }, U.fcfa(c)));
      if (L.nbPresents) total.appendChild(document.createTextNode(' · pour ' + U.pluriel(L.nbPresents, 'animal', 'animaux') + ' : ' + U.fcfa(c * L.nbPresents) + ' par jour'));
      if (manque) total.appendChild(h('span', { class: 'discret petit', style: 'display:block' }, 'Un aliment n’a pas encore de prix (notez un achat).'));
    }
    (actuelle ? actuelle.lignes : [null]).forEach(ajouterLigne);
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'ration' },
      h('h2', null, 'Par animal et par jour'), lignes,
      bouton('Ajouter un aliment à la ration', 'secondaire petit', function () { ajouterLigne(null); maj(); }, 'plus', { 'data-action': 'ligne' }),
      total,
      champ('À partir du', entree('debut', actuelle && actuelle.debut > auj() ? actuelle.debut : (actuelle ? auj() : (l.debut || auj())), 'date'), 'Les jours d’avant gardent l’ancienne ration.'),
      pied('Enregistrer la ration'));
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var d = dateOk(form, 'debut', { futur: true }); if (!d) return;
      var l2 = lire();
      var meme = liste('ration').filter(function (r) { return r.lotId === lotId && r.debut === d; })[0];
      var r = meme ? copie(meme) : nouveau('ration', { lotId: lotId });
      r.debut = d; r.lignes = l2;
      sauver(r).then(function () { toast(l2.length ? 'Ration enregistrée.' : 'Ration arrêtée.'); aller('#/lot/' + lotId); }).catch(C.echec);
    });
    vue.appendChild(form);
    maj();
    var hist = liste('ration').filter(function (r) { return r.lotId === lotId; }).sort(function (a, b) { return a.debut < b.debut ? 1 : -1; });
    if (hist.length > 1) vue.appendChild(h('details', { class: 'carte' }, h('summary', null, 'Rations précédentes'),
      h('ul', null, hist.map(function (r) {
        return h('li', null, 'Depuis le ' + U.dateFr(r.debut) + ' : ' + ((r.lignes || []).map(function (x) { var al = S.idx[x.alimentId]; return U.kg(x.kg, 2) + ' ' + (al ? al.nom : '?'); }).join(', ') || 'aucune ration'), ' ',
          h('button', { type: 'button', class: 'btn petit danger', onclick: function () { if (confirm('Supprimer cette ration ?')) effacer(r.id).then(function () { C.afficher(); }); } }, 'Supprimer'));
      }))));
  }

  // ---------- Animal ----------
  function pageAnimal(id) {
    var a = S.idx[id]; if (!a || a.type !== 'animal') { aller('#/'); return; }
    var B = S.A.animaux[id], e = espece(a), lot = S.idx[a.lotId];
    var vue = C.cadre(a.nom, lot ? '#/lot/' + lot.id : '#/', 'accueil'); C.bandeaux('animal');
    var tete = h('section', { class: 'carte' });
    var img = h('img', { class: 'photo-grande', alt: 'Photo de ' + a.nom, hidden: true });
    if (a.photo) DB.photo(a.id).then(function (p) { if (p && p.grande) { img.src = p.grande; img.hidden = false; } });
    tete.appendChild(img);
    tete.appendChild(h('div', { class: 'ligne-entre', style: 'margin-top:8px' }, h('h1', { style: 'margin:0' }, h('span', { 'aria-hidden': 'true' }, e.emoji + ' '), a.nom), libelleStatut(B)));
    tete.appendChild(h('p', { class: 'discret' }, [e.nom + (a.sexe === 'F' ? ' femelle (' + e.femelle + ')' : a.sexe === 'M' ? ' mâle (' + e.male + ')' : ''), a.race, lot ? 'lot « ' + lot.nom + ' »' : null,
      (a.origine === 'naissance' ? 'né(e) le ' : 'arrivé(e) le ') + U.dateFr(a.dateEntree)].filter(Boolean).join(' · ')));
    if (a.sortie && a.sortie.date) tete.appendChild(alerte(B.statut === 'vendu' ? 'ok' : 'info', (B.statut === 'vendu' ? 'Vendu le ' + U.dateFr(a.sortie.date) + ' à ' + U.fcfa(a.sortie.prix) + (a.sortie.acheteur ? ' (' + a.sortie.acheteur + ')' : '') : CE.MOTIFS[a.sortie.motif] + ' le ' + U.dateFr(a.sortie.date)) + (a.sortie.note ? '. ' + a.sortie.note : '') + '.',
      [' ', bouton('Annuler la sortie', 'petit secondaire', function () { annulerSortie(a); }, null, { 'data-action': 'annuler-sortie' })]));
    tete.appendChild(h('div', { class: 'kpis' },
      kpi('Poids', B.poidsActuel != null ? U.kg(B.poidsActuel) : '—', B.datePoids ? 'le ' + U.dateFr(B.datePoids) + (B.pesees[B.pesees.length - 1].methode === 'ruban' ? ' · estimé au ruban (indicatif)' : '') : 'pas encore pesé', { id: 'poids' }),
      kpi('Gain par jour', B.gmq != null ? U.nombre(B.gmq) + ' g' : '—', B.gmqRecent != null && B.pesees.length > 2 ? 'dernière période : ' + U.nombre(B.gmqRecent) + ' g' : (B.gainKg != null ? U.kg(B.gainKg) + ' pris' : 'il faut 2 pesées'), { id: 'gmq' }),
      kpi('Coût à ce jour', U.fcfa(B.coutTotal), 'achat ' + U.fcfa(B.prixAchat) + ' · aliment ' + U.fcfa(B.aliment) + ' · frais ' + U.fcfa(B.frais), { id: 'cout' }),
      kpi('Coût du kilo gagné', B.coutKgGagne != null ? U.fcfa(B.coutKgGagne) : '—', B.coutKgGagne != null ? U.fcfa(B.coutPeriode) + ' ÷ ' + U.kg(B.gainKg) : null, { id: 'ckg' }),
      B.statut === 'vendu' ? kpi('Marge', U.fcfa(B.marge), 'vente ' + U.fcfa(B.vente) + ' − coût', { id: 'marge', signe: B.marge < 0 ? -1 : 1, large: true })
        : B.present ? kpi('Coût par jour', U.fcfa(B.coutJourAliment + B.fraisJour), 'ration ' + U.fcfa(B.coutJourAliment) + ' + frais moyens ' + U.fcfa(B.fraisJour), { id: 'coutjour' }) : kpi('Perte', U.fcfa(B.marge), null, { id: 'marge', signe: -1 })));
    if (B.present && B.rationAbsente) tete.appendChild(alerte('info', 'Pas de ration notée pour ce lot : le coût de l’aliment n’est pas compté.', [' ', h('a', { href: '#/lot/' + a.lotId + '/ration' }, 'Noter la ration')]));
    vue.appendChild(tete);
    if (B.present) vue.appendChild(h('div', { class: 'actions trois' },
      lienBouton('#/animal/' + id + '/pesee', 'Pesée', '', 'pesee', { 'data-action': 'pesee' }),
      lienBouton('#/animal/' + id + '/vente', 'Vendre', 'accent', 'vente', { 'data-action': 'vendre' }),
      lienBouton('#/depense/nouveau?cible=animal&id=' + id, 'Dépense', 'secondaire', 'depense', { 'data-action': 'depense' })));
    // Pesées
    var ps = B.pesees.slice();
    var sp = h('section', { class: 'carte', 'aria-labelledby': 'an-pes' }, h('div', { class: 'ligne-entre' }, h('h2', { id: 'an-pes' }, 'Pesées'), lienBouton('#/animal/' + id + '/pesee', 'Ajouter', 'petit secondaire', 'plus')));
    if (ps.length >= 2) sp.appendChild(courbe(ps));
    if (ps.length) sp.appendChild(h('ul', { class: 'liste' }, ps.slice().reverse().map(function (p) {
      return h('li', null, h('a', { class: 'element', href: '#/pesee/' + p.id, style: 'min-height:52px' },
        h('span', { class: 'quoi' }, h('b', null, U.kg(p.kg)), h('span', null, U.dateFr(p.date) + (p.methode === 'ruban' ? ' · estimé au ruban (' + U.nombre(p.tourCm) + ' cm)' : p.tourCm ? ' · balance · tour ' + U.nombre(p.tourCm) + ' cm' : ' · balance'))),
        p.methode === 'ruban' ? h('span', { class: 'pastille attention' }, 'indicatif') : null));
    })));
    else sp.appendChild(h('p', { class: 'discret' }, 'Pas encore de pesée. Pesez à la balance, ou mesurez le tour de poitrine pour une estimation indicative.'));
    vue.appendChild(sp);
    // Prix visé et annonce
    if (B.present) vue.appendChild(calculPrixAnimal(a, B));
    // Reproduction
    if (a.sexe === 'F') {
      var ss = liste('saillie').filter(function (s) { return s.femelleId === id; }).sort(function (x, y) { return x.date < y.date ? 1 : -1; });
      vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'an-rep' }, h('div', { class: 'ligne-entre' }, h('h2', { id: 'an-rep' }, 'Reproduction'), B.present ? lienBouton('#/saillie/nouveau?femelle=' + id, 'Saillie', 'petit secondaire', 'plus') : null),
        ss.length ? h('ul', { class: 'liste' }, ss.map(ligneSaillie)) : h('p', { class: 'discret' }, 'Aucune saillie notée.')));
    }
    // Frais propres à l'animal
    var deps = liste('depense').filter(function (d) { return d.cible === 'animal' && d.cibleId === id; });
    if (deps.length) vue.appendChild(h('section', { class: 'carte' }, h('h2', null, 'Dépenses pour cet animal'), h('ul', { class: 'liste' }, deps.map(ligneDepense))));
    if (a.mereId && S.idx[a.mereId]) vue.appendChild(h('p', null, 'Mère : ', h('a', { href: '#/animal/' + a.mereId }, S.idx[a.mereId].nom)));
    vue.appendChild(h('div', { class: 'boutons' },
      lienBouton('#/animal/' + id + '/modifier', 'Modifier', 'secondaire', 'modifier', { 'data-action': 'modifier' }),
      B.present ? lienBouton('#/animal/' + id + '/sortie', 'Mort ou autre sortie', 'secondaire', 'drapeau', { 'data-action': 'sortie' }) : null,
      bouton('Supprimer', 'danger', function () { supprimerAnimal(a); }, 'corbeille')));
  }
  function courbe(ps) {
    var W = 320, H = 150, g = 34, d = 12;
    var x0 = U.jour(ps[0].date), x1 = U.jour(ps[ps.length - 1].date), mn = Infinity, mx = -Infinity;
    ps.forEach(function (p) { mn = Math.min(mn, p.kg); mx = Math.max(mx, p.kg); });
    var pad = Math.max(1, (mx - mn) * 0.15); mn = Math.max(0, Math.floor(mn - pad)); mx = Math.ceil(mx + pad);
    function X(j) { return g + (x1 > x0 ? (j - x0) / (x1 - x0) : 0.5) * (W - g - d); }
    function Y(v) { return 10 + (1 - (v - mn) / (mx - mn || 1)) * (H - 34); }
    var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Courbe de poids : ' + ps.map(function (p) { return U.dateCourte(p.date) + ' ' + U.kg(p.kg); }).join(', '));
    function el(t, at) { var e = document.createElementNS(NS, t); for (var k in at) e.setAttribute(k, at[k]); svg.appendChild(e); return e; }
    [mn, (mn + mx) / 2, mx].forEach(function (v) {
      el('line', { x1: g, x2: W - d, y1: Y(v), y2: Y(v), stroke: 'var(--grille)', 'stroke-width': 1 });
      var t = el('text', { x: g - 4, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--discret)' }); t.textContent = U.nombre(v, 0);
    });
    el('polyline', { points: ps.map(function (p) { return X(U.jour(p.date)) + ',' + Y(p.kg); }).join(' '), fill: 'none', stroke: 'var(--serie1)', 'stroke-width': 3, 'stroke-linejoin': 'round' });
    ps.forEach(function (p) { el('circle', { cx: X(U.jour(p.date)), cy: Y(p.kg), r: 4.5, fill: p.methode === 'ruban' ? 'var(--serie2)' : 'var(--serie1)' }); });
    [ps[0], ps[ps.length - 1]].forEach(function (p, i) {
      var t = el('text', { x: X(U.jour(p.date)), y: H - 6, 'text-anchor': i ? 'end' : 'start', 'font-size': 11, fill: 'var(--discret)' }); t.textContent = U.dateCourte(p.date);
    });
    return h('div', { class: 'graphique' }, svg, h('p', { class: 'legende' }, 'Poids en kg. Points orange : estimés au ruban.'));
  }
  function calculPrixAnimal(a, B) {
    var t = tab(), sec = h('section', { class: 'carte', 'aria-labelledby': 'an-prix', 'data-prix-animal': '1' }, h('h2', { id: 'an-prix' }, 'Prix de vente et annonce'));
    var dV = entree('dateVente', t.date, 'date'), mg = entree('marge', S.reglages.margeVisee, 'entier');
    var form = h('form', { novalidate: true });
    form.appendChild(h('div', { class: 'deux' }, champ('Date de vente', dV, t.confirmee ? 'Tabaski' : 'Tabaski (date à confirmer)'), champ('Marge voulue (F)', mg)));
    form.appendChild(U.choixRadio('enPct', [{ id: 'f', nom: 'en F' }, { id: 'pct', nom: 'en % du coût' }], 'f', 'La marge est'));
    var res = h('div', { 'aria-live': 'polite' }), prixA = entree('prixAnnonce', '', 'entier'), wa = U.boutonWhatsApp('Annonce sur WhatsApp', '');
    function majWa() { var p = U.lireNombre(prixA.value); wa.setAttribute('href', U.lienWhatsApp(CE.messageAnnonce(a, B, p > 0 ? p : null))); }
    function maj() {
      res.textContent = '';
      var d = U.dateValide(dV.value) ? dV.value : t.date, m = U.lireNombre(mg.value); if (!(m >= 0)) m = 0;
      var pct = U.radio(form, 'enPct') === 'pct', P = CE.prixVise(B, auj(), d, m, pct);
      res.appendChild(h('p', { class: 'total-direct' }, 'Vendez au moins ', h('b', { 'data-prix-vise': P.prix }, U.fcfa(P.prix))));
      res.appendChild(h('p', { class: 'discret petit' }, 'Coût prévu le ' + U.dateFr(d) + ' : ' + U.fcfa(B.coutTotal) + ' + ' + U.pluriel(P.joursRestants, 'jour') + ' × ' + U.fcfa(P.coutJour) + ' = ' + U.fcfa(P.coutPrevu) +
        '. Marge : ' + U.fcfa(P.gain) + (B.poidsActuel ? '. Soit ' + U.fcfa(P.prix / B.poidsActuel) + ' le kg au poids d’aujourd’hui.' : '.')));
      prixA.value = String(P.prix); majWa();
    }
    dV.addEventListener('input', maj); mg.addEventListener('input', maj); form.addEventListener('change', maj); prixA.addEventListener('input', majWa);
    form.addEventListener('submit', function (ev) { ev.preventDefault(); });
    form.appendChild(res);
    form.appendChild(champ('Prix dans l’annonce (F)', prixA, 'Le message est préparé : c’est vous qui choisissez à qui l’envoyer.'));
    form.appendChild(h('div', { class: 'boutons' }, wa));
    sec.appendChild(form); maj();
    return sec;
  }
  function annulerSortie(a) {
    if (!confirm('Annuler la sortie (vente, mort…) de « ' + a.nom + ' » ? L’animal redevient présent.')) return;
    if (!CE.peutAjouterAnimal(liste('animal'), C.premium()) && !a.exemple) { toast('Limite gratuite atteinte : prenez le pass pour remettre cet animal.'); aller('#/pass'); return; }
    var r = copie(a); r.sortie = null;
    sauver(r).then(function () { toast('Sortie annulée.'); C.afficher(); }).catch(C.echec);
  }
  function supprimerAnimal(a) {
    if (!confirm('Supprimer « ' + a.nom + ' » et ses pesées ? (Pour une vente ou une mort, utilisez plutôt « Vendre » ou « Sortie » : les chiffres restent justes.)')) return;
    var ids = [a.id];
    S.recs.forEach(function (r) { if ((r.type === 'pesee' && r.animalId === a.id) || (r.type === 'depense' && r.cible === 'animal' && r.cibleId === a.id) || (r.type === 'saillie' && r.femelleId === a.id)) ids.push(r.id); });
    var lotId = a.lotId;
    effacer(ids).then(function () { toast('Animal supprimé.'); aller(S.idx[lotId] ? '#/lot/' + lotId : '#/'); }).catch(C.echec);
  }

  // ---------- Formulaire animal ----------
  function pageFormAnimal(id, q) {
    var a = id ? S.idx[id] : null;
    if (id && !a) { aller('#/'); return; }
    var vue = ouvrirFormulaire(a ? 'Modifier : ' + a.nom : 'Nouvel animal', a ? '#/animal/' + id : (q.lot ? '#/lot/' + q.lot : '#/'), 'accueil');
    if (!a && !CE.peutAjouterAnimal(liste('animal'), C.premium())) { vue.appendChild(carteLimite()); return; }
    var mere = q.mere ? S.idx[q.mere] : null;
    var lots = liste('lot').slice().sort(triNom);
    var lotDefaut = a ? a.lotId : (q.lot || (mere && mere.lotId) || (lots.length === 1 ? lots[0].id : (lots[0] ? lots[0].id : '__nouveau')));
    var optsLots = lots.map(function (l) { return { id: l.id, nom: l.nom }; }).concat([{ id: '__nouveau', nom: '+ Nouveau lot…' }]);
    var selLot = U.selection('lotId', optsLots, lotDefaut);
    var nomLot = entree('nomLot', lots.length ? '' : 'Mon troupeau', 'texte', { maxlength: 60, placeholder: 'Exemple : Embouche Tabaski 2027' });
    var zoneNomLot = champ('Nom du nouveau lot', nomLot);
    var origine = a ? a.origine || 'achat' : (mere ? 'naissance' : 'achat');
    var photoData = null, photoSupprimee = false;
    var apercu = h('img', { alt: 'Photo choisie', hidden: true });
    if (a && a.photo && S.minis[a.id]) { apercu.src = S.minis[a.id]; apercu.hidden = false; }
    var fichier = h('input', { type: 'file', accept: 'image/*', capture: 'environment', id: 'f-photo', class: 'invisible', name: 'photo' });
    var esp0 = a ? a.espece : (mere ? mere.espece : S.reglages.especeDefaut);
    var estim = h('div', { class: 'estimation', hidden: true, 'aria-live': 'polite' });
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'animal' },
      champ('Nom ou numéro', entree('nom', a ? a.nom : '', 'texte', { maxlength: 40, placeholder: 'Exemple : Bandit, ou n° 12' })),
      U.choixRadio('espece', Object.keys(CE.ESPECES).map(function (k) { return { id: k, nom: CE.ESPECES[k].nom, emoji: CE.ESPECES[k].emoji }; }), esp0, 'Espèce', 'grands'),
      U.choixRadio('sexe', [{ id: 'M', nom: 'Mâle' }, { id: 'F', nom: 'Femelle' }], a ? a.sexe : (q.sexe || 'M'), 'Sexe', 'grands'),
      champ('Race (facultatif)', entree('race', a ? a.race : '', 'texte', { maxlength: 40, placeholder: 'Exemple : Ladoum, Touabire, Peul-peul…' })),
      champ('Lot', selLot), zoneNomLot,
      U.choixRadio('origine', [{ id: 'achat', nom: 'Acheté' }, { id: 'naissance', nom: 'Né chez moi' }], origine, 'Origine'),
      h('div', { class: 'deux' }, champ('Date d’arrivée', entree('dateEntree', a ? a.dateEntree : auj(), 'date'), null, { cls: 'c-date' }),
        champ('Prix d’achat (F)', entree('prixAchat', a ? a.prixAchat : '', 'entier', { placeholder: '75 000' }), null, { cls: 'c-prix' })),
      a ? null : h('fieldset', null, h('legend', null, 'Poids à l’arrivée (facultatif)'),
        h('div', { class: 'deux' }, champ('Poids (kg)', entree('kg', '', 'nombre', { placeholder: '35' })), champ('ou tour de poitrine (cm)', entree('tourCm', '', 'nombre', { placeholder: '80' }))), estim),
      h('div', { class: 'champ' }, h('span', { class: 'label' }, 'Photo (facultatif, gardée seulement sur ce téléphone)'),
        h('div', { class: 'photo-zone' }, apercu, h('label', { class: 'btn secondaire', for: 'f-photo', tabindex: '0', role: 'button', onkeydown: function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fichier.click(); } } }, icone('photo'), 'Prendre ou choisir'), fichier,
          bouton('Retirer', 'petit secondaire', function () { photoData = null; photoSupprimee = true; apercu.hidden = true; }, null, { 'data-action': 'retirer-photo' }))),
      champ('Note (facultatif)', U.zoneTexte('note', a ? a.note : '', { rows: 2, maxlength: 300 })),
      pied(a ? 'Enregistrer' : 'Ajouter l’animal'));
    function majVisibilite() {
      zoneNomLot.hidden = selLot.value !== '__nouveau';
      var nais = U.radio(form, 'origine') === 'naissance';
      form.querySelector('.c-prix').hidden = nais;
      form.querySelector('.c-date label').textContent = nais ? 'Date de naissance' : 'Date d’arrivée (achat)';
      majEstim();
    }
    function majEstim() {
      if (a) return;
      var t = U.lireNombre(U.val(form, 'tourCm')), k = U.val(form, 'kg');
      estim.hidden = !(t > 0); estim.textContent = '';
      if (t > 0) {
        var e = CE.estimerPoids(t, S.reglages.coef[U.radio(form, 'espece')]);
        estim.appendChild(document.createTextNode('Estimation indicative : ')); estim.appendChild(h('b', null, '≈ ' + U.kg(e)));
        estim.appendChild(h('span', { class: 'discret petit', style: 'display:block' }, k ? 'Le poids que vous avez écrit sera gardé.' : 'Ce poids sera noté comme estimé. Si vous avez pesé, écrivez le vrai poids.'));
      }
    }
    fichier.addEventListener('change', function () {
      var f = fichier.files[0]; if (!f) return;
      window.CEPhoto.reduire(f).then(function (p) { photoData = p; photoSupprimee = false; apercu.src = p.mini; apercu.hidden = false; }).catch(function () { toast('Photo illisible. Essayez une autre.'); });
      fichier.value = '';
    });
    form.addEventListener('change', majVisibilite); form.addEventListener('input', majEstim);
    if (mere) form.querySelector('[name="nom"]').setAttribute('placeholder', 'Petit de ' + mere.nom);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var nom = U.val(form, 'nom'); if (!nom) return U.erreur(form, 'nom', 'Écrivez un nom ou un numéro.');
      var double = liste('animal').filter(function (x) { return x.nom.toLowerCase() === nom.toLowerCase() && (!a || x.id !== a.id) && CE.statut(x) === 'present'; })[0];
      if (double && !confirm('Un animal présent s’appelle déjà « ' + nom + ' ». Continuer quand même ?')) return;
      var lotId = selLot.value, nouvLot = null;
      if (lotId === '__nouveau') {
        var nl = U.val(form, 'nomLot'); if (!nl) return U.erreur(form, 'nomLot', 'Donnez un nom au nouveau lot.');
        nouvLot = nouveau('lot', { nom: nl, debut: U.val(form, 'dateEntree') || auj(), note: '' }); lotId = nouvLot.id;
      }
      var orig = U.radio(form, 'origine');
      var d = dateOk(form, 'dateEntree'); if (!d) return;
      var prix = 0;
      if (orig === 'achat') {
        prix = U.nb(form, 'prixAchat');
        if (prix == null || !(prix >= 0)) return U.erreur(form, 'prixAchat', 'Écrivez le prix payé, en F (0 si donné).');
      }
      var kg = null, tour = null, methode = 'balance';
      if (!a) {
        tour = U.nb(form, 'tourCm'); kg = U.nb(form, 'kg');
        if (tour != null && !(tour >= 30 && tour <= 300)) return U.erreur(form, 'tourCm', 'Tour de poitrine entre 30 et 300 cm.');
        if (kg != null && !(kg > 0 && kg < 2000)) return U.erreur(form, 'kg', 'Poids en kg, par exemple 35.');
        if (kg == null && tour != null) { kg = CE.estimerPoids(tour, S.reglages.coef[U.radio(form, 'espece')]); methode = 'ruban'; }
      }
      if (a && (a.dateEntree !== d)) {
        var avant = S.A.animaux[a.id].pesees.filter(function (p) { return p.date < d; }).length;
        if (avant && !confirm('Des pesées sont datées avant cette date. Continuer ?')) return;
      }
      var r = a ? copie(a) : nouveau('animal', { sortie: null });
      r.nom = nom; r.espece = U.radio(form, 'espece'); r.sexe = U.radio(form, 'sexe'); r.race = U.val(form, 'race'); r.lotId = lotId;
      r.origine = orig; r.dateEntree = d; r.prixAchat = orig === 'achat' ? Math.round(prix) : 0; r.note = U.val(form, 'note');
      if (mere && !a) r.mereId = mere.id;
      if (photoData) r.photo = true; else if (photoSupprimee) r.photo = false;
      var recs = [r]; if (nouvLot) recs.unshift(nouvLot);
      if (kg != null) recs.push(nouveau('pesee', { animalId: r.id, date: d, kg: Math.round(kg * 10) / 10, tourCm: tour, methode: methode }));
      var suite = photoData ? DB.mettrePhoto({ id: r.id, grande: photoData.grande, mini: photoData.mini }).then(function () { S.minis[r.id] = photoData.mini; })
        : photoSupprimee ? DB.supprimerPhoto(r.id).then(function () { delete S.minis[r.id]; }) : Promise.resolve();
      suite.then(function () { return sauver(recs); }).then(function () { toast(a ? 'Animal enregistré.' : 'Animal ajouté.'); aller('#/animal/' + r.id); }).catch(C.echec);
    });
    vue.appendChild(form);
    majVisibilite();
  }

  // ---------- Pesées ----------
  function formPesee(vue, a, p, retour) {
    var coef = S.reglages.coef[a.espece] || CE.COEF_DEFAUT;
    var estim = h('div', { class: 'estimation', 'aria-live': 'polite', hidden: true });
    var kgSaisi = !!p;
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'pesee' },
      champ('Date', entree('date', p ? p.date : auj(), 'date')),
      U.choixRadio('methode', [{ id: 'balance', nom: 'Balance' }, { id: 'ruban', nom: 'Ruban (tour de poitrine)' }], p ? p.methode : 'balance', 'Comment avez-vous pesé ?', 'grands'),
      h('div', { class: 'c-tour' }, champ('Tour de poitrine (cm)', entree('tourCm', p ? p.tourCm : '', 'nombre', { class: 'gros', placeholder: '80' }), 'Mesurez juste derrière les pattes avant, ruban bien serré.')),
      champ('Poids (kg)', entree('kg', p ? p.kg : '', 'nombre', { class: 'gros', placeholder: '35' }), 'Vous pouvez toujours écrire le vrai poids.'),
      estim,
      pied('Enregistrer la pesée', p ? bouton('Supprimer cette pesée', 'danger large', function () {
        if (confirm('Supprimer cette pesée ?')) effacer(p.id).then(function () { toast('Pesée supprimée.'); aller(retour); }).catch(C.echec);
      }, 'corbeille') : null));
    var iKg = form.querySelector('[name="kg"]'), iTour = form.querySelector('[name="tourCm"]');
    iKg.addEventListener('input', function () { kgSaisi = iKg.value.trim() !== ''; });
    function maj() {
      var ruban = U.radio(form, 'methode') === 'ruban';
      form.querySelector('.c-tour .aide').textContent = ruban ? 'Mesurez juste derrière les pattes avant, ruban bien serré.' : 'Facultatif : sert à ajuster la formule du ruban à vos animaux.';
      var t = U.lireNombre(iTour.value);
      estim.textContent = ''; estim.hidden = !(ruban && t > 0);
      if (ruban && t > 0) {
        var e = CE.estimerPoids(t, coef);
        if (!kgSaisi || iKg.getAttribute('data-auto') === '1') { iKg.value = String(e).replace('.', ','); iKg.setAttribute('data-auto', '1'); kgSaisi = false; }
        estim.appendChild(document.createTextNode('Estimation indicative : ')); estim.appendChild(h('b', { 'data-estimation': e }, '≈ ' + U.kg(e)));
        estim.appendChild(h('span', { class: 'discret petit', style: 'display:block' }, 'Formule : ' + U.nombre(coef, 1) + ' × (tour en mètres)³. Peut se tromper de 10 à 20 %. Une balance reste plus juste.'));
      }
    }
    iKg.addEventListener('input', function () { iKg.removeAttribute('data-auto'); });
    form.addEventListener('input', maj); form.addEventListener('change', maj);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var d = dateOk(form, 'date', { min: a.dateEntree, minTexte: 'Avant l’arrivée de l’animal (' + U.dateFr(a.dateEntree) + ').' }); if (!d) return;
      var ruban = U.radio(form, 'methode') === 'ruban', t = U.nb(form, 'tourCm'), k = U.nb(form, 'kg');
      if (t != null && !(t >= 30 && t <= 300)) return U.erreur(form, 'tourCm', 'Entre 30 et 300 cm.');
      if (ruban && t == null && k == null) return U.erreur(form, 'tourCm', 'Écrivez le tour de poitrine.');
      if (k == null && ruban) k = CE.estimerPoids(t, coef);
      if (!(k > 0 && k < 2000)) return U.erreur(form, 'kg', 'Écrivez le poids en kg.');
      var r = p ? copie(p) : nouveau('pesee', { animalId: a.id });
      // Au ruban, si l'éleveur écrit un autre poids (balance), c'est ce vrai poids qui compte ; le tour sert à ajuster la formule
      r.date = d; r.kg = Math.round(k * 10) / 10; r.tourCm = t; r.methode = ruban && t != null && Math.abs(k - CE.estimerPoids(t, coef)) < 0.05 ? 'ruban' : 'balance';
      sauver(r).then(function () { toast('Pesée enregistrée : ' + U.kg(r.kg) + '.'); aller(retour); }).catch(C.echec);
    });
    vue.appendChild(form); maj();
  }
  function pagePesee(animalId) {
    var a = S.idx[animalId]; if (!a) { aller('#/'); return; }
    var vue = ouvrirFormulaire('Pesée : ' + a.nom, '#/animal/' + animalId, 'accueil');
    var B = S.A.animaux[animalId];
    if (B.poidsActuel != null) vue.appendChild(h('p', { class: 'discret' }, 'Dernier poids : ' + U.kg(B.poidsActuel) + ' le ' + U.dateFr(B.datePoids) + '.'));
    formPesee(vue, a, null, '#/animal/' + animalId);
  }
  function pageModifierPesee(pid) {
    var p = S.idx[pid]; if (!p) { aller('#/'); return; }
    var a = S.idx[p.animalId]; if (!a) { aller('#/'); return; }
    formPesee(ouvrirFormulaire('Pesée : ' + a.nom, '#/animal/' + a.id, 'accueil'), a, p, '#/animal/' + a.id);
  }
  function pageChoixPesee() {
    var vue = C.cadre('Pesée', '#/', 'accueil'); C.bandeaux('choix');
    var lots = liste('lot').filter(function (l) { return S.A.lots[l.id].nbPresents; });
    if (lots.length === 1) { aller('#/lot/' + lots[0].id + '/pesee'); return; }
    if (!lots.length) { vue.appendChild(h('p', { class: 'vide' }, 'Aucun animal présent à peser.')); vue.appendChild(lienBouton('#/animal/nouveau', 'Ajouter un animal', 'large', 'plus')); return; }
    vue.appendChild(h('p', null, 'Quel lot voulez-vous peser ?'));
    lots.forEach(function (l) { vue.appendChild(lienBouton('#/lot/' + l.id + '/pesee', l.nom + ' (' + S.A.lots[l.id].nbPresents + ')', 'secondaire large', 'pesee')); vue.appendChild(h('div', { style: 'height:10px' })); });
  }
  function pageSeance(lotId) {
    var l = S.idx[lotId]; if (!l) { aller('#/'); return; }
    var vue = ouvrirFormulaire('Peser : ' + l.nom, '#/lot/' + lotId, 'accueil');
    var an = S.A.lots[lotId].ids.map(function (x) { return S.idx[x]; }).filter(function (a) { return CE.statut(a) === 'present'; }).sort(triNom);
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'seance' },
      champ('Date de la pesée', entree('date', auj(), 'date')),
      U.choixRadio('methode', [{ id: 'balance', nom: 'Balance' }, { id: 'ruban', nom: 'Ruban (tour de poitrine)' }], 'balance', 'Méthode', 'grands'),
      h('p', { class: 'discret petit c-aide' }, ''));
    var zone = h('div');
    an.forEach(function (a) {
      var B = S.A.animaux[a.id];
      var t = entree('tour-' + a.id, '', 'nombre', { 'aria-label': 'Tour de poitrine de ' + a.nom + ' en cm', placeholder: 'cm', 'data-tour': a.id });
      var k = entree('kg-' + a.id, '', 'nombre', { 'aria-label': 'Poids de ' + a.nom + ' en kg', placeholder: 'kg', 'data-kg': a.id });
      t.addEventListener('input', function () {
        var v = U.lireNombre(t.value);
        if (!k.value || k.getAttribute('data-auto') === '1') { if (v > 0) { k.value = String(CE.estimerPoids(v, S.reglages.coef[a.espece])).replace('.', ','); k.setAttribute('data-auto', '1'); } else { k.value = ''; } }
      });
      k.addEventListener('input', function () { k.removeAttribute('data-auto'); });
      zone.appendChild(h('div', { class: 'saisie-ligne' }, h('span', { class: 'nom-ligne' }, a.nom, h('small', null, B.poidsActuel != null ? 'avant : ' + U.kg(B.poidsActuel) : 'jamais pesé')), t, k));
    });
    form.appendChild(zone);
    form.appendChild(pied('Enregistrer les pesées'));
    function maj() {
      var ruban = U.radio(form, 'methode') === 'ruban';
      form.querySelectorAll('[data-tour]').forEach(function (i) { i.hidden = !ruban; });
      form.querySelector('.c-aide').textContent = ruban ? 'Écrivez le tour de poitrine : le poids estimé (indicatif) s’affiche. Vous pouvez le corriger.' : 'Écrivez le poids de chaque animal pesé. Laissez vide ceux que vous n’avez pas pesés.';
    }
    form.addEventListener('change', maj);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var d = dateOk(form, 'date'); if (!d) return;
      var recs = [], ruban = U.radio(form, 'methode') === 'ruban', ko = false;
      an.forEach(function (a) {
        if (ko) return;
        var kI = form.querySelector('[data-kg="' + a.id + '"]'), tI = form.querySelector('[data-tour="' + a.id + '"]');
        var k = U.lireNombre(kI.value), t = ruban ? U.lireNombre(tI.value) : NaN;
        if (!kI.value.trim()) return;
        if (!(k > 0 && k < 2000)) { ko = true; U.erreur(form, kI.name, 'Poids de ' + a.nom + ' : écrivez un nombre.'); return; }
        if (d < a.dateEntree) return;
        recs.push(nouveau('pesee', { animalId: a.id, date: d, kg: Math.round(k * 10) / 10, tourCm: t > 0 ? t : null, methode: ruban && kI.getAttribute('data-auto') === '1' ? 'ruban' : 'balance' }));
      });
      if (ko) return;
      if (!recs.length) { toast('Aucun poids écrit.'); return; }
      sauver(recs).then(function () { toast(U.pluriel(recs.length, 'pesée enregistrée', 'pesées enregistrées') + '.'); aller('#/lot/' + lotId); }).catch(C.echec);
    });
    vue.appendChild(form); maj();
  }

  // ---------- Vente et sortie ----------
  function pageChoixVente() {
    var vue = C.cadre('Vendre', '#/', 'accueil'); C.bandeaux('choix');
    var pres = animauxPresents().sort(triNom);
    if (!pres.length) { vue.appendChild(h('p', { class: 'vide' }, 'Aucun animal présent.')); return; }
    vue.appendChild(h('p', null, 'Quel animal avez-vous vendu ?'));
    vue.appendChild(h('section', { class: 'carte' }, h('ul', { class: 'liste' }, pres.map(function (a) {
      var B = S.A.animaux[a.id];
      return h('li', null, h('a', { class: 'element', href: '#/animal/' + a.id + '/vente' }, vignette(a), h('span', { class: 'quoi' }, h('b', null, a.nom), h('span', null, 'coût à ce jour : ' + U.fcfa(B.coutTotal))), icone('vente')));
    }))));
  }
  function pageVente(id) {
    var a = S.idx[id]; if (!a) { aller('#/'); return; }
    var B = S.A.animaux[id];
    var vue = ouvrirFormulaire('Vente : ' + a.nom, '#/animal/' + id, 'accueil');
    var res = h('p', { class: 'total-direct', 'aria-live': 'polite' });
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'vente' },
      champ('Date de la vente', entree('date', a.sortie && a.sortie.date ? a.sortie.date : auj(), 'date')),
      champ('Prix de vente (F)', entree('prix', a.sortie && a.sortie.motif === 'vente' ? a.sortie.prix : '', 'entier', { class: 'gros', placeholder: '150 000' })),
      res,
      champ('Acheteur (facultatif)', entree('acheteur', a.sortie ? a.sortie.acheteur : '', 'texte', { maxlength: 60 })),
      champ('Note (facultatif)', U.zoneTexte('note', a.sortie ? a.sortie.note : '', { rows: 2, maxlength: 200 })),
      pied('Enregistrer la vente'));
    function maj() {
      var p = U.nb(form, 'prix'); res.textContent = '';
      res.appendChild(document.createTextNode('Coût de l’animal : ' + U.fcfa(B.coutTotal) + '. '));
      if (p > 0) { var m = Math.round(p) - B.coutTotal; res.appendChild(document.createTextNode('Marge : ')); res.appendChild(h('b', { class: m < 0 ? 'negatif' : 'positif', 'data-marge': m }, U.fcfa(m))); }
    }
    form.addEventListener('input', maj);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var d = dateOk(form, 'date', { min: a.dateEntree, minTexte: 'Avant l’arrivée de l’animal.' }); if (!d) return;
      var p = U.nb(form, 'prix'); if (!(p > 0)) return U.erreur(form, 'prix', 'Écrivez le prix de vente en F.');
      var r = copie(a); r.sortie = { date: d, motif: 'vente', prix: Math.round(p), acheteur: U.val(form, 'acheteur'), note: U.val(form, 'note') };
      sauver(r).then(function () { var m = S.A.animaux[id].marge; toast('Vente enregistrée. Marge : ' + U.fcfa(m) + '.'); aller('#/animal/' + id); }).catch(C.echec);
    });
    vue.appendChild(form); maj();
  }
  function pageSortie(id) {
    var a = S.idx[id]; if (!a) { aller('#/'); return; }
    var vue = ouvrirFormulaire('Sortie : ' + a.nom, '#/animal/' + id, 'accueil');
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'sortie' },
      U.choixRadio('motif', [{ id: 'mort', nom: 'Mort' }, { id: 'autre', nom: 'Autre (don, fête, consommé…)' }], 'mort', 'Raison', 'grands'),
      champ('Date', entree('date', auj(), 'date')),
      champ('Note (facultatif)', U.zoneTexte('note', '', { rows: 2, maxlength: 200 })),
      h('p', { class: 'discret petit' }, 'Son coût reste compté dans le lot. L’application ne donne aucun avis sur la santé des animaux : en cas de maladie, voyez un vétérinaire.'),
      pied('Enregistrer'));
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var d = dateOk(form, 'date', { min: a.dateEntree }); if (!d) return;
      var r = copie(a); r.sortie = { date: d, motif: U.radio(form, 'motif'), prix: 0, note: U.val(form, 'note') };
      sauver(r).then(function () { toast('Sortie enregistrée.'); aller('#/animal/' + id); }).catch(C.echec);
    });
    vue.appendChild(form);
  }

  // ---------- Aliment et stock ----------
  function pageAliments() {
    var vue = C.cadre('Aliment et stock', null, 'aliment'); C.bandeaux('aliment');
    var A = S.A, al = liste('aliment').slice().sort(triNom), depense = 0;
    Object.keys(A.stock).forEach(function (k) { depense += A.stock[k].achatsF; });
    vue.appendChild(h('div', { class: 'kpis' },
      kpi('Valeur du stock', U.fcfa(A.global.valeurStock), null, { id: 'valeur-stock' }),
      kpi('Aliment par jour', U.fcfa(A.global.coutJour), 'tous les lots', { id: 'alim-jour' }),
      kpi('Dépensé en aliment', U.fcfa(depense), null, { id: 'alim-depense', large: true })));
    vue.appendChild(alerte('info', 'Vous choisissez vos aliments et vos rations. L’application calcule les prix, le stock et les coûts ; elle ne donne pas de conseil d’alimentation.'));
    vue.appendChild(h('div', { class: 'actions' }, lienBouton('#/achat/nouveau', 'Noter un achat', 'principal', 'sac', { 'data-action': 'achat' }),
      lienBouton('#/aliment/nouveau', 'Nouvel aliment', 'secondaire', 'plus', { 'data-action': 'nouvel-aliment' }), lienBouton('#/depenses', 'Autres dépenses', 'secondaire', 'depense')));
    if (!al.length) vue.appendChild(h('p', { class: 'vide' }, h('span', { class: 'grand-emoji', 'aria-hidden': 'true' }, '🌾'), 'Ajoutez vos aliments : son, fane d’arachide, tourteau, aliment bétail, foin…'));
    al.forEach(function (x) {
      var s = A.stock[x.id];
      vue.appendChild(h('section', { class: 'carte', 'data-aliment': x.nom },
        h('div', { class: 'ligne-entre' }, h('h2', { style: 'margin:0' }, x.nom), h('a', { href: '#/aliment/' + x.id, class: 'petit' }, 'Modifier')),
        h('div', { class: 'kpis', style: 'margin-top:8px' },
          kpi('Stock', U.kg(s.stockKg), s.joursRestants != null ? 'environ ' + U.pluriel(s.joursRestants, 'jour') : (s.consoJour ? null : 'pas dans une ration'), { id: 'stock-kg', signe: s.stockKg < 0 ? -1 : 0 }),
          kpi('Prix du kg', s.prixKg != null ? U.fcfa(s.prixKg) : '—', s.sourcePrix === 'achats' ? 'moyenne de vos achats' : s.sourcePrix === 'vous' ? 'prix indiqué' : 'notez un achat', { id: 'prix-kg' })),
        s.stockKg < 0 ? alerte('attention', 'Le stock calculé est négatif : un achat n’est peut-être pas noté, ou la ration notée est plus forte que la réalité. Comptez votre stock.') : null,
        s.ecart != null && s.ecart !== 0 ? h('p', { class: 'discret petit' }, 'Au dernier comptage (' + U.dateFr(s.inventaire.date) + ') : écart de ' + U.kg(s.ecart) + ' avec le calcul.') : null,
        h('div', { class: 'boutons' }, lienBouton('#/achat/nouveau?aliment=' + x.id, 'Achat', 'petit', 'plus'), lienBouton('#/inventaire/' + x.id, 'Compter mon stock', 'petit secondaire', 'liste'))));
    });
    var achats = liste('achat').slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    if (achats.length) vue.appendChild(h('section', { class: 'carte' }, h('h2', null, 'Achats d’aliment'), h('ul', { class: 'liste' }, achats.slice(0, 30).map(function (x) {
      var al2 = S.idx[x.alimentId];
      return h('li', null, h('a', { class: 'element', href: '#/achat/' + x.id, style: 'min-height:52px' }, h('span', { class: 'quoi' }, h('b', null, (al2 ? al2.nom : '?')),
        h('span', null, U.dateFr(x.date) + ' · ' + U.kg(x.kg, 1) + (x.unite !== 'kg' ? ' (' + U.nombre(x.quantite, 2) + ' ' + x.unite + (x.quantite >= 2 ? 's' : '') + ')' : '') + (x.fournisseur ? ' · ' + x.fournisseur : ''))),
        h('span', { class: 'chiffre' }, U.fcfa(x.prix), h('small', null, U.fcfa(x.prix / x.kg) + '/kg'))));
    }))));
  }
  function pageFormAliment(id, q) {
    var x = id ? S.idx[id] : null; if (id && !x) { aller('#/aliments'); return; }
    var retour = q.retour || '#/aliments';
    var vue = ouvrirFormulaire(x ? 'Modifier l’aliment' : 'Nouvel aliment', retour, 'aliment');
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'aliment' },
      champ('Nom de l’aliment', entree('nom', x ? x.nom : '', 'texte', { maxlength: 50, placeholder: 'Exemple : Son de blé, Fane d’arachide, Tourteau…' })),
      champ('Prix du kg si vous ne l’achetez pas (facultatif)', entree('prixKg', x ? x.prixKg : '', 'nombre', { placeholder: '0' }), 'Pour un aliment produit chez vous. Dès que vous notez un achat, le prix moyen de vos achats est utilisé.'),
      pied(x ? 'Enregistrer' : 'Ajouter', x ? bouton('Supprimer cet aliment', 'danger large', function () {
        var util = S.recs.some(function (r) { return (r.type === 'achat' || r.type === 'inventaire') && r.alimentId === x.id || (r.type === 'ration' && (r.lignes || []).some(function (l) { return l.alimentId === x.id; })); });
        if (util) { toast('Cet aliment est utilisé dans des achats ou des rations : retirez-les d’abord.'); return; }
        if (confirm('Supprimer « ' + x.nom + ' » ?')) effacer(x.id).then(function () { aller('#/aliments'); });
      }, 'corbeille') : null));
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var nom = U.val(form, 'nom'); if (!nom) return U.erreur(form, 'nom', 'Écrivez le nom de l’aliment.');
      var p = U.nb(form, 'prixKg'); if (p != null && !(p >= 0)) return U.erreur(form, 'prixKg', 'Prix en F par kg.');
      var r = x ? copie(x) : nouveau('aliment'); r.nom = nom; r.prixKg = p;
      sauver(r).then(function () { toast('Aliment enregistré.'); aller(q.retour || (x ? '#/aliments' : '#/achat/nouveau?aliment=' + r.id)); }).catch(C.echec);
    });
    vue.appendChild(form);
  }
  function pageFormAchat(id, q) {
    var x = id ? S.idx[id] : null; if (id && !x) { aller('#/aliments'); return; }
    var vue = ouvrirFormulaire(x ? 'Achat d’aliment' : 'Noter un achat', '#/aliments', 'aliment');
    var al = liste('aliment').slice().sort(triNom);
    var opts = al.map(function (a) { return { id: a.id, nom: a.nom }; }).concat([{ id: '__nouveau', nom: '+ Nouvel aliment…' }]);
    var sel = U.selection('alimentId', opts, x ? x.alimentId : (q.aliment || (al[0] ? al[0].id : '__nouveau')));
    var res = h('p', { class: 'total-direct', 'aria-live': 'polite' });
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'achat' },
      champ('Aliment', sel), champ('Nom du nouvel aliment', entree('nomAliment', '', 'texte', { maxlength: 50, placeholder: 'Exemple : Son de blé' }), null, { cls: 'c-nouvel' }),
      champ('Date', entree('date', x ? x.date : auj(), 'date')),
      U.choixRadio('unite', [{ id: 'sac', nom: 'Sacs' }, { id: 'botte', nom: 'Bottes' }, { id: 'kg', nom: 'kg' }], x ? x.unite : 'sac', 'Vous avez acheté en', 'grands'),
      h('div', { class: 'deux' }, champ('Nombre', entree('quantite', x ? x.quantite : '', 'nombre', { placeholder: '10' })),
        champ('kg dans 1 unité', entree('kgParUnite', x ? x.kgParUnite : 50, 'nombre'), null, { cls: 'c-kgu' })),
      champ('Prix total payé (F)', entree('prix', x ? x.prix : '', 'entier', { class: 'gros', placeholder: '90 000' })),
      res,
      champ('Vendeur (facultatif)', entree('fournisseur', x ? x.fournisseur : '', 'texte', { maxlength: 60 })),
      pied('Enregistrer l’achat', x ? bouton('Supprimer cet achat', 'danger large', function () { if (confirm('Supprimer cet achat ?')) effacer(x.id).then(function () { aller('#/aliments'); }); }, 'corbeille') : null));
    function lireKg() { var u = U.radio(form, 'unite'), qn = U.nb(form, 'quantite'), k = U.nb(form, 'kgParUnite'); return u === 'kg' ? qn : (qn > 0 && k > 0 ? qn * k : null); }
    function maj() {
      form.querySelector('.c-nouvel').hidden = sel.value !== '__nouveau';
      var u = U.radio(form, 'unite'); form.querySelector('.c-kgu').hidden = u === 'kg';
      form.querySelector('.c-kgu label').textContent = u === 'botte' ? 'kg dans 1 botte' : 'kg dans 1 sac';
      var kgT = lireKg(), p = U.nb(form, 'prix'); res.textContent = '';
      if (kgT > 0) { res.appendChild(document.createTextNode('Total : ')); res.appendChild(h('b', null, U.kg(kgT))); if (p > 0) res.appendChild(document.createTextNode(' · ' + U.fcfa(p / kgT) + ' le kg')); }
      res.hidden = !(kgT > 0);
    }
    form.addEventListener('input', maj); form.addEventListener('change', maj);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var alId = sel.value, nouvAl = null;
      if (alId === '__nouveau') { var nn = U.val(form, 'nomAliment'); if (!nn) return U.erreur(form, 'nomAliment', 'Écrivez le nom de l’aliment.'); nouvAl = nouveau('aliment', { nom: nn, prixKg: null }); alId = nouvAl.id; }
      var d = dateOk(form, 'date'); if (!d) return;
      var qn = U.nb(form, 'quantite'); if (!(qn > 0)) return U.erreur(form, 'quantite', 'Écrivez la quantité achetée.');
      var u = U.radio(form, 'unite'), ku = U.nb(form, 'kgParUnite');
      if (u !== 'kg' && !(ku > 0)) return U.erreur(form, 'kgParUnite', 'Combien de kg dans une unité ?');
      var p = U.nb(form, 'prix'); if (!(p >= 0) || p == null) return U.erreur(form, 'prix', 'Écrivez le prix total payé.');
      var r = x ? copie(x) : nouveau('achat');
      r.alimentId = alId; r.date = d; r.unite = u; r.quantite = qn; r.kgParUnite = u === 'kg' ? 1 : ku; r.kg = Math.round(lireKg() * 100) / 100; r.prix = Math.round(p); r.fournisseur = U.val(form, 'fournisseur');
      var recs = nouvAl ? [nouvAl, r] : [r];
      sauver(recs).then(function () { toast('Achat enregistré.'); aller('#/aliments'); }).catch(C.echec);
    });
    vue.appendChild(form); maj();
  }
  function pageInventaire(alId) {
    var x = S.idx[alId]; if (!x) { aller('#/aliments'); return; }
    var s = S.A.stock[alId];
    var vue = ouvrirFormulaire('Compter : ' + x.nom, '#/aliments', 'aliment');
    vue.appendChild(h('p', null, 'Stock calculé aujourd’hui : ', h('b', null, U.kg(s.stockKg)), '. Si vous comptez autre chose, écrivez ce qui reste vraiment : le calcul repart de là.'));
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'inventaire' },
      champ('Date du comptage', entree('date', auj(), 'date')),
      champ('Ce qui reste (kg)', entree('kg', '', 'nombre', { class: 'gros', placeholder: String(Math.max(0, Math.round(s.stockKg))) }), 'Exemple : 3 sacs de 40 kg = 120 kg.'),
      pied('Enregistrer le comptage'));
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var d = dateOk(form, 'date'); if (!d) return;
      var k = U.nb(form, 'kg'); if (!(k >= 0) || k == null) return U.erreur(form, 'kg', 'Écrivez le stock en kg (0 si vide).');
      sauver(nouveau('inventaire', { alimentId: alId, date: d, kg: k })).then(function () { toast('Stock mis à jour.'); aller('#/aliments'); }).catch(C.echec);
    });
    vue.appendChild(form);
  }

  // ---------- Dépenses ----------
  function cibleTexte(d) {
    if (d.cible === 'animal') { var a = S.idx[d.cibleId]; return a ? 'pour ' + a.nom : 'animal supprimé'; }
    if (d.cible === 'lot') { var l = S.idx[d.cibleId]; return l ? 'lot ' + l.nom : 'lot supprimé'; }
    return 'tous les animaux';
  }
  function ligneDepense(d) {
    var cat = CE.CATEGORIES.filter(function (c) { return c.id === d.categorie; })[0];
    return h('li', null, h('a', { class: 'element', href: '#/depense/' + d.id, style: 'min-height:52px' },
      h('span', { class: 'quoi' }, h('b', null, d.libelle || (cat ? cat.nom : 'Dépense')), h('span', null, U.dateFr(d.date) + ' · ' + (cat ? cat.nom : '') + ' · ' + cibleTexte(d))),
      h('span', { class: 'chiffre' }, U.fcfa(d.montant))));
  }
  function pageDepenses() {
    var vue = C.cadre('Dépenses', '#/', 'accueil'); C.bandeaux('depenses');
    var deps = liste('depense').slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }), tot = 0, cat = {};
    deps.forEach(function (d) { tot += Math.round(U.n(d.montant)); cat[d.categorie] = (cat[d.categorie] || 0) + Math.round(U.n(d.montant)); });
    vue.appendChild(h('div', { class: 'kpis' }, kpi('Total des autres dépenses', U.fcfa(tot), 'hors achat des animaux et aliment', { large: true, id: 'total-dep' })));
    vue.appendChild(lienBouton('#/depense/nouveau', 'Ajouter une dépense', 'large', 'plus', { 'data-action': 'ajouter-depense' }));
    if (tot) vue.appendChild(h('section', { class: 'carte' }, h('h2', null, 'Par catégorie'), U.barres(CE.CATEGORIES.filter(function (c) { return cat[c.id]; }).map(function (c) { return { nom: c.nom, valeur: cat[c.id], texte: U.fcfa(cat[c.id]) }; }))));
    vue.appendChild(h('section', { class: 'carte' }, h('h2', null, 'Toutes les dépenses'), deps.length ? h('ul', { class: 'liste' }, deps.map(ligneDepense)) : h('p', { class: 'discret' }, 'Berger, eau, transport, abri, soins payés…')));
  }
  function pageFormDepense(id, q) {
    var x = id ? S.idx[id] : null; if (id && !x) { aller('#/depenses'); return; }
    var cible0 = x ? x.cible : (q.cible || 'tous'), cibleId0 = x ? x.cibleId : (q.id || '');
    var retour = x ? '#/depenses' : (q.cible === 'lot' ? '#/lot/' + q.id : q.cible === 'animal' ? '#/animal/' + q.id : '#/depenses');
    var vue = ouvrirFormulaire(x ? 'Modifier la dépense' : 'Nouvelle dépense', retour, 'accueil');
    var lots = liste('lot').slice().sort(triNom), anim = liste('animal').slice().sort(triNom);
    var selLot = U.selection('lotCible', lots.map(function (l) { return { id: l.id, nom: l.nom }; }), cible0 === 'lot' ? cibleId0 : (lots[0] && lots[0].id));
    var selAn = U.selection('animalCible', anim.map(function (a) { return { id: a.id, nom: a.nom + (CE.statut(a) !== 'present' ? ' (sorti)' : '') }; }), cible0 === 'animal' ? cibleId0 : (anim[0] && anim[0].id));
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'depense' },
      U.choixRadio('categorie', CE.CATEGORIES, x ? x.categorie : 'berger', 'Catégorie'),
      champ('Montant (F)', entree('montant', x ? x.montant : '', 'entier', { class: 'gros', placeholder: '25 000' })),
      champ('Libellé (facultatif)', entree('libelle', x ? x.libelle : '', 'texte', { maxlength: 60, placeholder: 'Exemple : berger du mois d’octobre' })),
      champ('Date', entree('date', x ? x.date : auj(), 'date')),
      U.choixRadio('cible', [{ id: 'tous', nom: 'Tous les animaux' }, { id: 'lot', nom: 'Un lot' }, { id: 'animal', nom: 'Un animal' }].filter(function (o) { return o.id !== 'lot' || lots.length; }).filter(function (o) { return o.id !== 'animal' || anim.length; }), cible0, 'Pour qui ?'),
      champ('Lot', selLot, null, { cls: 'c-lot' }), champ('Animal', selAn, null, { cls: 'c-animal' }),
      h('p', { class: 'discret petit c-explication' }, ''),
      pied('Enregistrer', x ? bouton('Supprimer cette dépense', 'danger large', function () { if (confirm('Supprimer cette dépense ?')) effacer(x.id).then(function () { aller('#/depenses'); }); }, 'corbeille') : null));
    function maj() {
      var c = U.radio(form, 'cible');
      form.querySelector('.c-lot').hidden = c !== 'lot'; form.querySelector('.c-animal').hidden = c !== 'animal';
      form.querySelector('.c-explication').textContent = c === 'animal' ? 'Toute la somme va à cet animal.' : 'La somme est partagée à parts égales entre les animaux ' + (c === 'lot' ? 'du lot ' : '') + 'présents à la date de la dépense.';
    }
    form.addEventListener('change', maj);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var m = U.nb(form, 'montant'); if (!(m > 0)) return U.erreur(form, 'montant', 'Écrivez le montant en F.');
      var d = dateOk(form, 'date'); if (!d) return;
      var c = U.radio(form, 'cible');
      var r = x ? copie(x) : nouveau('depense');
      r.categorie = U.radio(form, 'categorie'); r.montant = Math.round(m); r.libelle = U.val(form, 'libelle'); r.date = d; r.cible = c;
      r.cibleId = c === 'lot' ? selLot.value : c === 'animal' ? selAn.value : null;
      sauver(r).then(function () { toast('Dépense enregistrée.'); aller(retour); }).catch(C.echec);
    });
    vue.appendChild(form); maj();
  }

  // ---------- Reproduction ----------
  function nomFemelle(s) { var a = S.idx[s.femelleId]; return a ? a.nom : (s.femelleNom || 'femelle'); }
  function ligneSaillie(s) {
    var p = CE.miseBasPrevue(s, S.reglages), e = CE.etatSaillie(s, S.reglages, auj()), k = U.ecartJours(auj(), p.date);
    var cls = e === 'faite' ? 'fait' : e === 'depassee' ? 'retard' : e === 'proche' ? 'bientot' : '';
    var d = e === 'faite' ? s.miseBas.date : p.date;
    var etat = e === 'faite' ? 'Mise-bas le ' + U.dateFr(s.miseBas.date) + (s.miseBas.nbPetits ? ' · ' + U.pluriel(s.miseBas.nbPetits, 'petit') : '') :
      e === 'echec' ? 'Pas de mise-bas' : e === 'depassee' ? 'Date dépassée : notez la mise-bas' : 'Vers le ' + U.dateFr(p.date) + ' · ' + U.dans(k);
    return h('li', null, h('a', { class: 'echeance ' + cls, href: '#/saillie/' + s.id, 'data-saillie': nomFemelle(s) },
      h('span', { class: 'date-bloc', 'aria-hidden': 'true' }, h('b', null, String(U.jourDuMois(d))), h('span', null, U.moisCourt(d))),
      h('span', { class: 'quoi' }, h('b', null, (CE.ESPECES[s.espece] ? CE.ESPECES[s.espece].emoji + ' ' : '') + nomFemelle(s)), h('span', null, etat))));
  }
  function pageRepro() {
    var vue = C.cadre('Mises-bas', null, 'repro'); C.bandeaux('repro');
    var ss = liste('saillie').slice();
    var aVenir = ss.filter(function (s) { var e = CE.etatSaillie(s, S.reglages, auj()); return e !== 'faite' && e !== 'echec'; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var finies = ss.filter(function (s) { return aVenir.indexOf(s) < 0; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    vue.appendChild(lienBouton('#/saillie/nouveau', 'Noter une saillie', 'large', 'plus', { 'data-action': 'saillie' }));
    vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'rep-av' }, h('h2', { id: 'rep-av' }, 'Mises-bas attendues'),
      aVenir.length ? h('ul', { class: 'liste' }, aVenir.map(ligneSaillie)) : h('p', { class: 'discret' }, 'Aucune pour l’instant. Notez les saillies : l’application calcule la date approximative de mise-bas.')));
    if (finies.length) vue.appendChild(h('section', { class: 'carte' }, h('h2', null, 'Historique'), h('ul', { class: 'liste' }, finies.map(ligneSaillie))));
    var g = S.reglages.gestation;
    vue.appendChild(h('p', { class: 'discret petit' }, 'Durées de gestation habituelles utilisées : brebis ' + g.mouton + ' jours, chèvre ' + g.chevre + ' jours, vache ' + g.bovin + ' jours (modifiables dans Réglages). Les dates sont approximatives : chaque animal est différent.'));
  }
  function pageFormSaillie(id, q) {
    var x = id ? S.idx[id] : null; if (id && !x) { aller('#/repro'); return; }
    var vue = ouvrirFormulaire(x ? 'Saillie de ' + nomFemelle(x) : 'Noter une saillie', '#/repro', 'repro');
    var fem = liste('animal').filter(function (a) { return a.sexe === 'F' && (CE.statut(a) === 'present' || (x && a.id === x.femelleId)); }).sort(triNom);
    var opts = fem.map(function (a) { return { id: a.id, nom: CE.ESPECES[a.espece].emoji + ' ' + a.nom }; }).concat([{ id: '__autre', nom: 'Autre femelle (pas dans le carnet)' }]);
    var sel = U.selection('femelleId', opts, x ? (x.femelleId || '__autre') : (q.femelle || (fem[0] ? fem[0].id : '__autre')));
    var prev = h('div', { class: 'estimation', 'aria-live': 'polite' });
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'saillie' },
      champ('Femelle', sel),
      h('div', { class: 'c-autre' }, champ('Nom de la femelle', entree('femelleNom', x ? x.femelleNom : '', 'texte', { maxlength: 40 })),
        U.choixRadio('espece', Object.keys(CE.ESPECES).map(function (k) { return { id: k, nom: CE.ESPECES[k].femelle, emoji: CE.ESPECES[k].emoji }; }), x ? x.espece : 'mouton', 'Espèce')),
      champ('Date de la saillie', entree('date', x ? x.date : auj(), 'date')),
      prev,
      champ('Mâle (facultatif)', entree('male', x ? x.male : '', 'texte', { maxlength: 60, placeholder: 'Nom ou numéro du mâle' })),
      champ('Note (facultatif)', U.zoneTexte('note', x ? x.note : '', { rows: 2, maxlength: 200 })),
      x ? h('fieldset', { class: 'c-misebas' }, h('legend', null, 'Mise-bas'),
        h('div', { class: 'deux' }, champ('Date de mise-bas', entree('dateMB', x.miseBas ? x.miseBas.date : '', 'date')), champ('Nombre de petits', entree('nbPetits', x.miseBas ? x.miseBas.nbPetits : '', 'entier'))),
        h('label', { class: 'case' }, h('input', { type: 'checkbox', name: 'echec', checked: !!x.echec }), 'Pas de mise-bas (la femelle n’était pas pleine)')) : null,
      pied('Enregistrer', x ? bouton('Supprimer', 'danger large', function () { if (confirm('Supprimer cette saillie ?')) effacer(x.id).then(function () { aller('#/repro'); }); }, 'corbeille') : null));
    function especeChoisie() { var a = S.idx[sel.value]; return a ? a.espece : U.radio(form, 'espece'); }
    function maj() {
      form.querySelector('.c-autre').hidden = sel.value !== '__autre';
      prev.textContent = '';
      var d = U.val(form, 'date');
      if (U.dateValide(d)) {
        var p = CE.miseBasPrevue({ date: d, espece: especeChoisie() }, S.reglages);
        prev.appendChild(document.createTextNode('Mise-bas attendue vers le ')); prev.appendChild(h('b', { 'data-prevue': p.date }, U.dateLongue(p.date)));
        prev.appendChild(h('span', { class: 'discret petit', style: 'display:block' }, 'Date approximative : entre le ' + U.dateFr(p.min) + ' et le ' + U.dateFr(p.max) + ' (gestation d’environ ' + p.gestation + ' jours).'));
      }
    }
    form.addEventListener('input', maj); form.addEventListener('change', maj);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var fid = sel.value, nomF = '';
      if (fid === '__autre') { nomF = U.val(form, 'femelleNom'); if (!nomF) return U.erreur(form, 'femelleNom', 'Écrivez le nom de la femelle.'); fid = null; }
      var d = dateOk(form, 'date'); if (!d) return;
      var r = x ? copie(x) : nouveau('saillie');
      r.femelleId = fid; r.femelleNom = fid ? S.idx[fid].nom : nomF; r.espece = especeChoisie(); r.date = d; r.male = U.val(form, 'male'); r.note = U.val(form, 'note');
      if (x) {
        var dm = U.val(form, 'dateMB'), np = U.nb(form, 'nbPetits');
        if (dm) { if (!U.dateValide(dm) || dm < d) return U.erreur(form, 'dateMB', 'Date de mise-bas après la saillie.'); if (dm > auj()) return U.erreur(form, 'dateMB', 'La date ne peut pas être après aujourd’hui.'); }
        r.miseBas = dm ? { date: dm, nbPetits: np > 0 ? Math.round(np) : null } : null;
        r.echec = !dm && U.coche(form, 'echec');
      }
      sauver(r).then(function () { toast('Saillie enregistrée.'); aller('#/saillie/' + r.id + '?vu=1'); }).catch(C.echec);
    });
    vue.appendChild(form); maj();
    if (x) {
      var p = CE.miseBasPrevue(x, S.reglages);
      var boutons = h('div', { class: 'boutons' }, U.boutonWhatsApp('Rappel sur WhatsApp', CE.messageMiseBas(x, nomFemelle(x), p)));
      if (x.miseBas && x.miseBas.date && x.femelleId) boutons.appendChild(lienBouton('#/animal/nouveau?mere=' + x.femelleId + '&lot=' + (S.idx[x.femelleId] ? S.idx[x.femelleId].lotId : ''), 'Ajouter un petit au carnet', 'secondaire', 'plus', { 'data-action': 'petit' }));
      vue.insertBefore(h('section', { class: 'carte' }, h('h2', null, 'Rappel'), h('p', null, 'Préparez un message de rappel et envoyez-le vous-même (à vous ou à votre berger).'), boutons), form);
    }
  }

  // ---------- Tabaski ----------
  function pageTabaski() {
    var vue = ouvrirFormulaire('Date de la Tabaski', '#/', 'accueil'), t = tab();
    vue.appendChild(h('p', null, 'La date de la Tabaski dépend de la lune : elle est annoncée quelques jours avant. ' +
      (t.source === 'defaut' ? 'La date proposée (' + U.dateFr(CE.TABASKI_DEFAUT) + ') est une estimation à confirmer.' : t.source === 'estimation' ? 'La date affichée est une estimation (environ 11 jours plus tôt chaque année).' : '')));
    var form = h('form', { class: 'carte', novalidate: true, 'data-form': 'tabaski' },
      champ('Date de la Tabaski', entree('tabaski', t.date, 'date')),
      h('label', { class: 'case' }, h('input', { type: 'checkbox', name: 'confirmee', checked: t.confirmee }), 'Date confirmée (annonce officielle)'),
      champ('Marge voulue par animal (F)', entree('marge', S.reglages.margeVisee, 'entier'), 'Utilisée pour proposer le prix de vente.'),
      pied('Enregistrer', bouton('Revenir à la date proposée', 'secondaire large', function () {
        var r = copie(S.reglages); r.tabaski = null; r.tabaskiConfirmee = false;
        enregistrerReglages(r).then(function () { toast('Date proposée remise.'); aller('#/'); });
      })));
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(form);
      var d = U.val(form, 'tabaski'); if (!U.dateValide(d)) return U.erreur(form, 'tabaski', 'Choisissez une date.');
      var m = U.nb(form, 'marge'); if (m != null && !(m >= 0)) return U.erreur(form, 'marge', 'Montant en F.');
      var r = copie(S.reglages); r.tabaski = d; r.tabaskiConfirmee = U.coche(form, 'confirmee'); if (m != null) r.margeVisee = Math.round(m);
      enregistrerReglages(r).then(function () { toast('Date enregistrée.'); aller('#/'); }).catch(C.echec);
    });
    vue.appendChild(form);
  }

  // ---------- Réglages ----------
  function pageReglages() {
    var vue = C.cadre('Réglages', null, 'reglages'); C.bandeaux('reglages');
    var rg = S.reglages;
    vue.appendChild(h('section', { class: 'carte' }, h('h2', null, 'Tabaski et prix'), h('p', null, 'Tabaski : ' + U.dateLongue(tab().date) + (tab().confirmee ? '' : ' (à confirmer)') + ' · marge voulue ' + U.fcfa(rg.margeVisee) + ' par animal.'),
      lienBouton('#/tabaski', 'Changer', 'secondaire', 'calendrier')));
    // Ruban
    var calib = CE.coefDepuisPesees(liste('pesee'));
    var fr = h('form', { class: 'carte', novalidate: true, 'data-form': 'ruban' }, h('h2', null, 'Estimation au ruban (indicative)'),
      h('p', null, 'Poids estimé ≈ ', h('span', { class: 'formule' }, 'coefficient × (tour de poitrine en m)³'), '. Avec 80 (formule de Crevat), un tour de 80 cm donne ≈ 41 kg. C’est un repère : une balance reste plus juste.'),
      h('div', { class: 'deux' }, champ('Moutons', entree('coef_mouton', rg.coef.mouton, 'nombre')), champ('Chèvres', entree('coef_chevre', rg.coef.chevre, 'nombre'))),
      champ('Bovins', entree('coef_bovin', rg.coef.bovin, 'nombre')),
      calib.coef ? alerte('ok', 'D’après ' + calib.nb + ' de vos pesées à la balance avec tour mesuré, le coefficient de vos animaux est ' + U.nombre(calib.coef, 1) + '.', [' ', bouton('Utiliser ' + U.nombre(calib.coef, 1), 'petit', function () {
        ['mouton', 'chevre', 'bovin'].forEach(function (k) { fr.querySelector('[name="coef_' + k + '"]').value = String(calib.coef).replace('.', ','); });
      }, null, { 'data-action': 'calibrer' })]) : h('p', { class: 'discret petit' }, 'Astuce : notez aussi le tour de poitrine quand vous pesez à la balance. Après 3 pesées, l’application propose un coefficient ajusté à vos animaux.'),
      h('button', { type: 'submit', class: 'btn' }, icone('ok'), 'Enregistrer'));
    fr.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(fr);
      var r = copie(S.reglages), ok = true;
      ['mouton', 'chevre', 'bovin'].forEach(function (k) { if (!ok) return; var v = U.nb(fr, 'coef_' + k); if (!(v >= 30 && v <= 200)) { ok = U.erreur(fr, 'coef_' + k, 'Entre 30 et 200 (80 par défaut).'); return; } r.coef[k] = v; });
      if (ok) enregistrerReglages(r).then(function () { toast('Coefficients enregistrés.'); });
    });
    vue.appendChild(fr);
    // Gestation
    var fg = h('form', { class: 'carte', novalidate: true, 'data-form': 'gestation' }, h('h2', null, 'Durées de gestation (jours)'),
      h('p', { class: 'discret' }, 'Valeurs habituelles : brebis et chèvre environ 150 jours, vache environ 283 jours. Adaptez si vous connaissez mieux vos animaux.'),
      h('div', { class: 'deux' }, champ('Brebis', entree('g_mouton', rg.gestation.mouton, 'entier')), champ('Chèvre', entree('g_chevre', rg.gestation.chevre, 'entier'))),
      champ('Vache', entree('g_bovin', rg.gestation.bovin, 'entier')),
      h('button', { type: 'submit', class: 'btn' }, icone('ok'), 'Enregistrer'));
    fg.addEventListener('submit', function (ev) {
      ev.preventDefault(); U.effacerErreurs(fg);
      var r = copie(S.reglages), ok = true;
      ['mouton', 'chevre', 'bovin'].forEach(function (k) { if (!ok) return; var v = U.nb(fg, 'g_' + k); if (!(v >= 100 && v <= 330)) { ok = U.erreur(fg, 'g_' + k, 'Entre 100 et 330 jours.'); return; } r.gestation[k] = Math.round(v); });
      if (ok) enregistrerReglages(r).then(function () { toast('Durées enregistrées.'); });
    });
    vue.appendChild(fg);
    var fe = h('form', { class: 'carte' }, U.choixRadio('especeDefaut', Object.keys(CE.ESPECES).map(function (k) { return { id: k, nom: CE.ESPECES[k].nom, emoji: CE.ESPECES[k].emoji }; }), rg.especeDefaut, 'Espèce proposée pour un nouvel animal'));
    fe.addEventListener('change', function () { var r = copie(S.reglages); r.especeDefaut = U.radio(fe, 'especeDefaut'); enregistrerReglages(r).then(function () { toast('Enregistré.'); }); });
    vue.appendChild(fe);
    C.sectionsReglages(vue);
  }

  // ---------- Aide ----------
  function pageAide() {
    var vue = C.cadre('Aide', '#/reglages', 'reglages'); C.bandeaux('aide');
    function bloc(t, c) { vue.appendChild(h('section', { class: 'carte aide-texte' }, h('h2', null, t), c)); }
    bloc('À quoi sert Carnet Élevage ?', h('p', null, 'À savoir combien vous coûte chaque animal, combien il gagne de poids, à quel prix le vendre et ce que vous avez vraiment gagné. Vous notez, l’application calcule.'));
    bloc('Les calculs, simplement', h('ul', null,
      h('li', null, h('b', null, 'Gain par jour'), ' = (dernier poids − premier poids) ÷ nombre de jours entre les deux pesées. Exemple : 38 kg → 52 kg en 60 jours = 233 g par jour.'),
      h('li', null, h('b', null, 'Coût de l’aliment'), ' = chaque jour de présence × coût de la ration du lot. Coût de la ration = kg de chaque aliment × prix du kg (moyenne de vos achats).'),
      h('li', null, h('b', null, 'Frais partagés'), ' (berger, eau, transport…) : une dépense pour un lot ou pour tous est partagée à parts égales entre les animaux présents ce jour-là, au franc près.'),
      h('li', null, h('b', null, 'Coût à ce jour'), ' = prix d’achat + aliment + frais.'),
      h('li', null, h('b', null, 'Coût du kilo gagné'), ' = aliment et frais entre la première et la dernière pesée ÷ kilos pris.'),
      h('li', null, h('b', null, 'Marge'), ' = prix de vente − coût de l’animal.'),
      h('li', null, h('b', null, 'Prix pour gagner ce que vous voulez'), ' = coût à ce jour + jours jusqu’à la vente × (ration + frais moyens par jour) + la marge voulue.'),
      h('li', null, h('b', null, 'Stock'), ' = achats − ce que mangent les animaux selon vos rations. Comptez votre stock de temps en temps : le calcul repart de votre comptage.')));
    bloc('Estimation au ruban (indicative)', h('div', null,
      h('p', null, 'Sans balance, mesurez le tour de poitrine (juste derrière les pattes avant). Poids estimé ≈ ', h('span', { class: 'formule' }, '80 × (tour en m)³'), ' : c’est la formule de Crevat, faite pour les bovins, utilisée ici aussi comme repère pour moutons et chèvres.'),
      h('p', null, 'Exemples : 80 cm → ≈ 41 kg ; 100 cm → ≈ 80 kg ; 155 cm → ≈ 298 kg. L’erreur peut atteindre 10 à 20 % selon la race et l’état de l’animal. Vous pouvez toujours écrire le vrai poids. Avec quelques pesées à la balance (tour noté aussi), l’application vous propose un coefficient ajusté à vos animaux.')));
    bloc('Mises-bas', h('p', null, 'Date attendue = date de saillie + durée de gestation habituelle (brebis et chèvre ≈ 150 jours, vache ≈ 283 jours). C’est une date approximative, à quelques jours près.'));
    bloc('Ce que l’application ne fait pas', h('p', null, 'Elle ne donne ni ration, ni traitement, ni diagnostic. Pour la santé de vos animaux, consultez un vétérinaire ou un agent d’élevage. Elle n’envoie aucun message toute seule : les boutons WhatsApp préparent un message que vous envoyez vous-même.'));
    bloc('Le pass', h('p', null, 'Gratuit : jusqu’à ' + CE.LIMITE_GRATUITE + ' animaux présents à la fois, avec tous les calculs, le rapport PDF et la sauvegarde. Pass 12 mois (3 000 F, payé par Wave) : animaux illimités. Quand le pass se termine, rien n’est perdu ni bloqué.'));
  }

  // ---------- Rapport PDF ----------
  function rapportLot(id, zone) {
    var l = S.idx[id], L = S.A.lots[id], t = tab();
    toast('Préparation du rapport…');
    window.TPDF.creer({ app: 'Carnet Élevage', titre: 'Rapport du lot « ' + l.nom + ' »', sousTitre: 'Rapport de lot · moutons, chèvres, bovins', edition: 'Édité le ' + U.dateFr(auj()),
      infos: 'Commencé le ' + U.dateFr(l.debut) + '  ·  Tabaski ' + U.dateFr(t.date) + (t.confirmee ? '' : ' (date à confirmer)') + ', dans ' + U.pluriel(t.jours, 'jour') }).then(function (P) {
      P.titre('Les chiffres clés');
      P.kpis([
        ['Animaux présents', U.nombre(L.nbPresents) + ' sur ' + U.nombre(L.nbTotal)],
        ['Vendus / morts / sortis', L.nbVendus + ' / ' + L.nbMorts + ' / ' + L.nbAutres],
        ['Achat des animaux', U.fcfa(L.achat)],
        ['Aliment (selon rations)', U.fcfa(L.aliment)],
        ['Autres frais', U.fcfa(L.frais + L.fraisNonRepartis)],
        ['Dépensé au total', U.fcfa(L.coutTotal)],
        ['Ventes', U.fcfa(L.ventes)],
        ['Marge des vendus', L.nbVendus ? U.fcfa(L.margeVendus) : '-', L.margeVendus < 0],
        ['Résultat à ce jour', U.fcfa(L.resultat), L.resultat < 0],
        ['Coût moyen par animal', U.fcfa(L.coutMoyen)],
        ['Gain moyen par jour', L.gmqMoyen != null ? U.nombre(L.gmqMoyen) + ' g' : '-'],
        ['Coût du kilo gagné', L.coutKgGagne != null ? U.fcfa(L.coutKgGagne) : '-']
      ]);
      P.paragraphe('Résultat à ce jour = ventes − tout ce qui a été dépensé (animaux encore présents compris). La marge des vendus compare chaque prix de vente au coût de l’animal vendu.', 8.5, P.GRIS);
      var an = L.ids.map(function (x) { return S.A.animaux[x]; }).sort(function (a, b) { return triNom(a.animal, b.animal); });
      P.titre('Les animaux');
      P.tableau([{ t: 'Animal', w: 30 }, { t: 'Espèce', w: 22 }, { t: 'Arrivée', w: 20 }, { t: 'Achat', w: 18, d: 1 }, { t: 'Poids', w: 16, d: 1 }, { t: 'Gain/j', w: 14, d: 1 }, { t: 'Coût', w: 22, d: 1 }, { t: 'Vente', w: 20, d: 1 }, { t: 'Marge', w: 20, d: 1, signe: 1 }],
        an.map(function (B) {
          var a = B.animal, e = espece(a);
          return [a.nom, e.nom + (a.sexe ? ' ' + a.sexe : ''), U.dateFr(a.dateEntree), U.nombre(B.prixAchat), B.poidsActuel != null ? U.nombre(B.poidsActuel, 1) + (B.pesees[B.pesees.length - 1].methode === 'ruban' ? '*' : '') : '-',
            B.gmq != null ? U.nombre(B.gmq) + ' g' : '-', U.nombre(B.coutTotal), B.vente != null ? U.nombre(B.vente) : (B.present ? 'présent' : CE.MOTIFS[a.sortie.motif].split(' ')[0]), B.marge != null ? U.nombre(B.marge) : '-'];
        }), { total: ['Total', '', '', U.nombre(L.achat), '', '', U.nombre(L.coutTotal - L.fraisNonRepartis), U.nombre(L.ventes), L.nbVendus ? U.nombre(L.margeVendus) : '-'] });
      if (an.some(function (B) { return B.pesees.some(function (p) { return p.methode === 'ruban'; }); })) P.paragraphe('* poids estimé au ruban (estimation indicative : ' + U.nombre(S.reglages.coef.mouton, 1) + ' × tour de poitrine en m au cube).', 8, P.GRIS);
      var cats = CE.CATEGORIES.filter(function (c) { return L.fraisCat[c.id]; });
      P.titre('Où va l’argent');
      P.barres([{ nom: 'Achat des animaux', valeur: L.achat, texte: U.fcfa(L.achat) }, { nom: 'Aliment', valeur: L.aliment, texte: U.fcfa(L.aliment) }].concat(cats.map(function (c) { return { nom: c.nom, valeur: L.fraisCat[c.id], texte: U.fcfa(L.fraisCat[c.id]) }; })));
      if (L.rationJour) {
        P.titre('Ration actuelle (notée par l’éleveur)');
        P.paragraphe((L.rationJour.ration.lignes || []).map(function (x) { var al = S.idx[x.alimentId]; var p = S.A.prix[x.alimentId]; return U.kg(x.kg, 2) + ' de ' + (al ? al.nom : '?') + (p && p.prix != null ? ' à ' + U.fcfa(p.prix) + '/kg' : ''); }).join(' ; ') +
          '. Coût : ' + U.fcfa(L.rationJour.cout) + ' par animal et par jour, ' + U.fcfa(L.coutJour) + ' par jour pour le lot.');
      }
      var pres = an.filter(function (B) { return B.present; });
      if (pres.length) {
        var m = S.reglages.margeVisee;
        P.titre('Prix de vente pour gagner ' + U.fcfa(m) + ' par animal à la Tabaski');
        P.tableau([{ t: 'Animal', w: 50 }, { t: 'Coût à ce jour', w: 40, d: 1 }, { t: 'Coût prévu le ' + U.dateFr(t.date), w: 50, d: 1 }, { t: 'Prix à demander', w: 42, d: 1 }],
          pres.map(function (B) { var p = CE.prixVise(B, auj(), t.date, m, false); return [B.animal.nom, U.fcfa(B.coutTotal), U.fcfa(p.coutPrevu), U.fcfa(p.prix)]; }));
        P.paragraphe('Coût prévu = coût à ce jour + jours restants × (ration du jour + frais moyens par jour). Estimation faite le ' + U.dateFr(auj()) + ' : elle change si la ration ou les prix changent.', 8.5, P.GRIS);
      }
      P.titre('À savoir');
      P.paragraphe('Calculs faits par Carnet Élevage à partir des saisies de l’éleveur. Les poids estimés au ruban sont indicatifs. L’application ne donne ni ration, ni traitement, ni diagnostic.', 8.5, P.GRIS);
      return P.terminer(U.nomFichier('rapport lot ' + l.nom + ' ' + auj(), 'pdf'));
    }).then(function (r) { U.offrirFichier(zone, r.blob, r.nom, 'Rapport du lot ' + l.nom); })
      .catch(function (e) { console.warn(e); toast('Rapport impossible : ' + (e && e.message ? e.message : 'erreur')); });
  }

  // ---------- Routage ----------
  function routes(p, q) {
    if (!p.length) pageAccueil();
    else if (p[0] === 'animaux') pageAnimaux();
    else if (p[0] === 'lot' && p[1] === 'nouveau') pageFormLot(null);
    else if (p[0] === 'lot' && p[1] && !p[2]) pageLot(p[1]);
    else if (p[0] === 'lot' && p[2] === 'modifier') pageFormLot(p[1]);
    else if (p[0] === 'lot' && p[2] === 'ration') pageRation(p[1]);
    else if (p[0] === 'lot' && p[2] === 'pesee') pageSeance(p[1]);
    else if (p[0] === 'animal' && p[1] === 'nouveau') pageFormAnimal(null, q);
    else if (p[0] === 'animal' && p[1] && !p[2]) pageAnimal(p[1]);
    else if (p[0] === 'animal' && p[2] === 'modifier') pageFormAnimal(p[1], q);
    else if (p[0] === 'animal' && p[2] === 'pesee') pagePesee(p[1]);
    else if (p[0] === 'animal' && p[2] === 'vente') pageVente(p[1]);
    else if (p[0] === 'animal' && p[2] === 'sortie') pageSortie(p[1]);
    else if (p[0] === 'pesee' && p[1]) pageModifierPesee(p[1]);
    else if (p[0] === 'pesee') pageChoixPesee();
    else if (p[0] === 'vendre') pageChoixVente();
    else if (p[0] === 'aliments') pageAliments();
    else if (p[0] === 'aliment' && p[1] === 'nouveau') pageFormAliment(null, q);
    else if (p[0] === 'aliment' && p[1]) pageFormAliment(p[1], q);
    else if (p[0] === 'achat' && p[1] === 'nouveau') pageFormAchat(null, q);
    else if (p[0] === 'achat' && p[1]) pageFormAchat(p[1], q);
    else if (p[0] === 'inventaire' && p[1]) pageInventaire(p[1]);
    else if (p[0] === 'depenses') pageDepenses();
    else if (p[0] === 'depense' && p[1] === 'nouveau') pageFormDepense(null, q);
    else if (p[0] === 'depense' && p[1]) pageFormDepense(p[1], q);
    else if (p[0] === 'repro') pageRepro();
    else if (p[0] === 'saillie' && p[1] === 'nouveau') pageFormSaillie(null, q);
    else if (p[0] === 'saillie' && p[1]) pageFormSaillie(p[1], q);
    else if (p[0] === 'tabaski') pageTabaski();
    else if (p[0] === 'reglages') pageReglages();
    else if (p[0] === 'aide') pageAide();
    else return false;
    return true;
  }

  C = window.TC.creer({
    nom: 'Carnet Élevage', titre: ['Carnet ', 'Élevage'], prefixe: 'ce', version: '1.0.0', dbNom: 'carnet-elevage',
    L: window.TL, DB: DB, charger: charger, routes: routes, aDesDonnees: aDesDonnees,
    offres: {
      texteGratuit: 'Vous suivez jusqu’à ' + CE.LIMITE_GRATUITE + ' animaux présents à la fois, avec tous les calculs. Le pass enlève la limite.',
      gratuit: ['Jusqu’à ' + CE.LIMITE_GRATUITE + ' animaux présents', 'Pesées, gain par jour, coût du kilo gagné', 'Aliment, stock, rations, dépenses', 'Mises-bas, Tabaski, prix de vente', 'Rapport PDF et sauvegarde'],
      complet: ['Animaux illimités (grands troupeaux, plusieurs lots)', 'Tout ce que fait la version gratuite', 'Vos données restent à vous, même après le pass']
    },
    sauvegarde: {
      app: 'CarnetElevage', photos: true,
      exporter: function (avecPhotos) {
        return (avecPhotos ? DB.photos() : Promise.resolve([])).then(function (ph) {
          return { recs: S.recs.filter(function (r) { return !r.exemple; }), reglages: S.reglages, photos: (ph || []).filter(function (p) { return S.idx[p.id] && !S.idx[p.id].exemple; }) };
        });
      },
      valider: CE.validerSauvegarde
    },
    apropos: ['Cahier d’élevage pour moutons, chèvres et bovins : pesées, aliment, dépenses, ventes, mises-bas et Tabaski.',
      'Ce n’est pas un outil vétérinaire : pas de ration conseillée, pas de traitement, pas de diagnostic. Pour la santé de vos animaux, consultez un vétérinaire.',
      'Vos données et vos photos restent sur ce téléphone : rien n’est envoyé sur Internet, sauf la vérification de votre pass (une fois).']
  });
  window.CEApp = { S: S, C: C };
  C.demarrer();
})();
