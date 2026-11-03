/* Chantier Clair — échanges avec le serveur et file d'attente hors ligne.
   Sans réseau, chaque action (avancement, dépense, photo…) est gardée sur le téléphone puis envoyée dans l'ordre dès le
   retour du réseau. Une action refusée par le serveur bloque les suivantes du même chantier jusqu'à correction ou retrait. */
(function (racine) {
  'use strict';
  var NOYAU = racine.CC, DB = racine.DB;
  var API = NOYAU.API;
  var ecouteurs = [], enCours = null, minuterie = null;

  function ErreurReseau() { var e = new Error('reseau'); e.reseau = true; return e; }
  function appel(methode, chemin, corps, delai) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var tm = ctl ? setTimeout(function () { ctl.abort(); }, delai || 25000) : null;
    var init = { method: methode, cache: 'no-store', credentials: 'omit', signal: ctl ? ctl.signal : undefined };
    if (corps !== undefined) { init.headers = { 'content-type': 'application/json' }; init.body = JSON.stringify(corps); }
    return fetch(API + chemin, init).then(function (r) {
      clearTimeout(tm);
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        return { status: r.status, ok: r.ok, json: j || {} };
      });
    }, function () { clearTimeout(tm); throw ErreurReseau(); });
  }
  var R = {
    creer: function (corps) { return appel('POST', '/creer', corps); },
    lire: function (id, jeton) { return appel('GET', '/' + id + '?t=' + encodeURIComponent(jeton)); },
    evenement: function (id, corps) { return appel('POST', '/' + id + '/evenement', corps); },
    photo: function (id, corps) { return appel('POST', '/' + id + '/photo', corps, 60000); },
    pass: function (pass) { return appel('POST', '/pass', { app: NOYAU.APP, pass: pass }); },
    urlPhoto: function (id, nom, jeton) { return API + '/' + id + '/photos/' + nom + '?t=' + encodeURIComponent(jeton); },
    // Commande de la boutique (date de paiement, pour la date de fin du pass)
    commande: function (o, t) {
      return fetch(API.replace(/\/dossiers$/, '/boutique') + '/commandes/' + encodeURIComponent(o) + '?t=' + encodeURIComponent(t), { cache: 'no-store', credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    },

    // ---------- File d'attente ----------
    // item : { dossier, jeton, role, type ('photo' = photo seule), donnees, maj?, photo?, legende?, creeLe, etat }
    ajouter: function (item) {
      item.creeLe = item.creeLe || Date.now();
      item.etat = 'attente';
      return DB.mettre('file', item).then(function (n) { item.n = n; prevenir(); return item; });
    },
    liste: function () { return DB.tout('file').then(function (l) { return (l || []).sort(function (a, b) { return a.n - b.n; }); }); },
    retirer: function (n) { return DB.effacer('file', n).then(prevenir); },
    reessayer: function (n) {
      return DB.lire('file', n).then(function (it) {
        if (!it) return null;
        it.etat = 'attente'; it.message = '';
        return DB.mettre('file', it).then(function () { prevenir(); return it; });
      });
    },
    // Envoie tout ce qui peut l'être, dans l'ordre. → { envoyes, refuses, hors_ligne }
    vider: function () {
      if (enCours) return enCours.then(function () { return R.vider(); });
      var bilan = { envoyes: [], refuses: [], hors_ligne: false };
      enCours = R.liste().then(function (items) {
        var bloques = {}, i = 0;
        function suivant() {
          if (i >= items.length) return bilan;
          var it = items[i++];
          if (it.etat !== 'attente' || bloques[it.dossier]) { bloques[it.dossier] = true; return suivant(); }
          return envoyer(it).then(function (res) {
            if (res === 'ok') { bilan.envoyes.push(it); return DB.effacer('file', it.n).then(suivant); }
            if (res === 'plus_tard') { bilan.hors_ligne = true; return bilan; }
            bloques[it.dossier] = true; bilan.refuses.push(it);
            return DB.mettre('file', it).then(suivant);
          });
        }
        return suivant();
      }).then(function (b) { enCours = null; if (b.envoyes.length || b.refuses.length) prevenir(b); planifier(b.hors_ligne); return b; },
        function (e) { enCours = null; planifier(true); throw e; });
      return enCours;
    },
    ecouter: function (f) { ecouteurs.push(f); }
  };

  function envoyer(it) {
    var p = Promise.resolve({ ok: true });
    if (it.type !== 'photo' && !it.evenementEnvoye) {
      var donnees = Object.assign({}, it.donnees || {});
      // Action faite sans réseau : l'heure du téléphone est gardée à côté de l'heure du serveur
      if (Date.now() - it.creeLe > 120000) { donnees.fait_le = new Date(it.creeLe).toISOString(); donnees.envoi_differe = true; }
      var corps = { t: it.jeton, type: it.type, donnees: donnees };
      if (it.maj) corps.maj = it.maj;
      p = R.evenement(it.dossier, corps).then(function (r) {
        if (r.ok) { it.evenementEnvoye = true; it.empreinte = r.json.empreinte; return it.photo ? DB.mettre('file', it).then(function () { return r; }) : r; }
        return r;
      });
    }
    return p.then(function (r) {
      if (!r.ok) return juger(it, r);
      if (!it.photo) return 'ok';
      return R.photo(it.dossier, { t: it.jeton, photo: it.photo, legende: it.legende || '' }).then(function (rp) { return rp.ok ? 'ok' : juger(it, rp); });
    }).catch(function (e) { if (e && e.reseau) return 'plus_tard'; throw e; });
  }
  function juger(it, r) {
    if (r.status >= 500 || r.status === 429 || r.status === 408 || r.status === 0) return 'plus_tard';
    it.etat = 'erreur';
    it.message = (r.json && r.json.message) || 'Action refusée par le serveur.';
    return 'refuse';
  }
  function prevenir(b) { ecouteurs.forEach(function (f) { try { f(b); } catch (e) { /* écran */ } }); }
  function planifier(horsLigne) {
    clearTimeout(minuterie);
    R.liste().then(function (l) {
      if (l.some(function (it) { return it.etat === 'attente'; })) minuterie = setTimeout(function () { R.vider().catch(function () {}); }, horsLigne ? 15000 : 3000);
    });
  }
  if (racine.addEventListener) {
    racine.addEventListener('online', function () { R.vider().catch(function () {}); });
    if (racine.document) racine.document.addEventListener('visibilitychange', function () { if (!racine.document.hidden) R.vider().catch(function () {}); });
  }
  racine.RES = R;
})(typeof self !== 'undefined' ? self : this);
