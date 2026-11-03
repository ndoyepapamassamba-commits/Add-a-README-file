/* Teranga Partage Frais — stockage local (IndexedDB). Les données restent sur le téléphone. */
(function () {
  'use strict';
  var NOM = 'teranga-partage-frais', VERSION = 1, MAGASINS = ['groupes', 'operations', 'journal'];
  var ouverture = null;

  function ouvrir() {
    if (ouverture) return ouverture;
    ouverture = new Promise(function (ok, ko) {
      if (!window.indexedDB) return ko(new Error('Stockage indisponible sur ce navigateur.'));
      var r = indexedDB.open(NOM, VERSION);
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
      r.onerror = function () { ouverture = null; ko(r.error || new Error('Ouverture du stockage impossible.')); };
      r.onblocked = function () { ko(new Error('Fermez les autres onglets de l\'application puis réessayez.')); };
    });
    return ouverture;
  }
  function transaction(noms, mode, fn) {
    return ouvrir().then(function (db) {
      return new Promise(function (ok, ko) {
        var tx = db.transaction(noms, mode), res, m = {};
        [].concat(noms).forEach(function (n) { m[n] = tx.objectStore(n); });
        tx.oncomplete = function () { ok(res); };
        tx.onerror = function () { ko(tx.error); };
        tx.onabort = function () { ko(tx.error || new Error('Opération annulée (mémoire du téléphone pleine ?).')); };
        res = fn(m);
      });
    });
  }
  function requete(r) {
    return new Promise(function (ok, ko) { r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ko(r.error); }; });
  }

  window.DB = {
    MAGASINS: MAGASINS,
    lire: function (magasin, cle) {
      return ouvrir().then(function (db) { return requete(db.transaction(magasin).objectStore(magasin).get(cle)); });
    },
    tout: function (magasin) {
      return ouvrir().then(function (db) { return requete(db.transaction(magasin).objectStore(magasin).getAll()); });
    },
    mettre: function (magasin, valeur, cle) {
      return transaction(magasin, 'readwrite', function (m) { if (cle === undefined) m[magasin].put(valeur); else m[magasin].put(valeur, cle); });
    },
    effacer: function (magasin, cle) {
      return transaction(magasin, 'readwrite', function (m) { m[magasin].delete(cle); });
    },
    // Plusieurs écritures dans une seule transaction : [[magasin, valeur, cle?], ['-', magasin, cle]]
    lot: function (ops) {
      var noms = [];
      ops.forEach(function (o) { var n = o[0] === '-' ? o[1] : o[0]; if (noms.indexOf(n) < 0) noms.push(n); });
      if (!noms.length) return Promise.resolve();
      return transaction(noms, 'readwrite', function (m) {
        ops.forEach(function (o) {
          if (o[0] === '-') m[o[1]].delete(o[2]);
          else if (o[2] === undefined) m[o[0]].put(o[1]);
          else m[o[0]].put(o[1], o[2]);
        });
      });
    },
    remplacer: function (donnees, kvConserves) {
      return transaction(['kv'].concat(MAGASINS), 'readwrite', function (m) {
        var garder = kvConserves || [];
        MAGASINS.forEach(function (n) { m[n].clear(); (donnees[n] || []).forEach(function (x) { m[n].put(x); }); });
        Object.keys(donnees.kv || {}).forEach(function (k) { if (garder.indexOf(k) < 0) m.kv.put(donnees.kv[k], k); });
      });
    },
    toutEffacer: function (kvConserves) {
      return ouvrir().then(function (db) {
        return requete(db.transaction('kv').objectStore('kv').getAllKeys());
      }).then(function (cles) {
        return transaction(['kv'].concat(MAGASINS), 'readwrite', function (m) {
          cles.forEach(function (k) { if ((kvConserves || []).indexOf(k) < 0) m.kv.delete(k); });
          MAGASINS.forEach(function (n) { m[n].clear(); });
        });
      });
    }
  };
})();
