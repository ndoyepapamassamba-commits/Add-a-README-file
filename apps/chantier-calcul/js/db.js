/* Calcul Chantier — stockage sur le téléphone (IndexedDB). Rien n'est envoyé sur Internet. */
(function () {
  'use strict';
  var NOM = 'calcul-chantier', VERSION = 1, MAGASINS = ['projets', 'elements', 'depenses'];
  var ouverture = null, memoire = null;

  function ouvrir() {
    if (ouverture) return ouverture;
    ouverture = new Promise(function (ok, ko) {
      var idb;
      try { idb = window.indexedDB; } catch (e) { idb = null; }
      if (!idb) return ko(new Error('indisponible'));
      var r;
      try { r = idb.open(NOM, VERSION); } catch (e) { return ko(e); }
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        MAGASINS.forEach(function (m) { if (!db.objectStoreNames.contains(m)) db.createObjectStore(m, { keyPath: 'id' }); });
      };
      r.onsuccess = function () {
        var db = r.result;
        db.onversionchange = function () { db.close(); ouverture = null; };
        ok(db);
      };
      r.onerror = function () { ko(r.error || new Error('Ouverture du stockage impossible.')); };
      r.onblocked = function () { ko(new Error('Fermez les autres onglets de Calcul Chantier puis réessayez.')); };
    }).catch(function () {
      // Navigateur sans stockage (ancienne navigation privée) : données gardées le temps de la visite
      memoire = memoire || { kv: {}, projets: {}, elements: {}, depenses: {} };
      DB.temporaire = true;
      return null;
    });
    return ouverture;
  }
  function copie(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function tx(noms, mode, fn) {
    return ouvrir().then(function (db) {
      if (!db) return fn(null);
      return new Promise(function (ok, ko) {
        var t = db.transaction(noms, mode), res, m = {};
        [].concat(noms).forEach(function (k) { m[k] = t.objectStore(k); });
        t.oncomplete = function () { ok(res && res.__req ? res.__req.result : res); };
        t.onerror = function () { ko(t.error); };
        t.onabort = function () { ko(t.error || new Error('Enregistrement impossible (mémoire du téléphone pleine ?).')); };
        res = fn(m);
      });
    });
  }
  function req(r) { return { __req: r }; }

  var DB = {
    temporaire: false,
    lire: function (cle) { return tx('kv', 'readonly', function (m) { return !m ? copie(memoire.kv[cle]) : req(m.kv.get(cle)); }); },
    ecrire: function (cle, val) { return tx('kv', 'readwrite', function (m) { if (!m) memoire.kv[cle] = copie(val); else m.kv.put(val, cle); }); },
    tout: function (magasin) {
      return tx(magasin, 'readonly', function (m) {
        return !m ? Object.keys(memoire[magasin]).map(function (k) { return copie(memoire[magasin][k]); }) : req(m[magasin].getAll());
      });
    },
    mettre: function (magasin, objet) {
      return tx(magasin, 'readwrite', function (m) { if (!m) memoire[magasin][objet.id] = copie(objet); else m[magasin].put(objet); });
    },
    // Plusieurs écritures d'un coup : [magasin, objet] ou ['-', magasin, id] ; ['kv', valeur, cle]
    lot: function (ops) {
      var noms = [];
      ops.forEach(function (o) { var n = o[0] === '-' ? o[1] : o[0]; if (noms.indexOf(n) < 0) noms.push(n); });
      return tx(noms, 'readwrite', function (m) {
        ops.forEach(function (o) {
          if (!m) {
            if (o[0] === '-') delete memoire[o[1]][o[2]];
            else if (o[0] === 'kv') memoire.kv[o[2]] = copie(o[1]);
            else memoire[o[0]][o[1].id] = copie(o[1]);
            return;
          }
          if (o[0] === '-') m[o[1]].delete(o[2]);
          else if (o[0] === 'kv') m.kv.put(o[1], o[2]);
          else m[o[0]].put(o[1]);
        });
      });
    },
    // Restauration : remplace les fiches et les réglages (sauf les clés kv « garder ») en une seule transaction
    remplacer: function (donnees, garder) {
      return tx(['kv'].concat(MAGASINS), 'readwrite', function (m) {
        if (!m) {
          MAGASINS.forEach(function (n) { memoire[n] = {}; (donnees[n] || []).forEach(function (x) { memoire[n][x.id] = copie(x); }); });
          Object.keys(donnees.kv || {}).forEach(function (k) { if ((garder || []).indexOf(k) < 0) memoire.kv[k] = copie(donnees.kv[k]); });
          return;
        }
        MAGASINS.forEach(function (n) { m[n].clear(); (donnees[n] || []).forEach(function (x) { m[n].put(x); }); });
        Object.keys(donnees.kv || {}).forEach(function (k) { if ((garder || []).indexOf(k) < 0) m.kv.put(donnees.kv[k], k); });
      });
    }
  };
  window.DB = DB;
})();
