/* Teranga Factures — stockage local (IndexedDB). Rien ne quitte le téléphone. */
(function () {
  'use strict';
  var NOM = 'teranga-factures', VERSION = 1, MAGASINS = ['clients', 'articles', 'documents'];
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

  // Exécute fn(magasins) dans une transaction ; résout quand la transaction est terminée (écriture durable).
  function transaction(noms, mode, fn) {
    return ouvrir().then(function (db) {
      return new Promise(function (ok, ko) {
        var tx = db.transaction(noms, mode), res;
        var m = {};
        [].concat(noms).forEach(function (n) { m[n] = tx.objectStore(n); });
        tx.oncomplete = function () { ok(res); };
        tx.onerror = function () { ko(tx.error); };
        tx.onabort = function () { ko(tx.error || new Error('Opération annulée.')); };
        res = fn(m);
      });
    });
  }
  function requete(r) {
    return new Promise(function (ok, ko) { r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ko(r.error); }; });
  }

  window.DB = {
    lire: function (magasin, cle) {
      return ouvrir().then(function (db) { return requete(db.transaction(magasin).objectStore(magasin).get(cle)); });
    },
    tout: function (magasin) {
      return ouvrir().then(function (db) { return requete(db.transaction(magasin).objectStore(magasin).getAll()); });
    },
    mettre: function (magasin, valeur, cle) {
      return transaction(magasin, 'readwrite', function (m) { cle === undefined ? m[magasin].put(valeur) : m[magasin].put(valeur, cle); });
    },
    effacer: function (magasin, cle) {
      return transaction(magasin, 'readwrite', function (m) { m[magasin].delete(cle); });
    },
    // Plusieurs écritures d'un coup : [[magasin, valeur, cle?], ['-', magasin, cle] pour effacer]
    lot: function (ops) {
      var noms = [];
      ops.forEach(function (o) { var n = o[0] === '-' ? o[1] : o[0]; if (noms.indexOf(n) < 0) noms.push(n); });
      return transaction(noms, 'readwrite', function (m) {
        ops.forEach(function (o) {
          if (o[0] === '-') m[o[1]].delete(o[2]);
          else if (o[2] === undefined) m[o[0]].put(o[1]);
          else m[o[0]].put(o[1], o[2]);
        });
      });
    },
    // Restauration : remplace tout (sauf les clés kv conservées) dans une seule transaction
    remplacer: function (donnees, kvConserves) {
      return transaction(['kv'].concat(MAGASINS), 'readwrite', function (m) {
        MAGASINS.forEach(function (n) { m[n].clear(); (donnees[n] || []).forEach(function (x) { m[n].put(x); }); });
        Object.keys(donnees.kv || {}).forEach(function (k) { if ((kvConserves || []).indexOf(k) < 0) m.kv.put(donnees.kv[k], k); });
      });
    },
    toutEffacer: function () {
      return transaction(['kv'].concat(MAGASINS), 'readwrite', function (m) {
        m.kv.clear(); MAGASINS.forEach(function (n) { m[n].clear(); });
      });
    }
  };
})();
