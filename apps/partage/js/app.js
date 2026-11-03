/* Teranga Partage Frais — interface (sans framework). Données : IndexedDB du téléphone uniquement.
   L'application calcule qui doit combien à qui ; elle ne détient ni ne déplace jamais d'argent. */
(function () {
  'use strict';
  var PF = window.PF, DB = window.DB;
  var VERSION = '1.0.0';
  var URL_ACHAT = '../../boutique/' + PF.PASS.slug + '.html';
  var PRIX_PASS = '1 000 F';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var f = PF.f;
  function svg(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + p + '</svg>'; }
  var ICO = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'), x: svg('<path d="M6 6l12 12M18 6 6 18"/>'), ok: svg('<path d="m5 12 5 5 9-10"/>'),
    wa: svg('<path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5z"/><path d="M8.5 9.5c.3 2.6 2.4 4.8 5 5.2l1.3-1.3 2 .9"/>'),
    pdf: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    modifier: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), supprimer: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    cadenas: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'), etoile: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    boutique: svg('<path d="M4 9h16l-1 11H5zM8 9V7a4 4 0 0 1 8 0v2"/>'), chevron: svg('<path d="m9 6 6 6-6 6"/>'),
    sauvegarde: svg('<path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
    installer: svg('<path d="M12 3v11m0 0-4-4m4 4 4-4"/><rect x="4" y="17" width="16" height="4" rx="1"/>'), telecharger: svg('<path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16"/>'),
    echange: svg('<path d="M4 8h13m0 0-4-4m4 4-4 4M20 16H7m0 0 4-4m-4 4 4 4"/>'), fete: svg('<path d="M4 20 9 7l8 8z"/><path d="M14 4v2M18 8h2M16.5 5.5 18 4M13 10c1-2 3-3 5-3"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'), recu: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>')
  };
  var ICO_TYPE = {
    amis: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.5 3.5 5.2"/>'),
    colocation: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    voyage: svg('<path d="M3 13h18l-2 5H5zM6 13V8h5l3 5M8 18v2M16 18v2"/>'),
    bapteme: svg('<path d="M12 21c-4-2.5-8-6-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 11c0 4-4 7.5-8 10z"/>'),
    cotisation: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M9 9.5c0-1.4 1.3-2 3-2s3 .7 3 2-1.3 1.8-3 2.2-3 1-3 2.3 1.3 2 3 2 3-.6 3-2"/>'),
    famille: svg('<circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="7" r="2.5"/><circle cx="12" cy="13" r="2"/><path d="M3 20c.5-3 2-5 4-5s3 1 3.5 2M21 20c-.5-3-2-5-4-5s-3 1-3.5 2M9.5 20c.4-2 1.3-3 2.5-3s2.1 1 2.5 3"/>'),
    autre: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8M12 8v8"/>')
  };

  // ---------- État ----------
  var S = { groupes: [], operations: [], journal: [], passes: [], sauvegarde: null };
  function etat() { return PF.etatPass(S.passes); }
  function passActif() { return etat().actif; }
  function nbDepenses() { return S.operations.filter(function (o) { return o.type !== 'remboursement'; }).length; }
  function charger() {
    return Promise.all([DB.lire('kv', 'passes'), DB.lire('kv', 'sauvegarde'), DB.tout('groupes'), DB.tout('operations'), DB.tout('journal')]).then(function (r) {
      S.passes = r[0] || []; S.sauvegarde = r[1] || null; S.groupes = r[2] || []; S.operations = r[3] || []; S.journal = r[4] || [];
    });
  }
  var persistance = false;
  function demanderPersistance() { if (persistance) return; persistance = true; try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {} }
  function groupe(id) { for (var i = 0; i < S.groupes.length; i++) if (S.groupes[i].id === id) return S.groupes[i]; return null; }
  function operation(id) { for (var i = 0; i < S.operations.length; i++) if (S.operations[i].id === id) return S.operations[i]; return null; }
  function opsDe(gid) { return S.operations.filter(function (o) { return o.groupeId === gid; }); }
  function journalDe(gid) { return S.journal.filter(function (j) { return j.groupeId === gid; }); }
  function entreeJournal(gid, texte) { return { id: PF.nouvelId(), groupeId: gid, le: new Date().toISOString(), texte: texte }; }

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
    fond.innerHTML = '<div class="feuille" role="dialog" aria-modal="true" aria-labelledby="feuille-titre"><div class="feuille-tete"><h2 id="feuille-titre">' + esc(titre) +
      '</h2><button type="button" class="icone-btn" data-fermer aria-label="Fermer">' + ICO.x + '</button></div><div class="feuille-corps">' + contenu + '</div></div>';
    document.body.appendChild(fond); document.body.classList.add('fige');
    feuilleOuverte = { el: fond, avant: document.activeElement };
    fond.addEventListener('click', function (e) { if (e.target === fond || e.target.closest('[data-fermer]')) fermerFeuille(); });
    var f1 = fond.querySelector('.feuille-corps input:not(.vh), .feuille-corps button, .feuille-corps a');
    (f1 || fond.querySelector('[data-fermer]')).focus({ preventScroll: true });
    if (init) init(fond.querySelector('.feuille'));
    requestAnimationFrame(function () { fond.classList.add('ouverte'); });
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
      feuille('Confirmation', '<p>' + esc(message) + '</p><div class="rang-btn"><button type="button" class="btn sec" data-non>Annuler</button><button type="button" class="btn ' + (danger ? 'danger' : 'plein') + '" data-oui>' + esc(oui || 'Confirmer') + '</button></div>', function (el) {
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
  function partagerFichier(blob, nom, type) {
    var fi; try { fi = new File([blob], nom, { type: type }); } catch (e) { fi = null; }
    var peut = false; try { peut = !!(fi && navigator.canShare && navigator.share && navigator.canShare({ files: [fi] })); } catch (e) {}
    if (peut) return navigator.share({ files: [fi] }).then(function () { return 'partage'; }).catch(function (e) { if (e && e.name === 'AbortError') return 'annule'; telecharger(blob, nom); return 'telecharge'; });
    telecharger(blob, nom); return Promise.resolve('telecharge');
  }
  function lienWA(texte) { return 'https://wa.me/?text=' + encodeURIComponent(texte); }
  function champ(label, nom, valeur, o) {
    o = o || {};
    var id = 'c-' + nom, attrs = ' id="' + id + '" name="' + nom + '"' + (o.max ? ' maxlength="' + o.max + '"' : '') + ' autocomplete="off"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') +
      (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.classe ? ' class="' + o.classe + '"' : '');
    var c = o.zone ? '<textarea' + attrs + ' rows="' + (o.lignes || 2) + '">' + esc(valeur) + '</textarea>' : '<input type="' + (o.type || 'text') + '"' + attrs + ' value="' + esc(valeur) + '">';
    return '<div class="champ"><label for="' + id + '">' + esc(label) + (o.facultatif ? ' <span class="petit">(facultatif)</span>' : '') + '</label>' + c + (o.aide ? '<small>' + esc(o.aide) + '</small>' : '') + '</div>';
  }

  // ---------- Cadre et routeur ----------
  var pileNav = 0;
  function cadre(o) {
    $('#titre').textContent = o.titre;
    var r = $('#retour'); r.hidden = !o.retour; r.dataset.vers = o.retour || '';
    $('#marque').hidden = !!o.retour;
    $$('#nav a').forEach(function (a) { var on = a.dataset.nav === o.nav; a.classList.toggle('actif', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.body.classList.toggle('edition', !!o.edition);
    var fab = $('#fab'); fab.hidden = !o.fab;
    if (o.fab) { fab.dataset.vers = o.fab; fab.innerHTML = ICO.plus + '<span>' + esc(o.fabLabel) + '</span>'; fab.setAttribute('aria-label', o.fabLabel); }
    document.title = o.titre + ' · Teranga Partage Frais';
    majInstall();
  }
  function vue(html) { var v = $('#vue'); v.innerHTML = html; window.scrollTo(0, 0); v.focus({ preventScroll: true }); }
  var ROUTES = [
    [/^\/?$/, vueGroupes], [/^\/groupe-modifier\/([\w-]+)$/, vueGroupeForm], [/^\/g\/([\w-]+)$/, vueGroupe],
    [/^\/depense\/([\w-]+\/[\w-]+)$/, vueDepenseForm], [/^\/remb\/([\w-]+\/[\w-]+)$/, vueRembForm],
    [/^\/reglages$/, vueReglages], [/^\/pass$/, vuePass], [/^\/sauvegarde$/, vueSauvegarde]
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
    for (var k = 0; k < ROUTES.length; k++) { var m = h.match(ROUTES[k][0]); if (m) { ROUTES[k][1](m[1], params); return; } }
    location.replace('#/');
  }
  function aller(h) { if (location.hash === h) router(); else location.hash = h; }

  // ---------- Groupes ----------
  function bandeauPass() {
    var e = etat();
    if (e.rappel) return '<div class="bandeau" id="rappel-pass">' + ICO.info + '<p>Votre Pass Partage Frais se termine dans <b>' + e.joursRestants + ' jour' + (e.joursRestants > 1 ? 's' : '') + '</b> (le ' + esc(PF.dateFr(e.fin.slice(0, 10))) + ').</p><a class="btn plein" href="#/pass">Renouveler</a></div>';
    if (e.expire) return '<div class="bandeau" id="rappel-pass">' + ICO.info + '<p>Votre pass est terminé. Tous vos groupes restent consultables ; renouvelez pour en créer d\'autres et ajouter plus de 20 dépenses.</p><a class="btn plein" href="#/pass">Renouveler</a></div>';
    return '';
  }
  function etatGroupe(g) {
    var ops = opsDe(g.id), b = PF.bilan(g, ops), r = PF.reglements(PF.soldes(g, ops), g.membres.map(function (m) { return m.id; }));
    return { total: b.total, n: b.nbDepenses, virements: r.length };
  }
  function vueGroupes() {
    cadre({ titre: 'Partage Frais', nav: 'groupes', fab: S.groupes.length ? '#/groupe-modifier/nouveau' : null, fabLabel: 'Nouveau groupe' });
    var h = bandeauPass();
    if (!S.groupes.length) {
      h += '<section class="heros"><img src="icons/icon-192.png" alt="" width="84" height="84"><h1>Qui doit combien à qui ?</h1><p class="lead">Partagez les frais entre amis, en colocation, en voyage, pour un baptême ou une cotisation.</p>' +
        '<ul class="atouts">' + ['Notez qui a payé quoi, et pour qui (parts égales ou au choix)', 'Voyez tout de suite le solde de chacun, en F CFA, sans erreur', 'Le plus petit nombre de remboursements pour tout régler', 'Résumé WhatsApp en un geste, et PDF à garder', 'Tout reste sur votre téléphone ; l\'application ne touche jamais à l\'argent']
          .map(function (x) { return '<li>' + ICO.ok + esc(x) + '</li>'; }).join('') + '</ul>' +
        '<a class="btn plein large geant" href="#/groupe-modifier/nouveau" id="btn-premier-groupe">' + ICO.plus + 'Créer un groupe</a>' +
        '<p class="petit"><a href="#/sauvegarde">Restaurer une sauvegarde</a> · <a href="#/pass">J\'ai déjà un pass</a></p></section>';
      vue(h + bandeauInstall()); return;
    }
    h += '<div class="groupes" id="liste-groupes">' + S.groupes.slice().sort(function (a, b) { return (b.modifie || '').localeCompare(a.modifie || ''); }).map(function (g) {
      var e = etatGroupe(g);
      return '<a class="groupe" href="#/g/' + esc(g.id) + '"><span class="groupe-ico">' + (ICO_TYPE[g.type] || ICO_TYPE.autre) + '</span><span class="groupe-t"><strong>' + esc(g.nom) + '</strong><span>' +
        g.membres.length + ' membres · ' + esc(PF.type(g.type).nom) + '</span></span><span class="groupe-d"><strong>' + f(e.total) + '</strong>' +
        (e.n ? (e.virements ? '<span class="etat-badge attente">' + e.virements + ' à régler</span>' : '<span class="etat-badge ok">Réglé</span>') : '<span class="etat-badge attente">Vide</span>') + '</span></a>';
    }).join('') + '</div>';
    if (!passActif()) {
      var n = nbDepenses();
      h += '<section class="carte" id="quota"><h2>Version gratuite</h2><p>' + S.groupes.length + ' / ' + PF.GROUPES_GRATUITS + ' groupe · ' + n + ' / ' + PF.DEPENSES_GRATUITES + ' dépenses</p><div class="jauge" aria-hidden="true"><span style="width:' +
        Math.min(100, Math.round(n / PF.DEPENSES_GRATUITES * 100)) + '%"></span></div><a class="btn plein large" href="#/pass">' + ICO.etoile + 'Pass Partage Frais : ' + PRIX_PASS + ' pour 12 mois</a></section>';
    }
    vue(h + bandeauInstall());
  }
  function vueGroupeForm(id) {
    var nouveau = id === 'nouveau', g = nouveau ? null : groupe(id);
    if (!nouveau && !g) { location.replace('#/'); return; }
    if (nouveau && !PF.peutCreerGroupe(S.groupes.length, passActif())) {
      location.replace(S.groupes.length ? '#/' : '#/');
      setTimeout(function () { proposerPass('La version gratuite garde 1 groupe. Avec le Pass, créez autant de groupes que vous voulez : amis, colocation, voyages, baptêmes, cotisations.'); }, 60);
      return;
    }
    var route = '/groupe-modifier/' + id;
    if (!E || E.route !== route) E = { route: route, nouveau: nouveau, g: g ? JSON.parse(JSON.stringify(g)) : { id: PF.nouvelId(), nom: '', type: 'amis', membres: [] }, sale: false };
    cadre({ titre: nouveau ? 'Nouveau groupe' : 'Modifier le groupe', retour: nouveau ? '#/' : '#/g/' + id, nav: 'groupes', edition: true });
    var q = E.g;
    vue('<form data-form="groupe" id="form-groupe" novalidate><section class="carte">' + champ('Nom du groupe', 'nom', q.nom, { max: 50, ph: 'Ex. : Week-end à Saly, Coloc Mermoz' }) +
      '<div class="champ"><span class="label">Type</span><div class="puces" role="group" aria-label="Type de groupe" id="types">' + PF.TYPES.map(function (t) {
        return '<button type="button" class="puce" data-action="type" data-v="' + t.id + '" aria-pressed="' + (q.type === t.id) + '">' + esc(t.nom) + '</button>';
      }).join('') + '</div></div></section>' +
      '<section class="carte"><h2>Membres</h2><p class="petit">Seulement les prénoms ou surnoms. Touchez un nom pour le changer.</p><div class="membres-edit" id="membres"></div>' +
      '<div class="ajout"><label class="vh" for="c-membre">Nom du membre</label><input id="c-membre" maxlength="30" placeholder="Prénom du membre" enterkeyhint="done"><button type="button" class="btn plein" data-action="membre-ajout" id="btn-ajout-membre">' + ICO.plus + 'Ajouter</button></div></section>' +
      '<p class="erreur" id="erreur-groupe" hidden></p>' +
      (nouveau ? '' : '<div class="lien-sec"><button type="button" class="lien-danger" data-action="groupe-suppr">Supprimer ce groupe</button></div>') +
      '<div class="barre-enreg"><div><small>Membres</small><strong id="nb-membres">0</strong></div><button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>');
    rendreMembres();
  }
  function membreUtilise(gid, mid) {
    return S.operations.some(function (o) { return o.groupeId === gid && (o.payeur === mid || o.de === mid || o.a === mid || (o.repartition && o.repartition.ids.indexOf(mid) >= 0)); });
  }
  function rendreMembres() {
    $('#membres').innerHTML = E.g.membres.length ? E.g.membres.map(function (m) {
      return '<span class="puce" style="padding-right:4px"><button type="button" class="lien-membre" data-action="membre-renommer" data-id="' + esc(m.id) + '" style="all:unset;cursor:pointer">' + esc(m.nom) + '</button>' +
        '<button type="button" class="icone-btn" style="width:34px;height:34px" data-action="membre-retirer" data-id="' + esc(m.id) + '" aria-label="Retirer ' + esc(m.nom) + '">' + ICO.x + '</button></span>';
    }).join('') : '<span class="petit">Ajoutez au moins 2 membres.</span>';
    $('#nb-membres').textContent = E.g.membres.length;
  }
  function nomLibre(nom, sauf) { return !E.g.membres.some(function (m) { return m.id !== sauf && PF.sansAccents(m.nom).trim() === PF.sansAccents(nom).trim(); }); }
  function ajouterMembre() {
    var i = $('#c-membre'), n = i.value.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!n) return i.focus();
    if (!nomLibre(n)) { toast('« ' + n + ' » est déjà dans le groupe.'); return; }
    if (E.g.membres.length >= 60) { toast('60 membres au maximum.'); return; }
    E.g.membres.push({ id: PF.nouvelId(), nom: n }); E.sale = true; i.value = ''; i.focus(); rendreMembres();
  }
  function enregistrerGroupe(form) {
    var err = $('#erreur-groupe'), q = E.g, nom = form.querySelector('[name=nom]').value.trim().replace(/\s+/g, ' ');
    if ($('#c-membre').value.trim()) ajouterMembre();
    var e = [];
    if (!nom) e.push('Donnez un nom au groupe.');
    if (q.membres.length < 2) e.push('Ajoutez au moins 2 membres.');
    if (e.length) { err.innerHTML = e.map(esc).join('<br>'); err.hidden = false; return; }
    if (E.nouveau && !PF.peutCreerGroupe(S.groupes.length, passActif())) return proposerPass('La version gratuite garde 1 groupe.');
    q.nom = nom.slice(0, 50); q.modifie = new Date().toISOString();
    var ancien = groupe(q.id), j = [];
    if (E.nouveau) { q.cree = q.modifie; j.push(entreeJournal(q.id, 'Groupe créé avec ' + q.membres.map(function (m) { return m.nom; }).join(', ') + '.')); }
    else {
      if (ancien.nom !== q.nom) j.push(entreeJournal(q.id, 'Groupe renommé : « ' + ancien.nom + ' » devient « ' + q.nom + ' ».'));
      q.membres.forEach(function (m) {
        var a = ancien.membres.filter(function (x) { return x.id === m.id; })[0];
        if (!a) j.push(entreeJournal(q.id, 'Membre ajouté : ' + m.nom + '.'));
        else if (a.nom !== m.nom) j.push(entreeJournal(q.id, 'Membre renommé : ' + a.nom + ' devient ' + m.nom + '.'));
      });
      ancien.membres.forEach(function (a) { if (!q.membres.some(function (m) { return m.id === a.id; })) j.push(entreeJournal(q.id, 'Membre retiré : ' + a.nom + '.')); });
    }
    DB.lot([['groupes', q]].concat(j.map(function (x) { return ['journal', x]; }))).then(function () {
      if (ancien) S.groupes[S.groupes.indexOf(ancien)] = q; else S.groupes.push(q);
      S.journal = S.journal.concat(j);
      var nouveau = E.nouveau; E = null; demanderPersistance();
      toast(nouveau ? 'Groupe créé. Ajoutez la première dépense.' : 'Groupe enregistré.');
      location.replace('#/g/' + q.id);
    }).catch(function (x) { err.textContent = 'Enregistrement impossible : ' + (x && x.message || x); err.hidden = false; });
  }

  // ---------- Vue d'un groupe ----------
  function vueGroupe(id, params) {
    var g = groupe(id);
    if (!g) { location.replace('#/'); return; }
    var onglet = (params && params.get('t')) || 'depenses';
    cadre({ titre: g.nom, retour: '#/', nav: 'groupes' });
    var ops = opsDe(g.id), b = PF.bilan(g, ops), ordre = g.membres.map(function (m) { return m.id; }), s = PF.soldes(g, ops), r = PF.reglements(s, ordre);
    var h = '<section class="carte tete-groupe"><span class="type-ico">' + (ICO_TYPE[g.type] || ICO_TYPE.autre) + '</span><div style="flex:1;min-width:0"><h1>' + esc(g.nom) + '</h1><p>' + esc(PF.type(g.type).nom) + ' · ' +
      g.membres.map(function (m) { return esc(m.nom); }).join(', ') + '</p></div><a class="icone-btn" href="#/groupe-modifier/' + esc(g.id) + '" aria-label="Modifier le groupe">' + ICO.modifier + '</a></section>';
    h += '<div class="kpis"><div class="kpi"><span>Total dépensé</span><strong id="g-total">' + f(b.total) + '</strong><small>' + b.nbDepenses + ' dépense' + (b.nbDepenses > 1 ? 's' : '') + '</small></div>' +
      '<div class="kpi"><span>Pour tout régler</span><strong id="g-virements">' + r.length + '</strong><small>' + (r.length ? 'remboursement' + (r.length > 1 ? 's' : '') + ' à faire' : 'tout est réglé') + '</small></div></div>';
    h += '<div class="rang-btn"><a class="btn wa" id="btn-resume" href="' + esc(lienWA(PF.resume(g, ops))) + '" target="_blank" rel="noopener">' + ICO.wa + 'Résumé WhatsApp</a><button type="button" class="btn sec" data-action="pdf" id="btn-pdf">' + ICO.pdf + 'PDF</button></div>';
    h += '<nav class="segments" aria-label="Onglets">' + [['depenses', 'Dépenses'], ['soldes', 'Soldes'], ['historique', 'Historique']].map(function (x) {
      return '<a class="segment" href="#/g/' + esc(g.id) + '?t=' + x[0] + '"' + (onglet === x[0] ? ' aria-current="page"' : '') + ' id="onglet-' + x[0] + '">' + x[1] + '</a>';
    }).join('') + '</nav>';
    if (onglet === 'soldes') h += ongletSoldes(g, b, r);
    else if (onglet === 'historique') h += ongletHistorique(g);
    else h += ongletDepenses(g, ops);
    vue(h);
  }
  function ongletDepenses(g, ops) {
    var nom = function (id) { return PF.nomMembre(g, id); };
    var h = '<div class="rang-btn"><a class="btn plein" href="#/depense/' + esc(g.id) + '/nouveau" id="btn-depense">' + ICO.plus + 'Ajouter une dépense</a><a class="btn sec" href="#/remb/' + esc(g.id) + '/nouveau" id="btn-remb">' + ICO.echange + 'Noter un remboursement</a></div>';
    if (!ops.length) return h + '<div class="vide"><p>Aucune dépense pour l\'instant. Notez la première : qui a payé, combien, et pour qui.</p></div>';
    var l = ops.slice().sort(function (a, b) { return b.date.localeCompare(a.date) || (b.cree || '').localeCompare(a.cree || ''); }), jour = '';
    h += '<div class="liste" id="liste-ops">';
    l.forEach(function (o) {
      if (o.date !== jour) { jour = o.date; h += '<p class="jour-t">' + esc(PF.dateLongue(o.date)) + '</p>'; }
      if (o.type === 'remboursement') {
        h += '<a class="op remb" href="#/remb/' + esc(g.id) + '/' + esc(o.id) + '"><span class="op-g"><strong>' + esc(nom(o.de)) + ' → ' + esc(nom(o.a)) + '</strong><span>Remboursement</span></span><span class="op-d"><strong>' + f(o.montant) + '</strong></span></a>';
      } else {
        var n = o.repartition.ids.length;
        h += '<a class="op" href="#/depense/' + esc(g.id) + '/' + esc(o.id) + '"><span class="op-g"><strong>' + esc(o.titre) + '</strong><span>Payé par ' + esc(nom(o.payeur)) + ' · ' +
          (n === g.membres.length ? 'pour tout le monde' : 'pour ' + n + ' personne' + (n > 1 ? 's' : '')) + (o.repartition.mode !== 'egal' ? ' · parts au choix' : '') + '</span></span><span class="op-d"><strong>' + f(o.montant) + '</strong></span></a>';
      }
    });
    return h + '</div>';
  }
  function ongletSoldes(g, b, r) {
    var max = 1;
    g.membres.forEach(function (m) { max = Math.max(max, Math.abs(b.membres[m.id].solde)); });
    var h = '<section class="carte"><h2>Soldes</h2><ul class="soldes" id="soldes">' + g.membres.map(function (m) {
      var x = b.membres[m.id], pct = Math.round(Math.abs(x.solde) / max * 50);
      return '<li class="solde" data-membre="' + esc(m.nom) + '"><strong>' + esc(m.nom) + '</strong><span class="v ' + (x.solde > 0 ? 'recoit' : x.solde < 0 ? 'donne' : '') + '">' + (x.solde > 0 ? '+' : x.solde < 0 ? '−' : '') + f(Math.abs(x.solde)) + '</span>' +
        '<span class="barre-solde" aria-hidden="true">' + (x.solde ? '<span class="' + (x.solde > 0 ? 'p' : 'n') + '" style="width:' + pct + '%"></span>' : '') + '</span>' +
        '<small>' + (x.solde > 0 ? 'doit recevoir' : x.solde < 0 ? 'doit donner' : 'à jour') + ' · a payé ' + f(x.paye) + ', sa part ' + f(x.part) + (x.envoye || x.recu ? ', remb. donnés ' + f(x.envoye) + ', reçus ' + f(x.recu) : '') + '</small></li>';
    }).join('') + '</ul></section>';
    h += '<section class="carte"><h2>Pour tout régler</h2>';
    if (!r.length) h += '<div class="regle" id="tout-regle">' + ICO.fete + '<span>Tout est réglé : personne ne doit rien.</span></div>';
    else {
      h += '<p class="petit">' + r.length + ' remboursement' + (r.length > 1 ? 's' : '') + ', le plus petit nombre possible. Chacun rembourse directement (espèces, Wave, Orange Money…), puis touchez « C\'est payé ».</p><ul class="virements" id="virements">' + r.map(function (t) {
        var de = PF.nomMembre(g, t.de), a = PF.nomMembre(g, t.a);
        var rappel = 'Bonjour ' + de + ', pour « ' + g.nom + ' », il te reste ' + PF.fcfa(t.montant, ' ') + ' à donner à ' + a + '. Merci !';
        return '<li class="virement"><div class="virement-t"><b>' + esc(de) + '</b><span class="fleche">donne à</span><b>' + esc(a) + '</b><span class="m">' + f(t.montant) + '</span></div>' +
          '<div class="rang-btn"><button type="button" class="btn plein petit-btn" data-action="paye" data-de="' + esc(t.de) + '" data-a="' + esc(t.a) + '" data-m="' + t.montant + '">' + ICO.ok + 'C\'est payé</button>' +
          '<a class="btn sec petit-btn" href="' + esc(lienWA(rappel)) + '" target="_blank" rel="noopener">' + ICO.wa + 'Rappeler</a></div></li>';
      }).join('') + '</ul>';
    }
    return h + '</section>';
  }
  function ongletHistorique(g) {
    var l = journalDe(g.id).sort(function (a, b) { return b.le.localeCompare(a.le); });
    if (!l.length) return '<p class="vide">Aucun changement pour l\'instant.</p>';
    var h = '<section class="carte"><h2>Historique</h2><p class="petit">Chaque ajout, modification ou suppression est noté ici, pour que tout le monde s\'y retrouve.</p>', jour = '';
    l.forEach(function (j) {
      var d = new Date(j.le), iso = PF.dateISO(d);
      if (iso !== jour) { h += (jour ? '</ul>' : '') + '<p class="jour-t">' + esc(PF.dateLongue(iso)) + '</p><ul class="journal">'; jour = iso; }
      h += '<li><time>' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + '</time><span>' + esc(j.texte) + '</span></li>';
    });
    return h + '</ul></section>';
  }
  function marquerPaye(gid, de, a, m) {
    var g = groupe(gid);
    feuille('Remboursement fait ?', '<form data-form="paye-rapide"><p><b>' + esc(PF.nomMembre(g, de)) + '</b> a donné à <b>' + esc(PF.nomMembre(g, a)) + '</b> :</p>' +
      '<div class="champ"><label for="c-montant-paye">Montant remboursé</label><input id="c-montant-paye" inputmode="numeric" class="grand-champ" value="' + esc(PF.formatNombre(m)) + '"><small>Vous pouvez noter une partie seulement.</small></div>' +
      '<input type="hidden" name="de" value="' + esc(de) + '"><input type="hidden" name="a" value="' + esc(a) + '"><input type="hidden" name="g" value="' + esc(gid) + '">' +
      '<p class="erreur" id="erreur-paye" hidden></p><button type="submit" class="btn plein large geant">' + ICO.ok + 'Oui, c\'est payé</button><p class="petit">L\'application note seulement le remboursement ; elle ne transfère pas d\'argent.</p></form>');
  }
  function enregistrerRemboursement(r, ancien) {
    var g = groupe(r.groupeId), nom = function (id) { return PF.nomMembre(g, id); };
    var texte = (ancien ? 'Remboursement modifié : ' : 'Remboursement noté : ') + nom(r.de) + ' a donné ' + PF.fcfa(r.montant, ' ') + ' à ' + nom(r.a) + (ancien && ancien.montant !== r.montant ? ' (avant : ' + PF.fcfa(ancien.montant, ' ') + ')' : '') + '.';
    var j = entreeJournal(g.id, texte);
    g.modifie = new Date().toISOString();
    return DB.lot([['operations', r], ['journal', j], ['groupes', g]]).then(function () {
      if (ancien) S.operations[S.operations.indexOf(ancien)] = r; else S.operations.push(r);
      S.journal.push(j);
    });
  }

  // ---------- Dépense ----------
  function vueDepenseForm(cle) {
    var p = cle.split('/'), g = groupe(p[0]), id = p[1], nouveau = id === 'nouveau', o = nouveau ? null : operation(id);
    if (!g || (!nouveau && (!o || o.type === 'remboursement'))) { location.replace(g ? '#/g/' + g.id : '#/'); return; }
    if (nouveau && !PF.peutAjouterDepense(nbDepenses(), passActif())) {
      location.replace('#/g/' + g.id);
      setTimeout(function () { proposerPass('La version gratuite garde jusqu\'à ' + PF.DEPENSES_GRATUITES + ' dépenses. Vos dépenses restent toutes là ; avec le Pass, ajoutez-en autant que vous voulez.'); }, 60);
      return;
    }
    var route = '/depense/' + cle, ids = g.membres.map(function (m) { return m.id; });
    if (!E || E.route !== route) {
      var base = o ? JSON.parse(JSON.stringify(o)) : { id: PF.nouvelId(), groupeId: g.id, type: 'depense', titre: '', montant: null, payeur: null, date: PF.dateISO(), repartition: { mode: 'egal', ids: ids.slice(), valeurs: {} }, note: '' };
      E = { route: route, nouveau: nouveau, o: base, ancien: o, sale: false };
    }
    cadre({ titre: nouveau ? 'Nouvelle dépense' : 'Modifier la dépense', retour: '#/g/' + g.id, nav: 'groupes', edition: true });
    var q = E.o;
    var h = '<form data-form="depense" id="form-depense" novalidate><section class="carte">' + champ('Quoi ?', 'titre', q.titre, { max: 60, ph: 'Ex. : Courses' }) +
      '<div class="puces defile" aria-label="Suggestions">' + PF.type(g.type).titres.map(function (t) { return '<button type="button" class="puce petite" data-action="titre" data-v="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' +
      champ('Montant (F CFA)', 'montant', q.montant ? PF.formatNombre(q.montant) : '', { mode: 'numeric', ph: '0', classe: 'grand-champ' }) + '</section>' +
      '<section class="carte"><h2 id="t-payeur">Qui a payé ?</h2><div class="puces" role="group" aria-labelledby="t-payeur" id="payeurs">' + g.membres.map(function (m) {
        return '<button type="button" class="puce" data-action="payeur" data-id="' + esc(m.id) + '" aria-pressed="' + (q.payeur === m.id) + '">' + esc(m.nom) + '</button>';
      }).join('') + '</div></section>' +
      '<section class="carte"><div class="titre-ligne"><h2 id="t-pour">Pour qui ?</h2><button type="button" class="btn sec petit-btn" data-action="tous" id="btn-tous">Tout le monde</button></div>' +
      '<div class="puces" role="group" aria-labelledby="t-pour" id="concernes">' + g.membres.map(function (m) {
        return '<button type="button" class="puce" data-action="concerne" data-id="' + esc(m.id) + '" aria-pressed="' + (q.repartition.ids.indexOf(m.id) >= 0) + '">' + esc(m.nom) + '</button>';
      }).join('') + '</div>' +
      '<div class="segments" role="group" aria-label="Répartition">' + [['egal', 'Parts égales'], ['montants', 'Montants'], ['parts', 'Parts']].map(function (x) {
        return '<button type="button" class="segment" data-action="mode" data-v="' + x[0] + '" aria-pressed="' + (q.repartition.mode === x[0]) + '">' + x[1] + '</button>';
      }).join('') + '</div><div class="parts" id="parts"></div><p class="reste" id="reste" hidden></p></section>' +
      '<section class="carte">' + champ('Date', 'date', q.date, { type: 'date' }) + champ('Note', 'note', q.note || '', { facultatif: true, max: 120, ph: 'Ex. : ticket gardé par Awa' }) + '</section>' +
      '<p class="erreur" id="erreur-depense" hidden></p>' +
      (nouveau ? '' : '<div class="lien-sec"><button type="button" class="lien-danger" data-action="op-suppr">Supprimer cette dépense</button></div>') +
      '<div class="barre-enreg"><div><small>Total</small><strong id="total-depense">0 F</strong></div><button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>';
    vue(h);
    rendreParts();
  }
  // En mode « parts », chaque personne concernée a 1 part tant qu'on ne l'a pas changée
  function partsParDefaut(R) { if (R.mode === 'parts') R.ids.forEach(function (id) { if (R.valeurs[id] == null || isNaN(R.valeurs[id])) R.valeurs[id] = 1; }); }
  function rendreParts() {
    var g = groupe(E.o.groupeId), q = E.o, R = q.repartition, ordre = g.membres.map(function (m) { return m.id; });
    partsParDefaut(R);
    q.montant = PF.lireEntier($('#c-montant').value);
    var M = q.montant > 0 ? q.montant : 0;
    $('#total-depense').textContent = f(M);
    var concernes = g.membres.filter(function (m) { return R.ids.indexOf(m.id) >= 0; });
    var parts = R.mode === 'montants' ? null : PF.partsDepense({ montant: M, payeur: q.payeur, repartition: R }, ordre);
    $('#parts').innerHTML = concernes.map(function (m) {
      if (R.mode === 'montants') return '<div class="part"><span>' + esc(m.nom) + '</span><input inputmode="numeric" aria-label="Montant pour ' + esc(m.nom) + '" data-valeur="' + esc(m.id) + '" value="' + esc(R.valeurs[m.id] != null && R.valeurs[m.id] !== '' ? PF.formatNombre(R.valeurs[m.id]) : '') + '" placeholder="0"></div>';
      if (R.mode === 'parts') {
        var v = R.valeurs[m.id] == null ? 1 : R.valeurs[m.id];
        return '<div class="part parts-mode"><span>' + esc(m.nom) + '</span><span class="stepper"><button type="button" data-action="part" data-id="' + esc(m.id) + '" data-d="-1" aria-label="Une part de moins">−</button><input inputmode="numeric" aria-label="Parts de ' + esc(m.nom) + '" data-valeur="' + esc(m.id) + '" value="' + v + '"><button type="button" data-action="part" data-id="' + esc(m.id) + '" data-d="1" aria-label="Une part de plus">+</button></span><output data-part="' + esc(m.id) + '">' + f(parts[m.id] || 0) + '</output></div>';
      }
      return '<div class="part"><span>' + esc(m.nom) + '</span><output data-part="' + esc(m.id) + '">' + f(parts[m.id] || 0) + '</output></div>';
    }).join('');
    majReste();
  }
  function majReste() {
    var g = groupe(E.o.groupeId), q = E.o, R = q.repartition, reste = $('#reste'), M = q.montant > 0 ? q.montant : 0;
    if (R.mode === 'montants') {
      var s = 0; R.ids.forEach(function (id) { var v = Number(R.valeurs[id]); if (v > 0) s += v; });
      reste.hidden = false;
      reste.className = 'reste ' + (s === M && M > 0 ? 'ok' : 'ko');
      reste.textContent = s === M ? (M ? 'Tout est réparti.' : 'Indiquez le montant total.') : s < M ? 'Reste à répartir : ' + f(M - s) : 'Trop réparti : ' + f(s - M);
    } else if (R.mode === 'parts') {
      var parts = PF.partsDepense({ montant: M, payeur: q.payeur, repartition: R }, g.membres.map(function (m) { return m.id; }));
      $$('[data-part]').forEach(function (o) { o.textContent = f(parts[o.dataset.part] || 0); });
      var w = 0; R.ids.forEach(function (id) { w += Number(R.valeurs[id]) || 0; });
      reste.hidden = false; reste.className = 'reste'; reste.textContent = w + ' part' + (w > 1 ? 's' : '') + (w && M ? ' · 1 part = ' + f(Math.round(M / w)) : '');
    } else {
      var p2 = PF.partsDepense({ montant: M, payeur: q.payeur, repartition: R }, g.membres.map(function (m) { return m.id; }));
      $$('[data-part]').forEach(function (o) { o.textContent = f(p2[o.dataset.part] || 0); });
      reste.hidden = !R.ids.length || !M;
      reste.className = 'reste'; reste.textContent = R.ids.length + ' personne' + (R.ids.length > 1 ? 's' : '') + ' · environ ' + f(Math.round(M / Math.max(1, R.ids.length))) + ' chacun';
    }
  }
  function enregistrerDepense(form) {
    var g = groupe(E.o.groupeId), q = E.o, err = $('#erreur-depense'), R = q.repartition;
    q.titre = form.querySelector('[name=titre]').value.trim().replace(/\s+/g, ' ').slice(0, 60);
    q.montant = PF.lireEntier(form.querySelector('[name=montant]').value);
    q.date = /^\d{4}-\d{2}-\d{2}$/.test(form.querySelector('[name=date]').value) ? form.querySelector('[name=date]').value : PF.dateISO();
    q.note = form.querySelector('[name=note]').value.trim().slice(0, 120);
    var ordre = g.membres.map(function (m) { return m.id; });
    R.ids = R.ids.filter(function (id) { return ordre.indexOf(id) >= 0; });
    var valeurs = {};
    R.ids.forEach(function (id) {
      if (R.mode === 'montants') valeurs[id] = PF.lireEntier(R.valeurs[id] == null ? '' : R.valeurs[id]) || 0;
      else if (R.mode === 'parts') valeurs[id] = PF.lireEntier(R.valeurs[id] == null ? '' : R.valeurs[id]) || 0;
    });
    R.valeurs = R.mode === 'egal' ? {} : valeurs;
    var e = PF.verifierDepense(q, g.membres);
    if (e.length) { err.innerHTML = e.map(esc).join('<br>'); err.hidden = false; err.scrollIntoView({ block: 'center' }); return; }
    if (E.nouveau && !PF.peutAjouterDepense(nbDepenses(), passActif())) return proposerPass('La version gratuite garde jusqu\'à ' + PF.DEPENSES_GRATUITES + ' dépenses.');
    var maint = new Date().toISOString(), ancien = E.ancien;
    if (E.nouveau) q.cree = maint;
    q.modifie = maint;
    var nom = function (id) { return PF.nomMembre(g, id); };
    var texte = (ancien ? 'Dépense modifiée : ' : 'Dépense ajoutée : ') + q.titre + ', ' + PF.fcfa(q.montant, ' ') + ', payée par ' + nom(q.payeur) +
      (R.ids.length === g.membres.length ? ' pour tout le monde' : ' pour ' + R.ids.map(nom).join(', ')) + (R.mode !== 'egal' ? ' (parts au choix)' : '') +
      (ancien && ancien.montant !== q.montant ? ' (avant : ' + PF.fcfa(ancien.montant, ' ') + ')' : '') + '.';
    var j = entreeJournal(g.id, texte);
    g.modifie = maint;
    DB.lot([['operations', q], ['journal', j], ['groupes', g]]).then(function () {
      if (ancien) S.operations[S.operations.indexOf(ancien)] = q; else S.operations.push(q);
      S.journal.push(j);
      var nouveau = E.nouveau; E = null; demanderPersistance();
      toast(nouveau ? 'Dépense ajoutée.' : 'Dépense modifiée.');
      location.replace('#/g/' + g.id);
    }).catch(function (x) { err.textContent = 'Enregistrement impossible : ' + (x && x.message || x); err.hidden = false; });
  }
  function supprimerOperation(o) {
    var g = groupe(o.groupeId), nom = function (id) { return PF.nomMembre(g, id); };
    var quoi = o.type === 'remboursement' ? 'le remboursement de ' + nom(o.de) + ' à ' + nom(o.a) + ' (' + PF.fcfa(o.montant, ' ') + ')' : 'la dépense « ' + o.titre + ' » (' + PF.fcfa(o.montant, ' ') + ')';
    confirmer('Supprimer ' + quoi + ' ? Les soldes seront recalculés.', 'Supprimer', true).then(function (oui) {
      if (!oui) return;
      var j = entreeJournal(g.id, (o.type === 'remboursement' ? 'Remboursement supprimé : ' + nom(o.de) + ' → ' + nom(o.a) : 'Dépense supprimée : ' + o.titre) + ', ' + PF.fcfa(o.montant, ' ') + '.');
      DB.lot([['-', 'operations', o.id], ['journal', j]]).then(function () {
        S.operations = S.operations.filter(function (x) { return x.id !== o.id; }); S.journal.push(j);
        E = null; toast('Supprimé.'); location.replace('#/g/' + g.id);
      });
    });
  }

  // ---------- Remboursement ----------
  function vueRembForm(cle, params) {
    var p = cle.split('/'), g = groupe(p[0]), id = p[1], nouveau = id === 'nouveau', o = nouveau ? null : operation(id);
    if (!g || (!nouveau && (!o || o.type !== 'remboursement'))) { location.replace(g ? '#/g/' + g.id : '#/'); return; }
    var route = '/remb/' + cle;
    if (!E || E.route !== route) {
      E = { route: route, nouveau: nouveau, ancien: o, sale: false, o: o ? JSON.parse(JSON.stringify(o)) : { id: PF.nouvelId(), groupeId: g.id, type: 'remboursement', de: params.get('de') || null, a: params.get('a') || null, montant: +params.get('m') || null, date: PF.dateISO() } };
    }
    cadre({ titre: nouveau ? 'Remboursement' : 'Modifier le remboursement', retour: '#/g/' + g.id, nav: 'groupes', edition: true });
    var q = E.o, puces = function (cle2, sel) {
      return g.membres.map(function (m) { return '<button type="button" class="puce" data-action="remb-membre" data-cle="' + cle2 + '" data-id="' + esc(m.id) + '" aria-pressed="' + (sel === m.id) + '">' + esc(m.nom) + '</button>'; }).join('');
    };
    vue('<form data-form="remb" id="form-remb" novalidate><section class="carte"><h2 id="t-de">Qui a donné l\'argent ?</h2><div class="puces" role="group" aria-labelledby="t-de" id="remb-de">' + puces('de', q.de) + '</div></section>' +
      '<section class="carte"><h2 id="t-a">À qui ?</h2><div class="puces" role="group" aria-labelledby="t-a" id="remb-a">' + puces('a', q.a) + '</div></section>' +
      '<section class="carte">' + champ('Montant (F CFA)', 'montant', q.montant ? PF.formatNombre(q.montant) : '', { mode: 'numeric', ph: '0', classe: 'grand-champ' }) + champ('Date', 'date', q.date, { type: 'date' }) + '</section>' +
      '<p class="petit">L\'application note seulement le remboursement fait entre vous ; elle ne transfère pas d\'argent.</p><p class="erreur" id="erreur-remb" hidden></p>' +
      (nouveau ? '' : '<div class="lien-sec"><button type="button" class="lien-danger" data-action="op-suppr">Supprimer ce remboursement</button></div>') +
      '<div class="barre-enreg"><div><small>Remboursement</small><strong id="total-remb">' + f(q.montant || 0) + '</strong></div><button type="submit" class="btn plein">' + ICO.ok + 'Enregistrer</button></div></form>');
  }

  // ---------- PDF ----------
  var pdfOccupe = false;
  function creerPDF(g) {
    if (pdfOccupe) return; pdfOccupe = true;
    toast('Préparation du PDF…');
    PFPDF.resume(g, opsDe(g.id), journalDe(g.id)).then(function (r) {
      pdfOccupe = false; cacherToast();
      return partagerFichier(r.blob, r.nom, 'application/pdf').then(function (x) { if (x === 'telecharge') toast('PDF téléchargé : envoyez-le sur WhatsApp (trombone, Document).'); });
    }).catch(function (e) { pdfOccupe = false; toast(e.message || 'Le PDF n\'a pas pu être créé.'); });
  }

  // ---------- Réglages, installation ----------
  var invite = null;
  function estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function estInstallee() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function majInstall() { var b = $('#installer'); if (b) b.hidden = estInstallee() || !(invite || estIOS()); }
  function bandeauInstall() {
    if (estInstallee() || (!invite && !estIOS())) return '';
    return '<div class="bandeau-install"><img src="icons/icon-192.png" alt="" width="40" height="40"><p><b>Installez l\'application</b><span>Sur l\'écran d\'accueil, même sans Internet.</span></p><button type="button" class="btn plein" data-action="installer">Installer</button></div>';
  }
  function instructionsInstall() {
    if (estIOS()) return '<ol class="etapes"><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez le bouton <b>Partager</b> (carré avec une flèche vers le haut).</li><li>Choisissez <b>« Sur l\'écran d\'accueil »</b>, puis <b>Ajouter</b>.</li></ol>';
    return '<ol class="etapes"><li>Ouvrez cette page dans <b>Chrome</b>.</li><li>Touchez le menu <b>⋮</b> en haut à droite.</li><li>Choisissez <b>« Installer l\'application »</b> ou <b>« Ajouter à l\'écran d\'accueil »</b>.</li></ol>';
  }
  function lireTheme() { try { return localStorage.getItem('pf-theme') || 'auto'; } catch (e) { return 'auto'; } }
  function appliquerTheme(v) {
    try { localStorage.setItem('pf-theme', v); } catch (e) {}
    var r = document.documentElement;
    if (v === 'clair') r.setAttribute('data-theme', 'light'); else if (v === 'sombre') r.setAttribute('data-theme', 'dark'); else r.removeAttribute('data-theme');
  }
  function lienMenu(href, ico, titre, sous) { return '<a class="menu-lien" href="' + href + '">' + ico + '<span><strong>' + esc(titre) + '</strong><small>' + esc(sous) + '</small></span>' + ICO.chevron + '</a>'; }
  function vueReglages() {
    cadre({ titre: 'Réglages', nav: 'reglages' });
    var e = etat(), theme = lireTheme();
    var h = '<section class="carte statut-version' + (e.actif ? ' ok' : '') + '"><div><small>Votre version</small><strong>' + (e.actif ? 'Pass Partage Frais' : 'Version gratuite') + '</strong><span>' +
      (e.actif ? 'Jusqu\'au ' + esc(PF.dateFr(e.fin.slice(0, 10))) + ' (' + e.joursRestants + ' jours)' : '1 groupe, ' + PF.DEPENSES_GRATUITES + ' dépenses') + '</span></div><a class="btn ' + (e.actif ? 'sec' : 'plein') + '" href="#/pass">' + (e.actif ? 'Détails' : 'Voir le pass') + '</a></section>';
    h += '<nav class="menu" aria-label="Réglages">' + lienMenu('#/sauvegarde', ICO.sauvegarde, 'Sauvegarde', S.sauvegarde ? 'Dernière : ' + PF.dateFr(S.sauvegarde.slice(0, 10)) : 'Aucune sauvegarde pour l\'instant') +
      lienMenu('#/pass', ICO.etoile, 'Pass Partage Frais', e.actif ? 'Actif jusqu\'au ' + PF.dateFr(e.fin.slice(0, 10)) : PRIX_PASS + ' pour 12 mois') + '</nav>';
    h += '<section class="carte"><h2>Apparence</h2><div class="champ"><label for="theme">Thème</label><select id="theme"><option value="auto"' + (theme === 'auto' ? ' selected' : '') + '>Automatique (comme le téléphone)</option><option value="clair"' +
      (theme === 'clair' ? ' selected' : '') + '>Clair</option><option value="sombre"' + (theme === 'sombre' ? ' selected' : '') + '>Sombre</option></select></div></section>';
    h += '<section class="carte"><h2>Installer l\'application</h2>' + (estInstallee() ? '<p>' + ICO.ok + ' L\'application est installée sur ce téléphone.</p>' : (invite ? '<button type="button" class="btn plein large" data-action="installer">' + ICO.installer + 'Installer l\'application</button>' : instructionsInstall())) + '</section>';
    h += '<section class="carte"><h2>Comment ça marche</h2><p>Chaque dépense est partagée entre les personnes concernées, au franc près. Le solde de chacun = ce qu\'il a payé − sa part (+ remboursements donnés − reçus). La somme des soldes fait toujours 0.</p>' +
      '<p>« Pour tout régler » propose le plus petit nombre de remboursements possible (jamais plus que le nombre de membres moins un).</p></section>';
    h += '<section class="carte"><h2>Confidentialité</h2><p>Vos groupes, noms et dépenses restent <b>uniquement sur ce téléphone</b>. Rien n\'est envoyé sur Internet, sauf la vérification de votre pass, une fois. ' +
      'L\'application ne détient et ne déplace jamais d\'argent : chacun rembourse directement, puis vous le notez.</p><p class="petit">Le résumé WhatsApp est ouvert dans WhatsApp : c\'est vous qui choisissez à qui l\'envoyer.</p></section>';
    h += '<section class="carte"><h2>À propos</h2><p>Teranga Partage Frais, version ' + VERSION + '.</p><p class="petit">WhatsApp est une marque de son propriétaire ; cette application est indépendante. Bibliothèque libre incluse : jsPDF (MIT). <a href="vendor/LISEZMOI.txt">Détails et licence</a>.</p>' +
      '<p class="petit"><a href="../">Toutes nos applications</a> · <a href="../../boutique/">Boutique Teranga Outils</a></p></section>';
    vue(h);
    $('#theme').addEventListener('change', function () { appliquerTheme(this.value); });
  }

  // ---------- Pass ----------
  function avantages() {
    return ['Groupes illimités (gratuit : 1 groupe)', 'Dépenses illimitées (gratuit : ' + PF.DEPENSES_GRATUITES + ')', 'Résumés WhatsApp et PDF pour tous vos groupes', 'Rappel avant la fin ; vos groupes restent toujours consultables']
      .map(function (x) { return '<li>' + ICO.ok + esc(x) + '</li>'; }).join('');
  }
  function proposerPass(raison) {
    feuille('Pass Partage Frais', '<p>' + esc(raison) + '</p><ul class="atouts">' + avantages() + '</ul><p class="prix">' + PRIX_PASS + ' <small>pour 12 mois, payé une fois par Wave</small></p><a class="btn plein large" href="#/pass">' + ICO.etoile + 'Voir le pass</a>');
  }
  function vuePass(_, params) {
    cadre({ titre: 'Pass Partage Frais', retour: '#/reglages', nav: 'reglages' });
    var e = etat(), pre = params.get('code') || '', h = '';
    if (e.actif) h += '<section class="carte statut-version ok" id="pass-actif"><div><small>Pass Partage Frais 12 mois</small><strong>Pass actif</strong><span>Jusqu\'au ' + esc(PF.dateFr(e.fin.slice(0, 10))) + ' · encore ' + e.joursRestants + ' jours</span></div></section><ul class="atouts">' + avantages() + '</ul>' +
      '<p class="petit">Gardez le lien de votre commande : il active aussi le pass sur un autre téléphone. Pour prolonger, achetez un nouveau pass : les jours s\'ajoutent.</p>';
    else h += '<section class="carte offre"><h1>' + (e.expire ? 'Renouvelez votre pass' : 'Pass Partage Frais') + '</h1>' + (e.expire ? '<p>Votre pass s\'est terminé le ' + esc(PF.dateFr(e.fin.slice(0, 10))) + '. Vos groupes restent tous là.</p>' : '') +
      '<ul class="atouts">' + avantages() + '</ul><p class="prix">' + PRIX_PASS + ' <small>pour 12 mois</small></p><a class="btn plein large" href="' + URL_ACHAT + '" target="_blank" rel="noopener" id="lien-achat">' + ICO.boutique + 'Acheter le pass (Wave)</a></section>';
    h += '<form class="carte" data-form="pass"><h2>' + (e.actif ? 'Ajouter un autre pass' : 'Activer mon pass') + '</h2><ol class="etapes"><li>Achetez « Pass Partage Frais 12 mois » dans la boutique et payez par Wave.</li><li>Sur la page de votre commande payée, copiez le lien de la page.</li><li>Collez-le ci-dessous puis touchez « Activer ».</li></ol>' +
      '<div class="champ"><label for="c-code">Lien de votre commande</label><textarea id="c-code" name="code" rows="3" placeholder="https://…/boutique/commande.html?o=TCV-…&amp;t=…" autocomplete="off" autocapitalize="off" spellcheck="false">' + esc(pre) + '</textarea></div>' +
      '<p class="msg" id="msg-pass" role="status" aria-live="polite"></p><button type="submit" class="btn plein large" id="btn-activer">' + ICO.etoile + 'Activer</button><p class="petit">Internet est nécessaire une seule fois. Ensuite tout marche hors ligne.</p></form>';
    vue(h);
    if (pre) activer(pre);
  }
  function activer(texte) {
    var msg = $('#msg-pass'), btn = $('#btn-activer');
    var dire = function (m, erreur) { if (msg) { msg.textContent = m; msg.classList.toggle('erreur', !!erreur); msg.classList.toggle('ok', !erreur); } };
    var c = PF.lireLienCommande(texte);
    if (!c) return dire('Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « TCV- »).', true);
    if (navigator.onLine === false) return dire('Vous êtes hors ligne. Connectez-vous à Internet une fois pour activer.', true);
    dire('Vérification de votre commande…'); if (btn) btn.disabled = true;
    fetch(PF.urlVerification(c), { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (r.status === 404) throw { m: 'Commande introuvable. Vérifiez que vous avez copié le lien complet.' };
      if (!r.ok) throw { m: 'Le service de vérification ne répond pas. Réessayez dans un instant.' };
      return r.json();
    }).then(function (j) {
      var v = PF.analyserReponse(j);
      if (!v.ok) {
        if (v.raison === 'impayee') throw { m: 'Le paiement de cette commande n\'est pas encore confirmé. Terminez le paiement Wave, attendez la confirmation, puis réessayez.' };
        if (v.raison === 'produit') throw { m: 'Ce lien correspond à un autre achat' + (v.titre ? ' (« ' + v.titre + ' »)' : '') + '. Il faut le lien de la commande « Pass Partage Frais 12 mois ».' };
        if (v.raison === 'expiree') throw { m: 'Ce pass est terminé depuis le ' + PF.dateFr(v.fin.slice(0, 10)) + '. Achetez un nouveau pass pour continuer.' };
        throw { m: 'Commande introuvable.' };
      }
      S.passes = PF.ajouterPass(S.passes, v.pass);
      return DB.mettre('kv', S.passes, 'passes').then(function () { toast('Pass activé. Merci !'); demanderPersistance(); vuePass(null, new URLSearchParams()); });
    }).catch(function (e) { if (btn) btn.disabled = false; dire(e && e.m ? e.m : 'Pas de connexion au service. Vérifiez Internet et réessayez.', true); });
  }

  // ---------- Sauvegarde ----------
  function vueSauvegarde() {
    cadre({ titre: 'Sauvegarde', retour: '#/reglages', nav: 'reglages' });
    vue('<section class="carte"><h2>Sauvegarder mes données</h2><p>Un fichier avec tous vos groupes, dépenses, remboursements et l\'historique. Envoyez-le-vous sur WhatsApp ou gardez-le sur Google Drive.</p>' +
      '<p class="petit">' + (S.sauvegarde ? 'Dernière sauvegarde : ' + esc(PF.dateFr(S.sauvegarde.slice(0, 10))) : 'Aucune sauvegarde pour l\'instant.') + '</p><button type="button" class="btn plein large" data-action="exporter-json">' + ICO.telecharger + 'Télécharger la sauvegarde</button></section>' +
      '<section class="carte"><h2>Restaurer une sauvegarde</h2><p>Remplace toutes les données de ce téléphone par celles du fichier.</p><label class="btn sec large" for="f-import">' + ICO.sauvegarde + 'Choisir le fichier de sauvegarde</label><input type="file" id="f-import" class="vh" accept=".json,application/json"></section>' +
      '<section class="carte"><h2>Effacer toutes les données</h2><p class="petit">Supprime tous les groupes de ce téléphone. Le pass reste actif.</p><button type="button" class="btn danger" data-action="tout-effacer">' + ICO.supprimer + 'Tout effacer</button></section>');
  }
  function exporterJSON() {
    var data = { application: 'teranga-partage-frais', format: 1, exporte: new Date().toISOString(), groupes: S.groupes, operations: S.operations, journal: S.journal };
    telecharger(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'teranga-partage-frais-sauvegarde-' + PF.dateISO() + '.json');
    S.sauvegarde = new Date().toISOString();
    DB.mettre('kv', S.sauvegarde, 'sauvegarde').then(function () { toast('Sauvegarde téléchargée.'); if (location.hash === '#/sauvegarde') vueSauvegarde(); });
  }
  function importerJSON(fichier) {
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var data;
      try { data = JSON.parse(lecteur.result); } catch (e) { return toast('Fichier illisible : ce n\'est pas une sauvegarde Teranga Partage Frais.'); }
      if (!data || data.application !== 'teranga-partage-frais' || !Array.isArray(data.groupes) || !Array.isArray(data.operations)) return toast('Ce fichier n\'est pas une sauvegarde Teranga Partage Frais.');
      confirmer('Remplacer toutes les données de ce téléphone par la sauvegarde du ' + PF.dateFr(String(data.exporte || '').slice(0, 10)) + ' (' + data.groupes.length + ' groupe' + (data.groupes.length > 1 ? 's' : '') + ', ' + data.operations.length + ' opérations) ?', 'Restaurer', true).then(function (oui) {
        if (!oui) return;
        DB.remplacer({ kv: {}, groupes: data.groupes, operations: data.operations, journal: data.journal || [] }, ['passes']).then(charger).then(function () { toast('Sauvegarde restaurée.'); aller('#/'); })
          .catch(function (e) { toast('Restauration impossible : ' + (e && e.message || e)); });
      });
    };
    lecteur.readAsText(fichier);
  }

  // ---------- Actions ----------
  var ACTIONS = {
    'retour': function (b) { if (pileNav > 0) history.back(); else location.hash = b.dataset.vers || '#/'; },
    'installer': function () { if (invite) { invite.prompt(); invite.userChoice.then(function () { invite = null; majInstall(); router(); }).catch(function () {}); } else feuille('Installer l\'application', instructionsInstall()); },
    'type': function (b) { E.g.type = b.dataset.v; E.sale = true; $$('#types .puce').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); },
    'membre-ajout': function () { ajouterMembre(); },
    'membre-retirer': function (b) {
      var id = b.dataset.id;
      if (!E.nouveau && membreUtilise(E.g.id, id)) return toast('Ce membre apparaît dans des dépenses ou remboursements : vous pouvez le renommer, pas le retirer.');
      E.g.membres = E.g.membres.filter(function (m) { return m.id !== id; }); E.sale = true; rendreMembres();
    },
    'membre-renommer': function (b) {
      var m = E.g.membres.filter(function (x) { return x.id === b.dataset.id; })[0]; if (!m) return;
      feuille('Changer le nom', '<form data-form="renommer"><div class="champ"><label for="c-renom">Nom</label><input id="c-renom" name="nom" maxlength="30" value="' + esc(m.nom) + '"><input type="hidden" name="id" value="' + esc(m.id) + '"></div><button type="submit" class="btn plein large">Valider</button></form>');
    },
    'groupe-suppr': function () {
      var g = groupe(E.g.id); if (!g) return;
      confirmer('Supprimer le groupe « ' + g.nom + ' », ses dépenses et son historique ? Faites d\'abord un PDF ou une sauvegarde si besoin.', 'Supprimer', true).then(function (oui) {
        if (!oui) return;
        var ops = [['-', 'groupes', g.id]];
        opsDe(g.id).forEach(function (o) { ops.push(['-', 'operations', o.id]); });
        journalDe(g.id).forEach(function (j) { ops.push(['-', 'journal', j.id]); });
        DB.lot(ops).then(function () {
          S.groupes = S.groupes.filter(function (x) { return x.id !== g.id; });
          S.operations = S.operations.filter(function (x) { return x.groupeId !== g.id; });
          S.journal = S.journal.filter(function (x) { return x.groupeId !== g.id; });
          E = null; toast('Groupe supprimé.'); location.replace('#/');
        });
      });
    },
    'pdf': function () { var g = groupe(location.hash.split('/')[2].split('?')[0]); if (g) creerPDF(g); },
    'paye': function (b) { marquerPaye(location.hash.split('/')[2].split('?')[0], b.dataset.de, b.dataset.a, +b.dataset.m); },
    'titre': function (b) { $('#c-titre').value = b.dataset.v; E.sale = true; },
    'payeur': function (b) { E.o.payeur = b.dataset.id; E.sale = true; $$('#payeurs .puce').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); majReste(); },
    'concerne': function (b) {
      var R = E.o.repartition, k = R.ids.indexOf(b.dataset.id);
      if (k >= 0) R.ids.splice(k, 1); else R.ids.push(b.dataset.id);
      E.sale = true; b.setAttribute('aria-pressed', String(k < 0)); rendreParts();
    },
    'tous': function () {
      var g = groupe(E.o.groupeId), R = E.o.repartition, tous = R.ids.length === g.membres.length;
      R.ids = tous ? [] : g.membres.map(function (m) { return m.id; });
      E.sale = true; $$('#concernes .puce').forEach(function (x) { x.setAttribute('aria-pressed', String(!tous)); }); rendreParts();
    },
    'mode': function (b) {
      var R = E.o.repartition;
      if (R.mode !== b.dataset.v) R.valeurs = {};
      R.mode = b.dataset.v; E.sale = true;
      $$('[data-action="mode"]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); rendreParts();
    },
    'part': function (b) {
      var R = E.o.repartition, id = b.dataset.id, v = +R.valeurs[id] || 0;
      R.valeurs[id] = Math.max(0, Math.min(99, v + (+b.dataset.d))); E.sale = true;
      var i = $('[data-valeur="' + id + '"]'); if (i) i.value = R.valeurs[id]; majReste();
    },
    'remb-membre': function (b) { E.o[b.dataset.cle] = b.dataset.id; E.sale = true; $$('#remb-' + b.dataset.cle + ' .puce').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); },
    'op-suppr': function () { var o = operation(E.o.id); if (o) supprimerOperation(o); },
    'exporter-json': function () { exporterJSON(); },
    'tout-effacer': function () {
      confirmer('Effacer définitivement tous les groupes de ce téléphone ? Faites d\'abord une sauvegarde.', 'Tout effacer', true).then(function (oui) {
        if (!oui) return;
        DB.toutEffacer(['passes']).then(charger).then(function () { toast('Données effacées.'); aller('#/'); });
      });
    }
  };
  var FORMULAIRES = {
    'groupe': function (form) { enregistrerGroupe(form); },
    'renommer': function (form) {
      var id = form.querySelector('[name=id]').value, n = form.querySelector('[name=nom]').value.trim().replace(/\s+/g, ' ').slice(0, 30);
      if (!n) return; if (!nomLibre(n, id)) { toast('« ' + n + ' » est déjà dans le groupe.'); return; }
      E.g.membres.forEach(function (m) { if (m.id === id) m.nom = n; }); E.sale = true; fermerFeuille(); rendreMembres();
    },
    'depense': function (form) { enregistrerDepense(form); },
    'remb': function (form) {
      var g = groupe(E.o.groupeId), q = E.o, err = $('#erreur-remb');
      q.montant = PF.lireEntier(form.querySelector('[name=montant]').value);
      q.date = /^\d{4}-\d{2}-\d{2}$/.test(form.querySelector('[name=date]').value) ? form.querySelector('[name=date]').value : PF.dateISO();
      var e = PF.verifierRemboursement(q, g.membres);
      if (e.length) { err.innerHTML = e.map(esc).join('<br>'); err.hidden = false; return; }
      var maint = new Date().toISOString(); if (E.nouveau) q.cree = maint; q.modifie = maint;
      var ancien = E.ancien;
      enregistrerRemboursement(q, ancien).then(function () { E = null; toast('Remboursement noté.'); location.replace('#/g/' + g.id + '?t=soldes'); });
    },
    'paye-rapide': function (form) {
      var gid = form.querySelector('[name=g]').value, g = groupe(gid), err = $('#erreur-paye');
      var r = { id: PF.nouvelId(), groupeId: gid, type: 'remboursement', de: form.querySelector('[name=de]').value, a: form.querySelector('[name=a]').value, montant: PF.lireEntier($('#c-montant-paye').value), date: PF.dateISO(), cree: new Date().toISOString() };
      r.modifie = r.cree;
      var e = PF.verifierRemboursement(r, g.membres);
      if (e.length) { err.textContent = e.join(' '); err.hidden = false; return; }
      enregistrerRemboursement(r, null).then(function () { fermerFeuille(); toast('Remboursement noté. Soldes mis à jour.'); vueGroupe(gid, new URLSearchParams('t=soldes')); });
    },
    'pass': function (form) { activer(form.querySelector('[name=code]').value); }
  };
  function brancher() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]'); if (!b || b.disabled) return;
      var a = ACTIONS[b.dataset.action]; if (a) { e.preventDefault(); a(b); }
    });
    document.addEventListener('submit', function (e) {
      var fo = e.target.closest('form[data-form]'); if (!fo) return;
      e.preventDefault(); var h = FORMULAIRES[fo.dataset.form]; if (h) h(fo);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && feuilleOuverte) fermerFeuille();
      if (e.key === 'Enter' && e.target.id === 'c-membre') { e.preventDefault(); ajouterMembre(); }
    });
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (E && t.closest && t.closest('form#form-groupe, form#form-depense, form#form-remb')) E.sale = true;
      if (t.id === 'c-montant' && $('#form-depense')) rendrePartsMontant();
      if (t.id === 'c-montant' && $('#form-remb')) { var n = PF.lireEntier(t.value); $('#total-remb').textContent = f(n > 0 ? n : 0); }
      if (t.dataset && t.dataset.valeur && E && E.o) { E.o.repartition.valeurs[t.dataset.valeur] = PF.lireEntier(t.value); majReste(); }
    });
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'f-import' && t.files[0]) { importerJSON(t.files[0]); t.value = ''; }
      if ((t.id === 'c-montant' || t.id === 'c-montant-paye' || (t.dataset && t.dataset.valeur && E && E.o && E.o.repartition.mode === 'montants')) && t.value) { var n = PF.lireEntier(t.value); if (n > 0) t.value = PF.formatNombre(n); }
    });
    $('#retour').addEventListener('click', function () { ACTIONS.retour(this); });
    $('#fab').addEventListener('click', function () { aller(this.dataset.vers || '#/'); });
    $('#installer').addEventListener('click', function () { ACTIONS.installer(); });
    window.addEventListener('hashchange', function () { pileNav++; router(); });
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; majInstall(); });
    window.addEventListener('appinstalled', function () { invite = null; majInstall(); toast('Application installée.'); });
    window.addEventListener('beforeunload', function (e) { if (E && E.sale) { e.preventDefault(); e.returnValue = ''; } });
  }
  // Montant changé : en mode « parts égales » ou « parts », on recalcule sans redessiner les champs
  function rendrePartsMontant() {
    E.o.montant = PF.lireEntier($('#c-montant').value);
    var M = E.o.montant > 0 ? E.o.montant : 0;
    $('#total-depense').textContent = f(M);
    majReste();
  }
  var majDemandee = false;
  function serviceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      var proposer = function () { toast('Nouvelle version de l\'application disponible.', { label: 'Mettre à jour', fn: function () { majDemandee = true; if (reg.waiting) reg.waiting.postMessage('maj'); } }); };
      if (reg.waiting && navigator.serviceWorker.controller) proposer();
      reg.addEventListener('updatefound', function () { var w = reg.installing; if (w) w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) proposer(); }); });
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (majDemandee) { majDemandee = false; location.reload(); } });
  }
  function demarrer() {
    appliquerTheme(lireTheme());
    brancher();
    var p = new URLSearchParams(location.search);
    if (p.get('o') && p.get('t')) history.replaceState(null, '', location.pathname + '#/pass?code=' + encodeURIComponent('?o=' + p.get('o') + '&t=' + p.get('t')));
    charger().then(router).catch(function (e) {
      vue('<section class="carte"><h1>Stockage indisponible</h1><p>' + esc(e && e.message || e) + '</p><p>Sur iPhone, quittez la navigation privée. Sinon, mettez à jour votre navigateur.</p></section>');
    });
    serviceWorker();
  }
  window.PFApp = { etat: S, version: VERSION };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
